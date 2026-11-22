import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_MATERIAL_SCHEMA_SQL, LIBRARY_MATERIAL_TRIGGER_SQL, LibraryMaterialLedger } from '../../src/service/library-materials.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import type { LibraryMaterialDecisionInput, LibraryMaterialProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// 「暂不使用」 (Issue #1671): a decision recorded as an appended `deferred` eligibility record that carries `notUsed: true`, so
// that a build which does not know the marker (0.7.3) still reads it as 稍后决定, or as unattributed. The ledger is exercised
// over a real SQLite database with the real relations and triggers, because the store always attributes what it adds.

let roots: ServiceTestRoots;
let db: DatabaseSync;
let ledger: LibraryMaterialLedger;
let bookA: string;
let bookB: string;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-library-not-used-');
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY, title TEXT NOT NULL)');
  bookA = randomUUID();
  bookB = randomUUID();
  db.prepare('INSERT INTO books(book_id, title) VALUES (?, ?), (?, ?)').run(bookA, '甲书', bookB, '乙书');
  for (const sql of Object.values(LIBRARY_MATERIAL_SCHEMA_SQL)) db.exec(sql);
  for (const sql of Object.values(LIBRARY_MATERIAL_TRIGGER_SQL)) db.exec(sql);
  mkdirSync(roots.dataRoot, { recursive: true });
  ledger = new LibraryMaterialLedger(db, roots.dataRoot);
});

afterEach(async () => {
  db.close();
  await roots.dispose();
});

