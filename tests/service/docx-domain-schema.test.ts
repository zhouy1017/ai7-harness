import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { docxDatabase, docxStubTables } from '../support/domain/docx.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

it('checks every DOCX fixture table against its production owner or source-column contract', async () => {
  const roots = await createServiceTestRoots();
  const memory = await docxDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const names = memory.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => String(row.name));
    const columns = (db: DatabaseSync, table: string) => db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all()
      .map(row => ({ name: row.name, type: row.type, notnull: row.notnull, pk: row.pk }));
    const keys = (db: DatabaseSync, table: string) => db.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all()
      .filter(row => row.unique === 1 && row.partial === 0).map(row => db.prepare(`PRAGMA index_info(${JSON.stringify(row.name)})`)
        .all().map(column => String(column.name)).join(','));
    const schema = (db: DatabaseSync, table: string) => db.prepare(
      'SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name',
    ).all(table).map(row => ({ ...row, sql: typeof row.sql === 'string' ? row.sql.replace(/\s+/g, ' ').trim() : row.sql }));
    try {
      for (const table of names) {
        if (docxStubTables.has(table)) {
          for (const column of columns(memory, table)) expect(columns(disk, table), table).toContainEqual(column);
          for (const key of keys(memory, table)) expect(keys(disk, table), table).toContain(key);
        } else expect(schema(memory, table), table).toEqual(schema(disk, table));
      }
      expect(names.length).toBeGreaterThan(docxStubTables.size);
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
