import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_SCHEMA_REVISION } from '../../src/service/baseline-schema.js';
import { DATA_VERSION, dataVersionMarkerPath, readDataVersionMarker, storeRevisionOnDisk } from '../../src/service/data-version.js';
import { EditorialStore } from '../../src/service/store.js';
import { FOREIGN_DATABASE, olderDataVersionMessage } from '../../src/shared/data-version-labels.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// The storage baseline's open (#1634; ADR 0105 §4) over the real store: an empty Agent Data Root is built at revision 117 with
// one Data Version 2 record; a store of an earlier Data Version is refused before anything touches it, its files left byte for
// byte; a baseline store that is not exactly the baseline is refused; and the 408 RAISE(ABORT) triggers stand and refuse.

let roots: ServiceTestRoots;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-baseline-open-'); });
afterEach(async () => { await roots.dispose(); });

const storePath = (root: string): string => join(root, 'store', 'ai7.sqlite');
const reference = JSON.parse(readFileSync('tests/fixtures/database/revision-116-schema.json', 'utf8')) as
  { rows: Array<{ type: string; name: string; sql: string | null }> };
const baseMessage = (trigger: string): string => /RAISE\(ABORT,\s*'([^']+)'/.exec(reference.rows.find((row) => row.name === trigger)!.sql!)![1]!;

/** Every file under the root, by path, with its bytes' digest: what "left untouched" is checked against. */
function filesOf(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[relative(root, path).split('\\').join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

const SEED_TABLES = ['search_backend_connections', 'procedure_definitions', 'procedure_definition_versions', 'production_document_categories'];
const INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/gu;

/**
 * Every seed row in rowid order. An instant reads `<instant>`, and a digest of another column of its row (whose bytes carry the
 * instant) reads `<sha256 of that column>`; every other byte is compared.
 */
function seedRows(db: DatabaseSync): Record<string, Array<Record<string, unknown>>> {
  return Object.fromEntries(SEED_TABLES.map((table) => [table, (db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Array<Record<string, unknown>>)
    .map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => {
      const source = typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value) ? Object.entries(row).find(([, other]) =>
        typeof other === 'string' && createHash('sha256').update(other).digest('hex') === value)?.[0] : undefined;
      return [column, source !== undefined ? `<sha256 of ${source}>` : typeof value === 'string' ? value.replace(INSTANT, '<instant>') : value];
    })))]));
}

async function newStore(root = roots.dataRoot): Promise<void> {
  (await EditorialStore.open(root, roots.codeRoot)).close();
}

/** A store of revision `revision`: the baseline stamped below itself, its shape exactly revision 116's (the shape diff). */
async function storeStampedAt(revision: number, marker: 'keep' | 'remove' | 'data-version-1'): Promise<void> {
  await newStore();
  const db = new DatabaseSync(storePath(roots.dataRoot));
  try { db.exec(`PRAGMA user_version = ${revision}`); } finally { db.close(); }
  if (marker === 'remove') await rm(dataVersionMarkerPath(roots.dataRoot));
  if (marker === 'data-version-1') {
    const written = (await readDataVersionMarker(roots.dataRoot))!;
    await writeFile(dataVersionMarkerPath(roots.dataRoot), JSON.stringify({ ...written, dataVersion: 1, schemaRevision: revision }));
  }
}

async function expectRefusedUntouched(): Promise<void> {
  const before = filesOf(roots.dataRoot);
  await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({
    code: 'DATA_VERSION_OLDER', message: olderDataVersionMessage(1),
  });
  expect(filesOf(roots.dataRoot)).toEqual(before);
}

