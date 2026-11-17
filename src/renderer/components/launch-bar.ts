import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation, type RuntimeExecutionConfig, type TaskExecutionLaunchResult } from '../../shared/runtime-execution-config.js';
import type { ServiceOperationMap, TaskLaunchPreviewInput, TaskPlanKind, RendererApi } from '../../shared/protocol.js';
import type { PlanEditsProjection } from '../../shared/protocol/analysis-plan.js';
import type { PreferencesRendererApi } from '../../shared/preferences.js';
import { createDispatchChooser } from './dispatch-chooser.js';
import { evaluationMaterialsField } from '../evaluation.js';
import { similarMaterialsField } from '../task-material-selection.js';
import { identityWords } from '../technical-layer.js';
import { parseBudgetCeiling, TASK_PLAN_BUDGET_HINT, TASK_PLAN_BUDGET_INVALID } from '../task-drawer-labels.js';

/** A launch operation as the launch bar dispatches it (Issue #1545). */
export type TaskLaunchOperation = LedgerTaskLaunchOperation;
/**
 * What a surface sends to the launch bar (Issue #418 and later): the operation, its input (or a `readInput` that reads the
 * editor's live form), and `onStarted` for the surface that raised it. `title` is the drawer's own heading.
 */
export type TaskLaunchRequest = { [K in TaskLaunchOperation]: { bookId: string; operation: K; title: string;
  /** Surface behavior after the launch commits; never sent to the service. */
  onStarted?: () => void;
  readInput?: () => Omit<ServiceOperationMap[K]['input'], 'bookId' | 'clientCommandId' | 'executionConfig' | 'rememberedChoice'>;
  input: Omit<ServiceOperationMap[K]['input'], 'bookId' | 'clientCommandId' | 'executionConfig' | 'rememberedChoice'> } }[TaskLaunchOperation];

/** The members of the renderer API the launch bar itself calls; the drawer passes these in. */
export type LaunchBarApi = Pick<
  RendererApi,
  | TaskLaunchOperation
  | 'previewTaskLaunch'
  | 'inspectEvaluation'
  | 'getModelServiceSettings'
  | 'searchReferableMaterials'
> & Pick<PreferencesRendererApi, 'getPreferences'>;

export interface MountLaunchBarOptions {
  readonly api: LaunchBarApi;
  readonly request: TaskLaunchRequest;
  /** A failure's words (the drawer's `errorMessage`). */
  readonly errorMessage: (error: unknown, fallback: string) => string;
  /** The shell's status line (the drawer's `setStatus`). */
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  /** Write the manuscript's own edits before a Task Input revision is saved. */
  readonly settle: () => Promise<boolean>;
  /** The bar started the Task: the surfaces of that kind read it again. */
  readonly onRecorded: (kind: TaskPlanKind, bookId: string, ref?: string) => void;
  /** Open the started Task's running view (the drawer's `surface.open(… { view: 'run' })`). */
  readonly openRun: (bookId: string, kind: TaskPlanKind, ref: string, launchNotice?: string) => void;
  /** The local service is gone; the start button stays disabled once the settings read resolves. */
  readonly interrupted: boolean;
}

