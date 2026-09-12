import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  FACTUAL_REVIEW_SCHEMA_VERSION,
  MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import { MAX_WINDOW_BLOCKS } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2). It drives the real `EditorialStore` on a temporary Agent Data Root
// without Electron, mirroring the open/import/edit/restart sequence `src/service/index.ts` `run()`
// performs for the product. Assertions describe behavior; no timing is asserted.

const TITLE = '组稿书稿标题';
const REPLACEMENT = '已替换文本';
// 40 blocks exceed one `MAX_WINDOW_BLOCKS` window, so paging is observable on a manuscript that still
// stays far below the few-hundred-block ceiling this layer works with. The one admitted source is
// enough, because size is not this suite's subject; its content is.
const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: TITLE };
const QUERY_GRAPHEMES = 4;
// A whole-manuscript character far enough in to land inside a block rather than at its first
// grapheme, and far short of the 40-block excerpt's length.
const ENTRY_CHARACTER = 42;
const HAN_GRAPHEME = /^\p{Script=Han}$/u;
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

function firstHanRun(text: string): string | null {
  const run: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (!HAN_GRAPHEME.test(segment)) {
      run.length = 0;
      continue;
    }
    run.push(segment);
    if (run.length === QUERY_GRAPHEMES) return run.join('');
  }
  return null;
}

/**
 * A search query taken from the composed manuscript itself: the first run of `QUERY_GRAPHEMES` Han
 * graphemes in the given blocks. The excerpt is real prose, so no authored literal can be planted in it
 * to be found; the query is derived at test time instead, and every assertion about it is a count or a
 * boolean, so a failure reports a number rather than manuscript text.
 */
function deriveSearchQuery(blocks: readonly { text: string }[]): string {
  for (const block of blocks) {
    const run = firstHanRun(block.text);
    if (run !== null) return run;
  }
  throw new Error(`no composed block carries a run of ${QUERY_GRAPHEMES} Han graphemes`);
}

/** Drive the new-Book import exactly as the product's J-01 sequence does. */
async function importComposedBook(store: EditorialStore): Promise<{
  bookId: string;
  manuscriptId: string;
  branchId: string;
  commitId: string;
  detectedBlockCount: number;
}> {
  const selectedPath = join(roots.inputRoot, 'fixture.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);

  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  expect(staged.source.format).toBe('DOCX');
  expect(staged.titleSuggestion.value).toBe(TITLE);
  expect(staged.identityFindings).toHaveLength(0);

  const review = store.prepareNewBookReview(
    staged.draftId,
    staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value },
    false,
  );
  expect(review.target.kind).toBe('new-book');
  expect(review.reviewDigest).not.toBeNull();

  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  expect(commit.completionLabel).toBe('稿件已导入');
  expect(commit.source.sourceSha256).toBe(staged.source.sourceSha256);
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });

  return {
    bookId: commit.bookId,
    manuscriptId: commit.manuscriptId,
    branchId: commit.branchId,
    commitId,
    detectedBlockCount: staged.detectedBlockCount,
  };
}

/** Run a whole-manuscript search to completion, as the cooperative job owner does for the product. */
function completeSearch(store: EditorialStore, manuscriptId: string, branchId: string, query: string): string {
  const created = store.createSearch(manuscriptId, branchId, query);
  while (!store.advanceSearch(created.searchId).done) {
    // The search scans the manuscript in bounded batches.
  }
  return created.searchId;
}

/** Prepare, freeze, validate, and commit a replacement, as `startReplacementCommit` does. */
function commitPreparedReplacement(store: EditorialStore, searchId: string): {
  includedMatches: number;
  committedCount: number;
  workingDigest: string;
} {
  const preview = store.prepareReplacement(searchId, REPLACEMENT, []);
  while (!store.advanceReplacementWork(preview.previewId).done) {
    // The preparing phase walks the frozen match set in bounded batches.
  }
  const frozen = store.freezeReplacement(preview.previewId, []);
  expect(frozen.state).toBe('frozen');
  while (!store.advanceReplacementWork(preview.previewId).done) {
    // The validating phase re-checks every included range against the working blocks.
  }
  const committed = store.commitReplacement(preview.previewId);
  return {
    includedMatches: frozen.includedMatches,
    committedCount: committed.committedCount,
    workingDigest: committed.workingDigest,
  };
}

