import { PlatformToolSession, platformToolModelProfile } from '../provider/platform-tool-session.js';
import { ResearchSnapshotCache } from '../provider/research-snapshot-cache.js';
import { researchSnapshotDigest, retainUnitEvidence, retainedPageOf, searchHitsOf, type RetainedPage, type RetainedUnit } from './factual-review-evidence.js';
import { factualFindingId, locatedUnitFindings } from './factual-review-reducers.js';
import { FACTUAL_REVIEW_KIND, type FactualReviewUnitResult } from './factual-review-contract.js';
import { FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, markInBookExactFetch, type FactualReviewUnitResultV2 } from './factual-review-contract-v2.js';
import { platformToolsFromProjection } from '../provider/search-service.js';
import { searchBackend, searchBackendConfigurationDigest } from '../provider/search-backends/index.js';
import { admitTicketHost } from '../../shared/network-denial.js';
import { PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS } from '../../shared/public-samplebooks.js';
import { randomUUID } from 'node:crypto';
import { backgroundAnalysisShare, backgroundShareFullReason } from '../background-analysis-enrollments.js';
import { BASELINE_ANALYSIS_KIND, LEARNING_INFLUENCE_STOP_SUMMARY, MODEL_SERVICE_SETUP_REQUIRED_REASON } from '../../shared/protocol.js';
import { liveKindAdmission, liveKindContractCategories, liveKindRule, kindLocalTools, type LiveKindRule } from './live-kind-admission.js';
import { RetrievalIndex } from '../retrieval/index.js';
import { prepareRetrievalResult, markRetrievalResult } from '../retrieval/result-validator.js';
import { liveMaterialContract } from '../task-material-references.js';
import { buildClarificationAnswerMessage } from '../provider/clarification-contract.js';
import type { AnalysisAssuranceSampleDispositionProjection, AnalysisGapProjection, AnalysisReusePlanUnitProjection, CoverageManifestProjection, CoverageManifestUnitProjection, ExecutionRouteId, LaunchPolicyProjection, ReviewScopePlanUnitProjection, RunAttemptState, RunReportStageId } from '../../shared/protocol.js';
import { PLATFORM_TOOL_CALL_PROGRESS, describeComposition, prepareExecution, type HarnessExecutionSpan, type HarnessSignal, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
  allowedProductionBindingOf,
  isOrdinaryProductionRuntime,
  type DeveloperLiveRuntime,
  type LiveRuntime,
  type OrdinaryProductionRuntime,
  type ConfiguredProviderBinding,
} from '../launch-policy.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { evaluateRunBudgetCeiling, totalTokens, type ClassifiedModelFailure, type RunBudgetCeiling, type UsageFacts } from '../provider/classification.js';
import { DeepSeekOpenAiCompatibleAdapter, OPENCODE_GO_ROUTE_PROFILE, PROVIDER_ROUTE_PROFILES, type ProviderRouteProfile } from '../provider/deepseek-adapter.js';
import { transmitOnce } from '../provider/live-transmission.js';
import { OPENCODE_GO_V41_FLASH_PROFILE, modelProfileFor, type ProviderModelProfile } from '../provider/model-profile.js';
import {
  LOCAL_DETERMINISTIC_MODEL,
  LOCAL_DETERMINISTIC_ROUTE,
  OPENCODE_GO_ROUTE,
  evaluateEgress,
  type EgressBindingFacts,
  type EgressCeilingState,
  type TransmitTicket,
} from '../provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter } from '../provider/local-deterministic-adapter.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { ProviderResultCache } from '../provider/provider-result-cache.js';
import {
  assuranceSamplingTurns,
  buildAssuranceSamplingMessage,
  drawAssuranceSample,
  parseAssuranceSamplingResult,
  type AssuranceSamplingParseFailureCode,
} from './assurance-sampling-contract.js';
import { canonicalRecord, sha256Hex } from './canonical.js';
import { assuranceContractMoved, CARRIED_STAGES, OUTCOME_UNKNOWN_NO_RESUME, RUN_IDLE_YIELD_LABEL, type BaselineAnalysisStore, type CarriedStages, type StageContinuation, type ExecutionBindingRecord, type ExecutionPlanFacts, type PredecessorUnitResult, type RunProgress, type RunProgressStage, type UnitCheckpoint, type UnitResultRecord } from './baseline-analysis-store.js';
import type { BaselineUnitResult } from './contract.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import { ExecutionAdmissionError } from './execution-error.js';
import { OUTCOME_UNKNOWN_NOT_RESENT, carriedOutcomeUnknownReason } from './outcome-unknown.js';
import { applyAssuranceSample, type AnalysisKindDefinition, type AnalysisReductionResult } from './kind-definition.js';
import { ASSURANCE_SAMPLING_REMOVED, SAFE_RETRY_WITHHELD, adaptationMode, assuranceSamplingKept } from './plan-edits.js';
import {
  CLARIFICATION_CANCELLED_ANSWERED,
  CLARIFICATION_CANCELLED_UNANSWERED,
  CLARIFICATION_ENDED_ANSWERED,
  CLARIFICATION_ENDED_UNANSWERED,
  CLARIFICATION_RECORD_GAP,
  awaitingClarificationDetail,
  parseModelClarification,
  type ClarificationFacts,
} from './clarifications.js';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  buildCrossUnitMessage,
  citedBlocksByUnit,
  crossUnitRequestDigest,
  parseCrossUnitResult,
  unitSetDigest,
  type CrossUnitResultParseFailureCode,
} from './cross-unit-contract.js';
import {
  CROSS_UNIT_NOT_RUN,
  assuranceSampleNotRun,
  assuranceSampleOutcome,
  type AssuranceSampleOutcome,
  type ClosedUnitOutcome,
  type CrossUnitOutcome,
  type GapUnitOutcome,
} from './reducers.js';
import { CARRIED_GAP_REASON, OUT_OF_SCOPE_GAP_REASON } from './reuse-plan.js';
import { SERIES_SCOPE_STOP_SUMMARY } from '../series-exclusions.js';
import { materialInterruptionMessage as referenceInterruptionMessage, materialInterruptionNextAction, type MaterialGuardRefusal } from '../task-material-references.js';
import {
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST,
  buildRunReportReflectionMessage,
  parseRunReportReflectionResult,
  type RunReportReflectionParseFailureCode,
} from './run-report-contract.js';
import {
  RUN_REPORT_NO_USAGE,
  buildRunReport,
  runReportAccounting,
  runReportReflectionNotRun,
  type RunReportAccounting,
  type RunReportFacts,
  type RunReportReflectionOutcome,
  type RunReportRevisionUsageStageId,
  type RunReportSpan,
  type RunReportUnitObservation,
  type RunReportUnitRow,
  type RunReportUsage,
} from './run-report.js';

/**
 * The execution owner: AI7 scheduler admission for one Run per service instance, the attempt
 * lifecycle, the immutable Execution Binding persisted before the first model call, the
 * PrimaryAgentHarness composition, the closed signal set, and finish. It reads only the frozen plan,
 * writes only append-only ledger rows, and never lets a DSH event become business truth.
 *
 * An update Run (Issue #93) submits only the units its verified reuse plan marks `recomputed`, in
 * manifest order, with the Run Source Scope admitting only their messages; every `reused` unit is
 * copied from the predecessor revision by lineage with its source ranges remapped onto the new
 * unit's block identities, and the reducers run over the complete new unit set.
 *
 * The one declared Plan Adaptation (Issue #48, `safe-retry`): when a unit's first request fails with
 * a retry-safe classification, the owner records the adaptation durably, then resubmits the
 * byte-identical unit message once through the same Egress Gate evaluation inside the unchanged
 * Execution Binding and envelope; the unit settles from the retry's outcome and both attempts count
 * as usage. A non-retry-safe failure, an interruption, or an ambiguous turn is never retried.
 *
 * One owner serves every ledger (Issue #417). `admitAndDispatch` takes the ledger of the Run it is
 * handed — the baseline ledger it was constructed with when none is named — and the Run in flight
 * carries that ledger to every write it makes; a Review Run's drive loop hands it its category Tasks
 * one after another.
 *
 * The owner is the instance's concurrency governor (Issue #49, plan slice S14; ADR 0021, V2-UX-CONC-007):
 * up to `capacity` Runs execute at once, across Books, each with its own attempt, Session, progress, usage,
 * ceiling and outcome — nothing one Run holds is another's. A start the governor has no place for waits,
 * authorized and not yet admitted — 等待运行名额 — and is admitted in its turn as a place frees.
 */
export { ExecutionAdmissionError };

/** Deliverable guards supply their own stop reason; existing material and Series guard semantics stay with their owners. */
function materialInterruptionMessage(refusal: MaterialGuardRefusal): string {
  return refusal.code === 'REVIEW_DELIVERABLE_CHANGED' ? refusal.message : referenceInterruptionMessage(refusal);
}

/**
 * How many Runs the governor executes at once (Issue #49, S14; ADR 0021): two. Under development-ci either place takes any
 * Run. Live launches also admit foreground Runs across Books into both places. Background enrollments remain bounded by
 * their share (`executionBackgroundShare`: v26's projected default, else capacity − 1) and never reserve an otherwise free
 * foreground place.
 */
export const EXECUTION_RUN_CAPACITY = 2;
/** v26 supplies the configured default; predecessors retain their existing share. */
export function executionBackgroundShare(policy: LaunchPolicyProjection | undefined, capacity: number): number {
  return policy?.providerProcessing.execution?.backgroundShare.default ?? backgroundAnalysisShare(capacity);
}

/** Predecessors keep the single safe retry; policy projection cannot widen the declared adaptation. */
export function rateLimitRetryAllowed(policy: LaunchPolicyProjection): boolean {
  return (policy.providerProcessing.transport?.rateLimitRetry.maxRetries ?? 1) > 0;
}
/** Foreground Runs may use the whole governor (ADR 0095 §2); the background share is unchanged. */
const LIVE_FOREGROUND_PLACES = EXECUTION_RUN_CAPACITY;
/** Waiting units retain their records and hold no governor place; all other admission semantics stay with the governor. */
export function holdsGovernorSlot(state: string): boolean { return state !== 'awaiting-clarification'; }
/** A bounded waiting set; excess starts are recorded as refused before dispatch, never silently dropped. */
export const EXECUTION_WAITING_CAPACITY = 64;
export { remapReusedResult } from './reused-result.js';

export interface ExecutionOwnerDependencies {
  /** The Run's disposable retrieval index over exactly its pinned sources (#893); a manuscript-only index when absent. */
  readonly retrievalIndex?: (runRecordId: string, ledger: BaselineAnalysisStore) => RetrievalIndex;
  /** Trusted composition may lower, but never exceed, the fixed waiting-memory bound. */
  readonly waitingCapacity?: number;
  /** The baseline kind's ledger: the one a dispatch that names no ledger runs against. */
  readonly ledger: BaselineAnalysisStore;
  /** How many Runs execute at once; `EXECUTION_RUN_CAPACITY` when absent, and exactly that under a live launch (Issue #864). */
  readonly capacity?: number;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly fixture: ResolvedModelFixture | null;
  readonly secretResolver: SecretResolver;
  /** The developer-live launch facts and captured transport; present exactly when the policy bound developer-live. */
  readonly developerLive?: DeveloperLiveRuntime | null;
  /**
   * The ordinary-production transport (Issue #811); present exactly when the policy bound ordinary-production. Under it a Run
   * takes the route its plan froze from the editor's configured binding, and no cache, ledger or validation exists.
   */
  readonly production?: OrdinaryProductionRuntime | null;
  /**
   * The launch policy as it stands now (Issue #811): under ordinary-production it follows the editor's model-service settings.
   * Absent, `launchPolicy` is the launch's for good, as under every other scope.
   */
  readonly currentLaunchPolicy?: () => LaunchPolicyProjection;
  /** Re-resolve the verified policy for an authorized production Run's frozen connection, independently of settings. */
  readonly productionPolicyFor?: (binding: ConfiguredProviderBinding) => Promise<LaunchPolicyProjection>;
  /** J-10's unit hold (Issue #422); absent in every other launch, where a unit settles as soon as its turn returns. */
  readonly unitHold?: UnitHold | null;
  /**
   * The service suite's hold around the cross-unit reduction and each sampling turn (Issue #422, Issue #51): awaited once
   * the turn has come back and before its result is read, so a cancellation or a pause can arrive while that turn is out.
   * Absent in every launch.
   */
  readonly stageHold?: ((stage: 'cross-unit-reduction' | 'assurance-sampling') => Promise<void>) | null;
  /**
   * The current-read guard (Issue #64, S29b; V2-UX-SER-023, SER-028): asked before each reading range of a Run, and once more
   * before what follows them, whether a Series Retrieval Exclusion in force now reaches the Series material the Run's plan froze.
   * A non-`null` answer names what is excluded, and the Run stops there — its Plan Envelope and authorization predate the
   * exclusion, and that never lets a further read go on. Absent, nothing is guarded: no Series material exists for the Run.
   */
  readonly seriesScopeGuard?: ((runRecordId: string) => string | null) | null;
  /**
   * The current-read guard over 本社审阅偏好 (Issue #912; LAUD-008), asked with the one above: a non-`null` answer names the
   * pinned version a Learning Material behind it was 停止今后使用 from, and the Run stops there for revalidation — what it
   * read kept, nothing more sent. Absent, nothing is guarded: no Run reads a 本社审阅偏好 version.
   */
  readonly influenceGuard?: ((runRecordId: string) => string | null) | null;
  /** Re-check the consuming ledger's frozen materials before admission and every further model step. */
  readonly materialGuard?: ((runRecordId: string, ledger: BaselineAnalysisStore) => MaterialGuardRefusal | null) | null;
  /**
   * Where a research unit's retained external evidence is kept the moment the unit settles (Issue #425, S70; SRC-013): the
   * store's research evidence ledger. Absent, nothing is retained.
   */
  readonly researchEvidence?: ((input: { bookId: string; runRecordId: string; unitOrdinal: number; backendId: string | null; unit: RetainedUnit }) => void) | null;
  /**
   * The level a 事实核查 Run executes under, decided once as it starts (Issue #901; EASSURE-002): the store records the planned
   * level and, when this device reads offline then, the effective 快速整理 with its disclosure. Absent, nothing is recorded.
   */
  readonly factualRunStart?: ((input: { bookId: string; runRecordId: string; taskIntentId: string }) => void) | null;
}

/**
 * J-10's unit hold (Issue #422, plan slice S76a): once a unit's turn has come back, the owner asks whether the unit
 * may settle, given how many units already have, and waits until it may. The unit is in flight all that time, which
 * is what lets the Journey cancel a Run with a unit under way and watch 正在取消 until that unit finishes. A
 * cancellation does not end this test-only post-response hold; an interruption does, so a held Run
 * never keeps AI7 from closing.
 */
export type UnitHold = (unitsSettled: number, interrupted: () => boolean) => Promise<void>;

interface ActiveRun {
  readonly runRecordId: string;
  /** The ledger this Run was dispatched from; every read and write of the Run goes through it. */
  readonly ledger: BaselineAnalysisStore;
  readonly progress: {
    unitsTotal: number;
    unitsSettled: number;
    currentUnitOrdinal: number | null;
    currentUnitStartedAt: string | null;
    attemptState: RunAttemptState | null;
    completedAttempts: number;
    longestSettledUnitMs: number | null;
    stage: RunProgressStage;
  };
  /**
   * The live adapter's transmission counter, read on demand; `null` on the deterministic route, which
   * has no transport to enter. It is a function rather than a number because the counter moves while
   * the execution owner is parked on one `await`.
   */
  transmissions: (() => number) | null;
  /** What that counter read when the attempt in flight was dispatched. */
  transmissionsAtDispatch: number;
  /**
   * The turn in flight as a development validation step (Issue #808): `unit-<n>`, `reduction`, `sampling-<k>-unit-<n>` or
   * `reflection`, set before each turn is submitted. The transport files a live call under the Task mode and this, which no
   * import, Run or attempt renumbers, so evidence of one turn is never mistaken for another's.
   */
  validationStep: string;
  harness: PrimaryAgentHarnessHandle | null;
  readonly requestAbort: AbortController;
  interrupted: boolean;
  /**
   * 取消任务 (Issue #422): the editor cancelled the Run and `cancelling` is recorded. It stops further units
   * and aborts a model request in flight. A sent request settles as its own outcome-unknown gap.
   */
  cancelRequested: boolean;
  /** 暂停 (Issue #422, S76b): read between units like a cancellation; the Run then waits, keeping what it read. */
  pauseRequested: boolean;
  idleYieldRequested: boolean;
  /**
   * Whether AI7 stopping under this Run leaves it 可续行 rather than ending it (CONT-014): a baseline analysis Run, whose
   * settled units are kept as they settle. A review category's Run keeps ending 已中断, which its drive loop reads.
   */
  readonly resumableOnInterrupt: boolean;
  done: Promise<void>;
}

/** What 续行 goes on from: the attempt and Execution Binding the Run persisted, when it had persisted them. */
type Continuation = { readonly stored: ReturnType<BaselineAnalysisStore['executionBindingOf']> };

/**
 * What the attempt in flight is doing, at the instant a reader asks. `retrying` and `null` are
 * recorded by the execution loop, which knows them; the step from `dispatched` to `awaiting-response`
 * is derived, because nothing in this owner runs between handing a unit to the harness and the turn
 * resolving. The live adapter increments its own counter as it enters the transport, so a counter
 * past this attempt's baseline is exactly the fact that the request is out and an answer is awaited.
 * The deterministic route stays `dispatched`: it waits for no model.
 */
function attemptStateOf(active: ActiveRun): RunAttemptState | null {
  if (active.progress.attemptState !== 'dispatched') return active.progress.attemptState;
  const transmissions = active.transmissions?.() ?? 0;
  return transmissions > active.transmissionsAtDispatch ? 'awaiting-response' : 'dispatched';
}

const SAFE_NEXT_ACTIONS = {
  completed: '检查结果集修订版的四个状态轴、缺口与冲突清单；稿件变化后可用「同步到当前稿件」，或用「重新分析所选范围」/「重新分析全书」发起新的授权运行，追加后继修订版。',
  'completed-with-gaps': '逐项查看缺口单元与冲突清单；缺口单元在任一更新方式的新授权运行中都会重算，结果集修订版本身不会改写。',
  failed: '核对运行失败原因；修复后可通过分析更新操作重新准备并授权新的运行。',
  interrupted: '运行已在派发后中断；已完成单元的结果与缺口均已保留，续行需要通过分析更新操作发起新的授权运行。',
  cancelled: '运行已按你的要求取消；已完成单元的结果与缺口均已保留，没有读到的单元记为未尝试。需要时可用分析更新操作发起新的授权运行。',
} as const;

/** 取消任务 before the Run began its units (CTRL-008): nothing was sent, so there is nothing to keep but the record. */
export const CANCELLED_BEFORE_UNITS = '运行在开始阅读任何阅读范围之前已按你的要求取消；没有发送任何内容，也没有形成结果集修订版。' as const;

/**
 * 取消任务 on a Run no execution of this service holds: one AI7 left behind when it last closed. Nothing of it is
 * running, so it is settled at once; the results of its finished units lived only in the Run it lost, and the
 * record says so rather than claiming a revision it never formed.
 */
export const CANCELLED_WITHOUT_EXECUTION = '运行已按你的要求取消。它还没有读完任何阅读范围，因此没有形成结果集修订版；此后没有再发送任何内容。' as const;

/** A stopped Run whose kept progress could not be gathered into its revision is still cancelled, and says so. */
export const CANCELLED_WITHOUT_REVISION = '运行已按你的要求取消；已保存的阅读进度这一次没能整理成结果集修订版，因此没有形成修订版。此后没有再发送任何内容。' as const;

/**
 * 暂停's own words (Issue #422, S76b; CTRL-001): where the Run stopped, what it kept, and what 续行 does — from the
 * next range, or, once every range is read, the reduction and the sample after them.
 */
export function pausedDetail(settled: number, total: number): string {
  return settled >= total
    ? `已暂停：全部 ${total} 个阅读范围都已读完，结果都已保存。点「续行」只处理尚未完成的步骤，已保存的步骤不会重做。`
    : `已在阅读范围之间暂停：已读完 ${settled} / ${total} 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读。`;
}

/** AI7 stopping under a Run it can continue (CONT-014): nothing more runs, and nothing is sent until 续行. */
export function resumableDetail(settled: number, total: number): string {
  return settled >= total
    ? `AI7 关闭时这项任务正在运行：全部 ${total} 个阅读范围都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。`
    : `AI7 关闭时这项任务正在运行：已读完 ${settled} / ${total} 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。`;
}

/** A pause recorded for a Run nothing executes: its boundary is reached already. */
export const PAUSED_WITHOUT_EXECUTION = 'AI7 没有在运行这项任务；已读完的阅读范围都已保存，任务已暂停。' as const;

/**
 * 模型服务账户限额 (Issue #51, S16b; V2-UX-MODEL-018, RUN-012): the provider refused on the account's limit, so the Run
 * stops at this boundary — nothing more is sent, what it read is kept — and the same Run goes on with 续行 once the
 * provider-side condition clears. Never a retry, a fallback, or a second model; never 任务已中断 · 可续行's words.
 */
/** A range the account limit refused that the Run's end left unread again (Issue #51, S16b): its attempt was sent. */
export const ACCOUNT_LIMIT_CANCELLED_UNREAD = '任务取消时它还没有再读' as const;
export const ACCOUNT_LIMIT_ENDED_UNREAD = '任务结束时它还没有再读' as const;

export function accountLimitDetail(settled: number, total: number): string {
  return settled >= total
    ? `模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。全部 ${total} 个阅读范围都已读完，结果都已保存。处理好模型服务、限额解除后点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。`
    : `模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。已读完 ${settled} / ${total} 个阅读范围，结果都已保存。处理好模型服务、限额解除后点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。`;
}

// 结果待确认's words (Issue #51, S16c; Issue #757) live in `./outcome-unknown.js`, which the ledger reads too.
export { OUTCOME_UNKNOWN_CARRIED, OUTCOME_UNKNOWN_NOT_RESENT, carriedOutcomeUnknownReason } from './outcome-unknown.js';

/** The reduction's, a sample's or the reflection's own words when its turn's result cannot be known (Issue #51, S16c). */
export function ambiguousTurnReason(signals: ReadonlyArray<HarnessSignal>): string | null {
  const ambiguous = signals.find((signal) => signal.kind === 'ambiguous');
  if (ambiguous?.kind !== 'ambiguous' || ambiguous.failure === undefined) return null;
  return `${ambiguous.failure.reason}（${ambiguous.failure.code}）；${OUTCOME_UNKNOWN_NOT_RESENT}。`;
}

/** The disclosure of a cross-unit reduction, a sample, and a reflection the editor's cancellation stopped. */
export const CROSS_UNIT_CANCELLED = '运行已按你的要求取消，跨单元归纳未发起。' as const;
export const ASSURANCE_SAMPLING_CANCELLED = '运行已按你的要求取消，保证抽样未发起。' as const;
export const RUN_REPORT_REFLECTION_CANCELLED = '运行已按你的要求取消，运行反思未发起。' as const;

/**
 * The two interruptions the closed CHECK sets admit only as `interrupted`, with the distinction carried in the state
 * detail, the outcome summary, and the safe next action (settlement l). Run Budget Ceiling Reached is no new result type
 * either (DOM:100): its outcome also names the stop itself (Issue #51, S16a), and its way on is 调整预算并重做 — or,
 * where the developer-live launch sets the ceiling, a launch with a higher one.
 */
const LIVE_INTERRUPTIONS = {
  'run-budget-ceiling-reached': {
    detail: '任务运行预算上限已达到；已完成单元的结果与缺口均已保留，未再发起任何传输。',
    summary: 'Run Budget Ceiling Reached：运行在达到任务运行预算上限时停止，部分结果集修订版已保留。',
    safeNextAction: '查看已保留的部分结果与缺口；如需继续，请以更高的 --run-budget-ceiling 重新启动并通过分析更新操作发起新的授权运行。',
  },
  'provider-account-limit': {
    detail: 'Provider Account Limit：模型服务账户限额结束了本次运行；没有重试、回退或第二个模型。',
    summary: 'Provider Account Limit：模型服务账户限额结束了运行，部分结果集修订版已保留。',
    safeNextAction: '待模型服务账户限额窗口恢复后，通过分析更新操作发起新的授权运行；本次运行不会自动重试，也不会改用其它模型。',
  },
  // A Series Retrieval Exclusion recorded while the Run read (Issue #64, S29b; SER-023 to SER-025): it stops before the next
  // range, keeps what it read, and goes on only through a revised plan and a new authorization.
  'series-retrieval-scope-changed': {
    detail: '书系检索范围已变化：这次运行所依据的书系材料已排除在书系检索之外；已完成单元的结果与缺口均已保留，未再发起任何传输。',
    summary: SERIES_SCOPE_STOP_SUMMARY,
    safeNextAction: '修改计划并重新授权，或取消任务；这次运行不能续行、重试，也不会改用别的材料。',
  },
  // A Learning Material behind the Run's pinned 本社审阅偏好 version was 停止今后使用 while it read (Issue #912; LAUD-008): it
  // stops before the next range and goes on only as a new Task without that influence.
  'learning-influence-withdrawn': {
    detail: '本社审阅偏好已停止使用：这次运行参考的偏好版本中有学习材料已停止今后使用；已完成单元的结果与缺口均已保留，未再发起任何传输。',
    summary: LEARNING_INFLUENCE_STOP_SUMMARY,
    safeNextAction: '重新执行（不含该影响），或取消任务；这次运行不能续行、重试，也不会改用别的偏好版本。',
  },
  'material-reference-changed': {
    detail: '参考资料在任务运行中已不可用，任务已中断；已完成的单元保留。',
    summary: '参考资料在任务运行中已不可用，任务已中断；已完成的单元保留。',
    safeNextAction: '核对参考资料，重新准备计划并授权；已完成的单元保留。',
  },
} as const;

type LiveInterruption = keyof typeof LIVE_INTERRUPTIONS;

/**
 * 调整预算并重做 (Issue #51, S16a; V2-UX-MODEL-016, MODEL-017): the way on from a ceiling the editor set in the plan. The Run
 * cannot go on — neither 续行 nor 重试 — so a new Task carries what it read under a ceiling raised or removed.
 */
export const BUDGET_REACHED_NEXT_ACTION = '点「调整预算并重做」：在新任务的计划里提高或去掉预算上限，沿用这次已读完的阅读范围接着读其余的；这次运行不能续行或重试。' as const;
/** A safe retry a Series Retrieval Exclusion stopped (Issue #64, S29b): the unit's first failure is its gap, nothing more is sent. */
export const SAFE_RETRY_SCOPE_CHANGED = '书系检索范围已变化，没有再试一次' as const;
/** A safe retry the spent ceiling stopped (Issue #51, S16a): the unit's first failure is its gap, and nothing more is sent. */
export const SAFE_RETRY_BUDGET_REACHED = '任务运行预算已达上限，没有再试一次' as const;
/**
 * A safe retry that would not repeat its first attempt's unit message byte for byte (Issue #286): it is not a safe retry, so
 * it is not sent, and the unit's first failure is its gap.
 */
