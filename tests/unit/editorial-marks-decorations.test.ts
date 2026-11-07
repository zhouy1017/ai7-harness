import { performance } from 'node:perf_hooks';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Decoration, DecorationSet, DecorationSource } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import type { EditorialMarkAnchorProjection } from '../../src/shared/protocol.js';
import { buildMarkDecorations, markDecorationPlugin, MARK_DECORATIONS_META, type ActiveMark } from '../../src/renderer/mark-decorations.js';
import { installMiniDom } from '../support/mini-dom.js';
import { editorMotionPlugin, EDITOR_MOTION_META } from '../../src/renderer/editor-motion.js';

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

it('highlights a jumped-to paragraph and the applied grapheme range without changing manuscript text', () => {
  const doc = schema.node('doc', null, [schema.node('paragraph', { blockId: 'target' }, schema.text('甲👩‍💻乙丙'))]);
  const plugin = editorMotionPlugin();
  let state = EditorState.create({ doc, plugins: [plugin] });
  state = state.apply(state.tr.setMeta(EDITOR_MOTION_META, { blockId: 'target' }));
  expect(plugin.getState(state)!.find()).toHaveLength(1);
  state = state.apply(state.tr.setMeta(EDITOR_MOTION_META, { blockId: 'target', range: { fromGrapheme: 1, toGrapheme: 2 } }));
  const [underline] = plugin.getState(state)!.find();
  expect(state.doc.textBetween(underline!.from, underline!.to)).toBe('👩‍💻');
  expect(state.doc.eq(doc)).toBe(true);
  state = state.apply(state.tr.setMeta(EDITOR_MOTION_META, null));
  expect(plugin.getState(state)!.find()).toHaveLength(0);
  expect(state.doc.eq(doc)).toBe(true);
});
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
  const source = { current: marks(), active: undefined as ActiveMark | undefined, linked: undefined as string | undefined, generation: {} as object };
  const drawn = { marks: () => source.current, baselineText: () => TEXT, active: () => source.active, linked: () => source.linked, generation: () => source.generation };
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

function inlineClasses(set: DecorationSet, markId: string): string {
  const attrs = set.find().map((decoration) => (decoration as unknown as { type: { attrs?: Record<string, string> } }).type.attrs)
    .find((attributes) => attributes?.['data-mark-id'] === markId);
  return attrs?.['class'] ?? '';
}

it('keeps the linked highlight in actual recomputed decorations across edits and generation reloads', () => {
  const { source, set, apply, drawAll, state } = setup();
  source.linked = 'm1'; source.active = { markId: 'm4', previewText: '独立建议预览' };
  const before = state().doc, selection = state().selection;
  expect(apply(state().tr.setMeta(MARK_DECORATIONS_META, true))).toBeLessThanOrEqual(2);
  expect(inlineClasses(set(), 'm1')).toContain('manuscript-comments-anchor');
  expect(inlineClasses(set(), 'm4')).toContain('editorial-mark-previewed');
  expect(state().doc.eq(before)).toBe(true); expect(state().selection.eq(selection)).toBe(true);
  apply(state().tr.insertText('新', 2));
  expect(inlineClasses(set(), 'm1')).toContain('manuscript-comments-anchor');
  expect(signature(set().find())).toEqual(signature(drawAll().find()));
  source.generation = {}; apply(state().tr.setSelection(TextSelection.create(state().doc, 3)));
  expect(inlineClasses(set(), 'm1')).toContain('manuscript-comments-anchor');
  expect(inlineClasses(set(), 'm4')).toContain('editorial-mark-previewed');
});

it('removes only the linked highlight when cleared while preserving the independent proposal and selection', () => {
  const { source, set, apply, state } = setup(); source.active = { markId: 'm4', previewText: '保留浮卡预览' };
  source.linked = 'm1'; apply(state().tr.setMeta(MARK_DECORATIONS_META, true));
  expect(inlineClasses(set(), 'm1')).toContain('manuscript-comments-anchor');
  const doc = state().doc, selection = state().selection;
  source.linked = undefined; expect(apply(state().tr.setMeta(MARK_DECORATIONS_META, true))).toBe(1);
  expect(inlineClasses(set(), 'm1')).not.toContain('manuscript-comments-anchor');
  expect(inlineClasses(set(), 'm4')).toContain('editorial-mark-previewed');
  expect(state().doc.eq(doc)).toBe(true); expect(state().selection.eq(selection)).toBe(true);
});

it('updates an actual point widget through the decoration owner when its linked highlight changes', () => {
  const restore = installMiniDom(); vi.stubGlobal('window', { document });
  try {
    const { source, set, apply, state } = setup(); source.linked = 'm2'; apply(state().tr.setMeta(MARK_DECORATIONS_META, true));
    const point = () => set().find().find((decoration) => decoration.from === decoration.to && decoration.spec['blockId'] === blockId(0))!;
    const render = (decoration: Decoration) => (decoration as unknown as { type: { toDOM(): HTMLElement } }).type.toDOM();
    const highlighted = point(); expect(render(highlighted).classList.contains('manuscript-comments-anchor')).toBe(true);
    source.linked = undefined; apply(state().tr.setMeta(MARK_DECORATIONS_META, true));
    expect(point().spec['key']).not.toBe(highlighted.spec['key']); expect(render(point()).classList.contains('manuscript-comments-anchor')).toBe(false);
  } finally { vi.unstubAllGlobals(); restore(); }
});
