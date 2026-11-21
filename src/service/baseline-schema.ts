import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { AI_EDIT_LOCK_SCHEMA_SQL, AI_EDIT_LOCK_TRIGGER_SQL } from './ai-edit-locks.js';
import { ANALYSIS_FEEDBACK_SCHEMA_SQL, ANALYSIS_FEEDBACK_TRIGGER_SQL } from './analysis-feedback.js';
import { CLARIFICATION_SCHEMA_SQL, CLARIFICATION_TRIGGER_SQL } from './analysis/clarifications.js';
import { OUTCOME_RESOLUTION_SCHEMA_SQL, OUTCOME_RESOLUTION_TRIGGER_SQL } from './analysis/outcome-resolutions.js';
import { RUN_CHECKPOINT_SCHEMA_SQL, RUN_CHECKPOINT_TRIGGER_SQL } from './analysis/run-checkpoints.js';
import { BACKGROUND_PROCESSING_ENROLLMENT_SCHEMA_SQL, BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL } from './background-analysis-enrollments.js';
import { BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL } from './book-delivery-package-exports.js';
import { BOOK_DELIVERY_PACKAGE_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_TRIGGER_SQL } from './book-delivery-packages.js';
import { BOOK_PEOPLE_SCHEMA_SQL, BOOK_PEOPLE_TRIGGER_SQL } from './book-people.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL, CAPTURED_PROCEDURE_TRIGGER_SQL } from './captured-procedures.js';
import { CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL, CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL } from './custom-analysis-dimensions.js';
import { DATA_VERSION_SCHEMA_SQL, DATA_VERSION_TRIGGER_SQL, DataVersionLedger } from './data-version.js';
import { DATABASE_EXPORT_SCHEMA_SQL, DATABASE_EXPORT_TRIGGER_SQL } from './database-exports.js';
import { DATABASE_MERGE_SCHEMA_SQL, DATABASE_MERGE_TRIGGER_SQL } from './database-merge.js';
import { DATABASE_REPLACEMENT_SCHEMA_SQL, DATABASE_REPLACEMENT_TRIGGER_SQL } from './database-replacement.js';
import { DECISION_FEEDBACK_SCHEMA_SQL, DECISION_FEEDBACK_TRIGGER_SQL } from './decision-feedback.js';
import { DEFAULT_EXECUTION_RULE_SCHEMA_SQL, DEFAULT_EXECUTION_RULE_TRIGGER_SQL } from './default-execution-rules.js';
import { DIALOGUE_SCHEMA_SQL, DIALOGUE_TRIGGER_SQL } from './dialogue/dialogue-ledger.js';
import { EDITORIAL_MARK_SCHEMA_SQL, EDITORIAL_MARK_TRIGGER_SQL, PROPOSAL_REVIEW_SCHEMA_SQL, PROPOSAL_REVIEW_TRIGGER_SQL } from './editorial-marks.js';
import {
  EDITORIAL_WORKSPACE_PROFILE_BOOK_PINS_SCHEMA_SQL, EDITORIAL_WORKSPACE_PROFILE_SIDECAR_REVISIONS_SCHEMA_SQL, EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL,
  NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL, NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL,
} from './editorial-workspace-profile.js';
import { EVALUATION_CALIBRATION_SCHEMA_SQL, EVALUATION_CALIBRATION_TRIGGER_SQL } from './evaluation-calibration.js';
import { EVALUATION_PROFILE_SCHEMA_SQL, EVALUATION_PROFILE_TRIGGER_SQL } from './evaluation-profiles.js';
import { EVALUATION_INITIAL_DRAFT_SCHEMA_SQL, EVALUATION_INITIAL_DRAFT_TRIGGER_SQL, EVALUATION_RECORD_SCHEMA_SQL, EVALUATION_RECORD_TRIGGER_SQL } from './evaluation-records.js';
import { EVALUATION_REWRITE_SCHEMA_SQL, EVALUATION_REWRITE_TRIGGER_SQL } from './evaluation-rewrites.js';
import { FACTUAL_CLAIM_SCHEMA_SQL, FACTUAL_CLAIM_TRIGGER_SQL, FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from './factual-verification-schema.js';
import { HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL } from './house-review-preference.js';
import {
  IMPORT_FIDELITY_CATEGORIES_SQL, IMPORT_RETENTION_SCHEMA_SQL, IMPORT_RETENTION_TRIGGER_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_TRIGGER_SQL,
} from './import-retention.js';
import { IMPORTED_EXEMPLAR_SCHEMA_SQL, IMPORTED_EXEMPLAR_TRIGGER_SQL } from './imported-exemplars.js';
import { IMPORTED_MARK_SCHEMA_SQL } from './imported-marks.js';
import { IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, IMPORTED_SKILL_UPDATE_TRIGGER_SQL } from './imported-skill-schema.js';
import { INLINE_EDITOR_REVISION_SCHEMA_SQL } from './inline-editor-revisions.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL, LEARNING_ELIGIBILITY_TRIGGER_SQL } from './learning-eligibility.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL, EDITORIAL_LEARNING_TRIGGER_SQL } from './learning/ledger.js';
import { SUPERVISION_SCHEMA_SQL, SUPERVISION_TRIGGER_SQL } from './learning/supervision-directives.js';
import { LIBRARY_MATERIAL_SCHEMA_SQL, LIBRARY_MATERIAL_TRIGGER_SQL } from './library-materials.js';
import { MAINTENANCE_CASE_SCHEMA_SQL, MAINTENANCE_CASE_TRIGGER_SQL } from './maintenance-cases.js';
import { MANUSCRIPT_EFFECT_SCHEMA_SQL, MANUSCRIPT_EFFECT_TRIGGER_SQL } from './manuscript-apply.js';
import { EXPORT_LEDGER_SCHEMA_SQL, EXPORT_LEDGER_TRIGGER_SQL } from './manuscript-export.js';
import { CORE_INDEX_SQL, CORE_SCHEMA_SQL, CORE_TRIGGER_SQL, SEARCH_SHADOW_SCHEMA_SQL, TARGET_VIRTUAL_TABLE_SQL } from './manuscript/bounded-schema-sql.js';
import { canonicalSchemaSql } from './manuscript/bounded-kernel.js';
import { NOTE_BLOCK_SCHEMA_SQL, NOTE_BLOCK_TRIGGER_SQL } from './manuscript/note-schema.js';
import { STRUCTURAL_EDIT_SCHEMA_SQL } from './manuscript/structural-schema.js';
import { IMPORT_STRUCTURE_SCHEMA_SQL, IMPORT_STRUCTURE_TRIGGER_SQL } from './manuscript/structure-schema.js';
import {
  MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL, MATERIAL_INDEX_SCHEMA_SQL, MATERIAL_INDEX_TRIGGER_SQL,
  MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL, MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL,
} from './material-index.js';
import { MODEL_ROLE_CHOICE_SCHEMA_SQL, MODEL_SERVICE_CONNECTION_SCHEMA_SQL } from './model-service-connections.js';
import { PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL, seedPreinstalledProcedures } from './procedures/definition-store.js';
import { EDITABLE_PROCEDURE_SCHEMA_SQL, EDITABLE_PROCEDURE_TRIGGER_SQL } from './procedures/editable-schema.js';
import {
  MANUSCRIPTS_SCHEMA_SQL, MULTI_DOCUMENT_INDEX_SQL, PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL, PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL, PRODUCTION_DOCUMENT_INDEX_SQL,
  PRODUCTION_DOCUMENT_SCHEMA_SQL, PRODUCTION_DOCUMENT_TRIGGER_SQL,
} from './production-document-ledger.js';
import { PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL, PRODUCTION_DOCUMENT_ORIGIN_TRIGGER_SQL } from './production-document-origins.js';
import { DERIVATIVE_WORKSPACE_SCHEMA_SQL, seedProductionDocumentCategories } from './production-document-types.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL, PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL } from './production-document-workflow.js';
import { PROPOSAL_CONFLICT_SCHEMA_SQL, PROPOSAL_CONFLICT_TRIGGER_SQL } from './proposal-conflicts.js';
import { PUBLICATION_VERSION_SCHEMA_SQL, PUBLICATION_VERSION_TRIGGER_SQL } from './publication-versions.js';
import { READERS_REPORT_SCHEMA_SQL, READERS_REPORT_TRIGGER_SQL } from './readers-reports.js';
import { REIMPORT_GROUP_SCHEMA_SQL } from './reimport-group-ledger.js';
import {
  RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL, RESEARCH_EVIDENCE_UNIT_REVISION_SCHEMA_SQL, RESEARCH_EVIDENCE_UNIT_REVISION_TRIGGER_SQL,
} from './research-evidence-schema.js';
import { REVIEW_GUIDELINE_SCHEMA_SQL, REVIEW_GUIDELINE_TRIGGER_SQL } from './review-guidelines.js';
import { HOUSE_WORD_LIST_SCHEMA_SQL, HOUSE_WORD_LIST_TRIGGER_SQL } from './review/house-word-list.js';
import { LOCAL_STAGE_SCHEMA_SQL, LOCAL_STAGE_TRIGGER_SQL, REVIEW_RUN_SCHEMA_SQL, REVIEW_RUN_TRIGGER_SQL } from './review/review-runs.js';
import { RUN_SYNTHESIS_SCHEMA_SQL } from './review/run-synthesis-storage.js';
import { SCHEDULED_BACKUP_SCHEMA_SQL, SCHEDULED_BACKUP_TRIGGER_SQL } from './scheduled-backups.js';
import { SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL, SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL } from './series-exclusions.js';
import { SERIES_KNOWLEDGE_SCHEMA_SQL, SERIES_KNOWLEDGE_TRIGGER_SQL } from './series-knowledge.js';
import { SERIES_SCHEMA_SQL, SERIES_TRIGGER_SQL } from './series.js';
import { STANDARD_TABLE_SCHEMA_SQL, installPreinstalledStandardTables, requireStandardTableEntries } from './standard-tables.js';
import { StoreError, requireStore } from './store-records.js';
import { seedSearchBackends } from './store-schema.js';
import {
  ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, SEARCH_BACKEND_CONNECTIONS_SQL, SEARCH_BACKEND_FALLBACK_SQL, TASK_AUTHORIZATION_SCHEMA_SQL,
  TASK_AUTHORIZATION_TRIGGER_SQL,
} from './task-authorization.js';
import { TASK_INTENT_DRAFT_SCHEMA_SQL, TASK_INTENT_DRAFT_TRIGGER_SQL } from './task-intent-drafts.js';
import { TASK_LAUNCH_SCHEMA_SQL, TASK_LAUNCH_TRIGGER_SQL } from './task-launch-snapshots.js';
import { WRITING_TASK_SCHEMA_SQL, WRITING_TASK_TRIGGER_SQL } from './writing-tasks.js';

