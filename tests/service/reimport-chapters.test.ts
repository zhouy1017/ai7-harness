import { createHash, randomUUID } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('node:crypto', async (original) => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

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

async function importBook(store: EditorialStore, path: string, acceptDegradation = false): Promise<Book> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, acceptDegradation);
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
    let anchoredMark: string;
    let book: Book;
    try {
      book = await importBook(store, first);
      // A 批注 on the second paragraph's first words, one on the fifth's, and a 备注 on the seventh.
      splitMark = mark(store, book, 2, 0, 6, 'annotation', '请核对这一句。');
      mergedMark = mark(store, book, 5, 2, 8, 'annotation', '与前文一致吗？');
      // …and a 批注 on the third, which the new file keeps exactly: an anchor, one place later.
      anchoredMark = mark(store, book, 3, 0, 4, 'annotation', '这一段不动。');
      noteId = mark(store, book, 7, 0, 4, 'editor-note', '二校时再看。');
      // The editor was last at the sixth paragraph, which the new file keeps as it was.
      const entryBlockId = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[5]!.blockId;
      store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, entryBlockId, 3);

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
      review = resolve(store, review, page.items[0]!.groupId, 'rewrite');
      review = resolve(store, review, page.items[0]!.groupId, 'split');
      review = resolve(store, review, page.items[3]!.groupId, 'rewrite');
      expect(review.comparison).toMatchObject({ groups: 4, unresolvedGroups: 0, unresolvedMappings: 0 });
      expect(review.commitReady).toBe(true);
      const resolved = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(resolved.items.map((row) => row.verb)).toEqual(['split', 'merge', 'delete', 'rewrite']);

      const result = await commit(store, review);
      expect(result.resultKind).toBe('changed');
      // The reimport returns to the manuscript where the editor was, as the reimport mapped that place.
      expect(result.window.focusBlockId).toBe(entryBlockId);
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
      // A mark on a paragraph that matched exactly is untouched: it stands where its paragraph now stands.
      expect(blockPosition(anchoredMark!)).toBe(4);
      expect(standing.get(anchoredMark!)?.anchorState).toBe('exact');
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

  it('settles a mark once when its words move onto the next paragraph of the same row', async () => {
    // Two paragraphs: the first one's second half moves to the start of the second, which also gains words. One row,
    // current 1–2 → new 1–2, resolved 改写与新增, so each new paragraph carries its current one's identity.
    const first = await compose('moved-base', [paragraph(span(21)), paragraph(span(22))]);
    const second = await compose('moved-revised', [paragraph(span(21, 0, 10)), paragraph(span(21, 10), span(22), span(23, 0, 8))]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, first);
      // A 批注 on words of the first paragraph's second half.
      const moved = mark(store, book, 1, 10, 16, 'annotation', '这一句挪到下一段了。');
      let review = await prepareReimport(store, book, second);
      const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(page.items.map((row) => [row.current.from, row.current.to, row.staged.from, row.staged.to])).toEqual([[1, 2, 1, 2]]);
      expect(page.items[0]!.verbs).toContain('rewrite');
      review = resolve(store, review, page.items[0]!.groupId, 'rewrite');
      // The mark follows its words onto the second paragraph and is settled once: the reimport commits.
      const result = await commit(store, review);
      expect(result.resultKind).toBe('changed');
      expect(result.receipt.markOutcomes).toMatchObject({ followed: 1, unfollowed: 0 });
      const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const standing = view.marks.find((entry) => entry.markId === moved);
      expect(standing?.anchorState).toBe('exact');
      expect(view.blocks.findIndex((block) => block.blockId === standing?.blockId) + 1).toBe(2);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('sets a mark aside when a split leaves its words twice, never landing it on the other place', async () => {
    // One paragraph whose opening words stand twice; the new file splits it between the two.
    const first = await compose('twice-base', [paragraph(span(21, 0, 6), span(21, 0, 6), span(22))]);
    const second = await compose('twice-revised', [paragraph(span(21, 0, 6)), paragraph(span(21, 0, 6), span(22))]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, first);
      // A 批注 on the second place the words stand.
      const markId = mark(store, book, 1, 6, 12, 'annotation', '第二处。');
      let review = await prepareReimport(store, book, second);
      const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(page.items.map((row) => [row.current.from, row.current.to, row.staged.from, row.staged.to])).toEqual([[1, 1, 1, 2]]);
      expect(page.items[0]!.verbs).toContain('split');
      review = resolve(store, review, page.items[0]!.groupId, 'split');
      const result = await commit(store, review);
      // Its words now stand in both new paragraphs: it is set aside and listed, never moved onto the first place.
      expect(result.receipt.markOutcomes).toMatchObject({ followed: 0, unfollowed: 1 });
      expect(result.receipt.markOutcomes.items.map((item) => item.markId)).toEqual([markId]);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).anchorState).toBe('detached');
      // The author's next file changes another paragraph. The mark stays set aside, as the record and the notice said: the
      // rewrite never reads it against the text its block holds — where its words now stand — and nothing lists it again.
      const third = await compose('twice-later', [paragraph(span(21, 0, 6)), paragraph(span(21, 0, 6), span(22)), paragraph(span(23))]);
      let later = await prepareReimport(store, book, third);
      for (const row of store.getReimportMappingPage(later.draftId, later.draftVersion, null).items) {
        if (row.verb === null) later = resolve(store, later, row.groupId, row.verbs.includes('rewrite') ? 'rewrite' : row.verbs[0]!);
      }
      const again = await commit(store, later);
      expect(again.resultKind).toBe('changed');
      expect(again.receipt.markOutcomes).toMatchObject({ followed: 0, unfollowed: 0, items: [] });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).anchorState).toBe('detached');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks.map((entry) => entry.markId)).not.toContain(markId);
      store.markCleanShutdown();
    } finally {
      store.close();
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

  // Synthetic words authored for this suite: the one Markdown construct is there to be counted as a degradation.
  const EMPHASIS = '带 *强调* 的一段。';
  it.each([
    { format: 'TXT', extension: 'txt', extra: [] as string[], degraded: false },
    { format: 'MD', extension: 'md', extra: [EMPHASIS], degraded: true },
  ])('commits a reimport from a converted $format, re-reading the working representation its review read (#597)', async ({ format, extension, extra, degraded }) => {
    // Three paragraphs of sample1 as plain text, and a new file that replaces the second. Both are read through the DOCX
    // working representation the converter makes of them; the commit re-reads that, never the kept original, which is
    // not a Word document. The Markdown pair also keeps an emphasis, so its fidelity is the conversion's, not the parser's.
    const text = async (name: string, blocks: ReadonlyArray<number>): Promise<string> => {
      const path = join(roots.inputRoot, `${name}.${extension}`);
      const paragraphs = await Promise.all(blocks.map((block) => sourceSpanText(SOURCE, span(block))));
      await writeFile(path, `${[...paragraphs, ...extra].join('\n\n')}\n`, 'utf8');
      return path;
    };
    const first = await text('base', [21, 22, 23]);
    const second = await text('revised', [21, 24, 23]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Book;
    try {
      book = await importBook(store, first, degraded);
      let review = await prepareReimport(store, book, second);
      if (degraded) review = store.acceptReimportDegradation(review.draftId, review.draftVersion);
      const page = store.getReimportMappingPage(review.draftId, review.draftVersion, null);
      expect(page.items.length).toBeGreaterThan(0);
      for (const row of page.items) review = resolve(store, review, row.groupId, row.verbs[0]!);
      expect((await commit(store, review)).resultKind).toBe('changed');
      const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(view.blocks.map((block) => block.text))
        .toEqual([...await Promise.all([21, 24, 23].map((block) => sourceSpanText(SOURCE, span(block)))), ...extra]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // The reimport's Source Version is the file's own format, linked to the working representation it was read through,
    // as the first import's is; and the store opens again.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(database.prepare(
        `SELECT format, working_object_digest IS NOT NULL AS converted, converter_identity
         FROM source_versions WHERE book_id = ? ORDER BY created_at, rowid`,
      ).all(book!.bookId).map((row) => ({ ...row }))).toEqual([
        { format, converted: 1, converter_identity: 'ai7-text-to-docx/1' },
        { format, converted: 1, converter_identity: 'ai7-text-to-docx/1' },
      ]);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    reopened.markCleanShutdown();
    reopened.close();
  }, 180_000);

  it.each([
    // Two blank lines become one whitespace-only line: the same size, and the converter reads both as one paragraph
    // break, so the working representation is byte-identical and only the original's own digest can tell (#606's review).
    { change: 'converts to the same working representation', tamper: (text: string) => text.replace('\n\n\n', '\n \n') },
    // A character added before the break in place of one of its line ends: the same size, a different conversion.
    { change: 'converts to a different working representation', tamper: (text: string) => text.replace('\n\n\n', 'x\n\n') },
  ])('refuses to commit a converted reimport whose kept original changed and $change (#597)', async ({ tamper }) => {
    const paragraphs = await Promise.all([21, 22, 23, 24].map((block) => sourceSpanText(SOURCE, span(block))));
    const first = join(roots.inputRoot, 'base.txt');
    await writeFile(first, `${paragraphs[0]}\n\n${paragraphs[1]}\n\n${paragraphs[2]}\n`, 'utf8');
    const second = join(roots.inputRoot, 'revised.txt');
    await writeFile(second, `${paragraphs[0]}\n\n\n${paragraphs[3]}\n\n${paragraphs[2]}\n`, 'utf8');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, first);
      let review = await prepareReimport(store, book, second);
      for (const row of store.getReimportMappingPage(review.draftId, review.draftVersion, null).items) {
        review = resolve(store, review, row.groupId, row.verbs[0]!);
      }
      // The kept original is the content object named by the revised file's digest.
      const bytes = await readFile(second);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const kept = join(roots.dataRoot, 'objects', 'sha256', digest.slice(0, 2), `${digest}.txt`);
      expect((await readFile(kept)).equals(bytes)).toBe(true);
      const tampered = Buffer.from(tamper(bytes.toString('utf8')), 'utf8');
      expect(tampered.byteLength).toBe(bytes.byteLength);
      expect(tampered.equals(bytes)).toBe(false);
      await writeFile(kept, tampered);

      await expect(commit(store, review)).rejects.toMatchObject({ code: 'SNAPSHOT_RESELECTION_REQUIRED' });
      // Nothing was committed: the manuscript still reads as the first file, and the Book has one Source Version.
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.map((block) => block.text))
        .toEqual(paragraphs.slice(0, 3));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM source_versions').get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  }, 180_000);
});

