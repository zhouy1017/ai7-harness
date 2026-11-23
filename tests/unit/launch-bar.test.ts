import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLaunchBarPresentation, mountLaunchBar, type LaunchBar } from '../../src/renderer/components/launch-bar.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation } from '../../src/shared/runtime-execution-config.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { MODEL_SERVICE_CONNECTION_IDS } from '../../src/shared/protocol/model-service.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
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
function launchApi(operation: LedgerTaskLaunchOperation, options: { values?: Record<string, unknown>; page?: unknown; settings?: unknown; launch?: () => Promise<unknown> } = {}) {
  const launch = vi.fn(async (_input: unknown): Promise<unknown> => options.launch?.() ?? { taskIntentId: 'task', runRecordId: 'run' });
  const previewTaskLaunch = vi.fn(async (_input: { launch: { operation: string; input: { clientCommandId: string } } }) =>
    ({ steps: [], scope: '', units: 0, reference: [], send: '', usage: '', adaptations: [] }));
  const page = options.page ?? { bookId: 'book', materials: { items: [], more: 0 }, market: { series: [] } };
  const api = { [operation]: launch, previewTaskLaunch, inspectEvaluation: async () => page,
    getPreferences: async () => ({ version: 1, values: { ...preferenceDefaults(), ...options.values }, notice: null }),
    getModelServiceSettings: async () => options.settings ?? { channels: [], roles: [], routeChoice: { routes: [] } } };
  /** Read the plan again and answer the clientCommandId it was previewed with. */
  const planId = async (bar: LaunchBar): Promise<string> => {
    const before = previewTaskLaunch.mock.calls.length;
    await bar.openPlan();
    expect(previewTaskLaunch.mock.calls).toHaveLength(before + 1);
    return previewTaskLaunch.mock.calls[before]![0].launch.input.clientCommandId;
  };
  return { api, launch, previewTaskLaunch, planId };
}

