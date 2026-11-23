import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountTaskDrawer } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { planWith } from '../support/prepared-task-plan.js';

vi.mock('../../src/renderer/task-panel.js', () => ({ mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }), mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() } }); });
afterEach(() => { setTechnicalLayerVisible(true); vi.unstubAllGlobals(); uninstall(); });

it('keeps an ordinary budget redo startable after authorization fails, revising once and ignoring a double click', async () => {
  const stopped = planWith({ readiness: 'started', planEnvelopeDigest: null });
  stopped.state = { key: 'budget-reached', label: '已停止 · 预算已达上限' };
  stopped.edit.editable = false;
  stopped.budgetStop = { maxTotalTokens: 50000, usedTokens: 50000, unitsSettled: 1, unitsTotal: 8, launchSetsCeiling: false };
  stopped.redo = { summary: [], prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, redoOf: 'old-run' } };
  let prepared = { ...planWith({}), ref: 'redo-task' };
  prepared.edit.budget = { ceiling: { kind: 'tokens', maxTotalTokens: 50000 }, settable: true, reason: null };
  prepared.service.send = '发往本次模型@high';
  const editBaselineAnalysisPlan = vi.fn(async () => {
    prepared = { ...prepared, planVersion: 2, start: { ...prepared.start, planEnvelopeDigest: 'f'.repeat(64) }, edit: { ...prepared.edit, planEnvelopeDigest: 'f'.repeat(64), budget: { ...prepared.edit.budget!, ceiling: { kind: 'tokens', maxTotalTokens: 100000 } } } };
    return { planVersion: { ordinal: 2 } };
  });
  let finish!: () => void;
  const authorizeBaselineAnalysis = vi.fn().mockRejectedValueOnce(new Error('start refused')).mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { state: 'queued' }; });
  const api = { inspectTaskPlan: async ({ ref }: { ref: string }) => ref === 'task' ? stopped : prepared,
    prepareBaselineAnalysis: vi.fn(async () => ({})), editBaselineAnalysisPlan, authorizeBaselineAnalysis };
  const root = document.createElement('aside'); document.body.append(root);
  const drawer = mountTaskDrawer({ root, shell: document.body, api, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(),
    errorCode: () => null, errorMessage: (error: Error) => error.message,
    technicalDetails: () => document.createElement('details'), awaitServiceJob: async () => ({ state: 'completed', result: { taskIntent: { taskIntentId: 'redo-task' } } }) } as never);
  drawer.open({ bookId: 'book', kind: 'baseline-analysis', ref: 'task' }, () => null);
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="redo"]')).not.toBeNull());
  miniDocument.querySelector('[data-task-drawer-control="redo"]')!.click();
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-launch-option="budget"]')?.disabled).toBe(false));
  // The fixed 「沿用本次计划的模型与思考强度」 line is retired (Issue #1680): the send line is not shown as a model.
  expect(root.textContent).not.toContain('本次模型@high');
  const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
  budget.value = '100000'; budget.dispatchEvent({ type: 'change', bubbles: true });
  miniDocument.querySelector('[data-task-drawer-control="start"]')!.click();
  await vi.waitFor(() => expect(root.textContent).toContain('start refused'));
  expect(editBaselineAnalysisPlan).toHaveBeenCalledOnce();
  expect(editBaselineAnalysisPlan).toHaveBeenCalledWith(expect.objectContaining({ runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100000 } }));
  const start = miniDocument.querySelector('[data-task-drawer-control="start"]')!;
  start.click(); start.click();
  await vi.waitFor(() => expect(authorizeBaselineAnalysis).toHaveBeenCalledTimes(2));
  finish();
  await vi.waitFor(() => expect(start.disabled).toBe(true));
  expect(editBaselineAnalysisPlan).toHaveBeenCalledOnce();
  expect(authorizeBaselineAnalysis.mock.calls[0]).toEqual(authorizeBaselineAnalysis.mock.calls[1]);
  drawer.close(false);
});

/** A stopped baseline whose 调整预算并重做 prepares `prepared`; the drawer opens on the redo's own bar. */
async function openBudgetRedo(prepared: ReturnType<typeof planWith> | (() => ReturnType<typeof planWith>), api: Record<string, unknown>) {
  const current = typeof prepared === 'function' ? prepared : () => prepared;
  const stopped = planWith({ readiness: 'started', planEnvelopeDigest: null });
  stopped.state = { key: 'budget-reached', label: '已停止 · 预算已达上限' };
  stopped.edit.editable = false;
  stopped.budgetStop = { maxTotalTokens: 50000, usedTokens: 50000, unitsSettled: 1, unitsTotal: 8, launchSetsCeiling: false };
  stopped.redo = { summary: [], prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, redoOf: 'old-run' } };
  const root = document.createElement('aside'); document.body.append(root);
  const drawer = mountTaskDrawer({ root, shell: document.body, api: { inspectTaskPlan: async ({ ref }: { ref: string }) => ref === 'task' ? stopped : current(), prepareBaselineAnalysis: vi.fn(async () => ({})), ...api },
    onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null, errorMessage: (error: Error) => error.message,
    technicalDetails: () => document.createElement('details'), awaitServiceJob: async () => ({ state: 'completed', result: { taskIntent: { taskIntentId: 'redo-task' } } }) } as never);
  drawer.open({ bookId: 'book', kind: 'baseline-analysis', ref: 'task' }, () => null);
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="redo"]')).not.toBeNull());
  miniDocument.querySelector('[data-task-drawer-control="redo"]')!.click();
  await vi.waitFor(() => expect(miniDocument.querySelector('.task-launch-options [data-task-launch-option="budget"]')).not.toBeNull());
  return { root, drawer };
}

