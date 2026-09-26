import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_DELIVERABLE_MILESTONES,
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  MAX_PUBLICATION_VERSIONS_LISTED,
  PUBLICATION_ACTUALS_PROMPT_LABEL,
  PUBLICATION_ACTUALS_PROMPT_STATE,
  PUBLICATION_CHANGE_NOTICE,
  PUBLICATION_EVENT_KINDS,
  PUBLICATION_NEEDS_MANUSCRIPT,
  PUBLICATION_NEEDS_MILESTONE,
  PUBLICATION_VERSION_LABEL,
  PUBLICATION_VERSION_STATEMENT,
  milestoneChangedSinceLabel,
  milestonePurposeKindOf,
  publicationDesignatedLabel,
  publicationText,
  publicationUnchangedLabel,
  type DeliverablesProjection,
  type DesignatePublicationVersionInput,
  type MilestoneListItemProjection,
  type PublicationActualsPromptProjection,
  type PublicationDesignationProjection,
  type PublicationEventKind,
  type PublicationMaintenanceProjection,
  type PublicationVersionProjection,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';

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
 * them does no work here.
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

// ---- the store ------------------------------------------------------------------------------------

type SqlRow = Record<string, SQLOutputValue>;

const VERSION_SCHEMA = 'ai7.publication.version/1' as const;
const PERMISSION_SCHEMA = 'ai7.publication.public-release-permission/1' as const;
const EVENT_SCHEMA = 'ai7.publication.event/1' as const;
const ACTOR = '本机编辑' as const;
const FOREIGN_MILESTONE_REASON = '所选里程碑版本不属于这本书的稿件。' as const;

/** The Book's primary Manuscript on its working branch, as it stands now. */
interface ManuscriptHead {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
}

/** The exact milestone a designation names, with the revision it froze. */
interface DesignatedMilestone {
  milestoneId: string;
  label: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
}

interface ReadDesignation {
  projection: PublicationVersionProjection;
  actualsPrompt: PublicationActualsPromptProjection;
}

function text(value: SQLOutputValue | undefined): string {
  requirePublication(typeof value === 'string' && value.isWellFormed(), 'PUBLICATION_RECORD_INVALID', '发稿记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requirePublication(typeof value === 'number' && Number.isSafeInteger(value), 'PUBLICATION_RECORD_INVALID', '发稿记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null ? null : text(value);
}

/** One transaction, or the caller's when one is already open: every write here is part of the caller's. */
function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Publication ledger transaction rollback failed.');
    }
    throw error;
  }
}

/**
 * A stored record read back: its canonical JSON must still digest to the recorded SHA-256 and name exactly
 * the facts its columns hold, so what 交付物 shows is what was written. Answers the digest.
 */
function requireRecord(json: SQLOutputValue | undefined, digest: SQLOutputValue | undefined, facts: Readonly<Record<string, unknown>>): string {
  const canonical = text(json);
  const recorded = text(digest);
  requirePublication(DIGEST_PATTERN.test(recorded) && sha256Hex(canonical) === recorded, 'PUBLICATION_RECORD_INVALID', '发稿记录与其摘要不一致。');
  const record = parseCanonicalJson(canonical);
  requirePublication(
    isRecord(record) && Object.entries(facts).every(([key, value]) => record[key] === value),
    'PUBLICATION_RECORD_INVALID',
    '发稿记录与其字段不一致。',
  );
  return recorded;
}

/**
 * 设为发稿版本 and the 交付物 read (Issue #414). Every write is one transaction on the authority
 * connection, and every read verifies what it shows against the digests it was written with.
 */
/** What 维护事项 (Issue #426, S68a) tell the designations: each one's cases, and whether a 撤回 holds it. */
export interface PublicationMaintenanceSource {
  summaries(bookId: string, publicationVersionId: string): PublicationMaintenanceProjection;
  withdrawn(publicationVersionId: string): boolean;
  /** When a 撤回 came to hold the designation, or `null` while none holds it. */
  withdrawnAt(publicationVersionId: string): string | null;
}

const NO_MAINTENANCE: PublicationMaintenanceSource = {
  summaries: () => ({ cases: [], total: 0, withdrawn: false, archived: false }),
  withdrawn: () => false,
  withdrawnAt: () => null,
};

/** One designation as 范例 reads it (Issue #427, S79b review): which one, when, and when a 撤回 came to hold it. */
export interface PublicationHistoryEntry {
  readonly publicationVersionId: string;
  readonly ordinal: number;
  readonly createdAt: string;
  readonly withdrawnAt: string | null;
}