export const SAFE_RETRY_NOT_REPEATED = '要重发的稿件与第 1 次发出的不同，没有再试一次' as const;
/** The reduction and the sample a ceiling reached after the last unit stops, in the Run's own words. */
export const CROSS_UNIT_BUDGET_REACHED = '任务运行预算上限已达到；跨单元归纳未派发。' as const;
export const ASSURANCE_SAMPLING_BUDGET_REACHED = '任务运行预算上限已达到，保证抽样未发起。' as const;

/**
 * What an editor reads when a unit closed as a gap the model itself produced, as opposed to one the
 * transport or the Run produced. Both readings answer the same two questions, because they are the
 * only two an editor can act on: what came back, and whether re-running this unit is likely to help.
 * The first live Run failed three of eight units with a reason that answered neither (#306, #307).
 *
 * They are module functions rather than expressions at the call site so that the exact text an editor
 * sees can be asserted without a Run, a Provider, or a manuscript.
 */
export function emptyAnswerGapReason(reasoningPresent: boolean): string {
  // Reasoning without an answer is the shape the first live Run produced: the model worked and lost
  // the answer, which is worth repeating, and is not a fault of the manuscript or of the contract.
  return reasoningPresent
    ? '模型完成了推理，但没有给出答案：答案通道为空，推理通道有内容。这不是稿件或契约的问题；重新分析本单元通常会得到结果。'
    : '模型没有给出答案：答案通道与推理通道都为空。重新分析本单元可能有帮助；如反复出现，请检查模型服务状态。';
}

/**
 * The reading for an answer that came back and did not parse. `answerText` is taken only to be
 * measured: its length is the whole of what an editor learns about it, because the answer is model
 * output over manuscript content and no part of it may reach a gap reason, a log, or a report.
 * Characters are counted as code points — `src/service/analysis/` exports no grapheme counter, and
 * UTF-16 units would report a number no reader could recognize as a count of characters.
 */
export function unparsableAnswerGapReason(code: string, detail: string, answerText: string): string {
  return `单元结果不符合契约 v1（${code}）：${detail}模型返回了 ${[...answerText].length} 个字符，其中没有可解析的单元结果。重新分析本单元可能有帮助。`;
}

/**
 * The same two readings for the cross-unit reduction, which fails as a whole rather than per unit:
 * every unit result is already settled and stays settled, so what an editor learns is that this one
 * further step produced nothing and that the unit results below it are unaffected.
 */
export function crossUnitEmptyAnswerGapReason(reasoningPresent: boolean): string {
  return reasoningPresent
    ? '跨单元归纳未闭合：模型完成了推理，但答案通道为空。各单元结果不受影响；重新发起分析通常会得到跨单元结果。'
    : '跨单元归纳未闭合：模型的答案通道与推理通道都为空。各单元结果不受影响；如反复出现，请检查模型服务状态。';
}

export function unparsableCrossUnitAnswerGapReason(code: CrossUnitResultParseFailureCode | string, detail: string, answerText: string): string {
  return `跨单元归纳结果不符合契约 v1（${code}）：${detail}模型返回了 ${[...answerText].length} 个字符，其中没有可解析的跨单元结果。各单元结果不受影响。`;
}

/**
 * The same two readings for one assurance sampling turn, which fails per anchor unit rather than as a
 * whole: the findings themselves are already settled and stay settled, the other units' turns still
 * answer, and what this one unit's sampled findings lost is a disposition, not their place in the
 * Result Set. Every sampling gap is stated as one of these, prefixed by the unit it belongs to.
 */
export function assuranceSamplingTurnGapReason(unitOrdinal: number, detail: string): string {
  return `单元 ${unitOrdinal} 的保证抽样未闭合：${detail}这些发现本身不受影响，其余单元的判定照常记录。`;
}

export function assuranceSamplingEmptyAnswerGapReason(reasoningPresent: boolean): string {
  return reasoningPresent
    ? '模型完成了推理，但答案通道为空。'
    : '模型的答案通道与推理通道都为空。';
}

export function unparsableAssuranceSamplingAnswerGapReason(code: AssuranceSamplingParseFailureCode, detail: string, answerText: string): string {
  return `判定结果不符合契约 v1（${code}）：${detail}模型返回了 ${[...answerText].length} 个字符，其中没有可解析的判定结果。`;
}

/**
 * The transmittable set under developer-live: the five Public SampleBooks — exact `sample1` and the four ADR 0091 works
 * (Provider Processing v24, Issue #990) — and nothing else. ADR 0065 admits only Owner-designated Public SampleBooks, and
 * the set is the one the analysis lineage check reads. Any other Book refuses before dispatch rather than at the gate, so
 * no unadmitted manuscript is ever assembled into a payload at all.
 */
export const DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS: ReadonlySet<string> = PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS;

export class BaselineAnalysisExecutionOwner {
  readonly #deps: ExecutionOwnerDependencies;
  readonly #broker: CredentialBroker;
  readonly #capacity: number;
  readonly #waitingCapacity: number;
  /** Runs still unwinding stay here; only those holding a governor place count toward `#capacity` (Issues #49, #865). */
  readonly #active = new Map<string, ActiveRun>();
  /** Of those, the Runs a 后台分析登记 started (Issue #864): under a live launch the editor's Runs never take their place. */
  readonly #backgroundActive = new Set<string>();
  /**
   * The Runs authorized and waiting on the governor (Issue #49, S14; CONC-007), in the order they were started: each is
   * admitted, in its turn, as a place frees. Their ledger records them `authorized` until then, so a service that
   * stops leaves those records recoverable; restart blocks them before dispatch and requires a fresh explicit start.
   */
  readonly #queued: Array<{ runRecordId: string; ledger: BaselineAnalysisStore }> = [];
  #disposed = false;
  readonly #stateWaiters = new Set<() => void>();
  #backgroundIdle = true;
  #idleConfirmed = false;
  #foregroundPlaceWaiters = 0;
  readonly #yielded = new Map<string, BaselineAnalysisStore>();

