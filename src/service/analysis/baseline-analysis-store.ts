import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  BASELINE_ANALYSIS_KIND,
  type AnalysisGoal,
  type AnalysisKindId,
  type AnalysisProjection,
  type AnalysisTaskMode,
  type BaselineAnalysisTaskMode,
  type FactualReviewProjection,
  type FactualReviewHistoryProjection,
  type FactualReviewResultSetRevisionProjection,
  type AnalysisFreshnessAxis,
  type AnalysisReducerStageProjection,
  type AnalysisReusePlanCounts,
  type AnalysisReusePlanProjection,
  type AnalysisUnitLineage,
  type BaselineAnalysisExecutionBindingProjection,
  type BaselineAnalysisHistoryEntryProjection,
  type BaselineAnalysisHistoryProjection,
  type BaselineAnalysisPlanAdaptationProjection,
  type BaselineAnalysisPlanRevisionProjection,
  type BaselineAnalysisPlanVersionProjection,
  type BaselineAnalysisProjection,
  type BaselineAnalysisRangeOptionProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type BaselineAnalysisRevisionUpdateProjection,
  type BaselineAnalysisRunState,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisUnitProjection,
  type BaselineAnalysisUpdateControlsProjection,
  type BaselineAnalysisUpdateMode,
  type BaselineAnalysisUpdateProjection,
  type BaselineAnalysisUpdateRequest,
  type CoverageManifestProjection,
  type DeveloperLiveCeiling,
  type LaunchPolicyProjection,
  type MaterialPlanInputsProjection,
  type ModelCredentialOperationState,
  type PlanBoundarySplitProjection,
  type PlanRevisionDiffEntryProjection,
  type PlanRevisionState,
  type CredentialSlotId,
  type ExecutionRouteId,
  type ResultSetPolicyPin,
  type ReviewCategoryHistoryProjection,
  type ReviewCategoryResultSetRevisionProjection,
  type ReviewCategoryUnitLineage,
  type ReviewCategoryUpdateControlsProjection,
  type ReviewCategoryUpdateProjection,
  type ReviewScopePlanCounts,
  type ReviewScopePlanProjection,
  type RunAttemptState,
  type RunBudgetCeilingState,
} from '../../shared/protocol.js';
import {
  PLAN_REVISION_REQUIRED_REASON,
  buildPlanAdaptationRecord,
  diffMaterialPlanInputs,
  materialPlanInputsOfComponents,
  planAdaptationLabel,
  planBoundarySplit,
  planRevisionLabel,
  reusePlanCountsDiffEntry,
  sameMaterialPlanInputs,
} from './plan-boundary.js';
import {
  NO_PLAN_EDITS,
  PLAN_CEILING_LAUNCH_REASON,
  canonicalPlanEdits,
  planEditCeiling,
  planEditDiff,
  planEditsAreEmpty,
  planEditsOf,
  withoutCeiling,
  type PlanEdits,
} from './plan-edits.js';
import {
  CLARIFICATION_ANSWER_SCHEMA,
  CLARIFICATION_NOTE_MAX,
  CLARIFICATION_OPTION_IDS,
  CLARIFICATION_REQUEST_SCHEMA,
  type ClarificationFacts,
  type ClarificationOptionId,
} from './clarifications.js';
import {
  AnalysisError,
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalJson,
  canonicalRecord,
  isRecord,
  parseCanonicalJson,
  requireAnalysis,
  sha256Hex,
} from './canonical.js';
import { unitRequestDigest } from './contract.js';
import { deriveCoverageManifest, manifestCoversEveryBlock, manifestDigestIsExact, type ManifestBlockInput } from './coverage-manifest.js';
import { TASK_INPUT_CHECKPOINT_PURPOSE } from './identity.js';
import type { AnalysisKindDefinition, AnalysisReductionResult } from './kind-definition.js';
import {
  deriveReusePlan,
  deriveScopePlan,
  requireSelectedRange,
  reusePlanRecord,
  type ReusePlanPredecessor,
  type ScopePlanPredecessor,
} from './reuse-plan.js';
import { NO_TASK_OUTCOME_REASON, PRE_RUN_REPORT_REASON, runReportDigest, runReportProjection, type RunReportRecord } from './run-report.js';
import { baselineAnalysisKindDefinition } from './kind-definition.js';
import { EXECUTION_SLOT_BUSY, EXECUTION_SLOT_BUSY_REASON } from './execution-error.js';
import { describeComposition } from '../harness/primary-agent-harness.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../provider/egress-gate.js';
import type { AnalysisOutcomeAttentionReading, AnalysisTaskAttentionReading } from '../global-attention.js';
import { PLAN_MOVED_LABEL, type WaitingRunBlockCause } from '../reconnect-preflight.js';

type SqlRow = Record<string, SQLOutputValue>;

/** The exact `sample1` source digest: the Public SampleBook lineage every baseline-analysis Task requires. */
export const SAMPLE1_SOURCE_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' as const;
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
const SUCCESSOR_BEHAVIOR ='每次更新都是新的用户发起任务，经准备 → 计划预览 → 标准直接授权 → 执行后，在同一结果集上追加下一序号的不可变后继修订版；前一修订版不被改写，且始终可在修订历史中按其原始稿件 pin 查看。' as const;
const ACTIVE_RUN_REASON = '当前已有分析任务在调度或执行中；在其结束前不能准备新的更新任务。' as const;
/** A Run in Connectivity Wait blocks a new Task too, but it is not running: it waits to start once online (OFF-005, OFF-006). */
const WAITING_RUN_REASON = '有一项分析任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的更新任务。' as const;
/** The waiting state's own words (Issue #502, OFF-005): recorded, and nothing has been sent or begun. */
const CONNECTIVITY_WAIT_DETAIL = '已记录授权；联网并通过重新联网预检后开始。此前不调用模型、不产生用量。' as const;

/**
 * Why a mode that reads only what changed is not on offer: nothing has changed. The mode's own label
 * closes the sentence, so the baseline kind reads `…后才可同步到当前稿件。` exactly as it always has and
 * a review category names its own action.
 */
function changedModeUnavailableReason(label: string): string {
  return `结果集修订版仍绑定当前稿件；只有在已确认编辑使精确修订版新鲜度为“已过期”后才可${label}。`;
}

const RUN_STATE_LABELS: Record<BaselineAnalysisRunState, string> = {
  authorized: '已记录授权',
  'blocked-before-dispatch': '派发前阻止 · 未启动',
  admitted: '已进入调度器',
  executing: '正在执行分析单元',
  completed: '已完成',
  'completed-with-gaps': '已完成 · 保留缺口',
  failed: '运行失败',
  interrupted: '运行已中断',
  'awaiting-connectivity': '等待网络 · 未启动',
  cancelled: '已取消 · 未启动',
  cancelling: '正在取消',
  pausing: '正在暂停',
  paused: '已暂停',
  resumable: '任务已中断 · 可续行',
  'awaiting-clarification': '任务等待你的说明',
};

/**
 * A Run cancelled after it began executing its units (Issue #422, CTRL-005): `已取消`, and never `已取消 · 未启动`,
 * which stays the word for a Run cancelled before it ran anything, nor 已中断, which OFF-012 keeps for a Run that
 * can resume.
 */
export const RUN_CANCELLED_AFTER_START_LABEL = '已取消' as const;

/** What `cancelling` records (CTRL-005): the editor's word, and where the Run stops. */
export const RUN_CANCELLING_DETAIL = '编辑取消了这项任务；正在进行的阅读范围读完后停止，此后不再发送任何内容。' as const;

/** What `pausing` records (CTRL-001): the editor's word, and where the Run stops to wait. */
export const RUN_PAUSING_DETAIL = '编辑暂停了这项任务；正在进行的阅读范围读完后停下，已完成的部分都会保存。' as const;

/** What reconciliation records for a Run AI7 stopped under (CONT-014): nothing of it runs, and nothing is sent until 续行. */
export const RECONCILED_RESUMABLE_DETAIL = 'AI7 上次关闭时这项任务正在运行；已读完的阅读范围都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。' as const;
export const RECONCILED_PAUSED_DETAIL = 'AI7 上次关闭时这项任务正在暂停；已读完的阅读范围都已保存，任务已暂停。' as const;

/** The schema of one unit's continuation checkpoint (Issue #422, S76b). */
const UNIT_CHECKPOINT_SCHEMA = 'ai7.analysis.unit-checkpoint/1' as const;

