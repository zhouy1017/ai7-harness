import { canonicalSchemaSql } from './manuscript/bounded-kernel.js';
import {
  MODEL_REQUEST_ADMISSION_SCHEMA_VERSION,
  WORD_TRACKED_IMPORT_SCHEMA_VERSION,
  POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION,
  LEARNING_CURATION_SCHEMA_VERSION,
  IDLE_BACKGROUND_SCHEMA_VERSION,
  LOCAL_REVIEW_SCHEMA_VERSION,
  EDITORIAL_MEMORY_SCHEMA_VERSION,
  GLOBAL_AGENT_SCHEMA_VERSION,
  J03_TASK_AUTHORIZATION_SCHEMA_VERSION,
  EDITORIAL_MARK_SCHEMA_VERSION,
  EDITORIAL_REVIEW_SCHEMA_VERSION,
  MANUSCRIPT_EFFECT_SCHEMA_VERSION,
  J04_BASELINE_ANALYSIS_SCHEMA_VERSION,
  MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
  MANUSCRIPT_INTAKE_SCHEMA_VERSION,
  PUBLICATION_VERSION_SCHEMA_VERSION,
  PROPOSAL_CONFLICT_SCHEMA_VERSION,
  IMPORT_RETENTION_SCHEMA_VERSION,
  IMPORTED_MARK_SCHEMA_VERSION,
  EXPORT_LEDGER_SCHEMA_VERSION,
  CONNECTIVITY_WAIT_SCHEMA_VERSION,
  DEFAULT_EXECUTION_RULE_SCHEMA_VERSION,
  RUN_CANCELLATION_SCHEMA_VERSION,
  RUN_CONTINUATION_SCHEMA_VERSION,
  PLAN_EDIT_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION,
  REIMPORT_GROUP_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION,
  BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION,
  BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION,
  MAINTENANCE_CASE_SCHEMA_VERSION,
  BOOK_PEOPLE_SCHEMA_VERSION,
  REVIEW_GUIDELINE_SCHEMA_VERSION,
  LIBRARY_MATERIAL_SCHEMA_VERSION,
  EVALUATION_RECORD_SCHEMA_VERSION,
  ANALYSIS_FEEDBACK_SCHEMA_VERSION,
  DECISION_FEEDBACK_SCHEMA_VERSION,
  LEARNING_ELIGIBILITY_SCHEMA_VERSION,
  EVALUATION_CALIBRATION_SCHEMA_VERSION,
  SERIES_SCHEMA_VERSION,
  SERIES_KNOWLEDGE_SCHEMA_VERSION,
  STORE_VERSION_SCHEMA_VERSION,
  DATABASE_EXPORT_SCHEMA_VERSION,
  SCHEDULED_BACKUP_SCHEMA_VERSION,
  DATABASE_REPLACEMENT_SCHEMA_VERSION,
  DATABASE_MERGE_SCHEMA_VERSION,
  INITIAL_EVALUATION_SCHEMA_VERSION,
  DIALOGUE_SCHEMA_VERSION,
  SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION,
  READERS_REPORT_SCHEMA_VERSION,
  CAPTURED_PROCEDURE_SCHEMA_VERSION,
  EVALUATION_REWRITE_SCHEMA_VERSION,
  WRITING_TASK_SCHEMA_VERSION,
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION,
  MATERIAL_INDEX_SCHEMA_VERSION,
  OUTCOME_RESOLUTION_SCHEMA_VERSION,
  IMPORTED_EXEMPLAR_SCHEMA_VERSION,
  EVALUATION_PROFILE_SCHEMA_VERSION,
  DIALOGUE_LIVE_BINDING_SCHEMA_VERSION,
  MODEL_SERVICE_ROUTES_SCHEMA_VERSION,
  MODEL_CLARIFICATION_SCHEMA_VERSION,
  SEARCH_BACKEND_SCHEMA_VERSION,
  SEARCH_BACKEND_CONNECTIONS_SQL,
  LEGACY_SEARCH_BACKEND_CONNECTIONS_SQL,
  SEARCH_BACKEND_OVERRIDE_COLUMN,
  RESEARCH_EVIDENCE_SCHEMA_VERSION,
  MATERIAL_INDEX_LAYER_SCHEMA_VERSION,
  PROPOSAL_REVIEW_SCHEMA_VERSION,
  FACTUAL_VERIFICATION_SCHEMA_VERSION,
  HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION,
  TASK_INTENT_DRAFT_SCHEMA_VERSION,
  IMPORTED_SKILL_SCHEMA_VERSION,
  CUSTOM_ANALYSIS_SCHEMA_VERSION,
  IMPORTED_SKILL_UPDATE_SCHEMA_VERSION,
  MODEL_SELECTION_SCHEMA_VERSION,
  PROCEDURE_DEFINITION_SCHEMA_VERSION,
  EDITORIAL_LEARNING_SCHEMA_VERSION,
  LATEST_SCHEMA_VERSION,
  REVIEW_CONTRACT_SCHEMA_VERSION,
  SUCCESSIVE_TASK_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_VERSION,
  TEXT_CONVERSION_SCHEMA_VERSION,
  FACTUAL_REVIEW_SCHEMA_VERSION,
} from './task-authorization.js';
import { SEARCH_BACKENDS, defaultSearchBackend } from './provider/search-backends.js';
import { allowedProductionBindingOf } from './launch-policy.js';
import {
  MODEL_SERVICE_ROUTES,
  modelServiceChannelOf,
  validModelServiceModelId,
  type ModelConnectionTestStatus,
  type ModelServiceRouteId,
} from '../shared/protocol.js';
import { modelServiceRowsOutsideBindings } from './model-service-connections.js';
import { dirname, join } from 'node:path';
import { statSync, statfsSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { asNumber, asString, requireStore, type SqlRow } from './store-records.js';
import { isModelTextAttemptProvenance } from './material-index.js';
import { hasExactKeys, isRecord } from './analysis/canonical.js';
import {
  MODEL_SERVICE_CONNECTION_REVISION_11_SQL,
  validateManuscriptReimportSchemaTruth,
  validateSourceImportSchemaTruth,
} from './bounded-manuscript.js';
import type { BuiltInWorkflowProfile } from './native-workflow-profile.js';
import {
  EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION,
  EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
  validateEditorialWorkspaceProfileNativeSchema,
  validateEditorialWorkspaceProfileSchema,
} from './editorial-workspace-profile.js';
import { one } from './store-operation-support.js';

const CORE_SCHEMA_VERSION = 5;

const EDITOR_SCHEMA_VERSION = 6;

const RECOVERY_SCHEMA_VERSION = 7;

const SCHEMA_VERSION = 8;

const SOURCE_IMPORT_SCHEMA_VERSION = 9;

const MANUSCRIPT_REIMPORT_SCHEMA_VERSION = 10;

const MODEL_SERVICE_SCHEMA_VERSION = 11;

const SOURCE_IMPORT_SCHEMA_SQL = `CREATE TABLE source_import_records (
  source_import_record_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('new-book', 'existing-book')),
  source_version_disposition TEXT NOT NULL CHECK(source_version_disposition IN ('created', 'reused-same-book')),
  retained_boundary_json TEXT NOT NULL,
  named_non_effects_json TEXT NOT NULL,
  record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
  imported_at TEXT NOT NULL
) STRICT`;

const SOURCE_PROVENANCE_V9_SCHEMA_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT`;

/**
 * Revision 18's Source Version relations (ADR 0072 §2). A Source Version may now be an original the
 * product retained without ever parsing it, so `format` widens to what the intake router identified
 * and the three parse fields become nullable together: a Source Version carries a whole local parse
 * or none of it, never half of one.
 */
const SOURCE_VERSION_V18_SCHEMA_SQL = `CREATE TABLE source_versions (
  source_version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  content_digest TEXT CHECK(content_digest IS NULL OR length(content_digest) = 64),
  structure_digest TEXT CHECK(structure_digest IS NULL OR length(structure_digest) = 64),
  parser_identity TEXT,
  format TEXT NOT NULL CHECK(format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((content_digest IS NULL) = (structure_digest IS NULL) AND (structure_digest IS NULL) = (parser_identity IS NULL)),
  UNIQUE(book_id, source_digest)
) STRICT`;

const SOURCE_PROVENANCE_V18_SCHEMA_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT,
  recorded_at TEXT NOT NULL
) STRICT`;

/** Every draft records what its file was identified as; every row that predates revision 18 is a DOCX. */
const IMPORT_DRAFT_SOURCE_FORMAT_V18_COLUMN_SQL =
  "ALTER TABLE import_drafts ADD COLUMN source_format TEXT NOT NULL DEFAULT 'DOCX' " +
  "CHECK(source_format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'))";

/**
 * Revision 19's conversion columns, all nullable so every existing row keeps its exact identity: a
 * Source Version and its draft name the DOCX working representation the original was read through
 * and the converter that produced it, and an abandonment cleanup intent names the working object it
 * must remove beside the original (ADR 0072 §2).
 */
const SOURCE_VERSION_V19_COLUMNS_SQL = [
  'ALTER TABLE source_versions ADD COLUMN working_object_digest TEXT REFERENCES content_objects(object_digest)',
  'ALTER TABLE source_versions ADD COLUMN converter_identity TEXT',
];

const IMPORT_DRAFT_V19_COLUMNS_SQL = [
  'ALTER TABLE import_drafts ADD COLUMN working_object_digest TEXT',
  'ALTER TABLE import_drafts ADD COLUMN converter_identity TEXT',
];

const ABANDONMENT_CLEANUP_V19_COLUMN_SQL = [
  'ALTER TABLE import_abandonment_cleanup_intents ADD COLUMN working_object_digest TEXT',
];

/** The three `source_versions` guards, re-created verbatim after the table is rebuilt. */
const SOURCE_VERSION_REBUILT_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

const SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id)
) STRICT`;

const SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;

const SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;

const REIMPORT_DRAFT_V10_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only', 'reimport')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_lineage_status TEXT CHECK(reviewed_lineage_status IS NULL OR reviewed_lineage_status IN ('verified', 'unconfirmed')),
  reviewed_lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_checkpoint_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
  reviewed_manuscript_id TEXT REFERENCES manuscripts(manuscript_id),
  reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id)
) STRICT`;

