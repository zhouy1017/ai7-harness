import type { SalvagedModelResult } from './analysis.js';
import type { FrozenWebToolsFallback } from './search-backends.js';
import type { ProcedureDefinitionPin } from './procedures.js';
import {
  BASELINE_ANALYSIS_CONTRACT_VERSION,
  BASELINE_ANALYSIS_KIND,
  EVALUATION_REWRITE_KIND,
  FACTUAL_REVIEW_KIND,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
  WRITING_KIND,
  type BaselineAnalysisGoal,
  type BaselineAnalysisTaskMode,
  type BaselineAnalysisUpdateMode,
  type CustomAnalysisGoal,
  type CustomAnalysisKindId,
  type EvaluationRewriteGoal,
  type EvaluationRewriteTaskMode,
  type FactualReviewGoal,
  type FactualReviewTaskMode,
  type InitialEvaluationGoal,
  type InitialEvaluationTaskMode,
  type ReadersReportGoal,
  type ReadersReportTaskMode,
  type ReviewCategoryGoal,
  type ReviewCategoryKindId,
  type ReviewCategoryTaskMode,
  type WritingGoal,
  type WritingTaskMode,
} from './task-kinds.js';
import type {
  AnalysisAssuranceAxis,
  AnalysisAssuranceSampleProjection,
  AnalysisConflictProjection,
  AnalysisCoverageAxis,
  AnalysisCrossUnitFindingProjection,
  AnalysisCrossUnitReductionProjection,
  AnalysisEntityProjection,
  AnalysisEventProjection,
  AnalysisFreshnessAxis,
  AnalysisGapProjection,
  AnalysisReducerClosureAxis,
  AnalysisRelationshipProjection,
  AnalysisSectionProjection,
  AnalysisSettingClaimProjection,
  AnalysisSourceRangeProjection,
  AnalysisSynthesisProjection,
  CoverageManifestProjection,
  RunReportProjection,
} from './analysis.js';
import type {
  CredentialSlotId,
  ExecutionRouteId,
  FrozenWebToolsBackend,
  LocalFixtureProfile,
  ModelCredentialOperationState,
  ProviderProcessingPin,
  RemoteProviderId,
  ResultSetPolicyPin,
  RunBudgetCeilingState,
  SelectedPolicyIdentity,
  TaskAuthorizationProjection,
} from '../protocol.js';
import type { EvidenceAssuranceLevel } from './factual-verification.js';
import type { DefaultExecutionRuleReference } from './task-plan.js';

/** Every analysis kind a Book may hold, and every Task mode any of them declares. */
export type AnalysisKindId = typeof BASELINE_ANALYSIS_KIND | typeof FACTUAL_REVIEW_KIND | ReviewCategoryKindId | typeof INITIAL_EVALUATION_KIND |
  typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND | typeof WRITING_KIND | CustomAnalysisKindId;

export type AnalysisTaskMode = BaselineAnalysisTaskMode | FactualReviewTaskMode | ReviewCategoryTaskMode | InitialEvaluationTaskMode | ReadersReportTaskMode |
  EvaluationRewriteTaskMode | WritingTaskMode;

export type AnalysisGoal = BaselineAnalysisGoal | FactualReviewGoal | ReviewCategoryGoal | InitialEvaluationGoal | ReadersReportGoal | EvaluationRewriteGoal |
  WritingGoal | CustomAnalysisGoal;

/** An explicit editor choice over exact block positions of the Task Input revision (inclusive). */
export interface BaselineAnalysisSelectedRange {
  startPosition: number;
  endPosition: number;
}

/** The update request carried by `prepareBaselineAnalysis` beside the fixed goal; `null` for the first baseline. */
export interface BaselineAnalysisUpdateRequest {
  mode: BaselineAnalysisUpdateMode;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /**
   * 重新分析这段 (Issue #423 review, P3-3): the selection's first and last paragraph by block identity, which the service resolves
   * to `selectedRange` against the working manuscript as the Task is prepared — as 审阅这段 names its paragraphs. Only with
   * `reanalyze-range` and a `null` `selectedRange`; absent everywhere else.
   */
  selectedBlocks?: { fromBlockId: string; toBlockId: string } | null;
}

export interface AnalysisReusePlanCounts {
  reused: number;
  recomputed: number;
  invalidated: number;
  bypassed: number;
}

export interface AnalysisReusePlanUnitProjection {
  unitOrdinal: number;
  startPosition: number;
  endPosition: number;
  /** The content-exact, position-independent compatibility key of the new unit. */
  contentKey: string;
  disposition: 'reused' | 'recomputed';
  reason: 'compatible' | 'no-compatible-predecessor' | 'predecessor-gap' | 'contract-version-mismatch' | 'bypassed-selected-range' | 'bypassed-whole-book';
  reusedFrom: null | { revisionId: string; revisionOrdinal: number; unitOrdinal: number };
}