// #1638: each compatible ordered pair of the four verbs, over both split and merge rows.
describe('editing an import review again (#1638)', () => {
  it.each(['split', 'merge'] as const)('re-chooses every compatible ordered pair on a %s row and returns just that row', async (shape) => {
    const first = await compose('pair-base', [21, 22, 23, 24].map((b) => paragraph(span(b))));
    const second = await compose('pair-new', shape === 'split'
      ? [paragraph(span(21)), paragraph(span(22, 0, 12)), paragraph(span(22, 12)), paragraph(span(23)), paragraph(span(24))]
      : [paragraph(span(21)), paragraph(span(22), span(23)), paragraph(span(24))]);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, first);
      for (const before of (shape === 'split' ? ['split', 'rewrite', 'delete'] : ['merge', 'rewrite', 'delete']) as ReimportGroupVerb[]) {
        for (const after of (shape === 'split' ? ['split', 'rewrite', 'delete'] : ['merge', 'rewrite', 'delete']) as ReimportGroupVerb[]) {
          let review = await prepareReimport(store, book, second);
          const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
          review = resolve(store, review, row.groupId, before);
          const version = review.draftVersion;
          const work = store.createReimportResolutionWork(review.draftId, version, row.groupId, after);
          let progress = store.advanceReimportResolutionWork(work.workId);
          while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
          expect(progress.review).toMatchObject({ draftVersion: version + 1, unresolvedGroups: 0, row: { groupId: row.groupId, verb: after } });
          expect(code(() => store.createReimportResolutionWork(review.draftId, version, row.groupId, after))).toBe('DRAFT_VERSION_CHANGED');
          review = progress.review!;
          expect(store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!.verb).toBe(after);
          await store.abandonImportDraft(review.draftId, review.draftVersion);
        }
      }
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 180_000);

  it('keeps choices across restart and 返回修改 and commits the same final choices as one pass', async () => {
    const first = await compose('return-base', [21, 22, 23].map((b) => paragraph(span(b))));
    const second = await compose('return-new', [paragraph(span(21)), paragraph(span(22, 0, 12)), paragraph(span(22, 12)), paragraph(span(23))]);
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, first);
      let review = await prepareReimport(store, book, second);
      const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
      review = resolve(store, review, row.groupId, 'delete');
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const returned = store.returnImportToEditing(review.draftId, review.draftVersion);
      expect(returned.state).toBe('reimport');
      if (returned.state !== 'reimport') throw new Error('expected comparison');
      expect(returned.draftVersion).toBe(review.draftVersion + 1);
      expect(store.getReimportMappingPage(review.draftId, returned.draftVersion, null).items[0]!.verb).toBe('delete');
      expect(code(() => store.returnImportToEditing(review.draftId, review.draftVersion))).toBe('DRAFT_VERSION_CHANGED');
      review = resolve(store, returned.review, row.groupId, 'split');
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!.verb).toBe('split');
      const result = await commit(store, review);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const digests = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.map((b) => b.digest);
      const directRoots = await createServiceTestRoots();
      const directStore = await EditorialStore.open(directRoots.dataRoot, directRoots.codeRoot);
      try {
      const direct = await importBook(directStore, first);
      let onePass = await prepareReimport(directStore, direct, second);
      onePass = resolve(directStore, onePass, directStore.getReimportMappingPage(onePass.draftId, onePass.draftVersion, null).items[0]!.groupId, 'split');
      const directResult = await commit(directStore, onePass);
      expect(directStore.getManuscriptWindow(direct.manuscriptId, direct.branchId, null).blocks.map((b) => b.digest)).toEqual(digests);
      expect(result.receipt.groups).toEqual(directResult.receipt.groups);
      directStore.markCleanShutdown();
      } finally { directStore.close(); await directRoots.dispose(); }
      expect(code(() => store.returnImportToEditing(review.draftId, review.draftVersion))).toBe('DRAFT_STATE_CHANGED');
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 180_000);

  it('rolls a stopped replacement back as one transaction and keeps the old choice on restart', async () => {
    const first = await compose('atomic-base', [21, 22, 23].map((b) => paragraph(span(b))));
    const second = await compose('atomic-new', [paragraph(span(21)), paragraph(span(24)), paragraph(span(23))]);
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let review!: ReviewBeforeManuscriptReimportProjection;
    let groupId!: string;
    try {
      const book = await importBook(store, first);
      review = await prepareReimport(store, book, second);
      groupId = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!.groupId;
      review = resolve(store, review, groupId, 'rewrite');
      store.markCleanShutdown();
    } finally { store.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
      interruptReimportResolutionAfterDelete: true,
    });
    try {
      expect(code(() => resolve(store, review, groupId, 'delete'))).toBe('REIMPORT_RESOLUTION_INTERRUPTED');
    } finally { store.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!.verb).toBe('rewrite');
      const returned = store.returnImportToEditing(review.draftId, review.draftVersion);
      await store.abandonImportDraft(review.draftId, returned.draftVersion);
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 180_000);

  it('returns new-book and source details to their staged page, preserving the retained source', async () => {
    const path = await compose('staged-return', [21, 22, 23].map((b) => paragraph(span(b))));
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      for (const sourceOnly of [false, true]) {
        const staged = await store.stageSelectedManuscript(randomUUID(), path);
        const target = { kind: 'new-book' as const, choiceId: 'new-book' as const, confirmedTitle: staged.titleSuggestion.value };
        const review = sourceOnly ? store.prepareSourceImportReview(staged.draftId, staged.draftVersion, { ...target, relationship: 'source-only' })
          : store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
        store.markCleanShutdown(); store.close();
        store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
        const returned = store.returnImportToEditing(staged.draftId, review.draftVersion);
        expect(returned).toMatchObject({ state: 'staged', draftVersion: review.draftVersion + 1, staged: { source: staged.source },
          editingChoices: { target: review.target, title: target.confirmedTitle, relationship: sourceOnly ? 'source-only' : 'first-manuscript',
            textBoxDisposition: sourceOnly ? null : (review as { textBoxDisposition: unknown }).textBoxDisposition, trackedChanges: null, structure: null, acceptance: false } });
        expect(code(() => store.returnImportToEditing(staged.draftId, review.draftVersion))).toBe('DRAFT_VERSION_CHANGED');
        const again = sourceOnly ? store.prepareSourceImportReview(staged.draftId, returned.draftVersion, { ...target, relationship: 'source-only' })
          : store.prepareNewBookReview(staged.draftId, returned.draftVersion, target, false);
        expect(again.draftVersion).toBe(returned.draftVersion + 1);
        await store.abandonImportDraft(staged.draftId, again.draftVersion);
      }
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 180_000);
});

