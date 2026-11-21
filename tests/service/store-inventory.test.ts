import { writeModelRoleChoice } from '../../src/service/model-service-connections.js';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyStore, openPackageStore } from '../../src/service/database-exports.js';
import { MERGE_TABLE_POLICY, type MergeTablePolicy } from '../../src/service/database-merge.js';
import { inventoryCoverageGaps, inventoryStore, INVENTORY_TABLES, NOT_COUNTED } from '../../src/service/store-inventory.js';
import { EditorialStore } from '../../src/service/store.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

let roots: ServiceTestRoots;
let path: string;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-inventory-');
  path = join(roots.dataRoot, 'store', 'ai7.sqlite');
});
afterEach(async () => { await roots.dispose(); });

async function unpack(): Promise<void> {
  const entries = unzipSync(await readFile('tests/fixtures/database/sample1-review-071.ai7db'));
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === 'manifest.json') continue;
    const target = join(roots.dataRoot, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

async function importSample1(store: EditorialStore): Promise<void> {
  const manuscript = join(roots.inputRoot, 'sample1.docx');
  await composeRevisedDocx(manuscript, { source: ADMITTED_BASELINE_DOCX, title: 'sample1', paragraphs: [{ runs: [{ text: { block: 21 } }] }] });
  const draft = await store.stageSelectedManuscript(randomUUID(), manuscript);
  const review = store.prepareNewBookReview(draft.draftId, draft.draftVersion, { kind: 'new-book', choiceId: draft.targetChoices.find((choice) => choice.kind === 'new-book')!.id, confirmedTitle: draft.titleSuggestion.value }, false);
  const commitId = randomUUID();
  await store.commitNewBookImport({ draftId: draft.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
}

const POLICY_CLASSES: readonly MergeTablePolicy[] = ['seed', 'owned', 'dependent', 'shared', 'excluded', 'transient', 'house', 'derived'];

/** The 0.7.1 package store as it was packed, written to directly (#1634 review F7): no open, no migration. */
async function seed(): Promise<void> {
  await unpack();
  const db = new DatabaseSync(path);
  try { seedEntities(db); } finally { db.close(); }
}

/** Seed missing D7 relations using the real schema and foreign keys; payloads are sample1 metadata.
 * Inventory counts persisted rows, so no model calls or task execution are needed to populate them.
 */
function seedEntities(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  const book = db.prepare('SELECT book_id, title FROM books LIMIT 1').get()!;
  const revision = db.prepare('SELECT * FROM manuscript_revisions WHERE manuscript_id = (SELECT manuscript_id FROM manuscripts WHERE book_id = ? AND role = ?)').get(book.book_id!, 'primary')!;
  const analysis = db.prepare('SELECT * FROM analysis_result_set_revisions LIMIT 1').get()!;
  const task = db.prepare('SELECT task_intent_id FROM analysis_task_intents LIMIT 1').get()!;
  const review = db.prepare('SELECT review_run_id FROM review_runs LIMIT 1').get()!;
  const now = new Date().toISOString();
  const digest = createHash('sha256').update(String(book.title)).digest('hex');
  const insert = (table: string, values: Record<string, string | number | null>): void => {
    const keys = Object.keys(values);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values));
  };
  const payload = () => { const json = JSON.stringify({ title: book.title, seed: randomUUID() }); return { canonical_json: json, sha256: createHash('sha256').update(json).digest('hex') }; };
  const id = () => randomUUID();
  const milestone = id();
  insert('milestone_versions', { milestone_id: milestone, manuscript_id: String(revision.manuscript_id), branch_id: String(revision.branch_id), revision_id: String(revision.revision_id), label: 'sample1', purpose: 'sample1', actor: '本机编辑', created_at: now });
  insert('publication_versions', { publication_version_id: id(), book_id: String(book.book_id), ordinal: 1, manuscript_id: String(revision.manuscript_id), branch_id: String(revision.branch_id), milestone_id: milestone, revision_id: String(revision.revision_id), revision_digest: digest, scope: 'sample1', basis: 'sample1', actor: '本机编辑', created_at: now, ...payload() });
  const record = id();
  insert('evaluation_records', { record_id: record, book_id: String(book.book_id), ordinal: 1, manuscript_id: String(revision.manuscript_id), revision_id: String(revision.revision_id), profile_sha256: digest, created_at: now, ...payload() });
  for (const table of ['readers_report_drafts', 'writing_drafts']) {
    const document = id();
    insert('manuscripts', { manuscript_id: document, book_id: String(book.book_id), role: 'production-document', created_at: now });
    insert('production_documents', { document_id: document, book_id: String(book.book_id), type_id: 'sample1', type_configuration_version: '1', type_configuration_digest: digest, origin_source_version_id: String(revision.source_version_id), parser_identity: 'sample1', record_digest: createHash('sha256').update(document).digest('hex'), created_at: now });
    const saved = id();
    insert('manuscript_revisions', { revision_id: saved, manuscript_id: document, branch_id: String(revision.branch_id), ordinal: 1, revision_label: 'sample1', source_version_id: String(revision.source_version_id), revision_digest: digest, created_at: now });
    insert('production_document_versions', { document_id: document, version: 1, revision_id: saved, revision_digest: digest, origin: 'created', recorded_at: now });
    insert(table, { document_id: document, book_id: String(book.book_id), analysis_revision_id: String(analysis.revision_id), task_intent_id: String(task.task_intent_id), ...(table === 'writing_drafts' ? { type_id: 'sample1' } : { template: 'author', record_id: record }), recorded_at: now, ...payload() });
  }
  // Revision 116's relation: the 0.7.1 store was packed before it, so it holds none.
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'review_run_synthesis'").get() !== undefined) insert('review_run_synthesis', { review_run_id: String(review.review_run_id), synthesis_key: 'sample1' });
  insert('editorial_mark_replies', { reply_id: id(), mark_id: String(db.prepare('SELECT mark_id FROM editorial_marks LIMIT 1').get()!.mark_id), ordinal: 1, body: String(book.title), author: 'editor', created_at: now });
  seedMemory(db, insert, payload, String(book.book_id), String(book.title), now);
  for (const [table, fields] of [ ['backup_preferences', { enabled: 1 }], ['evaluation_preferences', { prediction_enabled: 1, calibration_enabled: 0 }] ] as const) {
    if (Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n) === 0) insert(table, { preference_id: id(), ordinal: 1, recorded_at: now, ...fields, ...payload() });
  }
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
}

