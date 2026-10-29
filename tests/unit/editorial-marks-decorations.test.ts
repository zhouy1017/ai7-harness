import { performance } from 'node:perf_hooks';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Decoration, DecorationSet, DecorationSource } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import type { EditorialMarkAnchorProjection } from '../../src/shared/protocol.js';
import { buildMarkDecorations, markDecorationPlugin, MARK_DECORATIONS_META, type ActiveMark } from '../../src/renderer/mark-decorations.js';

// Unit (L1) benchmark for the marks drawn over the manuscript window (Issue #1178, F-10 outcome 3): 1,000 synthetic marks — four on
// each of 250 synthetic paragraphs, no manuscript text — kept in the plugin's DecorationSet. What the view compares is each
// paragraph's own decoration set: one the update left is the very same object, and the view keeps that paragraph's DOM without
// comparing it again. A caret move redraws no paragraph, a card opened the two its marks are in, a decision one, a keystroke one;
// drawing every mark again — what each transaction did before — gives every paragraph a new set. Each result is exactly what a
// full drawing gives. Time bounds are generous for a loaded test guest; the PR records the measured numbers.

const BLOCKS = 250;
const PER_BLOCK = 4;
const TEXT = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往';
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { blockId: { default: '' } }, toDOM: () => ['p', 0] },
    text: {},
  },
});
const blockId = (index: number) => `blk_${index.toString(16).padStart(24, '0')}`;
const KINDS = ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight'] as const;

function marks(): EditorialMarkAnchorProjection[] {
  return Array.from({ length: BLOCKS * PER_BLOCK }, (_, index) => {
    const slot = index % PER_BLOCK;
    const [from, to] = ([[0, 3], [5, 9], [12, 12], [20, 26]] as const)[slot]!;
    return {
      markId: `m${index}`, kind: KINDS[slot]!, blockId: blockId(Math.floor(index / PER_BLOCK)), fromGrapheme: from, toGrapheme: to, anchorState: 'exact',
      status: 'open', highlightColor: slot === 3 ? 1 : null, sourceKind: 'editor', disposition: null, deletedText: null, insertedText: null, conflict: null,
    } as EditorialMarkAnchorProjection;
  });
}

function setup() {
  const doc = schema.node('doc', null, Array.from({ length: BLOCKS }, (_, index) => schema.node('paragraph', { blockId: blockId(index) }, schema.text(TEXT))));
  const source = { current: marks(), active: undefined as ActiveMark | undefined, generation: {} as object };
  const drawn = { marks: () => source.current, baselineText: () => TEXT, active: () => source.active, generation: () => source.generation };
  const plugin = markDecorationPlugin(drawn);
  let state = EditorState.create({ doc, plugins: [plugin] });
  const set = () => plugin.getState(state)!.set;
  let worst = 0;
  /** Apply one update and count the paragraphs whose decoration set it replaced. */
  const apply = (tr: Transaction): number => {
    const before = paragraphSets(set(), state.doc);
    state = state.apply(tr);
    const after = paragraphSets(set(), state.doc);
    const redrawn = after.filter((child, index) => child !== before[index]).length;
    worst = Math.max(worst, redrawn);
    return redrawn;
  };
  /** Every mark drawn again over the window, as a transaction used to. */
  const drawAll = () => buildMarkDecorations(state.doc, drawn);
  return { source, set, apply, drawAll, state: () => state, worst: () => worst };
}

function paragraphSets(set: DecorationSet, doc: ProseMirrorNode): DecorationSource[] {
  const sets: DecorationSource[] = [];
  doc.forEach((node, offset) => sets.push(set.forChild(offset, node)));
  return sets;
}

function signature(decorations: ReadonlyArray<Decoration>): string[] {
  return decorations.map((decoration) => JSON.stringify([decoration.from, decoration.to, decoration.spec, (decoration as unknown as { type: { attrs?: unknown } }).type.attrs ?? null])).sort();
}

/** A fixed walk over the window, so every run measures the same updates. */
function walk(): () => number {
  let step = 0;
  return () => (step = (step * 7919 + 104729) % 1_000_003);
}

function timed(run: () => void, times: number): number {
  const started = performance.now();
  for (let index = 0; index < times; index += 1) run();
  return (performance.now() - started) / times;
}

