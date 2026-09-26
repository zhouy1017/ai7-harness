import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import {
  SCHEDULED_BACKUP_TRIGGER_SQL,
  ScheduledBackups,
  backupFailureReason,
  backupFileName,
  backupLocationFor,
  initializeScheduledBackupSchema,
} from '../../src/service/scheduled-backups.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_EXPORT_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION, SCHEDULED_BACKUP_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7) over the real
// store, on clocks the cases name: the switch off by default; turning it on answers at once and backs up on the background check
// into the fixed location beside the Agent Data Root, the database package of S86a; no second backup within the day and one
// after it; fourteen days kept, a file found gone recorded as such; turning it off removes nothing; the refusals; the ledgers
// refusing to be rewritten; and revision 56 added to a revision-55 store. The review's cases (Issue #434 review): only a file
// the check made is removed, each removal on its own and before any write; what a cut-off check left is cleared, a file never
// recorded is not left, and a stop at shutdown leaves nothing it wrote.

const databasePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');

/** Each removal's reason, oldest backup first. */
function removalReasons(): string[] {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return (database.prepare(
      'SELECT r.reason FROM scheduled_backup_removals r JOIN scheduled_backups b ON b.backup_id = r.backup_id ORDER BY b.created_at',
    ).all() as { reason: string }[]).map((row) => row.reason);
  } finally {
    database.close();
  }
}

/** A change made beside the open store, as another connection to the same file would make it. */
function beside(sql: string): void {
  const database = new DatabaseSync(databasePath());
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-scheduled-backup-');
});

