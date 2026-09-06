import { randomUUID } from 'node:crypto';
import type { AnalysisGapProjection, AnalysisSourceRangeProjection, CoverageManifestUnitProjection, LaunchPolicyProjection } from '../../shared/protocol.js';
import { prepareExecution, type HarnessExecutionSpan, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { CredentialBroker, type SecretResolver } from '../provider/credential-broker.js';
import type { ClassifiedModelFailure } from '../provider/classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter } from '../provider/local-deterministic-adapter.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { canonicalRecord } from './canonical.js';
import type { BaselineAnalysisStore, ExecutionBindingRecord, ExecutionPlanFacts, PredecessorUnitResult, RunProgress, UnitResultRecord } from './baseline-analysis-store.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, buildUnitMessage, parseUnitResult, unitRequestDigest, type BaselineUnitResult } from './contract.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';
import { reduceBaselineAnalysis, type UnitOutcome } from './reducers.js';

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
  completed: '检查结果集修订版的四个状态轴、缺口与冲突清单；稿件变化后可用「同步到当前稿件」，或用「重新分析所选范围」/「重新分析全书」发起新的授权运行，追加后继修订版。',
  'completed-with-gaps': '逐项查看缺口单元与冲突清单；缺口单元在任一更新方式的新授权运行中都会重算，结果集修订版本身不会改写。',
  failed: '核对运行失败原因；修复后可通过分析更新操作重新准备并授权新的运行。',
  interrupted: '运行已在派发后中断；已完成单元的结果与缺口均已保留，续行需要通过分析更新操作发起新的授权运行。',
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
    const submitted = facts.update === null ? facts.manifest.units.length : facts.update.reusePlan.counts.recomputed;
    this.#deps.ledger.recordRunState(runRecordId, 'admitted', {
      detail: '已进入 AI7 调度器（单槽位）。',
      unitsTotal: facts.manifest.units.length,
      ...(facts.update === null ? {} : { updateMode: facts.update.mode, unitsRecomputed: submitted, unitsReused: facts.update.reusePlan.counts.reused }),
    });
    const active: ActiveRun = {
      runRecordId,
      progress: { unitsTotal: submitted, unitsSettled: 0, currentUnitOrdinal: null },
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
    const update = facts.update;
    // Only recomputed units form unit messages; the Run Source Scope admits exactly those.
    const recomputedOrdinals = new Set(update === null
      ? manifest.units.map((unit) => unit.ordinal)
      : update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
    const submittedUnits = manifest.units.filter((unit) => recomputedOrdinals.has(unit.ordinal));
    const unitMessages = new Map(submittedUnits.map((unit) => [unit.ordinal, buildUnitMessage(unit, manifest.units.length, blocksById)] as const));
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
    const harness = await prepareExecution({
      sessionId: harnessSessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: BASELINE_PROMPT_CONTRACT.systemPrompt,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: (codes) => new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes),
      gate: (payload) => {
        if (bindingFacts === null) return { decision: 'refuse', reason: 'binding-stale', detail: '执行绑定尚未持久化；未发送任何内容。' };
        const decision = evaluateEgress(payload, bindingFacts, { currentBindingDigest: () => currentBindingDigest, acceptedOutputDigests });
        admittedPayloadDigest = decision.decision === 'refuse' ? null : decision.payloadDigest;
        return decision;
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
        ...(update === null ? {} : { update: { mode: update.mode, predecessorRevisionId: update.predecessor.revisionId, reusePlanDigest: update.reusePlanDigest } }),
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
      ledger.recordRunState(facts.runRecordId, 'executing', {
        detail: update === null ? '执行绑定已持久化并核对；开始逐单元执行。' : '执行绑定已持久化并核对；按血缘复用兼容单元，仅对重算单元逐单元执行。',
        attemptId,
        bindingDigest,
        unitsTotal: manifest.units.length,
        ...(update === null ? {} : { unitsRecomputed: submittedUnits.length, unitsReused: update.reusePlan.counts.reused }),
      });

      const outcomes: UnitOutcome[] = [];
      const unitRecords: UnitResultRecord[] = [];
      const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
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
            closed: { state: 'closed', responseDigest: source.responseDigest, usage: source.usage, result: stripSchema(result) },
          });
        }
      }
      let spanOrdinal = 0;
      let adaptationOrdinal = 0;
      const adaptedUnitOrdinals: number[] = [];
      // One technical turn for one unit attempt: the span is recorded by reference with the attempt index
      // and the admitted payload digest, and every attempt's usage counts toward the Run.
      const submitAttempt = async (unit: CoverageManifestUnitProjection, attemptIndex: number) => {
        admittedPayloadDigest = null;
        const turn = await harness.submitUnit(unitMessages.get(unit.ordinal)!);
        const payloadDigest = admittedPayloadDigest;
        spanOrdinal += 1;
        spans.push(turn.span);
        ledger.recordSpan(attemptId, spanOrdinal, turn.span, unit.ordinal, { attemptIndex, payloadDigest });
        usage.requests += 1;
        const usageSignal = turn.signals.find((signal) => signal.kind === 'usage');
        const unitUsage = usageSignal?.kind === 'usage' ? { inputTokens: usageSignal.usage.inputTokens, outputTokens: usageSignal.usage.outputTokens } : null;
        if (unitUsage !== null) {
          usage.inputTokens += unitUsage.inputTokens;
          usage.outputTokens += unitUsage.outputTokens;
        }
        return { turn, unitUsage, payloadDigest };
      };
      for (const unit of submittedUnits) {
        if (active.interrupted) break;
        active.progress.currentUnitOrdinal = unit.ordinal;
        const requestDigest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
        let attempt = await submitAttempt(unit, 1);
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
            attempt = await submitAttempt(unit, 2);
          }
        }
        const { turn, unitUsage } = attempt;
        const candidate = turn.signals.find((signal) => signal.kind === 'contentCandidate');
        const gap = (code: AnalysisGapProjection['code'], reason: string): void => {
          outcomes.push({ unitOrdinal: unit.ordinal, state: 'gap', code, reason });
          unitRecords.push({
            unitOrdinal: unit.ordinal,
            requestDigest,
            lineage: { kind: 'recomputed' },
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
              lineage: { kind: 'recomputed' },
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
          const reason = failure?.kind === 'failed' ? `${failure.failure.reason}（${failure.failure.code}）` : '适配器失败。';
          // A second failure names both attempts; the unit is never retried again.
          gap('adapter-failure', firstFailure === null ? reason : `第 1 次尝试：${firstFailure.reason}（${firstFailure.code}）；安全重试后第 2 次尝试：${reason}`);
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
      // The reducers and the contradiction/continuity pass run over the complete new unit set: reused plus recomputed.
      const reduction = reduceBaselineAnalysis(manifest, outcomes, reusedOrdinals);
      if (terminalClassification === 'completed' && reduction.gaps.length > 0) terminalClassification = 'completed-with-gaps';
      // Units the interrupted loop never reached are recorded as exact not-attempted gaps.
      for (const gapEntry of reduction.gaps) {
        if (!unitRecords.some((record) => record.unitOrdinal === gapEntry.unitOrdinal)) {
          unitRecords.push({
            unitOrdinal: gapEntry.unitOrdinal,
            requestDigest: unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, gapEntry.unitOrdinal, manifest.units[gapEntry.unitOrdinal - 1]!.digest),
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
      ledger.recordRunState(facts.runRecordId, terminalClassification, {
        detail: `运行终态：${terminalClassification}；结果集修订版 ${revision.revisionId}（Revision ${revision.ordinal}）。`,
        resultSetRevisionId: revision.revisionId,
        resultSetRevisionOrdinal: revision.ordinal,
        unitsClosed: reduction.coverage.unitsClosed,
        unitsReused: reduction.coverage.unitsReused,
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
