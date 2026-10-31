import { currentPreinstalledVersion, selectedProcedureForBook, resolveProcedureForKind, readProcedurePlanView, procedureStopped, validateProcedureEdit } from '../procedures/editable.js';
import { withProcedureDefinition, procedureInstruction } from '../procedures/execution.js';
import { MODEL_REQUEST_ADMISSION_SCHEMA_VERSION } from '../task-authorization.js';
import { procedureIdForKind, FACTUAL_CLAIM_PROCEDURE_ID } from '../procedures/preinstalled.js';
import { recordProcedurePlanPin, readProcedurePlanPin, resolveProcedureDefinition } from '../procedures/definition-store.js';
import { withReviewLocalTools, pinnedReviewDefinition, reviewCategoryKindDefinition } from '../review/review-category-kind.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryEntry, reviewCategoryContractInput } from '../review/category-configuration.js';
import type { CompositionOptions } from '../harness/primary-agent-harness.js';
import type { PinnedLocalToolSources } from '../retrieval/index.js';
import { kindResearchDeclaration } from './live-kind-admission.js';
import { factualReviewDefinitionsByDigest, factualReviewKindDefinition, factualReviewLevelDefinition, withFactualResearch } from './kind-definition.js';
import { factualClaimKindDefinition } from './factual-claim-contract.js';
import { FACTUAL_REVIEW_KIND, type EvidenceAssuranceLevel, type ProcedureDefinitionPin } from '../../shared/protocol.js';
import { FACTUAL_VERIFICATION_POLICY_VERSION } from './factual-review-contract.js';
import { factualReviewUnitResultOfRecordV2 } from './factual-review-contract-v2.js';
import { platformToolsFromProjection } from '../provider/search-service.js';
import { searchBackend, searchBackendConfigurationDigest } from '../provider/search-backends/index.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/provider-configuration.generated.js';
import type { FrozenWebToolsBackend, FrozenWebToolsFallback } from '../../shared/protocol.js'; import { freezeSearchFallback } from '../provider/search-backend-settings.js';
import { isResultSetPolicyPin, selectedPolicyIdentityOf, type LocalFixtureProfile, type SelectedPolicyIdentity } from '../../shared/protocol.js';
import { STOCK_TYPOS_LEAF_FIXTURE, STOCK_TYPOS_LEAF_FIXTURE_SHA256, STOCK_TYPOS_LEAF_LOCAL_TOOLS, localFixtureRegisteredProfile, type LocalFixtureRuntimeContext } from '../provider/model-fixture.js';
import { providerPlanPolicyMetadata } from './plan-boundary.js';
import { randomUUID } from 'node:crypto';
import { liveKindAdmission, liveKindRule } from './live-kind-admission.js';
import { withModelClarification } from '../provider/clarification-contract.js';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  BASELINE_ANALYSIS_KIND,
  EVALUATION_REWRITE_KIND,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
  WRITING_KIND,
  type AnalysisAssuranceSampleDispositionProjection,
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
  type AnalysisInFlightUnitProjection,
  type RunBudgetCeilingState,
  type SafeRetryRepetition,
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
  type PlanAdaptationRecord,
} from './plan-boundary.js';
import {
  NO_PLAN_EDITS,
  PLAN_CEILING_LAUNCH_REASON,
  canonicalPlanEdits,
  planEditCeiling,
  planEditAssuranceLevel,
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
  clarificationGraphemes,
  modelClarificationExpired,
  parseModelClarification,
  type ModelClarificationQuestion,
  type AnyClarificationOptionId,
  type ClarificationFacts,
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
import { saysCarried, saysOutcomeUnknown } from './outcome-unknown.js';
import { deriveCoverageManifest, manifestCoversEveryBlock, manifestDigestIsExact, unitContentKeys, type ManifestBlockInput } from './coverage-manifest.js';
import {
  manifestWeight,
  UnreadWalkCache,
  unreadWalkWeight,
  walkUnreadChanges,
  type ChainRevision,
  type UnreadWalk,
  type UnreadWalkCut,
} from './unread-changes.js';
import { TASK_INPUT_CHECKPOINT_PURPOSE } from './identity.js';
import { ACTIVE_SET_VERSION, DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, ORDINARY_PRODUCTION_ALLOWED_BINDINGS, ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, searchFallbackTermsOf } from '../launch-policy.js';
import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import { MAX_TASK_INTENT_GOAL_LENGTH, MODEL_SERVICE_SETUP_REQUIRED_REASON } from '../../shared/protocol.js';
import type { AnalysisKindDefinition, AnalysisReductionResult } from './kind-definition.js';
import {
  deriveReusePlan,
  deriveScopePlan,
  requireSelectedRange,
  reusePlanRecord,
  type ReusePlanPredecessor,
  type ScopePlanPredecessor,
} from './reuse-plan.js';
import {
  NO_TASK_OUTCOME_REASON,
  PRE_RUN_REPORT_REASON,
  RUN_REPORT_NO_USAGE,
  buildRunReport,
  runReportDigest,
  runReportProjection,
  runReportReflectionNotRun,
  type RunReportRecord,
} from './run-report.js';
import { assuranceSampleNotRun, type CrossUnitOutcome } from './reducers.js';
import { baselineAnalysisKindDefinition } from './kind-definition.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, assuranceSamplingTurns, buildAssuranceSamplingMessage, type AssuranceSampleDraw } from './assurance-sampling-contract.js';
import { describeComposition, STOCK_TYPOS_FANOUT, STOCK_TYPOS_LEAF } from '../harness/primary-agent-harness.js';
import { kindLocalTools } from './live-kind-admission.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../provider/egress-gate.js';
import type { AnalysisOutcomeAttentionReading, AnalysisTaskAttentionReading } from '../global-attention.js';
import { PLAN_MOVED_LABEL, type WaitingRunBlockCause } from '../reconnect-preflight.js';
import { isPublicSampleBookSourceDigest, SAMPLE1_PUBLIC_SAMPLEBOOK } from '../../shared/public-samplebooks.js';
import { ANALYSIS_LINEAGE_UNAVAILABLE_REASON } from '../../shared/public-samplebook-labels.js';

type SqlRow = Record<string, SQLOutputValue>;

/** The exact `sample1` source digest, the ADR 0044 baseline among the Public SampleBooks every non-production analysis Task requires. */
export const SAMPLE1_SOURCE_DIGEST = SAMPLE1_PUBLIC_SAMPLEBOOK.sha256;
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
const SUCCESSOR_BEHAVIOR ='每次更新都是新的用户发起任务，经准备 → 计划预览 → 标准直接授权 → 执行后，在同一结果集上追加下一序号的不可变后继修订版；前一修订版不被改写，且始终可在修订历史中按其原始稿件 pin 查看。' as const;
/** 重新分析这段's paragraphs are no longer in the working manuscript, or out of order (Issue #423 review, P3-3). */
const SELECTED_BLOCKS_GONE = '所选文字所在的段落已不在当前稿件中，或先后颠倒；请重新选择。' as const;
/** A range Task's paragraphs no longer stand at the positions its plan names (Issue #423 review, P3-4). */
const SELECTED_RANGE_MOVED = '所选范围的段落在准备之后已移动或删除；请重新选择范围，再准备这项任务。' as const;
/**
 * What an active Run of a kind is called, and what it keeps from being prepared (Issue #760 review): the baseline's 分析任务
 * and 更新任务, a 写作任务's own, 评估's for AI7 初评, 审稿意见 and 按我的评分重写评语, and 审阅's for a review category's Task.
 */
function activeRunWords(kind: string): { readonly task: string; readonly next: string } {
  if (kind === BASELINE_ANALYSIS_KIND) return { task: '分析任务', next: '新的更新任务' };
  if (kind === WRITING_KIND) return { task: '写作任务', next: '新的写作任务' };
  if (kind === INITIAL_EVALUATION_KIND || kind === READERS_REPORT_KIND || kind === EVALUATION_REWRITE_KIND) return { task: '评估任务', next: '新的评估任务' };
  return { task: '审阅任务', next: '新的审阅' };
}
/** A queued Run's own words (Issue #49, S14; CONC-007): what it waits for, and that nothing has begun. */
export const RUN_QUEUED_LABEL = '等待运行名额' as const;
/** A start the editor deferred to idle time (Issue #1089; ADR 0095 §3): authorized, holding no place until quiet. */
export const RUN_WAITING_IDLE_LABEL = '等待空闲' as const;
/** A background Run AI7 paused at a unit boundary for the editor's waiting Run (Issue #1089); it goes on at the next quiet. */
export const RUN_IDLE_YIELD_LABEL = '让位给你的任务' as const;
/** The waiting state's own words (Issue #502, OFF-005): recorded, and nothing has been sent or begun. */
const CONNECTIVITY_WAIT_DETAIL = '已记录授权；联网并通过重新联网预检后开始。此前不调用模型、不产生用量。' as const;

/**
 * Why a mode that reads only what changed is not on offer: nothing has changed. The mode's own label
 * closes the sentence, so the baseline kind reads `…后才可同步到当前稿件。` exactly as it always has and
 * a review category names its own action.
 */
/** A frozen reuse plan the chain no longer derives (#711 review P3-4): at dispatch, and before authorization. */
export const REUSE_PLAN_DRIFT_REASON = '重新推导的复用计划与冻结计划不一致；未开始执行，请重新准备。' as const;
export const REUSE_PLAN_DRIFT_AUTHORIZE_REASON = '重新推导的复用计划与冻结计划不一致；无法授权，请重新准备。' as const;

/**
 * How much one ledger keeps of its walks and of revisions as a walk reads them (Issue #716): a few entries, and no more
 * block references than a large manuscript's handful of manifests hold. The least recently used is let go first.
 *
 * The chain cache is bounded four times wider than the walk cache (Issue #727). A walk reads its chain newest-first to
 * the chain's first Run whenever a chapter stands unread, so once a chain outgrows the bound the walk evicts, in order,
 * exactly what the next walk asks for first, and every revision is read from SQLite again at each new latest revision:
 * a cliff, not a decline (`tests/unit/unread-changes.test.ts` measures it). At 262,144 the chain of a ~3,000-block
 * manuscript (~4,700 weight a revision) stays cached to some 55 revisions, the entry bound's neighbourhood; the walk
 * cache, one walk per latest revision, keeps its bound.
 */
export const UNREAD_WALK_CACHE_ENTRIES = 16;
export const CHAIN_REVISION_CACHE_ENTRIES = 64;
export const UNREAD_WALK_CACHE_WEIGHT = 65_536;
export const CHAIN_REVISION_CACHE_WEIGHT = 4 * UNREAD_WALK_CACHE_WEIGHT;

type ChainRevisionRead = { readonly revision: ChainRevision; readonly predecessorRevisionId: string | null } | 'unreadable';

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
export const RUN_CANCELLING_DETAIL = '编辑取消了这项任务；正在进行的这一步会被中止，此后不再发送任何内容。' as const;

/** What `pausing` records (CTRL-001): the editor's word, and where the Run stops to wait. */
export const RUN_PAUSING_DETAIL = '编辑暂停了这项任务；正在进行的这一步完成后停下，不再开始下一步，已完成的结果与用量都会保存。' as const;

/** What reconciliation records for a Run AI7 stopped under (CONT-014): nothing of it runs, and nothing is sent until 续行. */
export const RECONCILED_RESUMABLE_DETAIL = 'AI7 上次关闭时这项任务正在运行；已读完的阅读范围都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。' as const;
export const RECONCILED_PAUSED_DETAIL = 'AI7 上次关闭时这项任务正在暂停；已读完的阅读范围都已保存，任务已暂停。' as const;
/** A Run left yielded at a restart (Issue #1089; ADR 0034): it no longer goes on by itself at the next quiet. */
export const RECONCILED_YIELDED_DETAIL = 'AI7 上次关闭时这项任务正让位给你的任务；已读完的阅读范围都已保存，任务已暂停，点「续行」接着处理。' as const;
/**
 * A start AI7 closed on while it waited for a place (Issue #49 review; ADR 0034): it never began, and a restart starts
 * nothing by itself, so it is blocked before dispatch with why, and the editor starts it again when they choose.
 */
/**
 * What reconciliation records for a Run of a kind that cannot resume (Issue #429 review, P1): AI7 closed while it ran,
 * its results lived only in the Run it lost, and nothing of it will be sent again. It ends 已中断 with this outcome, and
 * the editor prepares the Task again — the kind's own surface offers that at once.
 */
export const RECONCILED_INTERRUPTED_DETAIL =
  'AI7 上次关闭时这项任务正在运行；这类任务不能续行，已读的内容没有形成结果集修订版，此后不会再发送任何内容。需要时请重新准备并开始。' as const;
/** Why such a Run's later stages never ran, in its Run Report. */
const RECONCILED_INTERRUPTED_STAGE_REASON = 'AI7 上次关闭时运行中断，这一步没有发起。' as const;
export const RECONCILED_QUEUED_DETAIL =
  'AI7 上次关闭时这项任务还在等待运行名额，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请重新准备并开始。' as const;

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
/**
 * A Run stopped because a sent request's result cannot be known (Issue #51, S16c; CTRL-007, COPY-009), never 任务已中断 · 可续行
 * nor 已取消. Only Runs recorded before #1080 carry that stop; it reads as the per-unit state 该单元结果未知 (ADR 0095 §2).
 */
export const OUTCOME_UNKNOWN_RUN_LABEL = '该单元结果未知' as const;
/** Why 结果待确认 has no 续行 (Issue #51, S16c; ADR 0034, CONT-011, CONT-016). */
export const OUTCOME_UNKNOWN_NO_RESUME = '结果待确认：有阅读范围的请求已发出而结果无法确认，这次运行不能续行；可以取消任务保留已读完的部分，或改计划重做。' as const;

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
  readonly stage: UnconfirmedStage | null;
}

/** The units a Task's reuse or scope plan names, as `resendUnitsByContent` reads them: which it reads again, by content key. */
export interface ResendPlan {
  readonly units: ReadonlyArray<{ readonly unitOrdinal: number; readonly contentKey: string; readonly disposition: string }>;
}

/** The outcome key of a range or a step (Issue #757), as `UnconfirmedOutcomeRecord.key` and the resolutions spell it. */
export function unconfirmedOutcomeKey(kind: string, runRecordId: string, target: { contentKey: string } | { stage: UnconfirmedStage }): string {
  return `${kind}\n${runRecordId}\n${'contentKey' in target ? `range:${target.contentKey}` : `step:${target.stage}`}`;
}

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

/**
 * The assurance sampling contract a frozen execution plan names (Issue #826). A plan records it only when its kind binds a
 * sampling contract other than /1 — today the current baseline's /2 — so every factual, Review Category and retained /1
 * baseline plan keeps the bytes it always had. A plan without it is read conservatively as /1: that is what every delivered
 * plan recorded before #826 was frozen under. (An unpinned plan of the #826 development candidate that sampled /2 reads as /1
 * too; the reading only refuses to execute such a plan again, and never relabels a Run already recorded.)
 */
export function frozenAssurancePromptContractDigest(executionPlan: Readonly<Record<string, unknown>>): string {
  const recorded = executionPlan.assurancePromptContractDigest;
  if (recorded === undefined) return ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST;
  requireAnalysis(typeof recorded === 'string' && DIGEST_PATTERN.test(recorded), 'ANALYSIS_RECORD_INVALID', '计划记录的保证抽样契约无效。');
  return recorded;
}

/**
 * Whether a kind now samples under another contract than the one its frozen plan names (Issue #826). The Execution Binding and
 * the composition pin only the unit prompt contract, so this is what keeps a plan frozen under one sampling contract from being
 * sampled under another. A kind that samples nothing never moves.
 */
export function assuranceContractMoved(definition: Pick<AnalysisKindDefinition, 'assurance'>, frozenDigest: string): boolean {
  return definition.assurance !== null && definition.assurance.promptContractDigest !== frozenDigest;
}