it.each([false, true])('accepts reduced fidelity on submission only when required=%s, and a replay records once (#1638)', async (required) => {
  const first = await compose('accept-base', [21, 22, 23].map((b) => paragraph(span(b))));
  const second = join(roots.inputRoot, required ? 'accept-new.md' : 'accept-new.docx');
  if (required) await writeFile(second, (await Promise.all([21, 24, 23].map((b) => sourceSpanText(SOURCE, span(b))))).join('\n\n') + '\n\n*' + await sourceSpanText(SOURCE, span(25)) + '*\n');
  else await composeRevisedDocx(second, { source: SOURCE, title: '提交测试', paragraphs: [21, 24, 23].map((b) => paragraph(span(b))) });
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const book = await importBook(store, first);
    let review = await prepareReimport(store, book, second);
    for (const row of store.getReimportMappingPage(review.draftId, review.draftVersion, null).items) review = resolve(store, review, row.groupId, 'rewrite');
    const input = { draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID() };
    if (required) {
      const before = tableState();
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const version = db.prepare('PRAGMA data_version').get();
        await expect(store.createManuscriptReimportCommitWork(input)).rejects.toMatchObject({ code: 'DEGRADATION_ACCEPTANCE_REQUIRED' });
        expect(db.prepare('PRAGMA data_version').get()).toEqual(version);
        expect(tableState()).toEqual(before);
      } finally { db.close(); }
    }
    const work = await store.createManuscriptReimportCommitWork({ ...input, acceptDegradation: true });
    const firstRow = store.getReimportMappingPage(review.draftId, review.draftVersion + (required ? 1 : 0), null).items[0]!;
    expect(code(() => store.createReimportResolutionWork(review.draftId, review.draftVersion + (required ? 1 : 0), firstRow.groupId, 'delete'))).toBe('SERVICE_BUSY');
    let result = work.result;
    while (result === null) { await new Promise((next) => setTimeout(next, 5)); result = (await store.advanceManuscriptReimportCommitWork(work.workId!)).result; }
    if (required) expect(result.receipt.degradationDecision?.summaryLabel).toBe('含已接受的降级');
    else expect(result.receipt.degradationDecision).toBeNull();
    store.markCleanShutdown(); store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const replay = await store.createManuscriptReimportCommitWork(required ? { ...input, acceptDegradation: true } : input);
    let replayed = replay.result;
    while (replayed === null) { await new Promise((next) => setTimeout(next, 5)); replayed = (await store.advanceManuscriptReimportCommitWork(replay.workId!)).result; }
    expect(replayed.commitId).toBe(input.commitId);
    expect(store.getBookOverview(book.bookId).records.filter((r) => r.kind === 'manuscript-reimport-record')).toHaveLength(1);
    store.markCleanShutdown();
  } finally { store.close(); }
}, 180_000);

