import { createLibraryScreen } from './library-screen.js';
import { createBookOverviewScreen } from './book-overview-screen.js';
import { createSettingsScreens } from './settings-screens.js';
import { createGlobalPages } from './global-pages.js';
import { navigation, reconcileBookWorkbenchApi, bindRendererApi, bookOwnershipFailureLine, type NavigationCheckpoint } from './navigation-generation.js';


import { mountMenuControls, mountSelectControls } from './components/controls.js';
import { createStatusSurface } from './notifications.js';
import { technicalWords, identityWords, technicalLayerVisible, collectTechnicalDisclosures, initializeTechnicalLayer, resetTechnicalLayer, technicalDisclosure } from './technical-layer.js';
import { ScreenReturnHistory } from './screen-return.js';
import { startPreparedTask } from './one-action-start.js';
import { createModelServiceSettings } from './model-service-settings.js';
import { createKnowledgeBase } from './knowledge-base.js';
import { createDataStorage } from './data-storage.js';
import { mountManuscriptScreen, documentContextOf, type ManuscriptScreen } from './manuscript-screen.js';
import { mountGlobalAgent } from './global-agent.js';
import { createAppearance, initializeReducedMotion } from './appearance.js';
import { mountFindingsCenter } from './findings-center.js';
import { createCommandPalette } from './command-palette.js';
import { applyFindingBatches } from './manuscript-apply.js';

import { mountAgentWorkspace } from './agent-workspace.js';
import { AGENT_WORKSPACE_WORDS } from './agent-workspace-labels.js';
import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';
import type { BookFindingProjection, ProductionDocumentProjection } from '../shared/protocol.js';


import { mountDiagnostics } from './diagnostics.js';
import { DIAGNOSTICS_OPENED } from './diagnostics-labels.js';
import { mountProposalWorkspace } from './proposal-workspace.js';
import { researchUnavailableLine } from '../shared/research-status.js';
import { preserveReturnPlace, readReturnPlace, type ReadingPlace } from './reading-return.js';
import type { AgentWorkspacePromotionProjection, BaselineAnalysisGoal, BaselineAnalysisWireProjection as BaselineAnalysisProjection, BookTaskItemProjection, DefaultExecutionRuleReference, QuickStartBaselineAnalysisWireResult as QuickStartBaselineAnalysisResult, BaselineAnalysisUpdateRequest, BookManuscriptAnchorProjection, BookRecordPresentation, BookSummaryPageProjection, BookWorkbenchRoute, BookWorkOverviewProjection, ContinueImportProjection, ForegroundExecutionBoundaryProjection, GlobalAttentionItemProjection, ImportCommitProjection, ManuscriptReimportCommitProjection, ImportDraftRecoveryProjection, ImportStartupProjection, HistoricalRevisionProjection, ManuscriptWindowProjection, PriorWorkItemProjection, RecoveryComparisonProjection, RecoveryRestorationProjection, RecoverySelection, RecoveryWindowProjection, ResolvedBookWorkbenchRoute, ReviewBeforeImportProjection, ReviewBeforeSourceImportProjection, ServiceWireJobProjection as ServiceJobProjection, StagedImportProjection, StartupProjection, TaskAuthorizationProjection, TaskPlanKind, TaskPlanProjection } from '../shared/protocol.js';
import { createNotificationObserver, mountQuietNotice, openCurrentBookCompletion } from './notifications.js';

import { J03_TASK_GOAL } from '../shared/protocol.js';

import { mountDeliverables, type DeliverablesSurface } from './deliverables.js';

import { mountEvaluation } from './evaluation.js';
import { mountResearchEvidence } from './research-evidence.js';
import { SOURCES_STATUS, SOURCES_TITLE } from './research-evidence-labels.js';
import type { AnalysisFeedbackDimension } from '../shared/analysis-feedback.js';
import type { LearningMaterialTarget } from '../shared/protocol.js';
import { mountWordTrackedEditDetail } from './quality-learning.js';
import type { FeedbackHistoryTarget } from '../shared/protocol.js';

import { mountSeries, mountSeriesList } from './series.js';
import { mountBackgroundAnalysis } from './background-analysis.js';
import { activeCommandBindings, BOOK_SECTION_COMMANDS, configureCommandLabels, createCommandDispatcher, refreshShortcutLabels, type CommandPlatform } from './commands.js';
import { BACK_COMMAND_ENTRIES } from './commands-labels.js';




import { SERIES_BACK_TO_LIST, SERIES_LEDE, SERIES_STATUS, SERIES_TITLE } from './series-labels.js';

import { EVALUATION_STATUS } from './evaluation-labels.js';
import { openTaskResultWindow, type TaskResultWindow } from './task-result-window.js';
import { TASK_PANEL_COMPOSE_STATUS, TASK_PANEL_JUMP_GONE, TASK_PANEL_LEAVE_STATUS, returnChipPlace } from './task-panel-labels.js';

import { DOCUMENT_STATUS_LINES, showRestoreStands } from './production-document-labels.js';
import type { ProductionDocumentContext } from './production-document-lens.js';
import { mountDerivativesWorkspace } from './derivatives-workspace.js';
import { conflictCompletionOn } from './proposal-conflict-labels.js';
import { fidelityDetailText, fidelityDisclosureSummary, fidelityOutcomeLabel, WORD_IMPORT_MODE_NAMES } from './import-fidelity-labels.js';
import { mountProposalConflict, type ProposalConflictSurface } from './proposal-conflict.js';
import { DELIVERABLES_STATUS_LINES } from './deliverables-labels.js';
import { ViewPreferences, mountRegionSeparator } from './layout.js';
import { createGlobalAttentionReader, mountGlobalAttentionEntry, type GlobalAttentionSurface } from './global-attention.js';
import { mountProcessingIndicator } from './processing-indicator.js';
import { bookIdentityRows, recoveryIdentityRows } from './technical-layer-labels.js';

import { analysisRefusalView } from './overview-refusal-labels.js';
import { SELECTION_TASK_STATUS, selectionProcedureEntries, selectionProcedureStepReason, selectionTaskChoices, type SelectionProcedureEntry, type SelectionTaskChoice, type SelectionTaskChoices, SELECTION_TASK_PICK_RANGE } from './selection-task-labels.js';
import type { SelectionSpanReading } from './editorial-marks.js';
import type { ComposerRange } from './task-panel.js';
import { mountReviewWorkspace, type ReviewFocus, type ReviewWorkspaceSurface } from './review-workspace.js';
import { mountProcedureRecommendationSlots } from './procedure-choice.js';
import { mountTaskDrawer } from './task-drawer.js';
import { TASK_DRAWER_TITLE, TASK_PLAN_OPEN, TASK_PLAN_OPEN_START, taskPlanQuickStartFellBack, taskPlanSummaryLine } from './task-drawer-labels.js';
import { REVIEW_STATUS_LINES } from './review-labels.js';
import { localInstantLabel, taskAuthorizationDispatchNote } from './plan-preview-labels.js';
import { MAX_PINNED_BOOKS, type ShellBookEntry, type ShellBookSection } from '../shared/preferences.js';
import { mountShell, ShellPreferences, type ShellPlace } from './shell.js';



import { SETTINGS_HUB_GROUPS, SHELL_LABELS } from './shell-labels.js';
import { createBaselineAnalysisCard, analysisTabChoice, type AnalysisTabId } from './baseline-analysis-card.js';
import { createImportReview, type RecoveryReturnContext } from './import-review.js';
import { type TaskOverviewSurface } from './tasks-overview.js';
import { taskOverviewApi } from './task-overview-api.js';
import type { RendererApi } from '../shared/protocol.js';

function requiredElement(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
  return node;
}

const screen = requiredElement('#screen');
if (!window.ai7) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
const api = reconcileBookWorkbenchApi(window.ai7, {
  bookOnScreen: () => navigation.bookId,
  editorOnScreen: () => manuscriptOnScreen === null ? null : { manuscriptId: manuscriptOnScreen.manuscriptId, branchId: manuscriptOnScreen.branchId },
  left: () => shell.leaveBook(),
  failed: reportBookReacquisitionFailure,
  recovered: clearBookReacquisitionNotice,
});
bindRendererApi(api);
const unmountSelectControls = mountSelectControls(document.body);
window.addEventListener('pagehide', unmountSelectControls, { once: true });
const unmountMenuControls = mountMenuControls(document.body);
window.addEventListener('pagehide', unmountMenuControls, { once: true });
const persistenceStatus = requiredElement('#persistence-status');
const updateStatusSurface = createStatusSurface(persistenceStatus);
/** Incremented on every status update so a delayed completion cannot overwrite a newer message. */
let statusRevision = 0;

/**
 * How each surface on screen that raises a Task reads it again, by the Task's kind: J-03's card on
 * 工作概览, ②A, ②B, and 工作概览's one-line summaries. The drawer's bar starts a Task or reconfirms its plan
 * (Issue #420, S74a), so the surface beside it must show that at once. Every screen change clears it; a
 * surface registers once it is on screen.
 */
let taskSurfaceRefresh: Partial<Record<TaskPlanKind, () => void>> = {};

/**
 * The Task Drawer (Issue #418, plan slice S72): mounted once, at the shell, beside whichever central
 * destination of the same Book is on screen (task-drawer.ts). The surfaces that raise a Task only open it;
 * since Issue #420 (S74a) its authorization bar is where every Task is started.
 */
let overviewDrawerBookId: string | null = null;
const overviewApi = taskOverviewApi(api, () => overviewDrawerBookId);
const taskDrawer = mountTaskDrawer({
  root: requiredElement('#task-drawer'),
  shell: document.body,
  api: overviewApi,
  openTaskOverview: () => void leaveThen(async () => renderTaskOverview()),
  technicalDetails,
  errorMessage: rendererErrorMessage,
  errorCode: (error) => rendererErrorData(error)?.code ?? null,
  setStatus,
  awaitServiceJob,
  onOpen: () => {
    manuscriptOnScreen?.closeSupportingPanel();
    if (taskDrawer.view()?.kind === 'launch') taskResultWindow?.close(false);
  },
  onRecorded: (kind, bookId, ref) => {
    taskSurfaceRefresh[kind]?.();
    taskOverviewSurface?.refresh();
    // A Run started or changed here is read at once, so 待我处理 follows it in flight to its outcome and the quiet completion
    // notice hears it without the editor leaving the screen (Issue #937; NOTIF-003).
    globalAttentionReader.refresh();
    if (kind === 'review-run') manuscriptOnScreen?.followReviewMarks(bookId, ref);
  },
  openRunSurface: (plan) => {
    if ((screen.firstElementChild as HTMLElement | null)?.dataset['screen'] === 'task-overview') taskDrawer.open({ bookId: plan.bookId, kind: plan.kind, ref: plan.ref }, () => null, undefined, { view: 'run' });
    else void leaveThen(() => openTaskRunSurface(plan));
  },
  openConnectionSettings: () => void renderModelServiceSettings(),
  openRules: () => void renderKnowledgeBase(technicalLayerVisible ? 'rules' : 'guidelines'),
  // ① 任务面 (Issue #423, S77a): a card's own record, 查看结果's floating window and 发起全书任务.
  openTaskTarget: (target) => void leaveThen(() => openGlobalAttentionTarget(target)),
  openTaskResult: (entry, backToPanel) => openTaskResult(entry, backToPanel),
  startWholeBookTask: (bookId, input) => startWholeBookTask(bookId, input),
  // 跳到所选文字 on a selection Task's card (Issue #423, S77 deferred item d): every refusal is said on the status line.
  jumpToSelection: (bookId, selection) => void jumpToSelectionText(bookId, selection),
  // 就这段提问… (Issue #52, S17a): 回到所选文字, and a 修改建议 made from an answer opened on the manuscript with its card.
  dialogueJump: (bookId, target) => void jumpToManuscript(bookId, { manuscriptId: target.manuscriptId, blockId: target.blockId, markId: null }),
  dialogueConverted: (dialogue, markId) => void jumpToManuscript(dialogue.bookId, { manuscriptId: dialogue.manuscriptId, blockId: dialogue.range.blockId, markId }),
  // The Context-bound Task Composer (Issue #423, wave 10 slice 7a; TASK-001 to 009, 046): the whole-Book composer names its Book;
  // 再选一段加入 takes the words selected in that Book's manuscript on screen; the house's 工序 open the composer beside them.
  wholeBookSeed: async (bookId) => {
    const read = await api.inspectTaskIntentDrafts({ draftId: null });
    if (read.bookId !== bookId) throw new Error(SELECTION_TASK_PICK_RANGE);
    return { bookId, bookTitle: read.bookTitle, origin: 'composer-book', manuscript: null, ranges: [] };
  },
  pickRange: async (bookId) => {
    const showing = manuscriptOnScreen;
    if (showing === null || showing.bookId !== bookId) return SELECTION_TASK_PICK_RANGE;
    const reading = await showing.selectionSpan();
    return typeof reading === 'string' ? reading : composerRangeOf(reading);
  },
  openProcedures: (bookId, range) => {
    const showing = manuscriptOnScreen;
    if (showing !== null && showing.bookId === bookId && range.span !== null) showing.composeProcedures(range.span);
  },
  settle: () => settleScreen(),
  resumeDraft: (bookId, resume) => void requestBookWorkbenchRoute({ kind: 'book', bookId }, async (route) => {
    const current = navigation.route();
    const overview = await api.getBookOverview({ bookId: route.bookId, historyCursor: null });
    if (!current.isCurrent()) return;
    navigation.present(() => renderBookOverview(overview));
    resume();
  }),
});

const procedureRecommendationSlots = mountProcedureRecommendationSlots(document.body, api, () => void renderKnowledgeBase('rules'));
window.addEventListener('unload', () => procedureRecommendationSlots.disconnect(), { once: true });

/** One range the composer carries, from the words selected now (Issue #423, slice 7a). */
function composerRangeOf(reading: SelectionSpanReading): ComposerRange {
  return {
    key: `new-${crypto.randomUUID()}`,
    rangeId: null,
    span: reading.span,
    blockId: reading.span.blockId,
    text: reading.span.selectedText,
    position: reading.position,
    revisionLabel: reading.revisionLabel,
    journalSequence: reading.journalSequence,
    state: 'exact',
    stateLabel: null,
  };
}

/** 查看结果's floating window while it is open (Issue #423, S77a); any change of screen closes it. */
let taskResultWindow: TaskResultWindow | undefined;

/**
 * 查看结果 (TASK-045): the finished Task's result beside the text — level with the manuscript's text column while the
 * manuscript is on screen. Its jumps land in the manuscript and leave 回到<位置>; closing it opens the panel again.
 */
function openTaskResult(entry: BookTaskItemProjection, backToPanel: () => void, resultApi: RendererApi = api): void {
  taskResultWindow?.close(false);
  const bookId = entry.item.book.bookId;
  taskResultWindow = openTaskResultWindow({
    entry,
    api: resultApi,
    column: () => {
      const text = screen.querySelector<HTMLElement>('[data-screen="editor"] .editor-window .ProseMirror');
      const pane = text?.closest<HTMLElement>('.editor-window') ?? null;
      return text === null || pane === null ? null : { text, pane };
    },
    jump: (target) => {
      if (bookId !== null) void jumpToManuscript(bookId, target);
    },
    openSurface: (target, revisionId) => void leaveThen(() => openGlobalAttentionTarget(target, revisionId)),
    onClose: (back) => {
      taskResultWindow = undefined;
      if (back) backToPanel();
    },
    errorMessage: rendererErrorMessage,
  });
}

/**
 * 跳到所选文字 (Issue #423, S77 deferred item d; TASK-045): the caret moved to the first paragraph a selection Task was started
 * on — in the Task's manuscript on screen, leaving 回到<位置> as every jump does, or in that manuscript opened there. A paragraph
 * that no longer stands in the working manuscript is said in the card's own words (Issue #423 review, P2-1), and nothing
 * moves: no window is loaded and no return place is kept.
 */
function jumpToSelectionText(bookId: string, selection: { readonly manuscriptId: string; readonly fromBlockId: string; readonly toBlockId: string }): Promise<boolean> {
  return jumpToManuscript(bookId, { manuscriptId: selection.manuscriptId, blockId: selection.fromBlockId, markId: null }, TASK_PANEL_JUMP_GONE);
}

/**
 * 发起全书任务 (TASK-044): the procedure's Task is prepared exactly as ②A's 先看计划 prepares it; with a rule, it is
 * then started exactly as ②A's quick start starts it. It answers the Task whose plan the drawer shows next — the
 * prepared plan, or the one a quick start stopped at with why — and `null` when the panel stays, the Task started.
 */
async function startWholeBookTask(
  bookId: string,
  input: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; quick: DefaultExecutionRuleReference | null },
): Promise<{ ref: string; note?: string; started?: true } | null> {
  // The Task Input is frozen from the journal: the words typed just now, and any held after a failed write, are
  // settled first, or nothing is prepared.
  if (!(await settleScreen())) return null;
  if (input.quick === null) {
    taskDrawer.openLaunch({ bookId, operation: 'launchBaselineAnalysis', title: '分析', input: { goal: input.goal, update: input.update } }, () => null);
    return null;
  }
  setStatus(TASK_PANEL_COMPOSE_STATUS.preparing, 'busy');
  try {
    const initial = await api.prepareBaselineAnalysis({ goal: input.goal, update: input.update, reconfirm: false });
    const completed = await awaitServiceJob(initial, (job) => setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
    if (completed.state === 'cancelled') {
      setStatus(TASK_PANEL_COMPOSE_STATUS.cancelled, 'success');
      return null;
    }
    if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null ||
        !('coverageManifest' in completed.result) || completed.result.bookId !== bookId) throw new Error('基线稿件分析准备未返回计划。');
    const prepared = completed.result;
    taskSurfaceRefresh['baseline-analysis']?.();
    const taskIntentId = prepared.taskIntent?.taskIntentId ?? null;
    const planEnvelopeDigest = prepared.planEnvelope?.digest ?? null;
    if (taskIntentId === null) throw new Error('基线稿件分析准备未返回计划。');
    if (input.quick === null) {
      await startPreparedTask(api, 'baseline-analysis', taskIntentId);
      taskSurfaceRefresh['baseline-analysis']?.();
      globalAttentionReader.refresh();
      setStatus('已开始分析', 'success');
      return { ref: taskIntentId, started: true };
    }
    if (planEnvelopeDigest === null) throw new Error('任务计划尚未准备完成。');
    const rule = input.quick;
    setStatus(`正在按默认执行规则「${rule.name}」开始…`, 'busy');
    let result: QuickStartBaselineAnalysisResult;
    try {
      result = await api.quickStartBaselineAnalysis({ taskIntentId, planEnvelopeDigest, ruleVersionId: rule.ruleVersionId });
    } catch (error) {
      setStatus(rendererErrorMessage(error, '快速开始没有开始任务；计划已准备，可在任务计划里开始。'), 'error');
      return { ref: taskIntentId };
    }
    taskSurfaceRefresh['baseline-analysis']?.();
    if (result.outcome === 'started') {
      setStatus(quickStartStartedLine(rule, result.projection), 'success');
      return { ref: taskIntentId, started: true };
    }
    const note = taskPlanQuickStartFellBack(result.reasons);
    setStatus(note);
    return { ref: taskIntentId, note };
  } catch (error) {
    setStatus(rendererErrorMessage(error, TASK_PANEL_COMPOSE_STATUS.failed), 'error');
    return null;
  }
}

/**
 * 就这段发起任务… (Issue #423, S77b; TASK-001, TASK-046): what the selected words' paragraph can start now — read from ②A's and
 * ②B's own projections, so the composer offers exactly what they would — and nothing when neither can be read.
 */
async function selectionTaskOffer(): Promise<SelectionTaskChoices> {
  const [analysis, workspace, procedures] = await Promise.all([
    api.inspectBaselineAnalysis().then((value) => value, () => null),
    api.inspectReviewWorkspace({ reviewRunId: null }).then((value) => value, () => null),
    selectionProcedureOffer().then((value) => value, (): SelectionProcedureEntry[] => []),
  ]);
  if (analysis === null && workspace === null) throw new Error(SELECTION_TASK_STATUS.unreadable);
  return selectionTaskChoices(analysis, workspace, procedures);
}

/**
 * The house's enabled 可复用工序 as each applies to a 当前选区 of the Book (Issue #423, S77 deferred item a): the selection menu's
 * entries, read as 新建审阅's 按已保存的工序 reads them — one answer for the whole house, scoped to the selection.
 */
async function selectionProcedureOffer(): Promise<SelectionProcedureEntry[]> {
  return selectionProcedureEntries(await api.inspectCapturedProcedureApplicability({ scope: 'selection' }));
}

/**
 * The chosen Task prepared on that one paragraph, exactly as ②A's 先看计划 or ②B's 新建审阅 prepares a range Task, and its plan
 * opened beside the manuscript, where it is started (TASK-004): 重新分析这段 over the paragraph's block, 审阅这段 in one
 * category over 当前选区, or one of the house's 可复用工序 over it — its exact version pinned, its Series steps as the editor
 * ticked them (REUSE-050). Answers whether the plan is open.
 */
async function prepareSelectionTask(
  bookId: string,
  choice: SelectionTaskChoice,
  anchor: { readonly blockId: string },
  chosenApart: ReadonlyArray<string>,
  returnFocus: () => HTMLElement | null,
): Promise<boolean> {
  if (choice.kind === 'reanalyze') {
    if (!(await settleScreen())) return false;
    taskDrawer.openLaunch({ bookId, operation: 'launchBaselineAnalysis', title: '分析', input: {
      goal: choice.goal,
      update: { mode: 'reanalyze-range', selectedRange: null, selectedBlocks: { fromBlockId: anchor.blockId, toBlockId: anchor.blockId } },
    } }, returnFocus);
    return true;
  }
  if (choice.kind === 'procedure') {
    // The version is resolved again for the selection as the sheet's choice resolves it (ADR 0087 §4): the one the menu offered,
    // every step still able to run here, and the Series steps the editor ticked — nothing is prepared from a moved answer.
    setStatus(SELECTION_TASK_STATUS.readingProcedure, 'busy');
    let resolved: Awaited<ReturnType<typeof api.inspectCapturedProcedureRun>>['resolved'];
    try {
      resolved = (await api.inspectCapturedProcedureRun({ procedureId: choice.procedureId, versionId: choice.versionId, scope: 'selection' })).resolved;
    } catch (error) {
      setStatus(rendererErrorMessage(error, SELECTION_TASK_STATUS.procedureUnreadable), 'error');
      return false;
    }
    if (resolved === null || resolved.versionId !== choice.versionId) {
      setStatus(SELECTION_TASK_STATUS.procedureChanged, 'error');
      return false;
    }
    const left = resolved.steps.find((step) => !step.available);
    if (left !== undefined) {
      setStatus(selectionProcedureStepReason(left.label, left.unavailableReason ?? ''), 'error');
      return false;
    }
    // The ticked boxes carry the step's category (Issue #423 review, P3-3), so a label renamed between the menu and 准备任务 changes nothing.
    const categoryIds = resolved.steps.filter((step) => !step.chosenApart || chosenApart.includes(step.categoryId)).map((step) => step.categoryId);
    if (categoryIds.length === 0) {
      setStatus(SELECTION_TASK_STATUS.pickCategory, 'error');
      return false;
    }
    return prepareSelectionReview(bookId, categoryIds, anchor, { versionId: resolved.versionId, documentSha256: resolved.documentSha256 }, returnFocus);
  }
  return prepareSelectionReview(bookId, [choice.categoryId], anchor, null, returnFocus);
}

