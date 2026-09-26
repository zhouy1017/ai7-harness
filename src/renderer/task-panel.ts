import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisGoal,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type BookTaskItemProjection,
  type BookTasksProjection,
  type DefaultExecutionRuleReference,
  type GlobalAttentionTarget,
  type RendererApi,
  type TaskPlanKind,
} from '../shared/protocol.js';
import { TASK_BAR_PAUSE_FAILED, TASK_BAR_PAUSING_NOTE, TASK_BAR_RESUME_FAILED } from './task-drawer-labels.js';
import {
  TASK_PANEL_COMPOSE_ACTIONS,
  TASK_PANEL_COMPOSE_FIELD,
  TASK_PANEL_COMPOSE_FIRST,
  TASK_PANEL_COMPOSE_FIRST_QUICK,
  TASK_PANEL_COMPOSE_HEADING,
  TASK_PANEL_COMPOSE_LEDE,
  TASK_PANEL_COMPOSE_NONE,
  TASK_PANEL_EMPTY_LINES,
  TASK_PANEL_GROUP_LABELS,
  TASK_PANEL_NOTE,
  TASK_PANEL_STATUS_LINES,
  taskPanelCardView,
  taskPanelMoreLine,
  taskPanelScopeLine,
  type TaskPanelAction,
} from './task-panel-labels.js';

/**
 * The 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044): the Book's Tasks beside the
 * manuscript in the drawer's slot — 发起全书任务 above the three groups 等你处理 · 进行中 · 最近完成, each Task a card of its
 * content and state. A card acts only where the drawer's bar would act the same way at once — 暂停 and 续行; 取消任务 opens
 * the plan with its Cancellation Impact Summary, where the cancellation is confirmed; everything else opens the Task's
 * plan or its own surface. The panel reads; it grants nothing.
 */
export interface TaskPanelOptions {
  readonly api: Pick<RendererApi, 'inspectBookTasks' | 'inspectBaselineAnalysis' | 'pauseBaselineAnalysisRun' | 'resumeBaselineAnalysisRun'>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** A Task's plan in the drawer; `cancel` opens it with 取消任务's Cancellation Impact Summary open. */
  openPlan(kind: TaskPlanKind, ref: string, cancel: boolean): void;
  /** A Task's own record: ②A for an analysis, ②B for a 审阅. */
  openTarget(target: GlobalAttentionTarget): void;
  /** 查看结果: the finished Task's result in the floating window beside the text. */
  openResult(entry: BookTaskItemProjection): void;
  /** 发起全书任务: prepare the procedure's Task, and start it under its rule when `quick` names one. */
  startWholeBook(input: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; quick: DefaultExecutionRuleReference | null }): Promise<void>;
  /** A card's 暂停 or 续行 was recorded: the surfaces of the analysis read it again. */
  onRecorded(bookId: string): void;
}

export interface TaskPanelSurface {
  readonly element: HTMLElement;
  /** Read and show this Book's Tasks. */
  show(bookId: string): void;
  /** Read again: something the panel shows may have moved. */
  refresh(): void;
  /** The panel left the drawer: nothing is read until it is shown again. */
  stop(): void;
}

/** How often the panel reads again while a Task of the Book runs, so its card follows the Run to its end. */
const RUNNING_POLL_MS = 2_000;

type ComposeMode = 'first-baseline' | 'sync-current' | 'reanalyze-book';
interface ComposeOption {
  readonly mode: ComposeMode;
  readonly label: string;
  readonly meaning: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly goal: BaselineAnalysisGoal;
  readonly quick: { readonly rule: DefaultExecutionRuleReference | null; readonly reason: string | null };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `task-panel-${prefix}-${identities}`;
}

/** The whole-Book procedures the Book can take now (TASK-044): its first baseline, or the two whole-Book updates. */
export function composeOptions(projection: BaselineAnalysisProjection): ReadonlyArray<ComposeOption> {
  const controls = projection.updateControls;
  if (controls === null) {
    if (!projection.actions.canPrepare) return [];
    return [{
      mode: 'first-baseline',
      label: TASK_PANEL_COMPOSE_FIRST.label,
      meaning: TASK_PANEL_COMPOSE_FIRST.meaning,
      available: true,
      reason: null,
      goal: BASELINE_ANALYSIS_TASK_GOAL,
      quick: { rule: null, reason: TASK_PANEL_COMPOSE_FIRST_QUICK },
    }];
  }
  return (['sync-current', 'reanalyze-book'] as const).map((mode) => {
    const entry = controls.actions[mode];
    const available = entry.available && !controls.blockedByActiveRun;
    const quick = entry.quickStart;
    return {
      mode,
      label: entry.label,
      meaning: entry.meaning,
      available,
      reason: controls.blockedByActiveRun ? controls.blockedReason : entry.unavailableReason,
      goal: entry.goal as BaselineAnalysisGoal,
      quick: quick === undefined
        ? { rule: null, reason: null }
        : { rule: quick.available && available ? quick.rule : null, reason: quick.available ? null : quick.reason },
    };
  });
}