it('refuses return during a draft job and honors the abandonment cleanup fence (#1638)', async () => {
  const first = await compose('fence-base', [21, 22, 23].map((b) => paragraph(span(b))));
  const second = await compose('fence-new', [21, 24, 23].map((b) => paragraph(span(b))));
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: true, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  let abandonedDraft!: { id: string; version: number };
  try {
    const book = await importBook(store, first);
    const review = await prepareReimport(store, book, second);
    const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
    const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, row.groupId, 'rewrite');
    expect(code(() => store.returnImportToEditing(review.draftId, review.draftVersion))).toBe('SERVICE_BUSY');
    store.cancelReimportResolutionWork(work.workId);
    const returned = store.returnImportToEditing(review.draftId, review.draftVersion);
    await expect(store.abandonImportDraft(review.draftId, returned.draftVersion)).rejects.toMatchObject({ code: 'ABANDON_CLEANUP_FAILED' });
    expect(code(() => store.returnImportToEditing(review.draftId, returned.draftVersion))).toBe('ABANDON_CLEANUP_PENDING');
    expect(code(() => store.createReimportResolutionWork(review.draftId, returned.draftVersion, row.groupId, 'delete'))).toBe('ABANDON_CLEANUP_PENDING');
    abandonedDraft = { id: review.draftId, version: returned.draftVersion };
    store.markCleanShutdown();
  } finally { store.close(); }
  const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    expect(code(() => reopened.returnImportToEditing(abandonedDraft.id, abandonedDraft.version))).toBe('DRAFT_NOT_FOUND');
    reopened.markCleanShutdown();
  } finally { reopened.close(); }
}, 180_000);

