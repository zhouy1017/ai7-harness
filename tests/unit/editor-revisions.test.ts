import { readFileSync } from 'node:fs';
import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { getAutoApplyEditorRevisions, setAutoApplyEditorRevisions } from '../../src/renderer/editor-input-mode.js';
import { computeInlineRevisionDiff, QUICK_REVISE_TOO_MANY_LINES, QUICK_REVISE_UNCHANGED, spanRevisionSegments } from '../../src/renderer/editor-revisions.js';
import { APPLIED_BADGE_TEXT, blockMarkDecorations } from '../../src/renderer/mark-decorations.js';
import { searchContextParts } from '../../src/renderer/manuscript-search-labels.js';
import type { EditorialMarkAnchorProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

// 阅读与修订模式 and the editor's revisions (Issue #1411), and the find panel's highlighted contexts (Issue #1409): the pure parts.

describe('inline editor revisions', () => {
  it('coalesces nearby grapheme edits, keeps distant spans separate and emits nothing for unchanged text', () => {
    expect(computeInlineRevisionDiff('甲👩‍💻乙丙丁', '甲🙂乙新丁')).toEqual([
      { fromGrapheme: 1, toGrapheme: 4, currentFromGrapheme: 1, beforeText: '👩‍💻乙丙', afterText: '🙂乙新' },
    ]);
    expect(computeInlineRevisionDiff('甲乙', '甲乙')).toEqual([]);
    const middle = '甲乙丙丁'.repeat(300);
    expect(computeInlineRevisionDiff('始' + middle + '终', '新' + middle + '尾')).toHaveLength(2);
    expect(computeInlineRevisionDiff('甲乙', '甲')).toMatchObject([{ beforeText: '乙', afterText: '' }]);
    expect(computeInlineRevisionDiff('甲', '甲乙')).toMatchObject([{ beforeText: '', afterText: '乙' }]);
  });

  it('keeps a half-clause rewrite in one revision despite shared characters (#1539 N.1)', () => {
    expect(computeInlineRevisionDiff('他昨天在书房里仔细核对了第三章的引文', '他昨晚在案头认真查核了这一章的全部引文')).toEqual([
      { fromGrapheme: 2, toGrapheme: 16, currentFromGrapheme: 2,
        beforeText: '天在书房里仔细核对了第三章的', afterText: '晚在案头认真查核了这一章的全部' },
    ]);
  });

  it.each(['\r', '\n', '，', '。', '！', '？', '；', '：', '、', ',', '.', ';', ':', '!', '?'])('keeps edits across clause boundary %j separate', (boundary) => {
    expect(computeInlineRevisionDiff(`甲乙${boundary}丙丁`, `新乙${boundary}尾丁`)).toEqual([
      { fromGrapheme: 0, toGrapheme: 1, currentFromGrapheme: 0, beforeText: '甲', afterText: '新' },
      { fromGrapheme: 3, toGrapheme: 4, currentFromGrapheme: 3, beforeText: '丙', afterText: '尾' },
    ]);
  });

  it('bounds the unchanged gap by graphemes, including compound emoji', () => {
    const gap = '👩‍💻'.repeat(6);
    expect(computeInlineRevisionDiff(`始${gap}终`, `新${gap}尾`)).toEqual([
      { fromGrapheme: 0, toGrapheme: 8, currentFromGrapheme: 0, beforeText: `始${gap}终`, afterText: `新${gap}尾` },
    ]);
    expect(computeInlineRevisionDiff(`始${gap}甲终`, `新${gap}甲尾`)).toHaveLength(2);
  });

  it('preserves current offsets when insertions and deletions coalesce after another clause', () => {
    expect(computeInlineRevisionDiff('甲，乙丙丁戊', '甲新，丙改丁戊')).toEqual([
      { fromGrapheme: 1, toGrapheme: 1, currentFromGrapheme: 1, beforeText: '', afterText: '新' },
      { fromGrapheme: 2, toGrapheme: 4, currentFromGrapheme: 3, beforeText: '乙丙', afterText: '丙改' },
    ]);
  });

  it('also coalesces nearby edits on the long-paragraph diff path', () => {
    const middle = '甲乙丙丁'.repeat(300);
    expect(computeInlineRevisionDiff(`始同旧${middle}终`, `新同改${middle}尾`)).toEqual([
      { fromGrapheme: 0, toGrapheme: 3, currentFromGrapheme: 0, beforeText: '始同旧', afterText: '新同改' },
      { fromGrapheme: 1203, toGrapheme: 1204, currentFromGrapheme: 1203, beforeText: '终', afterText: '尾' },
    ]);
  });
  it('defaults to auto apply when preference storage is unavailable', () => {
    expect(getAutoApplyEditorRevisions()).toBe(true);
    expect(() => setAutoApplyEditorRevisions(false)).not.toThrow();
    expect(getAutoApplyEditorRevisions()).toBe(false);
    setAutoApplyEditorRevisions(true);
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

  it('draws a single draft redline for interleaved edits in one clause', () => {
    const revised = schema.node('paragraph', { blockId: 'b1' }, schema.text('他昨晚在案头认真查核了这一章的全部引文'));
    const decorations = blockMarkDecorations(revised, 0, [], undefined, undefined, undefined, false, undefined, '他昨天在书房里仔细核对了第三章的引文');
    expect(widgets(decorations).map((decoration) => decoration.spec.key)).toEqual([
      'inline-del:draft:b1:0:天在书房里仔细核对了第三章的:false',
    ]);
    expect(decorations.filter((decoration) => decoration.from !== decoration.to).map(({ from, to }) => [from, to])).toEqual([[3, 18], [0, revised.nodeSize]]);
  });

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

it('keeps a paragraph where it stands when it gets its first revision line: every left line and padding add up alike (#1523)', () => {
  const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  const rule = (selector: string): string => {
    const at = css.indexOf(`\n${selector} {`);
    return at < 0 ? '' : css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  };
  const inset = (body: string): number => {
    const width = Number(/border-(?:left|inline-start)(?:-width)?:\s*([\d.]+)px/u.exec(body)?.[1]);
    const padding = /padding-(?:left|inline-start):\s*(?:calc\(\.65rem - ([\d.]+)px\)|(\.65rem))/u.exec(body);
    return width + 10.4 - Number(padding?.[1] ?? 0) + (padding === null ? Number.NaN : 0);
  };
  const plain = inset(rule('.ProseMirror [data-block-id]'));
  expect(plain).toBeCloseTo(12.4);
  for (const selector of ['.ProseMirror [data-block-id][data-mark-line]', '.ProseMirror [data-block-id][data-mark-revised="true"]', '.paragraph-revision-bar']) {
    expect(inset(rule(selector)), selector).toBeCloseTo(plain);
  }
});

describe('the find panel’s contexts', () => {
  it('marks every occurrence of the query and keeps the words around it', () => {
    expect(searchContextParts('甲天乙天', '天')).toEqual([{ text: '甲', match: false }, { text: '天', match: true }, { text: '乙', match: false }, { text: '天', match: true }]);
    expect(searchContextParts('无', '天')).toEqual([{ text: '无', match: false }]);
  });
});
