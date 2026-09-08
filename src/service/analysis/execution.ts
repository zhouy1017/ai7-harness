import { randomUUID } from 'node:crypto';
import type { AnalysisAssuranceSampleDispositionProjection, AnalysisGapProjection, AnalysisSourceRangeProjection, CoverageManifestProjection, CoverageManifestUnitProjection, ExecutionRouteId, LaunchPolicyProjection, RunAttemptState, RunReportStageId } from '../../shared/protocol.js';
import { prepareExecution, type HarnessExecutionSpan, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import type { DeveloperLiveRuntime } from '../launch-policy.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { evaluateRunBudgetCeiling, type ClassifiedModelFailure, type RunBudgetCeiling, type UsageFacts } from '../provider/classification.js';
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
import { SAMPLE1_SOURCE_DIGEST, type BaselineAnalysisStore, type ExecutionBindingRecord, type ExecutionPlanFacts, type PredecessorUnitResult, type RunProgress, type RunProgressStage, type UnitResultRecord } from './baseline-analysis-store.js';
import type { BaselineUnitResult } from './contract.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import { applyAssuranceSample, type AnalysisKindDefinition, type AnalysisReductionResult } from './kind-definition.js';
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
import {
  buildRunReport,
  runReportReflectionNotRun,
  type RunReportFacts,
  type RunReportReflectionOutcome,
  type RunReportRevisionUsageStageId,
  type RunReportSpan,
  type RunReportUnitObservation,
  type RunReportUnitRow,
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
 */
/**
 * Remap the source ranges of a reused predecessor result onto the new unit: the i-th own block and
 * the i-th overlap block of the predecessor unit correspond to the same positions of the new unit
 * because the compatibility key proved their content digests equal in order. Identities usually
 * coincide; when they differ the remap keeps `回到稿件范围` pointing at the block that carries the
 * same content in the current revision.
 */
export function remapReusedResult(
  result: BaselineUnitResult,
  predecessorUnit: CoverageManifestUnitProjection,
  newUnit: CoverageManifestUnitProjection,
): BaselineUnitResult {
  const from = [...predecessorUnit.blockIds, ...predecessorUnit.overlapBlockIds];
  const to = [...newUnit.blockIds, ...newUnit.overlapBlockIds];
  if (from.length !== to.length) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用单元与前一单元的内容块数量不一致。');
  const mapping = new Map(from.map((blockId, index) => [blockId, to[index]!] as const));
  const ranges = (list: ReadonlyArray<AnalysisSourceRangeProjection>): AnalysisSourceRangeProjection[] => list.map((range) => {
    const blockId = mapping.get(range.blockId);
    if (blockId === undefined) throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用单元的来源范围引用了前一单元之外的内容块。');
    return { blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme };
  });
  return {
    schema: result.schema,
    unitOrdinal: newUnit.ordinal,
    synopsis: result.synopsis,
    entities: result.entities.map((entity) => ({ ...entity, aliases: [...entity.aliases], sourceRanges: ranges(entity.sourceRanges) })),
    events: result.events.map((event) => ({ ...event, participants: [...event.participants], sourceRanges: ranges(event.sourceRanges) })),
    relationships: result.relationships.map((relationship) => ({ ...relationship, sourceRanges: ranges(relationship.sourceRanges) })),
    settingClaims: result.settingClaims.map((claim) => ({ ...claim, sourceRanges: ranges(claim.sourceRanges) })),
    conflicts: result.conflicts.map((note) => ({ ...note, sourceRanges: ranges(note.sourceRanges) })),
    unresolved: result.unresolved.map((note) => ({ ...note, sourceRanges: ranges(note.sourceRanges) })),
    confidence: result.confidence,
  };
}

export interface ExecutionOwnerDependencies {
  readonly ledger: BaselineAnalysisStore;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly fixture: ResolvedModelFixture | null;
  readonly secretResolver: SecretResolver;
  /** The developer-live launch facts and captured transport; present exactly when the policy bound v4. */
  readonly developerLive?: DeveloperLiveRuntime | null;
}

export class ExecutionAdmissionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionAdmissionError';
  }
}

interface ActiveRun {
  readonly runRecordId: string;
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
  done: Promise<void>;
}

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
} as const;