/**
 * The storage baseline (#1634; ADR 0105 §4): revision 117, Data Version 2. A new store is built by one creation path from the
 * final-shape definitions each owner module keeps, listed here once; there is no migration chain. A store at this revision is
 * checked against the same list on every open, object by object.
 *
 * A later additive revision (118 …) adds its relations to its owner module and to `BASELINE_SCHEMA` below, raises
 * `BASELINE_SCHEMA_REVISION`, and writes the small step that brings a 117 store to it; `requireBaselineSchema` then checks the
 * whole list, so the step and the list can never disagree. Until the R5 storage train lands, every change of the 117 shape is
 * also named in `INTENDED_DELTA` of `tests/unit/baseline-schema.test.ts`.
 */
export const BASELINE_SCHEMA_REVISION = 117;

type Definitions = Readonly<Record<string, string>>;

/** Every relation, explicit index and trigger of the store, by owner. Order matters only in that tables precede the rest. */
const BASELINE_SCHEMA: ReadonlyArray<Definitions> = [
  CORE_SCHEMA_SQL, { working_block_search: TARGET_VIRTUAL_TABLE_SQL }, CORE_INDEX_SQL, CORE_TRIGGER_SQL,
  { manuscripts: MANUSCRIPTS_SCHEMA_SQL }, PRODUCTION_DOCUMENT_SCHEMA_SQL, PRODUCTION_DOCUMENT_INDEX_SQL, PRODUCTION_DOCUMENT_TRIGGER_SQL,
  PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL, PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL, MULTI_DOCUMENT_INDEX_SQL,
  PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL, PRODUCTION_DOCUMENT_ORIGIN_TRIGGER_SQL, PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL, PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL,
  DERIVATIVE_WORKSPACE_SCHEMA_SQL,
  { model_service_connections: MODEL_SERVICE_CONNECTION_SCHEMA_SQL },
  MODEL_ROLE_CHOICE_SCHEMA_SQL, // R5-F1a
  { search_backend_connections: SEARCH_BACKEND_CONNECTIONS_SQL, search_backend_fallback: SEARCH_BACKEND_FALLBACK_SQL },
  { native_artifact_installations: NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL, native_artifact_book_enablements: NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL,
    editorial_workspace_profile_sidecar_revisions: EDITORIAL_WORKSPACE_PROFILE_SIDECAR_REVISIONS_SCHEMA_SQL,
    editorial_workspace_profile_book_pins: EDITORIAL_WORKSPACE_PROFILE_BOOK_PINS_SCHEMA_SQL },
  EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL,
  TASK_AUTHORIZATION_SCHEMA_SQL, TASK_AUTHORIZATION_TRIGGER_SQL, ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL,
  { import_fidelity_categories: IMPORT_FIDELITY_CATEGORIES_SQL }, IMPORT_RETENTION_SCHEMA_SQL, IMPORT_RETENTION_TRIGGER_SQL,
  WORD_IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_TRIGGER_SQL,
  NOTE_BLOCK_SCHEMA_SQL, NOTE_BLOCK_TRIGGER_SQL, STRUCTURAL_EDIT_SCHEMA_SQL, IMPORT_STRUCTURE_SCHEMA_SQL, IMPORT_STRUCTURE_TRIGGER_SQL,
  IMPORTED_MARK_SCHEMA_SQL, REIMPORT_GROUP_SCHEMA_SQL, INLINE_EDITOR_REVISION_SCHEMA_SQL, AI_EDIT_LOCK_SCHEMA_SQL, AI_EDIT_LOCK_TRIGGER_SQL,
  EDITORIAL_MARK_SCHEMA_SQL, EDITORIAL_MARK_TRIGGER_SQL, PROPOSAL_REVIEW_SCHEMA_SQL, PROPOSAL_REVIEW_TRIGGER_SQL,
  PROPOSAL_CONFLICT_SCHEMA_SQL, PROPOSAL_CONFLICT_TRIGGER_SQL, MANUSCRIPT_EFFECT_SCHEMA_SQL, MANUSCRIPT_EFFECT_TRIGGER_SQL,
  EXPORT_LEDGER_SCHEMA_SQL, EXPORT_LEDGER_TRIGGER_SQL, PUBLICATION_VERSION_SCHEMA_SQL, PUBLICATION_VERSION_TRIGGER_SQL,
  BOOK_DELIVERY_PACKAGE_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_TRIGGER_SQL, BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL,
  MAINTENANCE_CASE_SCHEMA_SQL, MAINTENANCE_CASE_TRIGGER_SQL, BOOK_PEOPLE_SCHEMA_SQL, BOOK_PEOPLE_TRIGGER_SQL,
  REVIEW_RUN_SCHEMA_SQL, REVIEW_RUN_TRIGGER_SQL, LOCAL_STAGE_SCHEMA_SQL, LOCAL_STAGE_TRIGGER_SQL, RUN_SYNTHESIS_SCHEMA_SQL,
  HOUSE_WORD_LIST_SCHEMA_SQL, HOUSE_WORD_LIST_TRIGGER_SQL, STANDARD_TABLE_SCHEMA_SQL, REVIEW_GUIDELINE_SCHEMA_SQL, REVIEW_GUIDELINE_TRIGGER_SQL,
  HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL,
  DEFAULT_EXECUTION_RULE_SCHEMA_SQL, DEFAULT_EXECUTION_RULE_TRIGGER_SQL, RUN_CHECKPOINT_SCHEMA_SQL, RUN_CHECKPOINT_TRIGGER_SQL,
  CLARIFICATION_SCHEMA_SQL, CLARIFICATION_TRIGGER_SQL, OUTCOME_RESOLUTION_SCHEMA_SQL, OUTCOME_RESOLUTION_TRIGGER_SQL,
  TASK_INTENT_DRAFT_SCHEMA_SQL, TASK_INTENT_DRAFT_TRIGGER_SQL, TASK_LAUNCH_SCHEMA_SQL, TASK_LAUNCH_TRIGGER_SQL,
  BACKGROUND_PROCESSING_ENROLLMENT_SCHEMA_SQL, BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL,
  PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL, EDITABLE_PROCEDURE_SCHEMA_SQL, EDITABLE_PROCEDURE_TRIGGER_SQL,
  CAPTURED_PROCEDURE_SCHEMA_SQL, CAPTURED_PROCEDURE_TRIGGER_SQL, CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL, CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL,
  IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, IMPORTED_SKILL_UPDATE_TRIGGER_SQL,
  EDITORIAL_LEARNING_SCHEMA_SQL, EDITORIAL_LEARNING_TRIGGER_SQL, SUPERVISION_SCHEMA_SQL, SUPERVISION_TRIGGER_SQL,
  ANALYSIS_FEEDBACK_SCHEMA_SQL, ANALYSIS_FEEDBACK_TRIGGER_SQL, DECISION_FEEDBACK_SCHEMA_SQL, DECISION_FEEDBACK_TRIGGER_SQL,
  LEARNING_ELIGIBILITY_SCHEMA_SQL, LEARNING_ELIGIBILITY_TRIGGER_SQL,
  EVALUATION_RECORD_SCHEMA_SQL, EVALUATION_RECORD_TRIGGER_SQL, EVALUATION_INITIAL_DRAFT_SCHEMA_SQL, EVALUATION_INITIAL_DRAFT_TRIGGER_SQL,
  EVALUATION_CALIBRATION_SCHEMA_SQL, EVALUATION_CALIBRATION_TRIGGER_SQL, EVALUATION_PROFILE_SCHEMA_SQL, EVALUATION_PROFILE_TRIGGER_SQL,
  EVALUATION_REWRITE_SCHEMA_SQL, EVALUATION_REWRITE_TRIGGER_SQL, READERS_REPORT_SCHEMA_SQL, READERS_REPORT_TRIGGER_SQL,
  WRITING_TASK_SCHEMA_SQL, WRITING_TASK_TRIGGER_SQL,
  FACTUAL_CLAIM_SCHEMA_SQL, FACTUAL_CLAIM_TRIGGER_SQL, FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL,
  RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL, RESEARCH_EVIDENCE_UNIT_REVISION_SCHEMA_SQL, RESEARCH_EVIDENCE_UNIT_REVISION_TRIGGER_SQL,
  LIBRARY_MATERIAL_SCHEMA_SQL, LIBRARY_MATERIAL_TRIGGER_SQL, MATERIAL_INDEX_SCHEMA_SQL, MATERIAL_INDEX_TRIGGER_SQL,
  MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL, MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL, MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL,
  IMPORTED_EXEMPLAR_SCHEMA_SQL, IMPORTED_EXEMPLAR_TRIGGER_SQL,
  SERIES_SCHEMA_SQL, SERIES_TRIGGER_SQL, SERIES_KNOWLEDGE_SCHEMA_SQL, SERIES_KNOWLEDGE_TRIGGER_SQL,
  SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL, SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL,
  DIALOGUE_SCHEMA_SQL, DIALOGUE_TRIGGER_SQL,
  DATA_VERSION_SCHEMA_SQL, DATA_VERSION_TRIGGER_SQL, DATABASE_EXPORT_SCHEMA_SQL, DATABASE_EXPORT_TRIGGER_SQL,
  SCHEDULED_BACKUP_SCHEMA_SQL, SCHEDULED_BACKUP_TRIGGER_SQL, DATABASE_REPLACEMENT_SCHEMA_SQL, DATABASE_REPLACEMENT_TRIGGER_SQL,
  DATABASE_MERGE_SCHEMA_SQL, DATABASE_MERGE_TRIGGER_SQL,
];

