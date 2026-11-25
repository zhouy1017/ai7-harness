import { writeModelRoleChoice } from '../../src/service/model-service-connections.js';
import { launchLocalForSnapshot, inspectLaunchSnapshots } from '../support/task-launch.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { mkdir, rm, copyFile, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, afterEach, beforeEach, describe, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { canonicalRecord, parseCanonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { extractReplacement, preReplaceBackupFileName, replacementStagingFor } from '../../src/service/database-replacement.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { MAX_DATABASE_REPLACEMENTS_LISTED, FACTUAL_REVIEW_TASK_GOAL, BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
} from '../support/sample1-baseline.js';
import { DATABASE_REPLACEMENT_TRIGGER_SQL, readPendingReplacement, writeReplacementIntent, type ReplacementIntent } from '../../src/service/database-replacement.js';

const sourceRead = vi.hoisted(() => ({ path: null as string | null, atEnd: null as (() => Promise<void>) | null }));
/** While set, every write into a file opened under this directory fails as a full disk fails. */
const noSpace = vi.hoisted(() => ({ under: null as string | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const open: typeof actual.open = async (...args) => {
    const handle = await actual.open(...args);
    if (noSpace.under !== null && typeof args[0] === 'string' && args[0].startsWith(noSpace.under)) {
      const full = (): Promise<never> =>
        Promise.reject(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC', errno: -28, syscall: 'write' }));
      handle.writeFile = full as typeof handle.writeFile;
      handle.write = full as typeof handle.write;
    }
    if (args[0] === sourceRead.path) {
      const read = handle.read.bind(handle);
      handle.read = ((...readArgs: Parameters<typeof read>) => read(...readArgs).then(async (result) => {
        if (result.bytesRead === 0) await sourceRead.atEnd?.();
        return result;
      })) as typeof handle.read;
    }
    return handle;
  };
  return { ...actual, open, default: { ...actual, open } };
});

// Service-integration suite (L2) for 导入数据库 and 替换本机全部数据 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3,
// §1.4) over the real store: the preview of a package the store exported — origin, versions, contents, every member verified —
// with nothing taken from it; the replacement, which backs the data up first and waits for the next open; the next open, which
// brings the package's data in and records it there; the roll-back to the backup, the same way; a cancelled replacement; data
// that will not open, which leaves the data as it was and says so; the refusals; the ledger refusing to be rewritten; and
// revision 57 added to a revision-56 store.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-database-replacement-');
});

afterEach(async () => {
  sourceRead.path = null;
  sourceRead.atEnd = null;
  await roots.dispose();
});

const T = new Date(2026, 8, 25, 10, 0, 0);
const LATER = new Date(2026, 8, 25, 11, 0, 0);
const contents = { books: 1, sourceVersions: 0, libraryMaterials: 0, series: 0 };

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

function createBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

function titles(store: EditorialStore): string[] {
  return store.listBooks(null).items.map((book) => book.title).sort();
}

/** 导出数据库 of the store as it is, into the input root. */
async function exported(store: EditorialStore, name: string): Promise<string> {
  const destination = join(roots.inputRoot, name);
  const preparation = await store.prepareDatabaseExport(destination, true);
  expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
  return destination;
}

/** A package made by hand from a store of the given shape, at the given versions. */
async function handmade(name: string, dataVersion: number, schemaRevision: number): Promise<string> {
  const other = join(roots.inputRoot, `${name}-data`);
  mkdirSync(join(other, 'objects'), { recursive: true });
  if (schemaRevision >= 55) {
    (await EditorialStore.open(other, roots.codeRoot)).close();
  }
  const database = new DatabaseSync(schemaRevision >= 55 ? join(other, 'store', 'ai7.sqlite') : ':memory:');
  try {
    if (schemaRevision < 55) database.exec('CREATE TABLE marker (value TEXT) STRICT;');
    database.exec(`PRAGMA user_version = ${schemaRevision};`);
    const path = join(roots.inputRoot, name);
    await writeDatabasePackage(database, other, path, () => ({
      dataVersion, softwareVersion: '0.1.0', schemaRevision, createdAt: T.toISOString(), origin: 'database-export', contents,
    }));
    return path;
  } finally {
    database.close();
  }
}

const backups = (): string => `${roots.dataRoot}-backups`;

