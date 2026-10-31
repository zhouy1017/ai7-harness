import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { productionDocumentMarksNotCarried } from '../../src/service/production-documents.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  PRODUCTION_DOCUMENT_SCHEMA_VERSION,
  REIMPORT_GROUP_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL,
} from '../../src/service/task-authorization.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  type ProductionDocumentDeliveryVersionInput,
  type ProductionDocumentRecipientKind,
  type ProductionDocumentProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText, type SourceSpan } from '../support/composed-fixture.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

// Service-integration suite (L2) for 交付 · 生产文档 (Issue #415, plan slices S66a and S66b; V2-UX-DELIV-001 to DELIV-004,
// WORK-013, MILE-014, EXP-024) over the real `EditorialStore` on a temporary Agent Data Root. The manuscript and the draft a document starts
// from are composed from exact `sample1`'s paragraphs; assertions compare identities, counts and positions, and no
// manuscript text is printed.

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

interface Book { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, path: string): Promise<Book> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** 导入稿件 → 作为来源材料导入 into the Book: the draft a document can start from. */
async function importSource(store: EditorialStore, bookId: string, path: string): Promise<string> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.sourceVersionId;
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

async function asyncCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

type DocumentFixture = { store: EditorialStore; book: Book; sourceVersionId: string; created: ProductionDocumentProjection };

async function withStore(run: (store: EditorialStore) => Promise<void>): Promise<void> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try { await run(store); store.markCleanShutdown(); } finally { store.close(); }
}

async function withBook(run: (store: EditorialStore, book: Book) => Promise<void>): Promise<void> {
  await withStore(async (store) => run(store, await importBook(store, await compose('交付记录组稿', [1, 2, 3, 4, 5, 6]))));
}

async function withDocument(run: (fixture: DocumentFixture) => Promise<void>): Promise<void> {
  await withBook(async (store, book) => {
    const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
    const created = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
    await run({ store, book, sourceVersionId, created });
  });
}

function editDocument({ store, created }: Pick<DocumentFixture, 'store' | 'created'>, insertText = '（修订）'): void {
  const window = store.getManuscriptWindow(created.documentId, created.branchId, null);
  const block = window.blocks[0]!;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: created.documentId, branchId: created.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText,
  });
}

const saved = (revisionId: string): ProductionDocumentDeliveryVersionInput => ({ kind: 'saved', revisionId });
const reading = ({ store, book }: DocumentFixture) => store.inspectProductionDocuments(book.bookId).types[0]!.document!;
const saveVersion = ({ store, book, created }: DocumentFixture) =>
  store.saveProductionDocumentVersion({ bookId: book.bookId, documentId: created.documentId, branchId: created.branchId });
const deliver = ({ store, book, created }: DocumentFixture, version: ProductionDocumentDeliveryVersionInput,
  kind: ProductionDocumentRecipientKind = 'publicity', custom: string | null = null, note: string | null = null) =>
  store.recordProductionDocumentDelivery({ bookId: book.bookId, documentId: created.documentId, version, recipient: { kind, custom }, note });

async function exportVersion({ store, book, created }: DocumentFixture, revisionId: string, directory: string) {
  const target = { kind: 'document', documentId: created.documentId, revisionId } as const;
  const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
  const destination = join(directory, reviewed.suggestedFileName);
  const preparation = await store.prepareManuscriptExport({
    bookId: book.bookId, revisionId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination,
  }, true);
  return { target, reviewed, destination, preparation };
}

async function editPastSavedVersion(fixture: DocumentFixture): Promise<void> {
  await deliver(fixture, saved(fixture.created.versions[0]!.revisionId));
  editDocument(fixture);
  await saveVersion(fixture);
  editDocument(fixture, '（交付前修订）');
}

function withDatabase(run: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { run(database); } finally { database.close(); }
}

async function afterReopen(run: (store: EditorialStore) => void | Promise<void>): Promise<void> {
  const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try { await run(reopened); reopened.markCleanShutdown(); } finally { reopened.close(); }
}

