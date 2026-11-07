import type { SalvagedModelResult } from './analysis.js';
import type { ProductionDocumentProjection } from './deliverables.js';
import type {
  ReviewCategoryResultSetRevisionProjection,
  ReviewCategoryRevisionUpdateProjection,
  ReviewCategoryUnitLineage,
  ReviewCategoryUpdateActionProjection,
  ReviewCategoryUpdateProjection,
  ReviewScopePlanCounts,
  TaskMaterialOffersProjection,
} from './review-runs.js';
import {
  EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_EXPECTED_OUTCOME,
  EVALUATION_REWRITE_KIND,
  INITIAL_EVALUATION_CONTRACT_VERSION,
  INITIAL_EVALUATION_EXPECTED_OUTCOME,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_CONTRACT_VERSION,
  READERS_REPORT_EXPECTED_OUTCOME,
  READERS_REPORT_KIND,
  type EvaluationRewriteGoal,
  type EvaluationRewriteTaskMode,
  type InitialEvaluationGoal,
  type InitialEvaluationTaskMode,
  type ReadersReportGoal,
  type ReadersReportTaskMode,
  type ReadersReportTemplate,
} from './task-kinds.js';
import type { AnalysisGapProjection } from './analysis.js';
import type {
  BaselineAnalysisHistoryEntryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisUpdateControlsProjection,
} from './analysis-plan.js';

// ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007) -------------------------------------

/** 依据充分度 of one item (EVAL-005), derived from what AI7 cited for it: `充分`, `一般` or `不足`. */
export type InitialEvaluationSufficiency = 'sufficient' | 'fair' | 'insufficient';

/** One thing AI7 noted about one scored item in one reading range, with the blocks it rests on. */
export interface InitialEvaluationObservationProjection {
  itemId: string;
  unitOrdinal: number;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** AI7's 初评 of one scored item: its score in half points within the item's 满分, its comment, and what it rests on. */
export interface InitialEvaluationItemProjection {
  itemId: string;
  /** `null` when the book-level synthesis did not close: AI7 then scores nothing. */
  score: number | null;
  comment: string | null;
  sufficiency: InitialEvaluationSufficiency;
  /** Distinct blocks cited for the item across the Book, and the reading ranges they fall in. */
  citedBlocks: number;
  unitsCited: number;
  observations: ReadonlyArray<InitialEvaluationObservationProjection>;
}

/** The evaluation kind's own component of a Result Set Revision. */
export interface InitialEvaluationResultProjection {
  /** The house Evaluation Profile the contract was frozen under. */
  profile: { profileId: string; version: string; sha256: string };
  items: ReadonlyArray<InitialEvaluationItemProjection>;
  strengths: ReadonlyArray<string>;
  weaknesses: ReadonlyArray<string>;
  nextStep: string | null;
  /** The conclusion AI7 would suggest; shown as AI7's, never chosen for the editor (EVAL-007). */
  suggestedConclusion: EvaluationConclusion | null;
  /** Whether the one book-level synthesis closed, and why not. */
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
  /**
   * AI7's market section (Issue #429, S81b2; EVAL-009), written by the same synthesis from what it read in the Book alone;
   * `null` when the synthesis did not close, and for a 初评 settled before the market section existed.
   */
  market: InitialEvaluationMarketProjection | null;
}

/**
 * One of the two predictions the market section's `预测 · 低确定性` block makes (EVAL-009): what AI7 would say, and what it
 * rests on — never a promise, and always low certainty.
 */
export interface InitialEvaluationPredictionProjection {
  readonly statement: string;
  readonly basis: string;
}

/**
 * AI7's market section of a 初评 (Issue #429, plan slice S81b2; V2-UX-EVAL-009): 目标读者, 差异化卖点 and 渠道与策略 as the
 * synthesis read them in the Book, and the `预测 · 低确定性` block for 市场回报 and 评奖可能性 — each a statement with its basis,
 * or `null` for `暂无法预测`. Web search is not connected, so nothing here rests on 外网检索 (ADR 0080 §7, 未联网核查).
 */
export interface InitialEvaluationMarketProjection {
  readonly readers: ReadonlyArray<string>;
  readonly sellingPoints: ReadonlyArray<string>;
  readonly channels: ReadonlyArray<string>;
  readonly marketReturn: InitialEvaluationPredictionProjection | null;
  readonly awards: InitialEvaluationPredictionProjection | null;
  /**
   * What AI7 wrote but the page does not show, one reason a part: a line or prediction that stated a quantity, or a part out
   * of shape. Empty when everything AI7 wrote is shown.
   */
  readonly withheld: ReadonlyArray<string>;
}

export interface InitialEvaluationRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: InitialEvaluationTaskMode;
}

