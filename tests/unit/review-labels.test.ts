import { describe, expect, it } from 'vitest';
import {
  REVIEW_ACTION_LABELS,
  REVIEW_ANCHOR_CHANGED,
  REVIEW_AUTHORIZE_NOTE,
  REVIEW_BATCH_ALL_OR_NONE,
  REVIEW_CAPABILITY_REASON,
  REVIEW_CATEGORY_STATE_PILLS,
  REVIEW_CONSEQUENCE_TERMS,
  REVIEW_COST_BEFORE_PLAN,
  REVIEW_COVERAGE_PILLS,
  REVIEW_DESTINATION_ACTIONS,
  REVIEW_EXPORT_REASON,
  REVIEW_FILTER_ALL,
  REVIEW_FILTER_LABELS,
  REVIEW_IGNORE_LABEL,
  REVIEW_IGNORE_REQUIRED,
  REVIEW_LEADS_PLAN,
  REVIEW_NOT_DO,
  REVIEW_QUICK_START_REASON,
  REVIEW_REPORT_OVERVIEW_COLUMNS,
  REVIEW_RISK_POINT,
  REVIEW_RUN_STATE_PILLS,
  REVIEW_SECTION_LABEL,
  REVIEW_SEVERITY_PILLS,
  REVIEW_STAGE_LABELS,
  REVIEW_STATUS_LINES,
  REVIEW_STATUS_PILLS,
  REVIEW_WORK_GROUP_LABEL,
  reviewAuthorizedLine,
  reviewBatchAppliedLine,
  reviewBatchCappedLine,
  reviewBatchReadyLine,
  reviewCreatedLine,
  reviewReportAppendixLine,
  reviewReportConfigurationLine,
  reviewReportExcludedLine,
  reviewReportGeneratedLine,
  reviewRunHeading,
  reviewRunMetaLine,
  reviewBatchExcludedLine,
  reviewBatchItemLine,
  reviewBatchScopeLine,
  reviewCategoryProgressLine,
  reviewChapterOptionLabel,
  reviewClauseLine,
  reviewCountsLine,
  reviewCoverageChanges,
  reviewCoverageLastReview,
  reviewFindingLocation,
  reviewGenerateReportLabel,
  reviewIgnoreReasonCount,
  reviewIgnoreReasonProblem,
  reviewLiveLine,
  reviewManuscriptLine,
  reviewOverviewLine,
  reviewPlanHeading,
  reviewPlanIntro,
  reviewPlanUnits,
  reviewPreparationLine,
  reviewReadConsequence,
  reviewReplacementLine,
  reviewReportMustItemLine,
  reviewReportVersionLine,
  reviewResultsCountsLine,
  reviewRunLine,
  reviewSendConsequence,
} from '../../src/renderer/review-labels.js';
import type { ReviewChapterOptionProjection, ReviewFindingCountsProjection, ReviewRunCategoryProjection } from '../../src/shared/protocol.js';

// Unit suite for the words of 审阅 (Issue #417; editor-surfaces §4). Every string is compared byte for
// byte, so a wording change is a decision made here and never a drift noticed in a Journey.

const counts: ReviewFindingCountsProjection = { must: 2, should: 5, note: 1, pending: 6, handled: 1, ignored: 1 };
const manuscript = { manuscriptId: 'm', branchId: 'b', revisionId: 'r', revisionLabel: 'r2', journalSequence: 3, workingDigest: 'd', totalBlocks: 97 };
const first: ReviewChapterOptionProjection = { blockId: 'blk_a', title: '第一章', level: 1, position: 1, endPosition: 15 };
const third: ReviewChapterOptionProjection = { blockId: 'blk_c', title: '第三章', level: 1, position: 26, endPosition: 43 };

function category(overrides: Partial<ReviewRunCategoryProjection>): ReviewRunCategoryProjection {
  return {
    categoryId: 'typos-and-usage', label: '错别字与规范用语', position: 1, output: 'change-suggestion', riskPointsOnly: false, batchApply: true,
    basisStatement: '依据：…', state: 'waiting', stateLabel: '等待审阅', detail: null, taskIntentId: 'task', planEnvelopeDigest: 'a'.repeat(64),
    modeLabel: '全书审阅', plan: null, progress: null, findingsCount: 0, excludedCount: 0, ...overrides,
  };
}

