import { dataVersionMarkerPath, readDataVersionMarker } from '../../src/service/data-version.js';
import { execPre74Fixture } from '../support/pre74-schema.js';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
import { replacementStagingFor } from '../../src/service/database-replacement.js';
import {
  DATA_VERSION_TRIGGER_SQL,
  DataVersionError,
  DataVersionLedger,
  initializeDataVersionSchema,
  MAX_STORE_VERSIONS_LISTED,
  readUpgrade,
} from '../../src/service/data-version.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { SUPERVISION_TRIGGER_SQL } from '../../src/service/learning/supervision-directives.js';
import { SERIES_KNOWLEDGE_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

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
      frozen: true,
      schemaRevision: LATEST_SCHEMA_VERSION,
      update: null,
      history: [{ softwareVersion: version, dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION, recordedAt: first.history[0]!.recordedAt }],
      historyTruncated: false,
      upgrades: [],
      backupLocation: `${roots.dataRoot}-backups`,
      marker: { present: true, writtenAt: first.marker.writtenAt, softwareVersion: version },
    });
    expect(first.marker.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
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
        schemaRevision: LATEST_SCHEMA_VERSION, supersedes: null, recordedAt,
      });
      database.prepare(`INSERT INTO store_versions(record_id, ordinal, software_version, data_version, schema_revision, supersedes_record_id, recorded_at, canonical_json, sha256)
        VALUES (?, 1, '0.0.9', 1, ?, NULL, ?, ?, ?)`).run('00000000-0000-4000-8000-000000000001', LATEST_SCHEMA_VERSION, recordedAt, earlier.json, earlier.digest);
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
    // The review's probe (Issue #433 review): 0.2.0, then an earlier build opens the data again. That is no update.
    const back = await reopened((store) => store.inspectDataVersion(), '0.1.0');
    expect([back.update?.from, back.update?.to, back.update?.direction]).toEqual(['0.2.0', '0.1.0', 'earlier']);
    // A build with build metadata opens it as its own version.
    const built = await reopened((store) => store.inspectDataVersion(), '0.2.0+build.7');
    expect([built.softwareVersion, built.update?.direction]).toEqual(['0.2.0+build.7', 'newer']);

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
      expect(Array.from(ledger.history(), (entry) => [entry.ordinal, entry.schemaRevision, entry.dataVersion])).toEqual([[1, 53, 1], [2, 54, 1], [3, 54, 2]]);
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
        return codeOf(() => ledger.standing());
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
        for (let patch = from; patch <= to; patch += 1) ledger.recordOpen({ softwareVersion: `0.0.${patch}`, dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION });
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

  it('keeps an older software transition while bounding recent records and validating superseded history', () => {
    const database = new DatabaseSync(':memory:');
    try {
      initializeDataVersionSchema(database);
      const ledger = new DataVersionLedger(database);
      ledger.recordOpen({ softwareVersion: '0.1.0', dataVersion: 1, schemaRevision: 1 });
      ledger.recordOpen({ softwareVersion: '0.2.0', dataVersion: 1, schemaRevision: 1 });
      for (let schemaRevision = 2; schemaRevision <= 65; schemaRevision += 1) {
        ledger.recordOpen({ softwareVersion: '0.2.0', dataVersion: 1, schemaRevision });
      }
      const standing = ledger.standing();
      expect(standing.count).toBe(66);
      expect(standing.recent).toHaveLength(MAX_STORE_VERSIONS_LISTED);
      expect([standing.recent[0]?.ordinal, standing.recent.at(-1)?.ordinal]).toEqual([66, 47]);
      expect(standing.update).toMatchObject({ from: '0.1.0', to: '0.2.0', direction: 'newer' });
      expect(ledger.recordOpen({ softwareVersion: '0.2.0', dataVersion: 1, schemaRevision: 65 })).toBe(false);
      database.exec('DROP TRIGGER store_versions_no_update');
      database.exec("UPDATE store_versions SET software_version = '0.0.9' WHERE ordinal = 1");
      expect(() => ledger.standing()).toThrowError(DataVersionError);
      expect(() => ledger.recordOpen({ softwareVersion: '0.2.0', dataVersion: 1, schemaRevision: 65 })).toThrowError(DataVersionError);
    } finally {
      database.close();
    }
  });

  it('reads a rollback only when it names a strictly earlier Data Version and schema revision than the upgrade it belongs to (Issue #644)', () => {
    const backup = { fileName: 'AI7 升级前备份 2026-09-26 10-00-00.ai7db', byteLength: 1, sha256: 'a'.repeat(64) };
    const upgrade = (rollback: { dataVersion: number; schemaRevision: number }): unknown => ({
      fromDataVersion: 3, fromSchemaRevision: 60, fromSoftwareVersion: '0.0.10', changes: ['替换记录'], backup,
      rollback: { softwareVersion: '0.0.9', ...rollback, backup },
    });
    const refusedCode = (rollback: { dataVersion: number; schemaRevision: number }): string | null => {
      try { readUpgrade(upgrade(rollback), 4); return null; } catch (error) { return error instanceof DataVersionError ? error.code : String(error); }
    };
    // The middle state an unfinished upgrade left does not share the Data Version it fell back from.
    expect(refusedCode({ dataVersion: 3, schemaRevision: 59 })).toBe('STORE_VERSION_RECORD_INVALID');
    expect(refusedCode({ dataVersion: 4, schemaRevision: 59 })).toBe('STORE_VERSION_RECORD_INVALID');
    expect(refusedCode({ dataVersion: 1, schemaRevision: 60 })).toBe('STORE_VERSION_RECORD_INVALID');
    expect(refusedCode({ dataVersion: 1, schemaRevision: 61 })).toBe('STORE_VERSION_RECORD_INVALID');
    expect(refusedCode({ dataVersion: 2, schemaRevision: 59 })).toBeNull();
    expect(readUpgrade(upgrade({ dataVersion: 2, schemaRevision: 59 }), 4).rollback).toMatchObject({ dataVersion: 2, schemaRevision: 59 });
    // The ledger refuses to record the same rollback, and records the strictly earlier one.
    const database = new DatabaseSync(':memory:');
    try {
      initializeDataVersionSchema(database);
      const ledger = new DataVersionLedger(database);
      ledger.recordOpen({ softwareVersion: '0.0.9', dataVersion: 3, schemaRevision: 60 });
      expect(() => ledger.recordOpen({ softwareVersion: '0.0.10', dataVersion: 4, schemaRevision: 61, upgrade: upgrade({ dataVersion: 3, schemaRevision: 59 }) as never }))
        .toThrowError(expect.objectContaining({ code: 'STORE_VERSION_RECORD_INVALID' }));
      expect(ledger.recordOpen({ softwareVersion: '0.0.10', dataVersion: 4, schemaRevision: 61, upgrade: upgrade({ dataVersion: 2, schemaRevision: 59 }) as never })).toBe(true);
    } finally {
      database.close();
    }
  });

  it('adds revision 54 to a revision-53 store, recording the versions that open it from then on', async () => {
    await reopened(() => undefined);
    const plant = new DatabaseSync(databasePath());
    try {
      execPre74Fixture(plant, `DROP TABLE analysis_outcome_resolutions; DROP TABLE material_index_segments; DROP TABLE material_index_builds; DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; DROP TABLE developer_capability_proposal_exports; DROP TABLE developer_capability_proposals; DROP TABLE review_run_procedure_pins; DROP TABLE captured_procedure_states; DROP TABLE captured_procedure_versions; DROP TABLE captured_procedures; DROP TABLE readers_report_drafts; DROP TABLE readers_report_tasks; DROP TABLE series_retrieval_exclusions; DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings; DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; DROP TABLE database_merge_books; DROP TABLE database_merges; DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; PRAGMA user_version = ${SERIES_KNOWLEDGE_SCHEMA_VERSION};`);
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_58_SQL);
    } finally {
      plant.close();
    }
    const migrated = await reopened((store) => store.inspectDataVersion());
    expect([migrated.schemaRevision, migrated.history.length, migrated.update]).toEqual([LATEST_SCHEMA_VERSION, 1, null]);
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      database.close();
    }
  }, 120_000);
});