const REIMPORT_COMMIT_V10_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;

const REIMPORT_ATTEMPT_V10_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;

const REIMPORT_FACT_SCHEMA_SQL = `
  CREATE TABLE manuscript_reimport_comparisons (
    comparison_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_revision_label TEXT NOT NULL,
    checkpoint_revision_digest TEXT NOT NULL CHECK(length(checkpoint_revision_digest) = 64),
    checkpoint_journal_sequence INTEGER NOT NULL CHECK(checkpoint_journal_sequence >= 0),
    checkpoint_created_for_dirty_journal INTEGER NOT NULL CHECK(checkpoint_created_for_dirty_journal IN (0, 1)),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_revision_digest TEXT CHECK(lineage_revision_digest IS NULL OR length(lineage_revision_digest) = 64),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    staged_source_digest TEXT NOT NULL CHECK(length(staged_source_digest) = 64),
    staged_content_digest TEXT NOT NULL CHECK(length(staged_content_digest) = 64),
    staged_structure_digest TEXT NOT NULL CHECK(length(staged_structure_digest) = 64),
    staged_parser_identity TEXT NOT NULL,
    staged_block_count INTEGER NOT NULL CHECK(staged_block_count > 0),
    checkpoint_block_count INTEGER NOT NULL CHECK(checkpoint_block_count > 0),
    total_mappings INTEGER NOT NULL CHECK(total_mappings > 0),
    unresolved_mappings INTEGER NOT NULL CHECK(unresolved_mappings >= 0 AND unresolved_mappings <= total_mappings),
    changed_mappings INTEGER NOT NULL CHECK(changed_mappings >= 0 AND changed_mappings <= total_mappings),
    comparison_digest TEXT NOT NULL UNIQUE CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    degradation_accepted INTEGER NOT NULL CHECK(degradation_accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL
        AND lineage_revision_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL
        AND lineage_revision_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mappings (
    mapping_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    change_kind TEXT NOT NULL CHECK(change_kind IN ('unchanged', 'move', 'edit', 'insert', 'delete')),
    current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    current_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    current_position INTEGER CHECK(current_position IS NULL OR current_position > 0),
    lineage_block_id TEXT REFERENCES manuscript_blocks(block_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_position INTEGER CHECK(lineage_position IS NULL OR lineage_position > 0),
    staged_block_id TEXT,
    staged_draft_id TEXT,
    staged_position INTEGER CHECK(staged_position IS NULL OR staged_position > 0),
    identity_consequence TEXT CHECK(identity_consequence IS NULL OR identity_consequence IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    current_kind TEXT CHECK(current_kind IS NULL OR current_kind IN ('title', 'heading', 'paragraph')),
    current_level INTEGER,
    current_text TEXT,
    current_digest TEXT CHECK(current_digest IS NULL OR length(current_digest) = 64),
    lineage_kind TEXT CHECK(lineage_kind IS NULL OR lineage_kind IN ('title', 'heading', 'paragraph')),
    lineage_level INTEGER,
    lineage_text TEXT,
    lineage_digest TEXT CHECK(lineage_digest IS NULL OR length(lineage_digest) = 64),
    staged_kind TEXT CHECK(staged_kind IS NULL OR staged_kind IN ('title', 'heading', 'paragraph')),
    staged_level INTEGER,
    staged_text TEXT,
    staged_digest TEXT CHECK(staged_digest IS NULL OR length(staged_digest) = 64),
    resolved_changed INTEGER CHECK(resolved_changed IS NULL OR resolved_changed IN (0, 1)),
    UNIQUE(comparison_id, position),
    CHECK(current_block_id IS NOT NULL OR staged_block_id IS NOT NULL),
    CHECK((current_block_id IS NULL) = (current_kind IS NULL)),
    CHECK((current_block_id IS NULL) = (current_text IS NULL)),
    CHECK((current_block_id IS NULL) = (current_digest IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_kind IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_text IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_digest IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_kind IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_text IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_digest IS NULL)),
    CHECK(
      (change_kind = 'unchanged' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position = staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'move' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position != staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'edit' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'insert' AND current_block_id IS NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'delete' AND current_block_id IS NOT NULL AND staged_block_id IS NULL
        AND identity_consequence IS NULL)
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT;
  CREATE TABLE manuscript_reimport_records (
    reimport_record_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL UNIQUE REFERENCES manuscript_reimport_comparisons(comparison_id),
    commit_id TEXT NOT NULL UNIQUE,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
    previous_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    resulting_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    result_kind TEXT NOT NULL CHECK(result_kind IN ('changed', 'no-change')),
    result_label TEXT NOT NULL CHECK(result_label IN ('稿件已重新导入', '未发现稿件变化')),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    comparison_digest TEXT NOT NULL CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
    record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
    imported_at TEXT NOT NULL,
    CHECK(
      (result_kind = 'changed' AND result_label = '稿件已重新导入' AND resulting_revision_id IS NOT NULL)
      OR (result_kind = 'no-change' AND result_label = '未发现稿件变化' AND resulting_revision_id IS NULL)
    ),
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
`;

const SOURCE_IMPORT_REBUILT_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = OLD.draft_id)
    OR EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.object_digest = NEW.object_digest)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER source_import_record_excludes_manuscript_result
  BEFORE INSERT ON source_import_records
  WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
  CREATE TRIGGER manuscript_import_record_excludes_source_result
  BEFORE INSERT ON manuscript_import_records
  WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
