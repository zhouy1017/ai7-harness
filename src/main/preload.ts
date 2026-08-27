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
  const envelope = (await ipcRenderer.invoke(channel, input)) as RendererCallResult<Result>;
  if (envelope.ok) return envelope.result;
  const error = new Error(envelope.error.message) as Error & { code: string };
  error.code = envelope.error.code;
  throw error;
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
});

contextBridge.exposeInMainWorld('ai7', api);
