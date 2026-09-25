import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  J04_MODEL_ADAPTER_CONTROL_PATTERN,
  MAX_FRAME_BYTES,
  PROVIDER_CACHE_ROOT_ARGUMENT,
  RUN_BUDGET_CEILING_ARGUMENT,
  TRUSTED_SCOPE_ARGUMENT,
  parseTrustedLaunchForm,
  type J01ImportControl,
  type J03ForegroundExecutionControl,
  type J04ModelAdapterControl,
  type J08RecoveryControl,
  type LaunchPolicyProjection,
  type ReconnectPreflightProjection,
  type ServiceFailureResponse,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceSuccessResponse,
  type TrustedLaunchForm,
} from '../shared/protocol.js';
import { armSingleHostAllowance, installNodeNetworkDenial } from '../shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../shared/protected-secret-identity.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveDeveloperLiveLaunch, type DeveloperLiveRuntime } from './launch-policy.js';
import { readSoftwareVersion } from './data-version.js';
import { BACKUP_CHECK_INTERVAL_MS } from './scheduled-backups.js';
import { decodeRequest, isSafeInteger, ProtocolError } from './request-frames.js';
import { controlledConnectivity, hostConnectivity, type TaskPlanConnectivity } from './connectivity.js';
import type { WaitingFor } from './task-plan.js';
import { controlledUnitHold } from './unit-hold.js';
import { readBookTasks, readGlobalAttention } from './global-attention.js';
import { reconnectPreflight } from './reconnect-preflight.js';
import { LOCAL_DETERMINISTIC_ROUTE } from './provider/egress-gate.js';
import type { DormantHarnessRuntime } from './runtime.js';
import type { EditorialStore } from './store.js';
import type { CooperativeJobOwner } from './cooperative-jobs.js';
import type { BaselineAnalysisExecutionOwner } from './analysis/execution.js';
import type { LaunchBinding } from './analysis/baseline-analysis-store.js';
import type { ReviewRunDriver } from './review/review-run-driver.js';

async function* readFrames(): AsyncGenerator<Uint8Array> {
  const header = Buffer.allocUnsafe(4);
  let headerOffset = 0;
  let payload: Buffer | undefined;
  let payloadOffset = 0;

  for await (const incoming of process.stdin) {
    const chunk = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming as Uint8Array);
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      if (!payload) {
        const headerBytes = Math.min(4 - headerOffset, chunk.length - chunkOffset);
        chunk.copy(header, headerOffset, chunkOffset, chunkOffset + headerBytes);
        headerOffset += headerBytes;
        chunkOffset += headerBytes;
        if (headerOffset < 4) continue;
        const length = header.readUInt32BE(0);
        if (length === 0 || length > MAX_FRAME_BYTES) throw new ProtocolError();
        payload = Buffer.allocUnsafe(length);
        payloadOffset = 0;
      }

      const payloadBytes = Math.min(payload.length - payloadOffset, chunk.length - chunkOffset);
      chunk.copy(payload, payloadOffset, chunkOffset, chunkOffset + payloadBytes);
      payloadOffset += payloadBytes;
      chunkOffset += payloadBytes;
      if (payloadOffset === payload.length) {
        yield payload;
        payload = undefined;
        payloadOffset = 0;
        headerOffset = 0;
      }
    }
  }

  if (headerOffset !== 0 || payload !== undefined) throw new ProtocolError();
}

function failureResponse(
  requestId: string,
  error: unknown,
  StoreErrorClass?: typeof import('./store.js').StoreError,
): ServiceFailureResponse {
  if ((StoreErrorClass && error instanceof StoreErrorClass) || error instanceof ProtocolError) {
    return { id: requestId, ok: false, error: { code: error.code, message: error.message } };
  }
  return { id: requestId, ok: false, error: { code: 'SERVICE_REQUEST_FAILED', message: '服务请求失败。' } };
}

async function writeResponse(response: ServiceResponse): Promise<void> {
  let selected: ServiceResponse = response;
  let payload = Buffer.from(JSON.stringify(selected), 'utf8');
  if (payload.length > MAX_FRAME_BYTES && response.ok) {
    selected = {
      id: response.id,
      ok: false,
      error: { code: 'RESPONSE_TOO_LARGE', message: '服务响应超出安全范围。' },
    };
    payload = Buffer.from(JSON.stringify(selected), 'utf8');
  }
  if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) throw new ProtocolError(response.id);
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}

/**
 * Hand an approved Review Run to its drive loop (Issue #417, B2). The loop runs on its own and records
 * whatever each category comes to, so nothing awaits it here; only taking the Run can fail, at once,
 * and that refusal is the operation's answer. A store refusal is already coded, and a fatal store error
 * must reach the service's own handling unchanged.
 */
function driveReviewRun(reviewRuns: ReviewRunDriver, reviewRunId: string): void {
  try {
    void reviewRuns.drive(reviewRunId);
  } catch (error) {
    if (error instanceof StoreErrorClass || !(error instanceof Error && 'code' in error && typeof error.code === 'string')) throw error;
    throw new StoreErrorClass(error.code, error.message.length > 0 ? error.message : '审阅未能开始。');
  }
}

/**
 * Connectivity Wait's two service-side facts (Issue #502): how the drawer's plan reads the device and the slot,
 * and Reconnect Preflight — one at a time, over every waiting Run.
 */
interface ConnectivityContext {
  planConnectivity: TaskPlanConnectivity;
  preflight(): Promise<ReconnectPreflightProjection>;
  /** What a Run in Connectivity Wait waits for now, as the drawer reads it: the network, a model connection, or the slot. */
  waitingFor(): Promise<WaitingFor>;
}

