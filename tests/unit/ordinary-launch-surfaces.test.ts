import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, driveLaunchedLedgerRun, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { modelServiceChannels, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { mountTaskDrawer, type TaskLaunchRequest } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type TaskLaunchPreviewInput } from '../../src/shared/protocol.js';
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
    const input = operation === 'launchBaselineAnalysis' ? { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }
      : operation === 'launchCustomAnalysis' ? { dimensionId, update: null } : operation === 'launchWritingTask' ? WRITING_REQUEST
        : operation === 'launchReadersReport' ? { template: 'author' } : operation === 'launchEvaluationRewrite' ? { recordId } : {};
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
