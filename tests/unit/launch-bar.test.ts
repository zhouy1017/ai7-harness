import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountLaunchBar, type LaunchBar } from '../../src/renderer/components/launch-bar.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation } from '../../src/shared/runtime-execution-config.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { WRITING_REQUEST } from '../support/writing-task.js';

// The launch bar alone (Issue #1545): for each launch operation, the input it builds from the editor's choices — planEdits,
// startWhen, materialIds, seriesId, executionConfig, rememberedChoice — and a fresh clientCommandId after any change. The drawer
// that mounts it is covered by task-launch-bar.test.ts; #1526 keeps these tests when the choices move to pages and sheets.

let uninstall: () => void;
const mounted: LaunchBar[] = [];
beforeEach(() => { uninstall = installMiniDom(); vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null }); });
afterEach(() => { for (const bar of mounted.splice(0)) bar.dispose(); vi.unstubAllGlobals(); uninstall(); });

const OPERATIONS = Object.keys(LEDGER_TASK_LAUNCH_KINDS) as LedgerTaskLaunchOperation[];
const inputFor = (operation: LedgerTaskLaunchOperation) => operation === 'launchBaselineAnalysis' ? { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }
  : operation === 'launchCustomAnalysis' ? { dimensionId: 'dimension', update: null } : operation === 'launchWritingTask' ? WRITING_REQUEST
    : operation === 'launchReadersReport' ? { template: 'author' } : operation === 'launchEvaluationRewrite' ? { recordId: 'record' } : {};
const material = (materialId: string) => ({ materialId, title: `资料${materialId}`, characters: 10, scope: 'book', selectable: true, reason: null });

/** The renderer API one launch operation needs; `launch` is the member under test, `previewTaskLaunch` records the previewed input. */
function launchApi(operation: LedgerTaskLaunchOperation, options: { values?: Record<string, unknown>; page?: unknown; launch?: () => Promise<unknown> } = {}) {
  const launch = vi.fn(async (_input: unknown): Promise<unknown> => options.launch?.() ?? { taskIntentId: 'task', runRecordId: 'run' });
  const previewTaskLaunch = vi.fn(async (_input: { launch: { operation: string; input: { clientCommandId: string } } }) =>
    ({ steps: [], scope: '', units: 0, reference: [], send: '', usage: '', adaptations: [] }));
  const page = options.page ?? { bookId: 'book', materials: { items: [], more: 0 }, market: { series: [] } };
  const api = { [operation]: launch, previewTaskLaunch, inspectEvaluation: async () => page,
    getPreferences: async () => ({ version: 1, values: { ...preferenceDefaults(), ...options.values }, notice: null }),
    getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }) };
  return { api, launch, previewTaskLaunch };
}

async function mount(api: unknown, request: unknown) {
  const callbacks = { errorMessage: (_error: unknown, fallback: string) => fallback, setStatus: vi.fn(), settle: async () => true, onRecorded: vi.fn(), openRun: vi.fn() };
  const bar = mountLaunchBar({ api: api as never, request: request as never, ...callbacks, interrupted: false });
  mounted.push(bar);
  document.body.append(...bar.body, ...bar.bar);
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')!.disabled).toBe(false));
  return { bar, ...callbacks };
}

function choose(selector: string, value: string, type: 'input' | 'change'): void {
  const node = miniDocument.querySelector(selector)!;
  node.value = value;
  node.dispatchEvent({ type, bubbles: true });
}

function tick(materialId: string): void {
  const node = miniDocument.querySelector(`[data-evaluation-material="${materialId}"]`)!;
  node.checked = true;
  node.dispatchEvent({ type: 'change', bubbles: true });
}

