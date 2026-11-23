import { loadLibraryCheck, libraryDetail, selectedStandardTables } from '../../src/service/review/deterministic/library-check.js';
import { readSeedRows } from '../../src/service/standard-table-seed.cjs';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createBaselineSchema } from '../../src/service/baseline-schema.js';
import { strToU8, zipSync } from 'fflate';
import { convertTable } from '../../src/service/standard-tables/conversion.js';
import { formattingParts } from '../../src/service/standard-tables/library.js';
import { standardsTable } from '../../src/service/fast-role/flash-task-contract.js';
import {
  installPreinstalledStandardTables, PREINSTALLED_TABLE_KEYS, preinstalledEntries, preinstalledKind, requireStandardTableEntries, standardTableDigest, standardTableEntryOrphans,
  STANDARD_TABLE_SCHEMA_SQL,
  type PreinstalledTableKey,
} from '../../src/service/standard-tables.js';

describe('R5-L2 direct standard-table conversion', () => {
  it.each(['csv', 'tsv'])('reads %s headers, quoted cells, ranks, source and strength directly', async extension => {
    const separator = extension === 'csv' ? ',' : '\t';
    const text = [['推荐写法', '不推荐写法', '频序', '条件', '来源', '效力'], ['甲词', '乙词/丙词', '3', '限标题', '公开合成表', '辞书推荐']].map(r => r.join(separator)).join('\n');
    const converted = await convertTable(Buffer.from(text), `table.${extension}`, 'house');
    expect(converted.rows?.[0]).toMatchObject({ recommended: '甲词', discouraged: ['乙词', '丙词'], rank: 3, condition: '限标题', source: '公开合成表', strength: 'dictionary', status: 'applied' });
  });
  it('reads XLSX inline and shared strings, and DOCX table cells without a model', async () => {
    const sheet = '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>不推荐写法</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>甲词</t></is></c><c r="B2" t="s"><v>1</v></c></row></sheetData></worksheet>';
    const xlsx = zipSync({ 'xl/sharedStrings.xml': strToU8('<sst><si><t>推荐写法</t></si><si><t>乙词</t></si></sst>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) });
    const cell = (text: string) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const docx = zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr>${cell('规范字')}${cell('异体字')}</w:tr><w:tr>${cell('甲词')}${cell('乙词')}</w:tr></w:tbl></w:body></w:document>`) });
    for (const [name, bytes] of [['table.xlsx', xlsx], ['table.docx', docx]] as const) {
      expect((await convertTable(bytes, name, 'national')).rows?.[0]).toMatchObject({ recommended: '甲词', discouraged: ['乙词'], strength: 'national', status: 'applied' });
    }
  });
  it('reads the GF dash layout with appendix and notes, and holds conflicting recommendations', async () => {
    const text = '公开合成词表\n甲词——乙词\n附录：仅供参照\n丙词—丁词（限旧称）\n注：旧文引述保留。';
    const read = await convertTable(Buffer.from(text), 'gf.txt', 'national');
    expect(read.rows).toHaveLength(2); expect(read.rows?.[1]).toMatchObject({ recommended: '丙词', discouraged: ['丁词'], source: '附录：仅供参照' });
    expect(read.rows?.[1]?.condition).toContain('旧文引述保留');
    const conflict = await convertTable(Buffer.from('推荐写法\t不推荐写法\n甲词\t乙词\n丙词\t乙词'), 'conflict.tsv', 'house');
    expect(conflict.rows?.map(r => r.status)).toEqual(['to-confirm', 'to-confirm']); expect(conflict.rows?.[0]?.reviewNote).toContain('不同的推荐写法');
  });
  it('reads native entry objects and tuples and rejects malformed native rows', async () => {
    const input = { schema: 'ai7.standard-table/1', name: '公开合成表', kind: 'word-forms', entries: [{ recommended: '甲词', discouraged: ['乙词'] }] };
    expect((await convertTable(Buffer.from(JSON.stringify(input)), 'table.json', 'house')).rows?.[0]?.status).toBe('applied');
    const tuple = ['甲词', ['乙词'], null, null, null, 'national', 'applied', null, null];
    expect((await convertTable(Buffer.from(JSON.stringify({ ...input, entries: [tuple] })), 'table.json', 'house')).rows?.[0]?.strength).toBe('national');
    await expect(convertTable(Buffer.from(JSON.stringify({ ...input, entries: [{ recommended: '甲词', rank: -1 }] })), 'table.json', 'house')).rejects.toThrow(/条目/u);
  });
  it('leaves HTML, DOCX prose and unrecognised spreadsheets for Flash and bounds every part', async () => {
    const text = '公开说明中推荐甲词而不采用乙词。';
    const docx = zipSync({ 'word/document.xml': strToU8(`<document><body><p><r><t>${text}</t></r></p></body></document>`) });
    const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData><row><c t="inlineStr"><is><t>${text}</t></is></c></row></sheetData></worksheet>`) });
    for (const [name, bytes] of [['text.html', Buffer.from(`<html><body><p>${text}</p></body></html>`)], ['text.docx', docx], ['text.xlsx', xlsx]] as const) {
      const read = await convertTable(bytes, name, 'house'); expect(read.rows).toBeNull(); expect(read.paragraphs).toContain(text);
    }
    const paragraphs = ['字𠀀'.repeat(20000)]; const parts = formattingParts(paragraphs);
    expect(parts.flat().join('')).toBe(paragraphs[0]); expect(parts.every(p => Buffer.byteLength(standardsTable.message(p)) <= standardsTable.budget.maxInputBytes)).toBe(true);
  });
});

