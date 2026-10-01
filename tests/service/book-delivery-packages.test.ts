import { randomUUID } from 'node:crypto';
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
import { DECISION_FEEDBACK_SCHEMA_VERSION, PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { PUBLICATION_FORBIDDEN_WORDS, type BookDeliveryPackageProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

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
        ['news-release', false, '尚未创建', 'document'],
        ['promotion-article', false, '尚未创建', 'document'],
        ['review-article', false, '尚未创建', 'document'],
        ['launch-materials', false, '尚未创建', 'document'],
        ['marketing-points', false, '尚未创建', 'document'],
        ['work-records', true, '暂无审阅记录', null],
      ]);
      expect([bundle.ready, bundle.unmet, bundle.versions, bundle.changedSinceLatest]).toEqual([
        false, ['发稿版本', '新闻稿', '宣传文章', '评论文章', '发布会材料', '营销要点'], [], false,
      ]);
      expect(bundle.statement).toBe('图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。');
      const prepare = (purpose: string, digest: string) => store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose, expectedContentDigest: digest });
      expect(code(() => prepare('交出版社存档', bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_NOT_READY');

      // 发稿版本 set; the 新闻稿 made and delivered; the other four types 本书不做.
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
      const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(conditionsOf(bundle)[1]).toEqual(['news-release', false, '尚未交付', 'document']);
      expect(bundle.conditions[1]!.routeLabel).toBe('交付…');
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
        ['news-release', true, '第 1 次交付 · 版本 1', null],
        ['promotion-article', true, '本书不做', null],
        ['review-article', true, '本书不做', null],
        ['launch-materials', true, '本书不做', null],
        ['marketing-points', true, '本书不做', null],
        ['work-records', true, '暂无审阅记录', null],
      ]);
      expect([bundle.ready, bundle.unmet]).toEqual([true, []]);
      expect(bundle.content.included).toEqual([
        { kind: 'publication', label: '发稿版本「一审稿」 · r1', detail: '发稿范围：纸质版首印' },
        { kind: 'document', label: '新闻稿 · 版本 1', detail: '第 1 次交付 · 版本 1 · 宣传部；交付记录 1 条' },
      ]);
      expect(bundle.content.excluded.map((item) => [item.kind, item.label])).toEqual([
        ['not-for-this-book', '宣传文章'], ['not-for-this-book', '评论文章'], ['not-for-this-book', '发布会材料'], ['not-for-this-book', '营销要点'],
        ['exclusion', '备注'], ['exclusion', '资料库原件'], ['exclusion', '中间修订版'],
      ]);
      expect(bundle.content.limitations).toEqual([BOOK_DELIVERY_PACKAGE_WORDS.unavailableRecords]);

      // A purpose within its bound, and the content the editor saw: a stale digest is refused.
      expect(code(() => prepare('   ', bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_PURPOSE_INVALID');
      expect(code(() => prepare('存'.repeat(81), bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_PURPOSE_INVALID');
      expect(code(() => prepare('交出版社存档', 'f'.repeat(64)))).toBe('BOOK_DELIVERY_PACKAGE_CHANGED');

      const v1 = prepare(' 交出版社存档 ', bundle.content.digest);
      expect([v1.outcome, v1.version, v1.package.ready, v1.package.changedSinceLatest]).toEqual(['prepared', 1, true, false]);
      expect(v1.package.versions.map((version) => [version.label, version.purpose, version.current, version.exportHistoryLabel, version.summary, version.technical.priorVersionId]))
        .toEqual([['v1', '交出版社存档', true, '暂无导出记录', '发稿版本「一审稿」 · r1 · 生产文档 1 份 · 本书不做 4 类 · 审阅报告 0 份', null]]);
      // Preparing again with the same content and purpose is v1, unchanged; a new purpose is v2, naming v1.
      expect(prepare('交出版社存档', bundle.content.digest)).toMatchObject({ outcome: 'unchanged', version: 1 });
      const v2 = prepare('交印厂', bundle.content.digest);
      expect([v2.outcome, v2.version]).toEqual(['prepared', 2]);
      expect(v2.package.versions.map((version) => [version.label, version.current, version.purpose])).toEqual([['v2', true, '交印厂'], ['v1', false, '交出版社存档']]);
      expect(v2.package.versions[0]!.packageId).toBe(v1.package.versions[0]!.packageId);
      expect(v2.package.versions[0]!.technical.priorVersionId).toBe(v1.package.versions[0]!.packageVersionId);
      expect(v2.package.versions[1]).toEqual({ ...v1.package.versions[0], current: false });

      // An edit after the delivery: the row still holds, with a notice and a route, and the content moved past v2.
      const window = store.getManuscriptWindow(news.documentId, news.branchId, null);
      const block = window.blocks[0]!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: news.documentId, branchId: news.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（修订）',
      });
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(bundle.conditions[1]).toMatchObject({
        met: true, notice: '交付后有修改：可以再交付，也可以按交付过的版本打包。', route: 'document', routeLabel: '再交付…',
      });
      expect([bundle.ready, bundle.changedSinceLatest]).toEqual([true, true]);
      expect(bundle.content.limitations).toContain('新闻稿：交付后有修改，本包按交付时的版本 1。');
      // Saved and delivered as 版本 2, then 版本 1 delivered once more with no edit: delivering an earlier version is no
      // edit (DELIV-004), so the row reads as the document's card does — no 交付后有修改 — and takes the version last delivered.
      const version2 = (await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId: news.documentId, branchId: news.branchId })).document!.versions[0]!;
      const deliver = (revisionId: string, kind: 'publicity' | 'editorial') => store.recordProductionDocumentDelivery({
        bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId }, recipient: { kind, custom: null }, note: null,
      });
      await deliver(version2.revisionId, 'publicity');
      await deliver(news.versions[0]!.revisionId, 'editorial');
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect(bundle.conditions[1]).toMatchObject({ met: true, stateLabel: '第 3 次交付 · 版本 1', notice: null, route: null });
      expect(bundle.content.limitations.filter((line) => line.includes('交付后有修改'))).toEqual([]);
      // 恢复 of a type takes its row back to unmet.
      store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'marketing-points', notForThisBook: false });
      bundle = store.inspectBookDeliveryPackage(book.bookId);
      expect([bundle.ready, bundle.unmet]).toEqual([false, ['营销要点']]);
      expect(code(() => prepare('交印厂', bundle.content.digest))).toBe('BOOK_DELIVERY_PACKAGE_NOT_READY');

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
      expect((database.prepare('SELECT count(*) count FROM book_delivery_package_versions').get() as { count: number }).count).toBe(2);
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

  it('holds the work records when every Review Run that ran has finished and reported', () => {
    // The work-records row over stand-in readings: a real Run needs a provider fixture, and the row reads only states.
    const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
    try {
      database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
      for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL)) database.exec(sql);
      const bookId = randomUUID();
      database.prepare('INSERT INTO books(book_id) VALUES (?)').run(bookId);
      const report = (version: number) => ({ reportId: randomUUID(), version, digest: String(version).repeat(64).slice(0, 64), generatedAt: '2026-09-24T00:00:00.000Z' });
      let runs: PackageReviewRunReading[] = [];
      const packages = new BookDeliveryPackages(database, {
        publication: () => null,
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
        BOOK_DELIVERY_PACKAGE_WORDS.unavailableRecords,
      ]);
      // Without a 发稿版本 nothing is prepared, whatever else holds.
      expect(bundle.ready).toBe(false);
      expect(bundle.unmet).toEqual(['发稿版本']);
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
      planted.exec(`BEGIN IMMEDIATE;
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DECISION_FEEDBACK_SCHEMA_VERSION);
      expect((after.prepare('SELECT count(*) count FROM book_delivery_package_versions').get() as { count: number }).count).toBe(0);
    } finally {
      after.close();
    }
  }, 120_000);
});