export type InitialEvaluationUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      observations: ReadonlyArray<{ itemId: string; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface InitialEvaluationResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  update: InitialEvaluationRevisionUpdateProjection;
  evaluation: InitialEvaluationResultProjection;
  units: ReadonlyArray<InitialEvaluationUnitProjection>;
}

export interface InitialEvaluationUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'evaluation-again';
}

export interface InitialEvaluationUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'evaluation-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'evaluation-again' } };
}

export interface InitialEvaluationHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: InitialEvaluationTaskMode;
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface InitialEvaluationHistoryProjection {
  resultSetId: string;
  kind: typeof INITIAL_EVALUATION_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<InitialEvaluationHistoryEntryProjection>;
}

/** The evaluation kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface InitialEvaluationProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof INITIAL_EVALUATION_KIND;
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: InitialEvaluationGoal;
    expectedOutcome: typeof INITIAL_EVALUATION_EXPECTED_OUTCOME;
    createdAt: string;
    mode: InitialEvaluationTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | InitialEvaluationResultSetRevisionProjection;
  update: null | InitialEvaluationUpdateProjection;
  updateControls: null | InitialEvaluationUpdateControlsProjection;
  history: null | InitialEvaluationHistoryProjection;
  inspectedRevision: null | { revision: InitialEvaluationResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013) ------------------------------------------------------------

/** What a passage the report can point to bears out: a strength, a problem, or where a revision applies. */
export type ReadersReportPassageKind = 'strength' | 'problem' | 'suggestion';

export const READERS_REPORT_PASSAGE_KINDS: readonly ReadersReportPassageKind[] = ['strength', 'problem', 'suggestion'];

/** One passage AI7 noted in one reading range for the report, with the blocks it rests on. */
export interface ReadersReportPassageProjection {
  unitOrdinal: number;
  kind: ReadersReportPassageKind;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The five sections as the book-level synthesis wrote them: two paragraphs and three lists. */
export interface ReadersReportSectionsProjection {
  readonly withheld?: ReadonlyArray<string>;
  overall: string;
  strengths: ReadonlyArray<string>;
  problems: ReadonlyArray<string>;
  suggestions: ReadonlyArray<string>;
  conclusion: string;
}

/** The reader's report kind's own component of a Result Set Revision. */
export interface ReadersReportResultProjection {
  template: ReadersReportTemplate;
  /** The house's 审稿意见 the draft was seeded with, and what the plan said of them. */
  exemplars: { count: number; statement: string };
  passages: ReadonlyArray<ReadersReportPassageProjection>;
  /** `null` when the book-level synthesis did not close: AI7 then wrote no draft. */
  sections: ReadersReportSectionsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface ReadersReportRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: ReadersReportTaskMode;
}

export type ReadersReportUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      passages: ReadonlyArray<{ kind: ReadersReportPassageKind; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface ReadersReportResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  update: ReadersReportRevisionUpdateProjection;
  readersReport: ReadersReportResultProjection;
  units: ReadonlyArray<ReadersReportUnitProjection>;
}

export interface ReadersReportUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'readers-report-again';
}

export interface ReadersReportUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'readers-report-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'readers-report-again' } };
}

export interface ReadersReportHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: ReadersReportTaskMode;
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface ReadersReportHistoryProjection {
  resultSetId: string;
  kind: typeof READERS_REPORT_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<ReadersReportHistoryEntryProjection>;
}

