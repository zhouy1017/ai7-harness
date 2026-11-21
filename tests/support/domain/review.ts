import { createBaselineRelations } from '../baseline-relations.js';
import { BaselineAnalysisStore } from '../../../src/service/analysis/baseline-analysis-store.js';
import { factualReviewKindDefinition } from '../../../src/service/analysis/kind-definition.js';
import { EditorialMarkStore } from '../../../src/service/editorial-marks.js';
import { RecentCache } from '../../../src/service/recent-cache.js';
import { ReviewRunStore } from '../../../src/service/review/review-runs.js';
import { reviewLedgerOf, type ReviewOperationsHost } from '../../../src/service/review/review-operations.js';
import { DatabaseSync } from 'node:sqlite';
import { LOCAL_STAGE_SCHEMA_SQL, REVIEW_RUN_SCHEMA_SQL } from '../../../src/service/review/review-runs.js';
import { RUN_SYNTHESIS_SCHEMA_SQL } from '../../../src/service/review/run-synthesis-storage.js';

export const REVIEW_DOMAIN_TABLES = [...Object.keys(REVIEW_RUN_SCHEMA_SQL), 'review_local_stage_artifacts', 'review_run_synthesis'];
/** external-owner stub — not a schema or provenance proof. Parity checks every column's type, NOT NULL and key position. */
export const REVIEW_EXTERNAL_STUBS = {
  books: 'book_id TEXT NOT NULL, stable_identity TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(book_id)',
  manuscripts: 'manuscript_id TEXT NOT NULL, book_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(manuscript_id)',
  manuscript_branches: 'branch_id TEXT NOT NULL, manuscript_id TEXT NOT NULL, name TEXT NOT NULL, base_revision_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(branch_id)',
  source_versions: 'source_version_id TEXT NOT NULL, book_id TEXT NOT NULL, object_digest TEXT NOT NULL, source_digest TEXT NOT NULL, content_digest TEXT, structure_digest TEXT, parser_identity TEXT, format TEXT NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_version_id)',
  manuscript_revisions: 'revision_id TEXT NOT NULL, manuscript_id TEXT NOT NULL, branch_id TEXT NOT NULL, ordinal INTEGER NOT NULL, revision_label TEXT NOT NULL, parent_revision_id TEXT, source_version_id TEXT NOT NULL, revision_digest TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(revision_id)',
  manuscript_blocks: 'block_id TEXT NOT NULL, manuscript_id TEXT NOT NULL, created_revision_id TEXT NOT NULL, PRIMARY KEY(block_id)',
  branch_working_state: 'branch_id TEXT NOT NULL, manuscript_id TEXT NOT NULL, base_revision_id TEXT NOT NULL, journal_sequence INTEGER NOT NULL, working_digest TEXT NOT NULL, PRIMARY KEY(branch_id)',
  working_blocks: 'branch_id TEXT NOT NULL, block_id TEXT NOT NULL, position INTEGER NOT NULL, kind TEXT NOT NULL, level INTEGER, text TEXT NOT NULL, digest TEXT NOT NULL, grapheme_length INTEGER NOT NULL, PRIMARY KEY(branch_id, block_id)',
  analysis_run_records: 'run_record_id TEXT NOT NULL, PRIMARY KEY(run_record_id)',
  analysis_result_set_revisions: 'revision_id TEXT NOT NULL, PRIMARY KEY(revision_id)',
  production_document_categories: 'type_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(type_id)',
  production_documents: 'document_id TEXT NOT NULL, book_id TEXT NOT NULL, type_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(document_id)',
  production_document_metadata: 'document_id TEXT NOT NULL, type_id TEXT NOT NULL, deleted INTEGER NOT NULL, PRIMARY KEY(document_id)',
  manuscript_outline: 'branch_id TEXT NOT NULL, block_id TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, level INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(branch_id, block_id)',
  editorial_marks: 'mark_id TEXT NOT NULL, PRIMARY KEY(mark_id)',
  analysis_task_intents: 'task_intent_id TEXT NOT NULL, book_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(task_intent_id)',
  model_service_connections: 'connection_id TEXT NOT NULL, credential_reference TEXT NOT NULL, credential_operation_state TEXT NOT NULL, PRIMARY KEY(connection_id)',
  series: 'series_id TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY(series_id)',
  series_membership_changes: 'series_id TEXT NOT NULL, book_id TEXT NOT NULL, ordinal INTEGER NOT NULL, kind TEXT NOT NULL, recorded_at TEXT NOT NULL',
} as const;

