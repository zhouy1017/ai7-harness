import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL } from '../../src/service/production-document-ledger.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { MAX_EXEMPLAR_BOOKS_PAGE, MAX_EXEMPLAR_EARLIER_VERSIONS } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006) over the real store on a
// temporary Agent Data Root. The manuscripts and the drafts documents start from are composed from exact `sample1`'s
// paragraphs; assertions compare identities, versions and words of 范例's own, and no manuscript text is printed. A Book's
// delivered documents come into 范例 once it has a 发稿版本 — those delivered before it at the designation, and the rest as
// they are delivered — organized by Book and type, eligible 仅本社, and nothing is written by reading it. What a Book delivers
// after a 撤回 waits for another 发稿版本, while what came in before stays; each record is read through its owner, verified;
// and the Books come a page at a time.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-exemplars-');
});

afterEach(async () => {
  await roots.dispose();
});

const span = (block: number): SourceSpan => ({ block });

async function compose(name: string, blocks: ReadonlyArray<number>): Promise<string> {
  const path = join(roots.inputRoot, `${name}.docx`);
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: name, paragraphs: blocks.map((block) => ({ runs: [{ text: span(block) }] })) });
  return path;
}

interface Book { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, path: string, title: string): Promise<Book> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** A Book with a manuscript, a milestone and one 发稿版本; its designation's identity. */
async function designatedBook(store: EditorialStore, name: string, blocks: ReadonlyArray<number>, title: string): Promise<Book & { publicationVersionId: string }> {
  const book = await importBook(store, await compose(name, blocks), title);
  const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '三审稿', 'stage-archive', null, '');
  const { publicationVersionId } = store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
  return { ...book, publicationVersionId };
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

async function importSource(store: EditorialStore, bookId: string, path: string): Promise<string> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.sourceVersionId;
}

