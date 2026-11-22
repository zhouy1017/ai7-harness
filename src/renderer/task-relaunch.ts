import { createLaunchBarPresentation, mountLaunchBar, syncLaunchModelSettings, type LaunchBar, type LaunchBarApi, type MountLaunchBarOptions, type TaskLaunchRequest } from './components/launch-bar.js';
import { createDispatchChooser } from './components/dispatch-chooser.js';
import type { RendererApi, TaskLaunchPreviewInput, TaskPlanKind, TaskPlanProjection } from '../shared/protocol.js';
import type { TaskPlanRelaunchProjection, TaskRelaunchCancellation } from '../shared/protocol/task-plan.js';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';

/**
 * 重新开始… (Issue #1680; item 5.6 of #1539): a new Task from the plan's `relaunch` recipe, in the shared launch bar with the
 * 模型 / 思考强度 chooser, 选项 and 先看计划. The recipe's source is copied unchanged; its `cancelsFirst` request is sent only when
 * 开始 is pressed (once, also across a transport retry), and a recipe that carries finished work and is refused a preview before
 * that cancellation offers the cancellation first, then the preview. Nothing is cancelled before the editor asks.
 */
export const RELAUNCH_PREVIEW_CANCEL_REQUIRED = 'TASK_RELAUNCH_PREVIEW_CANCEL_REQUIRED';
export const RELAUNCH_STALE = 'TASK_RELAUNCH_STALE';
export const TASK_RELAUNCH_START = '开始';
export const TASK_RELAUNCH_KEPT_HEADING = '重新开始后';
export const TASK_RELAUNCH_CANCEL_FIRST = '取消任务';
export const TASK_RELAUNCH_CANCELLED = '已取消这项任务，可以查看重新开始后的计划。';

export type RelaunchApi = LaunchBarApi & Pick<RendererApi, 'launchReviewRun' | 'cancelReviewRun' | 'cancelBaselineAnalysisRun' | 'cancelWaitingBaselineAnalysis' | 'cancelWaitingTask' | 'controlTaskRun' | 'inspectTaskPlan'>;

export interface MountRelaunchOptions extends Omit<MountLaunchBarOptions, 'api' | 'request'> {
  readonly api: RelaunchApi;
  readonly plan: TaskPlanProjection;
  readonly relaunch: TaskPlanRelaunchProjection;
  readonly title: string;
  errorCode(error: unknown): string | null;
  /** The source moved (`TASK_RELAUNCH_STALE`): the plan is read again, the refusal said beside it. */
  onStale(message: string): void;
}

export interface Relaunch {
  /** Above the bar's own body: what the new Task keeps, and the cancellation a refused preview asks for first. */
  readonly lead: ReadonlyArray<HTMLElement>;
  readonly bar: LaunchBar;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') { node.className = `${node.className} btn`.trim(); (node as HTMLButtonElement).type = 'button'; }
  return node;
}

/** The recipe's own cancellation, through the Book route that names the Book (the recipe's `bookId` is the route's). */
export async function sendRelaunchCancellation(api: RelaunchApi, cancellation: TaskRelaunchCancellation): Promise<void> {
  const { bookId: _book, ...input } = cancellation.input as typeof cancellation.input & { bookId: string };
  switch (cancellation.operation) {
    case 'cancelReviewRun': await api.cancelReviewRun(input as Parameters<RelaunchApi['cancelReviewRun']>[0]); return;
    case 'cancelBaselineAnalysisRun': await api.cancelBaselineAnalysisRun(input as Parameters<RelaunchApi['cancelBaselineAnalysisRun']>[0]); return;
    case 'cancelWaitingBaselineAnalysis': await api.cancelWaitingBaselineAnalysis(input as Parameters<RelaunchApi['cancelWaitingBaselineAnalysis']>[0]); return;
    case 'cancelWaitingTask': await api.cancelWaitingTask(input as Parameters<RelaunchApi['cancelWaitingTask']>[0]); return;
    case 'controlTaskRun': await api.controlTaskRun(input as Parameters<RelaunchApi['controlTaskRun']>[0]); return;
  }
}

