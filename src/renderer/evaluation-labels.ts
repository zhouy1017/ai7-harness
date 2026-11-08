import { technicalWords } from './technical-layer.js';
import type {
  EvaluationAdjustmentReasonId,
  EvaluationComparisonProjection,
  EvaluationConclusion,
  EvaluationInitialCalibrationProjection,
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
/** Said of a version the editor began alone: AI7's 初评 took no part in it. */
export const EVALUATION_AI7_PENDING = '这一版不是从 AI7 初评开始的：由你打分。';
export const EVALUATION_START = { first: '开始评估', again: '重新评估' } as const;
/**
 * `开始评估`, `重新评估`, or — while the latest version cannot be read (Issue #726) — the start that skips it: from the latest
 * 定稿 that reads, or from nothing when none does.
 */
export function evaluationStartLabel(start: Extract<EvaluationWorkspaceProjection['start'], { allowed: true }>): string {
  if (start.skipDamaged === null) return EVALUATION_START[start.kind];
  return start.skipDamaged.seedOrdinal === null ? '从头重新评估' : `从${technicalWords(`第 ${start.skipDamaged.seedOrdinal} 版`, '版本')}重新评估`;
}
/** What the start that skips a damaged latest version will do (Issue #726), said before it is pressed. */
export function evaluationSkipDamagedLine(skipDamaged: NonNullable<Extract<EvaluationWorkspaceProjection['start'], { allowed: true }>['skipDamaged']>): string {
  const damaged = `第 ${skipDamaged.skipped.join('、')} 版评估记录已损坏`;
  return skipDamaged.seedOrdinal === null
    ? `${damaged}，没有可以读取的定稿：重新评估将从头开始，新版本会记下跳过了这些版本。`
    : `${damaged}：重新评估将从${technicalWords(`第 ${skipDamaged.seedOrdinal} 版`, '版本')}定稿开始，新版本会记下跳过了${skipDamaged.skipped.length === 1 ? '它' : '这些版本'}。`;
}
/** What a version says of the damaged versions it skipped when it began (Issue #726); `null` for one that skipped none. */
export function evaluationSkippedRecordsLine(record: Pick<EvaluationRecordProjection, 'skippedRecords' | 'seededFrom'>): string | null {
  if (record.skippedRecords.length === 0) return null;
  const skipped = `这一版跳过了已损坏的第 ${record.skippedRecords.join('、')} 版`;
  return record.seededFrom === null ? `${skipped}，从头开始评估。` : `${skipped}，从${technicalWords(`第 ${record.seededFrom} 版`, '版本')}定稿重新评估。`;
}
export const EVALUATION_SAVE = '保存修改';
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
export const EVALUATION_RISKS_HEADING = '风险项 · 不计入总分';
export const EVALUATION_READINESS = '就绪清单 · 距离可出版还差什么，每行一条';
export const EVALUATION_STRENGTHS = '主要优点 · 每行一条';
export const EVALUATION_WEAKNESSES = '主要问题 · 每行一条';
export const EVALUATION_VERDICT = '总评';
export const EVALUATION_CONCLUSION_LEGEND = '结论 · 由你选定';
export const EVALUATION_RECOMMEND_BLOCKED = '有「高」风险还没有经人工复核，「推荐出版」暂不能选。';
export const EVALUATION_VERSIONS_HEADING = '版本';
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
  return `${technicalWords(`第 ${open} 版`, '版本')}有未保存的修改；打开${technicalWords(`第 ${next} 版`, '版本')}会放弃这些修改。`;
}
export function evaluationDiscardAndOpen(next: number): string {
  return `放弃修改并打开${technicalWords(`第 ${next} 版`, '版本')}`;
}

export function evaluationStarted(ordinal: number): string {
  return `已开始${technicalWords(`第 ${ordinal} 版`, '版本')}评估。`;
}

export function evaluationFinalized(ordinal: number): string {
  return `${technicalWords(`第 ${ordinal} 版`, '版本')}评估已定稿。`;
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
  return `${technicalWords(`第 ${record.ordinal} 版`, '版本')} · ${EVALUATION_STATE_LABELS[record.state]}`;
}