/** Only Review's production initializers; every outside table is an explicit source stub above. */
export function reviewDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const [table, columns] of Object.entries(REVIEW_EXTERNAL_STUBS)) db.exec(`CREATE TABLE ${table} (${columns}) STRICT`);
    createBaselineRelations(db, REVIEW_RUN_SCHEMA_SQL);
    createBaselineRelations(db, LOCAL_STAGE_SCHEMA_SQL);
    createBaselineRelations(db, RUN_SYNTHESIS_SCHEMA_SQL);
    return db;
  } catch (error) { db.close(); throw error; }
}

/** The test owns this transaction; a case's outer savepoint restores its writes. */
export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** external-owner stub — not a schema or provenance proof. Unexpected outside-domain access fails the case. */
const outside = (name: string): never => { throw new Error('Review fixture does not read ' + name); };

/** Real exported operations receive the same live dependency shape as production; no store methods are reimplemented. */
export function reviewHost(db: DatabaseSync): ReviewOperationsHost {
  const checkpointOwner = {
    createManuscriptCheckpointWork: () => outside('checkpoint creation'),
    advanceManuscriptCheckpointWork: () => outside('checkpoint advancement'),
    finalizeManuscriptCheckpointWork: () => outside('checkpoint finalization'),
    cancelManuscriptCheckpointWork: () => outside('checkpoint cancellation'),
  };
  const baseline = new BaselineAnalysisStore(db, checkpointOwner, null);
  const factual = new BaselineAnalysisStore(db, checkpointOwner, null, factualReviewKindDefinition());
  let runs: ReviewRunStore;
  const host: ReviewOperationsHost = {
    get authority() { return db; },
    get boundedAuthority() { return checkpointOwner; },
    get baselineAnalysis() { return baseline; },
    get factualReview() { return factual; },
    get reviewRuns() { return runs; },
    reviewCategoryLedgers: new RecentCache(32, ledger => ledger.preparing),
    reviewCategoryDefinitions: new RecentCache(32),
    control: { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null },
    get codeRoot() { return outside('launch-policy files'); },
    get factualVerification() { return outside('factual verification'); },
    get capturedProcedureHost() { return outside('captured procedures'); },
    get rules() { return outside('default rules'); },
    get manuscriptExport() { return outside('export'); },
    assertAvailable: () => {},
    // External error/poison boundaries are passthroughs; their integration assertions stay on disk.
    analysisCall: operation => operation(), reviewCall: operation => operation(), verificationCall: operation => operation(),
    ruleCall: operation => operation(), exportCall: operation => operation(),
    transaction,
    memoryFacade: () => outside('editorial memory'),
    taskMaterialReadings: () => outside('material text'),
    // External-owner read stub: these cases name no material, and do not prove material preparation.
    prepareTaskMaterials: (_bookId, ids) => { if (ids.length) outside('material preparation'); return []; },
    resultBinding: () => outside('factual result binding'), launchChoice: () => outside('execution choice'),
    executionLedgerForRun: () => outside('execution ledger'), materializeFactualVerification: () => outside('factual writes'),
    inspectTaskPlanWithConnection: () => outside('task plan'), inspectFactualVerification: () => outside('factual lens'),
    inspectEvidenceWorkspace: () => outside('evidence'), inspectResearchEvidence: () => outside('research evidence'),
  };
  runs = new ReviewRunStore(db, new EditorialMarkStore(db), { baseline: () => host.baselineAnalysis,
    memoryFacade: host.memoryFacade, ledgerOf: (...args) => reviewLedgerOf(host, ...args) });
  return host;
}
