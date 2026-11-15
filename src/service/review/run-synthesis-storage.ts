import type { DatabaseSync } from 'node:sqlite';

/** Editorial content belongs to the Book; deletion and transfer must remain possible. */
export const RUN_SYNTHESIS_SCHEMA_SQL = {
  review_run_synthesis: `CREATE TABLE review_run_synthesis (
  review_run_id TEXT PRIMARY KEY REFERENCES review_runs(review_run_id),
  synthesis_key TEXT NOT NULL UNIQUE,
  prior_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(prior_input_tokens >= 0),
  prior_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(prior_output_tokens >= 0),
  input_json TEXT,
  input_digest TEXT CHECK(input_digest IS NULL OR length(input_digest) = 64),
  summary_json TEXT,
  summary_digest TEXT CHECK(summary_digest IS NULL OR length(summary_digest) = 64),
  CHECK((summary_json IS NULL) = (summary_digest IS NULL)),
  CHECK((input_json IS NULL) = (input_digest IS NULL))
) STRICT`,
};

export function initializeRunSynthesisSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_run_synthesis'").get() === undefined) {
    db.exec(RUN_SYNTHESIS_SCHEMA_SQL.review_run_synthesis);
  }
}
