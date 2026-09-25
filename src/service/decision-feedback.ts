import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ProposalItemDecisionProjection } from '../shared/protocol.js';
import { canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * The Contextual Feedback Prompt of a Proposal Decision (Issue #61, plan slice S26a; V2-UX-FDBK-001 to FDBK-007, PDEC-009,
 * PDEC-010, PDEC-015, MARK-005). A decision just recorded offers one optional reason; the first reason the editor gives —
 * from `为什么这样改` or a chip — stays where revision 22 keeps it, in `proposal_decision_reasons`. This relation holds what
 * follows it, per decision: the editor's `不说明`, which records only that no reason was given and never that the editor
 * agreed, disagreed or was satisfied (FDBK-007), and each later change of the reason, a successor that keeps the reason it
 * replaced (PDEC-008's rule for the decision itself, applied to its reason).
 *
 * Nothing here is a Quality Signal of its own: the decision already is one (FDBK-003). Nothing grants Learning Eligibility,
 * raises an attention item or asks again (FDBK-008); a new decision that supersedes this one may be asked once, for itself.
 *
 * Schema revision 49 owns the one relation, a ledger like the others: appended once and never rewritten, each row's record
 * canonical, digested and chained to the one before it.
 */

export const DECISION_FEEDBACK_SCHEMA_SQL = {
  proposal_decision_feedback: `CREATE TABLE proposal_decision_feedback (
  feedback_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES proposal_item_decisions(decision_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('dismissed', 'revised')),
  supersedes_feedback_id TEXT REFERENCES proposal_decision_feedback(feedback_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_feedback_id IS NULL)),
  UNIQUE(decision_id, ordinal)
) STRICT`,
} as const;

export const DECISION_FEEDBACK_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(DECISION_FEEDBACK_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DECISION_FEEDBACK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DECISION_FEEDBACK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const DECISION_FEEDBACK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  proposal_decision_feedback: [
    'decision_id>proposal_item_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'supersedes_feedback_id>proposal_decision_feedback.feedback_id:NO ACTION/NO ACTION/NONE',
  ],
};

const RECORD_SCHEMA = 'ai7.proposal-decision-feedback/1';
/** Who gives the reason, as the other editor records of this device name it. */
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'proposal_decision_feedback'";

export class DecisionFeedbackError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DecisionFeedbackError';
  }
}