/** The revision a version evaluated, and whether edits waited in the journal beyond it then. */
export function evaluationRevisionLine(record: Pick<EvaluationRecordProjection, 'revisionLabel' | 'uncheckpointed'>): string {
  return technicalWords(`评估的是修订版 ${record.revisionLabel}${record.uncheckpointed ? '（当时另有写入修订日志、尚未保存为修订版的改动）' : ''}`, record.uncheckpointed ? '评估包含当时尚未保存为版本的改动。' : '评估基于当时的稿件。');
}

/**
 * The Book's versions that cannot be read, named beside the list (Issue #702 review); `null` when every version reads. When no
 * version reads, there are no 其他版本 to promise, and the line says only what is damaged (Issue #708).
 */
export function evaluationUnreadableLine(ordinals: ReadonlyArray<number>, othersRead = true): string | null {
  if (ordinals.length === 0) return null;
  const damaged = `第 ${ordinals.join('、')} 版评估记录已损坏，无法显示`;
  return othersRead ? `${damaged}；其他版本照常可用。` : `${damaged}。`;
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
  return `${evaluationHeading(summary)} · 修订版${technicalWords(` ${summary.revisionLabel}`)} · ${evaluationTotalLine(profile, summary.total)}${conclusion}`;
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
    if (item.previous === item.current && item.change == null) continue;
    const label = item.label ?? profile.items.find((entry) => entry.itemId === item.itemId)?.label ?? item.itemId;
    lines.push(item.change === 'added' ? `${label}：新增评分项` : item.change === 'removed' ? `${label}：已移除（原得分 ${compared(item.previous)}）` : `${label}：${compared(item.previous)} → ${compared(item.current)}`);
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
  return { heading: `与${technicalWords(`第 ${comparison.previousOrdinal} 版`, '版本')}相比`, lines };
}

// ---- 知识库 › 评估方案 (Issue #429, S81a; KB-001, EVAL-003, EVAL-005) --------------------------------------------------

export function evaluationProfilePill(profile: Pick<EvaluationProfileProjection, 'version' | 'issuer'>): string {
  return `${technicalWords(`第 ${profile.version} 版`, '版本')} · ${profile.issuer}`;
}

/**
 * Records merged from another house keep their own profile by value, so they match none of this house's versions; 知识库 ›
 * 评估方案 counts them under this labelled bucket (Issue #798, P3-6). The service holds the same id literal.
 */
export const EVALUATION_PROFILE_UNKNOWN_ID = 'unknown/merged-profile';
export const EVALUATION_PROFILE_UNKNOWN_LABEL = '未知版本';
export const EVALUATION_PROFILE_UNKNOWN_NOTE = '这些评估记录来自其他本社合并，按其当时的方案版本保留，不计入本社任何评估方案版本。';

/** A band as the profile states it: its floor on the 100-point total, applied to an item by its 满分, and its anchor. */
export function evaluationBandLine(band: EvaluationProfileProjection['bands'][number]): string {
  return band.floor === 0 ? `${band.label} · 其余：${band.anchor}` : `${band.label} · ${band.floor} 分及以上（单项按满分折算）：${band.anchor}`;
}

export function evaluationProfileUse(profile: { records: number; books: number }): string {
  return profile.records === 0 ? '还没有评估用过' : `已用于 ${profile.books} 本书的 ${profile.records} 版评估`;
}

// ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007) --------------------------------------

export const EVALUATION_AI7_HEADING = 'AI7 评估报告';
export const EVALUATION_AI7_NONE = '还没有评估报告：生成后，AI7 通读全稿，给出逐项评分与评语、原文依据、优缺点、下一步建议和市场分析。';
export const EVALUATION_AI7_PREPARE: Readonly<Record<InitialEvaluationTaskMode, string>> = { 'evaluation-first': 'AI7 初评', 'evaluation-again': '重新初评' };
export const EVALUATION_AI7_OPEN_TASK = '查看任务';
// ---- 评估报告 as the main way (Issue #1406, #1407) ------------------------------------------------------------------------

export const EVALUATION_GENERATE = '生成评估报告';
export const EVALUATION_REGENERATE = '重新生成评估报告';
export const EVALUATION_REPORT_HEADING = '详细评估报告';
export const EVALUATION_REPORT_EDIT = '修改报告';
export const EVALUATION_REPORT_NEXT_STEP = '下一步建议';
export const EVALUATION_SHOW_LATEST_REPORT = '查看最新评估报告';
export const EVALUATION_MANUAL_START = '自行填写评估';
export const EVALUATION_REPORT_UNSAVED = '这一版有未保存的修改：先保存或放弃这些修改，再打开最新评估报告。';

