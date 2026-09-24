import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_REVISION_33_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';
import { dropClarificationRelations } from './clarifications.js';

/**
 * Take a store the current code built back to exactly what revision 33 left (Issue #419): the Plan Revisions narrowed to
 * revision 33's text, every row copied, rowid included, triggers re-armed. No revision of the store may be a
 * `plan-edit`. The caller sets the version.
 */
export function plantRevision33Relations(database: DatabaseSync): void {
  // Revision 35's relations are newer, so a store at revision 33 never held them.
  dropClarificationRelations(database);
  const columns = (database.prepare("SELECT name FROM pragma_table_info('analysis_plan_revisions') ORDER BY cid").all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  const attached = (database.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'analysis_plan_revisions' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as { sql: string }[]).map((row) => row.sql);
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_analysis_plan_revisions AS SELECT rowid AS plant_rowid, * FROM analysis_plan_revisions;
        DROP TABLE analysis_plan_revisions;
        ${ANALYSIS_LEDGER_REVISION_33_SQL.analysis_plan_revisions};
        INSERT INTO analysis_plan_revisions(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_analysis_plan_revisions ORDER BY plant_rowid;
        DROP TABLE temp.plant_analysis_plan_revisions;`);
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

/** Which of its shapes the Plan Revision relation holds: revision 33's, the current one, or neither. */
export function planRevisionsShapeAt33(database: DatabaseSync): 'revision-33' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_plan_revisions'").get() as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_33_SQL.analysis_plan_revisions)) return 'revision-33';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_revisions) ? 'current' : 'other';
}
