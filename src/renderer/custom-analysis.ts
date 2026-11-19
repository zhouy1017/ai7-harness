import type { TaskLaunchRequest } from './task-drawer.js';
import { retainPollInteraction, pollControlEngaged, onPollControlEnd } from './poll-interaction.js';
import { technicalWords, identityWords, technicalLayerVisible } from './technical-layer.js';
import { styleInput } from './components/controls.js';
import { oneActionStart, startPreparedTask } from './one-action-start.js';
import type {
  BaselineAnalysisUpdateRequest,
  CustomAnalysisDimensionProjection,
  CustomAnalysisDimensionsProjection,
  CustomAnalysisRevisionSummaryProjection,
  RendererApi,
} from '../shared/protocol.js';
import {
  CUSTOM_TAB_EMPTY,
  CUSTOM_TAB_FEEDBACK_NOTE,
  CUSTOM_TAB_NEW,
  CUSTOM_TAB_STOPPED,
  CUSTOM_TAB_NOT_RUN,
  CUSTOM_TAB_PREPARED,
  CUSTOM_TAB_STARTED,
  CUSTOM_TAB_PREPARING,
  CUSTOM_TAB_READING,
  CUSTOM_TAB_RUN,
  customRowAnchorLabel,
  customTabCountsLine,
  customTabGapLine,
  customTabMoreRows,
  customTabVersionLine,
} from './custom-analysis-labels.js';
import {
  CUSTOM_DIMENSIONS_EMPTY,
  CUSTOM_DIMENSIONS_HEADING,
  CUSTOM_DIMENSIONS_NOTE,
  CUSTOM_DIMENSION_CANCEL,
  CUSTOM_DIMENSION_ENABLE,
  CUSTOM_DIMENSION_FIXED_LINES,
  CUSTOM_DIMENSION_FIXED_SUMMARY,
  CUSTOM_DIMENSION_NEW,
  CUSTOM_DIMENSION_REVISE,
  CUSTOM_DIMENSION_SAVE,
  CUSTOM_DIMENSION_STOP,
  CUSTOM_DIMENSION_TEMPLATE_LABEL,
  CUSTOM_DIMENSION_TEMPLATE_PLACEHOLDER,
  CUSTOM_TAB_NEW_HEADING,
  CUSTOM_DIMENSION_TITLE_LABEL,
  customDimensionEnabledLine,
  customDimensionSavedLine,
  customDimensionStopAsk,
  customDimensionStoppedLine,
  customDimensionVersionLine,
} from './knowledge-base-labels.js';

/**
 * 自定义分析维度 on the page (Issue #922, wave 10 slice 7f; ADR 0090 item 4): the house's dimensions in 知识库 › 工序与规则 —
 * 新建, 修改为新版本, 验证并启用, 停用 — and ②A's 自定义 tab over one Book — each enabled dimension with the Book's latest result,
 * its 运行, and its per-unit answers, each quotation a link back to the manuscript. Everything is read from the service again
 * after each action; the plan a 运行 prepares opens in the Task Drawer, whose 开始任务 is the only start.
 */
type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

function buttonRow(...nodes: HTMLElement[]): HTMLElement {
  const row = el('div', 'button-row');
  row.append(...nodes);
  return row;
}

function actionButton(label: string, tone: 'primary' | 'secondary' | 'quiet', action: string, run: () => Promise<void> | void): HTMLButtonElement {
  const node = el('button', tone, label);
  node.type = 'button';
  node.dataset['customAction'] = action;
  node.addEventListener('click', () => void run());
  return node;
}

// ---- ②A › 自定义 -----------------------------------------------------------------------------------------------------

export interface MountCustomAnalysisTabOptions {
  readonly bookId: string;
  readonly api: Pick<RendererApi, 'inspectCustomAnalysisDimensions'>;
  setStatus: Status;
  errorMessage(error: unknown, fallback: string): string;
  /** Open a recorded Task's plan in the Task Drawer. */
  openPlan(taskIntentId: string): void;
  openLaunch(request: TaskLaunchRequest): void;
  /** One answer's quotation in the manuscript, where its block stands now. */
  jump(blockId: string): void;
  /** Where a new dimension is written, in place; absent, the tab only lists and runs (the house's own page, 知识库, can write too). */
  readonly author?: { readonly api: Pick<RendererApi, 'inspectCustomAnalysisDimensions' | 'saveCustomAnalysisDimension' | 'enableCustomAnalysisDimension' | 'stopCustomAnalysisDimension'> };
}

