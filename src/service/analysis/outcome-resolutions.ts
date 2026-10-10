import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalRecord, isRecord, parseCanonicalJson, requireAnalysis } from './canonical.js';

/**
 * 人工结果确认 — Manual Outcome Resolution (Issue #757; execution CONTEXT.md, ARCHITECTURE.md's failure table: an ambiguous
 * provider outcome requires reconciliation or Manual Outcome Resolution; V2-UX-ATTN-002, NOTIF-004, CTRL-007).
 *
 * A Run that keeps no progress, or a step after the ranges — the reduction, a sample, the reflection — reaches its Task Outcome
 * holding a request whose result cannot be known: it was sent, its answer never came back whole, and whether the model service
 * processed and billed it nobody here can verify. 待我处理 holds it in 异常与结果待确认 until a later Run of the kind reads the
 * range to a result, or until the editor determines it: 保留为缺口. That determination is the editor's own — retained with its
 * manual evidence class, never presented as a verification — and it changes nothing else: the gap stays a gap in its revision,
 * and a later Task that sends the range again still says so in its plan.
 *
 * Schema revision 68 owns one append-only relation: each resolution names the Book, and its canonical record names the exact
 * outcomes it settles by their keys (the kind, the Run that sent the request, and the range's content key or the step), so a
 * resolution never reaches an outcome that arrived after the editor read the list. It names those Runs by identity rather than
 * by a foreign key into the analysis ledger, whose relations later revisions may rebuild.
 */
export const OUTCOME_RESOLUTION_SCHEMA_SQL = {
  analysis_outcome_resolutions: `CREATE TABLE analysis_outcome_resolutions (
  resolution_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  resolved_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

/** A resolution is appended once and never rewritten or removed, like every ledger row. */
export const OUTCOME_RESOLUTION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(OUTCOME_RESOLUTION_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign key of the relation, in the exact-schema validator's own spelling. */
export const OUTCOME_RESOLUTION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  analysis_outcome_resolutions: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
};

const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_outcome_resolutions'";
const RESOLUTION_SCHEMA = 'ai7.analysis.outcome-resolution/1';
/** The one determination the editor can make here: the request's result stays unknown, and its range or step stays a gap. */
export const OUTCOME_RESOLUTION_DETERMINATION = 'kept-as-gap' as const;
/** The evidence class every such determination carries: the editor's own, never a system verification. */
export const OUTCOME_RESOLUTION_EVIDENCE = 'manual' as const;
/** The most outcomes one resolution names — a Book's whole list, bounded as every list a read returns is. */
export const OUTCOME_RESOLUTION_LIMIT = 500;

/** Revision 68's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeOutcomeResolutionSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(OUTCOME_RESOLUTION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(OUTCOME_RESOLUTION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Outcome resolution schema rollback failed.');
    }
    throw error;
  }
}

type SqlRow = Record<string, SQLOutputValue>;

/** The resolutions of the editor's Books: which outcomes each settled, read back from their own canonical records. */
export class OutcomeResolutionLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every outcome key a resolution of this Book settled. */
  resolvedKeys(bookId: string): Set<string> {
    const keys = new Set<string>();
    for (const row of this.#db.prepare('SELECT canonical_json FROM analysis_outcome_resolutions WHERE book_id = ? ORDER BY rowid').all(bookId) as SqlRow[]) {
      const record = parseCanonicalJson(String(row.canonical_json));
      requireAnalysis(isRecord(record) && record.schema === RESOLUTION_SCHEMA && Array.isArray(record.outcomes), 'ANALYSIS_RECORD_INVALID', '人工结果确认记录无效。');
      for (const key of record.outcomes) if (typeof key === 'string') keys.add(key);
    }
    return keys;
  }

  /**
   * The editor's 保留为缺口 over exactly these outcomes of one Book, read on one surface (the Task kind whose plan showed them).
   * Nothing else is written, and nothing is sent.
   */
  record(bookId: string, surface: string, outcomes: ReadonlyArray<string>, now: Date = new Date()): { resolutionId: string; resolvedAt: string } {
    requireAnalysis(outcomes.length > 0 && outcomes.length <= OUTCOME_RESOLUTION_LIMIT, 'ANALYSIS_RECORD_INVALID', '人工结果确认没有可确认的结果。');
    const resolutionId = randomUUID();
    const resolvedAt = now.toISOString();
    const record = canonicalRecord({
      schema: RESOLUTION_SCHEMA,
      resolutionId,
      bookId,
      surface,
      determination: OUTCOME_RESOLUTION_DETERMINATION,
      evidenceClass: OUTCOME_RESOLUTION_EVIDENCE,
      outcomes: [...outcomes].sort(),
      resolvedAt,
    });
    this.#db.prepare('INSERT INTO analysis_outcome_resolutions(resolution_id, book_id, resolved_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(resolutionId, bookId, resolvedAt, record.json, record.digest);
    return { resolutionId, resolvedAt };
  }
}
