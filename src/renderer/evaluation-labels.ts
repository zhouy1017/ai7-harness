import type {
  EvaluationAdjustmentReasonId,
  EvaluationComparisonProjection,
  EvaluationConclusion,
  EvaluationInitialDraftProjection,
  EvaluationInitialProjection,
  InitialEvaluationSufficiency,
  InitialEvaluationTaskMode,
  EvaluationProfileProjection,
  EvaluationReadersReportProjection,
  EvaluationRecordProjection,
  EvaluationRecordSummaryProjection,
  EvaluationTotalProjection,
  EvaluationWorkspaceProjection,
  EvaluationMarketProjection,
  EvaluationPredictionRangeProjection,
  EvaluationPricingProjection,
  EvaluationRewriteWorkspaceProjection,
  InitialEvaluationPredictionProjection,
} from '../shared/protocol.js';
import { formatPriceFen } from '../shared/evaluation-calibration.js';
import { EVALUATION_ADJUSTMENT_REASON_WORDS, evaluationBand, provisionalEvaluationScore, type EvaluationRiskLevel } from '../shared/evaluation-scoring.js';

/**
 * ②C 评估's words (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012): the
 * page, each item by its 满分 and 得分 and never a weight, the risk items and the conclusion the editor chooses, the versions
 * and how one compares with the one before, and 知识库 › 评估方案's lines. Pure, so the unit suite pins every one.
 */

export const EVALUATION_TITLE = '评估';
export const EVALUATION_LEDE = '按本社评估方案打分：总分 100，每一项只看满分与得分，可以给半分；风险项不计入总分，只影响结论。';
/** Said of a version the editor began alone: AI7's 初评 took no part in it. */
export const EVALUATION_AI7_PENDING = '这一版不是从 AI7 初评开始的：由你打分。';
export const EVALUATION_START = { first: '开始评估', again: '重新评估' } as const;
export const EVALUATION_SAVE = '保存评估';
export const EVALUATION_FINALIZE = '定稿';
/** 定稿 waits while every item is 不评 (Issue #638): the service's own words for its refusal. */
export { EVALUATION_FINALIZE_NEEDS_SCORE } from '../shared/evaluation-scoring.js';
export const EVALUATION_STATE_LABELS: Readonly<Record<EvaluationRecordSummaryProjection['state'], string>> = { draft: 'AI7 初稿', editing: '编辑评分中', finalized: '定稿' };
export const EVALUATION_NOT_RATED = '不评';
export const EVALUATION_NOT_RATED_REASON = '不评的理由';
export const EVALUATION_SCORE = '得分';
export const EVALUATION_COMMENT = '评语';
export const EVALUATION_RISK_LEVELS: Readonly<Record<EvaluationRiskLevel, string>> = { low: '低', medium: '中', high: '高' };
export const EVALUATION_RISK_STATEMENT = '风险说明';
export const EVALUATION_RISK_REVIEWED = '已由人工复核';
export const EVALUATION_RISKS_HEADING = '风险项（不计入总分）';
export const EVALUATION_READINESS = '就绪清单：距离可出版还差什么（每行一条）';
export const EVALUATION_STRENGTHS = '主要优点（每行一条）';
export const EVALUATION_WEAKNESSES = '主要问题（每行一条）';
export const EVALUATION_VERDICT = '总评';
export const EVALUATION_CONCLUSION_LEGEND = '结论（由你选定）';
export const EVALUATION_RECOMMEND_BLOCKED = '有「高」风险还没有经人工复核，「推荐出版」暂不能选。';
export const EVALUATION_VERSIONS_HEADING = '版本';
export const EVALUATION_EMPTY = '这本书还没有评估。开始评估后，按本社评估方案逐项打分，定稿后留作记录。';
export const EVALUATION_STATUS = {
  /** Leaving the manuscript for 评估 from its 工作 group (Issue #429 review): its edits are saved first. */
  leaving: '正在保存稿件并打开评估…',
  openFailed: '无法打开评估。',
  loading: '正在读取评估…',
  opened: '评估已打开',
  unavailable: '无法读取评估。',
  starting: '正在开始评估…',
  saving: '正在保存评估…',
  saved: '评估已保存。',
  finalizing: '正在定稿…',
  failed: '无法保存评估。',
} as const;

