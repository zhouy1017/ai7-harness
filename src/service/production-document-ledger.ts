import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

/**
 * Production Documents' relations (Issue #415, plan slice S66; V2-UX-DELIV-001, DELIV-002, WORK-013; ADR 0077 §6).
 * Schema revision 37 makes a Production Document a Book-owned Editorial Deliverable edited exactly as the
 * Manuscript is — its own branch, revisions, blocks, journal and marks in the bounded block store — without it
 * ever becoming a Manuscript Revision:
 *
 * - `manuscripts` is rebuilt so that a row may be `production-document` as well as `primary`, and a Book holds
 *   at most one `primary` row through a partial unique index instead of `book_id UNIQUE` (ADR 0029 stands).
 *   Every existing row is copied byte for byte. Milestones, the Publication Version, reimport, analysis,
 *   review and Tasks bind only the primary row.
 * - `production_documents`: which house type a document is, under which type configuration, and the Book's
 *   source material it was made from — at most one per type of a Book.
 * - `production_document_versions`: a document's versions, `版本 N` in its own order — the revision it was made
 *   with, and every one `保存为版本` or 交付 saved. A revision the block store made for another reason (a recovered
 *   working state) is no version, so a version names its revision rather than the other way round.
 * - `production_document_type_decisions`: `本书不做` and `恢复` for a type of a Book, in order; the latest one
 *   is the type's state, and none is ever rewritten.
 *
 * The three new relations are ledgers: a row is appended once and never rewritten or removed.
 */
export const PRODUCTION_DOCUMENT_SCHEMA_SQL = {
  production_documents: `CREATE TABLE production_documents (
  document_id TEXT PRIMARY KEY REFERENCES manuscripts(manuscript_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  type_id TEXT NOT NULL CHECK(length(type_id) BETWEEN 1 AND 64),
  type_configuration_version TEXT NOT NULL CHECK(length(type_configuration_version) BETWEEN 1 AND 16),
  type_configuration_digest TEXT NOT NULL CHECK(length(type_configuration_digest) = 64),
  origin_source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  parser_identity TEXT NOT NULL,
  record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
  created_at TEXT NOT NULL,
  UNIQUE(book_id, type_id)
) STRICT`,
  production_document_versions: `CREATE TABLE production_document_versions (
  document_id TEXT NOT NULL REFERENCES production_documents(document_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
  revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
  origin TEXT NOT NULL CHECK(origin IN ('created', 'saved', 'delivery')),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(document_id, version)
) STRICT`,
  production_document_type_decisions: `CREATE TABLE production_document_type_decisions (
  decision_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  type_id TEXT NOT NULL CHECK(length(type_id) BETWEEN 1 AND 64),
  type_configuration_version TEXT NOT NULL CHECK(length(type_configuration_version) BETWEEN 1 AND 16),
  type_configuration_digest TEXT NOT NULL CHECK(length(type_configuration_digest) = 64),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  decision TEXT NOT NULL CHECK(decision IN ('not-for-this-book', 'restored')),
  recorded_at TEXT NOT NULL,
  UNIQUE(book_id, type_id, sequence)
) STRICT`,
} as const;

/** `manuscripts` at revision 37: a primary Manuscript or a Production Document, the primary one unique per Book. */
export const MANUSCRIPTS_REVISION_37_SQL = `CREATE TABLE manuscripts (
  manuscript_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  role TEXT NOT NULL CHECK(role IN ('primary', 'production-document')),
  created_at TEXT NOT NULL
) STRICT`;

export const PRODUCTION_DOCUMENT_INDEX_SQL = {
  manuscripts_one_primary_per_book: `CREATE UNIQUE INDEX manuscripts_one_primary_per_book ON manuscripts(book_id) WHERE role = 'primary'`,
} as const;

