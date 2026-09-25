import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  ANALYSIS_FEEDBACK_OTHER,
  ANALYSIS_FEEDBACK_REASONS,
  type AnalysisFeedbackDimension,
  type AnalysisFeedbackJudgment,
} from '../shared/analysis-feedback.js';
import {
  MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES,
  type LearningEligibilityChoice,
  type LearningMaterialKind,
  type LearningMaterialProjection,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';

/**
 * 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-001 to LEARN-012, ATTN-009, FDBK-013). A Learning Material is
 * identified quietly from what the editor already recorded — a 修改建议 decided with their reason or their own wording, a
 * judgment of an analysis result that says why, a 审阅 finding ignored with its reason — and never by asking again after the
 * feedback that made it (LEARN-001). The Learning Eligibility Policy is still recommendation-only, with no material type or
 * scope approved for automatic inclusion, so every material waits for the editor's explicit decision: `仅纳入当前图书`,
 * recommended and unselected, `纳入出版社经验`, `明确排除` or `稍后决定`. `纳入当前书系` waits for Series (Issue #63, S28).
 *
 * A decision binds the exact version of the material it was made on. A material that changes afterwards — a reason changed,
 * a judgment succeeded — is decided again, and the decision it had stays on record (LEARN-007). A decision permits only
 * later learning signals within its scope: it activates no memory, widens no Run's sources, sends nothing, and changes no
 * record it came from (LEARN-009, LEARN-010).
 *
 * Schema revision 50 owns the one relation, a ledger like the others: one chain of decisions per material of a Book, each
 * record canonical and digested, appended once and never rewritten.
 */

export const LEARNING_ELIGIBILITY_SCHEMA_SQL = {
  learning_eligibility_decisions: `CREATE TABLE learning_eligibility_decisions (
  decision_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  material_key TEXT NOT NULL CHECK(length(material_key) BETWEEN 1 AND 160),
  material_digest TEXT NOT NULL CHECK(length(material_digest) = 64),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  choice TEXT NOT NULL CHECK(choice IN ('book', 'house', 'excluded', 'deferred')),
  supersedes_decision_id TEXT REFERENCES learning_eligibility_decisions(decision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_decision_id IS NULL)),
  UNIQUE(book_id, material_key, ordinal)
) STRICT`,
} as const;

export const LEARNING_ELIGIBILITY_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(LEARNING_ELIGIBILITY_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const LEARNING_ELIGIBILITY_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  learning_eligibility_decisions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'supersedes_decision_id>learning_eligibility_decisions.decision_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class LearningEligibilityError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LearningEligibilityError';
  }
}

function requireLearning(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new LearningEligibilityError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const MATERIAL_SCHEMA = 'ai7.learning-material/1';
const DECISION_SCHEMA = 'ai7.learning-eligibility-decision/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'learning_eligibility_decisions'";
const CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;
const CHOICES: readonly LearningEligibilityChoice[] = ['book', 'house', 'excluded', 'deferred'];
/** How long one excerpt line may run before it is cut with `…`. */
const EXCERPT_GRAPHEMES = 60;

/** The governing basis every decision records, in plain words (LEARN-003, LEARN-008): no policy asset is shown or editable. */
export const LEARNING_ELIGIBILITY_BASIS =
  '学习准入策略还在「仅建议」阶段：没有批准任何可以自动纳入的材料或范围，所以每一条都由你决定。' as const;

/** Revision 50's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeLearningEligibilitySchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(LEARNING_ELIGIBILITY_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(LEARNING_ELIGIBILITY_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Learning eligibility schema rollback failed.');
    }
    throw error;
  }
}

// ---- candidates: identified from the records that own them -------------------------------------------------------------

/** A Learning Material as the store identifies it; the ledger decides nothing about it but its eligibility. */
export interface LearningMaterialCandidate {
  readonly materialKey: string;
  readonly kind: LearningMaterialKind;
  readonly originLabel: string;
  readonly recordedAt: string;
  /** What the digest covers: exactly what the material says, never where it is shown. */
  readonly content: unknown;
  /** The Review Card's bounded lines; empty when the reader asked only for where each material stands. */
  readonly excerpt: ReadonlyArray<string>;
  readonly rationale: string;
}

/** The exact version a decision binds. */
export function learningMaterialDigest(candidate: Pick<LearningMaterialCandidate, 'materialKey' | 'kind' | 'content'>): string {
  return sha256Hex(canonicalJson({ schema: MATERIAL_SCHEMA, materialKey: candidate.materialKey, kind: candidate.kind, content: candidate.content }));
}

function bounded(text: string): string {
  const graphemes = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text.replace(/\s+/gu, ' ').trim()), (part) => part.segment);
  return graphemes.length <= EXCERPT_GRAPHEMES ? graphemes.join('') : `${graphemes.slice(0, EXCERPT_GRAPHEMES).join('')}…`;
}