/** Start selection review from the paragraph, following its marks without requiring the plan drawer. */
async function prepareSelectionReview(
  bookId: string,
  categoryIds: ReadonlyArray<string>,
  anchor: { readonly blockId: string },
  capturedProcedure: { versionId: string; documentSha256: string } | null,
  returnFocus: () => HTMLElement | null,
): Promise<boolean> {
  if (!(await settleScreen())) return false;
  setStatus(SELECTION_TASK_STATUS.preparing, 'busy');
  try {
    const initial = await api.prepareReviewRun({
      categoryIds,
      scope: { kind: 'selection', fromChapterBlockId: anchor.blockId, toChapterBlockId: anchor.blockId },
      ...(capturedProcedure === null ? {} : { capturedProcedure }),
    });
    const completed = await awaitServiceJob(initial, (job) => setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
    if (completed.state === 'cancelled') {
      setStatus(SELECTION_TASK_STATUS.cancelled, 'success');
      return false;
    }
    const result = completed.result;
    if (completed.kind !== 'review-run-preparation' || result === null || !('scopeOptions' in result) || result.bookId !== bookId || result.run === null) {
      throw new Error(SELECTION_TASK_STATUS.failed);
    }
    taskSurfaceRefresh['review-run']?.();
    setStatus(SELECTION_TASK_STATUS.prepared, 'success');
    await startPreparedTask(api, 'review-run', result.run.reviewRunId);
    taskSurfaceRefresh['review-run']?.();
    globalAttentionReader.refresh();
    manuscriptOnScreen?.followReviewMarks(bookId, result.run.reviewRunId);
    setStatus('已开始审阅', 'success');
    return true;
  } catch (error) {
    setStatus(rendererErrorMessage(error, SELECTION_TASK_STATUS.failed), 'error');
    return false;
  }
}

/** What a quick start that started its Task says: a start the launch has no route for is recorded and blocked before dispatch. */
function quickStartStartedLine(rule: DefaultExecutionRuleReference, projection: BaselineAnalysisProjection): string {
  return projection.state === 'authorized-blocked'
    ? `已按默认执行规则「${rule.name}」记下这项任务；当前启动没有可执行的路由，派发前已阻止。`
    : `已按默认执行规则「${rule.name}」开始任务。`;
}

// ---- 回到<位置> (Issue #423, plan slice S77a; V2-UX-TASK-045) ------------------------------------------------

/** Only the last screen is cached. Other positions already have a bounded service-owned reader. */
let lastReadingPlace: ReadingPlace | null = null;
/** The manuscript on screen now: where it is read and how it jumps within itself. Set by the editor, cleared with it. */
let manuscriptOnScreen: ManuscriptScreen | null = null;

/** A jump from another screen — 审阅's 回到原文, ②A's 回到稿件范围, a result's 跳到 — leaves the way back to where the editor last read. */
async function leaveReturnChip(bookId: string, manuscriptId: string, branchId: string): Promise<void> {
  if (await readReturnPlace(manuscriptId, branchId) !== null) return;
  const known = lastReadingPlace;
  if (known?.manuscriptId === manuscriptId && known.branchId === branchId) {
    await preserveReturnPlace(known);
    return;
  }
  const overview = await api.getBookOverview({ bookId, historyCursor: null });
  const anchor = overview.manuscriptAnchor;
  if (anchor?.manuscriptId !== manuscriptId || anchor.branchId !== branchId || anchor.entry === null) return;
  const remembered = await api.getManuscriptWindowAt({ manuscriptId, branchId, target: { kind: 'block', blockId: anchor.entry.blockId } });
  const block = remembered.blocks.find((item) => item.blockId === anchor.entry?.blockId);
  if (block !== undefined) await preserveReturnPlace({ manuscriptId, branchId, blockId: block.blockId, place: returnChipPlace(remembered.position.structureLabel, block.position) });
}

/**
 * 跳到 (TASK-045): the manuscript at that paragraph — moved in place while it is on screen — leaving 回到<位置>. Answers whether
 * the manuscript stands there. `gone` is what a paragraph no longer in the working manuscript (`WINDOW_NOT_FOUND`) is said as,
 * in the caller's own words (Issue #423 review, P2-1); every other refusal is said in the service's.
 */
async function jumpToManuscript(bookId: string, target: { manuscriptId: string | null; blockId: string; markId: string | null }, gone?: string): Promise<boolean> {
  const navigationRoute = navigation.begin();
  const origin = screen.firstElementChild;
  const showing = manuscriptOnScreen;
  const refused = (error: unknown, fallback: string): false => {
    setStatus(gone !== undefined && hasErrorCode(error, 'WINDOW_NOT_FOUND') ? gone : rendererErrorMessage(error, fallback), 'error');
    return false;
  };
  if (showing !== null && showing.bookId === bookId && (target.manuscriptId === null || target.manuscriptId === showing.manuscriptId)) {
    try {
      return await showing.jump(target);
    } catch (error) {
      if (!navigation.errorIsCurrent(error, navigationRoute)) return false;
      return refused(error, '无法移动到该稿件位置。');
    }
  }
  setStatus('正在打开对应稿件位置…', 'busy');
  try {
    const overview = await api.getBookOverview({ bookId, historyCursor: null });
    if (!navigationRoute.isCurrent()) return false;
    const anchor = overview.manuscriptAnchor;
    if (anchor === null || (target.manuscriptId !== null && target.manuscriptId !== anchor.manuscriptId)) throw new Error('这项结果所在的稿件已不在这本书中。');
    const opened = await api.getManuscriptWindowAt({ manuscriptId: anchor.manuscriptId, branchId: anchor.branchId, target: { kind: 'block', blockId: target.blockId } });
    if (!navigationRoute.isCurrent()) return false;
    await leaveReturnChip(bookId, anchor.manuscriptId, anchor.branchId);
    if (screen.firstElementChild !== origin) return false;
    if (!navigationRoute.isCurrent()) return false;
    await openEditorWindow(opened, overview.book.title, undefined, undefined, target.markId ?? undefined, undefined, navigationRoute);
    return true;
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return false;
    return refused(error, '无法打开对应稿件位置。');
  }
}

/**
 * Open one Task's plan in the drawer (S72 D4); closing it returns focus to the surface's 查看计划. `note` is said
 * beside the bar's actions — why a quick start stopped at this plan (Issue #421).
 */
function openTaskPlan(bookId: string, kind: TaskPlanKind, ref: string | null, note?: string): void {
  taskDrawer.open({ bookId, kind, ref }, () => screen.querySelector<HTMLElement>(`[data-task-plan-open="${kind}"]:not(:disabled)`), note);
}

/**
 * The 查看计划 a surface offers beside its one-line summary; each surface adds its own action attribute.
 * While the Task has not been started it reads 查看计划并开始 (S74a A5): the start is in the drawer's bar.
 */
function taskPlanOpenButton(kind: TaskPlanKind, open: () => void, startable = false): HTMLButtonElement {
  const node = button(startable ? TASK_PLAN_OPEN_START : TASK_PLAN_OPEN, startable ? 'primary' : 'secondary', open);
  node.dataset['taskPlanOpen'] = kind;
  node.setAttribute('aria-controls', 'task-drawer');
  return node;
}

/**
 * The started Task's own surface (AUTH-007): J-03's record on 工作概览, the analysis Run on ②A, the Review
 * Run on ②B with that Run open. The drawer stays beside it, because each is a destination of the same Book.
 */
async function openTaskRunSurface(plan: TaskPlanProjection): Promise<void> {
  const current = navigation.begin();
  setStatus('正在打开运行所在的页面…', 'busy');
  try {
    if (plan.kind === 'baseline-analysis') renderBookAnalysis(plan.bookId, plan.goal.chips.book);
    else if (plan.kind === 'review-run') renderBookReview(plan.bookId, plan.goal.chips.book, { reviewRunId: plan.ref, findingId: null });
    else if (plan.kind === 'initial-evaluation' || plan.kind === 'readers-report' || plan.kind === 'evaluation-rewrite') renderBookEvaluation(plan.bookId, plan.goal.chips.book);
    // 写作任务 is followed on 稿件 (Issue #1403), where its draft opens.
    else if (plan.kind === 'writing') await renderBookManuscript(plan.bookId, plan.goal.chips.book, current);
    else { const overview = await api.getBookOverview({ bookId: plan.bookId, historyCursor: null }); if (current.isCurrent()) navigation.present(() => renderBookOverview(overview)); }
  } catch (error) {
    if (!navigation.errorIsCurrent(error, current)) return;
    setStatus(rendererErrorMessage(error, '无法打开运行所在的页面。'), 'error');
  }
}

/** ②B 审阅 while it is on screen: its poll and its sheet end with the screen. */
let reviewWorkspace: ReviewWorkspaceSurface | undefined;
/** ⑥ 交付物 while it is on screen: nothing still in flight paints once the screen is replaced. */
let deliverablesSurface: DeliverablesSurface | undefined;
let derivativesSurface: ReturnType<typeof mountDerivativesWorkspace> | undefined;
/** The dedicated Proposal review workspace while it is on screen (Issue #902): it stops painting once replaced. */
let proposalWorkspaceSurface: ReturnType<typeof mountProposalWorkspace> | undefined;
let agentWorkspaceSurface: ReturnType<typeof mountAgentWorkspace> | undefined;
/** Exact return routes belong to the work surface; never persist a second Active Work Object for Agent 工作区. */
const agentWorkspaceReturns = new WeakMap<HTMLElement, () => void | Promise<void>>();
/** 稿件冲突 while it is on screen: a draft save still in flight never paints once the screen is replaced. */
let proposalConflictSurface: ProposalConflictSurface | undefined;
/** 待我处理 while it is on screen: it stops painting once the screen is replaced. */
let globalAttentionSurface: GlobalAttentionSurface | undefined;
let taskOverviewSurface: TaskOverviewSurface | undefined;
/**
 * What leaving the surface on screen asks first when the shell's header leads away from it (Issue #424): the
 * manuscript settles its local edits and takes its position, and 稿件冲突 saves its draft, exactly as their own
 * ways out do. Every screen change clears it; a surface that needs one registers it once it is on screen.
 */
let leaveGuard: (() => Promise<boolean>) | null = null;
let authorityInterrupted = false;

/**
 * A way out that is not the surface's own — a 任务 card, 查看结果's window, the drawer's 查看运行 — and 发起全书任务 settle
 * the surface on screen as its own ways out do (Issue #423 review): the manuscript's local edits are written and its
 * position taken first, and a refusal keeps it on screen. `true` once it may go on; with nothing to settle, at once.
 */
async function settleScreen(): Promise<boolean> {
  const guard = leaveGuard;
  if (guard === null) return true;
  setStatus(TASK_PANEL_LEAVE_STATUS.settling, 'busy');
  try {
    if (await guard()) return true;
    // The surface's own refusal stands; only a silent one is named here.
    if (persistenceStatus.textContent === TASK_PANEL_LEAVE_STATUS.settling) setStatus(TASK_PANEL_LEAVE_STATUS.stayed, 'error');
    return false;
  } catch (error) {
    setStatus(rendererErrorMessage(error, TASK_PANEL_LEAVE_STATUS.stayed), 'error');
    return false;
  }
}

async function guardNavigationRead<T>(current: NavigationCheckpoint, read: () => Promise<T>): Promise<T | undefined> {
  try { return await read(); } catch (error) { if (navigation.errorIsCurrent(error, current)) throw error; }
}

function clearBookReacquisitionNotice(): void {
  screen.querySelector('[data-book-reacquire]')?.remove();
}

function reportBookReacquisitionFailure(error: unknown, retry: () => Promise<void>): void {
  const content = screen.firstElementChild;
  if (navigation.bookId === null || !(content instanceof HTMLElement)) return;
  const line = bookOwnershipFailureLine(error);
  const existing = content.querySelector<HTMLElement>('[data-book-reacquire]');
  if (existing !== null) {
    const words = existing.querySelector('p');
    if (words?.textContent === line) return;
    if (words) words.textContent = line;
    setStatus(line, 'error');
    return;
  }
  setStatus(line, 'error');
  const notice = element('section', 'attention-note');
  notice.dataset['bookReacquire'] = 'retry';
  const page = navigation.read(content);
  const editor = manuscriptOnScreen;
  let retrying = false;
  const again = button('重试连接当前图书', 'secondary', async () => {
    if (retrying) return;
    retrying = true;
    again.setAttribute('aria-busy', 'true');
    try { await retry(); } catch { return; } // The existing notice retains its node and focus.
    finally { retrying = false; again.removeAttribute('aria-busy'); }
    if (!page.isCurrent()) return;
    try { if (editor !== null && editor === manuscriptOnScreen && !await editor.settle()) return; }
    catch { setStatus('当前修改尚未保存，请在编辑保护选项中重试写入。', 'error'); return; }
    if (page.isCurrent()) setStatus(editor === null ? '已重新连接当前图书。' : '已重新连接当前图书；当前修改已保存。', 'success');
  });
  notice.append(element('p', undefined, line), again);
  content.prepend(notice);
}

/** Open another page once the surface on screen has settled; a refusal keeps it. */
async function leaveThen(open: () => Promise<void>): Promise<void> {
  const route = navigation.begin();
  if (!await settleScreen() || !route.isCurrent()) return;
  if (route.isCurrent()) await open();
}

/**
 * The remappable navigation, search and view commands (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-006): one dispatcher on the
 * window, the IME-safe Command Guard in front of every command. Each command only moves to a place or focuses a control, through
 * the surface's own ways out; none starts, adopts, designates or deletes anything (KEY-004). The commands of the manuscript on
 * screen register with it and leave with it.
 */
const commandPlatformInUse: CommandPlatform = api.platform;
let windowComposing = false;
window.addEventListener('compositionstart', () => { windowComposing = true; }, true);
window.addEventListener('compositionend', () => { windowComposing = false; }, true);
window.addEventListener('blur', () => { windowComposing = false; });
const commandDispatcher = createCommandDispatcher({
  platform: commandPlatformInUse,
  bindings: activeCommandBindings,
  // A press made during a composition says so itself (`isComposing`); the manuscript's own composition is asked as well.
  composing: () => windowComposing || manuscriptOnScreen?.isComposing() === true,
  announce: (message) => setStatus(message, 'busy'),
});
window.addEventListener('keydown', (event) => commandDispatcher.handle(event));
let keyboardSettingsOff: (() => void) | undefined;

/** Use the shell's discoverable entries so keyboard and pointer navigation share the same guards and exact targets. */
function clickCommandEntry(selector: string): void {
  if (authorityInterrupted) return;
  const entry = document.querySelector<HTMLElement>(selector);
  if (entry !== null && !entry.hasAttribute('disabled') && entry.getAttribute('aria-disabled') !== 'true') entry.click();
}

commandDispatcher.register({
  'command.palette': () => commandPalette.open(),
  'book.switch': () => commandPalette.open(true),
  'review.new': () => {
    const book = shell.currentBook(); if (!book) return;
    void leaveThen(async () => { renderBookReview(book.bookId, book.title); reviewWorkspace?.openNew(); });
  },
  'evaluation.start': () => {
    const place = shell.currentBook(); if (!place) return;
    void leaveThen(async () => renderBookEvaluation(place.bookId, place.title, undefined, true));
  },
  ...Object.fromEntries(['attention', 'tasks', 'library', 'series', 'knowledge', 'quality'].map((destination) =>
    [`nav.${destination}`, () => clickCommandEntry(`[data-nav-destination="${destination}"]`)])),
  ...Object.fromEntries(BOOK_SECTION_COMMANDS.map(([id, , section]) =>
    [id, () => clickCommandEntry(`[data-nav-book-section="${section}"]`)])),
  'nav.settings': () => clickCommandEntry('[data-nav-settings]'),
  'nav.back': () => {
    const back = screen.querySelector<HTMLElement>('[data-shortcut-command="nav.back"]');
    if (back !== null) clickCommandEntry('[data-shortcut-command="nav.back"]');
    else clickCommandEntry('[data-nav-destination="library"]');
  },
  'view.toggleSidebar': () => clickCommandEntry('#sidebar-toggle'),
  'view.openTasks': () => {
    const bookId = (screen.firstElementChild as HTMLElement | null)?.dataset['bookId'];
    if (bookId !== undefined && !authorityInterrupted) taskDrawer.openPanel(bookId, () => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  },
});

const commandPalette = createCommandPalette({
  api: api, execute: (id) => commandDispatcher.execute(id),
  openBook: (bookId) => leaveThen(() => requestBookWorkbenchRoute({ kind: 'book', bookId })),
  openResult: (item) => void openOverviewResult(item),
  openStart: () => { void leaveThen(async () => { renderTaskOverview(); taskOverviewSurface?.showStart(); }); },
  openHelp: () => { if (!authorityInterrupted) void leaveThen(async () => renderHelp()); },
  beforeStart: settleScreen,
  status: setStatus,
});

/**
 * The preference the shortcut labels and the dispatcher read (KEY-012: local view/input configuration). Until it arrives the
 * defaults stand; a remap reaches every shown chord at once.
 */
function applyKeyboardBindings(bindings: Parameters<typeof configureCommandLabels>[1]): void {
  configureCommandLabels(commandPlatformInUse, bindings);
  refreshShortcutLabels(document);
}
void api.getPreferences().then((preferences) => applyKeyboardBindings(preferences.values['keyboard.bindings']), () => undefined);

/** Each shortcut hint is derived from the same registry that dispatches it (KEY-011). */
function refreshCommandEntries(): void {
  for (const entry of document.querySelectorAll<HTMLElement>('[data-nav-destination]')) entry.dataset['shortcutCommand'] = `nav.${entry.dataset['navDestination']}`;
  for (const [id, , section] of BOOK_SECTION_COMMANDS) {
    const entry = document.querySelector<HTMLElement>(`[data-nav-book-section="${section}"]`);
    if (entry !== null) entry.dataset['shortcutCommand'] = id;
  }
  const settings = document.querySelector<HTMLElement>('[data-nav-settings]');
  if (settings !== null) settings.dataset['shortcutCommand'] = 'nav.settings';
  requiredElement('#sidebar-toggle').dataset['shortcutCommand'] = 'view.toggleSidebar';
  for (const entry of screen.querySelectorAll<HTMLButtonElement>('button')) {
    if ((BACK_COMMAND_ENTRIES as readonly string[]).includes(entry.textContent?.trim() ?? '')) entry.dataset['shortcutCommand'] = 'nav.back';
  }
  refreshShortcutLabels(document);
}

/**
 * 待我处理 (Issue #424, plan slice S78): one reader for the whole window, read on every screen change and
 * whenever the window gains focus, and slowly on its own while a Run is in flight; the header's entry and the
 * screen paint the same answer (global-attention.ts).
 */
const globalAttentionReader = createGlobalAttentionReader(api);
const globalAttentionEntry = ((): HTMLButtonElement => {
  const node = requiredElement('#global-attention-entry');
  if (!(node instanceof HTMLButtonElement)) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
  return node;
})();
mountGlobalAttentionEntry({ button: globalAttentionEntry, reader: globalAttentionReader, open: () => void openGlobalAttention() });
mountProcessingIndicator(requiredElement('#processing-indicator'), globalAttentionReader);
const showQuietNotice = mountQuietNotice((item) => void leaveThen(() => openTaskNotification(item.itemId, item.target)));
/** Automatic results stay with the task being watched; an open review already shows its own result. */
function canAutoOpenTaskResult(item: GlobalAttentionItemProjection): boolean {
  const bookId = item.book.bookId;
  if (bookId === null || document.querySelector('dialog[open]') !== null) return false;
  const target = item.target;
  const ref = 'taskIntentId' in target ? target.taskIntentId : 'reviewRunId' in target ? target.reviewRunId : 'ref' in target ? target.ref : null;
  const review = target.kind === 'review' || target.kind === 'review-plan' || target.kind === 'task-plan' && target.taskKind === 'review-run';
  if (review && screen.dataset['screen'] === 'book-review' && screen.querySelector<HTMLElement>('.review-run')?.dataset['reviewRunId'] === ref) return false;
  const view = taskDrawer.view();
  if (view !== null) return view.bookId === bookId && (view.kind === 'panel' || view.kind === 'plan' && ref !== null && view.task.ref === ref);
  return screen.dataset['screen'] === 'task-overview';
}
const observeNotifications = createNotificationObserver({
  api: api,
  focused: () => document.hasFocus(),
  completed: (item) => {
    showQuietNotice(item);
    void openCurrentBookCompletion(item, {
      allowed: canAutoOpenTaskResult, navigation: navigation.route(),
      enabled: () => localStorage.getItem('ai7.task-overview.auto-result') !== 'off',
      read: () => api.inspectTaskOverview(), open: (entry) => void openOverviewResult(entry),
    }).catch(() => undefined);
  },
});
globalAttentionReader.subscribe((reading) => {
  if (reading.kind === 'projection') observeNotifications(reading.projection);
});
api.onNotificationNavigate((target) => {
  void leaveThen(async () => {
    if (target.eventId !== null && target.target !== undefined) {
      await openTaskNotification(target.eventId, target.target);
      return;
    }
    const navigationRoute = navigation.route();
    const projection = await api.inspectGlobalAttention();
    if (!navigationRoute.isCurrent()) return;
    const item = projection.groups.flatMap((group) => group.items).find((entry) => entry.itemId === target.eventId && entry.book.bookId === target.bookId);
    if (item) await openTaskNotification(item.itemId, item.target);
    else await openGlobalAttention(target.bookId);
  });
});
window.addEventListener('focus', () => globalAttentionReader.refresh());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') globalAttentionReader.refresh(); });

/**
 * The shell (Issue #934, wave 11 slice 11a; editor-surfaces §0.3): the two-level sidebar and the context header around
 * `#screen`. Every way it leads goes through `leaveThen`, so the surface on screen settles what it must first, exactly as
 * its own ways out do; a Book section checks the window's owned route before opening within that Book.
 */
const shellPreferences = new ShellPreferences(api);
/**
 * Density, reading typography and region sizes (Issue #951, wave 12 slice 12a; VIEW-001 to VIEW-012): three more keys of the
 * same preferences owner, applied to the root as every read or write of the owner answers. The Task Drawer's width is adjusted
 * from a separator on its left edge, mounted once beside it.
 */
const viewPreferences = new ViewPreferences(api, () => document.documentElement);
shellPreferences.subscribe((values) => viewPreferences.accept(values));
(() => {
  const drawer = requiredElement('#task-drawer');
  const separator = mountRegionSeparator({
    region: 'drawerWidth',
    view: viewPreferences,
    measure: () => drawer.getBoundingClientRect().width,
    announce: (message) => setStatus(message),
  });
  separator.element.id = 'task-drawer-separator';
  drawer.before(separator.element);
})();
const shell = mountShell({
  sidebar: requiredElement('#app-sidebar'),
  attentionEntry: globalAttentionEntry,
  toggle: ((): HTMLButtonElement => {
    const node = requiredElement('#sidebar-toggle');
    if (!(node instanceof HTMLButtonElement)) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
    return node;
  })(),
  title: requiredElement('#context-title'),
  position: requiredElement('#context-position'),
  actions: requiredElement('#context-actions'),
  preferenceNotice: requiredElement('#preferences-notice'),
  preferences: shellPreferences,
  pinLimit: MAX_PINNED_BOOKS,
  setStatus,
  errorMessage: rendererErrorMessage,
  openDestination: (destination) => {
    if (authorityInterrupted) return;
    if (destination === 'library') void leaveThen(() => returnToLibrary());
    else if (destination === 'tasks') void leaveThen(async () => { renderTaskOverview(); });
    else if (destination === 'series') void leaveThen(() => renderSeriesList(null));
    else if (destination === 'global-agent') void leaveThen(() => renderGlobalAgent());
    else if (destination === 'knowledge') void leaveThen(() => renderKnowledgeBase());
    else void leaveThen(() => renderQualityLearning());
  },
  openSection: (book, section) => {
    if (authorityInterrupted) return;
    void leaveThen(() => openBookSection(book, section));
  },
  openAgentWorkspace: (book) => {
    if (authorityInterrupted) return;
    if (screen.dataset['screen'] === 'agent-workspace' && (screen.firstElementChild as HTMLElement | null)?.dataset['bookId'] === book.bookId) return;
    const back = agentWorkspaceReturn(book.bookId, book.title);
    void leaveThen(() => openAgentWorkspace(book.bookId, back));
  },
  openBook: (bookId) => {
    if (authorityInterrupted) return;
    void leaveThen(async () => {
      setStatus(SHELL_LABELS.openingBook, 'busy');
      try {
        await requestBookWorkbenchRoute({ kind: 'book', bookId }, undefined, currentRecoveryReturn());
      } catch (error) {
        setStatus(rendererErrorMessage(error, SHELL_LABELS.bookUnavailable), 'error');
      }
    });
  },
  openSettings: () => {
    if (authorityInterrupted) return;
    void leaveThen(async () => renderSettingsHub());
  },
});

// 任务's sidebar badge follows the same read-only projection as the page (Issue #1328).
const taskNavigationBadge = element('span', 'task-navigation-badge');
taskNavigationBadge.setAttribute('aria-hidden', 'true');
const taskNavigationLink = document.querySelector<HTMLElement>('[data-nav-destination="tasks"]');
if (taskNavigationLink !== null) {
  taskNavigationLink.append(taskNavigationBadge);
  const refreshTaskBadge = (): void => {
    void api.inspectTaskOverview().then((projection) => {
      const count = projection.runningCount + projection.queuedCount + projection.actionableCount;
      taskNavigationBadge.textContent = count > 0 ? String(count) : '';
      taskNavigationBadge.hidden = count === 0;
    }, () => undefined);
  };
  taskNavigationBadge.hidden = true;
  globalAttentionReader.subscribe((reading) => { if (reading.kind === 'projection') refreshTaskBadge(); });
}

// Another window may have pinned or opened a Book: the list is read again whenever this one gains focus.
window.addEventListener('focus', () => void shellPreferences.load().catch(() => undefined));
void shellPreferences.load().then(
  (notice) => { if (notice !== null) setStatus(notice, 'error'); },
  (error: unknown) => setStatus(rendererErrorMessage(error, SHELL_LABELS.preferenceReadFailed), 'error'),
);

// A recovery return belongs to its surface, never to preferences; implicit inheritance stays within one Book.
const recoveryReturnContexts = new WeakMap<HTMLElement, RecoveryReturnContext>();

function currentRecoveryReturn(): RecoveryReturnContext | undefined {
  const content = screen.firstElementChild;
  return content instanceof HTMLElement ? recoveryReturnContexts.get(content) : undefined;
}

function recoveryTone(access: ImportDraftRecoveryProjection['originalFileAccess']['state']): string {
  return access === 'available-exact' ? 'success-note' : 'attention-note';
}

interface RendererErrorData {
  readonly code: string;
  readonly message: string;
}

function rendererErrorData(error: unknown): RendererErrorData | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
    ? { code: candidate.code, message: candidate.message }
    : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return rendererErrorData(error)?.code === code;
}

function rendererErrorCode(error: unknown): string | null {
  return rendererErrorData(error)?.code ?? null;
}

function rendererErrorMessage(error: unknown, fallback: string): string {
  const data = rendererErrorData(error);
  return researchUnavailableLine(data?.code, data?.message ?? (error instanceof Error ? error.message : fallback));
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

function button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => void action());
  return node;
}

