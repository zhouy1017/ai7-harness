import { describe, expect, it } from 'vitest';
import {
  FACTUAL_AGAIN_REASON,
  FACTUAL_CHANGED_REASON,
  FACTUAL_CHAPTERS_REASON,
  LEADS_ABSENT_REASON,
  LEADS_CHANGED_REASON,
  NEVER_REVIEWED_REASON,
  NOTHING_CHANGED_REASON,
  NO_CHAPTERS_REASON,
  SELECTION_UNAVAILABLE_REASON,
  chapterOfPosition,
  chapterOptionsFromOutline,
  chapterOptionsFromUnits,
  resolveChapterRange,
  reviewCategoryScopePlan,
  reviewScopeLabel,
  type ReviewCategoryLedgerFacts,
  type ResolvedReviewScope,
} from '../../src/service/review/review-scope.js';

// Unit suite for how a Review Run's scope becomes each category's Task (Issue #417, B6). Pure rules:
// no store, no ledger, no manuscript.

const NEVER: ReviewCategoryLedgerFacts = { hasRevision: false, stale: false, syncUnavailableReason: null, baselineRevision: true };
const CURRENT: ReviewCategoryLedgerFacts = { hasRevision: true, stale: false, syncUnavailableReason: '账本自己的原因', baselineRevision: true };
const STALE: ReviewCategoryLedgerFacts = { hasRevision: true, stale: true, syncUnavailableReason: null, baselineRevision: true };
const WHOLE: ResolvedReviewScope = { kind: 'whole', selectedRange: null };
const CHANGED: ResolvedReviewScope = { kind: 'changed', selectedRange: null };
const CHAPTERS: ResolvedReviewScope = { kind: 'chapters', selectedRange: { startPosition: 16, endPosition: 43 } };
const SELECTION: ResolvedReviewScope = { kind: 'selection', selectedRange: { startPosition: 3, endPosition: 3 } };

describe('the scope a category reads', () => {
  it('starts a contract category whole or by range, and reviews it again, by change or by range once it has a revision', () => {
    const contract = (scope: ResolvedReviewScope, facts: ReviewCategoryLedgerFacts) => reviewCategoryScopePlan('review-category-contract', null, scope, facts);
    expect(contract(WHOLE, NEVER)).toEqual({ kind: 'task', mode: 'review-first', selectedRange: null });
    expect(contract(WHOLE, CURRENT)).toEqual({ kind: 'task', mode: 'review-again', selectedRange: null });
    expect(contract(CHAPTERS, NEVER)).toEqual({ kind: 'task', mode: 'review-first-range', selectedRange: { startPosition: 16, endPosition: 43 } });
    expect(contract(CHAPTERS, STALE)).toEqual({ kind: 'task', mode: 'review-range', selectedRange: { startPosition: 16, endPosition: 43 } });
    expect(contract(CHANGED, STALE)).toEqual({ kind: 'task', mode: 'review-sync', selectedRange: null });
    // Nothing to compare with, and nothing changed: each says why, the second in the ledger's own words.
    expect(contract(CHANGED, NEVER)).toEqual({ kind: 'refused', reason: NEVER_REVIEWED_REASON });
    expect(contract(CHANGED, CURRENT)).toEqual({ kind: 'refused', reason: '账本自己的原因' });
    expect(contract(CHANGED, { ...CURRENT, syncUnavailableReason: null })).toEqual({ kind: 'refused', reason: NOTHING_CHANGED_REASON });
    expect(contract({ kind: 'chapters', selectedRange: null }, NEVER)).toEqual({ kind: 'refused', reason: NO_CHAPTERS_REASON });
  });

  it('never offers the current selection yet, for any category', () => {
    for (const executor of ['review-category-contract', 'baseline-leads', 'factual-review-kind'] as const) {
      expect(reviewCategoryScopePlan(executor, null, SELECTION, CURRENT)).toEqual({ kind: 'refused', reason: SELECTION_UNAVAILABLE_REASON });
    }
  });

  it('reads the leads for the whole manuscript or the chosen chapters, only once the baseline has a revision', () => {
    expect(reviewCategoryScopePlan('baseline-leads', null, WHOLE, NEVER)).toEqual({ kind: 'leads', selectedRange: null });
    expect(reviewCategoryScopePlan('baseline-leads', null, CHAPTERS, NEVER)).toEqual({ kind: 'leads', selectedRange: { startPosition: 16, endPosition: 43 } });
    expect(reviewCategoryScopePlan('baseline-leads', null, CHANGED, NEVER)).toEqual({ kind: 'refused', reason: LEADS_CHANGED_REASON });
    expect(reviewCategoryScopePlan('baseline-leads', null, WHOLE, { ...NEVER, baselineRevision: false })).toEqual({ kind: 'refused', reason: LEADS_ABSENT_REASON });
  });

  it('checks facts over the whole manuscript once, and says why every other scope waits for the factual update modes', () => {
    expect(reviewCategoryScopePlan('factual-review-kind', null, WHOLE, NEVER)).toEqual({ kind: 'task', mode: 'whole-manuscript', selectedRange: null });
    expect(reviewCategoryScopePlan('factual-review-kind', null, WHOLE, CURRENT)).toEqual({ kind: 'refused', reason: FACTUAL_AGAIN_REASON });
    expect(reviewCategoryScopePlan('factual-review-kind', null, CHAPTERS, NEVER)).toEqual({ kind: 'refused', reason: FACTUAL_CHAPTERS_REASON });
    expect(reviewCategoryScopePlan('factual-review-kind', null, CHANGED, STALE)).toEqual({ kind: 'refused', reason: FACTUAL_CHANGED_REASON });
  });

  it('refuses an unavailable category with its configured reason', () => {
    expect(reviewCategoryScopePlan('unavailable', '加入书系后才能选。', WHOLE, NEVER)).toEqual({ kind: 'refused', reason: '加入书系后才能选。' });
  });
});

