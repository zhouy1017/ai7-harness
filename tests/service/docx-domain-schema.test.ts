import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL } from '../../src/service/import-retention.js';
import { IMPORTED_MARK_SCHEMA_SQL } from '../../src/service/imported-marks.js';
import { docxDatabase } from '../support/domain/docx.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

it('uses the same DOCX retention tables, indexes and triggers in memory and on disk', async () => {
  const roots = await createServiceTestRoots();
  const memory = await docxDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const names = [...Object.keys(IMPORT_RETENTION_SCHEMA_SQL), ...Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL), ...Object.keys(IMPORTED_MARK_SCHEMA_SQL)];
    const schema = (db: DatabaseSync) => db.prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name IN (${names.map(() => '?').join(',')}) ORDER BY type, name`,
    ).all(...names);
    try { expect(schema(memory)).toEqual(schema(disk)); } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
