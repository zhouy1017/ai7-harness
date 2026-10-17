import { IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL } from '../../src/service/imported-skill-schema.js';
import { HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL } from '../../src/service/house-review-preference.js';
import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_REVISION_79_SQL, ANALYSIS_LEDGER_REVISION_81_SQL, ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, CUSTOM_ANALYSIS_SCHEMA_VERSION, WEB_TOOLS_PLAN_RECORDS_SQL } from '../../src/service/task-authorization.js';
import { CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL, CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL } from '../../src/service/custom-analysis-dimensions.js';
import { TASK_INTENT_DRAFT_SCHEMA_SQL, TASK_INTENT_DRAFT_TRIGGER_SQL } from '../../src/service/task-intent-drafts.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from '../../src/service/research-evidence-schema.js';
import { MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL } from '../../src/service/material-index.js';
import { FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from '../../src/service/factual-verification-schema.js';

import { EDITORIAL_MARK_SCHEMA_SQL, PROPOSAL_ITEM_DECISIONS_PRE77_SQL, PROPOSAL_REVIEW_SCHEMA_SQL, PROPOSAL_REVIEW_TRIGGER_SQL } from '../../src/service/editorial-marks.js';

export const HOUSE_REVIEW_PREFERENCE_RELATIONS = Object.keys(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL);
export const IMPORTED_SKILL_RELATIONS = Object.keys(IMPORTED_SKILL_SCHEMA_SQL);
/** Revision 80's three relations (Issue #423, slice 7a), which a planted predecessor gains empty. */
export const TASK_INTENT_DRAFT_RELATIONS = Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL);
/** Revision 82's three relations (Issue #922, slice 7f), which a planted predecessor gains empty. */
export const CUSTOM_ANALYSIS_RELATIONS = Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL);
export const FACTUAL_VERIFICATION_SCHEMA_NAMES = [...Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL), ...Object.keys(FACTUAL_VERIFICATION_TRIGGER_SQL)];
/** Revision 78's four relations, added empty after a planted predecessor is reopened. */
export const FACTUAL_VERIFICATION_RELATIONS = Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL);
export const RESEARCH_EVIDENCE_RELATIONS = Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL);
/** Revision 76's two relations (Issue #892), which a planted predecessor gains empty beside its revision-67 ones. */
export const MATERIAL_INDEX_LAYER_RELATIONS = Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL);
/** Revision 77's five relations (Issue #902), which a planted predecessor gains empty. */
export const PROPOSAL_REVIEW_RELATIONS = Object.keys(PROPOSAL_REVIEW_SCHEMA_SQL);

/** The exact schema before 8b: its added objects are absent and its predecessor CHECK still stands. */
export function pre77SchemaRows<T extends { name: string; sql: unknown }>(rows: readonly T[]): Array<T | { name: string; sql: unknown }> {
  const added = new Set([...Object.keys(PROPOSAL_REVIEW_SCHEMA_SQL), ...Object.keys(PROPOSAL_REVIEW_TRIGGER_SQL)]);
  return rows.filter((row) => !added.has(row.name)).map((row) => row.name === 'proposal_item_decisions'
    ? { ...row, sql: PROPOSAL_ITEM_DECISIONS_PRE77_SQL } : row);
}

