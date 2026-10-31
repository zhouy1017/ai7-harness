import { EDITABLE_PROCEDURE_FOREIGN_KEYS } from '../procedures/editable-schema.js';
import { HOUSE_WORD_LIST_FOREIGN_KEYS } from '../review/house-word-list.js';
import { LOCAL_STAGE_FOREIGN_KEYS, REVIEW_RUN_FOREIGN_KEYS } from '../review/review-runs.js';
import { PROCEDURE_DEFINITION_FOREIGN_KEYS } from '../procedures/definition-store.js';
import { EDITORIAL_LEARNING_FOREIGN_KEYS } from '../learning/ledger.js';
import { SUPERVISION_FOREIGN_KEYS } from '../learning/supervision-directives.js';
import { IMPORTED_SKILL_FOREIGN_KEYS, IMPORTED_SKILL_UPDATE_FOREIGN_KEYS } from '../imported-skill-schema.js';
import { HOUSE_REVIEW_PREFERENCE_FOREIGN_KEYS } from '../house-review-preference.js';
import { TASK_INTENT_DRAFT_FOREIGN_KEYS } from '../task-intent-drafts.js';
import { CUSTOM_ANALYSIS_DIMENSION_FOREIGN_KEYS } from '../custom-analysis-dimensions.js';
import { STRUCTURAL_EDIT_FOREIGN_KEYS } from './structural-schema.js';
import { NOTE_BLOCK_FOREIGN_KEYS } from './note-schema.js';
import { IMPORT_STRUCTURE_FOREIGN_KEYS } from './structure-schema.js';
import { ANALYSIS_LEDGER_REVISION_15_SQL, ANALYSIS_LEDGER_REVISION_16_SQL, ANALYSIS_LEDGER_REVISION_19_SQL, ANALYSIS_LEDGER_REVISION_23_SQL, ANALYSIS_LEDGER_REVISION_58_SQL, ANALYSIS_LEDGER_REVISION_59_SQL, ANALYSIS_LEDGER_REVISION_62_SQL, ANALYSIS_LEDGER_REVISION_64_SQL, ANALYSIS_LEDGER_REVISION_79_SQL, ANALYSIS_LEDGER_REVISION_81_SQL, ANALYSIS_LEDGER_REVISION_29_SQL, ANALYSIS_LEDGER_REVISION_31_SQL, ANALYSIS_LEDGER_REVISION_32_SQL, ANALYSIS_LEDGER_REVISION_33_SQL, ANALYSIS_LEDGER_REVISION_34_SQL, ANALYSIS_LEDGER_REVISION_30_SQL, ANALYSIS_LEDGER_REVISION_65_SQL, ANALYSIS_LEDGER_REVISION_17_TABLES, ANALYSIS_LEDGER_SCHEMA_SQL, CURATION_SCHEMA_SQL, FACTUAL_TASK_INTENTS_SQL, ANALYSIS_LEDGER_REVISION_84_SQL, WEB_TOOLS_PLAN_RECORDS_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, IDLE_RUN_AUTHORIZATIONS_SQL } from '../task-authorization.js';
import { EDITORIAL_MARK_FOREIGN_KEYS, PROPOSAL_REVIEW_FOREIGN_KEYS } from '../editorial-marks.js';
import { IMPORTED_MARK_FOREIGN_KEYS } from '../imported-marks.js';
import { EXPORT_LEDGER_FOREIGN_KEYS } from '../manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_FOREIGN_KEYS } from '../default-execution-rules.js';
import { RUN_CHECKPOINT_FOREIGN_KEYS } from '../analysis/run-checkpoints.js';
import { CLARIFICATION_FOREIGN_KEYS } from '../analysis/clarifications.js';
import { REIMPORT_GROUP_FOREIGN_KEYS } from '../reimport-group-ledger.js';
import { MANUSCRIPTS_REVISION_37_SQL, PRODUCTION_DOCUMENT_DELIVERY_FOREIGN_KEYS, PRODUCTION_DOCUMENT_FOREIGN_KEYS } from '../production-document-ledger.js';
import { BOOK_DELIVERY_PACKAGE_FOREIGN_KEYS } from '../book-delivery-packages.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_FOREIGN_KEYS } from '../production-document-workflow.js';
import { BOOK_DELIVERY_PACKAGE_EXPORT_FOREIGN_KEYS } from '../book-delivery-package-exports.js';
import { PRODUCTION_DOCUMENT_ORIGIN_FOREIGN_KEYS } from '../production-document-origins.js';
import { MAINTENANCE_CASE_FOREIGN_KEYS } from '../maintenance-cases.js';
import { BOOK_PEOPLE_FOREIGN_KEYS } from '../book-people.js';
import { REVIEW_GUIDELINE_FOREIGN_KEYS } from '../review-guidelines.js';
import { LIBRARY_MATERIAL_FOREIGN_KEYS } from '../library-materials.js';
import { EVALUATION_RECORD_FOREIGN_KEYS, EVALUATION_INITIAL_DRAFT_FOREIGN_KEYS } from '../evaluation-records.js';
import { ANALYSIS_FEEDBACK_FOREIGN_KEYS } from '../analysis-feedback.js';
import { DECISION_FEEDBACK_FOREIGN_KEYS } from '../decision-feedback.js';
import { LEARNING_ELIGIBILITY_FOREIGN_KEYS } from '../learning-eligibility.js';
import { EVALUATION_CALIBRATION_FOREIGN_KEYS } from '../evaluation-calibration.js';
import { SERIES_FOREIGN_KEYS } from '../series.js';
import { SERIES_KNOWLEDGE_FOREIGN_KEYS } from '../series-knowledge.js';
import { DATA_VERSION_FOREIGN_KEYS } from '../data-version.js';
import { DATABASE_EXPORT_FOREIGN_KEYS } from '../database-exports.js';
import { SCHEDULED_BACKUP_FOREIGN_KEYS } from '../scheduled-backups.js';
import { DATABASE_REPLACEMENT_FOREIGN_KEYS } from '../database-replacement.js';
import { DATABASE_MERGE_FOREIGN_KEYS } from '../database-merge.js';
import { DIALOGUE_FOREIGN_KEYS } from '../dialogue/dialogue-ledger.js';
import { CAPTURED_PROCEDURE_FOREIGN_KEYS } from '../captured-procedures.js';
import { EVALUATION_REWRITE_FOREIGN_KEYS } from '../evaluation-rewrites.js';
import { WRITING_TASK_FOREIGN_KEYS } from '../writing-tasks.js';
import { MATERIAL_INDEX_FOREIGN_KEYS, MATERIAL_INDEX_LAYER_FOREIGN_KEYS, MATERIAL_TRANSLATION_ATTEMPT_FOREIGN_KEYS } from '../material-index.js';
import { EVALUATION_PROFILE_FOREIGN_KEYS } from '../evaluation-profiles.js';
import { IMPORTED_EXEMPLAR_FOREIGN_KEYS } from '../imported-exemplars.js';
import { RESEARCH_EVIDENCE_FOREIGN_KEYS } from '../research-evidence-schema.js';
import { FACTUAL_CLAIM_FOREIGN_KEYS, FACTUAL_VERIFICATION_FOREIGN_KEYS } from '../factual-verification-schema.js';
import { OUTCOME_RESOLUTION_FOREIGN_KEYS } from '../analysis/outcome-resolutions.js';
import { BACKGROUND_ANALYSIS_ENROLLMENT_FOREIGN_KEYS } from '../background-analysis-enrollments.js';
import { SERIES_RETRIEVAL_EXCLUSION_FOREIGN_KEYS } from '../series-exclusions.js';
import { READERS_REPORT_FOREIGN_KEYS } from '../readers-reports.js';
import { MANUSCRIPT_EFFECT_FOREIGN_KEYS } from '../manuscript-apply.js';
import { PUBLICATION_VERSION_FOREIGN_KEYS } from '../publication-versions.js';
import { PROPOSAL_CONFLICT_FOREIGN_KEYS } from '../proposal-conflicts.js';
import { IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL, IMPORT_FIDELITY_CATEGORIES_SQL, IMPORT_RETENTION_FOREIGN_KEYS, WORD_IMPORT_RETENTION_FOREIGN_KEYS } from '../import-retention.js';
/**
 * The analysis ledger as revision 15 created it, as revision 16 rebuilt two of its relations, as
 * revision 19 left them, as revision 20 widened the three kind-coupled ones and revisions 21 to 23
 * carried them, and as revision 24 widened the same three again for the review-category kind family
 * (Issue #417); the Run states as revisions 15 to 29 carried them before revision 30 widened them for
 * Connectivity Wait (Issue #502), and as revisions 30 and 31 carried them before revision 32 widened them again,
 * with the Task Outcomes, for 取消任务 (Issue #422), and as revision 32 left them before revision 33 widened them for
 * 暂停 and 续行. Every one of those shapes validates exactly, so a store at any of them passes this layer before the
 * forward copy that brings it to the current shape.
 */