export type SchemaObjectType = 'table' | 'index' | 'trigger';

export interface SchemaObject {
  readonly type: SchemaObjectType;
  readonly name: string;
  readonly sql: string;
}

function objectOf(name: string, sql: string): SchemaObject {
  const kind = /^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|VIRTUAL TABLE|INDEX|TRIGGER)\s+["'`[]?(\w+)/i.exec(sql);
  if (kind === null || kind[2] !== name) throw new StoreError('SCHEMA_INVALID', `数据库结构定义 ${name} 无效。`);
  return { type: /INDEX/i.test(kind[1]!) ? 'index' : /TRIGGER/i.test(kind[1]!) ? 'trigger' : 'table', name, sql };
}

let objects: ReadonlyArray<SchemaObject> | undefined;

/** The baseline's objects as SQL runs them: tables (the trigram index among them), then indexes, then triggers. */
export function baselineSchemaObjects(): ReadonlyArray<SchemaObject> {
  if (objects !== undefined) return objects;
  const all = BASELINE_SCHEMA.flatMap((definitions) => Object.entries(definitions).map(([name, sql]) => objectOf(name, sql)));
  const names = new Set<string>();
  for (const object of all) {
    requireStore(!names.has(object.name), 'SCHEMA_INVALID', `数据库结构定义 ${object.name} 重复。`);
    names.add(object.name);
  }
  const order: Readonly<Record<SchemaObjectType, number>> = { table: 0, index: 1, trigger: 2 };
  objects = [...all].sort((left, right) => order[left.type] - order[right.type]);
  return objects;
}