/**
 * Why AI7's latest report cannot become the editor's version now, in the editor's words; `null` when 修改报告 can. A version
 * still unfinished never stops it (Issue #1406): only a report that no longer reads the text as it stands, one that scored
 * not every item, or the service's own refusal does.
 */
export function evaluationReportEditReason(start: EvaluationWorkspaceProjection['start'],
  latest: Pick<NonNullable<EvaluationInitialProjection['latest']>, 'revisionId' | 'current' | 'complete'>): string | null {
  if (!latest.current) return '稿件在这份报告之后改过：重新生成评估报告后，才能在报告上修改。';
  if (!latest.complete) return '这份报告没有给出全部评分项的分数：请重新生成评估报告。';
  if (!start.allowed) return start.reason;
  if (start.fromInitial === null || start.fromInitial.revisionId !== latest.revisionId) return '评估方案在这份报告之后变了：请重新生成评估报告。';
  return null;
}
export const EVALUATION_AI7_SUFFICIENCY: Readonly<Record<InitialEvaluationSufficiency, string>> = { sufficient: '充分', fair: '一般', insufficient: '不足' };
export const EVALUATION_AI7_SUGGESTED = 'AI7 建议';
export const EVALUATION_ADJUSTMENT_LEGEND = '调分原因 · 可多选';
export const EVALUATION_ADJUSTMENT_REASON_LABELS: Readonly<Record<EvaluationAdjustmentReasonId, string>> = EVALUATION_ADJUSTMENT_REASON_WORDS;
export const EVALUATION_ADJUSTMENT_NOTE = '自行输入的原因';
export const EVALUATION_AI7_STATUS = {
  preparing: '正在准备 AI7 初评的任务计划…',
  prepared: 'AI7 初评的任务计划已准备。',
  cancelled: 'AI7 初评的任务计划准备已取消。',
  failed: '无法准备 AI7 初评。',
  startingFromInitial: '正在打开评估报告供修改…',
} as const;

/** The Book's 初评 Task in one line: its state as the drawer names it. */
export function evaluationAi7TaskLine(task: NonNullable<EvaluationInitialProjection['task']>): string {
  return `${EVALUATION_AI7_HEADING} · ${task.label}`;
}

/** The latest 初评 that settled: which one, what it read, its total and band, and whether the manuscript moved since. */
export function evaluationAi7LatestLine(profile: Pick<EvaluationProfileProjection, 'bands'>, latest: NonNullable<EvaluationInitialProjection['latest']>): string {
  const total = latest.complete ? evaluationTotalLine(profile, latest.total) : '全书综合没有给出分数';
  const moved = latest.current ? '' : '（稿件此后改过：重新生成后才能在报告上修改）';
  return `第 ${latest.ordinal} 次初评 · 读的是修订版${technicalWords(` ${latest.revisionLabel}`)} · ${total}${moved}`;
}

/** 依据充分度 of one item (EVAL-005), with what it rests on. */
export function evaluationAi7SufficiencyLine(item: Pick<EvaluationInitialDraftProjection['items'][number], 'sufficiency' | 'citedBlocks' | 'unitsCited'>): string {
  const label = `依据充分度 ${EVALUATION_AI7_SUFFICIENCY[item.sufficiency]}`;
  return item.citedBlocks === 0 ? `${label}（没有引用段落）` : `${label}（引用 ${item.citedBlocks} 个段落，分布在 ${item.unitsCited} 个阅读范围）`;
}

/**
 * AI7's score of one item beside the editor's (EVAL-006), and — where the house calibration moved the version's starting score
 * (EVAL-011a) — the score after it, the raw one kept: 「AI7 初评 12 / 20 · 校准后 10 / 20 · …」.
 */
