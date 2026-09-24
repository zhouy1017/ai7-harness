import type { DatabaseSync } from 'node:sqlite';
import { CLARIFICATION_SCHEMA_SQL } from '../../src/service/analysis/clarifications.js';
import { ANALYSIS_LEDGER_REVISION_34_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';

/**
 * The relations schema revision 35 adds (Issue #422, S76d), in drop order: an answer before the request it answers. A
 * suite that plants a store at an earlier revision drops them with whatever else later revisions added: a store that
 * old never held them.
 */
export const CLARIFICATION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(CLARIFICATION_SCHEMA_SQL).reverse();

/** Drop the relations revision 35 added, foreign keys off around it. The caller sets the version. */
export function dropClarificationRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      for (const relation of CLARIFICATION_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE IF EXISTS ${relation}`);
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
 * Take a store the current code built back to exactly what revision 34 left: the clarification relations dropped and
 * the Run states narrowed to revision 34's text, every row copied, rowid included, triggers re-armed. No Run of the
 * store may be awaiting clarification. The caller sets the version.
 */
export function plantRevision34Relations(database: DatabaseSync): void {
  dropClarificationRelations(database);
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
        ${ANALYSIS_LEDGER_REVISION_34_SQL.analysis_run_states};
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

/** Which of its shapes the Run-state relation holds: revision 34's, the current one, or neither. */
export function runStatesShapeAt34(database: DatabaseSync): 'revision-34' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_run_states'").get() as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_34_SQL.analysis_run_states)) return 'revision-34';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_states) ? 'current' : 'other';
}