export interface BaselineAnalysisRouteFacts {
  readonly reviewContractVersion?: 1 | 2;
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

interface PreparationWork {
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
interface PendingIntent {
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

function isBackgroundRunBudgetCeiling(value: unknown): value is BackgroundRunBudgetCeiling {
  return isRecord(value) && value.kind === 'tokens' && Number.isSafeInteger(value.maxTotalTokens) && (value.maxTotalTokens as number) >= 1 &&
    Object.keys(value).length === 2;
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
  readonly route: 'opencode-go' | 'deepseek-open-platform';
  readonly model: 'deepseek-v4.1-flash' | 'deepseek-flash';
  readonly endpoint: string;
  readonly credentialSlot: 'opencode-go' | 'deepseek-api-key';
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

function asString(value: unknown): string {
  requireAnalysis(typeof value === 'string', 'ANALYSIS_RECORD_INVALID', '分析记录字段无效。');
  return value;
}

function asNumber(value: unknown): number {
  requireAnalysis(typeof value === 'number' && Number.isSafeInteger(value), 'ANALYSIS_RECORD_INVALID', '分析记录数值无效。');
  return value;
}

/**
 * Who started the Task, as its Run Authorization records it (Issue #421): `standard-direct` from its plan,
 * `default-execution-rule` — 快速开始 under a 默认执行规则 — with the rule version the authorization names, or
 * `background-analysis-enrollment` — AI7 by itself under the Book's 后台分析登记 (Issue #95, S39) — with the enrollment version.
 */
function authorizationOrigin(row: SqlRow): {
  origin: 'standard-direct' | 'default-execution-rule' | 'background-analysis-enrollment';
  ruleVersionId: string | null;
  enrollmentVersionId: string | null;
} {
  const origin = asString(row.origin);
  if (origin === 'standard-direct') return { origin, ruleVersionId: null, enrollmentVersionId: null };
  const record = parseCanonicalJson(asString(row.canonical_json));
  if (origin === 'background-analysis-enrollment') {
    requireAnalysis(isRecord(record) && record.origin === origin && typeof record.enrollmentVersionId === 'string' &&
      UUID_PATTERN.test(record.enrollmentVersionId) && record.ruleVersionId === undefined,
    'ANALYSIS_RECORD_INVALID', '运行授权的来源记录无效。');
    return { origin, ruleVersionId: null, enrollmentVersionId: record.enrollmentVersionId };
  }
  requireAnalysis(origin === 'default-execution-rule' && isRecord(record) && record.origin === origin &&
    typeof record.ruleVersionId === 'string' && UUID_PATTERN.test(record.ruleVersionId),
  'ANALYSIS_RECORD_INVALID', '运行授权的来源记录无效。');
  return { origin, ruleVersionId: record.ruleVersionId, enrollmentVersionId: null };
}

/**
 * How a Run is authorized: from its plan, by 快速开始 under one version of a 默认执行规则 (Issue #421), or by AI7 itself under one
 * version of the Book's 后台分析登记 (Issue #95, S39).
 */
export type AnalysisAuthorizationOrigin =
  | { readonly kind: 'standard-direct' }
  | { readonly kind: 'default-execution-rule'; readonly ruleVersionId: string }
  | { readonly kind: 'background-analysis-enrollment'; readonly enrollmentVersionId: string };
const STANDARD_DIRECT: AnalysisAuthorizationOrigin = { kind: 'standard-direct' };
/** What a Run AI7 started under the Book's 后台分析登记 records when it is authorized (Issue #95, S39). */
export const BACKGROUND_AUTHORIZED_DETAIL = '后台分析按登记记录了运行授权。';

function transact<T>(db: DatabaseSync, body: () => T): T {
  if (db.isTransaction) return body();
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

/** A Task Intent Draft's sentence as a goal (Issue #423, slice 7a): trimmed, one to `MAX_TASK_INTENT_GOAL_LENGTH` characters. */
function isDraftGoal(goal: unknown): goal is string {
  return typeof goal === 'string' && goal.trim() === goal && goal.length >= 1 && goal.length <= MAX_TASK_INTENT_GOAL_LENGTH;
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
export function runIsActive(state: BaselineAnalysisRunState | null): boolean {
  return state === 'authorized' || state === 'awaiting-connectivity' || state === 'admitted' || state === 'executing' ||
    state === 'cancelling' || state === 'pausing' || state === 'paused' || state === 'resumable' || state === 'awaiting-clarification';
}

/**
 * Why an active Run blocks a new Task, in the words of its state — a waiting Run is never said to be under way (OFF-005,
 * OFF-006; Issue #49, S14) — and of its kind (Issue #760 review): a 写作任务 is never called an 分析任务.
 */
export function activeRunReason(state: BaselineAnalysisRunState | null, kind: string = BASELINE_ANALYSIS_KIND): string {
  const { task, next } = activeRunWords(kind);
  if (state === 'awaiting-connectivity') return `有一项${task}在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备${next}。`;
  if (state === 'authorized') return `有一项${task}在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备${next}。`;
  return `当前已有${task}在调度或执行中；在其结束前不能准备${next}。`;
}

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

/** The reading of an ordinary-production launch with no configured route: a stand-in for the binding in its sentences. */
export const MODEL_SERVICE_SETUP_REQUIRED = 'ordinary-production-setup-required' as const;
type LiveReading = LaunchBinding['live'] | typeof MODEL_SERVICE_SETUP_REQUIRED;

/** Whether the launch, not the plan, sets the Run Budget Ceiling: developer-live only (ADR 0070). */
function launchSetsCeilingOf(live: LaunchBinding['live']): boolean {
  return live !== null && live.scope !== 'ordinary-production';
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
export function namedNonEffects(live: LiveReading, unitCount: number | null = null): ReadonlyArray<string> {
  return [
    '不修改稿件，不创建修订版或事实判定',
    '不创建学习资格、策略激活、Enrollment、Apply 或 Effect',
    '只读取当前图书的任务输入修订版，不读取其他图书',
    live === null
      ? 'development-ci · Provider Processing v1：0 次实时传输，远程绑定被拒绝'
      : live === MODEL_SERVICE_SETUP_REQUIRED
        ? `ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION}：模型服务需设置，尚无可用路线，0 次实时传输`
        : live.scope === 'ordinary-production'
          ? `ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION}：经你配置的模型服务 ${live.route} · ${live.model} 实时传输，每个单元实际调用；任务运行预算上限由计划设定`
          : `developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION}：实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}），远程绑定 ${live.route} · ${live.model} 已获准`,
    '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容',
  ];
}

/** Why a Run that cannot dispatch was blocked; only the first reason states the launch's own facts. */
export function blockedReasons(live: LiveReading, unitCount: number | null = null): ReadonlyArray<string> {
  return [
    live === null
      ? '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝。'
      : live === MODEL_SERVICE_SETUP_REQUIRED
        ? MODEL_SERVICE_SETUP_REQUIRED_REASON
        : live.scope === 'ordinary-production'
          ? `当前可信启动范围为 ordinary-production，Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 允许经你配置的模型服务 ${live.route} · ${live.model} 实时传输。`
          : `当前可信启动范围为 developer-live，Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 允许的实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}）；远程绑定 ${live.route} · ${live.model} 已获准。`,
    '未提供 J-04 专用的本地确定性模型适配器控制，因此没有可执行的本地路由。',
    '运行授权已记录；派发前阻止，未创建 Session、未构造 Provider payload、未访问网络。',
  ];
}

/**
 * What an analysis update does to the Provider, stated for the launch the next Run would execute
 * under. `firstTaskLabel` is the label of the kind's own first Task, which the sentence compares an
 * update to; it defaults to the baseline kind's, so every existing reading keeps its exact text.
 */
export function providerConsequence(live: LiveReading, unitCount: number | null = null, firstTaskLabel = '首次基线分析'): string {
  if (live === MODEL_SERVICE_SETUP_REQUIRED) return MODEL_SERVICE_SETUP_REQUIRED_REASON;
  if (live !== null && live.scope === 'ordinary-production') {
    return `与${firstTaskLabel}相同：经你配置的模型服务 ${live.route} · ${live.model} 在 ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 下执行；外发数据类别 unpublished-excerpts；任务运行预算上限由计划设定，未设置则不设上限；每个重算单元形成一次实时传输并计入用量，复用单元不形成任何模型负载。`;
  }
  return live === null
    ? `与${firstTaskLabel}相同：远程 DeepSeek 绑定被 development-ci · Provider Processing v1 拒绝（0 次实时传输），只有 J-04 控制绑定的 AI7 本地确定性模型适配器可执行；外发数据类别 public-or-synthetic；未设置任务预算上限；只有重算单元形成模型请求并计入用量，复用单元不形成任何模型负载。`
    : `与${firstTaskLabel}相同：远程绑定 ${live.route} · ${live.model} 在 developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 下可执行，实时传输受运行边界约束；外发数据类别 public-or-synthetic；任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}；每个重算单元形成一次实时传输并计入用量，复用单元不形成任何模型负载。`;
}

/**
 * The stages a stop keeps its usage for (Issue #541): settled or refused stage work was spent all the same. A unit
 * a stop kept carries its own usage in its checkpoint.
 */
export const CARRIED_STAGES = ['cross-unit-reduction', 'assurance-sampling'] as const;
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

interface RequestAdmissionPins {
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

type RequestAdmissionEvent =
  | { readonly kind: 'execution'; readonly width: 1 | 3; readonly limits: { readonly requests: 4; readonly units: 3; readonly backgroundRequests: 1 } }
  | { readonly kind: 'admit'; readonly request: AnalysisRequestIdentity }
  | { readonly kind: 'resolve'; readonly requests: readonly string[]; readonly evidence: {
      readonly kind: 'no-send' | 'unit-checkpoint' | 'clarification-checkpoint' | 'stage-checkpoint' | 'reflection-outcome' | 'refused-turn' | 'unavailable' | 'factual-checkpoint';
      readonly digest: string;
    } };

interface RequestAdmissionData extends RequestAdmissionPins {
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

/**
 * The append-only ledger of one analysis kind of one Book database. The kind it serves is the
 * {@link AnalysisKindDefinition} it is constructed with: the identity it tags every row with, the
 * contract version, the Task modes and their goals, the frozen prompt contract its plans freeze, the
 * reducer its Runs reduce through, and the stages its plans declare. Two instances over the same
 * database serve the two kinds of Issue #53 without either seeing the other's Tasks, plans, Runs, or
 * revisions: every read is filtered by the definition's kind.
 */
/** The provider-free v2 fixture identity whose lineage runs the factual levels on the deterministic route (Issue #901). */
export const FACTUAL_VERIFIED_FIXTURE_IDENTITY = 'sample1-factual-verified';
/** Why a level below the Factual Verification Policy's minimum is refused; the document names none today (EASSURE-008). */
export const FACTUAL_POLICY_MINIMUM_REASON = '事实核查政策要求更高的证据保证级别；这个级别不能选。' as const;
const LEVEL_ORDER: Readonly<Record<EvidenceAssuranceLevel, number>> = { quick: 0, standard: 1, strict: 2 };

/** Whether a level is below the minimum the pinned Factual Verification Policy Document requires (EASSURE-008). */
export function levelBelowPolicyMinimum(level: EvidenceAssuranceLevel, minimum: EvidenceAssuranceLevel | null = FACTUAL_VERIFICATION_POLICY_VERSION.minimumLevel): boolean {
  return minimum !== null && LEVEL_ORDER[level] < LEVEL_ORDER[minimum];
}

/** Immutable references only: no route, launch policy, source selection, provider or writes. */
function admissionRow(row: SqlRow | undefined): Record<string, unknown> {
  requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '请求准入引用缺失。');
  const record = parseCanonicalJson(asString(row.canonical_json));
  requireAnalysis(isRecord(record) && canonicalRecord(record).digest === row.sha256, 'ANALYSIS_RECORD_INVALID', '请求准入引用摘要不一致。');
  return record;
}

function readAdmissionBinding(db: DatabaseSync, runRecordId: string): { attemptId: string; binding: ExecutionBindingRecord; bindingDigest: string } | null {
  const runRow = db.prepare('SELECT * FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
  const run = admissionRow(runRow);
  const attemptRow = db.prepare('SELECT * FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
  if (attemptRow === undefined) return null;
  const attempt = admissionRow(attemptRow);
  const bindingRow = db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptRow.attempt_id!) as SqlRow | undefined;
  const binding = admissionRow(bindingRow) as unknown as ExecutionBindingRecord;
  const authorization = admissionRow(db.prepare('SELECT * FROM analysis_run_authorizations WHERE authorization_id = ?').get(runRow!.authorization_id!) as SqlRow | undefined);
  const intent = admissionRow(db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(runRow!.task_intent_id!) as SqlRow | undefined);
  requireAnalysis(run.runRecordId === runRecordId && run.taskIntentId === runRow!.task_intent_id && run.authorizationId === runRow!.authorization_id &&
    attempt.attemptId === attemptRow.attempt_id && attempt.runRecordId === runRecordId &&
    binding.attemptId === attempt.attemptId && binding.runRecordId === runRecordId && binding.taskIntentId === run.taskIntentId &&
    intent.taskIntentId === run.taskIntentId && intent.bookId === binding.bookId && authorization.authorizationId === run.authorizationId &&
    authorization.taskIntentId === run.taskIntentId && authorization.planEnvelopeDigest === binding.planEnvelopeDigest && authorization.planVersionOrdinal === binding.planVersion,
    'ANALYSIS_RECORD_INVALID', '请求准入的运行、尝试与授权引用不一致。');
  return { attemptId: asString(attemptRow.attempt_id), binding, bindingDigest: asString(bindingRow!.sha256) };
}

function readAdmissionManifest(db: DatabaseSync, stored: NonNullable<ReturnType<typeof readAdmissionBinding>>): CoverageManifestProjection {
  const rows = db.prepare('SELECT * FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(stored.binding.taskIntentId, stored.binding.planVersion) as SqlRow[];
  const components = new Map(rows.map((row) => [asString(row.component), { record: admissionRow(row), digest: asString(row.sha256) }]));
  for (const [component, digest] of [
    ['plan-envelope', stored.binding.planEnvelopeDigest],
    ['provider-resolution-plan', stored.binding.providerResolutionPlanDigest], ['run-source-scope', stored.binding.runSourceScopeDigest],
  ]) requireAnalysis(components.get(component!)?.digest === digest, 'ANALYSIS_RECORD_INVALID', '请求准入的固定计划引用不一致。');
  const manifest = components.get('coverage-manifest')!.record as unknown as CoverageManifestProjection;
  requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === stored.binding.coverageManifestDigest &&
    manifest.manuscript.revisionId === stored.binding.manuscriptPin.revisionId && manifest.manuscript.revisionDigest === stored.binding.manuscriptPin.revisionDigest,
    'ANALYSIS_RECORD_INVALID', '请求准入的固定覆盖清单无法核对。');
  return manifest;
}

function readAdmissionAdaptations(db: DatabaseSync, attemptId: string): Array<{ adaptationId: unknown; unitOrdinal: unknown }> {
  return (db.prepare('SELECT * FROM analysis_plan_adaptations WHERE attempt_id = ? ORDER BY ordinal').all(attemptId) as SqlRow[]).map((row) => {
    const record = admissionRow(row);
    requireAnalysis(record.adaptationId === row.adaptation_id && record.attemptId === attemptId && record.unitOrdinal === row.unit_ordinal,
      'ANALYSIS_RECORD_INVALID', '请求准入的调整引用不一致。');
    return { adaptationId: record.adaptationId, unitOrdinal: record.unitOrdinal };
  });
}

function readRequestAdmissions(db: DatabaseSync, runRecordId: string): RequestAdmissionReading | null {
  const rows = db.prepare(`SELECT sequence, recorded_at, canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ?
      AND json_type(canonical_json, '$.requestAdmission') IS NOT NULL ORDER BY sequence`).all(runRecordId) as SqlRow[];
  if (rows.length === 0 && db.prepare(`SELECT 1 FROM analysis_run_states WHERE run_record_id = ? AND
      json_type(canonical_json, '$.modelClarificationAnswerClaim') IS NOT NULL LIMIT 1`).get(runRecordId) === undefined) return null;
  const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => isRecord(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const invalid = (): never => { throw new AnalysisError('ANALYSIS_RECORD_INVALID', '模型请求准入记录无法核对；不能续行。'); };
  const state: { reading: RequestAdmissionReading | null } = { reading: null };
  const open = new Map<string, AnalysisRequestIdentity>();
  const unavailable: AnalysisRequestIdentity[] = [];
  const notSent: AnalysisRequestIdentity[] = [];
  const seen = new Set<string>();
  const admitted = new Map<string, { request: AnalysisRequestIdentity; recordedAt: string }>();
  const resolutions = new Map<string, { kind: string; digest: string }>();
  const refusalProofs = new Map<string, number>();
  const ordinals = new Map<string, number>();
  const stored = readAdmissionBinding(db, runRecordId);
  let requestManifest: CoverageManifestProjection | undefined;
  let adaptations: ReturnType<typeof readAdmissionAdaptations> | undefined;
  for (const row of rows) {
    const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    const receipt = record.requestAdmission;
    if (record.runRecordId !== runRecordId || record.sequence !== row.sequence || record.recordedAt !== row.recorded_at) return invalid();
    if (receipt === undefined) continue;
    if (canonicalRecord(record).digest !== row.sha256 || !exact(receipt, ['schema', 'data', 'digest']) ||
      receipt.schema !== 'ai7.analysis.request-admission/1' || !isRecord(receipt.data) || canonicalRecord(receipt.data).digest !== receipt.digest) return invalid();
    const data = receipt.data as unknown as RequestAdmissionData;
    if (!exact(data, ['runRecordId', 'attemptId', 'bindingDigest', 'planEnvelopeDigest', 'manifestDigest', 'compositionDigest',
      'promptContractDigest', 'policyVersion', 'policyRuleId', 'sequence', 'predecessorDigest', 'event']) ||
      data.sequence !== (state.reading?.sequence ?? 0) + 1 || data.predecessorDigest !== (state.reading?.digest ?? null)) return invalid();
    const { sequence, predecessorDigest, event, ...pins } = data;
    if (stored === null || pins.runRecordId !== runRecordId || pins.attemptId !== stored.attemptId || pins.bindingDigest !== stored.bindingDigest ||
      pins.planEnvelopeDigest !== stored.binding.planEnvelopeDigest || pins.manifestDigest !== stored.binding.coverageManifestDigest ||
      pins.compositionDigest !== stored.binding.behaviorCompositionDigest || pins.promptContractDigest !== stored.binding.promptContractDigest ||
      pins.policyVersion !== stored.binding.policyPin.providerProcessingVersion || typeof pins.policyRuleId !== 'string' || !/^[a-z][a-z0-9-]{0,159}$/u.test(pins.policyRuleId) ||
      state.reading !== null && canonicalJson(pins) !== canonicalJson(state.reading.pins)) return invalid();
    let width: 1 | 3 = state.reading?.width ?? 1;
    if (state.reading === null) {
      if (!exact(event, ['kind', 'width', 'limits']) || event.kind !== 'execution' || (event.width !== 1 && event.width !== 3) ||
        !exact(event.limits, ['requests', 'units', 'backgroundRequests']) || event.limits.requests !== 4 || event.limits.units !== 3 || event.limits.backgroundRequests !== 1 ||
        event.width === 3 && (stored!.binding.compositionVersion !== 2 && stored!.binding.compositionVersion !== 4 || stored!.binding.policyPin.operationalScope !== 'ordinary-production' || stored!.binding.runBudgetCeiling !== 'unset')) return invalid();
      width = event.width;
    } else if (event.kind === 'admit') {
      if (!exact(event, ['kind', 'request'])) return invalid();
      const request = event.request;
      if (!exact(request, ['requestId', 'producerId', 'requestOrdinal', 'sessionId', 'unitOrdinal', 'stage', 'attemptIndex', 'adaptationId',
        'payloadDigest', 'messageDigest', 'requestDigest', 'inputDigest', 'contractDigest']) ||
        ![request.requestId, request.producerId, request.sessionId].every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) ||
        seen.has(request.requestId) || !Number.isSafeInteger(request.requestOrdinal) || request.requestOrdinal !== (ordinals.get(request.producerId) ?? 0) + 1 ||
        !Number.isSafeInteger(request.attemptIndex) || request.attemptIndex < 1 || request.attemptIndex > 4 ||
        request.adaptationId !== null && !UUID_PATTERN.test(request.adaptationId) ||
        ![request.payloadDigest, request.messageDigest, request.requestDigest, request.inputDigest, request.contractDigest].every((digest) => typeof digest === 'string' && DIGEST_PATTERN.test(digest)) ||
        !['units', 'cross-unit-reduction', 'assurance-sampling', 'run-report-reflection', 'web-verification'].includes(request.stage) ||
        request.stage === 'units' && (!Number.isSafeInteger(request.unitOrdinal) || request.unitOrdinal! < 1) ||
        request.stage !== 'units' && request.unitOrdinal !== null) return invalid();
      const manifest = requestManifest ??= readAdmissionManifest(db, stored);
      if (request.unitOrdinal !== null && (manifest.units[request.unitOrdinal - 1]?.ordinal !== request.unitOrdinal ||
        manifest.units[request.unitOrdinal - 1]!.digest !== request.inputDigest || request.contractDigest !== stored.binding.promptContractDigest)) return invalid();
      if (request.stage === 'web-verification') {
        const session = db.prepare("SELECT canonical_json FROM factual_claim_sessions WHERE session_id = ? AND run_record_id = ? AND stage = 'web-verification'").get(request.sessionId, runRecordId);
        const pins = session === undefined ? null : JSON.parse(String(session.canonical_json)) as import('../factual-verification.js').FactualClaimSession;
        if (pins === null || pins.sourceMessageDigest !== request.messageDigest || pins.promptContractDigest !== request.contractDigest || pins.ledgerDigest !== request.inputDigest) return invalid();
      }
      if (request.adaptationId !== null && !(adaptations ??= readAdmissionAdaptations(db, stored!.attemptId)).some((adaptation) => adaptation.adaptationId === request.adaptationId && adaptation.unitOrdinal === request.unitOrdinal)) return invalid();
      admitted.set(request.requestId, { request, recordedAt: asString(row.recorded_at) });
      seen.add(request.requestId); ordinals.set(request.producerId, request.requestOrdinal); open.set(request.requestId, request);
    } else if (event.kind === 'resolve') {
      if (!exact(event, ['kind', 'requests', 'evidence']) || !Array.isArray(event.requests) || new Set(event.requests).size !== event.requests.length ||
        !event.requests.every((id) => typeof id === 'string' && open.has(id)) || !exact(event.evidence, ['kind', 'digest']) || !DIGEST_PATTERN.test(event.evidence.digest)) return invalid();
      const requests = event.requests.map((id) => open.get(id)!);
      const evidence = event.evidence;
      if (event.requests.length === 0 && evidence.kind !== 'stage-checkpoint') return invalid();
      if (evidence.kind === 'no-send') {
        if (requests.length !== 1 || canonicalRecord(requests[0]).digest !== evidence.digest) return invalid();
        notSent.push(requests[0]!);
      } else if (evidence.kind === 'unit-checkpoint') {
        const unit = requests[0]?.unitOrdinal;
        const checkpoint = db.prepare('SELECT canonical_json, sha256 FROM analysis_unit_checkpoints WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unit ?? -1) as SqlRow | undefined;
        if (checkpoint === undefined || checkpoint.sha256 !== evidence.digest || requests.some((request) => request.stage !== 'units' || request.unitOrdinal !== unit)) return invalid();
        const kept = parseCanonicalJson(asString(checkpoint!.canonical_json)) as { requests?: unknown };
        if (canonicalRecord(kept).digest !== evidence.digest || !Array.isArray(kept.requests) || kept.requests.length !== event.requests.length || !event.requests.every((id) => (kept.requests as unknown[]).includes(id))) return invalid();
      } else if (evidence.kind === 'clarification-checkpoint') {
        const unit = requests[0]?.unitOrdinal;
        const checkpoint = db.prepare('SELECT canonical_json, sha256 FROM analysis_clarification_requests WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unit ?? -1) as SqlRow | undefined;
        if (checkpoint === undefined || checkpoint.sha256 !== evidence.digest || sha256Hex(asString(checkpoint.canonical_json)) !== evidence.digest ||
          requests.some((request) => request.stage !== 'units' || request.unitOrdinal !== unit)) return invalid();
        const kept = parseCanonicalJson(asString(checkpoint!.canonical_json)) as { requests?: unknown };
        if (!Array.isArray(kept.requests) || kept.requests.length !== event.requests.length || !event.requests.every((id) => (kept.requests as unknown[]).includes(id))) return invalid();
      } else if (evidence.kind === 'stage-checkpoint') {
        const stage = record.stageContinuation;
        if (!exact(stage, ['schema', 'data', 'digest']) || stage.schema !== 'ai7.analysis.stage-continuation/1' ||
          !isRecord(stage.data) || canonicalRecord(stage.data).digest !== stage.digest ||
          !exact(record.carriedUsage, ['inputTokens', 'outputTokens', 'stages']) ||
          ![record.carriedUsage.inputTokens, record.carriedUsage.outputTokens].every((value) => Number.isSafeInteger(value) && (value as number) >= 0) ||
          !exact(record.carriedUsage.stages, CARRIED_STAGES) ||
          !Object.values(record.carriedUsage.stages).every((value) => exact(value, ['requests', 'inputTokens', 'outputTokens']) &&
            Object.values(value).every((count) => Number.isSafeInteger(count) && (count as number) >= 0))) return invalid();
        if (record.stageContinuation === undefined || record.carriedUsage === undefined ||
          canonicalRecord({ stageContinuation: record.stageContinuation, carriedUsage: record.carriedUsage }).digest !== evidence.digest ||
          requests.some((request) => request.stage === 'units' || request.stage === 'run-report-reflection')) return invalid();
        const stages = (record.stageContinuation as { data?: StageContinuation }).data;
        if (stages === undefined || stages.runRecordId !== runRecordId || stages.attemptId !== stored!.attemptId ||
          stages.bindingDigest !== stored!.bindingDigest || stages.manifestDigest !== stored!.binding.coverageManifestDigest ||
          stages.promptContractDigest !== stored!.binding.promptContractDigest || requests.some((request) => request.stage === 'cross-unit-reduction'
            ? stages.reduction?.inputDigest !== request.inputDigest || stages.reduction.requestDigest !== request.requestDigest || stages.reduction.contractDigest !== request.contractDigest
            : stages.sampling?.inputDigest !== request.inputDigest || stages.sampling.contractDigest !== request.contractDigest || !stages.sampling.turns.some((turn) => turn.requestDigest === request.requestDigest))) return invalid();
      } else if (evidence.kind === 'reflection-outcome') {
        const outcome = db.prepare('SELECT canonical_json, sha256 FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
        if (outcome === undefined || outcome.sha256 !== evidence.digest || sha256Hex(asString(outcome.canonical_json)) !== evidence.digest ||
          requests.some((request) => request.stage !== 'run-report-reflection')) return invalid();
      } else if (evidence.kind === 'refused-turn') {
        const refused = record.requestRefusal;
        if (!exact(refused, ['state', 'stage', 'unitOrdinal', 'observation']) || refused.state !== 'provider-account-limit' ||
          canonicalRecord(refused).digest !== evidence.digest || requests.some((request) => request.stage !== refused.stage || request.unitOrdinal !== refused.unitOrdinal)) return invalid();
        const observed = refused.observation;
        if (!exact(observed, ['attempts', 'usage']) || !Number.isSafeInteger(observed.attempts) || (observed.attempts as number) < 1 ||
          observed.usage !== null && (!exact(observed.usage, ['inputTokens', 'outputTokens']) ||
            ![observed.usage.inputTokens, observed.usage.outputTokens].every((count) => Number.isSafeInteger(count) && (count as number) >= 0))) return invalid();
        refusalProofs.set(evidence.digest, Number(row.sequence));
      } else if (evidence.kind === 'factual-checkpoint') {
        if (requests.some((request) => request.stage !== 'web-verification' || request.sessionId !== requests[0]?.sessionId) ||
          !db.prepare("SELECT 1 FROM factual_claim_events WHERE session_id = ? AND kind = 'verification-result' AND sha256 = ?").get(requests[0]?.sessionId ?? '', evidence.digest)) return invalid();
      } else if (evidence.kind === 'unavailable') {
        if (canonicalRecord({ requests, reason: 'possible-send-without-durable-result' }).digest !== evidence.digest) return invalid();
        unavailable.push(...requests);
      } else return invalid();
      for (const id of event.requests) { resolutions.set(id, { kind: evidence.kind, digest: evidence.digest }); open.delete(id); }
    } else return invalid();
    state.reading = { pins, width, sequence, digest: receipt.digest as string, open, unavailable, notSent };
  }
  // Check arrays independently of discharge events, including the crash window before discharge.
  for (const table of ['analysis_unit_checkpoints', 'analysis_clarification_requests'] as const) {
    for (const checkpoint of db.prepare(`SELECT * FROM ${table} WHERE run_record_id = ?`).all(runRecordId) as SqlRow[]) {
      const kept = admissionRow(checkpoint);
      if (!Object.hasOwn(kept, 'requests')) continue;
      if (!Array.isArray(kept.requests) || new Set(kept.requests).size !== kept.requests.length ||
        kept.runRecordId !== runRecordId || kept.attemptId !== stored!.attemptId ||
        table === 'analysis_clarification_requests' && kept.taskIntentId !== stored!.binding.taskIntentId ||
        kept.unitOrdinal !== undefined && kept.unitOrdinal !== checkpoint.unit_ordinal) return invalid();
      const manifest = requestManifest ??= readAdmissionManifest(db, stored!);
      if (manifest.units[Number(checkpoint.unit_ordinal) - 1]?.ordinal !== checkpoint.unit_ordinal) return invalid();
      const ids = kept.requests as unknown[];
      const checkpointTime = asString(table === 'analysis_unit_checkpoints' ? checkpoint.recorded_at : checkpoint.raised_at);
      if (!ids.every((id) => typeof id === 'string' && admitted.has(id) &&
        admitted.get(id)!.request.stage === 'units' && admitted.get(id)!.request.unitOrdinal === checkpoint.unit_ordinal &&
        admitted.get(id)!.recordedAt <= checkpointTime)) return invalid();
      if (table === 'analysis_unit_checkpoints') {
        const unit = kept.unit as { unitOrdinal?: unknown; requestDigest?: unknown } | undefined;
        if (unit?.unitOrdinal !== checkpoint.unit_ordinal || !ids.every((id) => admitted.get(id as string)!.request.requestDigest === unit!.requestDigest)) return invalid();
        for (const [id, value] of admitted) if (value.request.stage === 'units' && value.request.unitOrdinal === checkpoint.unit_ordinal &&
          (resolutions.get(id) === undefined || resolutions.get(id)!.kind === 'unit-checkpoint' && resolutions.get(id)!.digest === checkpoint.sha256) && !ids.includes(id)) return invalid();
      }
    }
  }
  for (const row of db.prepare("SELECT sequence, canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? AND json_type(canonical_json, '$.requestRefusal') IS NOT NULL").all(runRecordId) as SqlRow[]) {
    const record = admissionRow(row);
    const refusal = record.requestRefusal;
    if (!exact(refusal, ['state', 'stage', 'unitOrdinal', 'observation']) || !refusalProofs.has(canonicalRecord(refusal).digest) ||
      refusalProofs.get(canonicalRecord(refusal).digest)! > Number(row.sequence)) return invalid();
  }
  const claims = new Set<string>();
  const firstReceiptRowSequence = rows.length === 0 ? null : asNumber(rows[0]!.sequence);
  const sameEvidence = (left: unknown, right: unknown): boolean => left === undefined || right === undefined
    ? left === right : canonicalRecord(left).digest === canonicalRecord(right).digest;
  let predecessor: Record<string, unknown> | null = null;
  for (const row of db.prepare('SELECT sequence, recorded_at, canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runRecordId) as SqlRow[]) {
    const record = admissionRow(row);
    // A governed row inherits its predecessor's stage evidence; only its own stage checkpoint carries new evidence.
    if (Object.hasOwn(record, 'requestAdmission')) {
      const event = (record.requestAdmission as { data: { event: { kind: string; evidence?: { kind: string } } } }).data.event;
      if (!(event.kind === 'resolve' && event.evidence?.kind === 'stage-checkpoint') &&
        (!sameEvidence(record.stageContinuation, predecessor?.stageContinuation) || !sameEvidence(record.carriedUsage, predecessor?.carriedUsage))) return invalid();
    }
    predecessor = record;
    if (rows.length > 0 && Object.hasOwn(record, 'stageContinuation')) {
      const stage = record.stageContinuation;
      if (!exact(stage, ['schema', 'data', 'digest']) || stage.schema !== 'ai7.analysis.stage-continuation/1' ||
        !isRecord(stage.data) || canonicalRecord(stage.data).digest !== stage.digest ||
        stage.data.runRecordId !== runRecordId || stage.data.attemptId !== stored!.attemptId ||
        stage.data.bindingDigest !== stored!.bindingDigest || stage.data.manifestDigest !== stored!.binding.coverageManifestDigest ||
        stage.data.promptContractDigest !== stored!.binding.promptContractDigest) return invalid();
    }
    if (!Object.hasOwn(record, 'modelClarificationAnswerClaim')) continue;
    if (record.runRecordId !== runRecordId || record.sequence !== row.sequence || record.recordedAt !== row.recorded_at) return invalid();
    const claim = record.modelClarificationAnswerClaim;
    if (typeof claim !== 'string' || !UUID_PATTERN.test(claim)) return invalid();
    if (!claims.has(claim)) {
      if (stored === null) return invalid();
      const clarification = db.prepare('SELECT * FROM analysis_clarification_requests WHERE request_id = ?').get(claim) as SqlRow | undefined;
      const question = admissionRow(clarification);
      const model = clarification?.model_question_json == null ? null : parseModelClarification(asString(clarification.model_question_json));
      const answerRow = db.prepare('SELECT * FROM analysis_clarification_answers WHERE request_id = ?').get(claim) as SqlRow | undefined;
      const answer = admissionRow(answerRow);
      const manifest = requestManifest ??= readAdmissionManifest(db, stored!);
      const selected = typeof answer.optionId === 'string' ? /^model-option-([0-3])$/u.exec(answer.optionId)?.[1] : undefined;
      if (question.schema !== CLARIFICATION_REQUEST_SCHEMA || question.requestId !== claim || clarification!.request_id !== claim ||
        clarification!.run_record_id !== runRecordId || question.runRecordId !== runRecordId || question.origin !== 'model' || question.kind !== 'model-question' ||
        question.attemptId !== stored!.attemptId || question.taskIntentId !== stored!.binding.taskIntentId ||
        question.planVersion !== stored!.binding.planVersion || question.planEnvelopeDigest !== stored!.binding.planEnvelopeDigest ||
        question.unitOrdinal !== clarification!.unit_ordinal || !Number.isSafeInteger(question.unitOrdinal) || (question.unitOrdinal as number) < 1 ||
        manifest.units[(question.unitOrdinal as number) - 1]?.ordinal !== question.unitOrdinal ||
        typeof question.requestDigest !== 'string' || !DIGEST_PATTERN.test(question.requestDigest) ||
        typeof question.firstUnitMessageDigest !== 'string' || !DIGEST_PATTERN.test(question.firstUnitMessageDigest) ||
        model === null || canonicalJson(question.modelQuestion) !== clarification!.model_question_json ||
        answer.schema !== CLARIFICATION_ANSWER_SCHEMA || answer.answerId !== answerRow!.answer_id ||
        typeof answer.answerId !== 'string' || !UUID_PATTERN.test(answer.answerId) || answer.requestId !== claim || answerRow!.request_id !== claim ||
        answer.runRecordId !== runRecordId || answer.requestSha256 !== clarification!.sha256 || answerRow!.option_id !== 'retry' ||
        answer.answeredAt !== answerRow!.answered_at || (answer.actor !== 'editor' && answer.actor !== 'service-timeout') ||
        (answer.note !== null && (typeof answer.note !== 'string' || !answer.note.isWellFormed() || clarificationGraphemes(answer.note) > CLARIFICATION_NOTE_MAX)) ||
        !(answer.optionId === 'no-answer' ? answer.note === null || answer.note === '' : answer.optionId === 'free-text'
          ? model.freeTextAllowed && typeof answer.note === 'string' && answer.note !== ''
          : selected !== undefined && model.options?.[Number(selected)] !== undefined && (answer.note === null || answer.note === '')) ||
        answer.actor === 'service-timeout' && answer.optionId !== 'no-answer') return invalid();
      const receipt = record.requestAdmission as { data?: { event?: RequestAdmissionEvent } } | undefined;
      const event = receipt?.data?.event;
      if (firstReceiptRowSequence !== null && asNumber(row.sequence) >= firstReceiptRowSequence &&
        (event?.kind !== 'admit' || event.request.stage !== 'units' || event.request.unitOrdinal !== clarification!.unit_ordinal)) return invalid();
      claims.add(claim);
    }
  }
  return state.reading;
}

/** Validate every persisted request variant without selecting a policy, mutating, or reconciling. */
export function validateRequestAdmissionRecords(db: DatabaseSync, allowGoverned: boolean): void {
  const fields = [
    ['analysis_run_states', 'requestAdmission'], ['analysis_run_states', 'requestRefusal'],
    ['analysis_unit_checkpoints', 'requests'], ['analysis_clarification_requests', 'requests'],
  ] as const;
  const runs = new Set<string>();
  for (const [table, field] of fields) {
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) === undefined) continue;
    const rows = db.prepare(`SELECT run_record_id FROM ${table} WHERE json_type(canonical_json, '$.${field}') IS NOT NULL`).all() as SqlRow[];
    requireAnalysis(allowGoverned || rows.length === 0, 'ANALYSIS_RECORD_INVALID', '请求准入记录与数据库读者修订不一致。');
    for (const row of rows) runs.add(asString(row.run_record_id));
  }
  const governedRuns = new Set(runs);
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_run_states'").get() !== undefined) {
    for (const row of db.prepare("SELECT DISTINCT run_record_id FROM analysis_run_states WHERE json_type(canonical_json, '$.modelClarificationAnswerClaim') IS NOT NULL").all() as SqlRow[]) runs.add(asString(row.run_record_id));
  }
  const requestOwners = new Map<string, string>();
  for (const runRecordId of runs) {
    const reading = readRequestAdmissions(db, runRecordId);
    requireAnalysis(!governedRuns.has(runRecordId) || reading !== null, 'ANALYSIS_RECORD_INVALID', '请求准入证据缺少执行收据。');
    if (reading === null) continue;
    for (const row of db.prepare("SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit'").all(runRecordId) as SqlRow[]) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as { requestAdmission: { data: { event: { request: AnalysisRequestIdentity } } } };
      const requestId = record.requestAdmission.data.event.request.requestId;
      requireAnalysis(!requestOwners.has(requestId), 'ANALYSIS_RECORD_INVALID', '物理请求标识不能跨运行复用。');
      requestOwners.set(requestId, runRecordId);
    }
  }
}

export class BaselineAnalysisStore {
  #factualVerification: import('../factual-verification.js').FactualVerificationLedger | null = null;

  bindFactualVerification(owner: import('../factual-verification.js').FactualVerificationLedger): void {
    requireAnalysis(this.kind === FACTUAL_REVIEW_KIND, 'FACTUAL_CLAIM_KIND_INVALID', '只有事实核查任务可以绑定断言账本。');
    this.#factualVerification = owner;
  }

  get factualVerification(): import('../factual-verification.js').FactualVerificationLedger {
    requireAnalysis(this.#factualVerification !== null, 'FACTUAL_CLAIM_OWNER_MISSING', '事实核查账本未绑定。');
    return this.#factualVerification;
  }
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;
  readonly #route: BaselineAnalysisRouteFacts | null;
  readonly #originalDefinition: AnalysisKindDefinition;
  #definition: AnalysisKindDefinition;
  readonly #work = new Map<string, PreparationWork>();
  /**
   * The unread-changes walk of each latest revision, and each revision as the walk reads it (Issue #709; #711 review P2-2).
   * Revisions are immutable once written, so both are kept by revision id: a read — the 审阅 screen's poll among them —
   * walks the chain once per latest revision, and the plan, the gate and the coverage matrix share that one answer.
   */
  readonly #unreadWalks = new UnreadWalkCache<UnreadWalk>(UNREAD_WALK_CACHE_ENTRIES, UNREAD_WALK_CACHE_WEIGHT, unreadWalkWeight);
  readonly #chainRevisions = new UnreadWalkCache<ChainRevisionRead>(CHAIN_REVISION_CACHE_ENTRIES, CHAIN_REVISION_CACHE_WEIGHT,
    (read) => read === 'unreadable' ? 1 : manifestWeight(read.revision.manifest) + read.revision.units.size);
  #unreadWalksComputed = 0;
  #chainRevisionsRead = 0;
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
    this.#originalDefinition = definition;
    this.#definition = route?.fixtureIdentity.startsWith('sample1-model-clarification') === true ? withModelClarification(definition) : definition;
  }

  get route(): BaselineAnalysisRouteFacts | null {
    return this.#route;
  }

  /** Reservations belong to actual Runs, including a send whose result is unknown after restart. */
  curationBudgetUse(controlEntryId: string): { passesUsed: number; reservedTokens: number } {
    const rows = this.#db.prepare(`SELECT a.canonical_json, o.canonical_json outcome FROM analysis_run_authorizations a
      LEFT JOIN analysis_task_outcomes o ON o.task_intent_id = a.task_intent_id
      WHERE a.origin = 'enabled-learning' AND json_extract(a.canonical_json, '$.controlEntryId') = ?`).all(controlEntryId);
    return { passesUsed: rows.length, reservedTokens: rows.reduce((total, row) => {
      const reserved = Number((parseCanonicalJson(String(row.canonical_json)) as { reservedTokens: number }).reservedTokens);
      const outcome = row.outcome === null ? null : parseCanonicalJson(String(row.outcome)) as { usage: Record<string, number> | null };
      const actual = Object.values(outcome?.usage ?? {}).reduce((sum, count) => sum + count, 0);
      return total + Math.max(reserved, actual);
    }, 0) };
  }

  curationRuns(): Array<{ runRecordId: string; state: string; summary: string }> {
    return this.#db.prepare(`SELECT r.run_record_id, s.state, s.canonical_json FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
      WHERE t.kind = 'learning-curation' AND s.sequence = (SELECT max(sequence) FROM analysis_run_states WHERE run_record_id = r.run_record_id)
      ORDER BY r.rowid DESC LIMIT 10`).all().map((row) => ({ runRecordId: String(row.run_record_id), state: String(row.state),
      summary: String((parseCanonicalJson(String(row.canonical_json)) as { detail: string }).detail) }));
  }

  /** Called by the existing startup reconciliation; possible sends never become retries or fresh budget. */
  reconcileCuration(): void {
    for (const row of this.#db.prepare(`SELECT r.*, p.canonical_json plan, p.sha256 plan_digest, scope.canonical_json sources
      FROM analysis_run_records r JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      JOIN analysis_plan_records p ON p.task_intent_id = t.task_intent_id AND p.component = 'plan-envelope'
      JOIN analysis_plan_records scope ON scope.task_intent_id = t.task_intent_id AND scope.component = 'run-source-scope'
      WHERE t.kind = 'learning-curation' AND NOT EXISTS (SELECT 1 FROM analysis_task_outcomes o WHERE o.run_record_id = r.run_record_id)`).all()) {
      const plan = parseCanonicalJson(String(row.plan)) as { controlEntryId: string; envelope: import('../../shared/protocol/learning.js').EnabledLearningEnvelope; compositionDigest: string };
      const bundle = parseCanonicalJson(String(row.sources)) as import('../../shared/protocol/learning.js').LearningCurationBundle;
      const run = { taskIntentId: String(row.task_intent_id), runRecordId: String(row.run_record_id), authorizationId: String(row.authorization_id),
        controlEntryId: plan.controlEntryId, envelope: plan.envelope, compositionDigest: plan.compositionDigest, bundle, planDigest: String(row.plan_digest) };
      const possibleSend = this.#db.prepare("SELECT 1 FROM analysis_run_states WHERE run_record_id = ? AND state = 'executing'").get(run.runRecordId) !== undefined;
      this.settleCuration(run, 'interrupted', { usage: null, proposals: 0, transmitted: possibleSend,
        reason: possibleSend ? '服务中断，学习整理发送结果不确定；保留预算与来源，不自动重发。' : '服务中断，本次学习整理未完成；保留来源记录，不自动重发。' });
    }
  }

  startCuration(bundle: import('../../shared/protocol/learning.js').LearningCurationBundle,
    control: { entryId: string; envelope: import('../../shared/protocol/learning.js').EnabledLearningEnvelope }): import('../learning/curation.js').CurationRun {
    requireAnalysis(this.#db.isTransaction && bundle.state === 'ready', 'ANALYSIS_PLAN_INVALID', '学习整理必须冻结完整来源。');
    const taskIntentId = randomUUID(), runRecordId = randomUUID(), authorizationId = randomUUID(), planVersionId = randomUUID();
    const instant = new Date().toISOString();
    const envelope = control.envelope;
    const compositionDigest = describeComposition(envelope.binding.route, envelope.binding.model, envelope.contractDigest,
      { version: 2, learningCuration: { bundleDigest: bundle.digest, contractDigest: envelope.contractDigest } }).digest;
    const intent = canonicalRecord({ taskIntentId, bookId: bundle.bookId, kind: 'learning-curation', contractVersion: bundle.schema,
      goal: '从完整编辑样例整理待接受的偏好与记忆', expectedOutcome: 'reviewable-learning-proposals', mode: 'learning-curation', createdAt: instant });
    this.#db.prepare(`INSERT INTO analysis_task_intents(task_intent_id,book_id,kind,contract_version,goal,created_at,canonical_json,sha256,mode)
      VALUES (?,?,'learning-curation',?,?,?,?,?,'learning-curation')`).run(taskIntentId, bundle.bookId, bundle.schema,
        '从完整编辑样例整理待接受的偏好与记忆', instant, intent.json, intent.digest);
    const plan = canonicalRecord({ schema: 'ai7.learning-curation-plan/1', taskIntentId, controlEntryId: control.entryId,
      envelope, sourceManifestDigest: bundle.digest, compositionDigest, operations: ['model-processing'], startWhen: 'idle', tools: [], retries: 0 });
    for (const [component, value] of [['run-source-scope', bundle], ['provider-resolution-plan', envelope.binding], ['plan-envelope', parseCanonicalJson(plan.json)]] as const) {
      const record = canonicalRecord(value);
      this.#db.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?,?)').run(taskIntentId, component, record.json, record.digest, instant);
    }
    const version = canonicalRecord({ planVersionId, taskIntentId, ordinal: 1, planEnvelopeDigest: plan.digest, createdAt: instant });
    this.#db.prepare('INSERT INTO analysis_plan_versions VALUES (?,?,1,NULL,?,?,?,?)')
      .run(planVersionId, taskIntentId, plan.digest, instant, version.json, version.digest);
    const authorization = canonicalRecord({ authorizationId, taskIntentId, origin: 'enabled-learning', authority: 'standard-direct-dispatch',
      startWhen: 'idle', planEnvelopeDigest: plan.digest, controlEntryId: control.entryId, reservedTokens: envelope.budget.perPassTokens, authorizedAt: instant });
    this.#db.prepare(`INSERT INTO analysis_run_authorizations VALUES (?,?,?,'enabled-learning','standard-direct-dispatch',?,?,?,'idle')`)
      .run(authorizationId, taskIntentId, plan.digest, instant, authorization.json, authorization.digest);
    const run = canonicalRecord({ runRecordId, taskIntentId, authorizationId, recordedAt: instant });
    this.#db.prepare('INSERT INTO analysis_run_records VALUES (?,?,?,?,?,?)').run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
    this.#insertRunState(runRecordId, 1, 'authorized', { detail: '已启用的学习范围授权一次完整样例整理；预算已保留。' }, instant);
    return { taskIntentId, runRecordId, authorizationId, controlEntryId: control.entryId, envelope, bundle, planDigest: plan.digest, compositionDigest };
  }

  bindCuration(run: import('../learning/curation.js').CurationRun, sessionId: string): { attemptId: string; bindingDigest: string } {
    const attemptId = randomUUID(), at = new Date().toISOString();
    const attempt = canonicalRecord({ attemptId, runRecordId: run.runRecordId, ordinal: 1, startedAt: at });
    const binding = canonicalRecord({ schema: 'ai7.learning-curation-binding/1', attemptId, harnessSessionId: sessionId,
      planEnvelopeDigest: run.planDigest, sourceManifestDigest: run.bundle.digest, compositionDigest: run.compositionDigest,
      envelope: run.envelope, boundAt: at });
    transact(this.#db, () => {
      this.#db.prepare('INSERT INTO analysis_execution_attempts VALUES (?,?,1,?,?,?)').run(attemptId, run.runRecordId, at, attempt.json, attempt.digest);
      this.#db.prepare('INSERT INTO analysis_execution_bindings VALUES (?,?,?,?,?)').run(attemptId, sessionId, at, binding.json, binding.digest);
      this.recordRunState(run.runRecordId, 'admitted', { detail: '学习整理执行绑定已固定。', attemptId, bindingDigest: binding.digest });
    });
    return { attemptId, bindingDigest: binding.digest };
  }

  settleCuration(run: import('../learning/curation.js').CurationRun, state: 'completed' | 'failed' | 'interrupted',
    evidence: { usage: import('../provider/classification.js').UsageFacts | null; proposals: number; transmitted: boolean; reason: string }): void {
    transact(this.#db, () => {
      this.recordRunState(run.runRecordId, state, { detail: evidence.reason, curation: evidence });
      const outcomeId = randomUUID(), recordedAt = new Date().toISOString();
      const outcome = canonicalRecord({ schema: 'ai7.learning-curation-outcome/1', outcomeId, taskIntentId: run.taskIntentId,
        runRecordId: run.runRecordId, classification: state, resultSetRevisionId: null, sourceManifestDigest: run.bundle.digest,
        summary: evidence.reason, safeNextAction: '查看候选记忆；本批来源不会自动重发。', ...evidence, recordedAt });
      this.#db.prepare('INSERT INTO analysis_task_outcomes VALUES (?,?,?,?,NULL,?,?,?)')
        .run(outcomeId, run.taskIntentId, run.runRecordId, state, recordedAt, outcome.json, outcome.digest);
    });
  }

  /** The analysis kind this ledger serves; the execution owner reads its contract through this. */
  factualRecheckUsed(onceKey: string): boolean {
    return this.#db.prepare("SELECT 1 FROM analysis_run_authorizations WHERE origin = 'background-analysis-enrollment' AND json_extract(canonical_json, '$.factualRecheckOnceKey') = ? LIMIT 1").get(onceKey) !== undefined;
  }

  startFactualRecheck(candidate: import('./factual-recheck.js').FactualRecheckCandidate): import('./factual-recheck.js').FactualRecheckRun {
    requireAnalysis(this.#db.isTransaction && !this.factualRecheckUsed(candidate.onceKey), 'FACTUAL_RECHECK_ALREADY_SUBMITTED', '这条断言已按这个登记和决定提交过，不会自动重发。');
    const taskIntentId = randomUUID(), runRecordId = randomUUID(), authorizationId = randomUUID(), planVersionId = randomUUID();
    const instant = new Date().toISOString();
    const { ledger, limits, ...frozen } = candidate;
    const session = { sessionId: randomUUID(), runRecordId, stage: 'web-verification' as const, scopeId: candidate.selection.claimId,
      ledgerDigest: ledger.digest, sourceMessageDigest: sha256Hex(candidate.message), promptContractDigest: candidate.promptDigest, limits };
    const compositionDigest = describeComposition(candidate.binding.route, candidate.binding.model, candidate.promptDigest, {
      version: 2, procedure: candidate.procedure, platformTools: true, localTools: false,
      researchDeclaration: { webSearch: true, searchEngine: 'user-selected-backend' } }).digest;
    const intent = canonicalRecord({ taskIntentId, bookId: candidate.selection.bookId, kind: 'factual-recheck',
      contractVersion: 'ai7.factual-claim-verification/1', mode: 'factual-recheck', goal: '核查编辑要求补充证据的一条冻结断言',
      factualDecision: candidate.selection, expectedOutcome: 'versioned-factual-verification', createdAt: instant });
    this.#db.prepare(`INSERT INTO analysis_task_intents(task_intent_id,book_id,kind,contract_version,goal,created_at,canonical_json,sha256,mode)
      VALUES (?,?,'factual-recheck','ai7.factual-claim-verification/1',?,?,?,?, 'factual-recheck')`)
      .run(taskIntentId, candidate.selection.bookId, '核查编辑要求补充证据的一条冻结断言', instant, intent.json, intent.digest);
    const plan = canonicalRecord({ schema: 'ai7.factual-recheck-plan/1', ...frozen, taskIntentId, runRecordId, authorizationId,
      session, compositionDigest, policyVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, stages: ['web-verification'], startWhen: 'idle', recordedAt: instant });
    for (const [component, value] of [['run-source-scope', { selection: candidate.selection, messageDigest: session.sourceMessageDigest,
      messageByteCount: Buffer.byteLength(candidate.message, 'utf8') }], ['provider-resolution-plan', { binding: candidate.binding, search: candidate.search }], ['plan-envelope', JSON.parse(plan.json)]] as const) {
      const record = canonicalRecord(value);
      this.#db.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?,?)').run(taskIntentId, component, record.json, record.digest, instant);
    }
    const version = canonicalRecord({ planVersionId, taskIntentId, ordinal: 1, planEnvelopeDigest: plan.digest, createdAt: instant });
    this.#db.prepare('INSERT INTO analysis_plan_versions VALUES (?,?,1,NULL,?,?,?,?)').run(planVersionId, taskIntentId, plan.digest, instant, version.json, version.digest);
    const authorization = canonicalRecord({ authorizationId, taskIntentId, origin: 'background-analysis-enrollment', authority: 'standard-direct-dispatch',
      startWhen: 'idle',
      enrollmentId: candidate.enrollmentId, enrollmentVersionId: candidate.enrollmentVersionId, factualRecheckOnceKey: candidate.onceKey,
      planEnvelopeDigest: plan.digest, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: candidate.maximumTokens }, authorizedAt: instant });
    this.#db.prepare(`INSERT INTO analysis_run_authorizations VALUES (?,?,?,'background-analysis-enrollment','standard-direct-dispatch',?,?,?,'idle')`)
      .run(authorizationId, taskIntentId, plan.digest, instant, authorization.json, authorization.digest);
    const run = canonicalRecord({ runRecordId, taskIntentId, authorizationId, recordedAt: instant });
    this.#db.prepare('INSERT INTO analysis_run_records VALUES (?,?,?,?,?,?)').run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
    this.#insertRunState(runRecordId, 1, 'authorized', { detail: '独立事实复核登记与最新编辑决定已固定；一次性提交身份已保留。' }, instant);
    this.factualVerification.freezeClaims(runRecordId, ledger);
    this.factualVerification.admitClaimSession(session);
    return { ...frozen, taskIntentId, runRecordId, authorizationId, session, compositionDigest, planDigest: plan.digest };
  }

  bindFactualRecheck(run: import('./factual-recheck.js').FactualRecheckRun): { attemptId: string; bindingDigest: string } {
    const attemptId = randomUUID(), at = new Date().toISOString();
    const attempt = canonicalRecord({ attemptId, runRecordId: run.runRecordId, ordinal: 1, startedAt: at });
    const binding = canonicalRecord({ schema: 'ai7.factual-recheck-binding/1', attemptId, harnessSessionId: run.session.sessionId,
      planEnvelopeDigest: run.planDigest, selection: run.selection, binding: run.binding, compositionDigest: run.compositionDigest, boundAt: at });
    transact(this.#db, () => {
      this.#db.prepare('INSERT INTO analysis_execution_attempts VALUES (?,?,1,?,?,?)').run(attemptId, run.runRecordId, at, attempt.json, attempt.digest);
      this.#db.prepare('INSERT INTO analysis_execution_bindings VALUES (?,?,?,?,?)').run(attemptId, run.session.sessionId, at, binding.json, binding.digest);
      this.recordRunState(run.runRecordId, 'admitted', { detail: '单条事实复核执行绑定已固定。', attemptId, bindingDigest: binding.digest });
    });
    return { attemptId, bindingDigest: binding.digest };
  }

  settleFactualRecheck(run: import('./factual-recheck.js').FactualRecheckRun, state: 'completed' | 'failed' | 'interrupted', usage: import('../provider/classification.js').UsageFacts | null): void {
    transact(this.#db, () => {
      const reason = state === 'completed' ? '单条事实复核结果已保留。' : '单条事实复核未完成；提交额度保留，不自动重发。';
      this.recordRunState(run.runRecordId, state, { detail: reason });
      const outcomeId = randomUUID(), recordedAt = new Date().toISOString();
      const outcome = canonicalRecord({ schema: 'ai7.factual-recheck-outcome/1', outcomeId, taskIntentId: run.taskIntentId,
        runRecordId: run.runRecordId, classification: state, resultSetRevisionId: null, selection: run.selection, usage,
        summary: reason, safeNextAction: '查看核查历史；需要进一步核查时记录新的明确决定。', recordedAt });
      this.#db.prepare('INSERT INTO analysis_task_outcomes VALUES (?,?,?,?,NULL,?,?,?)').run(outcomeId, run.taskIntentId, run.runRecordId, state, recordedAt, outcome.json, outcome.digest);
    });
  }

  reconcileFactualRechecks(): void {
    for (const row of this.#db.prepare(`SELECT p.canonical_json, p.sha256 FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id = p.task_intent_id
      WHERE t.kind = 'factual-recheck' AND p.component = 'plan-envelope' AND NOT EXISTS
      (SELECT 1 FROM analysis_task_outcomes o WHERE o.task_intent_id = t.task_intent_id)`).all()) {
      const plan = JSON.parse(String(row.canonical_json)) as import('./factual-recheck.js').FactualRecheckRun;
      this.settleFactualRecheck({ ...plan, planDigest: String(row.sha256) }, 'interrupted', null);
    }
  }

  get definition(): AnalysisKindDefinition {
    this.#refreshClarificationDefinition();
    return this.#definition;
  }

  /**
   * Whether this launch runs the factual Evidence Assurance Levels (Issue #901): a live rule that hands the kind the research
   * tools, or the deterministic route over the provider-free v2 fixture. Anywhere else no Run can research, and every level
   * executes v1 exactly as before, its results 待核查.
   */
  #factualLevelsActive(rule: ReturnType<typeof liveKindRule>): boolean {
    if (this.#launch.live !== null) return platformToolsFromProjection(rule) !== null;
    const route = this.#route;
    return route !== null && (route.fixtureIdentity === FACTUAL_VERIFIED_FIXTURE_IDENTITY ||
      (route.fixtureLineage ?? []).some((link) => link.identity === FACTUAL_VERIFIED_FIXTURE_IDENTITY));
  }

  #factualUnwrapped(level: EvidenceAssuranceLevel, rule: ReturnType<typeof liveKindRule>): AnalysisKindDefinition {
    if (level === 'quick') return factualReviewLevelDefinition('quick');
    if (rule?.claimScopedFactualStages?.evidenceAssuranceLevels.includes(level)) return factualClaimKindDefinition(level);
    if (this.#factualLevelsActive(rule)) return factualReviewLevelDefinition(level);
    const v1 = factualReviewKindDefinition();
    return platformToolsFromProjection(rule) === null ? v1 : withFactualResearch(v1);
  }

  /** The factual definition of one level as this launch executes it, the clarification instruction wrapped as for the kind. */
  #factualDefinitionFor(level: EvidenceAssuranceLevel): AnalysisKindDefinition {
    const rule = liveKindRule(this.#launch.policy, FACTUAL_REVIEW_KIND);
    const unwrapped = this.#factualUnwrapped(level, rule);
    return unwrapped.factualClaims === undefined && (this.#route?.fixtureIdentity.startsWith('sample1-model-clarification') === true || rule?.clarificationQuestionAllowed === true)
      ? withModelClarification(unwrapped) : unwrapped;
  }

  /** The definition one plan version executes: its level's for the factual kind (Issue #901), the ledger's own for every other. */
  #planDefinition(edits: PlanEdits, mode?: string): AnalysisKindDefinition {
    if (this.definition.kind !== FACTUAL_REVIEW_KIND) return this.#definition;
    if (mode !== undefined && mode !== 'whole-manuscript' && this.#definition.factualClaims !== undefined) {
      const successor = this.#factualDefinitionFor(planEditAssuranceLevel(edits));
      return { ...factualReviewLevelDefinition(planEditAssuranceLevel(edits)), outOfScope: successor.outOfScope,
        modes: successor.modes, updateModes: successor.updateModes, mode: successor.mode };
    }
    return this.#factualDefinitionFor(planEditAssuranceLevel(edits));
  }

  /**
   * The definition a frozen plan executes under (Issue #901): for the factual kind the one — of its three levels as this launch
   * runs them, or of the two definitions that predate the levels — whose prompt-contract digest the plan froze; for every other
   * kind, and for a digest no factual definition has, the ledger's own. A plan therefore executes, and replays, under exactly
   * the contract it froze.
   */
  definitionForDigest(promptContractDigest: string): AnalysisKindDefinition {
    const row = this.#db.prepare(`SELECT p.canonical_json, p.sha256 FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id = p.task_intent_id
      WHERE p.component = 'plan-envelope' AND t.kind = ? AND json_extract(p.canonical_json, '$.promptContractDigest') = ?
      AND json_extract(p.canonical_json, '$.basePromptContractDigest') IS NOT NULL LIMIT 1`).get(this.#definition.kind, promptContractDigest);
    if (row !== undefined) {
      const plan = parseCanonicalJson(asString(row.canonical_json)) as { basePromptContractDigest: string };
      const member = readProcedurePlanView(this.#db, String(row.sha256), this.#definition.kind)!;
      return withProcedureDefinition(this.#baseDefinitionForDigest(plan.basePromptContractDigest), member.document, member.pin);
    }
    return this.#baseDefinitionForDigest(promptContractDigest);
  }

  #baseDefinitionForDigest(promptContractDigest: string): AnalysisKindDefinition {
    if (this.#originalDefinition.kind.startsWith('editorial-review/')) {
      const original = pinnedReviewDefinition(this.#originalDefinition, promptContractDigest);
      if (original.promptContractDigest === promptContractDigest) return original;
    }
    const current = this.definition;
    if (current.kind === BASELINE_ANALYSIS_KIND) {
      const base = current.clarificationBase ?? current;
      for (const candidate of [current, base, withModelClarification(base)]) {
        if (candidate.promptContractDigest === promptContractDigest) return candidate;
      }
    }
    if (current.kind.startsWith('editorial-review/')) return pinnedReviewDefinition(current, promptContractDigest);
    if (current.kind !== FACTUAL_REVIEW_KIND) return current;
    for (const level of ['standard', 'strict'] as const) {
      const candidate = factualClaimKindDefinition(level);
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
    }
    for (const level of ['standard', 'strict', 'quick'] as const) {
      const candidate = this.#factualDefinitionFor(level);
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
    }
    for (const candidate of factualReviewDefinitionsByDigest().values()) {
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
      const wrapped = withModelClarification(candidate);
      if (wrapped.promptContractDigest === promptContractDigest) return wrapped;
    }
    return current;
  }

  /** The only permitted departure from a frozen factual plan is its durable offline-at-start downgrade. */
  definitionForRun(runRecordId: string, promptContractDigest: string): AnalysisKindDefinition {
    const planned = this.definitionForDigest(promptContractDigest);
    if (planned.kind !== FACTUAL_REVIEW_KIND) return planned;
    const assurance = this.factualRunAssurance(runRecordId);
    if (assurance?.effectiveLevel !== 'quick') return planned;
    const quick = this.#factualDefinitionFor('quick');
    return planned.procedureBinding === undefined ? quick : withProcedureDefinition(quick, planned.procedureBinding.document, planned.procedureBinding.pin);
  }

  procedureForRun(runRecordId: string): import('../../shared/protocol/procedures.js').ProcedureDefinitionDocument | null {
    const digest = this.#db.prepare(`SELECT a.plan_envelope_sha256 FROM analysis_run_records r
      JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id WHERE r.run_record_id = ?`).get(runRecordId);
    return digest === undefined ? null : readProcedurePlanView(this.#db, String(digest.plan_envelope_sha256), this.#definition.kind)?.document ?? null;
  }

  factualRunAssurance(runRecordId: string): import('../../shared/protocol.js').FactualRunAssuranceProjection | null {
    if (this.#definition.kind !== FACTUAL_REVIEW_KIND ||
        this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'factual_run_assurance'").get() === undefined) return null;
    const row = this.#db.prepare('SELECT canonical_json, sha256 FROM factual_run_assurance WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const json = asString(row.canonical_json);
    requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '事实核查运行级别记录已损坏。');
    return JSON.parse(json) as import('../../shared/protocol.js').FactualRunAssuranceProjection;
  }

  /** A closed unit record read back by the contract that wrote it: a factual v2 record carries `corrections` (Issue #901). */
  #unitResultOfRecord(record: Record<string, unknown>, unitOrdinal: number): unknown {
    if (this.#definition.kind === FACTUAL_REVIEW_KIND) {
      return Object.hasOwn(record, 'corrections') ? factualReviewUnitResultOfRecordV2(record, unitOrdinal)
        : factualReviewKindDefinition().unitResultOfRecord(record, unitOrdinal);
    }
    return this.#definition.unitResultOfRecord(record, unitOrdinal);
  }

  get kind(): AnalysisKindId {
    return this.#definition.kind;
  }

  /** Resolve an immutable baseline revision by the authorized id/digest, never by latest at tool time. */
  pinnedToolSourcesForRun(runRecordId: string): PinnedLocalToolSources | null {
    const facts = this.loadExecutionPlan(runRecordId);
    const sources = facts.compositionOptions?.sources;
    if (sources === undefined) return null;
    const pin = sources.baseline;
    if (pin === null) return sources;
    const row = this.#db.prepare(`SELECT r.* FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
      WHERE r.revision_id = ? AND s.book_id = ? AND s.kind = 'baseline-manuscript-analysis'`).get(pin.revisionId, facts.bookId);
    requireAnalysis(row !== undefined && row.sha256 === pin.digest && sha256Hex(asString(row.canonical_json)) === pin.digest,
      'ANALYSIS_RECORD_INVALID', '固定基线来源不可用。');
    const body = parseCanonicalJson(asString(row.canonical_json)) as { synthesis?: { entities?: unknown[]; events?: unknown[]; settingClaims?: unknown[] } };
    const baseline = { ...pin, entities: body.synthesis?.entities ?? [], events: body.synthesis?.events ?? [], settingClaims: body.synthesis?.settingClaims ?? [] };
    return { ...sources, baseline, terms: baseline.entities.filter((entity) => isRecord(entity) && ['person', 'place', 'term'].includes(String(entity.kind))) };
  }

  #newCompositionOptions(bookId: string, leafMode = false, definition = this.#definition, selected?: ProcedureDefinitionPin): CompositionOptions {
    const id = definition.factualClaims === undefined ? procedureIdForKind(this.#definition.kind) : FACTUAL_CLAIM_PROCEDURE_ID;
    const resolved = selected === undefined ? id === null ? null : resolveProcedureDefinition(this.#db, id, this.#definition.contractVersion === 'ai7.editorial-review/1' ? 1 : currentPreinstalledVersion(id))
      : (({ document, executor }) => ({ document, pin: executor }))(resolveProcedureForKind(this.#db, selected, this.#definition.kind));
    const procedureOptions = resolved === null ? {} : { procedure: resolved.pin, stages: resolved.document.stages.map((stage, index) =>
      ({ ordinal: index + 1, stageType: stage.stageType, digest: sha256Hex(canonicalJson(stage)) })) };
    const stock = reviewCategoryEntry('typos-and-usage')!;
    const expected = withModelClarification(reviewCategoryKindDefinition(reviewCategoryContractInput(stock), 2, STOCK_TYPOS_LEAF_LOCAL_TOOLS));
    const localLeaf = this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE;
    const productionLeaf = leafMode && this.#launch.operationalScope === 'ordinary-production' &&
      this.#launch.policy?.providerProcessing.subAgents !== undefined && this.#definition.promptContractDigest === expected.promptContractDigest;
    if ((localLeaf || productionLeaf) && (selected === undefined || selected.procedureId === resolved?.pin.procedureId)) {
      requireAnalysis(leafMode && this.#definition.promptContractDigest === expected.promptContractDigest &&
        resolved?.pin.procedureId === 'ai7-procedure/review-typos-and-usage' && resolved.pin.version === 2,
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于固定的标准错字用词审阅。');
      return { version: 4, subagents: STOCK_TYPOS_FANOUT, ...procedureOptions, localTools: STOCK_TYPOS_LEAF_LOCAL_TOOLS,
        sources: { baseline: null, guidelines: stock.guidelineDocuments.map(({ documentId, version, clauses }) => ({ documentId, version, clauses })), terms: [] } };
    }
    const local = kindLocalTools(this.#launch.policy, this.#definition.kind);
    if (local?.declarations === undefined) return { version: 2, ...procedureOptions };
    const row = this.#db.prepare(`SELECT r.* FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
      WHERE s.book_id = ? AND s.kind = 'baseline-manuscript-analysis' ORDER BY r.ordinal DESC LIMIT 1`).get(bookId);
    let baseline: PinnedLocalToolSources['baseline'] = null;
    if (row !== undefined) {
      const json = asString(row.canonical_json);
      requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '基线记录摘要无效。');
      baseline = { revisionId: asString(row.revision_id), digest: asString(row.sha256), entities: [], events: [], settingClaims: [] };
    }
    const documents = liveKindRule(this.#launch.policy, this.#definition.kind)?.outboundDataCategories.includes('house-review-guideline-clause') === true
      ? BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.flatMap((category) => category.guidelineDocuments) : [];
    let remaining = 40;
    const guidelines = [...new Map(documents.map((document) => [document.documentId, document])).values()].flatMap((document) => {
      if (remaining === 0) return [];
      const latest = this.#db.prepare('SELECT * FROM review_guideline_versions WHERE document_id = ? ORDER BY ordinal DESC LIMIT 1').get(document.documentId);
      let clauses = document.clauses;
      let version = document.version;
      if (latest !== undefined) {
        const json = asString(latest.canonical_json);
        requireAnalysis(sha256Hex(json) === latest.sha256, 'ANALYSIS_RECORD_INVALID', '规范文件版本摘要无效。');
        const body = parseCanonicalJson(json) as { clauses: typeof clauses };
        clauses = body.clauses;
        version = asString(latest.version_id);
      }
      const admitted = clauses.filter((clause) => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(clause.text)].length <= 300).slice(0, remaining);
      remaining -= admitted.length;
      return [{ documentId: document.documentId, version, clauses: admitted }];
    });
    return { version: 2, ...procedureOptions, sources: { baseline, guidelines, terms: [] } };
  }

  get launch(): LaunchBinding {
    return this.#launch;
  }

  /** Whether a preparation is in flight, which only this instance holds; the store keeps such a ledger (Issue #649). */
  get preparing(): boolean {
    return this.#work.size > 0;
  }

  /** Whether this instance holds the preparation `workId`; the store finds a kept ledger's preparation by it (Issue #672). */
  holdsPreparation(workId: string): boolean {
    return this.#work.has(workId);
  }

  /**
   * Bind the trusted launch facts. The service entry calls this once, before it serves any frame, so
   * that the store never has to reach for a launch policy of its own; a `developer-live` scope
   * without its live binding, or a live binding under any other scope, is refused rather than
   * silently downgraded to the provider-free plan.
   */
  bindLaunch(launch: LaunchBinding): void {
    // Under ordinary-production (Issue #811) the binding may be absent — no route configured yet — and is the editor's, read
    // again whenever a plan freezes; under every other scope it is the launch's, present exactly under developer-live.
    const live = launch.live;
    requireAnalysis(launch.operationalScope === 'ordinary-production'
      ? live === null || live.scope === 'ordinary-production'
      : (launch.operationalScope === 'developer-live') === (live !== null) && (live === null || live.scope !== 'ordinary-production'),
    'ANALYSIS_LAUNCH_BINDING_INVALID', '可信区间与开发者实时绑定不一致。');
    const ceiling = live === null || live.scope === 'ordinary-production' ? null : live.runBudgetCeiling;
    requireAnalysis(live === null ||
      ((ceiling === null || (ceiling.kind === 'tokens'
        ? Number.isSafeInteger(ceiling.maxTotalTokens) && ceiling.maxTotalTokens > 0
        : Number.isSafeInteger(ceiling.tokensPerFrozenUnit) && ceiling.tokensPerFrozenUnit > 0)) &&
        UUID_PATTERN.test(live.credentialReference)),
    'ANALYSIS_LAUNCH_BINDING_INVALID', '开发者实时绑定缺少必需的运行预算上限或凭据引用。');
    // Preserve own fields for callers that spread/rebind the launch. Its policy/live accessors must still read the
    // caller's current connection with their original receiver; the retained reader alone falls back to the Store's.
    const retainedPolicyFor = launch.retainedPolicyFor ?? this.#launch.retainedPolicyFor;
    if (launch.retainedPolicyFor !== undefined || retainedPolicyFor === undefined) this.#launch = launch;
    else {
      const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(launch);
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key]!;
        if (descriptor.get !== undefined) descriptor.get = descriptor.get.bind(launch);
        if (descriptor.set !== undefined) descriptor.set = descriptor.set.bind(launch);
      }
      this.#launch = Object.defineProperties({}, { ...descriptors,
        retainedPolicyFor: { value: retainedPolicyFor, enumerable: true } }) as LaunchBinding;
    }
    this.#refreshClarificationDefinition();
  }

  #refreshClarificationDefinition(): void {
    const launch = this.#launch;
    const rule = liveKindRule(launch.policy, this.#definition.kind);
    const leaf = this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE;
    this.#definition = withReviewLocalTools(this.#definition, leaf ? STOCK_TYPOS_LEAF_LOCAL_TOOLS : kindLocalTools(launch.policy, this.#definition.kind));
    const base = this.#definition.clarificationBase ?? this.#definition;
    // The factual kind's own definition is its default level's (Issue #901): 标准核查 where the levels apply, else v1 as before.
    if (base.kind === FACTUAL_REVIEW_KIND) this.#definition = this.#factualUnwrapped('standard', rule);
    // The one origin-qualified admitted rule owns eligibility; missing terms deny.
    if (leaf || this.#route?.fixtureIdentity.startsWith('sample1-model-clarification') === true ||
        rule?.clarificationQuestionAllowed === true) {
      this.#definition = withModelClarification(this.#definition);
    // An unconfigured production route has no current rule, but a stopped Run still owns its frozen binding.
    } else if (rule !== null) this.#definition = this.#definition.clarificationBase ?? this.#definition;
  }

  /** The launch's binding as its sentences read it: under ordinary-production without a route, 模型服务需设置. */
  #liveReading(): LiveReading {
    return this.#launch.operationalScope === 'ordinary-production' && this.#launch.live === null ? MODEL_SERVICE_SETUP_REQUIRED : this.#launch.live;
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
        // A Task the 后台分析登记 dispatcher prepared says so (Issue #95, S39): it is never shown as one the editor asked for.
        ...(intent.preparedByEnrollmentVersionId === null ? {} : { preparedByEnrollmentVersionId: intent.preparedByEnrollmentVersionId }),
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
    // A Run whose last state is `authorized` is one the governor has not admitted yet: it waits for a place (Issue #49,
    // S14; CONC-007). One with no route is recorded blocked before dispatch in the same transaction.
    const state: BaselineAnalysisProjection['state'] = run === null
      ? 'prepared'
      : run.state === 'authorized' ? 'queued'
        : run.state === 'blocked-before-dispatch'
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
    // A frozen scope plan the chain no longer derives (#711 review P3-4) — one prepared before a release changed how it
    // derives — is never authorized: the Task reads as changed, and preparing again makes a new one.
    const planDerives = authorization !== undefined || this.#frozenPlanDerives(update, manifest);
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
          planEditCeiling(this.#planEditsOf(intent.taskIntentId, currentVersion.ordinal)), undefined, intent.backgroundRunBudgetCeiling);
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
          : state === 'queued' ? (authorization?.start_when === 'idle' ? RUN_WAITING_IDLE_LABEL : RUN_QUEUED_LABEL)
          : state === 'waiting' ? RUN_STATE_LABELS['awaiting-connectivity']
            : state === 'cancelled' ? (run !== null && runBegan(run.transitions) ? RUN_CANCELLED_AFTER_START_LABEL : RUN_STATE_LABELS.cancelled)
              : state === 'cancelling' ? RUN_STATE_LABELS.cancelling
                : state === 'pausing' ? RUN_STATE_LABELS.pausing
                  : state === 'paused' ? (run?.stateLabel ?? RUN_STATE_LABELS.paused)
                    : state === 'resumable' ? (run !== null && this.accountLimitOf(run.runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL
                      : run !== null && this.outcomeUnknownOf(run.runRecordId) !== null ? OUTCOME_UNKNOWN_RUN_LABEL : RUN_STATE_LABELS.resumable)
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
        procedure: readProcedurePlanPin(this.#db, asString(digests['plan-envelope'])),
        dispatchAllowed: envelope.dispatchAllowed === true,
        providerStatus: envelope.providerStatus as 'remote-denied-local-deterministic' | 'remote-denied-no-route',
        summary: asString(envelope.summary),
        promptContractDigest: asString(envelope.promptContractDigest),
        behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
        ...(envelope.compositionVersion === 2 || envelope.compositionVersion === 3 || envelope.compositionVersion === 4 ? { compositionVersion: envelope.compositionVersion } : {}),
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
        startWhen: authorization.start_when === 'idle' ? 'idle' : 'now',
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
        canAuthorize: authorization === undefined && (update === null || update.predecessorCurrent) && planRevision === null && planDerives,
        canReconfirmPlan,
      },
      namedNonEffects: namedNonEffects(this.#liveReading(), manifest.units.length),
    });
  }

  /**
   * The durable `safe-retry` Plan Adaptations of one Run, in record order. Both the Run's timeline
   * and its Run Report read them from here, so neither restates what the other saw. Each follows the
   * span that names it to the retry's own turn, and reads whether that turn repeated the first
   * attempt's unit message byte for byte (Issue #286).
   */
  adaptationsOf(runRecordId: string): BaselineAnalysisPlanAdaptationProjection[] {
    return (this.#db.prepare(
      `SELECT adaptation.* FROM analysis_plan_adaptations adaptation
       JOIN analysis_execution_attempts attempt ON attempt.attempt_id = adaptation.attempt_id
       WHERE attempt.run_record_id = ? ORDER BY adaptation.ordinal`,
    ).all(runRecordId) as SqlRow[]).map((row): BaselineAnalysisPlanAdaptationProjection => {
      // An adaptation recorded before Issue #286 names no unit-message digest, and reads as one that kept none.
      const record = parseCanonicalJson(asString(row.canonical_json)) as Omit<PlanAdaptationRecord, 'firstUnitMessageDigest'> & { firstUnitMessageDigest?: string | null };
      const first = record.firstUnitMessageDigest ?? null;
      requireAnalysis(record.adaptationId === row.adaptation_id && (record.adaptationClass === 'safe-retry' || record.adaptationClass === 'contract-retry'), 'ANALYSIS_RECORD_INVALID', '计划内调整记录无效。');
      const retry = this.#retryTurnOf(asString(row.attempt_id), asNumber(row.unit_ordinal), record.adaptationId, record.firstUnitMessageDigest === undefined);
      const repetition: SafeRetryRepetition = first === null || retry === null || retry.unitMessageDigest === null ? 'unrecorded'
        : retry.unitMessageDigest === first ? 'byte-identical' : 'differs';
      return { ...record, firstUnitMessageDigest: first, retry, repetition, label: planAdaptationLabel(record.unitOrdinal, record.classifiedReason, repetition, record.adaptationClass) };
    });
  }

  /**
   * A safe retry's own turn (Issue #286): the span of its attempt and unit that names the adaptation it carried out, found by
   * the store rather than by reading every span of the unit (Issue #286 review). An adaptation recorded before Issue #286 has
   * spans that name no adaptation; its retry's turn is then the one second attempt of its unit in its attempt recorded before
   * the digests were kept, when there is exactly one, and only when it is the one adaptation of that unit in that attempt
   * recorded before them (Issue #286 review). An explicit Resume could have added more of either, and then none is taken. Such
   * a turn keeps its payload digest and no unit-message digest.
   */
  #retryTurnOf(attemptId: string, unitOrdinal: number, adaptationId: string, recordedBefore286: boolean): BaselineAnalysisPlanAdaptationProjection['retry'] {
    const turn = (row: SqlRow): NonNullable<BaselineAnalysisPlanAdaptationProjection['retry']> => {
      const span = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      return {
        spanOrdinal: asNumber(row.ordinal),
        unitMessageDigest: typeof span.unitMessageDigest === 'string' ? span.unitMessageDigest : null,
        payloadDigest: typeof span.payloadDigest === 'string' ? span.payloadDigest : null,
      };
    };
    const named = this.#db.prepare(
      `SELECT ordinal, canonical_json FROM analysis_harness_spans
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_extract(canonical_json, '$.adaptationId') = ?
       ORDER BY ordinal LIMIT 1`,
    ).get(attemptId, unitOrdinal, adaptationId) as SqlRow | undefined;
    if (named !== undefined) return turn(named);
    if (!recordedBefore286) return null;
    // Both sides are one: a second adaptation of the unit recorded before the digests could claim the same turn.
    const adaptations = this.#db.prepare(
      `SELECT count(*) AS total FROM (SELECT 1 FROM analysis_plan_adaptations
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_type(canonical_json, '$.firstUnitMessageDigest') IS NULL LIMIT 2)`,
    ).get(attemptId, unitOrdinal) as SqlRow;
    if (asNumber(adaptations.total) !== 1) return null;
    const earlier = this.#db.prepare(
      `SELECT ordinal, canonical_json FROM analysis_harness_spans
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_type(canonical_json, '$.unitMessageDigest') IS NULL
         AND json_type(canonical_json, '$.adaptationId') IS NULL AND json_extract(canonical_json, '$.attemptIndex') = 2
       ORDER BY ordinal LIMIT 2`,
    ).all(attemptId, unitOrdinal) as SqlRow[];
    return earlier.length === 1 ? turn(earlier[0]!) : null;
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
  attentionReadings(
    progress: ProgressReader,
    since: string,
    limit: number,
    // A Book's 任务 panel (Issue #423, S77a): that Book alone, and its cancelled Tasks among the outcomes.
    scope: { bookId: string; cancelled: boolean } | null = null,
  ): {
    tasks: AnalysisTaskAttentionReading[];
    outcomes: AnalysisOutcomeAttentionReading[];
  } {
    const kind = this.#definition.kind;
    // The caller composes each kind's readings under its own Task target; review categories remain one Review Run item.
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
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY t.created_at, t.task_intent_id LIMIT ?`,
    ).all(kind, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[];
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
            waitingIdle: state === 'authorized' && this.loadExecutionPlan(runRecordId).startWhen === 'idle',
            idleYield: (state === 'paused' || state === 'pausing') && this.#idleYielded(runRecordId),
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
            // 结果待确认 (Issue #51, S16c): a resumable Run stopped on a sent request whose result cannot be known.
            // It holds them while paused, account-limited, waiting for an answer or left 可续行 too, and is listed so (P2-1).
            outcomeUnknown: (state === 'paused' || state === 'resumable' || state === 'awaiting-clarification') && this.unconfirmedRangesOf(runRecordId).length > 0,
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
       WHERE t.kind = ? AND o.classification IN ('completed', 'completed-with-gaps'${scope?.cancelled === true ? ", 'cancelled'" : ''}) AND o.recorded_at >= ?
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY o.recorded_at DESC, o.outcome_id LIMIT ?`,
    ).all(kind, since, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[]).map((row): AnalysisOutcomeAttentionReading => ({
      bookId: asString(row.book_id),
      bookTitle: asString(row.book_title),
      taskIntentId: asString(row.task_intent_id),
      mode: asString(row.mode) as BaselineAnalysisTaskMode,
      outcomeId: asString(row.outcome_id),
      runRecordId: asString(row.run_record_id),
      classification: asString(row.classification) as 'completed' | 'completed-with-gaps' | 'cancelled',
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
        planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal)), undefined, intent.backgroundRunBudgetCeiling));
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
      namedNonEffects: namedNonEffects(this.#liveReading()),
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
    frozenProductionBinding?: MaterialPlanInputsProjection['providerBinding'],
    /** A 后台分析登记's Task: the Book's share of the Enrollment's ceiling, which replaces the editor's (Issue #864). */
    backgroundCeiling: BackgroundRunBudgetCeiling | null = null,
  ): MaterialPlanInputsProjection {
    const connection = this.#db.prepare(
      `SELECT provider_id, model_id, adapter_revision, configuration_revision, credential_reference
       FROM model_service_connections WHERE connection_id = 'main-editorial-deepseek-v4-pro'`,
    ).get() as SqlRow | undefined;
    // A live binding names its own route and reference; ordinary production's may be the Go row alone (Issue #811).
    requireAnalysis(frozenProductionBinding !== undefined || connection !== undefined || this.#launch.live !== null, 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
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
      ...this.#selectedPlanMetadata(),
      providerBinding: frozenProductionBinding ?? (live === null
        ? {
            providerId: asString(connection!.provider_id),
            // The denied production binding a development-ci plan freezes names the model Issue #712 named; since revision 72
            // the connection row names its route's current model instead, which no development-ci plan calls (Issue #811).
            modelId: 'deepseek-v4-pro',
            adapterRevision: asNumber(connection!.adapter_revision),
            configurationRevision: asNumber(connection!.configuration_revision),
            credentialReference: asString(connection!.credential_reference),
          }
        : {
            providerId: live.route,
            modelId: live.model,
            adapterRevision: 1,
            configurationRevision: 1,
            credentialReference: live.credentialReference,
          }),
      artifactPin: {
        identity: asString(pin.native_artifact_id),
        version: asString(pin.artifact_version),
        nativeCarrierSha256: asString(pin.content_sha256),
        sidecarRevision: asNumber(pin.sidecar_revision),
        sidecarSha256: asString(pin.sidecar_sha256),
      },
      selectedRange: this.#definition.mode(mode).rangeBound ? selectedRange : null,
      predecessorRevision: latest === undefined ? null : { revisionId: asString(latest.revision_id), ordinal: asNumber(latest.ordinal), digest: asString(latest.sha256) },
      runBudgetCeiling: this.#planCeiling(unitCount, editorCeiling, backgroundCeiling),
      outboundDataCategory: this.#launch.operationalScope === 'ordinary-production' ? 'unpublished-excerpts' : 'public-or-synthetic',
      expectedOutcome: this.#definition.expectedOutcome,
    };
  }

  #selectedPlanMetadata(policy = this.#launch.policy): Pick<MaterialPlanInputsProjection, 'selectedPolicyIdentity' | 'localFixtureProfile'> {
    if (policy?.selectedPolicyIdentity === undefined) {
      requireAnalysis(!['v21', 'v22', 'v23'].includes(policy?.activePolicySetVersion ?? '') && !['v29', 'v30', 'v31', 'v32'].includes(policy?.providerProcessing.version ?? ''),
        'ANALYSIS_POLICY_UNAVAILABLE', '当前计划缺少已选处理策略身份。');
      return {};
    }
    const selected = selectedPolicyIdentityOf(policy.selectedPolicyIdentity);
    requireAnalysis(policy.integrityState === 'verified' && selected !== null && selected.providerProcessingVersion === policy.providerProcessing.version,
      'ANALYSIS_POLICY_UNAVAILABLE', '已选处理策略身份无效。');
    if (selected.providerProcessingVersion !== 'v29' || this.#route === null) return { selectedPolicyIdentity: selected };
    const runtime = this.#launch.localFixtureRuntime?.();
    requireAnalysis(runtime !== undefined && runtime !== null && canonicalJson(runtime.selectedPolicyIdentity) === canonicalJson(selected),
      'ANALYSIS_POLICY_UNAVAILABLE', '本地夹具策略目录缺失或不一致。');
    // Plan inputs are also re-derived to detect drift; a launch whose fixture cannot serve this kind must read as drift, not
    // fail the read. Execution still refuses an unserved fixture before any replay (LocalFixturePolicyCatalog.entriesFor).
    return { selectedPolicyIdentity: selected,
      localFixtureProfile: runtime.catalog.legacyProfile(selected, localFixtureRegisteredProfile(this.#definition.kind, null)) };
  }

  /**
   * The ceiling a plan freezes (Issue #51; ADR 0070; Issue #864): a 后台分析登记's Task its Book's share of the Enrollment's
   * ceiling — under developer-live the lower of that share and the launch's own — and every other Task the editor's outside
   * developer-live and the launch's under it.
   */
  #planCeiling(unitCount: number, editorCeiling: RunBudgetCeilingState, background: BackgroundRunBudgetCeiling | null): RunBudgetCeilingState {
    const live = this.#launch.live;
    const share = background === null ? null : { kind: 'tokens' as const, maxTotalTokens: background.maxTotalTokens };
    if (live === null || live.scope === 'ordinary-production') return share ?? editorCeiling;
    const launch = resolveDeveloperLiveCeiling(live.runBudgetCeiling, unitCount);
    return share === null || launch.maxTotalTokens < share.maxTotalTokens ? launch : share;
  }

  /**
   * Where the Book's primary manuscript stands now (Issue #95, S39): its branch, revision, journal and working digest — what a
   * `prospective` Background Analysis Enrollment compares with the text it was made against — and when the last confirmed edit
   * of the branch was made durable, whatever revision it was made on, so a checkpoint any Task takes never clears the
   * Enrollment's quiet period (#713 review, P2-1); `null` when the branch was never edited.
   */
  workingPointOf(bookId: string): { branchId: string; revisionId: string; journalSequence: number; workingDigest: string; lastEditAt: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '图书标识无效。');
    const manuscript = this.#db.prepare("SELECT manuscript_id FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) as SqlRow | undefined;
    requireAnalysis(manuscript !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    const head = this.#workingHead(asString(manuscript.manuscript_id), bookId);
    const last = this.#db.prepare('SELECT max(durable_at) last FROM edit_journal_entries WHERE branch_id = ?').get(head.branchId) as SqlRow;
    return {
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      journalSequence: head.currentJournalSequence,
      workingDigest: head.currentWorkingDigest,
      lastEditAt: last.last === null ? null : asString(last.last),
    };
  }

  /**
   * The Book's latest Task the editor asked for — not one the 后台分析登记 dispatcher prepared (Issue #95, S39) — with when it was
   * made and the working text its Task Input checkpoint pinned, if it has one; `null` when the editor never asked for one.
   */
  latestEditorTaskOf(bookId: string): { taskIntentId: string; createdAt: string; checkpointDigest: string | null } | null {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '图书标识无效。');
    // One row, found by the record's own mark (#713 re-review, P3-3): never a walk over the Tasks the dispatcher made since.
    const row = this.#db.prepare(
      `SELECT * FROM analysis_task_intents WHERE book_id = ? AND kind = ?
         AND json_extract(canonical_json, '$.preparedByEnrollmentVersionId') IS NULL
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
    if (row === undefined) return null;
    const intent = this.#intentFacts(row);
    requireAnalysis(intent.preparedByEnrollmentVersionId === null, 'ANALYSIS_RECORD_INVALID', '任务意图记录无效。');
    const checkpoint = this.#db.prepare('SELECT revision_digest FROM analysis_task_input_checkpoints WHERE task_intent_id = ?')
      .get(intent.taskIntentId) as SqlRow | undefined;
    return { taskIntentId: intent.taskIntentId, createdAt: intent.createdAt, checkpointDigest: checkpoint === undefined ? null : asString(checkpoint.revision_digest) };
  }

  /**
   * The Book's latest Task as the 后台分析登记 dispatcher weighs it, read without building a projection (#713 re-review, P3-3):
   * whose it is, the text its checkpoint pinned, whether its plan froze, whether it was authorized, and its Run's last state.
   */
  latestTaskFactsOf(bookId: string): null | {
    preparedByEnrollment: boolean; checkpointDigest: string | null; planned: boolean; authorized: boolean; runState: BaselineAnalysisRunState | null;
  } {
    const row = this.#latestIntentRow(bookId);
    if (row === undefined) return null;
    const intent = this.#intentFacts(row);
    const checkpoint = this.#db.prepare('SELECT revision_digest FROM analysis_task_input_checkpoints WHERE task_intent_id = ?')
      .get(intent.taskIntentId) as SqlRow | undefined;
    const planned = this.#db.prepare('SELECT 1 FROM analysis_plan_versions WHERE task_intent_id = ? LIMIT 1').get(intent.taskIntentId) !== undefined;
    const authorized = this.#db.prepare('SELECT 1 FROM analysis_run_authorizations WHERE task_intent_id = ?').get(intent.taskIntentId) !== undefined;
    const state = this.#db.prepare(
      `SELECT s.state FROM analysis_run_records r JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
       WHERE r.task_intent_id = ? ORDER BY s.sequence DESC LIMIT 1`,
    ).get(intent.taskIntentId) as SqlRow | undefined;
    return {
      preparedByEnrollment: intent.preparedByEnrollmentVersionId !== null,
      checkpointDigest: checkpoint === undefined ? null : asString(checkpoint.revision_digest),
      planned,
      authorized,
      runState: state === undefined ? null : asString(state.state) as BaselineAnalysisRunState,
    };
  }

  /**
   * Whether the Book's latest Result Set Revision is current with the working text, read from its pin alone (#713 re-review,
   * P3-3): the same comparison `#freshness` makes for the latest revision, with no projection built.
   */
  analysisFreshnessOf(bookId: string): 'absent' | 'current' | 'stale' {
    const latest = this.#db.prepare(
      `SELECT r.manuscript_revision_id, r.manuscript_revision_digest FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC LIMIT 1`,
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
    if (latest === undefined) return 'absent';
    const point = this.workingPointOf(bookId);
    return point.revisionId === asString(latest.manuscript_revision_id) && point.workingDigest === asString(latest.manuscript_revision_digest)
      ? 'current' : 'stale';
  }

  /** Whether any preparation of the Book is under way on this ledger (Issue #95, S39): the editor's or the dispatcher's. */
  preparationInFlight(bookId: string): boolean {
    return Array.from(this.#work.values()).some((work) => work.bookId === bookId);
  }

  /** Whether a preparation of the Book other than `workId` is under way: the dispatcher's own is never counted against it. */
  preparationInFlightBesides(bookId: string, workId: string | null): boolean {
    return Array.from(this.#work.values()).some((work) => work.bookId === bookId && work.workId !== workId);
  }

  /**
   * The facts a 默认执行规则 binds, as the Book's durable state reads now (Issue #421): the re-derivation Reconnect
   * Preflight compares a waiting Run's plan with, for an update of the whole Book. Outside developer-live the ceiling
   * depends on no unit count. Under it a rule is read only for writing's quick start, whose selected rule admits the
   * default-execution-rule origin (#810): every other kind is refused as before, and the writing ceiling resolves against
   * the units the next checkpoint would freeze — the primary manuscript's working blocks — as the freeze resolves it.
   */
  currentRuleFacts(bookId: string, mode: AnalysisTaskMode): MaterialPlanInputsProjection {
    const live = this.#launch.live;
    const liveWriting = live !== null && this.#definition.kind === WRITING_KIND && liveKindRule(this.#launch.policy, WRITING_KIND) !== null;
    // What a 后台分析登记 binds, under the selected policy's enrolled-background rule (Issue #864).
    const liveBackground = live !== null && this.#definition.kind === BASELINE_ANALYSIS_KIND &&
      liveKindRule(this.#launch.policy, BASELINE_ANALYSIS_KIND, [], 'background') !== null;
    requireAnalysis(UUID_PATTERN.test(bookId) && (live === null || liveWriting || liveBackground) && !this.#definition.mode(mode).rangeBound,
      'ANALYSIS_RULE_FACTS_INVALID', '无法读取默认执行规则所需的当前事实。');
    return this.#currentMaterialInputs(bookId, mode, null, liveWriting ? this.#workingUnitCount(bookId) : 0);
  }

  /** How many units a checkpoint of the Book's primary manuscript would freeze now: its working blocks' manifest. */
  #workingUnitCount(bookId: string): number {
    const manuscript = this.#db.prepare("SELECT manuscript_id FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) as SqlRow | undefined;
    requireAnalysis(manuscript !== undefined, 'ANALYSIS_RULE_FACTS_INVALID', '无法读取默认执行规则所需的当前事实。');
    const manuscriptId = asString(manuscript.manuscript_id);
    const head = this.#workingHead(manuscriptId, bookId);
    return deriveCoverageManifest({
      bookId,
      manuscriptId,
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest,
      blocks: this.readWorkingBlocks(head.branchId),
    }).units.length;
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
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal)), undefined, intent.backgroundRunBudgetCeiling);
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
      evidenceAssuranceLevel?: unknown;
    },
  ): AnalysisProjection {
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
    // The Evidence Assurance Level is a factual-review Task's term alone (Issue #901); left out, the version keeps its own.
    requireAnalysis(input.evidenceAssuranceLevel === undefined || this.#definition.kind === FACTUAL_REVIEW_KIND,
      'ANALYSIS_PLAN_EDIT_INVALID', '只有事实核查任务有证据保证级别。');
    const next = canonicalPlanEdits({ ...input, evidenceAssuranceLevel: input.evidenceAssuranceLevel ?? existing.planVersion?.edits.evidenceAssuranceLevel });
    requireAnalysis(next !== null, 'ANALYSIS_PLAN_EDIT_INVALID', '这项修改不在这份计划可以改的范围内。');
    if (isRecord(intent.record.factualDecision)) requireAnalysis(planEditAssuranceLevel(next) === intent.record.factualDecision.level || planEditAssuranceLevel(next) === 'strict',
      'ANALYSIS_PLAN_EDIT_INVALID', '补充核查不能降低编辑决定要求的核查级别。');
    requireAnalysis(!levelBelowPolicyMinimum(planEditAssuranceLevel(next)), 'ANALYSIS_PLAN_EDIT_INVALID', FACTUAL_POLICY_MINIMUM_REASON);
    requireAnalysis(this.#definition.assurance !== null || next.removedSteps.length === 0,
      'ANALYSIS_PLAN_EDIT_INVALID', '这项任务没有核对与抽检步骤，不能修改该步骤。');
    requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || (next.askFirstAdaptations ?? []).length === 0,
      'ANALYSIS_PLAN_EDIT_INVALID', '这项任务暂不能把安全重试改成先问你。');
    requireAnalysis(!launchSetsCeilingOf(this.#launch.live) || next.runBudgetCeiling === undefined, 'ANALYSIS_PLAN_EDIT_INVALID', PLAN_CEILING_LAUNCH_REASON);
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
    const proposed: MaterialPlanInputsProjection = { ...stored, runBudgetCeiling: !launchSetsCeilingOf(this.#launch.live) ? planEditCeiling(next) : stored.runBudgetCeiling };
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
      // A ceiling the editor moved moves the Provider Resolution Plan too — in that one field, and nothing else. A factual
      // Task's Evidence Assurance Level (Issue #901) moves its research declaration: the web tools backend the plan freezes and
      // the provider plan's naming of it, and nothing else.
      const levelMoved = planEditAssuranceLevel(prior) !== planEditAssuranceLevel(next);
      const providerMoved = (ceilingMoved || levelMoved) && !this.#providerPlansDifferOnlyIn(intent.taskIntentId, current.ordinal, ceilingMoved, levelMoved);
      const moved = Object.keys({ ...before, ...after }).filter((component) =>
        component !== 'execution-plan' && component !== 'plan-envelope' && before[component] !== after[component] &&
        (component !== 'web-tools-backend' || !levelMoved) &&
        (component !== 'provider-resolution-plan' || !(ceilingMoved || levelMoved) || providerMoved));
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
  #selectedDefinition(base: AnalysisKindDefinition, bookId: string): AnalysisKindDefinition {
    const pin = selectedProcedureForBook(this.#db, bookId, base.kind);
    return pin === null ? base : ((member) => withProcedureDefinition(base, member.document, member.pin))(resolveProcedureForKind(this.#db, pin, base.kind));
  }

  #derivePlan(
    mode: AnalysisTaskMode,
    selectedRange: BaselineAnalysisSelectedRange | null,
    manifest: CoverageManifestProjection,
    predecessor: ReusePlanPredecessor | ScopePlanPredecessor | null,
    definition = this.#selectedDefinition(this.#definition, manifest.manuscript.bookId),
  ): AnalysisPlanRecord {
    const prior = predecessor === null ? null : this.#revisionBody(this.#revisionRowById(predecessor.revisionId));
    const priorDefinition = prior === null ? null : this.definitionForDigest(String((prior.bindingPin as Record<string, unknown>).promptContractDigest));
    const procedureCompatible = definition.procedureBinding === undefined && priorDefinition?.procedureBinding === undefined ||
      prior?.schemaDigest === definition.schemaDigest;
    if (this.#definition.outOfScope === 'leave-unreviewed') {
      requireAnalysis(predecessor === null || 'schemaDigest' in predecessor, 'ANALYSIS_RECORD_INVALID', '前一修订版缺少审阅范围计划所需的事实。');
      return deriveScopePlan({
        procedureCompatible,
        kind: this.#definition.kind,
        contractVersion: this.#definition.contractVersion,
        schemaDigest: this.#definition.schemaDigest,
        ...(this.#definition.contractIdentity?.categoryConfiguration === undefined ? {} : { categoryConfigurationIdentity: canonicalJson(this.#definition.contractIdentity.categoryConfiguration) }),
        mode,
        recompute: this.#definition.mode(mode).recompute,
        selectedRange,
        manifest,
        predecessor: predecessor as ScopePlanPredecessor | null,
      });
    }
    requireAnalysis(predecessor !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    return deriveReusePlan({ procedureCompatible, mode: mode as BaselineAnalysisUpdateMode, selectedRange, manifest, predecessor });
  }

  /** The counts a whole first Task's revision states: every unit read, none reused. */
  #wholeFirstCounts(unitCount: number): AnalysisReusePlanCounts | ReviewScopePlanCounts {
    const counts = firstBaselineCounts(unitCount);
    return this.#definition.outOfScope === 'leave-unreviewed' ? { ...counts, unreviewed: 0 } : counts;
  }

  #intentFacts(row: SqlRow): IntentFacts {
    const mode = asString(row.mode) as AnalysisTaskMode;
    const goal = asString(row.goal);
    const record = parseCanonicalJson(asString(row.canonical_json));
    // A Task promoted from a draft holds the draft's sentence (Issue #423, slice 7a); every other Task its mode's fixed goal.
    const intentDraftVersionId = isRecord(record) && typeof record.intentDraftVersionId === 'string' && UUID_PATTERN.test(record.intentDraftVersionId)
      ? record.intentDraftVersionId : null;
    requireAnalysis(isRecord(record) && (record.intentDraftVersionId === undefined || intentDraftVersionId !== null) &&
      (intentDraftVersionId === null ? goal === this.#definition.mode(mode).goal : isDraftGoal(goal) && record.goal === goal),
    'ANALYSIS_RECORD_INVALID', '任务意图的目标与更新方式不一致。');
    requireAnalysis(isRecord(record) && record.taskIntentId === row.task_intent_id && typeof record.expectedOutcome === 'string' &&
      (record.redoOfRunRecordId === undefined || (typeof record.redoOfRunRecordId === 'string' && UUID_PATTERN.test(record.redoOfRunRecordId))) &&
      (record.preparedByEnrollmentVersionId === undefined ||
        (typeof record.preparedByEnrollmentVersionId === 'string' && UUID_PATTERN.test(record.preparedByEnrollmentVersionId) && record.redoOfRunRecordId === undefined)) &&
      // Only the dispatcher's Task carries the ceiling its Enrollment holds it to (Issue #864).
      (record.backgroundRunBudgetCeiling === undefined ||
        (record.preparedByEnrollmentVersionId !== undefined && isBackgroundRunBudgetCeiling(record.backgroundRunBudgetCeiling))),
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
      preparedByEnrollmentVersionId: record.preparedByEnrollmentVersionId === undefined ? null : record.preparedByEnrollmentVersionId as string,
      backgroundRunBudgetCeiling: record.backgroundRunBudgetCeiling === undefined ? null : record.backgroundRunBudgetCeiling as BackgroundRunBudgetCeiling,
      intentDraftVersionId,
      intentDraftParagraphs: isRecord(record) && Number.isSafeInteger(record.intentDraftParagraphs) && (record.intentDraftParagraphs as number) > 0
        ? record.intentDraftParagraphs as number : null,
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
    if (isRecord(intent.record.factualDecision)) return intent.record.factualDecision.level === 'strict'
      ? { ...NO_PLAN_EDITS, evidenceAssuranceLevel: 'strict' } : NO_PLAN_EDITS;
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
    requireAnalysis(isRecord(records['provider-resolution-plan']), 'ANALYSIS_RECORD_INVALID', '处理策略计划记录无效。');
    providerPlanPolicyMetadata(records['provider-resolution-plan']);
    const envelope = records['plan-envelope'] as Record<string, unknown>;
    const route = (records['provider-resolution-plan'] as { executionRoute?: { kind: string; model: string; fixtureIdentity?: string; fixtureSha256?: string } }).executionRoute;
    if (route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE || envelope.compositionVersion === 3 || envelope.compositionVersion === 4) {
      const stock = reviewCategoryEntry('typos-and-usage')!;
      const definition = withModelClarification(reviewCategoryKindDefinition(reviewCategoryContractInput(stock), 2, STOCK_TYPOS_LEAF_LOCAL_TOOLS));
      const options = envelope.compositionOptions as CompositionOptions | undefined;
      const procedure = resolveProcedureDefinition(this.#db, 'ai7-procedure/review-typos-and-usage', 2);
      requireAnalysis((envelope.compositionVersion === 3 || envelope.compositionVersion === 4) && route !== undefined && options?.version === envelope.compositionVersion &&
        (mode === 'any' || mode === 'review-first') && envelope.promptContractDigest === definition.promptContractDigest &&
        canonicalJson(options.subagents) === canonicalJson(options.version === 4 ? STOCK_TYPOS_FANOUT : STOCK_TYPOS_LEAF) &&
        canonicalJson(options.localTools) === canonicalJson(STOCK_TYPOS_LEAF_LOCAL_TOOLS) &&
        canonicalJson(options.sources) === canonicalJson({ baseline: null, guidelines: stock.guidelineDocuments.map(({ documentId, version, clauses }) => ({ documentId, version, clauses })), terms: [] }) &&
        procedure !== null && canonicalJson(options.procedure) === canonicalJson(procedure.pin) &&
        canonicalJson(options.stages) === canonicalJson(procedure.document.stages.map((stage, index) => ({ ordinal: index + 1, stageType: stage.stageType, digest: sha256Hex(canonicalJson(stage)) }))) &&
        (route.kind !== LOCAL_DETERMINISTIC_ROUTE || route.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE &&
          route.fixtureSha256 === sha256Hex(`${STOCK_TYPOS_LEAF_FIXTURE}:${STOCK_TYPOS_LEAF_FIXTURE_SHA256}`)),
      'ANALYSIS_CHILD_PROFILE_REFUSED', '冻结的单元子代理配置不属于固定标准审阅。');
      requireAnalysis(describeComposition(route.kind as ExecutionRouteId, route.model, definition.promptContractDigest, options).digest === envelope.behaviorCompositionDigest,
        'ANALYSIS_CHILD_PROFILE_REFUSED', '冻结的单元子代理组合摘要不一致。');
    }
    if (envelope.webToolsBackendDigest !== undefined) {
      const backend = records['web-tools-backend'];
      const provider = records['provider-resolution-plan'] as Record<string, unknown>;
      requireAnalysis(isRecord(backend) && canonicalRecord(backend).digest === envelope.webToolsBackendDigest && canonicalJson(backend) === canonicalJson(provider.webToolsBackend),
        'ANALYSIS_RECORD_INVALID', '联网检索冻结记录与计划信封不一致。');
    }
    return records;
  }

  #planDigests(taskIntentId: string, planVersion: number): Record<string, string> {
    return Object.fromEntries((this.#db.prepare('SELECT component, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(taskIntentId, planVersion) as SqlRow[])
      .map((row) => [asString(row.component), asString(row.sha256)]));
  }

  /** Whether one version's Provider Resolution Plan and the next differ in the Run Budget Ceiling alone (Issue #51, S16a). */
  #providerPlansDifferOnlyIn(taskIntentId: string, priorOrdinal: number, ceiling: boolean, tools: boolean): boolean {
    const sansCeiling = (ordinal: number): string => {
      const row = this.#db.prepare(
        "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'provider-resolution-plan'",
      ).get(taskIntentId, ordinal) as SqlRow | undefined;
      requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      const record = parseCanonicalJson(asString(row.canonical_json));
      requireAnalysis(isRecord(record), 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      const { webToolsBackend: _backend, searchCredentialReference: _reference, webToolsFallback: _fallback, ...rest } = record as Record<string, unknown>;
      const kept = tools ? rest : record;
      return canonicalJson(ceiling ? { ...kept, runBudgetCeiling: null } : kept);
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
          unitMessageDigest: typeof record.unitMessageDigest === 'string' ? record.unitMessageDigest : null,
        };
      });
      if (this.requestAdmissionOf(runRecordId)?.width === 3) spans.sort((left, right) =>
        (left.unitOrdinal ?? Number.MAX_SAFE_INTEGER) - (right.unitOrdinal ?? Number.MAX_SAFE_INTEGER) || left.ordinal - right.ordinal);
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
      procedure: (parseCanonicalJson(asString(runRecord.canonical_json)) as { procedure?: ProcedureDefinitionPin }).procedure ?? null,
      state: current.state,
      stateLabel: currentRecord.idleYield === true ? RUN_IDLE_YIELD_LABEL : current.state === 'cancelled' && runBegan(transitions) ? RUN_CANCELLED_AFTER_START_LABEL
        : current.state === 'interrupted' && this.#runStop(runRecordId) !== null ? BUDGET_REACHED_RUN_LABEL
          : current.state === 'resumable' && this.accountLimitOf(runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL
            : current.state === 'resumable' && this.outcomeUnknownOf(runRecordId) !== null ? OUTCOME_UNKNOWN_RUN_LABEL
            : blockedBy === 'plan-moved' ? PLAN_MOVED_LABEL : RUN_STATE_LABELS[current.state],
      recordedAt: asString(runRecord.recorded_at),
      transitions,
      adaptations,
      blockedReasons: current.state === 'blocked-before-dispatch' ? recordedReasons ?? blockedReasons(this.#liveReading()) : null,
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
      ...(binding.compositionVersion === 2 || binding.compositionVersion === 3 || binding.compositionVersion === 4 ? { compositionVersion: binding.compositionVersion } : {}),
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

  /** A revision's `outcome-unknown` gaps (Issue #51, S16c): the ranges whose request was sent and whose result is unknown. */
  #unknownGapOrdinals(row: SqlRow): number[] {
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || !Array.isArray(record.gaps)) return [];
    return record.gaps.flatMap((gap: unknown) =>
      isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number' ? [gap.unitOrdinal] : []);
  }

  /**
   * 结果待确认 left in the Book's latest revision (Issue #51, S16c): its `outcome-unknown` gaps, which any Task that recomputes
   * them would send again — the background dispatcher never starts one over them (CTRL-007, CONT-011).
   */
  latestUnconfirmedRangesOf(bookId: string): number[] {
    const latest = this.#revisionRows(bookId).at(-1);
    return latest === undefined ? [] : this.#unknownGapOrdinals(latest);
  }

  /**
   * A revision's `outcome-unknown` gaps by the content key of their unit, with each gap's own words (Issue #51, S16c): what a
   * later Run that ends without reading such a range carries forward as the same gap.
   */
  unknownGapsByContentKey(revisionId: string): Map<string, string> {
    const row = this.#db.prepare('SELECT * FROM analysis_result_set_revisions WHERE revision_id = ?').get(revisionId) as SqlRow | undefined;
    if (row === undefined) return new Map();
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || !Array.isArray(record.gaps)) return new Map();
    const reasons = new Map<number, string>(record.gaps.flatMap((gap: unknown) =>
      isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number' && typeof gap.reason === 'string'
        ? [[gap.unitOrdinal, gap.reason] as const] : []));
    if (reasons.size === 0) return new Map();
    const manifest = this.#predecessorFacts(row).manifest;
    const keys = unitContentKeys(manifest);
    return new Map(manifest.units.flatMap((unit, index) => reasons.has(unit.ordinal) ? [[keys[index]!, reasons.get(unit.ordinal)!] as const] : []));
  }

  /**
   * The units a Task's frozen reuse plan recomputes whose content is the content of an `outcome-unknown` gap of its
   * history (Issue #51, S16c; CONT-011), whatever the reason each is recomputed — matched by the same content key
   * the reuse plan matches by, so a block inserted before the range moves nothing and no other gap is ever named. Empty once
   * its Run has begun, as `resendUnitsByContentOf` is: the history then holds the Task's own revision, which never counts against it.
   */
  resendUnitsOf(projection: BaselineAnalysisProjection): number[] {
    const plan = projection.update?.reusePlan ?? null;
    if (plan === null) return [];
    return this.resendUnitsByContentOf(projection);
  }

  /**
   * 结果待确认 that a Book's Runs of one kind left and no later Run of that kind has read since (Issue #757; CTRL-007, CONT-011,
   * ATTN-002): the ranges whose sent requests' results cannot be known, and the steps of the latest Run that reached its Task
   * Outcome — the reduction, a sample, the reflection — whose results cannot be known either.
   *
   * The ranges are walked through the kind's revisions in order, by the content key the reuse plans match by: a range read to a
   * result by a later revision is no longer unconfirmed, a range a later Run ended without reading stays so — carried forward,
   * under the Run that first sent it — and one whose own content an edit changed is a different request, no longer this one.
   * The steps are the latest completed Run's alone, since every later Run that completes makes its own. A read: nothing is
   * written. `kind` reads another kind's revisions through this ledger, whose readings here are kind-generic.
   */
  unconfirmedOutcomesOf(bookId: string, kind: string = this.#definition.kind): { ranges: UnconfirmedOutcomeRecord[]; steps: UnconfirmedOutcomeRecord[] } {
    // A kind none of whose revisions ever held such a gap has no range to walk for: the drawer reads this on every poll.
    const held = this.#db.prepare(
      `SELECT 1 FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? AND instr(r.canonical_json, '"outcome-unknown"') > 0 LIMIT 1`,
    ).get(bookId, kind) !== undefined;
    const rows = !held ? [] : this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal`,
    ).all(bookId, kind) as SqlRow[];
    const outcomeOf = this.#db.prepare('SELECT classification, recorded_at FROM analysis_task_outcomes WHERE run_record_id = ?');
    const checkpointOf = this.#db.prepare('SELECT revision_id FROM analysis_task_input_checkpoints WHERE task_intent_id = ?');
    const outstanding = new Map<string, UnconfirmedOutcomeRecord>();
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json));
      const unknown = isRecord(record) && Array.isArray(record.gaps)
        ? record.gaps.flatMap((gap: unknown) => isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number'
          ? [{ unitOrdinal: gap.unitOrdinal, carried: typeof gap.reason === 'string' && saysCarried(gap.reason) }] : [])
        : [];
      let facts: ReusePlanPredecessor;
      try {
        facts = this.#predecessorFacts(row);
      } catch {
        // A revision whose plan no longer reads back names no range by content; the walk goes on past it.
        continue;
      }
      const keys = unitContentKeys(facts.manifest);
      const keyOf = new Map(facts.manifest.units.map((unit, index) => [unit.ordinal, keys[index]!] as const));
      for (const unit of facts.unitStates) {
        const key = unit.state === 'closed' ? keyOf.get(unit.unitOrdinal) : undefined;
        if (key !== undefined) outstanding.delete(key);
      }
      const runRecordId = asString(row.run_record_id);
      const outcome = outcomeOf.get(runRecordId) as SqlRow | undefined;
      const heldAt = unknown.length === 0 ? undefined : checkpointOf.get(asString(row.task_intent_id)) as SqlRow | undefined;
      const heldAtRevisionId = heldAt === undefined ? null : asString(heldAt.revision_id);
      for (const gap of unknown) {
        const contentKey = keyOf.get(gap.unitOrdinal);
        if (contentKey === undefined) continue;
        const earlier = outstanding.get(contentKey);
        // Carried forward: the same request, still unconfirmed, now at this revision's ordinal.
        if (gap.carried && earlier !== undefined) {
          outstanding.set(contentKey, { ...earlier, unitOrdinal: gap.unitOrdinal, heldAtRevisionId });
          continue;
        }
        outstanding.set(contentKey, {
          key: unconfirmedOutcomeKey(kind, runRecordId, { contentKey }),
          kind,
          runRecordId,
          taskIntentId: asString(row.task_intent_id),
          classification: outcome === undefined ? null : asString(outcome.classification),
          recordedAt: outcome === undefined ? asString(row.created_at) : asString(outcome.recorded_at),
          unitOrdinal: gap.unitOrdinal,
          heldAtRevisionId,
          contentKey,
          stage: null,
        });
      }
    }
    const latest = this.#db.prepare(
      `SELECT o.* FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       WHERE t.book_id = ? AND t.kind = ? AND o.classification IN ('completed', 'completed-with-gaps')
       ORDER BY o.recorded_at DESC, o.rowid DESC LIMIT 1`,
    ).get(bookId, kind) as SqlRow | undefined;
    const steps: UnconfirmedOutcomeRecord[] = [];
    if (latest !== undefined) {
      const record = parseCanonicalJson(asString(latest.canonical_json));
      const report = isRecord(record) && isRecord(record.report) ? record.report : null;
      const failures = report !== null && Array.isArray(report.failures) ? report.failures.filter(isRecord) : [];
      const said = (stage: string): boolean => failures.some((failure) => failure.stage === stage && typeof failure.reason === 'string' && saysOutcomeUnknown(failure.reason));
      const reflection = report !== null && isRecord(report.ifRedone) && report.ifRedone.state === 'gap' &&
        typeof report.ifRedone.reason === 'string' && saysOutcomeUnknown(report.ifRedone.reason);
      const runRecordId = asString(latest.run_record_id);
      const stages: UnconfirmedStage[] = [
        ...(said('cross-unit-reduction') ? ['cross-unit-reduction' as const] : []),
        ...(said('assurance-sampling') ? ['assurance-sampling' as const] : []),
        ...(reflection ? ['run-report-reflection' as const] : []),
      ];
      for (const stage of stages) {
        steps.push({
          key: unconfirmedOutcomeKey(kind, runRecordId, { stage }),
          kind,
          runRecordId,
          taskIntentId: asString(latest.task_intent_id),
          classification: asString(latest.classification),
          recordedAt: asString(latest.recorded_at),
          unitOrdinal: null,
          heldAtRevisionId: null,
          contentKey: null,
          stage,
        });
      }
    }
    const ranges = [...outstanding.values()].sort((left, right) => (left.unitOrdinal ?? 0) - (right.unitOrdinal ?? 0));
    return { ranges, steps };
  }

  /**
   * The units a Task of a kind that keeps no progress sends again whose content is that of a range an earlier Run of the kind
   * left 结果待确认 and no Run has read since (Issue #757; CONT-011) — matched by content key, whatever the reason the Task
   * reads it, and whether or not the editor kept it as a gap: its earlier request may already have been processed and billed.
   * The units it sends are its reuse or scope plan's recomputed ones, or, with no such plan, every unit of its coverage
   * manifest. Empty once its Run has begun — so its own Run never counts against it: the disclosure is its Plan Preview's.
   */
  resendUnitsByContentOf(projection: AnalysisProjection, kind: string = this.#definition.kind): number[] {
    const intent = projection.taskIntent;
    const manifest = projection.coverageManifest;
    // Until its Run begins — authorized, waiting to start once online (Issue #760), or blocked before dispatch — the Task has read
    // nothing, so nothing of its own counts and its plan keeps saying what starting it will send.
    const begun = projection.run !== null && !['authorized', 'awaiting-connectivity', 'blocked-before-dispatch'].includes(projection.run.state);
    if (intent === null || manifest === null || begun) return [];
    const update = projection.update as { reusePlan?: ResendPlan | null } | null;
    return this.resendUnitsByContent(projection.bookId, kind, manifest, update?.reusePlan ?? null);
  }

  /**
   * `resendUnitsByContentOf` over a Task's frozen parts (Issue #757): a Review Run's category reads its coverage manifest and its
   * scope plan from the components it froze.
   */
  resendUnitsByContent(bookId: string, kind: string, manifest: CoverageManifestProjection, plan: ResendPlan | null): number[] {
    const unconfirmed = new Set(this.unconfirmedOutcomesOf(bookId, kind).ranges.map((range) => range.contentKey));
    if (unconfirmed.size === 0) return [];
    const keys = unitContentKeys(manifest);
    const sent = plan !== null
      ? plan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => ({ ordinal: unit.unitOrdinal, key: unit.contentKey }))
      : manifest.units.map((unit, index) => ({ ordinal: unit.ordinal, key: keys[index]! }));
    return sent.filter((unit) => unconfirmed.has(unit.key)).map((unit) => unit.ordinal).sort((left, right) => left - right);
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
      contractVersion: asString(row.contract_version),
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
    const unreviewedUnitOrdinals = this.#unreviewedOrdinals(facts.revisionId);
    return {
      ...facts,
      schemaDigest: asString(this.#revisionBody(row).schemaDigest),
      ...(typeof this.#revisionBody(row).categoryConfigurationIdentity === 'string' ? { categoryConfigurationIdentity: asString(this.#revisionBody(row).categoryConfigurationIdentity) } : {}),
      unreviewedUnitOrdinals,
      changedUnreadUnitOrdinals: [...this.#unreadWalk(row).changed.keys()].sort((left, right) => left - right),
    };
  }

  /**
   * The units the latest revision left unread although they changed since the category last read them (Issue #709), the
   * blocks that make them changed, and where the walk stopped short, if it did: the one fact 只审改动过的章's plan and gate
   * and the coverage matrix all read. Nothing for a kind that never leaves a unit unreviewed, or a Book with no revision.
   */
  unreadChanges(bookId: string): { readonly units: number; readonly blockIds: ReadonlySet<string>; readonly cut: UnreadWalkCut } {
    const none = { units: 0, blockIds: new Set<string>(), cut: null };
    if (this.#definition.outOfScope !== 'leave-unreviewed') return none;
    const row = this.#revisionRows(bookId).at(-1);
    if (row === undefined) return none;
    const walk = this.#unreadWalk(row);
    return { units: walk.changed.size, blockIds: walk.blockIds, cut: walk.cut };
  }

  /**
   * Whether a Task's frozen scope plan still derives, byte for byte, from the chain as it stands (#711 review P3-4). Only a
   * kind that leaves units unreviewed is asked: its plan reads the walk, whose rule a release may change under a prepared
   * Task; the baseline's reuse plan never moves. A plan that no longer derives would be refused at dispatch, so it is
   * refused before it is authorized instead, with 请重新准备.
   */
  #frozenPlanDerives(update: AnalysisProjection['update'], manifest: CoverageManifestProjection): boolean {
    if (this.#definition.outOfScope !== 'leave-unreviewed' || update === null || update.reusePlan === null || update.predecessor === null ||
        !update.predecessorCurrent) return true;
    try {
      const predecessor = this.#planPredecessor(this.#revisionRowById(update.predecessor.revisionId));
      return reusePlanRecord(this.#derivePlan(update.mode, update.reusePlan.selectedRange, manifest, predecessor)).digest === update.reusePlanDigest;
    } catch (error) {
      if (error instanceof AnalysisError) return false;
      throw error;
    }
  }

  /** How many walks this ledger has computed: each latest revision is walked once, however often it is read. */
  get unreadWalksComputed(): number {
    return this.#unreadWalksComputed;
  }

  /** How many revisions this ledger's walks have read from SQLite: one per revision while the chain stays cached (Issue #727). */
  get chainRevisionsRead(): number {
    return this.#chainRevisionsRead;
  }

  /** The walk of one latest revision, computed once (see {@link walkUnreadChanges}). */
  #unreadWalk(row: SqlRow): UnreadWalk {
    const revisionId = asString(row.revision_id);
    const kept = this.#unreadWalks.get(revisionId);
    if (kept !== undefined) return kept;
    const latest = this.#chainRevision(row);
    requireAnalysis(latest !== 'unreadable', 'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    // The revision each one this walk read followed, noted as it is read. `#chainRevision` hands back the read it has just
    // kept, and the cache never lets go of the entry it just wrote, so the walk could not miss a predecessor it has read
    // (Issue #727); the map only spares a second cache lookup per step.
    const followed = new Map<string, string | null>([[latest.revision.revisionId, latest.predecessorRevisionId]]);
    const walk = walkUnreadChanges(latest.revision, (revision) => {
      const predecessorRevisionId = followed.get(revision.revisionId);
      if (predecessorRevisionId === undefined) return 'unreadable';
      if (predecessorRevisionId === null) return null;
      let prior: SqlRow;
      try {
        prior = this.#revisionRowById(predecessorRevisionId);
      } catch (error) {
        if (error instanceof AnalysisError) return 'unreadable';
        throw error;
      }
      const read = this.#chainRevision(prior);
      if (read === 'unreadable') return 'unreadable';
      followed.set(read.revision.revisionId, read.predecessorRevisionId);
      return read.revision;
    });
    this.#unreadWalksComputed += 1;
    this.#unreadWalks.set(revisionId, walk);
    return walk;
  }

  /** One revision as the walk reads it, and the revision it followed; `'unreadable'` when its records cannot be read. */
  #chainRevision(row: SqlRow): ChainRevisionRead {
    const revisionId = asString(row.revision_id);
    const kept = this.#chainRevisions.get(revisionId);
    if (kept !== undefined) return kept;
    this.#chainRevisionsRead += 1;
    let read: ChainRevisionRead;
    try {
      const facts = this.#predecessorFacts(row);
      const outOfScope = new Set(this.#unreviewedOrdinals(revisionId));
      const intent = this.#db.prepare('SELECT predecessor_revision_id FROM analysis_task_intents WHERE task_intent_id = ?')
        .get(asString(row.task_intent_id)) as SqlRow | undefined;
      requireAnalysis(intent !== undefined, 'ANALYSIS_RECORD_INVALID', '结果集修订版的任务意图缺失。');
      read = {
        revision: {
          revisionId,
          ordinal: facts.ordinal,
          contract: `${facts.contractVersion}\n${asString(this.#revisionBody(row).schemaDigest)}`,
          manifest: facts.manifest,
          units: new Map(facts.unitStates.map((unit) => [unit.unitOrdinal,
            unit.state === 'closed' ? 'closed' : outOfScope.has(unit.unitOrdinal) ? 'out-of-scope' : 'failed'] as const)),
        },
        predecessorRevisionId: intent.predecessor_revision_id === null ? null : asString(intent.predecessor_revision_id),
      };
    } catch (error) {
      if (!(error instanceof AnalysisError)) throw error;
      read = 'unreadable';
    }
    this.#chainRevisions.set(revisionId, read);
    return read;
  }

  /** A revision's `out-of-scope` gaps: the units its Run was never asked to read. */
  #unreviewedOrdinals(revisionId: string): number[] {
    const gapRows = this.#db.prepare("SELECT unit_ordinal, canonical_json FROM analysis_unit_results WHERE revision_id = ? AND state = 'gap' ORDER BY unit_ordinal")
      .all(revisionId) as SqlRow[];
    return gapRows.filter((unit) => {
      const record = parseCanonicalJson(asString(unit.canonical_json));
      return isRecord(record) && isRecord(record.gap) && record.gap.code === 'out-of-scope';
    }).map((unit) => asNumber(unit.unit_ordinal));
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

  /** Read one immutable Task's complete manifest, including historical Tasks. */
  coverageManifestFor(bookId: string, taskIntentId: string): CoverageManifestProjection {
    const row = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ? AND book_id = ? AND kind = ?')
      .get(taskIntentId, bookId, this.#definition.kind) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_TASK_NOT_FOUND', '没有找到这项分析任务。');
    const version = this.#planVersionFacts(taskIntentId).at(-1);
    requireAnalysis(version !== undefined, 'ANALYSIS_PLAN_MISSING', '分析计划尚未准备。');
    return this.#planRecords(taskIntentId, 'any', version.ordinal)['coverage-manifest'] as CoverageManifestProjection;
  }

  /** Derive only the range the editor actually selected; no plan is written. */
  rangePlan(bookId: string, unitOrdinal: number): { selectedRange: BaselineAnalysisSelectedRange; expected: AnalysisReusePlanCounts } {
    const latest = this.inspect(bookId).resultSetRevision as BaselineAnalysisResultSetRevisionProjection | null;
    requireAnalysis(latest !== null, 'ANALYSIS_REVISION_NOT_FOUND', '还没有可更新的分析结果。');
    const head = this.#workingHead(latest.manuscriptPin.manuscriptId, bookId);
    const preview = deriveCoverageManifest({ bookId, manuscriptId: latest.manuscriptPin.manuscriptId,
      branchId: head.branchId, revisionId: head.currentRevisionId, revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest, blocks: this.readWorkingBlocks(head.branchId) });
    const unit = preview.units.find((entry) => entry.ordinal === unitOrdinal);
    requireAnalysis(unit !== undefined, 'ANALYSIS_RANGE_INVALID', '所选阅读范围已改变，请重新选择。');
    const selectedRange = { startPosition: unit.startPosition, endPosition: unit.endPosition };
    const predecessor = this.#planPredecessor(this.#revisionRowById(latest.revisionId));
    return { selectedRange, expected: this.#derivePlan('reanalyze-range', selectedRange, preview, predecessor).counts };
  }

  /**
   * The Analysis Update Controls: the preview manifest is derived over the current working blocks of
   * the primary branch (exactly what the next Task Input checkpoint would pin), and every expected
   * count is a real reuse-plan derivation against the latest revision, never an estimate. The
   * baseline kind's range options carry none: `rangePlan` derives the one the editor picks (#988).
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
    const blockedReason = blockedByActiveRun ? activeRunReason(activeRun, this.#definition.kind) : null;
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
      expected: this.#definition.kind === BASELINE_ANALYSIS_KIND ? null : expected(mode, { startPosition: unit.startPosition, endPosition: unit.endPosition }),
    }));
    const actions = Object.fromEntries(this.#definition.updateModes.map((mode) => {
      const definition = this.#definition.mode(mode);
      if (definition.recompute === 'changed') {
        // Something changed since the latest revision, or since the category last read a unit a range Run then left
        // unread (Issue #709): the latest revision being current says nothing about an edit made before it outside its range.
        const changed = freshness === 'stale' || ('changedUnreadUnitOrdinals' in predecessor && (predecessor.changedUnreadUnitOrdinals?.length ?? 0) > 0);
        return [mode, action(mode, changed, changed ? null : changedModeUnavailableReason(definition.label), changed ? expected(mode, null) : null)];
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
      providerConsequence: providerConsequence(this.#liveReading(), preview.units.length, this.#definition.mode(this.#definition.initialMode).label),
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
    if (input.phase === 'advance') {
      try { return this.#advance(input.workId); } catch (error) {
        const work = this.#work.get(input.workId);
        if (work?.intentDraft !== undefined) {
          this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
          this.#work.delete(input.workId);
        }
        throw error;
      }
    }
    // Ordinary production without a configured route refuses before anything is prepared, naming both routes (Issue #811).
    requireAnalysis(this.#liveReading() !== MODEL_SERVICE_SETUP_REQUIRED, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    if (this.#launch.live !== null) {
      const scope = this.#launch.operationalScope;
      requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || plannedRunAdmission(input.launchPolicy, this.#definition, this.#launch.live) !== null,
        'ANALYSIS_KIND_NOT_ADMITTED', `${scope} 当前只允许基线稿件分析；该任务种类尚未获准实时执行。`);
      // A 后台分析登记's preparation only under the selected policy's enrolled-background rule (Issue #864; Provider Processing v14/v15).
      requireAnalysis(input.background == null ||
          (this.#definition.kind === BASELINE_ANALYSIS_KIND && liveKindRule(input.launchPolicy, BASELINE_ANALYSIS_KIND, [], 'background') !== null),
        'ANALYSIS_ORIGIN_NOT_ADMITTED', `${scope} 当前只允许直接发起的分析任务。`);
    }
    const update = this.#resolveSelectedBlocks(input.bookId, input.update);
    const mode: AnalysisTaskMode = update === null ? this.#definition.initialMode : update.mode;
    // A named mode is one of the kind's update modes, or the range-bound first mode of a kind that
    // declares one (Issue #417). The whole first mode is never named: it is what `null` asks for.
    const modeDefinition = this.#definition.modes.find((entry) => entry.mode === mode);
    const firstRange = update !== null && modeDefinition !== undefined && modeDefinition.initial && modeDefinition.rangeBound;
    requireAnalysis(update === null || firstRange || this.#definition.updateModes.includes(mode), 'ANALYSIS_UPDATE_MODE_UNAVAILABLE', '本分析种类没有该更新方式。');
    // A Task promoted from a draft keeps the draft's sentence as its goal (Issue #423, slice 7a); 重新确认计划 of such a Task names
    // that sentence again, which is checked against the Task once it is read. Every other preparation names the mode's fixed goal.
    const fixedGoal = input.goal === this.#definition.mode(mode).goal;
    const intentDraft = input.intentDraft ?? null;
    requireAnalysis(fixedGoal || (intentDraft !== null && isDraftGoal(input.goal)) || (input.reconfirm && isDraftGoal(input.goal)),
      'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    requireAnalysis(intentDraft === null || (UUID_PATTERN.test(intentDraft.versionId) && input.background == null && input.redoOf == null && !input.reconfirm),
      'ANALYSIS_GOAL_INVALID', '任务意图草稿的准备参数无效。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const background = input.background ?? null;
    if (background === null) {
      // Any preparation the editor starts on the Book stops the 后台分析登记 dispatcher's first (Issue #95, S39; #713 review, P1-2):
      // AI7 never holds the Book's checkpoint against the editor, and its Task Intent is never one the editor's reuses.
      for (const work of Array.from(this.#work.values())) {
        if (work.background && work.bookId === input.bookId) this.prepare({ phase: 'cancel', workId: work.workId });
      }
    } else {
      requireAnalysis(UUID_PATTERN.test(background.enrollmentVersionId) && isBackgroundRunBudgetCeiling(background.runBudgetCeiling) &&
        input.redoOf == null && !input.reconfirm,
        'ANALYSIS_BACKGROUND_INVALID', '后台分析的准备参数无效。');
      requireAnalysis(!this.preparationInFlight(input.bookId), 'ANALYSIS_PREPARATION_IN_FLIGHT', '这本书正在准备一项任务；后台分析不接手。');
    }
    const existing = this.inspect(input.bookId);
    requireAnalysis(!runIsActive(existing.run?.state ?? null), 'ANALYSIS_TASK_ACTIVE', activeRunReason(existing.run?.state ?? null, this.#definition.kind));
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
      requireAnalysis(run !== null && run.runRecordId === redoOf &&
        ((run.state === 'cancelled' && run.transitions.some((transition) => transition.state === 'executing')) || budgetReached),
      'ANALYSIS_REDO_STALE', '只有这本书最近一项任务里开始后取消、或因预算上限停止的运行可以改计划重做。');
      const expected = latest !== null && latest.provenance.runRecordId === redoOf
        ? { mode: 'sync-current', selectedRange: null }
        : existing.update === null ? null : { mode: existing.update.mode, selectedRange: existing.update.selectedRange };
      requireAnalysis(!input.reconfirm && (this.#definition.kind !== BASELINE_ANALYSIS_KIND || (expected === null
        ? update === null
        : update !== null && update.mode === expected.mode && update.selectedRange?.startPosition === expected.selectedRange?.startPosition &&
          update.selectedRange?.endPosition === expected.selectedRange?.endPosition)),
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
    // 重新确认计划 and 重新准备 of a range Task name its range by position, as the plan froze it (Issue #423 review, P3-4). Its
    // paragraphs are the ones those positions held at the Task Input revision; once the working manuscript holds other blocks
    // there, the same positions would read the neighbours, so the Task is chosen again instead.
    if ((input.reconfirm || asked) && update !== null && update.selectedRange !== null && existing.checkpoint !== null) {
      requireAnalysis(this.#rangeStillHolds(input.bookId, existing.checkpoint, update.selectedRange), 'ANALYSIS_SELECTED_RANGE_MOVED', SELECTED_RANGE_MOVED);
    }
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
    requireAnalysis(fixedGoal || intentDraft !== null || (latestIntent !== null && latestIntent.intentDraftVersionId !== null && latestIntent.goal === input.goal),
      'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    // The dispatcher never steps in beside the editor's own plan, prepared and not started (#713 review, P1-2).
    requireAnalysis(background === null || latestIntent === null || latestIntent.preparedByEnrollmentVersionId !== null ||
      existing.planEnvelope === null || existing.authorization !== null,
    'ANALYSIS_TASK_PREPARED', '这本书有一份你准备好但还没开始的计划；后台分析不接手。');
    // The same Task: the latest intent, no Run yet, the same update mode and the same predecessor. A
    // prepared one is revised in place (Issue #48); an interrupted preparation is resumed only for the
    // same request; anything else is a new Task Intent.
    // A prepared Task is the same Task only while the text its Task Input checkpoint pinned is still the working text.
    // After an edit the next preparation takes a new checkpoint as a new Task, so a quick start — whose plan the editor
    // never saw — never reads text older than the editor's (TASK-024). 开始任务 in the drawer still starts the plan the
    // editor is reading, at the Task Input revision that plan names; 重新确认计划 revises the plan in place, whatever moved.
    const checkpointCurrent = existing.checkpoint === null || this.#checkpointIsCurrent(existing.checkpoint, input.bookId);
    // Nor is a Task whose plan froze another prompt contract of this kind — a review category whose guideline clauses were
    // imported anew since (Issue #427 review): its plan could never execute under this contract, so the preparation is a
    // new Task Intent under the contract that applies now.
    // So is one whose plan froze another assurance sampling contract (Issue #826): the composition does not pin it.
    const contractCurrent = existing.planEnvelope === null || (existing.planEnvelope.promptContractDigest === this.#selectedDefinition(this.#planDefinition(existing.planVersion?.edits ?? NO_PLAN_EDITS, existing.taskIntent?.mode), input.bookId).promptContractDigest &&
      (existing.executionPlan === null ||
        !assuranceContractMoved(this.#definition, frozenAssurancePromptContractDigest(existing.executionPlan as unknown as Record<string, unknown>))));
    // Nor is a Task whose frozen scope plan the chain no longer derives (#711 review P3-4): 重新准备 makes it anew.
    const planDerives = existing.coverageManifest === null || existing.authorization !== null || this.#frozenPlanDerives(existing.update, existing.coverageManifest);
    // A Task the 后台分析登记 dispatcher prepared is never the editor's to revise or resume, and the dispatcher never takes up any
    // Task Intent but the one it creates now (#713 review, P1-2): each side's preparation is a Task of its own.
    const selectedProcedure = background === null ? selectedProcedureForBook(this.#db, input.bookId, this.#definition.kind) : null;
    const sameProcedure = canonicalJson(latestIntent?.record.procedure ?? null) === canonicalJson(selectedProcedure);
    const sameTask = sameProcedure && background === null && input.newTask !== true && intentDraft === null && latestIntent !== null && latestIntent.preparedByEnrollmentVersionId === null &&
      existing.run === null && latestIntent.mode === mode &&
      latestIntent.predecessorRevisionId === (latest?.revisionId ?? null) && (input.reconfirm || checkpointCurrent) && contractCurrent && planDerives;
    if (sameTask && existing.checkpoint !== null) {
      return { done: true, workId: null, completed: 1, total: 1, projection: this.#revisePreparedPlan(input.bookId, latestIntent, existing, selectedRange, input.reconfirm) };
    }
    requireAnalysis(!input.reconfirm, 'ANALYSIS_PLAN_REVISION_ABSENT', '当前没有已冻结且待重新确认的计划。');
    const reusable = sameTask && sameRange(latestIntent.selectedRange, selectedRange);
    const taskIntentId = reusable ? latestIntent.taskIntentId : randomUUID();
    const initial = this.#isInitial(mode);
    // Background preparations and draft promotions write their intent only when the plan freezes. A stopped preparation leaves
    // no orphan intent, and a failed draft promotion leaves its draft editable. Ordinary preparation retains its existing path.
    const pendingIntent: PendingIntent | null = reusable ? null : {
      ...(selectedProcedure === null ? {} : { procedure: selectedProcedure }),
      ...(input.factualDecision === undefined ? {} : { factualDecision: input.factualDecision }),
      taskIntentId, bookId: input.bookId, goal: input.goal, mode, redoOf,
      preparedByEnrollmentVersionId: background?.enrollmentVersionId ?? null,
      backgroundRunBudgetCeiling: background === null ? null : { kind: 'tokens', maxTotalTokens: background.runBudgetCeiling.maxTotalTokens },
      predecessor: initial ? null : { revisionId: latest!.revisionId, digest: latest!.digest },
      selectedRange,
      intentDraftVersionId: intentDraft?.versionId ?? null,
      intentDraftParagraphs: intentDraft?.paragraphs ?? null,
    };
    // A draft remains editable if saving its Task Input or plan fails. Its intent and promotion commit only with the plan.
    const deferIntent = background !== null || intentDraft !== null;
    if (pendingIntent !== null && !deferIntent) this.#insertIntent(pendingIntent);
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(binding.manuscriptId, binding.branchId, TASK_INPUT_CHECKPOINT_PURPOSE,
      { preemptible: background !== null });
    if (checkpoint.workId === null) {
      requireAnalysis(checkpoint.checkpoint !== null, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => {
        if (pendingIntent !== null && deferIntent) this.#insertIntent(pendingIntent);
        this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, TASK_INPUT_CHECKPOINT_PURPOSE, input.launchPolicy);
        intentDraft?.promoted(taskIntentId);
      });
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, {
      workId, taskIntentId, bookId: input.bookId, checkpointWorkId: checkpoint.workId, launchPolicy: structuredClone(input.launchPolicy),
      total: checkpoint.total, background: background !== null, pendingIntent: deferIntent ? pendingIntent : null,
      ...(intentDraft === null ? {} : { intentDraft }),
    });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  /** One Task Intent row, its record made at the moment it is written. */
  #insertIntent(intent: PendingIntent): void {
    const createdAt = new Date().toISOString();
    const base = {
      ...(intent.procedure === undefined ? {} : { procedure: intent.procedure }),
      ...(intent.factualDecision === undefined ? {} : { factualDecision: intent.factualDecision }),
      bookId: intent.bookId,
      contractVersion: this.#definition.contractVersion,
      createdAt,
      expectedOutcome: this.#definition.expectedOutcome,
      goal: intent.goal,
      kind: this.#definition.kind,
      taskIntentId: intent.taskIntentId,
      ...(intent.redoOf === null ? {} : { redoOfRunRecordId: intent.redoOf }),
      ...(intent.preparedByEnrollmentVersionId === null ? {} : { preparedByEnrollmentVersionId: intent.preparedByEnrollmentVersionId }),
      ...(intent.backgroundRunBudgetCeiling === null ? {} : { backgroundRunBudgetCeiling: { ...intent.backgroundRunBudgetCeiling } }),
      ...(intent.intentDraftVersionId === null ? {} : { intentDraftVersionId: intent.intentDraftVersionId }),
      ...(intent.intentDraftParagraphs === null ? {} : { intentDraftParagraphs: intent.intentDraftParagraphs }),
    };
    // A whole first Task's record is the base alone, as it has been since revision 15. Every Task that
    // carries a plan also states its mode, its predecessor and its range — and a range-bound first
    // Task states that it has no predecessor rather than leaving the fact to the reader.
    const record = canonicalRecord(!this.#carriesPlan(intent.mode) ? base : {
      ...base,
      mode: intent.mode,
      predecessorRevisionId: intent.predecessor?.revisionId ?? null,
      predecessorRevisionDigest: intent.predecessor?.digest ?? null,
      selectedRange: intent.selectedRange,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_intents(
         task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256,
         mode, predecessor_revision_id, selected_start_position, selected_end_position
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(intent.taskIntentId, intent.bookId, this.#definition.kind, this.#definition.contractVersion, intent.goal, createdAt, record.json, record.digest,
      intent.mode, intent.predecessor?.revisionId ?? null, intent.selectedRange?.startPosition ?? null, intent.selectedRange?.endPosition ?? null);
  }

  #advance(workId: string): BaselineAnalysisPreparationResult {
    requireAnalysis(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireAnalysis(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => {
        // The dispatcher's Task Intent is written here, in the transaction that freezes its plan, and nowhere earlier.
        if (work.pendingIntent !== null) this.#insertIntent(work.pendingIntent);
        this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy);
        work.intentDraft?.promoted(work.taskIntentId);
      },
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
    this.#writePlanVersion({ intent, checkpoint, checkpointDigest: checkpointRecord.digest, ordinal: 1, selectedRange: intent.selectedRange,
      planRevisionId: null, instant, edits: this.#redoPlanEdits(intent), policy: launchPolicy });
  }

  /**
   * Freeze one plan version of a Task: the seven components (eight for an update Task) derived from
   * the checkpoint revision, the current Provider Binding, the artifact pin, and the version's own
   * selected range, plus the envelope that pins their digests, the prompt contract, the behavior
   * composition, the version ordinal, and the Plan Boundary Split; then the version row itself.
   * Version 1 is written with the checkpoint; a later version resolves a Plan Revision.
   */
  #writePlanVersion(input: {
    policy?: LaunchPolicyProjection;
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
    if (this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE) requireAnalysis(intent.mode === 'review-first' &&
      intent.selectedRange === null && intent.preparedByEnrollmentVersionId === null,
    'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于标准前台全文首次审阅。');
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
    const live = this.#launch.live;
    const production = live !== null && live.scope === 'ordinary-production' ? live : null;
    // The editor's ceiling is the plan's own outside developer-live (Issue #51, S16a); under it the launch sets the
    // ceiling, so a redo that copies a ceiling the editor once set keeps the rest of the edit and not the ceiling.
    const edits = !launchSetsCeilingOf(live) ? input.edits : withoutCeiling(input.edits);
    // The factual Task's level decides its contract and its research declaration (Issue #901); every other kind's is its own.
    const baseDefinition = this.#planDefinition(edits, intent.mode);
    const selected = intent.record.procedure as ProcedureDefinitionPin | undefined;
    const document = selected === undefined ? null : resolveProcedureForKind(this.#db, selected, baseDefinition.kind).document;
    if (selected !== undefined && document !== null) {
      const currentId = baseDefinition.factualClaims === undefined ? procedureIdForKind(baseDefinition.kind) : FACTUAL_CLAIM_PROCEDURE_ID;
      if (currentId !== null) validateProcedureEdit(resolveProcedureDefinition(this.#db, currentId, currentPreinstalledVersion(currentId)).document,
        { procedureId: null, basedOn: selected, title: document.title, editorInstruction: document.editorInstruction, stages: document.stages });
    }
    const definition = selected === undefined || document === null ? baseDefinition : withProcedureDefinition(baseDefinition, document, selected);
    if (selected !== undefined) requireAnalysis(!procedureStopped(this.#db, selected), 'PROCEDURE_STOPPED', '所选工序版本已停用，请选择另一个版本。');
    if (selected !== undefined && document !== null && procedureInstruction(document, selected) !== '' && live !== null) {
      requireAnalysis(liveKindRule(this.#launch.policy, definition.kind, ['editor-task-instruction'])?.editorTaskInstruction !== undefined,
        'PROCEDURE_INSTRUCTION_NOT_ADMITTED', '当前模型处理策略尚未允许编辑任务说明。');
    }
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
        definition,
      );
    }
    const manuscriptPin = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      // Exact sample1 outside ordinary production, which #binding enforced; the editor's own Book's source under it (Issue #811).
      sourceDigest: facts.sourceDigest,
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
      ...(this.#definition.seriesScopes === undefined ? {} : { readableScopeKinds: ['current-book-primary-manuscript-revision', 'series'],
        seriesScopes: this.#definition.seriesScopes.map((scope) => ({ ...scope, members: scope.members.map((member) => member.bookId !== checkpoint.bookId ? member : {
          ...member, manuscriptId: checkpoint.manuscriptId, revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest, sourceVersionId: facts.sourceVersionId,
        }) })) }),
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
      ...(intent.intentDraftParagraphs === null ? {} : {
        draftRangeExpansion: {
          paragraphs: intent.intentDraftParagraphs,
          statement: `所选文字已扩展为所在的 ${intent.intentDraftParagraphs} 个完整段落；任务按包含这些段落的阅读范围处理。`,
        },
      }),
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
    // deterministic route, or the selected developer-live binding. Both are frozen before authorization, never chosen
    // at dispatch, so an authorized Run can never transmit somewhere its plan did not name.
    const promptContractDigest = definition.promptContractDigest;
    const admittedToolRule = this.#definition.kind === BASELINE_ANALYSIS_KIND || intent.preparedByEnrollmentVersionId !== null ? null
      : liveKindRule(this.#launch.policy, this.#definition.kind);
    const toolsProjection: unknown = admittedToolRule !== null && 'platformTools' in admittedToolRule ? admittedToolRule.platformTools : null;
    // A Task a 后台分析登记 prepared declares no research, as before the declaration existed (#744 keeps #887's guard).
    const researchDeclaration = admittedToolRule === null ? { webSearch: false, searchEngine: null } as const
      : kindResearchDeclaration(this.#launch.policy, definition.kind, definition.researchDeclaration);
    const toolsDeclared = live !== null && researchDeclaration.webSearch;
    let webToolsBackend: FrozenWebToolsBackend | undefined;
    let searchCredentialReference: string | undefined; let webToolsFallback: FrozenWebToolsFallback | undefined;
    if (toolsDeclared) {
      const row = this.#db.prepare('SELECT * FROM search_backend_connections WHERE selected = 1').get() as SqlRow | undefined;
      requireAnalysis(row !== undefined, 'SEARCH_BACKEND_NOT_SHIPPED', '请在 设置 › 模型服务 › 联网检索 选择后端。');
      const adapter = searchBackend(asString(row.backend_id));
      if (production !== null) requireAnalysis(row.credential_operation_state === 'ready' && typeof row.credential_reference === 'string',
        'SEARCH_CREDENTIAL_MISSING', `${adapter.declaration.displayName} 需要密钥；请在 设置 › 模型服务 › 联网检索 保存。`);
      webToolsBackend = { backendId: adapter.declaration.id, host: adapter.declaration.host!, configurationDigest: searchBackendConfigurationDigest(adapter.declaration.id), selectedAt: asString(row.selected_at) };
      searchCredentialReference = production === null ? CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[adapter.declaration.credentialSlot] : asString(row.credential_reference); if (production !== null) webToolsFallback = freezeSearchFallback(this.#db, searchFallbackTermsOf(input.policy ?? this.#launch.policy), adapter.declaration.id);
    }
    const leafMode = intent.mode === 'review-first' && intent.selectedRange === null && intent.preparedByEnrollmentVersionId === null;
    const composition = live === null
      ? describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, promptContractDigest, this.#newCompositionOptions(checkpoint.bookId, leafMode, definition, selected))
      : describeComposition(live.route, live.model, promptContractDigest, { platformTools: webToolsBackend !== undefined && definition.factualClaims === undefined,
        researchDeclaration: definition.factualClaims === undefined ? researchDeclaration : { webSearch: false, searchEngine: null },
        ...this.#newCompositionOptions(checkpoint.bookId, leafMode, definition, selected),
        localTools: intent.preparedByEnrollmentVersionId === null && definition.evidenceAssuranceLevel !== 'quick' && definition.factualClaims === undefined ? kindLocalTools(this.#launch.policy, this.#definition.kind) ?? false : false });
    const providerPlan = {
      ...this.#selectedPlanMetadata(input.policy),
      ...(webToolsBackend === undefined ? {} : { webToolsBackend, searchCredentialReference }), ...(webToolsFallback === undefined ? {} : { webToolsFallback }),
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
            providerProcessing: { operationalScope: 'development-ci', version: this.#selectedPlanMetadata(input.policy).selectedPolicyIdentity?.providerProcessingVersion ?? 'v1',
              decision: 'deny', authorizedLiveTransmissionCount: 0 },
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
            providerProcessing: production !== null
              ? { operationalScope: 'ordinary-production', version: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' }
              : { operationalScope: 'developer-live', version: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
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
      outboundDataCategory: production !== null ? 'unpublished-excerpts' : 'public-or-synthetic',
      runBudgetCeiling: this.#planCeiling(manifest.units.length, planEditCeiling(edits), intent.backgroundRunBudgetCeiling),
    };
    const dispatchAllowed = live !== null || this.#route !== null;
    const stopCondition = production !== null
      ? `Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} binds the configured ${production.route} under ordinary-production; the Coverage Manifest unit count and the plan's own Run Budget Ceiling, when set, bound every transmission`
      : live !== null
      ? `Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} binds opencode-go under developer-live; the Run Budget Ceiling and the Coverage Manifest unit count bound every transmission`
      : dispatchAllowed
        ? 'Provider Processing v1 denies the remote route; execution binds only ai7-local-deterministic'
        : 'Provider Processing v1 denies the remote route and no local deterministic route is bound';
    // An edited plan names what it leaves out; a plan AI7 proposed names nothing, so its record reads as before.
    const editorEdits = planEditsAreEmpty(edits) ? {} : { editorEdits: edits };
    const executionPlan = reusePlan === null
      ? { steps: definition.executionSteps, effects: [], unitCount: manifest.units.length, reducerStages: this.#definition.reducerStages, stopCondition, ...editorEdits }
      : {
          steps: definition.updateExecutionSteps,
          effects: [],
          unitCount: manifest.units.length,
          recomputedUnitCount: reusePlan.counts.recomputed,
          reusedUnitCount: reusePlan.counts.reused,
          ...(unreviewedCount === null ? {} : { unreviewedUnitCount: unreviewedCount }),
          reducerStages: this.#definition.reducerStages,
          stopCondition,
          ...editorEdits,
        };
    // The sampling contract, only when it is not /1 (Issue #826): every other plan's record reads exactly as before.
    const assurance = this.#definition.assurance;
    const samplingPin = assurance !== null && assurance.promptContractDigest !== ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST
      ? { assurancePromptContractDigest: assurance.promptContractDigest }
      : {};
    const clarificationPin = definition.clarificationBase === undefined ? {} : {
      clarificationBasePromptContractDigest: definition.clarificationBase.promptContractDigest,
    };
    const records: Record<string, { json: string; digest: string }> = {
      'manuscript-pin': canonicalRecord(manuscriptPin),
      'artifact-pin': canonicalRecord(artifactPin),
      'run-source-scope': canonicalRecord(composition.sources === undefined ? sourceScope : { ...sourceScope, localToolSources: composition.sources }),
      'coverage-manifest': canonicalRecord(manifest),
      'provider-resolution-plan': canonicalRecord(providerPlan),
      'execution-plan': canonicalRecord(this.#definition.materialReferences === undefined ? { ...executionPlan, ...samplingPin, ...clarificationPin } : {
        ...executionPlan,
        ...samplingPin,
        ...clarificationPin,
        materialReferences: this.#definition.materialReferences.sources,
        materialReferenceBasePromptContractDigest: this.#definition.materialReferences.basePromptContractDigest,
      }),
    };
    if (webToolsBackend !== undefined) records['web-tools-backend'] = canonicalRecord(webToolsBackend);
    if (reusePlan !== null) records['reuse-plan'] = reusePlanRecord(reusePlan);
    const envelopeBase = {
      ...(intent.record.factualDecision === undefined ? {} : { factualDecision: intent.record.factualDecision }),
      providerStatus: production !== null
        ? 'remote-eligible-ordinary-production'
        : live !== null
        ? 'remote-eligible-developer-live'
        : dispatchAllowed ? 'remote-denied-local-deterministic' : 'remote-denied-no-route',
      dispatchAllowed,
      summary: production !== null
        ? `计划已冻结；ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 绑定你配置的 ${production.route} · ${production.model}，每个单元实际调用`
        : live !== null
        ? `计划已冻结；developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 允许绑定 ${live.route} · ${live.model}，实时传输受运行边界约束`
        : dispatchAllowed
          ? '计划已冻结；远程绑定被 Provider Processing v1 拒绝，执行绑定至 AI7 本地确定性模型适配器'
          : '计划已冻结；远程绑定被 Provider Processing v1 拒绝，且没有可执行的本地路由',
      ...(webToolsBackend === undefined ? {} : { webToolsBackendDigest: records['web-tools-backend']!.digest }),
      taskIntentId,
      checkpointDigest: input.checkpointDigest,
      manuscriptPinDigest: records['manuscript-pin']!.digest,
      artifactPinDigest: records['artifact-pin']!.digest,
      runSourceScopeDigest: records['run-source-scope']!.digest,
      coverageManifestDigest: manifest.digest,
      providerResolutionPlanDigest: records['provider-resolution-plan']!.digest,
      executionPlanDigest: records['execution-plan']!.digest,
      promptContractDigest,
      ...(definition.procedureBinding === undefined ? {} : { basePromptContractDigest: baseDefinition.promptContractDigest }),
      ...(definition.contractIdentity === undefined ? {} : { contractIdentity: { ...definition.contractIdentity, digest: promptContractDigest } }),
      behaviorCompositionDigest: composition.digest,
      compositionVersion: composition.version,
      compositionOptions: { version: composition.version, ...(composition.subagents === false ? {} : { subagents: composition.version === 4 ? STOCK_TYPOS_FANOUT : STOCK_TYPOS_LEAF, localTools: STOCK_TYPOS_LEAF_LOCAL_TOOLS }),
        ...(composition.procedure === undefined ? {} : { procedure: composition.procedure }),
        ...(composition.stages === undefined ? {} : { stages: composition.stages }),
        ...(composition.sources === undefined ? {} : { sources: composition.sources }) },
      // The plan version and the Plan Boundary Split are part of the canonical envelope (Issue #48).
      planVersion: ordinal,
      boundary: planBoundarySplit(edits.disallowedAdaptations, edits.askFirstAdaptations ?? [], definition.contractIdentity?.version === 2,
        providerPlan.selectedPolicyIdentity !== undefined),
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
    if (composition.procedure !== undefined) recordProcedurePlanPin(this.#db, taskIntentId, envelope.digest, (selected ?? composition.procedure).procedureId, (selected ?? composition.procedure).version);
    return { planVersionId, planEnvelopeDigest: envelope.digest };
  }

  // ---- authorization -----------------------------------------------------------------------------

  /**
   * A Run that would dispatch is recorded `authorized` and named for the execution owner, which admits it at once or,
   * while the governor has no place, when one frees (Issue #49, S14; CONC-007): nothing is refused for a busy
   * instance, and a repeat of an authorization already recorded answers as it always has.
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
    start: 'now' | 'when-online' | 'idle' = 'now',
    origin: AnalysisAuthorizationOrigin = STANDARD_DIRECT,
  ): { projection: AnalysisProjection; dispatchRunRecordId: string | null } {
    if (this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE) requireAnalysis(start === 'now' && origin.kind === 'standard-direct',
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于直接授权的前台审阅。');
    // The baseline rule of the selected Provider Processing admits one kind and one origin, each refused under its own code, as preparation refuses them.
    requireAnalysis(this.#liveReading() !== MODEL_SERVICE_SETUP_REQUIRED, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    if (this.#launch.live !== null) {
      const scope = this.#launch.operationalScope;
      const admitted = this.#definition.kind === BASELINE_ANALYSIS_KIND ? null : plannedRunAdmission(this.#launch.policy, this.#definition, this.#launch.live);
      requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || admitted !== null,
        'ANALYSIS_KIND_NOT_ADMITTED', `${scope} 当前只允许基线稿件分析；该任务种类尚未获准实时执行。`);
      // Every admitted kind starts by a direct authorization; writing's developer-live quick start and a kind whose
      // selected rule admits a matching active default execution rule may also start under that rule (Issue #866).
      // A 后台分析登记's start only under the selected policy's enrolled-background rule (Issue #864; Provider Processing v14/v15).
      requireAnalysis(origin.kind === 'standard-direct' || (origin.kind === 'default-execution-rule' && admitted !== null &&
          ((this.#definition.kind === WRITING_KIND && scope === 'developer-live') ||
            liveKindRule(this.#launch.policy, this.#definition.kind)?.matchingActiveDefaultExecutionRuleAllowed === true)) ||
          (origin.kind === 'background-analysis-enrollment' && this.#definition.kind === BASELINE_ANALYSIS_KIND &&
            liveKindRule(this.#launch.policy, BASELINE_ANALYSIS_KIND, [], 'background') !== null),
        'ANALYSIS_ORIGIN_NOT_ADMITTED', `${scope} 当前只允许直接授权的基线稿件分析。`);
    }
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest) &&
      (origin.kind === 'standard-direct' || (start === 'now' && UUID_PATTERN.test(origin.kind === 'default-execution-rule' ? origin.ruleVersionId : origin.enrollmentVersionId))),
    'ANALYSIS_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireAnalysis(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope !== null && prepared.planVersion !== null,
      'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.planEnvelope.compositionVersion === 3 || prepared.planEnvelope.compositionVersion === 4) requireAnalysis(start === 'now' && origin.kind === 'standard-direct',
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于直接授权的前台审阅。');
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
    requireAnalysis(prepared.actions.canAuthorize, 'ANALYSIS_REUSE_PLAN_DRIFT', REUSE_PLAN_DRIFT_AUTHORIZE_REASON);
    const dispatchAllowed = prepared.planEnvelope.dispatchAllowed;
    requireAnalysis(start === 'now' || dispatchAllowed, 'ANALYSIS_START_WHEN_ONLINE_INVALID', '这份计划没有可执行的路由，不能联网后开始。');
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authority = dispatchAllowed ? 'standard-direct-dispatch' : 'record-only-no-dispatch';
    const authorization = canonicalRecord({
      authorizationId,
      origin: origin.kind,
      startWhen: start === 'idle' ? 'idle' : 'now',
      planEnvelopeDigest,
      planVersionId: prepared.planVersion.planVersionId,
      planVersionOrdinal: prepared.planVersion.ordinal,
      taskIntentId,
      authority,
      ...(origin.kind === 'default-execution-rule' ? { ruleVersionId: origin.ruleVersionId } : {}),
      ...(origin.kind === 'background-analysis-enrollment' ? { enrollmentVersionId: origin.enrollmentVersionId } : {}),
    });
    const procedure = readProcedurePlanPin(this.#db, planEnvelopeDigest);
    requireAnalysis(procedure === null || !procedureStopped(this.#db, procedure), 'PROCEDURE_STOPPED', '计划固定的工序版本已停用，请选择另一个版本重新准备。');
    const run = canonicalRecord({ runRecordId, authorizationId, taskIntentId, recordedAt: instant,
      ...(procedure === null ? {} : { procedure }) });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO analysis_run_authorizations(authorization_id, task_intent_id, plan_envelope_sha256, origin, authority, authorized_at, canonical_json, sha256, start_when)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, origin.kind, authority, instant, authorization.json, authorization.digest, start === 'idle' ? 'idle' : 'now');
      this.#db.prepare(
        'INSERT INTO analysis_run_records(run_record_id, task_intent_id, authorization_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
      this.#insertRunState(runRecordId, 1, 'authorized', origin.kind === 'standard-direct'
        ? { detail: '标准直接运行授权已记录。' }
        : origin.kind === 'default-execution-rule'
          ? { detail: '快速开始按默认执行规则记录了运行授权。', ruleVersionId: origin.ruleVersionId }
          : { detail: BACKGROUND_AUTHORIZED_DETAIL, enrollmentVersionId: origin.enrollmentVersionId }, instant);
      if (!dispatchAllowed) {
        const reasons = blockedReasons(this.#liveReading());
        this.#insertRunState(runRecordId, 2, 'blocked-before-dispatch', { detail: reasons.join(' '), reasons }, instant);
      } else if (start === 'when-online') {
        this.#insertRunState(runRecordId, 2, 'awaiting-connectivity', { detail: CONNECTIVITY_WAIT_DETAIL }, instant);
      }
    });
    return { projection: this.inspect(bookId), dispatchRunRecordId: dispatchAllowed && start !== 'when-online' ? runRecordId : null };
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
    // 取消 on a Task of another kind whose Run never began: blocked before dispatch after it waited — its plan moved, or this
    // launch could not start it (Issue #764). Under developer-live 初评 cannot be prepared again, so nothing else would end it;
    // the item leaves 待我处理 once the Run is cancelled. A Run that began (so one holding a 结果待确认 range) is never here.
    if (run.state === 'blocked-before-dispatch' && this.#definition.kind !== BASELINE_ANALYSIS_KIND && !runBegan(run.transitions)) {
      this.recordRunState(run.runRecordId, 'cancelled', { detail: '编辑取消了这项没能开始的任务；没有发送任何内容，也没有产生用量。' });
      return this.inspect(bookId);
    }
    // A Run waiting on the governor (Issue #49, S14) is cancelled the same way: nothing of it ran either.
    requireAnalysis(run.state === 'awaiting-connectivity' || run.state === 'authorized', 'ANALYSIS_CANCEL_NOT_WAITING', '只有等待中或没能开始的任务可以在这里取消；它已经开始或已经结束。');
    this.recordRunState(run.runRecordId, 'cancelled', {
      detail: run.state === 'authorized'
        ? '编辑在派发前取消了这项等待运行名额的任务；没有发送任何内容，也没有产生用量。'
        : '编辑在派发前取消了这项等待中的任务；没有发送任何内容，也没有产生用量。',
    });
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
    requireAnalysis(run.state !== 'awaiting-connectivity' && run.state !== 'authorized', 'ANALYSIS_CANCEL_WAITING', '这项任务还在等待开始；请用等待中的「取消」。');
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
    // 结果待确认 (Issue #51, S16c; ADR 0034, CONT-011, CONT-016): the Run does not go on; nothing the old authorization covers
    // may send again under it.
    requireAnalysis(this.outcomeUnknownOf(run.runRecordId) === null, 'ANALYSIS_RESUME_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_NO_RESUME);
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
      this.stageContinuationOf(runRecordId);
    } catch {
      reasons.push('已保存的阅读进度无法核对，这次运行不能续行；请取消它，再重新开始。');
    }
    return reasons;
  }

  /** Read the latest optional stage evidence, refusing corrupt or incompatible evidence before admission. */
  stageContinuationOf(runRecordId: string): StageContinuation | null {
    const rows = this.#db.prepare('SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC').all(runRecordId) as SqlRow[];
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as { stageContinuation?: { schema?: unknown; data?: StageContinuation; digest?: unknown }; carriedUsage?: unknown };
      const kept = record.stageContinuation;
      if (kept === undefined) continue;
      const invalid = (): never => { throw new AnalysisError('ANALYSIS_RECORD_INVALID', '已保存的阶段进度无法核对；不能续行。'); };
      if (canonicalRecord(record).digest !== row.sha256 || kept === null || kept.schema !== 'ai7.analysis.stage-continuation/1' ||
          kept.data === undefined || canonicalRecord(kept.data).digest !== kept.digest || JSON.stringify(kept).length > 16_777_216) invalid();
      const data = kept.data!;
      const stored = this.executionBindingOf(runRecordId);
      if (stored === null || data.runRecordId !== runRecordId || data.attemptId !== stored.attemptId || data.bindingDigest !== stored.bindingDigest ||
          data.manifestDigest !== stored.binding.coverageManifestDigest || data.promptContractDigest !== stored.binding.promptContractDigest || record.carriedUsage === undefined || data.reduction === undefined) invalid();
      const definition = this.definitionForRun(runRecordId, data.promptContractDigest);
      const count = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
      if (data.reduction !== undefined) {
        const reduction = data.reduction;
        if (!DIGEST_PATTERN.test(reduction.inputDigest) || reduction.contractDigest !== (definition.crossUnit?.promptContractDigest ?? data.promptContractDigest) ||
            !['closed', 'gap', 'not-run'].includes(reduction.outcome?.state) ||
            (reduction.requestDigest === null) !== (reduction.outcome.state === 'not-run') ||
            reduction.requestDigest !== null && (!DIGEST_PATTERN.test(reduction.requestDigest) || reduction.outcome.state === 'not-run' || reduction.outcome.requestDigest !== reduction.requestDigest) ||
            reduction.outcome.state === 'closed' && (!Array.isArray(reduction.outcome.findings) || reduction.outcome.usage !== null &&
              (!count(reduction.outcome.usage.inputTokens) || !count(reduction.outcome.usage.outputTokens)))) invalid();
      }
      if (data.sampling !== undefined) {
        const sample = data.sampling;
        if (data.reduction === undefined || !DIGEST_PATTERN.test(sample.inputDigest) || sample.contractDigest !== definition.assurance?.promptContractDigest ||
            !count(sample.nextTurn) || sample.nextTurn < 1 || !Array.isArray(sample.turns) || sample.turns.length !== sample.nextTurn - 1 ||
            !sample.turns.every((turn) => DIGEST_PATTERN.test(turn.requestDigest) && count(turn.unitOrdinal) && turn.unitOrdinal > 0 &&
              ['closed', 'gap', 'outcome-unknown'].includes(turn.state) && (turn.usage === null || count(turn.usage.inputTokens) && count(turn.usage.outputTokens))) ||
            typeof sample.ended !== 'boolean' || sample.turns.some((turn) => turn.state === 'outcome-unknown') && !sample.ended ||
            !Array.isArray(sample.dispositions) || !Array.isArray(sample.gapReasons) || !sample.gapReasons.every((reason) => typeof reason === 'string') ||
            !Array.isArray(sample.draw?.sampled) || !count(sample.sampled?.inputTokens) || !count(sample.sampled?.outputTokens) || !count(sample.sampled?.turnsWithUsage)) invalid();
      }
      // A newer snapshot may only follow all submitted units; no corrupt stage pin can send unfinished units first.
      const governed = this.requestAdmissionOf(runRecordId) !== null;
      const plan = governed ? this.#planRecords(stored!.binding.taskIntentId, 'any', stored!.binding.planVersion) : null;
      const reuse = plan?.['reuse-plan'] as { units: Array<{ disposition: string }> } | undefined;
      const facts = governed ? null : this.loadExecutionPlan(runRecordId);
      const expected = governed ? reuse === undefined ? this.#requestManifest(stored!).units.length : reuse.units.filter((unit) => unit.disposition === 'recomputed').length
        : facts!.update === null ? facts!.manifest.units.length : facts!.update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').length;
      if (this.unitCheckpoints(runRecordId).length !== expected) invalid();
      const usage = this.carriedUsageOf(runRecordId)?.stages;
      if (usage == null || data.reduction?.outcome.state === 'closed' && usage['cross-unit-reduction'].requests < 1) invalid();
      if (data.sampling !== undefined && (usage!['assurance-sampling'].requests < data.sampling.nextTurn - 1 ||
          data.sampling.sampled.turnsWithUsage > data.sampling.nextTurn - 1 ||
          usage!['assurance-sampling'].inputTokens < data.sampling.sampled.inputTokens || usage!['assurance-sampling'].outputTokens < data.sampling.sampled.outputTokens)) invalid();
      return data;
    }
    return null;
  }

  /** One settled unit of a Run, kept the moment it settles: the continuation point 续行 goes on from (CONT-015). */
  recordUnitCheckpoint(input: {
    runRecordId: string;
    attemptId: string;
    unit: UnitResultRecord;
    observation: UnitCheckpoint['observation'];
    requests?: readonly string[];
  }): void {
    if (input.requests !== undefined) requireAnalysis(Number(this.#db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, 'ANALYSIS_RECORD_INVALID', '请求检查点写入需要已验证的读者修订。');
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: UNIT_CHECKPOINT_SCHEMA,
      runRecordId: input.runRecordId,
      attemptId: input.attemptId,
      unit: input.unit,
      observation: input.observation,
      ...(input.requests === undefined ? {} : { requests: input.requests }),
      recordedAt,
    });
    this.#db.prepare(
      'INSERT INTO analysis_unit_checkpoints(run_record_id, unit_ordinal, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(input.runRecordId, input.unit.unitOrdinal, input.unit.closed.state, recordedAt, record.json, record.digest);
  }

  /**
   * What a stopped Run spent beyond its units before it stopped — settled or refused stage work — as its latest
   * stop kept it (Issue #51, S16a): the ceiling counts it after 续行 as it did before. `null` when no stop kept any.
   */
  carriedUsageOf(runRecordId: string): { inputTokens: number; outputTokens: number; stages: CarriedStages | null; webVerification?: { inputTokens: number; outputTokens: number } } | null {
    const rows = this.#db.prepare(
      `SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? AND
       (state IN ('paused', 'resumable', 'awaiting-clarification') OR
        json_extract(canonical_json, '$.requestAdmission.schema') = 'ai7.analysis.request-admission/1' AND json_type(canonical_json, '$.carriedUsage') IS NOT NULL)
       ORDER BY sequence DESC`,
    ).all(runRecordId) as SqlRow[];
    const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as { carriedUsage?: unknown; requestAdmission?: unknown };
      if (record.requestAdmission !== undefined) {
        requireAnalysis(canonicalRecord(record).digest === row.sha256, 'ANALYSIS_RECORD_INVALID', '阶段用量记录无法核对。');
        this.requestAdmissionOf(runRecordId);
      }
      const carried = record.carriedUsage;
      if (carried === undefined) continue;
      const usage = carried as { inputTokens?: unknown; outputTokens?: unknown; stages?: unknown; webVerification?: { inputTokens?: unknown; outputTokens?: unknown } };
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
      const web = usage.webVerification;
      requireAnalysis(web === undefined || web !== null && count(web.inputTokens) && count(web.outputTokens) &&
        web.inputTokens <= (usage.inputTokens as number) && web.outputTokens <= (usage.outputTokens as number),
      'ANALYSIS_RECORD_INVALID', '联网取证阶段的已用量无效。');
      return { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number, stages,
        ...(web === undefined ? {} : { webVerification: { inputTokens: web.inputTokens as number, outputTokens: web.outputTokens as number } }) };
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
          ? this.#unitResultOfRecord(record.unit.closed.result as Record<string, unknown>, unitOrdinal)
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
    modelQuestion?: ModelClarificationQuestion;
    firstAttempts?: number;
    raisedAt?: string;
    runRecordId: string;
    attemptId: string;
    taskIntentId: string;
    unitOrdinal: number;
    planVersion: number;
    planEnvelopeDigest: string;
    requestDigest: string;
    failure: { code: string; failureClass: string; status: number | null; reason: string };
    firstPayloadDigest: string | null;
    firstUnitMessageDigest: string;
    firstUsage: { inputTokens: number; outputTokens: number } | null;
    firstWallMs: number;
  }): string {
    requireAnalysis(UUID_PATTERN.test(input.runRecordId) && UUID_PATTERN.test(input.attemptId) && UUID_PATTERN.test(input.taskIntentId) &&
      Number.isSafeInteger(input.unitOrdinal) && input.unitOrdinal >= 1 && Number.isSafeInteger(input.planVersion) && input.planVersion >= 1 &&
      DIGEST_PATTERN.test(input.planEnvelopeDigest) && DIGEST_PATTERN.test(input.requestDigest) &&
      (input.firstPayloadDigest === null || DIGEST_PATTERN.test(input.firstPayloadDigest)),
    'ANALYSIS_RECORD_INVALID', '澄清请求记录无效。');
    const requestId = randomUUID();
    const raisedAt = input.raisedAt ?? new Date().toISOString();
    const modelJson = input.modelQuestion === undefined ? null : canonicalJson(input.modelQuestion);
    const requests = this.requestAdmissionOf(input.runRecordId);
    const covered = requests === null ? undefined : [...requests.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === input.unitOrdinal).map((request) => request.requestId);
    requireAnalysis(modelJson === null || parseModelClarification(modelJson) !== null, 'ANALYSIS_RECORD_INVALID', '模型澄清问题无效。');
    if (covered !== undefined) requireAnalysis(Number(this.#db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, 'ANALYSIS_RECORD_INVALID', '请求澄清写入需要已验证的读者修订。');
    const record = canonicalRecord({
      schema: CLARIFICATION_REQUEST_SCHEMA,
      ...(modelJson === null ? {} : { origin: 'model', modelQuestion: input.modelQuestion, firstAttempts: input.firstAttempts ?? 1 }),
      requestId,
      runRecordId: input.runRecordId,
      attemptId: input.attemptId,
      taskIntentId: input.taskIntentId,
      unitOrdinal: input.unitOrdinal,
      kind: modelJson === null ? 'ask-first-adaptation' : 'model-question',
      ...(modelJson === null ? { adaptationClass: 'safe-retry' } : {}),
      planVersion: input.planVersion,
      planEnvelopeDigest: input.planEnvelopeDigest,
      requestDigest: input.requestDigest,
      failure: input.failure,
      firstPayloadDigest: input.firstPayloadDigest,
      // What the retry the answer may let the Run make has to repeat byte for byte (Issue #286).
      firstUnitMessageDigest: input.firstUnitMessageDigest,
      firstUsage: input.firstUsage,
      firstWallMs: Math.max(0, Math.round(input.firstWallMs)),
      raisedAt,
      ...(covered === undefined ? {} : { requests: covered }),
    });
    this.#db.prepare(
      'INSERT INTO analysis_clarification_requests(request_id, run_record_id, unit_ordinal, kind, raised_at, canonical_json, sha256, model_question_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(requestId, input.runRecordId, input.unitOrdinal, 'ask-first-adaptation', raisedAt, record.json, record.digest, modelJson);
    this.checkpointClarificationRequests(input.runRecordId, input.unitOrdinal);
    return requestId;
  }

  /** A Run's Clarification Requests in unit order, each with its answer when it has one, read back against their digests. */
  clarificationsOf(runRecordId: string): ClarificationFacts[] {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const rows = this.#db.prepare(
      `SELECT q.request_id, q.unit_ordinal, q.model_question_json, q.canonical_json q_json, q.sha256 q_sha, a.answer_id, a.option_id, a.canonical_json a_json, a.sha256 a_sha
       FROM analysis_clarification_requests q
       LEFT JOIN analysis_clarification_answers a ON a.request_id = q.request_id
       WHERE q.run_record_id = ? ORDER BY q.unit_ordinal`,
    ).all(runRecordId) as SqlRow[];
    return rows.map((row) => {
      const request = parseCanonicalJson(asString(row.q_json)) as Record<string, unknown>;
      requireAnalysis(canonicalRecord(request).digest === asString(row.q_sha) && request.schema === CLARIFICATION_REQUEST_SCHEMA &&
        request.requestId === asString(row.request_id) && request.runRecordId === runRecordId && request.unitOrdinal === asNumber(row.unit_ordinal),
      'ANALYSIS_RECORD_INVALID', '澄清请求记录与其摘要不一致。');
      const modelQuestion = row.model_question_json === null ? null : parseModelClarification(asString(row.model_question_json));
      requireAnalysis(row.model_question_json === null ? request.origin === undefined && request.modelQuestion === undefined
        : modelQuestion !== null && request.origin === 'model' && canonicalJson(request.modelQuestion) === asString(row.model_question_json),
      'ANALYSIS_RECORD_INVALID', '模型澄清问题与其摘要不一致。');
      let answer: ClarificationFacts['answer'] = null;
      if (row.answer_id !== null) {
        const record = parseCanonicalJson(asString(row.a_json)) as Record<string, unknown>;
        requireAnalysis(canonicalRecord(record).digest === asString(row.a_sha) && record.schema === CLARIFICATION_ANSWER_SCHEMA &&
          record.answerId === asString(row.answer_id) && record.requestId === request.requestId &&
          (modelQuestion === null ? record.optionId === asString(row.option_id) : row.option_id === 'retry') &&
          record.requestSha256 === asString(row.q_sha),
        'ANALYSIS_RECORD_INVALID', '澄清回答记录与其摘要不一致。');
        answer = {
          answerId: record.answerId as string,
          optionId: record.optionId as AnyClarificationOptionId,
          note: record.note as string | null,
          answeredAt: record.answeredAt as string,
          ...(modelQuestion !== null && record.actor === 'service-timeout' ? { timedOut: true as const } : {}),
        };
      }
      return {
        ...(modelQuestion === null ? {} : { origin: 'model' as const, modelQuestion, firstAttempts: request.firstAttempts as number }),
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
        firstUnitMessageDigest: typeof request.firstUnitMessageDigest === 'string' ? request.firstUnitMessageDigest : null,
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
    const note = typeof input.note === 'string' ? input.note.trim() : null;
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
    requireAnalysis(!modelClarificationExpired(request, Date.now()), 'ANALYSIS_CLARIFICATION_EXPIRED', '这个问题已超过 24 小时，按「不回答」接着做。');
    requireAnalysis(input.note === null || (typeof input.note === 'string' && input.note.isWellFormed() &&
      (request.origin === 'model' ? clarificationGraphemes(input.note) : input.note.length) <= CLARIFICATION_NOTE_MAX),
    'ANALYSIS_CLARIFICATION_INVALID', `说明最多 ${CLARIFICATION_NOTE_MAX} 字。`);
    const model = request.modelQuestion;
    const selected = typeof input.optionId === 'string' ? /^model-option-([0-3])$/u.exec(input.optionId)?.[1] : undefined;
    // A safe-retry question keeps S76d's words; only a model question offers its own options and free text.
    requireAnalysis(model !== undefined || (typeof input.optionId === 'string' && (CLARIFICATION_OPTION_IDS as ReadonlyArray<string>).includes(input.optionId)),
      'ANALYSIS_CLARIFICATION_INVALID', '请选择一个回答。');
    requireAnalysis(model === undefined
      || (input.optionId === 'no-answer' ? note === null || note === ''
        : input.optionId === 'free-text' ? model.freeTextAllowed && note !== null && note !== ''
          : selected !== undefined && model.options?.[Number(selected)] !== undefined && (note === null || note === '')),
    'ANALYSIS_CLARIFICATION_INVALID', '请选择一个回答，或在允许时自行说明。');
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
    ).run(answerId, input.requestId, model === undefined ? input.optionId as string : 'retry', answeredAt, record.json, record.digest);
    return { answerId, runRecordId: run.runRecordId, runState: run.state };
  }

  /** Service-clock timeout, append-only and idempotent; an editor answer already recorded wins. */
  expireModelClarifications(runRecordId: string, now = Date.now()): number {
    let expired = 0;
    for (const request of this.clarificationsOf(runRecordId)) {
      if (!modelClarificationExpired(request, now)) continue;
      const requestRow = this.#db.prepare('SELECT sha256 FROM analysis_clarification_requests WHERE request_id = ?').get(request.requestId)!;
      const answerId = randomUUID();
      const answeredAt = new Date(now).toISOString();
      const record = canonicalRecord({ schema: CLARIFICATION_ANSWER_SCHEMA, answerId, requestId: request.requestId,
        requestSha256: asString(requestRow.sha256), runRecordId, optionId: 'no-answer', note: null, actor: 'service-timeout', answeredAt });
      this.#db.prepare('INSERT INTO analysis_clarification_answers(answer_id, request_id, option_id, answered_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
        .run(answerId, request.requestId, 'retry', answeredAt, record.json, record.digest);
      expired += 1;
    }
    return expired;
  }

  modelClarificationAnswerClaimed(runRecordId: string, requestId: string): boolean {
    const rows = this.#db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ?').all(runRecordId);
    return rows.some((row) => (parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>).modelClarificationAnswerClaim === requestId);
  }

  claimModelClarificationAnswer(runRecordId: string, requestId: string, preserveState = false): boolean {
    if (this.modelClarificationAnswerClaimed(runRecordId, requestId)) return false;
    const detail = { detail: '按澄清回答接着处理这个阅读范围。', modelClarificationAnswerClaim: requestId };
    if (preserveState) this.#appendExecutionEvidence(runRecordId, { modelClarificationAnswerClaim: requestId });
    else this.recordRunState(runRecordId, 'executing', detail);
    return true;
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

  /**
   * 结果待确认 (Issue #51, S16c): the ranges of a Run whose sent requests' results cannot be known — its kept checkpoints whose gap
   * is `outcome-unknown`, durable from the instant each was found, so every stop, reconciliation and continuation keeps them
   * and none ever reads them again. Empty when there are none, or when the kept progress no longer reads back.
   */
  unconfirmedRangesOf(runRecordId: string): UnconfirmedUnitRecord[] {
    let checkpoints: UnitCheckpoint[];
    try {
      checkpoints = this.unitCheckpoints(runRecordId);
    } catch {
      return [];
    }
    return checkpoints.flatMap((checkpoint) => checkpoint.unit.closed.state === 'gap' && checkpoint.unit.closed.gap.code === 'outcome-unknown'
      ? [{ unitOrdinal: checkpoint.unit.unitOrdinal, attempts: checkpoint.observation?.attempts ?? 1, reason: checkpoint.unit.closed.gap.reason }]
      : []);
  }

  /**
   * The 结果待确认 stop of a resumable Run (Issue #51, S16c): its latest state stopped there, with the unconfirmed ranges; `null`
   * for every other Run. Such a Run does not go on (ADR 0034, CONT-011, CONT-016): 续行 refuses it.
   */
  outcomeUnknownOf(runRecordId: string): { units: UnconfirmedUnitRecord[] } | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'resumable') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'outcome-unknown') return null;
    const units = this.unconfirmedRangesOf(runRecordId);
    return units.length === 0 ? null : { units };
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
  #openClarificationOf(runRecordId: string, state: BaselineAnalysisRunState): { requestId: string; unitOrdinal: number; raisedAt: string; origin?: 'model' } | null {
    if (!(state === 'admitted' || state === 'executing' || state === 'pausing' || state === 'paused' || state === 'resumable' ||
      state === 'awaiting-clarification')) return null;
    const open = this.clarificationsOf(runRecordId).find((entry) => entry.answer === null);
    return open === undefined ? null : { requestId: open.requestId, unitOrdinal: open.unitOrdinal, raisedAt: open.raisedAt,
      ...(open.origin === 'model' ? { origin: 'model' } : {}) };
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
    requireAnalysis(canonicalRecord(binding).digest === asString(row.sha256) && binding.attemptId === attemptId && isResultSetPolicyPin(binding.policyPin),
      'ANALYSIS_RECORD_INVALID', '执行绑定与其摘要或策略 pin 不一致。');
    const spans = this.#db.prepare('SELECT count(*) total, max(ordinal) last FROM analysis_harness_spans WHERE attempt_id = ?').get(attemptId) as SqlRow;
    return { attemptId, binding, bindingDigest: asString(row.sha256), spanCount: spans.last === null ? 0 : asNumber(spans.last) };
  }

  /**
   * Startup reconciliation (CONT-014): every Run of this kind a stopped service left admitted, executing or pausing has
   * nothing running it. One pausing settles `paused` — the boundary it waited for is reached — and one admitted or
   * executing `resumable`, 任务已中断 · 可续行, its Run Authorization kept and nothing dispatched until 续行. A start the
   * governor had not admitted yet is blocked before dispatch with why: nothing starts by itself after a restart (ADR
   * 0034). A Run left cancelling is named for the execution owner, which finishes the cancellation.
   */
  reconcileStoppedRuns(options: {
    /**
     * A start left `authorized` that another owner takes on by the editor's own choice, and that this reconciliation so
     * leaves as it is: a Review Run's category, which 继续审阅 dispatches (Issue #657 review).
     */
    readonly leaveAuthorized?: (runRecordId: string) => boolean;
  } = {}): { settled: number; cancelling: ReadonlyArray<string> } {
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
    for (const row of rows) {
      const runRecordId = asString(row.run_record_id);
      this.reconcileRequestAdmissions(runRecordId);
      const state = row.last_state === null ? null : asString(row.last_state);
      if (state === 'pausing') {
        this.recordRunState(runRecordId, 'paused', { detail: RECONCILED_PAUSED_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'paused' && this.#idleYielded(runRecordId)) {
        // Yielding lasts only while this lifetime runs (Issue #1089): afterwards the Run waits for 续行 like any paused Run.
        this.recordRunState(runRecordId, 'paused', { detail: RECONCILED_YIELDED_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'admitted' || state === 'executing') {
        this.recordRunState(runRecordId, 'resumable', { detail: RECONCILED_RESUMABLE_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'cancelling') {
        cancelling.push(runRecordId);
      } else if (state === 'awaiting-clarification' && this.clarificationsOf(runRecordId).every((entry) => entry.answer !== null)) {
        // The editor answered while another Run held the slot, and AI7 closed before it went on (Issue #767; ADR 0034): the answer
        // stays recorded, and the Run waits for the editor's 续行 like every Run a restart left, so nothing is sent by itself.
        this.recordRunState(runRecordId, 'resumable', { detail: RECONCILED_RESUMABLE_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'authorized' && options.leaveAuthorized?.(runRecordId) !== true) {
        // A start the governor had not admitted yet (Issue #49, S14) — or one a service stopped on between its
        // authorization and its admission — never began: blocked with why, it waits for the editor, not for a place.
        this.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: RECONCILED_QUEUED_DETAIL, reasons: [RECONCILED_QUEUED_DETAIL], reconciled: true });
        settled += 1;
      }
    }
    return { settled, cancelling };
  }

  /**
   * Each Book's latest Task of this kind whose Run waits in Connectivity Wait, or that Reconnect Preflight blocked after it
   * waited — its plan moved, or this launch could not start it (Issue #760, S74c; ATTN-004, CONC-006): what 待我处理 and the 任务
   * panel read of a kind they otherwise leave to its own surface. Every row the query keeps is a reading, so the limit bounds
   * what is shown and nothing is dropped after it. A read; nothing is written.
   */
  waitingAttentionReadings(bookId: string | null, limit: number): Array<{
    bookId: string; bookTitle: string; taskIntentId: string; runRecordId: string; state: 'awaiting-connectivity' | 'plan-moved' | 'launch-blocked'; stateAt: string;
  }> {
    const lastState = `(SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)`;
    const rows = this.#db.prepare(
      `SELECT t.task_intent_id, t.book_id, b.title book_title, r.run_record_id, ${lastState} last_state,
              (SELECT s.recorded_at FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state_at
       FROM analysis_task_intents t
       JOIN books b ON b.book_id = t.book_id
       JOIN analysis_run_records r ON r.task_intent_id = t.task_intent_id
       WHERE t.kind = ? AND t.rowid = (
           SELECT t2.rowid FROM analysis_task_intents t2 WHERE t2.book_id = t.book_id AND t2.kind = t.kind
           ORDER BY t2.created_at DESC, t2.rowid DESC LIMIT 1)
         AND (${lastState} = 'awaiting-connectivity' OR (${lastState} = 'blocked-before-dispatch' AND EXISTS (
           SELECT 1 FROM analysis_run_states w WHERE w.run_record_id = r.run_record_id AND w.state = 'awaiting-connectivity')))
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY t.created_at, t.task_intent_id LIMIT ?`,
    ).all(this.#definition.kind, bookId, bookId, limit) as SqlRow[];
    return rows.map((row) => {
      const runRecordId = asString(row.run_record_id);
      const state = row.last_state === 'awaiting-connectivity' ? 'awaiting-connectivity' as const
        : this.blockedByOf(runRecordId) === 'plan-moved' ? 'plan-moved' as const : 'launch-blocked' as const;
      return { bookId: asString(row.book_id), bookTitle: asString(row.book_title), taskIntentId: asString(row.task_intent_id), runRecordId, state, stateAt: asString(row.last_state_at) };
    });
  }

  /** Every Run of this kind waiting in Connectivity Wait, oldest first, with its Book. */
  waitingRuns(): Array<{ bookId: string; taskIntentId: string; runRecordId: string; recordedAt: string }> {
    const rows = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, r.recorded_at, i.book_id
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       WHERE i.kind = ?
         AND (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)
           = 'awaiting-connectivity'
       ORDER BY r.recorded_at, r.rowid`,
    ).all(this.#definition.kind) as SqlRow[];
    return rows.map((row) => ({
      bookId: asString(row.book_id), taskIntentId: asString(row.task_intent_id), runRecordId: asString(row.run_record_id), recordedAt: asString(row.recorded_at),
    }));
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
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, version.ordinal)),
      // An authorized production Run owns its connection; settings select the next Task's connection (#811 revision 9).
      this.#launch.operationalScope === 'ordinary-production' ? frozen.providerBinding : undefined, intent.backgroundRunBudgetCeiling);
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

  /** Immutable request pins remain readable after this Run publishes its successor revision. */
  #requestManifest(stored: NonNullable<ReturnType<BaselineAnalysisStore['executionBindingOf']>>): CoverageManifestProjection {
    const manifest = this.#planRecords(stored.binding.taskIntentId, 'any', stored.binding.planVersion)['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === stored.binding.coverageManifestDigest &&
      manifest.manuscript.revisionId === stored.binding.manuscriptPin.revisionId && manifest.manuscript.revisionDigest === stored.binding.manuscriptPin.revisionDigest,
    'ANALYSIS_RECORD_INVALID', '请求准入的固定覆盖清单无法核对。');
    return manifest;
  }

  /** An absent receipt is historical evidence, never an inferred admission. */
  requestAdmissionOf(runRecordId: string): RequestAdmissionReading | null {
    return readRequestAdmissions(this.#db, runRecordId);
  }

  /** Preserve the latest stop, detail and idle-yield marker when appending private execution evidence. */
  #appendExecutionEvidence(runRecordId: string, detail: Record<string, unknown>): void {
    const row = this.#db.prepare('SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined && sha256Hex(asString(row.canonical_json)) === row.sha256, 'ANALYSIS_RECORD_INVALID', '运行状态无法核对。');
    const { runRecordId: _run, sequence: _sequence, state, recordedAt: _at, requestAdmission: _receipt, ...kept } = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    this.recordRunState(runRecordId, state as BaselineAnalysisRunState, { ...kept, ...detail });
  }

  #appendRequestAdmission(runRecordId: string, pins: RequestAdmissionPins, event: RequestAdmissionEvent, detail: Record<string, unknown> = {}): void {
    requireAnalysis(Number(this.#db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION,
      'ANALYSIS_RECORD_INVALID', '请求准入写入需要已验证的读者修订。');
    transact(this.#db, () => {
      const prior = this.requestAdmissionOf(runRecordId);
      const data: RequestAdmissionData = { ...pins, sequence: (prior?.sequence ?? 0) + 1, predecessorDigest: prior?.digest ?? null, event };
      this.#appendExecutionEvidence(runRecordId, { ...detail, requestAdmission: { schema: 'ai7.analysis.request-admission/1', data, digest: canonicalRecord(data).digest } });
      this.requestAdmissionOf(runRecordId);
    });
  }

  beginRequestAdmissions(runRecordId: string, width: 1 | 3, policyRuleId: string): 1 | 3 {
    requireAnalysis(typeof policyRuleId === 'string' && /^[a-z][a-z0-9-]{0,159}$/u.test(policyRuleId),
      'ANALYSIS_RECORD_INVALID', '请求准入需要实际规则标识。');
    const prior = this.requestAdmissionOf(runRecordId);
    if (prior !== null) {
      requireAnalysis(prior.pins.policyRuleId === policyRuleId, 'ANALYSIS_RECORD_INVALID', '请求准入的固定规则与实际规则不一致。');
      return prior.width;
    }
    const stored = this.executionBindingOf(runRecordId);
    requireAnalysis(stored !== null, 'ANALYSIS_RECORD_INVALID', '请求准入前必须保存执行绑定。');
    const binding = stored.binding;
    this.#appendRequestAdmission(runRecordId, { runRecordId, attemptId: stored.attemptId, bindingDigest: stored.bindingDigest,
      planEnvelopeDigest: binding.planEnvelopeDigest, manifestDigest: binding.coverageManifestDigest, compositionDigest: binding.behaviorCompositionDigest,
      promptContractDigest: binding.promptContractDigest, policyVersion: binding.policyPin.providerProcessingVersion, policyRuleId },
    { kind: 'execution', width, limits: { requests: 4, units: 3, backgroundRequests: 1 } });
    return this.requestAdmissionOf(runRecordId)!.width;
  }

  admitModelRequest(runRecordId: string, request: AnalysisRequestIdentity, clarificationRequestId: string | null = null): void {
    transact(this.#db, () => {
      const reading = this.requestAdmissionOf(runRecordId);
      requireAnalysis(reading !== null, 'ANALYSIS_RECORD_INVALID', '请求准入缺少执行收据。');
      if (clarificationRequestId !== null) requireAnalysis(!this.modelClarificationAnswerClaimed(runRecordId, clarificationRequestId),
        'ANALYSIS_CLARIFICATION_ALREADY_CLAIMED', '澄清回答回合已经提交；没有再次发送。');
      this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'admit', request },
        clarificationRequestId === null ? {} : { modelClarificationAnswerClaim: clarificationRequestId });
    });
  }

  recordModelRequestNotSent(runRecordId: string, requestId: string): void {
    const reading = this.requestAdmissionOf(runRecordId);
    const request = reading?.open.get(requestId);
    requireAnalysis(reading !== null && request !== undefined, 'ANALYSIS_RECORD_INVALID', '未发送证明缺少精确的请求标识。');
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests: [requestId], evidence: { kind: 'no-send', digest: canonicalRecord(request).digest } });
  }

  checkpointFactualRequests(runRecordId: string, round: import('../factual-verification.js').FactualClaimRound): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const requests = [...reading.open.values()].filter((request) => request.stage === 'web-verification' && request.sessionId === round.sessionId).map((request) => request.requestId);
    if (requests.length > 0) this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests,
      evidence: { kind: 'factual-checkpoint', digest: canonicalRecord(round).digest } });
  }

  checkpointModelRequests(runRecordId: string, unitOrdinal: number): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === unitOrdinal).map((request) => request.requestId);
    if (requests.length === 0) return;
    const checkpoint = this.#db.prepare('SELECT sha256 FROM analysis_unit_checkpoints WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unitOrdinal) as SqlRow | undefined;
    requireAnalysis(checkpoint !== undefined, 'ANALYSIS_RECORD_INVALID', '请求结算前必须保存对应的单元结果。');
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests, evidence: { kind: 'unit-checkpoint', digest: asString(checkpoint.sha256) } });
    this.requestAdmissionOf(runRecordId);
  }

  checkpointClarificationRequests(runRecordId: string, unitOrdinal: number): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const row = this.#db.prepare('SELECT canonical_json, sha256 FROM analysis_clarification_requests WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unitOrdinal) as SqlRow | undefined;
    if (row === undefined) return;
    const checkpoint = parseCanonicalJson(asString(row.canonical_json)) as { requests?: string[] };
    const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === unitOrdinal && checkpoint.requests?.includes(request.requestId)).map((request) => request.requestId);
    if (requests.length === 0) return;
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests,
      evidence: { kind: 'clarification-checkpoint', digest: asString(row.sha256) } });
  }

  modelClarificationAnswerNotSent(runRecordId: string, clarificationRequestId: string, unitOrdinal: number): boolean {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return false;
    const claims = this.#db.prepare(`SELECT sequence, canonical_json FROM analysis_run_states WHERE run_record_id = ? AND
      json_extract(canonical_json, '$.modelClarificationAnswerClaim') = ? ORDER BY sequence LIMIT 1`).get(runRecordId, clarificationRequestId) as SqlRow | undefined;
    if (claims === undefined) return false;
    const firstReceipt = this.#db.prepare(`SELECT sequence FROM analysis_run_states WHERE run_record_id = ? AND
      json_type(canonical_json, '$.requestAdmission') IS NOT NULL ORDER BY sequence LIMIT 1`).get(runRecordId) as SqlRow;
    const origin = parseCanonicalJson(asString(claims.canonical_json)) as { requestAdmission?: { data: { event: RequestAdmissionEvent } } };
    const admitted = origin.requestAdmission?.data.event;
    if (asNumber(claims.sequence) < asNumber(firstReceipt.sequence) || admitted?.kind !== 'admit' ||
        admitted.request.stage !== 'units' || admitted.request.unitOrdinal !== unitOrdinal) return false;
    const rows = this.#db.prepare(`SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND sequence >= ? AND
      json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit' AND
      json_extract(canonical_json, '$.requestAdmission.data.event.request.unitOrdinal') = ?`).all(runRecordId, claims.sequence!, unitOrdinal) as SqlRow[];
    const ids = rows.map((row) => (parseCanonicalJson(asString(row.canonical_json)) as { requestAdmission: { data: { event: { request: AnalysisRequestIdentity } } } }).requestAdmission.data.event.request.requestId);
    return ids.length > 0 && ids.every((id) => reading.notSent.some((request) => request.requestId === id));
  }

  checkpointStageRequests(runRecordId: string, stage: 'cross-unit-reduction' | 'assurance-sampling', stages: StageContinuation, carriedUsage: { inputTokens: number; outputTokens: number; stages: CarriedStages }): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const detail = { stageContinuation: { schema: 'ai7.analysis.stage-continuation/1', data: stages, digest: canonicalRecord(stages).digest }, carriedUsage };
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve',
      requests: [...reading.open.values()].filter((request) => request.stage === stage && (stage === 'cross-unit-reduction'
        ? stages.reduction?.requestDigest === request.requestDigest && stages.reduction.inputDigest === request.inputDigest
        : stages.sampling?.inputDigest === request.inputDigest && stages.sampling.turns.some((turn) => turn.requestDigest === request.requestDigest))).map((request) => request.requestId),
      evidence: { kind: 'stage-checkpoint', digest: canonicalRecord(detail).digest } }, detail);
  }

  checkpointReflectionRequests(runRecordId: string): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const requests = [...reading.open.values()].filter((request) => request.stage === 'run-report-reflection').map((request) => request.requestId);
    if (requests.length === 0) return;
    const outcome = this.#db.prepare('SELECT sha256 FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(outcome !== undefined, 'ANALYSIS_RECORD_INVALID', '反思请求结算前必须保存运行结果。');
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests, evidence: { kind: 'reflection-outcome', digest: asString(outcome.sha256) } });
  }

  hasCommittedOutcome(runRecordId: string): boolean {
    return this.#db.prepare('SELECT 1 FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) !== undefined;
  }

  checkpointRefusedRequests(runRecordId: string, stage: RunProgressStage, unitOrdinal: number | null,
    observation: { attempts: number; usage: { inputTokens: number; outputTokens: number } | null }): void {
    const reading = this.requestAdmissionOf(runRecordId);
    if (reading === null) return;
    const requests = [...reading.open.values()].filter((request) => request.stage === stage && request.unitOrdinal === unitOrdinal).map((request) => request.requestId);
    if (requests.length === 0) return;
    const requestRefusal = { state: 'provider-account-limit', stage, unitOrdinal, observation };
    this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests,
      evidence: { kind: 'refused-turn', digest: canonicalRecord(requestRefusal).digest } }, { requestRefusal });
  }

  /** Startup only: a possible send without an exact committed result is never re-executed. */
  reconcileRequestAdmissions(runRecordId: string): void {
    let reading = this.requestAdmissionOf(runRecordId);
    if (reading === null || reading.open.size === 0) return;
    const stored = this.executionBindingOf(runRecordId);
    requireAnalysis(stored !== null, 'ANALYSIS_RECORD_INVALID', '准入记录缺少执行绑定。');
    const manifest = this.#requestManifest(stored);
    // The Run's frozen contract, never the launch's current one: a reopened Run whose current
    // rule is missing or differs still names its admitted requests by the digests it froze.
    const frozen = this.definitionForRun(runRecordId, reading.pins.promptContractDigest);
    const ordinals = [...new Set([...reading.open.values()].filter((request) => request.stage === 'units').map((request) => request.unitOrdinal!))].sort((left, right) => left - right);
    for (const ordinal of ordinals) {
      this.checkpointClarificationRequests(runRecordId, ordinal);
      reading = this.requestAdmissionOf(runRecordId)!;
      const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === ordinal);
      if (requests.length === 0) continue;
      const pins = reading.pins;
      // The unknown checkpoint and its discharge commit together: a refused discharge leaves no row behind.
      transact(this.#db, () => {
        const existing = this.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === ordinal);
        if (existing === undefined) {
          const unit = manifest.units[ordinal - 1]!;
          const reason = '本次请求已准入，AI7 关闭前没有保存可核对的单元结果；结果未知，这次运行不会再次发送。';
          const question = this.clarificationsOf(runRecordId).find((entry) => entry.unitOrdinal === ordinal);
          this.recordUnitCheckpoint({ runRecordId, attemptId: pins.attemptId, requests: requests.map((request) => request.requestId),
            unit: { unitOrdinal: ordinal, requestDigest: frozen.requestDigest(ordinal, unit.digest), lineage: { kind: 'recomputed' },
              closed: { state: 'gap', gap: { unitOrdinal: ordinal, code: 'outcome-unknown', reason, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } } },
            observation: { unitOrdinal: ordinal, attempts: (question?.firstAttempts ?? (question === undefined ? 0 : 1)) + new Set(requests.map((request) => `${request.sessionId}:${request.attemptIndex}:${request.adaptationId ?? ''}`)).size,
              usage: question?.firstUsage ?? null, wallMs: question?.firstWallMs ?? 0 } });
        }
        this.checkpointModelRequests(runRecordId, ordinal);
      });
      reading = this.requestAdmissionOf(runRecordId)!;
    }
    const stageRequests = [...reading.open.values()].filter((request) => request.stage === 'cross-unit-reduction' || request.stage === 'assurance-sampling');
    if (stageRequests.length > 0) {
      const kept = this.stageContinuationOf(runRecordId);
      const stages: StageContinuation = kept ?? { runRecordId, attemptId: reading.pins.attemptId, bindingDigest: reading.pins.bindingDigest,
        manifestDigest: reading.pins.manifestDigest, promptContractDigest: reading.pins.promptContractDigest };
      const usage = this.carriedUsageOf(runRecordId);
      const carried: CarriedStages = structuredClone(usage?.stages ?? {
        'cross-unit-reduction': { requests: 0, inputTokens: 0, outputTokens: 0 }, 'assurance-sampling': { requests: 0, inputTokens: 0, outputTokens: 0 },
      });
      const reduction = stageRequests.find((request) => request.stage === 'cross-unit-reduction');
      if (reduction !== undefined && stages.reduction === undefined) {
        stages.reduction = { inputDigest: reduction.inputDigest, contractDigest: reduction.contractDigest, requestDigest: reduction.requestDigest,
          outcome: { state: 'gap', code: 'outcome-unknown', requestDigest: reduction.requestDigest,
            reason: '归纳请求可能已经发出，关闭前没有保存可核对的结果；本次运行不会再次发送。' } };
        carried['cross-unit-reduction'].requests += 1;
      }
      const sampling = stageRequests.find((request) => request.stage === 'assurance-sampling');
      if (sampling !== undefined) {
        const sample = stages.sampling;
        requireAnalysis(sample !== undefined && sample.inputDigest === sampling.inputDigest && sample.contractDigest === sampling.contractDigest,
          'ANALYSIS_RECORD_INVALID', '抽样准入缺少可核对的抽取记录；不能续行。');
        if (!sample.turns.some((turn) => turn.requestDigest === sampling.requestDigest)) {
          const turn = assuranceSamplingTurns(sample.draw.sampled)[sample.nextTurn - 1];
          const definition = this.definitionForRun(runRecordId, reading.pins.promptContractDigest);
          const blocks = new Map(this.readRevisionBlocks(manifest.manuscript.manuscriptId, manifest.manuscript.revisionId).map((block) => [block.blockId, block] as const));
          requireAnalysis(turn !== undefined && definition.assurance !== null && canonicalRecord(buildAssuranceSamplingMessage(manifest.units[turn.unitOrdinal - 1]!,
            manifest.units.length, blocks, turn.findings, definition.assurance.prompt)).digest === sampling.requestDigest,
          'ANALYSIS_RECORD_INVALID', '抽样请求与抽取记录不一致；不能续行。');
          sample.turns.push({ requestDigest: sampling.requestDigest, unitOrdinal: turn.unitOrdinal, usage: null, state: 'outcome-unknown' });
          sample.nextTurn += 1; sample.ended = true;
          sample.gapReasons.push(`第 ${turn.unitOrdinal} 个阅读范围的抽样请求可能已经发出，关闭前没有保存结果；本次运行不会再次发送。`);
          carried['assurance-sampling'].requests += 1;
        }
      }
      const totals = { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, stages: carried };
      if (reduction !== undefined) this.checkpointStageRequests(runRecordId, 'cross-unit-reduction', stages, totals);
      if (sampling !== undefined) this.checkpointStageRequests(runRecordId, 'assurance-sampling', stages, totals);
      reading = this.requestAdmissionOf(runRecordId)!;
    }
    const reflection = [...reading.open.values()].filter((request) => request.stage === 'run-report-reflection');
    if (reflection.length > 0) {
      if (this.hasCommittedOutcome(runRecordId)) this.checkpointReflectionRequests(runRecordId);
      else this.#appendRequestAdmission(runRecordId, reading.pins, { kind: 'resolve', requests: reflection.map((request) => request.requestId),
        evidence: { kind: 'unavailable', digest: canonicalRecord({ requests: reflection, reason: 'possible-send-without-durable-result' }).digest } });
    }
  }

  recordRunState(runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>): void {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const row = this.#db.prepare('SELECT max(sequence) last FROM analysis_run_states WHERE run_record_id = ?').get(runRecordId) as SqlRow;
    const last = row.last === null ? 0 : asNumber(row.last);
    requireAnalysis(last >= 1, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    this.#insertRunState(runRecordId, last + 1, state, detail, new Date().toISOString());
  }

  /** Whether the Run's latest state is AI7's yield to the editor's waiting Run (Issue #1089), not the editor's own 暂停. */
  #idleYielded(runRecordId: string): boolean {
    const row = this.#db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    return row !== undefined && (parseCanonicalJson(asString(row.canonical_json)) as { idleYield?: unknown }).idleYield === true;
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
      `SELECT r.run_record_id, r.task_intent_id, a.plan_envelope_sha256, a.origin, a.canonical_json
       FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    // Who started the Run (Issue #864): a 后台分析登记's Run is only ever the Task its dispatcher created under that very version.
    const origin = authorizationOrigin(run);
    requireAnalysis(origin.origin !== 'background-analysis-enrollment' || intent.preparedByEnrollmentVersionId === origin.enrollmentVersionId,
      'ANALYSIS_RECORD_INVALID', '运行授权的来源与任务意图不一致。');
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
    const selectedMetadata = providerPlanPolicyMetadata(providerPlan);
    const retainedBinding = this.executionBindingOf(runRecordId);
    if (retainedBinding !== null) requireAnalysis(
      retainedBinding.binding.policyPin.operationalScope === providerPlan.remoteBinding.providerProcessing.operationalScope &&
      retainedBinding.binding.policyPin.providerProcessingVersion === providerPlan.remoteBinding.providerProcessing.version &&
      (selectedMetadata.selectedPolicyIdentity === undefined || retainedBinding.binding.policyPin.activePolicySetVersion === selectedMetadata.selectedPolicyIdentity.activePolicySetVersion),
    'ANALYSIS_RECORD_INVALID', '执行绑定的策略 pin 与冻结计划不一致。');
    const localFixtureRuntime = selectedMetadata.localFixtureProfile === undefined ? null : this.#launch.localFixtureRuntime?.();
    requireAnalysis(selectedMetadata.localFixtureProfile === undefined || localFixtureRuntime !== undefined && localFixtureRuntime !== null &&
      canonicalJson(localFixtureRuntime.selectedPolicyIdentity) === canonicalJson(selectedMetadata.selectedPolicyIdentity),
    'ANALYSIS_RECORD_INVALID', '冻结计划的本地夹具策略目录缺失或不一致。');
    const runBudgetCeiling = runBudgetCeilingStateOf(providerPlan.runBudgetCeiling);
    // The route the plan froze must still be the route this launch binds. A developer-live plan
    // cannot execute under a provider-free launch, and a deterministic plan cannot execute live.
    const live = this.#launch.live;
    let productionBinding: ProductionPlanBinding | null = null;
    if (this.#launch.operationalScope === 'ordinary-production') {
      // Ordinary production (Issue #811): the Run keeps the binding its plan froze — one of the two allowed routes, exactly, on
      // a production connection's own Credential Reference — whatever route the editor has configured since.
      const route = providerPlan.executionRoute;
      const allowed = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => route.kind === binding.route && 'endpoint' in route &&
        route.model === binding.model && route.endpoint === binding.endpoint && providerPlan.remoteBinding.credentialSlot === binding.credentialSlot);
      const reference = providerPlan.remoteBinding.credentialReference;
      requireAnalysis(allowed !== undefined && providerPlan.remoteBinding.providerProcessing.operationalScope === 'ordinary-production' &&
        UUID_PATTERN.test(reference) && !DEVELOPMENT_CREDENTIAL_REFERENCES.has(reference.toLowerCase()),
      'ANALYSIS_ROUTE_STALE', '冻结计划不是正式使用下可执行的模型服务路线。');
      productionBinding = { route: allowed.route, model: allowed.model, endpoint: allowed.endpoint, credentialSlot: allowed.credentialSlot };
    } else if (live !== null && live.scope !== 'ordinary-production') {
      requireAnalysis(providerPlan.executionRoute.kind === live.route && providerPlan.executionRoute.model === live.model &&
        providerPlan.executionRoute.endpoint === live.endpoint, 'ANALYSIS_ROUTE_STALE', '当前启动的实时路由与冻结计划不一致。');
      requireAnalysis(providerPlan.remoteBinding.credentialReference === live.credentialReference &&
        canonicalJson(runBudgetCeiling) === canonicalJson(this.#planCeiling(manifest.units.length, 'unset', intent.backgroundRunBudgetCeiling)),
      'ANALYSIS_ROUTE_STALE', '当前启动的凭据引用或运行预算上限与冻结计划不一致。');
    } else {
      requireAnalysis(providerPlan.executionRoute.kind === LOCAL_DETERMINISTIC_ROUTE, 'ANALYSIS_ROUTE_ABSENT', '计划没有可执行的本地路由。');
      requireAnalysis(this.#route !== null && this.#route.fixtureIdentity === providerPlan.executionRoute.fixtureIdentity &&
        this.#route.fixtureSha256 === providerPlan.executionRoute.fixtureSha256, 'ANALYSIS_ROUTE_STALE', '当前启动的本地路由与冻结计划不一致。');
    }
    let retainedPolicy: LaunchPolicyProjection | null = null;
    if (retainedBinding !== null && selectedMetadata.selectedPolicyIdentity === undefined && productionBinding !== null) {
      retainedPolicy = this.#launch.retainedPolicyFor?.(retainedBinding.binding.policyPin,
        { ...productionBinding, credentialReference: providerPlan.remoteBinding.credentialReference }) ?? null;
      requireAnalysis(retainedPolicy !== null, 'ANALYSIS_RECORD_INVALID', '历史执行绑定缺少准确的已核实策略阅读。');
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
    // A 后台分析登记's Task is held to its Book's share under every scope (Issue #864).
    requireAnalysis((live !== null && intent.backgroundRunBudgetCeiling === null) ||
      canonicalJson(runBudgetCeiling) === canonicalJson(this.#planCeiling(manifest.units.length, planEditCeiling(editorEdits), intent.backgroundRunBudgetCeiling)),
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
      const rederived = this.#derivePlan(intent.mode, stored.selectedRange, manifest, predecessor, this.definitionForDigest(asString(envelope.promptContractDigest)));
      const record = reusePlanRecord(rederived);
      requireAnalysis(record.digest === digests['reuse-plan'] && canonicalJson(stored) === record.json && envelope.reusePlanDigest === record.digest,
        'ANALYSIS_REUSE_PLAN_DRIFT', REUSE_PLAN_DRIFT_REASON);
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
      ...(intent.record.factualDecision === undefined ? {} : { factualDecision: intent.record.factualDecision as import('../factual-verification.js').FactualRecheckSelection }),
      planVersionId: version.planVersionId,
      planVersionOrdinal: version.ordinal,
      origin: origin.origin,
      startWhen: (parseCanonicalJson(asString(run.canonical_json)) as { startWhen?: 'now' | 'idle' }).startWhen ?? 'now',
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
      ...(providerPlan.webToolsBackend === undefined ? {} : { webToolsBackend: providerPlan.webToolsBackend, searchCredentialReference: providerPlan.searchCredentialReference! }), ...(providerPlan.webToolsFallback === undefined ? {} : { webToolsFallback: providerPlan.webToolsFallback }),
      providerResolutionPlanDigest: asString(digests['provider-resolution-plan']),
      credentialReference: providerPlan.remoteBinding.credentialReference,
      sourceDigest: (plan['manuscript-pin'] as { sourceDigest: string }).sourceDigest,
      // The deterministic fixture facts; `null` on the live route, which replays no fixture.
      route: this.#route,
      ...selectedMetadata,
      ...(retainedBinding === null ? {} : { retainedPolicyPin: retainedBinding.binding.policyPin }),
      ...(retainedPolicy === null ? {} : { retainedPolicy }),
      ...(localFixtureRuntime == null ? {} : { localFixtureRuntime }),
      productionBinding,
      artifactPin: { nativeCarrierSha256: artifactPin.nativeCarrierSha256, sidecarRevision: 2, sidecarSha256: artifactPin.sidecarSha256 },
      promptContractDigest: asString(envelope.promptContractDigest),
      behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
      ...(envelope.compositionVersion === 2 || envelope.compositionVersion === 3 || envelope.compositionVersion === 4 ? { compositionOptions: envelope.compositionOptions as CompositionOptions } : {}),
      assurancePromptContractDigest: frozenAssurancePromptContractDigest(plan['execution-plan'] as Record<string, unknown>),
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
  /**
   * 重新分析这段 names its paragraphs by block identity (Issue #423 review, P3-3): resolved here, as the Task is prepared, to the
   * range they hold in the working manuscript the Task Input checkpoint is about to pin. Every other request is as it came.
   */
  /** Whether the working manuscript holds, at `range`, the blocks the Task Input revision held there (P3-4). */
  #rangeStillHolds(bookId: string, checkpoint: { readonly manuscriptId: string; readonly revisionId: string }, range: BaselineAnalysisSelectedRange): boolean {
    const pinned = new Map(this.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId).map((block) => [block.position, block.blockId] as const));
    const working = new Map(this.readWorkingBlocks(this.#binding(bookId).branchId).map((block) => [block.position, block.blockId] as const));
    for (let position = range.startPosition; position <= range.endPosition; position += 1) {
      const blockId = pinned.get(position);
      if (blockId === undefined || working.get(position) !== blockId) return false;
    }
    return true;
  }

  #resolveSelectedBlocks(bookId: string, update: BaselineAnalysisUpdateRequest | AnalysisModeRequest | null): AnalysisModeRequest | null {
    const blocks = update !== null && 'selectedBlocks' in update ? update.selectedBlocks ?? null : null;
    if (update === null || blocks === null) return update === null ? null : { mode: update.mode, selectedRange: update.selectedRange };
    requireAnalysis(update.mode === 'reanalyze-range' && update.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
    const working = this.readWorkingBlocks(this.#binding(bookId).branchId);
    const from = working.find((block) => block.blockId === blocks.fromBlockId)?.position;
    const to = working.find((block) => block.blockId === blocks.toBlockId)?.position;
    requireAnalysis(from !== undefined && to !== undefined && from <= to, 'ANALYSIS_SELECTED_RANGE_INVALID', SELECTED_BLOCKS_GONE);
    return { mode: update.mode, selectedRange: { startPosition: from, endPosition: to } };
  }

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
        result: this.#unitResultOfRecord(record, unitOrdinal),
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

  /**
   * One technical turn by reference; from Issue #48 also which attempt of its unit it was and the payload digest the gate
   * admitted, and from Issue #286 the digest of the unit message it submitted and, on a safe retry's turn, the adaptation
   * it carried out.
   */
  recordSpan(
    attemptId: string,
    ordinal: number,
    span: { sessionId: string; startSeq: number; endSeq: number },
    unitOrdinal: number | null,
    turn: { attemptIndex: number; payloadDigest: string | null; unitMessageDigest: string; adaptationId: string | null },
  ): void {
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      spanId: randomUUID(), attemptId, ordinal, harnessSessionId: span.sessionId, startSeq: span.startSeq, endSeq: span.endSeq, unitOrdinal, recordedAt,
      attemptIndex: turn.attemptIndex, payloadDigest: turn.payloadDigest, unitMessageDigest: turn.unitMessageDigest,
      // Only a safe retry's turn names the adaptation it carried out.
      ...(turn.adaptationId === null ? {} : { adaptationId: turn.adaptationId }),
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
    const built = buildPlanAdaptationRecord({ adaptationId, ...input, attemptIndex: input.attemptIndex ?? 2, recordedAt });
    this.#db.prepare(
      `INSERT INTO analysis_plan_adaptations(adaptation_id, attempt_id, ordinal, unit_ordinal, adaptation_class, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(adaptationId, input.attemptId, input.ordinal, input.unitOrdinal, input.adaptationClass ?? 'safe-retry', recordedAt, built.json, built.digest);
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
    // Under ordinary-production the revision names the binding the Run's plan froze (Issue #811), not the one configured now.
    const produced = facts.productionBinding;
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
        // The contract the Run executed (Issue #901): a factual level's own; every other kind's, and an earlier plan's, as before.
        schemaDigest: this.definitionForRun(facts.runRecordId, facts.promptContractDigest).schemaDigest,
        ...(this.#definition.contractIdentity?.categoryConfiguration === undefined ? {} : { categoryConfigurationIdentity: canonicalJson(this.#definition.contractIdentity.categoryConfiguration) }),
        reducerDigest: this.#definition.reducerDigest,
        // The revision pins the route that produced it: the fixture on the deterministic route, the
        // live route's own identity when the Run actually transmitted.
        adapterPin: produced !== null
          ? { route: produced.route, model: produced.model, fixtureIdentity: null, fixtureSha256: null }
          : live === null
          ? { route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, fixtureIdentity: facts.route!.fixtureIdentity, fixtureSha256: facts.route!.fixtureSha256 }
          : { route: live.route, model: live.model, fixtureIdentity: null, fixtureSha256: null },
        bindingPin: {
          attemptId: input.attemptId,
          bindingDigest: input.bindingDigest,
          harnessSessionId: input.harnessSessionId,
          behaviorCompositionDigest: facts.behaviorCompositionDigest,
          promptContractDigest: facts.promptContractDigest,
        },
        policyPin: this.executionBindingOf(facts.runRecordId)?.binding.policyPin ?? (produced !== null
          ? { operationalScope: 'ordinary-production', providerProcessingVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' }
          : live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: facts.selectedPolicyIdentity?.providerProcessingVersion === 'v29' ? 'v29' : 'v1',
            activePolicySetVersion: facts.selectedPolicyIdentity?.activePolicySetVersion ?? ACTIVE_SET_VERSION, liveTransmissions: 0 }
          : { operationalScope: 'developer-live', providerProcessingVersion: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' }),
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
    sourceDigest: string;
    credentialReference: string;
    credentialOperationState: ModelCredentialOperationState;
  } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    this.#refreshClarificationDefinition();
    // Under ordinary production (Issue #811) the Book is the editor's own manuscript, of any source, and the connection whose
    // credential a plan names is the configured route's; under every other scope one of the five Public SampleBooks (exact sample1 or an
    // ADR 0091 work, Issue #990) and the official row.
    const live = this.#launch.live;
    const production = this.#launch.operationalScope === 'ordinary-production';
    const connectionId = live !== null && live.scope === 'ordinary-production' && live.route === 'opencode-go'
      ? 'main-editorial-opencode-go'
      : 'main-editorial-deepseek-v4-pro';
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
       LEFT JOIN model_service_connections connection ON connection.connection_id = ?
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY pin.sidecar_revision DESC`,
    ).get(...(checkpoint === undefined ? [connectionId, bookId] : [checkpoint.revisionId, connectionId, bookId])) as SqlRow | undefined;
    requireAnalysis(row !== undefined && (production
      ? typeof row.source_digest === 'string' && DIGEST_PATTERN.test(row.source_digest)
      : isPublicSampleBookSourceDigest(row.source_digest)),
    'ANALYSIS_LINEAGE_UNAVAILABLE', ANALYSIS_LINEAGE_UNAVAILABLE_REASON);
    requireAnalysis(row.native_carrier_sha256 === NATIVE_CARRIER_DIGEST && row.sidecar_revision === 2 && row.sidecar_sha256 === SIDECAR_DIGEST,
      'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案 Revision 2。');
    // Ordinary production with no connection yet: 模型服务需设置, naming both routes (Issue #811).
    requireAnalysis(!production || (typeof row.credential_operation_state === 'string' && typeof row.credential_reference === 'string'),
      'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
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
      sourceDigest: asString(row.source_digest),
      credentialReference: asString(row.credential_reference),
      credentialOperationState: state,
    };
  }

  /**
   * A plan may be frozen only under a verified launch policy that matches the bound launch: the
   * provider-free `development-ci` v1 denial, or the selected `developer-live` eligibility whose live
   * binding this store already holds. An unverified or mismatched policy freezes nothing.
   */
  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireAnalysis(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === this.#launch.operationalScope && policy.activePolicySetVersion === ACTIVE_SET_VERSION,
    'ANALYSIS_POLICY_UNAVAILABLE', '可信启动策略与已绑定的可信区间不一致。');
    if (this.#launch.operationalScope === 'ordinary-production') {
      requireAnalysis(this.#launch.live !== null, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
      requireAnalysis(policy.providerProcessing.version === ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION && policy.providerProcessing.decision === 'eligible-only' &&
        policy.providerProcessing.authorizedLiveTransmissionCount === 'bounded-by-run' && policy.providerProcessing.liveTransmissionAllowed === true &&
        policy.providerProcessing.bindingState === 'configured',
      'ANALYSIS_POLICY_UNAVAILABLE', `无法建立可信的 ordinary-production Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 记录。`);
      return;
    }
    if (this.#launch.live !== null) {
      requireAnalysis(policy.providerProcessing.version === DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION && policy.providerProcessing.decision === 'eligible-only' &&
        policy.providerProcessing.authorizedLiveTransmissionCount === 'bounded-by-run' && policy.providerProcessing.liveTransmissionAllowed === true,
      'ANALYSIS_POLICY_UNAVAILABLE', `无法建立可信的 developer-live Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 记录。`);
      return;
    }
    requireAnalysis(['v1', 'v29'].includes(policy.providerProcessing.version ?? '') && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 && policy.providerProcessing.liveTransmissionAllowed === false,
    'ANALYSIS_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing 拒绝记录。');
  }
}

/** The shared live admission of a planned Run's kind (Issue #429), on the Main Editorial Role its Execution Binding names. */
function plannedRunAdmission(...args: Parameters<typeof liveKindAdmission>): ReturnType<typeof liveKindAdmission> {
  const rule = liveKindAdmission(...args);
  return rule?.modelRole === 'Main Editorial Role' ? rule : null;
}

export { AnalysisError, isRecord };