describe('1,000 marks over the manuscript window', () => {
  it('draws every mark once; a caret move redraws no paragraph, where drawing every mark again replaced all 250', () => {
    const { set, apply, drawAll, state, worst } = setup();
    expect(set().find()).toHaveLength(BLOCKS * PER_BLOCK + BLOCKS);
    expect(signature(set().find())).toEqual(signature(drawAll().find()));
    const full = paragraphSets(drawAll(), state().doc);
    expect(paragraphSets(set(), state().doc).filter((child, index) => child !== full[index])).toHaveLength(BLOCKS);
    const before = set();
    const next = walk();
    const perMove = timed(() => apply(state().tr.setSelection(TextSelection.create(state().doc, 2 + next() % 1000))), 200);
    const perFullDrawing = timed(() => drawAll(), 20);
    expect(set()).toBe(before);
    expect(worst()).toBe(0);
    expect(perMove).toBeLessThan(5);
    console.info(`[#1178 benchmark] caret move: 0 of ${BLOCKS} paragraphs redrawn, ${perMove.toFixed(3)} ms; drawing all ${BLOCKS * PER_BLOCK} marks again: ${BLOCKS} paragraphs, ${perFullDrawing.toFixed(3)} ms`);
  });

  it('opening another mark\'s card redraws at most the two paragraphs it moves between, exactly as a full drawing', () => {
    const { source, set, apply, drawAll, state, worst } = setup();
    const pick = walk();
    const perOpen = timed(() => {
      const next = pick() % (BLOCKS * PER_BLOCK);
      source.active = { markId: `m${next}`, previewText: next % PER_BLOCK === 0 ? '替换' : null };
      apply(state().tr.setMeta(MARK_DECORATIONS_META, true));
    }, 100);
    expect(worst()).toBeLessThanOrEqual(2);
    expect(signature(set().find())).toEqual(signature(drawAll().find()));
    expect(perOpen).toBeLessThan(10);
    console.info(`[#1178 benchmark] card open: at most ${worst()} of ${BLOCKS} paragraphs redrawn, ${perOpen.toFixed(3)} ms per open`);
  });

  it('a decision on one mark — the window\'s marks read again whole — redraws that mark\'s paragraph only', () => {
    const { source, set, apply, drawAll, state, worst } = setup();
    const pick = walk();
    const perDecision = timed(() => {
      const decided = (pick() % BLOCKS) * PER_BLOCK;
      source.current = structuredClone(source.current).map((mark, index) => index !== decided ? mark
        : { ...mark, status: mark.status === 'open' ? 'resolved' : 'open', disposition: mark.status === 'open' ? 'accepted' : null } as EditorialMarkAnchorProjection);
      expect(apply(state().tr.setMeta(MARK_DECORATIONS_META, true))).toBe(1);
    }, 50);
    expect(worst()).toBe(1);
    expect(signature(set().find())).toEqual(signature(drawAll().find()));
    expect(perDecision).toBeLessThan(20);
    console.info(`[#1178 benchmark] decision: ${worst()} of ${BLOCKS} paragraphs redrawn, ${perDecision.toFixed(3)} ms per decision (marks compared whole)`);
  });

  it('draws every mark again once the durable text is read again, at the next transaction', () => {
    const { source, apply, state } = setup();
    source.generation = {};
    expect(apply(state().tr.setSelection(TextSelection.create(state().doc, 3)))).toBe(BLOCKS);
    expect(apply(state().tr.setSelection(TextSelection.create(state().doc, 4)))).toBe(0);
  });

  it('typing in one paragraph redraws that paragraph, its marks following the typed text, exactly as a full drawing', () => {
    const { apply, set, drawAll, state, worst } = setup();
    const pick = walk();
    const perKey = timed(() => {
      const paragraph = pick() % BLOCKS;
      let at = 0;
      state().doc.forEach((node, offset, index) => { if (index === paragraph) at = offset + 1 + 4; });
      apply(state().tr.insertText('新', at));
    }, 100);
    expect(worst()).toBe(1);
    expect(signature(set().find())).toEqual(signature(drawAll().find()));
    expect(perKey).toBeLessThan(10);
    console.info(`[#1178 benchmark] keystroke: ${worst()} of ${BLOCKS} paragraphs redrawn, ${perKey.toFixed(3)} ms per key`);
  });
});
