import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS,
  MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN,
  isCustomAnalysisDimensionId,
  type CustomAnalysisDimensionDocument,
  type CustomAnalysisDimensionState,
  isCustomAnalysisKindId,
  customAnalysisDimensionIdOfKind,
  CUSTOM_ANALYSIS_UNIT_PLACEHOLDER,
  customAnalysisKindId,
  type CustomAnalysisRevisionSummaryProjection,
  type BaselineAnalysisProjection,
  type CustomAnalysisRowProjection,
  MAX_CUSTOM_ANALYSIS_ROWS_SHOWN,
  type CustomAnalysisDimensionProjection,
  type CustomAnalysisDimensionsProjection,
  MAX_CUSTOM_ANALYSIS_VERSIONS_SHOWN,
  type SaveCustomAnalysisDimensionInput,
  type PrepareCustomAnalysisInput,
  type LaunchPolicyProjection,
  customAnalysisModeGoal,
} from '../shared/protocol.js';
import { canonicalRecord, isRecord, parseCanonicalJson } from './analysis/canonical.js';
import {
  CustomAnalysisDocumentError,
  customAnalysisDimensionDocument,
  customAnalysisDocumentDigest,
  parseCustomAnalysisDimensionDocument,
  CUSTOM_ANALYSIS_FIXED_TERMS,
  customAnalysisTextRefusal,
} from './analysis/custom-analysis-contract.js';
import type { CustomAnalysisVersionInput } from './analysis/custom-analysis-kind.js';
import { CUSTOM_ANALYSIS_SCHEMA_VERSION } from './task-authorization.js';
import type { AnalysisKindDefinition } from './analysis/kind-definition.js';
import { customAnalysisKindDefinition } from './analysis/custom-analysis-kind.js';
import { BaselineAnalysisStore, type ProgressReader, runIsActive } from './analysis/baseline-analysis-store.js';
import { requireStore, type SqlRow as StoreSqlRow, asString, sha256, UUID_PATTERN } from './store-records.js';
import { withModelClarification } from './provider/clarification-contract.js';
import { liveKindAdmission } from './analysis/live-kind-admission.js';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import { RecentCache } from './recent-cache.js';
import type { StoreControl } from './store.js';

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

// ---- 自定义分析维度 operations of the store (Issue #922 slice 7f, ADR 0090 item 4; moved from store.ts by Issue #1172) ---------------

/** The store state and calls the 自定义分析维度 operations use, lent by EditorialStore: its fields read live through getters, its own methods bound. */
export interface CustomAnalysisStoreHost {
  analysisCall<T>(operation: () => T): T;
  assertAvailable(): void;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly control: StoreControl;
  customAnalysisCall<T>(operation: () => T): T;
  readonly customAnalysisDefinitions: RecentCache<AnalysisKindDefinition>;
  readonly customAnalysisDimensions: CustomAnalysisDimensions;
  readonly customAnalysisLedgers: RecentCache<BaselineAnalysisStore>;
}

/**
 * 自定义分析维度 (Issue #922, slice 7f): a template echoes manuscript text when this many consecutive graphemes of it, whitespace
 * aside, stand in a Book's text — a phrase, not a shared word. The words of each refusal the store gives for the family.
 */
const CUSTOM_ANALYSIS_ECHO_GRAPHEMES = 12;

const CUSTOM_ANALYSIS_GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export const CUSTOM_ANALYSIS_TEMPLATE_ECHO_REASON = '提问模板里有一段文字与书稿原文相同；模板只能写提问，不能包含稿件正文。' as const;

export const CUSTOM_ANALYSIS_NOT_ADMITTED_REASON = '当前策略未开放自定义分析。' as const;

const CUSTOM_ANALYSIS_NOT_ENABLED_REASON = '这个维度没有已启用的版本；在「知识库 › 工序与规则 › 自定义分析维度」中启用一个版本后才能运行。';

