import type { DatabaseSync } from 'node:sqlite';
import { RUN_CHECKPOINT_SCHEMA_SQL } from '../../src/service/analysis/run-checkpoints.js';
import { ANALYSIS_LEDGER_REVISION_32_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';

/**
 * The relation schema revision 33 adds (Issue #422, S76b), in drop order. A suite that plants a store at an earlier
 * revision drops it with whatever else later revisions added: a store that old never held it.
 */
export const RUN_CHECKPOINT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(RUN_CHECKPOINT_SCHEMA_SQL).reverse();

/** Drop the relations revision 33 added, foreign keys off around it. The caller sets the version. */
export function dropRunCheckpointRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      for (const relation of RUN_CHECKPOINT_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Take a store the current code built back to exactly what revision 32 left: the checkpoint relation dropped and the
 * Run states narrowed to revision 32's text, every row copied, rowid included, triggers re-armed. No Run of the store
 * may be pausing, paused or resumable. The caller sets the version.
 */
export function plantRevision32Relations(database: DatabaseSync): void {
  dropRunCheckpointRelations(database);
  const columns = (database.prepare("SELECT name FROM pragma_table_info('analysis_run_states') ORDER BY cid").all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  const attached = (database.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'analysis_run_states' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as { sql: string }[]).map((row) => row.sql);
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_analysis_run_states AS SELECT rowid AS plant_rowid, * FROM analysis_run_states;
        DROP TABLE analysis_run_states;
        ${ANALYSIS_LEDGER_REVISION_32_SQL.analysis_run_states};
        INSERT INTO analysis_run_states(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_analysis_run_states ORDER BY plant_rowid;
        DROP TABLE temp.plant_analysis_run_states;`);
      for (const sql of attached) database.exec(sql);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

/** Which of its shapes the Run-state relation holds: revision 32's, the current one, or neither. */
export function runStatesShapeAt32(database: DatabaseSync): 'revision-32' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_run_states'").get() as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_32_SQL.analysis_run_states)) return 'revision-32';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_states) ? 'current' : 'other';
}