const DISPOSITION_LABELS: Readonly<Record<string, string>> = { accepted: '接受', 'accepted-with-edit': '修改后接受', rejected: '拒绝' };

/**
 * A 修改建议's current decision that carries the editor's reason or their own wording: what was suggested, what they did,
 * and why, as the decision and its reason now stand.
 */
export function proposalDecisionCandidate(decision: {
  readonly decisionId: string;
  readonly disposition: string;
  readonly currentText: string;
  readonly proposedText: string;
  readonly editedText: string | null;
  readonly reason: string | null;
  readonly reasonSource: string | null;
  readonly recordedAt: string;
}, withExcerpt: boolean): LearningMaterialCandidate {
  const edited = decision.disposition === 'accepted-with-edit' && decision.editedText !== null;
  const excerpt: string[] = [];
  if (withExcerpt) {
    if (decision.currentText.length > 0) excerpt.push(`原文：${bounded(decision.currentText)}`);
    excerpt.push(`建议：${decision.proposedText.length > 0 ? bounded(decision.proposedText) : '（删去）'}`);
    if (edited) excerpt.push(`你改为：${decision.editedText!.length > 0 ? bounded(decision.editedText!) : '（删去）'}`);
    if (decision.reason !== null) excerpt.push(`你的原因：${bounded(decision.reason)}`);
  }
  return {
    materialKey: `proposal-decision:${decision.decisionId}`,
    kind: 'proposal-decision',
    originLabel: `修改建议 · ${DISPOSITION_LABELS[decision.disposition] ?? decision.disposition}`,
    recordedAt: decision.recordedAt,
    content: {
      disposition: decision.disposition,
      currentText: decision.currentText,
      proposedText: decision.proposedText,
      editedText: decision.editedText,
      reason: decision.reason,
      reasonSource: decision.reasonSource,
    },
    excerpt,
    rationale: decision.reason !== null
      ? '你说明了为什么这样处理：它可以帮 AI7 以后的建议更接近你的判断。'
      : '你改写了建议的文字：这处改动可以帮 AI7 以后的建议更接近你的写法。',
  };
}

const DIMENSION_LABELS: Readonly<Record<AnalysisFeedbackDimension, string>> = {
  synopsis: '全书梗概', entities: '人物与名称', events: '事件', relationships: '关系', settings: '设定',
};
const JUDGMENT_LABELS: Readonly<Record<AnalysisFeedbackJudgment, string>> = { accurate: '准确', inaccurate: '不准确', incomplete: '不完整' };

/**
 * An item of an analysis result the editor judged and said why, as their latest judgment of it stands. It is the item's
 * material, whichever judgment is latest: a later judgment changes it, and it is decided again.
 */
