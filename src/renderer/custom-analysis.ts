import type {
  BaselineAnalysisUpdateRequest,
  CustomAnalysisDimensionProjection,
  CustomAnalysisDimensionsProjection,
  CustomAnalysisRevisionSummaryProjection,
  RendererApi,
} from '../shared/protocol.js';
import {
  CUSTOM_TAB_EMPTY,
  CUSTOM_TAB_EMPTY_NOTE,
  CUSTOM_TAB_FEEDBACK_NOTE,
  CUSTOM_TAB_NOT_RUN,
  CUSTOM_TAB_PREPARED,
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
  CUSTOM_DIMENSION_NEW,
  CUSTOM_DIMENSION_REVISE,
  CUSTOM_DIMENSION_SAVE,
  CUSTOM_DIMENSION_STOP,
  CUSTOM_DIMENSION_STOP_NOTE,
  CUSTOM_DIMENSION_TEMPLATE_HINT,
  CUSTOM_DIMENSION_TEMPLATE_LABEL,
  CUSTOM_DIMENSION_TITLE_LABEL,
  customDimensionEnabledLine,
  customDimensionSavedLine,
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
  if (text !== undefined) node.textContent = text;
  return node;
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
  readonly api: Pick<RendererApi, 'inspectCustomAnalysisDimensions' | 'prepareCustomAnalysis'>;
  setStatus: Status;
  errorMessage(error: unknown, fallback: string): string;
  /** The prepared Task's plan in the Task Drawer: ②A's ordinary Plan → Run Authorization path. */
  openPlan(taskIntentId: string): void;
  /** One answer's quotation in the manuscript, where its block stands now. */
  jump(blockId: string): void;
}

/**
 * The tab is drawn again on every refresh of ②A's card, four times a second while a Run executes; the Book's last reading is
 * kept so a redraw shows it at once, and the service is asked again only when it is older than this or the tab is shown.
 */
const READING_FRESH_MS = 2_000;
const readings = new Map<string, { projection: CustomAnalysisDimensionsProjection; at: number }>();

/** The event ②A's tab strip raises on a panel as it is shown, so the tab reads again when the editor comes to it. */
export const ANALYSIS_TAB_SHOWN_EVENT = 'analysis-tab-shown';

