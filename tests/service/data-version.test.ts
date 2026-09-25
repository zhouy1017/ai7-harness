import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import {
  DATA_VERSION_TRIGGER_SQL,
  DataVersionError,
  DataVersionLedger,
  initializeDataVersionSchema,
  MAX_STORE_VERSIONS_LISTED,
} from '../../src/service/data-version.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { SERIES_KNOWLEDGE_SCHEMA_VERSION, DATABASE_REPLACEMENT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 数据版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1) over the real store:
// the software version and the Data Version apart, one record of the versions that opened the store and none for an
// unchanged reopen, a software update that keeps the Data Version said as such, the ledger refusing to be rewritten and
// verified as a chain on read, the newest twenty records listed, and revision 54 added to a revision-53 store.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-data-version-');
});

afterEach(async () => {
  await roots.dispose();
});

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

async function packageVersion(): Promise<string> {
  return (JSON.parse(await readFile(join(roots.codeRoot, 'package.json'), 'utf8')) as { version: string }).version;
}

/** Open as the service entry does, handing the store the software version it read; absent, the store reads its code root's. */
async function reopened<T>(read: (store: EditorialStore) => T, softwareVersion?: string): Promise<T> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, softwareVersion === undefined ? undefined : {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null,
    softwareVersion,
  });
  try {
    const value = read(store);
    store.markCleanShutdown();
    return value;
  } finally {
    store.close();
  }
}