export class PublicationVersionStore {
  readonly #db: DatabaseSync;
  readonly #exportsOf: (bookId: string) => DeliverablesProjection['exports'];
  readonly #maintenance: PublicationMaintenanceSource;

  /**
   * `exportsOf` reads a Book's approved exports from the export ledger (Issue #413), which 交付物 lists too; `maintenance`
   * reads each designation's 维护事项 (Issue #426).
   */
  constructor(
    db: DatabaseSync,
    exportsOf: (bookId: string) => DeliverablesProjection['exports'] = () => [],
    maintenance: PublicationMaintenanceSource = NO_MAINTENANCE,
  ) {
    this.#db = db;
    this.#exportsOf = exportsOf;
    this.#maintenance = maintenance;
  }

  /**
   * The 发稿 · 稿件 block of one Book: every milestone of its primary Manuscript with its purpose, exact
   * revision and whether the manuscript changed after it; every designation, the newest current; the
   * change notice; whether 设为发稿版本 can be offered; and the pending line a designation leaves.
   */
  deliverables(bookId: string): DeliverablesProjection {
    requirePublication(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const bookTitle = this.#bookTitle(bookId);
    const head = this.#head(bookId);
    const read = this.#designations(bookId, head, MAX_PUBLICATION_VERSIONS_LISTED + 1);
    const designations = read.slice(0, MAX_PUBLICATION_VERSIONS_LISTED);
    const current = designations[0] ?? null;
    const milestoneRows = head === null ? [] : this.#milestones(head, MAX_DELIVERABLE_MILESTONES + 1);
    const milestones = milestoneRows.slice(0, MAX_DELIVERABLE_MILESTONES)
      .map((row) => this.#milestoneItem(row, head!, current?.projection ?? null));
    return {
      bookId,
      bookTitle,
      manuscript: head === null ? null : { ...head },
      publication: {
        milestones,
        milestonesTruncated: milestoneRows.length > MAX_DELIVERABLE_MILESTONES,
        designations: designations.map((entry) => entry.projection),
        designationsTruncated: read.length > MAX_PUBLICATION_VERSIONS_LISTED,
        // The notice compares the working state with the exact revision the current designation froze:
        // any durable change since — an edit, an Apply, an undo — shows it, and a newer designation of
        // the current state clears it without touching the older one (PUB-006, PUB-007).
        changeNotice: current !== null && head!.workingDigest !== current.projection.technical.revisionDigest
          ? { label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: current.projection.publicationVersionId, revisionLabel: current.projection.revisionLabel }
          : null,
        designate: head === null
          ? { available: false, unavailableReason: PUBLICATION_NEEDS_MANUSCRIPT }
          : milestones.length === 0
            ? { available: false, unavailableReason: PUBLICATION_NEEDS_MILESTONE }
            : { available: true, unavailableReason: null },
        statement: PUBLICATION_VERSION_STATEMENT,
        actualsPrompt: current?.actualsPrompt ?? null,
      },
      exports: this.#exportsOf(bookId),
    };
  }

  /**
   * The Book's current 发稿版本 — its newest designation, read and verified exactly as 交付物 reads it — and whether
   * the manuscript moved past it (Issue #416: 图书交付包's first condition). `null` when the Book has none.
   */
  current(bookId: string): { projection: PublicationVersionProjection; changedSince: boolean; withdrawn: boolean } | null {
    requirePublication(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const head = this.#head(bookId);
    const current = this.#designations(bookId, head, 1)[0];
    if (current === undefined) return null;
    return {
      projection: current.projection,
      changedSince: head!.workingDigest !== current.projection.technical.revisionDigest,
      // A 撤回 case holds it (Issue #426, S68a): in AI7 it is no longer used for 发稿 (ADR 0040).
      withdrawn: current.projection.maintenance.withdrawn,
    };
  }

  /**
   * The Books that have a 发稿版本, by title as 书库 pages them, after `after` and at most `limit` of them (Issue #427, S79b:
   * 范例 holds exactly these Books).
   */
  designatedBooks(after: { title: string; bookId: string } | null, limit: number): Array<{ bookId: string; title: string }> {
    const rows = this.#db.prepare(
      `SELECT b.book_id, b.title FROM books b
       WHERE EXISTS (SELECT 1 FROM publication_versions p WHERE p.book_id = b.book_id)
         ${after === null ? '' : 'AND (b.title COLLATE BINARY > ? COLLATE BINARY OR (b.title = ? COLLATE BINARY AND b.book_id > ?))'}
       ORDER BY b.title COLLATE BINARY, b.book_id
       LIMIT ?`,
    ).all(...(after === null ? [] : [after.title, after.title, after.bookId]), limit) as SqlRow[];
    return rows.map((row) => ({ bookId: text(row.book_id), title: text(row.title) }));
  }

  /**
   * Every designation of a Book, oldest first, each read and verified exactly as 交付物 reads it, with when a 撤回 came to
   * hold it (Issue #427, S79b review): 范例 takes in what the Book delivered while a designation stood in AI7.
   */
  history(bookId: string): PublicationHistoryEntry[] {
    requirePublication(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    return this.#designations(bookId, this.#head(bookId), Number.MAX_SAFE_INTEGER).reverse().map(({ projection }) => ({
      publicationVersionId: projection.publicationVersionId,
      ordinal: projection.ordinal,
      createdAt: projection.createdAt,
      withdrawnAt: this.#maintenance.withdrawnAt(projection.publicationVersionId),
    }));
  }

