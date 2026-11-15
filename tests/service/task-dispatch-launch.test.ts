import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, driveLaunchedLedgerRun, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore } from '../../src/service/store.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';
import { BASELINE_ANALYSIS_TASK_GOAL, BASELINE_ANALYSIS_MODE_GOALS, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import type { RuntimeExecutionConfig } from '../../src/shared/runtime-execution-config.js';
import type { PlanEditsProjection } from '../../src/shared/protocol/analysis-plan.js';
import { capturedMapAnswer, capturedOrdinaryExecution, type CapturedOrdinaryAnswer } from '../support/captured-ordinary-transport.js';
import { CUSTOM_DIMENSION_TEMPLATE, CUSTOM_DIMENSION_TITLE } from '../support/custom-analysis.js';
import { beginRewriteAsJ11, EVALUATION_REWRITE_FIXTURE_IDENTITY } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_REQUEST } from '../support/writing-task.js';

// D4: the six ordinary drawer starts use real stores and SampleBook input. No task is dispatched to a provider here.
const KINDS = ['baseline-analysis', 'custom-analysis', 'writing', 'initial-evaluation', 'readers-report', 'evaluation-rewrite'] as const;
type Kind = typeof KINDS[number];
let roots: ServiceTestRoots;
let store: EditorialStore;
let governor: ModelRequestGovernor;
let policy: LaunchPolicyProjection;
let capture: ReturnType<typeof capturedOrdinaryExecution> | undefined;
let setupOwner: BaselineAnalysisExecutionOwner | undefined;
let dimensionId: string | undefined;

beforeEach(async () => {
  dimensionId = undefined;
  roots = await createServiceTestRoots('ai7-task-dispatch-');
  governor = new ModelRequestGovernor();
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), EVALUATION_REWRITE_FIXTURE_IDENTITY);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  setupOwner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy: policy,
    fixture, secretResolver: { resolve: async () => null } });
});
afterEach(async () => {
  await capture?.owner.dispose();
  await setupOwner?.dispose();
  governor.close(); await governor.whenIdle();
  capture?.assertMatched();
  store?.markCleanShutdown(); store?.close();
  await roots?.dispose();
  capture = undefined; setupOwner = undefined;
});

async function book(kind: Kind) {
  const imported = await importSample1Book(store, roots.codeRoot, 'sample1 任务派发');
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  let recordId = '';
  if (kind === 'evaluation-rewrite' || kind === 'readers-report') {
    if (store.getModelServiceConnection() === null) recordMissingCredentialConnection(store, '初评本地检查');
    await runInitialEvaluationToEnd(store, setupOwner!, imported.bookId, policy);
    finalizeAsJ11(store, imported.bookId);
    if (kind === 'evaluation-rewrite') recordId = beginRewriteAsJ11(store, imported.bookId).recordId;
  }
  return { ...imported, recordId };
}

function ordinary(answer: CapturedOrdinaryAnswer = () => undefined): void {
  const search = store.getSearchBackendConnections().find(connection => connection.backendId === 'search-tinyfish') ?? store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready');
  store.selectSearchBackend('search-tinyfish');
  capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, answer);
}

async function restart(answer?: CapturedOrdinaryAnswer): Promise<void> {
  await capture?.owner.dispose(); capture?.assertMatched(); capture = undefined;
  await setupOwner?.dispose(); setupOwner = undefined;
  store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  ordinary(answer);
}

function command(kind: Kind, target: Awaited<ReturnType<typeof book>>, executionConfig: RuntimeExecutionConfig, clientCommandId = randomUUID(), rememberedChoice = false, planEdits?: PlanEditsProjection, startWhen: 'now' | 'idle' = 'now') {
  const common = { bookId: target.bookId, clientCommandId, executionConfig, rememberedChoice, startWhen, ...(planEdits === undefined ? {} : { planEdits }) };
  switch (kind) {
    case 'baseline-analysis': return () => store.launchBaselineAnalysis({ ...common, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, policy);
    case 'custom-analysis': {
      dimensionId ??= store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE }).dimensions[0]!.dimensionId;
      const selectedDimension = dimensionId;
      return () => store.launchCustomAnalysis({ ...common, dimensionId: selectedDimension, update: null }, policy);
    }
    case 'writing': return () => store.launchWritingTask({ ...common, ...WRITING_REQUEST }, policy);
    case 'initial-evaluation': return () => store.launchInitialEvaluation(common, policy);
    case 'readers-report': return () => store.launchReadersReport({ ...common, template: 'author' }, policy);
    case 'evaluation-rewrite': return () => store.launchEvaluationRewrite({ ...common, recordId: target.recordId }, policy);
  }
}

