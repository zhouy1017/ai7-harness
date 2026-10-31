import { renderProcedureLibrary, mountEditableProcedureLibrary } from './procedure-library.js';
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
import { FEEDBACK_HISTORY_HEADING, FEEDBACK_HISTORY_STATUS, LEARNING_HEADING, LEARNING_STATUS, QUALITY_LEARNING_LEDE, QUALITY_LEARNING_TABS, QUALITY_LEARNING_TABS_LABEL, QUALITY_LEARNING_TITLE, type QualityLearningTab } from './quality-learning-labels.js';
import { PROCEDURES_HEADING, RULES_HEADING, artifactLine, EXEMPLARS_EMPTY, EXEMPLARS_LATER, EXEMPLARS_MORE, EXEMPLARS_NONE_DELIVERED, EXEMPLARS_STATUS, EXEMPLAR_READERS_REPORT_ADMIT, EXEMPLAR_READERS_REPORT_STATUS, readersReportExemplarLine, exemplarAttribution, exemplarDesignation, exemplarLine, exemplarSkippedNote, GUIDELINE_STATUS, LIBRARY_STATUS, KNOWLEDGE_BASE_LEDE, KNOWLEDGE_BASE_TABS_LABEL, KNOWLEDGE_BASE_TAB_VIEWS, KNOWLEDGE_BASE_TITLE, knowledgeBaseTabView, type KnowledgeBaseTab } from './knowledge-base-labels.js';
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
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly rendererErrorMessage: (error: unknown, fallback: string) => string;
  readonly element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  readonly openWordSourceVersion: (bookId: string, sourceVersionId: string) => Promise<void>;
  readonly technicalDetails: (gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>) => HTMLElement;
  readonly panel: () => HTMLElement;
  readonly button: (label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>) => HTMLButtonElement;
  readonly leaveThen: (open: () => Promise<void>) => Promise<void>;
  readonly renderGlobalAgent: (dialogueId?: string) => Promise<void>;
  readonly initializeStartup: () => Promise<void>;
  readonly replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  readonly openFeedbackTarget: (target: FeedbackHistoryTarget, entryId: string) => Promise<void>;
  readonly openLearningMaterialSource: (bookId: string, materialKey: string) => Promise<void>;
  readonly requestBookWorkbenchRoute: (route: BookWorkbenchRoute, onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>, recoveryReturn?: RecoveryReturnContext) => Promise<void>;
  readonly renderBookDeliverables: (bookId: string, bookTitle: string, openCase?: { caseId: string; publicationVersionId: string; }, focusPackageVersionId?: string) => void;
  readonly renderBookEvaluation: (bookId: string, bookTitle: string, focus?: { recordId: string; riskId: string; }) => void;
  readonly renderBookReview: (bookId: string, bookTitle: string, focus?: ReviewFocus | null, procedureId?: string | null) => void;
}

