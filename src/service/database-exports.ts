import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, opendir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import {
  MAX_DATABASE_EXPORTS_LISTED,
  type DatabaseExportActivityProjection,
  type DatabaseExportContentsProjection,
  type DatabaseExportPreparationProjection,
  type DatabaseExportReceiptProjection,
  type DatabaseExportsProjection,
} from '../shared/protocol.js';
import { fixedArchiveTime } from '../shared/archive-time.js';
import { ensureCanonicalDataDirectory } from '../shared/data-root.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import {
  EXPORT_DISPOSITION_LABELS,
  EXPORT_FAILURE_DETAILS,
  EXPORT_OUTCOME_LABELS,
  EXPORT_STAGING_DIRECTORY,
  ExportLedgerError,
  fileDigest,
  resolveExportDestination,
  writeAtomically,
  type ReplacedFileIdentity,
} from './manuscript-export.js';

/**
 * 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.4, §1.6, §1.7): every Book with its manuscripts and
 * history, every knowledge-base item and every setting, packaged into one file the editor chooses. It runs through External
 * Export Policy v2 as its own target kind, `database-export-package`, with the same platform picker, per-file preparation,
 * approval and receipt as every export. The package is not encrypted (§1.6) and holds no Model Service credential: those
 * live in the platform's protected store, never under the Agent Data Root, and the package reads nothing else.
 *
 * The package (`ai7.database-package/1`) is a ZIP of:
 * - `store/ai7.sqlite`, a consistent copy of the store made by `VACUUM INTO`;
 * - every other file under the Agent Data Root, except the live store, the export staging area and the shell's browser
 *   profile;
 * - `manifest.json`, last: the Data Version, the software version and schema revision, when and why it was made, what it
 *   holds, and each member's path, size and digest.
 * The backups of S86b and S85b are the same package (§1.4).
 *
 * Choosing the file prepares: the package is written into the export staging area, and the preparation records its digest
 * and size. `按上述方式导出` then approves that exact package and writes it at the chosen place atomically, as every export
 * is written. Schema revision 55 owns three relations, ledgers like the export ledger's.
 *
 * Both run off the request, one export at a time, as the export's activity (V2-UX-EXP-011; Issue #434 review): the bytes
 * read of how many, and 取消导出 until the file is being put at the chosen place — never after.
 */

export const DATABASE_PACKAGE_SCHEMA = 'ai7.database-package/1' as const;
export const DATABASE_PACKAGE_EXTENSION = '.ai7db' as const;
export const DATABASE_PACKAGE_STORE_MEMBER = 'store/ai7.sqlite' as const;
export const DATABASE_PACKAGE_MANIFEST_MEMBER = 'manifest.json' as const;
/** The Agent Data Root's own directories a package never carries: the live store — copied consistently instead — the export staging area and the shell's browser profile. */
export const DATABASE_PACKAGE_EXCLUDED_ROOTS: ReadonlySet<string> = new Set(['store', EXPORT_STAGING_DIRECTORY, 'shell']);
/** A ZIP without ZIP64 holds at most this many members, each and all below 4 GiB. */
const MAX_PACKAGE_MEMBERS = 65_534;
/** The most directories a package's walk visits: a data root with more is refused as too large (Issue #434 review). */
const MAX_PACKAGE_DIRECTORIES = 65_534;
const MAX_ZIP_BYTES = 0xffff_ffff;
const COPY_CHUNK_BYTES = 1 << 20;

