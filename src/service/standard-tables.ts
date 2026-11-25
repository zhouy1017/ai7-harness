import type { StandardTableKind, StandardStrength, StandardEntryStatus, PreinstalledTableKey } from '../shared/protocol/standard-tables.js';
export type { StandardTableKind, StandardStrength, StandardEntryStatus, PreinstalledTableKey } from '../shared/protocol/standard-tables.js';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { readSeedRows } from './standard-table-seed.cjs';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';
import { requireStore } from './store-records.js';

/**
 * The 字表与词表 library's relations (R5-L1; ADR 0106 §2, §9), final shape in the revision-117 baseline.
 *
 * A table belongs to the house, has one kind and any number of versions; the current version is the one a check reads. A version
 * is never updated while its table exists (R5-L2's write path is the only place an update could appear). Deleting a table removes
 * its entries, versions and row in one transaction, so there is no append-only trigger. `current_version_id` is the one circle
 * (a table needs its current version, a version its table) and is therefore a deferred reference. Entries are clustered by
 * `(version_id, position)`; `position` is the order of the table. Only `source_object_digest` leaves the library: the imported
 * file is an object in the data root, and R5-L2 owns writing it, retaining it and deleting it with its table.
 *
 * The entries' `version_id` is deliberately NOT a declared reference. The entries are the one relation an editor can grow
 * without limit, and a whole-database `PRAGMA foreign_key_check` walks every row that declares a reference, so a declared one
 * would make every open, every creation and every post-write check cost more with each table imported. The owner guards it
 * instead (`standardTableEntryOrphans`): the entries are clustered by `(version_id, position)`, so one seek per version finds
 * an entry whose version is gone, at a cost that does not depend on how many entries there are. It runs after every library
 * write and at every open (`requireBaselineSchema`). A writer — R5-L2's import, update and delete — must call it, or write a
 * version and its entries, or delete them, in one transaction.
 *
 * `name` is not unique (two imports may share a name; the editor tells them apart by file and date). `preinstalled_key` is: a
 * deleted pre-installed table leaves no row, so 恢复预装字表 can install it again, and an installed key is never installed twice.
 */
export const STANDARD_TABLE_SCHEMA_SQL = {
  standard_tables: `CREATE TABLE standard_tables (
  table_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('standard-characters', 'character-forms', 'word-forms', 'common-words')),
  name TEXT NOT NULL CHECK(length(name) > 0),
  origin TEXT NOT NULL CHECK(origin IN ('preinstalled', 'imported')),
  preinstalled_key TEXT UNIQUE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  current_version_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((origin = 'preinstalled') = (preinstalled_key IS NOT NULL)),
  FOREIGN KEY(table_id, current_version_id) REFERENCES standard_table_versions(table_id, version_id) DEFERRABLE INITIALLY DEFERRED
) STRICT`,
  standard_table_versions: `CREATE TABLE standard_table_versions (
  version_id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES standard_tables(table_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  version_label TEXT NOT NULL,
  source_description TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest) = 64),
  previous_digest TEXT CHECK(previous_digest IS NULL OR length(previous_digest) = 64),
  entry_count INTEGER NOT NULL CHECK(entry_count >= 0),
  conversion_report TEXT CHECK(conversion_report IS NULL OR json_valid(conversion_report)),
  source_file_name TEXT,
  source_object_digest TEXT REFERENCES content_objects(object_digest),
  recorded_at TEXT NOT NULL,
  UNIQUE(table_id, ordinal),
  UNIQUE(table_id, version_id),
  CHECK((ordinal = 1) = (previous_digest IS NULL)),
  CHECK((source_file_name IS NULL) = (source_object_digest IS NULL))
) STRICT`,
  standard_table_entries: `CREATE TABLE standard_table_entries (
  version_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 1),
  recommended TEXT NOT NULL,
  discouraged TEXT NOT NULL CHECK(json_type(discouraged) = 'array'),
  rank INTEGER CHECK(rank IS NULL OR rank >= 1),
  condition_note TEXT CHECK(condition_note IS NULL OR length(condition_note) > 0),
  source TEXT,
  strength TEXT NOT NULL CHECK(strength IN ('national', 'dictionary', 'house')),
  status TEXT NOT NULL CHECK(status IN ('applied', 'to-confirm', 'unrecognized')),
  review_note TEXT,
  source_text TEXT,
  PRIMARY KEY(version_id, position)
) STRICT, WITHOUT ROWID`,
} as const;


/**
 * One entry in the form its digest is taken over, in this order: recommended form, discouraged forms, rank, condition / note,
 * source, strength, status, review note, source text (ADR 0106 §2 plus the reason a row is held or not recognised).
 */