function requireFeedback(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DecisionFeedbackError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

/** Revision 49's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeDecisionFeedbackSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DECISION_FEEDBACK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DECISION_FEEDBACK_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Decision feedback schema rollback failed.');
    }
    throw error;
  }
}

/** One entry after a decision: the editor's 不说明, or a reason that replaced the one before it. */
export interface DecisionFeedbackEntry {
  readonly feedbackId: string;
  readonly ordinal: number;
  readonly kind: 'dismissed' | 'revised';
  readonly reason: { readonly text: string; readonly source: 'suggested' | 'free-text' } | null;
  readonly supersedes: string | null;
  readonly recordedAt: string;
}

/** A decision's reason as it now stands, for its card (FDBK-006, FDBK-007, PDEC-010). */
export type DecisionReasonStanding = Pick<ProposalItemDecisionProjection, 'reason' | 'reasonSource' | 'reasonState' | 'feedbackEntries' | 'reasonRevisedAt'>;

export class DecisionFeedbackLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** The entries after one decision, in order, each verified: its digest, its record against its row, and its place. */
  entries(decisionId: string): DecisionFeedbackEntry[] {
    const rows = this.#db.prepare('SELECT * FROM proposal_decision_feedback WHERE decision_id = ? ORDER BY ordinal').all(decisionId) as SqlRow[];
    let before: DecisionFeedbackEntry | null = null;
    return rows.map((row) => {
      const json = String(row.canonical_json);
      requireFeedback(sha256Hex(json) === String(row.sha256), 'DECISION_FEEDBACK_RECORD_INVALID', '处理原因的记录已损坏。');
      const record = JSON.parse(json) as unknown;
      const ordinal = Number(row.ordinal);
      const kind = String(row.kind) as DecisionFeedbackEntry['kind'];
      const reason = (isRecord(record) ? record.reason : undefined) as DecisionFeedbackEntry['reason'] | undefined;
      requireFeedback(isRecord(record) && record.schema === RECORD_SCHEMA && record.feedbackId === row.feedback_id &&
        record.decisionId === decisionId && record.ordinal === ordinal && record.kind === kind && record.recordedAt === row.recorded_at &&
        record.actor === ACTOR && (record.supersedes ?? null) === (row.supersedes_feedback_id ?? null) &&
        (record.supersedes ?? null) === (before?.feedbackId ?? null) && ordinal === (before?.ordinal ?? 0) + 1 &&
        (kind === 'dismissed'
          ? reason === null
          : reason !== null && reason !== undefined && typeof reason.text === 'string' && reason.text.length > 0 &&
            (reason.source === 'suggested' || reason.source === 'free-text')),
      'DECISION_FEEDBACK_RECORD_INVALID', '处理原因的记录已损坏。');
      const entry: DecisionFeedbackEntry = {
        feedbackId: String(row.feedback_id),
        ordinal,
        kind,
        reason: kind === 'revised' ? { text: reason!.text, source: reason!.source } : null,
        supersedes: before?.feedbackId ?? null,
        recordedAt: String(row.recorded_at),
      };
      before = entry;
      return entry;
    });
  }

  /**
   * The reason as the card reads it: the latest change, else the first reason, else the editor's 不说明, else none. A
   * dismissal records only that no reason was given; a reason given afterwards, of the editor's own accord, stands.
   */
  standing(decisionId: string, first: { readonly reason: string; readonly source: 'reason-field' | 'suggested' | 'free-text' } | null): DecisionReasonStanding {
    const entries = this.entries(decisionId);
    const revised = entries.filter((entry) => entry.kind === 'revised').at(-1);
    if (revised !== undefined) {
      return { reason: revised.reason!.text, reasonSource: revised.reason!.source, reasonState: 'given', feedbackEntries: entries.length, reasonRevisedAt: revised.recordedAt };
    }
    if (first !== null) return { reason: first.reason, reasonSource: first.source, reasonState: 'given', feedbackEntries: entries.length, reasonRevisedAt: null };
    return {
      reason: null,
      reasonSource: null,
      reasonState: entries.some((entry) => entry.kind === 'dismissed') ? 'dismissed' : 'none',
      feedbackEntries: entries.length,
      reasonRevisedAt: null,
    };
  }

  /**
   * `不说明` or `改原因`, inside the caller's transaction, for the decision the card shows — refused when the entries moved
   * since the editor read them, when there is a reason to dismiss or none to change, or when it would change nothing.
   */
  record(input: {
    readonly bookId: string;
    readonly markId: string;
    readonly decisionId: string;
    readonly expectedFeedback: number;
    readonly action: 'dismiss' | 'revise';
    readonly reason: { readonly text: string; readonly source: 'suggested' | 'free-text' } | null;
    readonly first: { readonly reason: string; readonly source: 'reason-field' | 'suggested' | 'free-text' } | null;
  }): void {
    const entries = this.entries(input.decisionId);
    requireFeedback(entries.length === input.expectedFeedback, 'DECISION_FEEDBACK_MOVED', '这次处理的原因刚被改过；请看过现在的原因再改。');
    const standing = this.standing(input.decisionId, input.first);
    if (input.action === 'dismiss') {
      requireFeedback(standing.reasonState !== 'given', 'DECISION_FEEDBACK_INVALID', '这次处理已经说明了原因。');
      requireFeedback(standing.reasonState !== 'dismissed', 'DECISION_FEEDBACK_UNCHANGED', '已经记下「不说明」。');
      requireFeedback(input.reason === null, 'DECISION_FEEDBACK_INVALID', '「不说明」不带原因。');
    } else {
      requireFeedback(standing.reasonState === 'given', 'DECISION_FEEDBACK_INVALID', '这次处理还没有原因可改；请先补充原因。');
      requireFeedback(input.reason !== null, 'DECISION_FEEDBACK_INVALID', '请选一个原因或写下原因。');
      requireFeedback(input.reason.text !== standing.reason, 'DECISION_FEEDBACK_UNCHANGED', '原因没有变化。');
    }
    const last = entries.at(-1) ?? null;
    const feedbackId = randomUUID();
    const ordinal = entries.length + 1;
    const kind = input.action === 'dismiss' ? 'dismissed' : 'revised';
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      feedbackId,
      decisionId: input.decisionId,
      markId: input.markId,
      bookId: input.bookId,
      ordinal,
      kind,
      reason: input.action === 'dismiss' ? null : { text: input.reason!.text, source: input.reason!.source },
      supersedes: last?.feedbackId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO proposal_decision_feedback(feedback_id, decision_id, ordinal, kind, supersedes_feedback_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(feedbackId, input.decisionId, ordinal, kind, last?.feedbackId ?? null, recordedAt, record.json, record.digest);
  }
}
