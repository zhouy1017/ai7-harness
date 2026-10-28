import type { DatabaseSync } from 'node:sqlite';

/** Revision 99's text of the two command relations revision 100 rebuilds (Issue #1175). */
const REVISION_99_COMMAND_SQL = {
  manuscript_command_groups: `CREATE TABLE manuscript_command_groups (
    command_group_id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement')),
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
    PRIMARY KEY(command_group_id, position),
    UNIQUE(command_group_id, block_id)
  ) STRICT`,
} as const;

/**
 * A genuine revision-99 store from a current one whose history holds only text edits and replacements (#1175): the two command
 * relations rebuilt with revision 99's text and the same rows in the same order, without the lineage relation revision 100 adds.
 */
export function asRevision99(db: DatabaseSync): void {
  const structural = db.prepare("SELECT count(*) total FROM manuscript_command_groups WHERE kind NOT IN ('edit', 'replacement')").get();
  if (Number(structural?.total) !== 0) throw new Error('a revision-99 store holds no structural or Apply command');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DROP TABLE manuscript_block_lineage');
  for (const table of ['manuscript_command_groups', 'manuscript_command_edits'] as const) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name))
      .filter((column) => column !== 'before_present' && column !== 'after_present').join(', ');
    db.exec(`CREATE TEMP TABLE kept_${table} AS SELECT rowid AS prior_rowid, ${columns} FROM ${table} ORDER BY rowid; DROP TABLE ${table}`);
    db.exec(REVISION_99_COMMAND_SQL[table]);
    db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM kept_${table} ORDER BY prior_rowid; DROP TABLE kept_${table}`);
  }
  db.exec('CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal)');
  db.exec('PRAGMA user_version = 99');
}