/** One version's kind definition, built once per version: its frozen contract is a pure function of the version. */
export function customAnalysisDefinition(host: CustomAnalysisStoreHost, version: CustomAnalysisDimensionVersionRecord): AnalysisKindDefinition {
  return host.customAnalysisDefinitions.obtain(version.versionId, () => host.customAnalysisCall(() => customAnalysisKindDefinition(customAnalysisVersionInput(version))));
}

/**
 * The append-only ledger of one dimension version: the same ledger class over the same Book database, constructed with that
 * version's kind definition and bound to the launch the baseline ledger was bound to, so every plan it freezes names the binding
 * this launch bound. Kept per kind and frozen contract, as a review category's ledger is: one holds the preparations in flight.
 */
export function customAnalysisLedger(host: CustomAnalysisStoreHost, definition: AnalysisKindDefinition): BaselineAnalysisStore {
  host.assertAvailable();
  requireStore(isCustomAnalysisKindId(definition.kind), 'CUSTOM_ANALYSIS_KIND_INVALID', '该分析种类不是自定义分析维度。');
  return host.customAnalysisLedgers.obtain(`${definition.kind}\n${definition.promptContractDigest}`, () => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  });
}

/**
 * The exact version a Task of the family was prepared under: the one whose frozen contract — as this launch's ledger wraps it, or
 * unwrapped — its latest plan names. A later version or a 停用 never moves it. `null` for a Task of no family kind, one whose plan
 * never froze, or one whose dimension this store does not hold.
 */
export function customAnalysisVersionOfTask(host: CustomAnalysisStoreHost, taskIntentId: string): CustomAnalysisDimensionVersionRecord | null {
  const row = host.authority.prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as StoreSqlRow | undefined;
  const dimensionId = customAnalysisDimensionIdOfKind(row?.kind);
  if (dimensionId === null) return null;
  const envelope = host.authority.prepare(`SELECT canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope'
      ORDER BY plan_version DESC LIMIT 1`).get(taskIntentId) as StoreSqlRow | undefined;
  if (envelope === undefined) return null;
  const json = asString(envelope.canonical_json);
  requireStore(sha256(json) === envelope.sha256, 'ANALYSIS_RECORD_INVALID', '任务计划记录与摘要不一致。');
  const frozen = (JSON.parse(json) as Record<string, unknown>).promptContractDigest;
  const dimension = host.customAnalysisCall(() => host.customAnalysisDimensions.dimension(dimensionId));
  return dimension?.versions.find((version) => {
    const definition = customAnalysisDefinition(host, version);
    return definition.promptContractDigest === frozen || withModelClarification(definition).promptContractDigest === frozen;
  }) ?? null;
}

/** The dimension version of a custom Task, for the plan the Task Drawer shows; `null` for any other Task. */
export function customAnalysisPlanVersion(host: CustomAnalysisStoreHost, taskIntentId: string | null): CustomAnalysisDimensionVersionRecord | null {
  return taskIntentId === null ? null : customAnalysisVersionOfTask(host, taskIntentId);
}

/**
 * Whether a template carries manuscript text (ADR 0090 item 4; Provider Processing v22/v23: never manuscript text): any
 * `CUSTOM_ANALYSIS_ECHO_GRAPHEMES` consecutive graphemes of it, whitespace aside, standing in a block of a Book's latest primary
 * revision — every Book's when a version is saved or enabled, and the Book's own again when a Run of it is prepared.
 */
