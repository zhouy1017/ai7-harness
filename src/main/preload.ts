import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  MAIN_EVENTS,
  type CommitNewBookRendererInput,
  type CommitManuscriptReimportRendererInput,
  type CommitSourceImportRendererInput,
  type EditorClipboardCommand,
  type InspectReviewFindingOfMarkRendererInput,
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
  selectAndStageManuscript: () => invoke<PickerStageResult>(IPC_CHANNELS.selectAndStageManuscript),
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
  inspectTaskPlan: (input: Omit<ServiceOperationMap['inspectTaskPlan']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['inspectTaskPlan']['output']>(IPC_CHANNELS.inspectTaskPlan, input),
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
  startBaselineAnalysisWhenOnline: (input: Omit<ServiceOperationMap['startBaselineAnalysisWhenOnline']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['startBaselineAnalysisWhenOnline']['output']>(IPC_CHANNELS.startBaselineAnalysisWhenOnline, input),
  cancelWaitingBaselineAnalysis: (input: Omit<ServiceOperationMap['cancelWaitingBaselineAnalysis']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['cancelWaitingBaselineAnalysis']['output']>(IPC_CHANNELS.cancelWaitingBaselineAnalysis, input),
  cancelBaselineAnalysisRun: (input: Omit<ServiceOperationMap['cancelBaselineAnalysisRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['cancelBaselineAnalysisRun']['output']>(IPC_CHANNELS.cancelBaselineAnalysisRun, input),
  pauseBaselineAnalysisRun: (input: Omit<ServiceOperationMap['pauseBaselineAnalysisRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['pauseBaselineAnalysisRun']['output']>(IPC_CHANNELS.pauseBaselineAnalysisRun, input),
  resumeBaselineAnalysisRun: (input: Omit<ServiceOperationMap['resumeBaselineAnalysisRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['resumeBaselineAnalysisRun']['output']>(IPC_CHANNELS.resumeBaselineAnalysisRun, input),
  editBaselineAnalysisPlan: (input: Omit<ServiceOperationMap['editBaselineAnalysisPlan']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['editBaselineAnalysisPlan']['output']>(IPC_CHANNELS.editBaselineAnalysisPlan, input),
  answerBaselineAnalysisClarification: (input: Omit<ServiceOperationMap['answerBaselineAnalysisClarification']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['answerBaselineAnalysisClarification']['output']>(IPC_CHANNELS.answerBaselineAnalysisClarification, input),
  runReconnectPreflight: () =>
    invoke<ServiceOperationMap['runReconnectPreflight']['output']>(IPC_CHANNELS.runReconnectPreflight),
  quickStartBaselineAnalysis: (input: Omit<ServiceOperationMap['quickStartBaselineAnalysis']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['quickStartBaselineAnalysis']['output']>(IPC_CHANNELS.quickStartBaselineAnalysis, input),
  setDefaultExecutionRule: (input: Omit<ServiceOperationMap['setDefaultExecutionRule']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['setDefaultExecutionRule']['output']>(IPC_CHANNELS.setDefaultExecutionRule, input),
  inspectDefaultExecutionRules: () =>
    invoke<ServiceOperationMap['inspectDefaultExecutionRules']['output']>(IPC_CHANNELS.inspectDefaultExecutionRules),
  deactivateDefaultExecutionRule: (input: ServiceOperationMap['deactivateDefaultExecutionRule']['input']) =>
    invoke<ServiceOperationMap['deactivateDefaultExecutionRule']['output']>(IPC_CHANNELS.deactivateDefaultExecutionRule, input),
  inspectReviewGuidelines: (input?: ServiceOperationMap['inspectReviewGuidelines']['input']) =>
    invoke<ServiceOperationMap['inspectReviewGuidelines']['output']>(IPC_CHANNELS.inspectReviewGuidelines, input ?? {}),
  previewReviewGuidelineVersion: (input: { documentId: string; previewId?: string; clausePage?: number }) =>
    invoke<ServiceOperationMap['previewReviewGuidelineVersion']['output'] | null>(IPC_CHANNELS.previewReviewGuidelineVersion, input),
  importReviewGuidelineVersion: (input: ServiceOperationMap['importReviewGuidelineVersion']['input']) =>
    invoke<ServiceOperationMap['importReviewGuidelineVersion']['output']>(IPC_CHANNELS.importReviewGuidelineVersion, input),
  inspectExemplars: (input?: ServiceOperationMap['inspectExemplars']['input']) =>
    invoke<ServiceOperationMap['inspectExemplars']['output']>(IPC_CHANNELS.inspectExemplars, input ?? { after: null }),
  inspectKnowledgeProcedures: () => invoke<ServiceOperationMap['inspectKnowledgeProcedures']['output']>(IPC_CHANNELS.inspectKnowledgeProcedures),
  // 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087).
  inspectCapturedProcedures: () => invoke<ServiceOperationMap['inspectCapturedProcedures']['output']>(IPC_CHANNELS.inspectCapturedProcedures),
  inspectCapturedProcedure: (input: Parameters<RendererApi['inspectCapturedProcedure']>[0]) =>
    invoke<ServiceOperationMap['inspectCapturedProcedure']['output']>(IPC_CHANNELS.inspectCapturedProcedure, input),
  inspectDeveloperProposal: (input: Parameters<RendererApi['inspectDeveloperProposal']>[0]) =>
    invoke<ServiceOperationMap['inspectDeveloperProposal']['output']>(IPC_CHANNELS.inspectDeveloperProposal, input),
  inspectProcedureCapture: (input: Parameters<RendererApi['inspectProcedureCapture']>[0]) =>
    invoke<ServiceOperationMap['inspectProcedureCapture']['output']>(IPC_CHANNELS.inspectProcedureCapture, input),
  saveCapturedProcedure: (input: Parameters<RendererApi['saveCapturedProcedure']>[0]) =>
    invoke<ServiceOperationMap['saveCapturedProcedure']['output']>(IPC_CHANNELS.saveCapturedProcedure, input),
  previewCapturedProcedureValidation: (input: Parameters<RendererApi['previewCapturedProcedureValidation']>[0]) =>
    invoke<ServiceOperationMap['previewCapturedProcedureValidation']['output']>(IPC_CHANNELS.previewCapturedProcedureValidation, input),
  enableCapturedProcedure: (input: Parameters<RendererApi['enableCapturedProcedure']>[0]) =>
    invoke<ServiceOperationMap['enableCapturedProcedure']['output']>(IPC_CHANNELS.enableCapturedProcedure, input),
  previewCapturedProcedureStop: (input: Parameters<RendererApi['previewCapturedProcedureStop']>[0]) =>
    invoke<ServiceOperationMap['previewCapturedProcedureStop']['output']>(IPC_CHANNELS.previewCapturedProcedureStop, input),
  stopCapturedProcedure: (input: Parameters<RendererApi['stopCapturedProcedure']>[0]) =>
    invoke<ServiceOperationMap['stopCapturedProcedure']['output']>(IPC_CHANNELS.stopCapturedProcedure, input),
  inspectCapturedProcedureApplicability: () =>
    invoke<ServiceOperationMap['inspectCapturedProcedureApplicability']['output']>(IPC_CHANNELS.inspectCapturedProcedureApplicability),
  inspectCapturedProcedureRun: (input: Parameters<RendererApi['inspectCapturedProcedureRun']>[0]) =>
    invoke<ServiceOperationMap['inspectCapturedProcedureRun']['output']>(IPC_CHANNELS.inspectCapturedProcedureRun, input),
  saveDeveloperProposal: (input: Parameters<RendererApi['saveDeveloperProposal']>[0]) =>
    invoke<ServiceOperationMap['saveDeveloperProposal']['output']>(IPC_CHANNELS.saveDeveloperProposal, input),
  saveDeveloperProposalFile: (input: Parameters<RendererApi['saveDeveloperProposalFile']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['saveDeveloperProposalFile']>>>(IPC_CHANNELS.saveDeveloperProposalFile, input),
  inspectLibraryMaterials: (input?: ServiceOperationMap['inspectLibraryMaterials']['input']) =>
    invoke<ServiceOperationMap['inspectLibraryMaterials']['output']>(IPC_CHANNELS.inspectLibraryMaterials, input ?? { after: null }),
  inspectLibraryMaterial: (input: ServiceOperationMap['inspectLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['inspectLibraryMaterial']['output']>(IPC_CHANNELS.inspectLibraryMaterial, input),
  readLibraryDecisionReason: (input: ServiceOperationMap['readLibraryDecisionReason']['input']) =>
    invoke<ServiceOperationMap['readLibraryDecisionReason']['output']>(IPC_CHANNELS.readLibraryDecisionReason, input),
  previewLibraryMaterial: () =>
    invoke<ServiceOperationMap['previewLibraryMaterial']['output'] | null>(IPC_CHANNELS.previewLibraryMaterial),
  addLibraryMaterial: (input: ServiceOperationMap['addLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['addLibraryMaterial']['output']>(IPC_CHANNELS.addLibraryMaterial, input),
  decideLibraryMaterial: (input: ServiceOperationMap['decideLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['decideLibraryMaterial']['output']>(IPC_CHANNELS.decideLibraryMaterial, input),
  inspectEvaluationProfiles: () => invoke<ServiceOperationMap['inspectEvaluationProfiles']['output']>(IPC_CHANNELS.inspectEvaluationProfiles),
  inspectEvaluation: (input: { recordId: string | null; recordsBefore?: number | null }) =>
    invoke<ServiceOperationMap['inspectEvaluation']['output']>(IPC_CHANNELS.inspectEvaluation, input),
  startEvaluation: (input?: { fromInitial: boolean }) =>
    invoke<ServiceOperationMap['startEvaluation']['output']>(IPC_CHANNELS.startEvaluation, input),
  saveEvaluation: (input: Omit<ServiceOperationMap['saveEvaluation']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['saveEvaluation']['output']>(IPC_CHANNELS.saveEvaluation, input),
  prepareInitialEvaluation: () => invoke<ServiceOperationMap['prepareInitialEvaluation']['output']>(IPC_CHANNELS.prepareInitialEvaluation),
  authorizeInitialEvaluation: (input: Omit<ServiceOperationMap['authorizeInitialEvaluation']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeInitialEvaluation']['output']>(IPC_CHANNELS.authorizeInitialEvaluation, input),
  prepareReadersReport: (input: Omit<ServiceOperationMap['prepareReadersReport']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareReadersReport']['output']>(IPC_CHANNELS.prepareReadersReport, input),
  authorizeReadersReport: (input: Omit<ServiceOperationMap['authorizeReadersReport']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeReadersReport']['output']>(IPC_CHANNELS.authorizeReadersReport, input),
  createReadersReportDraft: (input: Omit<ServiceOperationMap['createReadersReportDraft']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['createReadersReportDraft']['output']>(IPC_CHANNELS.createReadersReportDraft, input),
  prepareEvaluationRewrite: (input: Omit<ServiceOperationMap['prepareEvaluationRewrite']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareEvaluationRewrite']['output']>(IPC_CHANNELS.prepareEvaluationRewrite, input),
  authorizeEvaluationRewrite: (input: Omit<ServiceOperationMap['authorizeEvaluationRewrite']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeEvaluationRewrite']['output']>(IPC_CHANNELS.authorizeEvaluationRewrite, input),
  decideEvaluationRewrite: (input: Omit<ServiceOperationMap['decideEvaluationRewrite']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['decideEvaluationRewrite']['output']>(IPC_CHANNELS.decideEvaluationRewrite, input),
  // 新建文档 · 写作任务 (Issue #432, S84a).
  inspectWritingTask: () => invoke<ServiceOperationMap['inspectWritingTask']['output']>(IPC_CHANNELS.inspectWritingTask),
  prepareWritingTask: (input: Omit<ServiceOperationMap['prepareWritingTask']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareWritingTask']['output']>(IPC_CHANNELS.prepareWritingTask, input),
  authorizeWritingTask: (input: Omit<ServiceOperationMap['authorizeWritingTask']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeWritingTask']['output']>(IPC_CHANNELS.authorizeWritingTask, input),
  quickStartWritingTask: (input: Omit<ServiceOperationMap['quickStartWritingTask']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['quickStartWritingTask']['output']>(IPC_CHANNELS.quickStartWritingTask, input),
  createWritingDraft: (input: Omit<ServiceOperationMap['createWritingDraft']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['createWritingDraft']['output']>(IPC_CHANNELS.createWritingDraft, input),
  inspectAnalysisFeedback: (input: { revisionId: string }) =>
    invoke<ServiceOperationMap['inspectAnalysisFeedback']['output']>(IPC_CHANNELS.inspectAnalysisFeedback, input),
  recordAnalysisFeedback: (input: Omit<ServiceOperationMap['recordAnalysisFeedback']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['recordAnalysisFeedback']['output']>(IPC_CHANNELS.recordAnalysisFeedback, input),
  inspectReviewWorkspace: (input?: Omit<ServiceOperationMap['inspectReviewWorkspace']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['inspectReviewWorkspace']['output']>(IPC_CHANNELS.inspectReviewWorkspace, input ?? { reviewRunId: null }),
  prepareReviewRun: (input: Omit<ServiceOperationMap['prepareReviewRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareReviewRun']['output']>(IPC_CHANNELS.prepareReviewRun, input),
  authorizeReviewRun: (input: Omit<ServiceOperationMap['authorizeReviewRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['authorizeReviewRun']['output']>(IPC_CHANNELS.authorizeReviewRun, input),
  continueReviewRun: (input: Omit<ServiceOperationMap['continueReviewRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['continueReviewRun']['output']>(IPC_CHANNELS.continueReviewRun, input),
  recordReviewFindingDisposition: (input: Omit<ServiceOperationMap['recordReviewFindingDisposition']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['recordReviewFindingDisposition']['output']>(IPC_CHANNELS.recordReviewFindingDisposition, input),
  generateReviewReport: (input: Omit<ServiceOperationMap['generateReviewReport']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['generateReviewReport']['output']>(IPC_CHANNELS.generateReviewReport, input),
  inspectReviewFindingOfMark: (input: InspectReviewFindingOfMarkRendererInput) =>
    invoke<ServiceOperationMap['inspectReviewFindingOfMark']['output']>(IPC_CHANNELS.inspectReviewFindingOfMark, input),
  listBooks: (input: ServiceOperationMap['listBooks']['input']) =>
    invoke<ServiceOperationMap['listBooks']['output']>(IPC_CHANNELS.listBooks, input),
  updateBookPeople: (input: Parameters<RendererApi['updateBookPeople']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['updateBookPeople']>>>(IPC_CHANNELS.updateBookPeople, input),
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
  createEditorialMark: (input: ServiceOperationMap['createEditorialMark']['input']) =>
    invoke<ServiceOperationMap['createEditorialMark']['output']>(IPC_CHANNELS.createEditorialMark, input),
  getEditorialMarkCard: (input: ServiceOperationMap['getEditorialMarkCard']['input']) =>
    invoke<ServiceOperationMap['getEditorialMarkCard']['output']>(IPC_CHANNELS.getEditorialMarkCard, input),
  updateEditorialMark: (input: ServiceOperationMap['updateEditorialMark']['input']) =>
    invoke<ServiceOperationMap['updateEditorialMark']['output']>(IPC_CHANNELS.updateEditorialMark, input),
  recordChangeSuggestionDecision: (input: ServiceOperationMap['recordChangeSuggestionDecision']['input']) =>
    invoke<ServiceOperationMap['recordChangeSuggestionDecision']['output']>(IPC_CHANNELS.recordChangeSuggestionDecision, input),
  recordProposalDecisionReason: (input: ServiceOperationMap['recordProposalDecisionReason']['input']) =>
    invoke<ServiceOperationMap['recordProposalDecisionReason']['output']>(IPC_CHANNELS.recordProposalDecisionReason, input),
  recordProposalDecisionFeedback: (input: ServiceOperationMap['recordProposalDecisionFeedback']['input']) =>
    invoke<ServiceOperationMap['recordProposalDecisionFeedback']['output']>(IPC_CHANNELS.recordProposalDecisionFeedback, input),
  inspectLearningMaterials: (input: ServiceOperationMap['inspectLearningMaterials']['input']) =>
    invoke<ServiceOperationMap['inspectLearningMaterials']['output']>(IPC_CHANNELS.inspectLearningMaterials, input),
  inspectLearningMaterial: (input: ServiceOperationMap['inspectLearningMaterial']['input']) =>
    invoke<ServiceOperationMap['inspectLearningMaterial']['output']>(IPC_CHANNELS.inspectLearningMaterial, input),
  decideLearningMaterial: (input: ServiceOperationMap['decideLearningMaterial']['input']) =>
    invoke<ServiceOperationMap['decideLearningMaterial']['output']>(IPC_CHANNELS.decideLearningMaterial, input),
  inspectFeedbackHistory: (input = {}) =>
    invoke<ServiceOperationMap['inspectFeedbackHistory']['output']>(IPC_CHANNELS.inspectFeedbackHistory, input),
  inspectLearningAudit: (input = {}) =>
    invoke<ServiceOperationMap['inspectLearningAudit']['output']>(IPC_CHANNELS.inspectLearningAudit, input),
  inspectLearningLineage: (input: ServiceOperationMap['inspectLearningLineage']['input']) =>
    invoke<ServiceOperationMap['inspectLearningLineage']['output']>(IPC_CHANNELS.inspectLearningLineage, input),
  previewLearningRemediation: (input: ServiceOperationMap['previewLearningRemediation']['input']) =>
    invoke<ServiceOperationMap['previewLearningRemediation']['output']>(IPC_CHANNELS.previewLearningRemediation, input),
  recordLearningRemediation: (input: ServiceOperationMap['recordLearningRemediation']['input']) =>
    invoke<ServiceOperationMap['recordLearningRemediation']['output']>(IPC_CHANNELS.recordLearningRemediation, input),
  inspectEvaluationCalibration: (input: ServiceOperationMap['inspectEvaluationCalibration']['input'] = { after: null, focusBookId: null }) =>
    invoke<ServiceOperationMap['inspectEvaluationCalibration']['output']>(IPC_CHANNELS.inspectEvaluationCalibration, input),
  recordPublicationActuals: (input: ServiceOperationMap['recordPublicationActuals']['input']) =>
    invoke<ServiceOperationMap['recordPublicationActuals']['output']>(IPC_CHANNELS.recordPublicationActuals, input),
  setEvaluationPreferences: (input: ServiceOperationMap['setEvaluationPreferences']['input']) =>
    invoke<ServiceOperationMap['setEvaluationPreferences']['output']>(IPC_CHANNELS.setEvaluationPreferences, input),
  inspectSeriesList: (input?: { after?: ServiceOperationMap['inspectSeriesList']['input']['after'] }) =>
    invoke<ServiceOperationMap['inspectSeriesList']['output']>(IPC_CHANNELS.inspectSeriesList, { after: input?.after ?? null }),
  createSeries: (input: ServiceOperationMap['createSeries']['input']) =>
    invoke<ServiceOperationMap['createSeries']['output']>(IPC_CHANNELS.createSeries, input),
  inspectSeries: (input: ServiceOperationMap['inspectSeries']['input']) =>
    invoke<ServiceOperationMap['inspectSeries']['output']>(IPC_CHANNELS.inspectSeries, input),
  previewSeriesMembershipChange: (input: ServiceOperationMap['previewSeriesMembershipChange']['input']) =>
    invoke<ServiceOperationMap['previewSeriesMembershipChange']['output']>(IPC_CHANNELS.previewSeriesMembershipChange, input),
  changeSeriesMembership: (input: ServiceOperationMap['changeSeriesMembership']['input']) =>
    invoke<ServiceOperationMap['changeSeriesMembership']['output']>(IPC_CHANNELS.changeSeriesMembership, input),
  inspectBookSeries: (input: ServiceOperationMap['inspectBookSeries']['input']) =>
    invoke<ServiceOperationMap['inspectBookSeries']['output']>(IPC_CHANNELS.inspectBookSeries, input),
  inspectSeriesMembers: (input: ServiceOperationMap['inspectSeriesMembers']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesMembers']['output']>(IPC_CHANNELS.inspectSeriesMembers, input),
  inspectSeriesCandidates: (input: ServiceOperationMap['inspectSeriesCandidates']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesCandidates']['output']>(IPC_CHANNELS.inspectSeriesCandidates, input),
  inspectSeriesHistory: (input: ServiceOperationMap['inspectSeriesHistory']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesHistory']['output']>(IPC_CHANNELS.inspectSeriesHistory, input),
  inspectDataVersion: () => invoke<ServiceOperationMap['inspectDataVersion']['output']>(IPC_CHANNELS.inspectDataVersion, {}),
  chooseDatabaseExportDestination: () =>
    invoke<Awaited<ReturnType<RendererApi['chooseDatabaseExportDestination']>>>(IPC_CHANNELS.chooseDatabaseExportDestination, {}),
  approveDatabaseExport: (input: Parameters<RendererApi['approveDatabaseExport']>[0]) =>
    invoke<ServiceOperationMap['approveDatabaseExport']['output']>(IPC_CHANNELS.approveDatabaseExport, input),
  inspectDatabaseExports: () => invoke<ServiceOperationMap['inspectDatabaseExports']['output']>(IPC_CHANNELS.inspectDatabaseExports, {}),
  inspectScheduledBackups: () => invoke<ServiceOperationMap['inspectScheduledBackups']['output']>(IPC_CHANNELS.inspectScheduledBackups, {}),
  setScheduledBackup: (input: Parameters<RendererApi['setScheduledBackup']>[0]) =>
    invoke<ServiceOperationMap['setScheduledBackup']['output']>(IPC_CHANNELS.setScheduledBackup, input),
  chooseDatabaseImportFile: () =>
    invoke<Awaited<ReturnType<RendererApi['chooseDatabaseImportFile']>>>(IPC_CHANNELS.chooseDatabaseImportFile, {}),
  prepareDatabaseReplacement: (input: Parameters<RendererApi['prepareDatabaseReplacement']>[0]) =>
    invoke<ServiceOperationMap['prepareDatabaseReplacement']['output']>(IPC_CHANNELS.prepareDatabaseReplacement, input),
  cancelDatabaseReplacement: (input: Parameters<RendererApi['cancelDatabaseReplacement']>[0]) =>
    invoke<ServiceOperationMap['cancelDatabaseReplacement']['output']>(IPC_CHANNELS.cancelDatabaseReplacement, input),
  inspectDatabaseReplacements: () =>
    invoke<ServiceOperationMap['inspectDatabaseReplacements']['output']>(IPC_CHANNELS.inspectDatabaseReplacements, {}),
  rollBackDatabaseReplacement: (input: Parameters<RendererApi['rollBackDatabaseReplacement']>[0]) =>
    invoke<ServiceOperationMap['rollBackDatabaseReplacement']['output']>(IPC_CHANNELS.rollBackDatabaseReplacement, input),
  prepareDatabaseMerge: (input: Parameters<RendererApi['prepareDatabaseMerge']>[0]) =>
    invoke<ServiceOperationMap['prepareDatabaseMerge']['output']>(IPC_CHANNELS.prepareDatabaseMerge, input),
  quitApplication: () => invoke<Awaited<ReturnType<RendererApi['quitApplication']>>>(IPC_CHANNELS.quitApplication, {}),
  cancelDatabaseExport: (input: Parameters<RendererApi['cancelDatabaseExport']>[0]) =>
    invoke<ServiceOperationMap['cancelDatabaseExport']['output']>(IPC_CHANNELS.cancelDatabaseExport, input),
  proposeSeriesKnowledge: (input: ServiceOperationMap['proposeSeriesKnowledge']['input']) =>
    invoke<ServiceOperationMap['proposeSeriesKnowledge']['output']>(IPC_CHANNELS.proposeSeriesKnowledge, input),
  inspectSeriesKnowledgeReview: (input: ServiceOperationMap['inspectSeriesKnowledgeReview']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesKnowledgeReview']['output']>(IPC_CHANNELS.inspectSeriesKnowledgeReview, input),
  editSeriesKnowledgeCandidate: (input: ServiceOperationMap['editSeriesKnowledgeCandidate']['input']) =>
    invoke<ServiceOperationMap['editSeriesKnowledgeCandidate']['output']>(IPC_CHANNELS.editSeriesKnowledgeCandidate, input),
  promoteSeriesKnowledge: (input: ServiceOperationMap['promoteSeriesKnowledge']['input']) =>
    invoke<ServiceOperationMap['promoteSeriesKnowledge']['output']>(IPC_CHANNELS.promoteSeriesKnowledge, input),
  inspectSeriesKnowledgeItems: (input: ServiceOperationMap['inspectSeriesKnowledgeItems']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesKnowledgeItems']['output']>(IPC_CHANNELS.inspectSeriesKnowledgeItems, input),
  inspectSeriesKnowledgeCandidates: (input: ServiceOperationMap['inspectSeriesKnowledgeCandidates']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesKnowledgeCandidates']['output']>(IPC_CHANNELS.inspectSeriesKnowledgeCandidates, input),
  inspectSeriesKnowledgeConflicts: (input: ServiceOperationMap['inspectSeriesKnowledgeConflicts']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesKnowledgeConflicts']['output']>(IPC_CHANNELS.inspectSeriesKnowledgeConflicts, input),
  inspectSeriesKnowledgeRevisions: (input: ServiceOperationMap['inspectSeriesKnowledgeRevisions']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesKnowledgeRevisions']['output']>(IPC_CHANNELS.inspectSeriesKnowledgeRevisions, input),
  inspectSeriesExclusionTargets: (input: ServiceOperationMap['inspectSeriesExclusionTargets']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesExclusionTargets']['output']>(IPC_CHANNELS.inspectSeriesExclusionTargets, input),
  inspectSeriesExclusionHistory: (input: ServiceOperationMap['inspectSeriesExclusionHistory']['input']) =>
    invoke<ServiceOperationMap['inspectSeriesExclusionHistory']['output']>(IPC_CHANNELS.inspectSeriesExclusionHistory, input),
  previewSeriesExclusion: (input: ServiceOperationMap['previewSeriesExclusion']['input']) =>
    invoke<ServiceOperationMap['previewSeriesExclusion']['output']>(IPC_CHANNELS.previewSeriesExclusion, input),
  recordSeriesExclusion: (input: ServiceOperationMap['recordSeriesExclusion']['input']) =>
    invoke<ServiceOperationMap['recordSeriesExclusion']['output']>(IPC_CHANNELS.recordSeriesExclusion, input),
  cancelReviewRun: (input: Omit<ServiceOperationMap['cancelReviewRun']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['cancelReviewRun']['output']>(IPC_CHANNELS.cancelReviewRun, input),
  applyChangeSuggestion: (input: ServiceOperationMap['applyChangeSuggestion']['input']) =>
    invoke<ServiceOperationMap['applyChangeSuggestion']['output']>(IPC_CHANNELS.applyChangeSuggestion, input),
  applyChangeSuggestionBatch: (input: ServiceOperationMap['applyChangeSuggestionBatch']['input']) =>
    invoke<ServiceOperationMap['applyChangeSuggestionBatch']['output']>(IPC_CHANNELS.applyChangeSuggestionBatch, input),
  reverseAppliedChangeSuggestion: (input: ServiceOperationMap['reverseAppliedChangeSuggestion']['input']) =>
    invoke<ServiceOperationMap['reverseAppliedChangeSuggestion']['output']>(IPC_CHANNELS.reverseAppliedChangeSuggestion, input),
  getManuscriptApplyOutcome: (input: ServiceOperationMap['getManuscriptApplyOutcome']['input']) =>
    invoke<ServiceOperationMap['getManuscriptApplyOutcome']['output']>(IPC_CHANNELS.getManuscriptApplyOutcome, input),
  inspectProposalConflict: (input: ServiceOperationMap['inspectProposalConflict']['input']) =>
    invoke<ServiceOperationMap['inspectProposalConflict']['output']>(IPC_CHANNELS.inspectProposalConflict, input),
  saveProposalConflictDraft: (input: ServiceOperationMap['saveProposalConflictDraft']['input']) =>
    invoke<ServiceOperationMap['saveProposalConflictDraft']['output']>(IPC_CHANNELS.saveProposalConflictDraft, input),
  resolveProposalConflict: (input: ServiceOperationMap['resolveProposalConflict']['input']) =>
    invoke<ServiceOperationMap['resolveProposalConflict']['output']>(IPC_CHANNELS.resolveProposalConflict, input),
  getManuscriptRail: (input: ServiceOperationMap['getManuscriptRail']['input']) =>
    invoke<ServiceOperationMap['getManuscriptRail']['output']>(IPC_CHANNELS.getManuscriptRail, input),
  runEditorClipboardCommand: (input: { command: EditorClipboardCommand }) =>
    invoke<{ state: 'done' }>(IPC_CHANNELS.runEditorClipboardCommand, input),
  recordManuscriptEntryPosition: (input: ServiceOperationMap['recordManuscriptEntryPosition']['input']) =>
    invoke<ServiceOperationMap['recordManuscriptEntryPosition']['output']>(
      IPC_CHANNELS.recordManuscriptEntryPosition,
      input,
    ),
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
  inspectDeliverables: () =>
    invoke<ServiceOperationMap['inspectDeliverables']['output']>(IPC_CHANNELS.inspectDeliverables),
  designatePublicationVersion: (input: Omit<ServiceOperationMap['designatePublicationVersion']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['designatePublicationVersion']['output']>(IPC_CHANNELS.designatePublicationVersion, input),
  inspectProductionDocuments: () =>
    invoke<ServiceOperationMap['inspectProductionDocuments']['output']>(IPC_CHANNELS.inspectProductionDocuments),
  inspectBookTasks: () =>
    invoke<ServiceOperationMap['inspectBookTasks']['output']>(IPC_CHANNELS.inspectBookTasks),
  askAboutSelection: (input: Parameters<RendererApi['askAboutSelection']>[0]) =>
    invoke<ServiceOperationMap['askAboutSelection']['output']>(IPC_CHANNELS.askAboutSelection, input),
  inspectDialogue: (input: Parameters<RendererApi['inspectDialogue']>[0]) =>
    invoke<ServiceOperationMap['inspectDialogue']['output']>(IPC_CHANNELS.inspectDialogue, input),
  stopDialogueAnswer: (input: Parameters<RendererApi['stopDialogueAnswer']>[0]) =>
    invoke<ServiceOperationMap['stopDialogueAnswer']['output']>(IPC_CHANNELS.stopDialogueAnswer, input),
  continueDialogueAnswer: (input: Parameters<RendererApi['continueDialogueAnswer']>[0]) =>
    invoke<ServiceOperationMap['continueDialogueAnswer']['output']>(IPC_CHANNELS.continueDialogueAnswer, input),
  regenerateDialogueAnswer: (input: Parameters<RendererApi['regenerateDialogueAnswer']>[0]) =>
    invoke<ServiceOperationMap['regenerateDialogueAnswer']['output']>(IPC_CHANNELS.regenerateDialogueAnswer, input),
  convertDialogueToChangeSuggestion: (input: Parameters<RendererApi['convertDialogueToChangeSuggestion']>[0]) =>
    invoke<ServiceOperationMap['convertDialogueToChangeSuggestion']['output']>(IPC_CHANNELS.convertDialogueToChangeSuggestion, input),
  inspectBookDeliveryPackage: () =>
    invoke<ServiceOperationMap['inspectBookDeliveryPackage']['output']>(IPC_CHANNELS.inspectBookDeliveryPackage),
  prepareBookDeliveryPackage: (input: Omit<ServiceOperationMap['prepareBookDeliveryPackage']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareBookDeliveryPackage']['output']>(IPC_CHANNELS.prepareBookDeliveryPackage, input),
  reviewBookDeliveryPackageExport: (input: Parameters<RendererApi['reviewBookDeliveryPackageExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['reviewBookDeliveryPackageExport']>>>(IPC_CHANNELS.reviewBookDeliveryPackageExport, input),
  chooseBookDeliveryPackageExportFolder: (input: Parameters<RendererApi['chooseBookDeliveryPackageExportFolder']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['chooseBookDeliveryPackageExportFolder']>>>(IPC_CHANNELS.chooseBookDeliveryPackageExportFolder, input),
  cancelBookDeliveryPackageExport: (input: Parameters<RendererApi['cancelBookDeliveryPackageExport']>[0]) =>
    invoke<boolean>(IPC_CHANNELS.cancelBookDeliveryPackageExport, input),
  approveBookDeliveryPackageExport: (input: Parameters<RendererApi['approveBookDeliveryPackageExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['approveBookDeliveryPackageExport']>>>(IPC_CHANNELS.approveBookDeliveryPackageExport, input),
  inspectMaintenanceCase: (input: Parameters<RendererApi['inspectMaintenanceCase']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['inspectMaintenanceCase']>>>(IPC_CHANNELS.inspectMaintenanceCase, input),
  listMaintenanceCases: (input: Parameters<RendererApi['listMaintenanceCases']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['listMaintenanceCases']>>>(IPC_CHANNELS.listMaintenanceCases, input),
  recordMaintenanceCase: (input: Parameters<RendererApi['recordMaintenanceCase']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['recordMaintenanceCase']>>>(IPC_CHANNELS.recordMaintenanceCase, input),
  appendMaintenanceCaseRevision: (input: Parameters<RendererApi['appendMaintenanceCaseRevision']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['appendMaintenanceCaseRevision']>>>(IPC_CHANNELS.appendMaintenanceCaseRevision, input),
  saveMaintenanceErrata: (input: Parameters<RendererApi['saveMaintenanceErrata']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['saveMaintenanceErrata']>>>(IPC_CHANNELS.saveMaintenanceErrata, input),
  createProductionDocument: (input: Omit<ServiceOperationMap['createProductionDocument']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['createProductionDocument']['output']>(IPC_CHANNELS.createProductionDocument, input),
  transitionProductionDocumentPhase: (input: Omit<ServiceOperationMap['transitionProductionDocumentPhase']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['transitionProductionDocumentPhase']['output']>(IPC_CHANNELS.transitionProductionDocumentPhase, input),
  decideProductionDocumentType: (input: Omit<ServiceOperationMap['decideProductionDocumentType']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['decideProductionDocumentType']['output']>(IPC_CHANNELS.decideProductionDocumentType, input),
  saveProductionDocumentVersion: (input: Omit<ServiceOperationMap['saveProductionDocumentVersion']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['saveProductionDocumentVersion']['output']>(IPC_CHANNELS.saveProductionDocumentVersion, input),
  recordProductionDocumentDelivery: (input: Omit<ServiceOperationMap['recordProductionDocumentDelivery']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['recordProductionDocumentDelivery']['output']>(IPC_CHANNELS.recordProductionDocumentDelivery, input),
  inspectGlobalAttention: () =>
    invoke<ServiceOperationMap['inspectGlobalAttention']['output']>(IPC_CHANNELS.inspectGlobalAttention, {}),
  reviewManuscriptExport: (input: Parameters<RendererApi['reviewManuscriptExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['reviewManuscriptExport']>>>(IPC_CHANNELS.reviewManuscriptExport, input),
  chooseManuscriptExportDestination: (input: Parameters<RendererApi['chooseManuscriptExportDestination']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['chooseManuscriptExportDestination']>>>(IPC_CHANNELS.chooseManuscriptExportDestination, input),
  approveManuscriptExport: (input: Parameters<RendererApi['approveManuscriptExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['approveManuscriptExport']>>>(IPC_CHANNELS.approveManuscriptExport, input),
  revealManuscriptExport: (input: Parameters<RendererApi['revealManuscriptExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['revealManuscriptExport']>>>(IPC_CHANNELS.revealManuscriptExport, input),
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