it.each(OPERATIONS)('builds the %s input from the run options and the remembered choice, with a fresh clientCommandId after a change', async operation => {
  const kind = LEDGER_TASK_LAUNCH_KINDS[operation];
  const remembered = { modelConnectionId: 'connection', modelId: 'model', reasoningEffort: 'high' };
  const { api, launch, previewTaskLaunch } = launchApi(operation, { values: { 'model.dispatchChoices': { [kind]: remembered } } });
  const onStarted = vi.fn();
  const { bar, onRecorded, openRun, setStatus } = await mount(api, { operation, bookId: 'book', title: kind, input: inputFor(operation), onStarted });

  await bar.openPlan();
  const previewed = previewTaskLaunch.mock.calls[0]![0].launch;
  expect(previewed.operation).toBe(operation);
  choose('[data-task-launch-option="budget"]', '50000', 'change');
  choose('[data-task-launch-option="retry"]', 'never', 'change');
  choose('[data-task-start-when]', 'idle', 'change');
  await bar.openPlan();
  const latest = previewTaskLaunch.mock.calls[1]![0].launch.input.clientCommandId;
  expect(latest).not.toBe(previewed.input.clientCommandId);

  await bar.start();
  expect(launch).toHaveBeenCalledOnce();
  expect(launch.mock.calls[0]![0]).toEqual({
    ...inputFor(operation), executionConfig: remembered, rememberedChoice: true, startWhen: 'idle', clientCommandId: latest,
    planEdits: { removedSteps: [], disallowedAdaptations: ['safe-retry'], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 50_000 } },
  });
  // A custom analysis is read as a baseline-analysis Task; every other launch is read as its own kind.
  const planKind = operation === 'launchCustomAnalysis' ? 'baseline-analysis' : kind;
  expect(onStarted).toHaveBeenCalledOnce();
  expect(onRecorded).toHaveBeenCalledWith(planKind, 'book', 'task');
  expect(setStatus).toHaveBeenCalledWith('已开始任务', 'success');
  expect(openRun).toHaveBeenCalledWith('book', planKind, 'task', undefined);
});

it('reads the ticked materials and the series into the initial-evaluation input', async () => {
  const page = { bookId: 'book', materials: { items: [material('a'), material('b')], more: 0 }, market: { series: [{ seriesId: 'series-1', title: '书系一' }] } };
  const { api, launch } = launchApi('launchInitialEvaluation', { page });
  const { bar } = await mount(api, { operation: 'launchInitialEvaluation', bookId: 'book', title: '初评', input: {} });
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-evaluation-material="a"]')).not.toBeNull());
  tick('a');
  choose('[aria-label="本次任务的书系参考"]', 'series-1', 'change');
  await bar.start();
  expect(launch.mock.calls[0]![0]).toMatchObject({ materialIds: ['a'], seriesId: 'series-1', rememberedChoice: false, executionConfig: {} });
});

it('reads the ticked materials into the readers-report input, which has no series choice', async () => {
  const page = { bookId: 'book', materials: { items: [material('a')], more: 0 }, market: { series: [{ seriesId: 'series-1', title: '书系一' }] } };
  const { api, launch } = launchApi('launchReadersReport', { page });
  const { bar } = await mount(api, { operation: 'launchReadersReport', bookId: 'book', title: '审稿意见', input: { template: 'author' } });
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-evaluation-material="a"]')).not.toBeNull());
  tick('a');
  expect(miniDocument.querySelector('[aria-label="本次任务的书系参考"]')).toBeNull();
  await bar.start();
  expect(launch.mock.calls[0]![0]).toMatchObject({ template: 'author', materialIds: ['a'] });
});

it('records a start that finishes after the bar left the screen but does not open its running view', async () => {
  let finish: (result: unknown) => void = () => undefined;
  const { api, launch } = launchApi('launchBaselineAnalysis', { launch: () => new Promise(resolve => { finish = resolve; }) });
  const { bar, onRecorded, openRun, setStatus } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  const started = bar.start();
  await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
  bar.dispose();
  finish({ taskIntentId: 'task', runRecordId: 'run' });
  await started;
  expect(onRecorded).toHaveBeenCalledWith('baseline-analysis', 'book', 'task');
  expect(setStatus).toHaveBeenCalledWith('已开始任务', 'success');
  expect(openRun).not.toHaveBeenCalled();
});