export function templateEchoesManuscript(host: CustomAnalysisStoreHost, template: string, bookId: string | null): boolean {
  const graphemes = Array.from(CUSTOM_ANALYSIS_GRAPHEMES.segment(template.replace(CUSTOM_ANALYSIS_UNIT_PLACEHOLDER, '')), (part) => part.segment)
    .filter((part) => part.trim() !== '');
  if (graphemes.length < CUSTOM_ANALYSIS_ECHO_GRAPHEMES) return false;
  const windows = new Set<string>();
  for (let index = 0; index + CUSTOM_ANALYSIS_ECHO_GRAPHEMES <= graphemes.length; index += 1) {
    windows.add(graphemes.slice(index, index + CUSTOM_ANALYSIS_ECHO_GRAPHEMES).join(''));
  }
  const revisions = host.authority.prepare(`SELECT m.manuscript_id, mr.revision_id FROM manuscripts m
      JOIN manuscript_revisions mr ON mr.manuscript_id = m.manuscript_id
      WHERE m.role = 'primary' AND (? IS NULL OR m.book_id = ?)
        AND mr.ordinal = (SELECT max(latest.ordinal) FROM manuscript_revisions latest WHERE latest.manuscript_id = m.manuscript_id)`)
    .all(bookId, bookId) as StoreSqlRow[];
  return revisions.some((revision) => host.analysisCall(() => host.baselineAnalysis.readRevisionBlocks(asString(revision.manuscript_id), asString(revision.revision_id)))
    .some((block) => {
      const compact = block.text.replace(/\s+/gu, '');
      for (const window of windows) if (compact.includes(window)) return true;
      return false;
    }));
}

/** How many Tasks of any Book each version of a dimension was prepared under, by the contract each Task's plans froze. */
export function customAnalysisTaskCounts(host: CustomAnalysisStoreHost, dimensionId: string, versions: ReadonlyArray<CustomAnalysisDimensionVersionRecord>): Map<string, number> {
  const rows = host.authority.prepare(`SELECT DISTINCT p.task_intent_id, json_extract(p.canonical_json, '$.promptContractDigest') AS digest
      FROM analysis_plan_records p JOIN analysis_task_intents i ON i.task_intent_id = p.task_intent_id
      WHERE i.kind = ? AND p.component = 'plan-envelope'`).all(customAnalysisKindId(dimensionId)) as StoreSqlRow[];
  const byDigest = new Map<string, string>();
  for (const version of versions) {
    const definition = customAnalysisDefinition(host, version);
    byDigest.set(definition.promptContractDigest, version.versionId);
    byDigest.set(withModelClarification(definition).promptContractDigest, version.versionId);
  }
  const tasks = new Map<string, Set<string>>();
  for (const row of rows) {
    const versionId = byDigest.get(String(row.digest));
    if (versionId !== undefined) tasks.set(versionId, (tasks.get(versionId) ?? new Set()).add(asString(row.task_intent_id)));
  }
  return new Map([...tasks].map(([versionId, ids]) => [versionId, ids.size] as const));
}

/** The latest revision of one dimension on one Book, as ②A's 自定义 tab reads it. */
export function customAnalysisRevisionSummary(host: CustomAnalysisStoreHost, revision: Readonly<Record<string, unknown>>): CustomAnalysisRevisionSummaryProjection {
  const typed = revision as unknown as NonNullable<BaselineAnalysisProjection['resultSetRevision']> & {
    dimension: { versionId: string; version: number; documentDigest: string };
    rows: ReadonlyArray<CustomAnalysisRowProjection>;
    rowCounts: CustomAnalysisRevisionSummaryProjection['rowCounts'];
  };
  return {
    revisionId: typed.revisionId,
    ordinal: typed.ordinal,
    createdAt: typed.createdAt,
    dimensionVersion: { versionId: typed.dimension.versionId, version: typed.dimension.version, documentDigest: typed.dimension.documentDigest },
    manuscriptRevisionLabel: typed.manuscriptPin.revisionLabel,
    coverage: typed.coverage,
    freshness: typed.freshness,
    gaps: typed.gaps.map((gap) => ({ unitOrdinal: gap.unitOrdinal, code: gap.code, reason: gap.reason })),
    rowCounts: { units: typed.rowCounts.units, rows: typed.rowCounts.rows, located: typed.rowCounts.located, unlocated: typed.rowCounts.unlocated },
    rows: typed.rows.slice(0, MAX_CUSTOM_ANALYSIS_ROWS_SHOWN),
    rowsTruncated: typed.rows.length > MAX_CUSTOM_ANALYSIS_ROWS_SHOWN,
  };
}

