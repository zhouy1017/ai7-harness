import type { FastRoleProvenance } from './fast-role/fast-role-execution.js';
import { randomUUID } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { opendir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MATERIAL_TRANSLATION_LABEL,
  MAX_FRAME_BYTES,
  MAX_MATERIAL_SEGMENTS_PAGE,
  MAX_MATERIAL_VECTOR_CANDIDATES,
  type LibraryMaterialFormat,
  type MaterialIndexLanguage,
  type MaterialIndexLayerState,
  type MaterialIndexProjection,
  type MaterialIndexReason,
  type MaterialSegmentsPageProjection,
  type MaterialTranslationProjection,
  type MaterialTranslationAttemptProjection,
  type ModelTextAttemptProvenance,
  type MaterialVectorSearchProjection,
  type MaterialVectorsProjection,
} from '../shared/protocol.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import { UUID_PATTERN, canonicalRecord, hasExactKeys, isRecord, sha256Hex } from './analysis/canonical.js';
import { DOC_CONVERTER_IDENTITY, convertDocManuscript } from './doc-manuscript.js';
import { DOCX_PARSER_IDENTITY, MAX_ARCHIVE_BYTES, parseDocx, type ParsedDocxBlock } from './docx.js';
import { cosineSimilarity, vectorBytes, vectorFromBytes, vectorNorm, type EmbeddingReadiness } from './knowledge/embedding.js';
import {
  MATERIAL_FORMAT_CONVERTER_IDENTITIES,
  MaterialFormatRefusal,
  PDF_TEXT_CONVERTER_IDENTITY,
  extractMaterialFormatText,
  extractPdfText,
  isMaterialTextFormat,
} from './material-formats.js';
import { TEXT_CONVERTER_IDENTITY, buildManuscriptPackage, convertTextManuscript } from './text-manuscript.js';

/**
 * ⑤ 资料库 · 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009): the Material Index of a
 * 资料库 item, built on this machine from the original kept whole at its arrival.
 *
 * The Owner's decision of 2026-10-09 (option 乙) admits the four layers that need no new local dependency, and this module
 * builds exactly those:
 *
 * 1. the original — kept by `library-materials.ts`, re-verified here by its digest before anything is read from it;
 * 2. metadata — the file's own title when it names one, the language its text is mostly in, and its counts;
 * 3. extracted full text — for the formats AI7 already reads with its admitted conversion dependencies: DOCX (fflate and
 *    saxes), the legacy DOC (word-extractor) and plain text or Markdown, each through the very parser and converter the
 *    manuscript intake uses, inside the same bounds; and HTML, EPUB, ODT and RTF (Issue #428), each read by its own reader
 *    in `material-formats.ts` — fflate and saxes again, and two small tokenizers — into the same paragraphs, packaged and
 *    read through the same DOCX parser;
 * 4. segments — each paragraph with its sentences, every sentence citable by its position anchor (第 n 段第 m 句). These
 *    formats carry no page layout, so the anchors are positions and never claim a page. A PDF's text (Issue #892) is read
 *    from its text layer by `pdfjs-dist` (the Commander's admission of the exact pin, ADR 0070 §3), and its anchors name the
 *    page: 第 p 页第 m 段, each paragraph on one page. A PDF with no text layer to speak of needs recognition (需要识别).
 *
 * Issue #892 adds the fifth layer and 来源译文, both made only when the editor asks and both kept beside the build they were
 * made from — so a build made again, from a text read again, starts without them and nothing stale is ever served:
 *
 * 5. similarity vectors (相似段落检索) — one vector per paragraph, made on this machine by the store's `EmbeddingProvider`
 *    and recorded under its identity; a search ranks paragraphs, and the words are read where the anchor points (ADR 0026);
 *
 * and, for an item whose text is not Chinese, its 来源译文 — each paragraph's machine translation, labelled and attributed to
 * the paragraph it translates, never in its place, made by the Fast Interaction Role under the selected policy's rule.
 *
 * Text recognition for scans (OCR) is not provided: such a PDF is said to need it, never imitated.
 *
 * An index grants nothing. It is no Run Source Scope; a Task reads it read-only, only for an item its plan lists under
 * 允许参考 at the exact index version it pinned (`readForTask`, `queryForTask`), and what any Task sends stays bounded by its
 * plan. Its vectors and translations grant no scope, egress or learning eligibility either.
 *
 * Schema revision 67 owns two append-only relations: one build per item per indexer identity — its state, the metadata
 * and layer facts, and the digest over its segments — and the segments of a complete build, one row per paragraph.
 * Revision 76 (Issue #892) adds two more, append-only as well: the vectors of a build's paragraphs, by provider identity,
 * and their 来源译文. Neither moves a byte of revision 67's.
 */

export const MATERIAL_INDEX_SCHEMA_SQL = {
  material_index_builds: `CREATE TABLE material_index_builds (
  index_id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES library_materials(material_id),
  indexer TEXT NOT NULL CHECK(length(indexer) BETWEEN 1 AND 256),
  state TEXT NOT NULL CHECK(state IN ('complete', 'unsupported', 'failed')),
  segment_count INTEGER NOT NULL CHECK(segment_count >= 0),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(material_id, indexer),
  CHECK((state = 'complete') = (segment_count > 0))
) STRICT`,
  material_index_segments: `CREATE TABLE material_index_segments (
  index_id TEXT NOT NULL REFERENCES material_index_builds(index_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(index_id, ordinal)
) STRICT`,
} as const;

export const MATERIAL_INDEX_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(MATERIAL_INDEX_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const MATERIAL_INDEX_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  material_index_builds: ['material_id>library_materials.material_id:NO ACTION/NO ACTION/NONE'],
  material_index_segments: ['index_id>material_index_builds.index_id:NO ACTION/NO ACTION/NONE'],
};

/**
 * Revision 76's relations (Issue #892): the similarity vectors of a build's paragraphs — one per paragraph per provider
 * identity, naming the build's digest and the segment's own digest it was made from — and the 来源译文 of a build's
 * paragraphs, one per paragraph, its record naming the model and the policy rule it was made under. Both append-only.
 */
export const MATERIAL_INDEX_LAYER_SCHEMA_SQL = {
  material_index_vectors: `CREATE TABLE material_index_vectors (
  index_id TEXT NOT NULL REFERENCES material_index_builds(index_id),
  index_sha256 TEXT NOT NULL CHECK(length(index_sha256) = 64),
  embedding TEXT NOT NULL CHECK(length(embedding) BETWEEN 1 AND 256),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  segment_sha256 TEXT NOT NULL CHECK(length(segment_sha256) = 64),
  dimensions INTEGER NOT NULL CHECK(dimensions BETWEEN 1 AND 4096),
  vector BLOB NOT NULL CHECK(length(vector) = dimensions * 4),
  norm REAL NOT NULL CHECK(norm >= 0),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(index_id, embedding, ordinal)
) STRICT`,
  material_index_translations: `CREATE TABLE material_index_translations (
  index_id TEXT NOT NULL REFERENCES material_index_builds(index_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  segment_sha256 TEXT NOT NULL CHECK(length(segment_sha256) = 64),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 256),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(index_id, ordinal)
) STRICT`,
} as const;

export const MATERIAL_INDEX_LAYER_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const MATERIAL_INDEX_LAYER_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  material_index_vectors: ['index_id>material_index_builds.index_id:NO ACTION/NO ACTION/NONE'],
  material_index_translations: ['index_id>material_index_builds.index_id:NO ACTION/NO ACTION/NONE'],
};

/** The revision that adds them; a store stamped at or above it must already hold them exactly. */
const MATERIAL_INDEX_LAYER_REVISION = 76;

