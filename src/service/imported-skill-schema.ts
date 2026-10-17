import type { DatabaseSync } from 'node:sqlite';
import { IMPORTED_SKILL_SCHEMA_VERSION, IMPORTED_SKILL_UPDATE_SCHEMA_VERSION } from './task-authorization.js';

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

/**
 * The line the editor confirms to create the Artifact Update Rule (ADR 0045 § Update and rollback; REUSE-034). The rule relation's
 * CHECK pins it: a rule row cannot exist without the editor having been shown exactly this sentence.
 */
export const IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION = '自动采纳无冲突、校验通过、未扩权的更新';

/**
 * Revision 83 (Issue #89; ADR 0090 §3, ADR 0045 § Update and rollback): the foreign Skill update ledgers, beside revision 81's and
 * leaving those byte for byte as they were. All three are append-only. A candidate is an event log keyed by (candidate_id,
 * sequence): its first event records the reconciliation, and at most one later event records its adoption or its dismissal, so a
 * candidate is never edited and never deleted. The rule ledger is its own, never `default_execution_rules`: a rule is created, and
 * revoked by appending a revocation. A current selection names which working revision of a Skill is the current one, and why.
 */
export const IMPORTED_SKILL_UPDATE_SCHEMA_SQL = {
  imported_skill_update_rules: `CREATE TABLE imported_skill_update_rules (
  rule_id TEXT PRIMARY KEY CHECK(length(rule_id) = 36),
  skill_id TEXT NOT NULL REFERENCES imported_skills(skill_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  action TEXT NOT NULL CHECK(action IN ('create', 'revoke')),
  revokes_rule_id TEXT REFERENCES imported_skill_update_rules(rule_id),
  confirmation TEXT CHECK(confirmation = '${IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION}'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((action = 'create') = (confirmation IS NOT NULL)),
  CHECK((action = 'revoke') = (revokes_rule_id IS NOT NULL)),
  UNIQUE(skill_id, sequence)
) STRICT`,
  imported_skill_update_candidates: `CREATE TABLE imported_skill_update_candidates (
  candidate_id TEXT NOT NULL CHECK(length(candidate_id) = 36),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  skill_id TEXT NOT NULL REFERENCES imported_skills(skill_id),
  event TEXT NOT NULL CHECK(event IN ('created', 'adopted', 'dismissed')),
  from_snapshot_id TEXT REFERENCES imported_skill_snapshots(snapshot_id),
  to_snapshot_id TEXT REFERENCES imported_skill_snapshots(snapshot_id),
  base_revision_id TEXT REFERENCES imported_skill_revisions(revision_id),
  disposition TEXT CHECK(disposition IN ('clean', 'conflict', 'validator-failed', 'authority-change')),
  adopted_by TEXT CHECK(adopted_by IN ('editor', 'rule')),
  adopted_revision_id TEXT REFERENCES imported_skill_revisions(revision_id),
  rule_id TEXT REFERENCES imported_skill_update_rules(rule_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((sequence = 1) = (event = 'created')),
  CHECK((event = 'created') = (from_snapshot_id IS NOT NULL AND to_snapshot_id IS NOT NULL AND base_revision_id IS NOT NULL AND disposition IS NOT NULL)),
  CHECK((event = 'adopted') = (adopted_by IS NOT NULL AND adopted_revision_id IS NOT NULL)),
  CHECK((adopted_by = 'rule') = (rule_id IS NOT NULL)),
  PRIMARY KEY(candidate_id, sequence)
) STRICT`,
  imported_skill_current_selections: `CREATE TABLE imported_skill_current_selections (
  skill_id TEXT NOT NULL REFERENCES imported_skills(skill_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  revision_id TEXT NOT NULL REFERENCES imported_skill_revisions(revision_id),
  reason TEXT NOT NULL CHECK(reason IN ('import', 'adopt', 'rule', 'rollback')),
  candidate_id TEXT CHECK(candidate_id IS NULL OR length(candidate_id) = 36),
  states_through INTEGER CHECK(states_through IS NULL OR states_through >= 0),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((reason IN ('adopt', 'rule')) = (candidate_id IS NOT NULL)),
  CHECK((reason = 'rollback') = (states_through IS NOT NULL)),
  PRIMARY KEY(skill_id, sequence)
) STRICT`,
} as const;

