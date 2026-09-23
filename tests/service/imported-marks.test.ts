import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMENTS_REVISIONS_DETAIL, REIMPORT_COMMENTS_REVISIONS_DETAIL } from '../../src/service/docx.js';
import { EditorialMarkStore, proposalChangeItemsShape } from '../../src/service/editorial-marks.js';
import { ImportedMarkError, createImportedMarks, stageImportedMarks } from '../../src/service/imported-marks.js';
import { EditorialStore, StoreError, importedMarksRecord } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, IMPORT_RETENTION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { EditorialMarkAnchorProjection, ManuscriptBlockProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  composeRevisedDocx,
  sourceSpanText,
  type ComposedRevisedRequest,
  type SourceSpan,
} from '../support/composed-fixture.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER, downgradeProposalChangeItemsToRevision27 } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for imported marks (Issue #411, plan slice S62) over the real `EditorialStore`
// on a temporary Agent Data Root. Every input is composed from exact `sample1`'s words with neutral author
// names, and no assertion prints manuscript text: texts are compared by digest.

type Row = Record<string, SQLOutputValue>;

const SOURCE = ADMITTED_BASELINE_DOCX;
const AUTHOR = '示例作者';
const OTHER = '另一位作者';
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const span = (block: number, from?: number, to?: number): SourceSpan => ({ block, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) });
const text = (value: SourceSpan) => ({ text: value });
const revised = (value: SourceSpan, kind: 'ins' | 'del' | 'moveFrom' | 'moveTo', author: string, date: string) =>
  ({ text: value, revision: { kind, author, date } });
const read = (value: SourceSpan): Promise<string> => sourceSpanText(SOURCE, value);
const graphemes = async (value: SourceSpan): Promise<string[]> => Array.from(segmenter.segment(await read(value)), ({ segment }) => segment);

/**
 * Every case D1–D3 maps, one block each: a deletion, an insertion, a same-author same-time replacement, a
 * comment with a reply by another author, a done comment, a whole paragraph inserted and one deleted, a move,
 * and a formatting revision that stays with the file. Eight marks; nine blocks in the rejected reading.
 */
const REVISED: Omit<ComposedRevisedRequest, 'source' | 'title'> = {
  paragraphs: [
    { runs: [text(span(8, 0, 10)), revised(span(8, 10, 14), 'del', AUTHOR, '2026-09-01T10:00:00Z'), text(span(8, 14))] },
    { runs: [text(span(10, 0, 20)), revised(span(11, 0, 5), 'ins', AUTHOR, '2026-09-01T10:01:00Z'), text(span(10, 20))] },
    {
      runs: [
        text(span(13, 0, 5)), revised(span(13, 5, 9), 'del', AUTHOR, '2026-09-01T10:02:00Z'),
        revised(span(14, 0, 6), 'ins', AUTHOR, '2026-09-01T10:02:00Z'), text(span(13, 9)),
      ],
    },
    {
      runs: [
        text(span(15, 0, 10)), { comment: 'start', id: 1 }, { comment: 'start', id: 2 }, text(span(15, 10, 20)),
        { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }, { comment: 'end', id: 2 }, { comment: 'reference', id: 2 }, text(span(15, 20)),
      ],
    },
    { runs: [text(span(16, 0, 5)), { comment: 'start', id: 3 }, text(span(16, 5, 9)), { comment: 'end', id: 3 }, { comment: 'reference', id: 3 }, text(span(16, 9))] },
    { markRevision: { kind: 'ins', author: OTHER, date: '2026-09-01T11:00:00Z' }, runs: [revised(span(17), 'ins', OTHER, '2026-09-01T11:00:00Z')] },
    { markRevision: { kind: 'del', author: AUTHOR, date: '2026-09-01T11:01:00Z' }, runs: [revised(span(18), 'del', AUTHOR, '2026-09-01T11:01:00Z')] },
    { runs: [text(span(19, 0, 10)), revised(span(20, 0, 5), 'moveTo', AUTHOR, '2026-09-01T12:00:00Z'), text(span(19, 10))] },
    { runs: [revised(span(20, 0, 5), 'moveFrom', AUTHOR, '2026-09-01T12:00:00Z'), text(span(20, 5))] },
    { runs: [text(span(12))], formattingRevision: { author: AUTHOR, date: '2026-09-01T13:00:00Z' } },
  ],
  comments: [
    { id: 1, author: AUTHOR, text: [span(14, 0, 10)] },
    { id: 2, author: OTHER, text: [span(16, 10, 18)], replyTo: 1 },
    { id: 3, author: AUTHOR, text: [span(9, 0, 8)], done: true },
  ],
};
const REVISED_SOURCE_BLOCKS = [8, 10, 13, 15, 16, 18, 19, 20, 12];
const IMPORTED_MARKS = 8;

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function withDatabase<T>(readOnly: boolean, body: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return body(database);
  } finally {
    database.close();
  }
}

