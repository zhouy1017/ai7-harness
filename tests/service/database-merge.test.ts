import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  DatabaseMergeError,
  MERGE_TABLE_POLICY,
  mergeBooks,
  mergeIntoStoreFile,
  planMerge,
  saveStoreFiles,
} from '../../src/service/database-merge.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { preMergeBackupFileName, replacementStagingFor } from '../../src/service/database-replacement.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for merging a Book (Issue #434, plan slice S86d; V2-UX-DSTO-017; ADR 0079 §1.5) over two real
// stores: a Book with a manuscript and its history, an edit, a mark, a milestone, a 发稿版本, a Production Document delivered
// and a 图书交付包 is merged into another store with every record it owns, beside a Book there of the same title; the merged
// store opens and reads the Book exactly as the store it came from; a Book already here is not taken again; and a merge that
// cannot finish leaves the store as it was. The manuscripts are composed from exact `sample1`'s paragraphs.

let roots: ServiceTestRoots;
let otherRoot: string;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-database-merge-');
  otherRoot = join(dirname(roots.dataRoot), 'other-data');
});

afterEach(async () => {
  await roots.dispose();
});

async function compose(name: string, blocks: ReadonlyArray<number>): Promise<string> {
  const path = join(roots.inputRoot, `${name}-${randomUUID()}.docx`);
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: name, paragraphs: blocks.map((block) => ({ runs: [{ text: { block } }] })) });
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

function emptyBook(store: EditorialStore, title: string, internalNumber: string | null = null): string {
  const creation = store.prepareBookCreation(title, internalNumber);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

const TITLE = '合并组稿';

/** A Book with a manuscript and its history, a mark, a milestone, a 发稿版本, a Production Document delivered and a package. */
async function richBook(store: EditorialStore): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  const book = await importBook(store, await compose(TITLE, [1, 2, 3, 4]));
  const target = { manuscriptId: book.manuscriptId, branchId: book.branchId };
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  // An edit still in the journal, never saved as a revision: the working text the Book brings.
  const edited = store.flushJournalEdit({
    clientEditId: randomUUID(), ...target, baseRevisionId: window.revisionId, blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '合并前',
  }).window;
  const editedBlock = edited.blocks.find((candidate) => candidate.blockId === block.blockId)!;
  store.createEditorialMark({
    ...target, windowStartBlockId: edited.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: edited.revisionId,
    expectedJournalSequence: edited.journalSequence, blockId: block.blockId, baseBlockDigest: editedBlock.digest, fromGrapheme: 0, toGrapheme: 3,
    selectedText: [...editedBlock.text].slice(0, 3).join(''), kind: 'annotation', highlightColor: null, body: '合并时请保留这条批注', proposedText: null, rationale: null,
  });
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
  store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交出版社存档', expectedContentDigest: bundle.content.digest });
  return book;
}

/** What the editor reads of one Book, in the terms every surface reads it. */
function readings(store: EditorialStore, book: { bookId: string; manuscriptId: string; branchId: string }): unknown {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return {
    listed: store.listBooks(null).items.filter((item) => item.bookId === book.bookId).map((item) => ({ ...item })),
    window: { blocks: window.blocks.map((block) => [block.blockId, block.text]), marks: window.marks.map((mark) => [mark.markId, mark.kind, mark.fromGrapheme, mark.toGrapheme]) },
    deliverables: store.inspectBookDeliveryPackage(book.bookId),
    documents: store.inspectProductionDocuments(book.bookId),
  };
}

const storeOf = (dataRoot: string): string => join(dataRoot, 'store', 'ai7.sqlite');

function withAttached<T>(target: string, source: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(storeOf(target));
  try {
    db.prepare('ATTACH DATABASE ? AS src').run(storeOf(source));
    try {
      return run(db);
    } finally {
      db.exec('DETACH DATABASE src');
    }
  } finally {
    db.close();
  }
}

/** A whole-manuscript search run to completion; answers how many times the query is found. */
function found(store: EditorialStore, book: { manuscriptId: string; branchId: string }, query: string): number {
  const created = store.createSearch(book.manuscriptId, book.branchId, query);
  for (;;) {
    const step = store.advanceSearch(created.searchId);
    if (step.done) return step.summary.totalMatches;
  }
}

/** Change a closed store's rows as no product path would: foreign keys off, and the relation's own triggers gone. */
function tamper(dataRoot: string, table: string, change: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(storeOf(dataRoot));
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    const triggers = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?").all(table) as Array<{ name: string }>;
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
    change(db);
  } finally {
    db.close();
  }
}

function titles(store: EditorialStore): string[] {
  return store.listBooks(null).items.map((item) => item.title).sort();
}

