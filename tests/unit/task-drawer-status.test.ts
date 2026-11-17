import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTaskDrawer, type MountTaskDrawerOptions } from '../../src/renderer/task-drawer.js';
import { taskStatusDuration, taskStatusName, TASK_DRAWER_TITLE } from '../../src/renderer/task-drawer-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { TaskPlanProjection, TaskPlanRunControlProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';

// The ordinary-mode drawer of a started Task (Issue #1527): the real drawer paints a plan read from a stub service, and the unit reads what
// the editor reads. Developer mode keeps the whole plan. Synthetic words only.

vi.mock('../../src/renderer/task-panel.js', () => ({
  mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }),
  mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }),
}));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));

let uninstall: () => void;
beforeEach(() => {
  uninstall = installMiniDom();
  setTechnicalLayerVisible(false);
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined, setInterval: () => 0, clearInterval: () => undefined,
    localStorage: { getItem: () => null, setItem: () => undefined }, getSelection: () => null });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T08:03:12.000Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });

const STARTED = { readiness: 'started', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null } as const;
const running = (overrides: Partial<TaskPlanRunControlProjection> = {}): TaskPlanRunControlProjection => ({
  runRecordId: 'run', cancelling: false, pausing: false, cancel: { reason: null, impact: [] }, pause: { reason: null }, resume: null,
  redo: { reason: '先暂停这次运行，再改计划重做' }, executingSince: '2026-11-17T07:58:00.000Z', update: null, continuation: null, accountLimit: null, outcomeUnknown: null,
  activity: { unitsTotal: 8, unitsSettled: 2, currentUnitOrdinal: 3, currentUnitStartedAt: '2026-11-17T08:03:00.000Z', attemptState: 'awaiting-response',
    completedAttempts: 2, longestSettledUnitMs: 60_000, stage: 'units', lastTransitionAt: '2026-11-17T08:03:00.000Z' },
  ...overrides,
});
const paused = (): TaskPlanRunControlProjection => running({ activity: null, resume: { reason: null }, redo: { reason: null },
  continuation: { unitsSettled: 3, unitsTotal: 8, pendingAnswerUnits: [] } });

/** One Task of the Book as the 任务总览 reads it: its model and thinking effort, how long its Run took, and the result 查看结果 opens. */
const overviewItem = (state: 'running' | 'completed') => ({
  bookId: 'book', plan: { kind: 'baseline-analysis', ref: 'task' }, state, result: state === 'completed' ? { kind: 'analysis-revision', revisionId: 'revision' } : null,
  usage: state === 'completed' ? { calls: 9, elapsed: 192_000 } : null, attention: { modelLabel: 'synthetic-model@high', object: { kind: 'analysis' } },
});