/** The reader's report kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface ReadersReportProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof READERS_REPORT_KIND;
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: ReadersReportGoal;
    expectedOutcome: typeof READERS_REPORT_EXPECTED_OUTCOME;
    createdAt: string;
    mode: ReadersReportTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | ReadersReportResultSetRevisionProjection;
  update: null | ReadersReportUpdateProjection;
  updateControls: null | ReadersReportUpdateControlsProjection;
  history: null | ReadersReportHistoryProjection;
  inspectedRevision: null | { revision: ReadersReportResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008) ---------------------------------------------------

/** One thing AI7 noted in one reading range that bears out the editor's score of one item, with the blocks it rests on. */
export interface EvaluationRewriteObservationProjection {
  itemId: string;
  unitOrdinal: number;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The rewritten words as the book-level synthesis wrote them: each scored item's 评语, and the 总评. Never a number. */
export interface EvaluationRewriteWordsProjection {
  /** The 评语 offered: every scored item's but those set aside. */
  items: ReadonlyArray<{ itemId: string; comment: string }>;
  /** The 总评 offered, or `null` when it was set aside. */
  verdict: string | null;
  /** What was written but is not offered — a 评语 (`itemId`) or the 总评 (`null`) that stated a score or a conclusion — and why. */
  withheld: ReadonlyArray<{ itemId: string | null; reason: string }>;
}

/** The evaluation rewrite kind's own component of a Result Set Revision. */
export interface EvaluationRewriteResultProjection {
  observations: ReadonlyArray<EvaluationRewriteObservationProjection>;
  /** `null` when the book-level synthesis did not close: AI7 then rewrote nothing. */
  words: EvaluationRewriteWordsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface EvaluationRewriteRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: EvaluationRewriteTaskMode;
}

export type EvaluationRewriteUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      observations: ReadonlyArray<{ itemId: string; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface EvaluationRewriteResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  update: EvaluationRewriteRevisionUpdateProjection;
  rewrite: EvaluationRewriteResultProjection;
  units: ReadonlyArray<EvaluationRewriteUnitProjection>;
}

export interface EvaluationRewriteUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'evaluation-rewrite-again';
}

export interface EvaluationRewriteUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'evaluation-rewrite-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'evaluation-rewrite-again' } };
}

export interface EvaluationRewriteHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: EvaluationRewriteTaskMode;
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface EvaluationRewriteHistoryProjection {
  resultSetId: string;
  kind: typeof EVALUATION_REWRITE_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<EvaluationRewriteHistoryEntryProjection>;
}

/** The evaluation rewrite kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface EvaluationRewriteProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof EVALUATION_REWRITE_KIND;
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: EvaluationRewriteGoal;
    expectedOutcome: typeof EVALUATION_REWRITE_EXPECTED_OUTCOME;
    createdAt: string;
    mode: EvaluationRewriteTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | EvaluationRewriteResultSetRevisionProjection;
  update: null | EvaluationRewriteUpdateProjection;
  updateControls: null | EvaluationRewriteUpdateControlsProjection;
  history: null | EvaluationRewriteHistoryProjection;
  inspectedRevision: null | { revision: EvaluationRewriteResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012) ----------

/** What the editor writes about one Evaluation Record at most. */
export const MAX_EVALUATION_COMMENT_GRAPHEMES = 1000;

export const MAX_EVALUATION_VERDICT_GRAPHEMES = 2000;

export const MAX_EVALUATION_LINE_GRAPHEMES = 200;

export const MAX_EVALUATION_LINES = 20;

export const MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES = 500;

export type EvaluationBandLabel = '卓越' | '优秀' | '合格' | '薄弱' | '不宜';

export type EvaluationConclusion = 'recommend' | 'revise' | 'defer' | 'reject';

export const EVALUATION_CONCLUSIONS: readonly EvaluationConclusion[] = ['recommend', 'revise', 'defer', 'reject'];

/**
 * The house Evaluation Profile (EVAL-002, EVAL-003, EVAL-005; root ADR 0001): the scored items with their 满分 out of 100,
 * the bands with their anchor wording, the risk items and the conclusions. Every Evaluation Record snapshots the one it used.
 */
export interface EvaluationProfileProjection {
  readonly profileId: string;
  readonly title: string;
  readonly version: string;
  readonly issuer: string;
  readonly total: number;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly label: string; readonly fullMarks: number; readonly description?: string }>;
  readonly readiness?: ReadonlyArray<string>;
  readonly bands: ReadonlyArray<{ readonly band: 'excellent' | 'good' | 'adequate' | 'weak' | 'unsuitable'; readonly label: EvaluationBandLabel; readonly floor: number; readonly anchor: string }>;
  readonly risks: ReadonlyArray<{ readonly riskId: string; readonly label: string }>;
  readonly conclusions: ReadonlyArray<{ readonly conclusion: EvaluationConclusion; readonly label: string }>;
  readonly sha256: string;
}