/** A typed score the scale does not admit (Issue #638): it shows no band and leaves the total, and the page says so. */
export function evaluationScoreInvalidLine(fullMarks: number): string {
  return `得分要在 0 到 ${fullMarks} 之间，按整分或半分填写；这个得分不计入总分，也不能保存。`;
}

/**
 * What the score field holds, as typed (Issue #638 review): a number the scale admits counts; another number says why it does
 * not; and text the number field cannot read at all — it reports an empty value then — says that the item counts as unscored,
 * which is how it would be saved.
 */
export function evaluationScoreFeedback(raw: string, unreadable: boolean, fullMarks: number): { readonly score: number | null; readonly line: string | null } {
  if (unreadable) return { score: null, line: `这里填的不是数字，这一项按没有打分计；得分要在 0 到 ${fullMarks} 之间，按整分或半分填写。` };
  const typed = provisionalEvaluationScore(raw, fullMarks);
  return { score: typed.score, line: typed.invalid ? evaluationScoreInvalidLine(fullMarks) : null };
}

/**
 * Another version asked for while the open one has unsaved edits (Issue #638): what opening it would lose, with the way to
 * stay first and the discard named.
 */
export const EVALUATION_STAY = '留在这一版';
export function evaluationUnsavedLine(open: number, next: number): string {
  return `第 ${open} 版有未保存的修改；打开第 ${next} 版会放弃这些修改。`;
}
export function evaluationDiscardAndOpen(next: number): string {
  return `放弃修改并打开第 ${next} 版`;
}

export function evaluationStarted(ordinal: number): string {
  return `已开始第 ${ordinal} 版评估。`;
}

export function evaluationFinalized(ordinal: number): string {
  return `第 ${ordinal} 版评估已定稿。`;
}

/** A score as the editor reads it: whole points plainly, a half point as .5. */
export function evaluationScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function evaluationBandLabel(profile: Pick<EvaluationProfileProjection, 'bands'>, score: number, fullMarks: number): string {
  const band = evaluationBand(score, fullMarks);
  return profile.bands.find((entry) => entry.band === band)?.label ?? '';
}

/** The total out of the 满分 still rated, its band, and what is left `不评` or unscored. */
export function evaluationTotalLine(profile: Pick<EvaluationProfileProjection, 'bands'>, total: EvaluationTotalProjection): string {
  const band = total.unscored === 0 && total.fullMarks > 0 ? ` · ${evaluationBandLabel(profile, total.score, total.fullMarks)}` : '';
  const notRated = total.notRated === 0 ? '' : `（${total.notRated} 项不评）`;
  const unscored = total.unscored === 0 ? '' : ` · 还有 ${total.unscored} 项没有打分`;
  return `总分 ${evaluationScore(total.score)} / ${total.fullMarks}${band}${notRated}${unscored}`;
}

export function evaluationItemLegend(item: { label: string; fullMarks: number }): string {
  return `${item.label} · 满分 ${item.fullMarks}`;
}

export function evaluationHeading(record: Pick<EvaluationRecordSummaryProjection, 'ordinal' | 'state'>): string {
  return `第 ${record.ordinal} 版 · ${EVALUATION_STATE_LABELS[record.state]}`;
}

/** The revision a version evaluated, and whether edits waited in the journal beyond it then. */
export function evaluationRevisionLine(record: Pick<EvaluationRecordProjection, 'revisionLabel' | 'uncheckpointed'>): string {
  return `评估的是修订版 ${record.revisionLabel}${record.uncheckpointed ? '（当时另有写入修订日志、尚未保存为修订版的改动）' : ''}`;
}

