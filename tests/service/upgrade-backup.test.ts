import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { DATA_VERSION_TRIGGER_SQL, PRE_UPGRADE_BACKUP_NAME, type ClassifiedSchemaRevision } from '../../src/service/data-version.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_MERGE_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { backUpBeforeUpgrade, preUpgradeBackupFileName } from '../../src/service/upgrade-backup.js';
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

  it('backs up again when the open that noted an upgrade migrated nothing, and takes a note that is not AI7\'s as none (Issue #433 review)', async () => {
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
    // A note that does not read as AI7's — here a whole upgrade whose digest does not agree — names no upgrade: nothing more is
    // recorded, and it is cleared.
    const forged = canonicalRecord({
      schema: 'ai7.upgrade-pending/1',
      upgrade: {
        fromDataVersion: 1, fromSchemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, fromSoftwareVersion: null, changes: [CHANGE],
        backup: { fileName: preUpgradeBackupFileName(T), byteLength: 1, sha256: 'a'.repeat(64) },
      },
    });
    await writeFile(note(), JSON.stringify({ json: forged.json, sha256: '0'.repeat(64) }));
    store = await open(BREAKING);
    try {
      expect(store.inspectDataVersion().upgrades).toHaveLength(1);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(existsSync(note())).toBe(false);
  }, 180_000);
});
