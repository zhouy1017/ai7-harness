/**
 * The Analysis Feedback Card's closed vocabulary (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to
 * FDBK-007), shared by the service, which records and checks a signal, and the page, which offers it. A judgment is the
 * editor's explicit verdict on one item of one Result Set Revision; a reason is optional, chosen from two or three
 * alternatives fitted to what was judged, none preselected, with `其他 / 自行输入` beside them. Nothing here is a guess of
 * AI7's, so no alternative is labeled `AI7 的猜测`.
 */

/** The parts of ②A's result an editor judges: the book's synopsis and each item of its four lists. */
export type AnalysisFeedbackDimension = 'synopsis' | 'entities' | 'events' | 'relationships' | 'settings';
export const ANALYSIS_FEEDBACK_DIMENSIONS: readonly AnalysisFeedbackDimension[] = ['synopsis', 'entities', 'events', 'relationships', 'settings'];

/** 准确, 不准确, or 不完整: the only verdicts, and none is assumed — an item nobody judged has no signal. */
export type AnalysisFeedbackJudgment = 'accurate' | 'inaccurate' | 'incomplete';
export const ANALYSIS_FEEDBACK_JUDGMENTS: readonly AnalysisFeedbackJudgment[] = ['accurate', 'inaccurate', 'incomplete'];

/** The free-text alternative every reason offers (FDBK-005). */
export const ANALYSIS_FEEDBACK_OTHER = 'other' as const;

/**
 * The alternatives a reason offers for one judgment of one kind of item: two or three, fitted to what was judged. `准确`
 * asks for no reason. Their order is fixed and none is preselected.
 */
export const ANALYSIS_FEEDBACK_REASONS: Readonly<Record<AnalysisFeedbackDimension, Readonly<Record<'inaccurate' | 'incomplete', ReadonlyArray<{ readonly choice: string; readonly label: string }>>>>> = {
  synopsis: {
    inaccurate: [{ choice: 'plot-misread', label: '情节概括有误' }, { choice: 'emphasis-wrong', label: '主次颠倒' }],
    incomplete: [{ choice: 'key-plot-missing', label: '漏了关键情节' }, { choice: 'ending-missing', label: '没有概括到结尾' }],
  },
  entities: {
    inaccurate: [{ choice: 'misnamed', label: '名字或称谓不对' }, { choice: 'merged', label: '把不同人物当成一个' }, { choice: 'wrong-kind', label: '类别标错' }],
    incomplete: [{ choice: 'alias-missing', label: '漏了别名' }, { choice: 'sources-missing', label: '出处不全' }],
  },
  events: {
    inaccurate: [{ choice: 'contradicts-text', label: '与原文不符' }, { choice: 'chronology-wrong', label: '时间顺序不对' }, { choice: 'participants-wrong', label: '参与者不对' }],
    incomplete: [{ choice: 'participants-missing', label: '漏了参与者' }, { choice: 'sources-missing', label: '出处不全' }],
  },
  relationships: {
    inaccurate: [{ choice: 'relation-wrong', label: '关系说错了' }, { choice: 'no-such-relation', label: '其实没有这层关系' }],
    incomplete: [{ choice: 'change-missing', label: '没写出关系的变化' }, { choice: 'sources-missing', label: '出处不全' }],
  },
  settings: {
    inaccurate: [{ choice: 'contradicts-text', label: '与原文不符' }, { choice: 'settings-confused', label: '前后设定混淆' }],
    incomplete: [{ choice: 'detail-missing', label: '漏了关键细节' }, { choice: 'sources-missing', label: '出处不全' }],
  },
};

/** Whether `choice` is one of the alternatives offered for this judgment of this kind of item, or `其他`. */
export function analysisFeedbackReasonOffered(dimension: AnalysisFeedbackDimension, judgment: AnalysisFeedbackJudgment, choice: string): boolean {
  if (judgment === 'accurate') return false;
  return choice === ANALYSIS_FEEDBACK_OTHER || ANALYSIS_FEEDBACK_REASONS[dimension][judgment].some((entry) => entry.choice === choice);
}

/** The Analysis Quality Metric's definition (ANALYSIS-024): named and versioned, apart from every Delivery Quality Metric. */
export const ANALYSIS_QUALITY_METRIC_DEFINITION = 'ai7.analysis-quality-metric/1' as const;