export interface AnalysisReusePlanPredecessorUnitProjection {
  unitOrdinal: number;
  state: 'closed' | 'gap';
  disposition: 'reused' | 'bypassed' | 'invalidated';
  successorUnitOrdinal: number | null;
}

/** The canonical, digested reuse plan: a plan component recorded at preparation and re-derived at execution. */
export interface AnalysisReusePlanProjection {
  schema: 'ai7.baseline-manuscript-analysis.reuse-plan/1';
  mode: BaselineAnalysisUpdateMode;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  predecessor: { revisionId: string; ordinal: number; digest: string; contractVersion: string; coverageManifestDigest: string; unitCount: number };
  coverageManifestDigest: string;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /** Unit ordinals `重新分析所选范围` recomputes: the intersecting units plus their overlap dependants. */
  recomputeClosure: ReadonlyArray<number>;
  units: ReadonlyArray<AnalysisReusePlanUnitProjection>;
  predecessorUnits: ReadonlyArray<AnalysisReusePlanPredecessorUnitProjection>;
  counts: AnalysisReusePlanCounts;
}

/** Per-unit lineage of a Result Set Revision: recomputed by this Run, or reused from an exact predecessor unit. */
export type AnalysisUnitLineage =
  | { kind: 'recomputed' }
  | { kind: 'reused'; revisionId: string; revisionOrdinal: number; unitOrdinal: number };

export type BaselineAnalysisRunState =
  | 'authorized'
  | 'blocked-before-dispatch'
  | 'admitted'
  | 'executing'
  | 'completed'
  | 'completed-with-gaps'
  | 'failed'
  | 'interrupted'
  // Connectivity Wait (Issue #502): authorized by 联网后开始任务 and waiting for Reconnect Preflight to admit it,
  // or cancelled by the editor while it waited — before it ever dispatched (OFF-005, OFF-010).
  | 'awaiting-connectivity'
  // `cancelled` is also where 取消任务 ends a Run that started (Issue #422, CTRL-005): after `cancelling`, 正在取消,
  // while the Run stops at the next unit boundary, and once what it did is classified and recorded.
  | 'cancelled'
  | 'cancelling'
  // 暂停 and 续行 (Issue #422, S76b; CTRL-001, CONT-014): 正在暂停 until the Run reaches a unit boundary, 已暂停 once what
  // it read is kept, and 任务已中断 · 可续行 for a Run AI7 stopped under, its authorization kept for 续行.
  | 'pausing'
  | 'paused'
  | 'resumable'
  // 任务等待你的说明 (Issue #422, S76d; CLAR-004): every unit the Run could read is read, and it waits — holding nothing —
  // for the editor's answer to what it asked before the rest can go on.
  | 'awaiting-clarification';

