import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type {
  BookRecordPresentation,
  CreateEditorialMarkInput,
  EditorialMarkKind,
  ManuscriptReimportCommitProjection,
  ReimportGroupVerb,
  ReviewBeforeManuscriptReimportProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText, type SourceSpan } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the chapter-level Reimport Comparison (Issue #412, plan slice S63; V2-UX-IMP-041,
// IMP-042, IMP-057) over the real `EditorialStore` on a temporary Agent Data Root. Both files are composed from exact
// `sample1`'s paragraphs; the marks' bodies are neutral authored phrases. Assertions compare positions, counts, verbs and
// outcomes; no manuscript text is printed.

const SOURCE = ADMITTED_BASELINE_DOCX;
let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

const span = (block: number, from?: number, to?: number): SourceSpan => ({ block, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) });
const paragraph = (...spans: SourceSpan[]) => ({ runs: spans.map((text) => ({ text })) });

async function compose(name: string, paragraphs: ReadonlyArray<ReturnType<typeof paragraph>>): Promise<string> {
  const path = join(roots.inputRoot, `${name}.docx`);
  await composeRevisedDocx(path, { source: SOURCE, title: '章节对应组稿', paragraphs });
  return path;
}

interface Book { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, path: string): Promise<Book> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** A mark on the words `from`–`to` of the manuscript's `position`th block (1-based). */
function mark(store: EditorialStore, book: Book, position: number, from: number, to: number, kind: EditorialMarkKind, body: string): string {
  const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = view.blocks[position - 1]!;
  const input: CreateEditorialMarkInput = {
    manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: view.blocks[0]!.blockId, clientMarkId: randomUUID(),
    baseRevisionId: view.revisionId, expectedJournalSequence: view.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
    fromGrapheme: from, toGrapheme: to, selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind, highlightColor: null, body, proposedText: null, rationale: null,
  };
  return store.createEditorialMark(input).markId;
}

async function prepareReimport(store: EditorialStore, book: Book, path: string, lineageSourceVersionId: string | null = null): Promise<ReviewBeforeManuscriptReimportProjection> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
    kind: 'existing-book', bookId: book.bookId, relationship: 'reimport',
    lineage: lineageSourceVersionId === null ? { kind: 'unconfirmed' } : { kind: 'verified-source-version', sourceVersionId: lineageSourceVersionId },
    reuseSourceVersionId: null,
  });
  let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  return prepared.review!;
}

function resolve(store: EditorialStore, review: ReviewBeforeManuscriptReimportProjection, groupId: string, verb: ReimportGroupVerb): ReviewBeforeManuscriptReimportProjection {
  const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, groupId, verb);
  let progress = store.advanceReimportResolutionWork(work.workId);
  while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
  return progress.review!;
}