describe('the words of the 审阅 destination', () => {
  it('names the destination, its group and its persistent actions', () => {
    expect(REVIEW_SECTION_LABEL).toBe('工作 · 审阅');
    expect(REVIEW_WORK_GROUP_LABEL).toBe('工作');
    expect(REVIEW_DESTINATION_ACTIONS).toEqual(['打开稿件', '工作概览']);
    expect(reviewManuscriptLine(manuscript)).toBe('当前稿件：修订版 r2 · 97 个内容块');
    expect(reviewManuscriptLine(null)).toBe('这本书还没有稿件；导入稿件后才能审阅。');
  });

  it('labels every action with the specification\'s own words', () => {
    expect(REVIEW_ACTION_LABELS).toEqual({
      'new-review': '新建审阅',
      'rereview-changed': '只审改动过的章',
      'open-run': '查看这次审阅',
      prepare: '先看计划',
      'quick-start': '开始审阅',
      'cancel-preparation': '取消准备',
      'close-sheet': '取消',
      authorize: '授权并开始审阅',
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
    });
    expect(reviewGenerateReportLabel(null)).toBe('生成报告');
    expect(reviewGenerateReportLabel(2)).toBe('生成新版本');
  });

  it('draws every state with a shape as well as a tone, and never the same shape for two severities', () => {
    expect(REVIEW_COVERAGE_PILLS).toEqual({
      never: { tone: 'neutral', shape: 'ring' },
      current: { tone: 'good', shape: 'circle' },
      'needs-review': { tone: 'attention', shape: 'triangle' },
      unavailable: { tone: 'neutral', shape: 'dash' },
    });
    expect(REVIEW_RUN_STATE_PILLS.running).toEqual({ tone: 'progress', shape: 'half' });
    expect(REVIEW_RUN_STATE_PILLS.failed).toEqual({ tone: 'blocked', shape: 'square' });
    expect(REVIEW_CATEGORY_STATE_PILLS.refused).toEqual({ tone: 'blocked', shape: 'square' });
    expect(REVIEW_CATEGORY_STATE_PILLS.interrupted).toEqual({ tone: 'attention', shape: 'triangle' });
    const severityShapes = Object.values(REVIEW_SEVERITY_PILLS).map((pill) => pill.shape);
    expect(new Set(severityShapes).size).toBe(3);
    expect(Object.values(REVIEW_STATUS_PILLS).map((pill) => pill.shape)).toEqual(['ring', 'check', 'dash']);
    expect(new Set(Object.values(REVIEW_STATUS_PILLS).map((pill) => pill.shape)).size).toBe(3);
  });

  it('reads the coverage matrix and the 审阅记录', () => {
    expect(reviewCoverageLastReview({ lastRunOrdinal: null, lastReviewedRevisionLabel: null })).toBe('—');
    expect(reviewCoverageLastReview({ lastRunOrdinal: 2, lastReviewedRevisionLabel: 'r1' })).toBe('第 2 次 · 读的是 r1');
    expect(reviewCoverageChanges({ changedBlocks: null })).toBe('—');
    expect(reviewCoverageChanges({ changedBlocks: 0 })).toBe('没有改动');
    expect(reviewCoverageChanges({ changedBlocks: 3 })).toBe('改动了 3 个内容块');
    expect(reviewRunLine({ label: '第 3 次', categoryLabels: ['错别字与规范用语', '体例与格式'], scopeLabel: '全书', stateLabel: '已完成' }))
      .toBe('第 3 次 · 错别字与规范用语、体例与格式 · 全书 · 已完成');
    expect(reviewCountsLine(counts)).toBe('必须处理 2 · 建议处理 5 · 提示 1 · 待处理 6 · 已处理 1 · 已忽略 1');
    expect(reviewResultsCountsLine(counts)).toBe('共 8 条 · 必须处理 2 · 建议处理 5 · 提示 1 · 待处理 6 · 已处理 1 · 已忽略 1');
  });

  it('states the four consequences of 新建审阅 before any plan exists', () => {
    expect(REVIEW_CONSEQUENCE_TERMS).toEqual(['会读取', '会发送', '不会做', '费用']);
    expect(REVIEW_COST_BEFORE_PLAN).toBe('先看计划后显示');
    expect(REVIEW_NOT_DO).toBe('不会直接修改稿件；不读范围外正文；不导出或发布；不存里程碑。');
    expect(REVIEW_QUICK_START_REASON).toBe('快速开始要先有「快速开始默认」，目前还没有设定；请先看计划，再开始任务。');
    const none = { from: null, to: null };
    expect(reviewReadConsequence(null, manuscript, none)).toBe('选好范围后显示');
    expect(reviewReadConsequence('whole', manuscript, none)).toBe('当前稿件（修订版 r2）的全部 97 个内容块');
    expect(reviewReadConsequence('chapters', manuscript, { from: first, to: null })).toBe('选好起止的章后显示');
    expect(reviewReadConsequence('chapters', manuscript, { from: first, to: third })).toBe('所选各章：从「第一章」到「第三章」（内容块 1–43）');
    expect(reviewReadConsequence('changed', manuscript, none)).toBe('每一类上次审阅之后改动过的章；没有审阅过的类别不能这样审');
    expect(reviewReadConsequence('selection', manuscript, none)).toBe('稿件里选中的文字');
    expect(reviewSendConsequence([])).toBe('选好类别后显示');
    expect(reviewSendConsequence([{ label: '情节逻辑与前后一致', modelFree: true }])).toBe('只读基线分析的线索，不发送任何内容。');
    expect(reviewSendConsequence([{ label: '错别字与规范用语', modelFree: false }])).toBe('所读范围内的稿件正文和所选类别的规范条款，发往为审阅配置的模型服务。');
    expect(reviewSendConsequence([{ label: '错别字与规范用语', modelFree: false }, { label: '情节逻辑与前后一致', modelFree: true }]))
      .toBe('所读范围内的稿件正文和所选类别的规范条款，发往为审阅配置的模型服务；「情节逻辑与前后一致」只读基线分析的线索，不发送。');
    expect(reviewChapterOptionLabel(third)).toBe('第三章（内容块 26–43）');
    expect(reviewPreparationLine({ completed: 1, total: 3, label: '正在冻结「错别字与规范用语」的计划' })).toBe('正在冻结「错别字与规范用语」的计划 · 1 / 3');
    expect(reviewPreparationLine({ completed: 0, total: 0, label: '排队中' })).toBe('排队中');
  });

  it('reads a plan for its one approval, the leads included', () => {
    expect(reviewPlanIntro(3)).toBe('这次审阅有 3 个类别，授权一次后按顺序逐类审阅；每一类完成后，它的发现立即可以处理。');
    expect(reviewPlanHeading({ label: '错别字与规范用语', modeLabel: '全书审阅', taskIntentId: 'task' })).toBe('错别字与规范用语 · 全书审阅');
    expect(reviewPlanHeading({ label: '情节逻辑与前后一致', modeLabel: null, taskIntentId: null })).toBe('情节逻辑与前后一致 · 直接读取基线分析的线索');
    expect(reviewPlanUnits({ units: 8, recomputed: 3, reused: 4, unreviewed: 1 })).toBe('8 个阅读范围：重新审阅 3 个 · 沿用上次 4 个 · 不在本次范围 1 个');
    expect(REVIEW_LEADS_PLAN).toBe('基线分析的前后不一致线索与未决事项；不调用模型，不发送任何内容。');
    expect(REVIEW_AUTHORIZE_NOTE).toBe('只是让 AI7 按这份计划审这一次；接受修改建议、处理每一条发现都仍由你另行决定。');
  });

  it('states a running category by its measured facts and a settled one by what it found', () => {
    const startedAt = '2026-09-21T10:00:00.000Z';
    const running = category({
      state: 'running', stateLabel: '正在审阅',
      progress: {
        unitsTotal: 8, unitsSettled: 3, currentUnitOrdinal: 4, currentUnitStartedAt: startedAt, attemptState: 'awaiting-response',
        completedAttempts: 3, longestSettledUnitMs: 60_000, stage: 'units', lastTransitionAt: startedAt,
      },
    });
    const now = Date.parse(startedAt) + 65_000;
    expect(reviewCategoryProgressLine(running, now)).toBe('正在逐个阅读范围审阅 · 已读完 3 / 8 个阅读范围 · 正在读第 4 个 · 本步已用时 01:05 · 等待模型响应 · 已完成模型回合 3 次');
    expect(reviewCategoryProgressLine(running, Date.parse(startedAt) + 125_000).startsWith('本步骤用时已超过通常水平。正在逐个阅读范围审阅')).toBe(true);
    expect(reviewCategoryProgressLine(category({ state: 'settled', stateLabel: '已完成 · 发现可处理', findingsCount: 12, excludedCount: 2 }), now))
      .toBe('12 条发现，已标在稿件上；另有 2 条无法在稿件上定位，没有列为发现');
    expect(reviewCategoryProgressLine(category({ state: 'settled', stateLabel: '已完成 · 发现可处理', findingsCount: 4 }), now)).toBe('4 条发现，已标在稿件上');
    expect(reviewCategoryProgressLine(category({ state: 'waiting' }), now)).toBe('排在前面的类别完成后开始');
    expect(reviewCategoryProgressLine(category({ state: 'refused', stateLabel: '未能开始', detail: '先完成基线分析，才有前后不一致的线索。' }), now))
      .toBe('先完成基线分析，才有前后不一致的线索。');
    expect(reviewCategoryProgressLine(category({ state: 'failed', stateLabel: '运行失败' }), now)).toBe('运行失败');
    expect(REVIEW_STAGE_LABELS).toEqual({
      units: '正在逐个阅读范围审阅',
      'cross-unit-reduction': '正在跨范围比对',
      'assurance-sampling': '正在抽样复核',
      'run-report-reflection': '发现已保存，正在写运行报告',
    });
    expect(reviewLiveLine('第 2 次', running)).toBe('第 2 次审阅 · 错别字与规范用语 · 已读完 3 / 8 个阅读范围');
    expect(reviewLiveLine('第 2 次', category({ state: 'settled', stateLabel: '已完成 · 发现可处理' }))).toBe('第 2 次审阅 · 错别字与规范用语 · 已完成 · 发现可处理');
  });

  it('reads a finding: where it is, what it proposes, what it rests on, and never a verdict', () => {
    expect(reviewFindingLocation({ chapterTitle: '第一章', blockPosition: 12 })).toBe('「第一章」 · 内容块 12');
    expect(reviewFindingLocation({ chapterTitle: null, blockPosition: 12 })).toBe('内容块 12');
    expect(reviewFindingLocation({ chapterTitle: null, blockPosition: null })).toBe('所在的内容块已不在当前稿件中');
    expect(reviewReplacementLine('他们')).toBe('改为「他们」');
    expect(reviewReplacementLine('')).toBe('建议删去这段文字');
    expect(reviewClauseLine({ documentTitle: '通用规范汉字用字', clauseId: 'C1', text: '用规范字。' })).toBe('依据：条款 C1 · 通用规范汉字用字：用规范字。');
    expect(REVIEW_RISK_POINT).toBe('需人工复核的风险点');
    expect(REVIEW_ANCHOR_CHANGED).toBe('原文已变，未能在稿件上标出');
    expect(REVIEW_CAPABILITY_REASON).toBe('请先打开稿件再处理这条发现。');
    expect(REVIEW_FILTER_LABELS).toEqual({ category: '类别', severity: '严重度', status: '状态', chapter: '章' });
    expect(REVIEW_FILTER_ALL).toBe('全部');
  });

  it('holds 忽略并说明 to a reason the service will take', () => {
    expect(REVIEW_IGNORE_LABEL).toBe('忽略的原因（必填，最多 500 字）');
    expect(reviewIgnoreReasonProblem('')).toBe(REVIEW_IGNORE_REQUIRED);
    expect(reviewIgnoreReasonProblem('   ')).toBe('忽略一条发现需要说明原因。');
    expect(reviewIgnoreReasonProblem(`  ${'字'.repeat(500)}  `)).toBeNull();
    expect(reviewIgnoreReasonProblem('字'.repeat(501))).toBe('原因不能超过 500 个字。');
    // Characters, not UTF-16 code units: 500 characters outside the Basic Multilingual Plane still fit.
    expect(reviewIgnoreReasonProblem('𠀀'.repeat(500))).toBeNull();
    expect(reviewIgnoreReasonCount(' 作者坚持 ')).toBe('4 / 500 字');
  });

  it('states the batch write scope before 确认应用', () => {
    expect(reviewBatchScopeLine(3)).toBe('将把 3 条修改建议写入稿件：');
    expect(reviewBatchItemLine('的的', '的')).toBe('「的的」→「的」');
    expect(reviewBatchItemLine('多余', '')).toBe('「多余」→（删去）');
    expect(reviewBatchExcludedLine(2)).toBe('另有 2 条原文已变或已不在稿件上，不在其中；它们要在稿件上逐条处理。');
    expect(reviewBatchCappedLine(500)).toBe('一次最多应用 500 条；其余的在这次应用之后再准备。');
    expect(REVIEW_BATCH_ALL_OR_NONE).toBe('确认后一次写入稿件：全部写入，或一条也不写。');
  });

  it('versions the 审阅报告 and says why export waits', () => {
    expect(REVIEW_EXPORT_REASON).toBe('导出随交付物功能提供。');
    expect(reviewReportVersionLine(2, '2026/09/21 18:00:00')).toBe('第 2 版 · 生成于 2026/09/21 18:00:00');
    expect(reviewReportMustItemLine({ categoryLabel: '错别字与规范用语', locationLabel: '内容块 3', quote: '的的', note: '重复。', statusLabel: '待处理' }))
      .toBe('错别字与规范用语 · 内容块 3 · 「的的」 · 重复。 · 待处理');
    expect(REVIEW_REPORT_OVERVIEW_COLUMNS).toEqual(['类别', '状态', '发现']);
    expect(reviewReportExcludedLine(0)).toBe('列出的发现都已在稿件上定位');
    expect(reviewReportExcludedLine(2)).toBe('另有 2 条无法在稿件上定位，没有列为发现');
    expect(reviewReportConfigurationLine('1')).toBe('审阅配置第 1 版');
    expect(reviewReportAppendixLine({
      label: '错别字与规范用语',
      guidelineDocuments: [{ issuer: 'AI7 内置默认', title: '错别字与规范用语审读要点', version: '1' }],
      procedure: { title: '逐段审读', version: '1' },
    })).toBe('错别字与规范用语：AI7 内置默认 · 错别字与规范用语审读要点（第 1 版）；工序：逐段审读（第 1 版）');
    expect(reviewReportAppendixLine({ label: '情节逻辑与前后一致', guidelineDocuments: [], procedure: { title: '线索转批注', version: '2' } }))
      .toBe('情节逻辑与前后一致：没有规范文件；工序：线索转批注（第 2 版）');
    expect(reviewReportGeneratedLine(3)).toBe('已生成审阅报告第 3 版。');
  });

  it('names the opened Run and says what each action came to', () => {
    expect(reviewRunHeading('第 3 次')).toBe('第 3 次审阅');
    expect(reviewRunMetaLine('全书', 'r2')).toBe('全书 · 读的是修订版 r2');
    expect(reviewCreatedLine('2026/09/21 18:00:00')).toBe('创建于 2026/09/21 18:00:00');
    expect(reviewAuthorizedLine('2026/09/21 18:01:00')).toBe('授权于 2026/09/21 18:01:00');
    expect(reviewBatchReadyLine(3)).toBe('将把 3 条修改建议写入稿件；请核对后确认应用。');
    expect(reviewBatchAppliedLine(3, false)).toBe('已把 3 条修改建议写入稿件。');
    expect(reviewBatchAppliedLine(3, true)).toBe('已把 3 条修改建议写入稿件。写入结果已从记录确认。');
    expect(REVIEW_STATUS_LINES.applied).toBe('已应用这条修改建议。');
    expect(REVIEW_STATUS_LINES.appliedRecovered).toBe('已应用这条修改建议。写入结果已从记录确认。');
    expect(REVIEW_STATUS_LINES.applyUnknown).toBe('无法确认这次应用的结果；请刷新审阅后查看。');
    expect(REVIEW_STATUS_LINES.ignored).toBe('已忽略这条发现，原因已记录。');
    expect(REVIEW_STATUS_LINES.prepared).toBe('审阅计划已冻结；请查看计划后授权。');
    expect(REVIEW_STATUS_LINES.preparationCancelled).toBe('审阅计划准备已取消；稿件与审阅记录保持不变。');
  });

  it('reads 审阅 in one line on 工作概览', () => {
    const summary = { reviewRunId: 'run', ordinal: 2, label: '第 2 次', createdAt: '', scopeLabel: '全书', categoryLabels: ['错别字与规范用语'], state: 'settled' as const, stateLabel: '已完成', findingCounts: counts, reportVersion: null };
    const row = (state: 'current' | 'needs-review') => ({ categoryId: 'x', label: 'x', state, stateLabel: '', lastRunOrdinal: 2, lastReviewedRevisionLabel: 'r1', changedBlocks: 0, unavailableReason: null });
    expect(reviewOverviewLine({ runs: [], coverage: [] })).toBe('审阅 · 还没有审阅记录');
    expect(reviewOverviewLine({ runs: [summary], coverage: [row('current')] })).toBe('审阅 · 最近一次是第 2 次（已完成），待处理 6 条');
    expect(reviewOverviewLine({ runs: [summary], coverage: [row('needs-review'), row('needs-review')] })).toBe('审阅 · 最近一次是第 2 次（已完成），待处理 6 条；2 类需复审');
  });
});