async function mount(api: unknown, request: unknown) {
  const callbacks = { errorMessage: (_error: unknown, fallback: string) => fallback, setStatus: vi.fn(), settle: async () => true, onRecorded: vi.fn(), openRun: vi.fn(), openSettings: vi.fn() };
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

function toggle(selector: string, checked: boolean): void {
  const node = miniDocument.querySelector(selector)!;
  node.checked = checked;
  node.dispatchEvent({ type: 'change', bubbles: true });
}

function tick(materialId: string): void {
  const node = miniDocument.querySelector(`[data-evaluation-material="${materialId}"]`)!;
  node.checked = true;
  node.dispatchEvent({ type: 'change', bubbles: true });
}

it.each([false, true])('shows the service estimate before launching, keeping tokens only in developer mode (%s)', async developer => {
  setTechnicalLayerVisible(developer);
  try {
    const { api, launch } = launchApi('launchWritingTask');
    const sentence = '预计读 12 个部分，至少 13 次模型调用（重试时会更多）；按最近同类任务，约 6 分钟。';
    const previewTaskLaunch = vi.fn(async () => ({ steps: [], scope: '', units: 12, reference: [], send: '', usage: '上限 50000 tokens', adaptations: [],
      estimate: { parts: 12, fewestRequests: 13, more: ['retry'], ceiling: true, durationMs: 360000, sentence } }));
    const { bar } = await mount({ ...api, previewTaskLaunch }, { bookId: 'book', operation: 'launchWritingTask', title: '写作', input: WRITING_REQUEST });
    await bar.openPlan();
    expect(miniDocument.querySelector('.task-launch-estimate-sentence')?.textContent).toBe(sentence);
    expect(miniDocument.querySelector('.task-launch-estimate')?.textContent.includes('50000 tokens')).toBe(developer);
    expect(launch).not.toHaveBeenCalled();
  } finally { setTechnicalLayerVisible(true); }
});

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

it.each(['interrupt', 'dispose'] as const)('records a start that finishes after %s but does not open its running view', async how => {
  let finish: (result: unknown) => void = () => undefined;
  const { api, launch } = launchApi('launchBaselineAnalysis', { launch: () => new Promise(resolve => { finish = resolve; }) });
  const { bar, onRecorded, openRun, setStatus } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  const started = bar.start();
  await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
  bar[how]();
  finish({ taskIntentId: 'task', runRecordId: 'run' });
  await started;
  expect(onRecorded).toHaveBeenCalledWith('baseline-analysis', 'book', 'task');
  expect(setStatus).toHaveBeenCalledWith('已开始任务', 'success');
  expect(openRun).not.toHaveBeenCalled();
});

// An interrupted launch view stays on screen with its options editable, so its plan shown still goes stale; a view that left does not.
it.each([['interrupt', true], ['dispose', false]] as const)('after %s a changed option marks the plan shown stale: %s', async (how, stale) => {
  const { api, planId } = launchApi('launchBaselineAnalysis');
  const { bar } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  await planId(bar);
  expect(miniDocument.querySelector('.task-launch-preview-stale')).toBeNull();
  bar[how]();
  choose('[data-task-launch-option="budget"]', '500', 'input');
  expect(miniDocument.querySelector('.task-launch-preview-stale') !== null).toBe(stale);
});

const optionsPage = { bookId: 'book', materials: { items: [material('a')], more: 0 }, market: { series: [{ seriesId: 'series-1', title: '书系一' }] } };
const FRESH_ID_AFTER: Array<[string, LedgerTaskLaunchOperation, unknown, string | null, (live: { input: object }) => void]> = [
  ['the budget', 'launchBaselineAnalysis', undefined, null, () => choose('[data-task-launch-option="budget"]', '999', 'input')],
  ['the retry choice', 'launchBaselineAnalysis', undefined, null, () => choose('[data-task-launch-option="retry"]', 'ask-first', 'change')],
  ['the sampling choice', 'launchBaselineAnalysis', undefined, null, () => toggle('[data-task-launch-option="sampling"]', false)],
  ['the start time', 'launchBaselineAnalysis', undefined, null, () => choose('[data-task-start-when]', 'when-online', 'change')],
  ['a ticked material', 'launchReadersReport', optionsPage, '[data-evaluation-material="a"]', () => tick('a')],
  ['the series', 'launchInitialEvaluation', optionsPage, '[aria-label="本次任务的书系参考"]', () => choose('[aria-label="本次任务的书系参考"]', 'series-1', 'change')],
  ["the writing form's live input", 'launchWritingTask', undefined, null, live => { live.input = { ...live.input, audience: '另一类读者' }; }],
];
it.each(FRESH_ID_AFTER)('gives a fresh clientCommandId after a change of %s, and only then', async (_name, operation, page, ready, change) => {
  const { api, planId } = launchApi(operation, { page });
  const live = { input: inputFor(operation) as object };
  // Only the writing form reads its fields live; the other launches hold their input.
  const { bar } = await mount(api, { operation, bookId: 'book', title: '任务', input: inputFor(operation), ...(operation === 'launchWritingTask' ? { readInput: () => live.input } : {}) });
  if (ready !== null) await vi.waitFor(() => expect(miniDocument.querySelector(ready)).not.toBeNull());
  const first = await planId(bar);
  expect(await planId(bar)).toBe(first);
  change(live);
  expect(await planId(bar)).not.toBe(first);
});

it('gives a fresh clientCommandId after the chooser changes the model, and no longer sends the remembered choice', async () => {
  const channel = modelServiceChannels().find(channel => channel.route === 'opencode-go')!;
  const connection = { connectionId: MODEL_SERVICE_CONNECTION_IDS['opencode-go'], credentialOperationState: 'ready' };
  const settings = { channels: modelServiceChannels(), roles: [{ roleId: 'main-editorial', connection, binding: { modelId: channel.models[0]!.modelId } }],
    routeChoice: { routes: [{ route: 'opencode-go', connection }] } };
  const remembered = { modelConnectionId: connection.connectionId, modelId: channel.models[0]!.modelId };
  const { api, launch, planId } = launchApi('launchBaselineAnalysis', { settings, values: { 'model.dispatchChoices': { 'baseline-analysis': remembered } } });
  const { bar } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  const first = await planId(bar);
  choose('[aria-label="本次任务的模型"]', '0', 'change');
  const second = await planId(bar);
  expect(second).not.toBe(first);
  await bar.start();
  expect(launch.mock.calls[0]![0]).toMatchObject({ clientCommandId: second, rememberedChoice: false, executionConfig: remembered });
});

it('reads the baseline-only options 先问我, no sampling and 联网后开始 into the launch input, and shows them again when opened with them', async () => {
  const { api, launch } = launchApi('launchBaselineAnalysis');
  const { bar } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  choose('[data-task-launch-option="retry"]', 'ask-first', 'change');
  toggle('[data-task-launch-option="sampling"]', false);
  choose('[data-task-start-when]', 'when-online', 'change');
  await bar.start();
  const planEdits = { removedSteps: ['assurance-sampling'], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] };
  const sent = launch.mock.calls[0]![0] as { planEdits: unknown; startWhen: string };
  expect(sent.planEdits).toEqual(planEdits);
  expect(sent.startWhen).toBe('when-online');

  // The same choices, already in the input the launch is opened with, are what the controls show.
  document.body.replaceChildren();
  const seeded = launchApi('launchBaselineAnalysis');
  await mount(seeded.api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析',
    input: { ...inputFor('launchBaselineAnalysis'), planEdits: { ...planEdits, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500 } }, startWhen: 'when-online' } });
  expect(miniDocument.querySelector('[data-task-launch-option="retry"]')!.value).toBe('ask-first');
  expect(miniDocument.querySelector('[data-task-launch-option="sampling"]')!.checked).toBe(false);
  expect(miniDocument.querySelector('[data-task-launch-option="budget"]')!.value).toBe('500');
  expect(miniDocument.querySelector('[data-task-start-when]')!.value).toBe('when-online');
});

