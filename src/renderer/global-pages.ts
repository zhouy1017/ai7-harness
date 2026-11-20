import { navigation, type NavigationCheckpoint } from './navigation-generation.js';

import { technicalLayerVisible, technicalDisclosure, technicalWords } from './technical-layer.js';

import type { BookTaskItemProjection, BookWorkbenchRoute, BookWorkOverviewProjection, GlobalAttentionItemProjection, GlobalAttentionProjection, GlobalAttentionTarget, ImportCommitProjection, ManuscriptReimportCommitProjection, ImportStartupProjection, ManuscriptWindowProjection, ResolvedBookWorkbenchRoute, TaskPlanKind } from '../shared/protocol.js';

import { NOTIFICATION_BOOK_LIST_LINE } from './notification-labels.js';
import { GLOBAL_ATTENTION_COUNTED_GROUPS } from '../shared/protocol.js';

import type { AnalysisFeedbackDimension } from '../shared/analysis-feedback.js';

import { mountGlobalAttention, type GlobalAttentionSurface } from './global-attention.js';

import { GLOBAL_ATTENTION_STATUS_LINES } from './global-attention-labels.js';

import { type ReviewFocus } from './review-workspace.js';

import { type ShellPlace } from './shell.js';

import { type AnalysisTabId } from './baseline-analysis-card.js';
import { type RecoveryReturnContext } from './import-review.js';
import { mountTaskOverview, type TaskOverviewSurface } from './tasks-overview.js';
import { taskOverviewApi } from './task-overview-api.js';
import { finishedResultRoute, type ResultEntrance } from './result-destination.js';
import type { RendererApi, TaskOverviewItemProjection } from '../shared/protocol.js';