export function mountTaskPanel(options: TaskPanelOptions): TaskPanelSurface {
  const { api } = options;
  const element = el('section', 'task-panel');
  element.dataset['taskPanel'] = 'loading';
  const scope = el('p', 'section-label task-panel-scope');
  const note = el('p', 'field-note task-panel-note', TASK_PANEL_NOTE);
  const compose = el('section', 'task-panel-compose');
  const groups = el('div', 'task-panel-groups');
  element.append(scope, compose, groups, note);

  let bookId: string | null = null;
  let tasks: BookTasksProjection | null = null;
  let analysis: BaselineAnalysisProjection | null = null;
  let analysisRead = false;
  let painted = '';
  let ticket = 0;
  let timer: number | undefined;
  let working = false;
  let selected: ComposeMode | null = null;

  function clearTimer(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }

  /** Read the Tasks and — when `withAnalysis`, or when a Run just ended — what 发起全书任务 can start. */
  function read(withAnalysis: boolean): void {
    const book = bookId;
    if (book === null) return;
    clearTimer();
    const mine = ++ticket;
    const wasRunning = tasks?.running === true;
    void Promise.all([
      api.inspectBookTasks(),
      withAnalysis || !analysisRead ? api.inspectBaselineAnalysis().then((value) => value, () => null) : Promise.resolve(undefined),
    ]).then(
      ([next, nextAnalysis]) => {
        if (mine !== ticket || bookId !== book || next.bookId !== book) return;
        tasks = next;
        if (nextAnalysis !== undefined) {
          analysis = nextAnalysis;
          analysisRead = true;
        }
        paint();
        // A Run that just ended frees the whole-Book procedures: read them again at once.
        if (wasRunning && !next.running) {
          read(true);
          return;
        }
        if (next.running) timer = window.setTimeout(() => { timer = undefined; read(false); }, RUNNING_POLL_MS);
      },
      (error: unknown) => {
        if (mine !== ticket || bookId !== book) return;
        tasks = null;
        painted = '';
        element.dataset['taskPanel'] = 'unavailable';
        scope.textContent = '';
        compose.replaceChildren();
        groups.replaceChildren(el('p', 'attention-note task-panel-unavailable', options.errorMessage(error, TASK_PANEL_STATUS_LINES.unavailable)));
      },
    );
  }

  function paint(): void {
    if (tasks === null) return;
    const key = JSON.stringify([tasks, analysis, working, selected]);
    if (key === painted) return;
    painted = key;
    const active = document.activeElement;
    const restore = active instanceof HTMLElement && element.contains(active)
      ? { action: active.dataset['taskAction'] ?? active.dataset['taskComposeAction'] ?? null, item: active.closest<HTMLElement>('[data-task-item-id]')?.dataset['taskItemId'] ?? null, mode: active instanceof HTMLInputElement ? active.value : null }
      : null;
    element.dataset['taskPanel'] = 'ready';
    element.dataset['taskPanelRunning'] = String(tasks.running);
    const total = tasks.groups.reduce((sum, group) => sum + group.total, 0);
    scope.textContent = taskPanelScopeLine(total);
    paintCompose();
    groups.replaceChildren(...tasks.groups.map((group) => {
      const section = el('section', 'task-panel-group');
      section.dataset['taskGroup'] = group.key;
      const heading = el('h3', undefined, TASK_PANEL_GROUP_LABELS[group.key]);
      heading.id = uid(`group-${group.key}`);
      section.setAttribute('aria-labelledby', heading.id);
      const count = el('span', 'task-panel-count', String(group.total));
      heading.append(' ', count);
      section.append(heading);
      if (group.items.length === 0) {
        section.append(el('p', 'field-note task-panel-empty', TASK_PANEL_EMPTY_LINES[group.key]));
      } else {
        const list = el('ul', 'task-panel-list');
        for (const entry of group.items) list.append(card(entry));
        section.append(list);
        const more = taskPanelMoreLine(group.key, group.items.length, group.total);
        if (more !== null) section.append(el('p', 'field-note', more));
      }
      return section;
    }));
    if (restore !== null) {
      const target = restore.item !== null && restore.action !== null
        ? element.querySelector<HTMLElement>(`[data-task-item-id="${CSS.escape(restore.item)}"] [data-task-action="${restore.action}"]`)
        : restore.action !== null ? element.querySelector<HTMLElement>(`[data-task-compose-action="${restore.action}"]`)
          : restore.mode !== null ? element.querySelector<HTMLElement>(`input[name="task-panel-mode"][value="${CSS.escape(restore.mode)}"]`) : null;
      if (target !== null && !(target instanceof HTMLButtonElement && target.disabled)) target.focus();
    }
    // Every group's order and every control's state follow a read; so does whether the whole panel is disabled.
    if (working) for (const control of element.querySelectorAll<HTMLButtonElement>('button')) control.disabled = true;
  }

  function card(entry: BookTaskItemProjection): HTMLElement {
    const view = taskPanelCardView(entry);
    const item = el('li', 'task-card');
    item.dataset['taskItemId'] = entry.item.itemId;
    item.dataset['taskState'] = entry.item.state;
    item.dataset['taskBlocked'] = String(entry.item.blocked);
    const title = el('h4', 'task-card-title', view.title);
    title.id = uid('card');
    item.setAttribute('aria-labelledby', title.id);
    const pill = el('span', `status-pill review-pill task-card-pill review-pill-${view.pill.tone}`, view.stateLabel);
    pill.dataset['pillTone'] = view.pill.tone;
    pill.dataset['pillShape'] = view.pill.shape;
    const head = el('div', 'task-card-head');
    head.append(title, pill);
    const actions = el('div', 'button-row compact-actions task-card-actions');
    for (const entryAction of view.actions) actions.append(actionButton(entry, entryAction));
    item.append(el('p', 'task-card-kind', view.kindLabel), head, el('p', 'task-card-reason', view.reason), el('p', 'field-note task-card-time', view.timeLine), actions);
    return item;
  }

  function actionButton(entry: BookTaskItemProjection, entryAction: TaskPanelAction): HTMLButtonElement {
    const node = el('button', entryAction.primary ? 'secondary' : 'quiet', entryAction.label);
    node.type = 'button';
    node.dataset['taskAction'] = entryAction.key;
    node.disabled = working;
    node.addEventListener('click', () => void act(entry, entryAction));
    return node;
  }

  /** The Task Intent a baseline card names; `null` for any other Task. */
  function taskIntentOf(target: GlobalAttentionTarget): string | null {
    return target.kind === 'analysis' || target.kind === 'analysis-plan' ? target.taskIntentId : null;
  }

  function planOf(target: GlobalAttentionTarget): { kind: TaskPlanKind; ref: string } | null {
    if (target.kind === 'analysis' || target.kind === 'analysis-plan') return { kind: 'baseline-analysis', ref: target.taskIntentId };
    if (target.kind === 'review' || target.kind === 'review-plan') return { kind: 'review-run', ref: target.reviewRunId };
    return null;
  }

  async function act(entry: BookTaskItemProjection, entryAction: TaskPanelAction): Promise<void> {
    if (working || bookId === null) return;
    const target = entry.item.target;
    switch (entryAction.key) {
      case 'pause':
      case 'resume': {
        const taskIntentId = taskIntentOf(target);
        if (taskIntentId === null) return;
        const book = bookId;
        working = true;
        painted = '';
        paint();
        const pausing = entryAction.key === 'pause';
        options.setStatus(pausing ? '正在暂停任务…' : '正在续行…', 'busy');
        try {
          if (pausing) await api.pauseBaselineAnalysisRun({ taskIntentId });
          else await api.resumeBaselineAnalysisRun({ taskIntentId });
          options.setStatus(pausing ? TASK_BAR_PAUSING_NOTE : '已续行，从已保存的进度接着读。', 'success');
          options.onRecorded(book);
        } catch (error) {
          options.setStatus(options.errorMessage(error, pausing ? TASK_BAR_PAUSE_FAILED : TASK_BAR_RESUME_FAILED), 'error');
        } finally {
          working = false;
          painted = '';
          if (bookId === book) read(false);
        }
        return;
      }
      case 'cancel':
      case 'plan': {
        const plan = planOf(target);
        if (plan !== null) options.openPlan(plan.kind, plan.ref, entryAction.key === 'cancel');
        return;
      }
      case 'result':
        options.openResult(entry);
        return;
      case 'next':
        if (target.kind === 'analysis-plan' || target.kind === 'review-plan') {
          const plan = planOf(target)!;
          options.openPlan(plan.kind, plan.ref, false);
          return;
        }
        options.openTarget(target);
        return;
    }
  }

  // ---- 发起全书任务 ---------------------------------------------------------------------------------------

  function paintCompose(): void {
    const heading = el('h3', undefined, TASK_PANEL_COMPOSE_HEADING);
    heading.id = uid('compose');
    compose.setAttribute('aria-labelledby', heading.id);
    const lede = el('p', 'field-note', TASK_PANEL_COMPOSE_LEDE);
    const choices = analysis === null ? [] : composeOptions(analysis);
    if (choices.length === 0) {
      compose.replaceChildren(heading, lede, el('p', 'field-note task-panel-compose-none', TASK_PANEL_COMPOSE_NONE));
      return;
    }
    if (selected === null || !choices.some((choice) => choice.mode === selected && choice.available)) {
      selected = choices.find((choice) => choice.available)?.mode ?? choices[0]!.mode;
    }
    const fieldset = el('fieldset', 'task-panel-modes');
    fieldset.append(el('legend', undefined, TASK_PANEL_COMPOSE_FIELD));
    for (const choice of choices) {
      const label = el('label', 'task-panel-mode');
      label.dataset['taskComposeMode'] = choice.mode;
      const input = el('input');
      input.type = 'radio';
      input.name = 'task-panel-mode';
      input.value = choice.mode;
      input.checked = choice.mode === selected;
      input.disabled = !choice.available || working;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        selected = choice.mode;
        painted = '';
        paint();
      });
      const words = el('span', 'task-panel-mode-words');
      words.append(el('strong', undefined, choice.label), el('small', 'field-note', choice.available ? choice.meaning : choice.reason ?? choice.meaning));
      label.append(input, words);
      fieldset.append(label);
    }
    const chosen = choices.find((choice) => choice.mode === selected)!;
    const row = el('div', 'button-row compact-actions');
    const quick = el('button', 'quiet', TASK_PANEL_COMPOSE_ACTIONS.quick);
    quick.type = 'button';
    quick.dataset['taskComposeAction'] = 'quick';
    const prepare = el('button', 'primary', TASK_PANEL_COMPOSE_ACTIONS.prepare);
    prepare.type = 'button';
    prepare.dataset['taskComposeAction'] = 'prepare';
    prepare.disabled = working || !chosen.available;
    quick.disabled = working || chosen.quick.rule === null;
    const why = el('p', 'field-note task-panel-compose-why');
    why.id = uid('compose-why');
    const reason = !chosen.available ? chosen.reason : chosen.quick.rule === null ? chosen.quick.reason : null;
    why.textContent = reason ?? '';
    why.hidden = reason === null;
    if (reason !== null) {
      prepare.setAttribute('aria-describedby', why.id);
      quick.setAttribute('aria-describedby', why.id);
    }
    quick.addEventListener('click', () => void start(chosen, true));
    prepare.addEventListener('click', () => void start(chosen, false));
    row.append(quick, prepare);
    compose.replaceChildren(heading, lede, fieldset, row, why);
  }

  async function start(choice: ComposeOption, quick: boolean): Promise<void> {
    if (working || bookId === null) return;
    const book = bookId;
    working = true;
    painted = '';
    paint();
    try {
      await options.startWholeBook({
        goal: choice.goal,
        update: choice.mode === 'first-baseline' ? null : { mode: choice.mode, selectedRange: null },
        quick: quick ? choice.quick.rule : null,
      });
    } finally {
      working = false;
      painted = '';
      if (bookId === book) read(true);
    }
  }

  return {
    element,
    show(next) {
      bookId = next;
      tasks = null;
      analysis = null;
      analysisRead = false;
      painted = '';
      working = false;
      element.dataset['taskPanel'] = 'loading';
      scope.textContent = '';
      compose.replaceChildren();
      groups.replaceChildren(el('p', 'field-note task-panel-loading', TASK_PANEL_STATUS_LINES.loading));
      read(true);
    },
    refresh() {
      if (bookId === null) return;
      read(true);
    },
    stop() {
      ticket += 1;
      clearTimer();
      bookId = null;
    },
  };
}

