import type { DatabaseSync } from 'node:sqlite';

/**
 * Revision 100 (Issue #1175; ADR 0096 §1, ADR 0006): structural edits are ordinary Edit Journal commands. The command group
 * kind widens to `split` and `merge`, and to `apply` — an AI7 Apply, which 撤销 and 重做 step over (UI ADR 0003 keeps its
 * reversal a governed Effect). A member of a structural group states whether its block stood in the working state before and
 * after the command, and every split or merge records the lineage it made: the block split from another, or the block merged
 * into the one that absorbed it. The two command relations are rebuilt with their rows and row identities; the lineage relation
 * is new. Nothing already written is rewritten: every existing member stood on both sides.
 */
export const STRUCTURAL_EDIT_SCHEMA_SQL = {
  manuscript_command_groups: `CREATE TABLE manuscript_command_groups (
    command_group_id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement', 'split', 'merge', 'apply')),
    status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded')),
    source_group_id TEXT,
    before_working_digest TEXT NOT NULL CHECK(length(before_working_digest) = 64),
    after_working_digest TEXT NOT NULL CHECK(length(after_working_digest) = 64),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, ordinal)
  ) STRICT`,
  manuscript_command_edits: `CREATE TABLE manuscript_command_edits (
    command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
    position INTEGER NOT NULL CHECK(position > 0),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    before_text TEXT NOT NULL,
    before_digest TEXT NOT NULL CHECK(length(before_digest) = 64),
    after_text TEXT NOT NULL,
    after_digest TEXT NOT NULL CHECK(length(after_digest) = 64),
    before_present INTEGER NOT NULL DEFAULT 1 CHECK(before_present IN (0, 1)),
    after_present INTEGER NOT NULL DEFAULT 1 CHECK(after_present IN (0, 1)),
    CHECK(before_present = 1 OR after_present = 1),
    PRIMARY KEY(command_group_id, position),
    UNIQUE(command_group_id, block_id)
  ) STRICT`,
  manuscript_block_lineage: `CREATE TABLE manuscript_block_lineage (
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    related_block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    relation TEXT NOT NULL CHECK(relation IN ('split-from', 'merged-into')),
    command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
    CHECK(block_id <> related_block_id),
    PRIMARY KEY(block_id, command_group_id)
  ) STRICT`,
} as const;

export const STRUCTURAL_EDIT_FOREIGN_KEYS = {
  manuscript_block_lineage: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'command_group_id>manuscript_command_groups.command_group_id:NO ACTION/NO ACTION/NONE',
    'related_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
  ],
} as const;

const COMMAND_HISTORY_STATE_INDEX_SQL = 'CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal)';

/** Whether this store holds revision 100's relations: the lineage relation is created in the transaction that rebuilds the other two. */
export function hasStructuralEditSchema(db: DatabaseSync): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_block_lineage'").get() !== undefined;
}

/** Revision 100's step: the two command relations rebuilt row for row, the lineage relation beside them, in one transaction. */
export function initializeStructuralEditSchema(db: DatabaseSync): void {
  if (hasStructuralEditSchema(db)) return;
  const foreignKeys = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of ['manuscript_command_groups', 'manuscript_command_edits'] as const) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)).join(', ');
      db.exec(`CREATE TEMP TABLE structural_edit_migration AS SELECT rowid AS prior_rowid, * FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(STRUCTURAL_EDIT_SCHEMA_SQL[table]);
      db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM temp.structural_edit_migration ORDER BY prior_rowid`);
      db.exec('DROP TABLE temp.structural_edit_migration');
    }
    db.exec(COMMAND_HISTORY_STATE_INDEX_SQL);
    db.exec(STRUCTURAL_EDIT_SCHEMA_SQL.manuscript_block_lineage);
    for (const table of ['manuscript_command_groups', 'manuscript_command_edits']) {
      if (db.prepare(`PRAGMA foreign_key_check(${table})`).all().length !== 0) throw new Error('Revision 100 command history references do not resolve.');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    if (foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  }
}
