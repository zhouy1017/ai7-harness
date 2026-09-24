import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006) over the real store on a
// temporary Agent Data Root. The manuscripts and the drafts documents start from are composed from exact `sample1`'s
// paragraphs; assertions compare identities, versions and words of 范例's own, and no manuscript text is printed. A Book's
// delivered documents come into 范例 once it has a 发稿版本 — those delivered before it at the designation, and the rest as
// they are delivered — organized by Book and type, eligible 仅本社, and nothing is written by reading it.

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
      expect(store.inspectExemplars()).toEqual({ books: [] });

      // 设为发稿版本: the news release delivered before it comes in at the designation; the undesignated Book stays out.
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const designated = store.inspectExemplars();
      expect(designated.books.map((entry) => [entry.bookTitle, entry.authors, entry.editors, entry.publicationOrdinal, entry.exemplars.length]))
        .toEqual([['范例之书', ['作者甲'], ['责编乙'], 1, 1]]);
      const first = designated.books[0]!.exemplars[0]!;
      expect(first).toMatchObject({ documentId: news.documentId, typeId: 'news-release', typeLabel: '新闻稿', version: 1, deliveredTo: '宣传部', earlierVersions: [], eligibility: 'house-only' });
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
      const later = store.inspectExemplars().books[0]!;
      expect(later.exemplars.map((exemplar) => [exemplar.typeLabel, exemplar.version, exemplar.deliveredTo, exemplar.earlierVersions])).toEqual([
        ['新闻稿', 2, '编辑部', [1]],
        ['宣传文章', 1, '外部媒体', []],
      ]);
      expect(later.exemplars.every((exemplar) => exemplar.archivedAt === exemplar.deliveredAt)).toBe(true);
      // Reading it twice answers the same.
      expect(store.inspectExemplars()).toEqual(store.inspectExemplars());
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});