describe('数据版本标记 over the real store (Issue #967; ADR 0023)', () => {
  const markerPath = (): string => join(roots.dataRoot, 'store', 'ai7-data-version.json');
  const readMarker = async (): Promise<Record<string, unknown>> => JSON.parse(await readFile(markerPath(), 'utf8')) as Record<string, unknown>;

  // Digest every file without opening SQLite, so the comparison includes WAL/journal bytes and replacement staging.
  async function treeBytes(root: string): Promise<unknown> {
    if (!existsSync(root)) return null;
    const entries = await readdir(root, { withFileTypes: true });
    return Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => [entry.name,
      entry.isDirectory() ? await treeBytes(join(root, entry.name)) : sha256Hex(await readFile(join(root, entry.name))),
    ]));
  }

  /** What a refused open must leave as it was: the marker, the store's revision and records, the store's files, no backups. */
  async function untouched(): Promise<unknown> {
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      return {
        marker: await readFile(markerPath(), 'utf8').catch(() => null),
        userVersion: (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
        records: (database.prepare('SELECT count(*) AS n FROM store_versions').get() as { n: number }).n,
        lifetimes: (database.prepare('SELECT count(*) AS n FROM service_lifetimes').get() as { n: number }).n,
        store: (await readdir(join(roots.dataRoot, 'store'))).sort(),
        backups: existsSync(`${roots.dataRoot}-backups`),
        bytes: await treeBytes(join(roots.dataRoot, 'store')),
      };
    } finally {
      database.close();
    }
  }

  async function refusal(): Promise<unknown> {
    return EditorialStore.open(roots.dataRoot, roots.codeRoot).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => (error instanceof StoreError ? [error.code, error.message] : error));
  }

  it.each(['replace', 'merge'] as const)('refuses newer or corrupt data before a pending %s changes any bytes', async (kind) => {
    const packagePath = join(roots.inputRoot, '版本检查.ai7db');
    const source = await EditorialStore.open(join(roots.inputRoot, 'source-data'), roots.codeRoot);
    try {
      const creation = source.prepareBookCreation('版本检查', null);
      source.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest });
      const prepared = await source.prepareDatabaseExport(packagePath, true);
      expect((await source.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
    } finally { source.close(); }
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const preview = await store.inspectDatabaseImport(packagePath);
      if (kind === 'replace') await store.prepareDatabaseReplacement(preview.previewId);
      else await store.prepareDatabaseMerge(preview.previewId);
      store.markCleanShutdown();
    } finally { store.close(); }
    const originalMarker = await readFile(markerPath(), 'utf8');
    const snapshot = () => Promise.all([roots.dataRoot, replacementStagingFor(roots.dataRoot), `${roots.dataRoot}-backups`].map(treeBytes));
    for (const [text, code] of [
      [JSON.stringify({ dataVersion: 2, schemaRevision: 90, softwareVersion: '2.0.0', writtenAt: '2027-01-01T00:00:00.000Z' }), 'DATA_VERSION_NEWER'],
      ['{', 'DATA_VERSION_MARKER_UNREADABLE'],
    ]) {
      await writeFile(markerPath(), text!);
      const before = await snapshot();
      expect(await refusal()).toEqual([code, expect.any(String)]);
      expect(await snapshot()).toEqual(before);
    }
    await writeFile(markerPath(), originalMarker);
    const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await opened.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind, outcome: 'applied' });
      expect(opened.inspectDataVersion().marker).toMatchObject({ present: true, softwareVersion: await packageVersion() });
    } finally { opened.close(); }
  }, 120_000);

  it('does not discard abandoned replacement staging on a marker refusal', async () => {
    await reopened(() => undefined);
    const staging = replacementStagingFor(roots.dataRoot);
    await mkdir(staging);
    await writeFile(join(staging, 'unfinished'), 'preparation');
    await writeFile(markerPath(), '{');
    const before = await treeBytes(staging);
    expect(await refusal()).toEqual(['DATA_VERSION_MARKER_UNREADABLE', expect.any(String)]);
    expect(await treeBytes(staging)).toEqual(before);
  });

  it('writes the marker after every open, create or replace, never a path, and tolerates a missing one once', async () => {
    const version = await packageVersion();
    await reopened(() => undefined);
    const written = await readMarker();
    expect(Object.keys(written).sort()).toEqual(['dataVersion', 'schemaRevision', 'softwareVersion', 'writtenAt']);
    expect(written).toMatchObject({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: version });
    for (const place of [roots.dataRoot, JSON.stringify(roots.dataRoot).slice(1, -1)]) expect(await readFile(markerPath(), 'utf8')).not.toContain(place);
    // A later software opening the data replaces it, and an earlier one of the same Data Version opens it as ever.
    await reopened(() => undefined, '0.2.0');
    expect(await readMarker()).toMatchObject({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: '0.2.0' });
    await reopened(() => undefined, '0.1.0');
    expect((await readMarker()).softwareVersion).toBe('0.1.0');
    // A marker of an earlier schema revision — data an earlier AI7 of the same Data Version wrote — opens and is replaced.
    await writeFile(markerPath(), JSON.stringify({ dataVersion: 1, schemaRevision: 60, softwareVersion: '0.0.9', writtenAt: '2026-09-01T00:00:00.000Z' }));
    await reopened(() => undefined);
    expect(await readMarker()).toMatchObject({ schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: version });
    // An existing store without a marker — one from before this software, or a store a replacement brought in — opens, and
    // that open writes it; the 版本 row says whether it is there.
    await rm(markerPath());
    const reopenedMarker = await reopened((store) => {
      const present = store.inspectDataVersion().marker;
      return present;
    });
    expect(reopenedMarker).toMatchObject({ present: true, softwareVersion: version });
    expect(existsSync(markerPath())).toBe(true);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await rm(markerPath());
      expect(store.inspectDataVersion().marker).toEqual({ present: false, writtenAt: null, softwareVersion: null });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('refuses a newer Data Version, an unknown schema revision or a corrupt marker before anything opens, and writes nothing', async () => {
    await reopened(() => undefined);
    const newer = '这份数据来自更新的 AI7（数据版本 2 / 数据库修订 90），请使用更新的 AI7 打开。';
    const unknown = `这份数据来自更新的 AI7（数据版本 1 / 数据库修订 ${LATEST_SCHEMA_VERSION + 1}），请使用更新的 AI7 打开。`;
    const corrupt = '这份数据的数据版本标记无法读取：AI7 没有打开这份数据，也没有改动它。请使用写入这份数据的 AI7 打开，或从备份恢复。';
    for (const [text, expected] of [
      [JSON.stringify({ dataVersion: 2, schemaRevision: 90, softwareVersion: '2.0.0', writtenAt: '2027-01-01T00:00:00.000Z' }), ['DATA_VERSION_NEWER', newer]],
      [JSON.stringify({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION + 1, softwareVersion: '1.1.0', writtenAt: '2027-01-01T00:00:00.000Z' }), ['DATA_VERSION_NEWER', unknown]],
      ['{"dataVersion":1', ['DATA_VERSION_MARKER_UNREADABLE', corrupt]],
      [JSON.stringify({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: '1.0.0', writtenAt: '2027-01-01T00:00:00.000Z', dataRoot: 'C:/AI7' }), ['DATA_VERSION_MARKER_UNREADABLE', corrupt]],
      ['x'.repeat(8192), ['DATA_VERSION_MARKER_UNREADABLE', corrupt]],
    ] as const) {
      await writeFile(markerPath(), text);
      const before = await untouched();
      expect(await refusal()).toEqual(expected);
      expect(await untouched()).toEqual(before);
    }
    // Something not a file at the marker's place is refused the same way: no silent fallback.
    await rm(markerPath());
    await mkdir(markerPath());
    const before = await untouched();
    expect(await refusal()).toEqual(['DATA_VERSION_MARKER_UNREADABLE', corrupt]);
    expect(await untouched()).toEqual(before);
    // The marker the newer AI7 wrote taken away, this AI7 opens the data again and writes its own.
    await rm(markerPath(), { recursive: true });
    await reopened(() => undefined);
    expect((await readMarker()).schemaRevision).toBe(LATEST_SCHEMA_VERSION);
  }, 120_000);
});


