import { describe, expect, it } from 'vitest';
import {
  SERIES_LEDE,
  SERIES_MEMBER_COLUMNS,
  SERIES_SCOPE_NOTE,
  bookSeriesChangeLine,
  bookSeriesMembershipLine,
  seriesChangeByline,
  seriesChangeLine,
  seriesConsistencyLine,
  seriesImpactGroupLine,
  seriesListLine,
  seriesPeopleLine,
  seriesPreviewHeading,
  seriesPreviewIdentity,
} from '../../src/renderer/series-labels.js';
import {
  SERIES_IMPACT_GROUPS,
  seriesLearningFacts,
  seriesConsistencyWaitingReason,
  seriesMemberAbsent,
  seriesMemberAlready,
  seriesMembershipImpact,
  seriesNote,
  seriesPreviewDigest,
  seriesTitle,
} from '../../src/service/series.js';

// Unit suite for 书系 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012): the names a Series may take, the four groups of
// the Series Membership Impact Preview in their fixed order with what changes and what stays, the digest that moves with any
// line or the chain, and every line the pages state. Every name is the suite's own.

const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;
const facts = { seriesTitle: '星河三部曲', bookTitle: '星河之一', seriesScopedRuns: 0, learningMaterials: 0, learningDecided: 0 };

describe('书系 names', () => {
  it('keeps a name on one line within forty characters, trimmed and with its spaces collapsed', () => {
    expect(seriesTitle('  星河  三部曲 ')).toBe('星河 三部曲');
    expect(seriesTitle('星'.repeat(40))).toBe('星'.repeat(40));
    for (const value of ['', '   ', '星'.repeat(41), '星河\n三部曲', '星河\u0007', 7, null]) expect(seriesTitle(value), String(value)).toBeNull();
  });

  it('keeps an empty 说明 as empty, and refuses one past five hundred characters', () => {
    expect(seriesNote('')).toBe('');
    expect(seriesNote('  ')).toBe('');
    expect(seriesNote(' 三部长篇 ')).toBe('三部长篇');
    expect(seriesNote('说'.repeat(500))).toBe('说'.repeat(500));
    expect(seriesNote('说'.repeat(501))).toBeNull();
    expect(seriesNote(undefined)).toBeNull();
  });
});

describe('the Series Membership Impact Preview', () => {
  it('keeps the four groups in their fixed order, never compressed into one', () => {
    expect(SERIES_IMPACT_GROUPS.map((group) => group.title)).toEqual(['未来任务', '已授权或正在运行', '书系知识与学习', '历史记录']);
    for (const kind of ['add', 'remove'] as const) {
      expect(seriesMembershipImpact(kind, facts).map((group) => group.key)).toEqual(['future-tasks', 'runs', 'knowledge-learning', 'history']);
    }
  });

  it('changes only later explicit selection, and says what stays as it is', () => {
    const add = seriesMembershipImpact('add', facts);
    expect(add[0]!.changes).toEqual(['以后新建任务时，可以明确选用书系「星河三部曲」的范围，其中会包括《星河之一》。']);
    expect(add[0]!.unchanged.join('')).toContain('不会把《星河之一》自动加进任何任务');
    expect(add[1]!.changes).toEqual([]);
    expect(add[2]!.changes).toEqual([]);
    const remove = seriesMembershipImpact('remove', facts);
    expect(remove[0]!.changes).toEqual(['以后新建任务时，书系「星河三部曲」的范围不再包括《星河之一》。']);
    expect(remove[1]!.unchanged).toContain('已经冻结的任务范围不会因移出而改变，任务也不会被取消。');
  });

  it('counts the Book\'s Learning Material, and those the editor has decided whatever the choice', () => {
    expect(seriesLearningFacts([])).toEqual({ learningMaterials: 0, learningDecided: 0 });
    expect(seriesLearningFacts([{ state: 'pending' }, { state: 'decided' }, { state: 'changed' }, { state: 'deferred' }, { state: 'decided' }]))
      .toEqual({ learningMaterials: 5, learningDecided: 2 });
  });

  it('names the Runs with a frozen Series scope and the Book\'s Learning Material by count', () => {
    const named = seriesMembershipImpact('add', { ...facts, seriesScopedRuns: 2, learningMaterials: 5, learningDecided: 3 });
    expect(named[1]!.unchanged[0]).toBe('2 个使用书系「星河三部曲」范围的任务已授权或正在运行。');
    expect(named[2]!.unchanged[0]).toBe('《星河之一》有 5 项学习材料，其中 3 项已决定学习准入。');
  });

  it('moves its digest with the change, the chain it follows and any line it shows', () => {
    const groups = seriesMembershipImpact('add', facts);
    const base = { seriesId: 'series', bookId: 'book', kind: 'add' as const, chainHead: null, groups };
    const digest = seriesPreviewDigest(base);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(seriesPreviewDigest({ ...base })).toBe(digest);
    expect(seriesPreviewDigest({ ...base, chainHead: 'change' })).not.toBe(digest);
    expect(seriesPreviewDigest({ ...base, kind: 'remove' })).not.toBe(digest);
    expect(seriesPreviewDigest({ ...base, bookId: 'other' })).not.toBe(digest);
    expect(seriesPreviewDigest({ ...base, groups: seriesMembershipImpact('add', { ...facts, learningMaterials: 1 }) })).not.toBe(digest);
  });

  it('refuses by name when the Book already is, or is not, a member, and tells a member Book why 书系一致性 still waits', () => {
    expect(seriesMemberAlready('星河之一', '星河三部曲')).toBe('《星河之一》已经在书系「星河三部曲」中。');
    expect(seriesMemberAbsent('星河之一', '星河三部曲')).toBe('《星河之一》不在书系「星河三部曲」中。');
    expect(seriesConsistencyWaitingReason(['星河三部曲'])).toBe('这本书已在书系「星河三部曲」中；书系知识接入审阅后才能选。');
    expect(seriesConsistencyWaitingReason(['甲', '乙'])).toBe('这本书已在书系「甲」、「乙」中；书系知识接入审阅后才能选。');
  });
});

