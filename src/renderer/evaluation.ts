import type {
  EvaluationAdjustment,
  EvaluationAdjustmentReasonId,
  EvaluationConclusion,
  EvaluationContent,
  EvaluationRecordProjection,
  EvaluationRecordSummaryProjection,
  EvaluationRewriteDecision,
  EvaluationWorkspaceProjection,
  ProductionDocumentProjection,
  ReadersReportTemplate,
  RendererApi,
  ServiceJobProjection,
} from '../shared/protocol.js';
import { READERS_REPORT_TEMPLATE_LABELS } from '../shared/protocol.js';
import { mountManuscriptExport } from './manuscript-export.js';
import { documentExportLabel } from './production-document-labels.js';
import {
  EVALUATION_ADJUSTMENT_REASONS,
  evaluationItemAdjusted,
  evaluationTotal,
  finalizationNeedsScore,
  recommendationBlocked,
  validEvaluationScore,
  type EvaluationRiskLevel,
} from '../shared/evaluation-scoring.js';
import {
  EVALUATION_ADJUSTMENT_LEGEND,
  EVALUATION_ADJUSTMENT_NOTE,
  EVALUATION_ADJUSTMENT_REASON_LABELS,
  EVALUATION_AI7_HEADING,
  EVALUATION_AI7_LEDE,
  EVALUATION_AI7_NONE,
  EVALUATION_AI7_OPEN_PLAN,
  EVALUATION_AI7_OPEN_TASK,
  EVALUATION_AI7_PREPARE,
  EVALUATION_AI7_STATUS,
  EVALUATION_AI7_SUGGESTED,
  EVALUATION_START_FROM_INITIAL,
  evaluationAi7ConclusionLine,
  evaluationAi7ItemLine,
  evaluationAi7LatestLine,
  evaluationAi7RecordLine,
  evaluationAi7TaskLine,
  evaluationAi7EvidenceLine,
  evaluationAi7EvidenceSummary,
  evaluationAi7UnreadLine,
  EVALUATION_AI7_PENDING,
  EVALUATION_COMMENT,
  EVALUATION_CONCLUSION_LEGEND,
  EVALUATION_EMPTY,
  EVALUATION_FINALIZE,
  EVALUATION_FINALIZE_NEEDS_SCORE,
  EVALUATION_NOT_RATED,
  EVALUATION_NOT_RATED_REASON,
  EVALUATION_READINESS,
  EVALUATION_RECOMMEND_BLOCKED,
  EVALUATION_RISK_LEVELS,
  EVALUATION_RISK_REVIEWED,
  EVALUATION_RISK_STATEMENT,
  EVALUATION_RISKS_HEADING,
  EVALUATION_SAVE,
  EVALUATION_SCORE,
  EVALUATION_START,
  EVALUATION_STATUS,
  EVALUATION_STAY,
  EVALUATION_STRENGTHS,
  EVALUATION_VERDICT,
  EVALUATION_VERSIONS_HEADING,
  EVALUATION_WEAKNESSES,
  READERS_REPORT_ACTIONS,
  READERS_REPORT_HEADING,
  READERS_REPORT_LEDE,
  READERS_REPORT_STATUS,
  readersReportBasisLine,
  readersReportDraftLine,
  readersReportDraftedLine,
  readersReportTaskLine,
  EVALUATION_COMPARABLE_SOURCE_SERIES,
  EVALUATION_COMPARABLES_EMPTY_SERIES,
  EVALUATION_COMPARABLES_HEADING,
  EVALUATION_COMPARABLES_NO_SERIES,
  EVALUATION_COMPARABLES_NO_WEB,
  EVALUATION_COMPARABLES_UNREADABLE,
  EVALUATION_MARKET_AI7,
  EVALUATION_MARKET_HEADING,
  EVALUATION_MARKET_LEDE,
  EVALUATION_MARKET_LISTS,
  EVALUATION_MARKET_NONE_ALONE,
  EVALUATION_MARKET_NONE_INITIAL,
  EVALUATION_MARKET_OFFLINE,
  EVALUATION_PREDICTION_HEADING,
  EVALUATION_PREDICTION_LABELS,
  EVALUATION_PREDICTION_NONE,
  EVALUATION_PREDICTION_NOT_PROMISE,
  EVALUATION_REWRITE_ACTIONS,
  EVALUATION_REWRITE_AFTER,
  EVALUATION_REWRITE_BEFORE,
  EVALUATION_REWRITE_EMPTY,
  EVALUATION_REWRITE_HEADING,
  EVALUATION_REWRITE_LEDE,
  EVALUATION_REWRITE_STALE,
  EVALUATION_REWRITE_STATUS,
  EVALUATION_REWRITE_VERDICT,
  evaluationComparableLine,
  evaluationComparablesMoreLine,
  evaluationPredictionLine,
  evaluationPricingLines,
  evaluationRewriteDecidedLine,
  evaluationRewriteProposalLine,
  evaluationRewriteReadingLine,
  evaluationRewriteTaskLine,
  evaluationBandLabel,
  evaluationComparisonLines,
  evaluationDiscardAndOpen,
  evaluationFinalized,
  evaluationFinalizedLine,
  evaluationHeading,
  evaluationItemLegend,
  evaluationRevisionLine,
  evaluationScoreFeedback,
  evaluationScoreInvalidLine,
  evaluationStarted,
  evaluationTotalLine,
  evaluationUnsavedLine,
  evaluationVersionLine,
} from './evaluation-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012): the Book's
 * versions, and the one on show as a form the editor fills in — each item's 得分 out of its 满分 or `不评` with a reason, with
 * its band and 评语; the two risk items at 低 / 中 / 高 with a statement, and a person's review of a 高 one; what is still
 * missing, the strengths, the weaknesses and 总评; and the conclusion, chosen by the editor, `推荐出版` waiting on every
 * unreviewed 高. The total follows as the editor types. `保存评估` records the form; `定稿` closes the version, which then reads
 * as it was; `重新评估` begins the next, compared with it item by item.
 */
export interface MountEvaluationOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectEvaluation' | 'startEvaluation' | 'saveEvaluation' | 'prepareInitialEvaluation' | 'prepareReadersReport' |
    'createReadersReportDraft' | 'prepareEvaluationRewrite' | 'decideEvaluationRewrite' | 'reviewManuscriptExport' | 'chooseManuscriptExportDestination' | 'approveManuscriptExport' | 'revealManuscriptExport'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
  /** The shell's own follow of a cooperative job: AI7 初评's preparation (Issue #429, S81b1). */
  readonly awaitServiceJob: (initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void) => Promise<ServiceJobProjection>;
  /** Open AI7 初评's plan in the Task Drawer, whose bar starts it. */
  readonly openPlan: (taskIntentId: string) => void;
  /** The route's Book, which 审稿意见's export card binds every answer to (Issue #429, S81c). */
  readonly bookId: string;
  /** Open 审稿意见's plan in the Task Drawer (Issue #429, S81c). */
  readonly openReadersReportPlan: (taskIntentId: string) => void;
  /** Open 按我的评分重写评语's plan in the Task Drawer (Issue #429, S81b2). */
  readonly openRewritePlan: (taskIntentId: string) => void;
  /** Open a 审稿意见 draft on the manuscript surface, as 交付物 opens a document. */
  readonly openDraft: (draft: { typeId: string; typeLabel: string; document: ProductionDocumentProjection }) => Promise<void>;
}

/** The states in which AI7's 初评 is still under way or waiting: 评估 reads it again until it settles. */
const INITIAL_UNDER_WAY: ReadonlySet<string> = new Set(['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued']);
/** How often 评估 reads a 初评 under way again. */
const INITIAL_POLL_MS = 1000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['evaluationAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement>(label: string, control: T): HTMLLabelElement {
  const wrapper = el('label', 'evaluation-field');
  wrapper.append(el('span', undefined, label), control);
  return wrapper;
}

function textarea(value: string, name: string, rows = 2): HTMLTextAreaElement {
  const node = el('textarea');
  node.rows = rows;
  node.value = value;
  node.dataset['evaluationField'] = name;
  return node;
}