/** The launch bar the drawer mounts in place of the inline UI it used to build (Issue #1545). */
export interface LaunchBar {
  /** The drawer-body nodes, in order: description, estimate, run options, references. */
  readonly body: ReadonlyArray<HTMLElement>;
  /** The drawer-bar nodes, in order: the dispatch chooser, 开始任务, the refusal line. */
  readonly bar: ReadonlyArray<HTMLElement>;
  /** Start the Task: apply the options, settle the manuscript, then launch. */
  start(): Promise<void>;
  /** Read the launch preview again (先看计划 / 更新计划). */
  openPlan(): Promise<void>;
  /** This launch is no longer on screen: detach its listeners and stop its async work. */
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

function control(label: string, className: string, name: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset['taskDrawerControl'] = name;
  return node;
}

export function mountLaunchBar(options: MountLaunchBarOptions): LaunchBar {
  const { api, request, errorMessage, setStatus, settle, onRecorded, openRun, interrupted } = options;
  const kinds = LEDGER_TASK_LAUNCH_KINDS;
  let disposed = false;
  let executionConfig: RuntimeExecutionConfig = {}; let rememberedChoice = false;
  let commandId = crypto.randomUUID();
  let previewVersion = 0;

  const description = el('p', undefined, '开始时使用当前稿件，并固定本次任务的模型与思考强度。');
  const estimate = el('details', 'task-launch-estimate'), usage = el('div');
  const refreshPreview = control('更新计划', '', 'preview-launch');
  estimate.append(el('summary', undefined, '先看计划'), usage, refreshPreview);

  const invalidatePreview = (): void => {
    previewVersion += 1;
    usage.replaceChildren(el('p', 'task-launch-preview-stale', '选项已变化，请更新计划。'));
  };

  const runOptions = el('details', 'task-launch-options');
  runOptions.append(el('summary', undefined, '本次运行选项'));
  const budget = el('input'); budget.inputMode = 'numeric'; budget.type = 'text';
  budget.value = String(request.input.planEdits?.runBudgetCeiling?.maxTotalTokens ?? '');
  budget.dataset['taskLaunchOption'] = 'budget';
  budget.setAttribute('aria-label', '本次预算上限 · 词元（不填为不设上限）');
  const budgetLabel = el('label', undefined, '本次预算上限 · 词元（不填为不设上限）'); budgetLabel.append(budget); runOptions.append(budgetLabel);
  usage.textContent = '计划预览按当前稿件和本次选项计算，不记录任务；开始时固定当前稿件。';
  runOptions.append(el('p', 'field-note', TASK_PLAN_BUDGET_HINT));
  const baselineOptions = request.operation === 'launchBaselineAnalysis';
  const retry = el('select'); retry.dataset['taskLaunchOption'] = 'retry'; retry.setAttribute('aria-label', '遇到可重试的失败');
  for (const [value, label] of [['auto', '自动重试'], ['ask-first', '先问我'], ['never', '不重试']]) {
    if (value === 'ask-first' && !baselineOptions) continue;
    const option = el('option', undefined, label); option.value = value!; retry.append(option);
  }
  retry.value = request.input.planEdits?.askFirstAdaptations?.includes('safe-retry') ? 'ask-first' : request.input.planEdits?.disallowedAdaptations.includes('safe-retry') ? 'never' : 'auto';
  const sampling = el('input'); sampling.type = 'checkbox'; sampling.dataset['taskLaunchOption'] = 'sampling';
  sampling.checked = !request.input.planEdits?.removedSteps.includes('assurance-sampling');
  const retryLabel = el('label', undefined, '遇到可重试的失败'); retryLabel.append(retry);
  runOptions.append(retryLabel);
  if (baselineOptions) {
    const samplingLabel = el('label', undefined, '完成后核对与抽检'); samplingLabel.prepend(sampling);
    runOptions.append(samplingLabel);
  }
  for (const event of ['input', 'change']) runOptions.addEventListener(event, () => { commandId = crypto.randomUUID(); });
  const timing = el('select'); timing.dataset['taskStartWhen'] = ''; timing.setAttribute('aria-label', '开始时间');
  for (const [value, label] of [['now', '立即'], ['idle', '空闲时处理'], ['when-online', '联网后开始任务']]) {
    const option = el('option', undefined, label); option.value = value!; timing.append(option);
  }
  timing.value = request.input.startWhen ?? 'now';
  timing.addEventListener('change', () => { commandId = crypto.randomUUID(); });
  const timingLabel = el('label', undefined, '开始时间'); timingLabel.append(timing); runOptions.append(timingLabel);

  const references = el('div', 'task-launch-references');
  const readReferences = request.operation !== 'launchInitialEvaluation' && request.operation !== 'launchReadersReport' ? Promise.resolve() : api.inspectEvaluation({ recordId: null }).then(page => {
    if (disposed || page.bookId !== request.bookId) return;
    const selected = new Set(request.input.materialIds ?? []);
    const materials = el('div'); references.append(materials);
    const paintReferences = (): void => {
      materials.replaceChildren(evaluationMaterialsField(page, request.operation === 'launchInitialEvaluation' ? 'initial' : 'readersReport', selected, true, false, () => {
        request.input = { ...request.input, materialIds: [...selected] };
        commandId = crypto.randomUUID(); invalidatePreview(); paintReferences();
      }));
    };
    paintReferences();
    references.append(similarMaterialsField(api, request.bookId, page.materials?.items ?? [], selected, id => {
      selected.add(id); request.input = { ...request.input, materialIds: [...selected] }; commandId = crypto.randomUUID(); invalidatePreview(); paintReferences();
    }));
    if (request.operation === 'launchInitialEvaluation' && page.market.series.length > 0) {
      const label = el('label', undefined, '书系参考');
      const select = el('select'); select.setAttribute('aria-label', '本次任务的书系参考');
      for (const [value, title] of [['', '仅本书'], ...page.market.series.map(series => [series.seriesId, `书系《${series.title}》`])]) {
        const option = el('option', undefined, title); option.value = value!; select.append(option);
      }
      select.value = request.input.seriesId ?? '';
      select.addEventListener('change', () => { request.input = { ...request.input, seriesId: select.value || null }; commandId = crypto.randomUUID(); });
      label.append(select); references.append(label);
    }
  }).catch(error => { if (!disposed) references.append(el('p', undefined, errorMessage(error, '参考资料暂时无法读取，请重新打开开始栏。'))); });

  const chooser = createDispatchChooser({ role: 'main-editorial', changed(config) { executionConfig = config; rememberedChoice = false; commandId = crypto.randomUUID(); invalidatePreview(); } });
  const problem = el('p', 'task-bar-refusal'); problem.setAttribute('role', 'status');
  const applyOptions = (): boolean => {
    const latestInput = request.readInput?.();
    if (latestInput !== undefined) {
      const { planEdits: _edits, startWhen: _when, ...previous } = request.input;
      if (JSON.stringify(latestInput) !== JSON.stringify(previous)) commandId = crypto.randomUUID();
      request.input = { ...request.input, ...latestInput };
    }
    const tokens = budget.value.trim() === '' ? null : parseBudgetCeiling(budget.value);
    if (tokens === null && budget.value.trim() !== '') { problem.textContent = TASK_PLAN_BUDGET_INVALID; runOptions.open = true; budget.focus(); return false; }
    const planEdits: PlanEditsProjection = {
      removedSteps: baselineOptions ? sampling.checked ? [] : ['assurance-sampling'] : request.input.planEdits?.removedSteps ?? [],
      disallowedAdaptations: retry.value === 'never' ? ['safe-retry'] : [],
      ...(baselineOptions && retry.value === 'ask-first' ? { askFirstAdaptations: ['safe-retry'] as const } : {}),
      ...(tokens === null ? {} : { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: tokens } }),
    };
    request.input = { ...request.input, planEdits, startWhen: timing.value === 'idle' ? 'idle' : timing.value === 'when-online' ? 'when-online' : 'now' };
    return true;
  };
  const openPlan = async (): Promise<void> => {
    const version = previewVersion;
    if (refreshPreview.disabled || !applyOptions() || !(await settle()) || version !== previewVersion) return;
    refreshPreview.disabled = true;
    try {
      const launch = { operation: request.operation, input: { ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice } } as TaskLaunchPreviewInput['launch'];
      const preview = await api.previewTaskLaunch({ launch });
      if (disposed || version !== previewVersion) return;
      const steps = el('ol'); for (const step of preview.steps) steps.append(el('li', undefined, step));
      usage.replaceChildren(el('p', undefined, `处理范围：${preview.scope}`), steps,
        ...preview.reference.map(line => el('p', undefined, `允许参考：${line}`)), el('p', undefined, `会发送：${preview.send}`), el('p', undefined, preview.usage),
        ...preview.adaptations.map(line => el('p', undefined, line)));
    } catch (error) { if (!disposed && version === previewVersion) usage.textContent = errorMessage(error, '计划暂时无法读取；仍可直接开始任务。'); }
    finally { refreshPreview.disabled = false; }
  };
  estimate.addEventListener('toggle', () => { if (estimate.open) void openPlan(); });
  refreshPreview.addEventListener('click', () => { void openPlan(); });

