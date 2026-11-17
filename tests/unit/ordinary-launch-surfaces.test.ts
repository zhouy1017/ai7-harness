import { setLibraryDecision } from '../support/library-materials.js';
import { cp, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { CooperativeJobOwner } from '../../src/service/cooperative-jobs.js';
import { BaselineAnalysisExecutionOwner, driveLaunchedLedgerRun, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { modelServiceChannels, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { mountTaskDrawer, type TaskLaunchRequest } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type RendererApi, type TaskLaunchPreviewInput } from '../../src/shared/protocol.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation } from '../../src/shared/runtime-execution-config.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { beginRewriteAsJ11, EVALUATION_REWRITE_FIXTURE_IDENTITY } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { CUSTOM_DIMENSION_TITLE, CUSTOM_DIMENSION_TEMPLATE } from '../support/custom-analysis.js';
import { WRITING_REQUEST } from '../support/writing-task.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

vi.mock('../../src/renderer/task-panel.js', () => ({ mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }), mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
afterEach(() => { setTechnicalLayerVisible(true); vi.unstubAllGlobals(); });

/** The two surfaces start from copies of one closed SampleBook database, so their manuscript pins are identical. */
async function seed(operation: LedgerTaskLaunchOperation) {
  const roots = await createServiceTestRoots('ai7-launch-surfaces-');
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), EVALUATION_REWRITE_FIXTURE_IDENTITY);
  const governor = new ModelRequestGovernor();
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } });
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const book = await importSample1Book(store, roots.codeRoot, 'sample1 启动界面');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    let recordId = '';
    if (operation === 'launchReadersReport' || operation === 'launchEvaluationRewrite') {
      recordMissingCredentialConnection(store, '初评本地检查');
      await runInitialEvaluationToEnd(store, owner, book.bookId, policy);
      finalizeAsJ11(store, book.bookId);
      if (operation === 'launchEvaluationRewrite') recordId = beginRewriteAsJ11(store, book.bookId).recordId;
    }
    const dimensionId = operation === 'launchCustomAnalysis' ? store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE }).dimensions[0]!.dimensionId : '';
    let materialIds: string[] = [];
    if (operation === 'launchInitialEvaluation' || operation === 'launchReadersReport') {
      const referencePath = join(roots.inputRoot, 'sample1-launch-reference.txt');
      await writeFile(referencePath, store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).filter(block => block.kind === 'paragraph').slice(0, 2).map(block => block.text).join('\n\n'));
      const preview = await store.previewLibraryMaterial(referencePath);
      const material = await store.addLibraryMaterial({ previewId: preview.previewId, title: 'sample1 任务参考', kind: 'document' });
      setLibraryDecision(store, { materialId: material.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: book.bookId } } });
      setLibraryDecision(store, { materialId: material.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      store.startMaterialIndexing(); await store.settleMaterialIndexing(); materialIds = [material.materialId];
    }
    const input = operation === 'launchBaselineAnalysis' ? { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }
      : operation === 'launchCustomAnalysis' ? { dimensionId, update: null } : operation === 'launchWritingTask' ? WRITING_REQUEST
        : operation === 'launchReadersReport' ? { template: 'author', materialIds } : operation === 'launchEvaluationRewrite' ? { recordId } : { materialIds };
    return { roots, bookId: book.bookId, input };
  } catch (error) { await roots.dispose(); throw error; }
  finally { await owner.dispose(); governor.close(); await governor.whenIdle(); store.markCleanShutdown(); store.close(); }
}

function commit(store: EditorialStore, launch: TaskLaunchPreviewInput['launch'], bookId: string, policy: Awaited<ReturnType<typeof resolveSourceCheckoutLaunchPolicy>>) {
  switch (launch.operation) {
    case 'launchBaselineAnalysis': return store.launchBaselineAnalysis({ ...launch.input, bookId }, policy);
    case 'launchCustomAnalysis': return store.launchCustomAnalysis({ ...launch.input, bookId }, policy);
    case 'launchWritingTask': return store.launchWritingTask({ ...launch.input, bookId }, policy);
    case 'launchInitialEvaluation': return store.launchInitialEvaluation({ ...launch.input, bookId }, policy);
    case 'launchReadersReport': return store.launchReadersReport({ ...launch.input, bookId }, policy);
    case 'launchEvaluationRewrite': return store.launchEvaluationRewrite({ ...launch.input, bookId }, policy);
  }
}