/** The stopped plan's ceiling, so 本次用量 opens where it was. */
function previousCeiling(plan: TaskPlanProjection): number | null {
  if (plan.budgetStop !== null) return plan.budgetStop.maxTotalTokens;
  const ceiling = plan.edit.budget?.ceiling;
  return ceiling === undefined || ceiling === 'unset' ? null : ceiling.maxTotalTokens;
}

export function mountRelaunch(options: MountRelaunchOptions): Relaunch {
  const { api, relaunch } = options;
  let disposed = false;
  let cancelAccepted = false;
  let cancelled = false;
  let cancelling: Promise<void> | null = null;
  /**
   * The cancellation the recipe needs, sent at most once; the launch waits until it has settled — a Run that stops at its next
   * boundary reads 正在取消 a moment first, and the service accepts the recipe only once the source is terminal.
   */
  const settled = async (): Promise<void> => {
    for (let turn = 0; turn < 120; turn += 1) {
      if (disposed) throw new Error('发起栏已关闭。');
      const current = await api.inspectTaskPlan({ kind: options.plan.kind, ref: options.plan.ref });
      if (current.state.key === 'cancelled' || current.state.key === 'cancelled-after-start' ||
          current.kind === 'review-run' && current.state.key === 'stopped' && current.state.label === '已取消') return;
      if (current.state.key !== 'cancelling' && !current.runControl?.cancelling) {
        throw Object.assign(new Error('这项任务已经变化，请重新打开任务后再开始。'), { code: RELAUNCH_STALE });
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    throw new Error('任务仍在取消，请稍后重试。');
  };
  const cancelFirst = (): Promise<void> => {
    if (relaunch.cancelsFirst === null || cancelled) return Promise.resolve();
    const cancellation = relaunch.cancelsFirst;
    cancelling ??= (async () => {
      if (!cancelAccepted) {
        await sendRelaunchCancellation(api, cancellation);
        cancelAccepted = true;
      }
      await settled();
      cancelled = true;
    })().finally(() => { cancelling = null; });
    return cancelling;
  };
  const stale = (error: unknown): void => { if (!disposed && options.errorCode(error) === RELAUNCH_STALE) options.onStale(options.errorMessage(error, '这项任务已经变化，请重新打开任务后再开始。')); };

  const kept = el('section', 'task-relaunch-summary');
  kept.dataset['taskRelaunchSummary'] = '';
  const list = el('ul');
  for (const line of relaunch.summary) list.append(el('li', undefined, line));
  kept.append(el('h4', undefined, TASK_RELAUNCH_KEPT_HEADING), list);
  const first = el('section', 'task-relaunch-cancel-first');
  first.dataset['taskRelaunchCancelFirst'] = '';
  first.hidden = true;
  first.setAttribute('role', 'group');
  const firstWhy = el('p');
  const firstButton = el('button', 'secondary', TASK_RELAUNCH_CANCEL_FIRST);
  firstButton.dataset['taskDrawerControl'] = 'relaunch-cancel-first';
  first.append(firstWhy, firstButton);

  const preview = async (input: Omit<TaskLaunchPreviewInput, 'bookId'>): Promise<Awaited<ReturnType<RelaunchApi['previewTaskLaunch']>>> => {
    try { return await api.previewTaskLaunch(input); } catch (error) {
      if (!disposed && options.errorCode(error) === RELAUNCH_PREVIEW_CANCEL_REQUIRED && relaunch.cancelsFirst !== null && !cancelled) {
        firstWhy.textContent = options.errorMessage(error, '先取消这项任务，才能查看重新开始后的计划。');
        first.hidden = false;
      }
      stale(error);
      throw error;
    }
  };

  const bar = relaunch.operation === 'launchReviewRun' ? mountReviewRelaunch(options, relaunch, cancelFirst, preview, stale) : (() => {
    const launch = relaunch.operation;
    const launchApi = new Proxy(api, { get(target, key) {
      if (key === 'previewTaskLaunch') return preview;
      if (key !== launch) return Reflect.get(target, key);
      return async (input: unknown) => {
        if (disposed) throw new Error('发起栏已关闭。');
        try {
          await cancelFirst();
          if (disposed) throw new Error('发起栏已关闭。');
          return await (Reflect.get(target, key) as (value: unknown) => Promise<unknown>)(input);
        } catch (error) { stale(error); throw error; }
      };
    } });
    const { bookId: _book, ...input } = relaunch.input as typeof relaunch.input & { bookId: string };
    const ceiling = previousCeiling(options.plan);
    const request = { bookId: options.plan.bookId, operation: launch, title: options.title, startLabel: TASK_RELAUNCH_START,
      input: { ...input, ...(ceiling === null ? {} : { planEdits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: ceiling } } }) } } as TaskLaunchRequest;
    return mountLaunchBar({ ...options, api: launchApi, request });
  })();

  firstButton.addEventListener('click', () => {
    if (disposed || firstButton.disabled) return;
    firstButton.disabled = true;
    void cancelFirst().then(() => {
      if (disposed) return;
      first.hidden = true;
      options.setStatus(TASK_RELAUNCH_CANCELLED, 'success');
      options.onRecorded(options.plan.kind, options.plan.bookId, options.plan.ref);
      return bar.openPlan();
    }, (error: unknown) => { if (disposed) return; firstWhy.textContent = options.errorMessage(error, '无法取消这项任务。'); stale(error); }).finally(() => { firstButton.disabled = false; });
  });
  return { lead: [kept, first], bar: { ...bar,
    dispose() { disposed = true; bar.dispose(); },
    interrupt() { disposed = true; bar.interrupt(); },
  } };
}