  /**
   * 设为发稿版本 (V2-UX-PUB-002 to PUB-009): deterministic and local. One transaction appends the
   * Publication Version, its separate internal Public Release Permission and the two events it leaves —
   * or, when the request repeats the current designation exactly, appends nothing and says so. A newer
   * designation is always a separate append; no designation is ever retargeted, and nothing is exported,
   * sent or published.
   */
  designate(input: DesignatePublicationVersionInput): PublicationDesignationProjection {
    requirePublication(
      isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
        typeof input.milestoneId === 'string' && UUID_PATTERN.test(input.milestoneId),
      'PUBLICATION_INVALID',
      '设为发稿版本的请求无效。',
    );
    const scope = publicationText(input.scope, MAX_PUBLICATION_SCOPE_CHARACTERS);
    requirePublication(scope !== null, 'PUBLICATION_SCOPE_INVALID', `请填写发稿范围（1–${MAX_PUBLICATION_SCOPE_CHARACTERS} 个字符）。`);
    const basis = publicationText(input.basis, MAX_PUBLICATION_BASIS_CHARACTERS);
    requirePublication(basis !== null, 'PUBLICATION_BASIS_INVALID', `请填写依据（1–${MAX_PUBLICATION_BASIS_CHARACTERS} 个字符）。`);
    const { bookId, milestoneId } = input;
    const result = transact(this.#db, () => {
      this.#bookTitle(bookId);
      const head = this.#head(bookId);
      requirePublication(head !== null, 'PUBLICATION_MILESTONE_REQUIRED', PUBLICATION_NEEDS_MANUSCRIPT);
      requirePublication(this.#milestones(head, 1).length === 1, 'PUBLICATION_MILESTONE_REQUIRED', PUBLICATION_NEEDS_MILESTONE);
      const milestone = this.#milestoneOf(head, milestoneId);
      requirePublication(milestone !== null, 'PUBLICATION_MILESTONE_NOT_FOUND', FOREIGN_MILESTONE_REASON);
      // The current designation is read verified, so neither a repeat nor the next ordinal is ever decided
      // against a record that no longer matches what was written.
      const current = this.#designations(bookId, head, 1)[0]?.projection ?? null;
      // A current designation withdrawn in AI7 (Issue #426, S68a) is no longer used for 发稿: the same milestone, scope and
      // basis again is a new designation, never the withdrawn one repeated.
      if (current !== null && current.milestoneId === milestoneId && current.scope === scope && current.basis === basis &&
          !this.#maintenance.withdrawn(current.publicationVersionId)) {
        return { outcome: 'unchanged' as const, publicationVersionId: current.publicationVersionId, milestone };
      }
      const ordinal = current === null ? 1 : current.ordinal + 1;
      const publicationVersionId = this.#append(bookId, head, milestone, ordinal, scope, basis);
      return { outcome: 'designated' as const, publicationVersionId, milestone };
    });
    const completion = result.outcome === 'designated' ? publicationDesignatedLabel : publicationUnchangedLabel;
    return {
      bookId,
      outcome: result.outcome,
      completionLabel: completion(result.milestone.label, result.milestone.revisionLabel, scope),
      publicationVersionId: result.publicationVersionId,
      deliverables: this.deliverables(bookId),
    };
  }