interface Options {
  technicalDetails: (gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>) => HTMLElement;
  authorityInterrupted: boolean;
  leaveGuard: (() => Promise<boolean>) | null;
  setStatus: (message: string, tone?: "busy" | "success" | "error") => void;
  persistenceStatus: HTMLElement;
  rendererErrorMessage: (error: unknown, fallback: string) => string;
  api: RendererApi & import("../shared/preferences.js").PreferencesRendererApi & import("../shared/appearance.js").AppearanceRendererApi & import("../shared/preferences.js").NotificationsRendererApi;
  panel: () => HTMLElement;
  globalAttentionReader: import("./global-attention.js").GlobalAttentionReader;
  renderModelServiceSettings: (focus?: "search") => Promise<void>;
  replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  globalAttentionSurface: GlobalAttentionSurface | undefined;
  overviewDrawerBookId: string | null;
  screen: HTMLElement;
  taskDrawer: import("./task-drawer.js").TaskDrawerSurface;
  openTaskResult: (entry: BookTaskItemProjection, backToPanel: () => void, resultApi?: RendererApi) => void;
  taskOverviewSurface: TaskOverviewSurface | undefined;
  settleScreen: () => Promise<boolean>;
  taskNavigationBadge: HTMLSpanElement;
  requestBookWorkbenchRoute: (route: BookWorkbenchRoute, onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>, recoveryReturn?: RecoveryReturnContext, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  jumpToSelectionText: (bookId: string, selection: { readonly manuscriptId: string; readonly fromBlockId: string; readonly toBlockId: string; }) => Promise<boolean>;
  renderBookReview: (bookId: string, bookTitle: string, focus?: ReviewFocus | null, procedureId?: string | null) => void;
  renderBookManuscript: (bookId: string, bookTitle: string, route?: NavigationCheckpoint) => Promise<NavigationCheckpoint | undefined>;
  button: (label: string, className: "primary" | "secondary" | "quiet", action: () => void | Promise<void>) => HTMLButtonElement;
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  openEditorWindow: (initialWindow: ManuscriptWindowProjection, bookTitle: string, recoveryAttentionId?: string, entryNotice?: string, openMarkId?: string, reimport?: ManuscriptReimportCommitProjection, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  renderProposalWorkspace: (input: { manuscriptId: string; branchId: string; resultId: string | null; }, bookId: string, bookTitle: string) => Promise<void>;
  returnToRecoveryComparison: (attentionId: string, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  renderProposalConflict: (target: { bookId: string; manuscriptId: string; branchId: string; markId: string; onDocument: boolean; }, bookTitle: string) => void;
  renderStartupProjection: (startup: ImportStartupProjection, recoveryReturn?: RecoveryReturnContext, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  renderBookAnalysis: (bookId: string, bookTitle: string, target?: {readonly revisionId: string; readonly itemKey: string; readonly dimension: AnalysisFeedbackDimension;} | string, focus?: { tab: AnalysisTabId; gap?: number; }) => void;
  openTaskPlan: (bookId: string, kind: TaskPlanKind, ref: string | null, note?: string) => void;
  renderBookEvaluation: (bookId: string, bookTitle: string, focus?: { recordId: string; riskId: string; }, start?: boolean) => void;
  renderBookDeliverables: (bookId: string, bookTitle: string, openCase?: { caseId: string; publicationVersionId: string; }, focusPackageVersionId?: string) => void;
  renderKnowledgeBase: (tab?: import("./knowledge-base-labels.js").KnowledgeBaseTab | "home", tabFocused?: boolean, materialId?: string | null, current?: NavigationCheckpoint, notice?: string) => Promise<void>;
  renderQualityLearning: (tab?: import("./quality-learning-labels.js").QualityLearningTab, bookId?: string | null, tabFocused?: boolean, openMaterial?: { readonly bookId: string; readonly materialKey: string; } | null, returnToReview?: (() => void) | null, current?: NavigationCheckpoint, notice?: string) => Promise<void>;
  renderGlobalAgent: (dialogueId?: string) => Promise<void>;
  renderBookOverview: (overview: BookWorkOverviewProjection, completion?: Exclude<ImportCommitProjection, ManuscriptReimportCommitProjection>, recoveryReturn?: RecoveryReturnContext) => void;
}

export function createGlobalPages(state: Options) {
  const { technicalDetails, setStatus, persistenceStatus, rendererErrorMessage, api, panel, globalAttentionReader, renderModelServiceSettings, replaceScreen, screen, taskDrawer, openTaskResult, settleScreen, taskNavigationBadge, requestBookWorkbenchRoute, jumpToSelectionText, renderBookReview, renderBookManuscript, button, element, openEditorWindow, renderProposalWorkspace, returnToRecoveryComparison, renderProposalConflict, renderStartupProjection, renderBookAnalysis, openTaskPlan, renderBookEvaluation, renderBookDeliverables, renderKnowledgeBase, renderQualityLearning, renderGlobalAgent, renderBookOverview } = state;

/**
 * 待我处理 from the header (Issue #424): the screen opens in the library state — the window leaves the Book it
 * showed, as 返回图书列表 does — after the surface on screen has settled what it must first.
 */
async function openGlobalAttention(bookId?: string | null): Promise<void> {
  const navigationRoute = navigation.begin();
  if (state.authorityInterrupted) return;
  const guard = state.leaveGuard;
  if (guard !== null) {
    setStatus(GLOBAL_ATTENTION_STATUS_LINES.leaving, 'busy');
    try {
      const left = await guard();
      if (!navigationRoute.isCurrent()) return;
      if (!left) {
        // The surface's own refusal stands; only a silent one is named here.
        if (persistenceStatus.textContent === GLOBAL_ATTENTION_STATUS_LINES.leaving) setStatus(GLOBAL_ATTENTION_STATUS_LINES.stayed, 'error');
        return;
      }
    } catch (error) {
      if (!navigation.errorIsCurrent(error, navigationRoute)) return;
      setStatus(rendererErrorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.unavailable), 'error');
      return;
    }
  }
  try {
    await api.leaveBookWorkbench();
    if (!navigationRoute.isCurrent()) return;
    renderGlobalAttention(bookId);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, navigationRoute)) return;
    setStatus(rendererErrorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.unavailable), 'error');
  }
}

/** 待我处理's screen (editor-surfaces §8.1): the surface is `global-attention.ts`; this gives it its way out. */
function renderGlobalAttention(bookId?: string | null): void {
  const content = panel();
  content.classList.add('global-attention');
  // A notice for several events of one Book opens the list of that Book alone (NOTIF-008), its own count beside it.
  const bookOnly = (projection: GlobalAttentionProjection): GlobalAttentionProjection => {
    const groups = projection.groups.map((group) => {
      const items = group.items.filter((item) => item.book.bookId === bookId);
      return { ...group, items, total: items.length };
    });
    const actionableCount = groups.reduce((count, group) => count + (GLOBAL_ATTENTION_COUNTED_GROUPS.includes(group.key) ? group.total : 0), 0);
    return { ...projection, groups, actionableCount };
  };
  const surface = mountGlobalAttention({
    openTasks: () => renderTaskOverview(),
    startTask: () => { renderTaskOverview(); state.taskOverviewSurface?.showStart(); },
    root: content,
    reader: bookId === undefined ? globalAttentionReader : {
      ...globalAttentionReader,
      subscribe: (listener) => globalAttentionReader.subscribe((reading) =>
        listener(reading.kind === 'projection' ? { kind: 'projection', projection: bookOnly(reading.projection) } : reading)),
    },
    technicalDetails,
    setStatus,
    errorMessage: rendererErrorMessage,
    openNetworkProxySettings: () => renderModelServiceSettings(),
    open: openGlobalAttentionItem,
  });
  replaceScreen('global-attention', content);
  state.globalAttentionSurface = surface;
  surface.start();
  setStatus(bookId === undefined ? GLOBAL_ATTENTION_STATUS_LINES.opened : NOTIFICATION_BOOK_LIST_LINE);
}

/** Global cross-Book task queue (Issue #1328): the page is a projection; records remain Book-owned. */
function openOverviewTask(item: TaskOverviewItemProjection, view: 'plan' | 'run' | 'redo' = 'run'): void {
  state.overviewDrawerBookId = item.bookId;
  const finder = () => [...screen.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === item.itemId) ?? null;
  if (item.target.kind === 'task-intent-draft') taskDrawer.openDraft(item.target.bookId, item.target.draftId, finder);
  else if (item.target.kind === 'dialogue') taskDrawer.openDialogue(item.target.bookId, item.target.dialogueId, finder);
  else if (item.bookId && item.plan) taskDrawer.open({ bookId: item.bookId, ...item.plan }, finder, undefined, { view: view === 'redo' ? 'plan' : view, redo: view === 'redo', row: item });
}
/**
 * A task's notice. A finished task opens its result where the editor is (查看结果, #1528), without the global 任务 page; any other
 * task notice uses the overview; other attention notices retain their existing destination.
 */
async function openTaskNotification(itemId: string, target: GlobalAttentionTarget): Promise<void> {
  const navigationRoute = navigation.begin();
  if (!['analysis', 'analysis-plan', 'review', 'review-plan', 'task-plan', 'dialogue', 'task-intent-draft'].includes(target.kind)) {
    await openGlobalAttentionTarget(target); return;
  }
  const overview = await api.inspectTaskOverview();
  if (!navigationRoute.isCurrent()) return;
  const task = overview.groups.flatMap((group) => group.items).find((item) => item.itemId === itemId);
  if (!task) { await openGlobalAttentionTarget(target); return; }
  if (['completed', 'cancelled', 'stopped'].includes(task.state)) { await openResult(task); return; }
  renderTaskOverview(itemId);
  openOverviewTask(task);
}
/** The result in the floating window over the page on screen: the automatic window of #1510, and the fallback of 查看结果. */
async function openResultWindow(item: TaskOverviewItemProjection): Promise<void> {
  if (!item.bookId) return;
  const resultApi = taskOverviewApi(api, () => item.bookId);
  if (item.result || item.attention.object.kind === 'task') openTaskResult({ item: item.attention, result: item.result }, () => state.taskOverviewSurface?.focus(item.itemId), resultApi);
  else openOverviewTask(item, 'run');
}
/**
 * 查看结果 (#1528, plan #1516 §5): the result itself, in its Book, never by way of the global 任务 page, and in place while the
 * editor is already in that Book. Which page, and when the result window still stands in for it, is `finishedResultRoute`'s.
 */
async function openResult(item: TaskOverviewItemProjection, from: ResultEntrance = 'toast'): Promise<void> {
  const route = finishedResultRoute(item, from);
  if (route.via === 'page') await openGlobalAttentionTarget(route.target, route.analysisRevisionId);
  else if (route.via === 'window') await openResultWindow(item);
}
function renderTaskOverview(focusItemId?: string): void {
  taskDrawer.close(false);
  const content = panel(); content.classList.add('task-overview');
  const surface = mountTaskOverview({ root: content, api: api, setStatus, beforeStart: settleScreen,
    onChanged: () => globalAttentionReader.refresh(),
    onProjection: (projection) => { const count = projection.runningCount + projection.queuedCount + projection.actionableCount; taskNavigationBadge.textContent = String(count); taskNavigationBadge.hidden = count === 0; },
    openTarget: openOverviewTask,
    openBook: (bookId) => void requestBookWorkbenchRoute({ kind: 'book', bookId }),
    jumpToSelection: (item) => { if (item.bookId && item.selection) void jumpToSelectionText(item.bookId, item.selection); },
    openResult: (item) => void openResult(item, 'overview'), closeDrawer: () => taskDrawer.close(true),
    configure: (bookId, kind) => void requestBookWorkbenchRoute({ kind: 'book', bookId }, async (route) => {
      const current = navigation.route();
      if (kind === 'review') renderBookReview(bookId, route.bookTitle);
      // 写作 lives on 稿件 (Issue #1403).
      else { const shown = await renderBookManuscript(bookId, route.bookTitle, current); if (!shown?.isCurrent()) return; }
      const back = button('返回任务总览', 'quiet', () => renderTaskOverview()); content.append(back); screen.firstElementChild?.append(back);
    }),
  });
  replaceScreen('task-overview', content); state.taskOverviewSurface = surface;
  if (focusItemId) { const page = navigation.read(content); surface.focus(focusItemId); window.setTimeout(() => { if (page.isCurrent()) surface.focus(focusItemId); }, 300); }
}

/**
 * An item opens its own record in this window (V2-UX-ATTN-007, D-006): the import or manuscript recovery the
 * startup would show, 稿件冲突 of the conflicted suggestion, ②A with its Run, ②A with the plan in the Task Drawer where 重新确认计划 is, or ②B with
 * the Review Run open. A Book another window already shows is shown there, as 书库 does. Opening decides
 * nothing; a Recovery Attention State is claimed for this window only while no other window holds it.
 */
async function openGlobalAttentionItem(item: GlobalAttentionItemProjection): Promise<void> {
  const navigationRoute = navigation.begin();
  if (item.nextStep === 'open-network-proxy') {
    await renderModelServiceSettings();
    return;
  }
  if (['analysis', 'analysis-plan', 'review', 'review-plan', 'task-plan', 'dialogue', 'task-intent-draft'].includes(item.target.kind)) {
    const tasks = await api.inspectTaskOverview();
    if (!navigationRoute.isCurrent()) return;
    const task = tasks.groups.flatMap((group) => group.items).find((entry) => entry.itemId === item.itemId);
    if (task) { if (task.state === 'completed') await openResult(task, 'attention'); else openOverviewTask(task); return; }
  }
  await openGlobalAttentionTarget(item.target);
}

/** One record, opened in this window — 待我处理's items and the 任务 panel's cards (Issue #423, S77a) alike. */
async function openGlobalAttentionTarget(target: GlobalAttentionTarget, analysisRevisionId?: string): Promise<void> {
  navigation.begin();
  switch (target.kind) {
    case 'apply-receipt':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        const navigationRoute = navigation.route();
        await api.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null });
        if (!navigationRoute.isCurrent()) return;
        const receipt = await api.inspectApplyReceipt({ manuscriptId: target.manuscriptId, branchId: target.branchId, clientEffectId: target.clientEffectId, recovery: 'settled' });
        if (!navigationRoute.isCurrent()) return;
        const labels = { applied: '已接受', 'not-applied': '未写入稿件', confirming: '正在确认修改是否生效', unresolved: '修改是否生效待确认' } as const;
        const content = panel(); const heading = element('h2', undefined, labels[receipt.state]); const reason = element('p', undefined, receipt.reason);
        heading.dataset['applyReceiptState'] = receipt.state; content.append(heading, reason);
        // The raw receipt is diagnostics only (Issue #1431 item 103), gated like the proposal workspace's.
        const details = element('details'); const full = element('pre', undefined, JSON.stringify(receipt, null, 2)); details.append(element('summary', undefined, technicalWords('查看完整凭据')), full);
        if (technicalLayerVisible) content.append(technicalDisclosure(details));
        // EREC-005: the editor's re-check reads the authoritative records by the same Effect identity; it dispatches nothing.
        if (receipt.state === 'unresolved') {
          const recheck = button('重新核对修改结果', 'primary', async () => {
            const next = await api.inspectApplyReceipt({ manuscriptId: target.manuscriptId, branchId: target.branchId, clientEffectId: target.clientEffectId, recovery: 'recheck' });
            heading.textContent = labels[next.state]; heading.dataset['applyReceiptState'] = next.state; reason.textContent = next.reason; full.textContent = JSON.stringify(next, null, 2);
            if (next.state !== 'unresolved') recheck.remove();
          });
          content.append(recheck);
        }
        content.append(button('在稿件中查看', 'secondary', async () => { const current = navigation.begin(); const opened = await api.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null }); if (current.isCurrent()) await openEditorWindow(opened, route.bookTitle); }), button('返回修改建议', 'secondary', () => renderProposalWorkspace({ manuscriptId: target.manuscriptId, branchId: target.branchId, resultId: null }, target.bookId, route.bookTitle)));
        replaceScreen('apply-receipt', content, { bookId: target.bookId, title: route.bookTitle, section: 'review' });
      });
      return;
    case 'manuscript-recovery':
      await returnToRecoveryComparison(target.attentionId);
      return;
    // 解决冲突… (Issue #57): 稿件冲突 of that suggestion, whose 返回稿件 opens the manuscript at its paragraph. The
    // workspace reads and writes through this window's hold on the manuscript, which reading it grants — as opening
    // the manuscript first does on the way there from its card.
    case 'manuscript-conflict':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        const navigationRoute = navigation.route();
        const opened = await api.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null });
        if (!navigationRoute.isCurrent()) return;
        renderProposalConflict({ bookId: target.bookId, manuscriptId: target.manuscriptId, branchId: target.branchId, markId: target.markId, onDocument: opened.deliverable === 'production-document' }, route.bookTitle);
      });
      return;
    case 'import-recovery': {
      const navigationRoute = navigation.begin();
      const startup = await api.getImportStartup();
      if (!navigationRoute.isCurrent()) return;
      await renderStartupProjection(startup);
      return;
    }
    case 'analysis':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => renderBookAnalysis(route.bookId, route.bookTitle, analysisRevisionId));
      return;
    case 'analysis-plan':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        renderBookAnalysis(route.bookId, route.bookTitle);
        openTaskPlan(route.bookId, 'baseline-analysis', target.taskIntentId);
      });
      return;
    case 'review':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) =>
        renderBookReview(route.bookId, route.bookTitle, { reviewRunId: target.reviewRunId, findingId: null }));
      return;
    // A prepared Review Run's plan (Issue #423, S77a): ②B with the plan in the Task Drawer, whose bar starts it.
    case 'review-plan':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        renderBookReview(route.bookId, route.bookTitle, { reviewRunId: target.reviewRunId, findingId: null });
        openTaskPlan(route.bookId, 'review-run', target.reviewRunId);
      });
      return;
    // 结果待确认 a completed Run left (Issue #757): the kind's own surface, with its plan in the Task Drawer, where the list is and
    // 保留为缺口 is recorded.
    case 'task-plan':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        const current = navigation.route();
        switch (target.taskKind) {
          case 'review-run':
            renderBookReview(route.bookId, route.bookTitle, target.ref === null ? null : { reviewRunId: target.ref, findingId: null });
            break;
          case 'initial-evaluation':
          case 'readers-report':
          case 'evaluation-rewrite':
            renderBookEvaluation(route.bookId, route.bookTitle);
            break;
          case 'writing': {
            const shown = await renderBookManuscript(route.bookId, route.bookTitle, current);
            if (!shown?.isCurrent()) return;
            break;
          }
          default:
            renderBookAnalysis(route.bookId, route.bookTitle);
        }
        openTaskPlan(route.bookId, target.taskKind, target.ref);
      });
      return;
    // 维护事项待处理 (Issue #426, S68b): 交付物, with the case open on its 发稿版本 where its next step is.
    case 'maintenance':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) =>
        renderBookDeliverables(route.bookId, route.bookTitle, { caseId: target.caseId, publicationVersionId: target.publicationVersionId }));
      return;
    // A 资料库 item waiting for a decision (Issue #427, S79c): 知识库 › 资料库, with the decision it waits for in focus. 知识库 is
    // no Book's, so no Book route is asked for.
    case 'library-material':
      await renderKnowledgeBase('library', false, target.materialId);
      return;
    case 'learning-materials':
      await renderQualityLearning('learning', target.bookId);
      return;
    // A dialogue (Issue #52, S17a): the Book's 工作概览 with the dialogue in the foreground beside it.
    case 'global-agent-dialogue':
      await renderGlobalAgent(target.dialogueId);
      return;
    case 'dialogue':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        const navigationRoute = navigation.route();
        const overview = await api.getBookOverview({ bookId: route.bookId, historyCursor: null });
        if (!navigationRoute.isCurrent()) return;
        navigation.present(() => renderBookOverview(overview));
        taskDrawer.openDialogue(route.bookId, target.dialogueId, () => null);
      });
      return;
    // A Task Intent Draft (Issue #423, slice 7a; TASK-006): its own Book's 工作概览, with the draft in the composer beside it.
    case 'task-intent-draft':
      await requestBookWorkbenchRoute({ kind: 'book', bookId: target.bookId }, async (route) => {
        const navigationRoute = navigation.route();
        const overview = await api.getBookOverview({ bookId: route.bookId, historyCursor: null });
        if (!navigationRoute.isCurrent()) return;
        navigation.present(() => renderBookOverview(overview));
        taskDrawer.openDraft(route.bookId, target.draftId, () => null);
      });
      return;
  }
}

return { openGlobalAttention, renderGlobalAttention, openOverviewTask, openTaskNotification, openResult, openResultWindow, renderTaskOverview, openGlobalAttentionItem, openGlobalAttentionTarget };
}
