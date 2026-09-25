import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOOK_PEOPLE_ROLE_LISTS, BOOK_PEOPLE_TRIGGER_SQL, BUILTIN_BOOK_PEOPLE_ROLES } from '../../src/service/book-people.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { REVIEW_GUIDELINE_SCHEMA_VERSION, MAINTENANCE_CASE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 作者 · 责编 · 相关人 (Issue #431, plan slice S83; V2-UX-BOOK-006) over the real
// `EditorialStore` on a temporary Agent Data Root. The manuscripts are composed from the one admitted SampleBook under
// titles authored here; every name is an authored stand-in.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

async function importBook(store: EditorialStore, excerpt: ComposedManuscriptRequest): Promise<string> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, excerpt);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: excerpt.title }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.bookId;
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

const FIRST: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '人员之书甲' };
const SECOND: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 20, blocks: 6, title: '人员之书乙' };

describe('作者 · 责编 · 相关人 (S83)', () => {
  it('records a Book\'s people as versions, lists them on the card, and finds a Book by 书名, 作者 or 责编', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let first: string;
    let before: string;
    try {
      first = await importBook(store, FIRST);
      const second = await importBook(store, SECOND);
      // Nothing yet: version 0, and the house's role list for the form.
      const empty = store.getBookOverview(first).people;
      expect(empty).toEqual({
        version: 0, authors: [], editors: [], related: [], recordedAt: null,
        roles: [
          { roleId: 'proofreader', label: '校对' }, { roleId: 'designer', label: '美编' }, { roleId: 'translator', label: '译者' },
          { roleId: 'external-reviewer', label: '外审专家' }, { roleId: 'agent', label: '作者经纪' }, { roleId: 'marketing', label: '营销' },
          { roleId: 'other', label: '其他' },
        ],
      });
      expect(empty.roles.map((role) => role.roleId)).toEqual(BUILTIN_BOOK_PEOPLE_ROLES.roles.map((role) => role.roleId));
      const update = (bookId: string, expectedVersion: number, authors: string[], editors: string[], related: Array<{ roleId: string; name: string }> = []) =>
        store.updateBookPeople({ bookId, expectedVersion, authors, editors, related });

      // What a set needs: names within their bound, no separator inside a name, no repeat, roles of the house's list.
      expect(code(() => update(first, 0, ['周一、吴二'], []))).toBe('BOOK_PEOPLE_NAME_INVALID');
      expect(code(() => update(first, 0, ['   '], []))).toBe('BOOK_PEOPLE_NAME_INVALID');
      expect(code(() => update(first, 0, ['名'.repeat(41)], []))).toBe('BOOK_PEOPLE_NAME_INVALID');
      expect(code(() => update(first, 0, ['周一', '周一'], []))).toBe('BOOK_PEOPLE_DUPLICATE');
      expect(code(() => update(first, 0, Array.from({ length: 11 }, (_, index) => `作者${index}`), []))).toBe('BOOK_PEOPLE_INVALID');
      expect(code(() => update(first, 0, [], [], [{ roleId: 'photographer', name: '王四' }]))).toBe('BOOK_PEOPLE_ROLE_INVALID');
      expect(code(() => update(first, 0, [], [], [{ roleId: 'proofreader', name: '王四' }, { roleId: 'proofreader', name: '王四' }]))).toBe('BOOK_PEOPLE_DUPLICATE');
      expect(code(() => update(randomUUID(), 0, ['周一'], []))).toBe('BOOK_NOT_FOUND');
      expect(code(() => update(first, 1, ['周一'], []))).toBe('BOOK_PEOPLE_CHANGED');
      // No one, before anyone was saved, is the set as it stands: nothing is recorded.
      expect(update(first, 0, [], [], [])).toMatchObject({ outcome: 'unchanged', completionLabel: '人员没有变化', people: { version: 0, recordedAt: null } });

      const saved = update(first, 0, [' 周一 ', '吴二'], ['郑三'], [{ roleId: 'proofreader', name: '王四' }, { roleId: 'designer', name: '冯五' }]);
      expect([saved.outcome, saved.completionLabel, saved.people.version]).toEqual(['recorded', '人员已保存', 1]);
      expect(saved.people).toMatchObject({
        authors: ['周一', '吴二'], editors: ['郑三'],
        related: [{ roleId: 'proofreader', roleLabel: '校对', name: '王四' }, { roleId: 'designer', roleLabel: '美编', name: '冯五' }],
      });
      expect(store.getBookOverview(first).people).toEqual(saved.people);
      // The same set again records nothing and says so.
      expect(update(first, 1, ['周一', '吴二'], ['郑三'], [{ roleId: 'proofreader', name: '王四' }, { roleId: 'designer', name: '冯五' }]))
        .toMatchObject({ outcome: 'unchanged', completionLabel: '人员没有变化', people: { version: 1 } });

      // 书库's card and its search, over the Book's newest version.
      const titles = (filter?: { field: 'all' | 'title' | 'author' | 'editor'; text: string }) =>
        store.listBooks(null, filter ?? null).items.map((item) => item.title);
      const card = store.listBooks(null).items.find((item) => item.bookId === first)!;
      expect(card.people).toEqual({ authors: ['周一', '吴二'], editors: ['郑三'], related: [{ roleLabel: '校对', name: '王四' }, { roleLabel: '美编', name: '冯五' }] });
      expect(store.listBooks(null).items.find((item) => item.bookId === second)!.people).toEqual({ authors: [], editors: [], related: [] });
      expect(titles()).toEqual(['人员之书乙', '人员之书甲']);
      expect(titles({ field: 'author', text: '吴二' })).toEqual(['人员之书甲']);
      expect(titles({ field: 'editor', text: '郑三' })).toEqual(['人员之书甲']);
      expect(titles({ field: 'editor', text: '吴二' })).toEqual([]);
      expect(titles({ field: 'title', text: '乙' })).toEqual(['人员之书乙']);
      expect(titles({ field: 'all', text: '郑' })).toEqual(['人员之书甲']);
      expect(titles({ field: 'all', text: '人员之书' })).toEqual(['人员之书乙', '人员之书甲']);
      expect(code(() => store.listBooks(null, { field: 'author', text: '  ' }))).toBe('BOOK_SUMMARY_FILTER_INVALID');
      expect(code(() => store.listBooks(null, { field: 'series' as 'all', text: '书系' }))).toBe('BOOK_SUMMARY_FILTER_INVALID');
      // Names are held one to a line: words across a break never find 周一 and 吴二 as one name.
      expect(code(() => store.listBooks(null, { field: 'author', text: '一\n吴' }))).toBe('BOOK_SUMMARY_FILTER_INVALID');

      // A second version: the search follows the newest one only.
      const moved = update(first, 1, ['周一', '吴二'], ['陈六'], []);
      expect([moved.outcome, moved.people.version, moved.people.related]).toEqual(['recorded', 2, []]);
      expect(titles({ field: 'editor', text: '郑三' })).toEqual([]);
      expect(titles({ field: 'editor', text: '陈六' })).toEqual(['人员之书甲']);
      before = JSON.stringify([store.getBookOverview(first).people, store.listBooks(null)]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The versions are append-only, and a restart reads them exactly as they were.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(() => database.prepare("UPDATE book_people_versions SET authors_text = '改'").run()).toThrow(/BOOK_PEOPLE_LEDGER_IMMUTABLE/);
      expect(() => database.prepare('DELETE FROM book_people_versions').run()).toThrow(/BOOK_PEOPLE_LEDGER_IMMUTABLE/);
      expect((database.prepare('SELECT count(*) count FROM book_people_versions').get() as { count: number }).count).toBe(2);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.stringify([reopened.getBookOverview(first!).people, reopened.listBooks(null)])).toBe(before!);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('pages a found list the way it pages the whole one, and refuses a people version altered by hand', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const created: string[] = [];
    try {
      // Twenty-two empty Books: twenty-one by one 作者 — more than a page — and one by another.
      for (let index = 1; index <= 22; index += 1) {
        const creation = store.prepareBookCreation(`分页之书${String(index).padStart(2, '0')}`, null);
        const bookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
        store.updateBookPeople({ bookId, expectedVersion: 0, authors: [index === 22 ? '另一作者' : '同一作者'], editors: [], related: [] });
        created.push(bookId);
      }
      const filter = { field: 'author', text: '同一' } as const;
      const page = store.listBooks(null, filter);
      expect([page.items.length, page.nextCursor === null]).toEqual([20, false]);
      const rest = store.listBooks(page.nextCursor, filter);
      expect([rest.items.map((item) => item.title), rest.nextCursor]).toEqual([['分页之书21'], null]);
      expect([...page.items, ...rest.items].map((item) => item.bookId)).toEqual(created.slice(0, 21));
      expect(store.listBooks(null, { field: 'author', text: '另一' }).items.map((item) => item.bookId)).toEqual([created[21]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A version whose names no longer match its record is refused wherever it is read.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec(`BEGIN IMMEDIATE;
        DROP TRIGGER book_people_versions_no_update;
        UPDATE book_people_versions SET authors_text = '改过的作者' WHERE book_id = '${created[0]}';
        ${BOOK_PEOPLE_TRIGGER_SQL['book_people_versions_no_update']};
        COMMIT;`);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(code(() => reopened.getBookOverview(created[0]!))).toBe('BOOK_PEOPLE_RECORD_INVALID');
      expect(code(() => reopened.listBooks(null))).toBe('BOOK_PEOPLE_RECORD_INVALID');
      expect(reopened.getBookOverview(created[1]!).people.authors).toEqual(['同一作者']);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('adds the people relation to a revision-43 store empty', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      bookId = await importBook(store, FIRST);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    try {
      planted.exec(`BEGIN IMMEDIATE;
        DROP TABLE review_guideline_versions;
        DROP TABLE book_people_versions;
        PRAGMA user_version = ${MAINTENANCE_CASE_SCHEMA_VERSION};
        COMMIT;`);
    } finally {
      planted.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.getBookOverview(bookId!).people.version).toBe(0);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(REVIEW_GUIDELINE_SCHEMA_VERSION);
      expect((after.prepare('SELECT count(*) count FROM book_people_versions').get() as { count: number }).count).toBe(0);
    } finally {
      after.close();
    }
  }, 120_000);

  it('reads every version under the role list it was saved with, whatever list a later release ships', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookId = await importBook(store, FIRST);
      store.updateBookPeople({ bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [{ roleId: 'proofreader', name: '王四' }] });
      const card = JSON.stringify(store.listBooks(null).items.find((item) => item.bookId === bookId)!.people);
      // A later release ships a second list: a role added, 校对 named otherwise.
      BOOK_PEOPLE_ROLE_LISTS.push({
        schema: 'ai7.book-people-roles/1',
        version: '2',
        roles: [...BUILTIN_BOOK_PEOPLE_ROLES.roles.map((role) => (role.roleId === 'proofreader' ? { roleId: role.roleId, label: '校对人' } : role)),
          { roleId: 'indexer', label: '索引编制' }],
      });
      try {
        // The version saved under the first list still reads, in its own list's words, and 书库 still lists the Book.
        const people = store.getBookOverview(bookId).people;
        expect([people.version, people.related, people.roles.at(-1)]).toEqual([1, [{ roleId: 'proofreader', roleLabel: '校对', name: '王四' }], { roleId: 'indexer', label: '索引编制' }]);
        expect(JSON.stringify(store.listBooks(null).items.find((item) => item.bookId === bookId)!.people)).toBe(card);
        // A save now pins the second list, and the Book reads both versions under their own lists.
        const saved = store.updateBookPeople({ bookId, expectedVersion: 1, authors: ['周一'], editors: ['郑三'], related: [{ roleId: 'indexer', name: '陈六' }] });
        expect([saved.outcome, saved.people.version, saved.people.related]).toEqual(['recorded', 2, [{ roleId: 'indexer', roleLabel: '索引编制', name: '陈六' }]]);
        const pins = (() => {
          const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
          try {
            return database.prepare('SELECT role_configuration_version AS version FROM book_people_versions WHERE book_id = ? ORDER BY version').all(bookId);
          } finally {
            database.close();
          }
        })();
        expect(pins).toEqual([{ version: '1' }, { version: '2' }]);
        store.markCleanShutdown();
      } finally {
        BOOK_PEOPLE_ROLE_LISTS.pop();
      }
      // A list this build never shipped — a store a newer build wrote — still reads, its roles named by their ids.
      expect(store.getBookOverview(bookId).people.related).toEqual([{ roleId: 'indexer', roleLabel: 'indexer', name: '陈六' }]);
      expect(store.listBooks(null).items.find((item) => item.bookId === bookId)!.people.related).toEqual([{ roleLabel: 'indexer', name: '陈六' }]);
    } finally {
      store.close();
    }
  }, 180_000);
});
