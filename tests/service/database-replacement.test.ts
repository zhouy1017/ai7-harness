import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCanonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import {
  DATABASE_REPLACEMENT_TRIGGER_SQL,
  preReplaceBackupFileName,
  readPendingReplacement,
  replacementStagingFor,
  writeReplacementIntent,
  type ReplacementIntent,
} from '../../src/service/database-replacement.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_REPLACEMENT_SCHEMA_VERSION, SCHEDULED_BACKUP_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

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
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE marker (value TEXT) STRICT; PRAGMA user_version = ${schemaRevision};`);
    const path = join(roots.inputRoot, name);
    await writeDatabasePackage(database, other, path, {
      dataVersion, softwareVersion: '0.1.0', schemaRevision, createdAt: T.toISOString(), origin: 'database-export', contents,
    });
    return path;
  } finally {
    database.close();
  }
}

const backups = (): string => `${roots.dataRoot}-backups`;

describe('导入数据库 over the real store', () => {
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
        dataVersion: 1,
        localDataVersion: 1,
        schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION,
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
        origin: 'pre-replace-backup', dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, credentials: 'excluded',
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
      const rolling = await store.rollBackDatabaseReplacement(replacementId, LATER);
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
      const broken = await handmade('坏数据库.ai7db', 1, DATABASE_REPLACEMENT_SCHEMA_VERSION);
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
      // A package from a newer Data Version, or from a newer AI7, is previewed and refused.
      for (const [name, dataVersion, revision, compatibility] of [
        ['新数据版本.ai7db', 2, DATABASE_REPLACEMENT_SCHEMA_VERSION, 'newer-data-version'],
        ['新软件.ai7db', 1, DATABASE_REPLACEMENT_SCHEMA_VERSION + 1, 'newer-schema'],
      ] as const) {
        const preview = await store.inspectDatabaseImport(await handmade(name, dataVersion, revision));
        expect(preview.compatibility).toBe(compatibility);
        expect(await refusal(() => store.prepareDatabaseReplacement(preview.previewId, T))).toBe('DATABASE_IMPORT_INCOMPATIBLE');
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

  it('keeps its records as written, and adds revision 57 to a revision-56 store', async () => {
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

    // A revision-56 store gains the empty ledger, and nothing else moves.
    database = new DatabaseSync(path);
    try {
      database.exec(`DROP TABLE database_replacements; PRAGMA user_version = ${SCHEDULED_BACKUP_SCHEMA_VERSION};`);
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(await store.inspectDatabaseReplacements()).toMatchObject({ pending: null, replacements: [], total: 0 });
      expect(titles(store)).toEqual(['甲书']);
    } finally {
      store.close();
    }
    database = new DatabaseSync(path, { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_REPLACEMENT_SCHEMA_VERSION);
    } finally {
      database.close();
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
      // Once it is written, the check runs as ever.
      expect(await store.runScheduledBackupIfDue(hours(25))).toBe(true);
      const names = await readdir(backups());
      expect([names.includes(preReplaceBackupFileName(LATER)), names.filter((name) => name.includes('.partial'))]).toEqual([true, []]);
      expect(store.inspectScheduledBackups(hours(25)).total).toBe(2);
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
      expect(await store.runScheduledBackupIfDue(hours(74))).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});
