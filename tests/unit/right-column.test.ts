import { afterEach, expect, it, vi } from 'vitest';
import { createRightColumn, mountColumnMeasure } from '../../src/renderer/right-column.js';

it('restores the previous column in reverse opening order and keeps the explicit comments choice', () => {
  const column = createRightColumn(true);
  column.replaceComments('navigation');
  column.replaceComments('analysis');
  column.replaceComments('drawer');
  expect(column.commentsVisible()).toBe(false);
  expect([column.suspended('navigation'), column.suspended('drawer')]).toEqual([true, false]);
  column.restoreComments('drawer');
  expect(column.state()).toEqual({ commentsOpen: true, commentsReplacedBy: 'analysis' });
  column.restoreComments('analysis');
  expect(column.state().commentsReplacedBy).toBe('navigation');
  column.restoreComments('navigation');
  expect(column.commentsVisible()).toBe(true);
  column.setCommentsOpen(false);
  column.replaceComments('drawer'); column.restoreComments('drawer');
  expect(column.commentsVisible()).toBe(false);
});

afterEach(() => vi.unstubAllGlobals());

function measuredColumn(paneVisible: boolean, reading?: { top: (state: string | undefined) => number }) {
  const root: { dataset: Record<string, string | undefined> } = { dataset: { rightColumn: 'wide' } }, body = { dataset: {} }, prose = {};
  // The reading block moves with the state the shell lays out (the text reflows when the sidebar and gutters change).
  const block = reading && { getBoundingClientRect: () => { const top = reading.top(root.dataset['rightColumn']); return { top, bottom: top + 40 }; }, isConnected: true };
  const editor = { querySelector: () => prose, scrollTop: 1000, getBoundingClientRect: () => ({ top: 0, bottom: 600 }),
    querySelectorAll: () => (block ? [block] : []), contains: () => false };
  const pane = { classList: { contains: () => false }, getBoundingClientRect: () => ({ width: 303 }) };
  // The permanent rail is also an aside; a broad tag query must see it even with the pane closed.
  const edge = { classList: { contains: () => false }, getBoundingClientRect: () => ({ width: 76 }) };
  const workspace = { querySelectorAll: () => [], querySelector: (selector: string) => selector === '.editor-edge' ? edge
    : paneVisible ? pane : selector.includes('aside') ? edge : null,
    getBoundingClientRect: () => ({ width: 888 }) };
  const values: Record<string, string> = { '--sidebar-full-width': '14rem', '--sidebar-icons-width': '56px', '--manuscript-min-measure': '28' };
  vi.stubGlobal('innerWidth', 1164);
  vi.stubGlobal('document', { documentElement: root, body, getSelection: () => null });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('getComputedStyle', (node: unknown) => node === root
    ? { fontSize: '16px', getPropertyValue: (key: string) => values[key] ?? '' }
    : node === editor ? { paddingLeft: '20px', paddingRight: '20px' }
      : node === body ? { paddingLeft: '224px', paddingRight: '0px' } : { fontSize: '17px' });
  const measure = mountColumnMeasure(workspace as unknown as HTMLElement, editor as unknown as HTMLElement);
  return { mode: root.dataset['rightColumn'], editor, destroy: () => measure.destroy() };
}

it('includes the screen gutters when deciding whether the full sidebar leaves the reading measure', () => {
  const view = measuredColumn(true);
  expect(view.mode).toBe('icons');
  view.destroy();
});

it('releases the automatic layout when only the permanent edge rail remains', () => {
  const view = measuredColumn(false);
  expect(view.mode).toBe('none');
  view.destroy();
});

it('keeps the reading block where it was when a new state reflows the text', async () => {
  // Closing the pane gives the sidebar back its full width: the block across the middle of the text would drop 120 px.
  const view = measuredColumn(false, { top: (state) => state === 'none' ? 420 : 300 });
  expect(view.mode).toBe('none');
  await Promise.resolve();
  expect(view.editor.scrollTop).toBe(1120);
  view.destroy();
});