describe('opening the storage baseline', () => {
  it('builds an empty Agent Data Root at revision 117 with one Data Version 2 record, its seed and its marker', async () => {
    await newStore();
    await newStore();
    const db = new DatabaseSync(storePath(roots.dataRoot), { readOnly: true });
    try {
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(BASELINE_SCHEMA_REVISION);
      expect(DATA_VERSION).toBe(2);
      expect(db.prepare('SELECT data_version, schema_revision FROM store_versions').all()).toEqual([{ data_version: 2, schema_revision: 117 }]);
      // The seed, value for value, as a store of revision 116 held it when new (instants and the digests that carry them masked).
      const seed = seedRows(db);
      if (process.env.AI7_REGENERATE_BASELINE_SEED === '1') writeFileSync('tests/fixtures/database/revision-117-seed.json', `${JSON.stringify(seed, null, 1)}
`);
      expect(seed).toEqual(JSON.parse(readFileSync('tests/fixtures/database/revision-117-seed.json', 'utf8')));
      expect(Object.values(seed).map((rows) => rows.length)).toEqual([5, 18, 29, 5]);
    } finally { db.close(); }
    expect(await readDataVersionMarker(roots.dataRoot)).toMatchObject({ dataVersion: 2, schemaRevision: 117 });
  });

  it.each(['keep', 'remove', 'data-version-1'] as const)('refuses a revision-116 store before anything touches it, its files byte for byte (marker: %s)', async (marker) => {
    await storeStampedAt(116, marker);
    await expectRefusedUntouched();
  });

  it('refuses the admitted 0.7.1 store (revision 115) as it lies, without a marker', async () => {
    for (const [name, bytes] of Object.entries(unzipSync(await readFile('tests/fixtures/database/sample1-review-071.ai7db')))) {
      if (name === 'manifest.json') continue;
      await mkdir(dirname(join(roots.dataRoot, name)), { recursive: true });
      await writeFile(join(roots.dataRoot, name), bytes);
    }
    expect(storeRevisionOnDisk(storePath(roots.dataRoot))).toBe(115);
    await expectRefusedUntouched();
  });

  it.each(['baseline header', 'empty header'] as const)('refuses a revision-116 store whose page 1 waits in an uncheckpointed write-ahead log (%s), every file unchanged', async (main) => {
    // A writer that stopped before a checkpoint: the log holds the store's page 1 at revision 116, the main file an older header.
    const source = join(roots.inputRoot, 'writer');
    await mkdir(source, { recursive: true });
    if (main === 'baseline header') { await newStore(source); }
    else await mkdir(join(source, 'store'), { recursive: true });
    const writer = new DatabaseSync(storePath(source));
    try {
      writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
      if (main === 'empty header') writer.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
      writer.exec('PRAGMA user_version = 116');
      await mkdir(join(roots.dataRoot, 'store'), { recursive: true });
      for (const file of ['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm']) {
        if (existsSync(join(source, 'store', file))) copyFileSync(join(source, 'store', file), join(roots.dataRoot, 'store', file));
      }
    } finally { writer.close(); }
    expect(statSync(join(roots.dataRoot, 'store', 'ai7.sqlite-wal')).size).toBeGreaterThan(0);
    const header = readFileSync(storePath(roots.dataRoot)).subarray(0, 100);
    expect(header.length === 0 || header.readUInt32BE(60) !== 116).toBe(true);
    expect(storeRevisionOnDisk(storePath(roots.dataRoot))).toBe(116);
    await expectRefusedUntouched();
  });

  it.each([
    ['a ledger trigger dropped', 'DROP TRIGGER store_versions_no_update'],
    ['an index dropped', 'DROP INDEX working_blocks_window'],
    ['a column added', 'ALTER TABLE books ADD COLUMN extra TEXT'],
    ['a relation added', 'CREATE TABLE stray (id INTEGER PRIMARY KEY) STRICT'],
  ])('refuses a revision-117 store with %s', async (_label, damage) => {
    await newStore();
    const db = new DatabaseSync(storePath(roots.dataRoot));
    try { db.exec(damage); } finally { db.close(); }
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('keeps all 408 triggers over imported sample1, and each kind refuses as it did at revision 116', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let staged: Awaited<ReturnType<EditorialStore['stageSelectedManuscript']>>;
    try {
      await importSample1Book(store, roots.codeRoot, '基线触发器');
      // A second, unrelated draft (an excerpt of sample1), staged and never committed: the one a cleanup can fence.
      const excerpt = join(roots.inputRoot, 'sample1-excerpt.docx');
      await composeRevisedDocx(excerpt, { source: ADMITTED_BASELINE_DOCX, title: 'sample1', paragraphs: [{ runs: [{ text: { block: 21 } }] }] });
      staged = await store.stageSelectedManuscript(randomUUID(), excerpt);
      store.markCleanShutdown();
    } finally { store.close(); }
    const db = new DatabaseSync(storePath(roots.dataRoot));
    try {
      const triggers = db.prepare("SELECT count(*) total FROM sqlite_schema WHERE type = 'trigger' AND sql LIKE '%RAISE(ABORT%'").get()!.total;
      expect(triggers).toBe(408);
      // Append-only ledger: update and delete.
      expect(() => db.exec("UPDATE store_versions SET software_version = '9.9.9'")).toThrow(baseMessage('store_versions_no_update'));
      expect(() => db.exec('DELETE FROM store_versions')).toThrow(baseMessage('store_versions_no_delete'));
      // Insert-time guard: an import commit holds one kind of result.
      const commit = String(db.prepare('SELECT commit_id FROM manuscript_import_records LIMIT 1').get()!.commit_id);
      expect(() => db.prepare('INSERT INTO source_import_records(commit_id) VALUES (?)').run(commit))
        .toThrow(baseMessage('source_import_record_excludes_manuscript_result'));
      // Abandonment-cleanup fence: a draft whose cleanup is pending takes no other write.
      const draft = db.prepare('SELECT d.draft_id, d.draft_version, d.object_digest, o.relative_key FROM import_drafts d JOIN content_objects o ON o.object_digest = d.object_digest WHERE d.draft_id = ?')
        .get(staged!.draftId)!;
      db.prepare("INSERT INTO import_abandonment_cleanup_intents(draft_id, object_digest, expected_draft_version, relative_key, state, requested_at) VALUES (?, ?, ?, ?, 'prepared', ?)")
        .run(String(draft.draft_id), String(draft.object_digest), Number(draft.draft_version), String(draft.relative_key), new Date().toISOString());
      expect(() => db.prepare('UPDATE import_drafts SET draft_version = draft_version + 1 WHERE draft_id = ?').run(staged!.draftId))
        .toThrow(baseMessage('abandonment_cleanup_block_draft_update'));
    } finally { db.close(); }
  });
});

/** The store files of `root` copied into `into` as a crash would leave them, while `writer` still holds them open. */
function snapshotStore(root: string, into: string, files = ['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm']): void {
  for (const file of files) {
    if (existsSync(join(root, 'store', file))) copyFileSync(join(root, 'store', file), join(into, 'store', file));
  }
}

describe('a database AI7 did not make (#1634 review B1)', () => {
  it.each(['in the file', 'in an uncheckpointed write-ahead log'] as const)('refuses a revision-0 database that holds a table %s, every file unchanged', async (where) => {
    const writer = join(roots.inputRoot, 'foreign');
    await mkdir(join(writer, 'store'), { recursive: true });
    await mkdir(join(roots.dataRoot, 'store'), { recursive: true });
    const db = new DatabaseSync(storePath(writer));
    try {
      if (where === 'in an uncheckpointed write-ahead log') db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
      db.exec('CREATE TABLE old_data (value TEXT)');
      if (where === 'in an uncheckpointed write-ahead log') snapshotStore(writer, roots.dataRoot);
    } finally { db.close(); }
    if (where === 'in the file') snapshotStore(writer, roots.dataRoot);
    const before = filesOf(roots.dataRoot);
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({
      code: 'DATA_STORE_FOREIGN', message: FOREIGN_DATABASE,
    });
    expect(filesOf(roots.dataRoot)).toEqual(before);
  });

  it('builds the baseline in a 0-byte store file', async () => {
    await mkdir(join(roots.dataRoot, 'store'), { recursive: true });
    await writeFile(storePath(roots.dataRoot), new Uint8Array());
    await newStore();
    expect(storeRevisionOnDisk(storePath(roots.dataRoot))).toBe(BASELINE_SCHEMA_REVISION);
  });
});

describe('the file reader agrees with SQLite (#1634 review F4)', () => {
  // Each state is a crash-like copy of a live writer's files; SQLite then reads a second copy, so the reader's copy stays as written.
  const fill = (db: DatabaseSync): void => {
    db.exec('CREATE TABLE IF NOT EXISTS spill (value TEXT)');
    const insert = db.prepare('INSERT INTO spill VALUES (?)');
    for (let index = 0; index < 60; index += 1) insert.run('溢出'.repeat(200));
  };
  // The log without its last frame: a commit torn after the frames before it were written.
  const cutLastFrame = (copy: string): void => {
    const log = readFileSync(`${storePath(copy)}-wal`);
    writeFileSync(`${storePath(copy)}-wal`, log.subarray(0, log.length - (24 + log.readUInt32BE(8))));
  };
  const states: Array<[string, (db: DatabaseSync) => void, ((copy: string) => void) | null, number | null]> = [
    ['a closed baseline store', () => undefined, null, null],
    ['a revision stamped in the log', (db) => db.exec('PRAGMA user_version = 116'), null, null],
    ['a log already checkpointed but kept', (db) => { db.exec('PRAGMA user_version = 116'); db.exec('PRAGMA wal_checkpoint(PASSIVE)'); }, null, null],
    ['two stamps, the later committed last', (db) => { db.exec('PRAGMA user_version = 5'); db.exec('PRAGMA user_version = 116'); }, null, null],
    ['an open transaction spilled into the log', (db) => {
      db.exec('PRAGMA cache_size = 1; CREATE TABLE spill (value TEXT); BEGIN; PRAGMA user_version = 3');
      const insert = db.prepare('INSERT INTO spill VALUES (?)');
      for (let index = 0; index < 400; index += 1) insert.run('溢出'.repeat(200));
    }, null, null],
    // Review N2: the log restarts after a checkpoint; frames of the earlier log, under older salts, stay after the new ones.
    ['a restarted log over the frames of an earlier one', (db) => {
      db.exec('PRAGMA user_version = 115'); fill(db); db.exec('PRAGMA user_version = 116');
      db.exec('PRAGMA wal_checkpoint(PASSIVE)'); db.exec('PRAGMA user_version = 117');
    }, null, 117],
    // Review N2: a later transaction wrote its page 1 but not its commit frame.
    ['a commit torn after its page-1 frame', (db) => {
      db.exec('PRAGMA user_version = 116'); db.exec('BEGIN; PRAGMA user_version = 30'); fill(db); db.exec('COMMIT');
    }, cutLastFrame, 116],
  ];
  it.each(states)('reads %s as SQLite does', async (_label, write, alter, expected) => {
    await newStore();
    const writer = new DatabaseSync(storePath(roots.dataRoot));
    const copies = [join(roots.inputRoot, 'reader'), join(roots.inputRoot, 'sqlite')];
    try {
      writer.exec('PRAGMA wal_autocheckpoint = 0');
      write(writer);
      // The main file and its log; SQLite rebuilds the shared-memory index, which a live writer holds locked.
      for (const copy of copies) { await mkdir(join(copy, 'store'), { recursive: true }); snapshotStore(roots.dataRoot, copy, ['ai7.sqlite', 'ai7.sqlite-wal']); }
    } finally {
      if (writer.isTransaction) writer.exec('ROLLBACK');
      writer.close();
    }
    if (alter !== null) for (const copy of copies) alter(copy);
    const sqlite = new DatabaseSync(storePath(copies[1]!), { readOnly: true });
    try {
      const revision = Number(sqlite.prepare('PRAGMA user_version').get()!.user_version);
      expect(storeRevisionOnDisk(storePath(copies[0]!))).toBe(revision);
      if (expected !== null) expect(revision).toBe(expected);
    } finally { sqlite.close(); }
  });
});
