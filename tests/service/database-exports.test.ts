import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { DATABASE_EXPORT_TRIGGER_SQL, copyStore, databasePackageSources, writeDatabasePackage, type DatabasePackageBounds } from '../../src/service/database-exports.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_MERGE_SCHEMA_VERSION, STORE_VERSION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.4, §1.6, §1.7) over
// the real store: the package (a consistent copy of the store, every other data file, and a manifest that states the Data
// Version, what it holds and each member's digest), the preparation that stages it without touching the destination, the one
// approval that writes it atomically with its receipt, a replace bound to the file it resolved, the refusals, the ledger
// refusing to be rewritten, and revision 55 added to a revision-54 store. The Book is composed from exact `sample1`'s paragraphs.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-database-export-');
});

afterEach(async () => {
  await roots.dispose();
});

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

async function importBook(store: EditorialStore): Promise<string> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '数据库导出', paragraphs: [{ runs: [{ text: { block: 21 } }] }, { runs: [{ text: { block: 22 } }] }] });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.bookId;
}

/** A refusal thrown at once, by its code. */
function refusal(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return code(error);
  }
  return 'no-error';
}

/** Turns the event loop until `condition` holds; the bound keeps a wrong expectation from hanging the suite. */
async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A data file large enough that packing and writing it take many chunks, so 取消导出 can land midway. */
async function bulk(megabytes: number): Promise<void> {
  await mkdir(join(roots.dataRoot, 'bulk'), { recursive: true });
  await writeFile(join(roots.dataRoot, 'bulk', 'filler.bin'), randomBytes(megabytes << 20));
}

/** Everything in the staging area, the store's copy a package is made from included. */
function staged(): string[] {
  try {
    return readdirSync(join(roots.dataRoot, 'export-staging'));
  } catch {
    return [];
  }
}

function staging(): string[] {
  try {
    return readdirSync(join(roots.dataRoot, 'export-staging')).filter((name) => name.endsWith('.ai7db'));
  } catch {
    return [];
  }
}

