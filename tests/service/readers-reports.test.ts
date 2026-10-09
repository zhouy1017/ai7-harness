import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { READERS_REPORT_NEEDS_FINALIZED, READERS_REPORT_SCHEMA_SQL, READERS_REPORT_TRIGGER_SQL } from '../../src/service/readers-reports.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL } from '../../src/service/captured-procedures.js';
import { EVALUATION_REWRITE_SCHEMA_SQL } from '../../src/service/evaluation-rewrites.js';
import { WRITING_TASK_SCHEMA_SQL } from '../../src/service/writing-tasks.js';
import { DIALOGUE_SCHEMA_SQL } from '../../src/service/dialogue/dialogue-ledger.js';
import { SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL } from '../../src/service/series-exclusions.js';
import type { ReadersReportContractInput } from '../../src/service/evaluation/readers-report-contract.js';
import { EditorialStore, REVIEW_CATEGORY_CACHE_CAPACITY, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_29_SQL,
  ANALYSIS_LEDGER_REVISION_30_SQL,
  ANALYSIS_LEDGER_REVISION_31_SQL,
  ANALYSIS_LEDGER_REVISION_33_SQL,
  ANALYSIS_LEDGER_REVISION_59_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  ANALYSIS_LEDGER_TRIGGER_SQL,
  INITIAL_EVALUATION_SCHEMA_VERSION,
  MATERIAL_INDEX_SCHEMA_VERSION,
  DIALOGUE_SCHEMA_VERSION,
  SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION,
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
  readonly manuscriptId: string;
  readonly branchId: string;
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
    await body({ store, owner, bookId: imported.bookId, manuscriptId: imported.manuscriptId, branchId: imported.branchId });
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
const ALL = { includeAnnotations: true, includeSuggestions: true } as const;

/** The three revisions that carry the analysis ledger exactly as revision 59 left it, each with the relations it held. */
const REVISIONS_BEFORE_62 = [INITIAL_EVALUATION_SCHEMA_VERSION, DIALOGUE_SCHEMA_VERSION, SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION] as const;

/**
 * Take a store the current code wrote back to exactly one of revisions 59 to 61 (Issue #672): every relation a later revision
 * added dropped — revision 63's Captured Procedures and revision 62's 审稿意见 records always, revision 61's Series Retrieval
 * Exclusions below 61, revision 60's dialogue ledger below 60 — the three kind-coupled relations as revision 59 left them, and
 * the version stamped. Each relation is dropped before the one it refers to.
 */
function plantRevisionBefore62(plant: DatabaseSync, version: (typeof REVISIONS_BEFORE_62)[number]): void {
  const later = [
    ...Object.keys(WRITING_TASK_SCHEMA_SQL).reverse(),
    ...Object.keys(EVALUATION_REWRITE_SCHEMA_SQL).reverse(),
    ...Object.keys(CAPTURED_PROCEDURE_SCHEMA_SQL).reverse(),
    ...Object.keys(READERS_REPORT_SCHEMA_SQL).reverse(),
    ...(version < SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ? Object.keys(SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL).reverse() : []),
    ...(version < DIALOGUE_SCHEMA_VERSION ? Object.keys(DIALOGUE_SCHEMA_SQL).reverse() : []),
  ];
  plant.exec(`${later.map((table) => `DROP TABLE ${table};`).join(' ')} PRAGMA user_version = ${version};`);
  downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_59_SQL);
}