afterEach(async () => {
  await rm(`${roots.dataRoot}-backups`, { recursive: true, force: true });
  await roots.dispose();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T = new Date('2026-09-25T02:00:00.000Z');
const at = (offset: number): Date => new Date(T.getTime() + offset);

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

describe('定期自动备份 over the real store', () => {
  it('backs up once a day while the switch is on, keeps fourteen days, and removes nothing when it is turned off', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const location = `${roots.dataRoot}-backups`;
      // Off by default: nothing is backed up, and nothing is due.
      expect(store.inspectScheduledBackups(T)).toEqual({
        enabled: false, ordinal: 0, location, keptDays: 14, backups: [], total: 0, nextDueAt: null, backingUp: false, lastFailure: null,
      });
      expect(await store.runScheduledBackupIfDue(T)).toBe(false);
      expect(existsSync(location)).toBe(false);

      // Turned on, the switch is answered at once, and the backup is written on the service's background check (Issue #434
      // review): the database package, in the fixed location beside the data.
      const on = await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect([on.enabled, on.ordinal, on.total, on.backingUp, on.nextDueAt]).toEqual([true, 1, 0, true, T.toISOString()]);
      // Asked while that check runs, the check answers with it.
      expect(await store.runScheduledBackupIfDue(T)).toBe(true);
      const made = store.inspectScheduledBackups(T);
      expect([made.total, made.backingUp, made.lastFailure, made.nextDueAt]).toEqual([1, false, null, at(DAY).toISOString()]);
      expect(made.backups[0]).toMatchObject({ fileName: backupFileName(T), createdAt: T.toISOString(), expiresAt: at(14 * DAY).toISOString(), present: true });
      const packaged = unzipSync(await readFile(join(location, backupFileName(T))));
      expect(parseCanonicalJson(strFromU8(packaged['manifest.json']!))).toMatchObject({
        schema: 'ai7.database-package/1', origin: 'scheduled-backup', dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, credentials: 'excluded',
      });
      expect((await readdir(location)).filter((name) => name.includes('.partial'))).toEqual([]);

      // Not again within the day; once more after it.
      expect(await store.runScheduledBackupIfDue(at(HOUR))).toBe(false);
      expect(await store.runScheduledBackupIfDue(at(DAY + HOUR))).toBe(true);
      expect(store.inspectScheduledBackups(at(DAY + HOUR)).total).toBe(2);

      // A kept backup whose file was taken away says so, and is recorded as found gone when its fourteen days pass.
      await rm(join(location, backupFileName(at(DAY + HOUR))));
      expect(store.inspectScheduledBackups(at(DAY + 2 * HOUR)).backups[0]!.present).toBe(false);

      // Fourteen days on, the first is removed with its file, and a new one is made.
      expect(await store.runScheduledBackupIfDue(at(14 * DAY + 3 * HOUR))).toBe(true);
      const later = store.inspectScheduledBackups(at(14 * DAY + 3 * HOUR));
      expect(later.backups.map((backup) => backup.createdAt)).toEqual([at(14 * DAY + 3 * HOUR).toISOString(), at(DAY + HOUR).toISOString()]);
      expect(existsSync(join(location, backupFileName(T)))).toBe(false);
      // The next day's check makes no backup — the newest is not a day old — and still removes the one whose days passed.
      expect(await store.runScheduledBackupIfDue(at(15 * DAY + 2 * HOUR))).toBe(false);
      expect(removalReasons()).toEqual(['expired', 'missing']);

      // Turned off: no more backups, and those kept stay until their fourteen days pass.
      const off = await store.setScheduledBackup({ enabled: false, expectedOrdinal: 1 }, at(15 * DAY + 3 * HOUR));
      expect([off.enabled, off.ordinal, off.total, off.nextDueAt]).toEqual([false, 2, 1, null]);
      expect(await store.runScheduledBackupIfDue(at(17 * DAY))).toBe(false);
      expect(store.inspectScheduledBackups(at(17 * DAY)).total).toBe(1);

      // A change from a state the editor no longer sees, or to the state it is in, is refused.
      expect(code(await store.setScheduledBackup({ enabled: true, expectedOrdinal: 1 }, at(17 * DAY)).catch((error: unknown) => error))).toBe('SCHEDULED_BACKUP_STALE');
      expect(code(await store.setScheduledBackup({ enabled: false, expectedOrdinal: 2 }, at(17 * DAY)).catch((error: unknown) => error))).toBe('SCHEDULED_BACKUP_UNCHANGED');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The switch and the backups stand after a restart.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect([reopened.inspectScheduledBackups(at(17 * DAY)).enabled, reopened.inspectScheduledBackups(at(17 * DAY)).total]).toEqual([false, 1]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('keeps its records as ledgers read back against their digests, and adds revision 56 to a revision-55 store', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await store.runScheduledBackupIfDue(T)).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const tamper = new DatabaseSync(databasePath);
    try {
      for (const table of ['backup_preferences', 'scheduled_backups']) {
        expect(() => tamper.exec(`UPDATE ${table} SET canonical_json = canonical_json`)).toThrowError(/SCHEDULED_BACKUP_LEDGER_IMMUTABLE/u);
        expect(() => tamper.exec(`DELETE FROM ${table}`)).toThrowError(/SCHEDULED_BACKUP_LEDGER_IMMUTABLE/u);
      }
      // A switch change rewritten in its row and record, its digest left as it was, no longer reads.
      tamper.exec('DROP TRIGGER backup_preferences_no_update');
      const preference = tamper.prepare('SELECT canonical_json FROM backup_preferences').get() as { canonical_json: string };
      tamper.prepare('UPDATE backup_preferences SET enabled = 0, canonical_json = ?')
        .run(canonicalRecord({ ...(parseCanonicalJson(preference.canonical_json) as Record<string, unknown>), enabled: false }).json);
      tamper.exec(SCHEDULED_BACKUP_TRIGGER_SQL.backup_preferences_no_update!);
    } finally {
      tamper.close();
    }
    const refusedPreference = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code((() => {
        try {
          return refusedPreference.inspectScheduledBackups(T);
        } catch (error) {
          return error;
        }
      })())).toBe('SCHEDULED_BACKUP_RECORD_INVALID');
      refusedPreference.markCleanShutdown();
    } finally {
      refusedPreference.close();
    }
    const restore = new DatabaseSync(databasePath);
    try {
      restore.exec('DROP TRIGGER backup_preferences_no_update');
      const preference = restore.prepare('SELECT canonical_json FROM backup_preferences').get() as { canonical_json: string };
      restore.prepare('UPDATE backup_preferences SET enabled = 1, canonical_json = ?')
        .run(canonicalRecord({ ...(parseCanonicalJson(preference.canonical_json) as Record<string, unknown>), enabled: true }).json);
      restore.exec(SCHEDULED_BACKUP_TRIGGER_SQL.backup_preferences_no_update!);
    } finally {
      restore.close();
    }
    // A switch change rewritten whole — row, record and digest agreeing — so that only its place in the chain is wrong.
    const chain = new DatabaseSync(databasePath);
    let original: { ordinal: number; supersedes: string | null; canonical_json: string; sha256: string };
    try {
      chain.exec('DROP TRIGGER backup_preferences_no_update');
      const row = chain.prepare('SELECT preference_id, ordinal, supersedes_preference_id supersedes, canonical_json, sha256 FROM backup_preferences').get() as
        { preference_id: string; ordinal: number; supersedes: string | null; canonical_json: string; sha256: string };
      original = row;
      const moved = canonicalRecord({ ...(parseCanonicalJson(row.canonical_json) as Record<string, unknown>), ordinal: 2, supersedes: row.preference_id });
      chain.prepare('UPDATE backup_preferences SET ordinal = 2, supersedes_preference_id = preference_id, canonical_json = ?, sha256 = ?').run(moved.json, moved.digest);
      chain.exec(SCHEDULED_BACKUP_TRIGGER_SQL.backup_preferences_no_update!);
    } finally {
      chain.close();
    }
    const refusedChain = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code((() => {
        try {
          return refusedChain.inspectScheduledBackups(T);
        } catch (error) {
          return error;
        }
      })())).toBe('SCHEDULED_BACKUP_RECORD_INVALID');
      refusedChain.markCleanShutdown();
    } finally {
      refusedChain.close();
    }
    const unchain = new DatabaseSync(databasePath);
    try {
      unchain.exec('DROP TRIGGER backup_preferences_no_update');
      unchain.prepare('UPDATE backup_preferences SET ordinal = ?, supersedes_preference_id = ?, canonical_json = ?, sha256 = ?')
        .run(original!.ordinal, original!.supersedes, original!.canonical_json, original!.sha256);
      unchain.exec(SCHEDULED_BACKUP_TRIGGER_SQL.backup_preferences_no_update!);
    } finally {
      unchain.close();
    }
    const tamperBackup = new DatabaseSync(databasePath);
    try {
      // A backup's record rewritten by hand, digest and all, no longer reads.
      tamperBackup.exec('DROP TRIGGER scheduled_backups_no_update');
      const row = tamperBackup.prepare('SELECT canonical_json FROM scheduled_backups').get() as { canonical_json: string };
      const rewritten = canonicalRecord({ ...(parseCanonicalJson(row.canonical_json) as Record<string, unknown>), byteLength: 1 });
      tamperBackup.prepare('UPDATE scheduled_backups SET canonical_json = ?, sha256 = ?').run(rewritten.json, rewritten.digest);
      tamperBackup.exec(SCHEDULED_BACKUP_TRIGGER_SQL.scheduled_backups_no_update!);
    } finally {
      tamperBackup.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code((() => {
        try {
          return reopened.inspectScheduledBackups(T);
        } catch (error) {
          return error;
        }
      })())).toBe('SCHEDULED_BACKUP_RECORD_INVALID');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }

    // A store as revision 55 left it gains the three empty ledgers, and the switch starts off.
    const other = await createServiceTestRoots('ai7-service-scheduled-backup-migration-');
    try {
      const first = await EditorialStore.open(other.dataRoot, other.codeRoot);
      first.markCleanShutdown();
      first.close();
      const plant = new DatabaseSync(join(other.dataRoot, 'store', 'ai7.sqlite'));
      try {
        plant.exec(`DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; PRAGMA user_version = ${DATABASE_EXPORT_SCHEMA_VERSION};`);
      } finally {
        plant.close();
      }
      const migrated = await EditorialStore.open(other.dataRoot, other.codeRoot);
      try {
        expect([migrated.inspectScheduledBackups(T).enabled, migrated.inspectScheduledBackups(T).total]).toEqual([false, 0]);
        migrated.markCleanShutdown();
      } finally {
        migrated.close();
      }
      const check = new DatabaseSync(join(other.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_REPLACEMENT_SCHEMA_VERSION);
      } finally {
        check.close();
      }
    } finally {
      await other.dispose();
    }
  }, 180_000);

  it('removes only a file it made, each removal before any write, and clears what a cut-off check left (Issue #434 review)', async () => {
    const location = `${roots.dataRoot}-backups`;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await store.runScheduledBackupIfDue(T)).toBe(true);
      expect(await store.runScheduledBackupIfDue(at(DAY))).toBe(true);
      expect(await store.runScheduledBackupIfDue(at(2 * DAY))).toBe(true);
      // The second backup's file is replaced by other bytes of the same size: it is no longer the file AI7 made.
      const second = join(location, backupFileName(at(DAY)));
      await writeFile(second, Buffer.alloc((await stat(second)).size, 7));
      // What a check cut off left — its package, the store copy it was made from and the journals SQLite keeps beside that copy
      // while it is made (Issue #434 review) — and, beside them, what is not a check's.
      const copy = `.${randomUUID()}.ai7db.partial.store`;
      const leftovers = [`.${randomUUID()}.ai7db.partial`, copy, `${copy}-journal`, `${copy}-wal`, `${copy}-shm`];
      for (const name of leftovers) await writeFile(join(location, name), 'cut off');
      const others = ['.keep', 'notes.txt', `.${randomUUID()}.ai7db.partial.bak`];
      for (const name of others) await writeFile(join(location, name), 'not a check\'s');
      const folder = `.${randomUUID()}.ai7db.partial`;
      await mkdir(join(location, folder));
      // The name this check's backup would take is taken already, so its write fails — after the removals, not instead of them.
      const taken = join(location, backupFileName(at(15 * DAY)));
      await writeFile(taken, 'someone else\'s');
      expect(code(await store.runScheduledBackupIfDue(at(15 * DAY)).catch((error: unknown) => error))).toBe('SCHEDULED_BACKUP_EXISTS');
      // The first backup's fourteen days passed: removed with its file. The second's file is another: left where it is.
      expect([existsSync(join(location, backupFileName(T))), existsSync(second), await readFile(taken, 'utf8')]).toEqual([false, true, 'someone else\'s']);
      expect(removalReasons()).toEqual(['expired', 'changed']);
      const failed = store.inspectScheduledBackups(at(15 * DAY));
      expect(failed.backups.map((backup) => backup.createdAt)).toEqual([at(2 * DAY).toISOString()]);
      expect([failed.backingUp, failed.lastFailure]).toEqual([false, { at: at(15 * DAY).toISOString(), reason: 'other' }]);
      const names = await readdir(location);
      expect([leftovers.filter((name) => names.includes(name)), [...others, folder].every((name) => names.includes(name))]).toEqual([[], true]);
      // Turned off, the failure is no longer stated; turned on again, the check it starts makes the backup.
      expect((await store.setScheduledBackup({ enabled: false, expectedOrdinal: 1 }, at(15 * DAY))).lastFailure).toBeNull();
      expect((await store.setScheduledBackup({ enabled: true, expectedOrdinal: 2 }, at(15 * DAY + HOUR))).backingUp).toBe(true);
      expect(await store.runScheduledBackupIfDue(at(15 * DAY + HOUR))).toBe(true);
      expect(store.inspectScheduledBackups(at(15 * DAY + HOUR))).toMatchObject({ total: 2, backingUp: false, lastFailure: null });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('leaves no file a record does not name, and one removal failing stops none of the others (Issue #434 review)', async () => {
    const location = `${roots.dataRoot}-backups`;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await store.runScheduledBackupIfDue(T)).toBe(true);
      expect(await store.runScheduledBackupIfDue(at(DAY))).toBe(true);
      const [second, first] = store.inspectScheduledBackups(at(DAY)).backups;
      // A backup written and renamed into place whose record cannot be written is removed, not left unlisted.
      beside(`CREATE TRIGGER test_refuse_backup BEFORE INSERT ON scheduled_backups BEGIN SELECT RAISE(ABORT, 'TEST_REFUSED'); END`);
      expect(String(await store.runScheduledBackupIfDue(at(2 * DAY)).catch((error: unknown) => error))).toMatch(/TEST_REFUSED/u);
      expect((await readdir(location)).sort()).toEqual([backupFileName(T), backupFileName(at(DAY))].sort());
      expect(store.inspectScheduledBackups(at(2 * DAY)).lastFailure).toEqual({ at: at(2 * DAY).toISOString(), reason: 'other' });
      beside('DROP TRIGGER test_refuse_backup');
      // The second backup's removal cannot be recorded: the first is still removed, and the check still backs up.
      beside(`CREATE TRIGGER test_refuse_removal BEFORE INSERT ON scheduled_backup_removals WHEN NEW.backup_id = '${second!.backupId}'
        BEGIN SELECT RAISE(ABORT, 'TEST_REFUSED'); END`);
      expect(await store.runScheduledBackupIfDue(at(15 * DAY + HOUR))).toBe(true);
      const after = store.inspectScheduledBackups(at(15 * DAY + HOUR));
      expect(after.backups.map((backup) => [backup.backupId === second!.backupId, backup.present])).toEqual([[false, true], [true, false]]);
      expect(after.backups.some((backup) => backup.backupId === first!.backupId)).toBe(false);
      // The backup made says no more of the one that could not be recorded.
      expect(after.lastFailure).toBeNull();
      beside('DROP TRIGGER test_refuse_removal');
      // The next check records the second as found gone.
      expect(await store.runScheduledBackupIfDue(at(15 * DAY + 2 * HOUR))).toBe(false);
      expect(removalReasons()).toEqual(['expired', 'missing']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('refuses a record naming anything but a backup of its own, and never removes it (Issue #434 review)', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    first.markCleanShutdown();
    first.close();
    // The editor's own file beside the data, and a record naming it from the backup location, its size and digest its own.
    const victim = join(roots.inputRoot, 'victim.txt');
    await writeFile(victim, 'the editor\'s own file');
    await mkdir(`${roots.dataRoot}-backups`);
    const bytes = await readFile(victim);
    const backupId = randomUUID();
    const contents = { books: 0, sourceVersions: 0, libraryMaterials: 0, series: 0 };
    const createdAt = at(-15 * DAY).toISOString();
    const planted = {
      schema: 'ai7.scheduled-backup/1', backupId, fileName: '../input/victim.txt', byteLength: bytes.byteLength,
      fileSha256: createHash('sha256').update(bytes).digest('hex'), dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION,
      softwareVersion: '0.1.0', contents, createdAt,
    };
    const record = canonicalRecord(planted);
    const plant = new DatabaseSync(databasePath());
    try {
      const insert = (): void => {
        plant.prepare(
          `INSERT INTO scheduled_backups(backup_id, file_name, byte_length, file_sha256, data_version, schema_revision, software_version, contents_json, created_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(backupId, planted.fileName, planted.byteLength, planted.fileSha256, 1, DATABASE_REPLACEMENT_SCHEMA_VERSION, '0.1.0',
          JSON.stringify(contents), createdAt, record.json, record.digest);
      };
      // The relation refuses the name itself…
      expect(insert).toThrowError(/CHECK constraint failed/u);
      // …and a record put there around it is refused as it is read, before anything is removed.
      plant.exec('PRAGMA ignore_check_constraints = ON');
      insert();
    } finally {
      plant.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code((() => {
        try {
          return reopened.inspectScheduledBackups(T);
        } catch (error) {
          return error;
        }
      })())).toBe('SCHEDULED_BACKUP_RECORD_INVALID');
      expect(code(await reopened.runScheduledBackupIfDue(T).catch((error: unknown) => error))).toBe('SCHEDULED_BACKUP_RECORD_INVALID');
      expect(await readFile(victim, 'utf8')).toBe('the editor\'s own file');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('stops a check under way at shutdown, leaving nothing it wrote, and starts none after (Issue #434 review)', async () => {
    const location = `${roots.dataRoot}-backups`;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T)).backingUp).toBe(true);
      await store.stopScheduledBackups();
      expect(store.inspectScheduledBackups(T)).toMatchObject({ total: 0, backingUp: false, lastFailure: null });
      expect(await store.runScheduledBackupIfDue(T)).toBe(false);
      expect(existsSync(location) ? await readdir(location) : []).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The next start makes the backup the stopped check did not.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(await reopened.runScheduledBackupIfDue(T)).toBe(true);
      expect(await readdir(location)).toEqual([backupFileName(T)]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('stops writing a package when asked, leaving neither the package nor its store copy (Issue #434 review)', async () => {
    const dataRoot = join(roots.inputRoot, 'data');
    await mkdir(dataRoot);
    await writeFile(join(dataRoot, 'object.bin'), Buffer.alloc(3 * 1024 * 1024, 1));
    const db = new DatabaseSync(join(roots.inputRoot, 'plain.sqlite'));
    try {
      db.exec('CREATE TABLE kept(value TEXT)');
      const packagePath = join(roots.inputRoot, 'cut.ai7db');
      const facts = {
        dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, createdAt: T.toISOString(),
        origin: 'scheduled-backup' as const, contents: { books: 0, sourceVersions: 0, libraryMaterials: 0, series: 0 },
      };
      const leftBehind = (): boolean[] => [existsSync(packagePath), existsSync(`${packagePath}.store`)];
      // Asked before it starts — as when the store has closed already — it reads nothing and writes nothing.
      const closed = new DatabaseSync(':memory:');
      closed.close();
      const before = new AbortController();
      before.abort();
      await expect(writeDatabasePackage(closed, dataRoot, packagePath, () => facts, { signal: before.signal })).rejects.toThrowError(/aborted/u);
      expect(leftBehind()).toEqual([false, false]);
      // Asked once it is under way, it stops at its next chunk and removes what it wrote.
      const during = new AbortController();
      const writing = writeDatabasePackage(db, dataRoot, packagePath, () => facts, { signal: during.signal });
      during.abort();
      await expect(writing).rejects.toThrowError(/aborted/u);
      expect(leftBehind()).toEqual([false, false]);
      // Not asked, it writes the package whole.
      expect((await writeDatabasePackage(db, dataRoot, packagePath, () => facts)).members.map((member) => member.path)).toEqual(['store/ai7.sqlite', 'object.bin']);
      expect(leftBehind()).toEqual([true, false]);
    } finally {
      db.close();
    }
  }, 180_000);

  it('lets another write into the backup location run alone: after the check under way, and with none starting meanwhile (Issue #434, S86c restack)', async () => {
    const dataRoot = join(roots.inputRoot, 'data');
    await mkdir(dataRoot);
    const location = backupLocationFor(dataRoot);
    const db = new DatabaseSync(':memory:');
    try {
      initializeScheduledBackupSchema(db);
      const backups = new ScheduledBackups(db, dataRoot, {
        facts: () => ({ dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION }),
      });
      backups.setEnabled(true, 0);
      // A write asked while a check runs starts only once that check has made its backup.
      const check = backups.runIfDue(T);
      const seen = await backups.alone(async () => backups.projection(T));
      expect([await check, seen.total, seen.backingUp]).toEqual([true, 1, false]);
      // While a write runs, a check starts nothing, and its sweep never takes the file that write is making.
      const making = join(location, `.${randomUUID()}.ai7db.partial`);
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const writing = backups.alone(async () => {
        await writeFile(making, 'being written');
        await released;
      });
      while (!existsSync(making)) await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await backups.runIfDue(at(DAY))).toBe(false);
      expect(existsSync(making)).toBe(true);
      release();
      await writing;
      // Once it has ended, the check runs: a file it left is swept, and the backup made.
      expect(await backups.runIfDue(at(DAY))).toBe(true);
      expect(existsSync(making)).toBe(false);
      await backups.stop();
    } finally {
      db.close();
    }
  }, 180_000);
});

describe('定期自动备份 at its second review (Issue #434 review)', () => {
  it('never puts a backup over a file that appeared at its name while it was written, and records none', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const location = `${roots.dataRoot}-backups`;
    try {
      // Enough data that the package takes many chunks to write.
      await mkdir(join(roots.dataRoot, 'bulk'), { recursive: true });
      await writeFile(join(roots.dataRoot, 'bulk', 'filler.bin'), randomBytes(24 << 20));
      // Turning the switch on starts the check; once it writes, another program puts a file at the backup's name.
      await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      const deadline = Date.now() + 60_000;
      while (!(existsSync(location) && readdirSync(location).some((name) => /\.ai7db\.partial$/u.test(name)))) {
        if (Date.now() > deadline) throw new Error('timed out waiting for the backup to be written');
        await new Promise((resolve) => setImmediate(resolve));
      }
      await writeFile(join(location, backupFileName(T)), 'another program put this here');
      const refused = await store.runScheduledBackupIfDue(T).then(() => 'no-error', (error: unknown) => (error as { code?: unknown }).code);
      expect(refused).toBe('SCHEDULED_BACKUP_EXISTS');
      expect(await readFile(join(location, backupFileName(T)), 'utf8')).toBe('another program put this here');
      expect(readdirSync(location).filter((name) => name.includes('.partial'))).toEqual([]);
      expect(store.inspectScheduledBackups(T)).toMatchObject({ total: 0, backups: [], backingUp: false, lastFailure: { at: T.toISOString(), reason: 'other' } });
      // A volume that cannot take a name without a hard link is a location that cannot hold a backup.
      expect(backupFailureReason({ code: 'BACKUP_LOCATION_UNSUPPORTED' })).toBe('location-unavailable');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('lists the newest backups kept and counts the rest, and removes those whose days passed a turn at a time, however many', async () => {
    const created = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      created.markCleanShutdown();
    } finally {
      created.close();
    }
    // Twenty-one backups kept, each older than fourteen days: more than a projection lists and than a check reads at a time.
    const location = `${roots.dataRoot}-backups`;
    await mkdir(location, { recursive: true });
    const database = new DatabaseSync(databasePath());
    try {
      for (let index = 0; index < 21; index += 1) {
        const createdAt = at(-(15 + index) * DAY);
        const fileName = backupFileName(createdAt);
        const bytes = Buffer.from(`backup ${index}`);
        await writeFile(join(location, fileName), bytes);
        const backupId = randomUUID();
        const contents = { books: 0, sourceVersions: 0, libraryMaterials: 0, series: 0 };
        const fileSha256 = createHash('sha256').update(bytes).digest('hex');
        const record = canonicalRecord({
          schema: 'ai7.scheduled-backup/1', backupId, fileName, byteLength: bytes.byteLength, fileSha256, dataVersion: 1,
          schemaRevision: SCHEDULED_BACKUP_SCHEMA_VERSION, softwareVersion: '0.1.0', contents, createdAt: createdAt.toISOString(),
        });
        database.prepare(
          `INSERT INTO scheduled_backups(backup_id, file_name, byte_length, file_sha256, data_version, schema_revision, software_version, contents_json, created_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(backupId, fileName, bytes.byteLength, fileSha256, 1, SCHEDULED_BACKUP_SCHEMA_VERSION, '0.1.0', JSON.stringify(contents),
          createdAt.toISOString(), record.json, record.digest);
      }
    } finally {
      database.close();
    }
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const listed = store.inspectScheduledBackups(T);
      expect([listed.backups.length, listed.total]).toEqual([20, 21]);
      expect(listed.backups[0]!.createdAt).toBe(at(-15 * DAY).toISOString());
      // The switch is off, so the check makes no backup, and it still removes every one whose days passed.
      expect(await store.runScheduledBackupIfDue(T)).toBe(false);
      expect(removalReasons()).toEqual(Array.from({ length: 21 }, () => 'expired'));
      expect(readdirSync(location)).toEqual([]);
      expect(store.inspectScheduledBackups(T)).toMatchObject({ total: 0, backups: [] });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});
