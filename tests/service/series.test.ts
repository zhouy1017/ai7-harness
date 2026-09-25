import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERIES_SCHEMA_SQL, SERIES_TRIGGER_SQL, SeriesError, SeriesLedger, initializeSeriesSchema, seriesMembershipImpact } from '../../src/service/series.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { EVALUATION_CALIBRATION_SCHEMA_VERSION, DATABASE_EXPORT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { SeriesImpactGroupProjection, SeriesProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 书系 › 成员与共享范围 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012; ADR 0002,
// ADR 0036) over the real store: 新建书系, the four-part Series Membership Impact Preview, 加入书系 and 移出书系 against the
// exact preview, a stale preview refused, the change records on both sides, 书库's search by 书系, the 书系一致性 category's
// reason for a member Book, the ledger across a restart refusing to be rewritten, and revision 52 added to a revision-51
// store. Every Book is empty and every name is the suite's own.

const SERIES_TABLES = Object.keys(SERIES_SCHEMA_SQL);

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-');
});

afterEach(async () => {
  await roots.dispose();
});

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function counts(): Record<string, number> {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return Object.fromEntries(SERIES_TABLES.map((table) => [table, (database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count]));
  } finally {
    database.close();
  }
}

/** The groups as their keys, titles and lines: what the editor reads. */
function groupsOf(groups: ReadonlyArray<SeriesImpactGroupProjection>): unknown[] {
  return groups.map((group) => [group.key, group.title, group.changes, group.unchanged]);
}

/** Members and candidates by title, and the history as change and Book, newest first. */
function pageOf(series: SeriesProjection): { members: unknown[]; candidates: string[]; history: unknown[] } {
  return {
    members: series.members.map((member) => [member.title, member.seriesConsistencyReview]),
    candidates: series.candidates.map((candidate) => candidate.title),
    history: series.history.map((change) => [change.label, change.bookTitle, change.priorMember, change.newMember]),
  };
}

const ADD_GROUPS = (book: string, series: string): unknown[] => [
  ['future-tasks', '未来任务', [`以后新建任务时，可以明确选用书系「${series}」的范围，其中会包括《${book}》。`],
    [`不会把《${book}》自动加进任何任务，也不会因此授权运行、让其他图书读到它的原文或发给模型服务。`]],
  ['runs', '已授权或正在运行', [], [`现在没有使用书系「${series}」范围、已授权或正在运行的任务。`, '已授权或正在运行的任务按各自冻结的范围继续，计划不会被改动。']],
  ['knowledge-learning', '书系知识与学习', [], [`《${book}》还没有学习材料。`, '书系知识、学习准入和学习记录各有自己的决定；加入书系不会纳入、启用或删除它们。']],
  ['history', '历史记录', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], ['已完成的任务、结果、决定和以前的记录都保持原样。']],
];

