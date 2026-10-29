import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor, type UnitHold } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { loadModelFixture, STOCK_TYPOS_LEAF_FIXTURE, type ModelFixtureEntry, type ModelFixtureResponse } from '../../src/service/provider/model-fixture.js';
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
interface Options { readonly unitHold?: UnitHold; readonly response?: (entry: ModelFixtureEntry) => ModelFixtureResponse }
async function withBook(body: (application: Application) => Promise<void>, options: Options = {}): Promise<void> {
  const roots = await createServiceTestRoots('ai7-stock-leaf-');
  const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const loaded = await loadModelFixture(resolve(roots.codeRoot, 'tests/fixtures/model'), STOCK_TYPOS_LEAF_FIXTURE);
  // A test may answer one unit otherwise through the same deterministic adapter; the fixture's pinned identity is unchanged.
  const fixture = options.response === undefined ? loaded : { ...loaded, entries: new Map([...loaded.entries].map(([key, entry]) =>
    [key, { ...entry, response: options.response!(entry) }] as const)) };
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger,
    launchPolicy, fixture, secretResolver: { resolve: async () => null }, unitHold: options.unitHold ?? null });
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
    expect(prepared.planEnvelope!.compositionVersion).toBe(4);
    const authorized = store.authorizeReviewCategory(bookId, plain, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.reviewCategoryLedger(plain));
    await owner.whenIdle();
    const settled = store.inspectReviewCategory(bookId, plain);
    expect(settled.state, JSON.stringify(settled.taskOutcome)).toBe('settled');
    expect(settled.resultSetRevision?.findings).toHaveLength(2);
    const attempt = settled.run!.attempt!;
    expect(attempt.executionBinding?.compositionVersion).toBe(4);
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
    // A set ceiling keeps one child in flight (Issue #1200): nothing reserves what children in flight would spend.
    expect(stopped.run!.attempt!.spans).toHaveLength(1);
    expect(stopped.taskOutcome?.report?.usagePerStage.units.requests).toBe(2);
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  });
});

/** Start the prepared stock review now and wait until it ends; the settled projection is returned. */
async function runStock(application: Application): Promise<ReviewCategoryProjection> {
  const { store, owner, bookId } = application;
  const prepared = prepare(application);
  const authorized = store.authorizeReviewCategory(bookId, plain, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.reviewCategoryLedger(plain));
  await owner.whenIdle();
  return store.inspectReviewCategory(bookId, plain);
}

it.each([[4, 3], [2, 2], [1, 1]])('fans units out to at most the governor-capped width (capacity %i → %i children)', async (capacity, width) => {
  governor.close();
  governor = new ModelRequestGovernor({ globalCapacity: capacity });
  let inFlight = 0;
  let peak = 0;
  const unitHold: UnitHold = async () => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 15));
    inFlight -= 1;
  };
  await withBook(async (application) => {
    const settled = await runStock(application);
    expect(settled.state).toBe('settled');
    expect(peak).toBe(width);
    // Whatever order the children came back in, the Run's units and findings keep the manifest order.
    const spans = settled.run!.attempt!.spans;
    expect(spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(settled.resultSetRevision!.findings.map((finding) => finding.unitOrdinal)).toEqual([1, 2]);
  }, { unitHold });
});

it('counts every child turn once in the Run usage, the tool step included', async () => {
  await withBook(async (application) => {
    const fixture = await loadModelFixture(resolve(process.cwd(), 'tests/fixtures/model'), STOCK_TYPOS_LEAF_FIXTURE);
    const units = [...fixture.entries.values()].filter((entry) => entry.unitOrdinal > 0).map((entry) => entry.response);
    const sum = (key: 'inputTokens' | 'outputTokens') => units.reduce((total, response) => total + ('usage' in response ? response.usage[key] : 0), 0);
    const report = (await runStock(application)).taskOutcome!.report!;
    expect(report.usagePerStage.units).toMatchObject({ requests: units.length, inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens') });
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  });
});

it('keeps a child whose sent request has no known outcome as that unit gap, never resent, while its siblings complete', async () => {
  await withBook(async (application) => {
    const settled = await runStock(application);
    const report = settled.taskOutcome!.report!;
    expect(settled.state).toBe('settled');
    expect(report.units).toMatchObject({ submitted: 8, gaps: 1, retried: 0 });
    expect(settled.run!.attempt!.spans.filter((span) => span.unitOrdinal === 4)).toHaveLength(1);
    expect(report.usagePerStage.units.requests).toBe(9);
  }, { response: (entry) => entry.unitOrdinal === 4 ? { kind: 'outcome-unknown', message: '合成：已发送，结果未知。' } : entry.response });
});

it('records a child failure as the parent units stage outcome, on its unit alone, without another attempt', async () => {
  await withBook(async (application) => {
    const settled = await runStock(application);
    const report = settled.taskOutcome!.report!;
    expect(settled.taskOutcome?.classification).toBe('completed-with-gaps');
    expect(report.failures).toEqual([expect.objectContaining({ stage: 'units', code: 'adapter-failure' })]);
    expect(report.stages.find((stage) => stage.stage === 'units')?.state).toBe('closed-with-gaps');
    expect(report.unitRows.filter((row) => row.state === 'gap')).toEqual([expect.objectContaining({ unitOrdinal: 2, attempts: 1, gapCode: 'adapter-failure' })]);
    expect(report.units).toMatchObject({ submitted: 8, gaps: 1, retried: 0 });
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  }, { response: (entry) => entry.unitOrdinal === 2 ? { kind: 'adapter-failure', code: 'SYNTHETIC_REFUSAL', message: '合成：模型服务拒绝。', status: 400 } : entry.response });
});

it('stops fanned-out children at cancellation: the children in flight settle, no pending unit is started', async () => {
  let application: Application | undefined;
  let runRecordId = '';
  let started = 0;
  const unitHold: UnitHold = async () => {
    started += 1;
    if (started === 1) expect(application!.owner.cancelRun(runRecordId, application!.store.reviewCategoryLedger(plain))).toBe('stopping');
  };
  await withBook(async (opened) => {
    application = opened;
    const { store, owner, bookId } = opened;
    const prepared = prepare(opened);
    runRecordId = store.authorizeReviewCategory(bookId, plain, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    owner.admitAndDispatch(runRecordId, store.reviewCategoryLedger(plain));
    await owner.whenIdle();
    const cancelled = store.inspectReviewCategory(bookId, plain);
    expect(cancelled.run!.state).toBe('cancelled');
    // The first child's settlement cancels; only the children already in flight (the width, three) ever ran.
    expect(cancelled.run!.attempt!.spans.length).toBeLessThanOrEqual(3);
    expect(governor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
  }, { unitHold });
});