async function captureStart(seedState: Awaited<ReturnType<typeof seed>>, operation: LedgerTaskLaunchOperation, page: boolean) {
  const { roots, bookId, input } = seedState;
  const dataRoot = join(roots.inputRoot, page ? 'page' : 'drawer');
  await cp(roots.dataRoot, dataRoot, { recursive: true });
  const store = await EditorialStore.open(dataRoot, roots.codeRoot);
  const governor = new ModelRequestGovernor();
  const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, dataRoot, governor,
    () => ({ kind: 'adapter-failure', code: 'CAPTURED_TEST_REFUSAL', message: 'Captured response', status: 400 }));
  const uninstall = installMiniDom(); setTechnicalLayerVisible(false);
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null });
  const channels = modelServiceChannels();
  const connection = store.getModelServiceRouteConnection('opencode-go')!;
  const launch = vi.fn(async (input: unknown) => {
    const launched = commit(store, { operation, input } as TaskLaunchPreviewInput['launch'], bookId, capture.policy);
    driveLaunchedLedgerRun(capture.owner, launched); return launched;
  });
  const api = { [operation]: launch, getPreferences: async () => ({ values: preferenceDefaults() }),
  getModelServiceSettings: async () => ({ channels, roles: [{ roleId: 'main-editorial', connection: { ...connection, credentialOperationState: 'ready' }, binding: { modelId: channels.find(channel => channel.route === 'opencode-go')!.models[0]!.modelId } }], routeChoice: { routes: [{ route: 'opencode-go', connection }] } }),
  inspectEvaluation: async () => store.inspectEvaluation(bookId, null) };
  const root = document.createElement('aside'), surface = document.createElement('section'); document.body.append(root, surface);
  const drawer = mountTaskDrawer({ root, shell: document.body, api, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(),
    settle: async () => true, errorMessage: (_error: unknown, fallback: string) => fallback } as never);
  drawer.open = vi.fn();
  try {
    drawer.openLaunch({ operation, bookId, title: LEDGER_TASK_LAUNCH_KINDS[operation], input, ...(page ? { mount: surface } : {}) } as TaskLaunchRequest, () => null);
    await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')?.disabled).toBe(false));
    const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
    budget.value = '50000'; budget.dispatchEvent({ type: 'change', bubbles: true });
    miniDocument.querySelector('[data-task-drawer-control="launch"]')!.click();
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    await launch.mock.results[0]!.value;
    await capture.owner.whenIdle(); capture.assertMatched();
    expect(capture.wireRequests.length).toBeGreaterThan(0);
    return { input: launch.mock.calls[0]![0] as Record<string, unknown>, wire: capture.wireRequests[0] };
  } finally { drawer.close(false); await capture.owner.dispose(); governor.close(); await governor.whenIdle(); store.close(); uninstall(); }
}

it.each(Object.keys(LEDGER_TASK_LAUNCH_KINDS) as LedgerTaskLaunchOperation[])('%s sends the same ordinary-production request from the page and drawer', async operation => {
  const state = await seed(operation);
  try {
    const drawer = await captureStart(state, operation, false);
    const page = await captureStart(state, operation, true);
    expect(page.input).toEqual({ ...drawer.input, clientCommandId: page.input['clientCommandId'] });
    expect(page.input['clientCommandId']).not.toBe(drawer.input['clientCommandId']);
    expect(page.wire).toEqual(drawer.wire);
  } finally { await state.roots.dispose(); }
}, 60_000);

