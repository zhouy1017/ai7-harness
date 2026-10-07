import { describe, expect, it } from 'vitest';
import {
  coverSpanEdit,
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

describe('the point an applied deletion leaves follows the text around it', () => {
  // A zero-width anchor pinned on no text, between 丁 and 戊.
  const around = '甲乙丙丁戊己庚辛';
  const point = { fromGrapheme: 4, toGrapheme: 4, state: 'exact' } as const;
  const edited = (from: number, to: number, insert: string): string => {
    const parts = graphemesOf(around);
    return [...parts.slice(0, from), ...graphemesOf(insert), ...parts.slice(to)].join('');
  };

  it('shifts with an edit wholly in front of it, text typed exactly at it included, and stays for one behind it', () => {
    expect(followBlockTextChange(point, '', around, edited(1, 1, '〔〕'))).toEqual({ fromGrapheme: 6, toGrapheme: 6, state: 'exact' });
    expect(followBlockTextChange(point, '', around, edited(4, 4, '〔〕'))).toEqual({ fromGrapheme: 6, toGrapheme: 6, state: 'exact' });
    expect(followBlockTextChange(point, '', around, edited(6, 6, '〔〕'))).toEqual(point);
    expect(followBlockTextChange(point, '', around, edited(1, 2, ''))).toEqual({ fromGrapheme: 3, toGrapheme: 3, state: 'exact' });
    expect(followBlockTextChange(point, '', around, edited(6, 8, ''))).toEqual(point);
    expect(followBlockTextChange(point, '', around, around)).toEqual(point);
  });

  it('stays exact when only the grapheme on one side of it is taken away or replaced', () => {
    expect(followBlockTextChange(point, '', around, edited(3, 4, ''))).toEqual({ fromGrapheme: 3, toGrapheme: 3, state: 'exact' });
    expect(followBlockTextChange(point, '', around, edited(4, 5, ''))).toEqual(point);
    expect(followBlockTextChange(point, '', around, edited(3, 4, '〔〕'))).toEqual({ fromGrapheme: 5, toGrapheme: 5, state: 'exact' });
  });

  it('drifts once an edit takes graphemes from both sides of it', () => {
    expect(followBlockTextChange(point, '', around, edited(3, 5, ''))).toEqual({ fromGrapheme: 3, toGrapheme: 3, state: 'drifted' });
    expect(followBlockTextChange(point, '', around, edited(2, 6, '〔改〕'))).toEqual({ fromGrapheme: 2, toGrapheme: 5, state: 'drifted' });
  });

  it('is never found again once drifted, and never taken for exact when its state is not known', () => {
    // Empty text stands everywhere: undoing the edit brings the text back, not the point.
    const across = followBlockTextChange(point, '', around, edited(3, 5, ''));
    expect(followBlockTextChange(across, '', edited(3, 5, ''), around)).toEqual({ fromGrapheme: 5, toGrapheme: 5, state: 'drifted' });
    expect(followBlockTextChange({ ...point, state: 'drifted' }, '', around, around).state).toBe('drifted');
    expect(followBlockTextChange({ ...point, state: 'drifted' }, '', around, edited(6, 6, '〔〕')).state).toBe('drifted');
    expect(followBlockTextChange({ fromGrapheme: 4, toGrapheme: 4 }, '', around, around).state).toBe('drifted');
    expect(resolvePinnedRange(graphemesOf(around), [], point).state).toBe('drifted');
    expect(resolvePinnedRange(graphemesOf(around), [], point, { fromGrapheme: 0, toGrapheme: 8 }).state).toBe('drifted');
  });

  it('drifts when it falls outside its block or the graphemes no longer count as the edit says', () => {
    expect(followBlockTextChange({ fromGrapheme: 9, toGrapheme: 9, state: 'exact' }, '', around, around)).toEqual({ fromGrapheme: 8, toGrapheme: 8, state: 'drifted' });
    // A combining mark put at the point joins the grapheme in front of it: no point is where the edit's arithmetic puts it.
    expect(followBlockTextChange({ fromGrapheme: 2, toGrapheme: 2, state: 'exact' }, '', 'Xa戊', 'Xá戊', { fromGrapheme: 2, toGrapheme: 2, insertedGraphemes: 1 }).state)
      .toBe('drifted');
  });
});

describe('a point that cannot say which side of text written at it it is on covers that text (Issue #533)', () => {
  // Between 丁 and 戊 of 甲乙丙丁戊己庚辛, as the point above.
  const point = { fromGrapheme: 4, toGrapheme: 4 };
  const edit = (fromGrapheme: number, toGrapheme: number, insertedGraphemes: number) => ({ fromGrapheme, toGrapheme, insertedGraphemes });

  it('covers text typed exactly at it, and takes in what is typed into what it covers or at either of its edges', () => {
    expect(coverSpanEdit(point, edit(4, 4, 2), 10)).toEqual({ fromGrapheme: 4, toGrapheme: 6, state: 'drifted' });
    const covering = { fromGrapheme: 4, toGrapheme: 6 };
    expect(coverSpanEdit(covering, edit(4, 4, 1), 11)).toEqual({ fromGrapheme: 4, toGrapheme: 7, state: 'drifted' });
    expect(coverSpanEdit(covering, edit(5, 5, 1), 11)).toEqual({ fromGrapheme: 4, toGrapheme: 7, state: 'drifted' });
    expect(coverSpanEdit(covering, edit(6, 6, 1), 11)).toEqual({ fromGrapheme: 4, toGrapheme: 7, state: 'drifted' });
    expect(coverSpanEdit(covering, edit(5, 6, 0), 9)).toEqual({ fromGrapheme: 4, toGrapheme: 5, state: 'drifted' });
    // A replacement that ends or starts exactly at it writes text at it too.
    expect(coverSpanEdit(point, edit(3, 4, 2), 9)).toEqual({ fromGrapheme: 3, toGrapheme: 5, state: 'drifted' });
    expect(coverSpanEdit(point, edit(4, 5, 2), 9)).toEqual({ fromGrapheme: 4, toGrapheme: 6, state: 'drifted' });
  });

  it('moves with an edit wholly in front of it, stays for one wholly behind it, and is never exact again', () => {
    expect(coverSpanEdit(point, edit(1, 2, 0), 7)).toEqual({ fromGrapheme: 3, toGrapheme: 3, state: 'drifted' });
    expect(coverSpanEdit(point, edit(0, 0, 3), 11)).toEqual({ fromGrapheme: 7, toGrapheme: 7, state: 'drifted' });
    expect(coverSpanEdit(point, edit(5, 6, 3), 10)).toEqual({ fromGrapheme: 4, toGrapheme: 4, state: 'drifted' });
    expect(coverSpanEdit({ fromGrapheme: 4, toGrapheme: 6 }, edit(7, 7, 1), 11)).toEqual({ fromGrapheme: 4, toGrapheme: 6, state: 'drifted' });
  });

  it('takes words written back at it as written there when they begin with the grapheme after it (Issue #568)', () => {
    // 他说|，好吗 after ，我们走吧 was deleted at 2. Written back, the derived span says 我们走吧， at 3: slid left over the equal
    // ， it reaches the point, so the point covers ，我们走吧 rather than stay bare at 2.
    const current = graphemesOf('他说，好吗');
    const next = graphemesOf('他说，我们走吧，好吗');
    const derived = deriveSpanEdit(current, next)!;
    const at = { fromGrapheme: 2, toGrapheme: 2 };
    expect(derived).toEqual({ fromGrapheme: 3, toGrapheme: 3, insertedGraphemes: 5 });
    expect(coverSpanEdit(at, derived, next.length, { current, next })).toEqual({ fromGrapheme: 2, toGrapheme: 7, state: 'drifted' });
    // Without the texts — an Apply's or a replacement's span, whose place is known — it is followed as it is, and words that
    // cannot slide to it stay wholly behind it.
    expect(coverSpanEdit(at, derived, next.length)).toEqual({ fromGrapheme: 2, toGrapheme: 2, state: 'drifted' });
    const later = graphemesOf('他说，好我们吗');
    expect(coverSpanEdit(at, deriveSpanEdit(current, later)!, later.length, { current, next: later })).toEqual({ fromGrapheme: 2, toGrapheme: 2, state: 'drifted' });
    // A replacement is never slid: only pure insertions and deletions are ambiguous this way. Slid, this one would reach the
    // point over the equal ，and cover [2,7).
    const replaced = graphemesOf('他说，我们走吧，吗');
    expect(coverSpanEdit(at, { fromGrapheme: 3, toGrapheme: 4, insertedGraphemes: 5 }, replaced.length, { current: graphemesOf('他说，X吗'), next: replaced }))
      .toEqual({ fromGrapheme: 2, toGrapheme: 2, state: 'drifted' });
  });

  it('takes a redo, or a deletion, of the words it covers as removing exactly them (Issue #568 review)', () => {
    // After the undo it covers ，我们走吧 at [2,7). The redo's derived span removes 我们走吧， at [3,8): slid left over the equal ，
    // it removes exactly what the point covers, so the point is bare at 2 again rather than keep the ， before 好吗.
    const current = graphemesOf('他说，我们走吧，好吗');
    const next = graphemesOf('他说，好吗');
    const derived = deriveSpanEdit(current, next)!;
    const covering = { fromGrapheme: 2, toGrapheme: 7 };
    expect(derived).toEqual({ fromGrapheme: 3, toGrapheme: 8, insertedGraphemes: 0 });
    expect(coverSpanEdit(covering, derived, next.length, { current, next })).toEqual({ fromGrapheme: 2, toGrapheme: 2, state: 'drifted' });
    expect(coverSpanEdit(covering, derived, next.length)).toEqual({ fromGrapheme: 2, toGrapheme: 3, state: 'drifted' });
    // A deletion that cannot remove exactly what it covers is followed as it is: one that cannot slide at all, and one that
    // slides a grapheme — xa，b，c losing b， could as well lose ，b — but would then take the ， of the a， it covers.
    const part = graphemesOf('他说，走吧，好吗');
    expect(coverSpanEdit(covering, deriveSpanEdit(current, part)!, part.length, { current, next: part })).toEqual({ fromGrapheme: 2, toGrapheme: 5, state: 'drifted' });
    const before = graphemesOf('xa，b，c');
    const after = graphemesOf('xa，c');
    expect(deriveSpanEdit(before, after)).toEqual({ fromGrapheme: 3, toGrapheme: 5, insertedGraphemes: 0 });
    expect(coverSpanEdit({ fromGrapheme: 1, toGrapheme: 3 }, deriveSpanEdit(before, after)!, after.length, { current: before, next: after }))
      .toEqual({ fromGrapheme: 1, toGrapheme: 3, state: 'drifted' });
  });

  it('never slides past the point, whatever repeats beyond it (Issue #568 review)', () => {
    // xa|ay: one more a written at the point is derived at 3, and the run of a goes on past the point to 1. Slid, it stops at
    // the point and covers [2,3); slid on to 1, it would not reach the point and be left behind it.
    const current = graphemesOf('xaay');
    const next = graphemesOf('xaaay');
    const derived = deriveSpanEdit(current, next)!;
    expect(derived).toEqual({ fromGrapheme: 3, toGrapheme: 3, insertedGraphemes: 1 });
    expect(coverSpanEdit({ fromGrapheme: 2, toGrapheme: 2 }, derived, next.length, { current, next })).toEqual({ fromGrapheme: 2, toGrapheme: 3, state: 'drifted' });
    // Nor a deletion past what the point covers: a|a|ay losing one a is derived at 2. Slid, it stops at the a covered at 1 and
    // removes exactly it; slid on to 0, it would not remove what the point covers and leave that a covered.
    const whole = graphemesOf('aaay');
    const less = graphemesOf('aay');
    expect(deriveSpanEdit(whole, less)).toEqual({ fromGrapheme: 2, toGrapheme: 3, insertedGraphemes: 0 });
    expect(coverSpanEdit({ fromGrapheme: 1, toGrapheme: 2 }, deriveSpanEdit(whole, less)!, less.length, { current: whole, next: less }))
      .toEqual({ fromGrapheme: 1, toGrapheme: 1, state: 'drifted' });
  });

  it('covers what replaces a span across it, falls back to a point when what it covers goes, and stays in its block', () => {
    expect(coverSpanEdit(point, edit(3, 5, 1), 7)).toEqual({ fromGrapheme: 3, toGrapheme: 4, state: 'drifted' });
    expect(coverSpanEdit({ fromGrapheme: 4, toGrapheme: 6 }, edit(4, 6, 0), 8)).toEqual({ fromGrapheme: 4, toGrapheme: 4, state: 'drifted' });
    expect(coverSpanEdit({ fromGrapheme: 4, toGrapheme: 6 }, edit(2, 8, 0), 2)).toEqual({ fromGrapheme: 2, toGrapheme: 2, state: 'drifted' });
    expect(coverSpanEdit({ fromGrapheme: 7, toGrapheme: 9 }, edit(8, 8, 1), 5)).toEqual({ fromGrapheme: 5, toGrapheme: 5, state: 'drifted' });
  });
});
