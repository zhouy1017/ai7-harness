import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { DATA_VERSION_TRIGGER_SQL, PRE_UPGRADE_BACKUP_NAME, type ClassifiedSchemaRevision, type DataVersionUpgrade } from '../../src/service/data-version.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_MERGE_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { backUpBeforeUpgrade, preUpgradeBackupFileName, writePendingUpgrade } from '../../src/service/upgrade-backup.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 升级前备份 (Issue #433, plan slice S85b; V2-UX-DSTO-016; ADR 0079 §1.1, §1.3, §1.4) over the
// real store. Nothing is frozen before the first packaged release, so no revision is breaking yet: the suite opens a store with
// its own classification, in which the terminal revision is breaking, over a store as the revision before left it. The data is
// backed up whole before anything migrates it, the upgrade and its backup are stated, a backup that cannot be made opens
// nothing, a store already at this software's Data Version is opened without one, and an upgrade record rewritten by hand is
// refused.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-upgrade-backup-');
});

afterEach(async () => {
  await rm(`${roots.dataRoot}-backups`, { recursive: true, force: true });
  await roots.dispose();
});

const CHANGE = '导入记录同时记下合并';
const BREAKING: ReadonlyArray<ClassifiedSchemaRevision> = [{ revision: DATABASE_MERGE_SCHEMA_VERSION, class: 'breaking', change: CHANGE }];
/** Revisions 57 and 58 both breaking: Data Version 1 at revision 56, 2 at 57 and 3 at 58. */
const BOTH: ReadonlyArray<ClassifiedSchemaRevision> = [
  { revision: DATABASE_REPLACEMENT_SCHEMA_VERSION, class: 'breaking', change: '替换记录' },
  { revision: DATABASE_MERGE_SCHEMA_VERSION, class: 'breaking', change: CHANGE },
];
/** Revisions 56, 57 and 58 all breaking: Data Version 1 at revision 55, 2 at 56, 3 at 57 and 4 at 58. */
const THREE: ReadonlyArray<ClassifiedSchemaRevision> = [
  { revision: DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, class: 'breaking', change: '定时备份' },
  ...BOTH,
];

/** An upgrade an earlier software made, as its note names it, with a backup of its own. */
function madeUpgrade(fromDataVersion: number, fromSchemaRevision: number, fromSoftwareVersion: string, changes: string[], clock: string): DataVersionUpgrade {
  return {
    fromDataVersion, fromSchemaRevision, fromSoftwareVersion, changes,
    backup: { fileName: `AI7 升级前备份 2026-09-26 ${clock}.ai7db`, byteLength: 1, sha256: 'a'.repeat(64) },
  };
}

/** 0.0.10's upgrade, under BOTH: from Data Version 1 at revision 56 to 2 at 57. */
const THEIRS = madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, '0.0.9', ['替换记录'], '09-00-00');
const THEIR_TARGET = { softwareVersion: '0.0.10', dataVersion: 2, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION };

const storePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');
const backups = (): string => `${roots.dataRoot}-backups`;
/** The note an open leaves beside the store between its backup and its record of the upgrade (Issue #433 review). */
const note = (): string => join(roots.dataRoot, 'store', 'upgrade-pending.json');
const upgradeBackups = async (): Promise<string[]> => (await readdir(backups())).filter((name) => name.startsWith('AI7 升级前备份 ')).sort();
const T = new Date(2026, 8, 26, 10, 0, 0);

function code(error: unknown): unknown {
  return error instanceof StoreError || (error instanceof Error && 'code' in error) ? (error as { code: unknown }).code : error;
}

async function packageVersion(): Promise<string> {
  return (JSON.parse(await readFile(join(roots.codeRoot, 'package.json'), 'utf8')) as { version: string }).version;
}

/** Open as the service entry does, under the suite's classification when one is given, stopped where the suite asks. */
function open(classes?: ReadonlyArray<ClassifiedSchemaRevision>, interruptUpgradeAt?: 'before-record' | 'after-record'): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null,
    ...(classes === undefined ? {} : { schemaRevisionClasses: classes }),
    ...(interruptUpgradeAt === undefined ? {} : { interruptUpgradeAt }),
  });
}

