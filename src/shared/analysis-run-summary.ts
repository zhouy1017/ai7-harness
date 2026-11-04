import type { RunReportRecordProjection } from './protocol.js';

/** Preserve the classified wording; technical error codes stay in the detailed record. */
export function majorityGapReason(gaps: ReadonlyArray<{ code: string; reason: string }>): string | null {
  const counts = new Map<string, number>();
  for (const gap of gaps) {
    if (gap.code === 'out-of-scope') continue;
    const reason = gap.reason.replace(/（[A-Z][A-Z0-9_:-]*）/g, '');
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function completedWithGapsLabel(gaps: number, total: number): string {
  return `已完成 · ${gaps}/${total} 个单元未读成`;
}

export function analysisRunSummary(report: Pick<RunReportRecordProjection, 'units' | 'failures'>): { gaps: number; total: number; reason: string | null } {
  return { gaps: report.units.gaps, total: report.units.recomputed + report.units.reused,
    reason: majorityGapReason(report.failures.filter((failure) => failure.stage === 'units')) };
}