export function evaluationAi7ItemLine(
  item: Pick<EvaluationInitialDraftProjection['items'][number], 'score' | 'sufficiency' | 'citedBlocks' | 'unitsCited'>,
  fullMarks: number,
  calibrated: Pick<EvaluationInitialCalibrationProjection['items'][number], 'adjusted'> | null = null,
): string {
  const score = item.score === null ? '没有给出分数' : `${evaluationScore(item.score)} / ${fullMarks}`;
  const after = calibrated === null || item.score === null ? '' : ` · 校准后 ${evaluationScore(calibrated.adjusted)} / ${fullMarks}`;
  return `AI7 初评 ${score}${after} · ${evaluationAi7SufficiencyLine(item)}`;
}

/**
 * What a version begun from AI7's 初评 says of the house calibration applied to its starting scores (EVAL-011; EVAL-011a):
 * the Books it rested on and that the raw scores stay beside it; `null` for a version begun from the raw 初评.
 */
export function evaluationAi7CalibrationLine(calibration: EvaluationInitialCalibrationProjection | null): string | null {
  if (calibration === null) return null;
  const moved = calibration.items.length === 0 ? '各项偏移为 0，起始分数未变' : `调整了 ${calibration.items.length} 项的起始分数，原始分数仍列在每一项旁边`;
  return `AI7 的初评分数已按本社校准（依据 ${calibration.basisBooks} 本书的定稿评估）：${moved}；校准只调 AI7 的分数，不调风险项，也不改你的评分。`;
}

/**
 * The score one item started at in a version begun from AI7's 初评 (EVAL-011a): AI7's score after the house calibration where
 * it moved the item, else AI7's raw score; `null` for a version begun alone or an item AI7 did not score. The service reads the
 * editor's departures — where 调分原因 is offered and what counts toward 调分记录 — against exactly this start, so the page must too.
 */
export function evaluationStartingScore(record: Pick<EvaluationRecordProjection, 'initial' | 'calibration'>, itemId: string): number | null {
  return record.calibration?.items.find((entry) => entry.itemId === itemId)?.adjusted ?? record.initial?.items.find((entry) => entry.itemId === itemId)?.score ?? null;
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
  return technicalWords(`这一版从 AI7 第 ${initial.ordinal} 次初评开始（读的是修订版 ${initial.revisionLabel}）：AI7 的分数列在每一项旁边，记录保存的是你的评分。`, `这一版参考 AI7 第 ${initial.ordinal} 次初评，评分由你决定。`);
}

/** The conclusion AI7 would suggest, said as AI7's (EVAL-007). */
export function evaluationAi7ConclusionLine(profile: Pick<EvaluationProfileProjection, 'conclusions'>, conclusion: EvaluationConclusion | null): string {
  return conclusion === null ? 'AI7 没有给出建议结论。' : `AI7 建议的结论：${evaluationConclusionLabel(profile, conclusion)}`;
}

// ---- 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013) ------------------------------------------------------------

export const READERS_REPORT_HEADING = '审稿意见';
export const READERS_REPORT_LEDE =
  '根据定稿评估起草审稿意见，修改并保存后可导出，草稿不会自动发送或改变评估。';
export const READERS_REPORT_ACTIONS = {
  prepare: '起草',
  openPlan: '查看计划',
  openTask: '查看任务',
  createDraft: '打开草稿',
  openDraft: '打开草稿',
  exportDraft: '导出…',
} as const;
export const READERS_REPORT_STATUS = {
  preparing: '正在准备审稿意见的任务计划…',
  prepared: '审稿意见的任务计划已准备。',
  started: '已开始起草审稿意见。',
  cancelled: '审稿意见的任务计划准备已取消。',
  failed: '无法准备审稿意见。',
  creating: '正在打开审稿意见草稿…',
  openFailed: '无法打开审稿意见草稿。',
} as const;

/** The 定稿 version a new 审稿意见 drafts from, or `null` while there is none (the template rows then say why). */
export function readersReportBasisLine(basis: EvaluationReadersReportProjection['basis']): string | null {
  return basis === null ? null : `依据${technicalWords(`第 ${basis.ordinal} 版`, '版本')}定稿（评估的是修订版${technicalWords(` ${basis.revisionLabel}`)}）`;
}

/** The Book's latest 审稿意见 Task in one line: its template, and its state as the drawer names it. */
export function readersReportTaskLine(task: NonNullable<EvaluationReadersReportProjection['task']>, templateLabel: string): string {
  return `${READERS_REPORT_HEADING}「${templateLabel}」 · ${task.label}`;
}

