import { BASELINE_ANALYSIS_CONTRACT_VERSION, BASELINE_ANALYSIS_KIND } from './identity.js';

/**
 * Additive immutable relations of the covered-analysis owner inside the Book authority database:
 * one stable Book-bound Result Set identity per analysis kind, its immutable write-on-update
 * revisions, and the typed per-unit results each revision closed or recorded as a gap. They are
 * installed by the task-ledger schema revision 15 and never rewritten; `analysis_task_outcomes`
 * references a revision, so these relations are created before it.
 */
export const ANALYSIS_RESULT_SET_SCHEMA_SQL = {
  analysis_result_sets: `CREATE TABLE analysis_result_sets (
    result_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind = '${BASELINE_ANALYSIS_KIND}'),
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
    contract_version TEXT NOT NULL CHECK(contract_version = '${BASELINE_ANALYSIS_CONTRACT_VERSION}'),
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
