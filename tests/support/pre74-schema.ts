import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, WEB_TOOLS_PLAN_RECORDS_SQL } from '../../src/service/task-authorization.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from '../../src/service/research-evidence-schema.js';
import { MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL } from '../../src/service/material-index.js';
import { FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from '../../src/service/factual-verification-schema.js';

export const FACTUAL_VERIFICATION_SCHEMA_NAMES = [...Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL), ...Object.keys(FACTUAL_VERIFICATION_TRIGGER_SQL)];

export const RESEARCH_EVIDENCE_RELATIONS = Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL);
/** Revision 76's two relations (Issue #892), which a planted predecessor gains empty beside its revision-67 ones. */
export const MATERIAL_INDEX_LAYER_RELATIONS = Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL);

/** Plant an actual predecessor, including revision 74's newly widened component CHECK and house settings. */
export function execPre74Fixture(db: DatabaseSync, sql: string): void {
  const version = /PRAGMA user_version\s*=\s*(\d+)/iu.exec(sql)?.[1];
  if (version !== undefined && Number(version) < 77) dropFactualVerificationRelations(db);
  if (version !== undefined && Number(version) < 76) dropMaterialIndexLayerRelations(db);
  if (version !== undefined && Number(version) < 75) dropResearchEvidenceRelations(db);
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

/**
 * Revision 74 widens one CHECK; revision 75 adds its four empty ledgers and their immutable triggers; revision 76 (Issue #892)
 * adds the Material Index's two layer ledgers and their triggers beside a store's revision-67 relations, when it has them.
 */
export function expectedSchema75(rows: readonly { name: string; sql: unknown }[]): Array<{ name: string; sql: unknown }> {
  const materialIndex = rows.some((row) => row.name === 'material_index_builds');
  return [
    ...rows.map((row) => row.name === 'analysis_plan_records' ? { ...row, sql: WEB_TOOLS_PLAN_RECORDS_SQL } : row),
    ...Object.entries({ ...RESEARCH_EVIDENCE_SCHEMA_SQL, ...RESEARCH_EVIDENCE_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
    ...(materialIndex ? Object.entries({ ...MATERIAL_INDEX_LAYER_SCHEMA_SQL, ...MATERIAL_INDEX_LAYER_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })) : []),
    ...Object.entries({ ...FACTUAL_VERIFICATION_SCHEMA_SQL, ...FACTUAL_VERIFICATION_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
  ].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Remove this slice's append-only schema when planting a predecessor. */
export function dropFactualVerificationRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(FACTUAL_VERIFICATION_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}

/** Drop revision 76's Material Index layer relations and triggers (Issue #892), so a planted store is the predecessor it claims. */
export function dropMaterialIndexLayerRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(MATERIAL_INDEX_LAYER_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}

/** Drop revision 75's research evidence relations and triggers (Issue #425), so a planted store is the predecessor it claims. */
export function dropResearchEvidenceRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(RESEARCH_EVIDENCE_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}
