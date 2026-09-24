import {
  MAX_REVIEW_FINDING_REASON_CHARACTERS,
  type ReviewChapterOptionProjection,
  type ReviewCoverageRowProjection,
  type ReviewCoverageState,
  type ReviewFindingCountsProjection,
  type ReviewFindingProjection,
  type ReviewFindingSeverity,
  type ReviewFindingStatus,
  type ReviewRunCategoryProjection,
  type ReviewRunCategoryState,
  type ReviewRunState,
  type ReviewRunSummaryProjection,
  type ReviewScopeKind,
  type ReviewWorkspaceProjection,
} from '../shared/protocol.js';
import { attemptStateLabel, elapsedLabel, runStepIsStale } from './plan-preview-labels.js';

/**
 * Every word of the 审阅 destination (editor-surfaces §4, V2-UX-REV-001 to REV-013) that the service
 * projection does not already carry. The projection's own labels — a category's name, description and
 * basis, a state's label, a severity's and a status's label, a scope's label — are shown as they come;
 * these are the sentences around them. Where the specification or ②A fixes a wording, it is used
 * verbatim. Pure, so the unit suite pins every string byte for byte.
 */

// ---- the destination --------------------------------------------------------------------------------

export const REVIEW_SECTION_LABEL = '工作 · 审阅';
export const REVIEW_LEDE = '按类别审读这本书的稿件：选好类别和范围，先看计划，授权一次后逐类审阅。发现以修改建议和批注标在稿件上，由你逐条决定；审阅本身不改稿件。';
/** The editor toolbar's group (V2-UX-IA-006: 工作 · 稿件 / 审阅 / 评估 / 交付物) and its one entry today. */
export const REVIEW_WORK_GROUP_LABEL = '工作';
export const REVIEW_ENTRY_LABEL = '审阅';
export const REVIEW_CARD_HEADING = '审阅';
export const REVIEW_COVERAGE_HEADING = '审阅覆盖矩阵';
export const REVIEW_COVERAGE_NOTE = '每一类对照当前稿件：稿件改动后需要复审的类别会标出来，可以只审改动过的章。';
export const REVIEW_COVERAGE_COLUMNS = ['类别', '当前稿件', '上次审阅', '改动', '可以做什么'] as const;
export const REVIEW_RUNS_HEADING = '审阅记录';
export const REVIEW_NO_RUNS = '还没有审阅记录；每新建一次审阅，都会记在这里。';
export const REVIEW_WORKSPACE_UNAVAILABLE = '无法读取这本书的审阅记录。';

/** The persistent actions of the destination, in the order it builds them (V2-UX-LAYER-005). */
export const REVIEW_DESTINATION_ACTIONS = ['打开稿件', '工作概览'] as const;

/**
 * The label of every `data-review-action` the destination carries. `generate-report` reads `生成报告`
 * before the first version and `生成新版本` after it (`reviewGenerateReportLabel`).
 */
export const REVIEW_ACTION_LABELS = {
  'new-review': '新建审阅',
  'rereview-changed': '只审改动过的章',
  'open-run': '查看这次审阅',
  prepare: '先看计划',
  'quick-start': '开始审阅',
  'cancel-preparation': '取消准备',
  'close-sheet': '取消',
  revise: '返回修改',
  continue: '继续审阅',
  'go-to-text': '回到原文',
  'accept-apply': '接受并应用',
  'mark-handled': '标记为已处理',
  'convert-to-suggestion': '转为修改建议',
  'convert-confirm': '转为修改建议',
  'convert-cancel': '取消',
  ignore: '忽略并说明',
  'ignore-confirm': '确认忽略',
  'ignore-cancel': '取消',
  'batch-prepare': '接受并应用全部',
  'batch-confirm': '确认应用',
  'batch-cancel': '取消',
  'batch-reprepare': '重新准备应用',
  'more-findings': '显示更多发现',
  'generate-report': '生成报告',
  export: '导出',
  'open-manuscript': '打开稿件',
  'open-review': '打开审阅',
  /**
   * S72 D4: a prepared Run's plan opens in the Task Drawer. Since S74a (A5) the Run's one approval is the
   * drawer bar's 开始任务, so a prepared Run's entry reads `查看计划并开始` (TASK_PLAN_OPEN_START).
   */
  'view-plan': '查看计划',
} as const;
export type ReviewAction = keyof typeof REVIEW_ACTION_LABELS;

