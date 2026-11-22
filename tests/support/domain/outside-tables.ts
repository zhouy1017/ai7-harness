import type { DatabaseSync } from 'node:sqlite';

// External-owner stubs — not a schema or provenance proof. The Book, its Manuscripts and the publication designations belong
// to other owners; the evaluation and derivative-document readers consume only the columns declared here, each declared with
// the type, NOT NULL and key the owner's relation has. The service parity case (`evaluation-domain-schema.test.ts`) checks every
// column against an opened store. Foreign keys are not declared: the suites seed minimal rows.
export const OUTSIDE_OWNER_TABLES_SQL = {
  books: 'CREATE TABLE books(book_id TEXT PRIMARY KEY, stable_identity TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL) STRICT',
  source_versions: `CREATE TABLE source_versions(source_version_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, object_digest TEXT NOT NULL,
    source_digest TEXT NOT NULL, content_digest TEXT, structure_digest TEXT, parser_identity TEXT, format TEXT NOT NULL, display_name TEXT NOT NULL,
    created_at TEXT NOT NULL, working_object_digest TEXT, UNIQUE(book_id, source_digest)) STRICT`,
  source_import_records: 'CREATE TABLE source_import_records(source_import_record_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, source_version_id TEXT NOT NULL) STRICT',
  manuscripts: 'CREATE TABLE manuscripts(manuscript_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL) STRICT',
  manuscript_branches: `CREATE TABLE manuscript_branches(branch_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL, name TEXT NOT NULL,
    base_revision_id TEXT, created_at TEXT NOT NULL, UNIQUE(manuscript_id, name)) STRICT`,
  manuscript_revisions: `CREATE TABLE manuscript_revisions(revision_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL, revision_label TEXT NOT NULL, parent_revision_id TEXT, source_version_id TEXT NOT NULL, revision_digest TEXT NOT NULL,
    created_at TEXT NOT NULL, UNIQUE(manuscript_id, ordinal), UNIQUE(manuscript_id, revision_label)) STRICT`,
  manuscript_blocks: 'CREATE TABLE manuscript_blocks(block_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL, created_revision_id TEXT NOT NULL) STRICT',
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions(revision_id TEXT NOT NULL, block_id TEXT NOT NULL, position INTEGER NOT NULL,
    kind TEXT NOT NULL, level INTEGER, text TEXT NOT NULL, digest TEXT NOT NULL, start_offset INTEGER NOT NULL, grapheme_length INTEGER NOT NULL,
    PRIMARY KEY(revision_id, block_id), UNIQUE(revision_id, position)) STRICT`,
  working_blocks: `CREATE TABLE working_blocks(branch_id TEXT NOT NULL, block_id TEXT NOT NULL, order_key INTEGER NOT NULL, kind TEXT NOT NULL,
    level INTEGER, text TEXT NOT NULL, digest TEXT NOT NULL, grapheme_length INTEGER NOT NULL, PRIMARY KEY(branch_id, block_id), UNIQUE(branch_id, order_key)) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state(branch_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL, base_revision_id TEXT NOT NULL,
    journal_sequence INTEGER NOT NULL, working_digest TEXT NOT NULL, total_graphemes INTEGER NOT NULL, history_sequence INTEGER NOT NULL,
    last_checkpoint_sequence INTEGER NOT NULL) STRICT`,
  edit_journal_entries: 'CREATE TABLE edit_journal_entries(journal_entry_id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, durable_at TEXT NOT NULL) STRICT',
  editorial_marks: 'CREATE TABLE editorial_marks(mark_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL, branch_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL) STRICT',
  publication_versions: `CREATE TABLE publication_versions(publication_version_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
    created_at TEXT NOT NULL, UNIQUE(book_id, ordinal)) STRICT`,
} as const;

export function initializeOutsideOwnerTables(db: DatabaseSync): void {
  for (const sql of Object.values(OUTSIDE_OWNER_TABLES_SQL)) db.exec(sql);
}
