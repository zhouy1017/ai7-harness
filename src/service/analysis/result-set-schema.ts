import {
  EDITORIAL_REVIEW_CONTRACT_VERSION,
  EDITORIAL_REVIEW_KIND_PREFIX,
  EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_KIND,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_KIND,
  INITIAL_EVALUATION_CONTRACT_VERSION,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_CONTRACT_VERSION,
  READERS_REPORT_KIND,
} from '../../shared/protocol.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION, BASELINE_ANALYSIS_KIND } from './identity.js';

/**
 * How the durable schema admits the review-category kind family (Issue #417): by the shape of the kind
 * identity, `editorial-review/` followed by a lower-case letter. A Review Category is configuration
 * (V2-UX-REV-002), so no CHECK names one; the full identity pattern is checked where a kind
 * definition is built (`isReviewCategoryId`), and this pattern is what keeps any other kind out.
 */
export const EDITORIAL_REVIEW_KIND_GLOB = `${EDITORIAL_REVIEW_KIND_PREFIX}[a-z]*` as const;

/**
 * Additive immutable relations of the covered-analysis owner inside the Book authority database:
 * one stable Book-bound Result Set identity per analysis kind, its immutable write-on-update
 * revisions, and the typed per-unit results each revision closed or recorded as a gap. They are
 * installed by the task-ledger schema revision 15 and never rewritten; `analysis_task_outcomes`
 * references a revision, so these relations are created before it.
 *
 * The relations were keyed by kind from the start; their CHECKs were not. Schema revision 20 (Issue
 * #53) widens exactly those two CHECKs so a Book may hold the factual-review Result Set beside the
 * baseline one, and the `UNIQUE(book_id, kind)` that has always been here keeps them one apiece.
 * Revision 24 (Issue #417) widens the same two once more, for one Result Set per Review Category:
 * the two literal kinds stand as they were, and the family joins them by pattern. Revision 59 (Issue
 * #429, S81b1) widens them for the evaluation kind, AI7's 初评, one literal kind more, and revision 62 (Issue #429, S81c) for
 * the reader's report kind, 审稿意见, one more; revision 65 (Issue #429, S81b2) for the evaluation rewrite kind, 按我的评分重写评语.
 */
export const ANALYSIS_RESULT_SET_SCHEMA_SQL = {
  analysis_result_sets: `CREATE TABLE analysis_result_sets (
    result_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind IN ('${BASELINE_ANALYSIS_KIND}', '${FACTUAL_REVIEW_KIND}', '${INITIAL_EVALUATION_KIND}', '${READERS_REPORT_KIND}', '${EVALUATION_REWRITE_KIND}') OR kind GLOB '${EDITORIAL_REVIEW_KIND_GLOB}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(book_id, kind)
  ) STRICT`,
  analysis_result_set_revisions: `CREATE TABLE analysis_result_set_revisions (
    revision_id TEXT PRIMARY KEY,
    result_set_id TEXT NOT NULL REFERENCES analysis_result_sets(result_set_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    manuscript_revision_digest TEXT NOT NULL CHECK(length(manuscript_revision_digest) = 64),
    coverage_manifest_sha256 TEXT NOT NULL CHECK(length(coverage_manifest_sha256) = 64),
    contract_version TEXT NOT NULL CHECK(contract_version IN ('${BASELINE_ANALYSIS_CONTRACT_VERSION}', '${FACTUAL_REVIEW_CONTRACT_VERSION}', '${EDITORIAL_REVIEW_CONTRACT_VERSION}', '${INITIAL_EVALUATION_CONTRACT_VERSION}', '${READERS_REPORT_CONTRACT_VERSION}', '${EVALUATION_REWRITE_CONTRACT_VERSION}')),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(result_set_id, ordinal)
  ) STRICT`,
  analysis_unit_results: `CREATE TABLE analysis_unit_results (
    revision_id TEXT NOT NULL REFERENCES analysis_result_set_revisions(revision_id),
    unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
    state TEXT NOT NULL CHECK(state IN ('closed', 'gap')),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    PRIMARY KEY(revision_id, unit_ordinal)
  ) STRICT`,
} as const;

/**
 * The two Result Set relations as revisions 62 and 63 carried them, kept only to validate such a store exactly before revision
 * 65 rebuilds them, and for the migration case.
 */
