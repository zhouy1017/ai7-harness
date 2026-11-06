import { mountKnowledgeBaseHome } from './knowledge-base-home.js';
import { filterChoices, stateTerm } from './components/controls.js';
import { EXEMPLARS_FILTER_EMPTY, EXEMPLAR_ELIGIBILITY_LABELS, exemplarTitle, exemplarKind, exemplarKindFilter, exemplarFacts, readersReportExemplarFacts, readersReportExemplarAdmission } from './knowledge-base-labels.js';
import { technicalLayerVisible, technicalWords } from './technical-layer.js';
import { mountEditableProcedureLibrary } from './procedure-library.js';
import { renderHouseReviewPreference, mountEditorialMemory } from './knowledge-base-memory.js';
import { mountEditQualitySignals } from './quality-learning.js';
import { renderEvaluationProfiles } from './evaluation-profiles.js';
import { exemplarImportButton, exemplarEligibility } from './imported-exemplars.js';
import type { DefaultExecutionRulesProjection, ExemplarBookProjection, ExemplarsProjection, KnowledgeProceduresProjection } from '../shared/protocol.js';
import { mountReviewGuidelines } from './review-guidelines.js';
import { mountLibraryMaterials } from './library-materials.js';
import { mountLearningMaterials } from './quality-learning.js';
import { mountFeedbackHistory } from './feedback-history.js';
import { mountLearningAudit } from './learning-audit.js';
import { LEARNING_AUDIT_HEADING, LEARNING_AUDIT_STATUS } from './learning-audit-labels.js';
import { FEEDBACK_HISTORY_HEADING, FEEDBACK_HISTORY_STATUS, LEARNING_HEADING, LEARNING_STATUS, QUALITY_LEARNING_LEDE, QUALITY_LEARNING_TABS, QUALITY_LEARNING_TABS_LABEL, QUALITY_LEARNING_TITLE, visibleQualityLearningTabs, type QualityLearningTab } from './quality-learning-labels.js';
import { PROCEDURES_HEADING, RULES_HEADING, artifactLine, EXEMPLARS_EMPTY, EXEMPLARS_MORE, EXEMPLARS_NONE_DELIVERED, EXEMPLARS_STATUS, EXEMPLAR_READERS_REPORT_ADMIT, EXEMPLAR_READERS_REPORT_STATUS, exemplarAttribution, exemplarDesignation, exemplarSkippedNote, GUIDELINE_STATUS, LIBRARY_STATUS, KNOWLEDGE_BASE_TABS_LABEL, KNOWLEDGE_BASE_TAB_VIEWS, KNOWLEDGE_BASE_TITLE, knowledgeBaseTabView, visibleKnowledgeBaseTabs, type KnowledgeBaseTab } from './knowledge-base-labels.js';
import { mountCapturedProcedures } from './captured-procedures.js';
import { mountCustomAnalysisDimensions } from './custom-analysis.js';
import { mountImportedSkills } from './imported-skills.js';
import { localInstantLabel } from './plan-preview-labels.js';
import type { ShellPlace } from './shell.js';
import type { RecoveryReturnContext } from './import-review.js';
import type { ReviewFocus } from './review-workspace.js';
import type { BookWorkbenchRoute, ResolvedBookWorkbenchRoute, FeedbackHistoryTarget } from '../shared/protocol.js';

/** The shell's helpers and routes used by 知识库 and 质量与学习. */
export interface KnowledgeBaseOptions {
  readonly rememberReturn: (node: HTMLElement, restore: () => void | Promise<void>) => void;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly rendererErrorMessage: (error: unknown, fallback: string) => string;
  readonly element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  readonly openWordSourceVersion: (bookId: string, sourceVersionId: string) => Promise<void>;
  readonly technicalDetails: (gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>) => HTMLElement;
  readonly panel: () => HTMLElement;
  readonly button: (label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>) => HTMLButtonElement;
  readonly leaveThen: (open: () => Promise<void>) => Promise<void>;
  readonly renderGlobalAgent: (dialogueId?: string) => Promise<void>;
  readonly returnToOrigin: () => Promise<void>;
  readonly initializeStartup: () => Promise<void>;
  readonly replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  readonly openFeedbackTarget: (target: FeedbackHistoryTarget, entryId: string) => Promise<void>;
  readonly openLearningMaterialSource: (bookId: string, materialKey: string) => Promise<void>;
  readonly requestBookWorkbenchRoute: (route: BookWorkbenchRoute, onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>, recoveryReturn?: RecoveryReturnContext) => Promise<void>;
  readonly renderBookDeliverables: (bookId: string, bookTitle: string, openCase?: { caseId: string; publicationVersionId: string; }, focusPackageVersionId?: string) => void;
  readonly renderBookEvaluation: (bookId: string, bookTitle: string, focus?: { recordId: string; riskId: string; }) => void;
  readonly renderBookAnalysis: (bookId: string, bookTitle: string) => void;
  readonly renderBookReview: (bookId: string, bookTitle: string, focus?: ReviewFocus | null, procedureId?: string | null) => void;
}