async function dispatch(
  store: EditorialStore,
  harness: DormantHarnessRuntime,
  jobs: CooperativeJobOwner,
  analysisExecution: BaselineAnalysisExecutionOwner,
  reviewRuns: ReviewRunDriver,
  request: ServiceRequest,
  importControl: J01ImportControl | undefined,
  launchPolicy: LaunchPolicyProjection,
  connectivity: ConnectivityContext,
): Promise<ServiceSuccessResponse> {
  const analysisProgress = (runRecordId: string) => analysisExecution.progressFor(runRecordId);
  switch (request.op) {
    case 'ready':
      return { id: request.id, ok: true, op: request.op, result: harness.readiness };
    case 'getStartup':
      return { id: request.id, ok: true, op: request.op, result: await store.getStartup() };
    case 'resolveBookWorkbenchRoute':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.resolveBookWorkbenchRoute(request.input),
      };
    case 'getHistoricalRevision':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getHistoricalRevision(request.input.revisionId, request.input.cursor),
      };
    case 'getModelServiceStoredState':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: { connection: store.getModelServiceConnection(), launchPolicy },
      };
    case 'saveModelServiceConnection':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.saveModelServiceConnection(
          request.input.connectionName,
          request.input.credentialReference,
          request.input.credentialOperationState,
        ),
      };
    case 'setModelServiceCredentialState':
      // A credential that became ready may be all a waiting Run waited for (OFF-009): look again, afterwards.
      queueMicrotask(() => void connectivity.preflight().catch(() => undefined));
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.setModelServiceCredentialState(
          request.input.credentialReference,
          request.input.credentialOperationState,
        ),
      };
    case 'getRecoveryComparison':
      return { id: request.id, ok: true, op: request.op, result: await store.getRecoveryComparison(request.input.attentionId) };
    case 'viewRecoveryCandidate':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.viewRecoveryCandidate(
          request.input.attentionId, request.input.expectedAttentionVersion,
          request.input.selection, request.input.target,
        ),
      };
    case 'deferRecovery':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.deferRecovery(request.input.attentionId, request.input.expectedAttentionVersion),
      };
    case 'restoreRecovery':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.restoreRecovery(
          request.input.restorationId, request.input.attentionId,
          request.input.expectedAttentionVersion, request.input.selection,
        ),
      };
    case 'getImportStartup':
      return { id: request.id, ok: true, op: request.op, result: await store.getImportStartup() };
    case 'stageSelectedManuscript':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.stageSelectedManuscript(request.input.selectionToken, request.input.selectedPath),
      };
    case 'continueImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.continueImportDraft(request.input.draftId, request.input.expectedDraftVersion),
      };
    case 'reselectImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.reselectImportDraft(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.selectionToken,
          request.input.selectedPath,
        ),
      };
    case 'abandonImportDraft':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.abandonImportDraft(request.input.draftId, request.input.expectedDraftVersion),
      };
    case 'prepareBookCreation':
      return {
        id: request.id, ok: true, op: request.op,
        result: store.prepareBookCreation(request.input.title, request.input.internalNumber),
      };
    case 'commitBookCreation':
      return { id: request.id, ok: true, op: request.op, result: store.commitBookCreation(request.input) };
    case 'getBookOverview':
      return {
        id: request.id, ok: true, op: request.op,
        result: store.getBookOverview(request.input.bookId, request.input.historyCursor),
      };
    case 'inspectEditorialWorkspaceProfile':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.inspectEditorialWorkspaceProfile(request.input.bookId),
      };
    case 'installEditorialWorkspaceProfile':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.installEditorialWorkspaceProfile(request.input.bookId),
      };
    case 'enableEditorialWorkspaceProfile':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.enableEditorialWorkspaceProfile(request.input.bookId),
      };
    case 'inspectTaskAuthorization':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectTaskAuthorization(request.input.bookId),
      };
    // The Task Drawer (Issue #418, plan slice S72): a read of the Task's plan in the editor's words. Its
    // authorization bar (Issue #420, S74a) is route-aware: a plan whose route sends to a model service is
    // offered 开始任务 only while the credential that route resolves is present.
    case 'inspectTaskPlan':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.inspectTaskPlanWithConnection(request.input, () => analysisExecution.liveCredentialReadiness(), connectivity.planConnectivity, analysisProgress),
      };
    case 'inspectForegroundExecutionBoundary':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectForegroundExecutionBoundary(
          request.input.bookId,
          request.input.runRecordId,
          launchPolicy,
        ),
      };
    case 'prepareTaskAuthorization':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startTaskAuthorizationPreparation(
          request.input.bookId,
          request.input.goal,
          launchPolicy,
        ),
      };
    case 'authorizeTaskAuthorization':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.authorizeTaskAuthorization(
          request.input.bookId,
          request.input.taskIntentId,
          request.input.planEnvelopeDigest,
        ),
      };
    case 'inspectBaselineAnalysis':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress, request.input.revisionId),
      };
    case 'prepareBaselineAnalysis':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startBaselineAnalysisPreparation(request.input.bookId, request.input.goal, request.input.update, launchPolicy, request.input.reconfirm, request.input.redoOf ?? null),
      };
    case 'authorizeBaselineAnalysis': {
      // The instance's concurrency governor (Issue #49, S14; CONC-007): the start is recorded, and the Run is admitted
      // at once while a place is free, or waits for one — 等待运行名额 — and is admitted in its turn. One this launch cannot
      // admit is blocked before dispatch with the reason, and the refusal answers the start as it always did.
      const authorized = store.authorizeBaselineAnalysis(
        request.input.bookId,
        request.input.taskIntentId,
        request.input.planEnvelopeDigest,
      );
      if (authorized.dispatchRunRecordId !== null) {
        try {
          analysisExecution.admitOrQueue(authorized.dispatchRunRecordId);
        } catch (error) {
          const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_ADMISSION_FAILED';
          throw new StoreErrorClass(code, error instanceof Error ? error.message : '运行未能进入调度。');
        }
      }
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    // 联网后开始任务 (Issue #502; AUTH-004, OFF-005): the Run is recorded waiting, and Reconnect Preflight looks at
    // once — so a start made just as the network came back is admitted now rather than at the next look.
    case 'startBaselineAnalysisWhenOnline': {
      store.startBaselineAnalysisWhenOnline(request.input.bookId, request.input.taskIntentId, request.input.planEnvelopeDigest);
      // A look that fails leaves the Run waiting as recorded; the next look admits it.
      await connectivity.preflight().catch(() => undefined);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    case 'cancelWaitingBaselineAnalysis': {
      // A Run waiting on the governor leaves its queue as it is cancelled (Issue #49, S14): nothing of it ran.
      const waiting = store.inspectBaselineAnalysis(request.input.bookId, analysisProgress).run;
      store.cancelWaitingBaselineAnalysis(request.input.bookId, request.input.taskIntentId);
      if (waiting !== null && waiting.state === 'authorized') analysisExecution.dequeue(waiting.runRecordId);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    // 更新计划 (Issue #419, plan slice S73; PLAN-009, PLAN-011): the next plan version, as the editor left the plan.
    case 'editBaselineAnalysisPlan':
      return { id: request.id, ok: true, op: request.op, result: store.editBaselineAnalysisPlan(request.input, analysisProgress) };
    // 提交回答 (Issue #422, S76d; CLAR-006): the answer is recorded; a Run that stopped for it goes on — at once when the
    // slot is free, or once it is. A Run still reading finds it at its next unit boundary, and a paused one at 续行.
    case 'answerBaselineAnalysisClarification': {
      // An answer that would take a waiting Run on is revalidated first, as 续行 is (CONT-015, CONT-016): while the Run
      // could not go on — the plan moved, its progress no longer reads back, the launch cannot carry it, the credential is
      // missing, or the device is offline — it is refused with the card's own reason, and nothing is recorded. A stale
      // answer is left to the store's own checks, which refuse it in their words.
      let blocked: string | null = null;
      try {
        const plan = await store.inspectTaskPlanWithConnection(
          { bookId: request.input.bookId, kind: 'baseline-analysis', ref: request.input.taskIntentId },
          () => analysisExecution.liveCredentialReadiness(),
          connectivity.planConnectivity,
          analysisProgress,
        );
        const card = plan.clarifications.find((entry) => entry.requestId === request.input.requestId);
        if (plan.state.key === 'awaiting-clarification' && card?.state === 'open') blocked = card.answerable.reason;
      } catch {
        blocked = null;
      }
      if (blocked !== null) throw new StoreErrorClass('ANALYSIS_CLARIFICATION_BLOCKED', blocked);
      const answered = store.answerBaselineAnalysisClarification(request.input);
      if (answered.runState === 'awaiting-clarification') {
        try {
          analysisExecution.continueAnswered(answered.runRecordId, store.baselineAnalysisLedger);
        } catch (error) {
          const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_ADMISSION_FAILED';
          throw new StoreErrorClass(code, error instanceof Error ? error.message : '回答已记下，但这项任务未能按回答接着做。');
        }
      }
      return { id: request.id, ok: true, op: request.op, result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress) };
    }
    // 暂停 (Issue #422, S76b; CTRL-001): `pausing` is recorded, and the owner stops the Run at the next unit boundary —
    // or, holding no execution of it, settles it `paused` at once.
    case 'pauseBaselineAnalysisRun': {
      const runRecordId = store.requestBaselineAnalysisPause(request.input.bookId, request.input.taskIntentId);
      if (runRecordId !== null) analysisExecution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    // 续行 (CONT-015, CONT-016): the drawer's own revalidation decides — the plan, the kept progress, the slot, the
    // credential and the network — and only then does the same Run go on, under its own authorization.
    case 'resumeBaselineAnalysisRun': {
      const runRecordId = store.continuableBaselineAnalysisRun(request.input.bookId, request.input.taskIntentId);
      const plan = await store.inspectTaskPlanWithConnection(
        { bookId: request.input.bookId, kind: 'baseline-analysis', ref: request.input.taskIntentId },
        () => analysisExecution.liveCredentialReadiness(),
        connectivity.planConnectivity,
        analysisProgress,
      );
      const reason = plan.runControl?.resume?.reason ?? '这项任务现在不能续行。';
      if (plan.runControl?.resume?.reason !== null) throw new StoreErrorClass('ANALYSIS_RESUME_BLOCKED', reason);
      try {
        analysisExecution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      } catch (error) {
        const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_ADMISSION_FAILED';
        throw new StoreErrorClass(code, error instanceof Error ? error.message : '续行未能进入调度。');
      }
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    // 取消任务 (Issue #422; CTRL-004 to CTRL-008): `cancelling` is recorded, and the owner stops the Run at the next unit
    // boundary — or, holding no execution of it, settles it at once.
    case 'cancelBaselineAnalysisRun': {
      const runRecordId = store.requestBaselineAnalysisCancel(request.input.bookId, request.input.taskIntentId);
      if (runRecordId !== null) analysisExecution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress),
      };
    }
    case 'runReconnectPreflight':
      return { id: request.id, ok: true, op: request.op, result: await connectivity.preflight() };
    // 快速开始 (Issue #421; TASK-017, TASK-020, TASK-026): after 先看计划's own preparation, the Task starts exactly as
    // 开始任务 would start it, under the rule version the editor clicked — or stays at its plan with the reason.
    case 'quickStartBaselineAnalysis': {
      const started = await store.quickStartBaselineAnalysis(
        request.input.bookId,
        request.input.taskIntentId,
        request.input.planEnvelopeDigest,
        request.input.ruleVersionId,
        { credentialReadiness: () => analysisExecution.liveCredentialReadiness(), connectivity: connectivity.planConnectivity },
      );
      if (started.dispatchRunRecordId !== null) {
        // Through the governor as 开始任务's start goes (Issue #49, S14): a quick start falls back while every place is
        // taken, so it is admitted at once, and one this launch cannot admit is blocked before dispatch with the reason.
        try {
          analysisExecution.admitOrQueue(started.dispatchRunRecordId);
        } catch (error) {
          const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_ADMISSION_FAILED';
          throw new StoreErrorClass(code, error instanceof Error ? error.message : '运行未能进入调度。');
        }
      }
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: { outcome: started.outcome, reasons: started.reasons, projection: store.inspectBaselineAnalysis(request.input.bookId, analysisProgress) },
      };
    }
    case 'setDefaultExecutionRule':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.setDefaultExecutionRule(request.input.bookId, request.input.taskIntentId, request.input.planEnvelopeDigest),
      };
    case 'inspectDefaultExecutionRules':
      return { id: request.id, ok: true, op: request.op, result: store.inspectDefaultExecutionRules() };
    // 知识库 › 审阅规范文件 (Issue #427, S79a).
    case 'inspectReviewGuidelines':
      return { id: request.id, ok: true, op: request.op, result: store.inspectReviewGuidelines() };
    case 'previewReviewGuidelineVersion':
      return { id: request.id, ok: true, op: request.op, result: await store.previewReviewGuidelineVersion(request.input.documentId, request.input.path) };
    case 'importReviewGuidelineVersion':
      return { id: request.id, ok: true, op: request.op, result: store.importReviewGuidelineVersion(request.input.previewId) };
    // 知识库 › 范例 (Issue #427, S79b).
    case 'inspectExemplars':
      return { id: request.id, ok: true, op: request.op, result: store.inspectExemplars() };
    case 'inspectKnowledgeProcedures':
      return { id: request.id, ok: true, op: request.op, result: store.inspectKnowledgeProcedures() };
    case 'inspectLibraryMaterials':
      return { id: request.id, ok: true, op: request.op, result: store.inspectLibraryMaterials() };
    case 'previewLibraryMaterial':
      return { id: request.id, ok: true, op: request.op, result: await store.previewLibraryMaterial(request.input.path) };
    case 'addLibraryMaterial':
      return { id: request.id, ok: true, op: request.op, result: await store.addLibraryMaterial(request.input) };
    case 'decideLibraryMaterial':
      return { id: request.id, ok: true, op: request.op, result: store.decideLibraryMaterial(request.input) };
    case 'inspectLearningMaterials':
      return { id: request.id, ok: true, op: request.op, result: store.inspectLearningMaterials(request.input.bookId) };
    case 'decideLearningMaterial':
      return { id: request.id, ok: true, op: request.op, result: store.decideLearningMaterial(request.input) };
    case 'inspectFeedbackHistory':
      return { id: request.id, ok: true, op: request.op, result: store.inspectFeedbackHistory() };
    case 'inspectEvaluationCalibration':
      return { id: request.id, ok: true, op: request.op, result: store.inspectEvaluationCalibration() };
    case 'recordPublicationActuals':
      return { id: request.id, ok: true, op: request.op, result: store.recordPublicationActuals(request.input) };
    case 'setEvaluationPreferences':
      return { id: request.id, ok: true, op: request.op, result: store.setEvaluationPreferences(request.input) };
    case 'inspectSeriesList':
      return { id: request.id, ok: true, op: request.op, result: store.inspectSeriesList() };
    case 'createSeries':
      return { id: request.id, ok: true, op: request.op, result: store.createSeries(request.input) };
    case 'inspectSeries':
      return { id: request.id, ok: true, op: request.op, result: store.inspectSeries(request.input.seriesId) };
    case 'previewSeriesMembershipChange':
      return { id: request.id, ok: true, op: request.op, result: store.previewSeriesMembershipChange(request.input) };
    case 'changeSeriesMembership':
      return { id: request.id, ok: true, op: request.op, result: store.changeSeriesMembership(request.input) };
    case 'inspectBookSeries':
      return { id: request.id, ok: true, op: request.op, result: store.inspectBookSeries(request.input.bookId) };
    case 'inspectDataVersion':
      return { id: request.id, ok: true, op: request.op, result: store.inspectDataVersion() };
    case 'prepareDatabaseExport':
      return { id: request.id, ok: true, op: request.op, result: await store.prepareDatabaseExport(request.input.destination) };
    case 'approveDatabaseExport':
      return { id: request.id, ok: true, op: request.op, result: await store.approveDatabaseExport(request.input.preparationId) };
    case 'inspectDatabaseExports':
      return { id: request.id, ok: true, op: request.op, result: store.inspectDatabaseExports() };
    case 'inspectScheduledBackups':
      return { id: request.id, ok: true, op: request.op, result: store.inspectScheduledBackups() };
    case 'setScheduledBackup':
      return { id: request.id, ok: true, op: request.op, result: await store.setScheduledBackup(request.input) };
    case 'proposeSeriesKnowledge':
      return { id: request.id, ok: true, op: request.op, result: store.proposeSeriesKnowledge(request.input) };
    case 'inspectSeriesKnowledgeReview':
      return { id: request.id, ok: true, op: request.op, result: store.inspectSeriesKnowledgeReview(request.input) };
    case 'editSeriesKnowledgeCandidate':
      return { id: request.id, ok: true, op: request.op, result: store.editSeriesKnowledgeCandidate(request.input) };
    case 'promoteSeriesKnowledge':
      return { id: request.id, ok: true, op: request.op, result: store.promoteSeriesKnowledge(request.input) };
    case 'inspectEvaluationProfiles':
      return { id: request.id, ok: true, op: request.op, result: store.inspectEvaluationProfiles() };
    case 'inspectEvaluation':
      return { id: request.id, ok: true, op: request.op, result: store.inspectEvaluation(request.input.bookId, request.input.recordId) };
    case 'startEvaluation':
      return { id: request.id, ok: true, op: request.op, result: store.startEvaluation(request.input.bookId) };
    case 'saveEvaluation':
      return { id: request.id, ok: true, op: request.op, result: store.saveEvaluation(request.input) };
    case 'inspectAnalysisFeedback':
      return { id: request.id, ok: true, op: request.op, result: store.inspectAnalysisFeedback(request.input.bookId, request.input.revisionId) };
    case 'recordAnalysisFeedback':
      return { id: request.id, ok: true, op: request.op, result: store.recordAnalysisFeedback(request.input) };
    case 'deactivateDefaultExecutionRule':
      return { id: request.id, ok: true, op: request.op, result: store.deactivateDefaultExecutionRule(request.input.ruleId) };
    // 审阅 (Issue #417, plan slice S69). Every answer that shows a Run reads the one owner's progress, so
    // a category executing now carries its Measured Run Progress.
    case 'inspectReviewWorkspace':
      // The page and the four filters of the results; a key the caller left out reads as none.
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectReviewWorkspace(request.input.bookId, request.input.reviewRunId, analysisProgress, {
          findingsAfterOrdinal: request.input.findingsAfterOrdinal ?? null,
          categoryId: request.input.categoryId ?? null,
          severity: request.input.severity ?? null,
          status: request.input.status ?? null,
          chapterBlockId: request.input.chapterBlockId ?? null,
        }),
      };
    case 'prepareReviewRun':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startReviewRunPreparation(request.input.bookId, request.input.categoryIds, request.input.scope, launchPolicy),
      };
    case 'authorizeReviewRun':
      // The one approval, then the drive loop at once: an approved Run nobody drives reads `partial`, so
      // the answer is read only after the loop has taken the Run and reads it `running`. While other Runs hold
      // every place of the governor, a new approval is refused before it is written (Issue #420, S74a A2; #49, S14).
      store.authorizeReviewRun(request.input.bookId, request.input.reviewRunId, request.input.planDigests, analysisExecution.busy);
      driveReviewRun(reviewRuns, request.input.reviewRunId);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectReviewWorkspace(request.input.bookId, request.input.reviewRunId, analysisProgress),
      };
    case 'continueReviewRun':
      // 继续审阅. The loop is service-internal and knows no Book, so the Run is first required to be the
      // route's Book's; the loop itself refuses a Run never approved or another Run of the Book in flight.
      store.requireReviewRunOfBook(request.input.bookId, request.input.reviewRunId);
      driveReviewRun(reviewRuns, request.input.reviewRunId);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.inspectReviewWorkspace(request.input.bookId, request.input.reviewRunId, analysisProgress),
      };
    case 'recordReviewFindingDisposition':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.recordReviewFindingDisposition(
          request.input.bookId,
          request.input.reviewRunId,
          request.input.findingId,
          request.input.reason,
          analysisProgress,
        ),
      };
    case 'generateReviewReport':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.generateReviewReport(request.input.bookId, request.input.reviewRunId, analysisProgress),
      };
    case 'inspectReviewFindingOfMark': {
      // A mark of another Book answers exactly as a mark no Review Run produced.
      const found = store.reviewFindingOfMark(request.input.markId);
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: found !== null && found.bookId === request.input.bookId ? found : null,
      };
    }
    case 'listBooks':
      return { id: request.id, ok: true, op: request.op, result: store.listBooks(request.input.after, request.input.filter ?? null) };
    case 'updateBookPeople':
      return { id: request.id, ok: true, op: request.op, result: store.updateBookPeople(request.input) };
    case 'prepareNewBookReview':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.prepareNewBookReview(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.target,
          request.input.acceptDegradation,
          request.input.textBoxDisposition,
        ),
      };
    case 'commitNewBookImport':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.commitNewBookImport(request.input, {
          interruptAfterAttempt: importControl === 'before-commit' || importControl === 'uncertain-reconciliation',
        }),
      };
    case 'prepareSourceImportReview':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.prepareSourceImportReview(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.target,
        ),
      };
    case 'commitSourceImport':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.commitSourceImport(request.input, {
          interruptAfterAttempt: importControl === 'before-commit' || importControl === 'uncertain-reconciliation',
        }),
      };
    case 'prepareManuscriptReimport':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startReimportPreparation(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.target,
        ),
      };
    case 'getReimportMappingPage':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getReimportMappingPage(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.after,
        ),
      };
    case 'getReimportLineageSourceVersionPage':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getReimportLineageSourceVersionPage(request.input.bookId, request.input.after),
      };
    case 'acceptReimportDegradation':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.acceptReimportDegradation(request.input.draftId, request.input.expectedDraftVersion),
      };
    case 'resolveReimportMapping':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startReimportResolution(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.groupId,
          request.input.verb,
        ),
      };
    case 'resolveAcknowledgedManuscriptReimportReplay':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.resolveAcknowledgedManuscriptReimportReplay(request.input),
      };
    case 'commitManuscriptReimport':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await jobs.startReimportCommit(request.input, {
          interruptAfterAttempt: importControl === 'before-commit' || importControl === 'uncertain-reconciliation',
          interruptAfterCommit: importControl === 'after-commit-before-response',
          legacyResultWithoutPresentation: importControl === 'legacy-result-json-without-receipt',
        }),
      };
    case 'acknowledgeImportCompletion':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.acknowledgeImportCompletion(request.input.commitId),
      };
    case 'getManuscriptWindow':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getManuscriptWindow(request.input.manuscriptId, request.input.branchId, request.input.cursor),
      };
    case 'flushJournalEdit':
      return { id: request.id, ok: true, op: request.op, result: store.flushJournalEdit(request.input) };
    case 'createEditorialMark':
      return { id: request.id, ok: true, op: request.op, result: store.createEditorialMark(request.input) };
    case 'getEditorialMarkCard':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getEditorialMarkCard(request.input.manuscriptId, request.input.branchId, request.input.markId),
      };
    case 'updateEditorialMark':
      return { id: request.id, ok: true, op: request.op, result: store.updateEditorialMark(request.input) };
    case 'recordChangeSuggestionDecision':
      return { id: request.id, ok: true, op: request.op, result: store.recordChangeSuggestionDecision(request.input) };
    case 'recordProposalDecisionReason':
      return { id: request.id, ok: true, op: request.op, result: store.recordProposalDecisionReason(request.input) };
    case 'recordProposalDecisionFeedback':
      return { id: request.id, ok: true, op: request.op, result: store.recordProposalDecisionFeedback(request.input) };
    case 'applyChangeSuggestion':
      return { id: request.id, ok: true, op: request.op, result: store.applyChangeSuggestion(request.input) };
    case 'applyChangeSuggestionBatch':
      return { id: request.id, ok: true, op: request.op, result: store.applyChangeSuggestionBatch(request.input) };
    case 'reverseAppliedChangeSuggestion':
      return { id: request.id, ok: true, op: request.op, result: store.reverseAppliedChangeSuggestion(request.input) };
    case 'getManuscriptRail':
      return { id: request.id, ok: true, op: request.op, result: store.getManuscriptRail(request.input.manuscriptId, request.input.branchId) };
    case 'getManuscriptApplyOutcome':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getManuscriptApplyOutcome(request.input.manuscriptId, request.input.branchId, request.input.clientEffectId),
      };
    // 稿件冲突 (Issue #57, plan slice S22): one read and two records, none of which writes the manuscript.
    case 'inspectProposalConflict':
      return { id: request.id, ok: true, op: request.op, result: store.inspectProposalConflict(request.input) };
    case 'saveProposalConflictDraft':
      return { id: request.id, ok: true, op: request.op, result: store.saveProposalConflictDraft(request.input) };
    case 'resolveProposalConflict':
      return { id: request.id, ok: true, op: request.op, result: store.resolveProposalConflict(request.input) };
    case 'recordManuscriptEntryPosition':
      store.recordManuscriptEntryPosition(
        request.input.manuscriptId,
        request.input.branchId,
        request.input.blockId,
        request.input.grapheme,
      );
      return { id: request.id, ok: true, op: request.op, result: { state: 'recorded' } };
    case 'listPriorWork':
      return { id: request.id, ok: true, op: request.op, result: store.listPriorWork() };
    case 'getManuscriptWindowAt':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getManuscriptWindowAt(request.input.manuscriptId, request.input.branchId, request.input.target),
      };
    case 'getOutline':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getOutline(request.input.manuscriptId, request.input.branchId, request.input.cursor),
      };
    case 'startSearch':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: jobs.startSearch(request.input.manuscriptId, request.input.branchId, request.input.query),
      };
    case 'pollServiceJob':
      return { id: request.id, ok: true, op: request.op, result: jobs.poll(request.input.jobId) };
    case 'cancelServiceJob':
      return { id: request.id, ok: true, op: request.op, result: jobs.cancel(request.input.jobId) };
    case 'getSearchResults':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getSearchResults(request.input.searchId, request.input.cursor),
      };
    case 'prepareReplacement':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.prepareReplacement(
          request.input.searchId,
          request.input.replacement,
          request.input.excludedMatchIds,
        ),
      };
    case 'freezeReplacement':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.freezeReplacement(request.input.previewId, request.input.excludedMatchIds),
      };
    case 'dismissReplacementPreview':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.dismissReplacementPreview(request.input.previewId),
      };
    case 'startReplacementCommit':
      return { id: request.id, ok: true, op: request.op, result: jobs.startReplacement(request.input.previewId) };
    case 'commitReplacement':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.commitReplacement(request.input.previewId),
      };
    case 'saveMilestone':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.saveMilestone(
          request.input.manuscriptId,
          request.input.branchId,
          request.input.label,
          request.input.purposeKind,
          request.input.purpose,
          request.input.note,
        ),
      };
    // ⑥ 交付物 · 发稿 (Issue #414, plan slice S65): a Book-scoped read and one deterministic, local command.
    case 'inspectDeliverables':
      return { id: request.id, ok: true, op: request.op, result: store.inspectDeliverables(request.input.bookId) };
    case 'designatePublicationVersion':
      return { id: request.id, ok: true, op: request.op, result: store.designatePublicationVersion(request.input) };
    case 'inspectProductionDocuments':
      return { id: request.id, ok: true, op: request.op, result: store.inspectProductionDocuments(request.input.bookId) };
    case 'inspectBookDeliveryPackage':
      return { id: request.id, ok: true, op: request.op, result: store.inspectBookDeliveryPackage(request.input.bookId) };
    case 'prepareBookDeliveryPackage':
      return { id: request.id, ok: true, op: request.op, result: store.prepareBookDeliveryPackage(request.input) };
    // Its export (Issue #416, S67b): local only, and only under this launch's verified External Export Policy, as ④ 导出.
    case 'reviewBookDeliveryPackageExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.reviewBookDeliveryPackageExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'prepareBookDeliveryPackageExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.prepareBookDeliveryPackageExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'approveBookDeliveryPackageExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.approveBookDeliveryPackageExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'inspectMaintenanceCase':
      return { id: request.id, ok: true, op: request.op, result: store.inspectMaintenanceCase(request.input) };
    case 'recordMaintenanceCase':
      return { id: request.id, ok: true, op: request.op, result: store.recordMaintenanceCase(request.input) };
    case 'appendMaintenanceCaseRevision':
      return { id: request.id, ok: true, op: request.op, result: store.appendMaintenanceCaseRevision(request.input) };
    case 'saveMaintenanceErrata':
      return { id: request.id, ok: true, op: request.op, result: store.saveMaintenanceErrata(request.input) };
    case 'createProductionDocument':
      return { id: request.id, ok: true, op: request.op, result: await store.createProductionDocument(request.input) };
    case 'decideProductionDocumentType':
      return { id: request.id, ok: true, op: request.op, result: store.decideProductionDocumentType(request.input) };
    case 'saveProductionDocumentVersion':
      return { id: request.id, ok: true, op: request.op, result: await store.saveProductionDocumentVersion(request.input) };
    case 'recordProductionDocumentDelivery':
      return { id: request.id, ok: true, op: request.op, result: await store.recordProductionDocumentDelivery(request.input) };
    // A document's workflow phase (Issue #415, S66c): one deterministic move.
    case 'transitionProductionDocumentPhase':
      return { id: request.id, ok: true, op: request.op, result: store.transitionProductionDocumentPhase(request.input) };
    // 待我处理 (Issue #424, plan slice S78): a read across every Book. The one owner's progress reader and its
    // slot say which Run is in flight, exactly as the analysis inspections read them; nothing is written.
    case 'inspectGlobalAttention':
      return {
        id: request.id, ok: true, op: request.op,
        result: await readGlobalAttention(store, analysisProgress, analysisExecution.busy, () => connectivity.waitingFor()),
      };
    // ① 任务面 (Issue #423, plan slice S77a): the Book's Tasks, read as 待我处理 reads them.
    case 'inspectBookTasks':
      return {
        id: request.id, ok: true, op: request.op,
        result: await readBookTasks(store, request.input.bookId, analysisProgress, () => connectivity.waitingFor()),
      };
    // ④ 导出 (Issue #413, plan slice S64): local only, and only under this launch's verified External Export Policy.
    case 'reviewManuscriptExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.reviewManuscriptExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'prepareManuscriptExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.prepareManuscriptExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'approveManuscriptExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.approveManuscriptExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'inspectManuscriptExportReceipt':
      return { id: request.id, ok: true, op: request.op, result: store.inspectManuscriptExportReceipt(request.input) };
    case 'stageManuscriptExport':
      return {
        id: request.id, ok: true, op: request.op,
        result: await store.stageManuscriptExport(request.input, launchPolicy.externalExport.currentExportEffectAvailable),
      };
    case 'undoManuscript':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.undoManuscript(
          request.input.manuscriptId,
          request.input.branchId,
          request.input.expectedWorkingDigest,
        ),
      };
    case 'redoManuscript':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.redoManuscript(
          request.input.manuscriptId,
          request.input.branchId,
          request.input.expectedWorkingDigest,
        ),
      };
    case 'shutdown':
      store.markCleanShutdown();
      return { id: request.id, ok: true, op: request.op, result: { state: 'stopping' } };
  }
}

