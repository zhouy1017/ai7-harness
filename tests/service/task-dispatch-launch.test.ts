import { writeFile } from 'node:fs/promises';
import { setLibraryDecision } from '../support/library-materials.js';
import { launchedRevisionModelLabels, markModelLabels } from '../../src/service/editorial-mark-source.js';
import { MODEL_SERVICE_CONNECTION_IDS, MODEL_SERVICE_ROUTES } from '../../src/shared/protocol/model-service.js';
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
import { WRITING_FIXTURE_IDENTITY, WRITING_REQUEST } from '../support/writing-task.js';
import { READERS_REPORT_FIXTURE_IDENTITY } from '../support/readers-report.js';

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

function ordinary(answer: CapturedOrdinaryAnswer = () => undefined, controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}): void {
  const search = store.getSearchBackendConnections().find(connection => connection.backendId === 'search-tinyfish') ?? store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready');
  store.selectSearchBackend('search-tinyfish');
  capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, answer, controls);
}

async function restart(answer?: CapturedOrdinaryAnswer): Promise<void> {
  await capture?.owner.dispose(); capture?.assertMatched(); capture = undefined;
  await setupOwner?.dispose(); setupOwner = undefined;
  store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  ordinary(answer);
}

/** Instance preferences can outlive a database replacement; this is a real connection from the previous database. */
async function previousConnectionId(currentIds: ReadonlyArray<string>): Promise<string> {
  const previousRoots = await createServiceTestRoots('ai7-previous-dispatch-');
  const previous = await EditorialStore.open(previousRoots.dataRoot, previousRoots.codeRoot);
  try {
    const route = MODEL_SERVICE_ROUTES.find(route => !currentIds.includes(MODEL_SERVICE_CONNECTION_IDS[route]));
    if (route === undefined) throw new Error('expected-an-unenrolled-channel');
    const connection = previous.saveModelServiceConnection('旧实例选择', null, 'needs-attention', route);
    return previous.saveModelServiceConnection(connection.connectionName, connection.credentialReference, 'ready', route).connectionId;
  } finally { previous.markCleanShutdown(); previous.close(); await previousRoots.dispose(); }
}

function launchRequest(kind: Kind, target: Awaited<ReturnType<typeof book>>, executionConfig: RuntimeExecutionConfig, clientCommandId = randomUUID(), rememberedChoice = false, planEdits?: PlanEditsProjection, startWhen: 'now' | 'idle' | 'when-online' = 'now'): import('../../src/shared/protocol.js').TaskLaunchPreviewInput['launch'] {
  const common = { clientCommandId, executionConfig, rememberedChoice, startWhen, ...(planEdits === undefined ? {} : { planEdits }) };
  switch (kind) {
    case 'baseline-analysis': {
      const again = store.inspectBaselineAnalysis(target.bookId).resultSetRevision !== null;
      return { operation: 'launchBaselineAnalysis', input: { ...common, goal: again ? BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'] : BASELINE_ANALYSIS_TASK_GOAL,
        update: again ? { mode: 'reanalyze-book', selectedRange: null } : null } };
    }
    case 'custom-analysis': {
      dimensionId ??= store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE }).dimensions[0]!.dimensionId;
      const selectedDimension = dimensionId;
      const again = store.inspectCustomAnalysisDimensions(target.bookId).dimensions.find(dimension=>dimension.dimensionId===selectedDimension)?.book?.latest != null;
      return { operation: 'launchCustomAnalysis', input: { ...common, dimensionId: selectedDimension, update: again ? { mode: 'reanalyze-book', selectedRange: null } : null } };
    }
    case 'writing': return { operation: 'launchWritingTask', input: { ...common, ...WRITING_REQUEST } };
    case 'initial-evaluation': return { operation: 'launchInitialEvaluation', input: common };
    case 'readers-report': return { operation: 'launchReadersReport', input: { ...common, template: 'author' } };
    case 'evaluation-rewrite': return { operation: 'launchEvaluationRewrite', input: { ...common, recordId: target.recordId } };
  }
}

function command(kind: Kind, target: Awaited<ReturnType<typeof book>>, executionConfig: RuntimeExecutionConfig, clientCommandId = randomUUID(), rememberedChoice = false, planEdits?: PlanEditsProjection, startWhen: 'now' | 'idle' | 'when-online' = 'now', serviceStartWhen: 'now' | 'when-online' = 'now') {
  const launch = launchRequest(kind, target, executionConfig, clientCommandId, rememberedChoice, planEdits, startWhen);
  return () => {
    return commitLaunch(target, launch, serviceStartWhen);
  };
}