/** The Book's versions that cannot be read, named beside the list (Issue #702 review); `null` when every version reads. */
export function evaluationUnreadableLine(ordinals: ReadonlyArray<number>): string | null {
  return ordinals.length === 0 ? null : `第 ${ordinals.join('、')} 版评估记录已损坏，无法显示；其他版本照常可用。`;
}

export function evaluationFinalizedLine(record: Pick<EvaluationRecordProjection, 'finalized'>, instant: (iso: string) => string): string | null {
  return record.finalized === null ? null : `定稿 · ${record.finalized.actor} · ${instant(record.finalized.at)}`;
}

export function evaluationConclusionLabel(profile: Pick<EvaluationProfileProjection, 'conclusions'>, conclusion: EvaluationConclusion | null): string {
  return conclusion === null ? '结论未定' : profile.conclusions.find((entry) => entry.conclusion === conclusion)?.label ?? conclusion;
}

/** One version in the list: its number and state, the revision, the total and — once chosen — the conclusion. */
export function evaluationVersionLine(profile: Pick<EvaluationProfileProjection, 'bands' | 'conclusions'>, summary: EvaluationRecordSummaryProjection): string {
  const conclusion = summary.conclusion === null ? '' : ` · ${evaluationConclusionLabel(profile, summary.conclusion)}`;
  return `${evaluationHeading(summary)} · 修订版 ${summary.revisionLabel} · ${evaluationTotalLine(profile, summary.total)}${conclusion}`;
}

/** The Book's 评估 on 工作概览, in one line. */
export function evaluationOverviewLine(workspace: Pick<EvaluationWorkspaceProjection, 'records' | 'profile'>): string {
  const latest = workspace.records[0];
  if (latest === undefined) return '还没有评估。';
  return evaluationVersionLine(workspace.profile, latest);
}

function compared(value: number | 'not-rated' | null): string {
  return value === null ? '未打分' : value === 'not-rated' ? EVALUATION_NOT_RATED : evaluationScore(value);
}

/** 与第 N 版相比 (EVAL-012): each item that moved, each risk that moved, the total and the conclusion. */
export function evaluationComparisonLines(profile: EvaluationProfileProjection, comparison: EvaluationComparisonProjection): { heading: string; lines: string[] } {
  const lines: string[] = [];
  for (const item of comparison.items) {
    if (item.previous === item.current) continue;
    const label = profile.items.find((entry) => entry.itemId === item.itemId)?.label ?? item.itemId;
    lines.push(`${label}：${compared(item.previous)} → ${compared(item.current)}`);
  }
  for (const risk of comparison.risks) {
    if (risk.previous === risk.current) continue;
    const label = profile.risks.find((entry) => entry.riskId === risk.riskId)?.label ?? risk.riskId;
    lines.push(`${label}：${risk.previous === null ? '未定' : EVALUATION_RISK_LEVELS[risk.previous]} → ${risk.current === null ? '未定' : EVALUATION_RISK_LEVELS[risk.current]}`);
  }
  const before = comparison.total.previous;
  const now = comparison.total.current;
  lines.push(`总分：${evaluationScore(before.score)} / ${before.fullMarks} → ${evaluationScore(now.score)} / ${now.fullMarks}`);
  if (comparison.conclusion.previous !== comparison.conclusion.current) {
    lines.push(`结论：${evaluationConclusionLabel(profile, comparison.conclusion.previous)} → ${evaluationConclusionLabel(profile, comparison.conclusion.current)}`);
  }
  return { heading: `与第 ${comparison.previousOrdinal} 版相比`, lines };
}

// ---- 知识库 › 评估方案 (Issue #429, S81a; KB-001, EVAL-003, EVAL-005) --------------------------------------------------

export function evaluationProfilePill(profile: Pick<EvaluationProfileProjection, 'version' | 'issuer'>): string {
  return `第 ${profile.version} 版 · ${profile.issuer}`;
}

