import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, admittedSourcePath, composeManuscriptDocx, type ComposedRetentionContent } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { reimportVersion } from '../support/reimport-version.js';

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

async function importNotes(retention: ComposedRetentionContent = NOTES, title = '注释组稿'): Promise<{ original: Uint8Array; source: ParsedDocxBlock[]; path: string;
  book: { bookId: string; manuscriptId: string; branchId: string }; view: () => ManuscriptWindowProjection }> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  const original = await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title, retention });
  const source: ParsedDocxBlock[] = [];
  await parseDocx(admittedSourcePath(ADMITTED_BASELINE_DOCX), 'sample1.docx', (block) => source.push(block));
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title }, false);
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
  it('does not walk version history for edits and window reads in another book without notes, or each child of a known note import', async () => {
    const noted = await importNotes();
    const plain = await importNotes({}, '无脚注组稿');
    const checkpoint = async (item: typeof plain, ordinal: number) => {
      const page = item.view();
      const block = page.blocks.find(row => row.kind === 'paragraph')!;
      store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: page.manuscriptId, branchId: page.branchId, baseRevisionId: page.revisionId,
        blockId: block.blockId, windowStartBlockId: page.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: page.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '甲' });
      await store.saveMilestone(page.manuscriptId, page.branchId, '阶段 ' + ordinal, 'stage-archive', null, '');
      expect(item.view().revisionId === page.revisionId).toBe(false);
    };
    for (let ordinal = 1; ordinal <= 12; ordinal++) await checkpoint(plain, ordinal);
    noted.view();
    const reads = vi.spyOn(StatementSync.prototype, 'get');
    const walks = () => reads.mock.contexts.filter(statement => statement instanceof StatementSync &&
      /\bWITH\s+RECURSIVE\s+lineage\s+AS\b/i.test(statement.sourceSQL)).length;
    try {
      for (let ordinal = 13; ordinal <= 15; ordinal++) {
        await checkpoint(plain, ordinal);
        expect(plain.view().blocks.some(row => row.note || row.noteLinks)).toBe(false);
      }
      expect(walks()).toBe(0);
      noted.view();
      const initialWalks = walks();
      for (let ordinal = 1; ordinal <= 3; ordinal++) {
        await checkpoint(noted, ordinal);
        expect(noted.view().blocks.some(row => row.noteLinks?.length)).toBe(true);
      }
      expect(walks()).toBe(initialWalks);
      const plans = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const probes = new Set(reads.mock.contexts.filter(statement => statement instanceof StatementSync).map(statement => statement.sourceSQL)
          .filter(sql => sql.startsWith('SELECT source_version_id, parent_revision_id,') || sql.startsWith('SELECT 1 FROM manuscript_note_sources WHERE') ||
            sql.startsWith('SELECT 1 FROM manuscript_block_versions WHERE revision_id = ? AND kind')));
        expect(probes.size).toBeGreaterThan(1);
        for (const sql of probes) {
          const plan = plans.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array<null>(sql.split('?').length - 1).fill(null));
          expect(plan.map(row => row.detail).some(detail => typeof detail === 'string' && /^SCAN\b/.test(detail))).toBe(false);
        }
      } finally { plans.close(); }
    } finally { reads.mockRestore(); }
  });
  it('keeps both note links on the absorbing paragraph through a merge and undo', async () => {
    const { book, view } = await importNotes();
    const before = view();
    const [into, absorbed] = before.blocks.slice(1, 3);
    const note = before.blocks[6]!;
    const at = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(into!.text)].length;
    const merged = store.flushJournalEdit({ ...book, clientEditId: randomUUID(), baseRevisionId: before.revisionId,
      blockId: into!.blockId, windowStartBlockId: before.blocks[0]!.blockId, baseBlockDigest: into!.digest, expectedJournalSequence: before.journalSequence,
      fromGrapheme: at, toGrapheme: at, insertText: '', structure: { kind: 'merge', mergedBlockId: absorbed!.blockId, mergedBlockDigest: absorbed!.digest } }).window;
    expect(merged.blocks.find((block) => block.blockId === into!.blockId)!.noteLinks).toEqual([{ blockId: note.blockId, part: 'footnote', ordinal: 1 }]);
    expect(merged.blocks.find((block) => block.blockId === note.blockId)!.note).toMatchObject({ referenceBlockId: into!.blockId, referencePosition: 2 });
    store.undoManuscript(book.manuscriptId, book.branchId, merged.workingDigest);
    expect(view().blocks.find((block) => block.blockId === absorbed!.blockId)!.noteLinks).toEqual([{ blockId: note.blockId, part: 'footnote', ordinal: 1 }]);
    store.redoManuscript(book.manuscriptId, book.branchId, view().workingDigest);
    const checkOwner = (owner: string) => {
      const blocks = view().blocks;
      expect(blocks.find(block => block.blockId === note.blockId)?.note?.referenceBlockId).toBe(owner);
      expect(blocks.filter(block => block.noteLinks?.some(link => link.blockId === note.blockId)).map(block => block.blockId)).toEqual([owner]);
    };
    const step = store.restoreBookVersion({ ...book, bookId: before.bookId, revisionId: before.revisionId, expectedBase: view().revisionId, expectedDigest: view().workingDigest });
    checkOwner(absorbed!.blockId);
    expect(store.undoManuscript(book.manuscriptId, book.branchId, view().workingDigest, step.stepId).canUndo).toBe(false);
    checkOwner(into!.blockId);
    store.redoManuscript(book.manuscriptId, book.branchId, view().workingDigest);
    checkOwner(absorbed!.blockId);
    const scope = { bookId: before.bookId, manuscriptId: before.manuscriptId, branchId: before.branchId };
    const mergedVersion = store.listBookVersions({ ...scope, offset: 0 }).rows.find(row => row.label.startsWith('恢复前自动保存'))!.revisionId;
    const restore = (revisionId: string) => store.restoreBookVersion({ ...scope, revisionId, expectedBase: view().revisionId, expectedDigest: view().workingDigest });
    restore(mergedVersion);
    const movedPath = join(roots.inputRoot, 'moved-footnote.docx');
    await composeManuscriptDocx(movedPath, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '注释组稿',
      retention: { ...NOTES, footnote: { block: 4, noteSourceBlock: 9 } } });
    await reimportVersion(store, book.bookId, movedPath, false);
    const newOwner = view().blocks[3]!.blockId;
    checkOwner(newOwner);
    restore(mergedVersion);
    checkOwner(into!.blockId);
    store.undoManuscript(book.manuscriptId, book.branchId, view().workingDigest);
    checkOwner(newOwner);
    store.redoManuscript(book.manuscriptId, book.branchId, view().workingDigest);
    checkOwner(into!.blockId);
  });

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
    expect(blocks[2]!.noteLinks).toEqual([{ blockId: blocks[6]!.blockId, part: 'footnote', ordinal: 1 }]);
    expect(blocks[4]!.noteLinks).toEqual([{ blockId: blocks[7]!.blockId, part: 'endnote', ordinal: 1 }]);
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