function input(name: string): string {
  const directory = join(roots.inputRoot, 'library');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${name}.txt`);
  writeFileSync(path, `AI7 资料库「暂不使用」测试：${name}。`);
  return path;
}

async function arrive(name: string): Promise<string> {
  const preview = await ledger.preview(input(name));
  return ledger.record(await ledger.keep(preview.previewId), name, 'document');
}

function decide(id: string, decision: LibraryMaterialDecisionInput): LibraryMaterialProjection {
  ledger.decide(id, ledger.item(id).decisionCount, decision);
  return ledger.item(id);
}

const house: LibraryMaterialDecisionInput = { kind: 'attribution', attribution: { scope: 'house' } };
const book = (bookId: string): LibraryMaterialDecisionInput => ({ kind: 'attribution', attribution: { scope: 'book', bookId } });
const notUsed: LibraryMaterialDecisionInput = { kind: 'not-used' };
const eligibility = (choice: 'book' | 'house' | 'excluded' | 'deferred'): LibraryMaterialDecisionInput => ({ kind: 'eligibility', choice, reason: null });
const MOVED = '这份资料的归属或学习准入刚被改过；请看过现在的决定再定。';
const ALREADY = '这份资料已经是「暂不使用」。';

function waiting(): string[] {
  return ledger.attentionReadings(50).map((reading) => `${reading.materialId}:${reading.state}`);
}

/**
 * What 0.7.3 reads of the same rows. These are the conditions of `#decisions` and `standing` in `src/service/library-materials.ts`
 * as committed at 3031f87a (0.7.3), copied here so that a later change to the live reader cannot make this pin pass by accident:
 * the eligibility check names no marker, wants `attributionOrdinal` to equal the attribution before it (`null` when none), and
 * an eligibility counts only under the attribution it names.
 */
function readAsRelease073(materialId: string): { attribution: number | null; eligibility: string | null; available: boolean } {
  let attributionOrdinal: number | null = null;
  let attribution: number | null = null;
  let eligibility: string | null = null;
  for (const row of db.prepare('SELECT * FROM library_material_decisions WHERE material_id = ? ORDER BY ordinal').all(materialId)) {
    const json = String(row.canonical_json);
    expect(createHash('sha256').update(json).digest('hex')).toBe(row.sha256);
    const record = JSON.parse(json) as Record<string, unknown>;
    if (record.kind === 'attribution') {
      attributionOrdinal = Number(row.ordinal);
      attribution = attributionOrdinal;
      eligibility = null;
      continue;
    }
    expect(record.kind === 'eligibility' && ['book', 'house', 'excluded', 'deferred'].includes(record.choice as string) &&
      record.basis === '编辑决定' && record.attributionOrdinal === attributionOrdinal &&
      (record.choice === 'book') === (typeof record.bookId === 'string') && (record.reason === null || typeof record.reason === 'string')).toBe(true);
    if (attribution !== null && record.attributionOrdinal === attribution) eligibility = record.choice as string;
  }
  return { attribution, eligibility, available: attribution !== null && eligibility !== null && eligibility !== 'deferred' };
}

describe('暂不使用 as a decision (Issue #1671)', () => {
  it('is accepted for an item with no attribution, leaves 待我处理 and is not available', async () => {
    const id = await arrive('无归属');
    expect(waiting()).toEqual([`${id}:library-attribution-pending`]);
    const item = decide(id, notUsed);
    expect(waiting()).toEqual([]);
    expect([item.notUsed !== undefined, item.attribution, item.eligibility, item.reference, item.decisionCount])
      .toEqual([true, null, null, { state: 'pending' }, 1]);
    expect(item.decisions).toEqual([{ ordinal: 1, recordedAt: expect.any(String),
      decision: { kind: 'eligibility', choice: 'deferred', bookTitle: null, reason: null, reasonHasMore: false, notUsed: true } }]);
    expect(ledger.referable(bookA)).toEqual([]);
    expect(ledger.available(id, bookA)).toBe(false);
    expect(() => ledger.decide(id, 1, notUsed)).toThrow(ALREADY);
    expect(() => ledger.decide(id, 1, eligibility('house'))).toThrow('先定归属，再定学习准入。');
    expect(() => ledger.decide(id, 0, house)).toThrow(MOVED);
  });

  it('takes an available item out of every Task and 待我处理, and reads every order of the records after it', async () => {
    const id = await arrive('本社资料');
    decide(id, house);
    expect(waiting()).toEqual([`${id}:learning-eligibility-pending`]);
    expect(decide(id, eligibility('house')).reference).toEqual({ state: 'available', scope: 'house' });
    expect(ledger.available(id, bookA)).toBe(true);

    let item = decide(id, notUsed);
    expect([waiting(), ledger.available(id, bookA), ledger.referable(bookA), item.reference, item.notUsed !== undefined, item.eligibility?.choice])
      .toEqual([[], false, [], { state: 'pending' }, true, 'deferred']);
    // Once it stands, asking again is refused in plain words.
    expect(() => ledger.decide(id, item.decisionCount, notUsed)).toThrow(ALREADY);
    // The same attribution again brings the item back to its eligibility, which waits as it does after any attribution.
    item = decide(id, house);
    expect([item.notUsed, item.eligibility, item.eligibilityReset, waiting()]).toEqual([undefined, null, true, [`${id}:learning-eligibility-pending`]]);
    expect(decide(id, eligibility('house')).reference).toEqual({ state: 'available', scope: 'house' });
    decide(id, book(bookA));
    expect(waiting()).toEqual([`${id}:learning-eligibility-pending`]);
    expect(decide(id, eligibility('book')).reference).toEqual({ state: 'available', scope: 'book', bookTitle: '甲书' });
    expect([ledger.available(id, bookA), ledger.available(id, bookB)]).toEqual([true, false]);
    // Chosen again after each of these.
    item = decide(id, notUsed);
    expect([item.attribution?.scope, waiting(), ledger.available(id, bookA)]).toEqual(['book', [], false]);
    // An eligibility request is still the editor's: 稍后决定 brings the item back to waiting, a decided one makes it available.
    item = decide(id, eligibility('deferred'));
    expect([item.notUsed, waiting()]).toEqual([undefined, [`${id}:learning-eligibility-deferred`]]);
    decide(id, notUsed);
    expect(waiting()).toEqual([]);
    item = decide(id, eligibility('book'));
    expect([item.notUsed, item.eligibility?.choice, waiting(), ledger.available(id, bookA)]).toEqual([undefined, 'book', [], true]);
    expect(item.decisionCount).toBe(11);
  });

  it('takes an item left for later out of 待我处理, and one that is left for later without it stays there', async () => {
    const id = await arrive('稍后再说');
    decide(id, book(bookA));
    decide(id, eligibility('deferred'));
    expect(waiting()).toEqual([`${id}:learning-eligibility-deferred`]);
    expect(ledger.item(id).notUsed).toBeUndefined();
    const another = await arrive('只有稍后');
    decide(another, house);
    decide(another, eligibility('deferred'));
    const item = decide(id, notUsed);
    expect([waiting(), item.notUsed !== undefined]).toEqual([[`${another}:learning-eligibility-deferred`], true]);
    // A plain 稍后决定 is still refused as unchanged where it stands alone, and is not read as 暂不使用.
    expect(() => ledger.decide(another, 2, eligibility('deferred'))).toThrow('学习准入没有变化。');
    expect(ledger.item(another).notUsed).toBeUndefined();
  });

  it('refuses a request on a stale count, and a fresh reader of the same rows reads the same', async () => {
    const id = await arrive('过期计数');
    decide(id, house);
    ledger.decide(id, 1, notUsed);
    // A second window still holding the count of one.
    expect(() => ledger.decide(id, 1, notUsed)).toThrow(MOVED);
    expect(() => ledger.decide(id, 1, house)).toThrow(MOVED);
    expect(ledger.item(id).decisionCount).toBe(2);
    const reopened = new LibraryMaterialLedger(db, roots.dataRoot);
    expect(reopened.item(id)).toEqual(ledger.item(id));
    expect(reopened.attentionReadings(10)).toEqual([]);
  });

  it('is read by a build that knows no marker as 稍后决定, or as unattributed, and never as available', async () => {
    const attributed = await arrive('带归属');
    const unattributed = await arrive('无归属');
    decide(attributed, house);
    decide(attributed, eligibility('house'));
    decide(attributed, notUsed);
    decide(unattributed, notUsed);
    expect(readAsRelease073(attributed)).toEqual({ attribution: 1, eligibility: 'deferred', available: false });
    expect(readAsRelease073(unattributed)).toEqual({ attribution: null, eligibility: null, available: false });
    // Then every later order of a build that knows it: another attribution and a decided eligibility under it.
    decide(unattributed, book(bookB));
    decide(unattributed, eligibility('book'));
    expect(readAsRelease073(unattributed)).toEqual({ attribution: 2, eligibility: 'book', available: true });
    expect(ledger.available(unattributed, bookB)).toBe(true);
    decide(unattributed, notUsed);
    decide(unattributed, book(bookB));
    expect(readAsRelease073(unattributed)).toEqual({ attribution: 5, eligibility: null, available: false });
  });

  it('is one appended record of a kind the table allows, and nothing is updated', async () => {
    const id = await arrive('追加一行');
    decide(id, house);
    decide(id, notUsed);
    const rows = db.prepare('SELECT ordinal, kind, book_id, canonical_json FROM library_material_decisions WHERE material_id = ? ORDER BY ordinal').all(id);
    expect(rows.map((row) => [row.ordinal, row.kind, row.book_id])).toEqual([[1, 'attribution', null], [2, 'eligibility', null]]);
    expect(JSON.parse(String(rows[1]!.canonical_json))).toMatchObject({ choice: 'deferred', reason: null, notUsed: true, attributionOrdinal: 1 });
    expect(() => db.exec('UPDATE library_material_decisions SET kind = \'attribution\'')).toThrow();
  });
});

describe('暂不使用 over the real store', () => {
  it('leaves 待我处理 and its count, and survives a reopen', async () => {
    const attentionCount = (store: EditorialStore): number => store.inspectGlobalAttention(() => null, false).groups
      .flatMap((group) => group.items).filter((item) => item.object.kind === 'library-material').length;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let materialId: string;
    let count: number;
    try {
      const preview = await store.previewLibraryMaterial(input('real-store'));
      const added = await store.addLibraryMaterial({ previewId: preview.previewId, title: '暂不使用的资料', kind: 'document' });
      materialId = added.materialId;
      const left = store.decideLibraryMaterial({ materialId, expectedDecisions: added.decisionCount, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      expect([left.notUsed, attentionCount(store)]).toEqual([undefined, 1]);
      const used = store.decideLibraryMaterial({ materialId, expectedDecisions: left.decisionCount, decision: { kind: 'not-used' } });
      expect([used.notUsed !== undefined, attentionCount(store)]).toEqual([true, 0]);
      count = used.decisionCount;
      try {
        store.decideLibraryMaterial({ materialId, expectedDecisions: left.decisionCount, decision: { kind: 'not-used' } });
        expect.unreachable();
      } catch (error) {
        expect(error instanceof StoreError && error.message).toBe(MOVED);
      }
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectLibraryMaterial(materialId).decisionCount).toBe(count);
      expect([reopened.inspectLibraryMaterial(materialId).notUsed !== undefined, attentionCount(reopened)]).toEqual([true, 0]);
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
  }, 120_000);
});
