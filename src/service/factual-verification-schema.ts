/**
 * Schema revision 78's relations (Issue #901; V2-UX-FREV-001, FREV-006, CORR-011, EASSURE-002): the DDL, triggers and foreign
 * keys of factual verification, kept apart from its ledger and free of imports so that every schema owner that validates the
 * whole store can read them at load. `factual-verification.ts` owns the rows. All four relations are append-only: a later
 * result is a new version, a later decision is a new row, and nothing is ever rewritten.
 */
const LEVELS = "('quick', 'standard', 'strict')";
const OUTCOMES = "('待核查', '证据支持', '疑似错误', '证据不足', '证据冲突', '无法核实')";

/** Revision 97: frozen membership, exact sessions and append-only reservations/results in the factual owner. */
export const FACTUAL_CLAIM_SCHEMA_SQL: Readonly<Record<string, string>> = {
  factual_claim_ledgers: `CREATE TABLE factual_claim_ledgers (
  run_record_id TEXT PRIMARY KEY REFERENCES analysis_run_records(run_record_id),
  ledger_digest TEXT NOT NULL CHECK(length(ledger_digest) = 64),
  canonical_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT`,
  factual_claim_sessions: `CREATE TABLE factual_claim_sessions (
  session_id TEXT PRIMARY KEY,
  run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
  stage TEXT NOT NULL CHECK(stage IN ('claim-extraction', 'web-verification')),
  scope_id TEXT NOT NULL,
  ledger_digest TEXT CHECK(ledger_digest IS NULL OR length(ledger_digest) = 64),
  model_limit INTEGER NOT NULL CHECK(model_limit BETWEEN 1 AND 129),
  tool_limit INTEGER NOT NULL CHECK(tool_limit BETWEEN 0 AND 128),
  search_limit INTEGER NOT NULL CHECK(search_limit BETWEEN 0 AND 3),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(run_record_id, stage, scope_id),
  CHECK((stage = 'claim-extraction' AND ledger_digest IS NULL AND model_limit = 1 AND tool_limit = 0 AND search_limit = 0)
    OR (stage = 'web-verification' AND ledger_digest IS NOT NULL))
) STRICT`,
  factual_claim_events: `CREATE TABLE factual_claim_events (
  session_id TEXT NOT NULL REFERENCES factual_claim_sessions(session_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('model', 'tool', 'search', 'search-result', 'verification-result', 'source-exclusion')),
  identity TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(session_id, sequence),
  UNIQUE(session_id, kind, identity)
) STRICT`,
};

export const FACTUAL_CLAIM_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(FACTUAL_CLAIM_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((action) =>
    [`${table}_no_${action}`, `CREATE TRIGGER ${table}_no_${action} BEFORE ${action.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'FACTUAL_VERIFICATION_LEDGER_IMMUTABLE'); END`])),
);

export const FACTUAL_CLAIM_FOREIGN_KEYS: Readonly<Record<string, readonly string[]>> = {
  factual_claim_ledgers: ['run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE'],
  factual_claim_sessions: ['run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE'],
  factual_claim_events: ['session_id>factual_claim_sessions.session_id:NO ACTION/NO ACTION/NONE'],
};

