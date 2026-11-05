import { describe, expect, it } from 'vitest';
import { estimateReviewCalls, reviewConsequenceEstimate } from '../../src/renderer/review-labels.js';
import type { ReviewChapterOptionProjection } from '../../src/shared/protocol.js';

const counts = { whole: 3, units: [{ startPosition: 1, endPosition: 3 }, { startPosition: 4, endPosition: 8 }, { startPosition: 9, endPosition: 12 }] };
const model = { label: '体例', modelFree: false, crossChapter: true, changedUnits: 2 };
const local = { label: '本地检查', modelFree: true };
const chapter: ReviewChapterOptionProjection = { blockId: 'chapter', title: '所选章', position: 4, endPosition: 8, level: 1 };
describe('scope-derived review call estimates (#1320)', () => {
  it('counts selected units and one cross-chapter synthesis, without charging local work', () => {
    expect(estimateReviewCalls(model, 'whole', counts, null)).toBe(4);
    expect(estimateReviewCalls(model, 'chapters', counts, { startPosition: 4, endPosition: 8 })).toBe(2);
    expect(estimateReviewCalls(model, 'selection', counts, null)).toBe(2);
    expect(estimateReviewCalls(model, 'changed', counts, null)).toBe(3);
    expect(estimateReviewCalls(local, 'whole', counts, null)).toBe(0);
    expect(estimateReviewCalls({ ...model, changedUnits: 0 }, 'changed', counts, null)).toBe(0);
  });
  it('counts overlapping scope units once, including nested chapter ranges', () => {
    expect(estimateReviewCalls({ ...model, crossChapter: false }, 'chapters', counts, { startPosition: 2, endPosition: 10 })).toBe(3);
  });
  it('keeps incomplete scopes and missing counts unknown', () => {
    expect(estimateReviewCalls(model, null, counts, null)).toBeNull();
    expect(estimateReviewCalls(model, 'chapters', counts, null)).toBeNull();
    expect(estimateReviewCalls(model, 'whole', undefined, null)).toBeNull();
    expect(estimateReviewCalls(model, 'chapters', counts, { startPosition: 9, endPosition: 4 })).toBeNull();
  });
  it('recomputes all four lines from the category set and scope, with no invented price', () => {
    const workspace = { manuscript: null, scopeUnitCounts: counts };
    const chapters = { from: chapter, to: chapter };
    const one = reviewConsequenceEstimate([model], 'chapters', workspace, chapters);
    expect(Object.keys(one)).toEqual(['read', 'send', 'notDo', 'cost']);
    expect(one.read).toContain('所选章'); expect(one.send).toContain('选章'); expect(one.cost).toBe('约 2 次模型调用');
    expect(reviewConsequenceEstimate([model, { ...model, crossChapter: false }], 'whole', workspace, chapters).cost).toBe('约 7 次模型调用');
    const offline = reviewConsequenceEstimate([local], 'selection', workspace, chapters);
    expect(offline.send).toContain('不发送'); expect(offline.cost).toBe('约 0 次模型调用');
    expect(reviewConsequenceEstimate([], 'whole', workspace, chapters).cost).toBe('选好类别后显示');
  });
});
