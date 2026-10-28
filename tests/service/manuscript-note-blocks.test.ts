import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, admittedSourcePath, composeManuscriptDocx, type ComposedRetentionContent } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the note block (Issue #1204, W22-S4b; ADR 0096 §1) over the real store. Every manuscript
// is composed from exact `sample1` (ADR 0043/0044): six paragraphs, a footnote after the third whose note is the source's
// ninth paragraph and an endnote after the fifth whose note is its tenth. Assertions speak of kinds, positions and digests.
const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const NOTES: ComposedRetentionContent = { footnote: { block: 3, noteSourceBlock: 9 }, endnote: { block: 5, noteSourceBlock: 10 } };
const target = { kind: 'current' } as const;

let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-note-blocks-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
});
afterEach(async () => {
  store.markCleanShutdown();
  store.close();
  await roots.dispose();
});

async function importNotes(retention: ComposedRetentionContent = NOTES): Promise<{ original: Uint8Array; source: ParsedDocxBlock[]; path: string;
  book: { bookId: string; manuscriptId: string; branchId: string }; view: () => ManuscriptWindowProjection }> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  const original = await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '注释组稿', retention });
  const source: ParsedDocxBlock[] = [];
  await parseDocx(admittedSourcePath(ADMITTED_BASELINE_DOCX), 'sample1.docx', (block) => source.push(block));
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '注释组稿' }, false);
  expect(review.reviewDigest).not.toBeNull();
  const commitId = randomUUID();
  const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { original, source, path, book, view: () => store.getManuscriptWindow(book.manuscriptId, book.branchId, null) };
}

function editNote(book: { manuscriptId: string; branchId: string }, view: ManuscriptWindowProjection, insertText: string): void {
  const note = view.blocks.find((block) => block.kind === 'note')!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: view.revisionId,
    blockId: note.blockId, windowStartBlockId: view.blocks[0]!.blockId, baseBlockDigest: note.digest, expectedJournalSequence: view.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText });
}

