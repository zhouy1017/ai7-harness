import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import type { LaunchPolicyProjection, ReviewRunProjection } from '../../src/shared/protocol.js';
import { withHouseReviewPreferenceFor } from '../support/policy-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Issue #911 review: a review category Task that reads both 本社审阅偏好 and a frozen 资料库 reference. Only admitted sample1 and
// synthetic library text, on the real store, ledger and execution path; no Provider or Electron.
const TEXT = '合成资料说明虚构的背景术语。\n另一段只用于资料库参考边界的测试。';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let fixture: ResolvedModelFixture;
let bookId: string;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-house-preference-materials-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-review-cross-chapter-authored');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } });
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null }, materialGuard: (id, ledger) => store.materialGuard(id, ledger) });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, '合成偏好与参考测试');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, '偏好参考测试连接');
});
afterEach(async () => {
  const stopped = driver.dispose();
  await owner.dispose();
  await stopped;
  store.markCleanShutdown();
  store.close();
  await roots.dispose();
});

function prepare(ids: ReadonlyArray<string> = []): ReviewRunProjection {
  let work = store.createReviewRunPreparationWork(bookId, ['typos-and-usage'], WHOLE, launchPolicy, null, ids);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  return work.projection!.run!;
}
function approvals(run: ReviewRunProjection) {
  return run.categories.flatMap((category) => category.planEnvelopeDigest === null ? [] : [{ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest }]);
}

describe('本社审阅偏好 beside a frozen 资料库 reference (#911 review)', () => {
  it('re-derives the combined contract while the pin reads, and says why the plan cannot start while it does not', async () => {
    // One judged finding, kept for the house.
    const first = prepare();
    store.authorizeReviewRun(bookId, first.reviewRunId, approvals(first));
    await driver.drive(first.reviewRunId);
    const finding = store.inspectReviewWorkspace(bookId, first.reviewRunId).run!.findings.find((entry) => entry.markId !== null)!;
    store.recordReviewFindingDisposition(bookId, first.reviewRunId, finding.findingId, '保留本书体例');
    const learning = store.inspectLearningMaterials(bookId).books[0]!.materials.find((entry) => entry.kind === 'review-disposition')!;
    store.decideLearningMaterial({ bookId, materialKey: learning.materialKey, materialDigest: learning.digest, expectedDecisions: 0, choice: 'house', note: null });
    const version = store.inspectHouseReviewPreference().current!;
    // One library item for this Book.
    const path = join(roots.inputRoot, `${randomUUID()}.txt`);
    writeFileSync(path, TEXT);
    const preview = await store.previewLibraryMaterial(path);
    const item = await store.addLibraryMaterial({ previewId: preview.previewId, title: '合成背景资料', kind: 'document' });
    store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId } } });
    store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    store.startMaterialIndexing();
    await store.settleMaterialIndexing();

    launchPolicy = withHouseReviewPreferenceFor(launchPolicy, 'editorial-review/typos-and-usage');
    const run = prepare([item.materialId]);
    const plan = () => store.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId });
    const used = `错别字与规范用语：参考本社审阅偏好 v${version.ordinal}（来源：1 条已判定反馈）`;
    expect(plan().scope.reference).toContain(used);
    expect(plan().start.readiness).toBe('ready');
    // The reference withdrawn: the plan still reads, under its frozen contract, and names the reference's own reason.
    store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    expect(plan().start.readiness).toBe('changed');
    expect(plan().scope.reference.some((line) => line.includes('现在不能列进'))).toBe(true);
    expect(() => store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run))).toThrow('现在不能列进');
    // Admitted again, the same plan re-derives its combined contract and is accepted.
    store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 3, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    expect(plan().start.readiness).toBe('ready');
    expect(plan().scope.reference).toContain(used);
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    expect(store.generateReviewReport(bookId, run.reviewRunId).run!.report!.record.categorySummaries.entries[0]!.basisStatement).toContain(`参考本社审阅偏好 v${version.ordinal}`);
  }, 300_000);
});