/** Revision 84: one bounded, payload-free record per actual translation batch attempt; no invented historical attempts. */
export const MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL = {
  material_translation_attempts: `CREATE TABLE material_translation_attempts (
  attempt_id TEXT PRIMARY KEY CHECK(length(attempt_id) = 36),
  index_id TEXT NOT NULL REFERENCES material_index_builds(index_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('translated', 'failed', 'outcome-unknown')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL CHECK(length(canonical_json) BETWEEN 1 AND 16384 AND json_valid(canonical_json)),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
} as const;
export const MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL = {
  material_translation_attempts_no_update: `CREATE TRIGGER material_translation_attempts_no_update
    BEFORE UPDATE ON material_translation_attempts
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`,
  material_translation_attempts_no_delete: `CREATE TRIGGER material_translation_attempts_no_delete
    BEFORE DELETE ON material_translation_attempts
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`,
} as const;
export const MATERIAL_TRANSLATION_ATTEMPT_FOREIGN_KEYS = {
  material_translation_attempts: ['index_id>material_index_builds.index_id:NO ACTION/NO ACTION/NONE'],
} as const;

export function initializeMaterialTranslationAttemptSchema(db: DatabaseSync, version: number): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'material_translation_attempts'").get() !== undefined) {
    validateMaterialTranslationAttemptSchema(db);
    return;
  }
  requireIndex(version < 84, 'SCHEMA_INVALID', '来源译文尝试记录表缺失。');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of [...Object.values(MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL), ...Object.values(MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL)]) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Closed metadata only; shared by persisted connection tests and translation attempt readers. */
export function isModelTextAttemptProvenance(value: unknown): value is ModelTextAttemptProvenance {
  if (!isRecord(value) || !hasExactKeys(value, ['role', 'route', 'model', 'endpoint', 'credentialSlot', 'credentialReference',
    'policyVersion', 'bindingDigest', 'usage', 'failureCode', ...(value.credentialUpdatedAt === undefined ? [] : ['credentialUpdatedAt'])])) return false;
  if (value.role !== 'Fast Interaction Role' || typeof value.credentialReference !== 'string' || !UUID_PATTERN.test(value.credentialReference) ||
      typeof value.bindingDigest !== 'string' || !DIGEST_PATTERN.test(value.bindingDigest) ||
      typeof value.policyVersion !== 'string' || !/^v[1-9][0-9]*$/u.test(value.policyVersion) ||
      (value.credentialUpdatedAt !== undefined && (typeof value.credentialUpdatedAt !== 'string' || !Number.isFinite(Date.parse(value.credentialUpdatedAt)))) ||
      (value.failureCode !== null && (typeof value.failureCode !== 'string' || !/^[A-Z0-9_]{1,100}$/u.test(value.failureCode)))) return false;
  for (const field of ['route', 'model', 'endpoint', 'credentialSlot'] as const) {
    if (typeof value[field] !== 'string' || value[field].length < 1 || value[field].length > 256 || !value[field].isWellFormed()) return false;
  }
  const usage = value.usage;
  return usage === null || (isRecord(usage) && hasExactKeys(usage, ['inputTokens', 'outputTokens',
    ...(usage.reasoningTokens === undefined ? [] : ['reasoningTokens']), ...(usage.cacheReadTokens === undefined ? [] : ['cacheReadTokens'])]) &&
    Object.values(usage).every((count) => Number.isSafeInteger(count) && (count as number) >= 0));
}

function readTranslationAttempt(db: DatabaseSync, row: SqlRow): MaterialTranslationAttemptProjection {
  const json = String(row.canonical_json);
  requireIndex(json.length <= 16384 && sha256Hex(json) === row.sha256, 'MATERIAL_INDEX_RECORD_INVALID', '来源译文尝试记录已损坏。');
  const record: unknown = JSON.parse(json);
  requireIndex(isRecord(record) && hasExactKeys(record, ['schema', 'attemptId', 'indexId', 'indexSha256', 'sourceSha256', 'batch', 'recordedAt', 'outcome', 'provenance']) &&
    record.schema === 'ai7.material-translation-attempt/1' && record.attemptId === row.attempt_id && typeof record.attemptId === 'string' && UUID_PATTERN.test(record.attemptId) &&
    record.indexId === row.index_id && typeof record.indexId === 'string' && UUID_PATTERN.test(record.indexId) &&
    typeof record.indexSha256 === 'string' && DIGEST_PATTERN.test(record.indexSha256) && typeof record.sourceSha256 === 'string' && DIGEST_PATTERN.test(record.sourceSha256) &&
    record.recordedAt === row.recorded_at && typeof record.recordedAt === 'string' && Number.isFinite(Date.parse(record.recordedAt)) &&
    record.outcome === row.outcome && ['translated', 'failed', 'outcome-unknown'].includes(record.outcome as string) &&
    Array.isArray(record.batch) && record.batch.length > 0 && record.batch.length <= 20 && isModelTextAttemptProvenance(record.provenance) &&
    ((record.outcome === 'translated') === (record.provenance.failureCode === null)),
    'MATERIAL_INDEX_RECORD_INVALID', '来源译文尝试记录已损坏。');
  requireIndex(canonicalRecord(record).json === json, 'MATERIAL_INDEX_RECORD_INVALID', '来源译文尝试记录不是规范记录。');
  const build = db.prepare('SELECT b.sha256, m.object_sha256 AS source_sha256 FROM material_index_builds b JOIN library_materials m ON m.material_id = b.material_id WHERE b.index_id = ?').get(record.indexId);
  requireIndex(build?.sha256 === record.indexSha256 && build.source_sha256 === record.sourceSha256, 'MATERIAL_INDEX_RECORD_INVALID', '来源译文尝试来源不匹配。');
  const segment = db.prepare('SELECT sha256 FROM material_index_segments WHERE index_id = ? AND ordinal = ?');
  let previous = 0;
  for (const item of record.batch) {
    requireIndex(isRecord(item) && hasExactKeys(item, ['ordinal', 'sha256']) && Number.isSafeInteger(item.ordinal) && (item.ordinal as number) > previous &&
      typeof item.sha256 === 'string' && DIGEST_PATTERN.test(item.sha256) && segment.get(record.indexId, item.ordinal as number)?.sha256 === item.sha256,
      'MATERIAL_INDEX_RECORD_INVALID', '来源译文尝试分段不匹配。');
    previous = item.ordinal as number;
  }
  const { schema: _schema, ...projection } = record;
  return projection as unknown as MaterialTranslationAttemptProjection;
}

export function validateMaterialTranslationAttemptSchema(db: DatabaseSync): void {
  for (const [name, sql] of [...Object.entries(MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL), ...Object.entries(MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL)]) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name);
    requireIndex(typeof row?.sql === 'string' && foldSql(row.sql) === foldSql(sql), 'SCHEMA_INVALID', '来源译文尝试记录表结构不兼容。');
  }
  for (const row of db.prepare('SELECT * FROM material_translation_attempts').iterate()) readTranslationAttempt(db, row);
}

/**
 * The indexer's identity: what a build was made by. A build is made once per item per identity, so a later indexer that
 * reads more makes a new build beside the old one, and nothing is rewritten.
 *
 * It names the DOCX parser every format is read through, and not the DOC and text converters (#729): it is one identity for
 * every format, so naming them would move every item's current build — DOCX ones included — and rebuild them all, each
 * build's digest with it. Each build records the converter it read through in its own record (`converter`, under the
 * build's digest); a change to a converter's output moves `ai7-material-index/N` instead. Refinements of the sentence
 * anchors (`splitSentences`) are not versioned this way: a build made earlier keeps the anchors it was made with, and a
 * plan pins a build by its digest, so what a plan froze never moves under it (#729; #751 review, P3-3).
 */
export const MATERIAL_INDEXER_IDENTITY = `ai7-material-index/3+${DOCX_PARSER_IDENTITY}`;
/**
 * The indexer before this one (Issue #428), which read every format this one reads but PDF, and refused a PDF as
 * `needs-local-dependency`. Its builds stand for this indexer — they are what this one would build — except those PDF
 * refusals, which this one builds again beside them (Issue #892): a PDF is read now, and no other item is built twice, its
 * digest and any plan pinned to it unmoved.
 */
export const MATERIAL_INDEXER_PREDECESSOR = `ai7-material-index/2+${DOCX_PARSER_IDENTITY}`;
/**
 * The first indexer (#725), which read DOCX, DOC, TXT and MD as this one does and refused HTML, EPUB, ODT and RTF as
 * `format-unsupported` and PDF as `needs-local-dependency`. Its builds stand too, but for those refusals.
 */
export const MATERIAL_INDEXER_FIRST = `ai7-material-index/1+${DOCX_PARSER_IDENTITY}`;
/**
 * Which builds stand for the current indexer: its own; its predecessor's but a PDF it could not read; the first indexer's
 * but a format or a PDF it could not read. At most one of them is an item's.
 */
const STANDING_BUILD = `(indexer = ? OR (indexer = ? AND NOT (state = 'unsupported' AND json_extract(canonical_json, '$.reason') = 'needs-local-dependency'))
  OR (indexer = ? AND NOT (state = 'unsupported' AND json_extract(canonical_json, '$.reason') IN ('format-unsupported', 'needs-local-dependency'))))`;
const STANDING_PARAMETERS = [MATERIAL_INDEXER_IDENTITY, MATERIAL_INDEXER_PREDECESSOR, MATERIAL_INDEXER_FIRST] as const;
/** Where a converted working copy is written while it is read, inside the Agent Data Root; removed after, and at open. */
export const MATERIAL_INDEX_WORK_DIRECTORY = 'material-index-work';
const BUILD_SCHEMA = 'ai7.material-index/1';
const SEGMENT_SCHEMA = 'ai7.material-index-segment/1';
const TRANSLATION_SCHEMA = 'ai7.material-index-translation/1';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'material_index_builds'";
const WORK_NAME = /^\.work-[0-9a-f-]{36}\.docx$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const READABLE: ReadonlySet<LibraryMaterialFormat> = new Set(['DOCX', 'DOC', 'TXT', 'MD', 'HTML', 'EPUB', 'ODT', 'RTF', 'PDF']);
const SEGMENT_KINDS: ReadonlySet<string> = new Set(['title', 'heading', 'paragraph']);
const REASONS: ReadonlySet<MaterialIndexReason> = new Set([
  'needs-local-dependency', 'format-unsupported', 'over-bound', 'unreadable', 'original-changed', 'empty', 'encrypted', 'external-entity',
  'needs-recognition',
]);
const LAYER_TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?";
const LANGUAGES: ReadonlySet<MaterialIndexLanguage> = new Set(['zh', 'other', 'none']);

export class MaterialIndexError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MaterialIndexError';
  }
}

function requireIndex(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MaterialIndexError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

function foldSql(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim();
}

/**
 * Revision 76's relations (Issue #892), created once before the version is stamped: a store that predates them gains two
 * empty relations and nothing existing moves. A store that holds them must hold them exactly; one stamped 76 or later
 * without them is refused.
 */
export function initializeMaterialIndexLayerSchema(db: DatabaseSync, version: number): void {
  const present = Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL).filter((table) => db.prepare(LAYER_TABLE_PRESENT).get(table) !== undefined);
  if (present.length > 0) {
    validateMaterialIndexLayerSchema(db);
    return;
  }
  requireIndex(version < MATERIAL_INDEX_LAYER_REVISION, 'SCHEMA_INVALID', '资料索引的相似向量与来源译文表缺失。');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(MATERIAL_INDEX_LAYER_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(MATERIAL_INDEX_LAYER_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Material index layer schema rollback failed.');
    }
    throw error;
  }
}

/** Every relation and trigger of revision 76 exactly as written, and nothing of it missing. */
export function validateMaterialIndexLayerSchema(db: DatabaseSync): void {
  for (const [name, sql] of [...Object.entries(MATERIAL_INDEX_LAYER_SCHEMA_SQL), ...Object.entries(MATERIAL_INDEX_LAYER_TRIGGER_SQL)]) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name) as SqlRow | undefined;
    requireIndex(row !== undefined && typeof row.sql === 'string' && foldSql(row.sql) === foldSql(sql), 'SCHEMA_INVALID', '资料索引的相似向量与来源译文表结构不兼容。');
  }
}

/** Revision 67's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeMaterialIndexSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(MATERIAL_INDEX_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Material index schema rollback failed.');
    }
    throw error;
  }
}

// ---- the segment layer: sentences, and the language ---------------------------------------------------------------

/** What ends a sentence: the full stops, question and exclamation marks of Chinese and Latin text, and an ellipsis. */
const TERMINATORS: ReadonlySet<string> = new Set(['。', '！', '？', '!', '?', '…', '．']);
/** What closes a sentence after its end mark and belongs to it: closing quotes and brackets. */
const CLOSERS: ReadonlySet<string> = new Set(['”', '’', '」', '』', '）', ')', '】', '》', '〉', '"', '\'', '］', ']', '〗', '〕']);
const WHITESPACE = /\s/u;
/** A clause number: `1` of 「1. 第一条」. */
const CLAUSE_NUMBER = /^\d+$/u;
/**
 * A single Latin letter, or single Latin letters joined by full stops: `U.S` of 「The U.S. economy」. Latin only: a Han
 * character before a stop, 「好. 我们走吧.」, ends its sentence (#751 review, P1-1).
 */
const INITIALS = /^\p{Script=Latin}(?:\.\p{Script=Latin})*$/u;

/**
 * Whether a Latin full stop at `index` closes no sentence though white space follows it (#729): the sentence so far is
 * only digits — a numbered clause, 「1. 第一条」 — or the word before the stop, after a space or at the sentence's start, is
 * a single Latin letter or single Latin letters joined by full stops — an initial or an abbreviation, 「The U.S. economy」,
 * 「J. Smith」.
 * Only the word before the stop is read, and the white space before it, so a paragraph is still read once over.
 */
function heldFullStop(text: string, start: number, index: number): boolean {
  let word = index;
  while (word > start && !WHITESPACE.test(text.charAt(word - 1))) word -= 1;
  const last = text.slice(word, index);
  if (INITIALS.test(last)) return true;
  if (!CLAUSE_NUMBER.test(last)) return false;
  let before = word;
  while (before > start && WHITESPACE.test(text.charAt(before - 1))) before -= 1;
  return before === start;
}

/**
 * A paragraph's sentences, as `[start, end)` ranges of its UTF-16 code units, in order and without the white space around
 * them: a sentence ends after a run of end marks and the closing quotes or brackets that follow, a Latin full stop ends
 * one only before white space or the paragraph's end (so `3.14` stays whole) and never after a clause number or an
 * initial (`heldFullStop`), and a line break inside a paragraph ends one too. A paragraph without any end mark is one
 * sentence. Every end mark and closer is a single code unit, so no range ever splits a surrogate pair. Deterministic: the
 * same text always gives the same anchors.
 */
export function splitSentences(text: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let start = 0;
  const push = (end: number): void => {
    let from = start;
    let to = end;
    while (from < to && WHITESPACE.test(text.charAt(from))) from += 1;
    while (to > from && WHITESPACE.test(text.charAt(to - 1))) to -= 1;
    if (to > from) ranges.push([from, to]);
  };
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '\n' || character === '\r' || character === ' ' || character === ' ') {
      push(index);
      index += 1;
      start = index;
      continue;
    }
    const ends = TERMINATORS.has(character) ||
      (character === '.' && (index + 1 >= text.length || WHITESPACE.test(text.charAt(index + 1))) && !heldFullStop(text, start, index));
    if (ends) {
      let next = index + 1;
      while (next < text.length && (TERMINATORS.has(text.charAt(next)) || text.charAt(next) === '.')) next += 1;
      while (next < text.length && CLOSERS.has(text.charAt(next))) next += 1;
      push(next);
      start = next;
      index = next;
      continue;
    }
    index += 1;
  }
  push(text.length);
  return ranges;
}

const LETTER = /\p{L}/u;
const HAN = /\p{Script=Han}/u;

/**
 * The language the text is mostly in, for the Source Translation layer: Chinese when Han characters are at least half of
 * its letters, another language when they are fewer, and none when it has no letters.
 */
export function classifyLanguage(texts: Iterable<string>): MaterialIndexLanguage {
  const counts = { letters: 0, han: 0 };
  for (const text of texts) countLetters(text, counts);
  return languageOf(counts);
}

function countLetters(text: string, counts: { letters: number; han: number }): void {
  for (const character of text) {
    if (!LETTER.test(character)) continue;
    counts.letters += 1;
    if (HAN.test(character)) counts.han += 1;
  }
}

function languageOf(counts: { letters: number; han: number }): MaterialIndexLanguage {
  if (counts.letters === 0) return 'none';
  return counts.han * 2 >= counts.letters ? 'zh' : 'other';
}

// ---- a build's segments, prepared before its one write --------------------------------------------------------------

/**
 * A build's segments and the facts read from them, prepared before the transaction that records it (#729): the sentence
 * ranges, each segment's canonical record and digest, and the counts and language of its metadata.
 */
export interface PreparedMaterialIndex {
  readonly indexId: string;
  readonly extraction: MaterialExtraction;
  readonly segments: ReadonlyArray<{ readonly json: string; readonly digest: string }>;
  readonly sentences: number;
  readonly headings: number;
  readonly characters: number;
  readonly language: MaterialIndexLanguage | null;
  /** A PDF's page count (Issue #892); absent for every format without pages. */
  readonly pages?: number;
}

/**
 * How much text is prepared before the service takes its other work again (#729). Measured on the developer host, a
 * 10,000,000-character DOCX took about 0.96 s to prepare in one piece, which every request then waited behind; a slice of
 * this many code units takes about 20 ms.
 */
export const MATERIAL_INDEX_PREPARE_SLICE = 200_000;

/** The preparation, one slice at a time: it yields after each slice of text and returns what it prepared. */
function* preparing(extraction: MaterialExtraction, indexId: string): Generator<void, PreparedMaterialIndex, void> {
  const segments: Array<{ json: string; digest: string }> = [];
  let sentences = 0;
  let headings = 0;
  let characters = 0;
  let language: MaterialIndexLanguage | null = null;
  if (extraction.state === 'complete') {
    const counts = { letters: 0, han: 0 };
    let slice = 0;
    for (const [index, block] of extraction.blocks.entries()) {
      const ranges = splitSentences(block.text);
      // A paragraph of white space alone is no sentence, and is never a segment: the parser keeps none such.
      requireIndex(ranges.length > 0, 'MATERIAL_INDEX_INVALID', '资料的分段无效。');
      sentences += ranges.length;
      if (block.kind !== 'paragraph') headings += 1;
      characters += block.graphemeLength;
      countLetters(block.text, counts);
      // A PDF paragraph names its page and its place on it (Issue #892); a paragraph of any other format names neither, so its
      // record is byte for byte what it was before.
      segments.push(canonicalRecord({
        schema: SEGMENT_SCHEMA, indexId, ordinal: index + 1, kind: block.kind, level: block.level,
        sourceParagraphIndex: block.sourceParagraphIndex, text: block.text, sentences: ranges,
        ...(block.page === undefined ? {} : { page: block.page.page, pageParagraph: block.page.paragraph }),
      }));
      slice += block.text.length;
      if (slice >= MATERIAL_INDEX_PREPARE_SLICE) {
        slice = 0;
        yield;
      }
    }
    language = languageOf(counts);
  }
  return {
    indexId, extraction, segments, sentences, headings, characters, language,
    ...(extraction.pageCount === undefined ? {} : { pages: extraction.pageCount }),
  };
}

/** A build prepared in one piece: for a caller that records it at once. */
export function prepareMaterialIndex(extraction: MaterialExtraction, indexId: string = randomUUID()): PreparedMaterialIndex {
  const steps = preparing(extraction, indexId);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * A build prepared a slice at a time, the service taking its other work between two slices (#729): what one piece took
 * the requests waiting behind it no longer wait for. A stop asked meanwhile ends it before the next slice.
 */
export async function prepareMaterialIndexInSlices(extraction: MaterialExtraction, signal?: AbortSignal, indexId: string = randomUUID()): Promise<PreparedMaterialIndex> {
  const steps = preparing(extraction, indexId);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
    if (signal?.aborted === true) throw new MaterialIndexAborted();
  }
}

// ---- the text layer: extraction ------------------------------------------------------------------------------------

export interface MaterialExtractionInput {
  /** The kept original's absolute path inside the Agent Data Root. */
  readonly originalPath: string;
  readonly format: LibraryMaterialFormat;
  readonly displayName: string;
  /** The original's digest and length as its arrival recorded them. */
  readonly objectSha256: string;
  readonly bytes: number;
  readonly dataRoot: string;
  readonly signal?: AbortSignal;
}

/** One paragraph as the extraction read it; a PDF's names its page and its place on that page (Issue #892). */
export type MaterialExtractedBlock = Pick<ParsedDocxBlock, 'kind' | 'level' | 'text' | 'graphemeLength' | 'sourceParagraphIndex'> & {
  readonly page?: { readonly page: number; readonly paragraph: number };
};

export type MaterialExtraction =
  | {
    readonly state: 'complete';
    readonly converter: string;
    readonly documentTitle: string | null;
    readonly blocks: ReadonlyArray<MaterialExtractedBlock>;
    /** A PDF's page count; absent for every format without pages. */
    readonly pageCount?: number;
  }
  | {
    readonly state: 'unsupported' | 'failed';
    readonly reason: MaterialIndexReason;
    readonly converter: string | null;
    /** A PDF's page count when it was read that far (a scan that needs recognition); absent otherwise. */
    readonly pageCount?: number;
  };

/** The extraction stopped because the store is closing: nothing is recorded, and the next open builds it again. */
export class MaterialIndexAborted extends Error {
  constructor() {
    super('Material indexing stopped.');
    this.name = 'MaterialIndexAborted';
  }
}

/** The one refusal every converter and the parser give a file that holds no text at all (#725 review, P2-1). */
const NO_TEXT_REFUSAL = /文件没有可转换为稿件的文本内容|所选文件为空|DOCX contains no editable text blocks|empty DOCX/u;

function docxRefusal(error: unknown): MaterialIndexReason | null {
  if (!(error instanceof Error) || !error.message.startsWith('DOCX_REJECTED:')) return null;
  if (NO_TEXT_REFUSAL.test(error.message)) return 'empty';
  if (error.message.includes('changed during staging')) return 'original-changed';
  return /exceed|bound|too many|ratio|large/iu.test(error.message) ? 'over-bound' : 'unreadable';
}

/** Why a converter refused the file: no text in it, or anything else. */
function conversionRefusal(error: unknown): MaterialIndexReason {
  return error instanceof Error && NO_TEXT_REFUSAL.test(error.message) ? 'empty' : 'unreadable';
}

/**
 * The text layer of one original, read by the parser and converters the manuscript intake uses and inside their bounds.
 * A DOCX is read in place, with its digest and length checked as it streams; a DOC, a text or a Markdown file is read whole
 * once (within the archive bound), checked against its digest, converted, and its working copy read from the Agent Data
 * Root and removed. Nothing it reads leaves this process.
 */
export async function extractMaterialText(input: MaterialExtractionInput): Promise<MaterialExtraction> {
  if (!READABLE.has(input.format)) return { state: 'unsupported', reason: 'format-unsupported', converter: null };
  const blocks: Array<MaterialExtractedBlock> = [];
  const onBlock = (block: ParsedDocxBlock): void => {
    blocks.push({ kind: block.kind, level: block.level, text: block.text, graphemeLength: block.graphemeLength, sourceParagraphIndex: block.sourceParagraphIndex });
  };
  const aborted = (): boolean => input.signal?.aborted === true;
  const format = input.format;
  const converter = format === 'DOCX' ? DOCX_PARSER_IDENTITY
    : `${format === 'DOC' ? DOC_CONVERTER_IDENTITY : format === 'PDF' ? PDF_TEXT_CONVERTER_IDENTITY
      : isMaterialTextFormat(format) ? MATERIAL_FORMAT_CONVERTER_IDENTITIES[format] : TEXT_CONVERTER_IDENTITY}+${DOCX_PARSER_IDENTITY}`;
  try {
    if (input.format === 'DOCX') {
      const parsed = await parseDocx(input.originalPath, input.displayName, onBlock,
        { digest: input.objectSha256, bytes: input.bytes }, { ...(input.signal === undefined ? {} : { signal: input.signal }), formatIdentified: true });
      if (aborted()) throw new MaterialIndexAborted();
      if (blocks.length === 0) return { state: 'failed', reason: 'empty', converter };
      return { state: 'complete', converter, documentTitle: parsed.titleSuggestion.sourceLabel === 'DOCX 标题元数据' ? parsed.titleSuggestion.value : null, blocks };
    }
    let size: number;
    try {
      size = (await stat(input.originalPath)).size;
    } catch {
      return { state: 'failed', reason: 'original-changed', converter };
    }
    if (size !== input.bytes) return { state: 'failed', reason: 'original-changed', converter };
    if (size > MAX_ARCHIVE_BYTES) return { state: 'failed', reason: 'over-bound', converter };
    const bytes = await readFile(input.originalPath);
    if (sha256Hex(bytes) !== input.objectSha256) return { state: 'failed', reason: 'original-changed', converter };
    let docx: Uint8Array;
    // The file's own title, for the formats that name one beside their text (a page's <title>, a book's or document's
    // metadata, an RTF's information group).
    let documentTitle: string | null = null;
    // A PDF's paragraphs on their pages, in the package's paragraph order (Issue #892).
    let pages: ReadonlyArray<{ readonly page: number; readonly paragraph: number }> | null = null;
    let pageCount: number | undefined;
    try {
      if (format === 'DOC') docx = (await convertDocManuscript(bytes)).docx;
      else if (format === 'PDF') {
        const read = await extractPdfText(bytes, input.signal);
        documentTitle = read.title;
        pages = read.pages;
        pageCount = read.pageCount;
        docx = buildManuscriptPackage(read.paragraphs);
      } else if (isMaterialTextFormat(format)) {
        const read = extractMaterialFormatText(bytes, format);
        documentTitle = read.title;
        docx = buildManuscriptPackage(read.paragraphs);
      } else docx = convertTextManuscript(bytes, { format: format as 'TXT' | 'MD' }).docx;
    } catch (error) {
      if (aborted()) throw new MaterialIndexAborted();
      // A scan is not unreadable: its original and metadata stand, and its text waits for recognition AI7 does not provide.
      if (error instanceof MaterialFormatRefusal && error.reason === 'needs-recognition') return { state: 'unsupported', reason: error.reason, converter };
      if (error instanceof MaterialFormatRefusal) return { state: 'failed', reason: error.reason, converter };
      return { state: 'failed', reason: conversionRefusal(error), converter };
    }
    if (aborted()) throw new MaterialIndexAborted();
    const directory = await ensureCanonicalDataDirectory(input.dataRoot, MATERIAL_INDEX_WORK_DIRECTORY);
    const work = await inspectCanonicalDataFile(input.dataRoot, directory, `.work-${randomUUID()}.docx`);
    try {
      await writeFile(work.path, docx, { flag: 'wx' });
      await parseDocx(work.path, 'material.docx', onBlock, undefined, input.signal === undefined ? {} : { signal: input.signal });
    } finally {
      await rm(work.path, { force: true });
    }
    if (aborted()) throw new MaterialIndexAborted();
    if (blocks.length === 0) return { state: 'failed', reason: 'empty', converter };
    if (pages === null) return { state: 'complete', converter, documentTitle, blocks };
    // Each paragraph of the package is one paragraph of the PDF, in order: its source paragraph index names its page.
    const paged = blocks.map((block) => {
      const page = pages[block.sourceParagraphIndex];
      requireIndex(page !== undefined, 'MATERIAL_INDEX_INVALID', '资料的分页无效。');
      return { ...block, page };
    });
    return { state: 'complete', converter, documentTitle, blocks: paged, ...(pageCount === undefined ? {} : { pageCount }) };
  } catch (error) {
    if (error instanceof MaterialIndexAborted || aborted()) throw new MaterialIndexAborted();
    const refusal = docxRefusal(error);
    if (refusal !== null) return { state: 'failed', reason: refusal, converter };
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { state: 'failed', reason: 'original-changed', converter };
    return { state: 'failed', reason: 'unreadable', converter };
  }
}

/** What a converted working copy left behind when a build stopped mid-way: removed at open. */
export async function sweepMaterialIndexWork(dataRoot: string): Promise<void> {
  let entries: Awaited<ReturnType<typeof opendir>>;
  try {
    entries = await opendir(resolve(dataRoot, MATERIAL_INDEX_WORK_DIRECTORY));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const directory = await ensureCanonicalDataDirectory(dataRoot, MATERIAL_INDEX_WORK_DIRECTORY);
  for await (const entry of entries) {
    if (entry.isFile() && WORK_NAME.test(entry.name)) await rm((await inspectCanonicalDataFile(dataRoot, directory, entry.name)).path, { force: true });
  }
}

// ---- the ledger --------------------------------------------------------------------------------------------------

/** One build as its record holds it, verified against its row. */
interface StoredBuild {
  readonly indexId: string;
  readonly materialId: string;
  readonly state: 'complete' | 'unsupported' | 'failed';
  readonly reason: MaterialIndexReason | null;
  readonly segmentCount: number;
  readonly recordedAt: string;
  readonly sha256: string;
  readonly segmentsSha256: string | null;
  readonly metadata: NonNullable<MaterialIndexProjection['metadata']>;
}

interface StoredSegment {
  readonly ordinal: number;
  readonly kind: 'title' | 'heading' | 'paragraph';
  readonly text: string;
  readonly sentences: ReadonlyArray<readonly [number, number]>;
  readonly sha256: string;
  /** A PDF paragraph's page and its place on that page (Issue #892); `null` for every other format. */
  readonly page: number | null;
  readonly pageParagraph: number | null;
}

/** The material a build is of, as the arrival record names it. */
export interface IndexedMaterial {
  readonly materialId: string;
  /** The arrival record's digest. */
  readonly sha256: string;
  readonly format: LibraryMaterialFormat;
}

/**
 * A Task's reading boundary (KB-007, KB-009): the Book it works for and the 资料库 items its plan lists under 允许参考,
 * each pinned at the exact index version the plan froze.
 */
export interface MaterialReferenceBoundary {
  readonly bookId: string;
  readonly references: ReadonlyArray<MaterialReferencePin>;
}

export interface MaterialReferencePin {
  readonly materialId: string;
  /** The index record's digest the plan froze (KB-002). */
  readonly indexDigest: string;
}

/**
 * What a Task reads of one listed item: a page of its segments — each paragraph's text as the index extracted it (Issue #428:
 * what a 写作任务's `/3` contract takes) — each sentence with its citation.
 */
export interface MaterialTaskReading {
  readonly materialId: string;
  readonly indexDigest: string;
  readonly total: number;
  readonly segments: ReadonlyArray<{
    readonly ordinal: number;
    readonly kind: 'title' | 'heading' | 'paragraph';
    readonly text: string;
    readonly sentences: ReadonlyArray<{ readonly ordinal: number; readonly text: string; readonly citation: string }>;
  }>;
  /**
   * The 来源译文 of this page's paragraphs that were made (Issue #892): a separate layer, never the words of a segment. Each is
   * labelled 来源译文 and attributed to the paragraph it translates — a citation always names the original.
   */
  readonly translations: ReadonlyArray<{
    readonly ordinal: number;
    readonly label: typeof MATERIAL_TRANSLATION_LABEL;
    readonly text: string;
    readonly model: string;
    readonly attribution: string;
  }>;
  readonly next: number | null;
}

/**
 * One candidate of a similarity search (Issue #892; ADR 0026): a pointer to a paragraph of a pinned build, ranked by the
 * cosine of its vector and the query's, with a short preview. It is never a quotation source: the words are read where the
 * anchor points, at the pinned build (`readForTask` from `ordinal`).
 */
export interface MaterialVectorCandidate {
  readonly materialId: string;
  readonly indexDigest: string;
  readonly ordinal: number;
  readonly page: number | null;
  readonly anchor: string;
  readonly score: number;
  readonly preview: string;
}

/** A Task's similarity search over the items its plan pinned (Issue #892). */
export interface MaterialVectorQuery {
  /** The provider identity the query and the vectors it was compared with were made by. */
  readonly embedding: string;
  /** The best `k`, highest score first; ties in the items' and paragraphs' order. */
  readonly candidates: ReadonlyArray<MaterialVectorCandidate>;
  /** Pinned items whose pinned build holds no complete vectors of this provider, or a provider not ready: not searched. */
  readonly unsearched: ReadonlyArray<{ readonly materialId: string; readonly reason: 'vectors-not-built' | 'embedding-not-ready' }>;
}

/** The provider facts a projection or a search reads: what it is and whether it can embed now. */
export interface MaterialEmbeddingFacts {
  readonly identity: string;
  readonly dimensions: number;
  readonly readiness: EmbeddingReadiness;
}

/** What the store knows of the two on-request layers beyond the ledger: work under way, and whether 来源译文 may be asked. */
export interface MaterialLayerActivity {
  readonly embedding: MaterialEmbeddingFacts;
  readonly vectorsBuilding: boolean;
  readonly translating: boolean;
  readonly translationRequest: MaterialTranslationProjection['request'];
  readonly translationFailure: string | null;
}

/** One paragraph a vector or a translation is still to be made for. */
export interface MaterialLayerTarget {
  readonly ordinal: number;
  readonly text: string;
  readonly sha256: string;
}

/** The longest preview a search candidate carries, in code units. */
const PREVIEW_CODE_UNITS = 120;
/** Leave room for the page metadata and service envelope beside translated paragraphs. */
const MATERIAL_SEGMENTS_PAGE_BYTES = MAX_FRAME_BYTES - 8_192;

/** One build within 最近完成's window, as 待我处理 reads it (ATTN-009). */
export interface MaterialIndexCompletion {
  readonly materialId: string;
  readonly indexId: string;
  readonly state: 'complete' | 'unsupported' | 'failed';
  readonly recordedAt: string;
  readonly sha256: string;
}

/**
 * Whether the item is one this Book's Tasks may list under 允许参考 (KB-007): attributed to this Book or the house, with a
 * Learning Eligibility decided under that attribution and not left for later. The library ledger answers it.
 */
export type MaterialReferenceAvailability = (materialId: string, bookId: string) => boolean;

/**
 * The citation of one sentence: the item's title and its position anchor — for a PDF paragraph (Issue #892), its page and its
 * place on that page.
 */
export function materialCitation(title: string, paragraph: number, sentence: number, page: { readonly page: number; readonly paragraph: number } | null = null): string {
  return page === null ? `《${title}》第 ${paragraph} 段第 ${sentence} 句` : `《${title}》第 ${page.page} 页第 ${page.paragraph} 段第 ${sentence} 句`;
}

/** The anchor of one paragraph, as a candidate or a 来源译文 names it. */
export function materialParagraphCitation(title: string, paragraph: number, page: { readonly page: number; readonly paragraph: number } | null = null): string {
  return page === null ? `《${title}》第 ${paragraph} 段` : `《${title}》第 ${page.page} 页第 ${page.paragraph} 段`;
}

function pageOf(segment: Pick<StoredSegment, 'page' | 'pageParagraph'>): { page: number; paragraph: number } | null {
  return segment.page === null || segment.pageParagraph === null ? null : { page: segment.page, paragraph: segment.pageParagraph };
}

/** A paragraph's preview: its first characters, whole code points, with an ellipsis when cut. */
function previewOf(text: string): string {
  if (text.length <= PREVIEW_CODE_UNITS) return text;
  let end = PREVIEW_CODE_UNITS;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function naturalCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export class MaterialIndexLedger {
  readonly #db: DatabaseSync;
  /** The builds whose every segment was read and matched its digest once in this service's life. */
  readonly #verified = new Set<string>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #present(): boolean {
    return this.#db.prepare(TABLE_PRESENT).get() !== undefined;
  }

  #build(row: SqlRow): StoredBuild {
    const json = String(row.canonical_json);
    requireIndex(sha256Hex(json) === String(row.sha256), 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireIndex(isRecord(record) && record.schema === BUILD_SCHEMA && record.indexId === row.index_id && record.materialId === row.material_id &&
      record.indexer === row.indexer && record.state === row.state && record.recordedAt === row.recorded_at &&
      record.segmentCount === integer(row.segment_count) && isRecord(record.metadata) &&
      (record.reason === null ? row.state === 'complete' : row.state !== 'complete' && REASONS.has(record.reason as MaterialIndexReason)) &&
      (row.state === 'complete' ? typeof record.segmentsSha256 === 'string' && DIGEST_PATTERN.test(record.segmentsSha256) : record.segmentsSha256 === null),
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    const metadata = record.metadata;
    requireIndex((metadata.documentTitle === null || typeof metadata.documentTitle === 'string') &&
      (metadata.language === null || LANGUAGES.has(metadata.language as MaterialIndexLanguage)) &&
      naturalCount(metadata.paragraphs) && naturalCount(metadata.headings) && naturalCount(metadata.sentences) && naturalCount(metadata.characters) &&
      metadata.paragraphs === record.segmentCount && (metadata.pages === undefined || (naturalCount(metadata.pages) && metadata.pages > 0)),
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    return {
      indexId: String(row.index_id), materialId: String(row.material_id), state: row.state as StoredBuild['state'],
      reason: record.reason as MaterialIndexReason | null, segmentCount: integer(row.segment_count), recordedAt: String(row.recorded_at),
      sha256: String(row.sha256), segmentsSha256: record.segmentsSha256 as string | null,
      metadata: {
        documentTitle: metadata.documentTitle as string | null,
        language: metadata.language as MaterialIndexLanguage | null,
        paragraphs: metadata.paragraphs as number,
        headings: metadata.headings as number,
        sentences: metadata.sentences as number,
        characters: metadata.characters as number,
        pages: metadata.pages === undefined ? null : metadata.pages as number,
      },
    };
  }

  #segment(row: SqlRow, indexId: string): StoredSegment {
    const json = String(row.canonical_json);
    requireIndex(sha256Hex(json) === String(row.sha256), 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    const record = JSON.parse(json) as unknown;
    const ordinal = integer(row.ordinal);
    requireIndex(isRecord(record) && record.schema === SEGMENT_SCHEMA && record.indexId === indexId && record.ordinal === ordinal &&
      SEGMENT_KINDS.has(record.kind as string) && typeof record.text === 'string' && record.text.length > 0 && Array.isArray(record.sentences) &&
      record.sentences.length > 0 &&
      // A PDF paragraph names both its page and its place on it; any other names neither (Issue #892).
      ((record.page === undefined && record.pageParagraph === undefined) ||
        (naturalCount(record.page) && record.page > 0 && naturalCount(record.pageParagraph) && record.pageParagraph > 0)),
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    const text = record.text;
    let previous = 0;
    const sentences = (record.sentences as unknown[]).map((range) => {
      requireIndex(Array.isArray(range) && range.length === 2 && naturalCount(range[0]) && naturalCount(range[1]) &&
        range[0] >= previous && range[1] > range[0] && range[1] <= text.length,
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
      previous = range[1] as number;
      return [range[0], range[1]] as const;
    });
    return {
      ordinal, kind: record.kind as StoredSegment['kind'], text, sentences, sha256: String(row.sha256),
      page: record.page === undefined ? null : record.page as number,
      pageParagraph: record.pageParagraph === undefined ? null : record.pageParagraph as number,
    };
  }

  /** The build that stands for the current indexer for one item (`STANDING_BUILD`), verified; `null` before one is made. */
  current(materialId: string): StoredBuild | null {
    if (!this.#present()) return null;
    const row = this.#db.prepare(`SELECT * FROM material_index_builds WHERE material_id = ? AND ${STANDING_BUILD} ORDER BY indexer = ? DESC LIMIT 1`)
      .get(materialId, ...STANDING_PARAMETERS, MATERIAL_INDEXER_IDENTITY) as SqlRow | undefined;
    return row === undefined ? null : this.#build(row);
  }

  /** The items that still wait for a build standing for the current indexer, oldest arrival first. */
  unindexed(): string[] {
    if (!this.#present()) return [];
    return (this.#db.prepare(
      `SELECT m.material_id FROM library_materials m
       WHERE NOT EXISTS (SELECT 1 FROM material_index_builds WHERE material_id = m.material_id AND ${STANDING_BUILD})
       ORDER BY m.recorded_at, m.material_id`,
    ).all(...STANDING_PARAMETERS) as SqlRow[]).map((row) => String(row.material_id));
  }

  /**
   * One build recorded, inside the caller's transaction: the extraction's state, the metadata and layer facts, and — for a
   * complete one — every paragraph as a segment with its sentence ranges, the build naming the digest over them all.
   * Refused when the item already has a build by this indexer; nothing of an earlier build is touched. The segments come
   * prepared (`prepareMaterialIndexInSlices`, #729), or are prepared here in one piece.
   */
  record(material: IndexedMaterial, extraction: MaterialExtraction | PreparedMaterialIndex, recordedAt = new Date().toISOString()): string {
    requireIndex(UUID_PATTERN.test(material.materialId) && DIGEST_PATTERN.test(material.sha256), 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(this.#db.prepare('SELECT 1 FROM library_materials WHERE material_id = ? AND sha256 = ?').get(material.materialId, material.sha256) !== undefined,
      'MATERIAL_INDEX_MATERIAL_MOVED', '资料库里没有这份资料。');
    requireIndex(this.current(material.materialId) === null, 'MATERIAL_INDEX_EXISTS', '这份资料的索引已经建好。');
    const prepared = 'indexId' in extraction ? extraction : prepareMaterialIndex(extraction);
    const { indexId, segments, sentences, headings, characters, language, pages } = prepared;
    const read = prepared.extraction;
    const build = canonicalRecord({
      schema: BUILD_SCHEMA,
      indexId,
      materialId: material.materialId,
      materialSha256: material.sha256,
      indexer: MATERIAL_INDEXER_IDENTITY,
      converter: read.converter,
      state: read.state,
      reason: read.state === 'complete' ? null : read.reason,
      segmentCount: segments.length,
      segmentsSha256: read.state === 'complete' ? sha256Hex(segments.map((segment) => segment.digest).join('\n')) : null,
      metadata: {
        documentTitle: read.state === 'complete' ? read.documentTitle : null,
        language,
        paragraphs: segments.length,
        headings,
        sentences,
        characters,
        // A PDF's page count (Issue #892); a build of any other format names none, its record unchanged.
        ...(pages === undefined ? {} : { pages }),
      },
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO material_index_builds(index_id, material_id, indexer, state, segment_count, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(indexId, material.materialId, MATERIAL_INDEXER_IDENTITY, read.state, segments.length, recordedAt, build.json, build.digest);
    const insert = this.#db.prepare('INSERT INTO material_index_segments(index_id, ordinal, canonical_json, sha256) VALUES (?, ?, ?, ?)');
    segments.forEach((segment, index) => insert.run(indexId, index + 1, segment.json, segment.digest));
    return indexId;
  }

  /**
   * The item's index as its card reads it (KB-009): every layer's state honestly, recognition (OCR) as not provided. `queue`
   * says whether the store is building it now or it waits its turn, when no build exists yet; `activity` what the store is
   * making of the two on-request layers (Issue #892) and whether 来源译文 may be asked.
   */
  projection(material: IndexedMaterial, queue: 'queued' | 'indexing', activity: MaterialLayerActivity): MaterialIndexProjection {
    const build = this.current(material.materialId);
    if (build === null) {
      return {
        state: queue, reason: null, builtAt: null, digest: null, metadata: null, vectors: null, translation: null,
        layers: {
          original: 'complete', metadata: 'pending', text: 'pending', recognition: material.format === 'PDF' ? 'pending' : 'not-needed',
          translation: 'pending', segments: 'pending', vectors: 'pending',
        },
      };
    }
    const text: MaterialIndexLayerState = build.state === 'complete' ? 'complete'
      : build.reason === 'needs-local-dependency' ? 'deferred' : build.state;
    // A scan's text waits for recognition, which is not provided (OCR, Issue #892): said, never imitated.
    const recognition: MaterialIndexLayerState = build.reason === 'needs-recognition' || build.reason === 'needs-local-dependency' && material.format === 'PDF'
      ? 'deferred' : 'not-needed';
    let vectors: MaterialVectorsProjection | null = null;
    let translation: MaterialTranslationProjection | null = null;
    if (build.state === 'complete') {
      const facts = this.#vectorFacts(build.indexId, activity.embedding.identity);
      const readiness = activity.embedding.readiness;
      vectors = {
        state: readiness.state !== 'ready' ? 'needs-model' : activity.vectorsBuilding ? 'building' : facts.built === build.segmentCount ? 'complete' : 'not-built',
        embedding: activity.embedding.identity,
        dimensions: activity.embedding.dimensions,
        built: facts.built,
        total: build.segmentCount,
        builtAt: facts.builtAt,
        expectedDigest: readiness.state === 'ready' ? null : readiness.expectedDigest,
      };
      if (build.metadata.language === 'other') {
        const translated = this.#translationFacts(build.indexId);
        const lastAttempt = this.lastTranslationAttempt(build.indexId);
        translation = {
          state: activity.translating ? 'building' : translated.translated === build.segmentCount ? 'complete' : translated.translated > 0 ? 'partial' : 'not-built',
          translated: translated.translated,
          total: build.segmentCount,
          model: translated.model,
          request: translated.translated === build.segmentCount
            ? { available: false, reason: '每段都已有来源译文。' }
            : activity.translating ? { available: false, reason: '正在生成来源译文。' } : activity.translationRequest,
          lastFailure: activity.translationFailure ?? (lastAttempt === null || lastAttempt.outcome === 'translated' ? null : lastAttempt.outcome === 'outcome-unknown'
            ? '结果待确认：本次来源译文可能已计费，没有完整结果；不会自动重发。'
            : `来源译文没有完成（${lastAttempt.provenance.failureCode}）；不会自动重发。`),
          ...(lastAttempt === null ? {} : { lastAttempt }),
        };
      }
    }
    return {
      state: build.state,
      reason: build.reason,
      builtAt: build.recordedAt,
      digest: build.sha256,
      metadata: build.metadata,
      vectors,
      translation,
      layers: {
        original: 'complete', metadata: 'complete', text, recognition,
        translation: translation?.state ?? (build.state !== 'complete' ? text : 'not-needed'),
        segments: text,
        vectors: vectors?.state ?? text,
      },
    };
  }

  /** Every segment of a complete build read once and matched against the digest its build names; then remembered. */
  #verify(build: StoredBuild): void {
    if (this.#verified.has(build.indexId)) return;
    const rows = this.#db.prepare('SELECT * FROM material_index_segments WHERE index_id = ? ORDER BY ordinal').iterate(build.indexId) as IterableIterator<SqlRow>;
    const digests: string[] = [];
    let ordinal = 0;
    for (const row of rows) {
      ordinal += 1;
      const segment = this.#segment(row, build.indexId);
      requireIndex(segment.ordinal === ordinal, 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
      digests.push(segment.sha256);
    }
    requireIndex(ordinal === build.segmentCount && sha256Hex(digests.join('\n')) === build.segmentsSha256,
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    this.#verified.add(build.indexId);
  }

  #complete(materialId: string): StoredBuild {
    const build = this.current(materialId);
    requireIndex(build !== null, 'MATERIAL_INDEX_NOT_READY', '这份资料的索引还没有建好。');
    requireIndex(build.state === 'complete', 'MATERIAL_INDEX_NO_TEXT', '这份资料没有提取出可分段的文字。');
    this.#verify(build);
    return build;
  }

  /**
   * The build a plan pinned (#729): read whichever indexer made it, so a plan pinned before a later indexer built the item
   * again still reads what it froze, for as long as this data keeps that build — builds are append-only, so only data
   * replaced or merged from elsewhere loses one, and then the plan is told its version is gone.
   */
  #pinned(materialId: string, indexDigest: string): StoredBuild {
    const row = DIGEST_PATTERN.test(indexDigest) && this.#present()
      ? this.#db.prepare('SELECT * FROM material_index_builds WHERE material_id = ? AND sha256 = ?').get(materialId, indexDigest) as SqlRow | undefined
      : undefined;
    requireIndex(row !== undefined, 'MATERIAL_INDEX_MOVED', '计划冻结的这份资料的索引版本已不在本机。');
    const build = this.#build(row);
    requireIndex(build.state === 'complete', 'MATERIAL_INDEX_NO_TEXT', '这份资料没有提取出可分段的文字。');
    this.#verify(build);
    return build;
  }

  #segments(indexId: string, from: number, count: number): StoredSegment[] {
    return (this.#db.prepare('SELECT * FROM material_index_segments WHERE index_id = ? AND ordinal >= ? ORDER BY ordinal LIMIT ?')
      .all(indexId, from, count) as SqlRow[]).map((row) => this.#segment(row, indexId));
  }

  /** A bounded window with translations attached; the byte bound includes JSON escaping and UTF-8. */
  #pageSegments(build: StoredBuild, from: number, count: number, backwards = false): MaterialSegmentsPageProjection['segments'] {
    const segments = this.#segments(build.indexId, from, count);
    const translations = this.#translations(build, segments);
    const rows = segments.map((segment) => ({
      ordinal: segment.ordinal, kind: segment.kind, text: segment.text, sentences: segment.sentences,
      page: segment.page, pageParagraph: segment.pageParagraph,
      translation: translations.get(segment.ordinal) ?? null,
    }));
    if (backwards) rows.reverse();
    const page: typeof rows = [];
    let bytes = 2;
    for (const row of rows) {
      const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
      if (bytes + size > MATERIAL_SEGMENTS_PAGE_BYTES) break;
      page.push(row);
      bytes += size;
    }
    requireIndex(page.length > 0, 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录超出读取范围。');
    return backwards ? page.reverse() : page;
  }

  /**
   * 查看分段 (KB-009): one page of the item's paragraphs from `from`, each with its sentence ranges, a PDF paragraph with its
   * page, and each paragraph's 来源译文 beside it when one was made (Issue #892); read-only.
   */
  page(materialId: string, title: string, from: number): MaterialSegmentsPageProjection {
    requireIndex(UUID_PATTERN.test(materialId) && Number.isSafeInteger(from) && from >= 1, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const build = this.#complete(materialId);
    requireIndex(from <= build.segmentCount, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const segments = this.#pageSegments(build, from, MAX_MATERIAL_SEGMENTS_PAGE);
    const last = from + segments.length - 1;
    const previousFrom = Math.max(1, from - MAX_MATERIAL_SEGMENTS_PAGE);
    return {
      materialId,
      title,
      indexDigest: build.sha256,
      total: build.segmentCount,
      from,
      segments,
      next: last < build.segmentCount ? last + 1 : null,
      previous: from > 1 ? this.#pageSegments(build, previousFrom, from - previousFrom, true)[0]!.ordinal : null,
    };
  }

  /**
   * What a plan freezes when it lists the item under 允许参考: the item and its index version, only for an item this Book's
   * Tasks may list and whose text was read. The plan's 发送 line, not this pin, says what of it may leave.
   */
  referencePin(materialId: string, bookId: string, available: MaterialReferenceAvailability): MaterialReferencePin {
    requireIndex(UUID_PATTERN.test(materialId) && UUID_PATTERN.test(bookId), 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(available(materialId, bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料还不能列进这本书任务的「允许参考」。');
    return { materialId, indexDigest: this.#complete(materialId).sha256 };
  }

  /**
   * A Task's read of the index (KB-009): read-only, and only within its plan boundary — an item the plan lists, at the index
   * version the plan pinned, that this Book's Tasks may still list. Anything else is refused, and nothing is written, sent
   * or scheduled by reading. The sentences come with their citations, so whatever the Task makes of them cites its source.
   */
  readForTask(boundary: MaterialReferenceBoundary, materialId: string, title: string, from: number, available: MaterialReferenceAvailability): MaterialTaskReading {
    requireIndex(UUID_PATTERN.test(boundary.bookId) && UUID_PATTERN.test(materialId) && Number.isSafeInteger(from) && from >= 1,
      'MATERIAL_INDEX_INVALID', '资料标识无效。');
    const pin = boundary.references.find((reference) => reference.materialId === materialId);
    requireIndex(pin !== undefined, 'MATERIAL_OUTSIDE_PLAN', '这份资料不在这项任务计划的「允许参考」里。');
    requireIndex(available(materialId, boundary.bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料现在不能列进这本书任务的「允许参考」。');
    const build = this.#pinned(materialId, pin.indexDigest);
    requireIndex(from <= build.segmentCount, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const segments = this.#segments(build.indexId, from, MAX_MATERIAL_SEGMENTS_PAGE);
    const last = from + segments.length - 1;
    const translations = this.#translations(build, segments);
    return {
      materialId,
      indexDigest: build.sha256,
      total: build.segmentCount,
      segments: segments.map((segment) => ({
        ordinal: segment.ordinal,
        kind: segment.kind,
        text: segment.text,
        sentences: segment.sentences.map(([start, end], index) => ({
          ordinal: index + 1, text: segment.text.slice(start, end), citation: materialCitation(title, segment.ordinal, index + 1, pageOf(segment)),
        })),
      })),
      translations: segments.flatMap((segment) => {
        const translation = translations.get(segment.ordinal);
        return translation === undefined ? [] : [{
          ordinal: segment.ordinal, label: MATERIAL_TRANSLATION_LABEL, text: translation.text, model: translation.model,
          attribution: materialParagraphCitation(title, segment.ordinal, pageOf(segment)),
        }];
      }),
      next: last < build.segmentCount ? last + 1 : null,
    };
  }

  /**
   * A Task's re-check of a frozen pin before it consumes the material again (Issue #759): the read `readForTask` makes, without
   * reading a segment's text. The pinned build is matched as `#pinned` does, and its segment rows' digests — ordinals and digest
   * columns only, never the cached verification — against the digest the build names, so a row replaced or lost since is seen.
   */
  verifyForTask(boundary: MaterialReferenceBoundary, materialId: string, available: MaterialReferenceAvailability): void {
    const pin = boundary.references.find((reference) => reference.materialId === materialId);
    requireIndex(pin !== undefined, 'MATERIAL_OUTSIDE_PLAN', '这份资料不在这项任务计划的「允许参考」里。');
    requireIndex(available(materialId, boundary.bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料现在不能列进这本书任务的「允许参考」。');
    const build = this.#pinned(materialId, pin.indexDigest);
    const digests: string[] = [];
    for (const row of this.#db.prepare('SELECT ordinal, sha256 FROM material_index_segments WHERE index_id = ? ORDER BY ordinal').iterate(build.indexId) as IterableIterator<SqlRow>) {
      requireIndex(row.ordinal === digests.length + 1 && typeof row.sha256 === 'string', 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
      digests.push(row.sha256);
    }
    requireIndex(digests.length === build.segmentCount && sha256Hex(digests.join('\n')) === build.segmentsSha256,
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
  }

  /** The builds standing for the current indexer recorded since `since`, newest first, at most `limit` (索引完成, ATTN-009). */
  completions(since: string, limit: number): MaterialIndexCompletion[] {
    requireIndex(Number.isSafeInteger(limit) && limit >= 0, 'MATERIAL_INDEX_CURSOR_INVALID', '资料索引列表数量无效。');
    if (!this.#present()) return [];
    return (this.#db.prepare(
      `SELECT * FROM material_index_builds WHERE ${STANDING_BUILD} AND recorded_at >= ? ORDER BY recorded_at DESC, index_id DESC LIMIT ?`,
    ).all(...STANDING_PARAMETERS, since, limit) as SqlRow[]).map((row) => {
      const build = this.#build(row);
      return { materialId: build.materialId, indexId: build.indexId, state: build.state, recordedAt: build.recordedAt, sha256: build.sha256 };
    });
  }

  // ---- the two on-request layers (Issue #892) ------------------------------------------------------------------------

  #layerPresent(table: keyof typeof MATERIAL_INDEX_LAYER_SCHEMA_SQL | keyof typeof MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL): boolean {
    return this.#db.prepare(LAYER_TABLE_PRESENT).get(table) !== undefined;
  }

  /** How many of a build's paragraphs have their vector by `embedding`, and when the last was recorded. */
  #vectorFacts(indexId: string, embedding: string): { built: number; builtAt: string | null } {
    if (!this.#layerPresent('material_index_vectors')) return { built: 0, builtAt: null };
    const row = this.#db.prepare('SELECT count(*) AS built, max(recorded_at) AS built_at FROM material_index_vectors WHERE index_id = ? AND embedding = ?')
      .get(indexId, embedding) as SqlRow;
    return { built: integer(row.built), builtAt: row.built_at === null ? null : String(row.built_at) };
  }

  /** How many of a build's paragraphs have their 来源译文, and the model that made the latest. */
  #translationFacts(indexId: string): { translated: number; model: string | null } {
    if (!this.#layerPresent('material_index_translations')) return { translated: 0, model: null };
    const row = this.#db.prepare(
      `SELECT count(*) AS translated,
        (SELECT model FROM material_index_translations WHERE index_id = ? ORDER BY recorded_at DESC, ordinal DESC LIMIT 1) AS model
       FROM material_index_translations WHERE index_id = ?`,
    ).get(indexId, indexId) as SqlRow;
    return { translated: integer(row.translated), model: row.model === null ? null : String(row.model) };
  }

  /** One recorded 来源译文, verified against its digest, its columns, its build and the paragraph it translates. */
  #translation(row: SqlRow, build: StoredBuild, segment: StoredSegment): { text: string; model: string } {
    const json = String(row.canonical_json);
    requireIndex(sha256Hex(json) === String(row.sha256), 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的来源译文记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireIndex(isRecord(record) && record.schema === TRANSLATION_SCHEMA && record.indexId === build.indexId && record.indexSha256 === build.sha256 &&
      record.ordinal === segment.ordinal && record.segmentSha256 === segment.sha256 && row.segment_sha256 === segment.sha256 &&
      record.label === MATERIAL_TRANSLATION_LABEL && typeof record.text === 'string' && record.text.length > 0 &&
      record.model === row.model && record.recordedAt === row.recorded_at,
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的来源译文记录已损坏。');
    return { text: record.text, model: String(row.model) };
  }

  /** The 来源译文 recorded for these paragraphs of a verified build, by ordinal. */
  #translations(build: StoredBuild, segments: ReadonlyArray<StoredSegment>): Map<number, { text: string; model: string }> {
    const found = new Map<number, { text: string; model: string }>();
    if (segments.length === 0 || !this.#layerPresent('material_index_translations')) return found;
    const byOrdinal = new Map(segments.map((segment) => [segment.ordinal, segment]));
    const rows = this.#db.prepare('SELECT * FROM material_index_translations WHERE index_id = ? AND ordinal BETWEEN ? AND ? ORDER BY ordinal')
      .all(build.indexId, segments[0]!.ordinal, segments.at(-1)!.ordinal) as SqlRow[];
    for (const row of rows) {
      const segment = byOrdinal.get(integer(row.ordinal));
      if (segment !== undefined) found.set(segment.ordinal, this.#translation(row, build, segment));
    }
    return found;
  }

  /** A complete current build's paragraphs that still lack a row in `table` (by `embedding` for vectors), at most `limit`. */
  #targets(build: StoredBuild, table: 'material_index_vectors' | 'material_index_translations', embedding: string | null, limit: number): MaterialLayerTarget[] {
    const rows = (table === 'material_index_vectors'
      ? this.#db.prepare(`SELECT s.* FROM material_index_segments s WHERE s.index_id = ? AND NOT EXISTS
          (SELECT 1 FROM material_index_vectors v WHERE v.index_id = s.index_id AND v.embedding = ? AND v.ordinal = s.ordinal) ORDER BY s.ordinal LIMIT ?`)
        .all(build.indexId, embedding, limit)
      : this.#db.prepare(`SELECT s.* FROM material_index_segments s WHERE s.index_id = ? AND NOT EXISTS
          (SELECT 1 FROM material_index_translations t WHERE t.index_id = s.index_id AND t.ordinal = s.ordinal) ORDER BY s.ordinal LIMIT ?`)
        .all(build.indexId, limit)) as SqlRow[];
    return rows.map((row) => {
      const segment = this.#segment(row, build.indexId);
      return { ordinal: segment.ordinal, text: segment.text, sha256: segment.sha256 };
    });
  }

  /**
   * 构建相似索引's next paragraphs (Issue #892): the item's current build — complete, every segment verified — and up to
   * `limit` of its paragraphs without a vector by `embedding`, in order. None left means its vectors are complete.
   */
  vectorTargets(materialId: string, embedding: string, limit: number): { indexId: string; indexSha256: string; total: number; targets: MaterialLayerTarget[] } {
    requireIndex(UUID_PATTERN.test(materialId) && Number.isSafeInteger(limit) && limit >= 1, 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(this.#layerPresent('material_index_vectors'), 'MATERIAL_INDEX_NOT_READY', '这份资料的相似索引还不能建立。');
    const build = this.#complete(materialId);
    return { indexId: build.indexId, indexSha256: build.sha256, total: build.segmentCount, targets: this.#targets(build, 'material_index_vectors', embedding, limit) };
  }

  /**
   * Some paragraphs' vectors recorded, inside the caller's transaction (Issue #892): each against the build it was made from,
   * by its digest, and the segment digest it was made from; a paragraph that already has its vector by this identity, or a
   * build that is gone, refuses the write. Nothing earlier is touched.
   */
  recordVectors(
    target: { readonly indexId: string; readonly indexSha256: string },
    embedding: { readonly identity: string; readonly dimensions: number },
    rows: ReadonlyArray<{ readonly ordinal: number; readonly sha256: string; readonly vector: Float32Array }>,
    recordedAt = new Date().toISOString(),
  ): void {
    const build = this.#db.prepare('SELECT sha256 FROM material_index_builds WHERE index_id = ?').get(target.indexId) as SqlRow | undefined;
    requireIndex(build !== undefined && build.sha256 === target.indexSha256, 'MATERIAL_INDEX_MOVED', '这份资料的索引版本已不在本机。');
    const segment = this.#db.prepare('SELECT sha256 FROM material_index_segments WHERE index_id = ? AND ordinal = ?');
    const insert = this.#db.prepare(
      `INSERT INTO material_index_vectors(index_id, index_sha256, embedding, ordinal, segment_sha256, dimensions, vector, norm, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      requireIndex(row.vector.length === embedding.dimensions && row.vector.every(Number.isFinite), 'MATERIAL_INDEX_INVALID', '相似向量无效。');
      requireIndex((segment.get(target.indexId, row.ordinal) as SqlRow | undefined)?.sha256 === row.sha256, 'MATERIAL_INDEX_MOVED', '这份资料的分段已不是建立相似索引时读到的样子。');
      insert.run(target.indexId, target.indexSha256, embedding.identity, row.ordinal, row.sha256, embedding.dimensions, vectorBytes(row.vector), vectorNorm(row.vector), recordedAt);
    }
  }

  /**
   * Every vector of a verified build by `embedding`, each matched to its build's digest, the segment it was made from, its
   * dimensions and its recorded norm; `null` when not every paragraph has one yet.
   */
  #vectors(build: StoredBuild, embedding: MaterialEmbeddingFacts): Array<{ ordinal: number; vector: Float32Array; norm: number }> | null {
    if (!this.#layerPresent('material_index_vectors')) return null;
    const rows = this.#db.prepare(
      `SELECT v.*, s.sha256 AS segment_row_sha256 FROM material_index_vectors v
       LEFT JOIN material_index_segments s ON s.index_id = v.index_id AND s.ordinal = v.ordinal
       WHERE v.index_id = ? AND v.embedding = ? ORDER BY v.ordinal`,
    ).all(build.indexId, embedding.identity) as SqlRow[];
    if (rows.length !== build.segmentCount) return null;
    return rows.map((row, index) => {
      const bytes = row.vector instanceof Uint8Array ? row.vector : null;
      const vector = bytes === null ? null : vectorFromBytes(bytes, embedding.dimensions);
      const norm = Number(row.norm);
      requireIndex(integer(row.ordinal) === index + 1 && row.index_sha256 === build.sha256 && row.segment_sha256 === row.segment_row_sha256 &&
        integer(row.dimensions) === embedding.dimensions && vector !== null && Math.abs(vectorNorm(vector) - norm) <= 1e-4 * Math.max(1, norm),
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的相似向量记录已损坏。');
      return { ordinal: index + 1, vector, norm };
    });
  }

  /**
   * The best `k` of a build's paragraphs for a query vector: highest cosine first, the earlier paragraph first on a tie. A
   * paragraph nothing like the query (a cosine of zero or less) is no candidate.
   */
  #rank(vectors: ReadonlyArray<{ ordinal: number; vector: Float32Array; norm: number }>, query: Float32Array, k: number): Array<{ ordinal: number; score: number }> {
    const queryNorm = vectorNorm(query);
    return vectors.map((entry) => ({ ordinal: entry.ordinal, score: cosineSimilarity(entry.vector, entry.norm, query, queryNorm) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
      .slice(0, k);
  }

  #segmentAt(indexId: string, ordinal: number): StoredSegment {
    const row = this.#db.prepare('SELECT * FROM material_index_segments WHERE index_id = ? AND ordinal = ?').get(indexId, ordinal) as SqlRow | undefined;
    requireIndex(row !== undefined, 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    return this.#segment(row, indexId);
  }

  /**
   * 相似段落检索 in an item's 查看索引 (Issue #892): its current build's paragraphs nearest the query, by the vectors the editor
   * built; read-only. Refused while the vectors are not complete, or the provider cannot embed.
   */
  search(materialId: string, embedding: MaterialEmbeddingFacts, query: Float32Array, k: number): MaterialVectorSearchProjection {
    requireIndex(UUID_PATTERN.test(materialId) && Number.isSafeInteger(k) && k >= 1 && k <= MAX_MATERIAL_VECTOR_CANDIDATES, 'MATERIAL_INDEX_INVALID', '检索条件无效。');
    const build = this.#complete(materialId);
    requireIndex(embedding.readiness.state === 'ready', 'MATERIAL_VECTORS_NEED_MODEL', '相似索引的模型文件不在本机或摘要不符。');
    const vectors = this.#vectors(build, embedding);
    requireIndex(vectors !== null, 'MATERIAL_VECTORS_NOT_BUILT', '这份资料的相似索引还没有建好：先「构建相似索引」。');
    return {
      materialId,
      indexDigest: build.sha256,
      embedding: embedding.identity,
      candidates: this.#rank(vectors, query, k).map(({ ordinal, score }) => {
        const segment = this.#segmentAt(build.indexId, ordinal);
        return { ordinal, page: segment.page, pageParagraph: segment.pageParagraph, score: Math.round(score * 10_000) / 10_000, preview: previewOf(segment.text) };
      }),
    };
  }

  /**
   * A Task's similarity search (Issue #892; ADR 0026, ADR 0047): read-only, within its plan boundary exactly as `readForTask`
   * — every item searched is one its plan lists, at the build its plan pinned, which this Book's Tasks may still list; an item
   * named that the plan does not list, an item no longer referable, or a pinned build gone, refuses the whole search. Each
   * pinned build is searched by its own vectors; one without complete vectors of this provider is listed as not searched,
   * never built here. Nothing is written, sent or scheduled, and no scope, egress or learning eligibility follows from it.
   */
  queryForTask(
    boundary: MaterialReferenceBoundary,
    materialIds: ReadonlyArray<string> | undefined,
    embedding: MaterialEmbeddingFacts,
    query: Float32Array | null,
    k: number,
    available: MaterialReferenceAvailability,
    titleOf: (materialId: string) => string,
  ): MaterialVectorQuery {
    requireIndex(UUID_PATTERN.test(boundary.bookId) && Number.isSafeInteger(k) && k >= 1 && k <= MAX_MATERIAL_VECTOR_CANDIDATES &&
      (materialIds === undefined || materialIds.every((id) => UUID_PATTERN.test(id))), 'MATERIAL_INDEX_INVALID', '检索条件无效。');
    const pins = materialIds === undefined ? boundary.references : materialIds.map((materialId) => {
      const pin = boundary.references.find((reference) => reference.materialId === materialId);
      requireIndex(pin !== undefined, 'MATERIAL_OUTSIDE_PLAN', '这份资料不在这项任务计划的「允许参考」里。');
      return pin;
    });
    const builds = pins.map((pin) => {
      requireIndex(available(pin.materialId, boundary.bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料现在不能列进这本书任务的「允许参考」。');
      return { pin, build: this.#pinned(pin.materialId, pin.indexDigest) };
    });
    const unsearched: Array<MaterialVectorQuery['unsearched'][number]> = [];
    const ranked: Array<{ materialId: string; build: StoredBuild; ordinal: number; score: number }> = [];
    for (const { pin, build } of builds) {
      if (embedding.readiness.state !== 'ready' || query === null) {
        unsearched.push({ materialId: pin.materialId, reason: 'embedding-not-ready' });
        continue;
      }
      const vectors = this.#vectors(build, embedding);
      if (vectors === null) {
        unsearched.push({ materialId: pin.materialId, reason: 'vectors-not-built' });
        continue;
      }
      for (const entry of this.#rank(vectors, query, k)) ranked.push({ materialId: pin.materialId, build, ...entry });
    }
    const order = new Map(builds.map(({ pin }, index) => [pin.materialId, index]));
    const best = ranked.sort((left, right) => right.score - left.score || order.get(left.materialId)! - order.get(right.materialId)! || left.ordinal - right.ordinal).slice(0, k);
    return {
      embedding: embedding.identity,
      candidates: best.map(({ materialId, build, ordinal, score }) => {
        const segment = this.#segmentAt(build.indexId, ordinal);
        return {
          materialId, indexDigest: build.sha256, ordinal, page: segment.page,
          anchor: materialParagraphCitation(titleOf(materialId), ordinal, pageOf(segment)),
          score: Math.round(score * 10_000) / 10_000,
          preview: previewOf(segment.text),
        };
      }),
      unsearched,
    };
  }

  /**
   * 生成来源译文's next paragraphs (Issue #892): the item's current build — complete, every segment verified, its text not
   * Chinese — and up to `limit` of its paragraphs without a 来源译文, in order. None left means every paragraph has one.
   */
  translationTargets(materialId: string, limit: number): { indexId: string; indexSha256: string; total: number; targets: MaterialLayerTarget[] } {
    requireIndex(UUID_PATTERN.test(materialId) && Number.isSafeInteger(limit) && limit >= 1, 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(this.#layerPresent('material_index_translations'), 'MATERIAL_INDEX_NOT_READY', '这份资料的来源译文还不能生成。');
    const build = this.#complete(materialId);
    requireIndex(build.metadata.language === 'other', 'MATERIAL_TRANSLATION_NOT_NEEDED', '这份资料是中文，不需要来源译文。');
    return { indexId: build.indexId, indexSha256: build.sha256, total: build.segmentCount, targets: this.#targets(build, 'material_index_translations', null, limit) };
  }

  /** How many of the item's current build's paragraphs still have no 来源译文. */
  translationRemaining(materialId: string): number {
    const build = this.#complete(materialId);
    return build.segmentCount - this.#translationFacts(build.indexId).translated;
  }

  /**
   * Some paragraphs' 来源译文 recorded, inside the caller's transaction (Issue #892): each labelled, attributed to the paragraph
   * it translates by the build's digest and the segment's own digest, and naming the model, route, rule and contract it was
   * made under. A paragraph that already has one, or a build that is gone, refuses the write; nothing earlier is touched.
   */
  recordTranslations(
    target: { readonly indexId: string; readonly indexSha256: string },
    made: { readonly model: string; readonly route: string; readonly policyRuleId: string | null; readonly promptContractDigest: string; readonly provenance?: FastRoleProvenance },
    rows: ReadonlyArray<{ readonly ordinal: number; readonly sha256: string; readonly text: string }>,
    recordedAt = new Date().toISOString(),
  ): void {
    const build = this.#db.prepare('SELECT sha256 FROM material_index_builds WHERE index_id = ?').get(target.indexId) as SqlRow | undefined;
    requireIndex(build !== undefined && build.sha256 === target.indexSha256, 'MATERIAL_INDEX_MOVED', '这份资料的索引版本已不在本机。');
    requireIndex(made.model.length >= 1 && made.model.length <= 256 && DIGEST_PATTERN.test(made.promptContractDigest), 'MATERIAL_INDEX_INVALID', '来源译文的来历无效。');
    const segment = this.#db.prepare('SELECT sha256 FROM material_index_segments WHERE index_id = ? AND ordinal = ?');
    const insert = this.#db.prepare(
      `INSERT INTO material_index_translations(index_id, ordinal, segment_sha256, model, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      requireIndex(row.text.length > 0 && row.text.isWellFormed(), 'MATERIAL_INDEX_INVALID', '来源译文无效。');
      requireIndex((segment.get(target.indexId, row.ordinal) as SqlRow | undefined)?.sha256 === row.sha256, 'MATERIAL_INDEX_MOVED', '这份资料的分段已不是请求来源译文时读到的样子。');
      const record = canonicalRecord({
        schema: TRANSLATION_SCHEMA, indexId: target.indexId, indexSha256: target.indexSha256, ordinal: row.ordinal, segmentSha256: row.sha256,
        label: MATERIAL_TRANSLATION_LABEL, text: row.text, model: made.model, route: made.route, policyRuleId: made.policyRuleId,
        promptContractDigest: made.promptContractDigest, recordedAt,
        ...(made.provenance === undefined ? {} : { provenance: made.provenance }),
      });
      insert.run(target.indexId, row.ordinal, row.sha256, made.model, recordedAt, record.json, record.digest);
    }
  }

  lastTranslationAttempt(indexId: string): MaterialTranslationAttemptProjection | null {
    if (!this.#layerPresent('material_translation_attempts')) return null;
    const row = this.#db.prepare('SELECT * FROM material_translation_attempts WHERE index_id = ? ORDER BY rowid DESC LIMIT 1').get(indexId);
    return row === undefined ? null : readTranslationAttempt(this.#db, row);
  }

  /** Caller owns the transaction, together with successful translations when any exist. */
  recordTranslationAttempt(target: { readonly indexId: string; readonly indexSha256: string }, sourceSha256: string,
    batch: ReadonlyArray<{ readonly ordinal: number; readonly sha256: string }>, outcome: MaterialTranslationAttemptProjection['outcome'],
    provenance: ModelTextAttemptProvenance): void {
    requireIndex(isModelTextAttemptProvenance(provenance), 'MATERIAL_INDEX_INVALID', '来源译文尝试来历无效。');
    const attemptId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: 'ai7.material-translation-attempt/1', attemptId, indexId: target.indexId, indexSha256: target.indexSha256,
      sourceSha256, batch: batch.map(({ ordinal, sha256 }) => ({ ordinal, sha256 })), recordedAt, outcome, provenance });
    const row = { attempt_id: attemptId, index_id: target.indexId, outcome, recorded_at: recordedAt, canonical_json: record.json, sha256: record.digest };
    readTranslationAttempt(this.#db, row);
    this.#db.prepare('INSERT INTO material_translation_attempts(attempt_id, index_id, outcome, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(attemptId, target.indexId, outcome, recordedAt, record.json, record.digest);
  }
}
