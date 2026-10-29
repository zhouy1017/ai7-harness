import { hydrateAnalysisRevision, appendBaselineSummaryPage } from './analysis-paging.js';
import {
  ANALYSIS_MORE_REPORT_ROWS,
  ANALYSIS_READ_FAILED,
  ANALYSIS_MORE_RANGES,
  ANALYSIS_READING,
  ANALYSIS_MORE_CHOICES,
  ANALYSIS_EARLIER_HISTORY,
  ANALYSIS_PAGED_LIST_LABELS,
} from './analysis-paging-labels.js';
import { researchStatusLine, researchPlanLine } from '../shared/research-status.js';
import {
  type AnalysisReusePlanCounts,
  type BaselineAnalysisUpdateMode,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisWireProjection as BaselineAnalysisProjection,
  type HydratedAnalysisRevisionProjection as BaselineAnalysisResultSetRevisionProjection,
  type AnalysisRunReportSummaryProjection as RunReportProjection,
  type AnalysisReusePlanSummaryProjection as AnalysisReusePlanProjection,
  type BaselineAnalysisUpdateRequest,
  type DefaultExecutionRuleReference,
  type QuickStartBaselineAnalysisWireResult as QuickStartBaselineAnalysisResult,
  BASELINE_ANALYSIS_TASK_GOAL,
  type ServiceWireJobProjection as ServiceJobProjection,
  type ManuscriptWindowProjection,
  type ManuscriptReimportCommitProjection,
  type TaskPlanKind,
} from '../shared/protocol.js';
import { mountAnalysisFeedback, analysisFeedbackEngaged } from './analysis-feedback.js';
import { BACKGROUND_REPORT_HEADING, BACKGROUND_PREPARED_PLAN_NOTE } from './background-analysis-labels.js';
import { AnalysisFollower } from './analysis-follow.js';
import type { ReviewFocus } from './review-workspace.js';
import { ANALYSIS_TAB_SHOWN_EVENT, mountCustomAnalysisTab } from './custom-analysis.js';
import { CUSTOM_TAB_LABEL } from './custom-analysis-labels.js';
import { taskPlanQuickStartFellBack, TASK_DRAWER_TITLE, taskPlanSummaryLine, TASK_PLAN_DRIFT_HEADING } from './task-drawer-labels.js';
import { REVIEW_ACTION_LABELS } from './review-labels.js';
import {
  RUN_REPORT_CLASSIFICATION_LABELS,
  localInstantLabel,
  RUN_REPORT_STAGE_LABELS,
  RUN_REPORT_STAGE_STATE_LABELS,
  durationLabel,
  runReportUnitsSentence,
  analysisFourSentences,
  ANALYSIS_ENTITY_KIND_LABELS,
  analysisProvenanceSummary,
  analysisKindSubtitle,
  ANALYSIS_EDITORIAL_NOT_DO,
  runStepIsStale,
  RUN_LIVENESS_STAGE_LABELS,
  elapsedLabel,
  attemptStateLabel,
} from './plan-preview-labels.js';
import type { mountTaskDrawer } from './task-drawer.js';

/**
 * ②A's seven tabs (editor-surfaces §3). The first six are what the baseline is for; the last holds
 * everything about how it was made and how it is brought up to date. The order is the specification's.
 */
const ANALYSIS_TABS = [
  ['synopsis', '梗概'],
  ['entities', '人物与名称'],
  ['events', '事件'],
  ['relationships', '关系'],
  ['settings', '设定'],
  ['chapters', '各章'],
  // 自定义分析维度 (Issue #922, slice 7f): each enabled dimension's latest result on this Book, its 运行 and its per-unit answers.
  ['custom', CUSTOM_TAB_LABEL],
  ['history', '历史与更新'],
] as const;

export type AnalysisTabId = (typeof ANALYSIS_TABS)[number][0];

/**
 * The tab the editor chose, per Book. The card re-renders on every refresh while a Run executes, and a
 * re-render that threw the editor back to the first tab would take their place away four times a second.
 */
export const analysisTabChoice = new Map<string, AnalysisTabId>();

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

/** What the shell lends ②A's baseline-analysis card: its screen, Task Drawer, status line and the routes it leaves by. */
export interface BaselineAnalysisCardOptions {
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  jumpToManuscript(bookId: string, target: { manuscriptId: string | null; blockId: string; markId: string | null }, gone?: string): Promise<boolean>;
  leaveReturnChip(bookId: string, manuscriptId: string, branchId: string): Promise<void>;
  openEditorWindow(initialWindow: ManuscriptWindowProjection, bookTitle: string, recoveryAttentionId?: string, entryNotice?: string, openMarkId?: string, reimport?: ManuscriptReimportCommitProjection): Promise<void>;
  openTaskPlan(bookId: string, kind: TaskPlanKind, ref: string | null, note?: string): void;
  quickStartStartedLine(rule: DefaultExecutionRuleReference, projection: BaselineAnalysisProjection): string;
  renderBookReview(bookId: string, bookTitle: string, focus?: ReviewFocus | null, procedureId?: string | null): void;
  rendererErrorMessage(error: unknown, fallback: string): string;
  readonly screen: HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  readonly taskDrawer: ReturnType<typeof mountTaskDrawer>;
  taskPlanOpenButton(kind: TaskPlanKind, open: () => void, startable?: boolean): HTMLButtonElement;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
}