  /**
   * The records of one designation, inside the caller's transaction: the Publication Version, the
   * separately identified Public Release Permission, and one event of each kind — all bound to the exact
   * milestone revision and its digest, and all with the one time the interaction happened at.
   */
  #append(bookId: string, head: ManuscriptHead, milestone: DesignatedMilestone, ordinal: number, scope: string, basis: string): string {
    const publicationVersionId = randomUUID();
    const permissionId = randomUUID();
    const createdAt = new Date().toISOString();
    const version = canonicalRecord({
      schema: VERSION_SCHEMA,
      publicationVersionId,
      bookId,
      ordinal,
      manuscriptId: head.manuscriptId,
      branchId: head.branchId,
      milestoneId: milestone.milestoneId,
      milestoneLabel: milestone.label,
      revisionId: milestone.revisionId,
      revisionLabel: milestone.revisionLabel,
      revisionDigest: milestone.revisionDigest,
      scope,
      basis,
      actor: ACTOR,
      createdAt,
      statement: PUBLICATION_VERSION_STATEMENT,
    });
    this.#db.prepare(
      `INSERT INTO publication_versions(
         publication_version_id, book_id, ordinal, manuscript_id, branch_id, milestone_id, revision_id, revision_digest,
         scope, basis, actor, created_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(publicationVersionId, bookId, ordinal, head.manuscriptId, head.branchId, milestone.milestoneId, milestone.revisionId,
      milestone.revisionDigest, scope, basis, ACTOR, createdAt, version.json, version.digest);
    const permission = canonicalRecord({
      schema: PERMISSION_SCHEMA,
      permissionId,
      publicationVersionId,
      bookId,
      revisionId: milestone.revisionId,
      revisionDigest: milestone.revisionDigest,
      scope,
      actor: ACTOR,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO public_release_permissions(
         permission_id, publication_version_id, book_id, revision_id, revision_digest, scope, actor, created_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(permissionId, publicationVersionId, bookId, milestone.revisionId, milestone.revisionDigest, scope, ACTOR, createdAt,
      permission.json, permission.digest);
    for (const kind of PUBLICATION_EVENT_KINDS) {
      const eventId = randomUUID();
      const event = canonicalRecord({
        schema: EVENT_SCHEMA,
        eventId,
        kind,
        publicationVersionId,
        bookId,
        revisionId: milestone.revisionId,
        recordedAt: createdAt,
      });
      this.#db.prepare(
        `INSERT INTO publication_events(event_id, publication_version_id, book_id, kind, recorded_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(eventId, publicationVersionId, bookId, kind, createdAt, event.json, event.digest);
    }
    return publicationVersionId;
  }

  #bookTitle(bookId: string): string {
    const book = this.#db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    requirePublication(book !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    return text(book.title);
  }

  #head(bookId: string): ManuscriptHead | null {
    const rows = this.#db.prepare(
      `SELECT m.manuscript_id, bws.branch_id, bws.base_revision_id, mr.revision_label, bws.journal_sequence, bws.working_digest
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id AND bws.manuscript_id = m.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.book_id = ? AND m.role = 'primary'`,
    ).all(bookId) as SqlRow[];
    requirePublication(rows.length <= 1, 'PUBLICATION_RECORD_INVALID', '图书的主稿件工作分支不唯一。');
    const row = rows[0];
    if (row === undefined) return null;
    return {
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      revisionId: text(row.base_revision_id),
      revisionLabel: text(row.revision_label),
      journalSequence: integer(row.journal_sequence),
      workingDigest: text(row.working_digest),
    };
  }

  /** The milestones of the working branch, newest first, each with its exact revision and Signoff Record. */
  #milestones(head: ManuscriptHead, limit: number): SqlRow[] {
    return this.#db.prepare(
      `SELECT mv.milestone_id, mv.label, mv.purpose, mv.note, mv.actor, mv.created_at, mv.revision_id,
              mr.revision_label, mr.revision_digest, sr.signoff_record_id
       FROM milestone_versions mv
       JOIN manuscript_revisions mr ON mr.revision_id = mv.revision_id
       JOIN milestone_signoff_records sr ON sr.milestone_id = mv.milestone_id
       WHERE mv.manuscript_id = ? AND mv.branch_id = ?
       ORDER BY mv.created_at DESC, mv.rowid DESC
       LIMIT ?`,
    ).all(head.manuscriptId, head.branchId, limit) as SqlRow[];
  }

  /**
   * One listed milestone. Whether the manuscript changed after it compares the working state with the
   * exact revision the milestone froze (MILE-007); its kind is read back from the words it holds, so a
   * row saved before the kinds existed lists exactly as it was saved.
   */
  #milestoneItem(row: SqlRow, head: ManuscriptHead, current: PublicationVersionProjection | null): MilestoneListItemProjection {
    const milestoneId = text(row.milestone_id);
    const label = text(row.label);
    const purpose = text(row.purpose);
    requirePublication(text(row.actor) === ACTOR, 'PUBLICATION_RECORD_INVALID', '里程碑记录无效。');
    const changedSince = head.workingDigest !== text(row.revision_digest);
    return {
      milestoneId,
      label,
      purposeKind: milestonePurposeKindOf(purpose),
      purposeLabel: purpose,
      revisionId: text(row.revision_id),
      revisionLabel: text(row.revision_label),
      actor: ACTOR,
      createdAt: text(row.created_at),
      note: nullableText(row.note),
      changedSince,
      changedSinceLabel: changedSince ? milestoneChangedSinceLabel(label) : null,
      designation: current !== null && current.milestoneId === milestoneId
        ? { publicationVersionId: current.publicationVersionId, label: PUBLICATION_VERSION_LABEL }
        : null,
      technical: { signoffRecordId: text(row.signoff_record_id) },
    };
  }

  /** One milestone of the working branch by its identity, or `null` when it is none of this Book's. */
  #milestoneOf(head: ManuscriptHead, milestoneId: string): DesignatedMilestone | null {
    const row = this.#db.prepare(
      `SELECT mv.milestone_id, mv.label, mv.revision_id, mr.revision_label, mr.revision_digest
       FROM milestone_versions mv
       JOIN manuscript_revisions mr
         ON mr.revision_id = mv.revision_id AND mr.manuscript_id = mv.manuscript_id AND mr.branch_id = mv.branch_id
       JOIN milestone_signoff_records sr ON sr.milestone_id = mv.milestone_id
       WHERE mv.milestone_id = ? AND mv.manuscript_id = ? AND mv.branch_id = ?`,
    ).get(milestoneId, head.manuscriptId, head.branchId) as SqlRow | undefined;
    if (row === undefined) return null;
    const revisionDigest = text(row.revision_digest);
    requirePublication(DIGEST_PATTERN.test(revisionDigest), 'PUBLICATION_RECORD_INVALID', '里程碑修订版摘要无效。');
    return {
      milestoneId: text(row.milestone_id),
      label: text(row.label),
      revisionId: text(row.revision_id),
      revisionLabel: text(row.revision_label),
      revisionDigest,
    };
  }

  /**
   * The Book's designations newest first, each verified whole: the version, its permission and its two
   * events digest to what was recorded, name the same identities, and still stand on the exact milestone
   * revision they froze.
   */
  #designations(bookId: string, head: ManuscriptHead | null, limit: number): ReadDesignation[] {
    const rows = this.#db.prepare(
      `SELECT pv.publication_version_id, pv.ordinal, pv.manuscript_id, pv.branch_id, pv.milestone_id, pv.revision_id,
              pv.revision_digest, pv.scope, pv.basis, pv.actor, pv.created_at, pv.canonical_json, pv.sha256,
              mv.label milestone_label, mv.revision_id milestone_revision_id,
              mr.revision_label, mr.revision_digest frozen_revision_digest,
              p.permission_id, p.book_id permission_book_id, p.revision_id permission_revision_id,
              p.revision_digest permission_revision_digest, p.scope permission_scope, p.actor permission_actor,
              p.created_at permission_created_at, p.canonical_json permission_json, p.sha256 permission_sha256
       FROM publication_versions pv
       LEFT JOIN milestone_versions mv ON mv.milestone_id = pv.milestone_id
       LEFT JOIN manuscript_revisions mr ON mr.revision_id = pv.revision_id
       LEFT JOIN public_release_permissions p ON p.publication_version_id = pv.publication_version_id
       WHERE pv.book_id = ?
       ORDER BY pv.ordinal DESC
       LIMIT ?`,
    ).all(bookId, limit) as SqlRow[];
    requirePublication(rows.length === 0 || head !== null, 'PUBLICATION_RECORD_INVALID', '发稿记录缺少所属稿件。');
    return rows.map((row, index) => this.#designation(row, index === 0, bookId, head!));
  }

  #designation(row: SqlRow, current: boolean, bookId: string, head: ManuscriptHead): ReadDesignation {
    const publicationVersionId = text(row.publication_version_id);
    const ordinal = integer(row.ordinal);
    const milestoneId = text(row.milestone_id);
    const revisionId = text(row.revision_id);
    const revisionDigest = text(row.revision_digest);
    const scope = text(row.scope);
    const basis = text(row.basis);
    const createdAt = text(row.created_at);
    requirePublication(
      text(row.manuscript_id) === head.manuscriptId && text(row.branch_id) === head.branchId &&
        text(row.milestone_revision_id) === revisionId && text(row.frozen_revision_digest) === revisionDigest &&
        text(row.actor) === ACTOR,
      'PUBLICATION_RECORD_INVALID',
      '发稿版本不再对应其里程碑的精确修订版。',
    );
    const digest = requireRecord(row.canonical_json, row.sha256, {
      schema: VERSION_SCHEMA,
      publicationVersionId,
      bookId,
      ordinal,
      manuscriptId: head.manuscriptId,
      branchId: head.branchId,
      milestoneId,
      revisionId,
      revisionDigest,
      scope,
      basis,
      actor: ACTOR,
      createdAt,
    });
    // The permission is a record of its own, linked and never merged (PUB-003): it must exist, and it
    // must name the same Book, revision and scope as the designation it was recorded with.
    requirePublication(row.permission_id !== null, 'PUBLICATION_RECORD_INVALID', '发稿版本缺少其内部许可记录。');
    const permissionId = text(row.permission_id);
    requirePublication(
      text(row.permission_book_id) === bookId && text(row.permission_revision_id) === revisionId &&
        text(row.permission_revision_digest) === revisionDigest && text(row.permission_scope) === scope &&
        text(row.permission_actor) === ACTOR && text(row.permission_created_at) === createdAt,
      'PUBLICATION_RECORD_INVALID',
      '内部许可记录与其发稿版本不一致。',
    );
    requireRecord(row.permission_json, row.permission_sha256, {
      schema: PERMISSION_SCHEMA,
      permissionId,
      publicationVersionId,
      bookId,
      revisionId,
      revisionDigest,
      scope,
      actor: ACTOR,
      createdAt,
    });
    const events = this.#events(publicationVersionId, bookId, revisionId, createdAt);
    const prompt = events.find((event) => event.kind === 'actuals-prompt')!;
    return {
      projection: {
        publicationVersionId,
        ordinal,
        current,
        milestoneId,
        milestoneLabel: text(row.milestone_label),
        revisionId,
        revisionLabel: text(row.revision_label),
        scope,
        basis,
        actor: ACTOR,
        createdAt,
        technical: {
          revisionDigest,
          digest,
          permissionId,
          events: events.map((event) => ({ eventId: event.eventId, kind: event.kind })),
        },
        maintenance: this.#maintenance.summaries(bookId, publicationVersionId),
      },
      actualsPrompt: {
        eventId: prompt.eventId,
        publicationVersionId,
        label: PUBLICATION_ACTUALS_PROMPT_LABEL,
        stateLabel: PUBLICATION_ACTUALS_PROMPT_STATE,
        recordedAt: prompt.recordedAt,
        // The store sets what was entered for it (Issue #430, S82), from the ledger that holds it.
        actuals: null,
      },
    };
  }

  /** The two events one designation recorded, in their fixed order, each verified. */
  #events(
    publicationVersionId: string,
    bookId: string,
    revisionId: string,
    createdAt: string,
  ): Array<{ eventId: string; kind: PublicationEventKind; recordedAt: string }> {
    const rows = this.#db.prepare(
      `SELECT event_id, book_id, kind, recorded_at, canonical_json, sha256
       FROM publication_events WHERE publication_version_id = ?`,
    ).all(publicationVersionId) as SqlRow[];
    requirePublication(rows.length === PUBLICATION_EVENT_KINDS.length, 'PUBLICATION_RECORD_INVALID', '发稿版本的事件记录不完整。');
    return PUBLICATION_EVENT_KINDS.map((kind) => {
      const row = rows.find((candidate) => candidate.kind === kind);
      requirePublication(row !== undefined, 'PUBLICATION_RECORD_INVALID', '发稿版本的事件记录不完整。');
      const eventId = text(row.event_id);
      const recordedAt = text(row.recorded_at);
      requirePublication(text(row.book_id) === bookId && recordedAt === createdAt, 'PUBLICATION_RECORD_INVALID', '发稿事件与其发稿版本不一致。');
      requireRecord(row.canonical_json, row.sha256, { schema: EVENT_SCHEMA, eventId, kind, publicationVersionId, bookId, revisionId, recordedAt });
      return { eventId, kind, recordedAt };
    });
  }
}
