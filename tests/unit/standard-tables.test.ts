import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createBaselineSchema } from '../../src/service/baseline-schema.js';
import {
  installPreinstalledStandardTables, PREINSTALLED_TABLE_KEYS, preinstalledEntries, preinstalledKind, standardTableDigest, STANDARD_TABLE_SCHEMA_SQL,
  type PreinstalledTableKey,
} from '../../src/service/standard-tables.js';
import { cycb2SeedText } from '../../src/service/standard-tables/seed/cycb-2.js';

// R5-L1 (ADR 0106 §2, §5, §9, §10): the library's relations and its four pre-installed tables.

// The four version-1 digests, pinned. They depend only on the entries (`standardTableDigest`), never on the time or order of installing.
const DIGESTS: Readonly<Record<PreinstalledTableKey, string>> = {
  'tgh-2013': 'ae309fdc6fda9affd5965cff1276305a002662afc417b656a0918fbc4f58b241',
  'tgh-2013-annex-1': 'b67f3b918aecd7b3d6372f166e0a657ecb8b32d7ad50cbec84b078bb6ad369df',
  'gf-1001-2001': '265c376ab6b64437930b5ebbc569239d3ebc1b4ca2290d7cc7cac9464d466d33',
  'cycb-2': '95279be022dc555b207a5a4828963e930c1fdb1e448ff9cde4eef1bdd326c01f',
};

const today = JSON.parse(readFileSync('src/service/review/deterministic/standard-data.json', 'utf8')) as {
  membership: string;
  characterForms: [string, string, string][];
  variantWords: { preferred: string; variants: string[]; note: string }[];
  appendixWords: { preferred: string; variants: string[]; note: string }[];
};

