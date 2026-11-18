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

/** Each unique key of `table` other than its primary key, made only of `columns`, as its ordered column list, sorted. */
function uniqueKeys(db: DatabaseSync, table: string, columns: ReadonlySet<string>): string[] {
  return (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string; unique: number; origin: string; partial: number }>)
    .filter((index) => index.unique === 1 && index.origin !== 'pk')
    .map((index) => ({ partial: index.partial === 1, names: (db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>).map((column) => column.name) }))
    .filter((key) => key.names.every((name) => columns.has(name)))
    .map((key) => `${key.partial ? 'partial ' : ''}${key.names.join(',')}`)
    .sort();
}

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
          // Compared whichever side declares it: a stub looser than the real relation (a dropped NOT NULL or key) fails too.
          expect(real!.notnull, `${table}.${column.name} NOT NULL`).toBe(column.notnull);
          expect(real!.pk, `${table}.${column.name} key`).toBe(column.pk);
        }
        // The unique keys (UNIQUE constraints and unique indexes, not the primary key) over the columns the stub declares: the
        // real relation has exactly those, so a stub that drops or invents one fails. A key over a column the stub omits is not a claim.
        const declared = new Set((memory.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
        expect(uniqueKeys(disk, table, declared), `${table} unique keys`).toEqual(uniqueKeys(memory, table, declared));
      }
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
