import type { CompositionOptions } from '../harness/primary-agent-harness.js';
import type {
  ProcedureDefinitionPin,
  FrozenWebToolsBackend,
  FrozenWebToolsFallback,
  LocalFixtureProfile,
  SelectedPolicyIdentity,
  AnalysisAssuranceSampleDispositionProjection,
  AnalysisGoal,
  AnalysisKindId,
  AnalysisProjection,
  AnalysisTaskMode,
  FactualReviewHistoryProjection,
  FactualReviewResultSetRevisionProjection,
  AnalysisReducerStageProjection,
  AnalysisReusePlanProjection,
  BaselineAnalysisHistoryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisSelectedRange,
  BaselineAnalysisUpdateControlsProjection,
  BaselineAnalysisUpdateProjection,
  BaselineAnalysisUpdateRequest,
  CoverageManifestProjection,
  DeveloperLiveCeiling,
  LaunchPolicyProjection,
  CredentialSlotId,
  ExecutionRouteId,
  ResultSetPolicyPin,
  ReviewCategoryHistoryProjection,
  ReviewCategoryResultSetRevisionProjection,
  ReviewCategoryUnitLineage,
  ReviewCategoryUpdateControlsProjection,
  ReviewCategoryUpdateProjection,
  ReviewScopePlanProjection,
  RunAttemptState,
  AnalysisInFlightUnitProjection,
  RunBudgetCeilingState,
} from '../../shared/protocol.js';
import type { LocalFixtureRuntimeContext } from '../provider/model-fixture.js';
import type { SQLOutputValue } from 'node:sqlite';
import type { PlanEdits } from './plan-edits.js';
import type { ChainRevision } from './unread-changes.js';
import { TASK_INPUT_CHECKPOINT_PURPOSE } from './identity.js';
import type { OrdinaryProductionAllowedBinding } from '../launch-policy.js';
import type { AnalysisReductionResult } from './kind-definition.js';
import type { CrossUnitOutcome } from './reducers.js';
import type { AssuranceSampleDraw } from './assurance-sampling-contract.js';
import { CARRIED_STAGES, MODEL_SERVICE_SETUP_REQUIRED } from './run-state.js';

export type SqlRow = Record<string, SQLOutputValue>;

export type ChainRevisionRead = { readonly revision: ChainRevision; readonly predecessorRevisionId: string | null } | 'unreadable';

