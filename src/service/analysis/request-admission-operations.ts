import { MODEL_REQUEST_ADMISSION_SCHEMA_VERSION } from '../task-authorization.js';
import type { DatabaseSync } from 'node:sqlite';
import type { AnalysisTaskMode, BaselineAnalysisRunState, CoverageManifestProjection } from '../../shared/protocol.js';
import type { ClarificationFacts } from './clarifications.js';
import { canonicalRecord, parseCanonicalJson, requireAnalysis, sha256Hex } from './canonical.js';
import { manifestDigestIsExact, type ManifestBlockInput } from './coverage-manifest.js';
import type { AnalysisKindDefinition } from './kind-definition.js';
import { assuranceSamplingTurns, buildAssuranceSamplingMessage } from './assurance-sampling-contract.js';
import type {
  AnalysisRequestIdentity,
  CarriedStages,
  ExecutionBindingRecord,
  RequestAdmissionData,
  RequestAdmissionEvent,
  RequestAdmissionPins,
  RequestAdmissionReading,
  RunProgressStage,
  SqlRow,
  StageContinuation,
  UnitCheckpoint,
  UnitResultRecord,
} from './baseline-analysis-types.js';
import { asNumber, asString, transact } from './run-state.js';
import { readRequestAdmissions } from './request-admissions.js';
import type { BaselineAnalysisStore } from './baseline-analysis-store.js';

export interface RequestAdmissionOperationsHost {
  readonly db: DatabaseSync;
  planRecords: (taskIntentId: string, mode: AnalysisTaskMode | 'any', planVersion: number) => Record<string, unknown>;
  carriedUsageOf: (runRecordId: string) => { inputTokens: number; outputTokens: number; stages: CarriedStages | null; webVerification?: { inputTokens: number; outputTokens: number } } | null;
  checkpointClarificationRequests: (runRecordId: string, unitOrdinal: number) => void;
  checkpointModelRequests: (runRecordId: string, unitOrdinal: number) => void;
  checkpointReflectionRequests: (runRecordId: string) => void;
  checkpointStageRequests: (runRecordId: string, stage: 'cross-unit-reduction' | 'assurance-sampling', stages: StageContinuation, carriedUsage: { inputTokens: number; outputTokens: number; stages: CarriedStages }) => void;
  clarificationsOf: (runRecordId: string) => ClarificationFacts[];
  definitionForRun: (runRecordId: string, promptContractDigest: string) => AnalysisKindDefinition;
  executionBindingOf: (runRecordId: string) => { attemptId: string; binding: ExecutionBindingRecord; bindingDigest: string; spanCount: number } | null;
  hasCommittedOutcome: (runRecordId: string) => boolean;
  modelClarificationAnswerClaimed: (runRecordId: string, requestId: string) => boolean;
  readRevisionBlocks: (manuscriptId: string, revisionId: string) => ManifestBlockInput[];
  recordRunState: (runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>) => void;
  recordUnitCheckpoint: (input: {
    runRecordId: string;
    attemptId: string;
    unit: UnitResultRecord;
    observation: UnitCheckpoint['observation'];
    requests?: readonly string[];
  }) => void;
  requestAdmissionOf: (runRecordId: string) => RequestAdmissionReading | null;
  stageContinuationOf: (runRecordId: string) => StageContinuation | null;
  unitCheckpoints: (runRecordId: string) => UnitCheckpoint[];
}

export function internalRequestManifest(host: RequestAdmissionOperationsHost, stored: NonNullable<ReturnType<BaselineAnalysisStore['executionBindingOf']>>): CoverageManifestProjection {
  const manifest = host.planRecords(stored.binding.taskIntentId, 'any', stored.binding.planVersion)['coverage-manifest'] as CoverageManifestProjection;
  requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === stored.binding.coverageManifestDigest &&
    manifest.manuscript.revisionId === stored.binding.manuscriptPin.revisionId && manifest.manuscript.revisionDigest === stored.binding.manuscriptPin.revisionDigest,
    'ANALYSIS_RECORD_INVALID', '请求准入的固定覆盖清单无法核对。');
  return manifest;
}

export function requestAdmissionOf(host: RequestAdmissionOperationsHost, runRecordId: string): RequestAdmissionReading | null {
  return readRequestAdmissions(host.db, runRecordId);
}

