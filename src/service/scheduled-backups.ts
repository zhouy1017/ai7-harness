import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_SCHEDULED_BACKUPS_LISTED,
  type DatabaseExportContentsProjection,
  type ScheduledBackupFailureProjection,
  type ScheduledBackupFailureReason,
  type ScheduledBackupProjection,
  type ScheduledBackupsProjection,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { DATABASE_PACKAGE_EXTENSION, writeDatabasePackage } from './database-exports.js';
import { fileDigest, takeFreeName } from './manuscript-export.js';

/**
 * 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7): a switch, off by default. On, AI7 writes the
 * database package of S86a once a day into the fixed backup location beside the Agent Data Root, keeps fourteen days of
 * them, and never a credential. The switch is the decision (§1.7): no External Export Policy approval and no picker, and
 * nothing is written anywhere but that location. Turning it off makes no more backups; those kept stay until their
 * fourteen days pass.
 *
 * Every backup is made on the service's background check — at start, hourly, and at once when the switch is turned on —
 * and never inside a request, so no window waits on the write (Issue #434 review). A check first clears what a check cut
 * off left and removes every backup whose days passed, each on its own, and only then writes. It removes nothing but a
 * file it made: one of its own names, whose size and digest are the ones recorded.
 *
 * Schema revision 56 owns three relations, ledgers like the others: the switch's changes, chained; each backup made, with
 * its file's name, size and digest; and each backup removed — its fourteen days passed, its file was found gone, or the
 * file at its name was found to be another, which is left where it is. Every read of them is a stream, verified row by row
 * and holding no more than it answers (Issue #434 review): fourteen days of files is not fourteen days of records.
 */

export const BACKUP_KEPT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A backup is due when none was made in the day before. */
export const BACKUP_INTERVAL_MS = DAY_MS;
/** How often the running service asks whether one is due. */
export const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PREFERENCE_SCHEMA = 'ai7.scheduled-backup.preference/1' as const;
const BACKUP_SCHEMA = 'ai7.scheduled-backup/1' as const;
const REMOVAL_SCHEMA = 'ai7.scheduled-backup.removal/1' as const;
/** How many backups whose days passed a check reads at a time: it removes them in turns of this many. */
const EXPIRY_BATCH = 16;

/**
 * The one form a backup's name takes, and the only one a record may name (Issue #434 review): a name that leaves the
 * backup location, or names anything else in it, is never AI7's to remove.
 */
export const BACKUP_FILE_NAME = /^AI7 自动备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db$/u;
const BACKUP_FILE_NAME_GLOB = 'AI7 自动备份 [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]-[0-9][0-9]-[0-9][0-9].ai7db';
/** What a check cut off leaves: the package it was writing, and the copy of the store that package is made from. */
const PARTIAL_FILE_NAME = /^\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ai7db\.partial(?:\.store)?$/u;

export const SCHEDULED_BACKUP_SCHEMA_SQL = {
  backup_preferences: `CREATE TABLE backup_preferences (
  preference_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  supersedes_preference_id TEXT REFERENCES backup_preferences(preference_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_preference_id IS NULL))
) STRICT`,
  scheduled_backups: `CREATE TABLE scheduled_backups (
  backup_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL UNIQUE CHECK(file_name GLOB '${BACKUP_FILE_NAME_GLOB}'),
  byte_length INTEGER NOT NULL CHECK(byte_length > 0),
  file_sha256 TEXT NOT NULL CHECK(length(file_sha256) = 64),
  data_version INTEGER NOT NULL CHECK(data_version >= 1),
  schema_revision INTEGER NOT NULL CHECK(schema_revision >= 1),
  software_version TEXT NOT NULL CHECK(length(software_version) BETWEEN 1 AND 64),
  contents_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  scheduled_backup_removals: `CREATE TABLE scheduled_backup_removals (
  removal_id TEXT PRIMARY KEY,
  backup_id TEXT NOT NULL UNIQUE REFERENCES scheduled_backups(backup_id),
  reason TEXT NOT NULL CHECK(reason IN ('expired', 'missing', 'changed')),
  removed_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

/** Every backup relation is a ledger: a row is appended once and never rewritten or removed. */
export const SCHEDULED_BACKUP_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(SCHEDULED_BACKUP_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SCHEDULED_BACKUP_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SCHEDULED_BACKUP_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const SCHEDULED_BACKUP_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  backup_preferences: ['supersedes_preference_id>backup_preferences.preference_id:NO ACTION/NO ACTION/NONE'],
  scheduled_backup_removals: ['backup_id>scheduled_backups.backup_id:NO ACTION/NO ACTION/NONE'],
};

export class ScheduledBackupError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ScheduledBackupError';
  }
}

