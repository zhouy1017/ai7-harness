import type { SalvagedModelResult } from './analysis.js';
import type { ReviewCategoryBasis } from '../review-basis.js';
import type {
  ReviewExcludedFindingProjection,
  ReviewContractRejectionReason,
  ReviewReportSchema,
  ReviewReportDerivedSections,
} from './review.js';
import type {
  HISTORICALLY_AFFECTED_RESULT_MARKER,
  HISTORICAL_MARKER_UNVERIFIABLE,
  LEARNING_INFLUENCE_RESULT_MARKER,
} from './series.js';
import type { CompositeReviewRunRequest, ProcedureDefinitionPin } from './procedures.js';
import type { PreferenceAdoptionProjection, PreferenceAdoptionCursor, ReferencedRuleVersion } from './learning.js';
import type {
  AnalysisKindId,
  AnalysisReusePlanCounts,
  AnalysisReusePlanPredecessorUnitProjection,
  AnalysisTaskMode,
  AnalysisUnitLineage,
  BaselineAnalysisHistoryEntryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisRangeOptionProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisSelectedRange,
  BaselineAnalysisUpdateActionProjection,
  BaselineAnalysisUpdateControlsProjection,
} from './analysis-plan.js';
import type {
  AnalysisAssuranceAxis,
  AnalysisAssuranceSampleProjection,
  AnalysisCoverageAxis,
  AnalysisFreshnessAxis,
  AnalysisGapProjection,
  AnalysisReducerClosureAxis,
  AnalysisSourceRangeProjection,
  CoverageManifestProjection,
} from './analysis.js';
import type { FactualSourceRangeProjection } from './factual-verification.js';
import {
  EDITORIAL_REVIEW_CONTRACT_VERSION,
  type ReviewCategoryGoal,
  type ReviewCategoryKindId,
  type ReviewCategoryTaskMode,
  type ReviewCategoryUpdateMode,
} from './task-kinds.js';
import type {
  ExecutionRouteId,
  LearningLedgerMaterialKind,
  ResultSetPolicyPin,
  TrustedOperationalScope,
} from '../protocol.js';
import type { ReviewRunProcedureProjection } from './captured-procedures.js';
import type { WritingTaskMaterialProjection } from './writing.js';
import type { TaskPlanProjection } from './task-plan.js';

// ---- 审阅 review categories (Issue #417, plan slice S69) --------------------------------------------

/** V2-UX-REV-004's three severities, as the contract spells them and as an editor reads them. */
export type ReviewFindingSeverity = 'must' | 'should' | 'note';

export const REVIEW_FINDING_SEVERITIES: readonly ReviewFindingSeverity[] = ['must', 'should', 'note'];

export const REVIEW_FINDING_SEVERITY_LABELS = {
  must: '必须处理',
  should: '建议处理',
  note: '提示',
} as const satisfies Record<ReviewFindingSeverity, string>;

/** What a category's findings become on the manuscript: a 修改建议 with its replacement, or a 批注. */
export type ReviewCategoryOutputKind = 'change-suggestion' | 'annotation';

/** The category facts a revision states about itself, so a finding never has to repeat them. */
export interface ReviewCategoryIdentityProjection {
  categoryId: string;
  label: string;
  output: ReviewCategoryOutputKind;
  /** Findings of this category are only `需人工复核的风险点`: AI7 states no compliance, plagiarism or policy verdict. */
  riskPointsOnly: boolean;
}

/** The identity of one listed finding inside its unit: the block it named and its position in the list. */
export interface ReviewFindingIdentityProjection {
  unitOrdinal: number;
  blockOrdinal: number;
  findingOrdinal: number;
}

/** Exact unit evidence retained when overlapping review units name the same occurrence. */
export interface ReviewUnitFindingReference extends ReviewFindingIdentityProjection {
  unitDigest: string;
  resultDigest: string;
}

/** A baseline is frozen with the category Run; it is a lead, never a replacement for manuscript evidence. */
export interface ReviewBaselineSource {
  resultSetId: string;
  revisionId: string;
  digest: string;
  manuscriptPin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
  leads: ReadonlyArray<{ ref: string; kind: string; text: string; ranges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
  omitted: number;
}

export interface ReviewSynthesisEvidence {
  ref: string;
  blockPosition: number;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  unitOrdinal: number;
  unitFindingRefs: ReadonlyArray<ReviewUnitFindingReference>;
  baselineLeadRefs: ReadonlyArray<string>;
}

export interface ReviewCrossChapterInput {
  schema: 'ai7.editorial-review.cross-chapter-input/1';
  categoryId: string;
  categoryContractDigest: string;
  closedUnitSetDigest: string;
  units: ReadonlyArray<{ unitOrdinal: number; unitDigest: string; resultDigest: string }>;
  manuscriptPin: CoverageManifestProjection['manuscript'];
  baseline: ReviewBaselineSource | null;
  findings: ReadonlyArray<ReviewCategoryFindingProjection>;
  evidence: ReadonlyArray<ReviewSynthesisEvidence>;
  omitted: { units: number; findings: number; evidence: number; baselineLeads: number };
}

export interface ReviewCrossChapterResult extends SalvagedModelResult {
  readonly schema: 'ai7.editorial-review.cross-chapter-result/1';
  readonly findings: ReadonlyArray<{ readonly anchor: ReviewSynthesisEvidence; readonly evidence: ReadonlyArray<ReviewSynthesisEvidence>;
    readonly severity: ReviewFindingSeverity; readonly note: string; readonly clauseId: string | null }>;
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly text: string; readonly reason: 'schema-invalid' | 'evidence-unknown' }>;
  readonly input: ReviewCrossChapterInput;
}