/** One unit a Run settled, as its continuation checkpoint keeps it: the revision's unit record, and what was observed. */
export interface UnitCheckpoint {
  readonly attemptId: string;
  readonly unit: UnitResultRecord;
  readonly observation: { unitOrdinal: number; attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null;
  /** The kind's typed unit result, read back the way a predecessor's is; `null` for a gap. */
  readonly result: unknown;
}

/**
 * One reading range whose sent request's result could not be known (Issue #51, S16c): a kept checkpoint whose gap is
 * `outcome-unknown`, with how often its request was sent and the gap's own words — the technical layer's, never the bar's.
 */
export interface UnconfirmedUnitRecord {
  readonly unitOrdinal: number;
  readonly attempts: number;
  readonly reason: string;
}

/** A step after the ranges whose sent request's result cannot be known (Issue #757): the reduction, a sample, the reflection. */
export type UnconfirmedStage = 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';

/**
 * One sent request of a Book's Runs of one kind whose result cannot be known and that no later Run of the kind has read since
 * (Issue #757; CTRL-007, CONT-011): a range — named by the content key the reuse plans match by, and by its ordinal in the
 * latest revision that holds it — or a step of the latest Run that reached its Task Outcome. `key` names it across launches:
 * the kind, the Run that sent the request, and the range's content key or the step, so 人工结果确认 settles exactly it.
 */
export interface UnconfirmedOutcomeRecord {
  readonly key: string;
  readonly kind: string;
  /** The Run that sent the request — for a range carried forward, the Run that first sent it, never the one that carried it. */
  readonly runRecordId: string;
  readonly taskIntentId: string;
  /** That Run's Task Outcome; `null` while it has none. */
  readonly classification: string | null;
  /** When that Run's outcome was recorded, or its revision when it has none. */
  readonly recordedAt: string;
  readonly unitOrdinal: number | null;
  /** The manuscript revision the latest revision holding the range read — whose text `unitOrdinal` counts in; `null` for a step. */
  readonly heldAtRevisionId: string | null;
  readonly contentKey: string | null;
  readonly rereadFailed?: boolean;
  readonly stage: UnconfirmedStage | null;
}

/** The units a Task's reuse or scope plan names, as `resendUnitsByContent` reads them: which it reads again, by content key. */
export interface ResendPlan {
  readonly units: ReadonlyArray<{ readonly unitOrdinal: number; readonly contentKey: string; readonly disposition: string }>;
}

/** Why an interrupted Run stopped, when a limit stopped it (Issue #51, S16a): the ceiling, what it used, and what it read. */
export interface RunStop {
  readonly reason: 'run-budget-ceiling-reached';
  readonly maxTotalTokens: number;
  readonly usedTokens: number;
  readonly unitsSettled: number;
  readonly unitsTotal: number;
}

export interface BaselineAnalysisRouteFacts {
  readonly reviewContractVersion?: 1 | 2;
  readonly fixtureIdentity: string;
  readonly fixtureSha256: string;
  readonly fixtureLineage: ReadonlyArray<{ identity: string; sha256: string }>;
}

export interface ManuscriptCheckpointBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  createdForDirtyJournal: boolean;
}

// The purposes the bounded manuscript's checkpoint names; this owner persists only its own (Issue #413 adds the export's).
export type CheckpointPurpose = typeof TASK_INPUT_CHECKPOINT_PURPOSE | 'Reimport Safety / 重新导入安全固定点' | 'Export Input / 导出输入' | 'Document Version / 文档版本';

