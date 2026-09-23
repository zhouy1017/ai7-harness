import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { CONNECTIVITY_WAIT_SCHEMA_VERSION, EXPORT_LEDGER_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { analysisRunStatesShape, downgradeAnalysisRunStatesToRevision29 } from '../support/connectivity-wait.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for Connectivity Wait (Issue #502, plan slice S74b): the real store on a
// temporary Agent Data Root, exact `sample1` imported through the supported path, and no Provider, socket
// or credential value. Schema revision 30 widens the Run states; `联网后开始任务` records a Run that waits,
// Reconnect Preflight admits it or says why not, and a waiting Run is cancelled before it dispatches.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-connectivity-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

/** Every relation's exact text and a digest of its rows, so a migration can say exactly what it moved. */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Row[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

describe('schema revision 30 over the real store', () => {
  it('widens a planted revision-29 store\'s Run states with every row as it was, and moves nothing else', async () => {
    // A Task authorized with no route: the two Run states revision 29 already admitted.
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const imported = await importSample1Book(first, roots.codeRoot, 'L2 sample1 联网等待迁移');
      await pinEditorialWorkspaceProfileRevision2(first, imported.bookId);
      recordMissingCredentialConnection(first, 'L2 主编辑连接');
      const prepared = prepare(first, imported.bookId);
      first.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const before = withDatabase(false, (database) => {
      downgradeAnalysisRunStatesToRevision29(database);
      database.exec(`PRAGMA user_version = ${EXPORT_LEDGER_SCHEMA_VERSION}`);
      expect(analysisRunStatesShape(database)).toBe('revision-29');
      return {
        states: database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all() as Row[],
        truth: relationTruth(database),
      };
    });
    expect(before.states.map((row) => row.state)).toEqual(['authorized', 'blocked-before-dispatch']);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(CONNECTIVITY_WAIT_SCHEMA_VERSION);
      expect(analysisRunStatesShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all()).toEqual(before.states);
      const after = relationTruth(database);
      expect([...after.keys()]).toEqual([...before.truth.keys()]);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name)).toEqual(['analysis_run_states']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_run_states' ORDER BY name").all())
        .toEqual([{ name: 'analysis_run_states_no_delete' }, { name: 'analysis_run_states_no_update' }]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);

  it('refuses a store whose Run states match neither shape, rather than rebuilding it', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    withDatabase(false, (database) => {
      downgradeAnalysisRunStatesToRevision29(database);
      // A hand-altered relation: a column no revision ever wrote.
      database.exec(`PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        DROP TRIGGER analysis_run_states_no_update;
        DROP TRIGGER analysis_run_states_no_delete;
        ALTER TABLE analysis_run_states ADD COLUMN note TEXT;
        PRAGMA user_version = ${EXPORT_LEDGER_SCHEMA_VERSION};
        COMMIT;
        PRAGMA foreign_keys = ON;`);
      expect(analysisRunStatesShape(database)).toBe('other');
    });
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 300_000);
});