/**
 * One located review finding. `sourceRange` is the exact grapheme range the service found the
 * quotation at in the committed block — never an offset the model supplied — which is the anchor an
 * Editorial Mark is made from. `replacement` is the text a 修改建议 proposes in place of that range
 * (an empty string proposes deleting it) and is `null` for a 批注.
 */
export interface ReviewCategoryFindingProjection {
  findingId: string;
  unitOrdinal: number;
  blockId: string;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  severity: ReviewFindingSeverity;
  note: string;
  replacement: string | null;
  /** The guideline clause the model named as its basis, when it named one the category lists. */
  clauseId: string | null;
  /** The identities of the duplicate findings merged into this record; empty when none were. */
  mergedFrom: ReadonlyArray<ReviewFindingIdentityProjection>;
  /** Includes the first unit finding as well as every duplicate; historical records may omit it. */
  unitFindingRefs?: ReadonlyArray<ReviewUnitFindingReference>;
  crossChapter?: {
    contractDigest: string;
    requestDigest: string;
    evidence: ReadonlyArray<ReviewSynthesisEvidence>;
    baseline: Omit<ReviewBaselineSource, 'leads' | 'omitted'> | null;
  };
}

/**
 * Why a listed finding never became one. The first two are Reference Integrity's — the quotation is
 * not in the block it named, or is there more than once — and the third is a 修改建议 whose replacement
 * is exactly the text already there, which proposes nothing.
 */
export type ReviewFindingExclusionReason = 'quote-not-found' | 'quote-ambiguous' | 'replacement-identical' | 'not-exact-fetched' | ReviewContractRejectionReason;

/** The excluded appendix: what the model listed that the service could not anchor; never a mark. */
export interface ReviewCategoryExcludedProjection {
  rawText?: string;
  findingIndex?: number;
  findingId: string;
  unitOrdinal: number;
  /** The block the model named, when its ordinal resolved to one of the unit's blocks. */
  blockId: string;
  blockOrdinal: number;
  quote: string;
  severity: ReviewFindingSeverity;
  note: string;
  replacement: string | null;
  clauseId: string | null;
  reason: ReviewFindingExclusionReason;
  reasonLabel: string;
}

/** What the model listed, by severity, before any of it was located; a list, for the reason the factual counts are. */
export interface ReviewCategoryFindingCountsProjection {
  listed: number;
  bySeverity: ReadonlyArray<{ severity: ReviewFindingSeverity; count: number }>;
  /** Listed findings whose quotation verified, before duplicates merged. */
  located: number;
  excluded: number;
  merged: number;
}

/** Per-unit lineage of a review-category revision: beside the two every kind has, a unit the plan left unreviewed. */
export type ReviewCategoryUnitLineage = AnalysisUnitLineage | { kind: 'unreviewed' };

export interface ReviewScopePlanCounts extends AnalysisReusePlanCounts {
  /**
   * New units the plan does not read: never dispatched, settled as `out-of-scope` gaps — or, for one whose last read failed,
   * carried as the lost gap it is (Issue #716).
   */
  unreviewed: number;
}

export interface ReviewScopePlanUnitProjection {
  unitOrdinal: number;
  startPosition: number;
  endPosition: number;
  contentKey: string;
  disposition: 'reused' | 'recomputed' | 'unreviewed';
  /**
   * `selected-range` is an in-range unit of a first range review, where there is nothing to bypass;
   * `out-of-scope` is every `unreviewed` unit but one whose last read failed, which is `unreviewed` with
   * `predecessor-gap`: carried as a lost gap, never as out of scope (Issue #716). The other six read
   * exactly as the baseline plan's do.
   */
  reason:
    | 'compatible'
    | 'no-compatible-predecessor'
    | 'predecessor-gap'
    | 'contract-version-mismatch'
    | 'bypassed-selected-range'
    | 'bypassed-whole-book'
    | 'selected-range'
    | 'out-of-scope';
  reusedFrom: null | { revisionId: string; revisionOrdinal: number; unitOrdinal: number };
}

/**
 * The scope plan of a kind that leaves out-of-scope units unreviewed: the reuse plan's second record
 * version. It differs from `/1` in exactly what such a kind needs — a predecessor that may be absent
 * (a first range review has none), the `unreviewed` disposition with its count, and the kind it was
 * derived for — and is never written for the baseline or the factual kind, whose `/1` records keep
 * their bytes.
 */
export interface ReviewScopePlanProjection {
  schema: 'ai7.analysis.reuse-plan/2';
  /** The kind the plan was derived for; the record is kind-generic, and only review categories write it today. */
  kind: AnalysisKindId;
  mode: AnalysisTaskMode;
  contractVersion: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string; contractVersion: string; coverageManifestDigest: string; unitCount: number };
  coverageManifestDigest: string;
  selectedRange: BaselineAnalysisSelectedRange | null;
  recomputeClosure: ReadonlyArray<number>;
  units: ReadonlyArray<ReviewScopePlanUnitProjection>;
  predecessorUnits: ReadonlyArray<AnalysisReusePlanPredecessorUnitProjection>;
  counts: ReviewScopePlanCounts;
}

/** How a review-category revision came to be; a first range review has a plan and no predecessor. */
export interface ReviewCategoryRevisionUpdateProjection {
  mode: ReviewCategoryTaskMode;
  modeLabel: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  selectedRange: BaselineAnalysisSelectedRange | null;
  counts: ReviewScopePlanCounts;
}

