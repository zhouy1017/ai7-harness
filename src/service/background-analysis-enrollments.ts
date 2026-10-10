import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { BackgroundAnalysisStartingPoint, DefaultExecutionRuleBinding } from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { isDefaultExecutionRuleBinding } from './default-execution-rules.js';

/**
 * 后台分析登记 — the Background Analysis Enrollment (Issue #95, plan slice S39; ADR 0048; ADR 0046; V2-UX-ANALYSIS-016 to
 * 021): the one standing origin of an analysis AI7 starts by itself. Schema revision 66 adds three append-only relations, each
 * row carrying canonical JSON and its digest:
 *
 * - `background_analysis_enrollments`: one per Book — the scope this slice admits is the exact Book — and when it was made;
 * - `background_analysis_enrollment_versions`: what each version binds — the model service, the editorial workspace profile,
 *   the budget, the outbound data and the outcome, read from the Book's own facts when the editor enrolled it, never widened —
 *   which analysis it covers, where it starts (`prospective`: only what changes after; `backfill`: the text as it stands too),
 *   the working text it was made against, and the digest of the disclosure the editor confirmed;
 * - `background_analysis_enrollment_states`: whether the version in force is `active`, `suspended` — set by AI7, never by the
 *   editor, when the local data was replaced or rolled back, so no Enrollment arriving in restored data starts anything until
 *   the editor confirms it again — or `revoked`.
 *
 * An Enrollment is never a Run Authorization. Each Run it starts is its own Task with its own Intent, plan, envelope and Run
 * Authorization, whose origin is `background-analysis-enrollment` and which names the enrollment version. Revoking appends a
 * state: issued Runs, their results and what they sent stay as they are, and nothing is rewritten.
 */