describe.each(KINDS)('%s one-step launch', (kind) => {
  it('freezes concurrent choices, launches no approval-only records and replays after settings change', async () => {
    const a = await book(kind), b = await book(kind), fallbackBook = await book(kind);
    ordinary();
    const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
    const shown = store.getManuscriptWindow(a.manuscriptId, a.branchId, null);
    const paragraph = shown.blocks.find(block => block.kind === 'paragraph')!;
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: a.manuscriptId, branchId: a.branchId,
      baseRevisionId: shown.revisionId, blockId: paragraph.blockId, windowStartBlockId: shown.blocks[0]!.blockId,
      baseBlockDigest: paragraph.digest, expectedJournalSequence: shown.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '。' });
    const current = store.getManuscriptWindow(a.manuscriptId, a.branchId, null);
    const clientCommandId = randomUUID();
    const firstCommand = command(kind, a, { modelId: defaults.model, reasoningEffort: 'high' }, clientCommandId, false,
      { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50_000 } }, 'idle');
    const secondCommand = command(kind, b, { modelId: 'account-future-model', reasoningEffort: 'low' });
    const [first, second] = await Promise.all([Promise.resolve().then(firstCommand), Promise.resolve().then(secondCommand)]);
    expect(first.runRecordId).not.toBe(second.runRecordId);
    expect(first.ledger.inspect(a.bookId).authorization?.startWhen).toBe('idle');
    expect(second.ledger.inspect(b.bookId).authorization?.startWhen).toBe('now');
    expect(first.ledger.loadExecutionPlan(first.runRecordId).checkpoint.journalSequence).toBe(current.journalSequence);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 50_000 });
    expect(first.ledger.loadExecutionPlan(first.runRecordId).productionBinding).toMatchObject({ model: defaults.model, reasoningEffort: 'high' });
    expect(second.ledger.loadExecutionPlan(second.runRecordId).productionBinding).toMatchObject({ model: 'account-future-model', reasoningEffort: 'low' });
    expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual(defaults);
    for (const [target, launched, effort] of [[a, first, 'high'], [b, second, 'low']] as const) {
      const task = store.inspectBookTasks(target.bookId, () => null).groups.flatMap(group => group.items)
        .find(entry => entry.item.technical.some(line => line.key === 'run-record' && line.value.includes(launched.runRecordId)));
      expect(task?.item.modelLabel).toContain(`@${effort}`);
      if (kind === 'custom-analysis') expect(task?.item.object).toMatchObject({ kind: 'analysis', customTitle: CUSTOM_DIMENSION_TITLE });
    }
    store.selectMainRoleModel('opencode-go', defaults.model, 'off');
    expect(firstCommand()).toMatchObject({ repeated: true, runRecordId: first.runRecordId, taskIntentId: first.taskIntentId });
    expect(() => command(kind, a, { modelId: defaults.model, reasoningEffort: 'low' }, clientCommandId)()).toThrowError(expect.objectContaining({
      code: 'TASK_LAUNCH_COMMAND_CHANGED', message: expect.stringContaining('请重新发起'),
    }));
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(db.prepare('SELECT count(*) n FROM task_launch_snapshots WHERE task_kind = ?').get(kind)?.n).toBe(2);
      for (const launched of [first, second]) {
        const authority = db.prepare(`SELECT a.canonical_json FROM analysis_run_records r JOIN analysis_run_authorizations a USING(authorization_id) WHERE r.run_record_id = ?`).get(launched.runRecordId);
        expect(JSON.parse(String(authority?.canonical_json)).launchSnapshotId).toEqual(expect.any(String));
        expect(db.prepare('SELECT count(*) n FROM analysis_plan_revisions WHERE task_intent_id = ?').get(launched.taskIntentId)?.n).toBe(0);
        expect(launched.ledger.currentRunState(launched.runRecordId)).toBe('authorized');
      }
    } finally { db.close(); }
    await restart();
    store.reconcileStoppedBaselineAnalysisRuns(); store.reconcileStoppedInitialEvaluationRuns();
    store.reconcileStoppedWritingRuns(); store.reconcileStoppedReadersReportRuns(); store.reconcileStoppedEvaluationRewriteRuns();
    store.reconcileStoppedCustomAnalysisRuns();
    const recovered = firstCommand();
    expect(recovered).toMatchObject({ repeated: true, runRecordId: first.runRecordId });
    expect(recovered.ledger.currentRunState(recovered.runRecordId)).toBe('authorized');
    expect(recovered.ledger.loadExecutionPlan(recovered.runRecordId).productionBinding).toMatchObject({ model: defaults.model, reasoningEffort: 'high' });
    const fallback = command(kind, fallbackBook, { modelConnectionId: 'removed-instance-connection', modelId: 'removed-model' }, randomUUID(), true)();
    expect(fallback.launchNotice).toBe('上次选择的模型已不可用，本次已使用角色默认模型。');
    expect(fallback.ledger.loadExecutionPlan(fallback.runRecordId).productionBinding).toMatchObject({ model: defaults.model });
    expect(capture!.requests).toHaveLength(0);
  });
});