export type StandardEntry = readonly [
  recommended: string, discouraged: readonly string[], rank: number | null, condition: string | null, source: string | null,
  strength: StandardStrength, status: StandardEntryStatus, reviewNote: string | null, sourceText: string | null,
];

export const STANDARD_TABLE_FORMAT = 'ai7.standard-table/1';

/**
 * The digest of a version's content: the entries, in the order of the table, with the table's kind. It depends on nothing else —
 * not the name, the labels, the ids, the time, nor the order tables were installed in. R5-L2 takes the digest of an import with
 * this function.
 */
export function standardTableDigest(kind: StandardTableKind, entries: readonly StandardEntry[]): string {
  return sha256Hex(canonicalJson({ schema: STANDARD_TABLE_FORMAT, kind, entries }));
}

/**
 * How many distinct `version_id` values of the entries have no version: one seek on the entries' key per version (the next
 * greater `version_id` each time), never a walk of the entries. A store with such an entry is damaged.
 */
export function standardTableEntryOrphans(db: DatabaseSync): number {
  return Number(db.prepare(`WITH RECURSIVE v(version_id) AS (
      SELECT min(version_id) FROM standard_table_entries
      UNION ALL
      SELECT (SELECT min(e.version_id) FROM standard_table_entries e WHERE e.version_id > v.version_id) FROM v WHERE v.version_id IS NOT NULL
    )
    SELECT count(*) AS orphans FROM v
    WHERE v.version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM standard_table_versions s WHERE s.version_id = v.version_id)`).get()!.orphans);
}

/** Refuse a store whose entries name a version that is not there. */
export function requireStandardTableEntries(db: DatabaseSync): void {
  requireStore(standardTableEntryOrphans(db) === 0, 'STANDARD_TABLE_INVALID', '字表与词表里有条目找不到所属的版本，数据已损坏。');
}


interface Preinstalled {
  readonly name: string;
  readonly kind: StandardTableKind;
  readonly versionLabel: string;
  readonly sourceDescription: string;
  /** Version 1's digest, pinned: installing never computes it, and a test proves it equals `standardTableDigest` of the seed. */
  readonly digest: string;
  readonly entryCount: number;
  /** Projects the shipped edition's rows into canonical library entries. */
  readonly entries: () => StandardEntry[];
}

const NATIONAL = 'national';

const PREINSTALLED: Readonly<Record<PreinstalledTableKey, Preinstalled>> = {
  'tgh-2013': {
    name: '《通用规范汉字表》', kind: 'standard-characters', versionLabel: '2013', entryCount: 8105,
    sourceDescription: '教育部、国家语委《通用规范汉字表》（2013年）：8,105个规范字，字集与序号取自 Unicode 17.0.0 Unihan 的 kTGH 属性。',
    digest: 'ae309fdc6fda9affd5965cff1276305a002662afc417b656a0918fbc4f58b241',
    entries: () => readSeedRows('tgh-2013').map(([character], index) => [character!, [], null, null, `第${index + 1}号`, NATIONAL, 'applied', null, null]),
  },
  'tgh-2013-annex-1': {
    name: '《通用规范汉字表》 附表1', kind: 'character-forms', versionLabel: '2013', entryCount: 3558,
    sourceDescription: '《通用规范汉字表》附表1（规范字与繁体字、异体字对照）：对照形取自公开表的编码字形，并以 Unihan kSimplifiedVariant 补充；仅供参考，不是无条件转换。',
    digest: 'b67f3b918aecd7b3d6372f166e0a657ecb8b32d7ad50cbec84b078bb6ad369df',
    entries: () => readSeedRows('tgh-2013-annex-1').map(([form, targets, note]) => [targets!, [form!], null, note || null, null, NATIONAL, 'applied', null, null]),
  },
  'gf-1001-2001': {
    name: 'GF 1001-2001《第一批异形词整理表》', kind: 'word-forms', versionLabel: '2001', entryCount: 382,
    sourceDescription: '教育部、国家语委 GF 1001-2001《第一批异形词整理表》（2001年）：正表338组异形词，另有附录44组。',
    digest: '265c376ab6b64437930b5ebbc569239d3ebc1b4ca2290d7cc7cac9464d466d33',
    entries: () => readSeedRows('gf-1001-2001').map(([preferred, variants, note, appendix]) =>
      [preferred!, variants!.split('/'), null, note || null, appendix || null, NATIONAL, 'applied', null, null]),
  },
  'cycb-2': {
    name: '《现代汉语常用词表（第2版）》', kind: 'common-words', versionLabel: '2021 第2版', entryCount: 56462,
    sourceDescription: '《现代汉语常用词表（第2版）》，李行健、苏新春主编，教育部语言文字信息管理司组编，商务印书馆2021年出版；文字版取自 zispace/hanzi-words-cycb 仓库的提交 712fb0f0c420f6ceca0778ca46eb3cc3cbc5a9d8（文件「现代汉语常用词表（第2版）.tsv」），仅取词语与频序号。',
    digest: '95279be022dc555b207a5a4828963e930c1fdb1e448ff9cde4eef1bdd326c01f',
    entries: () => readSeedRows('cycb-2').map(([rank, word]) => [word!, [], Number(rank), null, null, 'dictionary', 'applied', null, null]),
  },
};

