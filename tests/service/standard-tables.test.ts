import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreinstalledTableKey } from '../../src/service/standard-tables.js';
import { mergeBooks } from '../../src/service/database-merge.js';
import { inventoryStore } from '../../src/service/store-inventory.js';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// R5-L1 (ADR 0106 §9, §10) over the real store: a new Agent Data Root starts with the four pre-installed tables and an ordinary
// open reads no seed; export + replace-all carry the library; a Book merge never takes or changes it; the inventory counts it.

const seedReads = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock('../../src/service/standard-table-seed.cjs', async (original) => {
  const actual = await original<typeof import('../../src/service/standard-table-seed.cjs')>();
  return { readSeedRows: (key: PreinstalledTableKey) => {
    seedReads.names.push(key);
    return actual.readSeedRows(key);
  } };
});

const DIGESTS = {
  'tgh-2013': 'ae309fdc6fda9affd5965cff1276305a002662afc417b656a0918fbc4f58b241',
  'tgh-2013-annex-1': 'b67f3b918aecd7b3d6372f166e0a657ecb8b32d7ad50cbec84b078bb6ad369df',
  'gf-1001-2001': '265c376ab6b64437930b5ebbc569239d3ebc1b4ca2290d7cc7cac9464d466d33',
  'cycb-2': '95279be022dc555b207a5a4828963e930c1fdb1e448ff9cde4eef1bdd326c01f',
};

let roots: ServiceTestRoots;
const T = new Date(2026, 10, 21, 10, 0, 0);
const storeOf = (root: string): string => join(root, 'store', 'ai7.sqlite');
beforeEach(async () => { roots = await createServiceTestRoots('ai7-standard-tables-'); seedReads.names.length = 0; });
afterEach(async () => { await roots.dispose(); });

async function withDb<T>(root: string, run: (db: DatabaseSync) => T): Promise<T> {
  const db = new DatabaseSync(storeOf(root), { readOnly: true });
  try { return run(db); } finally { db.close(); }
}

function library(db: DatabaseSync): { key: string; enabled: number; digest: string; entries: number }[] {
  return (db.prepare(`SELECT t.preinstalled_key key, t.enabled, v.digest, (SELECT count(*) FROM standard_table_entries e WHERE e.version_id = v.version_id) entries
    FROM standard_tables t JOIN standard_table_versions v ON v.version_id = t.current_version_id ORDER BY t.preinstalled_key`).all() as { key: string; enabled: number; digest: string; entries: number }[])
    .map((row) => ({ ...row }));
}

/** The editor deletes a pre-installed table, as 字表与词表 will: entries, versions, then the table, in one transaction. */
function deleteTable(root: string, key: string): void {
  const db = new DatabaseSync(storeOf(root));
  try {
    db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    const id = String(db.prepare('SELECT table_id FROM standard_tables WHERE preinstalled_key = ?').get(key)!.table_id);
    db.prepare('DELETE FROM standard_table_entries WHERE version_id IN (SELECT version_id FROM standard_table_versions WHERE table_id = ?)').run(id);
    db.prepare('DELETE FROM standard_table_versions WHERE table_id = ?').run(id);
    db.prepare('DELETE FROM standard_tables WHERE table_id = ?').run(id);
    db.exec('COMMIT');
  } finally { db.close(); }
}

