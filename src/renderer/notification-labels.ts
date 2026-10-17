import type { GlobalAttentionItemProjection } from '../shared/protocol.js';

/** Closed, content-free wording. Never interpolate record details into a system notice. */
export const NOTIFICATION_LABELS = Object.freeze({
  decision: 'AI7：有一项需要你处理',
  abnormal: 'AI7：一项任务出现异常',
  candidate: '候选结果已可查看',
  outcome: '任务结果已记录',
  effect: '应用凭据已记录',
  ambiguous: '结果待确认',
  failure: '任务出现异常',
  pending: '有一项决定等你处理',
  review: '审阅结果已可查看',
  indexing: '资料索引已建立',
});

export function completionLabel(item: GlobalAttentionItemProjection): string {
  if (item.state === 'review-completed') return NOTIFICATION_LABELS.review;
  if (item.state === 'indexing-completed') return NOTIFICATION_LABELS.indexing;
  return NOTIFICATION_LABELS.outcome;
}