describe('书系 words', () => {
  it('states what membership means, and that the page reads no member\'s text', () => {
    expect(SERIES_LEDE).toContain('不会让一本书读到另一本书的原文');
    expect(SERIES_SCOPE_NOTE).toContain('不汇总、也不打开成员图书的原文');
    expect(SERIES_MEMBER_COLUMNS).toEqual(['图书', '作者', '责编', '加入时间', '书系一致性审阅', '操作']);
  });

  it('writes the list, the member row, the preview and the records', () => {
    expect(seriesListLine({ title: '星河三部曲', memberCount: 2 })).toBe('书系「星河三部曲」 · 成员 2 本');
    expect(seriesConsistencyLine({ seriesConsistencyReview: null }, instant)).toBe('尚未审阅');
    expect(seriesConsistencyLine({ seriesConsistencyReview: { reviewedAt: '2026-09-25T08:00:00.000Z' } }, instant)).toBe('审阅于 〔2026-09-25〕');
    expect([seriesPeopleLine([]), seriesPeopleLine(['周一', '郑三'])]).toEqual(['未填写', '周一、郑三']);
    expect(seriesPreviewHeading({ actionLabel: '移出书系' })).toBe('移出书系的影响');
    expect(seriesPreviewIdentity({ bookTitle: '星河之一', seriesTitle: '星河三部曲' })).toBe('图书《星河之一》 · 书系「星河三部曲」');
    expect(seriesImpactGroupLine({ key: 'runs', title: '已授权或正在运行', changes: [], unchanged: ['甲。', '乙。'] }))
      .toBe('已授权或正在运行：会变化——没有变化。保持不变——甲。乙。');
    const change = { label: '加入书系' as const, bookTitle: '星河之一', seriesTitle: '星河三部曲', actor: '本机编辑' as const, recordedAt: '2026-09-25T08:00:00.000Z' };
    expect([seriesChangeLine(change), bookSeriesChangeLine(change), seriesChangeByline(change, instant)])
      .toEqual(['加入书系 · 《星河之一》', '加入书系「星河三部曲」', '本机编辑 · 〔2026-09-25〕']);
    expect(bookSeriesMembershipLine({ title: '星河三部曲', joinedAt: '2026-09-25T08:00:00.000Z' }, instant)).toBe('书系「星河三部曲」 · 〔2026-09-25〕 加入');
  });
});
