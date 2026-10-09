import type { BackgroundAnalysisEnrollmentProjection } from '../shared/protocol.js';

/**
 * ②A's 后台分析 words (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-017). What an Enrollment binds, what it would do now
 * and why, and what revoking keeps are the service's words; these are the block's own.
 */
export const BACKGROUND_HEADING = '后台分析';
export const BACKGROUND_ENROLL_OPEN = '登记后台分析…';
export const BACKGROUND_REVOKE_OPEN = '撤销登记…';
export const BACKGROUND_DISCLOSURE_HEADING = '登记后台分析';
export const BACKGROUND_REVOKE_HEADING = '撤销后台分析登记';
export const BACKGROUND_SCOPE_LABEL = '范围';
export const BACKGROUND_WHAT_LABEL = '分析';
export const BACKGROUND_WHEN_LABEL = '何时开始';
export const BACKGROUND_NOT_GRANTED_LABEL = '登记不会做';
export const BACKGROUND_STARTING_POINT_LEGEND = '从哪里开始（请选一项）';
export const BACKGROUND_CONFIRM = '登记';
export const BACKGROUND_REVOKE_CONFIRM = '撤销登记';
export const BACKGROUND_CANCEL = '取消';
export const BACKGROUND_CHOOSE_FIRST = '请先选从哪里开始。';
export const BACKGROUND_STARTED_HEADING = '按登记开始的分析';
export const BACKGROUND_HISTORY_SUMMARY = '登记记录';
export const BACKGROUND_BINDS_SUMMARY = '这份登记定下的内容';
export const BACKGROUND_LOADING = '正在读取后台分析登记…';
export const BACKGROUND_UNAVAILABLE = '无法读取这本书的后台分析登记。';
export const BACKGROUND_ENROLLED_STATUS = '已登记后台分析';
export const BACKGROUND_REVOKED_STATUS = '已撤销后台分析登记';

/** `下一次：…` — what the Enrollment would do now; said only while the Book has one. */
export function backgroundNextLine(next: BackgroundAnalysisEnrollmentProjection['next']): string {
  return `${next.kind === 'start' ? '马上' : '现在'}：${next.reason}`;
}

/** `后台分析登记 · 第 1 版 · 只分析登记之后的改动 · 登记于 …`. */
export function backgroundEnrollmentLine(
  enrollment: NonNullable<BackgroundAnalysisEnrollmentProjection['enrollment']>,
  instant: (value: string) => string,
): string {
  return `${enrollment.name} · ${enrollment.startingPointLabel} · ${enrollment.enrolledBy}登记于 ${instant(enrollment.enrolledAt)}`;
}

/** One Run the Enrollment started: `同步到当前稿件 · 按第 1 版登记 · 授权于 …`; a version from other data reads without its number. */
export function backgroundStartedLine(
  run: BackgroundAnalysisEnrollmentProjection['startedRuns'][number],
  instant: (value: string) => string,
): string {
  const by = run.enrollmentOrdinal === null ? '按另一份数据的登记' : `按第 ${run.enrollmentOrdinal} 版登记`;
  return `${run.modeLabel} · ${by} · 授权于 ${instant(run.authorizedAt)}`;
}

/** One state of the Enrollment's history: `第 1 版 · 已登记 · …`. */
export function backgroundHistoryLine(
  entry: BackgroundAnalysisEnrollmentProjection['history'][number],
  instant: (value: string) => string,
): string {
  return `第 ${entry.ordinal} 版 · ${entry.stateLabel} · ${instant(entry.recordedAt)}`;
}

/** `还有 N 项更早的` beneath the ten newest Runs. */
export function backgroundStartedMoreLine(hidden: number): string {
  return `还有 ${hidden} 项更早的。`;
}
