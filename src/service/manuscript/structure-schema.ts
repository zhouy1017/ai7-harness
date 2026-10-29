import type { DatabaseSync } from 'node:sqlite';

/**
 * Revision 102 (Issue #1205; ADR 0096 §2): candidate structure and long paragraphs on import. Three relations are new and nothing
 * already written changes. A staged draft records the pieces each over-bound paragraph was split into when it was read — which
 * paragraph of the file, the piece's place in it, how it joins the piece before it, and on the first piece the whole paragraph's
 * digest — and the structure its review was formed with: the confirmed headings with their levels, and the one choice for the
 * paragraphs cut at the bound. A committed Revision records the lineage of every block an import split out of one paragraph. That
 * lineage needs no command group: the import made it, and 撤销 never steps over it.
 */
export const IMPORT_STRUCTURE_SCHEMA_SQL = {
  staged_import_paragraph_pieces: `CREATE TABLE staged_import_paragraph_pieces (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
    piece_ordinal INTEGER NOT NULL CHECK(piece_ordinal > 0),
    joint TEXT CHECK(joint IS NULL OR joint IN ('soft-break', 'bound')),
    source_paragraph_digest TEXT CHECK(source_paragraph_digest IS NULL OR length(source_paragraph_digest) = 64),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, source_paragraph_index, piece_ordinal),
    CHECK((piece_ordinal = 1) = (joint IS NULL)),
    CHECK((piece_ordinal = 1) = (source_paragraph_digest IS NOT NULL))
  ) STRICT`,
  staged_import_structure_choices: `CREATE TABLE staged_import_structure_choices (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    choice_key TEXT NOT NULL CHECK(choice_key IN ('heading', 'long-paragraphs')),
    position INTEGER NOT NULL CHECK(position >= 0),
    level INTEGER CHECK(level IS NULL OR level BETWEEN 1 AND 6),
    method TEXT CHECK(method IS NULL OR method IN ('sentences', 'blocks')),
    PRIMARY KEY(draft_id, choice_key, position),
    CHECK((choice_key = 'heading') = (level IS NOT NULL AND method IS NULL AND position > 0)),
    CHECK((choice_key = 'long-paragraphs') = (method IS NOT NULL AND level IS NULL AND position = 0))
  ) STRICT`,
  manuscript_import_lineage: `CREATE TABLE manuscript_import_lineage (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    first_block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
    piece_ordinal INTEGER NOT NULL CHECK(piece_ordinal > 0),
    piece_count INTEGER NOT NULL CHECK(piece_count > 1 AND piece_ordinal <= piece_count),
    method TEXT NOT NULL CHECK(method IN ('soft-break', 'sentences', 'blocks')),
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, source_paragraph_index, piece_ordinal),
    CHECK((piece_ordinal = 1) = (block_id = first_block_id))
  ) STRICT`,
} as const;

export const IMPORT_STRUCTURE_FOREIGN_KEYS = {
  staged_import_paragraph_pieces: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  staged_import_structure_choices: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_import_lineage: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'first_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
} as const;

/** Committed lineage is a record of the import that made it: appended once, never rewritten. */
export const IMPORT_STRUCTURE_TRIGGER_SQL: Readonly<Record<string, string>> = {
  manuscript_import_lineage_no_update: `CREATE TRIGGER manuscript_import_lineage_no_update
    BEFORE UPDATE ON manuscript_import_lineage
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`,
  manuscript_import_lineage_no_delete: `CREATE TRIGGER manuscript_import_lineage_no_delete
    BEFORE DELETE ON manuscript_import_lineage
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`,
};

export function hasImportStructureSchema(db: DatabaseSync): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_import_lineage'").get() !== undefined;
}

/** Revision 102's step: the three relations and the lineage triggers, in one transaction. */
export function initializeImportStructureSchema(db: DatabaseSync): void {
  if (hasImportStructureSchema(db)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(IMPORT_STRUCTURE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(IMPORT_STRUCTURE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
