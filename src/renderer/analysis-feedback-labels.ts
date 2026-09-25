import {
  ANALYSIS_FEEDBACK_OTHER,
  ANALYSIS_FEEDBACK_REASONS,
  type AnalysisFeedbackDimension,
  type AnalysisFeedbackJudgment,
} from '../shared/analysis-feedback.js';
import {
  MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES,
  type AnalysisFeedbackProjection,
  type AnalysisFeedbackSignalProjection,
  type AnalysisQualityMetricProjection,
} from '../shared/protocol.js';

/**
 * ②A 分析反馈's words (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to FDBK-008): the card each
 * item offers, the judgments and their reasons, a recorded judgment as it reads afterwards, and the Book's Analysis Quality
 * Metric with what it is not. Pure, so the unit suite pins every one.
 */

export const ANALYSIS_FEEDBACK_OPEN = '反馈…';
export const ANALYSIS_FEEDBACK_CHANGE = '改反馈…';
export const ANALYSIS_FEEDBACK_RECORD = '记录反馈';
export const ANALYSIS_FEEDBACK_CANCEL = '取消';
export const ANALYSIS_FEEDBACK_JUDGMENT_LEGEND = '这一条';
export const ANALYSIS_FEEDBACK_REASON_LEGEND = '原因（可不选）';
export const ANALYSIS_FEEDBACK_OTHER_LABEL = '其他 / 自行输入';
export const ANALYSIS_FEEDBACK_OTHER_TEXT = '写下原因';
export const ANALYSIS_FEEDBACK_CORRECTION = `修正说明（可不填，${MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES} 字以内）`;
export const ANALYSIS_FEEDBACK_HEADING = '你的分析反馈';
/** What the metric is and is not (ANALYSIS-024, FDBK-012), said once beside it. */
export const ANALYSIS_FEEDBACK_METRIC_NOTE = '只统计你明确给出的判断：没有判断的条目不算认可；这是对分析结果的评价，不代表事实核实，也不改变 AI7 的做法。';
export const ANALYSIS_FEEDBACK_STATUS = {
  loading: '正在读取分析反馈…',
  unavailable: '无法读取分析反馈。',
  recording: '正在记录反馈…',
  recorded: '反馈已记录。',
  failed: '无法记录这条反馈。',
} as const;

export const ANALYSIS_FEEDBACK_JUDGMENT_LABELS: Readonly<Record<AnalysisFeedbackJudgment, string>> = {
  accurate: '准确',
  inaccurate: '不准确',
  incomplete: '不完整',
};

export const ANALYSIS_FEEDBACK_DIMENSION_LABELS: Readonly<Record<AnalysisFeedbackDimension, string>> = {
  synopsis: '全书梗概',
  entities: '人物与名称',
  events: '事件',
  relationships: '关系',
  settings: '设定',
};

/** An item as the card names it to the editor and to a screen reader: the synopsis, or its list and its place in it. */
export function analysisFeedbackItemName(dimension: AnalysisFeedbackDimension, index: number): string {
  return dimension === 'synopsis' ? ANALYSIS_FEEDBACK_DIMENSION_LABELS.synopsis : `${ANALYSIS_FEEDBACK_DIMENSION_LABELS[dimension]} 第 ${index + 1} 条`;
}

/** The toggle beside an item, named with the item so a list of them reads apart. */
export function analysisFeedbackToggleName(changing: boolean, itemName: string): string {
  return `${changing ? '改反馈' : '反馈'}：${itemName}`;
}

/** The revision the judgments bind and how many of its items carry one, for the technical half. */
export function analysisFeedbackRevisionLine(projection: Pick<AnalysisFeedbackProjection, 'revisionOrdinal' | 'revisionId' | 'items'>): string {
  const judged = projection.items.filter((item) => item.latest !== null).length;
  return `Revision ${projection.revisionOrdinal} · ${projection.revisionId} · 已判断 ${judged} / ${projection.items.length} 条`;
}

/** The alternatives offered for a judgment of this kind of item, in their fixed order, 其他 last; none for 准确. */
export function analysisFeedbackReasonChoices(dimension: AnalysisFeedbackDimension, judgment: AnalysisFeedbackJudgment): ReadonlyArray<{ choice: string; label: string }> {
  if (judgment === 'accurate') return [];
  return [...ANALYSIS_FEEDBACK_REASONS[dimension][judgment], { choice: ANALYSIS_FEEDBACK_OTHER, label: ANALYSIS_FEEDBACK_OTHER_LABEL }];
}

/** A recorded judgment as the item reads afterwards: the verdict, its reason, the correction, and when. */
export function analysisFeedbackLine(dimension: AnalysisFeedbackDimension, signal: AnalysisFeedbackSignalProjection, instant: (iso: string) => string): string {
  const reason = signal.reason === null
    ? ''
    : signal.reason.choice === ANALYSIS_FEEDBACK_OTHER
      ? ` · ${signal.reason.text ?? ''}`
      : ` · ${analysisFeedbackReasonChoices(dimension, signal.judgment).find((entry) => entry.choice === signal.reason!.choice)?.label ?? signal.reason.choice}`;
  const correction = signal.correction === null ? '' : ` · 修正：${signal.correction}`;
  return `你的反馈：${ANALYSIS_FEEDBACK_JUDGMENT_LABELS[signal.judgment]}${reason}${correction} · ${instant(signal.recordedAt)}`;
}

function counts(entry: { judged: number; accurate: number; inaccurate: number; incomplete: number }): string {
  return `准确 ${entry.accurate}、不准确 ${entry.inaccurate}、不完整 ${entry.incomplete}`;
}

/** The Book's metric in one line, then one line per dimension judged; nothing when nothing was judged. */
export function analysisQualityMetricLines(metric: AnalysisQualityMetricProjection): { total: string; dimensions: string[] } {
  if (metric.judged === 0) return { total: '还没有给出判断。', dimensions: [] };
  return {
    total: `这本书判断了 ${metric.judged} 条：${counts(metric)}`,
    dimensions: metric.byDimension.filter((entry) => entry.judged > 0).map((entry) =>
      `${ANALYSIS_FEEDBACK_DIMENSION_LABELS[entry.dimension]}：${entry.judged} 条，${counts(entry)}`),
  };
}
