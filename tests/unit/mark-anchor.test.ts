import { describe, expect, it } from 'vitest';
import {
  deriveSpanEdit,
  followBlockTextChange,
  followSpanEdit,
  graphemesOf,
  resolvePinnedRange,
} from '../../src/shared/mark-anchor.js';

const before = '示例人物甲在第三章被称为示例称谓乙，此处沿用。';
const pinned = '示例称谓乙';
const at = graphemesOf(before).join('').indexOf(pinned);
const range = { fromGrapheme: at, toGrapheme: at + graphemesOf(pinned).length };

describe('an Editorial Mark follows the text of its block', () => {
  it('derives the one span that turns one text into another', () => {
    expect(deriveSpanEdit(graphemesOf('甲乙丙'), graphemesOf('甲乙丙'))).toBeNull();
    expect(deriveSpanEdit(graphemesOf('甲乙丙'), graphemesOf('甲丁丙'))).toEqual({ fromGrapheme: 1, toGrapheme: 2, insertedGraphemes: 1 });
    expect(deriveSpanEdit(graphemesOf('甲丙'), graphemesOf('甲乙丙'))).toEqual({ fromGrapheme: 1, toGrapheme: 1, insertedGraphemes: 1 });
    expect(deriveSpanEdit(graphemesOf('甲乙丙'), graphemesOf('甲'))).toEqual({ fromGrapheme: 1, toGrapheme: 3, insertedGraphemes: 0 });
  });

  it('shifts with text typed in front of it and ignores text typed behind it', () => {
    const typedBefore = `新增一句。${before}`;
    expect(followBlockTextChange(range, pinned, before, typedBefore)).toEqual({
      fromGrapheme: range.fromGrapheme + 5,
      toGrapheme: range.toGrapheme + 5,
      state: 'exact',
    });
    const typedBehind = `${before}补一句。`;
    expect(followBlockTextChange(range, pinned, before, typedBehind)).toEqual({ ...range, state: 'exact' });
  });

  it('keeps text inserted at either edge outside the range', () => {
    expect(followSpanEdit(range, { fromGrapheme: range.fromGrapheme, toGrapheme: range.fromGrapheme, insertedGraphemes: 2 }))
      .toEqual({ fromGrapheme: range.fromGrapheme + 2, toGrapheme: range.toGrapheme + 2, touched: false });
    expect(followSpanEdit(range, { fromGrapheme: range.toGrapheme, toGrapheme: range.toGrapheme, insertedGraphemes: 2 }))
      .toEqual({ ...range, touched: false });
  });

  it('discloses a drift when the pinned text itself is changed, and never moves to a lookalike', () => {
    const rewritten = before.replace('示例称谓乙', '示例称谓甲');
    const followed = followBlockTextChange(range, pinned, before, rewritten);
    expect(followed.state).toBe('drifted');
    expect(graphemesOf(rewritten).slice(followed.fromGrapheme, followed.toGrapheme).join('')).toContain('甲');

    // The same words stand elsewhere in the block: a drifted mark stays where it was made.
    const twice = `示例称谓乙出场。${before}`;
    const second = { fromGrapheme: range.fromGrapheme + 8, toGrapheme: range.toGrapheme + 8 };
    const changed = twice.slice(0, twice.lastIndexOf('乙')) + '丙' + twice.slice(twice.lastIndexOf('乙') + 1);
    expect(followBlockTextChange(second, pinned, twice, changed).state).toBe('drifted');
  });

  it('is exact again once the change that touched it is undone', () => {
    const rewritten = before.replace('示例称谓乙', '示例称谓甲');
    const drifted = followBlockTextChange(range, pinned, before, rewritten);
    expect(followBlockTextChange(drifted, pinned, rewritten, before)).toEqual({ ...range, state: 'exact' });

    const split = before.replace('示例称谓乙', '示例X称谓乙');
    const inside = followBlockTextChange(range, pinned, before, split);
    expect(inside).toEqual({ fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme + 1, state: 'drifted' });
    expect(followBlockTextChange(inside, pinned, split, before)).toEqual({ ...range, state: 'exact' });
  });

  it('follows a deletion that swallows the range down to an empty drifted position', () => {
    const cut = before.slice(0, 3);
    const followed = followBlockTextChange(range, pinned, before, cut);
    expect(followed.state).toBe('drifted');
    expect(followed.fromGrapheme).toBe(followed.toGrapheme);
    expect(followed.toGrapheme).toBeLessThanOrEqual(graphemesOf(cut).length);
  });

  it('resolves a whole rewritten block only where the pinned text stands alone', () => {
    const text = graphemesOf('前文。示例称谓乙在此。');
    const want = graphemesOf(pinned);
    expect(resolvePinnedRange(text, want, { fromGrapheme: 0, toGrapheme: 5 })).toEqual({ fromGrapheme: 3, toGrapheme: 8, state: 'exact' });
    const doubled = graphemesOf('示例称谓乙与示例称谓乙');
    expect(resolvePinnedRange(doubled, want, { fromGrapheme: 1, toGrapheme: 6 }).state).toBe('drifted');
    expect(resolvePinnedRange(doubled, want, { fromGrapheme: 6, toGrapheme: 11 })).toEqual({ fromGrapheme: 6, toGrapheme: 11, state: 'exact' });
    expect(resolvePinnedRange(graphemesOf('短'), want, { fromGrapheme: 4, toGrapheme: 9 })).toEqual({ fromGrapheme: 1, toGrapheme: 1, state: 'drifted' });
  });

  it('counts a family emoji and a combining sequence as one grapheme each', () => {
    const text = '甲👨‍👩‍👧乙é丙';
    expect(graphemesOf(text)).toHaveLength(5);
    const mark = { fromGrapheme: 2, toGrapheme: 3 };
    expect(followBlockTextChange(mark, '乙', text, `新${text}`)).toEqual({ fromGrapheme: 3, toGrapheme: 4, state: 'exact' });
  });
});