/** An open that fails: what it failed with. */
async function refusal(opening: Promise<EditorialStore>): Promise<unknown> {
  return opening.then((store) => {
    store.close();
    return null;
  }, (error: unknown) => error);
}

/** A store with one Book, then as the revision before the terminal one left it. */
async function storeBeforeUpgrade(): Promise<void> {
  const store = await open();
  try {
    const creation = store.prepareBookCreation('升级之前', null);
    store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest });
    store.markCleanShutdown();
  } finally {
    store.close();
  }
  const plant = new DatabaseSync(storePath());
  try {
    plant.exec(`DROP TABLE database_merge_books; DROP TABLE database_merges; PRAGMA user_version = ${DATABASE_REPLACEMENT_SCHEMA_VERSION};`);
  } finally {
    plant.close();
  }
}

/** The upgrades 版本 states, newest first: whose, from and to which Data Version, and what changed. */
function upgradesOf(store: EditorialStore): unknown[] {
  return store.inspectDataVersion().upgrades.map((upgrade) => [upgrade.softwareVersion, upgrade.fromDataVersion, upgrade.toDataVersion, upgrade.changes]);
}

/** The versions that opened the store, newest first. */
function historyOf(store: EditorialStore): Array<[string, number, number]> {
  return store.inspectDataVersion().history.map((entry) => [entry.softwareVersion, entry.dataVersion, entry.schemaRevision]);
}

function userVersion(path: string): number {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  } finally {
    database.close();
  }
}

