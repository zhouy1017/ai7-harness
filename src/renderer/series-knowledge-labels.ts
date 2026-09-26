import type {
  SeriesKnowledgeCandidateProjection,
  SeriesKnowledgeProvenanceProjection,
  SeriesKnowledgeReviewProjection,
  SeriesKnowledgeRevisionProjection,
} from '../shared/protocol.js';

/**
 * 书系知识's words (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019): the section, 提议为书系知识, a candidate, an item and
 * its revisions, 书系知识纳入审阅 with its dispositions, and the menu item a member Book's manuscript offers. Pure, so the unit
 * suite pins every one.
 */

export const KNOWLEDGE_HEADING = '书系知识';
export const KNOWLEDGE_NOTE = '书系知识只有经过纳入审阅才会成为书系可以选用的知识；候选项不会被任何任务读取，纳入也不会授权读取、发送或改动稿件。';
export const KNOWLEDGE_PROPOSE_OPEN = '提议为书系知识…';
export const KNOWLEDGE_PROPOSE = '提议为书系知识';
export const KNOWLEDGE_CANCEL = '取消';
export const KNOWLEDGE_TARGET_LEGEND = '条目';
export const KNOWLEDGE_TARGET_NEW = '新条目';
export const KNOWLEDGE_SUBJECT_LABEL = '条目名称';
export const KNOWLEDGE_CLASS_LABEL = '类别';
export const KNOWLEDGE_CLASS_PLACEHOLDER = '请选择类别';
export const KNOWLEDGE_CONTENT_LABEL = '内容';
export const KNOWLEDGE_ITEMS_HEADING = '条目';
export const KNOWLEDGE_ITEMS_EMPTY = '还没有书系知识。';
export const KNOWLEDGE_CANDIDATES_HEADING = '候选项';
export const KNOWLEDGE_CANDIDATES_EMPTY = '没有待审阅的候选项。';
export const KNOWLEDGE_REVIEW_OPEN = '纳入审阅…';
export const KNOWLEDGE_REVIEW_HEADING = '书系知识纳入审阅';
export const KNOWLEDGE_EDIT = '编辑候选项';
export const KNOWLEDGE_PRESERVE = '保留已披露冲突';
export const KNOWLEDGE_PRESERVED_NOTE = '已选择保留已披露冲突：冲突会随这一版一起记录，不代表核实。';
export const KNOWLEDGE_REUSE_LEGEND = '以后的用途';
export const KNOWLEDGE_PROMOTE_NOTE = '纳入后，它只成为以后可以明确选用的书系知识：不授权读取、不发送给模型服务、不改稿件，也不决定学习准入。';
export const KNOWLEDGE_EDIT_SAVE = '保存候选项';
export const KNOWLEDGE_REVIEW_REFRESH = '重新审阅';
export const KNOWLEDGE_WAIT_REUSE = '先选择以后的用途。';
export const KNOWLEDGE_WAIT_CONFLICT = '先处理已披露的冲突：编辑候选项，或选择保留已披露冲突。';
export const KNOWLEDGE_STATUS = {
  proposing: '正在提议为书系知识…',
  reviewing: '正在读取纳入审阅…',
  saving: '正在保存候选项…',
  promoting: '正在纳入书系知识…',
  edited: '候选项已更新，请重新审阅。',
  loadingMore: '正在读取更多…',
  failed: '无法完成。',
} as const;

/** Each list's next page and the items' search (Issue #63 review): every item and candidate is reachable, however many. */
export const KNOWLEDGE_ITEMS_MORE = '更多条目…';
export const KNOWLEDGE_CANDIDATES_MORE = '更多候选项…';
export const KNOWLEDGE_REVISIONS_MORE = '更早的版本…';
export const KNOWLEDGE_SEARCH_LABEL = '查找条目';
export const KNOWLEDGE_SEARCH = '查找';
export const KNOWLEDGE_SEARCH_NONE = '没有名称含这些字词的条目。';
/** On each item: a candidate that updates exactly this item, whichever page it was found on. */
export const KNOWLEDGE_PROPOSE_FOR_ITEM = '提议修改…';

/** An item's earlier revisions, read when the editor opens them. */
export function knowledgeRevisionsSummary(count: number): string {
  return `历次版本（${count}）`;
}

