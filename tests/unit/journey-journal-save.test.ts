import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ADMITTED_BASELINE_DOCX, sourceSpanText } from '../support/composed-fixture.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { createStatusSurface } from '../../src/renderer/notifications.js';
import { hideToast, showToast } from '../../src/renderer/components/toast.js';
import { readFileSync } from 'node:fs';

type SavedEdit = { bookId: string; manuscriptId: string; branchId: string; blockId: string; journalSequence: number; text: string; revisionId: string; workingDigest: string };
const { captureJournalEdit, CAPTURE_JOURNAL_EDIT, journalEditPersisted, milestonePersisted } = await import(new URL('../../e2e/controller.mjs', import.meta.url).href) as {
  captureJournalEdit(blockIndex: number): string; CAPTURE_JOURNAL_EDIT: string;
  journalEditPersisted(before: SavedEdit, suffix: string): string; milestonePersisted(before: SavedEdit, label: string): string;
};
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { hideToast(); restore(); });

async function setup(document = false) {
  const text = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 1 });
  const suffix = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 2, from: 0, to: 3 });
  const screen = miniDocument.createElement('section'); screen.dataset['screen'] = 'editor';
  const shell = miniDocument.createElement('div'); shell.className = 'editor-shell'; shell.dataset['bookId'] = 'book';
  if (document) shell.dataset['documentId'] = 'manuscript';
  const editor = miniDocument.createElement('div'); editor.dataset['editorPersistence'] = 'confirmed'; editor.dataset['journalSequence'] = '1';
  const block = miniDocument.createElement('p'); block.dataset['blockId'] = 'block'; block.textContent = text;
  editor.append(block); shell.append(editor); screen.append(shell); miniDocument.body.append(screen);
  const scope = { kind: 'open-manuscript', manuscriptId: 'manuscript', branchId: 'branch' };
  const page = { bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision-one', revisionLabel: 'r1', workingDigest: 'working-digest', journalSequence: 1, blocks: [{ blockId: 'block', text }] };
  const overview = { book: { bookId: 'book' }, primaryAction: scope, manuscriptAnchor: { ...page }, records: [{ kind: 'revision', manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision-one', revisionLabel: 'r1', revisionDigest: 'working-digest' }] };
  const documents = { bookId: 'book', types: [{ documents: [{ documentId: 'manuscript', branchId: 'branch' }] }] };
  const api = { getBookOverview: vi.fn(async () => overview), getManuscriptWindowAt: vi.fn(async () => page), inspectProductionDocuments: vi.fn(async () => documents) };
  const evaluate = <T>(expression: string): Promise<T> => Promise.resolve(Function('window', 'document', `return (${expression})`)({ ai7: api }, miniDocument));
  const before = await evaluate<SavedEdit>(CAPTURE_JOURNAL_EDIT);
  expect(before !== null).toBe(true);
  block.textContent += suffix; editor.dataset['journalSequence'] = '2'; page.journalSequence = 2; page.blocks[0]!.text += suffix;
  return { before, suffix, shell, editor, scope, page, overview, documents, api, evaluate, read: () => evaluate<boolean>(journalEditPersisted(before, suffix)) };
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

it.each(['pending', 'not-advanced', 'wrong-book', 'wrong-manuscript', 'wrong-branch', 'wrong-block', 'wrong-content', 'authoritative-not-advanced', 'authoritative-wrong-branch', 'detached', 'renderer-content', 'read-failed'] as const)('a saved toast cannot conceal %s', async (failure) => {
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
  if (failure === 'detached') test.shell.remove();
  if (failure === 'renderer-content') test.editor.querySelector('[data-block-id]')!.textContent = test.before.text;
  if (failure === 'read-failed') test.api.getManuscriptWindowAt.mockRejectedValueOnce(new Error('synthetic read refusal'));
  expect(await test.read()).toBe(false);
});

it('binds a production document to its own identity rather than the primary manuscript', async () => {
  const test = await setup(true);
  test.scope.manuscriptId = 'primary-manuscript';
  expect(await test.read()).toBe(true);
  test.documents.types[0]!.documents[0]!.branchId = 'foreign-branch';
  expect(await test.read()).toBe(false);
  test.documents.types[0]!.documents[0]!.branchId = 'branch';
  test.shell.dataset['documentId'] = 'foreign-document';
  expect(await test.read()).toBe(false);
});

it('captures and verifies the actual non-first block edited by the shortcut scenario', async () => {
  const test = await setup();
  const block = miniDocument.createElement('p'); block.dataset['blockId'] = 'second'; block.textContent = test.before.text;
  test.editor.append(block); test.page.blocks.push({ blockId: 'second', text: test.before.text });
  const before = await test.evaluate<SavedEdit>(captureJournalEdit(1));
  expect(before.blockId).toBe('second');
  block.textContent += test.suffix; test.page.blocks[1]!.text += test.suffix;
  test.editor.dataset['journalSequence'] = '3'; test.page.journalSequence = 3;
  expect(await test.evaluate(journalEditPersisted(before, test.suffix))).toBe(true);
});

it.each(['saved', 'journal-only', 'old-revision', 'wrong-scope', 'wrong-digest', 'wrong-text', 'wrong-record', 'pending'] as const)('milestone authority requires an exact revision: %s', async (state) => {
  const test = await setup();
  const before = await test.evaluate<SavedEdit>(CAPTURE_JOURNAL_EDIT);
  test.page.revisionId = 'revision-two'; test.page.revisionLabel = 'r2';
  test.overview.manuscriptAnchor = { ...test.page };
  test.overview.records = [{ kind: 'revision', manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision-two', revisionLabel: 'r2', revisionDigest: before.workingDigest }];
  if (state === 'journal-only') test.overview.manuscriptAnchor.revisionLabel = 'r1';
  if (state === 'old-revision') test.overview.manuscriptAnchor.revisionId = before.revisionId;
  if (state === 'wrong-scope') test.page.branchId = 'foreign-branch';
  if (state === 'wrong-digest') test.page.workingDigest = 'foreign-digest';
  if (state === 'wrong-text') test.page.blocks[0]!.text = test.before.text;
  if (state === 'wrong-record') test.overview.records[0]!.revisionId = 'foreign-revision';
  if (state === 'pending') test.editor.dataset['editorPersistence'] = 'pending';
  expect(await test.evaluate(milestonePersisted(before, 'r2'))).toBe(state === 'saved');
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

it('retains an earlier error while a successful journal save remains authoritative', async () => {
  const test = await setup();
  const status = miniDocument.createElement('div'); status.id = 'persistence-status'; miniDocument.body.append(status);
  const setStatus = createStatusSurface(status as unknown as HTMLElement);
  setStatus('较早的操作失败', 'error');
  setStatus('已写入修订日志', 'success');
  expect(status.dataset['tone']).toBe('error');
  expect(status.hidden).toBe(false);
  expect(await test.read()).toBe(true);
  setStatus('另一个操作已完成', 'success');
  expect(await test.read()).toBe(true);
});

it.each(['j01', 'j03', 'j04', 'j12'])('%s waits for the durable predicate to resolve before testing truth', async (journey) => {
  const source = readFileSync(new URL(`../../e2e/run-${journey}.mjs`, import.meta.url), 'utf8');
  const waitSource = /async function waitFor\(renderer,[\s\S]*?\n\}/u.exec(source)?.[0];
  if (!waitSource) throw new Error('Journey wait seam missing');
  const waitFor = Function('journeyCheckFailure', 'PRODUCT_READY_TIMEOUT_MS', `return (${waitSource})`)(
    () => new Error('synthetic wait timeout'), 100,
  ) as (renderer: { evaluate(expression: string): Promise<unknown> }, expression: string, name: string, timeout: number) => Promise<void>;
  const reply = Promise.withResolvers<boolean>();
  const renderer = { evaluate: async (expression: string) => await Function('reply', `return (${expression})`)(reply.promise) };
  vi.useFakeTimers();
  try {
    let settled = false;
    const outcome = waitFor(renderer, 'reply', 'edit-durable', 100).then(() => { settled = true; return 'passed'; }, () => 'failed');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    reply.resolve(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toBe('failed');
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