/** One dimension on one Book: its latest Task's state, its latest revision, and whether 运行 can prepare now. */
export function customAnalysisBook(
    host: CustomAnalysisStoreHost,
  dimensionId: string,
  enabled: CustomAnalysisDimensionVersionRecord | null,
  bookId: string,
  progress?: ProgressReader,
): NonNullable<CustomAnalysisDimensionProjection['book']> {
  const latestTask = host.authority.prepare('SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY rowid DESC LIMIT 1')
    .get(bookId, customAnalysisKindId(dimensionId)) as StoreSqlRow | undefined;
  const version = (latestTask === undefined ? null : customAnalysisVersionOfTask(host, asString(latestTask.task_intent_id))) ?? enabled;
  if (version === null) return { taskState: null, latest: null, unavailableReason: CUSTOM_ANALYSIS_NOT_ENABLED_REASON };
  const projection = host.analysisCall(() => customAnalysisLedger(host, customAnalysisDefinition(host, version)).inspect(bookId, progress)) as unknown as BaselineAnalysisProjection;
  const active = runIsActive(projection.run?.state ?? null);
  return {
    taskState: projection.taskIntent === null ? null : { taskIntentId: projection.taskIntent.taskIntentId, state: projection.state, stateLabel: projection.stateLabel },
    latest: projection.resultSetRevision === null ? null : customAnalysisRevisionSummary(host, projection.resultSetRevision as unknown as Record<string, unknown>),
    unavailableReason: enabled === null ? CUSTOM_ANALYSIS_NOT_ENABLED_REASON : active ? '这个维度的上一项任务还在运行；它结束后才能再运行。' : null,
  };
}

/**
 * 知识库 › 工序与规则 › 自定义分析维度 (`bookId: null`), or ②A's 自定义 tab over one Book (Issue #922; ANALYSIS-001, ANALYSIS-009):
 * the house's dimensions, each with its versions and states, and for a Book each dimension with an enabled version or a Task
 * there, with that Book's latest Result Set Revision of it. Each dimension is its own kind, so each keeps its own Result Set.
 */
export function inspectCustomAnalysisDimensions(host: CustomAnalysisStoreHost, bookId: string | null, progress?: ProgressReader): CustomAnalysisDimensionsProjection {
  host.assertAvailable();
  requireStore(bookId === null || (typeof bookId === 'string' && UUID_PATTERN.test(bookId)), 'CUSTOM_ANALYSIS_REQUEST_INVALID', '自定义分析维度请求无效。');
  if (bookId !== null) requireStore(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'BOOK_NOT_FOUND', '这本书不存在。');
  const listed = host.customAnalysisCall(() => host.customAnalysisDimensions.list());
  const dimensions = listed.dimensions.flatMap((dimension): CustomAnalysisDimensionProjection[] => {
    const enabled = dimension.versions.find((version) => version.state === 'enabled') ?? null;
    const counts = customAnalysisTaskCounts(host, dimension.dimensionId, dimension.versions);
    const book = bookId === null ? null : customAnalysisBook(host, dimension.dimensionId, enabled, bookId, progress);
    // ②A lists what can run on the Book and what already ran there; a dimension with neither is the house's alone.
    if (book !== null && enabled === null && book.taskState === null) return [];
    return [{
      dimensionId: dimension.dimensionId,
      kind: customAnalysisKindId(dimension.dimensionId),
      title: dimension.versions[0]!.document.title,
      enabledVersion: enabled === null ? null : { versionId: enabled.versionId, version: enabled.version },
      versions: dimension.versions.slice(0, MAX_CUSTOM_ANALYSIS_VERSIONS_SHOWN).map((version) => ({
        versionId: version.versionId,
        version: version.version,
        title: version.document.title,
        questionTemplate: version.document.questionTemplate,
        documentDigest: version.documentDigest,
        supersedes: version.supersedes,
        state: version.state,
        stateLabel: CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS[version.state],
        createdAt: version.createdAt,
        stateRecordedAt: version.stateRecordedAt,
        taskCount: counts.get(version.versionId) ?? 0,
      })),
      versionsTruncated: dimension.versions.length > MAX_CUSTOM_ANALYSIS_VERSIONS_SHOWN,
      book,
    }];
  });
  return { bookId, dimensions, truncated: listed.truncated, fixed: structuredClone(CUSTOM_ANALYSIS_FIXED_TERMS) as CustomAnalysisDimensionsProjection['fixed'] };
}