/**
 * Keep the last reading for an immediate redraw, then read again: the drawer may have started a custom Task since that reading.
 */
const readings = new Map<string, { projection: CustomAnalysisDimensionsProjection; at: number }>();

/** While a dimension's Task is under way the tab reads again this often, as ②A's card does for the baseline's Run. */
const RUN_REFRESH_MS = 1_000;
const RUN_UNDER_WAY: ReadonlySet<string> = new Set(['authorized-blocked', 'queued', 'waiting', 'admitted', 'executing', 'cancelling', 'pausing']);

/** What the editor has typed into the form for a new dimension, kept per Book so a redraw of the card reopens it as it was. */
export interface CustomDimensionDraft {
  title: string; questionTemplate: string; field: 'title' | 'questionTemplate' | null;
  /** A save is out: the form on screen, whichever mount drew it, is disabled until the answer settles it. */
  saving?: boolean; sync?: () => void; composing?: boolean;
}
const drafts = new Map<string, CustomDimensionDraft>();
/** The tab mounted last for a Book settles its form: a save started under an earlier mount answers to the form on screen now. */
const closers = new Map<string, (saved: boolean, title?: string) => void>();

/**
 * Whether the editor is in the form for a new dimension, or its save is out: ②A holds its follow-up draws then, as for 分析反馈, so a
 * save is never orphaned and text being composed in an input method is never redrawn under the editor. A form in a hidden tab
 * holds nothing: the card follows the Run, and any draw reopens the form from its draft.
 */
export function customDimensionFormEngaged(root: HTMLElement): boolean {
  const form = root.querySelector<HTMLElement>('[data-custom-form="new"]');
  if (form === null) return false;
  const active = document.activeElement;
  return form.dataset['saving'] === 'true' || (active instanceof HTMLElement && form.contains(active));
}

/** The event ②A's tab strip raises on a panel as it is shown, so the tab reads again when the editor comes to it. */
export const ANALYSIS_TAB_SHOWN_EVENT = 'analysis-tab-shown';