describe('书系 over the real store', () => {
  it('creates a Series, previews and records 加入书系 and 移出书系 against the exact preview, and shows each record on both sides', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.inspectSeriesList()).toEqual({ series: [] });
      // 新建书系: a name on one line within its bound, not a name the house already has however it is spaced or cased.
      for (const [title, note, expected] of [
        ['', '', 'SERIES_TITLE_INVALID:书系名称要 1–40 个字，写在一行里。'],
        ['   ', '', 'SERIES_TITLE_INVALID:书系名称要 1–40 个字，写在一行里。'],
        ['星'.repeat(41), '', 'SERIES_TITLE_INVALID:书系名称要 1–40 个字，写在一行里。'],
        ['星河\n三部曲', '', 'SERIES_TITLE_INVALID:书系名称要 1–40 个字，写在一行里。'],
        ['星河三部曲', '说'.repeat(501), 'SERIES_NOTE_INVALID:说明最多 500 个字。'],
      ] as const) {
        expect(refusal(() => store.createSeries({ title, note }))).toBe(expected);
      }
      const created = store.createSeries({ title: '  星河三部曲 ', note: '同一个宇宙里的三部长篇。' });
      expect([created.completionLabel, created.list.series.map((entry) => [entry.title, entry.note, entry.memberCount])])
        .toEqual(['已新建书系「星河三部曲」', [['星河三部曲', '同一个宇宙里的三部长篇。', 0]]]);
      expect(refusal(() => store.createSeries({ title: '星河 三部曲', note: '' }))).toBe('SERIES_TITLE_TAKEN:已经有名为「星河 三部曲」的书系了。');
      expect(refusal(() => store.createSeries({ title: '星'.repeat(40), note: '' }))).toBe('no-error');
      const seriesId = created.seriesId;

      const first = emptyBook(store, '星河之一');
      const second = emptyBook(store, '星河之二');
      expect(pageOf(store.inspectSeries(seriesId))).toEqual({ members: [], candidates: ['星河之一', '星河之二'], history: [] });
      expect(refusal(() => store.inspectSeries('series'))).toBe('SERIES_INVALID:书系标识无效。');
      expect(refusal(() => store.inspectSeries(randomUUID()))).toBe('SERIES_NOT_FOUND:书系不存在。');

      // The preview names the exact Book and Series and its four groups, and records nothing.
      const preview = store.previewSeriesMembershipChange({ seriesId, bookId: first, kind: 'add' });
      expect([preview.bookTitle, preview.seriesTitle, preview.actionLabel, groupsOf(preview.groups)])
        .toEqual(['星河之一', '星河三部曲', '加入书系', ADD_GROUPS('星河之一', '星河三部曲')]);
      expect(preview.previewDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(store.previewSeriesMembershipChange({ seriesId, bookId: first, kind: 'add' }).previewDigest).toBe(preview.previewDigest);
      expect(refusal(() => store.previewSeriesMembershipChange({ seriesId, bookId: first, kind: 'remove' }))).toBe('SERIES_MEMBER_ABSENT:《星河之一》不在书系「星河三部曲」中。');
      expect(refusal(() => store.previewSeriesMembershipChange({ seriesId, bookId: randomUUID(), kind: 'add' }))).toBe('BOOK_NOT_FOUND:图书不存在。');
      expect(counts()).toEqual({ series: 2, series_membership_changes: 0 });

      // 加入书系 against the preview: the record keeps what it showed, and both sides list it.
      const added = store.changeSeriesMembership({ seriesId, bookId: first, kind: 'add', previewDigest: preview.previewDigest });
      expect(added.completionLabel).toBe('已加入书系「星河三部曲」：《星河之一》');
      expect(pageOf(added.series)).toEqual({ members: [['星河之一', null]], candidates: ['星河之二'], history: [['加入书系', '星河之一', false, true]] });
      expect(added.series.history[0]!.impact).toEqual(preview.groups);
      const firstSide = store.inspectBookSeries(first);
      expect([firstSide.memberships.map((entry) => entry.title), firstSide.history.map((change) => [change.label, change.seriesTitle, change.changeId])])
        .toEqual([['星河三部曲'], [['加入书系', '星河三部曲', added.changeId]]]);
      expect(store.inspectBookSeries(second)).toEqual({ bookId: second, memberships: [], history: [], historyTruncated: false });
      expect(refusal(() => store.previewSeriesMembershipChange({ seriesId, bookId: first, kind: 'add' }))).toBe('SERIES_MEMBER_ALREADY:《星河之一》已经在书系「星河三部曲」中。');
      expect(refusal(() => store.changeSeriesMembership({ seriesId, bookId: first, kind: 'add', previewDigest: preview.previewDigest })))
        .toBe('SERIES_MEMBER_ALREADY:《星河之一》已经在书系「星河三部曲」中。');
      expect(store.inspectSeriesList().series.map((entry) => [entry.title, entry.memberCount])).toEqual([['星'.repeat(40), 0], ['星河三部曲', 1]]);

      // A preview the chain moved past is refused and records nothing; the preview read again goes through.
      const stale = store.previewSeriesMembershipChange({ seriesId, bookId: second, kind: 'add' });
      const around = store.previewSeriesMembershipChange({ seriesId, bookId: second, kind: 'add' });
      store.changeSeriesMembership({ seriesId, bookId: second, kind: 'add', previewDigest: around.previewDigest });
      const back = store.previewSeriesMembershipChange({ seriesId, bookId: second, kind: 'remove' });
      store.changeSeriesMembership({ seriesId, bookId: second, kind: 'remove', previewDigest: back.previewDigest });
      expect(refusal(() => store.changeSeriesMembership({ seriesId, bookId: second, kind: 'add', previewDigest: stale.previewDigest })))
        .toBe('SERIES_PREVIEW_STALE:预览之后，书系成员或相关记录有了变化；请重新查看影响，再决定。');
      expect(counts()).toEqual({ series: 2, series_membership_changes: 3 });
      const fresh = store.previewSeriesMembershipChange({ seriesId, bookId: second, kind: 'add' });
      expect(fresh.previewDigest).not.toBe(stale.previewDigest);
      expect(groupsOf(fresh.groups)).toEqual(groupsOf(stale.groups));
      store.changeSeriesMembership({ seriesId, bookId: second, kind: 'add', previewDigest: fresh.previewDigest });

      // 书库 finds the members by 书系, alone or among every field.
      const found = (field: 'series' | 'all' | 'title', text: string): string[] => store.listBooks(null, { field, text }).items.map((item) => item.title);
      expect([found('series', '星河'), found('all', '三部曲'), found('title', '三部曲')]).toEqual([['星河之一', '星河之二'], ['星河之一', '星河之二'], []]);

      // 书系一致性 still waits, and says the Book is in the Series.
      const category = (bookId: string): unknown => store.inspectReviewWorkspace(bookId, null).categories
        .filter((entry) => entry.categoryId === 'series-consistency').map((entry) => [entry.available, entry.unavailableReason]);
      expect(category(first)).toEqual([[false, '这本书已在书系「星河三部曲」中；书系知识接入审阅后才能选。']]);
      const outside = emptyBook(store, '书系之外');
      expect(category(outside)).toEqual([[false, '这本书不在任何书系中，也还没有书系知识；加入书系后才能选。']]);

      // 移出书系: prospective, its own four groups, and the record on both sides; the Book's own history keeps both.
      const leave = store.previewSeriesMembershipChange({ seriesId, bookId: first, kind: 'remove' });
      expect([leave.actionLabel, groupsOf(leave.groups)]).toEqual(['移出书系', [
        ['future-tasks', '未来任务', ['以后新建任务时，书系「星河三部曲」的范围不再包括《星河之一》。'], ['《星河之一》自己的任务照旧。']],
        ['runs', '已授权或正在运行', [], ['现在没有使用书系「星河三部曲」范围、已授权或正在运行的任务。', '已经冻结的任务范围不会因移出而改变，任务也不会被取消。']],
        ['knowledge-learning', '书系知识与学习', [], ['《星河之一》还没有学习材料。', '书系知识、学习准入和学习记录各有自己的决定；移出书系不会删除或改动它们。']],
        ['history', '历史记录', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], ['《星河之一》和书系以前的记录都不会删除。']],
      ]]);
      const removed = store.changeSeriesMembership({ seriesId, bookId: first, kind: 'remove', previewDigest: leave.previewDigest });
      expect(removed.completionLabel).toBe('已移出书系「星河三部曲」：《星河之一》');
      expect(pageOf(removed.series)).toEqual({
        members: [['星河之二', null]],
        candidates: ['书系之外', '星河之一'],
        history: [['移出书系', '星河之一', true, false], ['加入书系', '星河之二', false, true], ['移出书系', '星河之二', true, false],
          ['加入书系', '星河之二', false, true], ['加入书系', '星河之一', false, true]],
      });
      expect(store.inspectBookSeries(first).history.map((change) => change.label)).toEqual(['移出书系', '加入书系']);
      expect(store.inspectBookSeries(first).memberships).toEqual([]);
      expect(found('series', '星河')).toEqual(['星河之二']);
      expect(category(first)).toEqual([[false, '这本书不在任何书系中，也还没有书系知识；加入书系后才能选。']]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every Series and record; the ledger refuses to be rewritten, and records rewritten by hand no longer read.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let seriesId: string;
    try {
      const series = reopened.inspectSeriesList().series.find((entry) => entry.title === '星河三部曲')!;
      seriesId = series.seriesId;
      expect(pageOf(reopened.inspectSeries(seriesId)).members).toEqual([['星河之二', null]]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      for (const table of SERIES_TABLES) {
        expect(() => database.exec(`UPDATE ${table} SET recorded_at = recorded_at`)).toThrowError(/SERIES_LEDGER_IMMUTABLE|no such column/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/SERIES_LEDGER_IMMUTABLE/u);
      }
      expect(() => database.exec("UPDATE series SET note = ''")).toThrowError(/SERIES_LEDGER_IMMUTABLE/u);
      // The first change of a pair is always 加入书系: a 移出书系 in its place is refused by the relation itself.
      const bookId = (database.prepare('SELECT book_id FROM books ORDER BY title LIMIT 1').get() as { book_id: string }).book_id;
      expect(() => database.prepare(`INSERT INTO series_membership_changes(change_id, series_id, book_id, ordinal, kind, preview_digest, supersedes_change_id, recorded_at, canonical_json, sha256)
        VALUES (?, ?, ?, 1, 'remove', ?, NULL, '2026-09-25T00:00:00.000Z', '{}', ?)`).run(randomUUID(), seriesId!, bookId, 'a'.repeat(64), 'b'.repeat(64))).toThrowError(/CHECK constraint failed/u);
      // A record whose shown impact is rewritten, with a digest that matches, no longer agrees with itself.
      database.exec('DROP TRIGGER series_membership_changes_no_update');
      const row = database.prepare("SELECT change_id, canonical_json FROM series_membership_changes WHERE kind = 'remove' ORDER BY recorded_at DESC LIMIT 1").get() as { change_id: string; canonical_json: string };
      const rewritten = row.canonical_json.replace('"history"', '"historyX"');
      expect(rewritten).not.toBe(row.canonical_json);
      database.prepare('UPDATE series_membership_changes SET canonical_json = ?, sha256 = ? WHERE change_id = ?')
        .run(rewritten, createHash('sha256').update(rewritten).digest('hex'), row.change_id);
      database.exec(SERIES_TRIGGER_SQL.series_membership_changes_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectSeries(seriesId!))).toBe('SERIES_RECORD_INVALID:书系记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 180_000);

  it('keeps a chain that alternates 加入书系 and 移出书系, whoever calls the ledger', () => {
    // The ledger alone, over the one relation it references, as a second guard behind the store's preview.
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT;');
      initializeSeriesSchema(database);
      initializeSeriesSchema(database);
      const ledger = new SeriesLedger(database);
      const bookId = randomUUID();
      database.prepare('INSERT INTO books(book_id) VALUES (?)').run(bookId);
      const series = ledger.create({ title: '晨光文丛', note: '' });
      const names = { book: '晨光之书', series: '晨光文丛' };
      const facts = { seriesTitle: names.series, bookTitle: names.book, seriesScopedRuns: 0, learningMaterials: 0, learningDecided: 0 };
      const change = (kind: 'add' | 'remove', impact = seriesMembershipImpact(kind, facts), previewDigest = 'd'.repeat(64)): string => {
        try {
          ledger.record({ seriesId: series.seriesId, bookId, kind, previewDigest, impact, names });
        } catch (error) {
          if (error instanceof SeriesError) return `${error.code}:${error.message}`;
          throw error;
        }
        return 'recorded';
      };
      expect(change('remove')).toBe('SERIES_MEMBER_ABSENT:《晨光之书》不在书系「晨光文丛」中。');
      // A change carries the four groups its preview showed and that preview's digest, or it is no change at all.
      expect(change('add', [])).toBe('SERIES_CHANGE_INVALID:书系成员变更无效。');
      expect(change('add', seriesMembershipImpact('add', facts).slice(0, 3))).toBe('SERIES_CHANGE_INVALID:书系成员变更无效。');
      expect(change('add', undefined, 'D'.repeat(64))).toBe('SERIES_CHANGE_INVALID:书系成员变更无效。');
      expect(change('add')).toBe('recorded');
      expect(change('add')).toBe('SERIES_MEMBER_ALREADY:《晨光之书》已经在书系「晨光文丛」中。');
      expect(change('remove')).toBe('recorded');
      expect(ledger.chain(series.seriesId, bookId).map((entry) => [entry.ordinal, entry.kind])).toEqual([[1, 'add'], [2, 'remove']]);
      expect(ledger.members(series.seriesId)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('refuses a Series whose name was rewritten by hand', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      store.createSeries({ title: '晨光文丛', note: '' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      database.exec('DROP TRIGGER series_no_update');
      database.exec("UPDATE series SET title = '暮色文丛', title_key = '暮色文丛'");
      database.exec(SERIES_TRIGGER_SQL.series_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectSeriesList())).toBe('SERIES_RECORD_INVALID:书系记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 120_000);

  it('adds revision 52 to a revision-51 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      emptyBook(first, '早先的图书');
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const schemaOf = (database: DatabaseSync): Array<{ name: string; sql: string }> =>
      database.prepare("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'trigger', 'index') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const plant = new DatabaseSync(databasePath());
    let before: Array<{ name: string; sql: string }>;
    try {
      plant.exec(`DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; DROP TABLE series_knowledge_promotions; DROP TABLE series_knowledge_revisions; DROP TABLE series_knowledge_candidates; DROP TABLE series_knowledge_items; DROP TABLE series_membership_changes; DROP TABLE series; PRAGMA user_version = ${EVALUATION_CALIBRATION_SCHEMA_VERSION};`);
      before = schemaOf(plant);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.inspectSeriesList()).toEqual({ series: [] });
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      const after = schemaOf(database);
      expect(after.filter((entry) => !/^(series|store_versions|database_export_)/u.test(entry.name))).toEqual(before!);
      expect(after.filter((entry) => SERIES_TABLES.includes(entry.name)).map((entry) => entry.sql))
        .toEqual(SERIES_TABLES.slice().sort().map((table) => SERIES_SCHEMA_SQL[table as keyof typeof SERIES_SCHEMA_SQL]));
      expect(counts()).toEqual({ series: 0, series_membership_changes: 0 });
    } finally {
      database.close();
    }
  }, 120_000);
});