// Unique pre-37/pre-38 paths: the owning migration suites start at 56/57 or newer.
function plantRevision36(): void {
  withDatabase((planted) => {
    // Revision 36's `manuscripts`: `book_id UNIQUE`, the primary role only, and no partial index.
    planted.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
    execPre74Fixture(planted, `BEGIN IMMEDIATE;
      ${PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join('\n')}
      DROP INDEX manuscripts_one_primary_per_book;
      ALTER TABLE manuscripts RENAME TO manuscripts_v37;
      CREATE TABLE manuscripts (
        manuscript_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        role TEXT NOT NULL CHECK(role = 'primary'),
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO manuscripts SELECT * FROM manuscripts_v37 ORDER BY rowid;
      DROP TABLE manuscripts_v37;
      PRAGMA user_version = ${REIMPORT_GROUP_SCHEMA_VERSION};
      COMMIT;`);
    downgradeKindCoupledRelations(planted, ANALYSIS_LEDGER_REVISION_58_SQL);
    planted.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
  });
}

function plantRevision37(): void {
  withDatabase((planted) => {
    // Revision 37: everything as it is, but no Delivery Records, no package versions (revision 39) and no workflow
    // (revision 40).
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
      DROP TABLE production_document_phase_transitions;
      DROP TABLE production_document_workflow_instances;
      DROP TABLE book_delivery_package_versions;
      DROP TABLE production_document_deliveries;
      PRAGMA user_version = ${PRODUCTION_DOCUMENT_SCHEMA_VERSION};
      COMMIT;`);
    downgradeKindCoupledRelations(planted, ANALYSIS_LEDGER_REVISION_58_SQL);
    planted.exec('PRAGMA foreign_keys = ON');
  });
}

describe('Production Documents', () => {
  it('offers the five house types before any source material is available', async () => {
    await withBook(async (store, book) => {
      const documents = store.inspectProductionDocuments(book.bookId);
      expect(documents.types.map((type) => [type.typeId, type.label, type.notForThisBook, type.document])).toEqual([
        ['news-release', '新闻稿', false, null], ['promotion-article', '宣传文章', false, null],
        ['review-article', '评论文章', false, null], ['launch-materials', '发布会材料', false, null],
        ['marketing-points', '营销要点', false, null],
      ]);
      expect(documents.sources).toEqual([]);
      expect(documents.unavailableReason).toBeNull();
    });
  });

  it('creates only a house type from material imported as a source', async () => {
    await withBook(async (store, book) => {
      const manuscriptSource = store.getBookOverview(book.bookId).records.find((record) => record.kind === 'source')!;
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: manuscriptSource.sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_SOURCE_INVALID');
      const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
      expect(store.inspectProductionDocuments(book.bookId).sources.map((source) => [source.sourceVersionId, source.format])).toEqual([[sourceVersionId, 'DOCX']]);
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'press-kit', sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID');
      const created = await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId });
      expect(created.notice).toBeNull();
      expect(created.document!.origin).toEqual({ sourceVersionId, displayName: '新闻稿初稿.docx', marksNotCarried: 0, drafted: false });
      expect(created.document!.versions.map((version) => [version.ordinal, version.label])).toEqual([[1, '版本 1']]);
      expect(created.document!.changedSinceVersion).toBe(false);
      expect([created.document!.deliveries, created.document!.deliveriesTruncated, created.document!.changedSinceDelivery]).toEqual([[], false, false]);
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_EXISTS');
    });
  });

  it('copies material under document identities without changing the Manuscript or its history', async () => {
    await withBook(async (store, book) => {
      const overviewBefore = store.getBookOverview(book.bookId);
      const manuscriptWindow = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
      const created = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
      const window = store.getManuscriptWindow(created.documentId, created.branchId, null);
      expect(window.bookId).toBe(book.bookId);
      expect(window.blocks.map((block) => block.text)).toEqual(await Promise.all([21, 22, 23].map((block) => sourceSpanText(SOURCE, span(block)))));
      expect(window.blocks.some((block) => manuscriptWindow.blocks.some((other) => other.blockId === block.blockId))).toBe(false);
      const overviewAfter = store.getBookOverview(book.bookId);
      expect(overviewAfter.manuscriptState).toEqual(overviewBefore.manuscriptState);
      expect(overviewAfter.records.filter((record) => record.kind === 'revision')).toEqual(overviewBefore.records.filter((record) => record.kind === 'revision'));
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null)).toEqual(manuscriptWindow);
      expect(store.listBooks(null).items.find((item) => item.bookId === book.bookId)?.manuscriptState).toBe('populated');
    });
  });

  it('saves an edited document as the next version only once', async () => {
    await withDocument(async (fixture) => {
      editDocument(fixture);
      expect(reading(fixture).changedSinceVersion).toBe(true);
      const savedVersion = (await saveVersion(fixture)).document!;
      expect(savedVersion.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);
      expect(savedVersion.changedSinceVersion).toBe(false);
      expect((await saveVersion(fixture)).document!.versions).toEqual(savedVersion.versions);
    });
  });

  it('keeps document annotations apart from the Manuscript', async () => {
    await withDocument(async ({ store, book, created }) => {
      const marked = store.getManuscriptWindow(created.documentId, created.branchId, null);
      const markId = store.createEditorialMark({
        manuscriptId: created.documentId, branchId: marked.branchId, windowStartBlockId: marked.blocks[0]!.blockId, clientMarkId: randomUUID(),
        baseRevisionId: marked.revisionId, expectedJournalSequence: marked.journalSequence, blockId: marked.blocks[1]!.blockId,
        baseBlockDigest: marked.blocks[1]!.digest, fromGrapheme: 0, toGrapheme: 2,
        selectedText: Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(marked.blocks[1]!.text), ({ segment }) => segment).slice(0, 2).join(''),
        kind: 'annotation', highlightColor: null, body: '新闻稿里再核对。', proposedText: null, rationale: null,
      }).markId;
      expect(store.getManuscriptWindow(created.documentId, marked.branchId, null).marks.map((entry) => entry.markId)).toEqual([markId]);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks).toEqual([]);
    });
  });

  it('refuses milestones on a production document', async () => {
    await withDocument(async ({ store, created }) => {
      expect(await asyncCode(() => store.saveMilestone(created.documentId, created.branchId, '一审稿', 'stage-archive', null, ''))).toBe('MILESTONE_INVALID');
    });
  });

  it('keeps the document caret apart from where the Manuscript opens', async () => {
    await withDocument(async ({ store, book, created }) => {
      const first = store.getManuscriptWindow(created.documentId, created.branchId, null).blocks[0]!;
      store.recordManuscriptEntryPosition(created.documentId, created.branchId, first.blockId, 1);
      expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toBeNull();
    });
  });

  it('keeps versions while a type is not for this Book and restores creation when asked', async () => {
    await withDocument(async (fixture) => {
      const { store, book, created, sourceVersionId } = fixture;
      editDocument(fixture);
      await saveVersion(fixture);
      const decision = store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'news-release', notForThisBook: true });
      expect(decision.document!.versions).toEqual(reading(fixture).versions);
      expect(decision.document!.versions).toHaveLength(2);
      expect(decision.documents.types[0]!.notForThisBook).toBe(true);
      const input = { bookId: book.bookId, typeId: 'promotion-article', notForThisBook: true };
      const marked = store.decideProductionDocumentType(input);
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: input.typeId, sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_NOT_FOR_THIS_BOOK');
      expect(store.decideProductionDocumentType(input)).toEqual(marked);
      expect(code(() => store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'review-article', notForThisBook: false }))).toBe('no-error');
      expect(store.decideProductionDocumentType({ ...input, notForThisBook: false }).documents.types[1]!.notForThisBook).toBe(false);
      expect(reading(fixture).documentId).toBe(created.documentId);
    });
  });

  it('keeps document ledgers append-only and reads the same documents after restart', async () => {
    let bookId: string;
    let before: unknown;
    await withDocument(async (fixture) => {
      bookId = fixture.book.bookId;
      editDocument(fixture);
      await saveVersion(fixture);
      fixture.store.decideProductionDocumentType({ bookId, typeId: 'news-release', notForThisBook: true });
      before = fixture.store.inspectProductionDocuments(bookId);
    });
    withDatabase((database) => {
      expect(() => database.prepare("UPDATE production_documents SET type_id = 'review-article'").run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM production_document_versions').run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
    });
    await afterReopen((store) => expect(store.inspectProductionDocuments(bookId!)).toEqual(before));
  });

  it('says what it did not carry from a material with comments and tracked changes, for as long as the document exists, and every window of a document says it is one', async () => {
    let bookId: string;
    await withBook(async (store, book) => {
      const draftPath = join(roots.inputRoot, '带批注的新闻稿.docx');
      await composeRevisedDocx(draftPath, {
        source: SOURCE, title: '带批注的新闻稿',
        paragraphs: [
          { runs: [{ comment: 'start', id: 1 }, { text: { block: 21 } }, { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }] },
          { runs: [{ text: { block: 22 } }, { text: { block: 23, from: 0, to: 4 }, revision: { kind: 'ins', author: '编辑甲', date: '2026-09-20T00:00:00Z' } }] },
        ],
        comments: [{ id: 1, author: '编辑甲', text: [{ block: 24, from: 0, to: 6 }] }],
      });
      bookId = book.bookId;
      const sourceVersionId = await importSource(store, book.bookId, draftPath);
      const created = await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId });
      expect(created.notice).toBe(productionDocumentMarksNotCarried(2));
      const document = created.document!;
      expect(document.origin).toEqual({ sourceVersionId, displayName: '带批注的新闻稿.docx', marksNotCarried: 2, drafted: false });
      expect(store.inspectProductionDocuments(book.bookId).types[0]!.document!.origin.marksNotCarried).toBe(2);
      expect(store.getManuscriptWindow(document.documentId, document.branchId, null).deliverable).toBe('production-document');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null)).not.toHaveProperty('deliverable');
    });
    withDatabase((database) => {
      expect(() => database.prepare('UPDATE production_document_origin_readings SET marks_not_carried = 0').run()).toThrow(/PRODUCTION_DOCUMENT_ORIGIN_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM production_document_origin_readings').run()).toThrow(/PRODUCTION_DOCUMENT_ORIGIN_LEDGER_IMMUTABLE/);
    });
    await afterReopen((store) => expect(store.inspectProductionDocuments(bookId!).types[0]!.document!.origin.marksNotCarried).toBe(2));
  }, 180_000);

  it('saves the revision a journal recovery made as the next version, and the recovered window is still the document', async () => {
    const manuscriptPath = await compose('恢复组稿', [1, 2, 3]);
    const draftPath = await compose('恢复的新闻稿', [21, 22]);
    let book: Book;
    let documentId: string;
    let branchId: string;
    const interrupted = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(interrupted, manuscriptPath);
      const sourceVersionId = await importSource(interrupted, book.bookId, draftPath);
      const created = await interrupted.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId });
      ({ documentId, branchId } = created.document!);
      editDocument({ store: interrupted, created: created.document! });
    } finally {
      // No `markCleanShutdown`: an interrupted process leaves the document's journal ahead of its revision.
      interrupted.close();
    }

    const recovered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const startup = await recovered.getStartup();
      if (startup.state !== 'manuscript-recovery') throw new Error('the interrupted edit raised no recovery');
      expect(startup.recovery.manuscriptId).toBe(documentId!);
      const restoration = await recovered.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind: 'journal' });
      // Recovery returns to the document's own window, which says what it holds.
      expect(restoration.window.deliverable).toBe('production-document');
      // The restored state is a revision with nothing left to check point: 保存为版本 saves that revision as 版本 2, once.
      expect(recovered.inspectProductionDocuments(book!.bookId).types[0]!.document!.changedSinceVersion).toBe(true);
      const saved = await recovered.saveProductionDocumentVersion({ bookId: book!.bookId, documentId: documentId!, branchId: branchId! });
      expect(saved.document!.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);
      expect(saved.document!.versions[0]!.revisionId).toBe(restoration.descendantRevisionId);
      expect(saved.document!.changedSinceVersion).toBe(false);
      const again = await recovered.saveProductionDocumentVersion({ bookId: book!.bookId, documentId: documentId!, branchId: branchId! });
      expect(again.document!.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);
      recovered.markCleanShutdown();
    } finally {
      recovered.close();
    }
  }, 180_000);

  it('refuses a document for a Book without its Manuscript', async () => {
    await withStore(async (store) => {
      const staged = await store.stageSelectedManuscript(randomUUID(), await compose('来源', [30, 31]));
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '只有来源的书', relationship: 'source-only' });
      const commitId = randomUUID();
      const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const deliverables = store.inspectProductionDocuments(commit.bookId);
      expect(deliverables.unavailableReason).toBe('先导入稿件，再创建生产文档');
      expect(await asyncCode(() => store.createProductionDocument({ bookId: commit.bookId, typeId: 'news-release', sourceVersionId: commit.sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT');
    });
  }, 120_000);

  it('preserves a revision-36 Manuscript and permits a separate production document after migration', async () => {
    let book: Book;
    let before: unknown;
    await withBook(async (store, imported) => {
      book = imported;
      before = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    });
    plantRevision36();
    await afterReopen(async (migrated) => {
      expect(migrated.getManuscriptWindow(book!.manuscriptId, book!.branchId, null)).toEqual(before);
      expect(migrated.inspectProductionDocuments(book!.bookId).types.every((type) => type.document === null)).toBe(true);
      const sourceVersionId = await importSource(migrated, book!.bookId, await compose('新闻稿初稿', [21, 22]));
      const created = await migrated.createProductionDocument({ bookId: book!.bookId, typeId: 'news-release', sourceVersionId });
      expect(created.document!.documentId).not.toBe(book!.manuscriptId);
      expect(migrated.getManuscriptWindow(book!.manuscriptId, book!.branchId, null)).toEqual(before);
    });
  }, 120_000);
});


describe('交付 of a Production Document (S66b)', () => {
  it('refuses deliveries that do not name this document version and a valid recipient and note', async () => {
    await withDocument(async (fixture) => {
      const { store, book, created } = fixture;
      const version1 = saved(created.versions[0]!.revisionId);
      const manuscriptRevision = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).revisionId;
      expect(await asyncCode(() => deliver(fixture, saved(manuscriptRevision)))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
      expect(await asyncCode(() => deliver(fixture, version1, 'custom', '   '))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
      expect(await asyncCode(() => deliver(fixture, version1, 'publicity', '宣传部'))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
      expect(await asyncCode(() => deliver(fixture, version1, 'publicity', null, '注'.repeat(501)))).toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
      expect(await asyncCode(() => store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: randomUUID(), version: version1, recipient: { kind: 'publicity', custom: null }, note: null,
      }))).toBe('PRODUCTION_DOCUMENT_NOT_FOUND');
      expect(reading(fixture).deliveries).toEqual([]);
    });
  });

  it('records the saved version, recipient and trimmed note without sending a Manuscript', async () => {
    await withDocument(async (fixture) => {
      const { store, book, created } = fixture;
      const version1 = created.versions[0]!.revisionId;
      const before = store.inspectDeliverables(book.bookId);
      const first = (await deliver(fixture, saved(version1), 'publicity', null, ' 发布会前一周给宣传部。 ')).document!;
      expect(first.deliveries.map((entry) => [entry.ordinal, entry.revisionId, entry.versionLabel, entry.recipient, entry.note, entry.export]))
        .toEqual([[1, version1, '版本 1', { kind: 'publicity', label: '宣传部' }, '发布会前一周给宣传部。', null]]);
      expect(first.changedSinceDelivery).toBe(false);
      expect(store.inspectDeliverables(book.bookId)).toEqual(before);
    });
  });

  it('exports exactly the delivered document version and attaches its receipt', async () => {
    await withDocument(async (fixture) => {
      const { store, book, created } = fixture;
      const version1 = created.versions[0]!.revisionId;
      await deliver(fixture, saved(version1));
      const { target, reviewed, destination, preparation } = await exportVersion(fixture, version1, roots.inputRoot);
      expect(reviewed.target).toMatchObject({
        kind: 'document', revisionId: version1, milestoneId: null, report: null,
        document: { documentId: created.documentId, typeId: 'news-release', typeLabel: '新闻稿', versionLabel: '版本 1' },
      });
      expect(reviewed.savedForExport).toBe(false);
      expect(reviewed.suggestedFileName).toBe('交付记录组稿 · 新闻稿 · 版本 1.docx');
      const manuscriptRevision = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).revisionId;
      expect(await asyncCode(() => store.reviewManuscriptExport({
        bookId: book.bookId, target: { ...target, revisionId: manuscriptRevision }, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      }, true))).toBe('EXPORT_TARGET_NOT_FOUND');
      const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(receipt).toMatchObject({ outcome: 'created', fileName: reviewed.suggestedFileName, target: { kind: 'document', revisionId: version1 } });
      const written: ParsedDocxBlock[] = [];
      await parseDocx(destination, 'written.docx', (block) => written.push(block));
      expect(written.map((block) => block.digest)).toEqual(store.getManuscriptWindow(created.documentId, created.branchId, null).blocks.map((block) => block.digest));
      expect(reading(fixture).deliveries[0]!.export).toEqual({
        preparationId: preparation.preparationId, outcome: 'created', outcomeLabel: '已导出到所选位置', fileName: reviewed.suggestedFileName,
      });
    });
  });

  it('keeps the successful delivery export when a later attempt fails', async () => {
    await withDocument(async (fixture) => {
      const { store, book, created } = fixture;
      const version1 = created.versions[0]!.revisionId;
      await deliver(fixture, saved(version1));
      const first = await exportVersion(fixture, version1, roots.inputRoot);
      await store.approveManuscriptExport({ bookId: book.bookId, preparationId: first.preparation.preparationId }, true);
      const recordedExport = reading(fixture).deliveries[0]!.export;
      const gone = join(roots.inputRoot, '移动硬盘');
      await mkdir(gone);
      const retry = await exportVersion(fixture, version1, gone);
      await rm(gone, { recursive: true });
      expect((await store.approveManuscriptExport({ bookId: book.bookId, preparationId: retry.preparation.preparationId }, true)).outcome).toBe('failed');
      expect(reading(fixture).deliveries[0]!.export).toEqual(recordedExport);
      expect(store.inspectDeliverables(book.bookId).exports.map((entry) => [entry.preparationId, entry.outcome, entry.target.kind, entry.target.document?.versionLabel]))
        .toEqual([[retry.preparation.preparationId, 'failed', 'document', '版本 1'], [first.preparation.preparationId, 'created', 'document', '版本 1']]);
      editDocument(fixture);
      const version2 = (await saveVersion(fixture)).document!.versions[0]!.revisionId;
      const second = (await deliver(fixture, saved(version2), 'custom', ' 出版社发行部 ')).document!;
      expect(second.deliveries.map((entry) => [entry.ordinal, entry.versionLabel, entry.recipient, entry.note, entry.export?.preparationId ?? null]))
        .toEqual([
          [2, '版本 2', { kind: 'custom', label: '出版社发行部' }, null, null],
          [1, '版本 1', { kind: 'publicity', label: '宣传部' }, null, first.preparation.preparationId],
        ]);
    });
  });

  it('keeps the changed-since-delivery flag until the edited text is delivered', async () => {
    await withDocument(async (fixture) => {
      const version1 = fixture.created.versions[0]!.revisionId;
      await deliver(fixture, saved(version1));
      editDocument(fixture);
      expect(reading(fixture).changedSinceDelivery).toBe(true);
      const version2 = (await saveVersion(fixture)).document!;
      expect(version2.changedSinceDelivery).toBe(true);
      expect((await deliver(fixture, saved(version2.versions[0]!.revisionId))).document!.changedSinceDelivery).toBe(false);
      const earlier = (await deliver(fixture, saved(version1), 'editorial')).document!;
      expect(earlier.deliveries[0]).toMatchObject({ ordinal: 3, versionLabel: '版本 1', recipient: { kind: 'editorial', label: '编辑部' }, export: null });
      expect(earlier.changedSinceDelivery).toBe(false);
    });
  });

  it('refuses stale current text or an invalid recipient without saving a version', async () => {
    await withDocument(async (fixture) => {
      editDocument(fixture);
      const before = reading(fixture);
      expect([before.changedSinceVersion, before.changedSinceDelivery, before.versions.length]).toEqual([true, false, 1]);
      expect(await asyncCode(() => deliver(fixture, { kind: 'current', workingDigest: fixture.created.workingDigest }, 'external-media')))
        .toBe('PRODUCTION_DOCUMENT_DELIVERY_CHANGED');
      expect(await asyncCode(() => deliver(fixture, { kind: 'current', workingDigest: before.workingDigest }, 'custom')))
        .toBe('PRODUCTION_DOCUMENT_DELIVERY_INVALID');
      expect(reading(fixture)).toEqual(before);
    });
  });

  it('saves current text as the next delivered version only once', async () => {
    await withDocument(async (fixture) => {
      await editPastSavedVersion(fixture);
      const workingDigest = reading(fixture).workingDigest;
      const current = { kind: 'current', workingDigest } as const;
      const delivered = (await deliver(fixture, current, 'external-media')).document!;
      expect(delivered.versions.map((version) => version.label)).toEqual(['版本 3', '版本 2', '版本 1']);
      expect([delivered.changedSinceVersion, delivered.changedSinceDelivery, delivered.workingDigest]).toEqual([false, false, workingDigest]);
      expect(delivered.deliveries[0]).toMatchObject({ ordinal: 2, revisionId: delivered.versions[0]!.revisionId, versionLabel: '版本 3', recipient: { kind: 'external-media', label: '外部媒体' } });
      const again = (await deliver(fixture, current, 'other')).document!;
      expect(again.versions).toEqual(delivered.versions);
      expect(again.deliveries[0]).toMatchObject({ ordinal: 3, versionLabel: '版本 3', recipient: { kind: 'other', label: '其他' } });
    });
  });

  it('keeps delivery history append-only under 本书不做 and after restart', async () => {
    let bookId: string;
    let before: unknown;
    await withDocument(async (fixture) => {
      bookId = fixture.book.bookId;
      await editPastSavedVersion(fixture);
      const delivered = (await deliver(fixture, { kind: 'current', workingDigest: reading(fixture).workingDigest }, 'external-media')).document!;
      const set = fixture.store.decideProductionDocumentType({ bookId, typeId: 'news-release', notForThisBook: true });
      expect(set.document!.deliveries).toEqual(delivered.deliveries);
      before = set.documents;
    });
    withDatabase((database) => {
      expect(() => database.prepare("UPDATE production_document_deliveries SET recipient_label = '外部媒体'").run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM production_document_deliveries').run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
      // The public version projection has no creation reason; retain this delivery-specific observation.
      expect(database.prepare('SELECT version, origin FROM production_document_versions ORDER BY version').all().map((row) => ({ ...row })))
        .toEqual([{ version: 1, origin: 'created' }, { version: 2, origin: 'saved' }, { version: 3, origin: 'delivery' }]);
    });
    await afterReopen((store) => expect(store.inspectProductionDocuments(bookId!)).toEqual(before));
  });

  it('adds empty Delivery Records to a revision-37 store while preserving its documents', async () => {
    let bookId: string;
    let before: string;
    await withDocument(async ({ store, book }) => {
      bookId = book.bookId;
      before = JSON.stringify(store.inspectProductionDocuments(bookId));
    });
    plantRevision37();
    await afterReopen((store) => {
      const documents = store.inspectProductionDocuments(bookId!);
      // Pre-origin-reading stores cannot report how many marks their material left behind (#547).
      expect(JSON.stringify(documents)).toBe(before!.replaceAll('"marksNotCarried":0', '"marksNotCarried":null'));
      expect(documents.types[0]!.document!.deliveries).toEqual([]);
    });
  }, 120_000);
});