export const DATABASE_EXPORT_SCHEMA_SQL = {
  database_export_preparations: `CREATE TABLE database_export_preparations (
  preparation_id TEXT PRIMARY KEY,
  effect_intent_id TEXT NOT NULL UNIQUE,
  target_kind TEXT NOT NULL CHECK(target_kind = 'database-export-package'),
  package_schema TEXT NOT NULL CHECK(package_schema = 'ai7.database-package/1'),
  data_version INTEGER NOT NULL CHECK(data_version >= 1),
  schema_revision INTEGER NOT NULL CHECK(schema_revision >= 1),
  software_version TEXT NOT NULL CHECK(length(software_version) BETWEEN 1 AND 64),
  contents_json TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  destination TEXT NOT NULL CHECK(length(destination) BETWEEN 1 AND 1024),
  disposition TEXT NOT NULL CHECK(disposition IN ('create', 'replace')),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  policy_id TEXT NOT NULL CHECK(policy_id = 'external-export-policy'),
  policy_version TEXT NOT NULL CHECK(policy_version = 'v2'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  database_export_approvals: `CREATE TABLE database_export_approvals (
  approval_id TEXT PRIMARY KEY,
  preparation_id TEXT NOT NULL UNIQUE REFERENCES database_export_preparations(preparation_id),
  effect_intent_id TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  interaction TEXT NOT NULL CHECK(interaction = 'export-as-stated'),
  approved_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  database_export_receipts: `CREATE TABLE database_export_receipts (
  receipt_id TEXT PRIMARY KEY,
  preparation_id TEXT NOT NULL UNIQUE REFERENCES database_export_preparations(preparation_id),
  approval_id TEXT NOT NULL UNIQUE REFERENCES database_export_approvals(approval_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('created', 'replaced', 'ambiguous', 'failed')),
  final_path TEXT NOT NULL CHECK(length(final_path) BETWEEN 1 AND 1024),
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length > 0),
  file_sha256 TEXT CHECK(file_sha256 IS NULL OR length(file_sha256) = 64),
  failure_code TEXT,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((outcome IN ('created', 'replaced')) = (byte_length IS NOT NULL AND file_sha256 IS NOT NULL)),
  CHECK((outcome IN ('ambiguous', 'failed')) = (failure_code IS NOT NULL))
) STRICT`,
} as const;

/** Every database export relation is a ledger: a row is appended once and never rewritten or removed. */
export const DATABASE_EXPORT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(DATABASE_EXPORT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_EXPORT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_EXPORT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const DATABASE_EXPORT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  database_export_approvals: ['preparation_id>database_export_preparations.preparation_id:NO ACTION/NO ACTION/NONE'],
  database_export_receipts: [
    'approval_id>database_export_approvals.approval_id:NO ACTION/NO ACTION/NONE',
    'preparation_id>database_export_preparations.preparation_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class DatabaseExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DatabaseExportError';
  }
}

function requireDatabaseExport(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DatabaseExportError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'database_export_preparations'";

/** Revision 55's relations, created once: a store that predates them gains three empty ledgers and nothing existing moves. */
export function initializeDatabaseExportSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DATABASE_EXPORT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DATABASE_EXPORT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Database export schema rollback failed.');
    }
    throw error;
  }
}

// ---- the package --------------------------------------------------------------------------------------

/** Why a package was made: the editor's own export (S86a), or a 定期自动备份 (S86b). S85b writes the same package. */
export type DatabasePackageOrigin = 'database-export' | 'scheduled-backup';

export interface DatabasePackageFacts {
  readonly dataVersion: number;
  readonly softwareVersion: string;
  readonly schemaRevision: number;
  readonly createdAt: string;
  readonly origin: DatabasePackageOrigin;
  readonly contents: DatabaseExportContentsProjection;
}

export interface DatabasePackageMember {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** One file a package carries: its path inside the package, where it is, and its size when the walk found it. */
export interface DatabasePackageSource {
  readonly member: string;
  readonly path: string;
  readonly bytes: number;
}

/** How much a walk may find before the data root is refused as too large to package. */
export interface DatabasePackageBounds {
  readonly members: number;
  readonly directories: number;
}

const PACKAGE_BOUNDS: DatabasePackageBounds = { members: MAX_PACKAGE_MEMBERS, directories: MAX_PACKAGE_DIRECTORIES };

/**
 * Every file under the Agent Data Root a package carries, by its path inside the package, in a stable order, with its size.
 * The walk reads one directory at a time and holds no more names than a package can carry — the store and the manifest
 * count among them — so a data root too large to package is refused the moment that is known, before its listing is ever
 * held whole (Issue #434 review).
 */
export async function databasePackageSources(dataRoot: string, bounds: DatabasePackageBounds = PACKAGE_BOUNDS): Promise<DatabasePackageSource[]> {
  const found: DatabasePackageSource[] = [];
  // Names listed and not yet walked, across every directory the walk is inside.
  let held = 0;
  let directories = 0;
  const refuse = (): never => {
    throw new DatabaseExportError('DATABASE_PACKAGE_TOO_LARGE', '数据文件过多，暂时无法打包成一个文件。');
  };
  const visit = async (directory: string, prefix: string): Promise<void> => {
    directories += 1;
    if (directories > bounds.directories) refuse();
    const entries: Array<{ name: string; directory: boolean }> = [];
    for await (const entry of await opendir(directory)) {
      if (prefix === '' && DATABASE_PACKAGE_EXCLUDED_ROOTS.has(entry.name)) continue;
      // The Agent Data Root holds no link; a link found there is not followed and not carried.
      if (entry.isSymbolicLink() || !(entry.isDirectory() || entry.isFile())) continue;
      entries.push({ name: entry.name, directory: entry.isDirectory() });
      held += 1;
      if (found.length + held + 2 > bounds.members) refuse();
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      held -= 1;
      const path = join(directory, entry.name);
      const member = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.directory) await visit(path, member);
      else found.push({ member, path, bytes: (await lstat(path)).size });
    }
  };
  await visit(dataRoot, '');
  return found;
}

/** How far writing a package has come: the bytes read of the files it carries, the store's copy among them. */
export interface DatabasePackageProgress {
  readonly completedBytes: number;
  readonly totalBytes: number;
}

export interface DatabasePackageOptions {
  /** Aborted, the write stops at its next chunk, and neither the package nor the store's copy is left (Issue #434 review). */
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: DatabasePackageProgress) => void;
}

