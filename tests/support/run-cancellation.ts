import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_REVISION_31_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';
import { dropRunCheckpointRelations } from './run-continuation.js';

/**
 * Rebuild one analysis relation from an earlier revision's exact text with every row copied, rowid included, and
 * its ledger triggers re-armed, so that a store the current code built reads as that revision left it. The rows
 * must be ones the earlier text admits. The caller sets the version.
 */
function downgradeRelation(database: DatabaseSync, table: keyof typeof ANALYSIS_LEDGER_REVISION_31_SQL): void {
  const columns = (database.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  const attached = (database.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all(table) as { sql: string }[]).map((row) => row.sql);
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_${table} AS SELECT rowid AS plant_rowid, * FROM ${table};
        DROP TABLE ${table};
        ${ANALYSIS_LEDGER_REVISION_31_SQL[table]};
        INSERT INTO ${table}(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_${table} ORDER BY plant_rowid;
        DROP TABLE temp.plant_${table};`);
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

/**
 * Take a store the current code built back to exactly what schema revision 31 left (Issue #422): the Run states
 * without `cancelling` and the Task Outcomes without `cancelled`, and without revision 33's checkpoints. No Run of the store may be cancelling, and no
 * outcome cancelled. The caller sets the version.
 */
export function plantRevision31Relations(database: DatabaseSync): void {
  dropRunCheckpointRelations(database);
  downgradeRelation(database, 'analysis_run_states');
  downgradeRelation(database, 'analysis_task_outcomes');
}

/** Which of its shapes one of the two relations revision 32 widens holds: revision 31's, the current one, or neither. */
export function runCancellationShape(
  database: DatabaseSync,
  table: keyof typeof ANALYSIS_LEDGER_REVISION_31_SQL,
): 'revision-31' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_31_SQL[table])) return 'revision-31';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL[table]) ? 'current' : 'other';
}
