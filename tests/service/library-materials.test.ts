import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_OBJECT_DIRECTORY, identifyLibraryMaterialFormat } from '../../src/service/library-materials.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { EVALUATION_RECORD_SCHEMA_VERSION, REVIEW_GUIDELINE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { GlobalAttentionItemProjection, LibraryMaterialProjection, LibraryMaterialsProjection } from '../../src/shared/protocol.js';
import { sample1Path } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, KB-002, ATTN-009,
// LEARN-004 to LEARN-007) over the real store on a temporary Agent Data Root. The collected item is exact `sample1` — an
// admitted Public SampleBook an editor keeps as a reference book — and the other files are the suite's own words, never a
// manuscript. An item arrives whole and decides nothing; the editor's attribution and Learning Eligibility decisions are
// appended to its chain, a later one superseding an earlier one; a Task may list it under 允许参考 only once both stand; and
// 待我处理 lists it in 等待你的决定 until they do. Schema revision 46 holds the arrival records and the chains.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-library-materials-');
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

function file(name: string, content: string | Uint8Array): string {
  const directory = join(roots.inputRoot, 'library');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

function only(projection: LibraryMaterialsProjection): LibraryMaterialProjection {
  expect(projection.materials).toHaveLength(1);
  return projection.materials[0]!;
}

/** The 资料库 items 待我处理 lists, as its group, state, Book, object, next step and target. */
function attention(store: EditorialStore): Array<[string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]> {
  return store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items
    .filter((item) => item.object.kind === 'library-material')
    .map((item) => [group.key, item.state, item.book.title, item.object, item.nextStep, item.target] as [string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]));
}