/** A reader's report contract of the shape a 定稿 version gives, its words told apart by `version`. */
function contractInput(version: number): ReadersReportContractInput {
  return {
    template: 'author',
    record: {
      profile: { title: '审稿评估方案', version: '1' },
      items: [{ label: '文学品质与作者声音', fullMarks: 20, score: 16, notRated: null, comment: `第 ${version} 次的评语。`, ai7: null }],
      total: { score: 16, fullMarks: 20 },
      risks: [],
      readiness: [],
      strengths: [],
      weaknesses: [],
      verdict: null,
      conclusion: '修改后再议',
    },
    exemplars: [],
  };
}

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
      // Nor is a 审稿意见 type made 从来源材料 or marked 本书不做 in 交付物, and 图书交付包 names no condition of it (Issue #662 review):
      // since Issue #429 the package names the draft as a member — while the Book has no 发稿版本, at its latest version.
      for (const typeId of ['readers-report-author', 'readers-report-editorial']) {
        expect(await refusal(() => book.store.createProductionDocument({ bookId: book.bookId, typeId, sourceVersionId: randomUUID() })))
          .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID:这个文档类型不在本社的类型配置中。');
        expect(await refusal(() => book.store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true })))
          .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID:这个文档类型不在本社的类型配置中。');
      }
      const bundle = book.store.inspectBookDeliveryPackage(book.bookId);
      expect(bundle.conditions.map((condition) => condition.key)).toEqual(['publication', 'document', 'document', 'document', 'document', 'document', 'work-records']);
      expect(bundle.content.included.filter((item) => item.kind === 'readers-report'))
        .toEqual([{ kind: 'readers-report', label: '审稿意见 · 给作者的修改意见 · 版本 1', detail: '发稿版本设定后才起草，按准备时的最新一版' }]);

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

  it('joins the 图书交付包 at 设为发稿版本时的最新一版 beside the 定稿 评估记录, exports both with receipts, and is admitted into 范例 under 仅本社 (Issue #429)', async () => {
    await withBook(async (book) => {
      const { bookId } = book;
      await runInitialEvaluationToEnd(book.store, book.owner, bookId, launchPolicy);
      const finalized = finalizeAsJ11(book.store, bookId);
      await draftReport(book, 'author');
      const settled = book.store.inspectReadersReport(bookId)!;
      const draft = book.store.createReadersReportDraft(bookId, settled.resultSetRevision!.revisionId).readersReport.templates[0]!.draft!.document;
      const save = async (text: string) => {
        const window = book.store.getManuscriptWindow(draft.documentId, draft.branchId, null);
        const first = window.blocks[2]!;
        book.store.flushJournalEdit({
          clientEditId: randomUUID(), manuscriptId: draft.documentId, branchId: draft.branchId, baseRevisionId: window.revisionId,
          blockId: first.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: first.digest,
          expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: text,
        });
        return (await book.store.saveProductionDocumentVersion({ bookId, documentId: draft.documentId, branchId: draft.branchId })).document!.versions[0]!;
      };
      // 版本 2 saved before the designation, 版本 3 after it: the package and 范例 pin 版本 2, 设为发稿版本时的最新一版.
      const version2 = await save('（发稿前）');
      const milestone = await book.store.saveMilestone(book.manuscriptId, book.branchId, '三审稿', 'stage-archive', null, '');
      book.store.designatePublicationVersion({ bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const version3 = await save('（发稿后）');
      expect([version2.label, version3.label]).toEqual(['版本 2', '版本 3']);
      for (const typeId of ['news-release', 'promotion-article', 'review-article', 'launch-materials', 'marketing-points']) {
        book.store.decideProductionDocumentType({ bookId, typeId, notForThisBook: true });
      }
      const bundle = book.store.inspectBookDeliveryPackage(bookId);
      expect([bundle.ready, bundle.unmet]).toEqual([true, []]);
      expect(bundle.content.included.filter((item) => item.kind !== 'publication')).toEqual([
        { kind: 'evaluation-record', label: '评估记录 · 第 2 版定稿', detail: `评估方案「${finalized.profile.title}」 第 ${finalized.profile.version} 版 · 定稿于 ${finalized.finalized!.at}` },
        { kind: 'readers-report', label: '审稿意见 · 给作者的修改意见 · 版本 2', detail: '设为发稿版本时的最新一版' },
      ]);
      expect(bundle.content.excluded.map((item) => item.kind)).not.toContain('evaluation-record');
      expect(bundle.content.excluded.map((item) => item.kind)).not.toContain('readers-report');
      expect(bundle.content.limitations).toEqual(['审稿意见 · 给作者的修改意见：设为发稿版本后又有修改，本包按设为发稿版本时的最新一版（版本 2）。']);
      const prepared = book.store.prepareBookDeliveryPackage({ bookId, purpose: '交出版社存档', expectedContentDigest: bundle.content.digest });
      const version = prepared.package.versions[0]!;
      expect(version.summary).toBe(`${bundle.content.included[0]!.label} · 生产文档 0 份 · 本书不做 5 类 · 审阅报告 0 份 · 评估记录 1 份 · 审稿意见 1 份`);
      // A later save moves nothing: the member is pinned, and the package reads as it did.
      await save('（再改）');
      expect(book.store.inspectBookDeliveryPackage(bookId)).toMatchObject({ changedSinceLatest: false, content: { digest: bundle.content.digest } });

      // The export writes the 定稿 评估记录 from its own finalized words and the 审稿意见 at 版本 2, each with its receipt.
      const review = await book.store.reviewBookDeliveryPackageExport({ bookId, packageVersionId: version.packageVersionId, options: ALL }, true);
      expect(review.files.map((file) => [file.key, file.label, file.format, file.fileName])).toEqual([
        ['publication', `稿件 · ${bundle.content.included[0]!.label}`, 'docx', '001 审稿意见之书 · 三审稿.docx'],
        ['evaluation-record', '评估记录 · 第 2 版定稿', 'markdown', '002 审稿意见之书 · 评估记录 · 第 2 版定稿.md'],
        ['readers-report:author', '审稿意见 · 给作者的修改意见 · 版本 2', 'docx', '003 审稿意见之书 · 审稿意见 · 给作者的修改意见 · 版本 2.docx'],
        ['manifest', '交付包清单', 'markdown', '交付包清单.md'],
      ]);
      expect(review.files[1]).toMatchObject({ fidelity: [], degraded: false, restorationLine: '评估记录按这一版交付包记下的定稿版本写出。' });
      const folder = join(roots.inputRoot, '交付包导出');
      await mkdir(folder, { recursive: true });
      const chosen = await book.store.prepareBookDeliveryPackageExport({
        bookId, packageVersionId: version.packageVersionId, options: ALL, memberKeys: review.files.map((file) => file.key), reviewDigest: review.reviewDigest, folder,
      }, true);
      const exported = await book.store.approveBookDeliveryPackageExport({ bookId, exportId: chosen.exportId }, true);
      expect([exported.export.state, exported.export.summary]).toEqual(['exported', '已导出到所选位置 · 4 个文件']);
      expect(exported.export.files.map((file) => [file.key, file.outcome])).toEqual([
        ['publication', 'created'], ['evaluation-record', 'created'], ['readers-report:author', 'created'], ['manifest', 'created'],
      ]);
      const record = await readFile(join(folder, review.files[1]!.fileName), 'utf8');
      expect(record.split('\n').slice(0, 8)).toEqual([
        '# 审稿意见之书 · 评估记录 · 第 2 版定稿', '',
        `- 评估方案：${finalized.profile.title} 第 ${finalized.profile.version} 版（${finalized.profile.issuer}）`,
        '- 评估的稿件版本：r1', `- 定稿于：${finalized.finalized!.at}`, expect.stringMatching(/^- 定稿记录摘要：[0-9a-f]{64}$/u), '', '## 评分',
      ]);
      expect(record).toContain('- 总分：71 / 100\n');
      expect(record).toContain('## 结论\n\n修改后再议');
      expect(record).not.toMatch(/%|权重|百分/u);
      const written: ParsedDocxBlock[] = [];
      await parseDocx(join(folder, review.files[2]!.fileName), 'written.docx', (block) => written.push(block));
      const words = written.map((block) => block.text).join('\n');
      expect(words).toContain('（发稿前）');
      expect(words).not.toContain('（发稿后）');
      const manifest = await readFile(join(folder, '交付包清单.md'), 'utf8');
      expect(manifest).toContain(`- 评估记录 · 第 2 版定稿（定稿于 ${finalized.finalized!.at}）`);
      expect(manifest).toContain('- 审稿意见 · 给作者的修改意见 · 版本 2（设为发稿版本时的最新一版）');
      expect(manifest).not.toContain('本书没有');

      // 范例 offers the same version under 仅本社, and only the editor admits it — at exactly that version, once.
      const offered = book.store.inspectExemplars(null).books[0]!;
      expect(offered.bookId).toBe(bookId);
      expect(offered.readersReports).toEqual([{
        template: 'author', typeId: 'readers-report-author', typeLabel: '审稿意见 · 给作者的修改意见', documentId: draft.documentId, version: 2,
        revisionId: version2.revisionId, revisionDigest: version2.revisionDigest, savedAt: version2.createdAt, pin: 'designation', eligibility: 'house-only',
        admission: { state: 'offered', admittedAt: null, decisions: 0 },
      }]);
      const admit = (template: 'author' | 'editorial', revisionDigest: string, expectedDecisions: number) =>
        book.store.admitReadersReportExemplar({ bookId, template, revisionDigest, expectedDecisions });
      expect(await refusal(() => admit('editorial', version2.revisionDigest, 0))).toBe('EXEMPLAR_READERS_REPORT_NOT_FOUND:这本书没有这一模板的审稿意见。');
      expect(await refusal(() => admit('author', version3.revisionDigest, 0))).toBe('EXEMPLAR_READERS_REPORT_CHANGED:要归入的审稿意见已不是现在的这一版；请看过现在的再定。');
      expect(await refusal(() => admit('author', version2.revisionDigest, 1))).toBe('LEARNING_ELIGIBILITY_MOVED:这条材料的学习准入刚被改过；请看过现在的决定再定。');
      // Its own draft takes no 范例: before the admission the plan says so, and after it a Book's own 审稿意见 never seeds itself.
      expect(book.store.inspectEvaluation(bookId, null).readersReport.exemplars).toEqual({ count: 0, statement: READERS_REPORT_NO_EXEMPLAR });
      const admitted = admit('author', version2.revisionDigest, 0);
      expect(admitted.readersReports[0]!.admission).toMatchObject({ state: 'admitted', decisions: 1 });
      expect(admitted.readersReports[0]!.admission.admittedAt).not.toBeNull();
      expect(book.store.inspectExemplars(null).books[0]!.readersReports).toEqual(admitted.readersReports);
      expect(await refusal(() => admit('author', version2.revisionDigest, 1))).toBe('LEARNING_ELIGIBILITY_UNCHANGED:学习准入没有变化。');
      expect(book.store.inspectEvaluation(bookId, null).readersReport.exemplars).toEqual({ count: 0, statement: READERS_REPORT_NO_EXEMPLAR });
      // Another Book's 审稿意见 would now draft with it as its one 范例.
      const other = await importSample1Book(book.store, roots.codeRoot, '另一本书');
      expect(book.store.inspectEvaluation(other.bookId, null).readersReport.exemplars)
        .toEqual({ count: 1, statement: '参考本社 1 份审稿意见范例：《审稿意见之书 · 审稿意见 · 给作者的修改意见》' });
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

  it.each(REVISIONS_BEFORE_62)('rebuilds a revision-%i store\'s kind-coupled relations for the reader\'s report kind, every row kept byte for byte', async (version) => {
    await withBook(async (book) => {
      // A 初评 Task, so the rebuilt relations carry rows of the evaluation kind.
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const rows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const plant = new DatabaseSync(path);
    let before: string;
    try {
      // That revision exactly: the three relations as revision 59 left them, and no relation a later revision added.
      plantRevisionBefore62(plant, version);
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MATERIAL_INDEX_SCHEMA_VERSION);
      expect(rows(after)).toBe(before!);
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(Object.keys(READERS_REPORT_TRIGGER_SQL).every((name) => after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) !== undefined)).toBe(true);
    } finally {
      after.close();
    }
  }, 300_000);

  // A store stamped 59, 60 or 61 holds the four relations revisions 30 to 35 widened in their widened text: revision 59 came long
  // after. One that holds an older text was not written by AI7, so it is refused before any widening, not quietly widened
  // (Issue #672) — whichever of the four it is. Revision 66's widening (Issue #95, S39) comes only after that exact check.
  it.each([
    [INITIAL_EVALUATION_SCHEMA_VERSION, 'analysis_run_authorizations', ANALYSIS_LEDGER_REVISION_30_SQL.analysis_run_authorizations, '分析任务账本表（修订版 59）'],
    [INITIAL_EVALUATION_SCHEMA_VERSION, 'analysis_plan_revisions', ANALYSIS_LEDGER_REVISION_33_SQL.analysis_plan_revisions, '分析任务账本表（修订版 59）'],
    [DIALOGUE_SCHEMA_VERSION, 'analysis_run_states', ANALYSIS_LEDGER_REVISION_29_SQL.analysis_run_states, '分析任务账本表（修订版 59）'],
    [SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION, 'analysis_task_outcomes', ANALYSIS_LEDGER_REVISION_31_SQL.analysis_task_outcomes, '分析任务账本表（修订版 59）'],
  ] as const)('refuses a store stamped %i whose %s holds an older text, rather than widening it', async (version, table, olderSql, label) => {
    const first = await openStore();
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plantRevisionBefore62(plant, version);
      // The damage: the relation, empty, back in a text an earlier revision gave it, its two ledger triggers re-armed.
      plant.exec(`PRAGMA foreign_keys = OFF; DROP TABLE ${table}; ${olderSql}; ${ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!};
        ${ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!}; PRAGMA foreign_keys = ON;`);
    } finally {
      plant.close();
    }
    await expect(openStore()).rejects.toThrowError(`${label} ${table} 结构不兼容。`);
    const after = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      // Nothing moved: the version stands and the relation keeps the text it was found in.
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(version);
      expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(olderSql);
    } finally {
      after.close();
    }
  }, 300_000);

  it('keeps a bounded number of reader\'s report ledgers, and never the one a preparation is still running on (Issue #672)', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      // An unsaved edit makes the Task's input checkpoint a preparation that takes more than one step.
      const window = book.store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks[0]!;
      book.store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（编辑）',
      });
      let progress = book.store.createReadersReportPreparationWork(book.bookId, 'author', launchPolicy);
      expect(progress.done).toBe(false);
      // Every distinct contract — every 定稿 version's words under a template — asks for a ledger of its own. Ledgers are
      // compared by identity alone: a failed `toBe` would print one, and printing a ledger reads through it.
      const idle = book.store.readersReportLedger(contractInput(0));
      expect(book.store.readersReportLedger(contractInput(0)) === idle).toBe(true);
      for (let version = 1; version <= REVIEW_CATEGORY_CACHE_CAPACITY * 2; version += 1) book.store.readersReportLedger(contractInput(version));
      // The idle contract's ledger was let go and is made afresh; the preparing one was kept, and its preparation finishes.
      expect(book.store.readersReportLedger(contractInput(0)) === idle).toBe(false);
      // A preparation no kept ledger holds is not found, even while another is in flight.
      expect(await refusal(() => book.store.advanceReadersReportPreparationWork(randomUUID())))
        .toBe('ANALYSIS_PREPARATION_NOT_FOUND:审稿意见的计划准备已不存在。');
      expect(book.store.cancelReadersReportPreparationWork(randomUUID())).toBe(false);
      const workId = progress.workId!;
      while (!progress.done) progress = book.store.advanceReadersReportPreparationWork(progress.workId!);
      expect(progress.projection).toMatchObject({ kind: READERS_REPORT_KIND, state: 'prepared' });
      // Once finished, the preparation is gone.
      expect(await refusal(() => book.store.advanceReadersReportPreparationWork(workId)))
        .toBe('ANALYSIS_PREPARATION_NOT_FOUND:审稿意见的计划准备已不存在。');
    });
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