/**
 * The two developer-live interruptions the closed CHECK sets admit only as `interrupted`, with the
 * distinction carried in the state detail, the outcome summary, and the safe next action (settlement
 * l). A dedicated classification is S16's job, not this slice's, so nothing here invents one.
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
 * The transmittable set under v4: exact `sample1` and nothing else (settlement l). ADR 0065 admits
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

  constructor(deps: ExecutionOwnerDependencies) {
    // The developer-live runtime and the bound scope are one fact: a v4 launch that reached this owner
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

  /** Single-slot admission: one Run per instance; a second dispatch is refused, never queued. */
  admitAndDispatch(runRecordId: string): void {
    if (this.#disposed) throw new ExecutionAdmissionError('EXECUTION_STOPPING', '本地业务服务正在停止。');
    if (this.#active !== null) throw new ExecutionAdmissionError('EXECUTION_BUSY', '当前已有一个运行在执行；本实例一次只执行一个运行。');
    const live = this.#deps.developerLive ?? null;
    if (live === null && this.#deps.fixture === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '没有可执行的本地确定性路由。');
    const facts = this.#deps.ledger.loadExecutionPlan(runRecordId);
    // The Public SampleBook check precedes admission, so an unadmitted Book never reaches a payload.
    if (live !== null && !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(facts.sourceDigest)) {
      throw new ExecutionAdmissionError('EXECUTION_SOURCE_NOT_TRANSMITTABLE', '当前图书不在 developer-live 可传输的 Public SampleBook 集合内；未发起任何传输。');
    }
    if (this.#deps.ledger.currentRunState(runRecordId) !== 'authorized') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有刚记录授权的运行可以进入调度。');
    }
    const submitted = facts.update === null ? facts.manifest.units.length : facts.update.reusePlan.counts.recomputed;
    this.#deps.ledger.recordRunState(runRecordId, 'admitted', {
      detail: '已进入 AI7 调度器（单槽位）。',
      unitsTotal: facts.manifest.units.length,
      ...(facts.update === null ? {} : { updateMode: facts.update.mode, unitsRecomputed: submitted, unitsReused: facts.update.reusePlan.counts.reused }),
    });
    const active: ActiveRun = {
      runRecordId,
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
      done: Promise.resolve(),
    };
    this.#active = active;
    active.done = this.#execute(active, facts).catch((error: unknown) => {
      this.#recordFailure(facts, error);
    }).finally(() => {
      if (this.#active === active) this.#active = null;
    });
  }

  /** Resolve once no Run is executing; used by the service suites to observe settlement. */
  async whenIdle(): Promise<void> {
    while (this.#active !== null) {
      const current = this.#active;
      await current.done;
      if (this.#active === current) return;
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    const active = this.#active;
    if (active === null) return;
    active.interrupted = true;
    active.harness?.interrupt();
    await active.done;
  }

  #recordFailure(facts: ExecutionPlanFacts, error: unknown): void {
    const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_FAILED';
    const reason = `运行在形成结果集修订版前失败（${code}）。`;
    try {
      this.#deps.ledger.recordRunState(facts.runRecordId, 'failed', { detail: `运行在形成结果前失败（${code}）。`, code });
      this.#deps.ledger.recordOutcome({
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        classification: 'failed',
        resultSetRevisionId: null,
        summary: reason,
        safeNextAction: SAFE_NEXT_ACTIONS.failed,
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
   * The Run Report's `if redone` list. It is the fourth declared suboperation and runs last — after
   * the sample, after the reduction is final, and after the revision is persisted — so the accounting
   * it reflects on is the revision's own.
   */
  #reflect(): Promise<RunReportReflectionOutcome> {
    return Promise.resolve(runReportReflectionNotRun(RUN_REPORT_REFLECTION_NOT_REACHED));
  }

  async #execute(active: ActiveRun, facts: ExecutionPlanFacts): Promise<void> {
    const ledger = this.#deps.ledger;
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
    } else if (policy.operationalScope !== 'developer-live' || policy.providerProcessing.version !== 'v4' ||
        policy.providerProcessing.decision !== 'eligible-only' || policy.providerProcessing.liveTransmissionAllowed !== true) {
      throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', '当前可信策略不是 developer-live · Provider Processing v4。');
    }
    const fixture = this.#deps.fixture;
    // The route the plan froze, resolved once: the deterministic fixture, or the live route profile.
    const route: ExecutionRouteId = live === null ? LOCAL_DETERMINISTIC_ROUTE : OPENCODE_GO_ROUTE;
    const model = live === null ? LOCAL_DETERMINISTIC_MODEL : OPENCODE_GO_V4_FLASH_PROFILE.model;
    const credentialSlot = live === null ? 'deepseek-api-key' as const : OPENCODE_GO_ROUTE_PROFILE.credentialSlot;
    const credentialReference = live === null ? facts.credentialReference : DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE;
    const runBudgetCeiling: RunBudgetCeiling = live === null ? { kind: 'unset' } : live.launch.runBudgetCeiling;
    // The test item purpose is the Task mode, so a first baseline and each update mode number their
    // live calls separately and a repeated purpose can never collide with an unrelated test.
    const testItemPurpose = facts.update === null ? 'first-baseline' : facts.update.mode;
    let cache: ProviderResultCache | null = null;
    if (live !== null) {
      cache = new ProviderResultCache(live.launch.providerCacheRoot);
      await cache.open();
    }
    const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
    const blocksById = new Map(blocks.map((block) => [block.blockId, block] as const));
    const manifest = facts.manifest;
    const update = facts.update;
    // Only recomputed units form unit messages; the Run Source Scope admits exactly those.
    const recomputedOrdinals = new Set(update === null
      ? manifest.units.map((unit) => unit.ordinal)
      : update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
    const submittedUnits = manifest.units.filter((unit) => recomputedOrdinals.has(unit.ordinal));
    const unitMessages = new Map(submittedUnits.map((unit) => [unit.ordinal, definition.buildUnitMessage(unit, manifest.units.length, blocksById)] as const));
    const admittedUserMessages = new Set(unitMessages.values());
    const predecessorResults: ReadonlyMap<number, PredecessorUnitResult> = update === null ? new Map() : ledger.loadPredecessorUnitResults(update.predecessor.revisionId);
    const acceptedOutputDigests = new Set<string>();
    let currentBindingDigest: string | null = null;
    const harnessSessionId = randomUUID();
    const attemptId = randomUUID();
    const boundAt = new Date().toISOString();
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
      // One technical Session per Analysis Unit under v4; the deterministic route keeps its single
      // accumulating Session, so J-04's proven composition is untouched.
      ...(live === null ? {} : { sessionMode: 'per-unit' as const }),
      adapterFactory: (codes) => {
        if (live === null) return new Ai7LocalDeterministicAdapter(fixture!, promptContractDigest, codes);
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
    let terminalClassification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' = 'completed';
    // Which of the two developer-live interruptions settled this Run, when one did; the closed CHECK
    // sets record both as `interrupted`, so the distinction lives in the detail, summary, and action.
    let liveInterruption: LiveInterruption | null = null;
    try {
      requireCompositionMatch(harness.composition.digest, facts.behaviorCompositionDigest);
      const bindingRecord: ExecutionBindingRecord = {
        attemptId,
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
        behaviorCompositionDigest: harness.composition.digest,
        promptContractDigest,
        contractVersion: definition.contractVersion,
        harnessSessionId,
        route,
        model,
        adapterPin: live === null ? { fixtureIdentity: fixture!.identity, fixtureSha256: fixture!.sha256 } : null,
        credentialSlot: { modelRole: 'Main Editorial Role', slot: credentialSlot, credentialReference },
        outboundDataCategory: 'public-or-synthetic',
        policyPin: live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v4', liveTransmissions: 0 }
          : { operationalScope: 'developer-live', providerProcessingVersion: 'v4', activePolicySetVersion: 'v4', liveTransmissions: 'bounded-by-run' },
        runBudgetCeiling: runBudgetCeiling.kind === 'unset' ? 'unset' : runBudgetCeiling,
        dispatchAttribution: 'Dispatch',
        boundAt,
        ...(update === null ? {} : { update: { mode: update.mode, predecessorRevisionId: update.predecessor.revisionId, reusePlanDigest: update.reusePlanDigest } }),
      };
      const bindingDigest = canonicalRecord(bindingRecord).digest;
      // Readiness only: the product path reaches the Protected Secret Store and releases no value.
      const credentialReadiness = await this.#broker.checkReadiness({
        bindingDigest,
        modelRole: 'Main Editorial Role',
        slot: credentialSlot,
        credentialReference,
      });
      const persisted = ledger.persistAttemptAndBinding({ runRecordId: facts.runRecordId, binding: bindingRecord, credentialReadiness });
      if (persisted.bindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '执行绑定摘要在持久化时发生变化。');
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
          : { operationalScope: 'developer-live', providerProcessingVersion: 'v4', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
        admittedUserMessages,
      };
      harness.bindExecution({ harnessSessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest });
      ledger.recordRunState(facts.runRecordId, 'executing', {
        detail: update === null ? '执行绑定已持久化并核对；开始逐单元执行。' : '执行绑定已持久化并核对；按血缘复用兼容单元，仅对重算单元逐单元执行。',
        attemptId,
        bindingDigest,
        unitsTotal: manifest.units.length,
        ...(update === null ? {} : { unitsRecomputed: submittedUnits.length, unitsReused: update.reusePlan.counts.reused }),
      });

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
      if (update !== null) {
        for (const planUnit of update.reusePlan.units) {
          if (planUnit.disposition !== 'reused' || planUnit.reusedFrom === null) continue;
          const source = predecessorResults.get(planUnit.reusedFrom.unitOrdinal);
          const predecessorUnit = update.predecessor.manifest.units[planUnit.reusedFrom.unitOrdinal - 1];
          const newUnit = manifest.units[planUnit.unitOrdinal - 1];
          if (source === undefined || predecessorUnit === undefined || newUnit === undefined) {
            throw new ExecutionAdmissionError('EXECUTION_LINEAGE_INVALID', '复用计划引用的前一单元结果不存在。');
          }
          const result = remapReusedResult(source.result, predecessorUnit, newUnit);
          reusedOrdinals.add(newUnit.ordinal);
          outcomes.push({ unitOrdinal: newUnit.ordinal, state: 'closed', result });
          unitRecords.push({
            unitOrdinal: newUnit.ordinal,
            requestDigest: source.requestDigest,
            lineage: { kind: 'reused', revisionId: planUnit.reusedFrom.revisionId, revisionOrdinal: planUnit.reusedFrom.revisionOrdinal, unitOrdinal: planUnit.reusedFrom.unitOrdinal },
            closed: { state: 'closed', responseDigest: source.responseDigest, usage: source.usage, result: definition.unitRecord(result) },
          });
        }
      }
      let spanOrdinal = 0;
      let adaptationOrdinal = 0;
      const adaptedUnitOrdinals: number[] = [];
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
      // The `units` stage of the Run Report: first dispatch to last settled unit. A Run whose every
      // unit was reused by lineage submits nothing and opens no segment at all.
      if (submittedUnits.length > 0) clock.open('units');
      for (const unit of submittedUnits) {
        if (active.interrupted) break;
        // The ceiling is evaluated before every dispatch, not only inside the gate: reaching it ends
        // the Run here, before the next unit forms a request at all.
        if (ceilingState() === 'reached') {
          liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          break;
        }
        active.progress.currentUnitOrdinal = unit.ordinal;
        // The instant the reader computes elapsed time from; the product itself estimates nothing.
        active.progress.currentUnitStartedAt = new Date().toISOString();
        const unitStartedAtMs = Date.now();
        const requestDigest = definition.requestDigest(unit.ordinal, unit.digest);
        let attempt = await submitAttempt(unit, 1, 'dispatched');
        let attempts = 1;
        let unitUsageTotal = attempt.unitUsage;
        // What the Run Report records about this unit, taken at the instant it settles however it
        // settles — closed, gap, or the gap that ends the Run — so no terminal branch loses it.
        const observe = (): void => {
          unitObservations.set(unit.ordinal, {
            unitOrdinal: unit.ordinal,
            attempts,
            wallMs: Date.now() - unitStartedAtMs,
            usage: unitUsageTotal,
          });
        };
        let firstFailure: ClassifiedModelFailure | null = null;
        if (attempt.turn.terminal === 'failed' && !active.interrupted) {
          const failed = attempt.turn.signals.find((signal) => signal.kind === 'failed');
          if (failed?.kind === 'failed' && failed.failure.retrySafe) {
            // The `safe-retry` Plan Adaptation: recorded before the retry is dispatched, inside the unchanged
            // envelope and Execution Binding; the retry repeats the byte-identical unit message once.
            firstFailure = failed.failure;
            adaptationOrdinal += 1;
            ledger.recordAdaptation({
              attemptId,
              runRecordId: facts.runRecordId,
              taskIntentId: facts.taskIntentId,
              ordinal: adaptationOrdinal,
              unitOrdinal: unit.ordinal,
              classifiedReason: failed.failure.reason,
              failureCode: failed.failure.code,
              failureClass: failed.failure.failureClass,
              failureStatus: failed.failure.status,
              requestDigest,
              firstPayloadDigest: attempt.payloadDigest,
              planEnvelopeDigest: facts.planEnvelopeDigest,
              bindingDigest,
            });
            adaptedUnitOrdinals.push(unit.ordinal);
            if (currentBindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '计划内调整期间执行绑定发生变化。');
            attempt = await submitAttempt(unit, 2, 'retrying');
            attempts = 2;
            // Both attempts cost the Run, so the unit's row carries what the unit cost, not what its
            // last attempt cost.
            unitUsageTotal = addUsage(unitUsageTotal, attempt.unitUsage);
          }
        }
        const { turn, unitUsage } = attempt;
        const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
        const gap = (code: AnalysisGapProjection['code'], reason: string): void => {
          observe();
          outcomes.push({ unitOrdinal: unit.ordinal, state: 'gap', code, reason });
          unitRecords.push({
            unitOrdinal: unit.ordinal,
            requestDigest,
            lineage: { kind: 'recomputed' },
            closed: { state: 'gap', gap: { unitOrdinal: unit.ordinal, code, reason, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } },
          });
        };
        if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate' && attempt.canonical?.kind === 'empty-answer') {
          // The model was reached and answered in the channel its profile declares, and the channel
          // was empty. That is not a contract the model broke — there is nothing to parse — so the
          // empty string never reaches `parseUnitResult`, whose only reading of it is `not-json`.
          // The gap keeps the existing closed code, which is a closed union and stays one.
          acceptedOutputDigests.add(candidate.digest);
          gap('contract-invalid', emptyAnswerGapReason(attempt.canonical.reasoningPresent));
        } else if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
          const parsed = definition.parseUnitResult(candidate.text, unit);
          if (parsed.ok) {
            observe();
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
          // A second failure names both attempts; the unit is never retried again.
          gap('adapter-failure', firstFailure === null ? reason : `第 1 次尝试：${firstFailure.reason}（${firstFailure.code}）；安全重试后第 2 次尝试：${reason}`);
          // A Provider Account Limit ends the Run outright: no retry, no fallback, no second model.
          if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit') {
            liveInterruption = 'provider-account-limit';
            terminalClassification = 'interrupted';
            break;
          }
        } else if (turn.terminal === 'interrupted') {
          const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
          const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
          gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '请求被中断。');
          // An egress refusal that names the ceiling is the ceiling settlement, not a bare interruption.
          if (egress && ceilingState() === 'reached') liveInterruption = 'run-budget-ceiling-reached';
          terminalClassification = 'interrupted';
          break;
        } else {
          gap('interrupted', '技术回合结果不明确；自动重试与回退已停止。');
          terminalClassification = 'interrupted';
          break;
        }
        active.progress.unitsSettled += 1;
        // The bar the stale case is measured against is this Run's own longest settled step, so a model
        // that answers in ninety seconds and one that answers in ten are each judged by their own pace.
        // A unit that settled as a gap took real time too, and counts.
        const settledMs = Date.now() - unitStartedAtMs;
        active.progress.longestSettledUnitMs = Math.max(active.progress.longestSettledUnitMs ?? 0, settledMs);
      }
      clock.close();
      if (active.interrupted && terminalClassification === 'completed') terminalClassification = 'interrupted';

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
      } else if (terminalClassification === 'interrupted' || active.interrupted) {
        crossUnit = { state: 'not-run', reason: '运行在单元阶段结束前停止，跨单元归纳未发起。' };
      } else if (closedOutcomes.length >= 2) {
        const requestDigest = crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(closedOutcomes));
        const gap = (code: Extract<CrossUnitOutcome, { state: 'gap' }>['code'], reason: string): CrossUnitOutcome =>
          ({ state: 'gap', code, reason, requestDigest });
        if (live !== null && policy.providerProcessing.crossUnitReductionAllowed !== true) {
          // The reduction is a transmission the active Provider Processing policy does not name, so it
          // never forms a request at all. Policy v4 authorizes one transmission per Analysis Unit.
          crossUnit = gap('policy-bounded', '跨单元归纳未派发：当前 Provider Processing 策略仅授权单元数内的传输');
        } else if (ceilingState() === 'reached') {
          // The ceiling is evaluated before this dispatch exactly as before a unit's, so a Run that has
          // spent its bound ends here rather than spending one more turn to discover it.
          crossUnit = gap('run-budget-ceiling-reached', '任务运行预算上限已达到；跨单元归纳未派发。');
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
          } else {
            const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
            const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
            crossUnit = gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '跨单元归纳被中断。');
          }
        }
      }

      // The kind's reducers run over the complete new unit set: reused plus recomputed. This is the
      // first of the `reduction` stage's two segments; the second is the persist below. The sampling
      // await between them belongs to the sampling stage, so the two segments are measured apart and
      // the four stage totals partition the Run's own work.
      clock.open('reduction');
      const reduced = definition.reduce({ manifest, outcomes, reusedUnitOrdinals: reusedOrdinals, blocks: blocksById, crossUnit });
      if (terminalClassification === 'completed' && reduced.gaps.length > 0) terminalClassification = 'completed-with-gaps';
      clock.close();

      // The one declared assurance sampling suboperation (ADR 0066), inside this Run's unchanged
      // envelope and Execution Binding: one admitted user message per anchor unit, one turn each, no
      // adaptation. It runs only after a unit loop that reached its end, for the same reason the
      // reduction does — an interrupted Run has already stopped, and nothing further is sent.
      const sample = await this.#drawAndJudge({
        active, definition, harness, reduction: reduced, manifest, blocksById, admittedUserMessages,
        acceptedOutputDigests, liveAdapter, countTurn, clock, ceilingState, live, policy,
        stopped: terminalClassification === 'interrupted',
      });
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
      const interruption = liveInterruption === null ? null : LIVE_INTERRUPTIONS[liveInterruption];
      ledger.recordRunState(facts.runRecordId, terminalClassification, {
        detail: interruption === null
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
        summary: interruption === null
          ? `${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`
          : `${interruption.summary}${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`,
        safeNextAction: interruption === null ? SAFE_NEXT_ACTIONS[terminalClassification] : interruption.safeNextAction,
        report: buildRunReport(reportFacts, await this.#reflect()),
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
    if (context.stopped || active.interrupted) return assuranceSampleNotRun('运行在单元阶段结束前停止，保证抽样未发起。');
    const candidates = definition.assurance.candidates(reduction);
    if (candidates.length === 0) return assuranceSampleNotRun('本次运行没有可抽样的发现，保证抽样未发起。');
    const draw = drawAssuranceSample(manifest, candidates);
    const dispositions: AnalysisAssuranceSampleDispositionProjection[] = [];
    const gapReasons: string[] = [];
    const sampled = { inputTokens: 0, outputTokens: 0, turnsWithUsage: 0 };
    if (live !== null && policy.providerProcessing.assuranceSamplingAllowed !== true) {
      // The sampling turns are transmissions the active Provider Processing policy does not name, so
      // none of them forms a request. Policy v4 authorizes one transmission per Analysis Unit.
      return assuranceSampleOutcome(draw, [], null, [ASSURANCE_SAMPLING_POLICY_BOUNDED]);
    }
    for (const turn of assuranceSamplingTurns(draw.sampled)) {
      if (active.interrupted) {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '运行已中断，本轮未派发。'));
        break;
      }
      // The ceiling is evaluated before every dispatch exactly as before a unit's, so a Run that has
      // spent its bound ends here rather than spending one more turn to discover it.
      if (context.ceilingState() === 'reached') {
        gapReasons.push(assuranceSamplingTurnGapReason(turn.unitOrdinal, '任务运行预算上限已达到，本轮未派发。'));
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
        // A Provider Account Limit ends the suboperation outright: no retry, no fallback, no second model.
        if (failure?.kind === 'failed' && failure.failure.failureClass === 'provider-account-limit') break;
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

/** The exact disclosure when the active Provider Processing policy does not name the suboperation. */
export const ASSURANCE_SAMPLING_POLICY_BOUNDED = '保证抽样未派发：当前 Provider Processing 策略仅授权单元数内的传输' as const;

/** The exact disclosure of a Run that stopped before the reflection turn could be formed at all. */
export const RUN_REPORT_REFLECTION_NOT_REACHED = '运行在形成结果集修订版前结束，运行反思未发起。' as const;

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

