import { randomUUID } from 'node:crypto';
import { lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { DataVersionError, SOFTWARE_VERSION, breakingChanges, dataVersionAt, readUpgrade, type ClassifiedSchemaRevision, type DataVersionUpgrade } from './data-version.js';
import { DATABASE_PACKAGE_EXTENSION, writeDatabasePackage } from './database-exports.js';
import { writeAtomic } from './database-replacement.js';
import { takeFreeName } from './manuscript-export.js';
import { ensureBackupLocation } from './scheduled-backups.js';

/**
 * 升级前备份 (Issue #433, plan slice S85b; V2-UX-DSTO-016; ADR 0079 §1.1, §1.3, §1.4). A software update that must move the data
 * to a later Data Version backs it up first: before anything migrates the store, the data as it is — the store and every file
 * beside it — is written as the database package of S86a into the backup location, named `AI7 升级前备份 <date time>.ai7db`
 * and kept until the editor deletes it. A backup that cannot be made opens nothing, so no data is ever upgraded without one.
 *
 * Which schema revisions change the Data Version is the classification in `data-version.ts`. Nothing is frozen before the first
 * packaged release (§1.2), so no store is upgraded this way yet; the classification is what makes one do so from then on.
 *
 * The upgrade is noted beside the store before anything migrates it (Issue #433 review): `store/upgrade-pending.json` names the
 * backup, what changes, and the software, Data Version and schema revision it was bringing the store to. An open of that same
 * software stopped after its migration and before the store recorded the upgrade finds the note at the next open, records the
 * upgrade then with the backup it made, and makes no second one. A note another software left, whose migration had raised the
 * Data Version, is recorded as that software's upgrade before this open's own, as far as that migration took the data, and
 * never stands in for a backup this open must make. Every upgrade no open has recorded yet is carried on in the note, oldest
 * first, whatever becomes of the open that carries it, until the store records them all; one already recorded is never
 * recorded again (Issue #433 review). The store clears the note once the records are written. A note that does not read as
 * AI7's — or is larger than any note AI7 writes — refuses the open: its upgrade's backup could no longer be named.
 */

type SqlRow = Record<string, SQLOutputValue>;

/** `AI7 升级前备份 2026-09-26 10-00-00.ai7db`, in the computer's own time. */
export function preUpgradeBackupFileName(at: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `AI7 升级前备份 ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}${DATABASE_PACKAGE_EXTENSION}`;
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

/** The software that last opened the data, as its version records say; `null` for a store from before they were kept. */
function lastSoftwareVersion(db: DatabaseSync): string | null {
  if (!tableExists(db, 'store_versions')) return null;
  const row = db.prepare('SELECT software_version FROM store_versions ORDER BY ordinal DESC LIMIT 1').get() as SqlRow | undefined;
  return row === undefined ? null : String(row.software_version);
}

async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

const PENDING_SCHEMA = 'ai7.upgrade-pending/1';
/** At most this many earlier upgrades are carried on in a note (Issue #433 review). */
const MAX_CARRIED_UPGRADES = 16;
/**
 * No note AI7 writes comes near this — its own upgrade and at most sixteen carried on, each bounded field by field — so one
 * larger is not read at all (Issue #433 review).
 */
const MAX_NOTE_BYTES = 1024 * 1024;

/** The versions an open was bringing the store to: the version record the store writes for it. */
export interface UpgradeTarget {
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly schemaRevision: number;
}

/** What an open noted before anything migrated the store: the upgrade, what it was for, and the earlier ones it carried on. */
interface PendingUpgrade {
  readonly upgrade: DataVersionUpgrade;
  readonly target: UpgradeTarget;
  readonly earlier: ReadonlyArray<EarlierUpgrade>;
}

/**
 * An upgrade another open made and never recorded, with the versions it brought the store to: recorded before this open's own,
 * as that open would have recorded it.
 */
export interface EarlierUpgrade extends UpgradeTarget {
  readonly upgrade: DataVersionUpgrade;
}

/** Whether a note is this software's own: the same software, bringing the store to the same revision and Data Version. */
function sameTarget(left: UpgradeTarget, right: UpgradeTarget): boolean {
  return left.softwareVersion === right.softwareVersion && left.dataVersion === right.dataVersion && left.schemaRevision === right.schemaRevision;
}

function unreadableNote(): DataVersionError {
  return new DataVersionError('UPGRADE_NOTE_UNREADABLE', '上次数据升级留下的记录无法读取：AI7 没有打开这份数据，因为那次升级前的备份已说不清是哪一个。升级前的数据仍在备份位置。');
}

function readTarget(value: unknown): UpgradeTarget {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'dataVersion,schemaRevision,softwareVersion' ||
    typeof value.softwareVersion !== 'string' || !SOFTWARE_VERSION.test(value.softwareVersion) ||
    typeof value.dataVersion !== 'number' || !Number.isSafeInteger(value.dataVersion) || value.dataVersion < 1 ||
    typeof value.schemaRevision !== 'number' || !Number.isSafeInteger(value.schemaRevision) || value.schemaRevision < 1) throw unreadableNote();
  return { softwareVersion: value.softwareVersion, dataVersion: value.dataVersion, schemaRevision: value.schemaRevision };
}

/** Inside `store/`, which moves with the store it belongs to and which no database package carries. */
function pendingPath(dataRoot: string): string {
  return join(dataRoot, 'store', 'upgrade-pending.json');
}

/**
 * What an earlier open noted and did not record: `null` only when there is no note at all. A note that does not read as AI7's,
 * or is larger than any AI7 writes, is refused, never taken as none (Issue #433 review): its size is known before any of it is
 * read.
 */
async function readPendingUpgrade(dataRoot: string): Promise<PendingUpgrade | null> {
  const path = pendingPath(dataRoot);
  let size: number;
  try {
    const found = await lstat(path);
    if (!found.isFile()) throw unreadableNote();
    size = found.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw unreadableNote();
  }
  if (size > MAX_NOTE_BYTES) throw unreadableNote();
  try {
    const stored: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isRecord(stored) || Object.keys(stored).length !== 2 || typeof stored.json !== 'string' || typeof stored.sha256 !== 'string' ||
      sha256Hex(stored.json) !== stored.sha256) throw unreadableNote();
    const record = parseCanonicalJson(stored.json);
    if (!isRecord(record) || record.schema !== PENDING_SCHEMA || Object.keys(record).length !== 4 || !Array.isArray(record.earlier) ||
      record.earlier.length > MAX_CARRIED_UPGRADES) throw unreadableNote();
    const target = readTarget(record.target);
    return { upgrade: readUpgrade(record.upgrade, target.dataVersion), target, earlier: record.earlier.map(readEarlier) };
  } catch {
    throw unreadableNote();
  }
}

