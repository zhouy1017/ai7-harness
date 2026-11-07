import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ADMITTED_BASELINE_DOCX, sourceSpanText } from '../support/composed-fixture.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { createStatusSurface } from '../../src/renderer/notifications.js';
import { hideToast, showToast } from '../../src/renderer/components/toast.js';

type SavedEdit = { bookId: string; manuscriptId: string; branchId: string; blockId: string; journalSequence: number; text: string };
const { CAPTURE_JOURNAL_EDIT, journalEditPersisted } = await import(new URL('../../e2e/controller.mjs', import.meta.url).href) as {
  CAPTURE_JOURNAL_EDIT: string; journalEditPersisted(before: SavedEdit, suffix: string): string;
};
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { hideToast(); restore(); });

async function setup() {
  const text = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 1 });
  const suffix = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 2, from: 0, to: 3 });
  const screen = miniDocument.createElement('section'); screen.dataset['screen'] = 'editor';
  const shell = miniDocument.createElement('div'); shell.className = 'editor-shell'; shell.dataset['bookId'] = 'book';
  const editor = miniDocument.createElement('div'); editor.dataset['editorPersistence'] = 'confirmed'; editor.dataset['journalSequence'] = '1';
  const block = miniDocument.createElement('p'); block.dataset['blockId'] = 'block'; block.textContent = text;
  editor.append(block); shell.append(editor); screen.append(shell); miniDocument.body.append(screen);
  const scope = { kind: 'open-manuscript', manuscriptId: 'manuscript', branchId: 'branch' };
  const page = { bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', journalSequence: 1, blocks: [{ blockId: 'block', text }] };
  const api = { getBookOverview: vi.fn(async () => ({ book: { bookId: 'book' }, primaryAction: scope })), getManuscriptWindowAt: vi.fn(async () => page) };
  const evaluate = <T>(expression: string): Promise<T> => Promise.resolve(Function('window', 'document', `return (${expression})`)({ ai7: api }, miniDocument));
  const before = await evaluate<SavedEdit>(CAPTURE_JOURNAL_EDIT);
  expect(before !== null).toBe(true);
  block.textContent += suffix; editor.dataset['journalSequence'] = '2'; page.journalSequence = 2; page.blocks[0]!.text += suffix;
  return { before, suffix, shell, editor, scope, page, api, evaluate, read: () => evaluate<boolean>(journalEditPersisted(before, suffix)) };
}

it('verifies durable data after a competing toast replaces or expires the save notice', async () => {
  const test = await setup();
  showToast('已写入修订日志', { tone: 'success' });
  showToast('另一项操作已完成');
  expect(await test.read()).toBe(true);
  hideToast();
  expect(await test.read()).toBe(true);
  expect(test.api.getManuscriptWindowAt).toHaveBeenLastCalledWith({ manuscriptId: 'manuscript', branchId: 'branch', target: { kind: 'block', blockId: 'block' } });
});

it.each(['pending', 'not-advanced', 'wrong-book', 'wrong-manuscript', 'wrong-branch', 'wrong-block', 'wrong-content', 'authoritative-not-advanced', 'authoritative-wrong-branch', 'read-failed'] as const)('a saved toast cannot conceal %s', async (failure) => {
  const test = await setup();
  const status = miniDocument.createElement('div'); miniDocument.body.append(status);
  createStatusSurface(status as unknown as HTMLElement)('已写入修订日志', 'success');
  if (failure === 'pending') test.editor.dataset['editorPersistence'] = 'pending';
  if (failure === 'not-advanced') test.editor.dataset['journalSequence'] = '1';
  if (failure === 'wrong-book') test.shell.dataset['bookId'] = 'another-book';
  if (failure === 'wrong-manuscript') test.scope.manuscriptId = 'another-manuscript';
  if (failure === 'wrong-branch') test.scope.branchId = 'another-branch';
  if (failure === 'wrong-block') test.page.blocks[0]!.blockId = 'another-block';
  if (failure === 'wrong-content') test.page.blocks[0]!.text = test.before.text;
  if (failure === 'authoritative-not-advanced') test.page.journalSequence = 1;
  if (failure === 'authoritative-wrong-branch') test.page.branchId = 'another-branch';
  if (failure === 'read-failed') test.api.getManuscriptWindowAt.mockRejectedValueOnce(new Error('synthetic read refusal'));
  expect(await test.read()).toBe(false);
});

it('awaits the authoritative read and rejects unpersisted content', async () => {
  const test = await setup();
  const requested = Promise.withResolvers<void>();
  const result = Promise.withResolvers<typeof test.page>();
  test.api.getManuscriptWindowAt.mockImplementationOnce(() => { requested.resolve(); return result.promise; });
  let settled = false;
  const reading = test.read().then(value => { settled = true; return value; });
  await requested.promise;
  expect(settled).toBe(false);
  result.resolve({ ...test.page, blocks: [{ blockId: 'block', text: test.before.text }] });
  expect(await reading).toBe(false);
});