/**
 * The Technical Identity Layer's one affordance for a surface (V2-UX-LAYER-001): that surface's digests,
 * record identifiers, references, schema and version identifiers and exact instants, closed by default,
 * one deliberate step below the decision content it belongs to. The rows keep their labels and their
 * `<dl>` structure — `gridClass` is the surface's own grid, so a disclosed row lines up exactly as it did
 * at full rank — and nothing here is truncated or hidden from the record. `<details>` carries the whole
 * behavior: opening or closing it reads nothing, writes nothing, and settles no decision
 * (V2-UX-LAYER-007), so no surface needs its own toggle state.
 */
function technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement {
  const disclosure = element('details', 'technical-details');
  const values = element('dl', gridClass);
  values.append(...rows);
  disclosure.append(element('summary', undefined, '查看技术详情'), values);
  return technicalDisclosure(disclosure);
}
/** A 书库 card's identities, one disclosure away (ADR 0096 §3). */
function bookIdentityDisclosure(book: { bookId: string; stableIdentity: string }): HTMLElement {
  return technicalDetails(undefined, ...bookIdentityRows(book).flatMap(([term, value]) => [element('dt', undefined, term), element('dd', 'technical-identity', value)]));
}

/**
 * A Book card's way in (Issue #1413 cluster 1): the title in the serif face and its state as a pill, the whole card answering
 * the click. The button's words stay 「书名 · 状态」 for its name; the card's facts and its action word sit beside it.
 */
function bookCardOpen(titleWords: string, stateWords: string, run: () => Promise<void>): HTMLButtonElement {
  const open = button('', 'secondary', run);
  open.className = 'book-card-open';
  open.append(element('strong', 'book-card-title', titleWords), element('span', 'visually-hidden', ' · '), element('span', 'state-term book-card-state', stateWords));
  return open;
}

/** The card's action word: a visible cue on the right; the card's button is the one control. */
function bookCardAction(words: string): HTMLElement {
  const cue = element('span', 'book-card-action', words);
  cue.setAttribute('aria-hidden', 'true');
  return cue;
}

/**
 * A Decision Layer row that states an instant (V2-UX-LAYER-004, V2-UX-COPY-011): absolute local date and
 * time, with the exact ISO instant riding inside the same `<dd>` on its own line. This is the shape for a
 * surface with no disclosure of its own — where there is one, the exact instant is a disclosed row
 * instead. Either way the local reading is never the only form shown, and never the exact one alone.
 */
function instantValue(iso: string): HTMLElement {
  const value = element('dd');
  value.append(localInstantLabel(iso), element('span', 'technical-identity', iso));
  return value;
}

function setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void {
  statusRevision += 1;
  updateStatusSurface(message, tone);
}

/**
 * The button or link the editor activated last, for a refusal said beside it (Issue #951; DUR-005). Read at activation, before
 * the control's own handler disables it, and only for a moment: a refusal much later names no control.
 */
let lastActivatedControl: { control: HTMLElement; at: number } | null = null;
document.addEventListener('click', (event) => {
  const control = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a') : null;
  lastActivatedControl = control === null ? null : { control, at: performance.now() };
}, true);
function recentlyActivatedControl(): HTMLElement | null {
  const recent = lastActivatedControl;
  return recent !== null && recent.control.isConnected && performance.now() - recent.at < 3_000 ? recent.control : null;
}

function setCloseRisk(risk: boolean): void {
  document.documentElement.dataset['ai7CloseRisk'] = risk ? 'true' : 'false';
}

function applyAuthorityInterruption(): void {
  if (authorityInterrupted) return;
  authorityInterrupted = true;
  for (const control of screen.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
    control.disabled = true;
  }
  globalAttentionReader.interrupt();
  globalAttentionEntry.disabled = true;
  shell.interrupt();
  taskDrawer.interrupt();
  if (manuscriptOnScreen) manuscriptOnScreen.interrupt();
  else setStatus('本地业务服务已中断；当前业务操作已停止。', 'error');
}

const screenReturns = new ScreenReturnHistory();
function returnToOrigin(): Promise<void> { return screenReturns.back(screen.dataset['screen'] ?? '', initializeStartup); }
function restoreCurrentScreen(): () => void | Promise<void> {
  const content = screen.firstElementChild;
  const restore = content instanceof HTMLElement ? agentWorkspaceReturns.get(content) : undefined;
  if (restore !== undefined) return restore;
  const state = screen.dataset['screen'];
  if (state === 'settings') return renderSettingsHub;
  if (state === 'help') return renderHelp;
  if (state === 'data-storage') return renderDataAndStorage;
  if (state === 'quality-learning') return () => renderQualityLearning();
  if (state === 'knowledge-base') return () => renderKnowledgeBase();
  if (state === 'model-service') return renderModelServiceSettings;
  if (state === 'series-list' || state === 'series') return () => renderSeriesList(null);
  if (state === 'evaluation-calibration') return () => renderEvaluationCalibration(null);
  const book = shell.currentBook();
  if (book !== null && content instanceof HTMLElement && content.dataset['bookId'] === book.bookId) return () => openBookSection(book, 'overview');
  return initializeStartup;
}

function replaceScreen(state: string, content: HTMLElement, place: ShellPlace | null = null): void {
  const bookId = content.dataset['bookId'] ?? place?.bookId ?? null;
  const tab = content.dataset['knowledgeTab'] ?? content.dataset['qualityTab'] ?? place?.section ?? null;
  const object = content.dataset['documentId'] ?? content.dataset['manuscriptId'] ?? content.dataset['revisionId'] ?? content.dataset['seriesId'] ?? null;
  const conflict = content.dataset['conflictMarkId'] ?? null;
  navigation.commit(JSON.stringify([state, bookId, tab, object, conflict]), bookId);
  if (state !== 'task-overview') overviewDrawerBookId = null;
  screenReturns.enter(state, restoreCurrentScreen());
  const previous = screen.firstElementChild;
  const recoveryReturn = currentRecoveryReturn();
  if (recoveryReturn && previous instanceof HTMLElement && previous.dataset['bookId'] !== undefined &&
      previous.dataset['bookId'] === content.dataset['bookId'] && !recoveryReturnContexts.has(content)) {
    recoveryReturnContexts.set(content, recoveryReturn);
  }
  // Where the manuscript was read as it is left (Issue #423, S77a): a jump back into it from another screen returns there.
  const reading = manuscriptOnScreen?.readingPlace() ?? null;
  if (reading !== null) lastReadingPlace = reading;
  manuscriptOnScreen?.destroy();
  manuscriptOnScreen = null;
  taskResultWindow?.close(false);
  reviewWorkspace?.destroy();
  reviewWorkspace = undefined;
  deliverablesSurface?.destroy();
  deliverablesSurface = undefined;
  derivativesSurface?.destroy();
  derivativesSurface = undefined;
  proposalWorkspaceSurface?.destroy();
  proposalWorkspaceSurface = undefined;
  agentWorkspaceSurface?.destroy();
  agentWorkspaceSurface = undefined;
  proposalConflictSurface?.destroy();
  proposalConflictSurface = undefined;
  globalAttentionSurface?.destroy();
  globalAttentionSurface = undefined;
  taskOverviewSurface?.destroy();
  taskOverviewSurface = undefined;
  keyboardSettingsOff?.();
  keyboardSettingsOff = undefined;
  leaveGuard = null;
  taskSurfaceRefresh = {};
  screen.dataset['screen'] = state;
  if (state === 'settings' || SETTINGS_HUB_GROUPS.some((group) => group.rows.some((row) => row.route === state))) {
    const layout = element('div', 'settings-layout');
    layout.append(settingsNavigation(state), content);
    screen.replaceChildren(layout);
  } else screen.replaceChildren(content);
  if (authorityInterrupted) {
    for (const control of screen.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
      control.disabled = true;
    }
  }
  // The drawer stays beside another central destination of the Book whose plan it shows (S72 D3).
  taskDrawer.followScreen(state, content.dataset['bookId'] ?? null);
  // 待我处理's number follows the screens the editor moves through (Issue #424).
  globalAttentionReader.refresh();
  // The sidebar marks where the window is, and a Book screen makes its Book current and recent (Issue #934).
  shell.follow(state, place);
  refreshCommandEntries();
}

/**
 * Where a 反馈历史 entry opens (Issue #61, S26c; FDBK-009): the exact record, in its Book — the manuscript with the
 * 修改建议's card open, ②A on the revision the judgment was made of, or ②B with the finding in view.
 */
async function openFeedbackTarget(target: FeedbackHistoryTarget, entryId: string): Promise<void> {
  await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId, feedbackEntryId: entryId });
}

/** The exact feedback source travels with its resolved Book route across windows. */
async function renderFeedbackTarget(target: FeedbackHistoryTarget, bookTitle: string, navigationRoute: NavigationCheckpoint = navigation.begin()): Promise<void> {
  switch (target.kind) {
    case 'mark': {
      const opened = await api.getManuscriptWindowAt({ manuscriptId: target.manuscriptId, branchId: target.branchId, target: { kind: 'block', blockId: target.blockId } });
      if (!navigationRoute.isCurrent()) return;
      await openEditorWindow(opened, bookTitle, undefined, undefined, target.markId, undefined, navigationRoute);
      return;
    }
    case 'analysis':
      renderBookAnalysis(target.bookId, bookTitle, { revisionId: target.revisionId, itemKey: target.itemKey, dimension: target.dimension });
      return;
    case 'review':
      renderBookReview(target.bookId, bookTitle, { reviewRunId: target.reviewRunId, findingId: target.findingId });
      return;
  }
}

async function openLearningMaterialSource(bookId: string, materialKey: string): Promise<void> {
  await requestBookWorkbenchRoute({ kind: 'book', bookId, learningMaterialKey: materialKey });
}

/** Follow the existing bounded Book history to the exact retained Source Version. */
async function openWordSourceVersion(bookId: string, sourceVersionId: string): Promise<void> {
  await requestBookWorkbenchRoute({ kind: 'book', bookId }, async () => {
    const navigationRoute = navigation.route();
    let overview = await api.getBookOverview({ bookId, historyCursor: null });
    if (!navigationRoute.isCurrent()) return;
    while (!overview.records.some((record) => record.kind === 'source' && record.sourceVersionId === sourceVersionId)) {
      const cursor = overview.historyPage.nextCursor;
      if (cursor === null) throw new Error('保留的 Word 原文件不在这本图书的历史中。');
      overview = await api.getBookOverview({ bookId, historyCursor: cursor });
      if (!navigationRoute.isCurrent()) return;
    }
    navigation.present(() => renderBookOverview(overview));
    const source = screen.querySelector<HTMLButtonElement>(`[data-record-kind="source"][data-record-id="${CSS.escape(sourceVersionId)}"]`);
    if (source === null) throw new Error('原文件记录暂时无法打开。');
    source.click();
  });
}

/** The service-owned arrival travels with the route to whichever workbench owns the Book. */
async function renderLearningMaterialTarget(target: LearningMaterialTarget, bookTitle: string, navigationRoute: NavigationCheckpoint = navigation.begin()): Promise<void> {
  switch (target.kind) {
    case 'word-tracked-edit': {
      const content = panel();
      content.append(element('h2', undefined, `《${bookTitle}》 · Word 修改来源`));
      const reader = mountWordTrackedEditDetail({ root: content, api: api, ...target, openSourceVersion: openWordSourceVersion });
      if (technicalLayerVisible) content.append(button('查看学习准入与排除', 'secondary', () => void renderQualityLearning('learning', target.bookId)));
      replaceScreen('word-import-detail', content, { bookId: target.bookId, title: bookTitle, section: 'overview' });
      await reader.load();
      return;
    }
    case 'mark': {
      const opened = await api.getManuscriptWindowAt({ manuscriptId: target.manuscriptId, branchId: target.branchId, target: { kind: 'block', blockId: target.blockId } });
      if (!navigationRoute.isCurrent()) return;
      await openEditorWindow(opened, bookTitle, undefined, undefined, target.markId, undefined, navigationRoute);
      return;
    }
    case 'analysis':
      renderBookAnalysis(target.bookId, bookTitle, { revisionId: target.revisionId, itemKey: target.itemKey, dimension: target.dimension });
      return;
    case 'review':
      renderBookReview(target.bookId, bookTitle, { reviewRunId: target.reviewRunId, findingId: target.findingId });
      return;
  }
}

function panel(): HTMLElement {
  return element('section', 'page-content');
}

async function returnToRecoveryComparison(attentionId: string, navigationRoute: NavigationCheckpoint = navigation.begin()): Promise<void> {
  const recovery = await api.getRecoveryComparison({ attentionId });
  if (!navigationRoute.isCurrent()) return;
  await api.leaveBookWorkbench();
  if (!navigationRoute.isCurrent()) return;
  renderManuscriptRecovery(recovery);
}

function appendRecoveryReturnAction(content: HTMLElement, context: RecoveryReturnContext | undefined): void {
  if (!context) return;
  recoveryReturnContexts.set(content, context);
  const actions = element('div', 'button-row recovery-return-actions');
  const returnButton = button(`返回 ${context.bookTitle} 的恢复待确认`, 'secondary', async () => {
    returnButton.disabled = true;
    setStatus('正在返回稿件恢复比较…', 'busy');
    try {
      await returnToRecoveryComparison(context.attentionId);
    } catch (error) {
      returnButton.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回恢复比较。'), 'error');
    }
  });
  returnButton.dataset['recoveryReturn'] = context.attentionId;
  returnButton.dataset['recoveryReturnVersion'] = String(context.attentionVersion);
  actions.append(returnButton);
  content.append(actions);
}

/**
 * The transient notice names a fallback when the saved position no longer exists (V2-UX-COPY-015).
 */
function manuscriptEntryNotice(anchor: BookManuscriptAnchorProjection): string {
  if (anchor.entry === null) return '从稿件开头打开；这本图书还没有记录上次位置。';
  if (anchor.entry.state === 'nearest-anchor') {
    return '上次位置所在的段落已不在稿件中，已回到最近的位置。';
  }
  return '回到上次位置。';
}

/**
 * Opening a Book that has a primary Manuscript enters the manuscript at the position the editor left
 * it at; 工作概览 is a destination reached from 资料与记录, not the way in (V2-UX-RET-002, IA-012).
 * A Book with no Manuscript still enters the overview, which is where 导入首份稿件 is (BOOK-001).
 *
 * The position rides in the overview projection this route already reads, so entering needs no
 * surface member of its own: the anchor answers both which surface to show and where to open it.
 * `blockId` goes straight into a `block` window target, which is the granularity the remembered
 * position is defined at.
 */
async function renderResolvedBookWorkbenchRoute(
  route: ResolvedBookWorkbenchRoute,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  await guardNavigationRead(navigationRoute, () => renderResolvedBookWorkbenchRouteNow(route, recoveryReturn, navigationRoute));
}

async function renderResolvedBookWorkbenchRouteNow(
  route: ResolvedBookWorkbenchRoute,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<NavigationCheckpoint | undefined> {
  if (route.kind === 'book') {
    if (route.feedbackTarget !== undefined) {
      await renderFeedbackTarget(route.feedbackTarget, route.bookTitle, navigationRoute);
      return;
    }
    if (route.learningMaterialTarget !== undefined) {
      await renderLearningMaterialTarget(route.learningMaterialTarget, route.bookTitle, navigationRoute);
      return;
    }
    const overview = await api.getBookOverview({ bookId: route.bookId, historyCursor: null });
    if (!navigationRoute.isCurrent()) return;
    const anchor = overview.manuscriptAnchor;
    if (anchor === null) {
      navigation.present(() => renderBookOverview(overview, undefined, recoveryReturn));
      return navigation.read(screen.firstElementChild as HTMLElement);
    }
    const opened = await api.getManuscriptWindowAt({
      manuscriptId: anchor.manuscriptId,
      branchId: anchor.branchId,
      target: anchor.entry === null ? { kind: 'start' } : { kind: 'block', blockId: anchor.entry.blockId },
    });
    if (!navigationRoute.isCurrent()) return;
    const shown = await openEditorWindowNow(
      opened,
      overview.book.title,
      recoveryReturn?.attentionId,
      manuscriptEntryNotice(anchor),
      undefined, undefined, navigationRoute,
    );
    if (!shown?.isCurrent()) return;
    const content = screen.firstElementChild;
    if (recoveryReturn && content instanceof HTMLElement && content.dataset['bookId'] === route.bookId) {
      recoveryReturnContexts.set(content, recoveryReturn);
    }
    return shown;
  }
  const historical = await api.getHistoricalRevision({ revisionId: route.revisionId, cursor: null });
  if (!navigationRoute.isCurrent()) return;
  renderHistoricalRevision(historical);
  return navigation.read(screen.firstElementChild as HTMLElement);
}

async function requestBookWorkbenchRoute(
  route: BookWorkbenchRoute,
  onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  await guardNavigationRead(navigationRoute, () => requestBookWorkbenchRouteNow(route, onRequestingWindow, recoveryReturn, navigationRoute));
}

async function requestBookWorkbenchRouteNow(
  route: BookWorkbenchRoute,
  onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  if (!navigationRoute.isCurrent()) return;
  const opened = await api.openBookWorkbench(route);
  if (!navigationRoute.isCurrent()) return;
  if (opened.target === 'requesting-window') {
    if (onRequestingWindow) await onRequestingWindow(opened.route);
    else await renderResolvedBookWorkbenchRoute(opened.route, recoveryReturn, navigationRoute);
    return;
  }
  setStatus(
    opened.target === 'new-window'
      ? `已在新的图书工作台打开《${opened.route.bookTitle}》。`
      : `已切换到《${opened.route.bookTitle}》已有的图书工作台。`,
    'success',
  );
}

async function renderOwnedBookWorkbenchRoute(): Promise<void> {
  const navigationRoute = navigation.begin();
  if (!navigationRoute.isCurrent()) return;
  const route = await api.getBookWorkbenchRoute();
  if (!navigationRoute.isCurrent()) return;
  if (!route) return;
  setStatus(technicalWords('正在读取精确图书工作台路由…', '正在打开图书…'), 'busy');
  try {
    await renderResolvedBookWorkbenchRoute(route, undefined, navigationRoute);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, technicalWords('无法读取精确图书工作台路由。', '无法打开这本书，请重试。')), 'error');
  }
}

async function renderGlobalAgent(dialogueId?: string): Promise<void> {
  const navigationRoute = navigation.begin();
  try {
    await api.leaveBookWorkbench();
    if (!navigationRoute.isCurrent()) return;
    replaceScreen('global-agent', mountGlobalAgent({ api: api, setStatus, errorMessage: rendererErrorMessage,
      ...(dialogueId === undefined ? {} : { dialogueId }), openAudit: () => void leaveThen(() => renderQualityLearning('audit', null)) }));
  } catch (error) {
    if (navigation.errorIsCurrent(error, navigationRoute)) throw error;
  }
}

async function returnToLibrary(): Promise<void> {
  const navigationRoute = navigation.begin();
  setStatus('正在返回图书列表…', 'busy');
  try {
    await api.leaveBookWorkbench();
    if (!navigationRoute.isCurrent()) return;
    await initializeStartup(navigationRoute);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, '无法返回图书列表。'), 'error');
  }
}

function sourceCard(staged: StagedImportProjection): HTMLElement {
  const card = element('section', 'source-card import-file-card');
  card.setAttribute('aria-label', '已选择文件');
  const format = element('span', undefined, staged.source.format);
  format.dataset['sourceFormat'] = staged.source.format;
  card.append(element('strong', undefined, staged.source.displayName), ' · ', format, ' · ',
    element('span', undefined, staged.editableImport.available
      ? `${staged.detectedBlockCount} 个段落` : '保留原始文件'));
  const bytes = element('dd', 'technical-identity', String(staged.source.sourceBytes));
  bytes.dataset['sourceBytes'] = '';
  const digest = element('dd', 'technical-identity', staged.source.sourceSha256);
  digest.dataset['sourceSha256'] = '';
  card.append(technicalDetails(undefined, element('dt', undefined, '文件大小'), bytes,
    element('dt', undefined, '来源 SHA-256'), digest));
  return card;
}

