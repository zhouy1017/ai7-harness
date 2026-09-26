import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMENTS_REVISIONS_DETAIL } from '../../src/service/docx.js';
import { EditorialMarkStore, proposalChangeItemsShape } from '../../src/service/editorial-marks.js';
import { ImportedMarkError, createImportedMarks, stageImportedMarks } from '../../src/service/imported-marks.js';
import { EditorialStore, StoreError, importedMarksRecord } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, DECISION_FEEDBACK_SCHEMA_VERSION, IMPORT_RETENTION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
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
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
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

  it('offers 保存为新提案版本 for an insertion whose point an edit took, and writes it where the edit left the point (Issue #533)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised());
      const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
      const block = workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!;
      const insertion = windowMarks(store, commit.manuscriptId, commit.branchId)[1]!;
      expect([insertion.blockId, insertion.fromGrapheme, insertion.toGrapheme, insertion.anchorState]).toEqual([block.blockId, 20, 20, 'exact']);
      // The editor deletes graphemes 18 to 22 of ¶2, the words on both sides of the insertion's point: it drifts.
      const window = store.getManuscriptWindow(commit.manuscriptId, commit.branchId, null);
      const windowStartBlockId = window.blocks[0]!.blockId;
      store.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: window.revisionId, blockId: block.blockId, windowStartBlockId,
        baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: 18, toGrapheme: 22, insertText: '',
      });
      const drifted = windowMarks(store, commit.manuscriptId, commit.branchId).find((mark) => mark.markId === insertion.markId)!;
      expect([drifted.anchorState, drifted.fromGrapheme, drifted.toGrapheme, drifted.conflict]).toEqual(['drifted', 18, 18, 'unresolved']);
      // Nothing of the insertion was deleted, since it had no words there: its conflict offers a new version in place.
      const words = await read(span(11, 0, 5));
      const conflict = store.inspectProposalConflict({ ...book, markId: insertion.markId });
      expect(conflict).toMatchObject({ conflictKind: 'suggestion', fromGrapheme: 18, toGrapheme: 18, newVersion: { available: true, blocker: null } });
      expect([conflict.base, conflict.current, digest(conflict.proposed)]).toEqual(['', '', digest(words)]);
      const draft = store.saveProposalConflictDraft({
        ...book, markId: insertion.markId, basisDigest: conflict.basisDigest,
        units: conflict.units.map((unit) => (unit.kind === 'same' ? { resolution: null, text: null } : { resolution: 'proposed' as const, text: null })),
      });
      expect(digest(draft.draft.text)).toBe(digest(words));
      const resolved = store.resolveProposalConflict({
        ...book, markId: insertion.markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal,
      });
      // The new version is an insertion at the point the edit left: the editor's, undecided, and exact.
      const card = store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, resolved.newMarkId!);
      expect(card).toMatchObject({
        kind: 'change-suggestion', status: 'open', anchorState: 'exact', blockId: block.blockId, fromGrapheme: 18, toGrapheme: 18,
        pinnedText: '', conflict: null, convertedFrom: { markId: insertion.markId },
      });
      expect([card.suggestion?.changeType, card.suggestion?.currentText, digest(card.suggestion?.proposedText ?? '')]).toEqual(['insert', '', digest(words)]);
      // 接受并应用 writes its words there.
      store.applyChangeSuggestion({
        ...book, windowStartBlockId, markId: resolved.newMarkId!, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const original = await graphemes(span(10));
      expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!.text))
        .toBe(digest([...original.slice(0, 18), words, ...original.slice(22)].join('')));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('asks about a deletion applied before another author\'s insertion at its point, and not the other way round (Issue #533)', async () => {
    // One author deleted words and another inserted words just after them: two marks, since their revisions differ. Each
    // way has its own Book, so each file after the first carries one more plain paragraph.
    const pair = { runs: [
      text(span(13, 0, 5)), revised(span(13, 5, 9), 'del', AUTHOR, '2026-09-01T10:02:00Z'),
      revised(span(14, 0, 6), 'ins', OTHER, '2026-09-01T11:02:00Z'), text(span(13, 9)),
    ] };
    const [block13, deleted, inserted, insertedGraphemes] = await Promise.all([
      graphemes(span(13)), read(span(13, 5, 9)), read(span(14, 0, 6)), graphemes(span(14, 0, 6)),
    ]);
    const both = digest([...block13.slice(0, 5), inserted, ...block13.slice(9)].join(''));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const ways = [['insertion first', 0], ['deletion first, kept', 1], ['deletion first, put back', 2]] as const;
      for (const [way, plain] of ways) {
        const paragraphs = [pair, ...Array.from({ length: plain }, () => ({ runs: [text(span(21))] }))];
        const { commit } = await importRevised(store, await composeRevised({ paragraphs }));
        const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
        const windowStartBlockId = workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.blockId;
        const [deletion, insertion] = windowMarks(store, commit.manuscriptId, commit.branchId);
        expect([deletion!.fromGrapheme, deletion!.toGrapheme, insertion!.fromGrapheme, insertion!.toGrapheme]).toEqual([5, 9, 9, 9]);
        const apply = (markId: string) => store.applyChangeSuggestion({
          ...book, windowStartBlockId, markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
        });
        for (const mark of way === 'insertion first' ? [insertion!, deletion!] : [deletion!, insertion!]) apply(mark.markId);
        // Either way the paragraph reads as both changes made.
        expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.text)).toBe(both);
        const anchorOf = (markId: string) => windowMarks(store, commit.manuscriptId, commit.branchId).find((mark) => mark.markId === markId)!;
        if (way === 'insertion first') {
          // The insertion written first leaves the deletion's words where they were: both stand exact, and nothing asks.
          expect([anchorOf(deletion!.markId).conflict, anchorOf(insertion!.markId).conflict]).toEqual([null, null]);
          continue;
        }
        // Deleted first, the words leave a point where the insertion's point already stood. Which side of the inserted words
        // the deletion belongs on went with them, so AI7 asks rather than guessing: the deletion's point covers the words the
        // insertion wrote, and undoing it is a reversal conflict over them.
        expect([anchorOf(deletion!.markId).conflict, anchorOf(insertion!.markId).conflict]).toEqual(['unresolved', null]);
        const reversal = store.inspectProposalConflict({ ...book, markId: deletion!.markId });
        expect(reversal).toMatchObject({
          conflictKind: 'reversal', fromGrapheme: 5, toGrapheme: 5 + insertedGraphemes.length, base: '', newVersion: { available: true, blocker: null },
        });
        expect([digest(reversal.current), digest(reversal.proposed)]).toEqual([digest(inserted), digest(deleted)]);
        expect(reversal.units.map((unit) => unit.kind)).toEqual(['conflict']);
        if (way === 'deletion first, kept') {
          // 保留当前稿件 settles it, and nothing changes.
          store.resolveProposalConflict({ ...book, markId: deletion!.markId, basisDigest: reversal.basisDigest, outcome: 'keep-current', draftOrdinal: null });
          expect(anchorOf(deletion!.markId).conflict).toBe('resolved');
          expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.text)).toBe(both);
          continue;
        }
        // Or the editor puts the deleted words back where they stood, before the inserted ones: a Correction Proposal over
        // the inserted words, which 接受并应用 writes. The paragraph reads as the insertion alone made.
        const draft = store.saveProposalConflictDraft({
          ...book, markId: deletion!.markId, basisDigest: reversal.basisDigest,
          units: [{ resolution: 'both-proposed-first', text: null }],
        });
        expect(digest(draft.draft.text)).toBe(digest(deleted + inserted));
        const resolved = store.resolveProposalConflict({
          ...book, markId: deletion!.markId, basisDigest: reversal.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal,
        });
        expect(store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, resolved.newMarkId!)).toMatchObject({
          status: 'open', anchorState: 'exact', fromGrapheme: 5, toGrapheme: 5 + insertedGraphemes.length, convertedFrom: null,
          resolvedFrom: { markId: deletion!.markId, conflictKind: 'reversal' },
        });
        expect(anchorOf(deletion!.markId).conflict).toBe('resolved');
        apply(resolved.newMarkId!);
        expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.text))
          .toBe(digest([...block13.slice(0, 9), inserted, ...block13.slice(9)].join('')));
        // The insertion still stands exact on its words, after the words put back.
        const standing = anchorOf(insertion!.markId);
        expect([standing.anchorState, standing.fromGrapheme, standing.toGrapheme]).toEqual(['exact', 9, 9 + insertedGraphemes.length]);
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 240_000);

  it('lets the second of two insertions at one point cover the words the first wrote there, for the editor to order them (Issue #533)', async () => {
    // Two authors inserted words at one place: two marks at one point, since their revisions differ.
    const [block13, first, second, firstGraphemes] = await Promise.all([
      graphemes(span(13)), read(span(14, 0, 3)), read(span(14, 3, 6)), graphemes(span(14, 0, 3)),
    ]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised({ paragraphs: [{ runs: [
        text(span(13, 0, 5)), revised(span(14, 0, 3), 'ins', AUTHOR, '2026-09-01T10:02:00Z'),
        revised(span(14, 3, 6), 'ins', OTHER, '2026-09-01T11:02:00Z'), text(span(13, 5)),
      ] }] }));
      const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
      const windowStartBlockId = workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.blockId;
      const cards = windowMarks(store, commit.manuscriptId, commit.branchId)
        .map((mark) => store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, mark.markId));
      const one = cards.find((card) => card.source.label === AUTHOR)!;
      const two = cards.find((card) => card.source.label === OTHER)!;
      expect([one.fromGrapheme, one.toGrapheme, two.fromGrapheme, two.toGrapheme]).toEqual([5, 5, 5, 5]);
      const apply = (markId: string) => store.applyChangeSuggestion({
        ...book, windowStartBlockId, markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const anchorOf = (markId: string) => {
        const mark = windowMarks(store, commit.manuscriptId, commit.branchId).find((candidate) => candidate.markId === markId)!;
        return [mark.anchorState, mark.fromGrapheme, mark.toGrapheme, mark.conflict];
      };
      const end = 5 + firstGraphemes.length;
      apply(one.markId);
      // The first stands on the words it wrote. Nothing says on which side of them the second belongs, so it covers them.
      expect([anchorOf(one.markId), anchorOf(two.markId)]).toEqual([['exact', 5, end, null], ['drifted', 5, end, 'unresolved']]);
      const conflict = store.inspectProposalConflict({ ...book, markId: two.markId });
      expect(conflict).toMatchObject({ conflictKind: 'suggestion', fromGrapheme: 5, toGrapheme: end, base: '', newVersion: { available: true, blocker: null } });
      expect([digest(conflict.current), digest(conflict.proposed)]).toEqual([digest(first), digest(second)]);
      expect(conflict.units.map((unit) => unit.kind)).toEqual(['conflict']);
      // The editor keeps the file's order, the first's words before the second's: a new version over the first's words.
      const draft = store.saveProposalConflictDraft({
        ...book, markId: two.markId, basisDigest: conflict.basisDigest, units: [{ resolution: 'both-current-first', text: null }],
      });
      expect(digest(draft.draft.text)).toBe(digest(first + second));
      const resolved = store.resolveProposalConflict({
        ...book, markId: two.markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal,
      });
      const card = store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, resolved.newMarkId!);
      expect(card).toMatchObject({ status: 'open', anchorState: 'exact', fromGrapheme: 5, toGrapheme: end, convertedFrom: { markId: two.markId } });
      expect([card.suggestion?.changeType, digest(card.suggestion?.currentText ?? ''), digest(card.suggestion?.proposedText ?? '')])
        .toEqual(['replace', digest(first), digest(first + second)]);
      apply(resolved.newMarkId!);
      expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[0]!.text))
        .toBe(digest([...block13.slice(0, 5), first, second, ...block13.slice(5)].join('')));
      expect(anchorOf(one.markId)).toEqual(['exact', 5, end, null]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('covers what is written at an insertion\'s drifted point — an undo, a retyping — for the editor to place it there (Issue #533)', async () => {
    const [original, words, typed, typedGraphemes] = await Promise.all([
      graphemes(span(10)), read(span(11, 0, 5)), read(span(21, 0, 3)), graphemes(span(21, 0, 3)),
    ]);
    const typedLength = typedGraphemes.length;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // One Book each way; the second file carries one more plain paragraph.
      for (const undo of [true, false]) {
        const { commit } = await importRevised(store, await composeRevised(
          undo ? REVISED : { ...REVISED, paragraphs: [...REVISED.paragraphs, { runs: [text(span(21))] }] },
        ));
        const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
        const blockId = workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!.blockId;
        const insertion = windowMarks(store, commit.manuscriptId, commit.branchId)[1]!;
        expect([insertion.blockId, insertion.fromGrapheme, insertion.toGrapheme]).toEqual([blockId, 20, 20]);
        const anchorOf = () => {
          const mark = windowMarks(store, commit.manuscriptId, commit.branchId).find((candidate) => candidate.markId === insertion.markId)!;
          return [mark.anchorState, mark.fromGrapheme, mark.toGrapheme];
        };
        const edit = (fromGrapheme: number, toGrapheme: number, insertText: string) => {
          const window = store.getManuscriptWindow(commit.manuscriptId, commit.branchId, null);
          store.flushJournalEdit({
            clientEditId: randomUUID(), ...book, baseRevisionId: window.revisionId, blockId, windowStartBlockId: window.blocks[0]!.blockId,
            baseBlockDigest: window.blocks.find((block) => block.blockId === blockId)!.digest, expectedJournalSequence: window.journalSequence,
            fromGrapheme, toGrapheme, insertText,
          });
        };
        // The editor deletes graphemes 18 to 22 of ¶2, across the insertion's point: it drifts to 18.
        edit(18, 22, '');
        expect(anchorOf()).toEqual(['drifted', 18, 18]);
        if (!undo) {
          // The editor types new words there. The insertion covers them rather than standing after them, since nothing says
          // on which side of them it belongs: its 稿件冲突 compares them with its own.
          edit(18, 18, typed);
          expect(anchorOf()).toEqual(['drifted', 18, 18 + typedLength]);
          const conflict = store.inspectProposalConflict({ ...book, markId: insertion.markId });
          expect(conflict).toMatchObject({
            conflictKind: 'suggestion', fromGrapheme: 18, toGrapheme: 18 + typedLength, base: '', newVersion: { available: true, blocker: null },
          });
          expect([digest(conflict.current), digest(conflict.proposed)]).toEqual([digest(typed), digest(words)]);
          // Typing at the edge of what it covers joins it; typing wholly in front of it moves it.
          edit(18 + typedLength, 18 + typedLength, typed);
          expect(anchorOf()).toEqual(['drifted', 18, 18 + 2 * typedLength]);
          edit(0, 0, typed);
          expect(anchorOf()).toEqual(['drifted', 18 + typedLength, 18 + 3 * typedLength]);
          continue;
        }
        // The editor undoes the deletion. The words come back at the point, and the insertion covers them: standing after
        // them, it would pass off a place four graphemes on from where the author put it.
        store.undoManuscript(commit.manuscriptId, commit.branchId, store.getManuscriptWindow(commit.manuscriptId, commit.branchId, null).workingDigest);
        expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!.text)).toBe(digest(original.join('')));
        expect(anchorOf()).toEqual(['drifted', 18, 22]);
        const conflict = store.inspectProposalConflict({ ...book, markId: insertion.markId });
        expect(conflict).toMatchObject({ conflictKind: 'suggestion', fromGrapheme: 18, toGrapheme: 22, base: '', newVersion: { available: true, blocker: null } });
        expect([digest(conflict.current), digest(conflict.proposed)]).toEqual([digest(original.slice(18, 22).join('')), digest(words)]);
        expect(conflict.units.map((unit) => unit.kind)).toEqual(['conflict']);
        // The editor places the words where the author put them, after the second of those graphemes: a new version over
        // them, which 接受并应用 writes as the insertion itself would have.
        const placed = [...original.slice(18, 20), words, ...original.slice(20, 22)].join('');
        const draft = store.saveProposalConflictDraft({
          ...book, markId: insertion.markId, basisDigest: conflict.basisDigest, units: [{ resolution: 'edited', text: placed }],
        });
        const resolved = store.resolveProposalConflict({
          ...book, markId: insertion.markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal,
        });
        const card = store.getEditorialMarkCard(commit.manuscriptId, commit.branchId, resolved.newMarkId!);
        expect(card).toMatchObject({
          status: 'open', anchorState: 'exact', blockId, fromGrapheme: 18, toGrapheme: 22, conflict: null, convertedFrom: { markId: insertion.markId },
        });
        expect([card.suggestion?.changeType, digest(card.suggestion?.currentText ?? ''), digest(card.suggestion?.proposedText ?? '')])
          .toEqual(['replace', digest(original.slice(18, 22).join('')), digest(placed)]);
        store.applyChangeSuggestion({
          ...book, windowStartBlockId: store.getManuscriptWindow(commit.manuscriptId, commit.branchId, null).blocks[0]!.blockId,
          markId: resolved.newMarkId!, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
        });
        expect(digest(workingBlocks(store, commit.manuscriptId, commit.branchId)[1]!.text))
          .toBe(digest([...original.slice(0, 20), words, ...original.slice(20)].join('')));
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 240_000);

  it('lets a pending insertion cover its paragraph once a recovery restores other text there, and leaves one in a kept paragraph where it stood (Issue #533)', async () => {
    const insertions: Omit<ComposedRevisedRequest, 'source' | 'title'> = {
      paragraphs: [
        { runs: [text(span(10, 0, 20)), revised(span(11, 0, 5), 'ins', AUTHOR, '2026-09-01T10:01:00Z'), text(span(10, 20))] },
        { runs: [text(span(13, 0, 5)), revised(span(14, 0, 6), 'ins', AUTHOR, '2026-09-01T10:02:00Z'), text(span(13, 5))] },
      ],
    };
    const [first, typed, typedGraphemes] = await Promise.all([graphemes(span(10)), read(span(21, 0, 3)), graphemes(span(21, 0, 3))]);
    let book: { manuscriptId: string; branchId: string };
    let marks: EditorialMarkAnchorProjection[];
    const interrupted = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(interrupted, await composeRevised(insertions));
      book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
      marks = windowMarks(interrupted, book.manuscriptId, book.branchId);
      expect(marks.map((mark) => [mark.anchorState, mark.fromGrapheme, mark.toGrapheme])).toEqual([['exact', 20, 20], ['exact', 5, 5]]);
      // The editor types in front of ¶1's insertion, which moves on with the words; then the product stops without closing.
      const window = interrupted.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks.find((candidate) => candidate.blockId === marks[0]!.blockId)!;
      interrupted.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: window.revisionId, blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId,
        baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: 5, toGrapheme: 5, insertText: typed,
      });
      const moved = 20 + typedGraphemes.length;
      expect(windowMarks(interrupted, book.manuscriptId, book.branchId)[0]).toMatchObject({ anchorState: 'exact', fromGrapheme: moved, toGrapheme: moved });
    } finally {
      // No `markCleanShutdown`: what an interrupted product process leaves behind.
      interrupted.close();
    }
    const recovered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const startup = await recovered.getStartup();
      expect(startup.state).toBe('manuscript-recovery');
      if (startup.state !== 'manuscript-recovery') throw new Error('unreachable');
      // The editor restores the checkpoint, from before the typing: ¶1 reads as imported again.
      await recovered.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind: 'checkpoint' });
      expect(digest(workingBlocks(recovered, book.manuscriptId, book.branchId)[0]!.text)).toBe(digest(first.join('')));
      // ¶1's insertion was counted in the typed words, so its index names no place in the text restored: it covers the whole
      // paragraph, for the editor to place it. ¶2's text did not change, so its insertion drifts where it stood, still its place.
      expect(windowMarks(recovered, book.manuscriptId, book.branchId).map((mark) => [mark.markId, mark.anchorState, mark.fromGrapheme, mark.toGrapheme]))
        .toEqual([[marks[0]!.markId, 'drifted', 0, first.length], [marks[1]!.markId, 'drifted', 5, 5]]);
      const conflict = recovered.inspectProposalConflict({ ...book, markId: marks[0]!.markId });
      expect(conflict).toMatchObject({ conflictKind: 'suggestion', fromGrapheme: 0, toGrapheme: first.length, base: '', newVersion: { available: true, blocker: null } });
      expect(digest(conflict.current)).toBe(digest(first.join('')));
      recovered.markCleanShutdown();
    } finally {
      recovered.close();
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

  it('makes the new file\'s comments and tracked changes marks on a reimport, and makes none twice (Issue #412)', async () => {
    const first = join(roots.inputRoot, 'first.docx');
    await composeManuscriptDocx(first, { source: SOURCE, startBlock: 8, blocks: 3, title: '重新导入组稿' });
    const second = await composeRevised();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, first);
      const reimport = (path: string, reuseSourceVersionId: string | null) => reimportInto(store, commit.bookId, path, reuseSourceVersionId);
      const imported = () => importedMarkCount();
      const changed = await reimport(second, null);
      expect(changed.resultKind).toBe('changed');
      expect(imported()).toEqual({ total: IMPORTED_MARKS });
      // The same file again, its Source Version chosen as the exact match: nothing changed, and its comments already
      // stand as they are — none is made twice.
      const again = await reimport(second, changed.sourceVersionId);
      expect(again.resultKind).toBe('no-change');
      expect(imported()).toEqual({ total: IMPORTED_MARKS });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('keeps the file\'s pending insertion one mark across a changed reimport, set exact again where it stood (Issue #412)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised());
      expect(importedMarkCount()).toEqual({ total: IMPORTED_MARKS });
      // The same file with one paragraph added: a changed reimport, the added paragraph resolved 改写与新增. ¶2's insertion is a
      // point, which the rewrite leaves drifted, since a point is never found by its words. The file's insertion at that
      // same place is that one, set exact again rather than made twice beside it.
      const extended = await composeRevised({ ...REVISED, paragraphs: [...REVISED.paragraphs, { runs: [text(span(21))] }] });
      const changed = await reimportInto(store, commit.bookId, extended, null);
      expect(changed.resultKind).toBe('changed');
      expect(importedMarkCount()).toEqual({ total: IMPORTED_MARKS });
      const points = withDatabase(true, (database) => database.prepare(
        "SELECT anchor_state FROM editorial_marks WHERE source_kind = 'imported-author' AND pinned_text = '' ORDER BY created_at, mark_id",
      ).all()).map((row) => ({ ...row }));
      expect(points.length).toBeGreaterThan(0);
      expect(points.every((row) => row.anchor_state === 'exact')).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('makes an insertion the author rewrote anew, and leaves the old one drifted for the editor to settle (Issue #412)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised());
      // The author rewrote ¶2's pending insertion — the same point, other words, not accepted — and added a paragraph at the
      // end: a changed reimport in which ¶2, read without its insertions, is unchanged.
      const paragraphs = REVISED.paragraphs.map((paragraph, index) => (index === 1
        ? { runs: [text(span(10, 0, 20)), revised(span(11, 5, 10), 'ins', AUTHOR, '2026-09-02T10:01:00Z'), text(span(10, 20))] }
        : paragraph));
      const extended = await composeRevised({ ...REVISED, paragraphs: [...paragraphs, { runs: [text(span(21))] }] });
      const changed = await reimportInto(store, commit.bookId, extended, null);
      expect(changed.resultKind).toBe('changed');
      // The file's insertion proposes other words now: it is made, exact at the point. The old one proposes words the file no
      // longer does, so it is never set exact again showing them — it stays drifted, a 稿件冲突 the editor settles.
      expect(importedMarkCount()).toEqual({ total: IMPORTED_MARKS + 1 });
      expect(importedSuggestions().filter((row) => row.pinned === digest(''))).toEqual([
        { state: 'drifted', pinned: digest(''), proposed: digest(await read(span(11, 0, 5))) },
        { state: 'exact', pinned: digest(''), proposed: digest(await read(span(11, 5, 10))) },
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('sets each of two insertions at one point exact again as itself, alike or not, and makes neither twice (Issue #412)', async () => {
    // One author's two insertions at one point, made at different times, are two marks (D3 joins revisions only by their
    // date): in ¶1 with other words each, in ¶2 with the same words twice.
    const twice: Omit<ComposedRevisedRequest, 'source' | 'title'> = {
      paragraphs: [
        { runs: [
          text(span(10, 0, 20)), revised(span(11, 0, 5), 'ins', AUTHOR, '2026-09-01T10:01:00Z'),
          revised(span(11, 5, 10), 'ins', AUTHOR, '2026-09-01T10:05:00Z'), text(span(10, 20)),
        ] },
        { runs: [
          text(span(13, 0, 5)), revised(span(14, 0, 6), 'ins', AUTHOR, '2026-09-01T10:02:00Z'),
          revised(span(14, 0, 6), 'ins', AUTHOR, '2026-09-01T10:06:00Z'), text(span(13, 5)),
        ] },
      ],
    };
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised(twice));
      const imported = importedSuggestions();
      expect(imported.map((row) => row.state)).toEqual(['exact', 'exact', 'exact', 'exact']);
      expect(new Set(imported.map((row) => row.proposed)).size).toBe(3);
      // The same file with a paragraph added: a changed reimport. The rewrite leaves every point drifted; each of the file's
      // four insertions is one of the four marks, set exact again as itself — none made twice, none left drifted.
      const extended = await composeRevised({ paragraphs: [...twice.paragraphs, { runs: [text(span(21))] }] });
      const changed = await reimportInto(store, commit.bookId, extended, null, 4);
      expect(changed.resultKind).toBe('changed');
      expect(importedSuggestions()).toEqual(imported);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('makes a tracked replacement the author rewrote anew, even when the file reads as the manuscript does (Issue #412)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { commit } = await importRevised(store, await composeRevised());
      // ¶3's replacement proposes other words now. The words it deletes are the same, so the file read without its
      // insertions is the manuscript as it stands: a no-change reimport.
      const paragraphs = REVISED.paragraphs.map((paragraph, index) => (index === 2
        ? { runs: [
            text(span(13, 0, 5)), revised(span(13, 5, 9), 'del', AUTHOR, '2026-09-02T10:02:00Z'),
            revised(span(14, 6, 12), 'ins', AUTHOR, '2026-09-02T10:02:00Z'), text(span(13, 9)),
          ] }
        : paragraph));
      const again = await reimportInto(store, commit.bookId, await composeRevised({ ...REVISED, paragraphs }), null);
      expect(again.resultKind).toBe('no-change');
      // The new proposal is made on the same words, exact; the old one stays as it was, the editor's to settle.
      expect(importedMarkCount()).toEqual({ total: IMPORTED_MARKS + 1 });
      const replaced = digest(await read(span(13, 5, 9)));
      expect(importedSuggestions().filter((row) => row.pinned === replaced)).toEqual([
        { state: 'exact', pinned: replaced, proposed: digest(await read(span(14, 0, 6))) },
        { state: 'exact', pinned: replaced, proposed: digest(await read(span(14, 6, 12))) },
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});

/**
 * A reimport of `path` into the Book, every row resolved by a verb its shape admits, none preselected; committed. The file
 * carries `marks` comments and tracked changes.
 */
async function reimportInto(store: EditorialStore, bookId: string, path: string, reuseSourceVersionId: string | null, marks = IMPORTED_MARKS) {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  expect(staged.fidelity[1]).toMatchObject({ count: marks, status: 'preserved' });
  const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
    kind: 'existing-book', bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId,
  });
  let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  let review = prepared.review!;
  // A reimport converts them as the first import does (MARK-009): 完整保留, and no decision to take for them.
  expect(review.fidelity[1]).toEqual({
    key: 'comments-revisions', label: '批注与修订', count: marks, status: 'preserved', statusLabel: '完整保留',
    detail: COMMENTS_REVISIONS_DETAIL,
  });
  expect(review.degradationDecision.items.some((item) => item.categoryKey === 'comments-revisions')).toBe(false);
  // Every row resolved by a verb its shape admits, none preselected.
  for (;;) {
    const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
    const open = page.items.find((item) => item.verb === null);
    if (open === undefined) break;
    const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, open.groupId,
      open.verbs.includes('rewrite') ? 'rewrite' : open.verbs[0]!);
    let progress = store.advanceReimportResolutionWork(work.workId);
    while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
    review = progress.review!;
  }
  expect(review.commitReady).toBe(true);
  const commitWork = await store.createManuscriptReimportCommitWork({
    draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
  });
  let result = commitWork.result;
  while (result === null) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    result = (await store.advanceManuscriptReimportCommitWork(commitWork.workId!)).result;
  }
  return result;
}

/** The imported 修改建议 in the order they were made: each one's anchor state, and its words and proposal by digest. */
function importedSuggestions(): Array<{ state: string; pinned: string; proposed: string }> {
  return withDatabase(true, (database) => database.prepare(
    `SELECT em.anchor_state, em.pinned_text, i.proposed_text FROM editorial_marks em
     JOIN proposal_change_items i ON i.mark_id = em.mark_id
     WHERE em.source_kind = 'imported-author' ORDER BY em.rowid`,
  ).all()).map((row) => ({ state: String(row.anchor_state), pinned: digest(String(row.pinned_text)), proposed: digest(String(row.proposed_text)) }));
}

/** The imported marks by the file's two authors, however many the reimports made. */
function importedMarkCount() {
  return withDatabase(true, (database) =>
    database.prepare("SELECT count(*) total FROM editorial_marks WHERE source_kind = 'imported-author' AND source_label IN (?, ?)").get(AUTHOR, OTHER));
}

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
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE ${relation}`);
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
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DECISION_FEEDBACK_SCHEMA_VERSION);
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
