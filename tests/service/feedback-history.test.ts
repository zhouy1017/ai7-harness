import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES,
  MAX_FEEDBACK_HISTORY_ENTRIES,
  MAX_FRAME_BYTES,
  MAX_MARK_BODY_CODE_UNITS,
  type CreateEditorialMarkInput,
  type ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 质量与学习 › 反馈历史 (Issue #61, plan slice S26c review; V2-UX-FDBK-009, FDBK-010, FDBK-013)
// over the real store. The manuscript is composed from the one admitted SampleBook and no assertion prints its text: the
// suggestions and reasons are the suite's own words.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '反馈历史组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-feedback-history-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'feedback-history.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: EXCERPT.title! }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function suggestion(book: Imported, window: ManuscriptWindowProjection, from: number, proposedText: string): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 80)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: from + 1,
    selectedText: graphemesOf(block.text).slice(from, from + 1).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale: '与全书用法统一。',
  };
}

/** A decision on a fresh 修改建议, as the card records it. */
function decider(store: EditorialStore, book: Imported) {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
  let at = 0;
  return {
    make: (): string => store.createEditorialMark(suggestion(book, window, at++ % 60, `改${at}`)).markId,
    decide: (markId: string, disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn', editedText: string | null, reason: string | null) =>
      store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition, editedText, reason }),
  };
}

const wire = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** A moment later: records a step apart never share an instant, so which came first is never a tie. */
const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 3));

