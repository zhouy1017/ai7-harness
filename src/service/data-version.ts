import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 数据版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1). The Data Version is a compatibility contract, an
 * editor-visible integer apart from the software version: it changes only when older software could no longer read the
 * store, so an additive schema revision stays inside it. Nothing is frozen before the first packaged release (§1.2) —
 * until then development stores are disposable — and Data Version 1 is the one that release will freeze.
 *
 * Every store records it: schema revision 54 owns one ledger of the versions that opened the store — the software, the
 * Data Version and the schema revision — appended whenever one of them differs from the last, so a software update that
 * keeps the Data Version can say so. Each record is canonical and digested, appended once and never rewritten.
 *
 * S85b (ADR 0079 §1.1, §1.3, §1.4): every schema revision after the first release is classified additive or breaking, and a
 * breaking one raises the Data Version. An open that must raise it backs the data up first (`upgrade-backup.ts`), and the
 * record of that open carries the upgrade — from which Data Version, what changed, and the backup made — for the 版本 row.
 */

/** The Data Version this software reads and writes. A breaking migration — one older software could not read — raises it. */
export const DATA_VERSION = 1 as const;
/** Whether the Data Version is frozen: only at the first packaged release (ADR 0079 §1.2). */
export const DATA_VERSION_FROZEN = false as const;

/** How a schema revision stands against the Data Version (ADR 0079 §1.1): additive stays inside it; breaking raises it by one. */
export type SchemaRevisionClass = 'additive' | 'breaking';

export interface ClassifiedSchemaRevision {
  readonly revision: number;
  readonly class: SchemaRevisionClass;
  /** What a breaking revision changes, in the editor's words: the 版本 row states it after the upgrade. */
  readonly change?: string;
}

/**
 * The last schema revision of Data Version 1 as the first packaged release freezes it (ADR 0079 §1.2): `null` until then.
 * Development stores are disposable before that release, so the revisions up to it are never classified.
 */
export const DATA_VERSION_BASELINE_REVISION: number | null = null;

/**
 * Every schema revision after the baseline, classified (ADR 0079 §1.1): this list is what 「非必要不改」 means in code. Each new
 * revision from the first release on is added here as additive or breaking, and a breaking one raises `DATA_VERSION` by one,
 * which the unit suite holds. Before that release the list is empty, and every revision reads as Data Version 1.
 */
export const SCHEMA_REVISION_CLASSES: ReadonlyArray<ClassifiedSchemaRevision> = [];

/** The Data Version a store at `revision` holds: one more than 1 for every breaking revision it has passed. */
export function dataVersionAt(revision: number, classes: ReadonlyArray<ClassifiedSchemaRevision> = SCHEMA_REVISION_CLASSES): number {
  return 1 + classes.filter((entry) => entry.class === 'breaking' && entry.revision <= revision).length;
}

/** What each breaking revision after `fromRevision`, up to `toRevision`, changes: the upgrade the 版本 row states. */
export function breakingChanges(fromRevision: number, toRevision: number, classes: ReadonlyArray<ClassifiedSchemaRevision> = SCHEMA_REVISION_CLASSES): string[] {
  return classes.filter((entry) => entry.class === 'breaking' && entry.revision > fromRevision && entry.revision <= toRevision)
    .map((entry) => entry.change ?? '');
}

/** The one name form of a pre-upgrade backup (S85b), which a version record may name. */
export const PRE_UPGRADE_BACKUP_NAME = /^AI7 升级前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db$/u;

/** An upgrade of the data to a later Data Version (S85b): from where, what changed, and the backup made before it. */
export interface DataVersionUpgrade {
  readonly fromDataVersion: number;
  readonly fromSchemaRevision: number;
  /** The software that last opened the data before the upgrade; `null` for data from before its versions were recorded. */
  readonly fromSoftwareVersion: string | null;
  readonly changes: ReadonlyArray<string>;
  readonly backup: { readonly fileName: string; readonly byteLength: number; readonly sha256: string };
}
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
      const difference = BigInt(x) - BigInt(y);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
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
  /** The upgrade this open made, when it raised the Data Version (S85b); `null` for every other record. */
  readonly upgrade: DataVersionUpgrade | null;
}

const DIGEST = /^[0-9a-f]{64}$/u;
const MAX_UPGRADE_CHANGES = 20;
const MAX_UPGRADE_CHANGE_CHARACTERS = 200;

/**
 * An upgrade as a record carries it, whole: its fields and no others, each of its kind, and below the record's Data Version. The
 * note an open leaves beside the store is read the same way (`upgrade-backup.ts`).
 */