  /** The existing dispatcher supplies application facts, never manuscript text. */
  setBackgroundIdle(idle: boolean): void {
    this.#backgroundIdle = idle;
    this.#idleConfirmed = true;
    // A background Run yields only while every place is taken and an editor-started Run waits for one (#1089; ADR 0095 §3).
    if (!idle && this.busy && (this.#foregroundPlaceWaiters > 0 || this.#queued.some(({ runRecordId, ledger }) => {
      const facts = ledger.loadExecutionPlan(runRecordId);
      return facts.origin !== 'background-analysis-enrollment' && facts.startWhen !== 'idle';
    }))) {
      for (const runRecordId of this.#backgroundActive) {
        const active = this.#active.get(runRecordId);
        if (active === undefined || active.pauseRequested || active.cancelRequested || active.progress.stage !== 'units') continue;
        active.ledger.recordRunState(runRecordId, 'pausing', { detail: RUN_IDLE_YIELD_LABEL, idleYield: true });
        this.#yielded.set(runRecordId, active.ledger);
        this.pauseRun(runRecordId, active.ledger, 'idle-yield');
      }
    }
    this.#drain();
    if (idle) {
      for (const [runRecordId, ledger] of this.#yielded) {
        const state = ledger.currentRunState(runRecordId);
        if (this.#active.has(runRecordId)) continue;
        if (state !== 'paused') { this.#yielded.delete(runRecordId); continue; }
        if (!this.#placeForRun(runRecordId, ledger)) break;
        this.#yielded.delete(runRecordId);
        try { this.admitAndDispatch(runRecordId, ledger, { resume: true }); } catch { /* Existing continuation guards retain the pause. */ }
      }
    }
    this.#changed();
  }

  /**
   * Stopped Runs whose cancellation waits for a place to finish them (Issue #422, S76b), each with what it reads
   * meanwhile: stopped between two ranges, with what it kept.
   */
  readonly #pendingCancels: Array<{ runRecordId: string; ledger: BaselineAnalysisStore; progress: RunProgress }> = [];
  /** Runs the editor answered while every place was taken (Issue #422, S76d): each goes on once one frees. */
  readonly #pendingAnswers: Array<{ runRecordId: string; ledger: BaselineAnalysisStore }> = [];

  constructor(deps: ExecutionOwnerDependencies) {
    // The developer-live runtime and the bound scope are one fact: a developer-live launch that reached this owner
    // without its launch facts and captured transport could never enforce the ceiling or the cache, and a
    // runtime under any other scope would be a transport nothing may use. The same holds for ordinary production's.
    const developerLive = deps.developerLive ?? null;
    const production = deps.production ?? null;
    if ((deps.launchPolicy.operationalScope === 'developer-live') !== (developerLive !== null) ||
        (deps.launchPolicy.operationalScope === 'ordinary-production') !== (production !== null)) {
      throw new ExecutionAdmissionError('EXECUTION_DEVELOPER_LIVE_RUNTIME_MISMATCH', '开发者实时运行时与已绑定的可信区间不一致。');
    }
    const live = developerLive ?? production;
    this.#deps = deps;
    // Under ordinary production the broker never reads a development Credential Reference (Issue #811).
    this.#broker = new CredentialBroker(deps.secretResolver, { developmentReferences: production !== null ? 'refused' : 'admitted' });
    const capacity = deps.capacity ?? EXECUTION_RUN_CAPACITY;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || (live !== null && capacity !== EXECUTION_RUN_CAPACITY)) {
      throw new ExecutionAdmissionError('EXECUTION_CAPACITY_INVALID', '运行名额设置无效。');
    }
    this.#capacity = capacity;
    const waitingCapacity = deps.waitingCapacity ?? EXECUTION_WAITING_CAPACITY;
    if (!Number.isSafeInteger(waitingCapacity) || waitingCapacity < 1 || waitingCapacity > EXECUTION_WAITING_CAPACITY) {
      throw new ExecutionAdmissionError('EXECUTION_CAPACITY_INVALID', '等待运行的名额设置无效。');
    }
    this.#waitingCapacity = waitingCapacity;
  }

  async whenBackgroundIdle(): Promise<void> {
    while (!this.#disposed && (!this.#idleConfirmed || !this.#backgroundIdle)) {
      await new Promise<void>((resolve) => this.#stateWaiters.add(resolve));
    }
  }

  #changed(): void {
    for (const resolve of this.#stateWaiters) resolve();
    this.#stateWaiters.clear();
  }

  /** The live runtime this launch carries: developer-live's or ordinary production's; `null` under development-ci. */
  #live(): LiveRuntime | null {
    return this.#deps.developerLive ?? this.#deps.production ?? null;
  }

  /** The launch policy as it stands now: under ordinary-production it follows the editor's settings (Issue #811). */
  #policy(): LaunchPolicyProjection {
    return this.#deps.currentLaunchPolicy?.() ?? this.#deps.launchPolicy;
  }

  progressFor(runRecordId: string): RunProgress | null {
    const active = this.#active.get(runRecordId);
    if (active !== undefined) return { ...active.progress, attemptState: attemptStateOf(active) };
    // A stopped Run whose cancellation waits for a place is held as well: every read has it 正在取消 with what it
    // kept, never as a Run nothing holds (Issue #422, S76b; CTRL-005).
    return this.#pendingCancels.find((entry) => entry.runRecordId === runRecordId)?.progress ?? null;
  }

  /**
   * Whether this launch has a route that executes a Run at all (Issue #95, S39): the developer-live route, or the J-04 model
   * adapter's local deterministic one. Without either every start is blocked before dispatch, so 后台分析登记 starts nothing.
   */
  get routeExecutable(): boolean {
    return !this.#disposed && (this.#live() !== null || this.#deps.fixture !== null);
  }

  /**
   * Whether the governor has no place for a Run the editor starts now (Issue #49, S14): as many Runs execute as it holds, or —
   * under a live launch — the editor's Runs hold every foreground place (Issue #864; all of them since #1080). A start then
   * waits in its queue (`admitOrQueue`); a Review Run's recorded approval, a quick start and a 续行 wait for a place with their
   * reasons.
   */
  get busy(): boolean {
    const occupying = this.#occupiedPlaces();
    return occupying.length >= this.#capacity || (this.#live() !== null &&
      occupying.filter((run) => !this.#backgroundActive.has(run.runRecordId)).length >= LIVE_FOREGROUND_PLACES);
  }

  /** Whether every place is taken (Issue #864): a Run a 后台分析登记 starts needs a free place, within its share. */
  get full(): boolean {
    return this.#occupiedPlaces().length >= this.#capacity;
  }

  /** The same waiting-state predicate governs total, foreground and background admission (Issues #864, #865). */
  #occupiedPlaces(): readonly ActiveRun[] {
    return [...this.#active.values()].filter((run) => holdsGovernorSlot(run.ledger.currentRunState(run.runRecordId)));
  }

  /** Starts and continuations consume the same origin's share; a waiting Run owns no place (Issue #864 revision 5). */
  #placeForOrigin(origin: ExecutionPlanFacts['origin']): boolean {
    return origin === 'background-analysis-enrollment'
      ? this.#backgroundIdle && !this.full && this.#occupiedPlaces().filter((run) => this.#backgroundActive.has(run.runRecordId)).length < executionBackgroundShare(this.#policy(), this.#capacity)
      : !this.busy;
  }

  #placeForRun(runRecordId: string, ledger: BaselineAnalysisStore): boolean {
    const facts = ledger.loadExecutionPlan(runRecordId);
    return facts.startWhen === 'idle'
      ? this.#idleConfirmed && this.#placeForOrigin('background-analysis-enrollment')
      : this.#placeForOrigin(facts.origin);
  }

  #placeForCancellation(runRecordId: string, ledger: BaselineAnalysisStore): boolean {
    const facts = ledger.loadExecutionPlan(runRecordId);
    return facts.origin === 'background-analysis-enrollment' || facts.startWhen === 'idle'
      ? !this.full && this.#occupiedPlaces().filter((run) => this.#backgroundActive.has(run.runRecordId)).length < executionBackgroundShare(this.#policy(), this.#capacity)
      : !this.busy;
  }

  /** Whether nothing runs, waits for a place, or waits to finish its cancellation: no Run will write until another starts. */
  get idle(): boolean {
    return this.#active.size === 0 && this.#queued.length === 0 && this.#pendingCancels.length === 0;
  }

  /** How many Runs execute at once. */
  get capacity(): number {
    return this.#capacity;
  }

  /** A queued Run's place in the governor's queue, first being 1; `null` for any Run not waiting there. */
  queuePosition(runRecordId: string): number | null {
    const index = this.#queued.findIndex((entry) => entry.runRecordId === runRecordId);
    return index < 0 ? null : index + 1;
  }

  /**
   * A start the editor just authorized (Issue #49, S14; CONC-007): admitted at once while the governor has a place and
   * no Run waits before it, else queued — `authorized` in its ledger, read as 等待运行名额 — and admitted in its turn.
   */
  admitOrQueue(
    runRecordId: string,
    ledger: BaselineAnalysisStore = this.#deps.ledger,
    /** The 后台分析登记 dispatcher's start takes the background place (Issue #864); its plan's origin is checked again at admission. */
    origin: 'foreground' | 'background' = 'foreground',
  ): 'admitted' | 'queued' {
    // AI7 is closing: the start stays `authorized`; restart recovery requires a fresh explicit start.
    if (this.#disposed) throw new ExecutionAdmissionError('EXECUTION_STOPPING', '本地业务服务正在停止。');
    if (this.#active.has(runRecordId)) return 'admitted';
    if (this.#queued.some((entry) => entry.runRecordId === runRecordId)) return 'queued';
    // Read the persisted origin even when a caller supplies a scheduling hint: it cannot borrow the other origin's place.
    const placeFree = this.#blockOnRefusal(runRecordId, ledger, () => this.#placeForRun(runRecordId, ledger));
    if (placeFree && (origin === 'background' || this.#queued.length === 0)) {
      this.#admitInTurn(runRecordId, ledger);
      return 'admitted';
    }
    // A start this launch could never admit — no route for it, a plan frozen under another route, a Book it may not
    // transmit — is blocked now with the reason, never left reading 等待运行名额 for a turn it cannot take (Issue #49 review).
    this.#blockOnRefusal(runRecordId, ledger, () => {
      this.#requireStartable(runRecordId, ledger);
      this.#requireMaterials(runRecordId, ledger);
      if (this.#queued.length >= this.#waitingCapacity) {
        throw new ExecutionAdmissionError('EXECUTION_WAITING_QUEUE_FULL', `等待运行的队列已满（最多 ${this.#waitingCapacity} 项）；没有开始这项任务。请等已有任务开始或取消后，再重新准备并开始。`);
      }
    });
    this.#queued.push({ runRecordId, ledger });
    // An idle-deferred start ahead waits for quiet, not for a place: a start behind it still takes a free one now (#1089).
    if (!this.#backgroundIdle) this.setBackgroundIdle(false);
    else this.#drain();
    return this.#active.has(runRecordId) ? 'admitted' : 'queued';
  }

  /**
   * A start admitted in its turn (Issue #49, S14). One that can no longer be admitted — this launch has no route for it,
   * or its Book is outside what may be transmitted — is blocked before dispatch with the reason and the refusal thrown:
   * it never reads 等待运行名额 for a turn it cannot take.
   */
  #admitInTurn(runRecordId: string, ledger: BaselineAnalysisStore): void {
    this.#blockOnRefusal(runRecordId, ledger, () => this.admitAndDispatch(runRecordId, ledger));
  }

  /** A start refused while it is still `authorized` is blocked before dispatch with the reason, and the refusal thrown. */
  #blockOnRefusal<T>(runRecordId: string, ledger: BaselineAnalysisStore, attempt: () => T): T {
    try {
      return attempt();
    } catch (error) {
      if (ledger.currentRunState(runRecordId) === 'authorized') {
        const reason = error instanceof Error ? error.message : '运行未能进入调度。';
        ledger.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: reason, reasons: [reason] });
      }
      throw error;
    }
  }

  /**
   * The material guard at admission (Issue #759): a start whose frozen 资料库 reference no longer reads as its plan pinned is
   * blocked before dispatch with the material's own reason, and the refusal thrown; nothing of it was sent.
   */
  #requireMaterials(runRecordId: string, ledger: BaselineAnalysisStore): void {
    const refusal = this.#deps.materialGuard?.(runRecordId, ledger);
    if (refusal == null) return;
    ledger.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: refusal.message, reasons: [refusal.message], cause: refusal.code });
    throw new ExecutionAdmissionError(refusal.code, refusal.message);
  }

  /**
   * What admitting a just-authorized start checks, whatever the governor's places (Issue #49 review): this launch has a
   * route and froze the ledger under the same launch, the plan still reads under this launch's route, its Book may be
   * transmitted, and the start is still `authorized`. Only a free place is left for its turn.
   */
  #requireStartable(runRecordId: string, ledger: BaselineAnalysisStore): void {
    const live = this.#requireLaunchOf(ledger);
    const facts = ledger.loadExecutionPlan(runRecordId);
    this.#requireTransmittable(facts, live);
    this.#requireOrigin(facts, live, ledger, this.#policy());
    if (ledger.currentRunState(runRecordId) !== 'authorized') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有刚记录授权的运行可以进入调度。');
    }
  }

  /**
   * This launch has a route, and the ledger froze its plans under the same launch: one bound to another launch would
   * hand over a plan whose route this owner cannot honour. The live runtime, if any.
   */
  #requireLaunchOf(ledger: BaselineAnalysisStore): LiveRuntime | null {
    const live = this.#live();
    const production = isOrdinaryProductionRuntime(live);
    if (live !== null && !production && ledger.definition.kind !== BASELINE_ANALYSIS_KIND && liveRuleOf(ledger) === null) {
      throw new ExecutionAdmissionError('EXECUTION_KIND_NOT_ADMITTED', production
        ? (ledger.launch.live === null ? MODEL_SERVICE_SETUP_REQUIRED_REASON : 'ordinary-production 当前未准许该任务种类实时执行。')
        : 'developer-live 当前只允许基线稿件分析；该任务种类尚未获准实时执行。');
    }
    if (live === null && this.#deps.fixture === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '没有可执行的本地确定性路由。');
    // Under ordinary-production a frozen plan keeps its own binding whatever is configured now (Issue #811): the ledger's
    // current binding may be another route, or none, and the plan is checked by itself when it is loaded.
    if (!production && (ledger.launch.live !== null) !== (live !== null)) {
      throw new ExecutionAdmissionError('EXECUTION_LEDGER_LAUNCH_MISMATCH', '该分析账本绑定的可信区间与执行所有者不一致；未开始执行。');
    }
    return live;
  }

  /** The Public SampleBook check precedes admission, so an unadmitted Book never reaches a payload. */
  #requireTransmittable(facts: ExecutionPlanFacts, live: LiveRuntime | null): void {
    // Ordinary production sends the editor's own manuscript (Issue #811); only developer-live is held to the Public SampleBooks.
    if (live !== null && !isOrdinaryProductionRuntime(live) && !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(facts.sourceDigest)) {
      throw new ExecutionAdmissionError('EXECUTION_SOURCE_NOT_TRANSMITTABLE', '当前图书不在 developer-live 可传输的 Public SampleBook 集合内；未发起任何传输。');
    }
  }

  /**
   * A Run a 后台分析登记 started (Issue #864) is admitted live only as the foreground kinds are admitted under their own rules:
   * the baseline kind, under the selected policy's one enrolled-background rule (Provider Processing v14 developer-live, v15
   * ordinary production), on that rule's exact route, model and credential slot. v12 and v13 have no such rule, so under them
   * it is refused before anything is sent; development-ci's local route admits it as it admits every Run.
   */
  #requireOrigin(facts: ExecutionPlanFacts, live: LiveRuntime | null, ledger: BaselineAnalysisStore, policy: LaunchPolicyProjection, resolvedForRun = false): void {
    if (facts.origin !== 'background-analysis-enrollment' || live === null) return;
    const production = isOrdinaryProductionRuntime(live);
    const rule = ledger.definition.kind !== BASELINE_ANALYSIS_KIND ? null
      : liveKindRule(policy, BASELINE_ANALYSIS_KIND, [production ? 'unpublished-excerpts' : 'public-or-synthetic'], 'background');
    const { route, model, credentialSlot } = routeFactsOf(facts, live);
    // Settings select the next Task's connection. Production resolves this Run's frozen binding before execution and checks it
    // below again; comparing it with the newly selected connection here would refuse an otherwise unchanged authorized Run.
    const checkBinding = !production || resolvedForRun || this.#deps.productionPolicyFor === undefined;
    if (rule === null || (checkBinding && (rule.route !== route || rule.model !== model || rule.credentialSlot !== credentialSlot))) {
      throw new ExecutionAdmissionError('EXECUTION_ORIGIN_NOT_ADMITTED', '当前策略没有准许后台分析登记开始的运行发送内容；什么都没有发送。');
    }
  }

  /** A queued Run the editor cancelled before its turn (Issue #49, S14): it leaves the queue; nothing of it ran. */
  dequeue(runRecordId: string): boolean {
    const index = this.#queued.findIndex((entry) => entry.runRecordId === runRecordId);
    if (index < 0) return false;
    this.#queued.splice(index, 1);
    return true;
  }

  /**
   * Whether the credential the developer-live route resolves is present now (Issue #420, S74a A3): the
   * readiness dispatch checks before any transmission, asked before an authorization so a Run that could
   * not start is never recorded. The value is resolved and discarded by the broker. `null` under
   * development-ci, whose routes transmit nothing and so need no credential.
   */
  async liveCredentialReadiness(binding?: ConfiguredProviderBinding | null): Promise<'present' | 'missing' | null> {
    const live = this.#live();
    if (live === null) return null;
    if (isOrdinaryProductionRuntime(live)) {
      // The editor's configured connection (Issue #811); none configured reads as missing, which is 需设置.
      const configured = binding === undefined ? this.#deps.ledger.launch.live : binding;
      const allowed = allowedProductionBindingOf(configured);
      return configured === null || allowed === null ? 'missing' : this.#broker.checkPlanReadiness(allowed.credentialSlot, configured.credentialReference);
    }
    return this.#broker.checkPlanReadiness(OPENCODE_GO_ROUTE_PROFILE.credentialSlot, DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE);
  }

  /**
   * Admission into one of the governor's places (Issue #49, S14): a dispatch while it has none is refused here; a
   * start the editor makes waits for one through `admitOrQueue` instead.
   *
   * `ledger` is the ledger the Run Record belongs to and defaults to the baseline kind's, so every
   * caller that has always dispatched a baseline Run still does exactly that. The places are the owner's
   * and not a ledger's: a Run of any kind takes one.
   */
  /**
   * `afterReconnectPreflight` is the one way a Run waiting in Connectivity Wait is admitted (Issue #502): the
   * service passes it only once Reconnect Preflight has found the model service reachable, the credential ready
   * and the bound plan unchanged. Every other Run must be one that was just authorized.
   */
  /**
   * `resume` is 续行 (Issue #422, S76b; CONT-015): a paused Run, or one left 可续行, goes on in a new span of the same
   * attempt from its continuation checkpoints, once its Execution Binding reads exactly as it was persisted. With
   * `cancel`, a stopped Run the editor cancelled is finished the same way, sending nothing: its kept units become its
   * partial revision.
   */
  admitAndDispatch(
    runRecordId: string,
    ledger: BaselineAnalysisStore = this.#deps.ledger,
    options: { afterReconnectPreflight?: boolean; resume?: boolean; cancel?: boolean } = {},
  ): void {
    if (this.#disposed) throw new ExecutionAdmissionError('EXECUTION_STOPPING', '本地业务服务正在停止。');
    if (this.#active.has(runRecordId)) throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '这个运行已经在执行。');
    if (this.full) throw new ExecutionAdmissionError('EXECUTION_BUSY', `运行名额已满：本实例一次执行 ${this.#capacity} 个运行。`);
    const live = this.#requireLaunchOf(ledger);
    const facts = ledger.loadExecutionPlan(runRecordId);
    // The background place takes only a Run a 后台分析登记 started; the editor's take their own (Issue #864).
    const background = facts.origin === 'background-analysis-enrollment' || facts.startWhen === 'idle';
    if (!this.#placeForRun(runRecordId, ledger) && options.cancel !== true) throw new ExecutionAdmissionError('EXECUTION_BUSY', background
      ? backgroundShareFullReason(executionBackgroundShare(this.#policy(), this.#capacity))
      : `运行名额已满：本实例一次执行 ${this.#capacity} 个运行。`);
    this.#requireTransmittable(facts, live);
    this.#requireOrigin(facts, live, ledger, this.#policy());
    const state = ledger.currentRunState(runRecordId);
    const resuming = options.resume === true;
    // A Run waiting for the editor's answer (Issue #422, S76d) goes on as a continuation too, once the answer is there.
    const admissible = resuming
      ? state === 'paused' || state === 'resumable' || state === 'awaiting-clarification' || (options.cancel === true && state === 'cancelling')
      : state === 'awaiting-connectivity' ? options.afterReconnectPreflight === true : state === 'authorized';
    if (!admissible) {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', resuming
        ? '只有已暂停或中断后可续行的运行可以续行。'
        : state === 'awaiting-connectivity'
          ? '等待中的运行只有通过重新联网预检后才能进入调度。'
          : '只有刚记录授权的运行可以进入调度。');
    }
    // A start not yet begun is refused here. A continuation — 续行, or a Run the editor answered — is asked by its execution
    // before its first request instead, so a reference withdrawn meanwhile ends it 任务已中断 with its kept units formed into
    // the partial revision, never one that drops them (Issue #759).
    if (options.cancel !== true && !resuming) this.#requireMaterials(runRecordId, ledger);
    // 结果待确认 (Issue #51, S16c; ADR 0034, CONT-011, CONT-016): a Run stopped there never goes on — only its cancellation runs.
    // Only Runs recorded before #1080 carry that stop; a Run now completes with its unknown units as gaps.
    if (resuming && options.cancel !== true && ledger.outcomeUnknownOf(runRecordId) !== null) {
      throw new ExecutionAdmissionError('EXECUTION_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_NO_RESUME);
    }
    // 续行 goes on only under the Execution Binding the Run persisted (CONT-015): the same route, model, fixture,
    // policy, credential slot, ceiling and plan digests. Anything else refuses before a state is recorded.
    const continuation: Continuation | null = resuming ? { stored: ledger.executionBindingOf(runRecordId) } : null;
    if (resuming && options.cancel !== true) ledger.stageContinuationOf(runRecordId);
    if (continuation?.stored != null && this.#bindingMoved(continuation.stored, facts, live, ledger)) {
      throw new ExecutionAdmissionError('EXECUTION_RESUME_BINDING_DRIFT', '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同）；不能续行。请改计划重做。');
    }
    const submitted = submittedUnitsOf(facts);
    // A continuing Run reads, from its admission on, the units it already kept.
    const kept = resuming ? ledger.unitCheckpoints(runRecordId).length : 0;
    // A scope plan also says how many units it leaves unreviewed; a baseline plan has no such count,
    // so its admitted state reads exactly as it always has.
    const unreviewed = facts.update !== null && 'unreviewed' in facts.update.reusePlan.counts ? facts.update.reusePlan.counts.unreviewed : null;
    // Finishing a stopped Run's cancellation records nothing here: `cancelling` stays its latest state until 已取消, so
    // every read keeps it 正在取消 and a service that stops meanwhile finishes the cancellation at its next start
    // rather than leaving the Run 可续行 (CTRL-005, CTRL-006).
    if (!(resuming && options.cancel === true)) {
      ledger.recordRunState(runRecordId, 'admitted', {
        detail: !resuming
          ? '已进入 AI7 调度器。'
          : state === 'awaiting-clarification'
            ? '按你的回答接着做：已进入 AI7 调度器，从已保存的进度接着读。'
            : '续行：已进入 AI7 调度器，从已保存的进度接着读。',
        ...(resuming ? { resumed: true } : {}),
        unitsTotal: facts.manifest.units.length,
        ...(facts.update === null ? {} : { updateMode: facts.update.mode, unitsRecomputed: submitted, unitsReused: facts.update.reusePlan.counts.reused }),
        ...(unreviewed === null ? {} : { unitsUnreviewed: unreviewed }),
      });
    }
    const active: ActiveRun = {
      runRecordId,
      ledger,
      progress: {
        unitsTotal: submitted,
        unitsSettled: kept,
        currentUnitOrdinal: null,
        currentUnitStartedAt: null,
        attemptState: null,
        completedAttempts: 0,
        longestSettledUnitMs: null,
        stage: 'units',
      },
      transmissions: null,
      transmissionsAtDispatch: 0,
      validationStep: '',
      harness: null,
      requestAbort: new AbortController(),
      interrupted: false,
      cancelRequested: options.cancel === true,
      pauseRequested: false,
      idleYieldRequested: false,
      resumableOnInterrupt: ledger.definition.kind === BASELINE_ANALYSIS_KIND,
      done: Promise.resolve(),
    };
    this.#active.set(runRecordId, active);
    if (background) this.#backgroundActive.add(runRecordId);
    active.done = this.#execute(active, facts, continuation).catch((error: unknown) => {
      this.#recordFailure(ledger, facts, error);
    }).finally(() => {
      if (this.#active.get(runRecordId) === active) {
        this.#active.delete(runRecordId);
        this.#backgroundActive.delete(runRecordId);
      }
      this.#drain();
      this.#changed();
    });
  }

  /** Whether the Execution Binding a Run persisted reads otherwise under this launch (CONT-015). */
  #bindingMoved(stored: NonNullable<Continuation['stored']>, facts: ExecutionPlanFacts, live: LiveRuntime | null, ledger: BaselineAnalysisStore): boolean {
    // The composition this launch would execute under — its harness pins included — as `prepareExecution` will
    // describe it, never the one the plan froze: a harness a later release pins differently is seen here, before a
    // summary promises what the Run kept, and not first when the execution refuses it.
    const { route, model } = routeFactsOf(facts, live);
    // A factual plan executes under the level it froze (Issue #901): 快速整理 declares no local tool.
    const definition = ledger.definitionForRun(facts.runRecordId, facts.promptContractDigest);
    const webTools = definition.evidenceAssuranceLevel !== 'quick' && facts.webToolsBackend !== undefined;
    const composition = describeComposition(route, model, definition.promptContractDigest, {
      ...facts.compositionOptions,
      platformTools: webTools,
      localTools: definition.evidenceAssuranceLevel !== 'quick' ?
        kindLocalTools(this.#policy(), ledger.definition.kind, facts.origin === 'background-analysis-enrollment' ? 'background' : 'foreground') ?? false : false,
      ...(definition.evidenceAssuranceLevel === 'quick' ? { researchDeclaration: definition.researchDeclaration } :
        webTools ? { researchDeclaration: { webSearch: true, searchEngine: 'user-selected-backend' } as const } : {}),
    });
    const rebuilt = executionBindingRecordOf({
      facts, definition, live, fixture: this.#deps.fixture, attemptId: stored.attemptId,
      harnessSessionId: stored.binding.harnessSessionId, boundAt: stored.binding.boundAt, compositionDigest: composition.digest,
    });
    return canonicalRecord(rebuilt).digest !== stored.bindingDigest || assuranceContractMoved(definition, facts.assurancePromptContractDigest);
  }

  /**
   * Whether this launch can still carry a stopped Run under the Execution Binding it persisted (Issue #422, S76c;
   * CONT-015, CONT-016): the check 续行 and a stopped Run's cancellation make when they re-admit it, made here
   * without recording anything. A launch that cannot — another route, fixture, policy or AI7 version — neither
   * continues the Run nor forms what it kept into a revision: its cancellation settles without one.
   */
  carriesStoppedRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): boolean {
    const live = this.#live();
    if (this.#disposed || (live === null && this.#deps.fixture === null) ||
        (!isOrdinaryProductionRuntime(live) && (ledger.launch.live !== null) !== (live !== null))) return false;
    try {
      const facts = ledger.loadExecutionPlan(runRecordId);
      if (live !== null && !isOrdinaryProductionRuntime(live) && !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(facts.sourceDigest)) return false;
      const stored = ledger.executionBindingOf(runRecordId);
      return stored == null || !this.#bindingMoved(stored, facts, live, ledger);
    } catch {
      return false;
    }
  }

  /**
   * A place freed (Issue #49, S14): first a stopped Run whose cancellation waited for one, then a Run the editor answered
   * meanwhile, then the queued starts in their order — each while the governor has a place.
   */
  #drain(): void {
    for (let index = 0; !this.full && !this.#disposed && index < this.#pendingCancels.length;) {
      const next = this.#pendingCancels[index]!;
      try {
        if (next.ledger.currentRunState(next.runRecordId) !== 'cancelling') {
          this.#pendingCancels.splice(index, 1);
          continue;
        }
        if (!this.#placeForCancellation(next.runRecordId, next.ledger)) { index += 1; continue; }
        this.#pendingCancels.splice(index, 1);
        this.admitAndDispatch(next.runRecordId, next.ledger, { resume: true, cancel: true });
      } catch {
        if (this.#pendingCancels[index] === next) this.#pendingCancels.splice(index, 1);
        settleCancelWithoutRevision(next.ledger, next.runRecordId, CANCELLED_WITHOUT_REVISION);
      }
    }
    // Then a Run the editor answered while every place was taken (Issue #422, S76d), if it still waits for that answer.
    for (let index = 0; !this.full && !this.#disposed && index < this.#pendingAnswers.length;) {
      const next = this.#pendingAnswers[index]!;
      try {
        if (next.ledger.currentRunState(next.runRecordId) !== 'awaiting-clarification') {
          this.#pendingAnswers.splice(index, 1);
          continue;
        }
        if (!this.#placeForRun(next.runRecordId, next.ledger)) { index += 1; continue; }
        this.#pendingAnswers.splice(index, 1);
        this.admitAndDispatch(next.runRecordId, next.ledger, { resume: true });
      } catch {
        if (this.#pendingAnswers[index] === next) this.#pendingAnswers.splice(index, 1);
        // It stays 任务等待你的说明 with its answer recorded; 续行 is not needed, but the answer's next look finds it.
      }
    }
    // Then the starts waiting on the governor, in their order (CONC-007). One cancelled meanwhile is skipped; one that
    // can no longer be admitted is blocked before dispatch with the reason, never left waiting for a turn it cannot take.
    for (let index = 0; !this.full && !this.#disposed && index < this.#queued.length;) {
      const next = this.#queued[index]!;
      try {
        if (next.ledger.currentRunState(next.runRecordId) !== 'authorized') {
          this.#queued.splice(index, 1);
          continue;
        }
        const placeFree = this.#blockOnRefusal(next.runRecordId, next.ledger, () => this.#placeForRun(next.runRecordId, next.ledger));
        if (!placeFree) { index += 1; continue; }
        this.#queued.splice(index, 1);
        this.#admitInTurn(next.runRecordId, next.ledger);
      } catch {
        if (this.#queued[index] === next) this.#queued.splice(index, 1);
        // Blocked before dispatch with its reason; the next start in the queue takes the place.
      }
    }
  }

  /**
   * The editor answered what a Run waiting for them asked (Issue #422, S76d; CLAR-006): it goes on inside its unchanged
   * envelope — a new span of the same attempt, as 续行 is — at once when the governor has a place, or as soon as it has.
   */
  continueAnswered(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): 'continuing' | 'queued' {
    if (!this.#disposed && this.#placeForRun(runRecordId, ledger)) {
      this.admitAndDispatch(runRecordId, ledger, { resume: true });
      return 'continuing';
    }
    if (!this.#pendingAnswers.some((entry) => entry.runRecordId === runRecordId)) this.#pendingAnswers.push({ runRecordId, ledger });
    return 'queued';
  }

  /** Resolve once no Run is executing — a queued one admitted meanwhile included; used by the service suites. */
  async whenIdle(): Promise<void> {
    while (this.#active.size > 0) {
      await Promise.all([...this.#active.values()].map((active) => active.done));
    }
  }

  /**
   * Resolve once the governor has a place (Issue #49, S14): a Review Run's next category waits for one, never for every
   * other Book's Run to end. A queued start admitted as a place frees takes it first, and this waits on.
   */
  async whenPlaceFree(origin: 'foreground' | 'background' = 'foreground'): Promise<void> {
    if (origin === 'foreground') this.#foregroundPlaceWaiters += 1;
    try {
      if (!this.#backgroundIdle) this.setBackgroundIdle(false);
      while (this.busy && !this.#disposed) {
        await Promise.race([...this.#active.values()].map((active) => active.done));
      }
    } finally { if (origin === 'foreground') this.#foregroundPlaceWaiters -= 1; }
  }

  /** Resolve once this Run no longer executes (Issue #49, S14): a Review Run's category is waited for alone. */
  async whenDone(runRecordId: string): Promise<void> {
    while (!this.#disposed) {
      const active = this.#active.get(runRecordId);
      if (active !== undefined) { await active.done; continue; }
      if (!this.#queued.some((entry) => entry.runRecordId === runRecordId) && !this.#yielded.has(runRecordId)) return;
      await new Promise<void>((resolve) => this.#stateWaiters.add(resolve));
    }
  }

  /**
   * 取消任务 (Issue #422, plan slice S76a; CTRL-005, CTRL-008), once `cancelling` is recorded. The Run this owner
   * executes aborts its model request, retains an unknown gap if sent, sends nothing after it, and the Run ends
   * `cancelled` with what it completed kept. A Run it does not hold — paused, left 可续行, or one AI7 left behind when
   * it last closed — has nothing running: what it kept is gathered in a place of the governor's, and one that kept nothing is
   * settled here at once.
   */
  cancelRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): 'stopping' | 'settled' {
    this.#yielded.delete(runRecordId);
    this.#changed();
    const active = this.#active.get(runRecordId);
    if (active !== undefined) {
      active.cancelRequested = true;
      active.requestAbort.abort();
      return 'stopping';
    }
    if (ledger.currentRunState(runRecordId) !== 'cancelling') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有已记录“正在取消”的运行可以结束取消。');
    }
    // A stopped Run that kept units ends the way a running one does — its partial revision, then 已取消 — through the
    // governor, sending nothing; while every place is taken it waits for one, held and read as 正在取消. So does one
    // whose units asked the editor (Issue #422, S76d): their first attempts were sent, and they end as the gaps they are.
    // One that kept and asked nothing ends here, and so does one whose kept progress no longer reads back: nothing of it
    // can be gathered.
    let checkpoints: UnitCheckpoint[];
    let asked: boolean;
    try {
      checkpoints = ledger.unitCheckpoints(runRecordId);
      asked = ledger.clarificationsOf(runRecordId).length > 0;
    } catch {
      settleCancelWithoutRevision(ledger, runRecordId, CANCELLED_WITHOUT_REVISION);
      return 'settled';
    }
    if (checkpoints.length === 0 && !asked) {
      settleCancelWithoutRevision(ledger, runRecordId, CANCELLED_WITHOUT_EXECUTION);
      return 'settled';
    }
    // AI7 is closing: the Run stays 正在取消, and the next start's reconciliation finishes it.
    if (this.#disposed) return 'stopping';
    try {
      if (this.#placeForCancellation(runRecordId, ledger)) {
        this.admitAndDispatch(runRecordId, ledger, { resume: true, cancel: true });
      } else if (!this.#pendingCancels.some((entry) => entry.runRecordId === runRecordId)) {
        this.#pendingCancels.push({ runRecordId, ledger, progress: stoppedRunProgress(ledger.loadExecutionPlan(runRecordId), checkpoints) });
      }
    } catch {
      settleCancelWithoutRevision(ledger, runRecordId, CANCELLED_WITHOUT_REVISION);
      return 'settled';
    }
    return 'stopping';
  }

  /**
   * 暂停 (Issue #422, S76b; CTRL-001), once `pausing` is recorded. The Run this owner executes stops at the next unit
   * boundary without aborting its sent request, and records `paused` with what it read kept. A pause recorded for a Run
   * nothing executes has reached its boundary already, and settles here.
   */
  pauseRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger, mode: 'manual' | 'idle-yield' = 'manual'): 'pausing' | 'settled' {
    if (mode === 'idle-yield' && !this.#backgroundActive.has(runRecordId)) throw new ExecutionAdmissionError('EXECUTION_ORIGIN_INVALID', '只有后台运行可以让位。');
    if (mode === 'manual') this.#yielded.delete(runRecordId);
    const active = this.#active.get(runRecordId);
    if (active !== undefined) {
      active.pauseRequested = true;
      active.idleYieldRequested = mode === 'idle-yield';
      return 'pausing';
    }
    if (ledger.currentRunState(runRecordId) !== 'pausing') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有已记录“正在暂停”的运行可以结束暂停。');
    }
    ledger.recordRunState(runRecordId, 'paused', { detail: PAUSED_WITHOUT_EXECUTION });
    return 'settled';
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#changed();
    // A queued start stays `authorized` in its ledger, and the next start queues it again in its order.
    this.#queued.length = 0;
    const running = [...this.#active.values()];
    for (const active of running) {
      active.interrupted = true;
      active.requestAbort.abort();
      // Let the live adapter classify a sent abort as unknown; a harness interruption would erase that distinction.
      if (this.#live() === null) active.harness?.interrupt();
    }
    await Promise.all(running.map((active) => active.done));
  }

  #recordFailure(ledger: BaselineAnalysisStore, facts: ExecutionPlanFacts, error: unknown): void {
    const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_FAILED';
    const reason = `运行在形成结果集修订版前失败（${code}）。`;
    try {
      ledger.recordRunState(facts.runRecordId, 'failed', { detail: `运行在形成结果前失败（${code}）。`, code });
      ledger.recordOutcome({
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        classification: 'failed',
        resultSetRevisionId: null,
        summary: reason,
        safeNextAction: (ledger.definition.safeNextActions ?? SAFE_NEXT_ACTIONS).failed,
        // A Run that failed before it formed a revision still leaves a report: four stages that
        // never ran, no units, no usage, and the terminal reason with its classified code.
        report: buildRunReport({
          runRecordId: facts.runRecordId,
          taskIntentId: facts.taskIntentId,
          attemptId: null,
          resultSetRevisionId: null,
          classification: 'failed',
          recordedAt: new Date().toISOString(),
          spans: new Map(),
          usage: {
            units: { requests: 0, inputTokens: 0, outputTokens: 0 },
            'cross-unit-reduction': { requests: 0, inputTokens: 0, outputTokens: 0 },
            'assurance-sampling': { requests: 0, inputTokens: 0, outputTokens: 0 },
          },
          unitRows: [],
          submitted: 0,
          adaptations: [],
          gaps: [],
          crossUnit: { state: 'not-run', reason },
          sample: assuranceSampleNotRun(reason),
          findingCounts: [],
          terminalFailure: { code, reason },
        }, runReportReflectionNotRun(RUN_REPORT_REFLECTION_NOT_REACHED)),
      });
    } catch {
      // The ledger already refused the terminal write; the run state stays as last recorded.
    }
  }

  /**
   * The Run Report's `if redone` list: the fourth declared suboperation (ADR 0066 §Run Report).
   *
   * It runs last — after the sample, after the reduction is final, and after the revision is
   * persisted — so the accounting it reflects on is the revision's own and can never change it. Its
   * usage is therefore recorded on the report alone: the revision is already immutable, and no
   * request count of any Journey moves because of it.
   *
   * The guard order is the sample's — interruption, policy, ceiling — and every refusal happens
   * before a message is assembled, so a Run that may not reflect never builds one. It records no
   * execution-span row, because the span table is unit-only and this step belongs to no unit, and it
   * makes exactly one further user message admissible at the gate.
   */
  async #reflect(context: RunReportReflectionContext): Promise<RunReportReflectionOutcome> {
    const { active, harness, live, policy } = context;
    if (active.cancelRequested) return runReportReflectionNotRun(RUN_REPORT_REFLECTION_CANCELLED);
    if (context.stopped || active.interrupted) return runReportReflectionNotRun(RUN_REPORT_REFLECTION_NOT_REACHED);
    if (live !== null && policy.providerProcessing.runReportReflectionAllowed !== true) {
      // The reflection is a transmission the active Provider Processing policy does not name, so it
      // never forms a request at all. The verified developer-live document names it; a projection that does not
      // is exactly the policy-bounded case this guard exists for.
      return { ifRedone: { state: 'policy-bounded', items: [], reason: RUN_REPORT_REFLECTION_POLICY_BOUNDED }, usage: RUN_REPORT_NO_USAGE };
    }
    if (context.ceilingState() === 'reached') {
      return runReportReflectionNotRun('任务运行预算上限已达到；运行反思未派发。');
    }
    const message = buildRunReportReflectionMessage(context.runRecordId, context.accounting);
    // The same set the gate reads: exactly one further user message becomes admissible, and every
    // other refusal — route, model, system prompt, tools, prior outputs — is untouched.
    context.admittedUserMessages.add(message);
    active.progress.stage = 'run-report-reflection';
    active.validationStep = 'reflection';
    active.progress.currentUnitOrdinal = null;
    active.progress.currentUnitStartedAt = new Date().toISOString();
    active.progress.attemptState = 'dispatched';
    active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
    const result = await harness.submitUnit(message);
    const canonical = context.liveAdapter.instance?.lastCanonicalResult ?? null;
    const usageSignal = result.signals.find((signal) => signal.kind === 'usage');
    const turnUsage = usageSignal?.kind === 'usage'
      ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens }
      : null;
    // Counted on the report and against the Run's ceiling, and deliberately nowhere else: the
    // revision this reflects on was persisted before the turn was dispatched.
    if (turnUsage !== null) context.accumulated.push(turnUsage);
    const usage: RunReportUsage = {
      requests: 1,
      inputTokens: turnUsage?.inputTokens ?? 0,
      outputTokens: turnUsage?.outputTokens ?? 0,
    };
    active.progress.completedAttempts += 1;
    const gap = (reason: string): RunReportReflectionOutcome => ({ ifRedone: { state: 'gap', items: [], reason }, usage });
    const candidate = result.signals.find((signal) => signal.kind === 'contentCandidate');
    if (result.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
      context.acceptedOutputDigests.add(candidate.digest);
      if (canonical?.kind === 'empty-answer') return gap(runReportReflectionEmptyAnswerGapReason(canonical.reasoningPresent));
      const parsed = parseRunReportReflectionResult(candidate.text);
      if (!parsed.ok) return gap(unparsableRunReportReflectionAnswerGapReason(parsed.code, parsed.detail, candidate.text));
      return { ifRedone: { state: 'closed', items: parsed.result.items, reason: null }, usage };
    }
    if (result.terminal === 'completed') return gap('运行反思的技术回合完成但没有模型输出。');
    if (result.terminal === 'failed') {
      const failure = result.signals.find((signal) => signal.kind === 'failed');
      // No safe retry here: one attempt, and a retry-safe failure is a disclosed absence like any other.
      return gap(failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
    }
    // 结果待确认 (Issue #51, S16c): a reflection whose result cannot be known says so, never 被中断.
    const unknown = ambiguousTurnReason(result.signals);
    if (unknown !== null) return gap(unknown);
    const failure = result.signals.find((signal) => signal.kind === 'interrupted');
    return gap(failure?.kind === 'interrupted' ? failure.failure.reason : '运行反思被中断。');
  }

  async #execute(active: ActiveRun, facts: ExecutionPlanFacts, continuation: Continuation | null): Promise<void> {
    const ledger = active.ledger;
    // Everything kind-specific this Run needs: the frozen system section, the unit message builder and
    // its header, the unit result parser, the reducer, and whether the kind declares a cross-unit
    // suboperation at all. The owner itself is the same owner for every analysis kind.
    // A factual Task's frozen level decides its contract (Issue #901); for every other kind this is the ledger's own definition.
    if (ledger.kind === FACTUAL_REVIEW_KIND) this.#deps.factualRunStart?.({ bookId: facts.bookId, runRecordId: facts.runRecordId, taskIntentId: facts.taskIntentId });
    const definition: AnalysisKindDefinition = ledger.definitionForRun(facts.runRecordId, facts.promptContractDigest);
    const promptContractDigest = definition.promptContractDigest;
    let keptStages: StageContinuation | null = null;
    if (continuation !== null) {
      try { keptStages = ledger.stageContinuationOf(facts.runRecordId); }
      catch (error) { if (!active.cancelRequested) throw error; }
    }
    const factualAssurance = ledger.factualRunAssurance(facts.runRecordId);
    const webTools = definition.evidenceAssuranceLevel !== 'quick' && facts.webToolsBackend !== undefined;
    const live = this.#live();
    // Ordinary production (Issue #811): the Run's route is its plan's, from the editor's configured binding when it froze.
    const production = isOrdinaryProductionRuntime(live) ? live : null;
    const policy = production !== null && facts.productionBinding !== null && this.#deps.productionPolicyFor !== undefined
      ? await this.#deps.productionPolicyFor({ ...facts.productionBinding, credentialReference: facts.credentialReference })
      : this.#policy();
    if (live === null) {
      if (policy.operationalScope !== 'development-ci' || policy.providerProcessing.version !== 'v1' || policy.providerProcessing.liveTransmissionAllowed !== false) {
        throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', '当前可信策略不是 development-ci · Provider Processing v1。');
      }
    } else if (production !== null) {
      if (policy.operationalScope !== 'ordinary-production' || policy.providerProcessing.version !== ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION ||
          policy.providerProcessing.decision !== 'eligible-only' || facts.productionBinding === null) {
        throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', `当前可信策略不是 ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION}。`);
      }
    } else if (policy.operationalScope !== 'developer-live' || policy.providerProcessing.version !== DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION ||
        policy.providerProcessing.decision !== 'eligible-only' || policy.providerProcessing.liveTransmissionAllowed !== true) {
      throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', `当前可信策略不是 developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION}。`);
    }
    const fixture = this.#deps.fixture;
    // The one selected rule that admitted a non-baseline kind live (Issue #429): its Model Role, its outbound categories and
    // whether the kind's own synthesis may be sent. `null` for the baseline, whose rule the policy-level terms read, and on
    // the deterministic route.
    const admitted = live === null || definition.kind === BASELINE_ANALYSIS_KIND ? null
      : production !== null && facts.productionBinding !== null ? liveKindAdmission(policy, definition, facts.productionBinding) : liveRuleOf(ledger);
    if (live !== null && definition.kind !== BASELINE_ANALYSIS_KIND && (admitted === null || admitted.modelRole !== 'Main Editorial Role')) {
      throw new ExecutionAdmissionError('EXECUTION_KIND_NOT_ADMITTED', '当前策略未准许该任务种类实时执行。');
    }
    const modelRole = admitted === null ? 'Main Editorial Role' : admitted.modelRole as CredentialSlotBinding['modelRole'];
    // The route the plan froze, resolved once — the deterministic fixture, or the live route profile — and the
    // ceiling it carries, already resolved: an explicit launch total, or the policy's per-frozen-unit default
    // against this Run's own frozen unit count. Never re-derived at dispatch.
    const { route, model, credentialSlot, credentialReference, runBudgetCeiling } = routeFactsOf(facts, live);
    // The live route's profiles: the Go route's under developer-live, the frozen route's under ordinary production.
    const routeProfile: ProviderRouteProfile = production === null ? OPENCODE_GO_ROUTE_PROFILE : productionRouteProfile(route);
    let liveModelProfile: ProviderModelProfile = production === null ? OPENCODE_GO_V41_FLASH_PROFILE : productionModelProfile(route, model);
    // Under ordinary production the rule that admits the kind names the editor's unpublished words (Issue #811): the
    // baseline's own rule included, read for its categories as any other kind's is.
    // A Run a 后台分析登记 started is read under the enrolled-background rule, checked again here against the policy it executes under (Issue #864).
    this.#requireOrigin(facts, live, ledger, policy, true);
    const productionRule = production === null ? null : admitted ?? liveKindRule(policy, BASELINE_ANALYSIS_KIND, ['unpublished-excerpts'],
      facts.origin === 'background-analysis-enrollment' ? 'background' : 'foreground');
    // The test item purpose is the Task mode, so a first baseline and each update mode number their
    // live calls separately and a repeated purpose can never collide with an unrelated test. A Task
    // without a plan is the kind's own whole first mode — `first-baseline` for the baseline kind.
    const testItemPurpose = facts.update === null ? definition.initialMode : facts.update.mode;
    // The Provider Test Ledger and Result Cache serve development validation only (ADR 0089, Issue #808). A live Run outside it
    // is business: every model step reaches the transport itself, and nothing reads or writes the developer cache or ledger.
    const validation = live === null || production !== null ? null : (live as DeveloperLiveRuntime).launch.validation;
    const validationContractOf = (): string => {
      if (active.validationStep === 'reflection') return RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST;
      if (active.validationStep === 'reduction') return definition.crossUnit!.promptContractDigest;
      if (active.validationStep.startsWith('sampling-')) return definition.assurance!.promptContractDigest;
      return promptContractDigest;
    };
    const bootstrap = production === null && validation?.family === 'policy-selection' && validation.case === 'wave6-tool-evidence-bootstrap';
    if (webTools) liveModelProfile = platformToolModelProfile(liveModelProfile, production === null ? 'developer-live' : 'ordinary-production', validation);
    let cache: ProviderResultCache | null = null;
    if (live !== null && production === null && validation !== null) {
      cache = new ProviderResultCache((live as DeveloperLiveRuntime).launch.providerCacheRoot);
      await cache.open();
    }
    const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
    // 快速整理 registers no local tool (Issue #901; EASSURE-004): its Run lists and locates, and searches nothing.
    const admittedLocalRule = live === null || definition.evidenceAssuranceLevel === 'quick' ? null
      : kindLocalTools(policy, definition.kind, facts.origin === 'background-analysis-enrollment' ? 'background' : 'foreground');
    const localRule = facts.compositionOptions?.version === 2 || admittedLocalRule === null ? admittedLocalRule :
      { targetedRetrieval: admittedLocalRule.targetedRetrieval, breaker: admittedLocalRule.breaker };
    const scopedUnitOrdinals = facts.update === null ? null : new Set(facts.update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
    const readableBlocks = new Set(facts.manifest.units.filter((unit) => scopedUnitOrdinals === null || scopedUnitOrdinals.has(unit.ordinal)).flatMap((unit) => [...unit.blockIds, ...unit.overlapBlockIds]));
    const retrieval = localRule === null ? null : this.#deps.retrievalIndex?.(facts.runRecordId, ledger) ?? new RetrievalIndex([{
      sourceKind: 'manuscript', sourceId: facts.checkpoint.manuscriptId, digest: facts.checkpoint.revisionDigest,
      read: () => ({ digest: facts.checkpoint.revisionDigest, segments: ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId)
        .filter((block) => facts.compositionOptions?.version !== 2 || readableBlocks.has(block.blockId)).map((block) => ({ blockId: block.blockId, text: block.text })) }),
    }], null, null, ledger.pinnedToolSourcesForRun(facts.runRecordId));
    const blocksById = new Map(blocks.map((block) => [block.blockId, block] as const));
    const manifest = facts.manifest;
    const update = facts.update;
    // The plan's units in one shape: the baseline's reuse plan knows two dispositions and a scope plan
    // a third, `unreviewed`, which the owner neither submits nor copies.
    const planUnits: ReadonlyArray<AnalysisReusePlanUnitProjection | ReviewScopePlanUnitProjection> = update === null ? [] : update.reusePlan.units;
    // Only recomputed units form unit messages; the Run Source Scope admits exactly those.
    const recomputedOrdinals = new Set(update === null
      ? manifest.units.map((unit) => unit.ordinal)
      : planUnits.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
    const submittedUnits = manifest.units.filter((unit) => recomputedOrdinals.has(unit.ordinal));
    const unitMessages = new Map(submittedUnits.map((unit) => [unit.ordinal, definition.buildUnitMessage(unit, manifest.units.length, blocksById)] as const));
    const admittedUserMessages = new Set(unitMessages.values());
    // A range-bound first Task has a plan and no predecessor, so there is nothing to load or to reuse.
    const predecessorFacts = update?.predecessor ?? null;
    const predecessorResults: ReadonlyMap<number, PredecessorUnitResult> = predecessorFacts === null
      ? new Map()
      : ledger.loadPredecessorUnitResults(predecessorFacts.revisionId);
    const acceptedOutputDigests = new Set<string>();
    let currentBindingDigest: string | null = null;
    // 续行 goes on under the attempt, Harness session and binding instant the Run persisted (CONT-015): a new span of
    // the same attempt, never a Retry attempt created merely because AI7 stopped.
    const stored = continuation?.stored ?? null;
    const harnessSessionId = stored?.binding.harnessSessionId ?? randomUUID();
    const attemptId = stored?.attemptId ?? randomUUID();
    const boundAt = stored?.binding.boundAt ?? new Date().toISOString();
    // What the Run kept before it stopped, read back against their digests; nothing on a first execution.
    const checkpoints: UnitCheckpoint[] = continuation === null ? [] : ledger.unitCheckpoints(facts.runRecordId);
    const checkpointed = new Set(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal));
    let bindingFacts: EgressBindingFacts | null = null;
    // The payload digest the gate admitted for the turn in flight; recorded by reference, never the payload.
    let admittedPayloadDigest: string | null = null;
    // Usage accumulated so far, in the shape the ceiling evaluator reads. Every attempt counts, so the
    // ceiling sees exactly what the Run has spent at the instant the gate asks, before each dispatch.
    const accumulated: UsageFacts[] = [];
    const pendingLoopUsage: UsageFacts[] = [];
    // Every tool-call result counted once for the whole Run, even when a unit ended on one (a tripped breaker).
    const seenLoopResults = new Set<object>();
    let platformSession: PlatformToolSession | null = null;
    // The tool loop's model turns spend tokens before the unit's turn ends: each is counted the moment anything asks the ceiling —
    // the next model call and also the tool call it asked for, so no search leaves past a reached ceiling (#473).
    const capturePendingLoopUsage = (): void => {
      const last = liveAdapter.instance?.lastCanonicalResult;
      if (platformSession !== null && last !== null && last !== undefined && last.kind === 'tool-calls' && last.usage !== null && !seenLoopResults.has(last)) {
        pendingLoopUsage.push(last.usage); seenLoopResults.add(last);
      }
    };
    const ceilingState = (): EgressCeilingState => {
      if (runBudgetCeiling.kind === 'unset') return 'unset';
      capturePendingLoopUsage();
      return evaluateRunBudgetCeiling([...accumulated, ...pendingLoopUsage], runBudgetCeiling).state === 'reached' ? 'reached' : 'within';
    };
    // The single-use ticket the gate issued for the step in flight; the adapter takes it or refuses.
    let pendingTicket: TransmitTicket | null = null;
    let bindingDigestForSlot = '';
    // The live adapter, kept so each turn's canonical result can be read out of band immediately
    // after `submitUnit`. It stays absent on the deterministic route, which has no Provider response
    // to normalize and no empty answer to distinguish from a contract failure.
    const liveAdapter: { instance: DeepSeekOpenAiCompatibleAdapter | null } = { instance: null };
    // The same counter the liveness signal reads to tell a dispatched attempt from one already in the
    // transport. Nothing but the count crosses this closure.
    active.transmissions = () => liveAdapter.instance?.transmissions ?? 0;
    const harness = await prepareExecution({
      compositionOptions: { ...facts.compositionOptions, ...(localRule === null ? {} : { localTools: localRule }) },
      ...(localRule === null ? {} : { localToolsRule: localRule }),
      ...(localRule === null ? {} : { localTools: {
        execute: (call: import('../harness/primary-agent-harness.js').PlatformToolExecution) => platformSession!.execute(call),
        admit: (result: Parameters<PlatformToolSession['admit']>[0]) => platformSession!.admit(result),
        acceptToolCallMessage: (digest: string) => platformSession!.acceptToolCallMessage(digest),
      } }),
      ...(!webTools ? {} : { platformTools: {
        execute: (call: import('../harness/primary-agent-harness.js').PlatformToolExecution) => platformSession!.execute(call),
        admit: (result: Parameters<PlatformToolSession['admit']>[0]) => platformSession!.admit(result),
        acceptToolCallMessage: (digest: string) => platformSession!.acceptToolCallMessage(digest),
      } }),
      sessionId: harnessSessionId,
      route,
      model,
      systemPrompt: definition.systemPrompt,
      promptContractDigest,
      // One technical Session per Analysis Unit under developer-live; the deterministic route keeps its single
      // accumulating Session, so J-04's proven composition is untouched.
      ...(live === null ? {} : { sessionMode: 'per-unit' as const }),
      adapterFactory: (codes) => {
        // A continuation's retry is the unit's second attempt however many executions it took to reach it (Issue #422,
        // S76d): the deterministic fixture serves attempts in order, so it is told what each unit attempted before.
        if (live === null) {
          // Sampling turns are keyed by the sampling contract this kind binds (Issue #826), as the unit turns are by its prompt.
          const assurance = definition.assurance === null ? {} : { assurancePromptContractDigest: definition.assurance.promptContractDigest };
          return new Ai7LocalDeterministicAdapter(fixture!, promptContractDigest, codes,
            continuation === null ? assurance : { ...assurance, attemptsBefore: ledger.unitAttemptsOf(facts.runRecordId) });
        }
        liveAdapter.instance = new DeepSeekOpenAiCompatibleAdapter({
          broker: this.#broker,
          get slotBinding(): CredentialSlotBinding {
            return { bindingDigest: bindingDigestForSlot, modelRole, slot: credentialSlot, credentialReference };
          },
          tickets: { take: () => { const current = pendingTicket; pendingTicket = null; return current; } },
          attribution: () => ({}),
          promptContractDigest,
          codes,
          signal: active.requestAbort.signal,
          ...(policy.providerProcessing.transport === undefined ? {} : { transportSettings: policy.providerProcessing.transport }),
          profile: routeProfile,
          modelProfile: liveModelProfile,
          sessionId: () => harness.currentSessionId(),
          // Under development validation the captured native `fetch` is reached only through the cache: an identical request
          // replays without transmitting, evidence that already answers the purpose refuses the send, and a live call happens
          // at most once. The bound route profile travels with the call, so the cache step reads a limit the way this route
          // declares limits are read rather than by knowing which route it is serving. Outside it, the call goes straight out.
          transport: validation === null
            ? (url, init) => live.nativeFetch(url, init)
            : (url, init) => transmitOnce(cache!, live.nativeFetch, {
              // S40 unless the kind names its own slice (S84 for writing, #810).
              purpose: testItemPurpose, ...(definition.liveItemSlice === undefined ? {} : { slice: definition.liveItemSlice }),
              promptContractDigest: validationContractOf(), taskPromptContractDigest: promptContractDigest,
            }, {
              intent: validation,
              step: `${testItemPurpose}/${active.validationStep}`,
              requestShape: OPENCODE_GO_V41_FLASH_PROFILE.capabilities.requestShape,
            }, routeProfile, model, url, init),
        });
        return liveAdapter.instance;
      },
      gate: (payload) => {
        if (bindingFacts === null) return { decision: 'refuse', reason: 'binding-stale', detail: '执行绑定尚未持久化；未发送任何内容。' };
        capturePendingLoopUsage();
        const decision = evaluateEgress(payload, { ...bindingFacts, seriesScopeGuard: () => this.#deps.seriesScopeGuard === undefined || this.#deps.seriesScopeGuard === null
          ? definition.seriesScopes === undefined ? null : '无法核对书系检索范围'
          : this.#deps.seriesScopeGuard(facts.runRecordId) }, platformSession?.egressScope ?? { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests, ceilingState });
        admittedPayloadDigest = decision.decision === 'refuse' ? null : decision.payloadDigest;
        return decision;
      },
      onTransmitTicket: (ticket) => {
        if (live === null) {
          throw new ExecutionAdmissionError('EXECUTION_REMOTE_TICKET_FORBIDDEN', 'Provider Processing v1 下不得签发 transmit-remote。');
        }
        pendingTicket = ticket;
      },
    });
    active.harness = harness;
    const spans: HarnessExecutionSpan[] = [];
    let terminalClassification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled' = 'completed';
    // Which of the two developer-live interruptions settled this Run, when one did; the closed CHECK
    // sets record both as `interrupted`, so the distinction lives in the detail, summary, and action.
    let liveInterruption: LiveInterruption | null = null;
    let proxyFailure: string | null = null;
    let materialRefusal: MaterialGuardRefusal | null = null;
    // 模型服务账户限额 met under a Run that keeps its progress (Issue #51, S16b): the provider's words, and the unit it
    // refused — `null` for the reduction or a sampling turn — with what that refused attempt cost. The Run stops resumable
    // at the next boundary. Under developer-live ADR 0067 §Quota ends the Run instead, as it always has.
    let accountLimit: {
      readonly unitOrdinal: number | null;
      readonly condition: string;
      readonly refused?: { readonly attempts: number; readonly wallMs: number; readonly usage: { inputTokens: number; outputTokens: number } | null };
    } | null = null;
    try {
      // The plan remains immutable. An offline-at-start row authorizes exactly the quick composition recorded for this Run.
      const expectedComposition = factualAssurance?.disclosure != null
        ? describeComposition(route, model, definition.promptContractDigest, live === null ? facts.compositionOptions : {
          ...facts.compositionOptions,
          platformTools: false, localTools: false, researchDeclaration: { webSearch: false, searchEngine: null },
        }).digest : facts.behaviorCompositionDigest;
      requireCompositionMatch(harness.composition.digest, expectedComposition);
      requireAssuranceContractMatch(definition, facts.assurancePromptContractDigest);
      const bindingRecord: ExecutionBindingRecord = executionBindingRecordOf({
        facts, definition, live, fixture, attemptId, harnessSessionId, boundAt, compositionDigest: harness.composition.digest,
      });
      const bindingDigest = canonicalRecord(bindingRecord).digest;
      const stages: StageContinuation = keptStages ?? { runRecordId: facts.runRecordId, attemptId, bindingDigest,
        manifestDigest: facts.manifestDigest, promptContractDigest };
      const stageEvidence = (): Record<string, unknown> => {
        if (stages.reduction === undefined) return {};
        const data = canonicalRecord(stages);
        if (data.json.length > 16_000_000) throw new ExecutionAdmissionError('EXECUTION_CHECKPOINT_INVALID', '阶段进度超过可保存范围；不能声称已暂停。');
        return { stageContinuation: { schema: 'ai7.analysis.stage-continuation/1', data: stages, digest: data.digest } };
      };
      // Readiness only: the product path reaches the Protected Secret Store and releases no value.
      const credentialReadiness = await this.#broker.checkReadiness({
        bindingDigest,
        modelRole,
        slot: credentialSlot,
        credentialReference,
      });
      if (stored === null) {
        const persisted = ledger.persistAttemptAndBinding({ runRecordId: facts.runRecordId, binding: bindingRecord, credentialReadiness });
        if (persisted.bindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '执行绑定摘要在持久化时发生变化。');
      } else if (stored.bindingDigest !== bindingDigest) {
        throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '续行时的执行绑定与这次运行持久化的不一致。');
      }
      // A live Run cannot start without its credential: the broker would refuse the release anyway,
      // and refusing here keeps the Run from spending Sessions to reach the same conclusion. A cancellation sends
      // nothing, so a stopped Run the editor cancelled still forms the partial revision of what it kept.
      if (live !== null && credentialReadiness !== 'present' && !active.cancelRequested) {
        throw new ExecutionAdmissionError('EXECUTION_CREDENTIAL_ABSENT', production !== null
          ? `受保护凭据库中没有你为 ${route} 保存的凭据；请在 设置 › 模型服务 重新输入。未发起任何传输。`
          : '受保护凭据库中没有 opencode-go 开发凭据；未发起任何传输。');
      }
      currentBindingDigest = bindingDigest;
      bindingDigestForSlot = bindingDigest;
      const frozenMaterial = liveMaterialContract(definition.clarificationBase ?? definition);
      bindingFacts = {
        bindingDigest,
        route,
        model,
        systemPrompt: definition.systemPrompt,
        // The editor's own words under ordinary production (Issue #811): its units are unpublished excerpts, never public.
        outboundDataCategory: production === null ? 'public-or-synthetic' : 'unpublished-excerpts',
        // The admitted rule's categories, and those the kind's contract carries beside the SampleBook (Issue #429): the gate
        // sends an evaluation's editor-authored record or house exemplars only where the rule names them.
        ...(admitted === null ? {} : {
          ruleOutboundCategories: new Set(admitted.outboundDataCategories),
          contractCategories: new Set(liveKindContractCategories(definition.kind, definition.clarificationBase ?? definition)),
          ...(frozenMaterial === null ? {} : {
            materialExcerpts: frozenMaterial.materials,
            frozenMaterialDigests: new Set(frozenMaterial.sources.map((source) => source.sha256)),
          }),
        }),
        // Under ordinary production the baseline's own rule names the categories its unit messages carry.
        ...(production !== null && admitted === null && productionRule !== null ? { ruleOutboundCategories: new Set(productionRule.outboundDataCategories) } : {}),
        policy: live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 }
          : production !== null
            ? { operationalScope: 'ordinary-production', providerProcessingVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' }
            : { operationalScope: 'developer-live', providerProcessingVersion: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
        admittedUserMessages,
        ...(localRule === null ? {} : { localTools: localRule }),
      };
      if (webTools && facts.webToolsBackend !== undefined && live !== null) {
        const selectedRule = liveKindRule(policy, definition.kind);
        const tools = platformToolsFromProjection(selectedRule);
        if (tools === null) throw new ExecutionAdmissionError('PLATFORM_TOOLS_NOT_NAMED', '本任务的规则未声明联网工具。');
        const backend = searchBackend(facts.webToolsBackend.backendId);
        if (backend.declaration.host !== facts.webToolsBackend.host || searchBackendConfigurationDigest(backend.declaration.id) !== facts.webToolsBackend.configurationDigest || facts.searchCredentialReference === undefined) throw new ExecutionAdmissionError('PLATFORM_TOOL_BACKEND_DRIFT', '冻结的联网检索配置无效。');
        bindingFacts = { ...bindingFacts, platformTools: tools, searchBackend: { backendId: facts.webToolsBackend.backendId,
          host: facts.webToolsBackend.host, endpoint: backend.declaration.endpoint!, credentialSlot: backend.declaration.credentialSlot, credentialReference: facts.searchCredentialReference } };
        const snapshots = cache === null ? null : new ResearchSnapshotCache((live as DeveloperLiveRuntime).launch.providerCacheRoot);
        if (snapshots !== null) await snapshots.open();
        const ready = await this.#broker.checkPlanReadiness(backend.declaration.credentialSlot, facts.searchCredentialReference);
        if (ready !== 'present') throw new ExecutionAdmissionError('SEARCH_CREDENTIAL_MISSING', `${backend.declaration.displayName} 缺少密钥；请在 设置 › 模型服务 › 联网检索 配置。`);
        platformSession = new PlatformToolSession({ binding: bindingFacts, scope: { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests, ceilingState },
          ...(retrieval === null ? {} : { retrieval }),
          fetch: live.nativeFetch, admitHost: admitTicketHost, broker: this.#broker, cache, snapshots, purpose: testItemPurpose, evidenceSearchRoundTripOnly: bootstrap,
          onUsage: (usage) => accumulated.push(usage),
        });
      }
      if (platformSession === null && retrieval !== null) platformSession = new PlatformToolSession({ binding: bindingFacts,
        scope: { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests, ceilingState }, retrieval, purpose: testItemPurpose });
      harness.bindExecution({ harnessSessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest });
      // 取消任务 before the Run kept any unit (CTRL-008): nothing of it is left to gather, so it ends here without
      // provider work and without a revision. A stopped Run that kept units — or whose units asked the editor, their first
      // attempts sent (Issue #422, S76d) — is finished below, sending nothing.
      if (active.cancelRequested && checkpoints.length === 0 && ledger.clarificationsOf(facts.runRecordId).length === 0) {
        recordCancelledWithoutRevision(ledger, facts.runRecordId, facts.taskIntentId, attemptId, CANCELLED_BEFORE_UNITS);
        return;
      }
      // 暂停 before the next unit began: the Run waits here, keeping what it had kept (Issue #422, S76b).
      if (active.pauseRequested && !active.cancelRequested) {
        ledger.recordRunState(facts.runRecordId, 'paused', { detail: active.idleYieldRequested ? RUN_IDLE_YIELD_LABEL : pausedDetail(checkpoints.length, submittedUnits.length), ...(active.idleYieldRequested ? { idleYield: true } : {}), unitsSettled: checkpoints.length, unitsTotal: submittedUnits.length });
        return;
      }
      if (!active.cancelRequested) {
        ledger.recordRunState(facts.runRecordId, 'executing', {
          detail: continuation !== null
            ? `续行：新的执行区段；已读完的 ${checkpoints.length} 个阅读范围沿用，接着读其余 ${submittedUnits.length - checkpoints.length} 个。`
            : update === null ? '执行绑定已持久化并核对；开始逐单元执行。' : '执行绑定已持久化并核对；按血缘复用兼容单元，仅对重算单元逐单元执行。',
          attemptId,
          bindingDigest,
          unitsTotal: manifest.units.length,
          ...(update === null ? {} : { unitsRecomputed: submittedUnits.length, unitsReused: update.reusePlan.counts.reused }),
          ...(continuation === null ? {} : { resumed: true, unitsSettled: checkpoints.length }),
        });
      }

      const outcomes: Array<ClosedUnitOutcome<unknown> | GapUnitOutcome> = [];
      const unitRecords: UnitResultRecord[] = [];
      const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
      // The same turns, counted a second time by the stage they belong to (ADR 0066 §Run Report).
      // Both counters move at the same three call sites, so the report's three revision-facing stages
      // sum to the revision's own usage by construction rather than by subtracting one from another.
      const stageUsage: Record<RunReportRevisionUsageStageId, { requests: number; inputTokens: number; outputTokens: number }> = {
        units: { requests: 0, inputTokens: 0, outputTokens: 0 },
        'cross-unit-reduction': { requests: 0, inputTokens: 0, outputTokens: 0 },
        'assurance-sampling': { requests: 0, inputTokens: 0, outputTokens: 0 },
      };
      // A turn whose model asked for platform tools made one request per step of its loop, and the Run Report counts each (#473).
      const countTurn = (stage: RunReportRevisionUsageStageId, turnUsage: { inputTokens: number; outputTokens: number } | null, signals: ReadonlyArray<HarnessSignal> = []): void => {
        const requests = 1 + signals.filter((signal) => signal.kind === 'progress' && signal.label === PLATFORM_TOOL_CALL_PROGRESS).length;
        usage.requests += requests;
        stageUsage[stage].requests += requests;
        if (turnUsage === null) return;
        usage.inputTokens += turnUsage.inputTokens;
        usage.outputTokens += turnUsage.outputTokens;
        stageUsage[stage].inputTokens += turnUsage.inputTokens;
        stageUsage[stage].outputTokens += turnUsage.outputTokens;
        // The ceiling counts every attempt, including a safe retry's, from this instant onward.
        accumulated.push(turnUsage);
      };
      const clock = new RunStageClock();
      // What the owner saw while it settled each unit; a reused unit and one never reached have none.
      const unitObservations = new Map<number, RunReportUnitObservation>();
      const reusedOrdinals = new Set<number>();
      // Reused units are copied by lineage before any model call; they never form a request or count usage.
      // Units a scope plan leaves unreviewed are settled here too, and for the same reason: nothing about
      // them waits on a model. Each is an exact `out-of-scope` gap — the Run was asked not to read it — or,
      // when its last read failed, the lost gap it still is (Issue #716), recorded with the request digest it
      // would have carried, as every other unread unit is.
      const unknownPredecessorGaps = predecessorFacts === null ? new Map<string, string>() : ledger.unknownGapsByContentKey(predecessorFacts.revisionId);
      for (const planUnit of planUnits) {
        const newUnit = manifest.units[planUnit.unitOrdinal - 1];
        if (planUnit.disposition === 'unreviewed') {
          if (newUnit === undefined) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '审阅范围计划引用的单元不在覆盖清单内。');
          // One whose last read failed is carried as the lost gap it is, never as out of scope (Issue #716).
          const carried = planUnit.reason === 'predecessor-gap';
          const unknownReason = carried ? unknownPredecessorGaps.get(planUnit.contentKey) : undefined;
          const code = unknownReason !== undefined ? 'outcome-unknown' : carried ? 'not-attempted' : 'out-of-scope';
          const reason = unknownReason !== undefined ? carriedOutcomeUnknownReason(unknownReason) : carried ? CARRIED_GAP_REASON : OUT_OF_SCOPE_GAP_REASON;
          outcomes.push({ unitOrdinal: newUnit.ordinal, state: 'gap', code, reason });
          unitRecords.push({
            unitOrdinal: newUnit.ordinal,
            requestDigest: definition.requestDigest(newUnit.ordinal, newUnit.digest),
            lineage: { kind: 'unreviewed' },
            closed: {
              state: 'gap',
              gap: { unitOrdinal: newUnit.ordinal, code, reason, startPosition: newUnit.startPosition, endPosition: newUnit.endPosition, blockIds: [...newUnit.blockIds] },
            },
          });
          continue;
        }
        if (planUnit.disposition !== 'reused' || planUnit.reusedFrom === null) continue;
        const source = predecessorResults.get(planUnit.reusedFrom.unitOrdinal);
        const predecessorUnit = predecessorFacts?.manifest.units[planUnit.reusedFrom.unitOrdinal - 1];
        if (source === undefined || predecessorUnit === undefined || newUnit === undefined) {
          throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用计划引用的前一单元结果不存在。');
        }
        // How a reused result is carried onto the new unit is the kind's to say: the baseline contract
        // cites blocks by identity and remaps them, a positional contract carries its result unchanged.
        const result = definition.remapReusedResult(source.result, predecessorUnit, newUnit);
        reusedOrdinals.add(newUnit.ordinal);
        outcomes.push({ unitOrdinal: newUnit.ordinal, state: 'closed', result });
        unitRecords.push({
          unitOrdinal: newUnit.ordinal,
          requestDigest: source.requestDigest,
          lineage: { kind: 'reused', revisionId: planUnit.reusedFrom.revisionId, revisionOrdinal: planUnit.reusedFrom.revisionOrdinal, unitOrdinal: planUnit.reusedFrom.unitOrdinal },
          closed: { state: 'closed', responseDigest: source.responseDigest, usage: source.usage, result: definition.unitRecord(result) },
        });
      }
      // 续行 continues the attempt's own numbering: its spans after the last recorded, its adaptations after theirs.
      const priorAdaptations = continuation === null ? [] : ledger.adaptationsOf(facts.runRecordId);
      let spanOrdinal = stored?.spanCount ?? 0;
      let adaptationOrdinal = priorAdaptations.length;
      const contractRule = liveKindRule(policy, definition.kind, [], facts.origin === 'background-analysis-enrollment' ? 'background' : 'foreground');
      const contractDeclared = definition.contractIdentity?.version === 2 &&
        (ledger.frozenPlan(facts.taskIntentId, facts.planEnvelopeDigest).components['plan-envelope'] as { boundary?: { adaptable?: ReadonlyArray<{ adaptationClass: string }> } })
          .boundary?.adaptable?.some((entry) => entry.adaptationClass === 'contract-retry') === true;
      const contractAllowed = live === null || contractRule?.plusDeclaredContractRetryAdaptations === true;
      const adaptedUnitOrdinals: number[] = priorAdaptations.map((entry) => entry.unitOrdinal);
      // The units the Run kept before it stopped count as settled here exactly as they did then: their results, their
      // observations, their usage — toward the revision, the report and the ceiling alike — and their accepted answers.
      for (const checkpoint of checkpoints) {
        const kept = checkpoint.unit;
        unitRecords.push(kept);
        if (kept.closed.state === 'closed') {
          outcomes.push({ unitOrdinal: kept.unitOrdinal, state: 'closed', result: checkpoint.result });
          acceptedOutputDigests.add(kept.closed.responseDigest);
        } else {
          outcomes.push({ unitOrdinal: kept.unitOrdinal, state: 'gap', code: kept.closed.gap.code, reason: kept.closed.gap.reason });
        }
        const observation = checkpoint.observation;
        if (observation === null) continue;
        unitObservations.set(kept.unitOrdinal, observation);
        usage.requests += observation.attempts;
        stageUsage.units.requests += observation.attempts;
        active.progress.completedAttempts += observation.attempts;
        if (observation.usage !== null) {
          usage.inputTokens += observation.usage.inputTokens;
          usage.outputTokens += observation.usage.outputTokens;
          stageUsage.units.inputTokens += observation.usage.inputTokens;
          stageUsage.units.outputTokens += observation.usage.outputTokens;
          accumulated.push(observation.usage);
        }
      }
      active.progress.unitsSettled = checkpoints.length;
      // What an earlier stop left spent beyond its units — settled or refused stage work — still counts
      // toward the ceiling (Issue #51, S16a), and in the Run's usage and its report by the stage it was spent in (Issue #541):
      // the Run spent it, whatever it keeps. A stop recorded before the stages were kept counts toward the ceiling only.
      const carriedStop = continuation === null ? null : ledger.carriedUsageOf(facts.runRecordId);
      const unattributed = { inputTokens: carriedStop?.inputTokens ?? 0, outputTokens: carriedStop?.outputTokens ?? 0 };
      if (unattributed.inputTokens + unattributed.outputTokens > 0) accumulated.push({ ...unattributed });
      for (const stage of CARRIED_STAGES) {
        const kept = carriedStop?.stages?.[stage];
        if (kept === undefined) continue;
        stageUsage[stage].requests += kept.requests;
        stageUsage[stage].inputTokens += kept.inputTokens;
        stageUsage[stage].outputTokens += kept.outputTokens;
        usage.requests += kept.requests;
        usage.inputTokens += kept.inputTokens;
        usage.outputTokens += kept.outputTokens;
        unattributed.inputTokens -= kept.inputTokens;
        unattributed.outputTokens -= kept.outputTokens;
      }
      // The attempt a provider's account limit refused before 续行 (Issue #51, S16b) was sent: it counts toward the Run and
      // the ceiling, and its range's row carries it once the range is read again — or ends it as the gap it is.
      const lastStop = continuation === null ? null : ledger.accountLimitStopOf(facts.runRecordId);
      const refused = lastStop !== null && lastStop.unitOrdinal !== null && lastStop.refusedAttempt !== null && !checkpointed.has(lastStop.unitOrdinal)
        ? { unitOrdinal: lastStop.unitOrdinal, condition: lastStop.condition, ...lastStop.refusedAttempt }
        : null;
      if (refused !== null) {
        usage.requests += refused.attempts;
        stageUsage.units.requests += refused.attempts;
        active.progress.completedAttempts += refused.attempts;
        if (refused.usage !== null) {
          usage.inputTokens += refused.usage.inputTokens;
          usage.outputTokens += refused.usage.outputTokens;
          stageUsage.units.inputTokens += refused.usage.inputTokens;
          stageUsage.units.outputTokens += refused.usage.outputTokens;
          accumulated.push(refused.usage);
        }
      }
      // Units whose safe retry waits for the editor's answer (Issue #422, S76d; CLAR-004). A question the Run asked before
      // it stopped is still its own, answered or not: its unit is not read again until the answer says so, and what its
      // first attempt cost counts toward the Run as it did then.
      type WaitingUnit = {
        readonly unit: CoverageManifestUnitProjection;
        readonly requestDigest: string;
        readonly failure: ClarificationFacts['failure'];
        readonly firstPayloadDigest: string | null;
        readonly firstUnitMessageDigest: string | null;
        readonly attempts: number;
        readonly usage: { inputTokens: number; outputTokens: number } | null;
        readonly wallMs: number;
      };
      const waiting = new Map<number, WaitingUnit>();
      for (const request of ledger.clarificationsOf(facts.runRecordId)) {
        const unit = submittedUnits.find((entry) => entry.ordinal === request.unitOrdinal);
        if (unit === undefined || checkpointed.has(unit.ordinal)) continue;
        waiting.set(unit.ordinal, {
          unit, requestDigest: request.requestDigest, failure: request.failure, firstPayloadDigest: request.firstPayloadDigest,
          firstUnitMessageDigest: request.firstUnitMessageDigest, attempts: request.firstAttempts ?? 1, usage: request.firstUsage, wallMs: request.firstWallMs,
        });
        usage.requests += request.firstAttempts ?? 1;
        stageUsage.units.requests += request.firstAttempts ?? 1;
        active.progress.completedAttempts += request.firstAttempts ?? 1;
        if (request.firstUsage !== null) {
          usage.inputTokens += request.firstUsage.inputTokens;
          usage.outputTokens += request.firstUsage.outputTokens;
          stageUsage.units.inputTokens += request.firstUsage.inputTokens;
          stageUsage.units.outputTokens += request.firstUsage.outputTokens;
          accumulated.push(request.firstUsage);
        }
      }
      const remainingUnits = submittedUnits.filter((unit) => !checkpointed.has(unit.ordinal) && !waiting.has(unit.ordinal));
      // One technical turn for one unit attempt: the span is recorded by reference with the attempt index, the admitted
      // payload digest and the digest of the unit message it submitted — and a safe retry's, the adaptation it carries out
      // (Issue #286) — and every attempt's usage counts toward the Run.
      const submitAttempt = async (unit: CoverageManifestUnitProjection, attemptIndex: number, attemptState: RunAttemptState, adaptationId: string | null = null, answerMessage?: string) => {
        admittedPayloadDigest = null;
        // The baseline this attempt's `awaiting-response` is derived against, taken before the harness
        // can enter the transport, so the reading belongs to this attempt and not the previous one.
        active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
        active.progress.attemptState = attemptState;
        active.validationStep = `unit-${unit.ordinal}${answerMessage === undefined ? '' : '-clarification-answer'}`;
        const message = answerMessage ?? unitMessages.get(unit.ordinal)!;
        admittedUserMessages.add(message);
        const unitMessageDigest = sha256Hex(message);
        platformSession?.startUnit();
        const turn = await harness.submitUnit(message);
        if (platformSession?.evidenceNeedsCommander === true) throw new ExecutionAdmissionError('PLATFORM_TOOL_EVIDENCE_MORE_SEARCH_REQUIRED', '本证据项需要第二次新检索；等待 Commander。');
        pendingLoopUsage.length = 0;
        // Read before anything else can start a turn: the adapter clears this at the start of every
        // stream, so it is this attempt's result or nothing.
        const canonical = liveAdapter.instance?.lastCanonicalResult ?? null;
        const retryDelayMs = liveAdapter.instance?.lastRetryDelayMs ?? null;
        // J-10's unit hold (Issue #422): the turn is back and the unit stays in flight until the Journey lets it settle.
        if (this.#deps.unitHold) await this.#deps.unitHold(active.progress.unitsSettled, () => active.interrupted);
        const payloadDigest = admittedPayloadDigest;
        spanOrdinal += 1;
        spans.push(turn.span);
        ledger.recordSpan(attemptId, spanOrdinal, turn.span, unit.ordinal, { attemptIndex, payloadDigest, unitMessageDigest, adaptationId });
        const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
        const unitUsage = usageSignal?.kind === 'usage' ? (platformSession === null ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens } : { ...usageSignal.usage }) : null;
        countTurn('units', unitUsage, turn.signals);
        // One model turn came back. It counts whether it transmitted, replayed from the Provider Result
        // Cache, or read the deterministic fixture: what the reader learns is that the Run is moving.
        active.progress.completedAttempts += 1;
        return { turn, unitUsage, payloadDigest, unitMessageDigest, canonical, retryDelayMs };
      };
      type SubmittedAttempt = Awaited<ReturnType<typeof submitAttempt>>;
      // The continuation point (CONT-015): a unit is kept the moment it settles, as its revision will hold it, and the
      // reader sees the count move and nothing in flight.
      const keepSettled = (unit: CoverageManifestUnitProjection, wallMs: number): void => {
        const settledRecord = unitRecords.find((record) => record.unitOrdinal === unit.ordinal);
        if (settledRecord !== undefined) {
          ledger.recordUnitCheckpoint({ runRecordId: facts.runRecordId, attemptId, unit: settledRecord, observation: unitObservations.get(unit.ordinal) ?? null });
        }
        active.progress.unitsSettled += 1;
        // The bar the stale case is measured against is this Run's own longest settled step, so a model
        // that answers in ninety seconds and one that answers in ten are each judged by their own pace.
        // A unit that settled as a gap took real time too, and counts.
        active.progress.longestSettledUnitMs = Math.max(active.progress.longestSettledUnitMs ?? 0, wallMs);
        // Between two units nothing is in flight, so the reader sees the count and not the unit that just settled.
        active.progress.currentUnitOrdinal = null;
        active.progress.currentUnitStartedAt = null;
        active.progress.attemptState = null;
      };
      // A unit that settles as a gap, with what the Run Report records about it.
      const settleGap = (unit: CoverageManifestUnitProjection, requestDigest: string, observation: RunReportUnitObservation, code: AnalysisGapProjection['code'], reason: string): void => {
        unitObservations.set(unit.ordinal, observation);
        outcomes.push({ unitOrdinal: unit.ordinal, state: 'gap', code, reason });
        unitRecords.push({
          unitOrdinal: unit.ordinal,
          requestDigest,
          lineage: { kind: 'recomputed' },
          closed: { state: 'gap', gap: { unitOrdinal: unit.ordinal, code, reason, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } },
        });
      };
      /**
       * A unit settled from the turn that ends it — its only attempt, or its safe retry — closed, or the gap it is. `end` is a
       * gap that ends the Run (a Provider Account Limit, an interruption, a turn the harness could not end), which is not kept.
       * A sent request whose result cannot be known (Issue #51, S16c) is kept at once as its own `outcome-unknown` gap, and the
       * Run reads on.
       */
      const settleFromTurn = (s: {
        readonly unit: CoverageManifestUnitProjection;
        readonly requestDigest: string;
        readonly attempt: SubmittedAttempt;
        readonly attempts: number;
        readonly usage: { inputTokens: number; outputTokens: number } | null;
        readonly wallMs: number;
        readonly firstFailure: { readonly reason: string; readonly code: string } | null;
        readonly withheld: string | null;
      }): 'settled' | 'end' | 'stop' | 'waiting' => {
        const { unit, requestDigest } = s;
        const { turn, unitUsage } = s.attempt;
        const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
        const observation: RunReportUnitObservation = { unitOrdinal: unit.ordinal, attempts: s.attempts, wallMs: s.wallMs, usage: s.usage };
        const gap = (code: AnalysisGapProjection['code'], reason: string): void => settleGap(unit, requestDigest, observation, code, reason);
        if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate' && s.attempt.canonical?.kind === 'empty-answer') {
          // The model was reached and answered in the channel its profile declares, and the channel
          // was empty. That is not a contract the model broke — there is nothing to parse — so the
          // empty string never reaches `parseUnitResult`, whose only reading of it is `not-json`.
          // The gap keeps the existing closed code, which is a closed union and stays one.
          acceptedOutputDigests.add(candidate.digest);
          gap('contract-invalid', emptyAnswerGapReason(s.attempt.canonical.reasoningPresent));
        } else if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
          const question = parseModelClarification(candidate.text);
          if (question !== null) {
            acceptedOutputDigests.add(candidate.digest);
            const origin = ledger.inspect(facts.manifest.manuscript.bookId).authorization?.origin === 'background-analysis-enrollment' ? 'background' : 'foreground';
            const rule = live === null ? null : liveKindRule(policy, definition.kind, [], origin);
            const allowed = live === null ? definition.clarificationBase !== undefined
              : rule?.clarificationQuestionAllowed === true && rule.clarificationTimeoutHours === 24;
            if (!allowed || ledger.clarificationsOf(facts.runRecordId).some((entry) => entry.unitOrdinal === unit.ordinal)) {
              gap('contract-invalid', allowed ? '同一阅读范围只能提问一次；模型再次提问，记为契约无效缺口。' : '该任务的准许规则不允许模型提问，记为契约无效缺口。');
              keepSettled(unit, s.wallMs);
              return 'settled';
            }
            const failure = { code: 'MODEL_CLARIFICATION', failureClass: 'model-question', status: null, reason: '模型提出一个需要你决定的问题。' };
            ledger.recordClarificationRequest({ runRecordId: facts.runRecordId, attemptId, taskIntentId: facts.taskIntentId,
              unitOrdinal: unit.ordinal, planVersion: facts.planVersionOrdinal, planEnvelopeDigest: facts.planEnvelopeDigest,
              requestDigest, failure, modelQuestion: question, firstAttempts: s.attempts, firstPayloadDigest: s.attempt.payloadDigest,
              firstUnitMessageDigest: s.attempt.unitMessageDigest, firstUsage: s.usage, firstWallMs: s.wallMs });
            waiting.set(unit.ordinal, { unit, requestDigest, failure, firstPayloadDigest: s.attempt.payloadDigest,
              firstUnitMessageDigest: s.attempt.unitMessageDigest, attempts: s.attempts, usage: s.usage, wallMs: s.wallMs });
            active.progress.currentUnitOrdinal = null;
            active.progress.currentUnitStartedAt = null;
            active.progress.attemptState = null;
            return 'waiting';
          }
          const validated = prepareRetrievalResult(candidate.text, retrieval);
          if (validated.rejected.some((entry) => entry.collection !== 'findings' && entry.collection !== 'assertions')) {
            acceptedOutputDigests.add(candidate.digest);
            gap('contract-invalid', '未经精确取文');
            keepSettled(unit, s.wallMs);
            return 'settled';
          }
          const parsed = definition.parseUnitResult(validated.text, unit);
          if (parsed.ok) {
            markRetrievalResult(parsed.result, validated.rejected);
            // Factual Review Contract v2 (Issue #901): each in-Book relation's excerpt is sought by Exact Fetch now, while the
            // Run's retrieval index is open; one it does not find stays a candidate (EVID-004, EVID-005).
            const result = definition.unitResultSchema === FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA
              ? markInBookExactFetch(parsed.result as unknown as FactualReviewUnitResultV2, retrieval === null ? null : (candidateId) => retrieval.exactFetch(candidateId))
              : parsed.result;
            unitObservations.set(unit.ordinal, observation);
            acceptedOutputDigests.add(candidate.digest);
            outcomes.push({ unitOrdinal: unit.ordinal, state: 'closed', result });
            unitRecords.push({
              unitOrdinal: unit.ordinal,
              requestDigest,
              lineage: { kind: 'recomputed' },
              closed: { state: 'closed', responseDigest: candidate.digest, usage: unitUsage, result: definition.unitRecord(result) },
            });
          } else {
            acceptedOutputDigests.add(candidate.digest);
            gap('contract-invalid', unparsableAnswerGapReason(parsed.code, parsed.detail, candidate.text));
          }
        } else if (turn.terminal === 'completed') {
          gap('contract-invalid', '技术回合完成但没有模型输出。');
        } else if (turn.terminal === 'failed') {
          const failure = turn.signals.find((signal) => signal.kind === 'failed');
          const breakerEnd = platformSession?.unitEnd(turn);
          const reason = breakerEnd !== undefined && breakerEnd !== null ? breakerEnd.disclosure : failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。';
          // 模型服务账户限额 (Issue #51, S16b; MODEL-018): a Run that keeps its progress stops here with the unit unsettled —
          // no gap, no retry, no fallback, no second model — and 续行 reads it again once the limit clears.
          if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit' && active.resumableOnInterrupt &&
              (live === null || production !== null)) {
            accountLimit = { unitOrdinal: unit.ordinal, condition: reason, refused: { attempts: s.attempts, wallMs: s.wallMs, usage: s.usage } };
            return 'stop';
          }
          // A second failure names both attempts; the unit is never retried again. One the plan did not let AI7
          // retry says so, so the gap reads as the editor's choice and not as a retry that failed.
          gap('adapter-failure', s.firstFailure !== null
            ? `第 1 次尝试：${s.firstFailure.reason}（${s.firstFailure.code}）；安全重试后第 2 次尝试：${reason}`
            : s.withheld !== null ? `${reason}；${s.withheld}` : reason);
          // A Provider Account Limit ends a Run that keeps no progress outright: no retry, no fallback, no second model.
          if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit') {
            liveInterruption = 'provider-account-limit';
            terminalClassification = 'interrupted';
            return 'end';
          }
        } else if (turn.terminal === 'interrupted') {
          const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
          if (failure?.kind === 'interrupted' && failure.failure.failureClass === 'proxy-unreachable' && active.resumableOnInterrupt) {
            proxyFailure = failure.failure.reason;
            active.interrupted = true;
            return 'stop';
          }
          const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
          gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '请求被中断。');
          // An egress refusal that names the ceiling is the ceiling settlement, not a bare interruption.
          if (egress && ceilingState() === 'reached') liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          return 'end';
        } else {
          const ambiguous = turn.signals.find((signal) => signal.kind === 'ambiguous');
          // 结果待确认 (Issue #51, S16c; CTRL-007, CONT-011): the request was sent and its result cannot be known. Nothing in this
          // Run sends it again — not a safe retry, not a fallback, not a continuation — since a second request could bill and
          // apply again: it is kept at once as its own gap, which every later continuation reads back as settled.
          if (ambiguous?.kind === 'ambiguous' && ambiguous.failure !== undefined) {
            const said = `${ambiguous.failure.reason.replace(/^结果待确认/u, '该单元结果未知')}（${ambiguous.failure.code}）`;
            const reason = s.firstFailure !== null ? `第 1 次尝试：${s.firstFailure.reason}（${s.firstFailure.code}）；安全重试后第 2 次尝试：${said}` : said;
            gap('outcome-unknown', `${reason}；${OUTCOME_UNKNOWN_NOT_RESENT}`);
          } else {
            gap('interrupted', '技术回合结果不明确；自动重试与回退已停止。');
            terminalClassification = 'interrupted';
            return 'end';
          }
        }
        keepSettled(unit, s.wallMs);
        return 'settled';
      };
      /**
       * The External Evidence Retention Procedure (Issue #425, S70; SRC-013, EGR-003): the moment a research unit of 事实核查
       * settles, what its tools brought back is retained within the authorizing Task — each cited page the model read, else one
       * retention fetch of it while the Run may still send, else the excerpt its search returned — aligned to the citations,
       * with the unit's search outcome. A cancellation, a pause, AI7 stopping or a reached ceiling sends nothing more: what was
       * already captured is kept. A failure to keep it never ends the Run; the unit simply has no retained evidence.
       */
      const retainUnit = async (unit: CoverageManifestUnitProjection): Promise<void> => {
        const sink = this.#deps.researchEvidence;
        const session = platformSession;
        // A session that carries only the local tools retains no external evidence (#893).
        if (session === null || facts.webToolsBackend === undefined || sink === undefined || sink === null || (definition.platformToolBase ?? definition).kind !== FACTUAL_REVIEW_KIND) return;
        const outcome = outcomes.find((entry) => entry.unitOrdinal === unit.ordinal);
        if (outcome === undefined) return;
        let retentionFailure: 'capture-processing' | 'storage' = 'capture-processing';
        const located = outcome.state === 'closed' ? locatedUnitFindings(unit, outcome.result as FactualReviewUnitResult, blocksById) : [];
        // Factual Review Contract v2 (Issue #901): every https source a finding's relations name is a citation of that finding,
        // retained as its basis's addresses are — so a relation can later be checked against what AI7 captured of it.
        const findings = outcome.state === 'closed' && (outcome.result as { schema?: unknown }).schema === FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA
          ? withRelationCitations(located, unit, outcome.result as unknown as FactualReviewUnitResultV2) : located;
        try {
          const captures = session.unitCaptures;
          const pages = new Map<string, RetainedPage>();
          for (const snapshot of captures.fetches) {
            const page = retainedPageOf(snapshot);
            if (page !== null) pages.set(page.url, page);
          }
          const lastSearch = captures.searches.at(-1);
          const retained = await retainUnitEvidence({
            findings,
            sources: [...captures.searches.flatMap(searchHitsOf), ...captures.fetches.map((snapshot) => ({ url: snapshot.url, title: null, snippet: null, via: 'fetch' as const }))],
            pages,
            searchSnapshotDigest: lastSearch === undefined ? null : researchSnapshotDigest(lastSearch),
            searchState: session.breakerState === 'tripped' || session.unitDisclosure === '联网核查未完成' ? 'incomplete' : captures.searchCalls > 0 ? 'completed' : 'not-searched',
            searchCalls: captures.searchCalls,
            fetchAllowed: () => !active.cancelRequested && !active.interrupted && liveInterruption === null && ceilingState() !== 'reached',
            fetch: async (url) => {
              const got = await session.retain(url);
              return 'failed' in got ? got : retainedPageOf(got) ?? { failed: '取回的页面没有可读的正文。' };
            },
            // No Provider Processing policy names a translation step yet: the rule reads its scope alone, and 来源译文 refuses.
            rule: { operationalScope: bindingFacts?.policy.operationalScope ?? 'unbound' },
            translator: null,
            now: () => new Date(),
          });
          retentionFailure = 'storage';
          sink({ bookId: facts.manifest.manuscript.bookId, runRecordId: facts.runRecordId, unitOrdinal: unit.ordinal, backendId: facts.webToolsBackend?.backendId ?? null, unit: retained });
        } catch {
          // Keep a payload-free failure class, never the exception or a page body. This remains a partial Run result.
          sink({ bookId: facts.manifest.manuscript.bookId, runRecordId: facts.runRecordId, unitOrdinal: unit.ordinal,
            backendId: facts.webToolsBackend?.backendId ?? null, unit: {
              state: 'incomplete', searchCalls: session.unitCaptures.searchCalls, retentionFetches: 0, failedRetrievals: 0,
              findings: findings.map(({ findingId, blockId, quote, category }) => ({ findingId, blockId, quote, category, sources: 0 })), evidence: [], retentionFailure,
            } });
        }
      };
      const settleAndRetain = async (input: Parameters<typeof settleFromTurn>[0]): Promise<ReturnType<typeof settleFromTurn>> => {
        const settled = settleFromTurn(input);
        if (settled === 'settled') await retainUnit(input.unit);
        return settled;
      };
      /**
       * The `safe-retry` Plan Adaptation: recorded before the retry is dispatched, inside the unchanged envelope and Execution
       * Binding; the retry repeats the byte-identical unit message once. The Run makes it on its own, or — moved into 先问你
       * (Issue #422, S76d) — once the editor answered 再试一次, and then the record names that answer. The record names the
       * first attempt's digests, and the retry's span names the record (Issue #286).
       */
      /**
       * The material guard (Issue #759), asked with the current-read guard below and alone before each sampling turn and the
       * reflection: a frozen 资料库 reference that no longer reads as the plan pinned stops the Run there, what it read kept.
       */
      const materialChanged = (): boolean => {
        if (active.cancelRequested || liveInterruption !== null) return false;
        materialRefusal = this.#deps.materialGuard?.(facts.runRecordId, ledger) ?? null;
        if (materialRefusal === null) return false;
        liveInterruption = 'material-reference-changed';
        terminalClassification = 'interrupted';
        return true;
      };
      /**
       * The current-read guard (Issue #64, S29b; SER-023, SER-028), asked before every further transmission of this Run — a range,
       * a retry, the reduction, the sample and the reflection: once an exclusion in force reaches what the plan froze, the Run
       * stops there as the scope changed. A cancellation, or a stop already decided, outranks it.
       */
      const scopeChanged = (): boolean => {
        if (materialChanged()) return true;
        if (!active.cancelRequested && liveInterruption === null && this.#deps.influenceGuard?.(facts.runRecordId) != null) {
          liveInterruption = 'learning-influence-withdrawn';
          terminalClassification = 'interrupted';
          return true;
        }
        if (active.cancelRequested || liveInterruption !== null || this.#deps.seriesScopeGuard?.(facts.runRecordId) == null) return false;
        liveInterruption = 'series-retrieval-scope-changed';
        terminalClassification = 'interrupted';
        return true;
      };
      const safeRetry = async (
        unit: CoverageManifestUnitProjection,
        requestDigest: string,
        failure: { readonly reason: string; readonly code: string; readonly failureClass: string; readonly status: number | null },
        first: { readonly payloadDigest: string | null; readonly unitMessageDigest: string | null },
        answerId: string | null,
        retryDelayMs: number | null = null,
      ): Promise<SubmittedAttempt | null> => {
        if (failure.code === 'RATE_LIMIT' && !rateLimitRetryAllowed(policy)) return null;
        if (live !== null && routeProfile.limitPolicy === 'rate-limit-retryable' &&
            (failure.code === 'RATE_LIMIT' || (failure.code === 'PROVIDER_ERROR' && failure.status !== null && failure.status >= 500 && failure.status <= 599))) {
          const signal = active.requestAbort.signal;
          await new Promise<void>((resolve) => {
            if (signal.aborted) { resolve(); return; }
            const finish = (): void => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, policy.providerProcessing.transport?.rateLimitRetry.honourRetryAfter === false ? 5_000 : retryDelayMs ?? 5_000);
            signal.addEventListener('abort', finish, { once: true });
          });
        }
        // The wait is outside the adaptation: cancellation, pause, scope and budget are checked again before a send.
        if (active.cancelRequested || active.pauseRequested || active.interrupted || liveInterruption !== null || scopeChanged()) return null;
        if (ceilingState() === 'reached') {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          return null;
        }
        adaptationOrdinal += 1;
        const adaptation = ledger.recordAdaptation({
          attemptId,
          runRecordId: facts.runRecordId,
          taskIntentId: facts.taskIntentId,
          ordinal: adaptationOrdinal,
          unitOrdinal: unit.ordinal,
          classifiedReason: failure.reason,
          failureCode: failure.code,
          failureClass: failure.failureClass,
          failureStatus: failure.status,
          requestDigest,
          firstPayloadDigest: first.payloadDigest,
          firstUnitMessageDigest: first.unitMessageDigest,
          planEnvelopeDigest: facts.planEnvelopeDigest,
          bindingDigest,
          ...(answerId === null ? {} : { clarificationAnswerId: answerId }),
        });
        adaptedUnitOrdinals.push(unit.ordinal);
        if (currentBindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '计划内调整期间执行绑定发生变化。');
        return submitAttempt(unit, 2, 'retrying', adaptation.adaptationId);
      };
      /**
       * An answer the editor gave, applied at a unit boundary (CLAR-006): 再试一次 makes the safe retry now, inside the
       * unchanged envelope; 不重试，记为缺口 settles the unit as the gap it is. The ledger is read each time, so an answer
       * given while the Run went on is found at the next boundary. `applied` when one was, `none` when nothing waited on
       * an answer, `stopped` when the Run is stopping, and `end` when a retry's gap ended the Run.
       */
      const applyAnswers = async (): Promise<'none' | 'applied' | 'stopped' | 'end'> => {
        if (waiting.size === 0) return 'none';
        ledger.expireModelClarifications(facts.runRecordId);
        const answered = ledger.clarificationsOf(facts.runRecordId).filter((entry) => entry.answer !== null && waiting.has(entry.unitOrdinal));
        if (answered.length === 0) return 'none';
        let spent = false;
        for (const entry of answered) {
          // A cancellation outranks every answer (CTRL-005).
          if (active.cancelRequested) return spent ? 'end' : 'stopped';
          const w = waiting.get(entry.unitOrdinal)!;
          if (entry.origin === 'model') {
            if (active.interrupted || active.pauseRequested) return spent ? 'end' : 'stopped';
            if (scopeChanged() || ceilingState() === 'reached') {
              if (ceilingState() === 'reached') { liveInterruption = 'run-budget-ceiling-reached'; terminalClassification = 'interrupted'; }
              return 'end';
            }
            waiting.delete(entry.unitOrdinal);
            // An append-only pre-send claim prevents a restart or a repeated answer from sending this turn twice.
            if (!ledger.claimModelClarificationAnswer(facts.runRecordId, entry.requestId)) {
              settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
                'outcome-unknown', '澄清回答回合已提交，结果尚未确认；这次运行不会再次发送。');
              keepSettled(w.unit, w.wallMs);
              continue;
            }
            active.progress.currentUnitOrdinal = w.unit.ordinal;
            active.progress.currentUnitStartedAt = new Date().toISOString();
            const startedAt = Date.now();
            const attempt = await submitAttempt(w.unit, w.attempts + 1, 'dispatched', null,
              buildClarificationAnswerMessage(unitMessages.get(w.unit.ordinal)!, entry));
            const settled = await settleAndRetain({ unit: w.unit, requestDigest: w.requestDigest, attempt, attempts: w.attempts + 1,
              usage: addUsage(w.usage, attempt.unitUsage), wallMs: w.wallMs + Date.now() - startedAt, firstFailure: null, withheld: null });
            if (settled === 'end' || settled === 'stop') return 'end';
            continue;
          }
          const retry = entry.answer!.optionId !== 'record-gap';
          // 再试一次 once the ceiling is spent (Issue #51, S16a): the retry is not sent, and the Run stops as the ceiling reached
          // — once every other answer given is applied too, each as the editor chose. The ceiling is read before a pause or
          // AI7 stopping, as at every boundary (Issue #541): a retry it keeps back is never left for a pause to hide.
          // 再试一次 once the scope changed (Issue #64, S29b): the retry is not sent, and the Run stops as the scope changed.
          if (retry && (liveInterruption === 'series-retrieval-scope-changed' || liveInterruption === 'material-reference-changed' || liveInterruption === 'learning-influence-withdrawn' || scopeChanged())) {
            waiting.delete(entry.unitOrdinal);
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${materialRefusal !== null ? materialInterruptionMessage(materialRefusal) : liveInterruption === 'learning-influence-withdrawn' ? '本社审阅偏好已停止使用，没有再试一次' : SAFE_RETRY_SCOPE_CHANGED}`);
            keepSettled(w.unit, w.wallMs);
            spent = true;
            continue;
          }
          if (retry && ceilingState() === 'reached') {
            waiting.delete(entry.unitOrdinal);
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${SAFE_RETRY_BUDGET_REACHED}`);
            keepSettled(w.unit, w.wallMs);
            liveInterruption = 'run-budget-ceiling-reached';
            terminalClassification = 'interrupted';
            spent = true;
            continue;
          }
          // A pause lapses at a spent ceiling, as at every boundary: nothing more is sent, so the answers after this one are
          // applied too — a 再试一次 later in unit order is kept back in the ceiling's words, never left to read 未接着做.
          if (active.interrupted || (active.pauseRequested && ceilingState() !== 'reached')) return spent ? 'end' : 'stopped';
          waiting.delete(entry.unitOrdinal);
          active.progress.currentUnitOrdinal = w.unit.ordinal;
          active.progress.currentUnitStartedAt = new Date().toISOString();
          if (!retry) {
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${CLARIFICATION_RECORD_GAP}`);
            keepSettled(w.unit, w.wallMs);
            continue;
          }
          // The retry repeats what the first attempt sent, byte for byte, or is not sent (Issue #286): a Run continued where
          // the unit's message now reads otherwise — a later AI7 building it differently — settles the unit as the gap it
          // is, and records no adaptation. Within one execution the message is the one the first attempt sent.
          if (w.firstUnitMessageDigest !== null && sha256Hex(unitMessages.get(w.unit.ordinal)!) !== w.firstUnitMessageDigest) {
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${SAFE_RETRY_NOT_REPEATED}`);
            keepSettled(w.unit, w.wallMs);
            continue;
          }
          const startedAtMs = Date.now();
          const attempt = await safeRetry(w.unit, w.requestDigest, w.failure,
            { payloadDigest: w.firstPayloadDigest, unitMessageDigest: w.firstUnitMessageDigest }, entry.answer!.answerId);
          if (attempt === null) {
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}；安全重试等待期间运行已停止；没有再次发送。`);
            keepSettled(w.unit, w.wallMs);
            return 'stopped';
          }
          // AI7 stopping under the retry cut it off: the unit is not settled, and 续行 applies the answer again.
          if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) return 'stopped';
          const settled = await settleAndRetain({
            unit: w.unit, requestDigest: w.requestDigest, attempt, attempts: w.attempts + 1, usage: addUsage(w.usage, attempt.unitUsage),
            wallMs: w.wallMs + (Date.now() - startedAtMs), firstFailure: { reason: w.failure.reason, code: w.failure.code }, withheld: null,
          });
          if (settled === 'end') return 'end';
          if (settled === 'stop') return 'stopped';
        }
        return spent ? 'end' : 'applied';
      };
      // The `units` stage of the Run Report: first dispatch to last settled unit. A Run whose every
      // unit was reused by lineage submits nothing and opens no segment at all.
      if (remainingUnits.length > 0 || waiting.size > 0) clock.open('units');
      let unitsEnded = false;
      for (const unit of remainingUnits) {
        // An answer the editor gave meanwhile takes its unit on first (CLAR-006).
        const answers = await applyAnswers();
        if (answers === 'end' || answers === 'stopped') {
          unitsEnded = true;
          break;
        }
        // 取消任务 (CTRL-005): the Run stops at this unit boundary, and the unit before it has finished.
        if (active.cancelRequested) break;
        // The current-read guard (Issue #64, S29b; SER-023): an exclusion recorded since the last range stops the Run before this
        // one forms a request — before a pause or AI7 stopping, which would leave it to be continued past the exclusion.
        // A scope stop decided anywhere since — a retry it kept back included — ends the ranges too (Issue #64 review).
        if ((liveInterruption as LiveInterruption | null) === 'series-retrieval-scope-changed' || (liveInterruption as LiveInterruption | null) === 'material-reference-changed' ||
            (liveInterruption as LiveInterruption | null) === 'learning-influence-withdrawn' || scopeChanged()) {
          unitsEnded = true;
          break;
        }
        // The ceiling is evaluated before every dispatch, not only inside the gate: reaching it ends
        // the Run here, before the next unit forms a request at all — and before a pause or AI7 stopping is honoured,
        // which would leave a Run to be continued past what it may spend (Issue #51, S16a).
        if (ceilingState() === 'reached') {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          unitsEnded = true;
          break;
        }
        if (active.interrupted) break;
        // 暂停 (CTRL-001): the Run waits at this boundary, keeping every unit it settled.
        if (active.pauseRequested) break;
        active.progress.currentUnitOrdinal = unit.ordinal;
        // The instant the reader computes elapsed time from; the product itself estimates nothing.
        active.progress.currentUnitStartedAt = new Date().toISOString();
        const unitStartedAtMs = Date.now();
        const requestDigest = definition.requestDigest(unit.ordinal, unit.digest);
        let attempt = await submitAttempt(unit, 1, 'dispatched');
        // AI7 stopping under a Run it can continue cut this turn off: the unit is not settled, and 续行 reads it again
        // (CONT-014). A turn that came back whole settles, and is kept, as any other.
        if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) break;
        let attempts = 1;
        let unitUsageTotal = attempt.unitUsage;
        let firstFailure: ClassifiedModelFailure | null = null;
        // A retry-safe failure the bound plan does not let AI7 retry (Issue #419: the editor said 不允许).
        let withheld: string | null = null;
        // A safe retry is a further transmission, so a Run the editor cancelled meanwhile makes none.
        if (attempt.turn.terminal === 'failed' && !active.interrupted && !active.cancelRequested && !active.pauseRequested) {
          const failed = attempt.turn.signals.find((signal) => signal.kind === 'failed');
          if (failed?.kind === 'failed' && failed.failure.retrySafe &&
              (failed.failure.code !== 'RATE_LIMIT' || rateLimitRetryAllowed(policy))) {
            const mode = adaptationMode(facts.editorEdits, 'safe-retry');
            if (mode !== 'withheld' && ceilingState() === 'reached') {
              // The retry is a further dispatch, and the ceiling is evaluated before every dispatch (Issue #51, S16a): the
              // unit settles from its first attempt — no retry, and no question whose 再试一次 could not be honoured — and
              // the Run ends as the ceiling reached, the last unit's retry too.
              withheld = SAFE_RETRY_BUDGET_REACHED;
              liveInterruption = 'run-budget-ceiling-reached';
              terminalClassification = 'interrupted';
            } else if (mode === 'ask-first') {
              // 先问你 (Issue #422, S76d; CLAR-001, CLAR-004): the Run asks the editor before it retries. The unit waits,
              // unsettled, while the units that do not depend on the answer go on.
              const wallMs = Date.now() - unitStartedAtMs;
              const failure = { code: failed.failure.code, failureClass: failed.failure.failureClass, status: failed.failure.status, reason: failed.failure.reason };
              ledger.recordClarificationRequest({
                runRecordId: facts.runRecordId,
                attemptId,
                taskIntentId: facts.taskIntentId,
                unitOrdinal: unit.ordinal,
                planVersion: facts.planVersionOrdinal,
                planEnvelopeDigest: facts.planEnvelopeDigest,
                requestDigest,
                failure,
                firstPayloadDigest: attempt.payloadDigest,
                firstUnitMessageDigest: attempt.unitMessageDigest,
                firstUsage: attempt.unitUsage,
                firstWallMs: wallMs,
              });
              waiting.set(unit.ordinal, {
                unit, requestDigest, failure, firstPayloadDigest: attempt.payloadDigest, firstUnitMessageDigest: attempt.unitMessageDigest,
                attempts: 1, usage: attempt.unitUsage, wallMs,
              });
              active.progress.currentUnitOrdinal = null;
              active.progress.currentUnitStartedAt = null;
              active.progress.attemptState = null;
              continue;
            }
            // An exclusion recorded while the first attempt was out keeps the retry back (Issue #64, S29b).
            if (withheld === null && mode === 'automatic' && scopeChanged()) {
              firstFailure = failed.failure;
              withheld = materialRefusal === null ? SAFE_RETRY_SCOPE_CHANGED : materialInterruptionMessage(materialRefusal);
            }
            if (withheld === null && mode === 'automatic') {
              firstFailure = failed.failure;
              const retried = await safeRetry(unit, requestDigest, failed.failure, attempt, null, attempt.retryDelayMs);
              if (retried !== null) {
                attempt = retried;
                if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) break;
                attempts = 2;
                // Both attempts cost the Run, so the unit's row carries what the unit cost, not what its
                // last attempt cost.
                unitUsageTotal = addUsage(unitUsageTotal, attempt.unitUsage);
              } else withheld = '安全重试等待期间运行已停止；没有再次发送。';
            } else if (withheld === null) {
              withheld = SAFE_RETRY_WITHHELD;
            }
          }
        }
        // A contract retry is a separate declared adaptation, never an inference from a possibly billed failure.
        // Only a completed, nonempty answer with an invalid envelope can reach it; finding rejections close normally.
        const contractCandidate = attempt.turn.signals.find((signal) => signal.kind === 'contentCandidate');

        const contractParsed = contractDeclared && contractAllowed && attempt.turn.terminal === 'completed' && contractCandidate?.kind === 'contentCandidate'
          ? definition.parseUnitResult(contractCandidate.text, unit) : null;
        if (contractDeclared && contractAllowed && attempts <= 2 &&
            !priorAdaptations.some((entry) => entry.unitOrdinal === unit.ordinal && entry.adaptationClass === 'contract-retry') &&
            attempt.turn.terminal === 'completed' && contractCandidate?.kind === 'contentCandidate' &&
            contractCandidate.text.trim().length > 0 && attempt.canonical?.kind !== 'empty-answer' &&
            parseModelClarification(contractCandidate.text) === null && contractParsed?.ok === false &&
            (contractParsed.code === 'not-json' || contractParsed.code === 'schema-invalid') &&
            !active.cancelRequested && !active.pauseRequested && !active.interrupted && liveInterruption === null && !scopeChanged() && ceilingState() !== 'reached') {
          const message = unitMessages.get(unit.ordinal)!;
          if (attempt.unitMessageDigest !== sha256Hex(message)) throw new ExecutionAdmissionError('CONTRACT_RETRY_MESSAGE_DRIFT', '契约重试的单元消息与首次请求不同。');
          adaptationOrdinal += 1;
          const contractAttemptIndex = attempts === 1 ? 2 : 3;
          const adaptation = ledger.recordAdaptation({ adaptationClass: 'contract-retry', attemptIndex: contractAttemptIndex, attemptId, runRecordId: facts.runRecordId,
            taskIntentId: facts.taskIntentId, ordinal: adaptationOrdinal, unitOrdinal: unit.ordinal,
            classifiedReason: '单元结果信封无法解析，以相同消息重试一次。', failureCode: 'CONTRACT_INVALID', failureClass: 'contract-invalid',
            failureStatus: null, requestDigest, firstPayloadDigest: attempt.payloadDigest, firstUnitMessageDigest: attempt.unitMessageDigest,
            planEnvelopeDigest: facts.planEnvelopeDigest, bindingDigest });
          adaptedUnitOrdinals.push(unit.ordinal);
          if (currentBindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '契约重试期间执行绑定发生变化。');
          acceptedOutputDigests.add(contractCandidate.digest);
          attempt = await submitAttempt(unit, contractAttemptIndex, 'retrying', adaptation.adaptationId);
          if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) break;
          attempts = contractAttemptIndex;
          unitUsageTotal = addUsage(unitUsageTotal, attempt.unitUsage);
        }
        // A range the account limit refused before 续行 carries that attempt in its row as well.
        const prior = refused !== null && refused.unitOrdinal === unit.ordinal ? refused : null;
        const settled = await settleAndRetain({
          unit, requestDigest, attempt,
          attempts: attempts + (prior?.attempts ?? 0),
          usage: prior === null ? unitUsageTotal : addUsage(unitUsageTotal, prior.usage),
          wallMs: Date.now() - unitStartedAtMs + (prior?.wallMs ?? 0),
          firstFailure: firstFailure === null ? null : { reason: firstFailure.reason, code: firstFailure.code }, withheld,
        });
        if (settled === 'end' || settled === 'stop') {
          unitsEnded = true;
          break;
        }
      }
      // Every unit the Run could read is read: answers already given are applied now, one after another as they come.
      if (!unitsEnded && !active.interrupted && !active.cancelRequested && !active.pauseRequested) {
        let answers = await applyAnswers();
        while (answers === 'applied') answers = await applyAnswers();
        if (answers === 'end') unitsEnded = true;
      }
      clock.close();
      // What follows the ranges — the reduction, the sample, the reflection — reads the same material; an exclusion recorded while
      // the last range was out stops the Run before any of it (Issue #64, S29b; SER-023).
      scopeChanged();
      // 暂停, or AI7 stopping under a Run it can continue (Issue #422, S76b): the Run stops here keeping what it read —
      // no reduction, no revision, no outcome — and 续行 goes on from the next unit. A cancellation outranks both, and a
      // spent ceiling, an account limit, or a unit whose turn ended the Run — refused, cut off, or one the harness could not
      // end — still ends it as the interruption it is, with that unit's gap kept. A sent request whose result cannot be known
      // remains a per-unit gap while the other units and the Run complete (ADR 0095 §2).
      const stopWithoutEnding = (): boolean => {
        if (active.cancelRequested || liveInterruption !== null || terminalClassification === 'interrupted') return false;
        const stopping = active.pauseRequested || (active.interrupted && active.resumableOnInterrupt);
        const asking = waiting.size > 0 && !unitsEnded && !active.interrupted;
        if (accountLimit === null && !stopping && !asking) return false;
        // A spent ceiling outranks a pause, AI7 stopping, an open question and an account limit (Issue #51, S16a; MODEL-016):
        // nothing more may be sent under it, so no Run waits to be continued past it. An open question's answer and the
        // request an account limit refused would each be one more request, and AI7 stopping leaves nothing to send the rest:
        // any of them ends the Run here as the ceiling reached, and asks nothing. The editor's pause alone lapses. The Run
        // goes on without it; the next request's own check — the reduction's, a sampling turn's — ends the Run as the
        // ceiling reached if one is still to be sent, and a Run that needs none completes, since the ceiling counts only
        // where it stops a request.
        if (ceilingState() === 'reached') {
          if (asking || accountLimit !== null || active.interrupted) {
            liveInterruption = 'run-budget-ceiling-reached';
            terminalClassification = 'interrupted';
          }
          return false;
        }
        // What this stop leaves spent beyond its units — settled or refused stage work — is kept with it by stage,
        // so the ceiling counts it after 续行 as it did before, and the Run's report states it where it was spent (Issue #541).
        // The stages hold what earlier stops kept too, since 续行 counted it into them.
        const carriedStages = Object.fromEntries(CARRIED_STAGES.map((stage) => [stage, { ...stageUsage[stage] }])) as CarriedStages;
        const carriedUsage = {
          inputTokens: unattributed.inputTokens + CARRIED_STAGES.reduce((total, stage) => total + carriedStages[stage].inputTokens, 0),
          outputTokens: unattributed.outputTokens + CARRIED_STAGES.reduce((total, stage) => total + carriedStages[stage].outputTokens, 0),
          stages: carriedStages,
        };
        const settled = active.progress.unitsSettled;
        // 模型服务账户限额 (Issue #51, S16b; MODEL-018): outside developer-live the Run stops resumable in its own words, with
        // the provider's, and holds nothing; 续行 goes on once the limit clears.
        if (accountLimit !== null) {
          ledger.recordRunState(facts.runRecordId, 'resumable', {
            detail: accountLimitDetail(settled, submittedUnits.length),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
            stopReason: 'provider-account-limit',
            condition: accountLimit.condition,
            ...(accountLimit.unitOrdinal === null ? {} : { unitOrdinal: accountLimit.unitOrdinal }),
            // The refused attempt was sent: 续行 counts it, and a cancellation ends its range as the gap it is.
            ...(accountLimit.refused === undefined ? {} : { refusedAttempt: accountLimit.refused }),
            carriedUsage,
            ...stageEvidence(),
          });
          return true;
        }
        if (stopping) {
          ledger.recordRunState(facts.runRecordId, active.pauseRequested ? 'paused' : 'resumable', {
            ...(active.idleYieldRequested ? { idleYield: true } : {}),
            detail: active.idleYieldRequested ? RUN_IDLE_YIELD_LABEL : proxyFailure ?? (active.pauseRequested ? pausedDetail(settled, submittedUnits.length) : resumableDetail(settled, submittedUnits.length)),
            ...(proxyFailure === null ? {} : { connectivityClassification: 'proxy-unreachable', stopReason: 'proxy-unreachable' }),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
            carriedUsage,
            ...stageEvidence(),
          });
          return true;
        }
        // 任务等待你的说明 (Issue #422, S76d; CLAR-004): every unit the Run could read is read, and a question is still open.
        // It stops at this boundary — no reduction, no revision, no outcome — holding nothing and keeping what it read, and
        // the answer takes it on. The ledger was read for answers just now, with nothing awaited since.
        if (asking) {
          ledger.recordRunState(facts.runRecordId, 'awaiting-clarification', {
            detail: awaitingClarificationDetail([...waiting.keys()], settled, submittedUnits.length),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
            waitingUnits: [...waiting.keys()],
            carriedUsage,
            ...stageEvidence(),
          });
          return true;
        }
        return false;
      };
      if (stopWithoutEnding()) return;
      // A question the Run's end leaves open stays on record (CLAR-005), and its unit settles as the gap it is, unretried —
      // in words that say whether the editor had answered it, read now, since an answer may have come while it ran.
      const answers = new Map(waiting.size === 0 ? [] : ledger.clarificationsOf(facts.runRecordId)
        .filter((entry) => entry.answer !== null).map((entry) => [entry.unitOrdinal, entry.answer!.optionId] as const));
      for (const w of waiting.values()) {
        const answer = answers.get(w.unit.ordinal) ?? null;
        // A Run the ceiling ended sent no retry for its question (Issue #51, S16a), and a 不重试 answer is the editor's own gap.
        const words = active.cancelRequested
          ? answer !== null ? CLARIFICATION_CANCELLED_ANSWERED : CLARIFICATION_CANCELLED_UNANSWERED
          : answer === 'record-gap'
            ? CLARIFICATION_RECORD_GAP
            : liveInterruption === 'run-budget-ceiling-reached'
              ? SAFE_RETRY_BUDGET_REACHED
              : answer !== null ? CLARIFICATION_ENDED_ANSWERED : CLARIFICATION_ENDED_UNANSWERED;
        settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
          'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${words}`);
        // Settled as the gap it is, it counts among the ranges the Run went through, as an answered one does.
        keepSettled(w.unit, w.wallMs);
      }
      waiting.clear();
      // The range an account limit refused, never read again before the Run ended (Issue #51, S16b): its attempt was sent,
      // so it is the gap it is — in the provider's words — and never a range the Run did not attempt.
      if (refused !== null && !unitRecords.some((record) => record.unitOrdinal === refused.unitOrdinal)) {
        const unit = submittedUnits.find((entry) => entry.ordinal === refused.unitOrdinal);
        if (unit !== undefined) {
          settleGap(unit, definition.requestDigest(unit.ordinal, unit.digest), { unitOrdinal: unit.ordinal, attempts: refused.attempts, wallMs: refused.wallMs, usage: refused.usage },
            'adapter-failure', `${refused.condition}；${active.cancelRequested ? ACCOUNT_LIMIT_CANCELLED_UNREAD : ACCOUNT_LIMIT_ENDED_UNREAD}`);
          keepSettled(unit, refused.wallMs);
        }
      }
      // 结果待确认 carried forward (Issue #51, S16c): a range its predecessor holds as an `outcome-unknown` gap — matched by content
      // key — that this Run ends without reading is still that gap, in its own words, never a range merely not attempted: its
      // earlier request was sent, and every later Task and the background dispatcher must still see it.
      if (predecessorFacts !== null && submittedUnits.some((unit) => !unitRecords.some((record) => record.unitOrdinal === unit.ordinal))) {
        const carried = ledger.unknownGapsByContentKey(predecessorFacts.revisionId);
        for (const planUnit of planUnits) {
          const reason = carried.get(planUnit.contentKey);
          if (reason === undefined || unitRecords.some((record) => record.unitOrdinal === planUnit.unitOrdinal)) continue;
          const unit = submittedUnits.find((candidate) => candidate.ordinal === planUnit.unitOrdinal);
          if (unit === undefined) continue;
          const words = carriedOutcomeUnknownReason(reason);
          outcomes.push({ unitOrdinal: unit.ordinal, state: 'gap', code: 'outcome-unknown', reason: words });
          unitRecords.push({
            unitOrdinal: unit.ordinal,
            requestDigest: definition.requestDigest(unit.ordinal, unit.digest),
            lineage: { kind: 'recomputed' },
            closed: { state: 'gap', gap: { unitOrdinal: unit.ordinal, code: 'outcome-unknown', reason: words, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } },
          });
        }
      }
      if (active.interrupted && terminalClassification === 'completed') terminalClassification = 'interrupted';
      // A Run the editor cancelled ends `cancelled`, whatever else stopped it (CTRL-005), and nothing after this point
      // is sent. A failure that ends the Run is still recorded as the failure it is, by `#recordFailure`.
      if (active.cancelRequested) {
        terminalClassification = 'cancelled';
        liveInterruption = null;
      }

      // The one declared cross-unit suboperation (ADR 0066), inside this Run's unchanged envelope and
      // Execution Binding: one message admitted through the same gate, one turn, one attempt, no
      // adaptation. It runs only after a unit loop that reached its end — an interrupted Run, a spent
      // ceiling, or a Provider Account Limit has already stopped this Run, and nothing further is sent.
      const closedOutcomes = outcomes
        .filter((outcome): outcome is ClosedUnitOutcome<BaselineUnitResult> => outcome.state === 'closed')
        .sort((left, right) => left.unitOrdinal - right.unitOrdinal);
      let crossUnit: CrossUnitOutcome = CROSS_UNIT_NOT_RUN;
      // A kind's own book-level step (Issue #429, S81b1) takes the same path under its own name, message, digest and parser;
      // the baseline kind declares none, and every word and digest of its reduction is the one it always had.
      const step = definition.crossUnit?.step ?? null;
      const named = (text: string): string => (step === null ? text : text.replaceAll('跨单元归纳', step.label));
      const reductionInput = canonicalRecord(closedOutcomes).digest;
      const reductionContract = definition.crossUnit?.promptContractDigest ?? promptContractDigest;
      if (stages.reduction !== undefined) {
        if (stages.reduction.inputDigest !== reductionInput || stages.reduction.contractDigest !== reductionContract) {
          throw new ExecutionAdmissionError('EXECUTION_CHECKPOINT_INVALID', '已保存的归纳输入或契约无法核对；未发送。');
        }
        crossUnit = stages.reduction.outcome;
      } else if (definition.crossUnit === null) {
        // A kind that declares no cross-unit contract never forms the request, never counts a turn,
        // and says so exactly. The baseline path below is unchanged, request counts included.
        crossUnit = { state: 'not-run', reason: definition.crossUnitAbsentReason };
      } else if (terminalClassification === 'cancelled') {
        crossUnit = { state: 'not-run', reason: named(CROSS_UNIT_CANCELLED) };
      } else if ((terminalClassification === 'interrupted' || active.interrupted)
        // Every range settled and the ceiling spent — by the last range, or with a question, AI7 stopping or a retry the
        // ceiling kept back — is the ceiling stopping the reduction, and is said so below (Issue #51, S16a).
        && !(liveInterruption === 'run-budget-ceiling-reached' && active.progress.unitsSettled === submittedUnits.length)) {
        crossUnit = { state: 'not-run', reason: named('运行在单元阶段结束前停止，跨单元归纳未发起。') };
      } else if (closedOutcomes.length < (step?.minimumClosedUnits ?? 2)) {
        if (step !== null) crossUnit = { state: 'not-run', reason: step.notEnoughReason };
      } else {
        const requestDigest = step === null
          ? crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(closedOutcomes))
          : step.requestDigest(closedOutcomes);
        const gap = (code: Extract<CrossUnitOutcome, { state: 'gap' }>['code'], reason: string): CrossUnitOutcome =>
          ({ state: 'gap', code, reason, requestDigest });
        if (live !== null && (step !== null ? admitted?.crossUnitSynthesisAllowed !== true : policy.providerProcessing.crossUnitReductionAllowed !== true)) {
          // The reduction is a transmission the active Provider Processing policy does not name, so it
          // never forms a request at all. The verified developer-live document names the baseline's reduction; a
          // projection that does not is exactly the policy-bounded case this guard exists for. Another
          // kind's book-level step is never sent under the baseline's term, whatever that term reads: only the rule that
          // admitted the kind can name it (Issue #429, Provider Processing v11's synthesis term).
          crossUnit = gap('policy-bounded', named('跨单元归纳未派发：当前 Provider Processing 策略仅授权单元数内的传输'));
        } else if (ceilingState() === 'reached') {
          // The ceiling is evaluated before this dispatch exactly as before a unit's, so a Run that has
          // spent its bound ends here rather than spending one more turn to discover it — and ends as the
          // ceiling reached, with every unit it read kept (Issue #51, S16a; MODEL-016).
          crossUnit = gap('run-budget-ceiling-reached', named(CROSS_UNIT_BUDGET_REACHED));
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
        } else {
          const message = step === null ? buildCrossUnitMessage(closedOutcomes, manifest.units.length) : step.buildMessage(closedOutcomes, manifest.units.length);
          // A kind's book-level synthesis turn under ordinary production carries the whole Book's words (Issue #811): the gate
          // reads it as unpublished full content, which the kind's rule must name; every other turn keeps the Run's category.
          if (production !== null && step !== null && bindingFacts !== null) bindingFacts = { ...bindingFacts, outboundDataCategory: 'unpublished-full-content' };
          // The same set the gate reads: exactly one further user message becomes admissible, and every
          // other refusal — route, model, system prompt, tools, prior outputs — is untouched.
          admittedUserMessages.add(message);
          // The reduction's own stage, opened only here: a reduction refused by policy or by a spent
          // ceiling never dispatched, and a stage that never ran reports no time at all.
          clock.open('cross-unit-reduction');
          active.progress.stage = 'cross-unit-reduction';
          active.validationStep = 'reduction';
          active.progress.currentUnitOrdinal = null;
          active.progress.currentUnitStartedAt = new Date().toISOString();
          active.progress.attemptState = 'dispatched';
          active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
          platformSession?.startUnit();
          const turn = await harness.submitUnit(message);
          if (platformSession?.evidenceNeedsCommander === true) throw new ExecutionAdmissionError('PLATFORM_TOOL_EVIDENCE_MORE_SEARCH_REQUIRED', '本证据项需要第二次新检索；等待 Commander。');
          pendingLoopUsage.length = 0;
          // Every later turn of the Run keeps the Run's own category again.
          if (production !== null && step !== null && bindingFacts !== null) bindingFacts = { ...bindingFacts, outboundDataCategory: 'unpublished-excerpts' };
          if (this.#deps.stageHold) await this.#deps.stageHold('cross-unit-reduction');
          const canonical = liveAdapter.instance?.lastCanonicalResult ?? null;
          // The reduction's turn is a model turn like any other: it counts as a request, its usage
          // counts toward the Run and the ceiling, and it records no execution-span row, because the
          // span table is unit-only and this step belongs to no unit.
          const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
          const crossUnitUsage = usageSignal?.kind === 'usage'
            ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens }
            : null;
          countTurn('cross-unit-reduction', crossUnitUsage, turn.signals);
          active.progress.completedAttempts += 1;
          const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
          if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
            acceptedOutputDigests.add(candidate.digest);
            if (canonical?.kind === 'empty-answer') {
              crossUnit = gap('contract-invalid', named(crossUnitEmptyAnswerGapReason(canonical.reasoningPresent)));
            } else if (step !== null) {
              const validated = prepareRetrievalResult(candidate.text, retrieval);
              const parsed = validated.rejected.length > 0 ? { ok: false as const, code: 'not-exact-fetched', detail: '未经精确取文' }
                : step.parse(validated.text, closedOutcomes);
              const refused = parsed.ok ? null : step.refusalReason?.(parsed.code, parsed.detail) ?? null;
              crossUnit = parsed.ok
                ? { state: 'closed', findings: [], requestDigest, usage: crossUnitUsage, result: parsed.result }
                : gap('contract-invalid', parsed.code === 'not-exact-fetched' ? '未经精确取文' : refused ?? named(unparsableCrossUnitAnswerGapReason(parsed.code, parsed.detail, candidate.text)));
            } else {
              const parsed = parseCrossUnitResult(candidate.text, {
                closedOrdinals: closedOutcomes.map((outcome) => outcome.unitOrdinal),
                citedBlocksByUnit: citedBlocksByUnit(closedOutcomes),
              });
              crossUnit = parsed.ok
                ? { state: 'closed', findings: parsed.result.findings, requestDigest, usage: crossUnitUsage }
                : gap('contract-invalid', unparsableCrossUnitAnswerGapReason(parsed.code, parsed.detail, candidate.text));
            }
          } else if (turn.terminal === 'completed') {
            crossUnit = gap('contract-invalid', named('跨单元归纳的技术回合完成但没有模型输出。'));
          } else if (turn.terminal === 'failed') {
            const failure = turn.signals.find((signal) => signal.kind === 'failed');
            // No safe retry here: one attempt, and a retry-safe failure is a gap like any other.
            crossUnit = gap('adapter-failure', failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
            // 模型服务账户限额 (Issue #51, S16b): the Run stops before the reduction settles, and 续行 forms it again.
            if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit' && active.resumableOnInterrupt &&
                (live === null || production !== null)) {
              accountLimit = { unitOrdinal: null, condition: `${failure.failure.reason}（${failure.failure.code}）` };
            }
          } else if (ambiguousTurnReason(turn.signals) !== null) {
            // 结果待确认 (Issue #51, S16c): its own code and words, never 被中断 — and never sent again.
            crossUnit = gap('outcome-unknown', ambiguousTurnReason(turn.signals)!);
          } else {
            const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
            const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
            crossUnit = gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : named('跨单元归纳被中断。'));
          }
        }
      }

      // A settled reduction — a gap, or a sent request whose result cannot be known, included — is kept before a pause or
      // AI7 stopping, and continuation never sends it again (ADR 0095 §2). Only one AI7 stopping cut off before anything
      // of it settled is formed again by 续行, as a unit cut off there is read again (CONT-014).
      const cutOff = active.interrupted && active.resumableOnInterrupt && crossUnit.state === 'gap' && crossUnit.code === 'interrupted';
      if (accountLimit === null && !active.cancelRequested && !cutOff) stages.reduction = {
        inputDigest: reductionInput, contractDigest: reductionContract,
        requestDigest: crossUnit.state === 'not-run' ? null : crossUnit.requestDigest, outcome: crossUnit,
      };
      if (stopWithoutEnding()) return;

      // The kind's reducers run over the complete new unit set: reused plus recomputed. This is the
      // first of the `reduction` stage's two segments; the second is the persist below. The sampling
      // await between them belongs to the sampling stage, so the two segments are measured apart and
      // the four stage totals partition the Run's own work.
      clock.open('reduction');
      const reduced = definition.reduce({ manifest, outcomes, reusedUnitOrdinals: reusedOrdinals, blocks: blocksById, crossUnit });
      // A unit the plan left out of scope is a gap in the revision's coverage and not in the Run: a
      // range review that closed everything it was asked to read completed, without qualification.
      if (terminalClassification === 'completed' && reduced.gaps.some((gapEntry) => gapEntry.code !== 'out-of-scope')) {
        terminalClassification = 'completed-with-gaps';
      }
      // A kind whose book-level step is its result (Issue #432 review): no closed step, no complete Run.
      if (terminalClassification === 'completed' && definition.crossUnit?.step?.requiredForCompletion === true && crossUnit.state !== 'closed') {
        terminalClassification = 'completed-with-gaps';
      }
      clock.close();
      // A cancellation that came while the reduction's turn was out stops the sample before it forms a message.
      if (active.cancelRequested) {
        terminalClassification = 'cancelled';
        liveInterruption = null;
      }
      // So does an exclusion recorded while it was out (Issue #64, S29b).
      scopeChanged();

      // The one declared assurance sampling suboperation (ADR 0066), inside this Run's unchanged
      // envelope and Execution Binding: one admitted user message per anchor unit, one turn each, no
      // adaptation. It runs only after a unit loop that reached its end, for the same reason the
      // reduction does — an interrupted Run has already stopped, and nothing further is sent.
      const sample = await this.#drawAndJudge({
        active, definition, harness, reduction: reduced, manifest, blocksById, admittedUserMessages, stages,
        acceptedOutputDigests, liveAdapter, countTurn, clock, ceilingState, live, policy,
        stopped: terminalClassification === 'interrupted' || terminalClassification === 'cancelled',
        stoppedReason: liveInterruption === 'run-budget-ceiling-reached' ? ASSURANCE_SAMPLING_BUDGET_REACHED : null,
        removedByEditor: !assuranceSamplingKept(facts.editorEdits),
        onCeilingReached: () => {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
        },
        onAccountLimit: (condition) => {
          if (active.resumableOnInterrupt && (live === null || production !== null)) accountLimit = { unitOrdinal: null, condition };
        },
        materialChanged: scopeChanged,
      });
      if (stopWithoutEnding()) return;
      // The second reducer pass: the sample joins the revision and re-labels the assurance axis, and
      // every finding component comes through byte for byte. The `reduction` stage resumes here.
      clock.open('reduction');
      const reduction = applyAssuranceSample(reduced, sample);
      // Units the interrupted loop never reached are recorded as exact not-attempted gaps.
      for (const gapEntry of reduction.gaps) {
        if (!unitRecords.some((record) => record.unitOrdinal === gapEntry.unitOrdinal)) {
          unitRecords.push({
            unitOrdinal: gapEntry.unitOrdinal,
            requestDigest: definition.requestDigest(gapEntry.unitOrdinal, manifest.units[gapEntry.unitOrdinal - 1]!.digest),
            lineage: { kind: 'recomputed' },
            closed: { state: 'gap', gap: gapEntry },
          });
        }
      }
      unitRecords.sort((left, right) => left.unitOrdinal - right.unitOrdinal);
      if (platformSession !== null) {
        usage.requests += platformSession.usage.requests;
        usage.inputTokens += platformSession.usage.inputTokens;
        usage.outputTokens += platformSession.usage.outputTokens;
      }
      const revision = ledger.persistRevision({
        facts,
        attemptId,
        bindingDigest,
        harnessSessionId,
        reduction,
        units: unitRecords,
        usage,
        adaptedUnitOrdinals,
      });
      clock.close();
      // The last instant a cancellation can still name this Run: the terminal state below is the one it ends in.
      if (active.cancelRequested) {
        terminalClassification = 'cancelled';
        liveInterruption = null;
      }
      // The reflection consumes the same frozen system prompt; check once more before recording the final outcome.
      scopeChanged();
      const interruptionKey = liveInterruption as LiveInterruption | null;
      const materialStop = materialRefusal as MaterialGuardRefusal | null;
      const interruption = interruptionKey === null ? null : interruptionKey === 'material-reference-changed' && materialStop !== null
        ? { ...LIVE_INTERRUPTIONS[interruptionKey], detail: materialInterruptionMessage(materialStop), summary: materialInterruptionMessage(materialStop),
            safeNextAction: materialInterruptionNextAction(materialStop.code) ?? LIVE_INTERRUPTIONS[interruptionKey].safeNextAction }
        : LIVE_INTERRUPTIONS[interruptionKey];
      ledger.recordRunState(facts.runRecordId, terminalClassification, {
        detail: terminalClassification === 'cancelled'
          ? `运行终态：cancelled；按你的取消在阅读范围之间停止，已完成的结果与缺口均已保留，没有读到的阅读范围记为未尝试；结果集修订版 ${revision.revisionId}（Revision ${revision.ordinal}）。`
          : interruptionKey === 'material-reference-changed' && materialStop !== null
            ? materialInterruptionMessage(materialStop)
          : interruption === null
            ? `运行终态：${terminalClassification}；结果集修订版 ${revision.revisionId}（Revision ${revision.ordinal}）。`
            : `运行终态：${terminalClassification} · ${liveInterruption}；${interruption.detail}结果集修订版 ${revision.revisionId}（Revision ${revision.ordinal}）。`,
        resultSetRevisionId: revision.revisionId,
        resultSetRevisionOrdinal: revision.ordinal,
        unitsClosed: reduction.coverage.unitsClosed,
        unitsReused: reduction.coverage.unitsReused,
        unitsTotal: reduction.coverage.unitsTotal,
        gapCount: reduction.gaps.length,
        conflictCount: reduction.conflictCount,
        ...(interruptionKey === 'material-reference-changed' && materialStop !== null ? { cause: materialStop.code } : {}),
      });
      // The Run Report (ADR 0066 §Run Report). Its facts are the ones this Run already recorded, and
      // its accounting is the persisted revision's, because the revision is persisted above.
      const reportFacts: RunReportFacts = {
        runRecordId: facts.runRecordId,
        taskIntentId: facts.taskIntentId,
        attemptId,
        resultSetRevisionId: revision.revisionId,
        classification: terminalClassification,
        recordedAt: new Date().toISOString(),
        spans: clock.spans(),
        usage: stageUsage,
        ...(platformSession === null ? {} : { platformTools: platformSession.usage, webToolsBackend: facts.webToolsBackend }),
        unitRows: runReportUnitRows(unitRecords, unitObservations),
        submitted: submittedUnits.length,
        // Exactly the three fields decision 4 names; the adaptation's own digests, codes, and
        // identities stay in the ledger row a reader can already open.
        adaptations: ledger.adaptationsOf(facts.runRecordId).map((entry) => ({
          unitOrdinal: entry.unitOrdinal,
          classifiedReason: entry.classifiedReason,
          recordedAt: entry.recordedAt,
        })),
        modelClarifications: ledger.clarificationsOf(facts.runRecordId).filter((entry) => entry.origin === 'model').map((entry) => ({
          unitOrdinal: entry.unitOrdinal, outcome: entry.answer === null ? 'unanswered' as const
            : entry.answer.timedOut === true ? 'timed-out' as const
              : entry.answer.optionId === 'no-answer' ? 'no-answer' as const : 'answered' as const,
        })),
        gaps: reduction.gaps,
        crossUnit: { state: crossUnit.state, reason: crossUnit.state === 'closed' ? null : crossUnit.reason },
        sample,
        findingCounts: definition.findingCounts(reduction),
        terminalFailure: null,
      };
      ledger.recordOutcome({
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        classification: terminalClassification,
        resultSetRevisionId: revision.revisionId,
        summary: terminalClassification === 'cancelled'
          ? `已按你的要求取消：${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`
          : interruption === null
            ? `${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`
            : `${interruption.summary}${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`,
        safeNextAction: interruption === null
          ? (definition.safeNextActions ?? SAFE_NEXT_ACTIONS)[terminalClassification]
          : liveInterruption === 'run-budget-ceiling-reached' && (live === null || production !== null) ? BUDGET_REACHED_NEXT_ACTION : interruption.safeNextAction,
        // Run Budget Ceiling Reached, named (Issue #51, S16a; MODEL-016): the ceiling, what the Run used, and what it read.
        ...(liveInterruption === 'run-budget-ceiling-reached' && runBudgetCeiling.kind === 'tokens'
          ? {
              stop: {
                reason: 'run-budget-ceiling-reached' as const,
                maxTotalTokens: runBudgetCeiling.maxTotalTokens,
                usedTokens: totalTokens(accumulated),
                unitsSettled: active.progress.unitsSettled,
                unitsTotal: submittedUnits.length,
              },
            }
          : {}),
        report: { ...buildRunReport(reportFacts, await this.#reflect({
          active, harness, runRecordId: facts.runRecordId, accounting: runReportAccounting(reportFacts),
          admittedUserMessages, acceptedOutputDigests, liveAdapter, accumulated, ceilingState, live, policy,
          // An exclusion recorded since the revision was persisted keeps the reflection back too (Issue #64, S29b).
          stopped: terminalClassification === 'interrupted' || terminalClassification === 'cancelled' ||
            (!active.cancelRequested && (this.#deps.seriesScopeGuard?.(facts.runRecordId) != null || this.#deps.influenceGuard?.(facts.runRecordId) != null)),
        })), ...(factualAssurance === null ? {} : { factualAssurance }) },
      });
    } finally {
      currentBindingDigest = null;
      active.progress.currentUnitOrdinal = null;
      active.progress.currentUnitStartedAt = null;
      active.progress.attemptState = null;
      await harness.finish();
      retrieval?.dispose();
    }
  }

  /**
   * Draw the assurance sample and put each anchor unit's share of it to the model once.
   *
   * The guard order is the reduction's — interruption, policy, ceiling — and the policy guard sits
   * outside the loop, so a scope whose Provider Processing policy does not name the suboperation never
   * assembles a single message, let alone transmits one. Every parameter this takes is a thing the
   * suboperation may read or move; the reduction's finding components are deliberately not among them,
   * because a disposition never edits a finding.
   */
  async #drawAndJudge(context: AssuranceSamplingContext): Promise<AssuranceSampleOutcome> {
    const { active, definition, harness, reduction, manifest, live, policy } = context;
    if (definition.assurance === null) return assuranceSampleNotRun(definition.assuranceAbsentReason);
    if (active.cancelRequested) {
      // A sample a pause kept stays as far as it settled; only the turn it had not sent is the cancellation's gap.
      const kept = context.stages.sampling;
      if (kept === undefined) return assuranceSampleNotRun(ASSURANCE_SAMPLING_CANCELLED);
      const next = kept.ended ? undefined : assuranceSamplingTurns(kept.draw.sampled)[kept.nextTurn - 1];
      return assuranceSampleOutcome(kept.draw, kept.dispositions,
        kept.sampled.turnsWithUsage === 0 ? null : { inputTokens: kept.sampled.inputTokens, outputTokens: kept.sampled.outputTokens },
        next === undefined ? kept.gapReasons : [...kept.gapReasons, assuranceSamplingTurnGapReason(next.unitOrdinal, '运行已按你的要求取消，本轮未派发。')]);
    }
    if (context.stopped || active.interrupted) return assuranceSampleNotRun(context.stoppedReason ?? '运行在单元阶段结束前停止，保证抽样未发起。');
    if (context.removedByEditor) return assuranceSampleNotRun(ASSURANCE_SAMPLING_REMOVED);
    const candidates = definition.assurance.candidates(reduction);
    if (candidates.length === 0) return assuranceSampleNotRun('本次运行没有可抽样的发现，保证抽样未发起。');
    const inputDigest = canonicalRecord({ manifest, candidates }).digest;
    const contractDigest = definition.assurance.promptContractDigest;
    const prior = context.stages.sampling;
    // The draw is a function of the manifest and the candidates, so a kept one must be exactly that draw: its unsent
    // turns are formed from it.
    const drawn = drawAssuranceSample(manifest, candidates);
    if (prior !== undefined && (prior.inputDigest !== inputDigest || prior.contractDigest !== contractDigest ||
        canonicalRecord(prior.draw).digest !== canonicalRecord(drawn).digest)) {
      throw new ExecutionAdmissionError('EXECUTION_CHECKPOINT_INVALID', '已保存的抽样输入、契约或抽取的样本无法核对；未发送。');
    }
    const draw = prior?.draw ?? drawn;
    const dispositions = [...(prior?.dispositions ?? [])];
    const gapReasons = [...(prior?.gapReasons ?? [])];
    const sampled = { ...(prior?.sampled ?? { inputTokens: 0, outputTokens: 0, turnsWithUsage: 0 }) };
    const turns = assuranceSamplingTurns(draw.sampled);
    const settledTurns = [...(prior?.turns ?? [])];
    if (prior !== undefined && (prior.nextTurn > turns.length + 1 || settledTurns.some((kept, index) => {
      const turn = turns[index]!;
      return kept.unitOrdinal !== turn.unitOrdinal || kept.requestDigest !== canonicalRecord(buildAssuranceSamplingMessage(manifest.units[turn.unitOrdinal - 1]!, manifest.units.length,
        context.blocksById, turn.findings, definition.assurance!.prompt)).digest;
    }))) throw new ExecutionAdmissionError('EXECUTION_CHECKPOINT_INVALID', '已保存的抽样回合无法核对；未发送。');
    const save = (nextTurn: number, ended: boolean): void => {
      context.stages.sampling = { inputDigest, contractDigest, draw, nextTurn, ended,
        turns: [...settledTurns], dispositions: [...dispositions], gapReasons: [...gapReasons], sampled: { ...sampled } };
    };
    if (live !== null && policy.providerProcessing.assuranceSamplingAllowed !== true) {
      // The sampling turns are transmissions the active Provider Processing policy does not name, so
      // none of them forms a request. The verified developer-live document names them; a projection that does not
      // is exactly the policy-bounded case this guard exists for.
      return assuranceSampleOutcome(draw, [], null, [ASSURANCE_SAMPLING_POLICY_BOUNDED]);
    }
    if (prior === undefined) save(1, false);
    let sampleTurn = 0;
    for (const turn of turns) {
      sampleTurn += 1;
      if (prior !== undefined && (prior.ended || sampleTurn < prior.nextTurn)) continue;
      if (active.interrupted) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '运行已中断，本轮未派发。'));
        break;
      }
      // 取消任务 between two sampling turns: the one out finished, and no further one is sent.
      if (active.cancelRequested) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '运行已按你的要求取消，本轮未派发。'));
        break;
      }
      if (context.materialChanged()) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '参考资料已不可用，本轮未派发。'));
        break;
      }
      // The ceiling is evaluated before every dispatch exactly as before a unit's, so a Run that has
      // spent its bound ends here rather than spending one more turn to discover it — and before a pause, as the unit
      // loop's is (Issue #51, S16a): a drawn turn the ceiling keeps back is a gap of the sample, never a pause's to hide.
      if (context.ceilingState() === 'reached') {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '任务运行预算上限已达到，本轮未派发。'));
        context.onCeilingReached();
        break;
      }
      // Pause admits no next turn; the exact draw and settled prefix survive continuation.
      if (active.pauseRequested) break;
      const unit = manifest.units[turn.unitOrdinal - 1]!;
      const message = buildAssuranceSamplingMessage(unit, manifest.units.length, context.blocksById, turn.findings, definition.assurance.prompt);
      // The same set the gate reads: exactly one further user message becomes admissible per turn, and
      // every other refusal — route, model, system prompt, tools, prior outputs — is untouched.
      context.admittedUserMessages.add(message);
      // The sampling stage, opened on the first turn that actually dispatches: a suboperation stopped
      // by interruption, policy, or the ceiling reports no time because it consumed none. Re-opening
      // per turn keeps the segments contiguous from the first dispatch to the last turn's settlement.
      context.clock.open('assurance-sampling');
      active.progress.stage = 'assurance-sampling';
      active.validationStep = `sampling-${sampleTurn}-unit-${turn.unitOrdinal}`;
      // The unit loop is over; a sampling turn is about a unit but is not one of its attempts, so the
      // reader sees the stage rather than a unit ordinal, exactly as it does for the reduction.
      active.progress.currentUnitOrdinal = null;
      active.progress.currentUnitStartedAt = new Date().toISOString();
      active.progress.attemptState = 'dispatched';
      active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
      const result = await harness.submitUnit(message);
      if (this.#deps.stageHold) await this.#deps.stageHold('assurance-sampling');
      const canonical = context.liveAdapter.instance?.lastCanonicalResult ?? null;
      // A sampling turn is a model turn like any other: it counts as a request, its usage counts
      // toward the Run and the ceiling, and it records no execution-span row, because the span table
      // is unit-only and this step is not one of the unit's attempts.
      const usageSignal = result.signals.find((signal) => signal.kind === 'usage');
      const turnUsage = usageSignal?.kind === 'usage'
        ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens }
        : null;
      context.countTurn('assurance-sampling', turnUsage, result.signals);
      if (turnUsage !== null) {
        sampled.inputTokens += turnUsage.inputTokens;
        sampled.outputTokens += turnUsage.outputTokens;
        sampled.turnsWithUsage += 1;
      }
      active.progress.completedAttempts += 1;
      const gap = (detail: string): void => { gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, detail)); };
      const candidate = result.signals.find((signal) => signal.kind === 'contentCandidate');
      let ended = false;
      let settledState: 'closed' | 'gap' | 'outcome-unknown' = 'gap';
      // A turn the account limit refused, or one AI7 stopping cut off, is not kept settled: 续行 sends it again.
      let unsettled = false;
      try {
        if (result.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
          context.acceptedOutputDigests.add(candidate.digest);
          if (canonical?.kind === 'empty-answer') {
            gap(assuranceSamplingEmptyAnswerGapReason(canonical.reasoningPresent));
            continue;
          }
          const parsed = parseAssuranceSamplingResult(candidate.text, { refs: turn.findings.map((finding) => finding.ref) });
          if (!parsed.ok) {
            gap(unparsableAssuranceSamplingAnswerGapReason(parsed.code, parsed.detail, candidate.text));
            continue;
          }
          // The disposition names its finding by `ref`; the tier and the anchor unit are read back from
          // the candidate the Run itself drew, never from the model's answer.
          const byRef = new Map(turn.findings.map((finding) => [finding.ref, finding] as const));
          for (const entry of parsed.result.dispositions) {
            const finding = byRef.get(entry.ref)!;
            dispositions.push({
              ref: entry.ref,
              unitOrdinal: finding.unitOrdinal,
              tier: finding.tier,
              disposition: entry.disposition,
              reason: entry.reason,
            });
          }
          settledState = 'closed';
        } else if (result.terminal === 'completed') {
          gap('技术回合完成但没有模型输出。');
        } else if (result.terminal === 'failed') {
          const failure = result.signals.find((signal) => signal.kind === 'failed');
          // No safe retry here: one attempt per turn, and a retry-safe failure is a gap like any other.
          gap(failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
          // A Provider Account Limit ends the suboperation outright: no retry, no fallback, no second model — and a Run that
          // keeps its progress stops there, before retrying the refused turn with 续行 (Issue #51, S16b).
          if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit') {
            context.onAccountLimit(`${failure.failure.reason}（${failure.failure.code}）`);
            unsettled = true;
            break;
          }
        } else {
          // 结果待确认 (Issue #51, S16c): a sampling turn whose result cannot be known says so, never 被中断, and the sample stops.
          const unknown = ambiguousTurnReason(result.signals);
          const failure = result.signals.find((signal) => signal.kind === 'interrupted');
          gap(unknown ?? (failure?.kind === 'interrupted' ? failure.failure.reason : '保证抽样被中断。'));
          ended = true;
          if (unknown !== null) settledState = 'outcome-unknown';
          // AI7 stopping cut the turn off before anything of it settled: as a unit cut off there is read again (CONT-014),
          // 续行 sends it. A sent request whose result cannot be known stays settled and is never sent again.
          else if (active.interrupted && active.resumableOnInterrupt) unsettled = true;
          break;
        }
      } finally {
        if (!unsettled) {
          settledTurns.push({ requestDigest: canonicalRecord(message).digest, unitOrdinal: turn.unitOrdinal, usage: turnUsage, state: settledState });
          save(sampleTurn + 1, ended);
        }
      }
    }
    context.clock.close();
    const usage = sampled.turnsWithUsage === 0 ? null : { inputTokens: sampled.inputTokens, outputTokens: sampled.outputTokens };
    return assuranceSampleOutcome(draw, dispositions, usage, gapReasons);
  }
}