export const ANALYSIS_RESULT_SET_REVISION_62_SQL = {
  analysis_result_sets: `CREATE TABLE analysis_result_sets (
    result_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind IN ('${BASELINE_ANALYSIS_KIND}', '${FACTUAL_REVIEW_KIND}', '${INITIAL_EVALUATION_KIND}', '${READERS_REPORT_KIND}') OR kind GLOB '${EDITORIAL_REVIEW_KIND_GLOB}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(book_id, kind)
  ) STRICT`,
  analysis_result_set_revisions: `CREATE TABLE analysis_result_set_revisions (
    revision_id TEXT PRIMARY KEY,
    result_set_id TEXT NOT NULL REFERENCES analysis_result_sets(result_set_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    manuscript_revision_digest TEXT NOT NULL CHECK(length(manuscript_revision_digest) = 64),
    coverage_manifest_sha256 TEXT NOT NULL CHECK(length(coverage_manifest_sha256) = 64),
    contract_version TEXT NOT NULL CHECK(contract_version IN ('${BASELINE_ANALYSIS_CONTRACT_VERSION}', '${FACTUAL_REVIEW_CONTRACT_VERSION}', '${EDITORIAL_REVIEW_CONTRACT_VERSION}', '${INITIAL_EVALUATION_CONTRACT_VERSION}', '${READERS_REPORT_CONTRACT_VERSION}')),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(result_set_id, ordinal)
  ) STRICT`,
} as const;

/**
 * The two Result Set relations as revisions 59 to 61 carried them, kept only to validate such a store exactly before revision
 * 62 rebuilds them, and for the migration case.
 */
export const ANALYSIS_RESULT_SET_REVISION_59_SQL = {
  analysis_result_sets: `CREATE TABLE analysis_result_sets (
    result_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind IN ('${BASELINE_ANALYSIS_KIND}', '${FACTUAL_REVIEW_KIND}', '${INITIAL_EVALUATION_KIND}') OR kind GLOB '${EDITORIAL_REVIEW_KIND_GLOB}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(book_id, kind)
  ) STRICT`,
  analysis_result_set_revisions: `CREATE TABLE analysis_result_set_revisions (
    revision_id TEXT PRIMARY KEY,
    result_set_id TEXT NOT NULL REFERENCES analysis_result_sets(result_set_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    manuscript_revision_digest TEXT NOT NULL CHECK(length(manuscript_revision_digest) = 64),
    coverage_manifest_sha256 TEXT NOT NULL CHECK(length(coverage_manifest_sha256) = 64),
    contract_version TEXT NOT NULL CHECK(contract_version IN ('${BASELINE_ANALYSIS_CONTRACT_VERSION}', '${FACTUAL_REVIEW_CONTRACT_VERSION}', '${EDITORIAL_REVIEW_CONTRACT_VERSION}', '${INITIAL_EVALUATION_CONTRACT_VERSION}')),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(result_set_id, ordinal)
  ) STRICT`,
} as const;

/**
 * The two Result Set relations as revisions 24 to 58 carried them, kept only to validate such a store exactly before revision
 * 59 rebuilds them, and for the migration case.
 */
export const ANALYSIS_RESULT_SET_REVISION_58_SQL = {
  analysis_result_sets: `CREATE TABLE analysis_result_sets (
    result_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind IN ('${BASELINE_ANALYSIS_KIND}', '${FACTUAL_REVIEW_KIND}') OR kind GLOB '${EDITORIAL_REVIEW_KIND_GLOB}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(book_id, kind)
  ) STRICT`,
  analysis_result_set_revisions: `CREATE TABLE analysis_result_set_revisions (
    revision_id TEXT PRIMARY KEY,
    result_set_id TEXT NOT NULL REFERENCES analysis_result_sets(result_set_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    manuscript_revision_digest TEXT NOT NULL CHECK(length(manuscript_revision_digest) = 64),
    coverage_manifest_sha256 TEXT NOT NULL CHECK(length(coverage_manifest_sha256) = 64),
    contract_version TEXT NOT NULL CHECK(contract_version IN ('${BASELINE_ANALYSIS_CONTRACT_VERSION}', '${FACTUAL_REVIEW_CONTRACT_VERSION}', '${EDITORIAL_REVIEW_CONTRACT_VERSION}')),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(result_set_id, ordinal)
  ) STRICT`,
} as const;
