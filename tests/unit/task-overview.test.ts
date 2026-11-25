import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { openTaskResultWindow } from '../../src/renderer/task-result-window.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { mountTaskOverview, taskOverviewCard } from '../../src/renderer/tasks-overview.js';
import { mountTaskPanel } from '../../src/renderer/task-panel.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { describe, expect, it, vi } from 'vitest';
import { taskOverviewApi } from '../../src/renderer/task-overview-api.js';
import { composeTaskOverview, estimateTaskStarts, controlOverviewTasks } from '../../src/service/task-overview.js';
import type { BookTasksProjection, GlobalAttentionItemProjection, GlobalAttentionProjection, RendererApi, TaskWorkProjection } from '../../src/shared/protocol.js';

function task(group: GlobalAttentionItemProjection['group'], state: GlobalAttentionItemProjection['state'], id: string): GlobalAttentionItemProjection {
  return { itemId: id, group, state, blocked: false, at: new Date().toISOString(), book: { bookId: 'book', title: '任务总览' },
    object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
    target: { kind: 'analysis', bookId: 'book', taskIntentId: id }, technical: [{ key: 'run-record', label: '运行', value: id }] };
}
describe('task overview', () => {
  it('ticks the same work on the global page and Book panel, retaining the nodes through pauses and resumes', async () => {
    const uninstall = installMiniDom(); vi.useFakeTimers(); setTechnicalLayerVisible(false);
    vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout });
    vi.stubGlobal('localStorage', { getItem: () => null });
    let work: TaskWorkProjection = { workedMs: 60000, workingSince: new Date().toISOString(), finished: null };
    const projection = composeTaskOverview({ groups: [{ key: 'active', items: [task('active', 'analysis-running', 'running')], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => null);
    const api = { inspectTaskOverview: async () => ({ ...projection, groups: projection.groups.map(group => ({ ...group, items: group.items.map(item => ({ ...item, work })) })) }),
      inspectBookTasks: async () => ({ bookId: 'book', running: true, groups: [] }), inspectBaselineAnalysis: async () => { throw new Error('no analysis'); } } as unknown as RendererApi;
    const root = document.createElement('section');
    const overview = mountTaskOverview({ root, api, setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
    const panel = mountTaskPanel({ api, setStatus: vi.fn(), errorMessage: () => '', parked: () => null } as unknown as Parameters<typeof mountTaskPanel>[0]);
    miniDocument.body.append(root as never, panel.element as never);
    try {
      panel.show('book'); await vi.advanceTimersByTimeAsync(0);
      const nodes = [root, panel.element].map(host => host.querySelector('.task-overview-usage')!);
      expect(nodes.map(node => node.textContent)).toEqual(['用时 1 分 0 秒', '用时 1 分 0 秒']);
      await vi.advanceTimersByTimeAsync(3000);
      expect(nodes.map(node => node.textContent)).toEqual(['用时 1 分 3 秒', '用时 1 分 3 秒']);
      work = { workedMs: 63000, workingSince: null, finished: null };
      overview.refresh(); panel.refresh(); await vi.advanceTimersByTimeAsync(10000);
      expect([root, panel.element].map(host => host.querySelector('.task-overview-usage')!.textContent)).toEqual(['用时 1 分 3 秒', '用时 1 分 3 秒']);
      work = { ...work, workingSince: new Date().toISOString() };
      overview.refresh(); panel.refresh(); await vi.advanceTimersByTimeAsync(2000);
      expect([root, panel.element].map(host => host.querySelector('.task-overview-usage')!.textContent)).toEqual(['用时 1 分 5 秒', '用时 1 分 5 秒']);
      for (const host of [root, panel.element]) expect(host.textContent).not.toContain('已用时');
    } finally { overview.destroy(); panel.stop(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); }
  });

  it.each([false, true])('shows exact ended work and the recorded model, omitting absent work (Book panel: %s)', inBook => {
    const uninstall = installMiniDom(); setTechnicalLayerVisible(false);
    const original = task('recent', 'analysis-completed', 'finished');
    const projection = composeTaskOverview({ groups: [{ key: 'recent', items: [original], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const item = { ...projection.groups[4]!.items[0]!, usage: { calls: 999, elapsed: 999999 },
      work: { workedMs: 45000, workingSince: null, finished: { requests: 12, modelLabel: 'recorded-model@high' } } };
    try {
      const card = taskOverviewCard(item, vi.fn(), inBook);
      expect(card.querySelector('.task-overview-usage')?.textContent).toBe('用时 45 秒 · 12 次模型调用');
      // The record keeps the service's level name; the card says it in the editor's word, and developer mode shows the record.
      expect(card.querySelector('.task-overview-model')?.textContent).toBe('recorded-model@高');
      // One line of facts: the time, the working time and the model apart, 模型 before its name (stage-4/5 R3).
      const time = card.querySelector('.task-overview-card-time')!.textContent!;
      expect(time).not.toBe('');
      expect(card.querySelector('.task-overview-card-facts')?.textContent).toBe(`${time} · 用时 45 秒 · 12 次模型调用 · 模型 recorded-model@高`);
      expect(card.textContent).not.toMatch(/tokens|约 .*次调用|999/u);
      const { work: _work, ...withoutWork } = item;
      for (const bare of [withoutWork, { ...withoutWork, work: null }]) {
        const bareCard = taskOverviewCard(bare, vi.fn(), inBook);
        expect(bareCard.querySelector('.task-overview-usage')).toBeNull();
        expect(bareCard.querySelector('.task-overview-card-facts')?.textContent).toBe(bare.attention.modelLabel ? `${time} · 模型 ${bare.attention.modelLabel}` : time);
      }
      const unknown = taskOverviewCard({ ...item, work: { ...item.work, finished: { requests: null, modelLabel: null } } }, vi.fn(), inBook);
      expect(unknown.querySelector('.task-overview-usage')?.textContent).toBe('用时 45 秒');
      expect(unknown.querySelector('.task-overview-model')).toBeNull();
    } finally { setTechnicalLayerVisible(true); uninstall(); }
  });

  it('keeps running task more and exact summary focus through two changed polls (#1375)', async () => {
    const uninstall = installMiniDom(); vi.useFakeTimers(); setTechnicalLayerVisible(false);
    vi.stubGlobal('window', { setInterval, clearInterval });
    vi.stubGlobal('localStorage', { getItem: () => null });
    let tick = 0;
    const root = document.createElement('section'); miniDocument.body.append(root as never);
    const surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => {
      const item = task('active', 'analysis-running', 'running');
      item.facts.progress = { stage: 'units', unitsSettled: ++tick, unitsTotal: 10 };
      return composeTaskOverview({ groups: [{ key: 'active', items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => null);
    } } as unknown as RendererApi, setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
    try {
      await vi.advanceTimersByTimeAsync(0);
      root.querySelector<HTMLDetailsElement>('.task-overview-more')!.open = true;
      root.querySelector<HTMLElement>('.task-overview-more summary')!.focus();
      for (let cycle = 0; cycle < 2; cycle++) {
        await vi.advanceTimersByTimeAsync(2000);
        expect(root.querySelector<HTMLDetailsElement>('.task-overview-more')!.open).toBe(true);
        expect(document.activeElement).toBe(root.querySelector('.task-overview-more summary'));
      }
      expect(tick).toBe(3);
    } finally { surface.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); }
  });
  it('keeps the Book task pane menu through its changed two-second reads (#1375)', async () => {
    const uninstall = installMiniDom(); vi.useFakeTimers(); setTechnicalLayerVisible(false);
    vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout });
    let tick = 0;
    const panel = mountTaskPanel({ api: { inspectTaskOverview: async () => {
      const item = task('active', 'analysis-running', 'running');
      item.facts.progress = { stage: 'units', unitsSettled: ++tick, unitsTotal: 20 };
      return composeTaskOverview({ groups: [{ key: 'active', items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => null);
    }, inspectBookTasks: async () => ({ bookId: 'book', running: true, groups: [], tick: tick }), inspectBaselineAnalysis: async () => { throw new Error('no analysis'); } } as unknown as RendererApi,
    setStatus: vi.fn(), errorMessage: () => '', parked: () => null } as unknown as Parameters<typeof mountTaskPanel>[0]);
    miniDocument.body.append(panel.element as never);
    try {
      panel.show('book'); await vi.advanceTimersByTimeAsync(0);
      panel.element.querySelector<HTMLDetailsElement>('.task-overview-more')!.open = true;
      panel.element.querySelector<HTMLElement>('.task-overview-more summary')!.focus();
      for (let cycle = 0; cycle < 2; cycle++) {
        await vi.advanceTimersByTimeAsync(2000);
        expect(panel.element.querySelector<HTMLDetailsElement>('.task-overview-more')!.open).toBe(true);
        expect(document.activeElement).toBe(panel.element.querySelector('.task-overview-more summary'));
      }
      expect(tick).toBeGreaterThanOrEqual(3);
    } finally { panel.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); }
  });
  it('runs each Book menu entry for the displayed Book and explains a disabled analysis', async () => {
    const uninstall = installMiniDom(); vi.useFakeTimers();
    vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout });
    const startQuickTasks = vi.fn(), startWholeBook = vi.fn(), openComposer = vi.fn(), configure = vi.fn();
    const projection = composeTaskOverview({ groups: [], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const updates = {
      blockedByActiveRun: false,
      actions: {
        'sync-current': { label: '同步到当前稿件', available: true, goal: '同步', unavailableReason: null },
        'reanalyze-book': { label: '重新分析全书', available: true, goal: '全书', unavailableReason: null },
      },
    };
    let first = true;
    const panel = mountTaskPanel({ api: {
      inspectTaskOverview: async () => ({ ...projection, quickStarts: [
        { bookId: 'book', procedureId: 'rule:sync', label: '同步规则' }, { bookId: 'other', procedureId: 'other', label: '其他规则' },
      ] }),
      inspectBaselineAnalysis: async () => ({ actions: { canPrepare: true }, updateControls: first ? null : updates }),
      inspectBookTasks: async () => ({ bookId: 'book', running: false, groups: [] }), startQuickTasks,
    } as unknown as RendererApi, startWholeBook, openComposer, configure, onRecorded: vi.fn(), parked: () => null,
    settle: async () => true, setStatus: vi.fn(), errorMessage: () => '' } as unknown as Parameters<typeof mountTaskPanel>[0]);
    const entry = (id: string) => panel.element.querySelector<HTMLButtonElement>(`[data-task-compose-action="${id}"]`);
    try {
      panel.show('book'); await vi.advanceTimersByTimeAsync(0);
      expect(panel.element.querySelector('[data-task-overview-start]') === null).toBe(true);
      expect(entry('other')).toBeNull();
      for (const id of ['compose', 'review', 'writing', 'initial-evaluation', 'rule:sync', 'first-baseline']) {
        entry(id)!.click(); await vi.advanceTimersByTimeAsync(0);
      }
      expect(openComposer).toHaveBeenCalledTimes(1);
      expect(configure.mock.calls).toEqual([['book', 'review'], ['book', 'writing']]);
      expect(startQuickTasks.mock.calls).toEqual(['initial-evaluation', 'rule:sync'].map(procedureId => [{ tasks: [{ bookId: 'book', procedureId }] }]));
      expect(startWholeBook).toHaveBeenCalledWith({ goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, quick: null });
      first = false; panel.refresh(); await vi.advanceTimersByTimeAsync(0);
      for (const mode of ['sync-current', 'reanalyze-book'] as const) {
        entry(mode)!.click(); await vi.advanceTimersByTimeAsync(0);
        expect(startWholeBook).toHaveBeenLastCalledWith({ goal: updates.actions[mode].goal, update: { mode, selectedRange: null }, quick: null });
      }
      Object.assign(updates.actions['sync-current'], { available: false, unavailableReason: '稿件尚未改变。' });
      panel.refresh(); await vi.advanceTimersByTimeAsync(0);
      expect(entry('sync-current')?.disabled).toBe(true);
      expect(entry('sync-current')?.textContent).toContain('稿件尚未改变。');
    } finally { panel.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); uninstall(); }
  });
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
      // The pill is 待我处理's word for the same record (Issue #1680).
      expect(card.querySelector('.task-overview-card-title .state-term')!.textContent).toBe(state === 'analysis-waiting-network' ? '等待网络' : state === 'analysis-waiting-connection' ? '需要处理模型连接' : state === 'analysis-waiting-admission' ? '等待开始前检查' : '已联网 · 等待开始');
      expect(card.querySelector('[data-task-action="cancel"]')!.textContent).toBe('取消任务');
    } finally { uninstall(); }
  });
  it('keeps a stopped dialogue available to continue in the paused group', () => {
    const original = { ...task('recent', 'dialogue-stopped', 'dialogue'), object: { kind: 'dialogue' as const, question: '核对人名' }, target: { kind: 'dialogue' as const, bookId: 'book', dialogueId: 'dialogue' } };
    const projection = composeTaskOverview({ groups: [{ key: 'recent', items: [original], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const uninstall = installMiniDom();
    try { expect(taskOverviewCard(projection.groups[3]!.items[0]!, vi.fn()).querySelector('[data-task-action="resume"]')).not.toBeNull(); }
    finally { uninstall(); }
  });
  it('keeps context and controls in one header and opens 重新开始… of a finished plan in its drawer, sending nothing (Issue #1680)', async () => {
    const uninstall = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => {} });
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ book: 'all', type: 'all', time: 'all' }) });
    const original = { ...task('recent', 'analysis-completed', 'older'), at: new Date().toISOString() };
    const projection = composeTaskOverview({ groups: [{ key: 'recent', items: [original], total: 1 }], actionableCount: 0, running: false, processing: { state: 'local' } }, 2, () => null);
    const startQuickTasks = vi.fn(async () => ({}));
    const root = document.createElement('section');
    const openTarget = vi.fn();
    const surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => projection, taskOverviewCall: async () => ({ bookId: original.book!.bookId, ...projection.groups[4]!.items[0]!.plan, relaunch: {} }), startQuickTasks } as unknown as RendererApi, setStatus: vi.fn(), openTarget, openBook: vi.fn(), openResult: vi.fn() });
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(root.querySelector('.task-overview-context')?.parentElement).toBe(root.querySelector('.task-overview-heading-row'));
      const redo = root.querySelector<HTMLButtonElement>('[data-task-action="redo"]')!;
      expect(redo.textContent).toBe('重新开始…');
      redo.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(openTarget).toHaveBeenCalledWith(projection.groups[4]!.items[0], 'redo');
      expect(startQuickTasks).not.toHaveBeenCalled();
    } finally { surface.destroy(); vi.unstubAllGlobals(); uninstall(); }
  });
  it('counts the header by the Book the page shows and returns a filter on a Book that is gone to 全部 (Issue #1668)', async () => {
    const uninstall = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => {} });
    const stored = { value: JSON.stringify({ book: 'other', type: 'all', time: 'all' }) };
    vi.stubGlobal('localStorage', { getItem: () => stored.value, setItem: (_key: string, value: string) => { stored.value = value; } });
    const inBook = (item: GlobalAttentionItemProjection, bookId: string): GlobalAttentionItemProjection => ({ ...item, book: { bookId, title: bookId }, target: { kind: 'analysis', bookId, taskIntentId: item.itemId } });
    // 「book」 runs one task and queues one; 「other」 queues one, and one of its tasks is paused while the service still lists it as running.
    const items = [task('active', 'analysis-running', 'run'), task('active', 'analysis-waiting-capacity', 'wait'),
      inBook(task('active', 'analysis-waiting-capacity', 'other-wait'), 'other'), inBook(task('active', 'analysis-pausing', 'other-pausing'), 'other')];
    const books = [{ bookId: 'book', title: '任务总览' }, { bookId: 'other', title: '另一本' }];
    let projection = composeTaskOverview({ groups: [{ key: 'active', items, total: items.length }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2,
      (id) => id === 'wait' ? 1 : id === 'other-wait' ? 2 : null, undefined, books);
    const root = document.createElement('section');
    const surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => projection } as unknown as RendererApi, setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
    const header = (): string => root.querySelector('.task-overview-context')!.textContent!;
    const cards = (): string[] => Array.from(root.querySelectorAll<HTMLElement>('[data-task-item]'), (card) => card.dataset['taskItem']!);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(header()).toBe('所选图书 · 同时运行 0 项 · 排队 1 项 · 上限 2');
      expect(cards().sort()).toEqual(['other-pausing', 'other-wait']);
      // 「other」 is deleted: the page shows every Book again, and remembers that.
      projection = { ...projection, books: [books[0]!], groups: projection.groups.map((group) => ({ ...group, items: group.items.filter((item) => item.bookId === 'book') })) };
      surface.refresh();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(header()).toBe('全部图书 · 同时运行 1 项 · 排队 1 项 · 上限 2');
      expect(cards().sort()).toEqual(['run', 'wait']);
      expect(JSON.parse(stored.value)).toMatchObject({ book: 'all' });
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
    // Recency is explicit: construction crossing a clock tick must not change the expected history order.
    const items = [task('active', 'analysis-waiting-capacity', 'second'), task('active', 'analysis-waiting-capacity', 'first'),
      { ...task('recent', 'analysis-completed', 'done'), at: '2026-11-16T00:00:02Z' },
      { ...task('recent', 'analysis-cancelled', 'cancelled'), at: '2026-11-16T00:00:01Z' }];
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
        ['decisions', 'analysis-clarification', ['answer', 'redo', 'cancel']], ['active', 'analysis-paused', ['resume', 'redo', 'cancel']],
        ['recent', 'analysis-completed', ['result', 'redo']],
      ] as const;
      for (const [group, state, actions] of cases) {
        const item = task(group, state, 'b0000000-0000-4000-8000-000000000001');
        const attention: GlobalAttentionProjection = { groups: [{ key: group, items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } };
        const projected = composeTaskOverview(attention, 2, () => state === 'analysis-waiting-capacity' ? 1 : null).groups.flatMap((group) => group.items)[0]!;
        const act = vi.fn(); const card = taskOverviewCard(projected, act, false, projected.plan !== null);
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
