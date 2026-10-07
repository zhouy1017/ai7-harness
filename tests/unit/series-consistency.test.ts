import { describe, expect, it } from 'vitest';
import { graphemeCount } from '../../src/service/analysis/factual-review-contract.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryBasisStatement,
  reviewCategoryContractInput,
  type ReviewCategoryConfigurationEntry,
} from '../../src/service/review/category-configuration.js';
import { reviewCategoryContract, reviewCategoryContractDigest } from '../../src/service/review/review-category-contract.js';
import { houseGuidelineRefusal } from '../../src/service/review/review-runs.js';
import {
  MAX_SERIES_KNOWLEDGE_CLAUSES,
  SERIES_CONSISTENCY_NO_SERIES_REASON,
  SERIES_CONSISTENCY_TOO_MANY_REASON,
  foldSeriesKnowledgeContent,
  seriesConsistencyEntry,
  seriesConsistencyFromSources,
  seriesConsistencyNoKnowledgeReason,
  seriesKnowledgeItemClauses,
  seriesKnowledgePinsCurrent,
  type SeriesKnowledgeSource,
} from '../../src/service/review/series-consistency.js';

// 书系一致性 resolved for one Book (Issue #64, plan slice S29a; V2-UX-REV-013): the clauses built from its Series' knowledge, the
// reasons it cannot be chosen, the pins a Run freezes, and the contract those clauses make.

const HOUSE = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.categoryId === 'series-consistency')!;

function source(seriesId: string, title: string, items: Array<[subject: string, content: string, ordinal?: number]>): SeriesKnowledgeSource {
  return {
    seriesId,
    title,
    items: items.map(([subject, content, ordinal = 1], index) => ({
      itemId: `${seriesId}-item-${index}`, subject, knowledgeClass: 'characters', revisionId: `${seriesId}-revision-${index}-${ordinal}`, ordinal, content,
    })),
  };
}

function entryOf(sources: SeriesKnowledgeSource[]): ReviewCategoryConfigurationEntry {
  return seriesConsistencyEntry(HOUSE, seriesConsistencyFromSources(sources.map(({ seriesId, title }) => ({ seriesId, title })), sources));
}

describe('a Series Knowledge revision as clauses', () => {
  it('folds the words onto one line', () => {
    expect(foldSeriesKnowledgeContent('  林默生于海边小城，\n\n他的年龄\t以第一部为准。\r\n ')).toBe('林默生于海边小城， 他的年龄 以第一部为准。');
  });

  it('is one clause led by the class and name while it fits, and numbered pieces once it does not', () => {
    expect(seriesKnowledgeItemClauses(3, { subject: '林默', knowledgeClass: 'characters', content: '生于海边小城。' }))
      .toEqual([{ clauseId: 'series-knowledge/3', text: '人物「林默」：生于海边小城。' }]);
    const long = '甲'.repeat(700);
    const pieces = seriesKnowledgeItemClauses(1, { subject: '林默', knowledgeClass: 'characters', content: long });
    expect(pieces.map((piece) => piece.clauseId)).toEqual(['series-knowledge/1.1', 'series-knowledge/1.2', 'series-knowledge/1.3']);
    expect(pieces[0]!.text.startsWith('人物「林默」：甲')).toBe(true);
    expect(pieces.slice(1).every((piece) => piece.text.startsWith('人物「林默」（续）：甲'))).toBe(true);
    expect(pieces.every((piece) => graphemeCount(piece.text) <= 300)).toBe(true);
    // Nothing is lost between the pieces: their words are the revision's, in order.
    expect(pieces.map((piece) => piece.text.replace(/^人物「林默」(?:（续）)?：/u, '')).join('')).toBe(long);
  });

  it('cuts by grapheme, so a joined emoji or a combining mark is never split', () => {
    const family = '👨‍👩‍👧';
    const pieces = seriesKnowledgeItemClauses(1, { subject: '家', knowledgeClass: 'canon', content: family.repeat(400) });
    expect(pieces.every((piece) => graphemeCount(piece.text) <= 300 && piece.text.isWellFormed())).toBe(true);
    expect(pieces.map((piece) => piece.text.replace(/^正典设定「家」(?:（续）)?：/u, '')).join('')).toBe(family.repeat(400));
  });

  it('gives the longest item the contract will take a valid frozen contract', () => {
    const entry = entryOf([source('s', '书'.repeat(40), [['名'.repeat(40), '字'.repeat(2000)]])]);
    expect(entry.executor).toBe('review-category-contract');
    expect(() => reviewCategoryContract(reviewCategoryContractInput(entry))).not.toThrow();
  });
});