export function mountCustomAnalysisTab(panel: HTMLElement, options: MountCustomAnalysisTabOptions): void {
  const { bookId, api } = options;
  panel.dataset['customAnalysis'] = 'reading';
  let busy = false;
  let deferred: CustomAnalysisDimensionsProjection | null = null;
  // The tab's three parts stay in place while the answers below are drawn again: the offer to write a dimension, the form once it is
  // open, and the dimensions with their results. A reading never takes the form the editor is typing in.
  const { author } = options;
  const head = el('div', 'custom-head');
  const formHost = el('div', 'custom-create');
  const body = el('div', 'custom-body');
  panel.append(head, formHost, body);
  let kind: 'reading' | 'empty' | 'list' | 'error' = 'reading';
  let creating = false;

  const drawHead = (): void => {
    const offer = author === undefined || creating ? null
      : actionButton(CUSTOM_TAB_NEW, kind === 'empty' ? 'primary' : 'secondary', 'create', () => openForm());
    if (offer !== null) offer.dataset['analysisAction'] = 'custom-create';
    const nodes: HTMLElement[] = [];
    if (kind === 'empty') {
      const empty = el('section', 'custom-empty');
      empty.dataset['customEmpty'] = 'no-dimension';
      empty.append(el('p', undefined, CUSTOM_TAB_EMPTY));
      if (offer !== null) empty.append(buttonRow(offer));
      nodes.push(empty);
    } else if (kind === 'list' && offer !== null) nodes.push(buttonRow(offer));
    head.replaceChildren(...nodes);
  };
  /** The title of a dimension just saved: its card takes focus once it is drawn, so the editor's place is where the result is. */
  let focusCardOf: string | null = null;
  /** After 停用 the card may be gone: the editor continues with the offer to write another. */
  let focusOfferAfterLoad = false;
  const closeForm = (saved: boolean, title?: string): void => {
    creating = false;
    drafts.delete(bookId);
    formHost.replaceChildren();
    drawHead();
    if (saved) { focusCardOf = title ?? null; void load(); }
    else head.querySelector<HTMLElement>('[data-custom-action="create"]')?.focus();
  };
  closers.set(bookId, closeForm);
  /** 停用 on a card, in place: the same operation the house's page uses, then the tab reads again. */
  const change = async (pending: string, work: () => Promise<unknown>, done: string): Promise<void> => {
    if (busy || author === undefined) return;
    busy = true;
    options.setStatus(pending, 'busy');
    try {
      await work();
      busy = false;
      options.setStatus(done, 'success');
      focusOfferAfterLoad = true;
      void load();
    } catch (error) {
      busy = false;
      options.setStatus(options.errorMessage(error, '无法完成这项操作。'), 'error');
    }
  };
  const openForm = (restoring = false): void => {
    if (creating || author === undefined) return;
    creating = true;
    drawHead();
    const draft = drafts.get(bookId) ?? { title: '', questionTemplate: '', field: null };
    drafts.set(bookId, draft);
    mountCustomAnalysisDimensions({ root: formHost, api: author.api, setStatus: options.setStatus, errorMessage: options.errorMessage, createInPlace: { done: (saved, title) => (closers.get(bookId) ?? closeForm)(saved, title), draft } });
    // A form reopened by a redraw gives focus back only where the redraw took it from. The card is attached when the draw ends, so
    // the focus is given then, to a node that is on the page.
    const field = restoring ? draft.field : 'title';
    const field_ = (): HTMLElement | null => field === null ? null : formHost.querySelector<HTMLElement>(field === 'title' ? 'input[name="title"]' : 'textarea[name="questionTemplate"]');
    if (!restoring) field_()?.focus();
    else if (field !== null) queueMicrotask(() => {
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && formHost.isConnected && draft.saving !== true) field_()?.focus();
    });
  };

  const updateFor = (dimension: CustomAnalysisDimensionProjection): BaselineAnalysisUpdateRequest | null => {
    const latest = dimension.book?.latest ?? null;
    if (latest === null) return null;
    // A result that still reads the current manuscript is read again whole; one the manuscript moved past is brought up to date.
    return { mode: latest.freshness.state === 'current' ? 'reanalyze-book' : 'sync-current', selectedRange: null };
  };

  const run = async (dimension: CustomAnalysisDimensionProjection): Promise<void> => {
    if (busy) return;
    options.openLaunch({ bookId, operation: 'launchCustomAnalysis', title: '自定义分析',
      input: { dimensionId: dimension.dimensionId, update: updateFor(dimension) } });
  };

  const renderRevision = (latest: CustomAnalysisRevisionSummaryProjection): HTMLElement => {
    const section = el('section', 'custom-revision');
    section.dataset['revisionId'] = latest.revisionId;
    section.dataset['freshness'] = latest.freshness.state;
    section.dataset['coverage'] = latest.coverage.state;
    const revision = el('p', 'custom-revision-line', customTabVersionLine(latest.dimensionVersion.version, latest.manuscriptRevisionLabel, latest.ordinal));
    const freshness = { current: '与当前稿件一致', stale: '稿件已更新，分析待更新', superseded: '已有更新结果' }[latest.freshness.state];
    revision.append(' · ', el('span', 'custom-axis', latest.coverage.label), ' · ', el('span', 'custom-axis', technicalWords(latest.freshness.label, freshness)));
    const counts = el('p', 'custom-counts', customTabCountsLine(latest.rowCounts));
    if (latest.rowsTruncated) counts.append(' · ', el('span', 'custom-more', customTabMoreRows(latest.rows.length)));
    section.append(revision, counts);
    if (latest.gaps.length > 0) {
      const gaps = el('ul', 'custom-gaps');
      for (const gap of latest.gaps) {
        const item = el('li', 'attention-note', customTabGapLine(gap));
        item.dataset['gapUnit'] = String(gap.unitOrdinal);
        gaps.append(item);
      }
      section.append(gaps);
    }
    const rows = el('ol', 'custom-rows');
    for (const row of latest.rows) {
      const item = el('li', 'custom-row');
      item.dataset['rowId'] = row.rowId;
      item.dataset['unitOrdinal'] = String(row.unitOrdinal);
      item.dataset['anchorState'] = row.anchorState;
      const anchor = row.sourceRange === null
        ? el('span', 'custom-anchor custom-anchor-unlocated', customRowAnchorLabel(row))
        : (() => {
          const link = el('button', 'quiet custom-anchor', customRowAnchorLabel(row));
          link.type = 'button';
          link.dataset['customAction'] = 'jump';
          link.dataset['analysisAction'] = 'custom-jump';
          link.dataset['blockId'] = row.sourceRange.blockId;
          const { blockId } = row.sourceRange;
          link.addEventListener('click', () => options.jump(blockId));
          return link;
        })();
      const answer = el('p', 'custom-answer', row.answer);
      answer.append(' · ', el('span', 'custom-confidence', row.confidenceNote));
      // The execution unit is the developer layer's (Issue #1431 item 77); the quotation link is the row's 原文位置.
      if (technicalLayerVisible) item.append(el('span', 'custom-row-unit', `第 ${row.unitOrdinal} 单元`));
      item.append(answer, anchor);
      rows.append(item);
    }
    section.append(rows);
    return section;
  };

  const render = (projection: CustomAnalysisDimensionsProjection): void => {
    if (pollControlEngaged(panel, false)) { deferred = projection; return; }
    deferred = null;
    const restoreInteraction = retainPollInteraction(panel);
    panel.dataset['customAnalysis'] = 'ready';
    panel.dataset['dimensionCount'] = String(projection.dimensions.length);
    if (projection.dimensions.length === 0) {
      kind = 'empty';
      drawHead();
      body.replaceChildren();
      if (focusOfferAfterLoad) { focusOfferAfterLoad = false; head.querySelector<HTMLElement>('[data-custom-action="create"]')?.focus(); }
      return;
    }
    kind = 'list';
    drawHead();
    const firstAnswer = projection.dimensions.find((dimension) => dimension.book?.latest != null);
    const cards = projection.dimensions.map((dimension) => {
      const card = el('article', 'custom-dimension-card');
      card.dataset['dimensionId'] = dimension.dimensionId;
      card.dataset['dimensionVersion'] = String(dimension.enabledVersion?.version ?? '');
      const book = dimension.book;
      const heading = el('div', 'custom-dimension-heading');
      heading.append(el('h3', undefined, dimension.title));
      if (dimension === firstAnswer) heading.append(el('span', 'custom-feedback-note', CUSTOM_TAB_FEEDBACK_NOTE));
      if (book?.taskState != null) {
        const state = el('span', 'state-term status-pill custom-task-state', book.taskState.stateLabel);
        state.dataset['taskState'] = book.taskState.state;
        heading.append(state);
      }
      card.append(heading);
      const actions = el('div', 'button-row');
      const start = actionButton(CUSTOM_TAB_RUN, 'primary', 'run', () => run(dimension));
      start.dataset['analysisAction'] = 'custom-run';
      start.disabled = book?.unavailableReason != null;
      if (book?.unavailableReason == null) {
        options.openLaunch({ bookId, operation: 'launchCustomAnalysis', title: '自定义分析', mount: actions,
          input: { dimensionId: dimension.dimensionId, update: updateFor(dimension) } });
        actions.querySelector<HTMLElement>('[data-task-drawer-control="launch"]')?.setAttribute('data-analysis-action', 'custom-run');
        actions.querySelector<HTMLElement>('[data-task-drawer-control="launch"]')?.setAttribute('data-custom-action', 'run');
        actions.querySelector<HTMLElement>('.task-launch-estimate summary button')?.setAttribute('data-analysis-action', 'custom-preview');
      } else actions.append(start);
      if (book?.taskState != null) {
        const { taskIntentId } = book.taskState;
        const open = actionButton('查看计划', 'secondary', 'open-plan', () => options.openPlan(taskIntentId));
        open.dataset['analysisAction'] = 'custom-open-plan';
        actions.append(open);
      }
      if (book?.unavailableReason != null) {
        // A stopped dimension that ran on this Book is told to be enabled in 知识库 › 工序与规则, a developer page: an ordinary editor reads what to do here.
        const reason = el('span', 'custom-unavailable', !technicalLayerVisible && dimension.enabledVersion === null ? CUSTOM_TAB_STOPPED : book.unavailableReason);
        reason.id = `custom-unavailable-${dimension.dimensionId}`;
        start.setAttribute('aria-describedby', reason.id);
        actions.append(reason);
      }
      const enabledVersion = dimension.versions.find((version) => version.versionId === dimension.enabledVersion?.versionId);
      if (author !== undefined && enabledVersion !== undefined) {
        const { versionId, title, version } = enabledVersion;
        // 停用 is final for the version and holds for every Book: asked once, with the app's own confirm.
        const stop = actionButton(`${CUSTOM_DIMENSION_STOP} · 已有分析保留`, 'quiet', 'stop', () => {
          if (busy || !confirm(customDimensionStopAsk(dimension.title))) return Promise.resolve();
          return change('正在停用…', () => author.api.stopCustomAnalysisDimension({ versionId }), customDimensionStoppedLine(title, version));
        });
        stop.dataset['analysisAction'] = 'custom-stop';
        actions.append(stop);
      }
      card.append(actions);
      if (book?.latest == null) {
        const none = el('p', 'custom-not-run', CUSTOM_TAB_NOT_RUN);
        none.dataset['customEmpty'] = 'not-run';
        card.append(none);
      } else {
        card.append(renderRevision(book.latest));
      }
      return card;
    });
    body.replaceChildren(...cards);
    restoreInteraction();
    if (focusCardOf !== null) {
      const card = cards.find((entry) => entry.querySelector('h3')?.textContent === focusCardOf);
      focusCardOf = null;
      if (card !== undefined) { card.tabIndex = -1; card.focus(); }
      else head.querySelector<HTMLElement>('[data-custom-action="create"]')?.focus();
    }
    if (focusOfferAfterLoad) { focusOfferAfterLoad = false; head.querySelector<HTMLElement>('[data-custom-action="create"]')?.focus(); }
  };

  let refresh: ReturnType<typeof setTimeout> | null = null;
  let loading = false;
  const load = async (): Promise<void> => {
    if (loading) return;
    loading = true;
    if (refresh !== null) clearTimeout(refresh);
    refresh = null;
    try {
      const projection = await api.inspectCustomAnalysisDimensions({ forBook: true });
      readings.set(bookId, { projection, at: Date.now() });
      if (!panel.isConnected) return;
      render(projection);
      // A Run under way settles into a new revision: the tab reads again until none is, and stops once the panel is gone.
      if (refresh === null && projection.dimensions.some((dimension) => RUN_UNDER_WAY.has(dimension.book?.taskState?.state ?? ''))) {
        refresh = setTimeout(() => {
          refresh = null;
          if (panel.isConnected) void load();
        }, RUN_REFRESH_MS);
      }
    } catch (error) {
      if (!panel.isConnected) return;
      panel.dataset['customAnalysis'] = 'unavailable';
      kind = 'error';
      drawHead();
      body.replaceChildren(el('p', 'attention-note', options.errorMessage(error, '无法读取自定义分析维度。')));
    } finally {
      loading = false;
    }
  };

  onPollControlEnd(panel, () => {
    if (deferred !== null && panel.isConnected && !pollControlEngaged(panel, false)) render(deferred);
  });
  const cached = readings.get(bookId);
  if (cached === undefined) body.replaceChildren(el('p', 'field-note', CUSTOM_TAB_READING));
  else render(cached.projection);
  void load();
  panel.addEventListener(ANALYSIS_TAB_SHOWN_EVENT, () => void load());
  // The card was drawn again with the form open: the form is back, with its text.
  if (drafts.has(bookId)) openForm(true);
}

