import { execPre74Fixture } from '../support/pre74-schema.js';
import { createHash, randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT } from '../../src/service/book-delivery-package-exports.js';
import { BookDeliveryPackageArchiveWriter } from '../../src/service/book-delivery-package-archives.js';
import { BookDeliveryPackages, BOOK_DELIVERY_PACKAGE_WORDS } from '../../src/service/book-delivery-packages.js';
import { CooperativeJobOwner } from '../../src/service/cooperative-jobs.js';
import { ManuscriptExportStore } from '../../src/service/manuscript-export.js';
import { compileWordTrackedDocx, parseDocx } from '../../src/service/docx.js';
import * as exportFiles from '../../src/service/manuscript-export.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { PUBLICATION_FORBIDDEN_WORDS, type BookDeliveryPackageExportProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

// Service-integration suite (L2) for the export of a 图书交付包 version (Issue #416, plan slice S67b; V2-UX-BUNDLE-004,
// DPKG-011, DPKG-013, DPKG-014, EXP-010 to EXP-022) over the real `EditorialStore` on a temporary Agent Data Root. The
// manuscript and the draft a document starts from are composed from exact `sample1`'s paragraphs; files written are
// compared by digest and by the package's own words, and no manuscript text is printed.

const SOURCE = ADMITTED_BASELINE_DOCX;
/** 含批注 and 含修改建议 as a package export offers them: both on until the editor turns one off. */
const ALL = { includeAnnotations: true, includeSuggestions: true } as const;
const NONE = { includeAnnotations: false, includeSuggestions: false } as const;
let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await roots.dispose();
});

const span = (block: number): SourceSpan => ({ block });

/** A DOCX of `sample1`'s blocks; `formatted` puts a formatting revision on the first, which stays with the file. */
async function compose(name: string, blocks: ReadonlyArray<number>, formatted = false): Promise<string> {
  const path = join(roots.inputRoot, `${name}.docx`);
  await composeRevisedDocx(path, {
    source: SOURCE,
    title: name,
    paragraphs: blocks.map((block, index) => ({
      runs: [{ text: span(block) }],
      ...(formatted && index === 0 ? { formattingRevision: { author: '审校甲', date: '2026-09-01T09:00:00Z' } } : {}),
    })),
  });
  return path;
}

async function importBook(store: EditorialStore, path: string): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

async function importSource(store: EditorialStore, bookId: string, path: string): Promise<string> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.sourceVersionId;
}

async function code(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/**
 * A Book whose package is ready and prepared as v1: 发稿版本 set, the 新闻稿 delivered, the other four types 本书不做.
 * `formatted` gives its manuscript a formatting revision the export cannot write, so the publication's file is degraded.
 */
async function preparedPackage(
  store: EditorialStore,
  formatted = false,
): Promise<{ bookId: string; manuscriptId: string; branchId: string; title: string; packageVersionId: string }> {
  const book = await importBook(store, await compose('交付包导出组稿', [1, 2, 3, 4], formatted));
  return preparePackageOf(store, book);
}

async function preparePackageOf(store: EditorialStore, book: { bookId: string; manuscriptId: string; branchId: string }) {
  const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
  store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
  const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
  const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
  await store.recordProductionDocumentDelivery({
    bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
    recipient: { kind: 'publicity', custom: null }, note: '首发稿',
  });
  for (const typeId of ['promotion-article', 'review-article', 'launch-materials', 'marketing-points']) {
    store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true });
  }
  const bundle = store.inspectBookDeliveryPackage(book.bookId);
  const prepared = store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交出版社存档', expectedContentDigest: bundle.content.digest });
  const title = store.listBooks(null).items.find((item) => item.bookId === book.bookId)!.title;
  return { ...book, title, packageVersionId: prepared.package.versions[0]!.packageVersionId };
}

/** A 批注 on the manuscript's longest paragraph, as the editor makes one: the milestone's file then carries it. */
function annotate(store: EditorialStore, book: { manuscriptId: string; branchId: string }): void {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const graphemesOf = (text: string): string[] => Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  const block = window.blocks.filter((candidate) => candidate.kind === 'paragraph')
    .sort((a, b) => graphemesOf(b.text).length - graphemesOf(a.text).length)[0]!;
  store.createEditorialMark({
    manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
    fromGrapheme: 1, toGrapheme: 3, selectedText: graphemesOf(block.text).slice(1, 3).join(''), kind: 'annotation', highlightColor: null,
    body: '请核对这一处。', proposedText: null, rationale: null,
  });
}

const outcomesOf = (exported: BookDeliveryPackageExportProjection) => exported.files.map((file) => [file.label, file.outcome, file.outcomeLabel, file.revealAvailable]);

async function count(table: string): Promise<number> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return (database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count;
  } finally {
    database.close();
  }
}

