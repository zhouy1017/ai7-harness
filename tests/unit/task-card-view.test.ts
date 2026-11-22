import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { taskCardView, TASK_PAGE_GROUP_LABELS, TASK_PANEL_GROUP_LABELS } from '../../src/renderer/task-card-view.js';
import { mountTaskOverview, taskOverviewCard } from '../../src/renderer/tasks-overview.js';
import { globalAttentionStateLabel } from '../../src/renderer/global-attention-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { composeTaskOverview } from '../../src/service/task-overview.js';
import type { GlobalAttentionGroupKey, GlobalAttentionItemProjection, GlobalAttentionStateKey, RendererApi, ResumableStopReason, TaskOverviewItemProjection } from '../../src/shared/protocol.js';

/** Every state a task card can carry, with the 待我处理 group the service files it under. */
const CARD_STATES: ReadonlyArray<readonly [GlobalAttentionStateKey, GlobalAttentionGroupKey]> = [
  ['analysis-running', 'active'], ['review-running', 'active'], ['analysis-cancelling', 'active'], ['analysis-pausing', 'active'],
  ['analysis-paused', 'active'], ['analysis-resumable', 'active'], ['analysis-yielded', 'active'], ['review-continuable', 'active'],
  ['analysis-queued', 'active'], ['analysis-waiting-capacity', 'active'], ['analysis-waiting-slot', 'active'], ['analysis-waiting-idle', 'active'],
  ['analysis-waiting-network', 'active'], ['analysis-waiting-connection', 'active'], ['analysis-waiting-admission', 'active'],
  ['analysis-failed', 'exceptions'], ['analysis-interrupted', 'exceptions'], ['analysis-orphaned', 'exceptions'], ['analysis-blocked', 'exceptions'],
  ['analysis-budget-reached', 'exceptions'], ['analysis-account-limit', 'exceptions'], ['analysis-outcome-unknown', 'exceptions'],
  ['analysis-outcome-unconfirmed', 'exceptions'], ['review-failed', 'exceptions'], ['review-stopped', 'exceptions'],
  ['analysis-plan-revision', 'decisions'], ['analysis-plan-moved', 'decisions'], ['analysis-clarification', 'decisions'],
  ['analysis-prepared', 'decisions'], ['review-prepared', 'decisions'],
  ['analysis-completed', 'recent'], ['analysis-completed-with-gaps', 'recent'], ['review-completed', 'recent'], ['analysis-cancelled', 'recent'],
];
const DIALOGUE_STATES: ReadonlyArray<readonly [GlobalAttentionStateKey, GlobalAttentionGroupKey]> = [
  ['dialogue-answering', 'active'], ['dialogue-stopped', 'active'], ['dialogue-answered', 'recent'], ['dialogue-interrupted', 'recent'], ['dialogue-failed', 'recent'],
];
const REASONS: ReadonlyArray<ResumableStopReason | undefined> = [undefined, 'proxy-unreachable', 'model-service-unreachable', 'outcome-unknown', 'shutdown'];

