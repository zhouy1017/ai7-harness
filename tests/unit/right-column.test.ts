import { expect, it } from 'vitest';
import { createRightColumn } from '../../src/renderer/right-column.js';

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
