import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
import { createBaselineAnalysisCard } from '../../src/renderer/baseline-analysis-card.js';
import { mountTaskDrawer } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisWireProjection } from '../../src/shared/protocol.js';
import type { TaskLaunchRequest } from '../../src/renderer/task-drawer.js';
import { longPreparedAnalysis, longSettledAnalysis } from '../support/long-baseline-analysis.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

vi.mock('../../src/renderer/task-panel.js', () => ({ mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }), mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

// 更新这份分析 (#1526 review): the bar's start names the mode it will run, and the pressed mode button is that mode — after a
// mode button and after a range pick alike.
it('names the chosen update mode on the start and keeps the pressed button on it, by button and by range', async () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  const controls = projection.updateControls!;
  for (const mode of ['sync-current', 'reanalyze-range', 'reanalyze-book'] as const) Object.assign(controls.actions[mode], { available: true, unavailableReason: null });
  const option = controls.actions['reanalyze-range'].options[0]!;
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() }, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }),
    getBaselineAnalysisRangePlan: vi.fn(async () => ({ selectedRange: { startPosition: option.startPosition, endPosition: option.endPosition }, expected: { reused: 1, recomputed: 1, invalidated: 0, bypassed: 0 } })),
  } });
  const drawerRoot = document.createElement('aside'); document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: () => document.createElement('details'), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    setStatus: vi.fn(), taskDrawer: drawer, taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  const launch = () => root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')!;
  const pressed = () => root.querySelectorAll('.analysis-update-action [aria-pressed="true"]').map(node => node.dataset['analysisAction']);
  await vi.waitFor(() => expect(launch()).not.toBeNull());
  expect([launch().textContent, pressed()]).toEqual(['开始同步', ['sync-current']]);
  root.querySelector('.analysis-update-action [data-analysis-action="reanalyze-book"]')!.click();
  expect([launch().textContent, pressed()]).toEqual(['开始全部重来', ['reanalyze-book']]);
  const radio = root.querySelector('.analysis-range-option input')!;
  radio.checked = true; radio.dispatchEvent({ type: 'change', bubbles: true });
  expect([launch().textContent, pressed()]).toEqual(['开始重新分析', ['reanalyze-range']]);
  root.querySelector('.analysis-update-action [data-analysis-action="sync-current"]')!.click();
  expect([launch().textContent, pressed()]).toEqual(['开始同步', ['sync-current']]);
});

// A Task prepared and not yet started keeps 0.7.2's path (#1526, J-04 legacy plan): the mode's button prepares it again with the
// mode chosen and opens its plan; on any other card it only chooses the mode.
it.each([['prepared', 1], ['settled', 0]] as const)('a %s card prepares again from the mode button %i time(s)', async (state, calls) => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  Object.assign(projection, { state });
  for (const mode of ['sync-current', 'reanalyze-range', 'reanalyze-book'] as const) Object.assign(projection.updateControls!.actions[mode], { available: true, unavailableReason: null });
  const prepareBaselineAnalysis = vi.fn(() => new Promise(() => undefined));
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() }, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }), prepareBaselineAnalysis,
  } });
  const drawerRoot = document.createElement('aside'); document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: () => document.createElement('details'), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    setStatus: vi.fn(), taskDrawer: drawer, taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  const barButtons = () => root.querySelectorAll('[data-task-launch-kind="baseline-analysis"] button');
  await vi.waitFor(() => expect(root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')?.disabled).toBe(false));
  root.querySelector('.analysis-update-action [data-analysis-action="reanalyze-book"]')!.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(prepareBaselineAnalysis).toHaveBeenCalledTimes(calls);
  if (calls > 0) {
    expect(prepareBaselineAnalysis).toHaveBeenCalledWith(expect.objectContaining({ update: { mode: 'reanalyze-book', selectedRange: null }, reconfirm: false }));
    // While it prepares, every start on the card waits, the bar's own included (0.7.2 held them all).
    expect(barButtons().length).toBeGreaterThan(0);
    expect(root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')!.disabled).toBe(true);
  } else {
    // An ordinary card only chooses the mode: nothing is prepared and no drawer opens.
    expect(drawer.isOpen()).toBe(false);
  }
});

it("keeps a prepared Task's own mode pressed and named on the card after it re-renders", async () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  Object.assign(projection, { state: 'prepared', update: { mode: 'reanalyze-book', modeLabel: '重新分析全书', meaning: '' } });
  for (const mode of ['sync-current', 'reanalyze-range', 'reanalyze-book'] as const) Object.assign(projection.updateControls!.actions[mode], { available: true, unavailableReason: null });
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() }, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }),
  } });
  const drawerRoot = document.createElement('aside'); document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: () => document.createElement('details'), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    setStatus: vi.fn(), taskDrawer: drawer, taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  await vi.waitFor(() => expect(root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')).not.toBeNull());
  expect(root.querySelectorAll('.analysis-update-action [aria-pressed="true"]').map(node => node.dataset['analysisAction'])).toEqual(['reanalyze-book']);
  expect(root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')!.textContent).toBe('开始全部重来');
});

/** A prepared card on the real drawer bar, whose re-preparation the test settles. */
async function preparedCard(update: { mode: 'reanalyze-book' | 'reanalyze-range'; selectedRange?: { startPosition: number; endPosition: number } | null },
  ai7: Record<string, unknown>, awaitServiceJob: (initial: unknown) => Promise<unknown>) {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  Object.assign(projection, { state: 'prepared', update: { mode: update.mode, modeLabel: '', meaning: '', selectedRange: update.selectedRange ?? null } });
  for (const mode of ['sync-current', 'reanalyze-range', 'reanalyze-book'] as const) Object.assign(projection.updateControls!.actions[mode], { available: true, unavailableReason: null });
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() }, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }), ...ai7,
  } });
  const drawerRoot = document.createElement('aside'); document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: () => document.createElement('details'), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    setStatus: vi.fn(), taskDrawer: drawer, taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob, jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  const launch = () => root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')!;
  await vi.waitFor(() => expect(launch()?.disabled).toBe(false));
  return { root, projection, launch };
}

