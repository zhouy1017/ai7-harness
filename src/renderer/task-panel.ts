import {
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_TASK_INTENT_DRAFT_RANGES,
  MAX_TASK_INTENT_GOAL_LENGTH,
  TASK_INTENT_OUTCOME_CLASSES,
  type DialogueSelectionInput,
  type SaveTaskIntentDraftInput,
  type ServiceWireJobProjection as ServiceJobProjection,
  type TaskIntentDraftAnswerProjection,
  type TaskIntentDraftOption,
  type TaskIntentDraftProjection,
  type TaskIntentDraftRangeProjection,
  type TaskIntentDraftResolution,
  type TaskIntentOutcomeClass,
  type BaselineAnalysisGoal,
  type BaselineAnalysisWireProjection as BaselineAnalysisProjection,
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
  TASK_COMPOSER_ACTIONS,
  TASK_COMPOSER_ADD_RANGE,
  TASK_COMPOSER_ADD_RANGE_SAME,
  TASK_COMPOSER_ANSWER_NOTE,
  TASK_COMPOSER_ANSWER_TRUNCATED,
  TASK_COMPOSER_BOOK_TARGET_NOTE,
  TASK_COMPOSER_CONTEXT_HEADING,
  TASK_COMPOSER_COPY_RANGES_DROPPED,
  TASK_COMPOSER_GOAL_LABEL,
  TASK_COMPOSER_GOAL_PLACEHOLDER,
  TASK_COMPOSER_NO_RANGES,
  TASK_COMPOSER_NOTE,
  TASK_COMPOSER_OPEN_PLAN,
  TASK_COMPOSER_OUTCOME_LABELS,
  TASK_COMPOSER_OUTCOME_LEGEND,
  TASK_COMPOSER_PENDING_LABEL,
  TASK_COMPOSER_PICK_CHOICE,
  TASK_COMPOSER_PROCEDURES,
  TASK_COMPOSER_PROMOTE_SAVE_FIRST,
  TASK_COMPOSER_PROMOTED,
  TASK_COMPOSER_RANGE_REMOVE,
  TASK_COMPOSER_RESOLUTION_CHOOSE,
  TASK_COMPOSER_RESOLUTION_HEADING,
  TASK_COMPOSER_STATUS,
  TASK_COMPOSER_TARGET_LABELS,
  TASK_COMPOSER_TARGET_LEGEND,
  TASK_COMPOSER_TITLES,
  TASK_COMPOSER_UNSAVED,
  TASK_COMPOSER_WRITING_AUDIENCE,
  TASK_COMPOSER_WRITING_CHANNEL,
  TASK_COMPOSER_WRITING_FIELDS,
  TASK_PANEL_COMPOSE_ACTIONS,
  TASK_PANEL_COMPOSE_FIELD,
  TASK_PANEL_COMPOSE_OPEN,
  TASK_PANEL_COMPOSE_OPEN_NOTE,
  taskComposerAddRangeLimit,
  taskComposerAnswerHeading,
  taskComposerBookLine,
  taskComposerDraftHeading,
  taskComposerGoalCount,
  taskComposerParkedLine,
  taskComposerPinLine,
  taskComposerRangeLine,
  taskComposerResolutionReady,
  taskComposerRevisionLine,
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
  readonly api: Pick<RendererApi, 'inspectBookTasks' | 'inspectBaselineAnalysis' | 'pauseBaselineAnalysisRun' | 'resumeBaselineAnalysisRun' | 'controlTaskRun'>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** A Task's plan in the drawer; `cancel` opens it with 取消任务's Cancellation Impact Summary open. */
  openPlan(kind: TaskPlanKind, ref: string, cancel: boolean): void;
  /** A Task's own record: ②A for an analysis, ②B for a 审阅. */
  openTarget(target: GlobalAttentionTarget): void;
  /** 查看结果: the finished Task's result in the floating window beside the text. */
  openResult(entry: BookTaskItemProjection): void;
  /** 跳到所选文字 (Issue #423, S77 deferred item d): the caret moved to the paragraph a selection Task was started on. */
  jumpToSelection(entry: BookTaskItemProjection & { selection: NonNullable<BookTaskItemProjection['selection']> }): void;
  /** 发起全书任务: prepare the procedure's Task, and start it under its rule when `quick` names one. */
  startWholeBook(input: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; quick: DefaultExecutionRuleReference | null }): Promise<void>;
  /** A card's 暂停 or 续行 was recorded: the surfaces of the analysis read it again. */
  onRecorded(bookId: string): void;
  /** 发起全书任务… (Issue #423, slice 7a; TASK-001): the Context-bound Task Composer on the whole Book. */
  openComposer(): void;
  /** A draft's card's 继续编辑草稿: the draft in the composer. */
  openDraft(draftId: string): void;
  /** An unfinished draft left on another Book (TASK-006), which 返回继续 opens there; `null` when there is none. */
  parked(): null | { readonly bookId: string; readonly bookTitle: string };
  resumeParked(): void;
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
export function composeOptions(projection: Pick<BaselineAnalysisProjection, 'actions'> & { updateControls: { blockedByActiveRun: boolean; blockedReason: string | null; actions: Pick<NonNullable<BaselineAnalysisProjection['updateControls']>['actions'], 'sync-current' | 'reanalyze-book'> } | null }): ReadonlyArray<ComposeOption> {
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
  // An unfinished draft another Book holds (TASK-006): said once, with 返回继续.
  const parkedHost = el('div', 'task-panel-parked');
  const compose = el('section', 'task-panel-compose');
  const groups = el('div', 'task-panel-groups');
  element.append(scope, parkedHost, compose, groups, note);

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
    paintParked();
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
    // A ledger Task of another kind (Issue #760, S74c): its own plan.
    if (target.kind === 'task-plan' && target.ref !== null) return { kind: target.taskKind, ref: target.ref };
    return null;
  }

  async function act(entry: BookTaskItemProjection, entryAction: TaskPanelAction): Promise<void> {
    if (working || bookId === null) return;
    const target = entry.item.target;
    switch (entryAction.key) {
      case 'pause':
      case 'resume': {
        const taskIntentId = taskIntentOf(target);
        const planned = planOf(target);
        if (taskIntentId === null && (planned === null || planned.kind === 'fixed-task' || planned.kind === 'baseline-analysis')) return;
        const book = bookId;
        working = true;
        painted = '';
        paint();
        const pausing = entryAction.key === 'pause';
        options.setStatus(pausing ? '正在暂停任务…' : '正在续行…', 'busy');
        try {
          if (taskIntentId !== null) {
            if (pausing) await api.pauseBaselineAnalysisRun({ taskIntentId });
            else await api.resumeBaselineAnalysisRun({ taskIntentId });
          } else if (planned !== null && planned.kind !== 'fixed-task' && planned.kind !== 'baseline-analysis') {
            await api.controlTaskRun({ kind: planned.kind, ref: planned.ref, action: pausing ? 'pause' : 'resume' });
          }
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
      case 'answer':
        options.openResult(entry);
        return;
      case 'jump':
        if (entry.selection !== undefined) options.jumpToSelection({ ...entry, selection: entry.selection });
        return;
      case 'next':
        // A draft's 继续编辑草稿 (Issue #423, slice 7a): the draft in the composer, beside its Book's manuscript.
        if (target.kind === 'task-intent-draft') {
          options.openDraft(target.draftId);
          return;
        }
        if (target.kind === 'analysis-plan' || target.kind === 'review-plan' || target.kind === 'task-plan') {
          const plan = planOf(target)!;
          options.openPlan(plan.kind, plan.ref, false);
          return;
        }
        options.openTarget(target);
        return;
    }
  }

  // ---- 发起全书任务 ---------------------------------------------------------------------------------------

  function paintParked(): void {
    const parked = options.parked();
    if (parked === null || parked.bookId === bookId) {
      parkedHost.replaceChildren();
      parkedHost.hidden = true;
      return;
    }
    parkedHost.hidden = false;
    const resume = el('button', 'quiet', TASK_COMPOSER_ACTIONS.resume);
    resume.type = 'button';
    resume.dataset['taskComposerAction'] = 'resume';
    resume.addEventListener('click', () => options.resumeParked());
    parkedHost.replaceChildren(el('p', 'attention-note', taskComposerParkedLine(parked.bookTitle)), resume);
  }

  function paintCompose(): void {
    const heading = el('h3', undefined, TASK_PANEL_COMPOSE_HEADING);
    heading.id = uid('compose');
    compose.setAttribute('aria-labelledby', heading.id);
    // The composer first (TASK-001): the editor's own words, saved as a draft; the procedures below stay for 快速开始.
    const open = el('button', 'secondary task-panel-compose-open', TASK_PANEL_COMPOSE_OPEN);
    open.type = 'button';
    open.dataset['taskComposeAction'] = 'compose';
    open.disabled = working;
    open.addEventListener('click', () => options.openComposer());
    const opener = el('div', 'task-panel-compose-opener');
    opener.append(open, el('p', 'field-note', TASK_PANEL_COMPOSE_OPEN_NOTE));
    const lede = el('p', 'field-note', TASK_PANEL_COMPOSE_LEDE);
    const choices = analysis === null ? [] : composeOptions(analysis);
    if (choices.length === 0) {
      compose.replaceChildren(heading, opener, lede, el('p', 'field-note task-panel-compose-none', TASK_PANEL_COMPOSE_NONE));
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
    compose.replaceChildren(heading, opener, lede, fieldset, row, why);
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

// ---- The Context-bound Task Composer (Issue #423, wave 10 slice 7a; TASK-001 to 009, 042, 043, 046; #423 rev 6 slot) -----------

/** One range the composer carries: one the draft already pinned, by identity, or the exact words selected now. */
export interface ComposerRange {
  readonly key: string;
  readonly rangeId: string | null;
  readonly span: DialogueSelectionInput | null;
  readonly blockId: string;
  readonly text: string;
  readonly position: number | null;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly state: TaskIntentDraftRangeProjection['state'];
  readonly stateLabel: string | null;
  /** How many contiguous paragraphs a kept range spans (Issue #1176); a new range reads it from `span`. */
  readonly paragraphs?: number;
}

/** What a new composer opens on (TASK-001, 002): its Book, the manuscript as it stands, and the selection, if any. */
export interface TaskComposerSeed {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly origin: 'composer-selection' | 'composer-book';
  readonly manuscript: null | { readonly revisionLabel: string; readonly journalSequence: number; readonly pending: boolean };
  readonly ranges: ReadonlyArray<ComposerRange>;
  readonly goal?: string;
  readonly outcomeClass?: TaskIntentOutcomeClass | null;
  /** Said under the context, once: why the seed differs from what the editor may expect (另起一份草稿). */
  readonly note?: string;
}

export interface TaskComposerOptions {
  readonly api: Pick<RendererApi, 'saveTaskIntentDraft' | 'inspectTaskIntentDrafts' | 'promoteTaskIntentDraft'>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  /** 再选一段加入 (TASK-046): the words selected in the Book's manuscript now, or why there are none. */
  pickRange(bookId: string): Promise<ComposerRange | string>;
  /** 按现成工序准备…: the house's 工序 on the one selected paragraph, in the composer that prepares one at once. */
  openProcedures(bookId: string, range: ComposerRange): void;
  /** The manuscript's own edits are written first (TASK-039): `false` leaves everything as it is. */
  settle(): Promise<boolean>;
  /** 准备计划 made a prepared Task, or 查看计划 of one: its plan, where it is started. */
  openPlan(bookId: string, kind: TaskPlanKind, ref: string): void;
  /** 另起一份草稿 from a promoted draft: a new composer with its words. */
  openNew(seed: TaskComposerSeed): void;
  /** 收起 / 取消: the composer is done; a saved draft waits in 等你处理. */
  close(): void;
  /** A draft was saved or promoted: whatever lists drafts reads again. */
  onChanged(bookId: string): void;
}

export interface TaskComposerSurface {
  readonly element: HTMLElement;
  openNew(seed: TaskComposerSeed): void;
  openDraft(bookId: string, draftId: string): void;
  /** What the composer holds (TASK-006): its Book, its draft, and whether anything on it is unsaved; `null` when empty. */
  held(): null | { readonly bookId: string; readonly bookTitle: string; readonly draftId: string | null; readonly unsaved: boolean; readonly promoted: boolean };
  /** Keep these unsaved fields on their Book while another composer is opened. */
  park(): () => void;
  /** Nothing is read until the composer is shown again; what it holds stays. */
  stop(): void;
}

interface ComposerState {
  bookId: string;
  bookTitle: string;
  origin: 'composer-selection' | 'composer-book' | 'dialogue-answer';
  draftId: string | null;
  ordinal: number | null;
  versionId: string | null;
  goal: string;
  outcomeClass: TaskIntentOutcomeClass | null;
  target: 'book' | 'ranges';
  ranges: ComposerRange[];
  pin: null | { procedureId: string; versionId: string; title: string | null };
  manuscript: TaskComposerSeed['manuscript'];
  answer: TaskIntentDraftAnswerProjection | null;
  promotion: TaskIntentDraftProjection['promotion'];
  resolution: TaskIntentDraftResolution | null;
  note: string | null;
  dirty: boolean;
  choice: number | null;
  audience: string;
  channel: string;
}

/** The lowercase hex SHA-256 of the current goal text, for the recommendation slot's `data-goal-digest` (#423 rev 6). */
async function goalDigest(goal: string): Promise<string> {
  const bytes = new TextEncoder().encode(goal);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The ranges a draft holds, as the composer carries them. */
function keptRanges(draft: TaskIntentDraftProjection): ComposerRange[] {
  return draft.version.ranges.map((range) => ({
    key: range.rangeId, rangeId: range.rangeId, span: null, blockId: range.blockId, text: range.text, position: range.position,
    revisionLabel: range.revisionLabel, journalSequence: range.journalSequence, state: range.state, stateLabel: range.stateLabel,
    paragraphs: range.span?.length ?? 1,
  }));
}

/**
 * The Context-bound Task Composer (Issue #423, slice 7a; editor-surfaces §1 and §6; V2-UX-TASK-001 to 009, 042, 043, 046): on demand
 * and transient — opened from a selection's 就这段发起任务… or the panel's 发起全书任务, never a standing field — it says the exact
 * Book, manuscript, revision and ranges it carries, and the editor writes what AI7 should do. 准备任务 saves a durable, versioned
 * Task Intent Draft and nothing else: no model call, no transmission, no Run Record (TASK-004). Saved, the same surface edits the
 * draft — every change a new version — and 准备计划 makes it a prepared Task through the existing preparation of the kind it
 * resolves to, whose plan opens where it is started (decision 1). An input method's composition never triggers either (TASK-009).
 * The `data-procedure-recommendation` slot under the goal is slice 7c's: this surface renders it empty, keeps it across repaints,
 * updates only its attributes, and keeps the 工序 the slot's events pick by identity (#423 rev 6).
 */
export function mountTaskComposer(options: TaskComposerOptions): TaskComposerSurface {
  const { api } = options;
  const element = el('section', 'task-composer');
  element.dataset['taskComposer'] = 'closed';
  /** The recommendation slot (#423 rev 6): created once per composer and moved, never rebuilt, so 7c's children stay. */
  let slot = el('div', 'task-composer-recommendation');
  let state: ComposerState | null = null;
  let working = false;
  let composing = false;
  let ticket = 0;
  let digestTicket = 0;

  const freshSlot = (): void => {
    slot = el('div', 'task-composer-recommendation');
    slot.dataset['procedureRecommendation'] = '';
  };
  freshSlot();

  element.addEventListener('procedure-recommendation-selected', (event) => {
    const detail = (event as CustomEvent<{ procedureId?: unknown; versionId?: unknown; title?: unknown }>).detail;
    if (state === null || state.promotion !== null || detail === null || typeof detail !== 'object' ||
        typeof detail.procedureId !== 'string' || typeof detail.versionId !== 'string') return;
    state.pin = { procedureId: detail.procedureId, versionId: detail.versionId, title: typeof detail.title === 'string' ? detail.title : null };
    state.dirty = true;
    render();
  });
  element.addEventListener('procedure-recommendation-cleared', () => {
    if (state === null || state.promotion !== null || state.pin === null) return;
    state.pin = null;
    state.dirty = true;
    render();
  });
  element.addEventListener('compositionstart', () => { composing = true; });
  element.addEventListener('compositionend', () => { composing = false; });

  /** The slot's attributes only — never its children — follow the draft (#423 rev 6). */
  function syncSlot(): void {
    if (state === null) return;
    slot.dataset['taskKind'] = state.outcomeClass ?? '';
    slot.dataset['scopeKind'] = state.target === 'ranges' ? 'selection' : 'whole-book';
    const mine = ++digestTicket;
    const goal = state.goal;
    void goalDigest(goal).then((digest) => {
      if (mine === digestTicket) slot.dataset['goalDigest'] = digest;
    }, () => undefined);
  }

  function problem(message: string): void {
    const node = element.querySelector<HTMLElement>('.task-composer-problem');
    if (node !== null) {
      node.textContent = message;
      node.hidden = false;
    }
    options.setStatus(message, 'error');
  }

  function mode(): 'new' | 'draft' | 'promoted' {
    return state === null || state.draftId === null ? 'new' : state.promotion !== null ? 'promoted' : 'draft';
  }

  function render(): void {
    if (state === null) return;
    const current = state;
    const active = document.activeElement instanceof HTMLElement && element.contains(document.activeElement)
      ? document.activeElement.dataset['taskComposerAction'] ?? document.activeElement.dataset['taskComposerField'] ?? null
      : null;
    const kind = mode();
    element.dataset['taskComposer'] = kind;
    element.dataset['taskComposerBook'] = current.bookId;
    if (current.draftId === null) delete element.dataset['taskComposerDraft'];
    else element.dataset['taskComposerDraft'] = current.draftId;
    const heading = el('h3', 'task-composer-title', kind === 'new'
      ? current.origin === 'composer-selection' ? TASK_COMPOSER_TITLES.selection : TASK_COMPOSER_TITLES.book
      : taskComposerDraftHeading(current.ordinal ?? 1));
    heading.id = uid('composer');
    element.setAttribute('aria-labelledby', heading.id);
    const parts: HTMLElement[] = [heading];

    // What it carries (TASK-002): the Book, the manuscript as it stands, and each range with how it stands.
    const context = el('section', 'task-composer-context');
    context.append(el('p', 'section-label', TASK_COMPOSER_CONTEXT_HEADING));
    const lines = el('ul', 'task-composer-context-lines');
    lines.append(el('li', 'task-composer-book', taskComposerBookLine(current.bookTitle)));
    if (current.manuscript !== null) {
      const revision = el('li', 'task-composer-revision', taskComposerRevisionLine(current.manuscript.revisionLabel, current.manuscript.journalSequence, current.manuscript.pending));
      revision.dataset['taskComposerPending'] = String(current.manuscript.pending);
      lines.append(revision);
    }
    context.append(lines);
    const editable = kind !== 'promoted';
    // 要处理什么 (TASK-003, 007): the selected words, or the whole manuscript — chosen, never defaulted to wider.
    const target = el('fieldset', 'task-composer-target');
    target.append(el('legend', undefined, TASK_COMPOSER_TARGET_LEGEND));
    const targetName = uid('target');
    for (const value of ['ranges', 'book'] as const) {
      const label = el('label', 'task-composer-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = targetName;
      input.value = value;
      input.dataset['taskComposerField'] = `target-${value}`;
      input.checked = current.target === value;
      input.disabled = !editable || working || (value === 'ranges' && current.ranges.length === 0);
      input.addEventListener('change', () => {
        if (!input.checked || state === null) return;
        state.target = value;
        state.dirty = true;
        render();
      });
      label.append(input, el('span', undefined, TASK_COMPOSER_TARGET_LABELS[value]));
      target.append(label);
    }
    context.append(target);
    if (current.target === 'book') context.append(el('p', 'field-note task-composer-book-note', TASK_COMPOSER_BOOK_TARGET_NOTE));
    const ranges = el('ul', 'task-composer-ranges');
    if (current.ranges.length === 0) ranges.append(el('li', 'field-note task-composer-no-ranges', TASK_COMPOSER_NO_RANGES));
    for (const range of current.ranges) {
      const item = el('li', 'task-composer-range');
      item.dataset['taskComposerRange'] = range.key;
      item.dataset['rangeState'] = range.state;
      const words = el('blockquote', 'editorial-mark-quote task-composer-range-text', range.text);
      const where = el('small', 'field-note', taskComposerRangeLine(range.position, [...range.text].length, range.revisionLabel, range.span?.span?.length ?? range.paragraphs ?? 1));
      item.append(words, where);
      if (range.stateLabel !== null) {
        const label = el('span', `status-pill review-pill task-composer-range-state task-composer-range-${range.state}`, range.stateLabel);
        label.dataset['rangeStateLabel'] = range.state;
        item.append(label);
      }
      if (editable) {
        const remove = el('button', 'quiet', TASK_COMPOSER_RANGE_REMOVE);
        remove.type = 'button';
        remove.dataset['taskComposerAction'] = 'remove-range';
        remove.dataset['rangeKey'] = range.key;
        remove.disabled = working;
        remove.addEventListener('click', () => {
          if (state === null) return;
          state.ranges = state.ranges.filter((entry) => entry.key !== range.key);
          state.dirty = true;
          render();
        });
        item.append(remove);
      }
      ranges.append(item);
    }
    context.append(ranges);
    if (editable) {
      const add = el('button', 'quiet task-composer-add-range', TASK_COMPOSER_ADD_RANGE);
      add.type = 'button';
      add.dataset['taskComposerAction'] = 'add-range';
      add.disabled = working;
      add.addEventListener('click', () => void addRange());
      context.append(add);
    }
    if (current.note !== null) context.append(el('p', 'field-note task-composer-seed-note', current.note));
    parts.push(context);

    // The goal, in the editor's own words (TASK-001, 005).
    const goalLabel = el('label', 'task-composer-goal');
    const goalCaption = el('span', undefined, TASK_COMPOSER_GOAL_LABEL);
    const goal = el('textarea');
    goal.rows = 3;
    goal.maxLength = MAX_TASK_INTENT_GOAL_LENGTH;
    goal.placeholder = TASK_COMPOSER_GOAL_PLACEHOLDER;
    goal.value = current.goal;
    goal.readOnly = !editable;
    goal.dataset['taskComposerField'] = 'goal';
    const count = el('small', 'field-note task-composer-count', taskComposerGoalCount([...current.goal].length, MAX_TASK_INTENT_GOAL_LENGTH));
    goal.addEventListener('input', () => {
      if (state === null) return;
      state.goal = goal.value;
      state.dirty = true;
      count.textContent = taskComposerGoalCount([...goal.value].length, MAX_TASK_INTENT_GOAL_LENGTH);
      syncSlot();
      syncActions();
    });
    // An input method's Enter ends its composition and nothing else (TASK-009): Ctrl/⌘+Enter prepares only outside one.
    goal.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      if (event.isComposing || event.keyCode === 229 || composing) return;
      event.preventDefault();
      if (mode() === 'new') void prepare();
      else if (mode() === 'draft') void save();
    });
    goalLabel.append(goalCaption, goal, count);
    parts.push(goalLabel);

    // Slice 7c's slot (#423 rev 6), right under the goal, and the 工序 its events picked.
    syncSlot();
    parts.push(slot);
    if (current.pin !== null) {
      const chip = el('p', 'task-composer-pin');
      chip.dataset['taskComposerPin'] = current.pin.procedureId;
      chip.append(el('span', undefined, taskComposerPinLine(current.pin.title)));
      if (editable) {
        const clear = el('button', 'quiet', '×');
        clear.type = 'button';
        clear.title = TASK_COMPOSER_ACTIONS.clearPin;
        clear.setAttribute('aria-label', TASK_COMPOSER_ACTIONS.clearPin);
        clear.dataset['taskComposerAction'] = 'clear-pin';
        clear.addEventListener('click', () => {
          if (state === null) return;
          state.pin = null;
          state.dirty = true;
          render();
        });
        chip.append(clear);
      }
      parts.push(chip);
    }

    // The intended outcome (TASK-005): the kind the draft becomes is chosen from it and the target alone.
    const outcome = el('fieldset', 'task-composer-outcome');
    outcome.append(el('legend', undefined, TASK_COMPOSER_OUTCOME_LEGEND));
    const outcomeName = uid('outcome');
    for (const value of TASK_INTENT_OUTCOME_CLASSES) {
      const label = el('label', 'task-composer-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = outcomeName;
      input.value = value;
      input.dataset['taskComposerField'] = `outcome-${value}`;
      input.checked = current.outcomeClass === value;
      input.disabled = !editable || working;
      input.addEventListener('change', () => {
        if (!input.checked || state === null) return;
        state.outcomeClass = value;
        state.dirty = true;
        state.choice = null;
        render();
      });
      label.append(input, el('span', undefined, TASK_COMPOSER_OUTCOME_LABELS[value]));
      outcome.append(label);
    }
    parts.push(outcome);

    // A draft made from a dialogue answer keeps the answer, said as generated content, with where it came from (DIALOG-016).
    if (current.answer !== null) {
      const answer = el('section', 'task-composer-answer');
      answer.dataset['taskComposerAnswer'] = current.answer.attemptId;
      answer.append(el('p', 'section-label', taskComposerAnswerHeading(current.answer.attemptOrdinal)));
      if (current.answer.rows.length > 0) {
        const rows = el('ul', 'task-composer-answer-rows');
        for (const row of current.answer.rows) rows.append(el('li', undefined, row));
        answer.append(rows);
      } else {
        answer.append(el('p', 'task-composer-answer-text', current.answer.text));
      }
      if (current.answer.truncated) answer.append(el('p', 'field-note', TASK_COMPOSER_ANSWER_TRUNCATED));
      answer.append(el('p', 'field-note', TASK_COMPOSER_ANSWER_NOTE));
      parts.push(answer);
    }

    // 准备成什么任务: decided from the draft, with a visible choice when several fit (decision 1).
    if (kind === 'draft' && current.resolution !== null) parts.push(resolutionBlock(current, current.resolution));
    if (kind === 'promoted') parts.push(el('p', 'attention-note task-composer-promoted', TASK_COMPOSER_PROMOTED));

    parts.push(el('p', 'field-note task-composer-note', TASK_COMPOSER_NOTE));
    const problemLine = el('p', 'attention-note task-composer-problem');
    problemLine.setAttribute('role', 'alert');
    problemLine.hidden = true;
    parts.push(problemLine);
    const unsaved = el('p', 'field-note task-composer-unsaved', TASK_COMPOSER_UNSAVED);
    unsaved.hidden = !(kind === 'draft' && current.dirty);
    parts.push(unsaved);
    parts.push(actionRow(kind));
    element.replaceChildren(...parts);
    if (active !== null) {
      const target = element.querySelector<HTMLElement>(`[data-task-composer-action="${CSS.escape(active)}"], [data-task-composer-field="${CSS.escape(active)}"]`);
      if (target !== null && !(target instanceof HTMLButtonElement && target.disabled)) target.focus();
    }
    syncActions();
  }

  function resolutionBlock(current: ComposerState, resolution: TaskIntentDraftResolution): HTMLElement {
    const section = el('section', 'task-composer-resolution');
    section.dataset['taskComposerResolution'] = resolution.state;
    section.append(el('p', 'section-label', TASK_COMPOSER_RESOLUTION_HEADING));
    if (resolution.state === 'unsupported') {
      section.append(el('p', 'field-note task-composer-unsupported', resolution.reason));
      return section;
    }
    if (resolution.state === 'ready') {
      current.choice = 0;
      section.append(el('p', 'field-note task-composer-ready', taskComposerResolutionReady(resolution.option.label)));
    } else {
      section.append(el('p', 'field-note', TASK_COMPOSER_RESOLUTION_CHOOSE));
      const name = uid('choice');
      resolution.options.forEach((option, index) => {
        const label = el('label', 'task-composer-choice');
        const input = el('input');
        input.type = 'radio';
        input.name = name;
        input.value = String(index);
        input.dataset['taskComposerField'] = `choice-${index}`;
        input.checked = current.choice === index;
        input.disabled = working || !option.available;
        input.addEventListener('change', () => {
          if (!input.checked || state === null) return;
          state.choice = index;
          render();
        });
        label.append(input, el('span', undefined, option.label));
        if (!option.available && option.reason !== null) label.append(el('small', 'field-note', option.reason));
        section.append(label);
      });
    }
    const chosen = chosenOption(current);
    if (chosen !== null && chosen.choice.kind === 'writing') {
      for (const [key, caption] of [['audience', TASK_COMPOSER_WRITING_AUDIENCE], ['channel', TASK_COMPOSER_WRITING_CHANNEL]] as const) {
        const label = el('label', 'task-composer-writing');
        const input = el('input');
        input.type = 'text';
        input.maxLength = 60;
        input.value = current[key];
        input.dataset['taskComposerField'] = `writing-${key}`;
        input.addEventListener('input', () => {
          if (state !== null) state[key] = input.value;
        });
        label.append(el('span', undefined, caption), input);
        section.append(label);
      }
    }
    return section;
  }

  function chosenOption(current: ComposerState): TaskIntentDraftOption | null {
    const resolution = current.resolution;
    if (resolution === null || resolution.state === 'unsupported') return null;
    if (resolution.state === 'ready') return resolution.option;
    return current.choice === null ? null : resolution.options[current.choice] ?? null;
  }

  function button(label: string, action: string, className: string, run: () => void): HTMLButtonElement {
    const node = el('button', className, label);
    node.type = 'button';
    node.dataset['taskComposerAction'] = action;
    node.addEventListener('click', () => {
      if (!node.disabled) run();
    });
    return node;
  }

  function actionRow(kind: 'new' | 'draft' | 'promoted'): HTMLElement {
    const row = el('div', 'button-row compact-actions task-composer-actions');
    const current = state!;
    if (kind === 'new') {
      // The house's 工序 on the one paragraph stays a route of its own (TASK-046's 常用工序): it prepares at once.
      if (current.origin === 'composer-selection' && current.ranges.length === 1 && current.ranges[0]!.span !== null) {
        const only = current.ranges[0]!;
        row.append(button(TASK_COMPOSER_PROCEDURES, 'procedures', 'quiet', () => {
          if (state === null || working) return;
          const book = state.bookId;
          state = null;
          element.dataset['taskComposer'] = 'closed';
          element.replaceChildren();
          options.openProcedures(book, only);
        }));
      }
      row.append(button(TASK_COMPOSER_ACTIONS.prepare, 'prepare', 'primary', () => void prepare()));
      row.append(button(TASK_COMPOSER_ACTIONS.cancel, 'close', 'quiet', () => finish()));
    } else if (kind === 'draft') {
      row.append(button(TASK_COMPOSER_ACTIONS.save, 'save', 'secondary', () => void save()));
      row.append(button(TASK_COMPOSER_ACTIONS.promote, 'promote', 'primary', () => void promote()));
      row.append(button(TASK_COMPOSER_ACTIONS.close, 'close', 'quiet', () => finish()));
    } else {
      const promotion = current.promotion!;
      row.append(button(TASK_COMPOSER_OPEN_PLAN, 'open-plan', 'primary', () => options.openPlan(current.bookId, promotion.taskKind, promotion.planRef)));
      row.append(button(TASK_COMPOSER_ACTIONS.copy, 'copy', 'secondary', () => options.openNew({
        bookId: current.bookId,
        bookTitle: current.bookTitle,
        origin: current.target === 'ranges' ? 'composer-selection' : 'composer-book',
        manuscript: current.manuscript,
        ranges: [],
        goal: current.goal,
        outcomeClass: current.outcomeClass,
        ...(current.ranges.length > 0 ? { note: TASK_COMPOSER_COPY_RANGES_DROPPED } : {}),
      })));
      row.append(button(TASK_COMPOSER_ACTIONS.close, 'close', 'quiet', () => finish()));
    }
    return row;
  }

  /** Which actions can be taken now: none while one is under way; 准备计划 only on the saved version (TASK-005). */
  function syncActions(): void {
    if (state === null) return;
    const current = state;
    const empty = current.goal.trim().length === 0 || (current.target === 'ranges' && current.ranges.length === 0);
    for (const node of element.querySelectorAll<HTMLButtonElement>('.task-composer-actions button, .task-composer-add-range, [data-task-composer-action="remove-range"]')) {
      const action = node.dataset['taskComposerAction'];
      node.disabled = working ||
        (action === 'prepare' && empty) ||
        (action === 'save' && (empty || !current.dirty)) ||
        (action === 'promote' && (current.dirty || current.resolution === null || current.resolution.state === 'unsupported'));
    }
    const unsaved = element.querySelector<HTMLElement>('.task-composer-unsaved');
    if (unsaved !== null) unsaved.hidden = !(mode() === 'draft' && current.dirty);
  }

  function finish(): void {
    if (working) return;
    ticket += 1;
    state = null;
    element.dataset['taskComposer'] = 'closed';
    element.replaceChildren();
    options.close();
  }

  async function addRange(): Promise<void> {
    if (state === null || working) return;
    const book = state.bookId;
    if (state.ranges.length >= MAX_TASK_INTENT_DRAFT_RANGES) {
      problem(taskComposerAddRangeLimit(MAX_TASK_INTENT_DRAFT_RANGES));
      return;
    }
    let picked = await options.pickRange(book);
    if (state === null || state.bookId !== book) return;
    if (typeof picked === 'string') {
      problem(picked);
      return;
    }
    if (state.manuscript?.pending === true && picked.rangeId === null) {
      picked = { ...picked, state: 'pending-save', stateLabel: TASK_COMPOSER_PENDING_LABEL };
    }
    if (state.ranges.some((range) => range.blockId === picked.blockId && range.text === picked.text &&
        (range.span === null || picked.span === null || (range.span.fromGrapheme === picked.span.fromGrapheme && range.span.toGrapheme === picked.span.toGrapheme)))) {
      problem(TASK_COMPOSER_ADD_RANGE_SAME);
      return;
    }
    state.ranges = [...state.ranges, picked];
    state.target = 'ranges';
    state.dirty = true;
    render();
  }

  function targetInput(current: ComposerState): SaveTaskIntentDraftInput['target'] {
    return current.target === 'book'
      ? { kind: 'book' }
      : { kind: 'ranges', ranges: current.ranges.map((range) => range.rangeId !== null ? { kind: 'kept' as const, rangeId: range.rangeId } : { kind: 'new' as const, span: range.span! }) };
  }

  /** 准备任务 (TASK-004): a durable draft of exactly what the composer shows; then the composer edits that draft. */
  async function prepare(): Promise<void> {
    if (state === null || working || mode() !== 'new') return;
    if (composing) {
      options.setStatus(TASK_COMPOSER_STATUS.composing, 'error');
      return;
    }
    const current = state;
    if (current.target === 'ranges' && current.ranges.length === 0) {
      problem(TASK_COMPOSER_NO_RANGES);
      return;
    }
    if (current.goal.trim().length === 0) {
      problem(TASK_COMPOSER_STATUS.goalEmpty);
      return;
    }
    working = true;
    syncActions();
    options.setStatus(TASK_COMPOSER_STATUS.saving, 'busy');
    try {
      const draft = await api.saveTaskIntentDraft({
        draftId: null, expectedOrdinal: null, origin: current.origin === 'dialogue-answer' ? 'composer-book' : current.origin, goal: current.goal,
        target: targetInput(current), outcomeClass: current.outcomeClass,
        ...(current.pin === null ? {} : { procedurePin: { procedureId: current.pin.procedureId, versionId: current.pin.versionId } }),
      });
      if (state !== current) return;
      apply(draft, current.manuscript, current.pin?.title ?? null);
      options.setStatus(TASK_COMPOSER_STATUS.saved, 'success');
      options.onChanged(draft.bookId);
    } catch (error) {
      if (state === current) problem(options.errorMessage(error, TASK_COMPOSER_STATUS.saveFailed));
    } finally {
      working = false;
      if (state !== null) render();
    }
  }

  /** 保存修改 (TASK-005): a new version over the one on show; a version saved meanwhile is refused, never overwritten. */
  async function save(): Promise<void> {
    if (state === null || working || mode() !== 'draft' || !state.dirty) return;
    if (composing) {
      options.setStatus(TASK_COMPOSER_STATUS.composing, 'error');
      return;
    }
    const current = state;
    if (current.target === 'ranges' && current.ranges.length === 0) {
      problem(TASK_COMPOSER_NO_RANGES);
      return;
    }
    if (current.goal.trim().length === 0) {
      problem(TASK_COMPOSER_STATUS.goalEmpty);
      return;
    }
    working = true;
    syncActions();
    options.setStatus(TASK_COMPOSER_STATUS.saving, 'busy');
    try {
      const draft = await api.saveTaskIntentDraft({
        draftId: current.draftId, expectedOrdinal: current.ordinal, origin: 'composer-book', goal: current.goal,
        target: targetInput(current), outcomeClass: current.outcomeClass,
        procedurePin: current.pin === null ? null : { procedureId: current.pin.procedureId, versionId: current.pin.versionId },
      });
      if (state !== current) return;
      apply(draft, current.manuscript, current.pin?.title ?? null);
      options.setStatus(TASK_COMPOSER_STATUS.updated, 'success');
      options.onChanged(draft.bookId);
    } catch (error) {
      if (state === current) problem(options.errorMessage(error, TASK_COMPOSER_STATUS.saveFailed));
    } finally {
      working = false;
      if (state !== null) render();
    }
  }

  /** 准备计划 (decision 1): the existing preparation of the chosen kind, as one job; its plan opens, where it is started. */
  async function promote(): Promise<void> {
    if (state === null || working || composing || mode() !== 'draft') return;
    const current = state;
    const mine = ticket;
    if (current.dirty) {
      problem(TASK_COMPOSER_PROMOTE_SAVE_FIRST);
      return;
    }
    const option = chosenOption(current);
    if (option === null || current.draftId === null || current.versionId === null) {
      problem(current.resolution?.state === 'unsupported' ? current.resolution.reason : TASK_COMPOSER_PICK_CHOICE);
      return;
    }
    const writing = option.choice.kind === 'writing' ? { audience: current.audience.trim(), channel: current.channel.trim() } : null;
    if (writing !== null && (writing.audience.length === 0 || writing.channel.length === 0)) {
      problem(TASK_COMPOSER_WRITING_FIELDS);
      return;
    }
    working = true;
    syncActions();
    const draftId = current.draftId;
    try {
      // The Task Input revision is saved from the journal: what was typed in the manuscript is written first (TASK-039).
      if (!(await options.settle())) return;
      options.setStatus(TASK_COMPOSER_STATUS.preparing, 'busy');
      const initial = await api.promoteTaskIntentDraft({
        draftId, versionId: current.versionId, choice: option.choice, ...(writing === null ? {} : { writing }),
      });
      const done = await options.awaitServiceJob(initial, (job) => options.setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
      if (done.state === 'cancelled') {
        options.setStatus(TASK_COMPOSER_STATUS.cancelled, 'success');
        return;
      }
      const read = await api.inspectTaskIntentDrafts({ draftId });
      const draft = read.drafts[0];
      if (draft === undefined) throw new Error(TASK_COMPOSER_STATUS.promoteFailed);
      options.onChanged(draft.bookId);
      if (state !== current || mine !== ticket) return;
      apply(draft, current.manuscript, current.pin?.title ?? null);
      if (draft.promotion === null) throw new Error(TASK_COMPOSER_STATUS.promoteFailed);
      options.setStatus(TASK_COMPOSER_STATUS.prepared, 'success');
      options.openPlan(draft.bookId, draft.promotion.taskKind, draft.promotion.planRef);
    } catch (error) {
      if (state === current) problem(options.errorMessage(error, TASK_COMPOSER_STATUS.promoteFailed));
    } finally {
      working = false;
      if (state !== null && element.isConnected) render();
    }
  }

  function apply(draft: TaskIntentDraftProjection, manuscript: ComposerState['manuscript'], pinTitle: string | null): void {
    const previous = state;
    state = {
      bookId: draft.bookId,
      bookTitle: draft.bookTitle,
      origin: draft.origin,
      draftId: draft.draftId,
      ordinal: draft.version.ordinal,
      versionId: draft.version.versionId,
      goal: draft.version.goal,
      outcomeClass: draft.version.outcomeClass,
      target: draft.version.target,
      ranges: keptRanges(draft),
      pin: draft.version.procedurePin === null ? null : { ...draft.version.procedurePin, title: pinTitle },
      manuscript,
      answer: draft.version.answer,
      promotion: draft.promotion,
      resolution: draft.resolution,
      note: null,
      dirty: false,
      choice: draft.resolution?.state === 'ready' ? 0 : previous !== null && previous.draftId === draft.draftId ? previous.choice : null,
      audience: previous?.audience ?? '',
      channel: previous?.channel ?? '',
    };
    render();
  }

  return {
    element,
    openNew(seed) {
      ticket += 1;
      working = false;
      composing = false;
      freshSlot();
      state = {
        bookId: seed.bookId,
        bookTitle: seed.bookTitle,
        origin: seed.origin,
        draftId: null,
        ordinal: null,
        versionId: null,
        goal: seed.goal ?? '',
        outcomeClass: seed.outcomeClass ?? null,
        target: seed.origin === 'composer-selection' || seed.ranges.length > 0 ? 'ranges' : 'book',
        ranges: [...seed.ranges],
        pin: null,
        manuscript: seed.manuscript,
        answer: null,
        promotion: null,
        resolution: null,
        note: seed.note ?? null,
        dirty: false,
        choice: null,
        audience: '',
        channel: '',
      };
      const mine = ticket;
      const opened = state;
      element.dataset['taskComposer'] = 'loading';
      element.replaceChildren(el('p', 'field-note', TASK_COMPOSER_STATUS.reading));
      // The manuscript as it stands now (TASK-002): words pinned while the journal holds edits no revision holds are 待保存修订版.
      void api.inspectTaskIntentDrafts({ draftId: null }).then((read) => {
        if (mine !== ticket || state !== opened || read.manuscript === null) return;
        const pending = read.manuscript.pendingSave;
        opened.manuscript = { revisionLabel: read.manuscript.revisionLabel, journalSequence: read.manuscript.journalSequence, pending };
        opened.ranges = opened.ranges.map((range) => range.rangeId !== null ? range
          : { ...range, state: pending ? 'pending-save' : 'exact', stateLabel: pending ? TASK_COMPOSER_PENDING_LABEL : null });
      }, () => undefined).finally(() => {
        if (mine !== ticket || state !== opened) return;
        render();
        element.querySelector<HTMLTextAreaElement>('[data-task-composer-field="goal"]')?.focus();
      });
    },
    openDraft(bookId, draftId) {
      const mine = ++ticket;
      working = false;
      composing = false;
      if (state?.draftId !== draftId) freshSlot();
      const manuscript = state?.bookId === bookId ? state.manuscript : null;
      element.dataset['taskComposer'] = 'loading';
      element.replaceChildren(el('p', 'field-note', TASK_COMPOSER_STATUS.reading));
      void api.inspectTaskIntentDrafts({ draftId }).then((read) => {
        if (mine !== ticket) return;
        const draft = read.drafts[0];
        if (draft === undefined || draft.bookId !== bookId) throw new Error(TASK_COMPOSER_STATUS.unreadable);
        state = null;
        apply(draft, read.manuscript === null ? manuscript
          : { revisionLabel: read.manuscript.revisionLabel, journalSequence: read.manuscript.journalSequence, pending: read.manuscript.pendingSave }, null);
      }).catch((error: unknown) => {
        if (mine !== ticket) return;
        state = null;
        element.dataset['taskComposer'] = 'unavailable';
        element.replaceChildren(el('p', 'attention-note', options.errorMessage(error, TASK_COMPOSER_STATUS.unreadable)));
      });
    },
    held() {
      if (state === null) return null;
      return {
        bookId: state.bookId,
        bookTitle: state.bookTitle,
        draftId: state.draftId,
        unsaved: state.draftId === null ? state.goal.trim().length > 0 || state.ranges.length > 0 : state.dirty,
        promoted: state.promotion !== null,
      };
    },
    park() {
      const held = state;
      ticket += 1;
      return () => {
        ticket += 1;
        state = held;
        working = false;
        composing = false;
        freshSlot();
        render();
      };
    },
    stop() {
      ticket += 1;
    },
  };
}
