import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import * as documents from '../../../../src/service/production-document-operations.js';
import { StoreError } from '../../../../src/service/store-records.js';
import {
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  PRODUCTION_DOCUMENT_PHASE_IDS,
  type ProductionDocumentDeliveryVersionInput,
  type ProductionDocumentPhaseAction,
  type ProductionDocumentPhaseId,
  type ProductionDocumentProjection,
  type ProductionDocumentRecipientKind,
  type ProductionDocumentWorkflowProjection,
} from '../../../../src/shared/protocol/deliverables.js';
import { seedBook, seededEvaluationDatabase } from '../../../support/domain/evaluation.js';
import { productionDocumentFixture, seedPrimaryManuscript, type ProductionDocumentFixture } from '../../../support/domain/production-documents.js';

// Production Documents over the domain relations: the house types and the decisions about them, a document's versions and
// Delivery Records and their refusals, and the Deliverable Workflow's moves. The Book and its primary Manuscript are seeded;
// the ledgers, the workflow and the block store are the production ones. No manuscript text is involved.

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

async function asyncCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

interface Setup { db: DatabaseSync; fixture: ProductionDocumentFixture; bookId: string; manuscriptRevisionId: string }

async function withBook(run: (setup: Setup) => Promise<void>): Promise<void> {
  const db = await seededEvaluationDatabase();
  try {
    const fixture = await productionDocumentFixture(db);
    const bookId = seedBook(db, '交付记录组稿');
    const manuscript = seedPrimaryManuscript(db, bookId);
    await run({ db, fixture, bookId, manuscriptRevisionId: manuscript.revisionId });
  } finally { db.close(); }
}

const saved = (revisionId: string): ProductionDocumentDeliveryVersionInput => ({ kind: 'saved', revisionId });

/** A saved next version of the document, as 保存为版本 leaves it: a revision of the document's branch and its version row. */
function seedSavedVersion(setup: Setup, document: ProductionDocumentProjection): string {
  const revisionId = randomUUID();
  const digest = 'e'.repeat(64);
  setup.db.prepare(`INSERT INTO manuscript_revisions(revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id, source_version_id, revision_digest, created_at)
    VALUES (?, ?, ?, 2, 'r2', ?, ?, ?, ?)`).run(revisionId, document.documentId, document.branchId, document.versions[0]!.revisionId, document.origin.sourceVersionId, digest, new Date().toISOString());
  setup.fixture.productionDocuments.recordVersion(document.documentId, revisionId, digest, 'saved');
  return revisionId;
}

