import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BoundedManuscriptStore } from '../../src/service/bounded-manuscript.js';
import { EditorialMarkStore } from '../../src/service/editorial-marks.js';
import { ManuscriptApplyStore } from '../../src/service/manuscript-apply.js';
import { commitReplacementAsRevisions, type ReplacementRevisionStores } from '../../src/service/replacement-revisions.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// 全部替换 as per-occurrence editor revisions (Issue #1409, #1411), on the service's own stores over the admitted SampleBook. Every
// replaced word is an authored marker typed here; manuscript text is compared by the markers only.

const MARKER = '〔替换靶〕';
const REPLACED = '〔已替换〕';
let roots: ServiceTestRoots;
beforeEach(async () => { roots = await createServiceTestRoots(); });
afterEach(async () => { await roots.dispose(); });

function databaseFile(root: string): string {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (entry === 'ai7.sqlite') return path;
    if (statSync(path).isDirectory()) {
      try { return databaseFile(path); } catch { /* keep looking */ }
    }
  }
  throw new Error('no ai7.sqlite under the data root');
}

/** The lifetime of the service the store opened, which every write it journals is recorded under. */
function runningLifetime(db: DatabaseSync): string {
  return String((db.prepare("SELECT lifetime_id FROM service_lifetimes WHERE outcome = 'running' ORDER BY started_at DESC LIMIT 1").get() as { lifetime_id: string }).lifetime_id);
}

async function prepared(store: EditorialStore) {
  const selectedPath = join(roots.inputRoot, 'revisions.docx');
  await composeManuscriptDocx(selectedPath, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '替换组稿' });
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
  const window = (): ManuscriptWindowProjection => store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  // Opened before the replacement is prepared: a store opened later reclaims the previews of a lifetime it does not know.
  const db = new DatabaseSync(databaseFile(roots.dataRoot));
  db.exec('PRAGMA busy_timeout = 5000');
  const manuscript = new BoundedManuscriptStore(db);
  const marks = new EditorialMarkStore(db);
  const stores: ReplacementRevisionStores = { db, manuscript, marks, apply: new ManuscriptApplyStore(db, manuscript, marks, runningLifetime(db)) };
  const [first, second] = window().blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 20);
  const type = (blockId: string, at: number): void => {
    const now = window();
    store.flushJournalEdit({ clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
      baseBlockDigest: now.blocks.find((block) => block.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
      fromGrapheme: at, toGrapheme: at, insertText: MARKER });
  };
  // Two occurrences in one paragraph and one in another: a block's later match must still stand when its earlier one is written.
  type(first!.blockId, 0);
  type(first!.blockId, 10);
  type(second!.blockId, 3);
  const search = store.createSearch(book.manuscriptId, book.branchId, MARKER).searchId;
  while (!store.advanceSearch(search).done) { /* bounded search */ }
  const preview = store.prepareReplacement(search, REPLACED, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
  store.freezeReplacement(preview.previewId, []);
  while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
  const count = (text: string): number => window().blocks.reduce((sum, block) => sum + block.text.split(text).length - 1, 0);
  return { book, window, stores, db, previewId: preview.previewId, count };
}

describe('全部替换 as editor revisions', () => {
  it('writes one applied, individually reversible revision per occurrence', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const setup = await prepared(store);
    try {
      const result = commitReplacementAsRevisions(setup.stores, { previewId: setup.previewId, windowStartBlockId: setup.window().blocks[0]!.blockId });
      expect(result.replaced).toBe(3);
      expect(new Set(result.markIds).size).toBe(3);
      expect([setup.count(MARKER), setup.count(REPLACED)]).toEqual([0, 3]);
      const now = setup.window();
      expect([now.revisionId, now.journalSequence, now.workingDigest]).toEqual([result.revisionId, result.journalSequence, result.workingDigest]);
      for (const markId of result.markIds) {
        const card = store.getEditorialMarkCard(setup.book.manuscriptId, setup.book.branchId, markId);
        expect([card.kind, card.status, card.source.kind, card.suggestion?.rationale]).toEqual(['change-suggestion', 'applied', 'editor', `编辑替换「${MARKER}」→「${REPLACED}」`]);
      }
      // One occurrence is taken back on its own; the other two stay replaced.
      store.reverseAppliedChangeSuggestion({ ...setup.book, windowStartBlockId: now.blocks[0]!.blockId, markId: result.markIds[1]!, clientEffectId: randomUUID() });
      expect([setup.count(MARKER), setup.count(REPLACED)]).toEqual([1, 2]);
      expect(() => commitReplacementAsRevisions(setup.stores, { previewId: setup.previewId, windowStartBlockId: now.blocks[0]!.blockId })).toThrow();
    } finally { setup.db.close(); store.markCleanShutdown(); store.close(); }
  }, 120_000);

  it('writes nothing when any occurrence fails, and leaves the preview to be committed again', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const setup = await prepared(store);
    try {
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
    } finally { setup.db.close(); store.markCleanShutdown(); store.close(); }
  }, 120_000);
});
