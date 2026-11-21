import { appendOnly } from '../append-only.js';

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

export const EDITABLE_PROCEDURE_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  procedure_version_origins: 'PROCEDURE_DEFINITION_IMMUTABLE',
  procedure_version_stops: 'PROCEDURE_DEFINITION_IMMUTABLE',
});
