
import { navigation, type NavigationCheckpoint } from './navigation-generation.js';
import { technicalWords, technicalLayerVisible } from './technical-layer.js';
import type { BookRecordPresentation, BookSummaryFilter, BookSummaryPageProjection, BookWorkbenchRoute, BookWorkOverviewProjection, ImportCommitProjection, ManuscriptReimportCommitProjection, ReimportUnfollowedMarkProjection, ManuscriptWindowProjection, PriorWorkItemProjection, ResolvedBookWorkbenchRoute, StagedImportProjection } from '../shared/protocol.js';
import { MAX_BOOK_SUMMARY_FILTER_CHARACTERS } from '../shared/protocol.js';
import { MARK_KIND_LABELS } from './editorial-mark-labels.js';
import { BOOK_FILTER_ACTIONS, BOOK_FILTER_FIELD_LABEL, BOOK_FILTER_FIELDS, BOOK_FILTER_LEGEND, BOOK_FILTER_NONE, BOOK_FILTER_STATUS_LINES, BOOK_FILTER_TEXT_LABEL, bookCardPeopleLine, bookCardRelatedLine, bookFilterLine } from './book-people-labels.js';
import type { ProductionDocumentContext } from './production-document-lens.js';
import { showOnboardingCard } from '../shared/preferences.js';
import { appendFirstRunSteps, firstReviewBook, firstRunModelConnected } from './onboarding-steps.js';
import { type ShellPlace } from './shell.js';
import { FIRST_RUN_CARD_LABELS } from './onboarding-labels.js';
import { SHELL_LABELS } from './shell-labels.js';
import { type RecoveryReturnContext } from './import-review.js';
import type { RendererApi } from '../shared/protocol.js';

