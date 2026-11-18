import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTaskDrawer, type MountTaskDrawerOptions, type TaskPlanRequest } from '../../src/renderer/task-drawer.js';
import { taskStatusDuration, taskStatusName, TASK_DRAWER_TITLE } from '../../src/renderer/task-drawer-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { TaskPlanProjection, TaskPlanRunControlProjection } from '../../src/shared/protocol.js';
import { composeGlobalAttention } from '../../src/service/global-attention.js';
import { taskOverviewItem } from '../../src/service/task-overview.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';

// The ordinary-mode drawer of a started Task (Issue #1527): the real drawer paints a plan read from a stub service, and the unit reads what
// the editor reads. Developer mode keeps the whole plan. Synthetic words only.

vi.mock('../../src/renderer/task-panel.js', () => ({
  mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }),
  mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }),
}));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));

const NOW = '2026-11-17T08:03:12.000Z';
let uninstall: () => void;
beforeEach(() => {
  uninstall = installMiniDom();
  setTechnicalLayerVisible(false);
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined, setInterval: () => 0, clearInterval: () => undefined,
    localStorage: { getItem: () => null, setItem: () => undefined }, getSelection: () => null });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });

const STARTED = { readiness: 'started', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null } as const;
const running = (overrides: Partial<TaskPlanRunControlProjection> = {}, activity: Partial<NonNullable<TaskPlanRunControlProjection['activity']>> = {}): TaskPlanRunControlProjection => ({
  runRecordId: 'run', cancelling: false, pausing: false, cancel: { reason: null, impact: [] }, pause: { reason: null }, resume: null,
  redo: { reason: '先暂停这次运行，再改计划重做' }, executingSince: '2026-11-17T07:58:00.000Z', update: null, continuation: null, accountLimit: null, outcomeUnknown: null,
  activity: { unitsTotal: 8, unitsSettled: 2, currentUnitOrdinal: 3, currentUnitStartedAt: '2026-11-17T08:03:00.000Z', attemptState: 'awaiting-response',
    completedAttempts: 2, longestSettledUnitMs: 60_000, stage: 'units', lastTransitionAt: '2026-11-17T08:03:00.000Z', ...activity },
  ...overrides,
});
const paused = (): TaskPlanRunControlProjection => running({ activity: null, resume: { reason: null }, redo: { reason: null },
  continuation: { unitsSettled: 3, unitsTotal: 8, pendingAnswerUnits: [] } });
const runningPlan = (overrides: Partial<TaskPlanProjection> = {}, control: TaskPlanRunControlProjection = running()) =>
  taskPlanFixture({ state: { key: 'running', label: '运行中' }, start: STARTED, runControl: control, ...overrides });
const finishedPlan = (overrides: Partial<TaskPlanProjection> = {}) => taskPlanFixture({ state: { key: 'settled', label: '已完成' }, start: STARTED, ...overrides });

/** One Task of the Book as the 任务总览 reads it: its model and thinking effort, how long its Run worked, and the result 查看结果 opens. */
const row = (state: 'running' | 'completed', overrides: Record<string, unknown> = {}) => ({
  bookId: 'book', at: state === 'running' ? '2026-11-17T08:00:00.000Z' : '2026-11-17T08:02:00.000Z', plan: { kind: 'baseline-analysis', ref: 'task' }, state, result: state === 'completed' ? { kind: 'analysis-revision', revisionId: 'revision' } : null,
  usage: state === 'completed' ? { calls: 9, elapsed: 192_000 } : null, attention: { modelLabel: 'synthetic-model@high', object: { kind: 'analysis' }, facts: {} }, ...overrides,
});
const overviewOf = (...items: unknown[]) => ({ groups: [{ key: 'recent', items, total: items.length }] });