function seedMemory(db: DatabaseSync, insert: (table: string, values: Record<string, string | number | null>) => void, payload: () => { canonical_json: string; sha256: string }, book: string, title: string, now: string): void {
  const signal = randomUUID();
  insert('learning_signals', { signal_id: signal, book_id: book, source_key: signal, recorded_at: now, ...payload() });
  for (const [index, scope] of ['ordinary-production', 'developer-live', 'development-ci'].entries()) {
    const item = randomUUID();
    insert('global_editorial_memory_items', { item_id: item, client_memory_id: item, source_signal_id: signal, recorded_at: now });
    let prior: string | null = null;
    for (const [offset, state] of ['proposed', 'active', 'inactive', 'frozen'].entries()) {
      const version = randomUUID();
      const json = JSON.stringify({ itemId: item, title, operationalScope: scope, state });
      insert('global_editorial_memory_item_versions', { version_id: version, item_id: item, ordinal: offset + 1, supersedes: prior, recorded_at: now, canonical_json: json, sha256: createHash('sha256').update(json).update(version).digest('hex') });
      prior = version;
    }
    const json = JSON.stringify({ operationalScope: scope, lines: [{ text: title }, { text: '   ' }] });
    insert('house_review_preference_versions', { version_id: randomUUID(), operational_scope: scope!, ordinal: 1, material_set_digest: '0'.repeat(64), recorded_at: now, canonical_json: json, sha256: createHash('sha256').update(json).digest('hex') });
    insert('editorial_learning_controls', { entry_id: randomUUID(), ordinal: index + 1, kind: index === 2 ? 'book' : 'switch', book_id: index === 2 ? book : null, value: index % 2, recorded_at: now, ...payload() });
  }
  const item = randomUUID();
  insert('global_editorial_memory_items', { item_id: item, client_memory_id: item, source_signal_id: signal, recorded_at: now });
  let previous: string | null = null;
  for (const [index, activation] of ['active', 'inactive', 'archived'].entries()) {
    const version = randomUUID();
    const json = JSON.stringify({ schema: 'ai7.global-editorial-memory/1', itemId: item, title, activation });
    insert('global_editorial_memory_item_versions', { version_id: version, item_id: item, ordinal: index + 1, supersedes: previous, recorded_at: now, canonical_json: json, sha256: createHash('sha256').update(json).digest('hex') });
    previous = version;
  }
}