export const ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL: Readonly<Record<string, string | ReadonlyArray<string>>> = {
  ...ANALYSIS_LEDGER_SCHEMA_SQL,
  analysis_task_intents: [
    FACTUAL_TASK_INTENTS_SQL,
    CURATION_SCHEMA_SQL['analysis_task_intents']!,
    ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_84_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_79_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_64_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_62_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_59_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_58_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_23_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_19_SQL.analysis_task_intents,
    ANALYSIS_LEDGER_REVISION_15_SQL.analysis_task_intents,
  ],
  analysis_plan_adaptations: [ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_adaptations, ANALYSIS_LEDGER_REVISION_84_SQL.analysis_plan_adaptations],
  analysis_plan_records: [WEB_TOOLS_PLAN_RECORDS_SQL, ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_records, ANALYSIS_LEDGER_REVISION_16_SQL.analysis_plan_records, ANALYSIS_LEDGER_REVISION_15_SQL.analysis_plan_records],
  analysis_result_sets: [
    ANALYSIS_LEDGER_SCHEMA_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_81_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_64_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_62_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_59_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_58_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_23_SQL.analysis_result_sets,
    ANALYSIS_LEDGER_REVISION_19_SQL.analysis_result_sets,
  ],
  analysis_result_set_revisions: [
    ANALYSIS_LEDGER_SCHEMA_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_84_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_81_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_64_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_62_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_59_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_58_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_23_SQL.analysis_result_set_revisions,
    ANALYSIS_LEDGER_REVISION_19_SQL.analysis_result_set_revisions,
  ],
  analysis_run_states: [
    ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_states,
    ANALYSIS_LEDGER_REVISION_34_SQL.analysis_run_states,
    ANALYSIS_LEDGER_REVISION_32_SQL.analysis_run_states,
    ANALYSIS_LEDGER_REVISION_31_SQL.analysis_run_states,
    ANALYSIS_LEDGER_REVISION_29_SQL.analysis_run_states,
  ],
  analysis_task_outcomes: [ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_outcomes, ANALYSIS_LEDGER_REVISION_31_SQL.analysis_task_outcomes],
  analysis_plan_revisions: [ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_revisions, ANALYSIS_LEDGER_REVISION_33_SQL.analysis_plan_revisions],
  analysis_run_authorizations: [
    CURATION_SCHEMA_SQL['analysis_run_authorizations']!,
    IDLE_RUN_AUTHORIZATIONS_SQL,
    ANALYSIS_LEDGER_SCHEMA_SQL.analysis_run_authorizations,
    ANALYSIS_LEDGER_REVISION_65_SQL.analysis_run_authorizations,
    ANALYSIS_LEDGER_REVISION_30_SQL.analysis_run_authorizations,
  ],
};

/** The analysis ledger before revision 17 (Issue #48): the same relations without the plan-version, Plan Revision, and Plan Adaptation tables and their triggers. */
export const PRE_17_ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL: Readonly<Record<string, string | ReadonlyArray<string>>> = Object.fromEntries(
  Object.entries(ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL).filter(([name]) => !(ANALYSIS_LEDGER_REVISION_17_TABLES as ReadonlyArray<string>).includes(name)),
);
export const PRE_17_ANALYSIS_LEDGER_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ANALYSIS_LEDGER_TRIGGER_SQL).filter(([name]) =>
    !ANALYSIS_LEDGER_REVISION_17_TABLES.some((table) => name === `${table}_no_update` || name === `${table}_no_delete`)),
);

export { MODEL_SERVICE_CONNECTION_REVISION_11_SQL, MODEL_SERVICE_CONNECTION_REVISION_72_SQL, MODEL_SERVICE_CONNECTION_REVISION_84_SQL, MODEL_SERVICE_CONNECTION_SCHEMA_SQL } from '../model-service-connections.js';

/**
 * Revision 21 (Issue #467): where an editor last entered a Book's primary Manuscript, one row per
 * Book and Manuscript Revision. The position is the window projection's own pair — a block identity
 * and a grapheme offset inside it — and `revision_id` names the Revision it was taken against, so a
 * position recorded before the Manuscript moved on is recognisable as superseded instead of being
 * mistaken for a current one. It is editor state, not a record of the work: it may be rewritten in
 * place for the same Book and Revision, and it carries no canonical JSON and no digest.
 *
 * `block_id` references the durable block identity rather than the working block, because a block
 * that leaves the working state must still be readable here — that is what the nearest-anchor
 * resolution in `readManuscriptEntryPosition` reads it for.
 */
export const MANUSCRIPT_ENTRY_POSITION_SCHEMA_SQL = `CREATE TABLE manuscript_entry_positions (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  grapheme INTEGER NOT NULL CHECK(grapheme >= 0),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(book_id, revision_id)
) STRICT`;

