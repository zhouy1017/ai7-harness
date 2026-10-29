import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManuscriptRailProjection } from '../../src/shared/protocol.js';
import { mountPositionRail } from '../../src/renderer/position-rail.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// Unit (L1) benchmark for the Whole-manuscript Position Rail at 1,200 synthetic marks (Issue #1178, F-10 outcome 3) on a minimal DOM,
// counting the nodes each refresh creates and removes: a refresh after one decision keeps every marker whose slot it left alone —
// the same node, updated in place — where drawing the column again made every marker anew. Its selectors and words are unchanged.

const MARKS = 1_200;
const KINDS = ['change-suggestion', 'annotation', 'editor-note'] as const;
const blockId = (index: number) => `blk_${index.toString(16).padStart(24, '0')}`;

function rail(marks: ManuscriptRailProjection['marks']): ManuscriptRailProjection {
  return {
    manuscriptId: 'm', branchId: 'b', revisionId: 'r', journalSequence: 1, totalCharacters: 500_000, chaptersTruncated: false, marksTruncated: false,
    chapters: Array.from({ length: 40 }, (_, index) => ({ blockId: blockId(index * 10), title: `第${index + 1}章`, level: 1, proportion: index / 40, suggestions: 1, annotations: 1, notes: 1 })),
    marks, uncovered: [{ fromProportion: 0.5, toProportion: 0.52, reason: '未读' }],
  };
}
const MARKED = Array.from({ length: MARKS }, (_, index) => ({ kind: KINDS[index % 3]!, blockId: blockId(index), proportion: index / MARKS }));

let uninstall: () => void;
let created = 0;
beforeEach(() => {
  uninstall = installMiniDom();
  // The rail draws positions and inserts in order: the two things the minimal DOM leaves out, here and nowhere else.
  Object.defineProperty(MiniElement.prototype, 'style', { configurable: true, get(this: { _style?: Record<string, string> }) { return (this._style ??= {}); } });
  Object.defineProperty(MiniElement.prototype, 'insertBefore', { configurable: true, value(this: MiniElement, node: MiniElement, before: MiniElement | null) {
    node.remove();
    const at = before === null ? this.children.length : this.children.indexOf(before);
    this.children.splice(at, 0, node);
    node.parentElement = this;
    return node;
  } });
  const create = miniDocument.createElement.bind(miniDocument);
  created = 0;
  vi.spyOn(miniDocument, 'createElement').mockImplementation((tag: string) => { created += 1; return create(tag); });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (MiniElement.prototype as unknown as Record<string, unknown>)['style'];
  delete (MiniElement.prototype as unknown as Record<string, unknown>)['insertBefore'];
  uninstall();
});

async function mounted(first: ManuscriptRailProjection) {
  let next = first;
  const jumps: string[] = [];
  const track = miniDocument.createElement('div');
  miniDocument.body.append(track);
  const surface = mountPositionRail({ track: track as unknown as HTMLElement, api: { getManuscriptRail: async () => next }, binding: () => ({ manuscriptId: 'm', branchId: 'b' }),
    jumpToBlock: (target) => jumps.push(target), onError: (error) => { throw error; } });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const markers = () => track.querySelectorAll('.rail-marker');
  /** One refresh to `rail`: the nodes it created and removed, and how long it took to draw. */
  const refresh = async (to: ManuscriptRailProjection) => {
    next = to;
    const before = new Set([...markers(), ...track.querySelectorAll('.rail-tick'), ...track.querySelectorAll('.rail-gap')]);
    created = 0;
    const started = performance.now();
    surface.refresh();
    await settle();
    const elapsed = performance.now() - started;
    const after = new Set([...markers(), ...track.querySelectorAll('.rail-tick'), ...track.querySelectorAll('.rail-gap')]);
    return { created, removed: [...before].filter((node) => !after.has(node)).length, elapsed };
  };
  surface.refresh();
  await settle();
  return { markers, refresh, jumps };
}

describe('the Position Rail at 1,200 marks', () => {
  it('keeps every marker a decision left alone, creating and removing only the slot it moved', async () => {
    const { markers, refresh } = await mounted(rail(MARKED));
    expect(markers()).toHaveLength(480);
    const kept = new Set(markers());
    // Accepting the only 修改建议 of one slot: it leaves the rail; the slot's two other kinds stay.
    const decided = MARKED.filter((mark) => !(mark.kind === 'change-suggestion' && Math.floor(mark.proportion * 160) === 37));
    const once = await refresh(rail(decided));
    expect(once.created).toBe(0);
    expect(once.removed).toBe(1);
    expect(markers().filter((marker) => kept.has(marker))).toHaveLength(479);
    // Its return draws the one marker again; a refresh that moved nothing touches no node.
    expect(await refresh(rail(MARKED))).toMatchObject({ created: 1, removed: 0 });
    expect(await refresh(rail(MARKED))).toMatchObject({ created: 0, removed: 0 });
    // The order drawn stays: lanes in turn, each slot down the column.
    expect(markers().map((marker) => `${marker.dataset['railLane']}:${marker.dataset['railKind']}`)).toEqual(
      KINDS.flatMap((kind, lane) => Array.from({ length: 160 }, () => `${lane + 1}:${kind}`)));
    const timed = await refresh(rail(decided));
    expect(timed.elapsed).toBeLessThan(50);
    console.info(`[#1178 benchmark] rail refresh after a decision over ${MARKS} marks: ${timed.created} created, ${timed.removed} removed of 480 markers + 40 ticks + 1 gap, ${timed.elapsed.toFixed(3)} ms`);
  });

  it('keeps each kept marker\'s count, words and jump current', async () => {
    const { markers, refresh, jumps } = await mounted(rail(MARKED));
    const first = markers()[0]!;
    expect(first.getAttribute('aria-label')).toBe('修改建议 3 处，跳到这里');
    const moved = MARKED.map((mark, index) => index === 0 ? { ...mark, blockId: blockId(9_999) } : index === 3 ? { ...mark, proportion: 0.9 } : mark);
    await refresh(rail(moved));
    expect(markers()[0]).toBe(first);
    expect(first.dataset['railCount']).toBe('2');
    expect(first.getAttribute('aria-label')).toBe('修改建议 2 处，跳到这里');
    expect(first.title).toBe('修改建议 2 处');
    first.click();
    expect(jumps).toEqual([blockId(9_999)]);
  });
});
