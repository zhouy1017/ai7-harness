import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';
import { createSaveMenu } from './save-menu.js';
import { SAVE_MENU_WORDS } from './save-menu-labels.js';
import { mountParagraphAnalysis } from './paragraph-analysis.js';
import { PARAGRAPH_ANALYSIS_WORDS } from './paragraph-analysis-labels.js';
import type { ParagraphAnalysisProjection } from '../shared/protocol.js';
import { consumeReturnPlace, preserveReturnPlace, readReturnPlace, type ReadingPlace } from './reading-return.js';
import type {
  BookWorkOverviewProjection,
  ProposeSeriesKnowledgeInput,
  AskAboutSelectionInput,
  PolishSelectionInput,
  DialogueProjection,
  ManuscriptReimportCommitProjection,
  ManuscriptWindowProjection,
  OutlineProjection,
  ReplacementPreviewProjection,
  SearchResultsProjection,
  ServiceWireJobProjection as ServiceJobProjection,
} from '../shared/protocol.js';
import { MAX_REPLACEMENT_EXCLUSIONS, MILESTONE_PURPOSE_KINDS, MILESTONE_PURPOSE_LABELS, type MilestonePurposeKind } from '../shared/protocol.js';
import { SOURCES_ENTRY_LABEL, SOURCES_STATUS } from './research-evidence-labels.js';
import { shortcutHint } from './commands.js';
import { EVALUATION_STATUS, EVALUATION_TITLE } from './evaluation-labels.js';
import { RETURN_CHIP_TITLE, returnChipArrived, returnChipLabel, returnChipPlace } from './task-panel-labels.js';
import {
  DOCUMENT_ACTION_LABELS,
  DOCUMENT_CHANGED_SINCE_VERSION,
  DOCUMENT_CURRENT_VERSION,
  DOCUMENT_STATUS_LINES,
  DOCUMENT_SURFACE_LABEL,
  documentVersionSavedLine,
} from './production-document-labels.js';
import { documentStanding, renderDocumentLens, type ProductionDocumentContext } from './production-document-lens.js';
import {
  DELIVERABLES_ENTRY_LABEL,
  DELIVERABLES_STATUS_LINES,
  MILESTONE_FORM_WORDS,
  MILESTONE_PURPOSE_NOTE,
  milestoneFormBlockers,
  milestoneSaveReason,
} from './deliverables-labels.js';
import { mountBoundedEditor, type BoundedEditor, type EditorContinuity } from './editor.js';
import { focusMode, mountEditorModes, type EditorModes } from './editor-modes.js';
import { mountProtectionSurface, type ProtectionSurface } from './editor-protection.js';
import { PROTECTION_CLOSE_BLOCKED } from './editor-protection-labels.js';
import { type ViewPreferences, mountRegionSeparator } from './layout.js';
import { type SelectionProcedureEntry, type SelectionTaskChoice, type SelectionTaskChoices, SELECTION_TASK_PICK_RANGE } from './selection-task-labels.js';
import { marksRefreshStep } from './marks-refresh.js';
import { mountEditorialMarks, type EditorialMarksSurface, type SelectionSpanReading } from './editorial-marks.js';
import type { ComposerRange } from './task-panel.js';
import { mountPositionRail, type PositionRail } from './position-rail.js';
import type { ReviewFocus } from './review-workspace.js';
import type { mountTaskDrawer } from './task-drawer.js';
import { REVIEW_ENTRY_LABEL, REVIEW_WORK_GROUP_LABEL } from './review-labels.js';
import type { ShellPreferences } from './shell.js';
import type { RendererApi } from '../shared/protocol.js';
import type { CommandDispatcher } from './commands.js';

export interface ManuscriptScreen {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readingPlace(): ReadingPlace | null;
  /**
   * Move to that paragraph, leaving 回到<位置>: `true` once there, `false` when the move was refused (busy, or a return place
   * that could not be kept). The window at the paragraph is read before any return place is kept (Issue #423 review, P2-1), so
   * a paragraph that is gone throws — `WINDOW_NOT_FOUND` — and leaves no chip.
   */
  jump(target: { blockId: string; markId: string | null }): Promise<boolean>;
  /**
   * Bring the marks made meanwhile onto the window on screen (Issue #423 review, P2-6, P2-7): `true` once they are there, `false`
   * when the editor is busy, typing or has something open over the text, so the caller asks again later.
   */
  refreshMarks(): Promise<boolean>;
  /** 再选一段加入 (Issue #423, slice 7a): the words selected now as an exact span, or why there are none. */
  selectionSpan(): Promise<SelectionSpanReading | string>;
  /** 按现成工序准备…: the house's 工序 on those words, in the composer beside their paragraph. */
  composeProcedures(span: { readonly blockId: string; readonly fromGrapheme: number; readonly toGrapheme: number }): void;
  settle(): Promise<boolean>;
  isComposing(): boolean;
  closeSupportingPanel(): void;
  followReviewMarks(bookId: string, reviewRunId: string | undefined): void;
  interrupt(): void;
  blockedClose(): boolean;
  destroy(): void;
}

interface ManuscriptScreenOptions {
  api: RendererApi;
  initialWindow: ManuscriptWindowProjection;
  bookTitle: string;
  recoveryAttentionId?: string | undefined;
  entryNotice?: string | undefined;
  openMarkId?: string | undefined;
  productionDocument?: ProductionDocumentContext | undefined;
  reimportNotice?: HTMLElement | undefined;
  persistenceStatus: HTMLElement;
  contextView: HTMLElement;
  viewPreferences: ViewPreferences;
  preferences: Pick<ShellPreferences, 'current' | 'viewAnalysis'>;
  commandDispatcher: CommandDispatcher;
  taskDrawer: ReturnType<typeof mountTaskDrawer>;
  interrupted(): boolean;
  attach(content: HTMLElement, surface: ManuscriptScreen): void;
  setContextActions(content: HTMLElement): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  setCloseRisk(risk: boolean): void;
  errorMessage(error: unknown, fallback: string): string;
  recentlyActivatedControl(): HTMLElement | null;
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  composerRangeOf(reading: SelectionSpanReading): ComposerRange;
  selectionTaskOffer(): Promise<SelectionTaskChoices>;
  selectionProcedureOffer(): Promise<SelectionProcedureEntry[]>;
  prepareSelectionTask(bookId: string, choice: SelectionTaskChoice, anchor: { readonly blockId: string }, chosenApart: ReadonlyArray<string>, returnFocus: () => HTMLElement | null): Promise<boolean>;
  renderEditorWindow(initialWindow: ManuscriptWindowProjection, bookTitle: string, recoveryAttentionId?: string, entryNotice?: string, openMarkId?: string, reimport?: ManuscriptReimportCommitProjection, productionDocument?: ProductionDocumentContext): void;
  renderBookOverview(overview: BookWorkOverviewProjection): void;
  renderBookAnalysis(bookId: string, bookTitle: string, revisionId?: string, focus?: { tab: 'entities' | 'events' | 'relationships' | 'settings' }): void;
  renderBookSources(bookId: string, bookTitle: string): void;
  renderBookReview(bookId: string, bookTitle: string, focus: ReviewFocus | null): void;
  renderBookDeliverables(bookId: string, bookTitle: string): void;
  renderBookEvaluation(bookId: string, bookTitle: string): void;
  renderBookFindings(bookId: string, bookTitle: string): void;
  renderProposalConflict(target: { bookId: string; manuscriptId: string; branchId: string; markId: string }, bookTitle: string): void;
  renderProposalWorkspace(input: { manuscriptId: string; branchId: string; resultId: string | null }, bookId: string, bookTitle: string): Promise<void>;
  returnToRecoveryComparison(attentionId: string): Promise<void>;
}

/** A Production Document's type and versions, read for a window that holds it (Issue #415, S66). */
export async function documentContextOf(api: RendererApi, window_: ManuscriptWindowProjection): Promise<ProductionDocumentContext> {
  const documents = await api.inspectProductionDocuments();
  const type = documents.types.find((entry) => entry.document?.documentId === window_.manuscriptId);
  if (documents.bookId === window_.bookId && type !== undefined && type.document !== null) {
    return { typeId: type.typeId, typeLabel: type.label, document: type.document };
  }
  // A 审稿意见 draft (Issue #429, S81c) is no card of 交付物: 评估 names it, and it is drawn exactly as a document is.
  const draft = await readersReportDraftOf(api, window_.manuscriptId);
  if (draft === null) throw new Error('这份生产文档已不在这本书的交付物中。');
  return draft;
}

/** A 审稿意见 draft of the route's Book, as 评估 reads it, by its document identity; `null` for any other. */
async function readersReportDraftOf(api: RendererApi, documentId: string): Promise<ProductionDocumentContext | null> {
  const page = await api.inspectEvaluation({ recordId: null });
  const draft = page.readersReport.templates.find((entry) => entry.draft?.document.documentId === documentId)?.draft ?? null;
  return draft === null ? null : { typeId: draft.typeId, typeLabel: draft.typeLabel, document: draft.document };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => void action());
  return node;
}

/**
 * Put plain text on the clipboard (Issue #951, 复制受影响内容): the document's copy command over a detached field, else the
 * window's own copy through main. The page holds no clipboard permission, so `navigator.clipboard` is not used.
 */
async function copyPlainText(api: RendererApi, text: string): Promise<void> {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.className = 'clipboard-carrier';
  field.setAttribute('aria-hidden', 'true');
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    if (!document.execCommand('copy')) await api.runEditorClipboardCommand({ command: 'copy' });
  } finally {
    field.remove();
    returnFocus?.focus({ preventScroll: true });
  }
}

/** How long the entry notice stays before it removes itself (V2-UX-COPY-015). */
const ENTRY_NOTICE_MS = 6_000;

function panel(): HTMLElement { return element('section', 'panel'); }

