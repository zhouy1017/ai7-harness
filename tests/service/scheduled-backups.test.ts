import { existsSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { SCHEDULED_BACKUP_TRIGGER_SQL, backupFileName } from '../../src/service/scheduled-backups.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_EXPORT_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7) over the real
// store, on clocks the cases name: the switch off by default; turning it on backs up at once into the fixed location beside the
// Agent Data Root, the database package of S86a; no second backup within the day and one after it; fourteen days kept, a file
// found gone recorded as such; turning it off removes nothing; the refusals; the ledgers refusing to be rewritten; and revision
// 56 added to a revision-55 store.

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
        enabled: false, ordinal: 0, location, keptDays: 14, backups: [], total: 0, nextDueAt: null,
      });
      expect(await store.runScheduledBackupIfDue(T)).toBe(false);
      expect(existsSync(location)).toBe(false);

      // Turned on, it backs up at once: the database package, in the fixed location beside the data.
      const on = await store.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect([on.enabled, on.ordinal, on.total, on.nextDueAt]).toEqual([true, 1, 1, at(DAY).toISOString()]);
      expect(on.backups[0]).toMatchObject({ fileName: backupFileName(T), createdAt: T.toISOString(), expiresAt: at(14 * DAY).toISOString(), present: true });
      const packaged = unzipSync(await readFile(join(location, backupFileName(T))));
      expect(parseCanonicalJson(strFromU8(packaged['manifest.json']!))).toMatchObject({
        schema: 'ai7.database-package/1', origin: 'scheduled-backup', dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, credentials: 'excluded',
      });
      expect((await readdir(location)).filter((name) => name.endsWith('.partial'))).toEqual([]);

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
      const reasons = (() => {
        const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          return (database.prepare('SELECT reason FROM scheduled_backup_removals ORDER BY removed_at').all() as { reason: string }[]).map((row) => row.reason);
        } finally {
          database.close();
        }
      })();
      expect(reasons).toEqual(['expired', 'missing']);

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
});
