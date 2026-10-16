import { randomUUID } from 'node:crypto';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from './research-evidence-schema.js';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_RESEARCH_EVIDENCE_PAGE,
  RESEARCH_EVIDENCE_ALIGNMENT_LABELS,
  RESEARCH_EVIDENCE_CAPTURE_LABELS,
  RESEARCH_EVIDENCE_FINDING_LABELS,
  RESEARCH_EVIDENCE_STALE_AFTER_DAYS,
  RESEARCH_EVIDENCE_STALE_LABEL,
  RESEARCH_EVIDENCE_UNIT_LABELS,
  type ResearchEvidenceAlignment,
  type ResearchEvidenceAnchor,
  type ResearchEvidenceBookProjection,
  type ResearchEvidenceCaptureState,
  type ResearchEvidenceFindingProjection,
  type ResearchEvidenceProjection,
  type ResearchEvidenceQueryClass,
  type ResearchEvidenceTranslation,
  type ResearchEvidenceUnitProjection,
  type ResearchEvidenceUnitState,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import {
  RESEARCH_EVIDENCE_RECORD_SCHEMA,
  RESEARCH_EVIDENCE_UNIT_SCHEMA,
  evidencePassage,
  evidenceStaleness,
  researchEvidenceRecord,
  type RetainedUnit,
} from './analysis/factual-review-evidence.js';

/** Why 保存为来源材料 refuses: the house is read-only while a replacement is prepared or waiting. */
export const RESEARCH_EVIDENCE_READ_ONLY = '数据现在是只读的（正在准备或等待替换本机数据）；不能保存为来源材料。' as const;
/** Why 保存为来源材料 refuses: only a full-text capture is a whole source; an excerpt or an unretrieved page is not. */
export const RESEARCH_EVIDENCE_INCOMPLETE = '证据不完整：只有 AI7 取回全文的来源才能保存为来源材料；来源仅片段或未能取回的不能保存。' as const;

export class ResearchEvidenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ResearchEvidenceError';
  }
}

function requireEvidence(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ResearchEvidenceError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

/** How many researched units, and how many of their findings, one 来源与证据 read carries: the latest first. */
export const MAX_RESEARCH_EVIDENCE_UNITS = 64;
export const MAX_RESEARCH_EVIDENCE_FINDINGS = 400;
const PROJECTION_SECTION_BYTES = 192 * 1024;

const fold = (sql: string): string => sql.trim().replace(/\s+/gu, ' ');

/**
 * Revision 75's relations, created once on a store below it; a store that has them is checked against their exact text,
 * never rebuilt. A store stamped 75 or later without them is refused.
 */
export function initializeResearchEvidenceSchema(db: DatabaseSync, version: number): void {
  const present = Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL).filter((table) =>
    db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined);
  if (present.length > 0) {
    validateResearchEvidenceSchema(db);
    return;
  }
  requireEvidence(version < 75, 'SCHEMA_INVALID', '外部来源留存表缺失。');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(RESEARCH_EVIDENCE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(RESEARCH_EVIDENCE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Research evidence schema rollback failed.');
    }
    throw error;
  }
}

/** Every relation and trigger of revision 75 exactly as written, and nothing of it missing. */
export function validateResearchEvidenceSchema(db: DatabaseSync): void {
  for (const [name, sql] of [...Object.entries(RESEARCH_EVIDENCE_SCHEMA_SQL), ...Object.entries(RESEARCH_EVIDENCE_TRIGGER_SQL)]) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name) as SqlRow | undefined;
    requireEvidence(row !== undefined && typeof row.sql === 'string' && fold(row.sql) === fold(sql), 'SCHEMA_INVALID', '外部来源留存表结构不兼容。');
  }
}