// ---- 知识库 › 工序与规则 › 自定义分析维度 ----------------------------------------------------------------------------------

export interface MountCustomAnalysisDimensionsOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectCustomAnalysisDimensions' | 'saveCustomAnalysisDimension' | 'enableCustomAnalysisDimension' | 'stopCustomAnalysisDimension'>;
  setStatus: Status;
  errorMessage(error: unknown, fallback: string): string;
  /** The house's page lists every dimension with its versions and their facts; the form alone needs neither. */
  technicalDetails?(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  localInstantLabel?(instant: string): string;
  /** 分析 › 自定义 writes a new dimension in place: only the form opens, and `done` closes it once saved (with the title) or cancelled. */
  readonly createInPlace?: { done(saved: boolean, title?: string): void; readonly draft?: CustomDimensionDraft };
}

export function mountCustomAnalysisDimensions(options: MountCustomAnalysisDimensionsOptions): { load(): Promise<void> } {
  const { api, root } = options;
  const section = el('section', 'knowledge-custom-dimensions');
  root.append(section);
  /** The form open now: a new dimension (`null`), or the next version of one; `undefined` while none is. */
  let editing: string | null | undefined;
  let projection: CustomAnalysisDimensionsProjection | null = null;
  let busy = false;

  const act = async (pending: string, body: () => Promise<CustomAnalysisDimensionsProjection>, done: (next: CustomAnalysisDimensionsProjection) => string, savedTitle?: string): Promise<void> => {
    if (busy) return;
    busy = true;
    const draft = options.createInPlace?.draft;
    if (draft !== undefined) { draft.saving = true; draft.sync?.(); }
    options.setStatus(pending, 'busy');
    try {
      const next = await body();
      projection = next;
      editing = undefined;
      if (options.createInPlace === undefined) render();
      else options.createInPlace.done(true, savedTitle);
      options.setStatus(done(next), 'success');
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法完成这项操作。'), 'error');
    } finally {
      busy = false;
      if (draft !== undefined) { draft.saving = false; draft.sync?.(); }
    }
  };

  const form = (dimension: CustomAnalysisDimensionProjection | null): HTMLElement => {
    const node = el('form', 'custom-dimension-form');
    node.dataset['customForm'] = dimension === null ? 'new' : dimension.dimensionId;
    const latest = dimension?.versions[0] ?? null;
    const titleLabel = el('label', undefined, CUSTOM_DIMENSION_TITLE_LABEL);
    const title = styleInput(el('input'));
    title.setAttribute('name', 'title');
    title.maxLength = 160;
    title.value = latest?.title ?? '';
    titleLabel.append(title);
    const templateLabel = el('label', undefined, `${CUSTOM_DIMENSION_TEMPLATE_LABEL} · 最多 400 字，勿粘贴稿件原文`);
    const template = styleInput(el('textarea'));
    template.setAttribute('name', 'questionTemplate');
    template.rows = 4;
    template.placeholder = CUSTOM_DIMENSION_TEMPLATE_PLACEHOLDER;
    template.maxLength = 1600;
    template.value = latest?.questionTemplate ?? '';
    let saveButton: HTMLButtonElement | null = null;
    const draft = options.createInPlace?.draft;
    if (draft !== undefined) {
      title.value = draft.title; template.value = draft.questionTemplate;
      // The form on screen follows the draft's state: disabled while a save is out, whichever mount sent it.
      draft.sync = () => { for (const field of [title, template]) field.disabled = draft.saving === true; node.dataset['saving'] = String(draft.saving === true); if (saveButton !== null) saveButton.disabled = draft.saving === true; };
      title.addEventListener('input', () => { draft.title = title.value; });
      template.addEventListener('input', () => { draft.questionTemplate = template.value; });
      title.addEventListener('focus', () => { draft.field = 'title'; });
      template.addEventListener('focus', () => { draft.field = 'questionTemplate'; });
    }
    templateLabel.append(template);
    const actions = el('div', 'button-row');
    const save = el('button', 'primary', CUSTOM_DIMENSION_SAVE);
    saveButton = save;
    save.type = 'submit';
    save.dataset['customAction'] = 'save';
    actions.append(save, actionButton(CUSTOM_DIMENSION_CANCEL, 'quiet', 'cancel', () => {
      editing = undefined;
      if (options.createInPlace === undefined) render();
      else options.createInPlace.done(false);
    }));
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      const titleText = title.value.trim();
      // 保存并启用 is one step (Issue #1410 item 14): the saved version is validated and enabled at once; a refused validation
      // leaves it 待验证 with the service's reason, and its 启用 stays beside it.
      void act('正在保存并启用自定义分析维度…', async () => {
        const saved = await api.saveCustomAnalysisDimension({
          dimensionId: dimension?.dimensionId ?? null, title: titleText, questionTemplate: template.value.trim(),
        });
        const owner = saved.dimensions.find((entry) => dimension === null
          ? entry.versions[0]?.title === titleText && entry.versions[0]?.state === 'pending-validation'
          : entry.dimensionId === dimension.dimensionId);
        const fresh = owner?.versions[0];
        return fresh?.state === 'pending-validation' ? api.enableCustomAnalysisDimension({ versionId: fresh.versionId }) : saved;
      }, () => customDimensionSavedLine(titleText), titleText);
    });
    node.append(titleLabel, templateLabel, actions);
    draft?.sync?.();
    return node;
  };

  const render = (): void => {
    if (options.createInPlace !== undefined) {
      // Written where the editor is: the name, the question, and what AI7 fixes folded — no list of the house's other dimensions.
      const fixed = el('details', 'custom-dimension-fixed-fold');
      fixed.append(el('summary', undefined, CUSTOM_DIMENSION_FIXED_SUMMARY), ...CUSTOM_DIMENSION_FIXED_LINES.map((line) => el('p', 'field-note', line)));
      section.replaceChildren(el('h3', undefined, CUSTOM_TAB_NEW_HEADING), el('p', 'field-note', CUSTOM_DIMENSIONS_NOTE), fixed, form(null));
      return;
    }
    section.replaceChildren(el('h3', undefined, CUSTOM_DIMENSIONS_HEADING), el('p', 'field-note', CUSTOM_DIMENSIONS_NOTE));
    const fixed = el('ul', 'custom-dimension-fixed');
    for (const line of CUSTOM_DIMENSION_FIXED_LINES) fixed.append(el('li', 'field-note', line));
    section.append(fixed);
    if (projection === null) return;
    section.dataset['dimensionCount'] = String(projection.dimensions.length);
    if (editing === null) section.append(form(null));
    else {
      const actions = el('div', 'button-row');
      if (projection.dimensions.length === 0) actions.append(el('span', 'custom-dimensions-empty', CUSTOM_DIMENSIONS_EMPTY));
      actions.append(actionButton(CUSTOM_DIMENSION_NEW, 'secondary', 'new', () => {
        editing = null;
        render();
      }));
      section.append(actions);
    }
    for (const dimension of projection.dimensions) {
      const card = el('article', 'custom-dimension-card');
      card.dataset['dimensionId'] = dimension.dimensionId;
      card.append(el('h4', undefined, dimension.title));
      const versions = el('ul', 'custom-dimension-versions');
      for (const version of dimension.versions) {
        const item = el('li', 'custom-dimension-version');
        item.dataset['versionId'] = version.versionId;
        item.dataset['version'] = String(version.version);
        item.dataset['versionState'] = version.state;
        item.append(el('span', `state-term status-pill custom-dimension-state-${version.state}`, version.stateLabel),
          el('span', undefined, ` ${customDimensionVersionLine(version)}`), el('p', 'custom-dimension-template', version.questionTemplate));
        const actions = el('div', 'button-row');
        if (version.state === 'pending-validation') {
          actions.append(actionButton(CUSTOM_DIMENSION_ENABLE, 'primary', 'enable', () =>
            act('正在验证并启用…', () => api.enableCustomAnalysisDimension({ versionId: version.versionId }), () => customDimensionEnabledLine(version.title, version.version))));
        }
        if (version.state !== 'stopped') {
          actions.append(actionButton(`${CUSTOM_DIMENSION_STOP} · 已有分析保留`, 'secondary', 'stop', () =>
            act('正在停用…', () => api.stopCustomAnalysisDimension({ versionId: version.versionId }), () => customDimensionStoppedLine(version.title, version.version))));
        }
        if (actions.children.length > 0) item.append(actions);
        versions.append(item);
      }
      card.append(versions);
      if (editing === dimension.dimensionId) card.append(form(dimension));
      else card.append(actionButton(CUSTOM_DIMENSION_REVISE, 'quiet', 'revise', () => {
        editing = dimension.dimensionId;
        render();
      }));
      const { technicalDetails, localInstantLabel } = options;
      if (technicalDetails !== undefined && localInstantLabel !== undefined) {
        card.append(technicalDetails('custom-dimension-facts',
          el('dt', undefined, '维度'), el('dd', 'technical-identity', `${dimension.dimensionId} · ${dimension.kind}`),
          ...dimension.versions.flatMap((version) => [
            el('dt', undefined, technicalWords(`第 ${version.version} 版`, localInstantLabel(version.createdAt))),
            el('dd', 'technical-identity', `${version.versionId} · ${version.documentDigest} · ${localInstantLabel(version.createdAt)}`),
          ])));
      }
      section.append(card);
    }
  };

  render();
  return {
    async load(): Promise<void> {
      projection = await api.inspectCustomAnalysisDimensions({ forBook: false });
      render();
    },
  };
}