describe('one Book\'s 书系一致性', () => {
  it('orders the Series and their items by name and counts items across all of them', () => {
    const entry = entryOf([source('b', 'B书系', [['周', '周的设定。']]), source('a', 'A书系', [['王', '王的设定。'], ['吴', '吴的设定。']])]);
    const clauses = reviewCategoryContractInput(entry).clauses;
    // Code-unit order, as the database orders names.
    expect(clauses).toEqual([
      { clauseId: 'series-knowledge/1', text: '人物「吴」：吴的设定。' },
      { clauseId: 'series-knowledge/2', text: '人物「王」：王的设定。' },
      { clauseId: 'series-knowledge/3', text: '人物「周」：周的设定。' },
    ]);
    expect(entry.seriesKnowledge!.series.map((series) => series.title)).toEqual(['A书系', 'B书系']);
    expect(entry.seriesKnowledge!.revisions.map((revision) => revision.itemId)).toEqual(['a-item-1', 'a-item-0', 'b-item-0']);
    // REV-013: the basis names each Series and the exact revision of each item it gave.
    expect(reviewCategoryBasisStatement(entry))
      .toBe('依据：书系「A书系」的书系知识：人物「吴」第 1 版、人物「王」第 1 版；书系「B书系」的书系知识：人物「周」第 1 版 · 工序：书系一致性检查（第 1 版） · 不使用搜索引擎');
  });

  it('says why it cannot be chosen: no Series, no knowledge taken in for it, or more clauses than one review carries', () => {
    expect(entryOf([])).toMatchObject({ executor: 'unavailable', unavailableReason: SERIES_CONSISTENCY_NO_SERIES_REASON, guidelineDocuments: [] });
    expect(entryOf([source('a', '星河三部曲', [])]).unavailableReason).toBe('书系「星河三部曲」还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。');
    expect(entryOf([source('a', '甲', []), source('b', '乙', [])]).unavailableReason).toBe('这本书所在的书系「乙」、「甲」都还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。');
    expect(seriesConsistencyNoKnowledgeReason(['甲', '乙', '丙'], 52)).toBe('这本书所在的 52 个书系，包括「甲」、「乙」、「丙」，都还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。');
    const items = (count: number): Array<[string, string]> => Array.from({ length: count }, (_value, index) => [`条目${String(index).padStart(2, '0')}`, `内容${index}`]);
    expect(entryOf([source('a', '甲', items(MAX_SERIES_KNOWLEDGE_CLAUSES))]).executor).toBe('review-category-contract');
    expect(entryOf([source('a', '甲', items(MAX_SERIES_KNOWLEDGE_CLAUSES + 1))]).unavailableReason)
      .toBe('这本书所在书系的书系知识超过 40 条审阅依据，一次审阅带不下，暂不能选；请在书系中合并或精简这些书系知识。');
    // One long item counts every piece it is cut into.
    expect(entryOf([source('a', '甲', [...items(38), ['长', '长'.repeat(600)]])]).unavailableReason).toBe(SERIES_CONSISTENCY_TOO_MANY_REASON);
    expect(entryOf([source('a', '甲', [...items(37), ['长', '长'.repeat(600)]])]).executor).toBe('review-category-contract');
  });

  it('leaves out an item whose words fold to nothing, and gives no clause number to it', () => {
    // C0 controls only: the folded words are empty, so the item has no clause to give the review.
    expect(seriesKnowledgeItemClauses(1, { subject: '空', knowledgeClass: 'canon', content: '\u0001\u0002\u0007' })).toEqual([]);
    const alone = entryOf([source('a', '星河三部曲', [['空', '\u0001\u0002']])]);
    expect([alone.executor, alone.unavailableReason]).toEqual(['unavailable', '书系「星河三部曲」还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。']);
    const beside = entryOf([source('a', '甲', [['吴', '吴的设定。'], ['空', '\u0001'], ['王', '王的设定。']])]);
    expect(reviewCategoryContractInput(beside).clauses.map((clause) => clause.clauseId)).toEqual(['series-knowledge/1', 'series-knowledge/2']);
    expect(beside.seriesKnowledge!.revisions.map((revision) => revision.itemId)).toEqual(['a-item-0', 'a-item-2']);
    expect(() => reviewCategoryContract(reviewCategoryContractInput(beside))).not.toThrow();
  });

  it('pins each Series and revision it used, and is current only while exactly those stand', () => {
    const before = seriesConsistencyFromSources([{ seriesId: 'a', title: '甲' }], [source('a', '甲', [['吴', '吴的设定。']])]);
    expect(before.kind).toBe('available');
    if (before.kind !== 'available') return;
    expect(before.pins).toEqual({
      series: [{ seriesId: 'a', title: '甲' }],
      revisions: [{ seriesId: 'a', itemId: 'a-item-0', revisionId: 'a-revision-0-1', ordinal: 1, digest: expect.stringMatching(/^[0-9a-f]{64}$/u) }],
    });
    expect(seriesKnowledgePinsCurrent(before.pins, before)).toBe(true);
    // A new revision with the very same words is still another revision.
    expect(seriesKnowledgePinsCurrent(before.pins, seriesConsistencyFromSources([{ seriesId: 'a', title: '甲' }], [source('a', '甲', [['吴', '吴的设定。', 2]])]))).toBe(false);
    // So is a membership in another Series, even one that gives nothing.
    expect(seriesKnowledgePinsCurrent(before.pins, seriesConsistencyFromSources([{ seriesId: 'a', title: '甲' }, { seriesId: 'b', title: '乙' }],
      [source('a', '甲', [['吴', '吴的设定。']]), source('b', '乙', [])]))).toBe(false);
    expect(seriesKnowledgePinsCurrent(before.pins, seriesConsistencyFromSources([], []))).toBe(false);
  });

  it('makes a new contract from new words and the same contract from the same words, whatever their identities', () => {
    const digest = (entry: ReviewCategoryConfigurationEntry): string => reviewCategoryContractDigest(reviewCategoryContract(reviewCategoryContractInput(entry)));
    const first = digest(entryOf([source('a', '甲', [['吴', '吴的设定。']])]));
    expect(digest(entryOf([source('z', '甲', [['吴', '吴的设定。', 3]])]))).toBe(first);
    expect(digest(entryOf([source('a', '甲', [['吴', '吴的设定改了。']])]))).not.toBe(first);
  });

  it('holds the Series Knowledge back from a live model as the house\'s own text, and sends it under development-ci', () => {
    const entry = entryOf([source('a', '星河三部曲', [['吴', '吴的设定。']])]);
    expect(houseGuidelineRefusal(entry, false)).toBeNull();
    expect(houseGuidelineRefusal(entry, true))
      .toBe('这一类以书系「星河三部曲」的书系知识审阅；开发者实时模式下，本社的书系知识在获准发给模型之前不会发出，这一类暂不能开始。');
  });
});