export const COMMON_SCHEMA_SQL = {
  content_objects: `CREATE TABLE content_objects (
    object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
    relative_key TEXT NOT NULL UNIQUE,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    verified_at TEXT NOT NULL
  ) STRICT`,
  import_drafts: `CREATE TABLE import_drafts (
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
  ) STRICT`,
  books: `CREATE TABLE books (
    book_id TEXT PRIMARY KEY,
    stable_identity TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
  book_dimension_sets: `CREATE TABLE book_dimension_sets (
    dimension_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    version INTEGER NOT NULL CHECK(version = 1),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
    weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
    created_at TEXT NOT NULL
  ) STRICT`,
  book_dimensions: `CREATE TABLE book_dimensions (
    dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
    dimension_id TEXT NOT NULL,
    display_label TEXT NOT NULL,
    weight REAL NOT NULL CHECK(weight > 0),
    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
    PRIMARY KEY(dimension_set_id, dimension_id),
    UNIQUE(dimension_set_id, position)
  ) STRICT`,
  // Revision 18 widens the format and makes the three parse fields nullable together, so a Source
  // Version may be a retained original the product never parsed; revision 19 appends the working
  // representation an original was read through and the converter that produced it. Every shape is
  // accepted because a store below the terminal revision still carries an earlier one.
  source_versions: [
    `CREATE TABLE source_versions (
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
  ) STRICT`,
    `CREATE TABLE source_versions (
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
  ) STRICT`,
    // Exactly what revision 19's two `ALTER TABLE ADD COLUMN` statements leave behind: SQLite
    // appends each new column after the last column definition and before the table constraints.
    `CREATE TABLE source_versions (
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
    working_object_digest TEXT REFERENCES content_objects(object_digest), converter_identity TEXT,
    CHECK((content_digest IS NULL) = (structure_digest IS NULL) AND (structure_digest IS NULL) = (parser_identity IS NULL)),
    UNIQUE(book_id, source_digest)
  ) STRICT`,
  ],
  source_provenance: `CREATE TABLE source_provenance (
    provenance_id TEXT PRIMARY KEY,
    source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
    acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
    locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
    sanitized_identity TEXT NOT NULL,
    parser_identity TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`,
  import_fidelity_reviews: `CREATE TABLE import_fidelity_reviews (
    fidelity_review_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
    review_digest TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
    round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
    created_at TEXT NOT NULL
  ) STRICT`,
  // Revision 27 (Issue #410) widens the relation to the ten classes and the `retained` status. Below it
  // the store holds revision 26's text; revision 27's own exact validation accepts only the widened one,
  // and so does a store an earlier build planted after this one had already widened it — its rows are
  // the rows this build wrote, and `initializeImportRetentionSchema` has nothing left to rebuild.
  import_fidelity_categories: [IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL, IMPORT_FIDELITY_CATEGORIES_SQL],
  import_degradation_decisions: `CREATE TABLE import_degradation_decisions (
    degradation_decision_id TEXT PRIMARY KEY,
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
  // Revision 37 (Issue #415) rebuilds the relation so that a Book's Production Documents are rows beside its one
  // primary Manuscript. Below it the store holds the earlier text; revision 37's own exact validation accepts only
  // the rebuilt one, and so does a store an earlier build planted after this one had already rebuilt it.
  manuscripts: [`CREATE TABLE manuscripts (
    manuscript_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    role TEXT NOT NULL CHECK(role = 'primary'),
    created_at TEXT NOT NULL
  ) STRICT`, MANUSCRIPTS_REVISION_37_SQL],
  manuscript_branches: `CREATE TABLE manuscript_branches (
    branch_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    name TEXT NOT NULL,
    base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    created_at TEXT NOT NULL,
    UNIQUE(manuscript_id, name)
  ) STRICT`,
  manuscript_blocks: `CREATE TABLE manuscript_blocks (
    block_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
  ) STRICT`,
  workflow_profiles: `CREATE TABLE workflow_profiles (
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    definition_json TEXT NOT NULL,
    PRIMARY KEY(profile_id, profile_version)
  ) STRICT`,
  workflow_instances: `CREATE TABLE workflow_instances (
    workflow_instance_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    current_phase TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state = 'active'),
    created_at TEXT NOT NULL,
    FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
  ) STRICT`,
  manuscript_import_records: `CREATE TABLE manuscript_import_records (
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
  ) STRICT`,
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  // Revision 19 appends the working representation the cleanup must remove beside the original.
  import_abandonment_cleanup_intents: [
    `CREATE TABLE import_abandonment_cleanup_intents (
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
  ) STRICT`,
    `CREATE TABLE import_abandonment_cleanup_intents (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id),
    object_digest TEXT NOT NULL UNIQUE REFERENCES content_objects(object_digest),
    expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
    relative_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared', 'bytes-removed')),
    requested_at TEXT NOT NULL,
    bytes_removed_at TEXT, working_object_digest TEXT,
    CHECK(
      (state = 'prepared' AND bytes_removed_at IS NULL)
      OR (state = 'bytes-removed' AND bytes_removed_at IS NOT NULL)
    )
  ) STRICT`,
  ],
} as const;

export const MIGRATED_CONTINUITY_IMPORT_DRAFT_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  reviewed_title TEXT,
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  selected_path TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work'))
) STRICT`;

const CONTINUITY_SCHEMA_SQL = {
  staged_import_snapshots: `CREATE TABLE staged_import_snapshots (
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
  ) STRICT`,
  staged_import_blocks: `CREATE TABLE staged_import_blocks (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, staged_block_id)
  ) STRICT`,
  manuscript_revisions: `CREATE TABLE manuscript_revisions (
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
  ) STRICT`,
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, position)
  ) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
  ) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
  ) STRICT`,
} as const;

