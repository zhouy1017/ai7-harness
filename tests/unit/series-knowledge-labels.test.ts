import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_NOTE,
  KNOWLEDGE_PROMOTE_NOTE,
  KNOWLEDGE_WAIT_CONFLICT,
  KNOWLEDGE_WAIT_REUSE,
  knowledgeItemLine,
  knowledgeKeptConflictsLine,
  knowledgeMenuLabel,
  knowledgePromoteWaits,
  knowledgeProvenanceLine,
  knowledgeReuseLine,
  knowledgeReviewIdentity,
  knowledgeRevisionLine,
  knowledgeSupersededLine,
  knowledgeTargetLine,
  KNOWLEDGE_CANDIDATES_MORE,
  KNOWLEDGE_ITEMS_MORE,
  KNOWLEDGE_PROPOSE_FOR_ITEM,
  KNOWLEDGE_REVISIONS_MORE,
  KNOWLEDGE_SEARCH,
  KNOWLEDGE_SEARCH_LABEL,
  KNOWLEDGE_SEARCH_NONE,
  knowledgeConflictsMoreLine,
  knowledgeRevisionsSummary,
} from '../../src/renderer/series-knowledge-labels.js';
import {
  knowledgeQuoteExcerpt,
  seriesKnowledgeConflicts,
  seriesKnowledgeContent,
  seriesKnowledgeReviewSummary,
  seriesKnowledgeSubject,
  seriesKnowledgeSubjectKey,
  type FoundConflict,
  type StoredCandidate,
  type StoredItem,
} from '../../src/service/series-knowledge.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { SERIES_KNOWLEDGE_CLASSES, SERIES_KNOWLEDGE_CLASS_LABELS, SERIES_KNOWLEDGE_REUSE_LABELS } from '../../src/shared/protocol.js';

// Unit suite for 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019): the classes and uses, the names an item may
// take, the conflicts found by identity alone — the same item or the same name, never what the words mean — the review's
// digest, and every line the Series page and the manuscript's menu state. Every word is the suite's own.

const seriesKnowledgeReviewDigest = (input: Omit<Parameters<typeof seriesKnowledgeReviewSummary>[0], 'conflicts'> & { conflicts: ReadonlyArray<Pick<FoundConflict, 'kind' | 'ref'>> }): string =>
  seriesKnowledgeReviewSummary({ ...input, conflicts: input.conflicts.map((entry) => ({ ...entry, line: '冲突行' })) }).digest;

const revision = (ordinal: number, content: string): StoredItem['current'] => ({
  revisionId: `revision-${ordinal}`, itemId: 'item', ordinal, content, authoring: 'editor', provenance: null, conflicts: [], reuseScope: 'series-tasks',
  candidateVersionId: `version-${ordinal}`, decisionId: `decision-${ordinal}`, outcome: ordinal === 1 ? 'created' : 'updated', recordedAt: '2026-09-25T00:00:00.000Z',
});
const item: StoredItem = { itemId: 'item', seriesId: 'series', subject: '林默', knowledgeClass: 'characters', createdAt: '2026-09-25T00:00:00.000Z', current: revision(2, '二版'), revisionCount: 2 };
const candidate = (candidateId: string, target: StoredCandidate['target'], content = '候选的话'): StoredCandidate => ({
  versionId: `${candidateId}-v1`, candidateId, version: 1, seriesId: 'series', target, content, authoring: 'editor', provenance: null, recordedAt: '2026-09-25T00:00:00.000Z', promoted: false,
});

describe('书系知识 names and classes', () => {
  it('offers the stable knowledge classes and the two later uses, in their fixed order', () => {
    expect(SERIES_KNOWLEDGE_CLASSES.map((entry) => SERIES_KNOWLEDGE_CLASS_LABELS[entry])).toEqual(['正典设定', '人物', '地点', '时间线', '术语', '连续性规则', '共同文风', '定位']);
    expect(Object.values(SERIES_KNOWLEDGE_REUSE_LABELS)).toEqual(['以后的书系范围任务都可以选用', '只用于书系一致性审阅']);
  });

  it('keeps an item name on one line within forty characters, and words within two thousand', () => {
    expect(seriesKnowledgeSubject(' 林  默 ')).toBe('林 默');
    for (const value of ['', '林\n默', '名'.repeat(41), 7]) expect(seriesKnowledgeSubject(value), String(value)).toBeNull();
    expect(seriesKnowledgeSubjectKey(' 林 默 ')).toBe(seriesKnowledgeSubjectKey('林默'));
    expect(seriesKnowledgeContent('第一行\n第二行')).toBe('第一行\n第二行');
    expect([seriesKnowledgeContent('   '), seriesKnowledgeContent('字'.repeat(2001))]).toEqual([null, null]);
  });
});