/** The validation 保存 and 验证并启用 share: the document's own rules, and no manuscript text of any Book in its template. */
export function requireCustomAnalysisTexts(host: CustomAnalysisStoreHost, title: unknown, questionTemplate: unknown): void {
  const refusal = customAnalysisTextRefusal(title, questionTemplate);
  requireStore(refusal === null, 'CUSTOM_ANALYSIS_DIMENSION_INVALID', refusal ?? '');
  requireStore(!templateEchoesManuscript(host, questionTemplate as string, null), 'CUSTOM_ANALYSIS_TEMPLATE_MANUSCRIPT_TEXT', CUSTOM_ANALYSIS_TEMPLATE_ECHO_REASON);
}

/** 保存: version 1 of a new dimension, or the next version superseding the latest; `待验证` until 验证并启用. */
export function saveCustomAnalysisDimension(host: CustomAnalysisStoreHost, input: SaveCustomAnalysisDimensionInput): CustomAnalysisDimensionsProjection {
  host.assertAvailable();
  requireStore(typeof input === 'object' && input !== null && (input.dimensionId === null || isCustomAnalysisDimensionId(input.dimensionId)),
    'CUSTOM_ANALYSIS_REQUEST_INVALID', '自定义分析维度请求无效。');
  requireCustomAnalysisTexts(host, input.title, input.questionTemplate);
  host.customAnalysisCall(() => host.customAnalysisDimensions.save(
    { dimensionId: input.dimensionId, title: input.title, questionTemplate: input.questionTemplate }, new Date().toISOString()));
  return inspectCustomAnalysisDimensions(host, null);
}