export function analysisFeedbackCandidate(signal: {
  readonly signalId: string;
  readonly revisionId: string;
  readonly itemKey: string;
  readonly dimension: AnalysisFeedbackDimension;
  readonly judgment: AnalysisFeedbackJudgment;
  readonly reason: null | { readonly choice: string; readonly text: string | null };
  readonly correction: string | null;
  readonly recordedAt: string;
}, itemLabel: string | null): LearningMaterialCandidate {
  const reasonLabel = signal.reason === null
    ? null
    : signal.reason.choice === ANALYSIS_FEEDBACK_OTHER
      ? signal.reason.text
      : signal.judgment === 'accurate'
        ? signal.reason.choice
        : ANALYSIS_FEEDBACK_REASONS[signal.dimension][signal.judgment].find((entry) => entry.choice === signal.reason!.choice)?.label ?? signal.reason.choice;
  const excerpt: string[] = [];
  if (itemLabel !== null) {
    excerpt.push(`${DIMENSION_LABELS[signal.dimension]}：${bounded(itemLabel)}`);
    excerpt.push(`你的判断：${JUDGMENT_LABELS[signal.judgment]}${reasonLabel === null ? '' : ` · ${bounded(reasonLabel)}`}`);
    if (signal.correction !== null) excerpt.push(`你的修正：${bounded(signal.correction)}`);
  }
  return {
    materialKey: `analysis-feedback:${signal.revisionId}/${signal.itemKey}`,
    kind: 'analysis-feedback',
    originLabel: `分析反馈 · ${DIMENSION_LABELS[signal.dimension]}`,
    recordedAt: signal.recordedAt,
    content: { signalId: signal.signalId, revisionId: signal.revisionId, itemKey: signal.itemKey, judgment: signal.judgment, reason: signal.reason, correction: signal.correction },
    excerpt,
    rationale: '你指出了分析结果哪里不对、为什么：它可以帮 AI7 以后读得更准。',
  };
}

/** A 审阅 finding the editor ignored and said why, as their latest disposition of it stands. */
export function reviewDispositionCandidate(signal: {
  readonly signalId: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly categoryLabel: string;
  readonly reason: string;
  readonly recordedAt: string;
}, withExcerpt: boolean): LearningMaterialCandidate {
  return {
    materialKey: `review-disposition:${signal.reviewRunId}/${signal.findingId}`,
    kind: 'review-disposition',
    originLabel: `审阅 · ${signal.categoryLabel}`,
    recordedAt: signal.recordedAt,
    content: { signalId: signal.signalId, reviewRunId: signal.reviewRunId, findingId: signal.findingId, reason: signal.reason },
    excerpt: withExcerpt ? [`你忽略了这条发现 · 原因：${bounded(signal.reason)}`] : [],
    rationale: '你说明了为什么这条发现不必处理：它可以帮 AI7 以后少提这类问题。',
  };
}

// ---- the ledger --------------------------------------------------------------------------------------------------------

interface StoredDecision {
  readonly decisionId: string;
  readonly materialKey: string;
  readonly materialDigest: string;
  readonly ordinal: number;
  readonly choice: LearningEligibilityChoice;
  readonly note: string | null;
  readonly recordedAt: string;
}

/** Who a decision is attributed to (FDBK-013): the Book's people as their newest version lists them. */
export interface LearningAttribution {
  readonly peopleVersion: number;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
}

function noteOf(value: string | null): string | null {
  if (value === null) return null;
  const note = value.replace(/\r\n?/gu, '\n').trim();
  if (note.length === 0) return null;
  requireLearning(graphemeCount(note) <= MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES, 'LEARNING_ELIGIBILITY_NOTE_TOO_LONG',
    `补充说明要在 ${MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES} 字以内。`);
  requireLearning(!CONTROL_CHARACTER.test(note), 'LEARNING_ELIGIBILITY_NOTE_INVALID', '补充说明含有不能显示的控制字符。');
  return note;
}