/** One unit a Run settled, as its continuation checkpoint keeps it: the revision's unit record, and what was observed. */
export interface UnitCheckpoint {
  readonly attemptId: string;
  readonly unit: UnitResultRecord;
  readonly observation: { unitOrdinal: number; attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null;
  /** The kind's typed unit result, read back the way a predecessor's is; `null` for a gap. */
  readonly result: unknown;
}

const OUTCOME_LABELS = {
  completed: '任务结果：已完成',
  'completed-with-gaps': '任务结果：已完成（保留缺口）',
  failed: '任务结果：失败',
  interrupted: '任务结果：已中断',
  cancelled: '任务结果：已取消',
} as const;

/** The Run Budget Ceiling Reached outcome's own words (Issue #51, S16a; V2-UX-MODEL-016, interaction-spec §706). */
const BUDGET_REACHED_OUTCOME_LABEL = '任务结果：任务运行预算已达上限 · 已保留部分结果' as const;
/** …and the Run's, where ②A and its card read the Run (RUN-012): a terminal partial outcome, never 已中断. */
export const BUDGET_REACHED_RUN_LABEL = '任务运行预算已达上限 · 已保留部分结果' as const;
/** A Run the provider's account limit stopped (Issue #51, S16b; RUN-012): a remediable blocker, never 任务已中断 · 可续行. */
export const ACCOUNT_LIMIT_RUN_LABEL = '模型服务账户限额' as const;

/** Why an interrupted Run stopped, when a limit stopped it (Issue #51, S16a): the ceiling, what it used, and what it read. */
export interface RunStop {
  readonly reason: 'run-budget-ceiling-reached';
  readonly maxTotalTokens: number;
  readonly usedTokens: number;
  readonly unitsSettled: number;
  readonly unitsTotal: number;
}

/** A recorded stop read back: exactly the five facts, each a count; `null` for anything else, which no reader invents. */
function runStopOf(value: unknown): RunStop | null {
  if (!isRecord(value) || value.reason !== 'run-budget-ceiling-reached' || Object.keys(value).length !== 5) return null;
  const counts = [value.maxTotalTokens, value.usedTokens, value.unitsSettled, value.unitsTotal];
  if (!counts.every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) return null;
  return {
    reason: 'run-budget-ceiling-reached',
    maxTotalTokens: value.maxTotalTokens as number,
    usedTokens: value.usedTokens as number,
    unitsSettled: value.unitsSettled as number,
    unitsTotal: value.unitsTotal as number,
  };
}

/** Whether a Run began executing its units: the one fact that tells a started cancellation from a wait cancelled. */
function runBegan(transitions: ReadonlyArray<{ state: BaselineAnalysisRunState }>): boolean {
  return transitions.some((transition) => transition.state === 'executing');
}

export interface BaselineAnalysisRouteFacts {
  readonly fixtureIdentity: string;
  readonly fixtureSha256: string;
  readonly fixtureLineage: ReadonlyArray<{ identity: string; sha256: string }>;
}

interface ManuscriptCheckpointBinding {
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
type CheckpointPurpose = typeof TASK_INPUT_CHECKPOINT_PURPOSE | 'Reimport Safety / 重新导入安全固定点' | 'Export Input / 导出输入' | 'Document Version / 文档版本';

interface CheckpointOwner {
  createManuscriptCheckpointWork(manuscriptId: string, branchId: string, purpose: typeof TASK_INPUT_CHECKPOINT_PURPOSE):
    { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  advanceManuscriptCheckpointWork(workId: string):
    { done: boolean; completed: number; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  finalizeManuscriptCheckpointWork(
    workId: string,
    persist: (checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding;
  cancelManuscriptCheckpointWork(workId: string): boolean;
}

interface PreparationWork {
  workId: string;
  taskIntentId: string;
  checkpointWorkId: string;
  launchPolicy: LaunchPolicyProjection;
  total: number;
}

/** The facts one `analysis_task_intents` row carries, with the canonical record they were read from. */
interface IntentFacts {
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
}

/**
 * The kind-generic shape the store builds before it is read as one kind's projection. Every member
 * either is identical for both kinds or is widened to what the definition supplies; nothing here is
 * a member neither kind declares.
 */
type AnalysisProjectionShape = Omit<
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
    bookId: string;
    goal: AnalysisGoal;
    update: BaselineAnalysisUpdateRequest | AnalysisModeRequest | null;
    reconfirm: boolean;
    launchPolicy: LaunchPolicyProjection;
    /** 改计划重做 (Issue #422, S76c): the cancelled Run of the Book's latest Task this new Task redoes. */
    redoOf?: string | null;
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
interface PlanVersionFacts {
  readonly planVersionId: string;
  readonly taskIntentId: string;
  readonly ordinal: number;
  readonly planRevisionId: string | null;
  readonly planEnvelopeDigest: string;
  readonly createdAt: string;
}

/** The input of one `safe-retry` Plan Adaptation the execution owner records before it dispatches the retry. */
export interface PlanAdaptationInput {
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
  readonly planEnvelopeDigest: string;
  readonly bindingDigest: string;
}

/** Everything the execution owner needs from the frozen plan before the first model call. */
export interface ExecutionPlanFacts {
  readonly bookId: string;
  readonly taskIntentId: string;
  readonly runRecordId: string;
  /** The exact plan version the Run Authorization bound. */
  readonly planVersionId: string;
  readonly planVersionOrdinal: number;
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
  readonly artifactPin: { nativeCarrierSha256: string; sidecarRevision: 2; sidecarSha256: string };
  readonly promptContractDigest: string;
  readonly behaviorCompositionDigest: string;
  /** The ceiling the frozen Provider Resolution Plan carries, already resolved against the frozen unit count. */
  readonly runBudgetCeiling: RunBudgetCeilingState;
  /** `null` for the first baseline; the verified reuse plan for an update Task. */
  readonly update: ExecutionUpdateFacts | null;
  /** What the bound plan leaves out at the editor's word (Issue #419): the Run honours each. */
  readonly editorEdits: PlanEdits;
}

export interface ExecutionBindingRecord {
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
  readonly outboundDataCategory: 'public-or-synthetic';
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

function asString(value: unknown): string {
  requireAnalysis(typeof value === 'string', 'ANALYSIS_RECORD_INVALID', '分析记录字段无效。');
  return value;
}

function asNumber(value: unknown): number {
  requireAnalysis(typeof value === 'number' && Number.isSafeInteger(value), 'ANALYSIS_RECORD_INVALID', '分析记录数值无效。');
  return value;
}

/**
 * Who started the Task, as its Run Authorization records it (Issue #421): `standard-direct` from its plan, or
 * `default-execution-rule` — 快速开始 under a 默认执行规则 — with the rule version the authorization names.
 */
function authorizationOrigin(row: SqlRow): { origin: 'standard-direct' | 'default-execution-rule'; ruleVersionId: string | null } {
  const origin = asString(row.origin);
  if (origin === 'standard-direct') return { origin, ruleVersionId: null };
  const record = parseCanonicalJson(asString(row.canonical_json));
  requireAnalysis(origin === 'default-execution-rule' && isRecord(record) && record.origin === origin &&
    typeof record.ruleVersionId === 'string' && UUID_PATTERN.test(record.ruleVersionId),
  'ANALYSIS_RECORD_INVALID', '运行授权的来源记录无效。');
  return { origin, ruleVersionId: record.ruleVersionId };
}

/** How a Run is authorized: from its plan, or by 快速开始 under one version of a 默认执行规则 (Issue #421). */
export type AnalysisAuthorizationOrigin =
  | { readonly kind: 'standard-direct' }
  | { readonly kind: 'default-execution-rule'; readonly ruleVersionId: string };
const STANDARD_DIRECT: AnalysisAuthorizationOrigin = { kind: 'standard-direct' };

function transact<T>(db: DatabaseSync, body: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Analysis ledger transaction rollback failed.');
    }
    throw error;
  }
}

function sameRange(left: BaselineAnalysisSelectedRange | null, right: BaselineAnalysisSelectedRange | null): boolean {
  return left === null || right === null ? left === right : left.startPosition === right.startPosition && left.endPosition === right.endPosition;
}

function firstBaselineCounts(unitCount: number): AnalysisReusePlanCounts {
  return { reused: 0, recomputed: unitCount, invalidated: 0, bypassed: 0 };
}

/**
 * A Task whose Run is authorized for dispatch, waiting in Connectivity Wait, admitted, executing, stopping at the
 * editor's cancellation, pausing, paused, or left 可续行 blocks any new update Task: a paused Run holds no slot, but it
 * is not done (Issue #422, S76b). A waiting Run holds no execution slot, but it will run: the
 * editor cancels it to prepare another (Issue #502, OFF-010); a cancelling one still holds the slot until it has
 * stopped (Issue #422).
 */
function runIsActive(state: BaselineAnalysisRunState | null): boolean {
  return state === 'authorized' || state === 'awaiting-connectivity' || state === 'admitted' || state === 'executing' ||
    state === 'cancelling' || state === 'pausing' || state === 'paused' || state === 'resumable' || state === 'awaiting-clarification';
}

/** Why an active Run blocks a new Task, in the words of its state: a waiting Run is never said to be under way. */
function activeRunReason(state: BaselineAnalysisRunState | null): string {
  return state === 'awaiting-connectivity' ? WAITING_RUN_REASON : ACTIVE_RUN_REASON;
}

/**
 * The launch facts a Run's plan must freeze, handed to the ledger once by the service entry. Under
 * `development-ci` the plan stays exactly what it was: the denied production binding, the local
 * deterministic route when one is bound, and an `unset` ceiling. Under `developer-live` the plan
 * freezes the v5 binding — the `opencode-go` route, its bare model id, its fixed development
 * Credential Reference, and the required token ceiling, explicit or the policy's per-frozen-unit
 * default — because every one of those is a material plan input that must be pinned before
 * authorization, not chosen at dispatch.
 */
export interface LaunchBinding {
  readonly operationalScope: 'development-ci' | 'developer-live';
  readonly live: {
    readonly route: 'opencode-go';
    readonly model: 'deepseek-v4-flash';
    readonly endpoint: string;
    readonly credentialSlot: 'opencode-go';
    readonly credentialReference: string;
    readonly runBudgetCeiling: DeveloperLiveCeiling;
  } | null;
}

const DEVELOPMENT_CI_LAUNCH: LaunchBinding = { operationalScope: 'development-ci', live: null };

/**
 * Resolve the bound ceiling against the frozen Coverage Manifest unit count: an explicit form
 * ceiling is already a total, and the policy default is 30,000 tokens times the unit count
 * (ADR 0070), computed here — after the manifest is frozen and before the plan is.
 */
export function resolveDeveloperLiveCeiling(ceiling: DeveloperLiveCeiling, unitCount: number): { kind: 'tokens'; maxTotalTokens: number } {
  return ceiling.kind === 'tokens'
    ? ceiling
    : { kind: 'tokens', maxTotalTokens: ceiling.tokensPerFrozenUnit * unitCount };
}

/** The exact ceiling state a frozen Provider Resolution Plan carries; the plan writes only this shape. */
function runBudgetCeilingStateOf(value: unknown): RunBudgetCeilingState {
  if (value === 'unset') return 'unset';
  const maxTotalTokens = isRecord(value) ? value['maxTotalTokens'] : null;
  requireAnalysis(isRecord(value) && value['kind'] === 'tokens' && typeof maxTotalTokens === 'number' && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0,
    'ANALYSIS_RECORD_INVALID', 'Run Budget Ceiling 记录无效。');
  return { kind: 'tokens', maxTotalTokens };
}

/**
 * The one reading every developer-live surface states for the bound ceiling. An explicit ceiling is
 * its total; the per-frozen-unit default states the formula before a manifest exists and the computed
 * total once one does.
 */
function ceilingReading(ceiling: DeveloperLiveCeiling, unitCount: number | null): string {
  if (ceiling.kind === 'tokens') return `${ceiling.maxTotalTokens} tokens`;
  return unitCount === null
    ? `${ceiling.tokensPerFrozenUnit} tokens × 冻结单元数`
    : `${ceiling.tokensPerFrozenUnit * unitCount} tokens（${ceiling.tokensPerFrozenUnit} × ${unitCount} 个冻结单元）`;
}

/**
 * Every statement a Task surface makes about the trusted scope, the Provider Processing version, the
 * live transmissions, and the Run Budget Ceiling is derived here from the bound launch, never from a
 * constant. Under `development-ci` each one reads exactly as it always has — the v1 denial and its
 * zero live transmissions, byte for byte. Under `developer-live` each states the scope the launch
 * actually bound, its version, the route, and the frozen token ceiling: a surface that promised zero
 * transmission one row above the endpoint the Run was calling is the defect these derive away.
 *
 * The three are exported so a test can compare both readings against the captured base text directly,
 * without standing up the Run each surface would otherwise need. `unitCount` is the frozen Coverage
 * Manifest count when one exists, so the per-frozen-unit default can state its computed total.
 */
export function namedNonEffects(live: LaunchBinding['live'], unitCount: number | null = null): ReadonlyArray<string> {
  return [
    '不修改稿件，不创建修订版或事实判定',
    '不创建学习资格、策略激活、Enrollment、Apply 或 Effect',
    '只读取当前图书的任务输入修订版，不读取其他图书',
    live === null
      ? 'development-ci · Provider Processing v1：0 次实时传输，远程绑定被拒绝'
      : `developer-live · Provider Processing v5：实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}），远程绑定 ${live.route} · ${live.model} 已获准`,
    '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容',
  ];
}

/** Why a Run that cannot dispatch was blocked; only the first reason states the launch's own facts. */
export function blockedReasons(live: LaunchBinding['live'], unitCount: number | null = null): ReadonlyArray<string> {
  return [
    live === null
      ? '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝。'
      : `当前可信启动范围为 developer-live，Provider Processing v5 允许的实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}）；远程绑定 ${live.route} · ${live.model} 已获准。`,
    '未提供 J-04 专用的本地确定性模型适配器控制，因此没有可执行的本地路由。',
    '运行授权已记录；派发前阻止，未创建 Session、未构造 Provider payload、未访问网络。',
  ];
}

/**
 * What an analysis update does to the Provider, stated for the launch the next Run would execute
 * under. `firstTaskLabel` is the label of the kind's own first Task, which the sentence compares an
 * update to; it defaults to the baseline kind's, so every existing reading keeps its exact text.
 */
export function providerConsequence(live: LaunchBinding['live'], unitCount: number | null = null, firstTaskLabel = '首次基线分析'): string {
  return live === null
    ? `与${firstTaskLabel}相同：远程 DeepSeek 绑定被 development-ci · Provider Processing v1 拒绝（0 次实时传输），只有 J-04 控制绑定的 AI7 本地确定性模型适配器可执行；外发数据类别 public-or-synthetic；未设置任务预算上限；只有重算单元形成模型请求并计入用量，复用单元不形成任何模型负载。`
    : `与${firstTaskLabel}相同：远程绑定 ${live.route} · ${live.model} 在 developer-live · Provider Processing v5 下可执行，实时传输受运行边界约束；外发数据类别 public-or-synthetic；任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}；每个重算单元形成一次实时传输并计入用量，复用单元不形成任何模型负载。`;
}

/**
 * The stages a stop keeps its usage for (Issue #541): a reduction or a sample 续行 forms again was spent all the same. A unit
 * a stop kept carries its own usage in its checkpoint.
 */
export const CARRIED_STAGES = ['cross-unit-reduction', 'assurance-sampling'] as const;
export type CarriedStages = Record<(typeof CARRIED_STAGES)[number], { requests: number; inputTokens: number; outputTokens: number }>;

/**
 * The append-only ledger of one analysis kind of one Book database. The kind it serves is the
 * {@link AnalysisKindDefinition} it is constructed with: the identity it tags every row with, the
 * contract version, the Task modes and their goals, the frozen prompt contract its plans freeze, the
 * reducer its Runs reduce through, and the stages its plans declare. Two instances over the same
 * database serve the two kinds of Issue #53 without either seeing the other's Tasks, plans, Runs, or
 * revisions: every read is filtered by the definition's kind.
 */
export class BaselineAnalysisStore {
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;
  readonly #route: BaselineAnalysisRouteFacts | null;
  readonly #definition: AnalysisKindDefinition;
  readonly #work = new Map<string, PreparationWork>();
  #launch: LaunchBinding = DEVELOPMENT_CI_LAUNCH;

  constructor(
    db: DatabaseSync,
    checkpointOwner: CheckpointOwner,
    route: BaselineAnalysisRouteFacts | null,
    definition: AnalysisKindDefinition = baselineAnalysisKindDefinition(),
  ) {
    this.#db = db;
    this.#checkpointOwner = checkpointOwner;
    this.#route = route;
    this.#definition = definition;
  }

  get route(): BaselineAnalysisRouteFacts | null {
    return this.#route;
  }

  /** The analysis kind this ledger serves; the execution owner reads its contract through this. */
  get definition(): AnalysisKindDefinition {
    return this.#definition;
  }

  get kind(): AnalysisKindId {
    return this.#definition.kind;
  }

  get launch(): LaunchBinding {
    return this.#launch;
  }

  /**
   * Bind the trusted launch facts. The service entry calls this once, before it serves any frame, so
   * that the store never has to reach for a launch policy of its own; a `developer-live` scope
   * without its live binding, or a live binding under any other scope, is refused rather than
   * silently downgraded to the provider-free plan.
   */
  bindLaunch(launch: LaunchBinding): void {
    requireAnalysis((launch.operationalScope === 'developer-live') === (launch.live !== null),
      'ANALYSIS_LAUNCH_BINDING_INVALID', '可信区间与开发者实时绑定不一致。');
    const ceiling = launch.live?.runBudgetCeiling ?? null;
    requireAnalysis(launch.live === null ||
      ((ceiling!.kind === 'tokens'
        ? Number.isSafeInteger(ceiling!.maxTotalTokens) && ceiling!.maxTotalTokens > 0
        : Number.isSafeInteger(ceiling!.tokensPerFrozenUnit) && ceiling!.tokensPerFrozenUnit > 0) &&
        UUID_PATTERN.test(launch.live.credentialReference)),
    'ANALYSIS_LAUNCH_BINDING_INVALID', '开发者实时绑定缺少必需的运行预算上限或凭据引用。');
    this.#launch = launch;
  }

  // ---- inspection -------------------------------------------------------------------------------

  /**
   * The Book's latest Task of this ledger's kind with the latest Result Set Revision, the Revision
   * History, and the Analysis Update Controls; `revisionId` additionally opens one exact revision
   * read-only. Older revisions never replace `resultSetRevision`, which is always the latest.
   *
   * The shape is discriminated on `kind`: a caller that knows which ledger it asked narrows the union
   * on that member, and the baseline kind's shape is exactly what it has always been.
   */
  inspect(bookId: string, progress: ProgressReader = () => null, revisionId: string | null = null): AnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    requireAnalysis(revisionId === null || UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const intentRow = this.#latestIntentRow(bookId);
    if (intentRow === undefined) {
      this.#binding(bookId);
      requireAnalysis(revisionId === null, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
      return this.#available(bookId);
    }
    const intent = this.#intentFacts(intentRow);
    const taskIntent = {
      taskIntentId: intent.taskIntentId,
      goal: intent.goal,
      expectedOutcome: intent.expectedOutcome,
      createdAt: intent.createdAt,
      mode: intent.mode,
      modeLabel: this.#definition.mode(intent.mode).label,
      ...(this.#definition.kind !== BASELINE_ANALYSIS_KIND ? {} : {
        redoOf: intent.redoOfRunRecordId === null
          ? null
          : { runRecordId: intent.redoOfRunRecordId, taskIntentId: this.#redoneTaskIntentId(intent.redoOfRunRecordId) },
      }),
    };
    const revisionRows = this.#revisionRows(bookId);
    const latestRow = revisionRows.at(-1);
    const latestOrdinal = latestRow === undefined ? 0 : asNumber(latestRow.ordinal);
    const revision = latestRow === undefined ? null : this.#revisionProjection(latestRow, latestOrdinal);
    const history = this.#history(bookId, revisionRows, revision);
    const inspectedRevision = revisionId === null ? null : this.#inspectedRevision(revisionRows, revisionId, latestOrdinal);
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    if (checkpoint === undefined) {
      this.#binding(bookId);
      const update = this.#carriesPlan(intent.mode) ? this.#updateProjection(intent, null, null, revision) : null;
      return this.#asProjection({
        ...this.#shape(bookId),
        taskIntent,
        resultSetRevision: revision,
        update,
        updateControls: this.#updateControlsFor(bookId, revision, null),
        history,
        inspectedRevision,
        actions: { canPrepare: revision === null, canAuthorize: false, canReconfirmPlan: false },
      });
    }
    const versions = this.#planVersionFacts(intent.taskIntentId);
    const currentVersion = versions.at(-1);
    requireAnalysis(currentVersion !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, currentVersion.ordinal);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifestCoversEveryBlock(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const digests = this.#planDigests(intent.taskIntentId, currentVersion.ordinal);
    requireAnalysis(digests['plan-envelope'] === currentVersion.planEnvelopeDigest, 'ANALYSIS_RECORD_INVALID', '计划版本与其计划信封不一致。');
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const authorization = this.#db.prepare('SELECT * FROM analysis_run_authorizations WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM analysis_run_records WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const run = runRecord === undefined ? null : this.#runProjection(runRecord, progress);
    const outcome = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const state: BaselineAnalysisProjection['state'] = run === null
      ? 'prepared'
      : run.state === 'authorized' || run.state === 'blocked-before-dispatch'
        ? 'authorized-blocked'
        // A cancelled Run never ran, so it reads as cancelled — never as 已中断, which OFF-012 keeps for a Run
        // that can resume (Issue #502).
        : run.state === 'awaiting-connectivity' ? 'waiting'
          : run.state === 'cancelled' ? 'cancelled'
            : run.state === 'cancelling' ? 'cancelling'
              : run.state === 'pausing' ? 'pausing'
                : run.state === 'paused' ? 'paused'
                  : run.state === 'resumable' ? 'resumable'
                    : run.state === 'awaiting-clarification' ? 'awaiting-clarification'
        : run.state === 'admitted' ? 'admitted'
          : run.state === 'executing' ? 'executing'
            : run.state === 'completed' || run.state === 'completed-with-gaps' ? 'settled'
              : run.state === 'failed' ? 'failed' : 'interrupted';
    const providerPlan = plan['provider-resolution-plan'] as BaselineAnalysisProjection['providerResolutionPlan'];
    const planned = this.#carriesPlan(intent.mode);
    const reusePlan = planned ? plan['reuse-plan'] as AnalysisPlanRecord : null;
    const update = planned ? this.#updateProjection(intent, reusePlan, digests['reuse-plan'] ?? null, revision) : null;
    // Drift detection (Issue #48): before authorization the material inputs are re-derived from durable
    // state and compared with the frozen version; a stored pending Plan Revision takes precedence over a
    // live difference. After authorization the bound plan is final for its Run and nothing is compared.
    const materialInputs = materialPlanInputsOfComponents(plan, intent.record);
    const revisions = this.#planRevisionProjections(intent.taskIntentId, versions);
    let planRevision: BaselineAnalysisPlanRevisionProjection | null = null;
    if (authorization === undefined) {
      planRevision = revisions.filter((entry) => entry.state === 'pending' && entry.priorPlanVersionId === currentVersion.planVersionId).at(-1) ?? null;
      if (planRevision === null) {
        const live = this.#currentMaterialInputs(bookId, intent.mode, materialInputs.selectedRange, manifest.units.length,
          planEditCeiling(this.#planEditsOf(intent.taskIntentId, currentVersion.ordinal)));
        const diff = diffMaterialPlanInputs(materialInputs, live);
        if (diff.length > 0) {
          const changedFields = diff.map((entry) => entry.field);
          planRevision = {
            planRevisionId: null,
            priorPlanVersionId: currentVersion.planVersionId,
            priorOrdinal: currentVersion.ordinal,
            nextOrdinal: null,
            trigger: 'inspect',
            detectedAt: null,
            changedFields,
            diff,
            proposed: live,
            state: 'pending',
            supersedes: [],
            resolved: false,
            label: planRevisionLabel(currentVersion.ordinal, null, changedFields, 'pending'),
          };
        }
      }
    }
    const boundVersion = authorization === undefined ? null : versions.find((entry) => entry.planEnvelopeDigest === asString(authorization.plan_envelope_sha256)) ?? null;
    const planVersions = versions.map((entry): BaselineAnalysisPlanVersionProjection => ({
      planVersionId: entry.planVersionId,
      ordinal: entry.ordinal,
      planEnvelopeDigest: entry.planEnvelopeDigest,
      planRevisionId: entry.planRevisionId,
      createdAt: entry.createdAt,
      edits: this.#planEditsOf(intent.taskIntentId, entry.ordinal),
      state: boundVersion !== null && entry.planVersionId === boundVersion.planVersionId
        ? 'bound'
        : entry.ordinal < currentVersion.ordinal || planRevision !== null ? 'superseded' : 'current',
    }));
    // A predecessor drift is a different Task Intent, never a reconfirmation of this one.
    const canReconfirmPlan = authorization === undefined && planRevision !== null && !planRevision.changedFields.includes('predecessorRevision');
    return this.#asProjection({
      bookId,
      kind: this.#definition.kind,
      contractVersion: this.#definition.contractVersion,
      state,
      // A Run in Connectivity Wait, or cancelled while it waited, never ran: it reads as its Run state does, never as
      // 已中断, which OFF-012 keeps for a Run that can resume (Issue #502). One cancelled after it began reads 已取消,
      // and one stopping at the editor's word 正在取消 (Issue #422).
      stateLabel: state === 'prepared' ? '计划已冻结 · 待授权'
        : state === 'authorized-blocked' ? (run?.blockedBy === 'plan-moved' ? PLAN_MOVED_LABEL : '已授权 · 派发前阻止')
          : state === 'waiting' ? RUN_STATE_LABELS['awaiting-connectivity']
            : state === 'cancelled' ? (run !== null && runBegan(run.transitions) ? RUN_CANCELLED_AFTER_START_LABEL : RUN_STATE_LABELS.cancelled)
              : state === 'cancelling' ? RUN_STATE_LABELS.cancelling
                : state === 'pausing' ? RUN_STATE_LABELS.pausing
                  : state === 'paused' ? RUN_STATE_LABELS.paused
                    : state === 'resumable' ? (run !== null && this.accountLimitOf(run.runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL : RUN_STATE_LABELS.resumable)
                      : state === 'awaiting-clarification' ? RUN_STATE_LABELS['awaiting-clarification']
              : state === 'admitted' ? '已进入调度'
                : state === 'executing' ? '正在执行'
                  : state === 'settled' ? '已形成结果集修订版'
                    : state === 'failed' ? '运行失败'
                      // Run Budget Ceiling Reached keeps its own words, never 已中断's (Issue #51, S16a; RUN-012).
                      : outcome !== undefined && run !== null && this.#runStop(run.runRecordId) !== null ? BUDGET_REACHED_RUN_LABEL : '运行已中断',
      taskIntent,
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: TASK_INPUT_CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      manuscriptPin: plan['manuscript-pin'] as BaselineAnalysisProjection['manuscriptPin'],
      artifactPin: plan['artifact-pin'] as BaselineAnalysisProjection['artifactPin'],
      runSourceScope: plan['run-source-scope'] as BaselineAnalysisProjection['runSourceScope'],
      coverageManifest: manifest,
      providerResolutionPlan: providerPlan,
      executionPlan: plan['execution-plan'] as BaselineAnalysisProjection['executionPlan'],
      planEnvelope: {
        digest: asString(digests['plan-envelope']),
        dispatchAllowed: envelope.dispatchAllowed === true,
        providerStatus: envelope.providerStatus as 'remote-denied-local-deterministic' | 'remote-denied-no-route',
        summary: asString(envelope.summary),
        promptContractDigest: asString(envelope.promptContractDigest),
        behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
        planVersion: typeof envelope.planVersion === 'number' ? envelope.planVersion : null,
        boundary: isRecord(envelope.boundary) ? envelope.boundary as unknown as PlanBoundarySplitProjection : null,
      },
      planVersion: { ...planVersions[planVersions.length - 1]!, materialInputs },
      planVersions,
      planRevisions: revisions,
      planRevision,
      authorization: authorization === undefined ? null : {
        authorizationId: asString(authorization.authorization_id),
        planEnvelopeDigest: asString(authorization.plan_envelope_sha256),
        planVersionOrdinal: boundVersion?.ordinal ?? null,
        ...authorizationOrigin(authorization),
        authority: asString(authorization.authority) as 'standard-direct-dispatch' | 'record-only-no-dispatch',
        authorizedAt: asString(authorization.authorized_at),
      },
      run,
      resultSetRevision: revision,
      taskOutcome: outcome === undefined ? null : this.#outcomeProjection(outcome),
      update,
      updateControls: this.#updateControlsFor(bookId, revision, runIsActive(run?.state ?? null) ? run!.state : null),
      history,
      inspectedRevision,
      actions: {
        // A baseline analysis whose Run ended before it kept anything — cancelled, a wait included (Issue #502, OFF-010),
        // failed, interrupted or blocked — leaves the Book with no revision: it can be started again, as a Book never
        // analysed can (Issue #422, S76c).
        canPrepare: this.#definition.kind === BASELINE_ANALYSIS_KIND && revision === null && run !== null &&
          (run.state === 'cancelled' || run.state === 'failed' || run.state === 'interrupted' || run.state === 'blocked-before-dispatch'),
        canAuthorize: authorization === undefined && (update === null || update.predecessorCurrent) && planRevision === null,
        canReconfirmPlan,
      },
      namedNonEffects: namedNonEffects(this.#launch.live, manifest.units.length),
    });
  }

  /**
   * The durable `safe-retry` Plan Adaptations of one Run, in record order. Both the Run's timeline
   * and its Run Report read them from here, so neither restates what the other saw.
   */
  adaptationsOf(runRecordId: string): BaselineAnalysisPlanAdaptationProjection[] {
    return (this.#db.prepare(
      `SELECT adaptation.* FROM analysis_plan_adaptations adaptation
       JOIN analysis_execution_attempts attempt ON attempt.attempt_id = adaptation.attempt_id
       WHERE attempt.run_record_id = ? ORDER BY adaptation.ordinal`,
    ).all(runRecordId) as SqlRow[]).map((row): BaselineAnalysisPlanAdaptationProjection => {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Omit<BaselineAnalysisPlanAdaptationProjection, 'label'>;
      requireAnalysis(record.adaptationId === row.adaptation_id && record.adaptationClass === 'safe-retry', 'ANALYSIS_RECORD_INVALID', '计划内调整记录无效。');
      return { ...record, label: planAdaptationLabel(record.unitOrdinal, record.classifiedReason) };
    });
  }

  /**
   * One frozen plan version of one of this ledger's Tasks, named by the envelope digest a reader holds
   * for it: its Task Input checkpoint and its components, read back exactly as `inspect` reads the
   * latest Task's (Issue #418). A Review Run's category keeps naming its own Task after later Tasks of
   * the same kind exist, so the Task Drawer reads that plan here rather than through `inspect`. Nothing
   * is written.
   */
  frozenPlan(taskIntentId: string, planEnvelopeDigest: string): {
    checkpoint: NonNullable<BaselineAnalysisProjection['checkpoint']>;
    planVersion: number;
    components: Readonly<Record<string, unknown>>;
  } {
    requireAnalysis(UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest), 'ANALYSIS_RECORD_INVALID', '任务计划标识无效。');
    const intent = this.#db.prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(intent !== undefined && intent.kind === this.#definition.kind, 'ANALYSIS_RECORD_INVALID', '任务计划不属于该分析种类。');
    const version = this.#planVersionByEnvelopeDigest(planEnvelopeDigest);
    requireAnalysis(version !== undefined && version.taskIntentId === taskIntentId, 'ANALYSIS_RECORD_INVALID', '任务计划版本缺失。');
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpoint !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const components = this.#planRecords(taskIntentId, 'any', version.ordinal);
    requireAnalysis(this.#planDigests(taskIntentId, version.ordinal)['plan-envelope'] === planEnvelopeDigest, 'ANALYSIS_RECORD_INVALID', '计划版本与其计划信封不一致。');
    return {
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: TASK_INPUT_CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      planVersion: version.ordinal,
      components,
    };
  }

  // ---- 待我处理 (Issue #424, plan slice S78) ------------------------------------------------------------

  /**
   * What 待我处理 reads of this ledger's kind across every Book (V2-UX-ATTN-002 to 005): each Book's latest
   * Task — exactly the one `inspect` reads — with its Run's last recorded state, and, for a prepared Task,
   * the pending Plan Revision that 重新确认计划 would settle, derived exactly as `inspect` derives it: a
   * stored revision still pending on the current version first, then a live difference of the material
   * inputs. A difference in the predecessor revision is left out, because no reconfirmation settles it.
   * Then the Task Outcomes that completed since `since`, newest first.
   *
   * A read: nothing is written. A Run left admitted or executing is reported with the owner's `progress`
   * reading of it, which is `null` when nothing executes it; what that means is the reader's to say.
   */
  attentionReadings(progress: ProgressReader, since: string, limit: number): {
    tasks: AnalysisTaskAttentionReading[];
    outcomes: AnalysisOutcomeAttentionReading[];
  } {
    const kind = this.#definition.kind;
    // 待我处理 names the baseline analysis alone: every other kind's Tasks run inside a Review Run, which
    // the Review Run ledger reads as one item of its own.
    requireAnalysis(kind === BASELINE_ANALYSIS_KIND, 'ANALYSIS_KIND_INVALID', '待我处理只读取基线分析的任务。');
    // Each Book's latest Task, exactly as `#latestIntentRow` orders them, kept only when it could need the
    // editor: prepared and not yet started, or with a Run whose last state is not a completion — whose
    // outcome is read below instead.
    const lastState = `(SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)`;
    const rows = this.#db.prepare(
      `SELECT t.*, b.title book_title, r.run_record_id, r.recorded_at run_recorded_at,
              ${lastState} last_state,
              (SELECT s.recorded_at FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state_at,
              (SELECT 1 FROM analysis_run_authorizations a WHERE a.task_intent_id = t.task_intent_id) has_authorization
       FROM analysis_task_intents t
       JOIN books b ON b.book_id = t.book_id
       LEFT JOIN analysis_run_records r ON r.task_intent_id = t.task_intent_id
       WHERE t.kind = ? AND t.rowid = (
           SELECT t2.rowid FROM analysis_task_intents t2 WHERE t2.book_id = t.book_id AND t2.kind = t.kind
           ORDER BY t2.created_at DESC, t2.rowid DESC LIMIT 1)
         AND EXISTS (SELECT 1 FROM analysis_task_input_checkpoints c WHERE c.task_intent_id = t.task_intent_id)
         AND (r.run_record_id IS NULL OR ${lastState} NOT IN ('completed', 'completed-with-gaps'))
       ORDER BY t.created_at, t.task_intent_id LIMIT ?`,
    ).all(kind, limit) as SqlRow[];
    const tasks: AnalysisTaskAttentionReading[] = [];
    for (const row of rows) {
      const base = {
        bookId: asString(row.book_id),
        bookTitle: asString(row.book_title),
        taskIntentId: asString(row.task_intent_id),
        mode: asString(row.mode) as BaselineAnalysisTaskMode,
        createdAt: asString(row.created_at),
      };
      if (row.run_record_id !== null) {
        const runRecordId = asString(row.run_record_id);
        requireAnalysis(row.last_state !== null, 'ANALYSIS_RECORD_INVALID', '运行记录缺少状态转换。');
        const state = asString(row.last_state) as BaselineAnalysisRunState;
        tasks.push({
          ...base,
          run: {
            runRecordId,
            state,
            stateAt: asString(row.last_state_at),
            recordedAt: asString(row.run_recorded_at),
            progress: state === 'admitted' || state === 'executing' || state === 'cancelling' || state === 'pausing' ? progress(runRecordId) : null,
            openClarification: this.#openClarificationOf(runRecordId, state),
            // 已停止 · 预算已达上限 (Issue #51, S16a): an interrupted Run whose outcome names the ceiling — and whether the
            // launch set it, under developer-live (Issue #541).
            budgetReached: state === 'interrupted' && this.#runStop(runRecordId) !== null,
            launchSetsCeiling: state === 'interrupted' && this.#runStop(runRecordId) !== null && this.#launchSetsCeiling(asString(row.task_intent_id)),
            // 模型服务账户限额 (Issue #51, S16b): a resumable Run the provider's account limit stopped.
            accountLimited: state === 'resumable' && this.accountLimitOf(runRecordId) !== null,
            // 需要重新确认计划 (Issue #536; OFF-008): a waiting Run blocked because its plan moved.
            planMoved: state === 'blocked-before-dispatch' && this.blockedByOf(runRecordId) === 'plan-moved',
          },
          planRevision: null,
        });
        continue;
      }
      if (row.has_authorization !== null) continue;
      tasks.push({ ...base, run: null, planRevision: this.#pendingPlanRevision(row) });
    }
    const outcomes = (this.#db.prepare(
      `SELECT o.outcome_id, o.task_intent_id, o.run_record_id, o.classification, o.recorded_at, o.result_set_revision_id,
              t.book_id, t.mode, b.title book_title, r.ordinal revision_ordinal
       FROM analysis_task_outcomes o
       JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       JOIN books b ON b.book_id = t.book_id
       LEFT JOIN analysis_result_set_revisions r ON r.revision_id = o.result_set_revision_id
       WHERE t.kind = ? AND o.classification IN ('completed', 'completed-with-gaps') AND o.recorded_at >= ?
       ORDER BY o.recorded_at DESC, o.outcome_id LIMIT ?`,
    ).all(kind, since, limit) as SqlRow[]).map((row): AnalysisOutcomeAttentionReading => ({
      bookId: asString(row.book_id),
      bookTitle: asString(row.book_title),
      taskIntentId: asString(row.task_intent_id),
      mode: asString(row.mode) as BaselineAnalysisTaskMode,
      outcomeId: asString(row.outcome_id),
      runRecordId: asString(row.run_record_id),
      classification: asString(row.classification) as 'completed' | 'completed-with-gaps',
      recordedAt: asString(row.recorded_at),
      revisionId: row.result_set_revision_id === null ? null : asString(row.result_set_revision_id),
      revisionOrdinal: row.revision_ordinal === null ? null : asNumber(row.revision_ordinal),
    }));
    return { tasks, outcomes };
  }

  /**
   * A prepared Task's pending Plan Revision, as `inspect` finds it: the latest stored one still pending on
   * the current version, else a live difference between the version's frozen material inputs and durable
   * state now. `null` when the plan stands, and when the only way on is a new Task — a difference in the
   * predecessor revision, which no reconfirmation settles (`canReconfirmPlan` is false for it).
   */
  #pendingPlanRevision(intentRow: SqlRow): AnalysisTaskAttentionReading['planRevision'] {
    const intent = this.#intentFacts(intentRow);
    const versions = this.#planVersionFacts(intent.taskIntentId);
    const current = versions.at(-1);
    requireAnalysis(current !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const stored = this.#planRevisionProjections(intent.taskIntentId, versions)
      .filter((entry) => entry.state === 'pending' && entry.priorPlanVersionId === current.planVersionId).at(-1);
    let revision: { planRevisionId: string | null; at: string; changedFields: ReadonlyArray<string> } | null = stored === undefined
      ? null
      : { planRevisionId: stored.planRevisionId, at: stored.detectedAt ?? current.createdAt, changedFields: stored.changedFields };
    if (revision === null) {
      const plan = this.#planRecords(intent.taskIntentId, intent.mode, current.ordinal);
      const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
      const frozen = materialPlanInputsOfComponents(plan, intent.record);
      const diff = diffMaterialPlanInputs(frozen, this.#currentMaterialInputs(intent.bookId, intent.mode, frozen.selectedRange, manifest.units.length,
        planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal))));
      revision = diff.length === 0 ? null : { planRevisionId: null, at: current.createdAt, changedFields: diff.map((entry) => entry.field) };
    }
    if (revision === null || revision.changedFields.includes('predecessorRevision')) return null;
    return { ...revision, priorOrdinal: current.ordinal };
  }