async function ordinaryRedo() {
  const state = await seed('launchBaselineAnalysis'), { roots, bookId } = state;
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot), governor = new ModelRequestGovernor();
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-happy');
  let hold = false;
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, request => {
    const answer = [...fixture.entries.values()].find(entry => entry.unitOrdinal === request.unitOrdinal && entry.response?.kind === 'unit-result')?.response;
    return answer?.kind === 'unit-result' ? { ...answer, usage: { inputTokens: 50000, outputTokens: 0 } } : undefined;
  }, { transportHold: async (_request, _message, signal) => { if (hold && !signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true })); } });
  const launched = commit(store, { operation: 'launchBaselineAnalysis', input: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, clientCommandId: randomUUID(),
    planEdits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50000 } } } }, bookId, capture.policy);
  driveLaunchedLedgerRun(capture.owner, launched); await capture.owner.whenIdle();
  expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: launched.taskIntentId }).state.key).toBe('budget-reached');
  hold = true;
  const uninstall = installMiniDom(); setTechnicalLayerVisible(false);
  const timers: Array<ReturnType<typeof setInterval>> = [];
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval: (callback: () => void, delay: number) => { const timer = setInterval(callback, delay); timers.push(timer); return timer; }, clearInterval, localStorage: { getItem: () => 'full', setItem: vi.fn() } });
  const api = {
    inspectTaskPlan: async (input: Parameters<RendererApi['inspectTaskPlan']>[0]) => store.inspectTaskPlan({ ...input, bookId }),
    prepareBaselineAnalysis: vi.fn(async (input: Parameters<RendererApi['prepareBaselineAnalysis']>[0]) => {
      let progress = store.createBaselineAnalysisPreparationWork(bookId, input.goal, input.update, capture.policy, input.reconfirm, input.redoOf);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      return { state: 'completed', result: progress.projection };
    }),
    editBaselineAnalysisPlan: vi.fn(async (input: Parameters<RendererApi['editBaselineAnalysisPlan']>[0]) => store.editBaselineAnalysisPlan({ ...input, bookId })),
    authorizeBaselineAnalysis: vi.fn(async (input: Parameters<RendererApi['authorizeBaselineAnalysis']>[0]) => {
      const result = store.authorizeBaselineAnalysis(bookId, input.taskIntentId, input.planEnvelopeDigest);
      if (result.dispatchRunRecordId !== null) capture.owner.admitAndDispatch(result.dispatchRunRecordId, result.ledger);
      return result.projection;
    }),
    cancelBaselineAnalysisRun: async (input: Parameters<RendererApi['cancelBaselineAnalysisRun']>[0]) => {
      const runRecordId = store.requestBaselineAnalysisCancel(bookId, input.taskIntentId);
      if (runRecordId !== null) capture.owner.cancelRun(runRecordId, store.executionLedgerForRun(runRecordId));
      await capture.owner.whenIdle(); return store.inspectAnalysisTask(bookId, input.taskIntentId);
    },
  };
  const root = document.createElement('aside'); document.body.append(root);
  const drawer = mountTaskDrawer({ root, shell: document.body, api, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(),
    errorCode: () => null, errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    awaitServiceJob: async (initial: unknown) => initial } as never);
  drawer.open({ bookId, kind: 'baseline-analysis', ref: launched.taskIntentId }, () => null);
  const close = async () => { drawer.close(false); timers.forEach(clearInterval); await capture.owner.dispose(); governor.close(); await governor.whenIdle(); capture.assertMatched(); store.close(); uninstall(); await roots.dispose(); };
  return { root, api, capture, bookId, close };
}

it('shows the ordinary baseline redo budget lock with its reason and starts with the retained budget', async () => {
  const view = await ordinaryRedo();
  const button = (name: string) => miniDocument.querySelector(`[data-task-drawer-control="${name}"]`);
  try {
    for (let iteration = 0; iteration < 2; iteration += 1) {
      await vi.waitFor(() => expect(button('redo')?.disabled).toBe(false)); button('redo')!.click();
      await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-launch-option="budget"]')).not.toBeNull());
      const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
      // #1526 / #1573: flip to editable/new-budget execution when the service projection companion fix joins this lane.
      expect(budget.disabled).toBe(true); expect(budget.value).toBe('50000');
      expect(view.root.querySelector('.task-launch-budget-reason')?.textContent).toContain('启动设置');
      expect(miniDocument.activeElement).not.toBe(budget); expect(button('start')!.disabled).toBe(false);
      const before = view.capture.wireRequests.length; button('start')!.click();
      await vi.waitFor(() => expect(view.capture.wireRequests.length).toBeGreaterThan(before));
      expect(view.api.editBaselineAnalysisPlan).not.toHaveBeenCalled();
      const input = view.api.authorizeBaselineAnalysis.mock.calls[iteration]![0];
      const frame = { id: randomUUID(), op: 'authorizeBaselineAnalysis', input: { ...input, bookId: view.bookId } };
      expect(decodeRequest(new TextEncoder().encode(JSON.stringify(frame)))).toEqual(frame);
      await vi.waitFor(() => expect(button('cancel-run')?.disabled).toBe(false));
      button('cancel-run')!.click(); button('confirm-cancel-run')!.click();
      await vi.waitFor(() => expect(button('redo')?.disabled).toBe(false));
    }

  } finally { await view.close(); }
}, 60_000);

