import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { MAX_WINDOW_BLOCKS } from '../../src/shared/protocol.js';
import {
  ADMITTED_SMALL_DOCX,
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
// stays far below the few-hundred-block ceiling this layer works with. The small admitted source is
// enough, because size is not this suite's subject; its content is.
const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_SMALL_DOCX, startBlock: 1, blocks: 40, title: TITLE };
const QUERY_GRAPHEMES = 4;
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
});
