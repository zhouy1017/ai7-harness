import { randomUUID } from 'node:crypto';
import type { AnalysisGapProjection, LaunchPolicyProjection } from '../../shared/protocol.js';
import { prepareExecution, type HarnessExecutionSpan, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { CredentialBroker, type SecretResolver } from '../provider/credential-broker.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter } from '../provider/local-deterministic-adapter.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { canonicalRecord } from './canonical.js';
import type { BaselineAnalysisStore, ExecutionBindingRecord, ExecutionPlanFacts, RunProgress, UnitResultRecord } from './baseline-analysis-store.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, buildUnitMessage, parseUnitResult, unitRequestDigest } from './contract.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';
import { reduceBaselineAnalysis, type UnitOutcome } from './reducers.js';

/**
 * The execution owner: AI7 scheduler admission for one Run per service instance, the attempt
 * lifecycle, the immutable Execution Binding persisted before the first model call, the
 * PrimaryAgentHarness composition, the closed signal set, and finish. It reads only the frozen plan,
 * writes only append-only ledger rows, and never lets a DSH event become business truth.
 */
export interface ExecutionOwnerDependencies {
  readonly ledger: BaselineAnalysisStore;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly fixture: ResolvedModelFixture | null;
  readonly secretResolver: SecretResolver;
}

export class ExecutionAdmissionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionAdmissionError';
  }
}

interface ActiveRun {
  readonly runRecordId: string;
  readonly progress: { unitsTotal: number; unitsSettled: number; currentUnitOrdinal: number | null };
  harness: PrimaryAgentHarnessHandle | null;
  interrupted: boolean;
  done: Promise<void>;
}

const SAFE_NEXT_ACTIONS = {
  completed: '检查结果集修订版的四个状态轴、缺口与冲突清单；如需重新分析，请发起新的任务授权。',
  'completed-with-gaps': '逐项查看缺口单元与冲突清单；缺口单元可在新的授权运行中补做，结果集修订版本身不会改写。',
  failed: '核对运行失败原因；修复后可重新准备并授权新的运行。',
  interrupted: '运行已在派发后中断；已完成单元的结果与缺口均已保留，续行需要新的授权运行。',
} as const;

export class BaselineAnalysisExecutionOwner {
  readonly #deps: ExecutionOwnerDependencies;
  readonly #broker: CredentialBroker;
  #active: ActiveRun | null = null;
  #disposed = false;

  constructor(deps: ExecutionOwnerDependencies) {
    this.#deps = deps;
    this.#broker = new CredentialBroker(deps.secretResolver);
  }

  progressFor(runRecordId: string): RunProgress | null {
    return this.#active?.runRecordId === runRecordId ? { ...this.#active.progress } : null;
  }

