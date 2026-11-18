import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { initializeMemorySourceProjections, MEMORY_SOURCE_PROJECTION_SQL } from '../support/domain/memory-projections.js';
import { editorialMemoryDatabase, MEMORY_DOMAIN_TABLES } from '../support/domain/editorial-memory.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

it('uses the same memory domain tables, indexes and triggers in memory and on disk', async () => {
  const roots = await createServiceTestRoots();
  const memory = editorialMemoryDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const names = MEMORY_DOMAIN_TABLES;
    const schema = (db: DatabaseSync) => db.prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name IN (${names.map(() => '?').join(',')}) ORDER BY type, name`,
    ).all(...names);
    try {
      expect(schema(memory)).toEqual(schema(disk));
      initializeMemorySourceProjections(memory);
      // Every relation created or written by this fixture has an explicit owner/guard.
      const tables = memory.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name));
      expect(tables).toEqual([...names, ...Object.keys(MEMORY_SOURCE_PROJECTION_SQL)].sort());
      let nonNullColumns = 0; let keyColumns = 0;
      for (const table of Object.keys(MEMORY_SOURCE_PROJECTION_SQL)) {
        const actual = disk.prepare(`PRAGMA table_info(${table})`).all();
        for (const column of memory.prepare(`PRAGMA table_info(${table})`).all()) {
          const real = actual.find((entry) => entry.name === column.name);
          expect(real, `${table}.${column.name}`).toBeDefined();
          expect(real!.type, `${table}.${column.name} type`).toBe(column.type);
          expect(real!.notnull, `${table}.${column.name} NOT NULL`).toBe(column.notnull);
          expect(real!.pk, `${table}.${column.name} key`).toBe(column.pk);
          if (column.notnull) nonNullColumns += 1;
          if (column.pk) keyColumns += 1;
        }
        const uniqueKeys = (db: DatabaseSync) => db.prepare(`PRAGMA index_list(${table})`).all()
          .filter(index => index.unique === 1).map(index => db.prepare(`PRAGMA index_info(${String(index.name)})`).all().map(column => column.name));
        for (const key of uniqueKeys(memory)) expect(uniqueKeys(disk), `${table} unique key`).toContainEqual(key);
      }
      expect(nonNullColumns).toBeGreaterThan(0);
      expect(keyColumns).toBeGreaterThanOrEqual(Object.keys(MEMORY_SOURCE_PROJECTION_SQL).length);
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
