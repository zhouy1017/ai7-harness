import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type CommitNewBookRendererInput,
  type PickerStageResult,
  type RendererApi,
  type RendererCallResult,
  type ServiceOperationMap,
} from '../shared/protocol.js';

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
  selectAndStageDocx: () => invoke<PickerStageResult>(IPC_CHANNELS.selectAndStageDocx),
  prepareNewBookReview: (input: ServiceOperationMap['prepareNewBookReview']['input']) =>
    invoke<ServiceOperationMap['prepareNewBookReview']['output']>(IPC_CHANNELS.prepareNewBookReview, input),
  commitNewBookImport: (input: CommitNewBookRendererInput) =>
    invoke<ServiceOperationMap['commitNewBookImport']['output']>(IPC_CHANNELS.commitNewBookImport, input),
  getManuscriptWindow: (input: ServiceOperationMap['getManuscriptWindow']['input']) =>
    invoke<ServiceOperationMap['getManuscriptWindow']['output']>(IPC_CHANNELS.getManuscriptWindow, input),
  flushJournalEdit: (input: ServiceOperationMap['flushJournalEdit']['input']) =>
    invoke<ServiceOperationMap['flushJournalEdit']['output']>(IPC_CHANNELS.flushJournalEdit, input),
});

contextBridge.exposeInMainWorld('ai7', api);