/**
 * Write the package for `db` and the files under `dataRoot` to `packagePath`, which must not exist yet, streaming each
 * member so no file is held whole. `facts` is read in the same step as the store's copy is made, with nothing awaited
 * between them, so no other request can write in between: what the manifest says the package holds is what its copy of
 * the store holds (Issue #434 review). Answers the package's size and digest, its members, and those facts.
 */
export async function writeDatabasePackage(
  db: DatabaseSync,
  dataRoot: string,
  packagePath: string,
  facts: () => DatabasePackageFacts,
  options: DatabasePackageOptions = {},
): Promise<{ bytes: number; sha256: string; members: DatabasePackageMember[]; facts: DatabasePackageFacts }> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  const snapshotPath = `${packagePath}.store`;
  await rm(snapshotPath, { force: true });
  signal?.throwIfAborted();
  // A consistent copy of the store, taken between two statements of the one connection that writes it.
  const packageFacts = facts();
  db.prepare('VACUUM INTO ?').run(snapshotPath);
  let output;
  try {
    const sources = await databasePackageSources(dataRoot);
    const totalBytes = sources.reduce((sum, source) => sum + source.bytes, (await lstat(snapshotPath)).size);
    let completedBytes = 0;
    output = await open(packagePath, 'wx');
    const file = output;
    const hash = createHash('sha256');
    let bytes = 0;
    const pending: Uint8Array[] = [];
    let failure: Error | null = null;
    const zip = new Zip((error, chunk) => {
      if (error) failure = error;
      else pending.push(chunk);
    });
    const flush = async (): Promise<void> => {
      if (failure !== null) throw failure;
      while (pending.length > 0) {
        const chunk = pending.shift()!;
        hash.update(chunk);
        bytes += chunk.byteLength;
        requireDatabaseExport(bytes <= MAX_ZIP_BYTES, 'DATABASE_PACKAGE_TOO_LARGE', '数据超过 4 GB，暂时无法打包成一个文件。');
        await file.writeFile(chunk);
      }
    };
    const members: DatabasePackageMember[] = [];
    const add = async (member: string, path: string, compress: boolean): Promise<void> => {
      // Every entry carries the one fixed archive time (Issue #434 review, #615): the export's own time is the manifest's
      // `createdAt`, which is what a preview reads.
      let entry: ZipDeflate | ZipPassThrough;
      if (compress) {
        const deflated = new ZipDeflate(member, { level: 6 });
        deflated.mtime = fixedArchiveTime();
        entry = deflated;
      } else {
        const stored = new ZipPassThrough(member);
        stored.mtime = fixedArchiveTime();
        entry = stored;
      }
      zip.add(entry);
      const memberHash = createHash('sha256');
      let memberBytes = 0;
      const source = await open(path, 'r');
      try {
        const buffer = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
        for (;;) {
          signal?.throwIfAborted();
          const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
          if (bytesRead === 0) break;
          // fflate may keep a pushed chunk until it is written, so each push gets bytes of its own.
          const chunk = Uint8Array.from(buffer.subarray(0, bytesRead));
          memberHash.update(chunk);
          memberBytes += bytesRead;
          requireDatabaseExport(memberBytes <= MAX_ZIP_BYTES, 'DATABASE_PACKAGE_TOO_LARGE', '有文件超过 4 GB，暂时无法打包成一个文件。');
          entry.push(chunk, false);
          await flush();
          completedBytes += bytesRead;
          // A file that grew since the walk found it raises the total rather than reading past it.
          onProgress?.({ completedBytes, totalBytes: Math.max(totalBytes, completedBytes) });
        }
      } finally {
        await source.close();
      }
      entry.push(new Uint8Array(0), true);
      await flush();
      members.push({ path: member, bytes: memberBytes, sha256: memberHash.digest('hex') });
    };
    await add(DATABASE_PACKAGE_STORE_MEMBER, snapshotPath, true);
    for (const source of sources) await add(source.member, source.path, false);
    signal?.throwIfAborted();
    const manifest = canonicalRecord({
      schema: DATABASE_PACKAGE_SCHEMA,
      dataVersion: packageFacts.dataVersion,
      softwareVersion: packageFacts.softwareVersion,
      schemaRevision: packageFacts.schemaRevision,
      createdAt: packageFacts.createdAt,
      origin: packageFacts.origin,
      contents: packageFacts.contents,
      credentials: 'excluded',
      members,
    });
    const manifestEntry = new ZipDeflate(DATABASE_PACKAGE_MANIFEST_MEMBER, { level: 6 });
    manifestEntry.mtime = fixedArchiveTime();
    zip.add(manifestEntry);
    manifestEntry.push(strToU8(manifest.json), true);
    zip.end();
    await flush();
    await file.sync();
    return { bytes, sha256: hash.digest('hex'), members, facts: packageFacts };
  } catch (error) {
    await output?.close().catch(() => undefined);
    output = undefined;
    await rm(packagePath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await output?.close().catch(() => undefined);
    await rm(snapshotPath, { force: true }).catch(() => undefined);
  }
}