/** ②A's baseline-analysis card (Issue #1172): the tabs, run report, plan versions, update controls, history and the follower of a running analysis, moved verbatim from the shell. */
export function createBaselineAnalysisCard(options: BaselineAnalysisCardOptions) {
  const {
      awaitServiceJob, jumpToManuscript, leaveReturnChip, openEditorWindow, openTaskPlan, quickStartStartedLine, renderBookReview,
      rendererErrorMessage, screen, setStatus, taskDrawer, taskPlanOpenButton, technicalDetails
  } = options;

  /**
   * The Technical Identity Layer's form of one item's provenance (V2-UX-LAYER-006): every source range
   * it records, exact and unabridged. It is what a provenance list's disclosure holds, one step below
   * the decision reading `analysisProvenanceSummary` gives the same item.
   */
  function analysisRanges(ranges: ReadonlyArray<{ blockId: string; fromGrapheme: number | null; toGrapheme: number | null }>): string {
    if (ranges.length === 0) return '无精确范围';
    return ranges.map((range) => range.fromGrapheme === null || range.toGrapheme === null
      ? `${range.blockId}（整块）`
      : `${range.blockId} · 字素 ${range.fromGrapheme}–${range.toGrapheme}`).join('；');
  }

  function analysisReturnButton(
    blockId: string,
    manuscriptId: string,
    branchId: string,
    bookTitle: string,
  ): HTMLButtonElement {
    const returnToRange = button('回到稿件范围', 'quiet', async () => {
      const origin = screen.firstElementChild;
      returnToRange.disabled = true;
      setStatus('正在打开对应稿件范围…', 'busy');
      try {
        const opened = await window.ai7.getManuscriptWindowAt({ manuscriptId, branchId, target: { kind: 'block', blockId } });
        await leaveReturnChip(opened.bookId, manuscriptId, branchId);
        if (screen.firstElementChild !== origin) return;
        await openEditorWindow(opened, bookTitle);
      } catch (error) {
        returnToRange.disabled = false;
        setStatus(rendererErrorMessage(error, '无法打开对应稿件范围。'), 'error');
      }
    });
    returnToRange.dataset['analysisAction'] = 'return-to-range';
    returnToRange.dataset['analysisBlockId'] = blockId;
    return returnToRange;
  }

  function reuseCountsText(counts: AnalysisReusePlanCounts): string {
    return `复用 ${counts.reused} · 重算 ${counts.recomputed} · 失效 ${counts.invalidated} · 绕过 ${counts.bypassed}`;
  }

  /** What an update keeps and what it reads again, in the editor's words; `null` is a plan nobody can state yet. */
  function updateReuseReading(expected: AnalysisReusePlanCounts | null, mode: BaselineAnalysisUpdateMode): string {
    if (expected === null) return mode === 'reanalyze-range' ? '选好范围后，这里会说明沿用多少、重新分析多少。' : '现在无法说明会沿用多少、重新分析多少。';
    return `会沿用上一份里 ${expected.reused} 个阅读范围的结果，重新分析 ${expected.recomputed} 个。`;
  }

  function rangeText(range: BaselineAnalysisSelectedRange | null): string {
    return range === null ? '全部内容块' : `内容块 ${range.startPosition}–${range.endPosition}`;
  }

  /** The primary branch the Book's analysis navigates into: the frozen checkpoint's, else the working head's. */
  function analysisBranchId(projection: BaselineAnalysisProjection): string | null {
    return projection.checkpoint?.branchId ?? projection.updateControls?.working.branchId ?? null;
  }

  /**
   * The tab strip and its panels. Every panel is always in the document and only `hidden` changes, so a
   * record on an unselected tab is still there to be read, searched and asserted (V2-UX-LAYER-007). Arrow
   * keys move between tabs and only the selected tab is in the Tab order, the pattern a tab list is read by.
   */
  function analysisTabs(card: HTMLElement, bookId: string, initial: AnalysisTabId): { panels: Record<AnalysisTabId, HTMLElement>; select: (tab: AnalysisTabId) => void } {
    const list = element('div', 'analysis-tabs');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', '基线分析');
    const tabs = {} as Record<AnalysisTabId, HTMLButtonElement>;
    const panels = {} as Record<AnalysisTabId, HTMLElement>;
    const select = (chosen: AnalysisTabId): void => {
      card.dataset['analysisTab'] = chosen;
      for (const [id] of ANALYSIS_TABS) {
        const selected = id === chosen;
        tabs[id].setAttribute('aria-selected', selected ? 'true' : 'false');
        tabs[id].tabIndex = selected ? 0 : -1;
        panels[id].hidden = !selected;
      }
    };
    ANALYSIS_TABS.forEach(([id, label], index) => {
      const tab = element('button', 'analysis-tab', label);
      tab.type = 'button';
      tab.id = `analysis-tab-${id}`;
      tab.dataset['analysisTab'] = id;
      tab.dataset['analysisAction'] = 'select-tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `analysis-panel-${id}`);
      tab.addEventListener('click', () => {
        analysisTabChoice.set(bookId, id);
        select(id);
        panels[id].dispatchEvent(new Event(ANALYSIS_TAB_SHOWN_EVENT));
      });
      tab.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? ANALYSIS_TABS.length - 1
          : step === 0 ? null : (index + step + ANALYSIS_TABS.length) % ANALYSIS_TABS.length;
        if (target === null) return;
        event.preventDefault();
        const next = ANALYSIS_TABS[target]![0];
        analysisTabChoice.set(bookId, next);
        select(next);
        panels[next].dispatchEvent(new Event(ANALYSIS_TAB_SHOWN_EVENT));
        tabs[next].focus();
      });
      const panel = element('section', 'analysis-panel');
      panel.id = `analysis-panel-${id}`;
      panel.dataset['analysisPanel'] = id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      tabs[id] = tab;
      panels[id] = panel;
      list.append(tab);
    });
    card.append(list, ...ANALYSIS_TABS.map(([id]) => panels[id]));
    select(analysisTabChoice.get(bookId) ?? initial);
    return { panels, select };
  }

  /**
   * One list tab: its reading of how many there are, the items, and their exact ranges one step away. Each item carries its
   * place in the revision, which is where its Analysis Feedback Card attaches (Issue #94, S38).
   */
  function renderAnalysisListPanel(
    panel: HTMLElement,
    dimension: 'entities' | 'events' | 'relationships' | 'settings',
    heading: string,
    emptyReading: string,
    items: ReadonlyArray<{ reading: string; name: string; ranges: BaselineAnalysisResultSetRevisionProjection['synthesis']['entities'][number]['sourceRanges']; blockId: string | undefined }>,
    returnButton: (blockId: string) => HTMLButtonElement,
  ): HTMLElement {
    panel.append(element('h4', undefined, `${heading} · ${items.length}`));
    const list = element('ul', 'analysis-list');
    if (items.length === 0) list.append(element('li', undefined, emptyReading));
    const exact: HTMLElement[] = [];
    items.forEach((entry, index) => {
      const item = element('li');
      item.dataset['analysisItemKey'] = `${dimension}/${index}`;
      item.append(element('span', undefined, `${entry.reading} `));
      if (entry.blockId !== undefined) item.append(returnButton(entry.blockId));
      list.append(item);
      exact.push(element('dt', undefined, entry.name), element('dd', 'technical-identity', analysisRanges(entry.ranges)));
    });
    panel.append(list);
    if (exact.length > 0) panel.append(technicalDetails('analysis-facts', ...exact));
    return list;
  }

  /**
   * A Run Report as an editor reads it (ADR 0066 §Run Report): what each stage did and how long it took,
   * how the reading ranges were accounted for, what failed and what was adjusted, what the sample found,
   * and what the model would do differently next time. The report counts and never restates, so nothing
   * here can carry manuscript text. Token usage, per-range rows, instants, identities and both digests
   * stay one step away, exact and unabridged (V2-UX-ANALYSIS-025, V2-UX-LAYER-007).
   */
  function renderRunReport(report: RunReportProjection): HTMLElement {
    const disclosure = element('details', 'analysis-run-report');
    disclosure.dataset['runReportDigest'] = report.reportDigest;
    disclosure.dataset['runReportRun'] = report.runRecordId;
    disclosure.dataset['runReportClassification'] = report.classification;
    disclosure.append(element('summary', undefined, `查看运行报告 · ${RUN_REPORT_CLASSIFICATION_LABELS[report.classification]} · ${localInstantLabel(report.recordedAt)}`));
    disclosure.append(element('p', 'research-status', researchStatusLine(report)));
    if (report.factualAssurance?.disclosure != null) disclosure.append(element('p', 'fact-lens-disclosure', report.factualAssurance.disclosure));
    const stages = element('ul', 'analysis-list analysis-run-report-stages');
    for (const stage of report.stages) {
      const item = element('li', undefined, `${RUN_REPORT_STAGE_LABELS[stage.stage]}：${RUN_REPORT_STAGE_STATE_LABELS[stage.state]}${stage.wallMs === null ? '' : ` · 用时 ${durationLabel(stage.wallMs)}`}`);
      item.dataset['runReportStage'] = stage.stage;
      item.dataset['runReportStageState'] = stage.state;
      stages.append(item);
    }
    const failures = element('ul', 'analysis-list analysis-run-report-failures');
    if (report.failures.length === 0) failures.append(element('li', undefined, '无'));
    for (const failure of report.failures) {
      const item = element('li', undefined, `${RUN_REPORT_STAGE_LABELS[failure.stage]}：${failure.reason}`);
      item.dataset['runReportFailureCode'] = failure.code;
      failures.append(item);
    }
    const adaptations = element('ul', 'analysis-list analysis-run-report-adaptations');
    if (report.adaptations.length === 0) adaptations.append(element('li', undefined, '无'));
    for (const adaptation of report.adaptations) {
      adaptations.append(element('li', undefined, `第 ${adaptation.unitOrdinal} 个阅读范围安全重试一次 · ${localInstantLabel(adaptation.recordedAt)}`));
    }
    for (const clarification of report.modelClarifications ?? []) {
      adaptations.append(element('li', 'analysis-run-report-clarification', clarification.line));
    }
    const sample = report.assurance;
    const sampleReading = sample.state === 'not-run' || sample.size === 0
      ? '这次运行没有抽样复核。'
      : `从 ${sample.candidateCount} 条发现中抽了 ${sample.size} 条复核，${sample.upheld} 条成立。`;
    const redone = element('ul', 'analysis-list analysis-run-report-if-redone');
    redone.dataset['runReportIfRedone'] = report.ifRedone.state;
    if (report.ifRedone.state === 'closed') {
      if (report.ifRedone.items.length === 0) redone.append(element('li', undefined, '模型没有提出不同的做法。'));
      for (const suggestion of report.ifRedone.items) redone.append(element('li', undefined, `${suggestion.suggestion}（依据：${suggestion.basis}）`));
    } else {
      redone.append(element('li', undefined, report.ifRedone.reason));
    }
    const findings = report.findingCounts.length === 0
      ? '这次运行没有记录发现。'
      : `这次运行共记录 ${report.findingCounts.reduce((total, entry) => total + entry.count, 0)} 条发现，分 ${report.findingCounts.length} 类。`;
    const usageRows = (Object.keys(report.usagePerStage) as Array<keyof typeof report.usagePerStage>).flatMap((stage) => {
      const usage = report.usagePerStage[stage];
      if (stage === 'platform-tools') {
        // Local retrieval sends nothing: a Run whose tools reached no network reads 本机检索, never 联网检索 (#893).
        const local = (usage.retrievalCalls ?? 0) + (usage.exactFetchCalls ?? 0) > 0
          ? `本机检索 ${usage.retrievalCalls ?? 0} 次 · 精确取文 ${usage.exactFetchCalls ?? 0} 次 · 被拒 ${usage.refusedRetrievalCalls ?? 0} 次` : null;
        const web = local === null || Object.keys(usage.searchCalls ?? {}).length > 0 || (usage.refusedSearchCalls ?? 0) > 0 || (usage.fetchCount ?? 0) > 0
          ? `${Object.entries(usage.searchCalls ?? {}).map(([id, calls]) => `${id}：${calls} 次检索`).join(' · ') || '0 次检索'} · 已拒绝检索 ${usage.refusedSearchCalls ?? 0} 次 · 网页取回 ${usage.fetchCount ?? 0} 次 / ${usage.fetchBytes ?? 0} 字节` : null;
        return [element('dt', undefined, web === null ? '用量 · 本机检索' : '用量 · 联网检索'), element('dd', undefined,
          `${[web, local].filter((part) => part !== null).join(' · ')} · 输入 ${usage.inputTokens} · 输出 ${usage.outputTokens}`)];
      }
      return [element('dt', undefined, `用量 · ${stage}`), element('dd', 'technical-identity', `${usage.requests} 次模型请求 · 输入 ${usage.inputTokens} · 输出 ${usage.outputTokens}`)];
    });
    disclosure.append(
      element('h5', undefined, '各阶段'), stages,
      element('h5', undefined, '阅读范围'), element('p', 'analysis-run-report-units', runReportUnitsSentence(report.units)),
      element('h5', undefined, '发现与抽样复核'), element('p', undefined, findings), element('p', 'analysis-run-report-sample', sampleReading),
      element('h5', undefined, '失败'), failures,
      element('h5', undefined, '运行中的调整'), adaptations,
      element('h5', undefined, '如果重做'), redone,
      // A Run a 后台分析登记 started names the Enrollment, its share and how it ended against its ceiling (Issue #864).
      ...(report.background === undefined ? [] : [element('h5', undefined, BACKGROUND_REPORT_HEADING), backgroundReportList(report.background)]),
      technicalDetails(
        'analysis-facts',
        element('dt', undefined, '运行报告'), element('dd', 'technical-identity', `${report.schema} · 摘要 ${report.reportDigest} · 账目摘要 ${report.accountingDigest}`),
        element('dt', undefined, '绑定'), element('dd', 'technical-identity', `Run ${report.runRecordId} · Task Intent ${report.taskIntentId} · 执行尝试 ${report.attemptId ?? '无'} · 结果集修订版 ${report.resultSetRevisionId ?? '无'}`),
        element('dt', undefined, '记录时刻'), element('dd', 'technical-identity', report.recordedAt),
        element('dt', undefined, '阶段时刻'), element('dd', 'technical-identity', report.stages.map((stage) => `${stage.stage} ${stage.startedAt ?? '—'} → ${stage.settledAt ?? '—'} · ${stage.wallMs ?? '—'} ms`).join('；')),
        ...usageRows,
        element('dt', undefined, '发现分类'), element('dd', 'technical-identity', report.findingCounts.length === 0 ? '无' : report.findingCounts.map((entry) => `${entry.kind} ${entry.count}`).join('；')),
        element('dt', undefined, '抽样'), element('dd', 'technical-identity', `${sample.state} · seed ${sample.seed ?? '无'} · ${sample.size}/${sample.candidateCount}`),
        element('dt', undefined, '逐范围账目'), element('dd', 'technical-identity', (report.unitRows ?? []).map((row) => `单元 ${row.unitOrdinal} ${row.state}/${row.lineage} · ${row.attempts} 回合 · ${row.wallMs ?? '—'} ms${row.usage === null ? '' : ` · ${row.usage.inputTokens}/${row.usage.outputTokens}`}${row.gapCode === null ? '' : ` · ${row.gapCode}`}`).join('；')),
      ),
    );
    if (report.unitPage?.nextOrdinal != null) {
      const more = button(ANALYSIS_MORE_REPORT_ROWS, 'secondary', async () => {
        more.disabled = true;
        try {
          const page = await window.ai7.getAnalysisRunReportRows({ taskIntentId: report.taskIntentId, afterOrdinal: report.unitPage!.nextOrdinal! });
          if (!more.isConnected) return;
          if (page.reportDigest !== report.reportDigest) throw new Error(ANALYSIS_READ_FAILED);
          const updated = renderRunReport({ ...report, unitRows: [...(report.unitRows ?? []), ...page.rows],
            unitPage: { shown: (report.unitRows?.length ?? 0) + page.rows.length, total: report.unitPage!.total, nextOrdinal: page.next } });
          if (updated instanceof HTMLDetailsElement) updated.open = true;
          disclosure.replaceWith(updated);
        } catch { setStatus(ANALYSIS_READ_FAILED, 'error'); more.disabled = false; }
      });
      disclosure.append(more);
    }
    return disclosure;
  }

  /** The Run Report's lines for a Run a 后台分析登记 started (Issue #864): counts and words only. */
  function backgroundReportList(lines: ReadonlyArray<string>): HTMLElement {
    const list = element('ul', 'analysis-list analysis-run-report-background');
    for (const line of lines) list.append(element('li', undefined, line));
    return list;
  }

  /** The report where a Run has one, and the exact reason in the reader's language where it has none. */
  function runReportOrReason(report: RunReportProjection | null, absentReason: string | null): HTMLElement {
    if (report !== null) return renderRunReport(report);
    const absent = element('p', 'field-note analysis-run-report-absent', absentReason ?? '没有运行报告。');
    absent.dataset['runReportAbsent'] = 'true';
    return absent;
  }

  /**
   * The six reading tabs of one Result Set Revision (V2-UX-ANALYSIS-001, 004, 025). The decision layer
   * is the four sentences, the synopsis, the four lists and the chapters with what is still unread; the
   * units' technical names, lineage, digests, reducer stages, reuse counts and token usage wait one step
   * away. The revision's contradictions and open questions are not listed here, in either layer: they are
   * the model-free leads of 审阅's 情节逻辑与前后一致 (V2-UX-REV-011), which turns each into a 批注 on the
   * manuscript with its exact ranges as its basis. ②A keeps their counts — the card's `data-conflict-count`,
   * the 可信程度 sentence and the technical assurance row — and the sentence's pointer opens 审阅.
   */
  function renderBaselineAnalysisOverview(
    card: HTMLElement,
    panels: Record<AnalysisTabId, HTMLElement>,
    selectTab: (tab: AnalysisTabId) => void,
    projection: BaselineAnalysisProjection,
    revision: BaselineAnalysisResultSetRevisionProjection,
    bookTitle: string,
    view: { historical: boolean; current: boolean },
  ): void {
    const manuscriptId = revision.manuscriptPin.manuscriptId;
    const branchId = analysisBranchId(projection) ?? '';
    const returnButton = (blockId: string): HTMLButtonElement => analysisReturnButton(blockId, manuscriptId, branchId, bookTitle);
    card.dataset['resultRevisionId'] = projection.resultSetRevision?.revisionId ?? revision.revisionId;
    card.dataset['resultRevisionDigest'] = projection.resultSetRevision?.digest ?? revision.digest;
    card.dataset['resultRevisionOrdinal'] = String(projection.resultSetRevision?.ordinal ?? revision.ordinal);
    card.dataset['gapCount'] = String(revision.coverage.gapCount);
    card.dataset['conflictCount'] = String(projection.listPages[`${projection.inspectedRevision === null ? 'resultSetRevision' : 'inspectedRevision.revision'}.conflicts`]?.total
      ?? revision.conflicts.length);
    card.dataset['freshnessState'] = revision.freshness.state;
    card.dataset['updateMode'] = revision.update.mode;
    card.dataset['reusedCount'] = String(revision.update.counts.reused);
    card.dataset['recomputedCount'] = String(revision.update.counts.recomputed);
    card.dataset['invalidatedCount'] = String(revision.update.counts.invalidated);
    card.dataset['bypassedCount'] = String(revision.update.counts.bypassed);
    if (view.historical) {
      card.dataset['inspectedRevisionId'] = revision.revisionId;
      card.dataset['inspectedRevisionOrdinal'] = String(revision.ordinal);
      card.dataset['inspectedCurrent'] = view.current ? 'true' : 'false';
    }

    const synopsis = panels.synopsis;
    if (view.historical) {
      synopsis.append(
        element('h4', undefined, `历史修订版 Revision ${revision.ordinal}（只读）`),
        element('p', 'attention-note', view.current
          ? `Revision ${revision.ordinal} 是当前最新的结果集修订版；此视图为只读。`
          : `Revision ${revision.ordinal} 已被后续修订版取代；它按其原始稿件 pin ${revision.manuscriptPin.revisionLabel} 呈现，不是当前事实，也未被删除。`),
      );
    }

    // The four sentences, each on its own axis so none of them collapses into one badge (ANALYSIS-001).
    const sentences = element('div', 'analysis-axes');
    for (const reading of analysisFourSentences(revision)) {
      const section = element('section', `analysis-axis analysis-axis-${reading.axis}`);
      const axis = reading.axis === 'coverage' ? revision.coverage : reading.axis === 'reducer-closure' ? revision.reducerClosure
        : reading.axis === 'freshness' ? revision.freshness : revision.assurance;
      section.dataset['analysisAxis'] = reading.axis;
      section.dataset['axisState'] = axis.state;
      section.append(
        element('h5', undefined, reading.heading),
        element('p', 'analysis-axis-sentence', reading.sentence),
        element('p', 'field-note analysis-axis-next', `下一步：${reading.nextAction}`),
      );
      if (reading.target !== null) {
        const target = reading.target;
        const go = button(target === 'history' ? '去「历史与更新」' : '去「各章」', 'quiet', () => selectTab(target));
        go.dataset['analysisAction'] = `go-${target}`;
        section.append(go);
      }
      // 可信程度 points at 审阅's 情节逻辑与前后一致, where the leads it counts are handled (V2-UX-REV-011).
      if (reading.axis === 'assurance') {
        const review = button(REVIEW_ACTION_LABELS['open-review'], 'quiet', () => renderBookReview(projection.bookId, bookTitle));
        review.dataset['analysisAction'] = 'open-review';
        section.append(review);
      }
      sentences.append(section);
    }
    const synthesis = element('section', 'analysis-synthesis');
    if (revision.synthesis.synopsis.length > 0) synthesis.dataset['analysisItemKey'] = 'synopsis';
    synthesis.append(
      element('h4', undefined, '全书梗概'),
      element('p', 'analysis-synopsis', revision.synthesis.synopsis.length > 0 ? revision.synthesis.synopsis : '（还没有读完的范围可供合并）'),
    );
    // The editor's judgments of this revision and the Book's Analysis Quality Metric (Issue #94, S38): drawn once the
    // feedback is read, below the synopsis they most often start from.
    const feedbackMetric = element('section', 'analysis-feedback-metric');
    synopsis.append(sentences, synthesis, feedbackMetric);

    // Provenance and identity as counts with disclosure (V2-UX-LAYER-006): every list names its items'
    // ranges as a block count and keeps the identifiers one step below it.
    const entityList = renderAnalysisListPanel(panels.entities, 'entities', '人物与名称', '没有记录人物或名称。', revision.synthesis.entities.map((entity) => ({
      reading: `${entity.name}（${ANALYSIS_ENTITY_KIND_LABELS[entity.kind]}${entity.aliases.length > 0 ? `，别名 ${entity.aliases.join('、')}` : ''}）· ${analysisProvenanceSummary(entity.unitOrdinals, entity.sourceRanges)}`,
      name: entity.name,
      ranges: entity.sourceRanges,
      blockId: entity.sourceRanges[0]?.blockId,
    })), returnButton);
    entityList.classList.add('analysis-entity-list');
    renderAnalysisListPanel(panels.events, 'events', '事件', '没有记录事件。', revision.synthesis.events.map((event) => ({
      reading: `${event.summary}${event.chronology === null ? '' : `（${event.chronology}）`}${event.participants.length === 0 ? '' : ` · ${event.participants.join('、')}`} · ${analysisProvenanceSummary([event.unitOrdinal], event.sourceRanges)}`,
      name: event.summary,
      ranges: event.sourceRanges,
      blockId: event.sourceRanges[0]?.blockId,
    })), returnButton).classList.add('analysis-event-list');
    renderAnalysisListPanel(panels.relationships, 'relationships', '关系', '没有记录关系。', revision.synthesis.relationships.map((relationship) => ({
      reading: `${relationship.subject} — ${relationship.relation} — ${relationship.object} · ${analysisProvenanceSummary(relationship.unitOrdinals, relationship.sourceRanges)}`,
      name: `${relationship.subject} · ${relationship.object}`,
      ranges: relationship.sourceRanges,
      blockId: relationship.sourceRanges[0]?.blockId,
    })), returnButton).classList.add('analysis-relationship-list');
    renderAnalysisListPanel(panels.settings, 'settings', '设定', '没有记录设定。', revision.synthesis.settingClaims.map((claim) => ({
      reading: `${claim.subject}：${claim.claim} · ${analysisProvenanceSummary([claim.unitOrdinal], claim.sourceRanges)}`,
      name: claim.subject,
      ranges: claim.sourceRanges,
      blockId: claim.sourceRanges[0]?.blockId,
    })), returnButton).classList.add('analysis-setting-list');

    // 各章: every reading range by the heading the manuscript gives it, with what the analysis made of it
    // or, where it made nothing, that the range is still unread and why (ANALYSIS-004). The unit's own
    // name, state, lineage, confidence, request digest and usage are its technical half.
    const chapters = panels.chapters;
    const manifestUnits = new Map((view.historical ? [] : projection.coverageManifest?.units ?? []).map((unit) => [unit.ordinal, unit]));
    const adaptedUnits = revision.provenance.adaptations?.unitOrdinals ?? [];
    const units = element('ul', 'analysis-unit-list');
    const appendUnits = (rows: typeof revision.units): void => {
      for (const unit of rows) {
        const item = element('li', 'analysis-unit');
        item.dataset['analysisUnit'] = String(unit.unitOrdinal);
        item.dataset['analysisUnitState'] = unit.state;
        item.dataset['analysisUnitLineage'] = unit.lineage.kind;
        if (unit.lineage.kind === 'reused') item.dataset['analysisUnitReusedFrom'] = `${unit.lineage.revisionOrdinal}/${unit.lineage.unitOrdinal}`;
        if (adaptedUnits.includes(unit.unitOrdinal)) item.dataset['analysisUnitAdaptations'] = '1';
        const manifestUnit = manifestUnits.get(unit.unitOrdinal);
        const title = manifestUnit === undefined
          ? `第 ${unit.unitOrdinal} 个阅读范围`
          : `${manifestUnit.headingText === null ? `第 ${unit.unitOrdinal} 个阅读范围` : `「${manifestUnit.headingText}」`}${manifestUnit.subUnitCount > 1 ? `（第 ${manifestUnit.subUnitIndex}/${manifestUnit.subUnitCount} 部分）` : ''} · 内容块 ${manifestUnit.startPosition}–${manifestUnit.endPosition}`;
        item.append(element('h5', undefined, title));
        const lineage = unit.lineage.kind === 'reused' ? `复用自 Revision ${unit.lineage.revisionOrdinal} / 单元 ${unit.lineage.unitOrdinal}` : '本次重算';
        if (unit.state === 'closed') {
          item.append(element('p', undefined, unit.synopsis));
          const firstRange = unit.entities.flatMap((entity) => entity.sourceRanges)[0] ?? unit.events.flatMap((event) => event.sourceRanges)[0];
          if (firstRange !== undefined) item.append(returnButton(firstRange.blockId));
        } else {
          item.append(element('p', 'attention-note', `尚未分析：${unit.gap.reason}`));
          if (unit.gap.firstBlockId !== null) item.append(returnButton(unit.gap.firstBlockId));
        }
        item.append(technicalDetails(
          'analysis-facts',
          element('dt', undefined, '分析单元'), element('dd', 'technical-identity', unit.state === 'closed'
            ? `单元 ${unit.unitOrdinal} · 已闭合 · 置信 ${unit.confidence} · ${lineage}`
            : `单元 ${unit.unitOrdinal} · 缺口 · ${unit.gap.code} · ${lineage}`),
          element('dt', undefined, '请求摘要'), element('dd', 'technical-identity', unit.requestDigest),
          ...(unit.state !== 'closed' ? [] : [
            element('dt', undefined, '单元内计数'),
            element('dd', 'technical-identity', `实体 ${unit.entities.length} · 事件 ${unit.events.length} · 关系 ${unit.relationships.length} · 设定声明 ${unit.settingClaims.length} · 单元内冲突 ${unit.conflicts.length} · 未解决 ${unit.unresolved.length}${unit.usage === null ? '' : ` · 用量 ${unit.usage.inputTokens}/${unit.usage.outputTokens}`}`),
          ]),
        ));
        units.append(item);
      }
    };
    appendUnits(revision.units);
    // The unread ranges once more as their own list, so the editor sees what is missing without reading
    // every chapter to find it; each returns to the manuscript range it names.
    const gaps = element('ul', 'analysis-list analysis-gap-list');
    if (revision.coverage.gapCount === 0) gaps.append(element('li', undefined, '没有尚未分析的范围。'));
    for (const gap of revision.gaps) {
      const item = element('li');
      item.dataset['analysisGapUnit'] = String(gap.unitOrdinal);
      item.dataset['analysisGapCode'] = gap.code;
      item.append(element('span', undefined, `第 ${gap.unitOrdinal} 个阅读范围 · 内容块 ${gap.startPosition}–${gap.endPosition} · ${gap.reason} `));
      if (gap.firstBlockId !== null) item.append(returnButton(gap.firstBlockId));
      gaps.append(item);
    }
    chapters.append(
      element('h4', undefined, `尚未分析的范围 · ${revision.coverage.gapCount}`), gaps,
      element('h4', undefined, `各章 · ${revision.unitPage.total} 个阅读范围`), units,
    );

    let afterOrdinal = revision.unitPage.nextOrdinal;
    if (afterOrdinal !== null) {
      const more = button(ANALYSIS_MORE_RANGES, 'secondary', async () => {
        if (afterOrdinal === null) return;
        more.disabled = true;
        try {
          const page = await window.ai7.getAnalysisRevisionUnits({ revisionId: revision.revisionId, afterOrdinal });
          if (!more.isConnected) return;
          if (page.revisionId !== revision.revisionId || page.next !== null && page.next <= afterOrdinal) throw new Error(ANALYSIS_READ_FAILED);
          let manifestCursor = afterOrdinal;
          // A read-only earlier revision names its ranges by ordinal on every page, as its first page does.
          while (!view.historical && page.units.some((unit) => !manifestUnits.has(unit.unitOrdinal))) {
            const manifestPage = await window.ai7.getCoverageManifestUnits({ taskIntentId: revision.provenance.taskIntentId, afterOrdinal: manifestCursor });
            if (manifestPage.manifestDigest !== revision.coverageManifestDigest) throw new Error(ANALYSIS_READ_FAILED);
            for (const unit of manifestPage.units) {
              const { blockIds, blockDigests: _digests, overlapBlockIds: _overlap, ...summary } = unit;
              manifestUnits.set(unit.ordinal, { ...summary, blockCount: blockIds.length, firstBlockId: blockIds[0]!, lastBlockId: blockIds.at(-1)! });
            }
            if (manifestPage.next === null) break;
            manifestCursor = manifestPage.next;
          }
          if (!more.isConnected) return;
          appendUnits(page.units);
          afterOrdinal = page.next;
          if (afterOrdinal === null) more.remove();
        } catch { setStatus(ANALYSIS_READ_FAILED, 'error'); }
        finally { more.disabled = false; }
      });
      more.dataset['analysisAction'] = 'more-ranges';
      chapters.append(more);
    }

    // The technical half of the whole revision, closed by default and complete (V2-UX-LAYER-001, 007).
    const runAdaptations = projection.run !== null && projection.run.runRecordId === revision.provenance.runRecordId ? projection.run.adaptations : [];
    card.dataset['adaptationCount'] = String(revision.provenance.adaptations?.count ?? 0);
    const adaptations = element('ul', 'analysis-list analysis-adaptation-list');
    if (adaptedUnits.length === 0) adaptations.append(element('li', undefined, '无计划内调整'));
    for (const unitOrdinal of adaptedUnits) {
      const recorded = runAdaptations.find((adaptation) => adaptation.unitOrdinal === unitOrdinal);
      const item = element('li', undefined, recorded === undefined ? `计划内调整 · 单元 ${unitOrdinal} 安全重试 1 次` : recorded.label);
      item.dataset['analysisAdaptationUnit'] = String(unitOrdinal);
      item.dataset['analysisAdaptationClass'] = 'safe-retry';
      adaptations.append(item);
    }
    const technical = technicalDetails(
      'analysis-facts',
      element('dt', undefined, '分析契约'), element('dd', 'technical-identity', `${projection.kind} · ${revision.contractVersion}`),
      element('dt', undefined, '精确稿件 pin'), element('dd', 'technical-identity', `${revision.manuscriptPin.revisionLabel} · ${revision.manuscriptPin.revisionId} · ${revision.manuscriptPin.revisionDigest}`),
      element('dt', undefined, '结果集修订版'), element('dd', 'technical-identity', `Revision ${revision.ordinal} · ${revision.revisionId}`),
      element('dt', undefined, '修订版摘要'), element('dd', 'technical-identity', revision.digest),
      element('dt', undefined, '覆盖清单摘要'), element('dd', 'technical-identity', revision.coverageManifestDigest),
      element('dt', undefined, 'Schema / Reducer 摘要'), element('dd', 'technical-identity', `${revision.schemaDigest} · ${revision.reducerDigest}`),
      element('dt', undefined, '模型适配器 pin'), element('dd', 'technical-identity', `${revision.adapterPin.route} · ${revision.adapterPin.model} · ${revision.adapterPin.fixtureIdentity} · ${revision.adapterPin.fixtureSha256}`),
      element('dt', undefined, '执行绑定 pin'), element('dd', 'technical-identity', `${revision.bindingPin.bindingDigest} · Session ${revision.bindingPin.harnessSessionId}`),
      element('dt', undefined, '更新方式'), element('dd', 'technical-identity', revision.update.predecessor === null
        ? `${revision.update.modeLabel} · 无前一修订版`
        : `${revision.update.modeLabel} · 后继于 Revision ${revision.update.predecessor.ordinal} · ${rangeText(revision.update.selectedRange)}`),
      element('dt', undefined, '单元血缘'), element('dd', 'technical-identity', reuseCountsText(revision.update.counts)),
      element('dt', undefined, '覆盖'), element('dd', 'technical-identity', `${revision.coverage.unitsClosed}/${revision.coverage.unitsTotal} 个分析单元闭合 · ${revision.coverage.unitsReused} 个按血缘复用 · ${revision.coverage.gapCount} 处缺口 · ${revision.coverage.label}`),
      element('dt', undefined, '归约/综合闭合'), element('dd', 'technical-identity', `${revision.reducerClosure.label} · ${revision.reducerClosure.stages.map((stage) => `${stage.stage}：${stage.state}（${stage.inputCount} 项输入）`).join('；')}`),
      element('dt', undefined, '精确修订版新鲜度'), element('dd', 'technical-identity', `${revision.freshness.label} · 绑定修订版 ${revision.freshness.boundRevisionId} · 当前修订版 ${revision.freshness.currentRevisionId} · 修订日志序号 ${revision.freshness.currentJournalSequence} · 仅通过本地确定性比较判定；不调用 Provider`),
      element('dt', undefined, '语义/证据保证'), element('dd', 'technical-identity', `${revision.assurance.label} · ${revision.assurance.unresolvedConflictCount} 处未解决冲突 · ${revision.assurance.unresolvedItemCount} 项未解决事项 · ${revision.assurance.lowConfidenceUnitCount} 个低置信单元 · ${revision.assurance.crossUnitFindingCount} 条跨单元发现`),
      element('dt', undefined, '策略 pin'), element('dd', 'technical-identity', `${revision.policyPin.operationalScope} · Provider Processing ${revision.policyPin.providerProcessingVersion} · ${revision.policyPin.liveTransmissions} 次实时传输`),
      element('dt', undefined, '用量'), element('dd', 'technical-identity', `${revision.usage.requests} 次模型请求（仅重算单元，含安全重试）· 输入 ${revision.usage.inputTokens} · 输出 ${revision.usage.outputTokens}`),
      element('dt', undefined, '计划版本'), element('dd', 'technical-identity', revision.provenance.planVersion === undefined ? '未记录' : `版本 ${revision.provenance.planVersion}（运行授权所绑定）`),
      element('dt', undefined, '计划内调整'), element('dd', 'technical-identity', revision.provenance.adaptations === undefined ? '未记录' : `${revision.provenance.adaptations.count} 次${adaptedUnits.length === 0 ? '' : ` · 单元 ${adaptedUnits.join('、')}`}`),
      ...(revision.update.predecessor === null ? [] : [
        element('dt', undefined, '前一修订版'), element('dd', 'technical-identity', `Revision ${revision.update.predecessor.ordinal} · ${revision.update.predecessor.revisionId} · ${revision.update.predecessor.digest}`),
        element('dt', undefined, '复用计划摘要'), element('dd', 'technical-identity', revision.update.reusePlanDigest ?? '无'),
      ]),
    );
    technical.classList.add('analysis-revision-technical');
    // The Run's in-envelope adjustments: exact, complete, and out of the decision layer. The leads are not
    // listed here either — 审阅 carries each one as a 批注 with its exact ranges (V2-UX-REV-011).
    technical.append(element('h5', undefined, `计划内调整 · ${adaptedUnits.length} 次`), adaptations);
    synopsis.append(technical);
    void mountAnalysisFeedback({
      card, metric: feedbackMetric, revisionId: revision.revisionId, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, technicalDetails,
    }).load();
  }

  /**
   * The frozen reuse plan of an update Task, as the facts the card carries about its Task. What the plan
   * reuses and recomputes, unit by unit, is part of the plan and reads in the Task Drawer (S72 D4); the
   * card keeps its counts and digest as attributes, wherever in its tabs the plan's summary is placed.
   */
  function markReusePlan(card: HTMLElement, projection: BaselineAnalysisProjection): void {
    const update = projection.update;
    if (update === null || update.reusePlan === null) return;
    const plan: AnalysisReusePlanProjection = update.reusePlan;
    const owner = card.closest<HTMLElement>('.baseline-analysis-card') ?? card;
    owner.dataset['reusePlanDigest'] = update.reusePlanDigest ?? '';
    owner.dataset['planReused'] = String(plan.counts.reused);
    owner.dataset['planRecomputed'] = String(plan.counts.recomputed);
    owner.dataset['planInvalidated'] = String(plan.counts.invalidated);
    owner.dataset['planBypassed'] = String(plan.counts.bypassed);
    owner.dataset['planUpdateMode'] = plan.mode;
  }

  /**
   * Every plan version of the Task and every Plan Revision between them, immutable and linked. Since S74a
   * (A4) the list is ②A's technical layer, closed by default: the plan and its changes read in the drawer,
   * where 重新确认计划 and 查看计划修订 are, and the list keeps each version's exact identity one step away.
   */
  function renderPlanVersions(card: HTMLElement, projection: BaselineAnalysisProjection): void {
    const section = element('section', 'analysis-plan-versions');
    section.dataset['planVersionCount'] = String(projection.listPages['planVersions']?.total ?? projection.planVersions.length);
    section.dataset['planRevisionCount'] = String(projection.listPages['planRevisions']?.total ?? projection.planRevisions.length);
    section.append(element('h4', undefined, `计划版本 · ${projection.listPages['planVersions']?.total ?? projection.planVersions.length} 个`));
    const versions = element('ol', 'analysis-list analysis-plan-version-list');
    for (const version of projection.planVersions) {
      const state = version.state === 'bound' ? '已被运行授权绑定' : version.state === 'current' ? '当前 · 尚未开始' : '已被取代';
      const item = element('li', undefined, `版本 ${version.ordinal} · ${state} · 信封 ${version.planEnvelopeDigest}${version.planRevisionId === null ? '' : ` · 由计划修订 ${version.planRevisionId} 产生`}`);
      item.dataset['planVersionOrdinal'] = String(version.ordinal);
      item.dataset['planVersionState'] = version.state;
      item.dataset['planVersionEnvelope'] = version.planEnvelopeDigest;
      versions.append(item);
    }
    section.append(versions);
    if (projection.planRevisions.length > 0) {
      const revisions = element('ol', 'analysis-list analysis-plan-revision-list');
      for (const revision of projection.planRevisions) {
        // The editor's own 更新计划 is theirs, not a reconfirmed change (Issue #419).
        const settled = revision.trigger === 'plan-edit' ? '你改的 · 已更新计划' : revision.resolved ? '已重新确认' : '待重新确认';
        const item = element('li', undefined, `${revision.label} · ${settled}${revision.detectedAt === null ? '' : ` · ${localInstantLabel(revision.detectedAt)}`}`);
        if (revision.detectedAt !== null) item.append(element('span', 'technical-identity', revision.detectedAt));
        item.dataset['planRevisionId'] = revision.planRevisionId ?? '';
        item.dataset['planRevisionPrior'] = String(revision.priorOrdinal);
        item.dataset['planRevisionNext'] = revision.nextOrdinal === null ? '' : String(revision.nextOrdinal);
        item.dataset['planRevisionResolved'] = revision.resolved ? 'true' : 'false';
        item.dataset['planRevisionTrigger'] = revision.trigger;
        item.dataset['planRevisionFields'] = revision.changedFields.join(',');
        revisions.append(item);
      }
      section.append(element('h5', undefined, '计划修订'), revisions);
    }
    const disclosure = element('details', 'technical-details analysis-plan-versions-technical');
    disclosure.append(element('summary', undefined, '查看技术详情'), section);
    card.append(disclosure);
  }

  /** The Run's timeline: state transitions and in-envelope Plan Adaptations interleaved by record time. */
  function renderRunTimeline(run: NonNullable<BaselineAnalysisProjection['run']>): HTMLElement {
    const entries = [
      ...run.transitions.map((transition) => ({ at: transition.recordedAt, order: transition.sequence * 2, kind: 'transition' as const, transition, adaptation: null })),
      ...run.adaptations.map((adaptation) => ({ at: adaptation.recordedAt, order: 0, kind: 'adaptation' as const, transition: null, adaptation })),
    ].sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : left.order - right.order));
    const timeline = element('ol', 'analysis-timeline');
    timeline.dataset['timelineAdaptations'] = String(run.adaptations.length);
    for (const entry of entries) {
      const item = element('li');
      item.dataset['timelineKind'] = entry.kind;
      // Each entry reads as local time, with the exact instant it was recorded at beside it on its own
      // line (V2-UX-LAYER-004) — a timeline whose only reading was an ISO instant said when to a machine.
      if (entry.transition !== null) {
        item.dataset['timelineState'] = entry.transition.state;
        item.textContent = `${entry.transition.sequence}. ${entry.transition.state} · ${localInstantLabel(entry.transition.recordedAt)}${entry.transition.detail === null ? '' : ` · ${entry.transition.detail}`}`;
        item.append(element('span', 'technical-identity', entry.transition.recordedAt));
      } else if (entry.adaptation !== null) {
        item.dataset['adaptationUnit'] = String(entry.adaptation.unitOrdinal);
        item.dataset['adaptationClass'] = entry.adaptation.adaptationClass;
        item.dataset['adaptationOrdinal'] = String(entry.adaptation.ordinal);
        item.textContent = `${entry.adaptation.label} · 第 ${entry.adaptation.attemptIndex} 次尝试 · ${localInstantLabel(entry.adaptation.recordedAt)} · 信封 ${entry.adaptation.planEnvelopeDigest} · 绑定 ${entry.adaptation.bindingDigest}`;
        item.append(element('span', 'technical-identity', entry.adaptation.recordedAt));
      }
      timeline.append(item);
    }
    return timeline;
  }

  /** Start one preparation job (first baseline or update) and render whatever it settles to. */
  async function startAnalysisPreparation(
    host: HTMLElement,
    bookTitle: string,
    input: { goal: string; update: BaselineAnalysisUpdateRequest | null; reconfirm: boolean },
    controls: { start: HTMLButtonElement; cancel: HTMLButtonElement; others: ReadonlyArray<HTMLButtonElement> },
    quick: DefaultExecutionRuleReference | null = null,
  ): Promise<void> {
    const { start, cancel, others } = controls;
    start.disabled = true;
    for (const other of others) other.disabled = true;
    cancel.hidden = false;
    setStatus('正在为任务保存修订版…', 'busy');
    try {
      const initial = await window.ai7.prepareBaselineAnalysis(input as Parameters<typeof window.ai7.prepareBaselineAnalysis>[0]);
      cancel.dataset['serviceJobId'] = initial.jobId;
      const completed = await awaitServiceJob(initial, (job) => {
        cancel.dataset['serviceJobId'] = job.jobId;
        setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy');
      });
      if (completed.state === 'cancelled') {
        start.disabled = false;
        for (const other of others) other.disabled = false;
        cancel.hidden = true;
        setStatus('基线稿件分析准备已取消；稿件与任务草稿保持不变。', 'success');
        return;
      }
      if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null ||
          !('coverageManifest' in completed.result)) throw new Error('基线稿件分析准备未返回计划。');
      if (host.isConnected && completed.result.bookId === host.dataset['analysisBookId']) {
        renderBaselineAnalysis(host, completed.result, bookTitle);
        if (quick !== null) {
          await quickStartPrepared(host, bookTitle, completed.result, quick);
          return;
        }
        setStatus(completed.result.planRevision !== null
          ? '计划的关键内容已变化：请在任务计划里查看计划修订并重新确认计划。'
          : '任务计划已准备；可在任务计划里开始任务。', 'success');
        // S72 D4: 先看计划 opens the plan the preparation froze in the Task Drawer beside ②A, whose bar starts it (S74a).
        openTaskPlan(completed.result.bookId, 'baseline-analysis', completed.result.taskIntent?.taskIntentId ?? null);
      }
    } catch (error) {
      start.disabled = false;
      for (const other of others) other.disabled = false;
      cancel.hidden = true;
      setStatus(rendererErrorMessage(error, '无法开始基线稿件分析。'), 'error');
    }
  }

  /**
   * 快速开始 (Issue #421; TASK-017, TASK-020, TASK-026): the Task 先看计划's own preparation just froze is started under
   * the rule version the editor clicked, exactly as 开始任务 would start it. Whatever would make the start differ from
   * the rule leaves the Task at its plan, open in the drawer with the reason beside the bar, and nothing recorded.
   */
  async function quickStartPrepared(host: HTMLElement, bookTitle: string, prepared: BaselineAnalysisProjection, rule: DefaultExecutionRuleReference): Promise<void> {
    const taskIntentId = prepared.taskIntent?.taskIntentId ?? null;
    const planEnvelopeDigest = prepared.planEnvelope?.digest ?? null;
    if (taskIntentId === null || planEnvelopeDigest === null) throw new Error('基线稿件分析准备未返回计划。');
    setStatus(`正在按默认执行规则「${rule.name}」开始…`, 'busy');
    let result: QuickStartBaselineAnalysisResult;
    try {
      result = await window.ai7.quickStartBaselineAnalysis({ taskIntentId, planEnvelopeDigest, ruleVersionId: rule.ruleVersionId });
    } catch (error) {
      // The plan stands prepared: the bar starts it as usual.
      setStatus(rendererErrorMessage(error, '快速开始没有开始任务；计划已准备，可在任务计划里开始。'), 'error');
      openTaskPlan(prepared.bookId, 'baseline-analysis', taskIntentId);
      return;
    }
    if (!host.isConnected || result.projection.bookId !== host.dataset['analysisBookId']) return;
    renderBaselineAnalysis(host, result.projection, bookTitle);
    if (result.outcome === 'started') {
      // A start the launch has no route for is recorded and blocked before dispatch: it never began.
      setStatus(quickStartStartedLine(rule, result.projection), 'success');
      openTaskPlan(result.projection.bookId, 'baseline-analysis', taskIntentId);
      return;
    }
    const note = taskPlanQuickStartFellBack(result.reasons);
    setStatus(note);
    openTaskPlan(result.projection.bookId, 'baseline-analysis', taskIntentId, note);
  }

  function analysisCancelButton(): HTMLButtonElement {
    const cancel = button('取消准备', 'quiet', async () => {
      const jobId = cancel.dataset['serviceJobId'];
      if (!jobId) return;
      cancel.disabled = true;
      try {
        await window.ai7.cancelServiceJob({ jobId });
      } catch (error) {
        cancel.disabled = false;
        setStatus(rendererErrorMessage(error, '无法取消基线稿件分析准备。'), 'error');
      }
    });
    cancel.dataset['analysisAction'] = 'cancel-preparation';
    cancel.hidden = true;
    return cancel;
  }

  /**
   * The exact three Analysis Update Controls. Each states its meaning, the exact target revision and
   * range, the expected reuse-versus-recompute counts, the Provider / outbound / budget consequence,
   * and the successor behavior before any Task is issued; the range is an explicit unpreselected choice.
   */
  function renderAnalysisUpdateControls(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
    const controls = projection.updateControls;
    if (controls === null) return;
    const section = element('section', 'analysis-update-controls');
    section.dataset['updateTargetOrdinal'] = String(controls.target.ordinal);
    section.dataset['updateTargetRevisionId'] = controls.target.revisionId;
    section.dataset['updateTargetFreshness'] = controls.target.freshness;
    section.dataset['updateBlocked'] = controls.blockedByActiveRun ? 'true' : 'false';
    section.dataset['workingUnits'] = String(controls.working.unitCount);
    section.dataset['workingBlocks'] = String(controls.working.totalBlocks);
    section.append(element('h4', undefined, '更新这份分析'));
    const facts = element('dl', 'analysis-facts');
    // Freshness and the work an update would cover are what the editor weighs before issuing a Task, so
    // both readings stay at full rank; the digests that identify them go one step away.
    facts.append(
      element('dt', undefined, '目标修订版'), element('dd', undefined, `Revision ${controls.target.ordinal} · 绑定 ${controls.target.manuscriptPin.revisionLabel} · 新鲜度 ${controls.target.freshness === 'stale' ? '已过期' : '当前'}`),
      element('dt', undefined, '当前稿件'), element('dd', undefined, `${controls.working.revisionLabel} + 修订日志序号 ${controls.working.journalSequence} · ${controls.working.totalBlocks} 个内容块 · 将派生 ${controls.working.unitCount} 个分析单元 / ${controls.working.sectionCount} 个结构段`),
      element('dt', undefined, '模型提供方 / 外发 / 预算'), element('dd', undefined, controls.providerConsequence),
      element('dt', undefined, '后继修订版'), element('dd', undefined, controls.successorBehavior),
    );
    section.append(facts, technicalDetails(
      'analysis-facts',
      element('dt', undefined, '目标修订版身份'), element('dd', 'technical-identity', `${controls.target.revisionId} · ${controls.target.digest}`),
      element('dt', undefined, '当前稿件摘要'), element('dd', 'technical-identity', controls.working.workingDigest),
    ));
    if (controls.blockedReason !== null) section.append(element('p', 'attention-note', controls.blockedReason));
    const actionButtons: HTMLButtonElement[] = [];
    const cancel = analysisCancelButton();
    const modes: BaselineAnalysisUpdateMode[] = ['sync-current', 'reanalyze-range', 'reanalyze-book'];
    for (const mode of modes) {
      const action = controls.actions[mode];
      const block = element('section', 'analysis-update-action');
      block.dataset['updateAction'] = mode;
      block.dataset['updateAvailable'] = action.available ? 'true' : 'false';
      if (action.expected !== null) {
        block.dataset['expectedReused'] = String(action.expected.reused);
        block.dataset['expectedRecomputed'] = String(action.expected.recomputed);
        block.dataset['expectedInvalidated'] = String(action.expected.invalidated);
        block.dataset['expectedBypassed'] = String(action.expected.bypassed);
      }
      // What each mode keeps and what it reads again is the decision (ADR 0076 §5): one sentence in the
      // editor's words at full rank, the four exact lineage counts and the fixed goal one step away.
      block.append(element('h5', undefined, action.label), element('p', undefined, action.meaning));
      const expected = element('p', 'analysis-update-expected', updateReuseReading(action.expected, mode));
      const expectedExact = element('dd', 'technical-identity', action.expected === null ? '由所选范围决定' : reuseCountsText(action.expected));
      block.append(expected, technicalDetails('analysis-facts',
        element('dt', undefined, '预期单元血缘'), expectedExact,
        element('dt', undefined, '固定任务目标'), element('dd', 'technical-identity', action.goal)));
      if (action.unavailableReason !== null) block.append(element('p', 'attention-note', action.unavailableReason));
      let selectedRange: BaselineAnalysisSelectedRange | null = null;
      if (mode === 'reanalyze-range') {
        const fieldset = element('fieldset', 'analysis-range-options');
        fieldset.append(element('legend', undefined, '选择要重新分析的连续范围（未预选；按当前稿件将派生的结构单元列出）'));
        const appendOptions = (options: typeof controls.actions['reanalyze-range']['options']): void => {
          for (const option of options) {
            const row = element('div', 'analysis-range-option');
            row.dataset['rangeOption'] = String(option.unitOrdinal);
            row.dataset['rangeStart'] = String(option.startPosition);
            row.dataset['rangeEnd'] = String(option.endPosition);
            const radio = element('input');
            radio.type = 'radio';
            radio.name = 'analysis-range';
            radio.id = `analysis-range-${option.unitOrdinal}`;
            radio.value = `${option.startPosition}-${option.endPosition}`;
            radio.disabled = !action.available;
            radio.addEventListener('change', async () => {
              if (!radio.checked) return;
              // The pick is the range at once, as before; only its expected counts are derived for it (#988), so they follow.
              selectedRange = { startPosition: option.startPosition, endPosition: option.endPosition };
              block.dataset['selectedRange'] = radio.value;
              for (const key of ['expectedReused', 'expectedRecomputed', 'expectedInvalidated', 'expectedBypassed']) delete block.dataset[key];
              expected.textContent = `所选内容块 ${option.startPosition}–${option.endPosition}：${ANALYSIS_READING}`;
              expectedExact.textContent = '';
              start.disabled = !action.available;
              try {
                const picked = await window.ai7.getBaselineAnalysisRangePlan({ unitOrdinal: option.unitOrdinal });
                if (!radio.checked || !block.isConnected) return;
                if (picked.selectedRange.startPosition !== option.startPosition || picked.selectedRange.endPosition !== option.endPosition) throw new Error(ANALYSIS_READ_FAILED);
                block.dataset['expectedReused'] = String(picked.expected.reused);
                block.dataset['expectedRecomputed'] = String(picked.expected.recomputed);
                block.dataset['expectedInvalidated'] = String(picked.expected.invalidated);
                block.dataset['expectedBypassed'] = String(picked.expected.bypassed);
                expected.textContent = `所选内容块 ${option.startPosition}–${option.endPosition}：${updateReuseReading(picked.expected, mode)}`;
                expectedExact.textContent = reuseCountsText(picked.expected);
              } catch {
                if (!radio.checked || !block.isConnected) return;
                // A range the current manuscript no longer derives, or whose counts cannot be read, is not started.
                selectedRange = null;
                delete block.dataset['selectedRange'];
                start.disabled = true;
                setStatus(ANALYSIS_READ_FAILED, 'error');
              }
            });
            const label = element('label', undefined, option.label);
            label.htmlFor = radio.id;
            row.append(radio, label);
            fieldset.append(row);
          }
        };
        appendOptions(controls.actions['reanalyze-range'].options);
        let after = projection.listPages['updateControls.actions.reanalyze-range.options']?.nextOrdinal ?? null;
        if (after !== null) {
          const more = button(ANALYSIS_MORE_CHOICES, 'secondary', async () => {
            more.disabled = true;
            try {
              const page = await window.ai7.getBaselineAnalysisPage({ taskIntentId: projection.taskIntent!.taskIntentId,
                revisionId: null, path: 'updateControls.actions.reanalyze-range.options', afterOrdinal: after! });
              if (!more.isConnected) return;
              if (page.path !== 'updateControls.actions.reanalyze-range.options' || page.nextOrdinal !== null && page.nextOrdinal <= after!) throw new Error(ANALYSIS_READ_FAILED);
              appendOptions(page.items as typeof controls.actions['reanalyze-range']['options']);
              after = page.nextOrdinal;
              if (after === null) more.remove(); else fieldset.append(more);
            } catch { setStatus(ANALYSIS_READ_FAILED, 'error'); }
            finally { more.disabled = false; }
          });
          fieldset.append(more);
        }
        block.append(fieldset);
      }
      const start = button('先看计划', 'secondary', async () => {
        const update: BaselineAnalysisUpdateRequest = { mode, selectedRange: mode === 'reanalyze-range' ? selectedRange : null };
        if (mode === 'reanalyze-range' && update.selectedRange === null) {
          setStatus('请先选择要重新分析的范围。', 'error');
          return;
        }
        await startAnalysisPreparation(host, bookTitle, { goal: action.goal, update, reconfirm: false }, {
          start,
          cancel,
          others: actionButtons.filter((other) => other !== start),
        });
      });
      start.dataset['analysisAction'] = mode;
      start.disabled = !action.available || mode === 'reanalyze-range';
      actionButtons.push(start);
      // The mode's own button opens the two ways to begin (editor-surfaces §3). 先看计划 prepares the Task
      // and shows its plan in the drawer, whose bar starts it. The quick start is the Book's 默认执行规则's to give
      // (Issue #421, S75): it prepares the Task the same way and starts it under the rule — or stops at the plan
      // with the reason. Without a rule in force that matches, it is shown, disabled, with the reason beside it: a
      // Run never starts behind a plan the editor has not seen and no rule has spoken for.
      const quickStart = action.quickStart ?? null;
      const quickRule = quickStart !== null && quickStart.available ? quickStart.rule : null;
      const quick = button(mode === 'sync-current' ? '开始同步' : mode === 'reanalyze-range' ? '开始重新分析' : '开始全部重来', 'primary', async () => {
        if (quickRule === null) return;
        await startAnalysisPreparation(host, bookTitle, { goal: action.goal, update: { mode, selectedRange: null }, reconfirm: false }, {
          start: quick,
          cancel,
          others: actionButtons.filter((other) => other !== quick),
        }, quickRule);
      });
      quick.dataset['analysisAction'] = `quick-${mode}`;
      quick.disabled = quickRule === null;
      if (quickStart?.rule) quick.dataset['ruleVersionId'] = quickStart.rule.ruleVersionId;
      // Only a quick start on offer joins the actions a preparation holds and gives back.
      if (quickRule !== null) actionButtons.push(quick);
      const quickNote = element('p', 'field-note analysis-quick-note', quickRule !== null
        ? `按默认执行规则「${quickRule.name}」：先准备计划，与规则一致时直接开始；有任何不同都会停在计划上。`
        : quickStart?.reason ?? '这种更新没有快速开始；请先看计划。');
      quickNote.id = `analysis-quick-note-${mode}`;
      quickNote.dataset['quickStart'] = quickRule !== null ? 'available' : 'unavailable';
      quick.setAttribute('aria-describedby', quickNote.id);
      const choice = element('div', 'analysis-update-choice');
      choice.id = `analysis-update-choice-${mode}`;
      choice.hidden = true;
      const choiceActions = element('div', 'button-row analysis-actions');
      choiceActions.append(quick, start);
      choice.append(choiceActions, quickNote);
      const chooser = button(action.label, mode === 'sync-current' ? 'primary' : 'secondary', () => {
        choice.hidden = !choice.hidden;
        chooser.setAttribute('aria-expanded', choice.hidden ? 'false' : 'true');
      });
      chooser.dataset['analysisAction'] = `choose-${mode}`;
      chooser.setAttribute('aria-expanded', 'false');
      chooser.setAttribute('aria-controls', choice.id);
      chooser.disabled = !action.available;
      actionButtons.push(chooser);
      const actions = element('div', 'button-row analysis-actions');
      actions.append(chooser);
      block.append(actions, choice);
      section.append(block);
    }
    section.append(cancel);
    card.append(section);
  }

  /** The Analysis Result Revision History: every revision in ordinal order, each openable read-only. */
  function renderAnalysisHistory(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
    const history = projection.history;
    if (history === null) return;
    const section = element('section', 'analysis-history');
    section.dataset['historyLatestOrdinal'] = String(history.latestOrdinal);
    section.dataset['historyCount'] = String(projection.listPages['history.entries']?.total ?? history.entries.length);
    section.dataset['historyResultSetId'] = history.resultSetId;
    // How many revisions there are and which one is latest are decisions, not identities: they stay at
    // full rank, and only the result set's own identity and kind step down into the disclosure.
    section.append(
      element('h4', undefined, '历次分析'),
      element('p', 'field-note', `共 ${projection.listPages['history.entries']?.total ?? history.entries.length} 份分析 · 最新的是第 ${history.latestOrdinal} 份`),
      technicalDetails('analysis-facts',
        element('dt', undefined, '结果集'), element('dd', 'technical-identity', `${history.resultSetId} · ${history.kind}`)),
    );
    const open = async (revisionId: string | null): Promise<void> => {
      setStatus(revisionId === null ? '正在返回最新修订版…' : '正在只读打开历史修订版…', 'busy');
      try {
        const next = await window.ai7.inspectBaselineAnalysis({ revisionId });
        if (host.isConnected && next.bookId === host.dataset['analysisBookId']) {
          renderBaselineAnalysis(host, next, bookTitle);
          setStatus(revisionId === null ? '已返回最新修订版。' : '历史修订版已只读打开。', 'success');
        }
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法打开该结果集修订版。'), 'error');
      }
    };
    const list = element('ol', 'analysis-history-list');
    const appendHistory = (entries: typeof history.entries): void => {
      for (const entry of entries) {
        const item = element('li', 'analysis-history-entry');
        item.dataset['historyOrdinal'] = String(entry.ordinal);
        item.dataset['historyRevisionId'] = entry.revisionId;
        item.dataset['historyMode'] = entry.mode;
        item.dataset['historyCurrent'] = entry.current ? 'true' : 'false';
        item.dataset['historyFreshness'] = entry.freshness;
        item.dataset['historyPredecessorOrdinal'] = entry.predecessor === null ? '' : String(entry.predecessor.ordinal);
        // What the entry is and what it cost stay at full rank; its identities — the revision's own and
        // the Run that produced it — travel together in the entry's one disclosure, in the order they read
        // in before (V2-UX-LAYER-001).
        item.append(
          element('p', undefined, `第 ${entry.ordinal} 份 · ${entry.modeLabel} · 读的是 ${entry.manuscriptPin.revisionLabel} · ${localInstantLabel(entry.createdAt)} · ${entry.current ? '当前最新' : '已被后来的分析取代 · 按原样保留'}`),
          element('p', 'field-note', `沿用上一份 ${entry.counts.reused} 个阅读范围，重新分析 ${entry.counts.recomputed} 个；读完 ${entry.unitsClosed} 个，${entry.gapCount} 个没有读成。`),
          technicalDetails('analysis-facts',
            element('dt', undefined, '修订版'),
            element('dd', 'technical-identity', `Revision ${entry.ordinal} · ${entry.freshnessLabel} · 前一修订版 ${entry.predecessor === null ? '无' : `Revision ${entry.predecessor.ordinal}`} · 创建于 ${entry.createdAt}`),
            element('dt', undefined, '单元血缘与计数'),
            element('dd', 'technical-identity', `${reuseCountsText(entry.counts)} · 缺口 ${entry.gapCount} · 冲突 ${entry.conflictCount} · 覆盖 ${entry.unitsClosed}/${entry.unitsTotal}`),
            element('dt', undefined, '修订版身份'),
            element('dd', 'technical-identity', `${entry.revisionId} · 摘要 ${entry.digest} · 稿件 pin ${entry.manuscriptPin.revisionId} · ${entry.manuscriptPin.revisionDigest}`),
            element('dt', undefined, '产出 Run 与用量'),
            element('dd', 'technical-identity', `Run ${entry.producingRun.runRecordId} · ${entry.producingRun.classification ?? '无结果'} · ${entry.usage.requests} 次模型请求 · 输入 ${entry.usage.inputTokens} · 输出 ${entry.usage.outputTokens}`),
          ),
        );
        item.append(runReportOrReason(entry.report, entry.reportAbsentReason));
        const view = button('查看这一份（只读）', 'quiet', () => open(entry.revisionId));
        view.dataset['analysisAction'] = 'open-revision';
        view.dataset['analysisRevisionId'] = entry.revisionId;
        view.dataset['analysisRevisionOrdinal'] = String(entry.ordinal);
        if (projection.inspectedRevision?.revision.revisionId === entry.revisionId) view.disabled = true;
        item.append(view);
        list.append(item);
      }
    };
    appendHistory(history.entries);
    let before = projection.listPages['history.entries']?.nextOrdinal ?? null;
    if (before !== null) {
      const more = button(ANALYSIS_EARLIER_HISTORY, 'secondary', async () => {
        more.disabled = true;
        try {
          const page = await window.ai7.getBaselineAnalysisPage({ taskIntentId: projection.taskIntent!.taskIntentId,
            revisionId: projection.inspectedRevision?.revision.revisionId ?? null, path: 'history.entries', afterOrdinal: before! });
          if (!more.isConnected) return;
          if (page.path !== 'history.entries' || before !== 0 && page.nextOrdinal !== null && page.nextOrdinal >= before!) throw new Error(ANALYSIS_READ_FAILED);
          appendHistory(page.items as typeof history.entries);
          before = page.nextOrdinal;
          if (before === null) more.remove();
        } catch { setStatus(ANALYSIS_READ_FAILED, 'error'); }
        finally { more.disabled = false; }
      });
      section.append(more);
    }
    section.append(list);
    if (projection.inspectedRevision !== null) {
      const back = button('返回最新的一份', 'quiet', () => open(null));
      back.dataset['analysisAction'] = 'close-revision';
      section.append(back);
    }
    card.append(section);
  }

  function renderBaselineAnalysis(host: HTMLElement, projection: BaselineAnalysisProjection, bookTitle: string): void {
    const generation = analysisFollower.drawn(host);
    const pending = [projection.resultSetRevision, projection.inspectedRevision?.revision].filter((revision) =>
      revision != null && (revision.sections === undefined || revision.synthesis === undefined));
    if (pending.length > 0) {
      const loading = element('p', 'field-note', ANALYSIS_READING);
      host.replaceChildren(loading);
      void Promise.all(pending.map((revision) => {
        if (revision == null) throw new Error(ANALYSIS_READ_FAILED);
        return hydrateAnalysisRevision(window.ai7, revision);
      })).then((overviews) => {
        if (!host.contains(loading)) return;
        const hydrate = (revision: BaselineAnalysisProjection['resultSetRevision']) => revision === null ? null : {
          ...revision, ...overviews.find((overview) => overview.revisionId === revision.revisionId),
        };
        renderBaselineAnalysis(host, { ...projection, resultSetRevision: hydrate(projection.resultSetRevision),
          inspectedRevision: projection.inspectedRevision === null ? null : { ...projection.inspectedRevision,
            revision: hydrate(projection.inspectedRevision.revision)! } }, bookTitle);
      }).catch(() => { if (host.contains(loading)) host.replaceChildren(element('p', 'attention-note', ANALYSIS_READ_FAILED)); });
      return;
    }

    // A draw replaces what the card follows (Issue #539): a follow-up an earlier draw armed — of a revision the editor has
    // since left — never draws over this one, whether its read was still to be sent or already out, and this draw arms its
    // own if it needs one.
    const card = element('section', 'baseline-analysis-card');
    card.dataset['analysisState'] = projection.state;
    card.dataset['analysisBookId'] = projection.bookId;
    if (projection.taskIntent) card.dataset['taskIntentId'] = projection.taskIntent.taskIntentId;
    if (projection.planEnvelope) card.dataset['planEnvelopeDigest'] = projection.planEnvelope.digest;
    if (projection.planVersion) {
      card.dataset['planVersion'] = String(projection.planVersion.ordinal);
      card.dataset['planVersionCount'] = String(projection.listPages['planVersions']?.total ?? projection.planVersions.length);
      card.dataset['planRevisionPending'] = projection.planRevision === null ? 'false' : 'true';
    }
    if (projection.coverageManifest) {
      card.dataset['coverageManifestDigest'] = projection.coverageManifest.digest;
      card.dataset['analysisUnits'] = String(projection.listPages['coverageManifest.units']?.total ?? projection.coverageManifest.units.length);
    }
    if (projection.run) card.dataset['runState'] = projection.run.state;
    if (projection.taskOutcome) {
      card.dataset['taskOutcomeId'] = projection.taskOutcome.outcomeId;
      card.dataset['taskOutcomeClassification'] = projection.taskOutcome.classification;
    }
    const heading = element('div', 'baseline-analysis-heading');
    heading.append(
      element('h3', undefined, '基线稿件分析'),
      element('span', `status-pill analysis-state analysis-state-${projection.state}`, projection.stateLabel),
    );
    // The binding clause reads the launch this Book actually bound: the frozen plan's pin first, then the
    // pin the latest Revision recorded, and before either exists there is no launch to state.
    card.append(heading, element('p', 'field-note', analysisKindSubtitle(
      projection.providerResolutionPlan?.remoteBinding.providerProcessing ?? projection.resultSetRevision?.policyPin ?? null,
    )));
    card.append(element('p', 'research-status', researchPlanLine(projection.providerResolutionPlan?.webToolsBackend)));

    // One follow-up read per card at a time, of the revision the editor is looking at: a newer draw replaces the
    // pending one rather than adding another loop, and an answer that changed nothing draws nothing, so the editor's
    // place and focus stay while a Run waits (Issue #502).
    const refreshLater = (delayMs = 250): void => analysisFollower.later(host, generation, delayMs, {
      belongs: (next) => host.isConnected && host.dataset['analysisBookId'] === (next?.bookId ?? projection.bookId),
      read: () => {
        const inspected = projection.inspectedRevision?.revision.revisionId ?? null;
        return window.ai7.inspectBaselineAnalysis(inspected === null ? undefined : { revisionId: inspected });
      },
      unchanged: (next) => JSON.stringify(next) === JSON.stringify(projection),
      again: () => analysisFollowDelayMs(projection.state),
      // An open 分析反馈 card the editor is in stays as it is: the Run's progress is drawn once they leave it (Issue #94 review).
      held: () => analysisFeedbackEngaged(host),
      draw: (next) => renderBaselineAnalysis(host, next, bookTitle),
      failed: (error) => setStatus(rendererErrorMessage(error, '无法刷新基线稿件分析状态。'), 'error'),
    });

    // 自定义 is available before the first baseline too: each dimension owns its own Result Set and needs no built-in result.
    const revision = projection.inspectedRevision?.revision ?? projection.resultSetRevision;
    const taskInFlight = projection.state === 'prepared' || projection.state === 'authorized-blocked' || projection.state === 'queued' ||
      projection.state === 'waiting' || projection.state === 'admitted' || projection.state === 'executing' || projection.state === 'cancelling' ||
      projection.state === 'pausing' || projection.state === 'paused' || projection.state === 'resumable' ||
      projection.state === 'awaiting-clarification';
    const { panels, select } = analysisTabs(card, projection.bookId, revision === null || taskInFlight ? 'history' : 'synopsis');
    if (revision !== null) {
      renderBaselineAnalysisOverview(card, panels, select, projection, revision as BaselineAnalysisResultSetRevisionProjection, bookTitle, projection.inspectedRevision !== null
        ? { historical: true, current: projection.inspectedRevision.current }
        : { historical: false, current: true });
    } else {
      for (const [id] of ANALYSIS_TABS) {
        if (id !== 'custom' && id !== 'history') panels[id].append(element('p', 'field-note', '尚无基线分析结果。'));
      }
    }
    const records = panels.history;
    mountCustomAnalysisTab(panels.custom, {
      bookId: projection.bookId,
      api: window.ai7,
      setStatus,
      errorMessage: rendererErrorMessage,
      openPlan: (taskIntentId) => openTaskPlan(projection.bookId, 'baseline-analysis', taskIntentId),
      jump: (blockId) => void jumpToManuscript(projection.bookId, { manuscriptId: null, blockId, markId: null }, '这段原文已不在当前稿件中。'),
    });

    // The first-baseline form exists only while the Book holds no Result Set Revision; afterwards every
    // new Task is one of the three Analysis Update Controls below the Overview. A first baseline cancelled while
    // it waited to start leaves no revision either, so the form is offered again (Issue #502, OFF-010).
    if ((projection.state === 'available' || (projection.state === 'cancelled' && projection.actions.canPrepare)) && projection.history === null) {
      const form = element('section', 'form-row analysis-form');
      const label = element('label', undefined, '固定任务目标');
      label.htmlFor = 'j04-analysis-goal';
      const goal = element('input');
      goal.id = 'j04-analysis-goal';
      goal.value = BASELINE_ANALYSIS_TASK_GOAL;
      goal.readOnly = true;
      const actions = element('div', 'button-row analysis-actions');
      const cancel = analysisCancelButton();
      const start = button('开始基线稿件分析', 'primary', () =>
        startAnalysisPreparation(host, bookTitle, { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false }, { start, cancel, others: [] }));
      start.dataset['analysisAction'] = 'prepare';
      actions.append(start, cancel);
      form.append(label, goal, element('p', 'field-note', '开始后先为任务保存修订版并整理阅读范围，计划在右侧的任务计划里打开；不会构造模型请求。'), actions);
      records.append(form);
      host.replaceChildren(card);
      return;
    }

    if (projection.checkpoint !== null) renderFrozenAnalysisPlan(records, projection);

    if (projection.taskOutcome) {
      const outcome = element('section', 'success-note analysis-outcome');
      outcome.dataset['taskOutcomeId'] = projection.taskOutcome.outcomeId;
      outcome.dataset['taskOutcomeClassification'] = projection.taskOutcome.classification;
      outcome.append(
        element('h4', undefined, projection.taskOutcome.label),
        element('p', undefined, `安全的下一步：${projection.taskOutcome.safeNextAction}`),
        runReportOrReason(projection.taskOutcome.report, projection.taskOutcome.reportAbsentReason),
        technicalDetails('analysis-facts',
          element('dt', undefined, '任务结果'),
          element('dd', 'technical-identity', `Task Outcome ${projection.taskOutcome.outcomeId} · 链接结果集修订版 ${projection.taskOutcome.resultSetRevisionId ?? '无'}`)),
      );
      records.append(outcome);
    }

    renderAnalysisUpdateControls(records, projection, host, bookTitle);
    renderAnalysisHistory(records, projection, host, bookTitle);

    // A first analysis whose Run ended before it kept anything leaves no revision to update: it is started again
    // from here, below what that Run recorded (Issue #422, S76c).
    if (projection.state !== 'available' && projection.actions.canPrepare && projection.history === null) {
      const restart = element('section', 'form-row analysis-form analysis-restart');
      const restartActions = element('div', 'button-row analysis-actions');
      const restartCancel = analysisCancelButton();
      const restartStart = button('开始基线稿件分析', 'primary', () =>
        startAnalysisPreparation(host, bookTitle, { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false }, { start: restartStart, cancel: restartCancel, others: [] }));
      restartStart.dataset['analysisAction'] = 'prepare';
      restartActions.append(restartStart, restartCancel);
      restart.append(element('p', 'field-note', '上一次分析没有读完任何阅读范围，没有形成结果集修订版；可以重新开始。开始后先为任务保存修订版并整理阅读范围，计划在右侧的任务计划里打开。'), restartActions);
      records.append(restart);
    }

    for (const [path, meta] of Object.entries(projection.listPages)) {
      const label = ANALYSIS_PAGED_LIST_LABELS[path];
      if (label === undefined || meta.nextOrdinal === null) continue;
      const more = button(`${label} · ${ANALYSIS_MORE_CHOICES}`, 'secondary', async () => {
        more.disabled = true;
        try {
          const page = await window.ai7.getBaselineAnalysisPage({ taskIntentId: projection.taskIntent!.taskIntentId,
            revisionId: projection.inspectedRevision?.revision.revisionId ?? null, path, afterOrdinal: meta.nextOrdinal! });
          if (!more.isConnected) return;
          if (page.path !== path || page.nextOrdinal !== null && page.nextOrdinal <= meta.nextOrdinal!) throw new Error(ANALYSIS_READ_FAILED);
          renderBaselineAnalysis(host, appendBaselineSummaryPage(projection, page), bookTitle);
        } catch { setStatus(ANALYSIS_READ_FAILED, 'error'); more.disabled = false; }
      });
      records.append(more);
    }

    // §10: 明确不会发生 reads 不会做 in the editor's words, and the engineer's statements — every one of them,
    // unabridged — are one step away in 查看技术详情.
    const notDo = element('ul', 'analysis-list analysis-not-do');
    for (const statement of ANALYSIS_EDITORIAL_NOT_DO) notDo.append(element('li', undefined, statement));
    const nonEffects = element('dd', 'technical-identity analysis-named-non-effects', projection.namedNonEffects.join('；'));
    card.append(element('h4', undefined, '不会做'), notDo, technicalDetails('analysis-facts', element('dt', undefined, '技术性的不会做'), nonEffects));
    host.replaceChildren(card);
    // The drawer beside ②A states where this Task stands; it reads the plan again when that changes.
    const previousState = host.dataset['analysisRenderedState'];
    host.dataset['analysisRenderedState'] = projection.state;
    if (previousState !== undefined && previousState !== projection.state) taskDrawer.refresh('baseline-analysis');
    const followDelay = analysisFollowDelayMs(projection.state);
    if (followDelay !== null) refreshLater(followDelay);
  }

  /**
   * How often ②A reads the analysis again while its Run moves by itself, or `null` when nothing will move it: a Run under
   * way, and one stopping at the editor's cancellation or pause until it reads 已取消 or 已暂停 (Issue #422), every 250 ms; a Run in
   * Connectivity Wait every 2 s, since it may wait a long time (Issue #502), so the card moves on once Reconnect Preflight
   * admits it — and so is one waiting for the editor's answer, which the service takes on once the slot another Run holds
   * is free (Issue #422, S76d). The same answer serves the first read and every read after an unchanged answer, so the card follows a Run
   * exactly as long as the drawer does.
   */
  function analysisFollowDelayMs(state: BaselineAnalysisProjection['state']): number | null {
    switch (state) {
      case 'admitted':
      case 'executing':
      case 'cancelling':
      case 'pausing':
        return 250;
      case 'waiting':
      case 'awaiting-clarification':
      // 等待运行名额 (Issue #49, S14): the card moves on once the governor admits the Run.
      case 'queued':
        return 2_000;
      default:
        return null;
    }
  }

  /** ②A's one follow-up per card host (Issue #502; Issue #539): a later draw replaces it, never adds another loop. */
  const analysisFollower = new AnalysisFollower<HTMLElement>({
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  });

  /**
   * The latest Task's plan on ②A (S72 D4): one line naming it and 查看计划, which opens the whole plan in the
   * Task Drawer. Since S74a the drawer's bar is where the Task starts and where a changed plan is reconfirmed
   * (A4, A5): until the Task is started the card's one action reads 查看计划并开始, a changed plan is said here
   * in one line, and the plan versions are the card's technical layer. The Run the plan was authorized for
   * stays here, with its timeline.
   */
  function renderFrozenAnalysisPlan(card: HTMLElement, projection: BaselineAnalysisProjection): void {
    const checkpoint = projection.checkpoint!;
    const manifest = projection.coverageManifest!;
    markReusePlan(card, projection);
    const range = projection.planVersion?.materialInputs.selectedRange ?? null;
    const counts = projection.update?.reusePlan?.counts ?? null;
    const startable = projection.authorization === null && projection.state === 'prepared';
    const open = taskPlanOpenButton('baseline-analysis', () => openTaskPlan(projection.bookId, 'baseline-analysis', projection.taskIntent!.taskIntentId), startable);
    open.dataset['analysisAction'] = 'view-plan';
    const summary = element('section', 'task-plan-summary analysis-plan-summary');
    summary.append(
      element('h4', undefined, TASK_DRAWER_TITLE),
      element('p', 'task-plan-summary-line', taskPlanSummaryLine([
        projection.taskIntent!.modeLabel,
        range === null ? '全书' : `第 ${range.startPosition}–${range.endPosition} 段`,
        counts === null ? `${projection.listPages['coverageManifest.units']?.total ?? manifest.units.length} 个阅读范围` : `重新分析 ${counts.recomputed} 个阅读范围，沿用 ${counts.reused} 个`,
        `任务输入修订版 ${checkpoint.revisionLabel}`,
        projection.planVersion === null ? '' : `计划版本 ${projection.planVersion.ordinal}`,
      ])),
    );
    // A plan the 后台分析登记 dispatcher prepared and did not start (Issue #95, S39; #713 review, P2-2) says whose it is.
    if (projection.taskIntent?.preparedByEnrollmentVersionId !== undefined && projection.authorization === null) {
      const note = element('p', 'field-note analysis-background-prepared-note', BACKGROUND_PREPARED_PLAN_NOTE);
      summary.append(note);
    }
    // AUTH-006: a plan whose key content changed cannot start; the card says so, and the drawer's bar holds
    // 查看计划修订 and 重新确认计划 (§10: 物质变化 · 计划已被取代 reads 计划的关键内容已变化).
    const revision = projection.authorization === null ? projection.planRevision : null;
    if (revision !== null) {
      const note = element('p', 'attention-note analysis-plan-drift-note', projection.actions.canReconfirmPlan
        ? `${TASK_PLAN_DRIFT_HEADING}：原计划不能再开始；在任务计划里查看计划修订并重新确认计划后，新的计划版本才能开始。`
        : `${TASK_PLAN_DRIFT_HEADING}：要更新的那一份分析已不是最新的一份；请基于最新的一份重新准备。`);
      note.dataset['planRevisionState'] = revision.planRevisionId === null ? 'live' : 'pending';
      note.dataset['planRevisionPrior'] = String(revision.priorOrdinal);
      note.dataset['planRevisionFields'] = revision.changedFields.join(',');
      summary.append(note);
    }
    summary.append(open);
    card.append(summary);
    renderPlanVersions(card, projection);

    const run = projection.run;
    if (run) {
      const runSection = element('section', 'analysis-run');
      runSection.dataset['runState'] = run.state;
      runSection.append(element('h4', undefined, `任务运行记录 · ${run.stateLabel}`));
      const runFacts = element('dl', 'analysis-facts');
      // Who authorized this Run, on whose authority and against which plan version, is the decision behind
      // it; only the identifiers and the envelope digest that name them go one step away.
      runFacts.append(
        element('dt', undefined, '运行授权'), element('dd', undefined, `${projection.authorization!.origin} · ${projection.authorization!.authority} · 计划版本 ${projection.authorization!.planVersionOrdinal ?? '未记录'}`),
        element('dt', undefined, '状态转换'), element('dd', undefined, run.transitions.map((transition) => `${transition.sequence}. ${transition.state}`).join(' → ')),
        element('dt', undefined, '计划内调整'), element('dd', undefined, run.adaptations.length === 0
          ? '无'
          : `${run.adaptations.length} 次 · 单元 ${run.adaptations.map((adaptation) => adaptation.unitOrdinal).join('、')} · 安全重试；执行绑定与计划信封未变`),
      );
      // When the Run last changed state, in the Decision Layer's local time with the exact instant beside
      // it (V2-UX-LAYER-004). It reads from the transitions rather than from `progress`, so it stays
      // legible after the Run settles and `progress` is gone — a settled Run still answers "when".
      // A transition list the reply paged (#988) does not end at the latest one, so it names none rather than an older one.
      const lastTransition = projection.listPages['run.transitions'] === undefined ? run.transitions.at(-1) : undefined;
      if (lastTransition !== undefined) {
        const lastTransitionValue = element('dd');
        lastTransitionValue.dataset['runLastTransitionAt'] = lastTransition.recordedAt;
        lastTransitionValue.append(
          `${localInstantLabel(lastTransition.recordedAt)} · ${lastTransition.state}`,
          element('span', 'technical-identity', lastTransition.recordedAt),
        );
        runFacts.append(element('dt', undefined, '上次状态更新'), lastTransitionValue);
      }
      runSection.dataset['runAdaptations'] = String(run.adaptations.length);
      if (run.attempt) {
        // That the credential readiness check released no value is a Provider decision the editor is owed
        // at full rank; the attempt's identity and binding digest are the technical half of the same fact.
        runFacts.append(
          element('dt', undefined, '凭据就绪检查'), element('dd', undefined, `${run.attempt.credentialReadinessCheck.readiness} · 未释放任何值`),
          element('dt', undefined, 'Harness 执行区段'), element('dd', undefined, `${run.attempt.spanCount} 个区段（按标识引用，不复制内容）`),
        );
      }
      runSection.append(runFacts, technicalDetails(
        'analysis-facts',
        element('dt', undefined, '任务运行记录'), element('dd', 'technical-identity', run.runRecordId),
        element('dt', undefined, '运行授权'), element('dd', 'technical-identity', `${projection.authorization!.authorizationId} · 信封 ${projection.authorization!.planEnvelopeDigest}`),
        ...(run.attempt === null ? [] : [
          element('dt', undefined, '执行尝试'), element('dd', 'technical-identity', run.attempt.attemptId),
          element('dt', undefined, '执行绑定'), element('dd', 'technical-identity', run.attempt.executionBinding === null ? '尚未持久化' : `${run.attempt.executionBinding.bindingDigest} · Session ${run.attempt.executionBinding.harnessSessionId}`),
        ]),
      ), element('h5', undefined, '时间线'), renderRunTimeline(run));
      if (run.blockedReasons) {
        const reasons = element('ul', 'analysis-list attention-note');
        reasons.dataset['analysisBlocked'] = 'blocked-before-dispatch';
        for (const reason of run.blockedReasons) reasons.append(element('li', undefined, reason));
        runSection.append(reasons);
      }
      if (run.progress) {
        // The Run Liveness Signal (ADR 0071 §3): Measured Run Progress, then only facts the system
        // already holds — which unit is in flight and since when, what the attempt is doing, when the Run
        // last changed state, how many model turns are done. Elapsed time is computed here from a shown
        // instant, so the reader can check it; nothing is estimated, and no percentage is invented.
        const facts = run.progress;
        const elapsedMs = facts.currentUnitStartedAt === null ? null : Date.now() - Date.parse(facts.currentUnitStartedAt);
        const stale = elapsedMs !== null && runStepIsStale(elapsedMs, facts.longestSettledUnitMs);
        const progress = element('p', 'analysis-progress');
        progress.dataset['analysisProgress'] = `${facts.unitsSettled}/${facts.unitsTotal}`;
        progress.dataset['runCompletedAttempts'] = String(facts.completedAttempts);
        if (facts.attemptState !== null) progress.dataset['runAttemptState'] = facts.attemptState;
        // The stale reading is an attribute as well as a sentence so a Journey can observe it without
        // matching prose, and so the surface can style it without a second element.
        if (stale) progress.dataset['runLiveness'] = 'stale';
        progress.setAttribute('aria-live', 'polite');
        const reading = [
          RUN_LIVENESS_STAGE_LABELS[facts.stage],
          `已读完 ${facts.unitsSettled} / ${facts.unitsTotal} 个阅读范围${projection.update === null ? '' : '（只算要重新分析的）'}`,
          ...(facts.currentUnitOrdinal === null ? [] : [`正在读第 ${facts.currentUnitOrdinal} 个`]),
          ...(elapsedMs === null ? [] : [`本步已用时 ${elapsedLabel(elapsedMs)}`]),
          ...(facts.attemptState === null ? [] : [attemptStateLabel(facts.attemptState)]),
          `上次状态更新 ${localInstantLabel(facts.lastTransitionAt)}`,
          `已完成模型回合 ${facts.completedAttempts} 次`,
        ].join(' · ');
        // Over the bar this Run measured for itself, the surface says so and shows the same facts. It
        // adds no action: cancelling is already the safe one, and it never claims the Run has died.
        progress.textContent = stale ? `本步骤用时已超过通常水平。${reading}` : reading;
        progress.append(element('span', 'technical-identity', facts.currentUnitStartedAt === null
          ? `上次状态更新 ${facts.lastTransitionAt}`
          : `本单元开始 ${facts.currentUnitStartedAt} · 上次状态更新 ${facts.lastTransitionAt}`));
        runSection.append(progress);
      }
      card.append(runSection);
    }
  }

  return { renderBaselineAnalysis, renderRunReport };
}