export const IMPORTED_SKILL_UPDATE_TRIGGER_SQL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((op) => [
    `${table}_no_${op}`, `CREATE TRIGGER ${table}_no_${op} BEFORE ${op.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_UPDATE_IMMUTABLE'); END`,
  ]))),
  imported_skill_update_rules_transition: `CREATE TRIGGER imported_skill_update_rules_transition BEFORE INSERT ON imported_skill_update_rules
    WHEN NEW.sequence != (SELECT coalesce(max(sequence), 0) + 1 FROM imported_skill_update_rules WHERE skill_id = NEW.skill_id)
      OR (NEW.action = 'create' AND coalesce((SELECT action FROM imported_skill_update_rules WHERE skill_id = NEW.skill_id ORDER BY sequence DESC LIMIT 1), 'revoke') != 'revoke')
      OR (NEW.action = 'revoke' AND (SELECT action FROM imported_skill_update_rules WHERE skill_id = NEW.skill_id ORDER BY sequence DESC LIMIT 1) IS NOT 'create')
      OR (NEW.action = 'revoke' AND NEW.revokes_rule_id IS NOT (SELECT rule_id FROM imported_skill_update_rules WHERE skill_id = NEW.skill_id ORDER BY sequence DESC LIMIT 1))
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_UPDATE_RULE_TRANSITION_INVALID'); END`,
  imported_skill_update_candidates_transition: `CREATE TRIGGER imported_skill_update_candidates_transition BEFORE INSERT ON imported_skill_update_candidates
    WHEN NEW.sequence != (SELECT coalesce(max(sequence), 0) + 1 FROM imported_skill_update_candidates WHERE candidate_id = NEW.candidate_id)
      OR NEW.sequence > 2
      OR (NEW.sequence > 1 AND (SELECT skill_id FROM imported_skill_update_candidates WHERE candidate_id = NEW.candidate_id AND sequence = 1) IS NOT NEW.skill_id)
      OR (NEW.event = 'created' AND (
        (SELECT skill_id FROM imported_skill_snapshots WHERE snapshot_id = NEW.from_snapshot_id) IS NOT NEW.skill_id
        OR (SELECT skill_id FROM imported_skill_snapshots WHERE snapshot_id = NEW.to_snapshot_id) IS NOT NEW.skill_id
        OR (SELECT skill_id FROM imported_skill_revisions WHERE revision_id = NEW.base_revision_id) IS NOT NEW.skill_id
        OR (SELECT snapshot_id FROM imported_skill_revisions WHERE revision_id = NEW.base_revision_id) IS NOT NEW.from_snapshot_id
        OR NEW.from_snapshot_id = NEW.to_snapshot_id))
      OR (NEW.event = 'adopted' AND (
        (SELECT skill_id FROM imported_skill_revisions WHERE revision_id = NEW.adopted_revision_id) IS NOT NEW.skill_id
        OR (SELECT snapshot_id FROM imported_skill_revisions WHERE revision_id = NEW.adopted_revision_id)
          IS NOT (SELECT to_snapshot_id FROM imported_skill_update_candidates WHERE candidate_id = NEW.candidate_id AND sequence = 1)
        OR (NEW.adopted_by = 'rule' AND (
          (SELECT skill_id FROM imported_skill_update_rules WHERE rule_id = NEW.rule_id) IS NOT NEW.skill_id
          OR (SELECT action FROM imported_skill_update_rules WHERE skill_id = NEW.skill_id ORDER BY sequence DESC LIMIT 1) IS NOT 'create'
          OR (SELECT disposition FROM imported_skill_update_candidates WHERE candidate_id = NEW.candidate_id AND sequence = 1) IS NOT 'clean'))))
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_UPDATE_CANDIDATE_INVALID'); END`,
  imported_skill_current_selections_transition: `CREATE TRIGGER imported_skill_current_selections_transition BEFORE INSERT ON imported_skill_current_selections
    WHEN NEW.sequence != (SELECT coalesce(max(sequence), 0) + 1 FROM imported_skill_current_selections WHERE skill_id = NEW.skill_id)
      OR (SELECT skill_id FROM imported_skill_revisions WHERE revision_id = NEW.revision_id) IS NOT NEW.skill_id
      OR (NEW.candidate_id IS NOT NULL AND (SELECT skill_id FROM imported_skill_update_candidates WHERE candidate_id = NEW.candidate_id AND sequence = 1) IS NOT NEW.skill_id)
    BEGIN SELECT RAISE(ABORT, 'IMPORTED_SKILL_SELECTION_INVALID'); END`,
};

export const IMPORTED_SKILL_UPDATE_FOREIGN_KEYS = {
  imported_skill_update_rules: [
    'skill_id>imported_skills.skill_id:NO ACTION/NO ACTION/NONE',
    'revokes_rule_id>imported_skill_update_rules.rule_id:NO ACTION/NO ACTION/NONE',
  ],
  imported_skill_update_candidates: [
    'skill_id>imported_skills.skill_id:NO ACTION/NO ACTION/NONE',
    'from_snapshot_id>imported_skill_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'to_snapshot_id>imported_skill_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'base_revision_id>imported_skill_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'adopted_revision_id>imported_skill_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'rule_id>imported_skill_update_rules.rule_id:NO ACTION/NO ACTION/NONE',
  ],
  imported_skill_current_selections: [
    'skill_id>imported_skills.skill_id:NO ACTION/NO ACTION/NONE',
    'revision_id>imported_skill_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
};

/**
 * Revision 83 adds the three relations to an earlier store, whatever revision it stood at; the revision-81 relations they refer to
 * are created first by `initializeImportedSkillSchema`. A store already at 83 or later is never given them anew: one that lacks
 * them is refused by the exact schema check, as every revision's missing relations are.
 */
export function initializeImportedSkillUpdateSchema(db: DatabaseSync, version: number): void {
  if (version >= IMPORTED_SKILL_UPDATE_SCHEMA_VERSION ||
    Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL).some((name) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name) !== undefined)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(IMPORTED_SKILL_UPDATE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(IMPORTED_SKILL_UPDATE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