it('keeps 去设置 available beside a missing model after a refused start', async () => {
  const { api } = launchApi('launchBaselineAnalysis', { launch: async () => { throw new Error('missing model'); } });
  const { bar, openSettings } = await mount(api, { operation: 'launchBaselineAnalysis', bookId: 'book', title: '分析', input: inputFor('launchBaselineAnalysis') });
  await bar.start();
  const settings = miniDocument.querySelector('[data-task-drawer-control="launch-settings"]')!;
  expect(settings.hidden).toBe(false); settings.click();
  expect(openSettings).toHaveBeenCalledOnce();
  expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')!.disabled).toBe(false);
});

it('offers the ordinary 本次用量 as the four shared tiers, keeps a custom ceiling as 上次上限, and marks a change on 选项', async () => {
  setTechnicalLayerVisible(false);
  try {
    const { api, launch } = launchApi('launchWritingTask');
    const { bar } = await mount(api, { operation: 'launchWritingTask', bookId: 'book', title: '写作',
      input: { ...WRITING_REQUEST, planEdits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 75_000 } } } });
    const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
    expect(budget.querySelectorAll('option').map(option => [option.value, option.textContent])).toEqual([
      ['50000', '较少'], ['100000', '标准（推荐）'], ['200000', '较多'], ['', '不设上限'], ['75000', '上次上限']]);
    expect(budget.value).toBe('75000');
    const summary = miniDocument.querySelector('.task-launch-options summary')!;
    expect(summary.textContent).toBe('选项');
    choose('[data-task-launch-option="budget"]', '50000', 'change');
    expect(summary.textContent).toBe('选项 · 已调整');
    choose('[data-task-launch-option="budget"]', '75000', 'change');
    expect(summary.textContent).toBe('选项');
    choose('[data-task-launch-option="budget"]', '', 'change');
    await bar.start();
    expect(launch.mock.calls[0]![0]).toMatchObject({ planEdits: { removedSteps: [], disallowedAdaptations: [] } });
    expect((launch.mock.calls[0]![0] as { planEdits: Record<string, unknown> }).planEdits).not.toHaveProperty('runBudgetCeiling');
  } finally { setTechnicalLayerVisible(true); }
});