function commitLaunch(target: { bookId: string }, launch: import('../../src/shared/protocol.js').TaskLaunchPreviewInput['launch'], serviceStartWhen: 'now' | 'when-online' = 'now') {
    switch (launch.operation) {
      case 'launchBaselineAnalysis': return store.launchBaselineAnalysis({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
      case 'launchCustomAnalysis': return store.launchCustomAnalysis({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
      case 'launchWritingTask': return store.launchWritingTask({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
      case 'launchInitialEvaluation': return store.launchInitialEvaluation({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
      case 'launchReadersReport': return store.launchReadersReport({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
      case 'launchEvaluationRewrite': return store.launchEvaluationRewrite({ ...launch.input, bookId: target.bookId }, policy, serviceStartWhen);
    }
}

type LaunchBook = Awaited<ReturnType<typeof book>>;
type LaunchedTask = ReturnType<ReturnType<typeof command>>;

/** Reuse admitted response bytes of this exact SampleBook/kind; the ordinary adapter still builds and admits every request. */
async function lifecycleAnswers(kind: Kind) {
  const fixtureId = kind === 'writing' ? WRITING_FIXTURE_IDENTITY : kind === 'readers-report' ? READERS_REPORT_FIXTURE_IDENTITY
    : kind === 'custom-analysis' ? 'sample1-custom-analysis-authored' : kind === 'baseline-analysis' ? 'sample1-baseline-happy' : EVALUATION_REWRITE_FIXTURE_IDENTITY;
  const fixtures = await Promise.all([fixtureId, 'sample1-baseline-transient-retry'].map(id =>
    loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), id)));
  const entries = fixtures.flatMap(fixture => [...fixture.entries.values()]).flatMap(entry => {
    if (entry.response?.kind !== 'unit-result') return [];
    try { return [{ entry, schema: String(JSON.parse(entry.response.text).schema) }]; } catch { return []; }
  });
  return (request: Parameters<CapturedOrdinaryAnswer>[0], definition: LaunchedTask['ledger']['definition']) => {
    const schema = request.stage === 'units' ? definition.unitResultSchema : request.stage === 'cross-unit-reduction' ? definition.crossUnit?.resultSchema
      : request.stage === 'assurance-sampling' ? definition.assurance?.resultSchema : request.stage === 'run-report-reflection' ? 'ai7.analysis.run-report-reflection-result/1' : null;
    const ordinal = request.stage === 'units' ? request.unitOrdinal : 0;
    return entries.find(({ entry, schema: actual }) => actual === schema && entry.unitOrdinal === ordinal &&
      (entry.attempt === null || entry.attempt === request.attemptIndex))?.entry.response;
  };
}

async function launchedLifecycle(kind: Kind) {
  const target = await book(kind), answer = await lifecycleAnswers(kind);
  let held!: () => void, release!: () => void, holding = true;
  const reached = new Promise<void>(resolve => { held = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  let launched!: LaunchedTask;
  const schedule: CapturedOrdinaryAnswer = request => answer(request, launched.ledger.definition);
  ordinary(schedule, { unitHold: async () => { if (holding) { holding = false; held(); await gate; } } });
  launched = command(kind, target, { modelId: 'account-future-model', reasoningEffort: 'high' }, randomUUID(), false,
    { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } })();
  driveLaunchedLedgerRun(capture!.owner, launched);
  return { target, launched, schedule, reached: Promise.race([reached, capture!.owner.whenDone(launched.runRecordId).then(() => { throw new Error('run-ended-before-unit-hold'); })]), release };
}

function controlLaunched(kind: Kind, target: LaunchBook, launched: LaunchedTask, action: 'pause' | 'cancel' | 'resume') {
  if (kind === 'baseline-analysis' || kind === 'custom-analysis') return {
    runRecordId: action === 'cancel' ? store.requestBaselineAnalysisCancel(target.bookId, launched.taskIntentId)
      : action === 'pause' ? store.requestBaselineAnalysisPause(target.bookId, launched.taskIntentId)
        : store.continuableBaselineAnalysisRun(target.bookId, launched.taskIntentId),
    ledger: store.executionLedgerForRun(launched.runRecordId),
  };
  return store.requestTaskRunControl({ bookId: target.bookId, kind, ref: launched.taskIntentId, action });
}

function typeBeforeLaunch(target: LaunchBook) {
  const shown = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
  const paragraph = shown.blocks.find(block => block.kind === 'paragraph')!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: target.manuscriptId, branchId: target.branchId,
    baseRevisionId: shown.revisionId, blockId: paragraph.blockId, windowStartBlockId: shown.blocks[0]!.blockId,
    baseBlockDigest: paragraph.digest, expectedJournalSequence: shown.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText: '。' });
  return store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
}

function expectTaskAttribution(kind: Kind, target: LaunchBook, launched: LaunchedTask, effort: string): void {
  const task = store.inspectBookTasks(target.bookId, () => null).groups.flatMap(group => group.items)
    .find(entry => entry.item.technical.some(line => line.key === 'run-record' && line.value.includes(launched.runRecordId)));
  expect(task?.item.modelLabel).toContain(`@${effort}`);
  if (kind === 'writing') expect(store.inspectWritingTask(target.bookId).task?.modelLabel).toBe(task?.item.modelLabel);
  else if (kind === 'initial-evaluation') expect(store.inspectEvaluation(target.bookId, null).initial.task?.modelLabel).toBe(task?.item.modelLabel);
  else if (kind === 'readers-report') expect(store.inspectEvaluation(target.bookId, null).readersReport.task?.modelLabel).toBe(task?.item.modelLabel);
  else if (kind === 'evaluation-rewrite') expect(store.inspectEvaluation(target.bookId, target.recordId).rewrite.task?.modelLabel).toBe(task?.item.modelLabel);
  if (kind === 'custom-analysis') expect(task?.item.object).toMatchObject({ kind: 'analysis', customTitle: CUSTOM_DIMENSION_TITLE });
}

function expectProducedAttribution(kind: Kind, target: LaunchBook, launched: LaunchedTask, label: string): void {
  const projection = store.executionLedgerForRun(launched.runRecordId).inspect(target.bookId);
  expect(projection.taskOutcome?.report?.modelLabel).toBe(label);
  if (kind === 'writing') expect(store.inspectWritingTask(target.bookId).types.find(type=>type.typeId===WRITING_REQUEST.typeId)?.drafted?.modelLabel).toBe(label);
  else if (kind === 'initial-evaluation') expect(store.inspectEvaluation(target.bookId, null).initial.latest?.modelLabel).toBe(label);
  else if (kind === 'readers-report') expect(store.inspectEvaluation(target.bookId, null).readersReport.templates.find(template=>template.template==='author')?.drafted?.modelLabel).toBe(label);
  else if (kind === 'evaluation-rewrite') expect(store.inspectEvaluation(target.bookId, target.recordId).rewrite.proposal?.modelLabel).toBe(label);
}

function expectLaunchAuthorityOnly(kind: Kind, launches: ReadonlyArray<LaunchedTask>): void {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(db.prepare('SELECT count(*) n FROM task_launch_snapshots WHERE task_kind = ?').get(kind)?.n).toBe(launches.length);
    for (const launched of launches) {
      // Units, reductions and sampling share this one Run; no later step is reserved as another authorized Run.
      expect(db.prepare('SELECT count(*) n FROM analysis_run_records WHERE task_intent_id = ?').get(launched.taskIntentId)?.n).toBe(1);
      expect(db.prepare('SELECT count(*) n FROM analysis_run_authorizations WHERE task_intent_id = ?').get(launched.taskIntentId)?.n).toBe(1);
      const authority = db.prepare(`SELECT a.canonical_json FROM analysis_run_records r JOIN analysis_run_authorizations a USING(authorization_id) WHERE r.run_record_id = ?`).get(launched.runRecordId);
      expect(JSON.parse(String(authority?.canonical_json)).launchSnapshotId).toEqual(expect.any(String));
      expect(db.prepare('SELECT count(*) n FROM analysis_plan_revisions WHERE task_intent_id = ?').get(launched.taskIntentId)?.n).toBe(0);
      expect(launched.ledger.currentRunState(launched.runRecordId)).toBe('authorized');
    }
  } finally { db.close(); }
}

function reconcileAll() {
  store.reconcileStoppedBaselineAnalysisRuns(); store.reconcileStoppedInitialEvaluationRuns();
  store.reconcileStoppedWritingRuns(); store.reconcileStoppedReadersReportRuns(); store.reconcileStoppedEvaluationRewriteRuns();
  store.reconcileStoppedCustomAnalysisRuns();
}

function cancelQueued(kind: Kind, target: LaunchBook, launched: LaunchedTask) {
  if (kind === 'baseline-analysis' || kind === 'custom-analysis') {
    store.cancelWaitingBaselineAnalysis(target.bookId, launched.taskIntentId); capture!.owner.dequeue(launched.runRecordId);
  } else {
    const cancelled = store.cancelWaitingTask({ bookId: target.bookId, kind, ref: launched.taskIntentId });
    if (cancelled.dequeue !== null) capture!.owner.dequeue(cancelled.dequeue);
  }
}

async function baselineAnswers(): Promise<CapturedOrdinaryAnswer> {
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-happy');
  const reflectionFixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-transient-retry');
  const reflection = Array.from(reflectionFixture.entries.values()).find(entry =>
    entry.response?.kind === 'unit-result' && entry.response.text.includes('ai7.analysis.run-report-reflection-result/1'))?.response;
  expect(reflection).toBeDefined();
  return (request, message) => {
    // The ordinary clarification wrapper has its own physical digest; reuse the existing baseline response schedule
    // under the frozen unit identity, as the real-store composite transport tests do.
    const unit = parseUnitMessageHeader(message);
    return request.stage === 'run-report-reflection' ? reflection : request.stage === 'units' && unit !== null
      ? resolveFixtureEntry(fixture.entries, unit.ordinal, unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.unitDigest), request.attemptIndex)?.response
      : capturedMapAnswer(fixture.entries)(request, message);
  };
}

function expectBaselineAttribution(target: LaunchBook, committed: LaunchedTask, modelLabel: string | undefined): void {
  const attributionDb = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(launchedRevisionModelLabels(attributionDb, store.inspectBaselineAnalysis(target.bookId).resultSetRevision!.revisionId)).toEqual({ modelLabel });
    expect(attributionDb.prepare('SELECT count(*) n FROM analysis_run_records WHERE task_intent_id = ?').get(committed.taskIntentId)?.n).toBe(1);
    expect(attributionDb.prepare('SELECT count(*) n FROM analysis_run_authorizations WHERE task_intent_id = ?').get(committed.taskIntentId)?.n).toBe(1);
    const admittedRuns = attributionDb.prepare(`SELECT DISTINCT run_record_id FROM analysis_run_states
      WHERE json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit'
      AND json_extract(canonical_json, '$.requestAdmission.data.event.request.requestId') IN (${capture!.requests.map(() => '?').join(',')})`)
      .all(...capture!.requests.map(request => request.requestId));
    expect(admittedRuns).toEqual([{ run_record_id: committed.runRecordId }]);
  }
  finally { attributionDb.close(); }
  const row = store.inspectBookTasks(target.bookId, () => null).groups.flatMap(group => group.items)
    .find(entry => entry.item.modelLabel === modelLabel);
  expect(row).toBeDefined();
}

function expectVanishedSelectionRefused(target: LaunchBook): void {
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
}

describe.each(KINDS)('%s one-step launch', (kind) => {
  it('refuses the preview while a same-kind task is active instead of describing an unavailable launch', async () => {
    const target=await book(kind);ordinary();
    command(kind,target,{reasoningEffort:'high'},randomUUID(),false,undefined,'when-online')();
    const launch=launchRequest(kind,target,{reasoningEffort:'low'});
    const expectedCode=kind==='writing'?'WRITING_UNAVAILABLE':kind==='evaluation-rewrite'?'EVALUATION_REWRITE_UNAVAILABLE':'ANALYSIS_TASK_ACTIVE';
    expect(()=>store.previewTaskLaunch({bookId:target.bookId,launch},policy)).toThrowError(expect.objectContaining({code:expectedCode,message:expect.stringMatching(/等待|任务|运行/u)}));
    expect(capture!.requests).toHaveLength(0);
  });

  it('previews exactly the frozen editorial plan with selected references, range, sampling, retry and budget', async () => {
    const target = await book(kind), answer = await lifecycleAnswers(kind);
    let definition!: LaunchedTask['ledger']['definition'];
    ordinary(request => answer(request, definition));
    if (kind === 'baseline-analysis' || kind === 'custom-analysis') {
      const first = command(kind, target, { reasoningEffort: 'high' })(); definition = first.ledger.definition;
      driveLaunchedLedgerRun(capture!.owner, first); await capture!.owner.whenIdle();
    }
    let materialId: string | undefined;
    if (kind === 'writing' || kind === 'initial-evaluation' || kind === 'readers-report') {
      const path = join(roots.inputRoot, 'sample-reference.txt');
      await writeFile(path, store.baselineAnalysisLedger.readWorkingBlocks(target.branchId).filter(block=>block.kind==='paragraph').slice(0,2).map(block=>block.text).join('\n\n'));
      const preview = await store.previewLibraryMaterial(path);
      const item = await store.addLibraryMaterial({ previewId: preview.previewId, title: '样书背景资料', kind: 'document' });
      setLibraryDecision(store, { materialId: item.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: target.bookId } } });
      setLibraryDecision(store, { materialId: item.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      store.startMaterialIndexing(); await store.settleMaterialIndexing(); materialId = item.materialId;
    }
    typeBeforeLaunch(target);
    const launch = launchRequest(kind, target, { modelId: 'account-future-model', reasoningEffort: 'high' }, randomUUID(), false,
      { removedSteps: kind==='baseline-analysis'?['assurance-sampling']:[], disallowedAdaptations: ['safe-retry'], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 12345 } }, 'idle');
    if (launch.operation==='launchWritingTask'||launch.operation==='launchInitialEvaluation'||launch.operation==='launchReadersReport') launch.input={...launch.input,materialIds:[materialId!]};
    if (launch.operation==='launchReadersReport') launch.input={...launch.input,template:'editorial'};
    if (launch.operation==='launchBaselineAnalysis'||launch.operation==='launchCustomAnalysis') {
      const selectedRange={startPosition:26,endPosition:43};
      if(launch.operation==='launchBaselineAnalysis')launch.input={...launch.input,goal:BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'],update:{mode:'reanalyze-range',selectedRange}};
      else launch.input={...launch.input,update:{mode:'reanalyze-range',selectedRange}};
    }
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const before=db.prepare('PRAGMA data_version').get(), window=store.getManuscriptWindow(target.manuscriptId,target.branchId,null);
      const preview=store.previewTaskLaunch({bookId:target.bookId,launch},policy);
      expect(db.prepare('PRAGMA data_version').get()).toEqual(before);
      expect(store.getManuscriptWindow(target.manuscriptId,target.branchId,null)).toEqual(window);
      const launched=commitLaunch(target,launch);
      const plan=store.inspectTaskPlan({bookId:target.bookId,kind:kind==='custom-analysis'?'baseline-analysis':kind,ref:launched.taskIntentId});
      expect(preview.steps).toEqual(plan.steps.map(step=>`${step.label}${step.removed?'（本次不做）':''}`));
      expect(preview.scope).toBe(plan.scope.process); expect(preview.reference).toEqual(plan.scope.reference);
      expect(preview.send).toBe(`${plan.scope.send}；${plan.service.send}`); expect(preview.usage).toBe(plan.service.usage);
      expect(preview.adaptations).toEqual(plan.boundary.adaptable.map(entry=>`${entry.label}：${entry.removed?'不允许':entry.askFirst?'先问我':'允许'}`));
      if(materialId!==undefined)expect(preview.reference.join('')).toContain('样书背景资料');
      if(kind==='readers-report')expect(preview.send).toContain('定稿的评估记录');
      if(kind==='baseline-analysis')expect(preview.steps).toContain('核对与抽检（本次不做）');
    } finally {db.close();}
  });

  it('drives concurrent choices to completion and keeps an earlier revision labelled after a later model runs', async () => {
    const a = await book(kind), b = await book(kind), answer = await lifecycleAnswers(kind);
    let definition!: LaunchedTask['ledger']['definition'];
    ordinary(request=>answer(request, definition));
    const first = command(kind, a, { modelId: 'account-future-a', reasoningEffort: 'high' })(); definition = first.ledger.definition;
    const other = command(kind, b, { modelId: 'account-future-b', reasoningEffort: 'low' })();
    const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
    store.selectMainRoleModel('opencode-go', defaults.model, 'off');
    driveLaunchedLedgerRun(capture!.owner, first); driveLaunchedLedgerRun(capture!.owner, other);
    await capture!.owner.whenIdle();
    expectProducedAttribution(kind, a, first, 'account-future-a@high'); expectProducedAttribution(kind, b, other, 'account-future-b@low');
    const previousRevision = first.ledger.inspect(a.bookId).resultSetRevision!.revisionId;
    if (kind === 'evaluation-rewrite') store.decideEvaluationRewrite(a.bookId, previousRevision, 'discard');
    const later = command(kind, a, { modelId: 'account-future-b', reasoningEffort: 'low' })(); definition = later.ledger.definition;
    driveLaunchedLedgerRun(capture!.owner, later); await capture!.owner.whenIdle();
    expectProducedAttribution(kind, a, later, 'account-future-b@low');
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try { expect(launchedRevisionModelLabels(db, previousRevision)).toEqual({ modelLabel: 'account-future-a@high' }); } finally { db.close(); }
    expect(capture!.wireRequests.some(request=>request.model==='account-future-a' && request.reasoning_effort==='high')).toBe(true);
    expect(capture!.wireRequests.some(request=>request.model==='account-future-b' && request.reasoning_effort==='low')).toBe(true);
  });
  it('previews current manuscript and options without writing a task or checkpoint', async () => {
    const target = await book(kind); ordinary(); typeBeforeLaunch(target);
    const launch = launchRequest(kind, target, { modelId: 'account-future-model', reasoningEffort: 'high' }, randomUUID(), false,
      { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 12345 } });
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const before = db.prepare('PRAGMA data_version').get();
      const window = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
      const preview = store.previewTaskLaunch({ bookId: target.bookId, launch }, policy);
      expect(preview.units).toBeGreaterThan(0); expect(preview.steps.length).toBeGreaterThan(0);
      expect(preview.scope).toContain('阅读范围'); expect(preview.send).toContain('发往'); expect(preview.usage).toContain('12,345');
      expect(db.prepare('PRAGMA data_version').get()).toEqual(before);
      expect(store.getManuscriptWindow(target.manuscriptId, target.branchId, null)).toEqual(window);
      expect(capture!.requests).toHaveLength(0);
    } finally { db.close(); }
  });

  it('replays the original cancelled command after a newer task exists', async () => {
    const target = await book(kind); ordinary();
    const firstCommand = command(kind, target, { reasoningEffort: 'high' }, randomUUID(), false, undefined, 'when-online');
    const first = firstCommand(); cancelQueued(kind, target, first);
    const second = command(kind, target, { reasoningEffort: 'low' }, randomUUID(), false, undefined, 'when-online')();
    expect(firstCommand()).toMatchObject({ repeated: true, runRecordId: first.runRecordId, taskIntentId: first.taskIntentId });
    expect(store.executionLedgerForRun(first.runRecordId).currentRunState(first.runRecordId)).toBe('cancelled');
    expect(second.ledger.currentRunState(second.runRecordId)).toBe('awaiting-connectivity');
    expect(capture!.requests).toHaveLength(0);
  });

  it('restores a launch queued behind two active tasks after restart without replay', async () => {
    const firstBook = await book(kind), secondBook = await book(kind), queuedBook = await book(kind), answer = await lifecycleAnswers(kind);
    let definition!: LaunchedTask['ledger']['definition'], ready!: () => void, release!: () => void, held = 0;
    const reached = new Promise<void>(resolve=>{ ready=resolve; }), gate = new Promise<void>(resolve=>{ release=resolve; });
    const schedule: CapturedOrdinaryAnswer = request=>answer(request, definition);
    ordinary(schedule, { capacity: 2, unitHold: async () => { held += 1; if (held===2) ready(); await gate; } });
    try {
      for (const target of [firstBook, secondBook]) {
        const launched = command(kind, target, { reasoningEffort: 'low' }, randomUUID(), false,
          { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } })();
        definition = launched.ledger.definition; driveLaunchedLedgerRun(capture!.owner, launched);
      }
      await reached;
      const queued = command(kind, queuedBook, { modelId: 'account-future-model', reasoningEffort: 'high' })();
      driveLaunchedLedgerRun(capture!.owner, queued);
      expect(capture!.owner.queuePosition(queued.runRecordId)).not.toBeNull();
      const stopping = capture!.owner.dispose(); release(); await stopping;
      await restart(schedule); reconcileAll();
      for (const pending of store.pendingLaunchedLedgerRuns()) driveLaunchedLedgerRun(capture!.owner, pending);
      await capture!.owner.whenIdle();
      expect(store.executionLedgerForRun(queued.runRecordId).currentRunState(queued.runRecordId)).toMatch(/^completed/u);
      expectProducedAttribution(kind, queuedBook, queued, 'account-future-model@high');
      expect(capture!.wireRequests.length).toBeGreaterThan(0);
      expect(capture!.wireRequests.every(request=>request.model==='account-future-model' && request.reasoning_effort==='high')).toBe(true);
    } finally { release(); }
  });

  it.each(['now', 'idle', 'when-online'] as const)('restores an unadmitted %s launch after restart without a replay', async timing => {
    const target = await book(kind), answer = await lifecycleAnswers(kind); let definition!: LaunchedTask['ledger']['definition'];
    const schedule: CapturedOrdinaryAnswer = request => answer(request, definition);
    ordinary(schedule);
    const first = command(kind, target, { modelId: 'account-future-model', reasoningEffort: 'high' }, randomUUID(), false, undefined, timing)();
    definition = first.ledger.definition;
    await restart(schedule); reconcileAll();
    capture!.owner.setBackgroundIdle(false);
    for (const pending of store.pendingLaunchedLedgerRuns()) driveLaunchedLedgerRun(capture!.owner, pending);
    if (timing === 'idle') {
      expect(capture!.owner.queuePosition(first.runRecordId)).not.toBeNull();
      capture!.owner.setBackgroundIdle(true);
    } else if (timing === 'when-online') {
      expect(capture!.requests).toHaveLength(0);
      const waiting = store.waitingTaskRuns(target.bookId)[0]!;
      expect(waiting.kind).not.toBe('review-run');
      capture!.owner.admitAndDispatch(first.runRecordId, store.executionLedgerForRun(first.runRecordId), { afterReconnectPreflight: true });
    }
    await capture!.owner.whenIdle();
    expect(store.executionLedgerForRun(first.runRecordId).currentRunState(first.runRecordId)).toMatch(/^completed/u);
    expectProducedAttribution(kind, target, first, 'account-future-model@high');
    expect(capture!.wireRequests.length).toBeGreaterThan(0);
    expect(capture!.wireRequests.every(request=>request.model==='account-future-model' && request.reasoning_effort==='high')).toBe(true);
  });

  it.each(['now', 'idle', 'when-online'] as const)('cancels a restored %s launch through its waiting control', async timing => {
    const target = await book(kind); ordinary();
    const first = command(kind, target, { reasoningEffort: 'high' }, randomUUID(), false, undefined, timing)();
    await restart(); reconcileAll(); capture!.owner.freezeQueue(true);
    for (const pending of store.pendingLaunchedLedgerRuns()) driveLaunchedLedgerRun(capture!.owner, pending);
    cancelQueued(kind, target, first); capture!.owner.freezeQueue(false); capture!.owner.setBackgroundIdle(true);
    await capture!.owner.whenIdle();
    expect(store.executionLedgerForRun(first.runRecordId).currentRunState(first.runRecordId)).toBe('cancelled');
    expect(capture!.requests).toHaveLength(0);
  });
  it.each(['cancel', 'pause', 'restart'] as const)('releases an ordinary-production launched task after %s', async action => {
    const test = await launchedLifecycle(kind);
    try {
      await test.reached;
      expect(capture!.wireRequests.length).toBeGreaterThan(0);
      expect(capture!.wireRequests.every(request=>request.model==='account-future-model' && request.reasoning_effort==='high')).toBe(true);
      if (action === 'restart') {
        const stopping = capture!.owner.dispose(); test.release(); await stopping;
        await restart(test.schedule);
        store.reconcileStoppedBaselineAnalysisRuns(); store.reconcileStoppedCustomAnalysisRuns(); store.reconcileStoppedWritingRuns();
        store.reconcileStoppedInitialEvaluationRuns(); store.reconcileStoppedReadersReportRuns(); store.reconcileStoppedEvaluationRewriteRuns();
        const replay = store.executionLedgerForRun(test.launched.runRecordId);
        if (replay.currentRunState(test.launched.runRecordId) === 'resumable') {
          driveLaunchedLedgerRun(capture!.owner, { runRecordId: test.launched.runRecordId, ledger: replay });
          await capture!.owner.whenIdle();
          expect(replay.currentRunState(test.launched.runRecordId)).toMatch(/^completed/u);
        } else expect(replay.currentRunState(test.launched.runRecordId)).toBe('interrupted');
      } else {
        const controlled = controlLaunched(kind, test.target, test.launched, action);
        if (action === 'cancel') capture!.owner.cancelRun(controlled.runRecordId!, controlled.ledger);
        else capture!.owner.pauseRun(controlled.runRecordId!, controlled.ledger);
        test.release(); await capture!.owner.whenIdle();
        expect(controlled.ledger.currentRunState(controlled.runRecordId!)).toBe(action === 'cancel' ? 'cancelled' : 'paused');
        if (action === 'pause') {
          const alternative = store.getModelServiceRouteConnection('deepseek-open-platform') ?? store.saveModelServiceConnection('另一渠道', null, 'needs-attention', 'deepseek-open-platform');
          store.saveModelServiceConnection(alternative.connectionName, alternative.credentialReference, 'ready', 'deepseek-open-platform');
          store.selectMainRoleModel('deepseek-open-platform', alternative.binding.modelId, 'off');
          const sent = capture!.wireRequests.length;
          driveLaunchedLedgerRun(capture!.owner, test.launched); await capture!.owner.whenIdle();
          expect(capture!.wireRequests).toHaveLength(sent);
          const resumed = controlLaunched(kind, test.target, test.launched, 'resume');
          capture!.owner.resumeOrQueue(resumed.runRecordId!, resumed.ledger); await capture!.owner.whenIdle();
          expect(controlled.ledger.currentRunState(controlled.runRecordId!)).toMatch(/^completed/u);
        } else {
          const relaunched = command(kind, test.target, { modelId: 'account-future-model', reasoningEffort: 'high' })();
          driveLaunchedLedgerRun(capture!.owner, relaunched); await capture!.owner.whenIdle();
          expect(relaunched.ledger.currentRunState(relaunched.runRecordId)).toMatch(/^completed/u);
          expectProducedAttribution(kind, test.target, relaunched, 'account-future-model@high');
        }
      }
      expect(capture!.owner.busy).toBe(false);
      expect(capture!.wireRequests.every(request=>request.model==='account-future-model' && request.reasoning_effort==='high')).toBe(true);
    } finally { test.release(); }
  });

  it('queues an offline launch in the same snapshot and preserves cancellation and replay without a send', async () => {
    const target = await book(kind); ordinary();
    const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
    const config = { modelId: defaults.model, reasoningEffort: 'high' }, clientCommandId = randomUUID();
    // Connectivity is service context, outside the command's identity; retrying after reconnect returns the original wait.
    const first = command(kind, target, config, clientCommandId, false, undefined, 'now', 'when-online')();
    expect(first.ledger.currentRunState(first.runRecordId)).toBe('awaiting-connectivity');
    expect(first.waitingForNetwork).toBe(true);
    expect(first.launchNotice).toBeUndefined();
    driveLaunchedLedgerRun(capture!.owner, first);
    expect(capture!.requests).toHaveLength(0);
    store.selectMainRoleModel('opencode-go', defaults.model, 'off');
    const replay = command(kind, target, config, clientCommandId)();
    expect(replay).toMatchObject({ repeated: true, runRecordId: first.runRecordId });
    expect(replay.ledger.currentRunState(first.runRecordId)).toBe('awaiting-connectivity');
    const waiting = store.waitingTaskRuns(target.bookId)[0]!;
    expect(store.taskPreflightDrift(waiting)).toEqual([]);
    expect(replay.ledger.loadExecutionPlan(first.runRecordId).productionBinding?.reasoningEffort).toBe('high');
    if (waiting.kind === 'baseline-analysis') store.cancelWaitingBaselineAnalysis(target.bookId, waiting.ref);
    else store.cancelWaitingTask({ bookId: target.bookId, kind: waiting.kind, ref: waiting.ref });
    expect(replay.ledger.currentRunState(first.runRecordId)).toBe('cancelled');
    driveLaunchedLedgerRun(capture!.owner, command(kind, target, config, clientCommandId)());
    expect(capture!.requests).toHaveLength(0);
  });

  it('freezes concurrent choices, launches no approval-only records and replays after settings change', async () => {
    const a = await book(kind), b = await book(kind), fallbackBook = await book(kind);
    ordinary();
    const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
    const alternative = store.getModelServiceRouteConnection('deepseek-open-platform')
      ?? store.saveModelServiceConnection('另一渠道', null, 'needs-attention', 'deepseek-open-platform');
    store.saveModelServiceConnection(alternative.connectionName, alternative.credentialReference, 'ready', 'deepseek-open-platform');
    const current = typeBeforeLaunch(a);
    const clientCommandId = randomUUID();
    const firstCommand = command(kind, a, { modelId: defaults.model, reasoningEffort: 'high' }, clientCommandId, false,
      { removedSteps: [], disallowedAdaptations: kind === 'custom-analysis' ? ['safe-retry'] : [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50_000 } }, 'idle');
    const secondCommand = command(kind, b, { modelConnectionId: alternative.connectionId, modelId: 'account-future-model', reasoningEffort: 'low' });
    const [first, second] = await Promise.all([Promise.resolve().then(firstCommand), Promise.resolve().then(secondCommand)]);
    expect(first.runRecordId).not.toBe(second.runRecordId);
    expect(first.ledger.inspect(a.bookId).authorization?.startWhen).toBe('idle');
    expect(second.ledger.inspect(b.bookId).authorization?.startWhen).toBe('now');
    expect(first.ledger.loadExecutionPlan(first.runRecordId).checkpoint.journalSequence).toBe(current.journalSequence);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).checkpoint.revisionDigest).toBe(current.workingDigest);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 50_000 });
    expect(first.ledger.inspect(a.bookId).planVersion!.edits.disallowedAdaptations).toEqual(kind === 'custom-analysis' ? ['safe-retry'] : []);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).productionBinding).toMatchObject({ model: defaults.model, reasoningEffort: 'high' });
    expect(second.ledger.loadExecutionPlan(second.runRecordId).productionBinding).toMatchObject({ model: 'account-future-model', reasoningEffort: 'low' });
    expect(second.ledger.inspect(b.bookId).providerResolutionPlan?.remoteBinding?.credentialReference).toBe(alternative.credentialReference);
    expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual(defaults);
    for (const [target, launched, effort] of [[a, first, 'high'], [b, second, 'low']] as const) expectTaskAttribution(kind, target, launched, effort);
    store.selectMainRoleModel('opencode-go', defaults.model, 'off');
    expect(firstCommand()).toMatchObject({ repeated: true, runRecordId: first.runRecordId, taskIntentId: first.taskIntentId });
    expect(() => command(kind, a, { modelId: defaults.model, reasoningEffort: 'low' }, clientCommandId)()).toThrowError(expect.objectContaining({
      code: 'TASK_LAUNCH_COMMAND_CHANGED', message: expect.stringContaining('请重新发起'),
    }));
    expectLaunchAuthorityOnly(kind, [first, second]);
    await restart();
    store.reconcileStoppedBaselineAnalysisRuns(); store.reconcileStoppedInitialEvaluationRuns();
    store.reconcileStoppedWritingRuns(); store.reconcileStoppedReadersReportRuns(); store.reconcileStoppedEvaluationRewriteRuns();
    store.reconcileStoppedCustomAnalysisRuns();
    const recovered = firstCommand();
    expect(recovered).toMatchObject({ repeated: true, runRecordId: first.runRecordId });
    expect(recovered.ledger.currentRunState(recovered.runRecordId)).toBe('authorized');
    expect(recovered.ledger.loadExecutionPlan(recovered.runRecordId).productionBinding).toMatchObject({ model: defaults.model, reasoningEffort: 'high' });
    const goneConnection = await previousConnectionId(store.getModelServiceConnections().map(connection => connection.connectionId));
    expect(store.getModelServiceConnections().some(connection => connection.connectionId === goneConnection)).toBe(false);
    const fallback = command(kind, fallbackBook, { modelConnectionId: goneConnection, modelId: defaults.model }, randomUUID(), true)();
    expect(fallback.launchNotice).toBe('上次选择的模型已不可用，本次已使用角色默认模型。');
    expect(fallback.ledger.loadExecutionPlan(fallback.runRecordId).productionBinding).toMatchObject({ model: defaults.model });
    expect(capture!.requests).toHaveLength(0);
  });
});

