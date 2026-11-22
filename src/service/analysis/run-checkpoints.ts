import { appendOnly } from '../append-only.js';

/**
 * The continuation point of a Run (Issue #422, plan slice S76b; V2-UX-CTRL-001, CTRL-002, CONT-014, CONT-015).
 * Schema revision 33 adds one append-only relation: each unit a Run submitted keeps its result — closed or a
 * gap — the moment it settles, in exactly the form its Result Set Revision will hold it, with what the Run
 * observed while it settled. A Run that pauses, or that AI7 stopped under, therefore keeps what it read; 续行 goes
 * on from the next unit in the same Run, and a cancellation of a stopped Run still forms its partial revision.
 *
 * A checkpoint is never the analysis itself: the Result Set Revision is, once the Run ends. Checkpoints are the
 * Run's own record of progress, like its spans, and nothing reads them as a result.
 */
export const RUN_CHECKPOINT_SCHEMA_SQL = {
  analysis_unit_checkpoints: `CREATE TABLE analysis_unit_checkpoints (
  run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
  unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
  state TEXT NOT NULL CHECK(state IN ('closed', 'gap')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(run_record_id, unit_ordinal)
) STRICT`,
} as const;

/** A checkpoint is appended once and never rewritten or removed, like every ledger row. */
export const RUN_CHECKPOINT_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  analysis_unit_checkpoints: 'TASK_LEDGER_IMMUTABLE',
});

export class RunCheckpointSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RunCheckpointSchemaError';
  }
}