it('drives a committed baseline launch after restart once and retains actual request, report and task attribution', async () => {
  const target = await book('baseline-analysis');
  ordinary();
  const clientCommandId = randomUUID();
  const launch = command('baseline-analysis', target, { modelId: 'account-future-model', reasoningEffort: 'high' }, clientCommandId);
  const committed = launch();
  const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
  store.selectMainRoleModel('opencode-go', defaults.model, 'off');
  const changedDefaults = store.getConfiguredModelRoleBinding('main-editorial');
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-happy');
  const reflectionFixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-transient-retry');
  const reflection = Array.from(reflectionFixture.entries.values()).find(entry =>
    entry.response?.kind === 'unit-result' && entry.response.text.includes('ai7.analysis.run-report-reflection-result/1'))?.response;
  expect(reflection).toBeDefined();
  await restart((request, message) => {
    // The ordinary clarification wrapper has its own physical digest; reuse the existing baseline response schedule
    // under the frozen unit identity, as the real-store composite transport tests do.
    const unit = parseUnitMessageHeader(message);
    return request.stage === 'run-report-reflection' ? reflection : request.stage === 'units' && unit !== null
      ? resolveFixtureEntry(fixture.entries, unit.ordinal, unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.unitDigest), request.attemptIndex)?.response
      : capturedMapAnswer(fixture.entries)(request, message);
  });
  store.reconcileStoppedBaselineAnalysisRuns();
  const replay = launch();
  expect(replay).toMatchObject({ repeated: true, runRecordId: committed.runRecordId });
  driveLaunchedLedgerRun(capture!.owner, replay); driveLaunchedLedgerRun(capture!.owner, replay);
  await capture!.owner.whenIdle();
  const report = store.inspectBaselineAnalysis(target.bookId).taskOutcome!.report!;
  expect(report.modelLabel).toBe('account-future-model@high');
  expect(capture!.wireRequests.length).toBeGreaterThan(0);
  expect(capture!.wireRequests.every(request => request.model === 'account-future-model' && request.reasoning_effort === 'high')).toBe(true);
  const sent = capture!.wireRequests.length;
  driveLaunchedLedgerRun(capture!.owner, launch()); await capture!.owner.whenIdle();
  expect(capture!.wireRequests).toHaveLength(sent);
  expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual(changedDefaults);
  const row = store.inspectBookTasks(target.bookId, () => null).groups.flatMap(group => group.items)
    .find(entry => entry.item.modelLabel === report.modelLabel);
  expect(row).toBeDefined();
  const blocks = store.baselineAnalysisLedger.readWorkingBlocks(target.branchId);
  const first = blocks.find((block, index) => block.kind === 'paragraph' && blocks[index + 1]?.kind === 'paragraph')!;
  const gone = blocks.find(block => block.position === first.position + 1)!;
  const window = store.getManuscriptWindowAt(target.manuscriptId, target.branchId, { kind: 'block', blockId: first.blockId });
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: target.manuscriptId, branchId: target.branchId,
    baseRevisionId: window.revisionId, blockId: first.blockId, windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: first.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: first.graphemes, toGrapheme: first.graphemes,
    insertText: '', structure: { kind: 'merge', mergedBlockId: gone.blockId, mergedBlockDigest: gone.digest } });
  expect(store.baselineAnalysisLedger.readWorkingBlocks(target.branchId).some(block => block.blockId === gone.blockId)).toBe(false);
  const moved = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
  expect(() => store.launchBaselineAnalysis({ bookId: target.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'],
    update: { mode: 'reanalyze-range', selectedRange: null, selectedBlocks: { fromBlockId: gone.blockId, toBlockId: gone.blockId } } }, policy))
    .toThrowError(expect.objectContaining({ code: 'ANALYSIS_SELECTED_RANGE_INVALID', message: expect.stringContaining('请重新选择') }));
  expect(store.getManuscriptWindow(target.manuscriptId, target.branchId, null).workingDigest).toBe(moved.workingDigest);
  expect(capture!.wireRequests).toHaveLength(sent);
});

it('records a development-ci launch without a route and lets the existing admission owner explain the blocked run', async () => {
  await setupOwner!.dispose();
  store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  setupOwner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger,
    launchPolicy: policy, fixture: null, secretResolver: { resolve: async () => null } });
  const target = await book('baseline-analysis');
  recordMissingCredentialConnection(store, '本地检查缺少凭据');
  const launched = store.launchBaselineAnalysis({ bookId: target.bookId, clientCommandId: randomUUID(),
    goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, policy);
  driveLaunchedLedgerRun(setupOwner, launched);
  await setupOwner.whenIdle();
  const result = store.inspectBaselineAnalysis(target.bookId);
  expect(result.taskIntent?.taskIntentId).toBe(launched.taskIntentId);
  expect(result.run?.state).toBe('blocked-before-dispatch');
  expect(result.authorization).not.toBeNull();
  expect(result.planRevisions).toHaveLength(0);
});