it('reads no plan and offers no start while the surface says it cannot start, and both again once it can', async () => {
  const { api, previewTaskLaunch } = launchApi('launchWritingTask');
  const request = { operation: 'launchWritingTask', bookId: 'book', title: '写作', input: WRITING_REQUEST, startDisabled: true };
  const bar = mountLaunchBar({ api: api as never, request: request as never, errorMessage: (_error: unknown, fallback: string) => fallback, setStatus: vi.fn(),
    settle: async () => true, onRecorded: vi.fn(), openRun: vi.fn(), interrupted: false });
  mounted.push(bar); document.body.append(...bar.body, ...bar.bar);
  await new Promise(resolve => setTimeout(resolve, 0));
  await bar.openPlan();
  expect(previewTaskLaunch).not.toHaveBeenCalled();
  expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')!.disabled).toBe(true);
  request.startDisabled = false; bar.sync();
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')!.disabled).toBe(false));
  await bar.openPlan();
  expect(previewTaskLaunch).toHaveBeenCalledOnce();
});

it('closes a launch popover when focus arrives on another control, also after a press rested focus on the sheet', () => {
  const sheet = document.createElement('dialog'); sheet.tabIndex = -1; document.body.append(sheet);
  const options = document.createElement('div'); const inside = document.createElement('select'); options.append(inside);
  const start = document.createElement('button');
  const bar = createLaunchBarPresentation(document.createElement('span'), start, { title: '选项', content: options }, null);
  sheet.append(bar);
  const details = bar.querySelector<HTMLDetailsElement>('.task-launch-options')!;
  const focusOn = (target: HTMLElement) => target.dispatchEvent({ type: 'focusin', bubbles: true } as never);
  details.open = true; details.dispatchEvent({ type: 'toggle' } as never);
  focusOn(inside);
  expect(details.open).toBe(true);
  // A press on the panel's text focuses the sheet around it: still open.
  focusOn(sheet);
  expect(details.open).toBe(true);
  // Tab from there on to the bar's start: closed.
  focusOn(start);
  expect(details.open).toBe(false);
});

it('keeps a launch popover open while focus leaves the window, and closes it when focus comes back on another control', () => {
  const options = document.createElement('div'); options.append(document.createElement('select'));
  const start = document.createElement('button');
  const bar = createLaunchBarPresentation(document.createElement('span'), start, { title: '选项', content: options }, null);
  document.body.append(bar);
  const details = bar.querySelector<HTMLDetailsElement>('.task-launch-options')!;
  details.open = true; details.dispatchEvent({ type: 'toggle' } as never);
  details.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: null } as never);
  expect(details.open).toBe(true);
  start.dispatchEvent({ type: 'focusin', bubbles: true } as never);
  expect(details.open).toBe(false);
});