export const TARGET_BASE_SCHEMA_SQL = {
  import_ingest_blocks: `CREATE TABLE import_ingest_blocks (
    ingest_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(ingest_id, position),
    UNIQUE(ingest_id, staged_block_id)
  ) STRICT`,
  staged_import_snapshots: `CREATE TABLE staged_import_snapshots (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    parser_identity TEXT NOT NULL,
    source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
    content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
    structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
    block_count INTEGER NOT NULL CHECK(block_count > 0),
    fidelity_json TEXT NOT NULL,
    title_suggestion TEXT NOT NULL,
    title_source TEXT NOT NULL,
    snapshot_created_at TEXT NOT NULL,
    character_count INTEGER NOT NULL DEFAULT 0 CHECK(character_count >= 0)
  ) STRICT`,
  staged_import_blocks: `CREATE TABLE staged_import_blocks (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, staged_block_id)
  ) STRICT`,
  manuscript_revisions: `CREATE TABLE manuscript_revisions (
    revision_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    revision_label TEXT NOT NULL,
    parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    created_at TEXT NOT NULL,
    UNIQUE(manuscript_id, ordinal),
    UNIQUE(manuscript_id, revision_label)
  ) STRICT`,
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, position)
  ) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0),
    history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0),
    last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0)
  ) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
    command_group_id TEXT,
    command_kind TEXT NOT NULL DEFAULT 'edit',
    UNIQUE(branch_id, sequence)
  ) STRICT`,
  manuscript_outline: `CREATE TABLE manuscript_outline (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  manuscript_command_groups: `CREATE TABLE manuscript_command_groups (
    command_group_id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement')),
    status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded')),
    source_group_id TEXT,
    before_working_digest TEXT NOT NULL CHECK(length(before_working_digest) = 64),
    after_working_digest TEXT NOT NULL CHECK(length(after_working_digest) = 64),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, ordinal)
  ) STRICT`,
  manuscript_command_edits: `CREATE TABLE manuscript_command_edits (
    command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
    position INTEGER NOT NULL CHECK(position > 0),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    before_text TEXT NOT NULL,
    before_digest TEXT NOT NULL CHECK(length(before_digest) = 64),
    after_text TEXT NOT NULL,
    after_digest TEXT NOT NULL CHECK(length(after_digest) = 64),
    PRIMARY KEY(command_group_id, position),
    UNIQUE(command_group_id, block_id)
  ) STRICT`,
  milestone_versions: `CREATE TABLE milestone_versions (
    milestone_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    label TEXT NOT NULL,
    purpose TEXT NOT NULL,
    note TEXT,
    actor TEXT NOT NULL CHECK(actor = '本机编辑'),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, label)
  ) STRICT`,
  manuscript_search_sessions: `CREATE TABLE manuscript_search_sessions (
    search_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    query TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('running', 'completed', 'cancelled', 'failed')),
    scanned_position INTEGER NOT NULL DEFAULT 0 CHECK(scanned_position >= 0),
    total_blocks INTEGER NOT NULL CHECK(total_blocks > 0),
    total_matches INTEGER NOT NULL DEFAULT 0 CHECK(total_matches >= 0),
    created_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT`,
  manuscript_search_results: `CREATE TABLE manuscript_search_results (
    search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    match_id TEXT NOT NULL,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
    to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
    global_character INTEGER NOT NULL CHECK(global_character >= 0),
    heading_label TEXT NOT NULL,
    context TEXT NOT NULL,
    range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
    PRIMARY KEY(search_id, ordinal),
    UNIQUE(search_id, match_id)
  ) STRICT`,
  manuscript_replacement_previews: `CREATE TABLE manuscript_replacement_previews (
    preview_id TEXT PRIMARY KEY,
    search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    query TEXT NOT NULL,
    replacement TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('reviewing', 'frozen', 'committed', 'cancelled', 'failed')),
    total_matches INTEGER NOT NULL CHECK(total_matches > 0),
    included_matches INTEGER NOT NULL CHECK(included_matches >= 0),
    validated_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(validated_ordinal >= 0),
    created_at TEXT NOT NULL,
    committed_at TEXT
  ) STRICT`,
  manuscript_replacement_matches: `CREATE TABLE manuscript_replacement_matches (
    preview_id TEXT NOT NULL REFERENCES manuscript_replacement_previews(preview_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    match_id TEXT NOT NULL,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
    to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
    range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
    included INTEGER NOT NULL CHECK(included IN (0, 1)),
    PRIMARY KEY(preview_id, ordinal),
    UNIQUE(preview_id, match_id)
  ) STRICT`,
  milestone_signoff_records: `CREATE TABLE milestone_signoff_records (
    signoff_record_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(workflow_instance_id),
    workflow_evidence_digest TEXT NOT NULL CHECK(length(workflow_evidence_digest) = 64),
    actor TEXT NOT NULL CHECK(actor = '本机编辑'),
    signed_at TEXT NOT NULL,
    label TEXT NOT NULL,
    stated_next_use TEXT NOT NULL
  ) STRICT`,
} as const;

