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
  inspectReviewGuidelines: () =>
    invoke<ServiceOperationMap['inspectReviewGuidelines']['output']>(IPC_CHANNELS.inspectReviewGuidelines),
  previewReviewGuidelineVersion: (input: { documentId: string }) =>
    invoke<ServiceOperationMap['previewReviewGuidelineVersion']['output'] | null>(IPC_CHANNELS.previewReviewGuidelineVersion, input),
  importReviewGuidelineVersion: (input: ServiceOperationMap['importReviewGuidelineVersion']['input']) =>
    invoke<ServiceOperationMap['importReviewGuidelineVersion']['output']>(IPC_CHANNELS.importReviewGuidelineVersion, input),
  inspectExemplars: (input?: ServiceOperationMap['inspectExemplars']['input']) =>
    invoke<ServiceOperationMap['inspectExemplars']['output']>(IPC_CHANNELS.inspectExemplars, input ?? { after: null }),
  inspectKnowledgeProcedures: () => invoke<ServiceOperationMap['inspectKnowledgeProcedures']['output']>(IPC_CHANNELS.inspectKnowledgeProcedures),
  inspectLibraryMaterials: (input?: ServiceOperationMap['inspectLibraryMaterials']['input']) =>
    invoke<ServiceOperationMap['inspectLibraryMaterials']['output']>(IPC_CHANNELS.inspectLibraryMaterials, input ?? { after: null }),
  inspectLibraryMaterial: (input: ServiceOperationMap['inspectLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['inspectLibraryMaterial']['output']>(IPC_CHANNELS.inspectLibraryMaterial, input),
  previewLibraryMaterial: () =>
    invoke<ServiceOperationMap['previewLibraryMaterial']['output'] | null>(IPC_CHANNELS.previewLibraryMaterial),
  addLibraryMaterial: (input: ServiceOperationMap['addLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['addLibraryMaterial']['output']>(IPC_CHANNELS.addLibraryMaterial, input),
  decideLibraryMaterial: (input: ServiceOperationMap['decideLibraryMaterial']['input']) =>
    invoke<ServiceOperationMap['decideLibraryMaterial']['output']>(IPC_CHANNELS.decideLibraryMaterial, input),
  inspectEvaluationProfiles: () => invoke<ServiceOperationMap['inspectEvaluationProfiles']['output']>(IPC_CHANNELS.inspectEvaluationProfiles),
  inspectEvaluation: (input: { recordId: string | null }) =>
    invoke<ServiceOperationMap['inspectEvaluation']['output']>(IPC_CHANNELS.inspectEvaluation, input),
  startEvaluation: () => invoke<ServiceOperationMap['startEvaluation']['output']>(IPC_CHANNELS.startEvaluation),
  saveEvaluation: (input: Omit<ServiceOperationMap['saveEvaluation']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['saveEvaluation']['output']>(IPC_CHANNELS.saveEvaluation, input),
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
  inspectBookDeliveryPackage: () =>
    invoke<ServiceOperationMap['inspectBookDeliveryPackage']['output']>(IPC_CHANNELS.inspectBookDeliveryPackage),
  prepareBookDeliveryPackage: (input: Omit<ServiceOperationMap['prepareBookDeliveryPackage']['input'], 'bookId'>) =>
    invoke<ServiceOperationMap['prepareBookDeliveryPackage']['output']>(IPC_CHANNELS.prepareBookDeliveryPackage, input),
  reviewBookDeliveryPackageExport: (input: Parameters<RendererApi['reviewBookDeliveryPackageExport']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['reviewBookDeliveryPackageExport']>>>(IPC_CHANNELS.reviewBookDeliveryPackageExport, input),
  chooseBookDeliveryPackageExportFolder: (input: Parameters<RendererApi['chooseBookDeliveryPackageExportFolder']>[0]) =>
    invoke<Awaited<ReturnType<RendererApi['chooseBookDeliveryPackageExportFolder']>>>(IPC_CHANNELS.chooseBookDeliveryPackageExportFolder, input),
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