export type ReviewCategoryUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      findings: ReadonlyArray<{
        blockOrdinal: number;
        quote: string;
        severity: ReviewFindingSeverity;
        note: string;
        replacement?: string;
        clauseId?: string;
      }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

/**
 * A review category's Result Set Revision: the located findings, the excluded appendix and the counts,
 * beside every shared component the other kinds carry, computed by the same reducers.
 */
export interface ReviewCategoryResultSetRevisionProjection {
  crossChapterSynthesis?:
    | { state: 'closed'; requestDigest: string; usage: { inputTokens: number; outputTokens: number } | null; result: ReviewCrossChapterResult }
    | { state: 'gap'; requestDigest: string; code: string; reason: string }
    | { state: 'not-run'; reason: string };
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  usage: { inputTokens: number; outputTokens: number; requests: number };
  update: ReviewCategoryRevisionUpdateProjection;
  lineage: ReadonlyArray<{ unitOrdinal: number } & ReviewCategoryUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  category: ReviewCategoryIdentityProjection;
  findings: ReadonlyArray<ReviewCategoryFindingProjection>;
  excluded: ReadonlyArray<ReviewCategoryExcludedProjection>;
  findingCounts: ReviewCategoryFindingCountsProjection;
  /** The adversarial sample drawn over `findings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  units: ReadonlyArray<ReviewCategoryUnitProjection>;
}

/** The latest Task's plan facts when it is any mode but the whole first review. */
export interface ReviewCategoryUpdateProjection {
  mode: Exclude<ReviewCategoryTaskMode, 'review-first'>;
  modeLabel: string;
  meaning: string;
  /** `null` for a first range review, which starts the Result Set it would otherwise name. */
  predecessor: null | {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  };
  /** Whether the Result Set still stands where the Task found it; authorization re-verifies it. */
  predecessorCurrent: boolean;
  selectedRange: BaselineAnalysisSelectedRange | null;
  reusePlan: ReviewScopePlanProjection | null;
  reusePlanDigest: string | null;
}

export interface ReviewCategoryUpdateActionProjection extends Omit<BaselineAnalysisUpdateActionProjection, 'mode' | 'expected'> {
  mode: ReviewCategoryUpdateMode;
  expected: ReviewScopePlanCounts | null;
}

export interface ReviewCategoryRangeOptionProjection extends Omit<BaselineAnalysisRangeOptionProjection, 'expected'> {
  expected: ReviewScopePlanCounts;
}

/** The update controls of one category, keyed by its own three update modes. */
export interface ReviewCategoryUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: {
    'review-sync': ReviewCategoryUpdateActionProjection;
    'review-range': ReviewCategoryUpdateActionProjection & { options: ReadonlyArray<ReviewCategoryRangeOptionProjection> };
    'review-again': ReviewCategoryUpdateActionProjection;
  };
}

export interface ReviewCategoryHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: ReviewCategoryTaskMode;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  counts: ReviewScopePlanCounts;
}

export interface ReviewCategoryHistoryProjection {
  resultSetId: string;
  kind: ReviewCategoryKindId;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<ReviewCategoryHistoryEntryProjection>;
}

/**
 * One review category's Task projection: the third member of the analysis projection union, on the
 * same real path as the other two and discriminated on `kind` (`isReviewCategoryKindId`).
 */
export interface ReviewCategoryProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: ReviewCategoryKindId;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  taskIntent: null | {
    taskIntentId: string;
    goal: ReviewCategoryGoal;
    expectedOutcome: string;
    createdAt: string;
    mode: ReviewCategoryTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'reference-integrity', 'finding-reduction'];
    stopCondition: string;
  };
  resultSetRevision: null | ReviewCategoryResultSetRevisionProjection;
  update: null | ReviewCategoryUpdateProjection;
  updateControls: null | ReviewCategoryUpdateControlsProjection;
  history: null | ReviewCategoryHistoryProjection;
  inspectedRevision: null | { revision: ReviewCategoryResultSetRevisionProjection; current: boolean; readOnly: true };
}

/** What a caller asks a category's ledger to prepare: the mode, and the block range a range mode needs. */
export interface ReviewCategoryTaskRequest {
  mode: ReviewCategoryTaskMode;
  selectedRange: BaselineAnalysisSelectedRange | null;
}

/** V2-UX-REV-001's four scopes: 全书, selected chapters, chapters changed since the last review, the current selection. */
export type ReviewScopeKind = 'whole' | 'chapters' | 'changed' | 'selection';

export const REVIEW_SCOPE_KINDS: readonly ReviewScopeKind[] = ['whole', 'chapters', 'changed', 'selection'];

export const REVIEW_SCOPE_LABELS = {
  whole: '全书',
  chapters: '选章',
  changed: '只审改动过的章',
  selection: '当前选区',
} as const satisfies Record<ReviewScopeKind, string>;

/**
 * What an editor asks a Review Run to read. 选章 names the first and the last chapter of one contiguous
 * run by the block identity of each chapter's first block; 当前选区 (Issue #423, S77b) names the first and
 * the last block of the selection 就这段发起任务… hands over, in the same two fields; every other scope
 * names neither.
 */
export interface ReviewRunScopeRequest {
  kind: ReviewScopeKind;
  fromChapterBlockId: string | null;
  toChapterBlockId: string | null;
}

/** V2-UX-REV-004's status, derived from the finding's mark and never stored beside it (MARK-010). */
export type ReviewFindingStatus = 'pending' | 'handled' | 'ignored';

