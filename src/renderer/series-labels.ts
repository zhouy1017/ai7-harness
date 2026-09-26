import type {
  SeriesImpactGroupProjection,
  SeriesMemberProjection,
  SeriesMembershipChangeProjection,
  SeriesMembershipPreviewProjection,
  SeriesSummaryProjection,
} from '../shared/protocol.js';

/**
 * 书系's words (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012): the list, 新建书系, 成员与共享范围 with its members and
 * change records, the four-part impact preview, and a Book's own 书系 line. Pure, so the unit suite pins every one.
 */

export const SERIES_TITLE = '书系';
export const SERIES_LEDE = '书系把相关的图书放在一起。加入书系只让以后的任务可以明确选用书系的范围：不会让一本书读到另一本书的原文，也不会自动授权任何任务。';
export const SERIES_EMPTY = '还没有书系。';
export const SERIES_CREATE_OPEN = '新建书系…';
export const SERIES_CREATE = '新建书系';
export const SERIES_CANCEL = '取消';
export const SERIES_NAME_LABEL = '书系名称';
export const SERIES_NOTE_LABEL = '说明（可选）';
export const SERIES_MEMBERS_HEADING = '成员与共享范围';
/** SER-001: membership is a scope for later explicit selection, and the page is no reader of the members' manuscripts. */
export const SERIES_SCOPE_NOTE = '成员只表示以后的任务可以明确选用这个书系的范围；这里不汇总、也不打开成员图书的原文。';
export const SERIES_MEMBERS_EMPTY = '书系里还没有图书。';
export const SERIES_MEMBER_COLUMNS = ['图书', '作者', '责编', '加入时间', '书系一致性审阅', '操作'] as const;
export const SERIES_ADD_OPEN = '加入书系…';
export const SERIES_REMOVE_OPEN = '移出书系…';
export const SERIES_ADD_NONE = '所有图书都已在这个书系中。';
/** In place of that when the house holds no Book at all (Issue #63 review): a fresh install may create a 书系 first. */
export const SERIES_ADD_NO_BOOKS = '书库里还没有图书；导入或新建图书后，才能加入书系。';
/** 加入书系…'s search over titles, and what it says when nothing matches (Issue #63 review). */
export const SERIES_ADD_SEARCH_LABEL = '查找书名';
export const SERIES_ADD_SEARCH = '查找';
export const SERIES_ADD_NO_MATCH = '没有书名含这些字词、可以加入的图书。';
/** Each list's next page (Issue #63 review): every Series, member, Book and record is reachable, however many there are. */
export const SERIES_LIST_MORE = '更多书系…';
export const SERIES_MEMBERS_MORE = '更多成员…';
export const SERIES_ADD_MORE = '更多图书…';
export const SERIES_HISTORY_MORE = '更早的记录…';
export const SERIES_ADD_LEGEND = '选择要加入的图书';
export const SERIES_PREVIEW_ACTION = '查看影响';
export const SERIES_REFRESH = '重新查看影响';
export const SERIES_HISTORY_HEADING = '成员变更记录';
export const SERIES_HISTORY_EMPTY = '还没有成员变更。';
export const SERIES_HISTORY_IMPACT = '当时显示的影响';
export const SERIES_BACK_TO_LIST = '返回书系';
export const BOOK_SERIES_HEADING = '书系';
export const BOOK_SERIES_NONE = '不在任何书系中。';
export const BOOK_SERIES_HISTORY = '书系成员变更记录';
export const SERIES_CHANGES_LABEL = '会变化';
export const SERIES_UNCHANGED_LABEL = '保持不变';
export const SERIES_NO_CHANGE = '没有变化。';
export const SERIES_STATUS = {
  loading: '正在读取书系…',
  opened: '书系已打开',
  unavailable: '无法读取书系。',
  creating: '正在新建书系…',
  previewing: '正在计算影响…',
  committing: '正在记录成员变更…',
  loadingMore: '正在读取更多…',
  failed: '无法完成。',
} as const;

/** One Series in the list: its name and how many Books it holds now. */
export function seriesListLine(series: Pick<SeriesSummaryProjection, 'title' | 'memberCount'>): string {
  return `书系「${series.title}」 · 成员 ${series.memberCount} 本`;
}

/** 书系一致性审阅 for one member: when it last ran, or that it has not. */
export function seriesConsistencyLine(member: Pick<SeriesMemberProjection, 'seriesConsistencyReview'>, instant: (iso: string) => string): string {
  return member.seriesConsistencyReview === null ? '尚未审阅' : `审阅于 ${instant(member.seriesConsistencyReview.reviewedAt)}`;
}

/** A list of names, or 未填写. */
export function seriesPeopleLine(names: ReadonlyArray<string>): string {
  return names.length === 0 ? '未填写' : names.join('、');
}

/** The preview's heading, naming what it would do. */
export function seriesPreviewHeading(preview: Pick<SeriesMembershipPreviewProjection, 'actionLabel'>): string {
  return `${preview.actionLabel}的影响`;
}

/** SER-003: the preview starts from the exact Book and Series. */
export function seriesPreviewIdentity(preview: Pick<SeriesMembershipPreviewProjection, 'bookTitle' | 'seriesTitle'>): string {
  return `图书《${preview.bookTitle}》 · 书系「${preview.seriesTitle}」`;
}

/** One consequence group as a line of text, for the change record's disclosure and for a screen reader's summary. */
export function seriesImpactGroupLine(group: SeriesImpactGroupProjection): string {
  const changes = group.changes.length === 0 ? SERIES_NO_CHANGE : group.changes.join('');
  return `${group.title}：${SERIES_CHANGES_LABEL}——${changes}${SERIES_UNCHANGED_LABEL}——${group.unchanged.join('')}`;
}

/** One Series Membership Change Record, as the Series lists it: the change and the Book. */
export function seriesChangeLine(change: Pick<SeriesMembershipChangeProjection, 'label' | 'bookTitle'>): string {
  return `${change.label} · 《${change.bookTitle}》`;
}

/** The same record as the Book lists it: the change and the Series. */
export function bookSeriesChangeLine(change: Pick<SeriesMembershipChangeProjection, 'label' | 'seriesTitle'>): string {
  return `${change.label}「${change.seriesTitle}」`;
}

/** Who made a change and when. */
export function seriesChangeByline(change: Pick<SeriesMembershipChangeProjection, 'actor' | 'recordedAt'>, instant: (iso: string) => string): string {
  return `${change.actor} · ${instant(change.recordedAt)}`;
}

/** What a Book's 工作概览 says of the Series beyond those it names: each is reached from 书系. */
export function bookSeriesMoreLine(count: number): string {
  return `还在另外 ${count} 个书系中，可以在「书系」里查看。`;
}

/** A Series the Book is in now, and since when. */
export function bookSeriesMembershipLine(membership: { readonly title: string; readonly joinedAt: string }, instant: (iso: string) => string): string {
  return `书系「${membership.title}」 · ${instant(membership.joinedAt)} 加入`;
}