it('refuses returning an uncertain attempt until startup has proved its outcome (#1638)', async () => {
  const path = await compose('uncertain-return', [21, 22, 23].map((b) => paragraph(span(b))));
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  let draftId!: string;
  let version!: number;
  try {
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
    draftId = staged.draftId; version = review.draftVersion;
    await expect(store.commitNewBookImport({ draftId, expectedDraftVersion: version, reviewDigest: review.reviewDigest!, commitId: randomUUID() },
      { interruptAfterAttempt: true })).rejects.toBeDefined();
  } finally { store.close(); }
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: true, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    expect((await store.getImportStartup()).state).toBe('outcome-uncertain');
    expect(code(() => store.returnImportToEditing(draftId, version))).toBe('IMPORT_COMMIT_OUTCOME_UNCERTAIN');
    store.markCleanShutdown();
  } finally { store.close(); }
});

it('clears a proved uncommitted prepared attempt when returning to editing (#1638)', async () => {
  const path = await compose('prepared-return', [21, 22, 23].map((b) => paragraph(span(b))));
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  let version!: number;
  let draftId!: string;
  try {
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
    draftId = staged.draftId; version = review.draftVersion;
    await expect(store.commitNewBookImport({ draftId, expectedDraftVersion: version, reviewDigest: review.reviewDigest!, commitId: randomUUID() },
      { interruptAfterAttempt: true })).rejects.toBeDefined();
  } finally { store.close(); }
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    expect((await store.getImportStartup()).state).toBe('draft-recovery');
    const returned = store.returnImportToEditing(draftId, version);
    if (returned.state !== 'staged') throw new Error('expected staged');
    const review = store.prepareNewBookReview(draftId, returned.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: returned.staged.titleSuggestion.value }, false);
    const result = await store.commitNewBookImport({ draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    expect(result.completionLabel).toBe('稿件已导入');
    store.markCleanShutdown();
  } finally { store.close(); }
});

