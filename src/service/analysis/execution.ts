import { randomUUID } from 'node:crypto';
import { BASELINE_ANALYSIS_KIND } from '../../shared/protocol.js';
import type { AnalysisAssuranceSampleDispositionProjection, AnalysisGapProjection, AnalysisReusePlanUnitProjection, CoverageManifestProjection, CoverageManifestUnitProjection, ExecutionRouteId, LaunchPolicyProjection, ReviewScopePlanUnitProjection, RunAttemptState, RunReportStageId } from '../../shared/protocol.js';
import { prepareExecution, type HarnessExecutionSpan, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import type { DeveloperLiveRuntime } from '../launch-policy.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { evaluateRunBudgetCeiling, totalTokens, type ClassifiedModelFailure, type RunBudgetCeiling, type UsageFacts } from '../provider/classification.js';
import { DeepSeekOpenAiCompatibleAdapter, OPENCODE_GO_ROUTE_PROFILE, isProviderAccountLimit, type ProviderRouteProfile } from '../provider/deepseek-adapter.js';
import { OPENCODE_GO_V4_FLASH_PROFILE } from '../provider/model-profile.js';
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
import { ProviderResultCache, providerRequestDigest, usageOfResponse } from '../provider/provider-result-cache.js';
import {
  assuranceSamplingTurns,
  buildAssuranceSamplingMessage,
  drawAssuranceSample,
  parseAssuranceSamplingResult,
  type AssuranceSamplingParseFailureCode,
} from './assurance-sampling-contract.js';
import { canonicalRecord } from './canonical.js';
import { SAMPLE1_SOURCE_DIGEST, type BaselineAnalysisStore, type ExecutionBindingRecord, type ExecutionPlanFacts, type PredecessorUnitResult, type RunProgress, type RunProgressStage, type UnitCheckpoint, type UnitResultRecord } from './baseline-analysis-store.js';
import type { BaselineUnitResult } from './contract.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import { ExecutionAdmissionError } from './execution-error.js';
import { applyAssuranceSample, type AnalysisKindDefinition, type AnalysisReductionResult } from './kind-definition.js';
import { ASSURANCE_SAMPLING_REMOVED, SAFE_RETRY_WITHHELD, adaptationMode, assuranceSamplingKept } from './plan-edits.js';
import {
  CLARIFICATION_CANCELLED_UNANSWERED,
  CLARIFICATION_ENDED_UNANSWERED,
  CLARIFICATION_RECORD_GAP,
  awaitingClarificationDetail,
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
import { OUT_OF_SCOPE_GAP_REASON } from './reuse-plan.js';
import {
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
 * carries that ledger to every write it makes, so a Review Run's category Tasks execute one after
 * another through this same single slot: a second dispatch of any kind is refused while one runs.
 */
export { ExecutionAdmissionError };
export { remapReusedResult } from './reused-result.js';

export interface ExecutionOwnerDependencies {
  /** The baseline kind's ledger: the one a dispatch that names no ledger runs against. */
  readonly ledger: BaselineAnalysisStore;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly fixture: ResolvedModelFixture | null;
  readonly secretResolver: SecretResolver;
  /** The developer-live launch facts and captured transport; present exactly when the policy bound v5. */
  readonly developerLive?: DeveloperLiveRuntime | null;
  /** J-10's unit hold (Issue #422); absent in every other launch, where a unit settles as soon as its turn returns. */
  readonly unitHold?: UnitHold | null;
}

/**
 * J-10's unit hold (Issue #422, plan slice S76a): once a unit's turn has come back, the owner asks whether the unit
 * may settle, given how many units already have, and waits until it may. The unit is in flight all that time, which
 * is what lets the Journey cancel a Run with a unit under way and watch 正在取消 until that unit finishes. A
 * cancellation does not end the hold, exactly as it never cuts off a sent turn; an interruption does, so a held Run
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
  harness: PrimaryAgentHarnessHandle | null;
  interrupted: boolean;
  /**
   * 取消任务 (Issue #422): the editor cancelled the Run and `cancelling` is recorded. It is read between units only,
   * so the unit in flight finishes — a sent turn is never aborted — and nothing after it is sent.
   */
  cancelRequested: boolean;
  /** 暂停 (Issue #422, S76b): read between units like a cancellation; the Run then waits, keeping what it read. */
  pauseRequested: boolean;
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
    ? `已暂停：全部 ${total} 个阅读范围都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样。`
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
export function accountLimitDetail(settled: number, total: number): string {
  return settled >= total
    ? `模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。全部 ${total} 个阅读范围都已读完，结果都已保存。处理好模型服务、限额解除后点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。`
    : `模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。已读完 ${settled} / ${total} 个阅读范围，结果都已保存。处理好模型服务、限额解除后点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。`;
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
} as const;

type LiveInterruption = keyof typeof LIVE_INTERRUPTIONS;

/**
 * 调整预算并重做 (Issue #51, S16a; V2-UX-MODEL-016, MODEL-017): the way on from a ceiling the editor set in the plan. The Run
 * cannot go on — neither 续行 nor 重试 — so a new Task carries what it read under a ceiling raised or removed.
 */
export const BUDGET_REACHED_NEXT_ACTION = '点「调整预算并重做」：在新任务的计划里提高或去掉预算上限，沿用这次已读完的阅读范围接着读其余的；这次运行不能续行或重试。' as const;
/** A safe retry the spent ceiling stopped (Issue #51, S16a): the unit's first failure is its gap, and nothing more is sent. */
export const SAFE_RETRY_BUDGET_REACHED = '任务运行预算已达上限，没有再试一次' as const;
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

export function unparsableCrossUnitAnswerGapReason(code: CrossUnitResultParseFailureCode, detail: string, answerText: string): string {
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
 * The transmittable set under v5: exact `sample1` and nothing else (settlement l). ADR 0065 admits
 * only Owner-designated Public SampleBooks, and this slice fixes the set to the one Book whose
 * lineage the plan already pins. Any other Book refuses before dispatch rather than at the gate, so
 * no unadmitted manuscript is ever assembled into a payload at all.
 */
export const DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS: ReadonlySet<string> = new Set([SAMPLE1_SOURCE_DIGEST]);

export class BaselineAnalysisExecutionOwner {
  readonly #deps: ExecutionOwnerDependencies;
  readonly #broker: CredentialBroker;
  #active: ActiveRun | null = null;
  #disposed = false;
  /** Stopped Runs whose cancellation waits for the one slot to finish them (Issue #422, S76b). */
  readonly #pendingCancels: Array<{ runRecordId: string; ledger: BaselineAnalysisStore }> = [];
  /** Runs the editor answered while another Run held the slot (Issue #422, S76d): each goes on once it is free. */
  readonly #pendingAnswers: Array<{ runRecordId: string; ledger: BaselineAnalysisStore }> = [];

  constructor(deps: ExecutionOwnerDependencies) {
    // The developer-live runtime and the bound scope are one fact: a v5 launch that reached this owner
    // without its launch facts and captured transport could never enforce the ceiling or the cache, and a
    // runtime under any other scope would be a transport nothing may use.
    const live = deps.developerLive ?? null;
    if ((deps.launchPolicy.operationalScope === 'developer-live') !== (live !== null)) {
      throw new ExecutionAdmissionError('EXECUTION_DEVELOPER_LIVE_RUNTIME_MISMATCH', '开发者实时运行时与已绑定的可信区间不一致。');
    }
    this.#deps = deps;
    this.#broker = new CredentialBroker(deps.secretResolver);
  }

  progressFor(runRecordId: string): RunProgress | null {
    const active = this.#active;
    if (active === null || active.runRecordId !== runRecordId) return null;
    return { ...active.progress, attemptState: attemptStateOf(active) };
  }

  /**
   * Whether a Run holds the one slot now (Issue #420, S74a A2). The editor's start is refused while it
   * does — before anything is recorded — so nothing ever waits in a queue for the slot to free.
   */
  get busy(): boolean {
    return this.#active !== null;
  }

  /**
   * Whether the credential the developer-live route resolves is present now (Issue #420, S74a A3): the
   * readiness dispatch checks before any transmission, asked before an authorization so a Run that could
   * not start is never recorded. The value is resolved and discarded by the broker. `null` under
   * development-ci, whose routes transmit nothing and so need no credential.
   */
  async liveCredentialReadiness(): Promise<'present' | 'missing' | null> {
    if ((this.#deps.developerLive ?? null) === null) return null;
    return this.#broker.checkPlanReadiness(OPENCODE_GO_ROUTE_PROFILE.credentialSlot, DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE);
  }

  /**
   * Single-slot admission: one Run per instance; a second dispatch is refused, never queued.
   *
   * `ledger` is the ledger the Run Record belongs to and defaults to the baseline kind's, so every
   * caller that has always dispatched a baseline Run still does exactly that. The slot is the owner's
   * and not a ledger's: a Run of any kind holds it, which is what keeps a Review Run's category Tasks
   * one after another rather than side by side (Issue #417).
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
    if (this.#active !== null) throw new ExecutionAdmissionError('EXECUTION_BUSY', '当前已有一个运行在执行；本实例一次只执行一个运行。');
    const live = this.#deps.developerLive ?? null;
    if (live === null && this.#deps.fixture === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '没有可执行的本地确定性路由。');
    // Every ledger this owner serves froze its plans under the launch this owner executes under. One
    // that was bound to another launch would hand over a plan whose route this owner cannot honour.
    if ((ledger.launch.live !== null) !== (live !== null)) {
      throw new ExecutionAdmissionError('EXECUTION_LEDGER_LAUNCH_MISMATCH', '该分析账本绑定的可信区间与执行所有者不一致；未开始执行。');
    }
    const facts = ledger.loadExecutionPlan(runRecordId);
    // The Public SampleBook check precedes admission, so an unadmitted Book never reaches a payload.
    if (live !== null && !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(facts.sourceDigest)) {
      throw new ExecutionAdmissionError('EXECUTION_SOURCE_NOT_TRANSMITTABLE', '当前图书不在 developer-live 可传输的 Public SampleBook 集合内；未发起任何传输。');
    }
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
    // 续行 goes on only under the Execution Binding the Run persisted (CONT-015): the same route, model, fixture,
    // policy, credential slot, ceiling and plan digests. Anything else refuses before a state is recorded.
    const continuation: Continuation | null = resuming ? { stored: ledger.executionBindingOf(runRecordId) } : null;
    if (continuation?.stored != null && this.#bindingMoved(continuation.stored, facts, live, ledger)) {
      throw new ExecutionAdmissionError('EXECUTION_RESUME_BINDING_DRIFT', '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同）；不能续行。请改计划重做。');
    }
    const submitted = facts.update === null ? facts.manifest.units.length : facts.update.reusePlan.counts.recomputed;
    // A scope plan also says how many units it leaves unreviewed; a baseline plan has no such count,
    // so its admitted state reads exactly as it always has.
    const unreviewed = facts.update !== null && 'unreviewed' in facts.update.reusePlan.counts ? facts.update.reusePlan.counts.unreviewed : null;
    ledger.recordRunState(runRecordId, 'admitted', {
      detail: !resuming
        ? '已进入 AI7 调度器（单槽位）。'
        : options.cancel === true
          ? '取消：已进入 AI7 调度器，把已读完的部分整理成结果集修订版，不再发送任何内容。'
          : state === 'awaiting-clarification'
            ? '按你的回答接着做：已进入 AI7 调度器（单槽位），从已保存的进度接着读。'
            : '续行：已进入 AI7 调度器（单槽位），从已保存的进度接着读。',
      ...(resuming ? { resumed: true } : {}),
      unitsTotal: facts.manifest.units.length,
      ...(facts.update === null ? {} : { updateMode: facts.update.mode, unitsRecomputed: submitted, unitsReused: facts.update.reusePlan.counts.reused }),
      ...(unreviewed === null ? {} : { unitsUnreviewed: unreviewed }),
    });
    const active: ActiveRun = {
      runRecordId,
      ledger,
      progress: {
        unitsTotal: submitted,
        unitsSettled: 0,
        currentUnitOrdinal: null,
        currentUnitStartedAt: null,
        attemptState: null,
        completedAttempts: 0,
        longestSettledUnitMs: null,
        stage: 'units',
      },
      transmissions: null,
      transmissionsAtDispatch: 0,
      harness: null,
      interrupted: false,
      cancelRequested: options.cancel === true,
      pauseRequested: false,
      resumableOnInterrupt: ledger.definition.kind === BASELINE_ANALYSIS_KIND,
      done: Promise.resolve(),
    };
    this.#active = active;
    active.done = this.#execute(active, facts, continuation).catch((error: unknown) => {
      this.#recordFailure(ledger, facts, error);
    }).finally(() => {
      if (this.#active === active) this.#active = null;
      this.#finishPendingCancel();
    });
  }

  /** Whether the Execution Binding a Run persisted reads otherwise under this launch (CONT-015). */
  #bindingMoved(stored: NonNullable<Continuation['stored']>, facts: ExecutionPlanFacts, live: DeveloperLiveRuntime | null, ledger: BaselineAnalysisStore): boolean {
    const rebuilt = executionBindingRecordOf({
      facts, definition: ledger.definition, live, fixture: this.#deps.fixture, attemptId: stored.attemptId,
      harnessSessionId: stored.binding.harnessSessionId, boundAt: stored.binding.boundAt, compositionDigest: facts.behaviorCompositionDigest,
    });
    return canonicalRecord(rebuilt).digest !== stored.bindingDigest;
  }

  /**
   * Whether this launch can still carry a stopped Run under the Execution Binding it persisted (Issue #422, S76c;
   * CONT-015, CONT-016): the check 续行 and a stopped Run's cancellation make when they re-admit it, made here
   * without recording anything. A launch that cannot — another route, fixture, policy or AI7 version — neither
   * continues the Run nor forms what it kept into a revision: its cancellation settles without one.
   */
  carriesStoppedRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): boolean {
    const live = this.#deps.developerLive ?? null;
    if (this.#disposed || (live === null && this.#deps.fixture === null) || (ledger.launch.live !== null) !== (live !== null)) return false;
    try {
      const facts = ledger.loadExecutionPlan(runRecordId);
      if (live !== null && !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(facts.sourceDigest)) return false;
      const stored = ledger.executionBindingOf(runRecordId);
      return stored == null || !this.#bindingMoved(stored, facts, live, ledger);
    } catch {
      return false;
    }
  }

  /** The next stopped Run whose cancellation waited for the slot, finished now that the slot is free. */
  #finishPendingCancel(): void {
    while (this.#active === null && !this.#disposed && this.#pendingCancels.length > 0) {
      const next = this.#pendingCancels.shift()!;
      try {
        if (next.ledger.currentRunState(next.runRecordId) !== 'cancelling') continue;
        this.admitAndDispatch(next.runRecordId, next.ledger, { resume: true, cancel: true });
      } catch {
        settleCancelWithoutRevision(next.ledger, next.runRecordId, CANCELLED_WITHOUT_REVISION);
      }
    }
    // Then a Run the editor answered while the slot was held (Issue #422, S76d), if it still waits for that answer.
    while (this.#active === null && !this.#disposed && this.#pendingAnswers.length > 0) {
      const next = this.#pendingAnswers.shift()!;
      if (next.ledger.currentRunState(next.runRecordId) !== 'awaiting-clarification') continue;
      try {
        this.admitAndDispatch(next.runRecordId, next.ledger, { resume: true });
      } catch {
        // It stays 任务等待你的说明 with its answer recorded; 续行 is not needed, but the answer's next look finds it.
      }
    }
  }

  /**
   * The editor answered what a Run waiting for them asked (Issue #422, S76d; CLAR-006): it goes on inside its unchanged
   * envelope — a new span of the same attempt, as 续行 is — at once when the slot is free, or as soon as it is.
   */
  continueAnswered(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): 'continuing' | 'queued' {
    if (this.#active === null && !this.#disposed) {
      this.admitAndDispatch(runRecordId, ledger, { resume: true });
      return 'continuing';
    }
    if (!this.#pendingAnswers.some((entry) => entry.runRecordId === runRecordId)) this.#pendingAnswers.push({ runRecordId, ledger });
    return 'queued';
  }

  /** Resolve once no Run is executing; used by the service suites to observe settlement. */
  async whenIdle(): Promise<void> {
    while (this.#active !== null) {
      const current = this.#active;
      await current.done;
      if (this.#active === current) return;
    }
  }

  /**
   * 取消任务 (Issue #422, plan slice S76a; CTRL-005, CTRL-008), once `cancelling` is recorded. The Run this owner
   * executes stops at the next unit boundary: the unit in flight finishes, nothing after it is sent, and the Run ends
   * `cancelled` with what it completed kept. A Run it does not hold — one AI7 left behind when it last closed — is
   * settled here at once, since nothing of it is running.
   */
  cancelRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): 'stopping' | 'settled' {
    const active = this.#active;
    if (active !== null && active.runRecordId === runRecordId) {
      active.cancelRequested = true;
      return 'stopping';
    }
    if (ledger.currentRunState(runRecordId) !== 'cancelling') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有已记录“正在取消”的运行可以结束取消。');
    }
    // A stopped Run that kept units ends the way a running one does — its partial revision, then 已取消 — through the
    // one slot, sending nothing; while another Run holds the slot, it waits for it. One that kept none ends here.
    if (ledger.unitCheckpoints(runRecordId).length > 0 && !this.#disposed) {
      if (this.#active === null) {
        try {
          this.admitAndDispatch(runRecordId, ledger, { resume: true, cancel: true });
        } catch {
          settleCancelWithoutRevision(ledger, runRecordId, CANCELLED_WITHOUT_REVISION);
          return 'settled';
        }
      } else if (!this.#pendingCancels.some((entry) => entry.runRecordId === runRecordId)) {
        this.#pendingCancels.push({ runRecordId, ledger });
      }
      return 'stopping';
    }
    settleCancelWithoutRevision(ledger, runRecordId, CANCELLED_WITHOUT_EXECUTION);
    return 'settled';
  }

  /**
   * 暂停 (Issue #422, S76b; CTRL-001), once `pausing` is recorded. The Run this owner executes stops at the next unit
   * boundary — the unit in flight finishes — and records `paused` with what it read kept. A pause recorded for a Run
   * nothing executes has reached its boundary already, and settles here.
   */
  pauseRun(runRecordId: string, ledger: BaselineAnalysisStore = this.#deps.ledger): 'pausing' | 'settled' {
    const active = this.#active;
    if (active !== null && active.runRecordId === runRecordId) {
      active.pauseRequested = true;
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
    const active = this.#active;
    if (active === null) return;
    active.interrupted = true;
    active.harness?.interrupt();
    await active.done;
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
      // never forms a request at all. The verified v5 document names it; a projection that does not
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
    const failure = result.signals.find((signal) => signal.kind === 'interrupted');
    return gap(failure?.kind === 'interrupted' ? failure.failure.reason : '运行反思被中断。');
  }

  async #execute(active: ActiveRun, facts: ExecutionPlanFacts, continuation: Continuation | null): Promise<void> {
    const ledger = active.ledger;
    // Everything kind-specific this Run needs: the frozen system section, the unit message builder and
    // its header, the unit result parser, the reducer, and whether the kind declares a cross-unit
    // suboperation at all. The owner itself is the same owner for every analysis kind.
    const definition: AnalysisKindDefinition = ledger.definition;
    const promptContractDigest = definition.promptContractDigest;
    const policy = this.#deps.launchPolicy;
    const live = this.#deps.developerLive ?? null;
    if (live === null) {
      if (policy.operationalScope !== 'development-ci' || policy.providerProcessing.version !== 'v1' || policy.providerProcessing.liveTransmissionAllowed !== false) {
        throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', '当前可信策略不是 development-ci · Provider Processing v1。');
      }
    } else if (policy.operationalScope !== 'developer-live' || policy.providerProcessing.version !== 'v5' ||
        policy.providerProcessing.decision !== 'eligible-only' || policy.providerProcessing.liveTransmissionAllowed !== true) {
      throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', '当前可信策略不是 developer-live · Provider Processing v5。');
    }
    const fixture = this.#deps.fixture;
    // The route the plan froze, resolved once — the deterministic fixture, or the live route profile — and the
    // ceiling it carries, already resolved: an explicit launch total, or the policy's per-frozen-unit default
    // against this Run's own frozen unit count. Never re-derived at dispatch.
    const { route, model, credentialSlot, credentialReference, runBudgetCeiling } = routeFactsOf(facts, live);
    // The test item purpose is the Task mode, so a first baseline and each update mode number their
    // live calls separately and a repeated purpose can never collide with an unrelated test. A Task
    // without a plan is the kind's own whole first mode — `first-baseline` for the baseline kind.
    const testItemPurpose = facts.update === null ? definition.initialMode : facts.update.mode;
    let cache: ProviderResultCache | null = null;
    if (live !== null) {
      cache = new ProviderResultCache(live.launch.providerCacheRoot);
      await cache.open();
    }
    const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
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
    const ceilingState = (): EgressCeilingState => {
      if (runBudgetCeiling.kind === 'unset') return 'unset';
      return evaluateRunBudgetCeiling(accumulated, runBudgetCeiling).state === 'reached' ? 'reached' : 'within';
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
      sessionId: harnessSessionId,
      route,
      model,
      systemPrompt: definition.systemPrompt,
      promptContractDigest,
      // One technical Session per Analysis Unit under v5; the deterministic route keeps its single
      // accumulating Session, so J-04's proven composition is untouched.
      ...(live === null ? {} : { sessionMode: 'per-unit' as const }),
      adapterFactory: (codes) => {
        // A continuation's retry is the unit's second attempt however many executions it took to reach it (Issue #422,
        // S76d): the deterministic fixture serves attempts in order, so it is told what each unit attempted before.
        if (live === null) {
          return new Ai7LocalDeterministicAdapter(fixture!, promptContractDigest, codes, continuation === null ? {} : { attemptsBefore: ledger.unitAttemptsOf(facts.runRecordId) });
        }
        liveAdapter.instance = new DeepSeekOpenAiCompatibleAdapter({
          broker: this.#broker,
          get slotBinding(): CredentialSlotBinding {
            return { bindingDigest: bindingDigestForSlot, modelRole: 'Main Editorial Role', slot: credentialSlot, credentialReference };
          },
          tickets: { take: () => { const current = pendingTicket; pendingTicket = null; return current; } },
          attribution: () => ({}),
          promptContractDigest,
          codes,
          profile: OPENCODE_GO_ROUTE_PROFILE,
          modelProfile: OPENCODE_GO_V4_FLASH_PROFILE,
          sessionId: () => harness.currentSessionId(),
          // The captured native `fetch`, reached only through the cache: an identical request
          // replays without transmitting, and a live call happens at most once per test item. The
          // bound route profile travels with the call, so the cache step reads a limit the way this
          // route declares limits are read rather than by knowing which route it is serving.
          transport: (url, init) => transmitOnce(cache!, live, testItemPurpose, promptContractDigest, OPENCODE_GO_ROUTE_PROFILE, model, url, init),
        });
        return liveAdapter.instance;
      },
      gate: (payload) => {
        if (bindingFacts === null) return { decision: 'refuse', reason: 'binding-stale', detail: '执行绑定尚未持久化；未发送任何内容。' };
        const decision = evaluateEgress(payload, bindingFacts, { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests, ceilingState });
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
    // 模型服务账户限额 met under a Run that keeps its progress (Issue #51, S16b): the provider's words, and the unit it
    // refused — `null` for the reduction or a sampling turn. The Run stops resumable at the next boundary.
    let accountLimit: { readonly unitOrdinal: number | null; readonly condition: string } | null = null;
    try {
      requireCompositionMatch(harness.composition.digest, facts.behaviorCompositionDigest);
      const bindingRecord: ExecutionBindingRecord = executionBindingRecordOf({
        facts, definition, live, fixture, attemptId, harnessSessionId, boundAt, compositionDigest: harness.composition.digest,
      });
      const bindingDigest = canonicalRecord(bindingRecord).digest;
      // Readiness only: the product path reaches the Protected Secret Store and releases no value.
      const credentialReadiness = await this.#broker.checkReadiness({
        bindingDigest,
        modelRole: 'Main Editorial Role',
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
      // and refusing here keeps the Run from spending Sessions to reach the same conclusion.
      if (live !== null && credentialReadiness !== 'present') {
        throw new ExecutionAdmissionError('EXECUTION_CREDENTIAL_ABSENT', '受保护凭据库中没有 opencode-go 开发凭据；未发起任何传输。');
      }
      currentBindingDigest = bindingDigest;
      bindingDigestForSlot = bindingDigest;
      bindingFacts = {
        bindingDigest,
        route,
        model,
        systemPrompt: definition.systemPrompt,
        outboundDataCategory: 'public-or-synthetic',
        policy: live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 }
          : { operationalScope: 'developer-live', providerProcessingVersion: 'v5', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
        admittedUserMessages,
      };
      harness.bindExecution({ harnessSessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest });
      // 取消任务 before the Run kept any unit (CTRL-008): nothing of it is left to gather, so it ends here without
      // provider work and without a revision. A stopped Run that kept units is finished below, sending nothing.
      if (active.cancelRequested && checkpoints.length === 0) {
        recordCancelledWithoutRevision(ledger, facts.runRecordId, facts.taskIntentId, attemptId, CANCELLED_BEFORE_UNITS);
        return;
      }
      // 暂停 before the next unit began: the Run waits here, keeping what it had kept (Issue #422, S76b).
      if (active.pauseRequested && !active.cancelRequested) {
        ledger.recordRunState(facts.runRecordId, 'paused', { detail: pausedDetail(checkpoints.length, submittedUnits.length), unitsSettled: checkpoints.length, unitsTotal: submittedUnits.length });
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
      const countTurn = (stage: RunReportRevisionUsageStageId, turnUsage: { inputTokens: number; outputTokens: number } | null): void => {
        usage.requests += 1;
        stageUsage[stage].requests += 1;
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
      // them waits on a model. Each is an exact `out-of-scope` gap — the Run was asked not to read it —
      // recorded with the request digest it would have carried, as every other unread unit is.
      for (const planUnit of planUnits) {
        const newUnit = manifest.units[planUnit.unitOrdinal - 1];
        if (planUnit.disposition === 'unreviewed') {
          if (newUnit === undefined) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '审阅范围计划引用的单元不在覆盖清单内。');
          outcomes.push({ unitOrdinal: newUnit.ordinal, state: 'gap', code: 'out-of-scope', reason: OUT_OF_SCOPE_GAP_REASON });
          unitRecords.push({
            unitOrdinal: newUnit.ordinal,
            requestDigest: definition.requestDigest(newUnit.ordinal, newUnit.digest),
            lineage: { kind: 'unreviewed' },
            closed: {
              state: 'gap',
              gap: { unitOrdinal: newUnit.ordinal, code: 'out-of-scope', reason: OUT_OF_SCOPE_GAP_REASON, startPosition: newUnit.startPosition, endPosition: newUnit.endPosition, blockIds: [...newUnit.blockIds] },
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
      // Units whose safe retry waits for the editor's answer (Issue #422, S76d; CLAR-004). A question the Run asked before
      // it stopped is still its own, answered or not: its unit is not read again until the answer says so, and what its
      // first attempt cost counts toward the Run as it did then.
      type WaitingUnit = {
        readonly unit: CoverageManifestUnitProjection;
        readonly requestDigest: string;
        readonly failure: ClarificationFacts['failure'];
        readonly firstPayloadDigest: string | null;
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
          attempts: 1, usage: request.firstUsage, wallMs: request.firstWallMs,
        });
        usage.requests += 1;
        stageUsage.units.requests += 1;
        active.progress.completedAttempts += 1;
        if (request.firstUsage !== null) {
          usage.inputTokens += request.firstUsage.inputTokens;
          usage.outputTokens += request.firstUsage.outputTokens;
          stageUsage.units.inputTokens += request.firstUsage.inputTokens;
          stageUsage.units.outputTokens += request.firstUsage.outputTokens;
          accumulated.push(request.firstUsage);
        }
      }
      const remainingUnits = submittedUnits.filter((unit) => !checkpointed.has(unit.ordinal) && !waiting.has(unit.ordinal));
      // One technical turn for one unit attempt: the span is recorded by reference with the attempt index
      // and the admitted payload digest, and every attempt's usage counts toward the Run.
      const submitAttempt = async (unit: CoverageManifestUnitProjection, attemptIndex: number, attemptState: RunAttemptState) => {
        admittedPayloadDigest = null;
        // The baseline this attempt's `awaiting-response` is derived against, taken before the harness
        // can enter the transport, so the reading belongs to this attempt and not the previous one.
        active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
        active.progress.attemptState = attemptState;
        const turn = await harness.submitUnit(unitMessages.get(unit.ordinal)!);
        // Read before anything else can start a turn: the adapter clears this at the start of every
        // stream, so it is this attempt's result or nothing.
        const canonical = liveAdapter.instance?.lastCanonicalResult ?? null;
        // J-10's unit hold (Issue #422): the turn is back and the unit stays in flight until the Journey lets it settle.
        if (this.#deps.unitHold) await this.#deps.unitHold(active.progress.unitsSettled, () => active.interrupted);
        const payloadDigest = admittedPayloadDigest;
        spanOrdinal += 1;
        spans.push(turn.span);
        ledger.recordSpan(attemptId, spanOrdinal, turn.span, unit.ordinal, { attemptIndex, payloadDigest });
        const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
        const unitUsage = usageSignal?.kind === 'usage' ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens } : null;
        countTurn('units', unitUsage);
        // One model turn came back. It counts whether it transmitted, replayed from the Provider Result
        // Cache, or read the deterministic fixture: what the reader learns is that the Run is moving.
        active.progress.completedAttempts += 1;
        return { turn, unitUsage, payloadDigest, canonical };
      };
      type SubmittedAttempt = Awaited<ReturnType<typeof submitAttempt>>;
      // The continuation point (CONT-015): a unit is kept the moment it settles, as its revision will hold it, and the
      // reader sees the count move and nothing in flight.
      const keepSettled = (unit: CoverageManifestUnitProjection, wallMs: number): void => {
        const settledRecord = unitRecords.find((record) => record.unitOrdinal === unit.ordinal);
        if (active.resumableOnInterrupt && settledRecord !== undefined) {
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
       * gap that ends the Run (a Provider Account Limit, an interruption, an ambiguous outcome), which is not kept.
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
      }): 'settled' | 'end' | 'stop' => {
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
          const parsed = definition.parseUnitResult(candidate.text, unit);
          if (parsed.ok) {
            unitObservations.set(unit.ordinal, observation);
            acceptedOutputDigests.add(candidate.digest);
            outcomes.push({ unitOrdinal: unit.ordinal, state: 'closed', result: parsed.result });
            unitRecords.push({
              unitOrdinal: unit.ordinal,
              requestDigest,
              lineage: { kind: 'recomputed' },
              closed: { state: 'closed', responseDigest: candidate.digest, usage: unitUsage, result: definition.unitRecord(parsed.result) },
            });
          } else {
            acceptedOutputDigests.add(candidate.digest);
            gap('contract-invalid', unparsableAnswerGapReason(parsed.code, parsed.detail, candidate.text));
          }
        } else if (turn.terminal === 'completed') {
          gap('contract-invalid', '技术回合完成但没有模型输出。');
        } else if (turn.terminal === 'failed') {
          const failure = turn.signals.find((signal) => signal.kind === 'failed');
          const reason = failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。';
          // 模型服务账户限额 (Issue #51, S16b; MODEL-018): a Run that keeps its progress stops here with the unit unsettled —
          // no gap, no retry, no fallback, no second model — and 续行 reads it again once the limit clears.
          if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit' && active.resumableOnInterrupt) {
            accountLimit = { unitOrdinal: unit.ordinal, condition: reason };
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
          const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
          gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '请求被中断。');
          // An egress refusal that names the ceiling is the ceiling settlement, not a bare interruption.
          if (egress && ceilingState() === 'reached') liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          return 'end';
        } else {
          gap('interrupted', '技术回合结果不明确；自动重试与回退已停止。');
          terminalClassification = 'interrupted';
          return 'end';
        }
        keepSettled(unit, s.wallMs);
        return 'settled';
      };
      /**
       * The `safe-retry` Plan Adaptation: recorded before the retry is dispatched, inside the unchanged envelope and Execution
       * Binding; the retry repeats the byte-identical unit message once. The Run makes it on its own, or — moved into 先问你
       * (Issue #422, S76d) — once the editor answered 再试一次, and then the record names that answer.
       */
      const safeRetry = async (
        unit: CoverageManifestUnitProjection,
        requestDigest: string,
        failure: { readonly reason: string; readonly code: string; readonly failureClass: string; readonly status: number | null },
        firstPayloadDigest: string | null,
        answerId: string | null,
      ): Promise<SubmittedAttempt> => {
        adaptationOrdinal += 1;
        ledger.recordAdaptation({
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
          firstPayloadDigest,
          planEnvelopeDigest: facts.planEnvelopeDigest,
          bindingDigest,
          ...(answerId === null ? {} : { clarificationAnswerId: answerId }),
        });
        adaptedUnitOrdinals.push(unit.ordinal);
        if (currentBindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '计划内调整期间执行绑定发生变化。');
        return submitAttempt(unit, 2, 'retrying');
      };
      /**
       * An answer the editor gave, applied at a unit boundary (CLAR-006): 再试一次 makes the safe retry now, inside the
       * unchanged envelope; 不重试，记为缺口 settles the unit as the gap it is. The ledger is read each time, so an answer
       * given while the Run went on is found at the next boundary. `applied` when one was, `none` when nothing waited on
       * an answer, `stopped` when the Run is stopping, and `end` when a retry's gap ended the Run.
       */
      const applyAnswers = async (): Promise<'none' | 'applied' | 'stopped' | 'end'> => {
        if (waiting.size === 0) return 'none';
        const answered = ledger.clarificationsOf(facts.runRecordId).filter((entry) => entry.answer !== null && waiting.has(entry.unitOrdinal));
        if (answered.length === 0) return 'none';
        for (const entry of answered) {
          if (active.interrupted || active.cancelRequested || active.pauseRequested) return 'stopped';
          const w = waiting.get(entry.unitOrdinal)!;
          waiting.delete(entry.unitOrdinal);
          active.progress.currentUnitOrdinal = w.unit.ordinal;
          active.progress.currentUnitStartedAt = new Date().toISOString();
          if (entry.answer!.optionId === 'record-gap') {
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${CLARIFICATION_RECORD_GAP}`);
            keepSettled(w.unit, w.wallMs);
            continue;
          }
          // 再试一次 once the ceiling is spent (Issue #51, S16a): the retry is not sent, and the Run stops as the ceiling reached.
          if (ceilingState() === 'reached') {
            settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
              'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${SAFE_RETRY_BUDGET_REACHED}`);
            keepSettled(w.unit, w.wallMs);
            liveInterruption = 'run-budget-ceiling-reached';
            terminalClassification = 'interrupted';
            return 'end';
          }
          const startedAtMs = Date.now();
          const attempt = await safeRetry(w.unit, w.requestDigest, w.failure, w.firstPayloadDigest, entry.answer!.answerId);
          // AI7 stopping under the retry cut it off: the unit is not settled, and 续行 applies the answer again.
          if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) return 'stopped';
          const settled = settleFromTurn({
            unit: w.unit, requestDigest: w.requestDigest, attempt, attempts: w.attempts + 1, usage: addUsage(w.usage, attempt.unitUsage),
            wallMs: w.wallMs + (Date.now() - startedAtMs), firstFailure: { reason: w.failure.reason, code: w.failure.code }, withheld: null,
          });
          if (settled === 'end') return 'end';
          if (settled === 'stop') return 'stopped';
        }
        return 'applied';
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
        if (active.interrupted) break;
        // 取消任务 (CTRL-005): the Run stops at this unit boundary, and the unit before it has finished.
        if (active.cancelRequested) break;
        // 暂停 (CTRL-001): the Run waits at this boundary, keeping every unit it settled.
        if (active.pauseRequested) break;
        // The ceiling is evaluated before every dispatch, not only inside the gate: reaching it ends
        // the Run here, before the next unit forms a request at all.
        if (ceilingState() === 'reached') {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          unitsEnded = true;
          break;
        }
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
        if (attempt.turn.terminal === 'failed' && !active.interrupted && !active.cancelRequested) {
          const failed = attempt.turn.signals.find((signal) => signal.kind === 'failed');
          if (failed?.kind === 'failed' && failed.failure.retrySafe) {
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
                firstUsage: attempt.unitUsage,
                firstWallMs: wallMs,
              });
              waiting.set(unit.ordinal, { unit, requestDigest, failure, firstPayloadDigest: attempt.payloadDigest, attempts: 1, usage: attempt.unitUsage, wallMs });
              active.progress.currentUnitOrdinal = null;
              active.progress.currentUnitStartedAt = null;
              active.progress.attemptState = null;
              continue;
            }
            if (withheld === null && mode === 'automatic') {
              firstFailure = failed.failure;
              attempt = await safeRetry(unit, requestDigest, failed.failure, attempt.payloadDigest, null);
              if (attempt.turn.terminal === 'interrupted' && active.interrupted && active.resumableOnInterrupt) break;
              attempts = 2;
              // Both attempts cost the Run, so the unit's row carries what the unit cost, not what its
              // last attempt cost.
              unitUsageTotal = addUsage(unitUsageTotal, attempt.unitUsage);
            } else if (withheld === null) {
              withheld = SAFE_RETRY_WITHHELD;
            }
          }
        }
        const settled = settleFromTurn({
          unit, requestDigest, attempt, attempts, usage: unitUsageTotal, wallMs: Date.now() - unitStartedAtMs,
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
      // 暂停, or AI7 stopping under a Run it can continue (Issue #422, S76b): the Run stops here keeping what it read —
      // no reduction, no revision, no outcome — and 续行 goes on from the next unit. A cancellation outranks both, and a
      // spent ceiling or an account limit still ends the Run as the interruption it is.
      const stopWithoutEnding = (): boolean => {
        if (active.cancelRequested || liveInterruption !== null) return false;
        // 模型服务账户限额 (Issue #51, S16b): the Run stops resumable in its own words, with the provider's, and holds nothing.
        if (accountLimit !== null) {
          const settled = active.progress.unitsSettled;
          ledger.recordRunState(facts.runRecordId, 'resumable', {
            detail: accountLimitDetail(settled, submittedUnits.length),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
            stopReason: 'provider-account-limit',
            condition: accountLimit.condition,
            ...(accountLimit.unitOrdinal === null ? {} : { unitOrdinal: accountLimit.unitOrdinal }),
          });
          return true;
        }
        if (active.pauseRequested || (active.interrupted && active.resumableOnInterrupt)) {
          const settled = active.progress.unitsSettled;
          ledger.recordRunState(facts.runRecordId, active.pauseRequested ? 'paused' : 'resumable', {
            detail: active.pauseRequested ? pausedDetail(settled, submittedUnits.length) : resumableDetail(settled, submittedUnits.length),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
          });
          return true;
        }
        // 任务等待你的说明 (Issue #422, S76d; CLAR-004): every unit the Run could read is read, and a question is still open.
        // It stops at this boundary — no reduction, no revision, no outcome — holding nothing and keeping what it read, and
        // the answer takes it on. The ledger was read for answers just now, with nothing awaited since.
        if (waiting.size > 0 && !unitsEnded && !active.interrupted) {
          const settled = active.progress.unitsSettled;
          ledger.recordRunState(facts.runRecordId, 'awaiting-clarification', {
            detail: awaitingClarificationDetail([...waiting.keys()], settled, submittedUnits.length),
            unitsSettled: settled,
            unitsTotal: submittedUnits.length,
            waitingUnits: [...waiting.keys()],
          });
          return true;
        }
        return false;
      };
      if (stopWithoutEnding()) return;
      // A question the Run's end leaves open stays on record (CLAR-005), and its unit settles as the gap it is, unretried.
      for (const w of waiting.values()) {
        settleGap(w.unit, w.requestDigest, { unitOrdinal: w.unit.ordinal, attempts: w.attempts, wallMs: w.wallMs, usage: w.usage },
          'adapter-failure', `${w.failure.reason}（${w.failure.code}）；${active.cancelRequested ? CLARIFICATION_CANCELLED_UNANSWERED : CLARIFICATION_ENDED_UNANSWERED}`);
      }
      waiting.clear();
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
      if (definition.crossUnit === null) {
        // A kind that declares no cross-unit contract never forms the request, never counts a turn,
        // and says so exactly. The baseline path below is unchanged, request counts included.
        crossUnit = { state: 'not-run', reason: definition.crossUnitAbsentReason };
      } else if (terminalClassification === 'cancelled') {
        crossUnit = { state: 'not-run', reason: CROSS_UNIT_CANCELLED };
      } else if (terminalClassification === 'interrupted' || active.interrupted) {
        crossUnit = { state: 'not-run', reason: '运行在单元阶段结束前停止，跨单元归纳未发起。' };
      } else if (closedOutcomes.length >= 2) {
        const requestDigest = crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(closedOutcomes));
        const gap = (code: Extract<CrossUnitOutcome, { state: 'gap' }>['code'], reason: string): CrossUnitOutcome =>
          ({ state: 'gap', code, reason, requestDigest });
        if (live !== null && policy.providerProcessing.crossUnitReductionAllowed !== true) {
          // The reduction is a transmission the active Provider Processing policy does not name, so it
          // never forms a request at all. The verified v5 document names it; a projection that does not
          // is exactly the policy-bounded case this guard exists for.
          crossUnit = gap('policy-bounded', '跨单元归纳未派发：当前 Provider Processing 策略仅授权单元数内的传输');
        } else if (ceilingState() === 'reached') {
          // The ceiling is evaluated before this dispatch exactly as before a unit's, so a Run that has
          // spent its bound ends here rather than spending one more turn to discover it — and ends as the
          // ceiling reached, with every unit it read kept (Issue #51, S16a; MODEL-016).
          crossUnit = gap('run-budget-ceiling-reached', CROSS_UNIT_BUDGET_REACHED);
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
        } else {
          const message = buildCrossUnitMessage(closedOutcomes, manifest.units.length);
          // The same set the gate reads: exactly one further user message becomes admissible, and every
          // other refusal — route, model, system prompt, tools, prior outputs — is untouched.
          admittedUserMessages.add(message);
          // The reduction's own stage, opened only here: a reduction refused by policy or by a spent
          // ceiling never dispatched, and a stage that never ran reports no time at all.
          clock.open('cross-unit-reduction');
          active.progress.stage = 'cross-unit-reduction';
          active.progress.currentUnitOrdinal = null;
          active.progress.currentUnitStartedAt = new Date().toISOString();
          active.progress.attemptState = 'dispatched';
          active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
          const turn = await harness.submitUnit(message);
          const canonical = liveAdapter.instance?.lastCanonicalResult ?? null;
          // The reduction's turn is a model turn like any other: it counts as a request, its usage
          // counts toward the Run and the ceiling, and it records no execution-span row, because the
          // span table is unit-only and this step belongs to no unit.
          const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
          const crossUnitUsage = usageSignal?.kind === 'usage'
            ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens }
            : null;
          countTurn('cross-unit-reduction', crossUnitUsage);
          active.progress.completedAttempts += 1;
          const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
          if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
            acceptedOutputDigests.add(candidate.digest);
            if (canonical?.kind === 'empty-answer') {
              crossUnit = gap('contract-invalid', crossUnitEmptyAnswerGapReason(canonical.reasoningPresent));
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
            crossUnit = gap('contract-invalid', '跨单元归纳的技术回合完成但没有模型输出。');
          } else if (turn.terminal === 'failed') {
            const failure = turn.signals.find((signal) => signal.kind === 'failed');
            // No safe retry here: one attempt, and a retry-safe failure is a gap like any other.
            crossUnit = gap('adapter-failure', failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
            // 模型服务账户限额 (Issue #51, S16b): the Run stops before the reduction settles, and 续行 forms it again.
            if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit' && active.resumableOnInterrupt) {
              accountLimit = { unitOrdinal: null, condition: `${failure.failure.reason}（${failure.failure.code}）` };
            }
          } else {
            const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
            const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
            crossUnit = gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '跨单元归纳被中断。');
          }
        }
      }

      // A pause, or AI7 stopping, while the reduction's turn was out: the Run waits with every unit kept, and 续行 forms
      // the reduction again.
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
      clock.close();
      // A cancellation that came while the reduction's turn was out stops the sample before it forms a message.
      if (active.cancelRequested) {
        terminalClassification = 'cancelled';
        liveInterruption = null;
      }

      // The one declared assurance sampling suboperation (ADR 0066), inside this Run's unchanged
      // envelope and Execution Binding: one admitted user message per anchor unit, one turn each, no
      // adaptation. It runs only after a unit loop that reached its end, for the same reason the
      // reduction does — an interrupted Run has already stopped, and nothing further is sent.
      const sample = await this.#drawAndJudge({
        active, definition, harness, reduction: reduced, manifest, blocksById, admittedUserMessages,
        acceptedOutputDigests, liveAdapter, countTurn, clock, ceilingState, live, policy,
        stopped: terminalClassification === 'interrupted' || terminalClassification === 'cancelled',
        stoppedReason: liveInterruption === 'run-budget-ceiling-reached' ? ASSURANCE_SAMPLING_BUDGET_REACHED : null,
        removedByEditor: !assuranceSamplingKept(facts.editorEdits),
        onCeilingReached: () => {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
        },
        onAccountLimit: (condition) => {
          if (active.resumableOnInterrupt) accountLimit = { unitOrdinal: null, condition };
        },
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
      const interruption = liveInterruption === null ? null : LIVE_INTERRUPTIONS[liveInterruption];
      ledger.recordRunState(facts.runRecordId, terminalClassification, {
        detail: terminalClassification === 'cancelled'
          ? `运行终态：cancelled；按你的取消在阅读范围之间停止，已完成的结果与缺口均已保留，没有读到的阅读范围记为未尝试；结果集修订版 ${revision.revisionId}（Revision ${revision.ordinal}）。`
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
        unitRows: runReportUnitRows(unitRecords, unitObservations),
        submitted: submittedUnits.length,
        // Exactly the three fields decision 4 names; the adaptation's own digests, codes, and
        // identities stay in the ledger row a reader can already open.
        adaptations: ledger.adaptationsOf(facts.runRecordId).map((entry) => ({
          unitOrdinal: entry.unitOrdinal,
          classifiedReason: entry.classifiedReason,
          recordedAt: entry.recordedAt,
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
          : liveInterruption === 'run-budget-ceiling-reached' && live === null ? BUDGET_REACHED_NEXT_ACTION : interruption.safeNextAction,
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
        report: buildRunReport(reportFacts, await this.#reflect({
          active, harness, runRecordId: facts.runRecordId, accounting: runReportAccounting(reportFacts),
          admittedUserMessages, acceptedOutputDigests, liveAdapter, accumulated, ceilingState, live, policy,
          stopped: terminalClassification === 'interrupted' || terminalClassification === 'cancelled',
        })),
      });
    } finally {
      currentBindingDigest = null;
      active.progress.currentUnitOrdinal = null;
      active.progress.currentUnitStartedAt = null;
      active.progress.attemptState = null;
      await harness.finish();
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
    if (active.cancelRequested) return assuranceSampleNotRun(ASSURANCE_SAMPLING_CANCELLED);
    if (context.stopped || active.interrupted) return assuranceSampleNotRun(context.stoppedReason ?? '运行在单元阶段结束前停止，保证抽样未发起。');
    if (context.removedByEditor) return assuranceSampleNotRun(ASSURANCE_SAMPLING_REMOVED);
    const candidates = definition.assurance.candidates(reduction);
    if (candidates.length === 0) return assuranceSampleNotRun('本次运行没有可抽样的发现，保证抽样未发起。');
    const draw = drawAssuranceSample(manifest, candidates);
    const dispositions: AnalysisAssuranceSampleDispositionProjection[] = [];
    const gapReasons: string[] = [];
    const sampled = { inputTokens: 0, outputTokens: 0, turnsWithUsage: 0 };
    if (live !== null && policy.providerProcessing.assuranceSamplingAllowed !== true) {
      // The sampling turns are transmissions the active Provider Processing policy does not name, so
      // none of them forms a request. The verified v5 document names them; a projection that does not
      // is exactly the policy-bounded case this guard exists for.
      return assuranceSampleOutcome(draw, [], null, [ASSURANCE_SAMPLING_POLICY_BOUNDED]);
    }
    for (const turn of assuranceSamplingTurns(draw.sampled)) {
      if (active.interrupted) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '运行已中断，本轮未派发。'));
        break;
      }
      // 取消任务 between two sampling turns: the one out finished, and no further one is sent.
      if (active.cancelRequested) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '运行已按你的要求取消，本轮未派发。'));
        break;
      }
      // The ceiling is evaluated before every dispatch exactly as before a unit's, so a Run that has
      // spent its bound ends here rather than spending one more turn to discover it.
      if (context.ceilingState() === 'reached') {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '任务运行预算上限已达到，本轮未派发。'));
        context.onCeilingReached();
        break;
      }
      const unit = manifest.units[turn.unitOrdinal - 1]!;
      const message = buildAssuranceSamplingMessage(unit, manifest.units.length, context.blocksById, turn.findings);
      // The same set the gate reads: exactly one further user message becomes admissible per turn, and
      // every other refusal — route, model, system prompt, tools, prior outputs — is untouched.
      context.admittedUserMessages.add(message);
      // The sampling stage, opened on the first turn that actually dispatches: a suboperation stopped
      // by interruption, policy, or the ceiling reports no time because it consumed none. Re-opening
      // per turn keeps the segments contiguous from the first dispatch to the last turn's settlement.
      context.clock.open('assurance-sampling');
      active.progress.stage = 'assurance-sampling';
      // The unit loop is over; a sampling turn is about a unit but is not one of its attempts, so the
      // reader sees the stage rather than a unit ordinal, exactly as it does for the reduction.
      active.progress.currentUnitOrdinal = null;
      active.progress.currentUnitStartedAt = new Date().toISOString();
      active.progress.attemptState = 'dispatched';
      active.transmissionsAtDispatch = active.transmissions?.() ?? 0;
      const result = await harness.submitUnit(message);
      const canonical = context.liveAdapter.instance?.lastCanonicalResult ?? null;
      // A sampling turn is a model turn like any other: it counts as a request, its usage counts
      // toward the Run and the ceiling, and it records no execution-span row, because the span table
      // is unit-only and this step is not one of the unit's attempts.
      const usageSignal = result.signals.find((signal) => signal.kind === 'usage');
      const turnUsage = usageSignal?.kind === 'usage'
        ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens }
        : null;
      context.countTurn('assurance-sampling', turnUsage);
      if (turnUsage !== null) {
        sampled.inputTokens += turnUsage.inputTokens;
        sampled.outputTokens += turnUsage.outputTokens;
        sampled.turnsWithUsage += 1;
      }
      active.progress.completedAttempts += 1;
      const gap = (detail: string): void => { gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, detail)); };
      const candidate = result.signals.find((signal) => signal.kind === 'contentCandidate');
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
      } else if (result.terminal === 'completed') {
        gap('技术回合完成但没有模型输出。');
      } else if (result.terminal === 'failed') {
        const failure = result.signals.find((signal) => signal.kind === 'failed');
        // No safe retry here: one attempt per turn, and a retry-safe failure is a gap like any other.
        gap(failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
        // A Provider Account Limit ends the suboperation outright: no retry, no fallback, no second model — and a Run that
        // keeps its progress stops there, to draw the sample again with 续行 (Issue #51, S16b).
        if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit') {
          context.onAccountLimit(`${failure.failure.reason}（${failure.failure.code}）`);
          break;
        }
      } else {
        const failure = result.signals.find((signal) => signal.kind === 'interrupted');
        gap(failure?.kind === 'interrupted' ? failure.failure.reason : '保证抽样被中断。');
        break;
      }
    }
    context.clock.close();
    const usage = sampled.turnsWithUsage === 0 ? null : { inputTokens: sampled.inputTokens, outputTokens: sampled.outputTokens };
    return assuranceSampleOutcome(draw, dispositions, usage, gapReasons);
  }
}