export const PREINSTALLED_TABLE_KEYS: readonly PreinstalledTableKey[] = ['tgh-2013', 'tgh-2013-annex-1', 'gf-1001-2001', 'cycb-2'];

/** A pre-installed table's version-1 entries, as its seed gives them. */
export function preinstalledEntries(key: PreinstalledTableKey): StandardEntry[] { return PREINSTALLED[key].entries(); }
/** A pre-installed table's pinned version-1 digest. */
export function preinstalledDigest(key: PreinstalledTableKey): string { return PREINSTALLED[key].digest; }
export function preinstalledKind(key: PreinstalledTableKey): StandardTableKind { return PREINSTALLED[key].kind; }

/** The fixed namespace of the pre-installed tables' ids (a name-based, version-5 UUID is made under it). Never change it. */
const PREINSTALLED_NAMESPACE = '6f1c3a52-8d47-4b9e-9a21-5c7e0d4b8f13';

/**
 * A pre-installed table's ids come from its key, not from the store's id source: the same in every store, unique within one, and
 * given back when a deleted table is installed again (its old rows are gone). A seed that drew random ids would shift every
 * later id of a store by eight, and the memory compatibility packets (#1498) pin those. An imported table (R5-L2) draws ordinary
 * ids. The table's id is `standard-table:<key>`, its version 1's `standard-table-version:<key>:1`.
 */
export function preinstalledTableId(key: PreinstalledTableKey): string { return nameBasedId(`standard-table:${key}`); }
export function preinstalledVersionId(key: PreinstalledTableKey): string { return nameBasedId(`standard-table-version:${key}:1`); }

function nameBasedId(name: string): string {
  const hash = createHash('sha1').update(Buffer.from(PREINSTALLED_NAMESPACE.replaceAll('-', ''), 'hex')).update(name, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const INSERT_ENTRIES = `INSERT INTO standard_table_entries
  SELECT ?, e.key + 1, json_extract(e.value, '$[0]'), json_extract(e.value, '$[1]'), json_extract(e.value, '$[2]'),
    json_extract(e.value, '$[3]'), json_extract(e.value, '$[4]'), json_extract(e.value, '$[5]'), json_extract(e.value, '$[6]'),
    json_extract(e.value, '$[7]'), json_extract(e.value, '$[8]')
  FROM json_each(?) e`;

/**
 * Install pre-installed tables, each at version 1, enabled, in the caller's open transaction: store creation calls it for all
 * four (ADR 0106 §10), R5-6's converter for a converted store, and 恢复预装字表 for one key. It writes only the library's
 * relations and depends on no other seed, so it runs in a store that already has them. A key whose table is already there is
 * skipped; the keys installed now are returned. Opening an existing store never calls it, so a table the editor deleted stays
 * deleted and an ordinary launch reads no seed.
 */
export function installPreinstalledStandardTables(db: DatabaseSync, keys: readonly PreinstalledTableKey[] = PREINSTALLED_TABLE_KEYS): PreinstalledTableKey[] {
  requireStore(db.isTransaction, 'STANDARD_TABLE_INVALID', '安装预装字表须在事务内进行。');
  const installed: PreinstalledTableKey[] = [];
  const now = new Date().toISOString();
  for (const key of keys) {
    const table = PREINSTALLED[key];
    requireStore(table !== undefined, 'STANDARD_TABLE_INVALID', '未知的预装字表。');
    if (db.prepare('SELECT 1 FROM standard_tables WHERE preinstalled_key = ?').get(key) !== undefined) continue;
    const entries = table.entries();
    requireStore(entries.length === table.entryCount, 'STANDARD_TABLE_INVALID', '预装字表的内容与记录不符。');
    const tableId = preinstalledTableId(key);
    const versionId = preinstalledVersionId(key);
    db.prepare('INSERT INTO standard_tables VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(tableId, table.kind, table.name, 'preinstalled', key, versionId, now);
    db.prepare('INSERT INTO standard_table_versions VALUES (?, ?, 1, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?)')
      .run(versionId, tableId, table.versionLabel, table.sourceDescription, table.digest, entries.length, now);
    db.prepare(INSERT_ENTRIES).run(versionId, JSON.stringify(entries));
    installed.push(key);
  }
  requireStandardTableEntries(db);
  return installed;
}
