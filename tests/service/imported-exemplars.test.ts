import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { readWritingExemplarWords } from '../../src/service/writing-tasks.js';
import { readImportedExemplar, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY, IMPORTED_EXEMPLAR_SCHEMA_SQL } from '../../src/service/imported-exemplars.js';
import { buildManuscriptPackage } from '../../src/service/text-manuscript.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, importSample1Book } from '../support/sample1-baseline.js';
import { mergeBooks, planMerge } from '../../src/service/database-merge.js';
import type { ImportedExemplarInput } from '../../src/shared/protocol.js';

// All imported exemplars are synthetic and live outside the checkout. The consumer harness uses admitted sample1; no Provider is called.
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-earlier-exemplars-'); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); });
afterEach(async () => { store.markCleanShutdown(); store.close(); await roots.dispose(); });
const people = { bookTitle: '以前出版的测试图书', authors: ['测试作者甲', '测试作者乙'], editors: ['测试责编'] };
const sentence = '这是一份测试用的新闻稿，介绍一本虚构图书及它的读者。';
async function input(text = sentence, extension = 'txt'): Promise<ImportedExemplarInput> {
  const path = join(roots.inputRoot, `${randomUUID()}.${extension}`);
  await writeFile(path, extension === 'docx' ? buildManuscriptPackage([{ lines: [text] }]) : text);
  const preview = await store.previewImportedExemplar(path);
  expect(preview.excerpt).toContain(text.replace(/^# /u, ''));
  return { previewId: preview.previewId, bookId: null, ...people, typeId: 'news-release', expectedVersion: 0 };
}
async function projectBook(): Promise<string> {
  // Exact admitted sample1 is required by the existing provider-free writing harness; every exemplar stays synthetic.
  const result = await importSample1Book(store, roots.codeRoot, 'AI7 测试项目');
  await pinEditorialWorkspaceProfileRevision2(store, result.bookId);
  recordMissingCredentialConnection(store, '测试连接');
  return result.bookId;
}
function db(): DatabaseSync { return new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite')); }

describe('earlier published Books in 范例', () => {
  it('pages imported and AI7 publication provenance together without skipping duplicate titles', async () => {
    const imported = await importSample1Book(store, roots.codeRoot, '第010本');
    const milestone = await store.saveMilestone(imported.manuscriptId, imported.branchId, '一审稿', 'stage-archive', null, '');
    store.designatePublicationVersion({ bookId: imported.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '测试通过' });
    for (let index = 0; index < 21; index += 1) {
      await store.importEarlierExemplar({ ...await input(), bookTitle: `第${String(index).padStart(3, '0')}本` });
    }
    const first = store.inspectExemplars(null);
    expect(first.books).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const rest = store.inspectExemplars(first.nextCursor);
    expect(rest.books).toHaveLength(2);
    expect(rest.nextCursor).toBeNull();
    const all = [...first.books, ...rest.books];
    expect(new Set(all.map((book) => book.bookId)).size).toBe(22);
    expect(all.filter((book) => book.bookTitle === '第010本')).toHaveLength(2);
    expect(all.map((book) => book.bookTitle)).toEqual(all.map((book) => book.bookTitle).sort());
    const normalized = await store.importEarlierExemplar({ ...await input(), bookTitle: '  测试  书名  ' });
    expect(normalized.bookTitle).toBe('测试 书名');
    let after = null;
    do { after = store.inspectExemplars(after).nextCursor; } while (after !== null);
  });

  it('upgrades a real revision-68 store additively without changing existing rows', async () => {
    const creation = store.prepareBookCreation('升级前的测试项目', null);
    const existing = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    store.markCleanShutdown(); store.close();
    const database = db();
    try {
      for (const table of Object.keys(IMPORTED_EXEMPLAR_SCHEMA_SQL).reverse()) database.exec(`DROP TABLE ${table}`);
      database.exec('PRAGMA user_version = 68');
    } finally { database.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getBookOverview(existing).book).toMatchObject({ title: '升级前的测试项目' });
    expect(store.inspectExemplars(null).books).toEqual([]);
    const upgraded = db();
    try { expect(upgraded.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION); } finally { upgraded.close(); }
  });

  it.each(['docx', 'txt', 'md'])('imports %s with attribution, without fabricating a Book project, and keeps an exact revision', async (extension) => {
    const imported = await store.importEarlierExemplar(await input(sentence, extension));
    expect(imported).toMatchObject({ imported: true, bookTitle: people.bookTitle, authors: people.authors, editors: people.editors });
    const first = imported.exemplars[0]!;
    expect(first).toMatchObject({ version: 1, typeId: 'news-release', eligibility: 'house-only', imported: { decisions: 1 } });
    const database = db();
    try {
      expect(database.prepare('SELECT count(*) n FROM books').get()!.n).toBe(0);
      expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(readWritingExemplarWords(database, first.revisionId)).toEqual({ text: sentence, excerpt: false });
      expect(() => database.prepare('DELETE FROM earlier_exemplar_versions').run()).toThrow('IMPORTED_EXEMPLAR_LEDGER_IMMUTABLE');
      const value = JSON.parse(String(database.prepare('SELECT canonical_json FROM earlier_exemplar_versions').get()!.canonical_json));
      expect(await readFile(join(roots.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY, value.source.objectKey))).toEqual(await readFile(join(roots.inputRoot, value.source.displayName)));
    } finally { database.close(); }
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.inspectExemplars(null).books).toEqual([imported]);
  });

  it('groups types and versions by explicit identity, defaults each new version to house, and rejects stale writes', async () => {
    const first = await store.importEarlierExemplar(await input());
    const original = first.exemplars[0]!;
    const decision = { revisionId: original.revisionId, revisionDigest: original.revisionDigest, expectedDecisions: 1, choice: 'excluded' as const };
    expect(store.decideImportedExemplar(decision).exemplars[0]!.eligibility).toBe('excluded');
    expect(() => store.decideImportedExemplar(decision)).toThrow('学习准入已改变');
    const secondInput = { ...await input('另一份虚构新闻稿的测试文字。'), bookId: first.bookId, expectedVersion: 1 };
    const second = await store.importEarlierExemplar(secondInput);
    expect(second.exemplars[0]).toMatchObject({ documentId: original.documentId, version: 2, earlierVersions: [1], eligibility: 'house-only' });
    expect(second.exemplars[0]!.revisionDigest).not.toBe(original.revisionDigest);
    await expect(store.importEarlierExemplar({ ...await input(), bookId: first.bookId, expectedVersion: 1 })).rejects.toThrow('范例已添了新版本');
    expect(() => store.decideImportedExemplar({ ...decision, expectedDecisions: 2 })).toThrow('当前范例版本');
    const report = await store.importEarlierExemplar({ ...await input('测试审读报告的意见。'), bookId: first.bookId, typeId: 'readers-report-author' });
    expect(report.exemplars.map((entry) => entry.typeId)).toEqual(['readers-report-author', 'news-release']);
    const database = db();
    try { expect(readWritingExemplarWords(database, original.revisionId)!.text).toBe(sentence); } finally { database.close(); }
    expect(store.inspectExemplars(null).books).toHaveLength(1);
    await store.importEarlierExemplar(await input());
    expect(store.inspectExemplars(null).books).toHaveLength(2); // identical titles do not join identities.
  });

  it('refuses missing attribution, bad type, changed original and unreadable/empty/unsupported input before admission', async () => {
    const request = await input();
    for (const invalid of [{ bookTitle: '' }, { authors: [] }, { editors: [] }, { typeId: 'unknown' }]) {
      await expect(store.importEarlierExemplar({ ...request, ...invalid })).rejects.toThrow();
    }
    const path = join(roots.inputRoot, 'changed.txt');
    await writeFile(path, sentence);
    const preview = await store.previewImportedExemplar(path);
    await writeFile(path, '已被修改的虚构范例。');
    await expect(store.importEarlierExemplar({ ...request, previewId: preview.previewId })).rejects.toThrow('范例文件已改变');
    for (const [name, bytes] of [['empty.txt', ''], ['bad.docx', Uint8Array.of(80, 75, 3, 4)], ['encoding.txt', Uint8Array.of(255, 255)], ['document.pdf', '%PDF-1.4 synthetic']] as const) {
      const refused = join(roots.inputRoot, name);
      await writeFile(refused, bytes);
      await expect(store.previewImportedExemplar(refused)).rejects.toThrow();
    }
    expect(store.inspectExemplars(null).books).toEqual([]);
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    await expect(store.importEarlierExemplar(request)).rejects.toThrow('预览已失效');
  });

  it('offers types to existing consumers, excludes/defer choices, and pins writing words across later imports and Book-only merge', async () => {
    const first = await store.importEarlierExemplar(await input());
    const report = await store.importEarlierExemplar({ ...await input('虚构审稿意见，仅用于选择测试。'), bookId: first.bookId, typeId: 'readers-report-editorial' });
    const bookId = await projectBook();
    expect(store.inspectWritingTask(bookId).types.find((entry) => entry.typeId === 'news-release')!.exemplars.count).toBe(1);
    expect(store.inspectEvaluation(bookId, null).readersReport.exemplars.count).toBe(1);
    const original = first.exemplars[0]!;
    store.decideImportedExemplar({ revisionId: original.revisionId, revisionDigest: original.revisionDigest, expectedDecisions: 1, choice: 'deferred' });
    expect(store.inspectWritingTask(bookId).types.find((entry) => entry.typeId === 'news-release')!.exemplars.count).toBe(0);
    const reportRevision = report.exemplars.find((entry) => entry.typeId === 'readers-report-editorial')!;
    store.decideImportedExemplar({ revisionId: reportRevision.revisionId, revisionDigest: reportRevision.revisionDigest, expectedDecisions: 1, choice: 'excluded' });
    expect(store.inspectEvaluation(bookId, null).readersReport.exemplars.count).toBe(0);
    store.decideImportedExemplar({ revisionId: original.revisionId, revisionDigest: original.revisionDigest, expectedDecisions: 2, choice: 'house' });
    const launch = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    let progress = store.createWritingPreparationWork(bookId, { typeId: 'news-release', audience: '测试读者', channel: '测试渠道', requirements: '简短介绍', materialIds: [] }, launch);
    while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    expect(store.inspectWritingTask(bookId).types.find((entry) => entry.typeId === 'news-release')!.exemplars.count).toBe(1);
    const database = db();
    try {
      const task = JSON.parse(String(database.prepare('SELECT canonical_json FROM writing_tasks').get()!.canonical_json));
      expect(task.exemplarSources[0]).toMatchObject({ revisionId: original.revisionId, version: 1 });
      expect(task.input.exemplars).toEqual([]);
    } finally { database.close(); }
    await store.importEarlierExemplar({ ...await input('第二版虚构新闻稿。'), bookId: first.bookId, expectedVersion: 1 });
    expect(store.inspectWriting(bookId)!.planEnvelope!.digest).toBe(prepared.planEnvelope!.digest);

    const destination = join(roots.inputRoot, 'whole.ai7db');
    const exportPrepared = await store.prepareDatabaseExport(destination, true);
    expect((await store.approveDatabaseExport(exportPrepared.preparationId, true)).outcome).toBe('created');
    const targetRoots = await createServiceTestRoots('ai7-imported-exemplar-merge-');
    let target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
    try {
      target.markCleanShutdown(); target.close();
      store.markCleanShutdown(); store.close();
      const merge = new DatabaseSync(join(targetRoots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        merge.exec('PRAGMA foreign_keys = ON');
        merge.prepare('ATTACH DATABASE ? AS src').run(join(roots.dataRoot, 'store', 'ai7.sqlite'));
        expect(planMerge(merge).notices).toContain('writing-exemplar');
        mergeBooks(merge, [bookId], { source: roots.dataRoot, target: targetRoots.dataRoot });
        expect(merge.prepare('SELECT count(*) n FROM earlier_exemplar_versions').get()!.n).toBe(0);
      } finally { merge.close(); }
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
      recordMissingCredentialConnection(target, '合并后测试连接');
      expect(target.inspectWritingTask(bookId).task!.refusal).toContain('范例');
      expect(target.inspectTaskPlan({ bookId, kind: 'writing', ref: prepared.taskIntent!.taskIntentId }).start.readiness).toBe('unavailable');
      expect(() => target.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest)).toThrow('范例');
    } finally { target.markCleanShutdown(); target.close(); await targetRoots.dispose(); }
  });

  it('detects corrupted immutable revisions rather than silently retargeting a reference', async () => {
    const book = await store.importEarlierExemplar(await input());
    const bookId = await projectBook();
    const database = db();
    try {
      database.exec('DROP TRIGGER earlier_exemplar_versions_no_update');
      database.prepare("UPDATE earlier_exemplar_versions SET canonical_json = '{}' WHERE revision_id = ?").run(book.exemplars[0]!.revisionId);
      expect(() => readImportedExemplar(database, book.exemplars[0]!.revisionId)).toThrow('范例记录无法读取');
    } finally { database.close(); }
    // Every reader of 范例 says so as it says any other unreadable part, rather than failing whole.
    expect(() => store.inspectExemplars(null)).toThrow(expect.objectContaining({ name: 'StoreError', code: 'EXEMPLAR_RECORD_INVALID' }));
    expect(store.inspectWritingTask(bookId).unavailable).toBe('写作任务暂不可用：以前图书的范例记录无法读取。');
  });

  it('keeps each original whole under its digest and sweeps at open what an interrupted or refused import left', async () => {
    const first = await store.importEarlierExemplar(await input());
    const directory = join(roots.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY);
    const [kept] = await readdir(directory);
    await expect(store.importEarlierExemplar({ ...await input('被拒绝的虚构范例。'), bookId: first.bookId, expectedVersion: 0 })).rejects.toThrow('范例已添了新版本');
    await writeFile(join(directory, `.partial-${randomUUID()}`), '中断的写入');
    expect(await readdir(directory)).toHaveLength(3);
    // A damaged original under the digest is replaced by the whole bytes when the same file arrives again.
    await writeFile(join(directory, kept!), '损坏的原件');
    await store.importEarlierExemplar({ ...await input(), bookId: first.bookId, expectedVersion: 1 });
    expect(createHash('sha256').update(await readFile(join(directory, kept!))).digest('hex')).toBe(kept!.slice(0, 64));
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(await readdir(directory)).toEqual([kept]);
  });

  it('carries all exemplar versions and eligibility through full export/replacement and refuses a missing original', async () => {
    const first = await store.importEarlierExemplar(await input());
    const second = await store.importEarlierExemplar({ ...await input('第二版虚构范例。'), bookId: first.bookId, expectedVersion: 1 });
    const current = second.exemplars[0]!;
    const excluded = store.decideImportedExemplar({ revisionId: current.revisionId, revisionDigest: current.revisionDigest, expectedDecisions: 1, choice: 'excluded' });
    const destination = join(roots.inputRoot, 'full.ai7db');
    const prepared = await store.prepareDatabaseExport(destination, true);
    expect((await store.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
    const targetRoots = await createServiceTestRoots('ai7-earlier-exemplar-replace-');
    let target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(destination);
      expect(preview.compatibility).toBe('compatible');
      await target.prepareDatabaseReplacement(preview.previewId, new Date());
      target.markCleanShutdown(); target.close();
      target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
      expect(target.inspectExemplars(null).books).toEqual([excluded]);
      const copied = new DatabaseSync(join(targetRoots.dataRoot, 'store', 'ai7.sqlite'));
      try { expect(readWritingExemplarWords(copied, first.exemplars[0]!.revisionId)!.text).toBe(sentence); } finally { copied.close(); }
    } finally { target.markCleanShutdown(); target.close(); await targetRoots.dispose(); }
    const database = db();
    let objectKey: string;
    try { objectKey = JSON.parse(String(database.prepare('SELECT canonical_json FROM earlier_exemplar_versions WHERE revision_id = ?').get(current.revisionId)!.canonical_json)).source.objectKey; }
    finally { database.close(); }
    await rm(join(roots.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY, objectKey));
    await expect(store.prepareDatabaseExport(join(roots.inputRoot, 'damaged.ai7db'), true)).rejects.toThrow('范例原件 1 个');
  });
});
