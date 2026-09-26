import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 数据版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1). The Data Version is a compatibility contract, an
 * editor-visible integer apart from the software version: it changes only when older software could no longer read the
 * store, so an additive schema revision stays inside it. Nothing is frozen before the first packaged release (§1.2) —
 * until then development stores are disposable — and Data Version 1 is the one that release will freeze.
 *
 * Every store records it: schema revision 54 owns one ledger of the versions that opened the store — the software, the
 * Data Version and the schema revision — appended whenever one of them differs from the last, so a software update that
 * keeps the Data Version can say so. Each record is canonical and digested, appended once and never rewritten.
 */

/** The Data Version this software reads and writes. A breaking migration — one older software could not read — raises it. */
export const DATA_VERSION = 1 as const;
/** Whether the Data Version is frozen: only at the first packaged release (ADR 0079 §1.2). */
export const DATA_VERSION_FROZEN = false as const;
/** How many version records the answer lists, newest first. */
export const MAX_STORE_VERSIONS_LISTED = 20;

export const DATA_VERSION_SCHEMA_SQL = {
  store_versions: `CREATE TABLE store_versions (
  record_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  software_version TEXT NOT NULL CHECK(length(software_version) BETWEEN 1 AND 64),
  data_version INTEGER NOT NULL CHECK(data_version >= 1),
  schema_revision INTEGER NOT NULL CHECK(schema_revision >= 1),
  supersedes_record_id TEXT REFERENCES store_versions(record_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_record_id IS NULL))
) STRICT`,
} as const;

export const DATA_VERSION_TRIGGER_SQL: Readonly<Record<string, string>> = {
  store_versions_no_update: `CREATE TRIGGER store_versions_no_update
    BEFORE UPDATE ON store_versions
    BEGIN
      SELECT RAISE(ABORT, 'STORE_VERSIONS_IMMUTABLE');
    END`,
  store_versions_no_delete: `CREATE TRIGGER store_versions_no_delete
    BEFORE DELETE ON store_versions
    BEGIN
      SELECT RAISE(ABORT, 'STORE_VERSIONS_IMMUTABLE');
    END`,
};

export const DATA_VERSION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  store_versions: ['supersedes_record_id>store_versions.record_id:NO ACTION/NO ACTION/NONE'],
};

export class DataVersionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DataVersionError';
  }
}

function requireDataVersion(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DataVersionError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.store-version/1';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'store_versions'";
const INVALID = '数据版本记录已损坏。';
/**
 * A released or development software version: `0.1.0`, `0.1.0-beta.2`, or either with build metadata, `0.1.0+build.7` —
 * which SemVer allows and a release may carry (Issue #433 review).
 */
const SOFTWARE_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/u;

/**
 * How two software versions order by SemVer precedence (Issue #433 review): by major, minor and patch, a pre-release below
 * its release, pre-release identifiers numerically where both are numbers, and build metadata never counted.
 */
export function compareSoftwareVersions(left: string, right: string): number {
  const parse = (version: string): { core: number[]; pre: string[] } => {
    const [withoutBuild] = version.split('+');
    const dash = withoutBuild!.indexOf('-');
    const core = (dash < 0 ? withoutBuild! : withoutBuild!.slice(0, dash)).split('.').map(Number);
    return { core, pre: dash < 0 ? [] : withoutBuild!.slice(dash + 1).split('.') };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const x = a.pre[index];
    const y = b.pre[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numeric = /^\d+$/u;
    if (numeric.test(x) && numeric.test(y)) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return Math.sign(difference);
    } else if (numeric.test(x) !== numeric.test(y)) {
      return numeric.test(x) ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Revision 54's relation, created once: a store that predates it gains an empty ledger and nothing existing moves. */
export function initializeDataVersionSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DATA_VERSION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DATA_VERSION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Data version schema rollback failed.');
    }
    throw error;
  }
}

/** The software version this build is, from the package it ships in; refused when the package does not name one. */
export async function readSoftwareVersion(codeRoot: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(codeRoot, 'package.json'), 'utf8')) as unknown;
  } catch {
    throw new DataVersionError('SOFTWARE_VERSION_UNAVAILABLE', '无法读取软件版本。');
  }
  const version = isRecord(parsed) ? parsed.version : undefined;
  requireDataVersion(typeof version === 'string' && SOFTWARE_VERSION.test(version), 'SOFTWARE_VERSION_UNAVAILABLE', '无法读取软件版本。');
  return version;
}

