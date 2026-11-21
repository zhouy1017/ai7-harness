import { appendOnly } from '../append-only.js';

/**
 * Revision 101 (Issue #1204; ADR 0096 §1): a fourth block kind, `note`, carries one footnote or endnote of the imported file.
 * Every relation whose block-kind CHECK names the kinds is rebuilt with the widened CHECK, row for row and with its row
 * identities; nothing else in them changes. Two relations are new: which note of the file each staged note block reads, and
 * the same for each committed Revision's note blocks — the part, the note's own identifier, its number there and the body
 * block that refers to it — which export uses to restore the note into its own part.
 */
export const NOTE_BLOCK_KIND_TABLES = [
  'import_ingest_blocks',
  'staged_import_blocks',
  'manuscript_block_versions',
  'working_blocks',
  'recovery_restore_stage_blocks',
  'manuscript_reimport_mappings',
] as const;

const BLOCK_KINDS = /IN\s*\(\s*'title'\s*,\s*'heading'\s*,\s*'paragraph'\s*\)/gu;
const WIDENED_BLOCK_KINDS = "IN ('title', 'heading', 'paragraph', 'note')";

/** A relation's text with every block-kind CHECK widened to the note kind. */
export function widenBlockKinds<T extends string | ReadonlyArray<string>>(sql: T): T {
  return (typeof sql === 'string' ? sql.replace(BLOCK_KINDS, WIDENED_BLOCK_KINDS) : sql.map((entry) => entry.replace(BLOCK_KINDS, WIDENED_BLOCK_KINDS))) as T;
}

export const NOTE_BLOCK_SCHEMA_SQL = {
  staged_import_note_sources: `CREATE TABLE staged_import_note_sources (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    note_part TEXT NOT NULL CHECK(note_part IN ('footnote', 'endnote')),
    note_id TEXT NOT NULL,
    note_ordinal INTEGER NOT NULL CHECK(note_ordinal > 0),
    reference_position INTEGER CHECK(reference_position IS NULL OR reference_position > 0),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, note_part, note_id)
  ) STRICT`,
  manuscript_note_sources: `CREATE TABLE manuscript_note_sources (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    note_part TEXT NOT NULL CHECK(note_part IN ('footnote', 'endnote')),
    note_id TEXT NOT NULL,
    note_ordinal INTEGER NOT NULL CHECK(note_ordinal > 0),
    reference_block_id TEXT REFERENCES manuscript_blocks(block_id),
    source_note_digest TEXT NOT NULL CHECK(length(source_note_digest) = 64),
    created_at TEXT NOT NULL,
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, note_part, note_id)
  ) STRICT`,
} as const;

/** A committed note source is a record of the import that made it: appended once, never rewritten. */
export const NOTE_BLOCK_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  manuscript_note_sources: 'IMPORT_RETENTION_RECORD_IMMUTABLE',
});