/** The route facts a Run's Execution Binding names, from its frozen plan and the launch the owner runs under. */
function routeFactsOf(facts: ExecutionPlanFacts, live: DeveloperLiveRuntime | null): {
  route: ExecutionRouteId;
  model: string;
  credentialSlot: CredentialSlotBinding['slot'];
  credentialReference: string;
  runBudgetCeiling: RunBudgetCeiling;
} {
  return {
    route: live === null ? LOCAL_DETERMINISTIC_ROUTE : OPENCODE_GO_ROUTE,
    model: live === null ? LOCAL_DETERMINISTIC_MODEL : OPENCODE_GO_V4_FLASH_PROFILE.model,
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
  live: DeveloperLiveRuntime | null;
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
    promptContractDigest: definition.promptContractDigest,
    contractVersion: definition.contractVersion,
    harnessSessionId: input.harnessSessionId,
    route,
    model,
    adapterPin: live === null ? { fixtureIdentity: fixture!.identity, fixtureSha256: fixture!.sha256 } : null,
    credentialSlot: { modelRole: 'Main Editorial Role', slot: credentialSlot, credentialReference },
    outboundDataCategory: 'public-or-synthetic',
    policyPin: live === null
      ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0 }
      : { operationalScope: 'developer-live', providerProcessingVersion: 'v5', activePolicySetVersion: 'v5', liveTransmissions: 'bounded-by-run' },
    runBudgetCeiling: runBudgetCeiling.kind === 'unset' ? 'unset' : runBudgetCeiling,
    dispatchAttribution: 'Dispatch',
    boundAt: input.boundAt,
    ...(update === null ? {} : { update: { mode: update.mode, predecessorRevisionId: update.predecessor?.revisionId ?? null, reusePlanDigest: update.reusePlanDigest } }),
  };
}