export function internalAppendExecutionEvidence(host: RequestAdmissionOperationsHost, runRecordId: string, detail: Record<string, unknown>): void {
  const row = host.db.prepare('SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
  requireAnalysis(row !== undefined && sha256Hex(asString(row.canonical_json)) === row.sha256, 'ANALYSIS_RECORD_INVALID', '运行状态无法核对。');
  const { runRecordId: _run, sequence: _sequence, state, recordedAt: _at, requestAdmission: _receipt, ...kept } = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
  host.recordRunState(runRecordId, state as BaselineAnalysisRunState, { ...kept, ...detail });
}

export function internalAppendRequestAdmission(host: RequestAdmissionOperationsHost, runRecordId: string, pins: RequestAdmissionPins, event: RequestAdmissionEvent, detail: Record<string, unknown> = {}): void {
  requireAnalysis(Number(host.db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION,
      'ANALYSIS_RECORD_INVALID', '请求准入写入需要已验证的读者修订。');
  transact(host.db, () => {
    const prior = host.requestAdmissionOf(runRecordId);
    const data: RequestAdmissionData = { ...pins, sequence: (prior?.sequence ?? 0) + 1, predecessorDigest: prior?.digest ?? null, event };
    internalAppendExecutionEvidence(host, runRecordId, { ...detail, requestAdmission: { schema: 'ai7.analysis.request-admission/1', data, digest: canonicalRecord(data).digest } });
    host.requestAdmissionOf(runRecordId);
  });
}

export function beginRequestAdmissions(host: RequestAdmissionOperationsHost, runRecordId: string, width: 1 | 3, policyRuleId: string): 1 | 3 {
  requireAnalysis(typeof policyRuleId === 'string' && /^[a-z][a-z0-9-]{0,159}$/u.test(policyRuleId),
      'ANALYSIS_RECORD_INVALID', '请求准入需要实际规则标识。');
  const prior = host.requestAdmissionOf(runRecordId);
  if (prior !== null) {
    requireAnalysis(prior.pins.policyRuleId === policyRuleId, 'ANALYSIS_RECORD_INVALID', '请求准入的固定规则与实际规则不一致。');
    return prior.width;
  }
  const stored = host.executionBindingOf(runRecordId);
  requireAnalysis(stored !== null, 'ANALYSIS_RECORD_INVALID', '请求准入前必须保存执行绑定。');
  const binding = stored.binding;
  internalAppendRequestAdmission(host, runRecordId, { runRecordId, attemptId: stored.attemptId, bindingDigest: stored.bindingDigest,
    planEnvelopeDigest: binding.planEnvelopeDigest, manifestDigest: binding.coverageManifestDigest, compositionDigest: binding.behaviorCompositionDigest,
    promptContractDigest: binding.promptContractDigest, policyVersion: binding.policyPin.providerProcessingVersion, policyRuleId },
  { kind: 'execution', width, limits: { requests: 4, units: 3, backgroundRequests: 1 } });
  return host.requestAdmissionOf(runRecordId)!.width;
}

export function admitModelRequest(host: RequestAdmissionOperationsHost, runRecordId: string, request: AnalysisRequestIdentity, clarificationRequestId: string | null = null): void {
  transact(host.db, () => {
    const reading = host.requestAdmissionOf(runRecordId);
    requireAnalysis(reading !== null, 'ANALYSIS_RECORD_INVALID', '请求准入缺少执行收据。');
    if (clarificationRequestId !== null) requireAnalysis(!host.modelClarificationAnswerClaimed(runRecordId, clarificationRequestId),
        'ANALYSIS_CLARIFICATION_ALREADY_CLAIMED', '澄清回答回合已经提交；没有再次发送。');
    internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'admit', request },
      clarificationRequestId === null ? {} : { modelClarificationAnswerClaim: clarificationRequestId });
  });
}

export function recordModelRequestNotSent(host: RequestAdmissionOperationsHost, runRecordId: string, requestId: string): void {
  const reading = host.requestAdmissionOf(runRecordId);
  const request = reading?.open.get(requestId);
  requireAnalysis(reading !== null && request !== undefined, 'ANALYSIS_RECORD_INVALID', '未发送证明缺少精确的请求标识。');
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests: [requestId], evidence: { kind: 'no-send', digest: canonicalRecord(request).digest } });
}

export function checkpointFactualRequests(host: RequestAdmissionOperationsHost, runRecordId: string, round: import('../factual-verification.js').FactualClaimRound): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const requests = [...reading.open.values()].filter((request) => request.stage === 'web-verification' && request.sessionId === round.sessionId).map((request) => request.requestId);
  if (requests.length > 0) internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests,
    evidence: { kind: 'factual-checkpoint', digest: canonicalRecord(round).digest } });
}

export function checkpointModelRequests(host: RequestAdmissionOperationsHost, runRecordId: string, unitOrdinal: number): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === unitOrdinal).map((request) => request.requestId);
  if (requests.length === 0) return;
  const checkpoint = host.db.prepare('SELECT sha256 FROM analysis_unit_checkpoints WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unitOrdinal) as SqlRow | undefined;
  requireAnalysis(checkpoint !== undefined, 'ANALYSIS_RECORD_INVALID', '请求结算前必须保存对应的单元结果。');
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests, evidence: { kind: 'unit-checkpoint', digest: asString(checkpoint.sha256) } });
  host.requestAdmissionOf(runRecordId);
}