export const REVIEW_FINDING_STATUS_LABELS = {
  pending: '待处理',
  handled: '已处理',
  ignored: '已忽略',
} as const satisfies Record<ReviewFindingStatus, string>;

/** Each category against the current manuscript (V2-UX-REV-007). */
export type ReviewCoverageState = 'never' | 'current' | 'needs-review' | 'unavailable';

export const REVIEW_COVERAGE_STATE_LABELS = {
  never: '未审阅',
  current: '已审阅 · 当前稿件',
  'needs-review': '需复审',
  unavailable: '不可用',
} as const satisfies Record<ReviewCoverageState, string>;

/**
 * A Review Run as a whole. `partial` is a Run that stopped with some categories finished and others not
 * — after a restart, `canContinue` says whether 继续审阅 would pick up the categories never finished.
 * `scope-changed` is a Run a Series Retrieval Exclusion stopped before a further read (Issue #64, S29b; SER-024): its only ways
 * on are 修改计划并重新授权 and 取消任务; `cancelled` is such a Run the editor then cancelled.
 * `waiting` is a Run the editor started with 联网后开始任务 (Issue #760, S74c; OFF-005): approved, and waiting in Connectivity
 * Wait — nothing of it has begun. `plan-moved` is such a Run whose plan moved before it could start (OFF-008): Reconnect Preflight
 * stopped it before anything was sent, and the way on is a new 审阅.
 */
export type ReviewRunState = 'prepared' | 'waiting' | 'running' | 'settled' | 'partial' | 'failed' | 'scope-changed' | 'plan-moved' | 'cancelled';

/**
 * One category inside a Review Run. `settled` means its findings are on the manuscript and actionable
 * (V2-UX-REV-008); `refused` is a category that could not start — its plan changed, its basis is gone,
 * or the launch cannot execute it — with the reason in `detail`.
 */
export type ReviewRunCategoryState = 'prepared' | 'waiting' | 'running' | 'settled' | 'failed' | 'interrupted' | 'refused';

export interface ReviewAvailabilityProjection {
  available: boolean;
  unavailableReason: string | null;
}

/** One category of the configuration as the 新建审阅 sheet shows it, its basis stated once (REV-010). */
export interface ReviewWorkspaceCategoryProjection {
  /** This category's research backend cannot currently run. */
  networkUnavailable?: boolean;
  /** Scope-derived estimates only; not a usage or billing promise (#1320). */
  crossChapter?: boolean;
  changedUnits?: number;
  /** Only model-calling review contracts consume 资料库 references; factual review does not. */
  materialReferencesAllowed?: boolean;
  categoryId: string;
  label: string;
  description: string;
  output: ReviewCategoryOutputKind;
  riskPointsOnly: boolean;
  batchApply: boolean;
  searchEngine: boolean;
  /** Whether the category reads without a model and sends nothing: the leads read the baseline analysis. */
  modelFree: boolean;
  basis: ReviewCategoryBasis;
  guidelineDocuments: ReadonlyArray<{ documentId: string; title: string; issuer: string; version: string; clauseCount: number }>;
  procedure: { title: string; version: string };
  available: boolean;
  unavailableReason: string | null;
  /** Which scopes this category can read now; 事实核查 and the leads read fewer than the rest. */
  scopes: Readonly<Record<ReviewScopeKind, ReviewAvailabilityProjection>>;
}

/** One row of the coverage matrix: a category against the manuscript as it stands now (REV-007). */
export interface ReviewCoverageRowProjection {
  categoryId: string;
  label: string;
  state: ReviewCoverageState;
  stateLabel: string;
  /** The 第 N 次 whose findings this row stands on; `null` before any. */
  lastRunOrdinal: number | null;
  /** The Manuscript Revision that review read; `null` before any. */
  lastReviewedRevisionLabel: string | null;
  /** Blocks added, removed or changed since that review; `null` before any. */
  changedBlocks: number | null;
  /**
   * Why the category cannot run, on an `unavailable` row; on a reviewed one (Issue #709), what could not be checked: an
   * earlier review record the walk for unread changes could not read. `null` otherwise.
   */
  unavailableReason: string | null;
}

/**
 * A chapter an editor can start or end 选章 at. From the outline when the manuscript has headings; a
 * manuscript without any offers its analysis units instead, which is the structure a review reads.
 */
export interface ReviewChapterOptionProjection {
  blockId: string;
  title: string;
  level: number;
  position: number;
  /** The chapter's last block: the block before the next chapter of the same or a higher level, or the manuscript's last. */
  endPosition: number;
}

export interface ReviewScopeOptionsProjection {
  whole: ReviewAvailabilityProjection;
  chapters: ReviewAvailabilityProjection & { basis: 'outline' | 'analysis-units'; chapters: ReadonlyArray<ReviewChapterOptionProjection> };
  changed: ReviewAvailabilityProjection;
  selection: ReviewAvailabilityProjection;
}

/** Findings by severity and by derived status; a finding counts once in each. */
export interface ReviewFindingCountsProjection {
  must: number;
  should: number;
  note: number;
  pending: number;
  handled: number;
  ignored: number;
}