export function mountCustomAnalysisTab(panel: HTMLElement, options: MountCustomAnalysisTabOptions): void {
  const { bookId, api } = options;
  panel.dataset['customAnalysis'] = 'reading';
  let busy = false;

  const updateFor = (dimension: CustomAnalysisDimensionProjection): BaselineAnalysisUpdateRequest | null => {
    const latest = dimension.book?.latest ?? null;
    if (latest === null) return null;
    // A result that still reads the current manuscript is read again whole; one the manuscript moved past is brought up to date.
    return { mode: latest.freshness.state === 'current' ? 'reanalyze-book' : 'sync-current', selectedRange: null };
  };

  const run = async (dimension: CustomAnalysisDimensionProjection): Promise<void> => {
    if (busy) return;
    busy = true;
    options.setStatus(CUSTOM_TAB_PREPARING, 'busy');
    try {
      const prepared = await api.prepareCustomAnalysis({ dimensionId: dimension.dimensionId, update: updateFor(dimension) });
      readings.set(bookId, { projection: prepared.dimensions, at: Date.now() });
      if (panel.isConnected) render(prepared.dimensions);
      options.openPlan(prepared.taskIntentId);
      options.setStatus(CUSTOM_TAB_PREPARED, 'success');
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法准备自定义分析的任务计划。'), 'error');
    } finally {
      busy = false;
    }
  };

  const renderRevision = (latest: CustomAnalysisRevisionSummaryProjection): HTMLElement => {
    const section = el('section', 'custom-revision');
    section.dataset['revisionId'] = latest.revisionId;
    section.dataset['freshness'] = latest.freshness.state;
    section.dataset['coverage'] = latest.coverage.state;
    section.append(
      el('p', 'custom-revision-line', customTabVersionLine(latest.dimensionVersion.version, latest.manuscriptRevisionLabel, latest.ordinal)),
      el('p', 'field-note custom-axis', latest.coverage.label),
      el('p', 'field-note custom-axis', latest.freshness.label),
      el('p', 'custom-counts', customTabCountsLine(latest.rowCounts)),
    );
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
      item.append(
        el('span', 'custom-row-unit', `第 ${row.unitOrdinal} 单元`),
        el('p', 'custom-answer', row.answer),
        anchor,
        el('p', 'field-note custom-confidence', row.confidenceNote),
      );
      rows.append(item);
    }
    section.append(rows);
    if (latest.rowsTruncated) section.append(el('p', 'field-note', customTabMoreRows(latest.rows.length)));
    section.append(el('p', 'field-note custom-feedback-note', CUSTOM_TAB_FEEDBACK_NOTE));
    return section;
  };

  const render = (projection: CustomAnalysisDimensionsProjection): void => {
    panel.dataset['customAnalysis'] = 'ready';
    panel.dataset['dimensionCount'] = String(projection.dimensions.length);
    if (projection.dimensions.length === 0) {
      const empty = el('section', 'custom-empty');
      empty.dataset['customEmpty'] = 'no-dimension';
      empty.append(el('p', undefined, CUSTOM_TAB_EMPTY), el('p', 'field-note', CUSTOM_TAB_EMPTY_NOTE));
      panel.replaceChildren(empty);
      return;
    }
    const cards = projection.dimensions.map((dimension) => {
      const card = el('article', 'custom-dimension-card');
      card.dataset['dimensionId'] = dimension.dimensionId;
      card.dataset['dimensionVersion'] = String(dimension.enabledVersion?.version ?? '');
      const book = dimension.book;
      const heading = el('div', 'custom-dimension-heading');
      heading.append(el('h3', undefined, dimension.title));
      if (book?.taskState != null) {
        const state = el('span', 'status-pill custom-task-state', book.taskState.stateLabel);
        state.dataset['taskState'] = book.taskState.state;
        heading.append(state);
      }
      card.append(heading);
      const actions = el('div', 'button-row');
      const start = actionButton(CUSTOM_TAB_RUN, 'primary', 'run', () => run(dimension));
      start.dataset['analysisAction'] = 'custom-run';
      start.disabled = book?.unavailableReason != null;
      actions.append(start);
      if (book?.taskState != null) {
        const { taskIntentId } = book.taskState;
        const open = actionButton('查看计划', 'secondary', 'open-plan', () => options.openPlan(taskIntentId));
        open.dataset['analysisAction'] = 'custom-open-plan';
        actions.append(open);
      }
      card.append(actions);
      if (book?.unavailableReason != null) card.append(el('p', 'field-note custom-unavailable', book.unavailableReason));
      if (book?.latest == null) {
        const none = el('p', 'custom-not-run', CUSTOM_TAB_NOT_RUN);
        none.dataset['customEmpty'] = 'not-run';
        card.append(none);
      } else {
        card.append(renderRevision(book.latest));
      }
      return card;
    });
    panel.replaceChildren(...cards);
  };

  const load = async (): Promise<void> => {
    try {
      const projection = await api.inspectCustomAnalysisDimensions({ forBook: true });
      readings.set(bookId, { projection, at: Date.now() });
      if (panel.isConnected) render(projection);
    } catch (error) {
      if (!panel.isConnected) return;
      panel.dataset['customAnalysis'] = 'unavailable';
      panel.replaceChildren(el('p', 'attention-note', options.errorMessage(error, '无法读取自定义分析维度。')));
    }
  };

  const cached = readings.get(bookId);
  if (cached === undefined) panel.replaceChildren(el('p', 'field-note', CUSTOM_TAB_READING));
  else render(cached.projection);
  if (cached === undefined || Date.now() - cached.at > READING_FRESH_MS) void load();
  panel.addEventListener(ANALYSIS_TAB_SHOWN_EVENT, () => void load());
}

// ---- 知识库 › 工序与规则 › 自定义分析维度 ----------------------------------------------------------------------------------

export interface MountCustomAnalysisDimensionsOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectCustomAnalysisDimensions' | 'saveCustomAnalysisDimension' | 'enableCustomAnalysisDimension' | 'stopCustomAnalysisDimension'>;
  setStatus: Status;
  errorMessage(error: unknown, fallback: string): string;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  localInstantLabel(instant: string): string;
}