export function reviewGenerateReportLabel(latestVersion: number | null): string {
  return latestVersion === null ? REVIEW_ACTION_LABELS['generate-report'] : '生成新版本';
}

/** A Book's primary Manuscript as the card names it; the review always reads the manuscript as it stands. */
export function reviewManuscriptLine(manuscript: ReviewWorkspaceProjection['manuscript']): string {
  return manuscript === null
    ? '这本书还没有稿件；导入稿件后才能审阅。'
    : `当前稿件：修订版 ${manuscript.revisionLabel} · ${manuscript.totalBlocks} 个内容块`;
}

// ---- state pills: text and shape, never colour alone (editor-surfaces §0.3) ----------------------------

/** The four tones of §0.3's state pill — 好 / 注意 / 阻塞 / 进行中 — and a neutral one for what has not begun. */
export type ReviewPillTone = 'good' | 'attention' | 'blocked' | 'progress' | 'neutral';
/** The shape each pill draws beside its words, so the pill still reads without colour and in forced colours. */
export type ReviewPillShape = 'circle' | 'ring' | 'half' | 'triangle' | 'square' | 'diamond' | 'check' | 'dash';
export interface ReviewPill {
  readonly tone: ReviewPillTone;
  readonly shape: ReviewPillShape;
}

export const REVIEW_COVERAGE_PILLS: Readonly<Record<ReviewCoverageState, ReviewPill>> = {
  never: { tone: 'neutral', shape: 'ring' },
  current: { tone: 'good', shape: 'circle' },
  'needs-review': { tone: 'attention', shape: 'triangle' },
  unavailable: { tone: 'neutral', shape: 'dash' },
};

export const REVIEW_RUN_STATE_PILLS: Readonly<Record<ReviewRunState, ReviewPill>> = {
  prepared: { tone: 'neutral', shape: 'ring' },
  running: { tone: 'progress', shape: 'half' },
  settled: { tone: 'good', shape: 'circle' },
  partial: { tone: 'attention', shape: 'triangle' },
  failed: { tone: 'blocked', shape: 'square' },
};

export const REVIEW_CATEGORY_STATE_PILLS: Readonly<Record<ReviewRunCategoryState, ReviewPill>> = {
  prepared: { tone: 'neutral', shape: 'ring' },
  waiting: { tone: 'neutral', shape: 'ring' },
  running: { tone: 'progress', shape: 'half' },
  settled: { tone: 'good', shape: 'circle' },
  failed: { tone: 'blocked', shape: 'square' },
  interrupted: { tone: 'attention', shape: 'triangle' },
  refused: { tone: 'blocked', shape: 'square' },
};

/** V2-UX-REV-004's severities: each its own shape, so 必须处理 never reads as 提示 without colour. */
export const REVIEW_SEVERITY_PILLS: Readonly<Record<ReviewFindingSeverity, ReviewPill>> = {
  must: { tone: 'blocked', shape: 'diamond' },
  should: { tone: 'attention', shape: 'triangle' },
  note: { tone: 'neutral', shape: 'circle' },
};

/** V2-UX-REV-004's statuses, drawn apart from the severities beside them. */
export const REVIEW_STATUS_PILLS: Readonly<Record<ReviewFindingStatus, ReviewPill>> = {
  pending: { tone: 'progress', shape: 'ring' },
  handled: { tone: 'good', shape: 'check' },
  ignored: { tone: 'neutral', shape: 'dash' },
};

// ---- the coverage matrix and the 审阅记录 -----------------------------------------------------------

export function reviewCoverageLastReview(row: Pick<ReviewCoverageRowProjection, 'lastRunOrdinal' | 'lastReviewedRevisionLabel'>): string {
  return row.lastRunOrdinal === null ? '—' : `第 ${row.lastRunOrdinal} 次 · 读的是 ${row.lastReviewedRevisionLabel ?? '—'}`;
}

export function reviewCoverageChanges(row: Pick<ReviewCoverageRowProjection, 'changedBlocks'>): string {
  if (row.changedBlocks === null) return '—';
  return row.changedBlocks === 0 ? '没有改动' : `改动了 ${row.changedBlocks} 个内容块`;
}

