import type { DatabaseSync } from 'node:sqlite';

// External-owner stubs — not schema or provenance proofs.
// Only the columns consumed by these cases are projected; the service guard checks
// their declared types, NOT NULL, primary keys and retained unique-key roles.
export const MEMORY_SOURCE_PROJECTION_SQL = {
  books: `CREATE TABLE books (
  book_id TEXT NOT NULL,
  stable_identity TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (book_id),
  UNIQUE (stable_identity)
) STRICT`,
  review_runs: `CREATE TABLE review_runs (
  review_run_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  PRIMARY KEY (review_run_id)
) STRICT`,
  analysis_task_intents: `CREATE TABLE analysis_task_intents (
  task_intent_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (task_intent_id)
) STRICT`,
  editorial_marks: `CREATE TABLE editorial_marks (
  mark_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  manuscript_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  status TEXT NOT NULL,
  anchor_state TEXT NOT NULL,
  source_task_id TEXT,
  source_label TEXT,
  from_grapheme INTEGER NOT NULL,
  to_grapheme INTEGER NOT NULL,
  PRIMARY KEY (mark_id),
  UNIQUE (branch_id, block_id, mark_id)
) STRICT`,
  proposal_change_items: `CREATE TABLE proposal_change_items (
  item_id TEXT NOT NULL,
  mark_id TEXT NOT NULL,
  current_text TEXT NOT NULL,
  proposed_text TEXT NOT NULL,
  PRIMARY KEY (item_id),
  UNIQUE (mark_id)
) STRICT`,
  proposal_item_decisions: `CREATE TABLE proposal_item_decisions (
  decision_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  disposition TEXT NOT NULL,
  edited_text TEXT,
  decided_revision_id TEXT NOT NULL,
  decided_journal_sequence INTEGER NOT NULL,
  decided_block_digest TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (decision_id),
  UNIQUE (item_id, ordinal)
) STRICT`,
  proposal_decision_reasons: `CREATE TABLE proposal_decision_reasons (
  decision_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  reason_source TEXT NOT NULL,
  PRIMARY KEY (decision_id)
) STRICT`,
  proposal_conflict_outcomes: `CREATE TABLE proposal_conflict_outcomes (
  outcome_id TEXT NOT NULL,
  decision_id TEXT,
  PRIMARY KEY (outcome_id)
) STRICT`,
  review_findings: `CREATE TABLE review_findings (
  review_run_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  mark_id TEXT,
  category_id TEXT NOT NULL,
  output TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (review_run_id, finding_id)
) STRICT`,
  analysis_result_set_revisions: `CREATE TABLE analysis_result_set_revisions (
  revision_id TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (revision_id),
  UNIQUE (sha256)
) STRICT`,
  review_run_category_events: `CREATE TABLE review_run_category_events (
  event_id TEXT NOT NULL,
  review_run_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  state TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  result_set_revision_id TEXT,
  PRIMARY KEY (event_id),
  UNIQUE (review_run_id, category_id, sequence)
) STRICT`,
  quality_signals: `CREATE TABLE quality_signals (
  signal_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  review_run_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  disposition_id TEXT NOT NULL,
  PRIMARY KEY (signal_id),
  UNIQUE (disposition_id)
) STRICT`,
  word_tracked_edit_samples: `CREATE TABLE word_tracked_edit_samples (
  sample_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (sample_id)
) STRICT`,
  procedure_definitions: `CREATE TABLE procedure_definitions (
  procedure_id TEXT NOT NULL,
  pre_installed INTEGER NOT NULL,
  PRIMARY KEY (procedure_id)
) STRICT`,
  dialogue_tasks: `CREATE TABLE dialogue_tasks (
  dialogue_id TEXT NOT NULL,
  PRIMARY KEY (dialogue_id)
) STRICT`,
  manuscript_effect_targets: `CREATE TABLE manuscript_effect_targets (
  effect_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  decision_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  PRIMARY KEY (effect_id, ordinal)
) STRICT`,
  manuscript_effect_intents: `CREATE TABLE manuscript_effect_intents (
  effect_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  reverses_effect_id TEXT,
  kind TEXT NOT NULL,
  base_journal_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (effect_id)
) STRICT`,
  manuscript_effect_approvals: `CREATE TABLE manuscript_effect_approvals (
  approval_id TEXT NOT NULL,
  effect_id TEXT NOT NULL UNIQUE,
  interaction TEXT NOT NULL,
  PRIMARY KEY (approval_id)
) STRICT`,
  manuscript_effect_receipts: `CREATE TABLE manuscript_effect_receipts (
  receipt_id TEXT NOT NULL,
  effect_id TEXT NOT NULL,
  resulting_journal_sequence INTEGER NOT NULL,
  receipt_digest TEXT NOT NULL,
  PRIMARY KEY (receipt_id),
  UNIQUE (effect_id)
) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
  branch_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (branch_id, block_id)
) STRICT`,
  review_finding_dispositions: `CREATE TABLE review_finding_dispositions (
  disposition_id TEXT NOT NULL,
  review_run_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  disposition TEXT NOT NULL,
  PRIMARY KEY (disposition_id)
) STRICT`,
} as const;

export function initializeMemorySourceProjections(db: DatabaseSync): void {
  for (const [name, sql] of Object.entries(MEMORY_SOURCE_PROJECTION_SQL)) {
    if (name !== 'books') db.exec(sql);
  }
}