it('places a launch popover above or below its whole bar, so a wrapped bar keeps 选项 reachable under an open plan (#1526 follow-up)', () => {
  // J-04 at 1280×800 with the Task Drawer docked beside the page: the update controls' bar is 447.8 px wide and wraps — 模型 · 选项 ·
  // 开始 on the first row from 382.3 px, 先看计划 alone on the second down to 470.6 px. The plan panel is 520 × 367.5 px.
  vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800);
  Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const shown = new Set<unknown>();
  const proto = Object.getPrototypeOf(document.createElement('div')) as Record<string, unknown>;
  const own = Object.getOwnPropertyDescriptor(proto, 'matches')!;
  Object.defineProperty(proto, 'showPopover', { configurable: true, value(this: unknown) { shown.add(this); } });
  Object.defineProperty(proto, 'hidePopover', { configurable: true, value(this: unknown) { shown.delete(this); } });
  Object.defineProperty(proto, 'matches', { configurable: true, value(this: unknown, selector: string) {
    return selector === ':popover-open' ? shown.has(this) : (own.value as (s: string) => boolean).call(this, selector); } });
  try {
    const bar = createLaunchBarPresentation(document.createElement('span'), document.createElement('button'),
      { title: '选项', content: document.createElement('div') }, document.createElement('div'));
    document.body.append(bar);
    const box = (left: number, top: number, width: number, height: number) => ({ top, bottom: top + height, left, right: left + width, width, height });
    const plan = bar.querySelector<HTMLDetailsElement>('.task-launch-estimate')!;
    const panel = plan.querySelector<HTMLElement>('.task-launch-popover')!;
    const options = box(470.2, 382.3, 58.8, 35.2);
    Object.assign(bar, { getBoundingClientRect: () => box(270.6, 382.3, 447.8, 88.3) });
    Object.assign(bar.querySelector('.task-launch-options summary')!, { getBoundingClientRect: () => options });
    Object.assign(plan.querySelector('summary')!, { getBoundingClientRect: () => box(270.6, 423.9, 112.8, 46.8) });
    Object.assign(panel, { getBoundingClientRect: () => {
      const style = panel.style as unknown as Record<string, string>;
      const height = Math.min(367.5, Number.parseFloat(style['maxHeight'] || '367.5'));
      return box(Number.parseFloat(style['left'] || '0'), Number.parseFloat(style['top'] || '0'), 520, height);
    } });
    plan.open = true; plan.dispatchEvent({ type: 'toggle' } as never);
    const placed = panel.getBoundingClientRect();
    expect(shown.has(panel)).toBe(true);
    // Above the whole bar (there is room for all of it there): neither row is under it, so 选项 stays pressable.
    expect(placed.bottom).toBeLessThanOrEqual(382.3);
    expect(placed.bottom <= options.top || placed.top >= options.bottom).toBe(true);
    expect(placed.height).toBe(367.5);
    expect(placed.left).toBe(270.6);
  } finally {
    Object.defineProperty(proto, 'matches', own);
    Reflect.deleteProperty(proto, 'showPopover'); Reflect.deleteProperty(proto, 'hidePopover');
  }
});

it('keeps an open launch popover by its summary when a transition of the page moves the summary (#1526 follow-up)', () => {
  // Narrowing a window with the Task Drawer docked: the page's padding transition moves 选项 after the resize event, from 3713 px to
  // 323 px; the open options panel follows it when that transition ends, instead of staying where it was placed mid-way.
  vi.stubGlobal('innerWidth', 1008); vi.stubGlobal('innerHeight', 681);
  Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const shown = new Set<unknown>();
  const proto = Object.getPrototypeOf(document.createElement('div')) as Record<string, unknown>;
  const own = Object.getOwnPropertyDescriptor(proto, 'matches')!;
  Object.defineProperty(proto, 'showPopover', { configurable: true, value(this: unknown) { shown.add(this); } });
  Object.defineProperty(proto, 'hidePopover', { configurable: true, value(this: unknown) { shown.delete(this); } });
  Object.defineProperty(proto, 'matches', { configurable: true, value(this: unknown, selector: string) {
    return selector === ':popover-open' ? shown.has(this) : (own.value as (s: string) => boolean).call(this, selector); } });
  try {
    const bar = createLaunchBarPresentation(document.createElement('span'), document.createElement('button'),
      { title: '选项', content: document.createElement('div') }, null);
    document.body.append(bar);
    const box = (left: number, top: number, width: number, height: number) => ({ top, bottom: top + height, left, right: left + width, width, height });
    let barTop = 3713;
    const options = bar.querySelector<HTMLDetailsElement>('.task-launch-options')!;
    const panel = options.querySelector<HTMLElement>('.task-launch-popover')!;
    Object.assign(bar, { getBoundingClientRect: () => box(270, barTop, 400, 35) });
    Object.assign(options.querySelector('summary')!, { getBoundingClientRect: () => box(470, barTop, 59, 35) });
    Object.assign(panel, { getBoundingClientRect: () => {
      const style = panel.style as unknown as Record<string, string>;
      return box(Number.parseFloat(style['left'] || '0'), Number.parseFloat(style['top'] || '0'), 320, Math.min(200, Number.parseFloat(style['maxHeight'] || '200')));
    } });
    options.open = true; options.dispatchEvent({ type: 'toggle' } as never);
    expect(panel.getBoundingClientRect().top).toBeGreaterThan(681);
    barTop = 323;
    document.body.dispatchEvent({ type: 'transitionend', bubbles: true } as never);
    const placed = panel.getBoundingClientRect();
    expect(placed.top).toBe(323 + 35 + 4);
    expect(placed.bottom).toBeLessThanOrEqual(681);
  } finally {
    Object.defineProperty(proto, 'matches', own);
    Reflect.deleteProperty(proto, 'showPopover'); Reflect.deleteProperty(proto, 'hidePopover');
  }
});