/** 知识库 › 评估方案: each profile, and how many Evaluation Records of how many Books used it. */
export interface EvaluationProfilesProjection {
  readonly activeSha256?: string;
  readonly nextBefore?: number | null;
  readonly profiles: ReadonlyArray<EvaluationProfileProjection & { readonly records: number; readonly books: number }>;
}

/** A new immutable house version; null item identities are assigned by the service. */
export interface SaveEvaluationProfileInput {
  readonly expectedSha256: string;
  readonly items: ReadonlyArray<{ readonly itemId: string | null; readonly label: string; readonly description: string }>;
  readonly readiness: ReadonlyArray<string>;
}

/** What the editor wrote about one version of an evaluation: every item, every risk, and the rest of the record. */
export interface EvaluationContent {
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    /** A whole or half point from 0 to the item's 满分, or `null` while unscored or `不评`. */
    readonly score: number | null;
    /** `不评`, with its reason (EVAL-005). */
    readonly notRated: string | null;
    readonly comment: string | null;
    /**
     * Why the editor's score departs from AI7's 初评 (EVAL-006), when the version began from it and the two differ; `null`
     * otherwise. Absent from a version saved before AI7's 初评 existed, which reads as `null`.
     */
    readonly adjustment?: EvaluationAdjustment | null;
  }>;
  readonly risks: ReadonlyArray<{
    readonly riskId: string;
    readonly level: 'low' | 'medium' | 'high' | null;
    readonly statement: string | null;
    /** A person reviewed a `高` risk: only then may the conclusion be `推荐出版` (EVAL-004). */
    readonly reviewed: boolean;
  }>;
  /** 距离可出版还差什么, one line each. */
  readonly readiness: ReadonlyArray<string>;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  /** 总评. */
  readonly verdict: string | null;
  /** Chosen by the editor, never preselected (EVAL-007). */
  readonly conclusion: EvaluationConclusion | null;
}

/** The reasons the editor picked for departing from AI7's score, none preselected; `own` with the editor's words in `note`. */
export type EvaluationAdjustmentReasonId = 'too-high' | 'too-low' | 'insufficient-basis' | 'missed-aspect' | 'own';

export const MAX_EVALUATION_ADJUSTMENT_NOTE_GRAPHEMES = 200;

export interface EvaluationAdjustment {
  readonly reasons: ReadonlyArray<EvaluationAdjustmentReasonId>;
  readonly note: string | null;
}

/** The total out of the 满分 still rated, and how many items are left `不评` or unscored. */
export interface EvaluationTotalProjection {
  readonly score: number;
  readonly fullMarks: number;
  readonly notRated: number;
  readonly unscored: number;
}

/**
 * The most of AI7's notes 评估 carries of one 初评 or one rewrite, shared among its items (Issue #689 and its review): a long
 * Book's notes, every range's, would outgrow the frame. The budget is per evidence set, not per item, so the page stays within
 * the frame for any profile the contracts admit (up to 16 items), with three such sets on it. An item with fewer notes than
 * its share keeps them all; beyond its share the notes shown are spread over the ranges read — each range's first, then its
 * second — and the item says how many there are in all.
 */
export const MAX_EVALUATION_EVIDENCE_NOTES = 60;

/** One thing AI7 noted toward an item while it read one range (EVAL-006): its words, and the blocks it cited there. */
export interface EvaluationInitialEvidenceProjection {
  readonly unitOrdinal: number;
  readonly note: string;
  readonly blockIds: ReadonlyArray<string>;
}

/**
 * AI7's 初评 as one version of the record keeps it (EVAL-001, EVAL-005 to EVAL-007): what the version began from, snapshotted
 * when it began, so AI7's score stands beside the editor's for as long as the version does.
 */