describe('导入数据库 over the real store', () => {
  it('replaces all model choices with the exported roles, without retaining destination overrides (#1650)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const connection = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
      store.selectMainRoleModel('anthropic-claude', 'claude-opus-5-5', 'high');
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        writeModelRoleChoice(db, 'underlying-pro', { connectionId: connection.connectionId, modelId: 'claude-sonnet-5-5', reasoningEffort: 'xhigh' });
        writeModelRoleChoice(db, 'underlying-flash', { connectionId: connection.connectionId, modelId: 'claude-opus-5-5', reasoningEffort: 'low' });
      } finally { db.close(); }
      const original = store.getModelRoles();
      const source = await exported(store, 'role-choices.ai7db');
      store.selectFastRoleModel('anthropic-claude', 'claude-fable-5-1');
      store.selectMainRoleModel('anthropic-claude', 'claude-sonnet-5', 'off');
      expect(store.getModelRoles()).not.toEqual(original);
      const preview = await store.inspectDatabaseImport(source);
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getModelRoles()).toEqual(original);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('retains custom versions and their stop state through public database replacement (#1170)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '本社工序合成图书');
      const original = store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'writing')!;
      const input = { procedureId: null, basedOn: { procedureId: original.procedureId, version: original.version, digest: original.digest },
        title: '替换保留的工序', editorInstruction: '保留作者语气', stages: original.document.stages };
      const created = store.procedureLibrary({ action: 'save', input }).procedures.find((entry) => entry.document.title === input.title)!;
      const procedure = { procedureId: created.procedureId, version: created.version, digest: created.digest };
      store.procedureLibrary({ action: 'stop', procedure });
      const preview = await store.inspectDatabaseImport(await exported(store, 'procedure-replacement.ai7db'));
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === procedure.procedureId))
        .toMatchObject({ ...procedure, document: created.document, stopped: true });
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('retains selected v1 Plan metadata through database replacement', async () => {
    const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-factual-authored');
    const control = { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } };
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, control);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '合成策略包');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId); recordMissingCredentialConnection(store, '合成本地计划连接');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      let work = store.createFactualReviewPreparationWork(book.bookId, FACTUAL_REVIEW_TASK_GOAL, policy);
      while (!work.done) work = store.advanceFactualReviewPreparationWork(work.workId!);
      const original = work.projection!.providerResolutionPlan!;
      expect(original.selectedPolicyIdentity).toEqual(policy.selectedPolicyIdentity);
      expect(original.localFixtureProfile).toBeUndefined();
      const packagePath = await exported(store, 'selected-v1.ai7db');
      const preview = await store.inspectDatabaseImport(packagePath);
      expect(preview).toMatchObject({ compatibility: 'compatible', schemaRevision: LATEST_SCHEMA_VERSION, dataVersion: 2 });
      await store.prepareDatabaseReplacement(preview.previewId, T); await store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, control);
      expect(store.inspectFactualReview(book.bookId).providerResolutionPlan).toEqual(original);
    } finally { await store.close(); }
  });
  it.each(['suggestions', 'accepted-baseline'] as const)('preserves the whole Word %s layer and original through database export, pre-replace backup, replacement and rollback', async (mode) => {
    const path = join(roots.inputRoot, `word-database-${mode}.docx`);
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: 'Word 数据库沿袭', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } },
        { text: { block: 9, from: 0, to: 5 }, revision: { kind: 'del', author: '作者甲', date: '2026-10-25T00:00:00Z' } },
        { text: { block: 10, from: 0, to: 6 }, revision: { kind: 'ins', author: '作者乙', date: '2026-10-25T00:00:01Z' } }] },
    ] });
    const wordRows = () => {
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { return Object.fromEntries(['word_revision_sources', 'word_revision_imports', 'word_manuscript_source_segments',
        'word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'word_import_mark_sources']
        .map((table) => [table, db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all()])); }
      finally { db.close(); }
    };
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const reviewed = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
      if (reviewed.reviewDigest === null) throw new Error('expected complete Word database fixture');
      const commitId = randomUUID();
      const imported = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: reviewed.draftVersion,
        reviewDigest: reviewed.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const signal = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!;
      if (signal.kind !== 'word-tracked-edit') throw new Error('expected actual Word database source');
      const detailInput = { bookId: imported.bookId, sampleId: signal.source.sampleId, sampleDigest: signal.source.sampleDigest, after: null };
      const detail = await store.inspectWordTrackedEditSample(detailInput);
      const originalRows = wordRows();
      const packagePath = await exported(store, `word-${mode}.ai7db`);
      const localBookId = createBook(store, '替换前另一本空图书');
      store.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('excluded');
      const preview = await store.inspectDatabaseImport(packagePath);
      expect(preview).toMatchObject({ compatibility: 'compatible', contents: { books: 1, sourceVersions: 1 } });
      const waiting = await store.prepareDatabaseReplacement(preview.previewId, T);
      const replacementId = waiting.pending!.replacementId;
      const backup = unzipSync(await readFile(join(backups(), preReplaceBackupFileName(T))));
      expect(parseCanonicalJson(strFromU8(backup['manifest.json']!))).toMatchObject({ origin: 'pre-replace-backup', contents: { books: 2, sourceVersions: 1 } });
      expect(Object.entries(backup).some(([name, bytes]) => name.startsWith('objects/') && sha256Hex(bytes) === signal.source.sourceDigest)).toBe(true);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.listBooks(null).items.map((book) => book.bookId)).toEqual([imported.bookId]);
      expect(wordRows()).toEqual(originalRows);
      expect(await store.inspectWordTrackedEditSample(detailInput)).toEqual(detail);
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('house');
      expect((await store.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ replacementId, outcome: 'applied', backupPresent: true });
      await store.rollBackDatabaseReplacement(replacementId, LATER);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.listBooks(null).items.map((book) => book.bookId).sort()).toEqual([imported.bookId, localBookId].sort());
      expect(wordRows()).toEqual(originalRows);
      expect(await store.inspectWordTrackedEditSample(detailInput)).toEqual(detail);
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('excluded');
      expect((await store.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'roll-back', outcome: 'applied' });
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('extracts the reviewed archive bytes when the selected file changes after its hash pass', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '绑定文件');
      const packagePath = await exported(store, '绑定文件.ai7db');
      const original = await readFile(packagePath);
      const entries = unzipSync(original);
      const manifest = parseCanonicalJson(strFromU8(entries['manifest.json']!)) as Record<string, unknown>;
      entries['manifest.json'] = Buffer.from(canonicalRecord({ ...manifest, softwareVersion: '9.9.9' }).json);
      const replacement = zipSync(entries, { level: 0, mtime: fixedArchiveTime() });
      // Store both equally sized archives uncompressed so the overwrite changes no size checks.
      entries['manifest.json'] = Buffer.from(canonicalRecord(manifest).json);
      const selected = zipSync(entries, { level: 0, mtime: fixedArchiveTime() });
      expect(replacement.byteLength).toBe(selected.byteLength);
      await writeFile(packagePath, selected);
      await store.inspectDatabaseImport(packagePath);
      sourceRead.path = packagePath;
      sourceRead.atEnd = async () => { sourceRead.atEnd = null; await writeFile(packagePath, replacement); };
      const extracted = await extractReplacement(roots.dataRoot, packagePath, sha256Hex(selected));
      expect(extracted.manifest.softwareVersion).toBe(manifest.softwareVersion);
      expect(extracted.sha256).toBe(sha256Hex(selected));
    } finally { store.close(); }
  });

  it.each(['missing', 'corrupt'] as const)('refuses a manifest-consistent package with a %s referenced Book payload', async (damage) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const input = join(roots.inputRoot, '来源.docx');
      await composeRevisedDocx(input, { source: ADMITTED_BASELINE_DOCX, title: '来源检查', paragraphs: [{ runs: [{ text: { block: 21 } }] }] });
      const staged = await store.stageSelectedManuscript(randomUUID(), input);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
      const commitId = randomUUID();
      await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const packagePath = await exported(store, '完整文件.ai7db');
      const positive = await store.inspectDatabaseImport(packagePath);
      expect(positive.compatibility).toBe('compatible');
      const entries = unzipSync(await readFile(packagePath));
      const manifest = parseCanonicalJson(strFromU8(entries['manifest.json']!)) as { members: { path: string; bytes: number; sha256: string }[] };
      const payload = manifest.members.find((member) => member.path.startsWith('objects/'))!;
      expect(payload).toBeDefined();
      if (damage === 'missing') {
        delete entries[payload.path];
        manifest.members = manifest.members.filter((member) => member.path !== payload.path);
      } else {
        entries[payload.path] = Buffer.from('invalid referenced bytes');
        payload.bytes = entries[payload.path]!.byteLength;
        payload.sha256 = sha256Hex(entries[payload.path]!);
      }
      entries['manifest.json'] = Buffer.from(canonicalRecord(manifest).json);
      const damaged = join(roots.inputRoot, `${damage}.ai7db`);
      await writeFile(damaged, zipSync(entries, { mtime: fixedArchiveTime() }));
      const before = titles(store);
      expect(code(await store.inspectDatabaseImport(damaged).catch((error: unknown) => error))).toBe('DATABASE_PACKAGE_DAMAGED');
      expect(titles(store)).toEqual(before);
      expect((await store.inspectDatabaseReplacements()).pending).toBeNull();
      expect(existsSync(backups())).toBe(false);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      expect((await readdir(join(roots.dataRoot, 'export-staging'))).filter((name) => name.startsWith('.'))).toEqual([]);
    } finally { store.close(); }
  });

  it.each(['another revision', 'not SQLite'] as const)('refuses a package whose store member is %s, whatever its manifest says of it (Issue #644)', async (damage) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '仓库成员');
      const packagePath = await exported(store, '仓库成员.ai7db');
      const entries = unzipSync(await readFile(packagePath));
      const manifest = parseCanonicalJson(strFromU8(entries['manifest.json']!)) as { schemaRevision: number; members: { path: string; bytes: number; sha256: string }[] };
      const member = manifest.members.find((candidate) => candidate.path === 'store/ai7.sqlite')!;
      if (damage === 'another revision') {
        // The same store, stamped one revision short of the manifest's: every member still matches its digest.
        const restamped = join(roots.inputRoot, 'restamped.sqlite');
        await writeFile(restamped, entries[member.path]!);
        const database = new DatabaseSync(restamped);
        try {
          database.exec(`PRAGMA user_version = ${manifest.schemaRevision - 1}`);
        } finally { database.close(); }
        entries[member.path] = await readFile(restamped);
      } else {
        entries[member.path] = Buffer.from('这不是一个 SQLite 数据库文件。'.repeat(64));
      }
      member.bytes = entries[member.path]!.byteLength;
      member.sha256 = sha256Hex(entries[member.path]!);
      entries['manifest.json'] = Buffer.from(canonicalRecord(manifest).json);
      const damaged = join(roots.inputRoot, `${damage}.ai7db`);
      await writeFile(damaged, zipSync(entries, { mtime: fixedArchiveTime() }));
      expect(code(await store.inspectDatabaseImport(damaged).catch((error: unknown) => error))).toBe('DATABASE_PACKAGE_DAMAGED');
      expect((await readdir(join(roots.dataRoot, 'export-staging'))).filter((name) => name.startsWith('.'))).toEqual([]);
    } finally { store.close(); }
  });

  it.each(['replace', 'merge'] as const)('refuses to %s with a coded refusal, not the file system\'s, when the disk runs out of space (Issue #644)', async (kind) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '空间不足');
      const packagePath = await exported(store, '空间不足.ai7db');
      const preview = await store.inspectDatabaseImport(packagePath);
      noSpace.under = replacementStagingFor(roots.dataRoot);
      const prepared = kind === 'replace'
        ? store.prepareDatabaseReplacement(preview.previewId, T)
        : store.prepareDatabaseMerge(preview.previewId, T);
      const error = await prepared.catch((caught: unknown) => caught);
      noSpace.under = null;
      expect(code(error)).toBe('DATABASE_REPLACEMENT_NO_SPACE');
      expect((error as Error).message).toContain(kind === 'replace' ? '替换' : '合并');
      expect((await store.inspectDatabaseReplacements()).pending).toBeNull();
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      expect(existsSync(backups())).toBe(false);
      expect(store.replacementFrozen()).toBe(false);
    } finally {
      noSpace.under = null;
      store.close();
    }
  });

  it('keeps a reader copy while an export is prepared, and reclaims abandoned reader files at startup', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '并行读取');
      const packagePath = await exported(store, '已选择.ai7db');
      sourceRead.path = packagePath;
      sourceRead.atEnd = async () => { sourceRead.atEnd = null; await exported(store, '另一次导出.ai7db'); };
      expect((await store.inspectDatabaseImport(packagePath)).contents.books).toBe(1);
      const staging = join(roots.dataRoot, 'export-staging');
      expect((await readdir(staging)).filter((name) => name.startsWith('.'))).toEqual([]);
      store.close();
      const abandoned = `.${randomUUID()}.ai7db`;
      for (const suffix of ['', '.store', '.store-wal', '.store-shm', '.store-journal']) await writeFile(join(staging, `${abandoned}${suffix}`), 'abandoned');
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect((await readdir(staging)).filter((name) => name.startsWith('.'))).toEqual([]);
    } finally { store.close(); }
  });

  it('previews a package, replaces the data after backing it up, and rolls back to that backup', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let replacementId: string;
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      createBook(store, '乙书');

      // The preview: what the file is, where it came from, its versions against this AI7's, what it holds — and nothing taken.
      const preview = await store.inspectDatabaseImport(packagePath);
      expect(preview).toMatchObject({
        fileName: 'AI7 数据库.ai7db',
        source: packagePath,
        origin: 'database-export',
        dataVersion: 2,
        localDataVersion: 2,
        schemaRevision: LATEST_SCHEMA_VERSION,
        compatibility: 'compatible',
        contents: { books: 1, sourceVersions: 0, libraryMaterials: 0, series: 0 },
      });
      expect(preview.members).toBeGreaterThanOrEqual(1);
      expect(preview.byteLength).toBe((await readFile(packagePath)).byteLength);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      expect(await store.inspectDatabaseReplacements()).toEqual({
        pending: null, replacements: [], total: 0, rollBackOf: null, backupLocation: backups(),
      });

      // 替换本机全部数据: the data as it is backed up first, then the replacement waits for the next open.
      const waiting = await store.prepareDatabaseReplacement(preview.previewId, T);
      expect(waiting.pending).toMatchObject({
        kind: 'replace', packageFileName: 'AI7 数据库.ai7db', packageOrigin: 'database-export', backupFileName: preReplaceBackupFileName(T),
        contents: { books: 1, sourceVersions: 0, libraryMaterials: 0, series: 0 }, preparedAt: T.toISOString(),
      });
      expect(waiting.rollBackOf).toBeNull();
      replacementId = waiting.pending!.replacementId;
      const backup = unzipSync(await readFile(join(backups(), preReplaceBackupFileName(T))));
      expect(parseCanonicalJson(strFromU8(backup['manifest.json']!))).toMatchObject({
        origin: 'pre-replace-backup', dataVersion: 2, schemaRevision: LATEST_SCHEMA_VERSION, credentials: 'excluded',
        contents: { books: 2 },
      });
      expect((await readdir(backups())).filter((name) => name.includes('.partial'))).toEqual([]);
      // The data is untouched until then, and one replacement waits at a time; the preview it took is spent.
      expect(titles(store)).toEqual(['乙书', '甲书']);
      expect(code(await store.prepareDatabaseReplacement(preview.previewId, T).catch((error: unknown) => error))).toBe('DATABASE_IMPORT_PREVIEW_STALE');
      const again = await store.inspectDatabaseImport(packagePath);
      expect(code(await store.prepareDatabaseReplacement(again.previewId, LATER).catch((error: unknown) => error))).toBe('DATABASE_REPLACEMENT_PENDING');
      expect(existsSync(join(backups(), preReplaceBackupFileName(LATER)))).toBe(false);
    } finally {
      store.close();
    }

    // The next open brings the package's data in, and records the replacement there.
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.parse(await readFile(join(roots.dataRoot, 'store', 'ai7-data-version.json'), 'utf8')))
        .toMatchObject({ dataVersion: 2, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: store.inspectDataVersion().softwareVersion });
      expect(titles(store)).toEqual(['甲书']);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      const replaced = await store.inspectDatabaseReplacements();
      expect(replaced).toMatchObject({ pending: null, total: 1, rollBackOf: replacementId });
      expect(replaced.replacements[0]).toMatchObject({
        replacementId, kind: 'replace', outcome: 'applied', packageFileName: 'AI7 数据库.ai7db', backupFileName: preReplaceBackupFileName(T),
        preparedAt: T.toISOString(), backupPresent: true,
      });
      // The replaced data works as any other.
      createBook(store, '丙书');
      // 回退 needs its backup: while the file is away, nothing is offered, and the record says the file is not there.
      await rename(join(backups(), preReplaceBackupFileName(T)), join(roots.inputRoot, 'away.ai7db'));
      const away = await store.inspectDatabaseReplacements();
      expect([away.rollBackOf, away.replacements[0]!.backupPresent]).toEqual([null, false]);
      expect(code(await store.rollBackDatabaseReplacement(replacementId, LATER).catch((error: unknown) => error))).toBe('DATABASE_REPLACEMENT_ROLLBACK_STALE');
      await rename(join(roots.inputRoot, 'away.ai7db'), join(backups(), preReplaceBackupFileName(T)));
      // 回退到替换前的数据: the backup waits to replace the data, which is backed up first as well.
      expect(code(await store.rollBackDatabaseReplacement('00000000-0000-4000-8000-000000000001', LATER).catch((error: unknown) => error)))
        .toBe('DATABASE_REPLACEMENT_ROLLBACK_STALE');
      // Frozen from the moment it is asked for, as a replacement is (Issue #434 review).
      const asked = store.rollBackDatabaseReplacement(replacementId, LATER);
      expect(store.replacementFrozen()).toBe(true);
      const rolling = await asked;
      expect(rolling.pending).toMatchObject({ kind: 'roll-back', packageFileName: preReplaceBackupFileName(T), packageOrigin: 'pre-replace-backup',
        backupFileName: preReplaceBackupFileName(LATER), contents: { books: 2 } });
      expect(rolling.rollBackOf).toBeNull();
      expect(existsSync(join(backups(), preReplaceBackupFileName(LATER)))).toBe(true);
    } finally {
      store.close();
    }

    // The next open brings the backup's data back: both Books the replacement took away, and none it brought.
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.parse(await readFile(join(roots.dataRoot, 'store', 'ai7-data-version.json'), 'utf8')))
        .toMatchObject({ dataVersion: 2, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: store.inspectDataVersion().softwareVersion });
      expect(titles(store)).toEqual(['乙书', '甲书']);
      const rolledBack = await store.inspectDatabaseReplacements();
      expect(rolledBack).toMatchObject({ pending: null, total: 1, rollBackOf: null });
      expect(rolledBack.replacements[0]).toMatchObject({
        kind: 'roll-back', outcome: 'applied', packageFileName: preReplaceBackupFileName(T), backupFileName: preReplaceBackupFileName(LATER), backupPresent: true,
      });
      // Both backups stay in the backup location until the editor deletes them.
      expect((await readdir(backups())).sort()).toEqual([preReplaceBackupFileName(T), preReplaceBackupFileName(LATER)].sort());
    } finally {
      store.close();
    }
  }, 180_000);

  it('leaves the data as it is when the replacement is cancelled, or when the data in the package will not open', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      const preview = await store.inspectDatabaseImport(packagePath);
      const waiting = await store.prepareDatabaseReplacement(preview.previewId, T);
      expect(code(await store.cancelDatabaseReplacement('00000000-0000-4000-8000-000000000001').catch((error: unknown) => error)))
        .toBe('DATABASE_REPLACEMENT_STALE');
      const cancelled = await store.cancelDatabaseReplacement(waiting.pending!.replacementId);
      expect(cancelled).toMatchObject({ pending: null, total: 0 });
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      // The backup it made stays: it is a copy of the data as it was.
      expect(existsSync(join(backups(), preReplaceBackupFileName(T)))).toBe(true);
    } finally {
      store.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(titles(store)).toEqual(['甲书']);
      expect((await store.inspectDatabaseReplacements()).total).toBe(0);
      // A package whose data is no store: its manifest fits, so the replacement is prepared, and the next open refuses it.
      const broken = await handmade('坏数据库.ai7db', 2, 1);
      const preview = await store.inspectDatabaseImport(broken);
      expect(preview.compatibility).toBe('compatible');
      await store.prepareDatabaseReplacement(preview.previewId, LATER);
    } finally {
      store.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(titles(store)).toEqual(['甲书']);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      const failed = await store.inspectDatabaseReplacements();
      expect(failed).toMatchObject({ pending: null, total: 1, rollBackOf: null });
      expect(failed.replacements[0]).toMatchObject({ kind: 'replace', outcome: 'failed', packageFileName: '坏数据库.ai7db', backupFileName: preReplaceBackupFileName(LATER) });
    } finally {
      store.close();
    }
  }, 180_000);

  it('refuses what cannot replace the data, and takes nothing from it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const refusal = async (run: () => Promise<unknown>): Promise<unknown> => code(await run().then(() => null, (error: unknown) => error));
      // Not a package, and not a place.
      await writeFile(join(roots.inputRoot, 'words.ai7db'), 'just some words');
      expect(await refusal(() => store.inspectDatabaseImport(join(roots.inputRoot, 'words.ai7db')))).toBe('DATABASE_PACKAGE_INVALID');
      expect(await refusal(() => store.inspectDatabaseImport(join(roots.inputRoot, 'missing.ai7db')))).toBe('DATABASE_PACKAGE_UNREADABLE');
      expect(await refusal(() => store.inspectDatabaseImport('relative.ai7db'))).toBe('DATABASE_IMPORT_SOURCE_INVALID');
      // A package from an earlier or a newer Data Version, or from a newer AI7, is previewed, and refused for replacing and for
      // merging alike: a Data Version 1 package is not converted until the upgrade tool lands (#1634; ADR 0105 §4).
      for (const [name, dataVersion, revision, compatibility] of [
        ['旧数据版本.ai7db', 1, LATEST_SCHEMA_VERSION - 1, 'older-data-version'],
        ['新数据版本.ai7db', 3, LATEST_SCHEMA_VERSION, 'newer-data-version'],
        ['新软件.ai7db', 2, LATEST_SCHEMA_VERSION + 1, 'newer-schema'],
      ] as const) {
        const preview = await store.inspectDatabaseImport(await handmade(name, dataVersion, revision));
        expect(preview.compatibility).toBe(compatibility);
        expect(await refusal(() => store.prepareDatabaseReplacement(preview.previewId, T))).toBe('DATABASE_IMPORT_INCOMPATIBLE');
        expect(await refusal(() => store.prepareDatabaseMerge(preview.previewId, T))).toBe('DATABASE_IMPORT_INCOMPATIBLE');
      }
      // A file that changed after its preview: nothing is taken, and nothing is backed up.
      const first = await exported(store, '第一次.ai7db');
      createBook(store, '乙书');
      const second = await exported(store, '第二次.ai7db');
      const preview = await store.inspectDatabaseImport(first);
      await copyFile(second, first);
      expect(await refusal(() => store.prepareDatabaseReplacement(preview.previewId, T))).toBe('DATABASE_REPLACEMENT_STALE');
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      expect(existsSync(backups())).toBe(false);
      expect(await store.inspectDatabaseReplacements()).toMatchObject({ pending: null, total: 0, rollBackOf: null });
    } finally {
      store.close();
    }
  }, 180_000);
  it('retains independent role choices through database replacement', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', 'anthropic-claude');
    try {
      store.selectMainRoleModel('anthropic-claude', 'account-opus');
      store.selectForegroundFlashModel('anthropic-claude', 'account-dialogue');
      store.selectUnderlyingModel({ roleId: 'underlying-flash', route: 'anthropic-claude', modelId: 'account-haiku' });
      const preview = await store.inspectDatabaseImport(await exported(store, 'independent-roles.ai7db'));
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getConfiguredModelRoleBinding('main-editorial')).toMatchObject({ model: 'account-opus', credentialReference: connection.credentialReference });
      expect(store.getConfiguredModelRoleBinding('foreground-flash')).toMatchObject({ model: 'account-dialogue', credentialReference: connection.credentialReference });
      expect(store.getConfiguredModelRoleBinding('fast-interaction')).toMatchObject({ model: 'account-haiku', credentialReference: connection.credentialReference });
    } finally { store.close(); }
  });

  it('keeps 撤销 and 重做 through replacement (#1175)', async () => {
    const other = join(roots.inputRoot, 'history-data');
    mkdirSync(join(other, 'objects'), { recursive: true });
    const source = await EditorialStore.open(other, roots.codeRoot);
    const book = await importSample1Book(source, roots.codeRoot, '撤销替换合成图书');
    const view = source.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    const target = view.blocks.find((block) => block.kind === 'paragraph')!;
    source.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: view.revisionId,
      blockId: target.blockId, windowStartBlockId: view.blocks[0]!.blockId, baseBlockDigest: target.digest, expectedJournalSequence: view.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '〔替换前〕' });
    source.markCleanShutdown(); source.close();
    const database = new DatabaseSync(join(other, 'store', 'ai7.sqlite'));
    const path = join(roots.inputRoot, 'history.ai7db');
    try {
      await writeDatabasePackage(database, other, path, () => ({ dataVersion: 2, softwareVersion: '0.1.0', schemaRevision: LATEST_SCHEMA_VERSION, createdAt: T.toISOString(),
        origin: 'database-export', contents: { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 } }));
    } finally { database.close(); }
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const preview = await store.inspectDatabaseImport(path);
      expect(preview).toMatchObject({ schemaRevision: LATEST_SCHEMA_VERSION, compatibility: 'compatible' });
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const text = (): string => store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === target.blockId)!.text;
      const digest = (): string => store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest;
      expect(text().startsWith('〔替换前〕')).toBe(true);
      store.undoManuscript(book.manuscriptId, book.branchId, digest());
      expect(text() === target.text).toBe(true);
      store.redoManuscript(book.manuscriptId, book.branchId, digest());
      expect(text().startsWith('〔替换前〕')).toBe(true);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('restores peer production documents through a backup', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '多篇文档替换');
      const first = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release' })).document!;
      await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', title: '媒体稿' });
      const before = store.inspectProductionDocuments(book.bookId);
      const path = await exported(store, 'peer-backup.ai7db');
      store.renameProductionDocument({ bookId: book.bookId, documentId: first.documentId, title: '本机临时题目' });
      const preview = await store.inspectDatabaseImport(path);
      await store.prepareDatabaseReplacement(preview.previewId, new Date());
      store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectProductionDocuments(book.bookId)).toEqual(before);
    } finally { store.close(); }
  });

  it('preserves a Task Intent draft identity through database replacement', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const bookId = createBook(store, '任务草稿替换');
    const draft = store.saveTaskIntentDraft({ bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: '审阅本书', target: { kind: 'book' }, outcomeClass: 'review' });
    try {
      const preview = await store.inspectDatabaseImport(await exported(store, 'drafts.ai7db'));
      await store.prepareDatabaseReplacement(preview.previewId);
    } finally { store.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try { expect(store.inspectTaskIntentDrafts({ bookId, draftId: draft.draftId }).drafts[0]!.version).toEqual(draft.version); }
    finally { store.close(); }
  });

  it('keeps its records as written, and refuses one rewritten by hand', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let intent: ReplacementIntent;
    try {
      createBook(store, '甲书');
      const preview = await store.inspectDatabaseImport(await exported(store, 'AI7 数据库.ai7db'));
      await store.prepareDatabaseReplacement(preview.previewId, T);
      intent = (await readPendingReplacement(roots.dataRoot))!;
    } finally {
      store.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close();
    // An open that stopped after the replacement was recorded, before its staging place went: the next open records it once.
    mkdirSync(replacementStagingFor(roots.dataRoot));
    await writeReplacementIntent(roots.dataRoot, intent);
    await writeFile(join(replacementStagingFor(roots.dataRoot), 'phase.json'), JSON.stringify('applied'));
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(await store.inspectDatabaseReplacements()).toMatchObject({ total: 1, replacements: [{ replacementId: intent.replacementId, outcome: 'applied' }] });
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const tamper = async (statement: string): Promise<unknown> => {
      const tampered = new DatabaseSync(path);
      let original: string;
      try {
        original = (tampered.prepare('SELECT * FROM database_replacements').get() as Record<string, string>).canonical_json!;
        tampered.exec('DROP TRIGGER database_replacements_no_update');
        tampered.exec(statement);
        tampered.exec(DATABASE_REPLACEMENT_TRIGGER_SQL.database_replacements_no_update!);
      } finally {
        tampered.close();
      }
      const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        return code(await opened.inspectDatabaseReplacements().then(() => null, (error: unknown) => error));
      } finally {
        opened.close();
        const restore = new DatabaseSync(path);
        try {
          restore.exec('DROP TRIGGER database_replacements_no_update');
          restore.prepare('UPDATE database_replacements SET canonical_json = ?, sha256 = ?, package_file_name = ?').run(
            original, sha256Hex(original), (parseCanonicalJson(original) as { packageFileName: string }).packageFileName);
          restore.exec(DATABASE_REPLACEMENT_TRIGGER_SQL.database_replacements_no_update!);
        } finally {
          restore.close();
        }
      }
    };
    let database = new DatabaseSync(path);
    try {
      for (const statement of ["UPDATE database_replacements SET outcome = 'failed'", 'DELETE FROM database_replacements']) {
        expect(() => database.exec(statement)).toThrow(/DATABASE_REPLACEMENT_LEDGER_IMMUTABLE/u);
      }
    } finally {
      database.close();
    }
    // A row changed under its record; a record's digest left stale.
    expect(await tamper("UPDATE database_replacements SET package_file_name = '别的文件.ai7db'")).toBe('DATABASE_REPLACEMENT_RECORD_INVALID');
    expect(await tamper(`UPDATE database_replacements SET sha256 = '${'c'.repeat(64)}'`)).toBe('DATABASE_REPLACEMENT_RECORD_INVALID');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await store.inspectDatabaseReplacements()).total).toBe(1);
    } finally {
      store.close();
    }
  }, 180_000);


  it('writes the backup before a replacement alone in the backup location, beside 定期自动备份 (Issue #434, S86c restack)', async () => {
    const hours = (count: number): Date => new Date(T.getTime() + count * 60 * 60 * 1000);
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await store.runScheduledBackupIfDue(T)).toBe(true);
      const preview = await store.inspectDatabaseImport(packagePath);
      // While the backup before the replacement is being made, a 定期自动备份 check starts nothing: no sweep, no backup.
      const preparing = store.prepareDatabaseReplacement(preview.previewId, LATER);
      expect(await store.runScheduledBackupIfDue(hours(25))).toBe(false);
      expect((await preparing).pending).toMatchObject({ backupFileName: preReplaceBackupFileName(LATER) });
      // Once it is written the replacement waits, and until AI7's next start the check makes no backup, whose record the
      // replacement would lose (Issue #434 review).
      expect(await store.runScheduledBackupIfDue(hours(25))).toBe(false);
      const names = await readdir(backups());
      expect([names.includes(preReplaceBackupFileName(LATER)), names.filter((name) => name.includes('.partial'))]).toEqual([true, []]);
      expect(store.inspectScheduledBackups(hours(25)).total).toBe(1);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The next open brings the package's data in, whose switch is off. Turned on there, 回退 writes its backup alone as well.
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const replaced = await store.inspectDatabaseReplacements();
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, hours(49));
      expect(await store.runScheduledBackupIfDue(hours(49))).toBe(true);
      const rollingBack = store.rollBackDatabaseReplacement(replaced.rollBackOf!, hours(50));
      expect(await store.runScheduledBackupIfDue(hours(74))).toBe(false);
      expect((await rollingBack).pending).toMatchObject({ kind: 'roll-back', backupFileName: preReplaceBackupFileName(hours(50)) });
      expect(await store.runScheduledBackupIfDue(hours(74))).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});