/** 验证并启用: the version's document validated again, deterministically — its rules, its contract, the Books' text — then `已启用`. */
export function enableCustomAnalysisDimension(host: CustomAnalysisStoreHost, versionId: string): CustomAnalysisDimensionsProjection {
  host.assertAvailable();
  const version = isCustomAnalysisDimensionId(versionId) ? host.customAnalysisCall(() => host.customAnalysisDimensions.version(versionId)) : null;
  requireStore(version !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度版本不存在。');
  requireCustomAnalysisTexts(host, version.document.title, version.document.questionTemplate);
  customAnalysisDefinition(host, version);
  host.customAnalysisCall(() => host.customAnalysisDimensions.enable(versionId, new Date().toISOString()));
  return inspectCustomAnalysisDimensions(host, null);
}

/** 停用: final for the version; a Run prepared under it keeps naming it, and no new Run can be prepared under it. */
export function stopCustomAnalysisDimension(host: CustomAnalysisStoreHost, versionId: string): CustomAnalysisDimensionsProjection {
  host.assertAvailable();
  requireStore(isCustomAnalysisDimensionId(versionId), 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度版本不存在。');
  host.customAnalysisCall(() => host.customAnalysisDimensions.stop(versionId, new Date().toISOString()));
  return inspectCustomAnalysisDimensions(host, null);
}

/**
 * ②A 自定义 › 运行 (Issue #922): the dimension's newest enabled version prepared on the Book through the ordinary ②A path — Task
 * Intent, input checkpoint, Coverage Manifest, Plan Envelope — its plan then opened in the Task Drawer, where 开始任务 records the
 * standard Run Authorization. Under a live scope the selected policy must admit the family (`custom-analysis/*`, v22/v23); the
 * local deterministic route needs no policy. The preparation is a few local steps and runs to its end in this one call.
 */
export function prepareCustomAnalysis(host: CustomAnalysisStoreHost, input: PrepareCustomAnalysisInput, launchPolicy: LaunchPolicyProjection): { taskIntentId: string; dimensions: CustomAnalysisDimensionsProjection } {
  host.assertAvailable();
  requireStore(typeof input === 'object' && input !== null && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
    isCustomAnalysisDimensionId(input.dimensionId), 'CUSTOM_ANALYSIS_REQUEST_INVALID', '自定义分析请求无效。');
  const dimension = host.customAnalysisCall(() => host.customAnalysisDimensions.dimension(input.dimensionId));
  requireStore(dimension !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND', '这个自定义分析维度不存在。');
  const version = dimension.versions.find((entry) => entry.state === 'enabled') ?? null;
  requireStore(version !== null, 'CUSTOM_ANALYSIS_DIMENSION_NOT_ENABLED', '这个维度没有已启用的版本；已停用的版本不能再运行。');
  requireStore(!templateEchoesManuscript(host, version.document.questionTemplate, input.bookId), 'CUSTOM_ANALYSIS_TEMPLATE_MANUSCRIPT_TEXT', CUSTOM_ANALYSIS_TEMPLATE_ECHO_REASON);
  const definition = customAnalysisDefinition(host, version);
  const live = host.baselineAnalysis.launch.live;
  requireStore(live === null || liveKindAdmission(launchPolicy, definition, live) !== null, 'CUSTOM_ANALYSIS_NOT_ADMITTED', CUSTOM_ANALYSIS_NOT_ADMITTED_REASON);
  const ledger = customAnalysisLedger(host, definition);
  const mode = input.update?.mode ?? 'first-baseline';
  let progress = host.analysisCall(() => ledger.prepare({
    phase: 'start', bookId: input.bookId, goal: customAnalysisModeGoal(mode), update: input.update ?? null, reconfirm: false, launchPolicy,
  }));
  while (!progress.done) {
    const workId = progress.workId;
    requireStore(workId !== null, 'ANALYSIS_PREPARATION_INCOMPLETE', '自定义分析的任务计划没有准备完成。');
    progress = host.analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
  }
  const prepared = progress.projection as unknown as BaselineAnalysisProjection | null;
  requireStore(prepared !== null && prepared.taskIntent !== null && prepared.planEnvelope !== null, 'ANALYSIS_PREPARATION_INCOMPLETE', '自定义分析的任务计划没有准备完成。');
  return { taskIntentId: prepared.taskIntent.taskIntentId, dimensions: inspectCustomAnalysisDimensions(host, input.bookId) };
}

/** Startup reconciliation of every dimension's Runs a stopped service left under way, as each other kind's is. */
export function reconcileStoppedCustomAnalysisRuns(host: CustomAnalysisStoreHost): { settled: number } {
  host.assertAvailable();
  // Each dimension's latest Task: only it can have left a Run under way, since a kind holds one active Run at a time.
  const tasks = host.authority.prepare(`SELECT t.task_intent_id FROM analysis_task_intents t WHERE t.kind GLOB 'custom-analysis/*'
      AND t.rowid = (SELECT max(latest.rowid) FROM analysis_task_intents latest WHERE latest.kind = t.kind)`).all() as StoreSqlRow[];
  let settled = 0;
  for (const task of tasks) {
    const version = customAnalysisVersionOfTask(host, asString(task.task_intent_id));
    if (version === null) continue;
    settled += host.analysisCall(() => customAnalysisLedger(host, customAnalysisDefinition(host, version)).reconcileStoppedRuns()).settled;
  }
  return { settled };
}