function identityFindingDisclosure(
  findings: StagedImportProjection['identityFindings'],
  reviewTarget?: ReviewBeforeImportProjection['target']['label'] | ReviewBeforeSourceImportProjection['target']['label'],
): HTMLElement {
  const disclosure = element('section', 'source-card identity-finding-disclosure');
  if (reviewTarget) disclosure.classList.add('review-identity-finding-summary');
  if (!technicalLayerVisible) {
    const books = [...new Set(findings.map((finding) => `《${finding.bookTitle}》`))];
    disclosure.append(element('h3', undefined, '这个文件已有导入记录'),
      element('p', undefined, `已在${books.join('、')}中导入。${reviewTarget ? `本次选择：${reviewTarget}。` : '请确认本次图书与导入方式。'}`));
    return disclosure;
  }
  disclosure.append(
    element('p', 'section-label', reviewTarget ? '导入身份提示与本次关系' : '发现已有导入身份提示'),
    element('h3', undefined, reviewTarget ? '复核身份提示记录与不同作品后果' : '已有导入与当前文件的身份提示'),
    ...(reviewTarget ? [element('p', undefined, `本次选择：${reviewTarget}`)] : []),
    // What the hint does not authorize is the technical layer's to say (Issue #1413 cluster 4).
    ...(technicalLayerVisible ? [element(
      'p',
      'field-note',
      reviewTarget
        ? '身份提示不授予目标、关系、去重、覆盖或重新导入权限；现有记录保持不变，本次提交将创建另一图书的完整新记录。'
        : '身份提示仅用于披露，不会选择目标或关系，也不授予去重、覆盖或重新导入权限。',
    )] : []),
  );
  for (const finding of findings) {
    const item = element('section', 'review-section');
    const classes = element('ul', 'degradation-list');
    const row = element('li', undefined, finding.identityClass.label);
    row.dataset['importIdentityClass'] = finding.identityClass.kind;
    classes.append(row);
    const details = element('dl');
    details.append(
      element('dt', undefined, '匹配图书'),
      element('dd', undefined, `${finding.bookTitle} · ${finding.bookId}`),
    );
    item.append(classes, details, technicalDetails(
      undefined,
      element('dt', undefined, '来源材料版本'),
      element('dd', 'technical-identity', finding.sourceVersionId),
      element('dt', undefined, finding.recordLabel),
      element('dd', 'technical-identity', finding.importRecordId),
    ));
    disclosure.append(item);
  }
  return disclosure;
}

function productIsVisibleAndReady(): boolean {
  return document.visibilityState === 'visible' && document.documentElement.dataset['ai7ProductReady'] === 'true';
}

function waitForVisibleProductReady(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (productIsVisibleAndReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (): void => {
      if (!signal.aborted && !productIsVisibleAndReady()) return;
      observer.disconnect();
      document.removeEventListener('visibilitychange', finish);
      signal.removeEventListener('abort', finish);
      resolve(!signal.aborted);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ai7-product-ready'],
    });
    document.addEventListener('visibilitychange', finish);
    signal.addEventListener('abort', finish, { once: true });
    finish();
  });
}

function nextVisibleFrame(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let frameId = 0;
    const finish = (presented: boolean): void => {
      signal.removeEventListener('abort', abort);
      if (!presented) cancelAnimationFrame(frameId);
      resolve(presented);
    };
    const abort = (): void => finish(false);
    signal.addEventListener('abort', abort, { once: true });
    frameId = requestAnimationFrame(() => finish(true));
    if (signal.aborted) abort();
  });
}

async function acknowledgeCompletionAfterPaint(result: ImportCommitProjection): Promise<boolean> {
  // A reimport lands in the manuscript, not the overview (V2-UX-IMP-056; Issue #412): its result is acknowledged
  // once the manuscript is on screen with the result's notice.
  const landing = 'reimportRecordId' in result ? 'editor' : 'imported';
  const presentedCommit = screen.querySelector<HTMLElement>('[data-import-commit-id]');
  if (screen.dataset['screen'] !== landing || presentedCommit?.dataset['importCommitId'] !== result.commitId) {
    return false;
  }
  const presentation = new AbortController();
  const presentationObserver = new MutationObserver(() => presentation.abort());
  presentationObserver.observe(screen, {
    attributes: true,
    attributeFilter: ['data-screen'],
    childList: true,
  });
  presentationObserver.observe(presentedCommit, {
    attributes: true,
    attributeFilter: ['data-import-commit-id'],
  });
  try {
    while (true) {
      if (!await waitForVisibleProductReady(presentation.signal)) return false;
      let eligibilityChanged = false;
      const framePair = new AbortController();
      const recordEligibilityChange = (): void => {
        eligibilityChanged = true;
        framePair.abort();
      };
      const abortFramePair = (): void => framePair.abort();
      const readinessObserver = new MutationObserver(recordEligibilityChange);
      document.addEventListener('visibilitychange', recordEligibilityChange);
      presentation.signal.addEventListener('abort', abortFramePair, { once: true });
      readinessObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-ai7-product-ready'],
      });
      if (presentation.signal.aborted) abortFramePair();
      if (!productIsVisibleAndReady()) recordEligibilityChange();
      let twoFramesPresented = false;
      try {
        twoFramesPresented = await nextVisibleFrame(framePair.signal) &&
          await nextVisibleFrame(framePair.signal);
      } finally {
        if (readinessObserver.takeRecords().length > 0) recordEligibilityChange();
        readinessObserver.disconnect();
        document.removeEventListener('visibilitychange', recordEligibilityChange);
        presentation.signal.removeEventListener('abort', abortFramePair);
      }
      if (presentationObserver.takeRecords().length > 0) presentation.abort();
      if (presentation.signal.aborted) return false;
      const currentCommit = screen.querySelector<HTMLElement>('[data-import-commit-id]');
      if (screen.dataset['screen'] !== landing || currentCommit !== presentedCommit ||
        currentCommit.dataset['importCommitId'] !== result.commitId) return false;
      if (eligibilityChanged || !twoFramesPresented || !productIsVisibleAndReady()) continue;
      break;
    }
  } finally {
    presentationObserver.disconnect();
  }
  document.documentElement.dataset['ai7ImportCompletionPainted'] = 'true';
  try {
    await api.acknowledgeImportCompletion({ commitId: result.commitId });
    document.documentElement.dataset['ai7ImportCompletionAcknowledged'] = 'true';
    return true;
  } catch {
    setStatus('导入已由权威记录证明；完成提示将在下次启动时再次显示。', 'error');
    return false;
  }
}

async function renderStartupProjection(
  startup: ImportStartupProjection,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  if (startup.state === 'none') {
    const [priorWork, books] = await Promise.all([
      api.listPriorWork(),
      api.listBooks({ after: null }),
    ]);
    if (!navigationRoute.isCurrent()) return;
    navigation.present(() => renderLanding(priorWork, recoveryReturn, books));
    return;
  }
  if (startup.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    navigation.present(() => renderImported(startup.result, recoveryReturn));
    return;
  }
  navigation.present(() => renderImportRecovery(startup.recovery, recoveryReturn));
}

async function renderApplicationStartup(startup: StartupProjection, navigationRoute: NavigationCheckpoint = navigation.begin()): Promise<void> {
  if (startup.state === 'manuscript-recovery') {
    navigation.present(() => renderManuscriptRecovery(startup.recovery));
  } else if (startup.state === 'import') {
    await renderStartupProjection(startup.startup, undefined, navigationRoute);
  } else {
    const books = await api.listBooks({ after: null });
    if (!navigationRoute.isCurrent()) return;
    navigation.present(() => renderLanding(startup.priorWork, undefined, books));
  }
}

async function renderLandingFromAuthority(
  priorWork: ReadonlyArray<PriorWorkItemProjection>,
  recoveryReturn?: RecoveryReturnContext,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  const books = await api.listBooks({ after: null });
  if (!navigationRoute.isCurrent()) return;
  renderLanding(priorWork, recoveryReturn, books);
}

function recoveryCandidateCard(
  candidate: RecoveryComparisonProjection['journal'] | RecoveryComparisonProjection['checkpoint'] |
    Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate'],
  onSelect: (selection: RecoverySelection, candidate: RecoveryComparisonProjection['journal'] |
    RecoveryComparisonProjection['checkpoint'] |
    Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate']) => void,
): HTMLElement {
  const label = element('label', 'recovery-candidate choice');
  label.dataset['recoveryCandidate'] = candidate.kind;
  const radio = element('input');
  radio.type = 'radio';
  radio.name = 'recovery-source';
  radio.value = candidate.candidateId;
  radio.checked = false;
  radio.setAttribute('aria-label', candidate.title);
  const copy = element('span');
  copy.append(element('strong', undefined, candidate.title));
  const details = element('dl', 'recovery-candidate-details');
  const revisionIdentity = element('dd', 'technical-identity', candidate.revisionId);
  revisionIdentity.dataset['candidateRevisionId'] = candidate.revisionId;
  const revisionDigest = element('dd', 'technical-identity', candidate.revisionDigest);
  revisionDigest.dataset['candidateRevisionDigest'] = candidate.revisionDigest;
  // Ordinary mode keeps the candidate's time, what it restores and its real risk (Issue #1431 item 26); the chain,
  // boundary and verification facts stay in the developer layer.
  details.append(...(technicalLayerVisible ? [
    element('dt', undefined, '修订版'), element('dd', undefined, candidate.revisionLabel),
    element('dt', undefined, '持久边界'), element('dd', undefined, `修订日志序号 ${candidate.journalSequence} · ${localInstantLabel(candidate.durableAt)}`),
    element('dt', undefined, '覆盖范围'), element('dd', undefined, candidate.coveredChangeExtent),
    element('dt', undefined, '校验'), element('dd', undefined, candidate.verification),
    element('dt', undefined, '限制'), element('dd', undefined, candidate.limitation),
  ] : [
    element('dt', undefined, '保存时间'), element('dd', undefined, localInstantLabel(candidate.durableAt)),
    element('dt', undefined, '恢复内容'), element('dd', undefined, candidate.kind === 'journal'
      ? '包含最近保存的全部修改。'
      : candidate.kind === 'checkpoint' ? '只包含上一个保存点的文字；之后的修改不会恢复，但也不会被删除。' : '只包含该里程碑时的文字；之后的修改不会恢复。'),
  ]));
  const exact = [
    element('dt', undefined, '修订版身份'), revisionIdentity,
    element('dt', undefined, '修订摘要'), revisionDigest,
    element('dt', undefined, '持久边界（精确时间）'), element('dd', 'technical-identity', candidate.durableAt),
  ];
  if (candidate.snapshotId !== null) {
    const snapshotIdentity = element('dd', 'technical-identity', candidate.snapshotId);
    snapshotIdentity.dataset['snapshotId'] = candidate.snapshotId;
    exact.push(element('dt', undefined, '快照身份'), snapshotIdentity);
  }
  // This disclosure sits inside the candidate's `<label>`, and after its radio. Both matter: `<details>`
  // is interactive content, so a click on the summary never runs the label's activation behavior and can
  // never select this recovery source on the reader's behalf (V2-UX-LAYER-007); and coming after the
  // radio, it adds no tab stop before the choice itself.
  copy.append(details, technicalDetails('recovery-candidate-details', ...exact));
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    onSelect(candidate.kind === 'snapshot'
      ? { kind: 'snapshot', snapshotId: candidate.snapshotId }
      : { kind: candidate.kind }, candidate);
  });
  label.append(radio, copy);
  return label;
}

function focusRecoveryHeading(content: HTMLElement): void {
  const heading = content.querySelector<HTMLElement>('h2');
  if (!heading) return;
  heading.tabIndex = -1;
  const page = navigation.read(content);
  requestAnimationFrame(() => { if (page.isCurrent()) heading.focus(); });
}

function renderManuscriptRecovery(recovery: RecoveryComparisonProjection): void {
  let selection: RecoverySelection | undefined;
  const content = panel();
  content.classList.add('manuscript-recovery-panel');
  const sectionLabel = element('p', 'section-label', `${technicalWords('稿件恢复优先', '稿件恢复')} · ${recovery.unresolvedCount} 项待确认`);
  const heading = element('h2', undefined, '先确认中断后的稿件状态');
  const lede = element('p', 'lede', technicalWords(recovery.snapshot.state === 'eligible'
    ? '系统不会替你选择恢复来源。三个已校验证据保持并列，恢复只会形成新的后代修订版。'
    : '系统不会替你选择恢复来源。当前两个可选证据保持并列；快照状态另行披露，恢复只会形成新的后代修订版。',
  '请选择要恢复的稿件。恢复会保存为新版本，原有内容不会被删除。'));
  content.append(sectionLabel, heading, lede);
  const identity = element('section', 'source-card recovery-identity');
  const identityDetails = element('dl');
  // This card takes the demoting rank but no disclosure of its own. A `<summary>` is focusable and this
  // card sits between the heading and the recovery radiogroup, so a disclosure here puts a tab stop in
  // front of the screen's primary decision — the choice a recovery screen exists to present. The
  // candidates' own disclosures sit after their radio and cost the reader nothing.
  const durableBoundary = instantValue(recovery.lastDurableEditBoundary.durableAt);
  if (technicalLayerVisible) durableBoundary.prepend(`修订日志序号 ${recovery.lastDurableEditBoundary.journalSequence} · `);
  identityDetails.append(
    ...recoveryIdentityRows(recovery).flatMap(([term, value]) => [element('dt', undefined, term), element('dd', technicalLayerVisible && term === '稿件' ? 'technical-identity' : undefined, value)]),
    element('dt', undefined, technicalWords('最后持久写入边界', '最近保存时间')), durableBoundary,
    ...(technicalLayerVisible ? [element('dt', undefined, '覆盖范围'), element('dd', undefined, recovery.lastDurableEditBoundary.coveredChangeExtent)] : []),
  );
  identity.append(element('h3', undefined, technicalWords('精确受影响稿件', '受影响的稿件')), identityDetails,
    element('p', 'uncertain-support', technicalWords(recovery.lastDurableEditBoundary.uncertainty, '最近保存之后输入的文字可能没有保存下来。')));
  content.append(identity);

  const choices = element('fieldset', 'recovery-comparison');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', technicalWords('恢复来源比较', '可恢复的稿件'));
  const legend = element('legend', undefined, technicalWords('选择一个证据来源', '选择要恢复的稿件'));
  choices.append(legend);
  const cards = element('div', 'recovery-candidate-grid');
  cards.dataset['eligibleCandidateCount'] = recovery.snapshot.state === 'eligible' ? '3' : '2';
  const consequence = element('p', 'recovery-selection-consequence');
  consequence.hidden = true;
  consequence.setAttribute('aria-live', 'polite');
  const view = button('仅查看', 'secondary', () => {
    if (selection) void openRecoveryViewer(recovery, selection, { kind: 'start' });
  });
  const restore = button('恢复为新版本', 'primary', async () => {
    if (!selection) return;
    view.disabled = true;
    restore.disabled = true;
    defer.disabled = true;
    setStatus(technicalWords('正在原子创建恢复后代修订版…', '正在恢复…'), 'busy');
    let restored: RecoveryRestorationProjection;
    try {
      restored = await api.restoreRecovery({
        attentionId: recovery.attentionId,
        expectedAttentionVersion: recovery.attentionVersion,
        selection,
      });
    } catch (error) {
      // Only a restore that did not happen can be tried again.
      setStatus(rendererErrorMessage(error, '恢复未完成。'), 'error');
      view.disabled = false;
      restore.disabled = false;
      defer.disabled = false;
      return;
    }
    // The restore is committed and its claim released: it is said as done however its window draws, and a document's
    // text, which no version holds yet, in the document's words (Issue #543 follow-up).
    const onDocument = restored.window.deliverable === 'production-document';
    let unopened: unknown;
    try {
      await openEditorWindow(restored.window, recovery.bookTitle);
      setStatus(onDocument ? DOCUMENT_STATUS_LINES.recovered : `已恢复为新版本${technicalWords(` ${restored.descendantRevisionLabel}`)}`, 'success');
      return;
    } catch (error) {
      unopened = error;
    }
    // The Book's own place for what was restored stands in for its window: 交付物 for a document, the workbench for the
    // manuscript.
    const openBook = async (): Promise<void> => {
      if (onDocument) {
        // A derivative document lives on 稿件 (Issue #1403): its switcher opens it again.
        await renderBookManuscript(recovery.bookId, recovery.bookTitle);
        setStatus(DOCUMENT_STATUS_LINES.recoveredNotOpened, 'error');
        return;
      }
      await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId: recovery.bookId, bookTitle: recovery.bookTitle });
      setStatus(`已恢复为新版本${technicalWords(` ${restored.descendantRevisionLabel}`)}，但稿件没能打开：${rendererErrorMessage(unopened, '请从图书再打开它。')}`, 'error');
    };
    try {
      await openBook();
    } catch (error) {
      // Neither drew (Issue #551). The restore stands, so the recovery's own choices are no longer the editor's: they close,
      // the screen stays, no longer busy, and offers again where the restore lives — 交付物 for a document, the Book for the
      // manuscript — as 打开稿件 does when it fails, with focus on it (Issue #582).
      choices.disabled = true;
      consequence.hidden = true;
      // Nothing waits on the editor's confirmation any more (Issues #593, #603), so the screen's words stop asking for a
      // decision.
      showRestoreStands({ sectionLabel, heading, lede, legend });
      const reopen = button(onDocument ? '打开稿件' : '打开图书', 'primary', async () => {
        reopen.disabled = true;
        setStatus(onDocument ? '正在打开稿件…' : '正在打开图书…', 'busy');
        try {
          await openBook();
        } catch (again) {
          reopen.disabled = false;
          setStatus(onDocument
            ? `${DOCUMENT_STATUS_LINES.recoveredRetryFailed}${rendererErrorMessage(again, '无法打开稿件。')}`
            : `已恢复为新版本${technicalWords(` ${restored.descendantRevisionLabel}`)}，但图书还是没能打开：${rendererErrorMessage(again, '无法打开图书。')}`, 'error');
        }
      });
      actions.replaceChildren(reopen);
      reopen.focus();
      setStatus(onDocument
        ? DOCUMENT_STATUS_LINES.recoveredNothingOpened
        : `已恢复为新版本${technicalWords(` ${restored.descendantRevisionLabel}`)}，但稿件和图书都没能打开：${rendererErrorMessage(error, '可以再打开图书。')}`, 'error');
    }
  });
  const selected = (
    next: RecoverySelection,
    candidate: RecoveryComparisonProjection['journal'] | RecoveryComparisonProjection['checkpoint'] |
      Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate'],
  ): void => {
    selection = next;
    consequence.textContent = technicalWords(`将以“${candidate.title}”形成当前分支的新后代修订版；来源修订身份 ${candidate.revisionId}，摘要 ${candidate.revisionDigest}。既有历史与稿件固定点保持原位，且不会自动创建里程碑。`,
      `将按“${candidate.title}”恢复为新版本；原有内容保持不变。`);
    consequence.dataset['selectedCandidate'] = candidate.kind;
    consequence.hidden = false;
    view.disabled = false;
    restore.disabled = false;
  };
  cards.append(recoveryCandidateCard(recovery.journal, selected), recoveryCandidateCard(recovery.checkpoint, selected));
  if (recovery.snapshot.state === 'eligible') {
    cards.append(recoveryCandidateCard(recovery.snapshot.candidate, selected));
  }
  choices.append(cards);
  content.append(choices);
  if (recovery.snapshot.state !== 'eligible') {
    const unavailable = element('section', 'recovery-snapshot-disclosure');
    unavailable.dataset['snapshotState'] = recovery.snapshot.state;
    const snapshotWords = recovery.snapshot.state === 'none' || recovery.snapshot.verification === recovery.snapshot.limitation
      ? recovery.snapshot.limitation
      : `${recovery.snapshot.verification.replace(/。$/u, '')}；${recovery.snapshot.limitation}`;
    unavailable.append(element('strong', undefined, '独立恢复快照不可作为本次选择'), element('p', undefined, snapshotWords));
    content.append(unavailable);
  }
  content.append(consequence);
  view.disabled = true;
  restore.disabled = true;
  const defer = button('稍后处理', 'quiet', async () => {
    const origin = navigation.route();
    view.disabled = true;
    restore.disabled = true;
    defer.disabled = true;
    setStatus('正在保留恢复待确认状态…', 'busy');
    try {
      const deferred = await api.deferRecovery({
        attentionId: recovery.attentionId,
        expectedAttentionVersion: recovery.attentionVersion,
      });
      setStatus(deferred.completionLabel, 'success');
      if (!origin.isCurrent()) return;
      await api.leaveBookWorkbench();
      if (!origin.isCurrent()) return;
      const recoveryReturn = {
        attentionId: deferred.attentionId,
        attentionVersion: deferred.attentionVersion,
        bookTitle: recovery.bookTitle,
      } satisfies RecoveryReturnContext;
      if (deferred.next.state === 'import') await renderStartupProjection(deferred.next.startup, recoveryReturn, origin);
      else await renderLandingFromAuthority(deferred.next.priorWork, recoveryReturn, origin);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '恢复待确认状态未能保留。'), 'error');
      view.disabled = selection === undefined;
      restore.disabled = selection === undefined;
      defer.disabled = false;
    }
  });
  const actions = element('div', 'button-row recovery-decision-actions');
  actions.append(view, defer, restore);
  content.append(actions,
    element('p', 'field-note', technicalWords('恢复不会改写、删除或移动既有修订版、修订日志、里程碑、恢复快照或稿件固定点。', '恢复不会删除原有内容或里程碑版本。')));
  replaceScreen('manuscript-recovery', content);
  focusRecoveryHeading(content);
  setStatus(recovery.status === 'deferred' ? '恢复待确认状态仍然有效' : technicalWords('等待你比较并明确选择恢复来源', '请选择要恢复的稿件'));
}

async function openRecoveryViewer(
  recovery: RecoveryComparisonProjection,
  selection: RecoverySelection,
  target: { kind: 'start' } | { kind: 'after'; position: number },
): Promise<void> {
  const current = navigation.begin();
  setStatus(technicalWords('正在读取有界只读恢复窗口…', '正在打开…'), 'busy');
  try {
    const projection = await api.viewRecoveryCandidate({
      attentionId: recovery.attentionId, expectedAttentionVersion: recovery.attentionVersion,
      selection, target,
    });
    if (current.isCurrent()) renderRecoveryViewer(recovery, projection);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, current)) return;
    setStatus(rendererErrorMessage(error, technicalWords('无法读取恢复证据。', '无法打开这份稿件。')), 'error');
  }
}

