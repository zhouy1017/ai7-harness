/** Present service refusals without inventing a prerequisite or recovery ceremony. */
export interface AnalysisRefusalView { readonly text: string; readonly actionLabel: '去设置' | null; }
export function analysisRefusalView(_code: string | null | undefined, serviceText: string): AnalysisRefusalView {
  const needsModel = ['ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', 'ANALYSIS_PREREQUISITE_REQUIRED'].includes(_code ?? '');
  return { text: needsModel ? '尚未连接模型服务' : serviceText, actionLabel: needsModel ? '去设置' : null };
}