/** The Manuscript and Production Document screen owns all mutable editor coordination until destruction. */
export function mountManuscriptScreen(options: ManuscriptScreenOptions): void {
  const { api, initialWindow, bookTitle, recoveryAttentionId, entryNotice, openMarkId, productionDocument,
    persistenceStatus, viewPreferences, preferences, commandDispatcher, taskDrawer, setCloseRisk,
    recentlyActivatedControl, awaitServiceJob, composerRangeOf, selectionTaskOffer, selectionProcedureOffer,
    prepareSelectionTask, renderEditorWindow, renderBookOverview, renderBookAnalysis,
    renderBookSources, renderBookReview, renderBookDeliverables, renderBookEvaluation, renderBookFindings,
    renderProposalConflict, renderProposalWorkspace, returnToRecoveryComparison } = options;
  const rendererErrorMessage = options.errorMessage;
  const entryNoticeTimers = new Set<number>();
  /**
   * V2-UX-COPY-015's transient floating notice: it floats over the surface rather than taking a row in
   * it, it disappears on its own without any editor action, and it settles nothing — removing it reads
   * nothing and writes nothing, so an editor who never looks at it loses no decision. It is announced
   * politely rather than asserted, so a screen reader hears it without being interrupted.
   */
  function showEntryNotice(host: HTMLElement, message: string): void {
    if (destroyed) return;
    const notice = element('p', 'entry-notice', message);
    notice.setAttribute('role', 'status');
    notice.dataset['entryNotice'] = 'visible';
    host.append(notice);
    const timer = window.setTimeout(() => { notice.remove(); entryNoticeTimers.delete(timer); }, ENTRY_NOTICE_MS);
    entryNoticeTimers.add(timer);
  }

  let destroyed = false;
  let editor: BoundedEditor | undefined;
  let editorialMarks: EditorialMarksSurface | undefined;
  let manuscriptRail: PositionRail | undefined;
  let editorModes: EditorModes | undefined;
  let protectionSurface: ProtectionSurface | undefined;
  let supportingSeparator: { destroy(): void } | undefined;
  let paragraphSelectionOff: (() => void) | undefined;
  let editorCommandsOff: (() => void) | undefined;
  // What destroy() ends is declared before the shell attaches this screen, so a mount that throws part way is still destroyed.
  let milestonePersistenceTimer: number | undefined;
  let milestonePersistenceRead = 0;
  let returnRequest = 0;
  let railRefreshTimer: number | undefined;
  // A departed screen no longer speaks on the shared status line. The window's close risk still follows its writes (DUR-010).
  const setStatus: ManuscriptScreenOptions['setStatus'] = (message, tone) => {
    if (!destroyed) options.setStatus(message, tone);
  };
  /**
   * A Review Run of the Book whose manuscript is on screen was started from the drawer (Issue #423 review, P2-6, P3-2): that Run —
   * by its identity — is followed while it runs, read in the projection's light form (no findings), more slowly the longer it
   * takes; once it stops, its marks are brought onto the window on screen, as soon as the editor is not in the middle of something.
   * A plan only edited or prepared is not followed. One follower at a time; leaving the manuscript ends it, and a Run still running
   * after two hours is left with a line saying where its marks will be.
   */
  let reviewMarksFollower = 0;
  let reviewMarksTimer: number | undefined;
  const REVIEW_MARKS_FOLLOW_LIMIT_MS = 2 * 60 * 60_000;
  /** A 审阅 followed for its marks that runs past the follower's limit (review P3-2): where its marks will be. */
  const REVIEW_MARKS_FOLLOW_STOPPED = '审阅仍在进行；完成后它标出的发现会在稿件里，重新打开稿件即可看到。';

  const content = panel();
  content.classList.add('editor-shell');
  // The manuscript is now a Book's entry surface, so it says which Book it belongs to exactly as the
  // overview does — a window is identified by the Book it holds, not by the surface it happens to show.
  content.dataset['bookId'] = initialWindow.bookId;
  const isDocument = productionDocument !== undefined;
  if (productionDocument !== undefined) {
    content.dataset['deliverable'] = 'production-document';
    content.dataset['documentId'] = productionDocument.document.documentId;
    content.dataset['documentTypeId'] = productionDocument.typeId;
  }
  const toolbar = element('header', 'editor-toolbar');
  const title = element('div');
  // A document names its version as its own ledger numbers it (`版本 N`), never the block store's revision label — the
  // version its text stands on now, so an edit says the text moved past it as soon as it is written.
  const versionOf = (windowNow: ManuscriptWindowProjection): string | undefined =>
    productionDocument === undefined ? undefined : documentStanding(productionDocument.document, windowNow.workingDigest).current?.label;
  const revisionWords = (windowNow: ManuscriptWindowProjection): string => {
    if (!isDocument) return `当前修订版 ${windowNow.revisionLabel}`;
    const label = versionOf(windowNow);
    return label === undefined ? DOCUMENT_CHANGED_SINCE_VERSION : `${DOCUMENT_CURRENT_VERSION} ${label}`;
  };
  title.append(
    element('p', 'section-label', isDocument ? `${bookTitle} · ${DOCUMENT_SURFACE_LABEL}` : `${bookTitle} · 主分支`),
    element('h2', undefined, productionDocument !== undefined
      ? `${productionDocument.typeLabel} · ${versionOf(initialWindow) ?? productionDocument.document.versions[0]?.label ?? ''}`
      : `稿件修订版 ${initialWindow.revisionLabel}`),
  );
  const meta = element('div', 'editor-meta');
  const position = element('span', undefined, initialWindow.position.label);
  const revision = element('span', undefined, revisionWords(initialWindow));
  const journal = element('span', undefined, `修订日志序号 ${initialWindow.journalSequence}`);
  journal.dataset['editorTechnical'] = 'true';
  const recoveredState = element('strong', 'recovered-state-marker', '当前为恢复的工作状态');
  recoveredState.hidden = initialWindow.recoveredStateReview === null;
  const journalDetails = element('details', 'editor-technical-details');
  journalDetails.dataset['editorTechnicalDisclosure'] = 'journal';
  journalDetails.append(element('summary', undefined, '查看技术详情'), journal);
  meta.append(position, revision, journalDetails, recoveredState);
  // 回到<位置> (Issue #423, S77a; TASK-045): the way back a jump left, in the context header until it is used.
  const chipHost = element('div', 'return-chip-host');
  chipHost.hidden = true;
  title.append(meta, chipHost);
  const save = button('保存当前编辑', 'primary', () => editor?.flush());
  save.disabled = true;
  // The chord comes from the one label source and follows a remap (KEY-011); 保存 keeps its chord, the words are the window's own.
  save.dataset['shortcutCommand'] = 'edit.save';
  save.title = shortcutHint('edit.save') ?? '';
  const undo = button('撤销', 'quiet', () => void runHistory('undo'));
  const redo = button('重做', 'quiet', () => void runHistory('redo'));
  const retryAuthoritativeRefreshButton = button('重试权威刷新', 'quiet', () => void retryAuthoritativeRefresh());
  retryAuthoritativeRefreshButton.hidden = true;
  const backToOverview = button('返回图书工作概览', 'secondary', async () => {
    backToOverview.disabled = true;
    setStatus('正在保存并返回图书工作概览…', 'busy');
    try {
      if (!(await settleLocalEdit())) {
        backToOverview.disabled = false;
        return;
      }
      // Leaving the manuscript is the last moment the caret is still where the editor left it, so the
      // position is taken here, and taken before the overview is read, so the 上次位置 the overview
      // states is the one the editor just left rather than the one before it (V2-UX-RET-002).
      await rememberEntryPosition();
      const overview = await api.getBookOverview({ bookId: currentWindow.bookId, historyCursor: null });
      if (destroyed) return;
      renderBookOverview(overview);
    } catch (error) {
      backToOverview.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回图书工作概览。'), 'error');
    }
  });
  const openAnalysis = button('分析', 'secondary', async () => {
    openAnalysis.disabled = true;
    setStatus('正在保存并打开分析…', 'busy');
    try {
      if (!(await settleLocalEdit())) {
        openAnalysis.disabled = false;
        return;
      }
      // Leaving for 分析 is leaving the manuscript, so the position is taken exactly as it is for 工作概览.
      await rememberEntryPosition();
      if (destroyed) return;
      renderBookAnalysis(currentWindow.bookId, bookTitle);
    } catch (error) {
      openAnalysis.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开分析。'), 'error');
    }
  });
  openAnalysis.dataset['recordsDestination'] = 'analysis';
  // 来源与证据 (Issue #425, S70; IA-012) leaves the manuscript as 分析 does: local edits settled and the position taken first.
  const openSources = button(SOURCES_ENTRY_LABEL, 'secondary', async () => {
    openSources.disabled = true;
    setStatus(SOURCES_STATUS.leaving, 'busy');
    try {
      if (!(await settleLocalEdit())) {
        openSources.disabled = false;
        return;
      }
      await rememberEntryPosition();
      if (destroyed) return;
      renderBookSources(currentWindow.bookId, bookTitle);
    } catch (error) {
      openSources.disabled = false;
      setStatus(rendererErrorMessage(error, SOURCES_STATUS.openFailed), 'error');
    }
  });
  openSources.dataset['recordsDestination'] = 'sources';
  // Leaving for 审阅 is leaving the manuscript too: local edits are settled and the position is taken
  // first, exactly as for 分析. A Mark Card's 查看任务 leaves the same way, for its Review Run and finding.
  const leaveForReview = async (focus: ReviewFocus | null): Promise<boolean> => {
    setStatus('正在保存并打开审阅…', 'busy');
    try {
      if (!(await settleLocalEdit())) return false;
      await rememberEntryPosition();
      if (destroyed) return false;
      renderBookReview(currentWindow.bookId, bookTitle, focus);
      return true;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法打开审阅。'), 'error');
      return false;
    }
  };
  const openReview = button(REVIEW_ENTRY_LABEL, 'secondary', async () => {
    openReview.disabled = true;
    if (!(await leaveForReview(null))) openReview.disabled = authoritativeMutationBusy();
  });
  // 解决冲突… leaves the manuscript for 稿件冲突 (Issue #57): local edits are settled and the position taken
  // first, so the comparison reads the durable text and 返回稿件 comes back to where the editor was.
  const leaveForConflict = async (markId: string): Promise<void> => {
    setStatus('正在保存并打开稿件冲突…', 'busy');
    try {
      if (!(await settleLocalEdit())) return;
      await rememberEntryPosition();
      if (destroyed) return;
      renderProposalConflict({ bookId: currentWindow.bookId, manuscriptId: currentWindow.manuscriptId, branchId: currentWindow.branchId, markId }, bookTitle);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法打开稿件冲突。'), 'error');
    }
  };
  openReview.dataset['workDestination'] = 'review';
  // Leaving for 交付物 is leaving the manuscript as well: local edits are settled and the position taken first.
  const openDeliverables = button(DELIVERABLES_ENTRY_LABEL, 'secondary', async () => {
    openDeliverables.disabled = true;
    setStatus(DELIVERABLES_STATUS_LINES.leaving, 'busy');
    try {
      if (!(await settleLocalEdit())) {
        openDeliverables.disabled = authoritativeMutationBusy();
        return;
      }
      await rememberEntryPosition();
      if (destroyed) return;
      renderBookDeliverables(currentWindow.bookId, bookTitle);
    } catch (error) {
      openDeliverables.disabled = authoritativeMutationBusy();
      setStatus(rendererErrorMessage(error, DELIVERABLES_STATUS_LINES.openFailed), 'error');
    }
  });
  openDeliverables.dataset['workDestination'] = 'deliverables';
  if (isDocument) openDeliverables.textContent = DOCUMENT_ACTION_LABELS.back;
  // 评估 (Issue #429, S81a review; IA-012, editor-surfaces §0.3) sits between 审阅 and 交付物, and leaves the manuscript as
  // they do: local edits settled and the position taken first, and a refusal keeps the manuscript on screen.
  const openEvaluation = button(EVALUATION_TITLE, 'secondary', async () => {
    openEvaluation.disabled = true;
    setStatus(EVALUATION_STATUS.leaving, 'busy');
    try {
      if (!(await settleLocalEdit())) {
        openEvaluation.disabled = authoritativeMutationBusy();
        return;
      }
      await rememberEntryPosition();
      if (destroyed) return;
      renderBookEvaluation(currentWindow.bookId, bookTitle);
    } catch (error) {
      openEvaluation.disabled = authoritativeMutationBusy();
      setStatus(rendererErrorMessage(error, EVALUATION_STATUS.openFailed), 'error');
    }
  });
  openEvaluation.dataset['workDestination'] = 'evaluation';
  const toolbarActions = element('div', 'button-row');
  if (recoveryAttentionId) {
    toolbarActions.append(button('返回恢复待确认', 'secondary', async () => {
      setStatus('正在返回稿件恢复比较…', 'busy');
      try {
        await returnToRecoveryComparison(recoveryAttentionId);
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法返回恢复比较。'), 'error');
      }
    }));
  }
  // IA-012's `资料与记录` group, as much of it as this surface owns: 工作概览 is reached from here,
  // which is what makes it a destination rather than the way in. The action keeps its own label so
  // the group names where it leads without renaming what it does.
  const recordsGroup = element('nav', 'book-records-group');
  recordsGroup.setAttribute('aria-label', '资料与记录');
  recordsGroup.append(element('span', 'section-label', '资料与记录'), ...(isDocument ? [] : [openAnalysis, openSources]), backToOverview);
  const processingGroup = element('nav', 'book-processing-group');
  processingGroup.setAttribute('aria-label', '处理');
  const openFindings = button('发现', 'secondary', async () => {
    try {
      if (!(await settleLocalEdit())) return;
      await rememberEntryPosition();
      if (destroyed) return;
      renderBookFindings(currentWindow.bookId, bookTitle);
    } catch (error) { setStatus(rendererErrorMessage(error, FINDINGS_CENTER_WORDS.openFailed), 'error'); }
  });
  openFindings.dataset['workDestination'] = 'findings';
  processingGroup.append(element('span', 'section-label', '处理'), openFindings);
  // IA-006's `工作` group (稿件 / 审阅 / 评估 / 交付物): 审阅 (editor-surfaces §4), 评估 (§5) and 交付物 (§9) — a document has
  // only its way back. They are destinations of the Book beside 资料与记录, never entries on the right edge, whose three
  // entries are 导航 / 分析 / 任务.
  const workGroup = element('nav', 'book-work-group');
  workGroup.setAttribute('aria-label', REVIEW_WORK_GROUP_LABEL);
  workGroup.append(element('span', 'section-label', REVIEW_WORK_GROUP_LABEL), ...(isDocument ? [] : [openReview, openEvaluation]), openDeliverables);
  // 保存为版本 (Issue #415): a document's working text becomes its next version; the manuscript's milestones stay its own.
  const saveVersion = button(DOCUMENT_ACTION_LABELS.saveVersion, 'secondary', () => void saveDocumentVersion());
  saveVersion.dataset['documentAction'] = 'saveVersion';
  toolbarActions.append(workGroup, ...(isDocument ? [] : [processingGroup]), recordsGroup, undo, redo, save, ...(isDocument ? [saveVersion] : []), retryAuthoritativeRefreshButton);
  toolbar.append(title, toolbarActions);

  const workspace = element('div', 'editor-workspace');
  const navigator = element('aside', 'manuscript-navigator');
  navigator.setAttribute('aria-label', '稿件导航与查找');

  const outlineSection = element('section', 'navigator-section');
  outlineSection.append(element('h3', undefined, '结构导航'));
  const outlineList = element('div', 'outline-list');
  outlineList.setAttribute('role', 'list');
  const previousOutline = button('上一组结构', 'quiet', () => void loadOutline(outlinePage?.previousCursor ?? null));
  const nextOutline = button('下一组结构', 'quiet', () => void loadOutline(outlinePage?.nextCursor ?? null));
  previousOutline.hidden = true;
  nextOutline.hidden = true;
  const outlinePaging = element('div', 'button-row');
  outlinePaging.append(previousOutline, nextOutline);
  outlineSection.append(outlineList, outlinePaging);

  const searchSection = element('section', 'navigator-section search-section');
  searchSection.append(element('h3', undefined, '全稿查找与替换'));
  const searchLabel = element('label', undefined, '查找文字');
  searchLabel.htmlFor = 'manuscript-search';
  const searchInput = element('input');
  searchInput.id = 'manuscript-search';
  searchInput.maxLength = 256;
  const replacementLabel = element('label', undefined, '替换为');
  replacementLabel.htmlFor = 'manuscript-replacement';
  const replacementInput = element('input');
  replacementInput.id = 'manuscript-replacement';
  replacementInput.maxLength = 2048;
  const searchButton = button('查找全稿', 'secondary', () => void runSearch());
  const cancelJob = button('取消当前操作', 'quiet', () => void cancelActiveServiceJob());
  cancelJob.hidden = true;
  const prepareReplacementButton = button('预览替换', 'secondary', () => void prepareReplacement());
  prepareReplacementButton.disabled = true;
  const searchActions = element('div', 'button-row');
  searchActions.append(searchButton, prepareReplacementButton, cancelJob);
  const searchSummary = element('p', 'field-note', '范围：全稿。结果会记录查找时的稿件版本。');
  searchSummary.setAttribute('aria-live', 'polite');
  const exclusionSummary = element(
    'p',
    'field-note replacement-exclusion-summary',
    `最多排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处，且至少保留 1 处；当前排除 0 处。`,
  );
  exclusionSummary.id = 'replacement-exclusion-summary';
  exclusionSummary.setAttribute('aria-live', 'polite');
  const searchResults = element('div', 'search-results');
  const resultPaging = element('div', 'button-row');
  const previousResults = button('上一组结果', 'quiet', () => void loadSearchResults(searchPage?.previousCursor ?? null));
  const nextResults = button('下一组结果', 'quiet', () => void loadSearchResults(searchPage?.nextCursor ?? null));
  const returnFromSearch = button('返回查找前位置', 'quiet', () => void returnToSearchPosition());
  previousResults.hidden = true;
  nextResults.hidden = true;
  returnFromSearch.hidden = true;
  resultPaging.append(previousResults, nextResults, returnFromSearch);
  const replacementReview = element('section', 'replacement-review');
  replacementReview.hidden = true;
  searchSection.append(
    searchLabel,
    searchInput,
    replacementLabel,
    replacementInput,
    searchActions,
    searchSummary,
    exclusionSummary,
    searchResults,
    resultPaging,
    replacementReview,
  );

  // 保存为里程碑版本 (V2-UX-MILE-003; interaction spec › Milestone rules): 标签, an unselected purpose card set
  // — the four frozen purposes and 自行输入, which asks for the editor's own words — and an optional 说明.
  // Nothing is preselected, and 保存里程碑版本 stays unavailable, its reason in words beside it, until a label
  // and a purpose are given. A purpose states the next use only and grants nothing (MILE-009).
  const milestoneSection = element('details', 'navigator-section milestone-section');
  const milestoneSummary = element('summary', undefined, SAVE_MENU_WORDS.milestone);
  const milestoneLabel = element('label', undefined, MILESTONE_FORM_WORDS.label);
  milestoneLabel.htmlFor = 'milestone-label';
  const milestoneName = element('input');
  milestoneName.id = 'milestone-label';
  milestoneName.maxLength = 80;
  const purposeOptions = element('fieldset', 'milestone-purpose-options');
  purposeOptions.append(element('legend', undefined, MILESTONE_FORM_WORDS.purpose));
  const purposeRadios = MILESTONE_PURPOSE_KINDS.map((kind) => {
    const option = element('label', 'milestone-purpose-option');
    option.dataset['purposeKind'] = kind;
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'milestone-purpose';
    radio.value = kind;
    option.append(radio, element('span', undefined, MILESTONE_PURPOSE_LABELS[kind]));
    purposeOptions.append(option);
    return radio;
  });
  const purposeNote = element('small', 'field-note milestone-purpose-note', MILESTONE_PURPOSE_NOTE);
  const customPurposeLabel = element('label', undefined, MILESTONE_FORM_WORDS.customPurpose);
  customPurposeLabel.htmlFor = 'milestone-purpose-custom';
  const customPurpose = element('input');
  customPurpose.id = 'milestone-purpose-custom';
  customPurpose.maxLength = 120;
  const noteLabel = element('label', undefined, MILESTONE_FORM_WORDS.note);
  noteLabel.htmlFor = 'milestone-note';
  const note = element('input');
  note.id = 'milestone-note';
  note.maxLength = 500;
  const milestoneButton = button(MILESTONE_FORM_WORDS.save, 'secondary', () => void saveMilestone());
  const milestoneReason = element('small', 'field-note milestone-save-reason');
  milestoneReason.id = 'milestone-save-reason';
  milestoneButton.setAttribute('aria-describedby', milestoneReason.id);
  const chosenPurpose = (): MilestonePurposeKind | null => {
    const checked = purposeRadios.find((radio) => radio.checked);
    return checked === undefined ? null : checked.value as MilestonePurposeKind;
  };
  const milestoneBlockers = (): string[] =>
    milestoneFormBlockers({ label: milestoneName.value, purposeKind: chosenPurpose(), customWords: customPurpose.value });
  // Whether the form is complete, and why not; it reads nothing and writes nothing.
  const syncMilestoneForm = (busy: boolean): void => {
    const custom = chosenPurpose() === 'custom';
    customPurposeLabel.hidden = !custom;
    customPurpose.hidden = !custom;
    const reason = milestoneSaveReason(milestoneBlockers());
    milestoneReason.textContent = reason ?? '';
    milestoneReason.hidden = reason === null;
    milestoneButton.disabled = busy || reason !== null;
  };
  // Each milestone starts again from an unselected purpose (interaction spec › Milestone rules).
  const resetMilestoneForm = (busy: boolean): void => {
    milestoneName.value = '';
    for (const radio of purposeRadios) radio.checked = false;
    customPurpose.value = '';
    note.value = '';
    syncMilestoneForm(busy);
  };
  syncMilestoneForm(false);
  milestoneSection.append(
    milestoneSummary,
    milestoneLabel,
    milestoneName,
    purposeOptions,
    purposeNote,
    customPurposeLabel,
    customPurpose,
    noteLabel,
    note,
    milestoneButton,
    milestoneReason,
  );
  navigator.append(outlineSection, searchSection);
  const saveMenu = isDocument ? undefined : createSaveMenu(milestoneSection, () => openDeliverables.click());
  const analysisPanel = element('aside', 'manuscript-navigator paragraph-analysis-panel');
  analysisPanel.id = 'paragraph-analysis-panel';
  analysisPanel.setAttribute('aria-label', PARAGRAPH_ANALYSIS_WORDS.title);
  analysisPanel.hidden = true;
  // The outline and the search are one 导航 panel, opened on demand over the manuscript's right side and
  // closed by default, so the manuscript stays the central object (V2-UX-ED-015).
  navigator.id = 'manuscript-navigation-panel';
  navigator.hidden = true;

  const manuscript = element('main', 'manuscript-surface');
  const editorWindow = element('section', 'editor-window');
  const editorHost = element('div');
  editorWindow.append(editorHost);
  // A note block's 「引自第 X 段」 goes to the paragraph that refers to it (Issue #1204).
  editorHost.addEventListener('click', (event) => {
    const reference = (event.target as Element | null)?.closest<HTMLElement>('[data-note-reference]')?.dataset['noteReference'];
    if (reference !== undefined) void navigate({ kind: 'block', blockId: reference });
  });
  const positionRailLabel = element('label', 'position-rail-label', '全稿位置');
  positionRailLabel.htmlFor = 'manuscript-position';
  const positionRail = element('input', 'position-rail');
  positionRail.id = 'manuscript-position';
  positionRail.type = 'range';
  positionRail.min = '0';
  positionRail.max = '1000000';
  positionRail.step = '1';
  positionRail.value = String(Math.round(initialWindow.position.proportion * 1_000_000));
  const previousWindow = button('向前浏览', 'quiet', () => void navigateCursor('previous'));
  const nextWindow = button('向后浏览', 'quiet', () => void navigateCursor('next'));
  const windowActions = element('nav', 'window-actions');
  windowActions.setAttribute('aria-label', '稿件窗口');
  windowActions.append(previousWindow, nextWindow);
  manuscript.append(editorWindow, windowActions);

  // The right edge (editor-surfaces §1 右缘一列): three entries and the one persistent whole-manuscript
  // control. The rail stays visible while the panel is closed; the pane's own scrollbar shows only
  // while it scrolls, so two scrollbars never stand side by side (V2-UX-ED-059).
  const edge = element('aside', 'editor-edge');
  edge.setAttribute('aria-label', '稿件导航');
  const navigationEntry = button('导航', 'quiet', () => setNavigationOpen(navigator.hidden === true));
  navigationEntry.dataset['edgeEntry'] = 'navigation';
  navigationEntry.setAttribute('aria-controls', navigator.id);
  navigationEntry.setAttribute('aria-expanded', 'false');
  navigationEntry.dataset['shortcutCommand'] = 'search.find';
  navigationEntry.dataset['shortcutBase'] = '大纲与全稿查找';
  navigationEntry.title = `大纲与全稿查找（${shortcutHint('search.find') ?? ''}）`;
  let localParagraphPanel: ReturnType<typeof mountParagraphAnalysis> | undefined;
  let analysisPositionSource: 'caret' | 'scroll' = 'caret';
  const analysisEntry = button('分析', 'quiet', () => localParagraphPanel?.toggle());
  analysisEntry.dataset['edgeEntry'] = 'analysis';
  analysisEntry.title = PARAGRAPH_ANALYSIS_WORDS.entry;
  // 任务 (Issue #423, S77a; TASK-044): the Book's 任务 panel in the side slot, and closed again from here.
  const tasksEntry = button('任务', 'quiet', () => {
    const showing = taskDrawer.view();
    if (showing?.kind === 'panel' && showing.bookId === initialWindow.bookId) {
      taskDrawer.close(true);
      return;
    }
    taskDrawer.openPanel(initialWindow.bookId, () => tasksEntry);
  });
  tasksEntry.dataset['edgeEntry'] = 'tasks';
  tasksEntry.setAttribute('aria-controls', 'task-drawer');
  tasksEntry.dataset['shortcutCommand'] = 'view.openTasks';
  tasksEntry.dataset['shortcutBase'] = '这本书的任务';
  tasksEntry.title = `这本书的任务（${shortcutHint('view.openTasks') ?? ''}）`;
  const edgeEntries = element('div', 'edge-entries');
  edgeEntries.append(navigationEntry, ...(isDocument ? [] : [analysisEntry, tasksEntry]));
  const railTrack = element('div', 'rail-track');
  railTrack.append(positionRail);
  const railColumn = element('div', 'rail-column');
  railColumn.append(positionRailLabel, railTrack);
  edge.append(edgeEntries, railColumn);
  // The document's workflow moves by the editor's commands in its lens (Issue #415, S66c); a refused move reads it again.
  const documentLens = productionDocument === undefined ? undefined : renderDocumentLens(productionDocument, {
    move: async (input) => (await api.transitionProductionDocumentPhase({ documentId: productionDocument.document.documentId, ...input })).document,
    read: async () => {
      const documents = await api.inspectProductionDocuments();
      return documents.types.find((type) => type.typeId === productionDocument.typeId)?.document ??
        (await readersReportDraftOf(api, productionDocument.document.documentId))?.document ?? null;
    },
    setStatus,
    errorMessage: rendererErrorMessage,
  });
  if (documentLens !== undefined) workspace.classList.add('document-workspace');
  workspace.append(manuscript, ...(documentLens === undefined ? [] : [documentLens.element]), navigator, ...(isDocument ? [] : [analysisPanel]), edge);

  const setNavigationOpen = (open: boolean): void => {
    // One supporting side surface at a time (IA): 导航 opening closes the Task Drawer beside the manuscript.
    if (open) { taskDrawer.close(false); localParagraphPanel?.close(); }
    navigator.hidden = !open;
    navigationEntry.setAttribute('aria-expanded', open ? 'true' : 'false');
    workspace.dataset['navigation'] = open ? 'open' : 'closed';
  };
  navigator.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    setNavigationOpen(false);
    navigationEntry.focus();
  });
  let scrollingTimer: number | undefined;
  editorWindow.addEventListener('scroll', () => {
    analysisPositionSource = 'scroll';
    localParagraphPanel?.refresh();
    editorWindow.dataset['scrolling'] = 'true';
    if (scrollingTimer !== undefined) window.clearTimeout(scrollingTimer);
    scrollingTimer = window.setTimeout(() => {
      delete editorWindow.dataset['scrolling'];
    }, 900);
  }, { passive: true });

  const identities = element('details', 'editor-identities');
  identities.append(element('summary', undefined, '当前业务绑定'));
  const identityGrid = element('dl', 'identity-grid');
  identityGrid.append(
    element('dt', undefined, '图书'),
    element('dd', undefined, '已绑定'),
    element('dt', undefined, '稿件'),
    element('dd', undefined, '主稿件'),
    element('dt', undefined, '分支'),
    element('dd', undefined, '主分支'),
    element('dt', undefined, '修订版'),
    element('dd', undefined, initialWindow.revisionLabel),
  );
  identities.append(identityGrid);
  content.append(toolbar, workspace, identities);
  if (options.reimportNotice !== undefined) toolbar.after(options.reimportNotice);
  const toggleSaveMenu = (): void => {
    if (saveMenu !== undefined) (saveMenu.element as HTMLDetailsElement).open = !(saveMenu.element as HTMLDetailsElement).open;
  };
  const saveMenuKeydown = (event: KeyboardEvent): void => {
    if (saveMenu !== undefined && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); persistenceStatus.click(); }
  };
  const surface: ManuscriptScreen = {
    bookId: initialWindow.bookId,
    manuscriptId: initialWindow.manuscriptId,
    branchId: initialWindow.branchId,
    // A mount that threw before its editor existed has no place to read and nothing to settle, so the shell can still leave it.
    readingPlace: () => (editor === undefined ? null : readingPlace()),
    jump,
    refreshMarks,
    selectionSpan: async () => editorialMarks === undefined ? SELECTION_TASK_PICK_RANGE : editorialMarks.selectionSpan(),
    composeProcedures: (span) => editorialMarks?.composeProcedures(span),
    settle: () => (editor === undefined ? Promise.resolve(!destroyed) : settle()),
    isComposing: () => editor?.isComposing() === true,
    closeSupportingPanel: () => {
      if (!navigator.hidden) setNavigationOpen(false);
      localParagraphPanel?.close();
    },
    followReviewMarks,
    interrupt: () => editor?.interrupt(),
    blockedClose: () => {
      if (editor?.protection() == null) return false;
      setStatus(PROTECTION_CLOSE_BLOCKED, 'error');
      protectionSurface?.openOptions(PROTECTION_CLOSE_BLOCKED);
      return true;
    },
    destroy,
  };
  // The shell captures/destroys the departing screen and installs this handle before DOM-dependent mounting and focus.
  options.attach(content, surface);
  // 专注 and 视图 in the context header, and the protection surface first beside them (Issue #951; ED-004, DUR-003, VIEW-012).
  editorModes = mountEditorModes({
    host: options.contextView,
    view: viewPreferences,
    focus: focusMode,
    rail: true,
    openNavigation: () => setNavigationOpen(true),
    ...(isDocument ? {} : { openTasks: () => taskDrawer.openPanel(initialWindow.bookId, () => tasksEntry) }),
    setStatus,
    shortcutHint,
  });
  protectionSurface = mountProtectionSurface({
    host: editorModes.protectionHost,
    root: document.documentElement,
    retry: () => editor?.retryWrite(),
    affectedContent: () => editor?.affectedContent() ?? '',
    writeClipboard: (text) => copyPlainText(api, text),
    setStatus,
  });
  // The supporting slot's width (VIEW-007): one separator for 导航 or 分析, whichever is open.
  const separator = mountRegionSeparator({
    region: 'supportingWidth',
    view: viewPreferences,
    measure: () => (analysisPanel.hidden ? navigator : analysisPanel).getBoundingClientRect().width,
    announce: (message) => setStatus(message),
  });
  workspace.append(separator.element);
  supportingSeparator = separator;
  persistenceStatus.addEventListener('click', toggleSaveMenu);
  persistenceStatus.addEventListener('keydown', saveMenuKeydown);
  if (saveMenu !== undefined) {
    saveMenu.element.id = 'manuscript-save-menu';
    saveMenu.update(null, null);
    options.setContextActions(saveMenu.element);
    persistenceStatus.setAttribute('role', 'button'); persistenceStatus.tabIndex = 0;
    persistenceStatus.setAttribute('aria-controls', saveMenu.element.id);
    saveMenu.element.addEventListener('toggle', () => {
      if (!destroyed) persistenceStatus.setAttribute('aria-expanded', String((saveMenu.element as HTMLDetailsElement).open));
    });
  }
  if (entryNotice !== undefined) showEntryNotice(content, entryNotice);

  let currentWindow = initialWindow;
  if (!isDocument) {
    const currentBlock = (): string | null => {
      const focused = editor?.captureContinuity();
      return (analysisPositionSource === 'caret' ? focused?.head.blockId : focused?.scrollAnchor.blockId) ?? currentWindow.blocks[0]?.blockId ?? null;
    };
    localParagraphPanel = mountParagraphAnalysis({
      bookId: initialWindow.bookId,
      root: analysisPanel, entry: analysisEntry,
      read: async () => {
        const blockId = currentBlock(); if (blockId === null) return null;
        const result = await api.inspectParagraphAnalysis({ manuscriptId: initialWindow.manuscriptId, blockId, radius: 1 });
        if (blockId !== currentBlock()) { localParagraphPanel?.refresh(); return undefined; }
        return result;
      },
      lastViewed: () => preferences.current['analysis.lastViewedRevision'][initialWindow.bookId]?.ordinal ?? 0,
      viewed: (revision) => preferences.viewAnalysis(initialWindow.bookId, revision),
      notice: () => showEntryNotice(content, PARAGRAPH_ANALYSIS_WORDS.hint),
      beforeOpen: () => { setNavigationOpen(false); taskDrawer.close(false); },
      openItem: (item: ParagraphAnalysisProjection['items'][number], revisionId: string) => {
        void (async () => {
          if (authoritativeMutationBusy()) return;
          if (!(await settleLocalEdit())) return;
          await rememberEntryPosition();
          if (destroyed) return;
          renderBookAnalysis(initialWindow.bookId, bookTitle, revisionId, { tab: item.kind === 'settingClaims' ? 'settings' : item.kind });
        })().catch((error: unknown) => setStatus(rendererErrorMessage(error, PARAGRAPH_ANALYSIS_WORDS.openFailed), 'error'));
      },
    });
    const selectionChanged = (): void => {
      if (editorHost.contains(document.getSelection()?.anchorNode ?? null)) { analysisPositionSource = 'caret'; localParagraphPanel?.refresh(); }
    };
    document.addEventListener('selectionchange', selectionChanged);
    paragraphSelectionOff = () => document.removeEventListener('selectionchange', selectionChanged);
  }
  let dirty = false;
  let saving = false;
  let retryRequired = false;
  let editingInterrupted = false;
  let changedSinceMilestone: string | null = null;
  let milestoneReadDigest: string | undefined;
  const updatePersistenceMenu = (): void => saveMenu?.update({ dirty, saving, retryRequired, interrupted: editingInterrupted }, changedSinceMilestone);
  const refreshMilestonePersistence = (force = false): void => {
    if (destroyed || saveMenu === undefined || (!force && milestoneReadDigest === currentWindow.workingDigest)) return;
    milestoneReadDigest = currentWindow.workingDigest;
    changedSinceMilestone = null;
    updatePersistenceMenu();
    if (milestonePersistenceTimer !== undefined) window.clearTimeout(milestonePersistenceTimer);
    const request = ++milestonePersistenceRead;
    milestonePersistenceTimer = window.setTimeout(() => {
      if (!content.isConnected) return;
      void api.inspectDeliverables().then((page) => {
        if (!content.isConnected || request !== milestonePersistenceRead || page.manuscript?.manuscriptId !== currentWindow.manuscriptId ||
            page.manuscript.workingDigest !== currentWindow.workingDigest || page.manuscript.revisionId !== currentWindow.revisionId) return;
        const latest = page.publication.milestones[0];
        changedSinceMilestone = latest?.changedSince === true ? SAVE_MENU_WORDS.changedSinceMilestone(latest.label) : null;
        updatePersistenceMenu();
      }).catch(() => {
        if (content.isConnected && request === milestonePersistenceRead) { changedSinceMilestone = SAVE_MENU_WORDS.milestoneUnavailable; updatePersistenceMenu(); }
      });
    }, 250);
  };
  saveMenu?.element.addEventListener('toggle', () => { if ((saveMenu.element as HTMLDetailsElement).open) refreshMilestonePersistence(true); });
  let outlinePage: OutlineProjection | undefined;
  let searchPage: SearchResultsProjection | undefined;
  let replacementPreview: ReplacementPreviewProjection | undefined;
  let activeJob: ServiceJobProjection | undefined;
  let serviceJobStarting = false;
  let cancellationRequestedJobId: string | undefined;
  let cancellationRequest: Promise<ServiceJobProjection> | undefined;
  let searchReturn: { window: ManuscriptWindowProjection; continuity: EditorContinuity } | undefined;
  let edgeNavigation = false;
  let navigationIdle: Promise<void> = Promise.resolve();
  let authoritativeMutationStarting = false;
  let authoritativeMutation = false;
  let searchInvalidation: Promise<void> | undefined;
  let searchPresentationStale = false;
  const excludedMatchIds = new Set<string>();

  const serviceJobBusy = (): boolean => serviceJobStarting || activeJob !== undefined;
  const authoritativeMutationBusy = (): boolean => authoritativeMutationStarting || authoritativeMutation;
  // Leaving for 待我处理 from the header is leaving the manuscript (Issue #424): local edits are settled and the
  // position is taken first, exactly as for 分析 and 审阅; while a write is under way, nothing leaves.
  const settle = async (): Promise<boolean> => {
    if (destroyed || authoritativeMutationBusy()) return false;
    if (!(await settleLocalEdit())) return false;
    await rememberEntryPosition();
    return !destroyed;
  };
  const updateExclusionSummary = (): void => {
    exclusionSummary.textContent =
      `最多排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处，且至少保留 1 处；当前排除 ${excludedMatchIds.size.toLocaleString('zh-CN')} 处。`;
    exclusionSummary.dataset['excludedCount'] = String(excludedMatchIds.size);
    exclusionSummary.dataset['exclusionLimit'] = String(MAX_REPLACEMENT_EXCLUSIONS);
  };

  const updateServiceControls = (): void => {
    const busy = serviceJobBusy();
    searchButton.disabled = authoritativeMutationBusy() || busy;
    prepareReplacementButton.disabled = authoritativeMutationBusy() || busy || searchPresentationStale ||
      searchPage === undefined || searchPage.totalMatches === 0;
    searchInput.disabled = authoritativeMutationBusy() || busy;
    replacementInput.disabled = authoritativeMutationBusy() || busy;
    cancelJob.hidden = activeJob === undefined || (activeJob.state !== 'queued' && activeJob.state !== 'running');
    cancelJob.disabled = activeJob === undefined || (activeJob.state !== 'queued' && activeJob.state !== 'running');
    cancelJob.dataset['serviceJobId'] = activeJob?.jobId ?? '';
    for (const control of replacementReview.querySelectorAll<HTMLButtonElement>('button[data-replacement-action]')) {
      const dismiss = control.dataset['replacementAction'] === 'dismiss';
      control.disabled = authoritativeMutationBusy() || busy || (searchPresentationStale && !dismiss);
    }
  };

  const updateWindowChrome = (): void => {
    updatePersistenceMenu();
    refreshMilestonePersistence();
    position.textContent = currentWindow.position.label;
    revision.textContent = revisionWords(currentWindow);
    documentLens?.update(currentWindow.workingDigest);
    journal.textContent = `修订日志序号 ${currentWindow.journalSequence}`;
    recoveredState.hidden = currentWindow.recoveredStateReview === null;
    positionRail.value = String(Math.round(currentWindow.position.proportion * 1_000_000));
    positionRail.setAttribute('aria-valuetext', `全稿 ${(currentWindow.position.proportion * 100).toFixed(3)}%`);
    manuscriptRail?.setPosition(currentWindow.position.proportion);
    previousWindow.disabled = authoritativeMutationBusy() || currentWindow.previousCursor === null;
    nextWindow.disabled = authoritativeMutationBusy() || currentWindow.nextCursor === null;
  };

  const syncAuthoritativeMutationControls = (): void => {
    const busy = authoritativeMutationBusy();
    editorHost.dataset['authoritativeMutation'] = authoritativeMutation ? 'true' : 'false';
    backToOverview.disabled = busy;
    openAnalysis.disabled = busy;
    openReview.disabled = busy;
    openEvaluation.disabled = busy;
    openDeliverables.disabled = busy;
    openFindings.disabled = busy;
    undo.disabled = busy;
    redo.disabled = busy;
    positionRail.disabled = busy;
    previousOutline.disabled = busy;
    nextOutline.disabled = busy;
    milestoneName.disabled = busy;
    for (const radio of purposeRadios) radio.disabled = busy;
    customPurpose.disabled = busy;
    note.disabled = busy;
    syncMilestoneForm(busy);
    setCloseRisk(busy || dirty || saving || retryRequired);
    updateServiceControls();
    updateWindowChrome();
  };

  const setAuthoritativeMutation = (locked: boolean): void => {
    const previous = authoritativeMutation;
    try {
      editor?.setOperationLocked(locked);
      authoritativeMutation = locked;
      syncAuthoritativeMutationControls();
    } catch (error) {
      authoritativeMutation = previous;
      try {
        editor?.setOperationLocked(previous);
        syncAuthoritativeMutationControls();
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], '稿件权威操作锁无法安全回滚。');
      }
      throw error;
    }
  };

  const publishAuthoritativeMutationStarting = (starting: boolean): void => {
    authoritativeMutationStarting = starting;
    syncAuthoritativeMutationControls();
  };

  async function settleLocalEdit(): Promise<boolean> {
    // The action the editor just used: under Editing Protection Mode its refusal is said beside it (DUR-005).
    if (destroyed) return false;
    const attempted = recentlyActivatedControl();
    if (editor?.isComposing()) {
      setStatus('请先完成当前输入法组合。', 'busy');
      return false;
    }
    if (dirty || saving || retryRequired) await editor?.flush();
    const settled = !destroyed && !dirty && !saving && !retryRequired;
    // Leaving, Apply, bulk replacement, undo/redo, a milestone and every other graph-changing command come through here: while
    // input is at risk none of them may discard, duplicate or fork it (DUR-005, ED-056).
    if (!settled && editor?.protection() != null) protectionSurface?.blockAction(attempted?.closest('.editing-protection-host') ? null : attempted);
    return settled;
  }

  /**
   * Remember where the editor is, so the next entry into this Book comes back here (V2-UX-RET-002).
   * It is taken when the editor arrives at a window and again when it leaves the manuscript — never
   * while typing — so it costs one write per place the editor goes to and none per keystroke, and a
   * product that stops between two of those moments still knows the window the editor was reading.
   *
   * The pair is the editor's own caret in the window projection's vocabulary, so what is read back
   * opens as a `block` target with no translation. A remembered position settles nothing, so a
   * failure to write one is not allowed to take the editor's place away from them: the surface keeps
   * working and the previous position stands.
   *
   * Paging and leaving await it, so the position is durable before the surface says where it arrived
   * and before the overview it leaves for is read — an editor who pages and closes the product in the
   * same breath still comes back to the window they moved to, and the overview never states a position
   * the editor has already moved off. Arriving does not await, because a window just fetched is the
   * position a caller already reached and nothing downstream reads it back.
   */
  /**
   * 保存为版本 (Issue #415): local edits are settled first, then the document's working text becomes its next version;
   * the surface opens again at the same place with the version it now stands on and the column's list refreshed.
   */
  async function saveDocumentVersion(): Promise<void> {
    if (productionDocument === undefined || authoritativeMutationBusy()) return;
    saveVersion.disabled = true;
    setStatus(DOCUMENT_STATUS_LINES.savingVersion, 'busy');
    try {
      if (!(await settleLocalEdit())) {
        saveVersion.disabled = false;
        return;
      }
      const before = productionDocument.document.versions[0]?.revisionId;
      const result = await api.saveProductionDocumentVersion({
        documentId: productionDocument.document.documentId,
        branchId: productionDocument.document.branchId,
      });
      if (result.document === null || result.document.documentId !== productionDocument.document.documentId) {
        throw new Error(DOCUMENT_STATUS_LINES.saveVersionFailed);
      }
      const anchorBlock = currentWindow.blocks[0]?.blockId;
      const reopened = await api.getManuscriptWindowAt({
        manuscriptId: currentWindow.manuscriptId,
        branchId: currentWindow.branchId,
        target: anchorBlock === undefined ? { kind: 'start' } : { kind: 'block', blockId: anchorBlock },
      });
      if (destroyed) return;
      renderEditorWindow(reopened, bookTitle, undefined, undefined, undefined, undefined, { ...productionDocument, document: result.document });
      const latest = result.document.versions[0];
      options.setStatus(latest === undefined || latest.revisionId === before
        ? DOCUMENT_STATUS_LINES.versionUnchanged
        : documentVersionSavedLine(latest.label), 'success');
    } catch (error) {
      saveVersion.disabled = false;
      setStatus(rendererErrorMessage(error, DOCUMENT_STATUS_LINES.saveVersionFailed), 'error');
    }
  }

  async function rememberEntryPosition(): Promise<void> {
    // Where the editor was belongs to the manuscript the Book opens into, never to a Production Document.
    if (!editor || options.interrupted() || isDocument) return;
    const point = editor.captureContinuity().anchor;
    // Paging with 向前浏览 / 向后浏览 deliberately leaves the caret where it was, off the window now on
    // screen, so the window's own first block answers for the position rather than a caret the editor
    // can no longer see. Anywhere else the caret is the position.
    const carried = currentWindow.blocks.some((block) => block.blockId === point.blockId);
    const blockId = carried ? point.blockId : currentWindow.blocks[0]?.blockId;
    if (blockId === undefined) return;
    await api.recordManuscriptEntryPosition({
      manuscriptId: currentWindow.manuscriptId,
      branchId: currentWindow.branchId,
      blockId,
      grapheme: carried ? point.grapheme : 0,
    }).catch(() => undefined);
  }

  type AuthoritativeResult = {
    revisionId: string;
    journalSequence: number;
    workingDigest: string;
    completionLabel: string;
  };

  type AuthoritativeRecovery = {
    target: Parameters<typeof api.getManuscriptWindowAt>[0]['target'];
    continuity: EditorContinuity;
    expected?: AuthoritativeResult;
    reconcile?: (result: AuthoritativeResult) => Promise<void>;
  };

  let pendingAuthoritativeRecovery: AuthoritativeRecovery | undefined;
  /** What asks for the next window load, recorded when it lands (Issue #423 review, P2-3). */
  let windowLoadCause = 'unnamed';

  const clearAuthoritativeRecovery = (): void => {
    pendingAuthoritativeRecovery = undefined;
    retryAuthoritativeRefreshButton.hidden = true;
    retryAuthoritativeRefreshButton.disabled = false;
  };

  async function refreshAuthoritativeEditor(
    target: Parameters<typeof api.getManuscriptWindowAt>[0]['target'],
    continuity: EditorContinuity,
    expected?: AuthoritativeResult,
  ): Promise<void> {
    if (!editor) throw new Error('稿件编辑器不可用。');
    const binding = editor.currentWindow();
    const next = await api.getManuscriptWindowAt({
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      target,
    });
    if (!editor) throw new Error('稿件编辑器不可用。');
    if (expected && (
      next.revisionId !== expected.revisionId || next.journalSequence !== expected.journalSequence ||
      next.workingDigest !== expected.workingDigest
    )) throw new Error('权威写入确认与刷新窗口不一致。');
    windowLoadCause = 'authoritative';
    try {
      if (!editor.loadWindow(next, continuity)) throw new Error('权威窗口已返回，但编辑器未能安全装载。');
    } finally {
      // A load refused or thrown names nothing it did not do (Issue #423 review, P3-6).
      windowLoadCause = 'unnamed';
    }
    currentWindow = next;
    updateWindowChrome();
  }

  async function runAuthoritativeMutation<T extends AuthoritativeResult>(
    operation: () => Promise<T>,
    reconcile: (result: T) => Promise<void>,
  ): Promise<T | undefined> {
    if (authoritativeMutationBusy() || !editor) return undefined;
    publishAuthoritativeMutationStarting(true);
    if (editor.isComposing()) {
      setStatus('请先完成当前输入法组合。', 'busy');
      publishAuthoritativeMutationStarting(false);
      return undefined;
    }
    let continuity: EditorContinuity | undefined;
    let target: Parameters<typeof api.getManuscriptWindowAt>[0]['target'] | undefined;
    let result: T | undefined;
    try {
      if (!(await settleLocalEdit())) {
        return undefined;
      }
      continuity = editor.captureContinuity();
      target = { kind: 'window-start', blockId: editor.currentWindow().blocks[0]!.blockId };
      setAuthoritativeMutation(true);
      result = await operation();
      await refreshAuthoritativeEditor(target, continuity, result);
      await reconcile(result);
      clearAuthoritativeRecovery();
      setAuthoritativeMutation(false);
      return result;
    } catch (error) {
      if (!authoritativeMutation || !target || !continuity) {
        if (authoritativeMutation) setAuthoritativeMutation(false);
        setStatus(rendererErrorMessage(error, '待保存编辑未能排空；权威操作未开始。'), 'error');
        return undefined;
      }
      try {
        await refreshAuthoritativeEditor(target, continuity, result);
        if (result) await reconcile(result);
        clearAuthoritativeRecovery();
        setAuthoritativeMutation(false);
        if (result) {
          setStatus(`${result.completionLabel}；编辑器已从刷新中断中恢复。`, 'success');
          return result;
        }
        setStatus(rendererErrorMessage(error, '权威操作未完成；编辑器已恢复到当前持久状态。'), 'error');
      } catch (refreshError) {
        pendingAuthoritativeRecovery = result
          ? { target, continuity, expected: result, reconcile: (value) => reconcile(value as T) }
          : { target, continuity };
        retryAuthoritativeRefreshButton.hidden = false;
        setStatus(
          `无法确认权威操作后的当前窗口；编辑区保持只读且保留可见缓冲区。请重试权威刷新。${refreshError instanceof Error ? refreshError.message : ''}`,
          'error',
        );
      }
      return undefined;
    } finally {
      publishAuthoritativeMutationStarting(false);
      if (!authoritativeMutation && searchStateIsStale()) {
        try {
          await invalidateSearchState('待保存编辑已写入；先前搜索结果、替换预览和查找返回位置已失效。');
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法取消已失效的替换预览。'), 'error');
        }
      }
    }
  }

  async function retryAuthoritativeRefresh(): Promise<void> {
    const recovery = pendingAuthoritativeRecovery;
    if (!recovery || !authoritativeMutation) return;
    retryAuthoritativeRefreshButton.disabled = true;
    try {
      await refreshAuthoritativeEditor(recovery.target, recovery.continuity, recovery.expected);
      if (recovery.expected && recovery.reconcile) await recovery.reconcile(recovery.expected);
      clearAuthoritativeRecovery();
      setAuthoritativeMutation(false);
      setStatus(
        recovery.expected
          ? `${recovery.expected.completionLabel}；权威窗口刷新已恢复。`
          : '权威操作失败后已恢复到当前持久窗口。',
        recovery.expected ? 'success' : 'error',
      );
    } catch (error) {
      retryAuthoritativeRefreshButton.disabled = false;
      setStatus(`权威窗口仍无法刷新；编辑区继续保持只读，请再次重试。${rendererErrorMessage(error, '')}`, 'error');
    }
  }

  type NavigationRequest = {
    target: Parameters<typeof api.getManuscriptWindowAt>[0]['target'];
    continuity: EditorContinuity | undefined;
    preserveOffWindowContinuity: boolean;
  };

  async function navigate(
    targetOrPrepare: NavigationRequest['target'] | (() => NavigationRequest | undefined),
    continuity?: EditorContinuity,
    preserveOffWindowContinuity = false,
  ): Promise<boolean> {
    if (authoritativeMutationBusy() || edgeNavigation || !editor) return false;
    edgeNavigation = true;
    let resolveNavigationIdle = (): void => {};
    navigationIdle = new Promise<void>((resolve) => { resolveNavigationIdle = resolve; });
    // Released by this call alone and only once: a later navigation may already hold the guard again
    // by the time this one returns, and must not have it taken away.
    let guardHeld = true;
    const releaseGuard = (): void => {
      if (!guardHeld) return;
      guardHeld = false;
      edgeNavigation = false;
      resolveNavigationIdle();
    };
    try {
      if (!(await settleLocalEdit()) || !editor) return false;
      const navigation = typeof targetOrPrepare === 'function'
        ? targetOrPrepare()
        : { target: targetOrPrepare, continuity, preserveOffWindowContinuity };
      if (!navigation) return false;
      const binding = editor.currentWindow();
      const next = await api.getManuscriptWindowAt({
        manuscriptId: binding.manuscriptId,
        branchId: binding.branchId,
        target: navigation.target,
      });
      if (!editor) return false;
      windowLoadCause = `navigation-${navigation.target.kind}`;
      let loaded: boolean;
      try {
        loaded = navigation.preserveOffWindowContinuity && navigation.continuity
          ? editor.loadNavigationWindow(next, navigation.continuity)
          : editor.loadWindow(next, navigation.continuity);
      } finally {
        windowLoadCause = 'unnamed';
      }
      if (!loaded) return false;
      currentWindow = next;
      updateWindowChrome();
      // The position write starts the moment the window is on screen, and the status that names the
      // arrival still waits for it — the guard does not. `edgeNavigation` covers the window load and
      // the two frames in which the load's own scroll restoration fires `scroll` events this surface
      // must not read as the editor reaching an edge. Held across the write as well, it made every
      // paging command that arrived while the disk was busy vanish without a word: a second PageDown,
      // 向后浏览 or a scroll to the window's end was dropped rather than deferred (#474).
      const remembered = rememberEntryPosition();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      releaseGuard();
      await remembered;
      // With the guard released a later navigation may already have put its own window on screen; its
      // arrival is then the one to name, and naming this one over it would state a place already left.
      if (!destroyed && currentWindow === next) {
        setStatus(`已到达${next.position.structureLabel ? `“${next.position.structureLabel}”附近，` : ''}${next.position.label}。`, 'success');
      }
      return true;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法移动到该稿件位置。'), 'error');
      return false;
    } finally {
      releaseGuard();
    }
  }

  // 回到<位置> (Issue #423, S77a; TASK-045): where this manuscript is read, the chip that goes back, and a result's jump.
  let returnPlace: ReadingPlace | null = null;
  let returnReadFailed = false;
  const loadReturnPlace = async (): Promise<void> => {
    const request = ++returnRequest;
    try {
      const retained = await readReturnPlace(initialWindow.manuscriptId, initialWindow.branchId);
      if (!chipHost.isConnected || request !== returnRequest) return;
      returnPlace = retained;
      returnReadFailed = false;
    } catch (error) {
      if (!chipHost.isConnected || request !== returnRequest) return;
      returnReadFailed = true;
      setStatus(rendererErrorMessage(error, '无法读取返回位置。'), 'error');
    }
  };
  const readingPlace = (): ReadingPlace | null => {
    if (!editor) return null;
    const windowNow = editor.currentWindow();
    const blocks = windowNow.blocks;
    const anchorId = editor.captureContinuity().anchor.blockId;
    const index = Math.max(0, blocks.findIndex((block) => block.blockId === anchorId));
    const block = blocks[index];
    if (block === undefined) return null;
    let heading: string | null = null;
    for (let at = index; at >= 0; at -= 1) {
      const candidate = blocks[at]!;
      if (candidate.kind === 'title' || candidate.kind === 'heading') {
        heading = candidate.text;
        break;
      }
    }
    return {
      manuscriptId: windowNow.manuscriptId,
      branchId: windowNow.branchId,
      blockId: block.blockId,
      place: returnChipPlace(heading ?? windowNow.position.structureLabel, block.position),
    };
  };
  const landAt = (blockId: string): void => {
    if (editor?.selectRange(blockId, 0, 0) === true) editor.focus();
  };
  function paintReturnChip(): void {
    const chip = returnPlace;
    chipHost.hidden = chip === null && !returnReadFailed;
    if (returnReadFailed) {
      const retry = button('重新读取返回位置', 'secondary', async () => {
        retry.disabled = true;
        await loadReturnPlace();
        if (chipHost.isConnected) paintReturnChip();
      });
      chipHost.replaceChildren(retry);
      return;
    }
    if (chip === null) {
      chipHost.replaceChildren();
      return;
    }
    const back = button(returnChipLabel(chip.place), 'secondary', async () => {
      back.disabled = true;
      // One disabled chip owns one pending return. A paging arrival must not discard that click.
      while (edgeNavigation) {
        await navigationIdle;
        if (!chipHost.isConnected) return;
      }
      if (!(await navigate({ kind: 'block', blockId: chip.blockId }))) {
        back.disabled = false;
        return;
      }
      const request = ++returnRequest;
      try {
        const retained = await consumeReturnPlace(chip);
        if (!chipHost.isConnected || request !== returnRequest) return;
        returnPlace = retained;
      } catch (error) {
        if (!chipHost.isConnected || request !== returnRequest) return;
        back.disabled = false;
        setStatus(rendererErrorMessage(error, '已到达原位置，但未能清除返回位置；可以重试。'), 'error');
        return;
      }
      if (!chipHost.isConnected) return;
      paintReturnChip();
      setStatus(returnChipArrived(chip.place), 'success');
      landAt(chip.blockId);
    });
    back.classList.add('return-chip');
    back.dataset['returnChip'] = chip.blockId;
    back.title = RETURN_CHIP_TITLE;
    chipHost.replaceChildren(back);
  }
  void loadReturnPlace().then(() => { if (chipHost.isConnected) paintReturnChip(); });

  async function navigateCursor(direction: 'previous' | 'next'): Promise<void> {
    await navigate(() => {
      if (!editor) return undefined;
      const cursor = direction === 'previous' ? editor.currentWindow().previousCursor : editor.currentWindow().nextCursor;
      if (!cursor) return undefined;
      const continuity = editor.captureNavigationContinuity();
      return { target: { kind: 'cursor', cursor }, continuity, preserveOffWindowContinuity: true };
    });
  }

  async function loadOutline(cursor: string | null, propagateFailure = false): Promise<void> {
    try {
      const binding = editor?.currentWindow() ?? currentWindow;
      const page = await api.getOutline({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, cursor });
      if (destroyed) return;
      outlinePage = page;
      outlineList.replaceChildren();
      for (const entry of page.entries) {
        const open = button(`${entry.kind === 'title' ? '标题' : `层级 ${entry.level}`} · ${entry.text}${entry.displayTextTruncated ? '（显示已截断）' : ''}`, 'quiet', () =>
          void navigate({ kind: 'block', blockId: entry.blockId }),
        );
        open.style.setProperty('--outline-depth', String(Math.max(0, entry.level - 1)));
        open.setAttribute('role', 'listitem');
        outlineList.append(open);
      }
      previousOutline.hidden = page.previousCursor === null;
      nextOutline.hidden = page.nextCursor === null;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取稿件结构。'), 'error');
      if (propagateFailure) throw error;
    }
  }

  const showJobProgress = (job: ServiceJobProjection): void => {
    activeJob = job;
    updateServiceControls();
    const progress = job.progress.total > 0 ? ` ${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}` : '';
    searchSummary.textContent = `${job.progress.label}${progress}`;
  };

  async function runOwnedServiceJob(start: () => Promise<ServiceJobProjection>): Promise<ServiceJobProjection> {
    if (serviceJobBusy()) throw new Error('已有一项全稿本地操作正在处理；请等待或取消当前操作。');
    serviceJobStarting = true;
    delete cancelJob.dataset['cancellationTargetJobId'];
    updateServiceControls();
    try {
      const initial = await start();
      serviceJobStarting = false;
      activeJob = initial;
      updateServiceControls();
      let completed = await awaitServiceJob(initial, showJobProgress);
      if (cancellationRequestedJobId === initial.jobId && cancellationRequest) {
        completed = await cancellationRequest;
      }
      return completed;
    } finally {
      if (activeJob && cancellationRequestedJobId === activeJob.jobId) {
        cancellationRequestedJobId = undefined;
        cancellationRequest = undefined;
      }
      serviceJobStarting = false;
      activeJob = undefined;
      updateServiceControls();
    }
  }

  async function cancelActiveServiceJob(): Promise<void> {
    const target = activeJob;
    if (!target || (target.state !== 'queued' && target.state !== 'running')) return;
    cancelJob.disabled = true;
    cancelJob.dataset['cancellationTargetJobId'] = target.jobId;
    cancellationRequestedJobId = target.jobId;
    const request = (async (): Promise<ServiceJobProjection> => {
      try {
        return await api.cancelServiceJob({ jobId: target.jobId });
      } catch (error) {
        const preview = replacementPreview;
        if (target.kind !== 'replacement' || !preview) throw error;
        const dismissal = await api.dismissReplacementPreview({ previewId: preview.previewId });
        if (dismissal.state !== 'cancelled') throw error;
        return {
          ...target,
          state: 'cancelled',
          result: null,
          failure: null,
          progress: { ...target.progress, label: '替换准备已取消' },
        };
      }
    })();
    cancellationRequest = request;
    try {
      const result = await request;
      if (activeJob?.jobId === target.jobId) showJobProgress(result);
      if (result.state === 'cancelled') {
        setStatus(result.progress.label, 'success');
      } else if (result.state === 'completed') {
        setStatus('本地操作已在取消请求到达前完成；未记录取消。', 'busy');
      } else if (result.state === 'failed') {
        setStatus(result.failure?.message ?? '本地操作已失败，未记录取消。', 'error');
      } else {
        setStatus('取消请求尚未成为终态；当前操作仍在处理。', 'busy');
      }
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法确认当前本地操作的取消状态。'), 'error');
    } finally {
      updateServiceControls();
    }
  }

  const setInclusionControlsLocked = (locked: boolean): void => {
    for (const control of searchResults.querySelectorAll<HTMLInputElement>('.match-inclusion input[type="checkbox"]')) {
      control.disabled = locked;
      control.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    searchResults.dataset['inclusionLocked'] = locked ? 'true' : 'false';
  };

  const clearReplacementPresentation = (): void => {
    replacementPreview = undefined;
    replacementReview.hidden = true;
    replacementReview.replaceChildren();
    setInclusionControlsLocked(false);
    updateServiceControls();
  };

  async function dismissVisibleReplacementPreview(): Promise<void> {
    const preview = replacementPreview;
    if (!preview) return;
    const dismissal = await api.dismissReplacementPreview({ previewId: preview.previewId });
    if (dismissal.previewId !== preview.previewId || dismissal.state !== 'cancelled') {
      throw new Error('替换预览取消确认无效。');
    }
    if (replacementPreview?.previewId === preview.previewId) clearReplacementPresentation();
  }

  const clearSearchPresentation = (message: string): void => {
    searchPresentationStale = false;
    searchPage = undefined;
    searchReturn = undefined;
    excludedMatchIds.clear();
    updateExclusionSummary();
    clearReplacementPresentation();
    searchResults.replaceChildren();
    previousResults.hidden = true;
    nextResults.hidden = true;
    returnFromSearch.hidden = true;
    searchSummary.textContent = message;
    updateServiceControls();
  };

  async function invalidateSearchState(reason: string, terminalPreviewId?: string): Promise<void> {
    if (searchInvalidation) return searchInvalidation;
    searchPresentationStale = true;
    updateServiceControls();
    const pending = (async () => {
      previousResults.hidden = true;
      nextResults.hidden = true;
      returnFromSearch.hidden = true;
      setInclusionControlsLocked(true);
      searchSummary.textContent = reason;
      const preview = replacementPreview;
      if (preview && preview.previewId !== terminalPreviewId) await dismissVisibleReplacementPreview();
      clearSearchPresentation(reason);
    })();
    searchInvalidation = pending;
    try {
      await pending;
    } finally {
      if (searchInvalidation === pending) searchInvalidation = undefined;
    }
  }

  const searchStateIsStale = (): boolean => {
    if (!editor) return false;
    const persisted = searchPage ?? replacementPreview ?? searchReturn?.window;
    if (!persisted) return false;
    const binding = editor.currentWindow();
    return binding.revisionId !== persisted.revisionId ||
      binding.journalSequence !== persisted.journalSequence || binding.workingDigest !== persisted.workingDigest;
  };

  async function invalidateSearchIfStale(reason: string): Promise<void> {
    if (searchStateIsStale()) await invalidateSearchState(reason);
  }

  async function runSearch(): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy()) return;
    const query = searchInput.value.normalize('NFC');
    if (!query || query.length > 256) {
      setStatus('请输入 1–256 个字符的查找文字。', 'error');
      searchInput.focus();
      return;
    }
    try {
      const completed = await runOwnedServiceJob(async () => {
        await dismissVisibleReplacementPreview();
        clearSearchPresentation('正在开始新的全稿查找…');
        const binding = editor?.currentWindow() ?? currentWindow;
        return api.startSearch({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, query });
      });
      if (completed.state === 'cancelled') {
        searchSummary.textContent = '查找已取消；当前本地编辑不受影响。';
        return;
      }
      if (completed.kind !== 'search' || !completed.result || !('searchId' in completed.result)) {
        throw new Error('查找结果绑定无效。');
      }
      await loadSearchResults(null, completed.result.searchId);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '全稿查找未完成。'), 'error');
    }
  }

  async function returnToSearchPosition(): Promise<void> {
    if (authoritativeMutationBusy() || !(await settleLocalEdit()) || !editor) return;
    if (!searchReturn) return;
    const binding = editor.currentWindow();
    if (
      binding.revisionId !== searchReturn.window.revisionId ||
      binding.journalSequence !== searchReturn.window.journalSequence ||
      binding.workingDigest !== searchReturn.window.workingDigest
    ) {
      setStatus('稿件已变化；查找前的精确选择与滚动锚点无法按原绑定恢复。', 'error');
      return;
    }
    const restored = await navigate(
      { kind: 'window-start', blockId: searchReturn.window.blocks[0]!.blockId },
      searchReturn.continuity,
    );
    if (restored) setStatus(`已返回查找前的精确选择与滚动位置；${currentWindow.position.label}。`, 'success');
  }

  async function loadSearchResults(cursor: string | null, searchId?: string): Promise<void> {
    const id = searchId ?? searchPage?.searchId;
    if (!id) return;
    const page = await api.getSearchResults({ searchId: id, cursor });
    const binding = editor?.currentWindow() ?? currentWindow;
    if (
      page.revisionId !== binding.revisionId || page.journalSequence !== binding.journalSequence ||
      page.workingDigest !== binding.workingDigest
    ) throw new Error('搜索结果已绑定到旧稿件状态，请重新查找。');
    searchPage = page;
    searchPresentationStale = false;
    searchResults.replaceChildren();
    searchSummary.textContent = `“${page.query}” · 范围：${page.scopeLabel} · 共 ${page.totalMatches.toLocaleString('zh-CN')} 处`;
    for (const match of page.results) {
      const row = element('article', 'search-result');
      const open = button(match.context, 'quiet', () => void jumpToSearchMatch(match));
      open.setAttribute('aria-label', `${match.headingLabel}：${match.context}`);
      const includeLabel = element('label', 'match-inclusion');
      const include = element('input');
      include.type = 'checkbox';
      include.dataset['matchId'] = match.matchId;
      include.checked = !excludedMatchIds.has(match.matchId);
      include.setAttribute('aria-describedby', exclusionSummary.id);
      include.addEventListener('change', () => {
        if (replacementPreview) {
          include.checked = !excludedMatchIds.has(match.matchId);
          return;
        }
        if (include.checked) {
          excludedMatchIds.delete(match.matchId);
        } else if (excludedMatchIds.size >= MAX_REPLACEMENT_EXCLUSIONS) {
          include.checked = true;
          setStatus(`最多只能排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处匹配。`, 'error');
        } else if (searchPage && excludedMatchIds.size + 1 >= searchPage.totalMatches) {
          include.checked = true;
          setStatus('至少保留一处精确匹配用于替换。', 'error');
        } else {
          excludedMatchIds.add(match.matchId);
        }
        updateExclusionSummary();
      });
      includeLabel.append(include, document.createTextNode(' 纳入替换'));
      row.append(element('p', 'field-note', match.headingLabel), open, includeLabel);
      searchResults.append(row);
    }
    previousResults.hidden = page.previousCursor === null;
    nextResults.hidden = page.nextCursor === null;
    setInclusionControlsLocked(replacementPreview !== undefined);
    updateExclusionSummary();
    updateServiceControls();
  }

  async function jumpToSearchMatch(match: SearchResultsProjection['results'][number]): Promise<void> {
    if (authoritativeMutationBusy() || !(await settleLocalEdit()) || !editor) return;
    const binding = editor.currentWindow();
    if (!searchPage || binding.revisionId !== searchPage.revisionId ||
        binding.journalSequence !== searchPage.journalSequence || binding.workingDigest !== searchPage.workingDigest) {
      setStatus('稿件已变化；请重新查找后再跳转到精确范围。', 'error');
      return;
    }
    if (!searchReturn) {
      searchReturn = { window: editor.currentWindow(), continuity: editor.captureContinuity() };
      returnFromSearch.hidden = false;
    }
    await navigate({ kind: 'block', blockId: match.blockId });
    if (!editor?.selectRange(match.blockId, match.fromGrapheme, match.toGrapheme)) {
      setStatus('无法在当前稿件状态中精确定位该匹配。', 'error');
    }
  }

  async function prepareReplacement(): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy() || !searchPage) return;
    const searchId = searchPage.searchId;
    const replacement = replacementInput.value.normalize('NFC');
    const exclusions = [...excludedMatchIds];
    if (exclusions.length > MAX_REPLACEMENT_EXCLUSIONS || exclusions.length >= searchPage.totalMatches) {
      setStatus('替换排除清单超出上限或没有保留任何精确匹配。', 'error');
      return;
    }
    let preparedPreviewId: string | undefined;
    try {
      const completed = await runOwnedServiceJob(async () => {
        await dismissVisibleReplacementPreview();
        const prepared = await api.prepareReplacement({
          searchId,
          replacement,
          excludedMatchIds: exclusions,
        });
        preparedPreviewId = prepared.previewId;
        replacementPreview = prepared;
        setInclusionControlsLocked(true);
        return api.startReplacementCommit({ previewId: prepared.previewId });
      });
      if (completed.state === 'cancelled') {
        clearReplacementPresentation();
        setStatus('替换预览准备已取消；当前本地编辑不受影响。', 'success');
        return;
      }
      if (completed.kind !== 'replacement' || !completed.result || !('replacement' in completed.result)) throw new Error('替换预览准备结果绑定无效。');
      replacementPreview = completed.result;
      renderReplacementReview(replacementPreview);
    } catch (error) {
      if (preparedPreviewId) {
        try {
          await api.dismissReplacementPreview({ previewId: preparedPreviewId });
          if (replacementPreview?.previewId === preparedPreviewId) clearReplacementPresentation();
        } catch {
          if (replacementPreview?.previewId === preparedPreviewId) setInclusionControlsLocked(true);
        }
      }
      setStatus(rendererErrorMessage(error, '无法准备替换预览。'), 'error');
    }
  }

  function renderReplacementReview(preview: ReplacementPreviewProjection): void {
    if (preview.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS || preview.includedMatches < 1) {
      throw new Error('替换预览的纳入集合超出安全范围。');
    }
    excludedMatchIds.clear();
    for (const matchId of preview.excludedMatchIds) excludedMatchIds.add(matchId);
    updateExclusionSummary();
    setInclusionControlsLocked(true);
    replacementReview.hidden = false;
    replacementReview.replaceChildren(
      element('h4', undefined, preview.state === 'frozen' ? '已冻结替换集' : '替换预览'),
      element('p', undefined, `查找“${preview.query}”，替换为“${preview.replacement}”`),
      element('p', 'field-note', `范围：${preview.scopeLabel} · 绑定修订版 ${preview.revisionLabel} · 修订日志序号 ${preview.journalSequence}`),
      element('p', 'field-note', `匹配规则：${preview.matchingRule}`),
      element('p', 'field-note', `纳入 ${preview.includedMatches} 处 · 排除 ${preview.excludedMatches} 处 · ${preview.inclusionRule}`),
      element('p', 'field-note', '精确纳入清单：本次有序搜索结果中，除下列匹配标识外的全部匹配。'),
      element('p', 'field-note inclusion-lock-truth', preview.state === 'frozen' ? '匹配集已冻结；纳入控件保持锁定。' : '当前预览的纳入控件已锁定；取消预览后可重新选择。'),
    );
    const exclusions = element('pre', 'replacement-exclusions', preview.excludedMatchIds.length > 0 ? preview.excludedMatchIds.join('\n') : '（无排除项）');
    exclusions.setAttribute('aria-label', '精确排除匹配标识清单');
    replacementReview.append(exclusions, element('p', 'field-note', '以下仅显示已纳入匹配的代表性上下文。'));
    const contexts = element('ul');
    for (const match of preview.representativeContexts) contexts.append(element('li', undefined, `${match.headingLabel}：${match.context}`));
    replacementReview.append(contexts);
    if (preview.state === 'reviewing') {
      const freeze = button('冻结并重新验证', 'primary', async () => {
        try {
          replacementPreview = await api.freezeReplacement({
            previewId: preview.previewId,
            excludedMatchIds: [...excludedMatchIds],
          });
          renderReplacementReview(replacementPreview);
        } catch (error) {
          setStatus(rendererErrorMessage(error, '替换集无法冻结。'), 'error');
        }
      });
      freeze.dataset['replacementAction'] = 'freeze';
      replacementReview.append(freeze);
    } else {
      const commit = button('原子提交替换', 'primary', () => void commitReplacement(preview.previewId));
      commit.dataset['replacementAction'] = 'commit';
      replacementReview.append(commit);
    }
    const dismiss = button('取消并关闭替换预览', 'quiet', () => void dismissReplacementFromReview(preview.previewId));
    dismiss.dataset['replacementAction'] = 'dismiss';
    replacementReview.append(dismiss);
    updateServiceControls();
  }

  async function dismissReplacementFromReview(previewId: string): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy() || replacementPreview?.previewId !== previewId) return;
    try {
      const dismissal = await api.dismissReplacementPreview({ previewId });
      if (dismissal.state !== 'cancelled') throw new Error('替换预览取消确认无效。');
      clearReplacementPresentation();
      setStatus('替换预览已取消并关闭；稿件未发生替换。', 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '替换预览无法取消。'), 'error');
    }
  }

  async function commitReplacement(previewId: string): Promise<void> {
    try {
      const replacement = await runAuthoritativeMutation(async () => {
        const completed = await runOwnedServiceJob(() => api.startReplacementCommit({ previewId }));
        if (completed.state === 'cancelled') {
          clearReplacementPresentation();
          throw new Error('替换提交已在写入前取消；稿件未发生替换。');
        }
        if (completed.kind !== 'replacement' || completed.result !== null) throw new Error('冻结匹配复核结果绑定无效。');
        return api.commitReplacement({ previewId });
      }, async (result) => {
        await invalidateSearchState('稿件已替换；先前搜索结果和返回位置已失效。', result.previewId);
        await loadOutline(null, true);
      });
      if (!replacement) {
        if (!authoritativeMutation) {
          try {
            await invalidateSearchState('替换未提交；先前预览已关闭，请重新查找后再试。');
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法关闭未提交的替换预览。'), 'error');
          }
        }
        return;
      }
      setStatus(replacement.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '替换提交未完成。'), 'error');
    }
  }

  async function saveMilestone(): Promise<void> {
    if (authoritativeMutationBusy() || !editor) return;
    const purposeKind = chosenPurpose();
    const blockers = milestoneBlockers();
    if (purposeKind === null || blockers.length > 0) {
      setStatus(milestoneSaveReason(blockers) ?? '里程碑未保存。', 'error');
      (milestoneName.value.trim() === '' ? milestoneName : purposeKind === null ? purposeRadios[0]! : customPurpose).focus();
      return;
    }
    try {
      const saved = await runAuthoritativeMutation(() => {
        const binding = editor!.currentWindow();
        // A frozen purpose carries no words of its own; 自行输入 carries the editor's (Issue #414).
        return api.saveMilestone({
          manuscriptId: binding.manuscriptId,
          branchId: binding.branchId,
          label: milestoneName.value,
          purposeKind,
          purpose: purposeKind === 'custom' ? customPurpose.value : null,
          note: note.value,
        });
      }, async () => {
        milestoneSection.open = false;
        resetMilestoneForm(authoritativeMutationBusy());
        await invalidateSearchIfStale('稿件修订版已变化；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (!saved) return;
      refreshMilestonePersistence(true);
      setStatus(saved.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '里程碑未保存。'), 'error');
    }
  }

  async function runHistory(action: 'undo' | 'redo'): Promise<void> {
    if (authoritativeMutationBusy() || !editor) return;
    try {
      const result = await runAuthoritativeMutation(() => {
        const binding = editor!.currentWindow();
        const input = {
          manuscriptId: binding.manuscriptId,
          branchId: binding.branchId,
          expectedWorkingDigest: binding.workingDigest,
        };
        return action === 'undo' ? api.undoManuscript(input) : api.redoManuscript(input);
      }, async () => {
        await invalidateSearchIfStale('稿件历史状态已变化；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (!result) return;
      setStatus(result.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, `${action === 'undo' ? '撤销' : '重做'}未完成。`), 'error');
    }
  }

  positionRail.addEventListener('change', () => void navigate({ kind: 'proportion', proportion: Number(positionRail.value) / 1_000_000 }));
  milestoneName.addEventListener('input', () => syncMilestoneForm(authoritativeMutationBusy()));
  for (const radio of purposeRadios) radio.addEventListener('change', () => syncMilestoneForm(authoritativeMutationBusy()));
  customPurpose.addEventListener('input', () => syncMilestoneForm(authoritativeMutationBusy()));
  editorWindow.addEventListener('scroll', () => {
    // Paging at an edge answers the reader's scroll. A position the editor restored itself — after an
    // arrival, a journal acknowledgement or an authoritative refresh — is not that, even when it rests
    // at the pane's top or bottom: the guards below lapse as soon as their operation ends, which can be
    // a frame before the restore's own `scroll` event arrives (#474). The Mark surface moves the pane too:
    // a card brought into view, or the pane settling once a card's height is gone.
    if (authoritativeMutationBusy() || edgeNavigation || editor?.isComposing() || editor?.isOwnScroll() || editorialMarks?.ownsScroll()) return;
    const atStart = editorWindow.scrollTop <= 0 && currentWindow.previousCursor !== null;
    const atEnd = editorWindow.scrollTop + editorWindow.clientHeight >= editorWindow.scrollHeight - 1 && currentWindow.nextCursor !== null;
    if (!atStart && !atEnd) return;
    void navigateCursor(atStart ? 'previous' : 'next');
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !authoritativeMutationBusy() && !serviceJobBusy()) {
      event.preventDefault();
      void runSearch();
    }
  });

  async function refreshMarks(): Promise<boolean> {
    if (!editor) return true;
    if (authoritativeMutationBusy() || edgeNavigation || editor.isComposing()) return false;
    if (!(await settleLocalEdit()) || !editor) return false;
    const binding = editor.currentWindow();
    const first = binding.blocks[0];
    if (first === undefined) return true;
    const next = await api.getManuscriptWindowAt({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, target: { kind: 'window-start', blockId: first.blockId } });
    if (!editor) return true;
    // A save or a navigation that landed during the read makes the answer older than the screen: ask again (final review P3-1).
    if (editor.currentWindow() !== binding) return false;
    const step = marksRefreshStep(editor.currentWindow(), next, {
      floating: editorialMarks?.holdsFloating() === true,
      editor: authoritativeMutationBusy() || edgeNavigation || editor.isComposing(),
    });
    if (step === 'set-marks') {
      // The text is the text on screen: only the marks are new, so nothing open over the text is touched (review P2-7).
      editor.setMarks(next.marks, next.marksTruncated);
      manuscriptRail?.refresh();
      const refreshed = [...(editorHost.dataset['marksRefreshed'] ?? '').split(',').filter((entry) => entry.length > 0), 'review-settled'].slice(-12);
      editorHost.dataset['marksRefreshed'] = refreshed.join(',');
      return true;
    }
    // The window itself moved on: it is loaded again only once nothing is open over the text, with the place taken now (P3-3).
    if (step === 'wait') return false;
    const continuity = editor.captureContinuity();
    windowLoadCause = 'review-settled';
    let loaded: boolean;
    try {
      loaded = editor.loadWindow(next, continuity);
    } finally {
      windowLoadCause = 'unnamed';
    }
    if (!loaded) return false;
    currentWindow = next;
    updateWindowChrome();
    return true;
  }

  async function jump(target: { blockId: string; markId: string | null }): Promise<boolean> {
    // The paragraph must stand in the manuscript before any return place is kept (Issue #423 review, P2-1): the words typed
    // just now are written first, so the read sees the manuscript as the editor has it, and a paragraph that is gone throws
    // here — to the caller's wording — leaving the return place, the chip and the window exactly as they were.
    if (!editor || !(await settleLocalEdit())) return false;
    const binding = editor.currentWindow();
    await api.getManuscriptWindowAt({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, target: { kind: 'block', blockId: target.blockId } });
    // A move `navigate` would refuse without a word — a write in flight, a navigation under way — keeps and paints no return place (review P3-B).
    if (destroyed || authoritativeMutationBusy() || edgeNavigation) return false;
    const here = readingPlace();
    if (here !== null && here.blockId !== target.blockId) {
      const request = ++returnRequest;
      try {
        const retained = await preserveReturnPlace(here);
        if (!chipHost.isConnected || request !== returnRequest) return false;
        returnPlace = retained;
        returnReadFailed = false;
      } catch (error) {
        if (!chipHost.isConnected || request !== returnRequest) return false;
        returnReadFailed = true;
        paintReturnChip();
        setStatus(rendererErrorMessage(error, '无法保存返回位置，尚未跳转。'), 'error');
        return false;
      }
    }
    if (!(await navigate({ kind: 'block', blockId: target.blockId }))) { paintReturnChip(); return false; }
    if (!chipHost.isConnected) return false;
    paintReturnChip();
    if (target.markId !== null && editorialMarks !== undefined) await editorialMarks.openMark(target.markId);
    else landAt(target.blockId);
    return true;
  }

  editor = mountBoundedEditor({
    host: editorHost,
    scrollContainer: editorWindow,
    platform: api.platform,
    initialWindow,
    flushJournalEdit: (input) => api.flushJournalEdit(input),
    onStateChange: (state) => {
      const closeRisk = authoritativeMutationBusy() || state.dirty || state.saving || state.retryRequired || (state.interrupted && state.dirty) ||
        (state.protection?.atRisk.characters ?? 0) > 0;
      // A write still in flight when the screen left settles the window's close risk; nothing on the departed screen changes.
      if (destroyed) {
        setCloseRisk(closeRisk);
        return;
      }
      dirty = state.dirty;
      saving = state.saving;
      retryRequired = state.retryRequired;
      editingInterrupted = state.interrupted;
      updatePersistenceMenu();
      save.disabled = authoritativeMutationBusy() || !state.dirty || state.saving || state.interrupted;
      journal.textContent = `修订日志序号 ${state.journalSequence}`;
      // Editing Protection Mode (Issue #951): the header's protection surface, and the close guard while input is at risk (DUR-010).
      protectionSurface?.update(state.protection);
      setCloseRisk(closeRisk);
      if (editor) {
        const editorWindowProjection = editor.currentWindow();
        const bindingChanged = editorWindowProjection.revisionId !== currentWindow.revisionId ||
          editorWindowProjection.journalSequence !== currentWindow.journalSequence ||
          editorWindowProjection.workingDigest !== currentWindow.workingDigest;
        if (bindingChanged) {
          currentWindow = editorWindowProjection;
          updateWindowChrome();
          void loadOutline(null);
          scheduleRailRefresh();
        }
        if (!authoritativeMutationBusy() && searchStateIsStale()) {
          void invalidateSearchState('稿件状态已变化；先前搜索结果、替换预览和查找返回位置已失效。').catch((error) => {
            setStatus(rendererErrorMessage(error, '无法取消已失效的替换预览。'), 'error');
          });
        }
      }
    },
    onAnnouncement: setStatus,
    onCommand: (command) => {
      if (command === 'search' || command === 'replace') {
        setNavigationOpen(true);
        (command === 'search' ? searchInput : replacementInput).focus();
      }
      else if (command === 'undo' || command === 'redo') void runHistory(command);
      else void navigateCursor(command === 'previous-window' ? 'previous' : 'next');
    },
    // A window loaded keeps an open composer below its paragraph while it is still there (Issue #423 review, P2-3), and says what
    // loaded it — an authoritative refresh, or a navigation by its target — in the editor's `data-window-loads` (the last 12).
    onWindowLoaded: () => {
      analysisPositionSource = 'caret';
      localParagraphPanel?.refresh();
      editorialMarks?.reanchor();
      const loads = [...(editorHost.dataset['windowLoads'] ?? '').split(',').filter((entry) => entry.length > 0), windowLoadCause].slice(-12);
      editorHost.dataset['windowLoads'] = loads.join(',');
    },
  });
  // 查找, 查找结果 and 聚焦稿件 (Issue #936, plan slice 11c; KEY-002): the remappable commands of the manuscript on screen. The
  // dispatcher's Command Guard holds each back while an input method composes; they leave with the screen.
  editorCommandsOff = commandDispatcher.register({
    'search.find': () => {
      setNavigationOpen(true);
      searchInput.focus();
    },
    'search.next': () => {
      if (!nextResults.hidden) nextResults.click();
    },
    'search.previous': () => {
      if (!previousResults.hidden) previousResults.click();
    },
    'view.focusManuscript': () => editor?.focus(),
    // 专注模式 (Issue #951; ED-004): the same toggle as the header's 专注.
    'view.focusMode': () => focusMode.toggle(),
  });
  // Typing moves every place behind the caret a little; the rail is read again once the typing rests,
  // never per keystroke, and its cost follows the chapters and marks, not the manuscript's length.
  const scheduleRailRefresh = (): void => {
    if (railRefreshTimer !== undefined) window.clearTimeout(railRefreshTimer);
    railRefreshTimer = window.setTimeout(() => {
      railRefreshTimer = undefined;
      manuscriptRail?.refresh();
    }, 1_200);
  };
  manuscriptRail = mountPositionRail({
    track: railTrack,
    api: api,
    binding: () => ({ manuscriptId: currentWindow.manuscriptId, branchId: currentWindow.branchId }),
    // A marker's paragraph gone between the rail's read and the click is said as the service says it.
    jumpToBlock: (blockId) => void surface.jump({ blockId, markId: null }).catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法移动到该稿件位置。'), 'error')),
    onError: (error) => setStatus(rendererErrorMessage(error, '全稿位置轨未能更新。'), 'error'),
  });
  manuscriptRail.setPosition(initialWindow.position.proportion);
  manuscriptRail.refresh();
  editorialMarks = mountEditorialMarks({
    scroll: editorWindow,
    host: editorHost,
    editor,
    api: api,
    busy: () => authoritativeMutationBusy() || serviceJobBusy(),
    // A mark changes what a Production Document's workflow waits on (N 条修改建议待处理), which its lens reads again.
    marksChanged: () => {
      manuscriptRail?.refresh();
      documentLens?.refresh();
    },
    openReviewFinding: (target) => void leaveForReview({ reviewRunId: target.reviewRunId, findingId: target.findingId }),
    openConflict: (markId) => void leaveForConflict(markId),
    openProposalWorkspace: () => void (async () => {
      try { if (!(await settleLocalEdit())) return; await rememberEntryPosition();
      if (destroyed) return;
      renderProposalWorkspace({ manuscriptId: currentWindow.manuscriptId, branchId: currentWindow.branchId, resultId: null }, initialWindow.bookId, bookTitle); }
      catch (error) { setStatus(rendererErrorMessage(error, '无法打开提案审阅工作区。'), 'error'); }
    })(),
    // 书系知识 (Issue #63, S28b): a member Book's manuscript offers its selected words to each Series it is in; a Production
    // Document offers nothing of 书系.
    ...(isDocument ? {} : {
      seriesOf: (after) => api.inspectBookSeries({ bookId: initialWindow.bookId, membershipsAfter: after }),
      proposeSeriesKnowledge: (input: ProposeSeriesKnowledgeInput) => api.proposeSeriesKnowledge(input),
    }),
    // 就这段提问… (Issue #52, S17a): the Book's manuscript only; its dialogue comes to the foreground in the side slot.
    ...(isDocument ? {} : {
      askAboutSelection: (input: AskAboutSelectionInput) => api.askAboutSelection(input),
      onAsked: (dialogue: DialogueProjection) => taskDrawer.openDialogue(dialogue.bookId, dialogue.dialogueId, () => editorHost.querySelector<HTMLElement>('.ProseMirror')),
      // 润色这段 (Issue #842): the Book's manuscript only; the request is read again until it settles, and the new 修改建议 are
      // drawn from the window as the service holds it then.
      polish: {
        routes: () => api.inspectFastInteractionRoutes(),
        polish: (input: PolishSelectionInput) => api.polishSelection(input),
        inspect: async (taskId: string) => {
          const read = await api.inspectFastInteractionRequest({ requestId: taskId });
          if (read.kind !== 'editorial-polish') throw new Error('润色的结果不属于这次请求。');
          return read.polish;
        },
        marks: async () => {
          const shown = currentWindow;
          const read = await api.getManuscriptWindowAt({
            manuscriptId: shown.manuscriptId, branchId: shown.branchId, target: { kind: 'window-start', blockId: shown.blocks[0]!.blockId },
          });
          return read.blocks[0]?.blockId === shown.blocks[0]?.blockId ? { journalSequence: read.journalSequence, marks: read.marks, truncated: read.marksTruncated } : null;
        },
      },
      // 就这段发起任务… (Issue #423, S77b): the Book's manuscript only; the prepared Task's plan opens in the side slot.
      startTaskOnSelection: {
        bookTitle,
        choices: selectionTaskOffer,
        procedures: selectionProcedureOffer,
        // The Context-bound Task Composer (Issue #423, slice 7a; TASK-001): exactly the selected words, in the side slot.
        compose: (reading: SelectionSpanReading) => taskDrawer.openComposer({
          bookId: initialWindow.bookId,
          bookTitle,
          origin: 'composer-selection',
          manuscript: { revisionLabel: reading.revisionLabel, journalSequence: reading.journalSequence, pending: false },
          ranges: [composerRangeOf(reading)],
        }, () => editorHost.querySelector<HTMLElement>('.ProseMirror')),
        prepare: (choice: SelectionTaskChoice, anchor: { readonly blockId: string }, chosenApart: ReadonlyArray<string>) =>
          prepareSelectionTask(initialWindow.bookId, choice, anchor, chosenApart, () => editorHost.querySelector<HTMLElement>('.ProseMirror')),
      },
    }),
    // An Apply is an authoritative write like a replacement or an undo: the window is reloaded from the
    // service and must show exactly the manuscript state the Effect Receipt names.
    writeManuscript: async (operation, done) => {
      const written = await runAuthoritativeMutation(async () => {
        const result = await operation();
        return { ...result, ...result.application.after, completionLabel: done };
      }, async () => {
        await invalidateSearchIfStale('稿件已由应用写入；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (written) setStatus(done, 'success');
      manuscriptRail?.refresh();
      return written;
    },
    setStatus,
    errorMessage: rendererErrorMessage,
  });
  updateWindowChrome();
  void loadOutline(null);
  editor.focus();
  // Arriving is itself a position worth remembering: a manuscript opened and then left by closing the
  // product never reaches an exit this surface can see, and the entry is what should answer then.
  void rememberEntryPosition();
  setStatus(`稿件窗口已打开；${initialWindow.position.label}。`);
  // 审阅's 回到原文 arrives at a finding's mark: its card opens as a click on it would.
  if (openMarkId !== undefined) void editorialMarks.openMark(openMarkId);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    reviewMarksFollower += 1;
    for (const timer of entryNoticeTimers) window.clearTimeout(timer);
    entryNoticeTimers.clear();
    if (reviewMarksTimer !== undefined) window.clearTimeout(reviewMarksTimer);
    if (scrollingTimer !== undefined) window.clearTimeout(scrollingTimer);
    if (milestonePersistenceTimer !== undefined) window.clearTimeout(milestonePersistenceTimer);
    if (railRefreshTimer !== undefined) window.clearTimeout(railRefreshTimer);
    milestonePersistenceRead += 1;
    returnRequest += 1;
    editorialMarks?.destroy();
    editorialMarks = undefined;
    manuscriptRail?.destroy();
    manuscriptRail = undefined;
    protectionSurface?.destroy();
    protectionSurface = undefined;
    supportingSeparator?.destroy();
    supportingSeparator = undefined;
    editorModes?.destroy();
    editorModes = undefined;
    editor?.destroy();
    editor = undefined;
    editorCommandsOff?.();
    editorCommandsOff = undefined;
    localParagraphPanel?.destroy();
    localParagraphPanel = undefined;
    paragraphSelectionOff?.();
    paragraphSelectionOff = undefined;
    persistenceStatus.removeEventListener('click', toggleSaveMenu);
    persistenceStatus.removeEventListener('keydown', saveMenuKeydown);
    saveMenu?.destroy();
    persistenceStatus.setAttribute('role', 'status');
    persistenceStatus.removeAttribute('tabindex');
    persistenceStatus.removeAttribute('aria-controls');
    persistenceStatus.removeAttribute('aria-expanded');
  }

  function followReviewMarks(bookId: string, reviewRunId: string | undefined): void {
    if (destroyed || initialWindow.bookId !== bookId || reviewRunId === undefined) return;
    if (reviewMarksTimer !== undefined) window.clearTimeout(reviewMarksTimer);
    const mine = ++reviewMarksFollower;
    const deadline = Date.now() + REVIEW_MARKS_FOLLOW_LIMIT_MS;
    let wait = 1_000;
    const following = (): boolean => !destroyed && mine === reviewMarksFollower;
    // Asked again more slowly the longer the editor keeps something open over the text (final review P3-2).
    let bringWait = 1_000;
    const bring = (): void => {
      if (!following()) return;
      const again = (): void => {
        if (!following()) return;
        reviewMarksTimer = window.setTimeout(bring, bringWait);
        bringWait = Math.min(5_000, bringWait + 1_000);
      };
      void surface.refreshMarks().then((done) => {
        if (!done) again();
      }, again);
    };
    const step = (): void => {
      if (!following()) return;
      if (Date.now() > deadline) {
        setStatus(REVIEW_MARKS_FOLLOW_STOPPED, 'success');
        return;
      }
      void api.inspectReviewWorkspace({ reviewRunId, findingsAfterOrdinal: Number.MAX_SAFE_INTEGER }).then(
        (workspace) => {
          if (!following()) return;
          const state = workspace.run?.reviewRunId === reviewRunId ? workspace.run.state : null;
          // Only a Run that was started is followed: a plan reconfirmed or a rule set leaves it prepared.
          if (state === 'prepared' || state === null) return;
          if (state === 'running') {
            reviewMarksTimer = window.setTimeout(step, wait);
            wait = Math.min(5_000, wait + 1_000);
            return;
          }
          bring();
        },
        () => { if (following()) reviewMarksTimer = window.setTimeout(step, 2_000); },
      );
    };
    step();
  }
}
