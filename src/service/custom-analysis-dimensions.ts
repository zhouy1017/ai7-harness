import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS,
  MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN,
  isCustomAnalysisDimensionId,
  type CustomAnalysisDimensionDocument,
  type CustomAnalysisDimensionState,
} from '../shared/protocol.js';
import { canonicalRecord, isRecord, parseCanonicalJson } from './analysis/canonical.js';
import {
  CustomAnalysisDocumentError,
  customAnalysisDimensionDocument,
  customAnalysisDocumentDigest,
  parseCustomAnalysisDimensionDocument,
} from './analysis/custom-analysis-contract.js';
import type { CustomAnalysisVersionInput } from './analysis/custom-analysis-kind.js';
import { CUSTOM_ANALYSIS_SCHEMA_VERSION } from './task-authorization.js';

/**
 * 自定义分析维度 (Issue #922, wave 10 slice 7f; ADR 0090 item 4): the house's Custom Analysis Dimensions, written in 知识库 ›
 * 工序与规则. A dimension is an AI7-owned document `ai7.custom-analysis-dimension/1`, versioned and digest-pinned; it is not a DSH
 * Skill. Nothing here calls a model, prepares a Task or reads manuscript text: the store checks a template against the Books'
 * text before it records one, and a Run of a version is prepared through ②A like any other kind.
 *
 * Schema revision 82 owns three append-only relations, each row carrying canonical JSON and its digest:
 * - `custom_analysis_dimensions`: one stable identity per dimension; its kind is `custom-analysis/<dimension_id>`.
 * - `custom_analysis_dimension_versions`: each immutable version — the document and its digest, and the version it supersedes.
 * - `custom_analysis_dimension_states`: `待验证` when saved, then `已启用` after 验证并启用, or `已停用` — final for the version.
 *   A Task names the exact version it was prepared under through its frozen contract, so a later version or a 停用 never moves it.
 */
