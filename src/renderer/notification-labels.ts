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

/** The word a notice calls a task by: its kind, never its plan's long name. */
export function taskKindWord(item: GlobalAttentionItemProjection): string {
  return item.object.kind === 'analysis' ? '分析' : item.object.kind === 'review' ? '审阅' : item.object.kind === 'dialogue' ? '对话' : item.object.kind === 'task' ? item.object.taskKind === 'writing' ? '写作' : '评估' : '任务';
}

function bookWord(item: GlobalAttentionItemProjection): string {
  return item.book.title === null ? '' : `《${item.book.title}》`;
}

export function completionLabel(item: GlobalAttentionItemProjection): string {
  if (item.facts.dialogueCancelled) return `${bookWord(item)}对话已取消`;
  return `${bookWord(item)}${taskKindWord(item)}完成${item.state === 'analysis-completed-with-gaps' ? ' · 仍有未完成部分' : ''}`;
}

/**
 * What stops a task until the editor acts (#1528): it failed, it reached the usage the editor set, the model service refused it
 * for its account limit, the model asked a question, or its outcome cannot be confirmed. Every other 待我处理 item is not a
 * task that stopped, and raises no notice of its own.
 */
export type AttentionKind = 'failed' | 'budget' | 'quota' | 'question' | 'unconfirmed';
const ATTENTION_KINDS: Partial<Record<GlobalAttentionStateKey, AttentionKind>> = {
  'analysis-failed': 'failed', 'analysis-interrupted': 'failed', 'analysis-blocked': 'failed', 'analysis-orphaned': 'failed',
  'review-failed': 'failed', 'review-stopped': 'failed', 'dialogue-failed': 'failed', 'dialogue-interrupted': 'failed',
  'analysis-budget-reached': 'budget', 'analysis-account-limit': 'quota', 'analysis-clarification': 'question',
  'analysis-outcome-unknown': 'unconfirmed', 'analysis-outcome-unconfirmed': 'unconfirmed',
};
export function attentionKind(item: GlobalAttentionItemProjection): AttentionKind | null {
  // A dialogue the editor cancelled is the editor's own doing: quiet, as in 0.7.2. A global dialogue has no Book to name.
  if (item.group === 'active' || item.facts.dialogueCancelled === true) return null;
  return ATTENTION_KINDS[item.state] ?? null;
}

/** The notice for a task that needs the editor: the Book, the task and what happened to it. */
export const ATTENTION_NOTICE_WORDS = Object.freeze({
  go: '去处理',
  view: '查看',
  close: '关闭提示',
  phrases: Object.freeze({
    failed: '没有完成', budget: '用量已到上限', quota: '被模型服务拒绝：账户限额已用完', question: '在等你回答', unconfirmed: '结果待确认',
  } satisfies Record<AttentionKind, string>),
});

export function attentionLabel(item: GlobalAttentionItemProjection): string {
  const kind = attentionKind(item);
  return `${bookWord(item)}${taskKindWord(item)}${kind === null ? '需要你处理' : ATTENTION_NOTICE_WORDS.phrases[kind]}`;
}

/** Several tasks that need the editor collapse into one line. */
export function attentionManyLabel(count: number): string {
  return `有 ${count} 项任务需要你处理`;
}

/** On returning to the window: what finished and what needs the editor while it was in the background. */
export function awaySummaryLabel(finished: number, needing: number): string {
  if (finished === 0) return `你不在时，有 ${needing} 项任务需要你处理`;
  return needing === 0 ? `你不在时，${finished} 项任务已完成` : `你不在时，${finished} 项任务已完成，${needing} 项需要你处理`;
}

/** The header's pill on every page: the tasks that need the editor, named as 待我处理 is (Issue #1531; the 批注栏 counts 待处理 marks). */
export function attentionPillLabel(count: number): string {
  return `待我处理 ${count}`;
}

/** 设置 › 本机 › 通知 and the quiet completion notice (Issue #937). */
export const NOTIFICATION_SETTINGS_WORDS = Object.freeze({
  title: '通知',
  note: '系统通知仅在 AI7 所有窗口都不在前台时发送，默认只用通用措辞；这些开关不授予任何处理或发布权限。',
  enabled: '系统通知',
  completions: '普通完成提示也发系统通知',
  sound: '通知声音',
  bookName: '在通知中显示图书名',
  autoResult: '正在看本书时自动显示结果',
  saved: '通知设置已保存在本机。',
  unsaved: '通知设置未保存。',
  opened: '通知设置',
});

export const QUIET_NOTICE_WORDS = Object.freeze({
  region: '提示',
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
/** A task the editor cancelled or stopped is in 最近完成 as it is in the 任务 panel, but it is not a completion to say. */
const NOT_COMPLETIONS: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-cancelled', 'dialogue-stopped']);
export function isCompletion(item: GlobalAttentionItemProjection): boolean {
  return item.group === 'recent' && attentionKind(item) === null && !NOT_COMPLETIONS.has(item.state);
}

export function isOrdinaryOutcome(item: GlobalAttentionItemProjection, projection: GlobalAttentionProjection): boolean {
  return item.group === 'recent' && !projection.groups.some((group) =>
    (group.key === 'exceptions' || group.key === 'decisions') && group.items.some((attention) =>
      attention.book.bookId === item.book.bookId && recordKey(attention.target) === recordKey(item.target)));
}