/** A drafted result not yet opened: what it was drafted from. */
export function readersReportDraftedLine(drafted: NonNullable<EvaluationReadersReportProjection['templates'][number]['drafted']>): string {
  return `AI7 已写出草稿 · 依据${technicalWords(`第 ${drafted.recordOrdinal} 版`, '版本')}定稿 · 打开后在稿件编辑面上修改`;
}

/** A template's draft document: its latest version, what it was drafted from, and whether the text moved past the version. */
export function readersReportDraftLine(draft: NonNullable<EvaluationReadersReportProjection['templates'][number]['draft']>): string {
  const latest = draft.document.versions[0]?.label ?? '版本 1';
  return `草稿 · ${latest} · 依据${technicalWords(`第 ${draft.recordOrdinal} 版`, '版本')}定稿${draft.document.changedSinceVersion ? ' · 有修改尚未保存为版本' : ''}`;
}

// ---- 市场 (Issue #429, plan slice S81b2; V2-UX-EVAL-009, EVAL-010) ------------------------------------------------------

export const EVALUATION_MARKET_HEADING = '市场定位与策略';
export const EVALUATION_MARKET_LEDE = '目标读者、卖点与渠道由 AI7 推断，可比图书与定价首印来自本社数据。';
/** The producing Run owns the research status; a market section alone establishes no web research. */
export const EVALUATION_MARKET_OFFLINE = '联网情况以运行报告为准，无检索记录即未联网核查；市场判断仍需人工核对。';
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

export const EVALUATION_REWRITE_HEADING = '按我的修改重新生成';
export const EVALUATION_REWRITE_ACTIONS = {
  prepare: '按我的修改重新生成',
  openPlan: '查看计划并开始',
  openTask: '查看任务',
  accept: '采用新版报告',
  discard: '放弃',
} as const;
export const EVALUATION_REWRITE_STATUS = {
  preparing: '正在准备按你的修改重新生成报告…',
  prepared: '重新生成的任务计划已准备。',
  started: 'AI7 正在按你的修改重新生成报告。',
  cancelled: '重新生成的任务计划准备已取消。',
  failed: '无法按你的修改重新生成报告。',
  unsaved: '先保存修改，再按你的修改重新生成：重新生成只读已保存的内容。',
  unsavedAccept: '这一版有未保存的修改：先保存或放弃这些修改，再采用新版报告。',
  accepting: '正在采用新版报告…',
  accepted: '已采用新版报告：各项分数与结论没有改动。',
  discarding: '正在放弃重写的评语…',
  discarded: '已放弃这一次重写，评语保持原样。',
  decideFailed: '无法处理重写的评语。',
} as const;
export const EVALUATION_REWRITE_VERDICT = '总评';
export const EVALUATION_REWRITE_BEFORE = '现在';
export const EVALUATION_REWRITE_AFTER = '重写';
export const EVALUATION_REWRITE_EMPTY = '（还没有写）';
export const EVALUATION_REWRITE_STALE = '这一版在重新生成之后又保存过：新版依据的是之前的修改，不能采用；可以放弃它，再按现在的修改重新生成。';

/** The Book's latest rewrite Task in one line: the version it rewrites, and its state as the drawer names it. */
export function evaluationRewriteTaskLine(task: NonNullable<EvaluationRewriteWorkspaceProjection['task']>): string {
  return `${EVALUATION_REWRITE_HEADING} · ${technicalWords(`第 ${task.recordOrdinal} 版`, '版本')} · ${task.label}`;
}

/** The proposal waiting for the editor: which save it was written from. */
export function evaluationRewriteProposalLine(proposal: NonNullable<EvaluationRewriteWorkspaceProjection['proposal']>): string {
  const lines = proposal.strengths !== null || proposal.weaknesses !== null;
  return `AI7 按你第 ${proposal.entryOrdinal} 次保存的修改重新生成了${lines ? '评估报告（评语、总评、优点与问题）' : '评语与总评'}，等你决定：采用后才记入这一版，分数与结论不变。`;
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
    ? technicalWords(`上一次重写的评语已采用（记为第 ${decided.entryOrdinal} 次保存），分数没有改动。`, '上次重写已采用，分数不变。')
    : '上一次重写的评语已放弃，评语保持原样。';
}
