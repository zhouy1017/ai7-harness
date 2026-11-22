import { appendOnly } from '../append-only.js';
import { stripModelJsonFence } from './canonical.js';

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
  model_question_json TEXT,
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
export const CLARIFICATION_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  analysis_clarification_requests: 'TASK_LEDGER_IMMUTABLE',
  analysis_clarification_answers: 'TASK_LEDGER_IMMUTABLE',
});

export class ClarificationSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ClarificationSchemaError';
  }
}

/**
 * One Clarification Request of a Run as the ledger keeps it, each read back against its digest: the unit whose retry
 * waits, the failure that raised it, what its first attempt cost, and the editor's answer once there is one.
 */
export interface ClarificationFacts {
  /** Absent on legacy/product requests; model data is covered by the request's canonical digest. */
  readonly origin?: 'product' | 'model';
  readonly modelQuestion?: ModelClarificationQuestion;
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
  readonly firstAttempts?: number;
  readonly answer: null | {
    readonly answerId: string;
    readonly optionId: AnyClarificationOptionId;
    readonly note: string | null;
    readonly answeredAt: string;
    /** The service clock recorded 不回答 after 24 hours; absent when the editor answered. */
    readonly timedOut?: true;
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

export interface ModelClarificationQuestion {
  readonly question: string;
  readonly options?: ReadonlyArray<string>;
  readonly freeTextAllowed: boolean;
}

export type ModelClarificationOptionId = `model-option-${0 | 1 | 2 | 3}` | 'free-text' | 'no-answer';
export type AnyClarificationOptionId = ClarificationOptionId | ModelClarificationOptionId;
export const MODEL_CLARIFICATION_TIMEOUT_HOURS = 24;
export const MODEL_CLARIFICATION_NO_ANSWER = '不回答';

export function clarificationGraphemes(text: string): number {
  return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length;
}

/** Questions are a closed alternative to a unit result, never an extra field on one. */
export function parseModelClarification(text: string): ModelClarificationQuestion | null {
  let value: unknown;
  try { value = JSON.parse(stripModelJsonFence(text)) as unknown; } catch { return null; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.every((key) => ['question', 'options', 'freeTextAllowed'].includes(key)) ||
      typeof record.question !== 'string' || !record.question.isWellFormed() || record.question.trim() === '' || clarificationGraphemes(record.question) > 500 ||
      typeof record.freeTextAllowed !== 'boolean') return null;
  const options = record.options;
  if (options !== undefined && (!Array.isArray(options) || options.length > 4 || options.some((option) =>
    typeof option !== 'string' || !option.isWellFormed() || option.trim() === '' || clarificationGraphemes(option) > 100) || new Set(options).size !== options.length)) return null;
  if (!record.freeTextAllowed && (options === undefined || (options as string[]).length === 0)) return null;
  return { question: record.question, ...(options === undefined ? {} : { options: options as string[] }), freeTextAllowed: record.freeTextAllowed };
}

export function modelClarificationExpired(request: ClarificationFacts, now: number): boolean {
  return request.origin === 'model' && request.answer === null && now >= Date.parse(request.raisedAt) + MODEL_CLARIFICATION_TIMEOUT_HOURS * 3_600_000;
}