export const FACTUAL_VERIFICATION_SCHEMA_SQL = {
  factual_run_assurance: `CREATE TABLE factual_run_assurance (
  run_record_id TEXT PRIMARY KEY REFERENCES analysis_run_records(run_record_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  planned_level TEXT NOT NULL CHECK(planned_level IN ${LEVELS}),
  effective_level TEXT NOT NULL CHECK(effective_level IN ${LEVELS}),
  contract_level TEXT CHECK(contract_level IS NULL OR contract_level IN ${LEVELS}),
  disclosure TEXT CHECK(disclosure IS NULL OR disclosure = '已自动降为快速整理：未联网'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK(effective_level = planned_level OR effective_level = 'quick'),
  CHECK((disclosure IS NULL) = (effective_level = planned_level))
) STRICT`,
  factual_verification_results: `CREATE TABLE factual_verification_results (
  result_id TEXT PRIMARY KEY CHECK(length(result_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  assertion_key TEXT NOT NULL CHECK(length(assertion_key) = 64),
  version INTEGER NOT NULL CHECK(version >= 1),
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  review_finding_id TEXT NOT NULL CHECK(length(review_finding_id) = 28 AND substr(review_finding_id, 1, 4) = 'rvf_'),
  finding_id TEXT NOT NULL CHECK(length(finding_id) = 28 AND substr(finding_id, 1, 4) = 'fnd_'),
  run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
  revision_id TEXT NOT NULL REFERENCES analysis_result_set_revisions(revision_id),
  manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
  level TEXT NOT NULL CHECK(level IN ${LEVELS}),
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256) = 64),
  reference_integrity TEXT NOT NULL CHECK(reference_integrity IN ('verified', 'failed')),
  claim_support TEXT NOT NULL CHECK(claim_support IN ('未核查', '成立', '不成立', '冲突', '不适用')),
  factual_verification TEXT NOT NULL CHECK(factual_verification IN ${OUTCOMES}),
  producer TEXT NOT NULL CHECK(length(producer) BETWEEN 1 AND 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK(level <> 'quick' OR (factual_verification = '待核查' AND claim_support = '未核查')),
  UNIQUE(assertion_key, version),
  UNIQUE(run_record_id, finding_id)
) STRICT`,
  factual_review_decisions: `CREATE TABLE factual_review_decisions (
  decision_id TEXT PRIMARY KEY CHECK(length(decision_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  result_id TEXT NOT NULL REFERENCES factual_verification_results(result_id),
  bound_version INTEGER NOT NULL CHECK(bound_version >= 1),
  disposition TEXT NOT NULL CHECK(disposition IN ('accept', 'request-evidence', 'keep-pending', 'decline', 'own-words')),
  own_words TEXT CHECK(own_words IS NULL OR length(own_words) BETWEEN 1 AND 500),
  reason_state TEXT CHECK(reason_state IS NULL OR reason_state IN ('selected', 'corrected', 'replaced')),
  reason_text TEXT CHECK(reason_text IS NULL OR length(reason_text) BETWEEN 1 AND 500),
  requested_level TEXT CHECK(requested_level IS NULL OR requested_level IN ${LEVELS}),
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((disposition = 'own-words') = (own_words IS NOT NULL)),
  CHECK((reason_state IS NULL) = (reason_text IS NULL)),
  CHECK((disposition = 'request-evidence') = (requested_level IS NOT NULL))
) STRICT`,
  correction_proposals: `CREATE TABLE correction_proposals (
  mark_id TEXT PRIMARY KEY REFERENCES editorial_marks(mark_id),
  proposal_id TEXT NOT NULL CHECK(length(proposal_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  result_id TEXT NOT NULL REFERENCES factual_verification_results(result_id),
  result_version INTEGER NOT NULL CHECK(result_version >= 1),
  decision_id TEXT REFERENCES factual_review_decisions(decision_id),
  finding_id TEXT NOT NULL CHECK(length(finding_id) = 28 AND substr(finding_id, 1, 4) = 'fnd_'),
  level TEXT NOT NULL CHECK(level IN ${LEVELS}),
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256) = 64),
  assurance_incomplete INTEGER NOT NULL CHECK(assurance_incomplete IN (0, 1)),
  variant TEXT NOT NULL CHECK(variant IN ('own-edit', 'v1', 'v2', 'v3')),
  range_ordinal INTEGER NOT NULL CHECK(range_ordinal >= 1),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK(level <> 'quick' OR assurance_incomplete = 1),
  UNIQUE(proposal_id, range_ordinal)
) STRICT`,
} as const;

export const FACTUAL_VERIFICATION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(FACTUAL_VERIFICATION_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'FACTUAL_VERIFICATION_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'FACTUAL_VERIFICATION_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const FACTUAL_VERIFICATION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  factual_run_assurance: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  factual_verification_results: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'manuscript_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
    'revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
  ],
  factual_review_decisions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'result_id>factual_verification_results.result_id:NO ACTION/NO ACTION/NONE',
  ],
  correction_proposals: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'decision_id>factual_review_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'result_id>factual_verification_results.result_id:NO ACTION/NO ACTION/NONE',
  ],
};
