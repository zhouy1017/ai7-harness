import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { deriveSpanEdit, followSpanEdit } from '../shared/mark-anchor.js';
import type { EditorialMarkAnchorProjection, EditorialMarkKind } from '../shared/protocol.js';
import { markPointKind, markPointLabel } from './editorial-mark-labels.js';

// The marks drawn over the manuscript window (Issue #1178, F-10 outcome 3): one DecorationSet kept in the plugin's state and
// changed only where something changed — a caret move draws nothing again, a card opened or closed redraws the paragraphs of
// the two marks it moves between, a decision the paragraph of the mark decided, an edit the paragraph it changed — instead of
// every mark of the window on every transaction. What each paragraph's decorations are is unchanged.

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

const MARK_LINE_PRIORITY: ReadonlyArray<EditorialMarkKind> = ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight'];

/** The mark open in its card, and the replacement its card previews in the text. */
export interface ActiveMark {
  readonly markId: string;
  readonly previewText: string | null;
}

/** What the decorations are drawn from: the window's marks, each paragraph's durable text, and the mark open in its card. */
export interface MarkDecorationSource {
  marks(): ReadonlyArray<EditorialMarkAnchorProjection>;
  baselineText(blockId: string): string | undefined;
  active(): ActiveMark | undefined;
  /** The durable text as it was last read: when it is read again, every mark is drawn again. */
  generation(): unknown;
}

/** The transaction meta that says the marks or the active mark changed. */
export const MARK_DECORATIONS_META = 'ai7-editorial-marks';

interface MarkDecorationState {
  readonly set: DecorationSet;
  readonly marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  readonly active: ActiveMark | undefined;
  readonly generation: unknown;
}

/**
 * Marks are drawn over the document, never written into it. Their ranges are grapheme ranges of
 * the durable text, so text typed and not yet acknowledged is followed here with the arithmetic the
 * service applies when the edit lands: a mark in front of the caret does not slide onto the wrong
 * characters while someone types, and one whose own text is being changed shows as drifted at once.
 */