/** A band as the profile states it: its floor on the 100-point total, applied to an item by its 满分, and its anchor. */
export function evaluationBandLine(band: EvaluationProfileProjection['bands'][number]): string {
  return band.floor === 0 ? `${band.label} · 其余：${band.anchor}` : `${band.label} · ${band.floor} 分及以上（单项按满分折算）：${band.anchor}`;
}

export function evaluationProfileUse(profile: { records: number; books: number }): string {
  return profile.records === 0 ? '还没有评估用过' : `已用于 ${profile.books} 本书的 ${profile.records} 版评估`;
}

// ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007) --------------------------------------

export const EVALUATION_AI7_HEADING = 'AI7 初评';
export const EVALUATION_AI7_LEDE = 'AI7 按本社评估方案通读全书，给每一项一个初评分数和评语，供你打分时参考；记录保存的是你的评分，结论由你选定。';
export const EVALUATION_AI7_NONE = 'AI7 还没有为这本书做初评。';
export const EVALUATION_AI7_PREPARE: Readonly<Record<InitialEvaluationTaskMode, string>> = { 'evaluation-first': '准备 AI7 初评', 'evaluation-again': '重新初评' };
export const EVALUATION_AI7_OPEN_PLAN = '查看计划并开始';
export const EVALUATION_AI7_OPEN_TASK = '查看任务';
export const EVALUATION_START_FROM_INITIAL = '从 AI7 初评开始';
export const EVALUATION_AI7_SUFFICIENCY: Readonly<Record<InitialEvaluationSufficiency, string>> = { sufficient: '充分', fair: '一般', insufficient: '不足' };
export const EVALUATION_AI7_SUGGESTED = 'AI7 建议';
export const EVALUATION_ADJUSTMENT_LEGEND = '调分原因（可多选，不预先勾选）';
export const EVALUATION_ADJUSTMENT_REASON_LABELS: Readonly<Record<EvaluationAdjustmentReasonId, string>> = EVALUATION_ADJUSTMENT_REASON_WORDS;
export const EVALUATION_ADJUSTMENT_NOTE = '自行输入的原因';
export const EVALUATION_AI7_STATUS = {
  preparing: '正在准备 AI7 初评的任务计划…',
  prepared: 'AI7 初评的任务计划已准备：在任务计划里看过再开始。',
  cancelled: 'AI7 初评的任务计划准备已取消。',
  failed: '无法准备 AI7 初评。',
  startingFromInitial: '正在从 AI7 初评开始…',
} as const;

/** The Book's 初评 Task in one line: its state as the drawer names it. */
export function evaluationAi7TaskLine(task: NonNullable<EvaluationInitialProjection['task']>): string {
  return `${EVALUATION_AI7_HEADING} · ${task.label}`;
}

/** The latest 初评 that settled: which one, what it read, its total and band, and whether the manuscript moved since. */
export function evaluationAi7LatestLine(profile: Pick<EvaluationProfileProjection, 'bands'>, latest: NonNullable<EvaluationInitialProjection['latest']>): string {
  const total = latest.complete ? evaluationTotalLine(profile, latest.total) : '全书综合没有给出分数';
  const moved = latest.current ? '' : '（稿件此后改过：重新初评后才能从初评开始）';
  return `第 ${latest.ordinal} 次初评 · 读的是修订版 ${latest.revisionLabel} · ${total}${moved}`;
}

/** 依据充分度 of one item (EVAL-005), with what it rests on. */
export function evaluationAi7SufficiencyLine(item: Pick<EvaluationInitialDraftProjection['items'][number], 'sufficiency' | 'citedBlocks' | 'unitsCited'>): string {
  const label = `依据充分度 ${EVALUATION_AI7_SUFFICIENCY[item.sufficiency]}`;
  return item.citedBlocks === 0 ? `${label}（没有引用内容块）` : `${label}（引用 ${item.citedBlocks} 个段落，分布在 ${item.unitsCited} 个阅读范围）`;
}

