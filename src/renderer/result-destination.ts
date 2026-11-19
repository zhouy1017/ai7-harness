import type { BookTaskResultRef, GlobalAttentionItemProjection, GlobalAttentionTarget, TaskPlanKind } from '../shared/protocol.js';

/** A finished task as the 任务总览, the Book's 任务 panel and 待我处理 each hold it. */
export interface FinishedEntry {
  readonly bookId?: string | null;
  readonly result: BookTaskResultRef | null;
  readonly attention: GlobalAttentionItemProjection;
  readonly plan?: { readonly kind: TaskPlanKind; readonly ref: string | null } | null;
}

/** Where 查看结果 is pressed: the quiet toast, the command palette, the 任务总览 card, the Book's 任务 panel, a 待我处理 row. */
export type ResultEntrance = 'toast' | 'palette' | 'overview' | 'panel' | 'attention';

export type ResultRoute =
  | { readonly via: 'page'; readonly target: GlobalAttentionTarget; readonly analysisRevisionId?: string }
  | { readonly via: 'window' }
  | { readonly via: 'none' };

/**
 * 查看结果 (#1528): the result itself, in its Book. The toast and the palette open it wherever the editor is, the 任务总览 card
 * from the overview (the one page the result window may stand over a task of another Book); the 任务 panel and a 待我处理 row keep the
 * result window for a task that has a result to read, and send a 评估 or 写作 that has none — the window would say only that the
 * task is done — to the page that holds it.
 */
export function finishedResultRoute(entry: FinishedEntry, from: ResultEntrance): ResultRoute {
  const bookId = entry.bookId ?? entry.attention.book.bookId;
  if (bookId === null) return { via: 'none' };
  const { result, plan } = entry;
  const task = result === null && entry.attention.object.kind === 'task';
  const own: GlobalAttentionTarget = task && plan ? { kind: 'task-plan', bookId, taskKind: plan.kind, ref: plan.ref } : entry.attention.target;
  if (from === 'panel' || from === 'attention') return task ? { via: 'page', target: own } : { via: 'window' };
  if (result?.kind === 'analysis-revision') {
    return { via: 'page', target: { kind: 'analysis', bookId, taskIntentId: plan?.ref ?? entry.attention.itemId }, analysisRevisionId: result.revisionId };
  }
  if (result?.kind === 'review-run') return { via: 'page', target: { kind: 'review', bookId, reviewRunId: result.reviewRunId } };
  if (result?.kind === 'dialogue') return { via: 'page', target: { kind: 'dialogue', bookId, dialogueId: result.dialogueId } };
  // No result page of its own: the page that holds the task — and only the overview may hold the window over another Book's task.
  return from === 'overview' && !task ? { via: 'window' } : { via: 'page', target: own };
}