describe('知识库 › 范例 over the real store', () => {
  it('brings a Book\'s delivered documents in once it has a 发稿版本, by Book and type, 仅本社, and writes nothing', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, await compose('范例组稿', [1, 2, 3, 4]), '范例之书');
      const other = await importBook(store, await compose('未发稿组稿', [5, 6, 7]), '未发稿之书');
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['作者甲'], editors: ['责编乙'], related: [] });
      // A news release made and delivered before anything is designated: no Book has a 发稿版本, so 范例 is empty.
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      const otherNews = (await store.createProductionDocument({ bookId: other.bookId, typeId: 'news-release', sourceVersionId: await importSource(store, other.bookId, await compose('另一新闻稿', [23, 24])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: other.bookId, documentId: otherNews.documentId, version: { kind: 'saved', revisionId: otherNews.versions[0]!.revisionId },
        recipient: { kind: 'editorial', custom: null }, note: null,
      });
      expect(store.inspectExemplars(null)).toEqual({ books: [], nextCursor: null });

      // 设为发稿版本: the news release delivered before it comes in at the designation; the undesignated Book stays out.
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const designated = store.inspectExemplars(null);
      expect(designated.books.map((entry) => [entry.bookTitle, entry.authors, entry.editors, entry.publicationOrdinal, entry.withdrawn, entry.exemplars.length]))
        .toEqual([['范例之书', ['作者甲'], ['责编乙'], 1, false, 1]]);
      expect(designated.nextCursor).toBeNull();
      const first = designated.books[0]!.exemplars[0]!;
      expect(first).toMatchObject({
        documentId: news.documentId, typeId: 'news-release', typeLabel: '新闻稿', version: 1, deliveredTo: '宣传部', earlierVersionCount: 0, earlierVersions: [], eligibility: 'house-only',
      });
      expect(first.revisionId).toBe(news.versions[0]!.revisionId);
      expect(first.archivedAt).toBe(designated.books[0]!.designatedAt);
      expect(first.archivedAt > first.deliveredAt).toBe(true);

      // A promotion article delivered after the designation comes in as it is delivered; a newer version of the news release
      // delivered later stands in place of the first, which stays named beneath it.
      const article = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'promotion-article', sourceVersionId: await importSource(store, book.bookId, await compose('宣传文章初稿', [31, 32])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: article.documentId, version: { kind: 'saved', revisionId: article.versions[0]!.revisionId },
        recipient: { kind: 'external-media', custom: null }, note: null,
      });
      const working = store.getManuscriptWindow(news.documentId, news.branchId, null);
      const block = working.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: news.documentId, branchId: news.branchId, baseRevisionId: working.revisionId, blockId: block.blockId,
        windowStartBlockId: working.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: working.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔修订〕',
      });
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'current', workingDigest: store.getManuscriptWindow(news.documentId, news.branchId, null).workingDigest },
        recipient: { kind: 'editorial', custom: null }, note: null,
      });
      const later = store.inspectExemplars(null).books[0]!;
      expect(later.exemplars.map((exemplar) => [exemplar.typeLabel, exemplar.version, exemplar.deliveredTo, exemplar.earlierVersions])).toEqual([
        ['新闻稿', 2, '编辑部', [1]],
        ['宣传文章', 1, '外部媒体', []],
      ]);
      expect(later.exemplars.every((exemplar) => exemplar.archivedAt === exemplar.deliveredAt)).toBe(true);
      // Reading it twice answers the same.
      expect(store.inspectExemplars(null)).toEqual(store.inspectExemplars(null));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('takes in nothing a Book delivers after a 撤回 until another 发稿版本, keeps what came in before, and says so', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await designatedBook(store, '撤回组稿', [1, 2, 3], '撤回之书');
      // A news release delivered while the designation stands comes in as it is delivered.
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: await importSource(store, book.bookId, await compose('撤回新闻稿', [21, 22])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      const standing = store.inspectExemplars(null).books[0]!;
      expect([standing.withdrawn, standing.exemplars.map((exemplar) => [exemplar.typeLabel, exemplar.version])]).toEqual([false, [['新闻稿', 1]]]);

      // 撤回 on the Book's only designation: in AI7 it is no longer used for 发稿 (ADR 0040).
      store.recordMaintenanceCase({ bookId: book.bookId, publicationVersionId: book.publicationVersionId, classification: 'withdrawal', reason: '内容有误，AI7 内不再用于发稿', evidence: null });
      // A promotion article delivered after it, and a newer news release, wait; the news release that came in stays.
      const article = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'promotion-article', sourceVersionId: await importSource(store, book.bookId, await compose('撤回宣传文章', [31, 32])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: article.documentId, version: { kind: 'saved', revisionId: article.versions[0]!.revisionId },
        recipient: { kind: 'external-media', custom: null }, note: null,
      });
      const working = store.getManuscriptWindow(news.documentId, news.branchId, null);
      const block = working.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: news.documentId, branchId: news.branchId, baseRevisionId: working.revisionId, blockId: block.blockId,
        windowStartBlockId: working.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: working.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔撤回后修订〕',
      });
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'current', workingDigest: store.getManuscriptWindow(news.documentId, news.branchId, null).workingDigest },
        recipient: { kind: 'editorial', custom: null }, note: null,
      });
      const withdrawn = store.inspectExemplars(null).books[0]!;
      expect(withdrawn).toMatchObject({ bookTitle: '撤回之书', withdrawn: true, publicationOrdinal: 1 });
      expect(withdrawn.exemplars.map((exemplar) => [exemplar.typeLabel, exemplar.version, exemplar.earlierVersionCount])).toEqual([['新闻稿', 1, 0]]);

      // Another 发稿版本: what waited comes in at it, the newer news release in place of the first, which stays named beneath.
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '更正稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版二印', basis: '更正后付印' });
      const again = store.inspectExemplars(null).books[0]!;
      expect(again).toMatchObject({ withdrawn: false, publicationOrdinal: 2 });
      expect(again.exemplars.map((exemplar) => [exemplar.typeLabel, exemplar.version, exemplar.earlierVersions, exemplar.archivedAt === again.designatedAt]))
        .toEqual([['新闻稿', 2, [1], true], ['宣传文章', 1, [], true]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('names the latest earlier versions of an exemplar and counts them all', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await designatedBook(store, '多版组稿', [6, 7], '多版之书');
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: await importSource(store, book.bookId, await compose('多版新闻稿', [25, 26])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      // Each later version edited and delivered as it stands: more earlier versions than the line names.
      const versions = MAX_EXEMPLAR_EARLIER_VERSIONS + 2;
      for (let version = 2; version <= versions; version += 1) {
        const working = store.getManuscriptWindow(news.documentId, news.branchId, null);
        const block = working.blocks.find((candidate) => candidate.kind === 'paragraph')!;
        store.flushJournalEdit({
          clientEditId: randomUUID(), manuscriptId: news.documentId, branchId: news.branchId, baseRevisionId: working.revisionId, blockId: block.blockId,
          windowStartBlockId: working.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: working.journalSequence,
          fromGrapheme: 0, toGrapheme: 0, insertText: `〔第${version}稿〕`,
        });
        await store.recordProductionDocumentDelivery({
          bookId: book.bookId, documentId: news.documentId, version: { kind: 'current', workingDigest: store.getManuscriptWindow(news.documentId, news.branchId, null).workingDigest },
          recipient: { kind: 'editorial', custom: null }, note: null,
        });
      }
      const exemplar = store.inspectExemplars(null).books[0]!.exemplars[0]!;
      expect([exemplar.version, exemplar.earlierVersionCount, exemplar.earlierVersions])
        .toEqual([versions, versions - 1, Array.from({ length: MAX_EXEMPLAR_EARLIER_VERSIONS }, (_, index) => versions - MAX_EXEMPLAR_EARLIER_VERSIONS + index)]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses, as 交付物 does, a Delivery Record that no longer matches its digest', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await designatedBook(store, '校验组稿', [4, 5], '校验之书');
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: await importSource(store, book.bookId, await compose('校验新闻稿', [23, 24])) })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      expect(store.inspectExemplars(null).books[0]!.exemplars).toHaveLength(1);
      // Rewritten behind the ledger's back: 范例 refuses it rather than show it.
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        database.exec('DROP TRIGGER production_document_deliveries_no_update');
        database.exec("UPDATE production_document_deliveries SET canonical_json = canonical_json || ' '");
        database.exec(PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL.production_document_deliveries_no_update!);
      } finally {
        database.close();
      }
      expect(code(() => store.inspectExemplars(null))).toBe('PRODUCTION_DOCUMENT_RECORD_INVALID');
    } finally {
      store.close();
    }
  }, 300_000);

  it('reads the published Books a page at a time by title, and refuses a page start that names no Book', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const titles = Array.from({ length: MAX_EXEMPLAR_BOOKS_PAGE + 1 }, (_, index) => `出版之书 ${String(index + 1).padStart(2, '0')}`);
      // Designated in reverse title order: the pages read by title all the same.
      for (const [index, title] of [...titles].reverse().entries()) await designatedBook(store, `分页组稿 ${index}`, [index + 1], title);
      const first = store.inspectExemplars(null);
      expect(first.books.map((book) => book.bookTitle)).toEqual(titles.slice(0, MAX_EXEMPLAR_BOOKS_PAGE));
      const last = first.books.at(-1)!;
      expect(first.nextCursor).toEqual({ title: last.bookTitle, bookId: last.bookId });
      const second = store.inspectExemplars(first.nextCursor);
      expect(second.books.map((book) => book.bookTitle)).toEqual(titles.slice(MAX_EXEMPLAR_BOOKS_PAGE));
      expect(second.nextCursor).toBeNull();
      expect(code(() => store.inspectExemplars({ title: '出版之书', bookId: 'not-a-book' }))).toBe('EXEMPLAR_CURSOR_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});