export function blockMarkDecorations(
  node: ProseMirrorNode,
  offset: number,
  blockMarks: ReadonlyArray<EditorialMarkAnchorProjection>,
  baselineText: string | undefined,
  activeMark: ActiveMark | undefined,
): Decoration[] {
  const blockId = String(node.attrs['blockId']);
  const decorations: Decoration[] = [];
  const parts = graphemes(node.textContent);
  const local = baselineText !== undefined && baselineText !== node.textContent ? deriveSpanEdit(graphemes(baselineText), parts) : null;
  const position = (grapheme: number): number =>
    offset + 1 + parts.slice(0, Math.min(Math.max(0, grapheme), parts.length)).join('').length;
  let line: EditorialMarkKind | undefined;
  for (const mark of blockMarks) {
    const followed = local ? followSpanEdit(mark, local) : { ...mark, touched: false };
    const drifted = mark.anchorState === 'drifted' || followed.touched;
    if (mark.status === 'open' && (line === undefined || MARK_LINE_PRIORITY.indexOf(mark.kind) < MARK_LINE_PRIORITY.indexOf(line))) {
      line = mark.kind;
    }
    const from = position(followed.fromGrapheme);
    const to = position(followed.toGrapheme);
    const previewing = activeMark?.markId === mark.markId && activeMark.previewText !== null && !drifted;
    const preview = (at: number): void => {
      const previewText = activeMark!.previewText!;
      decorations.push(Decoration.widget(at, () => {
        const element = window.document.createElement('ins');
        element.className = 'editorial-mark-preview';
        element.contentEditable = 'false';
        element.dataset['markPreview'] = mark.markId;
        const proposed = window.document.createElement('span');
        proposed.className = 'editorial-mark-preview-text';
        proposed.textContent = previewText.length === 0 ? '（删去）' : previewText;
        const label = window.document.createElement('span');
        label.className = 'editorial-mark-preview-label';
        label.textContent = '预览 · 未应用';
        element.append(proposed, label);
        return element;
      }, { side: 1, key: `preview:${mark.markId}:${previewText}`, ignoreSelection: true, blockId }));
    };
    if (to <= from) {
      // No text is left under the mark — the point an applied deletion left, the point a pending
      // insertion would write at (Issue #411), or a mark whose own words an edit took away — so a point
      // is drawn there: no part of the document, no room in the line, text typed at it landing in front
      // of it, and a click on it opening the mark's card as a click on a mark does, without moving the
      // caret. A pending insertion whose card is open previews its words beside it.
      const label = markPointLabel(mark, drifted);
      const pointKind = markPointKind(mark);
      const active = activeMark?.markId === mark.markId;
      const anchor = drifted ? 'drifted' : 'exact';
      decorations.push(Decoration.widget(from, () => {
        const point = window.document.createElement('span');
        point.className = ['editorial-mark-point', `editorial-mark-point-${mark.kind}`, ...(active ? ['editorial-mark-active'] : [])].join(' ');
        point.contentEditable = 'false';
        point.setAttribute('role', 'img');
        point.setAttribute('aria-label', label);
        point.title = label;
        point.dataset['markId'] = mark.markId;
        point.dataset['markKind'] = mark.kind;
        point.dataset['markSource'] = mark.sourceKind;
        point.dataset['markStatus'] = mark.status;
        point.dataset['markAnchor'] = anchor;
        point.dataset['markPoint'] = pointKind;
        if (mark.disposition !== null) point.dataset['markDisposition'] = mark.disposition;
        point.addEventListener('mousedown', (event) => {
          if (event.button === 0) event.preventDefault();
        });
        return point;
      }, {
        side: 1,
        ignoreSelection: true,
        key: `point:${mark.markId}:${mark.status}:${mark.disposition ?? ''}:${anchor}:${active ? 'active' : ''}:${label}`,
        blockId,
      }));
      if (previewing && pointKind === 'insertion') preview(from);
      continue;
    }
    decorations.push(Decoration.inline(from, to, {
      class: [
        'editorial-mark',
        `editorial-mark-${mark.kind}`,
        ...(activeMark?.markId === mark.markId ? ['editorial-mark-active'] : []),
        ...(previewing ? ['editorial-mark-previewed'] : []),
      ].join(' '),
      'data-mark-id': mark.markId,
      'data-mark-kind': mark.kind,
      'data-mark-source': mark.sourceKind,
      'data-mark-status': mark.status,
      'data-mark-anchor': drifted ? 'drifted' : 'exact',
      ...(mark.highlightColor === null ? {} : { 'data-mark-color': String(mark.highlightColor) }),
      ...(mark.disposition === null ? {} : { 'data-mark-disposition': mark.disposition }),
    }, { blockId }));
    if (previewing) preview(to);
  }
  if (line !== undefined) {
    decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'has-editorial-mark', 'data-mark-line': line }, { blockId }));
  }
  return decorations;
}

function marksByBlock(marks: ReadonlyArray<EditorialMarkAnchorProjection>): Map<string, EditorialMarkAnchorProjection[]> {
  const byBlock = new Map<string, EditorialMarkAnchorProjection[]>();
  for (const mark of marks) {
    const list = byBlock.get(mark.blockId);
    if (list) list.push(mark);
    else byBlock.set(mark.blockId, [mark]);
  }
  return byBlock;
}

/** Every mark of the window drawn over `doc`. */
export function buildMarkDecorations(doc: ProseMirrorNode, source: MarkDecorationSource): DecorationSet {
  const marks = source.marks();
  if (marks.length === 0) return DecorationSet.empty;
  const byBlock = marksByBlock(marks);
  const active = source.active();
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    const blockId = String(node.attrs['blockId']);
    const blockMarks = byBlock.get(blockId);
    if (blockMarks) decorations.push(...blockMarkDecorations(node, offset, blockMarks, source.baselineText(blockId), active));
  });
  return DecorationSet.create(doc, decorations);
}

/** Each paragraph's marks in the order they are drawn, which the order of points at one position follows. */
function orderByBlock(marks: ReadonlyArray<EditorialMarkAnchorProjection>): Map<string, string> {
  const order = new Map<string, string>();
  for (const mark of marks) order.set(mark.blockId, `${order.get(mark.blockId) ?? ''}${mark.markId},`);
  return order;
}