function readEarlier(value: unknown): EarlierUpgrade {
  if (!isRecord(value) || Object.keys(value).length !== 4) throw unreadableNote();
  const { upgrade, ...target } = value;
  const read = readTarget(target);
  return { ...read, upgrade: readUpgrade(upgrade, read.dataVersion) };
}

/**
 * The note an open writes once its backup is in place and before anything migrates the store, with the earlier upgrades it
 * carries on: written whole or not at all.
 */
export async function writePendingUpgrade(
  dataRoot: string,
  upgrade: DataVersionUpgrade,
  target: UpgradeTarget,
  earlier: ReadonlyArray<EarlierUpgrade> = [],
): Promise<void> {
  const record = canonicalRecord({ schema: PENDING_SCHEMA, upgrade, target, earlier });
  await writeAtomic(pendingPath(dataRoot), JSON.stringify({ json: record.json, sha256: record.digest }));
}

/** Clear the note, once the store has recorded the upgrades it names; an open stopped before this finds the records there. */
export async function completeUpgrade(dataRoot: string): Promise<void> {
  await rm(pendingPath(dataRoot), { force: true });
}

export interface UpgradeBackupOptions {
  /** The schema revision this software brings the store to. */
  readonly terminalRevision: number;
  /** The classification that says which revisions change the Data Version. */
  readonly classes: ReadonlyArray<ClassifiedSchemaRevision>;
  /** This software's version, named in the package when the data records none of its own. */
  readonly softwareVersion: string;
  readonly now: Date;
}

/**
 * Before any migration of the store open on `db`: when this software must move it to a later Data Version, write the data as it
 * is into the backup location, note the upgrade beside the store, and answer it, for the store to record once it has opened —
 * `upgrade` is `null` when none is due, a new store or one already at this software's Data Version. `earlier` are the upgrades
 * other opens made and never recorded, oldest first, for the store to record first. Refused, and nothing migrated, when the
 * backup cannot be made or noted, or an earlier note cannot be read.
 */