/** AI7's score of one item beside the editor's (EVAL-006). */
export function evaluationAi7ItemLine(item: Pick<EvaluationInitialDraftProjection['items'][number], 'score' | 'sufficiency' | 'citedBlocks' | 'unitsCited'>, fullMarks: number): string {
  const score = item.score === null ? '没有给出分数' : `${evaluationScore(item.score)} / ${fullMarks}`;
  return `AI7 初评 ${score} · ${evaluationAi7SufficiencyLine(item)}`;
}

/**
 * AI7's evidence for one item (EVAL-006): how many notes, and each as the range it came from and AI7's words. A long Book's
 * notes are cut to a few spread over the ranges (Issue #689), and the summary then says how many there are in all.
 */
export function evaluationAi7EvidenceSummary(shown: number, count: number = shown): string {
  return shown >= count ? `AI7 的依据（${count} 条）` : `AI7 的依据（共 ${count} 条，这里列出分布在各阅读范围的 ${shown} 条）`;
}

export function evaluationAi7EvidenceLine(entry: Pick<EvaluationInitialDraftProjection['items'][number]['evidence'][number], 'unitOrdinal' | 'note'>): string {
  return `阅读范围 ${entry.unitOrdinal}：${entry.note}`;
}

/**
 * The ranges a 初评 did not read, when it completed with gaps; `null` when it read them all. A version begun from it says so,
 * since nothing in those ranges reached AI7's scores or comments.
 */
export function evaluationAi7UnreadLine(draft: Pick<EvaluationInitialDraftProjection, 'unitsTotal' | 'unreadUnits'>): string | null {
  if (draft.unreadUnits.length === 0) return null;
  return `AI7 这次没有读到 ${draft.unreadUnits.length} / ${draft.unitsTotal} 个阅读范围（第 ${draft.unreadUnits.join('、')} 个）：这些范围里的内容没有进入它的分数和评语。`;
}

/** What a version begun from AI7's 初评 says it began from. */
export function evaluationAi7RecordLine(initial: Pick<EvaluationInitialDraftProjection, 'ordinal' | 'revisionLabel'>): string {
  return `这一版从 AI7 第 ${initial.ordinal} 次初评开始（读的是修订版 ${initial.revisionLabel}）：AI7 的分数列在每一项旁边，记录保存的是你的评分。`;
}

/** The conclusion AI7 would suggest, said as AI7's (EVAL-007). */
export function evaluationAi7ConclusionLine(profile: Pick<EvaluationProfileProjection, 'conclusions'>, conclusion: EvaluationConclusion | null): string {
  return conclusion === null ? 'AI7 没有给出建议结论。' : `AI7 建议的结论：${evaluationConclusionLabel(profile, conclusion)}（由你选定）`;
}

// ---- 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013) ------------------------------------------------------------

export const READERS_REPORT_HEADING = '审稿意见';
export const READERS_REPORT_LEDE =
  '从定稿的评估起草审稿意见：总体评价、主要优点、主要问题、修改建议与结论。草稿在稿件编辑面上由你修改，保存为版本后可导出为 DOCX；它是草稿，不会交付或发送，也不改变评估记录。';
export const READERS_REPORT_ACTIONS = {
  prepare: '起草',
  openPlan: '查看计划并开始',
  openTask: '查看任务',
  createDraft: '打开草稿',
  openDraft: '打开草稿',
  exportDraft: '导出…',
} as const;
export const READERS_REPORT_STATUS = {
  preparing: '正在准备审稿意见的任务计划…',
  prepared: '审稿意见的任务计划已准备：在任务计划里看过再开始。',
  cancelled: '审稿意见的任务计划准备已取消。',
  failed: '无法准备审稿意见。',
  creating: '正在打开审稿意见草稿…',
  openFailed: '无法打开审稿意见草稿。',
} as const;

