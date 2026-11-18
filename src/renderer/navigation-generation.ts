import type { RendererApi } from '../shared/protocol.js';
export interface NavigationCheckpoint { readonly isCurrent: () => boolean }

/** The shell derives navigation from destination identity. Different destinations
 * supersede pending intents and old page reads; repainting the same destination does neither. */
export class NavigationGeneration {
  private intent = 0;
  private page = 0;
  private destination: string | symbol | undefined;
  private readonly presentationFailures = new WeakMap<object, NavigationCheckpoint>();
  bookId: string | null = null;

  begin(): NavigationCheckpoint {
    this.intent += 1;
    return this.route();
  }

  route(): NavigationCheckpoint {
    const intent = this.intent;
    return { isCurrent: () => intent === this.intent };
  }

  /** Answers whether this is another destination; a repaint of the one on screen is not. */
  commit(destination: string | symbol = Symbol(), bookId: string | null = null): boolean {
    const changed = destination !== this.destination;
    if (changed) {
      this.intent += 1;
      this.page += 1;
      this.destination = destination;
    }
    this.bookId = bookId;
    return changed;
  }

  read(root: HTMLElement): NavigationCheckpoint {
    const page = this.page;
    return { isCurrent: () => page === this.page && root.isConnected };
  }

  /** A synchronous paint may commit its destination before throwing. Its own
   * commit does not abandon the error, but any later navigation still does. */
  present(draw: () => void): void {
    try { draw(); } catch (error) {
      this.recordPresentationFailure(error);
      throw error;
    }
  }

  /** The same contract for a paint that reads before it draws: its rejection is the failure, not an unhandled one. */
  async presentAsync(draw: () => Promise<void>): Promise<void> {
    try { await draw(); } catch (error) {
      this.recordPresentationFailure(error);
      throw error;
    }
  }

  private recordPresentationFailure(error: unknown): void {
    if (error !== null && typeof error === 'object') this.presentationFailures.set(error, this.route());
  }

  errorIsCurrent(error: unknown, origin: NavigationCheckpoint): boolean {
    return origin.isCurrent() || (error !== null && typeof error === 'object' && this.presentationFailures.get(error)?.isCurrent() === true);
  }
}

export const navigation = new NavigationGeneration();

export class BookHeldElsewhereError extends Error {
  constructor() { super('这本书已在另一个窗口打开。'); }
}

export function bookOwnershipFailureLine(error: unknown): string {
  if (error instanceof BookOwnershipFailure) return error.message;
  return error instanceof BookHeldElsewhereError
    ? '这本书已在另一个窗口打开。当前页未保存的修改仍保留在这里，尚未写入图书。请先复制这些修改，再切换到那个窗口继续；也可使用本页「重试连接当前图书」。'
    : '暂时无法重新连接当前图书。未保存的修改仍保留在当前页，请使用本页「重试连接当前图书」后保存。';
}

export class BookOwnershipFailure extends Error {
  constructor(error: unknown, readonly recovered: Promise<void>) { super(bookOwnershipFailureLine(error), { cause: error }); }
}

const journalSenders = new WeakMap<object, (input: Parameters<RendererApi['flushJournalEdit']>[0], action: object) => ReturnType<RendererApi['flushJournalEdit']>>();
/** Only the journal sender opts into an automatic attempt. Timer retries retain
 * the editor's action identity; a new edit or explicit save starts a new one. */
export function sendJournalEdit(api: Pick<RendererApi, 'flushJournalEdit'>, input: Parameters<RendererApi['flushJournalEdit']>[0], action: object): ReturnType<RendererApi['flushJournalEdit']> {
  return journalSenders.get(api)?.(input, action) ?? api.flushJournalEdit(input);
}

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
  'launchBaselineAnalysis', 'launchCustomAnalysis', 'launchInitialEvaluation', 'launchReadersReport',
  'launchEvaluationRewrite', 'launchWritingTask', 'pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun',
  'controlTaskRun', 'editTaskPlan', 'stopDialogueAnswer', 'continueDialogueAnswer', 'regenerateDialogueAnswer',
  'saveProductionDocumentType', 'deleteProductionDocumentType', 'reorderProductionDocumentTypes',
  'approveBookDeliveryPackageArchiveExport', 'approveBookDeliveryPackageExport',
  'cancelBookDeliveryPackageArchiveExport', 'cancelBookDeliveryPackageExport', 'inspectHouseWordList', 'saveHouseWordList',
]);