/** Plant an actual predecessor, including revision 74's newly widened component CHECK and house settings. */
export function execPre74Fixture(db: DatabaseSync, sql: string): void {
  const version = /PRAGMA user_version\s*=\s*(\d+)/iu.exec(sql)?.[1];
  if (version !== undefined && Number(version) < 81) {
    for (const trigger of Object.keys(IMPORTED_SKILL_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    for (const table of Object.keys(IMPORTED_SKILL_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  // Revisions 15 and 16 are validated against the terminal Task Intents text, as they always were; only 17 to 79 are narrowed.
  // The Result Set relations likewise: only 17 to 81 are narrowed back to the text before revision 82 (Issue #922, slice 7f).
  if (version !== undefined && Number(version) < CUSTOM_ANALYSIS_SCHEMA_VERSION) restoreCustomAnalysisPredecessor(db, Number(version) >= 17);
  if (version !== undefined && Number(version) < 80) restoreTaskIntentDraftPredecessor(db, Number(version) >= 17);
  if (version !== undefined && Number(version) < 79) dropHouseReviewPreferenceRelations(db);
  if (version !== undefined && Number(version) < 78) dropFactualVerificationRelations(db);
  if (version !== undefined && Number(version) < 77) restoreProposalReviewPredecessor(db);
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
 * adds the Material Index's two layer ledgers and their triggers beside a store's revision-67 relations, when it has them;
 * revision 77 (Issue #902) adds its five relations and their triggers and widens `proposal_item_decisions`' CHECK;
 * revision 78 (Issue #901) adds its four factual verification relations and immutable triggers.
 */
export function expectedSchema75(rows: readonly { name: string; sql: unknown }[]): Array<{ name: string; sql: unknown }> {
  const materialIndex = rows.some((row) => row.name === 'material_index_builds');
  return [
    ...Object.entries({ ...IMPORTED_SKILL_SCHEMA_SQL, ...IMPORTED_SKILL_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
    ...Object.entries({ ...HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, ...HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
    ...Object.entries({ ...TASK_INTENT_DRAFT_SCHEMA_SQL, ...TASK_INTENT_DRAFT_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
    ...Object.entries({ ...CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL, ...CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
    ...rows.map((row) => row.name === 'analysis_plan_records' ? { ...row, sql: WEB_TOOLS_PLAN_RECORDS_SQL }
      : row.name === 'analysis_task_intents' ? { ...row, sql: ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_intents }
      : row.name === 'analysis_result_sets' ? { ...row, sql: ANALYSIS_LEDGER_SCHEMA_SQL.analysis_result_sets }
      : row.name === 'analysis_result_set_revisions' ? { ...row, sql: ANALYSIS_LEDGER_SCHEMA_SQL.analysis_result_set_revisions }
      : row.name === 'proposal_item_decisions' ? { ...row, sql: EDITORIAL_MARK_SCHEMA_SQL.proposal_item_decisions } : row),
    ...Object.entries({ ...PROPOSAL_REVIEW_SCHEMA_SQL, ...PROPOSAL_REVIEW_TRIGGER_SQL }).map(([name, sql]) => ({ name, sql })),
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

/**
 * Undo revision 77 (Issue #902), so a planted store is the predecessor it claims: drop its five relations and their
 * triggers, and narrow `proposal_item_decisions` back to the pre-77 CHECK by the same rebuild the migration widens it
 * with — every rowid and value unchanged. A store already holding a `deferred` decision has no predecessor.
 */
export function restoreProposalReviewPredecessor(db: DatabaseSync): void {
  for (const trigger of Object.keys(PROPOSAL_REVIEW_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(PROPOSAL_REVIEW_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'proposal_item_decisions'").get();
  if (typeof row?.sql !== 'string' || !row.sql.includes("'deferred'")) return;
  if (db.prepare("SELECT 1 FROM proposal_item_decisions WHERE disposition = 'deferred'").get() !== undefined) throw new Error('PRE77_FIXTURE_HAS_DEFERRED');
  const attached = db.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name = 'proposal_item_decisions' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name").all().map((entry) => String(entry.sql));
  const columns = db.prepare("SELECT name FROM pragma_table_info('proposal_item_decisions') ORDER BY cid").all().map((entry) => String(entry.name)).join(', ');
  const enforced = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1;
  if (enforced) db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('CREATE TEMP TABLE pre77_item_decisions AS SELECT rowid AS prior_rowid, * FROM proposal_item_decisions; DROP TABLE proposal_item_decisions;');
    db.exec(PROPOSAL_ITEM_DECISIONS_PRE77_SQL);
    db.exec(`INSERT INTO proposal_item_decisions(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM temp.pre77_item_decisions ORDER BY prior_rowid; DROP TABLE temp.pre77_item_decisions;`);
    for (const sql of attached) db.exec(sql);
  } finally {
    if (enforced) db.exec('PRAGMA foreign_keys = ON');
  }
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

/** Remove the version/pin pair before planting a predecessor older than 79. */
export function dropHouseReviewPreferenceRelations(db: DatabaseSync): void {
  for (const trigger of Object.keys(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
}

/**
 * Undo revision 80 (Issue #423, slice 7a), so a planted store is the predecessor it claims: drop the three draft relations and
 * their triggers, and narrow `analysis_task_intents` back to its revision-79 text by the same byte-preserving rebuild the
 * migration widens it with — every rowid and value unchanged. A store holding a Task promoted from a draft has no predecessor.
 */
export function restoreTaskIntentDraftPredecessor(db: DatabaseSync, narrow = true): void {
  // Synchronized delta with Issue #922 (slice 7f): a store before revision 80 is before revision 82 too.
  restoreCustomAnalysisPredecessor(db, narrow);
  for (const trigger of Object.keys(TASK_INTENT_DRAFT_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_task_intents'").get();
  if (!narrow || typeof row?.sql !== 'string' || !row.sql.includes('custom-analysis/')) return;
  if (db.prepare("SELECT 1 FROM analysis_task_intents WHERE canonical_json LIKE '%intentDraftVersionId%'").get() !== undefined) throw new Error('PRE80_FIXTURE_HAS_DRAFT_TASK');
  const enforced = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1;
  if (enforced) db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('CREATE TEMP TABLE pre80_task_intents AS SELECT rowid AS prior_rowid, * FROM analysis_task_intents; DROP TABLE analysis_task_intents;');
    db.exec(ANALYSIS_LEDGER_REVISION_79_SQL.analysis_task_intents);
    const columns = db.prepare("SELECT name FROM pragma_table_info('analysis_task_intents') ORDER BY cid").all().map((entry) => String(entry.name)).join(', ');
    db.exec(`INSERT INTO analysis_task_intents(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM temp.pre80_task_intents ORDER BY prior_rowid; DROP TABLE temp.pre80_task_intents;`);
    db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_intents_no_update']!);
    db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_intents_no_delete']!);
  } finally {
    if (enforced) db.exec('PRAGMA foreign_keys = ON');
  }
}

/** The exact schema before revision 80 (Issue #423, slice 7a): no draft relations, and the revision-79 Task Intents text. */
export function pre80SchemaRows<T extends { name: string; sql: unknown }>(rows: readonly T[]): Array<T | { name: string; sql: unknown }> {
  const added = new Set([...Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL), ...Object.keys(TASK_INTENT_DRAFT_TRIGGER_SQL)]);
  // Synchronized delta with Issue #922 (slice 7f): a store before revision 80 is before revision 82 too.
  return pre82SchemaRows(rows).filter((row) => !added.has(row.name)).map((row) => row.name === 'analysis_task_intents'
    ? { ...row, sql: ANALYSIS_LEDGER_REVISION_79_SQL.analysis_task_intents } : row);
}

/**
 * Undo revision 82 (Issue #922, slice 7f), so a planted store is the predecessor it claims: drop the three dimension relations and
 * their triggers, and narrow the two Result Set relations back to their revision-81 text by the same byte-preserving rebuild the
 * migration widens them with — every rowid and value unchanged. A store holding a custom analysis Result Set has no predecessor.
 */
export function restoreCustomAnalysisPredecessor(db: DatabaseSync, narrow = true): void {
  for (const trigger of Object.keys(CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE IF EXISTS ${table}`);
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_result_sets'").get();
  if (!narrow || typeof row?.sql !== 'string' || !row.sql.includes('custom-analysis/')) return;
  if (db.prepare("SELECT 1 FROM analysis_result_sets WHERE kind GLOB 'custom-analysis/*'").get() !== undefined) throw new Error('PRE82_FIXTURE_HAS_CUSTOM_RESULT_SET');
  const enforced = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1;
  if (enforced) db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const table of ['analysis_result_sets', 'analysis_result_set_revisions'] as const) {
      db.exec(`CREATE TEMP TABLE pre82_${table} AS SELECT rowid AS prior_rowid, * FROM ${table}; DROP TABLE ${table};`);
      db.exec(ANALYSIS_LEDGER_REVISION_81_SQL[table]);
      const columns = db.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all().map((entry) => String(entry.name)).join(', ');
      db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM temp.pre82_${table} ORDER BY prior_rowid; DROP TABLE temp.pre82_${table};`);
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!);
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!);
    }
  } finally {
    if (enforced) db.exec('PRAGMA foreign_keys = ON');
  }
}

/** The exact schema before revision 82 (Issue #922, slice 7f): no dimension relations, and the revision-81 Result Set text. */
export function pre82SchemaRows<T extends { name: string; sql: unknown }>(rows: readonly T[]): Array<T | { name: string; sql: unknown }> {
  const added = new Set([...Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL), ...Object.keys(CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL)]);
  return rows.filter((row) => !added.has(row.name)).map((row) => row.name === 'analysis_result_sets' || row.name === 'analysis_result_set_revisions'
    ? { ...row, sql: ANALYSIS_LEDGER_REVISION_81_SQL[row.name] } : row);
}