interface Options {
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  button: (label: string, className: "primary" | "secondary" | "quiet", action: () => void | Promise<void>) => HTMLButtonElement;
  setStatus: (message: string, tone?: "busy" | "success" | "error") => void;
  api: RendererApi & import("../shared/preferences.js").PreferencesRendererApi & import("../shared/appearance.js").AppearanceRendererApi & import("../shared/preferences.js").NotificationsRendererApi;
  rendererErrorMessage: (error: unknown, fallback: string) => string;
  panel: () => HTMLElement;
  renderBookCreationForm: () => void;
  renderTargetChoice: (staged: StagedImportProjection, selectedChoiceId: StagedImportProjection["targetChoices"][number]["id"] | null, recoveryNotice?: string, recoveryReturn?: RecoveryReturnContext, relationshipSelection?: ("first-manuscript" | "source-only" | "reimport") | null, reuseSourceVersionId?: string | null | undefined, reimportLineageChoice?: string | undefined) => void;
  renderError: (error: unknown, retry: () => void) => void;
  renderDataAndStorage: () => Promise<void>;
  startReview: (bookId: string, title: string) => void;
  renderModelServiceSettings: (focus?: "search") => Promise<void>;
  authorityInterrupted: boolean;
  leaveThen: (open: () => Promise<void>) => Promise<void>;
  renderHelp: () => void;
  bookCardOpen: (titleWords: string, stateWords: string, run: () => Promise<void>) => HTMLButtonElement;
  requestBookWorkbenchRoute: (route: BookWorkbenchRoute, onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>, recoveryReturn?: RecoveryReturnContext, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  bookCardAction: (words: string) => HTMLElement;
  bookIdentityDisclosure: (book: { bookId: string; stableIdentity: string; }) => HTMLElement;
  returnToRecoveryComparison: (attentionId: string, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  appendRecoveryReturnAction: (content: HTMLElement, context: RecoveryReturnContext | undefined) => void;
  replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  screen: HTMLElement;
  settleScreen: () => Promise<boolean>;
  renderEditorWindow: (initialWindow: ManuscriptWindowProjection, bookTitle: string, recoveryAttentionId?: string, entryNotice?: string, openMarkId?: string, reimport?: ManuscriptReimportCommitProjection, productionDocument?: ProductionDocumentContext) => void;
  statusRevision: number;
  acknowledgeCompletionAfterPaint: (result: ImportCommitProjection) => Promise<boolean>;
  renderBookOverview: (overview: BookWorkOverviewProjection, completion?: Exclude<ImportCommitProjection, ManuscriptReimportCommitProjection>, recoveryReturn?: RecoveryReturnContext) => void;
  recordPresentation: (record: BookRecordPresentation) => HTMLElement;
}

export function createLibraryScreen(state: Options) {
  const { element, button, setStatus, api, rendererErrorMessage, panel, renderBookCreationForm, renderTargetChoice, renderError, renderModelServiceSettings, leaveThen, renderHelp, bookCardOpen, requestBookWorkbenchRoute, bookCardAction, bookIdentityDisclosure, returnToRecoveryComparison, appendRecoveryReturnAction, replaceScreen, screen, settleScreen, renderEditorWindow, acknowledgeCompletionAfterPaint, renderBookOverview, recordPresentation } = state;


/**
 * 书库's search (Issue #431, S83; IA-008, BOOK-006): one field — or 书名, 作者 and 责编 together — and the words, read by
 * the service over every Book, paged as the list is. 显示全部图书 goes back to the whole list.
 */
function renderBookFilter(
  priorWork: ReadonlyArray<PriorWorkItemProjection>,
  recoveryReturn: RecoveryReturnContext | undefined,
  filter: BookSummaryFilter | null,
  refresh = { request: 0 },
): HTMLElement {
  const form = element('form', 'book-filter');
  form.noValidate = true;
  const legend = element('p', 'book-filter-legend', BOOK_FILTER_LEGEND);
  const fieldLabel = element('label', undefined, BOOK_FILTER_FIELD_LABEL);
  const field = element('select');
  field.id = 'book-filter-field';
  for (const key of ['all', 'title', 'author', 'editor', 'series'] as const) {
    const option = element('option', undefined, BOOK_FILTER_FIELDS[key]);
    option.value = key;
    field.append(option);
  }
  field.value = filter?.field ?? 'all';
  fieldLabel.append(field);
  const textLabel = element('label', undefined, BOOK_FILTER_TEXT_LABEL);
  const text = element('input');
  text.id = 'book-filter-text';
  text.type = 'search';
  // The service reads at most this many characters; a longer paste is cut here rather than refused as a bad request.
  text.maxLength = MAX_BOOK_SUMMARY_FILTER_CHARACTERS;
  text.value = filter?.text ?? '';
  textLabel.append(text);
  const find = button(BOOK_FILTER_ACTIONS.find, 'secondary', () => undefined);
  find.type = 'submit';
  find.dataset['bookFilterAction'] = 'find';
  let clearControl: HTMLButtonElement | null = null;
  const sync = (): void => { find.disabled = text.value.trim().length === 0; };
  const restoreControls = (): void => {
    sync();
    if (clearControl !== null) clearControl.disabled = false;
  };
  text.addEventListener('input', sync);
  sync();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const words = text.value.trim();
    if (words.length === 0 || find.disabled) return;
    const next: BookSummaryFilter = {
      field: field.value === 'title' || field.value === 'author' || field.value === 'editor' || field.value === 'series' ? field.value : 'all',
      text: words,
    };
    find.disabled = true;
    const current = ++refresh.request;
    setStatus(BOOK_FILTER_STATUS_LINES.finding, 'busy');
    void api.listBooks({ after: null, filter: next }).then(
      async (page) => {
        if (!form.isConnected || current !== refresh.request) return;
        const paint = navigation.route();
        await renderLanding(priorWork, recoveryReturn, page, next, () => current === refresh.request);
        if (!paint.isCurrent() || current !== refresh.request) return;
        setStatus(BOOK_FILTER_STATUS_LINES.found, 'success');
        document.querySelector<HTMLElement>('#book-filter-text')?.focus();
      },
      (error) => {
        if (!form.isConnected || current !== refresh.request) return;
        restoreControls();
        setStatus(rendererErrorMessage(error, BOOK_FILTER_STATUS_LINES.findFailed), 'error');
      },
    );
  });
  const row = element('div', 'button-row compact-actions');
  row.append(find);
  if (filter !== null) {
    const clear = button(BOOK_FILTER_ACTIONS.clear, 'quiet', () => {
      clear.disabled = true;
      const current = ++refresh.request;
      void api.listBooks({ after: null }).then(
        async (page) => {
          if (!form.isConnected || current !== refresh.request) return;
          const paint = navigation.route();
          await renderLanding(priorWork, recoveryReturn, page, null, () => current === refresh.request);
          if (!paint.isCurrent() || current !== refresh.request) return;
          setStatus(BOOK_FILTER_STATUS_LINES.cleared, 'success');
          document.querySelector<HTMLElement>('#book-filter-text')?.focus();
        },
        (error) => {
          if (!form.isConnected || current !== refresh.request) return;
          restoreControls();
          setStatus(rendererErrorMessage(error, BOOK_FILTER_STATUS_LINES.findFailed), 'error');
        },
      );
    });
    clear.dataset['bookFilterAction'] = 'clear';
    clearControl = clear;
    row.append(clear);
  }
  form.append(legend, fieldLabel, textLabel, row);
  return form;
}

async function renderLanding(
  priorWork: ReadonlyArray<PriorWorkItemProjection>,
  recoveryReturn: RecoveryReturnContext | undefined,
  books: BookSummaryPageProjection,
  // 书库's search (Issue #431, S83): the list shows only the Books it found, until 显示全部图书.
  filter: BookSummaryFilter | null = null,
  requestIsCurrent: () => boolean = () => true,
): Promise<void> {
  const current = navigation.route();
  const bookCount = books.items.length + Number(books.nextCursor !== null);
  const onboardingData = filter === null && bookCount <= 1
    ? await Promise.all([api.getPreferences(), api.getProductDataLocation(), api.getModelServiceSettings().catch(() => null)]).catch(() => null)
    : null;
  if (!current.isCurrent() || !requestIsCurrent()) return;

  const recoveryWork = priorWork.find((item) => item.recoveryAttention !== null);
  const recoveryAttention = recoveryWork?.recoveryAttention;
  const inferredRecoveryReturn = recoveryWork && recoveryAttention
    ? {
        attentionId: recoveryAttention.attentionId,
        attentionVersion: recoveryAttention.attentionVersion,
        bookTitle: recoveryWork.bookTitle,
      } satisfies RecoveryReturnContext
    : undefined;
  const activeRecoveryReturn = recoveryReturn ?? inferredRecoveryReturn;
  const content = panel();
  const refresh = { request: 0 };
  // 书库 (Issue #934; editor-surfaces §8.2): the sidebar's destination for every Book, with the two ways a Book begins. The
  // screen keeps its state name `landing`, the window's first screen, which every Journey waits for.
  content.classList.add('library-home');
  const copy = element('div');
  copy.append(
    element('p', 'section-label', SHELL_LABELS.library),
    element('h2', undefined, SHELL_LABELS.libraryTitle),
    element('p', 'lede', '新建一本空图书，或从本地 DOCX 导入稿件。也可将 DOCX 拖到这里。'),
  );
  const createBook = button('新建图书', 'secondary', renderBookCreationForm);
  const importButton = button('导入稿件', 'primary', async () => {
    importButton.disabled = true;
    setStatus('正在本地解析 DOCX…', 'busy');
    try {
      const result = await api.selectAndStageManuscript();
      if (result.status === 'cancelled') {
        importButton.disabled = false;
        setStatus('已取消文件选择');
        return;
      }
      setStatus('DOCX 已完成本地暂存', 'success');
      renderTargetChoice(result.staged, null, undefined, activeRecoveryReturn);
    } catch (error) {
      renderError(error, () => renderLanding(priorWork, activeRecoveryReturn, books));
    }
  });
  // 书系, 知识库 and 质量与学习 are the sidebar's destinations now, and 数据与存储, 模型服务 and 评估校准与预测 are rows of 设置
  // (Issue #934): the library keeps only what begins a Book.
  const landingActions = element('div', 'button-row');
  landingActions.append(importButton, createBook);
  copy.append(landingActions);
  content.append(copy);
  // Resolve the supporting card before the first paint so the Book list never jumps.
  const onboarding = element('section', 'onboarding-card');
  content.append(onboarding);
  if (onboardingData !== null && showOnboardingCard(bookCount, onboardingData[0].values['onboarding.state'])) {
    const [, location, modelSettings] = onboardingData;
    onboarding.dataset['onboardingCard'] = 'first-run';
    const labels = FIRST_RUN_CARD_LABELS;
    onboarding.append(element('h3', undefined, labels.title));
    const steps = element('ol', 'onboarding-steps');
    const reviewBook = firstReviewBook(books.items);
    appendFirstRunSteps(steps, element, button, {
      model: modelSettings !== null && firstRunModelConnected(modelSettings.roles) ? null : () => void renderModelServiceSettings(),
      ...(reviewBook ? { bookTitle: reviewBook.title } : {}),
      import: reviewBook ? null : () => importButton.click(),
      review: reviewBook ? () => void requestBookWorkbenchRoute({ kind: 'book', bookId: reviewBook.bookId }, async () => {
        state.startReview(reviewBook.bookId, reviewBook.title);
      }).catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法打开审阅。'), 'error')) : null,
    });
    if (technicalLayerVisible && location.runtimeForm === 'source-checkout') {
      const sample = button(labels.sampleImport, 'secondary', async () => {
        sample.disabled = true;
        setStatus('正在本地解析示例书…', 'busy');
        try {
          const result = await api.importBundledSampleBook();
          if (result.status === 'staged') {
            setStatus('示例书已完成本地暂存', 'success');
            renderTargetChoice(result.staged, null, undefined, activeRecoveryReturn);
          }
        } catch (error) {
          sample.disabled = false;
          setStatus(rendererErrorMessage(error, labels.sampleFailed), 'error');
        }
      });
      onboarding.append(sample);
    }
    const skip = button(labels.skip, 'quiet', async () => {
      skip.disabled = true;
      try {
        await api.savePreference({ key: 'onboarding.state', value: 'skipped' });
        onboarding.remove();
        setStatus(labels.skipped);
      } catch (error) {
        skip.disabled = false;
        setStatus(rendererErrorMessage(error, labels.skipFailed), 'error');
      }
    });
    const help = button('帮助', 'quiet', () => { if (!state.authorityInterrupted) void leaveThen(async () => renderHelp()); });
    help.dataset['onboardingHelp'] = 'true';
    onboarding.append(steps, help, skip);
    const warnings = [location.dataLocationException === null ? null : location.channelDescription, location.syncWarning].filter((line): line is string => line !== null);
    if (warnings.length > 0) {
      const note = element('p', 'field-note', `${warnings.map(line => line.replace(/。$/u, '')).join('；')}。`);
      note.append(button('查看数据与存储', 'quiet', () => void state.renderDataAndStorage()));
      onboarding.append(note);
    }
  }
  if (books.items.length > 0 || filter !== null) {
    const library = element('section', 'recent-work');
    library.dataset['bookFilter'] = filter === null ? 'none' : filter.field;
    library.append(element('h3', undefined, SHELL_LABELS.allBooks));
    library.append(renderBookFilter(priorWork, activeRecoveryReturn, filter, refresh));
    if (filter !== null) {
      const result = element('p', 'field-note');
      result.append(element('span', 'book-filter-line', bookFilterLine(filter)));
      if (books.items.length === 0) result.append('；', element('span', 'book-filter-none', BOOK_FILTER_NONE));
      library.append(result);
    }
    const list = element('div', 'recent-work-list');
    for (const summary of books.items) {
      const open = bookCardOpen(summary.title, summary.manuscriptStateLabel, async () => {
        const navigationRoute = navigation.begin();
        open.disabled = true;
        setStatus('正在打开图书…', 'busy');
        try {
          await requestBookWorkbenchRoute({ kind: 'book', bookId: summary.bookId }, undefined, activeRecoveryReturn, navigationRoute);
        } catch (error) {
          if (navigation.errorIsCurrent(error, navigationRoute)) setStatus(rendererErrorMessage(error, '无法打开图书。'), 'error');
        } finally { open.disabled = false; }
      });
      open.dataset['bookId'] = summary.bookId;
      const row = element('article', 'book-summary-item');
      row.append(open, bookCardAction('打开图书'));
      // 作者, 责编 and 相关人 on the card (Issue #431, S83; BOOK-006).
      const peopleLine = bookCardPeopleLine(summary.people);
      const relatedLine = bookCardRelatedLine(summary.people);
      const facts = element('p', 'book-people-line field-note');
      if (peopleLine !== null) facts.append(peopleLine);
      if (relatedLine !== null) facts.append(peopleLine === null ? '' : ' · ', element('span', 'book-related-line', relatedLine));
      if (summary.internalNumber !== null) facts.append(facts.childNodes.length === 0 ? '' : ' · ', `内部编号 ${summary.internalNumber}`);
      if (facts.childNodes.length > 0) row.append(facts);
      row.append(bookIdentityDisclosure(summary));
      list.append(row);
    }
    library.append(list);
    if (books.nextCursor) {
      const loadMore = button('加载更多图书', 'secondary', async () => {
        const current = navigation.begin();
        const request = ++refresh.request;
        loadMore.disabled = true;
        setStatus('正在读取下一页图书摘要…', 'busy');
        try {
          const page = await api.listBooks({ after: books.nextCursor, ...(filter === null ? {} : { filter }) });
          if (!current.isCurrent() || request !== refresh.request) return;
          await renderLanding(
            priorWork,
            activeRecoveryReturn,
            { items: [...books.items, ...page.items], nextCursor: page.nextCursor },
            filter,
            () => request === refresh.request,
          );
          if (!current.isCurrent() || request !== refresh.request) return;
          setStatus('已加载更多图书摘要', 'success');
        } catch (error) {
          loadMore.disabled = false;
          if (navigation.errorIsCurrent(error, current) && request === refresh.request) setStatus(rendererErrorMessage(error, '无法读取下一页图书摘要。'), 'error');
        } finally { loadMore.disabled = false; }
      });
      const loadMoreActions = element('div', 'button-row');
      loadMoreActions.append(loadMore);
      library.append(loadMoreActions);
    }
    content.append(library);
  }
  if (priorWork.length > 0) {
    const recent = element('section', 'recent-work');
    recent.append(element('h3', undefined, '最近稿件'));
    const list = element('div', 'recent-work-list');
    for (const item of priorWork) {
      const state = item.recoveryAttention ? '恢复待确认状态' : `当前稿件 ${item.revisionLabel}`;
      const context = `${item.totalCharacters.toLocaleString('zh-CN')} 字符${technicalWords(` · 修订日志 ${item.journalSequence}`)}${item.latestMilestone ? ` · 最近里程碑 ${item.latestMilestone.label}` : ''}`;
      const open = bookCardOpen(item.bookTitle, state, async () => {
        const current = navigation.begin();
        open.disabled = true;
        setStatus(item.recoveryAttention ? '正在打开稿件恢复比较…' : '正在重新打开本地稿件…', 'busy');
        try {
          if (item.recoveryAttention) {
            await returnToRecoveryComparison(item.recoveryAttention.attentionId, current);
            return;
          }
          // The startup return takes the Book route like 书库 does, rather than opening this
          // manuscript at its start: V2-UX-RET-002 asks both ways in to arrive at the same place, the
          // position the editor left, and one route is what keeps them from drifting apart.
          await requestBookWorkbenchRoute({ kind: 'book', bookId: item.bookId }, undefined, activeRecoveryReturn, current);
        } catch (error) {
          open.disabled = false;
          if (navigation.errorIsCurrent(error, current)) setStatus(rendererErrorMessage(error, '无法重新打开稿件。'), 'error');
        } finally { open.disabled = false; }
      });
      open.dataset['manuscriptId'] = item.manuscriptId;
      const row = element('article', 'recent-work-item');
      row.append(
        open,
        bookCardAction(item.recoveryAttention ? '返回恢复比较' : '继续编辑'),
        element('p', 'field-note book-card-facts', context),
        ...(item.recoveryAttention ? [element('p', 'attention-note', '该分支已稍后处理，普通编辑保持只读；请返回恢复比较作出决定。')] : []),
      );
      list.append(row);
    }
    recent.append(list);
    content.append(recent);
  }
  appendRecoveryReturnAction(content, activeRecoveryReturn);
  replaceScreen('landing', content);
  setStatus('准备就绪');
}

function installDropHandlers(): void {
let dropImportBusy = false;
screen.addEventListener('dragover', (event) => {
  if (['landing', 'editor', 'book-overview'].includes(screen.dataset['screen'] ?? '') && event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
screen.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];
  if (!file || !['landing', 'editor', 'book-overview'].includes(screen.dataset['screen'] ?? '')) return;
  event.preventDefault();
  if (dropImportBusy) return;
  if (!/\.docx$/iu.test(file.name)) {
    if (!screen.querySelector('[data-document-id]')) setStatus('请拖入 DOCX 格式的稿件。', 'error');
    return;
  }
  dropImportBusy = true;
  void (async () => {
    if (!await settleScreen()) return;
    const result = await api.stageDroppedManuscript(file);
    if (result.status === 'staged') {
      const bookId = screen.querySelector<HTMLElement>('.book-overview')?.dataset['bookId'];
      const choice = result.staged.targetChoices.find((item) => item.kind === 'existing-book' && item.bookId === bookId);
      renderTargetChoice(result.staged, choice?.id ?? null);
    }
  })().catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法导入拖入的 DOCX。'), 'error')).finally(() => { dropImportBusy = false; });
});

}

function renderImported(result: ImportCommitProjection, recoveryReturn?: RecoveryReturnContext): void {
  delete document.documentElement.dataset['ai7ImportCompletionPainted'];
  delete document.documentElement.dataset['ai7ImportCompletionAcknowledged'];
  if ('reimportRecordId' in result) {
    // A reimport returns to the manuscript (V2-UX-IMP-056; Issue #412, S63): the first import of a manuscript ends in
    // the Book Work Overview once, an update of it does not.
    navigation.present(() => renderEditorWindow(result.window, result.overview.book.title, recoveryReturn?.attentionId, undefined, undefined, result));
    // Frame presentation and acknowledgement IPC can finish after a newer status, including a refused 跳到所选文字
    // (Issue #807). Repeat the completion only if the status has not changed; the landing notice also keeps the result.
    const landingStatusRevision = state.statusRevision;
    void acknowledgeCompletionAfterPaint(result).then((acknowledged) => {
      if (acknowledged && state.statusRevision === landingStatusRevision) setStatus(result.completionLabel, 'success');
    });
    return;
  }
  navigation.present(() => renderBookOverview(result.overview, result, recoveryReturn));
}

/** How many graphemes of a mark's words the reimport notice quotes. */
const REIMPORT_NOTICE_WORDS = 40;

/** One mark a reimport could not follow: its kind, the paragraph it stood in, and its words, cut at a bound. */
function reimportUnfollowedLine(item: ReimportUnfollowedMarkProjection): string {
  const words = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(item.words), ({ segment }) => segment);
  const quoted = words.length > REIMPORT_NOTICE_WORDS ? `${words.slice(0, REIMPORT_NOTICE_WORDS).join('')}…` : item.words;
  return `${MARK_KIND_LABELS[item.kind]} · 原第 ${item.fromPosition} 段 · 「${quoted}」`;
}