it('labels a legacy prepared-and-authorized result from its producing plan without a launch snapshot', async () => {
  const target = await book('baseline-analysis'), answer = await lifecycleAnswers('baseline-analysis');
  ordinary(request=>answer(request, store.baselineAnalysisLedger.definition));
  const ledger=store.baselineAnalysisLedger;
  let prepared=ledger.prepare({ phase:'start', bookId:target.bookId, goal:BASELINE_ANALYSIS_TASK_GOAL, update:null, reconfirm:false, launchPolicy:capture!.policy });
  while(!prepared.done) prepared=ledger.prepare({phase:'advance',workId:prepared.workId!});
  const plan=prepared.projection!;
  const authorized=ledger.authorize(target.bookId,plan.taskIntent!.taskIntentId,plan.planEnvelope!.digest);
  capture!.owner.admitOrQueue(authorized.dispatchRunRecordId!,ledger);await capture!.owner.whenIdle();
  const expected=markModelLabels(capture!.launch.live).modelLabel;
  expect(expected).toEqual(expect.any(String));
  expect(ledger.inspect(target.bookId).taskOutcome!.report!.modelLabel).toBe(expected);
  const db=new DatabaseSync(join(roots.dataRoot,'store','ai7.sqlite'),{readOnly:true});
  try {expect(db.prepare('SELECT count(*) n FROM task_launch_snapshots').get()?.n).toBe(0);expect(launchedRevisionModelLabels(db,ledger.inspect(target.bookId).resultSetRevision!.revisionId)).toEqual({modelLabel:expected});}finally{db.close();}
});