function keptObjects(): string[] {
  const root = join(roots.dataRoot, LIBRARY_OBJECT_DIRECTORY);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

describe('知识库 › 资料库 over the real store', () => {
  it('keeps a collected book whole, decides nothing for the editor, and appends each decision the editor makes', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookA = emptyBook(store, '资料库之书甲');
      emptyBook(store, '资料库之书乙');
      const source = sample1Path(roots.codeRoot);
      const bytes = readFileSync(source);
      const digest = createHash('sha256').update(bytes).digest('hex');

      // 放入资料…: the file as it would arrive — its format from its content, its size and digest, a title from its name —
      // and nothing kept yet.
      const preview = await store.previewLibraryMaterial(source);
      expect(preview.source).toEqual({ displayName: 'sample1.docx', format: 'DOCX', bytes: bytes.length, sha256: digest });
      expect([preview.suggestedTitle, preview.suggestedKind]).toEqual(['sample1', null]);
      expect(store.inspectLibraryMaterials().materials).toEqual([]);
      expect(keptObjects()).toEqual([]);

      // A title that cannot stand is refused before anything is copied.
      expect(await refusal(() => store.addLibraryMaterial({ previewId: preview.previewId, title: '  ', kind: 'book' })))
        .toBe('LIBRARY_MATERIAL_TITLE_EMPTY:请写下这份资料的标题。');
      expect(await refusal(() => store.addLibraryMaterial({ previewId: preview.previewId, title: '第一行\n第二行', kind: 'book' })))
        .toBe('LIBRARY_MATERIAL_TITLE_INVALID:标题只能是一行文字。');
      expect(keptObjects()).toEqual([]);

      // 放入资料库: the original kept byte for byte under its digest, the item named as the editor named it, and no attribution,
      // no eligibility and no 允许参考 until the editor decides them.
      const added = only(await store.addLibraryMaterial({ previewId: preview.previewId, title: ' 样书一 ', kind: 'book' }));
      expect(added).toMatchObject({
        title: '样书一', kind: 'book', source: preview.source, attribution: null, eligibility: null, eligibilityReset: false,
        reference: { state: 'pending' }, decisions: [],
      });
      expect(keptObjects()).toEqual([`${digest}.docx`]);
      expect(readFileSync(join(roots.dataRoot, LIBRARY_OBJECT_DIRECTORY, 'sha256', digest.slice(0, 2), `${digest}.docx`)).equals(bytes)).toBe(true);
      // The same file again is refused at once; a preview once used is gone.
      expect(await refusal(() => store.previewLibraryMaterial(source))).toBe('LIBRARY_MATERIAL_DUPLICATE:资料库里已经有这份文件：「样书一」。');
      expect(await refusal(() => store.addLibraryMaterial({ previewId: preview.previewId, title: '样书一', kind: 'book' })))
        .toBe('LIBRARY_MATERIAL_PREVIEW_EXPIRED:这次放入的预览已经失效；请重新选择文件。');

      // 待我处理 lists it in 等待你的决定 until it has an attribution; it names no Book yet.
      const target = { kind: 'library-material', materialId: added.materialId };
      expect(attention(store)).toEqual([
        ['decisions', 'library-attribution-pending', null, { kind: 'library-material', title: '样书一', materialKind: 'book', scope: 'none' }, 'set-library-attribution', target],
      ]);

      // Eligibility waits for an attribution; an attribution names a Book that exists.
      const decide = (expectedDecisions: number, decision: Parameters<EditorialStore['decideLibraryMaterial']>[0]['decision']) =>
        store.decideLibraryMaterial({ materialId: added.materialId, expectedDecisions, decision });
      expect(await refusal(() => decide(0, { kind: 'eligibility', choice: 'house', reason: null }))).toBe('LIBRARY_ATTRIBUTION_REQUIRED:先定归属，再定学习准入。');
      expect(await refusal(() => decide(0, { kind: 'attribution', attribution: { scope: 'book', bookId: '00000000-0000-4000-8000-000000000000' } })))
        .toBe('LIBRARY_MATERIAL_BOOK_NOT_FOUND:所选图书不存在。');

      // 定归属 to one Book: it now waits for its eligibility, under that Book.
      const attributed = only(decide(0, { kind: 'attribution', attribution: { scope: 'book', bookId: bookA } }));
      expect(attributed.attribution).toMatchObject({ scope: 'book', bookId: bookA, bookTitle: '资料库之书甲' });
      expect([attributed.eligibility, attributed.reference]).toEqual([null, { state: 'pending' }]);
      expect(attention(store)).toEqual([
        ['decisions', 'learning-eligibility-pending', '资料库之书甲', { kind: 'library-material', title: '样书一', materialKind: 'book', scope: 'book' }, 'set-learning-eligibility', target],
      ]);
      // A decision made on a chain that moved since it was read is refused, and one that changes nothing too.
      expect(await refusal(() => decide(0, { kind: 'attribution', attribution: { scope: 'house' } })))
        .toBe('LIBRARY_MATERIAL_MOVED:这份资料的归属或学习准入刚被改过；请看过现在的决定再定。');
      expect(await refusal(() => decide(1, { kind: 'attribution', attribution: { scope: 'book', bookId: bookA } }))).toBe('LIBRARY_ATTRIBUTION_UNCHANGED:归属没有变化。');

      // 稍后决定 is a choice of its own: nothing is eligible or excluded, 允许参考 still waits, and 待我处理 still lists it.
      const deferred = only(decide(1, { kind: 'eligibility', choice: 'deferred', reason: null }));
      expect([deferred.eligibility?.choice, deferred.reference]).toEqual(['deferred', { state: 'pending' }]);
      expect(attention(store).map(([group, state, book]) => [group, state, book])).toEqual([['decisions', 'learning-eligibility-deferred', '资料库之书甲']]);

      // 仅纳入 the Book, with the editor's note: the Book's Tasks may list it under 允许参考, and 待我处理 lets it go.
      const decided = only(decide(2, { kind: 'eligibility', choice: 'book', reason: '  责编确认可用于本书。  ' }));
      expect(decided.eligibility).toMatchObject({ choice: 'book', bookTitle: '资料库之书甲', reason: '责编确认可用于本书。' });
      expect(decided.reference).toEqual({ state: 'available', scope: 'book', bookTitle: '资料库之书甲' });
      expect(attention(store)).toEqual([]);
      expect(await refusal(() => decide(3, { kind: 'eligibility', choice: 'book', reason: '责编确认可用于本书。' }))).toBe('LEARNING_ELIGIBILITY_UNCHANGED:学习准入没有变化。');

      // Moved to the house: the eligibility decided for the Book is set aside, not carried over — the editor decides again, and
      // a Book's own scope is no longer there to choose.
      const moved = only(decide(3, { kind: 'attribution', attribution: { scope: 'house' } }));
      expect([moved.attribution?.scope, moved.eligibility, moved.eligibilityReset, moved.reference]).toEqual(['house', null, true, { state: 'pending' }]);
      expect(attention(store)).toEqual([
        ['decisions', 'learning-eligibility-pending', null, { kind: 'library-material', title: '样书一', materialKind: 'book', scope: 'house' }, 'set-learning-eligibility', target],
      ]);
      expect(await refusal(() => decide(4, { kind: 'eligibility', choice: 'book', reason: null }))).toBe('LEARNING_ELIGIBILITY_SCOPE:这份资料归属社级，没有可以只纳入的那本书。');
      const house = only(decide(4, { kind: 'eligibility', choice: 'house', reason: null }));
      expect([house.eligibility?.choice, house.eligibilityReset, house.reference]).toEqual(['house', false, { state: 'available', scope: 'house' }]);

      // Every decision stays on record, oldest first: a later one superseded each earlier one and none was rewritten.
      expect(house.decisions.map((entry) => [entry.ordinal, entry.decision])).toEqual([
        [1, { kind: 'attribution', scope: 'book', bookId: bookA, bookTitle: '资料库之书甲' }],
        [2, { kind: 'eligibility', choice: 'deferred', bookTitle: null, reason: null }],
        [3, { kind: 'eligibility', choice: 'book', bookTitle: '资料库之书甲', reason: '责编确认可用于本书。' }],
        [4, { kind: 'attribution', scope: 'house' }],
        [5, { kind: 'eligibility', choice: 'house', bookTitle: null, reason: null }],
      ]);
      // Reading it twice answers the same, and writes nothing.
      expect(store.inspectLibraryMaterials()).toEqual(store.inspectLibraryMaterials());
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every record, and forgets any preview: a file chosen before it is chosen again.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const kept = only(reopened.inspectLibraryMaterials());
      expect([kept.title, kept.attribution?.scope, kept.eligibility?.choice, kept.decisions.length]).toEqual(['样书一', 'house', 'house', 5]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(EVALUATION_RECORD_SCHEMA_VERSION);
      for (const table of ['library_materials', 'library_material_decisions']) {
        expect(() => database.exec(`UPDATE ${table} SET recorded_at = recorded_at`)).toThrowError(/LIBRARY_MATERIAL_LEDGER_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/LIBRARY_MATERIAL_LEDGER_IMMUTABLE/u);
      }
    } finally {
      database.close();
    }
  }, 300_000);

  it('names a file from its content, suggests a web page for HTML, and keeps nothing it cannot keep as the editor saw it', async () => {
    // What a file is, from its first window: a Word file by its part, an EPUB by its stored media type, HTML by its opening,
    // Markdown by its name, and a ZIP that is none of these as a file nothing here reads.
    const zip = (name: string, data: string): Uint8Array => {
      const header = new Uint8Array(30 + name.length + data.length);
      header.set([0x50, 0x4b, 0x03, 0x04]);
      header[26] = name.length;
      header.set(new TextEncoder().encode(name + data), 30);
      return header;
    };
    const text = (value: string): Uint8Array => new TextEncoder().encode(value);
    expect(identifyLibraryMaterialFormat(readFileSync(sample1Path(roots.codeRoot)).subarray(0, 65_536), 'sample1.docx')).toBe('DOCX');
    expect(identifyLibraryMaterialFormat(zip('mimetype', 'application/epub+zip'), 'a.epub')).toBe('EPUB');
    expect(identifyLibraryMaterialFormat(zip('data/part.xml', '<x/>'), 'a.zip')).toBe('UNKNOWN');
    expect(identifyLibraryMaterialFormat(text('﻿<!-- 保存的网页 -->\n<!DOCTYPE html><html><body>页</body></html>'), 'page.htm')).toBe('HTML');
    expect(identifyLibraryMaterialFormat(text('资料库里的一段说明。'), 'note.txt')).toBe('TXT');
    expect(identifyLibraryMaterialFormat(text('# 资料库说明'), 'note.md')).toBe('MD');
    expect(identifyLibraryMaterialFormat(text('%PDF-1.7\n'), 'paper.pdf')).toBe('PDF');
    expect(identifyLibraryMaterialFormat(Uint8Array.of(0, 1, 2, 3, 0xff), 'data.bin')).toBe('UNKNOWN');

    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const page = await store.previewLibraryMaterial(file('资料库网页.html', '<!doctype html>\n<html><head><title>资料库网页</title></head><body>AI7 资料库的网页快照。</body></html>'));
      expect([page.source.format, page.suggestedTitle, page.suggestedKind]).toEqual(['HTML', '资料库网页', 'web']);
      expect(await refusal(() => store.previewLibraryMaterial(file('empty.txt', '')))).toBe('LIBRARY_MATERIAL_FILE_EMPTY:所选文件是空的。');
      expect(await refusal(() => store.previewLibraryMaterial(join(roots.inputRoot, 'library')))).toBe('LIBRARY_MATERIAL_FILE_INVALID:所选的不是文件。');
      expect(await refusal(() => store.previewLibraryMaterial(join(roots.inputRoot, 'library', 'missing.pdf')))).toBe('LIBRARY_MATERIAL_FILE_UNREADABLE:无法读取所选文件。');

      // The file changed after the editor saw it: nothing is kept and nothing recorded.
      const notePath = file('资料说明.txt', 'AI7 资料库说明，第一稿。');
      const note = await store.previewLibraryMaterial(notePath);
      writeFileSync(notePath, 'AI7 资料库说明，改过之后。');
      expect(await refusal(() => store.addLibraryMaterial({ previewId: note.previewId, title: '资料说明', kind: 'document' })))
        .toBe('LIBRARY_MATERIAL_CHANGED:所选文件在预览之后变了；请重新选择。');
      expect(store.inspectLibraryMaterials().materials).toEqual([]);
      expect(keptObjects()).toEqual([]);

      // The web page, kept as a web page: its original under its own extension.
      const kept = only(await store.addLibraryMaterial({ previewId: page.previewId, title: page.suggestedTitle, kind: 'web' }));
      expect([kept.kind, kept.source.format, keptObjects()]).toEqual(['web', 'HTML', [`${page.source.sha256}.html`]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('adds revision 46 to a revision-45 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      emptyBook(first, '迁移之书');
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    // A revision-45 store never held the relations: planted by dropping them, it gains them again, empty.
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE evaluation_record_entries; DROP TABLE evaluation_records; DROP TABLE library_material_decisions; DROP TABLE library_materials; PRAGMA user_version = ${REVIEW_GUIDELINE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const projection = migrated.inspectLibraryMaterials();
      expect([projection.materials, projection.books.map((book) => book.title)]).toEqual([[], ['迁移之书']]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(EVALUATION_RECORD_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM library_materials').get() as { count: number }).count).toBe(0);
      expect((database.prepare('SELECT count(*) count FROM library_material_decisions').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);
});