/**
 * Build the baseline in an empty database and stamp revision 117. The caller owns the transaction and writes the first
 * `store_versions` row: a new store gets it at creation, a converted one only at its switch (ADR 0105 §4).
 */
export function createBaselineSchema(db: DatabaseSync): void {
  requireStore(db.prepare('SELECT 1 FROM sqlite_schema LIMIT 1').get() === undefined, 'SCHEMA_INVALID', '新数据库必须为空。');
  for (const object of baselineSchemaObjects()) db.exec(object.sql);
  db.exec(`PRAGMA user_version = ${BASELINE_SCHEMA_REVISION}`);
}

type SqlRow = Record<string, SQLOutputValue>;

/**
 * The exact check of a store at the baseline revision: every object the baseline defines is there with the same SQL (compared
 * as `canonicalSchemaSql` folds it), the trigram index's shadow tables are as SQLite makes them, and nothing else stands —
 * no table, index, trigger or view the baseline does not name. Equal SQL means equal columns, keys, checks and references. The
 * 字表与词表 entries' version is the one reference not declared, so it is checked here, by one seek per version.
 */
export function requireBaselineSchema(db: DatabaseSync): void {
  const expected = new Map<string, string>();
  for (const object of baselineSchemaObjects()) expected.set(`${object.type}:${object.name}`, canonicalSchemaSql(object.sql));
  for (const [name, sql] of Object.entries(SEARCH_SHADOW_SCHEMA_SQL)) expected.set(`table:${name}`, canonicalSchemaSql(sql));
  const actual = db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL").all() as SqlRow[];
  requireStore(actual.length === expected.size, 'SCHEMA_INVALID', '数据库结构与当前版本不一致。');
  for (const row of actual) {
    const sql = expected.get(`${String(row.type)}:${String(row.name)}`);
    requireStore(sql !== undefined && typeof row.sql === 'string' && canonicalSchemaSql(row.sql) === sql,
      'SCHEMA_INVALID', `数据库结构对象 ${String(row.name)} 与当前版本不一致。`);
  }
  requireStandardTableEntries(db); // the one reference no whole-database pass walks (see standard-tables.ts)
}

/**
 * A new store (#1634; ADR 0105 §4): in one transaction, the baseline, its seed — the shipped search backends, the pre-installed
 * 工序, the built-in document categories and the four pre-installed 字表与词表 (R5-L1), as a store of revision 116 held them when it was new — and its first version
 * record, checked for references before it commits.
 */
export function createStoreAtBaseline(db: DatabaseSync, softwareVersion: string, dataVersion: number): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    createBaselineSchema(db);
    seedSearchBackends(db, new Date().toISOString());
    seedPreinstalledProcedures(db);
    seedProductionDocumentCategories(db);
    installPreinstalledStandardTables(db);
    new DataVersionLedger(db).recordOpen({ softwareVersion, dataVersion, schemaRevision: BASELINE_SCHEMA_REVISION });
    requireStore(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_INVALID', '新数据库的引用校验失败。');
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