export const BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL = {
  background_analysis_enrollments: `CREATE TABLE background_analysis_enrollments (
  enrollment_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
  scope TEXT NOT NULL CHECK(scope = 'book'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  background_analysis_enrollment_versions: `CREATE TABLE background_analysis_enrollment_versions (
  enrollment_version_id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES background_analysis_enrollments(enrollment_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  analysis_kind TEXT NOT NULL CHECK(analysis_kind = 'baseline-analysis'),
  starting_point TEXT NOT NULL CHECK(starting_point IN ('prospective', 'backfill')),
  disclosure_sha256 TEXT NOT NULL CHECK(length(disclosure_sha256) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(enrollment_id, ordinal)
) STRICT`,
  background_analysis_enrollment_states: `CREATE TABLE background_analysis_enrollment_states (
  enrollment_id TEXT NOT NULL REFERENCES background_analysis_enrollments(enrollment_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('active', 'suspended', 'revoked')),
  enrollment_version_id TEXT NOT NULL REFERENCES background_analysis_enrollment_versions(enrollment_version_id),
  actor TEXT NOT NULL CHECK(actor IN ('本机编辑', 'AI7')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(enrollment_id, sequence),
  CHECK((state = 'suspended') = (actor = 'AI7'))
) STRICT`,
} as const;

/** Every enrollment relation is a ledger: a row is appended once and never rewritten or removed. */
export const BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BACKGROUND_ANALYSIS_ENROLLMENT_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BACKGROUND_ANALYSIS_ENROLLMENT_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const BACKGROUND_ANALYSIS_ENROLLMENT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  background_analysis_enrollments: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  background_analysis_enrollment_versions: ['enrollment_id>background_analysis_enrollments.enrollment_id:NO ACTION/NO ACTION/NONE'],
  background_analysis_enrollment_states: [
    'enrollment_id>background_analysis_enrollments.enrollment_id:NO ACTION/NO ACTION/NONE',
    'enrollment_version_id>background_analysis_enrollment_versions.enrollment_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class BackgroundAnalysisEnrollmentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BackgroundAnalysisEnrollmentError';
  }
}

export function requireEnrollment(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BackgroundAnalysisEnrollmentError(code, message);
}

/**
 * Revision 66's three relations and their ledger triggers, created once and never rebuilt: a store that predates them gains
 * three empty relations and nothing existing moves. Shape-detected like revision 31's rule ledger, and run before the version is
 * stamped in `task-authorization.ts`, which widens the Run Authorizations' origin in the same revision.
 */
export function initializeBackgroundAnalysisEnrollmentSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'background_analysis_enrollments'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Background analysis enrollment schema rollback failed.');
    }
    throw error;
  }
  requireEnrollment(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

// ---- the ledger ------------------------------------------------------------------------------------------

const ENROLLMENT_SCHEMA = 'ai7.background-analysis-enrollment/1' as const;
const VERSION_SCHEMA = 'ai7.background-analysis-enrollment.version/1' as const;
const STATE_SCHEMA = 'ai7.background-analysis-enrollment.state/1' as const;
const ACTOR = '本机编辑' as const;
/** The one kind an Enrollment may cover in this slice, and the two ways it may bring that kind up to date (S39 D1). */
export const BACKGROUND_ANALYSIS_KIND = 'baseline-analysis' as const;
export const BACKGROUND_ANALYSIS_MODES = ['first-baseline', 'sync-current'] as const;

/** The working text an Enrollment was made against: a `prospective` one starts only once it has moved. */
export interface BackgroundAnalysisWorkingPoint {
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
}

export interface BackgroundAnalysisEnrollmentVersionRecord {
  enrollmentVersionId: string;
  ordinal: number;
  startingPoint: BackgroundAnalysisStartingPoint;
  binding: DefaultExecutionRuleBinding;
  enrolledAt: BackgroundAnalysisWorkingPoint;
  disclosureDigest: string;
  createdAt: string;
}

export type BackgroundAnalysisEnrollmentState = 'active' | 'suspended' | 'revoked';
const STATES: ReadonlyArray<BackgroundAnalysisEnrollmentState> = ['active', 'suspended', 'revoked'];
function isState(value: string): value is BackgroundAnalysisEnrollmentState {
  return (STATES as ReadonlyArray<string>).includes(value);
}

/** One Book's Enrollment as the ledger holds it: the version in force — or the last one, once suspended or revoked — and its state. */
export interface BackgroundAnalysisEnrollmentRecord {
  enrollmentId: string;
  bookId: string;
  createdAt: string;
  state: BackgroundAnalysisEnrollmentState;
  stateRecordedAt: string;
  version: BackgroundAnalysisEnrollmentVersionRecord;
}

type SqlRow = Record<string, SQLOutputValue>;

function text(value: SQLOutputValue | undefined): string {
  requireEnrollment(typeof value === 'string', 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireEnrollment(typeof value === 'number' && Number.isSafeInteger(value), 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记记录无效。');
  return value;
}

function isWorkingPoint(value: unknown): value is BackgroundAnalysisWorkingPoint {
  return isRecord(value) && typeof value.revisionId === 'string' && UUID_PATTERN.test(value.revisionId) &&
    Number.isSafeInteger(value.journalSequence) && (value.journalSequence as number) >= 0 &&
    typeof value.workingDigest === 'string' && DIGEST_PATTERN.test(value.workingDigest) && Object.keys(value).length === 3;
}

/** A stored row read back: its canonical JSON digests to the recorded SHA-256 and names exactly the facts its columns hold. */
function requireRecord(row: SqlRow, facts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const canonical = text(row.canonical_json);
  const recorded = text(row.sha256);
  requireEnrollment(DIGEST_PATTERN.test(recorded) && sha256Hex(canonical) === recorded, 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记记录与其摘要不一致。');
  const record = parseCanonicalJson(canonical);
  requireEnrollment(isRecord(record) && Object.entries(facts).every(([key, value]) => record[key] === value),
    'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记记录与其字段不一致。');
  return record as Record<string, unknown>;
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Background analysis enrollment transaction rollback failed.');
    }
    throw error;
  }
}

/**
 * The enrollment ledger of one store. Enrolling appends — the Book's Enrollment with its first version, or, once revoked, its
 * next version — and the state that puts it in force; revoking appends a state. Nothing is rewritten, so every version a Run
 * Authorization ever named stays readable, and no rollback or merge can make a revoked version active again.
 */
export class BackgroundAnalysisEnrollmentLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * `登记` from the disclosure the editor confirmed. A Book whose Enrollment is in force is not enrolled again: the same
   * confirmation answers with it as it is, and any other is refused — revoke first, then enroll anew.
   */
  enroll(input: {
    bookId: string;
    startingPoint: BackgroundAnalysisStartingPoint;
    binding: DefaultExecutionRuleBinding;
    enrolledAt: BackgroundAnalysisWorkingPoint;
    disclosureDigest: string;
  }): BackgroundAnalysisEnrollmentRecord {
    requireEnrollment(UUID_PATTERN.test(input.bookId) && (input.startingPoint === 'prospective' || input.startingPoint === 'backfill') &&
      isDefaultExecutionRuleBinding(input.binding) && isWorkingPoint(input.enrolledAt) && DIGEST_PATTERN.test(input.disclosureDigest),
    'BACKGROUND_ANALYSIS_ENROLLMENT_INVALID', '后台分析登记的参数无效。');
    return transact(this.#db, () => {
      const now = new Date().toISOString();
      let enrollmentId = this.#enrollmentId(input.bookId);
      const current = enrollmentId === null ? null : this.#read(enrollmentId);
      if (current !== null && current.state === 'active') {
        requireEnrollment(current.version.disclosureDigest === input.disclosureDigest && current.version.startingPoint === input.startingPoint,
          'BACKGROUND_ANALYSIS_ENROLLMENT_ACTIVE', '这本书已经登记了后台分析；要改，请先撤销登记再重新登记。');
        return current;
      }
      if (enrollmentId === null) {
        enrollmentId = randomUUID();
        const enrollment = canonicalRecord({ schema: ENROLLMENT_SCHEMA, enrollmentId, bookId: input.bookId, scope: 'book', createdAt: now });
        this.#db.prepare(
          `INSERT INTO background_analysis_enrollments(enrollment_id, book_id, scope, created_at, canonical_json, sha256)
           VALUES (?, ?, 'book', ?, ?, ?)`,
        ).run(enrollmentId, input.bookId, now, enrollment.json, enrollment.digest);
      }
      const enrollmentVersionId = randomUUID();
      const ordinal = current === null ? 1 : current.version.ordinal + 1;
      const version = canonicalRecord({
        schema: VERSION_SCHEMA, enrollmentVersionId, enrollmentId, ordinal, analysisKind: BACKGROUND_ANALYSIS_KIND,
        modes: [...BACKGROUND_ANALYSIS_MODES], startingPoint: input.startingPoint, binding: input.binding, enrolledAt: input.enrolledAt,
        disclosureDigest: input.disclosureDigest, actor: ACTOR, createdAt: now,
      });
      this.#db.prepare(
        `INSERT INTO background_analysis_enrollment_versions(enrollment_version_id, enrollment_id, ordinal, analysis_kind, starting_point, disclosure_sha256, actor, created_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(enrollmentVersionId, enrollmentId, ordinal, BACKGROUND_ANALYSIS_KIND, input.startingPoint, input.disclosureDigest, ACTOR, now, version.json, version.digest);
      this.#appendState(enrollmentId, 'active', enrollmentVersionId, now);
      return this.#read(enrollmentId)!;
    });
  }

  /**
   * After the local data was replaced or rolled back (ADR 0045:54's reading, the Commander's ruling on #713): every Enrollment
   * the restored data holds in force is suspended by AI7 and starts nothing until the editor confirms it again through its
   * disclosure, as the next version. A revoked one stays revoked. Answers how many were suspended.
   */
  suspendActive(): number {
    return transact(this.#db, () => {
      const now = new Date().toISOString();
      let suspended = 0;
      for (const bookId of this.enrolledBooks()) {
        const enrollmentId = this.#enrollmentId(bookId)!;
        let current: BackgroundAnalysisEnrollmentRecord | null;
        try {
          current = this.#read(enrollmentId);
        } catch (error) {
          // A damaged record starts nothing anyway; it is said as damaged where the Book is read.
          if (error instanceof BackgroundAnalysisEnrollmentError) continue;
          throw error;
        }
        if (current === null || current.state !== 'active') continue;
        this.#appendState(enrollmentId, 'suspended', current.version.enrollmentVersionId, now);
        suspended += 1;
      }
      return suspended;
    });
  }

  /** `撤销登记`: the Enrollment stays on record with every version, and no new Run starts under it. Revoking twice answers as once. */
  revoke(enrollmentId: string): BackgroundAnalysisEnrollmentRecord {
    requireEnrollment(UUID_PATTERN.test(enrollmentId), 'BACKGROUND_ANALYSIS_ENROLLMENT_INVALID', '后台分析登记标识无效。');
    return transact(this.#db, () => {
      const current = this.#read(enrollmentId);
      requireEnrollment(current !== null, 'BACKGROUND_ANALYSIS_ENROLLMENT_NOT_FOUND', '这份后台分析登记不存在。');
      if (current.state === 'revoked') return current;
      this.#appendState(enrollmentId, 'revoked', current.version.enrollmentVersionId, new Date().toISOString());
      return this.#read(enrollmentId)!;
    });
  }

  /** The Book's Enrollment, in force or revoked; `null` when none was ever made. */
  forBook(bookId: string): BackgroundAnalysisEnrollmentRecord | null {
    const enrollmentId = this.#enrollmentId(bookId);
    return enrollmentId === null ? null : this.#read(enrollmentId);
  }

  /**
   * Every Book that has an Enrollment, in the order they were made, read without verifying a record: what the dispatcher looks
   * at, one Book at a time, so a damaged record stops only its own Book (#713 review, P3-6).
   */
  enrolledBooks(): ReadonlyArray<string> {
    const rows = this.#db.prepare('SELECT book_id FROM background_analysis_enrollments ORDER BY created_at, rowid').all() as SqlRow[];
    return rows.map((row) => text(row.book_id));
  }

  /** Every Book's Enrollment in force, in the order they were made; a damaged record is left out rather than stopping the rest. */
  active(): ReadonlyArray<BackgroundAnalysisEnrollmentRecord> {
    const records: BackgroundAnalysisEnrollmentRecord[] = [];
    for (const bookId of this.enrolledBooks()) {
      try {
        const record = this.forBook(bookId);
        if (record !== null && record.state === 'active') records.push(record);
      } catch (error) {
        if (!(error instanceof BackgroundAnalysisEnrollmentError)) throw error;
      }
    }
    return records;
  }

  /** The Enrollment a version belongs to and that version, whichever is in force now: a Run names the one it started under. */
  version(enrollmentVersionId: string): { enrollment: BackgroundAnalysisEnrollmentRecord; version: BackgroundAnalysisEnrollmentVersionRecord } | null {
    requireEnrollment(UUID_PATTERN.test(enrollmentVersionId), 'BACKGROUND_ANALYSIS_ENROLLMENT_INVALID', '后台分析登记版本标识无效。');
    const row = this.#db.prepare('SELECT * FROM background_analysis_enrollment_versions WHERE enrollment_version_id = ?').get(enrollmentVersionId) as SqlRow | undefined;
    if (row === undefined) return null;
    const enrollment = this.#read(text(row.enrollment_id));
    requireEnrollment(enrollment !== null, 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记版本指向的登记不存在。');
    return { enrollment, version: this.#versionOf(row) };
  }

  /**
   * The Book's Enrollment's newest states, newest first and at most `limit` of them, with how many there are: its history, which
   * revoking never shortens.
   */
  history(bookId: string, limit: number): { entries: ReadonlyArray<{ state: BackgroundAnalysisEnrollmentState; ordinal: number; recordedAt: string }>; count: number } {
    const enrollmentId = this.#enrollmentId(bookId);
    if (enrollmentId === null) return { entries: [], count: 0 };
    const rows = this.#db.prepare(
      `SELECT s.state, s.recorded_at, v.ordinal FROM background_analysis_enrollment_states s
       JOIN background_analysis_enrollment_versions v ON v.enrollment_version_id = s.enrollment_version_id
       WHERE s.enrollment_id = ? ORDER BY s.sequence DESC LIMIT ?`,
    ).all(enrollmentId, limit) as SqlRow[];
    const count = integer((this.#db.prepare('SELECT count(*) n FROM background_analysis_enrollment_states WHERE enrollment_id = ?').get(enrollmentId) as SqlRow).n);
    return {
      entries: rows.map((row) => {
        const state = text(row.state);
        requireEnrollment(isState(state), 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记状态无效。');
        return { state, ordinal: integer(row.ordinal), recordedAt: text(row.recorded_at) };
      }),
      count,
    };
  }

  #enrollmentId(bookId: string): string | null {
    const row = this.#db.prepare('SELECT enrollment_id FROM background_analysis_enrollments WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    return row === undefined ? null : text(row.enrollment_id);
  }

  #appendState(enrollmentId: string, state: BackgroundAnalysisEnrollmentState, enrollmentVersionId: string, recordedAt: string): void {
    const last = this.#db.prepare('SELECT max(sequence) last FROM background_analysis_enrollment_states WHERE enrollment_id = ?').get(enrollmentId) as SqlRow;
    const sequence = last.last === null ? 1 : integer(last.last) + 1;
    // A suspension is AI7's, after the local data was replaced; every other state is the editor's decision.
    const actor = state === 'suspended' ? 'AI7' : ACTOR;
    const record = canonicalRecord({ schema: STATE_SCHEMA, enrollmentId, sequence, state, enrollmentVersionId, actor, recordedAt });
    this.#db.prepare(
      `INSERT INTO background_analysis_enrollment_states(enrollment_id, sequence, state, enrollment_version_id, actor, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(enrollmentId, sequence, state, enrollmentVersionId, actor, recordedAt, record.json, record.digest);
  }

  #versionOf(row: SqlRow): BackgroundAnalysisEnrollmentVersionRecord {
    const enrollmentVersionId = text(row.enrollment_version_id);
    const ordinal = integer(row.ordinal);
    const startingPoint = text(row.starting_point);
    const disclosureDigest = text(row.disclosure_sha256);
    const createdAt = text(row.created_at);
    requireEnrollment(startingPoint === 'prospective' || startingPoint === 'backfill', 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记的起点无效。');
    const record = requireRecord(row, {
      schema: VERSION_SCHEMA, enrollmentVersionId, enrollmentId: text(row.enrollment_id), ordinal, analysisKind: text(row.analysis_kind),
      startingPoint, disclosureDigest, actor: text(row.actor), createdAt,
    });
    requireEnrollment(record.analysisKind === BACKGROUND_ANALYSIS_KIND && Array.isArray(record.modes) &&
      JSON.stringify(record.modes) === JSON.stringify(BACKGROUND_ANALYSIS_MODES) && isDefaultExecutionRuleBinding(record.binding) &&
      isWorkingPoint(record.enrolledAt),
    'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记记录的绑定无效。');
    return { enrollmentVersionId, ordinal, startingPoint, binding: record.binding, enrolledAt: record.enrolledAt, disclosureDigest, createdAt };
  }

  /** One Enrollment, read back and verified: the Enrollment row, its last state, and the version that state names. */
  #read(enrollmentId: string): BackgroundAnalysisEnrollmentRecord | null {
    const row = this.#db.prepare('SELECT * FROM background_analysis_enrollments WHERE enrollment_id = ?').get(enrollmentId) as SqlRow | undefined;
    if (row === undefined) return null;
    const bookId = text(row.book_id);
    const createdAt = text(row.created_at);
    requireRecord(row, { schema: ENROLLMENT_SCHEMA, enrollmentId, bookId, scope: text(row.scope), createdAt });
    const stateRow = this.#db.prepare('SELECT * FROM background_analysis_enrollment_states WHERE enrollment_id = ? ORDER BY sequence DESC LIMIT 1').get(enrollmentId) as SqlRow | undefined;
    // An Enrollment, its first version and its first state are written in one transaction: one without a state is not one this ledger wrote.
    requireEnrollment(stateRow !== undefined, 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记缺少状态记录。');
    const state = text(stateRow.state);
    requireEnrollment(isState(state), 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记状态无效。');
    const stateRecordedAt = text(stateRow.recorded_at);
    const enrollmentVersionId = text(stateRow.enrollment_version_id);
    requireRecord(stateRow, {
      schema: STATE_SCHEMA, enrollmentId, sequence: integer(stateRow.sequence), state, enrollmentVersionId, actor: text(stateRow.actor), recordedAt: stateRecordedAt,
    });
    const versionRow = this.#db.prepare('SELECT * FROM background_analysis_enrollment_versions WHERE enrollment_version_id = ? AND enrollment_id = ?')
      .get(enrollmentVersionId, enrollmentId) as SqlRow | undefined;
    requireEnrollment(versionRow !== undefined, 'BACKGROUND_ANALYSIS_ENROLLMENT_RECORD_INVALID', '后台分析登记状态指向的版本不存在。');
    return { enrollmentId, bookId, createdAt, state, stateRecordedAt, version: this.#versionOf(versionRow) };
  }
}


// ---- the dispatcher's decision ------------------------------------------------------------------------------

/** How long the manuscript must have stood still since its last confirmed edit before a background Run starts on it. */
export const BACKGROUND_ANALYSIS_QUIET_MS = 30_000;
/** How often the service looks at every Enrollment. */
export const BACKGROUND_ANALYSIS_TICK_MS = 5_000;
/** How many of the Enrollment's newest states and started Runs ②A lists. */
export const BACKGROUND_ANALYSIS_LISTED = 10;

/**
 * How many of the governor's places background Runs may hold at once (the Commander's default on #713, P3-2): all but one, so
 * one is always left for a Task the editor starts. A governor of one place leaves background analysis none.
 */
export function backgroundAnalysisShare(capacity: number): number {
  return Math.max(0, capacity - 1);
}

/**
 * What the Book's Enrollment would do now, as the dispatcher and ②A read it alike: `start` names the mode it would start; every
 * other answer starts nothing and says why. Each check is a fact the store reads; the order is the order they are said in.
 */
export type BackgroundAnalysisDecision =
  | { readonly kind: 'start'; readonly mode: (typeof BACKGROUND_ANALYSIS_MODES)[number]; readonly reason: string }
  | { readonly kind: 'none' | 'wait' | 'stopped'; readonly reason: string };

export interface BackgroundAnalysisFacts {
  /** The Book's Enrollment state; `null` when it has none, `damaged` when its record does not read back. */
  readonly enrollment: BackgroundAnalysisEnrollmentState | 'damaged' | null;
  readonly developerLive: boolean;
  readonly routeExecutable: boolean;
  /** How many places background Runs may hold at once (`backgroundAnalysisShare`). */
  readonly share: number;
  /** A replacement of the local data waits for AI7's next start: nothing is written until then (#713 round 3, P3-1). */
  readonly replacementWaiting: boolean;
  /** The manuscript waits on a recovery attention, pending or deferred: nothing may checkpoint it (#713 re-review, P2-1). */
  readonly recoveryPending: boolean;
  /** The fields in which the Book's facts now differ from what the Enrollment binds, in the drawer's words; `null` unreadable. */
  readonly drift: ReadonlyArray<string> | null;
  /** A preparation of the Book is under way, the editor's or another kind's: AI7 never steps in beside one (P1-2). */
  readonly preparationInFlight: boolean;
  /** A job the editor asked for — a search, an export, a preparation — is queued or under way (#713 re-review, P3-5). */
  readonly editorJobRunning: boolean;
  /** The latest Result Set Revision: absent, current, or stale against the working text. */
  readonly analysis: 'absent' | 'current' | 'stale';
  /** The editor's own Task of the Book is prepared and not started, or a Run of the Book has not ended. */
  readonly taskUnfinished: 'prepared' | 'run' | null;
  /**
   * The text moved since the editor's latest Task of the Book: AI7 never redoes a Task the editor ran, cancelled or let fail,
   * and so never takes away its 改计划重做 — it acts only on edits made after it (#713 review, P2-4).
   */
  readonly changedSinceEditorTask: boolean;
  readonly startingPoint: BackgroundAnalysisStartingPoint;
  /** Whether the working text moved since the Enrollment was made. */
  readonly movedSinceEnrollment: boolean;
  /**
   * The Book's latest revision holds ranges whose request was sent and whose result is unknown (Issue #51, S16c): any Task
   * that brings the analysis up to date would send them again, which only the editor may start (CTRL-007, CONT-011).
   */
  readonly unconfirmedPending: boolean;
  /** The Book's latest Task — anyone's — read exactly this working text and did not bring the analysis up to it. */
  readonly attemptedAtThisText: boolean;
  /** How long ago the last confirmed edit of the manuscript was made, whatever revision it was made on; `null` when none was. */
  readonly sinceLastEditMs: number | null;
  readonly quietMs: number;
  readonly placeFree: boolean;
  /** How many background Runs hold a place, or wait for one, now. */
  readonly backgroundRunning: number;
}

/** Each fact read only when the decision reaches it: the dispatcher's look and ②A's answer are one function (#713 re-review, P3-2). */
export type BackgroundAnalysisFactReader = { readonly [Fact in keyof BackgroundAnalysisFacts]: () => BackgroundAnalysisFacts[Fact] };

/**
 * The decision, reading each fact only when it is reached, in the order its reasons are said: the facts that need least are
 * asked first, so a Book with nothing to do costs no projection, and the dispatcher's look and ②A's answer always agree.
 */
export function backgroundAnalysisDecisionOf(read: BackgroundAnalysisFactReader): BackgroundAnalysisDecision {
  const enrollment = read.enrollment();
  if (enrollment === null) return { kind: 'none', reason: BACKGROUND_NOT_ENROLLED };
  if (enrollment === 'damaged') return { kind: 'stopped', reason: BACKGROUND_RECORD_DAMAGED };
  if (enrollment === 'revoked') return { kind: 'stopped', reason: BACKGROUND_REVOKED };
  if (enrollment === 'suspended') return { kind: 'stopped', reason: BACKGROUND_SUSPENDED };
  if (read.developerLive()) return { kind: 'stopped', reason: BACKGROUND_DEVELOPER_LIVE };
  if (!read.routeExecutable()) return { kind: 'stopped', reason: BACKGROUND_NO_ROUTE };
  if (read.replacementWaiting()) return { kind: 'wait', reason: BACKGROUND_REPLACEMENT_WAITING };
  const share = read.share();
  if (share < 1) return { kind: 'stopped', reason: BACKGROUND_NO_SHARE };
  if (read.recoveryPending()) return { kind: 'wait', reason: BACKGROUND_RECOVERY_PENDING };
  const drift = read.drift();
  if (drift === null) return { kind: 'stopped', reason: BACKGROUND_FACTS_UNREADABLE };
  if (drift.length > 0) return { kind: 'stopped', reason: backgroundDriftReason(drift) };
  if (read.preparationInFlight()) return { kind: 'wait', reason: BACKGROUND_PREPARATION_IN_FLIGHT };
  if (read.editorJobRunning()) return { kind: 'wait', reason: BACKGROUND_EDITOR_JOB };
  const analysis = read.analysis();
  if (analysis === 'current') return { kind: 'none', reason: BACKGROUND_CURRENT };
  const unfinished = read.taskUnfinished();
  if (unfinished === 'run') return { kind: 'wait', reason: BACKGROUND_TASK_RUNNING };
  if (unfinished === 'prepared') return { kind: 'wait', reason: BACKGROUND_TASK_PREPARED };
  if (!read.changedSinceEditorTask()) return { kind: 'none', reason: BACKGROUND_EDITOR_TASK };
  if (read.startingPoint() === 'prospective' && !read.movedSinceEnrollment()) return { kind: 'none', reason: BACKGROUND_NOT_MOVED };
  if (read.unconfirmedPending()) return { kind: 'wait', reason: BACKGROUND_OUTCOME_UNKNOWN };
  if (read.attemptedAtThisText()) return { kind: 'wait', reason: BACKGROUND_ATTEMPTED };
  const sinceLastEditMs = read.sinceLastEditMs();
  const quietMs = read.quietMs();
  if (sinceLastEditMs !== null && sinceLastEditMs < quietMs) return { kind: 'wait', reason: backgroundQuietReason(quietMs) };
  if (!read.placeFree()) return { kind: 'wait', reason: BACKGROUND_PLACE_BUSY };
  if (read.backgroundRunning() >= share) return { kind: 'wait', reason: backgroundShareFullReason(share) };
  return analysis === 'absent'
    ? { kind: 'start', mode: 'first-baseline', reason: BACKGROUND_START_FIRST }
    : { kind: 'start', mode: 'sync-current', reason: BACKGROUND_START_SYNC };
}

/** The decision over facts already read. */
export function backgroundAnalysisDecision(facts: BackgroundAnalysisFacts): BackgroundAnalysisDecision {
  const read = Object.fromEntries(Object.entries(facts).map(([fact, value]) => [fact, () => value])) as unknown as BackgroundAnalysisFactReader;
  return backgroundAnalysisDecisionOf(read);
}

// ---- words -----------------------------------------------------------------------------------------------

export const BACKGROUND_STATE_LABELS = {
  none: '未登记',
  active: '已登记',
  suspended: '待你确认',
  revoked: '已撤销',
  damaged: '登记记录无法读取',
} as const;
/** ②A's statement of what an Enrollment is (ADR 0048; V2-UX-ANALYSIS-017). */
export const BACKGROUND_ANALYSIS_STATEMENT =
  '登记后台分析后，这本书的稿件有了已确认的改动、停下一会儿，AI7 会自己开始一次基线分析，把结果带到当前稿件；每次开始都会留下那一次的计划和运行授权，并写明按哪一版登记开始。撤销后不再开始新的后台分析。';
export const BACKGROUND_ANALYSIS_WHAT = '基线分析：还没有结果时做首次基线分析；结果过期时同步到当前稿件，只重算改动过的部分。';
export function backgroundAnalysisWhen(quietMs: number): string {
  return `稿件有已确认的改动并停下 ${Math.round(quietMs / 1000)} 秒后开始；你正在准备或运行这本书的任务时不开始，也不重做你开始过的任务；运行名额总给你留一个，不够时等下一次，不排队等候。`;
}
export const BACKGROUND_ANALYSIS_NOT_GRANTED: ReadonlyArray<string> = [
  '不改动稿件，不采纳或应用任何建议',
  '不做其他种类的分析，不做事实核查，不联网检索',
  '不用于学习，不改动工序、规则或方案',
  '开发者实时模式下不开始，也不发送任何内容',
];
export const BACKGROUND_STARTING_POINT_LABELS: Readonly<Record<BackgroundAnalysisStartingPoint, string>> = {
  prospective: '只分析登记之后的改动',
  backfill: '现在也分析当前稿件',
};
export const BACKGROUND_STARTING_POINT_NOTES: Readonly<Record<BackgroundAnalysisStartingPoint, string>> = {
  prospective: '登记时的稿件不分析；之后稿件改动了才开始。',
  backfill: '登记后，只要结果与当前稿件不一致（或还没有结果），就开始。',
};
export const BACKGROUND_REVOKE_CONSEQUENCES: ReadonlyArray<string> = [
  'AI7 不再为这本书开始新的后台分析',
  '已经开始的运行照常进行，可以在它的计划里暂停或取消',
  '已有的结果、运行记录、已经发送的内容和这份登记的历史都保留，不会撤回或改写',
];

export const BACKGROUND_NOT_ENROLLED = '这本书没有登记后台分析：只有你开始的任务才会运行。';
export const BACKGROUND_RECORD_DAMAGED = '这本书的后台分析登记记录无法读取，后台分析不会开始；其他图书不受影响。';
export const BACKGROUND_REVOKED = '已撤销：不会再开始新的后台分析。';
export const BACKGROUND_SUSPENDED = '本机数据替换或回滚后，这份登记待你确认：重新登记之前不会开始后台分析。';
export const BACKGROUND_DEVELOPER_LIVE = '开发者实时模式下不进行后台分析：每次都先看计划，再开始任务。';
export const BACKGROUND_NO_ROUTE = '这次启动没有可执行的分析路由，后台分析不会开始。';
export const BACKGROUND_NO_SHARE = '本机一次只运行一个任务，这个名额留给你开始的任务，后台分析不会开始。';
export const BACKGROUND_FACTS_UNREADABLE = '读不到这本书的分析设置，后台分析不会开始。';
export function backgroundDriftReason(labels: ReadonlyArray<string>): string {
  return `登记时定下的${labels.map((label) => `「${label}」`).join('、')}已经变化，后台分析不会按旧的登记开始；请撤销后重新登记。`;
}
export const BACKGROUND_REPLACEMENT_WAITING = '本机数据正在等待替换：后台分析不开始。';
export const BACKGROUND_RECOVERY_PENDING = '这本书的稿件有恢复待确认：处理之前不能为任务建立固定点，后台分析不会开始。';
export const BACKGROUND_EDITOR_JOB = '你有一项操作正在进行；它结束后再看。';
export const BACKGROUND_PREPARATION_IN_FLIGHT = '正在准备一项任务；准备结束后再看，后台分析不会接手或替换它。';
export const BACKGROUND_TASK_RUNNING = '这本书有一项任务还没结束；它结束后再看。';
export const BACKGROUND_TASK_PREPARED = '这本书有一份你准备好但还没开始的计划；开始它，或另外准备一份之后再看。';
export const BACKGROUND_CURRENT = '分析结果与当前稿件一致，没有要做的。';
export const BACKGROUND_EDITOR_TASK = '你最近开始或准备过的任务之后，稿件还没有新的改动：后台分析不重做你开始过的任务。';
export const BACKGROUND_NOT_MOVED = '登记之后稿件还没有改动。';
/** 结果待确认 (Issue #51, S16c): the dispatcher never re-sends a request whose result is unknown; the editor starts that Task. */
export const BACKGROUND_OUTCOME_UNKNOWN = '最新的分析里有阅读范围的请求结果待确认；再分析会再发一次它，所以后台不开始，等你自己开始一项任务。';
export const BACKGROUND_ATTEMPTED = '最近一项任务读的就是这一版稿件，没有把结果带到它；稿件再改动后才会再试。';
export function backgroundQuietReason(quietMs: number): string {
  return `稿件刚改动过；停下 ${Math.round(quietMs / 1000)} 秒后开始。`;
}
export const BACKGROUND_PLACE_BUSY = '运行名额已满；有空位后再开始。';
export function backgroundShareFullReason(share: number): string {
  return `后台分析最多同时占用 ${share} 个运行名额，总给你留一个；有空位后再开始。`;
}
export const BACKGROUND_START_FIRST = '条件满足：即将开始首次基线分析。';
export const BACKGROUND_START_SYNC = '条件满足：即将同步到当前稿件。';
export const BACKGROUND_ENROLL_DEVELOPER_LIVE = '开发者实时模式下不能登记后台分析：每次都先看计划，再开始任务。';
export const BACKGROUND_ENROLL_NO_ROUTE = '这次启动没有可执行的分析路由：登记了也不会开始后台分析，所以现在不能登记。';
export const BACKGROUND_ENROLL_NO_SHARE = '本机一次只运行一个任务，后台分析没有可用的运行名额，所以现在不能登记。';
export const BACKGROUND_ENROLL_STALE = '登记内容已经变化；请重新打开登记后再确认。';
/** The background checkpoint gave way: the manuscript changed under it, or another Task took a checkpoint of the branch. */
export const BACKGROUND_CHECKPOINT_PREEMPTED = '稿件在准备中变化，或另一项任务为它建立了固定点；后台分析让开，下次再看。';
export const BACKGROUND_PREPARATION_INCOMPLETE = '准备没有完成。';
/**
 * Why a preparation step failed, in the editor's words (#713 round 3, P3-3): a known refusal by its code, anything else as a
 * preparation that did not complete — never the engineering message itself.
 */
export function backgroundStepFailureReason(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
    ? (error as { code: string }).code : null;
  switch (code) {
    case 'JOB_NOT_FOUND':
    case 'REIMPORT_CHECKPOINT_STALE':
    case 'SERVICE_BUSY':
      return BACKGROUND_CHECKPOINT_PREEMPTED;
    case 'RECOVERY_ATTENTION_REQUIRED':
      return BACKGROUND_RECOVERY_PENDING;
    case 'ANALYSIS_PREPARATION_IN_FLIGHT':
    case 'ANALYSIS_TASK_PREPARED':
      return BACKGROUND_PREPARATION_IN_FLIGHT;
    default:
      return BACKGROUND_PREPARATION_INCOMPLETE;
  }
}

/** A pass that prepared a plan and then did not start it: the plan is the Enrollment's, never left as the editor's. */
export function backgroundNotStartedReason(reason: string): string {
  return `后台分析这次没有开始：${reason}`;
}
export function backgroundEnrollmentName(ordinal: number): string {
  return `后台分析登记 · 第 ${ordinal} 版`;
}