`;

export function configureDatabase(db: DatabaseSync, tempStore: 'MEMORY' | 'FILE' = 'MEMORY'): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA recursive_triggers = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA wal_autocheckpoint = 0;
    PRAGMA busy_timeout = 5000;
    PRAGMA trusted_schema = OFF;
    PRAGMA secure_delete = ON;
    PRAGMA temp_store = ${tempStore};
  `);
  const recursiveTriggers = db.prepare('PRAGMA recursive_triggers').get() as SqlRow;
  requireStore(
    asNumber(recursiveTriggers.recursive_triggers) === 1,
    'SCHEMA_INVALID',
    'SQLite 递归触发器未启用，无法保护不可变记录。',
  );
}

export const WAL_CHECKPOINT_LIMITS = { softBytes: 256 * 1024 * 1024, emergencyBytes: 16 * 1024 * 1024 * 1024 };

/** Connection configuration disables automatic checkpoints; the store runs this only after responses, outside edit commits. */
export function recordCheckpointSkip(error: unknown, source: string): void {
  const code = typeof error === 'object' && error !== null && 'errcode' in error ? Number(error.errcode) : 0;
  process.stderr.write('AI7_CHECKPOINT_SKIPPED/' + JSON.stringify({ source, sqliteCode: Number.isFinite(code) ? code : 0 }) + '\n');
}

export class WalCheckpointPolicy {
  readonly #pageBytes: number;
  #lastFrames = 0;
  #reclaim = false;

  constructor(
    readonly db: DatabaseSync,
    readonly path: string,
    readonly limits = WAL_CHECKPOINT_LIMITS,
  ) {
    this.#pageBytes = asNumber((db.prepare('PRAGMA page_size').get() as SqlRow).page_size) + 24;
  }

  frames(): number {
    const row = this.db.prepare('PRAGMA wal_checkpoint(NOOP)').get() as SqlRow;
    const frames = asNumber(row.log);
    // A concurrent checkpoint can return -1 (busy); that is not a WAL reset or a new write.
    if (frames >= 0) this.#lastFrames = frames;
    return this.#lastFrames;
  }