function tableState(dataRoot = roots.dataRoot): Record<string, string> {
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map((t) => {
      const rows = db.prepare('SELECT * FROM "' + String(t.name).replaceAll('"', '""') + '"').all().map((r) => JSON.stringify(r)).sort();
      return [String(t.name), createHash('sha256').update(JSON.stringify(rows)).digest('hex')];
    }));
  } finally { db.close(); }
}

it('records inline acceptance exactly like separate accept-then-submit in every table (#1638 review 2)', async () => {
  const first = await compose('equivalent-base', [21, 22, 23].map((b) => paragraph(span(b))));
  const second = join(roots.inputRoot, 'equivalent-new.md');
  await writeFile(second, (await Promise.all([21, 24, 23].map((b) => sourceSpanText(SOURCE, span(b))))).join('\n\n') + '\n\n*' + await sourceSpanText(SOURCE, span(25)) + '*\n');
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  let review!: ReviewBeforeManuscriptReimportProjection;
  try {
    const book = await importBook(store, first);
    review = await prepareReimport(store, book, second);
    for (const row of store.getReimportMappingPage(review.draftId, review.draftVersion, null).items) review = resolve(store, review, row.groupId, 'rewrite');
    store.markCleanShutdown();
  } finally { store.close(); }
  const other = await createServiceTestRoots();
  try {
    await cp(roots.dataRoot, other.dataRoot, { recursive: true });
    const commitId = randomUUID();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-22T00:00:00Z'));
    for (const [dataRoot, inline] of [[roots.dataRoot, false], [other.dataRoot, true]] as const) {
      let ordinal = 0;
      vi.mocked(randomUUID).mockImplementation(() => `00000000-0000-4000-8000-${String(++ordinal).padStart(12, '0')}`);
      store = await EditorialStore.open(dataRoot, roots.codeRoot);
      try {
        const accepted = inline ? review : store.acceptReimportDegradation(review.draftId, review.draftVersion);
        const work = await store.createManuscriptReimportCommitWork({ draftId: review.draftId, commitId,
          expectedDraftVersion: accepted.draftVersion, reviewDigest: accepted.reviewDigest, ...(inline ? { acceptDegradation: true } : {}) });
        let result = work.result;
        while (result === null) { await new Promise((next) => setTimeout(next, 5)); result = (await store.advanceManuscriptReimportCommitWork(work.workId!)).result; }
        store.markCleanShutdown();
      } finally { store.close(); }
      store = await EditorialStore.open(dataRoot, roots.codeRoot);
      store.markCleanShutdown(); store.close();
    }
    expect(tableState(other.dataRoot)).toEqual(tableState());
  } finally {
    vi.useRealTimers();
    vi.mocked(randomUUID).mockImplementation((await vi.importActual<typeof import('node:crypto')>('node:crypto')).randomUUID);
    await other.dispose();
  }
}, 180_000);

