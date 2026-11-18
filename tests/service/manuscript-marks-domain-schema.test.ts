import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { manuscriptMarksDatabase, manuscriptMarksStubTables } from '../support/domain/manuscript-marks.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// The in-memory manuscript and mark suite (Issue #1536) stands on this: every table its helper creates is either a
// production definition, compared whole (text, indexes, triggers) with an opened store, or a labelled stub whose every
// column (type, NOT NULL, key) and unique key the opened store has.
it('checks every manuscript and mark fixture table against its production owner or source-column contract', async () => {
  const roots = await createServiceTestRoots();
  const memory = manuscriptMarksDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    const names = memory.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => String(row.name));
    const columns = (db: DatabaseSync, table: string) => db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all()
      .map(row => ({ name: row.name, type: row.type, notnull: row.notnull, pk: row.pk }));
    const keys = (db: DatabaseSync, table: string) => db.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all()
      .filter(row => row.unique === 1 && row.partial === 0).map(row => db.prepare(`PRAGMA index_info(${JSON.stringify(row.name)})`)
        .all().map(column => String(column.name)).join(','));
    // ALTER TABLE ADD COLUMN leaves the same definition with different spacing and RENAME leaves its name quoted;
    // nothing else is normalised.
    const schema = (db: DatabaseSync, table: string) => db.prepare(
      'SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name',
    ).all(table).map(row => ({ ...row, sql: typeof row.sql === 'string' ? row.sql.replace(/\s+/g, '').replaceAll('"', '') : row.sql }));
    try {
      for (const table of names) {
        if (manuscriptMarksStubTables.has(table)) {
          for (const column of columns(memory, table)) expect(columns(disk, table), table).toContainEqual(column);
          for (const key of keys(memory, table)) expect(keys(disk, table), table).toContain(key);
        } else expect(schema(memory, table), table).toEqual(schema(disk, table));
      }
      for (const stub of manuscriptMarksStubTables) expect(names, stub).toContain(stub);
      expect(names.length).toBeGreaterThan(manuscriptMarksStubTables.size);
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