describe('数据版本 over the real store', () => {
  it('records the versions that open the store, and says a software update kept the Data Version', async () => {
    const version = await packageVersion();
    const first = await reopened((store) => store.inspectDataVersion());
    expect(first).toEqual({
      softwareVersion: version,
      dataVersion: 1,
      frozen: false,
      schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION,
      update: null,
      history: [{ softwareVersion: version, dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, recordedAt: first.history[0]!.recordedAt }],
      historyTruncated: false,
    });
    // The same software opening the same data again records nothing.
    expect((await reopened((store) => store.inspectDataVersion())).history).toHaveLength(1);

    // The store as an earlier software left it: its one record names 0.0.9.
    const database = new DatabaseSync(databasePath());
    try {
      database.exec('DROP TRIGGER store_versions_no_delete');
      database.exec('DELETE FROM store_versions');
      database.exec(DATA_VERSION_TRIGGER_SQL.store_versions_no_delete!);
      const recordedAt = '2026-09-01T00:00:00.000Z';
      const earlier = canonicalRecord({
        schema: 'ai7.store-version/1', recordId: '00000000-0000-4000-8000-000000000001', ordinal: 1, softwareVersion: '0.0.9', dataVersion: 1,
        schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION, supersedes: null, recordedAt,
      });
      database.prepare(`INSERT INTO store_versions(record_id, ordinal, software_version, data_version, schema_revision, supersedes_record_id, recorded_at, canonical_json, sha256)
        VALUES (?, 1, '0.0.9', 1, ?, NULL, ?, ?, ?)`).run('00000000-0000-4000-8000-000000000001', DATABASE_REPLACEMENT_SCHEMA_VERSION, recordedAt, earlier.json, earlier.digest);
    } finally {
      database.close();
    }
    const updated = await reopened((store) => store.inspectDataVersion());
    expect([updated.update?.from, updated.update?.to, updated.update?.fromDataVersion, updated.update?.toDataVersion]).toEqual(['0.0.9', version, 1, 1]);
    expect(updated.history.map((entry) => entry.softwareVersion)).toEqual([version, '0.0.9']);
    // The version the service entry hands the store is the one recorded: here, a later software opening the same data.
    const later = await reopened((store) => store.inspectDataVersion(), '0.2.0');
    expect([later.softwareVersion, later.update?.from, later.update?.to, later.history.map((entry) => entry.softwareVersion)])
      .toEqual(['0.2.0', version, '0.2.0', ['0.2.0', version, '0.0.9']]);

    // The ledger refuses to be rewritten, and a record rewritten by hand stops the store from opening.
    const tamper = new DatabaseSync(databasePath());
    try {
      expect(() => tamper.exec("UPDATE store_versions SET software_version = '9.9.9'")).toThrowError(/STORE_VERSIONS_IMMUTABLE/u);
      expect(() => tamper.exec('DELETE FROM store_versions')).toThrowError(/STORE_VERSIONS_IMMUTABLE/u);
      tamper.exec('DROP TRIGGER store_versions_no_update');
      tamper.exec("UPDATE store_versions SET software_version = '0.0.8' WHERE ordinal = 1");
      tamper.exec(DATA_VERSION_TRIGGER_SQL.store_versions_no_update!);
    } finally {
      tamper.close();
    }
    const refused = await EditorialStore.open(roots.dataRoot, roots.codeRoot).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => error);
    expect(refused instanceof StoreError ? [refused.code, refused.message] : refused).toEqual(['STORE_VERSION_RECORD_INVALID', '数据版本记录已损坏。']);
  }, 120_000);

  it('keeps the records as a verified chain appended only on a change, and lists the newest twenty', async () => {
    const codeOf = (action: () => unknown): unknown => {
      try {
        action();
        return null;
      } catch (error) {
        return error instanceof DataVersionError ? error.code : error;
      }
    };
    const fresh = (): DatabaseSync => {
      const database = new DatabaseSync(':memory:');
      initializeDataVersionSchema(database);
      initializeDataVersionSchema(database);
      return database;
    };
    // The ledger alone: a malformed version is refused, and a record is appended only when a version changed.
    const database = fresh();
    try {
      const ledger = new DataVersionLedger(database);
      for (const input of [
        { softwareVersion: 'latest', dataVersion: 1, schemaRevision: 53 },
        { softwareVersion: '0.1.0', dataVersion: 0, schemaRevision: 53 },
        { softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 0 },
      ]) expect(codeOf(() => ledger.recordOpen(input))).toBe('STORE_VERSION_INVALID');
      expect([
        ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 53 }),
        ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 53 }),
        ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 54 }),
        ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 2, schemaRevision: 54 }),
      ]).toEqual([true, false, true, true]);
      expect(ledger.history().map((entry) => [entry.ordinal, entry.schemaRevision, entry.dataVersion])).toEqual([[1, 53, 1], [2, 54, 1], [3, 54, 2]]);
    } finally {
      database.close();
    }
    // Each rewrite of a record — its row, its digest, its place in the chain — is refused on read.
    const rewritten = (rewrite: (database: DatabaseSync) => void): unknown => {
      const planted = fresh();
      try {
        const ledger = new DataVersionLedger(planted);
        ledger.recordOpen({ softwareVersion: '0.0.9', dataVersion: 1, schemaRevision: 54 });
        ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 54 });
        planted.exec('DROP TRIGGER store_versions_no_update');
        rewrite(planted);
        return codeOf(() => ledger.history());
      } finally {
        planted.close();
      }
    };
    // Record 2 rewritten whole — its row, its record and its digest agreeing — so only its place in the chain is wrong.
    const moved = (change: (record: Record<string, unknown>) => Record<string, unknown>) => (planted: DatabaseSync): void => {
      const row = planted.prepare('SELECT canonical_json FROM store_versions WHERE ordinal = 2').get() as { canonical_json: string };
      const before = JSON.parse(row.canonical_json) as Record<string, unknown>;
      const after = { ...before, ...change(before) };
      const record = canonicalRecord(after);
      planted.prepare('UPDATE store_versions SET ordinal = ?, supersedes_record_id = ?, canonical_json = ?, sha256 = ? WHERE ordinal = 2')
        .run(Number(after.ordinal), String(after.supersedes), record.json, record.digest);
    };
    expect(rewritten(() => undefined)).toBeNull();
    expect(rewritten((planted) => planted.exec("UPDATE store_versions SET software_version = '0.0.8' WHERE ordinal = 1"))).toBe('STORE_VERSION_RECORD_INVALID');
    expect(rewritten((planted) => planted.exec("UPDATE store_versions SET software_version = '0.2.0', canonical_json = replace(canonical_json, '0.1.0', '0.2.0') WHERE ordinal = 2")))
      .toBe('STORE_VERSION_RECORD_INVALID');
    expect(rewritten(moved(() => ({ ordinal: 3 })))).toBe('STORE_VERSION_RECORD_INVALID');
    expect(rewritten(moved((record) => ({ supersedes: record.recordId })))).toBe('STORE_VERSION_RECORD_INVALID');

    // Through the store: twenty records are all listed; beyond that the newest twenty, and the answer says there are more.
    const version = await packageVersion();
    const plant = async (from: number, to: number): Promise<void> => {
      const store = new DatabaseSync(databasePath());
      try {
        const ledger = new DataVersionLedger(store);
        for (let patch = from; patch <= to; patch += 1) ledger.recordOpen({ softwareVersion: `0.0.${patch}`, dataVersion: 1, schemaRevision: DATABASE_REPLACEMENT_SCHEMA_VERSION });
      } finally {
        store.close();
      }
    };
    await reopened(() => undefined);
    await plant(1, 18);
    const twenty = await reopened((store) => store.inspectDataVersion());
    expect([twenty.history.length, twenty.historyTruncated, twenty.update?.from, twenty.update?.to]).toEqual([MAX_STORE_VERSIONS_LISTED, false, '0.0.18', version]);
    await plant(19, 19);
    const more = await reopened((store) => store.inspectDataVersion());
    expect([more.history.length, more.historyTruncated, more.history[0]!.softwareVersion, more.history[1]!.softwareVersion, more.history.at(-1)!.softwareVersion])
      .toEqual([MAX_STORE_VERSIONS_LISTED, true, version, '0.0.19', '0.0.2']);
  }, 120_000);

  it('adds revision 54 to a revision-53 store, recording the versions that open it from then on', async () => {
    await reopened(() => undefined);
    const plant = new DatabaseSync(databasePath());
    try {
      plant.exec(`DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; PRAGMA user_version = ${SERIES_KNOWLEDGE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await reopened((store) => store.inspectDataVersion());
    expect([migrated.schemaRevision, migrated.history.length, migrated.update]).toEqual([DATABASE_REPLACEMENT_SCHEMA_VERSION, 1, null]);
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_REPLACEMENT_SCHEMA_VERSION);
    } finally {
      database.close();
    }
  }, 120_000);
});