/** 知识库 and 质量与学习, moved verbatim from the shell (Issue #1235). */
export function createKnowledgeBase(options: KnowledgeBaseOptions) {
  const {
    setStatus, rendererErrorMessage, element, openWordSourceVersion, technicalDetails, panel, button, leaveThen, renderGlobalAgent, initializeStartup, returnToOrigin, replaceScreen, openFeedbackTarget, openLearningMaterialSource, requestBookWorkbenchRoute, renderBookDeliverables, renderBookEvaluation, renderBookAnalysis, renderBookReview,
  } = options;

  /**
   * 知识库 (Issue #427, plan slice S79a; editor-surfaces §8.4): its seven classes as tabs, in the specification's order, and the
   * chosen class below them. `tabFocused` keeps the keyboard on the tab list when a class was chosen from it; `materialId` is
   * the 资料库 item 待我处理 opened (Issue #427, S79c), shown with the decision it waits for in focus.
   */
  async function renderKnowledgeBase(tab: KnowledgeBaseTab | 'home' = 'home', tabFocused = false, materialId: string | null = null): Promise<void> {
    if (tab === 'home') {
      const content = panel();
      content.classList.add('knowledge-base');
      content.dataset['knowledgeTab'] = 'home';
      const home = element('div', 'knowledge-home');
      const back = element('div', 'button-row');
      back.append(button('返回', 'quiet', () => void returnToOrigin()));
      content.append(element('h2', undefined, KNOWLEDGE_BASE_TITLE), home, back);
      replaceScreen('knowledge-base', content);
      options.rememberReturn(content, () => renderKnowledgeBase());
      await mountKnowledgeBaseHome(home, window.ai7, technicalLayerVisible, (category) => void renderKnowledgeBase(category, true));
      if (content.isConnected) setStatus('知识库已打开');
      return;
    }
    if (!technicalLayerVisible && knowledgeBaseTabView(tab).developerOnly === true) {
      await renderKnowledgeBase();
      setStatus('该页在开发者模式下显示');
      return;
    }
    if (tab === 'rules') {
      const { content } = knowledgeBasePage(tab, tabFocused);
      setStatus('正在读取工序与规则…', 'busy');
      try {
        const [rules, procedures] = await Promise.all([window.ai7.inspectDefaultExecutionRules(), window.ai7.inspectKnowledgeProcedures()]);
        if (!content.isConnected || !technicalLayerVisible) return;
        renderKnowledgeBaseProjection(rules, tabFocused, procedures);
        setStatus('工序与规则已打开');
      } catch (error) {
        if (!content.isConnected || !technicalLayerVisible) return;
        setStatus(rendererErrorMessage(error, '无法读取工序与规则。'), 'error');
      }
      return;
    }
    const { content, panelNode } = knowledgeBasePage(tab, tabFocused);
    // 评估方案 (Issue #429, S81a; KB-001, EVAL-003, EVAL-005): the profile each 评估 version snapshots, and its use.
    if (tab === 'memory') {
      const preferenceHost = element('div'); const memoryHost = element('div');
      panelNode.append(preferenceHost, memoryHost);
      try {
        renderHouseReviewPreference(preferenceHost, await window.ai7.inspectHouseReviewPreference(), window.ai7);
        // 编辑记忆 (Issue #1082, F-05 part 1): explicit memory and the learning controls beside the delivered 本社审阅偏好.
        await mountEditorialMemory(memoryHost, window.ai7, openWordSourceVersion).catch((error: unknown) => {
          memoryHost.replaceChildren(element('p', 'field-note', rendererErrorMessage(error, '无法读取编辑记忆。')));
        });
        if (content.isConnected) setStatus('本社审阅偏好已打开');
      } catch (error) { setStatus(rendererErrorMessage(error, '无法读取本社审阅偏好。'), 'error'); }
      return;
    }
    if (tab === 'evaluation') {
      setStatus('正在读取评估方案…', 'busy');
      try {
        renderEvaluationProfiles(panelNode, await window.ai7.inspectEvaluationProfiles(), { api: window.ai7, status: setStatus, error: rendererErrorMessage });
        if (content.isConnected) setStatus('评估方案已打开');
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法读取评估方案。'), 'error');
      }
      return;
    }
    if (tab === 'exemplars') {
      setStatus(EXEMPLARS_STATUS.loading, 'busy');
      try {
        renderExemplars(panelNode, await window.ai7.inspectExemplars({ after: null }));
        if (content.isConnected) setStatus(EXEMPLARS_STATUS.opened);
      } catch (error) {
        setStatus(rendererErrorMessage(error, EXEMPLARS_STATUS.unavailable), 'error');
      }
      return;
    }
    // 资料库 (Issue #427, S79c; KB-007): the items the editor collected, their attribution and Learning Eligibility.
    if (tab === 'library') {
      setStatus(LIBRARY_STATUS.loading, 'busy');
      const surface = mountLibraryMaterials({
        root: panelNode, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, technicalDetails, focusMaterialId: materialId,
      });
      try {
        await surface.load();
        if (content.isConnected) setStatus(LIBRARY_STATUS.opened);
      } catch (error) {
        setStatus(rendererErrorMessage(error, LIBRARY_STATUS.unavailable), 'error');
      }
      return;
    }
    if (tab !== 'guidelines') {
      setStatus(`${knowledgeBaseTabView(tab).label}已打开`);
      return;
    }
    setStatus(GUIDELINE_STATUS.loading, 'busy');
    const surface = mountReviewGuidelines({ root: panelNode, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, technicalDetails });
    try {
      await surface.load();
      if (content.isConnected) setStatus(GUIDELINE_STATUS.opened);
    } catch (error) {
      setStatus(rendererErrorMessage(error, GUIDELINE_STATUS.unavailable), 'error');
    }
  }

  /**
   * 知识库 › 范例 (Issue #427, S79b; KB-004, KB-006): each published Book with who it is attributed to and when it was set as a
   * 发稿版本, and its delivered documents by type — each the version its latest delivery named, with its eligibility. The
   * Books come a page at a time; moving forward or back to the first page replaces the current bounded page.
   */
  function renderExemplars(root: HTMLElement, projection: ExemplarsProjection,
    filters = { kind: '', book: '', kinds: new Map<string, string>(), books: new Map<string, string>() },
    after: ExemplarsProjection['nextCursor'] = null): void {
    const surface = {
      api: window.ai7, status: setStatus, error: rendererErrorMessage,
      refresh: async () => {
        const next = await window.ai7.inspectExemplars({ after });
        if (!root.isConnected) return;
        root.replaceChildren();
        renderExemplars(root, next, filters, after);
      },
    };
    const importRow = element('div', 'button-row');
    importRow.append(exemplarImportButton(surface));
    root.append(importRow);
    const toolbar = element('div', 'exemplar-filters');
    const empty = element('p', 'exemplars-empty');
    root.append(toolbar);
    const list = element('div', 'exemplar-list');
    let pageBooks = projection.books;
    const drawFilters = () => {
      for (const book of pageBooks) {
        filters.books.set(book.bookId, book.bookTitle);
        for (const entry of [...book.exemplars, ...book.readersReports]) {
          const kind = exemplarKindFilter(entry);
          filters.kinds.set(kind, kind === 'readers-report' ? '审稿意见' : `工作文档 · ${entry.typeLabel}`);
        }
      }
      toolbar.replaceChildren();
      for (const [key, label, choices] of [
        ['kind', '范例类型', [['', '全部类型'], ...filters.kinds]],
        ['book', '来源图书', [['', '全部图书'], ...filters.books]],
      ] as const) {
        const control = filterChoices({ label, choices, value: filters[key], change: (value) => {
          filters[key] = value;
          append(pageBooks);
        } });
        control.dataset['exemplarFilter'] = key;
        toolbar.append(control);
      }
      if (projection.nextCursor !== null || after !== null) toolbar.append(element('p', 'field-note', '筛选当前页；可翻页继续查看。'));
    };
    const append = (books: ExemplarsProjection['books']): HTMLElement | null => {
      list.replaceChildren();
      let first: HTMLElement | null = null;
      let count = 0;
      for (const book of books) {
        if (filters.book && filters.book !== book.bookId) continue;
        const exemplars = book.exemplars.filter((entry) => !filters.kind || exemplarKindFilter(entry) === filters.kind);
        const reports = book.readersReports.filter((entry) => !filters.kind || exemplarKindFilter(entry) === filters.kind);
        if (filters.kind && exemplars.length === 0 && reports.length === 0) continue;
        const card = element('article', 'exemplar-book');
        card.dataset['bookId'] = book.bookId;
        card.dataset['exemplarCount'] = String(book.exemplars.length);
        card.dataset['exemplarWithdrawn'] = String(book.withdrawn);
        const context = element('p', 'field-note');
        const skipped = book.skipped ?? [];
        const hasExtra = book.exemplars.length + book.readersReports.length === 0 || skipped.length > 0;
        context.append(element('span', 'exemplar-attribution', exemplarAttribution(book).replace(/。$/u, '')), '；',
          element('span', 'exemplar-designation', hasExtra ? exemplarDesignation(book, localInstantLabel).replace(/。$/u, '') : exemplarDesignation(book, localInstantLabel)));
        if (book.exemplars.length + book.readersReports.length === 0 && skipped.length === 0) context.append(`；来自《${book.bookTitle}》 · ${EXEMPLARS_NONE_DELIVERED}`);
        if (skipped.length > 0) context.append('；', element('span', 'exemplars-skipped', exemplarSkippedNote(skipped)));
        const items = element('ul', 'exemplar-items');
        for (const exemplar of exemplars) {
          const item = element('li', 'exemplar-entry');
          const actions = element('div', 'exemplar-actions');
          actions.append(stateTerm(`学习准入：${EXEMPLAR_ELIGIBILITY_LABELS[exemplar.eligibility]}`));
          if (exemplar.imported) actions.append(exemplarEligibility(surface, exemplar));
          const heading = element('div', 'exemplar-heading');
          const badge = stateTerm(exemplarKind(exemplar)); badge.classList.add('exemplar-kind-badge');
          heading.append(badge, element('strong', 'exemplar-title', exemplarTitle(book, exemplar)), actions);
          item.append(heading, element('p', 'field-note exemplar-context', `来自《${book.bookTitle}》（${exemplarAttribution(book)}） · ${exemplarFacts(exemplar, localInstantLabel)}`));
          item.dataset['exemplarDocument'] = exemplar.documentId;
          item.dataset['exemplarType'] = exemplar.typeId;
          item.dataset['exemplarVersion'] = String(exemplar.version);
          item.tabIndex = -1;
          first ??= item;
          count++;
          items.append(item);
        }
        if (exemplars.length > 0) card.append(items);
        // A damaged imported version is named and skipped while the rest of the Book stays listed (Issue #800).
        const reportItems = readersReportExemplars({ ...book, readersReports: reports }, (next) => {
          pageBooks = pageBooks.map((entry) => entry.bookId === next.bookId ? next : entry);
        });
        card.append(reportItems, context);
        count += reports.length;
        first ??= reportItems.querySelector<HTMLElement>('li');
        if (book.imported) card.append(exemplarImportButton(surface, book));
        list.append(card);
      }
      root.dataset['exemplarBooks'] = String(list.children.length);
      empty.hidden = count > 0;
      empty.textContent = filters.kind || filters.book ? EXEMPLARS_FILTER_EMPTY : EXEMPLARS_EMPTY;
      return first;
    };
    drawFilters();
    append(projection.books);
    let cursor = projection.nextCursor;
    const more = element('button', 'button secondary', EXEMPLARS_MORE);
    more.type = 'button';
    more.dataset['exemplarAction'] = 'more';
    const moreRow = element('div', 'button-row exemplars-more');
    moreRow.hidden = cursor === null && after === null;
    const firstPage = element('button', 'button secondary', '回到第一页');
    firstPage.type = 'button';
    firstPage.dataset['exemplarAction'] = 'first';
    firstPage.hidden = after === null;
    more.hidden = cursor === null;
    moreRow.append(firstPage, more);
    const turn = async (nextAfter: ExemplarsProjection['nextCursor']) => {
      if (more.disabled) return;
      more.disabled = true;
      firstPage.disabled = true;
      setStatus(EXEMPLARS_STATUS.loadingMore, 'busy');
      try {
        const next = await window.ai7.inspectExemplars({ after: nextAfter });
        if (!root.isConnected) return;
        after = nextAfter;
        pageBooks = next.books;
        drawFilters();
        const first = append(pageBooks);
        cursor = next.nextCursor;
        firstPage.hidden = after === null;
        more.hidden = cursor === null;
        moreRow.hidden = cursor === null && after === null;
        setStatus(EXEMPLARS_STATUS.opened);
        const focusTarget = first ?? root.closest('.knowledge-base')?.querySelector<HTMLElement>('h2');
        if (focusTarget) { focusTarget.tabIndex = -1; focusTarget.focus(); }
      } catch (error) {
        if (!root.isConnected) return;
        setStatus(rendererErrorMessage(error, EXEMPLARS_STATUS.unavailable), 'error');
      } finally {
        more.disabled = false;
        firstPage.disabled = false;
      }
    };
    more.addEventListener('click', () => { if (cursor !== null) void turn(cursor); });
    firstPage.addEventListener('click', () => void turn(null));
    root.append(list, empty, moreRow);
  }

  /**
   * A published Book's 审稿意见 as 范例 offers them (Issue #429; KB-006): one line per template with a draft, at the version 图书交付包
   * pins, each with `归入本社范例` until the editor admits that exact version. Admitting replaces only this list, from the Book
   * the service answers with, and focus lands on the line admitted.
   */
  function readersReportExemplars(book: ExemplarBookProjection, admitted?: (next: ExemplarBookProjection) => void): HTMLElement {
    const items = element('ul', 'exemplar-readers-reports');
    items.dataset['readersReports'] = String(book.readersReports.length);
    for (const entry of book.readersReports) {
      const item = element('li', 'exemplar-entry');
      const actions = element('div', 'exemplar-actions');
      actions.append(stateTerm(`学习准入：${EXEMPLAR_ELIGIBILITY_LABELS[entry.eligibility]}`));
      const heading = element('div', 'exemplar-heading');
      const badge = stateTerm(exemplarKind(entry)); badge.classList.add('exemplar-kind-badge');
      heading.append(badge, element('strong', 'exemplar-title', exemplarTitle(book, entry)), actions);
      item.append(heading, element('p', 'field-note exemplar-context', `来自《${book.bookTitle}》（${exemplarAttribution(book)}） · ${readersReportExemplarFacts(entry, localInstantLabel)} · ${readersReportExemplarAdmission(entry.admission, localInstantLabel)}`));
      item.dataset['exemplarDocument'] = entry.documentId;
      item.dataset['exemplarType'] = entry.typeId;
      item.dataset['exemplarVersion'] = String(entry.version);
      item.dataset['exemplarAdmission'] = entry.admission.state;
      item.tabIndex = -1;
      if (entry.admission.state !== 'admitted') {
        const admit = element('button', 'button quiet', EXEMPLAR_READERS_REPORT_ADMIT);
        admit.type = 'button';
        admit.dataset['exemplarAction'] = 'admit';
        admit.dataset['exemplarTemplate'] = entry.template;
        admit.addEventListener('click', async () => {
          admit.disabled = true;
          setStatus(EXEMPLAR_READERS_REPORT_STATUS.admitting, 'busy');
          try {
            const next = await window.ai7.admitReadersReportExemplar({
              bookId: book.bookId, template: entry.template, revisionDigest: entry.revisionDigest, expectedDecisions: entry.admission.decisions,
            });
            if (!items.isConnected) return;
            admitted?.(next);
            const replaced = readersReportExemplars(next, admitted);
            items.replaceWith(replaced);
            setStatus(EXEMPLAR_READERS_REPORT_STATUS.admitted, 'success');
            replaced.querySelector<HTMLElement>(`li[data-exemplar-type="${entry.typeId}"]`)?.focus();
          } catch (error) {
            if (!items.isConnected) return;
            admit.disabled = false;
            setStatus(rendererErrorMessage(error, EXEMPLAR_READERS_REPORT_STATUS.failed), 'error');
          }
        });
        actions.append(admit);
      }
      items.append(item);
    }
    return items;
  }

  /**
   * 质量与学习 (Issue #61, plan slices S26b and S26c; LEARN-002, FDBK-009, FDBK-010): a house-wide destination beside 知识库 with
   * three tabs — 反馈历史, the passive history; 学习准入, the sidebar's entry (Issue #934), where a Book's 学习准入待处理 in
   * 待我处理 opens it, for that Book, with the way to every Book one step away; and 学习回溯 (Issue #62, S27a), the learning
   * audit of every material's lineage and 停止今后使用.
   */
  async function renderQualityLearning(tab: QualityLearningTab = technicalLayerVisible ? 'learning' : 'feedback', bookId: string | null = null, tabFocused = false,
    openMaterial: { readonly bookId: string; readonly materialKey: string } | null = null, returnToReview: (() => void) | null = null): Promise<void> {
    if (!technicalLayerVisible && QUALITY_LEARNING_TABS.find((entry) => entry.tab === tab)?.developerOnly === true) {
      await renderQualityLearning('feedback', null);
      setStatus('该页在开发者模式下显示');
      return;
    }
    const qualityTabs = visibleQualityLearningTabs(technicalLayerVisible);
    const content = panel();
    content.classList.add('quality-learning');
    content.dataset['qualityTab'] = tab;
    const tabs = element('div', 'knowledge-tabs quality-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', QUALITY_LEARNING_TABS_LABEL);
    qualityTabs.forEach((entry, index) => {
      const developerOnly = technicalLayerVisible && entry.developerOnly === true;
      const node = button(entry.label, entry.tab === tab ? 'secondary' : 'quiet', () => {
        if (entry.tab !== tab) void renderQualityLearning(entry.tab, null, true);
      });
      node.id = `quality-tab-${entry.tab}`;
      node.dataset['qualityTab'] = entry.tab;
      if (developerOnly) node.dataset['developerOnly'] = 'true';
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(entry.tab === tab));
      node.setAttribute('aria-controls', 'quality-panel');
      node.tabIndex = entry.tab === tab ? 0 : -1;
      node.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = qualityTabs[(index + step + qualityTabs.length) % qualityTabs.length]!;
        void renderQualityLearning(next.tab, null, true);
      });
      tabs.append(node);
    });
    const section = element('section', 'learning-section');
    section.id = 'quality-panel';
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `quality-tab-${tab}`);
    const heading = tab === 'feedback' ? FEEDBACK_HISTORY_HEADING : tab === 'learning' ? LEARNING_HEADING : LEARNING_AUDIT_HEADING;
    section.append(element('h3', undefined, heading));
    const host = element('div');
    section.append(host);
    const back = element('div', 'button-row');
    if (tab === 'learning' && bookId !== null) {
      const all = button('显示全部图书', 'quiet', () => void renderQualityLearning('learning', null));
      all.dataset['learningAction'] = 'all-books';
      back.append(all);
    }
    back.append(button('全域对话历史', 'quiet', () => void leaveThen(() => renderGlobalAgent())));
    back.append(button('返回', 'quiet', () => void returnToOrigin()));
    if (returnToReview !== null) back.prepend(button('返回原审阅', 'quiet', returnToReview));
    content.append(
      element('p', 'section-label', `${QUALITY_LEARNING_TITLE} · ${heading}`),
      element('h2', undefined, QUALITY_LEARNING_TITLE),
      element('p', 'field-note', QUALITY_LEARNING_LEDE),
      tabs,
      section,
      back,
    );
    replaceScreen('quality-learning', content);
    options.rememberReturn(content, () => renderQualityLearning(tab, bookId, false, openMaterial, returnToReview));
    if (tabFocused) content.querySelector<HTMLElement>(`#quality-tab-${tab}`)?.focus();
    const status = tab === 'feedback' ? FEEDBACK_HISTORY_STATUS : tab === 'learning' ? LEARNING_STATUS : LEARNING_AUDIT_STATUS;
    setStatus(status.loading, 'busy');
    const surface = tab === 'feedback'
      ? mountFeedbackHistory({ root: host, api: window.ai7, open: openFeedbackTarget, setStatus, errorMessage: rendererErrorMessage })
      : tab === 'learning'
        ? mountLearningMaterials({ root: host, bookId, api: window.ai7, openSource: openLearningMaterialSource, openSourceVersion: openWordSourceVersion, setStatus, errorMessage: rendererErrorMessage, technicalDetails })
        : mountLearningAudit({ root: host, api: window.ai7, openSourceVersion: openWordSourceVersion, setStatus, errorMessage: rendererErrorMessage, openMaterial });
    try {
      await surface.load();
      if (tab === 'feedback') {
        const metrics = element('div'); section.append(metrics);
        await mountEditQualitySignals(metrics, window.ai7);
      }
      if (content.isConnected) setStatus(status.opened);
    } catch (error) {
      setStatus(rendererErrorMessage(error, status.unavailable), 'error');
    }
  }

  /**
   * 知识库's page on screen: its heading, the seven classes as a tab list — arrow keys move between them — and the chosen
   * class's panel, which says what the class holds and, for a class a later slice brings, why it shows nothing yet.
   */
  function knowledgeBasePage(tab: KnowledgeBaseTab, tabFocused: boolean): { content: HTMLElement; panelNode: HTMLElement } {
    const view = knowledgeBaseTabView(tab);
    const knowledgeTabs = visibleKnowledgeBaseTabs(technicalLayerVisible);
    const content = panel();
    content.classList.add('knowledge-base');
    content.dataset['knowledgeTab'] = tab;
    const tabs = element('div', 'knowledge-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', KNOWLEDGE_BASE_TABS_LABEL);
    knowledgeTabs.forEach((entry, index) => {
      const developerOnly = technicalLayerVisible && entry.developerOnly === true;
      const node = button(entry.label, entry.tab === tab ? 'secondary' : 'quiet', () => {
        if (entry.tab !== tab) void renderKnowledgeBase(entry.tab, true);
      });
      node.id = `knowledge-tab-${entry.tab}`;
      node.dataset['knowledgeTab'] = entry.tab;
      if (developerOnly) node.dataset['developerOnly'] = 'true';
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(entry.tab === tab));
      node.setAttribute('aria-controls', 'knowledge-panel');
      node.tabIndex = entry.tab === tab ? 0 : -1;
      node.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = knowledgeTabs[(index + step + knowledgeTabs.length) % knowledgeTabs.length]!;
        void renderKnowledgeBase(next.tab, true);
      });
      tabs.append(node);
    });
    const panelNode = element('section', 'knowledge-panel');
    panelNode.id = 'knowledge-panel';
    panelNode.setAttribute('role', 'tabpanel');
    panelNode.setAttribute('aria-labelledby', `knowledge-tab-${tab}`);
    const back = element('div', 'button-row');
    back.append(button('返回知识库', 'quiet', () => void renderKnowledgeBase()));
    back.append(button('返回', 'quiet', () => void returnToOrigin()));
    const holds = element('p', 'lede knowledge-holds', view.holds);
    content.append(
      element('p', 'section-label', `${KNOWLEDGE_BASE_TITLE} · ${view.label}`),
      element('h2', undefined, view.label),
      tabs,
      holds,
    );
    if (view.pending !== null) {
      const pending = element('p', 'field-note knowledge-pending', view.pending);
      pending.dataset['knowledgePending'] = tab;
      panelNode.append(pending);
    }
    content.append(panelNode, back);
    replaceScreen('knowledge-base', content);
    options.rememberReturn(content, () => renderKnowledgeBase(tab));
    if (tabFocused) content.querySelector<HTMLElement>(`#knowledge-tab-${tab}`)?.focus();
    return { content, panelNode };
  }

  /**
   * 知识库 › 工序与规则 (Issue #421, plan slice S75 D8): every Book's 默认执行规则 — what quick start does under it, what
   * it binds, who set it and when — with 查看 and 停用. A rule is changed by setting it again from a newly viewed plan
   * in the drawer (D7), never edited here, and turning it off keeps it on record.
   */
  function renderKnowledgeBaseProjection(projection: DefaultExecutionRulesProjection, tabFocused = false, procedures: KnowledgeProceduresProjection | null = null): void {
    const { content, panelNode } = knowledgeBasePage('rules', tabFocused);
    content.dataset['ruleCount'] = String(projection.rules.length);
    // The expert 工序 (Issue #427, S79d; KB-010), since Issue #1081 the pre-installed procedure library: what each does, its
    // version, state, use and stages, then the native artifact.
    if (procedures !== null) {
      const section = element('section', 'knowledge-procedures');
      section.dataset['procedureCount'] = String(procedures.preinstalled.length);
      const captured = element('div', 'knowledge-captured');
      const list = element('div', 'procedure-library');
      void mountEditableProcedureLibrary(list, window.ai7, async (book, kind, procedure) => {
        await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, async (route) => {
          if (['baseline-analysis', 'baseline-manuscript-analysis'].includes(kind)) renderBookAnalysis(route.bookId, route.bookTitle);
          else if (kind === 'writing') renderBookDeliverables(route.bookId, route.bookTitle);
          else if (['evaluation', 'initial-evaluation', 'readers-report', 'evaluation-rewrite'].includes(kind)) renderBookEvaluation(route.bookId, route.bookTitle);
          else renderBookReview(route.bookId, route.bookTitle, null, `${procedure.procedureId}@${procedure.version}`);
        });
      }, rendererErrorMessage, captured).catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法读取工序版本。'), 'error'));
      section.append(element('h3', undefined, PROCEDURES_HEADING), list);
      // 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087 §5, §6): apart from the built-in 工序, read on their own.
      const surface = mountCapturedProcedures({
        root: captured,
        embeddedCatalog: true,
        api: window.ai7,
        setStatus,
        errorMessage: rendererErrorMessage,
        technicalDetails,
        localInstantLabel,
        openRun: async (book, procedureId) => {
          setStatus('正在打开这本书的审阅…', 'busy');
          try {
            await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, async (route) =>
              renderBookReview(route.bookId, route.bookTitle, null, procedureId));
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法打开这本书的审阅。'), 'error');
          }
        },
        // A Review Run a version ran (Issue #66, S31; REUSE-031): its Book's 审阅 on that exact Run.
        openReviewRun: async (book, reviewRunId) => {
          setStatus('正在打开这次审阅…', 'busy');
          try {
            await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, async (route) =>
              renderBookReview(route.bookId, route.bookTitle, { reviewRunId, findingId: null }));
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法打开这次审阅。'), 'error');
          }
        },
        // A 图书交付包 version holding the report of such a Run (Issue #66, S31b; REUSE-031): its Book's 交付物.
        openDeliverables: async (book, packageVersionId) => {
          setStatus('正在打开这本书的交付物…', 'busy');
          try {
            await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, async (route) =>
              renderBookDeliverables(route.bookId, route.bookTitle, undefined, packageVersionId));
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法打开这本书的交付物。'), 'error');
          }
        },
      });
      // 自定义分析维度 (Issue #922, slice 7f; ADR 0090 item 4): the house's own per-unit questions, beside its 工序.
      const custom = element('div', 'knowledge-custom');
      const customSurface = mountCustomAnalysisDimensions({ root: custom, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, technicalDetails, localInstantLabel });
      const imported = element('section', 'knowledge-imported-skills');
      panelNode.append(section, custom, imported, element('h3', undefined, RULES_HEADING));
      void mountImportedSkills({ root: imported, api: window.ai7, setStatus, errorMessage: rendererErrorMessage }).load().catch((error: unknown) => {
        if (imported.isConnected) imported.append(element('p', 'attention-note', rendererErrorMessage(error, '无法读取外部 Skill。')));
      });
      void surface.load().catch((error: unknown) => {
        if (captured.isConnected) captured.append(element('p', 'attention-note', rendererErrorMessage(error, '无法读取可复用工序。')));
      });
      void customSurface.load().catch((error: unknown) => {
        if (custom.isConnected) custom.append(element('p', 'attention-note', rendererErrorMessage(error, '无法读取自定义分析维度。')));
      });
    }
    const ruleContext = element('p', 'field-note', projection.rules.length === 0 ? projection.statement.replace(/。$/u, '') : projection.statement);
    if (projection.rules.length === 0) ruleContext.append('；', element('span', 'default-rule-empty', '还没有默认执行规则，可在分析或写作任务计划中设置。'));
    panelNode.append(ruleContext);
    const list = element('div', 'default-rule-list');
    for (const rule of projection.rules) {
      const card = element('article', 'default-rule-card');
      card.dataset['ruleId'] = rule.ruleId;
      card.dataset['ruleState'] = rule.state;
      card.dataset['rulePattern'] = rule.pattern;
      card.dataset['ruleOrdinal'] = String(rule.ordinal);
      const heading = element('div', 'default-rule-heading');
      const state = element('span', `state-term status-pill default-rule-state-${rule.state}`, rule.stateLabel);
      heading.append(element('h3', undefined, `《${rule.bookTitle}》 · ${rule.name}`), state);
      const set = `由${rule.setBy}设定于 ${localInstantLabel(rule.setAt)}${rule.state === 'deactivated' ? ` · 停用于 ${localInstantLabel(rule.stateRecordedAt)}` : ''}`;
      // 查看: what the rule binds, in the rows the confirmation listed, and one step further the exact identities.
      const view = element('details', 'default-rule-details');
      const summary = element('summary', undefined, '查看');
      summary.dataset['ruleAction'] = 'view';
      const binds = element('dl', 'default-rule-binds');
      for (const row of rule.binds) {
        const value = element('dd', undefined, row.value);
        value.dataset['ruleBind'] = row.label;
        binds.append(element('dt', undefined, row.label), value);
      }
      view.append(summary, binds, technicalDetails('default-rule-facts',
        element('dt', undefined, '规则'), element('dd', 'technical-identity', `${rule.ruleId} · ${rule.taskKind} · ${rule.pattern}`),
        element('dt', undefined, '规则版本'), element('dd', 'technical-identity', `${technicalWords(`第 ${rule.ordinal} 版`, '版本')} · ${rule.ruleVersionId}`),
        element('dt', undefined, '设定时查看的计划'), element('dd', 'technical-identity', `${rule.sourceTaskIntentId} · ${rule.sourcePlanEnvelopeDigest}`)));
      heading.append(element('span', undefined, set));
      card.append(heading, element('p', undefined, rule.does), view);
      if (rule.state === 'active') {
        const off = button('停用', 'secondary', async () => {
          off.disabled = true;
          setStatus('正在停用默认执行规则…', 'busy');
          try {
            await window.ai7.deactivateDefaultExecutionRule({ ruleId: rule.ruleId });
            await renderKnowledgeBase('rules');
            setStatus(`已停用默认执行规则：${rule.name}；快速开始不再使用它。`, 'success');
          } catch (error) {
            off.disabled = false;
            setStatus(rendererErrorMessage(error, '无法停用默认执行规则。'), 'error');
          }
        });
        off.dataset['ruleAction'] = 'deactivate';
        const actions = element('div', 'button-row');
        actions.append(off);
        card.append(actions);
      }
      list.append(card);
    }
    panelNode.append(list);
  }

  return { renderKnowledgeBase, renderQualityLearning };
}