/** One entry of the 审阅记录 list, newest first: 第 N 次 with its categories, scope and outcome. */
export interface ReviewRunSummaryProjection {
  /** Frozen producing model and sent effort; absent when no model was used. */
  modelLabel?: string;
  reviewRunId: string;
  ordinal: number;
  label: string;
  createdAt: string;
  scopeLabel: string;
  categoryLabels: ReadonlyArray<string>;
  state: ReviewRunState;
  stateLabel: string;
  findingCounts: ReviewFindingCountsProjection;
  /** The latest 审阅报告 version; `null` before one is generated. */
  reportVersion: number | null;
  /** `此结果使用的材料后来被排除` when a result of the Run used Series material later excluded (Issue #64, S29b; SER-026). */
  historicalMarker: string | null;
}

/** What a category's Task plan freezes, as the plan screen states it before the one approval. */
export interface ReviewRunCategoryPlanProjection {
  units: number;
  recomputed: number;
  reused: number;
  unreviewed: number;
  taskInputRevisionLabel: string;
  routeLabel: string;
  providerStatusLabel: string;
  budgetCeilingLabel: string;
}

export interface ReviewRunCategoryProjection {
  categoryId: string;
  label: string;
  position: number;
  output: ReviewCategoryOutputKind;
  riskPointsOnly: boolean;
  batchApply: boolean;
  basis: ReviewCategoryBasis;
  state: ReviewRunCategoryState;
  stateLabel: string;
  detail: string | null;
  /** The category's Task; `null` for the model-free leads, which have none. */
  taskIntentId: string | null;
  planEnvelopeDigest: string | null;
  modeLabel: string | null;
  plan: ReviewRunCategoryPlanProjection | null;
  /** Measured Run Progress while this category's Run executes; `null` otherwise. */
  progress: NonNullable<BaselineAnalysisProjection['run']>['progress'];
  findingsCount: number;
  /** What the category listed that could not be anchored: the excluded appendix, never a mark. */
  excludedCount: number;
}

/** One finding of a Review Run: one record with the Editorial Mark it became (MARK-010, FIND-002). */
export interface ReviewFindingProjection {
  findingId: string;
  categoryId: string;
  categoryLabel: string;
  ordinal: number;
  severity: ReviewFindingSeverity;
  severityLabel: string;
  output: ReviewCategoryOutputKind;
  /** Only `需人工复核的风险点`: AI7 states no compliance, plagiarism or policy verdict (REV-003). */
  riskPoint: boolean;
  status: ReviewFindingStatus;
  statusLabel: string;
  statusDetail: string;
  blockId: string;
  /** Where the words stand now: the mark's live range, or the range the review found them at. */
  fromGrapheme: number;
  toGrapheme: number;
  /** The block's position in the working manuscript; `null` once the block is no longer part of it. */
  blockPosition: number | null;
  /** The chapter option the block falls in, for the 章 filter; `null` outside every chapter. */
  chapterBlockId: string | null;
  chapterTitle: string | null;
  quote: string;
  note: string;
  referencedRuleVersions?: ReadonlyArray<ReferencedRuleVersion>;
  /** The latest local decision's identity, for its optional learning ask. */
  learningDecisionId?: string | null;
  /** What a 修改建议 proposes in place of the quotation (empty proposes deleting it); `null` for a 批注. */
  replacement: string | null;
  clauseRefs: ReadonlyArray<{ documentTitle: string; clauseId: string; text: string }>;
  /** The finding's own state line, such as 事实核查's `未外部复核`; `null` when it has none. */
  stateLine: string | null;
  markId: string | null;
  markStatus: 'open' | 'resolved' | 'applied' | 'removed' | 'converted' | null;
  anchorState: 'exact' | 'drifted' | 'detached' | 'anchor-changed';
  ignoreReason: string | null;
  /**
   * `此结果使用的材料后来被排除` when the finding's category read Series material later excluded (Issue #64, S29b; SER-026):
   * history, never a verdict on the finding, which stays exactly as it was.
   */
  historicalMarker: string | null;
}

/** The versioned 审阅报告 (REV-009) exactly as recorded, read back with the digest of its canonical JSON. */
export interface ReviewReportProjection {
  reportId: string;
  version: number;
  generatedAt: string;
  digest: string;
  record: ReviewReportRecord;
}

/** The most Learning Materials 为什么会影响这个结果 names for one category; the rest are counted. */
export const MAX_REVIEW_RUN_INFLUENCE_MATERIALS = 20;

/** One category's 本社审阅偏好 version and the materials behind the lines its Run read (Issue #912). */
export interface ReviewRunInfluenceProjection {
  categoryId: string;
  categoryLabel: string;
  versionId: string;
  ordinal: number;
  sourceCount: number;
  materials: ReadonlyArray<{
    bookId: string;
    bookTitle: string;
    /** `null` where the decision behind it is no longer in this house's records. */
    materialKey: string | null;
    kind: LearningLedgerMaterialKind | null;
    /** Local historical provenance only; absent on legacy /1 sources. */
    provenanceAvailability?: 'available' | 'unavailable';
    /** When its 停止今后使用 was recorded after it was admitted; `null` while it stands. */
    withdrawnAt: string | null;
  }>;
  moreMaterials: number;
}

/** Local, versioned editorial preferences; attribution never enters the prompt block. */
export interface HouseReviewPreferenceUse {
  /** New requests use the unified envelope; absent historical pins retain their original prompt. */
  editorialMemory?: { version: 1; categories: ReadonlyArray<string> };
  versionId: string;
  ordinal: number;
  materialSetDigest: string;
  sourceCount: number;
  lines: ReadonlyArray<string>;
  /** Absent on /1–/3 pins. Indices identify whole lines of the exact version, in retrieval rank order. */
  selection?: { lineIndexes: ReadonlyArray<number> };
}

