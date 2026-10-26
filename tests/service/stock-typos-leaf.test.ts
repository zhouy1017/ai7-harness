import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { loadModelFixture, STOCK_TYPOS_LEAF_FIXTURE } from '../../src/service/provider/model-fixture.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { TYPOS_AND_USAGE, STYLE_AND_FORMAT } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import type { LaunchPolicyProjection, ReviewCategoryProjection, ReviewCategoryTaskRequest } from '../../src/shared/protocol.js';
import type { AnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';

const plain = reviewCategoryKindDefinition(TYPOS_AND_USAGE, 2);
let governor: ModelRequestGovernor;
beforeEach(() => { governor = new ModelRequestGovernor(); });
afterEach(async () => { governor.close(); await governor.whenIdle(); });

interface Application { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; bookId: string; launchPolicy: LaunchPolicyProjection }
async function withBook(body: (application: Application) => Promise<void>): Promise<void> {
  const roots = await createServiceTestRoots('ai7-stock-leaf-');
  const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const fixture = await loadModelFixture(resolve(roots.codeRoot, 'tests/fixtures/model'), STOCK_TYPOS_LEAF_FIXTURE);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger,
    launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const { bookId } = await importSample1Book(store, roots.codeRoot, '原始 sample1 叶单元审阅');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, '本机夹具连接');
    await body({ store, owner, bookId, launchPolicy });
  } finally { await owner.dispose(); store.close(); await roots.dispose(); }
}

function prepare(application: Application, definition: AnalysisKindDefinition = plain,
  request: ReviewCategoryTaskRequest = { mode: 'review-first', selectedRange: null }): ReviewCategoryProjection {
  const { store, bookId, launchPolicy } = application;
  let work = store.createReviewCategoryPreparationWork(bookId, definition, request, launchPolicy);
  while (!work.done) work = store.advanceReviewCategoryPreparationWork(definition, work.workId!);
  return work.projection!;
}

it('runs the standalone authored stock review through native unit children and parent assurance stages', async () => {
  await withBook(async (application) => {
    const { store, owner, bookId } = application;
    const prepared = prepare(application);
    expect(prepared.planEnvelope!.compositionVersion).toBe(3);
    const authorized = store.authorizeReviewCategory(bookId, plain, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.reviewCategoryLedger(plain));
    await owner.whenIdle();
    const settled = store.inspectReviewCategory(bookId, plain);
    expect(settled.state, JSON.stringify(settled.taskOutcome)).toBe('settled');
    expect(settled.resultSetRevision?.findings).toHaveLength(2);
    const attempt = settled.run!.attempt!;
    expect(attempt.executionBinding?.compositionVersion).toBe(3);
    expect(attempt.spans).toHaveLength(8);
    expect(new Set(attempt.spans.map((span) => span.harnessSessionId)).size).toBe(8);
    expect(attempt.spans.every((span) => span.harnessSessionId !== attempt.executionBinding!.harnessSessionId)).toBe(true);
    expect(settled.taskOutcome?.report?.usagePerStage.units.requests).toBe(9);
    expect(settled.resultSetRevision?.assuranceSample.state).toBe('closed');
    expect(settled.taskOutcome?.report?.ifRedone.state).toBe('closed');
  });
});

it.each(['category', 'clauses', 'range'] as const)('refuses a standalone child fixture outside its approved %s', async (variant) => {
  await withBook(async (application) => {
    const input = variant === 'category' ? STYLE_AND_FORMAT : variant === 'clauses'
      ? { ...TYPOS_AND_USAGE, clauses: [{ clauseId: 'typos-and-usage/1', text: '合成的非标准指示。' }] } : TYPOS_AND_USAGE;
    expect(() => prepare(application, reviewCategoryKindDefinition(input, 2), variant === 'range'
      ? { mode: 'review-first-range', selectedRange: { startPosition: 1, endPosition: 15 } }
      : { mode: 'review-first', selectedRange: null })).toThrow('单元子代理');
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  });
});

it('keeps a prepared leaf profile readable but refuses idle authorization and stops at the parent budget', async () => {
  await withBook(async (application) => {
    const { store, owner, bookId } = application;
    const prepared = prepare(application);
    const ledger = store.reviewCategoryLedger(plain);
    expect(() => ledger.authorize(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest, 'idle')).toThrow('前台');
    expect(store.inspectReviewCategory(bookId, plain).run).toBeNull();
    const bounded = ledger.editPlan(bookId, { taskIntentId: prepared.taskIntent!.taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest,
      removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50 } });
    const authorized = store.authorizeReviewCategory(bookId, plain, bounded.taskIntent!.taskIntentId, bounded.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, ledger);
    await owner.whenIdle();
    const stopped = store.inspectReviewCategory(bookId, plain);
    expect(stopped.taskOutcome?.stop?.reason).toBe('run-budget-ceiling-reached');
    expect(stopped.run!.attempt!.spans).toHaveLength(1);
    expect(stopped.taskOutcome?.report?.usagePerStage.units.requests).toBe(2);
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  });
});