export const CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL = {
  custom_analysis_dimensions: `CREATE TABLE custom_analysis_dimensions (
  dimension_id TEXT PRIMARY KEY CHECK(length(dimension_id) = 36),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  custom_analysis_dimension_versions: `CREATE TABLE custom_analysis_dimension_versions (
  version_id TEXT PRIMARY KEY CHECK(length(version_id) = 36),
  dimension_id TEXT NOT NULL REFERENCES custom_analysis_dimensions(dimension_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  document_json TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64),
  supersedes_version_id TEXT CHECK(supersedes_version_id IS NULL OR length(supersedes_version_id) = 36),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((version = 1) = (supersedes_version_id IS NULL)),
  UNIQUE(dimension_id, version)
) STRICT`,
  custom_analysis_dimension_states: `CREATE TABLE custom_analysis_dimension_states (
  version_id TEXT NOT NULL REFERENCES custom_analysis_dimension_versions(version_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('pending-validation', 'enabled', 'stopped')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((sequence = 1) = (state = 'pending-validation')),
  PRIMARY KEY(version_id, sequence)
) STRICT`,
} as const;

/** Every relation is a ledger; a stopped version takes no further state, whoever writes it. */
export const CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((op) => [
      `${table}_no_${op}`, `CREATE TRIGGER ${table}_no_${op} BEFORE ${op.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'CUSTOM_ANALYSIS_DIMENSION_IMMUTABLE'); END`,
    ])),
  ),
  custom_analysis_dimension_states_after_stopped: `CREATE TRIGGER custom_analysis_dimension_states_after_stopped
    BEFORE INSERT ON custom_analysis_dimension_states
    WHEN EXISTS (SELECT 1 FROM custom_analysis_dimension_states s WHERE s.version_id = NEW.version_id AND s.state = 'stopped')
    BEGIN SELECT RAISE(ABORT, 'CUSTOM_ANALYSIS_DIMENSION_STOPPED'); END`,
};

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const CUSTOM_ANALYSIS_DIMENSION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  custom_analysis_dimension_versions: ['dimension_id>custom_analysis_dimensions.dimension_id:NO ACTION/NO ACTION/NONE'],
  custom_analysis_dimension_states: ['version_id>custom_analysis_dimension_versions.version_id:NO ACTION/NO ACTION/NONE'],
};

/** Revision 82's relations, created once before the version is stamped: an older store gains them empty and nothing moves. */
export function initializeCustomAnalysisDimensionSchema(db: DatabaseSync, version: number): void {
  if (version >= CUSTOM_ANALYSIS_SCHEMA_VERSION || Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL).some((name) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name) !== undefined)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Custom analysis dimension schema rollback failed.');
    }
    throw error;
  }
}

export class CustomAnalysisDimensionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CustomAnalysisDimensionError';
  }
}

export function requireDimension(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new CustomAnalysisDimensionError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

function text(value: SQLOutputValue | undefined): string {
  requireDimension(typeof value === 'string', 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度记录无效。');
  return value;
}

function count(value: SQLOutputValue | undefined): number {
  const number = typeof value === 'bigint' ? Number(value) : value;
  requireDimension(typeof number === 'number' && Number.isSafeInteger(number), 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度记录无效。');
  return number;
}

/** A row's canonical JSON is exactly the record its digest covers; anything else is not a row AI7 wrote. */
function verifiedRecord(row: SqlRow): Record<string, unknown> {
  const json = text(row.canonical_json);
  const record = canonicalRecord(parseCanonicalJson(json));
  requireDimension(record.json === json && record.digest === row.sha256, 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度记录与摘要不一致。');
  const parsed = parseCanonicalJson(json);
  requireDimension(isRecord(parsed), 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度记录无效。');
  return parsed;
}

/** One version as the ledger keeps it: its document, digest and lineage, and the state it reads now. */
export interface CustomAnalysisDimensionVersionRecord {
  readonly dimensionId: string;
  readonly versionId: string;
  readonly version: number;
  readonly document: CustomAnalysisDimensionDocument;
  readonly documentDigest: string;
  readonly supersedes: null | { versionId: string; version: number };
  readonly createdAt: string;
  readonly state: CustomAnalysisDimensionState;
  readonly stateRecordedAt: string;
}

export interface CustomAnalysisDimensionRecord {
  readonly dimensionId: string;
  readonly createdAt: string;
  /** Newest first. */
  readonly versions: ReadonlyArray<CustomAnalysisDimensionVersionRecord>;
}

/** The kind definition's input for one version: its identity, digest and question, and the title its Tasks are named by. */
export function customAnalysisVersionInput(record: CustomAnalysisDimensionVersionRecord): CustomAnalysisVersionInput {
  return {
    dimensionId: record.dimensionId,
    versionId: record.versionId,
    version: record.version,
    documentDigest: record.documentDigest,
    questionTemplate: record.document.questionTemplate,
    title: record.document.title,
  };
}

export class CustomAnalysisDimensions {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** The house's dimensions, newest first; at most `MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN`, the rest counted as truncated. */
  list(): { dimensions: ReadonlyArray<CustomAnalysisDimensionRecord>; truncated: boolean } {
    const rows = this.#db.prepare('SELECT * FROM custom_analysis_dimensions ORDER BY rowid DESC LIMIT ?').all(MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN + 1) as SqlRow[];
    return { dimensions: rows.slice(0, MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN).map((row) => this.#dimension(row)), truncated: rows.length > MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN };
  }

  dimension(dimensionId: string): CustomAnalysisDimensionRecord | null {
    if (!isCustomAnalysisDimensionId(dimensionId)) return null;
    const row = this.#db.prepare('SELECT * FROM custom_analysis_dimensions WHERE dimension_id = ?').get(dimensionId) as SqlRow | undefined;
    return row === undefined ? null : this.#dimension(row);
  }

  version(versionId: string): CustomAnalysisDimensionVersionRecord | null {
    if (!isCustomAnalysisDimensionId(versionId)) return null;
    const row = this.#db.prepare('SELECT * FROM custom_analysis_dimension_versions WHERE version_id = ?').get(versionId) as SqlRow | undefined;
    return row === undefined ? null : this.#version(row);
  }

  /** The newest version reading `已启用`: what a new Run of the dimension is prepared under; `null` while none is. */
  enabledVersion(dimensionId: string): CustomAnalysisDimensionVersionRecord | null {
    return this.dimension(dimensionId)?.versions.find((version) => version.state === 'enabled') ?? null;
  }

  #dimension(row: SqlRow): CustomAnalysisDimensionRecord {
    const record = verifiedRecord(row);
    const dimensionId = text(row.dimension_id);
    requireDimension(record.dimensionId === dimensionId && record.createdAt === row.created_at, 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度记录无效。');
    const versions = (this.#db.prepare('SELECT * FROM custom_analysis_dimension_versions WHERE dimension_id = ? ORDER BY version DESC')
      .all(dimensionId) as SqlRow[]).map((version) => this.#version(version));
    requireDimension(versions.length >= 1 && versions.every((version, index) => version.version === versions.length - index),
      'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度的版本不连续。');
    return { dimensionId, createdAt: text(row.created_at), versions };
  }

  #version(row: SqlRow): CustomAnalysisDimensionVersionRecord {
    const record = verifiedRecord(row);
    const versionId = text(row.version_id);
    const documentJson = text(row.document_json);
    let document: CustomAnalysisDimensionDocument;
    try {
      document = parseCustomAnalysisDimensionDocument(parseCanonicalJson(documentJson));
    } catch (error) {
      if (error instanceof CustomAnalysisDocumentError) throw new CustomAnalysisDimensionError('CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度文档无效。');
      throw error;
    }
    const digest = customAnalysisDocumentDigest(document);
    const supersedesId = row.supersedes_version_id === null ? null : text(row.supersedes_version_id);
    requireDimension(canonicalRecord(document).json === documentJson && digest === row.document_sha256 &&
      record.versionId === versionId && record.dimensionId === row.dimension_id && record.version === count(row.version) &&
      record.documentDigest === digest && (record.supersedes ?? null) === supersedesId && record.createdAt === row.created_at,
    'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度版本与摘要不一致。');
    const supersedes = supersedesId === null ? null : (() => {
      const previous = this.#db.prepare('SELECT version FROM custom_analysis_dimension_versions WHERE version_id = ? AND dimension_id = ?')
        .get(supersedesId, text(row.dimension_id)) as SqlRow | undefined;
      requireDimension(previous !== undefined && count(previous.version) === count(row.version) - 1, 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度的版本链无效。');
      return { versionId: supersedesId, version: count(previous.version) };
    })();
    const states = this.#db.prepare('SELECT * FROM custom_analysis_dimension_states WHERE version_id = ? ORDER BY sequence').all(versionId) as SqlRow[];
    requireDimension(states.length >= 1 && states.every((state, index) => count(state.sequence) === index + 1), 'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度状态记录无效。');
    for (const state of states) {
      const stateRecord = verifiedRecord(state);
      requireDimension(stateRecord.versionId === versionId && stateRecord.state === state.state && stateRecord.recordedAt === state.recorded_at,
        'CUSTOM_ANALYSIS_DIMENSION_RECORD_INVALID', '自定义分析维度状态记录无效。');
    }
    const latest = states.at(-1)!;
    return {
      dimensionId: text(row.dimension_id),
      versionId,
      version: count(row.version),
      document,
      documentDigest: digest,
      supersedes,
      createdAt: text(row.created_at),
      state: text(latest.state) as CustomAnalysisDimensionState,
      stateRecordedAt: text(latest.recorded_at),
    };
  }

  /**
   * 保存: version 1 of a new dimension, or the next version of `dimensionId` superseding its latest — always `待验证`. The texts are
   * refused with the rule they break; whether they echo a Book's manuscript is the store's to check before this is called.
   */
  save(input: { dimensionId: string | null; title: string; questionTemplate: string }, now: string): CustomAnalysisDimensionVersionRecord {
    let document: CustomAnalysisDimensionDocument;
    try {
      document = customAnalysisDimensionDocument(input.title, input.questionTemplate);
    } catch (error) {
      if (error instanceof CustomAnalysisDocumentError) throw new CustomAnalysisDimensionError(error.code, error.message);
      throw error;
    }
    const existing = input.dimensionId === null ? null : this.dimension(input.dimensionId);
    requireDimension(input.dimensionId === null || existing !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度不存在。');
    const latest = existing?.versions[0] ?? null;
    const documentDigest = customAnalysisDocumentDigest(document);
    requireDimension(latest === null || latest.documentDigest !== documentDigest, 'CUSTOM_ANALYSIS_DIMENSION_UNCHANGED', '名称与提问模板都没有改动，没有保存新版本。');
    const dimensionId = existing?.dimensionId ?? randomUUID();
    const versionId = randomUUID();
    const version = (latest?.version ?? 0) + 1;
    const supersedes = latest?.versionId ?? null;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      if (existing === null) {
        const dimension = canonicalRecord({ dimensionId, createdAt: now });
        this.#db.prepare('INSERT INTO custom_analysis_dimensions(dimension_id, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?)')
          .run(dimensionId, now, dimension.json, dimension.digest);
      }
      const documentRecord = canonicalRecord(document);
      const versionRecord = canonicalRecord({ versionId, dimensionId, version, documentDigest, supersedes, createdAt: now });
      this.#db.prepare(`INSERT INTO custom_analysis_dimension_versions(version_id, dimension_id, version, document_json, document_sha256,
        supersedes_version_id, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(versionId, dimensionId, version, documentRecord.json, documentDigest, supersedes, now, versionRecord.json, versionRecord.digest);
      this.#recordState(versionId, 1, 'pending-validation', now);
      this.#db.exec('COMMIT');
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Custom analysis dimension save rollback failed.');
      }
      throw error;
    }
    return this.version(versionId)!;
  }

  /** 验证并启用's record: a `待验证` version becomes `已启用`. The validation itself is the store's, made just before. */
  enable(versionId: string, now: string): CustomAnalysisDimensionVersionRecord {
    const version = this.version(versionId);
    requireDimension(version !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度版本不存在。');
    requireDimension(version.state !== 'stopped', 'CUSTOM_ANALYSIS_DIMENSION_STOPPED', `第 ${version.version} 版已停用，不能再启用；请保存一个新版本。`);
    requireDimension(version.state === 'pending-validation', 'CUSTOM_ANALYSIS_DIMENSION_ENABLED', `第 ${version.version} 版已经启用。`);
    this.#recordState(versionId, this.#nextSequence(versionId), 'enabled', now);
    return this.version(versionId)!;
  }

  /** 停用: final for the version. Runs prepared under it keep naming it; a new Run can no longer be prepared under it. */
  stop(versionId: string, now: string): CustomAnalysisDimensionVersionRecord {
    const version = this.version(versionId);
    requireDimension(version !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度版本不存在。');
    requireDimension(version.state !== 'stopped', 'CUSTOM_ANALYSIS_DIMENSION_STOPPED', `第 ${version.version} 版已经停用。`);
    this.#recordState(versionId, this.#nextSequence(versionId), 'stopped', now);
    return this.version(versionId)!;
  }

  #nextSequence(versionId: string): number {
    return count((this.#db.prepare('SELECT max(sequence) AS latest FROM custom_analysis_dimension_states WHERE version_id = ?').get(versionId) as SqlRow).latest) + 1;
  }

  #recordState(versionId: string, sequence: number, state: CustomAnalysisDimensionState, now: string): void {
    const record = canonicalRecord({ versionId, sequence, state, recordedAt: now });
    this.#db.prepare('INSERT INTO custom_analysis_dimension_states(version_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(versionId, sequence, state, now, record.json, record.digest);
  }
}

/** The words of a state, for the projection. */
export function customAnalysisStateLabel(state: CustomAnalysisDimensionState): string {
  return CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS[state];
}
