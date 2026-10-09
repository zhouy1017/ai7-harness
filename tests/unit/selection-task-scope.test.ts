import { describe, expect, it } from 'vitest';
import { readSpans, readSpansLabel } from '../../src/service/task-plan.js';
import { reviewRunPrefill, reviewSheetScope } from '../../src/renderer/review-workspace.js';

// Unit suite for what a selection Task reads and asks for (Issue #423 review, P2-1, P2-4): the reading ranges a range plan names,
// and the scope 返回修改 asks a Review Run to read again. Pure rules: no store, no DOM.

const UNIT = (unitOrdinal: number, startPosition: number, endPosition: number, disposition: string) => ({ unitOrdinal, startPosition, endPosition, disposition });
const MANIFEST = { units: [
  { ordinal: 1, overlapBlockIds: [] },
  { ordinal: 2, overlapBlockIds: ['blk_a'] },
  { ordinal: 3, overlapBlockIds: ['blk_b', 'blk_c'] },
  { ordinal: 4, overlapBlockIds: ['blk_d'] },
] };

describe('the reading ranges a range plan names', () => {
  it('reads each recomputed range from the paragraphs it repeats as context, and merges ranges that meet', () => {
    const units = [UNIT(1, 1, 15, 'reused'), UNIT(2, 16, 25, 'recomputed'), UNIT(3, 26, 43, 'recomputed'), UNIT(4, 44, 59, 'unreviewed')];
    expect(readSpans(units, MANIFEST)).toEqual([[15, 25], [24, 43]]);
    expect(readSpansLabel(readSpans(units, MANIFEST))).toBe('内容块 15–43');
  });

  it('keeps ranges apart that do not meet, names a one-paragraph range by itself, and names nothing when nothing is read', () => {
    expect(readSpansLabel([[60, 68], [3, 3], [10, 12], [13, 20]])).toBe('内容块 3、10–20、60–68');
    expect(readSpansLabel(readSpans([UNIT(4, 44, 59, 'recomputed')], null))).toBe('内容块 44–59');
    expect(readSpans([UNIT(1, 1, 15, 'recomputed')], MANIFEST)).toEqual([[1, 15]]);
    expect(readSpansLabel(readSpans([UNIT(2, 16, 25, 'reused')], MANIFEST))).toBeNull();
    expect(readSpansLabel([])).toBeNull();
  });
});

describe('what 返回修改 asks a Review Run to read again', () => {
  const FROM = `blk_${'1'.repeat(24)}`;
  const TO = `blk_${'2'.repeat(24)}`;
  const chapters = [{ blockId: FROM, position: 16, endPosition: 25 }, { blockId: TO, position: 26, endPosition: 43 }];
  const run = (scope: { kind: 'whole' | 'chapters' | 'changed' | 'selection'; selectedRange: { startPosition: number; endPosition: number } | null; selection: { fromBlockId: string; toBlockId: string } | null }) =>
    ({ categories: [{ categoryId: 'typos-and-usage' }], scope: { label: '', ...scope } }) as unknown as Parameters<typeof reviewRunPrefill>[0];

  it('fills a 当前选区 Run with the paragraphs it kept, and 选章 with its two chapters', () => {
    expect(reviewRunPrefill(run({ kind: 'selection', selectedRange: { startPosition: 20, endPosition: 20 }, selection: { fromBlockId: FROM, toBlockId: FROM } }), chapters))
      .toEqual({ categories: ['typos-and-usage'], scope: 'selection', from: null, to: null, selection: { fromBlockId: FROM, toBlockId: FROM } });
    expect(reviewRunPrefill(run({ kind: 'chapters', selectedRange: { startPosition: 16, endPosition: 43 }, selection: null }), chapters))
      .toEqual({ categories: ['typos-and-usage'], scope: 'chapters', from: FROM, to: TO, selection: null });
    expect(reviewRunPrefill(run({ kind: 'whole', selectedRange: null, selection: null }), chapters).selection).toBeNull();
  });

  it('sends 当前选区 with the paragraphs held, and refuses it with the workspace\'s reason when none is held — never a frame of nulls', () => {
    const base = { from: null, to: null, selectionReason: '在稿件里选中文字，右键「就这段发起任务…」审阅所选文字。' };
    expect(reviewSheetScope({ ...base, scope: 'selection', selection: { fromBlockId: FROM, toBlockId: TO } }))
      .toEqual({ request: { kind: 'selection', fromChapterBlockId: FROM, toChapterBlockId: TO } });
    expect(reviewSheetScope({ ...base, scope: 'selection', selection: null })).toEqual({ problem: base.selectionReason });
    expect(reviewSheetScope({ ...base, scope: 'whole', selection: null })).toEqual({ request: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } });
    expect(reviewSheetScope({ ...base, scope: 'chapters', selection: null, from: { blockId: TO, position: 26 }, to: { blockId: FROM, position: 16 } }))
      .toEqual({ problem: expect.any(String) });
    expect(reviewSheetScope({ ...base, scope: 'chapters', selection: { fromBlockId: FROM, toBlockId: FROM }, from: { blockId: FROM, position: 16 }, to: { blockId: TO, position: 26 } }))
      .toEqual({ request: { kind: 'chapters', fromChapterBlockId: FROM, toChapterBlockId: TO } });
  });
});