export const V6_TARGET_SCHEMA_SQL = {
  ...TARGET_BASE_SCHEMA_SQL,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  manuscript_outline: `CREATE TABLE manuscript_outline (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  working_offset_nodes: `CREATE TABLE working_offset_nodes (
    branch_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    span_graphemes INTEGER NOT NULL CHECK(span_graphemes >= 0),
    PRIMARY KEY(branch_id, position),
    FOREIGN KEY(branch_id, position) REFERENCES working_blocks(branch_id, position) ON DELETE CASCADE
  ) STRICT`,
} as const;

export const RECOVERY_SCHEMA_SQL = {
  service_lifetimes: `CREATE TABLE service_lifetimes (
    lifetime_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('running', 'clean', 'interrupted')),
    CHECK(
      (outcome = 'running' AND ended_at IS NULL)
      OR (outcome IN ('clean', 'interrupted') AND ended_at IS NOT NULL)
    )
  ) STRICT`,
  service_lifetime_branch_writes: `CREATE TABLE service_lifetime_branch_writes (
    lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    reconstruction_base_sequence INTEGER NOT NULL CHECK(reconstruction_base_sequence >= checkpoint_sequence),
    reconstruction_base_digest TEXT NOT NULL CHECK(length(reconstruction_base_digest) = 64),
    high_water_sequence INTEGER NOT NULL CHECK(high_water_sequence > reconstruction_base_sequence),
    high_water_digest TEXT NOT NULL CHECK(length(high_water_digest) = 64),
    last_durable_at TEXT NOT NULL,
    entry_count INTEGER NOT NULL CHECK(entry_count > 0),
    CHECK(entry_count = high_water_sequence - reconstruction_base_sequence),
    PRIMARY KEY(lifetime_id, branch_id)
  ) STRICT`,
  recovery_snapshots: `CREATE TABLE recovery_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    object_digest TEXT NOT NULL CHECK(length(object_digest) = 64),
    manifest_digest TEXT NOT NULL CHECK(length(manifest_digest) = 64),
    object_relative_key TEXT NOT NULL UNIQUE,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    block_count INTEGER NOT NULL CHECK(block_count > 0),
    total_graphemes INTEGER NOT NULL CHECK(total_graphemes >= 0),
    created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL
  ) STRICT`,
  recovery_attention: `CREATE TABLE recovery_attention (
    attention_id TEXT PRIMARY KEY,
    interrupted_lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence > checkpoint_sequence),
    journal_working_digest TEXT NOT NULL CHECK(length(journal_working_digest) = 64),
    last_durable_at TEXT NOT NULL,
    journal_entry_count INTEGER NOT NULL CHECK(journal_entry_count > 0),
    journal_reconstruction_verified_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'resolved')),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    created_at TEXT NOT NULL,
    deferred_at TEXT,
    resolved_at TEXT,
    CHECK(
      (status = 'pending' AND deferred_at IS NULL AND resolved_at IS NULL)
      OR (status = 'deferred' AND deferred_at IS NOT NULL AND resolved_at IS NULL)
      OR (status = 'resolved' AND resolved_at IS NOT NULL)
    )
  ) STRICT`,
  recovery_restore_stages: `CREATE TABLE recovery_restore_stages (
    attention_id TEXT PRIMARY KEY REFERENCES recovery_attention(attention_id) ON DELETE CASCADE,
    selected_snapshot_id TEXT NOT NULL REFERENCES recovery_snapshots(snapshot_id),
    expected_attention_version INTEGER NOT NULL CHECK(expected_attention_version >= 1),
    expected_block_count INTEGER NOT NULL CHECK(expected_block_count > 0),
    expected_total_graphemes INTEGER NOT NULL CHECK(expected_total_graphemes >= 0),
    started_at TEXT NOT NULL
  ) STRICT`,
  recovery_restore_stage_blocks: `CREATE TABLE recovery_restore_stage_blocks (
    attention_id TEXT NOT NULL REFERENCES recovery_restore_stages(attention_id) ON DELETE CASCADE,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(attention_id, position),
    UNIQUE(attention_id, block_id)
  ) STRICT`,
  recovery_decisions: `CREATE TABLE recovery_decisions (
    decision_id TEXT PRIMARY KEY,
    attention_id TEXT NOT NULL REFERENCES recovery_attention(attention_id),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    kind TEXT NOT NULL CHECK(kind IN ('view', 'defer', 'restore')),
    selected_kind TEXT CHECK(selected_kind IS NULL OR selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) = 64),
    decided_at TEXT NOT NULL,
    CHECK(
      (kind = 'defer' AND selected_kind IS NULL AND selected_snapshot_id IS NULL)
      OR (kind IN ('view', 'restore') AND selected_kind IS NOT NULL)
    ),
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind IS NULL OR selected_kind != 'snapshot') AND selected_snapshot_id IS NULL
    )
  ) STRICT`,
  recovery_restorations: `CREATE TABLE recovery_restorations (
    restoration_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL UNIQUE REFERENCES recovery_decisions(decision_id),
    attention_id TEXT NOT NULL UNIQUE REFERENCES recovery_attention(attention_id),
    selected_kind TEXT NOT NULL CHECK(selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    source_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    source_working_digest TEXT NOT NULL CHECK(length(source_working_digest) = 64),
    pre_restore_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    pre_restore_journal_sequence INTEGER NOT NULL CHECK(pre_restore_journal_sequence >= 0),
    pre_restore_working_digest TEXT NOT NULL CHECK(length(pre_restore_working_digest) = 64),
    journal_candidate_digest TEXT NOT NULL CHECK(length(journal_candidate_digest) = 64),
    checkpoint_candidate_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    snapshot_candidate_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    descendant_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
    created_at TEXT NOT NULL,
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind != 'snapshot' AND selected_snapshot_id IS NULL)
    )
  ) STRICT`,
  manuscript_recovery_review_status: `CREATE TABLE manuscript_recovery_review_status (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    restoration_id TEXT NOT NULL UNIQUE REFERENCES recovery_restorations(restoration_id),
    recovered_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    state TEXT NOT NULL CHECK(state IN ('awaiting-milestone-review', 'cleared-by-milestone')),
    created_at TEXT NOT NULL,
    cleared_at TEXT,
    cleared_by_milestone_id TEXT REFERENCES milestone_versions(milestone_id),
    CHECK(
      (state = 'awaiting-milestone-review' AND cleared_at IS NULL AND cleared_by_milestone_id IS NULL)
      OR (state = 'cleared-by-milestone' AND cleared_at IS NOT NULL AND cleared_by_milestone_id IS NOT NULL)
    )
  ) STRICT`,
} as const;

const TARGET_SCHEMA_SQL = {
  ...V6_TARGET_SCHEMA_SQL,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0),
    history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0),
    last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0),
    history_boundary_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_boundary_sequence >= 0)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
    command_group_id TEXT,
    command_kind TEXT NOT NULL DEFAULT 'edit',
    service_lifetime_id TEXT,
    UNIQUE(branch_id, sequence)
  ) STRICT`,
  ...RECOVERY_SCHEMA_SQL,
} as const;

export const PROFILE_SCHEMA_SQL = {
  import_drafts: `CREATE TABLE import_drafts (
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
      CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript')),
    reviewed_book_state_digest TEXT
      CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64)
  ) STRICT`,
  books: `CREATE TABLE books (
    book_id TEXT PRIMARY KEY,
    stable_identity TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    internal_number TEXT
  ) STRICT`,
  workflow_profiles: `CREATE TABLE workflow_profiles (
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    projection_schema TEXT NOT NULL CHECK(projection_schema = 'ai7.workflow-profile-projection/1'),
    projection_json TEXT NOT NULL,
    native_profile_id TEXT NOT NULL,
    native_profile_version TEXT NOT NULL,
    native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
    PRIMARY KEY(profile_id, profile_version)
  ) STRICT`,
  workflow_instances: `CREATE TABLE workflow_instances (
    workflow_instance_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    native_profile_id TEXT NOT NULL,
    native_profile_version TEXT NOT NULL,
    native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
    current_phase TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state = 'active'),
    created_at TEXT NOT NULL,
    FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
  ) STRICT`,
} as const;

export const FULL_CONTINUITY_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...CONTINUITY_SCHEMA_SQL } as const;
export const FULL_V6_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...V6_TARGET_SCHEMA_SQL } as const;
export const FULL_V7_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...TARGET_SCHEMA_SQL } as const;
export const FULL_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...TARGET_SCHEMA_SQL, ...PROFILE_SCHEMA_SQL } as const;

export const SOURCE_IMPORT_SCHEMA_SQL = {
  import_drafts: `CREATE TABLE import_drafts (
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
  ) STRICT`,
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  // Revision 18 makes the parser identity nullable for the same reason `source_versions` does.
  source_provenance: [
    `CREATE TABLE source_provenance (
    provenance_id TEXT PRIMARY KEY,
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
    locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
    sanitized_identity TEXT NOT NULL,
    parser_identity TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`,
    `CREATE TABLE source_provenance (
    provenance_id TEXT PRIMARY KEY,
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
    locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
    sanitized_identity TEXT NOT NULL,
    parser_identity TEXT,
    recorded_at TEXT NOT NULL
  ) STRICT`,
  ],
  source_import_records: `CREATE TABLE source_import_records (
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
  ) STRICT`,
} as const;

export const FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL = {
  ...FULL_TARGET_SCHEMA_SQL,
  ...SOURCE_IMPORT_SCHEMA_SQL,
} as const;

export const MANUSCRIPT_REIMPORT_SCHEMA_SQL = {
  import_fidelity_reviews: `CREATE TABLE import_fidelity_reviews (
    fidelity_review_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    review_digest TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
    round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
    created_at TEXT NOT NULL
  ) STRICT`,
  // Revision 18 appends the format the draft's file was identified as and revision 19 the working
  // representation it was read through; every shape is accepted because a store below the terminal
  // revision has not gained the columns yet.
  import_drafts: [
    `CREATE TABLE import_drafts (
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
  ) STRICT`,
    `CREATE TABLE import_drafts (
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
    reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id),
    source_format TEXT NOT NULL DEFAULT 'DOCX'
      CHECK(source_format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'))
  ) STRICT`,
    `CREATE TABLE import_drafts (
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
    reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id),
    source_format TEXT NOT NULL DEFAULT 'DOCX'
      CHECK(source_format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN')), working_object_digest TEXT, converter_identity TEXT
  ) STRICT`,
  ],
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  manuscript_reimport_comparisons: `CREATE TABLE manuscript_reimport_comparisons (
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
  ) STRICT`,
  manuscript_reimport_mappings: `CREATE TABLE manuscript_reimport_mappings (
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
  ) STRICT`,
  manuscript_reimport_mapping_resolutions: `CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT`,
  manuscript_reimport_records: `CREATE TABLE manuscript_reimport_records (
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
  ) STRICT`,
} as const;