function radio(name: string, value: string, label: string, checked: boolean, disabled: boolean): HTMLLabelElement {
  const wrapper = el('label', 'evaluation-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  wrapper.append(input, el('span', undefined, label));
  return wrapper;
}

export function mountEvaluation(options: MountEvaluationOptions): { load(): Promise<void>; refresh(): void } {
  const { root, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('evaluation');
  let busy = false;
  let workspace: EvaluationWorkspaceProjection | null = null;
  let refusal: string | null = null;
  let poll: number | null = null;

  // 审稿意见's DOCX export (Issue #429, S81c): ④ 导出's own card, drawn into one slot every paint of the 审稿意见 block takes
  // back, so a card open across a repaint keeps its state.
  const exportSlot = el('div', 'readers-report-export-slot');
  const exporter = mountManuscriptExport({
    root: exportSlot,
    bookId: options.bookId,
    api,
    technicalDetails: (gridClass, ...rows) => technicalDetails(gridClass ?? '', ...rows),
    setStatus,
    errorMessage,
    onChanged: () => undefined,
    openerOf: (target) => target.kind === 'document'
      ? root.querySelector<HTMLElement>(`.evaluation-readers-report li[data-document-id="${CSS.escape(target.documentId)}"] [data-readers-report-action="export"]`)
      : null,
  });

  /**
   * 审稿意见 (Issue #429, S81c; EVAL-013): the 定稿 version it drafts from, that the house has no 审稿意见 among its 范例 yet,
   * the latest Task, and per template — 起草, its plan, its drafted result to open, or its draft with its versions and 导出….
   */
  const readersReportNode = (page: EvaluationWorkspaceProjection): HTMLElement => {
    const report = page.readersReport;
    const section = el('section', 'evaluation-readers-report');
    section.dataset['readersReportState'] = report.task?.state ?? 'none';
    const heading = el('h3', undefined, READERS_REPORT_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', READERS_REPORT_LEDE));
    const basis = readersReportBasisLine(report.basis);
    if (basis !== null) section.append(el('p', 'readers-report-basis', basis));
    section.append(el('p', 'field-note readers-report-exemplars', `${report.exemplars.statement}。`));
    const task = report.task;
    if (task !== null) section.append(el('p', 'readers-report-task', readersReportTaskLine(task, READERS_REPORT_TEMPLATE_LABELS[task.template])));
    const list = el('ul', 'readers-report-templates');
    for (const entry of report.templates) {
      const item = el('li');
      item.dataset['template'] = entry.template;
      item.append(el('span', 'readers-report-template', entry.label));
      const row = el('div', 'button-row');
      const own = task !== null && task.template === entry.template;
      if (entry.draft !== null) {
        const draft = entry.draft;
        item.dataset['documentId'] = draft.document.documentId;
        item.append(el('p', 'field-note readers-report-draft', readersReportDraftLine(draft)));
        const open = action(READERS_REPORT_ACTIONS.openDraft, 'primary', 'open-draft', () => void openDraft(draft));
        open.dataset['readersReportAction'] = 'open-draft';
        open.disabled = busy;
        row.append(open);
        const latest = draft.document.versions[0];
        if (latest !== undefined) {
          const exportButton = action(READERS_REPORT_ACTIONS.exportDraft, 'secondary', 'export-draft', () => {
            if (busy || exporter.busy()) return;
            exporter.open({ kind: 'document', documentId: draft.document.documentId, revisionId: latest.revisionId },
              documentExportLabel(draft.typeLabel, latest.label), exportButton);
          });
          exportButton.dataset['readersReportAction'] = 'export';
          exportButton.disabled = busy || exporter.busy();
          row.append(exportButton);
        }
      } else if (entry.drafted !== null) {
        const drafted = entry.drafted;
        item.append(el('p', 'field-note readers-report-drafted', readersReportDraftedLine(drafted)));
        const create = action(READERS_REPORT_ACTIONS.createDraft, 'primary', 'create-draft', () => void createDraft(drafted.revisionId));
        create.dataset['readersReportAction'] = 'create-draft';
        create.disabled = busy;
        row.append(create);
      } else if (own && task.state === 'prepared') {
        const open = action(READERS_REPORT_ACTIONS.openPlan, 'primary', 'open-readers-report-plan', () => options.openReadersReportPlan(task.taskIntentId));
        open.dataset['readersReportAction'] = 'open-plan';
        open.disabled = busy;
        open.setAttribute('aria-controls', 'task-drawer');
        row.append(open);
      } else if (entry.prepare.allowed) {
        const prepare = action(READERS_REPORT_ACTIONS.prepare, 'secondary', 'prepare-readers-report', () => void prepareReport(entry.template));
        prepare.dataset['readersReportAction'] = 'prepare';
        prepare.disabled = busy;
        row.append(prepare);
      } else {
        item.append(el('p', 'field-note readers-report-reason', entry.prepare.reason));
      }
      if (own && task.state !== 'prepared') {
        const open = action(READERS_REPORT_ACTIONS.openTask, 'quiet', 'open-readers-report-task', () => options.openReadersReportPlan(task.taskIntentId));
        open.dataset['readersReportAction'] = 'open-task';
        open.disabled = busy;
        open.setAttribute('aria-controls', 'task-drawer');
        row.append(open);
      }
      if (row.childElementCount > 0) item.append(row);
      list.append(item);
    }
    section.append(list, exportSlot);
    return section;
  };

  /** 起草: the Task's plan prepared as one cooperative job, then opened in the Task Drawer, whose bar starts it. */
  const prepareReport = async (template: ReadersReportTemplate): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    refusal = null;
    setStatus(READERS_REPORT_STATUS.preparing, 'busy');
    paint(null, true);
    try {
      const job = await api.prepareReadersReport({ template });
      const completed = await options.awaitServiceJob(job, (next) => setStatus(next.progress.label, 'busy'));
      busy = false;
      if (completed.state === 'cancelled') {
        setStatus(READERS_REPORT_STATUS.cancelled, 'success');
        paint(`.evaluation-readers-report li[data-template="${template}"] [data-readers-report-action="prepare"]`, true);
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'readers-report-preparation' || result === null || !('readersReport' in result) || result.bookId !== workspace?.bookId) {
        throw new Error(READERS_REPORT_STATUS.failed);
      }
      workspace = { ...result, record: workspace.record };
      setStatus(READERS_REPORT_STATUS.prepared, 'success');
      paint(null, true);
      const ref = result.readersReport.task?.taskIntentId ?? null;
      if (ref !== null) options.openReadersReportPlan(ref);
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, READERS_REPORT_STATUS.failed);
      setStatus(refusal, 'error');
      paint('.evaluation-readers-report h3', true);
    }
  };

  /** 打开草稿 of a drafted result: the draft document is made, then opened on the manuscript surface. */
  const createDraft = async (revisionId: string): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    refusal = null;
    setStatus(READERS_REPORT_STATUS.creating, 'busy');
    paint(null, true);
    const template = workspace.readersReport.templates.find((entry) => entry.drafted?.revisionId === revisionId)?.template ?? null;
    try {
      const page = await api.createReadersReportDraft({ revisionId });
      busy = false;
      workspace = { ...page, record: workspace.record };
      const draft = page.readersReport.templates.find((entry) => entry.template === template)?.draft ?? null;
      paint(null, true);
      if (draft === null) throw new Error(READERS_REPORT_STATUS.openFailed);
      await options.openDraft(draft);
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, READERS_REPORT_STATUS.openFailed);
      setStatus(refusal, 'error');
      if (root.isConnected) paint('.evaluation-readers-report h3', true);
    }
  };

  const openDraft = async (draft: { typeId: string; typeLabel: string; document: ProductionDocumentProjection }): Promise<void> => {
    if (busy) return;
    try {
      await options.openDraft(draft);
    } catch (error) {
      refusal = errorMessage(error, READERS_REPORT_STATUS.openFailed);
      setStatus(refusal, 'error');
      if (root.isConnected) paint('.evaluation-readers-report h3', true);
    }
  };

  /**
   * AI7's 初评 (Issue #429, S81b1): its Task and what it can do now, and the latest that settled — each item's score with its
   * 依据充分度, the strengths, the weaknesses, the next step and the conclusion it would suggest, said as AI7's.
   */
  const initialNode = (page: EvaluationWorkspaceProjection): HTMLElement => {
    const initial = page.initial;
    const section = el('section', 'evaluation-initial');
    section.dataset['initialState'] = initial.task?.state ?? 'none';
    const heading = el('h3', undefined, EVALUATION_AI7_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', EVALUATION_AI7_LEDE));
    if (initial.task !== null) section.append(el('p', 'evaluation-initial-task', evaluationAi7TaskLine(initial.task)));
    const latest = initial.latest;
    if (latest === null) {
      section.append(el('p', 'field-note evaluation-initial-none', EVALUATION_AI7_NONE));
    } else {
      section.dataset['initialRevision'] = latest.revisionId;
      section.dataset['initialCurrent'] = String(latest.current);
      section.append(el('p', 'evaluation-initial-latest', evaluationAi7LatestLine(page.profile, latest)));
      const unread = evaluationAi7UnreadLine(latest);
      if (unread !== null) section.append(el('p', 'field-note evaluation-initial-unread', unread));
      const items = el('ul', 'evaluation-initial-items');
      for (const item of page.profile.items) {
        const ai7 = latest.items.find((entry) => entry.itemId === item.itemId);
        if (ai7 === undefined) continue;
        const line = el('li', undefined, `${item.label}：${evaluationAi7ItemLine(ai7, item.fullMarks)}`);
        line.dataset['itemId'] = item.itemId;
        line.dataset['sufficiency'] = ai7.sufficiency;
        items.append(line);
      }
      section.append(items);
      const lists = el('dl', 'evaluation-initial-lists');
      for (const [label, value] of [
        ['主要优点', latest.strengths.join('；')],
        ['主要问题', latest.weaknesses.join('；')],
        ['下一步建议', latest.nextStep ?? ''],
      ] as const) {
        if (value.length === 0) continue;
        lists.append(el('dt', undefined, label), el('dd', undefined, value));
      }
      section.append(lists, el('p', 'field-note evaluation-initial-conclusion', evaluationAi7ConclusionLine(page.profile, latest.suggestedConclusion)));
    }
    const row = el('div', 'button-row evaluation-initial-actions');
    const task = initial.task;
    if (task !== null && task.state === 'prepared') {
      const open = action(EVALUATION_AI7_OPEN_PLAN, 'primary', 'open-initial-plan', () => options.openPlan(task.taskIntentId));
      open.disabled = busy;
      open.setAttribute('aria-controls', 'task-drawer');
      row.append(open);
    } else {
      if (initial.prepare.allowed) {
        const prepare = action(EVALUATION_AI7_PREPARE[initial.prepare.mode], latest === null ? 'primary' : 'secondary', 'prepare-initial', () => void prepareInitial());
        prepare.disabled = busy;
        row.append(prepare);
      } else {
        row.append(el('p', 'field-note evaluation-initial-reason', initial.prepare.reason));
      }
      if (task !== null) {
        const open = action(EVALUATION_AI7_OPEN_TASK, 'quiet', 'open-initial-task', () => options.openPlan(task.taskIntentId));
        open.disabled = busy;
        open.setAttribute('aria-controls', 'task-drawer');
        row.append(open);
      }
    }
    section.append(row);
    return section;
  };

  /**
   * The market section of the version on show (Issue #429, S81b2; EVAL-009, EVAL-010): AI7's 目标读者, 差异化卖点 and 渠道与策略
   * from the 初评 the version began from, marked as AI7's and resting on the Book alone; the 书系 comparables tagged `书系`; and
   * the `预测 · 低确定性` block — 市场回报 and 评奖可能性 as AI7 wrote them or `暂无法预测`, and 定价与首印 from house data, or what
   * it waits for. Nothing here is chosen for the editor, and nothing claims the web.
   */
  const marketNode = (page: EvaluationWorkspaceProjection, record: EvaluationRecordProjection): HTMLElement => {
    const section = el('section', 'evaluation-market');
    const heading = el('h3', undefined, EVALUATION_MARKET_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', EVALUATION_MARKET_LEDE), el('p', 'field-note evaluation-market-basis', EVALUATION_MARKET_OFFLINE));
    const market = record.initial?.market ?? null;
    section.dataset['marketAi7'] = String(market !== null);
    if (market === null) {
      section.append(el('p', 'field-note evaluation-market-none', record.initial === null ? EVALUATION_MARKET_NONE_ALONE : EVALUATION_MARKET_NONE_INITIAL));
    } else {
      const lists = el('div', 'evaluation-market-lists');
      for (const key of ['readers', 'sellingPoints', 'channels'] as const) {
        const card = el('div', 'evaluation-market-list');
        card.dataset['marketList'] = key;
        const title = el('h4', undefined, EVALUATION_MARKET_LISTS[key]);
        title.append(' ', el('span', 'status-pill evaluation-market-ai7', EVALUATION_MARKET_AI7));
        const list = el('ul');
        for (const line of market[key]) list.append(el('li', undefined, line));
        card.append(title, list);
        lists.append(card);
      }
      section.append(lists);
      // What AI7 wrote but the page does not show, and why: a quantity it cannot support, or a part out of shape (S81b2).
      for (const reason of market.withheld) section.append(el('p', 'field-note evaluation-market-withheld', reason));
    }
    // Comparable books from house data, each tagged with its source (EVAL-009); no other house's book while the web is not connected.
    const comparables = el('div', 'evaluation-comparables');
    comparables.append(el('h4', undefined, EVALUATION_COMPARABLES_HEADING));
    if (page.market.seriesUnreadable) {
      comparables.append(el('p', 'field-note evaluation-comparables-none', EVALUATION_COMPARABLES_UNREADABLE));
    } else if (page.market.comparables.length === 0) {
      comparables.append(el('p', 'field-note evaluation-comparables-none', page.market.series.length === 0 ? EVALUATION_COMPARABLES_NO_SERIES : EVALUATION_COMPARABLES_EMPTY_SERIES));
    } else {
      const list = el('ul', 'evaluation-comparable-list');
      for (const comparable of page.market.comparables) {
        const item = el('li', undefined, evaluationComparableLine(comparable));
        item.dataset['bookId'] = comparable.bookId;
        item.dataset['source'] = comparable.source;
        item.append(' ', el('span', 'status-pill evaluation-comparable-source', EVALUATION_COMPARABLE_SOURCE_SERIES));
        list.append(item);
      }
      comparables.append(list);
      const more = evaluationComparablesMoreLine(page.market);
      if (more !== null) comparables.append(el('p', 'field-note', more));
    }
    comparables.append(el('p', 'field-note evaluation-comparables-web', EVALUATION_COMPARABLES_NO_WEB));
    section.append(comparables);
    // 预测 · 低确定性 (EVAL-009, EVAL-010): a block of its own, never a promise.
    const prediction = el('div', 'evaluation-prediction');
    const title = el('h4', undefined, EVALUATION_PREDICTION_HEADING);
    title.append(' ', el('span', 'status-pill evaluation-prediction-pill', EVALUATION_PREDICTION_NOT_PROMISE));
    const rows = el('dl', 'evaluation-prediction-rows');
    const row = (key: keyof typeof EVALUATION_PREDICTION_LABELS, lines: ReadonlyArray<string>): void => {
      const term = el('dt', undefined, EVALUATION_PREDICTION_LABELS[key]);
      const value = el('dd');
      value.dataset['prediction'] = key;
      for (const line of lines) value.append(el('p', undefined, line));
      rows.append(term, value);
    };
    row('marketReturn', [market === null ? EVALUATION_PREDICTION_NONE : evaluationPredictionLine(market.marketReturn)]);
    row('awards', [market === null ? EVALUATION_PREDICTION_NONE : evaluationPredictionLine(market.awards)]);
    row('pricing', evaluationPricingLines(page.market.pricing));
    prediction.append(title, rows);
    section.append(prediction);
    return section;
  };

  /**
   * 按我的评分重写评语 of the version on show (Issue #429, S81b2; EVAL-008): the action — or why it cannot be asked now — the Book's
   * latest rewrite Task, and the rewrite waiting for the editor: each item's 评语 and the 总评 as they stand beside AI7's rewritten
   * words, with 采用重写 and 放弃. Nothing is written into the version until the editor 采用 it, and no score ever moves.
   */
  const rewriteNode = (page: EvaluationWorkspaceProjection, record: EvaluationRecordProjection): HTMLElement => {
    const rewrite = page.rewrite;
    const section = el('section', 'evaluation-rewrite');
    section.dataset['rewriteState'] = rewrite.task?.state ?? 'none';
    const heading = el('h3', undefined, EVALUATION_REWRITE_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', EVALUATION_REWRITE_LEDE));
    const task = rewrite.task !== null && rewrite.task.recordId === record.recordId ? rewrite.task : null;
    if (task !== null) section.append(el('p', 'evaluation-rewrite-task', evaluationRewriteTaskLine(task)));
    const proposal = rewrite.proposal;
    if (proposal !== null) {
      const card = el('div', 'evaluation-rewrite-proposal');
      card.dataset['revisionId'] = proposal.revisionId;
      card.dataset['current'] = String(proposal.current);
      card.append(el('p', 'evaluation-rewrite-proposal-line', evaluationRewriteProposalLine(proposal)));
      const reading = el('p', 'field-note evaluation-rewrite-reading', evaluationRewriteReadingLine(proposal.reading));
      reading.dataset['unitsRead'] = String(proposal.reading.unitsRead);
      reading.dataset['unitsTotal'] = String(proposal.reading.unitsTotal);
      card.append(reading);
      const list = el('dl', 'evaluation-rewrite-items');
      const pair = (label: string, before: string | null, after: string, itemId: string | null, evidence: NonNullable<typeof proposal>['items'][number]['evidence'], evidenceCount: number): void => {
        const value = el('dd');
        if (itemId !== null) value.dataset['itemId'] = itemId;
        value.append(
          el('p', 'evaluation-rewrite-before', `${EVALUATION_REWRITE_BEFORE}：${before ?? EVALUATION_REWRITE_EMPTY}`),
          el('p', 'evaluation-rewrite-after', `${EVALUATION_REWRITE_AFTER}：${after}`),
        );
        // What the rewritten 评语 rests on (EVAL-006): each note AI7 made toward the editor's score, with the range and blocks.
        if (evidence.length > 0) {
          const notes = el('details', 'evaluation-rewrite-evidence');
          const lines = el('ul');
          for (const entry of evidence) {
            const line = el('li', undefined, evaluationAi7EvidenceLine(entry));
            line.dataset['unitOrdinal'] = String(entry.unitOrdinal);
            line.dataset['blockIds'] = entry.blockIds.join(' ');
            lines.append(line);
          }
          notes.append(el('summary', undefined, evaluationAi7EvidenceSummary(evidence.length, evidenceCount)), lines);
          value.append(notes);
        }
        list.append(el('dt', undefined, label), value);
      };
      for (const item of proposal.items) {
        const label = record.profile.items.find((entry) => entry.itemId === item.itemId)?.label ?? item.itemId;
        pair(label, item.before, item.after, item.itemId, item.evidence, item.evidenceCount);
      }
      if (proposal.verdict !== null) pair(EVALUATION_REWRITE_VERDICT, proposal.verdict.before, proposal.verdict.after, null, [], 0);
      card.append(list);
      // What AI7 wrote but does not offer, and why: a 评语 or the 总评 that stated a score or a conclusion.
      for (const reason of proposal.withheld) card.append(el('p', 'field-note evaluation-rewrite-withheld', reason));
      if (!proposal.current) card.append(el('p', 'field-note evaluation-rewrite-stale', EVALUATION_REWRITE_STALE));
      const actions = el('div', 'button-row evaluation-rewrite-actions');
      const accept = action(EVALUATION_REWRITE_ACTIONS.accept, 'primary', 'rewrite-accept', () => void decideRewrite(proposal.revisionId, 'accept'));
      accept.disabled = busy || !proposal.current || (proposal.items.length === 0 && proposal.verdict === null);
      const discard = action(EVALUATION_REWRITE_ACTIONS.discard, 'secondary', 'rewrite-discard', () => void decideRewrite(proposal.revisionId, 'discard'));
      discard.disabled = busy;
      actions.append(accept, discard);
      card.append(actions);
      section.append(card);
    } else if (rewrite.decided !== null) {
      section.append(el('p', 'field-note evaluation-rewrite-decided', evaluationRewriteDecidedLine(rewrite.decided)));
    }
    const row = el('div', 'button-row evaluation-rewrite-start');
    if (task !== null && task.state === 'prepared') {
      const open = action(EVALUATION_REWRITE_ACTIONS.openPlan, 'primary', 'open-rewrite-plan', () => options.openRewritePlan(task.taskIntentId));
      open.disabled = busy;
      open.setAttribute('aria-controls', 'task-drawer');
      row.append(open);
    } else {
      if (rewrite.prepare.allowed) {
        const prepare = action(EVALUATION_REWRITE_ACTIONS.prepare, proposal === null ? 'primary' : 'secondary', 'prepare-rewrite', () => void prepareRewrite(record));
        prepare.disabled = busy;
        row.append(prepare);
      } else {
        row.append(el('p', 'field-note evaluation-rewrite-reason', rewrite.prepare.reason));
      }
      if (task !== null) {
        const open = action(EVALUATION_REWRITE_ACTIONS.openTask, 'quiet', 'open-rewrite-task', () => options.openRewritePlan(task.taskIntentId));
        open.disabled = busy;
        open.setAttribute('aria-controls', 'task-drawer');
        row.append(open);
      }
    }
    section.append(row);
    return section;
  };

  /**
   * 按我的评分重写评语: the Task's plan prepared as one cooperative job over the version's saved entry, then opened in the Task
   * Drawer, whose bar starts it. Unsaved edits are saved first by the editor: a rewrite reads only what is saved.
   */
  const prepareRewrite = async (record: EvaluationRecordProjection): Promise<void> => {
    if (busy || workspace === null) return;
    if (unsaved()) {
      refusal = EVALUATION_REWRITE_STATUS.unsaved;
      setStatus(refusal, 'error');
      paint('.evaluation-rewrite h3', true);
      return;
    }
    busy = true;
    refusal = null;
    setStatus(EVALUATION_REWRITE_STATUS.preparing, 'busy');
    paint(null, true);
    try {
      const job = await api.prepareEvaluationRewrite({ recordId: record.recordId });
      const completed = await options.awaitServiceJob(job, (next) => setStatus(next.progress.label, 'busy'));
      busy = false;
      if (completed.state === 'cancelled') {
        setStatus(EVALUATION_REWRITE_STATUS.cancelled, 'success');
        paint('[data-evaluation-action="prepare-rewrite"]', true);
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'evaluation-rewrite-preparation' || result === null || !('rewrite' in result) || result.bookId !== workspace?.bookId) {
        throw new Error(EVALUATION_REWRITE_STATUS.failed);
      }
      workspace = { ...result, record: workspace.record };
      setStatus(EVALUATION_REWRITE_STATUS.prepared, 'success');
      paint(null, true);
      const ref = result.rewrite.task?.taskIntentId ?? null;
      if (ref !== null) options.openRewritePlan(ref);
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_REWRITE_STATUS.failed);
      setStatus(refusal, 'error');
      paint('.evaluation-rewrite h3', true);
    }
  };

  /**
   * 采用重写 or 放弃 (EVAL-008). 采用 records AI7's words as a new entry of the version and draws the form anew from it — refused
   * while the form holds unsaved edits, which the new entry would otherwise drop; 放弃 keeps the form as it is.
   */
  const decideRewrite = async (revisionId: string, decision: EvaluationRewriteDecision): Promise<void> => {
    if (busy || workspace === null) return;
    if (decision === 'accept' && unsaved()) {
      refusal = EVALUATION_REWRITE_STATUS.unsavedAccept;
      setStatus(refusal, 'error');
      paint('.evaluation-rewrite h3', true);
      return;
    }
    busy = true;
    refusal = null;
    setStatus(decision === 'accept' ? EVALUATION_REWRITE_STATUS.accepting : EVALUATION_REWRITE_STATUS.discarding, 'busy');
    paint(null, true);
    try {
      const page = await api.decideEvaluationRewrite({ revisionId, decision });
      busy = false;
      if (decision === 'accept') {
        workspace = page;
        setStatus(EVALUATION_REWRITE_STATUS.accepted, 'success');
        paint('.evaluation-record h3');
      } else {
        workspace = { ...page, record: workspace.record };
        setStatus(EVALUATION_REWRITE_STATUS.discarded, 'success');
        paint('.evaluation-rewrite h3', true);
      }
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_REWRITE_STATUS.decideFailed);
      setStatus(refusal, 'error');
      paint('.evaluation-rewrite h3', true);
    }
  };

  /** While AI7's 初评 is under way, 评估 reads it again — and keeps the form the editor is filling in as it is. */
  const follow = (): void => {
    if (poll !== null || workspace === null ||
      (!INITIAL_UNDER_WAY.has(workspace.initial.task?.state ?? '') && !INITIAL_UNDER_WAY.has(workspace.readersReport.task?.state ?? '') &&
        !INITIAL_UNDER_WAY.has(workspace.rewrite.task?.state ?? ''))) return;
    poll = window.setTimeout(() => {
      poll = null;
      if (!root.isConnected || busy || workspace === null) return;
      void api.inspectEvaluation({ recordId: workspace.record?.recordId ?? null, recordsBefore: workspace.recordsBefore }).then((page) => {
        if (!root.isConnected || workspace === null || busy) return;
        workspace = { ...page, record: workspace.record };
        paint(null, true);
      }).catch(() => undefined).finally(() => follow());
    }, INITIAL_POLL_MS);
  };

  /** The version asked for from the list while the open one had unsaved edits: the page asks before it opens it (Issue #638). */
  let leaving: EvaluationRecordSummaryProjection | null = null;
  /** What each version's form held when it was drawn, in the record's shape: anything else in it is not saved yet. */
  const drawn = new WeakMap<HTMLElement, string>();

  const paint = (focus: string | null, preserveForm = false): void => {
    if (workspace === null) return;
    const keptForm = preserveForm ? root.querySelector<HTMLElement>('.evaluation-record') : null;
    root.dataset['evaluationRecords'] = String(workspace.recordCount);
    const parts: HTMLElement[] = [initialNode(workspace)];
    // The versions, newest first; each opens as it was recorded.
    if (workspace.records.length > 0) {
      const versions = el('section', 'evaluation-versions');
      const heading = el('h3', undefined, EVALUATION_VERSIONS_HEADING);
      heading.tabIndex = -1;
      versions.append(heading);
      const list = el('ol', 'evaluation-version-list');
      for (const summary of workspace.records) {
        const item = el('li');
        item.dataset['recordId'] = summary.recordId;
        item.dataset['evaluationState'] = summary.state;
        const open = action(evaluationVersionLine(workspace.profile, summary), 'quiet', 'open-version', () => openVersion(summary));
        open.disabled = busy;
        open.setAttribute('aria-current', String(workspace.record?.recordId === summary.recordId));
        item.append(open);
        list.append(item);
      }
      versions.append(list);
      if (leaving !== null && workspace.record !== null) {
        // Typed work is never lost by a click on the list: staying is the first way, and the discard says what it does.
        const target = leaving;
        const guard = el('div', 'attention-note evaluation-unsaved');
        guard.setAttribute('role', 'alert');
        const row = el('div', 'button-row');
        row.append(
          action(EVALUATION_STAY, 'secondary', 'stay', () => {
            leaving = null;
            paint('.evaluation-record h3', true);
          }),
          action(evaluationDiscardAndOpen(target.ordinal), 'quiet', 'discard-and-open', () => {
            leaving = null;
            void show(target.recordId);
          }),
        );
        guard.append(el('p', undefined, evaluationUnsavedLine(workspace.record.ordinal, target.ordinal)), row);
        versions.append(guard);
      }
      if (workspace.recordCount > workspace.records.length) {
        const controls = el('div', 'button-row');
        const latest = action('最新版本', 'quiet', 'versions-latest', () => void turn(null));
        const older = action('更早版本', 'secondary', 'versions-older', () => void turn(workspace?.recordsNext ?? null));
        latest.disabled = busy || workspace.recordsBefore === null;
        older.disabled = busy || workspace.recordsNext === null;
        controls.append(latest, older);
        versions.append(controls);
      }
      parts.push(versions);
    } else {
      parts.push(el('p', 'field-note evaluation-empty', EVALUATION_EMPTY));
    }
    const start = el('div', 'button-row evaluation-start');
    if (workspace.start.allowed) {
      // 从 AI7 初评开始 leads once AI7's latest 初评 read the text as it stands (EVAL-001, EVAL-006); the editor may still begin alone.
      const fromInitial = workspace.start.fromInitial;
      if (fromInitial !== null) {
        const seeded = action(EVALUATION_START_FROM_INITIAL, 'primary', 'start-from-initial', () => void begin_(true));
        seeded.disabled = busy;
        start.append(seeded);
      }
      const begin = action(EVALUATION_START[workspace.start.kind], workspace.start.kind === 'first' && fromInitial === null ? 'primary' : 'secondary', 'start', () => void begin_(false));
      begin.disabled = busy;
      start.append(begin);
    } else {
      start.append(el('p', 'field-note evaluation-start-reason', workspace.start.reason));
    }
    parts.push(start);
    parts.push(readersReportNode(workspace));
    // 按我的评分重写评语 sits just above the version it rewrites (Issue #429, S81b2; EVAL-008).
    if (workspace.record !== null) parts.push(rewriteNode(workspace, workspace.record));
    if (refusal !== null) {
      const note = el('p', 'attention-note evaluation-refusal', refusal);
      note.setAttribute('role', 'alert');
      parts.push(note);
    }
    // The market section follows the version it belongs to (Issue #429, S81b2; EVAL-009, EVAL-010).
    const after: HTMLElement[] = workspace.record === null ? [] : [marketNode(workspace, workspace.record)];
    if (keptForm !== null && workspace.record !== null && keptForm.parentElement === root) {
      // The form the editor is filling in never leaves the page — a 初评 read again while they type keeps their focus and
      // their place — and everything around it is drawn anew.
      for (const child of Array.from(root.children)) if (child !== keptForm) child.remove();
      keptForm.before(...parts);
      keptForm.after(...after);
    } else {
      if (workspace.record !== null) parts.push(keptForm ?? recordNode(workspace.record));
      root.replaceChildren(...parts, ...after);
    }
    if (keptForm !== null && workspace.record !== null) refresh(keptForm, workspace.record);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
    follow();
  };

  /** 准备 AI7 初评: the Task's plan prepared as one cooperative job, then opened in the Task Drawer, whose bar starts it. */
  const prepareInitial = async (): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    refusal = null;
    setStatus(EVALUATION_AI7_STATUS.preparing, 'busy');
    paint(null, true);
    try {
      const job = await api.prepareInitialEvaluation();
      const completed = await options.awaitServiceJob(job, (next) => setStatus(next.progress.label, 'busy'));
      busy = false;
      if (completed.state === 'cancelled') {
        setStatus(EVALUATION_AI7_STATUS.cancelled, 'success');
        paint('[data-evaluation-action="prepare-initial"]', true);
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'initial-evaluation-preparation' || result === null || !('initial' in result) || result.bookId !== workspace?.bookId) {
        throw new Error(EVALUATION_AI7_STATUS.failed);
      }
      workspace = { ...result, record: workspace.record };
      setStatus(EVALUATION_AI7_STATUS.prepared, 'success');
      paint(null, true);
      const ref = result.initial.task?.taskIntentId ?? null;
      if (ref !== null) options.openPlan(ref);
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_AI7_STATUS.failed);
      setStatus(refusal, 'error');
      paint('.evaluation-initial h3', true);
    }
  };

  const turn = async (recordsBefore: number | null): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    // The completion owns only the summary page; the current form and its save version remain pinned.
    await api.inspectEvaluation({ recordId: workspace.record?.recordId ?? null, recordsBefore }).then((page) => {
      if (!root.isConnected || workspace === null) return;
      workspace = { ...page, record: workspace.record };
      refusal = null;
    }).catch((error: unknown) => {
      if (!root.isConnected) return;
      refusal = errorMessage(error, EVALUATION_STATUS.unavailable);
      setStatus(refusal, 'error');
    }).finally(() => {
      busy = false;
      if (root.isConnected) paint('.evaluation-versions h3', true);
    });
  };

  /** 调分原因 of one item (EVAL-006): the five, none ticked until the editor ticks one, `自行输入` with their own words. */
  const adjustmentNode = (record: EvaluationRecordProjection, itemId: string, adjustment: EvaluationAdjustment | null, readOnly: boolean): HTMLElement => {
    const set = el('fieldset', 'evaluation-adjustment');
    set.dataset['itemId'] = itemId;
    set.append(el('legend', undefined, EVALUATION_ADJUSTMENT_LEGEND));
    const choices = el('div', 'evaluation-adjustment-reasons');
    for (const reason of EVALUATION_ADJUSTMENT_REASONS) {
      const wrapper = el('label', 'evaluation-choice');
      const input = el('input');
      input.type = 'checkbox';
      input.value = reason;
      input.checked = adjustment?.reasons.includes(reason) ?? false;
      input.disabled = readOnly;
      input.dataset['evaluationField'] = 'adjustment-reason';
      wrapper.append(input, el('span', undefined, EVALUATION_ADJUSTMENT_REASON_LABELS[reason]));
      choices.append(wrapper);
    }
    const note = el('input');
    note.type = 'text';
    note.value = adjustment?.note ?? '';
    note.disabled = readOnly;
    note.dataset['evaluationField'] = 'adjustment-note';
    note.id = `evaluation-adjustment-note-${record.recordId}-${itemId}`;
    const noteField = field(EVALUATION_ADJUSTMENT_NOTE, note);
    noteField.hidden = !(adjustment?.reasons.includes('own') ?? false);
    choices.addEventListener('change', () => {
      const own = choices.querySelector<HTMLInputElement>('input[value="own"]')!.checked;
      noteField.hidden = !own;
      if (own) note.focus();
    });
    set.append(choices, noteField);
    return set;
  };

  const recordNode = (record: EvaluationRecordProjection): HTMLElement => {
    const profile = record.profile;
    const readOnly = record.state === 'finalized' || busy;
    const node = el('article', 'evaluation-record');
    node.dataset['recordId'] = record.recordId;
    node.dataset['evaluationState'] = record.state;
    node.dataset['entries'] = String(record.entries);
    const heading = el('h3', undefined, evaluationHeading(record));
    heading.tabIndex = -1;
    node.append(heading, el('p', 'field-note evaluation-revision', evaluationRevisionLine(record)));
    const finalized = evaluationFinalizedLine(record, localInstantLabel);
    if (finalized !== null) node.append(el('p', 'evaluation-finalized', finalized));
    const initial = record.initial;
    node.dataset['initial'] = String(initial !== null);
    node.append(el('p', 'field-note evaluation-ai7', initial === null ? EVALUATION_AI7_PENDING : evaluationAi7RecordLine(initial)));
    // A version begun from a 初评 that completed with gaps says which ranges AI7's draft never read.
    const unread = initial === null ? null : evaluationAi7UnreadLine(initial);
    if (unread !== null) node.append(el('p', 'field-note evaluation-ai7-unread', unread));
    const total = el('p', 'evaluation-total', evaluationTotalLine(profile, record.total));
    total.setAttribute('aria-live', 'polite');
    node.append(total);
    if (record.comparison !== null) {
      const { heading: compareHeading, lines } = evaluationComparisonLines(profile, record.comparison);
      const section = el('section', 'evaluation-comparison');
      const list = el('ul');
      for (const line of lines) list.append(el('li', undefined, line));
      section.append(el('h4', undefined, compareHeading), list);
      node.append(section);
    }
    // Each scored item: 得分 out of 满分, or 不评 with its reason; its band; its 评语.
    const items = el('div', 'evaluation-items');
    record.profile.items.forEach((item, index) => {
      const content = record.content.items[index]!;
      const set = el('fieldset', 'evaluation-item');
      set.dataset['itemId'] = item.itemId;
      set.append(el('legend', undefined, evaluationItemLegend(item)));
      const score = el('input');
      score.type = 'number';
      score.min = '0';
      score.max = String(item.fullMarks);
      score.step = '0.5';
      score.inputMode = 'decimal';
      score.value = content.score === null ? '' : String(content.score);
      score.disabled = readOnly || content.notRated !== null;
      score.dataset['evaluationField'] = 'score';
      const band = el('span', 'status-pill evaluation-band', content.score === null ? '' : evaluationBandLabel(profile, content.score, item.fullMarks));
      band.hidden = content.score === null;
      const invalid = el('p', 'field-note evaluation-score-invalid', evaluationScoreInvalidLine(item.fullMarks));
      invalid.id = `evaluation-score-invalid-${record.recordId}-${item.itemId}`;
      invalid.hidden = true;
      const notRated = el('input');
      notRated.type = 'checkbox';
      notRated.checked = content.notRated !== null;
      notRated.disabled = readOnly;
      notRated.dataset['evaluationField'] = 'not-rated';
      const reason = el('input');
      reason.type = 'text';
      reason.value = content.notRated ?? '';
      reason.disabled = readOnly || content.notRated === null;
      reason.dataset['evaluationField'] = 'not-rated-reason';
      const scoreRow = el('div', 'evaluation-score-row');
      const notRatedLabel = el('label', 'evaluation-choice');
      notRatedLabel.append(notRated, el('span', undefined, EVALUATION_NOT_RATED));
      scoreRow.append(field(`${EVALUATION_SCORE}（0 – ${item.fullMarks}）`, score), band, notRatedLabel);
      const reasonField = field(EVALUATION_NOT_RATED_REASON, reason);
      reasonField.hidden = content.notRated === null;
      // AI7's score beside the editor's (EVAL-006): the record keeps the editor's, and where they differ the editor may say why.
      const ai7 = initial?.items.find((entry) => entry.itemId === item.itemId) ?? null;
      const beside: HTMLElement[] = [];
      if (ai7 !== null) {
        const line = el('p', 'evaluation-item-ai7', evaluationAi7ItemLine(ai7, item.fullMarks));
        line.dataset['sufficiency'] = ai7.sufficiency;
        beside.push(line);
        if (ai7.comment !== null) beside.push(el('p', 'field-note evaluation-item-ai7-comment', `AI7 评语：${ai7.comment}`));
        // What AI7's score rests on (EVAL-006): each note it made toward the item, with the range it read it in.
        if (ai7.evidence.length > 0) {
          const evidence = el('details', 'evaluation-item-ai7-evidence');
          const list = el('ul');
          for (const entry of ai7.evidence) {
            const line = el('li', undefined, evaluationAi7EvidenceLine(entry));
            line.dataset['unitOrdinal'] = String(entry.unitOrdinal);
            line.dataset['blockIds'] = entry.blockIds.join(' ');
            list.append(line);
          }
          evidence.append(el('summary', undefined, evaluationAi7EvidenceSummary(ai7.evidence.length, ai7.evidenceCount)), list);
          beside.push(evidence);
        }
        beside.push(adjustmentNode(record, item.itemId, content.adjustment ?? null, readOnly));
      }
      set.append(scoreRow, invalid, ...beside, reasonField, field(EVALUATION_COMMENT, textarea(content.comment ?? '', 'comment')));
      set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="comment"]')!.disabled = readOnly;
      // Only a score the scale admits reaches a band; any other says why and counts for nothing until it is corrected,
      // while the form keeps it as typed for the service's own refusal (Issue #638).
      const showScore = (): void => {
        const typed = evaluationScoreFeedback(score.value, score.validity.badInput, item.fullMarks);
        band.hidden = typed.score === null;
        band.textContent = typed.score === null ? '' : evaluationBandLabel(profile, typed.score, item.fullMarks);
        invalid.hidden = typed.line === null;
        invalid.textContent = typed.line ?? '';
        if (typed.line !== null) {
          score.setAttribute('aria-invalid', 'true');
          score.setAttribute('aria-describedby', invalid.id);
        } else {
          score.removeAttribute('aria-invalid');
          score.removeAttribute('aria-describedby');
        }
      };
      score.addEventListener('input', () => {
        showScore();
        refresh(node, record);
      });
      notRated.addEventListener('change', () => {
        score.disabled = notRated.checked;
        reason.disabled = !notRated.checked;
        reasonField.hidden = !notRated.checked;
        if (notRated.checked) {
          score.value = '';
          showScore();
          reason.focus();
        }
        refresh(node, record);
      });
      items.append(set);
    });
    node.append(items);
    // The risk items: 低 / 中 / 高 with a statement; a 高 one waits on a person's review before 推荐出版.
    const risks = el('section', 'evaluation-risks');
    risks.append(el('h4', undefined, EVALUATION_RISKS_HEADING));
    record.profile.risks.forEach((risk, index) => {
      const content = record.content.risks[index]!;
      const set = el('fieldset', 'evaluation-risk');
      set.dataset['riskId'] = risk.riskId;
      set.append(el('legend', undefined, risk.label));
      const levels = el('div', 'evaluation-levels');
      for (const level of ['low', 'medium', 'high'] as const) {
        levels.append(radio(`evaluation-risk-${record.recordId}-${risk.riskId}`, level, EVALUATION_RISK_LEVELS[level], content.level === level, readOnly));
      }
      const reviewed = el('input');
      reviewed.type = 'checkbox';
      reviewed.checked = content.reviewed;
      reviewed.disabled = readOnly || content.level !== 'high';
      reviewed.dataset['evaluationField'] = 'reviewed';
      const reviewedLabel = el('label', 'evaluation-choice');
      reviewedLabel.append(reviewed, el('span', undefined, EVALUATION_RISK_REVIEWED));
      const statement = textarea(content.statement ?? '', 'statement');
      statement.disabled = readOnly;
      set.append(levels, field(EVALUATION_RISK_STATEMENT, statement), reviewedLabel);
      levels.addEventListener('change', () => {
        const level = levels.querySelector<HTMLInputElement>('input:checked')?.value;
        reviewed.disabled = level !== 'high';
        if (level !== 'high') reviewed.checked = false;
        refresh(node, record);
      });
      reviewed.addEventListener('change', () => refresh(node, record));
      risks.append(set);
    });
    node.append(risks);
    const lists = el('div', 'evaluation-lists');
    for (const [label, name, lines] of [
      [EVALUATION_READINESS, 'readiness', record.content.readiness],
      [EVALUATION_STRENGTHS, 'strengths', record.content.strengths],
      [EVALUATION_WEAKNESSES, 'weaknesses', record.content.weaknesses],
    ] as const) {
      const control = textarea(lines.join('\n'), name, 3);
      control.disabled = readOnly;
      lists.append(field(label, control));
    }
    const verdict = textarea(record.content.verdict ?? '', 'verdict', 3);
    verdict.disabled = readOnly;
    lists.append(field(EVALUATION_VERDICT, verdict));
    node.append(lists);
    // The conclusion: none chosen until the editor chooses (EVAL-007).
    const conclusion = el('fieldset', 'evaluation-conclusion');
    conclusion.append(el('legend', undefined, EVALUATION_CONCLUSION_LEGEND));
    for (const option of record.profile.conclusions) {
      const choice = radio(`evaluation-conclusion-${record.recordId}`, option.conclusion, option.label, record.content.conclusion === option.conclusion, readOnly);
      choice.dataset['conclusion'] = option.conclusion;
      // AI7's suggestion is marked as AI7's and never chosen for the editor (EVAL-007).
      if (initial?.suggestedConclusion === option.conclusion) choice.append(el('span', 'status-pill evaluation-ai7-suggested', EVALUATION_AI7_SUGGESTED));
      conclusion.append(choice);
    }
    if (initial !== null) conclusion.append(el('p', 'field-note evaluation-ai7-conclusion', evaluationAi7ConclusionLine(record.profile, initial.suggestedConclusion)));
    const blocked = el('p', 'field-note evaluation-recommend-blocked', EVALUATION_RECOMMEND_BLOCKED);
    blocked.id = `evaluation-blocked-${record.recordId}`;
    conclusion.append(blocked);
    node.append(conclusion);
    if (record.state !== 'finalized') {
      const row = el('div', 'button-row evaluation-actions');
      const saveButton = action(EVALUATION_SAVE, 'secondary', 'save', () => void save(record, false));
      const finalize = action(EVALUATION_FINALIZE, 'primary', 'finalize', () => void save(record, true));
      saveButton.disabled = busy;
      finalize.disabled = busy;
      const needsScore = el('p', 'field-note evaluation-finalize-blocked', EVALUATION_FINALIZE_NEEDS_SCORE);
      needsScore.id = `evaluation-finalize-blocked-${record.recordId}`;
      needsScore.hidden = true;
      row.append(saveButton, finalize);
      node.append(row, needsScore);
    }
    node.append(technicalDetails('evaluation-facts',
      el('dt', undefined, '评估版本'), el('dd', 'technical-identity', record.recordId),
      el('dt', undefined, '修订版'), el('dd', 'technical-identity', record.revisionId),
      el('dt', undefined, '评估方案摘要'), el('dd', 'technical-identity', record.profile.sha256)));
    refresh(node, record);
    drawn.set(node, JSON.stringify(collect(node, record)));
    return node;
  };

  /** AI7's score of one item in the version on show; `null` when the version began without AI7's 初评 or AI7 gave none. */
  const ai7ScoreOf = (record: EvaluationRecordProjection, itemId: string): number | null =>
    record.initial?.items.find((entry) => entry.itemId === itemId)?.score ?? null;

  /** The reasons ticked for one item, kept only while the editor's score departs from AI7's. */
  const adjustmentOf = (set: HTMLElement, record: EvaluationRecordProjection, itemId: string, score: number | null, notRated: boolean): EvaluationAdjustment | null => {
    const group = set.querySelector<HTMLElement>('.evaluation-adjustment');
    if (group === null || !evaluationItemAdjusted({ score: score !== null && Number.isFinite(score) ? score : null, notRated }, ai7ScoreOf(record, itemId))) return null;
    const reasons = Array.from(group.querySelectorAll<HTMLInputElement>('[data-evaluation-field="adjustment-reason"]:checked'), (input) => input.value as EvaluationAdjustmentReasonId);
    if (reasons.length === 0) return null;
    const note = group.querySelector<HTMLInputElement>('[data-evaluation-field="adjustment-note"]')!.value.trim();
    return { reasons, note: reasons.includes('own') && note.length > 0 ? note : null };
  };

  /** The open version's form holds edits not yet saved: a finalized version holds none. */
  const unsaved = (): boolean => {
    const record = workspace?.record ?? null;
    const node = root.querySelector<HTMLElement>('.evaluation-record');
    return record !== null && node !== null && record.state !== 'finalized' && JSON.stringify(collect(node, record)) !== drawn.get(node);
  };

  /**
   * A version from the list (Issue #638). With nothing unsaved it opens at once; with unsaved edits the open version stays as
   * typed — reopening it changes nothing — and another is opened only once the editor chooses to discard them.
   */
  const openVersion = (summary: EvaluationRecordSummaryProjection): void => {
    if (busy || workspace === null) return;
    if (!unsaved()) {
      leaving = null;
      void show(summary.recordId);
      return;
    }
    leaving = summary.recordId === workspace.record?.recordId ? null : summary;
    paint(leaving === null ? '.evaluation-record h3' : '[data-evaluation-action="stay"]', true);
  };

  /** What the form holds now, in the record's shape. */
  const collect = (node: HTMLElement, record: EvaluationRecordProjection): EvaluationContent => {
    const lines = (name: string): string[] =>
      (node.querySelector<HTMLTextAreaElement>(`.evaluation-lists [data-evaluation-field="${name}"]`)?.value ?? '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const optional = (value: string | undefined): string | null => (value === undefined || value.trim().length === 0 ? null : value);
    return {
      items: record.profile.items.map((item) => {
        const set = node.querySelector<HTMLElement>(`.evaluation-item[data-item-id="${item.itemId}"]`)!;
        const notRated = set.querySelector<HTMLInputElement>('[data-evaluation-field="not-rated"]')!.checked;
        const raw = set.querySelector<HTMLInputElement>('[data-evaluation-field="score"]')!.value;
        const score = notRated || raw === '' ? null : Number(raw);
        return {
          itemId: item.itemId,
          score,
          notRated: notRated ? set.querySelector<HTMLInputElement>('[data-evaluation-field="not-rated-reason"]')!.value : null,
          comment: optional(set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="comment"]')!.value),
          adjustment: adjustmentOf(set, record, item.itemId, score, notRated),
        };
      }),
      risks: record.profile.risks.map((risk) => {
        const set = node.querySelector<HTMLElement>(`.evaluation-risk[data-risk-id="${risk.riskId}"]`)!;
        const level = (set.querySelector<HTMLInputElement>('.evaluation-levels input:checked')?.value ?? null) as EvaluationRiskLevel | null;
        return {
          riskId: risk.riskId,
          level,
          statement: optional(set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="statement"]')!.value),
          reviewed: level === 'high' && set.querySelector<HTMLInputElement>('[data-evaluation-field="reviewed"]')!.checked,
        };
      }),
      readiness: lines('readiness'),
      strengths: lines('strengths'),
      weaknesses: lines('weaknesses'),
      verdict: optional(node.querySelector<HTMLTextAreaElement>('.evaluation-lists [data-evaluation-field="verdict"]')?.value),
      conclusion: (node.querySelector<HTMLInputElement>('.evaluation-conclusion input:checked')?.value ?? null) as EvaluationConclusion | null,
    };
  };

  /** The total as the editor types, and 推荐出版 open only while no 高 risk waits for a person's review. */
  const refresh = (node: HTMLElement, record: EvaluationRecordProjection): void => {
    const content = collect(node, record);
    const total = evaluationTotal(record.profile.items.map((item, index) => ({
      fullMarks: item.fullMarks,
      score: content.items[index]!.score !== null && validEvaluationScore(content.items[index]!.score!, item.fullMarks) ? content.items[index]!.score : null,
      notRated: content.items[index]!.notRated !== null,
    })));
    node.querySelector('.evaluation-total')!.textContent = evaluationTotalLine(record.profile, total);
    // 调分原因 is offered only while the editor's score departs from AI7's (EVAL-006).
    record.profile.items.forEach((item, index) => {
      const group = node.querySelector<HTMLElement>(`.evaluation-item[data-item-id="${item.itemId}"] .evaluation-adjustment`);
      if (group === null) return;
      const entry = content.items[index]!;
      const score = entry.score !== null && Number.isFinite(entry.score) ? entry.score : null;
      group.hidden = !evaluationItemAdjusted({ score, notRated: entry.notRated !== null }, ai7ScoreOf(record, item.itemId));
    });
    // 定稿 waits while every item is 不评, and says why (Issue #638; the Owner's answer of 2026-10-07).
    const finalize = node.querySelector<HTMLButtonElement>('[data-evaluation-action="finalize"]');
    const needsScore = node.querySelector<HTMLElement>('.evaluation-finalize-blocked');
    if (finalize !== null && needsScore !== null) {
      const waits = finalizationNeedsScore(content.items.map((item) => ({ score: item.score, notRated: item.notRated !== null })));
      finalize.disabled = busy || waits;
      needsScore.hidden = !waits;
      if (waits) finalize.setAttribute('aria-describedby', needsScore.id);
      else finalize.removeAttribute('aria-describedby');
    }
    const blocked = recommendationBlocked(content.risks);
    const recommend = node.querySelector<HTMLInputElement>('.evaluation-conclusion [data-conclusion="recommend"] input');
    const note = node.querySelector<HTMLElement>('.evaluation-recommend-blocked');
    if (recommend !== null && note !== null) {
      recommend.disabled = record.state === 'finalized' || busy || blocked;
      if (blocked && recommend.checked) recommend.checked = false;
      note.hidden = !blocked;
      if (blocked) recommend.setAttribute('aria-describedby', note.id);
      else recommend.removeAttribute('aria-describedby');
    }
  };

  const show = async (recordId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    leaving = null;
    setStatus(EVALUATION_STATUS.loading, 'busy');
    try {
      workspace = await api.inspectEvaluation({ recordId });
      busy = false;
      setStatus(EVALUATION_STATUS.opened);
      paint('.evaluation-record h3');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.unavailable);
      setStatus(refusal, 'error');
      paint(null);
    }
  };

  const begin_ = async (fromInitial: boolean): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(fromInitial ? EVALUATION_AI7_STATUS.startingFromInitial : EVALUATION_STATUS.starting, 'busy');
    paint(null);
    try {
      workspace = await api.startEvaluation({ fromInitial });
      busy = false;
      setStatus(evaluationStarted(workspace.record?.ordinal ?? 1), 'success');
      paint('.evaluation-record h3');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.failed);
      setStatus(refusal, 'error');
      paint(fromInitial ? '[data-evaluation-action="start-from-initial"]' : '[data-evaluation-action="start"]');
    }
  };

  const save = async (record: EvaluationRecordProjection, finalize: boolean): Promise<void> => {
    if (busy) return;
    const node = root.querySelector<HTMLElement>(`.evaluation-record[data-record-id="${record.recordId}"]`);
    if (node === null) return;
    const content = collect(node, record);
    busy = true;
    refusal = null;
    setStatus(finalize ? EVALUATION_STATUS.finalizing : EVALUATION_STATUS.saving, 'busy');
    // The submitted content is now fixed. Keep later typing out of the pending save, and retain each control's own
    // disabled state so a refusal restores the draft without enabling a score marked 不评 or another closed choice.
    const controls = Array.from(node.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input, select, textarea, button'),
      (control) => ({ control, disabled: control.disabled }));
    for (const { control } of controls) control.disabled = true;
    try {
      workspace = await api.saveEvaluation({ recordId: record.recordId, expectedEntries: record.entries, content, finalize });
      busy = false;
      leaving = null;
      setStatus(finalize ? evaluationFinalized(record.ordinal) : EVALUATION_STATUS.saved, 'success');
      paint(finalize ? '.evaluation-record h3' : '[data-evaluation-action="save"]');
    } catch (error) {
      // The form keeps what the editor wrote, so a refused save can be corrected where it stands.
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.failed);
      setStatus(refusal, 'error');
      for (const { control, disabled } of controls) control.disabled = disabled;
      const note = el('p', 'attention-note evaluation-refusal', refusal);
      note.setAttribute('role', 'alert');
      root.querySelector('.evaluation-refusal')?.remove();
      node.before(note);
    }
  };

  return {
    /** The drawer's bar started AI7's 初评: read it again now, keeping the form the editor is filling in. */
    refresh(): void {
      if (busy || workspace === null || !root.isConnected) return;
      const current = workspace;
      void api.inspectEvaluation({ recordId: current.record?.recordId ?? null, recordsBefore: current.recordsBefore }).then((page) => {
        if (!root.isConnected || workspace === null || busy) return;
        workspace = { ...page, record: workspace.record };
        paint(null, true);
      }).catch(() => undefined);
    },
    async load(): Promise<void> {
      root.dataset['evaluation'] = 'loading';
      try {
        workspace = await api.inspectEvaluation({ recordId: null });
        root.dataset['evaluation'] = 'ready';
        paint(null);
      } catch (error) {
        root.dataset['evaluation'] = 'failed';
        root.replaceChildren(el('p', 'attention-note', errorMessage(error, EVALUATION_STATUS.unavailable)));
        throw error;
      }
    },
  };
}
