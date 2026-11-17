import { initializeSeriesSchema } from '../../../src/service/series.js';
import { DatabaseSync } from 'node:sqlite';
import { configureDatabase, initializeSchema } from '../../../src/service/store-schema.js';
import { initializeReviewRunSchema, initializeLocalStageSchema, REVIEW_RUN_SCHEMA_SQL } from '../../../src/service/review/review-runs.js';
import { initializeRunSynthesisSchema } from '../../../src/service/review/run-synthesis-storage.js';

export const REVIEW_DOMAIN_TABLES = [...Object.keys(REVIEW_RUN_SCHEMA_SQL), 'review_local_stage_artifacts', 'review_run_synthesis'];
/** external-owner stub — not a schema or provenance proof. Parity checks every declared column. */
export const REVIEW_EXTERNAL_STUBS = {
  branch_working_state: 'branch_id TEXT PRIMARY KEY, base_revision_id TEXT, journal_sequence INTEGER, working_digest TEXT',
  working_blocks: 'branch_id TEXT, block_id TEXT PRIMARY KEY, position INTEGER, kind TEXT, text TEXT, grapheme_length INTEGER',
  analysis_run_records: 'run_record_id TEXT PRIMARY KEY',
  analysis_result_set_revisions: 'revision_id TEXT PRIMARY KEY',
  production_document_categories: 'type_id TEXT PRIMARY KEY, name TEXT, description TEXT, position INTEGER',
  production_documents: 'document_id TEXT PRIMARY KEY, book_id TEXT, type_id TEXT, created_at TEXT',
  production_document_metadata: 'document_id TEXT PRIMARY KEY, type_id TEXT, deleted INTEGER',
  manuscript_outline: 'branch_id TEXT, block_id TEXT, kind TEXT, position INTEGER, level INTEGER, text TEXT',
  editorial_marks: 'mark_id TEXT PRIMARY KEY',
  analysis_task_intents: 'task_intent_id TEXT PRIMARY KEY, book_id TEXT, kind TEXT, created_at TEXT',
  model_service_connections: 'connection_id TEXT PRIMARY KEY, credential_reference TEXT, credential_operation_state TEXT',
} as const;

/** Build once per test file; cases use savepoints so the production immutable triggers stay installed. */
export function reviewDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  try {
    configureDatabase(db);
    initializeSchema(db);
    for (const [table, columns] of Object.entries(REVIEW_EXTERNAL_STUBS)) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (${columns}) STRICT`);
    // External-owner stub extension to the core initializer's earlier working-block shape.
    db.exec('ALTER TABLE working_blocks ADD COLUMN grapheme_length INTEGER');
    initializeSeriesSchema(db);
    initializeReviewRunSchema(db);
    initializeLocalStageSchema(db);
    initializeRunSynthesisSchema(db);
    return db;
  } catch (error) { db.close(); throw error; }
}
