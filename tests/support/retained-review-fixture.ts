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

export type RetainedFixturePhase = 'open-fixture' | 'import-sample' | 'install-profile' | 'configure-connection' |
  'prepare-review' | 'authorize-review' | 'drive-review' | 'read-review' | 'read-research' | 'read-lens' | 'check-order';

/** Commit research first, then fail the separate verification write. No SQL mutation or network transport. */
export async function seedRetainedReviewFallback(roots: Pick<ServiceTestRoots, 'codeRoot' | 'dataRoot' | 'inputRoot'>,
  observe?: (store: EditorialStore, fixture: RetainedReviewFixture) => Promise<void>, onPhase?: (phase: RetainedFixturePhase) => void) {
  onPhase?.('open-fixture');
  const governor = new ModelRequestGovernor();
  const { store, owner, policy } = await createResearchRunFixture(roots, governor);
  try {
    onPhase?.('import-sample');
    const book = await importSample1Book(store, roots.codeRoot, '留存来源回归');
    onPhase?.('install-profile');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    onPhase?.('configure-connection');
    recordMissingCredentialConnection(store, '合成连接');
    onPhase?.('prepare-review');
    let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
    const run = work.projection!.run!;
    onPhase?.('authorize-review');
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
    onPhase?.('drive-review');
    try { await driver.drive(run.reviewRunId); } finally { await driver.dispose(); store.materializeFactualVerification = materialize; }
    onPhase?.('read-review');
    const page = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    const finding = page.findings[0]!;
    if (!finding) throw Object.assign(new Error('Fixture review finding missing'), { fixtureCheck: 'review-finding-present' });
    const taskIntentId = page.categories[0]!.taskIntentId!;
    onPhase?.('read-research');
    const retained = store.inspectResearchEvidence({ bookId: book.bookId, taskIntentId, reviewFindingId: finding.findingId, after: null, staleAfterDays: null });
    onPhase?.('read-lens');
    const lens = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId: run.reviewRunId, after: null,
      chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
    onPhase?.('check-order');
    if (retainedBeforeFailure !== 3) throw Object.assign(new Error('Fixture ordering failed'), { fixtureCheck: 'retained-before-write' });
    if (retained.records.length !== 3) throw Object.assign(new Error('Fixture retention failed'), { fixtureCheck: 'retained-after-write' });
    if (lens.results.length !== 0) throw Object.assign(new Error('Fixture verification unexpectedly present'), { fixtureCheck: 'verification-results-absent' });
    const fixture = { bookId: book.bookId, reviewRunId: run.reviewRunId, findingId: finding.findingId, taskIntentId,
      retainedBeforeFailure, verificationResults: lens.results.length,
      sources: retained.records.map(record => ({ evidenceId: record.evidenceId, address: record.url })) };
    await observe?.(store, fixture);
    return fixture;
  } finally {
    await owner.dispose(); store.close(); governor.close(); await governor.whenIdle();
  }
}
