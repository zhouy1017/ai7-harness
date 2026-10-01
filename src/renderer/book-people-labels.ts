import {
  BOOK_PEOPLE_NAME_SEPARATOR,
  MAX_BOOK_PERSON_NAME_CHARACTERS,
  type BookPeopleProjection,
  type BookSummaryFilter,
  type BookSummaryProjection,
} from '../shared/protocol.js';

/**
 * Every word of 作者 · 责编 · 相关人 (Issue #431, plan slice S83; V2-UX-BOOK-006, IA-008) on 工作概览 and in 书库. Authors
 * and editors are attribution dimensions, never accounts or permissions, and the words say so once. Pure, so the unit
 * suite pins every string byte for byte.
 */

export const BOOK_PEOPLE_HEADING = '人员';
export const BOOK_PEOPLE_FIELD_LABELS = { authors: '作者', editors: '责编', related: '相关人' } as const;
export const BOOK_PEOPLE_EMPTY = '未填写';
export const BOOK_PEOPLE_NOTE = '作者与责编用于标注和查找这本书，也是之后反馈与学习记录的归属；它们不是账号，也不决定谁能做什么。';
export const BOOK_PEOPLE_ACTION_LABELS = {
  edit: '编辑人员…',
  save: '保存人员',
  cancel: '取消',
  addRelated: '添加相关人',
  removeRelated: '移除',
} as const;
export type BookPeopleAction = keyof typeof BOOK_PEOPLE_ACTION_LABELS;

export const BOOK_PEOPLE_NAMES_HINT = `多个名字用「${BOOK_PEOPLE_NAME_SEPARATOR}」隔开；每个名字最多 ${MAX_BOOK_PERSON_NAME_CHARACTERS} 个字。`;
export const BOOK_PEOPLE_ROLE_LABEL = '角色';
export const BOOK_PEOPLE_NAME_LABEL = '名字';
export const BOOK_PEOPLE_RELATED_NONE = '还没有相关人。';

export const BOOK_PEOPLE_BLOCKERS = {
  names: `每个名字 1–${MAX_BOOK_PERSON_NAME_CHARACTERS} 个字，不含逗号或换行，且不重复。`,
  related: '每位相关人都要选角色、填名字。',
} as const;

export const BOOK_PEOPLE_STATUS_LINES = {
  saving: '正在保存人员…',
  saveFailed: '未能保存人员。',
} as const;

/** Several names in one field, split the way the editor types them: 「、」, and also a comma. */
export function bookPeopleNamesOf(value: string): string[] {
  return value.split(/[、,，]/u).map((name) => name.trim()).filter((name) => name.length > 0);
}

/** `周一、吴二`, or `未填写`. */
export function bookPeopleNamesLine(names: ReadonlyArray<string>): string {
  return names.length === 0 ? BOOK_PEOPLE_EMPTY : names.join(BOOK_PEOPLE_NAME_SEPARATOR);
}

/** `校对 王四；美编 冯五`, or `未填写`. */
export function bookPeopleRelatedLine(related: ReadonlyArray<{ roleLabel: string; name: string }>): string {
  return related.length === 0 ? BOOK_PEOPLE_EMPTY : related.map((person) => `${person.roleLabel} ${person.name}`).join('；');
}

/** When they were last saved, or that they were never. */
export function bookPeopleRecordedLine(people: Pick<BookPeopleProjection, 'version' | 'recordedAt'>, recordedAt: string | null): string {
  return people.version === 0 || recordedAt === null ? '尚未填写作者、责编和相关人。' : `第 ${people.version} 次保存 · ${recordedAt}`;
}

// ---- 书库 --------------------------------------------------------------------------------------------------------

/** The card's line of 作者 and 责编: `作者：周一、吴二 · 责编：郑三`; `null` when neither is filled. */
export function bookCardPeopleLine(people: BookSummaryProjection['people']): string | null {
  const parts = [
    ...(people.authors.length === 0 ? [] : [`${BOOK_PEOPLE_FIELD_LABELS.authors}：${people.authors.join(BOOK_PEOPLE_NAME_SEPARATOR)}`]),
    ...(people.editors.length === 0 ? [] : [`${BOOK_PEOPLE_FIELD_LABELS.editors}：${people.editors.join(BOOK_PEOPLE_NAME_SEPARATOR)}`]),
  ];
  return parts.length === 0 ? null : parts.join(' · ');
}

/** The card's line of 相关人: `相关人：校对 王四；美编 冯五`; `null` when there is none. */
export function bookCardRelatedLine(people: BookSummaryProjection['people']): string | null {
  return people.related.length === 0 ? null : `${BOOK_PEOPLE_FIELD_LABELS.related}：${bookPeopleRelatedLine(people.related)}`;
}

export const BOOK_FILTER_LEGEND = '查找图书';
export const BOOK_FILTER_FIELDS: Readonly<Record<BookSummaryFilter['field'], string>> = { all: '全部', title: '书名', author: '作者', editor: '责编', series: '书系' };
export const BOOK_FILTER_FIELD_LABEL = '查找范围';
export const BOOK_FILTER_TEXT_LABEL = '字词';
export const BOOK_FILTER_ACTIONS = { find: '查找', clear: '显示全部图书' } as const;
export const BOOK_FILTER_NONE = '没有找到符合的图书。';

/** What the list shows now: `按作者查找「吴二」`. */
export function bookFilterLine(filter: BookSummaryFilter): string {
  return filter.field === 'all' ? `按书名、作者、责编或书系查找「${filter.text}」` : `按${BOOK_FILTER_FIELDS[filter.field]}查找「${filter.text}」`;
}

export const BOOK_FILTER_STATUS_LINES = {
  finding: '正在查找图书…',
  found: '已列出找到的图书',
  findFailed: '无法查找图书。',
  cleared: '已显示全部图书',
} as const;