describe('the note block (#1204)', () => {
  it('imports a footnote and an endnote as note blocks after the body, each naming the paragraph that refers to it', async () => {
    const path = join(roots.inputRoot, 'staged.docx');
    await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '注释组稿', retention: NOTES });
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const notes = staged.fidelity.find((category) => category.key === 'notes')!;
    expect([notes.count, notes.status, notes.statusLabel]).toEqual([2, 'retained', '完整保留（随文件保留）']);
    const { source, view } = await importNotes();
    const blocks = view().blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'note', 'note']);
    // The body is the excerpt exactly as it read before notes became blocks; each note is its source paragraph's words.
    expect(blocks.slice(0, 6).map((block) => block.digest)).toEqual(source.slice(0, 6).map((block) => block.digest));
    expect(blocks.slice(6).map((block) => digest(block.text))).toEqual([digest(source[8]!.text), digest(source[9]!.text)]);
    expect(blocks.slice(6).map((block) => block.note)).toEqual([
      { part: 'footnote', ordinal: 1, referenceBlockId: blocks[2]!.blockId, referencePosition: 3 },
      { part: 'endnote', ordinal: 1, referenceBlockId: blocks[4]!.blockId, referencePosition: 5 },
    ]);
    expect(blocks.slice(0, 6).every((block) => block.note === undefined)).toBe(true);
  }, 120_000);

  it('edits a note block like a paragraph, 撤销 restores it, and refuses to split it', async () => {
    const { book, view } = await importNotes();
    const before = view().blocks.find((block) => block.kind === 'note')!;
    editNote(book, view(), '〔注〕');
    const edited = view().blocks.find((block) => block.blockId === before.blockId)!;
    expect([edited.kind, edited.text.startsWith('〔注〕'), edited.note?.referencePosition]).toEqual(['note', true, 3]);
    store.undoManuscript(book.manuscriptId, book.branchId, view().workingDigest);
    expect(view().blocks.find((block) => block.blockId === before.blockId)!.digest).toBe(before.digest);
    const current = view();
    expect(() => store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
      baseRevisionId: current.revisionId, blockId: before.blockId, windowStartBlockId: current.blocks[0]!.blockId, baseBlockDigest: before.digest,
      expectedJournalSequence: current.journalSequence, fromGrapheme: 2, toGrapheme: 2, insertText: '',
      structure: { kind: 'split', newBlockId: `blk_${'0123456789ab'.repeat(2)}` } })).toThrow(expect.objectContaining({ code: 'STRUCTURE_INVALID' }));
  }, 120_000);

  it('offers 选章 over the body only: the analysis units end at the last paragraph', async () => {
    const { book } = await importNotes();
    const chapters = store.inspectReviewWorkspace(book.bookId, null).scopeOptions.chapters.chapters;
    expect(chapters.length).toBeGreaterThan(0);
    expect(Math.max(...chapters.map((chapter) => chapter.endPosition))).toBe(6);
  }, 120_000);

  it('pairs an edited note with its note when the file is reimported, and 改写与新增 brings the file’s note back as a note block', async () => {
    const { path, book, view } = await importNotes();
    const before = view().blocks;
    editNote(book, view(), '〔注〕');
    const source = store.getBookOverview(book.bookId).records.find((record) => record.kind === 'source');
    if (source?.kind !== 'source') throw new Error('the imported Book has no source version');
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId: book.bookId,
      relationship: 'reimport', lineage: { kind: 'verified-source-version', sourceVersionId: source.sourceVersionId }, reuseSourceVersionId: source.sourceVersionId });
    let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
    while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
    const review = prepared.review!;
    expect(review.comparison).toMatchObject({ groups: 1, exactBlocks: 7 });
    const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
    expect([row.current.from, row.current.to, row.staged.from, row.staged.to]).toEqual([7, 7, 7, 7]);
    const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, row.groupId, 'rewrite');
    let progress = store.advanceReimportResolutionWork(work.workId);
    while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
    const resolved = progress.review!;
    const commit = await store.createManuscriptReimportCommitWork({ draftId: resolved.draftId, expectedDraftVersion: resolved.draftVersion,
      reviewDigest: resolved.reviewDigest, commitId: randomUUID() });
    let result = commit.result;
    while (result === null) {
      await new Promise((settle) => setTimeout(settle, 5));
      result = (await store.advanceManuscriptReimportCommitWork(commit.workId!)).result;
    }
    const after = view().blocks;
    expect(after.map((block) => [block.kind, block.digest, block.note?.part ?? null, block.note?.referencePosition ?? null]))
      .toEqual(before.map((block) => [block.kind, block.digest, block.note?.part ?? null, block.note?.referencePosition ?? null]));
  }, 120_000);

  it('restores unedited notes from the original, byte for byte, and says so', async () => {
    const { original, book } = await importNotes();
    const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
    const notes = reviewed.fidelity.find((row) => row.key === 'notes')!;
    expect([notes.count, notes.status, notes.detail]).toEqual([2, 'preserved', '脚注与尾注从原文件恢复。']);
    const destination = join(roots.inputRoot, 'unedited.docx');
    const preparation = await store.prepareManuscriptExport({ bookId: book.bookId, revisionId: reviewed.target.revisionId, target,
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination }, true);
    await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
    const [before, after] = [unzipSync(original), unzipSync(new Uint8Array(await readFile(destination)))];
    for (const part of ['word/footnotes.xml', 'word/endnotes.xml']) expect(digest(after[part]!)).toBe(digest(before[part]!));
    expect(strFromU8(after['word/document.xml']!)).not.toContain(strFromU8(before['word/footnotes.xml']!).match(/<w:t>(.*?)<\/w:t>/u)![1]);
  }, 120_000);

  it('writes an edited note back into its own part and names its position as what it could not restore', async () => {
    const { original, book, view } = await importNotes();
    editNote(book, view(), '〔注〕');
    const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
    const notes = reviewed.fidelity.find((row) => row.key === 'notes')!;
    expect([notes.status, [...notes.positions]]).toEqual(['degraded', [7]]);
    expect(notes.detail).toBe('1 条改过的注释：注文按稿件文字写出，原注文中的行内样式未能恢复；其余从原文件恢复。');
    expect(reviewed.retentionSummary).toContain('脚注注文按改过的注释重新写出');
    const destination = join(roots.inputRoot, 'edited.docx');
    const preparation = await store.prepareManuscriptExport({ bookId: book.bookId, revisionId: reviewed.target.revisionId, target,
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination }, true);
    await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
    const [before, after] = [unzipSync(original), unzipSync(new Uint8Array(await readFile(destination)))];
    expect(digest(after['word/endnotes.xml']!)).toBe(digest(before['word/endnotes.xml']!));
    // Read back, the file is the manuscript: the same body, the edited footnote and the untouched endnote in their parts.
    const reread: ParsedDocxBlock[] = [];
    await parseDocx(destination, 'written.docx', (block) => reread.push(block));
    expect(reread.map((block) => [block.kind, block.digest])).toEqual(view().blocks.map((block) => [block.kind, block.digest]));
    expect(reread.filter((block) => block.note !== undefined).map((block) => block.note!.part)).toEqual(['footnote', 'endnote']);
  }, 120_000);
});
