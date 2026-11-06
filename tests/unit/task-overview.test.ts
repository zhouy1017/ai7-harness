import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { openTaskResultWindow } from '../../src/renderer/task-result-window.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { mountTaskOverview, taskOverviewCard } from '../../src/renderer/tasks-overview.js';
import { mountTaskPanel } from '../../src/renderer/task-panel.js';
import { describe, expect, it, vi } from 'vitest';
import { taskOverviewApi } from '../../src/renderer/task-overview-api.js';
import { composeTaskOverview, estimateTaskStarts, controlOverviewTasks } from '../../src/service/task-overview.js';
import type { BookTasksProjection, GlobalAttentionItemProjection, GlobalAttentionProjection, RendererApi } from '../../src/shared/protocol.js';

function task(group: GlobalAttentionItemProjection['group'], state: GlobalAttentionItemProjection['state'], id: string): GlobalAttentionItemProjection {
  return { itemId: id, group, state, blocked: false, at: '2026-11-05T01:00:00Z', book: { bookId: 'book', title: '任务总览' },
    object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
    target: { kind: 'analysis', bookId: 'book', taskIntentId: id }, technical: [{ key: 'run-record', label: '运行', value: id }] };
}
describe('task overview', () => {
  it('shows a completed writing task without navigating away from the current plan', () => {
    const uninstall = installMiniDom();
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { ...miniDocument, createElement: (tag: string) => Object.assign(miniDocument.createElement(tag), { style: { removeProperty: vi.fn() } }) });
    const item: GlobalAttentionItemProjection = { ...task('recent', 'analysis-completed', 'writing'), object: { kind: 'task', taskKind: 'writing' },
      target: { kind: 'task-plan', bookId: 'book', taskKind: 'writing', ref: 'writing' }, facts: { progress: null, categories: [], revisionOrdinal: null, completion: { gaps: 0, total: 2, reason: null } } };
    const openSurface = vi.fn();
    const api = { inspectBaselineAnalysis: vi.fn<RendererApi['inspectBaselineAnalysis']>(), getAnalysisRevisionUnits: vi.fn<RendererApi['getAnalysisRevisionUnits']>(),
      getAnalysisRevisionOverview: vi.fn<RendererApi['getAnalysisRevisionOverview']>(), inspectReviewWorkspace: vi.fn<RendererApi['inspectReviewWorkspace']>(), inspectDialogue: vi.fn<RendererApi['inspectDialogue']>() };
    const result = openTaskResultWindow({ entry: { item, result: null }, api, column: () => null, jump: vi.fn(), openSurface, onClose: vi.fn(), errorMessage: () => '读取失败' });
    try {
      expect(result.element.dataset['taskResult']).toBe('ready');
      expect(result.element.dataset['taskResultKind']).toBe('task');
      expect(result.element.textContent).toContain('已完成 2 / 2 个单元。');
      expect(openSurface).not.toHaveBeenCalled();
      for (const read of Object.values(api)) expect(read).not.toHaveBeenCalled();
      result.element.querySelector<HTMLButtonElement>('[data-task-result-action="open"]')!.click();
      expect(openSurface).toHaveBeenCalledWith(item.target, undefined);
    } finally { result.close(false); vi.unstubAllGlobals(); uninstall(); }
  });
  it.each(['analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-admission', 'analysis-waiting-slot'] as const)('keeps %s out of running counts and pause controls', (state) => {
    const uninstall = installMiniDom();
    try {
      const projection = composeTaskOverview({ groups: [{ key: 'active', items: [task('active', state, 'waiting')], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
      expect(projection.runningCount).toBe(0); expect(projection.queuedCount).toBe(1);
      const card = taskOverviewCard(projection.groups[1]!.items[0]!, vi.fn());
      expect(card.querySelector('.task-overview-card-kind')!.textContent).toBe(projection.groups[1]!.items[0]!.taskKind);
      expect(card.querySelector('.task-overview-card-title .state-term')).not.toBeNull();
      expect(card.querySelector('.task-overview-card-time')!.textContent).toContain('记录于');
      expect([...card.querySelector('.task-overview-card-line')!.textContent!].length).toBeLessThanOrEqual(60);
      expect(card.querySelector('[data-task-action="pause"]')).toBeNull();
      expect(card.querySelector('[data-task-action="up"]')).toBeNull();
      expect(card.textContent).toContain(state === 'analysis-waiting-network' ? '等待联网' : state === 'analysis-waiting-connection' ? '等待模型连接' : state === 'analysis-waiting-admission' ? '等待开始前检查' : '等待运行名额');
    } finally { uninstall(); }
  });
  it('keeps a stopped dialogue available to continue in the paused group', () => {
    const original = { ...task('recent', 'dialogue-stopped', 'dialogue'), object: { kind: 'dialogue' as const, question: '核对人名' }, target: { kind: 'dialogue' as const, bookId: 'book', dialogueId: 'dialogue' } };
    const projection = composeTaskOverview({ groups: [{ key: 'recent', items: [original], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const uninstall = installMiniDom();
    try { expect(taskOverviewCard(projection.groups[3]!.items[0]!, vi.fn()).querySelector('[data-task-action="resume"]')).not.toBeNull(); }
    finally { uninstall(); }
  });
  it('keeps context and controls in one header and repeats the selected original plan', async () => {
    const uninstall = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => {} });
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ book: 'all', type: 'all', time: 'all' }) });
    const original = task('recent', 'analysis-completed', 'older');
    const projection = composeTaskOverview({ groups: [{ key: 'recent', items: [original], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const startQuickTasks = vi.fn(async () => ({}));
    const root = document.createElement('section');
    const surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => projection, startQuickTasks } as unknown as RendererApi, setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(root.querySelector('.task-overview-context')?.parentElement).toBe(root.querySelector('.task-overview-heading-row'));
      root.querySelector<HTMLButtonElement>('[data-task-action="again"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(startQuickTasks).toHaveBeenCalledWith({ tasks: [{ bookId: 'book', procedureId: 'repeat', repeat: { kind: 'baseline-analysis', ref: 'older' } }] });
    } finally { surface.destroy(); vi.unstubAllGlobals(); uninstall(); }
  });
  it('opens the eleventh Book result from its card even when the legacy reading has only ten', async () => {
    const uninstall = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
    const recent = Array.from({ length: 11 }, (_, i) => ({ item: task('recent', 'analysis-completed', `done-${i}`), result: { kind: 'analysis-revision' as const, revisionId: `revision-${i}` } }));
    const projection = composeTaskOverview({ groups: [], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null, recent);
    const openResult = vi.fn();
    const panel = mountTaskPanel({ api: { inspectTaskOverview: async () => projection, inspectBookTasks: async () => ({ bookId: 'book', running: false, groups: [{ key: 'recent', items: recent.slice(0, 10), total: 11 }] }), inspectBaselineAnalysis: async () => { throw new Error('none'); } } as unknown as RendererApi, setStatus: vi.fn(), errorMessage: () => '', openResult, parked: () => null } as unknown as Parameters<typeof mountTaskPanel>[0]);
    try {
      panel.show('book'); await new Promise((resolve) => setTimeout(resolve, 0));
      panel.element.querySelector<HTMLElement>('[data-task-item="done-10"]')!.querySelector<HTMLButtonElement>('[data-task-action="result"]')!.click();
      expect(openResult).toHaveBeenCalledWith(recent[10]);
    } finally { panel.stop(); vi.unstubAllGlobals(); uninstall(); }
  });
  it('keeps the pane ready from paged totals while the overview owns its cards', async () => {
    const uninstall = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
    const cards = ['first', 'last'].map((id) => ({ item: task('recent', 'analysis-completed', id), result: null }));
    const projection = composeTaskOverview({ groups: [], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null, cards);
    const partial: BookTasksProjection = { bookId: 'book', running: false,
      groups: [{ key: 'waiting', items: [], total: 0 }, { key: 'running', items: [], total: 0 }, { key: 'recent', items: cards.slice(0, 1), total: 2 }],
      listPages: { 'groups.2.items': { shown: 1, total: 2, nextOrdinal: 1, digest: 'a'.repeat(64) } } };
    const getTaskPlanPage = vi.fn(async () => { throw new Error('TASK_PLAN_PAGE_CHANGED'); });
    const inspectBookTasks = vi.fn(async () => partial);
    const panel = mountTaskPanel({ api: { inspectTaskOverview: async () => projection, inspectBookTasks, getTaskPlanPage,
      inspectBaselineAnalysis: async () => { throw new Error('none'); } } as unknown as RendererApi,
      setStatus: vi.fn(), errorMessage: () => '', parked: () => null } as unknown as Parameters<typeof mountTaskPanel>[0]);
    try {
      panel.show('book'); await new Promise((resolve) => setTimeout(resolve, 0));
      expect(panel.element.querySelector('.task-panel-scope')!.textContent).toContain('2 项');
      expect(panel.element.dataset['taskPanel']).toBe('ready');
      expect(panel.element.querySelector('[data-task-item="last"]')).not.toBeNull();
      panel.refresh(); await new Promise((resolve) => setTimeout(resolve, 0));
      expect(inspectBookTasks).toHaveBeenCalledTimes(2);
      expect(getTaskPlanPage).not.toHaveBeenCalled();
      expect(panel.element.dataset['taskPanel']).toBe('ready');
    } finally { panel.stop(); vi.unstubAllGlobals(); uninstall(); }
  });
  it('continues healthy tasks after one resume fails and always releases the queue', async () => {
    const freeze = vi.fn(); const control = vi.fn().mockRejectedValueOnce(new Error('计划已变更')).mockResolvedValueOnce(undefined);
    const items = ['drifted', 'healthy'].map((id) => composeTaskOverview({ groups: [{ key: 'active', items: [task('active', 'analysis-paused', id)], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null).groups[3]!.items[0]!);
    await expect(controlOverviewTasks('resume', { freeze, items: () => items, control })).rejects.toThrow('计划已变更');
    expect(control.mock.calls.map(([item]) => item.itemId)).toEqual(['drifted', 'healthy']);
    expect(freeze.mock.calls).toEqual([[true], [false]]);
  });
  it('pauses running dialogues alongside plan tasks and leaves dispatch frozen', async () => {
    const dialogue = { ...task('active', 'dialogue-answering', 'dialogue'), object: { kind: 'dialogue' as const, question: '核对人名' }, target: { kind: 'dialogue' as const, bookId: 'book', dialogueId: 'dialogue' } };
    const items = composeTaskOverview({ groups: [{ key: 'active', items: [dialogue], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => null).groups[0]!.items;
    const freeze = vi.fn(), control = vi.fn();
    await controlOverviewTasks('pause', { freeze, items: () => items, control });
    expect(control).toHaveBeenCalledWith(expect.objectContaining({ target: dialogue.target }));
    expect(freeze.mock.calls).toEqual([[true]]);
  });
  it('keeps completed and cancelled tasks in history and sorts the authoritative queue positions', () => {
    const items = [task('active', 'analysis-waiting-capacity', 'second'), task('active', 'analysis-waiting-capacity', 'first'), task('recent', 'analysis-completed', 'done'), task('recent', 'analysis-cancelled', 'cancelled')];
    const attention: GlobalAttentionProjection = { groups: [{ key: 'active', items, total: 4 }], actionableCount: 0, running: true, processing: { state: 'local' } };
    const result = composeTaskOverview(attention, 2, (id) => id === 'first' ? 1 : id === 'second' ? 2 : null);
    expect(result.groups.find((group) => group.key === 'queued')!.items.map((item) => item.itemId)).toEqual(['first', 'second']);
    expect(result.groups.find((group) => group.key === 'recent')!.items.map((item) => item.state)).toEqual(['completed', 'cancelled']);
    expect(result.queuedCount).toBe(2);
  });
  it('estimates a queued start from measured recent unit throughput and omits it without measurements', () => {
    const running = task('active', 'analysis-running', 'running'); running.facts.progress = { stage: 'units', unitsSettled: 4, unitsTotal: 8 };
    const queued = task('active', 'analysis-waiting-capacity', 'queued'); queued.facts.progress = { stage: 'units', unitsSettled: 0, unitsTotal: 8 };
    const completed = task('recent', 'analysis-completed', 'done'); completed.facts.completion = { gaps: 0, total: 8, reason: null };
    const attention: GlobalAttentionProjection = { groups: [{ key: 'active', items: [running, queued, completed], total: 3 }], actionableCount: 0, running: true, processing: { state: 'local' } };
    const projection = composeTaskOverview(attention, 1, (id) => id === 'queued' ? 1 : null, undefined, [], false, (item) => item.itemId === 'done' ? { elapsed: 60000, calls: 8 } : null);
    expect(estimateTaskStarts(projection, Date.parse(completed.at)).groups[1]!.items[0]!.eta).toBe(30000);
    const noUsage = { ...projection, groups: projection.groups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, usage: null })) })) };
    expect(estimateTaskStarts(noUsage).groups[1]!.items[0]!.eta).toBeNull();
  });
  it('renders state-specific shared card actions without exposing record or model identities', () => {
    const uninstall = installMiniDom();
    try {
      const cases = [
        ['active', 'analysis-running', ['pause', 'cancel']], ['active', 'analysis-waiting-capacity', ['up', 'top', 'cancel']],
        ['decisions', 'analysis-clarification', ['answer']], ['active', 'analysis-paused', ['resume', 'redo']],
        ['recent', 'analysis-completed', ['result', 'again']],
      ] as const;
      for (const [group, state, actions] of cases) {
        const item = task(group, state, 'b0000000-0000-4000-8000-000000000001');
        const attention: GlobalAttentionProjection = { groups: [{ key: group, items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } };
        const projected = composeTaskOverview(attention, 2, () => state === 'analysis-waiting-capacity' ? 1 : null).groups.flatMap((group) => group.items)[0]!;
        const act = vi.fn(); const card = taskOverviewCard(projected, act);
        expect(Array.from(card.querySelectorAll<HTMLElement>('[data-task-action]')).filter((button) => !button.closest('details')).map((button) => button.dataset['taskAction'])).toEqual(actions);
        expect(card.querySelectorAll('.task-overview-card-line')).toHaveLength(1);
        expectNoTechnicalText(card);
        card.querySelector<HTMLButtonElement>(`[data-task-action="${actions[0]}"]`)!.click();
        expect(act).toHaveBeenCalledWith(projected, actions[0]);
        card.querySelector<HTMLButtonElement>('[data-task-action="run"]')!.click();
        expect(act).toHaveBeenCalledWith(projected, 'run');
      }
    } finally { uninstall(); }
  });
  it('scopes existing drawer commands to the selected Book even when the contextBridge API is frozen', async () => {
    const inspectTaskPlan = vi.fn(); const taskOverviewCall = vi.fn().mockResolvedValue({ bookId: 'other' });
    const api = Object.freeze({ inspectTaskPlan, taskOverviewCall }) as unknown as RendererApi;
    let book: string | null = 'other'; const scoped = taskOverviewApi(api, () => book);
    await scoped.inspectTaskPlan({ kind: 'baseline-analysis', ref: 'task' });
    expect(taskOverviewCall).toHaveBeenCalledWith({ bookId: 'other', operation: 'inspectTaskPlan', input: { kind: 'baseline-analysis', ref: 'task' } });
    expect(inspectTaskPlan).not.toHaveBeenCalled();
    book = null; await scoped.inspectTaskPlan({ kind: 'baseline-analysis', ref: 'task' });
    expect(inspectTaskPlan).toHaveBeenCalledOnce();
  });
});