  /** Single-slot admission: one Run per instance; a second dispatch is refused, never queued. */
  admitAndDispatch(runRecordId: string): void {
    if (this.#disposed) throw new ExecutionAdmissionError('EXECUTION_STOPPING', '本地业务服务正在停止。');
    if (this.#active !== null) throw new ExecutionAdmissionError('EXECUTION_BUSY', '当前已有一个运行在执行；本实例一次只执行一个运行。');
    if (this.#deps.fixture === null) throw new ExecutionAdmissionError('EXECUTION_ROUTE_ABSENT', '没有可执行的本地确定性路由。');
    const facts = this.#deps.ledger.loadExecutionPlan(runRecordId);
    if (this.#deps.ledger.currentRunState(runRecordId) !== 'authorized') {
      throw new ExecutionAdmissionError('EXECUTION_STATE_INVALID', '只有刚记录授权的运行可以进入调度。');
    }
    this.#deps.ledger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。', unitsTotal: facts.manifest.units.length });
    const active: ActiveRun = {
      runRecordId,
      progress: { unitsTotal: facts.manifest.units.length, unitsSettled: 0, currentUnitOrdinal: null },
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
    try {
      this.#deps.ledger.recordRunState(facts.runRecordId, 'failed', { detail: `运行在形成结果前失败（${code}）。`, code });
      this.#deps.ledger.recordOutcome({
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        classification: 'failed',
        resultSetRevisionId: null,
        summary: `运行在形成结果集修订版前失败（${code}）。`,
        safeNextAction: SAFE_NEXT_ACTIONS.failed,
      });
    } catch {
      // The ledger already refused the terminal write; the run state stays as last recorded.
    }
  }

  async #execute(active: ActiveRun, facts: ExecutionPlanFacts): Promise<void> {
    const ledger = this.#deps.ledger;
    const fixture = this.#deps.fixture!;
    const policy = this.#deps.launchPolicy;
    if (policy.operationalScope !== 'development-ci' || policy.providerProcessing.version !== 'v1' || policy.providerProcessing.liveTransmissionAllowed !== false) {
      throw new ExecutionAdmissionError('EXECUTION_POLICY_INVALID', '当前可信策略不是 development-ci · Provider Processing v1。');
    }
    const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
    const blocksById = new Map(blocks.map((block) => [block.blockId, block] as const));
    const manifest = facts.manifest;
    const unitMessages = manifest.units.map((unit) => buildUnitMessage(unit, manifest.units.length, blocksById));
    const admittedUserMessages = new Set(unitMessages);
    const acceptedOutputDigests = new Set<string>();
    let currentBindingDigest: string | null = null;
    const harnessSessionId = randomUUID();
    const attemptId = randomUUID();
    const boundAt = new Date().toISOString();
    let bindingFacts: EgressBindingFacts | null = null;
    const harness = await prepareExecution({
      sessionId: harnessSessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: BASELINE_PROMPT_CONTRACT.systemPrompt,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: (codes) => new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes),
      gate: (payload) => {
        if (bindingFacts === null) return { decision: 'refuse', reason: 'binding-stale', detail: '执行绑定尚未持久化；未发送任何内容。' };
        return evaluateEgress(payload, bindingFacts, { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests });
      },
      onTransmitTicket: () => {
        throw new ExecutionAdmissionError('EXECUTION_REMOTE_TICKET_FORBIDDEN', 'Provider Processing v1 下不得签发 transmit-remote。');
      },
    });
    active.harness = harness;
    const spans: HarnessExecutionSpan[] = [];
    let terminalClassification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' = 'completed';
    try {
      requireCompositionMatch(harness.composition.digest, facts.behaviorCompositionDigest);
      const bindingRecord: ExecutionBindingRecord = {
        attemptId,
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        bookId: facts.bookId,
        planEnvelopeDigest: facts.planEnvelopeDigest,
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
        promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
        contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
        harnessSessionId,
        route: LOCAL_DETERMINISTIC_ROUTE,
        model: LOCAL_DETERMINISTIC_MODEL,
        adapterPin: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256 },
        credentialSlot: { modelRole: 'Main Editorial Role', slot: 'deepseek-api-key', credentialReference: facts.credentialReference },
        outboundDataCategory: 'public-or-synthetic',
        policyPin: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v3', liveTransmissions: 0 },
        runBudgetCeiling: 'unset',
        dispatchAttribution: 'Dispatch',
        boundAt,
      };
      const bindingDigest = canonicalRecord(bindingRecord).digest;
      // Readiness only: the product path reaches the Protected Secret Store and releases no value.
      const credentialReadiness = await this.#broker.checkReadiness({
        bindingDigest,
        modelRole: 'Main Editorial Role',
        slot: 'deepseek-api-key',
        credentialReference: facts.credentialReference,
      });
      const persisted = ledger.persistAttemptAndBinding({ runRecordId: facts.runRecordId, binding: bindingRecord, credentialReadiness });
      if (persisted.bindingDigest !== bindingDigest) throw new ExecutionAdmissionError('EXECUTION_BINDING_DIGEST_DRIFT', '执行绑定摘要在持久化时发生变化。');
      currentBindingDigest = bindingDigest;
      bindingFacts = {
        bindingDigest,
        route: LOCAL_DETERMINISTIC_ROUTE,
        model: LOCAL_DETERMINISTIC_MODEL,
        systemPrompt: BASELINE_PROMPT_CONTRACT.systemPrompt,
        outboundDataCategory: 'public-or-synthetic',
        policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
        admittedUserMessages,
      };
      harness.bindExecution({ harnessSessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      ledger.recordRunState(facts.runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。', attemptId, bindingDigest, unitsTotal: manifest.units.length });

      const outcomes: UnitOutcome[] = [];
      const unitRecords: UnitResultRecord[] = [];
      const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
      let spanOrdinal = 0;
      for (const [index, unit] of manifest.units.entries()) {
        if (active.interrupted) break;
        active.progress.currentUnitOrdinal = unit.ordinal;
        const requestDigest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
        const turn = await harness.submitUnit(unitMessages[index]!);
        spanOrdinal += 1;
        spans.push(turn.span);
        ledger.recordSpan(attemptId, spanOrdinal, turn.span, unit.ordinal);
        usage.requests += 1;
        const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
        const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
        const unitUsage = usageSignal?.kind === 'usage' ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens } : null;
        if (unitUsage !== null) {
          usage.inputTokens += unitUsage.inputTokens;
          usage.outputTokens += unitUsage.outputTokens;
        }
        const gap = (code: AnalysisGapProjection['code'], reason: string): void => {
          outcomes.push({ unitOrdinal: unit.ordinal, state: 'gap', code, reason });
          unitRecords.push({
            unitOrdinal: unit.ordinal,
            requestDigest,
            closed: { state: 'gap', gap: { unitOrdinal: unit.ordinal, code, reason, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } },
          });
        };
        if (turn.terminal === 'completed' && candidate?.kind === 'contentCandidate') {
          const parsed = parseUnitResult(candidate.text, { unitOrdinal: unit.ordinal, blockIds: [...unit.blockIds, ...unit.overlapBlockIds] });
          if (parsed.ok) {
            acceptedOutputDigests.add(candidate.digest);
            outcomes.push({ unitOrdinal: unit.ordinal, state: 'closed', result: parsed.result });
            unitRecords.push({
              unitOrdinal: unit.ordinal,
              requestDigest,
              closed: { state: 'closed', responseDigest: candidate.digest, usage: unitUsage, result: stripSchema(parsed.result) },
            });
          } else {
            acceptedOutputDigests.add(candidate.digest);
            gap('contract-invalid', `单元结果不符合契约 v1（${parsed.code}）：${parsed.detail}`);
          }
        } else if (turn.terminal === 'completed') {
          gap('contract-invalid', '技术回合完成但没有模型输出。');
        } else if (turn.terminal === 'failed') {
          const failure = turn.signals.find((signal) => signal.kind === 'failed');
          gap('adapter-failure', failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。');
        } else if (turn.terminal === 'interrupted') {
          const failure = turn.signals.find((signal) => signal.kind === 'interrupted');
          const egress = failure?.kind === 'interrupted' && failure.failure.failureClass === 'egress-refused';
          gap(egress ? 'egress-refused' : 'interrupted', failure?.kind === 'interrupted' ? failure.failure.reason : '请求被中断。');
          terminalClassification = 'interrupted';
          break;
        } else {
          gap('interrupted', '技术回合结果不明确；自动重试与回退已停止。');
          terminalClassification = 'interrupted';
          break;
        }
        active.progress.unitsSettled += 1;
      }
      if (active.interrupted && terminalClassification === 'completed') terminalClassification = 'interrupted';
      const reduction = reduceBaselineAnalysis(manifest, outcomes);
      if (terminalClassification === 'completed' && reduction.gaps.length > 0) terminalClassification = 'completed-with-gaps';
      // Units the interrupted loop never reached are recorded as exact not-attempted gaps.
      for (const gapEntry of reduction.gaps) {
        if (!unitRecords.some((record) => record.unitOrdinal === gapEntry.unitOrdinal)) {
          unitRecords.push({
            unitOrdinal: gapEntry.unitOrdinal,
            requestDigest: unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, gapEntry.unitOrdinal, manifest.units[gapEntry.unitOrdinal - 1]!.digest),
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
      });
      ledger.recordRunState(facts.runRecordId, terminalClassification, {
        detail: `运行终态：${terminalClassification}；结果集修订版 ${revision.revisionId}。`,
        resultSetRevisionId: revision.revisionId,
        unitsClosed: reduction.coverage.unitsClosed,
        unitsTotal: reduction.coverage.unitsTotal,
        gapCount: reduction.gaps.length,
        conflictCount: reduction.conflicts.length,
      });
      ledger.recordOutcome({
        taskIntentId: facts.taskIntentId,
        runRecordId: facts.runRecordId,
        classification: terminalClassification,
        resultSetRevisionId: revision.revisionId,
        summary: `${reduction.coverage.label}；${reduction.reducerClosure.label}；${reduction.assurance.label}。`,
        safeNextAction: SAFE_NEXT_ACTIONS[terminalClassification],
      });
    } finally {
      currentBindingDigest = null;
      active.progress.currentUnitOrdinal = null;
      await harness.finish();
    }
  }
}

function requireCompositionMatch(actual: string, planned: string): void {
  if (actual !== planned) throw new ExecutionAdmissionError('EXECUTION_COMPOSITION_DRIFT', '组合摘要与冻结计划不一致；未开始执行。');
}

function stripSchema(result: Record<string, unknown> | { schema: string }): Record<string, unknown> {
  const { schema: _schema, unitOrdinal: _unitOrdinal, ...rest } = result as Record<string, unknown>;
  return rest;
}
