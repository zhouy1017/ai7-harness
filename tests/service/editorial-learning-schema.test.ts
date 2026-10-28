import { CURATION_SCHEMA_SQL, FACTUAL_TASK_INTENTS_SQL } from '../../src/service/task-authorization.js';
import { execPre74Fixture } from '../support/pre74-schema.js';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL, EDITORIAL_LEARNING_TRIGGER_SQL, initializeEditorialLearningSchema } from '../../src/service/learning/ledger.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

let roots: ServiceTestRoots | undefined;
afterEach(async () => { await roots?.dispose(); roots = undefined; });

async function predecessor(): Promise<DatabaseSync> {
  roots = await createServiceTestRoots();
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  store.markCleanShutdown(); store.close();
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  for (const table of Object.keys(EDITORIAL_LEARNING_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE ${table}`);
  execPre74Fixture(db, 'PRAGMA user_version = 85');
  return db;
}

describe('reference-only learning schema revision 86', () => {
  it.each([false, true])('adds empty immutable relations and resumes a committed but unstamped upgrade (%s)', async (interrupted) => {
    const db = await predecessor();
    const before = db.prepare("SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all();
    if (interrupted) initializeEditorialLearningSchema(db);
    db.close();
    const store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
    try {
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 })).toMatchObject({ enabled: true, signals: [], items: [], controlEntries: 0 });
      const check = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
      try {
        // Synchronized with #1083 and #1084: revisions 87 and 88 follow, adding only their own relations, which this predecessor already carries.
        expect(check.prepare('PRAGMA user_version').get()!.user_version).toBe(101);
        const added = new Set([...Object.keys(EDITORIAL_LEARNING_SCHEMA_SQL), ...Object.keys(EDITORIAL_LEARNING_TRIGGER_SQL)]);
        expect(check.prepare("SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all().filter((row) => !added.has(String(row.name)))).toEqual(before.map((row) => row.name === 'analysis_task_intents' ? { ...row, sql: FACTUAL_TASK_INTENTS_SQL } : CURATION_SCHEMA_SQL[String(row.name)] === undefined ? row : { ...row, sql: CURATION_SCHEMA_SQL[String(row.name)] }));
        expect(check.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally { check.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it.each(['partial', 'trigger'])('refuses a damaged interrupted upgrade (%s)', async (damage) => {
    const db = await predecessor();
    if (damage === 'partial') db.exec(EDITORIAL_LEARNING_SCHEMA_SQL.learning_signals);
    else { initializeEditorialLearningSchema(db); db.exec('DROP TRIGGER learning_signals_no_update'); }
    db.close();
    await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot)).rejects.toThrow();
  });
});
