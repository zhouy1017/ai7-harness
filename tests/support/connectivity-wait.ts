import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_REVISION_29_SQL, ANALYSIS_LEDGER_REVISION_31_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';

/**
 * Plant `analysis_run_states` as schema revisions 15 to 29 carried it, so that a store the current code built
 * reads as one revision 29 left (Issue #502): the relation is rebuilt from the frozen revision-29 text with
 * every row copied, rowid included, and its two ledger triggers re-armed. The rows must be ones revision 29
 * admitted — no `awaiting-connectivity` and no `cancelled`. The caller sets the version.
 */
export function downgradeAnalysisRunStatesToRevision29(database: DatabaseSync): void {
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
        ${ANALYSIS_LEDGER_REVISION_29_SQL.analysis_run_states};
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

/**
 * Which of its shapes the Run-state relation holds: revision 29's, revision 31's — as revision 30 widened it and
 * before revision 32 widened it again (Issue #422) — or the current one.
 */
export function analysisRunStatesShape(database: DatabaseSync): 'revision-29' | 'revision-31' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_run_states'").get() as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_29_SQL.analysis_run_states)) return 'revision-29';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_31_SQL.analysis_run_states)) return 'revision-31';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_states) ? 'current' : 'other';
}