function renderRecoveryViewer(recovery: RecoveryComparisonProjection, projection: RecoveryWindowProjection): void {
  const content = panel();
  content.classList.add('recovery-viewer');
  content.append(
    element('p', 'section-label', technicalWords('仅查看 · 永久只读', '仅查看')),
    element('h2', undefined, projection.title),
    element('p', 'lede', technicalWords(`${projection.revisionLabel} · 只读`, '查看时不能编辑')),
  );
  const blocks = element('article', 'recovery-readonly-blocks');
  blocks.setAttribute('aria-label', technicalWords('恢复证据只读内容窗口', '稿件内容'));
  for (const block of projection.blocks) {
    const node = element(block.kind === 'paragraph' || block.kind === 'note' ? 'p' : block.kind === 'title' ? 'h1' : 'h2', undefined, block.text);
    node.dataset['blockId'] = block.blockId;
    blocks.append(node);
  }
  content.append(blocks);
  const actions = element('div', 'button-row');
  actions.append(button('返回比较', 'secondary', () => renderManuscriptRecovery(recovery)));
  if (projection.nextTarget !== null) {
    actions.append(button(technicalWords('查看下一窗口', '继续往下看'), 'quiet', () =>
      openRecoveryViewer(recovery, projection.selection, projection.nextTarget!)));
  }
  content.append(actions);
  replaceScreen('recovery-viewer', content);
  focusRecoveryHeading(content);
  setStatus(technicalWords('正在仅查看已选择的恢复证据；普通编辑保持关闭', '正在查看，查看时不能编辑'));
}

function renderHistoricalRevision(projection: HistoricalRevisionProjection): void {
  if (!projection.readOnly || projection.blocks.length === 0 || projection.blocks.length > 32) {
    throw new Error('AI7_HISTORICAL_REVISION_INVALID');
  }
  const content = panel();
  content.classList.add('recovery-viewer', 'historical-revision-viewer');
  content.dataset['bookId'] = projection.bookId;
  content.dataset['revisionId'] = projection.revisionId;
  content.dataset['readOnly'] = 'true';
  content.dataset['blockCount'] = String(projection.blocks.length);
  content.append(
    element('h2', undefined, technicalWords(`稿件修订版 ${projection.revisionLabel}`, '历史稿件')),
    element('p', 'lede', `${projection.position.label} · ${technicalWords('只读', '仅查看')}`),
  );
  const identity = element('section', 'source-card');
  const values = element('dl');
  // A durable record, so the absolute local time stays in the Decision Layer (V2-UX-COPY-011) and only
  // the exact instant joins the identities one step away.
  values.append(
    element('dt', undefined, '创建时间'), element('dd', undefined, localInstantLabel(projection.createdAt)),
  );
  identity.append(element('h3', undefined, technicalWords('不可变修订身份', '这份稿件')), values, technicalDetails(
    undefined,
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', projection.bookId),
    element('dt', undefined, '稿件 ID'), element('dd', 'technical-identity', projection.manuscriptId),
    element('dt', undefined, '分支 ID'), element('dd', 'technical-identity', projection.branchId),
    element('dt', undefined, '修订版 ID'), element('dd', 'technical-identity', projection.revisionId),
    element('dt', undefined, '修订摘要'), element('dd', 'technical-identity', projection.revisionDigest),
    element('dt', undefined, '来源版本 ID'), element('dd', 'technical-identity', projection.sourceVersionId),
    element('dt', undefined, '创建时间（精确）'), element('dd', 'technical-identity', projection.createdAt),
  ));
  const blocks = element('article', 'recovery-readonly-blocks historical-revision-blocks');
  blocks.setAttribute('aria-label', technicalWords('历史修订版只读内容窗口', '历史稿件内容'));
  for (const block of projection.blocks) {
    const tag = block.kind === 'paragraph' || block.kind === 'note' ? 'p' : block.kind === 'title' ? 'h1' : 'h2';
    const node = element(tag, undefined, block.text);
    node.dataset['blockId'] = block.blockId;
    node.dataset['blockPosition'] = String(block.position);
    blocks.append(node);
  }
  content.append(identity, blocks);
  const actions = element('div', 'button-row');
  const returnToCurrent = button('返回当前工作状态', 'primary', async () => {
    returnToCurrent.disabled = true;
    setStatus('正在返回当前可编辑工作状态…', 'busy');
    try {
      await requestBookWorkbenchRoute(
        { kind: 'book', bookId: projection.bookId },
        async (route) => {
          const currentRoute = navigation.route();
          if (route.kind !== 'book' || route.bookId !== projection.bookId) {
            throw new Error('AI7_WORKBENCH_ROUTE_INVALID');
          }
          const current = await api.getManuscriptWindow({
            manuscriptId: projection.manuscriptId,
            branchId: projection.branchId,
            cursor: null,
          });
          if (!currentRoute.isCurrent()) return;
          if (current.bookId !== projection.bookId) throw new Error('AI7_WORKBENCH_ROUTE_INVALID');
          await openEditorWindow(current, projection.bookTitle, undefined, undefined, undefined, undefined, currentRoute);
        },
      );
    } catch (error) {
      returnToCurrent.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回当前工作状态。'), 'error');
    }
  });
  returnToCurrent.dataset['returnToCurrentRevision'] = projection.revisionId;
  actions.append(returnToCurrent);
  const showPage = async (cursor: string): Promise<void> => {
    const current = navigation.begin();
    setStatus('正在读取下一段只读修订内容…', 'busy');
    try {
      const next = await api.getHistoricalRevision({ revisionId: projection.revisionId, cursor });
      if (!current.isCurrent()) return;
      renderHistoricalRevision(next);
    } catch (error) {
      if (navigation.errorIsCurrent(error, current)) setStatus(rendererErrorMessage(error, '无法读取只读修订内容。'), 'error');
    }
  };
  if (projection.previousCursor) actions.append(button('上一窗口', 'quiet', () => showPage(projection.previousCursor!)));
  if (projection.nextCursor) actions.append(button('下一窗口', 'quiet', () => showPage(projection.nextCursor!)));
  content.append(actions);
  replaceScreen('historical-revision', content, { bookId: projection.bookId, title: projection.bookTitle, section: 'overview' });
  agentWorkspaceReturns.set(content, () => renderHistoricalRevision(projection));
  focusRecoveryHeading(content);
  setStatus(technicalWords(`只读历史修订版已打开；${projection.position.label}。`, `已打开历史稿件；${projection.position.label}。`));
}

function renderContinuation(
  continuation: ContinueImportProjection,
  recoveryReturn?: RecoveryReturnContext,
): void {
  if (continuation.state === 'target-review-required') {
    setStatus(continuation.reviewInvalidated ? '旧复核已失效，需要重新确认' : '暂存快照已重新校验', 'success');
    renderTargetChoice(continuation.staged, null, continuation.notice, recoveryReturn);
    return;
  }
  if (continuation.state === 'review-ready') {
    setStatus('暂存快照与导入前复核已重新校验', 'success');
    if ('comparison' in continuation.review) {
      renderManuscriptReimportReview(continuation.review, continuation.notice, recoveryReturn);
    } else if ('retainedBoundary' in continuation.review) {
      renderSourceImportReview(continuation.review, continuation.notice, recoveryReturn);
    } else {
      renderReview(continuation.review, continuation.notice, recoveryReturn);
    }
    return;
  }
  if (continuation.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    renderImported(continuation.result, recoveryReturn);
    return;
  }
  renderImportRecovery(continuation.recovery, recoveryReturn);
}

async function abandonAndContinue(
  recovery: Pick<ImportDraftRecoveryProjection, 'draftId' | 'draftVersion'>,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  const origin = navigation.route();
  setStatus(technicalWords('正在核对提交证据并放弃非权威草稿…', '正在放弃本次导入…'), 'busy');
  try {
    const startup = await api.abandonImportDraft({
      draftId: recovery.draftId,
      expectedDraftVersion: recovery.draftVersion,
    });
    setStatus(startup.state === 'none' ? technicalWords('已放弃导入草稿并安全清理暂存引用', '已放弃本次导入') : technicalWords('已核对导入状态', '已更新导入状态'), 'success');
    if (origin.isCurrent()) await renderStartupProjection(startup, recoveryReturn, origin);
  } catch (error) {
    renderError(error, () => void initializeStartup());
  }
}

function renderImportRecovery(
  recovery: ImportDraftRecoveryProjection,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const uncertain = recovery.kind === 'outcome-uncertain';
  const cleanup = recovery.kind === 'abandonment-cleanup';
  const content = panel();
  content.classList.add('recovery-panel');
  content.append(
    element(
      'p',
      'section-label',
      technicalWords(cleanup ? '启动恢复 · 持久放弃清理' : uncertain ? '启动恢复 · 原子结果待确认' : '启动恢复 · 非权威导入草稿', '上次导入未完成'),
    ),
    element('h2', undefined, cleanup ? '放弃清理尚未完成' : uncertain ? '导入提交结果待确认' : '发现未完成的导入'),
    element(
      'p',
      'lede',
      cleanup
        ? technicalWords('放弃意图已经持久化。系统已阻止继续导入和任何新的权威引用；只有在暂存字节与权威记录都完成安全清理后才会报告成功。', '已放弃这次导入，但临时文件尚未清理完；请重试清理。')
        : uncertain
        ? technicalWords('本地证据目前无法证明这次原子提交已经完成或确定未提交。为避免重复图书或误删来源，系统已阻止重试、放弃和暂存清理。', '暂时无法确认这次导入是否已完成。为避免重复导入，请先不要重试或删除文件。')
        : technicalWords('启动不会替你继续、选择目标或提交。请明确选择继续导入或放弃。', '可以继续导入，或放弃本次导入。'),
    ),
  );
  const summary = element('section', 'source-card recovery-summary');
  summary.append(element('h3', undefined, recovery.sourceDisplayName));
  const details = element('dl');
  details.append(
    element('dt', undefined, '状态'),
    element(
      'dd',
      undefined,
      cleanup
        ? technicalWords('持久放弃清理 · 阻止继续与新权威引用', '正在清理')
        : uncertain
        ? technicalWords('非权威草稿 · 提交结果待确认', '导入结果待确认')
        : recovery.snapshotState === 'complete'
          ? technicalWords('完整暂存快照 · 尚未形成导入权威', '可以继续导入')
          : technicalWords('暂存不完整或损坏 · 需要精确重选', '临时文件不完整，请重新选择原文件'),
    ),
    element('dt', undefined, '上次完成位置'),
    element(
      'dd',
      undefined,
      recovery.lastCompletedStep === 'abandonment-cleanup'
        ? technicalWords('已持久化放弃与安全清理意图', '已放弃')
        : recovery.lastCompletedStep === 'review'
        ? '导入前复核'
        : recovery.lastCompletedStep === 'commit-attempt'
          ? technicalWords('已持久化提交尝试，尚未证明提交', '正在导入')
          : recovery.lastCompletedStep === 'commit-outcome-uncertain'
            ? technicalWords('原子提交边界', '正在导入')
            : technicalWords('本地暂存与预检', '已读取文件'),
    ),
    ...(recovery.reviewedTitle
      ? [element('dt', undefined, technicalWords('已复核书名', '书名')), element('dd', undefined, recovery.reviewedTitle)]
      : []),
    ...(recovery.targetLabel
      ? [element('dt', undefined, technicalWords('已复核目标', '导入到')), element('dd', undefined, recovery.targetLabel)]
      : []),
    ...(recovery.targetBookId && technicalLayerVisible
      ? [element('dt', undefined, '已复核图书 ID'), element('dd', 'technical-identity', recovery.targetBookId)]
      : []),
    ...(recovery.relationshipLabel
      ? [element('dt', undefined, technicalWords('已复核关系', '导入方式')), element('dd', undefined, recovery.relationshipLabel)]
      : []),
  );
  summary.append(details);
  if (!cleanup) summary.append(element('p', recoveryTone(recovery.originalFileAccess.state), recovery.originalFileAccess.label));
  content.append(summary);
  if (cleanup) {
    const support = element('section', 'uncertain-support');
    support.append(
      element('h3', undefined, technicalWords('安全清理状态', '清理状态')),
      ...(technicalLayerVisible ? [element('p', undefined, `状态代码：${recovery.supportCode ?? 'ABANDON_CLEANUP_PENDING'}`)] : []),
      element('p', 'field-note', technicalWords('此状态不包含暂存正文或原始文件路径，请保留 Agent Data Root；重试会继续同一个持久清理意图，不会创建第二次放弃或导入。', '清理尚未完成，请保留 AI7 数据并重试；重试会继续原操作，不会重复导入或放弃。')),
    );
    const actions = element('div', 'button-row recovery-actions');
    actions.append(button('重试放弃清理', 'primary', () => abandonAndContinue(recovery, recoveryReturn)));
    content.append(support, actions);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('import-cleanup', content);
    setStatus(technicalWords('放弃清理尚未完成；已阻止继续导入和新权威引用', '清理尚未完成，请重试'), 'error');
    return;
  }
  if (recovery.staged) content.append(sourceCard(recovery.staged));
  const recoveredWord = recovery.staged?.wordTrackedChanges;
  if (recoveredWord?.compatibility === 'ready' && recoveredWord.savedChoice !== null) {
    const choice = recoveredWord.savedChoice;
    const saved = element('section', 'review-section');
    saved.dataset['wordRecoveredMode'] = choice.mode; saved.dataset['wordRecoveredLearning'] = String(choice.learnFromEdits);
    saved.append(element('h3', undefined, '已保存的 Word 导入选择'), element('p', undefined, `导入方式：${WORD_IMPORT_MODE_NAMES[choice.mode]}`),
    element('p', undefined, choice.mode === 'suggestions'
      ? technicalWords('撤销原修订后的阅读作为基线，原修订保留为建议。', '原修订将作为待处理的修改建议。') : technicalWords('已单独确认：接受原修订后的阅读作为基线。', '导入修订后的正文。')),
    element('p', undefined, choice.learnFromEdits ? technicalWords('已选择学习这些编辑改动；提交时仍会校验当前排除设置。', '允许学习这些修改。') : technicalWords('已关闭本次编辑改动学习。', '不学习这些修改。')));
    content.append(saved);
  }

  if (uncertain) {
    const support = element('section', 'uncertain-support');
    support.append(
      element('h3', undefined, technicalWords('本地恢复与支持信息', '需要核对')),
      ...(technicalLayerVisible ? [
        element('p', undefined, `草稿标识：${recovery.draftId}`),
        element('p', undefined, `提交尝试：${recovery.commitAttemptId ?? '未读取'}`),
        element('p', undefined, `状态代码：${recovery.supportCode ?? 'COMMIT_PROOF_INCONCLUSIVE'}`),
      ] : []),
      element('p', 'field-note', technicalWords('这些信息不包含暂存正文、数据库内容、截图、跟踪或网络请求，请保留 Agent Data Root 等待本地核对；不要重复导入或手动删除暂存文件。', '无法确认清理状态，请保留 AI7 数据等待核对，不要重复导入或删除暂存文件。')),
    );
    content.append(support);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('import-uncertain', content);
    setStatus(technicalWords('导入提交结果待确认；已阻止重试、放弃和清理', '导入结果待确认'), 'error');
    return;
  }

  const actions = element('div', 'button-row recovery-actions');
  if (recovery.snapshotState === 'complete') {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery, recoveryReturn));
    const continueButton = button('继续导入', 'primary', async () => {
      continueButton.disabled = true;
      abandonButton.disabled = true;
      setStatus(technicalWords('正在重新校验暂存字节、解析器、目标与复核…', '正在继续导入…'), 'busy');
      try {
        renderContinuation(
          await api.continueImportDraft({
            draftId: recovery.draftId,
            expectedDraftVersion: recovery.draftVersion,
          }),
          recoveryReturn,
        );
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(continueButton, abandonButton);
  } else {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery, recoveryReturn));
    const reselect = button('重新选择原文件', 'primary', async () => {
      reselect.disabled = true;
      abandonButton.disabled = true;
      setStatus(technicalWords('请选择与原暂存来源摘要精确一致的原文件…', '请重新选择同一个原文件…'), 'busy');
      try {
        const result = await api.reselectImportDraft({
          draftId: recovery.draftId,
          expectedDraftVersion: recovery.draftVersion,
        });
        if (result.status === 'cancelled') {
          renderImportRecovery(recovery, recoveryReturn);
          setStatus('已取消文件重选');
          return;
        }
        renderContinuation(result.continuation, recoveryReturn);
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(reselect, abandonButton);
  }
  content.append(actions);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('import-recovery', content);
  setStatus('等待你选择继续导入或放弃');
}

function appendRecordField(values: HTMLElement, label: string, value: string | null, technical = false): void {
  if (technical && !technicalLayerVisible) return;
  values.append(
    element('dt', undefined, label),
    element('dd', technical ? 'technical-identity' : undefined, value ?? '—'),
  );
}

/**
 * A record's instant. The record detail is itself the Technical Identity Layer, reached by a deliberate
 * click, so it gains no disclosure of its own (the survey judged it conforming); the exact instant rides
 * inside the row beside the absolute local reading V2-UX-COPY-011 requires of a durable receipt.
 */
function appendRecordInstant(values: HTMLElement, label: string, iso: string): void {
  values.append(element('dt', undefined, label), instantValue(iso));
}

function editorialRecordLabel(record: BookRecordPresentation): string {
  if (technicalLayerVisible) return record.label;
  switch (record.kind) {
    case 'source': return '来源文件';
    case 'import-record': return '稿件导入记录';
    case 'source-import-record': return '资料导入记录';
    case 'manuscript-reimport-record': return '重新导入记录';
    case 'book': return '图书';
    case 'manuscript': return '稿件';
    case 'revision': return '稿件版本';
    case 'workflow': return '工作进度';
  }
}

function recordPresentation(record: BookRecordPresentation): HTMLElement {
  const detail = element('section', 'source-card record-detail');
  detail.dataset['recordKind'] = record.kind;
  detail.append(element('h3', undefined, editorialRecordLabel(record)));
  const values = element('dl');
  switch (record.kind) {
    case 'book':
      appendRecordField(values, '图书 ID', record.bookId, true);
      appendRecordField(values, '稳定标识', record.stableIdentity, true);
      appendRecordField(values, '书名', record.title);
      appendRecordField(values, '内部编号', record.internalNumber);
      appendRecordInstant(values, '创建时间', record.createdAt);
      appendRecordField(values, '编辑维度集 ID', record.dimensionSetId, true);
      appendRecordField(values, '编辑维度集摘要', record.dimensionSetDigest, true);
      break;
    case 'manuscript':
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '关系', '主稿件');
      appendRecordInstant(values, '创建时间', record.createdAt);
      break;
    case 'revision':
      appendRecordField(values, '修订版 ID', record.revisionId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '分支 ID', record.branchId, true);
      appendRecordField(values, '版本标签', record.revisionLabel);
      appendRecordField(values, '修订摘要', record.revisionDigest, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordInstant(values, '创建时间', record.createdAt);
      break;
    case 'source':
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '原文件名', record.displayName);
      appendRecordField(values, '格式', record.format);
      appendRecordField(values, '原文件 SHA-256', record.sourceDigest, true);
      // A retained original the product never parsed has no content, structure or parser identity,
      // so those rows are absent rather than empty (ADR 0072 §2).
      if (record.parserIdentity !== null) {
        appendRecordField(values, '内容摘要', record.contentDigest, true);
        appendRecordField(values, '结构摘要', record.structureDigest, true);
        appendRecordField(values, '解析器', record.parserIdentity, true);
      }
      // An original the product read through a converted DOCX names that object and its converter,
      // beside — never instead of — the original's own identity above (ADR 0072 §2).
      if (record.converterIdentity !== null) {
        appendRecordField(values, '工作表示 SHA-256', record.workingObjectDigest, true);
        appendRecordField(values, '转换器', record.converterIdentity, true);
      }
      appendRecordField(values, '取得方式', '本机文件选择器', true);
      appendRecordField(values, '处理边界', '本地 · 未调用 Provider', true);
      break;
    case 'workflow':
      appendRecordField(values, '工作流实例 ID', record.workflowInstanceId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '当前阶段', record.currentPhase);
      appendRecordField(values, '实例状态', record.state);
      appendRecordField(values, 'AI7 投影', `${record.projection.id}@${record.projection.version}`, true);
      appendRecordField(values, 'AI7 投影摘要', record.projection.digest, true);
      appendRecordField(values, '原生 Profile', `${record.nativeProfile.id}@${record.nativeProfile.version}`, true);
      appendRecordField(values, '原生 Profile 摘要', record.nativeProfile.digest, true);
      break;
    case 'import-record':
      appendRecordField(values, '稿件导入记录 ID', record.importRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '导入保真审阅 ID', record.fidelityReviewId, true);
      appendRecordField(
        values,
        '保真结果',
        fidelityOutcomeLabel(record.fidelityOutcome),
      );
      appendRecordField(values, '导入降级决定 ID', record.degradationDecisionId, true);
      appendRecordField(values, '结果修订版 ID', record.resultingRevisionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
    case 'source-import-record':
      appendRecordField(values, '来源导入记录 ID', record.sourceImportRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '目标类型', record.targetKind === 'new-book' ? '新建图书' : '现有图书');
      appendRecordField(
        values,
        technicalWords('来源版本结果', '来源文件'),
        technicalWords(record.sourceVersionDisposition === 'reused-same-book' ? '复用已明确选择的同图书来源版本' : '创建图书拥有的新来源版本', record.sourceVersionDisposition === 'reused-same-book' ? '使用已导入的文件' : '导入新文件'),
      );
      // The boundary claims a parse only where one happened, and says so when a converter did it (ADR 0072 §2; Issue #583).
      appendRecordField(values, '保留边界', record.retainedBoundary.label.replace(/^保留/, ''), true);
      appendRecordField(values, technicalWords('保留文件名', '文件名'), record.retainedBoundary.displayName);
      appendRecordField(values, technicalWords('保留格式', '格式'), record.retainedBoundary.format);
      appendRecordField(values, '保留字节数', String(record.retainedBoundary.sourceBytes), true);
      appendRecordField(values, '保留文件 SHA-256', record.retainedBoundary.sourceSha256, true);
      if (record.retainedBoundary.contentDigest !== null && record.retainedBoundary.structureDigest !== null) {
        appendRecordField(values, '保留内容摘要', record.retainedBoundary.contentDigest, true);
        appendRecordField(values, '保留结构摘要', record.retainedBoundary.structureDigest, true);
      }
      appendRecordField(values, '记录摘要', record.recordDigest, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
    case 'manuscript-reimport-record':
      appendRecordField(values, '稿件重新导入记录 ID', record.reimportRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '前一修订版 ID', record.previousRevisionId, true);
      appendRecordField(values, '结果修订版 ID', record.resultingRevisionId, true);
      appendRecordField(values, '结果', record.resultLabel);
      appendRecordField(values, '来源关系', record.lineageLabel, true);
      appendRecordField(values, '来源关系版本 ID', record.lineageSourceVersionId, true);
      appendRecordField(values, '比较方式', record.comparisonKind === 'three-way' ? '三方比较' : '两方比较', true);
      appendRecordField(values, '比较摘要', record.comparisonDigest, true);
      appendRecordField(values, '解决摘要', record.resolutionDigest, true);
      appendRecordField(values, '导入保真审阅 ID', record.fidelityReviewId, true);
      appendRecordField(values, '保真结果', fidelityOutcomeLabel(record.fidelityOutcome));
      appendRecordField(values, '导入降级决定 ID', record.degradationDecisionId, true);
      appendRecordField(values, '记录摘要', record.recordDigest, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
  }
  detail.append(values);
  if (record.kind === 'manuscript-reimport-record' && record.groups.count > 0) {
    // The rows the editor resolved, each with its verb (Issue #412, S63), and the marks that could not follow.
    const rows = element('ul', 'degradation-list reimport-record-groups');
    for (const group of record.groups.items) {
      const row = element('li', undefined, `第 ${group.ordinal} 处 · ${group.verbLabel} · ${reimportRangeLine(group.currentFrom, group.currentTo, group.stagedFrom, group.stagedTo)}${group.chapterLabel === null ? '' : ` · 「${group.chapterLabel}」`}`);
      row.dataset['reimportGroupVerb'] = group.verb;
      rows.append(row);
    }
    const unlisted = record.markOutcomes.unfollowed - record.markOutcomes.items.length;
    const groupsHeading = element('h4', undefined, `章节对应 · ${record.groups.count} 处`);
    groupsHeading.append(' · ', element('span', undefined, `标记：${record.markOutcomes.followed} 条已跟随，${record.markOutcomes.unfollowed} 条未能跟随${unlisted > 0 ? `；另有 ${unlisted} 条未列出` : ''}。`));
    detail.append(groupsHeading, rows);
    // Each mark that could not follow, as the landing notice listed it: set aside for good, so the record is where it is read later.
    if (record.markOutcomes.items.length > 0) {
      const unfollowed = element('ul', 'degradation-list reimport-record-unfollowed');
      for (const item of record.markOutcomes.items) {
        const entry = element('li', undefined, reimportUnfollowedLine(item));
        entry.dataset['reimportRecordUnfollowedMarkId'] = item.markId;
        unfollowed.append(entry);
      }
      detail.append(unfollowed);
    }
  }
  if (record.kind === 'import-record' || record.kind === 'manuscript-reimport-record') {
    const fidelity = element('details', 'degradation-disclosure');
    fidelity.append(element('summary', undefined, fidelityDisclosureSummary(record.fidelityCategories)));
    const categories = element('ul', 'degradation-list');
    for (const category of record.fidelityCategories) {
      categories.append(element(
        'li',
        undefined,
        `${category.label} · ${category.statusLabel} · ${category.count} 项 · ${fidelityDetailText(category.detail)}`,
      ));
    }
    fidelity.append(categories);
    detail.append(fidelity);
    if (record.degradationDecision) {
      const acceptedDisclosure = element('details', 'degradation-disclosure');
      acceptedDisclosure.append(element('summary', undefined, `${record.degradationDecision.summaryLabel} · 查看受影响类别、示例与导出后果`));
      const accepted = element('ul', 'degradation-list');
      for (const item of record.degradationDecision.acceptedItems) {
        const category = record.fidelityCategories.find((candidate) => candidate.key === item.categoryKey);
        if (!category) throw new Error('AI7_IMPORT_RESULT_INVALID');
        const row = element('li', undefined, `${item.label} · ${item.count} 项 · ${fidelityDetailText(category.detail)}`);
        row.dataset['degradationCategory'] = item.categoryKey;
        row.dataset['degradationCount'] = String(item.count);
        accepted.append(row);
      }
      acceptedDisclosure.append(accepted);
      detail.append(acceptedDisclosure);
    }
  }
  if (record.kind === 'source-import-record' && technicalLayerVisible) {
    detail.append(listSection('不会做', record.namedNonEffects));
  }
  if (record.kind === 'revision') {
    const openRevision = button(technicalWords('打开此历史修订版', '打开这份历史稿件'), 'secondary', async () => {
      openRevision.disabled = true;
      setStatus(technicalWords('正在路由到精确历史修订版…', '正在打开历史稿件…'), 'busy');
      try {
        await requestBookWorkbenchRoute({ kind: 'revision', revisionId: record.revisionId });
      } catch (error) {
        openRevision.disabled = false;
        setStatus(rendererErrorMessage(error, technicalWords('无法打开精确历史修订版。', '无法打开这份历史稿件。')), 'error');
      }
    });
    openRevision.dataset['openRevisionId'] = record.revisionId;
    const actions = element('div', 'button-row');
    actions.append(openRevision);
    detail.append(actions);
  }
  return detail;
}

async function renderBookWorkbenchChooser(
  currentOverview: BookWorkOverviewProjection,
  accumulated: ReadonlyArray<BookSummaryPageProjection['items'][number]> = [],
  after: BookSummaryPageProjection['nextCursor'] = null,
): Promise<void> {
  const navigationRoute = navigation.begin();
  setStatus('正在读取其他图书…', 'busy');
  try {
    const page = await api.listBooks({ after });
    if (!navigationRoute.isCurrent()) return;
    const books = [...accumulated, ...page.items];
    const content = panel();
    content.classList.add('book-workbench-chooser');
    content.dataset['currentBookId'] = currentOverview.book.bookId;
    const heading = element('h2', undefined, '在另一本图书工作台打开');
    content.append(heading);
    const list = element('div', 'recent-work-list');
    for (const summary of books) {
      if (summary.bookId === currentOverview.book.bookId) continue;
      const open = bookCardOpen(summary.title, summary.manuscriptStateLabel, async () => {
        const navigationRoute = navigation.begin();
        open.disabled = true;
        setStatus('正在打开图书…', 'busy');
        try {
          await requestBookWorkbenchRoute({ kind: 'book', bookId: summary.bookId }, undefined, undefined, navigationRoute);
        } catch (error) {
          if (!navigation.errorIsCurrent(error, navigationRoute)) return;
          open.disabled = false;
          setStatus(rendererErrorMessage(error, '无法打开图书。'), 'error');
        } finally { open.disabled = false; }
      });
      open.dataset['bookId'] = summary.bookId;
      const row = element('article', 'book-summary-item');
      row.append(open, bookCardAction('打开图书'), bookIdentityDisclosure(summary));
      list.append(row);
    }
    if (list.childElementCount === 0) {
      heading.append(' · 没有其他图书可打开。');
    }
    content.append(list);
    const actions = element('div', 'button-row');
    if (page.nextCursor) {
      actions.append(button('加载更多图书', 'secondary', () =>
        renderBookWorkbenchChooser(currentOverview, books, page.nextCursor)));
    }
    actions.append(button('返回当前图书', 'quiet', () => renderBookOverview(currentOverview)));
    content.append(actions);
    replaceScreen('book-workbench-chooser', content, { bookId: currentOverview.book.bookId, title: currentOverview.book.title, section: 'overview' });
    setStatus('请选择另一图书工作台');
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, '无法读取其他图书。'), 'error');
  }
}

/**
 * ②A: the baseline analysis as its own destination under 资料与记录 (editor-surfaces §3, ADR 0076 §5).
 * It is reached from the manuscript's 资料与记录 group and from 工作概览, never on the way into a Book.
 * The way back to the manuscript and to the overview sits in a persistent region, because a settled
 * result set is the longest thing this product renders and its way out must survive it (LAYER-005).
 */
function renderBookFindings(bookId: string, bookTitle: string): void {
  const content = panel();
  content.classList.add('book-findings'); content.dataset['bookId'] = bookId;
  const host = element('div', 'findings-center');
  content.append(host);
  replaceScreen('book-findings', content, { bookId, title: bookTitle, section: 'findings' });
  agentWorkspaceReturns.set(content, () => renderBookFindings(bookId, bookTitle));
  mountFindingsCenter(host, (offset) => api.inspectBookFindings({ offset }), (item: BookFindingProjection) => {
    const target = item.target;
    if (target.kind === 'review') renderBookReview(bookId, bookTitle, { reviewRunId: target.reviewRunId, findingId: target.findingId });
    else if (target.kind === 'risk') renderBookEvaluation(bookId, bookTitle, target);
    else renderBookAnalysis(bookId, bookTitle, target.revisionId, { tab: 'chapters', gap: target.unitOrdinal });
  }, async (items) => {
    const suggestions = items.flatMap((item) => item.suggestion ? [item.suggestion] : []);
    if (!suggestions.length) return;
    try { return await applyFindingBatches(suggestions, api); }
    catch (error) { setStatus(rendererErrorMessage(error, '未能应用修改建议。'), 'error'); }
  }, () => { renderBookReview(bookId, bookTitle); reviewWorkspace?.openNew(); });
  setStatus(FINDINGS_CENTER_WORDS.opened);
}

function renderBookAnalysis(bookId: string, bookTitle: string, target?: JudgedAnalysisItem | string, focus?: { tab: AnalysisTabId; gap?: number }): void {
  const judged = typeof target === 'string' ? undefined : target;
  const revisionId = typeof target === 'string' ? target : undefined;
  const content = panel();
  content.classList.add('book-analysis');
  content.dataset['bookId'] = bookId;
  content.append(
    element('h2', undefined, '分析'),
    element('p', 'lede', '基线分析是其他任务的底稿：全书梗概、人物与名称、事件、关系、设定和各章。'),
  );
  const host = element('div');
  host.dataset['analysisBookId'] = bookId;
  // 后台分析 (Issue #95, S39): the Book's Background Analysis Enrollment, beside the analysis it may start and outside the card,
  // so the card's own follow-ups never redraw it.
  const backgroundHost = element('section');
  backgroundHost.dataset['bookId'] = bookId;
  content.append(host, backgroundHost);
  replaceScreen('book-analysis', content, { bookId, title: bookTitle, section: 'analysis' });
  const page = navigation.read(content);
  agentWorkspaceReturns.set(content, () => renderBookAnalysis(bookId, bookTitle, target, focus));
  setStatus('分析已打开');
  const inspect = (first: boolean): void => {
    // A 学习材料 entry opens ②A on the revision it judged (Issue #61, S26b): read-only when that is no longer the current one.
    const read = first && judged !== undefined
      ? api.inspectBaselineAnalysis().then((current) => current.resultSetRevision?.revisionId === judged.revisionId ? current : api.inspectBaselineAnalysis({ revisionId: judged.revisionId }))
      : api.inspectBaselineAnalysis(revisionId === undefined ? undefined : { revisionId });
    void read.then(
      (projection) => {
        if (!page.isCurrent() || !host.isConnected || projection.bookId !== host.dataset['analysisBookId']) return;
        renderBaselineAnalysis(host, projection, bookTitle);
        if (first && focus !== undefined) {
          host.querySelector<HTMLButtonElement>(`button[data-analysis-tab="${focus.tab}"]`)?.click();
          const item = focus.gap === undefined ? host.querySelector<HTMLElement>(`[data-analysis-panel="${focus.tab}"]`) : host.querySelector<HTMLElement>(`[data-analysis-gap-unit="${focus.gap}"]`);
          if (item !== null) { item.tabIndex = -1; item.scrollIntoView({ block: 'center' }); item.focus({ preventScroll: true }); }
        }
        if (first && judged !== undefined) showJudgedAnalysisItem(host, judged.itemKey);
      },
      (error) => {
        if (!page.isCurrent() || !host.isConnected) return;
        if (!first) {
          setStatus(rendererErrorMessage(error, '无法刷新基线稿件分析状态。'), 'error');
          return;
        }
        const unavailable = element('section', 'baseline-analysis-card attention-note');
        unavailable.dataset['analysisState'] = 'unavailable';
        const refusal = analysisRefusalView(rendererErrorCode(error), rendererErrorMessage(error, '无法读取本地图书的基线稿件分析记录。'));
        unavailable.append(element('h3', undefined, '基线稿件分析'), element('p', undefined, refusal.text));

        host.replaceChildren(unavailable);
      },
    );
  };
  // The drawer's bar started this Task or reconfirmed its plan (Issue #420): ②A reads it again.
  taskSurfaceRefresh = { 'baseline-analysis': () => inspect(false) };
  // The item a 反馈历史 entry judged opens on its own tab (Issue #61 review), the tab the card is drawn with.
  if (judged !== undefined) analysisTabChoice.set(bookId, judged.dimension);
  inspect(true);
  // A Run the Enrollment started is the card's to show: it reads again once one is recorded, never stealing focus.
  mountBackgroundAnalysis({ root: backgroundHost, api: api, setStatus, errorMessage: rendererErrorMessage, onRunStarted: () => inspect(false) });
}

/** The item of ②A a 反馈历史 entry judged: its revision, its place, and the tab it sits on. */
interface JudgedAnalysisItem {
  readonly revisionId: string;
  readonly itemKey: string;
  readonly dimension: AnalysisFeedbackDimension;
}

/**
 * The judged item in view (Issue #61 review): its tab already chosen, the item is scrolled to and takes focus, so the
 * judgment 打开… led to is what the editor sees and a screen reader reads first.
 */
function showJudgedAnalysisItem(host: HTMLElement, itemKey: string): void {
  const item = host.querySelector<HTMLElement>(`[data-analysis-item-key="${CSS.escape(itemKey)}"]`);
  if (item === null) return;
  item.tabIndex = -1;
  item.scrollIntoView({ block: 'center' });
  item.focus({ preventScroll: true });
}

/**
 * ②B 审阅 as its own Book destination under 工作 (editor-surfaces §4, V2-UX-REV-001). The surface is
 * `review-workspace.ts`; the sidebar provides the destination routes. `focus` opens a named Review Run with one finding in
 * view, which is how a Mark Card's 查看任务 arrives here.
 */
function renderBookReview(bookId: string, bookTitle: string, focus: ReviewFocus | null = null, procedureId: string | null = null): void {
  const content = panel();
  content.classList.add('book-review');
  content.dataset['bookId'] = bookId;
  const openBook = async (): Promise<void> => {
    await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId, bookTitle });
  };
  const surface = mountReviewWorkspace({
    root: content,
    bookId,
    bookTitle,
    focus,
    // 运行此工序… from 知识库 (Issue #65, S30): the 新建审阅 sheet opens filled from the procedure.
    procedureId,
    api: api,
    awaitServiceJob,
    technicalDetails,
    setStatus,
    errorMessage: rendererErrorMessage,
    errorCode: (error) => rendererErrorData(error)?.code ?? null,
    openManuscript: async () => {
      const current = navigation.begin();
      setStatus('正在打开稿件…', 'busy');
      try {
        await renderResolvedBookWorkbenchRoute({kind:'book',bookId,bookTitle}, undefined, current);
      } catch (error) {
        if (navigation.errorIsCurrent(error, current)) setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
      }
    },
    goToText: async (target) => {
      const current = navigation.begin();
      const origin = screen.firstElementChild;
      const opened = await api.getManuscriptWindowAt({
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        target: { kind: 'block', blockId: target.blockId },
      });
      if (!current.isCurrent()) return;
      await leaveReturnChip(bookId, target.manuscriptId, target.branchId);
      if (!current.isCurrent() || screen.firstElementChild !== origin) return;
      await openEditorWindow(opened, bookTitle, undefined, undefined, target.markId ?? undefined, undefined, current);
    },
    openProposalWorkspace: (input) => renderProposalWorkspace(input, bookId, bookTitle),
    openPlan: (reviewRunId) => openTaskPlan(bookId, 'review-run', reviewRunId),
    openRules: () => void renderKnowledgeBase('guidelines'),
    openSearchSettings: () => { void leaveThen(() => renderModelServiceSettings('search')); },
    planChanged: () => taskDrawer.refresh('review-run'),
    recorded: (reviewRunId) => { globalAttentionReader.refresh(); manuscriptOnScreen?.followReviewMarks(bookId, reviewRunId); },
    // 在来源与证据中查看 (Issue #901): the Evidence Workspace's deep link into the Book's retained sources.
    openSource: (evidenceId) => renderBookSources(bookId, bookTitle, evidenceId),
    // 查看学习来源链 (Issue #912): 质量与学习 › 学习回溯 at the material a result's preference came from.
    openLearningLineage: (materialBookId, materialKey, reviewRunId) => void renderQualityLearning('audit', null, false,
      { bookId: materialBookId, materialKey }, () => renderBookReview(bookId, bookTitle, { reviewRunId, findingId: null })),
  });
  replaceScreen('book-review', content, { bookId, title: bookTitle, section: 'review' });
  agentWorkspaceReturns.set(content, () => renderBookReview(bookId, bookTitle, focus, procedureId));
  reviewWorkspace = surface;
  // The drawer's bar approved the Run (Issue #420): ②B reads it again and follows it as it runs.
  taskSurfaceRefresh = { 'review-run': () => surface.refresh() };
  surface.start();
  setStatus(REVIEW_STATUS_LINES.opened);
}