export interface HouseReviewPreferenceVersion {
  schema: 'ai7.house-review-preference/1' | 'ai7.house-review-preference/2';
  governance?: { baseLines: HouseReviewPreferenceVersion['lines']; baseMaterialSetDigest: string; headDirectiveId: string };
  legacyBasis?: { lines: HouseReviewPreferenceVersion['lines']; materialSetDigest: string };
  versionId: string;
  ordinal: number;
  supersedes: string | null;
  operationalScope: TrustedOperationalScope;
  materialSetDigest: string;
  recordedAt: string;
  sourceCount: number;
  lines: ReadonlyArray<{
    text: string; categoryId: string; bookId: string | null;
    lineId?: string;
    owner?: { kind: 'legacy-preference'; itemId: string } | { kind: 'editorial-memory'; itemId: string; versionId: string };
    sources: ReadonlyArray<HouseReviewPreferenceSource>;
  }>;
}

export type HouseReviewPreferenceSource = {
  kind?: 'review-decision'; bookId: string; bookTitle: string; materialDigest: string; decisionId: string;
  eligibilityDecisionId: string; qualityLineageDigest: string; feedbackKey?: string;
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
} | {
  kind: 'editorial-memory'; bookId: string; bookTitle: string; materialDigest: string; decisionId: string | null;
  /** Automatic admission has no human decision identity. */
  eligibilityDecisionId?: never;
  itemId: string; versionId: string; actionId: string; sourceKey: string; feedbackKey: string;
  captured: import('./learning.js').EditorialMemorySourceSnapshot;
  currentAdmission: import('./learning.js').EditorialMemoryAdmission;
  currentEligibility: 'book' | 'house';
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
};

export interface HouseReviewPreferenceProjection {
  operationalScope: TrustedOperationalScope;
  current: HouseReviewPreferenceVersion | null;
  history: ReadonlyArray<{ versionId: string; ordinal: number; recordedAt: string; sourceCount: number }>;
  basis: string;
}

export interface EditQualitySignalsProjection {
  bookId: string | null;
  applied: number;
  surviving: number;
  editVolume: number;
  lineageDigest: string;
  preferenceAdoption?: ReadonlyArray<PreferenceAdoptionProjection>;
  preferenceAdoptionNext?: PreferenceAdoptionCursor | null;
  categories: ReadonlyArray<{ categoryId: string; applied: number; surviving: number; editVolume: number; lineageDigest: string }>;
}

export interface ReviewReportRecord extends ReviewReportDerivedSections {
  schema: ReviewReportSchema;
  reviewRunId: string;
  version: number;
  generatedAt: string;
  run: {
    modelLabel?: string;
    ordinal: number;
    label: string;
    createdAt: string;
    scopeLabel: string;
    manuscript: { revisionId: string; revisionLabel: string; journalSequence: number };
  };
  overview: {
    title: '概览表';
    rows: ReadonlyArray<{ categoryId: string; label: string; state: ReviewRunCategoryState; stateLabel: string; counts: ReviewFindingCountsProjection }>;
  };
  mustItems: {
    title: '必须处理的事项';
    items: ReadonlyArray<{
      findingId: string;
      categoryId: string;
      categoryLabel: string;
      locationLabel: string;
      quote: string;
      note: string;
      status: ReviewFindingStatus;
      statusLabel: string;
    }>;
  };
  categorySummaries: {
    title: '各类别摘要';
    entries: ReadonlyArray<{
      categoryId: string;
      label: string;
      output: ReviewCategoryOutputKind;
      counts: ReviewFindingCountsProjection;
      basisStatement: string;
      excludedCount: number;
      stateLine: string;
    }>;
  };
  appendix: {
    title: '附录';
    referencedRules?: ReadonlyArray<{ findingId: string; categoryLabel: string; locationLabel: string; rules: ReadonlyArray<ReferencedRuleVersion> }>;
    configuration: { schema: string; version: string; digest: string };
    categories: ReadonlyArray<{
      categoryId: string;
      label: string;
      guidelineDocuments: ReadonlyArray<{ documentId: string; title: string; issuer: string; version: string }>;
      procedure: { procedureId: string; title: string; version: string };
      planEnvelopeDigest: string | null;
      resultSetRevisionId: string | null;
      adapterPin: { route: string; model: string; fixtureIdentity: string | null; fixtureSha256: string | null } | null;
    }>;
  };
}