/** One entry of the 审阅记录: `第 N 次 · 类别 · 范围 · 状态`, newest first. */
export function reviewRunLine(summary: Pick<ReviewRunSummaryProjection, 'label' | 'categoryLabels' | 'scopeLabel' | 'stateLabel'>): string {
  return `${summary.label} · ${summary.categoryLabels.join('、')} · ${summary.scopeLabel} · ${summary.stateLabel}`;
}

/** Findings by severity and by status, each counted once in both. */
export function reviewCountsLine(counts: ReviewFindingCountsProjection): string {
  return `必须处理 ${counts.must} · 建议处理 ${counts.should} · 提示 ${counts.note} · 待处理 ${counts.pending} · 已处理 ${counts.handled} · 已忽略 ${counts.ignored}`;
}

export function reviewRunReportLine(reportVersion: number | null): string {
  return reportVersion === null ? '尚未生成报告' : `报告第 ${reportVersion} 版`;
}

export function reviewRunsTruncatedLine(listed: number): string {
  return `只列出最近 ${listed} 次审阅。`;
}

// ---- 新建审阅 --------------------------------------------------------------------------------------

export const REVIEW_SHEET_TITLE = '新建审阅';
export const REVIEW_SHEET_NOTE = '类别和范围都不预选。先看计划会为每一类冻结一份计划，你看过后再一次授权。';
export const REVIEW_CATEGORY_LEGEND = '审阅类别（可多选）';
export const REVIEW_SCOPE_LEGEND = '审阅范围（四选一）';
export const REVIEW_CHAPTER_FROM = '从';
export const REVIEW_CHAPTER_TO = '到';
export const REVIEW_CHAPTER_PLACEHOLDER = '请选择';
/** ②A's exact reason (editor-surfaces §6, B11): the quick start waits for a Default Execution Rule (S75). */
export const REVIEW_QUICK_START_REASON = '审阅没有快速开始：每次都先看计划，再开始任务。';
export const REVIEW_CONSEQUENCE_TERMS = ['会读取', '会发送', '不会做', '费用'] as const;
/** §10's target words for what a Task never does, the editor's half; the technical half is the plan's. */
export const REVIEW_NOT_DO = '不会直接修改稿件；不读范围外正文；不导出或发布；不存里程碑。';
export const REVIEW_COST_BEFORE_PLAN = '先看计划后显示';
export const REVIEW_PICK_CATEGORY = '请至少选择一个审阅类别。';
export const REVIEW_PICK_SCOPE = '请选择审阅范围。';
export const REVIEW_PICK_CHAPTERS = '请选择起止的章。';
export const REVIEW_CHAPTERS_REVERSED = '结束的章不能在开始的章之前。';
export const REVIEW_PREPARING_ESCAPE = '正在准备审阅计划；要停止，请点「取消准备」。';

export function reviewChapterOptionLabel(chapter: Pick<ReviewChapterOptionProjection, 'title' | 'position' | 'endPosition'>): string {
  return `${chapter.title}（内容块 ${chapter.position}–${chapter.endPosition}）`;
}

/** 会读取: what the chosen scope reads, in the manuscript's own terms, before any plan exists. */
export function reviewReadConsequence(
  scope: ReviewScopeKind | null,
  manuscript: ReviewWorkspaceProjection['manuscript'],
  chapters: { from: ReviewChapterOptionProjection | null; to: ReviewChapterOptionProjection | null },
): string {
  switch (scope) {
    case null:
      return '选好范围后显示';
    case 'whole':
      return manuscript === null ? '这本书还没有稿件。' : `当前稿件（修订版 ${manuscript.revisionLabel}）的全部 ${manuscript.totalBlocks} 个内容块`;
    case 'chapters':
      return chapters.from === null || chapters.to === null
        ? '选好起止的章后显示'
        : `所选各章：从「${chapters.from.title}」到「${chapters.to.title}」（内容块 ${chapters.from.position}–${chapters.to.endPosition}）`;
    case 'changed':
      return '每一类上次审阅之后改动过的章；没有审阅过的类别不能这样审';
    case 'selection':
      return '稿件里选中的文字';
  }
}