it.each(['prepared', 'cancelled', 'refused'] as const)('gives the card bar back after a re-preparation that ends %s', async exit => {
  let settle!: () => void;
  const prepareBaselineAnalysis = vi.fn(() => exit === 'refused' ? new Promise((_resolve, reject) => { settle = () => reject(new Error('refused')); }) : new Promise(resolve => { settle = () => resolve({ jobId: 'job' }); }));
  let view!: Awaited<ReturnType<typeof preparedCard>>;
  const awaitServiceJob = vi.fn(async () => exit === 'cancelled' ? { state: 'cancelled' } : { state: 'completed', kind: 'baseline-analysis-preparation', result: view.projection });
  view = await preparedCard({ mode: 'reanalyze-book' }, { prepareBaselineAnalysis }, awaitServiceJob);
  view.root.querySelector('.analysis-update-action [data-analysis-action="reanalyze-book"]')!.click();
  await vi.waitFor(() => expect(prepareBaselineAnalysis).toHaveBeenCalledOnce());
  expect(view.launch().disabled).toBe(true);
  // A range pick while it prepares chooses the mode but does not give the start back.
  const radio = view.root.querySelector('.analysis-range-option input')!;
  radio.checked = true; radio.dispatchEvent({ type: 'change', bubbles: true });
  expect(view.launch().disabled).toBe(true);
  settle();
  await vi.waitFor(() => expect(view.launch().disabled).toBe(false));
  const bar = view.root.querySelector('[data-task-launch-kind="baseline-analysis"]')!;
  expect(bar.querySelectorAll('button').filter(button => button.disabled && !button.hidden)).toEqual([]);
});

it('restores a prepared 重新分析所选范围 Task’s range with its mode', async () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  const option = projection.updateControls!.actions['reanalyze-range'].options[0]!;
  const view = await preparedCard({ mode: 'reanalyze-range', selectedRange: { startPosition: option.startPosition, endPosition: option.endPosition } }, {}, vi.fn());
  expect(view.launch().textContent).toBe('开始重新分析');
  const checked = view.root.querySelectorAll('.analysis-range-option input').filter(radio => radio.checked);
  expect(checked.map(radio => radio.value)).toEqual([`${option.startPosition}-${option.endPosition}`]);
  expect(view.root.querySelector('.analysis-update-action [data-analysis-action="reanalyze-range"]')!.disabled).toBe(false);
});

