import type { DatabaseSync } from 'node:sqlite';

/**
 * Publication Versions (Issue #414, plan slice S65; ⑥ 发稿; V2-UX-MILE-013/014, PUB-002 to PUB-009).
 *
 * 设为发稿版本 is one deterministic, local editor interaction over one exact Milestone Version of a Book's
 * primary Manuscript. Schema revision 25 holds what it records in three additive relations, every one
 * of them append-only — a designation is evidence and is never retargeted (PUB-007) — and every row
 * carries its canonical JSON and digest:
 *
 * - `publication_versions`: the 发稿版本 as designated — 第 N 次 of its Book, the exact milestone, the
 *   exact revision and its digest, the 发稿范围 and the 依据, the actor and the time. The newest one of a
 *   Book is its current 发稿版本; a newer designation is a separate append and the older one stays.
 * - `public_release_permissions`: the separately identified internal Public Release Permission recorded
 *   in the same interaction (PUB-003) — linked to its designation, never merged with it, and never shown
 *   in ordinary editorial wording. It grants no export, sending or publication (PUB-008, PUB-010).
 * - `publication_events`: what a designation leaves for later slices to take up, recorded in the same
 *   interaction: the prompt to enter the 定价与首印 actuals (V2-UX-EVAL-010, S82) and the archiving of the
 *   Book's 审稿意见 into 范例 (V2-UX-KB-006, S79). Nothing consumes them yet.
 *
 * Nothing existing moves (ADR 0079: an additive revision keeps the same Data Version). The relations are
 * created shape-detected in `EditorialStore.open` before `initializeTaskAuthorizationSchema` stamps the
 * version, exactly as revisions 21 to 24 add theirs, and join the exact-schema validator the same way.
 */
export const PUBLICATION_VERSION_SCHEMA_SQL = {
  publication_versions: `CREATE TABLE publication_versions (
  publication_version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  milestone_id TEXT NOT NULL REFERENCES milestone_versions(milestone_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
  scope TEXT NOT NULL CHECK(length(scope) BETWEEN 1 AND 80),
  basis TEXT NOT NULL CHECK(length(basis) BETWEEN 1 AND 500),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(book_id, ordinal)
) STRICT`,
  public_release_permissions: `CREATE TABLE public_release_permissions (
  permission_id TEXT PRIMARY KEY,
  publication_version_id TEXT NOT NULL UNIQUE REFERENCES publication_versions(publication_version_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
  scope TEXT NOT NULL CHECK(length(scope) BETWEEN 1 AND 80),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
  publication_events: `CREATE TABLE publication_events (
  event_id TEXT PRIMARY KEY,
  publication_version_id TEXT NOT NULL REFERENCES publication_versions(publication_version_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  kind TEXT NOT NULL CHECK(kind IN ('actuals-prompt', 'exemplar-archive')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(publication_version_id, kind)
) STRICT`,
} as const;

/** Every Publication Version relation is a ledger: a row is appended once and never rewritten or removed. */
export const PUBLICATION_VERSION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PUBLICATION_VERSION_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PUBLICATION_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PUBLICATION_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const PUBLICATION_VERSION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  publication_versions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  public_release_permissions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  publication_events: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class PublicationVersionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PublicationVersionError';
  }
}

export function requirePublication(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PublicationVersionError(code, message);
}

/**
 * The three relations and their ledger triggers, created once and never rebuilt: a store that predates
 * them gains three empty relations and nothing existing moves. Like revisions 21 to 24 this runs before
 * the version is stamped in `task-authorization.ts` and is shape-detected, so a store that already has
 * them does no work here, and an interruption between the creation and the version stamp repeats only
 * the stamp on the next open.
 */
export function initializePublicationVersionSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'publication_versions'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(PUBLICATION_VERSION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(PUBLICATION_VERSION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Publication version schema rollback failed.');
    }
    throw error;
  }
  requirePublication(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}