export interface EvaluationInitialDraftProjection {
  /** The Result Set Revision of AI7's 初评, its number, and the manuscript revision it read. */
  readonly revisionId: string;
  readonly ordinal: number;
  readonly revisionLabel: string;
  readonly createdAt: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly score: number | null;
    readonly comment: string | null;
    readonly sufficiency: InitialEvaluationSufficiency;
    readonly citedBlocks: number;
    readonly unitsCited: number;
    /**
     * What AI7 noted toward the item, range by range: the evidence its score rests on (EVAL-006) — its share of
     * `MAX_EVALUATION_EVIDENCE_NOTES`, spread over the ranges (Issue #689).
     */
    readonly evidence: ReadonlyArray<EvaluationInitialEvidenceProjection>;
    /** How many notes AI7 made toward the item in all; more than `evidence` holds when it was cut. */
    readonly evidenceCount: number;
  }>;
  /** How many ranges the 初评 meant to read, and the ones it did not — a 初评 that completed with gaps says which. */
  readonly unitsTotal: number;
  readonly unreadUnits: ReadonlyArray<number>;
  readonly total: EvaluationTotalProjection;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  readonly nextStep: string | null;
  readonly suggestedConclusion: EvaluationConclusion | null;
  /** Every item scored: the book-level synthesis closed. */
  readonly complete: boolean;
  /**
   * AI7's market section (Issue #429, S81b2; EVAL-009): from what the 初评 read in the Book alone; `null` for a 初评 that wrote
   * none — one whose synthesis did not close, or one a version began from before the market section existed.
   */
  readonly market: InitialEvaluationMarketProjection | null;
}

/** AI7's 初评 on ②C: its Task, whether one can be prepared now, and the latest that settled. */
export interface EvaluationInitialProjection {
  /** The Book's latest 初评 Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly historicalMarker?: string;
    readonly taskIntentId: string;
    readonly state: BaselineAnalysisProjection['state'];
    /** The Task's state in the editor's words. */
    readonly label: string;
  };
  /** 准备 AI7 初评, or why it cannot be prepared now. */
  readonly prepare: { readonly allowed: true; readonly mode: InitialEvaluationTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The latest 初评 that settled, and whether it read the manuscript as it stands now. */
  readonly latest: null | (EvaluationInitialDraftProjection & { readonly current: boolean; readonly profile?: EvaluationProfileProjection });
}

export interface EvaluationRecordSummaryProjection {
  readonly recordId: string;
  readonly ordinal: number;
  /**
   * The three states of EVAL-001: `draft` is a version begun from AI7's 初评 that the editor has not saved yet, `editing` the
   * editor's calibration, `finalized` 定稿.
   */
  readonly state: 'draft' | 'editing' | 'finalized';
  readonly revisionLabel: string;
  readonly total: EvaluationTotalProjection;
  readonly conclusion: EvaluationConclusion | null;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
}

/** One version compared item by item with the version it re-evaluated (EVAL-012). */
export interface EvaluationComparisonProjection {
  readonly previousOrdinal: number;
  readonly items: ReadonlyArray<{ readonly itemId: string;
    readonly label?: string;
    readonly change?: 'added' | 'removed' | null; readonly previous: number | 'not-rated' | null; readonly current: number | 'not-rated' | null }>;
  readonly risks: ReadonlyArray<{ readonly riskId: string; readonly previous: 'low' | 'medium' | 'high' | null; readonly current: 'low' | 'medium' | 'high' | null }>;
  readonly total: { readonly previous: EvaluationTotalProjection; readonly current: EvaluationTotalProjection };
  readonly conclusion: { readonly previous: EvaluationConclusion | null; readonly current: EvaluationConclusion | null };
}

export interface EvaluationRecordProjection extends EvaluationRecordSummaryProjection {
  readonly revisionId: string;
  /** The manuscript had edits in its journal not yet saved as a revision when this version began. */
  readonly uncheckpointed: boolean;
  /** The profile this version snapshotted. */
  readonly profile: EvaluationProfileProjection;
  readonly content: EvaluationContent;
  /** How many entries its chain holds: a save names it, and is refused when another window saved first. */
  readonly entries: number;
  readonly savedAt: string;
  readonly finalized: null | { readonly actor: string; readonly at: string };
  /** `推荐出版` waits for a person's review of every `高` risk (EVAL-004). */
  readonly recommendationBlocked: boolean;
  readonly comparison: EvaluationComparisonProjection | null;
  /** AI7's 初评 this version began from, beside the editor's scores (EVAL-006); `null` for a version the editor began alone. */
  readonly initial: EvaluationInitialDraftProjection | null;
  /**
   * The house calibration applied to AI7's starting scores when this version began from its 初评 (EVAL-011; Issue #429,
   * EVAL-011a): recorded with the version, as it was then. `null` for a version begun alone, or from the raw 初评 — below the
   * gate, or with calibration turned off. `initial.items[].score` keeps AI7's raw score either way.
   */
  readonly calibration: EvaluationInitialCalibrationProjection | null;
  /**
   * Why which of this version's words are AI7's could not all be checked (Issue #702 review): the version before could not be
   * read, or the 采用 records cannot be read now. The words the version marks stay AI7's. `null` when every mark was checked.
   */
  readonly ai7WordsNotice: string | null;
  /**
   * The versions this one skipped when it began (Issue #726): the ordinals of the Book's versions after the one it was seeded
   * from that could not be read then, oldest first. Empty for a version that followed the one before it.
   */
  readonly skippedRecords: ReadonlyArray<number>;
  /** The ordinal of the version this one was seeded from — the one it compares with — or `null` when it began empty. */
  readonly seededFrom: number | null;
}