/**
 * What a reimport came to, where the editor lands after it (Issue #412, S63; V2-UX-IMP-056, IMP-057): the result, how
 * many rows were resolved and marks followed, and — kept until the editor dismisses it — every mark that could not
 * follow the new file, with its words and where it stood. It carries the commit it reports, which the completion
 * acknowledgement reads.
 */
function reimportLandingSection(result: ManuscriptReimportCommitProjection): HTMLElement {
  const record = result.receipt;
  const section = element('section', 'reimport-landing');
  section.dataset['importCommitId'] = result.commitId;
  section.dataset['reimportResultKind'] = result.resultKind;
  section.dataset['reimportUnfollowedMarks'] = String(record.markOutcomes.unfollowed);
  section.setAttribute('role', 'status');
  section.append(
    element('h3', undefined, result.completionLabel),
    element('p', undefined, result.resultKind === 'changed'
      ? `${technicalWords(`已形成修订版 ${result.window.revisionLabel}`, '稿件已更新')}：${record.groups.count} 处变化按你选的动词对应，${record.markOutcomes.followed} 条标记已跟随到新文件中它们的文字。`
      : technicalWords('新文件与当前稿件逐段一致：已记录这次重新导入，没有创建新的修订版。', '新文件与当前稿件相同，没有需要更新的内容。')),
  );
  if (record.markOutcomes.unfollowed > 0) {
    const unlisted = record.markOutcomes.unfollowed - record.markOutcomes.items.length;
    section.append(element('p', 'attention-note',
      `${record.markOutcomes.unfollowed} 条标记未能跟随新文件：它们的文字已删去、改写或不止一处，已从正文移开并保留${unlisted > 0 ? `；另有 ${unlisted} 条未列出` : ''}。`));
    const list = element('ul', 'reimport-unfollowed');
    for (const item of record.markOutcomes.items) {
      const entry = element('li', undefined, reimportUnfollowedLine(item));
      entry.dataset['reimportUnfollowedMarkId'] = item.markId;
      list.append(entry);
    }
    section.append(list);
  }
  const detail = element('div', 'reimport-landing-record');
  const actions = element('div', 'button-row compact-actions');
  const view = button('查看稿件重新导入记录', 'secondary', () => detail.replaceChildren(recordPresentation(record)));
  view.dataset['viewReimportRecordId'] = result.reimportRecordId;
  const dismiss = button('知道了', 'quiet', () => section.remove());
  dismiss.dataset['dismissReimportLanding'] = result.commitId;
  actions.append(view, dismiss);
  section.append(actions, detail);
  return section;
}

return { renderBookFilter, renderLanding, renderImported, reimportUnfollowedLine, reimportLandingSection, installDropHandlers };
}