describe('the 字表与词表 library over the real store', () => {
  it('starts an empty Agent Data Root with the four tables and one Data Version 2 record, and an ordinary open reads no seed', async () => {
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    expect(seedReads.names.sort()).toEqual(['cycb-2', 'gf-1001-2001', 'tgh-2013', 'tgh-2013-annex-1']);
    expect(await withDb(roots.dataRoot, (db) => ({
      tables: library(db),
      versions: db.prepare('SELECT data_version, schema_revision FROM store_versions').all().map((row) => ({ ...row })),
    }))).toEqual({
      tables: [
        { key: 'cycb-2', enabled: 1, digest: DIGESTS['cycb-2'], entries: 56462 },
        { key: 'gf-1001-2001', enabled: 1, digest: DIGESTS['gf-1001-2001'], entries: 382 },
        { key: 'tgh-2013', enabled: 1, digest: DIGESTS['tgh-2013'], entries: 8105 },
        { key: 'tgh-2013-annex-1', enabled: 1, digest: DIGESTS['tgh-2013-annex-1'], entries: 3558 },
      ],
      versions: [{ data_version: 2, schema_revision: 117 }],
    });

    seedReads.names.length = 0;
    deleteTable(roots.dataRoot, 'cycb-2');
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    expect(seedReads.names).toEqual([]); // opening an existing store parses no seed, and a deleted table stays deleted
    expect((await withDb(roots.dataRoot, library)).map((row) => row.key)).toEqual(['gf-1001-2001', 'tgh-2013', 'tgh-2013-annex-1']);
  }, 120_000);

  it('refuses to open a store with an orphan entry or with a version deleted under its entries', async () => {
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    const edit = (run: (db: DatabaseSync) => void): void => {
      const db = new DatabaseSync(storeOf(roots.dataRoot));
      try { db.exec('PRAGMA foreign_keys = OFF'); run(db); } finally { db.close(); }
    };
    edit((db) => db.prepare("INSERT INTO standard_table_entries(version_id, position, recommended, discouraged, strength, status) VALUES (?, 1, 'x', '[]', 'house', 'applied')").run(randomUUID()));
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'STANDARD_TABLE_INVALID' });
    edit((db) => db.exec("DELETE FROM standard_table_entries WHERE recommended = 'x'"));
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    edit((db) => db.exec("DELETE FROM standard_table_versions WHERE table_id = (SELECT table_id FROM standard_tables WHERE preinstalled_key = 'gf-1001-2001')"));
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'STANDARD_TABLE_INVALID' });
  }, 120_000);

  it('carries the library through export and replace-all with equal digests', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const destination = join(roots.inputRoot, 'library.ai7db');
    const preparation = await store.prepareDatabaseExport(destination, true);
    expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
    store.close();

    deleteTable(roots.dataRoot, 'cycb-2');
    expect(await withDb(roots.dataRoot, library)).toHaveLength(3);

    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const preview = await store.inspectDatabaseImport(destination);
    await store.prepareDatabaseReplacement(preview.previewId, T);
    store.close();
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    expect(Object.fromEntries((await withDb(roots.dataRoot, library)).map((row) => [row.key, row.digest]))).toEqual(DIGESTS);
    expect((await withDb(roots.dataRoot, library)).map((row) => row.entries)).toEqual([56462, 382, 8105, 3558]);
  }, 180_000);

  it('leaves the receiving store\'s tables unchanged when a Book is merged in, and counts the library in the inventory', async () => {
    const otherRoot = join(dirname(roots.dataRoot), 'other-data');
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const creation = source.prepareBookCreation('合并来源之书', null);
    const book = source.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    source.close();
    (await EditorialStore.open(otherRoot, roots.codeRoot)).close();
    deleteTable(otherRoot, 'cycb-2');
    const target = new DatabaseSync(storeOf(otherRoot));
    target.prepare("UPDATE standard_tables SET enabled = 0 WHERE preinstalled_key = 'gf-1001-2001'").run();
    target.close();
    const before = await withDb(otherRoot, library);

    const db = new DatabaseSync(storeOf(otherRoot));
    try {
      db.prepare('ATTACH DATABASE ? AS src').run(storeOf(roots.dataRoot));
      try { expect(mergeBooks(db, [book], { source: roots.dataRoot, target: otherRoot }).books).toBe(1); } finally { db.exec('DETACH DATABASE src'); }
    } finally { db.close(); }

    expect(await withDb(otherRoot, library)).toEqual(before);
    expect(before.map((row) => [row.key, row.enabled])).toEqual([['gf-1001-2001', 0], ['tgh-2013', 1], ['tgh-2013-annex-1', 1]]);

    const counted = JSON.parse(inventoryStore(storeOf(roots.dataRoot))) as { entities: { library: unknown }; tables: Record<string, number> };
    expect(counted.entities.library).toEqual({ tables: 4, versions: 4, entries: 68507, sourceFiles: 0 });
    expect([counted.tables.standard_tables, counted.tables.standard_table_versions, counted.tables.standard_table_entries]).toEqual([4, 4, 68507]);
  }, 180_000);
});