it.each([90, 91])('advances a valid historical reader%s without rewriting Book or version-history rows (#1131)', async (revision) => {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const creation = store.prepareBookCreation('合成历史读取', null);
  store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest });
  await store.close();
  const db = new DatabaseSync(databasePath());
  const before = db.prepare('SELECT rowid, * FROM books ORDER BY rowid').all();
  new DataVersionLedger(db).recordOpen({ softwareVersion: '0.0.9', dataVersion: 1, schemaRevision: revision });
  const history = db.prepare('SELECT rowid, * FROM store_versions ORDER BY rowid').all();
  db.exec(`PRAGMA user_version = ${revision}`); db.close();
  const marker = (await readDataVersionMarker(roots.dataRoot))!;
  await writeFile(dataVersionMarkerPath(roots.dataRoot), JSON.stringify({ ...marker, schemaRevision: revision }));
  const upgraded = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  expect(upgraded.inspectDataVersion()).toMatchObject({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION });
  await upgraded.close();
  const read = new DatabaseSync(databasePath());
  try {
    expect(read.prepare('SELECT rowid, * FROM books ORDER BY rowid').all()).toEqual(before);
    expect(read.prepare('SELECT rowid, * FROM store_versions ORDER BY rowid').all().slice(0, history.length)).toEqual(history);
  } finally { read.close(); }
});