it('refuses an unresolved submission with acceptance without writing anything (#1638 re-check)', async () => {
  const first = await compose('open-base', [21, 22, 23].map((b) => paragraph(span(b))));
  const second = join(roots.inputRoot, 'open-new.md');
  await writeFile(second, (await Promise.all([21, 24, 23].map((b) => sourceSpanText(SOURCE, span(b))))).join('\n\n') + '\n\n*' + await sourceSpanText(SOURCE, span(25)) + '*\n');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const book = await importBook(store, first);
    const review = await prepareReimport(store, book, second);
    expect(review.comparison.unresolvedMappings).toBeGreaterThan(0);
    const before = tableState();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const version = db.prepare('PRAGMA data_version').get();
      await expect(store.createManuscriptReimportCommitWork({ draftId: review.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitId: randomUUID(), acceptDegradation: true })).rejects.toMatchObject({ code: 'REIMPORT_MAPPING_UNRESOLVED' });
      expect(db.prepare('PRAGMA data_version').get()).toEqual(version);
      expect(tableState()).toEqual(before);
    } finally { db.close(); }
    store.markCleanShutdown();
  } finally { store.close(); }
});

it.each([false, true])('keeps the ordinary missing-draft refusal with acceptance=%s (#1638 re-check)', async (acceptDegradation) => {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const before = tableState();
    await expect(store.createManuscriptReimportCommitWork({ draftId: randomUUID(), expectedDraftVersion: 1, reviewDigest: 'a'.repeat(64),
      commitId: randomUUID(), acceptDegradation })).rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND' });
    expect(tableState()).toEqual(before);
    store.markCleanShutdown();
  } finally { store.close(); }
});
