import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  ANALYSIS_FEEDBACK_DIMENSIONS,
  ANALYSIS_FEEDBACK_JUDGMENTS,
  ANALYSIS_FEEDBACK_OTHER,
  ANALYSIS_QUALITY_METRIC_DEFINITION,
  analysisFeedbackReasonOffered,
  type AnalysisFeedbackDimension,
  type AnalysisFeedbackJudgment,
} from '../shared/analysis-feedback.js';
import {
  MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES,
  type AnalysisFeedbackItemProjection,
  type AnalysisFeedbackProjection,
  type AnalysisFeedbackSignalProjection,
  type AnalysisQualityMetricProjection,
  type AnalysisSourceRangeProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type RecordAnalysisFeedbackInput,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';

/**
 * ②A 分析反馈 (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to FDBK-008): the Analysis Feedback Card
 * records each explicit judgment the editor makes of one item of a baseline analysis — the book's synopsis, or one entry of
 * its four lists — as an immutable Quality Signal bound to the exact Result Set Revision, the kind and the dimension, the
 * item and the digest of exactly what it says, and the evidence it cites. A changed judgment is a successor signal; the one
 * it succeeds stays on record. Silence is never approval: an item nobody judged has no signal, and the Analysis Quality
 * Metric counts only judgments, one Book at a time.
 *
 * A signal grants nothing: no factual truth, Learning Eligibility, policy, artifact update, source scope, Effect, Enrollment
 * or Apply; it raises no attention item and asks nothing again (FDBK-008).
 *
 * Schema revision 48 owns one relation, a ledger like the others: each signal, chained per item of a revision — each after
 * the first names the one it succeeds — appended once and never rewritten. It names its revision by identity and digest
 * rather than by a foreign key into the analysis ledger, whose relations later revisions may rebuild.
 */

export const ANALYSIS_FEEDBACK_SCHEMA_SQL = {
  analysis_feedback_signals: `CREATE TABLE analysis_feedback_signals (
  signal_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  revision_id TEXT NOT NULL CHECK(length(revision_id) = 36),
  item_key TEXT NOT NULL CHECK(length(item_key) BETWEEN 1 AND 64),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  judgment TEXT NOT NULL CHECK(judgment IN ('accurate', 'inaccurate', 'incomplete')),
  supersedes_signal_id TEXT REFERENCES analysis_feedback_signals(signal_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(revision_id, item_key, ordinal)
) STRICT`,
} as const;

export const ANALYSIS_FEEDBACK_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(ANALYSIS_FEEDBACK_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'ANALYSIS_FEEDBACK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'ANALYSIS_FEEDBACK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const ANALYSIS_FEEDBACK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  analysis_feedback_signals: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'supersedes_signal_id>analysis_feedback_signals.signal_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class AnalysisFeedbackError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AnalysisFeedbackError';
  }
}

