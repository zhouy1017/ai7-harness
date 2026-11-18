import { afterEach, expect, it, vi } from 'vitest';
import { createRightColumn, mountColumnMeasure } from '../../src/renderer/right-column.js';

it('restores the previous column in reverse opening order and keeps the explicit comments choice', () => {
  const column = createRightColumn(true);
  column.replaceComments('navigation');
  column.replaceComments('analysis');
  column.replaceComments('drawer');
  expect(column.commentsVisible()).toBe(false);
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

function measuredColumn(paneVisible: boolean): string {
  const root = { dataset: { rightColumn: 'wide' } }, body = { dataset: {} }, prose = {};
  const editor = { querySelector: () => prose };
  const pane = { classList: { contains: () => false }, getBoundingClientRect: () => ({ width: 303 }) };
  // The permanent rail is also an aside; a broad tag query must see it even with the pane closed.
  const edge = { classList: { contains: () => false }, getBoundingClientRect: () => ({ width: 76 }) };
  const workspace = { querySelector: (selector: string) => selector === '.editor-edge' ? edge
    : paneVisible ? pane : selector.includes('aside') ? edge : null,
    getBoundingClientRect: () => ({ width: 888 }) };
  const values: Record<string, string> = { '--sidebar-full-width': '14rem', '--sidebar-icons-width': '56px', '--manuscript-min-measure': '28' };
  vi.stubGlobal('innerWidth', 1164);
  vi.stubGlobal('document', { documentElement: root, body });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('getComputedStyle', (node: unknown) => node === root
    ? { fontSize: '16px', getPropertyValue: (key: string) => values[key] ?? '' }
    : node === editor ? { paddingLeft: '20px', paddingRight: '20px' }
      : node === body ? { paddingLeft: '224px', paddingRight: '0px' } : { fontSize: '17px' });
  const measure = mountColumnMeasure(workspace as unknown as HTMLElement, editor as unknown as HTMLElement);
  const mode = root.dataset.rightColumn;
  measure.destroy();
  return mode;
}

it('includes the screen gutters when deciding whether the full sidebar leaves the reading measure', () => {
  expect(measuredColumn(true)).toBe('icons');
});

it('releases the automatic layout when only the permanent edge rail remains', () => {
  expect(measuredColumn(false)).toBe('none');
});