/** The 定稿 version a new 审稿意见 drafts from, or `null` while there is none (the template rows then say why). */
export function readersReportBasisLine(basis: EvaluationReadersReportProjection['basis']): string | null {
  return basis === null ? null : `依据第 ${basis.ordinal} 版定稿（评估的是修订版 ${basis.revisionLabel}）`;
}

/** The Book's latest 审稿意见 Task in one line: its template, and its state as the drawer names it. */
export function readersReportTaskLine(task: NonNullable<EvaluationReadersReportProjection['task']>, templateLabel: string): string {
  return `${READERS_REPORT_HEADING}「${templateLabel}」 · ${task.label}`;
}

/** A drafted result not yet opened: what it was drafted from. */
export function readersReportDraftedLine(drafted: NonNullable<EvaluationReadersReportProjection['templates'][number]['drafted']>): string {
  return `AI7 已写出草稿 · 依据第 ${drafted.recordOrdinal} 版定稿 · 打开后在稿件编辑面上修改`;
}

/** A template's draft document: its latest version, what it was drafted from, and whether the text moved past the version. */
export function readersReportDraftLine(draft: NonNullable<EvaluationReadersReportProjection['templates'][number]['draft']>): string {
  const latest = draft.document.versions[0]?.label ?? '版本 1';
  return `草稿 · ${latest} · 依据第 ${draft.recordOrdinal} 版定稿${draft.document.changedSinceVersion ? ' · 有修改尚未保存为版本' : ''}`;
}

// ---- 市场 (Issue #429, plan slice S81b2; V2-UX-EVAL-009, EVAL-010) ------------------------------------------------------

export const EVALUATION_MARKET_HEADING = '市场定位与策略';
export const EVALUATION_MARKET_LEDE = '「读者与市场潜力」一项的展开：目标读者、卖点与渠道是 AI7 从所读书稿的题材与写法推断的，不是书稿里写明的；可比图书与定价首印来自本社数据。';
/** The market section's basis while web search is not connected (ADR 0080 §7: 未联网核查). */
export const EVALUATION_MARKET_OFFLINE = '未联网核查：市场部分只依据本书稿件与本社数据，没有检索外网，也没有对比他社图书或获奖作品。';
export const EVALUATION_MARKET_LISTS = { readers: '目标读者', sellingPoints: '差异化卖点', channels: '渠道与策略' } as const;
/** Said beside AI7's market words: whose they are, and what they rest on. */
export const EVALUATION_MARKET_AI7 = 'AI7 · 据书稿题材推断';
export const EVALUATION_MARKET_NONE_ALONE = '这一版不是从 AI7 初评开始的：没有 AI7 写的目标读者、卖点与渠道。';
export const EVALUATION_MARKET_NONE_INITIAL = '这一版开始时的 AI7 初评没有写出市场部分。';
export const EVALUATION_COMPARABLES_HEADING = '可比图书';
export const EVALUATION_COMPARABLE_SOURCE_SERIES = '书系';
export const EVALUATION_COMPARABLES_NO_SERIES = '这本书不在任何书系中，没有可以列出的同书系图书。';
export const EVALUATION_COMPARABLES_EMPTY_SERIES = '这本书所在的书系里还没有别的图书。';
export const EVALUATION_COMPARABLES_NO_WEB = '外网检索尚未接通：不列他社同类书。';
export const EVALUATION_PREDICTION_HEADING = '预测 · 低确定性';
export const EVALUATION_PREDICTION_NOT_PROMISE = '不是承诺';
export const EVALUATION_PREDICTION_LABELS = { marketReturn: '市场回报', awards: '评奖可能性', pricing: '定价与首印' } as const;
/** EVAL-009: a prediction AI7 could not ground in what it read. */
export const EVALUATION_PREDICTION_NONE = '暂无法预测';
/** House data that could not be read this time (S81b2 review): said as such, and 评估 stays readable. */
export const EVALUATION_PRICING_UNREADABLE = '暂时读不到本社数据：定价与首印的记录这次没有读出来，不预测。';
export const EVALUATION_COMPARABLES_UNREADABLE = '暂时读不到本社数据：书系的记录这次没有读出来，不列可比图书。';
/** What 定价与首印's range rests on, whenever it shows (EVAL-010; the Owner's answer of 2026-10-07). */
export const EVALUATION_PRICING_BASIS = '依据：本社已发稿图书录入的实际定价与首印，取中间一半图书的范围和中位数；不含这本书，没有用模型，也没有检索外网。';

