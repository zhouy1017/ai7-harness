import type { RendererApi } from '../shared/protocol.js';
export interface NavigationCheckpoint { readonly isCurrent: () => boolean }

/** The shell derives navigation from destination identity. Different destinations
 * supersede pending intents and old page reads; repainting the same destination does neither. */
export class NavigationGeneration {
  private intent = 0;
  private page = 0;
  private destination: string | symbol | undefined;
  bookId: string | null = null;

  begin(): NavigationCheckpoint {
    this.intent += 1;
    return this.route();
  }

  route(): NavigationCheckpoint {
    const intent = this.intent;
    return { isCurrent: () => intent === this.intent };
  }

  commit(destination: string | symbol = Symbol(), bookId: string | null = null): void {
    if (destination !== this.destination) {
      this.intent += 1;
      this.page += 1;
      this.destination = destination;
    }
    this.bookId = bookId;
  }

  read(root: HTMLElement): NavigationCheckpoint {
    const page = this.page;
    return { isCurrent: () => page === this.page && root.isConnected };
  }
}

export const navigation = new NavigationGeneration();

// These calls require or establish the window's Book route/capabilities in main.
// Unrelated house-wide reads and settings must remain available during a leave.
const BOOK_OWNERSHIP_CALLS = new Set<keyof RendererApi>([
  'abandonImportDraft', 'acceptReimportDegradation', 'answerBaselineAnalysisClarification', 'appendMaintenanceCaseRevision',
  'applyChangeSuggestion', 'applyChangeSuggestionBatch', 'approveManuscriptExport', 'askAboutSelection',
  'authorizeBaselineAnalysis', 'authorizeEvaluationRewrite', 'authorizeInitialEvaluation', 'authorizeReadersReport',
  'authorizeReviewRun', 'authorizeTaskAuthorization', 'authorizeWritingTask', 'batchProposalDecisionDraft',
  'cancelBaselineAnalysisRun', 'cancelReviewRun', 'cancelServiceJob', 'cancelWaitingBaselineAnalysis',
  'cancelWaitingTask', 'chooseBookDeliveryPackageArchiveDestination', 'chooseBookDeliveryPackageExportFolder', 'chooseManuscriptExportDestination',
  'commitManuscriptReimport', 'commitNewBookImport', 'commitReplacement', 'commitReplacementRevisions',
  'commitSourceImport', 'continueImportDraft', 'continueReviewRun', 'convertDialogueToChangeSuggestion',
  'createEditorialMark', 'createProductionDocument', 'createReadersReportDraft', 'createWritingDraft',
  'decideEvaluationRewrite', 'decideProductionDocumentType', 'deferRecovery', 'designatePublicationVersion',
  'discardAgentWorkspaceProposals', 'dismissReplacementPreview', 'editBaselineAnalysisPlan', 'enableEditorialWorkspaceProfile',
  'enrollBackgroundAnalysis', 'flushJournalEdit', 'freezeReplacement', 'generateReviewReport',
  'getAnalysisRevisionOverview', 'getAnalysisRevisionUnits', 'getAnalysisRunReportRows', 'getBaselineAnalysisPage',
  'getBaselineAnalysisRangePlan', 'getBookOverview', 'getBookWorkbenchRoute', 'getCoverageManifestUnits',
  'getEditorialMarkCard', 'getHistoricalRevision', 'getImportStartup', 'getManuscriptApplyOutcome',
  'getManuscriptRail', 'getManuscriptWindow', 'getManuscriptWindowAt', 'getOutline',
  'getReimportLineageSourceVersionPage', 'getReimportMappingPage', 'getSearchResults', 'getStartup',
  'getTaskPlanPage', 'holdBackgroundAnalysisEnrollment', 'inspectAgentWorkspace', 'inspectAiEditLocks',
  'inspectAnalysisFeedback', 'inspectApplyReceipt', 'inspectBackgroundAnalysisEnrollment', 'inspectBaselineAnalysis',
  'inspectBookDeliveryPackage', 'inspectBookFindings', 'inspectBookTasks', 'inspectCapturedProcedureApplicability',
  'inspectCapturedProcedureRun', 'inspectCustomAnalysisDimensions', 'inspectDeliverables', 'inspectDialogue',
  'inspectEditorialWorkspaceProfile', 'inspectEvaluation', 'inspectFastInteractionRequest', 'inspectFastInteractionRoutes',
  'inspectForegroundExecutionBoundary', 'inspectMaintenanceCase', 'inspectParagraphAnalysis', 'inspectProcedureCapture',
  'inspectProductionDocuments', 'inspectProposalConflict', 'inspectProposalWorkspace', 'inspectReviewFindingOfMark',
  'inspectReviewWorkspace', 'inspectScopedAiEdit', 'inspectTaskAuthorization', 'inspectTaskIntentDrafts',
  'inspectTaskPlan', 'inspectWritingTask', 'installEditorialWorkspaceProfile', 'launchReviewRun',
  'listMaintenanceCases', 'openBookWorkbench', 'polishSelection', 'pollServiceJob',
  'prepareBaselineAnalysis', 'prepareBookDeliveryPackage', 'prepareCustomAnalysis', 'prepareEvaluationRewrite',
  'prepareInitialEvaluation', 'prepareManuscriptReimport', 'prepareReadersReport', 'prepareReplacement',
  'prepareReverseApply', 'prepareReviewRun', 'prepareTaskAuthorization', 'prepareWritingTask',
  'previewTaskLaunch', 'promoteAgentWorkspaceProposals', 'promoteAnswerToTaskIntentDraft', 'promoteTaskIntentDraft',
  'proposeAgentWorkspaceChangeSet', 'proposeSeriesKnowledge', 'quickStartBaselineAnalysis', 'quickStartReviewRun',
  'quickStartWritingTask', 'readManuscriptImageChunk', 'recommendProcedures', 'recordAnalysisFeedback',
  'recordChangeSuggestionDecision', 'recordMaintenanceCase', 'recordManuscriptEntryPosition', 'recordProductionDocumentDelivery',
  'recordProposalDecision', 'recordProposalDecisionFeedback', 'recordProposalDecisionReason', 'recordReviewFindingDisposition',
  'redoManuscript', 'redoTaskPlan', 'regenerateProposalConflictUnit', 'renameProductionDocument',
  'reselectImportDraft', 'resolveProposalConflict', 'resolveReimportMapping', 'resolveUnconfirmedOutcomes',
  'restoreRecovery', 'revealManuscriptExport', 'reverseAppliedChangeSuggestion', 'reviewBookDeliveryPackageExport',
  'reviewManuscriptExport', 'revokeBackgroundAnalysisEnrollment', 'saveCapturedProcedure', 'saveEvaluation',
  'saveMaintenanceErrata', 'saveMilestone', 'saveProductionDocumentVersion', 'saveProposalConflictDraft',
  'saveProposalDecisionDraft', 'saveTaskIntentDraft', 'setAiEditLocks', 'setDefaultExecutionRule',
  'startBaselineAnalysisWhenOnline', 'startEvaluation', 'startReplacementCommit', 'startScopedAiEdit',
  'startSearch', 'startTaskWhenIdle', 'startTaskWhenOnline', 'transitionProductionDocumentPhase',
  'undoManuscript', 'updateEditorialMark', 'updateProductionDocumentMeta',
]);