/** A review that discloses more conflicts than it lists says how many more there are. */
export function knowledgeConflictsMoreLine(shown: number, total: number): string | null {
  return total > shown ? `另有 ${total - shown} 处冲突未列出。` : null;
}

/** What the manuscript's selection menu offers for each Series the Book is in. */
export function knowledgeMenuLabel(seriesTitle: string): string {
  return `提议为书系「${seriesTitle}」的知识…`;
}
export const KNOWLEDGE_MENU_GROUP = '书系';
export const KNOWLEDGE_MENU_NOTE = '候选项在书系里经过纳入审阅，才会成为书系知识。';

/** The item a candidate proposes: a new one by name and class, or an existing one and the version it was written against. */
export function knowledgeTargetLine(candidate: Pick<SeriesKnowledgeCandidateProjection, 'target'>): string {
  const { target } = candidate;
  if (target.kind === 'new') return `新条目「${target.subject}」（${target.classLabel}）`;
  return `更新「${target.subject}」（${target.classLabel}，基于第 ${target.baseRevisionOrdinal ?? '?'} 版）`;
}

/**
 * Where a candidate or revision came from: the editor's own words, or a member Book's manuscript at an exact revision — or,
 * when changes waited in the journal beyond that revision, the manuscript as it then stood (Issue #63 review), since the words
 * may come from those changes.
 */
export function knowledgeProvenanceLine(provenance: SeriesKnowledgeProvenanceProjection | null): string {
  if (provenance === null) return '编辑撰写';
  if (provenance.uncheckpointed) {
    return `来自《${provenance.bookTitle}》的稿件（${provenance.revisionLabel} 之后另有尚未保存为修订版的改动）：「${provenance.quote}」`;
  }
  return `来自《${provenance.bookTitle}》${provenance.revisionLabel} 的原文：「${provenance.quote}」`;
}

/** An item as the list heads it: its name, class and current version. */
export function knowledgeItemLine(item: { readonly subject: string; readonly classLabel: string; readonly current: Pick<SeriesKnowledgeRevisionProjection, 'ordinal'> }): string {
  return `「${item.subject}」 · ${item.classLabel} · 第 ${item.current.ordinal} 版`;
}

/** One revision in an item's history. */
export function knowledgeRevisionLine(revision: Pick<SeriesKnowledgeRevisionProjection, 'ordinal' | 'outcome' | 'content'>): string {
  return `第 ${revision.ordinal} 版 · ${revision.outcome === 'created' ? '纳入' : '更新'}：${revision.content}`;
}

/** The conflicts a revision keeps, never a verification (SER-016). */
export function knowledgeKeptConflictsLine(count: number): string | null {
  return count === 0 ? null : `保留了 ${count} 处已披露冲突，未作核实。`;
}

/** Where a revision may later be used. */
export function knowledgeReuseLine(revision: Pick<SeriesKnowledgeRevisionProjection, 'reuseLabel'>): string {
  return `以后的用途：${revision.reuseLabel}`;
}

/** The review's identity line (SER-015): the exact Series and item. */
export function knowledgeReviewIdentity(review: Pick<SeriesKnowledgeReviewProjection, 'seriesTitle' | 'candidate'>): string {
  const { target } = review.candidate;
  return target.kind === 'new'
    ? `书系「${review.seriesTitle}」 · 新条目「${target.subject}」（${target.classLabel}）`
    : `书系「${review.seriesTitle}」 · 条目「${target.subject}」（${target.classLabel}）`;
}

/** The current revision a promotion would supersede. */
export function knowledgeSupersededLine(current: Pick<SeriesKnowledgeRevisionProjection, 'ordinal' | 'content'>): string {
  return `将被取代的当前版本：第 ${current.ordinal} 版 · ${current.content}`;
}

/** Why `纳入书系知识` waits, or `null` when it may go (SER-015, SER-016). */
export function knowledgePromoteWaits(review: Pick<SeriesKnowledgeReviewProjection, 'conflictCount' | 'blocked'>, reuseChosen: boolean, preserved: boolean): string | null {
  if (review.blocked !== null) return review.blocked;
  if (review.conflictCount > 0 && !preserved) return KNOWLEDGE_WAIT_CONFLICT;
  if (!reuseChosen) return KNOWLEDGE_WAIT_REUSE;
  return null;
}
