import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, open, opendir, readFile, readdir, realpath, rename, rm, type FileHandle } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_DATABASE_REPLACEMENTS_LISTED,
  type DatabaseExportContentsProjection,
  type DatabaseImportBookProjection,
  type DatabaseImportCompatibility,
  type DatabaseImportPreviewProjection,
  type DatabaseMergeNotice,
  type DatabasePackageOrigin,
  type DatabasePendingReplacementProjection,
  type DatabaseReplacementFailure,
  type DatabaseReplacementRecordProjection,
  type DatabaseReplacementsProjection,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { DATABASE_PACKAGE_EXTENSION, DATABASE_PACKAGE_STORE_MEMBER, writeDatabasePackage, type DatabasePackageMember } from './database-exports.js';
import { ensureCanonicalDataDirectory } from '../shared/data-root.js';
import { verifyDatabasePackage, type DatabasePackageManifest } from './database-package-reader.js';
import {
  DatabaseMergeError,
  mergeIntoStoreFile,
  planMerge,
  restoreStoreFiles,
  saveStoreFiles,
  storeFilesSaved,
  type MergePlan,
} from './database-merge.js';
import { EXPORT_STAGING_DIRECTORY, fileDigest, takeFreeName } from './manuscript-export.js';
import { backupLocationFor, ensureBackupLocation } from './scheduled-backups.js';

/**
 * 导入数据库 and 替换本机全部数据 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4). A database package is
 * previewed — read and verified member by member, its origin, versions and contents stated — and, on the editor's explicit
 * choice, replaces every file of the Agent Data Root, after an automatic backup of the data it replaces; the replacement can be
 * rolled back to that backup.
 *
 * The running service cannot replace the files its store holds open, so a replacement is prepared while it runs and applied
 * when the store next opens:
 * - **Prepare** extracts the package, member by member and verified again, into the fixed staging place beside the Agent Data
 *   Root; then writes the backup of the data as it is — the same package format, in the backup location, kept until the
 *   editor deletes it (§1.4); and writes the replacement's intent last, with the digest of the members it verified. A staging
 *   place without an intent is an interrupted preparation and is removed.
 * - Before an apply moves anything, what waits is verified again against those members (Issue #434 review): a staging place
 *   emptied or changed since replaces nothing, and the replacement is recorded as failed in the data it spared.
 * - **Apply**, at the next open, moves the data aside, moves the package's in, and opens it. Every step is recorded as a phase
 *   before it starts, and each step can be repeated, so an apply interrupted anywhere resumes where it stopped. A store that
 *   will not open is moved out again and the data it would have replaced moved back. The browser profile and the export
 *   staging area stay where they are: they are not data, and the main process holds them.
 *
 * Rolling back is the same replacement, from the backup the last one made. Schema revision 57 owns one ledger: each
 * replacement applied, recorded in the data it brought in, and each that failed, recorded in the data it spared.
 */

