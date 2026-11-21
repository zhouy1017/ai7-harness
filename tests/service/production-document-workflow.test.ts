import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL } from '../../src/service/production-document-workflow.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
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
  // The phase rules and refusals are proven over the domain relations (tests/unit/domain/production-documents). What only a real
  // store can prove stays here: the six moves survive closing and reopening the store, and a historical reason reads through actual startup.
  it('keeps its six moves across a restart, and reads a move\'s recorded reason after a relabel or a retired key (WORK-009, Issue #626)', async () => {
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
      move('drafting', 'start');
      move('intake', 'start');
      move('drafting', 'complete');
      move('intake', 'complete');
      move('source-development', 'skip', { choice: 'done-elsewhere', text: null });
      move('drafting', 'reopen', { choice: 'custom', text: '  读者反馈后要改开头  ' });
      const now = workflowOf(store, bookId);
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

    // WORK-009 (Issue #626): a move records its reason's words with it, so they read as recorded — after a relabel, and for a
    // key no longer offered. The skip of 来源建设 was the fifth move.
    const rewrite = (change: (record: Record<string, unknown>) => Record<string, unknown>, choice: string): void => {
      const tamper = new DatabaseSync(path);
      try {
        const row = tamper.prepare('SELECT canonical_json FROM production_document_phase_transitions WHERE ordinal = 5').get() as { canonical_json: string };
        const record = canonicalRecord(change(parseCanonicalJson(row.canonical_json) as Record<string, unknown>));
        tamper.exec('DROP TRIGGER production_document_phase_transitions_no_update');
        tamper.prepare('UPDATE production_document_phase_transitions SET reason_choice = ?, canonical_json = ?, sha256 = ? WHERE ordinal = 5')
          .run(choice, record.json, record.digest);
        tamper.exec(PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL.production_document_phase_transitions_no_update!);
      } finally {
        tamper.close();
      }
    };
    const skipOf = async (): Promise<unknown> => {
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const read = (() => {
          try {
            return workflowOf(store, bookId!).phases.find((entry) => entry.phaseId === 'source-development')!.latest!.reason;
          } catch (error) {
            return error instanceof StoreError ? error.code : error;
          }
        })();
        store.markCleanShutdown();
        return read;
      } finally {
        store.close();
      }
    };
    const recorded = new DatabaseSync(path, { readOnly: true });
    try {
      const row = recorded.prepare('SELECT canonical_json FROM production_document_phase_transitions WHERE ordinal = 5').get() as { canonical_json: string };
      expect((parseCanonicalJson(row.canonical_json) as { reason: unknown }).reason).toEqual({ choice: 'done-elsewhere', label: '这一阶段已在别处完成', text: null });
    } finally {
      recorded.close();
    }
    rewrite((record) => ({ ...record, reason: { choice: 'retired-reason', label: '当时的说法', text: null } }), 'retired-reason');
    expect(await skipOf()).toEqual({ choice: 'retired-reason', label: '当时的说法', text: null });
    // A move recorded before its words were reads its key's words now, and one whose key no longer names a reason is refused.
    rewrite((record) => ({ ...record, reason: { choice: 'done-elsewhere', text: null } }), 'done-elsewhere');
    expect(await skipOf()).toEqual({ choice: 'done-elsewhere', label: '这一阶段已在别处完成', text: null });
    rewrite((record) => ({ ...record, reason: { choice: 'retired-reason', text: null } }), 'retired-reason');
    expect(await skipOf()).toBe('PRODUCTION_DOCUMENT_RECORD_INVALID');
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
      // Cancelling the export surface leaves only the Delivery Record, not its required file.
      expect(delivery()).toEqual(['in-progress', '等待你处理', '交付文件尚未导出']);
      const revisionId = saved.document!.versions[0]!.revisionId;
      const target = { kind: 'document', documentId: document.documentId, revisionId } as const;
      const options = { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS };
      const reviewed = await store.reviewManuscriptExport({ bookId, target, options }, true);
      const gone = join(roots.inputRoot, 'removed-export-folder');
      await mkdir(gone);
      const failed = await store.prepareManuscriptExport({
        bookId, revisionId, target, options, reviewDigest: reviewed.reviewDigest, destination: join(gone, 'delivery.docx'),
      }, true);
      await rm(gone, { recursive: true });
      expect((await store.approveManuscriptExport({ bookId, preparationId: failed.preparationId }, true)).outcome).toBe('failed');
      expect(delivery()).toEqual(['in-progress', '等待你处理', '交付文件尚未导出']);
      const prepared = await store.prepareManuscriptExport({
        bookId, revisionId, target, options, reviewDigest: reviewed.reviewDigest,
        destination: join(roots.inputRoot, 'delivery.docx'),
      }, true);
      expect((await store.approveManuscriptExport({ bookId, preparationId: prepared.preparationId }, true)).outcome).toBe('created');
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

});