/** One boundary for the capability-revoking leave and subsequent Book-scoped calls.
 * Callers need neither a leave counter nor their own route-reacquisition check. */
export function reconcileBookWorkbenchApi<Api extends RendererApi>(raw: Api, shell: {
  bookOnScreen(): string | null;
  left(): void;
  editorOnScreen?(): { manuscriptId: string; branchId: string } | null;
  failed(error: unknown, retry: () => Promise<void>): void;
  recovered?(): void;
}, owner: NavigationGeneration = navigation): Api {
  let pending: Promise<unknown> | null = null;
  let retryRequired = false;
  let held: string | null = null;
  let failure: BookOwnershipFailure | null = null;
  let recovered = Promise.withResolvers<void>();
  const attemptedActions = new WeakSet<object>();
  const wrappers = new Map<PropertyKey, unknown>();
  const settled = async (): Promise<void> => {
    while (pending !== null) try { await pending; } catch (error) { if (retryRequired) throw error; }
  };
  const leavesSettled = async (): Promise<void> => {
    while (pending !== null) await pending.then(() => undefined, () => undefined);
  };
  const reconcile = async (leave?: NavigationCheckpoint): Promise<void> => {
    if (leave?.isCurrent()) { shell.left(); return; }
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
      if (held !== null) { await raw.leaveBookWorkbench(); held = null; continue; }
      const opened = await raw.openBookWorkbench({ kind: 'book', bookId: wanted!, activation: 'non-activating' });
      if (opened.target !== 'requesting-window') throw new BookHeldElsewhereError();
      held = wanted;
    }
  };
  const tracked = <T>(attempt: Promise<T>): Promise<T> => {
    pending = attempt;
    void attempt.finally(() => { if (pending === attempt) pending = null; }).catch(() => undefined);
    return attempt;
  };
  const recover = async (leave?: NavigationCheckpoint): Promise<void> => {
    try { await reconcile(leave); clearFailure(); }
    catch (error) {
      retryRequired = true;
      const next = new BookOwnershipFailure(error, recovered.promise);
      if (failure?.message !== next.message) { failure = next; shell.failed(failure, retry); }
      throw failure;
    }
  };
  const clearFailure = (): void => {
    retryRequired = false;
    failure = null;
    // An old Book's paused readers must not resume against a different Book.
    if (held === shell.bookOnScreen()) recovered.resolve();
    recovered = Promise.withResolvers<void>();
    shell.recovered?.();
  };
  const retry = (): Promise<void> => {
    if (pending !== null) return settled();
    if (!retryRequired) return Promise.resolve();
    return tracked(recover());
  };
  const api = new Proxy({ ...raw }, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function' || String(key).startsWith('on')) return value;
      if (!wrappers.has(key)) wrappers.set(key, (...args: unknown[]) => {
        const invoke = (): unknown => Reflect.apply(value, raw, args);
        if (key !== 'leaveBookWorkbench') {
          if (!BOOK_OWNERSHIP_CALLS.has(key as keyof RendererApi)) return invoke();
          if (key === 'getBookWorkbenchRoute' || key === 'openBookWorkbench') {
            // Route inspection and an explicit open retain their normal main-process
            // behaviour even when the page's non-activating re-acquisition failed.
            if (pending === null && !retryRequired) return invoke();
            const open = async (): Promise<unknown> => {
              const answer = await invoke() as Awaited<ReturnType<RendererApi['openBookWorkbench']>>;
              if (key === 'openBookWorkbench' && answer?.target === 'requesting-window') { held = answer.route.bookId; clearFailure(); }
              return answer;
            };
            return pending === null ? open() : leavesSettled().then(open);
          }
          const call = (): unknown => failure === null ? invoke() : Promise.reject(failure);
          return pending === null ? call() : settled().then(call);
        }
        const previous = pending;
        const leave = owner.route();
        const leaving = (async () => {
          if (previous !== null) await previous.then(() => undefined, () => undefined);
          const answer = await raw.leaveBookWorkbench();
          held = null;
          await recover(leave);
          return answer;
        })();
        // Register before yielding; reconciliation calls raw directly and cannot wait on itself.
        return tracked(leaving);
      });
      return wrappers.get(key);
    },
  });
  journalSenders.set(api, async (input, action) => {
    if (retryRequired && !attemptedActions.has(action)) { attemptedActions.add(action); await retry(); }
    return api.flushJournalEdit(input);
  });
  return api;
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