describe('read-only business inventory', () => {
  it('counts role choices as an expected physical difference, outside equal D7 entities (#1650)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const connection = store.saveModelServiceConnection('Synthetic inventory connection', null, 'ready', 'anthropic-claude');
      const db = new DatabaseSync(path);
      try {
        writeModelRoleChoice(db, 'foreground-pro', null);
        const before = JSON.parse(inventoryStore(path));
        writeModelRoleChoice(db, 'foreground-pro', { connectionId: connection.connectionId, modelId: connection.binding.modelId });
        writeModelRoleChoice(db, 'foreground-flash', { connectionId: connection.connectionId, modelId: connection.binding.modelId });
        const after = JSON.parse(inventoryStore(path));
        expect([before.tables.model_role_choices, after.tables.model_role_choices]).toEqual([0, 2]);
        expect(after.entities).toEqual(before.entities);
        expect(after.entities.relations).not.toHaveProperty('model_role_choices');
      } finally { db.close(); }
    } finally { store.close(); }
  });

  it('requires every merge-policy table and every table of a real store to be counted or listed as not counted', async () => {
    const schemaRoots = await createServiceTestRoots('ai7-inventory-schema-');
    try {
      const store = await EditorialStore.open(schemaRoots.dataRoot, schemaRoots.codeRoot);
      store.close();
      const db = openPackageStore(join(schemaRoots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const names = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((row) => row.name);
        expect(names.length).toBeGreaterThan(200);
        expect(inventoryCoverageGaps(names)).toEqual({ missing: [], both: [] });
      } finally { db.close(); }
    } finally { await schemaRoots.dispose(); }
    expect(inventoryCoverageGaps(Object.keys(MERGE_TABLE_POLICY))).toEqual({ missing: [], both: [] });
    expect(new Set(INVENTORY_TABLES).size).toBe(INVENTORY_TABLES.length);
    for (const reason of Object.values(NOT_COUNTED)) expect(reason.length).toBeGreaterThan(10);
  });

  it.each(POLICY_CLASSES)('goes red for a table of class %s that is neither counted nor listed', (policyClass) => {
    const fake = `fake_${policyClass}_table`;
    const policy = { ...MERGE_TABLE_POLICY, [fake]: policyClass };
    expect(inventoryCoverageGaps(Object.keys(policy))).toEqual({ missing: [fake], both: [] });
  });

  it('goes red for a table that is both counted and listed as not counted', () => {
    expect(inventoryCoverageGaps(['books', 'working_block_search'])).toEqual({ missing: [], both: [] });
    const clash = INVENTORY_TABLES[0]!;
    (NOT_COUNTED as Record<string, string>)[clash] = 'fake';
    try { expect(inventoryCoverageGaps([clash])).toEqual({ missing: [], both: [clash] }); } finally { delete (NOT_COUNTED as Record<string, string>)[clash]; }
  });

  it('reads the original 0.7.1 package store without migrating or changing its file', async () => {
    await unpack();
    const before = await stat(path);
    const output = JSON.parse(inventoryStore(path));
    const db = openPackageStore(path);
    try { expect(Number(db.prepare('PRAGMA user_version').get()!.user_version)).toBe(115); } finally { db.close(); }
    expect(output.entities.marks).toEqual({ byKind: { 'change-suggestion': 7, annotation: 2, 'editor-note': 0, 'personal-highlight': 0, other: 0 }, byStatus: { open: 9, resolved: 0, applied: 0, removed: 0, converted: 0, other: 0 }, byAuthorKind: { editor: 0, ai7: 9, 'imported-author': 0, other: 0 } });
    expect(output.tables.books).toBe(2);
    expect(output.entities.relations.books).toBe(2);
    expect(output.tables.review_findings).toBe(9);
    expect(output.tables.review_run_synthesis).toBe(0);
    const after = await stat(path);
    expect([after.mtimeMs, after.size]).toEqual([before.mtimeMs, before.size]);
  });

  it('counts a real 0.7.1 store deterministically and equals its online backup', async () => {
    await seed();
    const before = await stat(path);
    const output = inventoryStore(path);
    expect(inventoryStore(path)).toBe(output);
    const parsed = JSON.parse(output);
    expect(Object.keys(parsed)).toEqual(['entities', 'tables']);
    for (const table of ['books', 'manuscripts', 'production_documents', 'production_document_versions', 'content_objects', 'source_versions', 'editorial_marks', 'editorial_mark_replies', 'manuscript_revisions', 'milestone_versions', 'publication_versions', 'analysis_result_sets', 'review_runs', 'review_findings', 'review_reports', 'evaluation_records', 'readers_report_drafts', 'writing_drafts', 'global_editorial_memory_items', 'global_editorial_memory_item_versions', 'house_review_preference_versions', 'model_service_connections', 'search_backend_connections', 'backup_preferences', 'evaluation_preferences']) expect(parsed.tables[table], table).toBeGreaterThan(0);
    for (const [table, n] of Object.entries(parsed.entities.relations)) expect(n, table).toBe(parsed.tables[table]);
    // The relations the upgrade changes by design are physical counts only, never entities.
    for (const table of ['manuscript_revisions', 'working_offset_nodes', 'store_versions']) expect(parsed.entities.relations[table], table).toBeUndefined();
    expect(parsed.entities.manuscripts).toEqual({ primary: 2, 'production-document': 2, other: 0 });
    // One memory version of the legacy item has a state outside the vocabulary: it is counted in `other`, not dropped.
    expect(parsed.entities.memory.versions).toEqual({ total: 15, withTitle: 15, byState: { proposed: 3, active: 4, inactive: 4, frozen: 3, other: 1 }, titledByState: { proposed: 3, active: 4, inactive: 4, frozen: 3, other: 1 }, byScope: { 'ordinary-production': 4, 'developer-live': 4, 'development-ci': 4, legacy: 3, other: 0 } });
    expect(parsed.entities.memory.currentItems.total).toBe(4);
    expect(parsed.entities.memory.currentItems.byState).toEqual({ proposed: 0, active: 0, inactive: 0, frozen: 3, other: 1 });
    expect(parsed.entities.learningControls).toEqual({ switch: { '0': 1, '1': 1, other: 0 }, book: { '0': 1, '1': 0, other: 0 } });
    for (const scope of ['ordinary-production', 'developer-live', 'development-ci']) expect(parsed.entities.preferences[scope]).toEqual({ versions: 1, lines: 2, withText: 1 });
    const leaves = (value: unknown): unknown[] => value !== null && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [value];
    expect(leaves(parsed).every((value) => typeof value === 'number')).toBe(true);
    const db = openPackageStore(path);
    try {
      expect(Number(db.prepare('PRAGMA user_version').get()!.user_version)).toBe(115);
      // A relation the 0.7.1 store predates is counted 0, as the inventory reads it.
      const present = (table: string): boolean => db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined;
      const expected = Object.fromEntries(INVENTORY_TABLES.map((table) => [table, present(table) ? Number(db.prepare(`SELECT count(*) n FROM "${table}"`).get()!.n) : 0]));
      expect(parsed.tables).toEqual(expected);
      expect(() => db.exec('CREATE TABLE forbidden (id INTEGER)')).toThrow(/readonly|read-only/i);
      const copy = join(roots.inputRoot, 'backup.sqlite');
      await copyStore(db, copy);
      expect(inventoryStore(copy)).toBe(output);
    } finally { db.close(); }
    const after = await stat(path);
    expect([after.mtimeMs, after.size]).toEqual([before.mtimeMs, before.size]);
  });

  it('counts the rows of an un-checkpointed WAL and leaves the main file and the -wal bytes unchanged', async () => {
    // A live product store: WAL mode, auto-checkpoint off. A crash-like snapshot is its main file and its -wal, without -shm.
    // One clean open and close first, so the main file holds the baseline and only the import waits in the log.
    (await EditorialStore.open(roots.dataRoot, roots.codeRoot)).close();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const wal = join(roots.inputRoot, 'wal');
    const mainOnly = join(roots.inputRoot, 'main-only');
    try {
      await importSample1(store);
      await mkdir(wal, { recursive: true });
      await mkdir(mainOnly, { recursive: true });
      await copyFile(path, join(wal, 'ai7.sqlite'));
      await copyFile(`${path}-wal`, join(wal, 'ai7.sqlite-wal'));
      await copyFile(path, join(mainOnly, 'ai7.sqlite'));
    } finally { store.close(); }
    const mainPath = join(wal, 'ai7.sqlite');
    const walPath = `${mainPath}-wal`;
    expect((await stat(walPath)).size).toBeGreaterThan(0);
    const [mainBefore, walBefore] = [await readFile(mainPath), await readFile(walPath)];
    expect((await readdir(wal)).sort()).toEqual(['ai7.sqlite', 'ai7.sqlite-wal']);
    const inWal = JSON.parse(inventoryStore(mainPath));
    expect(Buffer.compare(await readFile(mainPath), mainBefore)).toBe(0);
    expect(Buffer.compare(await readFile(walPath), walBefore)).toBe(0);
    // The read-only open adds exactly the shared-memory index; nothing else appears.
    expect((await readdir(wal)).sort()).toEqual(['ai7.sqlite', 'ai7.sqlite-shm', 'ai7.sqlite-wal']);
    // The imported book lives only in the WAL: the main file alone has fewer rows than the snapshot with its WAL.
    const alone = JSON.parse(inventoryStore(join(mainOnly, 'ai7.sqlite')));
    expect(inWal.tables.books).toBe(alone.tables.books + 1);
    expect(inWal.entities.manuscripts.primary).toBeGreaterThan(alone.entities.manuscripts.primary);
  });

  it('refuses an empty file and a file that is not a store, and keeps failing on a missing or damaged one', async () => {
    const dir = join(roots.inputRoot, 'bad');
    await mkdir(dir, { recursive: true });
    const file = (name: string) => join(dir, name);
    await writeFile(file('empty.sqlite'), new Uint8Array());
    expect(() => inventoryStore(file('empty.sqlite'))).toThrow(/STORE_INVENTORY_EMPTY_FILE/);
    expect((await stat(file('empty.sqlite'))).size).toBe(0);
    const other = new DatabaseSync(file('other.sqlite'));
    other.exec('CREATE TABLE books (book_id TEXT)');
    other.close();
    expect(() => inventoryStore(file('other.sqlite'))).toThrow(/STORE_INVENTORY_NOT_A_STORE/);
    expect(() => inventoryStore(file('missing.sqlite'))).toThrow();
    await writeFile(file('garbage.sqlite'), new TextEncoder().encode('this is not a database '.repeat(300)));
    expect(() => inventoryStore(file('garbage.sqlite'))).toThrow();
    await unpack();
    const bytes = await readFile(path);
    await writeFile(file('truncated.sqlite'), bytes.subarray(0, 5000));
    expect(() => inventoryStore(file('truncated.sqlite'))).toThrow();
  });
});