it('drives two different kinds on the same Book without crossing their launched bindings', async () => {
  const target = await book('baseline-analysis');
  const baseline = await lifecycleAnswers('baseline-analysis'), writing = await lifecycleAnswers('writing');
  const jobs: Array<{ launched: LaunchedTask; answer: Awaited<ReturnType<typeof lifecycleAnswers>> }> = [];
  ordinary((request) => {
    const selected = request.stage === 'run-report-reflection' ? jobs[0] : jobs.find(({ launched }) => {
      const definition = launched.ledger.definition;
      return [definition.promptContractDigest, definition.clarificationBase?.promptContractDigest,
        definition.crossUnit?.promptContractDigest, definition.assurance?.promptContractDigest].includes(request.contractDigest);
    });
    if (selected === undefined) throw new Error('cross-kind-response-contract-unmatched');
    return selected.answer(request, selected.launched.ledger.definition);
  });
  const first = command('baseline-analysis', target, { modelId: 'account-baseline', reasoningEffort: 'high' })();
  const second = command('writing', target, { modelId: 'account-writing', reasoningEffort: 'low' })();
  jobs.push({ launched: first, answer: baseline }, { launched: second, answer: writing });
  driveLaunchedLedgerRun(capture!.owner, first); driveLaunchedLedgerRun(capture!.owner, second); await capture!.owner.whenIdle();
  expectProducedAttribution('baseline-analysis', target, first, 'account-baseline@high');
  expectProducedAttribution('writing', target, second, 'account-writing@low');
  expectTaskAttribution('baseline-analysis', target, first, 'high'); expectTaskAttribution('writing', target, second, 'low');
  expect(capture!.wireRequests.some(request=>request.model==='account-baseline' && request.reasoning_effort==='high')).toBe(true);
  expect(capture!.wireRequests.some(request=>request.model==='account-writing' && request.reasoning_effort==='low')).toBe(true);
});

