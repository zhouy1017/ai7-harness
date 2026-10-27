import { execPre74Fixture } from '../support/pre74-schema.js';
import { join } from 'node:path';
import { restoreTaskIntentDraftPredecessor, pre80SchemaRows } from '../support/pre74-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from '../../src/service/factual-verification-schema.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { FACTUAL_VERIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, PROPOSAL_REVIEW_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';

// Issue #901: schema revision 78 adds four append-only relations — factual_run_assurance, factual_verification_results,
// factual_review_decisions, correction_proposals — and moves nothing else. A revision-77 store gains them once; a store stamped
// 78 without them is refused.
let roots: ServiceTestRoots | undefined;

afterEach(async () => {
  await roots?.dispose();
  roots = undefined;
});

function dropFactualVerificationRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(FACTUAL_VERIFICATION_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}

describe('revision 78', () => {
  it('migrates an exact revision-77 store by adding its four relations, moving nothing else, and refuses a 78 without them', async () => {
    expect(FACTUAL_VERIFICATION_SCHEMA_VERSION).toBe(78);
    expect(LATEST_SCHEMA_VERSION).toBe(FACTUAL_VERIFICATION_SCHEMA_VERSION + 19);
    expect(PROPOSAL_REVIEW_SCHEMA_VERSION).toBe(77);
    roots = await createServiceTestRoots('ai7-factual-verification-schema-');
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const schemaRows = (): Array<{ name: string; sql: string }> => {
      const database = new DatabaseSync(path, { readOnly: true });
      try {
        return database.prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all() as Array<{ name: string; sql: string }>;
      } finally {
        database.close();
      }
    };
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    await importSample1Book(store, roots.codeRoot, '迁移回归');
    store.markCleanShutdown();
    store.close();
    const terminal = schemaRows();
    const names = [...Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL), ...Object.keys(FACTUAL_VERIFICATION_TRIGGER_SQL)];
    expect(names.every((name) => terminal.some((row) => row.name === name))).toBe(true);
    const plant = new DatabaseSync(path);
    const books = plant.prepare('SELECT * FROM books ORDER BY book_id').all();
    // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
    restoreTaskIntentDraftPredecessor(plant);
    dropFactualVerificationRelations(plant);
    execPre74Fixture(plant, 'PRAGMA user_version = 95');
    plant.exec(`PRAGMA user_version = ${PROPOSAL_REVIEW_SCHEMA_VERSION}`);
    plant.close();
    expect(schemaRows()).toEqual(pre80SchemaRows(terminal).filter((row) => !names.includes(row.name)));
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown();
    store.close();
    expect(schemaRows()).toEqual(terminal);
    const migrated = new DatabaseSync(path);
    expect(migrated.prepare('SELECT * FROM books ORDER BY book_id').all()).toEqual(books);
    expect((migrated.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
    for (const table of Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL)) {
      expect((migrated.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0);
      // A Book's factual verification travels with it in a merge.
      expect(MERGE_TABLE_POLICY[table]).toBe('owned');
    }
    dropFactualVerificationRelations(migrated);
    migrated.close();
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 120_000);
});
