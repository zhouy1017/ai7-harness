import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';
import { canonicalJson } from './analysis/canonical.js';
import type { ConfiguredProviderBinding } from './launch-policy.js';
import { transact } from './analysis/run-state.js';

export const TASK_LAUNCH_SCHEMA_SQL = {
  task_launch_snapshots: `CREATE TABLE task_launch_snapshots (
  client_command_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL,
  task_kind TEXT NOT NULL CHECK(task_kind IN ('review-run', 'baseline-analysis', 'custom-analysis', 'writing', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'scoped-ai-edit')),
  input_digest TEXT NOT NULL CHECK(length(input_digest) = 64),
  run_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
};
export const TASK_LAUNCH_TRIGGER_SQL = Object.fromEntries(['update', 'delete'].map((operation) => [
  `task_launch_snapshots_no_${operation}`,
  `CREATE TRIGGER task_launch_snapshots_no_${operation} BEFORE ${operation.toUpperCase()} ON task_launch_snapshots
    BEGIN SELECT RAISE(ABORT, 'TASK_LAUNCH_IMMUTABLE'); END`,
]));

export function initializeTaskLaunchSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'task_launch_snapshots'").get() !== undefined) return;
  transact(db, () => {
    db.exec(TASK_LAUNCH_SCHEMA_SQL.task_launch_snapshots);
    for (const sql of Object.values(TASK_LAUNCH_TRIGGER_SQL)) db.exec(sql);
  });
}

export type LaunchTaskKind = 'review-run' | 'baseline-analysis' | 'custom-analysis' | 'writing' | 'initial-evaluation' | 'readers-report' | 'evaluation-rewrite' | 'scoped-ai-edit';
export interface LaunchChoice {
  readonly executionConfig: RuntimeExecutionConfig;
  readonly binding: ConfiguredProviderBinding | null;
}

export class TaskLaunchError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The command identity is instance-local. Resolve settings only for a new command, inside its write transaction. */
export function launchFromSnapshot(db: DatabaseSync, command: { clientCommandId: string; bookId: string; kind: LaunchTaskKind; input: unknown },
  resolve: () => LaunchChoice, create: (choice: LaunchChoice, snapshotId: string) => { runId: string; manuscript: unknown }): { runId: string; repeated: boolean } {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(command.clientCommandId)) {
    throw new TaskLaunchError('TASK_LAUNCH_COMMAND_INVALID', '任务启动标识无效。');
  }
  const inputDigest = digest(canonicalJson({ bookId: command.bookId, kind: command.kind, input: command.input }));
  return transact(db, () => {
    const existing = db.prepare('SELECT input_digest, run_id FROM task_launch_snapshots WHERE client_command_id = ?').get(command.clientCommandId);
    if (existing !== undefined) {
      if (existing.input_digest !== inputDigest) throw new TaskLaunchError('TASK_LAUNCH_COMMAND_CHANGED', '这次启动标识已用于另一项任务；请重新发起。');
      return { runId: String(existing.run_id), repeated: true };
    }
    const choice = resolve();
    const snapshotId = randomUUID();
    const created = create(choice, snapshotId);
    const createdAt = new Date().toISOString();
    const json = canonicalJson({ schema: 'ai7.task-launch-snapshot/1', snapshotId, clientCommandId: command.clientCommandId,
      bookId: command.bookId, kind: command.kind, inputDigest, ...choice, ...created, createdAt });
    db.prepare('INSERT INTO task_launch_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(command.clientCommandId, snapshotId, command.bookId, command.kind, inputDigest, created.runId, createdAt, json, digest(json));
    return { runId: created.runId, repeated: false };
  });
}
