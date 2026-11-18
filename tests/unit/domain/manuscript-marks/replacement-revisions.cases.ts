import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ManuscriptApplyStore } from '../../../../src/service/manuscript-apply.js';
import { commitReplacementAsRevisions, type ReplacementRevisionStores } from '../../../../src/service/replacement-revisions.js';
import { graphemesOf } from '../../../../src/shared/mark-anchor.js';
import { manuscriptMarksBook, type ManuscriptMarksBook } from '../../../support/domain/manuscript-marks.js';
import { domainOf } from '../../../support/domain/manuscript-marks-drive.js';

// 全部替换 as per-occurrence editor revisions (Issue #1409, #1411), moved from tests/service/replacement-revisions.test.ts
// (Issue #1536): the same claims over a sample1 Book on `:memory:`, with the store's own owners the revisions write through.
// Every replaced word is an authored marker typed here; manuscript text is compared by the markers only.

const MARKER = '〔替换靶〕';
const REPLACED = '〔已替换〕';

let book: ManuscriptMarksBook | undefined;
afterEach(() => { book?.db.close(); book = undefined; });

async function prepared() {
  book = await manuscriptMarksBook(30);
  const store = domainOf(book);
  const { manuscriptId, branchId } = store.imported;
  const window = () => store.getManuscriptWindow(manuscriptId, branchId, null);
  const stores: ReplacementRevisionStores = { db: book.db, manuscript: book.boundedAuthority, marks: book.editorialMarks, apply: book.manuscriptApply };
  const [first, second] = window().blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 20);
  const type = (blockId: string, at: number): void => {
    const now = window();
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId, branchId, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
      baseBlockDigest: now.blocks.find((block) => block.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
      fromGrapheme: at, toGrapheme: at, insertText: MARKER });
  };
  // Two occurrences in one paragraph and one in another: a block's later match must still stand when its earlier one is written.
  type(first!.blockId, 0);
  type(first!.blockId, 10);
  type(second!.blockId, 3);
  const search = store.createSearch(manuscriptId, branchId, MARKER).searchId;
  while (!store.advanceSearch(search).done) { /* bounded search */ }
  const preview = store.prepareReplacement(search, REPLACED, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
  store.freezeReplacement(preview.previewId, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
  const count = (text: string): number => window().blocks.reduce((sum, block) => sum + block.text.split(text).length - 1, 0);
  return { store, book: { manuscriptId, branchId }, window, stores, previewId: preview.previewId, count };
}

describe('全部替换 as editor revisions', () => {
  it('writes one applied, individually reversible revision per occurrence', async () => {
    const setup = await prepared();
    // The store's commitReplacementRevisions: the same owner call inside its mark and bounded wrappers.
    const result = setup.store.commitReplacementRevisions({ previewId: setup.previewId, windowStartBlockId: setup.window().blocks[0]!.blockId });
    expect(result.replaced).toBe(3);
    expect(new Set(result.markIds).size).toBe(3);
    expect([setup.count(MARKER), setup.count(REPLACED)]).toEqual([0, 3]);
    const now = setup.window();
    expect([now.revisionId, now.journalSequence, now.workingDigest]).toEqual([result.revisionId, result.journalSequence, result.workingDigest]);
    for (const markId of result.markIds) {
      const card = setup.store.getEditorialMarkCard(setup.book.manuscriptId, setup.book.branchId, markId);
      expect([card.kind, card.status, card.source.kind, card.suggestion?.rationale]).toEqual(['change-suggestion', 'applied', 'editor', `编辑替换「${MARKER}」→「${REPLACED}」`]);
    }
    // One occurrence is taken back on its own; the other two stay replaced.
    setup.store.reverseAppliedChangeSuggestion({ ...setup.book, windowStartBlockId: now.blocks[0]!.blockId, markId: result.markIds[1]!, clientEffectId: randomUUID() });
    expect([setup.count(MARKER), setup.count(REPLACED)]).toEqual([1, 2]);
    expect(() => commitReplacementAsRevisions(setup.stores, { previewId: setup.previewId, windowStartBlockId: now.blocks[0]!.blockId })).toThrow();
  });

  it('writes nothing when any occurrence fails, and leaves the preview to be committed again', async () => {
    const setup = await prepared();
    const before = setup.window();
    let applied = 0;
    const failing: ReplacementRevisionStores = { ...setup.stores, apply: { apply: (input: Parameters<ManuscriptApplyStore['apply']>[0]) => {
      if (++applied === 2) throw new Error('second occurrence refused');
      return setup.stores.apply.apply(input);
    } } as unknown as ManuscriptApplyStore };
    expect(() => commitReplacementAsRevisions(failing, { previewId: setup.previewId, windowStartBlockId: before.blocks[0]!.blockId })).toThrow('second occurrence refused');
    const after = setup.window();
    expect([after.journalSequence, after.workingDigest, setup.count(MARKER), setup.count(REPLACED)]).toEqual([before.journalSequence, before.workingDigest, 3, 0]);
    expect(after.marks.filter((mark) => mark.kind === 'change-suggestion')).toHaveLength(0);
    expect(commitReplacementAsRevisions(setup.stores, { previewId: setup.previewId, windowStartBlockId: before.blocks[0]!.blockId }).replaced).toBe(3);
  });
});