/**
 * ⑥ 交付物 as its own Book destination under 工作, beside 审阅 (editor-surfaces §9, IA-006). The surface is
 * `deliverables.ts`; destination navigation belongs to the sidebar.
 */
/**
 * The dedicated Proposal review workspace (Issue #902, V2-UX-PROP-002): offered, never entered by itself. It takes the
 * manuscript view's place; 返回稿件 opens the manuscript at the active change with its card.
 */
async function renderProposalWorkspace(input: { manuscriptId: string; branchId: string; resultId: string | null }, bookId: string, bookTitle: string): Promise<void> {
  const route = navigation.begin();
  const origin = screen.firstElementChild;
  let onDocument = false;
  try { onDocument = (await api.getManuscriptWindow({ manuscriptId: input.manuscriptId, branchId: input.branchId, cursor: null })).deliverable === 'production-document'; }
  catch (error) { if (navigation.errorIsCurrent(error, route)) setStatus(rendererErrorMessage(error, '无法打开提案审阅工作区。'), 'error'); return; }
  if (!route.isCurrent() || screen.firstElementChild !== origin) return;
  const content = panel(); content.dataset['bookId'] = bookId; content.classList.add('proposal-workspace');
  const surface = mountProposalWorkspace({ root: content, api: api, input, bookTitle, setStatus,
    returnToManuscript: async (blockId, markId) => {
      const current = navigation.begin();
      const binding = { manuscriptId: input.manuscriptId, branchId: input.branchId };
      const opened = blockId === null ? await api.getManuscriptWindow({ ...binding, cursor: null }) : await api.getManuscriptWindowAt({ ...binding, target: { kind: 'block', blockId } });
      if (!current.isCurrent()) return;
      await openEditorWindow(opened, bookTitle, undefined, undefined, markId ?? undefined, undefined, current);
    }, openConflict: (markId) => renderProposalConflict({ ...input, bookId, markId, onDocument }, bookTitle),
  });
  replaceScreen('proposal-workspace', content, { bookId, title: bookTitle, section: 'review' }); proposalWorkspaceSurface = surface; leaveGuard = () => surface.settle(); surface.start();
  agentWorkspaceReturns.set(content, () => renderProposalWorkspace(input, bookId, bookTitle));
}

function withConflictCompletion(onDocument: boolean, returning: Parameters<typeof mountProposalConflict>[0]['returnToManuscript']): Parameters<typeof mountProposalConflict>[0]['returnToManuscript'] {
  return async (at, completion) => {
    try { await returning(at, completion); }
    finally { if (completion !== null) setStatus(conflictCompletionOn(onDocument, completion), 'success'); }
  };
}


/**
 * 稿件冲突 of one 修改建议 as a Dedicated Work Workspace (Issue #57; ED-003, IA › Proposal conflict workspace).
 * It takes the manuscript view's place; the surface is `proposal-conflict.ts`, and this only routes to it
 * and back: 返回稿件 — and every way the conflict is left — opens the manuscript at the conflict's paragraph
 * with the card it came from, or the new version's, open again.
 */
function renderProposalConflict(target: { bookId: string; manuscriptId: string; branchId: string; markId: string; onDocument: boolean }, bookTitle: string): void {
  const content = panel();
  content.classList.add('proposal-conflict-workspace');
  content.dataset['conflictMarkId'] = target.markId;
  content.dataset['bookId'] = target.bookId;
  let origin: NavigationCheckpoint;
  const surface = mountProposalConflict({
    root: content,
    manuscriptId: target.manuscriptId,
    branchId: target.branchId,
    markId: target.markId,
    bookTitle,
    platform: api.platform,
    api: api,
    technicalDetails,
    setStatus,
    errorMessage: rendererErrorMessage,
    errorCode: (error) => rendererErrorData(error)?.code ?? null,
    returnToManuscript: withConflictCompletion(target.onDocument, async (at, completion) => {
      if (!origin.isCurrent()) return;
      const current = completion === null ? navigation.begin() : navigation.route();
      let opened: ManuscriptWindowProjection | undefined;
      if (at === null) {
        // With no place to return to, a conflict on a Production Document returns to that document, and one on the
        // Manuscript to where the Book opens.
        opened = await guardNavigationRead(current, () => api.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null }));
        if (!opened || !current.isCurrent()) return;
        if (opened.deliverable === 'production-document') await guardNavigationRead(current, () => openEditorWindowNow(opened!, bookTitle, undefined, undefined, undefined, undefined, current));
        else await guardNavigationRead(current, () => renderResolvedBookWorkbenchRouteNow({ kind: 'book', bookId: target.bookId, bookTitle }, undefined, current));
      } else {
        opened = await guardNavigationRead(current, () => api.getManuscriptWindowAt({
          manuscriptId: target.manuscriptId,
          branchId: target.branchId,
          target: { kind: 'block', blockId: at.blockId },
        }));
        if (!opened || !current.isCurrent()) return;
        await guardNavigationRead(current, () => openEditorWindowNow(opened!, bookTitle, undefined, undefined, at.markId, undefined, current));
      }
    }),
    openConflict: (markId) => renderProposalConflict({ ...target, markId }, bookTitle),
  });
  replaceScreen('proposal-conflict', content, { bookId: target.bookId, title: bookTitle, section: 'review' });
  origin = navigation.read(content);
  agentWorkspaceReturns.set(content, () => renderProposalConflict(target, bookTitle));
  proposalConflictSurface = surface;
  // Leaving for 待我处理 from the header saves the draft on screen first, as 返回稿件 does (Issue #424).
  leaveGuard = () => surface.settle();
  surface.start();
}

/**
 * ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5): the Book's Evaluation Records under the house profile — the surface
 * is `evaluation.ts` — with the way back to the manuscript and to 工作概览.
 */
function renderBookEvaluation(bookId: string, bookTitle: string, focus?: { recordId: string; riskId: string }, start = false): void {
  const content = panel();
  content.classList.add('book-evaluation');
  content.dataset['bookId'] = bookId;
  const host = element('div', 'evaluation-host');
  content.append(host);
  let firstEvaluationRead = true;
  const surface = mountEvaluation({
    root: host,
    api: { ...api, inspectEvaluation: (input) => {
      const first = firstEvaluationRead; firstEvaluationRead = false;
      return api.inspectEvaluation(first && focus !== undefined ? { recordId: focus.recordId } : input);
    } },
    setStatus,
    errorMessage: rendererErrorMessage,
    technicalDetails,
    awaitServiceJob,
    openLaunch: (request) => taskDrawer.openLaunch(request, () => host),
    // AI7 初评's plan opens in the Task Drawer beside 评估 (Issue #429, S81b1), and its bar starts it.
    openPlan: (ref) => openTaskPlan(bookId, 'initial-evaluation', ref),
    // 审稿意见 (Issue #429, S81c): its plan in the drawer likewise, and its draft on the manuscript surface as 交付物 opens one.
    bookId,
    openReadersReportPlan: (ref) => openTaskPlan(bookId, 'readers-report', ref),
    // 按我的评分重写评语 (Issue #429, S81b2): its plan in the drawer likewise.
    openRewritePlan: (ref) => openTaskPlan(bookId, 'evaluation-rewrite', ref),
    openDraft: async (draft) => {
      const current = navigation.begin();
      try {
      const opened = await api.getManuscriptWindow({ manuscriptId: draft.document.documentId, branchId: draft.document.branchId, cursor: null });
      if (!current.isCurrent()) return;
      navigation.present(() => renderEditorWindow(opened, bookTitle, undefined, undefined, undefined, undefined, { typeId: draft.typeId, typeLabel: draft.typeLabel, document: draft.document }));
      } catch (error) { if (navigation.errorIsCurrent(error, current)) throw error; }
    },
  });
  replaceScreen('book-evaluation', content, { bookId, title: bookTitle, section: 'evaluation' });
  const page = navigation.read(content);
  agentWorkspaceReturns.set(content, () => renderBookEvaluation(bookId, bookTitle, focus));
  taskSurfaceRefresh = { 'initial-evaluation': () => surface.refresh(), 'readers-report': () => surface.refresh(), 'evaluation-rewrite': () => surface.refresh() };
  setStatus(EVALUATION_STATUS.loading, 'busy');
  void surface.load().then(
    () => {
      if (page.isCurrent()) {
        setStatus(EVALUATION_STATUS.opened);
        if (start) host.querySelector<HTMLButtonElement>('[data-evaluation-action="new-evaluation"]')?.click();
        if (focus !== undefined) {
          const risk = host.querySelector<HTMLElement>(`[data-risk-id="${CSS.escape(focus.riskId)}"]`);
          if (risk !== null) { risk.tabIndex = -1; risk.scrollIntoView({ block: 'center' }); risk.focus({ preventScroll: true }); }
        }
      }
    },
    (error: unknown) => {
      if (page.isCurrent()) setStatus(rendererErrorMessage(error, EVALUATION_STATUS.unavailable), 'error');
    },
  );
}

