import type { BackgroundAnalysisEnrollmentProjection } from '../shared/protocol.js';

/**
 * ②A's 后台分析 words (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-017). What an Enrollment binds, what it would do now
 * and why, and what revoking keeps are the service's words; these are the block's own.
 */
export const BACKGROUND_HEADING = '后台处理登记';
export const BACKGROUND_ENROLL_OPEN = '登记后台处理…';
export const BACKGROUND_REVOKE_OPEN = '撤销登记…';
export const BACKGROUND_DISCLOSURE_HEADING = '登记后台处理';
export const BACKGROUND_REVOKE_HEADING = '撤销后台处理登记';
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
export const BACKGROUND_LOADING = '正在读取后台处理登记…';
export const BACKGROUND_UNAVAILABLE = '无法读取这本书的后台处理登记。';
export const BACKGROUND_ENROLLED_STATUS = '已登记后台处理';
export const BACKGROUND_REVOKED_STATUS = '已撤销后台处理登记';
/** Issue #864: the scope, the required ceiling, and 暂停 / 续行. */
export const BACKGROUND_SCOPE_LEGEND = '范围';
export const BACKGROUND_CEILING_LABEL = '预算上限（tokens，必填）';
export const BACKGROUND_CEILING_FIRST = '请先填写预算上限（tokens）。';
export const BACKGROUND_PAUSE = '暂停';
export const BACKGROUND_RESUME = '续行';
export const BACKGROUND_PAUSED_STATUS = '已暂停后台处理登记';
export const BACKGROUND_RESUMED_STATUS = '后台处理登记已续行';
export const BACKGROUND_REPORT_HEADING = '后台处理登记';

/** The ceiling split equally among a scope's Books in order, the remainder to the first — the service's rule, said before 登记. */
export function backgroundCeilingShares(ceiling: number, books: number): number[] {
  const each = Math.floor(ceiling / books);
  return Array.from({ length: books }, (_, index) => each + (index === 0 ? ceiling - each * books : 0));
}

/** The tokens the editor typed, or `null` while it is not a ceiling every Book of the scope can have a share of. */
export function backgroundCeilingOf(text: string, books: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^[0-9]+$/u.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= Math.max(1, books) && value <= max ? value : null;
}

/** What each Book's background Runs are held to under the ceiling typed so far. */
export function backgroundSharePreview(ceiling: number, books: ReadonlyArray<{ title: string }>): string {
  if (books.length <= 1) return `每次后台分析最多用 ${ceiling} tokens，达到就停下。`;
  const shares = backgroundCeilingShares(ceiling, books.length);
  const each = shares[books.length - 1]!;
  return shares[0] === each
    ? `${books.length} 本书各 ${each} tokens：每本书的每次后台分析最多用它那一份。`
    : `${books.length} 本书各 ${each} tokens，第一本《${books[0]!.title}》${shares[0]} tokens：每本书的每次后台分析最多用它那一份。`;
}

/** `范围：书系《乙》的 3 本书 · 预算上限 900 tokens，本书份额 300 tokens（第 2 本）`. */
export function backgroundCeilingLine(enrollment: NonNullable<BackgroundAnalysisEnrollmentProjection['enrollment']>): string {
  if (enrollment.ceilingTokens === null || enrollment.shareTokens === null) return `范围：${enrollment.scope.label} · 这份登记没有预算上限`;
  return enrollment.scope.kind === 'book'
    ? `范围：${enrollment.scope.label} · 预算上限 ${enrollment.ceilingTokens} tokens`
    : `范围：${enrollment.scope.label} · 预算上限 ${enrollment.ceilingTokens} tokens，本书份额 ${enrollment.shareTokens} tokens（第 ${enrollment.scope.position} 本）`;
}

/** The Books of a Series or all-Books scope the dispatcher's latest look skipped: `这次跳过：《甲》（…）；《丙》（…）`. */
export function backgroundSkippedLine(skipped: BackgroundAnalysisEnrollmentProjection['skipped']): string {
  return `这次跳过：${skipped.map((entry) => `《${entry.title}》（${entry.reason}）`).join('；')}`;
}

/**
 * What makes the block draw itself again: everything the projection says except when AI7 last looked, which changes on every
 * look and is patched in place instead (#713 review, P3-4).
 */
export function backgroundChangeKey(projection: BackgroundAnalysisEnrollmentProjection): string {
  return JSON.stringify({ ...projection, lastLook: projection.lastLook === null ? null : { kind: projection.lastLook.kind, reason: projection.lastLook.reason } });
}

/** `下一次：…` — what the Enrollment would do now; said only while the Book has one. */
export function backgroundNextLine(next: BackgroundAnalysisEnrollmentProjection['next']): string {
  return `${next.kind === 'start' ? '马上' : '现在'}：${next.reason}`;
}

/** `后台处理登记 · 第 1 版 · 只分析登记之后的改动 · 登记于 …`. */
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

/** The dispatcher's latest look at the Book: `AI7 上次查看：… · <what it found>`. */
export function backgroundLookLine(look: NonNullable<BackgroundAnalysisEnrollmentProjection['lastLook']>, instant: (value: string) => string): string {
  return `AI7 上次查看：${instant(look.at)} · ${look.reason}`;
}

/** Why the latest pass that began preparing did not start: the plan it may have left is the Enrollment's, never the editor's. */
export function backgroundNotStartedLine(note: NonNullable<BackgroundAnalysisEnrollmentProjection['lastNotStarted']>, instant: (value: string) => string): string {
  return `${note.reason}（${instant(note.at)}）`;
}

/** ②A's card beside a plan the Enrollment prepared and did not start (#713 review, P2-2). */
export const BACKGROUND_PREPARED_PLAN_NOTE = '这份计划是后台处理登记准备的，没有开始，也不是你准备的；可以看过后自己开始，或另外准备一份。';

/** `还有 N 项更早的` beneath the ten newest Runs. */
export function backgroundStartedMoreLine(hidden: number): string {
  return `还有 ${hidden} 项更早的。`;
}
