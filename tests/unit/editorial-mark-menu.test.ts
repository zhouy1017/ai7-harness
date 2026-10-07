import { describe, expect, it } from 'vitest';
import { menuPlacement, sameSeriesGroup, seriesKnowledgeMenuGroup, seriesMembership } from '../../src/renderer/editorial-marks.js';

const viewport = { width: 640, height: 400 };
const menu = { width: 260, height: 300 };

describe('where a Mark surface menu goes', () => {
  it('opens at the point it was asked for when it fits there', () => {
    expect(menuPlacement({ x: 100, y: 40 }, menu, viewport)).toEqual({ left: 100, top: 40 });
  });

  it('moves back inside the right and bottom edges', () => {
    expect(menuPlacement({ x: 636, y: 390 }, menu, viewport)).toEqual({ left: 640 - 8 - 260, top: 400 - 8 - 300 });
  });

  it('comes down into the window when the caret it speaks for was scrolled out above it', () => {
    expect(menuPlacement({ x: 120, y: -480 }, menu, viewport)).toEqual({ left: 120, top: 8 });
  });

  it('comes in from the left of the window', () => {
    expect(menuPlacement({ x: -30, y: 50 }, menu, viewport)).toEqual({ left: 8, top: 50 });
  });

  it('starts at the margin when it is larger than the window', () => {
    expect(menuPlacement({ x: 300, y: 200 }, { width: 700, height: 500 }, viewport)).toEqual({ left: 8, top: 8 });
  });
});

describe('the 书系 group of the selection menu (Issue #642)', () => {
  const act = { compose: () => undefined, choose: () => undefined };
  const actions = (membership: Parameters<typeof seriesKnowledgeMenuGroup>[0], why?: string) =>
    seriesKnowledgeMenuGroup(membership, why, act)?.items.map((item) => [item.action, item.label, item.disabledReason ?? null]) ?? null;

  it('is not shown for a Book known to be in no Series', () => {
    expect(seriesKnowledgeMenuGroup([], undefined, act)).toBeNull();
  });

  it('is not shown either before the first read of the Book\'s Series answers, so a Book in none never flashes a chooser', () => {
    expect(seriesKnowledgeMenuGroup(null, undefined, act)).toBeNull();
  });

  it('offers each Series the Book is in, then the chooser', () => {
    const series = [{ seriesId: 's1', title: '星河三部曲' }, { seriesId: 's2', title: '海边' }];
    expect(seriesKnowledgeMenuGroup(series, undefined, act)?.label).toBe('书系');
    expect(actions(series)).toEqual([
      ['propose-series-knowledge', '提议为书系「星河三部曲」的知识…', null],
      ['propose-series-knowledge', '提议为书系「海边」的知识…', null],
      ['choose-knowledge-series', '选择书系并提议知识…', null],
    ]);
  });

  it('says why each entry waits when the selection cannot be marked', () => {
    expect(actions([{ seriesId: 's1', title: '星河三部曲' }], '先选中一段文字')?.map(([, , why]) => why)).toEqual(['先选中一段文字', '先选中一段文字']);
    expect(seriesKnowledgeMenuGroup([{ seriesId: 's1', title: '星河三部曲' }], '先选中一段文字', act)?.note).toBe('先选中一段文字');
  });

  it('names the Series of each entry, so a redraw keeps focus on the same one', () => {
    const group = seriesKnowledgeMenuGroup([{ seriesId: 's1', title: '甲' }, { seriesId: 's2', title: '乙' }], undefined, act)!;
    expect(group.items.map((item) => item.seriesId ?? null)).toEqual(['s1', 's2', null]);
  });
});

describe('the Book\'s Series as the editor reads them while it is open (Issue #642)', () => {
  const one = [{ seriesId: 's1', title: '星河三部曲' }];

  it('follows a Book from no Series into one while the editor is open, and says the menu must be drawn again', async () => {
    let answer: ReadonlyArray<{ seriesId: string; title: string }> = [];
    const membership = seriesMembership(async () => ({ memberships: answer }));
    expect(membership.current()).toBeNull();
    await membership.refresh();
    const shown = membership.current();
    expect(shown).toEqual([]);
    // Unknown and in none draw the same menu: nothing of 书系, and no redraw between them.
    expect(sameSeriesGroup(null, shown)).toBe(true);
    answer = one;
    await membership.refresh();
    expect(membership.current()).toEqual(one);
    expect(sameSeriesGroup(shown, membership.current())).toBe(false);
    expect(sameSeriesGroup(one, [{ seriesId: 's1', title: '星河三部曲' }])).toBe(true);
    expect(sameSeriesGroup(one, [{ seriesId: 's1', title: '改名' }])).toBe(false);
  });

  it('counts only the latest read\'s answer, and keeps the last answer when a read fails', async () => {
    const pending: Array<(value: { memberships: typeof one }) => void> = [];
    let fail = false;
    const membership = seriesMembership(() => fail ? Promise.reject(new Error('读不到')) : new Promise((resolve) => { pending.push(resolve); }));
    const first = membership.refresh();
    const second = membership.refresh();
    pending[1]!({ memberships: one });
    await second;
    pending[0]!({ memberships: [] });
    await first;
    expect(membership.current()).toEqual(one);
    fail = true;
    await membership.refresh();
    expect(membership.current()).toEqual(one);
  });

  it('records nothing once the editor is gone', async () => {
    const membership = seriesMembership(async () => ({ memberships: one }), () => false);
    await membership.refresh();
    expect(membership.current()).toBeNull();
  });
});