  /**
   * One Task Outcome as a reader receives it, its Run Report included.
   *
   * A Task Outcome recorded before Issue #276 carries no report. It is immutable history and is read
   * as exactly what it is: `report` is `null`, the absence is disclosed in the reader's own language,
   * and nothing here rewrites the row to invent one. A report that is present is projected with the
   * digest of its own stored canonical JSON, checked against the digest the Run recorded beside it —
   * so a reader never receives a report whose bytes and whose digest disagree.
   */
  #outcomeProjection(row: SqlRow): NonNullable<BaselineAnalysisProjection['taskOutcome']> {
    const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    const classification = asString(row.classification) as keyof typeof OUTCOME_LABELS;
    const report = isRecord(record.report) ? record.report as unknown as RunReportRecord : null;
    if (report !== null) {
      requireAnalysis(runReportDigest(report) === record.reportDigest, 'ANALYSIS_RECORD_INVALID', '运行报告与其记录的摘要不一致。');
    }
    // A stop is named only on an interrupted outcome recorded since S16a (Issue #51); every earlier one reads as it was.
    const stop = classification === 'interrupted' ? runStopOf(record.stop) : null;
    return {
      outcomeId: asString(row.outcome_id),
      classification,
      label: stop === null ? OUTCOME_LABELS[classification] : BUDGET_REACHED_OUTCOME_LABEL,
      recordedAt: asString(row.recorded_at),
      resultSetRevisionId: row.result_set_revision_id === null ? null : asString(row.result_set_revision_id),
      safeNextAction: asString(record.safeNextAction),
      stop,
      report: report === null ? null : runReportProjection(report),
      reportAbsentReason: report === null ? PRE_RUN_REPORT_REASON : null,
    };
  }

  /**
   * The one place the kind-generic shape the store builds becomes the discriminated projection a
   * caller reads. Every member is already the member its kind declares — the kind, the contract
   * version, the Task mode, the declared stages, and the revision components all come from the
   * definition — and the union is discriminated on `kind`, which no other value in the shape can
   * contradict.
   */
  #asProjection(shape: AnalysisProjectionShape): AnalysisProjection {
    return shape as AnalysisProjection;
  }