describe('书系知识 conflicts, by identity alone', () => {
  it('finds an item of the same name for a new one, however it is spaced, and nothing for another name', () => {
    const found = [...seriesKnowledgeConflicts(candidate('a', { kind: 'new', subject: '林 默', knowledgeClass: 'places' }), [item], [])];
    expect(found).toEqual([{ kind: 'existing-item', ref: 'revision-2', line: '书系知识里已有「林默」（人物）第 2 版。' }]);
    expect([...seriesKnowledgeConflicts(candidate('a', { kind: 'new', subject: '苏晴', knowledgeClass: 'characters' }), [item], [])]).toEqual([]);
  });

  it('finds a revision appended since an existing item was read, and not the one it was read at', () => {
    const read = (baseRevisionId: string): StoredCandidate['target'] => ({ kind: 'existing', itemId: 'item', subject: '林默', knowledgeClass: 'characters', baseRevisionId });
    expect([...seriesKnowledgeConflicts(candidate('a', read('revision-2')), [item], [])]).toEqual([]);
    expect([...seriesKnowledgeConflicts(candidate('a', read('revision-1')), [item], [])])
      .toEqual([{ kind: 'item-updated', ref: 'revision-2', line: '「林默」在提议之后已更新为第 2 版。' }]);
  });

  it('finds every other open candidate of the same item or name, and never the candidate itself', () => {
    const self = candidate('a', { kind: 'new', subject: '苏晴', knowledgeClass: 'characters' });
    const rival = candidate('b', { kind: 'new', subject: ' 苏 晴', knowledgeClass: 'places' }, '另一种说法');
    const unrelated = candidate('c', { kind: 'new', subject: '海城', knowledgeClass: 'places' });
    expect([...seriesKnowledgeConflicts(self, [], [self, rival, unrelated])])
      .toEqual([{ kind: 'competing-candidate', ref: 'b-v1', line: '另一个候选项也在提议「 苏 晴」（第 1 版）。' }]);
    const onItem = candidate('d', { kind: 'existing', itemId: 'item', subject: '林默', knowledgeClass: 'characters', baseRevisionId: 'revision-2' });
    const alsoOnItem = candidate('e', { kind: 'existing', itemId: 'item', subject: '林默', knowledgeClass: 'characters', baseRevisionId: 'revision-2' });
    expect([...seriesKnowledgeConflicts(onItem, [item], [onItem, alsoOnItem])].map((entry) => entry.kind)).toEqual(['competing-candidate']);
  });

  it('moves the review digest with the candidate\'s version, the current revision, any conflict and any blocker', () => {
    const base = { seriesId: 'series', candidateVersionId: 'a-v1', currentRevisionId: null, conflicts: [], blocked: null };
    const digest = seriesKnowledgeReviewDigest(base);
    expect(seriesKnowledgeReviewDigest({ ...base })).toBe(digest);
    for (const moved of [
      { ...base, candidateVersionId: 'a-v2' },
      { ...base, currentRevisionId: 'revision-2' },
      { ...base, conflicts: [{ kind: 'competing-candidate' as const, ref: 'b-v1' }] },
      { ...base, blocked: '已不在书系中' },
    ]) {
      expect(seriesKnowledgeReviewDigest(moved)).not.toBe(digest);
    }
  });
});

it('keeps the review digest byte-identical while consuming a single-pass conflict stream', () => {
  const conflicts: FoundConflict[] = Array.from({ length: 73 }, (_, index) => ({ kind: 'competing-candidate', ref: '版本-' + index, line: '冲突-' + index }));
  const base = { seriesId: '书系', candidateVersionId: '候选', currentRevisionId: null, blocked: '阻止原因' };
  const summary = seriesKnowledgeReviewSummary({ ...base, conflicts: conflicts.values() });
  expect(summary.digest).toBe(sha256Hex(canonicalJson({ ...base, schema: 'ai7.series-knowledge-review/1', conflicts: conflicts.map(({ kind, ref }) => ({ kind, ref })) })));
  expect(summary.count).toBe(73);
  expect(summary.preview).toEqual(conflicts.slice(0, 50));
});

