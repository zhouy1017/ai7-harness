import { expect, it } from 'vitest';
import { readingBlockId } from '../../src/renderer/editor.js';

it('names the caret paragraph while it shows, and the paragraph at the middle of the pane once it does not (#1703)', () => {
  const pane = { top: 100, bottom: 700 };
  // Five paragraphs of 300 px, scrolled 859 px down as in the Issue: the first two are above the pane, the third crosses its top.
  const blocks = ['a', 'b', 'c', 'd', 'e'].map((blockId, index) => ({ blockId, top: 100 - 859 + index * 300, bottom: 100 - 859 + (index + 1) * 300 }));
  expect(readingBlockId(pane, blocks, 'a')).toBe('d');
  expect(readingBlockId(pane, blocks, 'c')).toBe('c');
  expect(readingBlockId(pane, blocks, 'e')).toBe('e');
  // A caret left on another window by paging names nothing here; past the last paragraph the last one answers.
  expect(readingBlockId(pane, blocks, undefined)).toBe('d');
  expect(readingBlockId(pane, blocks.slice(0, 2), 'gone')).toBe('b');
  // A pane not laid out compares nothing: the caret answers, and without one the window's first paragraph.
  const flat = blocks.map(({ blockId }) => ({ blockId, top: 0, bottom: 0 }));
  expect(readingBlockId({ top: 0, bottom: 0 }, flat, 'c')).toBe('c');
  expect(readingBlockId({ top: 0, bottom: 0 }, flat, undefined)).toBe('a');
});
