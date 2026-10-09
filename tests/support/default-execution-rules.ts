import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_EXECUTION_RULE_SCHEMA_SQL } from '../../src/service/default-execution-rules.js';
import { ANALYSIS_LEDGER_REVISION_30_SQL, ANALYSIS_LEDGER_REVISION_65_SQL, ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from './clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from './reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from './production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from './run-continuation.js';

/**
 * The three default-execution-rule relations schema revision 31 adds (Issue #421), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them with
 * whatever else later revisions added: a store that old never held them.
 */
export const DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(DEFAULT_EXECUTION_RULE_SCHEMA_SQL).reverse();

/**
 * Plant `analysis_run_authorizations` as schema revisions 15 to 30 carried it, so that a store the current code
 * built reads as one revision 30 left (Issue #421): the relation is rebuilt from the frozen revision-30 text with
 * every row copied, rowid included, and its two ledger triggers re-armed. The rows must be ones revision 30
 * admitted — every origin `standard-direct`. The caller sets the version.
 */
export function downgradeAnalysisRunAuthorizationsToRevision30(database: DatabaseSync): void {
  downgradeAnalysisRunAuthorizations(database, ANALYSIS_LEDGER_REVISION_30_SQL.analysis_run_authorizations);
}

/**
 * Plant `analysis_run_authorizations` as schema revisions 31 to 65 carried it (Issue #95, S39): the relation is rebuilt from
 * the frozen revision-65 text with every row copied, rowid included. The rows must be ones revision 65 admitted — no origin
 * `background-analysis-enrollment`. The caller sets the version.
 */
export function downgradeAnalysisRunAuthorizationsToRevision65(database: DatabaseSync): void {
  downgradeAnalysisRunAuthorizations(database, ANALYSIS_LEDGER_REVISION_65_SQL.analysis_run_authorizations);
}

function downgradeAnalysisRunAuthorizations(database: DatabaseSync, sql: string): void {
  const columns = (database.prepare("SELECT name FROM pragma_table_info('analysis_run_authorizations') ORDER BY cid").all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  const attached = (database.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'analysis_run_authorizations' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as { sql: string }[]).map((row) => row.sql);
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_analysis_run_authorizations AS SELECT rowid AS plant_rowid, * FROM analysis_run_authorizations;
        DROP TABLE analysis_run_authorizations;
        ${sql};
        INSERT INTO analysis_run_authorizations(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_analysis_run_authorizations ORDER BY plant_rowid;
        DROP TABLE temp.plant_analysis_run_authorizations;`);
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
 * Take a store the current code built back to exactly what revision 30 left: the rule ledger and revision 33's
 * checkpoints dropped and the Run Authorizations' origin narrowed again. The caller sets the version, so a suite can go further back first.
 */
export function plantRevision30Relations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      for (const relation of DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
  downgradeAnalysisRunAuthorizationsToRevision30(database);
}

/** Which of its shapes the Run Authorization relation holds: revision 30's, revision 65's, or the current widened one. */
export function analysisRunAuthorizationsShape(database: DatabaseSync): 'revision-30' | 'revision-65' | 'current' | 'other' {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_run_authorizations'").get() as { sql: string } | undefined;
  const normalized = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  if (row === undefined) return 'other';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_30_SQL.analysis_run_authorizations)) return 'revision-30';
  if (normalized(row.sql) === normalized(ANALYSIS_LEDGER_REVISION_65_SQL.analysis_run_authorizations)) return 'revision-65';
  return normalized(row.sql) === normalized(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_authorizations) ? 'current' : 'other';
}
