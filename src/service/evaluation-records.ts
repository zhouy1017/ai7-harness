import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  EVALUATION_CONCLUSIONS,
  MAX_EVALUATION_COMMENT_GRAPHEMES,
  MAX_EVALUATION_LINE_GRAPHEMES,
  MAX_EVALUATION_LINES,
  MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES,
  MAX_EVALUATION_ADJUSTMENT_NOTE_GRAPHEMES,
  MAX_EVALUATION_VERDICT_GRAPHEMES,
  type EvaluationAdjustment,
  type EvaluationAdjustmentReasonId,
  type EvaluationComparisonProjection,
  type EvaluationContent,
  type EvaluationInitialDraftProjection,
  type EvaluationInitialProjection,
  type EvaluationMarketProjection,
  MIN_SERIES_PREDICTION_BOOKS,
  type EvaluationProfileProjection,
  type EvaluationProfilesProjection,
  type EvaluationReadersReportProjection,
  type EvaluationRecordProjection,
  type EvaluationRecordSummaryProjection,
  type EvaluationRewriteWorkspaceProjection,
  type EvaluationTotalProjection,
  type EvaluationWorkspaceProjection,
} from '../shared/protocol.js';
import { PREDICTION_MIN_BOOKS_WITH_ACTUALS } from '../shared/evaluation-calibration.js';
import { contentWithRewrite, type RewritableEvaluation } from './evaluation-rewrites.js';
import {
  EVALUATION_ADJUSTMENT_REASONS,
  EVALUATION_FINALIZE_NEEDS_SCORE,
  evaluationItemAdjusted,
  evaluationTotal,
  finalizationNeedsScore,
  recommendationBlocked,
  validEvaluationScore,
} from '../shared/evaluation-scoring.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, hasExactKeys, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';

/**
 * ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012; ADR 0076 §7): a
 * Book's versioned Evaluation Records under the house Evaluation Profile. A version binds the manuscript's current revision
 * and snapshots the profile; the editor scores each item out of its 满分 — a whole or half point, or `不评` with a reason —
 * rates the two risk items, lists what is still missing, and chooses the conclusion, which `推荐出版` waits on while a `高`
 * risk is unreviewed. `定稿` closes the version with the actor and the time; `重新评估` begins the next, seeded from it and
 * compared with it item by item. 审稿意见, the market section and 按我的评分重写评语 belong to the later S81 slices, below.
 *
 * Schema revision 47 owns two relations, ledgers like the others: each version's record, and its entries — one chain per
 * version, every save appending the editor's whole content, the last one `finalized` — appended once and never rewritten.
 *
 * AI7's 初评 (S81b1; EVAL-001, EVAL-005 to EVAL-007, EVAL-011): a version may begin from AI7's latest 初评 instead, its scores
 * and comments the editor's starting point and kept beside them — revision 59's relation snapshots it with the version. The
 * record keeps the editor's scores; where one departs from AI7's, the editor may say why (entry content v2 carries it), and a
 * Book with such a departure in a 定稿 version counts once toward calibration. AI7 drafts no risk level and chooses no
 * conclusion: its suggestion is shown as AI7's.
 *
 * 审稿意见 (S81c; EVAL-013) is drafted from a 定稿 version: this owner says which version that is and hands its finalized words —
 * with the 初评 it began from — to `readers-reports.ts`, which owns the drafts. A version is never changed by one.
 *
 * The market section and 按我的评分重写评语 (S81b2; EVAL-008 to EVAL-010): AI7's market words are its 初评's, snapshotted with
 * the version it began (draft snapshot `/2`); the 书系 comparables and 定价与首印 are house data the store reads beside the
 * page. A rewrite reads a version at its latest saved entry (`rewritable`), and 采用 appends its words as a new entry of the
 * version (`applyRewrite`) — every score exactly as it was — only while that entry is still the latest.
 */

export const EVALUATION_RECORD_SCHEMA_SQL = {
  evaluation_records: `CREATE TABLE evaluation_records (
  record_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  previous_record_id TEXT REFERENCES evaluation_records(record_id),
  profile_sha256 TEXT NOT NULL CHECK(length(profile_sha256) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, ordinal)
) STRICT`,
  evaluation_record_entries: `CREATE TABLE evaluation_record_entries (
  entry_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('draft', 'finalized')),
  previous_sha256 TEXT NOT NULL CHECK(length(previous_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(record_id, ordinal)
) STRICT`,
} as const;

export const EVALUATION_RECORD_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EVALUATION_RECORD_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const EVALUATION_RECORD_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  evaluation_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'previous_record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  evaluation_record_entries: ['record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE'],
};

/**
 * Revision 59 (Issue #429, S81b1; EVAL-001, EVAL-006): the AI7 初评 a version began from, one row per such version, written
 * with the version and never again — the scores, comments and 依据充分度 of AI7's Result Set Revision snapshotted, so AI7's
 * score stands beside the editor's for as long as the version does.
 */