/** 审阅's relaunch: the same bar, composed from the shared presentation and chooser, for `launchReviewRun`. */
function mountReviewRelaunch(options: MountRelaunchOptions, relaunch: Extract<TaskPlanRelaunchProjection, { operation: 'launchReviewRun' }>, cancelFirst: () => Promise<void>,
  preview: (input: Omit<TaskLaunchPreviewInput, 'bookId'>) => ReturnType<RelaunchApi['previewTaskLaunch']>, stale: (error: unknown) => void): LaunchBar {
  const { api } = options;
  let stopped = false, launching = false, settingsRead = false, previewVersion = 0;
  let executionConfig: RuntimeExecutionConfig = {}; let rememberedChoice = false; let commandId = crypto.randomUUID();
  const description = el('p', undefined, '开始时使用当前稿件，并固定本次任务的模型与思考强度。');
  const usage = el('div'); usage.textContent = '计划预览按当前稿件和本次选项计算，不记录任务；开始时固定当前稿件。';
  const refreshPreview = el('button', '', '更新计划'); refreshPreview.dataset['taskDrawerControl'] = 'preview-launch';
  const planContent = el('div'); planContent.append(usage, refreshPreview);
  const timing = el('select'); timing.dataset['taskStartWhen'] = ''; timing.setAttribute('aria-label', '开始时间');
  for (const [value, label] of [['now', '立即'], ['when-online', '联网后开始任务']] as const) { const option = el('option', undefined, label); option.value = value; timing.append(option); }
  const timingRow = el('label', undefined, '开始时间'); timingRow.append(timing, el('small', undefined, '只安排这一次任务的开始时间。'));
  const chooser = createDispatchChooser({ role: 'main-editorial', changed(config) { executionConfig = config; rememberedChoice = false; commandId = crypto.randomUUID(); previewVersion += 1; } });
  const start = el('button', 'primary', TASK_RELAUNCH_START); start.dataset['taskDrawerControl'] = 'launch'; start.disabled = true;
  const problem = el('p', 'task-bar-refusal'); problem.setAttribute('role', 'status');
  const syncStart = (): void => { start.disabled = stopped || options.interrupted || !settingsRead || launching; };
  timing.addEventListener('change', () => { commandId = crypto.randomUUID(); previewVersion += 1; });
  const input = () => {
    const { bookId: _book, ...rest } = relaunch.input;
    return { ...rest, ...(timing.value === 'when-online' ? { startWhen: 'when-online' as const } : {}), clientCommandId: commandId, executionConfig, rememberedChoice };
  };
  const openPlan = async (): Promise<void> => {
    if (stopped || launching || refreshPreview.disabled) return;
    estimate.open = true;
    const version = previewVersion;
    refreshPreview.disabled = true;
    try {
      if (!await options.settle() || stopped || version !== previewVersion) return;
      const shown = await preview({ launch: { operation: 'launchReviewRun', input: input() } });
      if (stopped || version !== previewVersion) return;
      const steps = el('ol'); for (const step of shown.steps) steps.append(el('li', undefined, step));
      usage.replaceChildren(el('p', undefined, `处理范围：${shown.scope}`), steps, ...shown.reference.map(line => el('p', undefined, `允许参考：${line}`)),
        el('p', undefined, `会发送：${shown.send}`), el('p', undefined, shown.usage), ...shown.adaptations.map(line => el('p', undefined, line)));
    } catch (error) { if (!stopped && version === previewVersion) usage.textContent = options.errorMessage(error, '计划暂时无法读取；仍可直接开始任务。'); }
    finally { refreshPreview.disabled = stopped || launching; }
  };
  refreshPreview.addEventListener('click', () => void openPlan());
  const begin = async (): Promise<void> => {
    if (stopped || start.disabled) return;
    const request = input();
    const controls = [timing, refreshPreview, ...chooser.element.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button,input')];
    const disabled = controls.map(control => control.disabled);
    for (const control of controls) control.disabled = true;
    launching = true; syncStart(); problem.textContent = '';
    const restore = (): void => {
      controls.forEach((control, index) => { control.disabled = disabled[index]!; });
      refreshPreview.disabled = false;
      launching = false; syncStart();
    };
    try {
      if (!(await options.settle())) { if (!stopped) restore(); return; }
      if (stopped) return;
      await cancelFirst();
      if (stopped) return;
      const result = await api.launchReviewRun(request);
      if (stopped) return;
      const reviewRunId = result.run?.reviewRunId;
      if (reviewRunId === undefined) throw new Error('无法开始任务。');
      options.onRecorded('review-run' as TaskPlanKind, options.plan.bookId, reviewRunId);
      options.setStatus(result.launchNotice ?? '已开始任务', 'success');
      if (!stopped) options.openRun(options.plan.bookId, 'review-run', reviewRunId, result.launchNotice);
    } catch (error) {
      stale(error);
      if (!stopped) { restore(); problem.textContent = options.errorMessage(error, '无法开始任务。'); }
    }
  };
  start.addEventListener('click', () => void begin());
  const presentation = createLaunchBarPresentation(chooser.element, start, { title: '选项', content: timingRow }, planContent, options.openSettings);
  const estimate = presentation.querySelector<HTMLDetailsElement>('.task-launch-estimate')!;
  estimate.addEventListener('toggle', () => { if (estimate.open && !refreshPreview.disabled) void openPlan(); });
  void Promise.allSettled([api.getModelServiceSettings(), api.getPreferences()]).then(([settings, preferences]) => {
    if (stopped) return;
    executionConfig = preferences.status === 'fulfilled' ? preferences.value.values['model.dispatchChoices']['review-run'] ?? {} : {};
    rememberedChoice = Object.keys(executionConfig).length > 0;
    if (settings.status === 'fulfilled') chooser.render(settings.value, preferences.status === 'fulfilled' ? preferences.value.values['model.favourites'] : {}, executionConfig);
    else chooser.unavailable();
    syncLaunchModelSettings(presentation);
  }).finally(() => { settingsRead = true; syncStart(); });
  return {
    body: [description], bar: [presentation, problem], start: begin, openPlan,
    interrupt() { stopped = true; start.disabled = true; refreshPreview.disabled = true; },
    sync() { syncStart(); },
    dispose() { stopped = true; },
  };
}