describe('the chapters 选章 offers', () => {
  const headings = [
    { blockId: 'blk_a', position: 2, level: 1, title: '一' },
    { blockId: 'blk_a1', position: 5, level: 2, title: '一·一' },
    { blockId: 'blk_b', position: 9, level: 1, title: '二' },
    { blockId: 'blk_c', position: 20, level: 1, title: '三' },
  ];

  it('runs a chapter to the block before the next heading of its own level or higher, so it keeps its subheadings', () => {
    expect(chapterOptionsFromOutline(headings, 30).map((chapter) => [chapter.blockId, chapter.position, chapter.endPosition])).toEqual([
      ['blk_a', 2, 8], ['blk_a1', 5, 8], ['blk_b', 9, 19], ['blk_c', 20, 30],
    ]);
  });

  it('offers the analysis units of a manuscript without headings, named by position only', () => {
    const chapters = chapterOptionsFromUnits([
      { ordinal: 1, startPosition: 1, endPosition: 15, firstBlockId: 'blk_1' },
      { ordinal: 2, startPosition: 16, endPosition: 25, firstBlockId: 'blk_16' },
    ]);
    expect(chapters).toEqual([
      { blockId: 'blk_1', title: '第 1 部分 · 内容块 1–15', level: 1, position: 1, endPosition: 15 },
      { blockId: 'blk_16', title: '第 2 部分 · 内容块 16–25', level: 1, position: 16, endPosition: 25 },
    ]);
  });

  it('resolves one contiguous run from the first chosen chapter to the end of the last, and nothing out of order', () => {
    const chapters = chapterOptionsFromOutline(headings, 30);
    expect(resolveChapterRange(chapters, 'blk_a', 'blk_b')).toEqual({ startPosition: 2, endPosition: 19 });
    expect(resolveChapterRange(chapters, 'blk_b', 'blk_b')).toEqual({ startPosition: 9, endPosition: 19 });
    expect(resolveChapterRange(chapters, 'blk_c', 'blk_a')).toBeNull();
    expect(resolveChapterRange(chapters, 'blk_a', 'blk_missing')).toBeNull();
  });

  it('places a block in the innermost chapter that holds it, and outside every chapter before the first', () => {
    const chapters = chapterOptionsFromOutline(headings, 30);
    expect(chapterOfPosition(chapters, 6)?.blockId).toBe('blk_a1');
    expect(chapterOfPosition(chapters, 3)?.blockId).toBe('blk_a');
    expect(chapterOfPosition(chapters, 25)?.blockId).toBe('blk_c');
    expect(chapterOfPosition(chapters, 1)).toBeNull();
  });

  it('labels a scope by positions only', () => {
    expect(reviewScopeLabel(WHOLE)).toBe('全书');
    expect(reviewScopeLabel(CHANGED)).toBe('只审改动过的章');
    expect(reviewScopeLabel(CHAPTERS)).toBe('选章 · 内容块 16–43');
  });
});
