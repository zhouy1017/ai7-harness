/**
 * What 工作概览 and 分析 say when the service refuses analysis before its profile is ready
 * (Issue #992). The refusal arrives with its code; the words and next step live here, pure, so the
 * unit suite pins each one without a DOM.
 *
 * Nothing here changes a refusal: the service still refuses exactly as before, and every code not named below
 * keeps the text the service gave.
 */

/** The analysis read's refusal until the editor has installed and enabled the Book's 编辑工作区方案. */
export const ANALYSIS_PROFILE_PIN_CODE = 'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE';

export const ANALYSIS_PROFILE_NEXT_STEP = '开始分析前，先在 工作概览 › 编辑工作区方案 获取并启用本书的方案。';
export const ANALYSIS_PROFILE_ACTION_LABEL = '前往编辑工作区方案';

export interface AnalysisRefusalView {
  /** The sentence the surface shows. */
  readonly text: string;
  /** The one button that takes the editor to the profile card, when the refusal has a next step. */
  readonly actionLabel: string | null;
}

/** The sentence and button for a refused analysis read: the profile next step for its pin code, else the service's own text. */
export function analysisRefusalView(code: string | null | undefined, serviceText: string): AnalysisRefusalView {
  return code === ANALYSIS_PROFILE_PIN_CODE
    ? { text: ANALYSIS_PROFILE_NEXT_STEP, actionLabel: ANALYSIS_PROFILE_ACTION_LABEL }
    : { text: serviceText, actionLabel: null };
}