  const startButton = control('开始任务', 'primary', 'launch'); startButton.disabled = true;
  const start = async (): Promise<void> => {
    if (startButton.disabled) return;
    startButton.disabled = true;
    problem.textContent = '';
    const controls = [
      ...[description, estimate, runOptions, references].flatMap(node => [...node.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')]),
      ...chooser.element.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button'),
    ].map(control => ({ control, disabled: control.disabled }));
    for (const { control } of controls) control.disabled = true;
    const restore = (): void => { for (const { control, disabled } of controls) control.disabled = disabled; };
    try {
      if (!applyOptions()) { restore(); startButton.disabled = false; return; }
      if (!(await settle())) { restore(); startButton.disabled = false; return; }
      let result: TaskExecutionLaunchResult;
      switch (request.operation) {
        case 'launchBaselineAnalysis': result = await api.launchBaselineAnalysis({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
        case 'launchCustomAnalysis': result = await api.launchCustomAnalysis({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
        case 'launchWritingTask': result = await api.launchWritingTask({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
        case 'launchInitialEvaluation': result = await api.launchInitialEvaluation({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
        case 'launchReadersReport': result = await api.launchReadersReport({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
        case 'launchEvaluationRewrite': result = await api.launchEvaluationRewrite({ ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice }); break;
      }
      const kind = request.operation === 'launchCustomAnalysis' ? 'baseline-analysis' : kinds[request.operation] as TaskPlanKind;
      request.onStarted?.();
      onRecorded(kind, request.bookId, result.taskIntentId);
      setStatus(result.launchNotice ?? (result.waitingForNetwork ? '已记录任务，联网后开始。' : '已开始任务'), 'success');
      if (!disposed) openRun(request.bookId, kind, result.taskIntentId, result.launchNotice);
    } catch (error) { if (!disposed) { restore(); startButton.disabled = false; problem.textContent = errorMessage(error, '无法开始任务。'); } }
  };
  startButton.addEventListener('click', () => { void start(); });

  const onDocumentInput = (): void => { if (!disposed) invalidatePreview(); };
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('change', onDocumentInput);

  void Promise.allSettled([api.getModelServiceSettings(), api.getPreferences(), readReferences]).then(([settings, preferences]) => {
    if (disposed) return;
    executionConfig = preferences.status === 'fulfilled' ? preferences.value.values['model.dispatchChoices'][kinds[request.operation]] ?? {} : {};
    rememberedChoice = Object.keys(executionConfig).length > 0;
    if (settings.status === 'fulfilled') chooser.render(settings.value, preferences.status === 'fulfilled' ? preferences.value.values['model.favourites'] : {}, executionConfig);
    else chooser.unavailable();
  }).catch(() => { if (!disposed) chooser.unavailable(); }).finally(() => { if (!disposed) startButton.disabled = interrupted; });

  return {
    body: [description, estimate, runOptions, references],
    bar: [chooser.element, startButton, problem],
    start,
    openPlan,
    dispose(): void {
      disposed = true;
      document.removeEventListener('input', onDocumentInput);
      document.removeEventListener('change', onDocumentInput);
    },
  };
}
