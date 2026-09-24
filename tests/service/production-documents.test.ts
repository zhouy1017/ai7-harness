import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { productionDocumentMarksNotCarried } from '../../src/service/production-documents.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { PRODUCTION_DOCUMENT_SCHEMA_VERSION, REIMPORT_GROUP_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { ProductionDocumentResultProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText, type SourceSpan } from '../support/composed-fixture.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 交付 · 生产文档 (Issue #415, plan slice S66a; V2-UX-DELIV-001, DELIV-002, WORK-013,
// MILE-014) over the real `EditorialStore` on a temporary Agent Data Root. The manuscript and the draft a document starts
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

describe('Production Documents', () => {
  it('makes a document of a house type from the Book\'s source material, edits and versions it apart from the Manuscript', async () => {
    const manuscriptPath = await compose('交付组稿', [1, 2, 3, 4, 5, 6]);
    const draftPath = await compose('新闻稿初稿', [21, 22, 23]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Book;
    let documentId: string;
    let deliverablesBefore: string;
    try {
      book = await importBook(store, manuscriptPath);
      const overviewBefore = store.getBookOverview(book.bookId);
      const manuscriptWindowBefore = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);

      // Before any material: five cards in the house's order, nothing to start from.
      let deliverables = store.inspectDeliverables(book.bookId);
      expect(deliverables.documents.types.map((type) => [type.typeId, type.label, type.notForThisBook, type.document])).toEqual([
        ['news-release', '新闻稿', false, null],
        ['promotion-article', '宣传文章', false, null],
        ['review-article', '评论文章', false, null],
        ['launch-materials', '发布会材料', false, null],
        ['marketing-points', '营销要点', false, null],
      ]);
      expect(deliverables.documents.sources).toEqual([]);
      expect(deliverables.documents.unavailableReason).toBeNull();
      // The Manuscript's own file is no material a document starts from.
      const manuscriptSource = overviewBefore.records.find((record) => record.kind === 'source');
      if (manuscriptSource?.kind !== 'source') throw new Error('the Book has no source version');
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: manuscriptSource.sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_SOURCE_INVALID');

      const sourceVersionId = await importSource(store, book.bookId, draftPath);
      deliverables = store.inspectDeliverables(book.bookId);
      expect(deliverables.documents.sources.map((source) => [source.sourceVersionId, source.format])).toEqual([[sourceVersionId, 'DOCX']]);
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'press-kit', sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_TYPE_INVALID');

      const created: ProductionDocumentResultProjection = await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId });
      expect(created.document).not.toBeNull();
      // A material with no comment or tracked change leaves nothing behind, and the document opens without a word of it.
      expect(created.notice).toBeNull();
      documentId = created.document!.documentId;
      expect(created.document!.versions.map((version) => [version.ordinal, version.label])).toEqual([[1, '版本 1']]);
      expect(created.document!.changedSinceVersion).toBe(false);
      expect(created.document!.origin).toEqual({ sourceVersionId, displayName: '新闻稿初稿.docx' });
      // At most one document per type.
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_EXISTS');

      // The document reads as the material reads, under identities of its own.
      const documentWindow = store.getManuscriptWindow(documentId, created.document!.branchId, null);
      expect(documentWindow.bookId).toBe(book.bookId);
      expect(documentWindow.blocks.map((block) => block.text)).toEqual(await Promise.all([21, 22, 23].map((block) => sourceSpanText(SOURCE, span(block)))));
      expect(documentWindow.blocks.some((block) => manuscriptWindowBefore.blocks.some((other) => other.blockId === block.blockId))).toBe(false);

      // The Manuscript, its overview and its history are untouched: a document is no Manuscript Revision.
      const overviewAfter = store.getBookOverview(book.bookId);
      expect(overviewAfter.manuscriptState).toEqual(overviewBefore.manuscriptState);
      expect(overviewAfter.records.filter((record) => record.kind === 'revision')).toEqual(overviewBefore.records.filter((record) => record.kind === 'revision'));
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null)).toEqual(manuscriptWindowBefore);
      expect(store.listBooks(null).items.find((item) => item.bookId === book.bookId)?.manuscriptState).toBe('populated');

      // An edit moves the document past its version; 保存为版本 makes 版本 2, and once more saves nothing.
      const first = documentWindow.blocks[0]!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: documentId, branchId: documentWindow.branchId, baseRevisionId: documentWindow.revisionId,
        blockId: first.blockId, windowStartBlockId: first.blockId, baseBlockDigest: first.digest,
        expectedJournalSequence: documentWindow.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（修订）',
      });
      expect(store.inspectDeliverables(book.bookId).documents.types[0]!.document!.changedSinceVersion).toBe(true);
      const saved = await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId, branchId: documentWindow.branchId });
      expect(saved.document!.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);
      expect(saved.document!.changedSinceVersion).toBe(false);
      const again = await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId, branchId: documentWindow.branchId });
      expect(again.document!.versions.map((version) => version.label)).toEqual(['版本 2', '版本 1']);

      // The same marks: a 批注 on the document stands in the document's window and nowhere in the Manuscript's.
      const marked = store.getManuscriptWindow(documentId, documentWindow.branchId, null);
      const markId = store.createEditorialMark({
        manuscriptId: documentId, branchId: marked.branchId, windowStartBlockId: marked.blocks[0]!.blockId, clientMarkId: randomUUID(),
        baseRevisionId: marked.revisionId, expectedJournalSequence: marked.journalSequence, blockId: marked.blocks[1]!.blockId,
        baseBlockDigest: marked.blocks[1]!.digest, fromGrapheme: 0, toGrapheme: 2,
        selectedText: Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(marked.blocks[1]!.text), ({ segment }) => segment).slice(0, 2).join(''),
        kind: 'annotation', highlightColor: null, body: '新闻稿里再核对。', proposedText: null, rationale: null,
      }).markId;
      expect(store.getManuscriptWindow(documentId, marked.branchId, null).marks.map((entry) => entry.markId)).toEqual([markId]);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks).toEqual([]);

      // A document has no milestones (MILE-014), and its caret never moves where the Manuscript opens.
      expect(await asyncCode(() => store.saveMilestone(documentId, documentWindow.branchId, '一审稿', 'stage-archive', null, '')))
        .toBe('MILESTONE_INVALID');
      store.recordManuscriptEntryPosition(documentId, documentWindow.branchId, first.blockId, 1);
      expect(store.readManuscriptEntryPosition(book.manuscriptId, book.branchId)).toBeNull();

      // 本书不做 keeps a document and its versions; a type marked so is not created until 恢复.
      const notForThisBook = store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'news-release', notForThisBook: true });
      expect(notForThisBook.document?.versions.length).toBe(2);
      expect(notForThisBook.deliverables.documents.types[0]!.notForThisBook).toBe(true);
      store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'promotion-article', notForThisBook: true });
      expect(await asyncCode(() => store.createProductionDocument({ bookId: book.bookId, typeId: 'promotion-article', sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_NOT_FOR_THIS_BOOK');
      // A repeat of the standing decision records nothing, and neither does 恢复 of a type never marked.
      store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'promotion-article', notForThisBook: true });
      expect(code(() => store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'review-article', notForThisBook: false }))).toBe('no-error');
      const restored = store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'promotion-article', notForThisBook: false });
      expect(restored.deliverables.documents.types[1]!.notForThisBook).toBe(false);

      deliverablesBefore = JSON.stringify(store.inspectDeliverables(book.bookId));
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The ledgers are append-only, and a restart validates the documents and reads 交付物 exactly as they were.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(() => database.prepare("UPDATE production_documents SET type_id = 'review-article'").run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM production_document_versions').run()).toThrow(/PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE/);
      expect((database.prepare('SELECT count(*) count FROM production_document_type_decisions').get() as { count: number }).count).toBe(3);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.stringify(reopened.inspectDeliverables(book!.bookId))).toBe(deliverablesBefore!);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('says what it did not carry from a material with comments and tracked changes, and every window of a document says it is one', async () => {
    const manuscriptPath = await compose('标记组稿', [1, 2, 3]);
    const draftPath = join(roots.inputRoot, '带批注的新闻稿.docx');
    await composeRevisedDocx(draftPath, {
      source: SOURCE,
      title: '带批注的新闻稿',
      paragraphs: [
        { runs: [{ comment: 'start', id: 1 }, { text: { block: 21 } }, { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }] },
        { runs: [{ text: { block: 22 } }, { text: { block: 23, from: 0, to: 4 }, revision: { kind: 'ins', author: '编辑甲', date: '2026-09-20T00:00:00Z' } }] },
      ],
      comments: [{ id: 1, author: '编辑甲', text: [{ block: 24, from: 0, to: 6 }] }],
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, manuscriptPath);
      const sourceVersionId = await importSource(store, book.bookId, draftPath);
      const created = await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId });
      // The comment and the insertion stay with the material, and the result says so for the window that opens.
      expect(created.notice).toBe(productionDocumentMarksNotCarried(2));
      const document = created.document!;
      expect(store.getManuscriptWindow(document.documentId, document.branchId, null).deliverable).toBe('production-document');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null)).not.toHaveProperty('deliverable');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
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
      const documentWindow = interrupted.getManuscriptWindow(documentId, branchId, null);
      const first = documentWindow.blocks[0]!;
      interrupted.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: documentId, branchId, baseRevisionId: documentWindow.revisionId,
        blockId: first.blockId, windowStartBlockId: first.blockId, baseBlockDigest: first.digest,
        expectedJournalSequence: documentWindow.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（修订）',
      });
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
      expect(recovered.inspectDeliverables(book!.bookId).documents.types[0]!.document!.changedSinceVersion).toBe(true);
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
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), await compose('来源', [30, 31]));
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '只有来源的书', relationship: 'source-only' });
      const commitId = randomUUID();
      const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const deliverables = store.inspectDeliverables(commit.bookId);
      expect(deliverables.documents.unavailableReason).toBe('先导入稿件，再创建生产文档');
      expect(await asyncCode(() => store.createProductionDocument({ bookId: commit.bookId, typeId: 'news-release', sourceVersionId: commit.sourceVersionId })))
        .toBe('PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('rebuilds a revision-36 store\'s manuscripts with every row as it was, and adds the ledgers empty', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store, await compose('迁移组稿', [1, 2]));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    let rows: unknown[];
    try {
      // Revision 36's `manuscripts`: `book_id UNIQUE`, the primary role only, and no partial index.
      planted.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
      planted.exec(`BEGIN IMMEDIATE;
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
      planted.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
      rows = planted.prepare('SELECT rowid, * FROM manuscripts ORDER BY rowid').all();
      expect(rows).toHaveLength(1);
    } finally {
      planted.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(PRODUCTION_DOCUMENT_SCHEMA_VERSION);
      expect(after.prepare('SELECT rowid, * FROM manuscripts ORDER BY rowid').all()).toEqual(rows!);
      expect((after.prepare("SELECT sql FROM sqlite_schema WHERE name = 'manuscripts'").get() as { sql: string }).sql).toContain("'production-document'");
      expect(after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = 'manuscripts_one_primary_per_book'").get()).toBeDefined();
      for (const relation of PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER) {
        expect((after.prepare(`SELECT count(*) count FROM ${relation}`).get() as { count: number }).count).toBe(0);
      }
    } finally {
      after.close();
    }
  }, 120_000);
});