// R5-L1 (ADR 0106 §2, §5, §9, §10): the library's relations and its four pre-installed tables.

// The four version-1 digests, pinned. They depend only on the entries (`standardTableDigest`), never on the time or order of installing.
const DIGESTS: Readonly<Record<PreinstalledTableKey, string>> = {
  'tgh-2013': 'ae309fdc6fda9affd5965cff1276305a002662afc417b656a0918fbc4f58b241',
  'tgh-2013-annex-1': 'b67f3b918aecd7b3d6372f166e0a657ecb8b32d7ad50cbec84b078bb6ad369df',
  'gf-1001-2001': '265c376ab6b64437930b5ebbc569239d3ebc1b4ca2290d7cc7cac9464d466d33',
  'cycb-2': '95279be022dc555b207a5a4828963e930c1fdb1e448ff9cde4eef1bdd326c01f',
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

  it('gives every pre-installed table and version a stable id of its key — the same in every store and after a delete and restore', () => {
    const IDS: Record<PreinstalledTableKey, [string, string]> = {
      'tgh-2013': ['9c940a7a-a371-5b19-96d4-d47901421c6b', '8518a998-2fc6-5917-81f6-2c8a50817122'],
      'tgh-2013-annex-1': ['cc7ee4c6-24c0-54ea-8e08-47a87523af2c', 'edd7d6ea-fc06-59b8-9b35-d14d524b1151'],
      'gf-1001-2001': ['b56f71c7-d3f9-5576-8f95-dd140484e3ea', '34d88731-a70e-5ff1-9aa0-34636b6637fc'],
      'cycb-2': ['394996c0-7546-53ef-aedf-225b05c4bbdb', 'b4b53a7a-d39b-5a9c-a317-579d0f44e568'],
    };
    const idsOf = (db: DatabaseSync): Record<string, string[]> => Object.fromEntries(
      (db.prepare('SELECT t.preinstalled_key key, t.table_id, t.current_version_id FROM standard_tables t').all() as { key: string; table_id: string; current_version_id: string }[])
        .map((row) => [row.key, [row.table_id, row.current_version_id]]));
    const db = library();
    try {
      expect(idsOf(db)).toEqual(IDS);
      expect(new Set(Object.values(IDS).flat()).size).toBe(8);
      expect(Object.values(IDS).flat().every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id))).toBe(true);
    } finally { db.close(); }
    const other = library();
    try {
      expect(idsOf(other)).toEqual(IDS);
      other.exec('BEGIN IMMEDIATE');
      other.exec("DELETE FROM standard_table_entries WHERE version_id IN (SELECT current_version_id FROM standard_tables WHERE preinstalled_key = 'cycb-2')");
      other.exec("DELETE FROM standard_table_versions WHERE table_id IN (SELECT table_id FROM standard_tables WHERE preinstalled_key = 'cycb-2')");
      other.exec("DELETE FROM standard_tables WHERE preinstalled_key = 'cycb-2'");
      installPreinstalledStandardTables(other, ['cycb-2']);
      other.exec('COMMIT');
      expect(idsOf(other)).toEqual(IDS);
    } finally { other.close(); }
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

  it('installs the original national editions with their source order and conditions', () => {
    const db = library(['tgh-2013', 'tgh-2013-annex-1', 'gf-1001-2001']);
    try {
      const characters = entriesOf(db, 'tgh-2013');
      expect(characters.every((row, index) => row.source === `第${index + 1}号`)).toBe(true);
      const words = entriesOf(db, 'gf-1001-2001');
      expect(words.slice(0, 338).every(row => row.source === null)).toBe(true);
      expect(words.slice(338).every(row => row.source === '附录' && row.condition_note !== null)).toBe(true);
      expect(words.filter(row => row.condition_note !== null)).toHaveLength(10 + 44);
    } finally { db.close(); }
  });

  it('holds the 常用词表 as words and first ranks only: no discouraged form, no condition, no source', () => {
    const seed = readSeedRows('cycb-2');
    expect(seed.length).toBe(56462);
    expect(seed.every(row => row.length === 2 && /^[1-9]\d*$/u.test(row[0]!) && row[1]!.length > 0)).toBe(true);
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

  it('guards the version of its entries itself, since no whole-database pass walks it: an orphan entry is found, a deleted version is found', () => {
    const db = library();
    try {
      expect(standardTableEntryOrphans(db)).toBe(0);
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare("INSERT INTO standard_table_entries(version_id, position, recommended, discouraged, strength, status) VALUES (?, 1, 'x', '[]', 'house', 'applied')").run(randomUUID());
      expect(standardTableEntryOrphans(db)).toBe(1);
      expect(() => requireStandardTableEntries(db)).toThrow(/找不到所属的版本/u);
      db.exec("DELETE FROM standard_table_entries WHERE recommended = 'x'");
      const version = String(db.prepare("SELECT v.version_id id FROM standard_table_versions v JOIN standard_tables t ON t.table_id = v.table_id WHERE t.preinstalled_key = 'gf-1001-2001'").get()!.id);
      db.prepare('DELETE FROM standard_table_versions WHERE version_id = ?').run(version); // its 382 entries stay
      expect(standardTableEntryOrphans(db)).toBe(1);
      expect(() => requireStandardTableEntries(db)).toThrow(/找不到所属的版本/u);
    } finally { db.close(); }
  });

  it('finds orphan entries in a time that does not grow with the number of entries (500,000 entries, 5 versions)', () => {
    const db = new DatabaseSync(':memory:');
    try {
      createBaselineSchema(db);
      db.exec('PRAGMA foreign_keys = OFF');
      const insert = (versions: number, perVersion: number): void => db.exec(`WITH RECURSIVE v(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM v WHERE k < ${versions}),
        n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${perVersion})
        INSERT INTO standard_table_entries(version_id, position, recommended, discouraged, strength, status) SELECT 'version-' || k, i, 'w', '[]', 'house', 'applied' FROM v, n`);
      const best = (): number => { let least = Infinity; for (let run = 0; run < 7; run++) { const t = performance.now(); standardTableEntryOrphans(db); least = Math.min(least, performance.now() - t); } return least; };
      insert(5, 1000);
      const small = best();
      db.exec('DELETE FROM standard_table_entries');
      insert(5, 100_000);
      expect(Number(db.prepare('SELECT count(*) n FROM standard_table_entries').get()!.n)).toBe(500_000);
      expect(standardTableEntryOrphans(db)).toBe(5);
      const large = best();
      const wholePass = (() => { const t = performance.now(); db.prepare('PRAGMA foreign_key_check(standard_table_entries)').all(); return performance.now() - t; })();
      console.log(`ENTRY_ORPHANS 5,000 entries ${small.toFixed(3)} ms; 500,000 entries ${large.toFixed(3)} ms (a walk of the rows: ${wholePass.toFixed(1)} ms)`);
      expect(large).toBeLessThan(Math.max(2, small * 10));
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

it('resolves disagreement, conditional mappings and common-word overlaps from applied library rows (#1717)', async () => {
  const db = library([]);
  function table(kind: string, name: string, strength: string, rows: string[][]) {
    const id = randomUUID(), version = randomUUID();
    db.exec('BEGIN');
    db.prepare("INSERT INTO standard_tables VALUES (?,?,?,'imported',NULL,1,?,'now')").run(id,kind,name,version);
    db.prepare("INSERT INTO standard_table_versions VALUES (?,?,1,'合成版','合成来源',?,NULL,?,NULL,NULL,NULL,'now')").run(version,id,'a'.repeat(64),rows.length);
    for (const [i, [preferred, variant, condition, status]] of rows.entries()) {
      db.prepare('INSERT INTO standard_table_entries VALUES (?,?,?,?,NULL,?,?,?,?,NULL,NULL)').run(
        version,i+1,preferred!,JSON.stringify(variant ? [variant] : []),condition || null,'合成条目',strength,status ?? 'applied');
    }
    db.exec('COMMIT');
    return id;
  }
  try {
    const first = table('word-forms','合成甲表','national',[['苹果','苹裹'],['甲语','乙语','仅限正文'],['甲词','乙词']]);
    const second = table('word-forms','合成乙表','house',[['苹裹','苹果'],['丙词','乙词','','to-confirm']]);
    const common = table('common-words','合成常用词','dictionary',[['苹果'],['里程']]);
    const bookTerms = [{ kind: 'term' as const, preferred: '理程', variants: ['里层'] }];
    const options = { characters: true, variantWords: true, houseWordList: null, bookTerms };
    const pins = selectedStandardTables(db,options);
    const scan = loadLibraryCheck(db,pins,bookTerms);
    const results = [];
    for await (const hit of scan('苹裹。乙语。乙词。理程。',async () => {})) {
      results.push({ literal: hit.literal, ...libraryDetail(pins,hit.rule,hit.literal,hit.entries) });
    }
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ literal: '苹裹', replacement: null, observation: expect.stringMatching(/国家规范[\s\S]*本社要求|本社要求[\s\S]*国家规范/) });
    expect(results[0]!.observation).not.toContain('可能是不常用的写法');
    expect(results[1]).toMatchObject({ replacement: null, observation: expect.stringContaining('仅限正文') });
    expect(results[2]).toMatchObject({ replacement: '甲词' });
    expect(selectedStandardTables(db,{ ...options,tableIds:[first,common] }).map(pin => pin.tableId)).not.toContain(second);
  } finally { db.close(); }
});