export async function backUpBeforeUpgrade(
  db: DatabaseSync,
  dataRoot: string,
  options: UpgradeBackupOptions,
): Promise<{ upgrade: DataVersionUpgrade | null; earlier: ReadonlyArray<EarlierUpgrade> }> {
  const revision = Number((db.prepare('PRAGMA user_version').get() as SqlRow).user_version);
  const toDataVersion = dataVersionAt(options.terminalRevision, options.classes);
  const target: UpgradeTarget = { softwareVersion: options.softwareVersion, dataVersion: toDataVersion, schemaRevision: options.terminalRevision };
  const pending = await readPendingUpgrade(dataRoot);
  // A new store carries nothing on: a note beside it was left by data no longer there.
  if (revision === 0) return { upgrade: null, earlier: [] };
  // An earlier open backed the data up and began its migration, then stopped before the store recorded the upgrade (Issue #433
  // review). Whatever its note carried is carried on, whatever this open does. This software's own — the same software,
  // bringing the store to the same revision and Data Version — is answered as it was noted, with the backup it made. Another's
  // is carried on as that software's, as far as its migration took the data: the Data Version it reached and the changes up to
  // there, when it raised the Data Version at all. This open still makes the backup its own upgrade needs, and one that
  // stopped before migrating anything backs up again.
  let earlier: ReadonlyArray<EarlierUpgrade> = pending?.earlier ?? [];
  if (pending !== null && revision > pending.upgrade.fromSchemaRevision) {
    if (sameTarget(pending.target, target)) return { upgrade: pending.upgrade, earlier };
    const changes = breakingChanges(pending.upgrade.fromSchemaRevision, revision, options.classes);
    if (changes.length > 0) {
      earlier = [...earlier, {
        softwareVersion: pending.target.softwareVersion,
        dataVersion: dataVersionAt(revision, options.classes),
        schemaRevision: revision,
        upgrade: { ...pending.upgrade, changes },
      }];
    }
  }
  const fromDataVersion = dataVersionAt(revision, options.classes);
  if (fromDataVersion >= toDataVersion) return { upgrade: null, earlier };
  // A note carries at most sixteen: one more would be a note no AI7 reads, so this open upgrades nothing.
  if (earlier.length > MAX_CARRIED_UPGRADES) {
    throw new DataVersionError('UPGRADE_NOTE_FULL', '这份数据此前有多次升级没有记下，AI7 无法再记下这一次：AI7 没有升级这份数据，也没有打开它。升级前的数据仍在备份位置。');
  }
  const fromSoftwareVersion = lastSoftwareVersion(db);
  const fileName = preUpgradeBackupFileName(options.now);
  let partial: string | null = null;
  try {
    const location = await ensureBackupLocation(dataRoot);
    const destination = join(location, fileName);
    if (!(await absent(destination))) throw new DataVersionError('UPGRADE_BACKUP_EXISTS', UPGRADE_BACKUP_EXISTS);
    partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    const written = await writeDatabasePackage(db, dataRoot, partial, () => ({
      dataVersion: fromDataVersion,
      softwareVersion: fromSoftwareVersion ?? options.softwareVersion,
      schemaRevision: revision,
      createdAt: options.now.toISOString(),
      origin: 'pre-upgrade-backup',
    }));
    // Only ever a new file (Issue #433 review): the name is taken at the instant the backup is put there, as every export's, so
    // a file that appeared at it while the package was written is left as it is.
    const taken = await takeFreeName(partial, destination);
    if (taken === 'exists') throw new DataVersionError('UPGRADE_BACKUP_EXISTS', UPGRADE_BACKUP_EXISTS);
    if (taken === 'unsupported') {
      throw new DataVersionError('UPGRADE_BACKUP_UNSUPPORTED', '备份位置所在的磁盘不能安全地新建文件，升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。');
    }
    if (taken !== 'taken') throw new Error('The backup could not be put in place.');
    const upgrade: DataVersionUpgrade = {
      fromDataVersion,
      fromSchemaRevision: revision,
      fromSoftwareVersion,
      changes: breakingChanges(revision, options.terminalRevision, options.classes),
      backup: { fileName, byteLength: written.bytes, sha256: written.sha256 },
    };
    // Noted before anything migrates the store, with what it is for and the earlier upgrades it carries on: from here on, an
    // open that stops still records them the next time.
    await writePendingUpgrade(dataRoot, upgrade, target, earlier);
    return { upgrade, earlier };
  } catch (error) {
    if (error instanceof DataVersionError) throw error;
    throw new DataVersionError('UPGRADE_BACKUP_FAILED', '升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请确认备份位置可以写入、空间足够，再启动 AI7。');
  } finally {
    if (partial !== null) await rm(partial, { force: true }).catch(() => undefined);
  }
}

const UPGRADE_BACKUP_EXISTS = '备份位置里已经有一个同名的文件，升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请稍后再启动 AI7。';