/** One retained citation as the ledger reads it back, its record verified against its digest and its columns. */
interface StoredEvidence {
  readonly rowid: number;
  readonly evidenceId: string;
  readonly bookId: string;
  readonly runRecordId: string;
  readonly unitOrdinal: number;
  readonly findingId: string | null;
  readonly backendId: string | null;
  readonly queryClass: ResearchEvidenceQueryClass;
  readonly url: string;
  readonly sourceTitle: string | null;
  readonly capturedAt: string;
  readonly captureState: ResearchEvidenceCaptureState;
  readonly contentSha256: string | null;
  readonly pageSha256: string | null;
  readonly snapshotDigest: string | null;
  readonly claim: ResearchEvidenceProjection['claim'];
  readonly alignment: ResearchEvidenceAlignment;
  readonly anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  readonly translation: ResearchEvidenceTranslation | null;
  readonly stalenessState: 'current' | 'hash-changed';
}

/** What 保存为来源材料 reads of one retained source: its record and the captured text. */
export interface RetainedSourceForMaterial {
  readonly evidenceId: string;
  readonly bookId: string;
  readonly url: string;
  readonly sourceTitle: string | null;
  readonly capturedAt: string;
  readonly captureState: ResearchEvidenceCaptureState;
  readonly contentSha256: string | null;
  readonly pageSha256: string | null;
  readonly snapshotDigest: string | null;
  readonly runRecordId: string;
  readonly content: string | null;
  readonly savedMaterialId: string | null;
}

/**
 * The research evidence ledger (Issue #425, plan slice S70; V2-UX-SRC-013, KB-008): schema revision 75's four relations, all
 * append-only. `research_evidence` holds one row per retained citation — the Run and unit it came from, the backend and query
 * class that led to it, the address, capture time, content and page hashes, anchors, 来源译文 and the Research Snapshot it was
 * read from; `research_evidence_contents` the captured text of each source once, by its digest, as the Book-owned Source
 * Version; `research_evidence_units` how each researched unit's search ended and which of its findings no source named; and
 * `research_evidence_materials` the 资料库 item 保存为来源材料 made of a retained source. Nothing here sends, publishes or
 * exports anything, and a row grants no Run Source Scope.
 */
