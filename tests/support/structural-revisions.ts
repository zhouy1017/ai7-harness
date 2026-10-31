import type { DatabaseSync } from 'node:sqlite';
import { NOTE_BLOCK_KIND_TABLES } from '../../src/service/manuscript/note-schema.js';
import { MODEL_SERVICE_CONNECTION_REVISION_84_SQL } from '../../src/service/model-service-connections.js';
import { DIALOGUE_EXECUTION_BINDINGS_REVISION_72_SQL } from '../../src/service/dialogue/dialogue-ledger.js';

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
  asRevision100(db);
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

/**
 * A genuine revision-100 store from a current one that holds no note block (#1204): every relation revision 101 widened rebuilt
 * with its revision-100 text — the block-kind CHECK without the note kind — and the same rows in the same order, its indexes
 * and triggers as they were, and without the two note-source relations revision 101 adds.
 */
export function asRevision100(db: DatabaseSync): void {
  asRevision101(db);
  for (const table of NOTE_BLOCK_KIND_TABLES) {
    const kinds = table === 'manuscript_reimport_mappings' ? "'note' IN (current_kind, lineage_kind, staged_kind)" : "kind = 'note'";
    if (db.prepare(`SELECT 1 FROM ${table} WHERE ${kinds} LIMIT 1`).get() !== undefined) throw new Error('a revision-100 store holds no note block');
  }
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DROP TABLE manuscript_note_sources; DROP TABLE staged_import_note_sources');
  for (const table of NOTE_BLOCK_KIND_TABLES) {
    const sql = String(db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)!.sql);
    const dependents = db.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL")
      .all(table).map((row) => String(row.sql));
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)).join(', ');
    db.exec(`CREATE TEMP TABLE kept_${table} AS SELECT rowid AS prior_rowid, ${columns} FROM ${table} ORDER BY rowid; DROP TABLE ${table}`);
    db.exec(sql.replaceAll("IN ('title', 'heading', 'paragraph', 'note')", "IN ('title', 'heading', 'paragraph')"));
    db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM kept_${table} ORDER BY prior_rowid; DROP TABLE kept_${table}`);
    for (const dependent of dependents) db.exec(dependent);
  }
  db.exec('PRAGMA user_version = 100');
}

/**
 * A genuine revision-101 store from a current one that holds no split paragraph and no import lineage (#1205): the three relations
 * revision 102 adds dropped, with the lineage triggers that go with them.
 */
export function asRevision101(db: DatabaseSync): void {
  asRevision102(db);
  if (db.prepare('SELECT 1 FROM manuscript_import_lineage LIMIT 1').get() !== undefined) throw new Error('a revision-101 store holds no import lineage');
  db.exec('DROP TABLE manuscript_import_lineage; DROP TABLE staged_import_structure_choices; DROP TABLE staged_import_paragraph_pieces');
  db.exec('PRAGMA user_version = 101');
}

/**
 * A genuine revision-102 store from a current one whose connections and dialogue bindings stay on the routes revision 102 knew
 * (#1225): `model_service_connections` and `dialogue_execution_bindings` rebuilt with their revision-84 and revision-72 texts, the
 * same rows in the same order, their indexes and triggers as they were.
 */
export function asRevision102(db: DatabaseSync): void {
  asRevision103(db);
  if (db.prepare(`SELECT 1 FROM model_service_connections WHERE provider_id IN ('opencode-zen', 'anthropic-claude', 'google-gemini')
      OR (provider_id = 'openai-platform' AND selected IS NOT NULL) LIMIT 1`).get() !== undefined ||
    db.prepare("SELECT 1 FROM dialogue_execution_bindings WHERE route NOT IN ('ai7-local-deterministic', 'opencode-go', 'deepseek-open-platform') LIMIT 1").get() !== undefined) {
    throw new Error('a revision-102 store holds no Zen, Claude or Gemini connection, no OpenAI Main choice and no turn on their routes');
  }
  db.exec('PRAGMA foreign_keys = OFF');
  for (const [table, sql] of [['model_service_connections', MODEL_SERVICE_CONNECTION_REVISION_84_SQL], ['dialogue_execution_bindings', DIALOGUE_EXECUTION_BINDINGS_REVISION_72_SQL]] as const) {
    const dependents = db.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL")
      .all(table).map((row) => String(row.sql));
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)).join(', ');
    db.exec(`CREATE TEMP TABLE kept_${table} AS SELECT rowid AS prior_rowid, ${columns} FROM ${table} ORDER BY rowid; DROP TABLE ${table}`);
    db.exec(sql);
    db.exec(`INSERT INTO ${table}(rowid, ${columns}) SELECT prior_rowid, ${columns} FROM kept_${table} ORDER BY prior_rowid; DROP TABLE kept_${table}`);
    for (const dependent of dependents) db.exec(dependent);
  }
  db.exec('PRAGMA user_version = 102');
}

/** A genuine revision-103 store from a current one with no 备用来源 chosen (#1226): revision 104's one-row relation dropped. */
export function asRevision103(db: DatabaseSync): void {
  if (db.prepare('SELECT 1 FROM search_backend_fallback LIMIT 1').get() !== undefined) throw new Error('a revision-103 store holds no search fallback');
  db.exec('DROP TABLE search_backend_fallback');
  db.exec('PRAGMA user_version = 103');
}