export function checkpointClarificationRequests(host: RequestAdmissionOperationsHost, runRecordId: string, unitOrdinal: number): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const row = host.db.prepare('SELECT canonical_json, sha256 FROM analysis_clarification_requests WHERE run_record_id = ? AND unit_ordinal = ?').get(runRecordId, unitOrdinal) as SqlRow | undefined;
  if (row === undefined) return;
  const checkpoint = parseCanonicalJson(asString(row.canonical_json)) as { requests?: string[] };
  const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === unitOrdinal && checkpoint.requests?.includes(request.requestId)).map((request) => request.requestId);
  if (requests.length === 0) return;
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests,
    evidence: { kind: 'clarification-checkpoint', digest: asString(row.sha256) } });
}

export function modelClarificationAnswerNotSent(host: RequestAdmissionOperationsHost, runRecordId: string, clarificationRequestId: string, unitOrdinal: number): boolean {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return false;
  const claims = host.db.prepare(`SELECT sequence, canonical_json FROM analysis_run_states WHERE run_record_id = ? AND
      json_extract(canonical_json, '$.modelClarificationAnswerClaim') = ? ORDER BY sequence LIMIT 1`).get(runRecordId, clarificationRequestId) as SqlRow | undefined;
  if (claims === undefined) return false;
  const firstReceipt = host.db.prepare(`SELECT sequence FROM analysis_run_states WHERE run_record_id = ? AND
      json_type(canonical_json, '$.requestAdmission') IS NOT NULL ORDER BY sequence LIMIT 1`).get(runRecordId) as SqlRow;
  const origin = parseCanonicalJson(asString(claims.canonical_json)) as { requestAdmission?: { data: { event: RequestAdmissionEvent } } };
  const admitted = origin.requestAdmission?.data.event;
  if (asNumber(claims.sequence) < asNumber(firstReceipt.sequence) || admitted?.kind !== 'admit' ||
      admitted.request.stage !== 'units' || admitted.request.unitOrdinal !== unitOrdinal) return false;
  const rows = host.db.prepare(`SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND sequence >= ? AND
      json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit' AND
      json_extract(canonical_json, '$.requestAdmission.data.event.request.unitOrdinal') = ?`).all(runRecordId, claims.sequence!, unitOrdinal) as SqlRow[];
  const ids = rows.map((row) => (parseCanonicalJson(asString(row.canonical_json)) as { requestAdmission: { data: { event: { request: AnalysisRequestIdentity } } } }).requestAdmission.data.event.request.requestId);
  return ids.length > 0 && ids.every((id) => reading.notSent.some((request) => request.requestId === id));
}

export function checkpointStageRequests(host: RequestAdmissionOperationsHost, runRecordId: string, stage: 'cross-unit-reduction' | 'assurance-sampling', stages: StageContinuation, carriedUsage: { inputTokens: number; outputTokens: number; stages: CarriedStages }): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const detail = { stageContinuation: { schema: 'ai7.analysis.stage-continuation/1', data: stages, digest: canonicalRecord(stages).digest }, carriedUsage };
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve',
    requests: [...reading.open.values()].filter((request) => request.stage === stage && (stage === 'cross-unit-reduction'
      ? stages.reduction?.requestDigest === request.requestDigest && stages.reduction.inputDigest === request.inputDigest
      : stages.sampling?.inputDigest === request.inputDigest && stages.sampling.turns.some((turn) => turn.requestDigest === request.requestDigest))).map((request) => request.requestId),
    evidence: { kind: 'stage-checkpoint', digest: canonicalRecord(detail).digest } }, detail);
}

export function checkpointReflectionRequests(host: RequestAdmissionOperationsHost, runRecordId: string): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const requests = [...reading.open.values()].filter((request) => request.stage === 'run-report-reflection').map((request) => request.requestId);
  if (requests.length === 0) return;
  const outcome = host.db.prepare('SELECT sha256 FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
  requireAnalysis(outcome !== undefined, 'ANALYSIS_RECORD_INVALID', '反思请求结算前必须保存运行结果。');
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests, evidence: { kind: 'reflection-outcome', digest: asString(outcome.sha256) } });
}

export function hasCommittedOutcome(host: RequestAdmissionOperationsHost, runRecordId: string): boolean {
  return host.db.prepare('SELECT 1 FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) !== undefined;
}

export function checkpointRefusedRequests(host: RequestAdmissionOperationsHost, runRecordId: string, stage: RunProgressStage, unitOrdinal: number | null, observation: { attempts: number; usage: { inputTokens: number; outputTokens: number } | null }): void {
  const reading = host.requestAdmissionOf(runRecordId);
  if (reading === null) return;
  const requests = [...reading.open.values()].filter((request) => request.stage === stage && request.unitOrdinal === unitOrdinal).map((request) => request.requestId);
  if (requests.length === 0) return;
  const requestRefusal = { state: 'provider-account-limit', stage, unitOrdinal, observation };
  internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests,
    evidence: { kind: 'refused-turn', digest: canonicalRecord(requestRefusal).digest } }, { requestRefusal });
}