// This unique refusal has no public writer for an invalid finalized-entry pin.
function plantInvalidEvaluationPin(bookId: string): string {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  let plantedId: string;
  try {
    const row = database.prepare('SELECT * FROM book_delivery_package_versions WHERE book_id = ? AND version = 2').get(bookId) as Record<string, string | number>;
    const record = JSON.parse(String(row.canonical_json)) as { content: Record<string, unknown>; packageVersionId: string } & { version: number; priorVersionId: string | null; contentDigest: string; schema: string; bookId: string; actor: string };
    const content = { ...record.content, evaluation: { ...(record.content.evaluation as Record<string, unknown>), entrySha256: 'f'.repeat(64) } };
    const contentDigest = canonicalRecord(content).digest;
    plantedId = randomUUID();
    const planted = canonicalRecord({
      ...record, packageVersionId: plantedId, version: 3, priorVersionId: record.packageVersionId, content, contentDigest, preparedAt: new Date().toISOString(),
    });
    database.prepare(
      `INSERT INTO book_delivery_package_versions(package_version_id, package_id, book_id, version, prior_version_id, purpose, publication_version_id, content_sha256, actor, prepared_at, canonical_json, sha256)
       VALUES (?, ?, ?, 3, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(plantedId, String(row.package_id), bookId, record.packageVersionId, String(row.purpose), String(row.publication_version_id), contentDigest,
      (JSON.parse(planted.json) as { preparedAt: string }).preparedAt, planted.json, planted.digest);
  } finally {
    database.close();
  }
  return plantedId!;
}

// No owning migration suite starts before revision 56; retain this revision-40 path.
function downgradeToRevision40(): void {
  const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
  const planted = new DatabaseSync(path);
  try {
    planted.exec('PRAGMA foreign_keys = OFF');
    execPre74Fixture(planted, `BEGIN IMMEDIATE;
      DROP TABLE analysis_outcome_resolutions; DROP TABLE material_index_segments; DROP TABLE material_index_builds; DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; DROP TABLE developer_capability_proposal_exports; DROP TABLE developer_capability_proposals; DROP TABLE review_run_procedure_pins; DROP TABLE captured_procedure_states; DROP TABLE captured_procedure_versions; DROP TABLE captured_procedures; DROP TABLE readers_report_drafts; DROP TABLE readers_report_tasks; DROP TABLE series_retrieval_exclusions; DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings; DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; DROP TABLE database_merge_books;
      DROP TABLE database_merges;
      DROP TABLE database_replacements;
      DROP TABLE scheduled_backup_removals;
      DROP TABLE scheduled_backups;
      DROP TABLE backup_preferences;
      DROP TABLE database_export_receipts;
      DROP TABLE database_export_approvals;
      DROP TABLE database_export_preparations;
      DROP TABLE store_versions;
      DROP TABLE series_knowledge_conflicts; DROP TABLE series_knowledge_promotions;
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
      PRAGMA user_version = ${PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION};
      COMMIT;`);
    downgradeKindCoupledRelations(planted, ANALYSIS_LEDGER_REVISION_58_SQL);
    planted.exec('PRAGMA foreign_keys = ON');
  } finally {
    planted.close();
  }
}

function prepareEvaluatedPackage(store: EditorialStore, bookId: string, purpose: string): string {
  const started = store.startEvaluation(bookId).record!;
  store.saveEvaluation({ bookId, recordId: started.recordId, expectedEntries: 1, finalize: true,
    content: { ...started.content, conclusion: 'revise',
      items: started.content.items.map((item, index) => ({ ...item, score: [16, 15, 17, 14, 12][index]! })),
      risks: started.content.risks.map((risk) => ({ ...risk, level: 'low' as const, statement: '已核对。', reviewed: false })) } });
  const bundle = store.inspectBookDeliveryPackage(bookId);
  return store.prepareBookDeliveryPackage({ bookId, purpose, expectedContentDigest: bundle.content.digest })
    .package.versions[0]!.packageVersionId;
}

describe('图书交付包 · 导出 (S67b)', () => {
  it.each(['suggestions', 'accepted-baseline'] as const)('replays the real Word %s source and writer for a frozen package member after restart', async (mode) => {
    const path = join(roots.inputRoot, `package-word-${mode}.docx`);
    await composeRevisedDocx(path, { source: SOURCE, title: 'Word 交付包', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    const compiled = await compileWordTrackedDocx(path);
    if (compiled.kind !== 'ready') throw new Error('expected supported Word package source');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const importReview = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode, learnFromEdits: false, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
      if (importReview.reviewDigest === null) throw new Error('expected Word import preparation');
      const commitId = randomUUID();
      const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: importReview.draftVersion,
        reviewDigest: importReview.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const { bookId, packageVersionId } = await preparePackageOf(store, book);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: NONE }, true);
      const publication = review.files.find((file) => file.key === 'publication')!;
      const folder = join(roots.inputRoot, `package-word-output-${mode}`); await mkdir(folder);
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: NONE,
        memberKeys: ['publication'], reviewDigest: review.reviewDigest, folder }, true);
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export.state).toBe('exported');
      const written = await parseDocx(join(folder, publication.fileName), publication.fileName, () => undefined);
      expect(written.contentDigest).toBe(compiled.readings[mode === 'suggestions' ? 'rejected' : 'accepted'].contentDigest);
      expect((await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true)).export).toEqual(result.export);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('keeps an ambiguous publication unconfirmed and never retries it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '待确认.zip');
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: review.reviewDigest, destination }, true);
      const publish = exportFiles.writeAtomically;
      const write = vi.spyOn(exportFiles, 'writeAtomically').mockImplementationOnce(async (...args) => {
        await publish(...args);
        return { outcome: 'ambiguous', code: 'EXPORT_VERIFY_UNCERTAIN' };
      });
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export).toMatchObject({ state: 'incomplete', summary: '结果待确认 · 压缩包', archiveReceipt: { outcome: 'ambiguous', sha256: null } });
      expect(result.export.files.every((file) => file.outcome === 'ambiguous' && !file.revealAvailable)).toBe(true);
      expect(existsSync(destination)).toBe(true);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(write).toHaveBeenCalledTimes(1);
      expect(result.package.versions[0]!.exports[0]!.revealPreparationId).toBeNull();
    } finally { store.close(); }
  }, 180_000);

  it('records a staging failure even before the first member, without leaving a target', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '无法暂存.zip');
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: review.reviewDigest, destination }, true);
      vi.spyOn(BookDeliveryPackageArchiveWriter, 'create').mockRejectedValueOnce(new Error('synthetic staging failure'));
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export).toMatchObject({ state: 'incomplete', stopped: { fileName: review.files[0]!.fileName, reason: '失败' },
        archiveReceipt: { outcome: 'failed' } });
      expect(result.export.files.map((file) => file.outcome)).toEqual(['not-written', 'not-written']);
      expect(result.package.versions[0]!.exports).toHaveLength(1);
      expect(existsSync(destination)).toBe(false);
      expect(await count('export_approvals')).toBe(0);
    } finally { store.close(); }
  }, 180_000);

  it('exports all content across review pages, with bounded projections and one receipt per member', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      // Synthetic package-source expansion at the verified-record seam, using a real sample1-derived delivered document.
      // This tests a content set larger than the renderer's page without inventing report or manuscript payloads.
      const original = BookDeliveryPackages.prototype.record;
      vi.spyOn(BookDeliveryPackages.prototype, 'record').mockImplementation(function (this: BookDeliveryPackages, ...args) {
        const found = original.apply(this, args);
        if (found === null) return null;
        const document = found.record.content.documents.find((entry) => entry.disposition === 'included')!;
        return { ...found, record: { ...found.record, content: { ...found.record.content,
          documents: Array.from({ length: 45 }, (_, index) => ({ ...document, typeId: `synthetic-${index}` })) } } };
      });
      const first = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const second = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive', offset: 40 }, true);
      expect([first.files.length, first.nextOffset, second.files.length, second.nextOffset]).toEqual([40, 40, 6, null]);
      expect(first.reviewDigest).toBe(second.reviewDigest);
      expect([...first.files, ...second.files].some((file) => file.key === 'manifest')).toBe(false);
      const destination = join(roots.inputRoot, '跨页.zip');
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: first.reviewDigest, destination }, true);
      expect([prepared.files.length, prepared.filesTruncated]).toEqual([40, true]);
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export.archiveReceipt).toMatchObject({ memberCount: 46, membersTruncated: true });
      expect(result.export.archiveReceipt!.members).toHaveLength(40);
      const archive = unzipSync(await readFile(destination));
      expect(Object.keys(archive)).toHaveLength(48);
      expect(await count('export_receipts')).toBe(46);
      expect(new TextDecoder().decode(archive['checksums.txt']).trimEnd().split('\n')).toHaveLength(47);
    } finally { store.close(); }
  }, 240_000);

  it('accepts cancellation while streaming and records nothing: no approval, receipt, history line or target archive', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const jobs = new CooperativeJobOwner(store);
    let release!: () => void;
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '取消压缩.zip');
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: review.reviewDigest, destination }, true);
      let reached!: () => void;
      const atStream = new Promise<void>((resolve) => { reached = resolve; });
      const resume = new Promise<void>((resolve) => { release = resolve; });
      const add = BookDeliveryPackageArchiveWriter.prototype.add;
      vi.spyOn(BookDeliveryPackageArchiveWriter.prototype, 'add').mockImplementationOnce(async function (this: BookDeliveryPackageArchiveWriter, ...args) {
        reached(); await resume; return add.apply(this, args);
      });
      const job = jobs.startPackageExport({ bookId, exportId: prepared.exportId }, true);
      await atStream;
      expect(jobs.cancelPackageExport(job.jobId)).toBe(true);
      release();
      let terminal = jobs.poll(job.jobId);
      while (terminal.state === 'queued' || terminal.state === 'running') {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        terminal = jobs.poll(job.jobId);
      }
      expect(terminal.state).toBe('cancelled');
      expect(existsSync(destination)).toBe(false);
      expect((await readdir(roots.inputRoot)).some((name) => name.endsWith('.ai7-partial'))).toBe(false);
      // EXP-011 / EXP-020: the cancelled staging leaves the export as prepared, with no Effect Approval or Receipt.
      expect([await count('export_approvals'), await count('export_receipts')]).toEqual([0, 0]);
      expect(store.inspectBookDeliveryPackage(bookId).versions[0]!.exports).toHaveLength(0);
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export.archiveReceipt?.outcome).toBe('created');
      expect(result.export.files.every((file) => file.outcome === 'created')).toBe(true);
    } finally { release?.(); await jobs.dispose(); store.close(); }
  }, 180_000);

  it('refuses an approve or cancel of one route on an export of the other by name, writing nothing (#959)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const jobs = new CooperativeJobOwner(store);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const folder = join(roots.inputRoot, '路由文件夹');
      await mkdir(folder);
      const folderExport = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['manifest'],
        reviewDigest: review.reviewDigest, folder }, true);
      const archiveReview = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '路由.zip');
      const archiveExport = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: archiveReview.reviewDigest, destination }, true);
      const refusal = (exportId: string, route: 'folder' | 'archive'): Promise<unknown> =>
        store.approveBookDeliveryPackageExport({ bookId, exportId }, true, undefined, route).then(() => null, (error: unknown) => error);
      expect(await refusal(folderExport.exportId, 'archive')).toMatchObject({ code: 'BOOK_DELIVERY_PACKAGE_EXPORT_WRONG_ROUTE',
        message: '这次导出是「导出为文件夹」；请在「导出为文件夹」里继续。' });
      expect(await refusal(archiveExport.exportId, 'folder')).toMatchObject({ code: 'BOOK_DELIVERY_PACKAGE_EXPORT_WRONG_ROUTE',
        message: '这次导出是「导出为压缩包」；请在「导出为压缩包」里继续。' });
      expect([await count('export_approvals'), await count('export_receipts'), existsSync(destination)]).toEqual([0, 0, false]);
      expect(await readdir(folder)).toEqual([]);
      // The folder route's cancellation never reaches an archive job; the job runs on to its own receipt.
      const job = jobs.startPackageExport({ bookId, exportId: archiveExport.exportId }, true, 'archive');
      expect(() => jobs.cancelPackageExport(job.jobId, 'folder')).toThrow('这次导出是「导出为压缩包」；请在「导出为压缩包」里继续。');
      let terminal = jobs.poll(job.jobId);
      while (terminal.state === 'queued' || terminal.state === 'running') {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        terminal = jobs.poll(job.jobId);
      }
      expect(terminal.state).toBe('completed');
      expect(existsSync(destination)).toBe(true);
    } finally { await jobs.dispose(); store.close(); }
  }, 180_000);

  it('exports the frozen folder members into a readable ZIP with checksums and linked durable receipts', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId = '';
    let packageVersionId = '';
    let exportId = '';
    let history = '';
    try {
      ({ bookId, packageVersionId } = await preparedPackage(store));
      packageVersionId = prepareEvaluatedPackage(store, bookId, '压缩包测试');
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const input = { bookId, packageVersionId, options: ALL, reviewDigest: review.reviewDigest };
      const folder = join(roots.inputRoot, '对照文件夹');
      await mkdir(folder);
      const folderExport = await store.prepareBookDeliveryPackageExport({ ...input, memberKeys: review.files.map((file) => file.key), folder }, true);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: folderExport.exportId }, true);
      const destination = join(roots.inputRoot, '交付包.zip');
      const archiveReview = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ ...input, reviewDigest: archiveReview.reviewDigest, destination }, true);
      exportId = prepared.exportId;
      expect(existsSync(destination)).toBe(false);
      expect(prepared.kind).toBe('archive');
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId }, true);
      const bytes = await readFile(destination);
      const zip = unzipSync(bytes);
      const members = Object.keys(zip).filter((name) => name !== 'checksums.txt').sort();
      expect(members).toEqual((await readdir(folder)).sort());
      for (const name of members) expect(Buffer.compare(Buffer.from(zip[name]!), await readFile(join(folder, name)))).toBe(0);
      const checksumLines = members.map((name) => `${createHash('sha256').update(zip[name]!).digest('hex')}  ${name}\n`).join('');
      expect(new TextDecoder().decode(zip['checksums.txt'])).toBe(checksumLines);
      expect(exported.export).toMatchObject({ kind: 'archive', state: 'exported', archiveReceipt: {
        finalPath: destination, outcome: 'created', memberCount: members.length - 1, byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') } });
      expect(exported.export.archiveReceipt!.members.every((member) => member.receiptId !== null)).toBe(true);
      expect(exported.package.versions[0]!.exports.map((entry) => entry.kind ?? 'folder')).toEqual(['archive', 'folder']);
      expect((await store.approveBookDeliveryPackageExport({ bookId, exportId }, true)).export).toEqual(exported.export);
      for (const file of exported.export.files) {
        const receipt = store.inspectManuscriptExportReceipt({ bookId, preparationId: file.preparationId });
        expect(receipt.destination).toBe(destination);
        expect(exported.export.archiveReceipt!.members).toContainEqual(expect.objectContaining({
          receiptId: receipt.technical.receiptId, path: file.fileName, sha256: receipt.technical.fileSha256,
        }));
      }
      history = JSON.stringify(store.inspectBookDeliveryPackage(bookId).versions);
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { expect(JSON.stringify(reopened.inspectBookDeliveryPackage(bookId).versions)).toBe(history); reopened.markCleanShutdown(); }
    finally { reopened.close(); }
  }, 240_000);

  it('removes an unfinished archive and records the stopping member without publishing a target or blindly retrying', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '失败.zip');
      const prepared = await store.prepareBookDeliveryPackageArchiveExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: review.reviewDigest, destination }, true);
      const add = BookDeliveryPackageArchiveWriter.prototype.add;
      let calls = 0;
      vi.spyOn(BookDeliveryPackageArchiveWriter.prototype, 'add').mockImplementation(async function (this: BookDeliveryPackageArchiveWriter, ...args) {
        if (++calls === 2) throw new Error('synthetic write failure');
        return add.apply(this, args);
      });
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export.state).toBe('incomplete');
      expect(result.export.stopped).toEqual({ fileName: review.files[1]!.fileName, reason: '失败' });
      // Staging stopped before the commit boundary: no member was approved, and the archive receipt names the member.
      expect(result.export.files.map((file) => file.outcome)).toEqual(['not-written', 'not-written']);
      expect(result.export.archiveReceipt).toMatchObject({ outcome: 'failed', byteLength: null, sha256: null,
        stopped: { fileName: review.files[1]!.fileName, reason: '失败' } });
      expect(result.export.archiveReceipt!.members.every((member) => member.receiptId === null)).toBe(true);
      expect(existsSync(destination)).toBe(false);
      expect((await readdir(roots.inputRoot)).some((name) => name.endsWith('.ai7-partial'))).toBe(false);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(calls).toBe(2);
      expect([await count('export_approvals'), await count('export_receipts')]).toEqual([0, 0]);
      expect(result.package.versions[0]!.exports).toHaveLength(1);
    } finally { store.close(); }
  }, 180_000);

  it('binds native replacement exactly and cancels before recording an approval', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, route: 'archive' }, true);
      const destination = join(roots.inputRoot, '覆盖.zip');
      await writeFile(destination, 'synthetic existing archive');
      const input = { bookId, packageVersionId, options: ALL, reviewDigest: review.reviewDigest, destination };
      const first = await store.prepareBookDeliveryPackageArchiveExport(input, true);
      await writeFile(destination, 'synthetic changed target');
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true))).toBe('EXPORT_TARGET_CHANGED');
      expect(await count('export_approvals')).toBe(0);
      const second = await store.prepareBookDeliveryPackageArchiveExport(input, true);
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId, exportId: second.exportId }, true,
        () => { throw new StoreError('EXPORT_CANCELLED', '已取消导出。'); }))).toBe('EXPORT_CANCELLED');
      expect(await count('export_approvals')).toBe(0);
      expect(await readFile(destination, 'utf8')).toBe('synthetic changed target');
      const result = await store.approveBookDeliveryPackageExport({ bookId, exportId: second.exportId }, true);
      expect(result.export.archiveReceipt?.outcome).toBe('replaced');
      expect(Object.keys(unzipSync(await readFile(destination)))).toHaveLength(4);
    } finally { store.close(); }
  }, 180_000);
  describe('frozen folder export', () => {
    let store: EditorialStore;
    let bookId: string;
    let packageVersionId: string;
    let title: string;
    let folder: string;
    let review: Awaited<ReturnType<EditorialStore['reviewBookDeliveryPackageExport']>>;
    const prepare = (at: string, reviewDigest = review.reviewDigest) =>
      store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL,
        memberKeys: review.files.map((file) => file.key), reviewDigest, folder: at }, true);

    beforeEach(async () => {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      ({ bookId, packageVersionId, title } = await preparedPackage(store));
      review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      folder = join(roots.inputRoot, '交付包导出');
      await mkdir(folder);
    });
    afterEach(() => { store.close(); });

    it('reviews the frozen members with their own fidelity and stable digest', async () => {
      // 导出… reviews the files the version writes: the publication, each delivered document, and the 交付包清单.
      expect(await code(() => store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, false))).toBe('EXPORT_POLICY_UNAVAILABLE');
      expect(await code(() => store.reviewBookDeliveryPackageExport({ bookId, packageVersionId: randomUUID(), options: ALL }, true)))
        .toBe('BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND');
      expect([review.versionLabel, review.statement, review.options, review.filesTruncated, review.degraded])
        .toEqual(['v1', BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT, ALL, false, false]);
      expect(review.files.map(({ key, label, fileName, format }) => ({ key, label, fileName, format }))).toEqual([
        { key: 'publication', label: '稿件 · 发稿版本「一审稿」 · r1', fileName: `001 ${title} · 一审稿.docx`, format: 'docx' },
        { key: 'document:news-release', label: '新闻稿 · 版本 1', fileName: `002 ${title} · 新闻稿 · 版本 1.docx`, format: 'docx' },
        { key: 'manifest', label: '交付包清单', fileName: '交付包清单.md', format: 'markdown' },
      ]);
      // Each file carries its own Export Fidelity Review: the DOCX files every class, the 交付包清单 none.
      expect(review.files.map((file) => [file.degraded, file.fidelity.length > 0, file.restorationLine.length > 0, file.formatLine.length > 0]))
        .toEqual([[false, true, true, true], [false, true, true, true], [false, false, true, true]]);
      expect(await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true)).toEqual(review);
    }, 240_000);

    it('refuses a stale review or an unavailable destination before preparing any member', async () => {
      expect(await code(() => prepare(folder, 'f'.repeat(64)))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_CHANGED');
      expect(await code(() => prepare('交付包导出'))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID');
      expect(await code(() => prepare(join(roots.inputRoot, '不存在的文件夹')))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID');
      expect(await code(() => prepare(join(roots.inputRoot, '交付包导出组稿.docx')))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID');
      expect(await code(() => prepare(roots.dataRoot))).toBe('EXPORT_DESTINATION_INVALID');
      const taken = join(roots.inputRoot, '已有清单');
      await mkdir(taken);
      await writeFile(join(taken, '交付包清单.md'), '另一个程序的文件');
      expect(await code(() => prepare(taken))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_TAKEN');
      expect([await count('export_preparations'), await count('book_delivery_package_exports')]).toEqual([0, 0]);
    }, 240_000);

    it('prepares the reviewed files without writing or adding export history', async () => {
      const first = await prepare(folder);
      expect([first.versionLabel, first.folder, first.state, first.summary, first.filesTruncated, first.stopped])
        .toEqual(['v1', folder, 'prepared', '已准备，尚未导出 · 3 个文件', false, null]);
      expect(outcomesOf(first)).toEqual([
        ['稿件 · 发稿版本「一审稿」 · r1', 'prepared', '已准备', false],
        ['新闻稿 · 版本 1', 'prepared', '已准备', false],
        ['交付包清单', 'prepared', '已准备', false],
      ]);
      expect(await readdir(folder)).toEqual([]);
      const version = store.inspectBookDeliveryPackage(bookId).versions[0]!;
      expect([version.exportHistoryLabel, version.exports, version.exportsTruncated]).toEqual(['暂无导出记录', [], false]);
    }, 240_000);

    it('writes the prepared files once and records the receipts beside the package', async () => {
      const first = await prepare(folder);
      // 按上述方式导出 writes each file with its receipt; the files are exactly the ones prepared.
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, false))).toBe('EXPORT_POLICY_UNAVAILABLE');
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      expect([exported.export.state, exported.export.summary, exported.export.stopped]).toEqual(['exported', '已导出到所选位置 · 3 个文件', null]);
      expect(outcomesOf(exported.export).map(([label, outcome, , reveal]) => [label, outcome, reveal])).toEqual([
        ['稿件 · 发稿版本「一审稿」 · r1', 'created', true],
        ['新闻稿 · 版本 1', 'created', true],
        ['交付包清单', 'created', true],
      ]);
      expect((await readdir(folder)).sort()).toEqual(review.files.map((file) => file.fileName).sort());
      for (const file of review.files.filter((entry) => entry.format === 'docx')) {
        const bytes = await readFile(join(folder, file.fileName));
        expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
      }
      const version = exported.package.versions[0]!;
      expect([version.exportHistoryLabel, version.exports.map((entry) => [entry.state, entry.summary, entry.folder, entry.fileCount])])
        .toEqual(['已导出 1 次', [['exported', '已导出到所选位置 · 3 个文件', folder, 3]]]);
      expect(version.exports[0]!.revealPreparationId).toBe(exported.export.files[0]!.preparationId);
      expect(version.exports[0]!.exportedAt >= first.createdAt).toBe(true);
      expect(await count('export_receipts')).toBe(3);

      const again = await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      expect({ ...again.export, stopped: null }).toEqual(exported.export);
      expect(await count('export_receipts')).toBe(3);
      // The files belong to the package's history, never to 交付物's export records.
      expect(store.inspectDeliverables(bookId).exports).toEqual([]);
    }, 240_000);

    it('writes the frozen manifest with its delivery records and exclusions', async () => {
      const first = await prepare(folder);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      // The 交付包清单 is the version's own words: what it holds, each document's Delivery Records, what it leaves out.
      const manifest = await readFile(join(folder, '交付包清单.md'), 'utf8');
      expect(manifest.split('\n')).toEqual([
        `# ${title} · 图书交付包 v1`,
        '',
        '- 用途：交出版社存档',
        expect.stringMatching(/^- 准备于：\d{4}-\d{2}-\d{2}T/u),
        expect.stringMatching(/^- 内容摘要：[0-9a-f]{64}$/u),
        '',
        '## 包含',
        '',
        '- 稿件 · 发稿版本「一审稿」 · r1（发稿范围：纸质版首印）',
        '- 新闻稿 · 版本 1',
        '',
        '## 交付记录',
        '',
        '### 新闻稿',
        '',
        expect.stringMatching(/^- 第 1 次交付 · 宣传部 · 版本 1 · \d{4}-\d{2}-\d{2}T.*（备注：首发稿）$/u),
        '',
        '## 不包含',
        '',
        '- 备注：稿件与文档上的备注只供编辑自己参考',
        '- 资料库原件',
        '- 中间修订版：稿件只含发稿版本，文档只含交付过的版本',
        '- 本书不做：宣传文章、评论文章、发布会材料、营销要点',
        '- 评估记录：本书没有定稿评估记录',
        '- 审稿意见：本书没有审稿意见',
        '',
        '## 说明',
        '',
        '- 图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。',
        '',
      ]);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(manifest).not.toContain(forbidden);
    }, 240_000);

    it('refuses the whole set when a rival file appears after preparation', async () => {
      const first = await prepare(folder);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      const second = join(roots.inputRoot, '第二次导出');
      await mkdir(second);
      const refusedExport = await prepare(second);
      const rival = join(second, review.files[1]!.fileName);
      await writeFile(rival, '另一个程序的文件');
      const refusal = await store.approveBookDeliveryPackageExport({ bookId, exportId: refusedExport.exportId }, true).then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({
        code: 'EXPORT_TARGET_CHANGED',
        message: `所选文件夹在准备导出后有了变化，「${review.files[1]!.fileName}」已不能按准备的方式写入，没有写入任何文件。请重新选择位置。`,
      });
      expect(await readdir(second)).toEqual([review.files[1]!.fileName]);
      expect(store.inspectBookDeliveryPackage(bookId).versions[0]!.exportHistoryLabel).toBe('已导出 1 次');
    }, 240_000);

    it('stops after the first file when a rival appears mid-write and never retries', async () => {
      const first = await prepare(folder);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      const second = join(roots.inputRoot, '第二次导出');
      await mkdir(second);
      const rival = join(second, review.files[1]!.fileName);
      const secondExport = await prepare(second);
      let watching = true;
      const watch = (): void => {
        if (!watching) return;
        if (existsSync(join(second, review.files[0]!.fileName))) {
          writeFileSync(rival, '另一个程序的文件');
          watching = false;
          return;
        }
        setImmediate(watch);
      };
      setImmediate(watch);
      const stopped = await store.approveBookDeliveryPackageExport({ bookId, exportId: secondExport.exportId }, true);
      watching = false;
      expect([stopped.export.state, stopped.export.summary]).toEqual(['incomplete', '已导出 1 个文件，其余 2 个没有写入']);
      expect(stopped.export.stopped).toEqual({ fileName: review.files[1]!.fileName, reason: '所选位置在准备后发生了变化，请重新选择保存位置。' });
      expect(outcomesOf(stopped.export).map(([label, outcome, text]) => [label, outcome, text])).toEqual([
        ['稿件 · 发稿版本「一审稿」 · r1', 'created', '已导出到所选位置'],
        ['新闻稿 · 版本 1', 'not-written', '未写入'],
        ['交付包清单', 'not-written', '未写入'],
      ]);
      expect(await readFile(rival, 'utf8')).toBe('另一个程序的文件');
      expect((await readdir(second)).sort()).toEqual([review.files[0]!.fileName, review.files[1]!.fileName].sort());
      const retried = await store.approveBookDeliveryPackageExport({ bookId, exportId: secondExport.exportId }, true);
      expect([retried.export.state, retried.export.stopped]).toEqual(['incomplete', null]);
      expect(await count('export_receipts')).toBe(4);
      const version = store.inspectBookDeliveryPackage(bookId).versions[0]!;
      expect([version.exportHistoryLabel, version.exportsTruncated, version.exports.map((entry) => [entry.folder, entry.state, entry.summary])]).toEqual([
        '已导出 2 次', false, [[second, 'incomplete', '已导出 1 个文件，其余 2 个没有写入'], [folder, 'exported', '已导出到所选位置 · 3 个文件']],
      ]);
    }, 240_000);

    it('leaves an export prepared when the first target is taken and enforces Book identity', async () => {
      // A file taken before anything was written refuses the approval itself: the export stays prepared.
      const third = join(roots.inputRoot, '第三次导出');
      await mkdir(third);
      const thirdExport = await prepare(third);
      await writeFile(join(third, review.files[0]!.fileName), '另一个程序的文件');
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId, exportId: thirdExport.exportId }, true))).toBe('EXPORT_TARGET_CHANGED');
      expect(await readdir(third)).toEqual([review.files[0]!.fileName]);
      expect(store.inspectBookDeliveryPackage(bookId).versions[0]!.exports).toEqual([]);
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId: randomUUID(), exportId: thirdExport.exportId }, true)))
        .toBe('BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND');
    }, 240_000);

    it('keeps the package unchanged and reopens its export history exactly', async () => {
      const first = await prepare(folder);
      await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      // The package itself never moved: exporting made no version and changed no content.
      const bundle = store.inspectBookDeliveryPackage(bookId);
      expect([bundle.versions.length, bundle.changedSinceLatest]).toEqual([1, false]);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(JSON.stringify(bundle)).not.toContain(forbidden);
      const before = JSON.stringify(bundle);
      store.markCleanShutdown();
      store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(JSON.stringify(store.inspectBookDeliveryPackage(bookId))).toBe(before);
    }, 240_000);

  });

  it('refuses an evaluation pinned to another finalized entry while its genuine version still reviews (Issue #429)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const { bookId } = await preparedPackage(store);
    const packageVersionId = prepareEvaluatedPackage(store, bookId, '交出版社存档');
    expect(store.inspectBookDeliveryPackage(bookId).content.included.map((item) => item.kind)).toContain('evaluation-record');
    expect((await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true)).files.map((file) => file.key))
      .toEqual(['publication', 'document:news-release', 'evaluation-record', 'manifest']);
    store.markCleanShutdown(); store.close();
    const plantedId = plantInvalidEvaluationPin(bookId);
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectBookDeliveryPackage(bookId).versions[0]!.version).toBe(3);
      expect(await code(() => reopened.reviewBookDeliveryPackageExport({ bookId, packageVersionId: plantedId, options: ALL }, true)))
        .toBe('BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID');
      expect([await count('export_preparations'), await count('book_delivery_package_exports')]).toEqual([0, 0]);
      expect((await reopened.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true)).files.map((file) => file.key))
        .toContain('evaluation-record');
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
  }, 240_000);

  it('writes the 交付包清单 from the frozen version alone, whatever changes after it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      // 恢复 of a type moves the package's content past v1; v1's files and their review stay exactly as they were.
      store.decideProductionDocumentType({ bookId, typeId: 'marketing-points', notForThisBook: false });
      expect(store.inspectBookDeliveryPackage(bookId).changedSinceLatest).toBe(true);
      expect(await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true)).toEqual(review);
      const folder = join(roots.inputRoot, '冻结版本');
      await mkdir(folder);
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: review.reviewDigest, folder }, true);
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(exported.export.state).toBe('exported');
      expect(exported.export.files.find((file) => file.key === 'manifest')!.outcome).toBe('created');
      expect(await readFile(join(folder, '交付包清单.md'), 'utf8')).toContain('- 本书不做：宣传文章、评论文章、发布会材料、营销要点');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('requires explicit members and writes only the selected subset', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const folder = join(roots.inputRoot, '所选成员');
      await mkdir(folder);
      const input = { bookId, packageVersionId, options: ALL, reviewDigest: review.reviewDigest, folder };
      for (const memberKeys of [undefined, [], ['manifest', 'manifest'], ['missing'], [...review.files.map((file) => file.key), 'unseen']]) {
        const result = await code(() => store.prepareBookDeliveryPackageExport({ ...input, memberKeys } as never, true));
        expect(result).not.toBe('no-error');
      }
      expect(await count('export_preparations')).toBe(0);
      const prepared = await store.prepareBookDeliveryPackageExport({ ...input, memberKeys: ['manifest'] }, true);
      expect(prepared.files.map((file) => file.key)).toEqual(['manifest']);
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(exported.export.files.map((file) => file.key)).toEqual(['manifest']);
      expect(await readdir(folder)).toEqual(['交付包清单.md']);
      expect(await count('export_receipts')).toBe(1);
    } finally { store.close(); }
  }, 180_000);

  it('reviews only one page and refuses an unseen member even if it belongs to the package', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      // Isolate pagination at its verified-record/read boundary: these are report identities and review metadata,
      // never report payloads. Preparation and approval are exercised with real records in the subset test above.
      let milestoneId = '';
      const record = BookDeliveryPackages.prototype.record;
      const reports = Array.from({ length: 45 }, () => ({ reportId: randomUUID(), version: 1, reviewRunId: randomUUID(), digest: 'a'.repeat(64) }));
      vi.spyOn(BookDeliveryPackages.prototype, 'record').mockImplementation(function (this: BookDeliveryPackages, ...args) {
        const found = record.apply(this, args);
        if (found !== null) milestoneId = found.record.content.publication!.milestoneId;
        return found === null ? null : { ...found, record: { ...found.record,
          content: { ...found.record.content, reviewReports: reports } } };
      });
      const read = ManuscriptExportStore.prototype.reviewPackageFile;
      let reportReads = 0;
      vi.spyOn(ManuscriptExportStore.prototype, 'reviewPackageFile').mockImplementation(async function (this: ManuscriptExportStore, id, target, format, options, available) {
        if (target.kind !== 'report' && target.kind !== 'package-manifest') return read.call(this, id, target, format, options, available);
        if (target.kind === 'report') reportReads += 1;
        const template = await read.call(this, id, { kind: 'milestone', milestoneId }, format, options, available);
        if (target.kind === 'package-manifest') return { ...template, suggestedFileName: '交付包清单.md' };
        const report = reports.find((entry) => entry.reportId === target.reportId)!;
        return { ...template, suggestedFileName: '审阅报告.docx', target: { ...template.target, report: { ...report, runLabel: '审阅' } } };
      });
      const first = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      expect([first.files.length, first.offset, first.nextOffset, reportReads]).toEqual([40, 0, 40, 38]);
      const second = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, offset: first.nextOffset! }, true);
      expect([second.files.length, second.nextOffset, reportReads]).toEqual([8, null, 45]);
      expect(second.files.at(-1)!.key).toBe('manifest');
      expect(new Set([...first.files, ...second.files].map((file) => file.fileName)).size).toBe(48);
      const folder = join(roots.inputRoot, '未查看成员');
      await mkdir(folder);
      expect(await code(() => store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: first.reviewDigest, memberKeys: ['manifest'], folder }, true))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_CHANGED');
      expect(await count('export_preparations')).toBe(0);
    } finally { store.close(); }
  }, 180_000);

  it.each(['preflight', 'first-file-revalidation'] as const)('cancels during %s before any approval or file write', async (boundary) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const jobs = new CooperativeJobOwner(store);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let arrived!: () => void;
    const entered = new Promise<void>((resolve) => { arrived = resolve; });
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const folder = join(roots.inputRoot, '取消前检查');
      await mkdir(folder);
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL,
        reviewDigest: review.reviewDigest, memberKeys: review.files.map((file) => file.key), folder }, true);
      if (boundary === 'preflight') {
        const check = ManuscriptExportStore.prototype.checkPrepared;
        vi.spyOn(ManuscriptExportStore.prototype, 'checkPrepared').mockImplementationOnce(async function (this: ManuscriptExportStore, ...args) {
          arrived(); await held; return check.apply(this, args);
        });
      } else {
        const approve = ManuscriptExportStore.prototype.approve;
        vi.spyOn(ManuscriptExportStore.prototype, 'approve').mockImplementationOnce(async function (this: ManuscriptExportStore, ...args) {
          arrived(); await held; return approve.apply(this, args);
        });
      }
      const job = jobs.startPackageExport({ bookId, exportId: prepared.exportId }, true);
      await entered;
      expect(jobs.cancelPackageExport(job.jobId)).toBe(true);
      release();
      let state = jobs.poll(job.jobId);
      for (let i = 0; i < 1_000 && state.state === 'running'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        state = jobs.poll(job.jobId);
      }
      expect(state.state).toBe('cancelled');
      expect(await readdir(folder)).toEqual([]);
      expect([await count('export_approvals'), await count('export_receipts')]).toEqual([0, 0]);
      expect(store.inspectBookDeliveryPackage(bookId).versions[0]!.exports).toEqual([]);
    } finally { release(); await jobs.dispose(); store.close(); }
  }, 180_000);

  it('exports a package after migrating the unique revision-40 predecessor', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store, await compose('迁移导出组稿', [1, 2]));
      store.markCleanShutdown();
    } finally { store.close(); }
    downgradeToRevision40();
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(migrated);
      expect(migrated.inspectBookDeliveryPackage(bookId).versions[0]!.exports).toEqual([]);
      const review = await migrated.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const folder = join(roots.inputRoot, '迁移后导出'); await mkdir(folder);
      const prepared = await migrated.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL,
        memberKeys: review.files.map((file) => file.key), reviewDigest: review.reviewDigest, folder }, true);
      const result = await migrated.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(result.export.state).toBe('exported');
      expect(await readdir(folder)).toHaveLength(3);
      migrated.markCleanShutdown();
    } finally { migrated.close(); }
  }, 120_000);

  it('says what each file keeps and loses, and writes the marks only as the editor leaves 含批注 and 含修改建议', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store, true);
      // The manuscript's formatting revision stays with its original file: the publication's DOCX is degraded, and says so.
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      expect([review.degraded, review.files.map((file) => file.degraded)]).toEqual([true, [true, false, false]]);
      const publication = review.files[0]!;
      expect(publication.restoration).toBe('from-original');
      // The revision on the paragraph and the one on its first run.
      expect(publication.fidelity.filter((row) => row.status === 'degraded').map((row) => [row.key, row.count])).toEqual([['file-revisions', 2]]);
      expect(publication.fidelity.filter((row) => row.key === 'annotations' || row.key === 'change-suggestions').map((row) => row.status))
        .toEqual(['preserved', 'preserved']);

      // Without 含批注 and 含修改建议 the files are reviewed again, their marks excluded, under another digest; a folder
      // chosen for one review never binds the other.
      const bare = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: NONE }, true);
      expect(bare.options).toEqual(NONE);
      expect(bare.reviewDigest).not.toBe(review.reviewDigest);
      expect(bare.files[0]!.fidelity.filter((row) => row.key === 'annotations' || row.key === 'change-suggestions').map((row) => row.status))
        .toEqual(['excluded', 'excluded']);
      const folder = join(roots.inputRoot, '不含标记');
      await mkdir(folder);
      expect(await code(() => store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: bare.reviewDigest, folder }, true)))
        .toBe('BOOK_DELIVERY_PACKAGE_EXPORT_CHANGED');
      const prepareFile = vi.spyOn(ManuscriptExportStore.prototype, 'preparePackageFile');
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: NONE, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: bare.reviewDigest, folder }, true);
      // Every file is prepared under exactly those switches, and never with 备注.
      const files = await Promise.all(prepareFile.mock.results.map((result) => result.value));
      expect(files.map((file) => file.options)).toEqual(Array(3).fill({ ...NONE, includeEditorNotes: false }));
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(exported.export.state).toBe('exported');

      // A request for 备注, or for switches it does not know, is refused.
      for (const options of [{ ...ALL, includeEditorNotes: true }, { includeAnnotations: true }, { includeAnnotations: 'yes', includeSuggestions: true }]) {
        expect(await code(() => store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options } as never, true))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_INVALID');
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 240_000);

  it('refuses a set that drifted since the folder was chosen, whole, before it writes a file', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await preparedPackage(store);
      const { bookId, packageVersionId } = book;
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const folder = join(roots.inputRoot, '标记之后');
      await mkdir(folder);
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: review.reviewDigest, folder }, true);
      // A 批注 made after the folder was chosen changes what the publication's file would carry: nothing is written, not
      // even the files it does not touch, and the refusal names the file.
      annotate(store, book);
      const refusal = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true).then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({
        code: 'EXPORT_PAYLOAD_CHANGED',
        message: `「${review.files[0]!.fileName}」的内容在准备导出后有了变化，没有写入任何文件。请重新查看导出。`,
      });
      expect(await readdir(folder)).toEqual([]);
      expect(await count('export_approvals')).toBe(0);
      const version = store.inspectBookDeliveryPackage(bookId).versions[0]!;
      expect([version.exportHistoryLabel, version.exports]).toEqual(['暂无导出记录', []]);
      // Reviewed again, the set is written whole.
      const again = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      expect(again.reviewDigest).not.toBe(review.reviewDigest);
      const next = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: again.reviewDigest, folder }, true);
      expect((await store.approveBookDeliveryPackageExport({ bookId, exportId: next.exportId }, true)).export.state).toBe('exported');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 240_000);

  it('reads an export from its own records, whatever words a later release writes the 交付包清单 in', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const words = BOOK_DELIVERY_PACKAGE_WORDS as { libraryOriginals: string };
    const original = words.libraryOriginals;
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL }, true);
      const exportTo = async (name: string) => {
        const folder = join(roots.inputRoot, name);
        await mkdir(folder);
        return store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, options: ALL, memberKeys: ['publication', 'document:news-release', 'manifest'], reviewDigest: review.reviewDigest, folder }, true);
      };
      const done = await exportTo('已导出');
      await store.approveBookDeliveryPackageExport({ bookId, exportId: done.exportId }, true);
      const waiting = await exportTo('待导出');
      const before = JSON.stringify(store.inspectBookDeliveryPackage(bookId).versions);
      // A later release words one line of the list otherwise: the package's versions and their history read as they were,
      // from the records alone.
      words.libraryOriginals = '资料库中的原件';
      expect(JSON.stringify(store.inspectBookDeliveryPackage(bookId).versions)).toBe(before);
      // Only writing the list again tells: a prepared export whose list would now read otherwise writes nothing.
      const refusal = await store.approveBookDeliveryPackageExport({ bookId, exportId: waiting.exportId }, true).then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({ code: 'EXPORT_PAYLOAD_CHANGED', message: '「交付包清单.md」的内容在准备导出后有了变化，没有写入任何文件。请重新查看导出。' });
      expect(await readdir(join(roots.inputRoot, '待导出'))).toEqual([]);
      store.markCleanShutdown();
    } finally {
      words.libraryOriginals = original;
      store.close();
    }
  }, 240_000);
});