/**
 * The rule that admits a ledger's non-baseline kind under its launch (Issue #429), or `null`: the shared admission, on the
 * Main Editorial Role a planned Run's persisted Execution Binding names. A ledger bound to no live launch is admitted by none.
 */
function liveRuleOf(ledger: BaselineAnalysisStore): LiveKindRule | null {
  if (ledger.launch.live === null) return null;
  const rule = liveKindAdmission(ledger.launch.policy, ledger.definition, ledger.launch.live);
  return rule?.modelRole === 'Main Editorial Role' ? rule : null;
}

/** The route facts a Run's Execution Binding names, from its frozen plan and the launch the owner runs under. */
function routeFactsOf(facts: ExecutionPlanFacts, live: LiveRuntime | null): {
  route: ExecutionRouteId;
  model: string;
  credentialSlot: CredentialSlotBinding['slot'];
  credentialReference: string;
  runBudgetCeiling: RunBudgetCeiling;
} {
  // Ordinary production (Issue #811): the binding the plan froze, on the connection's own Credential Reference it named.
  if (isOrdinaryProductionRuntime(live)) {
    const binding = facts.productionBinding;
    if (binding === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '冻结计划没有正式使用下的模型服务路线。');
    return {
      route: binding.route,
      model: binding.model,
      credentialSlot: binding.credentialSlot,
      credentialReference: facts.credentialReference,
      runBudgetCeiling: facts.runBudgetCeiling === 'unset' ? { kind: 'unset' } : facts.runBudgetCeiling,
    };
  }
  return {
    route: live === null ? LOCAL_DETERMINISTIC_ROUTE : OPENCODE_GO_ROUTE,
    model: live === null ? LOCAL_DETERMINISTIC_MODEL : OPENCODE_GO_V41_FLASH_PROFILE.model,
    credentialSlot: live === null ? 'deepseek-api-key' : OPENCODE_GO_ROUTE_PROFILE.credentialSlot,
    credentialReference: live === null ? facts.credentialReference : DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
    runBudgetCeiling: facts.runBudgetCeiling === 'unset' ? { kind: 'unset' } : facts.runBudgetCeiling,
  };
}