/** The paragraphs whose drawing a change of the marks or of the mark open in its card moves. */
export function changedMarkBlocks(
  before: ReadonlyArray<EditorialMarkAnchorProjection>,
  after: ReadonlyArray<EditorialMarkAnchorProjection>,
  activeBefore: ActiveMark | undefined,
  activeAfter: ActiveMark | undefined,
): Set<string> {
  const blocks = new Set<string>();
  if (before !== after) {
    const old = new Map(before.map((mark) => [mark.markId, mark] as const));
    for (const mark of after) {
      const was = old.get(mark.markId);
      old.delete(mark.markId);
      if (was !== undefined && JSON.stringify(was) === JSON.stringify(mark)) continue;
      blocks.add(mark.blockId);
      if (was !== undefined) blocks.add(was.blockId);
    }
    for (const gone of old.values()) blocks.add(gone.blockId);
    const orderBefore = orderByBlock(before);
    for (const [blockId, order] of orderByBlock(after)) if (orderBefore.get(blockId) !== order) blocks.add(blockId);
  }
  if (activeBefore?.markId !== activeAfter?.markId || activeBefore?.previewText !== activeAfter?.previewText) {
    for (const markId of [activeBefore?.markId, activeAfter?.markId]) {
      const mark = markId === undefined ? undefined : after.find((entry) => entry.markId === markId) ?? before.find((entry) => entry.markId === markId);
      if (mark !== undefined) blocks.add(mark.blockId);
    }
  }
  return blocks;
}

/** The paragraphs of `tr.doc` an edit replaced: a paragraph the edit left alone is the same node it was. */
function editedBlocks(tr: Transaction): Set<string> {
  const before = new Set<ProseMirrorNode>();
  tr.before.forEach((node) => before.add(node));
  const blocks = new Set<string>();
  tr.doc.forEach((node) => {
    if (!before.has(node)) blocks.add(String(node.attrs['blockId']));
  });
  return blocks;
}

/**
 * The set with `blocks` drawn again over `doc`: their decorations taken out — with any a merge or a split left there under a
 * paragraph that is gone — and drawn from the marks as they are now.
 */
export function redrawBlocks(set: DecorationSet, doc: ProseMirrorNode, blocks: ReadonlySet<string>, source: MarkDecorationSource): DecorationSet {
  if (blocks.size === 0) return set;
  const present = new Set<string>();
  doc.forEach((node) => present.add(String(node.attrs['blockId'])));
  const byBlock = marksByBlock(source.marks());
  const active = source.active();
  const stale: Decoration[] = [];
  const fresh: Decoration[] = [];
  doc.forEach((node, offset) => {
    const blockId = String(node.attrs['blockId']);
    if (!blocks.has(blockId)) return;
    stale.push(...set.find(offset, offset + node.nodeSize, (spec: { blockId?: string }) =>
      spec.blockId === blockId || (spec.blockId !== undefined && !present.has(spec.blockId))));
    const blockMarks = byBlock.get(blockId);
    if (blockMarks) fresh.push(...blockMarkDecorations(node, offset, blockMarks, source.baselineText(blockId), active));
  });
  return set.remove(stale).add(doc, fresh);
}

/** The plugin that draws the window's marks, keeping its DecorationSet between transactions. */
export function markDecorationPlugin(source: MarkDecorationSource): Plugin<MarkDecorationState> {
  return new Plugin<MarkDecorationState>({
    state: {
      init: (_config, state: EditorState) => ({ set: buildMarkDecorations(state.doc, source), marks: source.marks(), active: source.active(), generation: source.generation() }),
      apply: (tr, previous) => {
        const generation = source.generation();
        if (generation !== previous.generation) return { set: buildMarkDecorations(tr.doc, source), marks: source.marks(), active: source.active(), generation };
        const marked = tr.getMeta(MARK_DECORATIONS_META) === true;
        if (!marked && !tr.docChanged) return previous;
        const marks = source.marks();
        const active = source.active();
        const blocks = marked ? changedMarkBlocks(previous.marks, marks, previous.active, active) : new Set<string>();
        if (tr.docChanged) for (const blockId of editedBlocks(tr)) blocks.add(blockId);
        const mapped = tr.docChanged ? previous.set.map(tr.mapping, tr.doc) : previous.set;
        return { set: redrawBlocks(mapped, tr.doc, blocks, source), marks, active, generation };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.set ?? DecorationSet.empty;
      },
    },
  });
}