async function commit(store: EditorialStore, review: ReviewBeforeManuscriptReimportProjection): Promise<ManuscriptReimportCommitProjection> {
  const work = await store.createManuscriptReimportCommitWork({
    draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
  });
  let result = work.result;
  while (result === null) {
    await new Promise((resolveStep) => setTimeout(resolveStep, 5));
    result = (await store.advanceManuscriptReimportCommitWork(work.workId!)).result;
  }
  return result as ManuscriptReimportCommitProjection;
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

describe('the chapter-level Reimport Comparison', () => {
  it('gathers the changes into rows the editor resolves by one verb each, and carries the marks along or lists them', async () => {
    // Eight paragraphs of sample1; the new file splits the second, merges the fourth and fifth, drops the seventh and
    // adds one at the end. Every other paragraph is exactly as it was.
    const first = await compose('first', [1, 2, 3, 4, 5, 6, 7, 8].map((block) => paragraph(span(block + 20))));
    const second = await compose('second', [
      paragraph(span(21)),
      paragraph(span(22, 0, 12)), paragraph(span(22, 12)),
      paragraph(span(23)),
      paragraph(span(24), span(25)),
      paragraph(span(26)),
      paragraph(span(28)),
      paragraph(span(40)),
    ]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let record: Extract<BookRecordPresentation, { kind: 'manuscript-reimport-record' }>;
    let noteId: string;
    let splitMark: string;
    let mergedMark: string;
    let book: Book;
    try {
      book = await importBook(store, first);
      // A 批注 on the second paragraph's first words, one on the fifth's, and a 备注 on the seventh.
      splitMark = mark(store, book, 2, 0, 6, 'annotation', '请核对这一句。');
      mergedMark = mark(store, book, 5, 2, 8, 'annotation', '与前文一致吗？');
      noteId = mark(store, book, 7, 0, 4, 'editor-note', '二校时再看。');

      let review = await prepareReimport(store, book, second);
      expect(review.comparison).toMatchObject({ changed: true, groups: 4, unresolvedGroups: 4, exactBlocks: 4 });
      expect(review.commitReady).toBe(false);
      const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(page.items.map((row) => [row.ordinal, row.current.count, row.staged.count, row.verbs, row.verb, row.chapterLabel])).toEqual([
        [1, 1, 2, ['split', 'rewrite', 'delete'], null, null],
        [2, 2, 1, ['rewrite', 'delete', 'merge'], null, null],
        [3, 1, 0, ['delete'], null, null],
        [4, 0, 1, ['rewrite'], null, null],
      ]);
      expect(page.items.map((row) => [row.current.from, row.current.to, row.staged.from, row.staged.to])).toEqual([
        [2, 2, 2, 3], [4, 5, 5, 5], [7, 7, null, null], [null, null, 8, 8],
      ]);
      // Each side shows its paragraphs' words, the whole of each here.
      const firstRow = page.items[0]!;
      expect(firstRow.current.excerpts.map((excerpt) => [excerpt.position, excerpt.truncated])).toEqual([[2, false]]);
      expect(firstRow.staged.excerpts.map((excerpt) => excerpt.text).join('')).toBe(firstRow.current.excerpts[0]!.text);

      // A verb the row's shape does not admit is refused, and nothing is written.
      expect(code(() => store.createReimportResolutionWork(review.draftId, review.draftVersion, page.items[2]!.groupId, 'rewrite'))).toBe('REIMPORT_MAPPING_INVALID');
      review = resolve(store, review, page.items[0]!.groupId, 'split');
      review = resolve(store, review, page.items[1]!.groupId, 'merge');
      review = resolve(store, review, page.items[2]!.groupId, 'delete');
      expect(review.commitReady).toBe(false);
      expect(code(() => store.createReimportResolutionWork(review.draftId, review.draftVersion, page.items[0]!.groupId, 'rewrite'))).toBe('REIMPORT_MAPPING_INVALID');
      review = resolve(store, review, page.items[3]!.groupId, 'rewrite');
      expect(review.comparison).toMatchObject({ groups: 4, unresolvedGroups: 0, unresolvedMappings: 0 });
      expect(review.commitReady).toBe(true);
      const resolved = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(resolved.items.map((row) => row.verb)).toEqual(['split', 'merge', 'delete', 'rewrite']);

      const result = await commit(store, review);
      expect(result.resultKind).toBe('changed');
      record = result.receipt;
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The record names every row and its verb, and what each mark of a changed row came to.
    expect(record.groups).toEqual({
      count: 4,
      items: [
        { ordinal: 1, verb: 'split', verbLabel: '拆分', chapterLabel: null, currentFrom: 2, currentTo: 2, stagedFrom: 2, stagedTo: 3 },
        { ordinal: 2, verb: 'merge', verbLabel: '并入', chapterLabel: null, currentFrom: 4, currentTo: 5, stagedFrom: 5, stagedTo: 5 },
        { ordinal: 3, verb: 'delete', verbLabel: '删除', chapterLabel: null, currentFrom: 7, currentTo: 7, stagedFrom: null, stagedTo: null },
        { ordinal: 4, verb: 'rewrite', verbLabel: '改写与新增', chapterLabel: null, currentFrom: null, currentTo: null, stagedFrom: 8, stagedTo: 8 },
      ],
    });
    expect(record.markOutcomes).toMatchObject({ followed: 2, unfollowed: 1 });
    expect(record.markOutcomes.items.map((item) => [item.markId, item.kind, item.fromPosition])).toEqual([[noteId, 'editor-note', 7]]);
    expect(record.markOutcomes.items[0]!.words).toBe(graphemesOf(await sourceSpanText(SOURCE, span(27))).slice(0, 4).join(''));

    // A restart validates the comparison, its rows and their verbs, and reads the marks where they followed.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const view = reopened.getManuscriptWindow(book!.manuscriptId, book!.branchId, null);
      const standing = new Map(view.marks.map((entry) => [entry.markId, entry]));
      const blockPosition = (markId: string) => view.blocks.findIndex((block) => block.blockId === standing.get(markId)?.blockId) + 1;
      // The split paragraph's first words are the first new paragraph's; the merged fifth's words stand in the merged one.
      expect([blockPosition(splitMark!), blockPosition(mergedMark!)]).toEqual([2, 5]);
      expect(standing.get(splitMark!)?.anchorState).toBe('exact');
      expect(standing.get(mergedMark!)?.anchorState).toBe('exact');
      // The 备注 on the dropped paragraph is set aside, kept, and not drawn on the text.
      expect(standing.has(noteId!)).toBe(false);
      expect(reopened.getEditorialMarkCard(book!.manuscriptId, book!.branchId, noteId!).anchorState).toBe('detached');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('keeps an edited paragraph’s own identity in a three-way comparison, and the store opens again', async () => {
    // Three paragraphs of sample1. The editor adds words to the first and does not save a milestone; the new file keeps
    // the first as the source had it and replaces the second. Against the verified source the first is an edit row
    // (the new file's words are the source's), the second a delete and an insert: one row, current 1–2 → new 1–2.
    const first = await compose('base', [paragraph(span(21)), paragraph(span(22)), paragraph(span(23))]);
    const second = await compose('revised', [paragraph(span(21)), paragraph(span(24)), paragraph(span(23))]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Book;
    let before: string[];
    try {
      book = await importBook(store, first);
      const source = store.getBookOverview(book.bookId).records.find((record) => record.kind === 'source');
      if (source?.kind !== 'source') throw new Error('the imported Book has no source version');
      const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      before = view.blocks.map((block) => block.blockId);
      const edited = view.blocks[0]!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
        baseRevisionId: view.revisionId, blockId: edited.blockId, windowStartBlockId: edited.blockId,
        baseBlockDigest: edited.digest, expectedJournalSequence: view.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '（本地）',
      });

      let review = await prepareReimport(store, book, second, source.sourceVersionId);
      expect(review.lineage.comparisonKind).toBe('three-way');
      expect(review.comparison).toMatchObject({ groups: 1, unresolvedGroups: 1, exactBlocks: 1 });
      const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(page.items.map((row) => [row.current.from, row.current.to, row.staged.from, row.staged.to, row.verbs]))
        .toEqual([[1, 2, 1, 2, ['rewrite', 'delete']]]);
      review = resolve(store, review, page.items[0]!.groupId, 'rewrite');
      expect((await commit(store, review)).resultKind).toBe('changed');
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The restart validates the edit row's resolution: it carries the paragraph's own identity, which no other row
    // claims. 改写与新增 kept both current identities in order.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const view = reopened.getManuscriptWindow(book!.manuscriptId, book!.branchId, null);
      expect(view.blocks.map((block) => block.blockId)).toEqual(before!);
      expect(view.blocks.map((block) => block.text)).toEqual(await Promise.all([21, 24, 23].map((block) => sourceSpanText(SOURCE, span(block)))));
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);
});
