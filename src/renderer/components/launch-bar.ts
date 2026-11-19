import { styleInput } from './controls.js';
import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation, type RuntimeExecutionConfig, type TaskExecutionLaunchResult } from '../../shared/runtime-execution-config.js';
import type { ServiceOperationMap, TaskLaunchPreviewInput, TaskPlanKind, RendererApi } from '../../shared/protocol.js';
import type { PlanEditsProjection } from '../../shared/protocol/analysis-plan.js';
import type { PreferencesRendererApi } from '../../shared/preferences.js';
import { createDispatchChooser } from './dispatch-chooser.js';
import { evaluationMaterialsField } from '../evaluation.js';
import { similarMaterialsField } from '../task-material-selection.js';
import { technicalLayerVisible, identityWords } from '../technical-layer.js';
import { parseBudgetCeiling, TASK_PLAN_BUDGET_INVALID } from '../task-drawer-labels.js';

/** A launch operation as the launch bar dispatches it (Issue #1545). */
export type TaskLaunchOperation = LedgerTaskLaunchOperation;
/**
 * What a surface sends to the launch bar (Issue #418 and later): the operation, its input (or a `readInput` that reads the
 * editor's live form), and `onStarted` for the surface that raised it. `title` is the drawer's own heading.
 */
export type TaskLaunchRequest = { [K in TaskLaunchOperation]: { bookId: string; operation: K; title: string;
  /** Surface behavior after the launch commits; never sent to the service. */
  onStarted?: () => void;
  /** Renderer-only placement and validation; never part of the launch input. */
  mount?: HTMLElement;
  inputEvents?: HTMLElement;
  lifetime?: object;
  startLabel?: string;
  /** The surface cannot start now (busy, or the bound choice is refused); the bar shows its start disabled. */
  startDisabled?: boolean;
  beforeLaunch?: () => Promise<boolean>;
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
  readonly startLabel?: string;
  readonly openSettings?: () => void;
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
  /**
   * The local service is gone: stop the asynchronous work (reads, the preview, what follows a start), but keep the view live.
   * Its options stay editable, and the plan shown still goes stale when one changes.
   */
  interrupt(): void;
  /** The surface repainted its request: show its current start label and whether it may start now. */
  sync(): void;
  /** This launch is no longer on screen: stop its asynchronous work and detach its document listeners. */
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

/** Shared numeric mapping for fresh launches and prepared-task redos. Unset preserves the old default. */
export const LAUNCH_BUDGET_TIERS: ReadonlyArray<readonly [string, string]> = [
  ['50000', '较少'], ['100000', '标准（推荐）'], ['200000', '较多'], ['', '不设上限'],
];
export function launchBudgetControl(current: number | null): HTMLSelectElement {
  const budget = el('select', 'ui-input'); budget.dataset['taskLaunchOption'] = 'budget'; budget.setAttribute('aria-label', '本次用量');
  const value = current === null ? '' : String(current);
  const tiers = [...LAUNCH_BUDGET_TIERS];
  if (!tiers.some(([entry]) => entry === value)) tiers.push([value, '上次上限']);
  for (const [entry, title] of tiers) { const option = el('option', undefined, title); option.value = entry; budget.append(option); }
  budget.value = value;
  return budget;
}

/** Shared presentation for ledger launches and surfaces with their own existing launch API. */
export function createLaunchBarPresentation(chooser: HTMLElement, start: HTMLButtonElement,
  options: { title: string; content: HTMLElement } | null, plan: HTMLElement | null, openSettings?: () => void): HTMLElement {
  const bar = el('div', 'task-launch-bar');
  const disclosure = (title: string, content: HTMLElement, className: string): HTMLDetailsElement => {
    const details = el('details', className);
    const summary = el('summary', undefined, title);
    if (className === 'task-launch-estimate') {
      const button = el('button', 'quiet', title); button.type = 'button';
      button.addEventListener('click', event => { event.preventDefault(); details.open = !details.open; });
      summary.replaceChildren(button);
    }
    const panel = el('div', 'task-launch-popover'); panel.append(content);
    details.append(summary, panel);
    // A non-modal panel: focus arriving on another control (Tab, Shift+Tab, also after a press on the panel's text rested focus on
    // the sheet) closes it, so it never stays over the controls the editor moved to. Focus on an ancestor (the sheet a press on
    // the panel's text focuses) or on nothing (a window switch) leaves it open.
    const onFocusIn = (event: Event): void => {
      if (!details.isConnected || !details.open) { document.removeEventListener('focusin', onFocusIn, true); return; }
      const next = event.target as Node | null;
      if (next !== null && !details.contains(next) && !next.contains(details)) details.open = false;
    };
    details.addEventListener('toggle', event => {
      if (event.target !== details) return;
      if (details.open) document.addEventListener('focusin', onFocusIn, true);
      else document.removeEventListener('focusin', onFocusIn, true);
    });
    if (typeof panel.showPopover === 'function') {
      panel.setAttribute('popover', 'auto');
      // Above or below its whole bar, never over it: a bar that wraps onto two rows keeps its other controls (选项 beside 先看计划)
      // reachable while the panel is open. The side with more room when the panel fits on neither, bounded to that room (its
      // content scrolls), so the summary that closes it stays reachable; across, it starts at its own summary.
      const place = (): void => {
        if (!panel.matches(':popover-open')) return;
        // Measuring the natural height takes the bound away, which resets a bounded panel's own scroll: keep the editor's place in it.
        const scrolled = panel.scrollTop;
        panel.style.maxHeight = '';
        const anchor = summary.getBoundingClientRect(), row = bar.getBoundingClientRect(), natural = panel.getBoundingClientRect();
        const above = row.top - 12, below = innerHeight - row.bottom - 12;
        const up = natural.height > below && above > below;
        const height = Math.min(natural.height, up ? above : below);
        if (height < natural.height) panel.style.maxHeight = `${Math.max(0, height)}px`;
        panel.scrollTop = scrolled;
        const left = Math.max(8, Math.min(anchor.left, innerWidth - natural.width - 8)), top = up ? row.top - 4 - height : row.bottom + 4;
        panel.style.left = `${left}px`; panel.style.top = `${top}px`;
        // Inside a sheet the fixed offsets may resolve against the sheet rather than the window: correct by where it landed.
        const landed = panel.getBoundingClientRect();
        if (Math.abs(landed.left - left) > 0.5 || Math.abs(landed.top - top) > 0.5) { panel.style.left = `${2 * left - landed.left}px`; panel.style.top = `${2 * top - landed.top}px`; }
      };
      // The plan and the references arrive after the panel opens: place it again whenever its size changes.
      if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(panel);
      // A scroll, a resize or the page's own transition (the padding that makes room for a docked Task Drawer, the sidebar's width)
      // moves the summary under a fixed panel: the panel follows it while it is shown.
      const unfollow = (): void => {
        document.removeEventListener('scroll', follow, { capture: true }); document.removeEventListener('transitionend', follow, true); window.removeEventListener('resize', follow);
      };
      // A panel removed from the page while open is hidden without a toggle event: it lets go of the page then.
      const follow = (): void => { if (!details.isConnected) { unfollow(); return; } place(); };
      details.addEventListener('toggle', event => {
        if (event.target !== details) return;
        if (!details.open) { if (panel.matches(':popover-open')) panel.hidePopover(); return; }
        panel.showPopover();
        place();
        document.addEventListener('scroll', follow, { capture: true, passive: true }); document.addEventListener('transitionend', follow, true); window.addEventListener('resize', follow);
      });
      panel.addEventListener('toggle', () => {
        if (panel.matches(':popover-open')) return;
        unfollow();
        details.open = false;
      });
    }
    return details;
  };
  bar.append(chooser);
  const settings = control('去设置', 'quiet', 'launch-settings'); settings.hidden = true;
  settings.addEventListener('click', () => { if (openSettings !== undefined) openSettings(); else document.querySelector<HTMLElement>('#app-sidebar [data-nav-settings]')?.click(); });
  bar.append(settings);
  if (options !== null) bar.append(disclosure(options.title, options.content, 'task-launch-options'));
  bar.append(start);
  if (plan !== null) bar.append(disclosure('先看计划', plan, 'task-launch-estimate'));
  return bar;
}

/** Read the chooser's existing readiness words after its async settings read. */
export function syncLaunchModelSettings(bar: HTMLElement): void {
  const settings = bar.querySelector<HTMLButtonElement>('[data-task-drawer-control="launch-settings"]');
  if (settings !== null) settings.hidden = !bar.querySelector('.dispatch-chooser summary')?.textContent?.includes('待设置');
}

export function mountLaunchBar(options: MountLaunchBarOptions): LaunchBar {
  const { api, request, errorMessage, setStatus, settle, onRecorded, openRun, interrupted } = options;
  const kinds = LEDGER_TASK_LAUNCH_KINDS;
  /** Set by `interrupt` and `dispose`: no read, preview or start settles into the view any more. */
  let stopped = false;
  let disposed = false;
  let executionConfig: RuntimeExecutionConfig = {}; let rememberedChoice = false;
  let commandId = crypto.randomUUID();
  let previewVersion = 0;

  const description = el('p', undefined, '开始时使用当前稿件，并固定本次任务的模型与思考强度。');
  const usage = el('div');
  const refreshPreview = control('更新计划', '', 'preview-launch');
  const planContent = el('div'); planContent.append(usage, refreshPreview);

  const invalidatePreview = (): void => {
    previewVersion += 1;
    usage.replaceChildren(el('p', 'task-launch-preview-stale', '选项已变化，请更新计划。'));
  };

  const runOptions = el('div', 'task-launch-option-rows');
  const budget = technicalLayerVisible ? el('input') : launchBudgetControl(request.input.planEdits?.runBudgetCeiling?.maxTotalTokens ?? null);
  if (budget instanceof HTMLInputElement) { styleInput(budget); budget.inputMode = 'numeric'; budget.value = String(request.input.planEdits?.runBudgetCeiling?.maxTotalTokens ?? ''); budget.dataset['taskLaunchOption'] = 'budget'; budget.setAttribute('aria-label', '本次预算上限'); }
  const previousBudget = budget.value;
  const budgetLabel = el('label', undefined, '本次用量'); budgetLabel.append(budget, el('small', undefined, '达到上限后暂停，可调整后重新开始。')); runOptions.append(budgetLabel);
  usage.textContent = '计划预览按当前稿件和本次选项计算，不记录任务；开始时固定当前稿件。';
  const baselineOptions = request.operation === 'launchBaselineAnalysis';
  const retry = el('select'); retry.dataset['taskLaunchOption'] = 'retry'; retry.setAttribute('aria-label', '遇到失败时');
  for (const [value, label] of [['auto', '自动重试'], ['ask-first', '先问我'], ['never', '不重试']]) {
    if (value === 'ask-first' && !baselineOptions) continue;
    const option = el('option', undefined, label); option.value = value!; retry.append(option);
  }
  retry.value = request.input.planEdits?.askFirstAdaptations?.includes('safe-retry') ? 'ask-first' : request.input.planEdits?.disallowedAdaptations.includes('safe-retry') ? 'never' : 'auto';
  const sampling = el('input'); sampling.type = 'checkbox'; styleInput(sampling); sampling.dataset['taskLaunchOption'] = 'sampling';
  sampling.checked = !request.input.planEdits?.removedSteps.includes('assurance-sampling');
  const retryLabel = el('label', undefined, '遇到失败时'); retryLabel.append(retry);
  retryLabel.append(el('small', undefined, '仅处理可重试的失败，其他失败仍会停下。')); runOptions.append(retryLabel);
  if (baselineOptions) {
    const samplingLabel = el('label', undefined, '完成后核对与抽检'); samplingLabel.prepend(sampling);
    samplingLabel.append(el('small', undefined, '完成后检查结果，并抽取部分内容核对。')); runOptions.append(samplingLabel);
  }
  for (const event of ['input', 'change']) runOptions.addEventListener(event, () => { commandId = crypto.randomUUID(); });
  const timing = el('select'); timing.dataset['taskStartWhen'] = ''; timing.setAttribute('aria-label', '开始时间');
  for (const [value, label] of [['now', '立即'], ['idle', '空闲时处理'], ['when-online', '联网后开始任务']]) {
    const option = el('option', undefined, label); option.value = value!; timing.append(option);
  }
  timing.value = request.input.startWhen ?? 'now';
  timing.addEventListener('change', () => { commandId = crypto.randomUUID(); });
  const timingLabel = el('label', undefined, '开始时间'); timingLabel.append(timing, el('small', undefined, '只安排这一次任务的开始时间。')); runOptions.append(timingLabel);

  const references = el('div', 'task-launch-references');
  const readReferences = request.operation !== 'launchInitialEvaluation' && request.operation !== 'launchReadersReport' ? Promise.resolve() : api.inspectEvaluation({ recordId: null }).then(page => {
    if (stopped || page.bookId !== request.bookId) return;
    const selected = new Set('materialIds' in request.input ? request.input.materialIds ?? [] : []);
    const materials = el('div'); references.append(materials);
    const paintReferences = (): void => {
      materials.replaceChildren(evaluationMaterialsField(page, request.operation === 'launchInitialEvaluation' ? 'initial' : 'readersReport', selected, true, false, () => {
        request.input = { ...request.input, materialIds: [...selected] };
        commandId = crypto.randomUUID(); invalidatePreview(); paintReferences(); updateAdjusted();
      }));
    };
    paintReferences();
    references.append(similarMaterialsField(api, request.bookId, page.materials?.items ?? [], selected, id => {
      selected.add(id); request.input = { ...request.input, materialIds: [...selected] }; commandId = crypto.randomUUID(); invalidatePreview(); paintReferences(); updateAdjusted();
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
  }).catch(error => { if (!stopped) references.append(el('p', undefined, errorMessage(error, '参考资料暂时无法读取，请重新打开开始栏。'))); });

  const chooser = createDispatchChooser({ role: 'main-editorial', changed(config) { executionConfig = config; rememberedChoice = false; commandId = crypto.randomUUID(); invalidatePreview(); } });
  const problem = el('p', 'task-bar-refusal'); problem.setAttribute('role', 'status');
  let lastLiveInput = request.readInput === undefined ? undefined : JSON.stringify(request.readInput());
  const applyOptions = (): boolean => {
    const latestInput = request.readInput?.();
    if (latestInput !== undefined) {
      const encoded = JSON.stringify(latestInput);
      if (encoded !== lastLiveInput) commandId = crypto.randomUUID();
      lastLiveInput = encoded;
      request.input = { ...request.input, ...latestInput };
    }
    const tokens = budget.value.trim() === '' ? null : parseBudgetCeiling(budget.value);
    if (tokens === null && budget.value.trim() !== '') { problem.textContent = TASK_PLAN_BUDGET_INVALID; optionsDisclosure.open = true; budget.focus(); return false; }
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
    // A surface that cannot start now (busy) reads no plan either.
    if (request.startDisabled === true) return;
    if (request.beforeLaunch !== undefined && !await request.beforeLaunch()) return;
    estimate.open = true;
    const version = previewVersion;
    if (stopped || refreshPreview.disabled || !applyOptions() || !(await settle()) || version !== previewVersion) return;
    refreshPreview.disabled = true;
    try {
      const launch = { operation: request.operation, input: { ...request.input, clientCommandId: commandId, executionConfig, rememberedChoice } } as TaskLaunchPreviewInput['launch'];
      const preview = await api.previewTaskLaunch({ launch });
      if (stopped || version !== previewVersion) return;
      const steps = el('ol'); for (const step of preview.steps) steps.append(el('li', undefined, step));
      usage.replaceChildren(el('p', undefined, `处理范围：${preview.scope}`), steps,
        ...preview.reference.map(line => el('p', undefined, `允许参考：${line}`)), el('p', undefined, `会发送：${preview.send}`), el('p', undefined, preview.usage),
        ...preview.adaptations.map(line => el('p', undefined, line)));
    } catch (error) { if (!stopped && version === previewVersion) usage.textContent = errorMessage(error, '计划暂时无法读取；仍可直接开始任务。'); }
    finally { refreshPreview.disabled = false; }
  };

  refreshPreview.addEventListener('click', () => { void openPlan(); });

  const startButton = control(request.startLabel ?? options.startLabel ?? `开始${request.title}`, 'primary', 'launch'); startButton.disabled = true;
  let settingsRead = false; let launching = false;
  const syncStart = (): void => { startButton.disabled = stopped || interrupted || !settingsRead || launching || request.startDisabled === true; };
  const start = async (): Promise<void> => {
    if (stopped || startButton.disabled || request.startDisabled === true) return;
    launching = true; syncStart();
    problem.textContent = '';
    const controls = [
      ...[description, planContent, runOptions, references].flatMap(node => [...node.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')]),
      ...chooser.element.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button'),
    ].map(control => ({ control, disabled: control.disabled }));
    for (const { control } of controls) control.disabled = true;
    const restore = (): void => { for (const { control, disabled } of controls) control.disabled = disabled; launching = false; syncStart(); };
    try {
      if (request.beforeLaunch !== undefined && !await request.beforeLaunch()) { restore(); return; }
      if (!applyOptions()) { restore(); return; }
      if (!(await settle())) { restore(); return; }
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
      if (!stopped) openRun(request.bookId, kind, result.taskIntentId, result.launchNotice);
    } catch (error) { if (!stopped) { restore(); problem.textContent = errorMessage(error, '无法开始任务。'); } }
  };
  startButton.addEventListener('click', () => { void start(); });

  const withReferences = request.operation === 'launchInitialEvaluation' || request.operation === 'launchReadersReport';
  const optionContent = el('div'); optionContent.append(references, runOptions);
  const presentation = createLaunchBarPresentation(chooser.element, startButton, { title: withReferences ? '参考资料与选项' : '选项', content: optionContent }, planContent, options.openSettings);
  const estimate = presentation.querySelector<HTMLDetailsElement>('.task-launch-estimate')!;
  const optionsDisclosure = presentation.querySelector<HTMLDetailsElement>('.task-launch-options')!;
  const optionsSummary = optionsDisclosure.querySelector('summary')!;
  const defaults = JSON.stringify([previousBudget, retry.value, sampling.checked, timing.value, 'materialIds' in request.input ? request.input.materialIds ?? [] : [], 'seriesId' in request.input ? request.input.seriesId ?? null : null]);
  const updateAdjusted = (): void => {
    const current = JSON.stringify([budget.value, retry.value, sampling.checked, timing.value, 'materialIds' in request.input ? request.input.materialIds ?? [] : [], 'seriesId' in request.input ? request.input.seriesId ?? null : null]);
    optionsSummary.textContent = `${withReferences ? '参考资料与选项' : '选项'}${current === defaults ? '' : ' · 已调整'}`;
  };
  optionContent.addEventListener('change', updateAdjusted);
  estimate.addEventListener('toggle', () => { if (estimate.open && !refreshPreview.disabled) void openPlan(); });
  const onDocumentInput = (event: Event): void => {
    const scope = request.inputEvents ?? request.mount?.closest('form') ?? presentation;
    if (!disposed && event.target instanceof HTMLElement && scope.contains(event.target)) { commandId = crypto.randomUUID(); invalidatePreview(); }
  };
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('change', onDocumentInput);

  void Promise.allSettled([api.getModelServiceSettings(), api.getPreferences(), readReferences]).then(([settings, preferences]) => {
    if (stopped) return;
    executionConfig = preferences.status === 'fulfilled' ? preferences.value.values['model.dispatchChoices'][kinds[request.operation]] ?? {} : {};
    rememberedChoice = Object.keys(executionConfig).length > 0;
    if (settings.status === 'fulfilled') chooser.render(settings.value, preferences.status === 'fulfilled' ? preferences.value.values['model.favourites'] : {}, executionConfig);
    else chooser.unavailable();
    syncLaunchModelSettings(presentation);
  }).catch(() => { if (!stopped) chooser.unavailable(); }).finally(() => { settingsRead = true; syncStart(); });

  return {
    body: [description],
    bar: [presentation, problem],
    start,
    openPlan,
    interrupt(): void { stopped = true; startButton.disabled = true; refreshPreview.disabled = true; },
    sync(): void { startButton.textContent = request.startLabel ?? options.startLabel ?? `开始${request.title}`; syncStart(); },
    dispose(): void {
      stopped = true; disposed = true;
      document.removeEventListener('input', onDocumentInput);
      document.removeEventListener('change', onDocumentInput);
    },
  };
}
