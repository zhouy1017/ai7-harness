import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { evaluationDomainDatabase } from '../support/domain/evaluation.js';
import { OUTSIDE_OWNER_TABLES_SQL } from '../support/domain/outside-tables.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// The in-memory evaluation and derivative-document suites build their relations with the production initializers, in the
// order EditorialStore.open runs them, and stand in for the outside owners (the Book, its Manuscripts, the publication
// designations) with the labelled stubs of `outside-tables.ts`. This case keeps both honest: every table the helper builds
// from an initializer — with its indexes and triggers — reads the same on a freshly opened store, and every column a stub
// declares has the type, NOT NULL and key the real relation has.

it('uses the same evaluation and production-document tables, indexes and triggers in memory and on disk, and honest stubs for the rest', async () => {
  const roots = await createServiceTestRoots();
  const memory = await evaluationDomainDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const stubs = Object.keys(OUTSIDE_OWNER_TABLES_SQL);
      const built = (memory.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
        .map((row) => row.name).filter((name) => !stubs.includes(name));
      expect(built.length).toBeGreaterThan(20);
      const schema = (db: DatabaseSync, names: ReadonlyArray<string>) => db.prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name IN (${names.map(() => '?').join(',')}) ORDER BY type, name`,
      ).all(...names);
      expect(schema(memory, built)).toEqual(schema(disk, built));
      for (const table of stubs) {
        const actual = disk.prepare(`PRAGMA table_info(${table})`).all();
        expect(actual.length, `${table} exists on disk`).toBeGreaterThan(0);
        for (const column of memory.prepare(`PRAGMA table_info(${table})`).all()) {
          const real = actual.find((entry) => entry.name === column.name);
          expect(real, `${table}.${column.name}`).toBeDefined();
          expect(real!.type, `${table}.${column.name} type`).toBe(column.type);
          if (column.notnull) expect(real!.notnull, `${table}.${column.name} NOT NULL`).toBe(1);
          if (column.pk) expect(real!.pk, `${table}.${column.name} key`).toBe(column.pk);
        }
      }
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
