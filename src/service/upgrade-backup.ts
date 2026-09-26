import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { DatabaseExportContentsProjection } from '../shared/protocol.js';
import { canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { DataVersionError, breakingChanges, dataVersionAt, readUpgrade, type ClassifiedSchemaRevision, type DataVersionUpgrade } from './data-version.js';
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
 * backup and what changes. An open stopped after its migration and before the store recorded the upgrade finds the note at the
 * next open, records the upgrade then with the backup it made, and makes no second one. The store clears the note once the
 * record is written; a note that does not read as AI7's is taken as none.
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

/** What the data holds as it is, counted over the relations its revision has. */
function contentsOf(db: DatabaseSync): DatabaseExportContentsProjection {
  const count = (table: string): number =>
    tableExists(db, table) ? Number((db.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as SqlRow).count) : 0;
  return { books: count('books'), sourceVersions: count('source_versions'), libraryMaterials: count('library_materials'), series: count('series') };
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

/** Inside `store/`, which moves with the store it belongs to and which no database package carries. */
function pendingPath(dataRoot: string): string {
  return join(dataRoot, 'store', 'upgrade-pending.json');
}

/** The upgrade an earlier open backed the data up for and did not record; `null` when none waits, or what waits is not AI7's. */
async function readPendingUpgrade(dataRoot: string, dataVersion: number): Promise<DataVersionUpgrade | null> {
  const path = pendingPath(dataRoot);
  if (!existsSync(path)) return null;
  try {
    const stored: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isRecord(stored) || Object.keys(stored).length !== 2 || typeof stored.json !== 'string' || typeof stored.sha256 !== 'string' ||
      sha256Hex(stored.json) !== stored.sha256) return null;
    const record = parseCanonicalJson(stored.json);
    if (!isRecord(record) || Object.keys(record).length !== 2 || record.schema !== PENDING_SCHEMA) return null;
    return readUpgrade(record.upgrade, dataVersion);
  } catch {
    return null;
  }
}

/** The note an open writes once its backup is in place and before anything migrates the store: written whole or not at all. */
export async function writePendingUpgrade(dataRoot: string, upgrade: DataVersionUpgrade): Promise<void> {
  const record = canonicalRecord({ schema: PENDING_SCHEMA, upgrade });
  await writeAtomic(pendingPath(dataRoot), JSON.stringify({ json: record.json, sha256: record.digest }));
}

/** Clear the note, once the store has recorded the upgrade it names; an open stopped before this finds the record there. */
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
 * is into the backup location, note the upgrade beside the store, and answer it, for the store to record once it has opened.
 * `null` when none is due — a new store, or one already at this software's Data Version. Refused, and nothing migrated, when the
 * backup cannot be made or noted. An open stopped after an earlier one's migration answers that upgrade, backed up once.
 */
export async function backUpBeforeUpgrade(db: DatabaseSync, dataRoot: string, options: UpgradeBackupOptions): Promise<DataVersionUpgrade | null> {
  const revision = Number((db.prepare('PRAGMA user_version').get() as SqlRow).user_version);
  const toDataVersion = dataVersionAt(options.terminalRevision, options.classes);
  // An earlier open backed the data up and began its migration, then stopped before the store recorded the upgrade: the upgrade
  // is that open's, with the backup it made (Issue #433 review). One that stopped before migrating anything backs up again.
  const pending = await readPendingUpgrade(dataRoot, toDataVersion);
  if (pending !== null && revision > pending.fromSchemaRevision) return pending;
  if (revision === 0) return null;
  const fromDataVersion = dataVersionAt(revision, options.classes);
  if (fromDataVersion >= toDataVersion) return null;
  const fromSoftwareVersion = lastSoftwareVersion(db);
  const fileName = preUpgradeBackupFileName(options.now);
  let partial: string | null = null;
  try {
    const location = await ensureBackupLocation(dataRoot);
    const target = join(location, fileName);
    if (!(await absent(target))) throw new DataVersionError('UPGRADE_BACKUP_EXISTS', UPGRADE_BACKUP_EXISTS);
    partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    const written = await writeDatabasePackage(db, dataRoot, partial, () => ({
      dataVersion: fromDataVersion,
      softwareVersion: fromSoftwareVersion ?? options.softwareVersion,
      schemaRevision: revision,
      createdAt: options.now.toISOString(),
      origin: 'pre-upgrade-backup',
      contents: contentsOf(db),
    }));
    // Only ever a new file (Issue #433 review): the name is taken at the instant the backup is put there, as every export's, so
    // a file that appeared at it while the package was written is left as it is.
    const taken = await takeFreeName(partial, target);
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
    // Noted before anything migrates the store: from here on, an open that stops still records this upgrade the next time.
    await writePendingUpgrade(dataRoot, upgrade);
    return upgrade;
  } catch (error) {
    if (error instanceof DataVersionError) throw error;
    throw new DataVersionError('UPGRADE_BACKUP_FAILED', '升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请确认备份位置可以写入、空间足够，再启动 AI7。');
  } finally {
    if (partial !== null) await rm(partial, { force: true }).catch(() => undefined);
  }
}

const UPGRADE_BACKUP_EXISTS = '备份位置里已经有一个同名的文件，升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请稍后再启动 AI7。';
