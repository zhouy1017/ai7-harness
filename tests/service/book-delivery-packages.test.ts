import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOOK_DELIVERY_PACKAGE_SCHEMA_SQL,
  BOOK_DELIVERY_PACKAGE_WORDS,
  BookDeliveryPackages,
  type PackageReviewRunReading,
} from '../../src/service/book-delivery-packages.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION, PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { PUBLICATION_FORBIDDEN_WORDS, type BookDeliveryPackageProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

// Service-integration suite (L2) for 图书交付包 (Issue #416, plan slice S67a; V2-UX-BUNDLE-001 to 005, DPKG-007, DPKG-008)
// over the real `EditorialStore` on a temporary Agent Data Root. The manuscript and the draft a document starts from are
// composed from exact `sample1`'s paragraphs; assertions compare identities, states and words of the package's own, and
// no manuscript text is printed.

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

const conditionsOf = (projection: BookDeliveryPackageProjection) =>
  projection.conditions.map((condition) => [condition.typeId ?? condition.key, condition.met, condition.stateLabel, condition.route]);

describe('图书交付包 (S67a)', () => {
  it('lists what is missing with a route, freezes exactly the content read as v1, and makes v2 on any change', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let before: string;
    try {
      const book = await importBook(store, await compose('交付包组稿', [1, 2, 3, 4]));
      bookId = book.bookId;

      // Nothing yet: no 发稿版本, no document of any type, and no review — which leaves nothing unfinished.
      let bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(conditionsOf(bundle)).toEqual([
        ['publication', false, '尚未设发稿版本', 'publication'],
        ['work-records', true, '暂无审阅记录', null],
      ]);
      expect([bundle.ready, bundle.unmet, bundle.versions, bundle.changedSinceLatest]).toEqual([
        false, ['发稿版本'], [], false,
      ]);
      expect(bundle.statement).toBe('图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。');
      const prepare = (purpose: string, digest: string) => store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose, expectedContentDigest: digest });
      expect(code(() => prepare('交出版社存档', bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_NOT_READY');

      // 发稿版本 set; the 新闻稿 made and delivered; the other four types 本书不做.
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect([bundle.ready, bundle.unmet]).toEqual([true, []]);
      // Nothing is itemised as left out (Issue #1639), and a type with no document has no row.
      expect(bundle.content.excluded).toEqual([]);
      const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      // Nobody delivered it: a document with a saved version is ticked by default all the same, and no sentence calls it undelivered.
      expect(conditionsOf(bundle)[1]).toEqual(['news-release', true, '版本 1', null]);
      expect(bundle.documents.map((entry) => [entry.documentId, entry.selectedRevisionId])).toEqual([[news.documentId, news.versions[0]!.revisionId]]);
      expect(bundle.content.limitations).toEqual([]);
      await store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: null,
      });
      for (const typeId of ['promotion-article', 'review-article', 'launch-materials', 'marketing-points']) {
        store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true });
      }
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(conditionsOf(bundle)).toEqual([
        ['publication', true, '发稿版本「一审稿」 · r1', null],
        ['news-release', true, '版本 1', null],
        ['promotion-article', true, '本书不做', null],
        ['review-article', true, '本书不做', null],
        ['launch-materials', true, '本书不做', null],
        ['marketing-points', true, '本书不做', null],
        ['work-records', true, '暂无审阅记录', null],
      ]);
      expect([bundle.ready, bundle.unmet]).toEqual([true, []]);
      expect(bundle.content.included).toEqual([
        { kind: 'publication', label: '发稿版本「一审稿」 · r1', detail: '发稿范围：纸质版首印' },
        { kind: 'document', label: '新闻稿 · 版本 1', detail: null },
      ]);
      // The 不包含 list is gone from what is shown; a Book with no 定稿 评估记录 or 审稿意见 simply has none of either (Issue #429, #1639).
      expect(bundle.content.excluded).toEqual([]);
      expect(bundle.content.limitations).toEqual([]);

      // A purpose within its bound, and the content the editor saw: a stale digest is refused.
      expect(code(() => prepare('   ', bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_PURPOSE_INVALID');
      expect(code(() => prepare('存'.repeat(81), bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_PURPOSE_INVALID');
      expect(code(() => prepare('交出版社存档', 'f'.repeat(64)))).toBe('BOOK_DELIVERY_PACKAGE_CHANGED');

      const v1 = prepare(' 交出版社存档 ', bundle.content.digest);
      expect([v1.outcome, v1.version, v1.package.ready, v1.package.changedSinceLatest]).toEqual(['prepared', 1, true, false]);
      expect(v1.package.versions.map((version) => [version.label, version.purpose, version.current, version.exportHistoryLabel, version.summary, version.technical.priorVersionId]))
        .toEqual([['v1', '交出版社存档', true, '暂无导出记录', '发稿版本「一审稿」 · r1 · 衍生稿件 1 份 · 本书不做 4 类 · 审阅报告 0 份 · 评估记录 0 份 · 审稿意见 0 份', null]]);
      // Preparing again with the same content and purpose is v1, unchanged; a new purpose is v2, naming v1.
      expect(prepare('交出版社存档', bundle.content.digest)).toMatchObject({ outcome: 'unchanged', version: 1 });
      const v2 = prepare('交印厂', bundle.content.digest);
      expect([v2.outcome, v2.version]).toEqual(['prepared', 2]);
      expect(v2.package.versions.map((version) => [version.label, version.current, version.purpose])).toEqual([['v2', true, '交印厂'], ['v1', false, '交出版社存档']]);
      expect(v2.package.versions[0]!.packageId).toBe(v1.package.versions[0]!.packageId);
      expect(v2.package.versions[0]!.technical.priorVersionId).toBe(v1.package.versions[0]!.packageVersionId);
      expect(v2.package.versions[1]).toEqual({ ...v1.package.versions[0], current: false });

      // An edit after the delivery changes nothing the package holds: it holds saved versions, and the edit is not one.
      const window = store.getManuscriptWindow(news.documentId, news.branchId, null);
      const block = window.blocks[0]!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: news.documentId, branchId: news.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（修订）',
      });
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(conditionsOf(bundle)[1]).toEqual(['news-release', true, '版本 1', null]);
      expect([bundle.ready, bundle.changedSinceLatest]).toEqual([true, false]);
      expect(bundle.content.limitations).toEqual([]);
      // Saved as 版本 2 and delivered at 版本 1 only (an older version than the newest saved one): the default takes the NEWEST saved
      // version whatever was delivered (Issue #1639), the option list still offers every saved version, and choosing the older one
      // holds exactly that version.
      const version2 = (await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId: news.documentId, branchId: news.branchId })).document!.versions[0]!;
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(conditionsOf(bundle)[1]).toEqual(['news-release', true, '版本 2', null]);
      expect(bundle.changedSinceLatest).toBe(true);
      expect(bundle.documents.map((entry) => [entry.versions.map((version) => version.label), entry.selectedRevisionId])).toEqual([[['版本 2', '版本 1'], version2.revisionId]]);
      const older = store.inspectBookDeliveryPackage(book.bookId, [{ documentId: news.documentId, revisionId: news.versions[0]!.revisionId }]);
      expect(older.content.included.map((item) => item.label)).toEqual(['发稿版本「一审稿」 · r1', '新闻稿 · 版本 1']);
      expect(older.documents.map((entry) => entry.selectedRevisionId)).toEqual([news.versions[0]!.revisionId]);
      const olderChoice = [{ documentId: news.documentId, revisionId: news.versions[0]!.revisionId }];
      expect(prepare('交印厂', bundle.content.digest)).toMatchObject({ outcome: 'prepared', version: 3 });
      expect(store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交印厂', expectedContentDigest: older.content.digest, documents: olderChoice }))
        .toMatchObject({ outcome: 'prepared', version: 4 });
      // What the older choice froze is that version and no other: preparing it again is the same package.
      expect(store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交印厂', expectedContentDigest: older.content.digest, documents: olderChoice }))
        .toMatchObject({ outcome: 'unchanged', version: 4 });
      // Restoring an optional type changes the preview without blocking the manuscript package.
      store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'marketing-points', notForThisBook: false });
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect([bundle.ready, bundle.unmet]).toEqual([true, []]);
      expect(bundle.conditions.some((condition) => condition.typeId === 'marketing-points')).toBe(false);
      expect(prepare('交印厂', bundle.content.digest)).toMatchObject({ outcome: 'prepared', version: 5 });
      bundle = store.inspectBookDeliveryPackage(book.bookId);

      // No word of the package says it was sent, published or delivered.
      const words = JSON.stringify(bundle);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(words).not.toContain(forbidden);
      before = JSON.stringify(bundle);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The versions are append-only, and a restart reads the package exactly as it was.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(() => database.prepare("UPDATE book_delivery_package_versions SET purpose = '改'").run()).toThrow(/BOOK_DELIVERY_PACKAGE_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM book_delivery_package_versions').run()).toThrow(/BOOK_DELIVERY_PACKAGE_LEDGER_IMMUTABLE/);
      expect((database.prepare('SELECT count(*) count FROM book_delivery_package_versions').get() as { count: number }).count).toBe(5);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.stringify(reopened.inspectBookDeliveryPackage(bookId!))).toBe(before!);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('holds ticked saved versions of derivative documents with no delivery or phase, every one with a saved version ticked by default (Issues #1405, #1639)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, await compose('勾选打包组稿', [1, 2, 3]));
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '定稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const first = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', title: '首发通稿' })).document!;
      const second = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', title: '书展宣传稿' })).document!;
      const legacy = store.inspectBookDeliveryPackage(book.bookId);
      // Without a choice every derivative with a saved version is held at its latest saved version: nothing delivered, and still held.
      expect(legacy.content.included.map((item) => item.kind)).toEqual(['publication', 'document', 'document']);
      expect(legacy.documents.map((entry) => [entry.typeLabel, entry.title, entry.versions.map((version) => version.label), entry.selectedRevisionId]))
        .toEqual([['新闻稿', '首发通稿', ['版本 1'], first.versions[0]!.revisionId], ['新闻稿', '书展宣传稿', ['版本 1'], second.versions[0]!.revisionId]]);
      expect(legacy.content.limitations).toEqual([]);
      const documents = [{ documentId: second.documentId, revisionId: second.versions[0]!.revisionId }];
      const chosen = store.inspectBookDeliveryPackage(book.bookId, documents);
      expect(chosen.content.included.map((item) => [item.kind, item.label])).toEqual([
        ['publication', '发稿版本「定稿」 · r1'], ['document', '新闻稿 · 《书展宣传稿》 · 版本 1'],
      ]);
      expect(chosen.conditions.filter((condition) => condition.key === 'document').map((condition) => [condition.documentId, condition.met, condition.stateLabel, condition.route]))
        .toEqual([[first.documentId, true, '未选入本包', null], [second.documentId, true, '版本 1', null]]);
      expect(chosen.documents.map((entry) => entry.selectedRevisionId)).toEqual([null, second.versions[0]!.revisionId]);
      expect(chosen.content.digest).not.toBe(legacy.content.digest);
      // The digest names the ticked content: preparing with another selection is refused, the same one freezes it.
      expect(code(() => store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交营销', expectedContentDigest: chosen.content.digest })))
        .toBe('BOOK_DELIVERY_PACKAGE_CHANGED');
      const prepared = store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交营销', expectedContentDigest: chosen.content.digest, documents });
      expect([prepared.outcome, prepared.version, prepared.package.changedSinceLatest]).toEqual(['prepared', 1, false]);
      expect(prepared.package.versions[0]!.summary).toContain('衍生稿件 1 份');
      // Only this Book's documents at versions they saved.
      expect(code(() => store.inspectBookDeliveryPackage(book.bookId, [{ documentId: first.documentId, revisionId: second.versions[0]!.revisionId }])))
        .toBe('BOOK_DELIVERY_PACKAGE_SELECTION_INVALID');
      expect(code(() => store.inspectBookDeliveryPackage(book.bookId, [{ documentId: book.manuscriptId, revisionId: second.versions[0]!.revisionId }])))
        .toBe('BOOK_DELIVERY_PACKAGE_SELECTION_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });

  it('reads a package made before Issue #1639 as it was stored: it verifies, its sentences and digest are untouched, and a new package carries none of them', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let legacy: { packageVersionId: string; contentDigest: string; sha256: string };
    try {
      const book = await importBook(store, await compose('旧交付包组稿', [1, 2, 3]));
      bookId = book.bookId;
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '定稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const news = (await store.createProductionDocument({ bookId, typeId: 'news-release', title: '首发通稿' })).document!;
      const first = store.prepareBookDeliveryPackage({ bookId, purpose: '交出版社存档', expectedContentDigest: store.inspectBookDeliveryPackage(bookId).content.digest });
      // A package made now: the derivative is held with no sentence about delivery and no 不会做 list.
      const firstId = first.package.versions[0]!.packageVersionId;
      store.markCleanShutdown();
      store.close();
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const row = database.prepare('SELECT * FROM book_delivery_package_versions WHERE package_version_id = ?').get(firstId) as Record<string, string | number>;
        const record = JSON.parse(String(row['canonical_json'])) as { content: { documents: Array<Record<string, unknown>>; exclusions: string[]; limitations: string[] } };
        expect([record.content.exclusions, record.content.limitations]).toEqual([[], []]);
        // The same package as it was made before: the delivery sentence stored, its three exclusion keys, a record's raw time.
        const content = { ...record.content, exclusions: ['editor-notes', 'library-originals', 'intermediate-revisions'],
          limitations: ['新闻稿：尚未交付，不在包中。', '宣传文章：尚未创建，不在包中。'], documents: record.content.documents.map((entry) => ({ ...entry, deliveryId: randomUUID() })) };
        const forged = { ...record, packageVersionId: randomUUID(), version: 2, priorVersionId: firstId, contentDigest: canonicalRecord(content).digest, content };
        const canonical = canonicalRecord(forged);
        database.prepare(`INSERT INTO book_delivery_package_versions(package_version_id, package_id, book_id, version, prior_version_id, purpose,
          publication_version_id, content_sha256, actor, prepared_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(forged.packageVersionId, row['package_id']!, row['book_id']!, 2, firstId, row['purpose']!, row['publication_version_id']!,
            forged.contentDigest, row['actor']!, row['prepared_at']!, canonical.json, canonical.digest);
        legacy = { packageVersionId: forged.packageVersionId, contentDigest: forged.contentDigest, sha256: canonical.digest };
      } finally {
        database.close();
      }
      void news;
    } catch (error) {
      store.close();
      throw error;
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // Reading verifies each record against its digest: the stored one is read, whole and unchanged.
      const versions = reopened.inspectBookDeliveryPackage(bookId!).versions;
      expect(versions.map((version) => version.label)).toEqual(['v2', 'v1']);
      expect([versions[0]!.packageVersionId, versions[0]!.technical.contentDigest, versions[0]!.technical.digest]).toEqual([legacy!.packageVersionId, legacy!.contentDigest, legacy!.sha256]);
      expect(versions[0]!.preparedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/u);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('offers no derivative that has no saved version, says why in plain words, and holds only the ones that have one (Issue #1639)', () => {
    // Stand-in readings: the store always saves a first version, so a document without one is read from the source directly.
    const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
    try {
      database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
      for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL)) database.exec(sql);
      const bookId = randomUUID();
      database.prepare('INSERT INTO books(book_id) VALUES (?)').run(bookId);
      const saved = (version: number) => ({ version, versionLabel: `版本 ${version}`, revisionId: randomUUID(), revisionDigest: String(version).repeat(64).slice(0, 64), recordedAt: '2026-11-20T08:00:00.000Z' });
      const [v2, v1] = [saved(2), saved(1)];
      const reading = (title: string, versions: ReadonlyArray<ReturnType<typeof saved>>) => ({
        typeId: 'news-release', typeLabel: `新闻稿 · 《${title}》`, notForThisBook: false, multiple: true,
        document: { documentId: randomUUID(), title, changedSinceDelivery: false, deliveries: [], versions },
      });
      const readings = [reading('已有版本', [v2, v1]), reading('尚无版本', [])];
      const packages = new BookDeliveryPackages(database, { publication: () => null, documents: () => readings, reviewRuns: () => [] });
      const bundle = packages.inspect(bookId);
      expect(bundle.documents.map((entry) => [entry.title, entry.selectedRevisionId, entry.versions.map((version) => version.label)])).toEqual([['已有版本', v2.revisionId, ['版本 2', '版本 1']]]);
      expect(bundle.conditions.filter((condition) => condition.key === 'document').map((condition) => [condition.documentId, condition.met, condition.stateLabel]))
        .toEqual([[readings[0]!.document.documentId, true, '版本 2'], [readings[1]!.document.documentId, true, '还没有保存过版本，保存后才能放进交付包']]);
      expect(bundle.content.included.map((item) => item.label)).toEqual(['新闻稿 · 《已有版本》 · 版本 2']);
      expect(bundle.content.limitations).toEqual([]);
      // The one without a version cannot be ticked.
      expect(() => packages.inspect(bookId, [{ documentId: readings[1]!.document.documentId, revisionId: v1.revisionId }]))
        .toThrow(expect.objectContaining({ code: 'BOOK_DELIVERY_PACKAGE_SELECTION_INVALID' }));
    } finally {
      database.close();
    }
  });

  it('discloses unfinished review reports without requiring them for package preparation', () => {
    // The work-records row over stand-in readings: a real Run needs a provider fixture, and the row reads only states.
    const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
    try {
      database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
      for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL)) database.exec(sql);
      const bookId = randomUUID();
      database.prepare('INSERT INTO books(book_id) VALUES (?)').run(bookId);
      const report = (version: number) => ({ reportId: randomUUID(), version, digest: String(version).repeat(64).slice(0, 64), generatedAt: '2026-09-24T00:00:00.000Z' });
      let runs: PackageReviewRunReading[] = [];
      let publication: import('../../src/service/book-delivery-packages.js').PackagePublicationReading | null = null;
      const packages = new BookDeliveryPackages(database, {
        publication: () => publication,
        documents: () => [],
        reviewRuns: () => runs,
      });
      const row = () => packages.inspect(bookId).conditions.find((condition) => condition.key === 'work-records')!;
      const run = (ordinal: number, state: PackageReviewRunReading['state'], reported: PackageReviewRunReading['report']): PackageReviewRunReading =>
        ({ reviewRunId: randomUUID(), ordinal, label: `第 ${ordinal} 次`, state, report: reported });

      runs = [run(1, 'running', null)];
      expect(row()).toMatchObject({ met: false, stateLabel: '第 1 次审阅正在进行', route: 'review', routeLabel: '前往审阅' });
      runs = [run(1, 'settled', null)];
      expect(row()).toMatchObject({ met: false, stateLabel: '第 1 次审阅尚未生成报告', route: 'review' });
      // A Run that never started is no work record; a partial and a failed one are, through their reports.
      runs = [run(1, 'settled', report(2)), run(2, 'partial', report(1)), run(3, 'failed', report(1)), run(4, 'prepared', null)];
      expect(row()).toMatchObject({ met: true, stateLabel: '审阅报告 3 份', route: null });
      const bundle = packages.inspect(bookId);
      expect(bundle.content.included.map((item) => item.label)).toEqual([
        '审阅报告 · 第 3 次审阅 · 第 1 版', '审阅报告 · 第 2 次审阅 · 第 1 版', '审阅报告 · 第 1 次审阅 · 第 2 版',
      ]);
      expect(bundle.content.limitations).toEqual([
        '第 2 次审阅部分完成，报告按它的实际结果写出。',
        '第 3 次审阅未能完成，报告写明了原因。',
        '第 4 次审阅没有开始，不在包中。',
      ]);
      runs = [run(1, 'running', null), run(2, 'settled', null)];
      expect(packages.inspect(bookId).content.limitations).toEqual([
        '第 1 次审阅正在进行，尚无当前报告，不在包中。',
        '第 2 次审阅尚未生成当前报告，不在包中。',
      ]);
      // Without a 发稿版本 nothing is prepared, whatever else holds.
      expect(bundle.ready).toBe(false);
      expect(bundle.unmet).toEqual(['发稿版本']);
      publication = { publicationVersionId: randomUUID(), ordinal: 1, milestoneId: randomUUID(), milestoneLabel: '交付候选', revisionId: randomUUID(), revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), scope: '公开样书', basis: '本机编辑选择', changedSince: false, withdrawn: false };
      database.exec('CREATE TABLE publication_versions (publication_version_id TEXT, created_at TEXT)');
      database.prepare('INSERT INTO publication_versions VALUES (?, ?)').run(publication.publicationVersionId, '2026-09-24T00:00:00.000Z');
      const available = packages.inspect(bookId);
      expect([available.ready, available.unmet]).toEqual([true, []]);
      expect(packages.prepare({ bookId, purpose: '交付候选', expectedContentDigest: available.content.digest })).toMatchObject({ outcome: 'prepared', version: 1 });
    } finally {
      database.close();
    }
  });

  it('adds the package versions to a revision-38 store empty', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store, await compose('迁移交付包组稿', [1, 2]));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
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
        DROP TABLE production_document_phase_transitions;
        DROP TABLE production_document_workflow_instances;
        DROP TABLE book_delivery_package_versions;
        PRAGMA user_version = ${PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION};
        COMMIT;`);
      downgradeKindCoupledRelations(planted, ANALYSIS_LEDGER_REVISION_58_SQL);
      planted.exec('PRAGMA foreign_keys = ON');
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      expect((after.prepare('SELECT count(*) count FROM book_delivery_package_versions').get() as { count: number }).count).toBe(0);
    } finally {
      after.close();
    }
  }, 120_000);
});
