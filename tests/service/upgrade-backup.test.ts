import { existsSync } from 'node:fs';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { DATA_VERSION_TRIGGER_SQL, PRE_UPGRADE_BACKUP_NAME, type ClassifiedSchemaRevision } from '../../src/service/data-version.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_MERGE_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
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

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

async function packageVersion(): Promise<string> {
  return (JSON.parse(await readFile(join(roots.codeRoot, 'package.json'), 'utf8')) as { version: string }).version;
}

/** Open as the service entry does, under the suite's classification when one is given. */
function open(classes?: ReadonlyArray<ClassifiedSchemaRevision>): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null,
    ...(classes === undefined ? {} : { schemaRevisionClasses: classes }),
  });
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
    plant.exec(`DROP TABLE database_merges; PRAGMA user_version = ${DATABASE_REPLACEMENT_SCHEMA_VERSION};`);
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
});