/** One version record: the software, the Data Version and the schema revision that opened the store, and when. */
export interface StoredVersion {
  readonly recordId: string;
  readonly ordinal: number;
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly schemaRevision: number;
  readonly recordedAt: string;
}

export class DataVersionLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every record in order, each verified: its digest, its record against its row, and its place in the chain. */
  history(): StoredVersion[] {
    const rows = this.#db.prepare('SELECT * FROM store_versions ORDER BY ordinal').all() as SqlRow[];
    let before: StoredVersion | null = null;
    return rows.map((row) => {
      const json = String(row.canonical_json);
      requireDataVersion(sha256Hex(json) === String(row.sha256), 'STORE_VERSION_RECORD_INVALID', INVALID);
      const record = JSON.parse(json) as unknown;
      const ordinal = Number(row.ordinal);
      requireDataVersion(isRecord(record) && record.schema === RECORD_SCHEMA && record.recordId === row.record_id && record.ordinal === ordinal &&
        record.softwareVersion === row.software_version && record.dataVersion === Number(row.data_version) &&
        record.schemaRevision === Number(row.schema_revision) && record.recordedAt === row.recorded_at &&
        (record.supersedes ?? null) === (row.supersedes_record_id ?? null) && (record.supersedes ?? null) === (before?.recordId ?? null) &&
        ordinal === (before?.ordinal ?? 0) + 1,
      'STORE_VERSION_RECORD_INVALID', INVALID);
      const entry: StoredVersion = {
        recordId: String(row.record_id),
        ordinal,
        softwareVersion: String(row.software_version),
        dataVersion: Number(row.data_version),
        schemaRevision: Number(row.schema_revision),
        recordedAt: String(row.recorded_at),
      };
      before = entry;
      return entry;
    });
  }

  /**
   * The versions that opened the store now, inside the caller's transaction: appended when the software, the Data Version or
   * the schema revision differs from the last record, and nothing otherwise. Answers whether it appended.
   */
  recordOpen(input: { readonly softwareVersion: string; readonly dataVersion: number; readonly schemaRevision: number }): boolean {
    requireDataVersion(SOFTWARE_VERSION.test(input.softwareVersion) && Number.isSafeInteger(input.dataVersion) && input.dataVersion >= 1 &&
      Number.isSafeInteger(input.schemaRevision) && input.schemaRevision >= 1, 'STORE_VERSION_INVALID', '数据版本记录无效。');
    const history = this.history();
    const latest = history.at(-1) ?? null;
    if (latest !== null && latest.softwareVersion === input.softwareVersion && latest.dataVersion === input.dataVersion &&
      latest.schemaRevision === input.schemaRevision) return false;
    const recordId = randomUUID();
    const ordinal = history.length + 1;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      recordId,
      ordinal,
      softwareVersion: input.softwareVersion,
      dataVersion: input.dataVersion,
      schemaRevision: input.schemaRevision,
      supersedes: latest?.recordId ?? null,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO store_versions(record_id, ordinal, software_version, data_version, schema_revision, supersedes_record_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(recordId, ordinal, input.softwareVersion, input.dataVersion, input.schemaRevision, latest?.recordId ?? null, recordedAt, record.json, record.digest);
    return true;
  }
}

/**
 * The latest software change the store has seen, if any (DSTO-016): from which version to which, and whether the Data
 * Version stayed — as it does for every update of this software, which has only one.
 */
export function latestSoftwareUpdate(history: ReadonlyArray<StoredVersion>): {
  readonly from: string;
  readonly to: string;
  /** Whether the later software is newer, earlier — an older build opened the store again — or of the same precedence. */
  readonly direction: 'newer' | 'earlier' | 'same';
  readonly fromDataVersion: number;
  readonly toDataVersion: number;
  readonly recordedAt: string;
} | null {
  for (let index = history.length - 1; index > 0; index -= 1) {
    const now = history[index]!;
    const before = history[index - 1]!;
    if (now.softwareVersion !== before.softwareVersion) {
      const order = compareSoftwareVersions(now.softwareVersion, before.softwareVersion);
      return {
        from: before.softwareVersion,
        to: now.softwareVersion,
        direction: order > 0 ? 'newer' : order < 0 ? 'earlier' : 'same',
        fromDataVersion: before.dataVersion,
        toDataVersion: now.dataVersion,
        recordedAt: now.recordedAt,
      };
    }
  }
  return null;
}