/** Every new relation is a ledger: a row is appended once and never rewritten or removed. */
export const PRODUCTION_DOCUMENT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PRODUCTION_DOCUMENT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const PRODUCTION_DOCUMENT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  production_documents: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'document_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'origin_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  production_document_versions: [
    'document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  production_document_type_decisions: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
};

export class ProductionDocumentSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProductionDocumentSchemaError';
  }
}

type SqlRow = Record<string, SQLOutputValue>;

/**
 * Revision 37: `manuscripts` rebuilt once, shape-detected from its revision-36 text, with every row copied byte for
 * byte, and the three ledgers created. Other relations name `manuscripts` by its name, so the old table is renamed
 * away under `legacy_alter_table` — which leaves their references on the name — before the new one takes it.
 * Run before the version is stamped in `task-authorization.ts`; an interruption between the two repeats only the
 * stamp on the next open.
 */
export function initializeProductionDocumentSchema(db: DatabaseSync): void {
  const manuscripts = (db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'manuscripts'").get() as SqlRow | undefined)?.sql;
  const rebuild = typeof manuscripts === 'string' && !manuscripts.includes("'production-document'");
  const create = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'production_documents'").get() === undefined;
  if (!rebuild && !create) return;
  const legacyAlterTable = Number((db.prepare('PRAGMA legacy_alter_table').get() as SqlRow).legacy_alter_table);
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec('BEGIN IMMEDIATE;');
    if (rebuild) {
      db.exec(`
        ALTER TABLE manuscripts RENAME TO manuscripts_v36;
        ${MANUSCRIPTS_REVISION_37_SQL};
        INSERT INTO manuscripts(manuscript_id, book_id, role, created_at)
        SELECT manuscript_id, book_id, role, created_at FROM manuscripts_v36 ORDER BY rowid;
        DROP TABLE manuscripts_v36;
      `);
    }
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = 'manuscripts_one_primary_per_book'").get() === undefined) {
      db.exec(`${PRODUCTION_DOCUMENT_INDEX_SQL.manuscripts_one_primary_per_book};`);
    }
    if (create) {
      for (const sql of Object.values(PRODUCTION_DOCUMENT_SCHEMA_SQL)) db.exec(`${sql};`);
      for (const sql of Object.values(PRODUCTION_DOCUMENT_TRIGGER_SQL)) db.exec(`${sql};`);
    }
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite production document schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite production document migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new ProductionDocumentSchemaError('SCHEMA_MIGRATION_FAILED', '生产文档的关系与已有记录不一致。');
  }
}

/**
 * Revision 38 (Issue #415, S66b; V2-UX-DELIV-003, DELIV-004): `production_document_deliveries`, a document's Delivery
 * Records — 第 N 次交付, the exact version and its digest, the recipient from the house's list or in the editor's own
 * words, the note, the actor and the time, with the record's canonical JSON and digest. A ledger like the others: a
 * record is appended once and never rewritten, so a later edit and a new delivery leave every earlier one as it was.
 */
export const PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL = {
  production_document_deliveries: `CREATE TABLE production_document_deliveries (
  delivery_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES production_documents(document_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  version INTEGER NOT NULL CHECK(version >= 1),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
  recipient_kind TEXT NOT NULL CHECK(recipient_kind IN ('publicity', 'editorial', 'external-media', 'other', 'custom')),
  recipient_label TEXT NOT NULL CHECK(length(recipient_label) BETWEEN 1 AND 160),
  note TEXT CHECK(note IS NULL OR length(note) BETWEEN 1 AND 2000),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(document_id, ordinal)
) STRICT`,
} as const;

export const PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const PRODUCTION_DOCUMENT_DELIVERY_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  production_document_deliveries: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
};

/** Revision 38's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeProductionDocumentDeliverySchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'production_document_deliveries'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Production document delivery schema rollback failed.');
    }
    throw error;
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new ProductionDocumentSchemaError('SCHEMA_INVALID', '交付记录的关系与已有记录不一致。');
  }
}
