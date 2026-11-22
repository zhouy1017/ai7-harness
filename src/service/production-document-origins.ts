import { appendOnly } from './append-only.js';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalRecord, sha256Hex } from './analysis/canonical.js';

/**
 * How a Production Document's origin material was read (Issue #547, a #415 follow-up; schema revision 42). 从来源材料创建
 * reads the material's text with every tracked change rejected and leaves its comments out, so none of its 批注与修订
 * enters the document. One row per document, recorded in the transaction that makes it, keeps how many there were, so the
 * document says so for as long as it exists, not only in the notice that opens it once.
 *
 * A document made before revision 42 has no row: how its material was read was never counted, and nothing guesses it.
 */
export const PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL = {
  production_document_origin_readings: `CREATE TABLE production_document_origin_readings (
  document_id TEXT PRIMARY KEY REFERENCES production_documents(document_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  reading TEXT NOT NULL CHECK(reading = 'tracked-changes-rejected-comments-left-out'),
  marks_not_carried INTEGER NOT NULL CHECK(marks_not_carried >= 0),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const PRODUCTION_DOCUMENT_ORIGIN_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  production_document_origin_readings: 'PRODUCTION_DOCUMENT_ORIGIN_LEDGER_IMMUTABLE',
});

export class ProductionDocumentOriginError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProductionDocumentOriginError';
  }
}

function requireOrigin(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ProductionDocumentOriginError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.production-document-origin-reading/1';
const READING = 'tracked-changes-rejected-comments-left-out';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'production_document_origin_readings'";

function originRecord(documentId: string, sourceVersionId: string, marksNotCarried: number, recordedAt: string) {
  return canonicalRecord({ schema: RECORD_SCHEMA, documentId, sourceVersionId, reading: READING, marksNotCarried, recordedAt });
}

/** How the document's material was read, recorded with the document: the caller holds the transaction that makes it. */
export function recordProductionDocumentOrigin(
  db: DatabaseSync,
  input: { documentId: string; sourceVersionId: string; marksNotCarried: number; recordedAt: string },
): void {
  requireOrigin(Number.isSafeInteger(input.marksNotCarried) && input.marksNotCarried >= 0, 'PRODUCTION_DOCUMENT_ORIGIN_INVALID', '来源材料的批注与修订数目无效。');
  const record = originRecord(input.documentId, input.sourceVersionId, input.marksNotCarried, input.recordedAt);
  db.prepare(
    `INSERT INTO production_document_origin_readings(
       document_id, source_version_id, reading, marks_not_carried, recorded_at, canonical_json, sha256
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.documentId, input.sourceVersionId, READING, input.marksNotCarried, input.recordedAt, record.json, record.digest);
}

/**
 * How many of the origin material's 批注与修订 the document did not carry, from its verified record; `null` for a document
 * made before the count was recorded.
 */
export function productionDocumentOriginMarks(db: DatabaseSync, documentId: string, sourceVersionId: string): number | null {
  if (db.prepare(TABLE_PRESENT).get() === undefined) return null;
  const row = db.prepare('SELECT * FROM production_document_origin_readings WHERE document_id = ?').get(documentId) as SqlRow | undefined;
  if (row === undefined) return null;
  const marks = row.marks_not_carried;
  requireOrigin(typeof marks === 'number' && Number.isSafeInteger(marks) && typeof row.recorded_at === 'string' &&
    typeof row.canonical_json === 'string' && typeof row.sha256 === 'string' && row.source_version_id === sourceVersionId,
  'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的来源读取记录无效。');
  const expected = originRecord(documentId, sourceVersionId, marks, row.recorded_at);
  requireOrigin(expected.json === row.canonical_json && expected.digest === row.sha256 && sha256Hex(row.canonical_json) === row.sha256,
    'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的来源读取记录与其摘要不一致。');
  return marks;
}
