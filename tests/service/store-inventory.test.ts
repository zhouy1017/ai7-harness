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