function renderCard(projection: BaselineAnalysisWireProjection, ai7: Record<string, unknown> = {}) {
  vi.stubGlobal('window', { setTimeout, clearTimeout, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }), ...ai7,
  } });
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  root.dataset['analysisBookId'] = projection.bookId;
  const openLaunch = vi.fn((request: TaskLaunchRequest) => {
    const start = document.createElement('button'); start.textContent = request.startLabel ?? '开始';
    start.setAttribute('data-task-drawer-control', 'launch'); request.mount!.append(start);
  });
  const card = createBaselineAnalysisCard({ screen: root, technicalDetails: () => document.createElement('details'),
    rendererErrorMessage: (_error: unknown, fallback: string) => fallback, setStatus: vi.fn(),
    taskDrawer: { refresh: vi.fn(), openLaunch }, taskPlanOpenButton: () => document.createElement('button') } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  return { root, openLaunch };
}

it('explains when to use each update mode in ordinary mode', () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  const { root } = renderCard(projection);
  const explanations = root.querySelectorAll('.analysis-update-explanation').map(node => node.textContent);
  expect(explanations).toEqual([
    '改过稿件后使用：只分析有变化的部分，保留其余分析。',
    '想重点重看某一章时使用：重新分析所选范围，保留其他部分的分析。',
    '想从头重看全稿时使用：重新分析全书，不沿用之前的分析。',
  ]);
});

it('names chapter ranges, distinguishes chapter parts and falls back for unnamed sections, including later pages', async () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  const first = { unitOrdinal: 1, sectionOrdinal: 1, startPosition: 1, endPosition: 3,
    label: '结构段 1「第一章 起点」 · 单元 1/3（1/2）· 段落 1–3 · 240 字素' };
  Object.assign(projection.updateControls!.actions['reanalyze-range'], { options: [first] });
  Object.assign(projection, { listPages: { ...projection.listPages, 'updateControls.actions.reanalyze-range.options': { total: 3, shown: 1, nextOrdinal: 1 } } });
  const getBaselineAnalysisPage = vi.fn(async () => ({ path: 'updateControls.actions.reanalyze-range.options', nextOrdinal: null, items: [
    { ...first, unitOrdinal: 2, startPosition: 4, endPosition: 6, label: '结构段 1「第一章 起点」 · 单元 2/3（2/2）· 段落 4–6 · 240 字素' },
    { unitOrdinal: 3, sectionOrdinal: 2, startPosition: 7, endPosition: 9, label: '结构段 2 · 单元 3/3（1/1）· 段落 7–9 · 240 字素' },
  ] }));
  const { root } = renderCard(projection, { getBaselineAnalysisPage });
  expect(root.querySelector('.analysis-range-option label')!.textContent).toBe('「第一章 起点」（第 1/2 部分）');
  root.querySelector('.analysis-range-options button')!.click();
  await vi.waitFor(() => expect(root.querySelectorAll('.analysis-range-option')).toHaveLength(3));
  expect(root.querySelectorAll('.analysis-range-option label').map(node => node.textContent)).toEqual([
    '「第一章 起点」（第 1/2 部分）', '「第一章 起点」（第 2/2 部分）', '第 2 部分 · 第 7–9 段',
  ]);
  expect(root.querySelectorAll('.analysis-range-option input').map(node => node.value)).toEqual(['1-3', '4-6', '7-9']);
});

it.each(['available', 'cancelled'] as const)('offers one friendly first-analysis card when %s, keeping custom analysis accessible', state => {
  const projection = baselineAnalysisWire(longPreparedAnalysis(3));
  Object.assign(projection, { state, history: null, taskIntent: null, coverageManifest: null });
  Object.assign(projection.actions, { canPrepare: true });
  const { root, openLaunch } = renderCard(projection);
  expect(root.querySelectorAll('.analysis-empty')).toHaveLength(1);
  expect(root.querySelector('.analysis-empty h3')!.textContent).toBe('先了解这本稿件');
  expect(root.querySelector('.analysis-empty [data-analysis-action="start"]')!.textContent).toBe('开始分析');
  expect(root.querySelector('.analysis-empty input')!.type).toBe('hidden');
  expect(root.textContent).not.toMatch(/固定任务目标|尚无基线分析结果|任务目标/u);
  expect(root.querySelectorAll('[role="tab"]').map(node => node.textContent)).toEqual(['稿件分析', '自定义']);
  expect(openLaunch).toHaveBeenCalledWith(expect.objectContaining({ bookId: projection.bookId, input: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null } }), expect.any(Function));
});