export function readUpgrade(value: unknown, dataVersion: number): DataVersionUpgrade {
  const keys = ['backup', 'changes', 'fromDataVersion', 'fromSchemaRevision', 'fromSoftwareVersion'];
  requireDataVersion(isRecord(value) && Object.keys(value).sort().join(',') === keys.join(','), 'STORE_VERSION_RECORD_INVALID', INVALID);
  const { fromDataVersion, fromSchemaRevision, fromSoftwareVersion, changes, backup } = value;
  requireDataVersion(typeof fromDataVersion === 'number' && Number.isSafeInteger(fromDataVersion) && fromDataVersion >= 1 && fromDataVersion < dataVersion &&
    typeof fromSchemaRevision === 'number' && Number.isSafeInteger(fromSchemaRevision) && fromSchemaRevision >= 1 &&
    (fromSoftwareVersion === null || (typeof fromSoftwareVersion === 'string' && SOFTWARE_VERSION.test(fromSoftwareVersion))) &&
    Array.isArray(changes) && changes.length >= 1 && changes.length <= MAX_UPGRADE_CHANGES &&
    changes.every((change) => typeof change === 'string' && change.length >= 1 && change.length <= MAX_UPGRADE_CHANGE_CHARACTERS) &&
    isRecord(backup) && Object.keys(backup).sort().join(',') === 'byteLength,fileName,sha256' &&
    typeof backup.fileName === 'string' && PRE_UPGRADE_BACKUP_NAME.test(backup.fileName) &&
    typeof backup.byteLength === 'number' && Number.isSafeInteger(backup.byteLength) && backup.byteLength > 0 &&
    typeof backup.sha256 === 'string' && DIGEST.test(backup.sha256),
  'STORE_VERSION_RECORD_INVALID', INVALID);
  return {
    fromDataVersion,
    fromSchemaRevision,
    fromSoftwareVersion,
    changes: [...(changes as string[])],
    backup: { fileName: backup.fileName, byteLength: backup.byteLength, sha256: backup.sha256 },
  };
}

export class DataVersionLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every record in order, each verified: its digest, its record against its row, and its place in the chain. */
  *history(): IterableIterator<StoredVersion> {
    const rows = this.#db.prepare('SELECT * FROM store_versions ORDER BY ordinal').iterate() as IterableIterator<SqlRow>;
    let before: StoredVersion | null = null;
    for (const row of rows) {
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
      const dataVersion = Number(row.data_version);
      const upgrade = 'upgrade' in record ? readUpgrade(record.upgrade, dataVersion) : null;
      // An upgrade is made by the open that raised the Data Version, from the Data Version the record before it holds — or, for
      // data whose earlier versions were never recorded, from what its schema revision held.
      requireDataVersion(upgrade === null || before === null || before.dataVersion === upgrade.fromDataVersion,
        'STORE_VERSION_RECORD_INVALID', INVALID);
      const entry: StoredVersion = {
        recordId: String(row.record_id),
        ordinal,
        softwareVersion: String(row.software_version),
        dataVersion,
        schemaRevision: Number(row.schema_revision),
        recordedAt: String(row.recorded_at),
        upgrade,
      };
      before = entry;
      yield entry;
    }
  }

  /**
   * Validate the whole ledger, retaining only the current record, latest software transition, newest twenty records and newest
   * twenty upgrades (S85b).
   */
  standing(): {
    latest: StoredVersion | null;
    recent: StoredVersion[];
    upgrades: StoredVersion[];
    update: ReturnType<typeof latestSoftwareUpdate>;
    count: number;
  } {
    let latest: StoredVersion | null = null;
    let update: ReturnType<typeof latestSoftwareUpdate> = null;
    const recent: StoredVersion[] = [];
    const upgrades: StoredVersion[] = [];
    for (const entry of this.history()) {
      if (latest !== null && latest.softwareVersion !== entry.softwareVersion) update = latestSoftwareUpdate([latest, entry]);
      latest = entry;
      recent.push(entry);
      if (recent.length > MAX_STORE_VERSIONS_LISTED) recent.shift();
      if (entry.upgrade !== null) {
        upgrades.push(entry);
        if (upgrades.length > MAX_STORE_VERSIONS_LISTED) upgrades.shift();
      }
    }
    return { latest, recent: recent.reverse(), upgrades: upgrades.reverse(), update, count: latest?.ordinal ?? 0 };
  }

  /**
   * The versions that opened the store now, inside the caller's transaction: appended when the software, the Data Version or
   * the schema revision differs from the last record, and nothing otherwise. An open that raised the Data Version names the
   * upgrade it made (S85b). Answers whether it appended.
   */
  recordOpen(input: {
    readonly softwareVersion: string;
    readonly dataVersion: number;
    readonly schemaRevision: number;
    readonly upgrade?: DataVersionUpgrade | null;
  }): boolean {
    requireDataVersion(SOFTWARE_VERSION.test(input.softwareVersion) && Number.isSafeInteger(input.dataVersion) && input.dataVersion >= 1 &&
      Number.isSafeInteger(input.schemaRevision) && input.schemaRevision >= 1, 'STORE_VERSION_INVALID', '数据版本记录无效。');
    const { latest, count } = this.standing();
    // An upgrade already recorded is not recorded twice: an open stopped after recording it and before clearing its note brings
    // the same upgrade again, and the record that holds it is the latest (Issue #433 review). The whole upgrade is compared,
    // never its backup's digest alone, so no other upgrade is ever taken for it.
    const given = input.upgrade ?? null;
    const upgrade = given !== null && latest?.upgrade != null && canonicalJson(latest.upgrade) === canonicalJson(given) ? null : given;
    if (upgrade !== null) readUpgrade(upgrade, input.dataVersion);
    if (upgrade === null && latest !== null && latest.softwareVersion === input.softwareVersion && latest.dataVersion === input.dataVersion &&
      latest.schemaRevision === input.schemaRevision) return false;
    const recordId = randomUUID();
    const ordinal = count + 1;
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
      ...(upgrade === null ? {} : { upgrade }),
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