function attention(state: GlobalAttentionStateKey, group: GlobalAttentionGroupKey, facts: Partial<GlobalAttentionItemProjection['facts']> = {}): GlobalAttentionItemProjection {
  const dialogue = state.startsWith('dialogue-');
  return { itemId: `item-${state}`, group, state, blocked: group === 'exceptions', at: '2026-11-21T08:05:00.000Z', book: { bookId: 'book', title: '公开样例' },
    object: dialogue ? { kind: 'dialogue', question: '核对人名' } : { kind: 'analysis', mode: 'first-baseline' },
    facts: { progress: null, categories: [], revisionOrdinal: null, ...facts }, nextStep: 'view-run',
    target: dialogue ? { kind: 'dialogue', bookId: 'book', dialogueId: 'dialogue' } : { kind: 'analysis', bookId: 'book', taskIntentId: '00000000-0000-4000-8000-000000000002' },
    technical: [{ key: 'run-record', label: '运行', value: 'run' }] };
}
function card(item: GlobalAttentionItemProjection, position: number | null = null): TaskOverviewItemProjection {
  return composeTaskOverview({ groups: [{ key: item.group, items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => position)
    .groups.flatMap((group) => group.items)[0]!;
}

beforeEach(() => setTechnicalLayerVisible(false));
afterEach(() => setTechnicalLayerVisible(true));

describe('the task card view (Issue #1680)', () => {
  it('says every state in 待我处理\'s words, places it, and leaves no state without a way on', () => {
    const rows: Array<[string, string, string, string, string]> = [];
    for (const [state, group] of [...CARD_STATES, ...DIALOGUE_STATES]) {
      for (const stopReason of ['analysis-paused', 'analysis-resumable', 'analysis-blocked'].includes(state) ? REASONS : [undefined]) {
        for (const resumeFailure of state === 'analysis-resumable' || state === 'analysis-paused' ? [undefined, '模型服务暂时不可用。'] : [undefined]) {
          const item = card(attention(state, group, { ...(stopReason === undefined ? {} : { stopReason }), ...(resumeFailure === undefined ? {} : { resumeFailure }) }));
          const view = taskCardView(item, item.plan !== null);
          const label = `${state}/${stopReason ?? '-'}/${resumeFailure ? 'failure' : '-'}`;
          expect(view.pill, label).toBe(globalAttentionStateLabel(item.attention));
          expect(view.pill, label).not.toBe('等你处理');
          if (view.line.includes('你在')) expect([state, stopReason, resumeFailure], label).toEqual(['analysis-paused', undefined, undefined]);
          if (state === 'analysis-pausing' || state === 'analysis-cancelling') expect(view.actions, label).toEqual([]);
          else expect(view.actions.length, label).toBeGreaterThan(0);
          rows.push([label, view.pageGroup, view.pill, view.line, view.actions.map((entry) => entry.label).join(' · ')]);
        }
      }
    }
    const row = (label: string) => rows.find(([name]) => name === label)!;
    expect(row('analysis-paused/-/-')).toEqual(['analysis-paused/-/-', 'stopped', '已暂停', `你在 ${new Date('2026-11-21T08:05:00.000Z').toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 暂停；继续时接着处理。`, '继续 · 重新开始… · 取消任务']);
    expect(row('analysis-paused/shutdown/-').slice(1)).toEqual(['stopped', '已暂停', 'AI7 关闭时这项任务还没有做完；已完成的部分都已保存，继续时接着处理，也可以取消它。', '继续 · 重新开始… · 取消任务']);
    expect(row('analysis-resumable/shutdown/-').slice(1)).toEqual(['stopped', '任务已中断 · AI7 关闭时正在运行', 'AI7 关闭时任务尚未完成，继续时接着处理未完成的部分。', '继续 · 重新开始… · 取消任务']);
    expect(row('analysis-resumable/proxy-unreachable/-').slice(1)).toEqual(['stopped', '任务已中断 · 代理不可达', '代理不可达：去 设置 › 模型服务 › 网络代理 检查代理后继续。', '去设置 › 模型服务 › 网络代理 · 继续 · 重新开始… · 取消任务']);
    expect(row('analysis-resumable/model-service-unreachable/-').slice(1, 3)).toEqual(['stopped', '任务已中断 · 模型服务不可达']);
    expect(row('analysis-resumable/model-service-unreachable/failure')[3]).toBe('模型服务暂时不可用。');
    expect(row('analysis-resumable/outcome-unknown/-')[4]).toBe('查看未确认的部分 · 取消任务');
    expect(row('analysis-yielded/-/-').slice(1, 3)).toEqual(['stopped', '让位给你的任务']);
    expect(row('review-continuable/-/-').slice(1, 3)).toEqual(['stopped', '中途停止 · 可继续审阅']);
    expect(row('analysis-cancelling/-/-').slice(1, 3)).toEqual(['running', '正在取消']);
    expect(row('analysis-pausing/-/-').slice(1, 3)).toEqual(['stopped', '正在暂停']);
    expect(row('analysis-running/-/-')[4]).toBe('暂停 · 取消任务');
    expect(row('analysis-blocked/shutdown/-').slice(1)).toEqual(['pending', '没有开始', 'AI7 关闭时这项任务还在排队，没有开始，也没有发送任何内容。', '重新开始… · 取消任务']);
    expect(row('analysis-blocked/-/-')[3]).toBe('模型服务当前不可用，任务尚未开始。');
    expect(row('analysis-failed/-/-').slice(1, 3)).toEqual(['pending', '运行失败']);
    expect(row('analysis-failed/-/-')[4]).toBe('重新开始…');
    expect(row('analysis-outcome-unknown/-/-')[4]).toBe('查看未确认的部分 · 取消任务');
    expect(row('analysis-clarification/-/-')[4]).toBe('回答 · 重新开始… · 取消任务');
    expect(row('analysis-completed/-/-').slice(1, 3)).toEqual(['recent', '已完成']);
    expect(row('analysis-completed/-/-')[4]).toBe('查看结果 · 重新开始…');
    expect(row('dialogue-answering/-/-')[4]).toBe('暂停 · 取消任务');
    expect(row('dialogue-failed/-/-')[4]).toBe('查看结果 · 重新回答');
    expect(Object.values(TASK_PAGE_GROUP_LABELS)).toEqual(['待处理', '正在运行', '排队中', '已暂停或中断', '最近完成']);
    expect(Object.values(TASK_PANEL_GROUP_LABELS)).toEqual(['待处理', '进行中', '最近完成']);
  });

  it('keeps 上移 and 置顶 for a queue position, and no 重新开始… for a fixed task', () => {
    expect(taskCardView(card(attention('analysis-waiting-capacity', 'active'), 2)).actions.map((entry) => entry.action)).toEqual(['up', 'top', 'cancel']);
    const fixed = { ...card(attention('analysis-completed', 'recent')), plan: { kind: 'fixed-task' as const, ref: 'fixed' } };
    expect(taskCardView(fixed).actions.map((entry) => entry.action)).toEqual(['result']);
  });
});

describe('the card\'s actions (Issue #1680)', () => {
  let uninstall = (): void => undefined;
  let surface: { destroy(): void } | null = null;
  beforeEach(() => { uninstall = installMiniDom(); });
  afterEach(() => { surface?.destroy(); surface = null; vi.unstubAllGlobals(); uninstall(); });

  async function mount(items: GlobalAttentionItemProjection[], call: RendererApi['taskOverviewCall'] = vi.fn(async request => ({ bookId: request.bookId, ...request.input, relaunch: {} }) as never), position: number | null = null) {
    vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined });
    vi.stubGlobal('HTMLSelectElement', class {});
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ type: 'all', time: 'all' }), setItem: () => undefined });
    const projection = composeTaskOverview({ groups: [{ key: 'active', items, total: items.length }], actionableCount: 0, running: true, processing: { state: 'local' } }, 2, () => position);
    const root = document.createElement('section'); miniDocument.body.append(root as never);
    const options = { root, api: { inspectTaskOverview: async () => projection, taskOverviewCall: call, reorderQueuedRun: vi.fn() } as unknown as RendererApi,
      setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn(), openRecord: vi.fn(), openNetworkProxySettings: vi.fn() };
    surface = mountTaskOverview(options);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { root: root as unknown as MiniElement, options, call: call as ReturnType<typeof vi.fn> };
  }
  const press = (root: MiniElement, action: string) => root.querySelector(`[data-task-action="${action}"]`)!.click();

  it('sends each action\'s one request and nothing more for a second press while it is in flight', async () => {
    let release!: () => void;
    const call = vi.fn(() => new Promise((resolve) => { release = () => resolve({}); })) as unknown as RendererApi['taskOverviewCall'];
    const { root, call: sent } = await mount([attention('analysis-running', 'active')], call);
    press(root, 'pause'); press(root, 'pause');
    expect(sent.mock.calls).toEqual([[{ operation: 'pauseBaselineAnalysisRun', bookId: 'book', input: { taskIntentId: '00000000-0000-4000-8000-000000000002' } }]]);
    release(); await new Promise((resolve) => setTimeout(resolve, 0));
    const paused = await mount([attention('analysis-paused', 'active')]);
    press(paused.root, 'resume');
    expect(paused.call.mock.calls.at(-1)![0]).toMatchObject({ operation: 'resumeBaselineAnalysisRun' });
  });

  it('cancels what has sent nothing in one press, and a started Run through its plan\'s impact summary — by button and by Delete', async () => {
    const queued = await mount([attention('analysis-waiting-capacity', 'active')], undefined, 1);
    press(queued.root, 'cancel');
    expect(queued.call.mock.calls[0]![0]).toEqual({ operation: 'cancelWaitingBaselineAnalysis', bookId: 'book', input: { taskIntentId: '00000000-0000-4000-8000-000000000002' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queued.options.setStatus).toHaveBeenCalledWith('已取消 · 未发送任何内容', 'success');
    expect(queued.root.querySelector('.task-overview-confirm')).toBeNull();
    surface?.destroy();
    const resumedQueue = await mount([attention('analysis-queued', 'active')], undefined, 1);
    press(resumedQueue.root, 'cancel');
    expect(resumedQueue.options.openTarget).toHaveBeenCalledWith(expect.anything(), 'cancel');
    expect(resumedQueue.call).not.toHaveBeenCalled();
    surface?.destroy();
    const running = await mount([attention('analysis-running', 'active')]);
    press(running.root, 'cancel');
    expect(running.call).not.toHaveBeenCalled();
    expect(running.options.openTarget).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-analysis-running' }), 'cancel');
    const node = running.root.querySelector('[data-task-item]')!;
    node.focus();
    running.root.dispatchEvent({ type: 'keydown', key: 'Delete', target: node, bubbles: true, preventDefault() {} } as never);
    expect(running.options.openTarget).toHaveBeenCalledTimes(2);
    expect(running.call).not.toHaveBeenCalled();
  });

  it('opens 重新开始… in the plan, 继续 of a half-way 审阅 on its page, and the proxy setting, sending nothing', async () => {
    const proxy = await mount([attention('analysis-resumable', 'active', { stopReason: 'proxy-unreachable' })]);
    press(proxy.root, 'proxy'); press(proxy.root, 'redo');
    expect(proxy.options.openNetworkProxySettings).toHaveBeenCalledOnce();
    expect(proxy.options.openTarget).toHaveBeenCalledWith(expect.anything(), 'redo');
    expect(proxy.call.mock.calls.map(([input]) => input.operation)).toEqual(['inspectTaskPlan']);
    surface?.destroy();
    const review = { ...attention('review-continuable', 'active'), target: { kind: 'review' as const, bookId: 'book', reviewRunId: '00000000-0000-4000-8000-000000000009' } };
    const continued = await mount([review]);
    press(continued.root, 'resume');
    expect(continued.options.openRecord).toHaveBeenCalledOnce();
    press(continued.root, 'cancel');
    expect(continued.options.openTarget).toHaveBeenCalledWith(expect.anything(), 'cancel');
    expect(continued.call.mock.calls.map(([input]) => input.operation)).toEqual(['inspectTaskPlan']);
  });

  it.each(['analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-admission'] as const)('routes %s only to the predispatch cancellation for the selected Book', async state => {
    for (const kind of ['baseline-analysis', 'writing'] as const) {
      const original = attention(state, 'active');
      const item = kind === 'baseline-analysis' ? original : { ...original, target: { kind: 'task-plan' as const, bookId: 'book', taskKind: kind, ref: 'waiting' } };
      const { root, call } = await mount([item]);
      press(root, 'cancel');
      expect(call.mock.calls.map(([request]) => [request.operation, request.bookId])).toEqual([[kind === 'baseline-analysis' ? 'cancelWaitingBaselineAnalysis' : 'cancelWaitingTask', 'book']]);
      surface?.destroy();
    }
  });

  it('reports a wait that raced with Start without falling back to a started-run cancellation', async () => {
    const call = vi.fn(async () => { throw new Error('任务已经开始。'); });
    const { root, options } = await mount([attention('analysis-waiting-network', 'active')], call);
    press(root, 'cancel');
    await vi.waitFor(() => expect(options.setStatus).toHaveBeenCalledWith('任务已经开始。', 'error'));
    expect(call).toHaveBeenCalledOnce();
    expect(options.openTarget).not.toHaveBeenCalled();
  });

  it('offers relaunch only for the inspected source and exposes the unconfirmed list directly', async () => {
    const sources = [attention('analysis-outcome-unconfirmed', 'exceptions'), { ...attention('analysis-outcome-unconfirmed', 'exceptions'), itemId: 'older', target: { kind: 'analysis' as const, bookId: 'book', taskIntentId: 'older' } }];
    const lookup = vi.fn(async (request: { bookId: string; input: { kind: string; ref: string } }) => ({ bookId: request.bookId, ...request.input, relaunch: request.input.ref === 'older' ? null : {} }));
    const { root, options } = await mount(sources, lookup as unknown as RendererApi['taskOverviewCall']);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-task-item="older"]')!.querySelector('[data-task-action="redo"]')).toBeNull();
    expect(root.querySelector('[data-task-item="item-analysis-outcome-unconfirmed"]')!.querySelector('[data-task-action="redo"]')).not.toBeNull();
    press(root, 'unconfirmed');
    expect(options.openTarget).toHaveBeenCalledWith(expect.anything(), 'unconfirmed');
  });

  it('keeps the recorded reason and usage and puts the selection jump in More during cancellation', () => {
    const original = card(attention('analysis-completed-with-gaps', 'recent', { completion: { reason: '读到一处尚待确认。', total: 3, gaps: 1 } }));
    const done = taskOverviewCard({ ...original, usage: { elapsed: 120000, calls: 3 } }, vi.fn());
    expect(done.querySelector('.task-overview-card-line')?.textContent).toBe('读到一处尚待确认。');
    expect(done.querySelector('.task-overview-usage')?.textContent).toBe('用时 2 分钟 · 约 3 次调用');
    const stopped = taskOverviewCard({ ...card(attention('dialogue-failed', 'recent')), usage: original.usage ?? { elapsed: 120000, calls: 3 } }, vi.fn());
    expect(stopped.querySelector('.task-overview-usage')?.textContent).toContain('约 3 次调用');
    const selection = { ...card(attention('analysis-cancelling', 'active')), selection: { manuscriptId: 'revision', fromBlockId: 'start', toBlockId: 'end' } };
    expect(taskCardView(selection).actions).toEqual([]);
    expect(taskOverviewCard(selection, vi.fn()).querySelector('[data-task-action="jump"]')?.closest('details')).not.toBeNull();
  });

  it('drops a late clarification read after the surface is destroyed', async () => {
    let release!: (plan: unknown) => void;
    const inspect = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const { root, options } = await mount([{ ...attention('analysis-clarification', 'decisions'), nextStep: 'answer-clarification' }], inspect as unknown as RendererApi['taskOverviewCall']);
    press(root, 'answer');
    surface!.destroy();
    release({ clarifications: [] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(options.openTarget).not.toHaveBeenCalled();
    expect(root.querySelector('[data-card-answer]')).toBeNull();
  });

  it('paints, focuses and opens nothing when its answer arrives after the surface left', async () => {
    let release!: () => void;
    const call = vi.fn(() => new Promise((resolve) => { release = () => resolve({}); })) as unknown as RendererApi['taskOverviewCall'];
    const { root, options } = await mount([attention('analysis-waiting-capacity', 'active')], call, 1);
    press(root, 'cancel');
    const before = miniDocument.activeElement;
    surface!.destroy(); surface = null;
    release(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(options.setStatus).not.toHaveBeenCalled();
    expect(options.openTarget).not.toHaveBeenCalled();
    expect(miniDocument.activeElement).toBe(before);
    expect(root.querySelector('[data-task-item]')).toBeNull();
  });
});