describe('合并图书 over two real stores', () => {
  it('names a policy for every relation of the store, and none it does not have', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close();
    const database = new DatabaseSync(storeOf(roots.dataRoot), { readOnly: true });
    try {
      const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
        .map((row) => row.name).sort();
      expect(Object.keys(MERGE_TABLE_POLICY).sort()).toEqual(tables);
    } finally {
      database.close();
    }
  }, 180_000);

  it('merges a Book with every record it owns, beside a Book of the same title, and reads it as the store it came from', async () => {
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    let before: unknown;
    let emptyId: string;
    let foundBefore: number;
    try {
      book = await richBook(source);
      emptyId = emptyBook(source, '空白之书', 'AI7-0001');
      // The rich Book is in a Series here; the Series stays behind.
      const series = source.createSeries({ title: '合并书系', note: '' });
      const membership = source.previewSeriesMembershipChange({ seriesId: series.seriesId, bookId: book.bookId, kind: 'add' });
      source.changeSeriesMembership({ seriesId: series.seriesId, bookId: book.bookId, kind: 'add', previewDigest: membership.previewDigest });
      before = readings(source, book);
      foundBefore = found(source, book, '合并前');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, TITLE);
      emptyBook(target, '本机之书', 'AI7-0001');
    } finally {
      target.close();
    }

    const plan = withAttached(otherRoot, roots.dataRoot, (db) => planMerge(db));
    expect(plan.books.map((entry) => [entry.bookId, entry.title, entry.status, entry.internalNumberCleared])).toEqual([
      [book.bookId, TITLE, 'same-title', false],
      [emptyId, '空白之书', 'new', true],
    ]);
    expect(plan.notices).toEqual(['internal-number', 'series']);
    const keys = withAttached(otherRoot, roots.dataRoot, (db) => (db.prepare(
      `SELECT DISTINCT co.relative_key AS k FROM src.content_objects co JOIN src.source_versions sv ON sv.object_digest = co.object_digest
       WHERE sv.book_id = ?`,
    ).all(book.bookId) as Array<{ k: string }>).map((row) => row.k));
    expect(keys.length).toBeGreaterThan(0);
    const snapshots = withAttached(otherRoot, roots.dataRoot, (db) => (db.prepare(
      'SELECT object_relative_key AS k FROM src.recovery_snapshots WHERE book_id = ?').all(book.bookId) as Array<{ k: string }>).map((row) => row.k));
    expect(snapshots.length).toBeGreaterThan(0);
    const counts = withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId, emptyId], { source: roots.dataRoot, target: otherRoot }));
    expect(counts.books).toBe(2);
    expect(counts.rows).toBeGreaterThan(50);
    expect(counts.files).toBeGreaterThan(0);
    // The stored files the Book's Source Versions and its milestone name came with it.
    for (const key of keys) expect(existsSync(join(otherRoot, 'objects', ...key.split('/')))).toBe(true);
    for (const key of snapshots) expect(existsSync(join(otherRoot, 'recovery-objects', ...key.split('/')))).toBe(true);

    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, TITLE, '本机之书', '空白之书'].sort());
      expect(readings(target, book)).toEqual(before);
      // Its working text is searchable as it was, and its Series stayed behind.
      expect(found(target, book, '合并前')).toBe(foundBefore);
      expect(foundBefore).toBeGreaterThan(0);
      expect(target.inspectSeriesList().series).toEqual([]);
      expect(target.inspectBookSeries(book.bookId).memberships).toEqual([]);
      // A 内部编号 already another Book's here is not taken.
      expect(target.listBooks(null).items.filter((item) => item.title === '空白之书').map((item) => item.internalNumber)).toEqual([null]);
      expect(target.listBooks(null).items.filter((item) => item.title === '本机之书').map((item) => item.internalNumber)).toEqual(['AI7-0001']);
      // A Book already here is not taken again, and nothing changes.
      const again = <T>(run: (db: DatabaseSync) => T): T => withAttached(otherRoot, roots.dataRoot, run);
      target.close();
      const replan = again((db) => planMerge(db));
      expect(replan.books.map((entry) => entry.status)).toEqual(['present', 'present']);
      expect(() => again((db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
        .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_BOOK_PRESENT' }) as unknown as Error);
      // Nor is a Book whose id is here under another identity: it is refused before anything goes in, not inserted twice.
      const probe = join(dirname(otherRoot), 'probe-data');
      mkdirSync(join(probe, 'store'), { recursive: true });
      again((db) => db.prepare('VACUUM main INTO ?').run(storeOf(probe)));
      tamper(probe, 'books', (db) => db.prepare('UPDATE books SET stable_identity = ? WHERE book_id = ?').run(randomUUID(), book.bookId));
      expect(() => withAttached(probe, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: probe })))
        .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_BOOK_PRESENT' }) as unknown as Error);
      target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(titles(target)).toEqual([TITLE, TITLE, '本机之书', '空白之书'].sort());
    } finally {
      target.close();
    }
    // The store the Book came from is untouched by the merge.
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(readings(source, book)).toEqual(before);
    } finally {
      source.close();
    }
  }, 180_000);

  it('leaves the store as it was when a merge cannot finish', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    try {
      book = await importBook(source, await compose(TITLE, [1, 2]));
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    target.close();
    // The file a Source Version names is gone from where the merge takes it.
    const key = withAttached(otherRoot, roots.dataRoot, (db) =>
      (db.prepare('SELECT relative_key FROM src.content_objects LIMIT 1').get() as { relative_key: string }).relative_key);
    await rm(join(roots.dataRoot, 'objects', ...key.split('/')));
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
      .toThrowError(DatabaseMergeError);
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([]);
    } finally {
      target.close();
    }
  }, 180_000);
});

