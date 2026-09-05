import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the recovery path. An acknowledged journal edit followed by a
// close that never marks the service lifetime clean is exactly the interruption the product recovers
// from on its next start, so the suite closes the store without `markCleanShutdown` rather than
// simulating the condition through the database.

const TITLE = '恢复用合成书稿';
const INSERTED_TEXT = '断电前写入的文字。';

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-recovery-');
});

afterEach(async () => {
  await roots.dispose();
});

async function importSyntheticBook(store: EditorialStore): Promise<{
  bookId: string;
  manuscriptId: string;
  branchId: string;
}> {
  const selectedPath = join(roots.inputRoot, 'fixture.docx');
  await writeSyntheticDocx(selectedPath, {
    coreTitle: TITLE,
    paragraphs: [
      { text: TITLE, style: 'Title' },
      { text: '第一章', style: 'Heading1' },
      { text: '第一段正文内容。' },
      { text: '第二段正文内容。' },
    ],
  });
  const staged = await store.stageSelectedDocx(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(
    staged.draftId,
    staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value },
    false,
  );
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** Acknowledge one durable journal edit, leaving the branch dirty beyond its last checkpoint. */
function flushOneEdit(
  store: EditorialStore,
  manuscriptId: string,
  branchId: string,
): { sequence: number; workingDigest: string } {
  const window = store.getManuscriptWindow(manuscriptId, branchId, null);
  const target = window.blocks.find((block) => block.kind === 'paragraph')!;
  const acknowledgement = store.flushJournalEdit({
    clientEditId: randomUUID(),
    manuscriptId,
    branchId,
    baseRevisionId: window.revisionId,
    blockId: target.blockId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: target.digest,
    expectedJournalSequence: window.journalSequence,
    fromGrapheme: 0,
    toGrapheme: 0,
    insertText: INSERTED_TEXT,
  });
  expect(acknowledgement.completionLabel).toBe('已写入修订日志');
  return {
    sequence: acknowledgement.sequence,
    workingDigest: acknowledgement.resultingWorkingDigest,
  };
}

describe('recovery after an unclean close', () => {
  it('raises a recovery comparison, defers it, then restores the journal state', async () => {
    let manuscript: Awaited<ReturnType<typeof importSyntheticBook>>;
    let edit: ReturnType<typeof flushOneEdit>;

    const interrupted = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      manuscript = await importSyntheticBook(interrupted);
      edit = flushOneEdit(interrupted, manuscript.manuscriptId, manuscript.branchId);
      expect(edit.sequence).toBe(1);
    } finally {
      // No `markCleanShutdown`: the service lifetime stays running, which is what an interrupted
      // product process leaves behind.
      interrupted.close();
    }

    const recovered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const startup = await recovered.getStartup();
      expect(startup.state).toBe('manuscript-recovery');
      if (startup.state !== 'manuscript-recovery') throw new Error('unreachable');

      const comparison = startup.recovery;
      expect(comparison.status).toBe('pending');
      expect(comparison.bookId).toBe(manuscript.bookId);
      expect(comparison.bookTitle).toBe(TITLE);
      expect(comparison.manuscriptId).toBe(manuscript.manuscriptId);
      expect(comparison.branchId).toBe(manuscript.branchId);
      expect(comparison.unresolvedCount).toBeGreaterThan(0);
      expect(comparison.lastDurableEditBoundary.journalSequence).toBe(edit.sequence);
      // The journal candidate carries the acknowledged edit; the checkpoint candidate is the state
      // before it. Both are reported with the verification the store performed.
      expect(comparison.journal.kind).toBe('journal');
      expect(comparison.journal.journalSequence).toBe(edit.sequence);
      expect(comparison.journal.revisionDigest).toBe(edit.workingDigest);
      expect(comparison.checkpoint.kind).toBe('checkpoint');
      expect(comparison.checkpoint.journalSequence).toBeLessThan(comparison.journal.journalSequence);
      // No milestone was saved, so no independently verified snapshot is offered.
      expect(comparison.snapshot.state).not.toBe('eligible');

      // Reading the comparison again through the addressed operation matches the startup projection.
      const addressed = await recovered.getRecoveryComparison(comparison.attentionId);
      expect(addressed.attentionId).toBe(comparison.attentionId);
      expect(addressed.attentionVersion).toBe(comparison.attentionVersion);

      // Deferral keeps the attention unresolved and still routes the next start through it.
      const deferred = await recovered.deferRecovery(comparison.attentionId, comparison.attentionVersion);
      expect(deferred.status).toBe('deferred');
      expect(deferred.completionLabel).toBe('已保留恢复待确认状态');
      expect(deferred.attentionVersion).toBeGreaterThan(comparison.attentionVersion);
      expect(deferred.next.state).toBe('prior-work');
      const afterDeferral = await recovered.getRecoveryComparison(comparison.attentionId);
      expect(afterDeferral.status).toBe('deferred');

      // Restoring the journal candidate produces a descendant revision under review.
      const restoration = await recovered.restoreRecovery(
        randomUUID(),
        comparison.attentionId,
        deferred.attentionVersion,
        { kind: 'journal' },
      );
      expect(restoration.attentionId).toBe(comparison.attentionId);
      expect(restoration.selected).toEqual({ kind: 'journal' });
      expect(restoration.reviewStatus).toBe('当前为恢复的工作状态');
      expect(restoration.descendantRevisionId).not.toBe(restoration.sourceRevisionId);
      expect(restoration.window.manuscriptId).toBe(manuscript.manuscriptId);
      expect(restoration.window.recoveredStateReview).not.toBeNull();
      expect(restoration.window.blocks.some((block) => block.text.includes(INSERTED_TEXT))).toBe(true);

      // The same restoration identifier is idempotent.
      const repeated = await recovered.restoreRecovery(
        restoration.restorationId,
        comparison.attentionId,
        deferred.attentionVersion,
        { kind: 'journal' },
      );
      expect(repeated.descendantRevisionId).toBe(restoration.descendantRevisionId);

      recovered.markCleanShutdown();
    } finally {
      recovered.close();
    }

    // Once resolved and closed cleanly, the next start no longer routes through recovery.
    const settled = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const startup = await settled.getStartup();
      expect(startup.state).toBe('prior-work');
      if (startup.state !== 'prior-work') throw new Error('unreachable');
      expect(startup.priorWork).toHaveLength(1);
      expect(startup.priorWork[0]!.recoveryAttention).toBeNull();
      const window = settled.getManuscriptWindow(manuscript.manuscriptId, manuscript.branchId, null);
      expect(window.blocks.some((block) => block.text.includes(INSERTED_TEXT))).toBe(true);
      settled.markCleanShutdown();
    } finally {
      settled.close();
    }
  }, 300_000);
});
