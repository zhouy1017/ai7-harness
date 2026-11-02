import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { MAX_WINDOW_BLOCKS } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

const TITLE = '组稿书稿标题';
const REPLACEMENT = '已替换文本';
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => {
  roots = await createServiceTestRoots();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
});
afterEach(async () => { store.close(); await roots.dispose(); });

async function importBook() {
  const path = join(roots.inputRoot, 'fixture.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: TITLE });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: TITLE }, false);
  const commitId = randomUUID();
  const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { ...book, detectedBlockCount: staged.detectedBlockCount };
}
type Book = Awaited<ReturnType<typeof importBook>>;
const windowOf = (book: Book) => store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
async function restart() {
  store.markCleanShutdown(); store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
}
function replace(book: Book) {
  const block = windowOf(book).blocks.find(block => /[\p{Script=Han}]{4}/u.test(block.text))!;
  const query = block.text.match(/[\p{Script=Han}]{4}/u)![0];
  const search = store.createSearch(book.manuscriptId, book.branchId, query);
  while (!store.advanceSearch(search.searchId).done) { /* cooperative batches */ }
  const matches = store.getSearchResults(search.searchId, null).totalMatches;
  const preview = store.prepareReplacement(search.searchId, REPLACEMENT, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
  const frozen = store.freezeReplacement(preview.previewId, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
  return { query, matches, frozen, committed: store.commitReplacement(preview.previewId) };
}
function editFirstBlock(book: Book) {
  const view = windowOf(book), block = view.blocks[0]!;
  return store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
    baseRevisionId: view.revisionId, blockId: block.blockId, windowStartBlockId: block.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: view.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText: REPLACEMENT });
}
const milestone = (book: Book) => store.saveMilestone(book.manuscriptId, book.branchId, '里程碑一', 'stage-archive', null,
  '由 L2 套件组稿的公开样书选段。');

describe('EditorialStore public editing behavior', () => {
  it('reports an empty start on a fresh data root', async () => {
    expect(await store.getStartup()).toEqual({ state: 'prior-work', priorWork: [] });
    expect(store.listBooks(null).items).toHaveLength(0);
  });
  it('imports a Book and pages its complete manuscript without gaps', async () => {
    const book = await importBook(), first = windowOf(book);
    expect(store.getBookOverview(book.bookId)).toMatchObject({ book: { title: TITLE },
      manuscriptState: { state: 'populated' }, primaryAction: { kind: 'open-manuscript' } });
    expect(first.position.totalBlocks).toBe(book.detectedBlockCount);
    expect(first.blocks).toHaveLength(MAX_WINDOW_BLOCKS);
    expect(first.blocks.every(block => block.kind === 'paragraph')).toBe(true);
    const next = store.getManuscriptWindow(book.manuscriptId, book.branchId, first.nextCursor);
    expect(next.position.totalBlocks).toBe(first.position.totalBlocks);
    expect(next.position.startBlock).toBeGreaterThan(first.position.startBlock);
    expect(next.position.startBlock).toBeLessThanOrEqual(first.position.endBlock + 1);
    expect(next.blocks.map(block => block.position)).toEqual(next.blocks.map((_, index) => next.position.startBlock + index));
    expect(next.position.endBlock).toBe(book.detectedBlockCount);
    expect(next.previousCursor).not.toBeNull();
  });
  it('replaces every frozen match through the public search workflow', async () => {
    const book = await importBook(), result = replace(book), view = windowOf(book);
    expect(result.matches).toBeGreaterThan(0);
    expect(result.frozen.includedMatches).toBe(result.matches);
    expect(result.committed.committedCount).toBe(result.matches);
    expect(view.workingDigest).toBe(result.committed.workingDigest);
    expect(view.blocks.some(block => block.text.includes(REPLACEMENT))).toBe(true);
    expect(view.blocks.some(block => block.text.includes(result.query))).toBe(false);
  });
  it('undoes and redoes a replacement as durable command history', async () => {
    const book = await importBook(), result = replace(book), replaced = windowOf(book);
    const undone = store.undoManuscript(book.manuscriptId, book.branchId, replaced.workingDigest);
    expect(undone).toMatchObject({ action: 'undo', canRedo: true });
    expect(windowOf(book).blocks.some(block => block.text.includes(result.query))).toBe(true);
    const redone = store.redoManuscript(book.manuscriptId, book.branchId, undone.workingDigest);
    expect(redone).toMatchObject({ action: 'redo', canUndo: true });
    expect(redone.workingDigest).not.toBe(undone.workingDigest);
    expect(windowOf(book).blocks.map(block => block.text)).toEqual(replaced.blocks.map(block => block.text));
  });
  it('restores the edited manuscript and milestone after a clean restart', async () => {
    const book = await importBook(); replace(book);
    const saved = await milestone(book);
    expect(saved.recoverySnapshot).toMatchObject({ blockCount: book.detectedBlockCount, verification: '已独立校验快照对象' });
    await restart();
    const startup = await store.getStartup();
    expect(startup.state).toBe('prior-work');
    if (startup.state !== 'prior-work') throw new Error('expected clean startup');
    expect(startup.priorWork).toHaveLength(1);
    expect(startup.priorWork[0]).toMatchObject({ bookId: book.bookId, bookTitle: TITLE,
      recoveryAttention: null, latestMilestone: { label: saved.label } });
    expect(windowOf(book).blocks.some(block => block.text.includes(REPLACEMENT))).toBe(true);
  });
  it('remembers the manuscript entry position after a restart', async () => {
    const book = await importBook();
    expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toBeNull();
    const focused = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'character', character: 42 });
    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, focused.focusBlockId!, focused.focusGrapheme!);
    await restart();
    expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toMatchObject({
      blockId: focused.focusBlockId, grapheme: focused.focusGrapheme, recordedRevisionId: focused.revisionId, state: 'exact' });
  });
  it('resolves an entry from a superseded revision to its nearest anchor', async () => {
    const book = await importBook(), before = windowOf(book), blockId = before.blocks[2]!.blockId;
    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, blockId, 1);
    editFirstBlock(book); await milestone(book);
    const current = windowOf(book);
    expect(current.revisionId).not.toBe(before.revisionId);
    expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toMatchObject({
      blockId, grapheme: 1, recordedRevisionId: before.revisionId, state: 'nearest-anchor' });
    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, blockId, 0);
    expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toMatchObject({
      blockId, grapheme: 0, recordedRevisionId: current.revisionId, state: 'exact' });
  });
  it('shows no manuscript anchor for an empty Book', () => {
    const draft = store.prepareBookCreation('空图书', null);
    const book = store.commitBookCreation({ ...draft.proposed, reviewDigest: draft.reviewDigest });
    expect(store.getBookOverview(book.overview.book.bookId).manuscriptAnchor).toBeNull();
  });
  it('presents the remembered anchor as a readable position and opens its block', async () => {
    const book = await importBook();
    expect(store.getBookOverview(book.bookId).manuscriptAnchor).toMatchObject({ revisionLabel: 'r1', journalSequence: 0, entry: null });
    const focused = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'character', character: 42 });
    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, focused.focusBlockId!, focused.focusGrapheme!);
    const entry = store.getBookOverview(book.bookId).manuscriptAnchor!.entry!;
    expect(entry.label).toContain('第 ' + entry.blockPosition + ' / ' + entry.totalBlocks + ' 个段落');
    expect(entry.label).not.toContain(entry.blockId);
    const entered = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: entry.blockId });
    expect(entered.focusBlockId).toBe(entry.blockId);
    const block = entered.blocks.find(block => block.blockId === entry.blockId)!;
    const length = [...segmenter.segment(block.text)].length;
    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, block.blockId, length);
    expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toMatchObject({ grapheme: length - 1 });
  });
  it('reports journaled edits on the Book overview', async () => {
    const book = await importBook(), before = windowOf(book);
    editFirstBlock(book);
    expect(store.getBookOverview(book.bookId).manuscriptAnchor).toMatchObject({
      journalSequence: before.journalSequence + 1, journalLabel: '已写入修订日志' });
  });
});
