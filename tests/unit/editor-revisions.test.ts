import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { readingRevisionBlocksInput, readingRevisionKey } from '../../src/renderer/editor-input-mode.js';
import { QUICK_REVISE_TOO_MANY_LINES, QUICK_REVISE_UNCHANGED, spanRevisionSegments } from '../../src/renderer/editor-revisions.js';
import { APPLIED_BADGE_TEXT, blockMarkDecorations } from '../../src/renderer/mark-decorations.js';
import { searchContextParts } from '../../src/renderer/manuscript-search-labels.js';
import type { EditorialMarkAnchorProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

// 阅读与修订模式 and the editor's revisions (Issue #1411), and the find panel's highlighted contexts (Issue #1409): the pure parts.

const key = (key: string, extra: Partial<Pick<KeyboardEvent, 'altKey' | 'shiftKey'>> = {}) => ({ key, altKey: false, shiftKey: false, ...extra });

describe('阅读与修订模式', () => {
  it('lets reading, moving, selecting, copying and commands through and stops writing keys', () => {
    for (const reads of ['ArrowLeft', 'ArrowDown', 'Home', 'End', 'PageDown', 'Shift', 'Escape', 'Tab', 'ContextMenu', 'F3']) expect(readingRevisionKey(key(reads), false)).toBeNull();
    for (const command of ['c', 'a', 'f', 's', 'z', 'h']) expect(readingRevisionKey(key(command), true)).toBeNull();
    for (const writes of ['甲', 'a', ' ', 'Enter']) expect(readingRevisionKey(key(writes), false)).toBe('revise');
    expect(readingRevisionKey(key('Enter', { shiftKey: true }), false)).toBe('revise');
    for (const removes of ['Backspace', 'Delete']) {
      expect(readingRevisionKey(key(removes), false)).toBe('block');
      expect(readingRevisionKey(key(removes), true)).toBe('block');
    }
    for (const clipboard of ['x', 'V']) expect(readingRevisionKey(key(clipboard), true)).toBe('block');
  });

  it('refuses every writing input but an input method composing, which the transaction guard refuses at its end', () => {
    for (const writes of ['insertText', 'insertFromPaste', 'insertFromDrop', 'deleteContentBackward', 'deleteByCut', 'insertParagraph']) expect(readingRevisionBlocksInput(writes)).toBe(true);
    for (const passes of ['insertCompositionText', 'historyUndo', '']) expect(readingRevisionBlocksInput(passes)).toBe(false);
  });
});

describe('修改此处 across paragraphs', () => {
  const texts = new Map([['b1', '甲乙丙丁'], ['b2', '戊己庚'], ['b3', '辛壬癸']]);
  const span = [
    { blockId: 'b1', blockDigest: 'd1', fromGrapheme: 2, toGrapheme: 4 },
    { blockId: 'b2', blockDigest: 'd2', fromGrapheme: 0, toGrapheme: 3 },
    { blockId: 'b3', blockDigest: 'd3', fromGrapheme: 0, toGrapheme: 1 },
  ];
  const textOf = (blockId: string) => texts.get(blockId);

  it('gives each changed paragraph its own line and leaves an unchanged one alone; a missing line deletes', () => {
    expect(spanRevisionSegments(span, textOf, '丙丁\n改过\n辛')).toEqual([{ ...span[1], text: '戊己庚', proposedText: '改过' }]);
    expect(spanRevisionSegments(span, textOf, '改丁')).toEqual([
      { ...span[0], text: '丙丁', proposedText: '改丁' },
      { ...span[1], text: '戊己庚', proposedText: '' },
      { ...span[2], text: '辛', proposedText: '' },
    ]);
  });

  it('refuses more lines than paragraphs and a text that did not change, never truncating', () => {
    expect(spanRevisionSegments(span, textOf, 'a\nb\nc\nd')).toBe(QUICK_REVISE_TOO_MANY_LINES);
    expect(spanRevisionSegments(span, textOf, '丙丁\n戊己庚\n辛')).toBe(QUICK_REVISE_UNCHANGED);
  });
});

describe('✎ 已改 and 🔒 in the text', () => {
  const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', attrs: { blockId: { default: '' } }, toDOM: () => ['p', 0] }, text: {} } });
  const mark = (changes: Partial<EditorialMarkAnchorProjection>): EditorialMarkAnchorProjection => ({
    markId: 'm1', kind: 'change-suggestion', blockId: 'b1', fromGrapheme: 1, toGrapheme: 3, anchorState: 'exact', status: 'applied', highlightColor: null,
    sourceKind: 'ai7', sourceOrigin: 'task', sourceLabel: '校对', categoryKey: 'other', categoryLabel: '校对', disposition: 'accepted', deletedText: null, insertedText: null, conflict: null, ...changes,
  }) as EditorialMarkAnchorProjection;
  const node = schema.node('paragraph', { blockId: 'b1' }, schema.text('甲乙丙丁'));
  const widgets = (decorations: ReturnType<typeof blockMarkDecorations>) => decorations.filter((decoration) => decoration.from === decoration.to);

  it('draws the applied badge after the words it wrote and at the point a deletion left, with the revision line', () => {
    const restore = installMiniDom();
    try {
      const written = blockMarkDecorations(node, 0, [mark({})], '甲乙丙丁', undefined);
      expect(widgets(written).map((decoration) => decoration.from)).toEqual([4]);
      const badge = (widgets(written)[0]!.spec as { key: string }).key;
      expect(badge).toBe('applied:m1::ai7:other:false');
      const deleted = blockMarkDecorations(node, 0, [mark({ fromGrapheme: 2, toGrapheme: 2, deletedText: '删去的字' })], '甲乙丙丁', undefined);
      expect(widgets(deleted).map((decoration) => (decoration.spec as { key: string }).key)).toEqual(['applied:m1:删去的字:ai7:other:false', expect.stringMatching(/^point:m1:/u)]);
      expect(APPLIED_BADGE_TEXT).toBe('✎ 已改');
      const line = written.find((decoration) => decoration.from === 0 && decoration.to === node.nodeSize);
      expect((line as unknown as { type: { attrs: Record<string, string> } }).type.attrs).toMatchObject({ 'data-mark-line': 'applied', 'data-mark-revised': 'true' });
      // A drifted revision is no longer where it wrote: no badge.
      expect(widgets(blockMarkDecorations(node, 0, [mark({ anchorState: 'drifted' })], '甲乙丙丁', undefined))).toHaveLength(0);
    } finally { restore(); }
  });

  it('marks a locked block and puts its unlocking badge first, with no marks at all', () => {
    const locked = blockMarkDecorations(node, 0, [], '甲乙丙丁', undefined, undefined, true);
    expect(locked.map((decoration) => (decoration.spec as { key?: string }).key ?? 'node')).toEqual(['node', 'ai-lock:b1']);
    expect((locked[0] as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-ai-locked']).toBe('true');
  });
});

describe('the find panel’s contexts', () => {
  it('marks every occurrence of the query and keeps the words around it', () => {
    expect(searchContextParts('甲天乙天', '天')).toEqual([{ text: '甲', match: false }, { text: '天', match: true }, { text: '乙', match: false }, { text: '天', match: true }]);
    expect(searchContextParts('无', '天')).toEqual([{ text: '无', match: false }]);
  });
});
