import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { deriveSpanEdit, followSpanEdit } from '../shared/mark-anchor.js';
import type { EditorialMarkAnchorProjection, EditorialMarkKind } from '../shared/protocol.js';
import { markPointKind, markPointLabel } from './editorial-mark-labels.js';
import { AI_LOCK_BADGE_UNLOCK, AI_LOCK_TOOLTIP } from './scoped-ai-edit.js';

// The marks drawn over the manuscript window (Issue #1178, F-10 outcome 3): one DecorationSet kept in the plugin's state and
// changed only where something changed — a caret move draws nothing again, a card opened or closed redraws the paragraphs of
// the two marks it moves between, a decision the paragraph of the mark decided, an edit the paragraph it changed — instead of
// every mark of the window on every transaction. What each paragraph's decorations are is unchanged.

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

const MARK_LINE_PRIORITY: ReadonlyArray<EditorialMarkKind> = ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight'];

/** The words on an applied revision's badge (Issue #1411): the editor's own and an accepted AI7 修改建议 alike. */
export const APPLIED_BADGE_TEXT = '✎ 已改';

/** What the badge says it opens; a deletion names the words it took away. */
export function appliedBadgeTitle(mark: Pick<EditorialMarkAnchorProjection, 'deletedText'>): string {
  const excerpt = mark.deletedText === null ? null : Array.from(mark.deletedText).slice(0, 24).join('');
  return excerpt === null ? '已修改 · 点击查看修订卡片（修改前后对照，可撤销）'
    : `原文：「${excerpt}${Array.from(mark.deletedText!).length > 24 ? '…' : ''}」已删去 · 点击查看修订卡片`;
}

/** An applied 修改建议 whose words still stand where it wrote them: it carries the applied tint, line and badge. */
export function isAppliedRevision(mark: Pick<EditorialMarkAnchorProjection, 'kind' | 'status'>): boolean {
  return mark.kind === 'change-suggestion' && mark.status === 'applied';
}

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
  /** A supporting card's linked range; independent of the full card's proposed-text preview. */
  linked?(): string | undefined;
  /** 🔒 锁定 (Issue #1412): the window's blocks the AI may not change, drawn with their badge. */
  locked?(): ReadonlyArray<string> | undefined;
  /** null/undefined shows every mark; a set dims the marks outside the comments filter. */
  visibleMarkIds?(): ReadonlySet<string> | null;
  /** The durable text as it was last read: when it is read again, every mark is drawn again. */
  generation(): unknown;
}

/** The transaction meta that says the marks or the active mark changed. */
export const MARK_DECORATIONS_META = 'ai7-editorial-marks';