export function reconcileRequestAdmissions(host: RequestAdmissionOperationsHost, runRecordId: string): void {
  let reading = host.requestAdmissionOf(runRecordId);
  if (reading === null || reading.open.size === 0) return;
  const stored = host.executionBindingOf(runRecordId);
  requireAnalysis(stored !== null, 'ANALYSIS_RECORD_INVALID', '准入记录缺少执行绑定。');
  const manifest = internalRequestManifest(host, stored);
  // The Run's frozen contract, never the launch's current one: a reopened Run whose current
  // rule is missing or differs still names its admitted requests by the digests it froze.
  const frozen = host.definitionForRun(runRecordId, reading.pins.promptContractDigest);
  const ordinals = [...new Set([...reading.open.values()].filter((request) => request.stage === 'units').map((request) => request.unitOrdinal!))].sort((left, right) => left - right);
  for (const ordinal of ordinals) {
    host.checkpointClarificationRequests(runRecordId, ordinal);
    reading = host.requestAdmissionOf(runRecordId)!;
    const requests = [...reading.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === ordinal);
    if (requests.length === 0) continue;
    const pins = reading.pins;
    // The unknown checkpoint and its discharge commit together: a refused discharge leaves no row behind.
    transact(host.db, () => {
      const existing = host.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === ordinal);
      if (existing === undefined) {
        const unit = manifest.units[ordinal - 1]!;
        const reason = '本次请求已准入，AI7 关闭前没有保存可核对的单元结果；结果未知，这次运行不会再次发送。';
        const question = host.clarificationsOf(runRecordId).find((entry) => entry.unitOrdinal === ordinal);
        host.recordUnitCheckpoint({ runRecordId, attemptId: pins.attemptId, requests: requests.map((request) => request.requestId),
          unit: { unitOrdinal: ordinal, requestDigest: frozen.requestDigest(ordinal, unit.digest), lineage: { kind: 'recomputed' },
            closed: { state: 'gap', gap: { unitOrdinal: ordinal, code: 'outcome-unknown', reason, startPosition: unit.startPosition, endPosition: unit.endPosition, blockIds: [...unit.blockIds] } } },
          observation: { unitOrdinal: ordinal, attempts: (question?.firstAttempts ?? (question === undefined ? 0 : 1)) + new Set(requests.map((request) => `${request.sessionId}:${request.attemptIndex}:${request.adaptationId ?? ''}`)).size,
            usage: question?.firstUsage ?? null, wallMs: question?.firstWallMs ?? 0 } });
      }
      host.checkpointModelRequests(runRecordId, ordinal);
    });
    reading = host.requestAdmissionOf(runRecordId)!;
  }
  const stageRequests = [...reading.open.values()].filter((request) => request.stage === 'cross-unit-reduction' || request.stage === 'assurance-sampling');
  if (stageRequests.length > 0) {
    const kept = host.stageContinuationOf(runRecordId);
    const stages: StageContinuation = kept ?? { runRecordId, attemptId: reading.pins.attemptId, bindingDigest: reading.pins.bindingDigest,
      manifestDigest: reading.pins.manifestDigest, promptContractDigest: reading.pins.promptContractDigest };
    const usage = host.carriedUsageOf(runRecordId);
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
        const definition = host.definitionForRun(runRecordId, reading.pins.promptContractDigest);
        const blocks = new Map(host.readRevisionBlocks(manifest.manuscript.manuscriptId, manifest.manuscript.revisionId).map((block) => [block.blockId, block] as const));
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
    if (reduction !== undefined) host.checkpointStageRequests(runRecordId, 'cross-unit-reduction', stages, totals);
    if (sampling !== undefined) host.checkpointStageRequests(runRecordId, 'assurance-sampling', stages, totals);
    reading = host.requestAdmissionOf(runRecordId)!;
  }
  const reflection = [...reading.open.values()].filter((request) => request.stage === 'run-report-reflection');
  if (reflection.length > 0) {
    if (host.hasCommittedOutcome(runRecordId)) host.checkpointReflectionRequests(runRecordId);
    else internalAppendRequestAdmission(host, runRecordId, reading.pins, { kind: 'resolve', requests: reflection.map((request) => request.requestId),
      evidence: { kind: 'unavailable', digest: canonicalRecord({ requests: reflection, reason: 'possible-send-without-durable-result' }).digest } });
  }
}
