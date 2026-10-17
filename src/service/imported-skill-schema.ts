import type { DatabaseSync } from 'node:sqlite';
import { IMPORTED_SKILL_SCHEMA_VERSION } from './task-authorization.js';

/** ADR 0090: sibling ledgers; the sole native_artifact_installations carrier CHECK never changes. */
export const IMPORTED_SKILL_SCHEMA_SQL = {
  imported_skills: `CREATE TABLE imported_skills (
  skill_id TEXT PRIMARY KEY CHECK(length(skill_id) = 36),
  source_key TEXT NOT NULL UNIQUE CHECK(length(source_key) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  imported_skill_snapshots: `CREATE TABLE imported_skill_snapshots (
  snapshot_id TEXT PRIMARY KEY CHECK(length(snapshot_id) = 36),
  skill_id TEXT NOT NULL REFERENCES imported_skills(skill_id),
  content_sha256 TEXT NOT NULL UNIQUE CHECK(length(content_sha256) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(snapshot_id, skill_id)
) STRICT`,
  imported_skill_revisions: `CREATE TABLE imported_skill_revisions (
  revision_id TEXT PRIMARY KEY CHECK(length(revision_id) = 36),
  skill_id TEXT NOT NULL REFERENCES imported_skills(skill_id),
  snapshot_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  previous_revision_id TEXT REFERENCES imported_skill_revisions(revision_id),
  working_sha256 TEXT NOT NULL CHECK(length(working_sha256) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (previous_revision_id IS NULL)),
  UNIQUE(skill_id, ordinal),
  FOREIGN KEY(snapshot_id, skill_id) REFERENCES imported_skill_snapshots(snapshot_id, skill_id)
) STRICT`,
  imported_skill_states: `CREATE TABLE imported_skill_states (
  revision_id TEXT NOT NULL REFERENCES imported_skill_revisions(revision_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('validated', 'restricted', 'rejected', 'installed-disabled', 'enabled')),
  book_id TEXT REFERENCES books(book_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((state = 'enabled') = (book_id IS NOT NULL)),
  PRIMARY KEY(revision_id, sequence)
) STRICT`,
} as const;

export const IMPORTED_SKILL_TRIGGER_SQL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(IMPORTED_SKILL_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((op) => [
    `${table}_no_${op}`, `CREATE TRIGGER ${table}_no_${op} BEFORE ${op.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_IMMUTABLE'); END`,
  ]))),
  imported_skill_states_transition: `CREATE TRIGGER imported_skill_states_transition BEFORE INSERT ON imported_skill_states
    WHEN NEW.sequence != (SELECT coalesce(max(sequence), 0) + 1 FROM imported_skill_states WHERE revision_id = NEW.revision_id)
      OR (NEW.state IN ('validated', 'restricted', 'rejected') AND EXISTS (SELECT 1 FROM imported_skill_states WHERE revision_id = NEW.revision_id))
      OR (NEW.state = 'installed-disabled' AND coalesce((SELECT state FROM imported_skill_states WHERE revision_id = NEW.revision_id ORDER BY sequence DESC LIMIT 1), '') != 'validated')
      OR (NEW.state = 'enabled' AND coalesce((SELECT state FROM imported_skill_states WHERE revision_id = NEW.revision_id ORDER BY sequence DESC LIMIT 1), '') NOT IN ('installed-disabled', 'enabled'))
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_TRANSITION_INVALID'); END`,
};

export const IMPORTED_SKILL_FOREIGN_KEYS = {
  imported_skill_snapshots: ['skill_id>imported_skills.skill_id:NO ACTION/NO ACTION/NONE'],
  imported_skill_revisions: [
    'skill_id>imported_skills.skill_id:NO ACTION/NO ACTION/NONE',
    'previous_revision_id>imported_skill_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    // A revision names a snapshot of its own Skill only: the pair is one reference.
    'snapshot_id>imported_skill_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'skill_id>imported_skill_snapshots.skill_id:NO ACTION/NO ACTION/NONE',
  ],
  imported_skill_states: [
    'revision_id>imported_skill_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
};

/**
 * Revision 81 adds the four relations to an earlier store. A store already at 81 or later is never given them anew: one that
 * lacks them is refused by the exact schema check, as every revision's missing relations are.
 */
export function initializeImportedSkillSchema(db: DatabaseSync, version: number): void {
  if (version >= IMPORTED_SKILL_SCHEMA_VERSION ||
    Object.keys(IMPORTED_SKILL_SCHEMA_SQL).some((name) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name) !== undefined)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(IMPORTED_SKILL_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(IMPORTED_SKILL_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