/**
 * 会发送: the Outbound Data Category at full rank (V2-UX-LAYER-002). The leads read the baseline analysis
 * only; every other category sends what it reads with its own guideline clauses.
 */
export function reviewSendConsequence(selected: ReadonlyArray<{ readonly label: string; readonly modelFree: boolean }>): string {
  if (selected.length === 0) return '选好类别后显示';
  if (selected.every((category) => category.modelFree)) return '只读基线分析的线索，不发送任何内容。';
  const free = selected.filter((category) => category.modelFree).map((category) => `「${category.label}」`);
  const sent = '所读范围内的稿件正文和所选类别的规范条款，发往为审阅配置的模型服务';
  return free.length === 0 ? `${sent}。` : `${sent}；${free.join('、')}只读基线分析的线索，不发送。`;
}

export function reviewPreparationLine(progress: { completed: number; total: number; label: string }): string {
  return progress.total > 0 ? `${progress.label} · ${progress.completed} / ${progress.total}` : progress.label;
}

// ---- the plan ---------------------------------------------------------------------------------------

/**
 * A prepared Run's plan on the destination is one line and 查看计划并开始 (S72 D4, S74a A5): every category's
 * plan — what it reads, reuses and sends, its route and its ceiling — reads in the Task Drawer, and its bar
 * carries AUTH-003's statement beside the Run's one approval.
 */
export const REVIEW_PLAN_HEADING = '审阅计划';

export function reviewPlanCategoriesLine(categories: number): string {
  return `${categories} 个类别，授权一次后逐类审阅`;
}

// ---- running ----------------------------------------------------------------------------------------

export const REVIEW_PROGRESS_HEADING = '各类别进度';
export const REVIEW_CONTINUE_NOTE = '这次审阅中途停止了；继续审阅会从没有完成的类别接着审，已完成的类别不再重复。';

/** The step a category's Run is in (V2-UX-LIVE-001), in 审阅's words. */
export const REVIEW_STAGE_LABELS: Readonly<Record<'units' | 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection', string>> = {
  units: '正在逐个阅读范围审阅',
  'cross-unit-reduction': '正在跨范围比对',
  'assurance-sampling': '正在抽样复核',
  'run-report-reflection': '发现已保存，正在写运行报告',
};

/**
 * One category's progress line: while its Run executes, the measured facts (units settled of the total,
 * the unit in flight and for how long, the attempt, the model turns) and nothing estimated; once it has
 * settled, what it found; otherwise its state's own detail. `now` is the reader's clock, for the elapsed time.
 */
export function reviewCategoryProgressLine(category: Pick<ReviewRunCategoryProjection, 'state' | 'stateLabel' | 'detail' | 'progress' | 'findingsCount' | 'excludedCount'>, now: number): string {
  const facts = category.progress;
  if (category.state === 'running' && facts !== null) {
    const elapsedMs = facts.currentUnitStartedAt === null ? null : now - Date.parse(facts.currentUnitStartedAt);
    const stale = elapsedMs !== null && runStepIsStale(elapsedMs, facts.longestSettledUnitMs);
    const reading = [
      REVIEW_STAGE_LABELS[facts.stage],
      `已读完 ${facts.unitsSettled} / ${facts.unitsTotal} 个阅读范围`,
      ...(facts.currentUnitOrdinal === null ? [] : [`正在读第 ${facts.currentUnitOrdinal} 个`]),
      ...(elapsedMs === null ? [] : [`本步已用时 ${elapsedLabel(elapsedMs)}`]),
      ...(facts.attemptState === null ? [] : [attemptStateLabel(facts.attemptState)]),
      `已完成模型回合 ${facts.completedAttempts} 次`,
    ].join(' · ');
    return stale ? `本步骤用时已超过通常水平。${reading}` : reading;
  }
  switch (category.state) {
    case 'running':
      return '正在审阅这一类';
    case 'settled':
      return category.excludedCount === 0
        ? `${category.findingsCount} 条发现，已标在稿件上`
        : `${category.findingsCount} 条发现，已标在稿件上；另有 ${category.excludedCount} 条无法在稿件上定位，没有列为发现`;
    case 'waiting':
      return category.detail ?? '排在前面的类别完成后开始';
    case 'prepared':
      return '计划已冻结，等你授权';
    default:
      return category.detail ?? category.stateLabel;
  }
}

