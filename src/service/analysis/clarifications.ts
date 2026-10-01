import type { DatabaseSync } from 'node:sqlite';

/**
 * Clarification Requests of a Run (Issue #422, plan slice S76d; V2-UX-CLAR-001 to CLAR-007, INPUT-001 to INPUT-004).
 * Schema revision 35 adds two append-only relations. A request is what the Run asked the editor at an adaptation the
 * editor moved into 先问你 — a unit's safe retry — bound to the Run, its attempt, the unit and the plan version, with
 * the question and the failure that raised it in its canonical record. An answer is the editor's one reply to it: the
 * option chosen, the note that qualifies it, and when. Neither is ever rewritten; an answer grants no authority, and
 * the Run it continues goes on inside its unchanged envelope.
 */
export const CLARIFICATION_SCHEMA_SQL = {
  analysis_clarification_requests: `CREATE TABLE analysis_clarification_requests (
  request_id TEXT PRIMARY KEY,
  run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
  unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('ask-first-adaptation')),
  raised_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(run_record_id, unit_ordinal)
) STRICT`,
  analysis_clarification_answers: `CREATE TABLE analysis_clarification_answers (
  answer_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES analysis_clarification_requests(request_id),
  option_id TEXT NOT NULL CHECK(option_id IN ('retry', 'record-gap')),
  answered_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

/** A request and its answer are appended once and never rewritten or removed, like every ledger row. */
export const CLARIFICATION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(CLARIFICATION_SCHEMA_SQL).flatMap((table) => [
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

/** The foreign keys of the two relations, in the exact-schema validator's own spelling. */
export const CLARIFICATION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  analysis_clarification_requests: ['run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE'],
  analysis_clarification_answers: ['request_id>analysis_clarification_requests.request_id:NO ACTION/NO ACTION/NONE'],
};

export class ClarificationSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ClarificationSchemaError';
  }
}

/**
 * Revision 35's relations and their ledger triggers, created once and never rebuilt: a store that predates them gains
 * two empty relations and nothing existing moves. Shape-detected like revision 33's, and run before the version is
 * stamped in `task-authorization.ts`.
 */
export function initializeClarificationSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_clarification_requests'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(CLARIFICATION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(CLARIFICATION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Clarification schema rollback failed.');
    }
    throw error;
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new ClarificationSchemaError('SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
  }
}

/**
 * One Clarification Request of a Run as the ledger keeps it, each read back against its digest: the unit whose retry
 * waits, the failure that raised it, what its first attempt cost, and the editor's answer once there is one.
 */
export interface ClarificationFacts {
  readonly requestId: string;
  readonly runRecordId: string;
  readonly attemptId: string;
  readonly taskIntentId: string;
  readonly unitOrdinal: number;
  readonly planVersion: number;
  readonly raisedAt: string;
  readonly requestDigest: string;
  readonly failure: { readonly code: string; readonly failureClass: string; readonly status: number | null; readonly reason: string };
  readonly firstPayloadDigest: string | null;
  /**
   * The digest of the unit message the first attempt submitted, which a retry must repeat byte for byte (Issue #286);
   * `null` on a request recorded before it was kept.
   */
  readonly firstUnitMessageDigest: string | null;
  readonly firstUsage: { readonly inputTokens: number; readonly outputTokens: number } | null;
  /** How long the first attempt took, so the unit's wall time counts it once it settles. */
  readonly firstWallMs: number;
  readonly answer: null | {
    readonly answerId: string;
    readonly optionId: ClarificationOptionId;
    readonly note: string | null;
    readonly answeredAt: string;
  };
}

/** The canonical record schemas of a request and of its answer. */
export const CLARIFICATION_REQUEST_SCHEMA = 'ai7.clarification-request/1' as const;
export const CLARIFICATION_ANSWER_SCHEMA = 'ai7.clarification-answer/1' as const;

/** The words a unit settles with when the editor answered 不重试，记为缺口 (CLAR-006). */
export const CLARIFICATION_RECORD_GAP = '按你的回答，这个阅读范围不重试，记为缺口' as const;
/** …and when the Run was cancelled, or ended otherwise, while its question was still open (CLAR-007 keeps the question). */
export const CLARIFICATION_CANCELLED_UNANSWERED = '任务取消时它还在等你的回答，没有重试' as const;
export const CLARIFICATION_ENDED_UNANSWERED = '任务结束时它还在等你的回答，没有重试' as const;
/** …and when the editor had answered, but the Run was cancelled, or ended otherwise, before it went on by that answer. */
export const CLARIFICATION_CANCELLED_ANSWERED = '任务取消时还没有按你的回答接着做，没有重试' as const;
export const CLARIFICATION_ENDED_ANSWERED = '任务结束时还没有按你的回答接着做，没有重试' as const;

/** The Run's own detail when it stops for its questions (CLAR-004): what it read, and which units wait for the answer. */
export function awaitingClarificationDetail(waitingOrdinals: ReadonlyArray<number>, settled: number, total: number): string {
  const units = waitingOrdinals.map((ordinal) => `第 ${ordinal} 个`).join('、');
  return `已读完 ${settled} / ${total} 个阅读范围；${units}阅读范围在等你的回答，回答后接着做。`;
}

/** The two answers a safe retry asked first can have. */
export const CLARIFICATION_OPTION_IDS = ['retry', 'record-gap'] as const;
export type ClarificationOptionId = (typeof CLARIFICATION_OPTION_IDS)[number];
/** The longest note an answer may carry, in UTF-16 code units. */
export const CLARIFICATION_NOTE_MAX = 500;