/** One boundary for the capability-revoking leave and subsequent Book-scoped calls.
 * Callers need neither a leave counter nor their own route-reacquisition check. */
export function reconcileBookWorkbenchApi<Api extends RendererApi>(raw: Api, shell: {
  bookOnScreen(): string | null;
  left(): void;
  editorOnScreen?(): { manuscriptId: string; branchId: string } | null;
  failed(error: unknown): void;
}, owner: NavigationGeneration = navigation): Api {
  let pending: Promise<unknown> | null = null;
  const wrappers = new Map<PropertyKey, unknown>();
  const settled = async (): Promise<void> => { while (pending !== null) await pending.then(() => undefined, () => undefined); };
  const reconcile = async (leave: NavigationCheckpoint): Promise<void> => {
    if (leave.isCurrent()) { shell.left(); return; }
    let held: string | null = null;
    for (;;) {
      const wanted = shell.bookOnScreen();
      if (wanted === held) {
        if (wanted === null) { shell.left(); return; }
        const editor = shell.editorOnScreen?.() ?? null;
        if (editor !== null) await raw.getManuscriptWindow({ ...editor, cursor: null });
        const now = shell.editorOnScreen?.() ?? null;
        if (shell.bookOnScreen() === held && now?.manuscriptId === editor?.manuscriptId && now?.branchId === editor?.branchId) return;
        continue;
      }
      if (wanted === null) { await raw.leaveBookWorkbench(); held = null; continue; }
      const opened = await raw.openBookWorkbench({ kind: 'book', bookId: wanted });
      if (opened.target !== 'requesting-window') throw new Error('AI7_EDITOR_ROUTE_INVALID');
      held = wanted;
    }
  };
  return new Proxy({ ...raw }, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function' || String(key).startsWith('on')) return value;
      if (!wrappers.has(key)) wrappers.set(key, (...args: unknown[]) => {
        const invoke = (): unknown => Reflect.apply(value, raw, args);
        if (key !== 'leaveBookWorkbench') return pending === null || !BOOK_OWNERSHIP_CALLS.has(key as keyof RendererApi) ? invoke() : settled().then(invoke);
        const previous = pending;
        const leave = owner.route();
        const leaving = (async () => {
          if (previous !== null) await previous.then(() => undefined, () => undefined);
          const answer = await raw.leaveBookWorkbench();
          try { await reconcile(leave); } catch (error) { shell.failed(error); throw error; }
          return answer;
        })();
        // Register before yielding; reconciliation calls raw directly and cannot wait on itself.
        pending = leaving;
        void leaving.finally(() => { if (pending === leaving) pending = null; }).catch(() => undefined);
        return leaving;
      });
      return wrappers.get(key);
    },
  });
}

// All renderer surfaces share this client, including modules that historically read
// the preload API directly. The shell installs the one ownership boundary at bootstrap.
let boundApi: typeof window.ai7 | undefined;
export function bindRendererApi(api: typeof window.ai7): void { boundApi = api; }
const sourceApi = (): typeof window.ai7 => boundApi ?? window.ai7;
export const rendererApi = new Proxy({} as typeof window.ai7, {
  get: (_target, key) => Reflect.get(sourceApi(), key),
  ownKeys: () => Reflect.ownKeys(sourceApi()),
  getOwnPropertyDescriptor: (_target, key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(sourceApi(), key);
    return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
  },
});