it.each(Object.keys(LEDGER_TASK_LAUNCH_KINDS) as LedgerTaskLaunchOperation[])('%s exposes its actual ordinary redo budget capability', async operation => {
  const state = await seed(operation), { roots, bookId, input } = state;
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot), governor = new ModelRequestGovernor(), jobs = new CooperativeJobOwner(store);
  const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, () => undefined,
    { transportHold: async (_request, _message, signal) => { if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true })); } });
  try {
    const launch = { operation, input: { ...input, clientCommandId: randomUUID(), planEdits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50000 } } } } as TaskLaunchPreviewInput['launch'];
    const started = commit(store, launch, bookId, capture.policy); driveLaunchedLedgerRun(capture.owner, started);
    await vi.waitFor(() => expect(capture.wireRequests.length).toBeGreaterThan(0));
    const kind = operation === 'launchCustomAnalysis' ? 'baseline-analysis' : LEDGER_TASK_LAUNCH_KINDS[operation];
    const target = { bookId, kind, ref: started.taskIntentId };
    const cancel = kind === 'baseline-analysis' ? { runRecordId: store.requestBaselineAnalysisCancel(bookId, started.taskIntentId), ledger: started.ledger } : store.requestTaskRunControl({ ...target, kind, action: 'cancel' });
    capture.owner.cancelRun(cancel.runRecordId!, cancel.ledger); await capture.owner.whenIdle();
    const plan = store.inspectTaskPlan(target); expect(plan.redo).not.toBeNull();
    let ref: string;
    if (operation === 'launchCustomAnalysis') {
      ref = store.prepareCustomAnalysis({ bookId, dimensionId: plan.custom!.dimensionId, update: !('kind' in plan.redo!.prepare) ? plan.redo!.prepare.update : null, from: { taskIntentId: started.taskIntentId, purpose: 'redo' } }, capture.policy).taskIntentId;
    } else if (operation === 'launchBaselineAnalysis' && !('kind' in plan.redo!.prepare)) {
      const request = plan.redo!.prepare;
      let progress = store.createBaselineAnalysisPreparationWork(bookId, request.goal, request.update, capture.policy, false, request.redoOf);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      ref = progress.projection!.taskIntent!.taskIntentId;
    } else {
      if (kind === 'baseline-analysis') throw new Error('expected a ledger redo kind');
      let job = jobs.startTaskRedo({ ...target, kind }, capture.policy);
      await vi.waitFor(() => { if (!['completed', 'failed', 'cancelled'].includes(job.state)) job = jobs.poll(job.jobId); expect(job.state).toBe('completed'); });
      ref = store.inspectTaskPlan({ ...target, ref: null }).ref;
    }
    const redo = store.inspectTaskPlan({ ...target, ref });
    // #1526 / #1573: baseline and custom ordinary projections currently report the remote route as a budget lock.
    expect(redo.edit.budget?.settable).toBe(operation !== 'launchBaselineAnalysis' && operation !== 'launchCustomAnalysis');
    if (!redo.edit.budget?.settable) expect(redo.edit.budget?.reason).toContain('开发者实时启动参数');
  } finally { await jobs.dispose(); await capture.owner.dispose(); governor.close(); await governor.whenIdle(); capture.assertMatched(); store.close(); await roots.dispose(); }
}, 60_000);