describe('升级前备份 over the real store', () => {
  it('backs the data up whole before an upgrade to a later Data Version, states the change, and names the backup to go back to', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    let store = await open(BREAKING);
    let backupFileName: string;
    try {
      const version = store.inspectDataVersion();
      expect([version.dataVersion, version.schemaRevision, version.backupLocation, version.upgrades.length])
        .toEqual([2, DATABASE_MERGE_SCHEMA_VERSION, backups(), 1]);
      const [upgrade] = version.upgrades;
      expect(upgrade).toMatchObject({
        fromDataVersion: 1, toDataVersion: 2, fromSoftwareVersion: software, softwareVersion: software, changes: [CHANGE], backupPresent: true,
      });
      backupFileName = upgrade!.backupFileName;
      expect(backupFileName).toMatch(PRE_UPGRADE_BACKUP_NAME);
      // The software update is stated as the one that changed the Data Version.
      expect([version.update, version.history.map((entry) => entry.dataVersion)]).toEqual([null, [2, 1]]);
      // The backup is the data as it was: the package of the revision before, at Data Version 1, with its Book, and no
      // half-written file beside it.
      const packaged = unzipSync(await readFile(join(backups(), backupFileName)));
      expect(parseCanonicalJson(strFromU8(packaged['manifest.json']!))).toMatchObject({
        schema: 'ai7.database-package/1', origin: 'pre-upgrade-backup', dataVersion: 1, softwareVersion: software,
        schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, contents: { books: 1 }, credentials: 'excluded',
      });
      const copy = join(roots.inputRoot, 'before.sqlite');
      await writeFile(copy, packaged['store/ai7.sqlite']!);
      expect(userVersion(copy)).toBe(DATABASE_REPLACEMENT_SCHEMA_VERSION);
      expect((await readdir(backups())).filter((name) => name.includes('.partial'))).toEqual([]);
      // The data moved on, its Book kept.
      expect(store.listBooks(null).items.map((book) => book.title)).toEqual(['升级之前']);
      // 导入数据库 reads that backup as 升级前备份 of Data Version 1, which this software cannot take: going back is the earlier
      // software's, as the 版本 row says.
      const preview = await store.inspectDatabaseImport(join(backups(), backupFileName));
      expect([preview.origin, preview.dataVersion, preview.compatibility]).toEqual(['pre-upgrade-backup', 1, 'older-data-version']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Opened again, nothing more is upgraded or backed up, and the upgrade is still stated.
    store = await open(BREAKING);
    try {
      const again = store.inspectDataVersion();
      expect([again.dataVersion, again.upgrades.map((upgrade) => upgrade.backupFileName)]).toEqual([2, [backupFileName!]]);
      expect((await readdir(backups())).filter((name) => name.startsWith('AI7 升级前备份 '))).toEqual([backupFileName!]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A backup the editor removed is said to be gone.
    await rm(join(backups(), backupFileName!));
    store = await open(BREAKING);
    try {
      expect(store.inspectDataVersion().upgrades[0]!.backupPresent).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('opens nothing and upgrades nothing when the backup before an upgrade cannot be made', async () => {
    await storeBeforeUpgrade();
    // Something that is not a folder stands where the backup location goes.
    await writeFile(backups(), 'not a folder');
    const refused = await open(BREAKING).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => error);
    expect(code(refused)).toBe('UPGRADE_BACKUP_FAILED');
    expect(userVersion(storePath())).toBe(DATABASE_REPLACEMENT_SCHEMA_VERSION);
    // Once the backup can be made, the upgrade goes on.
    await rm(backups());
    const store = await open(BREAKING);
    try {
      expect([store.inspectDataVersion().dataVersion, store.inspectDataVersion().upgrades.length]).toEqual([2, 1]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('opens data already at this software\'s Data Version without a backup', async () => {
    await storeBeforeUpgrade();
    // Under the software's own classification, where no revision is breaking yet, the same store is simply migrated.
    const store = await open();
    try {
      expect([store.inspectDataVersion().dataVersion, store.inspectDataVersion().upgrades]).toEqual([1, []]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(backups())).toBe(false);
  }, 180_000);

  it('refuses an upgrade record rewritten by hand', async () => {
    await storeBeforeUpgrade();
    const store = await open(BREAKING);
    store.markCleanShutdown();
    store.close();
    // The upgrade's record rewritten whole — record and digest agreeing — to name a file outside the backup's own name form.
    const tamper = new DatabaseSync(storePath());
    try {
      tamper.exec('DROP TRIGGER store_versions_no_update');
      const row = tamper.prepare("SELECT record_id, canonical_json FROM store_versions WHERE canonical_json LIKE '%\"upgrade\"%'").get() as
        { record_id: string; canonical_json: string };
      const record = parseCanonicalJson(row.canonical_json) as { upgrade: { backup: Record<string, unknown> } } & Record<string, unknown>;
      const rewritten = canonicalRecord({ ...record, upgrade: { ...record.upgrade, backup: { ...record.upgrade.backup, fileName: '../victim.ai7db' } } });
      tamper.prepare('UPDATE store_versions SET canonical_json = ?, sha256 = ? WHERE record_id = ?').run(rewritten.json, rewritten.digest, row.record_id);
      tamper.exec(DATA_VERSION_TRIGGER_SQL.store_versions_no_update!);
    } finally {
      tamper.close();
    }
    const refused = await open(BREAKING).then((opened) => {
      opened.close();
      return null;
    }, (error: unknown) => error);
    expect(code(refused)).toBe('STORE_VERSION_RECORD_INVALID');
  }, 180_000);

  it('never puts the backup before an upgrade over a file that appeared at its name, and upgrades nothing (Issue #433 review)', async () => {
    await storeBeforeUpgrade();
    // Enough data that the backup takes many chunks to write.
    mkdirSync(join(roots.dataRoot, 'bulk'), { recursive: true });
    await writeFile(join(roots.dataRoot, 'bulk', 'filler.bin'), Buffer.alloc(24 << 20, 7));
    const db = new DatabaseSync(storePath());
    try {
      const backingUp = backUpBeforeUpgrade(db, roots.dataRoot, {
        terminalRevision: DATABASE_MERGE_SCHEMA_VERSION, classes: BREAKING, softwareVersion: await packageVersion(), now: T,
      });
      const deadline = Date.now() + 60_000;
      while (!(existsSync(backups()) && readdirSync(backups()).some((name) => /\.ai7db\.partial$/u.test(name)))) {
        if (Date.now() > deadline) throw new Error('timed out waiting for the backup to be written');
        await new Promise((resolve) => setImmediate(resolve));
      }
      await writeFile(join(backups(), preUpgradeBackupFileName(T)), 'another program put this here');
      expect(code(await backingUp.catch((error: unknown) => error))).toBe('UPGRADE_BACKUP_EXISTS');
    } finally {
      db.close();
    }
    expect(await readFile(join(backups(), preUpgradeBackupFileName(T)), 'utf8')).toBe('another program put this here');
    expect(readdirSync(backups()).filter((name) => name.includes('.partial'))).toEqual([]);
    expect([existsSync(note()), userVersion(storePath())]).toEqual([false, DATABASE_REPLACEMENT_SCHEMA_VERSION]);
  }, 180_000);

  it('records the upgrade an open stopped before recording, with the one backup it made (Issue #433 review)', async () => {
    await storeBeforeUpgrade();
    // Stopped after every migration and before the versions that opened the store were recorded.
    expect(code(await refusal(open(BREAKING, 'before-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    expect([userVersion(storePath()), existsSync(note())]).toEqual([DATABASE_MERGE_SCHEMA_VERSION, true]);
    const made = await upgradeBackups();
    expect(made).toHaveLength(1);
    // The next open records that upgrade with that backup, makes no second one, and clears the note.
    const store = await open(BREAKING);
    try {
      const version = store.inspectDataVersion();
      expect([version.dataVersion, version.upgrades.map((upgrade) => [upgrade.fromDataVersion, upgrade.toDataVersion, upgrade.changes, upgrade.backupFileName])])
        .toEqual([2, [[1, 2, [CHANGE], made[0]]]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([await upgradeBackups(), existsSync(note())]).toEqual([made, false]);
  }, 180_000);

  it('records an upgrade once when its open stopped after recording it and before clearing its note (Issue #433 review)', async () => {
    await storeBeforeUpgrade();
    expect(code(await refusal(open(BREAKING, 'after-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    expect(existsSync(note())).toBe(true);
    const store = await open(BREAKING);
    try {
      const version = store.inspectDataVersion();
      expect([version.upgrades.length, version.history.map((entry) => entry.dataVersion)]).toEqual([1, [2, 1]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([(await upgradeBackups()).length, existsSync(note())]).toEqual([1, false]);
  }, 180_000);

  it('records an upgrade once though another software opened the data since its note was left (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    expect(code(await refusal(open(BREAKING, 'after-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    // The note was never cleared, and 0.2.0 opened the data since: its record, not the upgrade's, is the latest.
    const plant = new DatabaseSync(storePath());
    try {
      const latest = parseCanonicalJson((plant.prepare('SELECT canonical_json FROM store_versions ORDER BY ordinal DESC LIMIT 1').get() as
        { canonical_json: string }).canonical_json) as Record<string, unknown>;
      const record: Record<string, unknown> = {
        ...latest, recordId: randomUUID(), ordinal: (latest.ordinal as number) + 1, softwareVersion: '0.2.0', supersedes: latest.recordId,
        recordedAt: new Date(Date.now() + 60_000).toISOString(),
      };
      delete record.upgrade;
      const stored = canonicalRecord(record);
      plant.prepare(
        `INSERT INTO store_versions(record_id, ordinal, software_version, data_version, schema_revision, supersedes_record_id, recorded_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(record.recordId as string, record.ordinal as number, '0.2.0', record.dataVersion as number, record.schemaRevision as number,
        record.supersedes as string, record.recordedAt as string, stored.json, stored.digest);
    } finally {
      plant.close();
    }
    expect(existsSync(note())).toBe(true);
    const store = await open(BREAKING);
    try {
      // The upgrade stays recorded once, and this open is recorded after 0.2.0's.
      expect(upgradesOf(store)).toEqual([[software, 1, 2, [CHANGE]]]);
      expect(historyOf(store).map(([version, dataVersion]) => [version, dataVersion])).toEqual([[software, 2], ['0.2.0', 2], [software, 2], [software, 1]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(note())).toBe(false);
  }, 180_000);

  it("backs up again when the open that noted an upgrade migrated nothing, and refuses a note that is not AI7's (Issue #433 review)", async () => {
    await storeBeforeUpgrade();
    // Backed up and noted, then stopped before anything migrated the store.
    const db = new DatabaseSync(storePath());
    try {
      await backUpBeforeUpgrade(db, roots.dataRoot, { terminalRevision: DATABASE_MERGE_SCHEMA_VERSION, classes: BREAKING, softwareVersion: await packageVersion(), now: T });
    } finally {
      db.close();
    }
    expect([await upgradeBackups(), existsSync(note()), userVersion(storePath())]).toEqual([[preUpgradeBackupFileName(T)], true, DATABASE_REPLACEMENT_SCHEMA_VERSION]);
    let store = await open(BREAKING);
    try {
      // The data could have changed since that backup: the upgrade names the one made now.
      const [upgrade] = store.inspectDataVersion().upgrades;
      expect(upgrade!.backupFileName).not.toBe(preUpgradeBackupFileName(T));
      expect(await upgradeBackups()).toEqual([preUpgradeBackupFileName(T), upgrade!.backupFileName].sort());
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(note())).toBe(false);
    // A note that does not read as AI7's — here a whole upgrade whose digest does not agree — or one larger than any AI7 writes
    // is never taken as none: its upgrade's backup could no longer be named, so the open is refused and the note stays.
    const forged = canonicalRecord({
      schema: 'ai7.upgrade-pending/1',
      upgrade: {
        fromDataVersion: 1, fromSchemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, fromSoftwareVersion: null, changes: [CHANGE],
        backup: { fileName: preUpgradeBackupFileName(T), byteLength: 1, sha256: 'a'.repeat(64) },
      },
      target: { softwareVersion: '0.1.0', dataVersion: 2, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION },
      earlier: [],
    });
    // One carrying more than sixteen earlier upgrades on, digest and all, is not a note AI7 writes either.
    const crowded = canonicalRecord({
      schema: 'ai7.upgrade-pending/1', upgrade: THEIRS, target: THEIR_TARGET,
      earlier: Array.from({ length: 17 }, () => ({ ...THEIR_TARGET, upgrade: THEIRS })),
    });
    for (const text of [
      JSON.stringify({ json: forged.json, sha256: '0'.repeat(64) }),
      JSON.stringify({ json: crowded.json, sha256: crowded.digest }),
      ' '.repeat(1024 * 1024 + 1),
    ]) {
      await writeFile(note(), text);
      expect(code(await refusal(open(BREAKING)))).toBe('UPGRADE_NOTE_UNREADABLE');
      expect(existsSync(note())).toBe(true);
    }
  }, 180_000);

  it('records an upgrade another software noted and never recorded before its own, and still makes the backup its own needs (Issue #433 review)', async () => {
    // Revisions 57 and 58 both breaking: 0.0.10 brought the data from revision 56 to 57, backed up, and stopped before it
    // recorded that upgrade.
    await storeBeforeUpgrade();
    await writePendingUpgrade(roots.dataRoot, THEIRS, THEIR_TARGET);
    // This software's own open stops too, after its migration: its note carries their upgrade on with its own.
    expect(code(await refusal(open(BOTH, 'before-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    const store = await open(BOTH);
    try {
      // Their upgrade is recorded as theirs, and this software's own, from Data Version 2 to 3, with the backup it made now.
      const version = store.inspectDataVersion();
      expect(version.upgrades.map((upgrade) => [upgrade.softwareVersion, upgrade.fromDataVersion, upgrade.toDataVersion, upgrade.changes])).toEqual([
        [await packageVersion(), 2, 3, [CHANGE]],
        ['0.0.10', 1, 2, ['替换记录']],
      ]);
      expect(version.upgrades[0]!.backupFileName).toMatch(PRE_UPGRADE_BACKUP_NAME);
      expect(await upgradeBackups()).toEqual([version.upgrades[0]!.backupFileName]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(note())).toBe(false);
  }, 180_000);

  it('records each upgrade it carried once when the open that carried them stopped after recording them (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    await writePendingUpgrade(roots.dataRoot, THEIRS, THEIR_TARGET);
    // This software's open records their upgrade and its own, then stops before clearing its note, which still carries theirs on.
    expect(code(await refusal(open(BOTH, 'after-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    expect(existsSync(note())).toBe(true);
    const store = await open(BOTH);
    try {
      expect(upgradesOf(store)).toEqual([[software, 2, 3, [CHANGE]], ['0.0.10', 1, 2, ['替换记录']]]);
      expect(historyOf(store)).toEqual([
        [software, 3, DATABASE_MERGE_SCHEMA_VERSION],
        ['0.0.10', 2, DATABASE_REPLACEMENT_SCHEMA_VERSION],
        [software, 1, DATABASE_MERGE_SCHEMA_VERSION],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([(await upgradeBackups()).length, existsSync(note())]).toEqual([1, false]);
  }, 180_000);

  it('carries every upgrade no open recorded on, oldest first, through the opens of later software (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    // Under THREE, 0.0.9 brought the data from Data Version 1 to 2 and 0.0.10 from 2 to 3. Neither recorded its upgrade, and
    // the note 0.0.10 left carries 0.0.9's on.
    const first = madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION - 2, '0.0.8', ['定时备份'], '08-00-00');
    const second = madeUpgrade(2, DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, '0.0.9', ['替换记录'], '09-00-00');
    await writePendingUpgrade(roots.dataRoot, second, { softwareVersion: '0.0.10', dataVersion: 3, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION }, [
      { softwareVersion: '0.0.9', dataVersion: 2, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, upgrade: first },
    ]);
    // This software's own open stops too, after its migration: its note carries both on with its own.
    expect(code(await refusal(open(THREE, 'before-record')))).toBe('E2E_CONTROL_INTERRUPTED');
    const store = await open(THREE);
    try {
      expect(upgradesOf(store)).toEqual([[software, 3, 4, [CHANGE]], ['0.0.10', 2, 3, ['替换记录']], ['0.0.9', 1, 2, ['定时备份']]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([(await upgradeBackups()).length, existsSync(note())]).toEqual([1, false]);
  }, 180_000);

  it("never takes another software's note for its own, though it brought the data to the same revision and Data Version (Issue #433 review)", async () => {
    const software = await packageVersion();
    expect(software).not.toBe('0.0.10');
    // The data at the terminal revision as 0.0.10 left it: under BREAKING it brought the data from Data Version 1 to 2, then
    // stopped before recording that upgrade.
    let store = await open();
    try {
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    await writePendingUpgrade(roots.dataRoot, madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION, '0.0.9', [CHANGE], '09-00-00'),
      { softwareVersion: '0.0.10', dataVersion: 2, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION });
    store = await open(BREAKING);
    try {
      // Their upgrade is recorded as theirs, and this software, finding the data at its own Data Version, makes none.
      expect(upgradesOf(store)).toEqual([['0.0.10', 1, 2, [CHANGE]]]);
      expect(historyOf(store)).toEqual([
        [software, 2, DATABASE_MERGE_SCHEMA_VERSION], ['0.0.10', 2, DATABASE_MERGE_SCHEMA_VERSION], [software, 1, DATABASE_MERGE_SCHEMA_VERSION],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([existsSync(backups()), existsSync(note())]).toEqual([false, false]);
  }, 180_000);

  it('never takes the note of an earlier build of the same version for its own, though it reached the same Data Version (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    // Revision 57 breaking and 58 additive: an earlier build of this same version brought the data from Data Version 1 at
    // revision 56 to 2 at 57, and stopped before recording it. This build goes on to 58, still Data Version 2.
    const classes: ReadonlyArray<ClassifiedSchemaRevision> = [
      { revision: DATABASE_REPLACEMENT_SCHEMA_VERSION, class: 'breaking', change: '替换记录' },
      { revision: DATABASE_MERGE_SCHEMA_VERSION, class: 'additive' },
    ];
    await writePendingUpgrade(roots.dataRoot, THEIRS, { ...THEIR_TARGET, softwareVersion: software });
    const store = await open(classes);
    try {
      // The upgrade is recorded where that build left the data, and this build's open after it.
      expect(upgradesOf(store)).toEqual([[software, 1, 2, ['替换记录']]]);
      expect(historyOf(store)).toEqual([
        [software, 2, DATABASE_MERGE_SCHEMA_VERSION], [software, 2, DATABASE_REPLACEMENT_SCHEMA_VERSION], [software, 1, DATABASE_MERGE_SCHEMA_VERSION],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([existsSync(backups()), existsSync(note())]).toEqual([false, false]);
  }, 180_000);

  it('carries an earlier upgrade on through an open that stopped before migrating anything (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    // 0.0.10 brought the data to Data Version 2 and never recorded it. 0.0.11 then backed up, noted its own upgrade with
    // theirs carried on, and stopped before migrating anything.
    await writePendingUpgrade(roots.dataRoot, madeUpgrade(2, DATABASE_REPLACEMENT_SCHEMA_VERSION, '0.0.10', [CHANGE], '09-30-00'),
      { softwareVersion: '0.0.11', dataVersion: 3, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION }, [{ ...THEIR_TARGET, upgrade: THEIRS }]);
    const store = await open(BOTH);
    try {
      // Theirs is still recorded. 0.0.11's never happened, and this software's own names the backup it made now.
      expect(upgradesOf(store)).toEqual([[software, 2, 3, [CHANGE]], ['0.0.10', 1, 2, ['替换记录']]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect([(await upgradeBackups()).length, existsSync(note())]).toEqual([1, false]);
  }, 180_000);

  it("records another software's upgrade only as far as its migration took the data (Issue #433 review)", async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    // Under THREE, 0.0.10 set out to bring the data from Data Version 1 at revision 55 to 4 at 58, and stopped at revision 57,
    // at Data Version 3, before recording anything.
    await writePendingUpgrade(roots.dataRoot, madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION - 2, '0.0.9', ['定时备份', '替换记录', CHANGE], '09-00-00'),
      { softwareVersion: '0.0.10', dataVersion: 4, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION });
    const store = await open(THREE);
    try {
      expect(upgradesOf(store)).toEqual([[software, 3, 4, [CHANGE]], ['0.0.10', 1, 3, ['定时备份', '替换记录']]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('records no upgrade for an open that stopped having crossed only revisions that keep the Data Version (Issue #433 review)', async () => {
    const software = await packageVersion();
    await storeBeforeUpgrade();
    // Under BREAKING, 0.0.10 set out from revision 56 and stopped at 57, still at Data Version 1: it raised nothing.
    await writePendingUpgrade(roots.dataRoot, madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, '0.0.9', [CHANGE], '09-00-00'),
      { softwareVersion: '0.0.10', dataVersion: 2, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION });
    const store = await open(BREAKING);
    try {
      expect(upgradesOf(store)).toEqual([[software, 1, 2, [CHANGE]]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('carries nothing onto a new store (Issue #433 review)', async () => {
    // A note left beside a store no longer there.
    mkdirSync(join(roots.dataRoot, 'store'), { recursive: true });
    await writePendingUpgrade(roots.dataRoot, THEIRS, THEIR_TARGET, [{ ...THEIR_TARGET, upgrade: THEIRS }]);
    const store = await open();
    try {
      expect([store.inspectDataVersion().upgrades, store.inspectDataVersion().history.length]).toEqual([[], 1]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(note())).toBe(false);
  }, 180_000);

  it('reads the largest note AI7 writes, and upgrades nothing rather than carry more than sixteen on (Issue #433 review)', async () => {
    await storeBeforeUpgrade();
    // Sixteen carried on, each as large as an upgrade can be, and a seventeenth to carry: 0.0.10's own, which brought the data
    // from revision 56 to 57 and was never recorded.
    const longest = `9999.9999.9999-${'a'.repeat(32)}+${'b'.repeat(32)}`;
    const largest = madeUpgrade(1, DATABASE_REPLACEMENT_SCHEMA_VERSION - 1, longest, Array.from({ length: 20 }, () => String.fromCharCode(1).repeat(200)), '09-00-00');
    const target = { softwareVersion: longest, dataVersion: 2, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION };
    await writePendingUpgrade(roots.dataRoot, largest, target, Array.from({ length: 16 }, () => ({ ...target, upgrade: largest })));
    expect((await stat(note())).size).toBeGreaterThan(256 * 1024);
    expect(code(await refusal(open(BOTH)))).toBe('UPGRADE_NOTE_FULL');
    expect([userVersion(storePath()), existsSync(backups()), existsSync(note())]).toEqual([DATABASE_REPLACEMENT_SCHEMA_VERSION, false, true]);
  }, 180_000);
});
