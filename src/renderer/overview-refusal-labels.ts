/**
 * What 工作概览 and 分析 say when the service refuses a read that only means something in some builds
 * (Issue #992). The refusal arrives with its code; the words and the choice of surface live here, pure, so the
 * unit suite pins each one without a DOM.
 *
 * Nothing here changes a refusal: the service still refuses exactly as before, and every code not named below
 * keeps the text the service gave.
 */

/**
 * The fixed Task card is the development-ci baseline Task surface (ADR 0044, J-03). Its read refuses these two
 * codes wherever that baseline does not apply — any Book that is not exact sample1 (TASK_LINEAGE_UNAVAILABLE),
 * and every Book under ordinary production, which has no development-ci Provider Processing v1 refusal record
 * (TASK_POLICY_UNAVAILABLE). For those the Book has no such card to show, not a card that says it is unavailable.
 */
const TASK_CARD_NOT_APPLICABLE_CODES: ReadonlySet<string> = new Set(['TASK_LINEAGE_UNAVAILABLE', 'TASK_POLICY_UNAVAILABLE']);

/** Whether the refused fixed-Task read still shows the existing unavailable note. */
export function taskCardRefusalShown(code: string | null | undefined): boolean {
  return code === null || code === undefined || !TASK_CARD_NOT_APPLICABLE_CODES.has(code);
}

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