it('reconnects a committed baseline launch after restart once and retains actual request, report and task attribution', async () => {
  const target = await book('baseline-analysis');
  ordinary();
  const clientCommandId = randomUUID();
  const launch = command('baseline-analysis', target, { modelId: 'account-future-model', reasoningEffort: 'high' }, clientCommandId, false, undefined, 'when-online');
  const committed = launch();
  const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
  store.selectMainRoleModel('opencode-go', defaults.model, 'off');
  const changedDefaults = store.getConfiguredModelRoleBinding('main-editorial');
  await restart(await baselineAnswers());
  store.reconcileStoppedBaselineAnalysisRuns();
  const replay = launch();
  expect(replay).toMatchObject({ repeated: true, runRecordId: committed.runRecordId });
  expect(replay.ledger.currentRunState(replay.runRecordId)).toBe('awaiting-connectivity');
  const waiting = store.waitingTaskRuns(target.bookId)[0]!;
  expect(waiting.kind).toBe('baseline-analysis');
  expect(store.taskPreflightDrift(waiting)).toEqual([]);
  if (waiting.kind === 'review-run') throw new Error('expected-ledger-wait');
  capture!.owner.admitAndDispatch(replay.runRecordId, store.waitingRunLedger({ ...waiting, kind: waiting.kind }), { afterReconnectPreflight: true });
  driveLaunchedLedgerRun(capture!.owner, replay); driveLaunchedLedgerRun(capture!.owner, replay);
  await capture!.owner.whenIdle();
  const report = store.inspectBaselineAnalysis(target.bookId).taskOutcome!.report!;
  expect(report.modelLabel).toBe('account-future-model@high');
  expectBaselineAttribution(target, committed, report.modelLabel);
  expect(capture!.requests.some(request => request.stage === 'cross-unit-reduction')).toBe(true);
  expect(capture!.wireRequests.length).toBeGreaterThan(0);
  expect(capture!.wireRequests.every(request => request.model === 'account-future-model' && request.reasoning_effort === 'high')).toBe(true);
  const sent = capture!.wireRequests.length;
  driveLaunchedLedgerRun(capture!.owner, launch()); await capture!.owner.whenIdle();
  expect(capture!.wireRequests).toHaveLength(sent);
  expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual(changedDefaults);
  expectVanishedSelectionRefused(target);
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

it('refuses the preview and launch of the unsupported 初评 procedure instruction with the same guidance (#1476 unchanged)', async () => {
  const target=await book('initial-evaluation');ordinary();
  const search=store.saveSearchBackendCredential('search-tinyfish',null,'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish',search.credentialReference,'ready');store.selectSearchBackend('search-tinyfish');
  const original=store.procedureLibrary({action:'inspect'}).procedures.find(entry=>entry.executorKind==='evaluation')!;
  const changed=store.procedureLibrary({action:'save',input:{procedureId:original.procedureId,basedOn:{procedureId:original.procedureId,version:original.version,digest:original.digest},title:original.document.title,editorInstruction:'保留叙述中的短句。',stages:original.document.stages}}).procedures.find(entry=>entry.procedureId===original.procedureId)!;
  store.procedureLibrary({action:'select',bookId:target.bookId,procedure:{procedureId:changed.procedureId,version:changed.version,digest:changed.digest}});
  const launch=launchRequest('initial-evaluation',target,{reasoningEffort:'high'});
  const refusal=expect.objectContaining({code:'PROCEDURE_INSTRUCTION_NOT_ADMITTED',message:'这项任务暂不支持带编辑指令的工序。'});
  expect(()=>store.previewTaskLaunch({bookId:target.bookId,launch},policy)).toThrowError(refusal);
  expect(()=>commitLaunch(target,launch)).toThrowError(refusal);
  expect(capture!.requests).toHaveLength(0);
});
