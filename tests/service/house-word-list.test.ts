import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  HouseWordLists, houseWordListPin, initializeHouseWordListSchema, validateHouseWordListSnapshot, validateHouseWordListStore,
} from '../../src/service/review/house-word-list.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { validateSaveHouseWordListInput, type HouseWordListDraftEntry, type HouseWordListPin } from '../../src/shared/protocol/house-word-list.js';

// These are real isolated owner databases, not claims about the held EditorialStore migration/Run integration.
const entry = (literal: string): HouseWordListDraftEntry => ({ entryId: null, literal, note: '公开的合成词条说明', enabled: true });
const expected = (pin: HouseWordListPin) => ({ versionId: pin.versionId, digest: pin.digest });
function setup() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); initializeHouseWordListSchema(db);
  return { db, owner: new HouseWordLists(db) };
}
describe('immutable local House owner on disposable SQLite', () => {
  it('initializes its exact relation once without a global schema stamp or any seeded data', () => {
    const { db, owner } = setup();
    try {
      expect(owner.inspect()).toMatchObject({ current: null, selected: null, entries: [], history: [], nextEntryOffset: null, nextHistoryOffset: null });
      initializeHouseWordListSchema(db); expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([{ name: 'house_word_list_versions' }]);
    } finally { db.close(); }
  });
  it('appends expected-current versions, preserves edits/disable identities and distinguishes removal/re-addition', () => {
    const { db, owner } = setup();
    try {
      const a = owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('合成甲'), entry('合成乙')] });
      const original = owner.inspect().entries; const snapshot = owner.selectCurrent(a.pin);
      const bEntries = original.map((row, index) => index === 0 ? { ...row, note: '新的公开说明', enabled: false } : row);
      const b = owner.save({ expectedCurrent: expected(a.pin), sourceKind: 'editor-paste', entries: bEntries });
      expect(b).toMatchObject({ ordinal: 2, created: true, pin: { listId: a.pin.listId } });
      expect(owner.inspect().entries[0]?.entryId).toBe(original[0]!.entryId);
      expect(owner.inspect({ versionId: a.pin.versionId, entryOffset: 0, historyOffset: 0 }).entries).toEqual(original);
      expect(() => validateHouseWordListSnapshot(snapshot, a.pin)).not.toThrow();
      const noop = owner.save({ expectedCurrent: expected(b.pin), sourceKind: 'editor-entry', entries: bEntries });
      expect(noop).toEqual({ ...b, created: false });
      const c = owner.save({ expectedCurrent: expected(b.pin), sourceKind: 'editor-entry', entries: [bEntries[1]!] });
      expect(() => owner.save({ expectedCurrent: expected(c.pin), sourceKind: 'editor-entry', entries: original })).toThrow('不属于当前版本');
      const d = owner.save({ expectedCurrent: expected(c.pin), sourceKind: 'editor-entry', entries: [bEntries[1]!, entry('合成甲')] });
      expect(owner.inspect().entries[1]?.entryId).not.toBe(original[0]!.entryId);
      expect(owner.inspect().selected?.previous).toEqual(expected(c.pin)); expect(d.ordinal).toBe(4);
      expect(() => owner.save({ expectedCurrent: expected(d.pin), sourceKind: 'editor-entry', entries: [{ ...entry('外来'), entryId: randomUUID() }] })).toThrow();
      expect(() => db.prepare('UPDATE house_word_list_versions SET recorded_at = recorded_at').run()).toThrow('IMMUTABLE');
      expect(() => db.prepare('DELETE FROM house_word_list_versions').run()).toThrow('IMMUTABLE');
    } finally { db.close(); }
  });
  it('requires a current nonempty enabled selection but leaves historical snapshots independently valid', () => {
    const { db, owner } = setup(); const destination = setup();
    try {
      const a = owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('原词条')] }); const frozen = owner.selectCurrent(a.pin);
      const b = owner.save({ expectedCurrent: expected(a.pin), sourceKind: 'editor-entry', entries: [] });
      expect(() => owner.selectCurrent(a.pin)).toThrow('新版本'); expect(() => owner.selectCurrent(b.pin)).toThrow('没有启用词条');
      destination.owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('目的地词条')] });
      expect(() => validateHouseWordListSnapshot(frozen, a.pin)).not.toThrow();
      expect(() => destination.owner.selectCurrent(a.pin)).toThrow('新版本');
      expect(() => validateHouseWordListSnapshot({ ...frozen, entries: [] }, a.pin)).toThrow();
    } finally { db.close(); destination.db.close(); }
  });
  it('serializes two real connections, refuses a stale append and rolls back an enclosing transaction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai7-house-owner-')); const path = join(directory, 'owner.sqlite');
    const first = new DatabaseSync(path); const second = new DatabaseSync(path);
    try {
      initializeHouseWordListSchema(first); const a = new HouseWordLists(first); const b = new HouseWordLists(second);
      const initial = a.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('初版')] });
      const stale = b.inspect().current!;
      const next = a.save({ expectedCurrent: expected(initial.pin), sourceKind: 'editor-entry', entries: [entry('新版')] });
      expect(() => b.save({ expectedCurrent: expected(stale), sourceKind: 'editor-entry', entries: [entry('失效草稿')] })).toThrow('已有新版本');
      expect(b.inspect().selected?.ordinal).toBe(2);
      first.exec('BEGIN IMMEDIATE'); a.save({ expectedCurrent: expected(next.pin), sourceKind: 'editor-entry', entries: [entry('回滚版')] }); first.exec('ROLLBACK');
      expect(b.inspect().selected?.ordinal).toBe(2);
      expect(() => b.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [] })).toThrow('已有新版本');
    } finally { first.close(); second.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it('pages both entries and history at fifty and enforces direct-owner input and canonical byte bounds', () => {
    const { db, owner } = setup();
    try {
      let saved = owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: Array.from({ length: 53 }, (_, index) => entry(`词${index}`)) });
      const one = owner.inspect(); expect(one.entries).toHaveLength(50); expect(one.nextEntryOffset).toBe(50);
      expect(owner.inspect({ versionId: saved.pin.versionId, entryOffset: 50, historyOffset: 0 }).entries).toHaveLength(3);
      for (let index = 0; index < 51; index++) saved = owner.save({ expectedCurrent: expected(saved.pin), sourceKind: 'editor-entry', entries: [entry(`历史${index}`)] });
      const history = owner.inspect(); expect(history.history).toHaveLength(50); expect(history.nextHistoryOffset).toBe(50);
      expect(owner.inspect({ versionId: null, entryOffset: 0, historyOffset: 50 }).history).toHaveLength(2);
      expect(() => owner.inspect({ versionId: randomUUID(), entryOffset: 0, historyOffset: 0 })).toThrow('找不到');
      expect(() => owner.inspect({ versionId: null, entryOffset: 2, historyOffset: 0 })).toThrow('页码');
      expect(() => owner.save({ expectedCurrent: expected(saved.pin), sourceKind: 'editor-entry', entries: Array.from({ length: 501 }, (_, index) => entry(`词${index}`)) })).toThrow();
      // This input fits its draft bound, but canonical service-created UUIDs make the full document exceed it.
      const nearLimit = Array.from({ length: 500 }, (_, index) => ({ ...entry(`边界${index}`), note: '注'.repeat(60) }));
      expect(() => validateSaveHouseWordListInput({ expectedCurrent: expected(saved.pin), sourceKind: 'editor-entry', entries: nearLimit })).not.toThrow();
      expect(() => owner.save({ expectedCurrent: expected(saved.pin), sourceKind: 'editor-entry', entries: nearLimit })).toThrow();
      expect(owner.inspect().selected?.ordinal).toBe(52);
    } finally { db.close(); }
  });
  it('refuses missing immutable triggers and historical row/canonical/chain corruption instead of repairing it', () => {
    for (const damage of ['trigger', 'row', 'chain', 'canonical'] as const) {
      const { db, owner } = setup();
      try {
        const a = owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('甲')] });
        owner.save({ expectedCurrent: expected(a.pin), sourceKind: 'editor-entry', entries: [entry('乙')] });
        if (damage === 'trigger') db.exec('DROP TRIGGER house_word_list_versions_no_delete');
        else {
          db.exec('DROP TRIGGER house_word_list_versions_no_update');
          if (damage === 'row') db.prepare('UPDATE house_word_list_versions SET list_id = ? WHERE ordinal = 1').run(randomUUID());
          else if (damage === 'canonical') db.prepare("UPDATE house_word_list_versions SET canonical_json = canonical_json || ' ' WHERE ordinal = 1").run();
          else {
            const document = validateHouseWordListStoreAfterRestoringTrigger(db);
            const changed = { ...document, previous: { versionId: a.pin.versionId, digest: '0'.repeat(64) } };
            db.exec('PRAGMA foreign_keys = OFF');
            db.exec('DROP TRIGGER house_word_list_versions_no_update');
            db.prepare('UPDATE house_word_list_versions SET previous_sha256 = ?, canonical_json = ?, sha256 = ? WHERE ordinal = 2')
              .run('0'.repeat(64), canonicalJson(changed), sha256Hex(canonicalJson(changed)));
          }
          db.exec("CREATE TRIGGER house_word_list_versions_no_update BEFORE UPDATE ON house_word_list_versions BEGIN SELECT RAISE(ABORT, 'HOUSE_WORD_LIST_IMMUTABLE'); END");
        }
        expect(() => owner.inspect()).toThrow(); expect(() => initializeHouseWordListSchema(db)).toThrow();
      } finally { db.close(); }
    }
  });
});

function validateHouseWordListStoreAfterRestoringTrigger(db: DatabaseSync) {
  db.exec("CREATE TRIGGER house_word_list_versions_no_update BEFORE UPDATE ON house_word_list_versions BEGIN SELECT RAISE(ABORT, 'HOUSE_WORD_LIST_IMMUTABLE'); END");
  return validateHouseWordListStore(db)!;
}
