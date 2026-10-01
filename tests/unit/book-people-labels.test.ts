import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/book-people-labels.js';
import { BUILTIN_BOOK_PEOPLE_ROLES } from '../../src/service/book-people.js';

// The words of 作者 · 责编 · 相关人 (Issue #431, plan slice S83; V2-UX-BOOK-006, IA-008), byte for byte, and the house's role
// list as configuration.

describe('the words of 人员', () => {
  it('names the fields, the form and what the people are for', () => {
    expect(labels.BOOK_PEOPLE_HEADING).toBe('人员');
    expect(labels.BOOK_PEOPLE_FIELD_LABELS).toEqual({ authors: '作者', editors: '责编', related: '相关人' });
    expect(labels.BOOK_PEOPLE_EMPTY).toBe('未填写');
    expect(labels.BOOK_PEOPLE_NOTE).toBe('作者与责编用于标注和查找这本书，也是之后反馈与学习记录的归属；它们不是账号，也不决定谁能做什么。');
    expect(labels.BOOK_PEOPLE_ACTION_LABELS).toEqual({ edit: '编辑人员…', save: '保存人员', cancel: '取消', addRelated: '添加相关人', removeRelated: '移除' });
    expect(labels.BOOK_PEOPLE_NAMES_HINT).toBe('多个名字用「、」隔开；每个名字最多 40 个字。');
    expect([labels.BOOK_PEOPLE_ROLE_LABEL, labels.BOOK_PEOPLE_NAME_LABEL, labels.BOOK_PEOPLE_RELATED_NONE]).toEqual(['角色', '名字', '还没有相关人。']);
    expect(labels.BOOK_PEOPLE_BLOCKERS).toEqual({ names: '每个名字 1–40 个字，不含逗号或换行，且不重复。', related: '每位相关人都要选角色、填名字。' });
    expect(labels.BOOK_PEOPLE_STATUS_LINES).toEqual({ saving: '正在保存人员…', saveFailed: '未能保存人员。' });
    expect(labels.bookPeopleNamesOf(' 周一、吴二，郑三,,  ')).toEqual(['周一', '吴二', '郑三']);
    expect(labels.bookPeopleNamesLine(['周一', '吴二'])).toBe('周一、吴二');
    expect(labels.bookPeopleNamesLine([])).toBe('未填写');
    expect(labels.bookPeopleRelatedLine([{ roleLabel: '校对', name: '王四' }, { roleLabel: '美编', name: '冯五' }])).toBe('校对 王四；美编 冯五');
    expect(labels.bookPeopleRecordedLine({ version: 0, recordedAt: null }, null)).toBe('尚未填写作者、责编和相关人。');
    expect(labels.bookPeopleRecordedLine({ version: 2, recordedAt: 'x' }, '9月24日 23:00')).toBe('第 2 次保存 · 9月24日 23:00');
  });

  it('shows the people on a card and names what the library search found', () => {
    const people = { authors: ['周一', '吴二'], editors: ['郑三'], related: [{ roleLabel: '校对', name: '王四' }] };
    expect(labels.bookCardPeopleLine(people)).toBe('作者：周一、吴二 · 责编：郑三');
    expect(labels.bookCardPeopleLine({ ...people, authors: [] })).toBe('责编：郑三');
    expect(labels.bookCardPeopleLine({ authors: [], editors: [], related: [] })).toBeNull();
    expect(labels.bookCardRelatedLine(people)).toBe('相关人：校对 王四');
    expect(labels.bookCardRelatedLine({ ...people, related: [] })).toBeNull();
    expect(labels.BOOK_FILTER_LEGEND).toBe('查找图书');
    expect(labels.BOOK_FILTER_FIELDS).toEqual({ all: '全部', title: '书名', author: '作者', editor: '责编', series: '书系' });
    expect([labels.BOOK_FILTER_FIELD_LABEL, labels.BOOK_FILTER_TEXT_LABEL]).toEqual(['查找范围', '字词']);
    expect(labels.BOOK_FILTER_ACTIONS).toEqual({ find: '查找', clear: '显示全部图书' });
    expect(labels.BOOK_FILTER_NONE).toBe('没有找到符合的图书。');
    expect(labels.bookFilterLine({ field: 'author', text: '吴二' })).toBe('按作者查找「吴二」');
    expect(labels.bookFilterLine({ field: 'all', text: '郑' })).toBe('按书名、作者、责编或书系查找「郑」');
    expect(labels.BOOK_FILTER_STATUS_LINES).toEqual({ finding: '正在查找图书…', found: '已列出找到的图书', findFailed: '无法查找图书。', cleared: '已显示全部图书' });
  });

  it('keeps the house\'s role list as configuration: 校对 / 美编 / 译者 / 外审专家 / 作者经纪 / 营销 / 其他', () => {
    expect(BUILTIN_BOOK_PEOPLE_ROLES.schema).toBe('ai7.book-people-roles/1');
    expect(BUILTIN_BOOK_PEOPLE_ROLES.version).toBe('1');
    expect(BUILTIN_BOOK_PEOPLE_ROLES.roles.map((role) => role.label)).toEqual(['校对', '美编', '译者', '外审专家', '作者经纪', '营销', '其他']);
  });
});