function requireFeedback(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AnalysisFeedbackError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.analysis-feedback-signal/1';
const ITEM_SCHEMA = 'ai7.analysis-feedback-item/1';
const LINEAGE_SCHEMA = 'ai7.analysis-quality-metric-lineage/1';
/** Who judges, as the other editor records of this device name it. */
export const ANALYSIS_FEEDBACK_ACTOR = '本机编辑' as const;
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_feedback_signals'";
const CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;

/** Revision 48's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeAnalysisFeedbackSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(ANALYSIS_FEEDBACK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(ANALYSIS_FEEDBACK_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Analysis feedback schema rollback failed.');
    }
    throw error;
  }
}

/** One item of a revision as feedback names it, with the evidence it cites. */
export interface AnalysisFeedbackItem {
  readonly itemKey: string;
  readonly dimension: AnalysisFeedbackDimension;
  readonly index: number;
  readonly digest: string;
  readonly evidence: { readonly unitOrdinals: ReadonlyArray<number>; readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> };
}

function itemDigest(dimension: AnalysisFeedbackDimension, value: unknown): string {
  return sha256Hex(canonicalJson({ schema: ITEM_SCHEMA, dimension, value }));
}

/**
 * Every item of a revision the editor may judge, in the page's order: the synopsis when there is one, then each entry of
 * 人物与名称, 事件, 关系 and 设定. An item is named by its place in the revision, which never changes, and by the digest of
 * exactly what it says.
 */
export function analysisFeedbackItems(revision: Pick<BaselineAnalysisResultSetRevisionProjection, 'synthesis'>): AnalysisFeedbackItem[] {
  const { synthesis } = revision;
  const items: AnalysisFeedbackItem[] = [];
  if (synthesis.synopsis.length > 0) {
    items.push({ itemKey: 'synopsis', dimension: 'synopsis', index: 0, digest: itemDigest('synopsis', synthesis.synopsis), evidence: { unitOrdinals: [], sourceRanges: [] } });
  }
  synthesis.entities.forEach((entity, index) => items.push({
    itemKey: `entities/${index}`, dimension: 'entities', index, digest: itemDigest('entities', entity),
    evidence: { unitOrdinals: entity.unitOrdinals, sourceRanges: entity.sourceRanges },
  }));
  synthesis.events.forEach((event, index) => items.push({
    itemKey: `events/${index}`, dimension: 'events', index, digest: itemDigest('events', event),
    evidence: { unitOrdinals: [event.unitOrdinal], sourceRanges: event.sourceRanges },
  }));
  synthesis.relationships.forEach((relationship, index) => items.push({
    itemKey: `relationships/${index}`, dimension: 'relationships', index, digest: itemDigest('relationships', relationship),
    evidence: { unitOrdinals: relationship.unitOrdinals, sourceRanges: relationship.sourceRanges },
  }));
  synthesis.settingClaims.forEach((claim, index) => items.push({
    itemKey: `settings/${index}`, dimension: 'settings', index, digest: itemDigest('settings', claim),
    evidence: { unitOrdinals: [claim.unitOrdinal], sourceRanges: claim.sourceRanges },
  }));
  return items;
}

function feedbackText(value: string | null, what: string): string | null {
  if (value === null) return null;
  const text = value.replace(/\r\n?/gu, '\n').trim();
  if (text.length === 0) return null;
  requireFeedback(graphemeCount(text) <= MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES, 'ANALYSIS_FEEDBACK_TEXT_TOO_LONG',
    `${what}要在 ${MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES} 字以内。`);
  requireFeedback(!CONTROL_CHARACTER.test(text), 'ANALYSIS_FEEDBACK_TEXT_INVALID', `${what}含有不能显示的控制字符。`);
  return text;
}

interface StoredSignal extends AnalysisFeedbackSignalProjection {
  readonly bookId: string;
  readonly revisionId: string;
  readonly itemKey: string;
  readonly dimension: AnalysisFeedbackDimension;
  readonly ordinal: number;
  readonly sha256: string;
}

/** A revision as feedback binds it: its identity, the digest of its record and its number. */
export interface AnalysisFeedbackRevision {
  readonly revisionId: string;
  readonly digest: string;
  readonly ordinal: number;
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function dimensionOf(itemKey: string): AnalysisFeedbackDimension | null {
  const dimension = itemKey === 'synopsis' ? 'synopsis' : itemKey.slice(0, itemKey.indexOf('/'));
  return ANALYSIS_FEEDBACK_DIMENSIONS.includes(dimension as AnalysisFeedbackDimension) ? dimension as AnalysisFeedbackDimension : null;
}

export class AnalysisFeedbackLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Signals by row, each verified: its digest, its record against its row, and its place in its item's chain. */
  #signals(where: string, ...values: string[]): StoredSignal[] {
    const rows = this.#db.prepare(`SELECT * FROM analysis_feedback_signals WHERE ${where} ORDER BY revision_id, item_key, ordinal`).all(...values) as SqlRow[];
    const last = new Map<string, { signalId: string; ordinal: number }>();
    return rows.map((row) => {
      const json = String(row.canonical_json);
      requireFeedback(sha256Hex(json) === String(row.sha256), 'ANALYSIS_FEEDBACK_RECORD_INVALID', '分析反馈记录已损坏。');
      const record = JSON.parse(json) as unknown;
      const chain = `${String(row.revision_id)}\n${String(row.item_key)}`;
      const before = last.get(chain) ?? null;
      const dimension = dimensionOf(String(row.item_key));
      const ordinal = integer(row.ordinal);
      requireFeedback(isRecord(record) && record.schema === RECORD_SCHEMA && record.signalId === row.signal_id && record.bookId === row.book_id &&
        record.revisionId === row.revision_id && record.itemKey === row.item_key && record.ordinal === ordinal &&
        record.judgment === row.judgment && record.recordedAt === row.recorded_at && record.actor === ANALYSIS_FEEDBACK_ACTOR &&
        dimension !== null && record.dimension === dimension && (record.supersedes ?? null) === (row.supersedes_signal_id ?? null) &&
        (record.supersedes ?? null) === (before?.signalId ?? null) && ordinal === (before?.ordinal ?? 0) + 1,
      'ANALYSIS_FEEDBACK_RECORD_INVALID', '分析反馈记录已损坏。');
      last.set(chain, { signalId: String(row.signal_id), ordinal });
      return {
        signalId: String(row.signal_id),
        bookId: String(row.book_id),
        revisionId: String(row.revision_id),
        itemKey: String(row.item_key),
        dimension,
        ordinal,
        judgment: row.judgment as AnalysisFeedbackJudgment,
        reason: (record.reason ?? null) as AnalysisFeedbackSignalProjection['reason'],
        correction: (record.correction ?? null) as string | null,
        recordedAt: String(row.recorded_at),
        supersedes: before?.signalId ?? null,
        sha256: String(row.sha256),
      };
    });
  }

  #chains(where: string, ...values: string[]): Map<string, StoredSignal[]> {
    const chains = new Map<string, StoredSignal[]>();
    for (const signal of this.#signals(where, ...values)) {
      const key = `${signal.revisionId}\n${signal.itemKey}`;
      const list = chains.get(key) ?? [];
      list.push(signal);
      chains.set(key, list);
    }
    return chains;
  }

  /**
   * 记录反馈 (ANALYSIS-023), inside the caller's transaction: one explicit judgment of one item of the revision, bound to
   * the revision's identity and digest, the item's place and digest, and the evidence it cites — refused when the item no
   * longer says what the editor saw, when its latest judgment moved since, or when it would change nothing. A reason is one
   * of the alternatives offered for that judgment, or 其他 with the editor's own words; 准确 takes none.
   */
  record(bookId: string, revision: AnalysisFeedbackRevision, items: ReadonlyArray<AnalysisFeedbackItem>, input: RecordAnalysisFeedbackInput): void {
    const item = items.find((candidate) => candidate.itemKey === input.itemKey);
    requireFeedback(item !== undefined, 'ANALYSIS_FEEDBACK_ITEM_NOT_FOUND', '这一版分析结果里没有这一条。');
    requireFeedback(item.digest === input.itemDigest, 'ANALYSIS_FEEDBACK_ITEM_CHANGED', '这一条的内容与你看到的不一致；请刷新后再给反馈。');
    requireFeedback(ANALYSIS_FEEDBACK_JUDGMENTS.includes(input.judgment), 'ANALYSIS_FEEDBACK_JUDGMENT_INVALID', '反馈的判断无效。');
    const chain = this.#chains('revision_id = ? AND item_key = ?', revision.revisionId, item.itemKey).get(`${revision.revisionId}\n${item.itemKey}`) ?? [];
    const latest = chain.at(-1) ?? null;
    requireFeedback((latest?.signalId ?? null) === input.expectedLatestSignalId, 'ANALYSIS_FEEDBACK_MOVED', '这一条的反馈刚被改过；请看过现在的反馈再改。');
    let reason: AnalysisFeedbackSignalProjection['reason'] = null;
    if (input.reason !== null) {
      requireFeedback(input.judgment !== 'accurate', 'ANALYSIS_FEEDBACK_REASON_UNEXPECTED', '「准确」不需要说明原因。');
      requireFeedback(analysisFeedbackReasonOffered(item.dimension, input.judgment, input.reason.choice), 'ANALYSIS_FEEDBACK_REASON_INVALID', '反馈的原因无效。');
      const text = feedbackText(input.reason.text, '原因说明');
      requireFeedback(input.reason.choice !== ANALYSIS_FEEDBACK_OTHER || text !== null, 'ANALYSIS_FEEDBACK_REASON_TEXT', '选「其他」时请写下原因。');
      requireFeedback(input.reason.choice === ANALYSIS_FEEDBACK_OTHER || text === null, 'ANALYSIS_FEEDBACK_REASON_INVALID', '反馈的原因无效。');
      reason = { choice: input.reason.choice, text };
    }
    const correction = feedbackText(input.correction, '修正说明');
    requireFeedback(correction === null || input.judgment !== 'accurate', 'ANALYSIS_FEEDBACK_CORRECTION_UNEXPECTED', '「准确」不需要修正说明。');
    requireFeedback(latest === null || latest.judgment !== input.judgment || canonicalJson(latest.reason) !== canonicalJson(reason) || latest.correction !== correction,
      'ANALYSIS_FEEDBACK_UNCHANGED', '反馈没有变化。');
    const signalId = randomUUID();
    const ordinal = chain.length + 1;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      signalId,
      bookId,
      kind: 'baseline-analysis',
      revisionId: revision.revisionId,
      revisionDigest: revision.digest,
      dimension: item.dimension,
      itemKey: item.itemKey,
      index: item.index,
      itemDigest: item.digest,
      evidence: item.evidence,
      ordinal,
      judgment: input.judgment,
      reason,
      correction,
      supersedes: latest?.signalId ?? null,
      actor: ANALYSIS_FEEDBACK_ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO analysis_feedback_signals(signal_id, book_id, revision_id, item_key, ordinal, judgment, supersedes_signal_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(signalId, bookId, revision.revisionId, item.itemKey, ordinal, input.judgment, latest?.signalId ?? null, recordedAt, record.json, record.digest);
  }

  /**
   * Each item's latest judgment in one Book that says why — a reason or a correction — oldest first: what 学习准入 may ask
   * about (Issue #61, S26b). A bare verdict, or a judgment an editor has since changed, is not among them.
   */
  latestWithWords(bookId: string): Array<AnalysisFeedbackSignalProjection & { readonly revisionId: string; readonly itemKey: string; readonly dimension: AnalysisFeedbackDimension }> {
    return Array.from(this.#chains('book_id = ?', bookId).values(), (chain) => chain.at(-1)!)
      .filter((signal) => signal.reason !== null || signal.correction !== null)
      .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.signalId < b.signalId ? -1 : 1))
      .map((signal) => ({
        signalId: signal.signalId, judgment: signal.judgment, reason: signal.reason, correction: signal.correction, recordedAt: signal.recordedAt,
        supersedes: signal.supersedes, revisionId: signal.revisionId, itemKey: signal.itemKey, dimension: signal.dimension,
      }));
  }

  /**
   * The Analysis Quality Metric of one Book (ANALYSIS-024): each judged item's latest judgment once, over every revision of
   * the Book, counted by dimension, with the digest of exactly the signals it counted. No other Book's signals enter it.
   */
  metric(bookId: string): AnalysisQualityMetricProjection {
    const latest = Array.from(this.#chains('book_id = ?', bookId).values(), (chain) => chain.at(-1)!)
      .sort((a, b) => (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0));
    const count = (signals: ReadonlyArray<StoredSignal>) => ({
      judged: signals.length,
      accurate: signals.filter((signal) => signal.judgment === 'accurate').length,
      inaccurate: signals.filter((signal) => signal.judgment === 'inaccurate').length,
      incomplete: signals.filter((signal) => signal.judgment === 'incomplete').length,
    });
    return {
      definition: ANALYSIS_QUALITY_METRIC_DEFINITION,
      scope: 'book',
      ...count(latest),
      byDimension: ANALYSIS_FEEDBACK_DIMENSIONS.map((dimension) => ({ dimension, ...count(latest.filter((signal) => signal.dimension === dimension)) })),
      lineageDigest: sha256Hex(canonicalJson({
        schema: LINEAGE_SCHEMA,
        definition: ANALYSIS_QUALITY_METRIC_DEFINITION,
        bookId,
        signals: latest.map((signal) => ({ signalId: signal.signalId, sha256: signal.sha256 })),
      })),
    };
  }

  /** ②A 分析反馈 of one revision: every item with its latest judgment and how many it holds, and the Book's metric. */
  projection(bookId: string, revision: AnalysisFeedbackRevision, items: ReadonlyArray<AnalysisFeedbackItem>): AnalysisFeedbackProjection {
    const chains = this.#chains('book_id = ? AND revision_id = ?', bookId, revision.revisionId);
    return {
      bookId,
      revisionId: revision.revisionId,
      revisionOrdinal: revision.ordinal,
      items: items.map((item): AnalysisFeedbackItemProjection => {
        const chain = chains.get(`${revision.revisionId}\n${item.itemKey}`) ?? [];
        const last = chain.at(-1);
        return {
          itemKey: item.itemKey,
          dimension: item.dimension,
          index: item.index,
          digest: item.digest,
          latest: last === undefined ? null : {
            signalId: last.signalId, judgment: last.judgment, reason: last.reason, correction: last.correction, recordedAt: last.recordedAt, supersedes: last.supersedes,
          },
          signals: chain.length,
        };
      }),
      metric: this.metric(bookId),
    };
  }
}
