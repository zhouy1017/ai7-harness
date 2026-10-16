import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, WEB_TOOLS_PLAN_RECORDS_SQL } from '../../src/service/task-authorization.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from '../../src/service/research-evidence-schema.js';

/** Plant an actual predecessor, including revision 74's newly widened component CHECK and house settings. */
export function execPre74Fixture(db: DatabaseSync, sql: string): void {
  const version = /PRAGMA user_version\s*=\s*(\d+)/iu.exec(sql)?.[1];
  if (version !== undefined && Number(version) < 74) {
    const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_plan_records'").get();
    if (typeof row?.sql === 'string' && row.sql.includes("'web-tools-backend'")) {
      if (db.prepare("SELECT 1 FROM analysis_plan_records WHERE component = 'web-tools-backend'").get() !== undefined) throw new Error('PRE74_FIXTURE_HAS_WEB_TOOLS');
      db.exec('CREATE TEMP TABLE pre74_plan_records AS SELECT rowid AS prior_rowid, * FROM analysis_plan_records; DROP TABLE analysis_plan_records;');
      db.exec(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_records);
      db.exec('INSERT INTO analysis_plan_records(rowid, task_intent_id, plan_version, component, canonical_json, sha256, created_at) SELECT prior_rowid, task_intent_id, plan_version, component, canonical_json, sha256, created_at FROM temp.pre74_plan_records ORDER BY prior_rowid; DROP TABLE temp.pre74_plan_records;');
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_update']!);
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_delete']!);
    }
  }
  db.exec(sql);
}

/** All pre-existing schema rows remain exact except revision 74's explicitly widened component CHECK. */
export function expectedSchema74<T extends { name: string; sql: unknown }>(rows: readonly T[]): T[] {
  return rows.map((row) => row.name === 'analysis_plan_records' ? { ...row, sql: WEB_TOOLS_PLAN_RECORDS_SQL } : row);
}

/** Drop revision 75's research evidence relations and triggers (Issue #425), so a planted store is the predecessor it claims. */
export function dropResearchEvidenceRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(RESEARCH_EVIDENCE_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}
