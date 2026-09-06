import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  MAIN_EVENTS,
  type CommitNewBookRendererInput,
  type CommitManuscriptReimportRendererInput,
  type CommitSourceImportRendererInput,
  type PickerReselectResult,
  type PickerStageResult,
  type RendererApi,
  type RendererCallResult,
  type ServiceOperationMap,
} from '../shared/protocol.js';

function markServiceInterrupted(): void {
  const mark = (): void => {
    document.documentElement.dataset['ai7ServiceState'] = 'interrupted';
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

function markCloseBlocked(): void {
  const mark = (): void => {
    document.documentElement.dataset['ai7CloseState'] = 'blocked';
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

function markProductReady(): void {
  const mark = (): void => {
    document.documentElement.dataset['ai7ProductReady'] = 'true';
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

let bookWorkbenchRouteGeneration = 0;
function markBookWorkbenchRouteChanged(): void {
  const mark = (): void => {
    bookWorkbenchRouteGeneration += 1;
    document.documentElement.dataset['ai7BookWorkbenchRouteGeneration'] = String(bookWorkbenchRouteGeneration);
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

function reportCloseRisk(): void {
  ipcRenderer.send(MAIN_EVENTS.closeRiskChanged, document.documentElement.dataset['ai7CloseRisk'] === 'true');
}

type J02ObservedOperation =
  | 'startSearch'
  | 'startReplacementCommit'
  | 'cancelServiceJob'
  | 'flushJournalEdit'
  | 'commitReplacement'
  | 'saveMilestone'
  | 'undoManuscript'
  | 'redoManuscript';

interface J02IpcEvent {
  ordinal: number;
  operation: J02ObservedOperation;
  phase: 'invoke' | 'result' | 'error';
  jobId?: string;
  kind?: string;
  state?: string;
}

const J02_OBSERVED_CHANNELS = new Map<string, J02ObservedOperation>([
  [IPC_CHANNELS.startSearch, 'startSearch'],
  [IPC_CHANNELS.startReplacementCommit, 'startReplacementCommit'],
  [IPC_CHANNELS.cancelServiceJob, 'cancelServiceJob'],
  [IPC_CHANNELS.flushJournalEdit, 'flushJournalEdit'],
  [IPC_CHANNELS.commitReplacement, 'commitReplacement'],
  [IPC_CHANNELS.saveMilestone, 'saveMilestone'],
  [IPC_CHANNELS.undoManuscript, 'undoManuscript'],
  [IPC_CHANNELS.redoManuscript, 'redoManuscript'],
]);
const j02IpcEvents: J02IpcEvent[] = [];
const j02IpcCounts = new Map<J02ObservedOperation, number>();
let j02IpcOrdinal = 0;
const j02ObservationEnabled = process.env['AI7_E2E_JOURNEY'] === 'J-02';

function jobTruth(value: unknown): Pick<J02IpcEvent, 'jobId' | 'kind' | 'state'> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record['jobId'] === 'string' ? { jobId: record['jobId'] } : {}),
    ...(typeof record['kind'] === 'string' ? { kind: record['kind'] } : {}),
    ...(typeof record['state'] === 'string' ? { state: record['state'] } : {}),
  };
}

function observeJ02Ipc(
  operation: J02ObservedOperation,
  phase: J02IpcEvent['phase'],
  value: unknown,
): void {
  if (!j02ObservationEnabled) return;
  const inputJobId = value !== null && typeof value === 'object' && !Array.isArray(value) &&
      typeof (value as Record<string, unknown>)['jobId'] === 'string'
    ? String((value as Record<string, unknown>)['jobId'])
    : undefined;
  j02IpcEvents.push({
    ordinal: ++j02IpcOrdinal,
    operation,
    phase,
    ...(inputJobId === undefined ? {} : { jobId: inputJobId }),
    ...jobTruth(value),
  });
  if (j02IpcEvents.length > 128) j02IpcEvents.splice(0, j02IpcEvents.length - 128);
}

if (j02ObservationEnabled) {
  const observation = Object.freeze({
    snapshot: () => ({
      counts: Object.fromEntries(j02IpcCounts),
      events: structuredClone(j02IpcEvents),
    }),
  });
  Object.defineProperty(globalThis, '__ai7J02IpcObservation', {
    value: observation,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

ipcRenderer.on(MAIN_EVENTS.serviceInterrupted, markServiceInterrupted);
ipcRenderer.on(MAIN_EVENTS.closeBlocked, markCloseBlocked);
ipcRenderer.on(MAIN_EVENTS.productReady, markProductReady);
ipcRenderer.on(MAIN_EVENTS.bookWorkbenchRouteChanged, markBookWorkbenchRouteChanged);

const closeRiskObserver = new MutationObserver(reportCloseRisk);
const observeCloseRisk = (): void => {
  closeRiskObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-ai7-close-risk'],
  });
  reportCloseRisk();
};
if (document.documentElement) observeCloseRisk();
else window.addEventListener('DOMContentLoaded', observeCloseRisk, { once: true });

async function invoke<Result>(channel: string, input?: unknown): Promise<Result> {
  const observedOperation = J02_OBSERVED_CHANNELS.get(channel);
  if (observedOperation && j02ObservationEnabled) {
    j02IpcCounts.set(observedOperation, (j02IpcCounts.get(observedOperation) ?? 0) + 1);
    observeJ02Ipc(observedOperation, 'invoke', input);
  }
  try {
    const envelope = (await ipcRenderer.invoke(channel, input)) as RendererCallResult<Result>;
    if (envelope.ok) {
      if (observedOperation) observeJ02Ipc(observedOperation, 'result', envelope.result);
      return envelope.result;
    }
    if (observedOperation) observeJ02Ipc(observedOperation, 'error', input);
    throw Object.freeze({ code: envelope.error.code, message: envelope.error.message });
  } catch (error) {
    const bridgedFailure = typeof error === 'object' && error !== null &&
      'code' in error && typeof error.code === 'string' &&
      'message' in error && typeof error.message === 'string';
    if (observedOperation && !bridgedFailure) observeJ02Ipc(observedOperation, 'error', input);
    throw error;
  }
}

if (process.platform !== 'win32' && process.platform !== 'darwin') throw new Error('Unsupported renderer platform.');

const api: RendererApi = Object.freeze({
  platform: process.platform,
  getStartup: () => invoke<ServiceOperationMap['getStartup']['output']>(IPC_CHANNELS.getStartup),
  getRecoveryComparison: (input: ServiceOperationMap['getRecoveryComparison']['input']) =>
    invoke<ServiceOperationMap['getRecoveryComparison']['output']>(IPC_CHANNELS.getRecoveryComparison, input),
  viewRecoveryCandidate: (input: ServiceOperationMap['viewRecoveryCandidate']['input']) =>
    invoke<ServiceOperationMap['viewRecoveryCandidate']['output']>(IPC_CHANNELS.viewRecoveryCandidate, input),
  deferRecovery: (input: ServiceOperationMap['deferRecovery']['input']) =>
    invoke<ServiceOperationMap['deferRecovery']['output']>(IPC_CHANNELS.deferRecovery, input),
  restoreRecovery: (input: Omit<ServiceOperationMap['restoreRecovery']['input'], 'restorationId'>) =>
    invoke<ServiceOperationMap['restoreRecovery']['output']>(IPC_CHANNELS.restoreRecovery, input),
  getImportStartup: () =>
    invoke<ServiceOperationMap['getImportStartup']['output']>(IPC_CHANNELS.getImportStartup),
  selectAndStageDocx: () => invoke<PickerStageResult>(IPC_CHANNELS.selectAndStageDocx),
  continueImportDraft: (input: ServiceOperationMap['continueImportDraft']['input']) =>
    invoke<ServiceOperationMap['continueImportDraft']['output']>(IPC_CHANNELS.continueImportDraft, input),
  reselectImportDraft: (input: { draftId: string; expectedDraftVersion: number }) =>
    invoke<PickerReselectResult>(IPC_CHANNELS.reselectImportDraft, input),
  abandonImportDraft: (input: ServiceOperationMap['abandonImportDraft']['input']) =>
    invoke<ServiceOperationMap['abandonImportDraft']['output']>(IPC_CHANNELS.abandonImportDraft, input),
  prepareBookCreation: (input: ServiceOperationMap['prepareBookCreation']['input']) =>
    invoke<ServiceOperationMap['prepareBookCreation']['output']>(IPC_CHANNELS.prepareBookCreation, input),
  commitBookCreation: (input: ServiceOperationMap['commitBookCreation']['input']) =>
    invoke<ServiceOperationMap['commitBookCreation']['output']>(IPC_CHANNELS.commitBookCreation, input),
  getBookOverview: (input: ServiceOperationMap['getBookOverview']['input']) =>
    invoke<ServiceOperationMap['getBookOverview']['output']>(IPC_CHANNELS.getBookOverview, input),
  inspectEditorialWorkspaceProfile: () =>
    invoke<ServiceOperationMap['inspectEditorialWorkspaceProfile']['output']>(IPC_CHANNELS.inspectEditorialWorkspaceProfile),
  installEditorialWorkspaceProfile: () =>
    invoke<ServiceOperationMap['installEditorialWorkspaceProfile']['output']>(IPC_CHANNELS.installEditorialWorkspaceProfile),
  enableEditorialWorkspaceProfile: () =>
    invoke<ServiceOperationMap['enableEditorialWorkspaceProfile']['output']>(IPC_CHANNELS.enableEditorialWorkspaceProfile),
  inspectTaskAuthorization: () =>
    invoke<ServiceOperationMap['inspectTaskAuthorization']['output']>(IPC_CHANNELS.inspectTaskAuthorization),
  inspectForegroundExecutionBoundary: (input: Omit<
    ServiceOperationMap['inspectForegroundExecutionBoundary']['input'],
    'bookId'
  >) => invoke<ServiceOperationMap['inspectForegroundExecutionBoundary']['output']>(
    IPC_CHANNELS.inspectForegroundExecutionBoundary,
    input,
  ),
  prepareTaskAuthorization: (input: Omit<ServiceOperationMap['prepareTaskAuthorization']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareTaskAuthorization']['output']>(IPC_CHANNELS.prepareTaskAuthorization, input),
  authorizeTaskAuthorization: (input: Omit<ServiceOperationMap['authorizeTaskAuthorization']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeTaskAuthorization']['output']>(IPC_CHANNELS.authorizeTaskAuthorization, input),
  inspectBaselineAnalysis: (input?: Omit<ServiceOperationMap['inspectBaselineAnalysis']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['inspectBaselineAnalysis']['output']>(IPC_CHANNELS.inspectBaselineAnalysis, input ?? { revisionId: null }),
  prepareBaselineAnalysis: (input: Omit<ServiceOperationMap['prepareBaselineAnalysis']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareBaselineAnalysis']['output']>(IPC_CHANNELS.prepareBaselineAnalysis, input),
  authorizeBaselineAnalysis: (input: Omit<ServiceOperationMap['authorizeBaselineAnalysis']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeBaselineAnalysis']['output']>(IPC_CHANNELS.authorizeBaselineAnalysis, input),
  listBooks: (input: ServiceOperationMap['listBooks']['input']) =>
    invoke<ServiceOperationMap['listBooks']['output']>(IPC_CHANNELS.listBooks, input),
  prepareNewBookReview: (input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    invoke<ServiceOperationMap['prepareNewBookReview']['output']>(IPC_CHANNELS.prepareNewBookReview, input),
  commitNewBookImport: (input: CommitNewBookRendererInput) =>
    invoke<ServiceOperationMap['commitNewBookImport']['output']>(IPC_CHANNELS.commitNewBookImport, input),
  prepareSourceImportReview: (input: ServiceOperationMap['prepareSourceImportReview']['input']) =>
    invoke<ServiceOperationMap['prepareSourceImportReview']['output']>(IPC_CHANNELS.prepareSourceImportReview, input),
  commitSourceImport: (input: CommitSourceImportRendererInput) =>
    invoke<ServiceOperationMap['commitSourceImport']['output']>(IPC_CHANNELS.commitSourceImport, input),
  prepareManuscriptReimport: (input: ServiceOperationMap['prepareManuscriptReimport']['input']) =>
    invoke<ServiceOperationMap['prepareManuscriptReimport']['output']>(IPC_CHANNELS.prepareManuscriptReimport, input),
  getReimportMappingPage: (input: ServiceOperationMap['getReimportMappingPage']['input']) =>
    invoke<ServiceOperationMap['getReimportMappingPage']['output']>(IPC_CHANNELS.getReimportMappingPage, input),
  getReimportIdentityCandidatePage: (input: ServiceOperationMap['getReimportIdentityCandidatePage']['input']) =>
    invoke<ServiceOperationMap['getReimportIdentityCandidatePage']['output']>(IPC_CHANNELS.getReimportIdentityCandidatePage, input),
  getReimportLineageSourceVersionPage: (input: ServiceOperationMap['getReimportLineageSourceVersionPage']['input']) =>
    invoke<ServiceOperationMap['getReimportLineageSourceVersionPage']['output']>(IPC_CHANNELS.getReimportLineageSourceVersionPage, input),
  acceptReimportDegradation: (input: ServiceOperationMap['acceptReimportDegradation']['input']) =>
    invoke<ServiceOperationMap['acceptReimportDegradation']['output']>(IPC_CHANNELS.acceptReimportDegradation, input),
  resolveReimportMapping: (input: ServiceOperationMap['resolveReimportMapping']['input']) =>
    invoke<ServiceOperationMap['resolveReimportMapping']['output']>(IPC_CHANNELS.resolveReimportMapping, input),
  commitManuscriptReimport: (input: CommitManuscriptReimportRendererInput) =>
    invoke<ServiceOperationMap['commitManuscriptReimport']['output']>(IPC_CHANNELS.commitManuscriptReimport, input),
  acknowledgeImportCompletion: (input: ServiceOperationMap['acknowledgeImportCompletion']['input']) =>
    invoke<ServiceOperationMap['acknowledgeImportCompletion']['output']>(IPC_CHANNELS.acknowledgeImportCompletion, input),
  getManuscriptWindow: (input: ServiceOperationMap['getManuscriptWindow']['input']) =>
    invoke<ServiceOperationMap['getManuscriptWindow']['output']>(IPC_CHANNELS.getManuscriptWindow, input),
  flushJournalEdit: (input: ServiceOperationMap['flushJournalEdit']['input']) =>
    invoke<ServiceOperationMap['flushJournalEdit']['output']>(IPC_CHANNELS.flushJournalEdit, input),
  listPriorWork: () => invoke<ServiceOperationMap['listPriorWork']['output']>(IPC_CHANNELS.listPriorWork, {}),
  getManuscriptWindowAt: (input: ServiceOperationMap['getManuscriptWindowAt']['input']) =>
    invoke<ServiceOperationMap['getManuscriptWindowAt']['output']>(IPC_CHANNELS.getManuscriptWindowAt, input),
  getOutline: (input: ServiceOperationMap['getOutline']['input']) =>
    invoke<ServiceOperationMap['getOutline']['output']>(IPC_CHANNELS.getOutline, input),
  startSearch: (input: ServiceOperationMap['startSearch']['input']) =>
    invoke<ServiceOperationMap['startSearch']['output']>(IPC_CHANNELS.startSearch, input),
  pollServiceJob: (input: ServiceOperationMap['pollServiceJob']['input']) =>
    invoke<ServiceOperationMap['pollServiceJob']['output']>(IPC_CHANNELS.pollServiceJob, input),
  cancelServiceJob: (input: ServiceOperationMap['cancelServiceJob']['input']) =>
    invoke<ServiceOperationMap['cancelServiceJob']['output']>(IPC_CHANNELS.cancelServiceJob, input),
  getSearchResults: (input: ServiceOperationMap['getSearchResults']['input']) =>
    invoke<ServiceOperationMap['getSearchResults']['output']>(IPC_CHANNELS.getSearchResults, input),
  prepareReplacement: (input: ServiceOperationMap['prepareReplacement']['input']) =>
    invoke<ServiceOperationMap['prepareReplacement']['output']>(IPC_CHANNELS.prepareReplacement, input),
  freezeReplacement: (input: ServiceOperationMap['freezeReplacement']['input']) =>
    invoke<ServiceOperationMap['freezeReplacement']['output']>(IPC_CHANNELS.freezeReplacement, input),
  dismissReplacementPreview: (input: ServiceOperationMap['dismissReplacementPreview']['input']) =>
    invoke<ServiceOperationMap['dismissReplacementPreview']['output']>(IPC_CHANNELS.dismissReplacementPreview, input),
  startReplacementCommit: (input: ServiceOperationMap['startReplacementCommit']['input']) =>
    invoke<ServiceOperationMap['startReplacementCommit']['output']>(IPC_CHANNELS.startReplacementCommit, input),
  commitReplacement: (input: ServiceOperationMap['commitReplacement']['input']) =>
    invoke<ServiceOperationMap['commitReplacement']['output']>(IPC_CHANNELS.commitReplacement, input),
  saveMilestone: (input: ServiceOperationMap['saveMilestone']['input']) =>
    invoke<ServiceOperationMap['saveMilestone']['output']>(IPC_CHANNELS.saveMilestone, input),
  undoManuscript: (input: ServiceOperationMap['undoManuscript']['input']) =>
    invoke<ServiceOperationMap['undoManuscript']['output']>(IPC_CHANNELS.undoManuscript, input),
  redoManuscript: (input: ServiceOperationMap['redoManuscript']['input']) =>
    invoke<ServiceOperationMap['redoManuscript']['output']>(IPC_CHANNELS.redoManuscript, input),
  openBookWorkbench: (input: ServiceOperationMap['resolveBookWorkbenchRoute']['input']) =>
    invoke<Awaited<ReturnType<RendererApi['openBookWorkbench']>>>(IPC_CHANNELS.openBookWorkbench, input),
  getBookWorkbenchRoute: () =>
    invoke<Awaited<ReturnType<RendererApi['getBookWorkbenchRoute']>>>(IPC_CHANNELS.getBookWorkbenchRoute),
  leaveBookWorkbench: () =>
    invoke<Awaited<ReturnType<RendererApi['leaveBookWorkbench']>>>(IPC_CHANNELS.leaveBookWorkbench),
  getHistoricalRevision: (input: ServiceOperationMap['getHistoricalRevision']['input']) =>
    invoke<ServiceOperationMap['getHistoricalRevision']['output']>(IPC_CHANNELS.getHistoricalRevision, input),
  getProductDataLocation: () =>
    invoke<Awaited<ReturnType<RendererApi['getProductDataLocation']>>>(IPC_CHANNELS.getProductDataLocation),
  revealProductDataLocation: () =>
    invoke<Awaited<ReturnType<RendererApi['revealProductDataLocation']>>>(IPC_CHANNELS.revealProductDataLocation),
  getModelServiceSettings: () =>
    invoke<Awaited<ReturnType<RendererApi['getModelServiceSettings']>>>(IPC_CHANNELS.getModelServiceSettings),
  saveModelServiceCredential: (input: { connectionName: string; secret: string }) =>
    invoke<Awaited<ReturnType<RendererApi['saveModelServiceCredential']>>>(IPC_CHANNELS.saveModelServiceCredential, input),
  removeModelServiceCredential: () =>
    invoke<Awaited<ReturnType<RendererApi['removeModelServiceCredential']>>>(IPC_CHANNELS.removeModelServiceCredential),
});

contextBridge.exposeInMainWorld('ai7', api);