/**
 * ② 资料与记录 › 来源与证据 (Issue #425, S70; IA-012, SRC-013): the Book's retained external sources, with the way back to the
 * manuscript and to 工作概览 that every destination of the Book keeps. Read-only but for 保存为来源材料.
 */
function renderBookSources(bookId: string, bookTitle: string, focusEvidenceId?: string): void {
  const content = panel();
  content.classList.add('book-sources');
  content.dataset['bookId'] = bookId;
  const host = element('div', 'research-evidence-host');
  content.append(
    element('h2', undefined, SOURCES_TITLE),
    host,
  );
  const surface = mountResearchEvidence({ root: host, bookId, api: api, setStatus, errorMessage: rendererErrorMessage,
    ...(focusEvidenceId === undefined ? {} : { focusEvidenceId }) });
  replaceScreen('book-sources', content, { bookId, title: bookTitle, section: 'sources' });
  const page = navigation.read(content);
  agentWorkspaceReturns.set(content, () => renderBookSources(bookId, bookTitle, focusEvidenceId));
  setStatus(SOURCES_STATUS.loading, 'busy');
  void surface.load().then(
    () => {
      if (!page.isCurrent()) return;
      setStatus(SOURCES_STATUS.opened);
      // The source view has followed its existing cursor pages to the retained source named by this deep link.
      if (focusEvidenceId !== undefined) {
        const card = content.querySelector<HTMLElement>(`[data-evidence-id="${CSS.escape(focusEvidenceId)}"]`);
        if (card !== null) {
          card.tabIndex = -1;
          card.scrollIntoView({ block: 'center' });
          card.focus();
        }
      }
    },
    (error: unknown) => {
      if (page.isCurrent()) setStatus(rendererErrorMessage(error, SOURCES_STATUS.unavailable), 'error');
    },
  );
}

/** The Book's 稿件 at its remembered place (Issue #1403): where every derivative document, and AI 写作, now lives. */
async function renderBookManuscript(bookId: string, bookTitle: string, route: NavigationCheckpoint = navigation.begin()): Promise<NavigationCheckpoint | undefined> {
  return guardNavigationRead(route, () => renderResolvedBookWorkbenchRouteNow({ kind: 'book', bookId, bookTitle }, undefined, route));
}

/** One derivative document on the manuscript's surface (Issue #1403), read like the manuscript's window. */
async function openProductionDocument(documentNow: ProductionDocumentProjection, type: { typeId: string; label: string }, bookTitle: string, notice?: string | null): Promise<void> {
  const navigationRoute = navigation.begin();
  const opened = await api.getManuscriptWindow({ manuscriptId: documentNow.documentId, branchId: documentNow.branchId, cursor: null });
  if (!navigationRoute.isCurrent()) return;
  navigation.present(() => renderEditorWindow(opened, bookTitle, undefined, notice ?? undefined, undefined, undefined, { typeId: type.typeId, typeLabel: type.label, document: documentNow }));
}

function renderDerivativesWorkspace(bookId: string, bookTitle: string): void {
  const content = panel();
  content.dataset['bookId'] = bookId;
  const surface = mountDerivativesWorkspace({ root: content, bookId, bookTitle, api: api,
    setStatus, errorMessage: rendererErrorMessage,
    openDocument: (doc, type, notice) => openProductionDocument(doc, type, bookTitle, notice),
    writing: { awaitServiceJob, openLaunch: (request) => taskDrawer.openLaunch(request, () => null), openWritingPlan: (ref, note) => openTaskPlan(bookId, 'writing', ref, note) },
  });
  replaceScreen('book-derivatives', content, { bookId, title: bookTitle, section: 'derivatives' });
  derivativesSurface = surface;
  agentWorkspaceReturns.set(content, () => renderDerivativesWorkspace(bookId, bookTitle));
  surface.start();
}

function renderBookDeliverables(bookId: string, bookTitle: string, openCase?: { caseId: string; publicationVersionId: string }, focusPackageVersionId?: string): void {
  const content = panel();
  content.classList.add('book-deliverables');
  content.dataset['bookId'] = bookId;
  const surface = mountDeliverables({
    root: content,
    bookId,
    bookTitle,
    api: api,
    // 维护事项待处理 opens its case in place (Issue #426, S68b), and a step of a case reads the header's number again.
    ...(openCase === undefined ? {} : { openCase }),
    // A procedure version's link to one 图书交付包 version (Issue #66, S31b review P3-4): that version in view and focused.
    ...(focusPackageVersionId === undefined ? {} : { focusPackageVersionId }),
    attentionChanged: () => globalAttentionReader.refresh(),
    technicalDetails,
    setStatus,
    errorMessage: rendererErrorMessage,
    // 录入定价与首印… (Issue #430, S82): 设置 › 评估校准与预测 with this Book's entry open.
    ...(technicalLayerVisible ? { openActuals: (bookId: string) => void renderEvaluationCalibration(bookId) } : {}),
    // 打开 a Production Document (Issue #415): its own surface, read like the manuscript's window.
    openDocument: (documentNow, type, notice) => openProductionDocument(documentNow, type, bookTitle, notice),
    // 新闻稿、简介等衍生稿件 live on 稿件 (Issue #1403).
    openManuscript: () => void renderBookManuscript(bookId, bookTitle).catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error')),
    openDerivatives: () => renderDerivativesWorkspace(bookId, bookTitle),
    // 前往审阅 from 图书交付包's work records (Issue #416): the Book's 审阅, where a report is generated.
    openReview: () => renderBookReview(bookId, bookTitle),
  });
  replaceScreen('book-deliverables', content, { bookId, title: bookTitle, section: 'deliverables' });
  agentWorkspaceReturns.set(content, () => renderBookDeliverables(bookId, bookTitle, openCase, focusPackageVersionId));
  deliverablesSurface = surface;
  surface.start();
  setStatus(DELIVERABLES_STATUS_LINES.opened);
}

// ②A's baseline-analysis card lives in baseline-analysis-card.ts (Issue #1172); the shell lends it what it reaches.
const { renderBaselineAnalysis, renderRunReport } = createBaselineAnalysisCard({
  awaitServiceJob, jumpToManuscript, leaveReturnChip, openEditorWindow, openTaskPlan, quickStartStartedLine, renderBookReview,
  rendererErrorMessage, screen, setStatus, taskDrawer, taskPlanOpenButton, technicalDetails,
});

function renderForegroundExecutionBoundary(
  host: HTMLElement,
  projection: ForegroundExecutionBoundaryProjection,
): void {
  const result = element('section', 'attention-note task-foreground-execution-boundary');
  result.dataset['foregroundExecutionState'] = projection.state;
  const lineage = element('dl', 'task-authorization-facts');
  lineage.append(
    element('dt', undefined, '任务运行权限'), element('dd', undefined, projection.runAuthority),
    element('dt', undefined, '当前可信策略'),
    element('dd', undefined, technicalWords(`${projection.launchPolicy.operationalScope} · Provider Processing ${projection.launchPolicy.providerProcessing.version} · ${projection.launchPolicy.providerProcessing.authorizedLiveTransmissionCount} 次实时传输`)),
  );
  const reasons = element('ul', 'task-authorization-non-effects');
  for (const reason of projection.reasons) reasons.append(element('li', undefined, reason));
  // The blocker and the policy that produced it stay at full rank (V2-UX-LAYER-002); the five lineage
  // identifiers that let a reader trace it are what goes one step away.
  result.append(element('h4', undefined, projection.terminalLabel), lineage, reasons, technicalDetails(
    'task-authorization-facts',
    element('dt', undefined, '图书'), element('dd', 'technical-identity', projection.bookId),
    element('dt', undefined, '任务意图'), element('dd', 'technical-identity', projection.taskIntentId),
    element('dt', undefined, '计划权限边界'), element('dd', 'technical-identity', projection.planEnvelopeDigest),
    element('dt', undefined, '运行授权'), element('dd', 'technical-identity', projection.authorizationId),
    element('dt', undefined, '任务运行记录'), element('dd', 'technical-identity', projection.runRecordId),
  ));
  host.replaceChildren(result);
}

function renderTaskAuthorization(host: HTMLElement, projection: TaskAuthorizationProjection): void {
  const card = element('section', 'task-authorization-card');
  card.dataset['taskAuthorizationState'] = projection.state;
  card.dataset['taskAuthorizationBookId'] = projection.bookId;
  if (projection.taskIntent) card.dataset['taskIntentId'] = projection.taskIntent.taskIntentId;
  if (projection.planEnvelope) card.dataset['planEnvelopeDigest'] = projection.planEnvelope.digest;
  const heading = element('div', 'task-authorization-heading');
  heading.append(
    element('h3', undefined, TASK_DRAWER_TITLE),
    element(
      'span',
      `state-term status-pill task-authorization-status task-authorization-status-${projection.state}`,
      projection.state === 'available' ? '待准备' : projection.state === 'prepared' ? '计划就绪' : '已记录授权 · 未派发',
    ),
  );
  card.append(
    heading,
    element('p', 'field-note', taskAuthorizationDispatchNote(projection.providerResolutionPlan?.providerProcessing ?? null)),
  );
  if (projection.state === 'available' || (projection.taskIntent !== null && projection.checkpoint === null)) {
    const form = element('section', 'form-row task-authorization-form');
    const label = element('label', undefined, '固定任务目标');
    label.htmlFor = 'j03-task-goal';
    const goal = element('input');
    goal.id = 'j03-task-goal';
    goal.value = J03_TASK_GOAL;
    goal.maxLength = J03_TASK_GOAL.length;
    goal.autocomplete = 'off';
    const actions = element('div', 'button-row task-authorization-actions');
    // §10: 准备任务授权计划 reads 准备任务, and its progress speaks TASK-040's words.
    const prepare = button('准备任务', 'primary', async () => {
      if (goal.value !== J03_TASK_GOAL) {
        goal.setAttribute('aria-invalid', 'true');
        setStatus('任务目标必须与本次固定目标完全一致。', 'error');
        return;
      }
      goal.removeAttribute('aria-invalid');
      prepare.disabled = true;
      cancel.hidden = false;
      setStatus(technicalWords('正在为任务保存修订版…', '正在准备任务…'), 'busy');
      try {
        const initial = await api.prepareTaskAuthorization({ goal: J03_TASK_GOAL });
        cancel.dataset['serviceJobId'] = initial.jobId;
        const completed = await awaitServiceJob(initial, (job) => {
          cancel.dataset['serviceJobId'] = job.jobId;
          setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy');
        });
        if (completed.state === 'cancelled') {
          prepare.disabled = false;
          cancel.hidden = true;
          setStatus('任务计划准备已取消；任务草稿与稿件编辑保持不变。', 'success');
          return;
        }
        if (completed.kind !== 'task-authorization-preparation' || completed.result === null ||
            !('runRecord' in completed.result)) throw new Error('任务准备未返回计划。');
        if (host.isConnected && completed.result.bookId === host.dataset['taskAuthorizationBookId']) {
          renderTaskAuthorization(host, completed.result);
          setStatus('任务计划已准备；可在任务计划里开始任务。', 'success');
          // S72 D4: the plan the preparation froze opens in the Task Drawer beside this card.
          openTaskPlan(completed.result.bookId, 'fixed-task', completed.result.taskIntent?.taskIntentId ?? null);
        }
      } catch (error) {
        prepare.disabled = false;
        cancel.hidden = true;
        setStatus(rendererErrorMessage(error, '无法准备任务。'), 'error');
      }
    });
    prepare.dataset['taskAuthorizationAction'] = 'prepare';
    const cancel = button('取消准备', 'quiet', async () => {
      const jobId = cancel.dataset['serviceJobId'];
      if (!jobId) return;
      cancel.disabled = true;
      try {
        await api.cancelServiceJob({ jobId });
      } catch (error) {
        cancel.disabled = false;
        setStatus(rendererErrorMessage(error, '无法取消任务计划准备。'), 'error');
      }
    });
    cancel.hidden = true;
    actions.append(prepare, cancel);
    form.append(label, goal, element('p', 'field-note', technicalWords('目标由当前 J-03 工作流固定；不会构造模型请求。', '目标已确定，本次不会调用模型。')), actions);
    card.append(form);
  } else {
    const checkpoint = projection.checkpoint!;
    // S72 D4: the plan itself lives in the Task Drawer; the card keeps one line naming it and the way to
    // it. What the plan reads, sends and will not do — the engineer's non-effects included, now in its
    // 查看技术详情 (§10) — is stated there. Since S74a (A5) the recording is the drawer bar's 开始任务 too, so
    // until the Task is recorded the card's one action reads 查看计划并开始.
    const summary = element('section', 'task-plan-summary');
    const open = taskPlanOpenButton('fixed-task', () => openTaskPlan(projection.bookId, 'fixed-task', projection.taskIntent!.taskIntentId),
      projection.actions.canAuthorize);
    open.dataset['taskAuthorizationAction'] = 'view-plan';
    summary.append(
      element('p', 'task-plan-summary-line', taskPlanSummaryLine(['固定任务', '全书', `任务输入修订版${technicalWords(` ${checkpoint.revisionLabel}`)}`, '不发送任何内容'])),
      open,
    );
    card.append(summary);
    const runRecord = projection.runRecord;
    if (runRecord) {
      const terminal = element('p', 'success-note task-authorization-terminal', runRecord.terminalLabel);
      terminal.dataset['taskAuthorizationTerminal'] = runRecord.state;
      terminal.dataset['runRecordId'] = runRecord.runRecordId;
      card.append(terminal);
      const actions = element('div', 'button-row task-authorization-actions');
      const boundaryHost = element('div');
      boundaryHost.setAttribute('aria-live', 'polite');
      const inspectBoundary = button(technicalWords('核对前台执行边界（不派发）', '核对执行边界 · 不派发'), 'secondary', async () => {
        inspectBoundary.disabled = true;
        setStatus('正在核对前台执行边界…', 'busy');
        try {
          const boundary = await api.inspectForegroundExecutionBoundary({ runRecordId: runRecord.runRecordId });
          if (host.isConnected && boundary.bookId === host.dataset['taskAuthorizationBookId'] &&
              boundary.runRecordId === runRecord.runRecordId) {
            renderForegroundExecutionBoundary(boundaryHost, boundary);
            setStatus(boundary.terminalLabel);
          }
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法核对前台执行边界。'), 'error');
        } finally {
          if (inspectBoundary.isConnected && !authorityInterrupted) inspectBoundary.disabled = false;
        }
      });
      inspectBoundary.dataset['taskAuthorizationAction'] = 'inspect-foreground-boundary';
      actions.append(inspectBoundary);
      card.append(actions, boundaryHost);
    }
  }
  host.replaceChildren(card);
}

function renderBookCreationForm(): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '书库'),
    element('h2', undefined, '新建图书'),
  );
  const form = element('section', 'form-row');
  const titleLabel = element('label', undefined, '书名');
  titleLabel.htmlFor = 'empty-book-title';
  const title = element('input');
  title.id = 'empty-book-title';
  title.maxLength = 180;
  const titleError = element('p', 'field-error');
  titleError.id = 'empty-book-title-error';
  titleError.hidden = true;
  const numberLabel = element('label', undefined, '内部编号 · 可选');
  numberLabel.htmlFor = 'empty-book-number';
  const internalNumber = element('input');
  internalNumber.id = 'empty-book-number';
  internalNumber.maxLength = 80;
  const numberError = element('p', 'field-error');
  numberError.id = 'empty-book-number-error';
  numberError.hidden = true;
  const clearFieldError = (input: HTMLInputElement, error: HTMLElement): void => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    error.hidden = true;
    error.textContent = '';
  };
  const showFieldError = (input: HTMLInputElement, error: HTMLElement, message: string): void => {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
    setStatus('');
    input.focus();
  };
  title.addEventListener('input', () => clearFieldError(title, titleError));
  internalNumber.addEventListener('input', () => clearFieldError(internalNumber, numberError));
  // 新建图书 (Issue #1410 item 20): one click prepares and commits the empty Book and opens its 工作概览; the service's
  // review digest still binds the commit to what was prepared, with no separate review page in between.
  const create = button('新建图书', 'primary', async () => {
    const follow = navigation.route();
    clearFieldError(title, titleError);
    clearFieldError(internalNumber, numberError);
    const normalizedTitle = title.value.normalize('NFC').replace(/\s+/g, ' ').trim();
    const normalizedNumber = internalNumber.value.normalize('NFC').trim();
    if (!normalizedTitle) {
      showFieldError(title, titleError, '请输入书名；书名不能只包含空白。');
      return;
    }
    if (normalizedNumber.length > 80 || /[\u0000-\u001f\u007f]/.test(normalizedNumber)) {
      showFieldError(internalNumber, numberError, '内部编号不得包含控制字符，且最多 80 个字符；也可以留空。');
      return;
    }
    create.disabled = true;
    setStatus('正在创建图书…', 'busy');
    try {
      const review = await api.prepareBookCreation({
        title: normalizedTitle,
        internalNumber: normalizedNumber || null,
      });
      const result = await api.commitBookCreation({ ...review.proposed, reviewDigest: review.reviewDigest });
      setStatus(result.completionLabel, 'success');
      if (follow.isCurrent()) navigation.present(() => renderBookOverview(result.overview));
    } catch (error) {
      create.disabled = false;
      if (hasErrorCode(error, 'TITLE_INVALID')) {
        showFieldError(title, titleError, rendererErrorMessage(error, '请修正书名。'));
      } else if (hasErrorCode(error, 'INTERNAL_NUMBER_INVALID') || hasErrorCode(error, 'INTERNAL_NUMBER_CONFLICT')) {
        showFieldError(internalNumber, numberError, rendererErrorMessage(error, '请修正内部编号。'));
      } else {
        setStatus(rendererErrorMessage(error, '图书未创建。'), 'error');
      }
    }
  });
  const actions = element('div', 'button-row');
  actions.append(create, button('取消', 'quiet', () => void initializeStartup()));
  form.append(titleLabel, title, titleError, numberLabel, internalNumber, numberError, actions);
  content.append(form);
  replaceScreen('book-create', content);
  const page = navigation.read(content);
  queueMicrotask(() => { if (page.isCurrent()) title.focus(); });
}

function renderDiagnostics(): void {
  if (!technicalLayerVisible) {
    renderSettingsHub();
    setStatus('该页在开发者模式下显示');
    return;
  }
  const content = panel();
  mountDiagnostics(content, api, () => void returnToLibrary());
  replaceScreen('diagnostics', content);
  setStatus(DIAGNOSTICS_OPENED);
}

/**
 * 设置 › 编辑工作 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-014): a house setting, bound to no Book, opened from the
 * landing or from 交付物's 录入… with that Book's entry open.
 */
/**
 * 书系 (Issue #63, plan slice S28a; SER-001): a stable global destination listing the house's Series, with 新建书系. Opening one
 * shows its 成员与共享范围; nothing here reads a member Book's text.
 */
async function renderSeriesList(focusSeriesId: string | null): Promise<void> {
  const content = panel();
  content.classList.add('series-list-screen');
  const host = element('div');
  const back = element('div', 'button-row');
  back.append(button('返回', 'quiet', () => void returnToOrigin()));
  content.append(element('h2', undefined, SERIES_TITLE), element('p', 'field-note series-lede', technicalWords(SERIES_LEDE, '将相关图书归入同一书系。')), host, back);
  replaceScreen('series-list', content);
  const page = navigation.read(content);
  setStatus(SERIES_STATUS.loading, 'busy');
  const surface = mountSeriesList({
    root: host,
    api: api,
    setStatus,
    errorMessage: rendererErrorMessage,
    openSeries: (seriesId) => void renderSeries(seriesId),
    focusSeriesId,
  });
  try {
    await surface.load();
    if (!page.isCurrent()) return;
    setStatus(SERIES_STATUS.opened);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, page)) return;
    setStatus(rendererErrorMessage(error, SERIES_STATUS.unavailable), 'error');
  }
}

/** One Series' 成员与共享范围 (SER-001 to SER-010): its members, 加入书系 and 移出书系 through the impact preview, and its records. */
async function renderSeries(seriesId: string): Promise<void> {
  const content = panel();
  content.classList.add('series-screen');
  content.dataset['seriesId'] = seriesId;
  const heading = element('h2', undefined, SERIES_TITLE);
  const note = element('blockquote', 'series-note');
  note.setAttribute('aria-label', '书系说明');
  const host = element('div');
  const back = element('div', 'button-row');
  back.append(button(SERIES_BACK_TO_LIST, 'quiet', () => void renderSeriesList(seriesId)));
  content.append(heading, note, host, back);
  replaceScreen('series', content);
  const page = navigation.read(content);
  setStatus(SERIES_STATUS.loading, 'busy');
  const surface = mountSeries({ root: host, seriesId, api: api, setStatus, errorMessage: rendererErrorMessage });
  try {
    const series = await surface.load();
    if (!page.isCurrent()) return;
    heading.textContent = `书系「${series.title}」`;
    note.textContent = series.note;
    note.hidden = series.note.length === 0;
    if (page.isCurrent()) setStatus(SERIES_STATUS.opened);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, page)) return;
    setStatus(rendererErrorMessage(error, SERIES_STATUS.unavailable), 'error');
  }
}

/**
 * A section of the current Book's groups, from the sidebar (Issue #934; IA-012): reuse the window's owned Book route so
 * section changes preserve its manuscript capabilities. Reassigning even the same Book deliberately revokes those in main.
 * A different route still goes through the window owner; 稿件 enters at the remembered position (RET-002), as 书库 does.
 * 待办汇总 opens its read-only Book aggregate; 工作概览 holds the 导入记录 the removed 历史与恢复 row once opened.
 */
async function openBookSection(book: ShellBookEntry, section: ShellBookSection): Promise<void> {
  const navigationRoute = navigation.begin();
  if (!navigationRoute.isCurrent()) return;
  const recoveryReturn = currentRecoveryReturn();
  setStatus(SHELL_LABELS.openingBook, 'busy');
  try {
    const openSection = async (route: ResolvedBookWorkbenchRoute): Promise<void> => {
      const navigationRoute = navigation.route();
      const { bookId, bookTitle } = route;
      if (section === 'manuscript') await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId, bookTitle }, recoveryReturn, navigationRoute);
      else if (section === 'derivatives') navigation.present(() => renderDerivativesWorkspace(bookId, bookTitle));
      else if (section === 'review') navigation.present(() => renderBookReview(bookId, bookTitle));
      else if (section === 'evaluation') navigation.present(() => renderBookEvaluation(bookId, bookTitle));
      else if (section === 'deliverables') navigation.present(() => renderBookDeliverables(bookId, bookTitle));
      else if (section === 'findings') navigation.present(() => renderBookFindings(bookId, bookTitle));
      else if (section === 'analysis') navigation.present(() => renderBookAnalysis(bookId, bookTitle));
      else if (section === 'sources') navigation.present(() => renderBookSources(bookId, bookTitle));
      else {
        const overview = await api.getBookOverview({ bookId, historyCursor: null });
        if (!navigationRoute.isCurrent()) return;
        navigation.present(() => renderBookOverview(overview, undefined, recoveryReturn));
      }
    };
    const ownedRoute = await api.getBookWorkbenchRoute();
    if (!navigationRoute.isCurrent()) return;
    if (ownedRoute?.kind === 'book' && ownedRoute.bookId === book.bookId) await openSection(ownedRoute);
    else await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, openSection, undefined, navigationRoute);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, SHELL_LABELS.bookUnavailable), 'error');
  }
}