  #available(bookId: string): AnalysisProjection {
    return this.#asProjection(this.#shape(bookId));
  }

  /** The `待开始` shape of this ledger's kind: the Book has no Task of it yet. */
  #shape(bookId: string): AnalysisProjectionShape {
    return {
      bookId,
      kind: this.#definition.kind,
      contractVersion: this.#definition.contractVersion,
      state: 'available',
      stateLabel: '待开始',
      taskIntent: null,
      checkpoint: null,
      manuscriptPin: null,
      artifactPin: null,
      runSourceScope: null,
      coverageManifest: null,
      providerResolutionPlan: null,
      executionPlan: null,
      planEnvelope: null,
      planVersion: null,
      planVersions: [],
      planRevisions: [],
      planRevision: null,
      authorization: null,
      run: null,
      resultSetRevision: null,
      taskOutcome: null,
      update: null,
      updateControls: null,
      history: null,
      inspectedRevision: null,
      actions: { canPrepare: true, canAuthorize: false, canReconfirmPlan: false },
      namedNonEffects: namedNonEffects(this.#launch.live),
    };
  }

  // ---- plan versions and revisions ---------------------------------------------------------------

  #planVersionFacts(taskIntentId: string): PlanVersionFacts[] {
    return (this.#db.prepare('SELECT * FROM analysis_plan_versions WHERE task_intent_id = ? ORDER BY ordinal').all(taskIntentId) as SqlRow[])
      .map((row) => this.#planVersionOfRow(row));
  }

  #planVersionOfRow(row: SqlRow): PlanVersionFacts {
    const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(record.planVersionId === row.plan_version_id && record.ordinal === row.ordinal && record.planEnvelopeDigest === row.plan_envelope_sha256,
      'ANALYSIS_RECORD_INVALID', '计划版本记录无效。');
    return {
      planVersionId: asString(row.plan_version_id),
      taskIntentId: asString(row.task_intent_id),
      ordinal: asNumber(row.ordinal),
      planRevisionId: row.plan_revision_id === null ? null : asString(row.plan_revision_id),
      planEnvelopeDigest: asString(row.plan_envelope_sha256),
      createdAt: asString(row.created_at),
    };
  }

  #planVersionByEnvelopeDigest(planEnvelopeDigest: string): PlanVersionFacts | undefined {
    const row = this.#db.prepare('SELECT * FROM analysis_plan_versions WHERE plan_envelope_sha256 = ?').get(planEnvelopeDigest) as SqlRow | undefined;
    return row === undefined ? undefined : this.#planVersionOfRow(row);
  }

  #envelopeDigestOfRun(runRecordId: string): string | undefined {
    const row = this.#db.prepare(
      `SELECT a.plan_envelope_sha256 FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    return row === undefined ? undefined : asString(row.plan_envelope_sha256);
  }

  /**
   * Every Plan Revision of a Task in detection order, each with how it was settled.
   *
   * The rows are append-only and their immutability triggers stand, so a settled revision is never
   * rewritten to say it is settled: the later row carries the fact and this read derives it (Issue
   * #281). A revision is `resolved` when a later plan version links back to it, `reverted` when it is
   * itself the way back to the inputs its prior version froze, `superseded` when a later revision on
   * the same prior version names it in `supersedes`, and `pending` only while none of the three holds
   * — which is what keeps an abandoned proposal from asking the editor to reconfirm it forever.
   */
  #planRevisionProjections(taskIntentId: string, versions: ReadonlyArray<PlanVersionFacts>): BaselineAnalysisPlanRevisionProjection[] {
    const rows = this.#db.prepare('SELECT * FROM analysis_plan_revisions WHERE task_intent_id = ? ORDER BY rowid').all(taskIntentId) as SqlRow[];
    const parsed = rows.map((row) => {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      const planRevisionId = asString(row.plan_revision_id);
      requireAnalysis(record.planRevisionId === planRevisionId && Array.isArray(record.diff) && isRecord(record.proposed), 'ANALYSIS_RECORD_INVALID', '计划修订记录无效。');
      const supersedes = record.supersedes === undefined ? [] : record.supersedes;
      requireAnalysis(Array.isArray(supersedes) && supersedes.every((entry) => typeof entry === 'string') &&
        (record.revert === undefined || record.revert === true), 'ANALYSIS_RECORD_INVALID', '计划修订记录无效。');
      return { row, record, planRevisionId, supersedes: supersedes as string[], revert: record.revert === true };
    });
    const settledByLater = new Set(parsed.flatMap((entry) => entry.supersedes));
    return parsed.map(({ row, record, planRevisionId, supersedes, revert }) => {
      const diff = record.diff as PlanRevisionDiffEntryProjection[];
      const changedFields = diff.map((entry) => entry.field);
      const resolvedBy = versions.find((entry) => entry.planRevisionId === planRevisionId);
      const priorOrdinal = asNumber(row.prior_ordinal);
      const state: PlanRevisionState = resolvedBy !== undefined ? 'resolved'
        : revert ? 'reverted'
          : settledByLater.has(planRevisionId) ? 'superseded' : 'pending';
      const nextOrdinal = resolvedBy?.ordinal ?? (revert ? priorOrdinal : null);
      return {
        planRevisionId,
        priorPlanVersionId: asString(row.prior_plan_version_id),
        priorOrdinal,
        nextOrdinal,
        trigger: asString(row.trigger_kind) as 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit',
        detectedAt: asString(row.detected_at),
        changedFields,
        diff,
        proposed: record.proposed as unknown as MaterialPlanInputsProjection,
        state,
        supersedes,
        resolved: state !== 'pending',
        label: planRevisionLabel(priorOrdinal, nextOrdinal, changedFields, state),
      };
    });
  }

  /**
   * The material plan inputs a plan prepared **now** would freeze: the Main Editorial Role connection
   * (provider, model, adapter and configuration revisions, Credential Reference — never its readiness),
   * the highest pinned authority sidecar with its native carrier, the range the caller names, the
   * Book's latest Result Set Revision for an update Task, the launch's ceiling, and the outbound
   * category and expected outcome class this kind's plan builder and definition would declare. Read
   * leniently so a drifted pin or binding yields a diff rather than a refusal. The unit count is the
   * frozen Coverage Manifest's, so the policy's per-frozen-unit default resolves to the same total the
   * freeze wrote.
   *
   * This is the live half of the comparison; the frozen half is read from the plan components and the
   * Task Intent record (Issue #281). The two halves therefore differ whenever durable state moved —
   * a re-bound ceiling, a re-pinned sidecar, a contract that now promises another outcome class —
   * which is exactly when ADR 0009 suspends the plan for a Plan Revision.
   */
  #currentMaterialInputs(
    bookId: string,
    mode: AnalysisTaskMode,
    selectedRange: BaselineAnalysisSelectedRange | null,
    unitCount: number,
    /**
     * The ceiling the plan version's own edit sets (Issue #51, S16a): the editor's, which is the plan's to hold and never
     * a drift of it. The launch sets none outside developer-live, where the launch's is the one there is.
     */
    editorCeiling: RunBudgetCeilingState = 'unset',
  ): MaterialPlanInputsProjection {
    const connection = this.#db.prepare(
      `SELECT provider_id, model_id, adapter_revision, configuration_revision, credential_reference
       FROM model_service_connections WHERE connection_id = 'main-editorial-deepseek-v4-pro'`,
    ).get() as SqlRow | undefined;
    requireAnalysis(connection !== undefined, 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    // Drift is a comparison of like with like: the re-derivation must name the binding this launch
    // binds, exactly as the freeze did. Under developer-live that is the live route, its development
    // Credential Reference, and the launch form's ceiling — not the production connection row, whose
    // binding this scope never uses. Otherwise every developer-live plan would look drifted at once.
    const live = this.#launch.live;
    const pin = this.#db.prepare(
      `SELECT pin.native_artifact_id, pin.sidecar_revision, pin.sidecar_sha256, installation.artifact_version, installation.content_sha256
       FROM editorial_workspace_profile_book_pins pin
       JOIN native_artifact_installations installation ON installation.artifact_id = pin.native_artifact_id
       WHERE pin.book_id = ? AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       ORDER BY pin.sidecar_revision DESC LIMIT 1`,
    ).get(bookId) as SqlRow | undefined;
    requireAnalysis(pin !== undefined, 'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案。');
    const latest = this.#isInitial(mode) ? undefined : this.#revisionRows(bookId).at(-1);
    return {
      providerBinding: live === null
        ? {
            providerId: asString(connection.provider_id),
            modelId: asString(connection.model_id),
            adapterRevision: asNumber(connection.adapter_revision),
            configurationRevision: asNumber(connection.configuration_revision),
            credentialReference: asString(connection.credential_reference),
          }
        : {
            providerId: live.route,
            modelId: live.model,
            adapterRevision: 1,
            configurationRevision: 1,
            credentialReference: live.credentialReference,
          },
      artifactPin: {
        identity: asString(pin.native_artifact_id),
        version: asString(pin.artifact_version),
        nativeCarrierSha256: asString(pin.content_sha256),
        sidecarRevision: asNumber(pin.sidecar_revision),
        sidecarSha256: asString(pin.sidecar_sha256),
      },
      selectedRange: this.#definition.mode(mode).rangeBound ? selectedRange : null,
      predecessorRevision: latest === undefined ? null : { revisionId: asString(latest.revision_id), ordinal: asNumber(latest.ordinal), digest: asString(latest.sha256) },
      runBudgetCeiling: live === null ? editorCeiling : resolveDeveloperLiveCeiling(live.runBudgetCeiling, unitCount),
      outboundDataCategory: 'public-or-synthetic',
      expectedOutcome: this.#definition.expectedOutcome,
    };
  }

  /**
   * The facts a 默认执行规则 binds, as the Book's durable state reads now (Issue #421): the re-derivation Reconnect
   * Preflight compares a waiting Run's plan with, for an update of the whole Book. No rule is ever used under
   * developer-live (Provider Processing v5 to v7: `matchingActiveDefaultExecutionRuleAllowed: false`), so this is
   * read only outside it, where the ceiling depends on no unit count.
   */
  currentRuleFacts(bookId: string, mode: AnalysisTaskMode): MaterialPlanInputsProjection {
    requireAnalysis(UUID_PATTERN.test(bookId) && this.#launch.live === null && !this.#definition.mode(mode).rangeBound,
      'ANALYSIS_RULE_FACTS_INVALID', '无法读取默认执行规则所需的当前事实。');
    return this.#currentMaterialInputs(bookId, mode, null, 0);
  }

  /** The reuse-plan counts a version would derive for the given range against the latest revision; `null` for a mode that carries no plan. */
  #reusePlanCountsFor(bookId: string, mode: AnalysisTaskMode, manifest: CoverageManifestProjection, selectedRange: BaselineAnalysisSelectedRange | null): AnalysisReusePlanCounts | null {
    if (!this.#carriesPlan(mode)) return null;
    const latestRow = this.#isInitial(mode) ? undefined : this.#revisionRows(bookId).at(-1);
    if (latestRow === undefined && !this.#isInitial(mode)) return null;
    return this.#derivePlan(
      mode,
      this.#definition.mode(mode).rangeBound ? selectedRange : null,
      manifest,
      latestRow === undefined ? null : this.#planPredecessor(latestRow),
    ).counts;
  }

  /**
   * One immutable Plan Revision row. `supersedes` names the pending revisions on the same prior
   * version this one settles and `revert` marks the way back to the frozen inputs; both are omitted
   * when they do not apply, so an ordinary drift row keeps exactly the canonical bytes it has always
   * had and no existing row is touched to record either fact (Issue #281).
   */
  #insertPlanRevision(input: {
    taskIntentId: string;
    prior: PlanVersionFacts;
    priorInputs: MaterialPlanInputsProjection;
    proposed: MaterialPlanInputsProjection;
    diff: ReadonlyArray<PlanRevisionDiffEntryProjection>;
    trigger: 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit';
    instant: string;
    supersedes?: ReadonlyArray<string>;
    revert?: true;
    /** Who made an edit (Issue #419, PLAN-011): the editor, recorded with the time. */
    actor?: 'editor';
  }): string {
    const planRevisionId = randomUUID();
    const supersedes = input.supersedes === undefined || input.supersedes.length === 0 ? undefined : [...input.supersedes];
    const record = canonicalRecord({
      planRevisionId,
      taskIntentId: input.taskIntentId,
      priorPlanVersionId: input.prior.planVersionId,
      priorOrdinal: input.prior.ordinal,
      trigger: input.trigger,
      detectedAt: input.instant,
      prior: input.priorInputs,
      proposed: input.proposed,
      diff: input.diff,
      supersedes,
      revert: input.revert,
      actor: input.actor,
    });
    this.#db.prepare(
      `INSERT INTO analysis_plan_revisions(plan_revision_id, task_intent_id, prior_plan_version_id, prior_ordinal, trigger_kind, detected_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(planRevisionId, input.taskIntentId, input.prior.planVersionId, input.prior.ordinal, input.trigger, input.instant, record.json, record.digest);
    return planRevisionId;
  }

  /**
   * A prepared, unauthorized Task prepared again (Issue #48). The same material inputs return the
   * frozen plan. Different inputs — a different `重新分析所选范围` range, or durable-state drift of the
   * Provider Binding, artifact pin, ceiling, category, or outcome — record one pending Plan Revision
   * with its field-level diff and the derived reuse-plan counts; the prepared version is thereby
   * superseded and cannot be authorized. `重新确认计划` (`reconfirm`) resolves the pending revision — or
   * records the live drift as one — and writes the next plan version on the same Task Intent.
   *
   * There is also a way back (Issue #281). Proposing the inputs the frozen version already holds — by
   * preparing again at them, or by reconfirming while they stand — records the revert as its own
   * append-only revision, settles the pending one, and restores the start action on the version that
   * was never replaced. No plan version is written for a revert: its envelope would repeat the frozen
   * one, and a plan version's envelope digest is unique. A second differing proposal settles the first
   * the same way, so at most one revision is ever pending on a version.
   */
  #revisePreparedPlan(
    bookId: string,
    intent: IntentFacts,
    existing: AnalysisProjection,
    requestedRange: BaselineAnalysisSelectedRange | null,
    reconfirm: boolean,
  ): AnalysisProjection {
    const current = this.#planVersionFacts(intent.taskIntentId).at(-1);
    requireAnalysis(current !== undefined && existing.planVersion !== null && existing.coverageManifest !== null, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const stored = existing.planVersion.materialInputs;
    const pending = existing.planRevision;
    const instant = new Date().toISOString();
    const manifest = existing.coverageManifest;
    const proposed = this.#currentMaterialInputs(bookId, intent.mode, requestedRange, manifest.units.length,
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal)));
    const storedCounts = existing.update?.reusePlan?.counts ?? null;
    const countsFor = (inputs: MaterialPlanInputsProjection): AnalysisReusePlanCounts | null =>
      this.#reusePlanCountsFor(bookId, intent.mode, manifest, inputs.selectedRange);
    const withDerived = (
      entries: PlanRevisionDiffEntryProjection[],
      priorCounts: AnalysisReusePlanCounts | null,
      proposedCounts: AnalysisReusePlanCounts | null,
    ): PlanRevisionDiffEntryProjection[] => {
      const derived = priorCounts === null || proposedCounts === null ? null : reusePlanCountsDiffEntry(priorCounts, proposedCounts);
      return derived === null ? entries : [...entries, derived];
    };
    const diffFor = (): PlanRevisionDiffEntryProjection[] =>
      withDerived(diffMaterialPlanInputs(stored, proposed), storedCounts, countsFor(proposed));
    // The pending revisions this proposal settles: every one still waiting on the frozen version.
    const pendingIds = existing.planRevisions
      .filter((entry) => entry.state === 'pending' && entry.planRevisionId !== null && entry.priorPlanVersionId === current.planVersionId)
      .map((entry) => entry.planRevisionId!);
    // The way back: the proposal restates the frozen version's own inputs while a revision is pending.
    // The record reads from the abandoned proposal back to what stands, which is what the editor sees.
    const insertRevert = (trigger: 'prepare' | 'reconfirm'): void => {
      const abandoned = pending!.proposed;
      const diff = withDerived(diffMaterialPlanInputs(abandoned, proposed), countsFor(abandoned), storedCounts);
      transact(this.#db, () => this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: abandoned, proposed, diff, trigger, instant, supersedes: pendingIds, revert: true,
      }));
    };
    if (!reconfirm) {
      if (sameMaterialPlanInputs(stored, proposed)) {
        if (pending === null || pendingIds.length === 0) return existing;
        insertRevert('prepare');
        return this.inspect(bookId);
      }
      if (pending !== null && pending.planRevisionId !== null && sameMaterialPlanInputs(pending.proposed, proposed)) return existing;
      const diff = diffFor();
      requireAnalysis(!diff.some((entry) => entry.field === 'predecessorRevision'), 'ANALYSIS_PREDECESSOR_DRIFT',
        '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
      transact(this.#db, () => this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff, trigger: 'prepare', instant, supersedes: pendingIds,
      }));
      return this.inspect(bookId);
    }
    requireAnalysis(pending !== null, 'ANALYSIS_PLAN_REVISION_ABSENT', '当前计划没有待重新确认的计划修订。');
    requireAnalysis(existing.actions.canReconfirmPlan, 'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
    if (pendingIds.length > 0 && sameMaterialPlanInputs(stored, proposed)) {
      insertRevert('reconfirm');
      return this.inspect(bookId);
    }
    requireAnalysis(sameMaterialPlanInputs(pending.proposed, proposed), 'ANALYSIS_PLAN_REVISION_STALE', '计划修订已过期；请重新查看计划修订后再确认。');
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const checkpoint: ManuscriptCheckpointBinding = {
      bookId,
      manuscriptId: asString(checkpointRow.manuscript_id),
      branchId: asString(checkpointRow.branch_id),
      revisionId: asString(checkpointRow.revision_id),
      revisionLabel: asString(checkpointRow.revision_label),
      revisionDigest: asString(checkpointRow.revision_digest),
      journalSequence: asNumber(checkpointRow.journal_sequence),
      createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
    };
    transact(this.#db, () => {
      // A live drift has no stored row yet: recording it here names `inspect`, the read that detected
      // it, rather than the reconfirmation that is settling it (Issue #281).
      const planRevisionId = pending.planRevisionId ??
        this.#insertPlanRevision({ taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff: diffFor(), trigger: 'inspect', instant });
      this.#writePlanVersion({
        intent,
        checkpoint,
        checkpointDigest: asString(checkpointRow.sha256),
        ordinal: current.ordinal + 1,
        selectedRange: proposed.selectedRange,
        planRevisionId,
        instant,
        // What the editor left out stays out: the new version answers the key-content change, not the edit.
        edits: this.#planEditsOf(intent.taskIntentId, current.ordinal),
      });
    });
    return this.inspect(bookId);
  }

  /** What one plan version leaves out at the editor's word (Issue #419), read from its frozen execution plan. */
  #planEditsOf(taskIntentId: string, ordinal: number): PlanEdits {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'execution-plan'",
    ).get(taskIntentId, ordinal) as SqlRow | undefined;
    if (row === undefined) return NO_PLAN_EDITS;
    try {
      return planEditsOf(parseCanonicalJson(asString(row.canonical_json)));
    } catch {
      throw new AnalysisError('ANALYSIS_RECORD_INVALID', '计划记录的修改无效。');
    }
  }

  /**
   * 更新计划 (Issue #419, plan slice S73; V2-UX-PLAN-009, PLAN-011): the plan the editor sees, as they left it, becomes
   * the next plan version of the same Task Intent. `edits` is the full set of what the plan leaves out — only what its
   * Run honours — against the version whose envelope digest the editor was reading. One transaction records the Plan
   * Revision, whose trigger is `plan-edit`, whose diff names each changed item as `edited`, and which carries the
   * editor as its actor with the time, and writes the version it yields. The material inputs are the prior version's.
   *
   * Nothing is recorded when the Task has been authorized, a key-content change is pending (重新确认计划 settles it
   * first; the editor's pending edits are theirs to apply after), the editor was reading another version, the edit
   * names what the plan cannot leave out, or nothing changed. An edit changes the execution plan and the envelope
   * only — and, when it sets the Run Budget Ceiling (Issue #51, S16a), that one field of the Provider Resolution Plan: a
   * version whose other components would differ — the route or the fixture this launch binds has moved since the plan
   * froze — is refused rather than written. Under developer-live the launch sets the ceiling, so no edit does.
   */
  editPlan(
    bookId: string,
    input: {
      taskIntentId: string;
      planEnvelopeDigest: string;
      removedSteps: unknown;
      disallowedAdaptations: unknown;
      askFirstAdaptations?: unknown;
      runBudgetCeiling?: unknown;
    },
  ): AnalysisProjection {
    requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND, 'ANALYSIS_PLAN_EDIT_UNSUPPORTED', '这类任务的计划不能在这里修改。');
    const existing = this.inspect(bookId);
    const intentRow = this.#latestIntentRow(bookId);
    requireAnalysis(intentRow !== undefined && existing.taskIntent !== null && existing.taskIntent.taskIntentId === input.taskIntentId,
      'ANALYSIS_PLAN_EDIT_STALE', '这项任务已不是这本书当前的任务；请重新打开它的计划。');
    const intent = this.#intentFacts(intentRow);
    requireAnalysis(existing.authorization === null && existing.state === 'prepared',
      'ANALYSIS_PLAN_EDIT_STARTED', '任务已经开始，计划不能再改。');
    requireAnalysis(existing.planRevision === null, 'ANALYSIS_PLAN_REVISION_PENDING', '计划的关键内容已变化：先重新确认计划，你的改动会保留。');
    requireAnalysis(existing.planEnvelope !== null && existing.planEnvelope.digest === input.planEnvelopeDigest && existing.planVersion !== null,
      'ANALYSIS_PLAN_EDIT_STALE', '计划已经变了；请重新查看计划后再修改。');
    const next = canonicalPlanEdits(input);
    requireAnalysis(next !== null, 'ANALYSIS_PLAN_EDIT_INVALID', '这项修改不在这份计划可以改的范围内。');
    requireAnalysis(this.#launch.live === null || next.runBudgetCeiling === undefined, 'ANALYSIS_PLAN_EDIT_INVALID', PLAN_CEILING_LAUNCH_REASON);
    const current = this.#planVersionFacts(intent.taskIntentId).at(-1);
    requireAnalysis(current !== undefined && current.ordinal === existing.planVersion.ordinal, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const prior = this.#planEditsOf(intent.taskIntentId, current.ordinal);
    const diff = planEditDiff(prior, next);
    requireAnalysis(diff.length > 0, 'ANALYSIS_PLAN_EDIT_UNCHANGED', '计划没有改动。');
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const checkpoint: ManuscriptCheckpointBinding = {
      bookId,
      manuscriptId: asString(checkpointRow.manuscript_id),
      branchId: asString(checkpointRow.branch_id),
      revisionId: asString(checkpointRow.revision_id),
      revisionLabel: asString(checkpointRow.revision_label),
      revisionDigest: asString(checkpointRow.revision_digest),
      journalSequence: asNumber(checkpointRow.journal_sequence),
      createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
    };
    const stored = existing.planVersion.materialInputs;
    // The connection's credential readiness is not key content: it may change after the plan froze, and the version an
    // edit writes keeps the one the edited version froze, so only the execution plan and the envelope differ.
    const priorProvider = this.#planRecords(intent.taskIntentId, intent.mode, current.ordinal)['provider-resolution-plan'] as
      { remoteBinding: { credentialReadiness: ModelCredentialOperationState } };
    // The ceiling is a material input: the version this edit yields proposes the editor's (Issue #51, S16a).
    const proposed: MaterialPlanInputsProjection = { ...stored, runBudgetCeiling: this.#launch.live === null ? planEditCeiling(next) : stored.runBudgetCeiling };
    const ceilingMoved = canonicalJson(stored.runBudgetCeiling) !== canonicalJson(proposed.runBudgetCeiling);
    const instant = new Date().toISOString();
    transact(this.#db, () => {
      const planRevisionId = this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff, trigger: 'plan-edit', instant, actor: 'editor',
      });
      this.#writePlanVersion({
        intent,
        checkpoint,
        checkpointDigest: asString(checkpointRow.sha256),
        ordinal: current.ordinal + 1,
        selectedRange: stored.selectedRange,
        planRevisionId,
        instant,
        edits: next,
        credentialReadiness: priorProvider.remoteBinding.credentialReadiness,
      });
      const before = this.#planDigests(intent.taskIntentId, current.ordinal);
      const after = this.#planDigests(intent.taskIntentId, current.ordinal + 1);
      // A ceiling the editor moved moves the Provider Resolution Plan too — in that one field, and nothing else.
      const providerMoved = ceilingMoved && !this.#providerPlansDifferOnlyInCeiling(intent.taskIntentId, current.ordinal);
      const moved = Object.keys({ ...before, ...after }).filter((component) =>
        component !== 'execution-plan' && component !== 'plan-envelope' && before[component] !== after[component] &&
        (component !== 'provider-resolution-plan' || !ceilingMoved || providerMoved));
      requireAnalysis(moved.length === 0, 'ANALYSIS_PLAN_EDIT_STALE', '这份计划准备之后，执行它的路由或所用工序已经变了；请重新准备这项任务再修改。');
    });
    return this.inspect(bookId);
  }

  /**
   * The Book's latest Task **of this ledger's kind**. The kind filter is what lets a Book hold both
   * kinds at once: without it the factual Task a Book gained would be handed to the baseline
   * projection, which would then read a plan frozen under a contract it does not speak.
   */
  #latestIntentRow(bookId: string): SqlRow | undefined {
    return this.#db.prepare(
      'SELECT * FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
  }

  /** A mode that starts a Result Set rather than updating one; the kind's definition decides which. */
  #isInitial(mode: AnalysisTaskMode): boolean {
    return this.#definition.mode(mode).initial;
  }

  /**
   * A mode whose Task freezes a `reuse-plan` component: every update mode, and a range-bound first
   * mode (Issue #417), whose plan has no predecessor and says which units are read and which are left
   * unreviewed. Only a whole first Task carries none — it reads every unit, and there is nothing to plan.
   */
  #carriesPlan(mode: AnalysisTaskMode): boolean {
    const definition = this.#definition.mode(mode);
    return !definition.initial || definition.rangeBound;
  }

  /**
   * Derive the plan of one mode over one manifest. Which derivation is the kind's to say: a kind that
   * leaves out-of-scope units unreviewed gets the scope plan, and the baseline kind gets the reuse plan
   * it has always had, from the same untouched function and therefore with the same bytes.
   */
  #derivePlan(
    mode: AnalysisTaskMode,
    selectedRange: BaselineAnalysisSelectedRange | null,
    manifest: CoverageManifestProjection,
    predecessor: ReusePlanPredecessor | ScopePlanPredecessor | null,
  ): AnalysisPlanRecord {
    if (this.#definition.outOfScope === 'leave-unreviewed') {
      requireAnalysis(predecessor === null || 'schemaDigest' in predecessor, 'ANALYSIS_RECORD_INVALID', '前一修订版缺少审阅范围计划所需的事实。');
      return deriveScopePlan({
        kind: this.#definition.kind,
        contractVersion: this.#definition.contractVersion,
        schemaDigest: this.#definition.schemaDigest,
        mode,
        recompute: this.#definition.mode(mode).recompute,
        selectedRange,
        manifest,
        predecessor: predecessor as ScopePlanPredecessor | null,
      });
    }
    requireAnalysis(predecessor !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    return deriveReusePlan({ mode: mode as BaselineAnalysisUpdateMode, selectedRange, manifest, predecessor });
  }

  /** The counts a whole first Task's revision states: every unit read, none reused. */
  #wholeFirstCounts(unitCount: number): AnalysisReusePlanCounts | ReviewScopePlanCounts {
    const counts = firstBaselineCounts(unitCount);
    return this.#definition.outOfScope === 'leave-unreviewed' ? { ...counts, unreviewed: 0 } : counts;
  }

  #intentFacts(row: SqlRow): IntentFacts {
    const mode = asString(row.mode) as AnalysisTaskMode;
    const goal = asString(row.goal);
    requireAnalysis(goal === this.#definition.mode(mode).goal, 'ANALYSIS_RECORD_INVALID', '任务意图的目标与更新方式不一致。');
    const record = parseCanonicalJson(asString(row.canonical_json));
    requireAnalysis(isRecord(record) && record.taskIntentId === row.task_intent_id && typeof record.expectedOutcome === 'string' &&
      (record.redoOfRunRecordId === undefined || (typeof record.redoOfRunRecordId === 'string' && UUID_PATTERN.test(record.redoOfRunRecordId))),
    'ANALYSIS_RECORD_INVALID', '任务意图记录无效。');
    const start = row.selected_start_position;
    const end = row.selected_end_position;
    return {
      taskIntentId: asString(row.task_intent_id),
      bookId: asString(row.book_id),
      mode,
      goal,
      createdAt: asString(row.created_at),
      predecessorRevisionId: row.predecessor_revision_id === null ? null : asString(row.predecessor_revision_id),
      selectedRange: start === null || end === null ? null : { startPosition: asNumber(start), endPosition: asNumber(end) },
      record,
      expectedOutcome: record.expectedOutcome,
      redoOfRunRecordId: record.redoOfRunRecordId === undefined ? null : record.redoOfRunRecordId as string,
    };
  }

  /** The Task the Run a redo names belongs to (Issue #422, S76c); refused when the record is not there. */
  #redoneTaskIntentId(runRecordId: string): string {
    const row = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '改计划重做所接续的运行记录缺失。');
    return asString(row.task_intent_id);
  }

  /**
   * What a redo's first plan version leaves out (Issue #422, S76c; CONT-013: a redo begins from a copyable prior plan):
   * the edits of the redone Task's last plan version; nothing for any other Task.
   */
  #redoPlanEdits(intent: IntentFacts): PlanEdits {
    if (intent.redoOfRunRecordId === null) return NO_PLAN_EDITS;
    const prior = this.#redoneTaskIntentId(intent.redoOfRunRecordId);
    const last = this.#planVersionFacts(prior).at(-1);
    return last === undefined ? NO_PLAN_EDITS : this.#planEditsOf(prior, last.ordinal);
  }

  /** The frozen plan components of one plan version of a Task; an update Task must also carry its `reuse-plan`. */
  #planRecords(taskIntentId: string, mode: AnalysisTaskMode | 'any', planVersion: number): Record<string, unknown> {
    const rows = this.#db.prepare('SELECT component, canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(taskIntentId, planVersion) as SqlRow[];
    const records: Record<string, unknown> = {};
    for (const row of rows) records[asString(row.component)] = parseCanonicalJson(asString(row.canonical_json));
    const required = ['manuscript-pin', 'artifact-pin', 'run-source-scope', 'coverage-manifest', 'provider-resolution-plan', 'execution-plan', 'plan-envelope'];
    if (mode !== 'any' && this.#carriesPlan(mode)) required.push('reuse-plan');
    for (const component of required) {
      requireAnalysis(records[component] !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
    }
    return records;
  }

  #planDigests(taskIntentId: string, planVersion: number): Record<string, string> {
    return Object.fromEntries((this.#db.prepare('SELECT component, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(taskIntentId, planVersion) as SqlRow[])
      .map((row) => [asString(row.component), asString(row.sha256)]));
  }

  /** Whether one version's Provider Resolution Plan and the next differ in the Run Budget Ceiling alone (Issue #51, S16a). */
  #providerPlansDifferOnlyInCeiling(taskIntentId: string, priorOrdinal: number): boolean {
    const sansCeiling = (ordinal: number): string => {
      const row = this.#db.prepare(
        "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'provider-resolution-plan'",
      ).get(taskIntentId, ordinal) as SqlRow | undefined;
      requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      const record = parseCanonicalJson(asString(row.canonical_json));
      requireAnalysis(isRecord(record), 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      return canonicalJson({ ...record, runBudgetCeiling: null });
    };
    return sansCeiling(priorOrdinal) === sansCeiling(priorOrdinal + 1);
  }

  #runProjection(runRecord: SqlRow, progress: ProgressReader): NonNullable<BaselineAnalysisProjection['run']> {
    const runRecordId = asString(runRecord.run_record_id);
    const states = this.#db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runRecordId) as SqlRow[];
    requireAnalysis(states.length >= 1, 'ANALYSIS_RECORD_INVALID', '运行记录缺少状态转换。');
    const transitions = states.map((row) => {
      const detail = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      return {
        sequence: asNumber(row.sequence),
        state: asString(row.state) as BaselineAnalysisRunState,
        recordedAt: asString(row.recorded_at),
        detail: typeof detail.detail === 'string' ? detail.detail : null,
      };
    });
    const current = transitions[transitions.length - 1]!;
    // A blocked Run states the reasons its own state transition recorded, not the reasons the launch
    // running right now would state: a Run blocked under development-ci keeps that reading forever,
    // exactly as a Result Set Revision keeps its own policy pin. Only a record written before those
    // reasons were durable falls back to the bound launch.
    const currentRecord = parseCanonicalJson(asString(states[states.length - 1]!.canonical_json)) as Record<string, unknown>;
    const recordedReasons = Array.isArray(currentRecord.reasons) && currentRecord.reasons.every((reason) => typeof reason === 'string')
      ? currentRecord.reasons as ReadonlyArray<string>
      : null;
    const attemptRow = this.#db.prepare('SELECT * FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    let attempt: NonNullable<BaselineAnalysisProjection['run']>['attempt'] = null;
    if (attemptRow !== undefined) {
      const attemptId = asString(attemptRow.attempt_id);
      const attemptJson = parseCanonicalJson(asString(attemptRow.canonical_json)) as Record<string, unknown>;
      const check = attemptJson.credentialReadinessCheck as { slot: CredentialSlotId; readiness: 'present' | 'missing' };
      const bindingRow = this.#db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
      const spans = (this.#db.prepare('SELECT * FROM analysis_harness_spans WHERE attempt_id = ? ORDER BY ordinal').all(attemptId) as SqlRow[]).map((row) => {
        const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
        return {
          ordinal: asNumber(row.ordinal),
          harnessSessionId: asString(row.harness_session_id),
          startSeq: asNumber(row.start_seq),
          endSeq: asNumber(row.end_seq),
          unitOrdinal: row.unit_ordinal === null ? null : asNumber(row.unit_ordinal),
          attemptIndex: typeof record.attemptIndex === 'number' ? record.attemptIndex : 1,
          payloadDigest: typeof record.payloadDigest === 'string' ? record.payloadDigest : null,
        };
      });
      attempt = {
        attemptId,
        ordinal: 1,
        startedAt: asString(attemptRow.started_at),
        credentialReadinessCheck: { slot: check.slot, readiness: check.readiness, valueReleased: false },
        executionBinding: bindingRow === undefined ? null : this.#bindingProjection(bindingRow),
        spans,
      };
    }
    const adaptations = this.adaptationsOf(runRecordId);
    // The liveness signal's fifth fact: when this Run last changed state. The execution owner cannot
    // hold it — it is the ledger's transition, read here already — so the projection composes it onto
    // the four facts the owner does hold. A Run with no owner in flight keeps today's `null`.
    // A Run stopping at the editor's cancellation is still in flight: its signal is read until it has stopped.
    const live = current.state === 'admitted' || current.state === 'executing' || current.state === 'cancelling' || current.state === 'pausing'
      ? progress(runRecordId)
      : null;
    // Why a Run blocked before dispatch never ran (Issue #536): only Reconnect Preflight records `plan-moved`.
    const blockedBy = current.state === 'blocked-before-dispatch' ? (currentRecord.cause === 'plan-moved' ? 'plan-moved' : 'launch') : null;
    return {
      runRecordId,
      state: current.state,
      stateLabel: current.state === 'cancelled' && runBegan(transitions) ? RUN_CANCELLED_AFTER_START_LABEL
        : current.state === 'interrupted' && this.#runStop(runRecordId) !== null ? BUDGET_REACHED_RUN_LABEL
          : current.state === 'resumable' && this.accountLimitOf(runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL
            : blockedBy === 'plan-moved' ? PLAN_MOVED_LABEL : RUN_STATE_LABELS[current.state],
      recordedAt: asString(runRecord.recorded_at),
      transitions,
      adaptations,
      blockedReasons: current.state === 'blocked-before-dispatch' ? recordedReasons ?? blockedReasons(this.#launch.live) : null,
      blockedBy,
      progress: live === null ? null : { ...live, lastTransitionAt: current.recordedAt },
      attempt,
    };
  }

  #bindingProjection(row: SqlRow): BaselineAnalysisExecutionBindingProjection {
    const binding = parseCanonicalJson(asString(row.canonical_json)) as ExecutionBindingRecord;
    return {
      attemptId: binding.attemptId,
      bindingDigest: asString(row.sha256),
      harnessSessionId: binding.harnessSessionId,
      behaviorCompositionDigest: binding.behaviorCompositionDigest,
      promptContractDigest: binding.promptContractDigest,
      planEnvelopeDigest: binding.planEnvelopeDigest,
      runSourceScopeDigest: binding.runSourceScopeDigest,
      providerResolutionPlanDigest: binding.providerResolutionPlanDigest,
      coverageManifestDigest: binding.coverageManifestDigest,
      route: binding.route,
      model: binding.model,
      fixtureIdentity: binding.adapterPin?.fixtureIdentity ?? null,
      fixtureSha256: binding.adapterPin?.fixtureSha256 ?? null,
      nativeCarrierSha256: binding.nativeArtifact.nativeCarrierSha256,
      sidecarRevision: 2,
      boundAt: binding.boundAt,
    };
  }

  // ---- revisions and history ---------------------------------------------------------------------

  #revisionRows(bookId: string): SqlRow[] {
    return this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal`,
    ).all(bookId, this.#definition.kind) as SqlRow[];
  }

  #revisionBody(row: SqlRow): Record<string, unknown> {
    const body = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(body.schema === this.#definition.revisionSchema || body.schema === this.#definition.successorRevisionSchema,
      'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    return body;
  }

  /** The `update` facts of a revision body; an initial-mode body carries none and is synthesized. */
  #revisionUpdate(body: Record<string, unknown>, unitCount: number): BaselineAnalysisRevisionUpdateProjection {
    const initial = this.#definition.initialMode;
    if (!isRecord(body.update)) {
      return {
        mode: initial as BaselineAnalysisRevisionUpdateProjection['mode'],
        modeLabel: this.#definition.mode(initial).label,
        predecessor: null,
        reusePlanDigest: null,
        selectedRange: null,
        counts: this.#wholeFirstCounts(unitCount),
      };
    }
    const update = body.update as Omit<BaselineAnalysisRevisionUpdateProjection, 'modeLabel'>;
    return { ...update, modeLabel: this.#definition.mode(update.mode).label };
  }

  #unitLineage(unit: Record<string, unknown>): AnalysisUnitLineage {
    return isRecord(unit.lineage) ? unit.lineage as AnalysisUnitLineage : { kind: 'recomputed' };
  }

  #revisionProjection(row: SqlRow, latestOrdinal: number): BaselineAnalysisResultSetRevisionProjection {
    const body = this.#revisionBody(row);
    const revisionId = asString(row.revision_id);
    const ordinal = asNumber(row.ordinal);
    const units = (this.#db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => {
        const record = parseCanonicalJson(asString(unit.canonical_json)) as Record<string, unknown>;
        return { ...record, lineage: this.#unitLineage(record) } as BaselineAnalysisUnitProjection;
      });
    const manuscriptPin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
    // The shared components are read the same way for every kind; the kind's own components — the
    // baseline's sections and synthesis, the factual kind's findings and excluded appendix — are read
    // back by its definition, so this projection never needs to know which kind it is serving.
    return {
      ...this.#definition.revisionComponents(body),
      resultSetId: asString(row.result_set_id),
      revisionId,
      ordinal,
      createdAt: asString(row.created_at),
      digest: asString(row.sha256),
      contractVersion: this.#definition.contractVersion,
      manuscriptPin,
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      schemaDigest: asString(body.schemaDigest),
      reducerDigest: asString(body.reducerDigest),
      adapterPin: body.adapterPin as BaselineAnalysisResultSetRevisionProjection['adapterPin'],
      bindingPin: body.bindingPin as BaselineAnalysisResultSetRevisionProjection['bindingPin'],
      policyPin: body.policyPin as BaselineAnalysisResultSetRevisionProjection['policyPin'],
      provenance: body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'],
      usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
      update: this.#revisionUpdate(body, units.length),
      lineage: units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      coverage: { ...coverage, unitsReused: typeof coverage.unitsReused === 'number' ? coverage.unitsReused : 0 },
      reducerClosure: body.reducerClosure as BaselineAnalysisResultSetRevisionProjection['reducerClosure'],
      freshness: this.#freshness(manuscriptPin, ordinal < latestOrdinal),
      assurance: body.assurance as BaselineAnalysisResultSetRevisionProjection['assurance'],
      gaps: body.gaps as BaselineAnalysisResultSetRevisionProjection['gaps'],
      units,
      // The kind's own components complete the shape; which they are is the definition's to know.
    } as unknown as BaselineAnalysisResultSetRevisionProjection;
  }

  #inspectedRevision(rows: SqlRow[], revisionId: string, latestOrdinal: number): NonNullable<BaselineAnalysisProjection['inspectedRevision']> {
    const row = rows.find((candidate) => candidate.revision_id === revisionId);
    requireAnalysis(row !== undefined, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
    const revision = this.#revisionProjection(row, latestOrdinal);
    return { revision, current: revision.ordinal === latestOrdinal, readOnly: true };
  }

  /**
   * Exact-revision freshness through local deterministic comparison against the current branch
   * head. A superseded (non-latest) revision keeps its original pin and is never current.
   */
  #freshness(pin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin'], superseded: boolean): AnalysisFreshnessAxis {
    const head = this.#workingHead(pin.manuscriptId, pin.bookId);
    const current = !superseded && head.currentRevisionId === pin.revisionId && head.currentWorkingDigest === pin.revisionDigest;
    return {
      axis: 'freshness',
      state: superseded ? 'superseded' : current ? 'current' : 'stale',
      label: superseded
        ? `精确修订版新鲜度：已被后续修订版取代 · 绑定 ${pin.revisionLabel}`
        : current
          ? `精确修订版新鲜度：当前 · 绑定 ${pin.revisionLabel}`
          : `精确修订版新鲜度：已过期 · 绑定 ${pin.revisionLabel}，稿件已有后续已确认编辑`,
      boundRevisionId: pin.revisionId,
      boundRevisionDigest: pin.revisionDigest,
      currentRevisionId: head.currentRevisionId,
      currentWorkingDigest: head.currentWorkingDigest,
      currentJournalSequence: head.currentJournalSequence,
      comparison: 'local-deterministic',
    };
  }

  /** Whether a Task Input checkpoint still pins the working text: no edit since, by journal sequence and digest. */
  #checkpointIsCurrent(checkpoint: NonNullable<BaselineAnalysisProjection['checkpoint']>, bookId: string): boolean {
    const head = this.#workingHead(checkpoint.manuscriptId, bookId);
    return head.currentJournalSequence === checkpoint.journalSequence && head.currentWorkingDigest === checkpoint.revisionDigest;
  }

  #workingHead(manuscriptId: string, bookId: string): { branchId: string; currentRevisionId: string; currentRevisionLabel: string; currentWorkingDigest: string; currentJournalSequence: number } {
    const head = this.#db.prepare(
      `SELECT bws.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest, mr.revision_label
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.manuscript_id = ? AND m.book_id = ? AND m.role = 'primary'`,
    ).get(manuscriptId, bookId) as SqlRow | undefined;
    requireAnalysis(head !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    return {
      branchId: asString(head.branch_id),
      currentRevisionId: asString(head.base_revision_id),
      currentRevisionLabel: asString(head.revision_label),
      currentWorkingDigest: asString(head.working_digest),
      currentJournalSequence: asNumber(head.journal_sequence),
    };
  }

  #history(bookId: string, rows: SqlRow[], latest: BaselineAnalysisResultSetRevisionProjection | null): BaselineAnalysisHistoryProjection | null {
    if (rows.length === 0 || latest === null) return null;
    const resultSet = this.#db.prepare('SELECT * FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(bookId, this.#definition.kind) as SqlRow | undefined;
    requireAnalysis(resultSet !== undefined, 'ANALYSIS_RECORD_INVALID', '结果集记录缺失。');
    const entries = rows.map((row): BaselineAnalysisHistoryEntryProjection => {
      const body = this.#revisionBody(row);
      const ordinal = asNumber(row.ordinal);
      const revisionId = asString(row.revision_id);
      const unitDigests = body.unitDigests as ReadonlyArray<{ unitOrdinal: number; state: 'closed' | 'gap' }>;
      const update = this.#revisionUpdate(body, unitDigests.length);
      const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
      const provenance = body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'];
      // The whole outcome rather than its classification alone: the entry carries its Run's report, so the
      // history opens every Run's report through the one reading that checks a report against its digest.
      const outcomeRow = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE run_record_id = ?').get(provenance.runRecordId) as SqlRow | undefined;
      const outcome = outcomeRow === undefined ? null : this.#outcomeProjection(outcomeRow);
      const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
      const freshness = ordinal === latest.ordinal ? latest.freshness : this.#freshness(pin, true);
      return {
        revisionId,
        ordinal,
        digest: asString(row.sha256),
        createdAt: asString(row.created_at),
        mode: update.mode as BaselineAnalysisHistoryEntryProjection['mode'],
        modeLabel: update.modeLabel,
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
        coverageManifestDigest: asString(row.coverage_manifest_sha256),
        contractVersion: this.#definition.contractVersion as BaselineAnalysisHistoryEntryProjection['contractVersion'],
        counts: update.counts,
        predecessor: update.predecessor,
        reusePlanDigest: update.reusePlanDigest,
        producingRun: {
          taskIntentId: provenance.taskIntentId,
          runRecordId: provenance.runRecordId,
          attemptId: provenance.attemptId,
          classification: outcome === null ? null : outcome.classification,
        },
        report: outcome === null ? null : outcome.report,
        reportAbsentReason: outcome === null ? NO_TASK_OUTCOME_REASON : outcome.reportAbsentReason,
        usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
        unitsTotal: coverage.unitsTotal,
        unitsClosed: coverage.unitsClosed,
        gapCount: (body.gaps as unknown[]).length,
        conflictCount: this.#definition.conflictCountOf(body),
        current: ordinal === latest.ordinal,
        freshness: freshness.state,
        freshnessLabel: freshness.label,
      };
    });
    return {
      resultSetId: asString(resultSet.result_set_id),
      kind: this.#definition.kind,
      createdAt: asString(resultSet.created_at),
      latestOrdinal: latest.ordinal,
      entries,
    } as BaselineAnalysisHistoryProjection;
  }

  /** The predecessor facts a reuse plan is derived against, read from the immutable revision rows and the plan version its Run bound. */
  #predecessorFacts(row: SqlRow): ReusePlanPredecessor {
    const revisionId = asString(row.revision_id);
    const taskIntentId = asString(row.task_intent_id);
    const envelopeDigest = this.#envelopeDigestOfRun(asString(row.run_record_id));
    const version = (envelopeDigest === undefined ? undefined : this.#planVersionByEnvelopeDigest(envelopeDigest)) ?? this.#planVersionFacts(taskIntentId).at(-1);
    requireAnalysis(version !== undefined, 'ANALYSIS_RECORD_INVALID', '前一修订版的计划版本缺失。');
    const manifest = this.#planRecords(taskIntentId, 'any', version.ordinal)['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === asString(row.coverage_manifest_sha256),
      'ANALYSIS_RECORD_INVALID', '前一修订版的覆盖清单记录无效。');
    const unitStates = (this.#db.prepare('SELECT unit_ordinal, state FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => ({ unitOrdinal: asNumber(unit.unit_ordinal), state: asString(unit.state) as 'closed' | 'gap' }));
    return {
      revisionId,
      ordinal: asNumber(row.ordinal),
      digest: asString(row.sha256),
      contractVersion: asString(row.contract_version),
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      manifest,
      unitStates,
    };
  }

  /**
   * The predecessor facts this kind's plan derivation reads. A kind that leaves out-of-scope units
   * unreviewed needs two more than the baseline does: the schema digest the predecessor pinned — the
   * frozen category contract its units were read under — and which of its gaps were units it was never
   * asked to read, which a later Run must tell apart from units it lost.
   */
  #planPredecessor(row: SqlRow): ReusePlanPredecessor | ScopePlanPredecessor {
    const facts = this.#predecessorFacts(row);
    if (this.#definition.outOfScope !== 'leave-unreviewed') return facts;
    const gapRows = this.#db.prepare("SELECT unit_ordinal, canonical_json FROM analysis_unit_results WHERE revision_id = ? AND state = 'gap' ORDER BY unit_ordinal")
      .all(facts.revisionId) as SqlRow[];
    const unreviewedUnitOrdinals = gapRows.filter((unit) => {
      const record = parseCanonicalJson(asString(unit.canonical_json));
      return isRecord(record) && isRecord(record.gap) && record.gap.code === 'out-of-scope';
    }).map((unit) => asNumber(unit.unit_ordinal));
    return { ...facts, schemaDigest: asString(this.#revisionBody(row).schemaDigest), unreviewedUnitOrdinals };
  }

  #revisionRowById(revisionId: string): SqlRow {
    const row = this.#db.prepare('SELECT * FROM analysis_result_set_revisions WHERE revision_id = ?').get(revisionId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '前一结果集修订版缺失。');
    return row;
  }

  #updateProjection(
    intent: IntentFacts,
    reusePlan: AnalysisPlanRecord | null,
    reusePlanDigest: string | null,
    latest: BaselineAnalysisResultSetRevisionProjection | null,
  ): BaselineAnalysisUpdateProjection | ReviewCategoryUpdateProjection {
    requireAnalysis(this.#carriesPlan(intent.mode) && this.#isInitial(intent.mode) === (intent.predecessorRevisionId === null),
      'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    if (intent.predecessorRevisionId === null) {
      // A range-bound first Task (Issue #417): it starts the Result Set, so what authorization must
      // re-verify is not that a predecessor is still the latest revision but that there is still none.
      return {
        mode: intent.mode,
        modeLabel: this.#definition.mode(intent.mode).label,
        meaning: this.#definition.mode(intent.mode).meaning,
        predecessor: null,
        predecessorCurrent: latest === null,
        selectedRange: reusePlan === null ? intent.selectedRange : reusePlan.selectedRange,
        reusePlan,
        reusePlanDigest,
      } as ReviewCategoryUpdateProjection;
    }
    const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
    const body = this.#revisionBody(predecessorRow);
    const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    return {
      mode: intent.mode as BaselineAnalysisUpdateMode,
      modeLabel: this.#definition.mode(intent.mode).label,
      meaning: this.#definition.mode(intent.mode).meaning,
      predecessor: {
        revisionId: intent.predecessorRevisionId,
        ordinal: asNumber(predecessorRow.ordinal),
        digest: asString(predecessorRow.sha256),
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
      },
      predecessorCurrent: latest !== null && latest.revisionId === intent.predecessorRevisionId && latest.digest === asString(predecessorRow.sha256),
      // The current plan version's range; the intent row keeps the range first requested.
      selectedRange: reusePlan === null ? intent.selectedRange : reusePlan.selectedRange,
      reusePlan,
      reusePlanDigest,
      // The plan is the kind's own record version, and the mode one of the kind's own update modes.
    } as BaselineAnalysisUpdateProjection | ReviewCategoryUpdateProjection;
  }

  /**
   * The Analysis Update Controls of a kind that declares update modes. A kind with none — the factual
   * review, whose update surfaces are S18b's and S19's — offers no control rather than an empty one,
   * so nothing claims an editor could start an update this slice cannot plan.
   */
  #updateControlsFor(
    bookId: string,
    revision: BaselineAnalysisResultSetRevisionProjection | null,
    activeRun: BaselineAnalysisRunState | null,
  ): BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection | null {
    if (revision === null || this.#definition.updateModes.length === 0) return null;
    return this.#updateControls(bookId, revision, activeRun);
  }

  /**
   * The Analysis Update Controls: the preview manifest is derived over the current working blocks of
   * the primary branch (exactly what the next Task Input checkpoint would pin), and every expected
   * count is a real reuse-plan derivation against the latest revision, never an estimate.
   *
   * The controls are keyed by the kind's own update modes and offered by what each mode means to
   * read: a mode that reads only what changed is on offer once something has, a range-bound mode
   * carries one option per structural unit, and a mode that reads everything always stands. For the
   * baseline kind that is exactly the three actions it has always had, in the order it declares them.
   */
  #updateControls(
    bookId: string,
    latest: BaselineAnalysisResultSetRevisionProjection,
    activeRun: BaselineAnalysisRunState | null,
  ): BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection {
    const blockedByActiveRun = activeRun !== null;
    const blockedReason = blockedByActiveRun ? activeRunReason(activeRun) : null;
    const head = this.#workingHead(latest.manuscriptPin.manuscriptId, bookId);
    const blocks = this.readWorkingBlocks(head.branchId);
    const preview = deriveCoverageManifest({
      bookId,
      manuscriptId: latest.manuscriptPin.manuscriptId,
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest,
      blocks,
    });
    const predecessor = this.#planPredecessor(this.#revisionRowById(latest.revisionId));
    const expected = (mode: AnalysisTaskMode, selectedRange: BaselineAnalysisSelectedRange | null): AnalysisReusePlanCounts =>
      this.#derivePlan(mode, selectedRange, preview, predecessor).counts;
    const freshness = latest.freshness.state === 'stale' ? 'stale' : 'current';
    const action = (mode: AnalysisTaskMode, available: boolean, unavailableReason: string | null, counts: AnalysisReusePlanCounts | null) => ({
      mode,
      label: this.#definition.mode(mode).label,
      goal: this.#definition.mode(mode).goal,
      meaning: this.#definition.mode(mode).meaning,
      available: available && !blockedByActiveRun,
      unavailableReason: blockedReason ?? unavailableReason,
      expected: counts,
    });
    const options = (mode: AnalysisTaskMode): BaselineAnalysisRangeOptionProjection[] => preview.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      sectionOrdinal: unit.sectionOrdinal,
      headingText: unit.headingText,
      subUnitIndex: unit.subUnitIndex,
      subUnitCount: unit.subUnitCount,
      startPosition: unit.startPosition,
      endPosition: unit.endPosition,
      graphemes: unit.graphemes,
      label: `结构段 ${unit.sectionOrdinal}${unit.headingText === null ? '' : `「${unit.headingText}」`} · 单元 ${unit.ordinal}/${preview.units.length}（${unit.subUnitIndex}/${unit.subUnitCount}）· 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`,
      expected: expected(mode, { startPosition: unit.startPosition, endPosition: unit.endPosition }),
    }));
    const actions = Object.fromEntries(this.#definition.updateModes.map((mode) => {
      const definition = this.#definition.mode(mode);
      if (definition.recompute === 'changed') {
        const stale = freshness === 'stale';
        return [mode, action(mode, stale, stale ? null : changedModeUnavailableReason(definition.label), stale ? expected(mode, null) : null)];
      }
      if (definition.recompute === 'selected-range') return [mode, { ...action(mode, true, null, null), options: options(mode) }];
      return [mode, action(mode, true, null, expected(mode, null))];
    }));
    return {
      target: {
        revisionId: latest.revisionId,
        ordinal: latest.ordinal,
        digest: latest.digest,
        manuscriptPin: { revisionLabel: latest.manuscriptPin.revisionLabel, revisionId: latest.manuscriptPin.revisionId, revisionDigest: latest.manuscriptPin.revisionDigest },
        freshness,
      },
      working: {
        branchId: head.branchId,
        revisionLabel: head.currentRevisionLabel,
        journalSequence: head.currentJournalSequence,
        workingDigest: head.currentWorkingDigest,
        totalBlocks: preview.totalBlocks,
        unitCount: preview.units.length,
        sectionCount: preview.sectionCount,
      },
      blockedByActiveRun,
      blockedReason,
      actions,
      providerConsequence: providerConsequence(this.#launch.live, preview.units.length, this.#definition.mode(this.#definition.initialMode).label),
      successorBehavior: SUCCESSOR_BEHAVIOR,
      // Keyed by the kind's own update modes, which is the one thing the two controls shapes differ in.
    } as BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection;
  }

  // ---- preparation -----------------------------------------------------------------------------

  prepare(input: BaselineAnalysisPrepareInput): BaselineAnalysisPreparationResult {
    if (input.phase === 'cancel-all') {
      for (const workId of Array.from(this.#work.keys())) this.prepare({ phase: 'cancel', workId });
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'cancel') {
      const work = this.#work.get(input.workId);
      if (work !== undefined) {
        this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
        this.#work.delete(input.workId);
      }
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'advance') return this.#advance(input.workId);
    const update = input.update;
    const mode: AnalysisTaskMode = update === null ? this.#definition.initialMode : update.mode;
    // A named mode is one of the kind's update modes, or the range-bound first mode of a kind that
    // declares one (Issue #417). The whole first mode is never named: it is what `null` asks for.
    const modeDefinition = this.#definition.modes.find((entry) => entry.mode === mode);
    const firstRange = update !== null && modeDefinition !== undefined && modeDefinition.initial && modeDefinition.rangeBound;
    requireAnalysis(update === null || firstRange || this.#definition.updateModes.includes(mode), 'ANALYSIS_UPDATE_MODE_UNAVAILABLE', '本分析种类没有该更新方式。');
    requireAnalysis(input.goal === this.#definition.mode(mode).goal, 'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const existing = this.inspect(input.bookId);
    requireAnalysis(!runIsActive(existing.run?.state ?? null), 'ANALYSIS_TASK_ACTIVE', activeRunReason(existing.run?.state ?? null));
    const latest = existing.resultSetRevision;
    // 改计划重做 (Issue #422, S76c; AUTH-010, CONT-013): a new Task after the latest Task's Run was cancelled once it
    // began. What that Run kept it formed into the Book's latest revision, which the redo carries and reads again
    // wherever it is not closed (同步到当前稿件 reuses every closed range and re-reads every gap); a Run that kept
    // nothing is redone as the Task it was — the same way over the same range, or the first baseline again.
    const redoOf = input.redoOf ?? null;
    if (redoOf !== null) {
      const run = existing.run;
      // 调整预算并重做 (Issue #51, S16a; V2-UX-MODEL-017): a Run the Run Budget Ceiling stopped is redone the same way — the
      // ceiling is raised or removed in the new Task's plan, never on the stopped Run.
      const budgetReached = run !== null && run.state === 'interrupted' && existing.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached';
      requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND && run !== null && run.runRecordId === redoOf &&
        ((run.state === 'cancelled' && run.transitions.some((transition) => transition.state === 'executing')) || budgetReached),
      'ANALYSIS_REDO_STALE', '只有这本书最近一项任务里开始后取消、或因预算上限停止的运行可以改计划重做。');
      const expected = latest !== null && latest.provenance.runRecordId === redoOf
        ? { mode: 'sync-current', selectedRange: null }
        : existing.update === null ? null : { mode: existing.update.mode, selectedRange: existing.update.selectedRange };
      requireAnalysis(!input.reconfirm && (expected === null
        ? update === null
        : update !== null && update.mode === expected.mode && update.selectedRange?.startPosition === expected.selectedRange?.startPosition &&
          update.selectedRange?.endPosition === expected.selectedRange?.endPosition),
      'ANALYSIS_REDO_INVALID', '改计划重做沿用这次运行已读完的部分，接着读其余的；什么都没读完时，照原样从头再做。');
    }
    // The latest Task asked for again as it was — the same way over the same range, its predecessor still the latest
    // revision: 重新准备 (Issue #536; OFF-008) of a Task whose Run a moved plan blocked before it began, and 重新确认计划
    // of a Task prepared and not yet started (Issue #551). A way ②A's own controls do not offer now stays open to it: a
    // redo's 同步 over the revision its stopped Run kept, and so every Task 重新准备 makes of it, however often the plan
    // moves while it waits.
    const blocked = existing.run;
    const asked = redoOf === null && update !== null && existing.update !== null && existing.update.predecessorCurrent &&
      update.mode === existing.update.mode &&
      update.selectedRange?.startPosition === existing.update.selectedRange?.startPosition &&
      update.selectedRange?.endPosition === existing.update.selectedRange?.endPosition &&
      (input.reconfirm
        ? blocked === null
        : blocked !== null && blocked.state === 'blocked-before-dispatch' && blocked.blockedBy === 'plan-moved');
    let selectedRange: BaselineAnalysisSelectedRange | null = null;
    if (update === null) {
      requireAnalysis(latest === null, 'ANALYSIS_FIRST_BASELINE_EXISTS', '本图书已存在结果集修订版；请使用分析更新操作追加后继修订版。');
    } else if (firstRange) {
      // The range is checked against the working manuscript the Task Input checkpoint is about to pin;
      // there is no revision yet for the update controls to have derived it from.
      requireAnalysis(latest === null, 'ANALYSIS_FIRST_BASELINE_EXISTS', '本图书已存在结果集修订版；请使用分析更新操作追加后继修订版。');
      selectedRange = requireSelectedRange(update.selectedRange, this.readWorkingBlocks(this.#binding(input.bookId).branchId).length);
    } else {
      const initialLabel = this.#definition.mode(this.#definition.initialMode).label;
      requireAnalysis(latest !== null && existing.updateControls !== null, 'ANALYSIS_PREDECESSOR_ABSENT', `本图书尚无结果集修订版；请先完成${initialLabel}。`);
      const control = (existing.updateControls!.actions as Readonly<Record<string, { available: boolean; unavailableReason: string | null }>>)[mode];
      // A redo's 同步 reads the gaps of a revision the manuscript has not moved past, which ②A's own 同步 waits for; so
      // does the latest Task asked for again as it was.
      requireAnalysis(control !== undefined && (control.available || redoOf !== null || asked), 'ANALYSIS_UPDATE_MODE_UNAVAILABLE',
        control?.unavailableReason ?? changedModeUnavailableReason(this.#definition.mode(mode).label));
      if (this.#definition.mode(mode).rangeBound) {
        selectedRange = requireSelectedRange(update.selectedRange, existing.updateControls!.working.totalBlocks);
      } else {
        requireAnalysis(update.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
      }
    }
    const binding = this.#binding(input.bookId);
    const latestIntent = existing.taskIntent === null ? null : this.#intentFacts(this.#latestIntentRow(input.bookId)!);
    // The same Task: the latest intent, no Run yet, the same update mode and the same predecessor. A
    // prepared one is revised in place (Issue #48); an interrupted preparation is resumed only for the
    // same request; anything else is a new Task Intent.
    // A prepared Task is the same Task only while the text its Task Input checkpoint pinned is still the working text.
    // After an edit the next preparation takes a new checkpoint as a new Task, so a quick start — whose plan the editor
    // never saw — never reads text older than the editor's (TASK-024). 开始任务 in the drawer still starts the plan the
    // editor is reading, at the Task Input revision that plan names; 重新确认计划 revises the plan in place, whatever moved.
    const checkpointCurrent = existing.checkpoint === null || this.#checkpointIsCurrent(existing.checkpoint, input.bookId);
    const sameTask = latestIntent !== null && existing.run === null && latestIntent.mode === mode &&
      latestIntent.predecessorRevisionId === (latest?.revisionId ?? null) && (input.reconfirm || checkpointCurrent);
    if (sameTask && existing.checkpoint !== null) {
      return { done: true, workId: null, completed: 1, total: 1, projection: this.#revisePreparedPlan(input.bookId, latestIntent, existing, selectedRange, input.reconfirm) };
    }
    requireAnalysis(!input.reconfirm, 'ANALYSIS_PLAN_REVISION_ABSENT', '当前没有已冻结且待重新确认的计划。');
    const reusable = sameTask && sameRange(latestIntent.selectedRange, selectedRange);
    const taskIntentId = reusable ? latestIntent.taskIntentId : randomUUID();
    if (!reusable) {
      const createdAt = new Date().toISOString();
      const initial = this.#isInitial(mode);
      const base = {
        bookId: input.bookId,
        contractVersion: this.#definition.contractVersion,
        createdAt,
        expectedOutcome: this.#definition.expectedOutcome,
        goal: input.goal,
        kind: this.#definition.kind,
        taskIntentId,
        ...(redoOf === null ? {} : { redoOfRunRecordId: redoOf }),
      };
      // A whole first Task's record is the base alone, as it has been since revision 15. Every Task that
      // carries a plan also states its mode, its predecessor and its range — and a range-bound first
      // Task states that it has no predecessor rather than leaving the fact to the reader.
      const intent = canonicalRecord(!this.#carriesPlan(mode) ? base : {
        ...base,
        mode,
        predecessorRevisionId: initial ? null : latest!.revisionId,
        predecessorRevisionDigest: initial ? null : latest!.digest,
        selectedRange,
      });
      this.#db.prepare(
        `INSERT INTO analysis_task_intents(
           task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256,
           mode, predecessor_revision_id, selected_start_position, selected_end_position
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskIntentId, input.bookId, this.#definition.kind, this.#definition.contractVersion, input.goal, createdAt, intent.json, intent.digest,
        mode, initial ? null : latest!.revisionId, selectedRange?.startPosition ?? null, selectedRange?.endPosition ?? null);
    }
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(binding.manuscriptId, binding.branchId, TASK_INPUT_CHECKPOINT_PURPOSE);
    if (checkpoint.workId === null) {
      requireAnalysis(checkpoint.checkpoint !== null, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, TASK_INPUT_CHECKPOINT_PURPOSE, input.launchPolicy));
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, { workId, taskIntentId, checkpointWorkId: checkpoint.workId, launchPolicy: structuredClone(input.launchPolicy), total: checkpoint.total });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  #advance(workId: string): BaselineAnalysisPreparationResult {
    requireAnalysis(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireAnalysis(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy),
    );
    this.#work.delete(workId);
    const intent = this.#db.prepare('SELECT book_id FROM analysis_task_intents WHERE task_intent_id = ?').get(work.taskIntentId) as SqlRow;
    return { done: true, workId: null, completed: progress.total, total: progress.total, projection: this.inspect(asString(intent.book_id)) };
  }

  #persistPrepared(taskIntentId: string, checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose, launchPolicy: LaunchPolicyProjection): void {
    requireAnalysis(purpose === TASK_INPUT_CHECKPOINT_PURPOSE, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点用途无效。');
    this.#requireDeniedPolicy(launchPolicy);
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    // The checkpoint must still be the working head when the plan is first frozen.
    this.#binding(checkpoint.bookId, checkpoint);
    const instant = new Date().toISOString();
    const checkpointRecord = canonicalRecord({
      branchId: checkpoint.branchId,
      createdForDirtyJournal: checkpoint.createdForDirtyJournal,
      journalSequence: checkpoint.journalSequence,
      manuscriptId: checkpoint.manuscriptId,
      purpose,
      revisionDigest: checkpoint.revisionDigest,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      taskIntentId,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_input_checkpoints(
         task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
         journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskIntentId, checkpoint.manuscriptId, checkpoint.branchId, checkpoint.revisionId, checkpoint.revisionLabel,
      checkpoint.revisionDigest, checkpoint.journalSequence, purpose, checkpoint.createdForDirtyJournal ? 1 : 0,
      checkpointRecord.json, checkpointRecord.digest, instant);
    this.#writePlanVersion({ intent, checkpoint, checkpointDigest: checkpointRecord.digest, ordinal: 1, selectedRange: intent.selectedRange, planRevisionId: null, instant, edits: this.#redoPlanEdits(intent) });
  }

  /**
   * Freeze one plan version of a Task: the seven components (eight for an update Task) derived from
   * the checkpoint revision, the current Provider Binding, the artifact pin, and the version's own
   * selected range, plus the envelope that pins their digests, the prompt contract, the behavior
   * composition, the version ordinal, and the Plan Boundary Split; then the version row itself.
   * Version 1 is written with the checkpoint; a later version resolves a Plan Revision.
   */
  #writePlanVersion(input: {
    intent: IntentFacts;
    checkpoint: ManuscriptCheckpointBinding;
    checkpointDigest: string;
    ordinal: number;
    selectedRange: BaselineAnalysisSelectedRange | null;
    planRevisionId: string | null;
    instant: string;
    /** What the version leaves out at the editor's word (Issue #419); nothing for a plan AI7 proposed. */
    edits: PlanEdits;
    /**
     * The credential readiness an edit carries forward from the version it edits (Issue #419): readiness is not a
     * material input, so an edit leaves the provider component as it froze. Absent, the connection is read now.
     */
    credentialReadiness?: ModelCredentialOperationState;
  }): { planVersionId: string; planEnvelopeDigest: string } {
    const { intent, checkpoint, ordinal, instant } = input;
    const taskIntentId = intent.taskIntentId;
    // A later version never re-validates the checkpoint against the working head: manuscript edits are non-material.
    const facts = this.#binding(checkpoint.bookId, checkpoint, ordinal === 1);
    const blocks = this.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId);
    const manifest = deriveCoverageManifest({
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      branchId: checkpoint.branchId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      blocks,
    });
    let reusePlan: AnalysisPlanRecord | null = null;
    if (this.#carriesPlan(intent.mode)) {
      const latestRow = this.#revisionRows(checkpoint.bookId).at(-1);
      if (this.#isInitial(intent.mode)) {
        // A range-bound first Task starts the Result Set: a revision that appeared since it was
        // prepared makes it an update of that revision, which is a different Task.
        requireAnalysis(intent.predecessorRevisionId === null && latestRow === undefined,
          'ANALYSIS_PREDECESSOR_DRIFT', '本图书已存在结果集修订版；请基于最新修订版重新准备更新。');
      } else {
        requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
        requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
          'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
      }
      reusePlan = this.#derivePlan(
        intent.mode,
        this.#definition.mode(intent.mode).rangeBound ? requireSelectedRange(input.selectedRange, manifest.totalBlocks) : null,
        manifest,
        latestRow === undefined ? null : this.#planPredecessor(latestRow),
      );
    }
    const manuscriptPin = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      sourceDigest: SAMPLE1_SOURCE_DIGEST,
    };
    const artifactPin = {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_DIGEST,
    };
    const sourceScopeBase = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      taskInputRevision: { revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest },
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
    };
    // An update Run admits only the recomputed units' messages; a reused unit never forms a model-bound
    // payload, and neither does a unit a scope plan leaves unreviewed — which the scope says in so many
    // words, and only a scope plan says, so a baseline scope keeps the two lists it has always had.
    const planUnits: ReadonlyArray<{ unitOrdinal: number; disposition: 'reused' | 'recomputed' | 'unreviewed' }> = reusePlan?.units ?? [];
    const ordinalsOf = (disposition: 'reused' | 'recomputed' | 'unreviewed'): number[] =>
      planUnits.filter((unit) => unit.disposition === disposition).map((unit) => unit.unitOrdinal);
    const unreviewedCount = reusePlan !== null && 'unreviewed' in reusePlan.counts ? reusePlan.counts.unreviewed : null;
    const sourceScope = reusePlan === null ? sourceScopeBase : {
      ...sourceScopeBase,
      unitScope: {
        mode: reusePlan.mode,
        recomputedUnitOrdinals: ordinalsOf('recomputed'),
        reusedUnitOrdinals: ordinalsOf('reused'),
        ...(unreviewedCount === null ? {} : { unreviewedUnitOrdinals: ordinalsOf('unreviewed') }),
      },
    };
    // The plan freezes whichever binding the launch bound: the denied production binding on the
    // deterministic route, or the v5 live binding. Both are frozen before authorization, never chosen
    // at dispatch, so an authorized Run can never transmit somewhere its plan did not name.
    const live = this.#launch.live;
    // The editor's ceiling is the plan's own outside developer-live (Issue #51, S16a); under it the launch sets the
    // ceiling, so a redo that copies a ceiling the editor once set keeps the rest of the edit and not the ceiling.
    const edits = live === null ? input.edits : withoutCeiling(input.edits);
    const promptContractDigest = this.#definition.promptContractDigest;
    const composition = live === null
      ? describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, promptContractDigest)
      : describeComposition(live.route, live.model, promptContractDigest);
    const providerPlan = {
      role: 'Main Editorial Role',
      capabilities: [],
      remoteBinding: live === null
        ? {
            providerId: 'deepseek-open-platform',
            modelId: 'deepseek-v4-pro',
            adapterRevision: 1,
            configurationRevision: 1,
            approvedFallbackChain: [],
            credentialSlot: 'deepseek-api-key',
            credentialReference: facts.credentialReference,
            credentialReadiness: input.credentialReadiness ?? facts.credentialOperationState,
            providerProcessing: { operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 },
          }
        : {
            providerId: live.route,
            modelId: live.model,
            adapterRevision: 1,
            configurationRevision: 1,
            approvedFallbackChain: [],
            credentialSlot: live.credentialSlot,
            credentialReference: live.credentialReference,
            credentialReadiness: input.credentialReadiness ?? facts.credentialOperationState,
            providerProcessing: { operationalScope: 'developer-live', version: 'v5', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
          },
      executionRoute: live !== null
        ? { kind: live.route, model: live.model, endpoint: live.endpoint }
        : this.#route === null
          ? { kind: 'none', reason: 'j04-model-adapter-control-absent' }
          : {
              kind: LOCAL_DETERMINISTIC_ROUTE,
              model: LOCAL_DETERMINISTIC_MODEL,
              fixtureIdentity: this.#route.fixtureIdentity,
              fixtureSha256: this.#route.fixtureSha256,
              fixtureLineage: this.#route.fixtureLineage,
            },
      outboundDataCategory: 'public-or-synthetic',
      runBudgetCeiling: live === null ? planEditCeiling(edits) : resolveDeveloperLiveCeiling(live.runBudgetCeiling, manifest.units.length),
    };
    const dispatchAllowed = live !== null || this.#route !== null;
    const stopCondition = live !== null
      ? 'Provider Processing v5 binds opencode-go under developer-live; the Run Budget Ceiling and the Coverage Manifest unit count bound every transmission'
      : dispatchAllowed
        ? 'Provider Processing v1 denies the remote route; execution binds only ai7-local-deterministic'
        : 'Provider Processing v1 denies the remote route and no local deterministic route is bound';
    // An edited plan names what it leaves out; a plan AI7 proposed names nothing, so its record reads as before.
    const editorEdits = planEditsAreEmpty(edits) ? {} : { editorEdits: edits };
    const executionPlan = reusePlan === null
      ? { steps: this.#definition.executionSteps, effects: [], unitCount: manifest.units.length, reducerStages: this.#definition.reducerStages, stopCondition, ...editorEdits }
      : {
          steps: this.#definition.updateExecutionSteps,
          effects: [],
          unitCount: manifest.units.length,
          recomputedUnitCount: reusePlan.counts.recomputed,
          reusedUnitCount: reusePlan.counts.reused,
          ...(unreviewedCount === null ? {} : { unreviewedUnitCount: unreviewedCount }),
          reducerStages: this.#definition.reducerStages,
          stopCondition,
          ...editorEdits,
        };
    const records: Record<string, { json: string; digest: string }> = {
      'manuscript-pin': canonicalRecord(manuscriptPin),
      'artifact-pin': canonicalRecord(artifactPin),
      'run-source-scope': canonicalRecord(sourceScope),
      'coverage-manifest': canonicalRecord(manifest),
      'provider-resolution-plan': canonicalRecord(providerPlan),
      'execution-plan': canonicalRecord(executionPlan),
    };
    if (reusePlan !== null) records['reuse-plan'] = reusePlanRecord(reusePlan);
    const envelopeBase = {
      providerStatus: live !== null
        ? 'remote-eligible-developer-live'
        : dispatchAllowed ? 'remote-denied-local-deterministic' : 'remote-denied-no-route',
      dispatchAllowed,
      summary: live !== null
        ? `计划已冻结；developer-live · Provider Processing v5 允许绑定 ${live.route} · ${live.model}，实时传输受运行边界约束`
        : dispatchAllowed
          ? '计划已冻结；远程绑定被 Provider Processing v1 拒绝，执行绑定至 AI7 本地确定性模型适配器'
          : '计划已冻结；远程绑定被 Provider Processing v1 拒绝，且没有可执行的本地路由',
      taskIntentId,
      checkpointDigest: input.checkpointDigest,
      manuscriptPinDigest: records['manuscript-pin']!.digest,
      artifactPinDigest: records['artifact-pin']!.digest,
      runSourceScopeDigest: records['run-source-scope']!.digest,
      coverageManifestDigest: manifest.digest,
      providerResolutionPlanDigest: records['provider-resolution-plan']!.digest,
      executionPlanDigest: records['execution-plan']!.digest,
      promptContractDigest,
      behaviorCompositionDigest: composition.digest,
      // The plan version and the Plan Boundary Split are part of the canonical envelope (Issue #48).
      planVersion: ordinal,
      boundary: planBoundarySplit(edits.disallowedAdaptations, edits.askFirstAdaptations ?? []),
    };
    const envelope = canonicalRecord(reusePlan === null ? envelopeBase : {
      ...envelopeBase,
      updateMode: reusePlan.mode,
      // `null` only for a range-bound first Task's scope plan; a baseline plan always names its predecessor.
      predecessorRevisionId: reusePlan.predecessor?.revisionId ?? null,
      predecessorRevisionDigest: reusePlan.predecessor?.digest ?? null,
      reusePlanDigest: records['reuse-plan']!.digest,
    });
    const insert = this.#db.prepare(
      'INSERT INTO analysis_plan_records(task_intent_id, plan_version, component, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const [component, record] of Object.entries(records)) insert.run(taskIntentId, ordinal, component, record.json, record.digest, instant);
    insert.run(taskIntentId, ordinal, 'plan-envelope', envelope.json, envelope.digest, instant);
    const planVersionId = randomUUID();
    const version = canonicalRecord({ planVersionId, taskIntentId, ordinal, planRevisionId: input.planRevisionId, planEnvelopeDigest: envelope.digest, createdAt: instant });
    this.#db.prepare(
      `INSERT INTO analysis_plan_versions(plan_version_id, task_intent_id, ordinal, plan_revision_id, plan_envelope_sha256, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(planVersionId, taskIntentId, ordinal, input.planRevisionId, envelope.digest, instant, version.json, version.digest);
    return { planVersionId, planEnvelopeDigest: envelope.digest };
  }

  // ---- authorization -----------------------------------------------------------------------------

  /**
   * `slotBusy` is the execution owner's word that another Run holds its one slot (Issue #420, S74a A2). A
   * Run that would dispatch is then refused before anything is recorded — no queue — while a repeat of an
   * authorization already recorded answers as it always has, and a Run that never dispatches is unaffected.
   *
   * `start` is `when-online` for 联网后开始任务 (Issue #502; AUTH-004, OFF-005): the same exact Run Authorization
   * and Run Record, and the Run then waits in Connectivity Wait instead of being handed to the slot — nothing
   * sent, no usage, nothing implying it began. Only a plan that could dispatch can wait, and a waiting Run takes
   * no slot, so a busy slot refuses only a start that would dispatch now.
   *
   * `origin` is `default-execution-rule` for 快速开始 (Issue #421; TASK-020, TASK-028): the same records, the
   * authorization naming the rule version the start was made under. Whether the rule may start this plan is the
   * caller's to have settled; the rule never widens what the plan binds.
   */
  authorize(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    slotBusy = false,
    start: 'now' | 'when-online' = 'now',
    origin: AnalysisAuthorizationOrigin = STANDARD_DIRECT,
  ): { projection: AnalysisProjection; dispatchRunRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest) &&
      (origin.kind === 'standard-direct' || (start === 'now' && UUID_PATTERN.test(origin.ruleVersionId))),
    'ANALYSIS_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireAnalysis(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope !== null && prepared.planVersion !== null,
      'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.authorization !== null) {
      requireAnalysis(prepared.planEnvelope.digest === planEnvelopeDigest, 'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
      return { projection: prepared, dispatchRunRecordId: null };
    }
    // Version-bound authorization (Issue #48): a superseded plan version, or the current version while a
    // Plan Revision is pending, is refused with the safe reason `plan-revision-required` and no Run Record.
    const namesSupersededVersion = prepared.planVersions.some((version) => version.planEnvelopeDigest === planEnvelopeDigest && version.ordinal < prepared.planVersion!.ordinal);
    requireAnalysis(!namesSupersededVersion && prepared.planRevision === null, 'ANALYSIS_PLAN_REVISION_REQUIRED',
      `计划需要修订（${PLAN_REVISION_REQUIRED_REASON}）：该计划版本已被取代或有待重新确认的计划修订；请查看计划修订并重新确认计划后再授权。`);
    requireAnalysis(prepared.planEnvelope.digest === planEnvelopeDigest, 'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    requireAnalysis(prepared.state === 'prepared', 'ANALYSIS_AUTHORIZATION_INVALID', '任务计划尚未准备完成。');
    // An update Task is re-verified against the Result Set: its predecessor must still be the latest revision.
    requireAnalysis(prepared.update === null || prepared.update.predecessorCurrent,
      'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；无法授权。请基于最新修订版重新准备更新。');
    const dispatchAllowed = prepared.planEnvelope.dispatchAllowed;
    requireAnalysis(start === 'now' || dispatchAllowed, 'ANALYSIS_START_WHEN_ONLINE_INVALID', '这份计划没有可执行的路由，不能联网后开始。');
    requireAnalysis(!(slotBusy && dispatchAllowed && start === 'now'), EXECUTION_SLOT_BUSY, EXECUTION_SLOT_BUSY_REASON);
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authority = dispatchAllowed ? 'standard-direct-dispatch' : 'record-only-no-dispatch';
    const authorization = canonicalRecord({
      authorizationId,
      origin: origin.kind,
      planEnvelopeDigest,
      planVersionId: prepared.planVersion.planVersionId,
      planVersionOrdinal: prepared.planVersion.ordinal,
      taskIntentId,
      authority,
      ...(origin.kind === 'default-execution-rule' ? { ruleVersionId: origin.ruleVersionId } : {}),
    });
    const run = canonicalRecord({ runRecordId, authorizationId, taskIntentId, recordedAt: instant });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO analysis_run_authorizations(authorization_id, task_intent_id, plan_envelope_sha256, origin, authority, authorized_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, origin.kind, authority, instant, authorization.json, authorization.digest);
      this.#db.prepare(
        'INSERT INTO analysis_run_records(run_record_id, task_intent_id, authorization_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
      this.#insertRunState(runRecordId, 1, 'authorized', origin.kind === 'standard-direct'
        ? { detail: '标准直接运行授权已记录。' }
        : { detail: '快速开始按默认执行规则记录了运行授权。', ruleVersionId: origin.ruleVersionId }, instant);
      if (!dispatchAllowed) {
        const reasons = blockedReasons(this.#launch.live);
        this.#insertRunState(runRecordId, 2, 'blocked-before-dispatch', { detail: reasons.join(' '), reasons }, instant);
      } else if (start === 'when-online') {
        this.#insertRunState(runRecordId, 2, 'awaiting-connectivity', { detail: CONNECTIVITY_WAIT_DETAIL }, instant);
      }
    });
    return { projection: this.inspect(bookId), dispatchRunRecordId: dispatchAllowed && start === 'now' ? runRecordId : null };
  }

  // ---- Connectivity Wait (Issue #502, plan slice S74b) -------------------------------------------------

  /**
   * 取消 while the Book's Run waits (OFF-010): the terminal cancellation, before any dispatch and without
   * provider work. Only a waiting Run can be cancelled here — one already admitted has begun, and pausing or
   * cancelling it is S76's — and cancelling twice answers as the first did.
   */
  cancelWaiting(bookId: string, taskIntentId: string): AnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_CANCEL_INVALID', '取消任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_CANCEL_STALE', '这项任务已经变化；无法取消。');
    if (run.state === 'cancelled') return current;
    requireAnalysis(run.state === 'awaiting-connectivity', 'ANALYSIS_CANCEL_NOT_WAITING', '只有等待中的任务可以在这里取消；它已经开始或已经结束。');
    this.recordRunState(run.runRecordId, 'cancelled', { detail: '编辑在派发前取消了这项等待中的任务；没有发送任何内容，也没有产生用量。' });
    return this.inspect(bookId);
  }

  // ---- 取消任务 (Issue #422, plan slice S76a) ------------------------------------------------------------

  /**
   * 取消任务 on the Book's started Run (CTRL-004 to CTRL-008), once the editor confirmed the Cancellation Impact
   * Summary: `cancelling` is recorded at once and the Run is named for the execution owner, which stops it at the
   * next unit boundary and records `cancelled`. A waiting Run is cancelled by `cancelWaiting` instead, since
   * nothing of it ran. A Run already cancelling is named again — the owner that holds it stops it once, and one AI7
   * left behind when it last closed is settled there — and one already cancelled answers as it did.
   */
  requestCancel(bookId: string, taskIntentId: string): { projection: AnalysisProjection; runRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_CANCEL_INVALID', '取消任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_CANCEL_STALE', '这项任务已经变化；无法取消。');
    if (run.state === 'cancelled') return { projection: current, runRecordId: null };
    if (run.state === 'cancelling') return { projection: current, runRecordId: run.runRecordId };
    requireAnalysis(run.state !== 'awaiting-connectivity', 'ANALYSIS_CANCEL_WAITING', '这项任务还在等待开始；请用等待中的「取消」。');
    // A paused Run, one pausing, one left 可续行 (Issue #422, S76b) and one waiting for the editor's answer (S76d) are
    // cancelled as a running one is.
    requireAnalysis(run.state === 'admitted' || run.state === 'executing' || run.state === 'pausing' || run.state === 'paused' || run.state === 'resumable' ||
      run.state === 'awaiting-clarification',
      'ANALYSIS_CANCEL_NOT_RUNNING', '只有正在运行或暂停中的任务可以取消；它尚未开始或已经结束。');
    this.recordRunState(run.runRecordId, 'cancelling', { detail: RUN_CANCELLING_DETAIL });
    return { projection: this.inspect(bookId), runRecordId: run.runRecordId };
  }

  /** What settling a cancellation needs of a Run it did not reach through its plan: its Task Intent and its attempt. */
  cancellationFacts(runRecordId: string): { taskIntentId: string; attemptId: string | null } {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const attempt = this.#db.prepare('SELECT attempt_id FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    return { taskIntentId: asString(run.task_intent_id), attemptId: attempt === undefined ? null : asString(attempt.attempt_id) };
  }

  // ---- 暂停 and 续行 (Issue #422, plan slice S76b) -----------------------------------------------------------

  /**
   * 暂停 (CTRL-001): `pausing` is recorded at once and the Run is named for the execution owner, which stops it at the
   * next unit boundary and records `paused` once what it read is kept. Pausing twice names the same Run and records
   * nothing more; a Run already paused, or left 可续行, answers as it is.
   */
  requestPause(bookId: string, taskIntentId: string): { projection: AnalysisProjection; runRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_PAUSE_INVALID', '暂停任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_PAUSE_STALE', '这项任务已经变化；无法暂停。');
    if (run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification') return { projection: current, runRecordId: null };
    if (run.state === 'pausing') return { projection: current, runRecordId: run.runRecordId };
    requireAnalysis(run.state === 'admitted' || run.state === 'executing', 'ANALYSIS_PAUSE_NOT_RUNNING', '只有正在运行的任务可以暂停；它尚未开始、正在取消或已经结束。');
    this.recordRunState(run.runRecordId, 'pausing', { detail: RUN_PAUSING_DETAIL });
    return { projection: this.inspect(bookId), runRecordId: run.runRecordId };
  }

  /** The paused or 可续行 Run of the Book's current Task, which 续行 would continue; `null` when there is none. */
  continuableRun(bookId: string, taskIntentId: string): string {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_RESUME_INVALID', '续行的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_RESUME_STALE', '这项任务已经变化；无法续行。');
    requireAnalysis(run.state === 'paused' || run.state === 'resumable', 'ANALYSIS_RESUME_NOT_PAUSED', '只有已暂停或中断后可续行的任务可以续行。');
    return run.runRecordId;
  }

  /**
   * 续行's lightweight revalidation (CONT-015, CONT-016), local half: the reasons a paused Run cannot go on as it was
   * authorized — its bound plan's material inputs moved (the same comparison Reconnect Preflight makes), or its
   * continuation checkpoints no longer read back — or none. The route's credential is the service's to read.
   */
  continuationBlockers(runRecordId: string): ReadonlyArray<string> {
    const drift = this.preflightDrift(runRecordId);
    // CONT-016: material drift routes to a newly authorized Redo Run — 改计划重做 — never past the old authorization.
    const reasons = drift.length === 0 ? [] : [`计划的关键内容已经变化：${drift.join('、')}。这次运行不能照原计划续行；请改计划重做。`];
    try {
      this.unitCheckpoints(runRecordId);
    } catch {
      reasons.push('已保存的阅读进度无法核对，这次运行不能续行；请取消它，再重新开始。');
    }
    return reasons;
  }

  /** One settled unit of a Run, kept the moment it settles: the continuation point 续行 goes on from (CONT-015). */
  recordUnitCheckpoint(input: {
    runRecordId: string;
    attemptId: string;
    unit: UnitResultRecord;
    observation: UnitCheckpoint['observation'];
  }): void {
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: UNIT_CHECKPOINT_SCHEMA,
      runRecordId: input.runRecordId,
      attemptId: input.attemptId,
      unit: input.unit,
      observation: input.observation,
      recordedAt,
    });
    this.#db.prepare(
      'INSERT INTO analysis_unit_checkpoints(run_record_id, unit_ordinal, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(input.runRecordId, input.unit.unitOrdinal, input.unit.closed.state, recordedAt, record.json, record.digest);
  }

  /**
   * What a stopped Run spent beyond its units before it stopped — a reduction or a sample 续行 forms again — as its latest
   * stop kept it (Issue #51, S16a): the ceiling counts it after 续行 as it did before. `null` when no stop kept any.
   */
  carriedUsageOf(runRecordId: string): { inputTokens: number; outputTokens: number; stages: CarriedStages | null } | null {
    const rows = this.#db.prepare(
      "SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND state IN ('paused', 'resumable', 'awaiting-clarification') ORDER BY sequence DESC",
    ).all(runRecordId) as SqlRow[];
    const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
    for (const row of rows) {
      const carried = (parseCanonicalJson(asString(row.canonical_json)) as { carriedUsage?: unknown }).carriedUsage;
      if (carried === undefined) continue;
      const usage = carried as { inputTokens?: unknown; outputTokens?: unknown; stages?: unknown };
      requireAnalysis(carried !== null && typeof carried === 'object' && count(usage.inputTokens) && count(usage.outputTokens),
        'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
      // The stages a stop kept its usage by (Issue #541); a stop recorded before they were kept names none.
      let stages: CarriedStages | null = null;
      if (usage.stages !== undefined) {
        const kept = usage.stages as Record<string, { requests?: unknown; inputTokens?: unknown; outputTokens?: unknown } | undefined>;
        requireAnalysis(usage.stages !== null && typeof usage.stages === 'object' && Object.keys(usage.stages).length === CARRIED_STAGES.length &&
          CARRIED_STAGES.every((stage) => kept[stage] !== undefined && count(kept[stage]!.requests) && count(kept[stage]!.inputTokens) && count(kept[stage]!.outputTokens)),
        'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
        stages = Object.fromEntries(CARRIED_STAGES.map((stage) => [stage, {
          requests: kept[stage]!.requests as number, inputTokens: kept[stage]!.inputTokens as number, outputTokens: kept[stage]!.outputTokens as number,
        }])) as CarriedStages;
        const summed = CARRIED_STAGES.reduce((total, stage) => ({
          inputTokens: total.inputTokens + stages![stage].inputTokens, outputTokens: total.outputTokens + stages![stage].outputTokens,
        }), { inputTokens: 0, outputTokens: 0 });
        requireAnalysis(summed.inputTokens <= (usage.inputTokens as number) && summed.outputTokens <= (usage.outputTokens as number),
          'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
      }
      return { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number, stages };
    }
    return null;
  }

  /** A Run's continuation checkpoints in unit order, each read back against its own digest. */
  unitCheckpoints(runRecordId: string): UnitCheckpoint[] {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const rows = this.#db.prepare('SELECT * FROM analysis_unit_checkpoints WHERE run_record_id = ? ORDER BY unit_ordinal').all(runRecordId) as SqlRow[];
    return rows.map((row) => {
      const json = asString(row.canonical_json);
      const record = parseCanonicalJson(json) as {
        schema: string; runRecordId: string; attemptId: string; unit: UnitResultRecord; observation: UnitCheckpoint['observation'];
      };
      const unitOrdinal = asNumber(row.unit_ordinal);
      requireAnalysis(canonicalRecord(record).digest === asString(row.sha256) && record.schema === UNIT_CHECKPOINT_SCHEMA &&
        record.runRecordId === runRecordId && record.unit.unitOrdinal === unitOrdinal && record.unit.closed.state === asString(row.state),
      'ANALYSIS_RECORD_INVALID', '运行的阅读进度记录与其摘要不一致。');
      return {
        attemptId: record.attemptId,
        unit: record.unit,
        observation: record.observation,
        result: record.unit.closed.state === 'closed'
          ? this.#definition.unitResultOfRecord(record.unit.closed.result as Record<string, unknown>, unitOrdinal)
          : null,
      };
    });
  }

  // ---- Clarification Requests (Issue #422, plan slice S76d) ---------------------------------------------------

  /**
   * What the Run asked the editor at an adaptation moved into 先问你 (CLAR-001, CLAR-005): the unit whose safe retry
   * waits, bound to the Run, its attempt, the plan version and envelope it runs under, with the failure that raised it
   * and what the first attempt cost. One request per unit and Run; the unit waits until it is answered.
   */
  recordClarificationRequest(input: {
    runRecordId: string;
    attemptId: string;
    taskIntentId: string;
    unitOrdinal: number;
    planVersion: number;
    planEnvelopeDigest: string;
    requestDigest: string;
    failure: { code: string; failureClass: string; status: number | null; reason: string };
    firstPayloadDigest: string | null;
    firstUsage: { inputTokens: number; outputTokens: number } | null;
    firstWallMs: number;
  }): string {
    requireAnalysis(UUID_PATTERN.test(input.runRecordId) && UUID_PATTERN.test(input.attemptId) && UUID_PATTERN.test(input.taskIntentId) &&
      Number.isSafeInteger(input.unitOrdinal) && input.unitOrdinal >= 1 && Number.isSafeInteger(input.planVersion) && input.planVersion >= 1 &&
      DIGEST_PATTERN.test(input.planEnvelopeDigest) && DIGEST_PATTERN.test(input.requestDigest) &&
      (input.firstPayloadDigest === null || DIGEST_PATTERN.test(input.firstPayloadDigest)),
    'ANALYSIS_RECORD_INVALID', '澄清请求记录无效。');
    const requestId = randomUUID();
    const raisedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: CLARIFICATION_REQUEST_SCHEMA,
      requestId,
      runRecordId: input.runRecordId,
      attemptId: input.attemptId,
      taskIntentId: input.taskIntentId,
      unitOrdinal: input.unitOrdinal,
      kind: 'ask-first-adaptation',
      adaptationClass: 'safe-retry',
      planVersion: input.planVersion,
      planEnvelopeDigest: input.planEnvelopeDigest,
      requestDigest: input.requestDigest,
      failure: input.failure,
      firstPayloadDigest: input.firstPayloadDigest,
      firstUsage: input.firstUsage,
      firstWallMs: Math.max(0, Math.round(input.firstWallMs)),
      raisedAt,
    });
    this.#db.prepare(
      'INSERT INTO analysis_clarification_requests(request_id, run_record_id, unit_ordinal, kind, raised_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(requestId, input.runRecordId, input.unitOrdinal, 'ask-first-adaptation', raisedAt, record.json, record.digest);
    return requestId;
  }

  /** A Run's Clarification Requests in unit order, each with its answer when it has one, read back against their digests. */
  clarificationsOf(runRecordId: string): ClarificationFacts[] {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const rows = this.#db.prepare(
      `SELECT q.request_id, q.unit_ordinal, q.canonical_json q_json, q.sha256 q_sha, a.answer_id, a.option_id, a.canonical_json a_json, a.sha256 a_sha
       FROM analysis_clarification_requests q
       LEFT JOIN analysis_clarification_answers a ON a.request_id = q.request_id
       WHERE q.run_record_id = ? ORDER BY q.unit_ordinal`,
    ).all(runRecordId) as SqlRow[];
    return rows.map((row) => {
      const request = parseCanonicalJson(asString(row.q_json)) as Record<string, unknown>;
      requireAnalysis(canonicalRecord(request).digest === asString(row.q_sha) && request.schema === CLARIFICATION_REQUEST_SCHEMA &&
        request.requestId === asString(row.request_id) && request.runRecordId === runRecordId && request.unitOrdinal === asNumber(row.unit_ordinal),
      'ANALYSIS_RECORD_INVALID', '澄清请求记录与其摘要不一致。');
      let answer: ClarificationFacts['answer'] = null;
      if (row.answer_id !== null) {
        const record = parseCanonicalJson(asString(row.a_json)) as Record<string, unknown>;
        requireAnalysis(canonicalRecord(record).digest === asString(row.a_sha) && record.schema === CLARIFICATION_ANSWER_SCHEMA &&
          record.answerId === asString(row.answer_id) && record.requestId === request.requestId && record.optionId === asString(row.option_id) &&
          record.requestSha256 === asString(row.q_sha),
        'ANALYSIS_RECORD_INVALID', '澄清回答记录与其摘要不一致。');
        answer = {
          answerId: record.answerId as string,
          optionId: record.optionId as ClarificationOptionId,
          note: record.note as string | null,
          answeredAt: record.answeredAt as string,
        };
      }
      return {
        requestId: request.requestId as string,
        runRecordId,
        attemptId: request.attemptId as string,
        taskIntentId: request.taskIntentId as string,
        unitOrdinal: request.unitOrdinal as number,
        planVersion: request.planVersion as number,
        raisedAt: request.raisedAt as string,
        requestDigest: request.requestDigest as string,
        failure: request.failure as ClarificationFacts['failure'],
        firstPayloadDigest: request.firstPayloadDigest as string | null,
        firstUsage: request.firstUsage as ClarificationFacts['firstUsage'],
        firstWallMs: request.firstWallMs as number,
        answer,
      };
    });
  }

  /**
   * 提交回答 (CLAR-005, CLAR-006, INPUT-004): the editor's one answer to a question the Book's current Task's Run asked —
   * the option chosen and the note that qualifies it — bound to the exact request shown, with who and when. Refused, and
   * nothing recorded, when the question is not that Run's, is already answered, or the Run has ended or is stopping.
   */
  recordClarificationAnswer(bookId: string, input: { taskIntentId: string; requestId: string; optionId: unknown; note: unknown }): {
    answerId: string;
    runRecordId: string;
    runState: BaselineAnalysisRunState;
  } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.requestId),
      'ANALYSIS_CLARIFICATION_INVALID', '回答的参数无效。');
    requireAnalysis(typeof input.optionId === 'string' && (CLARIFICATION_OPTION_IDS as ReadonlyArray<string>).includes(input.optionId),
      'ANALYSIS_CLARIFICATION_INVALID', '请选择一个回答。');
    const note = typeof input.note === 'string' ? input.note.trim() : null;
    requireAnalysis(input.note === null || (typeof input.note === 'string' && input.note.isWellFormed() && input.note.length <= CLARIFICATION_NOTE_MAX),
      'ANALYSIS_CLARIFICATION_INVALID', `说明最多 ${CLARIFICATION_NOTE_MAX} 字。`);
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === input.taskIntentId && run !== null,
      'ANALYSIS_CLARIFICATION_STALE', '这项任务已经变化；这个问题不再等你回答。');
    requireAnalysis(run.state === 'admitted' || run.state === 'executing' || run.state === 'pausing' || run.state === 'paused' ||
      run.state === 'resumable' || run.state === 'awaiting-clarification',
    'ANALYSIS_CLARIFICATION_STALE', '这次运行已经结束或正在取消；这个问题不再等你回答。');
    const request = this.clarificationsOf(run.runRecordId).find((entry) => entry.requestId === input.requestId);
    requireAnalysis(request !== undefined, 'ANALYSIS_CLARIFICATION_STALE', '这个问题不是这次运行提的。');
    requireAnalysis(request.answer === null, 'ANALYSIS_CLARIFICATION_ANSWERED', '这个问题已经回答过了。');
    const requestRow = this.#db.prepare('SELECT sha256 FROM analysis_clarification_requests WHERE request_id = ?').get(input.requestId) as SqlRow;
    const answerId = randomUUID();
    const answeredAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: CLARIFICATION_ANSWER_SCHEMA,
      answerId,
      requestId: input.requestId,
      requestSha256: asString(requestRow.sha256),
      runRecordId: run.runRecordId,
      optionId: input.optionId,
      note: note === null || note.length === 0 ? null : note,
      actor: 'editor',
      answeredAt,
    });
    this.#db.prepare(
      'INSERT INTO analysis_clarification_answers(answer_id, request_id, option_id, answered_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(answerId, input.requestId, input.optionId, answeredAt, record.json, record.digest);
    return { answerId, runRecordId: run.runRecordId, runState: run.state };
  }

  /**
   * The provider-account-limit stop of a resumable Run (Issue #51, S16b): the provider's words and the unit it refused
   * — `null` for the reduction or a sample — read from the Run's latest state; `null` for every other Run.
   */
  accountLimitOf(runRecordId: string): { condition: string; unitOrdinal: number | null } | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'resumable') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'provider-account-limit' || typeof record.condition !== 'string') return null;
    return { condition: record.condition, unitOrdinal: typeof record.unitOrdinal === 'number' ? record.unitOrdinal : null };
  }

  /**
   * The account-limit stop a Run goes on from (Issue #51, S16b): its latest stop, when that was the provider's limit, with
   * the attempt the provider refused — which was sent — when it refused a unit. `null` when the Run's latest stop was
   * anything else, or it never stopped.
   */
  accountLimitStopOf(runRecordId: string): {
    condition: string;
    unitOrdinal: number | null;
    refusedAttempt: { attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null;
  } | null {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND state IN ('paused', 'resumable', 'awaiting-clarification') ORDER BY sequence DESC LIMIT 1",
    ).get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'provider-account-limit' || typeof record.condition !== 'string') return null;
    const refused = record.refusedAttempt;
    let refusedAttempt: { attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null = null;
    if (refused !== undefined) {
      const usage = isRecord(refused) ? refused.usage : undefined;
      requireAnalysis(isRecord(refused) && Number.isSafeInteger(refused.attempts) && (refused.attempts as number) >= 1 &&
        typeof refused.wallMs === 'number' && refused.wallMs >= 0 &&
        (usage === null || (isRecord(usage) && Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens))),
      'ANALYSIS_RECORD_INVALID', '运行记录的被拒绝尝试无效。');
      refusedAttempt = {
        attempts: refused.attempts as number,
        wallMs: refused.wallMs as number,
        usage: usage === null ? null : { inputTokens: (usage as Record<string, number>).inputTokens!, outputTokens: (usage as Record<string, number>).outputTokens! },
      };
    }
    return { condition: record.condition, unitOrdinal: typeof record.unitOrdinal === 'number' ? record.unitOrdinal : null, refusedAttempt };
  }

  /** Whether the plan a Task holds was frozen under developer-live, where the launch sets the Run Budget Ceiling (Issue #541). */
  #launchSetsCeiling(taskIntentId: string): boolean {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1",
    ).get(taskIntentId) as SqlRow | undefined;
    if (row === undefined) return false;
    const envelope = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(envelope) && envelope.providerStatus === 'remote-eligible-developer-live';
  }

  /** Why a Run's interrupted outcome says it stopped (Issue #51, S16a); `null` for any other Run, or one with no outcome. */
  #runStop(runRecordId: string): RunStop | null {
    const row = this.#db.prepare("SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ? AND classification = 'interrupted'")
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(record) ? runStopOf(record.stop) : null;
  }

  /** The first question of a Run under way or stopped that still waits for its answer; `null` when none does. */
  #openClarificationOf(runRecordId: string, state: BaselineAnalysisRunState): { requestId: string; unitOrdinal: number; raisedAt: string } | null {
    if (!(state === 'admitted' || state === 'executing' || state === 'pausing' || state === 'paused' || state === 'resumable' ||
      state === 'awaiting-clarification')) return null;
    const open = this.clarificationsOf(runRecordId).find((entry) => entry.answer === null);
    return open === undefined ? null : { requestId: open.requestId, unitOrdinal: open.unitOrdinal, raisedAt: open.raisedAt };
  }

  /** How many turns each unit of a Run was given across its executions so far, from the spans its attempt recorded. */
  unitAttemptsOf(runRecordId: string): Map<number, number> {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const rows = this.#db.prepare(
      `SELECT s.unit_ordinal, count(*) turns FROM analysis_harness_spans s
       JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id
       WHERE a.run_record_id = ? AND s.unit_ordinal IS NOT NULL GROUP BY s.unit_ordinal`,
    ).all(runRecordId) as SqlRow[];
    return new Map(rows.map((row) => [asNumber(row.unit_ordinal), asNumber(row.turns)] as const));
  }

  /** The attempt and Execution Binding a Run persisted, for 续行 to go on under; `null` before it persisted them. */
  executionBindingOf(runRecordId: string): { attemptId: string; binding: ExecutionBindingRecord; bindingDigest: string; spanCount: number } | null {
    const attempt = this.#db.prepare('SELECT attempt_id FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (attempt === undefined) return null;
    const attemptId = asString(attempt.attempt_id);
    const row = this.#db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '执行尝试缺少执行绑定。');
    const binding = parseCanonicalJson(asString(row.canonical_json)) as ExecutionBindingRecord;
    requireAnalysis(canonicalRecord(binding).digest === asString(row.sha256) && binding.attemptId === attemptId, 'ANALYSIS_RECORD_INVALID', '执行绑定与其摘要不一致。');
    const spans = this.#db.prepare('SELECT count(*) total, max(ordinal) last FROM analysis_harness_spans WHERE attempt_id = ?').get(attemptId) as SqlRow;
    return { attemptId, binding, bindingDigest: asString(row.sha256), spanCount: spans.last === null ? 0 : asNumber(spans.last) };
  }

  /**
   * Startup reconciliation (CONT-014): every Run of this kind a stopped service left admitted, executing or pausing has
   * nothing running it. One pausing settles `paused` — the boundary it waited for is reached — and one admitted or
   * executing `resumable`, 任务已中断 · 可续行, its Run Authorization kept and nothing dispatched until 续行. A Run left
   * cancelling is named for the execution owner, which finishes the cancellation.
   */
  reconcileStoppedRuns(): { settled: number; cancelling: ReadonlyArray<string>; answered: ReadonlyArray<string> } {
    const rows = this.#db.prepare(
      `SELECT r.run_record_id,
              (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       WHERE i.kind = ?
       ORDER BY r.recorded_at, r.rowid`,
    ).all(this.#definition.kind) as SqlRow[];
    let settled = 0;
    const cancelling: string[] = [];
    // A Run that waits for an answer the editor has already given (Issue #422, S76d) — answered while another Run held
    // the slot, before AI7 closed — is named for the owner to take on, as CLAR-006 goes on without being asked again.
    const answered: string[] = [];
    for (const row of rows) {
      const runRecordId = asString(row.run_record_id);
      const state = row.last_state === null ? null : asString(row.last_state);
      if (state === 'pausing') {
        this.recordRunState(runRecordId, 'paused', { detail: RECONCILED_PAUSED_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'admitted' || state === 'executing') {
        this.recordRunState(runRecordId, 'resumable', { detail: RECONCILED_RESUMABLE_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'cancelling') {
        cancelling.push(runRecordId);
      } else if (state === 'awaiting-clarification' && this.clarificationsOf(runRecordId).every((entry) => entry.answer !== null)) {
        answered.push(runRecordId);
      }
    }
    return { settled, cancelling, answered };
  }

  /** Every Run of this kind waiting in Connectivity Wait, oldest first, with its Book. */
  waitingRuns(): Array<{ bookId: string; taskIntentId: string; runRecordId: string }> {
    const rows = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, i.book_id
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       WHERE i.kind = ?
         AND (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)
           = 'awaiting-connectivity'
       ORDER BY r.recorded_at, r.rowid`,
    ).all(this.#definition.kind) as SqlRow[];
    return rows.map((row) => ({ bookId: asString(row.book_id), taskIntentId: asString(row.task_intent_id), runRecordId: asString(row.run_record_id) }));
  }

  /**
   * Reconnect Preflight's local half (OFF-007, OFF-008, UI ADR 0008): whether the plan a waiting Run's
   * authorization bound still stands. The material inputs are re-derived from durable state exactly as an
   * unauthorized plan's are and compared with the bound version's; the answer is the labels of the fields that
   * moved, or none. A credential is not a material input — its absence is a blocker the service reads
   * separately, and never drift (OFF-009).
   */
  preflightDrift(runRecordId: string): ReadonlyArray<string> {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.task_intent_id, a.plan_envelope_sha256 FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    const version = this.#planVersionByEnvelopeDigest(asString(run.plan_envelope_sha256));
    requireAnalysis(version !== undefined && version.taskIntentId === intent.taskIntentId, 'ANALYSIS_RECORD_INVALID', '运行授权绑定的计划版本缺失。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, version.ordinal);
    const frozen = materialPlanInputsOfComponents(plan, intent.record);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    const live = this.#currentMaterialInputs(intent.bookId, intent.mode, frozen.selectedRange, manifest.units.length,
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, version.ordinal)));
    return diffMaterialPlanInputs(frozen, live).map((entry) => entry.label);
  }

  /**
   * A waiting Run that can never dispatch as it was authorized is blocked with its reasons (OFF-008): its bound
   * plan no longer stands, or this launch cannot carry it. The editor prepares the Task again — a Task Intent
   * holds one Run, so the way on is a new plan, never this one revised.
   */
  blockWaitingRun(runRecordId: string, reasons: ReadonlyArray<string>, cause: WaitingRunBlockCause): void {
    requireAnalysis(reasons.length > 0 && reasons.every((reason) => typeof reason === 'string' && reason.length > 0),
      'ANALYSIS_RUN_INVALID', '阻止运行需要写明原因。');
    requireAnalysis(cause === 'plan-moved' || cause === 'launch', 'ANALYSIS_RUN_INVALID', '阻止运行需要写明缘由。');
    requireAnalysis(this.currentRunState(runRecordId) === 'awaiting-connectivity', 'ANALYSIS_RUN_INVALID', '该运行已不在等待中。');
    // Why it was blocked travels in the state record's canonical detail (Issue #536): no schema change.
    this.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: reasons.join(' '), reasons: [...reasons], cause });
  }

  /**
   * Why a Run blocked before dispatch never ran (Issue #536; OFF-008): `plan-moved` when Reconnect Preflight found the
   * plan its authorization bound had moved, else `launch` — a block this launch made, or one recorded before the cause
   * was kept. `null` for a Run not blocked.
   */
  blockedByOf(runRecordId: string): 'plan-moved' | 'launch' | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'blocked-before-dispatch') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(record) && record.cause === 'plan-moved' ? 'plan-moved' : 'launch';
  }

  #insertRunState(runRecordId: string, sequence: number, state: BaselineAnalysisRunState, detail: Record<string, unknown>, recordedAt: string): void {
    const record = canonicalRecord({ runRecordId, sequence, state, recordedAt, ...detail });
    this.#db.prepare(
      'INSERT INTO analysis_run_states(run_record_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(runRecordId, sequence, state, recordedAt, record.json, record.digest);
  }

  // ---- execution persistence -------------------------------------------------------------------

  recordRunState(runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>): void {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const row = this.#db.prepare('SELECT max(sequence) last FROM analysis_run_states WHERE run_record_id = ?').get(runRecordId) as SqlRow;
    const last = row.last === null ? 0 : asNumber(row.last);
    requireAnalysis(last >= 1, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    this.#insertRunState(runRecordId, last + 1, state, detail, new Date().toISOString());
  }

  currentRunState(runRecordId: string): BaselineAnalysisRunState {
    const row = this.#db.prepare('SELECT state FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    return asString(row.state) as BaselineAnalysisRunState;
  }

  /**
   * The frozen plan of one Run. For an update Task the reuse plan is re-derived from the same inputs
   * and must digest to the recorded plan component; any drift refuses execution before a model call.
   */
  loadExecutionPlan(runRecordId: string): ExecutionPlanFacts {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, a.plan_envelope_sha256
       FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    // The Run executes exactly the plan version its authorization bound, never a later one.
    const version = this.#planVersionByEnvelopeDigest(asString(run.plan_envelope_sha256));
    requireAnalysis(version !== undefined && version.taskIntentId === intent.taskIntentId, 'ANALYSIS_RECORD_INVALID', '运行授权绑定的计划版本缺失。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, version.ordinal);
    const digests = this.#planDigests(intent.taskIntentId, version.ordinal);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const providerPlan = plan['provider-resolution-plan'] as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>;
    const runBudgetCeiling = runBudgetCeilingStateOf(providerPlan.runBudgetCeiling);
    // The route the plan froze must still be the route this launch binds. A developer-live plan
    // cannot execute under a provider-free launch, and a deterministic plan cannot execute live.
    const live = this.#launch.live;
    if (live !== null) {
      requireAnalysis(providerPlan.executionRoute.kind === live.route && providerPlan.executionRoute.model === live.model &&
        providerPlan.executionRoute.endpoint === live.endpoint, 'ANALYSIS_ROUTE_STALE', '当前启动的实时路由与冻结计划不一致。');
      requireAnalysis(providerPlan.remoteBinding.credentialReference === live.credentialReference &&
        canonicalJson(runBudgetCeiling) === canonicalJson(resolveDeveloperLiveCeiling(live.runBudgetCeiling, manifest.units.length)),
      'ANALYSIS_ROUTE_STALE', '当前启动的凭据引用或运行预算上限与冻结计划不一致。');
    } else {
      requireAnalysis(providerPlan.executionRoute.kind === LOCAL_DETERMINISTIC_ROUTE, 'ANALYSIS_ROUTE_ABSENT', '计划没有可执行的本地路由。');
      requireAnalysis(this.#route !== null && this.#route.fixtureIdentity === providerPlan.executionRoute.fixtureIdentity &&
        this.#route.fixtureSha256 === providerPlan.executionRoute.fixtureSha256, 'ANALYSIS_ROUTE_STALE', '当前启动的本地路由与冻结计划不一致。');
    }
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const artifactPin = plan['artifact-pin'] as { nativeCarrierSha256: string; sidecarSha256: string };
    // What the editor left out (Issue #419), read from the execution plan and matched by the adaptations the envelope's
    // split names, which the Run Authorization bound: the two are written together and never disagree. Only a class the
    // editor withdrew is looked for — the split's words, and a class a later release adds, are not a plan's to answer.
    let editorEdits: PlanEdits;
    try {
      editorEdits = planEditsOf(plan['execution-plan']);
    } catch {
      throw new AnalysisError('ANALYSIS_RECORD_INVALID', '计划记录的修改无效。');
    }
    const split = envelope.boundary as PlanBoundarySplitProjection | undefined;
    // Only the classes the editor withdrew, or moved into 先问你 (Issue #422, S76d), are looked for: neither may be in the
    // adaptable list, and each moved one is in the split's own.
    const withdrawn: ReadonlyArray<string> = editorEdits.disallowedAdaptations;
    const asked: ReadonlyArray<string> = editorEdits.askFirstAdaptations ?? [];
    requireAnalysis(split === undefined || (!split.adaptable.some((entry) => withdrawn.includes(entry.adaptationClass) || asked.includes(entry.adaptationClass)) &&
      asked.every((adaptationClass) => (split.askFirst ?? []).some((entry) => entry.adaptationClass === adaptationClass))),
      'ANALYSIS_RECORD_INVALID', '计划信封与计划修改不一致。');
    // Outside developer-live the ceiling the Run is held to is the one the editor set in this version, or none (Issue #51).
    requireAnalysis(live !== null || canonicalJson(runBudgetCeiling) === canonicalJson(planEditCeiling(editorEdits)),
      'ANALYSIS_RECORD_INVALID', '计划的预算上限与计划修改不一致。');
    let update: ExecutionUpdateFacts | null = null;
    if (this.#carriesPlan(intent.mode)) {
      const latestRow = this.#revisionRows(intent.bookId).at(-1);
      let predecessor: ReusePlanPredecessor | ScopePlanPredecessor | null = null;
      if (this.#isInitial(intent.mode)) {
        // A range-bound first Task still starts the Result Set at dispatch, or it does not start.
        requireAnalysis(intent.predecessorRevisionId === null && latestRow === undefined,
          'ANALYSIS_PREDECESSOR_DRIFT', '本图书已存在结果集修订版；未开始执行。');
      } else {
        requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
        const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
        requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
          'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；未开始执行。');
        predecessor = this.#planPredecessor(predecessorRow);
      }
      const stored = plan['reuse-plan'] as AnalysisPlanRecord;
      const rederived = this.#derivePlan(intent.mode, stored.selectedRange, manifest, predecessor);
      const record = reusePlanRecord(rederived);
      requireAnalysis(record.digest === digests['reuse-plan'] && canonicalJson(stored) === record.json && envelope.reusePlanDigest === record.digest,
        'ANALYSIS_REUSE_PLAN_DRIFT', '重新推导的复用计划与冻结计划不一致；未开始执行。');
      update = {
        mode: intent.mode,
        selectedRange: stored.selectedRange,
        predecessor: predecessor === null ? null : {
          revisionId: predecessor.revisionId,
          ordinal: predecessor.ordinal,
          digest: predecessor.digest,
          coverageManifestDigest: predecessor.coverageManifestDigest,
          manifest: predecessor.manifest,
        },
        reusePlan: rederived,
        reusePlanDigest: record.digest,
      };
    }
    return {
      bookId: intent.bookId,
      taskIntentId: intent.taskIntentId,
      runRecordId,
      planVersionId: version.planVersionId,
      planVersionOrdinal: version.ordinal,
      checkpoint: {
        bookId: intent.bookId,
        manuscriptId: asString(checkpointRow.manuscript_id),
        branchId: asString(checkpointRow.branch_id),
        revisionId: asString(checkpointRow.revision_id),
        revisionLabel: asString(checkpointRow.revision_label),
        revisionDigest: asString(checkpointRow.revision_digest),
        journalSequence: asNumber(checkpointRow.journal_sequence),
        createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
      },
      manifest,
      manifestDigest: manifest.digest,
      planEnvelopeDigest: asString(run.plan_envelope_sha256),
      runSourceScopeDigest: asString(digests['run-source-scope']),
      providerResolutionPlanDigest: asString(digests['provider-resolution-plan']),
      credentialReference: providerPlan.remoteBinding.credentialReference,
      sourceDigest: (plan['manuscript-pin'] as { sourceDigest: string }).sourceDigest,
      // The deterministic fixture facts; `null` on the live route, which replays no fixture.
      route: this.#route,
      artifactPin: { nativeCarrierSha256: artifactPin.nativeCarrierSha256, sidecarRevision: 2, sidecarSha256: artifactPin.sidecarSha256 },
      promptContractDigest: asString(envelope.promptContractDigest),
      behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
      runBudgetCeiling,
      update,
      editorEdits,
    };
  }

  readRevisionBlocks(manuscriptId: string, revisionId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(revisionId), 'ANALYSIS_RECORD_INVALID', '修订版身份无效。');
    const rows = this.#db.prepare(
      `SELECT version.block_id, version.position, version.kind, version.level, version.text, version.digest, version.grapheme_length
       FROM manuscript_block_versions version
       JOIN manuscript_blocks block ON block.block_id = version.block_id AND block.manuscript_id = ?
       WHERE version.revision_id = ? ORDER BY version.position`,
    ).all(manuscriptId, revisionId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  /** The current working blocks of one branch: what the next Task Input checkpoint would materialize. */
  readWorkingBlocks(branchId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(branchId), 'ANALYSIS_RECORD_INVALID', '分支身份无效。');
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? ORDER BY position`,
    ).all(branchId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  #blockInput(row: SqlRow): ManifestBlockInput {
    return {
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManifestBlockInput['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
      graphemes: asNumber(row.grapheme_length),
    };
  }

  /** The closed unit results of one revision, parsed back into contract results for reuse by lineage. */
  loadPredecessorUnitResults(revisionId: string): Map<number, PredecessorUnitResult> {
    requireAnalysis(UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const rows = this.#db.prepare("SELECT * FROM analysis_unit_results WHERE revision_id = ? AND state = 'closed' ORDER BY unit_ordinal").all(revisionId) as SqlRow[];
    const results = new Map<number, PredecessorUnitResult>();
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      const unitOrdinal = asNumber(row.unit_ordinal);
      requireAnalysis(record.state === 'closed' && record.unitOrdinal === unitOrdinal, 'ANALYSIS_RECORD_INVALID', '前一修订版的单元结果无效。');
      results.set(unitOrdinal, {
        unitOrdinal,
        requestDigest: asString(record.requestDigest),
        responseDigest: asString(record.responseDigest),
        usage: record.usage as PredecessorUnitResult['usage'],
        // Which keys a closed unit record carries is the kind's to know: its definition wrote them
        // (`unitRecord`) and its definition reads them back.
        result: this.#definition.unitResultOfRecord(record, unitOrdinal),
      });
    }
    return results;
  }

  /** The attempt and its Execution Binding are written together, before the first model call. */
  persistAttemptAndBinding(input: {
    runRecordId: string;
    binding: ExecutionBindingRecord;
    credentialReadiness: 'present' | 'missing';
  }): { bindingDigest: string } {
    const startedAt = input.binding.boundAt;
    const attempt = canonicalRecord({
      attemptId: input.binding.attemptId,
      runRecordId: input.runRecordId,
      ordinal: 1,
      startedAt,
      dispatchAttribution: 'Dispatch',
      credentialReadinessCheck: {
        modelRole: 'Main Editorial Role',
        slot: input.binding.credentialSlot.slot,
        credentialReference: input.binding.credentialSlot.credentialReference,
        readiness: input.credentialReadiness,
        valueReleased: false,
        checkedAt: startedAt,
      },
    });
    const binding = canonicalRecord(input.binding);
    transact(this.#db, () => {
      this.#db.prepare(
        'INSERT INTO analysis_execution_attempts(attempt_id, run_record_id, ordinal, started_at, canonical_json, sha256) VALUES (?, ?, 1, ?, ?, ?)',
      ).run(input.binding.attemptId, input.runRecordId, startedAt, attempt.json, attempt.digest);
      this.#db.prepare(
        'INSERT INTO analysis_execution_bindings(attempt_id, harness_session_id, bound_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)',
      ).run(input.binding.attemptId, input.binding.harnessSessionId, startedAt, binding.json, binding.digest);
    });
    return { bindingDigest: binding.digest };
  }

  /** The units an attempt recorded a turn for: what it submitted, as far as the ledger knows. */
  submittedUnitCount(attemptId: string): number {
    const row = this.#db.prepare('SELECT count(DISTINCT unit_ordinal) submitted FROM analysis_harness_spans WHERE attempt_id = ? AND unit_ordinal IS NOT NULL')
      .get(attemptId) as SqlRow;
    return asNumber(row.submitted);
  }

  /** One technical turn by reference; from Issue #48 also which attempt of its unit it was and the payload digest the gate admitted. */
  recordSpan(
    attemptId: string,
    ordinal: number,
    span: { sessionId: string; startSeq: number; endSeq: number },
    unitOrdinal: number | null,
    turn: { attemptIndex: number; payloadDigest: string | null } = { attemptIndex: 1, payloadDigest: null },
  ): void {
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      spanId: randomUUID(), attemptId, ordinal, harnessSessionId: span.sessionId, startSeq: span.startSeq, endSeq: span.endSeq, unitOrdinal, recordedAt,
      attemptIndex: turn.attemptIndex, payloadDigest: turn.payloadDigest,
    });
    const spanId = (parseCanonicalJson(record.json) as { spanId: string }).spanId;
    this.#db.prepare(
      `INSERT INTO analysis_harness_spans(span_id, attempt_id, ordinal, harness_session_id, start_seq, end_seq, unit_ordinal, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(spanId, attemptId, ordinal, span.sessionId, span.startSeq, span.endSeq, unitOrdinal, recordedAt, record.json, record.digest);
  }

  /** The durable `safe-retry` Plan Adaptation, written before the retry is dispatched; immutable like every ledger row. */
  recordAdaptation(input: PlanAdaptationInput): { adaptationId: string; digest: string; recordedAt: string } {
    const adaptationId = randomUUID();
    const recordedAt = new Date().toISOString();
    const built = buildPlanAdaptationRecord({ adaptationId, ...input, attemptIndex: 2, recordedAt });
    this.#db.prepare(
      `INSERT INTO analysis_plan_adaptations(adaptation_id, attempt_id, ordinal, unit_ordinal, adaptation_class, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, 'safe-retry', ?, ?, ?)`,
    ).run(adaptationId, input.attemptId, input.ordinal, input.unitOrdinal, recordedAt, built.json, built.digest);
    return { adaptationId, digest: built.digest, recordedAt };
  }

  /**
   * Append one immutable Result Set Revision with the next ordinal on the Book's Result Set. A
   * first-baseline revision keeps the `/1` record shape; a successor revision is a `/2` record that
   * adds the update facts (mode, predecessor identity and digest, reuse-plan digest, counts) and the
   * per-unit lineage. The predecessor rows are never touched.
   */
  persistRevision(input: RevisionPersistInput): { resultSetId: string; revisionId: string; ordinal: number; digest: string } {
    const { facts } = input;
    const live = this.#launch.live;
    const createdAt = new Date().toISOString();
    return transact(this.#db, () => {
      const kind = this.#definition.kind;
      let resultSetRow = this.#db.prepare('SELECT result_set_id FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(facts.bookId, kind) as SqlRow | undefined;
      if (resultSetRow === undefined) {
        const resultSetId = randomUUID();
        const record = canonicalRecord({ resultSetId, bookId: facts.bookId, kind, createdAt });
        this.#db.prepare('INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
          .run(resultSetId, facts.bookId, kind, createdAt, record.json, record.digest);
        resultSetRow = { result_set_id: resultSetId };
      }
      const resultSetId = asString(resultSetRow.result_set_id);
      const ordinalRow = this.#db.prepare('SELECT count(*) total, max(ordinal) latest FROM analysis_result_set_revisions WHERE result_set_id = ?').get(resultSetId) as SqlRow;
      const ordinal = asNumber(ordinalRow.total) + 1;
      if (facts.update !== null) {
        // A plan with a predecessor appends directly after it; a range-bound first Task's plan has none
        // and must still be the revision that starts the Result Set.
        const predecessor = facts.update.predecessor;
        requireAnalysis(predecessor === null
          ? ordinal === 1
          : asNumber(ordinalRow.latest) === predecessor.ordinal && ordinal === predecessor.ordinal + 1,
        'ANALYSIS_PREDECESSOR_DRIFT', '前一修订版已不再是结果集的最新修订版；后继修订版未写入。');
      }
      const revisionId = randomUUID();
      const successor = facts.update !== null;
      const unitRecords = input.units.map((unit) => {
        const lineage = successor ? { lineage: unit.lineage } : {};
        const body = unit.closed.state === 'closed'
          ? {
              unitOrdinal: unit.unitOrdinal,
              state: 'closed',
              requestDigest: unit.requestDigest,
              responseDigest: unit.closed.responseDigest,
              usage: unit.closed.usage,
              ...lineage,
              ...(unit.closed.result as Record<string, unknown>),
            }
          : { unitOrdinal: unit.unitOrdinal, state: 'gap', requestDigest: unit.requestDigest, ...lineage, gap: unit.closed.gap };
        return { unitOrdinal: unit.unitOrdinal, state: unit.closed.state, record: canonicalRecord(body) };
      });
      const base = {
        schema: successor ? this.#definition.successorRevisionSchema : this.#definition.revisionSchema,
        kind,
        contractVersion: this.#definition.contractVersion,
        resultSetId,
        revisionId,
        ordinal,
        createdAt,
        manuscriptPin: {
          bookId: facts.bookId,
          manuscriptId: facts.checkpoint.manuscriptId,
          revisionId: facts.checkpoint.revisionId,
          revisionLabel: facts.checkpoint.revisionLabel,
          revisionDigest: facts.checkpoint.revisionDigest,
        },
        coverageManifestDigest: facts.manifestDigest,
        schemaDigest: this.#definition.schemaDigest,
        reducerDigest: this.#definition.reducerDigest,
        // The revision pins the route that produced it: the fixture on the deterministic route, the
        // live route's own identity when the Run actually transmitted.
        adapterPin: live === null
          ? { route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, fixtureIdentity: facts.route!.fixtureIdentity, fixtureSha256: facts.route!.fixtureSha256 }
          : { route: live.route, model: live.model, fixtureIdentity: null, fixtureSha256: null },
        bindingPin: {
          attemptId: input.attemptId,
          bindingDigest: input.bindingDigest,
          harnessSessionId: input.harnessSessionId,
          behaviorCompositionDigest: facts.behaviorCompositionDigest,
          promptContractDigest: facts.promptContractDigest,
        },
        policyPin: live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0 }
          : { operationalScope: 'developer-live', providerProcessingVersion: 'v5', activePolicySetVersion: 'v5', liveTransmissions: 'bounded-by-run' },
        provenance: {
          taskIntentId: facts.taskIntentId,
          runRecordId: facts.runRecordId,
          attemptId: input.attemptId,
          planVersion: facts.planVersionOrdinal,
          adaptations: { count: input.adaptedUnitOrdinals.length, unitOrdinals: [...input.adaptedUnitOrdinals] },
        },
        usage: input.usage,
        coverage: input.reduction.coverage,
        reducerClosure: input.reduction.reducerClosure,
        assurance: input.reduction.assurance,
        gaps: input.reduction.gaps,
        // The kind's own components: the baseline's conflicts, cross-unit findings, sections, and
        // synthesis; the factual kind's findings, excluded appendix, assertion counts, and research
        // disclosure. Canonical JSON sorts keys, so the record's bytes do not depend on this order.
        ...input.reduction.components,
        unitDigests: unitRecords.map((unit) => ({ unitOrdinal: unit.unitOrdinal, state: unit.state, sha256: unit.record.digest })),
      };
      const body = canonicalRecord(facts.update === null ? base : {
        ...base,
        update: {
          mode: facts.update.mode,
          predecessor: facts.update.predecessor === null
            ? null
            : { revisionId: facts.update.predecessor.revisionId, ordinal: facts.update.predecessor.ordinal, digest: facts.update.predecessor.digest },
          reusePlanDigest: facts.update.reusePlanDigest,
          selectedRange: facts.update.selectedRange,
          counts: facts.update.reusePlan.counts,
        },
        lineage: input.units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      });
      this.#db.prepare(
        `INSERT INTO analysis_result_set_revisions(
           revision_id, result_set_id, ordinal, task_intent_id, run_record_id, attempt_id, manuscript_revision_id,
           manuscript_revision_digest, coverage_manifest_sha256, contract_version, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(revisionId, resultSetId, ordinal, facts.taskIntentId, facts.runRecordId, input.attemptId, facts.checkpoint.revisionId,
        facts.checkpoint.revisionDigest, facts.manifestDigest, this.#definition.contractVersion, createdAt, body.json, body.digest);
      const insertUnit = this.#db.prepare('INSERT INTO analysis_unit_results(revision_id, unit_ordinal, state, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)');
      for (const unit of unitRecords) insertUnit.run(revisionId, unit.unitOrdinal, unit.state, unit.record.json, unit.record.digest);
      return { resultSetId, revisionId, ordinal, digest: body.digest };
    });
  }

  recordOutcome(input: {
    taskIntentId: string;
    runRecordId: string;
    classification: keyof typeof OUTCOME_LABELS;
    resultSetRevisionId: string | null;
    summary: string;
    safeNextAction: string;
    /**
     * The Run Report of the Run this outcome settles (ADR 0066 §Run Report). It is written here,
     * once, inside the outcome's canonical JSON and beside the digest of its own canonical form;
     * the outcomes relation is insert-only under the immutability triggers, so nothing rewrites it.
     */
    report: RunReportRecord;
    /** Why an interrupted Run stopped, when the Run Budget Ceiling stopped it (Issue #51, S16a); named only then. */
    stop?: RunStop;
  }): void {
    const outcomeId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      outcomeId,
      taskIntentId: input.taskIntentId,
      runRecordId: input.runRecordId,
      classification: input.classification,
      resultSetRevisionId: input.resultSetRevisionId,
      summary: input.summary,
      safeNextAction: input.safeNextAction,
      report: input.report,
      reportDigest: runReportDigest(input.report),
      recordedAt,
      ...(input.stop === undefined ? {} : { stop: { ...input.stop } }),
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_outcomes(outcome_id, task_intent_id, run_record_id, classification, result_set_revision_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(outcomeId, input.taskIntentId, input.runRecordId, input.classification, input.resultSetRevisionId, recordedAt, record.json, record.digest);
  }

  /** Unit request digests for the frozen manifest, in unit order. */
  unitRequestDigests(manifest: CoverageManifestProjection, promptContractDigest: string): string[] {
    return manifest.units.map((unit) => unitRequestDigest(promptContractDigest, unit.ordinal, unit.digest));
  }

  // ---- shared bindings -------------------------------------------------------------------------

  #binding(bookId: string, checkpoint?: ManuscriptCheckpointBinding, enforceHead = true): {
    manuscriptId: string;
    branchId: string;
    sourceVersionId: string;
    credentialReference: string;
    credentialOperationState: ModelCredentialOperationState;
  } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, mb.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest,
              mr.source_version_id, sv.source_digest,
              pin.sidecar_revision, pin.sidecar_sha256, installation.content_sha256 native_carrier_sha256,
              connection.credential_reference, connection.credential_operation_state
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ${checkpoint === undefined ? 'bws.base_revision_id' : '?'}
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
       LEFT JOIN editorial_workspace_profile_book_pins pin ON pin.book_id = m.book_id
         AND pin.native_artifact_id = '@ai7/editorial-workspace-profile'
         AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       LEFT JOIN native_artifact_installations installation ON installation.artifact_id = pin.native_artifact_id
       LEFT JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY pin.sidecar_revision DESC`,
    ).get(...(checkpoint === undefined ? [bookId] : [checkpoint.revisionId, bookId])) as SqlRow | undefined;
    requireAnalysis(row !== undefined && row.source_digest === SAMPLE1_SOURCE_DIGEST,
      'ANALYSIS_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。');
    requireAnalysis(row.native_carrier_sha256 === NATIVE_CARRIER_DIGEST && row.sidecar_revision === 2 && row.sidecar_sha256 === SIDECAR_DIGEST,
      'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案 Revision 2。');
    requireAnalysis(typeof row.credential_operation_state === 'string' && typeof row.credential_reference === 'string',
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    const state = asString(row.credential_operation_state);
    requireAnalysis((state === 'ready' || state === 'missing' || state === 'needs-attention') && UUID_PATTERN.test(asString(row.credential_reference)),
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    if (checkpoint !== undefined && enforceHead) {
      requireAnalysis(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId &&
        row.base_revision_id === checkpoint.revisionId && row.journal_sequence === checkpoint.journalSequence &&
        row.working_digest === checkpoint.revisionDigest,
      'ANALYSIS_CHECKPOINT_STALE', '任务输入固定点已经变化。');
    } else if (checkpoint !== undefined) {
      requireAnalysis(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId,
        'ANALYSIS_CHECKPOINT_STALE', '任务输入固定点不属于当前稿件。');
    }
    return {
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      sourceVersionId: asString(row.source_version_id),
      credentialReference: asString(row.credential_reference),
      credentialOperationState: state,
    };
  }

  /**
   * A plan may be frozen only under a verified launch policy that matches the bound launch: the
   * provider-free `development-ci` v1 denial, or the `developer-live` v5 eligibility whose live
   * binding this store already holds. An unverified or mismatched policy freezes nothing.
   */
  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireAnalysis(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === this.#launch.operationalScope && policy.activePolicySetVersion === 'v5',
    'ANALYSIS_POLICY_UNAVAILABLE', '可信启动策略与已绑定的可信区间不一致。');
    if (this.#launch.live !== null) {
      requireAnalysis(policy.providerProcessing.version === 'v5' && policy.providerProcessing.decision === 'eligible-only' &&
        policy.providerProcessing.authorizedLiveTransmissionCount === 'bounded-by-run' && policy.providerProcessing.liveTransmissionAllowed === true,
      'ANALYSIS_POLICY_UNAVAILABLE', '无法建立可信的 developer-live Provider Processing v5 记录。');
      return;
    }
    requireAnalysis(policy.providerProcessing.version === 'v1' && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 && policy.providerProcessing.liveTransmissionAllowed === false,
    'ANALYSIS_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing v1 拒绝记录。');
  }
}

export { AnalysisError, isRecord };
