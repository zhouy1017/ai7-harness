/** Present service refusals without inventing a prerequisite or recovery ceremony. */
export interface AnalysisRefusalView { readonly text: string; readonly actionLabel: null; }
export function analysisRefusalView(_code: string | null | undefined, serviceText: string): AnalysisRefusalView {
  return { text: serviceText, actionLabel: null };
}