/** What the live region says while a Run is under way: which category, and how far. */
export function reviewLiveLine(runLabel: string, category: Pick<ReviewRunCategoryProjection, 'label' | 'stateLabel' | 'progress'> | null): string {
  if (category === null) return `${runLabel}审阅`;
  const facts = category.progress;
  return facts === null
    ? `${runLabel}审阅 · ${category.label} · ${category.stateLabel}`
    : `${runLabel}审阅 · ${category.label} · 已读完 ${facts.unitsSettled} / ${facts.unitsTotal} 个阅读范围`;
}

// ---- results ----------------------------------------------------------------------------------------

export const REVIEW_RESULTS_HEADING = '发现';
export const REVIEW_FILTER_LABELS = { category: '类别', severity: '严重度', status: '状态', chapter: '章' } as const;
export const REVIEW_FILTER_ALL = '全部';
export const REVIEW_FILTER_NOTE = '筛选只改变这里显示哪些发现，不改变发现本身。';
export const REVIEW_NO_FINDINGS = '这次审阅还没有发现；每一类完成后，它的发现会立即出现在这里。';
export const REVIEW_NO_FILTERED_FINDINGS = '没有符合筛选的发现。';
/** V2-UX-REV-003: categories 5 and 6 mark only this, never a compliance, plagiarism or policy verdict. */
export const REVIEW_RISK_POINT = '需人工复核的风险点';
export const REVIEW_ANCHOR_CHANGED = '原文已变，未能在稿件上标出';
/** Said when a manuscript action is refused for want of the window's manuscript capability. */
export const REVIEW_CAPABILITY_REASON = '请先打开稿件再处理这条发现。';
export const REVIEW_BLOCK_GONE = '这段文字所在的内容块已不在当前稿件中。';
export const REVIEW_CANNOT_APPLY = '原文已变，无法应用这条修改建议。';
export const REVIEW_CANNOT_CONVERT = '原文已变，无法在这段文字上转换。';

export function reviewResultsCountsLine(counts: ReviewFindingCountsProjection): string {
  return `共 ${counts.pending + counts.handled + counts.ignored} 条 · ${reviewCountsLine(counts)}`;
}

export function reviewFilteredLine(total: number): string {
  return `符合筛选的有 ${total} 条。`;
}

export function reviewShownLine(shown: number, total: number): string {
  return `已显示 ${shown} / ${total} 条。`;
}

export function reviewGroupCountLine(findingsCount: number): string {
  return `本类 ${findingsCount} 条`;
}

/** Where a finding stands in the manuscript now: its chapter and block, or that its block is gone. */
export function reviewFindingLocation(finding: Pick<ReviewFindingProjection, 'chapterTitle' | 'blockPosition'>): string {
  if (finding.blockPosition === null) return '所在的内容块已不在当前稿件中';
  return finding.chapterTitle === null ? `内容块 ${finding.blockPosition}` : `「${finding.chapterTitle}」 · 内容块 ${finding.blockPosition}`;
}

export function reviewQuote(quote: string): string {
  return `「${quote}」`;
}

/** What a 修改建议 proposes in place of its quotation; an empty replacement proposes deleting it. */
export function reviewReplacementLine(replacement: string): string {
  return replacement.length === 0 ? '建议删去这段文字' : `改为「${replacement}」`;
}

export function reviewClauseLine(clause: { documentTitle: string; clauseId: string; text: string }): string {
  return `依据：条款 ${clause.clauseId} · ${clause.documentTitle}：${clause.text}`;
}

export function reviewIgnoreReasonLine(reason: string): string {
  return `忽略的原因：${reason}`;
}

// ---- a finding's own actions ------------------------------------------------------------------------

export const REVIEW_IGNORE_LABEL = `忽略的原因（必填，最多 ${MAX_REVIEW_FINDING_REASON_CHARACTERS} 字）`;
export const REVIEW_IGNORE_NOTE = '忽略后，这条发现在稿件上的标记会移开；原因会记下来，用于改进审阅。';
export const REVIEW_IGNORE_REQUIRED = '忽略一条发现需要说明原因。';
export const REVIEW_CONVERT_TO = '改为';
export const REVIEW_CONVERT_TO_HINT = '留空表示删去这段文字。';
export const REVIEW_CONVERT_RATIONALE = '修改理由（可选）';
export const REVIEW_CONVERT_NOTE = '转为修改建议后，这条批注记为已处理；稿件本身不变，修改建议仍要你接受才会写入。';