function parseArguments(argv: string[]): {
  dataRoot: string;
  parentPid: number;
  launchForm: TrustedLaunchForm;
  importControl: J01ImportControl | undefined;
  foregroundExecutionControl: J03ForegroundExecutionControl | undefined;
  recoveryControl: J08RecoveryControl | undefined;
  modelAdapterControl: J04ModelAdapterControl | undefined;
  connectivityPath: string | undefined;
  unitHoldPath: string | undefined;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !key ||
      !value ||
      values.has(key) ||
      (key !== '--data-root' && key !== '--parent-pid' && key !== '--j01-import-control' &&
        key !== '--j03-foreground-execution-control' && key !== '--j08-recovery-control' &&
        key !== '--j04-model-adapter' && key !== '--j04-connectivity-path' && key !== '--j10-unit-hold-path' &&
        key !== TRUSTED_SCOPE_ARGUMENT && key !== RUN_BUDGET_CEILING_ARGUMENT &&
        key !== PROVIDER_CACHE_ROOT_ARGUMENT)
    ) {
      throw new ProtocolError();
    }
    values.set(key, value);
  }
  // The trusted launch form (ADR 0065): re-parsed here exactly as main parsed it; never read from the environment.
  const launchForm = parseTrustedLaunchForm({
    trustedOperationalScope: values.get(TRUSTED_SCOPE_ARGUMENT),
    runBudgetCeiling: values.get(RUN_BUDGET_CEILING_ARGUMENT),
    providerCacheRoot: values.get(PROVIDER_CACHE_ROOT_ARGUMENT),
  });
  if (launchForm === null || (launchForm.providerCacheRoot !== null && !isAbsolute(launchForm.providerCacheRoot))) throw new ProtocolError();
  const dataRoot = values.get('--data-root');
  const parentPidValue = values.get('--parent-pid');
  const parentPid = Number(parentPidValue);
  const importControlValue = values.get('--j01-import-control');
  const importControl =
    importControlValue === 'before-commit' ||
    importControlValue === 'after-commit-before-response' ||
    importControlValue === 'uncertain-reconciliation' ||
    importControlValue === 'legacy-result-json-without-receipt' ||
    importControlValue === 'legacy-reviewed-v2' ||
    importControlValue === 'tamper-reimport-proof-before-validation' ||
    importControlValue === 'abandon-object-delete-failure' ||
    importControlValue === 'after-abandon-object-delete-before-finalize'
      ? importControlValue
      : undefined;
  const foregroundExecutionControlValue = values.get('--j03-foreground-execution-control');
  const foregroundExecutionControl =
    foregroundExecutionControlValue === 'interrupt-before-foreground-boundary-response'
      ? foregroundExecutionControlValue
      : undefined;
  const recoveryControlValue = values.get('--j08-recovery-control');
  const recoveryControl = recoveryControlValue === 'interrupt-after-journal-ack'
    ? recoveryControlValue
    : undefined;
  const modelAdapterControlValue = values.get('--j04-model-adapter');
  const modelAdapterControl = modelAdapterControlValue !== undefined && J04_MODEL_ADAPTER_CONTROL_PATTERN.test(modelAdapterControlValue)
    ? modelAdapterControlValue
    : undefined;
  // J-04's connectivity control (Issue #502): a file the Journey writes, read at each reading. It rides beside the
  // model adapter — it simulates only whether that route's network is there — so it is exclusive of nothing.
  const connectivityPath = values.get('--j04-connectivity-path');
  // J-10's unit hold (Issue #422): a file the Journey writes, read before a unit settles; beside the adapter too. J-16
  // holds a Run in its 任务 panel with it (Issue #423), and J-09 several Books' Runs at once (Issue #49).
  const unitHoldPath = values.get('--j10-unit-hold-path');
  if (
    !dataRoot ||
    !isAbsolute(dataRoot) ||
    !Number.isSafeInteger(parentPid) ||
    parentPid <= 0 ||
    process.ppid !== parentPid ||
    (importControlValue !== undefined &&
      (importControl === undefined || process.env.AI7_E2E_JOURNEY !== 'J-01')) ||
    (foregroundExecutionControlValue !== undefined &&
      (foregroundExecutionControl === undefined || process.env.AI7_E2E_JOURNEY !== 'J-03')) ||
    (recoveryControlValue !== undefined &&
      (recoveryControl === undefined || process.env.AI7_E2E_JOURNEY !== 'J-08')) ||
    // The model adapter binds a Journey whose Runs execute: J-04's analysis, J-09's 运行中 and 最近完成, J-10's
    // cancelled Run (Issue #422), J-16's 任务 panel (Issue #423) and J-11's 分析反馈 (Issue #94).
    (modelAdapterControlValue !== undefined &&
      (modelAdapterControl === undefined ||
        (process.env.AI7_E2E_JOURNEY !== 'J-04' && process.env.AI7_E2E_JOURNEY !== 'J-09' && process.env.AI7_E2E_JOURNEY !== 'J-10' &&
          process.env.AI7_E2E_JOURNEY !== 'J-16' && process.env.AI7_E2E_JOURNEY !== 'J-11'))) ||
    (connectivityPath !== undefined && (process.env.AI7_E2E_JOURNEY !== 'J-04' || !isAbsolute(connectivityPath))) ||
    (unitHoldPath !== undefined && ((process.env.AI7_E2E_JOURNEY !== 'J-09' && process.env.AI7_E2E_JOURNEY !== 'J-10' && process.env.AI7_E2E_JOURNEY !== 'J-16') ||
      !isAbsolute(unitHoldPath))) ||
    [importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl].filter(Boolean).length > 1 ||
    // developer-live is a human-attended developer-host launch: never a Journey launch, never with a Journey control.
    (launchForm.trustedOperationalScope !== 'development-ci' &&
      (process.env.AI7_E2E_JOURNEY !== undefined || importControlValue !== undefined || foregroundExecutionControlValue !== undefined ||
        recoveryControlValue !== undefined || modelAdapterControlValue !== undefined || connectivityPath !== undefined ||
        unitHoldPath !== undefined))
  ) {
    throw new ProtocolError();
  }
  return { dataRoot, parentPid, launchForm, importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl, connectivityPath, unitHoldPath };
}