async function openDrawer(plan: TaskPlanProjection, state: 'running' | 'completed' = 'running') {
  const root = miniDocument.createElement('aside');
  miniDocument.body.append(root);
  const openTaskResult = vi.fn();
  const api = { inspectTaskPlan: async () => plan, inspectTaskOverview: async () => ({ groups: [{ key: 'recent', items: [overviewItem(state)], total: 1 }] }) };
  const technicalDetails = (_className: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement => {
    const details = document.createElement('details'); details.append(...rows); return details;
  };
  const drawer = mountTaskDrawer({ root, shell: document.body, api, technicalDetails, errorMessage: (_error: unknown, fallback: string) => fallback,
    errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(), openTaskResult } as unknown as MountTaskDrawerOptions);
  drawer.open({ bookId: 'book', kind: 'baseline-analysis', ref: 'task' }, () => null);
  await vi.waitFor(() => expect(root.dataset['taskPlanState']).toBe(plan.state.key));
  await vi.waitFor(() => expect(root.querySelector('[data-task-status-card]') === null || root.querySelector('.task-status-model')?.hidden === false).toBe(true));
  return { root, drawer, openTaskResult };
}

const shown = (node: MiniElement): boolean => { for (let at: MiniElement | null = node; at !== null; at = at.parentElement) if (at.hidden) return false; return true; };
const text = (root: MiniElement, selector: string): string | undefined => root.querySelector(selector)?.textContent;
/** The lines of words an editor reads in the drawer, besides the controls: the title, the state, and every visible paragraph or item. */
const lines = (root: MiniElement): string[] => root.querySelectorAll('h2, h3, h4, p, li, dt, dd, .task-drawer-pill')
  .filter((node) => shown(node) && node.textContent.trim().length > 0 && node.closest('button, .task-bar-actions, .task-drawer-modes') === null).map((node) => node.textContent);
const controls = (root: MiniElement): string[] => root.querySelectorAll('[data-task-drawer-control]').filter((node) => shown(node) && !node.disabled)
  .map((node) => node.dataset['taskDrawerControl']!);

describe('the status card of a started Task in ordinary mode', () => {
  it('shows a running Task in at most eight lines: its name, state, progress, stage and time, model, and its actions', async () => {
    const { root } = await openDrawer(taskPlanFixture({ state: { key: 'running', label: '运行中' }, start: STARTED, runControl: running() }));
    expect(text(root, '.task-drawer-title')).toBe('基线分析');
    expect(text(root, '.task-drawer-pill')).toBe('运行中');
    expect(Array.from(root.querySelectorAll('.task-drawer-mode'), (node) => node.textContent)).toEqual(['运行', '计划']);
    expect(root.querySelector('.task-status-progress')?.getAttribute('aria-valuetext')).toBe('已完成约 25%');
    expect(text(root, '.task-status-line')).toBe('正在分析 · 用时 5 分 12 秒');
    expect(text(root, '.task-status-model')).toBe('模型 synthetic-model@high');
    expect(lines(root).length).toBeLessThanOrEqual(8);
    expect(controls(root)).toEqual(expect.arrayContaining(['full-link', 'pause', 'cancel-run', 'run-link']));
  });

  it('leaves out what the card said again: the stage chain, the goal and chips, the footer, the summary, the status and the 修改 that is never available', async () => {
    const { root } = await openDrawer(taskPlanFixture({ state: { key: 'running', label: '运行中' }, start: STARTED, runControl: running() }));
    for (const gone of ['.task-plan-stage-chain', '.task-plan-goal', '.task-plan-chips', '.task-plan-compact', '.task-bar-summary', '.task-bar-status', '.task-plan-activity',
      '[data-task-drawer-control="edit"]']) expect(root.querySelector(gone), gone).toBeNull();
    expect(shown(root.querySelector('.task-drawer-footer')!)).toBe(false);
  });

  it('shows a finished Task as one sentence of result, its duration and model, and 查看结果, which opens the result', async () => {
    const { root, openTaskResult } = await openDrawer(taskPlanFixture({ state: { key: 'settled', label: '已完成' }, start: STARTED }), 'completed');
    expect(text(root, '.task-status-sentence')).toBe('已完成，得到一份基线分析。');
    expect(text(root, '.task-status-line')).toBe('用时 3 分 12 秒');
    expect(text(root, '.task-status-model')).toBe('模型 synthetic-model@high');
    expect(lines(root).length).toBeLessThanOrEqual(8);
    root.querySelector('[data-task-drawer-control="view-result"]')!.click();
    expect(openTaskResult).toHaveBeenCalledOnce();
    expect(openTaskResult.mock.calls[0]![0]).toMatchObject({ result: { kind: 'analysis-revision', revisionId: 'revision' }, item: { modelLabel: 'synthetic-model@high' } });
  });

  const WAITS: ReadonlyArray<readonly [string, Partial<TaskPlanProjection>, string]> = [
    ['waiting for the network', { state: { key: 'waiting', label: '等待网络' } }, 'cancel-wait'],
    ['waiting for idle', { state: { key: 'queued', label: '等待空闲' } }, 'cancel-wait'],
    ['queued', { state: { key: 'queued', label: '等待运行名额' } }, 'cancel-wait'],
    ['paused', { state: { key: 'paused', label: '已暂停' }, runControl: paused() }, 'resume'],
    ['stopped on the budget', { state: { key: 'budget-reached', label: '已停止 · 预算已达上限' },
      budgetStop: { maxTotalTokens: 1000, usedTokens: 1000, unitsSettled: 3, unitsTotal: 8, launchSetsCeiling: false },
      redo: { summary: [], prepare: { goal: 'first-baseline', update: null, redoOf: 'run' } } as never }, 'redo'],
    ['failed', { state: { key: 'stopped', label: '运行失败' }, runOutcome: { label: '运行失败', reason: '模型服务没有回应。', classification: 'failed' } }, 'run-link'],
    ['cancelled', { state: { key: 'cancelled-after-start', label: '已取消' } }, 'run-link'],
  ];
  it.each(WAITS)('keeps %s whole: one sentence, and a way out', async (_name, overrides, action) => {
    const { root } = await openDrawer(taskPlanFixture({ start: STARTED, ...overrides }));
    const sentences = root.querySelectorAll('.task-status-sentence, .task-bar-note, .attention-note').filter((node) => shown(node) && node.textContent.length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(controls(root)).toContain(action);
    expect(lines(root).length).toBeLessThanOrEqual(8);
  });

  it('puts the goal, the plan lines and the chips behind 查看计划, and 运行 comes back to the card', async () => {
    const { root } = await openDrawer(taskPlanFixture({ state: { key: 'running', label: '运行中' }, start: STARTED, runControl: running() }));
    root.querySelector('[data-task-drawer-control="full-link"]')!.click();
    expect(root.querySelector('.task-plan-goal')).not.toBeNull();
    expect(root.querySelector('.task-plan-full')).not.toBeNull();
    expect(root.querySelector('[data-task-status-card]')).toBeNull();
    expect(root.querySelector('.task-drawer-mode[aria-pressed="true"]')?.textContent).toBe('计划');
    root.querySelector('[data-task-drawer-mode="compact"]')!.click();
    expect(root.querySelector('[data-task-status-card]')).not.toBeNull();
    expect(root.querySelector('.task-plan-goal')).toBeNull();
  });

  it('shows a plan not yet started with no disabled 修改 and no 基于当前稿件 said twice', async () => {
    const { root } = await openDrawer(taskPlanFixture());
    expect(root.querySelector('[data-task-drawer-control="edit"]')).toBeNull();
    expect(root.querySelector('.task-plan-saved')).toBeNull();
    expect(root.textContent.split('基于当前稿件').length - 1).toBe(1);
    expect(text(root, '.task-plan-full-link')).toBe('完整计划');
    expect(root.querySelector('.task-bar-summary')).toBeNull();
  });
});

describe('developer mode', () => {
  it('keeps the whole plan: the task plan title, 精简 · 完整, the activity card with its stage chain, the footer and the bar\'s summary and status', async () => {
    setTechnicalLayerVisible(true);
    const { root } = await openDrawer(taskPlanFixture({ state: { key: 'running', label: '运行中' }, start: STARTED, runControl: running() }));
    expect(text(root, '.task-drawer-title')).toBe(TASK_DRAWER_TITLE);
    expect(Array.from(root.querySelectorAll('.task-drawer-mode'), (node) => node.textContent)).toEqual(['精简', '完整']);
    for (const kept of ['.task-plan-activity', '.task-plan-stage-chain', '.task-plan-goal', '.task-plan-compact', '.task-bar-summary', '.task-bar-status', '[data-task-drawer-control="edit"]']) {
      expect(root.querySelector(kept), kept).not.toBeNull();
    }
    expect(shown(root.querySelector('.task-drawer-footer')!)).toBe(true);
    expect(root.querySelector('[data-task-status-card]')).toBeNull();
  });
});

describe('the words of the status card', () => {
  it('counts a Run\'s duration in its two largest units', () => {
    expect(['0', 45_000, 192_000, 3_900_000].map((value) => typeof value === 'number' ? taskStatusDuration(value) : value)).toEqual(['0', '45 秒', '3 分 12 秒', '1 小时 5 分']);
  });

  it('names the Task in its procedure\'s name, and the drawer\'s own title when the plan names none', () => {
    expect(taskStatusName(taskPlanFixture())).toBe('基线分析');
    expect(taskStatusName(taskPlanFixture({ goal: { ...taskPlanFixture().goal, chips: { ...taskPlanFixture().goal.chips, procedure: '' } } }))).toBe(TASK_DRAWER_TITLE);
  });
});
