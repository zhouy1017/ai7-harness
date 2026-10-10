import { describe, expect, it } from 'vitest';
import { latestAnswer, menuPlacement, paneMovedUnderMenu, sameProcedureEntries, sameSeriesGroup, seriesKnowledgeMenuGroup, seriesMembership } from '../../src/renderer/editorial-marks.js';
import type { SelectionProcedureEntry } from '../../src/renderer/selection-task-labels.js';

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

describe('when a scroll of the text pane closes an open menu (Issue #745)', () => {
  it('leaves the menu standing when the event reports a movement made before the menu was drawn', () => {
    // The editor revealed its caret as it took focus and the right-click opened the menu in the same frame: the pane is
    // where it stood when the menu was read, and the scroll event that arrives a frame later moves nothing under it.
    expect(paneMovedUnderMenu({ top: 0, left: 0 }, { top: 0, left: 0 })).toBe(false);
    expect(paneMovedUnderMenu({ top: 312, left: 0 }, { top: 312, left: 0 })).toBe(false);
  });

  it('closes it once the text under it has moved, either way', () => {
    expect(paneMovedUnderMenu({ top: 312, left: 0 }, { top: 349, left: 0 })).toBe(true);
    expect(paneMovedUnderMenu({ top: 312, left: 0 }, { top: 275, left: 0 })).toBe(true);
    expect(paneMovedUnderMenu({ top: 312, left: 0 }, { top: 312, left: 14 })).toBe(true);
  });

  it('closes a menu whose drawing position is not known', () => {
    expect(paneMovedUnderMenu(undefined, { top: 0, left: 0 })).toBe(true);
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

describe('the house\'s 可复用工序 as the selection menu reads them (Issue #423, S77 deferred item a)', () => {
  const entry = (procedureId: string, disabledReason: string | null = null): SelectionProcedureEntry => ({
    kind: 'procedure', value: `procedure:${procedureId}`, procedureId, title: '体例复核', versionId: 'v1', version: 1, label: '按《体例复核》审阅这段', hint: '可复用工序 · 第 1 版 · 1 步', chosenApart: [], disabledReason,
  });

  it('draws the group again when the house\'s procedures become known, change, or when none is left — and not otherwise', async () => {
    let answer: ReadonlyArray<SelectionProcedureEntry> = [];
    const procedures = latestAnswer(async () => answer);
    expect(procedures.current()).toBeNull();
    // Not known yet draws no entry and no note; known and none draws the note: the two differ.
    await procedures.refresh();
    expect(procedures.current()).toEqual([]);
    expect(sameProcedureEntries(null, procedures.current())).toBe(false);
    expect(sameProcedureEntries(null, null)).toBe(true);
    expect(sameProcedureEntries([], [])).toBe(true);
    answer = [entry('p1')];
    await procedures.refresh();
    expect(sameProcedureEntries([], procedures.current())).toBe(false);
    expect(sameProcedureEntries([entry('p1')], procedures.current())).toBe(true);
    expect(sameProcedureEntries([entry('p1')], [entry('p1', '「事实核查」不能就所选文字运行：…')])).toBe(false);
  });

  it('counts only the latest read\'s answer, keeps the last answer when a read fails, and records nothing once the editor is gone', async () => {
    const pending: Array<(value: number) => void> = [];
    let fail = false;
    const reader = latestAnswer<number>(() => fail ? Promise.reject(new Error('读不到')) : new Promise((resolve) => { pending.push(resolve); }));
    const first = reader.refresh();
    const second = reader.refresh();
    pending[1]!(2);
    await second;
    pending[0]!(1);
    await first;
    expect(reader.current()).toBe(2);
    fail = true;
    await reader.refresh();
    expect(reader.current()).toBe(2);
    const gone = latestAnswer(async () => 3, () => false);
    await gone.refresh();
    expect(gone.current()).toBeNull();
  });
});
