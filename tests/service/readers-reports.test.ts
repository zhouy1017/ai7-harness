import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { READERS_REPORT_NEEDS_FINALIZED, READERS_REPORT_TRIGGER_SQL } from '../../src/service/readers-reports.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_59_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  INITIAL_EVALUATION_SCHEMA_VERSION,
  READERS_REPORT_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  READERS_REPORT_ASSURANCE_STATEMENT,
  READERS_REPORT_CONTRACT_VERSION,
  READERS_REPORT_KIND,
  READERS_REPORT_LIVE_UNAVAILABLE,
  READERS_REPORT_NO_EXEMPLAR,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { KIND_COUPLED_ANALYSIS_RELATIONS, downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { AUTHORED_SECTIONS, READERS_REPORT_FIXTURE_IDENTITY, finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';


// Service-integration suite (L2) for 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013): the reader's report kind over the real
// store and ledger, the one execution owner and the AI7 local deterministic adapter over the authored fixture
// `sample1-readers-report-authored`; drafted from a 定稿 Evaluation Record begun from AI7's 初评, opened as an Editorial Artifact
// in the block store, and exported as DOCX. The manuscript is exact `sample1` (ADR 0043); no Provider, socket or credential value
// is involved. Assertions name states, words of the draft's structure and counts, never manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-readers-report-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, READERS_REPORT_FIXTURE_IDENTITY);
  expect(fixture.provenance).toBe('authored');
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

interface Book {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly bookId: string;
}

async function openStore(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

async function withBook(body: (book: Book) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await openStore();
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, '审稿意见之书');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    await body({ store, owner, bookId: imported.bookId });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** 起草 one template to its frozen plan, 开始任务 through the governor, and the Run to its end. */
async function draftReport(book: Book, template: 'author' | 'editorial'): Promise<string> {
  let progress = book.store.createReadersReportPreparationWork(book.bookId, template, launchPolicy);
  while (!progress.done) progress = book.store.advanceReadersReportPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  expect(prepared).toMatchObject({ kind: READERS_REPORT_KIND, contractVersion: READERS_REPORT_CONTRACT_VERSION, state: 'prepared' });
  const authorized = book.store.authorizeReadersReport(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await book.owner.whenIdle();
  return prepared.taskIntent!.taskIntentId;
}

const { schema: _schema, ...SECTIONS } = AUTHORED_SECTIONS;

describe('审稿意见 over the real store on exact sample1', () => {
  it('drafts from a 定稿 version under a template, says it has no exemplar, and opens the draft as a document that exports as DOCX', async () => {
    await withBook(async (book) => {
      // Nothing to draft from before a version is 定稿.
      const before = book.store.inspectEvaluation(book.bookId, null).readersReport;
      expect(before).toMatchObject({ basis: null, task: null, exemplars: { count: 0, statement: READERS_REPORT_NO_EXEMPLAR } });
      expect(before.templates.map((entry) => [entry.template, entry.label, entry.prepare])).toEqual([
        ['author', '给作者的修改意见', { allowed: false, reason: READERS_REPORT_NEEDS_FINALIZED }],
        ['editorial', '给编辑部 / 选题会的审读报告', { allowed: false, reason: READERS_REPORT_NEEDS_FINALIZED }],
      ]);
      expect(await refusal(() => book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy)))
        .toBe(`READERS_REPORT_NEEDS_FINALIZED:${READERS_REPORT_NEEDS_FINALIZED}`);

      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      const finalized = finalizeAsJ11(book.store, book.bookId);
      expect(finalized).toMatchObject({ ordinal: 2, state: 'finalized', conclusion: 'revise', total: { score: 71, fullMarks: 100 } });
      const ready = book.store.inspectEvaluation(book.bookId, null).readersReport;
      expect(ready.basis).toMatchObject({ recordId: finalized.recordId, ordinal: 2, revisionLabel: 'r1' });
      expect(ready.templates.map((entry) => entry.prepare)).toEqual([
        { allowed: true, mode: 'readers-report-first' }, { allowed: true, mode: 'readers-report-first' },
      ]);

      // The plan in the Task Drawer, in the editor's words: the version and template it drafts from, and no exemplar.
      let progress = book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy);
      while (!progress.done) progress = book.store.advanceReadersReportPreparationWork(progress.workId!);
      const taskIntentId = progress.projection!.taskIntent!.taskIntentId;
      const plan = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'readers-report', ref: taskIntentId });
      expect(plan).toMatchObject({ kind: 'readers-report', ref: taskIntentId, state: { key: 'ready' }, start: { readiness: 'ready', needsModelConnection: false } });
      expect(plan.goal.sentence).toBe('从第 2 版定稿的评估起草审稿意见「给作者的修改意见」：总体评价、主要优点、主要问题、修改建议与结论');
      expect(plan.goal.chips.procedure).toBe('审稿评估方案 第 1 版 · 第 2 版定稿');
      expect(plan.scope.reference).toEqual(['评估记录第 2 版定稿（审稿评估方案 第 1 版）：各项得分与评语、主要优点与问题、风险与结论', READERS_REPORT_NO_EXEMPLAR]);
      expect(plan.steps.map((step) => step.label)).toEqual(['逐章读取，找出可以引用的段落', '按模板写出审稿意见']);
      expect(plan.notDo.editorial).toEqual(expect.arrayContaining(['不写营销要点：营销要点由交付物中的写作任务生成', '不交付、不发送：草稿在稿件编辑面上由你修改']));
      expect(book.store.inspectEvaluation(book.bookId, null).readersReport.task).toMatchObject({ taskIntentId, template: 'author', state: 'prepared' });

      const authorized = book.store.authorizeReadersReport(book.bookId, taskIntentId, plan.start.planEnvelopeDigest!);
      book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      const settled = book.store.inspectReadersReport(book.bookId)!;
      expect(settled.state).toBe('settled');
      const revision = settled.resultSetRevision!;
      expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
      expect(revision.assurance).toMatchObject({ state: 'qualified', statement: READERS_REPORT_ASSURANCE_STATEMENT });
      expect(revision.readersReport).toMatchObject({ template: 'author', exemplars: { count: 0, statement: READERS_REPORT_NO_EXEMPLAR }, synthesis: { state: 'closed', reason: null } });
      expect(revision.readersReport.sections).toEqual(SECTIONS);
      expect(revision.readersReport.passages.map((passage) => passage.kind).sort()).toEqual([
        ...Array(7).fill('strength'), ...Array(3).fill('problem'), ...Array(3).fill('suggestion'),
      ].sort());
      expect(runReportUsageReconciles(settled.taskOutcome!.report!, revision.usage)).toBe(true);

      // 评估 offers the drafted result; the record it drafted from is unchanged.
      const drafted = book.store.inspectEvaluation(book.bookId, null);
      expect(drafted.readersReport.task).toMatchObject({ taskIntentId, template: 'author', state: 'settled' });
      expect(drafted.readersReport.templates[0]).toMatchObject({ drafted: { revisionId: revision.revisionId, recordOrdinal: 2 }, draft: null });
      expect(drafted.readersReport.templates[1]).toMatchObject({ drafted: null, draft: null, prepare: { allowed: true, mode: 'readers-report-again' } });
      expect(drafted.record).toMatchObject({ recordId: finalized.recordId, entries: finalized.entries, state: 'finalized' });

      // 打开草稿: the draft document, its five sections under a title, 版本 1, and no card of 交付物.
      const opened = book.store.createReadersReportDraft(book.bookId, revision.revisionId).readersReport.templates[0]!;
      expect(opened.drafted).toBeNull();
      expect(opened.prepare).toEqual({ allowed: false, reason: '这本书已经有「给作者的修改意见」的草稿；请打开它继续修改。' });
      const draft = opened.draft!;
      expect(draft).toMatchObject({ typeId: 'readers-report-author', typeLabel: '审稿意见 · 给作者的修改意见', recordOrdinal: 2 });
      expect(draft.document.versions.map((version) => version.label)).toEqual(['版本 1']);
      const window = book.store.getManuscriptWindow(draft.document.documentId, draft.document.branchId, null);
      expect(window.blocks.map((block) => [block.kind, block.text]).filter(([kind]) => kind !== 'paragraph')).toEqual([
        ['title', '《审稿意见之书》审稿意见 · 给作者的修改意见'], ['heading', '总体评价'], ['heading', '主要优点'], ['heading', '主要问题'], ['heading', '修改建议'], ['heading', '结论'],
      ]);
      expect(window.blocks.filter((block) => block.kind === 'paragraph').map((block) => block.text)).toEqual([
        SECTIONS.overall,
        ...SECTIONS.strengths.map((line, index) => `${index + 1}. ${line}`),
        ...SECTIONS.problems.map((line, index) => `${index + 1}. ${line}`),
        ...SECTIONS.suggestions.map((line, index) => `${index + 1}. ${line}`),
        SECTIONS.conclusion,
      ]);
      const documents = book.store.inspectProductionDocuments(book.bookId);
      expect(documents.types.map((type) => [type.typeId, type.document])).toEqual([
        ['news-release', null], ['promotion-article', null], ['review-article', null], ['launch-materials', null], ['marketing-points', null],
      ]);
      // Once per template, and a draft is never delivered.
      expect(await refusal(() => book.store.createReadersReportDraft(book.bookId, revision.revisionId)))
        .toBe('READERS_REPORT_DRAFT_EXISTS:这本书已经有「给作者的修改意见」的草稿；请打开它继续修改。');
      expect(await refusal(() => book.store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: draft.document.documentId, version: { kind: 'saved', revisionId: draft.document.versions[0]!.revisionId },
        recipient: { kind: 'editorial', custom: null }, note: null,
      }))).toBe('READERS_REPORT_NOT_DELIVERABLE:审稿意见草稿不能在这里交付；它只在稿件编辑面上修改并导出。');
      expect((await refusal(() => book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy))).startsWith('READERS_REPORT_DRAFT_EXISTS:')).toBe(true);
      // Nor is a 审稿意见 type made 从来源材料 or marked 本书不做 in 交付物, and 图书交付包 names no condition of it (Issue #662 review).
      for (const typeId of ['readers-report-author', 'readers-report-editorial']) {
        expect(await refusal(() => book.store.createProductionDocument({ bookId: book.bookId, typeId, sourceVersionId: randomUUID() })))
          .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID:这个文档类型不在本社的类型配置中。');
        expect(await refusal(() => book.store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true })))
          .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID:这个文档类型不在本社的类型配置中。');
      }
      const bundle = book.store.inspectBookDeliveryPackage(book.bookId);
      expect(JSON.stringify(bundle)).not.toContain('readers-report');
      expect(JSON.stringify(bundle)).not.toContain(draft.document.documentId);

      // Edited on the manuscript surface and 保存为版本: 版本 2.
      const first = window.blocks[2]!;
      book.store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: draft.document.documentId, branchId: draft.document.branchId, baseRevisionId: window.revisionId,
        blockId: first.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: first.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（编辑）',
      });
      const saved = (await book.store.saveProductionDocumentVersion({ bookId: book.bookId, documentId: draft.document.documentId, branchId: draft.document.branchId })).document!;
      expect(saved.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);
      expect(book.store.inspectEvaluation(book.bookId, null).readersReport.templates[0]!.draft!.document.versions[0]!.label).toBe('版本 2');

      // Exported as DOCX, written fresh from the draft's own words: nothing of the manuscript's file is read for it.
      const target = { kind: 'document', documentId: draft.document.documentId, revisionId: saved.versions[0]!.revisionId } as const;
      const reviewed = await book.store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
      expect(reviewed.target).toMatchObject({ kind: 'document', document: { typeId: 'readers-report-author', typeLabel: '审稿意见 · 给作者的修改意见', versionLabel: '版本 2' } });
      expect(reviewed.restoration).toBe('regenerated');
      expect(reviewed.fidelity.filter((row) => row.count > 0).map((row) => row.key)).toEqual([]);
      const outbox = join(roots.inputRoot, 'exports');
      await mkdir(outbox, { recursive: true });
      const destination = join(outbox, reviewed.suggestedFileName);
      const preparation = await book.store.prepareManuscriptExport({
        bookId: book.bookId, revisionId: target.revisionId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination,
      }, true);
      expect((await book.store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true)).outcome).toBe('created');
      const written: ParsedDocxBlock[] = [];
      await parseDocx(destination, 'written.docx', (block) => written.push(block));
      const after = book.store.getManuscriptWindow(draft.document.documentId, draft.document.branchId, null);
      expect(written.map((block) => block.digest)).toEqual(after.blocks.map((block) => block.digest));
    });
  }, 300_000);

  it('writes no draft from a Run whose synthesis did not close, and offers none to open', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      // The fixture answers the author template alone: the editorial one reads nothing, and writes nothing.
      await draftReport(book, 'editorial');
      const settled = book.store.inspectReadersReport(book.bookId)!;
      expect(['failed', 'settled']).toContain(settled.state);
      expect(settled.resultSetRevision?.readersReport.sections ?? null).toBeNull();
      const workspace = book.store.inspectEvaluation(book.bookId, null).readersReport;
      expect(workspace.templates[1]).toMatchObject({ template: 'editorial', drafted: null, draft: null });
      if (settled.resultSetRevision !== null) {
        expect(await refusal(() => book.store.createReadersReportDraft(book.bookId, settled.resultSetRevision!.revisionId)))
          .toBe('READERS_REPORT_NOT_DRAFTED:这一次起草没有写出审稿意见，不能打开草稿。');
      }
      expect(await refusal(() => book.store.createReadersReportDraft(book.bookId, randomUUID())))
        .toBe('READERS_REPORT_NOT_FOUND:这本书没有这一次起草的审稿意见。');
    });
  }, 300_000);

  it('offers no 审稿意见 under a live scope, and prepares or starts none there', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const free = book.store.baselineAnalysisLedger.launch;
      book.store.baselineAnalysisLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go',
          model: 'deepseek-v4-flash',
          endpoint: 'https://example.invalid/v1',
          credentialSlot: 'opencode-go',
          credentialReference: randomUUID(),
          runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 },
        },
      });
      try {
        expect(book.store.inspectEvaluation(book.bookId, null).readersReport.templates.map((entry) => entry.prepare))
          .toEqual([{ allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE }, { allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE }]);
        expect(await refusal(() => book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy)))
          .toBe(`READERS_REPORT_UNAVAILABLE:${READERS_REPORT_LIVE_UNAVAILABLE}`);
        expect(await refusal(() => book.store.authorizeReadersReport(book.bookId, randomUUID(), 'a'.repeat(64))))
          .toBe(`READERS_REPORT_UNAVAILABLE:${READERS_REPORT_LIVE_UNAVAILABLE}`);
      } finally {
        book.store.baselineAnalysisLedger.bindLaunch(free);
      }
      expect(book.store.inspectEvaluation(book.bookId, null).readersReport.templates[0]!.prepare).toEqual({ allowed: true, mode: 'readers-report-first' });
    });
  }, 300_000);

  it('rebuilds a revision-59 store\'s kind-coupled relations for the reader\'s report kind, every row kept byte for byte', async () => {
    await withBook(async (book) => {
      // A 初评 Task, so the rebuilt relations carry rows of the evaluation kind.
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const rows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const plant = new DatabaseSync(path);
    let before: string;
    try {
      // Revision 59 exactly: the three relations as revision 59 left them, and no relation of revision 62.
      plant.exec(`DROP TABLE readers_report_drafts; DROP TABLE readers_report_tasks; PRAGMA user_version = ${INITIAL_EVALUATION_SCHEMA_VERSION};`);
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_59_SQL);
      before = rows(plant);
      expect(() => plant.exec(`INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256)
        VALUES ('${randomUUID()}', (SELECT book_id FROM books LIMIT 1), '${READERS_REPORT_KIND}', 'x', '{}', '${'a'.repeat(64)}')`)).toThrowError(/CHECK constraint failed/u);
    } finally {
      plant.close();
    }
    const migrated = await openStore();
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(READERS_REPORT_SCHEMA_VERSION);
      expect(rows(after)).toBe(before!);
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(Object.keys(READERS_REPORT_TRIGGER_SQL).every((name) => after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) !== undefined)).toBe(true);
    } finally {
      after.close();
    }
  }, 300_000);

  it('refuses a 审稿意见 Task record rewritten whole', async () => {
    let bookId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      let progress = book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy);
      while (!progress.done) progress = book.store.advanceReadersReportPreparationWork(progress.workId!);
    });
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      // The template's word changed in the frozen input, its digest with it: the contract it names is no longer this one.
      const row = database.prepare('SELECT task_intent_id, canonical_json FROM readers_report_tasks').get() as { task_intent_id: string; canonical_json: string };
      const json = row.canonical_json.replace('"conclusion":"修改后再议"', '"conclusion":"推荐出版"');
      expect(json).not.toBe(row.canonical_json);
      const { createHash } = await import('node:crypto');
      database.exec('DROP TRIGGER readers_report_tasks_no_update');
      database.prepare('UPDATE readers_report_tasks SET canonical_json = ?, sha256 = ? WHERE task_intent_id = ?')
        .run(json, createHash('sha256').update(json).digest('hex'), row.task_intent_id);
      database.exec(READERS_REPORT_TRIGGER_SQL.readers_report_tasks_no_update!);
    } finally {
      database.close();
    }
    const reopened = await openStore();
    try {
      expect(await refusal(() => reopened.inspectReadersReport(bookId))).toBe('READERS_REPORT_RECORD_INVALID:审稿意见记录已损坏。');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