/** Native popovers and window events for one test, with a bar of one row at `barTop` and a panel 500 px tall. */
function popoverBar(barTop: number) {
  vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800);
  const listeners = new Map<string, () => void>();
  Object.assign(window, { addEventListener: vi.fn((type: string, listener: () => void) => { listeners.set(type, listener); }),
    removeEventListener: vi.fn((type: string, listener: () => void) => { if (listeners.get(type) === listener) listeners.delete(type); }) });
  const shown = new Set<unknown>();
  const proto = Object.getPrototypeOf(document.createElement('div')) as Record<string, unknown>;
  const own = Object.getOwnPropertyDescriptor(proto, 'matches')!;
  Object.defineProperty(proto, 'showPopover', { configurable: true, value(this: unknown) { shown.add(this); } });
  Object.defineProperty(proto, 'hidePopover', { configurable: true, value(this: unknown) { shown.delete(this); } });
  Object.defineProperty(proto, 'matches', { configurable: true, value(this: unknown, selector: string) {
    return selector === ':popover-open' ? shown.has(this) : (own.value as (s: string) => boolean).call(this, selector); } });
  const bar = createLaunchBarPresentation(document.createElement('span'), document.createElement('button'), null, document.createElement('div'));
  document.body.append(bar);
  const box = (left: number, top: number, width: number, height: number) => ({ top, bottom: top + height, left, right: left + width, width, height });
  const plan = bar.querySelector<HTMLDetailsElement>('.task-launch-estimate')!;
  const panel = plan.querySelector<HTMLElement>('.task-launch-popover')!;
  const style = panel.style as unknown as Record<string, string>;
  Object.assign(bar, { getBoundingClientRect: () => box(270, barTop, 400, 35) });
  Object.assign(plan.querySelector('summary')!, { getBoundingClientRect: () => box(470, barTop, 112, 35) });
  // As an engine lays it out: an unbounded panel shows all of itself, and reading its layout then puts its own scroll back to 0.
  let scroll = 0;
  Object.defineProperty(panel, 'scrollTop', { configurable: true, get: () => scroll, set: (value: number) => {
    scroll = style['maxHeight'] ? Math.max(0, Math.min(value, 500 - Number.parseFloat(style['maxHeight']))) : 0; } });
  Object.assign(panel, { getBoundingClientRect: () => {
    if (!style['maxHeight']) scroll = 0;
    return box(Number.parseFloat(style['left'] || '0'), Number.parseFloat(style['top'] || '0'), 520, Math.min(500, Number.parseFloat(style['maxHeight'] || '500')));
  } });
  const restore = (): void => { Object.defineProperty(proto, 'matches', own); Reflect.deleteProperty(proto, 'showPopover'); Reflect.deleteProperty(proto, 'hidePopover'); };
  return { bar, plan, panel, listeners, restore };
}