export const EVALUATION_INITIAL_DRAFT_SCHEMA_SQL = {
  evaluation_initial_drafts: `CREATE TABLE evaluation_initial_drafts (
  record_id TEXT PRIMARY KEY REFERENCES evaluation_records(record_id),
  analysis_revision_id TEXT NOT NULL REFERENCES analysis_result_set_revisions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const EVALUATION_INITIAL_DRAFT_TRIGGER_SQL: Readonly<Record<string, string>> = {
  evaluation_initial_drafts_no_update: `CREATE TRIGGER evaluation_initial_drafts_no_update
    BEFORE UPDATE ON evaluation_initial_drafts
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`,
  evaluation_initial_drafts_no_delete: `CREATE TRIGGER evaluation_initial_drafts_no_delete
    BEFORE DELETE ON evaluation_initial_drafts
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`,
};

export const EVALUATION_INITIAL_DRAFT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  evaluation_initial_drafts: [
    'analysis_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class EvaluationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

function requireEvaluation(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EvaluationError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;
type Profile = Omit<EvaluationProfileProjection, 'sha256'>;

const RECORD_SCHEMA = 'ai7.evaluation-record/1';
/** Entries written before S81b1: no item carries an adjustment, and each reads as having none. */
const ENTRY_SCHEMA_V1 = 'ai7.evaluation-entry/1';
/** Every entry written since S81b1: each item carries its adjustment of AI7's 初评, or `null`. */
const ENTRY_SCHEMA = 'ai7.evaluation-entry/2';
/** A 初评 snapshotted before the market section existed (S81b1): it names none, and reads as having none. */
const INITIAL_DRAFT_SCHEMA_V1 = 'ai7.evaluation-initial-draft/1';
/** Every snapshot since S81b2: the draft names its market section, `null` included. */
const INITIAL_DRAFT_SCHEMA = 'ai7.evaluation-initial-draft/2';
const PROFILE_SCHEMA = 'ai7.evaluation-profile/1';
/** Who scores and finalizes, as the other editor records of this device name it. */
export const EVALUATION_ACTOR = '本机编辑' as const;
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evaluation_records'";
const CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;
const LINE_CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * AI7's built-in Evaluation Profile (EVAL-002, EVAL-003, EVAL-005), `AI7 内置默认` at version 1 and never stored: the five
 * default scored items, Editorial Dimensions 1, 2, 3, 4 and 6, dividing the 100 evenly; the bands with their anchor wording;
 * the two risk items; and the four conclusions. A house's own profile arrives with 知识库 › 评估方案's editing.
 */
export const BUILTIN_EVALUATION_PROFILE: Profile = {
  profileId: 'ai7-builtin/evaluation-profile',
  title: '审稿评估方案',
  version: '1',
  issuer: 'AI7 内置默认',
  total: 100,
  items: [
    { itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20 },
    { itemId: 'theme-and-context', label: '主题、价值与社会文化语境', fullMarks: 20 },
    { itemId: 'structure-and-coherence', label: '结构、叙事逻辑与连贯', fullMarks: 20 },
    { itemId: 'chinese-language', label: '中文语言与表达', fullMarks: 20 },
    { itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20 },
  ],
  bands: [
    { band: 'excellent', label: '卓越', floor: 90, anchor: '可作为同类书的标杆。' },
    { band: 'good', label: '优秀', floor: 70, anchor: '明显高于出版要求，少量修改即可。' },
    { band: 'adequate', label: '合格', floor: 50, anchor: '达到出版要求，需要常规修改。' },
    { band: 'weak', label: '薄弱', floor: 30, anchor: '低于出版要求，需要较大修改。' },
    { band: 'unsuitable', label: '不宜', floor: 0, anchor: '在这一项上不宜出版。' },
  ],
  risks: [
    { riskId: 'facts-and-sources', label: '事实与来源' },
    { riskId: 'law-rights-ethics-policy', label: '法律、权利、伦理与出版政策' },
  ],
  conclusions: [
    { conclusion: 'recommend', label: '推荐出版' },
    { conclusion: 'revise', label: '修改后再议' },
    { conclusion: 'defer', label: '暂缓' },
    { conclusion: 'reject', label: '不推荐' },
  ],
};

export function evaluationProfileDigest(profile: Profile): string {
  return sha256Hex(canonicalJson({ schema: PROFILE_SCHEMA, profile }));
}

function withDigest(profile: Profile): EvaluationProfileProjection {
  return { ...profile, sha256: evaluationProfileDigest(profile) };
}

/** Revision 47's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeEvaluationRecordSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_RECORD_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_RECORD_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Evaluation record schema rollback failed.');
    }
    throw error;
  }
}

/** Revision 59's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeEvaluationInitialDraftSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evaluation_initial_drafts'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_INITIAL_DRAFT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Evaluation initial draft schema rollback failed.');
    }
    throw error;
  }
}

/** A version's empty content: every item unscored, every risk unrated, nothing listed, no conclusion. */
export function emptyEvaluationContent(profile: Pick<Profile, 'items' | 'risks'>): EvaluationContent {
  return {
    items: profile.items.map((item) => ({ itemId: item.itemId, score: null, notRated: null, comment: null, adjustment: null })),
    risks: profile.risks.map((risk) => ({ riskId: risk.riskId, level: null, statement: null, reviewed: false })),
    readiness: [],
    strengths: [],
    weaknesses: [],
    verdict: null,
    conclusion: null,
  };
}

function text(value: unknown, maximum: number, code: string, message: string, multiline: boolean): string | null {
  if (value === null) return null;
  requireEvaluation(typeof value === 'string', 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const trimmed = value.replace(/\r\n?/gu, '\n').trim();
  if (trimmed.length === 0) return null;
  requireEvaluation(graphemeCount(trimmed) <= maximum, code, message);
  requireEvaluation(!(multiline ? CONTROL_CHARACTER : LINE_CONTROL_CHARACTER).test(trimmed), 'EVALUATION_CONTENT_INVALID', '评估内容含有不能显示的控制字符。');
  return trimmed;
}

function lines(value: unknown, what: string): string[] {
  requireEvaluation(Array.isArray(value), 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const kept = value.map((line) => text(line, MAX_EVALUATION_LINE_GRAPHEMES, 'EVALUATION_LINE_TOO_LONG', `${what}每一条要在 ${MAX_EVALUATION_LINE_GRAPHEMES} 字以内。`, false))
    .filter((line): line is string => line !== null);
  requireEvaluation(kept.length <= MAX_EVALUATION_LINES, 'EVALUATION_TOO_MANY_LINES', `${what}最多 ${MAX_EVALUATION_LINES} 条。`);
  return kept;
}

/**
 * Why the editor departs from AI7's score of one item (EVAL-006), held to its closed shape: reasons from the five, each once,
 * `自行输入` with the editor's words and words only with it. Kept only where the editor's score differs from AI7's — a reason
 * for a score that agrees with AI7 says nothing, and nothing picked is no adjustment at all.
 */
function adjustmentOf(value: unknown, adjusted: boolean, label: string): EvaluationAdjustment | null {
  if (value === undefined || value === null || !adjusted) return null;
  requireEvaluation(isRecord(value) && Array.isArray(value.reasons), 'EVALUATION_CONTENT_INVALID', '调分原因无效。');
  const reasons = value.reasons as unknown[];
  requireEvaluation(reasons.every((reason) => EVALUATION_ADJUSTMENT_REASONS.includes(reason as EvaluationAdjustmentReasonId)) &&
    new Set(reasons).size === reasons.length, 'EVALUATION_CONTENT_INVALID', '调分原因无效。');
  const note = text(value.note ?? null, MAX_EVALUATION_ADJUSTMENT_NOTE_GRAPHEMES, 'EVALUATION_ADJUSTMENT_TOO_LONG',
    `调分原因要在 ${MAX_EVALUATION_ADJUSTMENT_NOTE_GRAPHEMES} 字以内。`, false);
  const own = reasons.includes('own');
  requireEvaluation(!own || note !== null, 'EVALUATION_ADJUSTMENT_NOTE', `「${label}」选了「自行输入」，要写明原因。`);
  requireEvaluation(own || note === null, 'EVALUATION_CONTENT_INVALID', '只有选「自行输入」时才写原因。');
  if (reasons.length === 0) return null;
  // The five in their own order, whatever order the editor ticked them in.
  return { reasons: EVALUATION_ADJUSTMENT_REASONS.filter((reason) => reasons.includes(reason)), note };
}

/**
 * The editor's content held to the profile it scores under: exactly its items and risks, each score a whole or half point
 * within its 满分, `不评` only with a reason, `推荐出版` never while a `高` risk is unreviewed — and, to finalize, every item
 * scored or `不评` and at least one scored (Issue #638), every risk rated with a statement, and a conclusion chosen.
 * `initialScores` are AI7's, for a version begun from its 初评: an item whose score departs from AI7's keeps the reasons the
 * editor gave.
 */
export function evaluationContent(
  input: unknown,
  profile: Pick<Profile, 'items' | 'risks'>,
  finalize: boolean,
  initialScores: ReadonlyMap<string, number | null> | null = null,
): EvaluationContent {
  requireEvaluation(isRecord(input) && Array.isArray(input.items) && Array.isArray(input.risks), 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const givenItems = input.items as unknown[];
  const givenRisks = input.risks as unknown[];
  requireEvaluation(givenItems.length === profile.items.length && givenRisks.length === profile.risks.length,
    'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
  const items = profile.items.map((item, index) => {
    const given = givenItems[index];
    requireEvaluation(isRecord(given) && given.itemId === item.itemId, 'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
    const notRated = text(given.notRated, MAX_EVALUATION_LINE_GRAPHEMES, 'EVALUATION_REASON_TOO_LONG', `不评的理由要在 ${MAX_EVALUATION_LINE_GRAPHEMES} 字以内。`, false);
    requireEvaluation(given.notRated === null || notRated !== null, 'EVALUATION_NOT_RATED_REASON', `「${item.label}」不评时要写明理由。`);
    const score = given.score;
    requireEvaluation(score === null || (typeof score === 'number' && validEvaluationScore(score, item.fullMarks)),
      'EVALUATION_SCORE_INVALID', `「${item.label}」的得分要在 0 到 ${item.fullMarks} 之间，按整分或半分填写。`);
    requireEvaluation(notRated === null || score === null, 'EVALUATION_CONTENT_INVALID', `「${item.label}」不评时不能有得分。`);
    requireEvaluation(!finalize || score !== null || notRated !== null, 'EVALUATION_ITEM_UNSCORED', `定稿前，「${item.label}」要打分或写明不评的理由。`);
    const comment = text(given.comment, MAX_EVALUATION_COMMENT_GRAPHEMES, 'EVALUATION_COMMENT_TOO_LONG', `评语要在 ${MAX_EVALUATION_COMMENT_GRAPHEMES} 字以内。`, true);
    const adjusted = initialScores !== null &&
      evaluationItemAdjusted({ score: score as number | null, notRated: notRated !== null }, initialScores.get(item.itemId) ?? null);
    const adjustment = adjustmentOf(given.adjustment, adjusted, item.label);
    return { itemId: item.itemId, score: score as number | null, notRated, comment, adjustment };
  });
  // Every item 不评 scores nothing, and such a version is not finalized (Issue #638; the Owner's answer of 2026-10-07).
  requireEvaluation(!finalize || !finalizationNeedsScore(items.map((item) => ({ score: item.score, notRated: item.notRated !== null }))),
    'EVALUATION_NOTHING_SCORED', EVALUATION_FINALIZE_NEEDS_SCORE);
  const risks = profile.risks.map((risk, index) => {
    const given = givenRisks[index];
    requireEvaluation(isRecord(given) && given.riskId === risk.riskId, 'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
    requireEvaluation(given.level === null || given.level === 'low' || given.level === 'medium' || given.level === 'high',
      'EVALUATION_CONTENT_INVALID', '风险等级无效。');
    requireEvaluation(typeof given.reviewed === 'boolean', 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
    const statement = text(given.statement, MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES, 'EVALUATION_STATEMENT_TOO_LONG',
      `风险说明要在 ${MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES} 字以内。`, true);
    const level = given.level as EvaluationContent['risks'][number]['level'];
    requireEvaluation(!finalize || level !== null, 'EVALUATION_RISK_UNRATED', `定稿前，要给「${risk.label}」定风险等级。`);
    requireEvaluation(!finalize || statement !== null, 'EVALUATION_RISK_STATEMENT',
      `定稿前，要写明「${risk.label}」的风险说明。`);
    // Only a `高` risk is reviewed by a person; the mark means nothing on a lower one, so it is not kept there.
    return { riskId: risk.riskId, level, statement, reviewed: level === 'high' && given.reviewed === true };
  });
  const conclusion = input.conclusion ?? null;
  requireEvaluation(conclusion === null || EVALUATION_CONCLUSIONS.includes(conclusion as EvaluationContent['conclusion'] & string),
    'EVALUATION_CONTENT_INVALID', '结论无效。');
  requireEvaluation(conclusion !== 'recommend' || !recommendationBlocked(risks), 'EVALUATION_RECOMMEND_BLOCKED',
    '有「高」风险还没有经人工复核，不能选「推荐出版」。');
  requireEvaluation(!finalize || conclusion !== null, 'EVALUATION_CONCLUSION_REQUIRED', '定稿前要选定结论。');
  return {
    items,
    risks,
    readiness: lines(input.readiness, '就绪清单'),
    strengths: lines(input.strengths, '主要优点'),
    weaknesses: lines(input.weaknesses, '主要问题'),
    verdict: text(input.verdict, MAX_EVALUATION_VERDICT_GRAPHEMES, 'EVALUATION_VERDICT_TOO_LONG', `总评要在 ${MAX_EVALUATION_VERDICT_GRAPHEMES} 字以内。`, true),
    conclusion: conclusion as EvaluationContent['conclusion'],
  };
}

function totalOf(profile: Pick<Profile, 'items'>, content: EvaluationContent): EvaluationTotalProjection {
  return evaluationTotal(profile.items.map((item, index) => ({
    fullMarks: item.fullMarks,
    score: content.items[index]!.score,
    notRated: content.items[index]!.notRated !== null,
  })));
}

interface StoredRecord {
  readonly recordId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly manuscriptId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly uncheckpointed: boolean;
  readonly previousRecordId: string | null;
  readonly profile: EvaluationProfileProjection;
  readonly createdAt: string;
  readonly sha256: string;
}

interface StoredEntry {
  readonly ordinal: number;
  readonly kind: 'draft' | 'finalized';
  readonly content: EvaluationContent;
  readonly recordedAt: string;
  readonly sha256: string;
  /**
   * The rewrite this entry took its 评语 and 总评 from (S81b2; EVAL-008), when the editor 采用'd one: those words are AI7's,
   * so a consumer of the editor's words — the learning of EVAL-011 — leaves them out. `null` for every other entry.
   */
  readonly rewrittenFrom: EvaluationRewriteProvenance | null;
}

/** Which rewrite an entry's words came from: its Task and the Result Set Revision that wrote them. */
export interface EvaluationRewriteProvenance {
  readonly taskIntentId: string;
  readonly analysisRevisionId: string;
}

function rewriteProvenance(value: unknown): EvaluationRewriteProvenance | null {
  return isRecord(value) && hasExactKeys(value, ['taskIntentId', 'analysisRevisionId']) && typeof value.taskIntentId === 'string' &&
    UUID_PATTERN.test(value.taskIntentId) && typeof value.analysisRevisionId === 'string' && UUID_PATTERN.test(value.analysisRevisionId)
    ? { taskIntentId: value.taskIntentId, analysisRevisionId: value.analysisRevisionId }
    : null;
}

/** Where a new version binds: the Book's primary manuscript at its current revision, and whether edits wait in its journal. */
export interface EvaluationManuscriptReader {
  current(bookId: string): { manuscriptId: string; revisionId: string; revisionLabel: string; uncheckpointed: boolean } | null;
}

/** AI7's latest settled 初评 of a Book (S81b1), as the analysis ledger of the evaluation kind holds it. */
export interface InitialEvaluationFacts {
  readonly draft: Omit<EvaluationInitialDraftProjection, 'total'>;
  /** The manuscript revision the 初评 read, and whether that is the Book's working text now. */
  readonly manuscriptRevisionId: string;
  readonly current: boolean;
  /** The profile the 初评's contract was frozen under. */
  readonly profileSha256: string;
}

/** What 评估 reads of AI7's 初评: its latest settled result, and its Task as the Task Drawer opens it. */
export interface InitialEvaluationReader {
  latest(bookId: string): InitialEvaluationFacts | null;
  task(bookId: string): Pick<EvaluationInitialProjection, 'task' | 'prepare'>;
}

/** One 定稿 version as 审稿意见 drafts from it (S81c): its words, the entry that closed it, and the 初评 it began from. */
export interface FinalizedEvaluation {
  readonly recordId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly profile: EvaluationProfileProjection;
  readonly content: EvaluationContent;
  readonly total: EvaluationTotalProjection;
  /** The `finalized` entry's digest and time. */
  readonly entrySha256: string;
  readonly finalizedAt: string;
  readonly initial: EvaluationInitialDraftProjection | null;
}

/** What 评估 reads of a Book's 审稿意见 (S81c), given the 定稿 version a new one would draft from. */
export interface ReadersReportReader {
  /** `unreadable` says why the 定稿 version could not be read, when one could not; `basis` is then `null`. */
  workspace(bookId: string, basis: FinalizedEvaluation | null, unreadable: string | null): EvaluationReadersReportProjection;
}

/** A Book whose 审稿意见 is not wired: nothing drafted, nothing to prepare. The store wires the real one. */
const NO_READERS_REPORT: ReadersReportReader = {
  workspace: () => ({ basis: null, exemplars: { count: 0, statement: '' }, task: null, templates: [] }),
};

/** What 评估 reads beside the record (S81b2): the market section's house data, and 按我的评分重写评语 of the version on show. */
export interface EvaluationExtrasReader {
  market(bookId: string): EvaluationMarketProjection;
  rewrite(bookId: string, version: RewritableEvaluation | null): EvaluationRewriteWorkspaceProjection;
}

/** A Book whose market section and rewrite are not wired: no house data, nothing to rewrite. The store wires the real ones. */
const NO_EXTRAS: EvaluationExtrasReader = {
  market: () => ({
    series: [],
    comparables: [],
    comparableCount: 0,
    seriesUnreadable: false,
    pricing: {
      booksWithActuals: 0, otherBooksWithActuals: 0, threshold: PREDICTION_MIN_BOOKS_WITH_ACTUALS, enabled: false, available: false, unreadable: false,
      house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: MIN_SERIES_PREDICTION_BOOKS,
    },
  }),
  rewrite: () => ({ prepare: { allowed: false, reason: '按我的评分重写评语暂不可用。' }, task: null, proposal: null, decided: null }),
};

/** A Book whose 初评 is not wired: nothing settled, nothing to prepare. The store wires the real one. */
const NO_INITIAL_EVALUATION: InitialEvaluationReader = {
  latest: () => null,
  task: () => ({ task: null, prepare: { allowed: false, reason: 'AI7 初评暂不可用。' } }),
};

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function sameContent(a: EvaluationContent, b: EvaluationContent): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * An entry's content as its schema wrote it (Issue #429 review): a `/2` entry names every item's adjustment, `null` included,
 * and one that leaves the key out is not one AI7 wrote; a `/1` entry, written before S81b1, names none, and each reads as
 * having none to carry.
 */
function contentOfEntry(schema: typeof ENTRY_SCHEMA | typeof ENTRY_SCHEMA_V1, content: Record<string, unknown>): EvaluationContent {
  requireEvaluation(Array.isArray(content.items) && content.items.every((item) => isRecord(item) &&
    Object.hasOwn(item, 'adjustment') === (schema === ENTRY_SCHEMA)), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
  const read = content as unknown as EvaluationContent;
  return schema === ENTRY_SCHEMA ? read : { ...read, items: read.items.map((item) => ({ ...item, adjustment: null })) };
}

function totalOfScores(profile: Pick<Profile, 'items'>, items: ReadonlyArray<{ readonly itemId: string; readonly score: number | null }>): EvaluationTotalProjection {
  return evaluationTotal(profile.items.map((item) => ({
    fullMarks: item.fullMarks,
    score: items.find((entry) => entry.itemId === item.itemId)?.score ?? null,
    notRated: false,
  })));
}

export class EvaluationRecords {
  readonly #db: DatabaseSync;
  readonly #manuscripts: EvaluationManuscriptReader;
  readonly #initial: InitialEvaluationReader;
  readonly #readersReport: ReadersReportReader;
  readonly #extras: EvaluationExtrasReader;

  constructor(
    db: DatabaseSync,
    manuscripts: EvaluationManuscriptReader,
    initial: InitialEvaluationReader = NO_INITIAL_EVALUATION,
    readersReport: ReadersReportReader = NO_READERS_REPORT,
    extras: EvaluationExtrasReader = NO_EXTRAS,
  ) {
    this.#db = db;
    this.#manuscripts = manuscripts;
    this.#initial = initial;
    this.#readersReport = readersReport;
    this.#extras = extras;
  }

  /** The profile a new version snapshots: AI7's built-in one until a house's own is managed in 知识库. */
  profile(): EvaluationProfileProjection {
    return withDigest(BUILTIN_EVALUATION_PROFILE);
  }

  #record(row: SqlRow): StoredRecord {
    const json = String(row.canonical_json);
    requireEvaluation(sha256Hex(json) === String(row.sha256), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireEvaluation(isRecord(record) && record.schema === RECORD_SCHEMA && record.recordId === row.record_id && record.bookId === row.book_id &&
      record.ordinal === integer(row.ordinal) && record.manuscriptId === row.manuscript_id && record.revisionId === row.revision_id &&
      (record.previousRecordId ?? null) === (row.previous_record_id ?? null) && record.createdAt === row.created_at &&
      isRecord(record.profile) && evaluationProfileDigest(record.profile as unknown as Profile) === row.profile_sha256 &&
      typeof record.revisionLabel === 'string' && typeof record.uncheckpointed === 'boolean',
    'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    return {
      recordId: String(row.record_id),
      bookId: String(row.book_id),
      ordinal: integer(row.ordinal),
      manuscriptId: String(row.manuscript_id),
      revisionId: String(row.revision_id),
      revisionLabel: record.revisionLabel,
      uncheckpointed: record.uncheckpointed,
      previousRecordId: row.previous_record_id === null ? null : String(row.previous_record_id),
      profile: withDigest(record.profile as unknown as Profile),
      createdAt: String(row.created_at),
      sha256: String(row.sha256),
    };
  }

  /** One version's entries, oldest first, each verified and chained to the one before; the first to the record itself. */
  #entries(record: StoredRecord): { count: number; latest: StoredEntry } {
    const rows = this.#db.prepare('SELECT * FROM evaluation_record_entries WHERE record_id = ? ORDER BY ordinal').iterate(record.recordId);
    let previous = record.sha256;
    let count = 0;
    let latest: StoredEntry | undefined;
    for (const row of rows) {
      requireEvaluation(latest === undefined || latest.kind === 'draft', 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
      const json = String(row.canonical_json);
      requireEvaluation(sha256Hex(json) === String(row.sha256), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
      const entry = JSON.parse(json) as unknown;
      requireEvaluation(isRecord(entry) && (entry.schema === ENTRY_SCHEMA || entry.schema === ENTRY_SCHEMA_V1) &&
        entry.entryId === row.entry_id && entry.recordId === record.recordId &&
        entry.ordinal === count + 1 && integer(row.ordinal) === count + 1 && entry.kind === row.kind && entry.previousSha256 === previous &&
        String(row.previous_sha256) === previous && entry.recordedAt === row.recorded_at && entry.actor === EVALUATION_ACTOR && isRecord(entry.content) &&
        // Only an entry of the current shape may name the rewrite it took its words from, and then exactly.
        (!Object.hasOwn(entry, 'rewrittenFrom') || (entry.schema === ENTRY_SCHEMA && rewriteProvenance(entry.rewrittenFrom) !== null)),
      'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
      previous = String(row.sha256);
      count += 1;
      latest = {
        ordinal: count,
        kind: entry.kind as StoredEntry['kind'],
        content: contentOfEntry(entry.schema as typeof ENTRY_SCHEMA | typeof ENTRY_SCHEMA_V1, entry.content as Record<string, unknown>),
        recordedAt: String(row.recorded_at),
        sha256: String(row.sha256),
        rewrittenFrom: rewriteProvenance(entry.rewrittenFrom),
      };
    }
    requireEvaluation(latest !== undefined, 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    return { count, latest };
  }

  *#records(bookId: string): Generator<StoredRecord> {
    for (const row of this.#db.prepare('SELECT * FROM evaluation_records WHERE book_id = ? ORDER BY ordinal').iterate(bookId)) yield this.#record(row);
  }

  #append(record: StoredRecord, previous: string, ordinal: number, kind: StoredEntry['kind'], content: EvaluationContent,
    rewrittenFrom: EvaluationRewriteProvenance | null = null): void {
    const entryId = randomUUID();
    const recordedAt = new Date().toISOString();
    const entry = canonicalRecord({
      schema: ENTRY_SCHEMA,
      entryId,
      recordId: record.recordId,
      ordinal,
      kind,
      content,
      actor: EVALUATION_ACTOR,
      previousSha256: previous,
      recordedAt,
      ...(rewrittenFrom === null ? {} : { rewrittenFrom: { taskIntentId: rewrittenFrom.taskIntentId, analysisRevisionId: rewrittenFrom.analysisRevisionId } }),
    });
    this.#db.prepare(
      'INSERT INTO evaluation_record_entries(entry_id, record_id, ordinal, kind, previous_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(entryId, record.recordId, ordinal, kind, previous, recordedAt, entry.json, entry.digest);
  }

  /**
   * The AI7 初评 a version may begin from now (S81b1): the latest that settled with every item scored, read from the Book's
   * text as it stands, under the profile a new version snapshots; otherwise why not, in the editor's words.
   */
  #startableInitial(bookId: string, profileSha256: string, manuscriptRevisionId: string): { facts: InitialEvaluationFacts } | { reason: string } {
    const latest = this.#initial.latest(bookId);
    if (latest === null) return { reason: '这本书还没有完成的 AI7 初评。' };
    if (!latest.draft.complete) return { reason: '最近一次 AI7 初评没有给出全部评分项的分数；请重新初评。' };
    if (!latest.current || latest.manuscriptRevisionId !== manuscriptRevisionId) return { reason: '稿件在最近一次 AI7 初评之后改过；请重新初评，再从初评开始。' };
    if (latest.profileSha256 !== profileSha256) return { reason: '评估方案在最近一次 AI7 初评之后变了；请重新初评。' };
    return { facts: latest };
  }

  /**
   * 开始评估 or 重新评估 (EVAL-001, EVAL-012), inside the caller's transaction: a new version bound to the manuscript's current
   * revision under the profile that applies now — empty the first time, seeded from the last 定稿 after — refused while the
   * Book has no manuscript or a version is still being scored. `fromInitial` begins it from AI7's latest 初评 (S81b1): AI7's
   * scores, comments, strengths and weaknesses are the editor's starting point and are snapshotted beside the version; risks
   * and what is still missing carry from the last 定稿, as 重新评估 carries them, and no conclusion is chosen.
   */
  start(bookId: string, fromInitial = false): string {
    const manuscript = this.#manuscripts.current(bookId);
    requireEvaluation(manuscript !== null, 'EVALUATION_NO_MANUSCRIPT', '这本书还没有稿件，没有可以评估的内容。');
    let last: StoredRecord | undefined;
    let count = 0;
    for (const record of this.#records(bookId)) { last = record; count += 1; }
    const lastEntry = last === undefined ? undefined : this.#entries(last).latest;
    requireEvaluation(last === undefined || lastEntry!.kind === 'finalized', 'EVALUATION_OPEN',
      `第 ${last?.ordinal ?? 0} 版还没有定稿；定稿后才能重新评估。`);
    const profile = this.profile();
    const { sha256: profileSha256, ...snapshot } = profile;
    const carried = last === undefined
      ? emptyEvaluationContent(snapshot)
      : this.#reseed(lastEntry!.content, snapshot);
    let initial: InitialEvaluationFacts | null = null;
    if (fromInitial) {
      const startable = this.#startableInitial(bookId, profileSha256, manuscript.revisionId);
      requireEvaluation('facts' in startable, 'EVALUATION_INITIAL_UNAVAILABLE', 'reason' in startable ? startable.reason : '');
      initial = startable.facts;
    }
    const seed: EvaluationContent = initial === null ? carried : {
      ...carried,
      items: carried.items.map((item) => {
        const ai7 = initial!.draft.items.find((entry) => entry.itemId === item.itemId);
        return { itemId: item.itemId, score: ai7?.score ?? null, notRated: null, comment: ai7?.comment ?? null, adjustment: null };
      }),
      strengths: initial.draft.strengths.slice(0, MAX_EVALUATION_LINES),
      weaknesses: initial.draft.weaknesses.slice(0, MAX_EVALUATION_LINES),
      verdict: null,
      conclusion: null,
    };
    const recordId = randomUUID();
    const ordinal = count + 1;
    const createdAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      recordId,
      bookId,
      ordinal,
      manuscriptId: manuscript.manuscriptId,
      revisionId: manuscript.revisionId,
      revisionLabel: manuscript.revisionLabel,
      uncheckpointed: manuscript.uncheckpointed,
      previousRecordId: last?.recordId ?? null,
      profile: snapshot,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO evaluation_records(record_id, book_id, ordinal, manuscript_id, revision_id, previous_record_id, profile_sha256, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(recordId, bookId, ordinal, manuscript.manuscriptId, manuscript.revisionId, last?.recordId ?? null, profileSha256, createdAt, record.json, record.digest);
    const stored = this.#record(this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ?').get(recordId) as SqlRow);
    if (initial !== null) {
      const recordedAt = new Date().toISOString();
      const draft = canonicalRecord({
        schema: INITIAL_DRAFT_SCHEMA,
        recordId,
        analysisRevisionId: initial.draft.revisionId,
        draft: initial.draft,
        profileSha256,
        recordedAt,
      });
      this.#db.prepare('INSERT INTO evaluation_initial_drafts(record_id, analysis_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
        .run(recordId, initial.draft.revisionId, recordedAt, draft.json, draft.digest);
    }
    this.#append(stored, stored.sha256, 1, 'draft', seed);
    return recordId;
  }

  /** One version's 定稿 as 审稿意见 reads it, verified; `null` while the version is not 定稿. */
  #finalized(record: StoredRecord): FinalizedEvaluation | null {
    const latest = this.#entries(record).latest;
    if (latest.kind !== 'finalized') return null;
    return {
      recordId: record.recordId,
      bookId: record.bookId,
      ordinal: record.ordinal,
      revisionId: record.revisionId,
      revisionLabel: record.revisionLabel,
      profile: record.profile,
      content: latest.content,
      total: totalOf(record.profile, latest.content),
      entrySha256: latest.sha256,
      finalizedAt: latest.recordedAt,
      initial: this.#initialDraft(record),
    };
  }

  /**
   * The 定稿 version a new 审稿意见 drafts from (S81c; EVAL-013): the Book's latest version that is 定稿, whether or not a later
   * one is still being scored; `null` while none is.
   */
  latestFinalized(bookId: string): FinalizedEvaluation | null {
    let found: StoredRecord | null = null;
    for (const record of this.#records(bookId)) {
      if (this.#entries(record).latest.kind === 'finalized') found = record;
    }
    return found === null ? null : this.#finalized(found);
  }

  /** One exact 定稿 version of the Book, as a 审稿意见 Task drafted from it reads it again; `null` when it is not one. */
  finalizedOf(bookId: string, recordId: string): FinalizedEvaluation | null {
    if (!UUID_PATTERN.test(recordId)) return null;
    const row = this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ? AND book_id = ?').get(recordId, bookId) as SqlRow | undefined;
    return row === undefined ? null : this.#finalized(this.#record(row));
  }

  /** The AI7 初评 one version began from, verified against its row; `null` for a version the editor began alone. */
  #initialDraft(record: StoredRecord): EvaluationInitialDraftProjection | null {
    const row = this.#db.prepare('SELECT * FROM evaluation_initial_drafts WHERE record_id = ?').get(record.recordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const json = String(row.canonical_json);
    requireEvaluation(sha256Hex(json) === String(row.sha256), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    const stored = JSON.parse(json) as unknown;
    requireEvaluation(isRecord(stored) && (stored.schema === INITIAL_DRAFT_SCHEMA || stored.schema === INITIAL_DRAFT_SCHEMA_V1) &&
      stored.recordId === record.recordId && stored.analysisRevisionId === row.analysis_revision_id && stored.recordedAt === row.recorded_at &&
      stored.profileSha256 === record.profile.sha256 && isRecord(stored.draft) && stored.draft.revisionId === row.analysis_revision_id &&
      // A `/2` snapshot names its market section, `null` included; a `/1` one, written before it existed, names none.
      Object.hasOwn(stored.draft, 'market') === (stored.schema === INITIAL_DRAFT_SCHEMA),
    'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    const draft = stored.draft as unknown as Omit<EvaluationInitialDraftProjection, 'total'>;
    return { ...draft, market: stored.schema === INITIAL_DRAFT_SCHEMA ? draft.market : null, total: totalOfScores(record.profile, draft.items) };
  }

  /** AI7's scores of a version begun from its 初评, by item; `null` for any other. */
  static #initialScores(draft: EvaluationInitialDraftProjection | null): ReadonlyMap<string, number | null> | null {
    return draft === null ? null : new Map(draft.items.map((item) => [item.itemId, item.score] as const));
  }

  /**
   * The Books whose editor adjusted AI7's 初评 (EVAL-011; Issue #429, S81b1), counted per Book as 设置 counts them (§8.6 「10 本
   * 调分记录」): a Book counts once when one of its 定稿 versions began from AI7's 初评 and kept at least one score that departs
   * from AI7's. A version still being scored has adjusted nothing yet.
   */
  adjustedBooks(): number {
    const books = new Set<string>();
    const rows = this.#db.prepare(
      'SELECT r.* FROM evaluation_records r JOIN evaluation_initial_drafts d ON d.record_id = r.record_id ORDER BY r.book_id, r.ordinal',
    ).all() as SqlRow[];
    for (const row of rows) {
      const record = this.#record(row);
      if (books.has(record.bookId)) continue;
      const latest = this.#entries(record).latest;
      if (latest.kind !== 'finalized') continue;
      const scores = EvaluationRecords.#initialScores(this.#initialDraft(record))!;
      if (latest.content.items.some((item) => evaluationItemAdjusted({ score: item.score, notRated: item.notRated !== null }, scores.get(item.itemId) ?? null))) {
        books.add(record.bookId);
      }
    }
    return books.size;
  }

  /**
   * The last 定稿's content carried into the next version: what the profile still holds, by identity, the rest empty. The
   * conclusion is never carried — it is the editor's, decided for this text — and each risk keeps its level and statement
   * but not a person's review of the old text, which does not count for the changed one (EVAL-004, EVAL-012; Issue #429
   * review): 推荐出版 waits until a person reviews this version's 高 risks.
   */
  #reseed(content: EvaluationContent, to: Pick<Profile, 'items' | 'risks'>): EvaluationContent {
    const empty = emptyEvaluationContent(to);
    const items = new Map(content.items.map((item) => [item.itemId, item] as const));
    const risks = new Map(content.risks.map((risk) => [risk.riskId, risk] as const));
    return {
      ...content,
      conclusion: null,
      items: empty.items.map((item, index) => {
        const carried = items.get(item.itemId);
        // An adjustment explains a departure from the 初评 the earlier version began from; this version has its own start.
        return carried === undefined || (carried.score !== null && !validEvaluationScore(carried.score, to.items[index]!.fullMarks)) ? item : { ...carried, adjustment: null };
      }),
      risks: empty.risks.map((risk) => {
        const carried = risks.get(risk.riskId);
        return carried === undefined ? { ...risk } : { ...carried, reviewed: false };
      }),
    };
  }

  /**
   * 保存评估 or 定稿 (EVAL-001, EVAL-004, EVAL-007), inside the caller's transaction: the editor's whole content appended to the
   * version's chain — refused when the version belongs to another Book, is already 定稿, moved since the editor read it, or
   * would record nothing new — and `定稿` closing it with the actor and the time.
   */
  save(bookId: string, recordId: string, expectedEntries: number, content: unknown, finalize: boolean): void {
    requireEvaluation(UUID_PATTERN.test(recordId), 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const row = this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ?').get(recordId) as SqlRow | undefined;
    requireEvaluation(row !== undefined, 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const record = this.#record(row);
    requireEvaluation(record.bookId === bookId, 'EVALUATION_NOT_FOUND', '这个评估版本不属于当前图书。');
    const entries = this.#entries(record);
    const last = entries.latest;
    requireEvaluation(last.kind !== 'finalized', 'EVALUATION_FINALIZED', `第 ${record.ordinal} 版已经定稿，不能再改；要改就重新评估。`);
    requireEvaluation(entries.count === expectedEntries, 'EVALUATION_MOVED', '这一版评估刚在另一个窗口保存过；请看过最新的再改。');
    const { sha256: _digest, ...profile } = record.profile;
    const checked = evaluationContent(content, profile, finalize, EvaluationRecords.#initialScores(this.#initialDraft(record)));
    requireEvaluation(finalize || !sameContent(checked, last.content), 'EVALUATION_UNCHANGED', '评估没有变化。');
    this.#append(record, last.sha256, entries.count + 1, finalize ? 'finalized' : 'draft', checked);
  }

  #rewritableOf(record: StoredRecord, chain: { count: number; latest: StoredEntry }, initial: EvaluationInitialDraftProjection | null): RewritableEvaluation {
    return {
      recordId: record.recordId,
      bookId: record.bookId,
      ordinal: record.ordinal,
      state: this.#summary(record, chain.latest, initial !== null).state,
      profile: record.profile,
      content: chain.latest.content,
      entryOrdinal: chain.count,
      entrySha256: chain.latest.sha256,
      initial,
    };
  }

  /**
   * One version of the Book at its latest saved entry, as 按我的评分重写评语 reads it (S81b2; EVAL-008): its words, the entry's
   * ordinal and digest, and the 初评 it began from. Refused for a version of another Book.
   */
  rewritable(bookId: string, recordId: string): RewritableEvaluation {
    requireEvaluation(UUID_PATTERN.test(recordId), 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const row = this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ? AND book_id = ?').get(recordId, bookId) as SqlRow | undefined;
    requireEvaluation(row !== undefined, 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const record = this.#record(row);
    return this.#rewritableOf(record, this.#entries(record), this.#initialDraft(record));
  }

  /**
   * 采用 one rewrite (S81b2; EVAL-008), inside the caller's transaction: the version's latest content with each scored item's
   * 评语 and the 总评 replaced by AI7's words, appended as a new entry — refused when the version is 定稿, or moved past the
   * entry the rewrite read, so the words never land on scores the editor changed since. It changes no number: every score,
   * `不评`, adjustment, risk and the conclusion are the entry's own. Returns the new entry's ordinal.
   */
  applyRewrite(bookId: string, recordId: string, read: { entryOrdinal: number; entrySha256: string },
    words: { items: ReadonlyArray<{ itemId: string; comment: string }>; verdict: string | null }, from: EvaluationRewriteProvenance): number {
    const version = this.rewritable(bookId, recordId);
    requireEvaluation(version.state !== 'finalized', 'EVALUATION_FINALIZED', `第 ${version.ordinal} 版已经定稿，不能再改；要改就重新评估。`);
    requireEvaluation(version.entryOrdinal === read.entryOrdinal && version.entrySha256 === read.entrySha256, 'EVALUATION_REWRITE_STALE',
      '这一版评估在重写之后又保存过：重写的评语依据的是之前的分数，不能采用；可以放弃它，再按现在的评分重写。');
    const { sha256: _digest, ...profile } = version.profile;
    const next = contentWithRewrite(version.content, words);
    const checked = evaluationContent(next, profile, false, EvaluationRecords.#initialScores(version.initial));
    // The rewrite is words only: a number that moved is a fault here, never the model's to make.
    requireEvaluation(checked.items.every((item, index) => item.score === version.content.items[index]!.score &&
      item.notRated === version.content.items[index]!.notRated), 'EVALUATION_REWRITE_INVALID', '重写不能改动分数。');
    requireEvaluation(!sameContent(checked, version.content), 'EVALUATION_UNCHANGED', '重写的评语与现在的评语相同，没有可以采用的变化。');
    const record = this.#record(this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ?').get(recordId) as SqlRow);
    // The entry names the rewrite its words came from (S81b2 review): they are AI7's, and never learned as the editor's.
    this.#append(record, version.entrySha256, version.entryOrdinal + 1, 'draft', checked, from);
    return version.entryOrdinal + 1;
  }

  /** EVAL-001's three states: AI7's draft until the editor saves the version begun from it, then the editor's, then 定稿. */
  #summary(record: StoredRecord, last: StoredEntry, fromInitial: boolean): EvaluationRecordSummaryProjection {
    return {
      recordId: record.recordId,
      ordinal: record.ordinal,
      state: last.kind === 'finalized' ? 'finalized' : fromInitial && last.ordinal === 1 ? 'draft' : 'editing',
      revisionLabel: record.revisionLabel,
      total: totalOf(record.profile, last.content),
      conclusion: last.content.conclusion,
      createdAt: record.createdAt,
      finalizedAt: last.kind === 'finalized' ? last.recordedAt : null,
    };
  }

  #comparison(previous: { record: StoredRecord; latest: StoredEntry } | undefined, current: { record: StoredRecord; content: EvaluationContent }): EvaluationComparisonProjection | null {
    if (previous === undefined) return null;
    const before = previous.latest.content;
    const value = (item: EvaluationContent['items'][number] | undefined): number | 'not-rated' | null =>
      item === undefined ? null : item.notRated !== null ? 'not-rated' : item.score;
    return {
      previousOrdinal: previous.record.ordinal,
      items: current.record.profile.items.map((item, index) => ({
        itemId: item.itemId,
        previous: value(before.items.find((entry) => entry.itemId === item.itemId)),
        current: value(current.content.items[index]),
      })),
      risks: current.record.profile.risks.map((risk, index) => ({
        riskId: risk.riskId,
        previous: before.risks.find((entry) => entry.riskId === risk.riskId)?.level ?? null,
        current: current.content.risks[index]!.level,
      })),
      total: { previous: totalOf(previous.record.profile, before), current: totalOf(current.record.profile, current.content) },
      conclusion: { previous: before.conclusion, current: current.content.conclusion },
    };
  }

  /** ②C 评估 of one Book (EVAL-001, EVAL-012): every version newest first, one on show with its comparison, and whether to begin. */
  workspace(bookId: string, bookTitle: string, recordId: string | null, before: number | null = null): EvaluationWorkspaceProjection {
    requireEvaluation(before === null || (Number.isSafeInteger(before) && before > 1), 'EVALUATION_PAGE_INVALID', '评估版本页码无效。');
    const summaries: EvaluationRecordSummaryProjection[] = [];
    let count = 0;
    let open: { record: StoredRecord; count: number; latest: StoredEntry } | undefined;
    let shown: typeof open;
    const begunFromInitial = new Set((this.#db.prepare(
      'SELECT d.record_id FROM evaluation_initial_drafts d JOIN evaluation_records r ON r.record_id = d.record_id WHERE r.book_id = ?',
    ).all(bookId) as SqlRow[]).map((row) => String(row.record_id)));
    for (const record of this.#records(bookId)) {
      const chain = { record, ...this.#entries(record) };
      count += 1;
      open = chain;
      if (recordId === null || record.recordId === recordId) shown = chain;
      if (before === null || record.ordinal < before) {
        summaries.push(this.#summary(record, chain.latest, begunFromInitial.has(record.recordId)));
        if (summaries.length > 10) summaries.shift();
      }
    }
    requireEvaluation(recordId === null || shown !== undefined, 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    let record: EvaluationRecordProjection | null = null;
    let rewritable: RewritableEvaluation | null = null;
    if (shown !== undefined) {
      const last = shown.latest;
      const previousRow = shown.record.previousRecordId === null ? undefined : this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ? AND book_id = ?')
        .get(shown.record.previousRecordId, bookId);
      const previousRecord = previousRow === undefined ? undefined : this.#record(previousRow);
      const previous = previousRecord === undefined ? undefined : { record: previousRecord, latest: this.#entries(previousRecord).latest };
      const initial = this.#initialDraft(shown.record);
      record = {
        ...this.#summary(shown.record, last, initial !== null),
        revisionId: shown.record.revisionId,
        uncheckpointed: shown.record.uncheckpointed,
        profile: shown.record.profile,
        content: last.content,
        entries: shown.count,
        savedAt: last.recordedAt,
        finalized: last.kind === 'finalized' ? { actor: EVALUATION_ACTOR, at: last.recordedAt } : null,
        recommendationBlocked: recommendationBlocked(last.content.risks),
        comparison: this.#comparison(previous, { record: shown.record, content: last.content }),
        initial,
      };
      rewritable = this.#rewritableOf(shown.record, shown, initial);
    }
    const manuscript = this.#manuscripts.current(bookId);
    const profile = this.profile();
    const startable = manuscript === null ? null : this.#startableInitial(bookId, profile.sha256, manuscript.revisionId);
    const start: EvaluationWorkspaceProjection['start'] = manuscript === null
      ? { allowed: false, reason: '这本书还没有稿件，没有可以评估的内容。' }
      : open !== undefined && open.latest.kind !== 'finalized'
        ? { allowed: false, reason: `第 ${open.record.ordinal} 版还没有定稿；定稿后才能重新评估。` }
        : {
            allowed: true,
            kind: open === undefined ? 'first' : 'again',
            fromInitial: startable !== null && 'facts' in startable ? { revisionId: startable.facts.draft.revisionId, ordinal: startable.facts.draft.ordinal } : null,
          };
    const latestInitial = this.#initial.latest(bookId);
    const initialTask = this.#initial.task(bookId);
    // A 定稿 version that cannot be read takes 审稿意见 with it, and only it: 评估 still opens and says so there.
    let basis: FinalizedEvaluation | null = null;
    let unreadable: string | null = null;
    try {
      basis = this.latestFinalized(bookId);
    } catch (error) {
      if (!(error instanceof EvaluationError)) throw error;
      unreadable = `审稿意见暂不可用：${error.message}`;
    }
    const readersReport = this.#readersReport.workspace(bookId, basis, unreadable);
    return {
      bookId,
      bookTitle,
      manuscript: manuscript === null ? null : { revisionId: manuscript.revisionId, revisionLabel: manuscript.revisionLabel, uncheckpointed: manuscript.uncheckpointed },
      profile,
      records: summaries.reverse(),
      recordCount: count,
      recordsBefore: before,
      recordsNext: (summaries.at(-1)?.ordinal ?? 1) > 1 ? summaries.at(-1)!.ordinal : null,
      record,
      start,
      initial: {
        ...initialTask,
        latest: latestInitial === null ? null : { ...latestInitial.draft, total: totalOfScores(profile, latestInitial.draft.items), current: latestInitial.current },
      },
      readersReport,
      market: this.#extras.market(bookId),
      rewrite: this.#extras.rewrite(bookId, rewritable),
    };
  }

  /** 知识库 › 评估方案: the profile a new version snapshots, with how many versions of how many Books used it. */
  profiles(): EvaluationProfilesProjection {
    const profile = this.profile();
    const use = this.#db.prepare('SELECT count(*) AS records, count(DISTINCT book_id) AS books FROM evaluation_records WHERE profile_sha256 = ?').get(profile.sha256) as SqlRow;
    return { profiles: [{ ...profile, records: integer(use.records), books: integer(use.books) }] };
  }
}
