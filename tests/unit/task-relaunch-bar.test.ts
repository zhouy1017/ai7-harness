import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { mountRelaunch, type RelaunchApi } from '../../src/renderer/task-relaunch.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';
import type { TaskPlanProjection } from '../../src/shared/protocol.js';

const BOOK = '00000000-0000-4000-8000-000000000001';
const SOURCE = { ref: '00000000-0000-4000-8000-000000000002', runRecordId: '00000000-0000-4000-8000-000000000003', revision: 'a'.repeat(64) };
const WRITING = {
  operation: 'launchWritingTask',
  input: { bookId: BOOK, typeId: 'promotion-article', audience: '读者', channel: '本社', requirements: null, materialIds: [], relaunchOf: { kind: 'writing', ...SOURCE, cancelsFirst: true } },
  summary: ['先取消这项未完成的任务，再重新开始。', '重新开始一项新任务，沿用原来的运行选项，内容重新处理。'],
  cancelsFirst: { operation: 'controlTaskRun', input: { bookId: BOOK, kind: 'writing', ref: SOURCE.ref, action: 'cancel' } },
} as unknown as NonNullable<TaskPlanProjection['relaunch']>;
const REVIEW = {
  operation: 'launchReviewRun',
  input: { bookId: BOOK, categoryIds: ['typos-and-usage'], scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, seriesId: null, capturedProcedure: null, procedureDefinition: null, materialIds: [],
    relaunchOf: { kind: 'review-run', ref: SOURCE.ref, runRecordId: SOURCE.ref, revision: `0:0:0:${'a'.repeat(64)}`, cancelsFirst: false } },
  summary: ['重新开始一项新任务，已完成的内容不会带入。'],
  cancelsFirst: null,
} as unknown as NonNullable<TaskPlanProjection['relaunch']>;
const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

let uninstall = (): void => undefined;
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { setTechnicalLayerVisible(true); vi.unstubAllGlobals(); uninstall(); });

function mount(relaunch: NonNullable<TaskPlanProjection['relaunch']>, api: Partial<Record<keyof RelaunchApi, unknown>>, settle = async () => true) {
  const full = { getModelServiceSettings: async () => { throw new Error('none'); }, getPreferences: async () => ({ values: preferenceDefaults() }),
    previewTaskLaunch: vi.fn(async () => ({ steps: ['读稿'], scope: '全书', units: 1, reference: [], send: '稿件', usage: '用量', adaptations: [] })),
    controlTaskRun: vi.fn(async () => ({})), inspectTaskPlan: vi.fn(async () => ({ state: { key: 'cancelled-after-start' }, runControl: null })), ...api } as unknown as RelaunchApi;
  const calls = { openRun: vi.fn(), onStale: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn() };
  const plan = { ...taskPlanFixture({ kind: relaunch.operation === 'launchReviewRun' ? 'review-run' : 'writing' }), bookId: BOOK, ref: SOURCE.ref, relaunch };
  const mounted = mountRelaunch({ api: full, plan, relaunch, title: '重新开始…', interrupted: false, settle,
    errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
    errorCode: (error: unknown) => (error as { code?: string }).code ?? null, ...calls });
  const host = document.createElement('div'); host.append(...mounted.lead, ...mounted.bar.body, ...mounted.bar.bar); miniDocument.body.append(host as never);
  return { mounted, api: full, calls, host };
}
const start = () => miniDocument.querySelector('[data-task-drawer-control="launch"]')!;