interface Opening { overview?: () => Promise<unknown>; how?: Parameters<ReturnType<typeof mountTaskDrawer>['open']>[3] }
async function openDrawer(plan: TaskPlanProjection, opening: Opening = {}) {
  const root = miniDocument.createElement('aside');
  miniDocument.body.append(root);
  const openTaskResult = vi.fn();
  const inspectTaskOverview = vi.fn(opening.overview ?? (async () => overviewOf(row(plan.state.key === 'settled' ? 'completed' : 'running'))));
  const inspectTaskPlan = vi.fn(async () => plan);
  const api = { inspectTaskPlan, inspectTaskOverview };
  const technicalDetails = (_className: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement => {
    const details = document.createElement('details'); details.append(...rows); return details;
  };
  const drawer = mountTaskDrawer({ root, shell: document.body, api, technicalDetails, errorMessage: (_error: unknown, fallback: string) => fallback,
    errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(), openTaskResult } as unknown as MountTaskDrawerOptions);
  const task: TaskPlanRequest = { bookId: 'book', kind: 'baseline-analysis', ref: 'task' };
  const open = async () => { drawer.open(task, () => null, undefined, opening.how); await vi.waitFor(() => expect(root.dataset['taskPlanState']).toBe(plan.state.key)); };
  await open();
  return { root, drawer, open, openTaskResult, inspectTaskOverview, inspectTaskPlan };
}

const shown = (node: MiniElement): boolean => { for (let at: MiniElement | null = node; at !== null; at = at.parentElement) if (at.hidden) return false; return true; };
const text = (root: MiniElement, selector: string): string | undefined => { const node = root.querySelector(selector); return node === null || !shown(node) ? undefined : node.textContent; };
/** The lines of words an editor reads in the drawer, besides the controls: the title, the state, and every visible paragraph or item. */
const lines = (root: MiniElement): string[] => root.querySelectorAll('h2, h3, h4, p, li, dt, dd, .task-drawer-pill')
  .filter((node) => shown(node) && node.textContent.trim().length > 0 && node.closest('button, .task-bar-actions, .task-drawer-modes') === null).map((node) => node.textContent);
const controls = (root: MiniElement): string[] => root.querySelectorAll('[data-task-drawer-control]').filter((node) => shown(node) && !node.disabled)
  .map((node) => node.dataset['taskDrawerControl']!);
const model = (root: MiniElement) => vi.waitFor(() => expect(text(root, '.task-status-model')).toBe('模型 synthetic-model@high'));

describe('the status card of a started Task in ordinary mode', () => {
  it('shows a running Task in at most eight lines: its name, state, progress, stage, model, and its actions', async () => {
    const { root } = await openDrawer(runningPlan());
    await model(root);
    expect(text(root, '.task-drawer-title')).toBe('基线分析');
    expect(text(root, '.task-drawer-pill')).toBe('运行中');
    expect(Array.from(root.querySelectorAll('.task-drawer-mode'), (node) => node.textContent)).toEqual(['运行', '计划']);
    expect(root.querySelector('.task-status-progress')?.getAttribute('aria-valuetext')).toBe('已完成约 25%');
    expect(text(root, '.task-status-line')).toBe('正在分析');
    expect(lines(root).length).toBeLessThanOrEqual(8);
    expect(controls(root)).toEqual(expect.arrayContaining(['full-link', 'pause', 'cancel-run', 'run-link']));
  });

  it('leaves out what the card said again: the stage chain, the goal and chips, the footer, the summary, the status and the 修改 that is never available', async () => {
    const { root } = await openDrawer(runningPlan());
    for (const gone of ['.task-plan-stage-chain', '.task-plan-goal', '.task-plan-chips', '.task-plan-compact', '.task-bar-summary', '.task-bar-status', '.task-plan-activity',
      '[data-task-drawer-control="edit"]']) expect(root.querySelector(gone), gone).toBeNull();
    expect(shown(root.querySelector('.task-drawer-footer')!)).toBe(false);
  });

  it('keeps the Run Budget Ceiling on the card of a task that has one, in the plan\'s own words (ADR 0096 §4.2)', async () => {
    const bounded = { service: { ...taskPlanFixture().service, usage: '达到 20,000 tokens 后不再发送新的请求（8 个阅读范围）', usageIsCeiling: true } };
    expect(text((await openDrawer(runningPlan(bounded))).root, '.task-status-ceiling')).toBe('达到 20,000 tokens 后不再发送');
    expect(text((await openDrawer(runningPlan())).root, '.task-status-ceiling')).toBeUndefined();
  });

  it('warns on the card when the step in flight has run longer than this Run\'s steps did, and only then', async () => {
    const slow = running({}, { currentUnitStartedAt: '2026-11-17T07:58:12.000Z', longestSettledUnitMs: 10_000 });
    expect(text((await openDrawer(runningPlan({}, slow))).root, '.task-status-stale')).toBe('本步骤用时已超过通常水平');
    expect(text((await openDrawer(runningPlan())).root, '.task-status-stale')).toBeUndefined();
  });

  it('keeps the step\'s time and the last update in the 计划 view, without the stage chain', async () => {
    const { root } = await openDrawer(runningPlan());
    root.querySelector('[data-task-drawer-control="full-link"]')!.click();
    const rows = Object.fromEntries(root.querySelectorAll('.task-plan-activity-facts dt').map((term, index) => [term.textContent, root.querySelectorAll('.task-plan-activity-facts dd')[index]!.textContent]));
    expect(Object.keys(rows)).toEqual(['阶段', '进度', '本步用时', '上次更新']);
    expect(rows['本步用时']).toBe('00:12');
    expect(root.querySelector('.task-plan-stage-chain')).toBeNull();
  });

  it('shows a finished task as what it came to, its processing time, its model and 查看结果, which opens the result', async () => {
    const { root, openTaskResult } = await openDrawer(finishedPlan());
    await model(root);
    expect(text(root, '.task-status-sentence')).toBe('已完成，得到一份基线分析。');
    expect(text(root, '.task-status-line')).toBe('处理用时 3 分 12 秒');
    expect(lines(root).length).toBeLessThanOrEqual(8);
    root.querySelector('[data-task-drawer-control="view-result"]')!.click();
    expect(openTaskResult).toHaveBeenCalledOnce();
    expect(openTaskResult.mock.calls[0]![0]).toMatchObject({ result: { kind: 'analysis-revision', revisionId: 'revision' }, item: { modelLabel: 'synthetic-model@high' } });
  });

  it('says plainly that a finished task formed nothing to open, with the reason the record gives, and offers no 查看结果', async () => {
    const none = (facts: object) => ({ overview: async () => overviewOf(row('completed', { result: null, attention: { modelLabel: 'synthetic-model@high', object: { kind: 'analysis' }, facts } })) });
    const bare = (await openDrawer(finishedPlan(), none({}))).root;
    await vi.waitFor(() => expect(text(bare, '.task-status-sentence')).toBe('已完成，没有可以查看的结果。'));
    expect(controls(bare)).not.toContain('view-result');
    const why = (await openDrawer(finishedPlan(), none({ completion: { gaps: 8, total: 8, reason: '没有读成任何一部分。' } }))).root;
    await vi.waitFor(() => expect(text(why, '.task-status-sentence')).toBe('已完成，没有可以查看的结果：没有读成任何一部分。'));
    expect(controls(why)).not.toContain('view-result');
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
    const { root } = await openDrawer(runningPlan());
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

/**
 * The row the real service composition gives a Run recorded early, queued, executed, paused and resumed: `composeGlobalAttention` sets `at` to
 * when the Run was recorded, not to the start of the stretch it is executing now.
 */
function composedRunningRow() {
  const attention = composeGlobalAttention({
    imports: [], recoveries: [], conflicts: [], analysisOutcomes: [], reviewRuns: [], reviewCompletions: [], maintenance: [], libraryMaterials: [], learningMaterials: [],
    busy: false, waitingFor: 'admitting',
    analysisTasks: [{ bookId: 'book', bookTitle: '合成书', taskIntentId: 'task', mode: 'first-baseline', createdAt: '2026-11-17T06:50:00.000Z', planRevision: null,
      run: { runRecordId: 'run', state: 'executing', stateAt: '2026-11-17T08:03:00.000Z', recordedAt: '2026-11-17T07:00:00.000Z',
        progress: { unitsTotal: 8, unitsSettled: 2, currentUnitOrdinal: 3, currentUnitStartedAt: '2026-11-17T08:03:00.000Z', attemptState: 'dispatched', completedAttempts: 2,
          longestSettledUnitMs: 60_000, stage: 'units' } } }] as never,
  }, new Date(NOW));
  return taskOverviewItem(attention.groups.flatMap((entry) => entry.items).find((entry) => entry.target.kind === 'analysis')!, () => null);
}

describe('the running card and the times of a Task', () => {
  const line = (root: MiniElement) => text(root, '.task-status-line');

  it('shows the stage alone while a Run executes, for the row the real composition gives — whose `at` is when the Run was recorded, an hour before the resume', async () => {
    const real = composedRunningRow();
    expect(real.at).toBe('2026-11-17T07:00:00.000Z');
    const { root, inspectTaskOverview } = await openDrawer(runningPlan(), { how: { view: 'run', row: real as never } });
    expect(line(root)).toBe('正在分析');
    expect(root.textContent).not.toMatch(/已运行|小时/u);
    expect(inspectTaskOverview).not.toHaveBeenCalled();
  });

  it('does not read the overview again when the Run records another request: its latest transition moves, the state does not', async () => {
    const opened = await openDrawer(runningPlan());
    await vi.waitFor(() => expect(opened.inspectTaskOverview).toHaveBeenCalledTimes(1));
    for (const lastTransitionAt of ['2026-11-17T08:03:05.000Z', '2026-11-17T08:03:09.000Z']) {
      opened.inspectTaskPlan.mockImplementation(async () => runningPlan({}, running({}, { lastTransitionAt })));
      opened.drawer.refresh('baseline-analysis');
      await vi.waitFor(() => expect(opened.root.querySelector('.task-status-card')).not.toBeNull());
    }
    expect(opened.inspectTaskOverview).toHaveBeenCalledTimes(1);
    expect(line(opened.root)).toBe('正在分析');
  });

  it('shows no running figure for a review run, which carries no activity at all', async () => {
    const { root } = await openDrawer(taskPlanFixture({ kind: 'review-run', start: STARTED, state: { key: 'running', label: '运行中' }, runControl: null }));
    expect(line(root)).toBeUndefined();
    expect(root.textContent).not.toMatch(/已运行|用时/u);
  });

  it('on completion shows 处理用时 from the Run Report — and no figure for a Task without one', async () => {
    const opened = await openDrawer(runningPlan());
    await model(opened.root);
    opened.inspectTaskOverview.mockImplementation(async () => overviewOf(row('completed')));
    opened.inspectTaskPlan.mockImplementation(async () => finishedPlan());
    opened.drawer.refresh('baseline-analysis');
    await vi.waitFor(() => expect(line(opened.root)).toBe('处理用时 3 分 12 秒'));
    const bare = await openDrawer(finishedPlan(), { overview: async () => overviewOf(row('completed', { usage: null })) });
    await vi.waitFor(() => expect(text(bare.root, '.task-status-sentence')).toBe('已完成，得到一份基线分析。'));
    expect(line(bare.root)).toBeUndefined();
  });
});

describe('where the card gets the Task\'s model, duration and result', () => {
  it('uses the row its opener handed in and asks for no other', async () => {
    const { root, inspectTaskOverview } = await openDrawer(finishedPlan(), { how: { view: 'run', row: row('completed') as never } });
    await model(root);
    expect(text(root, '.task-status-line')).toBe('处理用时 3 分 12 秒');
    expect(controls(root)).toContain('view-result');
    expect(inspectTaskOverview).not.toHaveBeenCalled();
  });

  it('reads the overview once for a task opened without a row — never again for the same state, however often the plan is read', async () => {
    const { root, drawer, inspectTaskOverview, inspectTaskPlan } = await openDrawer(runningPlan());
    await model(root);
    inspectTaskPlan.mockImplementation(async () => runningPlan({}, running({}, { unitsSettled: 3 })));
    drawer.refresh('baseline-analysis');
    await vi.waitFor(() => expect(root.querySelector('.task-status-progress')?.getAttribute('aria-valuenow')).toBe('3'));
    expect(inspectTaskOverview).toHaveBeenCalledTimes(1);
  });

  it('keeps the model it already knows when the task is in another state, and reads again for that state', async () => {
    const { root, drawer, inspectTaskOverview, inspectTaskPlan } = await openDrawer(runningPlan());
    await model(root);
    inspectTaskPlan.mockImplementation(async () => finishedPlan());
    inspectTaskOverview.mockImplementation(async () => overviewOf(row('completed')));
    drawer.refresh('baseline-analysis');
    await vi.waitFor(() => expect(root.dataset['taskPlanState']).toBe('settled'));
    expect(text(root, '.task-status-model')).toBe('模型 synthetic-model@high');
    await vi.waitFor(() => expect(text(root, '.task-status-line')).toBe('处理用时 3 分 12 秒'));
    expect(inspectTaskOverview).toHaveBeenCalledTimes(2);
  });

  it('after a read that failed, shows the model, the duration and 查看结果 once the drawer is closed and opened again', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(overviewOf(row('completed')));
    const { root, drawer, open, inspectTaskOverview } = await openDrawer(finishedPlan(), { overview: failing });
    await vi.waitFor(() => expect(inspectTaskOverview).toHaveBeenCalledTimes(1));
    expect(text(root, '.task-status-model')).toBeUndefined();
    expect(controls(root)).not.toContain('view-result');
    drawer.close(false);
    await open();
    await model(root);
    expect(text(root, '.task-status-line')).toBe('处理用时 3 分 12 秒');
    expect(controls(root)).toContain('view-result');
    expect(inspectTaskOverview).toHaveBeenCalledTimes(2);
  });

  it('does not remember a read that found no row for the Task: closed and opened again with the row present, the model, 处理用时 and 查看结果 appear', async () => {
    const overview = vi.fn().mockResolvedValueOnce(overviewOf()).mockResolvedValue(overviewOf(row('completed')));
    const { root, drawer, open } = await openDrawer(finishedPlan(), { overview });
    await vi.waitFor(() => expect(overview).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(text(root, '.task-status-sentence')).toBe('已完成。'));
    expect(controls(root)).not.toContain('view-result');
    drawer.close(false);
    await open();
    await model(root);
    expect(text(root, '.task-status-line')).toBe('处理用时 3 分 12 秒');
    expect(controls(root)).toContain('view-result');
    expect(overview).toHaveBeenCalledTimes(2);
  });

  it('drops an answer that arrives after the drawer was closed, and reads again when it is opened', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const slow = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; })).mockResolvedValue(overviewOf(row('completed')));
    const { root, drawer, open, inspectTaskOverview } = await openDrawer(finishedPlan(), { overview: slow });
    await vi.waitFor(() => expect(inspectTaskOverview).toHaveBeenCalledTimes(1));
    drawer.close(false);
    answer(overviewOf(row('completed')));
    await open();
    await model(root);
    expect(inspectTaskOverview).toHaveBeenCalledTimes(2);
  });
});

describe('developer mode', () => {
  it('keeps the whole plan: the task plan title, 精简 · 完整, the activity card with its stage chain, the footer and the bar\'s summary and status', async () => {
    setTechnicalLayerVisible(true);
    const { root } = await openDrawer(runningPlan());
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
    expect([45_000, 192_000, 3_900_000].map(taskStatusDuration)).toEqual(['45 秒', '3 分 12 秒', '1 小时 5 分']);
  });

  it('names the Task in its procedure\'s name, and the drawer\'s own title when the plan names none', () => {
    expect(taskStatusName(taskPlanFixture())).toBe('基线分析');
    expect(taskStatusName(taskPlanFixture({ goal: { ...taskPlanFixture().goal, chips: { ...taskPlanFixture().goal.chips, procedure: '' } } }))).toBe(TASK_DRAWER_TITLE);
  });
});