export class LearningEligibilityLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** One Book's decisions, by material, each chain verified: its digests, its records against their rows, and its order. */
  chains(bookId: string): Map<string, StoredDecision[]> {
    const rows = this.#db.prepare('SELECT * FROM learning_eligibility_decisions WHERE book_id = ? ORDER BY material_key, ordinal').all(bookId) as SqlRow[];
    const chains = new Map<string, StoredDecision[]>();
    for (const row of rows) {
      const json = String(row.canonical_json);
      requireLearning(sha256Hex(json) === String(row.sha256), 'LEARNING_ELIGIBILITY_RECORD_INVALID', '学习准入记录已损坏。');
      const record = JSON.parse(json) as unknown;
      const materialKey = String(row.material_key);
      const chain = chains.get(materialKey) ?? [];
      const before = chain.at(-1) ?? null;
      const ordinal = Number(row.ordinal);
      requireLearning(isRecord(record) && record.schema === DECISION_SCHEMA && record.decisionId === row.decision_id && record.bookId === bookId &&
        record.materialKey === materialKey && record.materialDigest === row.material_digest && record.ordinal === ordinal &&
        record.choice === row.choice && record.recordedAt === row.recorded_at && record.actor === ACTOR && record.basis === LEARNING_ELIGIBILITY_BASIS &&
        (record.supersedes ?? null) === (row.supersedes_decision_id ?? null) && (record.supersedes ?? null) === (before?.decisionId ?? null) &&
        ordinal === (before?.ordinal ?? 0) + 1 && (record.note === null || typeof record.note === 'string'),
      'LEARNING_ELIGIBILITY_RECORD_INVALID', '学习准入记录已损坏。');
      chain.push({
        decisionId: String(row.decision_id),
        materialKey,
        materialDigest: String(row.material_digest),
        ordinal,
        choice: String(row.choice) as LearningEligibilityChoice,
        note: record.note as string | null,
        recordedAt: String(row.recorded_at),
      });
      chains.set(materialKey, chain);
    }
    return chains;
  }

  /** Each candidate as its Review Card shows it, and where it stands. */
  project(bookId: string, candidates: ReadonlyArray<LearningMaterialCandidate>): LearningMaterialProjection[] {
    const chains = this.chains(bookId);
    return candidates.map((candidate) => {
      const chain = chains.get(candidate.materialKey) ?? [];
      const latest = chain.at(-1) ?? null;
      const digest = learningMaterialDigest(candidate);
      return {
        materialKey: candidate.materialKey,
        kind: candidate.kind,
        digest,
        originLabel: candidate.originLabel,
        recordedAt: candidate.recordedAt,
        excerpt: candidate.excerpt,
        rationale: candidate.rationale,
        state: latest === null ? 'pending' : latest.materialDigest !== digest ? 'changed' : latest.choice === 'deferred' ? 'deferred' : 'decided',
        decision: latest === null ? null : { choice: latest.choice, note: latest.note, decidedAt: latest.recordedAt },
        decisions: chain.length,
      };
    });
  }

  /**
   * 记录学习准入决定, inside the caller's transaction, for the candidate as it stands now — refused when its decisions moved
   * since the editor read them, or when it would change nothing.
   */
  decide(input: {
    readonly bookId: string;
    readonly candidate: LearningMaterialCandidate;
    readonly expectedDecisions: number;
    readonly choice: LearningEligibilityChoice;
    readonly note: string | null;
    readonly attribution: LearningAttribution;
  }): void {
    requireLearning(CHOICES.includes(input.choice), 'LEARNING_ELIGIBILITY_INVALID', '学习准入的选择无效。');
    const note = noteOf(input.note);
    const chain = this.chains(input.bookId).get(input.candidate.materialKey) ?? [];
    requireLearning(chain.length === input.expectedDecisions, 'LEARNING_ELIGIBILITY_MOVED', '这条材料的学习准入刚被改过；请看过现在的决定再定。');
    const digest = learningMaterialDigest(input.candidate);
    const latest = chain.at(-1) ?? null;
    requireLearning(latest === null || latest.materialDigest !== digest || latest.choice !== input.choice || latest.note !== note,
      'LEARNING_ELIGIBILITY_UNCHANGED', '学习准入没有变化。');
    const decisionId = randomUUID();
    const ordinal = chain.length + 1;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: DECISION_SCHEMA,
      decisionId,
      bookId: input.bookId,
      materialKey: input.candidate.materialKey,
      materialDigest: digest,
      kind: input.candidate.kind,
      ordinal,
      choice: input.choice,
      note,
      basis: LEARNING_ELIGIBILITY_BASIS,
      attribution: { peopleVersion: input.attribution.peopleVersion, authors: [...input.attribution.authors], editors: [...input.attribution.editors] },
      supersedes: latest?.decisionId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO learning_eligibility_decisions(decision_id, book_id, material_key, material_digest, ordinal, choice, supersedes_decision_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(decisionId, input.bookId, input.candidate.materialKey, digest, ordinal, input.choice, latest?.decisionId ?? null, recordedAt, record.json, record.digest);
  }
}
