import type { DatabaseSync } from 'node:sqlite';
import type { CoverageManifestProjection } from '../../shared/protocol.js';
import {
  CLARIFICATION_ANSWER_SCHEMA,
  CLARIFICATION_NOTE_MAX,
  CLARIFICATION_REQUEST_SCHEMA,
  clarificationGraphemes,
  parseModelClarification,
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
import { manifestDigestIsExact } from './coverage-manifest.js';
import type {
  AnalysisRequestIdentity,
  ExecutionBindingRecord,
  RequestAdmissionData,
  RequestAdmissionEvent,
  RequestAdmissionReading,
  SqlRow,
  StageContinuation,
} from './baseline-analysis-types.js';
import { CARRIED_STAGES, asNumber, asString } from './run-state.js';

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

export function readRequestAdmissions(db: DatabaseSync, runRecordId: string): RequestAdmissionReading | null {
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
