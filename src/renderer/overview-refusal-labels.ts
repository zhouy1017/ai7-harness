/** Present service refusals without inventing a prerequisite or recovery ceremony. */
export interface AnalysisRefusalView { readonly text: string; readonly actionLabel: '去设置' | null; }
export function analysisRefusalView(_code: string | null | undefined, serviceText: string): AnalysisRefusalView {
  return { text: serviceText, actionLabel: null };
}

/** Only the overview tile summarizes setup failures; the analysis page retains the service's explanation. */
export function overviewAnalysisRefusalView(_code: string | null | undefined, serviceText: string): AnalysisRefusalView {
  const needsModel = ['ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE'].includes(_code ?? '');
  return { text: _code === 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED' ? '尚未连接模型服务' : needsModel ? '模型服务需要设置，请检查连接。' : serviceText, actionLabel: needsModel ? '去设置' : null };
}