async function composeRevised(request: Omit<ComposedRevisedRequest, 'source' | 'title'> = REVISED): Promise<string> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeRevisedDocx(path, { source: SOURCE, title: '修订组稿', ...request });
  return path;
}

async function stageAndReview(store: EditorialStore, path: string) {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  return { staged, review };
}

async function importRevised(store: EditorialStore, path: string) {
  const { review } = await stageAndReview(store, path);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId,
  });
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { review, commit };
}

function workingBlocks(store: EditorialStore, manuscriptId: string, branchId: string): ManuscriptBlockProjection[] {
  const blocks: ManuscriptBlockProjection[] = [];
  let cursor: string | null = null;
  do {
    const window = store.getManuscriptWindow(manuscriptId, branchId, cursor);
    for (const block of window.blocks) if (!blocks.some((known) => known.blockId === block.blockId)) blocks.push(block);
    cursor = window.nextCursor;
  } while (cursor !== null);
  return blocks;
}

function windowMarks(store: EditorialStore, manuscriptId: string, branchId: string): EditorialMarkAnchorProjection[] {
  return [...store.getManuscriptWindow(manuscriptId, branchId, null).marks];
}

async function sourceDigests(blocks: ReadonlyArray<number>): Promise<string[]> {
  return Promise.all(blocks.map(async (block) => digest(await read(span(block)))));
}

