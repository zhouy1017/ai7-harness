import { randomUUID } from 'node:crypto';
import { lstat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { DatabaseExportContentsProjection } from '../shared/protocol.js';
import { DataVersionError, breakingChanges, dataVersionAt, type ClassifiedSchemaRevision, type DataVersionUpgrade } from './data-version.js';
import { DATABASE_PACKAGE_EXTENSION, writeDatabasePackage } from './database-exports.js';
import { ensureBackupLocation } from './scheduled-backups.js';

/**
 * 升级前备份 (Issue #433, plan slice S85b; V2-UX-DSTO-016; ADR 0079 §1.1, §1.3, §1.4). A software update that must move the data
 * to a later Data Version backs it up first: before anything migrates the store, the data as it is — the store and every file
 * beside it — is written as the database package of S86a into the backup location, named `AI7 升级前备份 <date time>.ai7db`
 * and kept until the editor deletes it. A backup that cannot be made opens nothing, so no data is ever upgraded without one.
 *
 * Which schema revisions change the Data Version is the classification in `data-version.ts`. Nothing is frozen before the first
 * packaged release (§1.2), so no store is upgraded this way yet; the classification is what makes one do so from then on.
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
 * is into the backup location and answer the upgrade, for the store to record once it has opened. `null` when none is due — a
 * new store, or one already at this software's Data Version. Refused, and nothing migrated, when the backup cannot be made.
 */
export async function backUpBeforeUpgrade(db: DatabaseSync, dataRoot: string, options: UpgradeBackupOptions): Promise<DataVersionUpgrade | null> {
  const revision = Number((db.prepare('PRAGMA user_version').get() as SqlRow).user_version);
  if (revision === 0) return null;
  const fromDataVersion = dataVersionAt(revision, options.classes);
  if (fromDataVersion >= dataVersionAt(options.terminalRevision, options.classes)) return null;
  const fromSoftwareVersion = lastSoftwareVersion(db);
  const fileName = preUpgradeBackupFileName(options.now);
  let partial: string | null = null;
  try {
    const location = await ensureBackupLocation(dataRoot);
    const target = join(location, fileName);
    // Never over a file already at that name: the backup is only ever a new file.
    if (!(await absent(target))) throw new Error('The backup name is taken.');
    partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    const written = await writeDatabasePackage(db, dataRoot, partial, () => ({
      dataVersion: fromDataVersion,
      softwareVersion: fromSoftwareVersion ?? options.softwareVersion,
      schemaRevision: revision,
      createdAt: options.now.toISOString(),
      origin: 'pre-upgrade-backup',
      contents: contentsOf(db),
    }));
    await rename(partial, target);
    return {
      fromDataVersion,
      fromSchemaRevision: revision,
      fromSoftwareVersion,
      changes: breakingChanges(revision, options.terminalRevision, options.classes),
      backup: { fileName, byteLength: written.bytes, sha256: written.sha256 },
    };
  } catch {
    throw new DataVersionError('UPGRADE_BACKUP_FAILED', '升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请确认备份位置可以写入、空间足够，再启动 AI7。');
  } finally {
    if (partial !== null) await rm(partial, { force: true }).catch(() => undefined);
  }
}