/** One comparable Book (EVAL-009): its title, its 书系, and whether it is published; the source tag is drawn beside it. */
export function evaluationComparableLine(comparable: EvaluationMarketProjection['comparables'][number]): string {
  return `《${comparable.title}》 · 同书系「${comparable.seriesTitle}」 · ${comparable.published ? '已发稿' : '尚未发稿'}`;
}

/** How many comparables are not listed, when there are more than the section lists; `null` otherwise. */
export function evaluationComparablesMoreLine(market: Pick<EvaluationMarketProjection, 'comparables' | 'comparableCount'>): string | null {
  const more = market.comparableCount - market.comparables.length;
  return more > 0 ? `另有 ${more} 本同书系图书没有列出。` : null;
}

/** One of AI7's two predictions (EVAL-009): its statement with its basis, or 暂无法预测. */
export function evaluationPredictionLine(prediction: InitialEvaluationPredictionProjection | null): string {
  return prediction === null ? EVALUATION_PREDICTION_NONE : `${prediction.statement}（依据：${prediction.basis}）`;
}

function figure(value: number): string {
  return value.toLocaleString('zh-CN');
}

/** One 定价与首印 range: the middle half and the median, and how many Books it rests on. */
export function evaluationPricingRangeLine(scope: string, range: EvaluationPredictionRangeProjection): string {
  const price = `定价 ${formatPriceFen(range.priceFen.low)} – ${formatPriceFen(range.priceFen.high)}（中位数 ${formatPriceFen(range.priceFen.median)}）`;
  const print = `首印 ${figure(range.firstPrint.low)} – ${figure(range.firstPrint.high)} 册（中位数 ${figure(range.firstPrint.median)} 册）`;
  return `${scope} ${range.books} 本：${price} · ${print}`;
}

/**
 * 定价与首印 in the prediction block (EVAL-010, EVAL-014): the ranges once 设置's switch is on and enough other Books carry
 * actuals — the Book's own 书系 first where enough of its Books do — or what the prediction waits for.
 */
export function evaluationPricingLines(pricing: EvaluationPricingProjection): string[] {
  if (pricing.unreadable) return [EVALUATION_PRICING_UNREADABLE];
  if (!pricing.available) {
    return [`不预测。本社已录入定价与首印的已发稿图书 ${pricing.booksWithActuals} / ${pricing.threshold} 本；满 ${pricing.threshold} 本后，可在「设置 › 评估校准与预测」里打开预测。`];
  }
  if (!pricing.enabled) {
    return [`不预测：「设置 › 评估校准与预测」里没有打开定价与首印预测（已录入实际数据的已发稿图书 ${pricing.booksWithActuals} 本）。`];
  }
  if (pricing.house === null) {
    return [`不预测：不计这本书，本社已录入定价与首印的已发稿图书 ${pricing.otherBooksWithActuals} / ${pricing.threshold} 本；范围只依据其他图书，满 ${pricing.threshold} 本后才给出。`];
  }
  const lines: string[] = [];
  if (pricing.series !== null) lines.push(evaluationPricingRangeLine('同书系已发稿图书', pricing.series));
  else if (pricing.seriesBooksWithActuals !== null) {
    lines.push(`同书系已录入实际数据的已发稿图书 ${pricing.seriesBooksWithActuals} 本，不足 ${pricing.seriesMinimum} 本，不给出同书系的范围。`);
  }
  lines.push(evaluationPricingRangeLine('本社已发稿图书', pricing.house));
  return [...lines, EVALUATION_PRICING_BASIS];
}

