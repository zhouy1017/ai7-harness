import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, composeRevisedDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import type { ReviewBeforeImportProjection } from '../../src/shared/protocol.js';
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); });
afterEach(async () => { store.close(); await roots.dispose(); });
async function reopen() { store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); }
async function finish(review: ReviewBeforeImportProjection) {
  const result = await store.commitNewBookImport({ draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID() });
  return { result, digests: store.getManuscriptWindow(result.manuscriptId, result.branchId, null).blocks.map((b) => b.digest) };
}
const target = (title: string) => ({ kind: 'new-book' as const, choiceId: 'new-book' as const, confirmedTitle: title });

it('returns every reviewed form choice, including format acceptance and text-box choice (#1638)', async () => {
  const path = join(roots.inputRoot, 'format.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 21, blocks: 6, title: '文件建议', retention: {
    field: { block: 3 }, textBox: { anchorBlock: 2, sourceStartBlock: 31, blocks: 2 },
  } });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target('修改后的书名'), true, 'merge');
  const answer = store.returnImportToEditing(staged.draftId, review.draftVersion);
  expect(answer).toMatchObject({ state: 'staged', editingChoices: { target: review.target, relationship: 'first-manuscript',
    title: '修改后的书名', textBoxDisposition: 'merge', trackedChanges: null, structure: null, acceptance: true } });
  await reopen();
  const continued = await store.continueImportDraft(staged.draftId, answer.draftVersion);
  expect(continued.state).toBe('target-review-required');
  if (continued.state !== 'target-review-required') throw new Error('Expected choices');
  expect(continued.staged.titleSuggestion.value).toBe('文件建议');
  expect(continued.staged.targetChoices.every((c) => c.selected === false)).toBe(true);
  expect('editingChoices' in continued.staged).toBe(false);
});

it('keeps structure choices after restart and commits a changed title like one pass (#1638)', async () => {
  const path = join(roots.inputRoot, 'structure.docx');
  await composeManuscriptDocx(path, { source: 'wujingzi-rulin-waishi.docx', startBlock: 1, blocks: 30, title: '原文件书名', withoutHeadingStyles: true });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const choice = { headings: [{ position: staged.structure!.headings[0]!.position, level: 1 }], longParagraphs: null };
  const reviewed = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target('旧书名'), false, 'retain', undefined, choice);
  const returned = store.returnImportToEditing(staged.draftId, reviewed.draftVersion);
  expect(returned).toMatchObject({ state: 'staged', editingChoices: { structure: choice, title: '旧书名' } });
  await reopen();
  const continued = await store.continueImportDraft(staged.draftId, returned.draftVersion);
  if (continued.state !== 'target-review-required') throw new Error('Expected choices');
  expect(continued.staged.savedStructureChoice).toEqual(choice);
  expect(continued.staged.titleSuggestion.value).toBe('原文件书名');
  expect(continued.staged.targetChoices.every((c) => c.selected === false)).toBe(true);
  const actual = await finish(store.prepareNewBookReview(staged.draftId, returned.draftVersion, target('新书名'), false, 'retain', undefined, continued.staged.savedStructureChoice));
  const directRoots = await createServiceTestRoots(); const direct = await EditorialStore.open(directRoots.dataRoot, directRoots.codeRoot);
  try {
    const one = await direct.stageSelectedManuscript(randomUUID(), path);
    const review = direct.prepareNewBookReview(one.draftId, one.draftVersion, target('新书名'), false, 'retain', undefined, choice);
    const result = await direct.commitNewBookImport({ draftId: one.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    expect(direct.getManuscriptWindow(result.manuscriptId, result.branchId, null).blocks.map((b) => b.digest)).toEqual(actual.digests);
    expect(store.getBookOverview(actual.result.bookId).book.title).toBe(direct.getBookOverview(result.bookId).book.title);
    expect(actual.result.importRecord.degradationDecision).toEqual(result.importRecord.degradationDecision);
    direct.markCleanShutdown();
  } finally { direct.close(); await directRoots.dispose(); }
  await reopen();
}, 180_000);

it('returns the Word choice and restores it from the staged read after restart (#1638)', async () => {
  const path = join(roots.inputRoot, 'word.docx');
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: 'Word 文件', paragraphs: [
    { runs: [{ text: { block: 21, from: 0, to: 10 } }, { text: { block: 22, from: 0, to: 5 }, revision: { kind: 'ins', author: '测试作者', date: '2026-10-25T00:00:00Z' } }] },
  ] });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const choice = { mode: 'suggestions' as const, learnFromEdits: false, acceptedBaselineConfirmed: false };
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target('Word 旧名'), false, 'retain', choice);
  const returned = store.returnImportToEditing(staged.draftId, review.draftVersion);
  expect(returned).toMatchObject({ state: 'staged', editingChoices: { trackedChanges: review.trackedChanges, title: 'Word 旧名' } });
  await reopen();
  const continued = await store.continueImportDraft(staged.draftId, returned.draftVersion);
  if (continued.state !== 'target-review-required') throw new Error('Expected choices');
  expect(continued.staged.wordTrackedChanges?.compatibility).toBe('ready');
  if (continued.staged.wordTrackedChanges?.compatibility !== 'ready') throw new Error('Expected Word choice');
  expect(continued.staged.wordTrackedChanges.savedChoice).toEqual(choice);
  expect(continued.staged.titleSuggestion.value).toBe('Word 文件');
  expect(continued.staged.targetChoices.every((c) => c.selected === false)).toBe(true);
  const again = store.prepareNewBookReview(staged.draftId, returned.draftVersion, target('Word 新名'), false, 'retain', choice);
  const actual = await finish(again);
  const directRoots = await createServiceTestRoots(); const direct = await EditorialStore.open(directRoots.dataRoot, directRoots.codeRoot);
  try {
    const one = await direct.stageSelectedManuscript(randomUUID(), path);
    const review = direct.prepareNewBookReview(one.draftId, one.draftVersion, target('Word 新名'), false, 'retain', choice);
    const result = await direct.commitNewBookImport({ draftId: one.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    expect(direct.getManuscriptWindow(result.manuscriptId, result.branchId, null).blocks.map((b) => b.digest)).toEqual(actual.digests);
    direct.markCleanShutdown();
  } finally { direct.close(); await directRoots.dispose(); }
  await reopen();
}, 180_000);
