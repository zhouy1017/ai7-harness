import type { GlobalAttentionItemProjection, GlobalAttentionProjection, GlobalAttentionTarget } from '../shared/protocol.js';

/** Closed, content-free wording. Never interpolate record details into a system notice. */
export const NOTIFICATION_LABELS = Object.freeze({
  decision: 'AI7：有一项需要你处理',
  abnormal: 'AI7：一项任务出现异常',
  candidate: '候选结果已可查看',
  outcome: '任务结果已记录',
  outcomeWithGaps: '任务结果已记录，仍有未完成部分',
  cancelled: '任务取消结果已记录',
  effect: '应用凭据已记录',
  ambiguous: '结果待确认',
  failure: '任务出现异常',
  pending: '有一项决定等你处理',
  review: '审阅结果已可查看',
  indexing: '资料索引结果已记录',
});

export function completionLabel(item: GlobalAttentionItemProjection): string {
  if (item.state === 'analysis-completed-with-gaps') return NOTIFICATION_LABELS.outcomeWithGaps;
  if (item.state === 'analysis-cancelled') return NOTIFICATION_LABELS.cancelled;
  if (item.state === 'review-completed') return NOTIFICATION_LABELS.review;
  if (item.state === 'indexing-completed') return NOTIFICATION_LABELS.indexing;
  return NOTIFICATION_LABELS.outcome;
}

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
