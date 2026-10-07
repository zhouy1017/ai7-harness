import { describe, expect, it } from 'vitest';
import { menuPlacement, seriesKnowledgeMenuGroup } from '../../src/renderer/editorial-marks.js';

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

  it('keeps the chooser alone while the Series of the Book are not known', () => {
    expect(actions(null)).toEqual([['choose-knowledge-series', '选择书系并提议知识…', null]]);
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
    expect(seriesKnowledgeMenuGroup(null, '先选中一段文字', act)?.note).toBe('先选中一段文字');
  });
});