  fileBytes(): number {
    try { return statSync(`${this.path}-wal`).size; }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  needsMaintenance(): boolean { return this.frames() * this.#pageBytes >= this.limits.softBytes; }

  /** Refuse before BEGIN; the renderer retains and retries the exact command through its existing protection path. */
  admitJournalWrite(): void {
    let freeBytes = -1;
    try { const space = statfsSync(dirname(this.path)); freeBytes = space.bavail * space.bsize; }
    catch { process.stderr.write('AI7_WAL_SPACE_UNAVAILABLE\n'); }
    requireStore(freeBytes < 0 || freeBytes >= 64 * 1024 * 1024, 'JOURNAL_DISK_FULL', '磁盘已满，请腾出空间后再保存。');
    // 30 bursts can append 11.84 GB before checkpointing catches up. Normal backlog is not a write refusal.
    const ceiling = freeBytes < 0 ? this.limits.emergencyBytes : Math.min(this.limits.emergencyBytes, Math.floor(freeBytes / 4));
    const walBytes = this.fileBytes();
    if (walBytes >= ceiling) { this.#reclaim = true; this.#recordEmergency(walBytes, ceiling, freeBytes); }
    requireStore(walBytes < ceiling, 'JOURNAL_CHECKPOINT_BUSY', '本机存储空间暂时不足，请稍候重试保存。');
  }

  #recordEmergency(walBytes: number, ceilingBytes: number, freeBytes: number): void {
    const record = JSON.stringify({ flag: 'JOURNAL_CHECKPOINT_BUSY', timestamp: Date.now(), walBytes, ceilingBytes, freeBytes });
    // One bounded numeric observation, not a manuscript or service log; never affects admission or recovery.
    const target = join(dirname(this.path), 'wal-checkpoint-pressure.json');
    const staged = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(staged, record, { flag: 'wx', mode: 0o600 });
      renameSync(staged, target);
    } catch { process.stderr.write('AI7_WAL_DIAGNOSTIC_WRITE_FAILED\n'); }
    finally { try { rmSync(staged, { force: true }); } catch { /* Diagnostics must not mask the original refusal. */ } }
    process.stderr.write('AI7_WAL_EMERGENCY/' + record + '\n');
  }

  maintain(idle: boolean, force = false): { busy: boolean; beforeBytes: number; afterBytes: number } | null {
    try {
      if (!force && !idle && !this.#reclaim && !this.needsMaintenance()) return null;
      const beforeBytes = this.fileBytes();
      const timeout = asNumber((this.db.prepare('PRAGMA busy_timeout').get() as SqlRow).timeout);
      this.db.exec('PRAGMA busy_timeout = 0');
      try {
        // Backfill without a writer lock first. Only an entirely backfilled, idle WAL may be truncated.
        const passive = this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get() as SqlRow;
        let busy = asNumber(passive.busy) !== 0 || asNumber(passive.log) > asNumber(passive.checkpointed);
        if (idle && !busy) {
          const latest = this.db.prepare('PRAGMA wal_checkpoint(NOOP)').get() as SqlRow;
          if (asNumber(latest.log) === asNumber(latest.checkpointed)) {
            const trimmed = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as SqlRow;
            busy = asNumber(trimmed.busy) !== 0;
          }
        }
        const afterBytes = this.fileBytes();
        if (afterBytes === 0) this.#reclaim = false;
        return { busy, beforeBytes, afterBytes };
      } finally { this.db.exec(`PRAGMA busy_timeout = ${timeout}`); }
    } catch (error) {
      recordCheckpointSkip(error, 'fallback');
      return null;
    }
  }

  shutdown(): void {
    // Busy readers/unfinished statements leave FULL-durable WAL for the next open.
    this.maintain(true, true);
  }
}

const ABANDONMENT_CLEANUP_SCHEMA = `
  CREATE TABLE import_abandonment_cleanup_intents (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id),
    object_digest TEXT NOT NULL UNIQUE REFERENCES content_objects(object_digest),
    expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
    relative_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared', 'bytes-removed')),
    requested_at TEXT NOT NULL,
    bytes_removed_at TEXT,
    CHECK(
      (state = 'prepared' AND bytes_removed_at IS NULL)
      OR (state = 'bytes-removed' AND bytes_removed_at IS NOT NULL)
    )
  ) STRICT;

  CREATE TRIGGER abandonment_cleanup_validate_insert
  BEFORE INSERT ON import_abandonment_cleanup_intents
  WHEN NOT EXISTS (
      SELECT 1
      FROM import_drafts d
      JOIN content_objects co ON co.object_digest = d.object_digest
      WHERE d.draft_id = NEW.draft_id
        AND d.state IN ('staged', 'reviewed')
        AND d.draft_version = NEW.expected_draft_version
        AND d.object_digest = NEW.object_digest
        AND co.relative_key = NEW.relative_key
    )
    OR EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = NEW.object_digest)
    OR (SELECT count(*) FROM import_drafts d WHERE d.object_digest = NEW.object_digest) != 1
    OR EXISTS (SELECT 1 FROM import_commits c WHERE c.draft_id = NEW.draft_id)
    OR EXISTS (
      SELECT 1 FROM import_commit_attempts a
      WHERE a.draft_id = NEW.draft_id AND a.state != 'prepared'
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INVALID');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.draft_id = OLD.draft_id
    )
    OR EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.object_digest = NEW.object_digest
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

const ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA = `
  CREATE TRIGGER abandonment_cleanup_validate_intent_update_v5
  BEFORE UPDATE ON import_abandonment_cleanup_intents
  WHEN NEW.draft_id != OLD.draft_id
    OR NEW.object_digest != OLD.object_digest
    OR NEW.expected_draft_version != OLD.expected_draft_version
    OR NEW.relative_key != OLD.relative_key
    OR NEW.requested_at != OLD.requested_at
    OR NOT (
      (
        OLD.state = 'prepared' AND OLD.bytes_removed_at IS NULL
        AND NEW.state = 'bytes-removed' AND NEW.bytes_removed_at IS NOT NULL
      )
      OR (
        OLD.state = 'bytes-removed' AND NEW.state = 'bytes-removed'
        AND NEW.bytes_removed_at = OLD.bytes_removed_at
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INTENT_IMMUTABLE');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update_v5
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

function migrateSchemaV1ToV2(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  let migrationError: unknown;
  try {
    const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
    requireStore(asNumber(foreignKeys.foreign_keys) === 0, 'SCHEMA_INVALID', '无法暂时停用引用校验以迁移数据库。');
    db.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE import_fidelity_reviews_v2 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO import_fidelity_reviews_v2(
        fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      )
      SELECT fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      FROM import_fidelity_reviews;

      CREATE TABLE manuscript_import_records_v2 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews_v2(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO manuscript_import_records_v2(
        import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
        degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      )
      SELECT import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
             degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      FROM manuscript_import_records;

      DROP TABLE manuscript_import_records;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v2 RENAME TO import_fidelity_reviews;
      ALTER TABLE manuscript_import_records_v2 RENAME TO manuscript_import_records;
      PRAGMA user_version = 2;
    `);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    db.exec('COMMIT');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON');
      const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
      requireStore(asNumber(foreignKeys.foreign_keys) === 1, 'SCHEMA_INVALID', '无法恢复引用校验。');
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite schema migration and foreign-key restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
}

function migrateSchemaV2ToV3(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE import_drafts ADD COLUMN selected_path TEXT;
      ALTER TABLE import_drafts ADD COLUMN reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work'));

      CREATE TABLE import_commit_attempts (
        attempt_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
        request_fingerprint TEXT NOT NULL,
        expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
        review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
        state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
        prepared_at TEXT NOT NULL,
        committed_at TEXT,
        uncertain_at TEXT,
        uncertainty_code TEXT,
        completion_acknowledged_at TEXT,
        CHECK(
          (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
          OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
            AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
          OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL)
        )
      ) STRICT;

      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        state, prepared_at, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'committed', committed_at, committed_at
      FROM import_commits;

      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

      PRAGMA user_version = 3;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v3 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV3ToV4(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_SCHEMA}
      PRAGMA user_version = 4;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v4 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV4ToV5(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}
      PRAGMA user_version = 5;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v5 migration rollback failed.');
    }
    throw error;
  }
}

export function initializeSchema(db: DatabaseSync): void {
  const versionRow = one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。');
  const currentVersion = asNumber(versionRow.user_version);
  requireStore(
    currentVersion === 0 ||
      currentVersion === 1 ||
      currentVersion === 2 ||
      currentVersion === 3 ||
      currentVersion === 4 ||
      currentVersion === CORE_SCHEMA_VERSION ||
      currentVersion === EDITOR_SCHEMA_VERSION ||
      currentVersion === RECOVERY_SCHEMA_VERSION ||
      currentVersion === SCHEMA_VERSION ||
      currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION ||
      currentVersion === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      currentVersion === J04_BASELINE_ANALYSIS_SCHEMA_VERSION ||
      currentVersion === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      currentVersion === TASK_AUTHORIZATION_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      currentVersion === TEXT_CONVERSION_SCHEMA_VERSION ||
      currentVersion === FACTUAL_REVIEW_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_MARK_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      currentVersion === PUBLICATION_VERSION_SCHEMA_VERSION || currentVersion === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      currentVersion === IMPORT_RETENTION_SCHEMA_VERSION || currentVersion === IMPORTED_MARK_SCHEMA_VERSION ||
      currentVersion === EXPORT_LEDGER_SCHEMA_VERSION || currentVersion === CONNECTIVITY_WAIT_SCHEMA_VERSION || currentVersion === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      currentVersion === RUN_CANCELLATION_SCHEMA_VERSION ||
      currentVersion === RUN_CONTINUATION_SCHEMA_VERSION ||
      currentVersion === PLAN_EDIT_SCHEMA_VERSION ||
      currentVersion === CLARIFICATION_SCHEMA_VERSION ||
      currentVersion === REIMPORT_GROUP_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      currentVersion === MAINTENANCE_CASE_SCHEMA_VERSION ||
      currentVersion === BOOK_PEOPLE_SCHEMA_VERSION ||
      currentVersion === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      currentVersion === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      currentVersion === EVALUATION_RECORD_SCHEMA_VERSION ||
      currentVersion === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === DECISION_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      currentVersion === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      currentVersion === SERIES_SCHEMA_VERSION ||
      currentVersion === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      currentVersion === STORE_VERSION_SCHEMA_VERSION ||
      currentVersion === DATABASE_EXPORT_SCHEMA_VERSION ||
      currentVersion === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      currentVersion === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      currentVersion === DATABASE_MERGE_SCHEMA_VERSION ||
      currentVersion === INITIAL_EVALUATION_SCHEMA_VERSION ||
      currentVersion === DIALOGUE_SCHEMA_VERSION ||
      currentVersion === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      currentVersion === READERS_REPORT_SCHEMA_VERSION ||
      currentVersion === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      currentVersion === EVALUATION_REWRITE_SCHEMA_VERSION ||
      currentVersion === WRITING_TASK_SCHEMA_VERSION ||
      currentVersion === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      currentVersion === MATERIAL_INDEX_SCHEMA_VERSION ||
      (currentVersion === OUTCOME_RESOLUTION_SCHEMA_VERSION || currentVersion === IMPORTED_EXEMPLAR_SCHEMA_VERSION || currentVersion === EVALUATION_PROFILE_SCHEMA_VERSION || currentVersion === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || currentVersion === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || currentVersion === MODEL_CLARIFICATION_SCHEMA_VERSION || currentVersion === SEARCH_BACKEND_SCHEMA_VERSION || currentVersion === RESEARCH_EVIDENCE_SCHEMA_VERSION || currentVersion === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || currentVersion === PROPOSAL_REVIEW_SCHEMA_VERSION || currentVersion === FACTUAL_VERIFICATION_SCHEMA_VERSION || currentVersion === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || currentVersion === TASK_INTENT_DRAFT_SCHEMA_VERSION || currentVersion === IMPORTED_SKILL_SCHEMA_VERSION || currentVersion === CUSTOM_ANALYSIS_SCHEMA_VERSION || currentVersion === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || currentVersion === MODEL_SELECTION_SCHEMA_VERSION || currentVersion === PROCEDURE_DEFINITION_SCHEMA_VERSION || currentVersion === EDITORIAL_LEARNING_SCHEMA_VERSION || currentVersion === GLOBAL_AGENT_SCHEMA_VERSION || currentVersion === REVIEW_CONTRACT_SCHEMA_VERSION || currentVersion === IDLE_BACKGROUND_SCHEMA_VERSION || currentVersion === LOCAL_REVIEW_SCHEMA_VERSION || currentVersion === EDITORIAL_MEMORY_SCHEMA_VERSION || currentVersion === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || currentVersion === WORD_TRACKED_IMPORT_SCHEMA_VERSION || currentVersion === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || currentVersion === LEARNING_CURATION_SCHEMA_VERSION || currentVersion === 97 || currentVersion === 98 || currentVersion === 99 || currentVersion === 100 || currentVersion === 101 || currentVersion === 102 || currentVersion === 103 || currentVersion === 104 || currentVersion === 105 || currentVersion === 106 || currentVersion === 107 || currentVersion === 108 || currentVersion === 109 || currentVersion === 110 || currentVersion === 111 || currentVersion === 112 || currentVersion === LATEST_SCHEMA_VERSION),
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (
    currentVersion === CORE_SCHEMA_VERSION ||
    currentVersion === EDITOR_SCHEMA_VERSION ||
    currentVersion === RECOVERY_SCHEMA_VERSION ||
    currentVersion === SCHEMA_VERSION ||
    currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
    currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION ||
    currentVersion === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
    currentVersion === J04_BASELINE_ANALYSIS_SCHEMA_VERSION ||
    currentVersion === SUCCESSIVE_TASK_SCHEMA_VERSION ||
    currentVersion === TASK_AUTHORIZATION_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
    currentVersion === TEXT_CONVERSION_SCHEMA_VERSION ||
    currentVersion === FACTUAL_REVIEW_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_MARK_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_REVIEW_SCHEMA_VERSION ||
    currentVersion === PUBLICATION_VERSION_SCHEMA_VERSION || currentVersion === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      currentVersion === IMPORT_RETENTION_SCHEMA_VERSION || currentVersion === IMPORTED_MARK_SCHEMA_VERSION ||
      currentVersion === EXPORT_LEDGER_SCHEMA_VERSION || currentVersion === CONNECTIVITY_WAIT_SCHEMA_VERSION || currentVersion === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      currentVersion === RUN_CANCELLATION_SCHEMA_VERSION ||
      currentVersion === RUN_CONTINUATION_SCHEMA_VERSION ||
      currentVersion === PLAN_EDIT_SCHEMA_VERSION ||
      currentVersion === CLARIFICATION_SCHEMA_VERSION ||
      currentVersion === REIMPORT_GROUP_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      currentVersion === MAINTENANCE_CASE_SCHEMA_VERSION ||
      currentVersion === BOOK_PEOPLE_SCHEMA_VERSION ||
      currentVersion === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      currentVersion === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      currentVersion === EVALUATION_RECORD_SCHEMA_VERSION ||
      currentVersion === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === DECISION_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      currentVersion === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      currentVersion === SERIES_SCHEMA_VERSION ||
      currentVersion === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      currentVersion === STORE_VERSION_SCHEMA_VERSION ||
      currentVersion === DATABASE_EXPORT_SCHEMA_VERSION ||
      currentVersion === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      currentVersion === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      currentVersion === DATABASE_MERGE_SCHEMA_VERSION ||
      currentVersion === INITIAL_EVALUATION_SCHEMA_VERSION ||
      currentVersion === DIALOGUE_SCHEMA_VERSION ||
      currentVersion === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      currentVersion === READERS_REPORT_SCHEMA_VERSION ||
      currentVersion === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      currentVersion === EVALUATION_REWRITE_SCHEMA_VERSION ||
      currentVersion === WRITING_TASK_SCHEMA_VERSION ||
      currentVersion === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      currentVersion === MATERIAL_INDEX_SCHEMA_VERSION ||
      (currentVersion === OUTCOME_RESOLUTION_SCHEMA_VERSION || currentVersion === IMPORTED_EXEMPLAR_SCHEMA_VERSION || currentVersion === EVALUATION_PROFILE_SCHEMA_VERSION || currentVersion === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || currentVersion === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || currentVersion === MODEL_CLARIFICATION_SCHEMA_VERSION || currentVersion === SEARCH_BACKEND_SCHEMA_VERSION || currentVersion === RESEARCH_EVIDENCE_SCHEMA_VERSION || currentVersion === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || currentVersion === PROPOSAL_REVIEW_SCHEMA_VERSION || currentVersion === FACTUAL_VERIFICATION_SCHEMA_VERSION || currentVersion === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || currentVersion === TASK_INTENT_DRAFT_SCHEMA_VERSION || currentVersion === IMPORTED_SKILL_SCHEMA_VERSION || currentVersion === CUSTOM_ANALYSIS_SCHEMA_VERSION || currentVersion === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || currentVersion === MODEL_SELECTION_SCHEMA_VERSION || currentVersion === PROCEDURE_DEFINITION_SCHEMA_VERSION || currentVersion === EDITORIAL_LEARNING_SCHEMA_VERSION || currentVersion === GLOBAL_AGENT_SCHEMA_VERSION || currentVersion === REVIEW_CONTRACT_SCHEMA_VERSION || currentVersion === IDLE_BACKGROUND_SCHEMA_VERSION || currentVersion === LOCAL_REVIEW_SCHEMA_VERSION || currentVersion === EDITORIAL_MEMORY_SCHEMA_VERSION || currentVersion === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || currentVersion === WORD_TRACKED_IMPORT_SCHEMA_VERSION || currentVersion === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || currentVersion === LEARNING_CURATION_SCHEMA_VERSION || currentVersion === 97 || currentVersion === 98 || currentVersion === 99 || currentVersion === 100 || currentVersion === 101 || currentVersion === 102 || currentVersion === 103 || currentVersion === 104 || currentVersion === 105 || currentVersion === 106 || currentVersion === 107 || currentVersion === 108 || currentVersion === 109 || currentVersion === 110 || currentVersion === 111 || currentVersion === 112 || currentVersion === LATEST_SCHEMA_VERSION)
  ) return;
  if (currentVersion === 1) {
    migrateSchemaV1ToV2(db);
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 2) {
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 3) {
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 4) {
    migrateSchemaV4ToV5(db);
    return;
  }

  db.exec(`
    BEGIN IMMEDIATE;

    CREATE TABLE content_objects (
      object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
      relative_key TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL CHECK(byte_length > 0),
      verified_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_drafts (
      draft_id TEXT PRIMARY KEY,
      selection_token TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
      draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
      display_name TEXT NOT NULL,
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      selected_path TEXT,
      reviewed_title TEXT,
      reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
      review_digest TEXT UNIQUE,
      committed_commit_id TEXT UNIQUE,
      staged_at TEXT NOT NULL,
      reviewed_at TEXT,
      committed_at TEXT
    ) STRICT;

    CREATE TABLE staged_import_snapshots (
      draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      parser_identity TEXT NOT NULL,
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      block_count INTEGER NOT NULL CHECK(block_count > 0),
      fidelity_json TEXT NOT NULL,
      title_suggestion TEXT NOT NULL,
      title_source TEXT NOT NULL,
      snapshot_created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE staged_import_blocks (
      draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
      staged_block_id TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(draft_id, position),
      UNIQUE(draft_id, staged_block_id)
    ) STRICT;

    CREATE TABLE books (
      book_id TEXT PRIMARY KEY,
      stable_identity TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimension_sets (
      dimension_set_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      version INTEGER NOT NULL CHECK(version = 1),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
      weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimensions (
      dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
      dimension_id TEXT NOT NULL,
      display_label TEXT NOT NULL,
      weight REAL NOT NULL CHECK(weight > 0),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(dimension_set_id, dimension_id),
      UNIQUE(dimension_set_id, position)
    ) STRICT;

    CREATE TABLE source_versions (
      source_version_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      parser_identity TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format = 'DOCX'),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(book_id, source_digest)
    ) STRICT;

    CREATE TABLE source_provenance (
      provenance_id TEXT PRIMARY KEY,
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
      locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
      sanitized_identity TEXT NOT NULL,
      parser_identity TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_reviews (
      fidelity_review_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      review_digest TEXT NOT NULL UNIQUE,
      outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
      round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_categories (
      fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
      category_key TEXT NOT NULL,
      display_label TEXT NOT NULL,
      item_count INTEGER NOT NULL CHECK(item_count >= 0),
      status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
      detail TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(fidelity_review_id, category_key),
      UNIQUE(fidelity_review_id, position)
    ) STRICT;

    CREATE TABLE import_degradation_decisions (
      degradation_decision_id TEXT PRIMARY KEY,
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      decision TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscripts (
      manuscript_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      role TEXT NOT NULL CHECK(role = 'primary'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscript_branches (
      branch_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      name TEXT NOT NULL,
      base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, name)
    ) STRICT;

    CREATE TABLE manuscript_revisions (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal = 1),
      revision_label TEXT NOT NULL CHECK(revision_label = 'r1'),
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT;

    CREATE TABLE manuscript_blocks (
      block_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
    ) STRICT;

    CREATE TABLE manuscript_block_versions (
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(revision_id, block_id),
      UNIQUE(revision_id, position)
    ) STRICT;

    CREATE TABLE workflow_profiles (
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
      definition_json TEXT NOT NULL,
      PRIMARY KEY(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE workflow_instances (
      workflow_instance_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      current_phase TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state = 'active'),
      created_at TEXT NOT NULL,
      FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE manuscript_import_records (
      import_record_id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL UNIQUE,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
      resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
      provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
      imported_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commits (
      commit_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL,
      review_digest TEXT NOT NULL,
      result_json TEXT NOT NULL,
      committed_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commit_attempts (
      attempt_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
      review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
      state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
      prepared_at TEXT NOT NULL,
      committed_at TEXT,
      uncertain_at TEXT,
      uncertainty_code TEXT,
      completion_acknowledged_at TEXT,
      CHECK(
        (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
        OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
          AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
        OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL)
      )
    ) STRICT;

    CREATE TABLE branch_working_state (
      branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
      working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
    ) STRICT;

    CREATE TABLE working_blocks (
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(branch_id, block_id),
      UNIQUE(branch_id, position)
    ) STRICT;

    CREATE TABLE edit_journal_entries (
      journal_entry_id TEXT PRIMARY KEY,
      client_edit_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      sequence INTEGER NOT NULL CHECK(sequence > 0),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
      to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
      insert_text TEXT NOT NULL,
      resulting_block_digest TEXT NOT NULL CHECK(length(resulting_block_digest) = 64),
      resulting_working_digest TEXT NOT NULL CHECK(length(resulting_working_digest) = 64),
      durable_at TEXT NOT NULL,
      UNIQUE(branch_id, sequence)
    ) STRICT;

    ${ABANDONMENT_CLEANUP_SCHEMA}
    ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}

    CREATE INDEX working_blocks_window ON working_blocks(branch_id, position);
    CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence);
    CREATE INDEX import_attempts_recovery_order
      ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

    PRAGMA user_version = 5;
    COMMIT;
  `);
}

export function initializeSourceImportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SCHEMA_VERSION || version === SOURCE_IMPORT_SCHEMA_VERSION ||
      version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION),
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION)) return;
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v8;
      ALTER TABLE import_commits RENAME TO import_commits_v8;
      ALTER TABLE import_drafts RENAME TO import_drafts_v8;
      ALTER TABLE source_provenance RENAME TO source_provenance_v8;
      ${SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, NULL
      FROM import_drafts_v8 ORDER BY draft_id;
      ${SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', result_json, committed_at
      FROM import_commits_v8 ORDER BY commit_id;
      ${SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v8 ORDER BY attempt_id;
      ${SOURCE_PROVENANCE_V9_SCHEMA_SQL};
      INSERT INTO source_provenance(
        provenance_id, source_version_id, acquisition_path, locality,
        sanitized_identity, parser_identity, recorded_at
      )
      SELECT provenance_id, source_version_id, acquisition_path, locality,
             sanitized_identity, parser_identity, recorded_at
      FROM source_provenance_v8
      ORDER BY provenance_id;
      DROP TABLE import_commit_attempts_v8;
      DROP TABLE import_commits_v8;
      DROP TABLE import_drafts_v8;
      DROP TABLE source_provenance_v8;
      ${SOURCE_IMPORT_SCHEMA_SQL};
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
    `);
    validateSourceImportSchemaTruth(db, profile);
    db.exec(`PRAGMA user_version = ${SOURCE_IMPORT_SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite source import schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite source import migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

export function initializeManuscriptReimportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION),
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION)) return;
  validateSourceImportSchemaTruth(db, profile);
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      DROP TRIGGER source_import_record_excludes_manuscript_result;
      DROP TRIGGER manuscript_import_record_excludes_source_result;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v9;
      ALTER TABLE import_commits RENAME TO import_commits_v9;
      ALTER TABLE import_drafts RENAME TO import_drafts_v9;
      ${REIMPORT_DRAFT_V10_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
        reviewed_lineage_status, reviewed_lineage_source_version_id, reviewed_checkpoint_revision_id,
        reviewed_manuscript_id, reviewed_branch_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
             NULL, NULL, NULL, NULL, NULL
      FROM import_drafts_v9 ORDER BY draft_id;
      ${REIMPORT_COMMIT_V10_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, result_json, committed_at
      FROM import_commits_v9 ORDER BY commit_id;
      ${REIMPORT_ATTEMPT_V10_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v9 ORDER BY attempt_id;
      DROP TABLE import_commit_attempts_v9;
      DROP TABLE import_commits_v9;
      DROP TABLE import_drafts_v9;
      CREATE TABLE import_fidelity_reviews_v10 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE import_fidelity_categories_v10 (
        fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
        category_key TEXT NOT NULL,
        display_label TEXT NOT NULL,
        item_count INTEGER NOT NULL CHECK(item_count >= 0),
        status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
        detail TEXT NOT NULL,
        position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
        PRIMARY KEY(fidelity_review_id, category_key),
        UNIQUE(fidelity_review_id, position)
      ) STRICT;
      CREATE TABLE import_degradation_decisions_v10 (
        degradation_decision_id TEXT PRIMARY KEY,
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE manuscript_import_records_v10 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO import_fidelity_reviews_v10 SELECT * FROM import_fidelity_reviews ORDER BY fidelity_review_id;
      INSERT INTO import_fidelity_categories_v10 SELECT * FROM import_fidelity_categories
        ORDER BY fidelity_review_id, position;
      INSERT INTO import_degradation_decisions_v10 SELECT * FROM import_degradation_decisions
        ORDER BY degradation_decision_id;
      INSERT INTO manuscript_import_records_v10 SELECT * FROM manuscript_import_records ORDER BY import_record_id;
      DROP TABLE manuscript_import_records;
      DROP TABLE import_degradation_decisions;
      DROP TABLE import_fidelity_categories;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v10 RENAME TO import_fidelity_reviews;
      ALTER TABLE import_fidelity_categories_v10 RENAME TO import_fidelity_categories;
      ALTER TABLE import_degradation_decisions_v10 RENAME TO import_degradation_decisions;
      ALTER TABLE manuscript_import_records_v10 RENAME TO manuscript_import_records;
      ${REIMPORT_FACT_SCHEMA_SQL}
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      CREATE INDEX reimport_mappings_page
        ON manuscript_reimport_mappings(comparison_id, position);
      CREATE INDEX staged_reimport_identity
        ON staged_import_blocks(draft_id, digest, kind, level);
      CREATE INDEX revision_reimport_identity
        ON manuscript_block_versions(revision_id, digest, kind, level);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
      CREATE TRIGGER reimport_record_excludes_other_results
      BEFORE INSERT ON manuscript_reimport_records
      WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
        OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER manuscript_import_record_excludes_reimport_result
      BEFORE INSERT ON manuscript_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER source_import_record_excludes_reimport_result
      BEFORE INSERT ON source_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      PRAGMA user_version = ${MANUSCRIPT_REIMPORT_SCHEMA_VERSION};
    `);
    validateManuscriptReimportSchemaTruth(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite manuscript reimport migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite manuscript reimport migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

/** Whether a relation already carries the revision-18 shape, which decides the rebuild below. */
function columnIsNullable(db: DatabaseSync, table: string, column: string): boolean {
  const rows = (db.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[])
    .filter((row) => asString(row.name) === column);
  requireStore(rows.length === 1, 'SCHEMA_INVALID', '无法读取来源版本结构。');
  return asNumber(rows[0]!.notnull) === 0;
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[])
    .some((row) => asString(row.name) === column);
}

/**
 * Revision 18's intake relations. `source_versions` and `source_provenance` are rebuilt so that a
 * retained original with no parse can be recorded (ADR 0072 §2), with every existing row copied
 * forward byte for byte — every one of them is a DOCX the product did parse, so none loses a digest
 * — and the three `source_versions` guards re-created verbatim. `import_drafts` gains the format its
 * file was identified as, defaulted so every row that predates this revision reads `DOCX`.
 *
 * The version itself moves in `task-authorization.ts`, where the terminal revision is declared. This
 * runs first and is shape-detected, so a store created fresh at revision 18 does no work here and an
 * interruption between the rebuild and the version bump simply repeats the bump on the next open.
 */
export function initializeManuscriptIntakeSchema(db: DatabaseSync): void {
  const rebuildRelations = !columnIsNullable(db, 'source_versions', 'content_digest');
  const addDraftFormat = !columnExists(db, 'import_drafts', 'source_format');
  if (!rebuildRelations && !addDraftFormat) return;
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec('BEGIN IMMEDIATE;');
    if (rebuildRelations) {
      db.exec(`
        DROP TRIGGER abandonment_cleanup_block_source_insert;
        DROP TRIGGER abandonment_cleanup_block_source_update;
        DROP TRIGGER abandonment_cleanup_block_source_update_v5;
        ALTER TABLE source_versions RENAME TO source_versions_v17;
        ALTER TABLE source_provenance RENAME TO source_provenance_v17;
        ${SOURCE_VERSION_V18_SCHEMA_SQL};
        INSERT INTO source_versions(
          source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
          parser_identity, format, display_name, created_at
        )
        SELECT source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
               parser_identity, format, display_name, created_at
        FROM source_versions_v17 ORDER BY rowid;
        ${SOURCE_PROVENANCE_V18_SCHEMA_SQL};
        INSERT INTO source_provenance(
          provenance_id, source_version_id, acquisition_path, locality,
          sanitized_identity, parser_identity, recorded_at
        )
        SELECT provenance_id, source_version_id, acquisition_path, locality,
               sanitized_identity, parser_identity, recorded_at
        FROM source_provenance_v17 ORDER BY rowid;
        DROP TABLE source_versions_v17;
        DROP TABLE source_provenance_v17;
        ${SOURCE_VERSION_REBUILT_TRIGGER_SQL}
      `);
    }
    if (addDraftFormat) db.exec(`${IMPORT_DRAFT_SOURCE_FORMAT_V18_COLUMN_SQL};`);
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite manuscript intake schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite manuscript intake migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

/**
 * Revision 19's conversion columns (ADR 0072 §2). Every one is added by `ALTER TABLE ADD COLUMN`
 * with a null default, so no relation is rebuilt, no row is copied, and no digest of record moves;
 * a store that predates the revision simply gains five empty columns.
 *
 * `ALTER` cannot add a table `CHECK`, so the invariant those columns carry — both null or both set,
 * and set only where the format is one the product converts — is enforced in this module's writes
 * and in its read-side validation instead. Like revision 18 this runs before the version moves in
 * `task-authorization.ts` and is shape-detected, so an interruption between the two repeats only
 * the version bump on the next open.
 */
export function initializeTextConversionSchema(db: DatabaseSync): void {
  const statements = [
    ...(columnExists(db, 'source_versions', 'working_object_digest') ? [] : SOURCE_VERSION_V19_COLUMNS_SQL),
    ...(columnExists(db, 'import_drafts', 'working_object_digest') ? [] : IMPORT_DRAFT_V19_COLUMNS_SQL),
    ...(columnExists(db, 'import_abandonment_cleanup_intents', 'working_object_digest')
      ? []
      : ABANDONMENT_CLEANUP_V19_COLUMN_SQL),
  ];
  if (statements.length === 0) return;
  try {
    db.exec(`BEGIN IMMEDIATE;
      ${statements.join(';\n      ')};
      COMMIT;`);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite text conversion schema migration rollback failed.');
    }
    throw error;
  }
  requireStore(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function validateModelServiceSchema(
  db: DatabaseSync,
  profile: BuiltInWorkflowProfile,
  validateStoreTruth = true,
): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  if (validateStoreTruth || version !== LATEST_SCHEMA_VERSION) {
    validateManuscriptReimportSchemaTruth(
      db,
      profile,
      true,
      version >= EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION,
      version >= EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
      version >= J03_TASK_AUTHORIZATION_SCHEMA_VERSION,
      version >= J04_BASELINE_ANALYSIS_SCHEMA_VERSION,
      version >= TASK_AUTHORIZATION_SCHEMA_VERSION,
      version >= MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
      version >= EDITORIAL_MARK_SCHEMA_VERSION,
      version >= MANUSCRIPT_EFFECT_SCHEMA_VERSION,
      version >= EDITORIAL_REVIEW_SCHEMA_VERSION,
      version >= PUBLICATION_VERSION_SCHEMA_VERSION,
      version >= PROPOSAL_CONFLICT_SCHEMA_VERSION,
      version >= IMPORT_RETENTION_SCHEMA_VERSION,
      version >= IMPORTED_MARK_SCHEMA_VERSION,
      version >= EXPORT_LEDGER_SCHEMA_VERSION,
      version >= DEFAULT_EXECUTION_RULE_SCHEMA_VERSION,
      version >= RUN_CONTINUATION_SCHEMA_VERSION,
      version >= CLARIFICATION_SCHEMA_VERSION,
      version >= REIMPORT_GROUP_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION,
      version >= BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION,
      version >= BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION,
      version >= MAINTENANCE_CASE_SCHEMA_VERSION,
      version >= BOOK_PEOPLE_SCHEMA_VERSION,
      version >= REVIEW_GUIDELINE_SCHEMA_VERSION,
      version >= LIBRARY_MATERIAL_SCHEMA_VERSION,
      version >= EVALUATION_RECORD_SCHEMA_VERSION,
      version >= ANALYSIS_FEEDBACK_SCHEMA_VERSION,
      version >= DECISION_FEEDBACK_SCHEMA_VERSION,
      version >= LEARNING_ELIGIBILITY_SCHEMA_VERSION,
      version >= EVALUATION_CALIBRATION_SCHEMA_VERSION,
      version >= SERIES_SCHEMA_VERSION,
      version >= SERIES_KNOWLEDGE_SCHEMA_VERSION,
      version >= STORE_VERSION_SCHEMA_VERSION,
      version >= DATABASE_EXPORT_SCHEMA_VERSION,
      version >= SCHEDULED_BACKUP_SCHEMA_VERSION,
      version >= DATABASE_REPLACEMENT_SCHEMA_VERSION,
      version >= DATABASE_MERGE_SCHEMA_VERSION,
      version >= INITIAL_EVALUATION_SCHEMA_VERSION,
      version >= DIALOGUE_SCHEMA_VERSION,
      version >= SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION,
      version >= READERS_REPORT_SCHEMA_VERSION,
      version >= CAPTURED_PROCEDURE_SCHEMA_VERSION,
      version >= EVALUATION_REWRITE_SCHEMA_VERSION,
      version >= WRITING_TASK_SCHEMA_VERSION,
      version >= BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION,
      version >= MATERIAL_INDEX_SCHEMA_VERSION,
      version >= OUTCOME_RESOLUTION_SCHEMA_VERSION,
    );
  }
    requireStore(!modelServiceRowsOutsideBindings(db), 'SCHEMA_INVALID', '模型服务连接记录超出当前固定绑定。');
  for (const row of db.prepare('SELECT * FROM model_service_connections').iterate()) readModelConnectionTest(row);
}

/** Revision 74 (Issue #473): one connection row per shipped search backend, the registry's top rank selected; an existing table is checked, never rebuilt. */
export function initializeSearchBackendSchema(db: DatabaseSync): void {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'search_backend_connections'").get() as SqlRow | undefined;
  const fold = canonicalSchemaSql;
  if (row !== undefined) {
    if (fold(asString(row.sql)) === fold(LEGACY_SEARCH_BACKEND_CONNECTIONS_SQL)) {
      requireStore(Number(db.prepare('PRAGMA user_version').get()?.user_version) < 108, 'SCHEMA_INVALID', '联网检索来源偏好列缺失。');
      db.exec(`ALTER TABLE search_backend_connections ADD COLUMN ${SEARCH_BACKEND_OVERRIDE_COLUMN}`);
      return initializeSearchBackendSchema(db);
    }
    requireStore(fold(asString(row.sql)) === fold(SEARCH_BACKEND_CONNECTIONS_SQL), 'SCHEMA_INVALID', '联网检索连接表结构不兼容。');
    requireStore(asNumber((db.prepare('SELECT count(*) total FROM search_backend_connections').get() as SqlRow).total) === 5 && db.prepare('SELECT 1 FROM search_backend_connections WHERE selected = 1').all().length === 1, 'SCHEMA_INVALID', '联网检索连接记录不完整。');
    return;
  }
  requireStore(asNumber((db.prepare('PRAGMA user_version').get() as SqlRow).user_version) < SEARCH_BACKEND_SCHEMA_VERSION, 'SCHEMA_INVALID', '联网检索连接表缺失。');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(SEARCH_BACKEND_CONNECTIONS_SQL);
    const insert = db.prepare("INSERT INTO search_backend_connections(backend_id, credential_reference, credential_operation_state, selected, selected_at) VALUES (?, NULL, 'missing', ?, ?)");
    const instant = new Date().toISOString();
    for (const entry of SEARCH_BACKENDS.filter((backend) => backend.shipped)) insert.run(entry.id, entry.id === defaultSearchBackend()!.id ? 1 : null, instant);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Read only the closed, generation-bound metadata retained by the protected synthetic test. */
export function readModelConnectionTest(row: SqlRow): ModelConnectionTestStatus | null {
  if (row.connection_test == null) return null;
  const json = asString(row.connection_test);
  requireStore(json.length <= 8192, 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  const value: unknown = JSON.parse(json);
  requireStore(isRecord(value) && hasExactKeys(value, ['modelId', 'credentialUpdatedAt', 'testedAt', 'outcome', 'code', 'verified',
    ...(value.provenance === undefined ? [] : ['provenance']), ...(value.responseText === undefined ? [] : ['responseText'])]) &&
    (value.responseText === undefined || typeof value.responseText === 'string' && value.responseText.isWellFormed() && value.responseText.length <= 4000) &&
    value.credentialUpdatedAt === row.credential_updated_at && typeof value.testedAt === 'string' && value.testedAt.length <= 30 && Number.isFinite(Date.parse(value.testedAt)) &&
    ['passed', 'failed', 'outcome-unknown', 'cancelled'].includes(value.outcome as string) && value.verified === 'buffered-text-only' &&
    (value.code === null || (typeof value.code === 'string' && /^[A-Z0-9_]{1,100}$/u.test(value.code))) &&
    MODEL_SERVICE_ROUTES.includes(row.provider_id as ModelServiceRouteId) && validModelServiceModelId(value.modelId as string),
    'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  const facts = value.provenance;
  requireStore(value.outcome !== 'passed' || (value.code === null && facts !== undefined), 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  if (facts !== undefined) requireStore(isModelTextAttemptProvenance(facts) && facts.model === value.modelId && modelServiceChannelOf(facts.route) === row.provider_id &&
    facts.credentialReference === row.credential_reference && facts.credentialSlot === row.credential_slot && (facts.policyVersion === 'v25' || facts.policyVersion === 'v26' || facts.policyVersion === 'v27' || facts.policyVersion === 'v30' || facts.policyVersion === 'v31' || (facts.policyVersion === 'v32' || facts.policyVersion === 'v33' || facts.policyVersion === 'v34' || facts.policyVersion === 'v35')) && facts.failureCode === value.code &&
    (facts.credentialUpdatedAt === undefined || facts.credentialUpdatedAt === value.credentialUpdatedAt) &&
    allowedProductionBindingOf({ route: facts.route, endpoint: facts.endpoint, model: facts.model, credentialSlot: facts.credentialSlot, credentialReference: facts.credentialReference }, 'fast-interaction') !== null,
    'MODEL_CONNECTION_TEST_INVALID', '连接测试来历无效。');
  return value as unknown as ModelConnectionTestStatus;
}

/**
 * `validateStoreTruth` follows the same rule as `initializeBoundedSchema`: only a caller that keeps
 * an earlier and a later terminal-version store-truth validation in the same `EditorialStore.open`
 * may suppress this intermediate one. The fixed model-service connection check always runs, and any
 * version below the terminal one validates exactly as it does when the flag is absent.
 */
export function initializeModelServiceSchema(
  db: DatabaseSync,
  profile: BuiltInWorkflowProfile,
  validateStoreTruth = true,
): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION),
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION ||
      version === INITIAL_EVALUATION_SCHEMA_VERSION ||
      version === DIALOGUE_SCHEMA_VERSION ||
      version === SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION ||
      version === READERS_REPORT_SCHEMA_VERSION ||
      version === CAPTURED_PROCEDURE_SCHEMA_VERSION ||
      version === EVALUATION_REWRITE_SCHEMA_VERSION ||
      version === WRITING_TASK_SCHEMA_VERSION ||
      version === BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION ||
      version === MATERIAL_INDEX_SCHEMA_VERSION ||
      (version === OUTCOME_RESOLUTION_SCHEMA_VERSION || version === IMPORTED_EXEMPLAR_SCHEMA_VERSION || version === EVALUATION_PROFILE_SCHEMA_VERSION || version === DIALOGUE_LIVE_BINDING_SCHEMA_VERSION || version === MODEL_SERVICE_ROUTES_SCHEMA_VERSION || version === MODEL_CLARIFICATION_SCHEMA_VERSION || version === SEARCH_BACKEND_SCHEMA_VERSION || version === RESEARCH_EVIDENCE_SCHEMA_VERSION || version === MATERIAL_INDEX_LAYER_SCHEMA_VERSION || version === PROPOSAL_REVIEW_SCHEMA_VERSION || version === FACTUAL_VERIFICATION_SCHEMA_VERSION || version === HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || version === TASK_INTENT_DRAFT_SCHEMA_VERSION || version === IMPORTED_SKILL_SCHEMA_VERSION || version === CUSTOM_ANALYSIS_SCHEMA_VERSION || version === IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || version === MODEL_SELECTION_SCHEMA_VERSION || version === PROCEDURE_DEFINITION_SCHEMA_VERSION || version === EDITORIAL_LEARNING_SCHEMA_VERSION || version === GLOBAL_AGENT_SCHEMA_VERSION || version === REVIEW_CONTRACT_SCHEMA_VERSION || version === IDLE_BACKGROUND_SCHEMA_VERSION || version === LOCAL_REVIEW_SCHEMA_VERSION || version === EDITORIAL_MEMORY_SCHEMA_VERSION || version === MODEL_REQUEST_ADMISSION_SCHEMA_VERSION || version === WORD_TRACKED_IMPORT_SCHEMA_VERSION || version === POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION || version === LEARNING_CURATION_SCHEMA_VERSION || version === 97 || version === 98 || version === 99 || version === 100 || version === 101 || version === 102 || version === 103 || version === 104 || version === 105 || version === 106 || version === 107 || version === 108 || version === 109 || version === 110 || version === 111 || version === 112 || version === LATEST_SCHEMA_VERSION)) {
    validateModelServiceSchema(db, profile, validateStoreTruth);
    if (version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION) {
      validateEditorialWorkspaceProfileNativeSchema(db);
    } else if (version >= EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) {
      validateEditorialWorkspaceProfileSchema(db);
    }
    return;
  }
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${MODEL_SERVICE_CONNECTION_REVISION_11_SQL};
      PRAGMA user_version = ${MODEL_SERVICE_SCHEMA_VERSION};
    `);
    validateModelServiceSchema(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite model-service schema migration rollback failed.');
    }
    throw error;
  }
}