/**
 * 忽略并说明's reason as the service will read it (V2-UX-REV-004): trimmed, not blank, and at most 500
 * characters. The surface says so before sending, so a frame never carries a reason the service refuses.
 */
export function reviewIgnoreReasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return REVIEW_IGNORE_REQUIRED;
  if ([...trimmed].length > MAX_REVIEW_FINDING_REASON_CHARACTERS) return `原因不能超过 ${MAX_REVIEW_FINDING_REASON_CHARACTERS} 个字。`;
  return null;
}

export function reviewIgnoreReasonCount(reason: string): string {
  return `${[...reason.trim()].length} / ${MAX_REVIEW_FINDING_REASON_CHARACTERS} 字`;
}

// ---- the batch confirmation strip (V2-UX-REV-006, PDEC-012, EAPP-003) -----------------------------------

export const REVIEW_BATCH_ALL_OR_NONE = '确认后一次写入稿件：全部写入，或一条也不写。';
export const REVIEW_BATCH_NOTHING = '没有可以一起应用的修改建议：本类待处理、原文未变的修改建议已经都处理过了。';
export const REVIEW_BATCH_REFUSED = '稿件没有改动。请重新准备应用：原文已变的修改建议不会再列入。';

/** The write scope stated before 确认应用, exactly as the strip will send it. */
export function reviewBatchScopeLine(count: number): string {
  return `将把 ${count} 条修改建议写入稿件：`;
}

export function reviewBatchItemLine(quote: string, replacement: string): string {
  return replacement.length === 0 ? `「${quote}」→（删去）` : `「${quote}」→「${replacement}」`;
}

export function reviewBatchExcludedLine(excluded: number): string {
  return `另有 ${excluded} 条原文已变或已不在稿件上，不在其中；它们要在稿件上逐条处理。`;
}

export function reviewBatchCappedLine(maximum: number): string {
  return `一次最多应用 ${maximum} 条；其余的在这次应用之后再准备。`;
}

// ---- the 审阅报告 (V2-UX-REV-009) ---------------------------------------------------------------------

export const REVIEW_REPORT_HEADING = '审阅报告';
export const REVIEW_REPORT_NOTE = '报告按版本保存：再生成一次得到新的版本，旧版本原样保留。';
export const REVIEW_REPORT_NONE = '还没有生成报告。';
/** Export belongs to the Delivery Package (S64); until then it is shown, disabled, with this reason. */
export const REVIEW_EXPORT_REASON = '导出随交付物功能提供。';
export const REVIEW_REPORT_WAIT_RUNNING = '审阅进行中；结束后再生成报告。';
export const REVIEW_REPORT_NO_MUST_ITEMS = '没有必须处理的事项。';

export function reviewReportVersionLine(version: number, generatedAtLabel: string): string {
  return `第 ${version} 版 · 生成于 ${generatedAtLabel}`;
}

export function reviewReportMustItemLine(item: { categoryLabel: string; locationLabel: string; quote: string; note: string; statusLabel: string }): string {
  return `${item.categoryLabel} · ${item.locationLabel} · 「${item.quote}」 · ${item.note} · ${item.statusLabel}`;
}

export function reviewReportExcludedLine(excluded: number): string {
  return excluded === 0 ? '列出的发现都已在稿件上定位' : `另有 ${excluded} 条无法在稿件上定位，没有列为发现`;
}

export const REVIEW_REPORT_OVERVIEW_COLUMNS = ['类别', '状态', '发现'] as const;

export function reviewReportConfigurationLine(version: string): string {
  return `审阅配置第 ${version} 版`;
}