function library(keys?: readonly PreinstalledTableKey[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createBaselineSchema(db);
  db.exec('BEGIN IMMEDIATE');
  installPreinstalledStandardTables(db, keys);
  db.exec('COMMIT');
  return db;
}

function entriesOf(db: DatabaseSync, key: PreinstalledTableKey): Record<string, unknown>[] {
  return db.prepare(`SELECT e.* FROM standard_table_entries e JOIN standard_tables t ON t.current_version_id = e.version_id WHERE t.preinstalled_key = ? ORDER BY e.position`)
    .all(key) as Record<string, unknown>[];
}

describe('the 字表与词表 library (R5-L1)', () => {
  it('installs four enabled pre-installed tables at version 1 with their kinds, strengths and counts', () => {
    const db = library();
    try {
      const tables = db.prepare(`SELECT t.preinstalled_key key, t.kind, t.origin, t.enabled, v.ordinal, v.previous_digest, v.digest, v.entry_count, v.conversion_report, v.source_object_digest,
          (SELECT count(*) FROM standard_table_entries e WHERE e.version_id = v.version_id) entries,
          (SELECT group_concat(DISTINCT e.strength) FROM standard_table_entries e WHERE e.version_id = v.version_id) strengths,
          (SELECT group_concat(DISTINCT e.status) FROM standard_table_entries e WHERE e.version_id = v.version_id) statuses
        FROM standard_tables t JOIN standard_table_versions v ON v.version_id = t.current_version_id ORDER BY t.preinstalled_key`).all();
      expect(tables.map((row) => ({ ...row }))).toEqual([
        { key: 'cycb-2', kind: 'common-words', origin: 'preinstalled', enabled: 1, ordinal: 1, previous_digest: null, digest: DIGESTS['cycb-2'], entry_count: 56462, conversion_report: null, source_object_digest: null, entries: 56462, strengths: 'dictionary', statuses: 'applied' },
        { key: 'gf-1001-2001', kind: 'word-forms', origin: 'preinstalled', enabled: 1, ordinal: 1, previous_digest: null, digest: DIGESTS['gf-1001-2001'], entry_count: 382, conversion_report: null, source_object_digest: null, entries: 382, strengths: 'national', statuses: 'applied' },
        { key: 'tgh-2013', kind: 'standard-characters', origin: 'preinstalled', enabled: 1, ordinal: 1, previous_digest: null, digest: DIGESTS['tgh-2013'], entry_count: 8105, conversion_report: null, source_object_digest: null, entries: 8105, strengths: 'national', statuses: 'applied' },
        { key: 'tgh-2013-annex-1', kind: 'character-forms', origin: 'preinstalled', enabled: 1, ordinal: 1, previous_digest: null, digest: DIGESTS['tgh-2013-annex-1'], entry_count: 3558, conversion_report: null, source_object_digest: null, entries: 3558, strengths: 'national', statuses: 'applied' },
      ]);
    } finally { db.close(); }
  });

  it('pins each version-1 digest to the digest the shared function computes from the seed, whatever the installation order', () => {
    for (const key of PREINSTALLED_TABLE_KEYS) expect(standardTableDigest(preinstalledKind(key), preinstalledEntries(key))).toBe(DIGESTS[key]);
    const db = library([...PREINSTALLED_TABLE_KEYS].reverse());
    try {
      const stored = Object.fromEntries((db.prepare('SELECT t.preinstalled_key key, v.digest FROM standard_tables t JOIN standard_table_versions v ON v.version_id = t.current_version_id').all() as { key: string; digest: string }[])
        .map((row) => [row.key, row.digest]));
      expect(stored).toEqual(DIGESTS);
    } finally { db.close(); }
  });

  it('holds the three national tables equal to standard-data.json entry by entry, and every non-empty note as the condition', () => {
    const db = library();
    try {
      const characters = entriesOf(db, 'tgh-2013');
      expect(characters.map((row) => row.recommended)).toEqual([...today.membership]);
      expect(characters.map((row) => row.source)).toEqual([...today.membership].map((_, index) => `第${index + 1}号`));
      expect(characters.every((row) => row.discouraged === '[]' && row.condition_note === null && row.rank === null)).toBe(true);

      const forms = entriesOf(db, 'tgh-2013-annex-1');
      expect(forms.map((row) => [JSON.parse(String(row.discouraged)) as string[], row.recommended, row.condition_note ?? ''])).toEqual(today.characterForms.map(([form, targets, note]) => [[form], targets, note]));

      const words = entriesOf(db, 'gf-1001-2001');
      const expected = [...today.variantWords.map((word) => ({ word, source: null })), ...today.appendixWords.map((word) => ({ word, source: '附录' }))];
      expect(words.map((row) => ({ recommended: row.recommended, variants: JSON.parse(String(row.discouraged)), note: row.condition_note ?? '', source: row.source })))
        .toEqual(expected.map(({ word, source }) => ({ recommended: word.preferred, variants: word.variants, note: word.note, source })));
      expect(words.filter((row) => row.source === '附录')).toHaveLength(44);
      expect(words.filter((row) => row.condition_note !== null)).toHaveLength(10 + 44);
    } finally { db.close(); }
  });

  it('holds the 常用词表 as words and first ranks only: no discouraged form, no condition, no source', () => {
    const lines = cycb2SeedText().split('\n');
    expect(lines).toHaveLength(56462);
    expect(lines.every((line) => /^[1-9]\d*\t[^\t]+$/u.test(line))).toBe(true);
    const db = library(['cycb-2']);
    try {
      const rows = entriesOf(db, 'cycb-2');
      expect(new Set(rows.map((row) => row.recommended)).size).toBe(56462);
      expect(rows.every((row) => row.discouraged === '[]' && row.condition_note === null && row.source === null && row.review_note === null && row.source_text === null && row.strength === 'dictionary')).toBe(true);
      const ranks = rows.map((row) => Number(row.rank));
      expect(ranks.every((rank, index) => index === 0 || rank > ranks[index - 1]!)).toBe(true);
      expect(rows.find((row) => row.recommended === '为')?.rank).toBe(1197); // listed again at 1279; the first rank stays
      expect(rows[0]).toMatchObject({ recommended: '的', rank: 1 });
    } finally { db.close(); }
  });

  it('never changes a stored table, version or entry when an install runs again, for all keys or for one', () => {
    const db = library();
    try {
      const snapshot = (): unknown => ['standard_tables', 'standard_table_versions', 'standard_table_entries']
        .map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map((row) => ({ ...row })));
      const before = JSON.stringify(snapshot());
      db.exec('BEGIN IMMEDIATE');
      expect(installPreinstalledStandardTables(db)).toEqual([]);
      for (const key of PREINSTALLED_TABLE_KEYS) expect(installPreinstalledStandardTables(db, [key])).toEqual([]);
      db.exec('COMMIT');
      expect(JSON.stringify(snapshot())).toBe(before);
    } finally { db.close(); }
  });

  it('installs one table by key, installs nothing twice, and refuses to run outside a transaction', () => {
    const db = library(['gf-1001-2001']);
    try {
      expect(db.prepare('SELECT preinstalled_key key FROM standard_tables').all().map((row) => row.key)).toEqual(['gf-1001-2001']);
      db.exec('BEGIN IMMEDIATE');
      expect(installPreinstalledStandardTables(db)).toEqual(['tgh-2013', 'tgh-2013-annex-1', 'cycb-2']);
      expect(installPreinstalledStandardTables(db)).toEqual([]);
      db.exec('COMMIT');
      expect(Number(db.prepare('SELECT count(*) n FROM standard_tables').get()!.n)).toBe(4);
      expect(() => installPreinstalledStandardTables(db)).toThrow(/事务/u);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('removes one table with its versions and entries in one transaction and leaves the others whole', () => {
    const db = library();
    try {
      const before = Number(db.prepare('SELECT count(*) n FROM standard_table_entries').get()!.n);
      db.exec('BEGIN IMMEDIATE');
      const id = String(db.prepare("SELECT table_id FROM standard_tables WHERE preinstalled_key = 'cycb-2'").get()!.table_id);
      db.prepare('DELETE FROM standard_table_entries WHERE version_id IN (SELECT version_id FROM standard_table_versions WHERE table_id = ?)').run(id);
      db.prepare('DELETE FROM standard_table_versions WHERE table_id = ?').run(id);
      db.prepare('DELETE FROM standard_tables WHERE table_id = ?').run(id);
      db.exec('COMMIT');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(Number(db.prepare('SELECT count(*) n FROM standard_table_entries').get()!.n)).toBe(before - 56462);
      expect(db.prepare('SELECT preinstalled_key key FROM standard_tables ORDER BY 1').all().map((row) => row.key)).toEqual(['gf-1001-2001', 'tgh-2013', 'tgh-2013-annex-1']);
      db.exec('BEGIN IMMEDIATE');
      expect(installPreinstalledStandardTables(db, ['cycb-2'])).toEqual(['cycb-2']); // 恢复预装字表 puts it back
      db.exec('COMMIT');
      expect(Number(db.prepare('SELECT count(*) n FROM standard_table_entries').get()!.n)).toBe(before);
    } finally { db.close(); }
  });

  it('keeps the library closed: no relation outside it references it, and it reaches outside only for an imported source object', () => {
    const db = library();
    try {
      const own = new Set(Object.keys(STANDARD_TABLE_SCHEMA_SQL));
      const tables = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((row) => row.name);
      const references = tables.flatMap((name) => (db.prepare(`SELECT "table" target FROM pragma_foreign_key_list('${name}')`).all() as { target: string }[]).map((row) => [name, row.target] as const));
      expect(references.filter(([from, target]) => !own.has(from) && own.has(target))).toEqual([]);
      expect(references.filter(([from, target]) => own.has(from) && !own.has(target))).toEqual([['standard_table_versions', 'content_objects']]);
      expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND tbl_name LIKE 'standard_table%'").all()).toEqual([]);
    } finally { db.close(); }
  });

  it('records the 常用词表 provenance: the book, the repository, the commit, the file, its digest, the columns kept and the absent license', () => {
    const provenance = readFileSync('docs/development/dependency-provenance.md', 'utf8');
    const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
    for (const text of [provenance, notices]) {
      for (const needle of ['现代汉语常用词表（第2版）', '李行健', '苏新春', '商务印书馆', 'zispace/hanzi-words-cycb', '712fb0f0c420f6ceca0778ca46eb3cc3cbc5a9d8']) expect(text).toContain(needle);
    }
    expect(provenance).toContain('53e3a67f90fcb29c0f5fa4a25f747aaadf84ca4cbe52d123b1a77dba22814d71');
    expect(provenance).toContain('频序号');
    expect(provenance).toMatch(/没有许可|未声明许可|不含许可/u);
  });
});