export type BaselineAnalysisUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      /** The request digest of the model request that produced this result (the predecessor's for a reused unit). */
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: AnalysisUnitLineage;
      confidence: 'high' | 'medium' | 'low';
      synopsis: string;
      entities: ReadonlyArray<Omit<AnalysisEntityProjection, 'unitOrdinals'>>;
      events: ReadonlyArray<Omit<AnalysisEventProjection, 'unitOrdinal'>>;
      relationships: ReadonlyArray<Omit<AnalysisRelationshipProjection, 'unitOrdinals'>>;
      settingClaims: ReadonlyArray<Omit<AnalysisSettingClaimProjection, 'unitOrdinal'>>;
      conflicts: ReadonlyArray<{ description: string; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
      unresolved: ReadonlyArray<{ description: string; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
    }
  | {
      unitOrdinal: number;
      state: 'gap';
      originalTextChanged?: boolean;
      requestDigest: string;
      lineage: AnalysisUnitLineage;
      gap: AnalysisGapProjection;
    };

/**
 * How a Result Set Revision came to be: its kind's initial mode, or one exact update of a predecessor
 * revision. The mode is any analysis kind's mode, because every kind records how its revision arose.
 */
export interface BaselineAnalysisRevisionUpdateProjection {
  mode: AnalysisTaskMode;
  modeLabel: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  selectedRange: BaselineAnalysisSelectedRange | null;
  counts: AnalysisReusePlanCounts;
}

/** The material plan fields whose drift between Plan Preview and Run Authorization requires a Plan Revision (Issue #48). */
export type MaterialPlanField =
  | 'providerBinding.providerId'
  | 'providerBinding.modelId'
  | 'providerBinding.adapterRevision'
  | 'providerBinding.configurationRevision'
  | 'providerBinding.credentialReference'
  | 'artifactPin.identity'
  | 'artifactPin.version'
  | 'artifactPin.nativeCarrierSha256'
  | 'artifactPin.sidecarRevision'
  | 'artifactPin.sidecarSha256'
  | 'selectedRange'
  | 'predecessorRevision'
  | 'runBudgetCeiling'
  | 'outboundDataCategory'
  | 'expectedOutcome'
  | 'selectedPolicyIdentity'
  | 'localFixtureProfile';

/** The material inputs one frozen plan version carries, re-derived from durable state for drift detection. */
export interface MaterialPlanInputsProjection {
  selectedPolicyIdentity?: SelectedPolicyIdentity;
  localFixtureProfile?: LocalFixtureProfile;
  providerBinding: { providerId: string; modelId: string; adapterRevision: number; configurationRevision: number; credentialReference: string };
  artifactPin: { identity: string; version: string; nativeCarrierSha256: string; sidecarRevision: number; sidecarSha256: string };
  selectedRange: BaselineAnalysisSelectedRange | null;
  predecessorRevision: { revisionId: string; ordinal: number; digest: string } | null;
  runBudgetCeiling: RunBudgetCeilingState;
  outboundDataCategory: 'public-or-synthetic' | 'unpublished-excerpts';
  expectedOutcome: string;
}

export type PlanRevisionDiffValue =
  | string
  | number
  | null
  | SelectedPolicyIdentity
  | LocalFixtureProfile
  | BaselineAnalysisSelectedRange
  | { revisionId: string; ordinal: number; digest: string }
  | AnalysisReusePlanCounts
  /** The ceiling is a material field, so an explicit token ceiling is a diffable value too. */
  | Extract<RunBudgetCeilingState, { kind: 'tokens' }>;

/** One line of a concise Plan Revision diff: the field, its prior and proposed values, and whether it is material or a derived consequence. */
export interface PlanRevisionDiffEntryProjection {
  field: MaterialPlanField | 'reusePlan.counts' | PlanEditField;
  label: string;
  prior: PlanRevisionDiffValue;
  proposed: PlanRevisionDiffValue;
  /** `edited` for the editor's own change to the plan (Issue #419, V2-UX-PLAN-011). */
  materiality: 'material' | 'derived' | 'edited';
}

/**
 * The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): what the editor left out of a baseline analysis
 * plan — only what its Run honours. The plan AI7 proposed leaves out nothing.
 */
export interface PlanEditsProjection {
  /** 核对与抽检: the Run draws no assurance sample. */
  removedSteps: ReadonlyArray<'assurance-sampling'>;
  /** 不允许 the safe retry: a retry-safe failure settles as a gap. */
  disallowedAdaptations: ReadonlyArray<'safe-retry'>;
  /**
   * 先问你 (Issue #422, S76d; PLAN-011): the Run asks the editor before it makes the safe retry — a Clarification
   * Request — and makes it only once the editor answered 再试一次. Named only when it holds something.
   */
  askFirstAdaptations?: ReadonlyArray<'safe-retry'>;
  /**
   * 设置上限… (Issue #51, S16a; V2-UX-MODEL-015): the editor's Run Budget Ceiling, in total tokens, which the plan version
   * freezes into its Provider Resolution Plan. Named only when set; a plan without it states `未设置任务预算上限`.
   */
  runBudgetCeiling?: Extract<RunBudgetCeilingState, { kind: 'tokens' }>;
  /**
   * The Evidence Assurance Level of a factual-review Task (Issue #901; EASSURE-001): named only when it is not the default
   * 标准核查, so every plan written before it and every plan left at the default reads back byte for byte.
   */
  evidenceAssuranceLevel?: Exclude<EvidenceAssuranceLevel, 'standard'>;
}

/** The field a Plan Revision diff names for one edited item. */
export type PlanEditField = 'steps.assurance-sampling' | 'adaptations.safe-retry' | 'evidenceAssuranceLevel';

/** The Plan Boundary Split inside the canonical envelope: declared in-envelope adaptations, material fields, and expected editor participation. */
export interface PlanBoundarySplitProjection {
  adaptable: ReadonlyArray<{ adaptationClass: 'safe-retry' | 'contract-retry'; label: string; statement: string }>;
  /** The adaptations the editor moved into 先问你 (Issue #422, S76d); named only when there is one. */
  askFirst?: ReadonlyArray<{ adaptationClass: 'safe-retry'; label: string; statement: string }>;
  material: ReadonlyArray<{ field: MaterialPlanField; label: string }>;
  /** Whether the editor may be asked mid-Run, and where (PLAN-005). */
  participation: { expected: boolean; statement: string };
}

/** One immutable plan version of a Task Intent; only the latest can be `current` or `bound`. */
export interface BaselineAnalysisPlanVersionProjection {
  planVersionId: string;
  ordinal: number;
  planEnvelopeDigest: string;
  /** The Plan Revision this version resolved; `null` for the first version. */
  planRevisionId: string | null;
  createdAt: string;
  state: 'current' | 'superseded' | 'bound';
  /** What this version leaves out at the editor's word (Issue #419); nothing for a plan AI7 proposed. */
  edits: PlanEditsProjection;
}

/**
 * One Plan Revision: the immutable field-level diff between a prior plan version and the inputs
 * proposed for the next one. A stored pending revision (`planRevisionId` set, `state` `pending`)
 * awaits `重新确认计划`; a live entry (`planRevisionId` null) reports durable-state drift the store
 * detected on inspect and records at reconfirmation.
 *
 * A revision leaves `pending` in exactly three durable ways (Issue #281): `resolved` when a later
 * plan version links back to it, `superseded` when a later revision on the same prior version names
 * it in `supersedes`, and `reverted` when the revision is itself the way back — the plan returned to
 * the inputs its prior version froze, so that version stands and no new one is written. Nothing is
 * ever rewritten to say so: the later row carries the fact and every state here is derived from it.
 */
export interface BaselineAnalysisPlanRevisionProjection {
  planRevisionId: string | null;
  priorPlanVersionId: string;
  priorOrdinal: number;
  /** The version this revision yielded: the next one for `resolved`, the restored prior one for `reverted`, else `null`. */
  nextOrdinal: number | null;
  /** `plan-edit` for the editor's own 更新计划 (Issue #419). */
  trigger: 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit';
  /** The record time of a stored revision; `null` for a live entry derived on inspect. */
  detectedAt: string | null;
  changedFields: ReadonlyArray<string>;
  diff: ReadonlyArray<PlanRevisionDiffEntryProjection>;
  proposed: MaterialPlanInputsProjection;
  /** How this revision was settled, or that it still awaits the editor. */
  state: PlanRevisionState;
  /** The earlier pending revisions on the same prior version this one settled; empty for every other row. */
  supersedes: ReadonlyArray<string>;
  /** Settled in any of the three ways — `state !== 'pending'`; a settled revision asks the editor for nothing. */
  resolved: boolean;
  label: string;
}

/** How a Plan Revision stands: awaiting the editor, or settled by a later version, a later revision, or the way back. */
export type PlanRevisionState = 'pending' | 'resolved' | 'superseded' | 'reverted';

/** One durable `safe-retry` Plan Adaptation of a Run: written before the retry is dispatched, inside the unchanged envelope and binding. */
export interface BaselineAnalysisPlanAdaptationProjection {
  adaptationId: string;
  attemptId: string;
  runRecordId: string;
  taskIntentId: string;
  ordinal: number;
  unitOrdinal: number;
  adaptationClass: 'safe-retry' | 'contract-retry';
  attemptIndex: number;
  classifiedReason: string;
  failureCode: string;
  failureClass: string;
  failureStatus: number | null;
  requestDigest: string;
  firstPayloadDigest: string | null;
  /**
   * The digest of the unit message the first attempt submitted — the range's manuscript text as the model reads it —
   * which the retry must repeat byte for byte (Issue #286). `null` on an adaptation recorded before it was kept.
   */
  firstUnitMessageDigest: string | null;
  planEnvelopeDigest: string;
  bindingDigest: string;
  recordedAt: string;
  /**
   * The retry's own turn, found by the span that names this adaptation (Issue #286): the digest of the unit message it
   * submitted, and the gate's digest of its whole payload — which on a single-Session route also holds the turns before
   * it, so it differs from the first attempt's by construction. For older records, the one legacy adaptation and the
   * one legacy second attempt of the same unit and execution attempt may supply the payload digest without a unit-message
   * digest. `null` until the retry's turn is recorded or when no unambiguous association can be made.
   */
  retry: null | { spanOrdinal: number; unitMessageDigest: string | null; payloadDigest: string | null };
  /**
   * Whether the retry repeated the first attempt's unit message byte for byte, the one property `safe-retry` promises
   * (Issue #286): `byte-identical`; `differs`, a violation the label names; or `unrecorded` when either digest was not
   * kept — an adaptation recorded before them, or a retry not yet recorded.
   */
  repetition: SafeRetryRepetition;
  label: string;
}

/** How a safe retry's unit message compares with its first attempt's (Issue #286). */
export type SafeRetryRepetition = 'byte-identical' | 'differs' | 'unrecorded';

export interface BaselineAnalysisExecutionBindingProjection {
  compositionVersion?: 2 | 3 | 4;
  attemptId: string;
  bindingDigest: string;
  harnessSessionId: string;
  behaviorCompositionDigest: string;
  promptContractDigest: string;
  planEnvelopeDigest: string;
  runSourceScopeDigest: string;
  providerResolutionPlanDigest: string;
  coverageManifestDigest: string;
  route: ExecutionRouteId;
  model: string;
  /** The deterministic fixture pin; `null` on the developer-live route, which replays no fixture. */
  fixtureIdentity: string | null;
  fixtureSha256: string | null;
  nativeCarrierSha256: string;
  sidecarRevision: 2;
  boundAt: string;
}

export interface BaselineAnalysisResultSetRevisionProjection {
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  /** The producing Run; from Issue #48 also the bound plan version and the in-envelope adaptations the Run recorded. */
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  /** Model usage of this Run: counted for recomputed units only, every attempt included; reused units cost nothing. */
  usage: { inputTokens: number; outputTokens: number; requests: number };
  update: BaselineAnalysisRevisionUpdateProjection;
  /** Per-unit lineage in unit order; every entry of `units` carries the same fact. */
  lineage: ReadonlyArray<{ unitOrdinal: number } & AnalysisUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  /** Model-driven cross-unit findings beside the deterministic conflicts; empty when the reduction did not close. */
  crossUnitFindings: ReadonlyArray<AnalysisCrossUnitFindingProjection>;
  crossUnitReduction: AnalysisCrossUnitReductionProjection;
  /** The adversarial sample drawn over `crossUnitFindings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  sections: ReadonlyArray<AnalysisSectionProjection>;
  synthesis: AnalysisSynthesisProjection;
  units: ReadonlyArray<BaselineAnalysisUnitProjection>;
}

/** The latest Task's update facts when it is one of the three update modes. */
export interface BaselineAnalysisUpdateProjection {
  mode: BaselineAnalysisUpdateMode;
  modeLabel: string;
  meaning: string;
  predecessor: {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  };
  /** Whether the predecessor is still the latest revision of the Book's Result Set; authorization re-verifies it. */
  predecessorCurrent: boolean;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /** The recorded plan component once preparation froze the plan; `null` before that. */
  reusePlan: AnalysisReusePlanProjection | null;
  reusePlanDigest: string | null;
}

/** One selectable contiguous range for `重新分析所选范围`: a structural unit the current manifest derives. */
export interface BaselineAnalysisRangeOptionProjection {
  unitOrdinal: number;
  sectionOrdinal: number;
  headingText: string | null;
  subUnitIndex: number;
  subUnitCount: number;
  startPosition: number;
  endPosition: number;
  graphemes: number;
  label: string;
  /** The reuse-versus-recompute counts this choice would produce against the latest revision. */
  expected: AnalysisReusePlanCounts | null;
}

export interface BaselineAnalysisUpdateActionProjection {
  mode: BaselineAnalysisUpdateMode;
  label: string;
  goal: string;
  meaning: string;
  available: boolean;
  unavailableReason: string | null;
  /** The expected reuse-versus-recompute counts against the latest revision; `null` when the choice decides them. */
  expected: AnalysisReusePlanCounts | null;
  /**
   * 快速开始 of this mode (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019): offered only while the Book
   * has a 默认执行规则 for the mode in force that still matches the Book's facts. Absent for a kind whose
   * modes never take a rule.
   */
  quickStart?: BaselineAnalysisQuickStartProjection;
}

/**
 * Whether one mode of ②A can start at once under the Book's 默认执行规则 (Issue #421), and why not. One
 * activation prepares the Task exactly as 先看计划 does and then starts it exactly as 开始任务 would, its
 * authorization naming the rule version; whatever would make the start differ from the rule stops at the plan.
 */
export interface BaselineAnalysisQuickStartProjection {
  available: boolean;
  /** Why the quick start is not offered, in the editor's words; `null` while it is. */
  reason: string | null;
  /** The rule in force for this mode; `null` when none is. */
  rule: null | DefaultExecutionRuleReference;
}

/**
 * The Analysis Update Controls: present once a Result Set Revision exists. Everything an editor
 * needs before any Task is issued: the selected meaning, the exact target revision, the expected
 * reuse-versus-recompute counts derived over the current working manuscript, the Provider /
 * outbound-category / budget consequence, and that a successor revision will be appended.
 */
export interface BaselineAnalysisUpdateControlsProjection {
  target: {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
    freshness: 'current' | 'stale';
  };
  /** The current working manuscript the next Task Input checkpoint would pin, as the manifest would derive it. */
  working: { branchId: string; revisionLabel: string; journalSequence: number; workingDigest: string; totalBlocks: number; unitCount: number; sectionCount: number };
  /** True while a Task is authorized for dispatch, waiting in Connectivity Wait, admitted, or executing: no new update Task may be prepared. */
  blockedByActiveRun: boolean;
  /** Why, in the words of that Task's state — a Run waiting to start once online reads so (OFF-005, OFF-006); `null` when nothing blocks. */
  blockedReason: string | null;
  actions: {
    'sync-current': BaselineAnalysisUpdateActionProjection;
    'reanalyze-range': BaselineAnalysisUpdateActionProjection & { options: ReadonlyArray<BaselineAnalysisRangeOptionProjection> };
    'reanalyze-book': BaselineAnalysisUpdateActionProjection;
  };
  providerConsequence: string;
  successorBehavior: string;
}

export interface BaselineAnalysisHistoryEntryProjection {
  revisionId: string;
  ordinal: number;
  digest: string;
  createdAt: string;
  mode: BaselineAnalysisTaskMode;
  modeLabel: string;
  manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  coverageManifestDigest: string;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  counts: AnalysisReusePlanCounts;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  producingRun: { taskIntentId: string; runRecordId: string; attemptId: string; classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled' | null };
  /**
   * The Run Report of the Run that produced this revision (ADR 0066 §Run Report), read from that Run's
   * own Task Outcome, so 历史与更新 opens the report of every Run and not only the latest Task's. `null`
   * for a revision whose outcome was recorded before the report existed, or whose Run recorded none.
   */
  report: RunReportProjection | null;
  /** Why there is no report to read; `null` exactly when there is one. */
  reportAbsentReason: string | null;
  usage: { inputTokens: number; outputTokens: number; requests: number };
  unitsTotal: number;
  unitsClosed: number;
  gapCount: number;
  conflictCount: number;
  /** Only the latest revision can be current; older ones keep their original pin and are superseded. */
  current: boolean;
  freshness: 'current' | 'stale' | 'superseded';
  freshnessLabel: string;
}

/** The immutable chronological projection of one Result Set's revisions, in ordinal order. */
export interface BaselineAnalysisHistoryProjection {
  resultSetId: string;
  kind: typeof BASELINE_ANALYSIS_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<BaselineAnalysisHistoryEntryProjection>;
}

/**
 * What the Provider attempt of the unit in flight is doing, as an identity and nothing more
 * (V2-UX-LIVE-001, V2-UX-LIVE-006). `dispatched` is the attempt the execution owner has handed to the
 * harness, `awaiting-response` one whose request has entered the transport, and `retrying` the second
 * attempt of a `safe-retry` Plan Adaptation. No model content, prompt text, or payload rides here.
 */
export type RunAttemptState = 'dispatched' | 'awaiting-response' | 'retrying';

/** Bounded activity for an isolated unit; queued time is never reported as model response time. */
export interface AnalysisInFlightUnitProjection {
  unitOrdinal: number;
  attemptState: RunAttemptState;
  requestState: 'waiting-for-capacity' | 'admitted' | 'between-requests';
  admittedRequestStartedAt: string | null;
}

export interface BaselineAnalysisProjection {
  readonly historicalMarker?: string;
  bookId: string;
  kind: typeof BASELINE_ANALYSIS_KIND;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  state: 'available' | 'prepared' | 'authorized-blocked' | 'waiting' | 'admitted' | 'executing' | 'settled' | 'failed' | 'interrupted' | 'cancelled' | 'cancelling'
    | 'pausing' | 'paused' | 'resumable' | 'awaiting-clarification'
    // Authorized and waiting on the instance's concurrency governor for a place (Issue #49, S14; CONC-007).
    | 'queued';
  stateLabel: string;
  taskIntent: null | {
    taskIntentId: string;
    goal: BaselineAnalysisGoal;
    expectedOutcome: '稿件分析结果集修订版（基线稿件分析契约 v1）';
    createdAt: string;
    mode: BaselineAnalysisTaskMode;
    modeLabel: string;
    /** 改计划重做 (Issue #422, S76c; CONT-013): the cancelled Run this Task redoes, and its Task; `null` for any other Task. */
    redoOf: null | { runRecordId: string; taskIntentId: string };
    /**
     * The 后台分析登记 version whose dispatcher prepared this Task (Issue #95, S39); absent for every Task the editor asked for, so
     * a plan AI7 prepared is never shown as the editor's.
     */
    preparedByEnrollmentVersionId?: string;
  };
  checkpoint: null | TaskAuthorizationProjection['checkpoint'];
  manuscriptPin: null | {
    bookId: string;
    manuscriptId: string;
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
    sourceVersionId: string;
    sourceDigest: string;
  };
  artifactPin: null | TaskAuthorizationProjection['artifactPin'];
  runSourceScope: null | TaskAuthorizationProjection['runSourceScope'];
  coverageManifest: null | CoverageManifestProjection;
  providerResolutionPlan: null | {
    webToolsBackend?: FrozenWebToolsBackend; webToolsFallback?: FrozenWebToolsFallback;
    selectedPolicyIdentity?: SelectedPolicyIdentity;
    localFixtureProfile?: LocalFixtureProfile;
    searchCredentialReference?: string;
    role: 'Main Editorial Role';
    capabilities: readonly [];
    remoteBinding: {
      providerId: RemoteProviderId;
      modelId: 'deepseek-v4-pro' | 'deepseek-v4-flash' | 'deepseek-v4.1-flash' | 'deepseek-flash';
      adapterRevision: 1;
      configurationRevision: 1;
      approvedFallbackChain: readonly [];
      credentialSlot: CredentialSlotId;
      credentialReference: string;
      credentialReadiness: ModelCredentialOperationState;
      providerProcessing: ProviderProcessingPin;
    };
    executionRoute:
      | { kind: 'ai7-local-deterministic'; model: 'ai7-deterministic-fixture'; fixtureIdentity: string; fixtureSha256: string; fixtureLineage: ReadonlyArray<{ identity: string; sha256: string }> }
      /** The developer-live route replays no fixture: its identity is the endpoint it transmits to. */
      | { kind: 'opencode-go'; model: 'deepseek-v4-flash' | 'deepseek-v4.1-flash'; endpoint: string }
      /** The editor's DeepSeek 开放平台（官方） route under ordinary-production (Issue #811). */
      | { kind: 'deepseek-open-platform'; model: 'deepseek-flash'; endpoint: string }
      | { kind: 'none'; reason: 'j04-model-adapter-control-absent' };
    /** `unpublished-excerpts` under ordinary-production (Issue #811): the editor's own manuscript, never called public. */
    outboundDataCategory: 'public-or-synthetic' | 'unpublished-excerpts';
    runBudgetCeiling: RunBudgetCeilingState;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    reducerStages: readonly ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'];
    /** Present only on an edited plan (Issue #419). */
    editorEdits?: PlanEditsProjection;
    stopCondition: string;
  };
  planEnvelope: null | {
    compositionVersion?: 2 | 3 | 4;
    digest: string;
    dispatchAllowed: boolean;
    providerStatus: 'remote-denied-local-deterministic' | 'remote-denied-no-route' | 'remote-eligible-developer-live' | 'remote-eligible-ordinary-production';
    summary: string;
    /** Append-only sibling pin; the canonical envelope and its legacy digest stay unchanged. */
    procedure?: ProcedureDefinitionPin | null;
    promptContractDigest: string;
    behaviorCompositionDigest: string;
    /** The plan version this envelope freezes; `null` for an envelope recorded before plan versions existed. */
    planVersion: number | null;
    /** The Plan Boundary Split the envelope carries; `null` for an envelope recorded before it existed. */
    boundary: PlanBoundarySplitProjection | null;
  };
  /** The latest plan version of the latest Task with its frozen material inputs; `null` before preparation. */
  planVersion: null | (BaselineAnalysisPlanVersionProjection & { materialInputs: MaterialPlanInputsProjection });
  /** Every plan version of the latest Task in ordinal order. */
  planVersions: ReadonlyArray<BaselineAnalysisPlanVersionProjection>;
  /** Every recorded Plan Revision of the latest Task in detection order. */
  planRevisions: ReadonlyArray<BaselineAnalysisPlanRevisionProjection>;
  /** The Plan Revision `查看计划修订` shows while the current version is superseded; `null` when the plan is current or bound. */
  planRevision: null | BaselineAnalysisPlanRevisionProjection;
  authorization: null | {
    authorizationId: string;
    planEnvelopeDigest: string;
    /** The plan version the authorization bound, resolved from the envelope digest. */
    planVersionOrdinal: number | null;
    /**
     * `default-execution-rule` when 快速开始 started the Task under a 默认执行规则 (Issue #421); `background-analysis-enrollment`
     * when AI7 started it by itself under the Book's 后台分析登记 (Issue #95, S39).
     */
    startWhen?: 'now' | 'idle';
    origin: 'standard-direct' | 'default-execution-rule' | 'background-analysis-enrollment';
    /** The rule version the authorization names; `null` for a standard-direct start. */
    ruleVersionId: string | null;
    /** The enrollment version the authorization names; `null` unless the Enrollment started it. */
    enrollmentVersionId: string | null;
    authority: 'standard-direct-dispatch' | 'record-only-no-dispatch';
    authorizedAt: string;
  };
  run: null | {
    runRecordId: string;
    procedure?: ProcedureDefinitionPin | null;
    state: BaselineAnalysisRunState;
    stateLabel: string;
    recordedAt: string;
    transitions: ReadonlyArray<{ sequence: number; state: BaselineAnalysisRunState; recordedAt: string; detail: string | null }>;
    /** The Run's durable Plan Adaptations in record order; each sits in the timeline beside the transitions. */
    adaptations: ReadonlyArray<BaselineAnalysisPlanAdaptationProjection>;
    blockedReasons: ReadonlyArray<string> | null;
    /**
     * Why a Run blocked before dispatch never ran (Issue #536; V2-UX-OFF-008): `plan-moved` when Reconnect Preflight found
     * the plan its authorization bound had moved while it waited, `launch` when this launch cannot carry it. `null` for
     * a Run not blocked.
     */
    blockedBy: null | 'plan-moved' | 'launch';
    /**
     * The Run Liveness Signal's facts while the Run is `admitted` or `executing` (ADR 0071 §3): what
     * is in flight, since when, what the attempt is doing, and when the Run last changed state. Every
     * field is a count or an instant; elapsed time is the reader's to compute, never the product's to
     * estimate.
     */
    progress: {
      unitsTotal: number;
      unitsSettled: number;
      currentUnitOrdinal: number | null;
      /** The instant the current unit's attempt started; `null` between units. */
      currentUnitStartedAt: string | null;
      attemptState: RunAttemptState | null;
      /** Present on governed live execution; at most three entries in manifest order. */
      inFlightUnits?: ReadonlyArray<AnalysisInFlightUnitProjection>;
      /** Model turns this Run has completed, live, replayed, or deterministic alike. */
      completedAttempts: number;
      /** The longest step this Run has actually settled, which the stale case is measured against. */
      longestSettledUnitMs: number | null;
      /**
       * Which declared step is in flight: the unit loop, the cross-unit reduction, the sample, or
       * the Run Report's reflection turn — which runs last, after the revision is already persisted.
       */
      stage: 'units' | 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';
      /** The `recordedAt` of the Run Record's latest transition, composed by the store. */
      lastTransitionAt: string;
    } | null;
    attempt: null | {
      attemptId: string;
      ordinal: 1;
      startedAt: string;
      credentialReadinessCheck: { slot: CredentialSlotId; readiness: 'present' | 'missing'; valueReleased: false };
      executionBinding: BaselineAnalysisExecutionBindingProjection | null;
      /**
       * Each technical turn by reference. `unitMessageDigest` is the digest of the unit message the turn submitted (Issue
       * #286), `null` on a turn recorded before it was kept.
       */
      spans: ReadonlyArray<{
        ordinal: number;
        harnessSessionId: string;
        startSeq: number;
        endSeq: number;
        unitOrdinal: number | null;
        attemptIndex: number;
        payloadDigest: string | null;
        unitMessageDigest: string | null;
      }>;
    };
  };
  /** The latest revision of the Book's Result Set; the current truth candidate, never an older one. */
  resultSetRevision: null | BaselineAnalysisResultSetRevisionProjection;
  taskOutcome: null | {
    outcomeId: string;
    classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled';
    label: string;
    recordedAt: string;
    resultSetRevisionId: string | null;
    safeNextAction: string;
    /**
     * Why the Run stopped before it finished, when a limit stopped it (Issue #51, S16a; V2-UX-MODEL-016): the explicit
     * Run Budget Ceiling — the ceiling, what the Run had used, and how many of the ranges it submits it read. The
     * outcome stays `interrupted`, with its partial revision; `null` for every other outcome.
     */
    stop: null | { reason: 'run-budget-ceiling-reached'; maxTotalTokens: number; usedTokens: number; unitsSettled: number; unitsTotal: number };
    /**
     * The Run Report of the Run this outcome settled (ADR 0066 §Run Report): an immutable record
     * inside the outcome, read back with the digest of its own canonical JSON. `null` for a Task
     * Outcome recorded before the report existed, which is history and is never rewritten.
     */
    report: RunReportProjection | null;
    /** Why there is no report to read; `null` exactly when there is one. */
    reportAbsentReason: string | null;
  };
  /** The latest Task's update facts; `null` while the latest Task is the first baseline. */
  update: null | BaselineAnalysisUpdateProjection;
  /** The Analysis Update Controls; `null` until the Book holds a Result Set Revision. */
  updateControls: null | BaselineAnalysisUpdateControlsProjection;
  /** The Analysis Result Revision History; `null` until the Book holds a Result Set Revision. */
  history: null | BaselineAnalysisHistoryProjection;
  /** One exact revision opened read-only by `revisionId`; `null` when inspecting the latest. */
  inspectedRevision: null | { revision: BaselineAnalysisResultSetRevisionProjection; current: boolean; readOnly: true };
  /** `canAuthorize` is false while a Plan Revision is pending; `canReconfirmPlan` is true exactly then. */
  actions: { canPrepare: boolean; canAuthorize: boolean; canReconfirmPlan: boolean };
  namedNonEffects: ReadonlyArray<string>;
}
