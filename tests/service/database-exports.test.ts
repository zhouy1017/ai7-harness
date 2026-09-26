import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, parseCanonicalJson } from '../../src/service/analysis/canonical.js';
import { DATABASE_EXPORT_TRIGGER_SQL } from '../../src/service/database-exports.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_EXPORT_SCHEMA_VERSION, STORE_VERSION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
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
        schemaRevision: DATABASE_EXPORT_SCHEMA_VERSION,
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
        expect((copy.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
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
          plant.exec(`DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; PRAGMA user_version = ${STORE_VERSION_SCHEMA_VERSION};`);
        } finally {
          plant.close();
        }
        const migrated = await EditorialStore.open(other.dataRoot, other.codeRoot);
        try {
          expect(migrated.inspectDatabaseExports()).toEqual({ exports: [], total: 0 });
          migrated.markCleanShutdown();
        } finally {
          migrated.close();
        }
        const check = new DatabaseSync(join(other.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          expect((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
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