describe('重新开始… (Issue #1680)', () => {
  it.each([WRITING, REVIEW])('uses the same plain estimate for $operation relaunch previews', async relaunch => {
    const sentence = '预计读 2 个部分，至少 3 次模型调用（重试时会更多）；用时暂无可靠估计。';
    const { mounted, host } = mount(relaunch, { previewTaskLaunch: vi.fn(async () => ({ steps: [], scope: '', reference: [], send: '', usage: '50000 tokens', adaptations: [],
      estimate: { parts: 2, fewestRequests: 3, more: ['retry'], ceiling: true, durationMs: null, sentence } })) });
    await mounted.bar.openPlan();
    expect(host.querySelector('.task-launch-estimate-sentence')?.textContent).toBe(sentence);
    expect(host.querySelector('.task-launch-estimate')?.textContent).not.toContain('tokens');
    mounted.bar.dispose();
  });
  it('says what is kept, cancels only when 开始 is pressed, once, and launches the copied recipe once with a new command', async () => {
    let refuse = true;
    const launchWritingTask = vi.fn(async (_input: unknown) => { if (refuse) { refuse = false; throw new Error('网络中断'); } return { taskIntentId: 'new', runRecordId: 'run' }; });
    const { api, calls, host } = mount(WRITING, { launchWritingTask });
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    for (const line of WRITING.summary) expect(host.querySelector('[data-task-relaunch-summary]')!.textContent).toContain(line);
    expect(api.controlTaskRun).not.toHaveBeenCalled();
    start().click(); start().click();
    await vi.waitFor(() => expect(host.textContent).toContain('网络中断'));
    expect(api.controlTaskRun).toHaveBeenCalledExactlyOnceWith({ kind: 'writing', ref: SOURCE.ref, action: 'cancel' });
    expect(launchWritingTask).toHaveBeenCalledOnce();
    // A transport retry keeps its command and does not cancel again.
    start().click();
    await vi.waitFor(() => expect(calls.openRun).toHaveBeenCalledWith(BOOK, 'writing', 'new', undefined));
    expect(api.controlTaskRun).toHaveBeenCalledOnce();
    const [first, second] = (launchWritingTask.mock.calls as unknown as Array<[Record<string, unknown>]>).map(([input]) => input);
    expect(second!['clientCommandId']).toBe(first!['clientCommandId']);
    const { bookId: _book, ...copied } = WRITING.input as Record<string, unknown>;
    expect(second).toMatchObject(copied);
    expect(second).not.toHaveProperty('bookId');
  });

  it('launches only once the cancellation it sent has settled', async () => {
    const inspectTaskPlan = vi.fn().mockResolvedValueOnce({ state: { key: 'cancelling' }, runControl: { cancelling: true } }).mockResolvedValue({ state: { key: 'cancelled-after-start' }, runControl: null });
    const launchWritingTask = vi.fn(async () => ({ taskIntentId: 'new', runRecordId: 'run' }));
    const { calls } = mount(WRITING, { inspectTaskPlan, launchWritingTask });
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    start().click();
    await vi.waitFor(() => expect(calls.openRun).toHaveBeenCalledOnce());
    expect(inspectTaskPlan).toHaveBeenCalledTimes(2);
    expect(inspectTaskPlan.mock.invocationCallOrder[1]!).toBeLessThan(launchWritingTask.mock.invocationCallOrder[0]!);
  });

  it.each(['read failure', 'timeout'])('retries observation after %s without sending a second accepted cancellation', async failure => {
    let terminal = false;
    vi.stubGlobal('window', { setTimeout: (callback: () => void) => queueMicrotask(callback), clearTimeout });
    const inspectTaskPlan = vi.fn(async () => {
      if (terminal) return { state: { key: 'cancelled-after-start' }, runControl: null };
      if (failure === 'read failure') throw new Error('读取失败');
      return { state: { key: 'cancelling' }, runControl: { cancelling: true } };
    });
    const launchWritingTask = vi.fn(async () => ({ taskIntentId: 'new' }));
    const { api, host } = mount(WRITING, { inspectTaskPlan, launchWritingTask });
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    start().click();
    await vi.waitFor(() => expect(host.textContent).toContain(failure === 'timeout' ? '请稍后重试' : '读取失败'));
    expect(launchWritingTask).not.toHaveBeenCalled();
    expect(inspectTaskPlan).toHaveBeenCalledTimes(failure === 'timeout' ? 120 : 1);
    terminal = true;
    start().click();
    await vi.waitFor(() => expect(launchWritingTask).toHaveBeenCalledOnce());
    expect(api.controlTaskRun).toHaveBeenCalledOnce();
  });

  it('surfaces a cancellation refusal and rereads the source without dispatching a launch', async () => {
    const refusal = coded('TASK_RELAUNCH_STALE', '这项任务已在另一处改变。');
    const controlTaskRun = vi.fn().mockRejectedValue(refusal);
    const launchWritingTask = vi.fn();
    const { calls, host } = mount(WRITING, { controlTaskRun, launchWritingTask });
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    start().click();
    await vi.waitFor(() => expect(calls.onStale).toHaveBeenCalledWith(refusal.message));
    expect(host.textContent).toContain(refusal.message);
    expect(launchWritingTask).not.toHaveBeenCalled();
  });

  it('locks the confirmed review settings at the press while manuscript edits settle', async () => {
    let settle!: (ready: boolean) => void;
    const launchReviewRun = vi.fn(async (_input: unknown) => ({ run: { reviewRunId: 'new' } }));
    const { host, calls } = mount(REVIEW, { launchReviewRun }, () => new Promise(resolve => { settle = resolve; }));
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    start().click(); start().click();
    const timing = host.querySelector<HTMLSelectElement>('[data-task-start-when]')!;
    expect(timing.disabled).toBe(true);
    timing.value = 'when-online';
    settle(true);
    await vi.waitFor(() => expect(calls.openRun).toHaveBeenCalledOnce());
    expect(launchReviewRun).toHaveBeenCalledOnce();
    expect(launchReviewRun.mock.calls[0]![0]).not.toHaveProperty('startWhen');
  });

  it('never reopens a disposed review when its preview later reports a stale source', async () => {
    let reject!: (error: Error) => void;
    const previewTaskLaunch = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
    const settle = vi.fn(async () => true);
    const { mounted, calls } = mount(REVIEW, { previewTaskLaunch }, settle);
    const pending = mounted.bar.openPlan();
    await vi.waitFor(() => expect(previewTaskLaunch).toHaveBeenCalledOnce());
    expect(settle).toHaveBeenCalledOnce();
    mounted.bar.dispose();
    reject(coded('TASK_RELAUNCH_STALE', '原任务发生变化。'));
    await pending;
    expect(calls.onStale).not.toHaveBeenCalled();
    expect(calls.openRun).not.toHaveBeenCalled();
  });

  it('offers the cancellation first when a preview needs it, then shows the preview', async () => {
    const previewTaskLaunch = vi.fn().mockRejectedValueOnce(coded('TASK_RELAUNCH_PREVIEW_CANCEL_REQUIRED', '先取消这项任务，才能查看重新开始后的计划。'))
      .mockResolvedValueOnce({ steps: ['读稿'], scope: '全书', units: 1, reference: [], send: '稿件', usage: '用量', adaptations: [] });
    const { mounted, api, host } = mount(WRITING, { previewTaskLaunch, launchWritingTask: vi.fn() });
    await mounted.bar.openPlan();
    const first = host.querySelector<HTMLElement>('[data-task-relaunch-cancel-first]')!;
    expect(first.hidden).toBe(false);
    expect(first.textContent).toContain('先取消这项任务，才能查看重新开始后的计划。');
    expect(api.controlTaskRun).not.toHaveBeenCalled();
    first.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(previewTaskLaunch).toHaveBeenCalledTimes(2));
    expect(api.controlTaskRun).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(host.textContent).toContain('处理范围：全书'));
    expect(first.hidden).toBe(true);
  });

  it('relaunches a 审阅 through launchReviewRun with the chosen start time, and re-reads a source that moved', async () => {
    const launchReviewRun = vi.fn().mockRejectedValueOnce(coded('TASK_RELAUNCH_STALE', '这项任务已经变化，请重新打开任务后再开始。'))
      .mockResolvedValueOnce({ run: { reviewRunId: 'review-new' } });
    const { calls, host } = mount(REVIEW, { launchReviewRun });
    await vi.waitFor(() => expect(start().disabled).toBe(false));
    start().click();
    await vi.waitFor(() => expect(calls.onStale).toHaveBeenCalledWith('这项任务已经变化，请重新打开任务后再开始。'));
    const timing = host.querySelector<HTMLSelectElement>('[data-task-start-when]')!;
    timing.value = 'when-online'; timing.dispatchEvent({ type: 'change', bubbles: true } as never);
    start().click();
    await vi.waitFor(() => expect(calls.openRun).toHaveBeenCalledWith(BOOK, 'review-run', 'review-new', undefined));
    const input = launchReviewRun.mock.calls[1]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ categoryIds: ['typos-and-usage'], relaunchOf: (REVIEW.input as { relaunchOf: unknown }).relaunchOf, startWhen: 'when-online' });
    expect(input).not.toHaveProperty('bookId');
    expect(input['clientCommandId']).not.toBe((launchReviewRun.mock.calls[0]![0] as Record<string, unknown>)['clientCommandId']);
  });
});