/**
 * One attempt's Execution Binding, exactly as it is persisted before the first model call. 续行 builds it again from
 * the same frozen plan and launch with the attempt's own identities, and goes on only if it reads byte for byte as
 * the persisted one (CONT-015).
 */
function executionBindingRecordOf(input: {
  facts: ExecutionPlanFacts;
  definition: AnalysisKindDefinition;
  live: LiveRuntime | null;
  fixture: ResolvedModelFixture | null;
  attemptId: string;
  harnessSessionId: string;
  boundAt: string;
  compositionDigest: string;
}): ExecutionBindingRecord {
  const { facts, definition, live, fixture } = input;
  const { route, model, credentialSlot, credentialReference, runBudgetCeiling } = routeFactsOf(facts, live);
  const update = facts.update;
  return {
    attemptId: input.attemptId,
    taskIntentId: facts.taskIntentId,
    runRecordId: facts.runRecordId,
    bookId: facts.bookId,
    planEnvelopeDigest: facts.planEnvelopeDigest,
    planVersion: facts.planVersionOrdinal,
    runSourceScopeDigest: facts.runSourceScopeDigest,
    providerResolutionPlanDigest: facts.providerResolutionPlanDigest,
    coverageManifestDigest: facts.manifestDigest,
    manuscriptPin: { revisionId: facts.checkpoint.revisionId, revisionDigest: facts.checkpoint.revisionDigest },
    nativeArtifact: {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: facts.artifactPin.nativeCarrierSha256,
      sidecarRevision: 2,
      sidecarSha256: facts.artifactPin.sidecarSha256,
    },
    behaviorCompositionDigest: input.compositionDigest,
    ...(facts.compositionOptions?.version === 2 ? { compositionVersion: 2 as const } : {}),
    promptContractDigest: definition.promptContractDigest,
    contractVersion: definition.contractVersion,
    harnessSessionId: input.harnessSessionId,
    route,
    model,
    adapterPin: live === null ? { fixtureIdentity: fixture!.identity, fixtureSha256: fixture!.sha256 } : null,
    credentialSlot: { modelRole: 'Main Editorial Role', slot: credentialSlot, credentialReference },
    outboundDataCategory: isOrdinaryProductionRuntime(live) ? 'unpublished-excerpts' : 'public-or-synthetic',
    policyPin: live === null
      ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 0 }
      : isOrdinaryProductionRuntime(live)
      ? { operationalScope: 'ordinary-production', providerProcessingVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' }
      : { operationalScope: 'developer-live', providerProcessingVersion: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' },
    runBudgetCeiling: runBudgetCeiling.kind === 'unset' ? 'unset' : runBudgetCeiling,
    dispatchAttribution: 'Dispatch',
    boundAt: input.boundAt,
    ...(update === null ? {} : { update: { mode: update.mode, predecessorRevisionId: update.predecessor?.revisionId ?? null, reusePlanDigest: update.reusePlanDigest } }),
  };
}

/** A cancelled Run no execution can finish ends here, with no revision, its reason in its own words. */
/** The units a Run's plan submits: every unit of a first baseline, the recomputed ones of an update. */
function submittedUnitsOf(facts: ExecutionPlanFacts): number {
  return facts.update === null ? facts.manifest.units.length : facts.update.reusePlan.counts.recomputed;
}

/**
 * What a stopped Run whose cancellation waits for a place reads meanwhile (Issue #422, S76b): stopped between two
 * ranges, with the units it kept and the model turns they took, and nothing in flight.
 */
function stoppedRunProgress(facts: ExecutionPlanFacts, checkpoints: ReadonlyArray<UnitCheckpoint>): RunProgress {
  return {
    unitsTotal: submittedUnitsOf(facts),
    unitsSettled: checkpoints.length,
    currentUnitOrdinal: null,
    currentUnitStartedAt: null,
    attemptState: null,
    completedAttempts: checkpoints.reduce((total, checkpoint) => total + (checkpoint.observation?.attempts ?? 0), 0),
    longestSettledUnitMs: null,
    stage: 'units',
  };
}

function settleCancelWithoutRevision(ledger: BaselineAnalysisStore, runRecordId: string, reason: string): void {
  const facts = ledger.cancellationFacts(runRecordId);
  // Its turns before it stopped were sent: the units the ledger recorded a turn for are the ones it submitted. Their
  // usage was never recorded, so the report can count none of it.
  const submitted = facts.attemptId === null ? 0 : ledger.submittedUnitCount(facts.attemptId);
  recordCancelledWithoutRevision(ledger, runRecordId, facts.taskIntentId, facts.attemptId, reason, submitted);
}

/**
 * The terminal cancellation of a Run that formed no revision (Issue #422; CTRL-006, CTRL-008): one cancelled before
 * it began its units, which sent nothing, or one no execution holds any more. Its Task Outcome says exactly that, and
 * its Run Report records stages that never ran, no units and no usage, as a Run that failed before its revision does.
 */
function recordCancelledWithoutRevision(
  ledger: BaselineAnalysisStore,
  runRecordId: string,
  taskIntentId: string,
  attemptId: string | null,
  reason: string,
  submitted = 0,
): void {
  ledger.recordRunState(runRecordId, 'cancelled', { detail: reason });
  const none = { requests: 0, inputTokens: 0, outputTokens: 0 };
  ledger.recordOutcome({
    taskIntentId,
    runRecordId,
    classification: 'cancelled',
    resultSetRevisionId: null,
    summary: reason,
    safeNextAction: (ledger.definition.safeNextActions ?? SAFE_NEXT_ACTIONS).cancelled,
    report: buildRunReport({
      runRecordId,
      taskIntentId,
      attemptId,
      resultSetRevisionId: null,
      classification: 'cancelled',
      recordedAt: new Date().toISOString(),
      spans: new Map(),
      usage: { units: none, 'cross-unit-reduction': { ...none }, 'assurance-sampling': { ...none } },
      unitRows: [],
      submitted,
      adaptations: [],
      gaps: [],
      crossUnit: { state: 'not-run', reason: CROSS_UNIT_CANCELLED },
      sample: assuranceSampleNotRun(ASSURANCE_SAMPLING_CANCELLED),
      findingCounts: [],
      terminalFailure: null,
    }, runReportReflectionNotRun(RUN_REPORT_REFLECTION_CANCELLED)),
  });
}

/** The exact disclosure when the active Provider Processing policy does not name the suboperation. */
export const ASSURANCE_SAMPLING_POLICY_BOUNDED = '保证抽样未派发：当前 Provider Processing 策略仅授权单元数内的传输' as const;

/** The exact disclosure of a Run that stopped before the reflection turn could be formed at all. */
export const RUN_REPORT_REFLECTION_NOT_REACHED = '运行在形成结果集修订版前结束，运行反思未发起。' as const;

/** The exact disclosure when the active Provider Processing policy does not name the reflection turn. */
export const RUN_REPORT_REFLECTION_POLICY_BOUNDED = '运行反思未派发：当前 Provider Processing 策略仅授权单元数内的传输' as const;

/**
 * The two readings of a reflection turn that came back with nothing usable. They mirror the sample's
 * exactly, and say the one thing that matters about this suboperation's failure: the Run's own result
 * is untouched, because the revision was persisted before the turn was ever dispatched.
 */
export function runReportReflectionEmptyAnswerGapReason(reasoningPresent: boolean): string {
  return reasoningPresent
    ? '运行反思未闭合：模型完成了推理，但答案通道为空。本次运行的结果集修订版不受影响。'
    : '运行反思未闭合：模型的答案通道与推理通道都为空。本次运行的结果集修订版不受影响。';
}

export function unparsableRunReportReflectionAnswerGapReason(
  code: RunReportReflectionParseFailureCode,
  detail: string,
  answerText: string,
): string {
  return `运行反思结果不符合契约 v1（${code}）：${detail}模型返回了 ${[...answerText].length} 个字符，其中没有可解析的反思结果。本次运行的结果集修订版不受影响。`;
}

/** Exactly what the reflection suboperation may read or move; no finding and no block is among them. */
interface RunReportReflectionContext {
  readonly active: ActiveRun;
  readonly harness: PrimaryAgentHarnessHandle;
  readonly runRecordId: string;
  /** The stable accounting of the report this turn reflects on; counts, codes, and digests only. */
  readonly accounting: RunReportAccounting;
  readonly admittedUserMessages: Set<string>;
  readonly acceptedOutputDigests: Set<string>;
  readonly liveAdapter: { instance: DeepSeekOpenAiCompatibleAdapter | null };
  readonly accumulated: UsageFacts[];
  readonly ceilingState: () => EgressCeilingState;
  readonly live: LiveRuntime | null;
  readonly policy: LaunchPolicyProjection;
  /** Whether the Run had already stopped; a stopped Run reflects on nothing. */
  readonly stopped: boolean;
}

/** Exactly what the sampling suboperation may read or move; the finding components are not among them. */
interface AssuranceSamplingContext {
  readonly stages: StageContinuation;
  readonly active: ActiveRun;
  readonly definition: AnalysisKindDefinition;
  readonly harness: PrimaryAgentHarnessHandle;
  readonly reduction: AnalysisReductionResult;
  readonly manifest: CoverageManifestProjection;
  readonly blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>;
  readonly admittedUserMessages: Set<string>;
  readonly acceptedOutputDigests: Set<string>;
  readonly liveAdapter: { instance: DeepSeekOpenAiCompatibleAdapter | null };
  /** Counts one settled model turn against both the Run's total and its Run Report stage. */
  readonly countTurn: (stage: RunReportRevisionUsageStageId, usage: { inputTokens: number; outputTokens: number } | null, signals?: ReadonlyArray<HarnessSignal>) => void;
  /** The owner's own clock; the suboperation opens its stage only once a turn is actually dispatched. */
  readonly clock: RunStageClock;
  readonly ceilingState: () => EgressCeilingState;
  readonly live: LiveRuntime | null;
  readonly policy: LaunchPolicyProjection;
  /** Whether the Run had already stopped when the unit loop ended; a stopped Run samples nothing. */
  readonly stopped: boolean;
  /** What a stopped Run's sample says it did not draw, when the stop has its own words (Issue #51, S16a). */
  readonly stoppedReason: string | null;
  /** Whether the bound plan leaves 核对与抽检 out (Issue #419); such a Run draws no sample at all. */
  readonly removedByEditor: boolean;
  /** The ceiling stopped a sampling turn: the Run ends as the Run Budget Ceiling reached (Issue #51, S16a). */
  readonly onCeilingReached: () => void;
  /** The provider refused a sampling turn on the account's limit (Issue #51, S16b), in its own words. */
  readonly onAccountLimit: (condition: string) => void;
  /** The material guard (Issue #759), asked before each turn: a reference no longer readable as pinned sends no further turn. */
  readonly materialChanged: () => boolean;
}

/** What two attempts of one unit cost together; `null` only when neither reported any usage at all. */
function addUsage(
  left: { inputTokens: number; outputTokens: number } | null,
  right: { inputTokens: number; outputTokens: number } | null,
): { inputTokens: number; outputTokens: number } | null {
  if (left === null) return right;
  if (right === null) return left;
  return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens };
}

