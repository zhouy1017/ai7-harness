import type { DatabaseSync } from 'node:sqlite';

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

/** The expected text of every relation revision 101 widens, from the text each had before it. */
export function widenedBlockKindTables(expected: Readonly<Record<string, string | ReadonlyArray<string>>>): Record<string, string | ReadonlyArray<string>> {
  return Object.fromEntries(NOTE_BLOCK_KIND_TABLES.map((table) => [table, widenBlockKinds(expected[table]!)]));
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

export const NOTE_BLOCK_FOREIGN_KEYS = {
  staged_import_note_sources: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_note_sources: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'reference_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
} as const;

/** A committed note source is a record of the import that made it: appended once, never rewritten. */
export const NOTE_BLOCK_TRIGGER_SQL: Readonly<Record<string, string>> = {
  manuscript_note_sources_no_update: `CREATE TRIGGER manuscript_note_sources_no_update
    BEFORE UPDATE ON manuscript_note_sources
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`,
  manuscript_note_sources_no_delete: `CREATE TRIGGER manuscript_note_sources_no_delete
    BEFORE DELETE ON manuscript_note_sources
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`,
};

/** Whether this store holds revision 101's relations: the note sources are created in the transaction that widens the others. */
export function hasNoteBlockSchema(db: DatabaseSync): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_note_sources'").get() !== undefined;
}

/**
 * Revision 101's step: each relation that names the block kinds rebuilt with its rows, row identities, indexes and triggers, and
 * the two note-source relations beside them, in one transaction. Only the rebuilt relations' references are checked.
 */
export function initializeNoteBlockSchema(db: DatabaseSync): void {
  if (hasNoteBlockSchema(db)) return;
  const foreignKeys = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of NOTE_BLOCK_KIND_TABLES) {
      const sql = String(db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)?.sql ?? '');
      const widened = widenBlockKinds(sql);
      if (widened === sql) throw new Error(`Revision 101 found no block-kind CHECK in ${table}.`);
      const dependents = db.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL ORDER BY type, name")
        .all(table).map((row) => String(row.sql));
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)).join(', ');
      db.exec(`CREATE TEMP TABLE note_block_migration AS SELECT rowid AS prior_rowid, * FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(widened);
      db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM temp.note_block_migration ORDER BY prior_rowid`);
      db.exec('DROP TABLE temp.note_block_migration');
      for (const dependent of dependents) db.exec(dependent);
    }
    for (const sql of Object.values(NOTE_BLOCK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(NOTE_BLOCK_TRIGGER_SQL)) db.exec(sql);
    for (const table of NOTE_BLOCK_KIND_TABLES) {
      if (db.prepare(`PRAGMA foreign_key_check(${table})`).all().length !== 0) throw new Error('Revision 101 block references do not resolve.');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    if (foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  }
}