// ---- the ledger ---------------------------------------------------------------------------------------

const ACTOR = '本机编辑' as const;
const PREPARATION_SCHEMA = 'ai7.database-export.preparation/1' as const;
const APPROVAL_SCHEMA = 'ai7.database-export.approval/1' as const;
const RECEIPT_SCHEMA = 'ai7.database-export.receipt/1' as const;

/** What the store knows that a database export records: the versions and what the package holds. */
export interface DatabaseExportSources {
  facts(): { dataVersion: number; softwareVersion: string; schemaRevision: number };
  contents(): DatabaseExportContentsProjection;
}

function text(value: SQLOutputValue | undefined): string {
  requireDatabaseExport(typeof value === 'string', 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  const number = typeof value === 'bigint' ? Number(value) : value;
  requireDatabaseExport(typeof number === 'number' && Number.isSafeInteger(number), 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录无效。');
  return number;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null ? null : text(value);
}

function isContents(value: unknown): value is DatabaseExportContentsProjection {
  return isRecord(value) && Object.keys(value).length === 4 &&
    (['books', 'sourceVersions', 'libraryMaterials', 'series'] as const).every((key) =>
      typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && (value[key] as number) >= 0);
}

/** A stored record read back: its digest, and every field it names against the row it was written with. */
function requireStored(json: SQLOutputValue | undefined, digest: SQLOutputValue | undefined, expected: Record<string, unknown>): Record<string, unknown> {
  const canonical = text(json);
  requireDatabaseExport(sha256Hex(canonical) === text(digest), 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录已损坏。');
  const record = parseCanonicalJson(canonical);
  requireDatabaseExport(isRecord(record), 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录已损坏。');
  for (const [key, value] of Object.entries(expected)) {
    requireDatabaseExport(key in record && canonicalJson(record[key]) === canonicalJson(value), 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录已损坏。');
  }
  return record;
}

/** The export under way, or how the last one ended (V2-UX-EXP-011). */
interface ExportActivity {
  readonly activityId: string;
  readonly kind: DatabaseExportActivityProjection['kind'];
  readonly controller: AbortController;
  state: DatabaseExportActivityProjection['state'];
  step: NonNullable<DatabaseExportActivityProjection['step']>;
  completedBytes: number;
  totalBytes: number;
  /** The preparation it made, or the one it approves. */
  preparationId: string | null;
  failure: { code: string; message: string } | null;
  done: Promise<void>;
}

/** What an export that could not finish says when the cause is not one of the export's own refusals. */
const PREPARE_FAILED = { code: 'DATABASE_EXPORT_PREPARE_FAILED', message: '未能打包数据库。' } as const;
const APPROVE_FAILED = { code: 'DATABASE_EXPORT_WRITE_FAILED', message: '未能导出数据库。' } as const;

/** 取消导出 stops an export until it begins putting the file in place, and never after (V2-UX-EXP-011). */
function cancellable(activity: ExportActivity): boolean {
  return activity.state === 'running' && activity.step !== 'committing' && !activity.controller.signal.aborted;
}

export class DatabaseExports {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #sources: DatabaseExportSources;
  /** The export under way, or how the last one ended: one at a time. */
  #activity: ExportActivity | null = null;
  /** Set once the service stops: no export starts after it. */
  #stopped = false;

  constructor(db: DatabaseSync, dataRoot: string, sources: DatabaseExportSources) {
    this.#db = db;
    this.#dataRoot = dataRoot;
    this.#sources = sources;
  }

  /**
   * The destination the Save dialog answered becomes one preparation, packed off the request (V2-UX-EXP-011): the package
   * is written into the export staging area and recorded with its digest and size, what it holds, and the file it would
   * create or replace. Nothing is written at the destination; a preparation never approved is only its record
   * (V2-UX-EXP-020). Answers at once with the activity, which 取消导出 stops until the preparation is recorded.
   */
  startPreparation(destinationInput: unknown, available: boolean): DatabaseExportActivityProjection {
    requireDatabaseExport(available, 'EXPORT_POLICY_UNAVAILABLE', '对外导出策略未通过本次启动的校验，导出不可用。');
    const activity = this.#begin('prepare', 'packing');
    activity.done = this.#prepare(activity, destinationInput);
    return this.#projection(activity);
  }

  /**
   * `按上述方式导出`: the editor's one approval of one unchanged preparation, carried out off the request (V2-UX-EXP-011). The
   * staged package is read whole first and must still be exactly the one prepared; 取消导出 then leaves the preparation as
   * it was, and only after that read is the approval recorded. The package is written at the destination atomically and the
   * outcome receipted: 取消导出 while it is written ends it with the receipt `EXPORT_CANCELLED` and the destination as it
   * was, and once the file is being put in place nothing stops it. Nothing retries by itself (V2-UX-EXP-021).
   */
  startApproval(preparationId: unknown, available: boolean): DatabaseExportActivityProjection {
    requireDatabaseExport(available, 'EXPORT_POLICY_UNAVAILABLE', '对外导出策略未通过本次启动的校验，导出不可用。');
    requireDatabaseExport(typeof preparationId === 'string' && UUID_PATTERN.test(preparationId), 'DATABASE_EXPORT_NOT_FOUND', '这次数据库导出不存在。');
    const { row: preparation } = this.#verifiedPreparation(preparationId);
    requireDatabaseExport(this.#db.prepare('SELECT 1 FROM database_export_approvals WHERE preparation_id = ?').get(preparationId) === undefined,
      'DATABASE_EXPORT_ALREADY_APPROVED', '这次数据库导出已经批准过。');
    const activity = this.#begin('approve', 'verifying');
    activity.preparationId = preparationId;
    // The staged package is read before the approval, then written, then read back where it was written and where it lands.
    activity.totalBytes = integer(preparation.payload_bytes) * 4;
    activity.done = this.#approve(activity, preparation);
    return this.#projection(activity);
  }

  /**
   * 取消导出 (V2-UX-EXP-011): the export under way stops at its next step, until it begins putting the file in place — never
   * after, and never claiming to undo what is there. Answers the activity as it now stands.
   */
  cancel(activityId: unknown): DatabaseExportActivityProjection {
    const activity = this.#activity;
    requireDatabaseExport(activity !== null && activity.activityId === activityId, 'DATABASE_EXPORT_ACTIVITY_NOT_FOUND', '这次数据库导出已经不在进行。');
    if (cancellable(activity)) activity.controller.abort();
    return this.#projection(activity);
  }

  /** The export under way, or how the last one ended; `null` before any in this launch. A read. */
  activity(): DatabaseExportActivityProjection | null {
    return this.#activity === null ? null : this.#projection(this.#activity);
  }

  /** Resolves once the export under way, if any, has ended. */
  async settled(): Promise<void> {
    await this.#activity?.done;
  }

  /**
   * At shutdown, before the store closes (Issue #434 review): no export starts after it, and one under way stops as
   * 取消导出 stops it, leaving no package it was writing.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    const activity = this.#activity;
    if (activity !== null && cancellable(activity)) activity.controller.abort();
    await activity?.done;
  }

  /** Prepare, and wait for the preparation: what a caller that follows no activity uses. A failure is thrown. */
  async prepare(destinationInput: unknown, available: boolean): Promise<DatabaseExportPreparationProjection> {
    this.startPreparation(destinationInput, available);
    return this.#outcome((activity) => this.#preparation(activity.preparationId!));
  }

  /** Approve, and wait for the receipt: what a caller that follows no activity uses. A failure is thrown. */
  async approve(preparationId: unknown, available: boolean): Promise<DatabaseExportReceiptProjection> {
    this.startApproval(preparationId, available);
    return this.#outcome((activity) => this.#receipt(activity.preparationId!)!);
  }

  async #outcome<T>(result: (activity: ExportActivity) => T): Promise<T> {
    const activity = this.#activity!;
    await activity.done;
    if (activity.state === 'failed') throw new DatabaseExportError(activity.failure!.code, activity.failure!.message);
    requireDatabaseExport(activity.state !== 'cancelled', 'DATABASE_EXPORT_CANCELLED', '数据库导出已取消。');
    return result(activity);
  }

  #begin(kind: ExportActivity['kind'], step: ExportActivity['step']): ExportActivity {
    requireDatabaseExport(!this.#stopped, 'SERVICE_STOPPING', '本地业务服务正在停止。');
    requireDatabaseExport(this.#activity?.state !== 'running', 'DATABASE_EXPORT_BUSY', '上一次数据库导出还没有结束。');
    const activity: ExportActivity = {
      activityId: randomUUID(),
      kind,
      controller: new AbortController(),
      state: 'running',
      step,
      completedBytes: 0,
      totalBytes: 0,
      preparationId: null,
      failure: null,
      done: Promise.resolve(),
    };
    this.#activity = activity;
    return activity;
  }

  /** An export that stopped: 取消导出's, or a failure in the export's own words, or in general ones. */
  #fail(activity: ExportActivity, error: unknown, fallback: { code: string; message: string }): void {
    if (activity.controller.signal.aborted) {
      activity.state = 'cancelled';
      return;
    }
    activity.state = 'failed';
    activity.failure = error instanceof DatabaseExportError || error instanceof ExportLedgerError
      ? { code: error.code, message: error.message }
      : { ...fallback };
  }

  async #prepare(activity: ExportActivity, destinationInput: unknown): Promise<void> {
    const { signal } = activity.controller;
    let staged: string | null = null;
    try {
      const destination = await resolveExportDestination(destinationInput, DATABASE_PACKAGE_EXTENSION, this.#dataRoot);
      // One package is staged at a time: an earlier preparation's that was never approved is not kept.
      await this.sweep();
      const staging = await this.#stagingDirectory();
      const preparationId = randomUUID();
      const effectIntentId = randomUUID();
      staged = this.#stagedPath(staging, effectIntentId);
      const written = await writeDatabasePackage(this.#db, this.#dataRoot, staged, () => ({
        ...this.#sources.facts(),
        createdAt: new Date().toISOString(),
        origin: 'database-export',
        contents: this.#sources.contents(),
      }), {
        signal,
        onProgress: (progress) => {
          activity.completedBytes = progress.completedBytes;
          activity.totalBytes = progress.totalBytes;
        },
      });
      signal.throwIfAborted();
      const { facts } = written;
      const record = canonicalRecord({
        schema: PREPARATION_SCHEMA,
        preparationId,
        effectIntentId,
        targetKind: 'database-export-package',
        packageSchema: DATABASE_PACKAGE_SCHEMA,
        dataVersion: facts.dataVersion,
        schemaRevision: facts.schemaRevision,
        softwareVersion: facts.softwareVersion,
        contents: facts.contents,
        fileName: destination.fileName,
        destination: destination.path,
        disposition: destination.disposition,
        replaces: destination.replaces,
        payloadSha256: written.sha256,
        payloadBytes: written.bytes,
        policy: 'external-export-policy/v2',
        createdAt: facts.createdAt,
      });
      this.#db.prepare(
        `INSERT INTO database_export_preparations(
           preparation_id, effect_intent_id, target_kind, package_schema, data_version, schema_revision, software_version,
           contents_json, file_name, destination, disposition, payload_sha256, payload_bytes, policy_id, policy_version,
           created_at, canonical_json, sha256
         ) VALUES (?, ?, 'database-export-package', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'external-export-policy', 'v2', ?, ?, ?)`,
      ).run(preparationId, effectIntentId, DATABASE_PACKAGE_SCHEMA, facts.dataVersion, facts.schemaRevision, facts.softwareVersion,
        canonicalJson(facts.contents), destination.fileName, destination.path, destination.disposition, written.sha256, written.bytes,
        facts.createdAt, record.json, record.digest);
      activity.preparationId = preparationId;
      activity.state = 'prepared';
    } catch (error) {
      // A package no preparation records is not kept.
      if (staged !== null) await rm(staged, { force: true }).catch(() => undefined);
      this.#fail(activity, error, PREPARE_FAILED);
    }
  }

  async #approve(activity: ExportActivity, preparation: SqlRow): Promise<void> {
    const { signal } = activity.controller;
    const preparationId = activity.preparationId!;
    const effectIntentId = text(preparation.effect_intent_id);
    const payloadSha256 = text(preparation.payload_sha256);
    const payloadBytes = integer(preparation.payload_bytes);
    const read = (bytes: number): void => {
      activity.completedBytes = Math.min(activity.totalBytes, activity.completedBytes + bytes);
    };
    try {
      const staged = this.#stagedPath(await this.#stagingDirectory(), effectIntentId);
      const standing = await fileDigest(staged, { signal, onBytes: read });
      // 取消导出 before the approval leaves the preparation and its package as they were.
      signal.throwIfAborted();
      requireDatabaseExport(standing?.sha256 === payloadSha256 && standing.bytes === payloadBytes, 'DATABASE_EXPORT_STALE',
        '准备好的数据库文件已不在或已变化，请重新导出数据库。');
      const approvalId = randomUUID();
      const approvedAt = new Date().toISOString();
      const approval = canonicalRecord({
        schema: APPROVAL_SCHEMA,
        approvalId,
        preparationId,
        effectIntentId,
        payloadSha256,
        actor: ACTOR,
        interaction: 'export-as-stated',
        approvedAt,
      });
      this.#db.prepare(
        `INSERT INTO database_export_approvals(approval_id, preparation_id, effect_intent_id, payload_sha256, actor, interaction, approved_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, 'export-as-stated', ?, ?, ?)`,
      ).run(approvalId, preparationId, effectIntentId, payloadSha256, ACTOR, approvedAt, approval.json, approval.digest);
      activity.step = 'writing';
      const destination = text(preparation.destination);
      const written = await writeAtomically(destination, { path: staged, bytes: payloadBytes }, payloadSha256,
        text(preparation.disposition) as 'create' | 'replace', effectIntentId, this.#replacedFileOf(preparation), {
          signal,
          onBytes: read,
          onCommit: () => {
            activity.step = 'committing';
          },
        });
      const receiptId = randomUUID();
      const recordedAt = new Date().toISOString();
      const { byteLength, fileSha256, failureCode } = 'code' in written
        ? { byteLength: null, fileSha256: null, failureCode: written.code }
        : { byteLength: written.bytes, fileSha256: written.sha256, failureCode: null };
      const receipt = canonicalRecord({
        schema: RECEIPT_SCHEMA,
        receiptId,
        preparationId,
        approvalId,
        effectIntentId,
        outcome: written.outcome,
        finalPath: destination,
        byteLength,
        fileSha256,
        failureCode,
        recordedAt,
      });
      this.#db.prepare(
        `INSERT INTO database_export_receipts(receipt_id, preparation_id, approval_id, outcome, final_path, byte_length, file_sha256, failure_code, recorded_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(receiptId, preparationId, approvalId, written.outcome, destination, byteLength, fileSha256, failureCode, recordedAt, receipt.json, receipt.digest);
      await rm(staged, { force: true }).catch(() => undefined);
      // A written file was read back whole; one stopped or refused stays where it stopped.
      if (!('code' in written)) activity.completedBytes = activity.totalBytes;
      activity.state = 'finished';
    } catch (error) {
      // Before the approval nothing is recorded, and the prepared package stays; after it, an approval with no receipt reads
      // as the interrupted write it is.
      this.#fail(activity, error, APPROVE_FAILED);
    }
  }

  #projection(activity: ExportActivity): DatabaseExportActivityProjection {
    return {
      activityId: activity.activityId,
      kind: activity.kind,
      state: activity.state,
      step: activity.state === 'running' ? activity.step : null,
      completedBytes: activity.completedBytes,
      totalBytes: activity.totalBytes,
      cancellable: cancellable(activity),
      preparation: activity.preparationId === null ? null : this.#preparation(activity.preparationId),
      receipt: activity.kind === 'approve' && activity.state === 'finished' ? this.#receipt(activity.preparationId!) : null,
      failure: activity.failure,
    };
  }

  /** The approved exports, newest first: what each came to. */
  history(): DatabaseExportsProjection {
    const total = integer((this.#db.prepare('SELECT count(*) count FROM database_export_approvals').get() as SqlRow).count);
    const rows = this.#db.prepare(
      `SELECT preparation_id FROM database_export_approvals ORDER BY approved_at DESC, rowid DESC LIMIT ${MAX_DATABASE_EXPORTS_LISTED}`,
    ).all() as SqlRow[];
    return { exports: rows.map((row) => this.#receipt(text(row.preparation_id))!), total, activity: this.activity() };
  }

  preparationOf(preparationId: string): DatabaseExportPreparationProjection {
    return this.#preparation(preparationId);
  }

  /**
   * At store open (Issue #434 review): a staged package no approval will ever take — a preparation from before this launch,
   * cancelled, or cut off mid-write — is a whole copy of the data, so none is kept. Its preparation's record stays, and an
   * approval of it is refused as stale and prepares again.
   */
  async sweep(): Promise<void> {
    const staging = await this.#stagingDirectory();
    for (const entry of await readdir(staging)) {
      if (entry.endsWith(DATABASE_PACKAGE_EXTENSION) || entry.endsWith(`${DATABASE_PACKAGE_EXTENSION}.store`)) {
        await rm(join(staging, entry), { force: true });
      }
    }
  }

  async #stagingDirectory(): Promise<string> {
    return ensureCanonicalDataDirectory(this.#dataRoot, EXPORT_STAGING_DIRECTORY);
  }

  #stagedPath(staging: string, effectIntentId: string): string {
    return join(staging, `${effectIntentId}${DATABASE_PACKAGE_EXTENSION}`);
  }

  #preparationRow(preparationId: string): SqlRow {
    const row = this.#db.prepare('SELECT * FROM database_export_preparations WHERE preparation_id = ?').get(preparationId) as SqlRow | undefined;
    requireDatabaseExport(row !== undefined, 'DATABASE_EXPORT_NOT_FOUND', '这次数据库导出不存在。');
    return row;
  }

  #replacedFileOf(row: SqlRow): ReplacedFileIdentity | null {
    const record = parseCanonicalJson(text(row.canonical_json));
    const replaces = isRecord(record) ? record.replaces : undefined;
    if (text(row.disposition) === 'create') {
      requireDatabaseExport(replaces === null, 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录无效。');
      return null;
    }
    requireDatabaseExport(
      isRecord(replaces) && Object.keys(replaces).length === 2 && typeof replaces.bytes === 'number' && Number.isSafeInteger(replaces.bytes) &&
        replaces.bytes >= 0 && typeof replaces.sha256 === 'string' && DIGEST_PATTERN.test(replaces.sha256),
      'DATABASE_EXPORT_RECORD_INVALID',
      '数据库导出记录无效。',
    );
    return { bytes: replaces.bytes, sha256: replaces.sha256 };
  }

  /** A preparation's row with its record verified against it: its digest, every field it names, and the file it replaces. */
  #verifiedPreparation(preparationId: string): { row: SqlRow; contents: DatabaseExportContentsProjection } {
    const row = this.#preparationRow(preparationId);
    const contents: unknown = JSON.parse(text(row.contents_json));
    requireDatabaseExport(isContents(contents), 'DATABASE_EXPORT_RECORD_INVALID', '数据库导出记录无效。');
    requireStored(row.canonical_json, row.sha256, {
      schema: PREPARATION_SCHEMA,
      preparationId,
      effectIntentId: text(row.effect_intent_id),
      targetKind: text(row.target_kind),
      packageSchema: text(row.package_schema),
      dataVersion: integer(row.data_version),
      schemaRevision: integer(row.schema_revision),
      softwareVersion: text(row.software_version),
      contents,
      fileName: text(row.file_name),
      destination: text(row.destination),
      disposition: text(row.disposition),
      payloadSha256: text(row.payload_sha256),
      payloadBytes: integer(row.payload_bytes),
      policy: 'external-export-policy/v2',
      createdAt: text(row.created_at),
    });
    this.#replacedFileOf(row);
    return { row, contents };
  }

  #preparation(preparationId: string): DatabaseExportPreparationProjection {
    const { row, contents } = this.#verifiedPreparation(preparationId);
    const disposition = text(row.disposition) as 'create' | 'replace';
    return {
      preparationId,
      fileName: text(row.file_name),
      destination: text(row.destination),
      disposition,
      dispositionLabel: EXPORT_DISPOSITION_LABELS[disposition],
      payloadBytes: integer(row.payload_bytes),
      dataVersion: integer(row.data_version),
      softwareVersion: text(row.software_version),
      contents,
      preparedAt: text(row.created_at),
      receipt: this.#receipt(preparationId),
    };
  }

  /** What an approved export came to; `null` while it is only prepared. An approval with no receipt is an interrupted write. */
  #receipt(preparationId: string): DatabaseExportReceiptProjection | null {
    const row = this.#db.prepare(
      `SELECT p.file_name, p.destination, p.effect_intent_id, p.payload_sha256,
              a.approval_id, a.effect_intent_id approval_intent, a.payload_sha256 approval_payload, a.approved_at,
              a.canonical_json approval_json, a.sha256 approval_sha256,
              r.receipt_id, r.approval_id receipt_approval_id, r.outcome, r.final_path, r.byte_length, r.file_sha256,
              r.failure_code, r.recorded_at, r.canonical_json receipt_json, r.sha256 receipt_sha256
       FROM database_export_approvals a
       JOIN database_export_preparations p ON p.preparation_id = a.preparation_id
       LEFT JOIN database_export_receipts r ON r.preparation_id = a.preparation_id
       WHERE a.preparation_id = ?`,
    ).get(preparationId) as SqlRow | undefined;
    if (row === undefined) return null;
    // What the receipt names of its preparation — the file and where — is read only from a verified preparation.
    this.#verifiedPreparation(preparationId);
    const approvalId = text(row.approval_id);
    requireStored(row.approval_json, row.approval_sha256, {
      schema: APPROVAL_SCHEMA,
      approvalId,
      preparationId,
      effectIntentId: text(row.effect_intent_id),
      payloadSha256: text(row.payload_sha256),
      actor: ACTOR,
      interaction: 'export-as-stated',
      approvedAt: text(row.approved_at),
    });
    requireDatabaseExport(text(row.approval_intent) === text(row.effect_intent_id) && text(row.approval_payload) === text(row.payload_sha256),
      'DATABASE_EXPORT_RECORD_INVALID', '数据库导出的批准与其准备不一致。');
    const base = { preparationId, fileName: text(row.file_name), destination: text(row.destination), approvedAt: text(row.approved_at) };
    if (row.receipt_id === null) {
      return {
        ...base,
        outcome: 'ambiguous',
        outcomeLabel: EXPORT_OUTCOME_LABELS.ambiguous,
        detail: EXPORT_FAILURE_DETAILS.EXPORT_INTERRUPTED!,
        byteLength: null,
        recordedAt: null,
      };
    }
    const outcome = text(row.outcome) as DatabaseExportReceiptProjection['outcome'];
    const byteLength = row.byte_length === null ? null : integer(row.byte_length);
    const failureCode = nullableText(row.failure_code);
    requireStored(row.receipt_json, row.receipt_sha256, {
      schema: RECEIPT_SCHEMA,
      receiptId: text(row.receipt_id),
      preparationId,
      approvalId,
      effectIntentId: text(row.effect_intent_id),
      outcome,
      finalPath: text(row.final_path),
      byteLength,
      fileSha256: nullableText(row.file_sha256),
      failureCode,
      recordedAt: text(row.recorded_at),
    });
    requireDatabaseExport(text(row.receipt_approval_id) === approvalId && text(row.final_path) === text(row.destination),
      'DATABASE_EXPORT_RECORD_INVALID', '数据库导出回执与其批准不一致。');
    const exported = outcome === 'created' || outcome === 'replaced';
    return {
      ...base,
      outcome,
      outcomeLabel: exported ? EXPORT_OUTCOME_LABELS.exported : outcome === 'ambiguous' ? EXPORT_OUTCOME_LABELS.ambiguous : EXPORT_OUTCOME_LABELS.failed,
      detail: exported
        ? outcome === 'created' ? `已新建「${base.fileName}」。` : `已替换所选位置的「${base.fileName}」。`
        : EXPORT_FAILURE_DETAILS[failureCode ?? ''] ?? EXPORT_FAILURE_DETAILS.EXPORT_COMMIT_UNCERTAIN!,
      byteLength,
      recordedAt: text(row.recorded_at),
    };
  }
}