/** Take a store back to the revision-20 shape: the entry-position relation is simply not there. */
function downgradeToRevision20(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`BEGIN IMMEDIATE;
      DROP TABLE manuscript_entry_positions;
      PRAGMA user_version = ${FACTUAL_REVIEW_SCHEMA_VERSION};
      COMMIT;`);
  } finally {
    database.close();
  }
}

/**
 * Every relation the store holds, with its exact `CREATE` text and a digest over its whole content
 * in row order. Relations hold manuscript text, so the content is compared as a row count and a hex
 * digest: a failure reports those rather than the manuscript.
 */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare(
    "SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  ).all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Record<string, SQLOutputValue>[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        hash.update(JSON.stringify([column, digestible(row[column]!)]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

/** One column value in a form `JSON.stringify` frames unambiguously, blobs and integers included. */
function digestible(value: SQLOutputValue): unknown {
  if (value instanceof Uint8Array) return [...value];
  return typeof value === 'bigint' ? value.toString() : value;
}

/** The row count a `relationTruth` content string carries. */
function rowCount(content: string): number {
  return Number(content.slice(0, content.indexOf(':')));
}

describe('EditorialStore on a temporary Agent Data Root', () => {
  it('reports an empty start on a fresh Agent Data Root', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(await store.getStartup()).toEqual({ state: 'prior-work', priorWork: [] });
      expect(store.listBooks(null).items).toHaveLength(0);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('imports a new Book, pages the window, replaces, undoes, saves a milestone, and reads back after restart', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposedBook>>;
    let milestoneLabel: string;
    let expectedTotalBlocks: number;
    try {
      imported = await importComposedBook(first);

      const overview = first.getBookOverview(imported.bookId);
      expect(overview.book.title).toBe(TITLE);
      expect(overview.manuscriptState.state).toBe('populated');
      expect(overview.primaryAction.kind).toBe('open-manuscript');

      // Window paging: the first window is capped, the second continues forward over the same
      // manuscript without gaps, and both agree on the manuscript's total block count.
      const firstWindow = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expectedTotalBlocks = firstWindow.position.totalBlocks;
      expect(expectedTotalBlocks).toBe(imported.detectedBlockCount);
      expect(expectedTotalBlocks).toBeGreaterThan(MAX_WINDOW_BLOCKS);
      expect(firstWindow.blocks).toHaveLength(MAX_WINDOW_BLOCKS);
      expect(firstWindow.position.startBlock).toBe(1);
      expect(firstWindow.nextCursor).not.toBeNull();
      // The composed excerpt is the admitted source's own prose, which parses as paragraphs
      // throughout, so the window reports the kinds the import found rather than invented structure.
      expect(firstWindow.blocks.every((block) => block.kind === 'paragraph')).toBe(true);

      const secondWindow = first.getManuscriptWindow(
        imported.manuscriptId,
        imported.branchId,
        firstWindow.nextCursor,
      );
      expect(secondWindow.position.totalBlocks).toBe(expectedTotalBlocks);
      expect(secondWindow.position.startBlock).toBeGreaterThan(firstWindow.position.startBlock);
      expect(secondWindow.position.startBlock).toBeLessThanOrEqual(firstWindow.position.endBlock + 1);
      expect(secondWindow.position.endBlock).toBe(expectedTotalBlocks);
      expect(secondWindow.blocks.map((block) => block.position)).toEqual(
        secondWindow.blocks.map((_, index) => secondWindow.position.startBlock + index),
      );
      expect(secondWindow.previousCursor).not.toBeNull();

      // Replacement over the whole manuscript, on a query the manuscript itself supplies. The store's
      // own match count is what the freeze and the commit are held to, so the assertions stay counts.
      const query = deriveSearchQuery(firstWindow.blocks);
      const searchId = completeSearch(first, imported.manuscriptId, imported.branchId, query);
      const results = first.getSearchResults(searchId, null);
      expect(results.totalMatches).toBeGreaterThanOrEqual(1);
      const replacement = commitPreparedReplacement(first, searchId);
      expect(replacement.includedMatches).toBe(results.totalMatches);
      expect(replacement.committedCount).toBe(results.totalMatches);

      const afterReplacement = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expect(afterReplacement.workingDigest).toBe(replacement.workingDigest);
      expect(afterReplacement.blocks.some((block) => block.text.includes(REPLACEMENT))).toBe(true);
      expect(afterReplacement.blocks.some((block) => block.text.includes(query))).toBe(false);

      // Durable history. Undo and redo run before the milestone so the replacement's command group
      // is still the branch's latest durable step.
      const undone = first.undoManuscript(
        imported.manuscriptId,
        imported.branchId,
        replacement.workingDigest,
      );
      expect(undone.action).toBe('undo');
      expect(undone.canRedo).toBe(true);
      expect(undone.workingDigest).not.toBe(replacement.workingDigest);
      const afterUndo = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expect(afterUndo.workingDigest).toBe(undone.workingDigest);
      expect(afterUndo.blocks.some((block) => block.text.includes(query))).toBe(true);

      const redone = first.redoManuscript(
        imported.manuscriptId,
        imported.branchId,
        undone.workingDigest,
      );
      expect(redone.action).toBe('redo');
      expect(redone.canUndo).toBe(true);
      // The working digest chains every durable step, so redo restores the content without
      // reproducing the digest the branch carried before the undo.
      expect(redone.workingDigest).not.toBe(undone.workingDigest);
      expect(redone.workingDigest).not.toBe(replacement.workingDigest);
      const afterRedo = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expect(afterRedo.workingDigest).toBe(redone.workingDigest);
      expect(afterRedo.blocks.map((block) => block.text))
        .toEqual(afterReplacement.blocks.map((block) => block.text));

      // Milestone plus its independently verified recovery snapshot.
      milestoneLabel = '里程碑一';
      const milestone = await first.saveMilestone(
        imported.manuscriptId,
        imported.branchId,
        milestoneLabel,
        '服务层集成校验',
        '由 L2 套件组稿的公开样书选段。',
      );
      expect(milestone.label).toBe(milestoneLabel);
      expect(milestone.actor).toBe('本机编辑');
      expect(milestone.recoverySnapshot.blockCount).toBe(expectedTotalBlocks);
      expect(milestone.recoverySnapshot.verification).toBe('已独立校验快照对象');
      expect(milestone.workingDigest).toBe(redone.workingDigest);

      first.markCleanShutdown();
    } finally {
      first.close();
    }

    // A second open on the same Agent Data Root reads the committed state back and reports a clean
    // prior lifetime: no recovery attention is raised.
    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const startup = await second.getStartup();
      expect(startup.state).toBe('prior-work');
      if (startup.state !== 'prior-work') throw new Error('unreachable');
      expect(startup.priorWork).toHaveLength(1);
      const priorWork = startup.priorWork[0]!;
      expect(priorWork.bookId).toBe(imported.bookId);
      expect(priorWork.bookTitle).toBe(TITLE);
      expect(priorWork.manuscriptId).toBe(imported.manuscriptId);
      expect(priorWork.recoveryAttention).toBeNull();
      expect(priorWork.latestMilestone?.label).toBe(milestoneLabel);

      const overview = second.getBookOverview(imported.bookId);
      expect(overview.manuscriptState.state).toBe('populated');
      const window = second.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expect(window.position.totalBlocks).toBe(expectedTotalBlocks);
      expect(window.blocks.some((block) => block.text.includes(REPLACEMENT))).toBe(true);

      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('remembers where the editor entered, and answers a superseded Revision with the nearest anchor', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposedBook>>;
    let entryBlockId: string;
    let entryGrapheme: number;
    let firstRevisionId: string;
    try {
      imported = await importComposedBook(first);
      const window = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      firstRevisionId = window.revisionId;

      // Nothing is remembered until an entry position is recorded, and the window itself still
      // derives its focus from the target it is asked for.
      expect(first.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toBeNull();
      expect(window.focusBlockId).toBeNull();

      // The position recorded is the one the window projection itself resolves for a whole-manuscript
      // character, so the block and the offset inside it are the product's own pair, not invented.
      const focused = first.getManuscriptWindowAt(imported.manuscriptId, imported.branchId, { kind: 'character', character: ENTRY_CHARACTER });
      expect(focused.focusBlockId).not.toBeNull();
      expect(focused.focusGrapheme).not.toBeNull();
      entryBlockId = focused.focusBlockId!;
      entryGrapheme = focused.focusGrapheme!;

      first.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, entryBlockId, entryGrapheme);
      expect(first.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toEqual({
        bookId: imported.bookId,
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        blockId: entryBlockId,
        grapheme: entryGrapheme,
        recordedRevisionId: firstRevisionId,
        state: 'exact',
      });
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The position is durable: the restart reads back exactly what was written.
      expect(second.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toMatchObject({
        blockId: entryBlockId,
        grapheme: entryGrapheme,
        recordedRevisionId: firstRevisionId,
        state: 'exact',
      });

      // One acknowledged edit makes the branch dirty, so the milestone freezes a new Revision and the
      // recorded position now belongs to a superseded one.
      const before = second.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      const edited = before.blocks[0]!;
      second.flushJournalEdit({
        clientEditId: randomUUID(),
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        baseRevisionId: before.revisionId,
        blockId: edited.blockId,
        windowStartBlockId: edited.blockId,
        baseBlockDigest: edited.digest,
        expectedJournalSequence: before.journalSequence,
        fromGrapheme: 0,
        toGrapheme: 0,
        insertText: REPLACEMENT,
      });
      await second.saveMilestone(
        imported.manuscriptId,
        imported.branchId,
        '里程碑一',
        '入稿位置校验',
        '由 L2 套件组稿的公开样书选段。',
      );
      const advanced = second.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      expect(advanced.revisionId).not.toBe(firstRevisionId);

      // The superseded position resolves to an anchor rather than to nothing: the block it names is
      // still in the working state, so that block answers, and the answer says it was resolved.
      expect(second.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toEqual({
        bookId: imported.bookId,
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        blockId: entryBlockId,
        grapheme: entryGrapheme,
        recordedRevisionId: firstRevisionId,
        state: 'nearest-anchor',
      });

      // Entering again records against the Revision the branch works on now.
      const advancedBlockId = advanced.blocks[5]!.blockId;
      second.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, advancedBlockId, 0);
      expect(second.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toEqual({
        bookId: imported.bookId,
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        blockId: advancedBlockId,
        grapheme: 0,
        recordedRevisionId: advanced.revisionId,
        state: 'exact',
      });
      second.markCleanShutdown();
    } finally {
      second.close();
    }

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      // One row per Book and Revision, and the superseded row is still the row it was written as.
      expect((database.prepare('SELECT count(*) total FROM manuscript_entry_positions').get() as { total: number }).total)
        .toBe(2);
      expect((database.prepare(
        `SELECT count(*) total FROM manuscript_entry_positions
         WHERE book_id = ? AND revision_id = ? AND block_id = ? AND grapheme = ?`,
      ).get(imported.bookId, firstRevisionId, entryBlockId, entryGrapheme) as { total: number }).total).toBe(1);
    } finally {
      database.close();
    }
  }, 300_000);

  it('leads the Book Work Overview with the manuscript anchor and returns to it after a restart', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposedBook>>;
    let entryBlockId: string;
    let entryGrapheme: number;
    let emptyBookId: string;
    try {
      imported = await importComposedBook(first);

      // A Book with no Manuscript has no anchor at all, so the overview it enters states 尚无稿件 and
      // offers the first import instead of a position it does not have (V2-UX-BOOK-001).
      const creation = first.prepareBookCreation('空图书', null);
      emptyBookId = first.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest })
        .overview.book.bookId;
      expect(first.getBookOverview(emptyBookId).manuscriptAnchor).toBeNull();

      // Before any position is remembered the anchor still leads with the Revision and the journal
      // state, and it says the position is absent rather than naming one the editor never left.
      expect(first.getBookOverview(imported.bookId).manuscriptAnchor).toMatchObject({
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        revisionLabel: 'r1',
        journalSequence: 0,
        journalLabel: '与当前修订版一致',
        entry: null,
      });

      // The pair recorded is the window projection's own, so nothing is invented between the two.
      const focused = first.getManuscriptWindowAt(
        imported.manuscriptId,
        imported.branchId,
        { kind: 'character', character: ENTRY_CHARACTER },
      );
      entryBlockId = focused.focusBlockId!;
      entryGrapheme = focused.focusGrapheme!;
      first.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, entryBlockId, entryGrapheme);

      const entry = first.getBookOverview(imported.bookId).manuscriptAnchor!.entry!;
      expect(entry).toMatchObject({ blockId: entryBlockId, grapheme: entryGrapheme, state: 'exact' });
      // What an editor reads is the block's place in the manuscript; the identity stays technical
      // (V2-UX-LAYER-001), so the reading never carries it.
      expect(entry.blockPosition).toBeGreaterThan(1);
      expect(entry.blockPosition).toBeLessThanOrEqual(entry.totalBlocks);
      expect(entry.label).toContain(`第 ${entry.blockPosition} / ${entry.totalBlocks} 个内容块`);
      expect(entry.label).not.toContain(entryBlockId);

      // The anchor's block opens as a `block` window target with no translation, which is what the
      // Book route does with it (V2-UX-RET-002).
      const entered = first.getManuscriptWindowAt(
        imported.manuscriptId,
        imported.branchId,
        { kind: 'block', blockId: entry.blockId },
      );
      expect(entered.focusBlockId).toBe(entryBlockId);
      expect(entered.blocks.some((block) => block.blockId === entryBlockId)).toBe(true);

      // A caret resting after a block's last grapheme is a real place to leave from, and it is
      // remembered at the end of that block rather than refused.
      const block = entered.blocks.find((candidate) => candidate.blockId === entryBlockId)!;
      const length = [...segmenter.segment(block.text)].length;
      first.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, entryBlockId, length);
      expect(first.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toMatchObject({
        blockId: entryBlockId,
        grapheme: length - 1,
      });

      first.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, entryBlockId, entryGrapheme);
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The position survives the restart, which is what the Book route reads to enter the manuscript
      // instead of the overview.
      expect(second.getBookOverview(imported.bookId).manuscriptAnchor).toMatchObject({
        revisionLabel: 'r1',
        entry: { blockId: entryBlockId, grapheme: entryGrapheme, state: 'exact' },
      });
      expect(second.getBookOverview(emptyBookId).manuscriptAnchor).toBeNull();

      // One acknowledged edit is journaled but not yet checkpointed, and the anchor says so.
      const before = second.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      const edited = before.blocks[0]!;
      second.flushJournalEdit({
        clientEditId: randomUUID(),
        manuscriptId: imported.manuscriptId,
        branchId: imported.branchId,
        baseRevisionId: before.revisionId,
        blockId: edited.blockId,
        windowStartBlockId: edited.blockId,
        baseBlockDigest: edited.digest,
        expectedJournalSequence: before.journalSequence,
        fromGrapheme: 0,
        toGrapheme: 0,
        insertText: REPLACEMENT,
      });
      expect(second.getBookOverview(imported.bookId).manuscriptAnchor).toMatchObject({
        journalSequence: before.journalSequence + 1,
        journalLabel: '已写入修订日志',
      });
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('migrates a populated revision-20 store forward, adding one empty relation and moving nothing else', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposedBook>>;
    try {
      imported = await importComposedBook(first);
      const window = first.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      first.recordManuscriptEntryPosition(imported.manuscriptId, imported.branchId, window.blocks[2]!.blockId, 1);
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    downgradeToRevision20(databasePath);

    const downgraded = new DatabaseSync(databasePath, { readOnly: true });
    let truthBefore: Map<string, { sql: string; content: string }>;
    try {
      expect((downgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(FACTUAL_REVIEW_SCHEMA_VERSION);
      // At revision 20 the relation is simply not there, which is what the migration answers.
      expect(() => downgraded.prepare('SELECT 1 FROM manuscript_entry_positions').all()).toThrow();
      truthBefore = relationTruth(downgraded);
      expect(truthBefore.size).toBeGreaterThan(0);
    } finally {
      downgraded.close();
    }

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The Book the store read before the downgrade is the Book it reads after the migration.
      expect(migrated.listBooks(null).items.map((item) => item.bookId)).toEqual([imported.bookId]);
      expect(migrated.getManuscriptWindow(imported.manuscriptId, imported.branchId, null).position.totalBlocks)
        .toBe(imported.detectedBlockCount);
      // The migration adds a relation; it does not invent a position the downgraded store never held.
      expect(migrated.readManuscriptEntryPosition(imported.manuscriptId, imported.branchId)).toBeNull();
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }

    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION);
      const truthAfter = relationTruth(after);
      // Exactly one relation appears, and it appears empty.
      expect([...truthAfter.keys()]).toEqual([...truthBefore.keys(), 'manuscript_entry_positions'].sort());
      expect(truthAfter.get('manuscript_entry_positions')?.content).toMatch(/^0:/);
      // No relation the revision-20 store held changed shape, and the only one whose content moved is
      // the one every open appends to — the migration itself rewrites nothing. Both assertions report
      // relation names, so a failure names the relation rather than printing the manuscript.
      const reshaped = [...truthBefore]
        .filter(([name, before]) => truthAfter.get(name)!.sql !== before.sql).map(([name]) => name);
      expect(reshaped).toEqual([]);
      const rewritten = [...truthBefore]
        .filter(([name, before]) => truthAfter.get(name)!.content !== before.content).map(([name]) => name);
      expect(rewritten).toEqual(['service_lifetimes']);
      expect(rowCount(truthAfter.get('service_lifetimes')!.content))
        .toBe(rowCount(truthBefore.get('service_lifetimes')!.content) + 1);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 300_000);

  it('refuses an unsupported store version and leaves the Agent Data Root removable immediately', async () => {
    // A deliberately invalid root: real SQLite, carrying a schema version no revision uses, so the
    // first validation refuses it — with the `ai7.sqlite` handle already open.
    const storeDirectory = join(roots.dataRoot, 'store');
    await mkdir(storeDirectory, { recursive: true });
    const planted = new DatabaseSync(join(storeDirectory, 'ai7.sqlite'));
    planted.exec('PRAGMA user_version = 9999');
    planted.close();

    let refusal: unknown;
    try {
      await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(StoreError);
    expect((refusal as StoreError).code).toBe('SCHEMA_UNSUPPORTED');

    // No retry and no timeout, deliberately: on Windows an open SQLite handle is what would make this
    // removal fail, so one immediate success is the assertion that the refused open closed what it
    // opened. The suite's `afterEach` retries, so only an unretried removal proves the handle is gone.
    await rm(roots.dataRoot, { recursive: true });
  }, 120_000);
});