it('keeps the editor\'s place in a bounded launch popover when it is placed again (#1526 follow-up)', () => {
  const { plan, panel, listeners, restore } = popoverBar(382);
  try {
    plan.open = true; plan.dispatchEvent({ type: 'toggle' } as never);
    // 371 px of room below the bar (370 above) for a 500 px plan: bounded, its content scrolls. The editor scrolls to its end (更新计划).
    expect((panel.style as unknown as Record<string, string>)['maxHeight']).toBe('371px');
    panel.scrollTop = 129;
    expect(panel.scrollTop).toBe(129);
    // Its own scroll reaches the page's captured scroll listener, then a transition of the page ends, then the window resizes.
    document.body.dispatchEvent({ type: 'scroll', bubbles: true } as never);
    expect(panel.scrollTop).toBe(129);
    document.body.dispatchEvent({ type: 'transitionend', bubbles: true } as never);
    expect(panel.scrollTop).toBe(129);
    listeners.get('resize')!();
    expect(panel.scrollTop).toBe(129);
  } finally { restore(); }
});

it('lets go of the page once a launch popover is removed while it is open (#1526 follow-up)', () => {
  const { bar, plan, listeners, restore } = popoverBar(382);
  try {
    plan.open = true; plan.dispatchEvent({ type: 'toggle' } as never);
    expect(listeners.has('resize')).toBe(true);
    // The bar is drawn anew or disposed with its panel open: no toggle event comes; the next page event finds it detached.
    bar.remove();
    document.body.dispatchEvent({ type: 'scroll', bubbles: true } as never);
    expect(listeners.has('resize')).toBe(false);
  } finally { restore(); }
});


it.each(['button', 'programmatic'] as const)('keeps a later %s opening when the previous native panel close arrives late (#1711)', opening => {
  let flushOpenAttribute = (_wasOpen: boolean) => {};
  vi.stubGlobal('MutationObserver', class {
    constructor(changed: (records: Array<{ oldValue: string | null }>) => void) { flushOpenAttribute = wasOpen => changed([{ oldValue: wasOpen ? '' : null }]); }
    observe(): void {}
    disconnect(): void {}
  });
  const { plan, panel, restore } = popoverBar(382);
  const button = plan.querySelector<HTMLButtonElement>('summary button')!;
  const setOpen = (value: boolean): void => {
    const wasOpen = plan.open;
    if (opening === 'button') button.click(); else plan.open = value;
    // Native attribute mutation delivery precedes the queued toggle task, as in the captured browser sequence.
    flushOpenAttribute(wasOpen);
  };
  const panelClosing = (): void => {
    panel.dispatchEvent({ type: 'beforetoggle', oldState: 'open', newState: 'closed' } as never);
    panel.hidePopover();
  };
  const closedEvent = (): void => { panel.dispatchEvent({ type: 'toggle', oldState: 'open', newState: 'closed' } as never); };
  try {
    setOpen(true); plan.dispatchEvent({ type: 'toggle' } as never);
    panelClosing();
    setOpen(false);
    setOpen(true);
    // The old close is delivered after the latest opening, before that opening's own toggle work.
    closedEvent();
    expect(plan.open).toBe(true);
    plan.dispatchEvent({ type: 'toggle' } as never);
    expect(panel.matches(':popover-open')).toBe(true);
    // Normal closing still closes both controls.
    setOpen(false); panelClosing(); plan.dispatchEvent({ type: 'toggle' } as never); closedEvent();
    expect(plan.open).toBe(false); expect(panel.matches(':popover-open')).toBe(false);
    // A new external close after an opening remains authoritative.
    setOpen(true); plan.dispatchEvent({ type: 'toggle' } as never);
    panelClosing(); closedEvent();
    expect(plan.open).toBe(false);
    // Another automatic popover closes this panel in the same task, before a redundant open write is delivered.
    setOpen(true); plan.dispatchEvent({ type: 'toggle' } as never);
    plan.open = true; panelClosing(); flushOpenAttribute(true); closedEvent();
    expect(plan.open).toBe(false);
  } finally { restore(); }
});