/**
 * The house calibration a version begun from AI7's 初评 recorded (EVAL-011; Issue #429, EVAL-011a): how many Books' 定稿
 * evaluations the offsets rested on, and each item whose starting score it moved — AI7's raw score, the offset, and the
 * starting score after it, clamped to [0, 满分]. An item whose offset was 0, or which AI7 did not score, is not listed.
 */
export interface EvaluationInitialCalibrationProjection {
  readonly basisBooks: number;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly raw: number; readonly offset: number; readonly adjusted: number }>;
}

/** ②C 评估 of one Book: its versions newest first, the one on show, and whether a version can begin. */
export interface EvaluationWorkspaceProjection {
  /** Locally indexed 资料库 choices, separate from the manuscript and house exemplars (#428). */
  readonly materials?: TaskMaterialOffersProjection;
  /**
   * The latest Tasks' frozen reference rows, never their extracted words; `blocked` names a prepared plan that can no longer
   * start because a frozen reference went away, which 评估 then lets the editor prepare again.
   */
  readonly materialReferences?: {
    readonly initial: ReadonlyArray<string>;
    readonly readersReport: ReadonlyArray<string>;
    /** Exact choices for changing a not-yet-started plan in the full Task Drawer. */
    readonly initialInput?: { readonly materialIds: ReadonlyArray<string>; readonly seriesId: string | null };
    readonly readersReportInput?: { readonly materialIds: ReadonlyArray<string> };
    readonly blocked: { readonly initial: boolean; readonly readersReport: boolean };
  };
  readonly bookId: string;
  readonly bookTitle: string;
  /** The Book's manuscript as a new version would bind it, or `null` when the Book has none. */
  readonly manuscript: null | { readonly revisionId: string; readonly revisionLabel: string; readonly uncheckpointed: boolean };
  /** The profile a new version would snapshot. */
  readonly profile: EvaluationProfileProjection;
  readonly records: ReadonlyArray<EvaluationRecordSummaryProjection>;
  readonly recordCount: number;
  readonly recordsBefore: number | null;
  readonly recordsNext: number | null;
  /** The ordinals of the Book's versions that cannot be read, oldest first (Issue #702 review): named, never shown. */
  readonly unreadableRecords: ReadonlyArray<number>;
  readonly record: EvaluationRecordProjection | null;
  /**
   * `开始评估` or `重新评估`, or why neither can begin now; `fromInitial` names AI7's latest 初评 when a version can begin from it
   * — the 初评 settled and read the manuscript as it stands now. `skipDamaged` is set while the Book's latest version cannot
   * be read (Issue #726): the next version then skips every version after `seedOrdinal` — the latest readable 定稿, or `null`
   * when none reads and the version begins empty — and `startEvaluation` must say so (`StartEvaluationInput.skipDamaged`).
   */
  readonly start:
    | {
        readonly allowed: true;
        readonly kind: 'first' | 'again';
        readonly fromInitial: null | { readonly revisionId: string; readonly ordinal: number };
        readonly skipDamaged: null | { readonly skipped: ReadonlyArray<number>; readonly seedOrdinal: number | null };
        /**
         * Set while the latest version is unfinished and only AI7's newer report may begin the next (Issue #1406): why a start of
         * the editor's own still waits. The unfinished version stays as it is.
         */
        readonly blankReason?: string;
      }
    | { readonly allowed: false; readonly reason: string };
  /** AI7's 初评 of the Book (Issue #429, S81b1). */
  readonly initial: EvaluationInitialProjection;
  /** 审稿意见 of the Book (Issue #429, S81c). */
  readonly readersReport: EvaluationReadersReportProjection;
  /** The market section's house data for the version on show (Issue #429, S81b2): 书系 comparables and 定价与首印. */
  readonly market: EvaluationMarketProjection;
  /** 按我的评分重写评语 of the version on show (Issue #429, S81b2). */
  readonly rewrite: EvaluationRewriteWorkspaceProjection;
}

