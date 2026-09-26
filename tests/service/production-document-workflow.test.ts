import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION, SCHEDULED_BACKUP_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  PRODUCTION_DOCUMENT_PHASE_IDS,
  type ProductionDocumentPhaseAction,
  type ProductionDocumentPhaseId,
  type ProductionDocumentWorkflowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for a Production Document's Deliverable Workflow (Issue #415, plan slice S66c;
// V2-UX-WORK-001 to 009, WORK-011) over the real `EditorialStore` on a temporary Agent Data Root. The manuscript and the draft
// a document starts from are composed from exact `sample1`'s paragraphs; nothing asserts or prints their text.

const SOURCE = ADMITTED_BASELINE_DOCX;
let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

const span = (block: number): SourceSpan => ({ block });

async function compose(name: string, blocks: ReadonlyArray<number>): Promise<string> {
  const path = join(roots.inputRoot, `${name}.docx`);
  await composeRevisedDocx(path, { source: SOURCE, title: name, paragraphs: blocks.map((block) => ({ runs: [{ text: span(block) }] })) });
  return path;
}

async function importBook(store: EditorialStore, path: string): Promise<string> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.bookId;
}

/** A 新闻稿 made from source material the Book was given: its identity and branch. */
async function newsRelease(store: EditorialStore, bookId: string): Promise<{ documentId: string; branchId: string; createdAt: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), await compose('新闻稿初稿', [21, 22]));
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const created = (await store.createProductionDocument({ bookId, typeId: 'news-release', sourceVersionId: commit.sourceVersionId })).document!;
  return { documentId: created.documentId, branchId: created.branchId, createdAt: created.createdAt };
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function workflowOf(store: EditorialStore, bookId: string): ProductionDocumentWorkflowProjection {
  return store.inspectProductionDocuments(bookId).types.find((type) => type.typeId === 'news-release')!.document!.workflow;
}

/** Each phase as `[state, the pill it shows, what it waits on]`, in the profile's order. */
function states(workflow: ProductionDocumentWorkflowProjection): Array<[string, string, string | null]> {
  return workflow.phases.map((phase) => [phase.state, phase.stateLabel, phase.waiting]);
}