export class ResearchEvidenceLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #present(): boolean {
    return this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'research_evidence'").get() !== undefined;
  }

  /**
   * Keep one researched unit's evidence, inside the caller's transaction: each captured text once, each citation once, and the
   * unit's outcome. A capture whose address was retained before under another full-text hash is recorded `hash-changed`, which
   * marks every earlier capture of it 可能已过期. A unit already kept is refused, so a Run never records a unit twice.
   */
  record(input: { readonly bookId: string; readonly runRecordId: string; readonly unitOrdinal: number; readonly backendId: string | null; readonly unit: RetainedUnit }): string[] {
    requireEvidence(UUID_PATTERN.test(input.runRecordId) && Number.isSafeInteger(input.unitOrdinal) && input.unitOrdinal >= 1,
      'RESEARCH_EVIDENCE_INVALID', '外部来源留存的运行或单元无效。');
    requireEvidence(this.#db.prepare('SELECT 1 FROM research_evidence_units WHERE run_record_id = ? AND unit_ordinal = ?').get(input.runRecordId, input.unitOrdinal) === undefined,
      'RESEARCH_EVIDENCE_UNIT_RECORDED', '这个单元的外部来源已经留存。');
    const recordedAt = new Date().toISOString();
    const insertContent = this.#db.prepare('INSERT INTO research_evidence_contents(content_sha256, content_text, recorded_at) VALUES (?, ?, ?)');
    const readContent = this.#db.prepare('SELECT content_text FROM research_evidence_contents WHERE content_sha256 = ?');
    const priorFull = this.#db.prepare("SELECT content_sha256, page_sha256 FROM research_evidence WHERE url = ? AND captured_at < ? AND capture_state = 'full-text' ORDER BY captured_at DESC LIMIT 1");
    const insertEvidence = this.#db.prepare(`INSERT INTO research_evidence(
      evidence_id, book_id, run_record_id, unit_ordinal, finding_id, backend_id, query_class, url, captured_at, capture_state,
      content_sha256, page_sha256, snapshot_digest, alignment, anchors_json, translation_json, staleness_state, recorded_at, canonical_json, sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const ids: string[] = [];
    for (const evidence of input.unit.evidence) {
      if (evidence.content !== null && evidence.contentSha256 !== null) {
        requireEvidence(sha256Hex(evidence.content) === evidence.contentSha256, 'RESEARCH_EVIDENCE_DIGEST_MISMATCH', '留存来源的摘要与正文不一致。');
        const existing = readContent.get(evidence.contentSha256) as SqlRow | undefined;
        if (existing === undefined) insertContent.run(evidence.contentSha256, evidence.content, recordedAt);
        else requireEvidence(existing.content_text === evidence.content, 'RESEARCH_EVIDENCE_DIGEST_MISMATCH', '留存来源的摘要与正文不一致。');
      }
      const prior = evidence.captureState === 'full-text' ? priorFull.get(evidence.url, evidence.capturedAt) as SqlRow | undefined : undefined;
      const stalenessState = prior !== undefined && (prior.content_sha256 !== evidence.contentSha256 || prior.page_sha256 !== evidence.pageSha256) ? 'hash-changed' as const : 'current' as const;
      const evidenceId = randomUUID();
      const record = canonicalRecord(researchEvidenceRecord({
        evidenceId, bookId: input.bookId, runRecordId: input.runRecordId, unitOrdinal: input.unitOrdinal,
        backendId: input.backendId, stalenessState, recordedAt, evidence,
      }));
      insertEvidence.run(evidenceId, input.bookId, input.runRecordId, input.unitOrdinal, evidence.findingId, input.backendId, evidence.queryClass,
        evidence.url, evidence.capturedAt, evidence.captureState, evidence.contentSha256, evidence.pageSha256, evidence.snapshotDigest,
        evidence.alignment, canonicalJson(evidence.anchors), evidence.translation === null ? null : canonicalJson(evidence.translation),
        stalenessState, recordedAt, record.json, record.digest);
      ids.push(evidenceId);
    }
    const unsupported = input.unit.findings.filter((finding) => finding.sources === 0).length;
    const unitRecord = canonicalRecord({
      schema: RESEARCH_EVIDENCE_UNIT_SCHEMA, runRecordId: input.runRecordId, unitOrdinal: input.unitOrdinal, bookId: input.bookId,
      backendId: input.backendId, state: input.unit.state, searchCalls: input.unit.searchCalls, retentionFetches: input.unit.retentionFetches,
      failedRetrievals: input.unit.failedRetrievals, findings: input.unit.findings, evidenceIds: ids, recordedAt,
      ...(input.unit.retentionFailure === undefined ? {} : { retentionFailure: input.unit.retentionFailure }),
    });
    this.#db.prepare(`INSERT INTO research_evidence_units(run_record_id, unit_ordinal, book_id, backend_id, search_state, search_calls,
      retention_fetches, failed_retrievals, unsupported_findings, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.runRecordId, input.unitOrdinal, input.bookId, input.backendId, input.unit.state, input.unit.searchCalls,
        input.unit.retentionFetches, input.unit.failedRetrievals, unsupported, recordedAt, unitRecord.json, unitRecord.digest);
    return ids;
  }

  #evidence(row: SqlRow): StoredEvidence {
    const json = String(row.canonical_json);
    requireEvidence(sha256Hex(json) === String(row.sha256), 'RESEARCH_EVIDENCE_RECORD_INVALID', '外部来源留存记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireEvidence(isRecord(record) && record.schema === RESEARCH_EVIDENCE_RECORD_SCHEMA && record.evidenceId === row.evidence_id &&
      record.bookId === row.book_id && record.runRecordId === row.run_record_id && record.unitOrdinal === row.unit_ordinal &&
      record.findingId === row.finding_id && record.backendId === row.backend_id && record.queryClass === row.query_class &&
      record.url === row.url && record.capturedAt === row.captured_at && record.captureState === row.capture_state &&
      record.contentSha256 === row.content_sha256 && record.pageSha256 === row.page_sha256 && record.snapshotDigest === row.snapshot_digest &&
      record.alignment === row.alignment && record.stalenessState === row.staleness_state && canonicalJson(record.anchors) === row.anchors_json &&
      (record.translation === null ? row.translation_json === null : canonicalJson(record.translation) === row.translation_json),
    'RESEARCH_EVIDENCE_RECORD_INVALID', '外部来源留存记录已损坏。');
    return {
      rowid: Number(row.rowid), evidenceId: String(row.evidence_id), bookId: String(row.book_id), runRecordId: String(row.run_record_id),
      unitOrdinal: Number(row.unit_ordinal), findingId: row.finding_id === null ? null : String(row.finding_id),
      backendId: row.backend_id === null ? null : String(row.backend_id), queryClass: String(row.query_class) as ResearchEvidenceQueryClass,
      url: String(row.url), sourceTitle: typeof record.sourceTitle === 'string' ? record.sourceTitle : null, capturedAt: String(row.captured_at),
      captureState: String(row.capture_state) as ResearchEvidenceCaptureState,
      contentSha256: row.content_sha256 === null ? null : String(row.content_sha256), pageSha256: row.page_sha256 === null ? null : String(row.page_sha256),
      snapshotDigest: row.snapshot_digest === null ? null : String(row.snapshot_digest),
      claim: record.claim as ResearchEvidenceProjection['claim'], alignment: String(row.alignment) as ResearchEvidenceAlignment,
      anchors: record.anchors as ReadonlyArray<ResearchEvidenceAnchor>, translation: record.translation as ResearchEvidenceTranslation | null,
      stalenessState: String(row.staleness_state) as 'current' | 'hash-changed',
    };
  }

  #content(contentSha256: string | null): string | null {
    if (contentSha256 === null) return null;
    const row = this.#db.prepare('SELECT content_text FROM research_evidence_contents WHERE content_sha256 = ?').get(contentSha256) as SqlRow | undefined;
    requireEvidence(row !== undefined && sha256Hex(String(row.content_text)) === contentSha256, 'RESEARCH_EVIDENCE_RECORD_INVALID', '外部来源留存的正文已损坏。');
    return String(row.content_text);
  }

  #savedMaterial(evidenceId: string): string | null {
    const row = this.#db.prepare('SELECT material_id FROM research_evidence_materials WHERE evidence_id = ?').get(evidenceId) as SqlRow | undefined;
    return row === undefined ? null : String(row.material_id);
  }

  /** One retained source and its captured text, for 保存为来源材料; refused when the evidence is not this Book's. */
  source(bookId: string, evidenceId: string): RetainedSourceForMaterial {
    requireEvidence(UUID_PATTERN.test(evidenceId), 'RESEARCH_EVIDENCE_INVALID', '外部来源标识无效。');
    requireEvidence(this.#present(), 'RESEARCH_EVIDENCE_NOT_FOUND', '没有这条外部来源留存。');
    const row = this.#db.prepare('SELECT rowid, * FROM research_evidence WHERE evidence_id = ?').get(evidenceId) as SqlRow | undefined;
    requireEvidence(row !== undefined, 'RESEARCH_EVIDENCE_NOT_FOUND', '没有这条外部来源留存。');
    const stored = this.#evidence(row);
    requireEvidence(stored.bookId === bookId, 'RESEARCH_EVIDENCE_NOT_FOUND', '这条外部来源留存不属于这本书。');
    return {
      evidenceId: stored.evidenceId, bookId: stored.bookId, url: stored.url, sourceTitle: stored.sourceTitle, capturedAt: stored.capturedAt,
      captureState: stored.captureState, contentSha256: stored.contentSha256, pageSha256: stored.pageSha256, snapshotDigest: stored.snapshotDigest,
      runRecordId: stored.runRecordId, content: this.#content(stored.contentSha256), savedMaterialId: this.#savedMaterial(stored.evidenceId),
    };
  }

  /** Link the 资料库 item 保存为来源材料 made of a retained source, inside the caller's transaction; once per source. */
  linkMaterial(evidenceId: string, materialId: string): void {
    requireEvidence(this.#savedMaterial(evidenceId) === null, 'RESEARCH_EVIDENCE_ALREADY_SAVED', '这条外部来源已经保存为来源材料。');
    this.#db.prepare('INSERT INTO research_evidence_materials(evidence_id, material_id, recorded_at) VALUES (?, ?, ?)')
      .run(evidenceId, materialId, new Date().toISOString());
  }

  /**
   * 来源与证据's read of one Book: a page of its retained sources, newest first after the cursor, each with its staleness as of
   * `now` — older than the threshold, or captured again later under another full-text hash — its passage and whether
   * 保存为来源材料 is offered; and every researched unit's outcome with the findings no retained source names. Read-only.
   */
  projection(input: {
    readonly bookId: string;
    readonly after: number | null;
    readonly now: Date;
    readonly staleAfterDays?: number;
    readonly runRecordId?: string;
    readonly findingId?: string;
    readonly saveRefusal: (source: { captureState: ResearchEvidenceCaptureState; savedMaterialId: string | null }) => string | null;
  }): ResearchEvidenceBookProjection {
    const staleAfterDays = input.staleAfterDays ?? RESEARCH_EVIDENCE_STALE_AFTER_DAYS;
    const empty: ResearchEvidenceBookProjection = { bookId: input.bookId, staleAfterDays, records: [], next: null, units: [], findings: [],
      statement: '这本书还没有留存的外部来源：外部来源只在联网核查的运行中留存。' };
    if (!this.#present()) return empty;
    const scope = `book_id = ?${input.runRecordId === undefined ? '' : ' AND run_record_id = ?'}`;
    const scopeArgs = [input.bookId, ...(input.runRecordId === undefined ? [] : [input.runRecordId])];
    const rows = this.#db.prepare(`SELECT rowid, * FROM research_evidence WHERE ${scope}
      ${input.findingId === undefined ? '' : 'AND finding_id = ?'} ${input.after === null ? '' : 'AND rowid < ?'} ORDER BY rowid DESC LIMIT ?`)
      .all(...scopeArgs, ...(input.findingId === undefined ? [] : [input.findingId]), ...(input.after === null ? [] : [input.after]), MAX_RESEARCH_EVIDENCE_PAGE + 1) as SqlRow[];
    const page = rows.slice(0, MAX_RESEARCH_EVIDENCE_PAGE).map((row) => this.#evidence(row));
    const later = this.#db.prepare("SELECT 1 FROM research_evidence WHERE url = ? AND captured_at > ? AND capture_state = 'full-text' AND (content_sha256 <> ? OR page_sha256 <> ?) LIMIT 1");
    const projected = page.map((stored): ResearchEvidenceProjection => {
      const staleness = evidenceStaleness({ capturedAt: stored.capturedAt, now: input.now, staleAfterDays,
        laterDifferentHash: stored.captureState === 'full-text' && later.get(stored.url, stored.capturedAt, stored.contentSha256, stored.pageSha256) !== undefined });
      const content = this.#content(stored.contentSha256);
      const savedMaterialId = this.#savedMaterial(stored.evidenceId);
      return {
        evidenceId: stored.evidenceId, bookId: stored.bookId, runRecordId: stored.runRecordId, unitOrdinal: stored.unitOrdinal,
        findingId: stored.findingId, backendId: stored.backendId, queryClass: stored.queryClass, url: stored.url, sourceTitle: stored.sourceTitle?.slice(0, 2_000) ?? null,
        capturedAt: stored.capturedAt, captureState: stored.captureState, captureLabel: RESEARCH_EVIDENCE_CAPTURE_LABELS[stored.captureState],
        contentSha256: stored.contentSha256, pageSha256: stored.pageSha256, snapshotDigest: stored.snapshotDigest, claim: stored.claim,
        alignment: stored.alignment, alignmentLabel: RESEARCH_EVIDENCE_ALIGNMENT_LABELS[stored.alignment], anchors: stored.anchors,
        passage: content === null ? null : stored.translation?.state === 'translated'
          ? content.slice(stored.translation.attribution.from, stored.translation.attribution.to) : evidencePassage(content, stored.anchors), translation: stored.translation,
        staleness: { ...staleness, label: staleness.state === 'possibly-stale' ? RESEARCH_EVIDENCE_STALE_LABEL : null },
        savedMaterialId, saveRefusal: input.saveRefusal({ captureState: stored.captureState, savedMaterialId }),
      };
    });
    // Count actual UTF-8 bytes, not just rows: long public titles and translations otherwise overflow the 512 KiB frame.
    const records: ResearchEvidenceProjection[] = [];
    let recordBytes = 0;
    for (const record of projected) {
      const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8') + 1;
      if (recordBytes + bytes > PROJECTION_SECTION_BYTES) break;
      recordBytes += bytes;
      records.push(record);
    }
    // The latest researched units and their findings, bounded so one read always fits one frame.
    const unitRows = this.#db.prepare(`SELECT * FROM research_evidence_units WHERE ${scope}
      ${input.findingId === undefined ? '' : "AND EXISTS (SELECT 1 FROM json_each(canonical_json, '$.findings') f WHERE json_extract(f.value, '$.findingId') = ?)"}
      ORDER BY rowid DESC LIMIT ?`)
      .all(...scopeArgs, ...(input.findingId === undefined ? [] : [input.findingId]), MAX_RESEARCH_EVIDENCE_UNITS) as SqlRow[];
    const units: ResearchEvidenceUnitProjection[] = [];
    const findings: ResearchEvidenceFindingProjection[] = [];
    let findingBytes = 0;
    for (const row of unitRows) {
      const json = String(row.canonical_json);
      requireEvidence(sha256Hex(json) === String(row.sha256), 'RESEARCH_EVIDENCE_RECORD_INVALID', '外部来源留存记录已损坏。');
      const record = JSON.parse(json) as { schema?: unknown; findings?: unknown; retentionFailure?: 'capture-processing' | 'storage' };
      requireEvidence(record.schema === RESEARCH_EVIDENCE_UNIT_SCHEMA && Array.isArray(record.findings), 'RESEARCH_EVIDENCE_RECORD_INVALID', '外部来源留存记录已损坏。');
      const state = String(row.search_state) as ResearchEvidenceUnitState;
      units.push({
        ...(record.retentionFailure === undefined ? {} : { retentionFailure: record.retentionFailure }),
        runRecordId: String(row.run_record_id), unitOrdinal: Number(row.unit_ordinal), backendId: row.backend_id === null ? null : String(row.backend_id),
        state, label: RESEARCH_EVIDENCE_UNIT_LABELS[state], searchCalls: Number(row.search_calls), retentionFetches: Number(row.retention_fetches),
        failedRetrievals: Number(row.failed_retrievals), unsupportedFindings: Number(row.unsupported_findings),
      });
      for (const finding of record.findings as Array<{ findingId: string; blockId: string; quote: string; sources: number }>) {
        if (input.findingId !== undefined && finding.findingId !== input.findingId) continue;
        if (findings.length >= MAX_RESEARCH_EVIDENCE_FINDINGS) break;
        const findingState = finding.sources > 0 ? 'sourced' as const : state === 'incomplete' ? 'incomplete' as const : 'unsupported' as const;
        const projectedFinding: ResearchEvidenceFindingProjection = { findingId: finding.findingId, runRecordId: String(row.run_record_id), unitOrdinal: Number(row.unit_ordinal),
          blockId: finding.blockId, quote: finding.quote, state: findingState,
          label: record.retentionFailure === undefined ? RESEARCH_EVIDENCE_FINDING_LABELS[findingState]
            : `来源留存失败（${record.retentionFailure === 'storage' ? '保存失败' : '处理失败'}）；没有可查看的留存来源。`, sources: finding.sources };
        const bytes = Buffer.byteLength(JSON.stringify(projectedFinding), 'utf8') + 1;
        if (findingBytes + bytes > PROJECTION_SECTION_BYTES) break;
        findingBytes += bytes;
        findings.push(projectedFinding);
      }
    }
    return {
      bookId: input.bookId, staleAfterDays, records,
      next: rows.length > records.length && records.length > 0 ? page[records.length - 1]!.rowid : null,
      units, findings,
      statement: records.length === 0 && units.length === 0 ? empty.statement
        : '外部来源由联网核查的运行留存：AI7 自己取回的页面全文或检索返回的片段，以及与引文词句的对应；它不是事实结论，也不发布、不导出。',
    };
  }
}