// ---- 市场 and 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008 to EVAL-010) --------------------------------

/** The most 书系 comparables the market section lists; the count says how many more there are. */
export const MAX_EVALUATION_COMPARABLES = 10;

/**
 * The fewest other published Books of the Book's own 书系 with actuals that 定价与首印 gives a 书系 range over (S81b2): fewer,
 * and the quartiles would be one or two Books' own figures shown as a prediction. Below it only the house range shows.
 */
export const MIN_SERIES_PREDICTION_BOOKS = 5;

/**
 * A 定价与首印 range over published Books' actuals (EVAL-010; the Owner's answer of 2026-10-07: 「按本社已出版同类书的实际数据
 * 统计」): the middle half of the Books — from the lower to the upper quartile — and the median, with how many Books it rests
 * on. Prices in 分. Statistics over the house's own entries, never a model's and never the web's.
 */
export interface EvaluationPredictionRangeProjection {
  readonly books: number;
  readonly priceFen: { readonly low: number; readonly median: number; readonly high: number };
  readonly firstPrint: { readonly low: number; readonly median: number; readonly high: number };
}

/**
 * 定价与首印 in the market section (EVAL-010, EVAL-014): shown only once 设置 › 评估校准与预测's switch is on and enough
 * other published Books carry actuals; otherwise what it waits for. The ranges never count the Book itself, and neither does
 * the gate they wait on.
 */
export interface EvaluationPricingProjection {
  /** Every published Book with actuals: what the switch in 设置 waits on. */
  readonly booksWithActuals: number;
  /** The published Books with actuals other than this one: what the ranges rest on, and what they wait on. */
  readonly otherBooksWithActuals: number;
  readonly threshold: number;
  readonly enabled: boolean;
  /** The switch may be on: `booksWithActuals` reached the threshold. */
  readonly available: boolean;
  /** The house data could not be read this time (a damaged entry): nothing is predicted, and 评估 stays readable. */
  readonly unreadable: boolean;
  /** The house's other published Books with actuals, when the prediction shows; `null` otherwise. */
  readonly house: EvaluationPredictionRangeProjection | null;
  /** The other published Books with actuals of the Book's own 书系, when the prediction shows and they reach `MIN_SERIES_PREDICTION_BOOKS`; `null` otherwise. */
  readonly series: EvaluationPredictionRangeProjection | null;
  /** How many of those the Book's 书系 holds, when the prediction shows and the Book is in one; `null` otherwise. */
  readonly seriesBooksWithActuals: number | null;
  readonly seriesMinimum: number;
}

/** One comparable Book from house data (EVAL-009): another member of a 书系 this Book is in, tagged `书系`. */
export interface EvaluationComparableProjection {
  readonly bookId: string;
  readonly title: string;
  readonly seriesTitle: string;
  /** It has a 发稿版本. */
  readonly published: boolean;
  readonly source: 'series';
}

/** The market section's house data (EVAL-009, EVAL-010): the Book's 书系, their other Books, and 定价与首印. */
export interface EvaluationMarketProjection {
  readonly series: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>;
  readonly comparables: ReadonlyArray<EvaluationComparableProjection>;
  /** How many comparables there are in all; the list holds at most `MAX_EVALUATION_COMPARABLES`. */
  readonly comparableCount: number;
  /** The 书系 data could not be read this time (a damaged entry): no 书系 and no comparables are listed, and 评估 stays readable. */
  readonly seriesUnreadable: boolean;
  readonly pricing: EvaluationPricingProjection;
}

/** 采用 records the rewrite as a new entry of the version; 放弃 sets it aside. */
export type EvaluationRewriteDecision = 'accept' | 'discard';