it('refuses a revision-91 store whose current-format learning records are damaged before any successor stamp (#1131)', async () => {
  // A genuine revision-91 predecessor: an editor's House supervision directive, and no model Run or request evidence at all.
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合成本社原则。', effect: 'guide' });
  await store.close();
  const db = new DatabaseSync(databasePath());
  try {
    expect(db.prepare("SELECT count(*) count FROM analysis_run_states WHERE json_type(canonical_json, '$.requestAdmission') IS NOT NULL").get()!.count).toBe(0);
    const row = db.prepare('SELECT directive_id, canonical_json FROM learning_supervision_directives ORDER BY ordinal LIMIT 1').get()!;
    const tampered = canonicalRecord({ ...(JSON.parse(String(row.canonical_json)) as Record<string, unknown>), effect: 'not-an-effect' });
    for (const name of Object.keys(SUPERVISION_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
    db.prepare('UPDATE learning_supervision_directives SET canonical_json = ?, sha256 = ? WHERE directive_id = ?').run(tampered.json, tampered.digest, String(row.directive_id));
    for (const sql of Object.values(SUPERVISION_TRIGGER_SQL)) db.exec(sql);
    db.exec('PRAGMA user_version = 91');
  } finally { db.close(); }
  const marker = (await readDataVersionMarker(roots.dataRoot))!;
  await writeFile(dataVersionMarkerPath(roots.dataRoot), JSON.stringify({ ...marker, schemaRevision: 91 }));
  const written = await readFile(dataVersionMarkerPath(roots.dataRoot), 'utf8');
  await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  // Refused by its own revision-91 readers: neither the database nor the marker claims the successor.
  const read = new DatabaseSync(databasePath());
  try { expect(read.prepare('PRAGMA user_version').get()!.user_version).toBe(91); } finally { read.close(); }
  expect(await readFile(dataVersionMarkerPath(roots.dataRoot), 'utf8')).toBe(written);
});
