import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  MAIN_EVENTS,
  type CommitNewBookRendererInput,
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
    const error = new Error(envelope.error.message) as Error & { code: string };
    error.code = envelope.error.code;
    throw error;
  } catch (error) {
    if (observedOperation && !(error instanceof Error && 'code' in error)) observeJ02Ipc(observedOperation, 'error', input);
    throw error;
  }
}

if (process.platform !== 'win32' && process.platform !== 'darwin') throw new Error('Unsupported renderer platform.');

const api: RendererApi = Object.freeze({
  platform: process.platform,
  getImportStartup: () =>
    invoke<ServiceOperationMap['getImportStartup']['output']>(IPC_CHANNELS.getImportStartup),
  selectAndStageDocx: () => invoke<PickerStageResult>(IPC_CHANNELS.selectAndStageDocx),
  continueImportDraft: (input: ServiceOperationMap['continueImportDraft']['input']) =>
    invoke<ServiceOperationMap['continueImportDraft']['output']>(IPC_CHANNELS.continueImportDraft, input),
  reselectImportDraft: (input: { draftId: string; expectedDraftVersion: number }) =>
    invoke<PickerReselectResult>(IPC_CHANNELS.reselectImportDraft, input),
  abandonImportDraft: (input: ServiceOperationMap['abandonImportDraft']['input']) =>
    invoke<ServiceOperationMap['abandonImportDraft']['output']>(IPC_CHANNELS.abandonImportDraft, input),
  prepareNewBookReview: (input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    invoke<ServiceOperationMap['prepareNewBookReview']['output']>(IPC_CHANNELS.prepareNewBookReview, input),
  commitNewBookImport: (input: CommitNewBookRendererInput) =>
    invoke<ServiceOperationMap['commitNewBookImport']['output']>(IPC_CHANNELS.commitNewBookImport, input),
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
});

contextBridge.exposeInMainWorld('ai7', api);
