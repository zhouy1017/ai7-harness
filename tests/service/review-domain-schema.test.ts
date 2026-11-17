import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { reviewDatabase, REVIEW_DOMAIN_TABLES, REVIEW_EXTERNAL_STUBS } from '../support/domain/review.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

it('uses the same review domain tables, indexes and triggers in memory and on disk, with compatible external-owner stub columns', async () => {
  const roots = await createServiceTestRoots();
  const memory = reviewDatabase();
  try {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const disk = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const schema = (db: DatabaseSync) => db.prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name IN (${REVIEW_DOMAIN_TABLES.map(() => '?').join(',')}) ORDER BY type, name`,
    ).all(...REVIEW_DOMAIN_TABLES);
    try {
      expect(schema(memory)).toEqual(schema(disk));
      expect(memory.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row => row.name))
        .toEqual([...REVIEW_DOMAIN_TABLES, ...Object.keys(REVIEW_EXTERNAL_STUBS)].sort());
      // The synthesis-only case uses just its source identity; that stub is not the Review Run schema proof.
      expect(disk.prepare('PRAGMA table_info(review_runs)').all().map(row => ({ name: row.name, type: row.type, notnull: row.notnull, pk: row.pk })))
        .toEqual(expect.arrayContaining([{ name: 'review_run_id', type: 'TEXT', notnull: 1, pk: 1 }]));
      for (const table of Object.keys(REVIEW_EXTERNAL_STUBS)) {
        const columns = (db: DatabaseSync) => db.prepare(`PRAGMA table_info(${table})`).all().map(row => ({ name: row.name, type: row.type }));
        expect(columns(disk)).toEqual(expect.arrayContaining(columns(memory)));
      }
    } finally { disk.close(); }
  } finally { memory.close(); await roots.dispose(); }
});