/** The opened Review Run (the latest when none is named) with its categories, findings and Report. */
export interface ReviewRunProjection {
  modelLabel?: string;
  /** Existing repeat preparation input for optional references before authorization. */
  referenceInput?: Omit<PrepareReviewRunInput, 'bookId'>;
  localCheck?: {
    planDigest: string;
    options: import('./procedures.js').LocalCheckOptions;
    state: string;
    paragraphs: number;
    counts: Readonly<Record<string, { checked: number; exempt: number; skipped: number; error: number; findings: number; disabled: number; outOfApplicability: number; notRecognized: number; noFinding: number }>> | null;
    excluded: readonly { candidateId: string; reason: string }[];
  };
  reviewRunId: string;
  ordinal: number;
  label: string;
  createdAt: string;
  state: ReviewRunState;
  stateLabel: string;
  /** 继续审阅 is offered exactly when an authorized Run stopped with categories never finished. */
  canContinue: boolean;
  /**
   * `selection` names a 当前选区 Run's first and last paragraph by block identity (Issue #423 review, P2-4), so 返回修改 asks for
   * the same paragraphs again; `null` for every other scope.
   */
  scope: { kind: ReviewScopeKind; label: string; selectedRange: BaselineAnalysisSelectedRange | null; selection: null | { fromBlockId: string; toBlockId: string } };
  manuscript: { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string };
  configurationDigest: string;
  authorization: null | { authorizedAt: string };
  categories: ReadonlyArray<ReviewRunCategoryProjection>;
  /**
   * One page of the findings that pass the asked filters, in ordinal order from the asked cursor on: at
   * most `MAX_REVIEW_FINDINGS_PER_PAGE`, and fewer when their words weigh more, so the workspace always
   * crosses the service boundary in one frame. The next page is read with `findingsAfterOrdinal` set to
   * the last ordinal here and the same filters.
   */
  excluded?: ReadonlyArray<ReviewExcludedFindingProjection>;
  excludedTotal?: number;
  excludedTruncated?: boolean;
  excludedNextOrdinal?: number | null;
  findings: ReadonlyArray<ReviewFindingProjection>;
  /** How many findings pass the filters, before any page is taken; unfiltered, every finding of the Run. */
  findingsTotal: number;
  /** Whether findings that pass the filters remain after this page. */
  findingsTruncated: boolean;
  /** Every finding of the Run by severity and status, whatever the filters and the page: a filter is a view (FIND-003). */
  findingCounts: ReviewFindingCountsProjection;
  report: ReviewReportProjection | null;
  reportVersions: ReadonlyArray<{ reportId: string; version: number; generatedAt: string; digest: string }>;
  /**
   * The Historically Affected Result Marker (Issue #64, S29b; SER-026): the result the Run formed used Series material that was
   * excluded afterwards. The Run, its findings and its reports are never rewritten; this says so beside them.
   */
  historicalMarker: null | {
    label: typeof HISTORICALLY_AFFECTED_RESULT_MARKER | typeof HISTORICAL_MARKER_UNVERIFIABLE | typeof LEARNING_INFLUENCE_RESULT_MARKER;
    detail: string;
    /** For a result that read a 本社审阅偏好 version since remediated (Issue #912; LAUD-008): the material, which opens in 学习回溯. */
    remediation?: { bookId: string; materialKey: string; recordedAt: string };
  };
  /**
   * 为什么会影响这个结果 (Issue #912; LAUD-004): each category's pinned 本社审阅偏好 version and the Learning Materials behind the
   * lines it read; empty when no category read one.
   */
  influence: ReadonlyArray<ReviewRunInfluenceProjection>;
  /** What a `scope-changed` Run stopped for: Series material excluded, or a 本社审阅偏好 version whose material was withdrawn. */
  scopeStop: null | 'series-knowledge' | 'house-review-preference';
  /** The Captured Procedure version the Run was prepared from, pinned (Issue #65, S30; ADR 0087 §4); `null` for one chosen by hand. */
  procedure: ReviewRunProcedureProjection | null;
  /** The pre-installed procedure version each category ran (Issue #1081, F-26a); empty for a Run recorded before revision 85. */
  preinstalledProcedures?: ReadonlyArray<{ categoryId: string; procedure: ProcedureDefinitionPin }>;
  /** Whether `将以上工序保存为可复用工序` is offered on this Run, and why not (ADR 0087 §2). */
  capture: ReviewAvailabilityProjection;
}

export interface TaskMaterialOffersProjection {
  readonly statement: string;
  readonly items: ReadonlyArray<WritingTaskMaterialProjection>;
  readonly more: number;
}

/**
 * The 审阅 destination of one Book (V2-UX-REV-001 to REV-013): the configured categories with their
 * basis, the coverage matrix, the scope options, the 审阅记录, and the opened Run.
 */
export interface ReviewWorkspaceProjection {
  /** Own ranges of the current coverage units, without manuscript text. */
  scopeUnitCounts?: { whole: number; units: ReadonlyArray<{ startPosition: number; endPosition: number }> };
  /** Latest editor-declared Book table, carried by its existing local ReviewRun. */
  localBookTerms?: readonly import('./procedures.js').BookTermEntry[];
  listPages?: TaskPlanProjection['listPages'];
  /** Eligible local references offered separately from manuscript scope (Issue #428). */
  materials?: TaskMaterialOffersProjection;
  bookId: string;
  /** The Book's primary Manuscript as it stands now; `null` for a Book without one. */
  manuscript: null | { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string; totalBlocks: number };
  configuration: { schema: string; version: string; digest: string };
  categories: ReadonlyArray<ReviewWorkspaceCategoryProjection>;
  coverage: ReadonlyArray<ReviewCoverageRowProjection>;
  scopeOptions: ReviewScopeOptionsProjection;
  /** Whether 新建审阅 can prepare a Run now: not while one of this Book's runs is under way. */
  newReview: ReviewAvailabilityProjection;
  /** The 审阅记录 newest first, at most `MAX_REVIEW_RUN_SUMMARIES` of them. */
  runs: ReadonlyArray<ReviewRunSummaryProjection>;
  /** Whether older Review Runs exist beyond `runs`; each stays openable by its identity. */
  runsTruncated: boolean;
  run: ReviewRunProjection | null;
}

/**
 * The most categories one Review Run request names: the built-in configuration's nine. It bounds a
 * request frame only — which categories exist is configuration — so a house configuration with more
 * categories raises it together with its own.
 */
export const MAX_REVIEW_RUN_CATEGORIES = 9;

/** 忽略并说明's reason, in characters once trimmed; a blank one is no reason (V2-UX-REV-004). */
export const MAX_REVIEW_FINDING_REASON_CHARACTERS = 500;