it('offers 联网后开始任务 on an offline redo and records it to wait for the connection', async () => {
  const prepared = { ...planWith({ readiness: 'offline' }), ref: 'redo-task' };
  prepared.edit.budget = { ceiling: { kind: 'tokens', maxTotalTokens: 50000 }, settable: true, reason: null };
  const startBaselineAnalysisWhenOnline = vi.fn(async () => ({}));
  const authorizeBaselineAnalysis = vi.fn(async () => ({ state: 'queued' }));
  const { drawer } = await openBudgetRedo(prepared, { startBaselineAnalysisWhenOnline, authorizeBaselineAnalysis });
  expect(miniDocument.querySelector('[data-task-drawer-control="start"]')).toBeNull();
  const begin = miniDocument.querySelector('[data-task-drawer-control="start-when-online"]')!;
  expect(begin.textContent).toBe('联网后开始任务');
  begin.click();
  await vi.waitFor(() => expect(startBaselineAnalysisWhenOnline).toHaveBeenCalledWith({ taskIntentId: 'redo-task', planEnvelopeDigest: 'e'.repeat(64) }));
  expect(authorizeBaselineAnalysis).not.toHaveBeenCalled();
  drawer.close(false);
});

it('keeps the start-time choice among a ready redo\'s options, and 空闲时处理 records an idle start', async () => {
  const prepared = { ...planWith({}), ref: 'redo-task' };
  prepared.edit.budget = { ceiling: { kind: 'tokens', maxTotalTokens: 50000 }, settable: true, reason: null };
  const startTaskWhenIdle = vi.fn(async () => ({}));
  const authorizeBaselineAnalysis = vi.fn(async () => ({ state: 'queued' }));
  const { drawer } = await openBudgetRedo(prepared, { startTaskWhenIdle, authorizeBaselineAnalysis });
  const timing = miniDocument.querySelector('.task-launch-options [data-task-start-when]')!;
  expect(Array.from(timing.querySelectorAll('option'), option => [option.value, option.textContent])).toEqual([['now', '立即'], ['idle', '空闲时处理']]);
  timing.value = 'idle'; timing.dispatchEvent({ type: 'change', bubbles: true });
  miniDocument.querySelector('[data-task-drawer-control="start"]')!.click();
  await vi.waitFor(() => expect(startTaskWhenIdle).toHaveBeenCalledWith({ kind: 'baseline-analysis', ref: 'redo-task', planEnvelopeDigest: 'e'.repeat(64), planDigests: [] }));
  expect(authorizeBaselineAnalysis).not.toHaveBeenCalled();
  drawer.close(false);
});

it('revises a changed tier and then records the when-online start when the redo is offline by then', async () => {
  let prepared = { ...planWith({}), ref: 'redo-task' };
  prepared.edit.budget = { ceiling: { kind: 'tokens', maxTotalTokens: 50000 }, settable: true, reason: null };
  const editBaselineAnalysisPlan = vi.fn(async () => {
    prepared = { ...prepared, planVersion: 2, start: { ...prepared.start, readiness: 'offline', planEnvelopeDigest: 'f'.repeat(64) },
      edit: { ...prepared.edit, planEnvelopeDigest: 'f'.repeat(64), budget: { ...prepared.edit.budget!, ceiling: { kind: 'tokens', maxTotalTokens: 100000 } } } };
    return { planVersion: { ordinal: 2 } };
  });
  const startBaselineAnalysisWhenOnline = vi.fn(async () => ({}));
  const authorizeBaselineAnalysis = vi.fn(async () => ({ state: 'queued' }));
  const { drawer } = await openBudgetRedo(() => prepared, { editBaselineAnalysisPlan, startBaselineAnalysisWhenOnline, authorizeBaselineAnalysis });
  const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
  budget.value = '100000'; budget.dispatchEvent({ type: 'change', bubbles: true });
  miniDocument.querySelector('[data-task-drawer-control="start"]')!.click();
  await vi.waitFor(() => expect(startBaselineAnalysisWhenOnline).toHaveBeenCalledWith({ taskIntentId: 'redo-task', planEnvelopeDigest: 'f'.repeat(64) }));
  expect(editBaselineAnalysisPlan).toHaveBeenCalledOnce();
  expect(authorizeBaselineAnalysis).not.toHaveBeenCalled();
  drawer.close(false);
});

it('keeps a developer-live redo budget locked with its reason in ordinary words, and starts with the retained ceiling', async () => {
  // After #1573 only developer-live answers a prepared redo's budget as not settable (its launch sets the ceiling).
  const prepared = { ...planWith({}), ref: 'redo-task' };
  const editBaselineAnalysisPlan = vi.fn(async () => ({ planVersion: { ordinal: 2 } }));
  const authorizeBaselineAnalysis = vi.fn(async () => ({ state: 'queued' }));
  const { root, drawer } = await openBudgetRedo(prepared, { editBaselineAnalysisPlan, authorizeBaselineAnalysis });
  const budget = miniDocument.querySelector('[data-task-launch-option="budget"]')!;
  expect(budget.disabled).toBe(true);
  expect(budget.value).toBe('240000');
  const reason = root.querySelector('.task-launch-budget-reason')!.textContent;
  expect(reason).toContain('启动设置'); expect(reason).not.toContain('开发者实时启动参数');
  miniDocument.querySelector('[data-task-drawer-control="start"]')!.click();
  await vi.waitFor(() => expect(authorizeBaselineAnalysis).toHaveBeenCalledWith({ taskIntentId: 'redo-task', planEnvelopeDigest: 'e'.repeat(64) }));
  expect(editBaselineAnalysisPlan).not.toHaveBeenCalled();
  drawer.close(false);
});
