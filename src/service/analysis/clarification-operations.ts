import { MODEL_REQUEST_ADMISSION_SCHEMA_VERSION } from '../task-authorization.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AnalysisProjection, BaselineAnalysisRunState } from '../../shared/protocol.js';
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
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalJson,
  canonicalRecord,
  parseCanonicalJson,
  requireAnalysis,
} from './canonical.js';
import type { ProgressReader, RequestAdmissionReading, SqlRow } from './baseline-analysis-types.js';
import { asNumber, asString } from './run-state.js';

export interface ClarificationOperationsHost {
  appendExecutionEvidence: (runRecordId: string, detail: Record<string, unknown>) => void;
  readonly db: DatabaseSync;
  checkpointClarificationRequests: (runRecordId: string, unitOrdinal: number) => void;
  clarificationsOf: (runRecordId: string) => ClarificationFacts[];
  inspect: (bookId: string, progress?: ProgressReader, revisionId?: string | null) => AnalysisProjection;
  modelClarificationAnswerClaimed: (runRecordId: string, requestId: string) => boolean;
  recordRunState: (runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>) => void;
  requestAdmissionOf: (runRecordId: string) => RequestAdmissionReading | null;
}

export function recordClarificationRequest(host: ClarificationOperationsHost, input: {
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
  const requests = host.requestAdmissionOf(input.runRecordId);
  const covered = requests === null ? undefined : [...requests.open.values()].filter((request) => request.stage === 'units' && request.unitOrdinal === input.unitOrdinal).map((request) => request.requestId);
  requireAnalysis(modelJson === null || parseModelClarification(modelJson) !== null, 'ANALYSIS_RECORD_INVALID', '模型澄清问题无效。');
  if (covered !== undefined) requireAnalysis(Number(host.db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, 'ANALYSIS_RECORD_INVALID', '请求澄清写入需要已验证的读者修订。');
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
  host.db.prepare(
      'INSERT INTO analysis_clarification_requests(request_id, run_record_id, unit_ordinal, kind, raised_at, canonical_json, sha256, model_question_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(requestId, input.runRecordId, input.unitOrdinal, 'ask-first-adaptation', raisedAt, record.json, record.digest, modelJson);
  host.checkpointClarificationRequests(input.runRecordId, input.unitOrdinal);
  return requestId;
}

export function clarificationsOf(host: ClarificationOperationsHost, runRecordId: string): ClarificationFacts[] {
  requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
  const rows = host.db.prepare(
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

export function recordClarificationAnswer(host: ClarificationOperationsHost, bookId: string, input: { taskIntentId: string; requestId: string; optionId: unknown; note: unknown }): {
    answerId: string;
    runRecordId: string;
    runState: BaselineAnalysisRunState;
  } {
  requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.requestId),
      'ANALYSIS_CLARIFICATION_INVALID', '回答的参数无效。');
  const note = typeof input.note === 'string' ? input.note.trim() : null;
  const current = host.inspect(bookId);
  const run = current.run;
  requireAnalysis(current.taskIntent?.taskIntentId === input.taskIntentId && run !== null,
      'ANALYSIS_CLARIFICATION_STALE', '这项任务已经变化；这个问题不再等你回答。');
  requireAnalysis(run.state === 'admitted' || run.state === 'executing' || run.state === 'pausing' || run.state === 'paused' ||
    run.state === 'resumable' || run.state === 'awaiting-clarification',
    'ANALYSIS_CLARIFICATION_STALE', '这次运行已经结束或正在取消；这个问题不再等你回答。');
  const request = host.clarificationsOf(run.runRecordId).find((entry) => entry.requestId === input.requestId);
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
  const requestRow = host.db.prepare('SELECT sha256 FROM analysis_clarification_requests WHERE request_id = ?').get(input.requestId) as SqlRow;
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
  host.db.prepare(
      'INSERT INTO analysis_clarification_answers(answer_id, request_id, option_id, answered_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(answerId, input.requestId, model === undefined ? input.optionId as string : 'retry', answeredAt, record.json, record.digest);
  return { answerId, runRecordId: run.runRecordId, runState: run.state };
}

export function expireModelClarifications(host: ClarificationOperationsHost, runRecordId: string, now = Date.now()): number {
  let expired = 0;
  for (const request of host.clarificationsOf(runRecordId)) {
    if (!modelClarificationExpired(request, now)) continue;
    const requestRow = host.db.prepare('SELECT sha256 FROM analysis_clarification_requests WHERE request_id = ?').get(request.requestId)!;
    const answerId = randomUUID();
    const answeredAt = new Date(now).toISOString();
    const record = canonicalRecord({ schema: CLARIFICATION_ANSWER_SCHEMA, answerId, requestId: request.requestId,
      requestSha256: asString(requestRow.sha256), runRecordId, optionId: 'no-answer', note: null, actor: 'service-timeout', answeredAt });
    host.db.prepare('INSERT INTO analysis_clarification_answers(answer_id, request_id, option_id, answered_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(answerId, request.requestId, 'retry', answeredAt, record.json, record.digest);
    expired += 1;
  }
  return expired;
}

export function modelClarificationAnswerClaimed(host: ClarificationOperationsHost, runRecordId: string, requestId: string): boolean {
  const rows = host.db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ?').all(runRecordId);
  return rows.some((row) => (parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>).modelClarificationAnswerClaim === requestId);
}

export function claimModelClarificationAnswer(host: ClarificationOperationsHost, runRecordId: string, requestId: string, preserveState = false): boolean {
  if (host.modelClarificationAnswerClaimed(runRecordId, requestId)) return false;
  const detail = { detail: '按澄清回答接着处理这个阅读范围。', modelClarificationAnswerClaim: requestId };
  if (preserveState) host.appendExecutionEvidence(runRecordId, { modelClarificationAnswerClaim: requestId });
  else host.recordRunState(runRecordId, 'executing', detail);
  return true;
}
