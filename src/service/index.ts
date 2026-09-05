import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_FRAME_BYTES,
  type J01ImportControl,
  type J03ForegroundExecutionControl,
  type J08RecoveryControl,
  type LaunchPolicyProjection,
  type ServiceFailureResponse,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceSuccessResponse,
} from '../shared/protocol.js';
import { installNodeNetworkDenial } from '../shared/network-denial.js';
import { decodeRequest, isSafeInteger, ProtocolError } from './request-frames.js';
import type { DormantHarnessRuntime } from './runtime.js';
import type { EditorialStore } from './store.js';
import type { CooperativeJobOwner } from './cooperative-jobs.js';

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

async function dispatch(
  store: EditorialStore,
  harness: DormantHarnessRuntime,
  jobs: CooperativeJobOwner,
  request: ServiceRequest,
  importControl: J01ImportControl | undefined,
  launchPolicy: LaunchPolicyProjection,
): Promise<ServiceSuccessResponse> {
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
    case 'stageSelectedDocx':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: await store.stageSelectedDocx(request.input.selectionToken, request.input.selectedPath),
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
    case 'listBooks':
      return { id: request.id, ok: true, op: request.op, result: store.listBooks(request.input.after) };
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
    case 'getReimportIdentityCandidatePage':
      return {
        id: request.id,
        ok: true,
        op: request.op,
        result: store.getReimportIdentityCandidatePage(
          request.input.draftId,
          request.input.expectedDraftVersion,
          request.input.mappingId,
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
          request.input.mappingId,
          request.input.resolution,
          request.input.currentBlockId,
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
          request.input.purpose,
          request.input.note,
        ),
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
  importControl: J01ImportControl | undefined;
  foregroundExecutionControl: J03ForegroundExecutionControl | undefined;
  recoveryControl: J08RecoveryControl | undefined;
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
        key !== '--j03-foreground-execution-control' && key !== '--j08-recovery-control')
    ) {
      throw new ProtocolError();
    }
    values.set(key, value);
  }
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
    [importControl, foregroundExecutionControl, recoveryControl].filter(Boolean).length > 1
  ) {
    throw new ProtocolError();
  }
  return { dataRoot, parentPid, importControl, foregroundExecutionControl, recoveryControl };
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

async function run(): Promise<void> {
  installNodeNetworkDenial();
  const { dataRoot, parentPid, importControl, foregroundExecutionControl, recoveryControl } =
    parseArguments(process.argv.slice(2));
  const [
    { EditorialStore, StoreError, StoreFatalError },
    { mountDormantHarness },
    { CooperativeJobOwner },
    { resolveSourceCheckoutLaunchPolicy },
  ] =
    await Promise.all([
      import('./store.js'),
      import('./runtime.js'),
      import('./cooperative-jobs.js'),
      import('./launch-policy.js'),
    ]);
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
  try {
    const codeRoot = fileURLToPath(new URL('../', import.meta.url));
    const launchPolicy = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    store = await EditorialStore.open(dataRoot, codeRoot, {
      induceUnprovableReconciliation: importControl === 'uncertain-reconciliation',
      persistLegacyReviewedDraft: importControl === 'legacy-reviewed-v2',
      induceReimportProofTamper: importControl === 'tamper-reimport-proof-before-validation',
      induceAbandonObjectRemovalFailure: importControl === 'abandon-object-delete-failure',
      interruptAfterAbandonObjectRemoval: importControl === 'after-abandon-object-delete-before-finalize',
    });
    harness = await mountDormantHarness();
    jobs = new CooperativeJobOwner(store);
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
        response = await dispatch(store, harness, jobs, request, importControl, launchPolicy);
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
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    try {
      jobs?.dispose();
      await harness?.dispose();
    } finally {
      store?.close();
    }
  }
}

await run().catch(() => {
  process.exitCode = 1;
});
