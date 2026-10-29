import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import type { JournalStructuralEdit, ManuscriptReimportCommitProjection, ReimportGroupVerb, ReviewBeforeManuscriptReimportProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for a reimport over the editor's structural edits (Issue #1175; ADR 0096 §1, ADR 0006): the
// unchanged source file reimported three-way over a split or merged paragraph pairs the descendant paragraphs with the one
// source paragraph in one row, and the row offers the verb that brings the file's structure back. The file is composed from
// exact sample1's paragraphs; assertions compare rows, identities and lengths.

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: { bookId: string; manuscriptId: string; branchId: string };
let sourceVersionId: string;
let base: string;

beforeEach(async () => {
  roots = await createServiceTestRoots();
  base = join(roots.inputRoot, 'base.docx');
  await composeRevisedDocx(base, { source: ADMITTED_BASELINE_DOCX, title: '结构重新导入组稿', paragraphs: [21, 22, 23, 24].map((block) => ({ runs: [{ text: { block } }] })) });
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const staged = await store.stageSelectedManuscript(randomUUID(), base);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  book = { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
  const source = store.getBookOverview(book.bookId).records.find((record) => record.kind === 'source');
  if (source?.kind !== 'source') throw new Error('the imported Book has no source version');
  sourceVersionId = source.sourceVersionId;
});

afterEach(async () => {
  store.markCleanShutdown();
  store.close();
  await roots.dispose();
});

function structural(position: number, at: number, structure: (blocks: ReturnType<EditorialStore['getManuscriptWindow']>['blocks']) => JournalStructuralEdit): void {
  const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = view.blocks[position - 1]!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: view.revisionId,
    blockId: block.blockId, windowStartBlockId: view.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: view.journalSequence,
    fromGrapheme: at, toGrapheme: at, insertText: '', structure: structure(view.blocks) });
}

async function reimportUnchangedFile(): Promise<ReviewBeforeManuscriptReimportProjection> {
  const staged = await store.stageSelectedManuscript(randomUUID(), base);
  const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId: book.bookId,
    relationship: 'reimport', lineage: { kind: 'verified-source-version', sourceVersionId }, reuseSourceVersionId: sourceVersionId });
  let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  return prepared.review!;
}

async function resolveAndCommit(review: ReviewBeforeManuscriptReimportProjection, groupId: string, verb: ReimportGroupVerb): Promise<ManuscriptReimportCommitProjection> {
  const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, groupId, verb);
  let progress = store.advanceReimportResolutionWork(work.workId);
  while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
  const resolved = progress.review!;
  const commit = await store.createManuscriptReimportCommitWork({ draftId: resolved.draftId, expectedDraftVersion: resolved.draftVersion, reviewDigest: resolved.reviewDigest, commitId: randomUUID() });
  let result = commit.result;
  while (result === null) {
    await new Promise((settle) => setTimeout(settle, 5));
    result = (await store.advanceManuscriptReimportCommitWork(commit.workId!)).result;
  }
  return result as ManuscriptReimportCommitProjection;
}

describe('a reimport over structural edits', () => {
  it('pairs the two halves of a split paragraph with its one source paragraph, and 并入 brings the file’s paragraph back', async () => {
    structural(2, 12, () => ({ kind: 'split', newBlockId: `blk_${randomBytes(12).toString('hex')}` }));
    const review = await reimportUnchangedFile();
    expect(review.lineage.comparisonKind).toBe('three-way');
    expect(review.comparison).toMatchObject({ groups: 1, exactBlocks: 3 });
    const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
    expect([row.current.from, row.current.to, row.staged.from, row.staged.to]).toEqual([2, 3, 2, 2]);
    expect(row.verbs).toContain('merge');
    expect((await resolveAndCommit(review, row.groupId, 'merge')).resultKind).toBe('changed');
    const blocks = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks;
    expect(blocks).toHaveLength(4);
    expect(blocks[1]!.text === await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 22 })).toBe(true);
  }, 120_000);

  it('pairs a merged paragraph with the two source paragraphs it absorbed, and 拆分 brings both back', async () => {
    const absorbing = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[1]!;
    structural(2, [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(absorbing.text)].length,
      (blocks) => ({ kind: 'merge', mergedBlockId: blocks[2]!.blockId, mergedBlockDigest: blocks[2]!.digest }));
    const review = await reimportUnchangedFile();
    const row = store.getReimportMappingPage(review.draftId, review.draftVersion, null).items[0]!;
    expect([row.current.from, row.current.to, row.staged.from, row.staged.to]).toEqual([2, 2, 2, 3]);
    expect(row.verbs).toContain('split');
    expect((await resolveAndCommit(review, row.groupId, 'split')).resultKind).toBe('changed');
    const blocks = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks;
    expect(blocks.map((block) => block.blockId)[1]).toBe(absorbing.blockId);
    expect(await Promise.all(blocks.map(async (block, index) => block.text === await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 21 + index }))))
      .toEqual([true, true, true, true]);
  }, 120_000);
});