/** The Book sections a 返回 from the Agent 工作区 goes back to, by the screen the editor left (Issue #90, slice 13a). */
const AGENT_WORKSPACE_RETURN_SECTIONS: Readonly<Record<string, ShellBookSection>> = Object.freeze({
  'book-overview': 'overview',
  imported: 'overview',
  'book-analysis': 'analysis',
  'book-review': 'review',
  'book-evaluation': 'evaluation',
  'book-deliverables': 'deliverables',
  'book-derivatives': 'derivatives',
  'book-findings': 'findings',
  'book-sources': 'sources',
});

/**
 * Where 返回 leaves the Agent 工作区 for (Issue #90, slice 13a; AGENT-002): the work the editor left, read before the workspace
 * replaces it — the manuscript where it was being read, or the Book section on screen; 工作概览 otherwise.
 */
function agentWorkspaceReturn(bookId: string, bookTitle: string): () => void {
  const state = screen.dataset['screen'] ?? '';
  const content = screen.firstElementChild as HTMLElement | null;
  const onScreen = content?.dataset['bookId'] ?? null;
  const restore = content !== null && onScreen === bookId ? agentWorkspaceReturns.get(content) : undefined;
  const reading = state === 'editor' && onScreen === bookId ? manuscriptOnScreen?.readingPlace() ?? null : null;
  const section = onScreen === bookId ? AGENT_WORKSPACE_RETURN_SECTIONS[state] ?? null : null;
  return () => void leaveThen(async () => {
    let current = navigation.route();
    try {
      if (reading !== null) {
        const opened = await api.getManuscriptWindowAt({
          manuscriptId: reading.manuscriptId, branchId: reading.branchId, target: { kind: 'block', blockId: reading.blockId },
        });
        if (!current.isCurrent()) return;
        await openEditorWindow(opened, bookTitle, undefined, undefined, undefined, undefined, current);
      } else if (restore !== undefined) {
        const restoring = restore();
        current = navigation.route();
        await restoring;
      } else if (state === 'editor' && onScreen === bookId) {
        await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId, bookTitle }, undefined, current);
      } else {
        await openBookSection({ bookId, title: bookTitle }, section ?? 'overview');
      }
    } catch (error) {
      if (!navigation.errorIsCurrent(error, current)) return;
      setStatus(rendererErrorMessage(error, SHELL_LABELS.bookUnavailable), 'error');
    }
  });
}

/**
 * The Agent 工作区 of a Book (Issue #90, wave 13 slice 13a; UI ADR 0015): a central screen of the AI7 shell, reached on the
 * window's own Book route — as a Book section is, so the window's manuscript capabilities stand — and never by itself.
 * Entering records nothing: no Active Work Object, Run, grant, permission or recent-section preference changes.
 */
async function openAgentWorkspace(bookId: string, back: () => void): Promise<void> {
  const navigationRoute = navigation.begin();
  if (!navigationRoute.isCurrent()) return;
  setStatus(SHELL_LABELS.openingBook, 'busy');
  try {
    const render = async (route: ResolvedBookWorkbenchRoute): Promise<void> => {
      if (route.kind !== 'book') return;
      const content = panel();
      content.dataset['bookId'] = route.bookId;
      // Mounted before it replaces the screen, so its 返回 is on screen when the screen's back command is bound to it.
      const surface = mountAgentWorkspace({
        root: content,
        bookId: route.bookId,
        bookTitle: route.bookTitle,
        api: api,
        setStatus,
        errorMessage: rendererErrorMessage,
        back,
        openMarks: (promotion) => void leaveThen(() => openAgentWorkspaceMarks(promotion, route.bookTitle)),
      });
      replaceScreen('agent-workspace', content);
      agentWorkspaceSurface = surface;
    };
    const ownedRoute = await api.getBookWorkbenchRoute();
    if (!navigationRoute.isCurrent()) return;
    if (ownedRoute?.kind === 'book' && ownedRoute.bookId === bookId) await render(ownedRoute);
    else await requestBookWorkbenchRoute({ kind: 'book', bookId }, render, undefined, navigationRoute);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, SHELL_LABELS.bookUnavailable), 'error');
  }
}

/** 在稿件中查看 after 提交为修改建议: the manuscript at the change set's paragraph, the first new 修改建议's card open. */
async function openAgentWorkspaceMarks(promotion: AgentWorkspacePromotionProjection, bookTitle: string): Promise<void> {
  const current = navigation.begin();
  try {
    const card = await api.getEditorialMarkCard({ manuscriptId: promotion.manuscriptId, branchId: promotion.branchId, markId: promotion.markIds[0]! });
    if (!current.isCurrent()) return;
    const opened = await api.getManuscriptWindowAt({
      manuscriptId: promotion.manuscriptId, branchId: promotion.branchId, target: { kind: 'block', blockId: card.blockId },
    });
    if (!current.isCurrent()) return;
    await openEditorWindow(opened, bookTitle, undefined, undefined, promotion.markIds[0], undefined, current);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, current)) return;
    setStatus(rendererErrorMessage(error, AGENT_WORKSPACE_WORDS.manuscriptFailed), 'error');
  }
}

// The review before an import lives in import-review.ts (Issue #1172); the shell lends it what it reaches.
const { listSection, reimportRangeLine, renderManuscriptReimportReview, renderReview, renderSourceImportReview, renderTargetChoice } = createImportReview({
  abandonAndContinue, appendRecoveryReturnAction, awaitServiceJob, hasErrorCode, identityFindingDisclosure, initializeStartup,
  instantValue, rendererErrorMessage, renderError, renderImported: (...args) => renderImported(...args), replaceScreen, setStatus, sourceCard, technicalDetails,
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function awaitServiceJob(
  initial: ServiceJobProjection,
  onProgress: (job: ServiceJobProjection) => void,
): Promise<ServiceJobProjection> {
  let job = initial;
  let previousReimportProgress = initial.progress.completed;
  const requireMonotonicReimportProgress = (next: ServiceJobProjection): void => {
    if (next.kind !== 'reimport-preparation' && next.kind !== 'reimport-resolution' && next.kind !== 'reimport-commit' &&
        next.kind !== 'task-authorization-preparation' && next.kind !== 'baseline-analysis-preparation' &&
        next.kind !== 'review-run-preparation' && next.kind !== 'initial-evaluation-preparation' && next.kind !== 'readers-report-preparation' &&
        next.kind !== 'evaluation-rewrite-preparation' && next.kind !== 'writing-preparation') return;
    if (!Number.isSafeInteger(next.progress.completed) || !Number.isSafeInteger(next.progress.total) ||
      next.progress.completed < previousReimportProgress || next.progress.completed > next.progress.total ||
      next.progress.total <= 0 ||
      (next.state === 'completed' && next.progress.completed !== next.progress.total)) {
      throw new Error('重新导入协作任务进度无效或发生倒退。');
    }
    previousReimportProgress = next.progress.completed;
  };
  requireMonotonicReimportProgress(job);
  onProgress(job);
  while (job.state === 'queued' || job.state === 'running') {
    await delay(25);
    job = await api.pollServiceJob({ jobId: job.jobId });
    requireMonotonicReimportProgress(job);
    onProgress(job);
  }
  if (job.state === 'failed') {
    const failure = job.failure ?? { code: 'SERVICE_JOB_FAILED', message: '后台业务操作未完成。' };
    throw Object.assign(new Error(failure.message), failure);
  }
  return job;
}

/**
 * An editor window, drawn as what it holds (Issue #415, S66): a Production Document's type and versions are read first,
 * whichever way the editor reached it — 解决冲突 → 返回, recovery, 待我处理 — so it is drawn as the document it is. The
 * caller awaits it: what it says once the window is on screen is said after the window is drawn, and a failed read
 * reaches the caller's own error handling. The editor moving on while the document is read keeps the screen they are on.
 */
async function openEditorWindow(
  initialWindow: ManuscriptWindowProjection,
  bookTitle: string,
  recoveryAttentionId?: string,
  entryNotice?: string,
  openMarkId?: string,
  reimport?: ManuscriptReimportCommitProjection,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<void> {
  await guardNavigationRead(navigationRoute, () => openEditorWindowNow(initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, reimport, navigationRoute));
}

async function openEditorWindowNow(
  initialWindow: ManuscriptWindowProjection,
  bookTitle: string,
  recoveryAttentionId?: string,
  entryNotice?: string,
  openMarkId?: string,
  reimport?: ManuscriptReimportCommitProjection,
  navigationRoute: NavigationCheckpoint = navigation.begin(),
): Promise<NavigationCheckpoint | undefined> {
  if (initialWindow.deliverable !== 'production-document') {
    navigation.present(() => renderEditorWindow(initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, reimport));
    return navigation.read(screen.firstElementChild as HTMLElement);
  }
  const showing = screen.firstElementChild;
  const context = await documentContextOf(api, initialWindow);
  if (!navigationRoute.isCurrent()) return;
  if (screen.firstElementChild !== showing) return;
  navigation.present(() => renderEditorWindow(initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, reimport, context));
  return navigation.read(screen.firstElementChild as HTMLElement);
}

function renderEditorWindow(
  initialWindow: ManuscriptWindowProjection,
  bookTitle: string,
  recoveryAttentionId?: string,
  entryNotice?: string,
  openMarkId?: string,
  reimport?: ManuscriptReimportCommitProjection,
  productionDocument?: ProductionDocumentContext,
): void {
  if (productionDocument === undefined && initialWindow.deliverable === 'production-document') {
    void openEditorWindow(initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, reimport)
      .catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法打开这份生产文档。'), 'error'));
    return;
  }
  mountManuscriptScreen({
    api: api, initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, productionDocument,
    reimportNotice: reimport === undefined ? undefined : reimportLandingSection(reimport),
    persistenceStatus, contextView: requiredElement('#context-view'), viewPreferences, preferences: shellPreferences,
    commandDispatcher, taskDrawer, interrupted: () => authorityInterrupted,
    attach: (content, surface) => {
      // A derivative document is the Book's 稿件 too (Issue #1403).
      replaceScreen('editor', content, { bookId: initialWindow.bookId, title: bookTitle, section: 'manuscript' });
      manuscriptOnScreen = surface;
      taskSurfaceRefresh = { writing: () => surface.refreshWriting() };
      leaveGuard = () => surface.settle();
      agentWorkspaceReturns.set(content, async () => {
        const current = navigation.begin();
        const opened = await api.getManuscriptWindow({ manuscriptId: initialWindow.manuscriptId, branchId: initialWindow.branchId, cursor: null });
        if (!current.isCurrent()) return;
        await openEditorWindow(opened, bookTitle, recoveryAttentionId, undefined, openMarkId, undefined, current);
      });
    },
    setContextActions: (...content) => shell.setContextActions(...content),
    setStatus, setCloseRisk, errorMessage: rendererErrorMessage, recentlyActivatedControl, awaitServiceJob,
    composerRangeOf, selectionTaskOffer, selectionProcedureOffer, prepareSelectionTask,
    renderEditorWindow, renderBookAnalysis, renderBookReview,
    renderBookDeliverables, renderProposalConflict, renderProposalWorkspace,
    returnToRecoveryComparison,
    openPrimaryManuscript: async (bookId, title) => { await renderBookManuscript(bookId, title); },
    openDerivativesWorkspace: renderDerivativesWorkspace,
    openProductionDocument,
    openLaunch: (request) => taskDrawer.openLaunch(request, () => null),
    openWritingPlan: (bookId, ref, note) => openTaskPlan(bookId, 'writing', ref, note),
  });
}

function renderError(error: unknown, retry: () => void): void {
  const content = panel();
  content.classList.add('error-panel');
  content.append(
    element('p', 'section-label', '操作未完成'),
    element('h2', undefined, '无法继续当前操作'),
    element('p', 'lede', rendererErrorMessage(error, '桌面操作未完成，请重试。')),
    button('重新开始', 'primary', retry),
  );
  replaceScreen('error', content);
  setStatus('操作未完成', 'error');
}

async function initializeStartup(navigationRoute: NavigationCheckpoint = navigation.begin()): Promise<void> {
  setStatus('正在核对本地恢复状态…', 'busy');
  try {
    const startup = await api.getStartup();
    if (!navigationRoute.isCurrent()) return;
    await renderApplicationStartup(startup, navigationRoute);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    renderError(error, () => void initializeStartup());
  }
}

const appearance = createAppearance(api);


const { renderDataAndStorage } = createDataStorage({
  setStatus, panel, element, button, rendererErrorMessage, initializeStartup, returnToOrigin, technicalDetails, replaceScreen,
});


const { renderKnowledgeBase, renderQualityLearning } = createKnowledgeBase({
  rememberReturn: (node, restore) => agentWorkspaceReturns.set(node, restore),
  setStatus, rendererErrorMessage, element, openWordSourceVersion, technicalDetails, panel, button, leaveThen, renderGlobalAgent, initializeStartup, returnToOrigin, replaceScreen, openFeedbackTarget, openLearningMaterialSource, requestBookWorkbenchRoute, renderBookDeliverables, renderBookEvaluation, renderBookAnalysis, renderBookReview,
});


const { renderModelServiceSettings } = createModelServiceSettings({
  element, button, setStatus, rendererErrorMessage, panel, initializeStartup, returnToOrigin, replaceScreen,
});

const { openGlobalAttention, renderGlobalAttention, openOverviewTask, openTaskNotification, openOverviewResult, renderTaskOverview, openGlobalAttentionItem, openGlobalAttentionTarget } = createGlobalPages({
  technicalDetails,
  get authorityInterrupted() { return authorityInterrupted; },
  set authorityInterrupted(value) { authorityInterrupted = value; },
  get leaveGuard() { return leaveGuard; },
  set leaveGuard(value) { leaveGuard = value; },
  setStatus: (...args) => setStatus(...args),
  persistenceStatus,
  rendererErrorMessage: (...args) => rendererErrorMessage(...args),
  api,
  panel: (...args) => panel(...args),
  globalAttentionReader,
  renderModelServiceSettings: (...args) => renderModelServiceSettings(...args),
  replaceScreen: (...args) => replaceScreen(...args),
  get globalAttentionSurface() { return globalAttentionSurface; },
  set globalAttentionSurface(value) { globalAttentionSurface = value; },
  get overviewDrawerBookId() { return overviewDrawerBookId; },
  set overviewDrawerBookId(value) { overviewDrawerBookId = value; },
  screen,
  taskDrawer,
  openTaskResult: (...args) => openTaskResult(...args),
  get taskOverviewSurface() { return taskOverviewSurface; },
  set taskOverviewSurface(value) { taskOverviewSurface = value; },
  settleScreen: (...args) => settleScreen(...args),
  taskNavigationBadge,
  requestBookWorkbenchRoute: (...args) => requestBookWorkbenchRoute(...args),
  jumpToSelectionText: (...args) => jumpToSelectionText(...args),
  renderBookReview: (...args) => renderBookReview(...args),
  renderBookManuscript: (...args) => renderBookManuscript(...args),
  button: (...args) => button(...args),
  element: (...args) => element(...args),
  openEditorWindow: (...args) => openEditorWindow(...args),
  renderProposalWorkspace: (...args) => renderProposalWorkspace(...args),
  returnToRecoveryComparison: (...args) => returnToRecoveryComparison(...args),
  renderProposalConflict: (...args) => renderProposalConflict(...args),
  renderStartupProjection: (...args) => renderStartupProjection(...args),
  renderBookAnalysis: (...args) => renderBookAnalysis(...args),
  openTaskPlan: (...args) => openTaskPlan(...args),
  renderBookEvaluation: (...args) => renderBookEvaluation(...args),
  renderBookDeliverables: (...args) => renderBookDeliverables(...args),
  renderKnowledgeBase: (...args) => renderKnowledgeBase(...args),
  renderQualityLearning: (...args) => renderQualityLearning(...args),
  renderGlobalAgent: (...args) => renderGlobalAgent(...args),
  renderBookOverview: (...args) => renderBookOverview(...args),
});


const { renderEvaluationCalibration, renderNotificationSettings, openUsageRun, renderUsage, renderKeyboardSettings, settingsPages, settingsNavigation, renderSettingsHub, renderHelp, renderAppearance } = createSettingsScreens({
  setStatus: (...args) => setStatus(...args),
  panel: (...args) => panel(...args),
  element: (...args) => element(...args),
  button: (...args) => button(...args),
  returnToOrigin: (...args) => returnToOrigin(...args),
  replaceScreen: (...args) => replaceScreen(...args),
  api,
  rendererErrorMessage: (...args) => rendererErrorMessage(...args),
  screen,
  renderRunReport: (...args) => renderRunReport(...args),
  applyKeyboardBindings: (...args) => applyKeyboardBindings(...args),
  get keyboardSettingsOff() { return keyboardSettingsOff; },
  set keyboardSettingsOff(value) { keyboardSettingsOff = value; },
  renderModelServiceSettings: (...args) => renderModelServiceSettings(...args),
  renderDataAndStorage: (...args) => renderDataAndStorage(...args),
  renderDiagnostics: (...args) => renderDiagnostics(...args),
  appearance,
  initializeStartup: (...args) => initializeStartup(...args),
  viewPreferences,
});


const { renderBookOverview } = createBookOverviewScreen({
  panel: (...args) => panel(...args),
  element: (...args) => element(...args),
  api,
  button: (...args) => button(...args),
  openBookSection: (...args) => openBookSection(...args),
  technicalDetails: (...args) => technicalDetails(...args),
  setStatus: (...args) => setStatus(...args),
  rendererErrorMessage: (...args) => rendererErrorMessage(...args),
  agentWorkspaceReturn: (...args) => agentWorkspaceReturn(...args),
  leaveThen: (...args) => leaveThen(...args),
  openAgentWorkspace: (...args) => openAgentWorkspace(...args),
  renderTaskAuthorization: (...args) => renderTaskAuthorization(...args),
  renderBookAnalysis: (...args) => renderBookAnalysis(...args),
  rendererErrorCode: (...args) => rendererErrorCode(...args),
  renderBookReview: (...args) => renderBookReview(...args),
  renderBookDeliverables: (...args) => renderBookDeliverables(...args),
  renderBookEvaluation: (...args) => renderBookEvaluation(...args),
  renderBookSources: (...args) => renderBookSources(...args),
  recordPresentation: (...args) => recordPresentation(...args),
  renderTargetChoice: (...args) => renderTargetChoice(...args),
  renderResolvedBookWorkbenchRoute: (...args) => renderResolvedBookWorkbenchRoute(...args),
  editorialRecordLabel: (...args) => editorialRecordLabel(...args),
  appendRecoveryReturnAction: (...args) => appendRecoveryReturnAction(...args),
  replaceScreen: (...args) => replaceScreen(...args),
  shell,
  renderBookWorkbenchChooser: (...args) => renderBookWorkbenchChooser(...args),
  get taskSurfaceRefresh() { return taskSurfaceRefresh; },
  set taskSurfaceRefresh(value) { taskSurfaceRefresh = value; },
  acknowledgeCompletionAfterPaint: (...args) => acknowledgeCompletionAfterPaint(...args),
  get authorityInterrupted() { return authorityInterrupted; },
  set authorityInterrupted(value) { authorityInterrupted = value; },
});


const { renderBookFilter, renderLanding, renderImported, reimportUnfollowedLine, reimportLandingSection, installDropHandlers } = createLibraryScreen({
  element: (...args) => element(...args),
  button: (...args) => button(...args),
  setStatus: (...args) => setStatus(...args),
  api,
  rendererErrorMessage: (...args) => rendererErrorMessage(...args),
  panel: (...args) => panel(...args),
  renderBookCreationForm: (...args) => renderBookCreationForm(...args),
  renderTargetChoice: (...args) => renderTargetChoice(...args),
  renderError: (...args) => renderError(...args),
  renderDataAndStorage: (...args) => renderDataAndStorage(...args),
  renderModelServiceSettings: (...args) => renderModelServiceSettings(...args),
  get authorityInterrupted() { return authorityInterrupted; },
  set authorityInterrupted(value) { authorityInterrupted = value; },
  leaveThen: (...args) => leaveThen(...args),
  renderHelp: (...args) => renderHelp(...args),
  bookCardOpen: (...args) => bookCardOpen(...args),
  requestBookWorkbenchRoute: (...args) => requestBookWorkbenchRoute(...args),
  bookCardAction: (...args) => bookCardAction(...args),
  bookIdentityDisclosure: (...args) => bookIdentityDisclosure(...args),
  returnToRecoveryComparison: (...args) => returnToRecoveryComparison(...args),
  appendRecoveryReturnAction: (...args) => appendRecoveryReturnAction(...args),
  replaceScreen: (...args) => replaceScreen(...args),
  screen,
  settleScreen: (...args) => settleScreen(...args),
  renderEditorWindow: (...args) => renderEditorWindow(...args),
  get statusRevision() { return statusRevision; },
  set statusRevision(value) { statusRevision = value; },
  acknowledgeCompletionAfterPaint: (...args) => acknowledgeCompletionAfterPaint(...args),
  renderBookOverview: (...args) => renderBookOverview(...args),
  recordPresentation: (...args) => recordPresentation(...args),
});
installDropHandlers();

async function initializeRenderer(): Promise<void> {
  const navigationRoute = navigation.begin();
  resetTechnicalLayer();
  initializeReducedMotion();
  await appearance.ready;
  try {
    const location = await api.getProductDataLocation();
    const scope = location.channel === 'source-checkout' ? (await api.getModelServiceSettings()).launchPolicy.operationalScope : null;
    initializeTechnicalLayer(location.channel, window.localStorage, scope);
    if (!navigationRoute.isCurrent()) return;
    const route = await api.getBookWorkbenchRoute();
    if (!navigationRoute.isCurrent()) return;
    if (route) {
      await renderResolvedBookWorkbenchRoute(route, undefined, navigationRoute);
      return;
    }
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    renderError(error, () => void initializeRenderer());
    return;
  }
  await initializeStartup();
}

new MutationObserver(() => {
  if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
  if (document.documentElement.dataset['ai7CloseState'] === 'blocked') {
    // A close request with at-risk input opens the protection surface itself (DUR-010).
    if (manuscriptOnScreen?.blockedClose() !== true) {
      setStatus('当前编辑尚未获得持久写入确认，请先保存成功后再关闭窗口。', 'error');
    }
    delete document.documentElement.dataset['ai7CloseState'];
  }
  if (document.documentElement.dataset['ai7BookWorkbenchRouteGeneration']) {
    delete document.documentElement.dataset['ai7BookWorkbenchRouteGeneration'];
    void renderOwnedBookWorkbenchRoute();
  }
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: [
    'data-ai7-service-state',
    'data-ai7-close-state',
    'data-ai7-book-workbench-route-generation',
  ],
});

new MutationObserver(() => collectTechnicalDisclosures(document.body)).observe(document.body, { childList: true, subtree: true });
setCloseRisk(false);
void initializeRenderer();
if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
