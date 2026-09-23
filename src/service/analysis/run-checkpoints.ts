import type { DatabaseSync } from 'node:sqlite';

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
export const RUN_CHECKPOINT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(RUN_CHECKPOINT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign key of the relation, in the exact-schema validator's own spelling. */
export const RUN_CHECKPOINT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  analysis_unit_checkpoints: ['run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE'],
};

export class RunCheckpointSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RunCheckpointSchemaError';
  }
}

/**
 * Revision 33's relation and its ledger triggers, created once and never rebuilt: a store that predates it gains one
 * empty relation and nothing existing moves. Shape-detected like revisions 21 to 31, and run before the version is
 * stamped in `task-authorization.ts`.
 */
export function initializeRunCheckpointSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'analysis_unit_checkpoints'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(RUN_CHECKPOINT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(RUN_CHECKPOINT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Run checkpoint schema rollback failed.');
    }
    throw error;
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new RunCheckpointSchemaError('SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
  }
}