describe('反馈历史 over the real store (Issue #61, S26c review)', () => {
  it('attributes each entry to the people in force when it was given, leaves a withdrawn decision out, and says where each opens', async () => {
    let book: Imported;
    let first: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(store);
      const { make, decide } = decider(store, book);
      // Given before the Book had any people: attributed to the first version saved after it.
      first = make();
      decide(first, 'rejected', null, '（示例）证据不足');
      await later();
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });
      await later();
      const second = make();
      decide(second, 'rejected', null, '（示例）方向不合适');
      await later();
      // The 责编 changes: what came before stays with 郑三, what comes after goes to 王五.
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 1, authors: ['周一'], editors: ['王五'], related: [] });
      await later();
      const third = make();
      decide(third, 'accepted-with-edit', '（示例）编辑改写', null);
      await later();
      // Withdrawn, a decision is no longer there; decided again, the new one is there once — its reason, at the most a
      // reason may be, standing as its opening.
      const fourth = make();
      decide(fourth, 'rejected', null, null);
      decide(fourth, 'withdrawn', null, null);
      await later();
      expect(store.inspectFeedbackHistory().entries.some((entry) => entry.target.kind === 'mark' && entry.target.markId === fourth)).toBe(false);
      decide(fourth, 'rejected', null, '长'.repeat(MAX_MARK_BODY_CODE_UNITS));

      const history = store.inspectFeedbackHistory();
      expect(history.truncated).toBe(false);
      expect(history.entries.map((entry) => [entry.target.kind === 'mark' ? entry.target.markId : null, entry.signal, entry.reasonState, entry.peopleVersion])).toEqual([
        [fourth, '拒绝', 'given', 2], [third, '修改后接受', 'none', 2], [second, '拒绝', 'given', 1], [first, '拒绝', 'given', 1],
      ]);
      expect(history.entries[0]!.reason).toBe(`${'长'.repeat(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES)}…`);
      expect(history.entries.map((entry) => entry.reason).slice(2)).toEqual(['（示例）方向不合适', '（示例）证据不足']);
      // The Book's people now, and each version an entry is attributed to — so 郑三 stays findable after 王五 took over.
      expect(history.books).toEqual([{
        bookId: book.bookId, title: '反馈历史组稿', authors: ['周一'], editors: ['王五'],
        peopleVersions: [{ version: 1, authors: ['周一'], editors: ['郑三'] }, { version: 2, authors: ['周一'], editors: ['王五'] }],
      }]);
      expect(history.entries[3]!.target).toEqual({
        kind: 'mark', bookId: book.bookId, manuscriptId: book.manuscriptId, branchId: book.branchId, blockId: expect.stringMatching(/^blk_/u), markId: first, detached: false,
      });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A 修改建议 whose paragraph is gone says so, rather than offer a place that is no longer in the manuscript.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.prepare("UPDATE editorial_marks SET anchor_state = 'detached' WHERE mark_id = ?").run(first!);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const target = reopened.inspectFeedbackHistory().entries.find((entry) => entry.target.kind === 'mark' && entry.target.markId === first)!.target;
      expect(target).toMatchObject({ kind: 'mark', detached: true });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('dates and attributes the current reason or dismissal to its own event, including after reopening', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let before: ReturnType<EditorialStore['inspectFeedbackHistory']>;
    try {
      const book = await importBook(store);
      const { make, decide } = decider(store, book);
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });
      const revisedMark = make();
      const addedMark = make();
      const dismissedMark = make();
      const revised = decide(revisedMark, 'rejected', null, '原原因').card!.suggestion!.decision!;
      const added = decide(addedMark, 'rejected', null, null).card!.suggestion!.decision!;
      const dismissed = decide(dismissedMark, 'rejected', null, null).card!.suggestion!.decision!;
      const old = store.inspectFeedbackHistory();
      expect(old.entries.every((entry) => entry.peopleVersion === 1)).toBe(true);
      await later();
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 1, authors: ['周一'], editors: ['王五'], related: [] });
      await later();
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
      const updated = store.recordProposalDecisionFeedback({ ...binding, markId: revisedMark, decisionId: revised.decisionId,
        expectedFeedback: 0, action: 'revise', reason: '新原因', reasonSource: 'free-text' }).card!.suggestion!.decision!;
      await later();
      store.recordProposalDecisionReason({ ...binding, markId: addedMark, decisionId: added.decisionId, reason: '后来说明', reasonSource: 'free-text' });
      await later();
      store.recordProposalDecisionFeedback({ ...binding, markId: dismissedMark, decisionId: dismissed.decisionId,
        expectedFeedback: 0, action: 'dismiss', reason: null, reasonSource: null });
      before = store.inspectFeedbackHistory();
      expect(before.entries.map((entry) => [entry.reasonState, entry.reason, entry.peopleVersion])).toEqual([
        ['dismissed', null, 2], ['given', '后来说明', 2], ['given', '新原因', 2],
      ]);
      expect(before.entries[2]!.recordedAt).toBe(updated.reasonRevisedAt);
      expect(before.entries.every((entry) => entry.recordedAt > old.entries[0]!.recordedAt)).toBe(true);
      expect(before.books[0]!.peopleVersions).toEqual([{ version: 2, authors: ['周一'], editors: ['王五'] }]);
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectFeedbackHistory()).toEqual(before!);
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
  }, 180_000);

  it('keeps the newest bounded entries across deep validated feedback and People histories', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let expected: ReturnType<EditorialStore['inspectFeedbackHistory']>;
    try {
      const book = await importBook(store);
      const { make, decide } = decider(store, book);
      const decisions: Array<{ entryId: string; recordedAt: string }> = [];
      const firstMark = make();
      const first = decide(firstMark, 'rejected', null, '初次原因').card!.suggestion!.decision!;
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
      for (let index = 0; index < 66; index += 1) {
        store.updateBookPeople({ bookId: book.bookId, expectedVersion: index, authors: ['周一'], editors: [`编辑${index}`], related: [] });
        store.recordProposalDecisionFeedback({ ...binding, markId: firstMark, decisionId: first.decisionId,
          expectedFeedback: index, action: 'revise', reason: `修订原因${index}`, reasonSource: 'free-text' });
      }
      for (let index = 0; index < MAX_FEEDBACK_HISTORY_ENTRIES + 5; index += 1) {
        const decision = decide(make(), 'rejected', null, `原因${index}`).card!.suggestion!.decision!;
        decisions.push({ entryId: `proposal-decision:${decision.decisionId}`, recordedAt: decision.recordedAt });
      }
      decisions.sort((a, b) => a.recordedAt > b.recordedAt ? -1 : a.recordedAt < b.recordedAt ? 1 : a.entryId < b.entryId ? -1 : 1);
      expected = store.inspectFeedbackHistory();
      expect(expected.entries.map((entry) => entry.entryId)).toEqual(decisions.slice(0, MAX_FEEDBACK_HISTORY_ENTRIES).map((entry) => entry.entryId));
      expect(expected.truncated).toBe(true);
      expect(expected.entries.every((entry) => entry.peopleVersion === 66)).toBe(true);
      expect(wire(expected)).toBeLessThan(MAX_FRAME_BYTES);
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectFeedbackHistory()).toEqual(expected!);
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
    // A corrupted old, undisplayed predecessor must still fail the read rather than hide behind the response bound.
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      db.exec('DROP TRIGGER proposal_decision_feedback_no_update');
      db.exec("UPDATE proposal_decision_feedback SET canonical_json = '{}' WHERE ordinal = 1");
    } finally { db.close(); }
    const damaged = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(() => damaged.inspectFeedbackHistory()).toThrow('处理原因的记录已损坏');
      damaged.markCleanShutdown();
    } finally { damaged.close(); }
  }, 180_000);

  it('answers well inside a frame however long the reasons are', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const { make, decide } = decider(store, book);
      // The review's own probe: sixty rejections, each with a reason as long as a reason may be, once passed a frame.
      for (let index = 0; index < 60; index += 1) decide(make(), 'rejected', null, `${index}${'理'.repeat(MAX_MARK_BODY_CODE_UNITS - 2)}`);
      const history = store.inspectFeedbackHistory();
      expect([history.entries.length, history.truncated]).toEqual([60, false]);
      expect(history.entries.every((entry) => graphemesOf(entry.reason!).length === MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES + 1 && entry.reason!.endsWith('…'))).toBe(true);
      const response = { id: randomUUID(), ok: true, op: 'inspectFeedbackHistory', result: history };
      expect(wire(response)).toBeLessThan(MAX_FRAME_BYTES / 4);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});