export function mountCustomAnalysisDimensions(options: MountCustomAnalysisDimensionsOptions): { load(): Promise<void> } {
  const { api, root } = options;
  const section = el('section', 'knowledge-custom-dimensions');
  root.append(section);
  /** The form open now: a new dimension (`null`), or the next version of one; `undefined` while none is. */
  let editing: string | null | undefined;
  let projection: CustomAnalysisDimensionsProjection | null = null;
  let busy = false;

  const act = async (pending: string, body: () => Promise<CustomAnalysisDimensionsProjection>, done: (next: CustomAnalysisDimensionsProjection) => string): Promise<void> => {
    if (busy) return;
    busy = true;
    options.setStatus(pending, 'busy');
    try {
      const next = await body();
      projection = next;
      editing = undefined;
      render();
      options.setStatus(done(next), 'success');
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法完成这项操作。'), 'error');
    } finally {
      busy = false;
    }
  };

  const form = (dimension: CustomAnalysisDimensionProjection | null): HTMLElement => {
    const node = el('form', 'custom-dimension-form');
    node.dataset['customForm'] = dimension === null ? 'new' : dimension.dimensionId;
    const latest = dimension?.versions[0] ?? null;
    const titleLabel = el('label', undefined, CUSTOM_DIMENSION_TITLE_LABEL);
    const title = el('input');
    title.name = 'title';
    title.maxLength = 160;
    title.value = latest?.title ?? '';
    titleLabel.append(title);
    const templateLabel = el('label', undefined, CUSTOM_DIMENSION_TEMPLATE_LABEL);
    const template = el('textarea');
    template.name = 'questionTemplate';
    template.rows = 4;
    template.maxLength = 1600;
    template.value = latest?.questionTemplate ?? '';
    templateLabel.append(template);
    const actions = el('div', 'button-row');
    const save = el('button', 'primary', CUSTOM_DIMENSION_SAVE);
    save.type = 'submit';
    save.dataset['customAction'] = 'save';
    actions.append(save, actionButton(CUSTOM_DIMENSION_CANCEL, 'quiet', 'cancel', () => {
      editing = undefined;
      render();
    }));
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      const titleText = title.value.trim();
      void act('正在保存自定义分析维度…', () => api.saveCustomAnalysisDimension({
        dimensionId: dimension?.dimensionId ?? null, title: titleText, questionTemplate: template.value.trim(),
      }), () => customDimensionSavedLine(titleText));
    });
    node.append(titleLabel, templateLabel, el('p', 'field-note', CUSTOM_DIMENSION_TEMPLATE_HINT), actions);
    return node;
  };

  const render = (): void => {
    section.replaceChildren(el('h3', undefined, CUSTOM_DIMENSIONS_HEADING), el('p', 'field-note', CUSTOM_DIMENSIONS_NOTE));
    const fixed = el('ul', 'custom-dimension-fixed');
    for (const line of CUSTOM_DIMENSION_FIXED_LINES) fixed.append(el('li', 'field-note', line));
    section.append(fixed);
    if (projection === null) return;
    section.dataset['dimensionCount'] = String(projection.dimensions.length);
    if (editing === null) section.append(form(null));
    else section.append(actionButton(CUSTOM_DIMENSION_NEW, 'secondary', 'new', () => {
      editing = null;
      render();
    }));
    if (projection.dimensions.length === 0) section.append(el('p', 'field-note custom-dimensions-empty', CUSTOM_DIMENSIONS_EMPTY));
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
        item.append(el('span', `status-pill custom-dimension-state-${version.state}`, version.stateLabel),
          el('span', undefined, ` ${customDimensionVersionLine(version)}`), el('p', 'custom-dimension-template', version.questionTemplate));
        const actions = el('div', 'button-row');
        if (version.state === 'pending-validation') {
          actions.append(actionButton(CUSTOM_DIMENSION_ENABLE, 'primary', 'enable', () =>
            act('正在验证并启用…', () => api.enableCustomAnalysisDimension({ versionId: version.versionId }), () => customDimensionEnabledLine(version.title, version.version))));
        }
        if (version.state !== 'stopped') {
          actions.append(actionButton(CUSTOM_DIMENSION_STOP, 'secondary', 'stop', () =>
            act('正在停用…', () => api.stopCustomAnalysisDimension({ versionId: version.versionId }), () => customDimensionStoppedLine(version.title, version.version))));
        }
        if (actions.childElementCount > 0) item.append(actions);
        versions.append(item);
      }
      card.append(versions, el('p', 'field-note', CUSTOM_DIMENSION_STOP_NOTE));
      if (editing === dimension.dimensionId) card.append(form(dimension));
      else card.append(actionButton(CUSTOM_DIMENSION_REVISE, 'quiet', 'revise', () => {
        editing = dimension.dimensionId;
        render();
      }));
      card.append(options.technicalDetails('custom-dimension-facts',
        el('dt', undefined, '维度'), el('dd', 'technical-identity', `${dimension.dimensionId} · ${dimension.kind}`),
        ...dimension.versions.flatMap((version) => [
          el('dt', undefined, `第 ${version.version} 版`),
          el('dd', 'technical-identity', `${version.versionId} · ${version.documentDigest} · ${options.localInstantLabel(version.createdAt)}`),
        ])));
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
