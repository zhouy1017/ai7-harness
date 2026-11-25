import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { createResearchRunFixture } from './research-run-fixture.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from './sample1-baseline.js';
import type { ServiceTestRoots } from './temp-data-root.js';
import type { EditorialStore } from '../../src/service/store.js';

export interface RetainedReviewFixture {
  bookId: string; reviewRunId: string; findingId: string; taskIntentId: string;
  retainedBeforeFailure: number; verificationResults: number;
  sources: Array<{ evidenceId: string; address: string }>;
}

/** Commit research first, then fail the separate verification write. No SQL mutation or network transport. */
export async function seedRetainedReviewFallback(roots: Pick<ServiceTestRoots, 'codeRoot' | 'dataRoot' | 'inputRoot'>,
  observe?: (store: EditorialStore, fixture: RetainedReviewFixture) => Promise<void>) {
  const governor = new ModelRequestGovernor();
  const { store, owner, policy } = await createResearchRunFixture(roots, governor);
  try {
    const book = await importSample1Book(store, roots.codeRoot, '留存来源回归');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    // J04 may already have enrolled this connection; its reference, state and choices belong to that flow.
    if (store.getModelServiceConnection() === null) recordMissingCredentialConnection(store, '合成连接');
    let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
    const run = work.projection!.run!;
    store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map(category => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    const materialize = store.materializeFactualVerification.bind(store);
    let retainedBeforeFailure = 0;
    store.materializeFactualVerification = id => {
      const page = store.inspectReviewWorkspace(book.bookId, id).run!;
      const finding = page.findings[0];
      if (finding) retainedBeforeFailure = store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null,
        taskIntentId: page.categories[0]!.taskIntentId!, reviewFindingId: finding.findingId }).records.length;
      if (retainedBeforeFailure > 0) throw new Error('Synthetic verification write failure after retention');
      materialize(id);
    };
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
    try { await driver.drive(run.reviewRunId); } finally { await driver.dispose(); store.materializeFactualVerification = materialize; }
    const page = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    const finding = page.findings[0]!;
    const taskIntentId = page.categories[0]!.taskIntentId!;
    const retained = store.inspectResearchEvidence({ bookId: book.bookId, taskIntentId, reviewFindingId: finding.findingId, after: null, staleAfterDays: null });
    const lens = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId: run.reviewRunId, after: null,
      chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
    if (retainedBeforeFailure !== 3 || retained.records.length !== 3 || lens.results.length !== 0) throw new Error('Retained fallback fixture did not reach the required ordering');
    const fixture = { bookId: book.bookId, reviewRunId: run.reviewRunId, findingId: finding.findingId, taskIntentId,
      retainedBeforeFailure, verificationResults: lens.results.length,
      sources: retained.records.map(record => ({ evidenceId: record.evidenceId, address: record.url })) };
    await observe?.(store, fixture);
    return fixture;
  } finally {
    await owner.dispose(); store.close(); governor.close(); await governor.whenIdle();
  }
}