function requireBackup(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ScheduledBackupError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'backup_preferences'";
const INVALID = '定期自动备份的记录已损坏。';

/** Revision 56's relations, created once: a store that predates them gains three empty ledgers and nothing existing moves. */
export function initializeScheduledBackupSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(SCHEDULED_BACKUP_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(SCHEDULED_BACKUP_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Scheduled backup schema rollback failed.');
    }
    throw error;
  }
}

/** The fixed backup location beside the Agent Data Root (ADR 0079 §1.4): its sibling `<name>-backups`, never a link. */
export function backupLocationFor(dataRoot: string): string {
  return `${dataRoot}-backups`;
}

async function verifiedLocation(location: string): Promise<string> {
  const info = await lstat(location);
  requireBackup(info.isDirectory() && !info.isSymbolicLink() && (await realpath(location)) === location,
    'BACKUP_LOCATION_INVALID', '备份位置不可用。');
  return location;
}

async function ensureBackupLocation(dataRoot: string): Promise<string> {
  const location = backupLocationFor(dataRoot);
  await mkdir(location, { recursive: true });
  return verifiedLocation(location);
}

/** The backup location when it exists, verified as when it is made; `null` before the first backup made it. */
async function existingBackupLocation(dataRoot: string): Promise<string | null> {
  const location = backupLocationFor(dataRoot);
  if (!(await present(location))) return null;
  return verifiedLocation(location);
}