export const FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL = {
  ...FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL,
  ...MANUSCRIPT_REIMPORT_SCHEMA_SQL,
} as const;

export const TARGET_VIRTUAL_TABLE_SQL = `CREATE VIRTUAL TABLE working_block_search USING fts5(
  branch_id UNINDEXED,
  block_id UNINDEXED,
  text,
  tokenize='trigram'
)`;

export const SEARCH_SHADOW_SCHEMA_SQL = {
  working_block_search_config: "CREATE TABLE 'working_block_search_config'(k PRIMARY KEY, v) WITHOUT ROWID",
  working_block_search_content: "CREATE TABLE 'working_block_search_content'(id INTEGER PRIMARY KEY, c0, c1, c2)",
  working_block_search_data: "CREATE TABLE 'working_block_search_data'(id INTEGER PRIMARY KEY, block BLOB)",
  working_block_search_docsize: "CREATE TABLE 'working_block_search_docsize'(id INTEGER PRIMARY KEY, sz BLOB)",
  working_block_search_idx: "CREATE TABLE 'working_block_search_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID",
} as const;

export const SEARCH_SCHEMA_TABLES = [
  'working_block_search',
  ...Object.keys(SEARCH_SHADOW_SCHEMA_SQL),
] as const;

export const CONTINUITY_INDEX_SQL = {
  working_blocks_window: 'CREATE INDEX working_blocks_window ON working_blocks(branch_id, position)',
  journal_branch_order: 'CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence)',
  import_attempts_recovery_order:
    'CREATE INDEX import_attempts_recovery_order ON import_commit_attempts(state, completion_acknowledged_at, prepared_at)',
} as const;

export const V6_TARGET_INDEX_SQL = {
  ...CONTINUITY_INDEX_SQL,
  manuscript_outline_order: 'CREATE INDEX manuscript_outline_order ON manuscript_outline(branch_id, position)',
  command_history_state: 'CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal)',
  replacement_matches_block: 'CREATE INDEX replacement_matches_block ON manuscript_replacement_matches(preview_id, included, block_id, from_grapheme)',
} as const;

export const TARGET_INDEX_SQL = {
  ...V6_TARGET_INDEX_SQL,
  lifetime_outcome_order: 'CREATE INDEX lifetime_outcome_order ON service_lifetimes(outcome, started_at)',
  recovery_attention_startup: 'CREATE INDEX recovery_attention_startup ON recovery_attention(status, created_at, attention_id)',
  recovery_snapshot_branch: 'CREATE INDEX recovery_snapshot_branch ON recovery_snapshots(branch_id, revision_id, created_at DESC, snapshot_id DESC)',
  book_internal_number_unique:
    'CREATE UNIQUE INDEX book_internal_number_unique ON books(internal_number) WHERE internal_number IS NOT NULL',
} as const;

export const MANUSCRIPT_REIMPORT_INDEX_SQL = {
  ...TARGET_INDEX_SQL,
  reimport_mappings_page:
    'CREATE INDEX reimport_mappings_page ON manuscript_reimport_mappings(comparison_id, position)',
  staged_reimport_identity:
    'CREATE INDEX staged_reimport_identity ON staged_import_blocks(draft_id, digest, kind, level)',
  revision_reimport_identity:
    'CREATE INDEX revision_reimport_identity ON manuscript_block_versions(revision_id, digest, kind, level)',
} as const;

export const V7_TARGET_INDEX_SQL = {
  ...V6_TARGET_INDEX_SQL,
  lifetime_outcome_order: TARGET_INDEX_SQL.lifetime_outcome_order,
  recovery_attention_startup: TARGET_INDEX_SQL.recovery_attention_startup,
  recovery_snapshot_branch: TARGET_INDEX_SQL.recovery_snapshot_branch,
} as const;

export const CONTINUITY_TRIGGER_DIGESTS = {
  abandonment_cleanup_validate_insert: '09ce8b29e4d81f26b3dd2ed03169da835d2d72ed1db17953a3a4554730943890',
  abandonment_cleanup_block_content_object_update: 'ebc8c2b457914325ee725b9007c29e7a25b69d104eea87b19ec752c77a9d374d',
  abandonment_cleanup_block_draft_insert: '423f4b8e6b9160beae522eb9daee757844f8defb97db028607709110015f2950',
  abandonment_cleanup_block_draft_update: 'c86550fb12ca0d1abf17c70ba790d595a34a3922ad98efdc95d8c2facfcafabd',
  abandonment_cleanup_block_source_insert: '6ce76e47b7adfd2ebdb8d4085fb0e5a1be42cc160d374bc8cb167dff6d98fa8c',
  abandonment_cleanup_block_source_update: 'aaaaa619f3ba2986675f30673ab5d1f65ac62d2a60118d1c78ae4b20cdf11b2f',
  abandonment_cleanup_block_commit_insert: '0e153594899bf6873b3880a78ae90439a664ff4b3841617f466ef81ab45c23b5',
  abandonment_cleanup_block_attempt_insert: '5b1f6a4f887a3ebf1aa51e963ea3f8e7ed60034294115a186c7af44f3af0be4f',
  abandonment_cleanup_validate_intent_update_v5: 'aa3d9f6e2659fcc53bc1b7cf2ad4c06eb6d9f913c5d2e00d4436c399bcc04f42',
  abandonment_cleanup_block_content_object_update_v5: 'f86f9c3174539f074d9e7ec78da5bd0b35f8ce801d9ed7ee04c8b19908364fc9',
  abandonment_cleanup_block_draft_update_v5: '829704af602ccf10c73592b2f0c2a54c8aba1b76abe3d526de498c7ee2f62b0f',
  abandonment_cleanup_block_source_update_v5: 'f79586f62a34dc1aa03ea6ea0561b1b7e2a3a0865878b9e04fb32f4eb0505e99',
  abandonment_cleanup_block_commit_update_v5: '1c8c1058feb0665e13be45fc0771fb85de2ce40408b91b616045cf71ba2fac2c',
  abandonment_cleanup_block_attempt_update_v5: '136f9eafe5078c8131bf6178ceda3302aedc8263962a83a2e2ccd50918d9303e',
} as const;

export const SOURCE_IMPORT_TRIGGER_SQL = {
  source_import_record_excludes_manuscript_result: `CREATE TRIGGER source_import_record_excludes_manuscript_result
    BEFORE INSERT ON source_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  manuscript_import_record_excludes_source_result: `CREATE TRIGGER manuscript_import_record_excludes_source_result
    BEFORE INSERT ON manuscript_import_records
    WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
} as const;

