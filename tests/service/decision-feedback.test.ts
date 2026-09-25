import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DECISION_FEEDBACK_TRIGGER_SQL } from '../../src/service/decision-feedback.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ANALYSIS_FEEDBACK_SCHEMA_VERSION, DATABASE_MERGE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type {
  CreateEditorialMarkInput,
  EditorialMarkCommandProjection,
  ManuscriptWindowProjection,
  RecordProposalDecisionFeedbackInput,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the Contextual Feedback Prompt of a Proposal Decision (Issue #61, plan slice S26a;
// V2-UX-FDBK-001 to FDBK-007, PDEC-008 to PDEC-010, MARK-005) over the real store. The manuscript is composed from the one
// admitted SampleBook and no assertion prints its text; every suggestion and reason is the suite's own words.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '反馈组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-decision-feedback-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'feedback.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function suggestion(book: Imported, window: ManuscriptWindowProjection, from: number, to: number, proposedText: string): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40)!;
  return {
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale: '与全书用法统一。',
  };
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

function decisionOf(command: EditorialMarkCommandProjection) {
  return command.card!.suggestion!.decision!;
}

describe('the reason after a Proposal Decision', () => {
  it('asks once: 不说明 records only that no reason was given, a reason of the editor’s own accord follows it, and a changed reason keeps the one before', async () => {
    let book: Imported;
    let first: string;
    let second: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const binding = { ...book, windowStartBlockId: window.blocks[0]!.blockId };
      first = store.createEditorialMark(suggestion(book, window, 6, 12, '示例替换文字')).markId;
      second = store.createEditorialMark(suggestion(book, window, 20, 26, '另一处替换')).markId;
      const decide = (markId: string, disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn', editedText: string | null, reason: string | null) =>
        store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition, editedText, reason });
      const feedback = (input: Partial<RecordProposalDecisionFeedbackInput> & Pick<RecordProposalDecisionFeedbackInput, 'decisionId'>) =>
        store.recordProposalDecisionFeedback({ ...binding, markId: first, expectedFeedback: 0, action: 'dismiss', reason: null, reasonSource: null, ...input });

      // 拒绝 recorded without a reason: nothing given, nothing dismissed, nothing after it.
      const rejected = decisionOf(decide(first, 'rejected', null, null));
      expect(rejected).toMatchObject({ reason: null, reasonSource: null, reasonState: 'none', feedbackEntries: 0, reasonRevisedAt: null });
      const decisionId = rejected.decisionId;

      // A reason can only be changed once there is one; the entries the editor saw are the ones there; the decision is the
      // mark's current one; and each action has its own shape.
      expect(refusal(() => feedback({ decisionId, action: 'revise', reason: '另说', reasonSource: 'free-text' }))).toBe('DECISION_FEEDBACK_INVALID:这次处理还没有原因可改；请先补充原因。');
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 1 }))).toBe('DECISION_FEEDBACK_MOVED:这次处理的原因刚被改过；请看过现在的原因再改。');
      expect(refusal(() => feedback({ decisionId: randomUUID() }))).toBe('MARK_DECISION_INVALID:这次处理已经变化，无法补记原因。');
      expect(refusal(() => feedback({ decisionId, reason: '顺带一句' }))).toBe('MARK_INVALID:原因操作无效。');
      expect(refusal(() => feedback({ decisionId, action: 'revise', reason: '另说', reasonSource: null }))).toBe('MARK_INVALID:原因操作无效。');

      // 不说明: recorded as no more than that, once.
      const dismissed = decisionOf(feedback({ decisionId }));
      expect(dismissed).toMatchObject({ reason: null, reasonState: 'dismissed', feedbackEntries: 1 });
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 1 }))).toBe('DECISION_FEEDBACK_UNCHANGED:已经记下「不说明」。');

      // The editor may still give a reason of their own accord; it stands over the dismissal.
      const given = decisionOf(store.recordProposalDecisionReason({ ...binding, markId: first, decisionId, reason: '证据不足', reasonSource: 'suggested' }));
      expect(given).toMatchObject({ reason: '证据不足', reasonSource: 'suggested', reasonState: 'given', feedbackEntries: 1, reasonRevisedAt: null });
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 1 }))).toBe('DECISION_FEEDBACK_INVALID:这次处理已经说明了原因。');
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 1, action: 'revise', reason: '证据不足', reasonSource: 'suggested' }))).toBe('DECISION_FEEDBACK_UNCHANGED:原因没有变化。');

      // 改原因 records a successor; the first reason stays on record, and a stale change is refused.
      const revised = decisionOf(feedback({ decisionId, expectedFeedback: 1, action: 'revise', reason: '  其实是篇幅所限  ', reasonSource: 'free-text' }));
      expect(revised).toMatchObject({ reason: '其实是篇幅所限', reasonSource: 'free-text', reasonState: 'given', feedbackEntries: 2 });
      expect(revised.reasonRevisedAt).not.toBeNull();
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 1, action: 'revise', reason: '再改一次', reasonSource: 'free-text' }))).toBe('DECISION_FEEDBACK_MOVED:这次处理的原因刚被改过；请看过现在的原因再改。');

      // 修改后接受 with 为什么这样改 filled is not asked again, and its reason can be changed like any other.
      const edited = decisionOf(decide(second, 'accepted-with-edit', '编辑改过的说法', '更贴近作者的语气'));
      expect(edited).toMatchObject({ reason: '更贴近作者的语气', reasonSource: 'reason-field', reasonState: 'given', feedbackEntries: 0 });
      const editedAgain = decisionOf(store.recordProposalDecisionFeedback({
        ...binding, markId: second, decisionId: edited.decisionId, expectedFeedback: 0, action: 'revise', reason: '保持作者风格', reasonSource: 'suggested',
      }));
      expect(editedAgain).toMatchObject({ reason: '保持作者风格', reasonSource: 'suggested', feedbackEntries: 1 });
      // Changed again, the latest change is the one that stands.
      const editedThird = decisionOf(store.recordProposalDecisionFeedback({
        ...binding, markId: second, decisionId: edited.decisionId, expectedFeedback: 1, action: 'revise', reason: '语言更准确', reasonSource: 'suggested',
      }));
      expect(editedThird).toMatchObject({ reason: '语言更准确', reasonSource: 'suggested', reasonState: 'given', feedbackEntries: 2 });

      // A decision withdrawn and made again is a new decision, asked for itself.
      expect(decide(first, 'withdrawn', null, null).card!.suggestion!.decision).toBeNull();
      const again = decisionOf(decide(first, 'rejected', null, null));
      expect(again.decisionId).not.toBe(decisionId);
      expect(again).toMatchObject({ reasonState: 'none', feedbackEntries: 0 });
      // The superseded decision's reason is no longer the card's to change.
      expect(refusal(() => feedback({ decisionId, expectedFeedback: 2, action: 'revise', reason: '晚了', reasonSource: 'free-text' }))).toBe('MARK_DECISION_INVALID:这次处理已经变化，无法补记原因。');
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every entry, and the first reasons stay where revision 22 keeps them.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const card = (markId: string) => reopened.getEditorialMarkCard(book!.manuscriptId, book!.branchId, markId);
      expect(card(second!).suggestion!.decision).toMatchObject({ reason: '语言更准确', reasonState: 'given', feedbackEntries: 2 });
      expect(card(first!).suggestion!.decision).toMatchObject({ reasonState: 'none', feedbackEntries: 0 });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_MERGE_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM proposal_decision_feedback').get() as { count: number }).count).toBe(4);
      expect((database.prepare("SELECT group_concat(reason, '|') reasons FROM (SELECT reason FROM proposal_decision_reasons ORDER BY reason)").get() as { reasons: string }).reasons)
        .toBe('更贴近作者的语气|证据不足');
      expect(() => database.exec("UPDATE proposal_decision_feedback SET kind = 'dismissed'")).toThrowError(/DECISION_FEEDBACK_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM proposal_decision_feedback')).toThrowError(/DECISION_FEEDBACK_LEDGER_IMMUTABLE/u);
      // Rewritten by hand behind the triggers' back, the reason no longer reads, and the card says so rather than guess.
      database.exec('DROP TRIGGER proposal_decision_feedback_no_update');
      database.exec("UPDATE proposal_decision_feedback SET canonical_json = replace(canonical_json, '保持作者风格', '改过')");
      database.exec(DECISION_FEEDBACK_TRIGGER_SQL.proposal_decision_feedback_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.getEditorialMarkCard(book!.manuscriptId, book!.branchId, second!))).toBe('DECISION_FEEDBACK_RECORD_INVALID:处理原因的记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 180_000);

  it('adds revision 49 to a revision-48 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE database_merges; DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; DROP TABLE series_knowledge_promotions; DROP TABLE series_knowledge_revisions; DROP TABLE series_knowledge_candidates; DROP TABLE series_knowledge_items; DROP TABLE series_membership_changes; DROP TABLE series; DROP TABLE evaluation_preferences; DROP TABLE publication_actuals; DROP TABLE learning_eligibility_decisions; DROP TABLE proposal_decision_feedback; PRAGMA user_version = ${ANALYSIS_FEEDBACK_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_MERGE_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM proposal_decision_feedback').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);
});