describe('导出数据库 over the real store', () => {
  it('stages one package on preparation, writes it on the one approval, and says what it came to', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store);
      // The shell's browser profile lives under the Agent Data Root too, and is never carried.
      await mkdir(join(roots.dataRoot, 'shell'), { recursive: true });
      await writeFile(join(roots.dataRoot, 'shell', 'Preferences'), '{}');
      const destination = join(roots.inputRoot, 'AI7 数据库.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      const version = (JSON.parse(await readFile(join(roots.codeRoot, 'package.json'), 'utf8')) as { version: string }).version;
      expect(preparation).toMatchObject({
        fileName: 'AI7 数据库.ai7db',
        destination,
        disposition: 'create',
        dispositionLabel: '新建文件',
        dataVersion: 1,
        softwareVersion: version,
        contents: { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 },
        receipt: null,
      });
      // Nothing is written at the destination before the approval; the package waits in the staging area.
      await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(staging()).toHaveLength(1);

      // The package: a consistent copy of the store, every other data file, and the manifest last.
      const packaged = unzipSync(await readFile(join(roots.dataRoot, 'export-staging', staging()[0]!)));
      const names = Object.keys(packaged);
      expect(names[0]).toBe('store/ai7.sqlite');
      expect(names.at(-1)).toBe('manifest.json');
      expect(names.some((name) => name.startsWith('objects/'))).toBe(true);
      expect(names.filter((name) => /^(shell|export-staging)\//u.test(name) || /^store\/(?!ai7\.sqlite$)/u.test(name))).toEqual([]);
      const manifest = parseCanonicalJson(strFromU8(packaged['manifest.json']!)) as Record<string, unknown>;
      expect(manifest).toMatchObject({
        schema: 'ai7.database-package/1',
        dataVersion: 1,
        softwareVersion: version,
        schemaRevision: DATABASE_MERGE_SCHEMA_VERSION,
        origin: 'database-export',
        credentials: 'excluded',
        contents: { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 },
      });
      const members = manifest.members as Array<{ path: string; bytes: number; sha256: string }>;
      expect(members.map((member) => member.path)).toEqual(names.slice(0, -1));
      for (const member of members) {
        expect([packaged[member.path]!.byteLength, digest(packaged[member.path]!)]).toEqual([member.bytes, member.sha256]);
      }
      // The store's copy opens as a store of this revision, with the Book.
      const copyPath = join(roots.inputRoot, 'copy.sqlite');
      writeFileSync(copyPath, packaged['store/ai7.sqlite']!);
      const copy = new DatabaseSync(copyPath, { readOnly: true });
      try {
        expect((copy.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_MERGE_SCHEMA_VERSION);
        expect((copy.prepare('SELECT count(*) count FROM books').get() as { count: number }).count).toBe(1);
      } finally {
        copy.close();
      }

      // The approval writes exactly the prepared package, once.
      const receipt = await store.approveDatabaseExport(preparation.preparationId, true);
      expect(receipt).toMatchObject({ outcome: 'created', outcomeLabel: '已导出到所选位置', detail: '已新建「AI7 数据库.ai7db」。', fileName: 'AI7 数据库.ai7db' });
      const written = await readFile(destination);
      expect([written.byteLength, receipt.byteLength]).toEqual([preparation.payloadBytes, preparation.payloadBytes]);
      expect(staging()).toEqual([]);
      expect(code(await store.approveDatabaseExport(preparation.preparationId, true).catch((error: unknown) => error))).toBe('DATABASE_EXPORT_ALREADY_APPROVED');
      expect(store.inspectDatabaseExports()).toMatchObject({ total: 1, exports: [{ preparationId: preparation.preparationId, outcome: 'created' }] });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The receipts stand after a restart.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectDatabaseExports().total).toBe(1);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('binds a replace to the file it resolved, refuses a stale preparation and a destination it may not write', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const destination = join(roots.inputRoot, '旧的备份.ai7db');
      await writeFile(destination, 'an earlier file the dialog resolved');
      const first = await store.prepareDatabaseExport(destination, true);
      expect([first.disposition, first.dispositionLabel]).toEqual(['replace', '替换所选位置的同名文件']);
      // A second preparation keeps one staged package, so the first can no longer be approved.
      const second = await store.prepareDatabaseExport(destination, true);
      expect(staging()).toHaveLength(1);
      expect(code(await store.approveDatabaseExport(first.preparationId, true).catch((error: unknown) => error))).toBe('DATABASE_EXPORT_STALE');
      // A file changed since the dialog resolved it is never replaced: 未能导出, and it stays as it is.
      await writeFile(destination, 'another program wrote here since');
      const refused = await store.approveDatabaseExport(second.preparationId, true);
      expect([refused.outcome, refused.outcomeLabel]).toEqual(['failed', '未能导出']);
      expect(await readFile(destination, 'utf8')).toBe('another program wrote here since');
      // Destinations never written: inside the Agent Data Root, or without the package's extension.
      for (const [path, expected] of [[join(roots.dataRoot, 'inside.ai7db'), 'EXPORT_DESTINATION_INVALID'], [join(roots.inputRoot, 'wrong.zip'), 'EXPORT_DESTINATION_INVALID']] as const) {
        expect(code(await store.prepareDatabaseExport(path, true).catch((error: unknown) => error))).toBe(expected);
      }
      expect(code(await store.approveDatabaseExport(randomUUID(), true).catch((error: unknown) => error))).toBe('DATABASE_EXPORT_NOT_FOUND');
      // A replace of the file as the dialog resolved it writes the package over exactly that file.
      const third = await store.prepareDatabaseExport(destination, true);
      const replaced = await store.approveDatabaseExport(third.preparationId, true);
      expect([replaced.outcome, replaced.detail]).toEqual(['replaced', '已替换所选位置的「旧的备份.ai7db」。']);
      expect((await readFile(destination)).byteLength).toBe(third.payloadBytes);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('keeps its records as ledgers read back against their digests, and adds revision 55 to a revision-54 store', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const destination = join(roots.inputRoot, 'ledger.ai7db');
    try {
      const preparation = await store.prepareDatabaseExport(destination, true);
      await store.approveDatabaseExport(preparation.preparationId, true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const inspected = async (): Promise<unknown> => {
      const reader = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const answer = (() => {
          try {
            return reader.inspectDatabaseExports();
          } catch (error) {
            return error;
          }
        })();
        reader.markCleanShutdown();
        return answer;
      } finally {
        reader.close();
      }
    };
    // A preparation whose row and record were rewritten together, its digest left as it was, no longer reads.
    const original = (() => {
      const database = new DatabaseSync(databasePath);
      try {
        const row = database.prepare('SELECT file_name, canonical_json FROM database_export_preparations').get() as { file_name: string; canonical_json: string };
        database.exec('DROP TRIGGER database_export_preparations_no_update');
        const record = parseCanonicalJson(row.canonical_json) as Record<string, unknown>;
        database.prepare('UPDATE database_export_preparations SET file_name = ?, canonical_json = ?')
          .run('rewritten.ai7db', canonicalRecord({ ...record, fileName: 'rewritten.ai7db' }).json);
        database.exec(DATABASE_EXPORT_TRIGGER_SQL.database_export_preparations_no_update!);
        return row;
      } finally {
        database.close();
      }
    })();
    expect(code(await inspected())).toBe('DATABASE_EXPORT_RECORD_INVALID');
    const restore = new DatabaseSync(databasePath);
    try {
      restore.exec('DROP TRIGGER database_export_preparations_no_update');
      restore.prepare('UPDATE database_export_preparations SET file_name = ?, canonical_json = ?').run(original.file_name, original.canonical_json);
      restore.exec(DATABASE_EXPORT_TRIGGER_SQL.database_export_preparations_no_update!);
    } finally {
      restore.close();
    }
    expect((await inspected() as { total: number }).total).toBe(1);
    const tamper = new DatabaseSync(databasePath);
    try {
      for (const table of ['database_export_preparations', 'database_export_approvals', 'database_export_receipts']) {
        expect(() => tamper.exec(`UPDATE ${table} SET canonical_json = canonical_json`)).toThrowError(/DATABASE_EXPORT_LEDGER_IMMUTABLE/u);
        expect(() => tamper.exec(`DELETE FROM ${table}`)).toThrowError(/DATABASE_EXPORT_LEDGER_IMMUTABLE/u);
      }
      // A receipt rewritten by hand, digest and all, no longer reads.
      tamper.exec('DROP TRIGGER database_export_receipts_no_update');
      const row = tamper.prepare('SELECT canonical_json FROM database_export_receipts').get() as { canonical_json: string };
      const rewritten = canonicalRecord({ ...(parseCanonicalJson(row.canonical_json) as Record<string, unknown>), finalPath: join(roots.inputRoot, 'elsewhere.ai7db') });
      tamper.prepare('UPDATE database_export_receipts SET canonical_json = ?, sha256 = ?').run(rewritten.json, rewritten.digest);
      tamper.exec(DATABASE_EXPORT_TRIGGER_SQL.database_export_receipts_no_update!);
    } finally {
      tamper.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code((() => {
        try {
          return reopened.inspectDatabaseExports();
        } catch (error) {
          return error;
        }
      })())).toBe('DATABASE_EXPORT_RECORD_INVALID');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }

    // A store as revision 54 left it gains the three empty ledgers and nothing else moves.
    {
      const other = await createServiceTestRoots('ai7-service-database-export-migration-');
      try {
        const first = await EditorialStore.open(other.dataRoot, other.codeRoot);
        first.markCleanShutdown();
        first.close();
        const plant = new DatabaseSync(join(other.dataRoot, 'store', 'ai7.sqlite'));
        try {
          plant.exec(`DROP TABLE database_merge_books; DROP TABLE database_merges; DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; PRAGMA user_version = ${STORE_VERSION_SCHEMA_VERSION};`);
        } finally {
          plant.close();
        }
        const migrated = await EditorialStore.open(other.dataRoot, other.codeRoot);
        try {
          expect(migrated.inspectDatabaseExports()).toEqual({ exports: [], total: 0, activity: null });
          migrated.markCleanShutdown();
        } finally {
          migrated.close();
        }
        const check = new DatabaseSync(join(other.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          expect((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_MERGE_SCHEMA_VERSION);
        } finally {
          check.close();
        }
      } finally {
        await other.dispose();
      }
    }
  }, 180_000);

  it('exports only under a verified policy, and keeps no staged copy of the data across a launch (Issue #434, S86a review)', async () => {
    const destination = join(roots.inputRoot, 'policy.ai7db');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let prepared: string;
    try {
      // A launch whose External Export Policy was not verified refuses before anything is staged or recorded.
      expect(code(await store.prepareDatabaseExport(destination, false).catch((error: unknown) => error))).toBe('EXPORT_POLICY_UNAVAILABLE');
      expect([staging(), store.inspectDatabaseExports().exports]).toEqual([[], []]);
      prepared = (await store.prepareDatabaseExport(destination, true)).preparationId;
      expect(staging()).toHaveLength(1);
      expect(code(await store.approveDatabaseExport(prepared, false).catch((error: unknown) => error))).toBe('EXPORT_POLICY_UNAVAILABLE');
      expect(existsSync(destination)).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The next launch sweeps the copy no approval took; the preparation is then stale, and preparing again works.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(staging()).toEqual([]);
      expect(code(await reopened.approveDatabaseExport(prepared!, true).catch((error: unknown) => error))).toBe('DATABASE_EXPORT_STALE');
      const again = await reopened.prepareDatabaseExport(destination, true);
      expect((await reopened.approveDatabaseExport(again.preparationId, true)).outcome).toBe('created');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);
});

describe('导出数据库 off the request (Issue #434 review, V2-UX-EXP-011)', () => {
  it('packs and writes as an activity that says how far it has come, one export at a time', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store);
      const destination = join(roots.inputRoot, '进度.ai7db');
      const started = store.startDatabaseExportPreparation(destination, true);
      // It copies the store first, then packs it (Issue #434 review).
      expect(started).toMatchObject({ kind: 'prepare', state: 'running', step: 'copying', cancellable: true, preparation: null, receipt: null, failure: null });
      expect(refusal(() => store.startDatabaseExportPreparation(join(roots.inputRoot, '另一个.ai7db'), true))).toBe('DATABASE_EXPORT_BUSY');
      expect(store.databaseExportRunning()).toBe(true);
      await store.databaseExportSettled();
      expect(store.databaseExportRunning()).toBe(false);
      const prepared = store.inspectDatabaseExports().activity!;
      expect(prepared).toMatchObject({ activityId: started.activityId, state: 'prepared', step: null, cancellable: false, receipt: null, failure: null });
      expect(prepared.totalBytes).toBeGreaterThan(0);
      expect(prepared.completedBytes).toBe(prepared.totalBytes);
      const preparation = prepared.preparation!;
      expect(preparation).toMatchObject({ fileName: '进度.ai7db', disposition: 'create', receipt: null });
      // The approval reads the prepared file, writes it, and reads it back where it was written and where it landed.
      const approving = store.startDatabaseExportApproval(preparation.preparationId, true);
      expect(approving).toMatchObject({ kind: 'approve', state: 'running', step: 'verifying', cancellable: true, totalBytes: preparation.payloadBytes * 4, receipt: null });
      expect(approving.preparation?.preparationId).toBe(preparation.preparationId);
      await store.databaseExportSettled();
      const finished = store.inspectDatabaseExports().activity!;
      expect(finished).toMatchObject({ state: 'finished', step: null, completedBytes: preparation.payloadBytes * 4, receipt: { outcome: 'created' } });
      expect((await readFile(destination)).byteLength).toBe(preparation.payloadBytes);
      // An export that ended is not stopped again, and 取消导出 names the export it stops.
      expect(store.cancelDatabaseExport(finished.activityId)).toEqual(finished);
      expect(refusal(() => store.cancelDatabaseExport(randomUUID()))).toBe('DATABASE_EXPORT_ACTIVITY_NOT_FOUND');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('stops packing at 取消导出, at once or midway, and leaves no package, copy or preparation', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const destination = join(roots.inputRoot, '取消打包.ai7db');
    try {
      await importBook(store);
      await bulk(24);
      const first = store.startDatabaseExportPreparation(destination, true);
      expect(store.cancelDatabaseExport(first.activityId)).toMatchObject({ state: 'running', cancellable: false });
      await store.databaseExportSettled();
      expect(store.inspectDatabaseExports().activity).toMatchObject({ activityId: first.activityId, state: 'cancelled', preparation: null, failure: null });
      const second = store.startDatabaseExportPreparation(destination, true);
      // The store is copied first; this stop lands once packing is under way.
      await until(() => {
        const activity = store.inspectDatabaseExports().activity;
        return activity?.step === 'packing' && activity.completedBytes > 0;
      }, 'packing under way');
      const midway = store.cancelDatabaseExport(second.activityId);
      expect(midway.completedBytes).toBeLessThan(midway.totalBytes);
      await store.databaseExportSettled();
      const stopped = store.inspectDatabaseExports().activity!;
      expect(stopped).toMatchObject({ activityId: second.activityId, state: 'cancelled', preparation: null });
      // It stopped where it was, not after packing the rest.
      expect(stopped.completedBytes).toBeLessThan(stopped.totalBytes);
      expect(staged()).toEqual([]);
      expect(existsSync(destination)).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('SELECT count(*) count FROM database_export_preparations').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 180_000);

  it('stops an approval before it is recorded, keeping the prepared file, or while it writes, receipting the destination unchanged', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store);
      await bulk(24);
      const destination = join(roots.inputRoot, '批准后取消.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      // While the prepared file is read: nothing is recorded, and the prepared file waits for another approval.
      const reading = store.startDatabaseExportApproval(preparation.preparationId, true);
      store.cancelDatabaseExport(reading.activityId);
      await store.databaseExportSettled();
      expect(store.inspectDatabaseExports()).toMatchObject({ total: 0, activity: { state: 'cancelled', receipt: null, failure: null } });
      // It stopped at once, not after reading the prepared file through.
      expect(store.inspectDatabaseExports().activity!.completedBytes).toBeLessThan(preparation.payloadBytes);
      expect(staging()).toHaveLength(1);
      // While it is written: the approval is spent, and its receipt says the destination did not change.
      const writing = store.startDatabaseExportApproval(preparation.preparationId, true);
      await until(() => {
        const activity = store.inspectDatabaseExports().activity;
        return activity?.step === 'writing' && activity.completedBytes > preparation.payloadBytes;
      }, 'writing under way');
      expect(store.cancelDatabaseExport(writing.activityId).cancellable).toBe(false);
      await store.databaseExportSettled();
      const ended = store.inspectDatabaseExports();
      expect(ended.total).toBe(1);
      // It stopped in the copy, not after copying the rest.
      expect(ended.activity!.completedBytes).toBeLessThan(preparation.payloadBytes * 2);
      expect(ended.activity).toMatchObject({
        state: 'finished',
        receipt: { outcome: 'failed', outcomeLabel: '未能导出', detail: '你取消了导出，所选位置没有变化。' },
      });
      expect(existsSync(destination)).toBe(false);
      expect(readdirSync(roots.inputRoot).filter((name) => name.endsWith('.ai7-partial'))).toEqual([]);
      expect(staged()).toEqual([]);
      expect(refusal(() => store.startDatabaseExportApproval(preparation.preparationId, true))).toBe('DATABASE_EXPORT_ALREADY_APPROVED');
      // While the written file is read back, before it is put in place: the same receipt, and nothing left beside the destination.
      const again = await store.prepareDatabaseExport(destination, true);
      const checking = store.startDatabaseExportApproval(again.preparationId, true);
      await until(() => (store.inspectDatabaseExports().activity?.completedBytes ?? 0) > again.payloadBytes * 2, 'the written file read back');
      store.cancelDatabaseExport(checking.activityId);
      await store.databaseExportSettled();
      expect(store.inspectDatabaseExports().activity?.receipt).toMatchObject({ outcome: 'failed', detail: '你取消了导出，所选位置没有变化。' });
      expect(store.inspectDatabaseExports().activity!.completedBytes).toBeLessThan(again.payloadBytes * 3);
      expect(existsSync(destination)).toBe(false);
      expect(readdirSync(roots.inputRoot).filter((name) => name.endsWith('.ai7-partial'))).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('stops the export under way when the service stops, and starts none after', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store);
      await bulk(24);
      store.startDatabaseExportPreparation(join(roots.inputRoot, '停止.ai7db'), true);
      await until(() => (store.inspectDatabaseExports().activity?.completedBytes ?? 0) > 0, 'packing under way');
      await store.stopDatabaseExports();
      expect(store.inspectDatabaseExports().activity).toMatchObject({ state: 'cancelled' });
      expect(staged()).toEqual([]);
      expect(refusal(() => store.startDatabaseExportPreparation(join(roots.inputRoot, '之后.ai7db'), true))).toBe('SERVICE_STOPPING');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});

describe('the database package (Issue #434 review)', () => {
  /** A store of `rows` Books, each carrying a kilobyte, so that copying it takes many steps. */
  function storeOfBooks(path: string, rows: number): DatabaseSync {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY, note TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO books VALUES (?, ?)');
    db.exec('BEGIN');
    for (let index = 0; index < rows; index += 1) insert.run(randomUUID(), 'x'.repeat(1000));
    db.exec('COMMIT');
    return db;
  }

  const FACTS = (): { dataVersion: number; softwareVersion: string; schemaRevision: number; createdAt: string; origin: 'database-export' } => ({
    dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 1, createdAt: new Date().toISOString(), origin: 'database-export',
  });

  it('counts what its copy of the store holds, whatever another request writes while it is made', async () => {
    const db = storeOfBooks(join(roots.inputRoot, 'counted.sqlite'), 20_000);
    try {
      const books = (): number => (db.prepare('SELECT count(*) count FROM books').get() as { count: number }).count;
      const dataRoot = join(roots.inputRoot, 'root');
      await mkdir(dataRoot);
      const packagePath = join(roots.inputRoot, 'counted.ai7db');
      // Another request's writes through the same connection, one at every turn of the event loop once the copy has begun.
      let writing = true;
      let written = 0;
      const write = (): void => {
        if (!writing) return;
        if (existsSync(`${packagePath}.store`)) {
          db.prepare('INSERT INTO books VALUES (?, ?)').run(randomUUID(), 'written meanwhile');
          written += 1;
        }
        setImmediate(write);
      };
      setImmediate(write);
      const made = await writeDatabasePackage(db, dataRoot, packagePath, FACTS);
      writing = false;
      expect(written).toBeGreaterThan(0);
      const packaged = unzipSync(await readFile(packagePath));
      const copyPath = join(roots.inputRoot, 'counted-copy.sqlite');
      writeFileSync(copyPath, packaged['store/ai7.sqlite']!);
      const copy = new DatabaseSync(copyPath, { readOnly: true });
      try {
        const held = (copy.prepare('SELECT count(*) count FROM books').get() as { count: number }).count;
        // The service answered while the store was copied, and what it wrote then is in the copy; the manifest states exactly
        // what the copy holds.
        expect(held).toBeGreaterThan(20_000);
        expect([made.facts.contents.books, (parseCanonicalJson(strFromU8(packaged['manifest.json']!)) as { contents: { books: number } }).contents.books])
          .toEqual([held, held]);
        // The copy is a file of its own: no write-ahead log needed to read it.
        expect((copy.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('delete');
      } finally {
        copy.close();
      }
      expect(books()).toBe(20_000 + written);
    } finally {
      db.close();
    }
  }, 180_000);

  it('copies the store a few pages at a time, the event loop turning between steps, and stops at the next step when told', async () => {
    const db = storeOfBooks(join(roots.inputRoot, 'copied.sqlite'), 40_000);
    try {
      const controller = new AbortController();
      const copying = copyStore(db, join(roots.inputRoot, 'copied-copy.sqlite'), controller.signal);
      let settled = false;
      copying.then(() => { settled = true; }, () => { settled = true; });
      // Three turns of the event loop pass while it copies: nothing waits on the whole copy.
      for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      controller.abort();
      await expect(copying).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      db.close();
    }
  }, 180_000);

  it('says how far the copy of the store has come, as a step of its own, before it packs (Issue #434 review)', async () => {
    const db = storeOfBooks(join(roots.inputRoot, 'copied-progress.sqlite'), 40_000);
    try {
      const dataRoot = join(roots.inputRoot, 'root');
      await mkdir(dataRoot);
      const heard: Array<{ step: string; completedBytes: number; totalBytes: number }> = [];
      await writeDatabasePackage(db, dataRoot, join(roots.inputRoot, 'copied-progress.ai7db'), FACTS, { onProgress: (progress) => heard.push({ ...progress }) });
      const copying = heard.filter((progress) => progress.step === 'copying');
      const firstPacking = heard.findIndex((progress) => progress.step === 'packing');
      // Every copying reading comes before packing begins, and the copy's own measure rises to its whole, a page's bytes at a time.
      expect(firstPacking).toBe(copying.length);
      expect(copying.length).toBeGreaterThan(2);
      const pages = copying.at(-1)!;
      expect(pages.totalBytes).toBeGreaterThan(40_000 * 1000);
      expect(pages.completedBytes).toBe(pages.totalBytes);
      expect(copying.slice(1).every((progress, index) => progress.completedBytes >= copying[index]!.completedBytes)).toBe(true);
    } finally {
      db.close();
    }
  }, 180_000);

  it('stops a package whose copy of the store is stopped, leaving nothing', async () => {
    const db = storeOfBooks(join(roots.inputRoot, 'stopped.sqlite'), 40_000);
    try {
      const dataRoot = join(roots.inputRoot, 'root');
      await mkdir(dataRoot);
      const packagePath = join(roots.inputRoot, 'stopped.ai7db');
      const controller = new AbortController();
      let packed = 0;
      const making = writeDatabasePackage(db, dataRoot, packagePath, FACTS, { signal: controller.signal, onProgress: () => { packed += 1; } });
      // The event loop turns while the store is copied, and a stop asked for then is honoured before anything is packed.
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort();
      await expect(making).rejects.toMatchObject({ name: 'AbortError' });
      expect(packed).toBe(0);
      expect(readdirSync(roots.inputRoot).filter((name) => name.startsWith('stopped.ai7db'))).toEqual([]);
    } finally {
      db.close();
    }
  }, 180_000);

  it('walks the data root a directory at a time, refusing one it cannot package as soon as that is known', async () => {
    const root = join(roots.inputRoot, 'walk');
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, '1'), '1');
    await writeFile(join(root, '2'), '2');
    await writeFile(join(root, 'a', '3'), '33');
    await writeFile(join(root, 'a', 'b', '4'), '444');
    // The live store, the staging area and the shell's profile are never carried.
    for (const excluded of ['store', 'export-staging', 'shell']) {
      await mkdir(join(root, excluded));
      await writeFile(join(root, excluded, 'x'), 'x');
    }
    const bounds = { members: 6, directories: 3 };
    expect(await databasePackageSources(root, bounds)).toEqual([
      { member: '1', path: join(root, '1'), bytes: 1 },
      { member: '2', path: join(root, '2'), bytes: 1 },
      { member: 'a/3', path: join(root, 'a', '3'), bytes: 2 },
      { member: 'a/b/4', path: join(root, 'a', 'b', '4'), bytes: 3 },
    ]);
    const refused = (value: DatabasePackageBounds): Promise<unknown> =>
      databasePackageSources(root, value).then(() => 'no-error', (error: unknown) => (error as { code?: unknown }).code);
    // A listing holds no more names than the package could carry beside the store and the manifest: three at the top
    // are too many for a package of four, before any of them is walked.
    expect(await refused({ members: 4, directories: 3 })).toBe('DATABASE_PACKAGE_TOO_LARGE');
    // Names listed and not yet walked count as they are listed: the last directory's file is one too many for five.
    expect(await refused({ members: 5, directories: 3 })).toBe('DATABASE_PACKAGE_TOO_LARGE');
    // One more file anywhere is one too many, and so is one more directory, however few files it holds.
    await writeFile(join(root, 'a', 'b', '5'), '5');
    expect(await refused(bounds)).toBe('DATABASE_PACKAGE_TOO_LARGE');
    await rm(join(root, 'a', 'b', '5'));
    await mkdir(join(root, 'a', 'b', 'c'));
    expect(await refused(bounds)).toBe('DATABASE_PACKAGE_TOO_LARGE');
    // Directories are bounded on their own: a fourth is one too many for three, with room for every file.
    expect(await refused({ members: 100, directories: 3 })).toBe('DATABASE_PACKAGE_TOO_LARGE');
    expect(await refused({ members: 100, directories: 4 })).toBe('no-error');
  });
});