function parentIsAlive(parentPid: number): boolean {
  if (process.ppid !== parentPid) return false;
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

let StoreErrorClass: typeof import('./store.js').StoreError;

/** How often Reconnect Preflight looks again while the service runs (Issue #502): a local read, then nothing, when no Run waits. */
const RECONNECT_PREFLIGHT_INTERVAL_MS = 15_000;

async function run(): Promise<void> {
  // The native `fetch` is captured before the denial replaces the global; only the developer-live
  // `opencode-go` transport ever receives it, and only through the adapter's transmit step.
  const nativeFetch: typeof fetch = globalThis.fetch;
  const { dataRoot, parentPid, launchForm, importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl, connectivityPath, unitHoldPath } =
    parseArguments(process.argv.slice(2));
  if (launchForm.trustedOperationalScope === 'developer-live') {
    // The single-host allowance (settlement l): armed before the denial so its gates admit exactly the
    // policy's endpoint host and port; Node's own fetch resolves `tls.connect` and `dns.lookup` at call time.
    const endpoint = new URL(DEVELOPER_LIVE_POLICY_BINDING.endpoint);
    armSingleHostAllowance({ host: endpoint.hostname, port: endpoint.port === '' ? 443 : Number(endpoint.port) });
  }
  installNodeNetworkDenial();
  const [
    { EditorialStore, StoreError, StoreFatalError },
    { mountDormantHarness },
    { CooperativeJobOwner },
    { resolveSourceCheckoutLaunchPolicy },
    { BaselineAnalysisExecutionOwner },
    { loadModelFixture },
    { createKeyringSecretResolver },
    { ReviewRunDriver },
  ] =
    await Promise.all([
      import('./store.js'),
      import('./runtime.js'),
      import('./cooperative-jobs.js'),
      import('./launch-policy.js'),
      import('./analysis/execution.js'),
      import('./provider/model-fixture.js'),
      import('./provider/keyring-secret-resolver.js'),
      import('./review/review-run-driver.js'),
    ]);
  StoreErrorClass = StoreError;
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    process.stdin.destroy();
  };
  const parentLease = setInterval(() => {
    if (!parentIsAlive(parentPid)) stop();
  }, 1_000);
  parentLease.unref();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  let store: EditorialStore | undefined;
  let harness: DormantHarnessRuntime | undefined;
  let jobs: CooperativeJobOwner | undefined;
  let analysisExecution: BaselineAnalysisExecutionOwner | undefined;
  let reviewRuns: ReviewRunDriver | undefined;
  let preflightTimer: NodeJS.Timeout | undefined;
  let backupTimer: NodeJS.Timeout | undefined;
  try {
    const codeRoot = fileURLToPath(new URL('../', import.meta.url));
    const launchPolicy = await resolveSourceCheckoutLaunchPolicy(codeRoot, launchForm.trustedOperationalScope);
    // The developer-live runtime exists only when the requested scope actually verified; a denied policy
    // keeps the product provider-free exactly like development-ci, and the ceiling is never `unset` under
    // v5. The captured `fetch` travels with the launch facts and reaches no other owner.
    const developerLive: DeveloperLiveRuntime | null = launchPolicy.operationalScope === 'developer-live'
      ? { launch: resolveDeveloperLiveLaunch(launchForm, resolve(codeRoot, '..')), nativeFetch }
      : null;
    // The J-04-only control resolves the hand-written synthetic fixture before the store opens, so the
    // frozen plan can pin the exact fixture identity, lineage, and digest; every other launch binds no route.
    // Fixtures are test inputs that never enter the built carrier, so they resolve from the source checkout
    // that contains `dist/`, never from the carrier itself.
    const fixture = modelAdapterControl === undefined
      ? null
      : await loadModelFixture(resolve(codeRoot, '..', 'tests', 'fixtures', 'model'), modelAdapterControl);
    // The software version the store records beside its Data Version (Issue #433, S85a) is the package the product ships
    // in: the carrier holds no package manifest, so it is read from the source checkout that contains `dist/`.
    const softwareVersion = await readSoftwareVersion(resolve(codeRoot, '..'));
    store = await EditorialStore.open(dataRoot, codeRoot, {
      softwareVersion,
      induceUnprovableReconciliation: importControl === 'uncertain-reconciliation',
      persistLegacyReviewedDraft: importControl === 'legacy-reviewed-v2',
      induceReimportProofTamper: importControl === 'tamper-reimport-proof-before-validation',
      induceAbandonObjectRemovalFailure: importControl === 'abandon-object-delete-failure',
      interruptAfterAbandonObjectRemoval: importControl === 'after-abandon-object-delete-before-finalize',
      baselineAnalysisRoute: fixture === null
        ? null
        : { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
    });
    // The ledger learns the trusted launch once, before any frame is served, so every plan it freezes
    // names the binding this launch actually bound rather than re-deriving one at dispatch.
    const launch: LaunchBinding = developerLive === null
      ? { operationalScope: 'development-ci', live: null }
      : {
          operationalScope: 'developer-live',
          live: {
            route: DEVELOPER_LIVE_POLICY_BINDING.route,
            model: DEVELOPER_LIVE_POLICY_BINDING.model,
            endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
            credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
            credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
            runBudgetCeiling: developerLive.launch.runBudgetCeiling,
          },
        };
    store.baselineAnalysisLedger.bindLaunch(launch);
    // 事实核查 is a Review Category executed on the factual kind's own ledger (Issue #417), which the one
    // owner executes only under the launch it froze its plans for. The review-category ledgers are made
    // when first asked for and take the baseline ledger's binding then, which is this one.
    store.factualReviewLedger.bindLaunch(launch);
    harness = await mountDormantHarness();
    jobs = new CooperativeJobOwner(store);
    analysisExecution = new BaselineAnalysisExecutionOwner({
      ledger: store.baselineAnalysisLedger,
      launchPolicy,
      fixture,
      secretResolver: createKeyringSecretResolver(),
      developerLive,
      unitHold: unitHoldPath === undefined ? null : controlledUnitHold(unitHoldPath),
    });
    // Startup reconciliation (Issue #422, S76b; CONT-014): a baseline Run this service's predecessor left under way has
    // nothing running it now. It settles 已暂停 or 任务已中断 · 可续行 before any request is read; one left cancelling is
    // finished by the owner, sending nothing.
    const reconciled = store.reconcileStoppedBaselineAnalysisRuns();
    for (const runRecordId of reconciled.cancelling) {
      try {
        analysisExecution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      } catch {
        // The Run stays 正在取消 and is offered 取消任务 again, which settles it.
      }
    }
    // A Run the editor had answered before AI7 closed goes on now, one after another through the slot (Issue #422, S76d).
    for (const runRecordId of reconciled.answered) {
      try {
        analysisExecution.continueAnswered(runRecordId, store.baselineAnalysisLedger);
      } catch {
        // It stays 任务等待你的说明 with its answer; the next launch takes it on again.
      }
    }
    // Starts the governor had not admitted when AI7 closed (Issue #49, S14; CONC-007) wait again, in their order.
    for (const runRecordId of reconciled.queued) {
      try {
        analysisExecution.admitOrQueue(runRecordId, store.baselineAnalysisLedger);
      } catch {
        // One this launch cannot admit is blocked before dispatch with the reason; nothing of it ran.
      }
    }
    // A Review Run's categories take a place of the one owner's governor one after another.
    reviewRuns = new ReviewRunDriver(store.reviewRunDriveSteps, analysisExecution);
    // Connectivity Wait (Issue #502). The reading is the device's own unless J-04's control names a file; the
    // live route reaches its model over the network, and so — under that control only — does J-04's route.
    const owner = analysisExecution;
    const openStore = store;
    const reading = connectivityPath === undefined ? hostConnectivity : () => controlledConnectivity(connectivityPath);
    const reachesNetwork = (routeKind: string): boolean =>
      routeKind === DEVELOPER_LIVE_POLICY_BINDING.route || (connectivityPath !== undefined && routeKind === LOCAL_DETERMINISTIC_ROUTE);
    let preflightInFlight: Promise<ReconnectPreflightProjection> | null = null;
    const connectivity: ConnectivityContext = {
      planConnectivity: { reading, reachesNetwork, slotBusy: () => owner.busy, carriesStoppedRun: (runRecordId) => owner.carriesStoppedRun(runRecordId, openStore.baselineAnalysisLedger) },
      // A waiting Run's route reaches its model over the network, or it would not wait: offline first, then a missing
      // credential, then the slot — the order the drawer reads them in.
      waitingFor: async () => reading() === 'offline'
        ? 'network'
        : (await owner.liveCredentialReadiness()) === 'missing' ? 'connection' : owner.busy ? 'slot' : 'admitting',
      // One at a time: a look already under way answers a second request for one.
      preflight: () => {
        preflightInFlight ??= reconnectPreflight({
          waitingRuns: () => openStore.waitingBaselineAnalysisRuns(null),
          stillWaiting: (runRecordId) => openStore.baselineAnalysisRunWaits(runRecordId),
          drift: (runRecordId) => openStore.baselineAnalysisPreflightDrift(runRecordId),
          block: (runRecordId, reasons, cause) => openStore.blockWaitingBaselineAnalysisRun(runRecordId, reasons, cause),
          reachesNetwork: developerLive !== null || (connectivityPath !== undefined && fixture !== null),
          connectivity: reading,
          credentialReadiness: () => owner.liveCredentialReadiness(),
          slotBusy: () => owner.busy,
          admit: (runRecordId) => owner.admitAndDispatch(runRecordId, openStore.baselineAnalysisLedger, { afterReconnectPreflight: true }),
        }).finally(() => {
          preflightInFlight = null;
        });
        return preflightInFlight;
      },
    };
    // OFF-013: a Run left waiting when AI7 last closed is looked at once the service is active again, and then
    // periodically while it runs — never by a launch of its own, which connectivity returning cannot cause.
    void connectivity.preflight().catch(() => undefined);
    preflightTimer = setInterval(() => void connectivity.preflight().catch(() => undefined), RECONNECT_PREFLIGHT_INTERVAL_MS);
    preflightTimer.unref();
    // 定期自动备份 (Issue #434, S86b): asked at start, then hourly while the service runs; a backup is made only when one is due.
    void openStore.runScheduledBackupIfDue().catch(() => undefined);
    backupTimer = setInterval(() => void openStore.runScheduledBackupIfDue().catch(() => undefined), BACKUP_CHECK_INTERVAL_MS);
    backupTimer.unref();
    for await (const frame of readFrames()) {
      let request: ServiceRequest;
      try {
        request = decodeRequest(frame);
      } catch (error) {
        const requestId = error instanceof ProtocolError ? error.requestId : 'invalid';
        await writeResponse(failureResponse(requestId, error, StoreError));
        continue;
      }
      let response: ServiceResponse;
      try {
        response = await dispatch(store, harness, jobs, analysisExecution, reviewRuns, request, importControl, launchPolicy, connectivity);
      } catch (error) {
        if (error instanceof StoreFatalError) {
          stop();
          throw error;
        }
        response = failureResponse(request.id, error, StoreError);
      }
      if ((request.op === 'commitNewBookImport' || request.op === 'commitSourceImport') &&
          importControl === 'after-commit-before-response') {
        stop();
        throw new Error('E2E interruption after committed import and before response.');
      }
      if (request.op === 'commitSourceImport' && response.ok &&
          importControl === 'legacy-result-json-without-receipt') {
        store.rewriteCommittedResultWithoutPresentationForTest(request.input.commitId);
        stop();
        throw new Error('E2E interruption after legacy source result_json rewrite.');
      }
      if (request.op === 'inspectForegroundExecutionBoundary' && response.ok &&
          foregroundExecutionControl === 'interrupt-before-foreground-boundary-response') {
        stop();
        throw new Error('E2E interruption before foreground boundary response.');
      }
      await writeResponse(response);
      if (request.op === 'flushJournalEdit' && response.ok && recoveryControl === 'interrupt-after-journal-ack') {
        stop();
        throw new Error('E2E interruption after acknowledged journal edit.');
      }
      if (request.op === 'shutdown') break;
    }
  } finally {
    clearInterval(parentLease);
    if (preflightTimer !== undefined) clearInterval(preflightTimer);
    if (backupTimer !== undefined) clearInterval(backupTimer);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    try {
      jobs?.dispose();
      // The Review Run loop stops first and starts no further category; the owner then interrupts the
      // Run in flight, and the loop records what that Run came to before the store closes.
      const reviewRunsStopped = reviewRuns?.dispose();
      await analysisExecution?.dispose();
      await reviewRunsStopped;
      await harness?.dispose();
    } finally {
      store?.close();
    }
  }
}

await run().catch(() => {
  process.exitCode = 1;
});