/**
 * 按我的评分重写评语 of the version on show (EVAL-008): whether it can be asked now, the Book's latest rewrite Task, the rewrite
 * waiting for the editor's decision with its words beside the version's, and the version's last decision.
 */
export interface EvaluationRewriteWorkspaceProjection {
  readonly prepare: { readonly allowed: true; readonly mode: EvaluationRewriteTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The Book's latest rewrite Task, which the Task Drawer opens, and the version and entry it rewrites. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly recordId: string;
    readonly recordOrdinal: number;
    readonly entryOrdinal: number;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
  };
  /** The newest rewrite of the version on show that the editor has not decided; `null` when none waits. */
  readonly proposal: null | {
    readonly revisionId: string;
    readonly createdAt: string;
    /** The saved entry it rewrote, and whether that is still the version's latest — only then can it be 采用. */
    readonly entryOrdinal: number;
    readonly current: boolean;
    /** How much of the Book the rewrite read: its notes, and so its words, rest on the ranges read and never on the rest. */
    readonly reading: { readonly unitsTotal: number; readonly unitsRead: number };
    /** Each 评语 offered beside the version's own, with the notes AI7 rests it on (EVAL-006): the range and the blocks cited. */
    readonly items: ReadonlyArray<{
      readonly itemId: string;
      readonly before: string | null;
      readonly after: string;
      /** Its share of `MAX_EVALUATION_EVIDENCE_NOTES`, spread over the ranges (Issue #689); `evidenceCount` says how many in all. */
      readonly evidence: ReadonlyArray<{ readonly unitOrdinal: number; readonly note: string; readonly blockIds: ReadonlyArray<string> }>;
      readonly evidenceCount: number;
    }>;
    /** The 总评 offered beside the version's own; `null` when it was set aside. */
    readonly verdict: null | { readonly before: string | null; readonly after: string };
    /** What AI7 wrote but does not offer — a 评语 or the 总评 that stated a score or a conclusion — each with why. */
    readonly withheld: ReadonlyArray<string>;
  };
  /** The version's latest decision on a rewrite; `null` before the first. */
  readonly decided: null | { readonly decision: 'accepted' | 'discarded'; readonly entryOrdinal: number | null; readonly decidedAt: string };
}

/** One template's 审稿意见 on ②C (Issue #429, S81c; EVAL-013): whether it can be drafted, its result, and its draft. */
export interface EvaluationReadersReportTemplateProjection {
  readonly template: ReadersReportTemplate;
  readonly label: string;
  /** 起草, or why it cannot be drafted now. */
  readonly prepare: { readonly allowed: true; readonly mode: ReadersReportTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The latest result of this template whose draft has not been opened yet: 打开草稿 makes it the draft document. */
  readonly drafted: null | { readonly revisionId: string; readonly recordOrdinal: number; readonly createdAt: string };
  /** The template's draft, once made: an Editorial Artifact edited on the manuscript surface, a draft and never a delivery. */
  readonly draft: null | {
    readonly typeId: string;
    readonly typeLabel: string;
    /** The 定稿 version it was drafted from. */
    readonly recordOrdinal: number;
    readonly document: ProductionDocumentProjection;
  };
}

/** 审稿意见 on ②C (Issue #429, S81c; EVAL-013): drafted from the Book's latest 定稿 version, under one of two templates. */
export interface EvaluationReadersReportProjection {
  /** The 定稿 version a new 审稿意见 drafts from: the latest; `null` while there is none. */
  readonly basis: null | { readonly recordId: string; readonly ordinal: number; readonly revisionLabel: string; readonly finalizedAt: string };
  /** The house's 审稿意见 among its 范例, and what a plan says of them. */
  readonly exemplars: { readonly count: number; readonly statement: string };
  /** The Book's latest 审稿意见 Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly template: ReadersReportTemplate;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
  };
  readonly templates: ReadonlyArray<EvaluationReadersReportTemplateProjection>;
}

/**
 * 开始评估 or 重新评估: alone, or from AI7's latest 初评 (Issue #429, S81b1). `skipDamaged` says the editor saw that the latest
 * version cannot be read and chose to skip it (Issue #726): without it a damaged latest still refuses, and with it a latest
 * that reads after all refuses too, so no version is skipped that the editor did not see skipped.
 */
export interface StartEvaluationInput {
  readonly fromInitial: boolean;
  readonly skipDamaged: boolean;
}
