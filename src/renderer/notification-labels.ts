import type { GlobalAttentionItemProjection, GlobalAttentionProjection, GlobalAttentionStateKey, GlobalAttentionTarget } from '../shared/protocol.js';

/**
 * Closed, content-free wording (NOTIF-006, NOTIF-010): one phrase per notice class. Never interpolate record details;
 * a system notice adds only the Book's title, and only when 在通知中显示图书名 is on.
 */
export const NOTIFICATION_LABELS = Object.freeze({
  // A named pending decision: Clarification Request, Proposal / Review / Effect or other decision-ready record.
  pending: '有一项需要你处理',
  failure: '一项任务出现异常',
  ambiguous: '有一项结果待确认',
  candidate: '审阅结果已可查看',
  outcome: '任务结果已记录',
  outcomeWithGaps: '任务结果已记录，仍有未完成部分',
  indexing: '资料索引结果已记录',
  // No 待我处理 state is a committed Effect Receipt yet; the class keeps its own words for when one is.
  effect: '应用凭据已记录',
});

export type NotificationLabelKey = keyof typeof NOTIFICATION_LABELS;

/** 结果待确认 in 异常与结果待确认: an outcome local evidence cannot prove, distinct from a failure. */
const AMBIGUOUS_STATES: ReadonlySet<GlobalAttentionStateKey> = new Set([
  'apply-outcome-unresolved', 'import-outcome-uncertain', 'analysis-outcome-unknown', 'analysis-outcome-unconfirmed',
]);

/** The class of one item in the first two groups of 待我处理 or in 最近完成. */
export function notificationClass(item: GlobalAttentionItemProjection): NotificationLabelKey {
  if (item.group === 'decisions') return 'pending';
  if (item.group === 'exceptions') return AMBIGUOUS_STATES.has(item.state) ? 'ambiguous' : 'failure';
  if (item.state === 'analysis-completed-with-gaps') return 'outcomeWithGaps';
  if (item.state === 'review-completed') return 'candidate';
  if (item.state === 'indexing-completed') return 'indexing';
  return 'outcome';
}

/** A system notice's words: the class in generic AI7 wording, never a generic 任务已完成. */
export function systemNoticeText(key: NotificationLabelKey): string {
  return `AI7：${NOTIFICATION_LABELS[key]}`;
}

/** What a system notice may add to its class: the Book's title when the editor chose it, and how many current items it covers. */
export function systemNoticeSuffix(bookTitle: string | null, count: number): string {
  return `${bookTitle === null ? '' : ` · ${bookTitle}`}${count > 1 ? ` · 共 ${count} 项` : ''}`;
}

export function completionLabel(item: GlobalAttentionItemProjection): string {
  return NOTIFICATION_LABELS[notificationClass(item)];
}

/** 设置 › 本机 › 通知 and the quiet completion notice (Issue #937). */
export const NOTIFICATION_SETTINGS_WORDS = Object.freeze({
  title: '通知',
  note: '系统通知仅在 AI7 所有窗口都不在前台时发送。默认只用通用措辞；这些开关不授予任何处理或发布权限。',
  enabled: '系统通知',
  completions: '普通完成提示也发系统通知',
  sound: '通知声音',
  bookName: '在通知中显示图书名',
  saved: '通知设置已保存在本机。',
  unsaved: '通知设置未保存。',
  back: '返回设置',
  opened: '通知设置',
});

export const QUIET_NOTICE_WORDS = Object.freeze({
  region: '最近完成提示',
  view: '查看结果',
  close: '关闭提示',
});

/** 待我处理 opened from a notice for several events of one Book. */
export const NOTIFICATION_BOOK_LIST_LINE = '待我处理：只列出这本书的事项；从侧栏打开待我处理可查看全部。';

function recordKey(target: GlobalAttentionTarget): string {
  if ('taskIntentId' in target) return target.taskIntentId;
  if ('reviewRunId' in target) return target.reviewRunId;
  if (target.kind === 'task-plan' && target.ref !== null) return target.ref;
  return JSON.stringify(target);
}

/** A Task Outcome can stand alongside unresolved external effects; that is still actionable, not an ordinary completion. */
export function isOrdinaryOutcome(item: GlobalAttentionItemProjection, projection: GlobalAttentionProjection): boolean {
  return item.group === 'recent' && !projection.groups.some((group) =>
    (group.key === 'exceptions' || group.key === 'decisions') && group.items.some((attention) =>
      attention.book.bookId === item.book.bookId && recordKey(attention.target) === recordKey(item.target)));
}
