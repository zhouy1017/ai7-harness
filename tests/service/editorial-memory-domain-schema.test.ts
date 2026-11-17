import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { editorialMemoryDatabase } from '../support/domain/editorial-memory.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

it('uses the same memory domain tables, indexes and triggers in memory and on disk', async () => {
  const roots = await createServiceTestRoots();
  const memory = editorialMemoryDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const names = ['book_people_versions', 'learning_eligibility_decisions', 'house_review_preference_versions',
      'review_run_preference_pins', 'learning_signals', 'editorial_learning_controls',
      'global_editorial_memory_items', 'global_editorial_memory_item_versions', 'learning_supervision_directives'];
    const schema = (db: DatabaseSync) => db.prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name IN (${names.map(() => '?').join(',')}) ORDER BY type, name`,
    ).all(...names);
    try { expect(schema(memory)).toEqual(schema(disk)); } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