describe('Production Documents over the domain relations', () => {
  it('offers the five house types before any source material is available', async () => {
    await withBook(async ({ fixture, bookId }) => {
      const projection = documents.inspectProductionDocuments(fixture.host, bookId);
      expect(projection.types.map((type) => [type.typeId, type.label, type.notForThisBook, type.document])).toEqual([
        ['news-release', '新闻稿', false, null], ['promotion-article', '宣传文章', false, null],
        ['review-article', '评论文章', false, null], ['launch-materials', '发布会材料', false, null],
        ['marketing-points', '营销要点', false, null],
      ]);
      expect(projection.sources).toEqual([]);
      expect(projection.unavailableReason).toBeNull();
    });
  });

  it('keeps versions while a type is not for this Book and restores creation when asked', async () => {
    await withBook(async (setup) => {
      const { fixture, bookId } = setup;
      const created = (await documents.createProductionDocument(fixture.host, { bookId, typeId: 'news-release' })).document!;
      seedSavedVersion(setup, created);
      const reading = () => documents.inspectProductionDocuments(fixture.host, bookId).types[0]!.document!;
      const decision = documents.decideProductionDocumentType(fixture.host, { bookId, typeId: 'news-release', notForThisBook: true });
      expect(decision.document!.versions).toEqual(reading().versions);
      expect(decision.document!.versions).toHaveLength(2);
      expect(decision.documents.types[0]!.notForThisBook).toBe(true);
      const input = { bookId, typeId: 'promotion-article', notForThisBook: true };
      const marked = documents.decideProductionDocumentType(fixture.host, input);
      expect(await asyncCode(() => documents.createProductionDocument(fixture.host, { bookId, typeId: input.typeId }))).toBe('PRODUCTION_DOCUMENT_NOT_FOR_THIS_BOOK');
      expect(documents.decideProductionDocumentType(fixture.host, input)).toEqual(marked);
      expect(code(() => documents.decideProductionDocumentType(fixture.host, { bookId, typeId: 'review-article', notForThisBook: false }))).toBe('no-error');
      expect(documents.decideProductionDocumentType(fixture.host, { ...input, notForThisBook: false }).documents.types[1]!.notForThisBook).toBe(false);
      expect(reading().documentId).toBe(created.documentId);
    });
  });

  it('refuses a document for a Book without its Manuscript', async () => {
    const db = await seededEvaluationDatabase();
    try {
      const fixture = await productionDocumentFixture(db);
      const bookId = seedBook(db, '只有来源的书');
      const projection = documents.inspectProductionDocuments(fixture.host, bookId);
      expect(projection.unavailableReason).toBe('先导入稿件，再创建生产文档');
      expect(await asyncCode(() => documents.createProductionDocument(fixture.host, { bookId, typeId: 'news-release', sourceVersionId: randomUUID() })))
        .toBe('PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT');
    } finally { db.close(); }
  });

  describe('交付 of a Production Document (S66b)', () => {
    it('refuses deliveries that do not name this document version and a valid recipient and note', async () => {
      await withBook(async ({ fixture, bookId, manuscriptRevisionId }) => {
        const created = (await documents.createProductionDocument(fixture.host, { bookId, typeId: 'news-release' })).document!;
        const deliver = (version: ProductionDocumentDeliveryVersionInput, kind: ProductionDocumentRecipientKind = 'publicity', custom: string | null = null, note: string | null = null) =>
          documents.recordProductionDocumentDelivery(fixture.host, { bookId, documentId: created.documentId, version, recipient: { kind, custom }, note });
        const version1 = saved(created.versions[0]!.revisionId);
        expect(await asyncCode(() => deliver(saved(manuscriptRevisionId)))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
        expect(await asyncCode(() => deliver(version1, 'custom', '   '))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
        expect(await asyncCode(() => deliver(version1, 'publicity', '宣传部'))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
        expect(await asyncCode(() => deliver(version1, 'publicity', null, '注'.repeat(501)))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
        expect(await asyncCode(() => documents.recordProductionDocumentDelivery(fixture.host, {
          bookId, documentId: randomUUID(), version: version1, recipient: { kind: 'publicity', custom: null }, note: null,
        }))).toBe('PRODUCTION_DOCUMENT_NOT_FOUND');
        expect(documents.inspectProductionDocuments(fixture.host, bookId).types[0]!.document!.deliveries).toEqual([]);
      });
    });
  });

  describe('the Deliverable Workflow of a Production Document (Issue #415, S66c)', () => {
    /** Each phase as `[state, the pill it shows, what it waits on]`, in the profile's order. */
    const workflowOf = (setup: Setup): ProductionDocumentWorkflowProjection =>
      documents.inspectProductionDocuments(setup.fixture.host, setup.bookId).types.find((type) => type.typeId === 'news-release')!.document!.workflow;

    it('follows the built-in profile\'s seven phases from its making, moved only by the editor\'s four commands and their reasons', async () => {
      await withBook(async (setup) => {
        const { db, fixture, bookId } = setup;
        const document = (await documents.createProductionDocument(fixture.host, { bookId, typeId: 'news-release' })).document!;
        const move = (phaseId: ProductionDocumentPhaseId, action: ProductionDocumentPhaseAction, reason: { choice: string; text: string | null } | null = null) =>
          documents.transitionProductionDocumentPhase(fixture.host, {
            bookId, documentId: document.documentId, phaseId, action, expectedTransitions: workflowOf(setup).transitions, reason,
          });

        // WORK-002/003: pinned to the built-in profile when the document was made; seven phases, none started.
        const fresh = workflowOf(setup);
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
        let now = workflowOf(setup);
        expect(now.summary).toBe('2 个阶段进行中 · 0 项等待处理');
        expect(now.next).toEqual([{ phaseId: 'intake', text: '接收与准备 · 进行中' }, { phaseId: 'drafting', text: '起草 · 进行中' }]);
        move('drafting', 'complete');
        expect(code(() => move('drafting', 'complete'))).toBe('PRODUCTION_DOCUMENT_PHASE_INVALID');
        expect(code(() => move('maintenance', 'reopen', { choice: 'needs-change', text: null }))).toBe('PRODUCTION_DOCUMENT_PHASE_INVALID');

        // A move against a count the editor did not see is refused: someone else moved the workflow first.
        const seen = workflowOf(setup).transitions;
        move('intake', 'complete');
        expect(code(() => documents.transitionProductionDocumentPhase(fixture.host, {
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
        now = workflowOf(setup);
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
        // WORK-009: every move stays, in order, and the ledger takes no change.
        expect(db.prepare('SELECT phase_id, action FROM production_document_phase_transitions ORDER BY ordinal').all().map((row) => `${row.phase_id}:${row.action}`))
          .toEqual(['drafting:start', 'intake:start', 'drafting:complete', 'intake:complete', 'source-development:skip', 'drafting:reopen']);
        expect(() => db.exec('UPDATE production_document_phase_transitions SET reason_text = NULL WHERE ordinal = 6')).toThrow(/PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE/u);
        expect(() => db.exec('DELETE FROM production_document_workflow_instances')).toThrow(/PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE/u);
        // The restart and the historical reason words are proven on disk: tests/service/production-document-workflow.test.ts.
      });
    });
  });
});
