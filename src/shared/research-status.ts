import type { FrozenWebToolsBackend, RunReportProjection } from './protocol.js';

const BACKEND_NAMES: Readonly<Record<string, string>> = {
  'search-tinyfish': 'TinyFish',
  'search-deepseek': 'DeepSeek',
  'search-brave': 'Brave',
  'search-parallel': 'Parallel',
  'search-bochaai': '博查',
};

export function researchUnavailableLine(code: string | null | undefined, reason: string): string {
  return code === 'SEARCH_BACKEND_NOT_SHIPPED' || code === 'SEARCH_CREDENTIAL_MISSING'
    ? `暂不可用 · ${reason}` : reason;
}

/** Always reads the Run's frozen selection, never the current settings. */
export function researchBackendName(backend: FrozenWebToolsBackend): string {
  return BACKEND_NAMES[backend.backendId] ?? backend.backendId;
}

export function researchPlanLine(backend: FrozenWebToolsBackend | undefined): string {
  return backend === undefined ? '未联网核查' : `未联网核查 · ${researchBackendName(backend)} · 已冻结后端，尚未执行`;
}

export function researchDecisionLine(
  decision: string,
  report: Parameters<typeof researchStatusLine>[0] | null | undefined,
  backend?: FrozenWebToolsBackend,
): string {
  return `${decision} · ${report == null ? researchPlanLine(backend) : researchStatusLine(report)}`;
}

/** Tool execution is disclosed separately from whether a finding is supported by retained evidence. */
export function researchStatusLine(report: Pick<RunReportProjection, 'webToolsBackend' | 'usagePerStage' | 'classification' | 'failures'>): string {
  const backend = report.webToolsBackend;
  if (backend === undefined) return '未联网核查';
  const usage = report.usagePerStage['platform-tools'];
  const calls = Object.values(usage.searchCalls ?? {}).reduce((sum, count) => sum + count, 0);
  // Issue #1226: sends to any other backend than the frozen default went to its frozen 备用来源, counted per backend.
  const switched = Object.entries(usage.searchCalls ?? {}).filter(([id, count]) => id !== backend.backendId && count > 0);
  const suffix = ` · ${researchBackendName(backend)}${switched.length === 0 ? '' : ` · 已切换备用来源 ${switched.map(([id, count]) => `${BACKEND_NAMES[id] ?? id} ${count} 次`).join('、')}`}`;
  // A Run that froze a backend and stopped short never reads as 未联网核查, even before its first search.
  if (report.classification !== 'completed' || report.failures.length > 0 || (usage.refusedSearchCalls ?? 0) > 0) {
    const reason = report.failures.map((failure) => failure.reason).join('；') ||
      ((usage.refusedSearchCalls ?? 0) > 0 ? '检索调用被拒绝' : '运行未完成');
    return `联网核查未完成${suffix} · ${reason}`;
  }
  if (calls === 0) return `未联网核查${suffix} · 本次运行未执行检索`;
  return `联网核查已完成${suffix} · 已执行检索，事实结论仍需核对来源`;
}