/** 知识库 and 质量与学习, moved verbatim from the shell (Issue #1235). */
export function createKnowledgeBase(options: KnowledgeBaseOptions) {
  const {
    setStatus, rendererErrorMessage, element, openWordSourceVersion, technicalDetails, panel, button, leaveThen, renderGlobalAgent, initializeStartup, replaceScreen, openFeedbackTarget, openLearningMaterialSource, requestBookWorkbenchRoute, renderBookDeliverables, renderBookEvaluation, renderBookReview,
  } = options;

  /**
   * 知识库 (Issue #427, plan slice S79a; editor-surfaces §8.4): its seven classes as tabs, in the specification's order, and the
   * chosen class below them. `tabFocused` keeps the keyboard on the tab list when a class was chosen from it; `materialId` is
   * the 资料库 item 待我处理 opened (Issue #427, S79c), shown with the decision it waits for in focus.
   */
  async function renderKnowledgeBase(tab: KnowledgeBaseTab = 'guidelines', tabFocused = false, materialId: string | null = null): Promise<void> {
    if (tab === 'rules') {
      setStatus('正在读取工序与规则…', 'busy');
      try {
        const [rules, procedures] = await Promise.all([window.ai7.inspectDefaultExecutionRules(), window.ai7.inspectKnowledgeProcedures()]);
        renderKnowledgeBaseProjection(rules, tabFocused, procedures);
        setStatus('工序与规则已打开');
      } catch (error) {
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
  function renderExemplars(root: HTMLElement, projection: ExemplarsProjection): void {
    const surface = {
      api: window.ai7, status: setStatus, error: rendererErrorMessage,
      refresh: async () => {
        const next = await window.ai7.inspectExemplars({ after: null });
        if (!root.isConnected) return;
        root.replaceChildren();
        renderExemplars(root, next);
      },
    };
    root.append(exemplarImportButton(surface));
    if (projection.books.length === 0) root.append(element('p', 'field-note exemplars-empty', EXEMPLARS_EMPTY));
    const list = element('div', 'exemplar-list');
    const append = (books: ExemplarsProjection['books']): HTMLElement | null => {
      list.replaceChildren();
      let first: HTMLElement | null = null;
      for (const book of books) {
        const card = element('article', 'exemplar-book');
        card.dataset['bookId'] = book.bookId;
        card.dataset['exemplarCount'] = String(book.exemplars.length);
        card.dataset['exemplarWithdrawn'] = String(book.withdrawn);
        const heading = element('h3', undefined, `《${book.bookTitle}》`);
        heading.tabIndex = -1;
        first ??= heading;
        card.append(
          heading,
          element('p', 'field-note exemplar-attribution', exemplarAttribution(book)),
          element('p', 'field-note exemplar-designation', exemplarDesignation(book, localInstantLabel)),
        );
        const skipped = book.skipped ?? [];
        if (book.exemplars.length === 0 && skipped.length === 0) card.append(element('p', 'field-note', EXEMPLARS_NONE_DELIVERED));
        const items = element('ul', 'exemplar-items');
        for (const exemplar of book.exemplars) {
          const item = element('li', undefined, exemplarLine(exemplar, localInstantLabel));
          item.dataset['exemplarDocument'] = exemplar.documentId;
          item.dataset['exemplarType'] = exemplar.typeId;
          item.dataset['exemplarVersion'] = String(exemplar.version);
          if (exemplar.imported) item.append(exemplarEligibility(surface, exemplar));
          items.append(item);
        }
        if (book.exemplars.length > 0) card.append(items);
        // A damaged imported version is named and skipped while the rest of the Book stays listed (Issue #800).
        if (skipped.length > 0) card.append(element('p', 'field-note exemplars-skipped', exemplarSkippedNote(skipped)));
        card.append(readersReportExemplars(book));
        if (book.imported) card.append(exemplarImportButton(surface, book));
        list.append(card);
      }
      root.dataset['exemplarBooks'] = String(list.children.length);
      return first;
    };
    append(projection.books);
    let cursor = projection.nextCursor;
    const more = element('button', 'button secondary', EXEMPLARS_MORE);
    more.type = 'button';
    more.dataset['exemplarAction'] = 'more';
    const moreRow = element('div', 'button-row exemplars-more');
    moreRow.hidden = cursor === null;
    const firstPage = element('button', 'button secondary', '回到第一页');
    firstPage.type = 'button';
    firstPage.dataset['exemplarAction'] = 'first';
    firstPage.hidden = true;
    more.hidden = cursor === null;
    moreRow.append(firstPage, more);
    const turn = async (after: ExemplarsProjection['nextCursor']) => {
      if (more.disabled) return;
      more.disabled = true;
      firstPage.disabled = true;
      setStatus(EXEMPLARS_STATUS.loadingMore, 'busy');
      try {
        const next = await window.ai7.inspectExemplars({ after });
        if (!root.isConnected) return;
        const first = append(next.books);
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
    root.append(list, moreRow, ...EXEMPLARS_LATER.map((line) => element('p', 'field-note exemplars-later', line)));
  }

  /**
   * A published Book's 审稿意见 as 范例 offers them (Issue #429; KB-006): one line per template with a draft, at the version 图书交付包
   * pins, each with `归入范例（仅本社）` until the editor admits that exact version. Admitting replaces only this list, from the Book
   * the service answers with, and focus lands on the line admitted.
   */
  function readersReportExemplars(book: ExemplarBookProjection): HTMLElement {
    const items = element('ul', 'exemplar-readers-reports');
    items.dataset['readersReports'] = String(book.readersReports.length);
    for (const entry of book.readersReports) {
      const item = element('li', undefined, readersReportExemplarLine(entry, localInstantLabel));
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
            const replaced = readersReportExemplars(next);
            items.replaceWith(replaced);
            setStatus(EXEMPLAR_READERS_REPORT_STATUS.admitted, 'success');
            replaced.querySelector<HTMLElement>(`li[data-exemplar-type="${entry.typeId}"]`)?.focus();
          } catch (error) {
            if (!items.isConnected) return;
            admit.disabled = false;
            setStatus(rendererErrorMessage(error, EXEMPLAR_READERS_REPORT_STATUS.failed), 'error');
          }
        });
        item.append(' ', admit);
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
  async function renderQualityLearning(tab: QualityLearningTab, bookId: string | null, tabFocused = false,
    openMaterial: { readonly bookId: string; readonly materialKey: string } | null = null, returnToReview: (() => void) | null = null): Promise<void> {
    const content = panel();
    content.classList.add('quality-learning');
    content.dataset['qualityTab'] = tab;
    const tabs = element('div', 'knowledge-tabs quality-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', QUALITY_LEARNING_TABS_LABEL);
    QUALITY_LEARNING_TABS.forEach((entry, index) => {
      const node = button(entry.label, entry.tab === tab ? 'secondary' : 'quiet', () => {
        if (entry.tab !== tab) void renderQualityLearning(entry.tab, null, true);
      });
      node.id = `quality-tab-${entry.tab}`;
      node.dataset['qualityTab'] = entry.tab;
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(entry.tab === tab));
      node.setAttribute('aria-controls', 'quality-panel');
      node.tabIndex = entry.tab === tab ? 0 : -1;
      node.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = QUALITY_LEARNING_TABS[(index + step + QUALITY_LEARNING_TABS.length) % QUALITY_LEARNING_TABS.length]!;
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
    back.append(button('返回', 'quiet', () => void initializeStartup()));
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
    const content = panel();
    content.classList.add('knowledge-base');
    content.dataset['knowledgeTab'] = tab;
    const tabs = element('div', 'knowledge-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', KNOWLEDGE_BASE_TABS_LABEL);
    KNOWLEDGE_BASE_TAB_VIEWS.forEach((entry, index) => {
      const node = button(entry.label, entry.tab === tab ? 'secondary' : 'quiet', () => {
        if (entry.tab !== tab) void renderKnowledgeBase(entry.tab, true);
      });
      node.id = `knowledge-tab-${entry.tab}`;
      node.dataset['knowledgeTab'] = entry.tab;
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(entry.tab === tab));
      node.setAttribute('aria-controls', 'knowledge-panel');
      node.tabIndex = entry.tab === tab ? 0 : -1;
      node.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = KNOWLEDGE_BASE_TAB_VIEWS[(index + step + KNOWLEDGE_BASE_TAB_VIEWS.length) % KNOWLEDGE_BASE_TAB_VIEWS.length]!;
        void renderKnowledgeBase(next.tab, true);
      });
      tabs.append(node);
    });
    const panelNode = element('section', 'knowledge-panel');
    panelNode.id = 'knowledge-panel';
    panelNode.setAttribute('role', 'tabpanel');
    panelNode.setAttribute('aria-labelledby', `knowledge-tab-${tab}`);
    const back = element('div', 'button-row');
    back.append(button('返回', 'quiet', () => void initializeStartup()));
    const holds = element('p', 'lede knowledge-holds', view.holds);
    content.append(
      element('p', 'section-label', `${KNOWLEDGE_BASE_TITLE} · ${view.label}`),
      element('h2', undefined, KNOWLEDGE_BASE_TITLE),
      element('p', 'field-note', KNOWLEDGE_BASE_LEDE),
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
      const list = renderProcedureLibrary(procedures.preinstalled);
      void mountEditableProcedureLibrary(list, window.ai7, async (book, kind, procedure) => {
        await requestBookWorkbenchRoute({ kind: 'book', bookId: book.bookId }, async (route) => {
          if (kind === 'writing') renderBookDeliverables(route.bookId, route.bookTitle);
          else if (['evaluation', 'readers-report', 'evaluation-rewrite'].includes(kind)) renderBookEvaluation(route.bookId, route.bookTitle);
          else renderBookReview(route.bookId, route.bookTitle, null, kind === 'review-run' ? `${procedure.procedureId}@${procedure.version}` : null);
        });
      }, rendererErrorMessage).catch((error: unknown) => setStatus(rendererErrorMessage(error, '无法读取工序版本。'), 'error'));
      const artifacts = element('ul', 'knowledge-artifact-list');
      for (const artifact of procedures.artifacts) {
        const item = element('li', undefined, artifactLine(artifact));
        item.dataset['artifactState'] = artifact.state;
        item.dataset['artifactEnabledBooks'] = String(artifact.enabledBooks);
        artifacts.append(item);
      }
      // The identities are the Technical Identity Layer's (ADR 0071 §1, LAYER-001): the 方案's carrier and 权限侧车, and each
      // 工序's own id, one step away from the words above.
      const identities = technicalDetails(
        'native-artifact-facts',
        ...procedures.artifacts.flatMap((artifact) => [
          element('dt', undefined, '原生载体身份'), element('dd', 'technical-identity', artifact.technical.artifactId),
          element('dt', undefined, '原生载体版本'), element('dd', 'technical-identity', artifact.technical.version),
          element('dt', undefined, 'SHA-256'), element('dd', 'technical-identity', artifact.technical.sha256),
          element('dt', undefined, '权限侧车'), element('dd', 'technical-identity', artifact.technical.sidecarId),
          ...(artifact.technical.sidecarSha256 === null
            ? []
            : [element('dt', undefined, '权限侧车 SHA-256'), element('dd', 'technical-identity', artifact.technical.sidecarSha256)]),
        ]),
        ...procedures.preinstalled.flatMap((procedure) => [element('dt', undefined, procedure.title), element('dd', 'technical-identity', procedure.procedureId)]),
      );
      section.append(element('h3', undefined, PROCEDURES_HEADING), list, artifacts, identities);
      // 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087 §5, §6): apart from the built-in 工序, read on their own.
      const captured = element('div', 'knowledge-captured');
      const surface = mountCapturedProcedures({
        root: captured,
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
      panelNode.append(section, captured, custom, imported, element('h3', undefined, RULES_HEADING));
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
    panelNode.append(element('p', 'field-note', projection.statement));
    if (projection.rules.length === 0) {
      panelNode.append(element('p', 'field-note default-rule-empty', '还没有默认执行规则。在分析或写作任务的完整计划里点「设为快速开始默认…」就能设定。'));
    }
    const list = element('div', 'default-rule-list');
    for (const rule of projection.rules) {
      const card = element('article', 'default-rule-card');
      card.dataset['ruleId'] = rule.ruleId;
      card.dataset['ruleState'] = rule.state;
      card.dataset['rulePattern'] = rule.pattern;
      card.dataset['ruleOrdinal'] = String(rule.ordinal);
      const heading = element('div', 'default-rule-heading');
      const state = element('span', `status-pill default-rule-state-${rule.state}`, rule.stateLabel);
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
        element('dt', undefined, '规则版本'), element('dd', 'technical-identity', `第 ${rule.ordinal} 版 · ${rule.ruleVersionId}`),
        element('dt', undefined, '设定时查看的计划'), element('dd', 'technical-identity', `${rule.sourceTaskIntentId} · ${rule.sourcePlanEnvelopeDigest}`)));
      card.append(heading, element('p', undefined, rule.does), element('p', 'field-note', set), view);
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