async function present(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Why a check made no backup, as the section states it: the file system's refusal by its code, never its words or a path. */
export function backupFailureReason(error: unknown): ScheduledBackupFailureReason {
  switch (typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined) {
    case 'ENOSPC':
    case 'EDQUOT':
      return 'no-space';
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return 'not-writable';
    case 'BACKUP_LOCATION_INVALID':
    case 'BACKUP_LOCATION_UNSUPPORTED':
    case 'EEXIST':
    case 'ENOTDIR':
      return 'location-unavailable';
    case 'DATABASE_PACKAGE_TOO_LARGE':
      return 'too-large';
    default:
      return 'other';
  }
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** `AI7 自动备份 2026-09-25 22-30-05.ai7db`, in the computer's own time. */
export function backupFileName(at: Date): string {
  return `AI7 自动备份 ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}${DATABASE_PACKAGE_EXTENSION}`;
}

function text(value: SQLOutputValue | undefined): string {
  requireBackup(typeof value === 'string', 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  const number = typeof value === 'bigint' ? Number(value) : value;
  requireBackup(typeof number === 'number' && Number.isSafeInteger(number), 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
  return number;
}

/** A stored record read back: its digest, and every field it names against the row it was written with. */
function requireStored(json: SQLOutputValue | undefined, digest: SQLOutputValue | undefined, expected: Record<string, unknown>): void {
  const canonical = text(json);
  requireBackup(sha256Hex(canonical) === text(digest), 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
  const record = parseCanonicalJson(canonical);
  requireBackup(isRecord(record), 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
  for (const [key, value] of Object.entries(expected)) {
    requireBackup(key in record && canonicalJson(record[key]) === canonicalJson(value), 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
  }
}

/** What the store knows that a backup records: the versions and what the package holds. */
export interface ScheduledBackupSources {
  facts(): { dataVersion: number; softwareVersion: string; schemaRevision: number };
  contents(): DatabaseExportContentsProjection;
}

interface KeptBackup {
  readonly backupId: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly fileSha256: string;
  readonly createdAt: string;
}

export class ScheduledBackups {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #sources: ScheduledBackupSources;
  /** The check under way: one at a time, and a caller while it runs is answered by it. */
  #inFlight: Promise<boolean> | null = null;
  #controller: AbortController | null = null;
  /** Whether the check under way is writing its backup. */
  #writing = false;
  /** Set once the service stops: no check starts after it. */
  #stopped = false;
  /** The last backup this service could not make, until one is made or the switch is turned off. */
  #lastFailure: ScheduledBackupFailureProjection | null = null;

  constructor(db: DatabaseSync, dataRoot: string, sources: ScheduledBackupSources) {
    this.#db = db;
    this.#dataRoot = dataRoot;
    this.#sources = sources;
  }

  /** The switch as its last change left it, the chain verified as it is read; off until the editor turns it on. */
  preference(): { enabled: boolean; ordinal: number } {
    let before: string | null = null;
    let enabled = false;
    let count = 0;
    for (const row of this.#db.prepare('SELECT * FROM backup_preferences ORDER BY ordinal').iterate() as Iterable<SqlRow>) {
      const preferenceId = text(row.preference_id);
      const supersedes = row.supersedes_preference_id === null ? null : text(row.supersedes_preference_id);
      enabled = integer(row.enabled) === 1;
      // The record against its row, and the row against the chain: each change follows the one before it.
      requireStored(row.canonical_json, row.sha256, {
        schema: PREFERENCE_SCHEMA,
        preferenceId,
        ordinal: integer(row.ordinal),
        enabled,
        supersedes,
        recordedAt: text(row.recorded_at),
      });
      requireBackup(integer(row.ordinal) === count + 1 && supersedes === before, 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
      before = preferenceId;
      count += 1;
    }
    return { enabled, ordinal: count };
  }

  /** Turn the switch, from exactly the state the editor saw. It records the switch only: the backup is the check's. */
  setEnabled(enabled: unknown, expectedOrdinal: unknown): void {
    requireBackup(typeof enabled === 'boolean' && typeof expectedOrdinal === 'number' && Number.isSafeInteger(expectedOrdinal) && expectedOrdinal >= 0,
      'SCHEDULED_BACKUP_INVALID', '定期自动备份的设置无效。');
    const current = this.preference();
    requireBackup(current.ordinal === expectedOrdinal, 'SCHEDULED_BACKUP_STALE', '定期自动备份的设置已变化，请重新查看。');
    requireBackup(current.enabled !== enabled, 'SCHEDULED_BACKUP_UNCHANGED', enabled ? '定期自动备份已经打开。' : '定期自动备份已经关闭。');
    const previous = this.#db.prepare('SELECT preference_id FROM backup_preferences ORDER BY ordinal DESC LIMIT 1').get() as SqlRow | undefined;
    const preferenceId = randomUUID();
    const ordinal = current.ordinal + 1;
    const supersedes = previous === undefined ? null : text(previous.preference_id);
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: PREFERENCE_SCHEMA, preferenceId, ordinal, enabled, supersedes, recordedAt });
    this.#db.prepare(
      `INSERT INTO backup_preferences(preference_id, ordinal, enabled, supersedes_preference_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(preferenceId, ordinal, enabled ? 1 : 0, supersedes, recordedAt, record.json, record.digest);
    if (!enabled) this.#lastFailure = null;
  }

  /**
   * The service's check, asked at start, hourly, and when the switch is turned on (Issue #434 review). It first clears what
   * a check cut off left and removes every backup older than fourteen days, each on its own; then, while the switch is on
   * and none was made in the day before `now`, it writes the package into the backup location. One check runs at a time,
   * and a caller while it runs is answered by it. Answers whether a backup was made.
   */
  runIfDue(now: Date): Promise<boolean> {
    if (this.#stopped) return Promise.resolve(false);
    if (this.#inFlight !== null) return this.#inFlight;
    const controller = new AbortController();
    const run = this.#run(now, controller.signal).finally(() => {
      this.#inFlight = null;
      this.#controller = null;
    });
    this.#inFlight = run;
    this.#controller = controller;
    return run;
  }

  /**
   * At shutdown, before the store closes (Issue #434 review): no check starts after it, and the one under way stops at its
   * next chunk and removes what it wrote, so no half-made or unrecorded file is left in the backup location.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    this.#controller?.abort();
    await this.#inFlight?.catch(() => undefined);
  }

  async #run(now: Date, signal: AbortSignal): Promise<boolean> {
    try {
      await this.#sweepPartials();
      // Before any write, so a backup that cannot be written never keeps the space those whose days passed hold.
      await this.#removeExpired(now, signal);
      signal.throwIfAborted();
      if (!this.#due(now)) return false;
      this.#writing = true;
      try {
        await this.#backUp(now, signal);
      } finally {
        this.#writing = false;
      }
      this.#lastFailure = null;
      return true;
    } catch (error) {
      // The section states a backup the switch asked for and this service could not make; a stop at shutdown is no failure.
      if (!signal.aborted && this.#enabled()) this.#lastFailure = { at: now.toISOString(), reason: backupFailureReason(error) };
      throw error;
    }
  }

  #due(now: Date): boolean {
    return this.preference().enabled && !this.#madeWithinDay(this.#scan(1).kept[0] ?? null, now);
  }

  /** Whether the newest backup kept was made in the day before `now`. */
  #madeWithinDay(newest: KeptBackup | null, now: Date): boolean {
    return newest !== null && now.getTime() - Date.parse(newest.createdAt) < BACKUP_INTERVAL_MS;
  }

  #enabled(): boolean {
    try {
      return this.preference().enabled;
    } catch {
      return false;
    }
  }

  projection(now: Date): ScheduledBackupsProjection {
    const preference = this.preference();
    const location = backupLocationFor(this.#dataRoot);
    const { kept, total } = this.#scan(MAX_SCHEDULED_BACKUPS_LISTED);
    const backups: ScheduledBackupProjection[] = kept.map((backup) => ({
      backupId: backup.backupId,
      fileName: backup.fileName,
      byteLength: backup.byteLength,
      createdAt: backup.createdAt,
      expiresAt: new Date(Date.parse(backup.createdAt) + BACKUP_KEPT_DAYS * DAY_MS).toISOString(),
      present: existsSync(join(location, backup.fileName)),
    }));
    const latest = kept[0] ?? null;
    return {
      enabled: preference.enabled,
      ordinal: preference.ordinal,
      location,
      keptDays: BACKUP_KEPT_DAYS,
      backups,
      total,
      nextDueAt: !preference.enabled ? null
        : latest === null ? now.toISOString()
          : new Date(Math.max(now.getTime(), Date.parse(latest.createdAt) + BACKUP_INTERVAL_MS)).toISOString(),
      // The check under way is writing the backup, or will once it has removed those whose days passed.
      backingUp: this.#inFlight !== null && (this.#writing || (preference.enabled && !this.#madeWithinDay(latest, now))),
      lastFailure: this.#lastFailure,
    };
  }

  async #backUp(now: Date, signal: AbortSignal): Promise<void> {
    const location = await ensureBackupLocation(this.#dataRoot);
    const fileName = backupFileName(now);
    const target = join(location, fileName);
    // Never over a file already at that name: a backup is only ever a new file.
    requireBackup(this.#db.prepare('SELECT 1 FROM scheduled_backups WHERE file_name = ?').get(fileName) === undefined && !(await present(target)),
      'SCHEDULED_BACKUP_EXISTS', '这一刻的备份已经有了。');
    const partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    const createdAt = now.toISOString();
    let placed = false;
    try {
      // What the backup holds is counted with its copy of the store, so the record says what the file holds (Issue #434 review).
      const written = await writeDatabasePackage(this.#db, this.#dataRoot, partial, () => ({
        ...this.#sources.facts(),
        createdAt,
        origin: 'scheduled-backup',
        contents: this.#sources.contents(),
      }), { signal });
      const { facts } = written;
      const contents = facts.contents;
      signal.throwIfAborted();
      // Only ever a new file (Issue #434 review): the name is taken at the instant the backup is put there, so a file that
      // appeared at it while the package was written is left as it is, as every export leaves one.
      const taken = await takeFreeName(partial, target);
      requireBackup(taken !== 'exists', 'SCHEDULED_BACKUP_EXISTS', '这一刻的备份已经有了。');
      requireBackup(taken !== 'unsupported', 'BACKUP_LOCATION_UNSUPPORTED', '备份位置所在的磁盘不能安全地新建文件。');
      requireBackup(taken === 'taken', 'SCHEDULED_BACKUP_PLACE_FAILED', '无法把备份放到备份位置。');
      placed = true;
      signal.throwIfAborted();
      const backupId = randomUUID();
      const record = canonicalRecord({
        schema: BACKUP_SCHEMA,
        backupId,
        fileName,
        byteLength: written.bytes,
        fileSha256: written.sha256,
        dataVersion: facts.dataVersion,
        schemaRevision: facts.schemaRevision,
        softwareVersion: facts.softwareVersion,
        contents,
        createdAt,
      });
      this.#db.prepare(
        `INSERT INTO scheduled_backups(backup_id, file_name, byte_length, file_sha256, data_version, schema_revision, software_version, contents_json, created_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(backupId, fileName, written.bytes, written.sha256, facts.dataVersion, facts.schemaRevision, facts.softwareVersion,
        canonicalJson(contents), createdAt, record.json, record.digest);
      placed = false;
    } catch (error) {
      // A file under a backup's name that no record names would never be listed or removed (Issue #434 review).
      if (placed) await rm(target, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await rm(partial, { force: true }).catch(() => undefined);
      await rm(`${partial}.store`, { force: true }).catch(() => undefined);
    }
  }

  /**
   * What a check cut off left — by a crash, or a stop that outlasted the grace it was given — is removed before the next
   * one writes (Issue #434 review): only files of the form a check writes, never a kept backup or anything else there.
   */
  async #sweepPartials(): Promise<void> {
    const location = await existingBackupLocation(this.#dataRoot);
    if (location === null) return;
    for (const entry of await readdir(location)) {
      if (!PARTIAL_FILE_NAME.test(entry)) continue;
      const path = join(location, entry);
      try {
        if ((await lstat(path)).isFile()) await rm(path, { force: true });
      } catch {
        // Held open elsewhere, or gone already: the next check tries again.
      }
    }
  }

  /**
   * Every backup older than fourteen days, each on its own (Issue #434 review). Its file is removed only while it is still
   * the one AI7 made — a regular file of the recorded size and digest — and the backup is recorded as expired; a file found
   * gone is recorded as such; a file at its name that is another is left where it is and recorded as changed. One that
   * cannot be dealt with now stays kept, the others go on, and the next check tries it again.
   */
  async #removeExpired(now: Date, signal: AbortSignal): Promise<void> {
    const cutoff = new Date(now.getTime() - BACKUP_KEPT_DAYS * DAY_MS).toISOString();
    // A few at a time, oldest first, each turn after the last one read: one that stays kept is not read again this check.
    let after: { createdAt: string; rowid: number } | null = null;
    let location: string | null | undefined;
    for (;;) {
      const batch = this.#expiredAfter(cutoff, after);
      if (batch.length === 0) return;
      location ??= await existingBackupLocation(this.#dataRoot);
      for (const { backup } of batch) {
        signal.throwIfAborted();
        try {
          const path = location === null ? null : join(location, backup.fileName);
          const state = path === null ? 'missing' : await this.#fileState(path, backup);
          if (state === 'unreadable') continue;
          if (state === 'ours') await rm(path!);
          this.#recordRemoval(backup.backupId, state === 'ours' ? 'expired' : state, now);
        } catch {
          // This one stays kept until the next check.
        }
      }
      const last = batch[batch.length - 1]!;
      after = { createdAt: last.backup.createdAt, rowid: last.rowid };
    }
  }

  /** The next backups kept whose fourteen days had passed at `cutoff`, oldest first, after `after`: a turn's worth, verified. */
  #expiredAfter(cutoff: string, after: { createdAt: string; rowid: number } | null): Array<{ backup: KeptBackup; rowid: number }> {
    const rows = this.#db.prepare(
      `SELECT b.rowid backup_rowid, b.*, NULL removal_id FROM scheduled_backups b
       WHERE NOT EXISTS (SELECT 1 FROM scheduled_backup_removals r WHERE r.backup_id = b.backup_id)
         AND b.created_at <= ? AND (? IS NULL OR (b.created_at, b.rowid) > (?, ?))
       ORDER BY b.created_at, b.rowid LIMIT ${EXPIRY_BATCH}`,
    ).all(cutoff, after?.createdAt ?? null, after?.createdAt ?? null, after?.rowid ?? null) as SqlRow[];
    return rows.map((row) => ({ backup: this.#verified(row).backup, rowid: integer(row.backup_rowid) }));
  }

  /** Whether the file at a backup's name is still the one AI7 made, gone, another, or cannot be read now. */
  async #fileState(path: string, backup: KeptBackup): Promise<'ours' | 'missing' | 'changed' | 'unreadable'> {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      return 'unreadable';
    }
    if (!info.isFile() || info.size !== backup.byteLength) return 'changed';
    const digest = await fileDigest(path);
    if (digest === null) return 'unreadable';
    return digest.bytes === backup.byteLength && digest.sha256 === backup.fileSha256 ? 'ours' : 'changed';
  }

  #recordRemoval(backupId: string, reason: 'expired' | 'missing' | 'changed', now: Date): void {
    const removalId = randomUUID();
    const removedAt = now.toISOString();
    const record = canonicalRecord({ schema: REMOVAL_SCHEMA, removalId, backupId, reason, removedAt });
    this.#db.prepare(
      'INSERT INTO scheduled_backup_removals(removal_id, backup_id, reason, removed_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(removalId, backupId, reason, removedAt, record.json, record.digest);
  }

  /**
   * One pass over every backup record, newest first, each verified with its removal's as it is read (Issue #434 review),
   * holding only the newest backups still kept, up to `listed`, and how many are kept.
   */
  #scan(listed: number): { kept: KeptBackup[]; total: number } {
    const kept: KeptBackup[] = [];
    let total = 0;
    const rows = this.#db.prepare(
      `SELECT b.*, r.removal_id, r.reason, r.removed_at, r.canonical_json removal_json, r.sha256 removal_sha256
       FROM scheduled_backups b LEFT JOIN scheduled_backup_removals r ON r.backup_id = b.backup_id
       ORDER BY b.created_at DESC, b.rowid DESC`,
    ).iterate() as Iterable<SqlRow>;
    for (const row of rows) {
      const { backup, removed } = this.#verified(row);
      if (removed) continue;
      total += 1;
      if (kept.length < listed) kept.push(backup);
    }
    return { kept, total };
  }

  /** One backup record, and its removal's when it has one, verified against their digests and their rows. */
  #verified(row: SqlRow): { backup: KeptBackup; removed: boolean } {
    const backupId = text(row.backup_id);
    // Only a name of the one form a backup is given: a record naming anything else is not AI7's (Issue #434 review).
    requireBackup(BACKUP_FILE_NAME.test(text(row.file_name)), 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
    const contents: unknown = JSON.parse(text(row.contents_json));
    requireStored(row.canonical_json, row.sha256, {
      schema: BACKUP_SCHEMA,
      backupId,
      fileName: text(row.file_name),
      byteLength: integer(row.byte_length),
      fileSha256: text(row.file_sha256),
      dataVersion: integer(row.data_version),
      schemaRevision: integer(row.schema_revision),
      softwareVersion: text(row.software_version),
      contents,
      createdAt: text(row.created_at),
    });
    if (row.removal_id !== null) {
      requireStored(row.removal_json, row.removal_sha256, {
        schema: REMOVAL_SCHEMA,
        removalId: text(row.removal_id),
        backupId,
        reason: text(row.reason),
        removedAt: text(row.removed_at),
      });
    }
    return {
      backup: {
        backupId,
        fileName: text(row.file_name),
        byteLength: integer(row.byte_length),
        fileSha256: text(row.file_sha256),
        createdAt: text(row.created_at),
      },
      removed: row.removal_id !== null,
    };
  }
}