interface MarkDecorationState {
  readonly set: DecorationSet;
  readonly marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  readonly active: ActiveMark | undefined;
  readonly linked: string | undefined;
  readonly generation: unknown;
  readonly visibleMarkIds: ReadonlySet<string> | null | undefined;
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
  linkedMarkId?: string,
  aiLocked = false,
  visibleMarkIds?: ReadonlySet<string> | null,
): Decoration[] {
  const blockId = String(node.attrs['blockId']);
  const decorations: Decoration[] = [];
  if (aiLocked) {
    // 🔒 (Issue #1412): the block keeps its words whatever an AI edit returns; its badge unlocks it.
    decorations.push(Decoration.node(offset, offset + node.nodeSize, { 'data-ai-locked': 'true', title: AI_LOCK_TOOLTIP }, { blockId }));
    decorations.push(Decoration.widget(offset + 1, () => {
      const badge = window.document.createElement('button');
      badge.type = 'button';
      badge.className = 'ai-lock-badge';
      badge.contentEditable = 'false';
      badge.tabIndex = -1;
      badge.dataset['badge'] = '🔒';
      badge.title = `${AI_LOCK_TOOLTIP}（${AI_LOCK_BADGE_UNLOCK}）`;
      badge.setAttribute('aria-label', `${AI_LOCK_TOOLTIP}；${AI_LOCK_BADGE_UNLOCK}`);
      badge.dataset['aiLockAction'] = 'unlock';
      badge.dataset['aiLockBlock'] = blockId;
      badge.addEventListener('mousedown', (event) => { if (event.button === 0) event.preventDefault(); });
      return badge;
    }, { side: -1, ignoreSelection: true, key: `ai-lock:${blockId}`, blockId }));
  }
  const parts = graphemes(node.textContent);
  const local = baselineText !== undefined && baselineText !== node.textContent ? deriveSpanEdit(graphemes(baselineText), parts) : null;
  const position = (grapheme: number): number =>
    offset + 1 + parts.slice(0, Math.min(Math.max(0, grapheme), parts.length)).join('').length;
  let line: EditorialMarkKind | undefined;
  let revised = false;
  for (const mark of blockMarks) {
    const filteredOut = visibleMarkIds != null && !visibleMarkIds.has(mark.markId);
    const followed = local ? followSpanEdit(mark, local) : { ...mark, touched: false };
    const drifted = mark.anchorState === 'drifted' || followed.touched;
    if (mark.status === 'open' && (line === undefined || MARK_LINE_PRIORITY.indexOf(mark.kind) < MARK_LINE_PRIORITY.indexOf(line))) {
      line = mark.kind;
    }
    const from = position(followed.fromGrapheme);
    const to = position(followed.toGrapheme);
    // The applied revision's badge (Issue #1411), at the end of the words it wrote — or at the point a deletion left — and
    // a button: a click opens its card in the 批注栏, as a click on its words does.
    if (isAppliedRevision(mark) && !drifted) {
      revised = true;
      decorations.push(Decoration.widget(to, () => {
        const badge = window.document.createElement('button');
        badge.type = 'button';
        badge.className = 'editorial-mark-applied-badge';
        badge.contentEditable = 'false';
        badge.tabIndex = -1;
        // The words are drawn by the stylesheet, so they are never part of the paragraph's text, a copy or a search.
        badge.dataset['badge'] = APPLIED_BADGE_TEXT;
        badge.title = appliedBadgeTitle(mark);
        badge.setAttribute('aria-label', `${APPLIED_BADGE_TEXT} · ${badge.title}`);
        badge.dataset['appliedMarkId'] = mark.markId;
        badge.dataset['markSource'] = mark.sourceKind;
        badge.dataset['markCategory'] = mark.categoryKey;
        if (filteredOut) badge.dataset['markFilteredOut'] = 'true';
        badge.addEventListener('mousedown', (event) => {
          if (event.button === 0) event.preventDefault();
        });
        return badge;
      }, { side: 2, ignoreSelection: true, key: `applied:${mark.markId}:${mark.deletedText ?? ''}:${mark.sourceKind}:${mark.categoryKey}:${filteredOut}`, blockId }));
    }
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
        point.className = ['editorial-mark-point', `editorial-mark-point-${mark.kind}`, ...(active ? ['editorial-mark-active'] : []), ...(linkedMarkId === mark.markId ? ['manuscript-comments-anchor'] : [])].join(' ');
        point.contentEditable = 'false';
        point.setAttribute('role', 'img');
        point.setAttribute('aria-label', label);
        point.title = label;
        point.dataset['markId'] = mark.markId;
        point.dataset['markKind'] = mark.kind;
        point.dataset['markCategory'] = mark.categoryKey;
        if (filteredOut) point.dataset['markFilteredOut'] = 'true';
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
        key: `point:${mark.markId}:${mark.status}:${mark.disposition ?? ''}:${anchor}:${active ? 'active' : ''}:${label}:${mark.categoryKey}:${filteredOut}${linkedMarkId === mark.markId ? ':linked' : ''}`,
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
        ...(linkedMarkId === mark.markId ? ['manuscript-comments-anchor'] : []),
        ...(previewing ? ['editorial-mark-previewed'] : []),
      ].join(' '),
      'data-mark-id': mark.markId,
      'data-mark-kind': mark.kind,
      'data-mark-category': mark.categoryKey,
      ...(filteredOut ? { 'data-mark-filtered-out': 'true' } : {}),
      'data-mark-source': mark.sourceKind,
      'data-mark-status': mark.status,
      'data-mark-anchor': drifted ? 'drifted' : 'exact',
      ...(mark.highlightColor === null ? {} : { 'data-mark-color': String(mark.highlightColor) }),
      ...(mark.disposition === null ? {} : { 'data-mark-disposition': mark.disposition }),
    }, { blockId }));
    if (previewing) preview(to);
  }
  if (line !== undefined || revised) {
    // An open mark's line leads; a paragraph that holds only applied revisions shows the revision line (Issue #1411).
    decorations.push(Decoration.node(offset, offset + node.nodeSize, {
      class: 'has-editorial-mark',
      'data-mark-line': line ?? 'applied',
      ...(revised ? { 'data-mark-revised': 'true' } : {}),
    }, { blockId }));
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

/** Every mark of the window drawn over `doc`, with its AI-locked blocks. */
export function buildMarkDecorations(doc: ProseMirrorNode, source: MarkDecorationSource): DecorationSet {
  const marks = source.marks();
  const locked = new Set(source.locked?.() ?? []);
  if (marks.length === 0 && locked.size === 0) return DecorationSet.empty;
  const byBlock = marksByBlock(marks);
  const active = source.active();
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    const blockId = String(node.attrs['blockId']);
    const blockMarks = byBlock.get(blockId);
    if (blockMarks || locked.has(blockId)) decorations.push(...blockMarkDecorations(node, offset, blockMarks ?? [], source.baselineText(blockId), active, source.linked?.(), locked.has(blockId), source.visibleMarkIds?.()));
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
  linkedBefore?: string,
  linkedAfter?: string,
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
  if (linkedBefore !== linkedAfter) {
    for (const markId of [linkedBefore, linkedAfter]) {
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
  const locked = new Set(source.locked?.() ?? []);
  const active = source.active();
  const stale: Decoration[] = [];
  const fresh: Decoration[] = [];
  doc.forEach((node, offset) => {
    const blockId = String(node.attrs['blockId']);
    if (!blocks.has(blockId)) return;
    stale.push(...set.find(offset, offset + node.nodeSize, (spec: { blockId?: string }) =>
      spec.blockId === blockId || (spec.blockId !== undefined && !present.has(spec.blockId))));
    const blockMarks = byBlock.get(blockId);
    if (blockMarks || locked.has(blockId)) fresh.push(...blockMarkDecorations(node, offset, blockMarks ?? [], source.baselineText(blockId), active, source.linked?.(), locked.has(blockId), source.visibleMarkIds?.()));
  });
  return set.remove(stale).add(doc, fresh);
}

/** The plugin that draws the window's marks, keeping its DecorationSet between transactions. */
export function markDecorationPlugin(source: MarkDecorationSource): Plugin<MarkDecorationState> {
  return new Plugin<MarkDecorationState>({
    state: {
      init: (_config, state: EditorState) => ({ set: buildMarkDecorations(state.doc, source), marks: source.marks(), active: source.active(), linked: source.linked?.(), generation: source.generation(), visibleMarkIds: source.visibleMarkIds?.() }),
      apply: (tr, previous) => {
        const generation = source.generation();
        if (generation !== previous.generation) return { set: buildMarkDecorations(tr.doc, source), marks: source.marks(), active: source.active(), linked: source.linked?.(), generation, visibleMarkIds: source.visibleMarkIds?.() };
        const marked = tr.getMeta(MARK_DECORATIONS_META) === true;
        if (!marked && !tr.docChanged) return previous;
        const marks = source.marks();
        const active = source.active();
        const linked = source.linked?.();
        const visibleMarkIds = source.visibleMarkIds?.();
        const blocks = marked ? changedMarkBlocks(previous.marks, marks, previous.active, active, previous.linked, linked) : new Set<string>();
        if (visibleMarkIds !== previous.visibleMarkIds) {
          for (const mark of marks) if ((visibleMarkIds?.has(mark.markId) ?? true) !== (previous.visibleMarkIds?.has(mark.markId) ?? true)) blocks.add(mark.blockId);
        }
        if (tr.docChanged) for (const blockId of editedBlocks(tr)) blocks.add(blockId);
        const mapped = tr.docChanged ? previous.set.map(tr.mapping, tr.doc) : previous.set;
        return { set: redrawBlocks(mapped, tr.doc, blocks, source), marks, active, linked, generation, visibleMarkIds };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.set ?? DecorationSet.empty;
      },
    },
  });
}