// ---- 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008) ---------------------------------------------------

export const EVALUATION_REWRITE_HEADING = '按我的评分重写评语';
export const EVALUATION_REWRITE_LEDE = '你改过 AI7 的分数后，AI7 可以按你保存的分数和调分原因重写各项评语与总评；分数一个也不改，重写的评语要你采用后才记入这一版。';
export const EVALUATION_REWRITE_ACTIONS = {
  prepare: '按我的评分重写评语',
  openPlan: '查看计划并开始',
  openTask: '查看任务',
  accept: '采用重写',
  discard: '放弃',
} as const;
export const EVALUATION_REWRITE_STATUS = {
  preparing: '正在准备评语重写的任务计划…',
  prepared: '评语重写的任务计划已准备：在任务计划里看过再开始。',
  cancelled: '评语重写的任务计划准备已取消。',
  failed: '无法按你的评分重写评语。',
  unsaved: '先保存评估，再按你的评分重写评语：重写只读已保存的分数与评语。',
  unsavedAccept: '这一版有未保存的修改：先保存或放弃这些修改，再采用重写的评语。',
  accepting: '正在采用重写的评语…',
  accepted: '已采用重写的评语：各项分数没有改动。',
  discarding: '正在放弃重写的评语…',
  discarded: '已放弃这一次重写，评语保持原样。',
  decideFailed: '无法处理重写的评语。',
} as const;
export const EVALUATION_REWRITE_VERDICT = '总评';
export const EVALUATION_REWRITE_BEFORE = '现在';
export const EVALUATION_REWRITE_AFTER = '重写';
export const EVALUATION_REWRITE_EMPTY = '（还没有写）';
export const EVALUATION_REWRITE_STALE = '这一版在重写之后又保存过：重写依据的是之前的分数，不能采用；可以放弃它，再按现在的评分重写。';

/** The Book's latest rewrite Task in one line: the version it rewrites, and its state as the drawer names it. */
export function evaluationRewriteTaskLine(task: NonNullable<EvaluationRewriteWorkspaceProjection['task']>): string {
  return `${EVALUATION_REWRITE_HEADING} · 第 ${task.recordOrdinal} 版 · ${task.label}`;
}

/** The proposal waiting for the editor: which save it was written from. */
export function evaluationRewriteProposalLine(proposal: NonNullable<EvaluationRewriteWorkspaceProjection['proposal']>): string {
  return `AI7 按你第 ${proposal.entryOrdinal} 次保存的评分重写了评语，等你决定：采用后才记入这一版，分数不变。`;
}

/**
 * How much of the Book the rewrite read (S81b2 review): its notes, and so its words, rest on the ranges read alone — said
 * whenever a proposal shows, and plainly when some were not read.
 */
export function evaluationRewriteReadingLine(reading: NonNullable<EvaluationRewriteWorkspaceProjection['proposal']>['reading']): string {
  return reading.unitsRead < reading.unitsTotal
    ? `AI7 这次重写只读到 ${reading.unitsRead} / ${reading.unitsTotal} 个阅读范围：没读到的范围里的内容没有进入重写的评语。`
    : `AI7 这次重写读了全部 ${reading.unitsTotal} 个阅读范围。`;
}

/** The version's last decision on a rewrite. */
export function evaluationRewriteDecidedLine(decided: NonNullable<EvaluationRewriteWorkspaceProjection['decided']>): string {
  return decided.decision === 'accepted'
    ? `上一次重写的评语已采用（记为第 ${decided.entryOrdinal} 次保存），分数没有改动。`
    : '上一次重写的评语已放弃，评语保持原样。';
}