/**
 * The execution owner's own clock over its own work: one accumulating wall-time total per declared
 * Run Report stage, taken from instants this owner holds. Nothing here reads the Harness Session
 * Ledger, which is the boundary the Run Report's stop condition draws.
 *
 * Segments are disjoint by construction — opening one closes whatever was open — so the four totals
 * partition the Run's work rather than nesting. `reduction` is the stage that needs this: the kind's
 * reducers run before the assurance sample and the persist runs after it, and the sampling await
 * between them belongs to the sampling stage. A stage therefore reports the first instant it was
 * entered, the last instant it settled, and the sum of its own segments in between — which for
 * `reduction` is deliberately less than the distance between those two instants.
 */
class RunStageClock {
  readonly #totals = new Map<RunReportStageId, RunReportSpan>();
  #open: { stage: RunReportStageId; startedAt: string; at: number } | null = null;

  open(stage: RunReportStageId): void {
    this.close();
    this.#open = { stage, startedAt: new Date().toISOString(), at: Date.now() };
  }

  close(): void {
    const open = this.#open;
    if (open === null) return;
    this.#open = null;
    const settledAt = new Date().toISOString();
    const wallMs = Date.now() - open.at;
    const previous = this.#totals.get(open.stage);
    this.#totals.set(open.stage, previous === undefined
      ? { startedAt: open.startedAt, settledAt, wallMs }
      : { startedAt: previous.startedAt, settledAt, wallMs: previous.wallMs + wallMs });
  }

  /** The measured segments, by stage; a stage the Run never entered is absent rather than zero. */
  spans(): ReadonlyMap<RunReportStageId, RunReportSpan> {
    this.close();
    return this.#totals;
  }
}

