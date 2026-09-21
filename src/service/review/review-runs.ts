import type { DatabaseSync } from 'node:sqlite';

/**
 * Review Runs (Issue #417, plan slice S69; V2-UX-REV-001 to REV-013, MARK-010, FIND-002): one Book-owned
 * execution of Editorial Review over the categories an editor selected and one scope, against an exact
 * Manuscript Revision. A Review Run is a record over several Tasks — one per Task-backed category, each
 * on its own category ledger — plus the model-free leads of 情节逻辑与前后一致, approved in one editor
 * interaction and executed one category after another through the one execution owner.
 *
 * Schema revision 24 carries seven additive relations beside the three kind-coupled analysis relations
 * it rebuilds. Every one of them is append-only — a review record is evidence — and every evidence row
 * carries its canonical JSON and digest:
 *
 * - `review_runs`: the Run as prepared — 第 N 次 of its Book, the manuscript binding, the scope, and the
 *   snapshot of every selected category's configuration entry, basis statement, executor, mode, Task
 *   and plan digest, beside the configuration's digest (REV-012).
 * - `review_run_authorizations`: the editor's one approval, naming the exact plan digest approved for
 *   every Task-backed category.
 * - `review_run_category_events`: what became of each category — dispatched, settled, failed,
 *   interrupted, refused, materialized. A category's state is its last event.
 * - `review_findings`: every located finding of a materialized category, with the Editorial Mark it
 *   became — or `anchor-changed` when the words it points at no longer stand. A finding and its mark
 *   are one record family (MARK-010): the finding's status is derived from the mark and never stored.
 * - `review_finding_dispositions`: 忽略并说明, with its required reason (REV-004).
 * - `quality_signals`: the minimal Quality Signal an ignored finding records (REV-004).
 * - `review_reports`: the versioned 审阅报告 (REV-009).
 *
 * Nothing existing moves (ADR 0079: an additive revision keeps the same Data Version). The relations are
 * created shape-detected in `EditorialStore.open` before `initializeTaskAuthorizationSchema` stamps the
 * version, exactly as revisions 21 to 23 add theirs, and join the exact-schema validator the same way.
 */
export const REVIEW_RUN_SCHEMA_SQL = {
  review_runs: `CREATE TABLE review_runs (
  review_run_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
  working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('whole', 'chapters', 'changed', 'selection')),
  selected_start_position INTEGER CHECK(selected_start_position IS NULL OR selected_start_position >= 1),
  selected_end_position INTEGER CHECK(selected_end_position IS NULL OR selected_end_position >= selected_start_position),
  configuration_digest TEXT NOT NULL CHECK(length(configuration_digest) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((scope_kind IN ('chapters', 'selection')) = (selected_start_position IS NOT NULL)),
  CHECK((selected_start_position IS NULL) = (selected_end_position IS NULL)),
  UNIQUE(book_id, ordinal)
) STRICT`,
  review_run_authorizations: `CREATE TABLE review_run_authorizations (
  review_run_id TEXT PRIMARY KEY REFERENCES review_runs(review_run_id),
  authorized_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
  review_run_category_events: `CREATE TABLE review_run_category_events (
  event_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('dispatched', 'settled', 'failed', 'interrupted', 'refused', 'materialized')),
  detail TEXT NOT NULL CHECK(length(detail) > 0),
  run_record_id TEXT REFERENCES analysis_run_records(run_record_id),
  result_set_revision_id TEXT REFERENCES analysis_result_set_revisions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK(state NOT IN ('dispatched', 'settled') OR run_record_id IS NOT NULL),
  CHECK(state NOT IN ('settled', 'materialized') OR result_set_revision_id IS NOT NULL),
  UNIQUE(review_run_id, category_id, sequence)
) STRICT`,
  review_findings: `CREATE TABLE review_findings (
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  finding_id TEXT NOT NULL CHECK(length(finding_id) = 28 AND substr(finding_id, 1, 4) = 'rvf_'),
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind_ref TEXT NOT NULL CHECK(length(kind_ref) BETWEEN 1 AND 64),
  severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'note')),
  output TEXT NOT NULL CHECK(output IN ('change-suggestion', 'annotation')),
  risk_point INTEGER NOT NULL CHECK(risk_point IN (0, 1)),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
  quote TEXT NOT NULL CHECK(length(quote) > 0),
  note TEXT NOT NULL CHECK(length(note) > 0),
  replacement TEXT,
  clause_ref TEXT,
  state_line TEXT,
  mark_id TEXT UNIQUE REFERENCES editorial_marks(mark_id),
  anchor TEXT NOT NULL CHECK(anchor IN ('marked', 'anchor-changed')),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((anchor = 'marked') = (mark_id IS NOT NULL)),
  CHECK((output = 'change-suggestion') = (replacement IS NOT NULL)),
  CHECK(risk_point = 0 OR output = 'annotation'),
  PRIMARY KEY(review_run_id, finding_id),
  UNIQUE(review_run_id, ordinal)
) STRICT`,
  review_finding_dispositions: `CREATE TABLE review_finding_dispositions (
  disposition_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  disposition TEXT NOT NULL CHECK(disposition = 'ignored'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  FOREIGN KEY(review_run_id, finding_id) REFERENCES review_findings(review_run_id, finding_id),
  UNIQUE(review_run_id, finding_id, ordinal)
) STRICT`,
  quality_signals: `CREATE TABLE quality_signals (
  signal_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  kind TEXT NOT NULL CHECK(kind = 'review-finding-ignored'),
  review_run_id TEXT NOT NULL,
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  finding_id TEXT NOT NULL,
  disposition_id TEXT NOT NULL UNIQUE REFERENCES review_finding_dispositions(disposition_id),
  mark_id TEXT REFERENCES editorial_marks(mark_id),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  FOREIGN KEY(review_run_id, finding_id) REFERENCES review_findings(review_run_id, finding_id)
) STRICT`,
  review_reports: `CREATE TABLE review_reports (
  report_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  generated_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(review_run_id, version)
) STRICT`,
} as const;

/** Every Review Run relation is a ledger: a row is appended once and never rewritten or removed. */
export const REVIEW_RUN_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(REVIEW_RUN_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the seven relations, in the exact-schema validator's own spelling. */
export const REVIEW_RUN_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  review_runs: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'manuscript_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  review_run_authorizations: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
  review_run_category_events: [
    'result_set_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
  ],
  review_findings: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  review_finding_dispositions: [
    'finding_id>review_findings.finding_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_findings.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  quality_signals: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'disposition_id>review_finding_dispositions.disposition_id:NO ACTION/NO ACTION/NONE',
    'finding_id>review_findings.finding_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_findings.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  review_reports: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
};

export class ReviewRunError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReviewRunError';
  }
}

export function requireReview(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ReviewRunError(code, message);
}

/**
 * The seven relations and their ledger triggers. Created once and never rebuilt: a store that predates
 * them gains seven empty relations and nothing existing moves. Like revisions 21 to 23 this runs before
 * the version is stamped in `task-authorization.ts` and is shape-detected, so a store that already has
 * them does no work here. On a store older than revision 15 the analysis relations two of them refer to
 * are created after this, by the version stamp's own migration; SQLite resolves a reference when a row
 * uses it, and no row is written before both exist.
 */
export function initializeReviewRunSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_runs'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(REVIEW_RUN_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(REVIEW_RUN_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  requireReview(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}