describe('a DOCX\'s comments and tracked changes enter the imported manuscript (Issue #411)', () => {
  it('creates every mark on r1 with the file\'s author as its source, and applies nothing', async () => {
    const path = await composeRevised();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { review, commit } = await importRevised(store, path);
      // D4: the class is 完整保留, counted as the marks it becomes, and not a degradation.
      expect(review.fidelity[1]).toEqual({
        key: 'comments-revisions', label: '批注与修订', count: IMPORTED_MARKS, status: 'preserved', statusLabel: '完整保留',
        detail: COMMENTS_REVISIONS_DETAIL,
      });
      expect(review.recordsToCreate).toContain(importedMarksRecord(IMPORTED_MARKS));
      expect(importedMarksRecord(IMPORTED_MARKS)).toBe('来自文件作者的批注与修改建议 8 条');
      expect(review.recordsToCreate.indexOf(importedMarksRecord(IMPORTED_MARKS))).toBe(review.recordsToCreate.indexOf('来源段落对应') + 1);
      expect(commit.importRecord.degradationDecision).toBeNull();

      // D1: the manuscript reads with every revision rejected, and importing wrote no command.
      const blocks = workingBlocks(store, commit.manuscriptId, commit.branchId);
      expect(blocks.map((block) => digest(block.text))).toEqual(await sourceDigests(REVISED_SOURCE_BLOCKS));
      withDatabase(true, (database) => {
        expect(database.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').get(commit.branchId))
          .toEqual({ journal_sequence: 0 });
        expect(database.prepare('SELECT count(*) total FROM manuscript_effect_intents').get()).toEqual({ total: 0 });
        expect(database.prepare('SELECT count(*) total FROM staged_import_marks').get()).toEqual({ total: 0 });
      });

      const marks = windowMarks(store, commit.manuscriptId, commit.branchId);
      expect(marks).toHaveLength(IMPORTED_MARKS);
      expect(new Set(marks.map((mark) => mark.sourceKind))).toEqual(new Set(['imported-author']));
      const cards = marks.map((mark) => store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, mark.markId));
      const position = (blockId: string): number => blocks.findIndex((block) => block.blockId === blockId) + 1;
      const length5 = (await graphemes(span(16))).length;
      expect(cards.map((card) => [
        position(card.blockId), card.fromGrapheme, card.toGrapheme, card.kind, card.status, card.source.label,
        card.suggestion?.changeType ?? null,
      ])).toEqual([
        [1, 10, 14, 'change-suggestion', 'open', AUTHOR, 'delete'],
        [2, 20, 20, 'change-suggestion', 'open', AUTHOR, 'insert'],
        [3, 5, 9, 'change-suggestion', 'open', AUTHOR, 'replace'],
        [4, 10, 20, 'annotation', 'open', AUTHOR, null],
        [5, 5, 9, 'annotation', 'resolved', AUTHOR, null],
        [5, length5 - 1, length5, 'annotation', 'open', OTHER, null],
        [6, 0, (await graphemes(span(18))).length, 'annotation', 'open', AUTHOR, null],
        [7, 10, 11, 'annotation', 'open', AUTHOR, null],
      ]);
      expect(cards.every((card) => card.source.kind === 'imported-author' && card.source.origin === null && card.anchorState === 'exact')).toBe(true);
      const [deletion, insertion, replacement, comment] = cards;
      expect([deletion!.suggestion!.currentText, deletion!.suggestion!.proposedText].map(digest))
        .toEqual([digest(await read(span(8, 10, 14))), digest('')]);
      expect([insertion!.pinnedText, insertion!.suggestion!.currentText, insertion!.suggestion!.proposedText].map(digest))
        .toEqual([digest(''), digest(''), digest(await read(span(11, 0, 5)))]);
      expect([replacement!.suggestion!.currentText, replacement!.suggestion!.proposedText].map(digest))
        .toEqual([digest(await read(span(13, 5, 9))), digest(await read(span(14, 0, 6)))]);
      expect(digest(comment!.body)).toBe(digest(`${await read(span(14, 0, 10))}\n回复（${OTHER}）：${await read(span(16, 10, 18))}`));
      // The pending insertion is a point the surface names by the words it would write; nothing was deleted there.
      const point = marks.find((mark) => mark.markId === insertion!.markId)!;
      expect([point.deletedText, point.insertedText === null ? null : digest(point.insertedText)])
        .toEqual([null, digest(await read(span(11, 0, 5)))]);
      expect(marks.filter((mark) => mark.markId !== insertion!.markId).every((mark) => mark.insertedText === null && mark.deletedText === null)).toBe(true);
      // No decision exists on any imported suggestion: nothing was accepted on the editor's behalf.
      expect(cards.every((card) => card.suggestion === null || card.suggestion.decision === null)).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // Restart: every mark is read back as it was committed.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = reopened.listBooks(null).items[0]!;
      const overview = reopened.getBookOverview(book.bookId);
      const record = overview.records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.fidelityCategories[1]).toMatchObject({ count: IMPORTED_MARKS, status: 'preserved' });
      const manuscript = withDatabase(true, (database) => database.prepare('SELECT manuscript_id, branch_id FROM branch_working_state').get() as Row);
      const marks = windowMarks(reopened, String(manuscript.manuscript_id), String(manuscript.branch_id));
      expect(marks.map((mark) => [mark.kind, mark.status, mark.anchorState, mark.sourceKind])).toEqual([
        ['change-suggestion', 'open', 'exact', 'imported-author'],
        ['change-suggestion', 'open', 'exact', 'imported-author'],
        ['change-suggestion', 'open', 'exact', 'imported-author'],
        ['annotation', 'open', 'exact', 'imported-author'],
        ['annotation', 'resolved', 'exact', 'imported-author'],
        ['annotation', 'open', 'exact', 'imported-author'],
        ['annotation', 'open', 'exact', 'imported-author'],
        ['annotation', 'open', 'exact', 'imported-author'],
      ]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('writes an imported insertion, deletion and replacement through 接受并应用, and reverses the insertion to its point', async () => {
    const path = await composeRevised();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, path);
      const binding = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
      const windowStartBlockId = workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.blockId;
      const [deletion, insertion, replacement] = windowMarks(store, commit.manuscriptId, commit.branchId);
      const apply = (markId: string) => store.applyChangeSuggestion({
        ...binding, windowStartBlockId, markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      for (const mark of [insertion!, deletion!, replacement!]) {
        const applied = apply(mark.markId);
        expect(applied.card?.status).toBe('applied');
        expect(applied.application.changeCount).toBe(1);
      }
      const [block8, block10, block13] = await Promise.all([8, 10, 13].map((block) => graphemes(span(block))));
      const expected = [
        [...block8!.slice(0, 10), ...block8!.slice(14)].join(''),
        [...block10!.slice(0, 20), await read(span(11, 0, 5)), ...block10!.slice(20)].join(''),
        [...block13!.slice(0, 5), await read(span(14, 0, 6)), ...block13!.slice(9)].join(''),
      ];
      const blocks = workingBlocks(store, commit.manuscriptId, commit.branchId);
      expect(blocks.slice(0, 3).map((block) => digest(block.text))).toEqual(expected.map(digest));
      // The applied insertion now stands on the words it wrote; the applied deletion on the point they left.
      const card = store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, insertion!.markId);
      expect([card.fromGrapheme, card.toGrapheme, digest(card.pinnedText)]).toEqual([20, 25, digest(await read(span(11, 0, 5)))]);
      const deleted = windowMarks(store, commit.manuscriptId, commit.branchId).find((mark) => mark.markId === deletion!.markId)!;
      expect([deleted.fromGrapheme, deleted.toGrapheme, digest(deleted.deletedText ?? ''), deleted.insertedText]).toEqual([10, 10, digest(await read(span(8, 10, 14))), null]);

      // Reversing the insertion takes its words out again and leaves the suggestion open at its point.
      const reversed = store.reverseAppliedChangeSuggestion({ ...binding, windowStartBlockId, markId: insertion!.markId, clientEffectId: randomUUID() });
      expect(reversed.card?.status).toBe('open');
      expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!.text)).toBe(digest(await read(span(10))));
      const pending = windowMarks(store, commit.manuscriptId, commit.branchId).find((mark) => mark.markId === insertion!.markId)!;
      expect([pending.fromGrapheme, pending.toGrapheme, pending.anchorState, pending.insertedText === null ? null : digest(pending.insertedText)])
        .toEqual([20, 20, 'exact', digest(await read(span(11, 0, 5)))]);
      // A 批注 needs text to stand on: the insertion does not convert to one.
      expect(() => store.updateEditorialMark({
        ...binding, windowStartBlockId, markId: insertion!.markId, action: 'convert', targetKind: 'annotation',
        body: null, highlightColor: null, status: null, proposedText: null, rationale: null,
      })).toThrow(StoreError);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('refuses the commit when a staged mark no longer matches its file, creating nothing', async () => {
    const path = await composeRevised();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { review } = await stageAndReview(store, path);
      withDatabase(false, (database) => {
        expect(database.prepare('SELECT count(*) total FROM staged_import_marks WHERE draft_id = ?').get(review.draftId)).toEqual({ total: IMPORTED_MARKS });
        database.prepare('UPDATE staged_import_marks SET from_grapheme = from_grapheme + 1, to_grapheme = to_grapheme + 1 WHERE draft_id = ? AND ordinal = 1')
          .run(review.draftId);
      });
      await expect(store.commitNewBookImport({
        draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID(),
      })).rejects.toMatchObject({ code: 'SNAPSHOT_RESELECTION_REQUIRED' });
      expect(store.listBooks(null).items).toEqual([]);
      withDatabase(true, (database) => {
        expect(database.prepare('SELECT count(*) total FROM editorial_marks').get()).toEqual({ total: 0 });
      });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('creates the imported marks all or none: one that does not stand where it was staged refuses them all', async () => {
    const path = join(roots.inputRoot, 'plain.docx');
    await composeManuscriptDocx(path, { source: SOURCE, startBlock: 8, blocks: 3, title: '无批注组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let binding: { manuscriptId: string; branchId: string };
    try {
      const { commit } = await importRevised(store, path);
      binding = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const first = (await graphemes(span(8)))[0]!;
    // A grapheme of the source that is not the one standing first in the excerpt's second block.
    const secondFirst = (await graphemes(span(9)))[0]!;
    const wrong = (await graphemes(span(8))).find((candidate) => candidate !== secondFirst)!;
    withDatabase(false, (database) => {
      const blockIds = (database.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? ORDER BY position').all(binding.branchId) as Row[])
        .map((row) => String(row.block_id));
      const draftId = randomUUID();
      const valid = {
        ordinal: 1, blockPosition: 1, fromGrapheme: 0, toGrapheme: 1, pinnedText: first, kind: 'annotation' as const,
        origin: 'comment' as const, authorLabel: AUTHOR, body: '（空批注）', proposedText: null, status: 'open' as const,
      };
      database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
      try {
        stageImportedMarks(database, draftId, [valid, { ...valid, ordinal: 2, blockPosition: 2, pinnedText: wrong }]);
        expect(() => createImportedMarks(database, new EditorialMarkStore(database), draftId, { ...binding, blockIdOf: (position) => blockIds[position - 1]! }))
          .toThrow(ImportedMarkError);
      } finally {
        database.exec('ROLLBACK; PRAGMA foreign_keys = ON;');
      }
      expect(database.prepare('SELECT count(*) total FROM editorial_marks').get()).toEqual({ total: 0 });
    });
  }, 180_000);

  it('states the class 不支持导入 on a reimport, which makes no mark, and asks for the decision', async () => {
    const first = join(roots.inputRoot, 'first.docx');
    await composeManuscriptDocx(first, { source: SOURCE, startBlock: 8, blocks: 3, title: '重新导入组稿' });
    const second = await composeRevised();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, first);
      const staged = await store.stageSelectedManuscript(randomUUID(), second);
      // At the target step nothing is decided yet: the file's own reading says what a new import would make.
      expect(staged.fidelity[1]).toMatchObject({ count: IMPORTED_MARKS, status: 'preserved' });
      const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: commit.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      const review = prepared.review!;
      expect(review.fidelity[1]).toEqual({
        key: 'comments-revisions', label: '批注与修订', count: IMPORTED_MARKS, status: 'unsupported', statusLabel: '不支持导入',
        detail: REIMPORT_COMMENTS_REVISIONS_DETAIL,
      });
      expect(review.degradationDecision).toEqual({
        state: 'required-unselected',
        items: [{ categoryKey: 'comments-revisions', label: '批注与修订', count: IMPORTED_MARKS }],
      });
      expect(review.commitReady).toBe(false);
      withDatabase(true, (database) => {
        expect(database.prepare("SELECT count(*) total FROM editorial_marks WHERE source_kind = 'imported-author'").get()).toEqual({ total: 0 });
      });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});

describe('schema revision 28 over the real store', () => {
  it('migrates a planted revision-27 store, rebuilding its Proposal Change Items byte for byte', async () => {
    // A deletion, a replacement and a comment: every row revision 27 admitted, and no insertion.
    const path = await composeRevised({
      paragraphs: REVISED.paragraphs.filter((_paragraph, index) => index === 0 || index === 2 || index === 3),
      comments: REVISED.comments!,
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importRevised(store, path);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const before = withDatabase(false, (database) => {
      for (const relation of [...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE ${relation}`);
      for (const relation of IMPORTED_MARK_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE ${relation}`);
      downgradeProposalChangeItemsToRevision27(database);
      database.exec(`PRAGMA user_version = ${IMPORT_RETENTION_SCHEMA_VERSION}`);
      expect(proposalChangeItemsShape(database)).toBe('revision-27');
      return {
        items: database.prepare('SELECT rowid, * FROM proposal_change_items ORDER BY rowid').all() as Row[],
        marks: database.prepare('SELECT rowid, * FROM editorial_marks ORDER BY rowid').all() as Row[],
      };
    });
    expect(before.items.map((row) => row.change_type)).toEqual(['delete', 'replace']);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The widened ledger takes an insertion now: a second file with one imports on the migrated store.
      const { commit } = await importRevised(migrated, await composeRevised({ paragraphs: [REVISED.paragraphs[1]!] }));
      expect(windowMarks(migrated, commit.manuscriptId, commit.branchId).map((mark) => mark.insertedText !== null)).toEqual([true]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(CLARIFICATION_SCHEMA_VERSION);
      expect(proposalChangeItemsShape(database)).toBe('current');
      const items = database.prepare('SELECT rowid, * FROM proposal_change_items ORDER BY rowid').all() as Row[];
      expect(items.slice(0, 2)).toEqual(before.items);
      expect(items.slice(2).map((row) => row.change_type)).toEqual(['insert']);
      expect((database.prepare('SELECT rowid, * FROM editorial_marks ORDER BY rowid').all() as Row[]).slice(0, before.marks.length)).toEqual(before.marks);
      // Both ledger triggers came back with the relation.
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'proposal_change_items' ORDER BY name").all())
        .toEqual([{ name: 'proposal_change_items_no_delete' }, { name: 'proposal_change_items_no_update' }]);
      expect(database.prepare('SELECT count(*) total FROM staged_import_marks').get()).toEqual({ total: 0 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 180_000);
});