/**
 * The Run Report's unit rows: the revision's own unit records, joined with what the owner observed
 * while it settled each one. A reused unit carries the predecessor's usage and no attempts of its
 * own; a unit an interrupted loop never reached carries its `not-attempted` gap and neither. The rows
 * are therefore exactly the revision's units, which is what lets the report's accounting be checked
 * against the revision's coverage and lineage counts.
 */
export function runReportUnitRows(
  records: ReadonlyArray<UnitResultRecord>,
  observations: ReadonlyMap<number, RunReportUnitObservation>,
): RunReportUnitRow[] {
  return records.map((record) => {
    const observed = observations.get(record.unitOrdinal) ?? null;
    return {
      unitOrdinal: record.unitOrdinal,
      state: record.closed.state,
      lineage: record.lineage.kind,
      attempts: observed?.attempts ?? 0,
      wallMs: observed?.wallMs ?? null,
      // What the unit cost this Run — both attempts of a retried unit, not just its last — and, for a
      // unit this Run never submitted, what the predecessor's own record already carried.
      usage: observed?.usage ?? (record.closed.state === 'closed' ? record.closed.usage : null),
      gapCode: record.closed.state === 'gap' ? record.closed.gap.code : null,
    };
  });
}

/** The sampling contract a Run would sample under must be the one its plan froze (Issue #826); nothing is sent otherwise. */
function requireAssuranceContractMatch(definition: AnalysisKindDefinition, frozenDigest: string): void {
  if (assuranceContractMoved(definition, frozenDigest)) {
    throw new ExecutionAdmissionError('EXECUTION_STAGE_CONTRACT_DRIFT', '保证抽样契约与冻结计划不一致；未开始执行。');
  }
}