const T = new Date(2026, 8, 26, 10, 0, 0);
const LATER = new Date(2026, 8, 26, 11, 0, 0);

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

/** 导出数据库 of the store, into the input root. */
async function exportedFrom(store: EditorialStore, name: string): Promise<string> {
  const destination = join(roots.inputRoot, name);
  const preparation = await store.prepareDatabaseExport(destination, true);
  expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
  return destination;
}

describe('只导入其中的图书 over the store', () => {
  it('previews each Book as the merge would take it, merges at the next open onto the data as it is then, and records it', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    let before: unknown;
    let packagePath: string;
    try {
      book = await richBook(source);
      emptyBook(source, '空白之书');
      before = readings(source, book);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '空白之书');
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.books.map((entry) => [entry.title, entry.status])).toEqual([[TITLE, 'new'], ['空白之书', 'same-title']]);
      expect(preview.mergeNotices).toEqual([]);
      const waiting = await target.prepareDatabaseMerge(preview.previewId, T);
      expect(waiting.pending).toMatchObject({
        kind: 'merge', packageFileName: 'AI7 数据库.ai7db', backupFileName: preMergeBackupFileName(T),
        mergeBooks: [{ title: TITLE, status: 'new' }, { title: '空白之书', status: 'same-title' }], mergeNotices: [],
      });
      const backup = unzipSync(await readFile(join(`${otherRoot}-backups`, preMergeBackupFileName(T))));
      expect(parseCanonicalJson(strFromU8(backup['manifest.json']!))).toMatchObject({ origin: 'pre-merge-backup', contents: { books: 1 } });
      // A change made after the merge was prepared stays: the merge is applied onto the data as it is at the next open.
      emptyBook(target, '准备合并之后');
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, '准备合并之后', '空白之书', '空白之书'].sort());
      expect(readings(target, book)).toEqual(before);
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      const recorded = await target.inspectDatabaseReplacements();
      expect(recorded).toMatchObject({ pending: null, total: 1, rollBackOf: null });
      expect(recorded.replacements[0]).toMatchObject({
        kind: 'merge', outcome: 'applied', packageFileName: 'AI7 数据库.ai7db', backupFileName: preMergeBackupFileName(T),
        mergedTitles: [TITLE, '空白之书'], backupPresent: true,
      });
      // A file whose Books are all here has nothing to merge.
      const again = await target.inspectDatabaseImport(packagePath);
      expect(again.books.map((entry) => entry.status)).toEqual(['present', 'present']);
      expect(code(await target.prepareDatabaseMerge(again.previewId, LATER).catch((error: unknown) => error))).toBe('DATABASE_MERGE_NOTHING');
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it('writes the backup before a merge alone in the backup location, beside 定期自动备份 (Issue #434, S86d restack)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      emptyBook(source, '空白之书');
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const tomorrow = new Date(T.getTime() + 25 * 60 * 60 * 1000);
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      await target.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await target.runScheduledBackupIfDue(T)).toBe(true);
      const preview = await target.inspectDatabaseImport(packagePath);
      // While the backup before the merge is being made, a 定期自动备份 check starts nothing: no sweep, no backup.
      const preparing = target.prepareDatabaseMerge(preview.previewId, LATER);
      expect(await target.runScheduledBackupIfDue(tomorrow)).toBe(false);
      expect((await preparing).pending).toMatchObject({ kind: 'merge', backupFileName: preMergeBackupFileName(LATER) });
      // Once it is written, the check runs as ever: a merge keeps what is saved before AI7 starts again, so nothing waits on it.
      expect(target.replacementWaiting()).toBe(false);
      expect(await target.runScheduledBackupIfDue(tomorrow)).toBe(true);
      const names = await readdir(`${otherRoot}-backups`);
      expect([names.includes(preMergeBackupFileName(LATER)), names.filter((name) => name.includes('.partial'))]).toEqual([true, []]);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('leaves the data as it was when the merge cannot finish at the next open, and merges once however it is interrupted', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // The files the merged Source Version names are gone from the staged package: the merge cannot finish.
    const incoming = join(replacementStagingFor(otherRoot), 'incoming');
    await rm(join(incoming, 'objects'), { recursive: true, force: true });
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', mergedTitles: [TITLE] });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      // Prepared again, and interrupted after its transaction committed: the next open finds the Book there and merges nothing twice.
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, LATER);
    } finally {
      target.close();
    }
    const staging = replacementStagingFor(otherRoot);
    const intent = JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string };
    const bookIds = (parseCanonicalJson(intent.json) as { mergeBooks: Array<{ bookId: string }> }).mergeBooks.map((entry) => entry.bookId);
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), bookIds)).toBe('merged');
    await writeFile(join(staging, 'phase.json'), JSON.stringify('merging'));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, '本机之书'].sort());
      const recorded = await target.inspectDatabaseReplacements();
      expect(recorded.replacements.map((entry) => [entry.kind, entry.outcome])).toEqual([['merge', 'applied'], ['merge', 'failed']]);
      expect(existsSync(staging)).toBe(false);
      expect((await readdir(`${otherRoot}-backups`)).filter((name) => name.startsWith('AI7 合并前备份 ')).length).toBe(2);
    } finally {
      target.close();
    }
  }, 180_000);
});

