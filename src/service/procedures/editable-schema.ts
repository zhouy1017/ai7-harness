import type { DatabaseSync } from 'node:sqlite';
import { migrateProcedurePlanSnapshots } from './definition-store.js';

/** Revision 98 adds lineage and the editor's choices; existing definition/version rows remain unchanged. */
export const EDITABLE_PROCEDURE_SCHEMA_SQL = {
  procedure_version_origins: `CREATE TABLE procedure_version_origins (
  version_id TEXT PRIMARY KEY REFERENCES procedure_definition_versions(version_id),
  executor_kind TEXT NOT NULL,
  base_version_id TEXT NOT NULL,
  base_document_sha256 TEXT NOT NULL CHECK(length(base_document_sha256) = 64),
  source_run_id TEXT
) STRICT`,
  procedure_version_stops: `CREATE TABLE procedure_version_stops (
  version_id TEXT PRIMARY KEY REFERENCES procedure_definition_versions(version_id),
  stopped_at TEXT NOT NULL
) STRICT`,
  procedure_run_choices: `CREATE TABLE procedure_run_choices (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  executor_kind TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES procedure_definition_versions(version_id),
  PRIMARY KEY(book_id, executor_kind)
) STRICT`,
} as const;

export const EDITABLE_PROCEDURE_TRIGGER_SQL = Object.fromEntries(
  ['procedure_version_origins', 'procedure_version_stops'].flatMap((table) => ['update', 'delete'].map((operation) => [
    `${table}_no_${operation}`, `CREATE TRIGGER ${table}_no_${operation} BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'PROCEDURE_DEFINITION_IMMUTABLE'); END`,
  ])),
);

export const EDITABLE_PROCEDURE_FOREIGN_KEYS = {
  procedure_version_origins: ['version_id>procedure_definition_versions.version_id:NO ACTION/NO ACTION/NONE'],
  procedure_version_stops: ['version_id>procedure_definition_versions.version_id:NO ACTION/NO ACTION/NONE'],
  procedure_run_choices: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'version_id>procedure_definition_versions.version_id:NO ACTION/NO ACTION/NONE'],
} as const;

export function initializeEditableProcedureSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'procedure_version_origins'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    migrateProcedurePlanSnapshots(db);
    for (const sql of Object.values(EDITABLE_PROCEDURE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EDITABLE_PROCEDURE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