export interface CheckpointOwner {
  createManuscriptCheckpointWork(
    manuscriptId: string,
    branchId: string,
    purpose: typeof TASK_INPUT_CHECKPOINT_PURPOSE,
    options?: { preemptible?: boolean },
  ): { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  advanceManuscriptCheckpointWork(workId: string):
    { done: boolean; completed: number; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  finalizeManuscriptCheckpointWork(
    workId: string,
    persist: (checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding;
  cancelManuscriptCheckpointWork(workId: string): boolean;
}

export interface PreparationWork {
  workId: string;
  taskIntentId: string;
  bookId: string;
  checkpointWorkId: string;
  launchPolicy: LaunchPolicyProjection;
  total: number;
  /** The 后台分析登记 dispatcher's (Issue #95, S39): any preparation the editor starts on the Book stops it first. */
  background: boolean;
  /** The dispatcher's Task Intent, not yet written: it is written only as the plan freezes (#713 re-review, P2-1). */
  pendingIntent: PendingIntent | null;
  intentDraft?: { promoted(taskIntentId: string): void };
}

/** A Task Intent as `prepare` decided it, before it is written. */
export interface PendingIntent {
  readonly procedure?: ProcedureDefinitionPin;
  readonly factualDecision?: import('../factual-verification.js').FactualRecheckSelection;
  readonly taskIntentId: string;
  readonly bookId: string;
  readonly goal: string;
  readonly mode: AnalysisTaskMode;
  readonly redoOf: string | null;
  readonly preparedByEnrollmentVersionId: string | null;
  /** The Book's share of the Enrollment's ceiling the dispatcher's Task is held to (Issue #864); `null` for the editor's. */
  readonly backgroundRunBudgetCeiling: BackgroundRunBudgetCeiling | null;
  readonly predecessor: { readonly revisionId: string; readonly digest: string } | null;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
  /** The Task Intent Draft version 准备计划 promoted into this Task (Issue #423, slice 7a); `null` for every other Task. */
  readonly intentDraftVersionId: string | null;
  readonly intentDraftParagraphs: number | null;
}

/** The tokens ceiling a 后台分析登记 holds each Run it starts to: the Book's share of the Enrollment's ceiling (Issue #864). */
export interface BackgroundRunBudgetCeiling {
  readonly kind: 'tokens';
  readonly maxTotalTokens: number;
}

/** The facts one `analysis_task_intents` row carries, with the canonical record they were read from. */
export interface IntentFacts {
  readonly taskIntentId: string;
  readonly bookId: string;
  readonly mode: AnalysisTaskMode;
  readonly goal: string;
  readonly createdAt: string;
  readonly predecessorRevisionId: string | null;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
  /** The immutable Task Intent record; the expected outcome class the Task froze is read from here, never from the kind's constant. */
  readonly record: Readonly<Record<string, unknown>>;
  readonly expectedOutcome: string;
  /** 改计划重做 (Issue #422, S76c; CONT-013): the cancelled Run this Task redoes; `null` for any other Task. */
  readonly redoOfRunRecordId: string | null;
  /** The 后台分析登记 version whose dispatcher created this Task Intent (Issue #95, S39); `null` for every Task the editor asked for. */
  readonly preparedByEnrollmentVersionId: string | null;
  /** The ceiling that dispatcher holds the Task's Run to (Issue #864); `null` for the editor's Tasks and for one made before #864. */
  readonly backgroundRunBudgetCeiling: BackgroundRunBudgetCeiling | null;
  /** The Task Intent Draft version this Task was promoted from (Issue #423, slice 7a): its goal is that draft's sentence. */
  readonly intentDraftVersionId: string | null;
  readonly intentDraftParagraphs: number | null;
}

/**
 * The kind-generic shape the store builds before it is read as one kind's projection. Every member
 * either is identical for both kinds or is widened to what the definition supplies; nothing here is
 * a member neither kind declares.
 */
export type AnalysisProjectionShape = Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> & {
  kind: AnalysisKindId;
  contractVersion: string;
  taskIntent: null | {
    taskIntentId: string;
    goal: string;
    expectedOutcome: string;
    createdAt: string;
    mode: AnalysisTaskMode;
    modeLabel: string;
    /** The baseline kind's alone (Issue #422, S76c). */
    redoOf?: null | { runRecordId: string; taskIntentId: string };
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    reducerStages: ReadonlyArray<AnalysisReducerStageProjection['stage']>;
    stopCondition: string;
  };
  resultSetRevision: null | AnyResultSetRevisionProjection;
  update: null | BaselineAnalysisUpdateProjection | ReviewCategoryUpdateProjection;
  updateControls: null | BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection;
  history: null | BaselineAnalysisHistoryProjection | FactualReviewHistoryProjection | ReviewCategoryHistoryProjection;
  inspectedRevision: null | { revision: AnyResultSetRevisionProjection; current: boolean; readOnly: true };
};

type AnyResultSetRevisionProjection =
  | BaselineAnalysisResultSetRevisionProjection
  | FactualReviewResultSetRevisionProjection
  | ReviewCategoryResultSetRevisionProjection;

/**
 * The plan a Task that does not read the whole manuscript afresh freezes: the baseline kind's reuse
 * plan, or the scope plan of a kind that leaves out-of-scope units unreviewed (Issue #417). Both are
 * the `reuse-plan` component, and both are re-derived and compared byte for byte before execution.
 */
export type AnalysisPlanRecord = AnalysisReusePlanProjection | ReviewScopePlanProjection;

/** What a caller asks the ledger to prepare beside the kind's whole first Task: a mode, and the range a range mode needs. */
export interface AnalysisModeRequest {
  readonly mode: AnalysisTaskMode;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
}

/**
 * The progress of one preparation. The projection is the kind's own once a caller that knows which
 * ledger it asked narrows it; the ledger itself returns the discriminated union.
 */
export type AnalysisPreparationResult<TProjection = AnalysisProjection> = {
  done: boolean;
  workId: string | null;
  completed: number;
  total: number;
  projection: TProjection | null;
};

export type BaselineAnalysisPreparationResult = AnalysisPreparationResult;

export type BaselineAnalysisPrepareInput =
  /**
   * `update` is `null` for the kind's whole first Task and otherwise names the mode: one of the kind's
   * update modes, or — for a kind that declares one — its range-bound first mode, which starts the
   * Result Set over one selected range (Issue #417).
   */
  | {
    phase: 'start';
    factualDecision?: import('../factual-verification.js').FactualRecheckSelection;
    bookId: string;
    goal: AnalysisGoal;
    update: BaselineAnalysisUpdateRequest | AnalysisModeRequest | null;
    reconfirm: boolean;
    launchPolicy: LaunchPolicyProjection;
    /** 改计划重做 (Issue #422, S76c): the cancelled Run of the Book's latest Task this new Task redoes. */
    redoOf?: string | null;
    /**
     * The 后台分析登记 dispatcher's preparation (Issue #95, S39; the Commander's ruling on #713, P1-2): always a new Task Intent of
     * its own, marked with the enrollment version, never one the editor asked for; refused while any preparation of the Book is
     * under way or the editor's own Task is prepared and not started; its checkpoint gives way to any other the Book asks for.
     */
    background?: { enrollmentVersionId: string; runBudgetCeiling: BackgroundRunBudgetCeiling };
    /**
     * A new Task Intent even where the latest prepared one would be revised in place (Issue #428): 写作任务's preparation when
     * the 资料库 builds it pins differ from the ones the prepared Task froze. Its contract holds words only, so the same words
     * at another build are the same contract, and only a Task of its own can freeze the new pins.
     */
    newTask?: boolean;
    /**
     * 准备计划 on a Task Intent Draft (Issue #423, slice 7a; decision 1): always a new Task Intent, whose goal is the draft's own
     * bounded sentence — `goal` — and whose record names the draft version; `promoted` records the promotion in the very write
     * that makes the Task Intent, so a refused promotion leaves no Task behind. Never with a redo, a reconfirmation or a dispatcher.
     */
    intentDraft?: { versionId: string; paragraphs?: number; promoted(taskIntentId: string): void };
  }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

/**
 * What the execution owner observes of the Run in flight: Measured Run Progress and the four
 * liveness facts it holds itself (ADR 0071 §3). The fifth, `lastTransitionAt`, belongs to the ledger's
 * own transitions and is composed by `#runProjection`, which already reads them; the owner never
 * re-reads the record it is writing to. Identities, counts, and instants only — V2-UX-LIVE-006 keeps
 * model content, prompt text, and payloads out of this shape entirely.
 */
export interface RunProgress {
  readonly unitsTotal: number;
  readonly unitsSettled: number;
  readonly currentUnitOrdinal: number | null;
  readonly currentUnitStartedAt: string | null;
  readonly attemptState: RunAttemptState | null;
  readonly inFlightUnits?: ReadonlyArray<AnalysisInFlightUnitProjection>;
  readonly completedAttempts: number;
  readonly longestSettledUnitMs: number | null;
  /** Which declared step of the Run is in flight: the unit loop, the cross-unit reduction, or the sample. */
  readonly stage: RunProgressStage;
}

/** The Run's declared steps, in the order the execution owner performs them. */
export type RunProgressStage = 'units' | 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';

export type ProgressReader = (runRecordId: string) => RunProgress | null;

/**
 * The plan facts of a frozen Task that carries a plan, re-derived and verified before execution. The
 * predecessor is `null` exactly for a range-bound first Task, which has a plan — the units in its
 * range, and every other unit left unreviewed — and nothing to reuse from.
 */
export interface ExecutionUpdateFacts {
  readonly mode: AnalysisTaskMode;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
  readonly predecessor: null | { revisionId: string; ordinal: number; digest: string; coverageManifestDigest: string; manifest: CoverageManifestProjection };
  readonly reusePlan: AnalysisPlanRecord;
  readonly reusePlanDigest: string;
}

/** One `analysis_plan_versions` row: an immutable plan version of a Task Intent and the envelope digest it froze. */
export interface PlanVersionFacts {
  readonly planVersionId: string;
  readonly taskIntentId: string;
  readonly ordinal: number;
  readonly planRevisionId: string | null;
  readonly planEnvelopeDigest: string;
  readonly createdAt: string;
}

/** The input of one `safe-retry` Plan Adaptation the execution owner records before it dispatches the retry. */
export interface PlanAdaptationInput {
  readonly adaptationClass?: 'safe-retry' | 'contract-retry';
  readonly attemptIndex?: 2 | 3;
  readonly attemptId: string;
  readonly runRecordId: string;
  readonly taskIntentId: string;
  readonly ordinal: number;
  readonly unitOrdinal: number;
  readonly classifiedReason: string;
  readonly failureCode: string;
  readonly failureClass: string;
  readonly failureStatus: number | null;
  readonly requestDigest: string;
  readonly firstPayloadDigest: string | null;
  /** The digest of the unit message the first attempt submitted (Issue #286); `null` when the request it answers kept none. */
  readonly firstUnitMessageDigest: string | null;
  readonly planEnvelopeDigest: string;
  readonly bindingDigest: string;
}

/** Everything the execution owner needs from the frozen plan before the first model call. */
export interface ExecutionPlanFacts {
  readonly factualDecision?: import('../factual-verification.js').FactualRecheckSelection;
  readonly retainedPolicyPin?: ResultSetPolicyPin;
  readonly retainedPolicy?: LaunchPolicyProjection;
  readonly selectedPolicyIdentity?: SelectedPolicyIdentity;
  readonly localFixtureProfile?: LocalFixtureProfile;
  readonly localFixtureRuntime?: LocalFixtureRuntimeContext;
  readonly webToolsBackend?: FrozenWebToolsBackend; readonly webToolsFallback?: FrozenWebToolsFallback;
  readonly searchCredentialReference?: string;
  readonly bookId: string;
  readonly taskIntentId: string;
  readonly runRecordId: string;
  /** The exact plan version the Run Authorization bound. */
  readonly planVersionId: string;
  readonly planVersionOrdinal: number;
  /**
   * Who started the Run, as its Run Authorization records it (Issue #864): a Run a 后台分析登记 started is admitted live only
   * under the selected policy's enrolled-background rule.
   */
  readonly startWhen?: 'now' | 'idle';
  readonly origin: 'standard-direct' | 'default-execution-rule' | 'background-analysis-enrollment';
  readonly checkpoint: ManuscriptCheckpointBinding;
  readonly manifest: CoverageManifestProjection;
  readonly manifestDigest: string;
  readonly planEnvelopeDigest: string;
  readonly runSourceScopeDigest: string;
  readonly providerResolutionPlanDigest: string;
  readonly credentialReference: string;
  /** The source digest the frozen manuscript pin carries; the execution owner re-checks it before any dispatch. */
  readonly sourceDigest: string;
  /** The bound deterministic fixture; `null` under developer-live, whose route replays no fixture. */
  readonly route: BaselineAnalysisRouteFacts | null;
  /**
   * The remote binding the plan froze under ordinary-production (Issue #811): the route, model, endpoint and credential slot
   * the editor had configured when the plan froze, which the Run keeps whatever route is configured later. `null` under every
   * other scope, whose route is the launch's own.
   */
  readonly productionBinding: ProductionPlanBinding | null;
  readonly artifactPin: { nativeCarrierSha256: string; sidecarRevision: 2; sidecarSha256: string };
  readonly promptContractDigest: string;
  readonly behaviorCompositionDigest: string;
  readonly compositionOptions?: CompositionOptions;
  /** The assurance sampling contract the plan froze ({@link frozenAssurancePromptContractDigest}). */
  readonly assurancePromptContractDigest: string;
  /** The ceiling the frozen Provider Resolution Plan carries, already resolved against the frozen unit count. */
  readonly runBudgetCeiling: RunBudgetCeilingState;
  /** `null` for the first baseline; the verified reuse plan for an update Task. */
  readonly update: ExecutionUpdateFacts | null;
  /** What the bound plan leaves out at the editor's word (Issue #419): the Run honours each. */
  readonly editorEdits: PlanEdits;
}

/** One frozen ordinary-production binding: one of the two allowed routes, exactly (Issue #811). */
export interface ProductionPlanBinding {
  readonly reasoningEffort?: string;
  readonly route: OrdinaryProductionAllowedBinding['route'];
  readonly model: OrdinaryProductionAllowedBinding['model'];
  readonly endpoint: string;
  readonly credentialSlot: OrdinaryProductionAllowedBinding['credentialSlot'];
}

export interface ExecutionBindingRecord {
  readonly compositionVersion?: 2 | 3 | 4;
  readonly attemptId: string;
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly bookId: string;
  readonly planEnvelopeDigest: string;
  /** The plan version the envelope digest identifies; a Plan Adaptation never changes it. */
  readonly planVersion: number;
  readonly runSourceScopeDigest: string;
  readonly providerResolutionPlanDigest: string;
  readonly coverageManifestDigest: string;
  readonly manuscriptPin: { revisionId: string; revisionDigest: string };
  readonly nativeArtifact: { identity: '@ai7/editorial-workspace-profile'; version: '1.0.0'; nativeCarrierSha256: string; sidecarRevision: 2; sidecarSha256: string };
  readonly behaviorCompositionDigest: string;
  readonly promptContractDigest: string;
  /** The exact contract version of the analysis kind this attempt executes. */
  readonly contractVersion: string;
  /** The lineage root Session; under developer-live each unit opens its own Session beneath it. */
  readonly harnessSessionId: string;
  readonly route: ExecutionRouteId;
  readonly model: string;
  /** The deterministic fixture pin; `null` on the live route, which replays no fixture. */
  readonly adapterPin: { fixtureIdentity: string; fixtureSha256: string } | null;
  readonly credentialSlot: { modelRole: 'Main Editorial Role'; slot: CredentialSlotId; credentialReference: string };
  /** `unpublished-excerpts` under ordinary-production (Issue #811): the editor's own words, never called public. */
  readonly outboundDataCategory: 'public-or-synthetic' | 'unpublished-excerpts';
  readonly policyPin: ResultSetPolicyPin;
  readonly runBudgetCeiling: RunBudgetCeilingState;
  readonly dispatchAttribution: 'Dispatch';
  readonly boundAt: string;
  /**
   * The mode and reuse-plan digest an attempt with a plan executes; absent for a whole first Task. The
   * predecessor is `null` only for a range-bound first Task (Issue #417), which no baseline attempt is.
   */
  readonly update?: { mode: AnalysisTaskMode; predecessorRevisionId: string | null; reusePlanDigest: string };
}

export interface UnitResultRecord {
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  /** `unreviewed` only under a kind that leaves out-of-scope units unreviewed; the two other kinds never write it. */
  readonly lineage: ReviewCategoryUnitLineage;
  readonly closed:
    | { state: 'closed'; responseDigest: string; usage: { inputTokens: number; outputTokens: number } | null; result: unknown }
    | { state: 'gap'; gap: BaselineAnalysisProjection['resultSetRevision'] extends infer R ? (R extends { gaps: ReadonlyArray<infer G> } ? G : never) : never };
}

/** A closed predecessor unit result, ready to be copied by lineage into a successor revision. */
export interface PredecessorUnitResult {
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  readonly responseDigest: string;
  readonly usage: { inputTokens: number; outputTokens: number } | null;
  /** The kind's own typed unit result, read back by the kind's definition; the ledger never looks inside it. */
  readonly result: unknown;
}

export interface RevisionPersistInput {
  readonly facts: ExecutionPlanFacts;
  readonly attemptId: string;
  readonly bindingDigest: string;
  readonly harnessSessionId: string;
  readonly reduction: AnalysisReductionResult;
  readonly units: ReadonlyArray<UnitResultRecord>;
  readonly usage: { inputTokens: number; outputTokens: number; requests: number };
  /** The units the Run adapted in-envelope (one safe retry each), disclosed in the revision's provenance. */
  readonly adaptedUnitOrdinals: ReadonlyArray<number>;
}

/**
 * How a Run is authorized: from its plan, by 快速开始 under one version of a 默认执行规则 (Issue #421), or by AI7 itself under one
 * version of the Book's 后台分析登记 (Issue #95, S39).
 */
export type AnalysisAuthorizationOrigin =
  | { readonly kind: 'standard-direct' }
  | { readonly kind: 'default-execution-rule'; readonly ruleVersionId: string }
  | { readonly kind: 'background-analysis-enrollment'; readonly enrollmentVersionId: string };

/**
 * The launch facts a Run's plan must freeze, handed to the ledger once by the service entry. Under
 * `development-ci` the plan stays exactly what it was: the denied production binding, the local
 * deterministic route when one is bound, and an `unset` ceiling. Under `developer-live` the plan
 * freezes the selected developer-live binding — the `opencode-go` route, its bare model id, its fixed development
 * Credential Reference, and the required token ceiling, explicit or the policy's per-frozen-unit
 * default — because every one of those is a material plan input that must be pinned before
 * authorization, not chosen at dispatch.
 */
export interface LaunchBinding {
  /** Current editor-confirmed rules, frozen by new plans; never a startup scan or a second ledger. */
  readonly editorialMemory?: (bookId: string, taskKind: string) => import('../learning/editorial-memory.js').EditorialMemorySnapshot | null;
  readonly retainedPolicyFor?: (pin: ResultSetPolicyPin, binding: import('../launch-policy.js').ConfiguredProviderBinding) => LaunchPolicyProjection | null;
  readonly localFixtureRuntime?: () => LocalFixtureRuntimeContext | null;
  /** Verified runtime policy for review admission; never persisted as a new record or IPC member. */
  readonly policy?: LaunchPolicyProjection;
  readonly operationalScope: 'development-ci' | 'developer-live' | 'ordinary-production';
  /**
   * Under `ordinary-production` (Issue #811) the editor's configured binding — `null` while none is configured, when every
   * model-calling action says 模型服务需设置 — read when each plan freezes, so a route switch reaches the next Task only.
   */
  readonly live: DeveloperLiveLaunchBinding | OrdinaryProductionLaunchBinding | null;
}

/** The developer-live binding: the one Go route, its fixed development Credential Reference, and the launch's ceiling. */
export interface DeveloperLiveLaunchBinding {
  readonly reasoningEffort?: string;
  readonly scope?: undefined;
  readonly route: 'opencode-go';
  readonly model: 'deepseek-v4.1-flash';
  readonly endpoint: string;
  readonly credentialSlot: 'opencode-go';
  readonly credentialReference: string;
  readonly runBudgetCeiling: DeveloperLiveCeiling;
}

/**
 * The editor's configured binding under ordinary-production (Issue #811): one of the two allowed routes, the Credential
 * Reference its connection holds, and no launch ceiling — the Run's ceiling is the editor's own, set in the plan (S16a).
 */
export interface OrdinaryProductionLaunchBinding extends ProductionPlanBinding {
  readonly scope: 'ordinary-production';
  readonly credentialReference: string;
  readonly runBudgetCeiling: 'unset';
}

export type LiveReading = LaunchBinding['live'] | typeof MODEL_SERVICE_SETUP_REQUIRED;

export type CarriedStages = Record<(typeof CARRIED_STAGES)[number], { requests: number; inputTokens: number; outputTokens: number }>;

/** Private continuation evidence, nested in existing Run states; never a public protocol or a new binding. */
export interface StageContinuation {
  readonly runRecordId: string;
  readonly attemptId: string;
  readonly bindingDigest: string;
  readonly manifestDigest: string;
  readonly promptContractDigest: string;
  reduction?: { inputDigest: string; contractDigest: string; requestDigest: string | null; outcome: CrossUnitOutcome };
  sampling?: {
    inputDigest: string; contractDigest: string; draw: AssuranceSampleDraw;
    nextTurn: number; ended: boolean;
    turns: Array<{ requestDigest: string; unitOrdinal: number; usage: { inputTokens: number; outputTokens: number } | null; state: 'closed' | 'gap' | 'outcome-unknown' }>;
    dispositions: AnalysisAssuranceSampleDispositionProjection[]; gapReasons: string[];
    parseFailures?: import('../../shared/protocol.js').AnalysisAssuranceSampleProjection['parseFailures'];
    salvaged?: import('../../shared/protocol.js').SalvagedModelResult['salvaged'];
    sampled: { inputTokens: number; outputTokens: number; turnsWithUsage: number };
  };
}

/** Payload-free identities for physical model admissions; tool dispatch tokens never cross this boundary. */
export interface AnalysisRequestIdentity {
  readonly requestId: string;
  readonly producerId: string;
  readonly requestOrdinal: number;
  readonly sessionId: string;
  readonly unitOrdinal: number | null;
  readonly stage: RunProgressStage | 'web-verification';
  readonly attemptIndex: number;
  readonly adaptationId: string | null;
  readonly payloadDigest: string;
  readonly messageDigest: string;
  readonly requestDigest: string;
  readonly inputDigest: string;
  readonly contractDigest: string;
}

export interface RequestAdmissionPins {
  readonly runRecordId: string;
  readonly attemptId: string;
  readonly bindingDigest: string;
  readonly planEnvelopeDigest: string;
  readonly manifestDigest: string;
  readonly compositionDigest: string;
  readonly promptContractDigest: string;
  readonly policyVersion: string;
  readonly policyRuleId: string;
}

export type RequestAdmissionEvent =
  | { readonly kind: 'execution'; readonly width: 1 | 3; readonly limits: { readonly requests: 4; readonly units: 3; readonly backgroundRequests: 1 } }
  | { readonly kind: 'admit'; readonly request: AnalysisRequestIdentity }
  | { readonly kind: 'resolve'; readonly requests: readonly string[]; readonly evidence: {
      readonly kind: 'no-send' | 'unit-checkpoint' | 'clarification-checkpoint' | 'stage-checkpoint' | 'reflection-outcome' | 'refused-turn' | 'unavailable' | 'factual-checkpoint';
      readonly digest: string;
    } };

export interface RequestAdmissionData extends RequestAdmissionPins {
  readonly sequence: number;
  readonly predecessorDigest: string | null;
  readonly event: RequestAdmissionEvent;
}

export interface RequestAdmissionReading {
  readonly pins: RequestAdmissionPins;
  readonly width: 1 | 3;
  readonly sequence: number;
  readonly digest: string;
  readonly open: ReadonlyMap<string, AnalysisRequestIdentity>;
  readonly unavailable: ReadonlyArray<AnalysisRequestIdentity>;
  readonly notSent: ReadonlyArray<AnalysisRequestIdentity>;
}