describe('书系知识 words', () => {
  it('says what a candidate is not, and what taking it in does not do', () => {
    expect(KNOWLEDGE_NOTE).toContain('候选项不会被任何任务读取');
    expect(KNOWLEDGE_PROMOTE_NOTE).toContain('不授权读取、不发送给模型服务、不改稿件，也不决定学习准入');
    expect(knowledgeMenuLabel('星河三部曲')).toBe('提议为书系「星河三部曲」的知识…');
  });

  it('writes a candidate\'s item, where it came from, an item, its revisions and what it keeps', () => {
    const target = { kind: 'new' as const, itemId: null, subject: '林默', knowledgeClass: 'characters' as const, classLabel: '人物', baseRevisionOrdinal: null };
    expect(knowledgeTargetLine({ target })).toBe('新条目「林默」（人物）');
    expect(knowledgeTargetLine({ target: { ...target, kind: 'existing', itemId: 'item', baseRevisionOrdinal: 2 } })).toBe('更新「林默」（人物，基于第 2 版）');
    expect(knowledgeProvenanceLine(null)).toBe('编辑撰写');
    const cited = {
      kind: 'manuscript-revision' as const, bookId: 'book', bookTitle: '星河之一', manuscriptId: 'm', revisionId: 'r', revisionLabel: 'r3', journalSequence: 0,
      blockId: 'b', fromGrapheme: 0, toGrapheme: 4, quote: '海边小城', uncheckpointed: false,
    };
    expect(knowledgeProvenanceLine(cited)).toBe('来自《星河之一》r3 的原文：「海边小城」');
    // Words cited while changes waited beyond the revision are not said to be the revision's (Issue #63 review).
    expect(knowledgeProvenanceLine({ ...cited, journalSequence: 2, uncheckpointed: true })).toBe('来自《星河之一》的稿件（r3 之后另有尚未保存为修订版的改动）：「海边小城」');
    expect(knowledgeItemLine({ subject: '林默', classLabel: '人物', current: { ordinal: 3 } })).toBe('「林默」 · 人物 · 第 3 版');
    expect(knowledgeRevisionsSummary(3)).toBe('历次版本（3）');
    expect([knowledgeRevisionLine({ ordinal: 1, outcome: 'created', content: '初版' }), knowledgeRevisionLine({ ordinal: 2, outcome: 'updated', content: '二版' })])
      .toEqual(['第 1 版 · 纳入：初版', '第 2 版 · 更新：二版']);
    expect([knowledgeKeptConflictsLine(0), knowledgeKeptConflictsLine(2)]).toEqual([null, '保留了 2 处已披露冲突，未作核实。']);
    expect(knowledgeReuseLine({ reuseLabel: '只用于书系一致性审阅' })).toBe('以后的用途：只用于书系一致性审阅');
  });

  it('names the exact Series and item in review, what it would supersede, and why 纳入书系知识 waits', () => {
    const target = { kind: 'existing' as const, itemId: 'item', subject: '林默', knowledgeClass: 'characters' as const, classLabel: '人物', baseRevisionOrdinal: 2 };
    expect(knowledgeReviewIdentity({ seriesTitle: '星河三部曲', candidate: { target } as never })).toBe('书系「星河三部曲」 · 条目「林默」（人物）');
    expect(knowledgeReviewIdentity({ seriesTitle: '星河三部曲', candidate: { target: { ...target, kind: 'new', itemId: null } } as never })).toBe('书系「星河三部曲」 · 新条目「林默」（人物）');
    expect(knowledgeSupersededLine({ ordinal: 2, content: '二版' })).toBe('将被取代的当前版本：第 2 版 · 二版');
    // Counted in full, whatever part of them the review lists (Issue #63 review).
    expect(knowledgePromoteWaits({ conflictCount: 0, blocked: null }, false, false)).toBe(KNOWLEDGE_WAIT_REUSE);
    expect(knowledgePromoteWaits({ conflictCount: 0, blocked: null }, true, false)).toBeNull();
    expect(knowledgePromoteWaits({ conflictCount: 1, blocked: null }, true, false)).toBe(KNOWLEDGE_WAIT_CONFLICT);
    expect(knowledgePromoteWaits({ conflictCount: 1, blocked: null }, false, true)).toBe(KNOWLEDGE_WAIT_REUSE);
    expect(knowledgePromoteWaits({ conflictCount: 1, blocked: null }, true, true)).toBeNull();
    expect(knowledgePromoteWaits({ conflictCount: 0, blocked: '已不在书系中' }, true, false)).toBe('已不在书系中');
    expect([knowledgeConflictsMoreLine(50, 50), knowledgeConflictsMoreLine(50, 53)]).toEqual([null, '另有 3 处冲突未列出。']);
  });

  it('pages every list and proposes for any item wherever it was found (Issue #63 review)', () => {
    expect([KNOWLEDGE_ITEMS_MORE, KNOWLEDGE_CANDIDATES_MORE, KNOWLEDGE_REVISIONS_MORE]).toEqual(['更多条目…', '更多候选项…', '更早的版本…']);
    expect([KNOWLEDGE_SEARCH_LABEL, KNOWLEDGE_SEARCH, KNOWLEDGE_SEARCH_NONE]).toEqual(['查找条目', '查找', '没有名称含这些字词的条目。']);
    expect(KNOWLEDGE_PROPOSE_FOR_ITEM).toBe('提议修改…');
    // A cited passage stands whole up to two hundred graphemes, and beyond that as its opening.
    expect(knowledgeQuoteExcerpt('海'.repeat(200))).toBe('海'.repeat(200));
    expect(knowledgeQuoteExcerpt('𠀀'.repeat(201))).toBe(`${'𠀀'.repeat(200)}…`);
  });
});