function requireCompositionMatch(actual: string, planned: string): void {
  if (actual !== planned) throw new ExecutionAdmissionError('EXECUTION_COMPOSITION_DRIFT', '组合摘要与冻结计划不一致；未开始执行。');
}

/** The route profile of an ordinary-production Run's frozen route (Issue #811): the provider document's, exactly. */
function productionRouteProfile(route: ExecutionRouteId): ProviderRouteProfile {
  const profile = (PROVIDER_ROUTE_PROFILES as Readonly<Record<string, ProviderRouteProfile>>)[route];
  if (profile === undefined) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '冻结计划的模型服务路线没有声明。');
  return profile;
}

/** The model profile of an ordinary-production Run's frozen route and model (Issue #811). */
function productionModelProfile(route: ExecutionRouteId, model: string): ProviderModelProfile {
  const profile = route === LOCAL_DETERMINISTIC_ROUTE ? null : modelProfileFor(route, model);
  if (profile === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '冻结计划的模型没有声明。');
  return profile;
}

/** A v2 unit's located findings with the https sources their assertions' relations name appended to their basis (Issue #901). */
function withRelationCitations<T extends { findingId: string; basis: string }>(
  findings: ReadonlyArray<T>,
  unit: Pick<CoverageManifestUnitProjection, 'overlapBlockIds' | 'blockIds'>,
  result: FactualReviewUnitResultV2,
): T[] {
  const messageBlockIds = [...unit.overlapBlockIds, ...unit.blockIds];
  const sources = new Map<string, Set<string>>();
  for (const assertion of result.assertions) {
    const blockId = messageBlockIds[assertion.blockOrdinal - 1];
    if (blockId === undefined) continue;
    const id = factualFindingId(blockId, assertion.quote);
    const named = sources.get(id) ?? new Set<string>();
    for (const relation of assertion.evidenceRelations) if (relation.sourceRef.startsWith('https://')) named.add(relation.sourceRef);
    sources.set(id, named);
  }
  return findings.map((finding) => {
    const named = [...(sources.get(finding.findingId) ?? [])].filter((url) => !finding.basis.includes(url));
    return named.length === 0 ? finding : { ...finding, basis: `${finding.basis} ${named.join(' ')}` };
  });
}

export type ModelRequestProducerKind = 'analysis-unit' | 'analysis-stage' | 'dialogue' | 'fast-role' | 'connection-test';
export type ModelRequestLane = 'foreground' | 'background';

const MODEL_REQUEST_PRODUCER_IDENTITY: unique symbol = Symbol('model-request-producer');

/** An opaque registration in exactly one governor; registration reserves no request capacity. */
export interface ModelRequestProducer {
  readonly [MODEL_REQUEST_PRODUCER_IDENTITY]: true;
}

export interface ModelRequestPermit {
  release(): void;
}

export interface ModelRequestGovernorOptions {
  /** Trusted construction may lower the reviewed defaults; these are not runtime settings. */
  readonly globalCapacity?: number;
  readonly backgroundCapacity?: number;
}

export interface ModelRequestGovernorSnapshot {
  readonly registered: number;
  readonly waiting: number;
  readonly inFlight: number;
  readonly backgroundInFlight: number;
}

interface ModelRequestProducerState {
  readonly key: string;
  readonly lane: ModelRequestLane;
  closing: boolean;
  active: boolean;
  waiter: ModelRequestWaiter | null;
}

interface ModelRequestWaiter {
  readonly producer: ModelRequestProducerState;
  readonly signal: AbortSignal;
  readonly abort: () => void;
  readonly resolve: (permit: ModelRequestPermit) => void;
  readonly reject: (reason: unknown) => void;
}

/**
 * Physical model-request capacity only (Issue #1131). The Run/consumer owns authorization,
 * cancellation after grant, transport/body cleanup and finally release. A tool gap keeps only its
 * producer registration: each later request joins the eligible FIFO again.
 */
export class ModelRequestGovernor {
  readonly #globalCapacity: number;
  readonly #backgroundCapacity: number;
  // Two Runs × three units, one dialogue, one singleton Fast operation and one connection test.
  // Lower request capacities do not change this admitted-producer bound.
  readonly #producerCapacity = 9;
  readonly #producers = new WeakMap<ModelRequestProducer, ModelRequestProducerState>();
  readonly #registered = new Map<string, ModelRequestProducerState>();
  readonly #waiting: ModelRequestWaiter[] = [];
  #inFlight = 0;
  #backgroundInFlight = 0;
  #closed = false;
  #idle: { readonly promise: Promise<void>; readonly resolve: () => void } | null = null;

  constructor(options: ModelRequestGovernorOptions = {}) {
    const globalCapacity = options.globalCapacity ?? 4;
    const backgroundCapacity = options.backgroundCapacity ?? 1;
    if (!Number.isSafeInteger(globalCapacity) || globalCapacity < 1 || globalCapacity > 4
      || !Number.isSafeInteger(backgroundCapacity) || backgroundCapacity < 1 || backgroundCapacity > 1
      || backgroundCapacity > globalCapacity) {
      throw new Error('MODEL_REQUEST_CAPACITY_INVALID');
    }
    this.#globalCapacity = globalCapacity;
    this.#backgroundCapacity = backgroundCapacity;
  }

  registerProducer(input: { readonly key: string; readonly kind: ModelRequestProducerKind; readonly lane: ModelRequestLane }): ModelRequestProducer {
    if (this.#closed) throw new Error('MODEL_REQUEST_GOVERNOR_CLOSED');
    if (this.#registered.has(input.key)) throw new Error('MODEL_REQUEST_PRODUCER_DUPLICATE');
    if (this.#registered.size >= this.#producerCapacity) throw new Error('MODEL_REQUEST_PRODUCER_CAPACITY');
    const producer = Object.freeze<ModelRequestProducer>({ [MODEL_REQUEST_PRODUCER_IDENTITY]: true });
    const state: ModelRequestProducerState = { key: input.key, lane: input.lane, closing: false, active: false, waiter: null };
    this.#producers.set(producer, state);
    this.#registered.set(input.key, state);
    return producer;
  }

  async acquire(producer: ModelRequestProducer, signal: AbortSignal): Promise<ModelRequestPermit> {
    if (this.#closed) throw new Error('MODEL_REQUEST_GOVERNOR_CLOSED');
    const state = this.#producerState(producer);
    if (state.closing) throw new Error('MODEL_REQUEST_PRODUCER_CLOSED');
    if (state.active || state.waiter !== null) throw new Error('MODEL_REQUEST_PRODUCER_BUSY');
    signal.throwIfAborted();
    return new Promise<ModelRequestPermit>((resolve, reject) => {
      const waiter: ModelRequestWaiter = {
        producer: state, signal, resolve, reject,
        abort: () => this.#rejectWaiter(waiter, signal.reason),
      };
      state.waiter = waiter;
      this.#waiting.push(waiter);
      signal.addEventListener('abort', waiter.abort, { once: true });
      // Cover cancellation between the first check and listener registration, before any grant.
      if (signal.aborted) this.#rejectWaiter(waiter, signal.reason);
      else this.#drain();
    });
  }

  unregisterProducer(producer: ModelRequestProducer): void {
    const state = this.#producerState(producer);
    if (state.closing) return;
    state.closing = true;
    if (state.waiter !== null) this.#rejectWaiter(state.waiter, new Error('MODEL_REQUEST_PRODUCER_CLOSED'));
    if (!state.active) this.#registered.delete(state.key);
    this.#settleIdle();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const state of this.#registered.values()) {
      state.closing = true;
      if (state.waiter !== null) this.#rejectWaiter(state.waiter, new Error('MODEL_REQUEST_GOVERNOR_CLOSED'));
      if (!state.active) this.#registered.delete(state.key);
    }
    this.#settleIdle();
  }

  whenIdle(): Promise<void> {
    if (this.#waiting.length === 0 && this.#inFlight === 0) return Promise.resolve();
    if (this.#idle === null) this.#idle = Promise.withResolvers<void>();
    return this.#idle.promise;
  }

  snapshot(): ModelRequestGovernorSnapshot {
    return Object.freeze({
      registered: this.#registered.size,
      waiting: this.#waiting.length,
      inFlight: this.#inFlight,
      backgroundInFlight: this.#backgroundInFlight,
    });
  }

  #producerState(producer: ModelRequestProducer): ModelRequestProducerState {
    const state = this.#producers.get(producer);
    if (state === undefined) throw new Error('MODEL_REQUEST_PRODUCER_ALIEN');
    return state;
  }

  #rejectWaiter(waiter: ModelRequestWaiter, reason: unknown): void {
    if (waiter.producer.waiter !== waiter) return;
    this.#waiting.splice(this.#waiting.indexOf(waiter), 1);
    waiter.producer.waiter = null;
    waiter.signal.removeEventListener('abort', waiter.abort);
    waiter.reject(reason);
    this.#drain();
  }

  #drain(): void {
    while (!this.#closed && this.#inFlight < this.#globalCapacity) {
      const index = this.#waiting.findIndex((waiter) => waiter.producer.lane === 'foreground'
        || this.#backgroundInFlight < this.#backgroundCapacity);
      if (index === -1) break;
      const waiter = this.#waiting.splice(index, 1)[0]!;
      const state = waiter.producer;
      // Grant transfers ownership atomically. Late aborts belong to the caller, even before its
      // await resumes: a body/iterator may still be unwinding and must remain counted.
      state.waiter = null;
      state.active = true;
      this.#inFlight += 1;
      if (state.lane === 'background') this.#backgroundInFlight += 1;
      waiter.signal.removeEventListener('abort', waiter.abort);
      let released = false;
      waiter.resolve(Object.freeze({
        release: () => {
          if (released) return;
          released = true;
          state.active = false;
          this.#inFlight -= 1;
          if (state.lane === 'background') this.#backgroundInFlight -= 1;
          if (state.closing) this.#registered.delete(state.key);
          this.#drain();
        },
      }));
    }
    this.#settleIdle();
  }

  #settleIdle(): void {
    if (this.#waiting.length !== 0 || this.#inFlight !== 0) return;
    this.#idle?.resolve();
    this.#idle = null;
  }
}