export const DATABASE_REPLACEMENT_SCHEMA_SQL = {
  database_replacements: `CREATE TABLE database_replacements (
  replacement_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('replace', 'roll-back')),
  outcome TEXT NOT NULL CHECK(outcome IN ('applied', 'failed')),
  package_file_name TEXT NOT NULL CHECK(length(package_file_name) BETWEEN 1 AND 255),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256) = 64),
  backup_file_name TEXT NOT NULL CHECK(length(backup_file_name) BETWEEN 1 AND 255),
  backup_sha256 TEXT NOT NULL CHECK(length(backup_sha256) = 64),
  prepared_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const DATABASE_REPLACEMENT_TRIGGER_SQL: Readonly<Record<string, string>> = {
  database_replacements_no_update: `CREATE TRIGGER database_replacements_no_update
    BEFORE UPDATE ON database_replacements
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_REPLACEMENT_LEDGER_IMMUTABLE');
    END`,
  database_replacements_no_delete: `CREATE TRIGGER database_replacements_no_delete
    BEFORE DELETE ON database_replacements
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_REPLACEMENT_LEDGER_IMMUTABLE');
    END`,
};

export const DATABASE_REPLACEMENT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {};

export class DatabaseReplacementError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DatabaseReplacementError';
  }
}

function requireReplacement(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DatabaseReplacementError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'database_replacements'";
const INTENT_SCHEMA = 'ai7.database-replacement.intent/1' as const;
const RECORD_SCHEMA = 'ai7.database-replacement/1' as const;
const INVALID = '替换本机数据的记录已损坏。';
const INTERRUPTED = '上次替换本机数据的过程无法继续；AI7 没有再移动任何数据。';
/** The Agent Data Root's own places a replacement leaves where they are. */
export const REPLACEMENT_KEPT_ROOTS: ReadonlySet<string> = new Set(['shell', EXPORT_STAGING_DIRECTORY]);

/** Revision 57's relation, created once: a store that predates it gains an empty ledger and nothing existing moves. */
export function initializeDatabaseReplacementSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DATABASE_REPLACEMENT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DATABASE_REPLACEMENT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Database replacement schema rollback failed.');
    }
    throw error;
  }
}

/** The fixed staging place beside the Agent Data Root where a replacement waits to be applied. */
export function replacementStagingFor(dataRoot: string): string {
  return `${dataRoot}-replacing`;
}

/** A pre-replace backup's name: `AI7 替换前备份 2026-09-25 22-30-05.ai7db`, in the computer's own time. */
export function preReplaceBackupFileName(at: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `AI7 替换前备份 ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}${DATABASE_PACKAGE_EXTENSION}`;
}

/** A pre-merge backup's name: `AI7 合并前备份 2026-09-25 22-30-05.ai7db`, in the computer's own time. */
export function preMergeBackupFileName(at: Date): string {
  return preReplaceBackupFileName(at).replace('AI7 替换前备份 ', 'AI7 合并前备份 ');
}

/** Whether this AI7 can take a package's data: the same Data Version, and a schema revision it knows. */
export function importCompatibility(manifest: Pick<DatabasePackageManifest, 'dataVersion' | 'schemaRevision'>, dataVersion: number, schemaRevision: number): DatabaseImportCompatibility {
  if (manifest.dataVersion > dataVersion) return 'newer-data-version';
  if (manifest.dataVersion < dataVersion) return 'older-data-version';
  return manifest.schemaRevision > schemaRevision ? 'newer-schema' : 'compatible';
}

// ---- the staging place ------------------------------------------------------------------------------

/**
 * What a prepared replacement or merge is: which package, from where, and the backup made of the data it changes — and, for a
 * merge (S86d), the Books it takes and what stays behind.
 */
export interface ReplacementIntent {
  readonly replacementId: string;
  readonly kind: 'replace' | 'roll-back' | 'merge';
  readonly packageFileName: string;
  readonly packageSha256: string;
  readonly packageCreatedAt: string;
  readonly packageOrigin: DatabasePackageOrigin;
  readonly packageContents: DatabaseExportContentsProjection;
  readonly backupFileName: string;
  readonly backupSha256: string;
  readonly preparedAt: string;
  readonly mergeBooks: ReadonlyArray<DatabaseImportBookProjection> | null;
  readonly mergeNotices: ReadonlyArray<DatabaseMergeNotice>;
  /** The digest of the members the preparation verified, kept beside what it extracted (Issue #434 review). */
  readonly packageMembersSha256: string;
}

/**
 * Where an apply is. Each is written before its step starts: `moving-out` (the data into `previous/`), `moving-in` (the
 * package's files into the Agent Data Root), `opening`, then `applied`; or, when the package's data would not open,
 * `discarding` (its files into `discarded/`), `restoring` (the data back from `previous/`), then `restored`; or, when what
 * waits is no longer what the preparation verified, `refused`, with nothing moved.
 */
type Phase = 'moving-out' | 'moving-in' | 'opening' | 'applied' | 'discarding' | 'restoring' | 'restored' | 'refused' | MergePhase;
/**
 * Where a merge is (S86d), each written before its step: `saving-store` (the store's files copied aside), `merging` (the
 * Books merged into the store, in one transaction), `opening-merge`, then `merge-applied`; or, when the merge or the open
 * fails, `restoring-store` (the saved files put back), then `store-restored`. A merge whose staged files changed since its
 * preparation is `refused`, as a replacement is.
 */
type MergePhase = 'saving-store' | 'merging' | 'opening-merge' | 'merge-applied' | 'restoring-store' | 'store-restored';
const PHASES: ReadonlyArray<string> = ['moving-out', 'moving-in', 'opening', 'applied', 'discarding', 'restoring', 'restored', 'refused',
  'saving-store', 'merging', 'opening-merge', 'merge-applied', 'restoring-store', 'store-restored'];
const ORIGINS: ReadonlyArray<string> = ['database-export', 'scheduled-backup', 'pre-replace-backup', 'pre-merge-backup'];
const MERGE_NOTICES: ReadonlyArray<string> = ['series', 'library-materials', 'workspace-profile', 'internal-number'];
const BOOK_STATUSES: ReadonlyArray<string> = ['new', 'present', 'same-title'];

function isBook(value: unknown): value is DatabaseImportBookProjection {
  return isRecord(value) && Object.keys(value).length === 4 && typeof value.bookId === 'string' && typeof value.title === 'string' &&
    typeof value.status === 'string' && BOOK_STATUSES.includes(value.status) && typeof value.internalNumberCleared === 'boolean';
}

function isContents(value: unknown): value is DatabaseExportContentsProjection {
  return isRecord(value) && Object.keys(value).length === 4 &&
    (['books', 'sourceVersions', 'libraryMaterials', 'series'] as const).every((key) =>
      typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && (value[key] as number) >= 0);
}

function isIntent(value: unknown): value is ReplacementIntent {
  const merge = isRecord(value) && value.kind === 'merge';
  return isRecord(value) && Object.keys(value).length === 13 && typeof value.replacementId === 'string' &&
    (value.kind === 'replace' || value.kind === 'roll-back' || value.kind === 'merge') &&
    (merge ? Array.isArray(value.mergeBooks) && value.mergeBooks.length > 0 && value.mergeBooks.every(isBook) : value.mergeBooks === null) &&
    Array.isArray(value.mergeNotices) && value.mergeNotices.every((notice) => typeof notice === 'string' && MERGE_NOTICES.includes(notice)) &&
    typeof value.packageFileName === 'string' && value.packageFileName.length > 0 && value.packageFileName.length <= 255 &&
    typeof value.packageSha256 === 'string' && DIGEST_PATTERN.test(value.packageSha256) && typeof value.packageCreatedAt === 'string' &&
    typeof value.packageOrigin === 'string' && ORIGINS.includes(value.packageOrigin) && isContents(value.packageContents) &&
    typeof value.backupFileName === 'string' && value.backupFileName.length > 0 && value.backupFileName.length <= 255 &&
    typeof value.backupSha256 === 'string' && DIGEST_PATTERN.test(value.backupSha256) && typeof value.preparedAt === 'string' &&
    typeof value.packageMembersSha256 === 'string' && DIGEST_PATTERN.test(value.packageMembersSha256);
}

/** Write `text` to `path` whole or not at all: a partial file, synced, then renamed into place. */
async function writeAtomic(path: string, text: string): Promise<void> {
  const partial = `${path}.${randomUUID()}.partial`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(partial, 'wx');
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(partial, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(partial, { force: true }).catch(() => undefined);
  }
}

/** The staging place as AI7 made it: a directory, never a link. */
async function stagingPlace(dataRoot: string): Promise<'absent' | 'directory' | 'foreign'> {
  const info = await lstat(replacementStagingFor(dataRoot)).catch(() => null);
  if (info === null) return 'absent';
  return info.isDirectory() && !info.isSymbolicLink() ? 'directory' : 'foreign';
}

async function readIntentAt(staging: string): Promise<ReplacementIntent | null> {
  const path = join(staging, 'intent.json');
  if (!existsSync(path)) return null;
  const stored: unknown = JSON.parse(await readFile(path, 'utf8'));
  requireReplacement(isRecord(stored) && Object.keys(stored).length === 2 && typeof stored.json === 'string' && typeof stored.sha256 === 'string' &&
    sha256Hex(stored.json) === stored.sha256, 'DATABASE_REPLACEMENT_INTENT_INVALID', INVALID);
  const record = parseCanonicalJson(stored.json);
  requireReplacement(isRecord(record) && record.schema === INTENT_SCHEMA, 'DATABASE_REPLACEMENT_INTENT_INVALID', INVALID);
  const { schema: _schema, ...intent } = record;
  requireReplacement(isIntent(intent), 'DATABASE_REPLACEMENT_INTENT_INVALID', INVALID);
  return intent;
}

async function readPhase(staging: string): Promise<Phase | null> {
  const path = join(staging, 'phase.json');
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    value = null;
  }
  // A phase is written whole or not at all, so one that does not read is not AI7's: nothing more is moved.
  requireReplacement(typeof value === 'string' && PHASES.includes(value), 'DATABASE_REPLACEMENT_INTERRUPTED', INTERRUPTED);
  return value as Phase;
}

async function writePhase(staging: string, phase: Phase): Promise<void> {
  await writeAtomic(join(staging, 'phase.json'), JSON.stringify(phase));
}

/**
 * The replacement prepared and waiting for the next open: its intent written, and no apply begun. `null` when there is none,
 * or when what is there is not one — an interrupted preparation, or what an apply left behind.
 */
export async function readPendingReplacement(dataRoot: string): Promise<ReplacementIntent | null> {
  if (await stagingPlace(dataRoot) !== 'directory') return null;
  const staging = replacementStagingFor(dataRoot);
  if (existsSync(join(staging, 'phase.json'))) return null;
  return readIntentAt(staging).catch(() => null);
}

/** Remove what waits at the staging place: a prepared replacement not yet applied, or what an apply left behind. */
export async function discardReplacement(dataRoot: string): Promise<void> {
  await rm(replacementStagingFor(dataRoot), { recursive: true, force: true });
}

/** A fresh staging place: whatever was there removed, then made anew as a directory of its own. */
async function freshStagingPlace(dataRoot: string): Promise<string> {
  const staging = replacementStagingFor(dataRoot);
  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, 'incoming'), { recursive: true });
  const info = await lstat(staging);
  requireReplacement(info.isDirectory() && !info.isSymbolicLink() && (await realpath(staging)) === staging,
    'DATABASE_REPLACEMENT_FAILED', '替换本机数据所需的位置不可用。');
  return staging;
}

/**
 * Take the package at `packagePath` into a fresh staging place: verified again as it is extracted, member by member, and
 * refused as changed unless it is the very file that was previewed. Answers what the package says of itself.
 */
export async function extractReplacement(dataRoot: string, packagePath: string, expectedSha256: string): Promise<{ manifest: DatabasePackageManifest; sha256: string }> {
  const staging = await freshStagingPlace(dataRoot);
  const incoming = join(staging, 'incoming');
  let current: FileHandle | undefined;
  try {
    const verified = await verifyDatabasePackage(packagePath, {
      begin: async (member) => {
        const target = join(incoming, ...member.path.split('/'));
        await mkdir(dirname(target), { recursive: true });
        current = await open(target, 'wx');
      },
      data: async (chunk) => {
        await current!.writeFile(chunk);
      },
      end: async () => {
        await current!.sync();
        await current!.close();
        current = undefined;
      },
    });
    requireReplacement(verified.sha256 === expectedSha256, 'DATABASE_REPLACEMENT_STALE', '所选的数据库文件在预览之后变了，请重新选择。');
    return { manifest: verified.manifest, sha256: verified.sha256 };
  } catch (error) {
    await current?.close().catch(() => undefined);
    await discardReplacement(dataRoot).catch(() => undefined);
    throw error;
  }
}

/**
 * The members the preparation verified, written beside what it extracted: what the next open verifies again before it moves
 * anything (Issue #434 review). Answers their digest, which the intent names.
 */
export async function writeReplacementMembers(dataRoot: string, members: ReadonlyArray<DatabasePackageMember>): Promise<string> {
  const record = canonicalRecord(members.map((member) => ({ path: member.path, bytes: member.bytes, sha256: member.sha256 })));
  await writeAtomic(join(replacementStagingFor(dataRoot), 'members.json'), record.json);
  return record.digest;
}

/**
 * Whether what waits in `incoming/` is exactly what the preparation verified: every member it named, of its size and digest,
 * and nothing else — walked a directory at a time, each file read against its digest.
 */
async function stagedAsVerified(staging: string, intent: ReplacementIntent): Promise<boolean> {
  try {
    const text = await readFile(join(staging, 'members.json'), 'utf8');
    if (sha256Hex(text) !== intent.packageMembersSha256) return false;
    const members = parseCanonicalJson(text);
    if (!Array.isArray(members)) return false;
    const expected = new Map<string, { bytes: number; sha256: string }>();
    for (const member of members) {
      if (!isRecord(member) || typeof member.path !== 'string' || typeof member.bytes !== 'number' || typeof member.sha256 !== 'string') return false;
      expected.set(member.path, { bytes: member.bytes, sha256: member.sha256 });
    }
    let found = 0;
    const visit = async (directory: string, prefix: string): Promise<boolean> => {
      for await (const entry of await opendir(directory)) {
        const member = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!(await visit(path, member))) return false;
          continue;
        }
        const named = expected.get(member);
        if (!entry.isFile() || named === undefined) return false;
        const read = await fileDigest(path);
        if (read === null || read.bytes !== named.bytes || read.sha256 !== named.sha256) return false;
        found += 1;
      }
      return true;
    };
    return (await visit(join(staging, 'incoming'), '')) && found === expected.size;
  } catch {
    return false;
  }
}

/**
 * Every file waiting in `incoming/`, by its path there, with its size and digest: what a merge leaves staged once its
 * package was opened as a store of its own, walked a directory at a time.
 */
async function stagedMembers(incoming: string): Promise<DatabasePackageMember[]> {
  const members: DatabasePackageMember[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    for await (const entry of await opendir(directory)) {
      const path = join(directory, entry.name);
      const member = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path, member);
        continue;
      }
      const read = entry.isFile() ? await fileDigest(path) : null;
      requireReplacement(read !== null, 'DATABASE_REPLACEMENT_FAILED', '准备好的文件无法读取。');
      members.push({ path: member, bytes: read.bytes, sha256: read.sha256 });
    }
  };
  await visit(incoming, '');
  return members;
}

/** The extracted replacement's intent, written last: from now on the next open applies it. */
export async function writeReplacementIntent(dataRoot: string, intent: ReplacementIntent): Promise<void> {
  const record = canonicalRecord({ schema: INTENT_SCHEMA, ...intent });
  await writeAtomic(join(replacementStagingFor(dataRoot), 'intent.json'), JSON.stringify({ json: record.json, sha256: record.digest }));
}

const RENAME_RETRIES = 20;
const RENAME_RETRY_MS = 100;

/** One rename, repeated a moment later while another program — an indexer, a virus scanner — briefly holds the file. */
async function renameSteadily(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_RETRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS));
    }
  }
}

/** Move every entry of `from` into `to`, except the kept places: one rename each, so an interruption leaves each entry whole. */
async function moveEntries(from: string, to: string, keep: ReadonlySet<string>): Promise<void> {
  await mkdir(to, { recursive: true });
  if (!existsSync(from)) return;
  for (const entry of await readdir(from)) {
    if (keep.has(entry.toLowerCase())) continue;
    await renameSteadily(join(from, entry), join(to, entry));
  }
}

/**
 * What an open found waiting beside the Agent Data Root, and what came of it. A failed replacement says why: the package's
 * data would not open, or what waited was no longer what the preparation verified.
 */
export interface AppliedReplacement {
  readonly intent: ReplacementIntent;
  readonly outcome: 'applied' | 'failed';
  readonly failure?: DatabaseReplacementFailure;
}

/**
 * Open the store at `dataRoot`, applying first the replacement waiting beside it, if there is one. Answers the store opened —
 * the replacement's data, or, when that would not open, the data it would have replaced — with what came of the replacement,
 * for the caller to record in that store before it calls `completeReplacement`. Until then an interruption repeats the last
 * step, and the record is written once.
 */
export async function openWithPendingReplacement<T>(
  dataRoot: string,
  openStore: () => Promise<T>,
): Promise<{ store: T; replacement: AppliedReplacement | null }> {
  const place = await stagingPlace(dataRoot);
  if (place !== 'directory') {
    // Nothing waits, or something AI7 never made — removed as itself, a link and not what it points at; the data stays.
    if (place === 'foreign') await discardReplacement(dataRoot);
    return { store: await openStore(), replacement: null };
  }
  const staging = replacementStagingFor(dataRoot);
  let phase = await readPhase(staging);
  // The intent is written before any apply begins and only ever read after, so an apply goes on whatever it says; it names
  // the replacement only for its record.
  const intent = await readIntentAt(staging).catch(() => null);
  // What waits is verified again before anything moves, a merge's as a replacement's: a staging place emptied or changed
  // since the preparation replaces or merges nothing (Issue #434 review).
  if (phase === null && intent !== null && !(await stagedAsVerified(staging, intent))) {
    phase = 'refused';
    await writePhase(staging, phase);
  }
  if (phase === 'refused') {
    return { store: await openStore(), replacement: intent === null ? null : { intent, outcome: 'failed', failure: 'changed' } };
  }
  if (intent?.kind === 'merge' || (phase !== null && MERGE_PHASE_SET.has(phase))) {
    return applyPendingMerge(dataRoot, staging, intent, phase as MergePhase | null, openStore);
  }
  if (phase === null) {
    if (intent === null) {
      // An interrupted preparation: nothing was moved, so the data stays and the staging goes.
      await discardReplacement(dataRoot);
      return { store: await openStore(), replacement: null };
    }
    phase = 'moving-out';
    await writePhase(staging, phase);
  }
  const previous = join(staging, 'previous');
  const incoming = join(staging, 'incoming');
  const discarded = join(staging, 'discarded');
  if (phase === 'moving-out') {
    await moveEntries(dataRoot, previous, REPLACEMENT_KEPT_ROOTS);
    phase = 'moving-in';
    await writePhase(staging, phase);
  }
  if (phase === 'moving-in') {
    await moveEntries(incoming, dataRoot, new Set());
    phase = 'opening';
    await writePhase(staging, phase);
  }
  if (phase === 'opening') {
    let opened: { store: T } | null = null;
    try {
      opened = { store: await openStore() };
    } catch {
      // A store that will not open is not the editor's data: the data it would have replaced goes back.
      opened = null;
    }
    if (opened !== null) {
      await writePhase(staging, 'applied');
      return { store: opened.store, replacement: intent === null ? null : { intent, outcome: 'applied' } };
    }
    phase = 'discarding';
    await writePhase(staging, phase);
  }
  if (phase === 'applied') {
    return { store: await openStore(), replacement: intent === null ? null : { intent, outcome: 'applied' } };
  }
  if (phase === 'discarding') {
    await moveEntries(dataRoot, discarded, REPLACEMENT_KEPT_ROOTS);
    phase = 'restoring';
    await writePhase(staging, phase);
  }
  if (phase === 'restoring') {
    await moveEntries(previous, dataRoot, new Set());
    phase = 'restored';
    await writePhase(staging, phase);
  }
  return { store: await openStore(), replacement: intent === null ? null : { intent, outcome: 'failed', failure: 'unopenable' } };
}

const MERGE_PHASE_SET: ReadonlySet<string> = new Set(['saving-store', 'merging', 'opening-merge', 'merge-applied', 'restoring-store', 'store-restored']);

/**
 * A merge waiting beside the Agent Data Root, applied onto the data as it is now (S86d): the store's files are copied aside,
 * the Books merged into the store in one transaction, and the store opened. A merge or an open that fails puts the saved files
 * back, and the data opens as it was. Each step is recorded before it starts; a merge interrupted after its transaction
 * committed finds its Books there and does not merge them twice.
 */
async function applyPendingMerge<T>(
  dataRoot: string,
  staging: string,
  intent: ReplacementIntent | null,
  recorded: MergePhase | null,
  openStore: () => Promise<T>,
): Promise<{ store: T; replacement: AppliedReplacement | null }> {
  const saved = join(staging, 'store-before');
  let phase: MergePhase | null = recorded;
  // A merge whose intent no longer reads cannot say which Books it takes: the saved files, if whole, go back.
  if (intent === null || intent.mergeBooks === null) {
    if (phase !== null && phase !== 'saving-store' && phase !== 'merge-applied' && storeFilesSaved(saved)) restoreStoreFiles(dataRoot, saved);
    await writePhase(staging, 'store-restored');
    return { store: await openStore(), replacement: null };
  }
  const bookIds = intent.mergeBooks.map((book) => book.bookId);
  if (phase === null || phase === 'saving-store') {
    await writePhase(staging, 'saving-store');
    saveStoreFiles(dataRoot, saved);
    phase = 'merging';
    await writePhase(staging, phase);
  }
  if (phase === 'merging') {
    try {
      mergeIntoStoreFile(dataRoot, join(staging, 'incoming'), bookIds);
      phase = 'opening-merge';
    } catch {
      phase = 'restoring-store';
    }
    await writePhase(staging, phase);
  }
  if (phase === 'opening-merge') {
    let opened: { store: T } | null = null;
    try {
      opened = { store: await openStore() };
    } catch {
      // Data the merge left that will not open is not the editor's: the store's files go back as they were.
      opened = null;
    }
    if (opened !== null) {
      await writePhase(staging, 'merge-applied');
      return { store: opened.store, replacement: { intent, outcome: 'applied' } };
    }
    phase = 'restoring-store';
    await writePhase(staging, phase);
  }
  if (phase === 'merge-applied') return { store: await openStore(), replacement: { intent, outcome: 'applied' } };
  if (phase === 'restoring-store') {
    restoreStoreFiles(dataRoot, saved);
    phase = 'store-restored';
    await writePhase(staging, phase);
  }
  return { store: await openStore(), replacement: { intent, outcome: 'failed', failure: 'unopenable' } };
}

/**
 * After the store opened by `openWithPendingReplacement` has recorded the replacement: the staging place goes, with the data
 * moved aside — the backup the preparation made holds it — or the files that would not open. A place that will not go now is
 * left for the next open, which finds the apply finished and removes it.
 */
export async function completeReplacement(dataRoot: string): Promise<void> {
  if (await stagingPlace(dataRoot) !== 'directory') return;
  const phase = await readPhase(replacementStagingFor(dataRoot)).catch(() => null);
  if (phase !== 'applied' && phase !== 'restored' && phase !== 'refused' && phase !== 'merge-applied' && phase !== 'store-restored') return;
  await discardReplacement(dataRoot).catch(() => undefined);
}

// ---- the ledger and the editor's actions ---------------------------------------------------------------

function text(value: SQLOutputValue | undefined): string {
  requireReplacement(typeof value === 'string', 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
  return value;
}

interface StoredReplacement {
  readonly replacementId: string;
  readonly kind: 'replace' | 'roll-back' | 'merge';
  readonly outcome: 'applied' | 'failed';
  readonly packageFileName: string;
  readonly packageSha256: string;
  readonly backupFileName: string;
  readonly backupSha256: string;
  readonly preparedAt: string;
  readonly recordedAt: string;
  /** A merge's Books and what stayed behind; none for a replacement. */
  readonly mergeBooks: ReadonlyArray<DatabaseImportBookProjection> | null;
  readonly mergeNotices: ReadonlyArray<DatabaseMergeNotice>;
  /** Why a failed replacement failed, as its record says; named only in the record of one that failed. */
  readonly failure?: DatabaseReplacementFailure;
}

/**
 * What the store knows that a preview and a backup need: the versions it is at and what its data holds — and, for a merge,
 * how to open a package's data as a store of its own, which brings it to this AI7's revision and checks it whole.
 */
export interface DatabaseReplacementSources {
  facts(): { dataVersion: number; softwareVersion: string; schemaRevision: number };
  contents(): DatabaseExportContentsProjection;
  openPackage(dataRoot: string): Promise<void>;
}

const MERGE_RECORD_SCHEMA = 'ai7.database-merge/1' as const;

interface Preview {
  readonly previewId: string;
  readonly source: string;
  readonly sha256: string;
  readonly manifest: DatabasePackageManifest;
}

export class DatabaseReplacements {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #sources: DatabaseReplacementSources;
  /** The one package previewed last: what `替换本机全部数据` may replace the data with. */
  #preview: Preview | null = null;
  /**
   * Whether a replacement this service prepared waits for AI7's next start. An open applies any replacement waiting before
   * this owner exists, so none waits when it is made.
   */
  #waiting = false;

  constructor(db: DatabaseSync, dataRoot: string, sources: DatabaseReplacementSources) {
    this.#db = db;
    this.#dataRoot = dataRoot;
    this.#sources = sources;
  }

  /** 导入数据库's preview: the package read and verified whole; nothing is taken from it. It replaces the last preview. */
  async preview(source: string): Promise<DatabaseImportPreviewProjection> {
    requireReplacement(isAbsolute(source), 'DATABASE_IMPORT_SOURCE_INVALID', '所选的文件不可用。');
    this.#preview = null;
    // The package's store is kept aside while it is read, for the plan of what merging its Books would take; it goes after.
    const staging = await ensureCanonicalDataDirectory(this.#dataRoot, EXPORT_STAGING_DIRECTORY);
    const copy = join(staging, `${randomUUID()}.import-preview.sqlite`);
    let handle: FileHandle | undefined;
    let plan: MergePlan;
    let verified: Awaited<ReturnType<typeof verifyDatabasePackage>>;
    try {
      verified = await verifyDatabasePackage(source, {
        begin: async (member) => {
          if (member.path === DATABASE_PACKAGE_STORE_MEMBER) handle = await open(copy, 'wx');
        },
        data: async (chunk) => {
          await handle?.writeFile(chunk);
        },
        end: async () => {
          await handle?.close();
          handle = undefined;
        },
      });
      // A store that does not read offers no Book to merge; 替换 finds out at the next open, as it would anyway.
      try {
        plan = this.#plan(copy);
      } catch {
        plan = { books: [], notices: [] };
      }
    } finally {
      await handle?.close().catch(() => undefined);
      for (const suffix of ['', '-journal', '-wal', '-shm']) await rm(`${copy}${suffix}`, { force: true }).catch(() => undefined);
    }
    const facts = this.#sources.facts();
    const previewId = randomUUID();
    this.#preview = { previewId, source, sha256: verified.sha256, manifest: verified.manifest };
    return {
      previewId,
      fileName: basename(source),
      source,
      byteLength: verified.bytes,
      origin: verified.manifest.origin,
      createdAt: verified.manifest.createdAt,
      dataVersion: verified.manifest.dataVersion,
      softwareVersion: verified.manifest.softwareVersion,
      schemaRevision: verified.manifest.schemaRevision,
      localDataVersion: facts.dataVersion,
      compatibility: importCompatibility(verified.manifest, facts.dataVersion, facts.schemaRevision),
      contents: verified.manifest.contents,
      members: verified.manifest.members.length,
      books: plan.books,
      mergeNotices: plan.notices,
    };
  }

  /**
   * `只导入其中的图书，与本机合并（重名的另存）` (S86d; ADR 0079 §1.5): the previewed package taken into the staging place and opened
   * as a store of its own — brought to this AI7's revision and checked whole — the data as it is backed up, and the merge of
   * every Book not already here waiting for AI7's next start. One replacement or merge waits at a time.
   */
  async prepareMerge(previewId: string, now: Date): Promise<DatabaseReplacementsProjection> {
    const preview = this.#preview;
    requireReplacement(preview !== null && preview.previewId === previewId, 'DATABASE_IMPORT_PREVIEW_STALE', '这次预览已失效，请重新选择数据库文件。');
    requireReplacement(await readPendingReplacement(this.#dataRoot) === null, 'DATABASE_REPLACEMENT_PENDING', '已有一次替换在等待 AI7 重新启动；请先取消它。');
    const { manifest, sha256 } = await extractReplacement(this.#dataRoot, preview.source, preview.sha256);
    try {
      const facts = this.#sources.facts();
      requireReplacement(importCompatibility(manifest, facts.dataVersion, facts.schemaRevision) === 'compatible',
        'DATABASE_IMPORT_INCOMPATIBLE', '这个数据库文件与本机 AI7 的数据版本不兼容，不能合并。');
      const incoming = join(replacementStagingFor(this.#dataRoot), 'incoming');
      await this.#sources.openPackage(incoming);
      const plan = this.#plan(join(incoming, 'store', 'ai7.sqlite'));
      const merging = plan.books.filter((book) => book.status !== 'present');
      requireReplacement(merging.length > 0, 'DATABASE_MERGE_NOTHING', '这个文件里的图书本机都已经有了。');
      const packageMembersSha256 = await writeReplacementMembers(this.#dataRoot, await stagedMembers(incoming));
      const backup = await this.#backUp(now, 'pre-merge-backup');
      await writeReplacementIntent(this.#dataRoot, {
        replacementId: randomUUID(),
        kind: 'merge',
        packageFileName: basename(preview.source),
        packageSha256: sha256,
        packageCreatedAt: manifest.createdAt,
        packageOrigin: manifest.origin,
        packageContents: manifest.contents,
        backupFileName: backup.fileName,
        backupSha256: backup.sha256,
        preparedAt: now.toISOString(),
        mergeBooks: merging,
        mergeNotices: plan.notices,
        packageMembersSha256,
      });
    } catch (error) {
      await discardReplacement(this.#dataRoot).catch(() => undefined);
      if (error instanceof DatabaseMergeError) throw new DatabaseReplacementError(error.code, error.message);
      throw error;
    }
    // A merge applies onto the data as it is at the next start, so what is saved meanwhile is kept (the Owner's reading 2):
    // nothing waits on it the way a replacement does.
    this.#preview = null;
    return this.projection();
  }

  /** The plan of merging the Books of the store at `path` into this one: a read of both. */
  #plan(path: string): MergePlan {
    this.#db.prepare('ATTACH DATABASE ? AS src').run(path);
    try {
      return planMerge(this.#db);
    } finally {
      this.#db.exec('DETACH DATABASE src');
    }
  }

  /**
   * `替换本机全部数据`: the previewed package taken into the staging place, the data as it is backed up, and the replacement
   * waiting for AI7's next start. One replacement waits at a time.
   */
  async prepare(previewId: string, now: Date): Promise<DatabaseReplacementsProjection> {
    const preview = this.#preview;
    requireReplacement(preview !== null && preview.previewId === previewId, 'DATABASE_IMPORT_PREVIEW_STALE', '这次预览已失效，请重新选择数据库文件。');
    requireReplacement(await readPendingReplacement(this.#dataRoot) === null, 'DATABASE_REPLACEMENT_PENDING', '已有一次替换在等待 AI7 重新启动；请先取消它。');
    await this.#stage('replace', preview.source, preview.sha256, now);
    this.#preview = null;
    this.#waiting = true;
    return this.projection();
  }

  /** Whether a replacement waits for AI7's next start: until then the service writes nothing (Issue #434 review). */
  get waiting(): boolean {
    return this.#waiting;
  }

  /** `取消替换`: the replacement waiting is removed and the data stays as it is; its backup stays in the backup location. */
  async cancel(replacementId: string): Promise<DatabaseReplacementsProjection> {
    const pending = await readPendingReplacement(this.#dataRoot);
    requireReplacement(pending !== null && pending.replacementId === replacementId, 'DATABASE_REPLACEMENT_STALE', '这次替换已不在等待中。');
    await discardReplacement(this.#dataRoot);
    this.#waiting = false;
    return this.projection();
  }

  /** `回退到替换前的数据`: the backup the latest replacement made, prepared to replace the data, which is backed up first. */
  async rollBack(replacementId: string, now: Date): Promise<DatabaseReplacementsProjection> {
    const target = this.#rollBackTarget(this.#scan(1).latestReplacement);
    requireReplacement(target !== null && target.replacementId === replacementId, 'DATABASE_REPLACEMENT_ROLLBACK_STALE', '这次替换已不能回退。');
    requireReplacement(await readPendingReplacement(this.#dataRoot) === null, 'DATABASE_REPLACEMENT_PENDING', '已有一次替换在等待 AI7 重新启动；请先取消它。');
    await this.#stage('roll-back', join(backupLocationFor(this.#dataRoot), target.backupFileName), target.backupSha256, now);
    this.#waiting = true;
    return this.projection();
  }

  /** The replacement waiting, if any, and the replacements this data records, newest first. */
  async projection(): Promise<DatabaseReplacementsProjection> {
    const pending = await readPendingReplacement(this.#dataRoot);
    const { records, total, latestReplacement } = this.#scan(MAX_DATABASE_REPLACEMENTS_LISTED);
    const location = backupLocationFor(this.#dataRoot);
    return {
      pending: pending === null ? null : pendingProjection(pending),
      replacements: records.map((record): DatabaseReplacementRecordProjection => ({
        replacementId: record.replacementId,
        kind: record.kind,
        outcome: record.outcome,
        packageFileName: record.packageFileName,
        backupFileName: record.backupFileName,
        preparedAt: record.preparedAt,
        recordedAt: record.recordedAt,
        backupPresent: existsSync(join(location, record.backupFileName)),
        mergedTitles: record.mergeBooks === null ? null : record.mergeBooks.map((book) => book.title),
        failure: record.failure ?? null,
      })),
      total,
      rollBackOf: pending === null ? this.#rollBackTarget(latestReplacement)?.replacementId ?? null : null,
      backupLocation: location,
    };
  }

  /**
   * Record what came of a replacement in the data open now — the data it brought in, or the data it spared — or of a merge, in
   * the data it merged into or left as it was. Once.
   */
  record(replacement: AppliedReplacement, now: Date): void {
    const { intent, outcome, failure } = replacement;
    if (intent.kind === 'merge') {
      this.#recordMerge(intent, outcome, failure, now);
      return;
    }
    if (this.#db.prepare('SELECT 1 FROM database_replacements WHERE replacement_id = ?').get(intent.replacementId) !== undefined) return;
    const stored: Omit<StoredReplacement, 'mergeBooks' | 'mergeNotices'> = {
      replacementId: intent.replacementId,
      kind: intent.kind,
      outcome,
      packageFileName: intent.packageFileName,
      packageSha256: intent.packageSha256,
      backupFileName: intent.backupFileName,
      backupSha256: intent.backupSha256,
      preparedAt: intent.preparedAt,
      recordedAt: now.toISOString(),
      // Named only on a replacement that failed, so every applied one reads back as it always did.
      ...(outcome === 'failed' && failure !== undefined ? { failure } : {}),
    };
    const record = canonicalRecord({ schema: RECORD_SCHEMA, ...stored });
    this.#db.prepare(
      `INSERT INTO database_replacements(replacement_id, kind, outcome, package_file_name, package_sha256, backup_file_name, backup_sha256, prepared_at, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(stored.replacementId, stored.kind, stored.outcome, stored.packageFileName, stored.packageSha256, stored.backupFileName,
      stored.backupSha256, stored.preparedAt, stored.recordedAt, record.json, record.digest);
  }

  #recordMerge(intent: ReplacementIntent, outcome: 'applied' | 'failed', failure: DatabaseReplacementFailure | undefined, now: Date): void {
    if (this.#db.prepare('SELECT 1 FROM database_merges WHERE merge_id = ?').get(intent.replacementId) !== undefined) return;
    const stored = {
      mergeId: intent.replacementId,
      outcome,
      packageFileName: intent.packageFileName,
      packageSha256: intent.packageSha256,
      backupFileName: intent.backupFileName,
      backupSha256: intent.backupSha256,
      books: intent.mergeBooks ?? [],
      notices: intent.mergeNotices,
      preparedAt: intent.preparedAt,
      recordedAt: now.toISOString(),
      // Named only on a merge that failed.
      ...(outcome === 'failed' && failure !== undefined ? { failure } : {}),
    };
    const record = canonicalRecord({ schema: MERGE_RECORD_SCHEMA, ...stored });
    this.#db.prepare(
      `INSERT INTO database_merges(merge_id, outcome, package_file_name, package_sha256, backup_file_name, backup_sha256, books_json, notices_json, prepared_at, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(stored.mergeId, stored.outcome, stored.packageFileName, stored.packageSha256, stored.backupFileName, stored.backupSha256,
      canonicalJson(stored.books), canonicalJson(stored.notices), stored.preparedAt, stored.recordedAt, record.json, record.digest);
  }

  /** The merges this data records, newest first, each verified against its row as it is read. */
  *#mergeRecords(): Generator<StoredReplacement> {
    for (const row of this.#db.prepare('SELECT * FROM database_merges ORDER BY rowid DESC').iterate() as Iterable<SqlRow>) {
      const outcome = text(row.outcome);
      requireReplacement(outcome === 'applied' || outcome === 'failed', 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
      const books: unknown = parseCanonicalJson(text(row.books_json));
      const notices: unknown = parseCanonicalJson(text(row.notices_json));
      requireReplacement(Array.isArray(books) && books.every(isBook) && Array.isArray(notices) &&
        notices.every((notice) => typeof notice === 'string' && MERGE_NOTICES.includes(notice)), 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
      const stored = {
        mergeId: text(row.merge_id),
        outcome,
        packageFileName: text(row.package_file_name),
        packageSha256: text(row.package_sha256),
        backupFileName: text(row.backup_file_name),
        backupSha256: text(row.backup_sha256),
        books,
        notices,
        preparedAt: text(row.prepared_at),
        recordedAt: text(row.recorded_at),
      };
      const canonical = text(row.canonical_json);
      requireReplacement(sha256Hex(canonical) === text(row.sha256), 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
      const record = parseCanonicalJson(canonical);
      requireReplacement(isRecord(record), 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
      const failure = failureOf(record, outcome);
      requireReplacement(canonicalJson(record) === canonicalJson({ schema: MERGE_RECORD_SCHEMA, ...stored, ...(failure === undefined ? {} : { failure }) }),
        'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
      yield {
        replacementId: stored.mergeId,
        kind: 'merge',
        outcome,
        packageFileName: stored.packageFileName,
        packageSha256: stored.packageSha256,
        backupFileName: stored.backupFileName,
        backupSha256: stored.backupSha256,
        preparedAt: stored.preparedAt,
        recordedAt: stored.recordedAt,
        mergeBooks: books as DatabaseImportBookProjection[],
        mergeNotices: notices as DatabaseMergeNotice[],
        ...(failure === undefined ? {} : { failure }),
      };
    }
  }

  /**
   * The package at `source` taken into the staging place — refused unless this AI7 can take its data — the data backed up, and
   * the intent written last.
   */
  async #stage(kind: 'replace' | 'roll-back', source: string, expectedSha256: string, now: Date): Promise<void> {
    const { manifest, sha256 } = await extractReplacement(this.#dataRoot, source, expectedSha256);
    try {
      const packageMembersSha256 = await writeReplacementMembers(this.#dataRoot, manifest.members);
      const facts = this.#sources.facts();
      requireReplacement(importCompatibility(manifest, facts.dataVersion, facts.schemaRevision) === 'compatible',
        'DATABASE_IMPORT_INCOMPATIBLE', '这个数据库文件与本机 AI7 的数据版本不兼容，不能用来替换。');
      const backup = await this.#backUp(now, 'pre-replace-backup');
      await writeReplacementIntent(this.#dataRoot, {
        replacementId: randomUUID(),
        kind,
        packageFileName: basename(source),
        packageSha256: sha256,
        packageCreatedAt: manifest.createdAt,
        packageOrigin: manifest.origin,
        packageContents: manifest.contents,
        backupFileName: backup.fileName,
        backupSha256: backup.sha256,
        preparedAt: now.toISOString(),
        mergeBooks: null,
        mergeNotices: [],
        packageMembersSha256,
      });
    } catch (error) {
      await discardReplacement(this.#dataRoot).catch(() => undefined);
      throw error;
    }
  }

  /** The data as it is, backed up into the backup location as a package, kept until the editor deletes it (§1.4). */
  async #backUp(now: Date, origin: 'pre-replace-backup' | 'pre-merge-backup'): Promise<{ fileName: string; sha256: string }> {
    const location = await ensureBackupLocation(this.#dataRoot);
    const fileName = origin === 'pre-merge-backup' ? preMergeBackupFileName(now) : preReplaceBackupFileName(now);
    const target = join(location, fileName);
    requireReplacement(!existsSync(target), 'DATABASE_REPLACEMENT_BACKUP_EXISTS', '这一刻已经做过一次备份，请稍后再试。');
    const partial = join(location, `.${randomUUID()}${DATABASE_PACKAGE_EXTENSION}.partial`);
    try {
      const written = await writeDatabasePackage(this.#db, this.#dataRoot, partial, () => ({
        ...this.#sources.facts(),
        createdAt: now.toISOString(),
        origin,
        contents: this.#sources.contents(),
      }));
      // Only ever a new file (Issue #434 review): the name is taken at the instant the backup is put there, as every export's.
      const taken = await takeFreeName(partial, target);
      requireReplacement(taken !== 'exists', 'DATABASE_REPLACEMENT_BACKUP_EXISTS', '这一刻已经做过一次备份，请稍后再试。');
      requireReplacement(taken !== 'unsupported', 'DATABASE_REPLACEMENT_BACKUP_UNSUPPORTED', '备份位置所在的磁盘不能安全地新建文件。');
      requireReplacement(taken === 'taken', 'DATABASE_REPLACEMENT_FAILED', '无法把备份放到备份位置。');
      return { fileName, sha256: written.sha256 };
    } finally {
      await rm(partial, { force: true }).catch(() => undefined);
    }
  }

  /** The replacement `回退` undoes: the latest, when it replaced this data and its backup is still in the backup location. */
  #rollBackTarget(latest: StoredReplacement | null): StoredReplacement | null {
    if (latest === null || latest.kind !== 'replace' || latest.outcome !== 'applied') return null;
    return existsSync(join(backupLocationFor(this.#dataRoot), latest.backupFileName)) ? latest : null;
  }

  /**
   * The replacements and merges this data records, in one list, newest first, each verified against its row as it is read
   * (Issue #434 review): the first `listed` of them, how many there are, and the latest replacement, which 回退 reads.
   */
  #scan(listed: number): { records: StoredReplacement[]; total: number; latestReplacement: StoredReplacement | null } {
    const records: StoredReplacement[] = [];
    let total = 0;
    let latestReplacement: StoredReplacement | null = null;
    const replacements = this.#replacementRecords();
    const merges = this.#mergeRecords();
    let replacement = replacements.next();
    let merge = merges.next();
    while (!replacement.done || !merge.done) {
      const takeReplacement = merge.done || (!replacement.done && replacement.value.recordedAt.localeCompare(merge.value.recordedAt) >= 0);
      const record = takeReplacement ? replacement.value as StoredReplacement : merge.value as StoredReplacement;
      if (takeReplacement) {
        latestReplacement ??= record;
        replacement = replacements.next();
      } else {
        merge = merges.next();
      }
      total += 1;
      if (records.length < listed) records.push(record);
    }
    return { records, total, latestReplacement };
  }

  /** The replacements this data records, newest first, each verified as it is read. */
  *#replacementRecords(): Generator<StoredReplacement> {
    for (const row of this.#db.prepare('SELECT * FROM database_replacements ORDER BY rowid DESC').iterate() as Iterable<SqlRow>) {
      yield this.#verified(row);
    }
  }

  #verified(row: SqlRow): StoredReplacement {
    const kind = text(row.kind);
    const outcome = text(row.outcome);
    requireReplacement((kind === 'replace' || kind === 'roll-back') && (outcome === 'applied' || outcome === 'failed'),
      'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
    const stored = {
      replacementId: text(row.replacement_id),
      kind,
      outcome,
      packageFileName: text(row.package_file_name),
      packageSha256: text(row.package_sha256),
      backupFileName: text(row.backup_file_name),
      backupSha256: text(row.backup_sha256),
      preparedAt: text(row.prepared_at),
      recordedAt: text(row.recorded_at),
    } as const;
    const canonical = text(row.canonical_json);
    requireReplacement(sha256Hex(canonical) === text(row.sha256), 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
    const record = parseCanonicalJson(canonical);
    requireReplacement(isRecord(record), 'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
    const failure = failureOf(record, outcome);
    requireReplacement(canonicalJson(record) === canonicalJson({ schema: RECORD_SCHEMA, ...stored, ...(failure === undefined ? {} : { failure }) }),
      'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
    return { ...stored, mergeBooks: null, mergeNotices: [], ...(failure === undefined ? {} : { failure }) };
  }
}

/** Why a stored replacement or merge failed, as its record names it: only on one that failed, and only a reason AI7 gives. */
function failureOf(record: Record<string, unknown>, outcome: string): DatabaseReplacementFailure | undefined {
  const failure = record.failure;
  requireReplacement(failure === undefined || (outcome === 'failed' && (failure === 'unopenable' || failure === 'changed')),
    'DATABASE_REPLACEMENT_RECORD_INVALID', INVALID);
  return failure as DatabaseReplacementFailure | undefined;
}

function pendingProjection(intent: ReplacementIntent): DatabasePendingReplacementProjection {
  return {
    replacementId: intent.replacementId,
    kind: intent.kind,
    packageFileName: intent.packageFileName,
    packageCreatedAt: intent.packageCreatedAt,
    packageOrigin: intent.packageOrigin,
    contents: intent.packageContents,
    backupFileName: intent.backupFileName,
    preparedAt: intent.preparedAt,
    mergeBooks: intent.mergeBooks,
    mergeNotices: intent.mergeNotices,
  };
}