describe('the Deliverable Workflow of a Production Document (Issue #415, S66c)', () => {
  it('follows the built-in profile\'s seven phases from its making, moved only by the editor\'s four commands and their reasons', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let settled: string;
    try {
      bookId = await importBook(store, await compose('工作流程组稿', [1, 2, 3]));
      const document = await newsRelease(store, bookId);
      const move = (phaseId: ProductionDocumentPhaseId, action: ProductionDocumentPhaseAction, reason: { choice: string; text: string | null } | null = null) =>
        store.transitionProductionDocumentPhase({
          bookId, documentId: document.documentId, phaseId, action, expectedTransitions: workflowOf(store, bookId).transitions, reason,
        });

      // WORK-002/003: pinned to the built-in profile when the document was made; seven phases, none started.
      const fresh = workflowOf(store, bookId);
      expect(fresh.profile).toMatchObject({ name: '基础书稿编辑流程', version: '2.0.0', activatedAt: document.createdAt });
      expect([fresh.summary, fresh.next, fresh.transitions]).toEqual(['七个阶段都未开始', [], 0]);
      expect(fresh.phases.map((phase) => phase.phaseId)).toEqual(PRODUCTION_DOCUMENT_PHASE_IDS);
      expect(fresh.phases.map((phase) => phase.label)).toEqual(['接收与准备', '来源建设', '起草', '审阅与核查', '定稿', '交付', '维护']);
      expect(fresh.phases.every((phase) => phase.state === 'not-started' && phase.latest === null && phase.moves === 0 &&
        phase.actions.join() === 'start,skip')).toBe(true);

      // 开始 and 完成 take no reason; several phases may be open at once.
      expect(code(() => move('drafting', 'start', { choice: 'not-needed', text: null }))).toBe('PRODUCTION_DOCUMENT_PHASE_INVALID');
      move('drafting', 'start');
      move('intake', 'start');
      let now = workflowOf(store, bookId);
      expect(now.summary).toBe('2 个阶段进行中 · 0 项等待处理');
      expect(now.next).toEqual([{ phaseId: 'intake', text: '接收与准备 · 进行中' }, { phaseId: 'drafting', text: '起草 · 进行中' }]);
      move('drafting', 'complete');
      expect(code(() => move('drafting', 'complete'))).toBe('PRODUCTION_DOCUMENT_PHASE_INVALID');
      expect(code(() => move('maintenance', 'reopen', { choice: 'needs-change', text: null }))).toBe('PRODUCTION_DOCUMENT_PHASE_INVALID');

      // A move against a count the editor did not see is refused: someone else moved the workflow first.
      const seen = workflowOf(store, bookId).transitions;
      move('intake', 'complete');
      expect(code(() => store.transitionProductionDocumentPhase({
        bookId, documentId: document.documentId, phaseId: 'finalization', action: 'start', expectedTransitions: seen, reason: null,
      }))).toBe('PRODUCTION_DOCUMENT_WORKFLOW_CHANGED');

      // 跳过 needs a reason from its set, and 自行输入 needs the editor's words, within their bound.
      expect(code(() => move('source-development', 'skip'))).toBe('PRODUCTION_DOCUMENT_PHASE_REASON_REQUIRED');
      expect(code(() => move('source-development', 'skip', { choice: 'needs-change', text: null }))).toBe('PRODUCTION_DOCUMENT_PHASE_REASON_REQUIRED');
      expect(code(() => move('source-development', 'skip', { choice: 'custom', text: '   ' }))).toBe('PRODUCTION_DOCUMENT_PHASE_REASON_REQUIRED');
      expect(code(() => move('source-development', 'skip', { choice: 'custom', text: '因'.repeat(MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS + 1) })))
        .toBe('PRODUCTION_DOCUMENT_PHASE_REASON_INVALID');
      move('source-development', 'skip', { choice: 'done-elsewhere', text: null });
      // 重新打开 the same way, keeping the editor's words as written, trimmed.
      move('drafting', 'reopen', { choice: 'custom', text: '  读者反馈后要改开头  ' });
      now = workflowOf(store, bookId);
      const phase = (id: ProductionDocumentPhaseId) => now.phases.find((entry) => entry.phaseId === id)!;
      expect(phase('source-development')).toMatchObject({
        state: 'skipped', stateLabel: '已跳过', actions: ['reopen'], moves: 1,
        latest: { action: 'skip', fromState: 'not-started', toState: 'skipped', reason: { choice: 'done-elsewhere', label: '这一阶段已在别处完成', text: null } },
      });
      expect(phase('drafting')).toMatchObject({
        state: 'reopened', stateLabel: '已重新打开', actions: ['complete', 'skip'], moves: 3,
        latest: { action: 'reopen', fromState: 'completed', toState: 'reopened', reason: { choice: 'custom', label: '自行输入', text: '读者反馈后要改开头' } },
      });
      expect(phase('intake')).toMatchObject({ state: 'completed', actions: ['reopen'], moves: 2 });
      expect([now.transitions, now.summary]).toEqual([6, '1 个阶段进行中 · 0 项等待处理']);
      settled = JSON.stringify(now);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // WORK-009: every move stays, in order, and the ledger takes no change.
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const database = new DatabaseSync(path);
    try {
      expect(database.prepare('SELECT phase_id, action FROM production_document_phase_transitions ORDER BY ordinal').all().map((row) => `${row.phase_id}:${row.action}`))
        .toEqual(['drafting:start', 'intake:start', 'drafting:complete', 'intake:complete', 'source-development:skip', 'drafting:reopen']);
      expect(() => database.exec("UPDATE production_document_phase_transitions SET reason_text = NULL WHERE ordinal = 6")).toThrow(/PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM production_document_workflow_instances')).toThrow(/PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE/u);
    } finally {
      database.close();
    }
    // A restart reads it as it was.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.stringify(workflowOf(reopened, bookId!))).toBe(settled!);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('says what an open phase waits on from the document\'s own facts, and records none of it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookId = await importBook(store, await compose('等待组稿', [1, 2]));
      const document = await newsRelease(store, bookId);
      const move = (phaseId: ProductionDocumentPhaseId, action: ProductionDocumentPhaseAction) =>
        store.transitionProductionDocumentPhase({
          bookId, documentId: document.documentId, phaseId, action, expectedTransitions: workflowOf(store, bookId).transitions, reason: null,
        });
      const delivery = () => states(workflowOf(store, bookId))[5];
      // A phase not started waits on nothing, whatever the document holds.
      expect(delivery()).toEqual(['not-started', '未开始', null]);
      move('delivery', 'start');
      expect(delivery()).toEqual(['in-progress', '等待你处理', '尚未交付']);
      expect(workflowOf(store, bookId)).toMatchObject({ summary: '1 个阶段进行中 · 1 项等待处理', next: [{ phaseId: 'delivery', text: '交付 · 尚未交付' }] });
      // An edit: the text is no version yet.
      const window = store.getManuscriptWindow(document.documentId, document.branchId, null);
      const first = window.blocks[0]!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: document.documentId, branchId: document.branchId, baseRevisionId: window.revisionId,
        blockId: first.blockId, windowStartBlockId: first.blockId, baseBlockDigest: first.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（修订）',
      });
      expect(delivery()).toEqual(['in-progress', '等待你处理', '有修改尚未保存为版本']);
      const saved = await store.saveProductionDocumentVersion({ bookId, documentId: document.documentId, branchId: document.branchId });
      expect(delivery()).toEqual(['in-progress', '等待你处理', '尚未交付']);
      await store.recordProductionDocumentDelivery({
        bookId, documentId: document.documentId, version: { kind: 'saved', revisionId: saved.document!.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      expect(delivery()).toEqual(['in-progress', '进行中', null]);
      // 审阅与核查 waits on the document's open 修改建议.
      move('review-verification', 'start');
      expect(states(workflowOf(store, bookId))[3]).toEqual(['in-progress', '进行中', null]);
      const now = store.getManuscriptWindow(document.documentId, document.branchId, null);
      const block = now.blocks[0]!;
      store.createEditorialMark({
        manuscriptId: document.documentId, branchId: document.branchId, windowStartBlockId: block.blockId, clientMarkId: randomUUID(),
        baseRevisionId: now.revisionId, expectedJournalSequence: now.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
        fromGrapheme: 0, toGrapheme: 2, selectedText: [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(block.text)].slice(0, 2).map((part) => part.segment).join(''),
        kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '〔建议〕', rationale: null,
      });
      expect(states(workflowOf(store, bookId))[3]).toEqual(['in-progress', '等待你处理', '1 条修改建议待处理']);
      // None of it is a move: the ledger holds only the editor's two.
      expect(workflowOf(store, bookId).transitions).toBe(2);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('gives every document of a revision-39 store its workflow, begun when the document was made, and moves nothing', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let before: string;
    let createdAt: string;
    try {
      bookId = await importBook(store, await compose('迁移流程组稿', [1, 2]));
      createdAt = (await newsRelease(store, bookId)).createdAt;
      before = JSON.stringify(store.inspectProductionDocuments(bookId));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    try {
      planted.exec('PRAGMA foreign_keys = OFF');
      planted.exec(`BEGIN IMMEDIATE;
        DROP TABLE scheduled_backup_removals;
        DROP TABLE scheduled_backups;
        DROP TABLE backup_preferences;
        DROP TABLE database_export_receipts;
        DROP TABLE database_export_approvals;
        DROP TABLE database_export_preparations;
        DROP TABLE store_versions;
        DROP TABLE series_knowledge_promotions;
        DROP TABLE series_knowledge_revisions;
        DROP TABLE series_knowledge_candidates;
        DROP TABLE series_knowledge_items;
        DROP TABLE series_membership_changes;
        DROP TABLE series;
        DROP TABLE evaluation_preferences;
        DROP TABLE publication_actuals;
        DROP TABLE learning_eligibility_decisions;
        DROP TABLE proposal_decision_feedback;
        DROP TABLE analysis_feedback_signals;
        DROP TABLE evaluation_record_entries;
        DROP TABLE evaluation_records;
        DROP TABLE library_material_decisions;
        DROP TABLE library_materials;
        DROP TABLE review_guideline_versions;
        DROP TABLE book_people_versions;
        DROP TABLE maintenance_case_revisions;
        DROP TABLE maintenance_errata_versions;
        DROP TABLE maintenance_cases;
        DROP TABLE production_document_origin_readings;
        DROP TABLE book_delivery_package_export_files;
        DROP TABLE book_delivery_package_exports;
        DROP TABLE production_document_phase_transitions;
        DROP TABLE production_document_workflow_instances;
        PRAGMA user_version = ${BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION};
        COMMIT;`);
      planted.exec('PRAGMA foreign_keys = ON');
    } finally {
      planted.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The document reads exactly as it did: the same profile, activated when it was made, no phase moved. Only what its
      // material held reads as unknown, since a store that old never counted it (Issue #547).
      expect(JSON.stringify(migrated.inspectProductionDocuments(bookId!))).toBe(before!.replaceAll('"marksNotCarried":0', '"marksNotCarried":null'));
      expect(workflowOf(migrated, bookId!).profile.activatedAt).toBe(createdAt!);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEDULED_BACKUP_SCHEMA_VERSION);
      expect((after.prepare('SELECT count(*) count FROM production_document_workflow_instances').get() as { count: number }).count).toBe(1);
      expect((after.prepare('SELECT count(*) count FROM production_document_phase_transitions').get() as { count: number }).count).toBe(0);
    } finally {
      after.close();
    }
  }, 120_000);
});
