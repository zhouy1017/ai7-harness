import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_SCHEDULED_BACKUPS_LISTED,
  type DatabaseExportContentsProjection,
  type ScheduledBackupProjection,
  type ScheduledBackupsProjection,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { DATABASE_PACKAGE_EXTENSION, writeDatabasePackage } from './database-exports.js';

/**
 * 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7): a switch, off by default. On, AI7 writes the
 * database package of S86a once a day into the fixed backup location beside the Agent Data Root, keeps fourteen days of
 * them, and never a credential. The switch is the decision (§1.7): no External Export Policy approval and no picker, and
 * nothing is written anywhere but that location. Turning it off makes no more backups and removes none: those kept stay
 * until their fourteen days pass.
 *
 * Schema revision 56 owns three relations, ledgers like the others: the switch's changes, chained; each backup made, with
 * its file's name, size and digest; and each backup removed, because its fourteen days passed or its file was found gone.
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
  file_name TEXT NOT NULL UNIQUE CHECK(length(file_name) BETWEEN 1 AND 255),
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
  reason TEXT NOT NULL CHECK(reason IN ('expired', 'missing')),
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

async function ensureBackupLocation(dataRoot: string): Promise<string> {
  const location = backupLocationFor(dataRoot);
  await mkdir(location, { recursive: true });
  const info = await lstat(location);
  requireBackup(info.isDirectory() && !info.isSymbolicLink() && (await realpath(location)) === location,
    'BACKUP_LOCATION_INVALID', '备份位置不可用。');
  return location;
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
  readonly createdAt: string;
}

export class ScheduledBackups {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #sources: ScheduledBackupSources;
  #running = false;

  constructor(db: DatabaseSync, dataRoot: string, sources: ScheduledBackupSources) {
    this.#db = db;
    this.#dataRoot = dataRoot;
    this.#sources = sources;
  }

  /** The switch as its last change left it, the chain verified; off until the editor turns it on. */
  preference(): { enabled: boolean; ordinal: number } {
    const rows = this.#db.prepare('SELECT * FROM backup_preferences ORDER BY ordinal').all() as SqlRow[];
    let before: string | null = null;
    let enabled = false;
    rows.forEach((row, index) => {
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
      requireBackup(integer(row.ordinal) === index + 1 && supersedes === before, 'SCHEDULED_BACKUP_RECORD_INVALID', INVALID);
      before = preferenceId;
    });
    return { enabled, ordinal: rows.length };
  }

  /** Turn the switch, from exactly the state the editor saw. Turning it on backs up at once when none was made today. */
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
  }

  /**
   * Once a day while the switch is on: write the package into the backup location unless one was made in the day before
   * `now`, then remove every backup older than fourteen days. Answers whether a backup was made.
   */
  async runIfDue(now: Date): Promise<boolean> {
    if (this.#running) return false;
    this.#running = true;
    try {
      let made = false;
      const kept = this.#kept();
      if (this.preference().enabled && !kept.some((backup) => now.getTime() - Date.parse(backup.createdAt) < BACKUP_INTERVAL_MS)) {
        await this.#backUp(now);
        made = true;
      }
      await this.#removeExpired(now);
      return made;
    } finally {
      this.#running = false;
    }
  }

  projection(now: Date): ScheduledBackupsProjection {
    const preference = this.preference();
    const location = backupLocationFor(this.#dataRoot);
    const kept = this.#kept();
    const backups: ScheduledBackupProjection[] = kept.slice(0, MAX_SCHEDULED_BACKUPS_LISTED).map((backup) => ({
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
      total: kept.length,
      nextDueAt: !preference.enabled ? null
        : latest === null ? now.toISOString()
          : new Date(Math.max(now.getTime(), Date.parse(latest.createdAt) + BACKUP_INTERVAL_MS)).toISOString(),
    };
  }

  async #backUp(now: Date): Promise<void> {
    const location = await ensureBackupLocation(this.#dataRoot);
    const fileName = backupFileName(now);
    requireBackup(this.#db.prepare('SELECT 1 FROM scheduled_backups WHERE file_name = ?').get(fileName) === undefined,
      'SCHEDULED_BACKUP_EXISTS', '这一刻的备份已经有了。');
    const partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    const facts = this.#sources.facts();
    const contents = this.#sources.contents();
    const createdAt = now.toISOString();
    try {
      const written = await writeDatabasePackage(this.#db, this.#dataRoot, partial, { ...facts, createdAt, origin: 'scheduled-backup', contents });
      await rename(partial, join(location, fileName));
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
    } finally {
      await rm(partial, { force: true }).catch(() => undefined);
    }
  }

  /** Every backup older than fourteen days is removed, and one whose file is gone is recorded as found gone. */
  async #removeExpired(now: Date): Promise<void> {
    const location = backupLocationFor(this.#dataRoot);
    for (const backup of this.#kept()) {
      if (now.getTime() - Date.parse(backup.createdAt) < BACKUP_KEPT_DAYS * DAY_MS) continue;
      const path = join(location, backup.fileName);
      const present = existsSync(path);
      if (present) await rm(path, { force: true });
      const removalId = randomUUID();
      const removedAt = now.toISOString();
      const reason = present ? 'expired' : 'missing';
      const record = canonicalRecord({ schema: REMOVAL_SCHEMA, removalId, backupId: backup.backupId, reason, removedAt });
      this.#db.prepare(
        'INSERT INTO scheduled_backup_removals(removal_id, backup_id, reason, removed_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(removalId, backup.backupId, reason, removedAt, record.json, record.digest);
    }
  }

  /** The backups not yet removed, newest first, each record verified. */
  #kept(): KeptBackup[] {
    const rows = this.#db.prepare(
      `SELECT b.*, r.removal_id, r.reason, r.removed_at, r.canonical_json removal_json, r.sha256 removal_sha256
       FROM scheduled_backups b LEFT JOIN scheduled_backup_removals r ON r.backup_id = b.backup_id
       ORDER BY b.created_at DESC, b.rowid DESC`,
    ).all() as SqlRow[];
    const kept: KeptBackup[] = [];
    for (const row of rows) {
      const backupId = text(row.backup_id);
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
        continue;
      }
      kept.push({ backupId, fileName: text(row.file_name), byteLength: integer(row.byte_length), createdAt: text(row.created_at) });
    }
    return kept;
  }
}