describe('what a merge refuses, puts back and brings forward', () => {
  it('refuses a Book whose records reference a Book not chosen', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string };
    let otherId: string;
    try {
      book = await richBook(source);
      otherId = emptyBook(source, '另一本');
    } finally {
      source.close();
    }
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    target.close();
    // One of its marks names the other Book.
    tamper(roots.dataRoot, 'editorial_marks', (db) => db.prepare('UPDATE editorial_marks SET book_id = ? WHERE book_id = ?').run(otherId, book.bookId));
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
      .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_CROSS_BOOK' }) as unknown as Error);
  }, 180_000);

  it('puts the store back when the merged data will not open at the next open', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const book = await importBook(source, await compose(TITLE, [1, 2]));
      await importSource(source, book.bookId, await compose('新闻稿初稿', [21, 22]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // The staged package loses the commits its imports were recorded by, which no foreign key names: the merge commits, and the
    // data it leaves fails the store's own check of its import records at the next open.
    const incoming = join(replacementStagingFor(otherRoot), 'incoming');
    tamper(incoming, 'import_commits', (db) => db.exec('DELETE FROM import_commits'));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed' });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it('brings a package made at an older revision to this one before it merges', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
    } finally {
      source.close();
    }
    // The package as an AI7 one revision older would have made it: its store without revision 58's relation.
    const older = join(roots.inputRoot, 'older.sqlite');
    copyFileSync(storeOf(roots.dataRoot), older);
    const packagePath = join(roots.inputRoot, 'AI7 旧版数据库.ai7db');
    const db = new DatabaseSync(older);
    try {
      db.exec('DROP TABLE database_merges; PRAGMA user_version = 57;');
      await writeDatabasePackage(db, roots.dataRoot, packagePath, () => ({
        dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 57, createdAt: T.toISOString(), origin: 'database-export',
        contents: { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 },
      }));
    } finally {
      db.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.schemaRevision, preview.compatibility, preview.books.map((entry) => entry.status)]).toEqual([57, 'compatible', ['new']]);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE]);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied', mergedTitles: [TITLE] });
    } finally {
      target.close();
    }
  }, 180_000);

  it('previews a file whose store does not read, offering no Book to merge', async () => {
    const store = 'not a database';
    const manifest = canonicalRecord({
      schema: 'ai7.database-package/1', dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 58, createdAt: T.toISOString(),
      origin: 'database-export', contents: { books: 0, sourceVersions: 0, libraryMaterials: 0, series: 0 }, credentials: 'excluded',
      members: [{ path: 'store/ai7.sqlite', bytes: strToU8(store).byteLength, sha256: sha256Hex(store) }],
    });
    const packagePath = join(roots.inputRoot, '坏数据库.ai7db');
    await writeFile(packagePath, zipSync({ 'store/ai7.sqlite': strToU8(store), 'manifest.json': strToU8(manifest.json) }, { mtime: fixedArchiveTime() }));
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.compatibility, preview.books, preview.mergeNotices]).toEqual(['compatible', [], []]);
      await expect(target.prepareDatabaseMerge(preview.previewId, T)).rejects.toBeInstanceOf(Error);
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);
});
