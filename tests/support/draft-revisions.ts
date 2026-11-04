import type { DatabaseSync } from 'node:sqlite';
import { TASK_INTENT_DRAFT_SCHEMA_SQL, TASK_INTENT_DRAFT_TRIGGER_SQL } from '../../src/service/task-intent-drafts.js';

/** The actual revision-105 draft relations, retaining historical rows and immutable triggers. */
export function asDraftRevision105(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
  try {
    for (const table of ['task_intent_drafts', 'task_intent_draft_versions'] as const) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)).join(', ');
      const previous = TASK_INTENT_DRAFT_SCHEMA_SQL[table].replace(", 'composer-deliverable'", '').replace(", 'deliverable'", '');
      db.exec(`CREATE TEMP TABLE old_${table} AS SELECT rowid AS prior_rowid, * FROM ${table}`);
      db.exec(`DROP TABLE ${table}`); db.exec(previous);
      db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM old_${table} ORDER BY prior_rowid`);
      db.exec(`DROP TABLE old_${table}`);
      for (const op of ['update', 'delete']) db.exec(TASK_INTENT_DRAFT_TRIGGER_SQL[`${table}_no_${op}`]!);
    }
    db.exec('PRAGMA user_version = 105; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
}