/** A cancelled Run no execution can finish ends here, with no revision, its reason in its own words. */
function settleCancelWithoutRevision(ledger: BaselineAnalysisStore, runRecordId: string, reason: string): void {
  const facts = ledger.cancellationFacts(runRecordId);
  recordCancelledWithoutRevision(ledger, runRecordId, facts.taskIntentId, facts.attemptId, reason);
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
      submitted: 0,
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
  readonly live: DeveloperLiveRuntime | null;
  readonly policy: LaunchPolicyProjection;
  /** Whether the Run had already stopped; a stopped Run reflects on nothing. */
  readonly stopped: boolean;
}

/** Exactly what the sampling suboperation may read or move; the finding components are not among them. */
interface AssuranceSamplingContext {
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
  readonly countTurn: (stage: RunReportRevisionUsageStageId, usage: { inputTokens: number; outputTokens: number } | null) => void;
  /** The owner's own clock; the suboperation opens its stage only once a turn is actually dispatched. */
  readonly clock: RunStageClock;
  readonly ceilingState: () => EgressCeilingState;
  readonly live: DeveloperLiveRuntime | null;
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

/**
 * One live call, at most once. The request digest is taken over the canonical body the adapter
 * assembled — the same bytes the gate admitted, and the only part of the request that ever reaches
 * the cache, since the headers carry the credential. An identical request replays from the cache and
 * transmits nothing; otherwise the call claims a fresh test item id, transmits once, and records the
 * result under it. A refused item id fails the turn rather than transmitting anyway.
 */
async function transmitOnce(
  cache: ProviderResultCache,
  live: DeveloperLiveRuntime,
  purpose: string,
  promptContractDigest: string,
  profile: ProviderRouteProfile,
  model: string,
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<{ status: number; json(): Promise<unknown> }> {
  const requestDigest = providerRequestDigest(init.body);
  const replayed = await cache.lookup(model, requestDigest);
  if (replayed !== null) {
    await cache.record({
      itemId: cache.nextItemId(purpose),
      purpose,
      model,
      promptContractDigest,
      requestDigest,
      outcome: 'replayed',
      status: replayed.status,
      usage: replayed.usage,
      recordedAt: new Date().toISOString(),
    });
    return { status: replayed.status, json: () => Promise.resolve(replayed.response) };
  }
  const itemId = cache.nextItemId(purpose);
  cache.claimItem(itemId);
  const transmittedAt = new Date().toISOString();
  let response: { status: number; json(): Promise<unknown> };
  try {
    response = await live.nativeFetch(url, init);
  } catch (error) {
    await cache.record({
      itemId, purpose, model, promptContractDigest, requestDigest,
      outcome: 'failed', status: null, usage: null, recordedAt: new Date().toISOString(),
    });
    throw error;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const usage = usageOfResponse(body);
  // Only a result worth replaying is cached: a limit or a server error must be asked again later.
  if (response.status === 200) {
    await cache.store({ model, requestDigest, requestBody: init.body, status: response.status, response: body, usage, transmittedAt });
  }
  const accountLimit = isProviderAccountLimit(profile, response.status, body);
  const resetWindow = accountLimit ? providerResetWindow(body) : null;
  await cache.record({
    itemId,
    purpose,
    model,
    promptContractDigest,
    requestDigest,
    outcome: response.status === 200 ? 'transmitted' : 'failed',
    status: response.status,
    usage,
    ...(accountLimit ? { classification: 'quota-exhausted' as const } : {}),
    ...(resetWindow === null ? {} : { resetWindow }),
    recordedAt: new Date().toISOString(),
  });
  return { status: response.status, json: () => Promise.resolve(body) };
}

/** The reset window a limit response stated, when it stated one; recorded in the ledger, never guessed. */
function providerResetWindow(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object') return null;
  for (const key of ['reset_at', 'resets_at', 'reset', 'retry_after']) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function requireCompositionMatch(actual: string, planned: string): void {
  if (actual !== planned) throw new ExecutionAdmissionError('EXECUTION_COMPOSITION_DRIFT', '组合摘要与冻结计划不一致；未开始执行。');
}

