import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT } from '../../src/service/book-delivery-package-exports.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ANALYSIS_FEEDBACK_SCHEMA_VERSION, PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { PUBLICATION_FORBIDDEN_WORDS, type BookDeliveryPackageExportProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the export of a 图书交付包 version (Issue #416, plan slice S67b; V2-UX-BUNDLE-004,
// DPKG-011, DPKG-013, DPKG-014, EXP-010 to EXP-022) over the real `EditorialStore` on a temporary Agent Data Root. The
// manuscript and the draft a document starts from are composed from exact `sample1`'s paragraphs; files written are
// compared by digest and by the package's own words, and no manuscript text is printed.

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

/** A Book whose package is ready and prepared as v1: 发稿版本 set, the 新闻稿 delivered, the other four types 本书不做. */
async function preparedPackage(store: EditorialStore): Promise<{ bookId: string; title: string; packageVersionId: string }> {
  const book = await importBook(store, await compose('交付包导出组稿', [1, 2, 3, 4]));
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
  return { bookId: book.bookId, title, packageVersionId: prepared.package.versions[0]!.packageVersionId };
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

describe('图书交付包 · 导出 (S67b)', () => {
  it('writes one frozen version into a chosen folder, file by file with receipts, and keeps the history beside the package', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let before: string;
    try {
      const prepared = await preparedPackage(store);
      bookId = prepared.bookId;
      const { title, packageVersionId } = prepared;

      // 导出… reviews the files the version writes: the publication, each delivered document, and the 交付包清单.
      expect(await code(() => store.reviewBookDeliveryPackageExport({ bookId, packageVersionId }, false))).toBe('EXPORT_POLICY_UNAVAILABLE');
      expect(await code(() => store.reviewBookDeliveryPackageExport({ bookId, packageVersionId: randomUUID() }, true))).toBe('BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND');
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId }, true);
      expect([review.versionLabel, review.statement]).toEqual(['v1', BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT]);
      expect(review.files).toEqual([
        { key: 'publication', label: '稿件 · 发稿版本「一审稿」 · r1', fileName: `${title} · 一审稿.docx`, format: 'docx' },
        { key: 'document:news-release', label: '新闻稿 · 版本 1', fileName: `${title} · 新闻稿 · 版本 1.docx`, format: 'docx' },
        { key: 'manifest', label: '交付包清单', fileName: '交付包清单.md', format: 'markdown' },
      ]);
      // The review is the version's own: read again, it is the same to the digest.
      expect(await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId }, true)).toEqual(review);

      // Choosing the folder prepares, and only for exactly the files reviewed, into a folder that holds none of them.
      const folder = join(roots.inputRoot, '交付包导出');
      await mkdir(folder);
      const prepare = (at: string, reviewDigest = review.reviewDigest) =>
        store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, reviewDigest, folder: at }, true);
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

      const first = await prepare(folder);
      expect([first.versionLabel, first.folder, first.state, first.summary, first.filesTruncated, first.stopped])
        .toEqual(['v1', folder, 'prepared', '已准备，尚未导出 · 3 个文件', false, null]);
      expect(outcomesOf(first)).toEqual([
        ['稿件 · 发稿版本「一审稿」 · r1', 'prepared', '已准备', false],
        ['新闻稿 · 版本 1', 'prepared', '已准备', false],
        ['交付包清单', 'prepared', '已准备', false],
      ]);
      expect(await readdir(folder)).toEqual([]);
      // A folder chosen is no export yet: the version's history still reads 暂无导出记录.
      let version = store.inspectBookDeliveryPackage(bookId).versions[0]!;
      expect([version.exportHistoryLabel, version.exports, version.exportsTruncated]).toEqual(['暂无导出记录', [], false]);

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
      version = exported.package.versions[0]!;
      expect([version.exportHistoryLabel, version.exports.map((entry) => [entry.state, entry.summary, entry.folder, entry.fileCount])])
        .toEqual(['已导出 1 次', [['exported', '已导出到所选位置 · 3 个文件', folder, 3]]]);
      expect(version.exports[0]!.revealPreparationId).toBe(exported.export.files[0]!.preparationId);
      expect(version.exports[0]!.exportedAt >= first.createdAt).toBe(true);
      expect(await count('export_receipts')).toBe(3);

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
        '',
        '## 说明',
        '',
        '- 评估记录与定稿的审稿意见：AI7 尚未提供这两类记录，本包不含。',
        '- 图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。',
        '',
      ]);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(manifest).not.toContain(forbidden);

      // Approved once: approving again answers with what it came to and writes nothing.
      const again = await store.approveBookDeliveryPackageExport({ bookId, exportId: first.exportId }, true);
      expect({ ...again.export, stopped: null }).toEqual(exported.export);
      expect(await count('export_receipts')).toBe(3);
      // The files belong to the package's history, never to 交付物's export records.
      expect(store.inspectDeliverables(bookId).exports).toEqual([]);

      // A second export goes to its own folder: the first file is written, then a file put in the folder since stops the
      // rest. The written file stands, the others stay unwritten, and the answer says which file stopped them and why.
      const second = join(roots.inputRoot, '第二次导出');
      await mkdir(second);
      const secondExport = await prepare(second);
      const rival = join(second, review.files[1]!.fileName);
      await writeFile(rival, '另一个程序的文件');
      const stopped = await store.approveBookDeliveryPackageExport({ bookId, exportId: secondExport.exportId }, true);
      expect([stopped.export.state, stopped.export.summary]).toEqual(['incomplete', '已导出 1 个文件，其余 2 个没有写入']);
      expect(stopped.export.stopped).toEqual({ fileName: review.files[1]!.fileName, reason: '所选位置在准备后发生了变化，请重新选择保存位置。' });
      expect(outcomesOf(stopped.export).map(([label, outcome, text]) => [label, outcome, text])).toEqual([
        ['稿件 · 发稿版本「一审稿」 · r1', 'created', '已导出到所选位置'],
        ['新闻稿 · 版本 1', 'not-written', '未写入'],
        ['交付包清单', 'not-written', '未写入'],
      ]);
      expect(await readFile(rival, 'utf8')).toBe('另一个程序的文件');
      expect((await readdir(second)).sort()).toEqual([review.files[0]!.fileName, review.files[1]!.fileName].sort());
      // Nothing retries by itself, and approving again writes nothing more.
      const retried = await store.approveBookDeliveryPackageExport({ bookId, exportId: secondExport.exportId }, true);
      expect([retried.export.state, retried.export.stopped]).toEqual(['incomplete', null]);
      expect(await count('export_receipts')).toBe(4);

      // A file taken before anything was written refuses the approval itself: the export stays prepared.
      const third = join(roots.inputRoot, '第三次导出');
      await mkdir(third);
      const thirdExport = await prepare(third);
      await writeFile(join(third, review.files[0]!.fileName), '另一个程序的文件');
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId, exportId: thirdExport.exportId }, true))).toBe('EXPORT_TARGET_CHANGED');
      version = store.inspectBookDeliveryPackage(bookId).versions[0]!;
      expect([version.exportHistoryLabel, version.exportsTruncated, version.exports.map((entry) => [entry.folder, entry.state, entry.summary])]).toEqual([
        '已导出 2 次', false, [[second, 'incomplete', '已导出 1 个文件，其余 2 个没有写入'], [folder, 'exported', '已导出到所选位置 · 3 个文件']],
      ]);
      expect(await code(() => store.approveBookDeliveryPackageExport({ bookId: randomUUID(), exportId: thirdExport.exportId }, true)))
        .toBe('BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND');

      // The package itself never moved: exporting made no version and changed no content.
      const bundle = store.inspectBookDeliveryPackage(bookId);
      expect([bundle.versions.length, bundle.changedSinceLatest]).toEqual([1, false]);
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(JSON.stringify(bundle)).not.toContain(forbidden);
      before = JSON.stringify(bundle);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The exports and their files are append-only, and a restart reads the history exactly as it was.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      for (const table of ['book_delivery_package_exports', 'book_delivery_package_export_files']) {
        expect(() => database.prepare(`UPDATE ${table} SET canonical_json = '{}'`).run()).toThrow(/BOOK_DELIVERY_PACKAGE_EXPORT_LEDGER_IMMUTABLE/);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrow(/BOOK_DELIVERY_PACKAGE_EXPORT_LEDGER_IMMUTABLE/);
      }
      expect((database.prepare('SELECT count(*) count FROM book_delivery_package_export_files').get() as { count: number }).count).toBe(9);
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
  }, 240_000);

  it('writes the 交付包清单 from the frozen version alone, whatever changes after it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, packageVersionId } = await preparedPackage(store);
      const review = await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId }, true);
      // 恢复 of a type moves the package's content past v1; v1's files and their review stay exactly as they were.
      store.decideProductionDocumentType({ bookId, typeId: 'marketing-points', notForThisBook: false });
      expect(store.inspectBookDeliveryPackage(bookId).changedSinceLatest).toBe(true);
      expect(await store.reviewBookDeliveryPackageExport({ bookId, packageVersionId }, true)).toEqual(review);
      const folder = join(roots.inputRoot, '冻结版本');
      await mkdir(folder);
      const prepared = await store.prepareBookDeliveryPackageExport({ bookId, packageVersionId, reviewDigest: review.reviewDigest, folder }, true);
      const exported = await store.approveBookDeliveryPackageExport({ bookId, exportId: prepared.exportId }, true);
      expect(exported.export.state).toBe('exported');
      expect(exported.export.files.find((file) => file.key === 'manifest')!.outcome).toBe('created');
      expect(await readFile(join(folder, '交付包清单.md'), 'utf8')).toContain('- 本书不做：宣传文章、评论文章、发布会材料、营销要点');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('adds the export relations to a revision-40 store empty', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store, await compose('迁移导出组稿', [1, 2]));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    try {
      planted.exec('PRAGMA foreign_keys = OFF');
      planted.exec(`BEGIN IMMEDIATE;
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(ANALYSIS_FEEDBACK_SCHEMA_VERSION);
      for (const table of ['book_delivery_package_exports', 'book_delivery_package_export_files']) {
        expect((after.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count).toBe(0);
      }
      expect((after.prepare("SELECT count(*) count FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'book_delivery_package_export%'").get() as { count: number }).count).toBe(4);
    } finally {
      after.close();
    }
  }, 120_000);
});
