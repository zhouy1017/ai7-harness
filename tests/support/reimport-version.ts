import { randomUUID } from 'node:crypto';
import type { EditorialStore } from '../../src/service/store.js';

export async function reimportVersion(store: EditorialStore, bookId: string, path: string, reuse: boolean) {
  const record = store.getBookOverview(bookId).records.find(row => row.kind === 'source');
  if (record?.kind !== 'source') throw new Error('Missing import source');
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId,
    relationship: 'reimport', lineage: { kind: 'verified-source-version', sourceVersionId: record.sourceVersionId },
    reuseSourceVersionId: reuse ? record.sourceVersionId : null });
  let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
  let review = prepared.review!;
  for (const row of store.getReimportMappingPage(review.draftId, review.draftVersion, null).items) {
    const work = store.createReimportResolutionWork(review.draftId, review.draftVersion, row.groupId, row.verbs.includes('rewrite') ? 'rewrite' : 'delete');
    let progress = store.advanceReimportResolutionWork(work.workId);
    while (!progress.done) progress = store.advanceReimportResolutionWork(work.workId);
    review = progress.review!;
  }
  const commitId = randomUUID();
  const work = await store.createManuscriptReimportCommitWork({ draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  let result = work.result;
  while (!result) {
    await new Promise(resolve => setTimeout(resolve, 5));
    result = (await store.advanceManuscriptReimportCommitWork(work.workId!)).result;
  }
  await store.acknowledgeImportCompletion(commitId);
  return result;
}