export const MANUSCRIPT_REIMPORT_TRIGGER_SQL = {
  ...SOURCE_IMPORT_TRIGGER_SQL,
  reimport_record_excludes_other_results: `CREATE TRIGGER reimport_record_excludes_other_results
    BEFORE INSERT ON manuscript_reimport_records
    WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
      OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  manuscript_import_record_excludes_reimport_result: `CREATE TRIGGER manuscript_import_record_excludes_reimport_result
    BEFORE INSERT ON manuscript_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  source_import_record_excludes_reimport_result: `CREATE TRIGGER source_import_record_excludes_reimport_result
    BEFORE INSERT ON source_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
} as const;

export const IMPORT_DRAFT_TRIGGER_SQL = {
  abandonment_cleanup_block_draft_insert: `CREATE TRIGGER abandonment_cleanup_block_draft_insert
    BEFORE INSERT ON import_drafts
    WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.object_digest = NEW.object_digest
    )
    BEGIN
      SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
    END`,
  abandonment_cleanup_block_draft_update: `CREATE TRIGGER abandonment_cleanup_block_draft_update
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
    END`,
  abandonment_cleanup_block_draft_update_v5: `CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
    BEFORE UPDATE ON import_drafts
    WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
        OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
    )
    BEGIN
      SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
    END`,
} as const;

export const SCHEMA_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  task_intents: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
  task_input_checkpoints: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  task_manuscript_pins: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  task_artifact_pins: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  run_source_scopes: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  provider_resolution_plans: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  execution_plans: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  plan_envelopes: [
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  run_authorizations: [
    'plan_envelope_sha256>plan_envelopes.sha256:NO ACTION/NO ACTION/NONE',
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  run_records: [
    'authorization_id>run_authorizations.authorization_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_task_intents: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_task_input_checkpoints: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_plan_records: [
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  // Revision 17 (Issue #48): plan versions and Plan Revisions link both ways; adaptations belong to an attempt.
  analysis_plan_versions: [
    'plan_revision_id>analysis_plan_revisions.plan_revision_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_plan_revisions: [
    'prior_plan_version_id>analysis_plan_versions.plan_version_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_plan_adaptations: [
    'attempt_id>analysis_execution_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_run_authorizations: [
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_run_records: [
    'authorization_id>analysis_run_authorizations.authorization_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_run_states: [
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_execution_attempts: [
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_execution_bindings: [
    'attempt_id>analysis_execution_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_harness_spans: [
    'attempt_id>analysis_execution_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_result_sets: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_result_set_revisions: [
    'attempt_id>analysis_execution_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
    'manuscript_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'result_set_id>analysis_result_sets.result_set_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_unit_results: [
    'revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  analysis_task_outcomes: [
    'result_set_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  // Revision 21 (Issue #467): the remembered entry position names the Book, its Manuscript, the
  // branch, the Revision it belongs to, and the durable block identity it points at.
  manuscript_entry_positions: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  // Revision 22 (Issue #407): Editorial Marks and the Proposal Change Item ledgers, owned and spelled
  // by `editorial-marks.ts`.
  ...EDITORIAL_MARK_FOREIGN_KEYS,
  ...PROPOSAL_REVIEW_FOREIGN_KEYS,
  // Revision 23 (Issue #408): the Effect ledger of AI7 Apply, owned and spelled by `manuscript-apply.ts`.
  ...MANUSCRIPT_EFFECT_FOREIGN_KEYS,
  // Revision 24 (Issue #417): the Review Run relations, owned and spelled by `review/review-runs.ts`.
  ...REVIEW_RUN_FOREIGN_KEYS,
  ...LOCAL_STAGE_FOREIGN_KEYS,
  ...HOUSE_WORD_LIST_FOREIGN_KEYS,
  // Revision 25 (Issue #414): the Publication Version relations, owned and spelled by `publication-versions.ts`.
  ...PUBLICATION_VERSION_FOREIGN_KEYS,
  // Revision 26 (Issue #57): the proposal-conflict relations, owned and spelled by `proposal-conflicts.ts`.
  ...PROPOSAL_CONFLICT_FOREIGN_KEYS,
  // Revision 27 (Issue #410): the import-retention relations, owned and spelled by `import-retention.ts`.
  ...IMPORT_RETENTION_FOREIGN_KEYS,
  ...WORD_IMPORT_RETENTION_FOREIGN_KEYS,
  // Revision 28 (Issue #411): the staged imported marks, owned and spelled by `imported-marks.ts`.
  ...IMPORTED_MARK_FOREIGN_KEYS,
  // Revision 29 (Issue #413): the export ledger, owned and spelled by `manuscript-export.ts`.
  ...EXPORT_LEDGER_FOREIGN_KEYS,
  // Revision 31 (Issue #421): the default-execution-rule ledger, owned and spelled by `default-execution-rules.ts`.
  ...DEFAULT_EXECUTION_RULE_FOREIGN_KEYS,
  // Revision 33 (Issue #422): the Run's unit checkpoints, owned and spelled by `analysis/run-checkpoints.ts`.
  ...RUN_CHECKPOINT_FOREIGN_KEYS,
  // Revision 35 (Issue #422, S76d): the Run's Clarification Requests and answers, owned by `analysis/clarifications.ts`.
  ...CLARIFICATION_FOREIGN_KEYS,
  // Revision 36 (Issue #412, S63): the chapter-level Reimport Comparison, owned by `reimport-group-ledger.ts`.
  ...REIMPORT_GROUP_FOREIGN_KEYS,
  ...PRODUCTION_DOCUMENT_FOREIGN_KEYS,
  ...PRODUCTION_DOCUMENT_DELIVERY_FOREIGN_KEYS,
  ...BOOK_DELIVERY_PACKAGE_FOREIGN_KEYS,
  ...PRODUCTION_DOCUMENT_WORKFLOW_FOREIGN_KEYS,
  ...BOOK_DELIVERY_PACKAGE_EXPORT_FOREIGN_KEYS,
  ...PRODUCTION_DOCUMENT_ORIGIN_FOREIGN_KEYS,
  ...MAINTENANCE_CASE_FOREIGN_KEYS,
  ...BOOK_PEOPLE_FOREIGN_KEYS,
  ...REVIEW_GUIDELINE_FOREIGN_KEYS,
  ...LIBRARY_MATERIAL_FOREIGN_KEYS,
  ...EVALUATION_RECORD_FOREIGN_KEYS,
  ...ANALYSIS_FEEDBACK_FOREIGN_KEYS,
  ...DECISION_FEEDBACK_FOREIGN_KEYS,
  ...LEARNING_ELIGIBILITY_FOREIGN_KEYS,
  ...EVALUATION_CALIBRATION_FOREIGN_KEYS,
  ...SERIES_FOREIGN_KEYS,
  ...SERIES_KNOWLEDGE_FOREIGN_KEYS,
  ...DATA_VERSION_FOREIGN_KEYS,
  ...DATABASE_EXPORT_FOREIGN_KEYS,
  ...SCHEDULED_BACKUP_FOREIGN_KEYS,
  ...DATABASE_REPLACEMENT_FOREIGN_KEYS,
  ...DATABASE_MERGE_FOREIGN_KEYS,
  ...EVALUATION_INITIAL_DRAFT_FOREIGN_KEYS,
  ...DIALOGUE_FOREIGN_KEYS,
  ...SERIES_RETRIEVAL_EXCLUSION_FOREIGN_KEYS,
  ...READERS_REPORT_FOREIGN_KEYS,
  ...CAPTURED_PROCEDURE_FOREIGN_KEYS,
  ...EVALUATION_REWRITE_FOREIGN_KEYS,
  ...WRITING_TASK_FOREIGN_KEYS,
  ...BACKGROUND_ANALYSIS_ENROLLMENT_FOREIGN_KEYS,
  ...MATERIAL_INDEX_FOREIGN_KEYS,
  ...OUTCOME_RESOLUTION_FOREIGN_KEYS,
  ...IMPORTED_EXEMPLAR_FOREIGN_KEYS,
  ...RESEARCH_EVIDENCE_FOREIGN_KEYS,
  ...MATERIAL_INDEX_LAYER_FOREIGN_KEYS,
  ...MATERIAL_TRANSLATION_ATTEMPT_FOREIGN_KEYS,
  ...FACTUAL_VERIFICATION_FOREIGN_KEYS,
  ...FACTUAL_CLAIM_FOREIGN_KEYS,
  ...HOUSE_REVIEW_PREFERENCE_FOREIGN_KEYS,
  ...EDITORIAL_LEARNING_FOREIGN_KEYS,
  ...SUPERVISION_FOREIGN_KEYS,
  ...TASK_INTENT_DRAFT_FOREIGN_KEYS,
  ...IMPORTED_SKILL_FOREIGN_KEYS,
  ...CUSTOM_ANALYSIS_DIMENSION_FOREIGN_KEYS,
  ...IMPORTED_SKILL_UPDATE_FOREIGN_KEYS,
  ...PROCEDURE_DEFINITION_FOREIGN_KEYS,
  ...EDITABLE_PROCEDURE_FOREIGN_KEYS,
  ...STRUCTURAL_EDIT_FOREIGN_KEYS,
  ...NOTE_BLOCK_FOREIGN_KEYS, ...IMPORT_STRUCTURE_FOREIGN_KEYS,
  ...EVALUATION_PROFILE_FOREIGN_KEYS,
  editorial_workspace_profile_sidecar_revisions: [
    'native_artifact_id>native_artifact_installations.artifact_id:NO ACTION/NO ACTION/NONE',
  ],
  editorial_workspace_profile_book_pins: [
    'book_id>native_artifact_book_enablements.book_id:NO ACTION/NO ACTION/NONE',
    'native_artifact_id>native_artifact_book_enablements.artifact_id:NO ACTION/NO ACTION/NONE',
    'sidecar_id>editorial_workspace_profile_sidecar_revisions.sidecar_id:NO ACTION/NO ACTION/NONE',
    'sidecar_revision>editorial_workspace_profile_sidecar_revisions.revision:NO ACTION/NO ACTION/NONE',
    'sidecar_sha256>editorial_workspace_profile_sidecar_revisions.sha256:NO ACTION/NO ACTION/NONE',
  ],
  native_artifact_book_enablements: [
    'artifact_id>native_artifact_installations.artifact_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
  import_drafts: ['object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE'],
  book_dimension_sets: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  book_dimensions: ['dimension_set_id>book_dimension_sets.dimension_set_id:NO ACTION/NO ACTION/NONE'],
  source_versions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE',
  ],
  source_provenance: ['source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE'],
  source_import_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_comparisons: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE',
    'lineage_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_mappings: [
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE',
    'current_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'current_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lineage_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'lineage_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_mapping_resolutions: [
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE',
    'mapping_id>manuscript_reimport_mappings.mapping_id:NO ACTION/CASCADE/NONE',
    'resolved_current_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/NO ACTION/NONE',
    'degradation_decision_id>import_degradation_decisions.degradation_decision_id:NO ACTION/NO ACTION/NONE',
    'fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE',
    'lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'previous_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'resulting_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_fidelity_reviews: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_fidelity_categories: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  import_degradation_decisions: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  manuscripts: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  manuscript_branches: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_blocks: [
    'created_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  workflow_instances: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'profile_id>workflow_profiles.profile_id:NO ACTION/NO ACTION/NONE',
    'profile_version>workflow_profiles.profile_version:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_import_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'degradation_decision_id>import_degradation_decisions.degradation_decision_id:NO ACTION/NO ACTION/NONE',
    'fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'resulting_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_commits: ['draft_id>import_drafts.draft_id:NO ACTION/NO ACTION/NONE'],
  import_commit_attempts: ['draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE'],
  import_abandonment_cleanup_intents: [
    'draft_id>import_drafts.draft_id:NO ACTION/NO ACTION/NONE',
    'object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE',
  ],
  staged_import_snapshots: ['draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE'],
  staged_import_blocks: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_revisions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'parent_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_block_versions: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  branch_working_state: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  working_blocks: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
  ],
  edit_journal_entries: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_outline: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_command_groups: ['branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE'],
  manuscript_command_edits: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'command_group_id>manuscript_command_groups.command_group_id:NO ACTION/NO ACTION/NONE',
  ],
  milestone_versions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_search_sessions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_search_results: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'search_id>manuscript_search_sessions.search_id:NO ACTION/CASCADE/NONE',
  ],
  manuscript_replacement_previews: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'search_id>manuscript_search_sessions.search_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_replacement_matches: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'preview_id>manuscript_replacement_previews.preview_id:NO ACTION/CASCADE/NONE',
  ],
  milestone_signoff_records: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'workflow_instance_id>workflow_instances.workflow_instance_id:NO ACTION/NO ACTION/NONE',
  ],
  working_offset_nodes: [
    'branch_id>working_blocks.branch_id:NO ACTION/CASCADE/NONE',
    'position>working_blocks.position:NO ACTION/CASCADE/NONE',
  ],
  service_lifetime_branch_writes: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lifetime_id>service_lifetimes.lifetime_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_snapshots: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_attention: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'interrupted_lifetime_id>service_lifetimes.lifetime_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restore_stages: [
    'attention_id>recovery_attention.attention_id:NO ACTION/CASCADE/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restore_stage_blocks: [
    'attention_id>recovery_restore_stages.attention_id:NO ACTION/CASCADE/NONE',
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_decisions: [
    'attention_id>recovery_attention.attention_id:NO ACTION/NO ACTION/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restorations: [
    'attention_id>recovery_attention.attention_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_candidate_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'decision_id>recovery_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'descendant_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'pre_restore_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'snapshot_candidate_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'source_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_recovery_review_status: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'cleared_by_milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'recovered_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'restoration_id>recovery_restorations.restoration_id:NO ACTION/NO ACTION/NONE',
  ],
};