/** 附录: what a category applied — its guideline documents and its 工序, each with its version (REV-009, REV-012). */
export function reviewReportAppendixLine(category: {
  label: string;
  guidelineDocuments: ReadonlyArray<{ issuer: string; title: string; version: string }>;
  procedure: { title: string; version: string };
}): string {
  const documents = category.guidelineDocuments.length === 0
    ? '没有规范文件'
    : category.guidelineDocuments.map((document) => `${document.issuer} · ${document.title}（第 ${document.version} 版）`).join('、');
  return `${category.label}：${documents}；工序：${category.procedure.title}（第 ${category.procedure.version} 版）`;
}

// ---- the opened Run --------------------------------------------------------------------------------

export function reviewRunHeading(label: string): string {
  return `${label}审阅`;
}

export function reviewRunMetaLine(scopeLabel: string, revisionLabel: string): string {
  return `${scopeLabel} · 读的是修订版 ${revisionLabel}`;
}

export function reviewCreatedLine(localInstant: string): string {
  return `创建于 ${localInstant}`;
}

export function reviewAuthorizedLine(localInstant: string): string {
  return `授权于 ${localInstant}`;
}

/** What the status line says as each action of the destination starts and ends. */
export const REVIEW_STATUS_LINES = {
  opened: '审阅已打开',
  refreshFailed: '无法刷新审阅。',
  preparing: '正在准备审阅计划…',
  prepared: '审阅计划已冻结；可在任务计划里开始审阅。',
  preparationCancelled: '审阅计划准备已取消；稿件与审阅记录保持不变。',
  preparationFailed: '无法准备审阅计划。',
  continuing: '正在继续审阅…',
  continued: '已继续审阅。',
  continueFailed: '无法继续这次审阅。',
  applying: '正在应用到稿件…',
  applied: '已应用这条修改建议。',
  appliedRecovered: '已应用这条修改建议。写入结果已从记录确认。',
  notApplied: '这次应用没有写入稿件。',
  applyUnknown: '无法确认这次应用的结果；请刷新审阅后查看。',
  markingHandled: '正在标记为已处理…',
  markedHandled: '已标记为已处理。',
  markFailed: '这条批注未能标记为已处理。',
  openingConvert: '正在读取这条批注…',
  convertOpened: '请写出改成什么，再转为修改建议。',
  converting: '正在转为修改建议…',
  converted: '已转为修改建议。',
  convertFailed: '这条批注未能转为修改建议。',
  ignoring: '正在记录忽略的原因…',
  ignored: '已忽略这条发现，原因已记录。',
  ignoreFailed: '这条发现未能忽略。',
  batchPreparing: '正在列出这一类可以一起应用的修改建议…',
  batchPrepareFailed: '无法准备这次应用。',
  reporting: '正在生成审阅报告…',
  reportFailed: '无法生成审阅报告。',
  openingText: '正在打开对应的稿件位置…',
  openTextFailed: '无法打开对应的稿件位置。',
} as const;

export function reviewBatchReadyLine(count: number): string {
  return `将把 ${count} 条修改建议写入稿件；请核对后确认应用。`;
}

export function reviewBatchAppliedLine(count: number, recovered: boolean): string {
  return `已把 ${count} 条修改建议写入稿件。${recovered ? '写入结果已从记录确认。' : ''}`;
}

export function reviewReportGeneratedLine(version: number): string {
  return `已生成审阅报告第 ${version} 版。`;
}

// ---- entry points ----------------------------------------------------------------------------------

/** 工作概览's one line for 审阅 (editor-surfaces §2): the latest Review Run, and what waits for the editor. */
export function reviewOverviewLine(workspace: Pick<ReviewWorkspaceProjection, 'runs' | 'coverage'>): string {
  const latest = workspace.runs[0];
  const stale = workspace.coverage.filter((row) => row.state === 'needs-review').length;
  const staleClause = stale === 0 ? '' : `；${stale} 类需复审`;
  if (latest === undefined) return `审阅 · 还没有审阅记录${staleClause}`;
  return `审阅 · 最近一次是${latest.label}（${latest.stateLabel}），待处理 ${latest.findingCounts.pending} 条${staleClause}`;
}

/** 查看任务 on a Mark Card while the mark's Review Run is looked up, and when there is none to open. */
export const REVIEW_VIEW_TASK_RESOLVING = '正在查找这条标记来自哪次审阅…';
export const REVIEW_VIEW_TASK_ABSENT = '找不到产生这条标记的审阅记录。';