describe('替换本机全部数据 at its second review (Issue #434 review)', () => {
  it('writes nothing more while a replacement waits, and 取消替换 lets the data be written again', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      await store.runScheduledBackupIfDue(T);
      expect(store.replacementWaiting()).toBe(false);
      const waiting = await store.prepareDatabaseReplacement((await store.inspectDatabaseImport(packagePath)).previewId, LATER);
      expect(store.replacementWaiting()).toBe(true);
      // A day on, a backup is due; it is not made while the replacement waits, since its record would be lost with the data.
      const dayOn = new Date(T.getTime() + 25 * 60 * 60 * 1000);
      expect(await store.runScheduledBackupIfDue(dayOn)).toBe(false);
      expect(store.inspectScheduledBackups(dayOn).total).toBe(1);
      // 取消替换: the data is written again, and the backup that was due is made.
      await store.cancelDatabaseReplacement(waiting.pending!.replacementId);
      expect(store.replacementWaiting()).toBe(false);
      expect(await store.runScheduledBackupIfDue(dayOn)).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('freezes what may be admitted from the moment a replacement is asked for, until it is cancelled or refused (Issue #434 review)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      // Enough data that the backup takes many steps to write.
      mkdirSync(join(roots.dataRoot, 'bulk'), { recursive: true });
      await writeFile(join(roots.dataRoot, 'bulk', 'filler.bin'), Buffer.alloc(24 << 20, 7));
      const preview = await store.inspectDatabaseImport(packagePath);
      expect(store.replacementFrozen()).toBe(false);
      const preparing = store.prepareDatabaseReplacement(preview.previewId, T);
      // Frozen at once, before the backup is written, while nothing waits yet.
      expect([store.replacementFrozen(), store.replacementWaiting()]).toEqual([true, false]);
      const deadline = Date.now() + 60_000;
      while (!(existsSync(backups()) && readdirSync(backups()).some((name) => /\.ai7db\.partial$/u.test(name)))) {
        if (Date.now() > deadline) throw new Error('timed out waiting for the backup to be written');
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect([store.replacementFrozen(), store.replacementWaiting()]).toEqual([true, false]);
      const waiting = await preparing;
      expect([store.replacementFrozen(), store.replacementWaiting()]).toEqual([true, true]);
      await store.cancelDatabaseReplacement(waiting.pending!.replacementId);
      expect([store.replacementFrozen(), store.replacementWaiting()]).toEqual([false, false]);
      // A preparation refused leaves nothing frozen: the preview it names is spent.
      await expect(store.prepareDatabaseReplacement(preview.previewId, LATER)).rejects.toBeInstanceOf(StoreError);
      expect(store.replacementFrozen()).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('replaces nothing at the next open when what waits has changed since it was prepared, and records why', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      createBook(store, '乙书');
      await store.prepareDatabaseReplacement((await store.inspectDatabaseImport(packagePath)).previewId, T);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // What waits is changed before AI7 starts again: its copy of the store is emptied.
    await writeFile(join(replacementStagingFor(roots.dataRoot), 'incoming', 'store', 'ai7.sqlite'), '');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(titles(store)).toEqual(['乙书', '甲书']);
      const read = await store.inspectDatabaseReplacements();
      expect(read.replacements).toHaveLength(1);
      expect(read.replacements[0]).toMatchObject({ kind: 'replace', outcome: 'failed', failure: 'changed', packageFileName: 'AI7 数据库.ai7db' });
      expect([read.pending, read.rollBackOf]).toEqual([null, null]);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('never puts the backup before a replacement over a file that appeared at its name, and prepares nothing', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      createBook(store, '甲书');
      const packagePath = await exported(store, 'AI7 数据库.ai7db');
      // Enough data that the backup takes many chunks to write.
      mkdirSync(join(roots.dataRoot, 'bulk'), { recursive: true });
      await writeFile(join(roots.dataRoot, 'bulk', 'filler.bin'), Buffer.alloc(24 << 20, 7));
      const preview = await store.inspectDatabaseImport(packagePath);
      const preparing = store.prepareDatabaseReplacement(preview.previewId, T);
      const deadline = Date.now() + 60_000;
      while (!(existsSync(backups()) && readdirSync(backups()).some((name) => /\.ai7db\.partial$/u.test(name)))) {
        if (Date.now() > deadline) throw new Error('timed out waiting for the backup to be written');
        await new Promise((resolve) => setImmediate(resolve));
      }
      await writeFile(join(backups(), preReplaceBackupFileName(T)), 'another program put this here');
      expect(code(await preparing.catch((error: unknown) => error))).toBe('DATABASE_REPLACEMENT_BACKUP_EXISTS');
      expect(await readFile(join(backups(), preReplaceBackupFileName(T)), 'utf8')).toBe('another program put this here');
      expect(readdirSync(backups()).filter((name) => name.includes('.partial'))).toEqual([]);
      expect(store.replacementWaiting()).toBe(false);
      expect(existsSync(replacementStagingFor(roots.dataRoot))).toBe(false);
      expect((await store.inspectDatabaseReplacements()).pending).toBeNull();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('lists the newest replacements and counts the rest, each verified as it is read', async () => {
    const created = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      created.markCleanShutdown();
    } finally {
      created.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      for (let index = 0; index <= MAX_DATABASE_REPLACEMENTS_LISTED; index += 1) {
        const at = new Date(T.getTime() + index * 60_000).toISOString();
        const stored = {
          replacementId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, kind: 'replace', outcome: 'failed',
          packageFileName: `AI7 数据库 ${index}.ai7db`, packageSha256: 'a'.repeat(64), backupFileName: `AI7 替换前备份 ${index}.ai7db`,
          backupSha256: 'b'.repeat(64), preparedAt: at, recordedAt: at, failure: 'changed',
        };
        const record = canonicalRecord({ schema: 'ai7.database-replacement/1', ...stored });
        database.prepare(
          `INSERT INTO database_replacements(replacement_id, kind, outcome, package_file_name, package_sha256, backup_file_name, backup_sha256, prepared_at, recorded_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(stored.replacementId, stored.kind, stored.outcome, stored.packageFileName, stored.packageSha256, stored.backupFileName,
          stored.backupSha256, stored.preparedAt, stored.recordedAt, record.json, record.digest);
      }
    } finally {
      database.close();
    }
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const read = await store.inspectDatabaseReplacements();
      expect([read.replacements.length, read.total]).toEqual([MAX_DATABASE_REPLACEMENTS_LISTED, MAX_DATABASE_REPLACEMENTS_LISTED + 1]);
      expect(read.replacements[0]).toMatchObject({ packageFileName: `AI7 数据库 ${MAX_DATABASE_REPLACEMENTS_LISTED}.ai7db`, outcome: 'failed', failure: 'changed' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it("refuses a replacement record that names a merge's own failure: only a merge records one (Issue #644)", async () => {
    const created = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      created.markCleanShutdown();
    } finally {
      created.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const at = T.toISOString();
      const stored = {
        replacementId: '00000000-0000-4000-8000-000000000644', kind: 'replace', outcome: 'failed',
        packageFileName: 'AI7 数据库.ai7db', packageSha256: 'a'.repeat(64), backupFileName: 'AI7 替换前备份.ai7db',
        backupSha256: 'b'.repeat(64), preparedAt: at, recordedAt: at, failure: 'unmergeable',
      };
      const record = canonicalRecord({ schema: 'ai7.database-replacement/1', ...stored });
      database.prepare(
        `INSERT INTO database_replacements(replacement_id, kind, outcome, package_file_name, package_sha256, backup_file_name, backup_sha256, prepared_at, recorded_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(stored.replacementId, stored.kind, stored.outcome, stored.packageFileName, stored.packageSha256, stored.backupFileName,
        stored.backupSha256, stored.preparedAt, stored.recordedAt, record.json, record.digest);
    } finally {
      database.close();
    }
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const refused = await store.inspectDatabaseReplacements().catch((error: unknown) => error);
      expect((refused as { code?: string }).code).toBe('DATABASE_REPLACEMENT_RECORD_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});



it('closes the refused unsupported-version database so its data root can be removed immediately (#1262)', async () => {
  const directory = join(roots.dataRoot, 'store');
  await mkdir(directory, { recursive: true });
  const planted = new DatabaseSync(join(directory, 'ai7.sqlite'));
  planted.exec('PRAGMA user_version = 9999');
  planted.close();
  await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_UNSUPPORTED' });
  await rm(roots.dataRoot, { recursive: true });
}, 120_000);





it('replaces populated instance launch snapshots with the exported instance-free database (#1455)', async () => {
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const book = await importSample1Book(store, roots.codeRoot, '启动快照替换样书');
    launchLocalForSnapshot(store, roots.codeRoot, book.bookId);
    expect(await inspectLaunchSnapshots(roots.dataRoot, db => db.prepare('SELECT count(*) n FROM task_launch_snapshots').get()!.n)).toBe(1);
    const preview = await store.inspectDatabaseImport(await exported(store, 'launch-snapshot-replacement.ai7db'));
    await store.prepareDatabaseReplacement(preview.previewId, T);
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getBookOverview(book.bookId).book.title).toBe('启动快照替换样书');
    await inspectLaunchSnapshots(roots.dataRoot, db => {
      expect(db.prepare('SELECT count(*) n FROM task_launch_snapshots').get()!.n).toBe(0);
      expect(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='trigger' AND tbl_name='task_launch_snapshots'").get()!.n).toBe(2);
    });
  } finally { store.close(); }
});

it('recovers and cancels an unadmitted ordinary launch after replacement removed its instance command row (#1455)', async () => {
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const governor = new ModelRequestGovernor(); let captured: ReturnType<typeof capturedOrdinaryExecution> | undefined;
  try {
    const book = await importSample1Book(store, roots.codeRoot, '等待任务的导出与恢复');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, () => undefined);
    const launched = store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null,
      executionConfig: { reasoningEffort: 'high' }, startWhen: 'idle' }, captured.policy);
    await captured.owner.dispose();
    const preview = await store.inspectDatabaseImport(await exported(store, 'pending-launch.ai7db'));
    await store.prepareDatabaseReplacement(preview.previewId, T);
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, () => undefined);
    store.reconcileStoppedBaselineAnalysisRuns();
    expect(await inspectLaunchSnapshots(roots.dataRoot, db=>db.prepare('SELECT count(*) n FROM task_launch_snapshots').get()!.n)).toBe(0);
    expect(store.pendingLaunchedLedgerRuns().map(run=>run.runRecordId)).toContain(launched.runRecordId);
    store.cancelWaitingBaselineAnalysis(book.bookId, launched.taskIntentId);
    expect(store.pendingLaunchedLedgerRuns()).toEqual([]);
    expect(store.inspectBaselineAnalysis(book.bookId).run!.state).toBe('cancelled');
    expect(captured.requests).toHaveLength(0); captured.assertMatched();
  } finally { await captured?.owner.dispose(); governor.close(); await governor.whenIdle(); store.close(); }
});