/** A finding of a Review Run: `rvf_` and 24 hex digits, content-derived from the Run, the category and the kind-level finding. */
export const REVIEW_FINDING_ID_PATTERN = /^rvf_[0-9a-f]{24}$/u;

/** The most findings one workspace answer carries; a finding weighs about a kilobyte on the wire. */
export const MAX_REVIEW_FINDINGS_PER_PAGE = 300;

/** The most 审阅记录 entries one workspace answer lists, newest first. */
export const MAX_REVIEW_RUN_SUMMARIES = 50;

/** The most 修改建议 one 确认应用 writes: the batch Apply's own bound (Issue #408). */
export const MAX_BATCH_APPLY_SUGGESTIONS = 500;

export const REVIEW_FINDING_STATUSES: readonly ReviewFindingStatus[] = ['pending', 'handled', 'ignored'];

/**
 * Which of the opened Run's findings one workspace answer carries (V2-UX-REV-005, FIND-003): a cursor
 * and the four filters of the results, each `null` for 全部. Filtering happens in the service so a page
 * stays small; it is a view only and changes no finding, disposition or mark.
 */
export interface ReviewFindingPageRequest {
  excludedAfterOrdinal?: number | null;
  /** The last ordinal the previous page ended at; `null` starts at the first finding. */
  findingsAfterOrdinal: number | null;
  categoryId: string | null;
  severity: ReviewFindingSeverity | null;
  status: ReviewFindingStatus | null;
  /** The chapter option (`ReviewChapterOptionProjection.blockId`) a finding falls in. */
  chapterBlockId: string | null;
}

/** The optional keys an inspection of the 审阅 workspace may carry beside the Book and the Run. */
export const REVIEW_FINDING_PAGE_KEYS = ['findingsAfterOrdinal', 'categoryId', 'severity', 'status', 'chapterBlockId', 'excludedAfterOrdinal'] as const satisfies
  ReadonlyArray<keyof ReviewFindingPageRequest>;

/**
 * The inputs of the 审阅 operations (Issue #417, plan slice S69, Stage C). The Book is always the
 * route's, never the renderer's: every renderer member takes the input without `bookId`, and the main
 * process supplies the Book its window is showing.
 */
export interface InspectReviewWorkspaceInput extends Partial<ReviewFindingPageRequest> {
  /** Read-only availability for a task choice; it creates no task or snapshot. */
  executionConfig?: import('../runtime-execution-config.js').RuntimeExecutionConfig;
  bookId: string;
  /** The Review Run to open; `null` opens the latest. */
  reviewRunId: string | null;
}

/** Exact authorization-time Series records; membership is prospective, exclusions remain current-read restrictions. */
export interface FrozenSeriesScope {
  readonly seriesId: string;
  readonly title: string;
  readonly members: ReadonlyArray<{
    readonly bookId: string;
    readonly manuscriptId: string | null;
    readonly revisionId: string | null;
    readonly revisionDigest: string | null;
    readonly sourceVersionId: string | null;
  }>;
  readonly knowledge: ReadonlyArray<{ readonly itemId: string; readonly revisionId: string; readonly ordinal: number; readonly digest: string }>;
  readonly exclusions: ReadonlyArray<{ readonly exclusionId: string; readonly revisionId: string; readonly version: number }>;
}

export interface PrepareReviewRunInput extends CompositeReviewRunRequest {
  decisionId?: string;
  localCheck?: import('./procedures.js').LocalCheckOptions;
  seriesId?: string | null;
  materialIds?: ReadonlyArray<string>;
  bookId: string;
  categoryIds: ReadonlyArray<string>;
  scope: ReviewRunScopeRequest;
  /**
   * The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4): exactly the version and digest
   * `inspectCapturedProcedureRun` resolved. Left out, or `null`, for categories chosen by hand.
   */
  capturedProcedure?: { versionId: string; documentSha256: string } | null;
}

export interface AuthorizeReviewRunInput {
  bookId: string;
  reviewRunId: string;
  /** The exact plan digest of every Task-backed category of the Run; none for a Run of the leads alone. */
  planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
}

/** 继续审阅: drive again a Run that stopped with categories never finished (after a restart). */
export interface ContinueReviewRunInput {
  bookId: string;
  reviewRunId: string;
}

export interface RecordReviewFindingDispositionInput {
  bookId: string;
  reviewRunId: string;
  findingId: string;
  disposition: 'ignored';
  reason: string;
}

export interface GenerateReviewReportInput {
  bookId: string;
  reviewRunId: string;
}

/** 取消任务 of a Review Run a Series Retrieval Exclusion stopped (Issue #64, S29b; SER-024). */
export interface CancelReviewRunInput {
  bookId: string;
  reviewRunId: string;
}

/** 查看任务 on a Mark Card: which Review Run a produced mark came from, asked within the route's Book. */
export interface InspectReviewFindingOfMarkInput {
  bookId: string;
  markId: string;
}

/**
 * The renderer's form of the mark lookup: the manuscript and branch the Mark Card was opened on are the
 * capability its window holds, and the main process asks within that capability's Book.
 */
export interface InspectReviewFindingOfMarkRendererInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

/**
 * The Review Run and finding a `review-category` mark belongs to — the latest Run naming it — so 查看任务
 * opens that Run with `inspectReviewWorkspace`. The lookup answers `null` for any other mark, and for a
 * mark of another Book.
 */
export interface ReviewFindingOfMarkProjection {
  bookId: string;
  reviewRunId: string;
  findingId: string;
}
