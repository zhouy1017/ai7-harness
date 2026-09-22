import type { RendererApi, ServiceJobProjection, TaskPlanKind, TaskPlanProjection } from '../shared/protocol.js';
import {
  TASK_BAR_SLOT_BUSY,
  TASK_BAR_START_FAILED,
  TASK_BAR_SAVED,
  TASK_DRAWER_BACK,
  TASK_DRAWER_BACK_REASON,
  TASK_DRAWER_CLOSE,
  TASK_DRAWER_FOOTER,
  TASK_DRAWER_LOADING,
  TASK_DRAWER_MODE_GROUP,
  TASK_DRAWER_MODE_KEY,
  TASK_DRAWER_MODES,
  TASK_DRAWER_SCREENS,
  TASK_DRAWER_TITLE,
  TASK_DRAWER_UNAVAILABLE,
  TASK_PLAN_AFTERWARDS,
  TASK_PLAN_BOUNDARY_COLUMNS,
  TASK_PLAN_CEILING_NOTE,
  TASK_PLAN_DEFAULT_RULE,
  TASK_PLAN_DEFAULT_RULE_REASON,
  TASK_PLAN_DRIFT_COLUMNS,
  TASK_PLAN_DRIFT_HEADING,
  TASK_PLAN_EDIT,
  TASK_PLAN_EDIT_REASON,
  TASK_PLAN_FULL_LINK,
  TASK_PLAN_GOAL_TERMS,
  TASK_PLAN_LOCKED,
  TASK_PLAN_LOCKED_NOTE,
  TASK_PLAN_MATERIALITY_LABELS,
  TASK_PLAN_NO_ADAPTATION,
  TASK_PLAN_NO_REFERENCE,
  TASK_PLAN_RESULT_TERMS,
  TASK_PLAN_SCOPE_TERMS,
  TASK_PLAN_SECTIONS,
  TASK_PLAN_SERVICE_TERMS,
  TASK_PLAN_STATE_PILLS,
  TASK_PLAN_TECHNICAL_NOT_DO,
  taskBarView,
  taskDrawerModeOf,
  taskPlanChips,
  taskPlanCompactRows,
  taskPlanSavedLine,
  type TaskBarAction,
  type TaskDrawerMode,
} from './task-drawer-labels.js';

/**
 * The Task Drawer (Issue #418, plan slice S72; editor-surfaces §6 ③, V2-UX-PLAN-001 to 012): one
 * right-side panel for the plan of every Task that exists today — J-03's fixed task, the baseline analysis
 * and a Review Run. It is mounted once, at the shell, and shows its plan beside whichever central
 * destination of the same Book is on screen: the manuscript, 工作概览, ②A or ②B (D3). At 1120 px and wider
 * it takes a column and the central area makes room for it; below, it lies over the page. It shares the
 * one supporting side slot with 导航: opening one closes the other (IA).
 *
 * The plan itself records nothing, and the footer says so whatever the drawer shows (PLAN-007). Since Issue
 * #420 (S74a) the footer region is also the authorization bar (§6 常驻授权条, V2-UX-AUTH-001 to 007), which
 * never scrolls away (LAYER-005): the plan's one summary line, AUTH-003's statement, and `开始任务`, whose one
 * activation records exactly the plan on show through its kind's own authorization — J-03's fixed task
 * record-only (ADR 0055), the analysis into the one execution slot, a Review Run's one approval into its
 * drive loop. A changed plan offers `重新确认计划` and `查看计划修订` instead; a route whose model service is
 * not connected offers `去设置连接` beside the disabled start; once started, the same region is the Run's
 * state and the way to its surface (AUTH-007). While the Run runs the drawer reads the plan again on its own.
 * 精简 is the default and the editor's choice is remembered in this renderer's own storage (PLAN-010); every
 * exact identity is in 完整's 查看技术详情 (LAYER-001, LAYER-007).
 */
export interface TaskPlanRequest {
  readonly bookId: string;
  readonly kind: TaskPlanKind;
  /** The Task Intent or the Review Run; `null` reads the Book's current Task of the kind. */
  readonly ref: string | null;
}

export interface TaskDrawerSurface {
  /** Show one Task's plan; `returnFocus` finds the control focus goes back to when the drawer closes. */
  open(request: TaskPlanRequest, returnFocus: () => HTMLElement | null): void;
  /** Read the plan on show again when it is one of `kind`'s: the surface that raised it just recorded something. */
  refresh(kind: TaskPlanKind): void;
  close(restoreFocus: boolean): void;
  isOpen(): boolean;
  /** The central destination changed: stay beside a destination of the same Book, close for anything else. */
  followScreen(state: string, bookId: string | null): void;
  /** The local service is gone: every control is disabled, as the rest of the window's are. */
  interrupt(): void;
}

type DrawerApi = Pick<RendererApi, 'inspectTaskPlan' | 'authorizeTaskAuthorization' | 'authorizeBaselineAnalysis' | 'authorizeReviewRun' | 'prepareBaselineAnalysis'>;

export interface MountTaskDrawerOptions {
  /** The shell's own side panel, beside `#screen`. */
  readonly root: HTMLElement;
  /** The element whose `data-task-drawer` says whether the central area makes room for the drawer. */
  readonly shell: HTMLElement;
  readonly api: DrawerApi;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  errorMessage(error: unknown, fallback: string): string;
  errorCode(error: unknown): string | null;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  /** The one side slot (IA): the drawer is opening, so 导航 closes. */
  onOpen(): void;
  /** The bar started the Task or reconfirmed its plan: the surfaces of that kind on screen read it again. */
  onRecorded(kind: TaskPlanKind, bookId: string): void;
  /** 查看运行 / 查看运行记录 / 查看审阅: the started Task's own surface (AUTH-007). */
  openRunSurface(plan: TaskPlanProjection): void;
  /** 去设置连接: 设置's model-service connections (§10, MODEL-008). */
  openConnectionSettings(): void;
}

/** How often the drawer reads a running Task's plan again, so the bar follows the Run to its end. */
const RUNNING_POLL_MS = 1_000;
/** The diff table the bar's 查看计划修订 shows and hides; one drawer, so one table. */
const DRIFT_TABLE_ID = 'task-drawer-drift-table';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function control(label: string, className: string, name: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset['taskDrawerControl'] = name;
  return node;
}

/** The editor's mode, read from this renderer's storage; storage that is unavailable reads as none (精简). */
function storedMode(): TaskDrawerMode {
  try {
    return taskDrawerModeOf(window.localStorage.getItem(TASK_DRAWER_MODE_KEY));
  } catch {
    return 'compact';
  }
}

function rememberMode(mode: TaskDrawerMode): void {
  try {
    window.localStorage.setItem(TASK_DRAWER_MODE_KEY, mode);
  } catch {
    // A mode that cannot be remembered is still the one on screen; the next launch opens in 精简.
  }
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `task-drawer-${prefix}-${identities}`;
}

export function mountTaskDrawer(options: MountTaskDrawerOptions): TaskDrawerSurface {
  const { root, shell, api } = options;
  let request: TaskPlanRequest | null = null;
  let plan: TaskPlanProjection | null = null;
  /** The plan as last painted, so a read that brought nothing new repaints nothing the editor has open. */
  let painted = '';
  let returnFocus: () => HTMLElement | null = () => null;
  let mode: TaskDrawerMode = storedMode();
  let ticket = 0;
  let interrupted = false;
  let focusTitle = false;
  /** A start or a reconfirmation is under way: every bar action waits for it. */
  let working = false;
  /** Why the last start or reconfirmation was refused, beside the actions until the next one or a new plan. */
  let refusal: string | null = null;
  /** Whether 查看计划修订 shows the diff; kept across the reads of the same plan version. */
  let diffShown = false;
  /** Focus belongs on the bar once the action that had it is gone: the start just replaced by the Run's state. */
  let focusBar = false;
  let pollTimer: number | undefined;

  root.classList.add('task-drawer');
  root.setAttribute('aria-labelledby', 'task-drawer-title');
  root.hidden = true;
  root.dataset['taskDrawer'] = 'closed';
  root.dataset['taskDrawerMode'] = mode;
  shell.dataset['taskDrawer'] = 'closed';

  const header = el('header', 'task-drawer-head');
  const back = control(TASK_DRAWER_BACK, 'quiet task-drawer-back', 'tasks');
  back.disabled = true;
  back.title = TASK_DRAWER_BACK_REASON;
  const backReason = el('span', 'task-drawer-hidden-reason', TASK_DRAWER_BACK_REASON);
  backReason.id = uid('back-reason');
  back.setAttribute('aria-describedby', backReason.id);
  const title = el('h2', 'task-drawer-title', TASK_DRAWER_TITLE);
  title.id = 'task-drawer-title';
  title.tabIndex = -1;
  const pill = el('span', 'status-pill review-pill task-drawer-pill');
  const modes = el('div', 'task-drawer-modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', TASK_DRAWER_MODE_GROUP);
  const modeButtons = (['compact', 'full'] as const).map((value) => {
    const button = control(TASK_DRAWER_MODES[value], 'task-drawer-mode', `mode-${value}`);
    button.dataset['taskDrawerMode'] = value;
    button.addEventListener('click', () => setMode(value, false));
    return button;
  });
  modes.append(...modeButtons);
  const close = control(TASK_DRAWER_CLOSE, 'quiet task-drawer-close', 'close');
  close.addEventListener('click', () => surface.close(true));
  header.append(back, title, pill, modes, close, backReason);
  const body = el('div', 'task-drawer-body');
  // The footer region never scrolls with the plan (LAYER-005): PLAN-007's line, then the authorization bar.
  const foot = el('div', 'task-drawer-foot');
  const footer = el('p', 'task-drawer-footer', TASK_DRAWER_FOOTER);
  const bar = el('section', 'task-drawer-bar');
  bar.setAttribute('aria-label', '开始任务');
  bar.hidden = true;
  foot.append(footer, bar);
  root.replaceChildren(header, body, foot);
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || root.hidden) return;
    event.preventDefault();
    surface.close(true);
  });

  function syncModeButtons(): void {
    root.dataset['taskDrawerMode'] = mode;
    for (const button of modeButtons) button.setAttribute('aria-pressed', button.dataset['taskDrawerMode'] === mode ? 'true' : 'false');
  }
  syncModeButtons();

  function setMode(next: TaskDrawerMode, focusToggle: boolean): void {
    mode = next;
    rememberMode(next);
    syncModeButtons();
    if (plan !== null) paint(plan, true);
    if (focusToggle) modeButtons.find((button) => button.dataset['taskDrawerMode'] === next)?.focus();
  }

  function disableAll(): void {
    for (const node of root.querySelectorAll<HTMLButtonElement>('button')) node.disabled = true;
  }

  function clearPoll(): void {
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  /** While the Run runs, read the plan again on a timer, so the bar follows it to its end wherever the editor is. */
  function schedulePoll(next: TaskPlanProjection): void {
    clearPoll();
    if (next.state.key !== 'running' || interrupted || root.hidden) return;
    pollTimer = window.setTimeout(() => {
      pollTimer = undefined;
      read();
    }, RUNNING_POLL_MS);
  }

  // ---- reading --------------------------------------------------------------------------------------

  function read(): void {
    const asked = request;
    if (asked === null) return;
    clearPoll();
    const mine = ++ticket;
    void api.inspectTaskPlan({ kind: asked.kind, ref: asked.ref }).then(
      (next) => {
        if (mine !== ticket || request !== asked || root.hidden) return;
        // The first answer names the Task a `null` ref meant, so later reads ask for that Task.
        request = { ...asked, ref: next.ref };
        paint(next, false);
      },
      (error) => {
        if (mine !== ticket || request !== asked || root.hidden) return;
        plan = null;
        painted = '';
        root.dataset['taskPlanState'] = 'unavailable';
        pill.textContent = '';
        pill.hidden = true;
        body.replaceChildren(el('p', 'attention-note task-drawer-unavailable', options.errorMessage(error, TASK_DRAWER_UNAVAILABLE)));
        bar.hidden = true;
        bar.replaceChildren();
        if (focusTitle) {
          focusTitle = false;
          title.focus();
        }
      },
    );
  }

  // ---- painting ---------------------------------------------------------------------------------------

  function paint(next: TaskPlanProjection, force: boolean): void {
    const key = JSON.stringify(next);
    const sameVersion = plan !== null && plan.ref === next.ref && plan.planVersion === next.planVersion;
    if (!force && key === painted && plan !== null) {
      schedulePoll(next);
      return;
    }
    if (!sameVersion) {
      diffShown = false;
      refusal = null;
    }
    const technicalOpen = sameVersion && body.querySelector<HTMLDetailsElement>('details.task-plan-technical')?.open === true;
    plan = next;
    painted = key;
    root.dataset['taskPlanKind'] = next.kind;
    root.dataset['taskPlanRef'] = next.ref;
    root.dataset['taskPlanState'] = next.state.key;
    root.dataset['taskPlanStart'] = next.start.readiness;
    if (next.planVersion === null) delete root.dataset['taskPlanVersion'];
    else root.dataset['taskPlanVersion'] = String(next.planVersion);
    const tone = TASK_PLAN_STATE_PILLS[next.state.key];
    pill.hidden = false;
    pill.className = `status-pill review-pill task-drawer-pill review-pill-${tone.tone}`;
    pill.dataset['pillTone'] = tone.tone;
    pill.dataset['pillShape'] = tone.shape;
    pill.textContent = next.state.label;
    const active = document.activeElement;
    const restore = active instanceof HTMLElement && (body.contains(active) || bar.contains(active)) ? active.dataset['taskDrawerControl'] ?? null : null;
    body.replaceChildren(goalBlock(next), ...(next.drift === null ? [] : [driftBlock(next.drift)]), mode === 'compact' ? compactBlock(next) : fullBlock(next));
    if (technicalOpen) {
      const details = body.querySelector<HTMLDetailsElement>('details.task-plan-technical');
      if (details) details.open = true;
    }
    paintBar(next);
    if (interrupted) disableAll();
    if (focusTitle) {
      focusTitle = false;
      title.focus();
    } else if (restore !== null && root.querySelector<HTMLElement>(`[data-task-drawer-control="${restore}"]:not(:disabled)`) !== null) {
      root.querySelector<HTMLElement>(`[data-task-drawer-control="${restore}"]:not(:disabled)`)!.focus();
    } else if (focusBar) {
      // The action that had focus is gone — the start the Run's state replaced — so focus goes to the bar's
      // first action, and to its state when it offers none; the state itself is announced as it changes.
      (bar.querySelector<HTMLElement>('button:not(:disabled)') ?? bar.querySelector<HTMLElement>('.task-bar-status'))?.focus();
    }
    focusBar = false;
    schedulePoll(next);
  }

  /** The disabled action with its reason in words beside it, not only in a tooltip. */
  function unavailable(label: string, name: string, reason: string, className = 'quiet'): HTMLElement {
    const wrap = el('span', 'task-plan-unavailable');
    const button = control(label, className, name);
    button.disabled = true;
    const why = el('small', 'field-note', reason);
    why.id = uid(name);
    button.setAttribute('aria-describedby', why.id);
    wrap.append(button, why);
    return wrap;
  }

  function goalBlock(next: TaskPlanProjection): HTMLElement {
    const section = el('section', 'task-plan-goal');
    const sentence = el('div', 'task-plan-sentence');
    sentence.append(el('p', 'task-plan-sentence-text', next.goal.sentence), unavailable(TASK_PLAN_EDIT, 'edit', TASK_PLAN_EDIT_REASON));
    const chips = el('ul', 'task-plan-chips');
    for (const chip of taskPlanChips(next.goal.chips)) {
      const item = el('li', `task-plan-chip task-plan-chip-${chip.key}`, chip.text);
      item.dataset['taskPlanChip'] = chip.key;
      chips.append(item);
    }
    section.append(sentence, chips);
    if (next.goal.savedForEdits) {
      section.append(el('p', 'field-note task-plan-saved', taskPlanSavedLine(next.goal.chips.taskInputRevision)));
    }
    return section;
  }

  /**
   * The plan's key content changed (S72 D8): why, how it is settled, and the diff in the drawer's words.
   * The table is shown and hidden by the bar's 查看计划修订 (S74a A4), which is where the action lives now.
   */
  function driftBlock(drift: NonNullable<TaskPlanProjection['drift']>): HTMLElement {
    const section = el('section', 'attention-note task-plan-drift');
    section.dataset['taskPlanDrift'] = drift.entries.length === 0 ? 'reasons' : 'diff';
    section.append(el('h3', undefined, TASK_PLAN_DRIFT_HEADING));
    for (const reason of drift.reasons) section.append(el('p', undefined, reason));
    section.append(el('p', 'task-plan-drift-resolution', drift.resolution));
    if (drift.entries.length === 0) return section;
    const table = el('table', 'task-plan-drift-table');
    table.id = DRIFT_TABLE_ID;
    table.hidden = !diffShown;
    const head = el('tr');
    for (const column of TASK_PLAN_DRIFT_COLUMNS) {
      const cell = el('th', undefined, column);
      cell.scope = 'col';
      head.append(cell);
    }
    table.append(head);
    for (const entry of drift.entries) {
      const row = el('tr');
      row.dataset['driftField'] = entry.field;
      row.dataset['driftMateriality'] = entry.materiality;
      const cells: ReadonlyArray<readonly [string, string]> = [
        [TASK_PLAN_DRIFT_COLUMNS[0], entry.label],
        [TASK_PLAN_DRIFT_COLUMNS[1], entry.prior],
        [TASK_PLAN_DRIFT_COLUMNS[2], entry.proposed],
        [TASK_PLAN_DRIFT_COLUMNS[3], TASK_PLAN_MATERIALITY_LABELS[entry.materiality]],
      ];
      for (const [column, text] of cells) {
        const cell = el('td', undefined, text);
        cell.dataset['label'] = column;
        row.append(cell);
      }
      table.append(row);
    }
    section.append(table);
    return section;
  }

  function compactBlock(next: TaskPlanProjection): HTMLElement {
    const section = el('section', 'task-plan-compact');
    const rows = el('dl', 'task-plan-rows');
    for (const [term, text] of taskPlanCompactRows(next)) {
      const dt = el('dt', undefined, term);
      const dd = el('dd', undefined, text);
      dd.dataset['taskPlanRow'] = term;
      rows.append(dt, dd);
    }
    const full = control(TASK_PLAN_FULL_LINK, 'quiet task-plan-full-link', 'full-link');
    full.addEventListener('click', () => setMode('full', true));
    section.append(rows, full);
    return section;
  }

  function listOf(items: ReadonlyArray<string>, className: string): HTMLElement {
    const list = el('ul', className);
    for (const item of items) list.append(el('li', undefined, item));
    return list;
  }

  function planSection(index: number, ...content: ReadonlyArray<HTMLElement>): HTMLElement {
    const section = el('section', 'task-plan-section');
    section.dataset['taskPlanSection'] = String(index + 1);
    const heading = el('h3');
    heading.append(el('span', 'task-plan-section-number', String(index + 1)), TASK_PLAN_SECTIONS[index] ?? '');
    section.append(heading, ...content);
    return section;
  }

  function facts(rows: ReadonlyArray<readonly [string, string | HTMLElement]>): HTMLElement {
    const list = el('dl', 'task-plan-facts');
    for (const [term, value] of rows) {
      const dd = el('dd');
      if (typeof value === 'string') dd.textContent = value;
      else dd.append(value);
      dd.dataset['taskPlanTerm'] = term;
      list.append(el('dt', undefined, term), dd);
    }
    return list;
  }

  function fullBlock(next: TaskPlanProjection): HTMLElement {
    const whole = el('div', 'task-plan-full');
    const steps = el('ol', 'task-plan-steps');
    for (const step of next.steps) {
      const item = el('li');
      item.append(el('span', 'task-plan-step', step.label), el('span', 'task-plan-step-result', `→ ${step.result}`));
      steps.append(item);
    }
    const usage = el('span');
    usage.append(next.service.usage);
    if (next.service.usageIsCeiling) usage.append(el('small', 'field-note task-plan-ceiling-note', TASK_PLAN_CEILING_NOTE));
    const participation = [next.participation.during, ...(next.participation.after === null ? [] : [`${TASK_PLAN_AFTERWARDS}：${next.participation.after}`])];
    whole.append(
      planSection(0, facts([[TASK_PLAN_GOAL_TERMS[0], next.goal.sentence], [TASK_PLAN_GOAL_TERMS[1], listOf(next.outcomes, 'task-plan-list')]])),
      planSection(1, facts([
        [TASK_PLAN_SCOPE_TERMS[0], next.scope.process],
        [TASK_PLAN_SCOPE_TERMS[1], next.scope.reference.length === 0 ? TASK_PLAN_NO_REFERENCE : listOf(next.scope.reference, 'task-plan-list')],
        [TASK_PLAN_SCOPE_TERMS[2], next.scope.send],
        [TASK_PLAN_SCOPE_TERMS[3], next.scope.notRead],
      ])),
      planSection(2, steps),
      planSection(3, listOf(participation, 'task-plan-list task-plan-participation')),
      planSection(4, facts([
        [TASK_PLAN_SERVICE_TERMS[0], next.service.role],
        [TASK_PLAN_SERVICE_TERMS[1], next.service.provider],
        [TASK_PLAN_SERVICE_TERMS[2], next.service.decision],
        [TASK_PLAN_SERVICE_TERMS[3], next.service.send],
        [TASK_PLAN_SERVICE_TERMS[4], next.service.sendCategory],
        [TASK_PLAN_SERVICE_TERMS[5], usage],
        [TASK_PLAN_SERVICE_TERMS[6], next.service.duration],
        [TASK_PLAN_SERVICE_TERMS[7], next.service.budgetCeiling],
        [TASK_PLAN_SERVICE_TERMS[8], next.service.accountLimit],
      ])),
      planSection(5, facts([
        [TASK_PLAN_RESULT_TERMS[0], listOf(next.outcomes, 'task-plan-list')],
        [TASK_PLAN_RESULT_TERMS[1], listOf(next.notDo.editorial, 'task-plan-list task-plan-not-do')],
      ])),
      boundaryBlock(next),
      unavailable(TASK_PLAN_DEFAULT_RULE, 'default-rule', TASK_PLAN_DEFAULT_RULE_REASON),
      technicalBlock(next),
    );
    return whole;
  }

  function boundaryBlock(next: TaskPlanProjection): HTMLElement {
    const section = el('section', 'task-plan-boundary');
    const adaptable = el('div', 'task-plan-boundary-column');
    adaptable.dataset['taskPlanBoundary'] = 'adaptable';
    adaptable.append(el('h4', undefined, TASK_PLAN_BOUNDARY_COLUMNS[0]),
      listOf(next.boundary.adaptable.length === 0 ? [TASK_PLAN_NO_ADAPTATION] : next.boundary.adaptable, 'task-plan-list'));
    const askFirst = el('div', 'task-plan-boundary-column');
    askFirst.dataset['taskPlanBoundary'] = 'ask-first';
    const locked = el('ul', 'task-plan-list task-plan-locked');
    for (const item of next.boundary.askFirst) {
      const entry = el('li');
      entry.append(el('span', 'task-plan-lock', TASK_PLAN_LOCKED), item);
      locked.append(entry);
    }
    askFirst.append(el('h4', undefined, TASK_PLAN_BOUNDARY_COLUMNS[1]), locked, el('p', 'field-note', TASK_PLAN_LOCKED_NOTE));
    section.append(adaptable, askFirst);
    return section;
  }

  function technicalBlock(next: TaskPlanProjection): HTMLElement {
    const rows: HTMLElement[] = [];
    for (const row of next.technical) {
      const value = el('dd', 'technical-identity', row.value);
      value.dataset['taskPlanTechnical'] = row.key;
      rows.push(el('dt', undefined, row.label), value);
    }
    const notDo = el('dd', 'technical-identity', next.notDo.technical.join('；'));
    notDo.dataset['taskPlanTechnical'] = 'not-do';
    rows.push(el('dt', undefined, TASK_PLAN_TECHNICAL_NOT_DO), notDo);
    const disclosure = options.technicalDetails('task-plan-technical-facts', ...rows);
    disclosure.classList.add('task-plan-technical');
    disclosure.querySelector('summary')?.setAttribute('data-task-drawer-control', 'technical');
    return disclosure;
  }

  // ---- the authorization bar (Issue #420, S74a) -------------------------------------------------------

  /**
   * §6 常驻授权条: the plan's summary line, AUTH-003's statement and what this state offers (`taskBarView`),
   * with a refused start's reason beside the actions until the next attempt. Once the Task has started, the
   * same region states the Run and leads to its surface, and offers nothing that would start it again.
   */
  function paintBar(next: TaskPlanProjection): void {
    const view = taskBarView(next);
    bar.hidden = false;
    bar.dataset['taskBar'] = view.readiness;
    const parts: HTMLElement[] = [el('p', 'task-bar-summary', view.summary)];
    if (view.status !== null) {
      const status = el('p', 'task-bar-status', view.status);
      status.setAttribute('role', 'status');
      status.tabIndex = -1;
      parts.push(status);
    }
    if (view.statement !== null) parts.push(el('p', 'task-bar-statement', view.statement));
    let noteId: string | null = null;
    if (view.note !== null) {
      const note = el('p', 'task-bar-note', view.note);
      note.dataset['taskBarNote'] = view.readiness;
      noteId = uid('bar-note');
      note.id = noteId;
      parts.push(note);
    }
    if (refusal !== null) {
      const refused = el('p', 'task-bar-refusal', refusal);
      refused.setAttribute('role', 'alert');
      parts.push(refused);
    }
    const actions = el('div', 'task-bar-actions');
    for (const action of view.actions) actions.append(barAction(action, noteId));
    parts.push(actions);
    bar.replaceChildren(...parts);
    if (working) for (const button of bar.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
  }

  function barAction(action: TaskBarAction, noteId: string | null): HTMLElement {
    if (action.disabledReason !== null) {
      // The start that waits for a connection says why in the note beside it; the others carry their own reason.
      if (action.name === 'start' && noteId !== null) {
        const start = control(action.label, action.tone, action.name);
        start.disabled = true;
        start.setAttribute('aria-describedby', noteId);
        return start;
      }
      return unavailable(action.label, action.name, action.disabledReason, action.tone);
    }
    const button = control(action.label, action.tone, action.name);
    switch (action.name) {
      case 'start':
        button.addEventListener('click', () => void start());
        break;
      case 'reconfirm-plan':
        button.addEventListener('click', () => void reconfirm());
        break;
      case 'view-plan-revision':
        button.setAttribute('aria-controls', DRIFT_TABLE_ID);
        button.setAttribute('aria-expanded', diffShown ? 'true' : 'false');
        button.addEventListener('click', () => {
          diffShown = !diffShown;
          const table = body.querySelector<HTMLElement>(`#${DRIFT_TABLE_ID}`);
          if (table) table.hidden = !diffShown;
          button.setAttribute('aria-expanded', diffShown ? 'true' : 'false');
          if (diffShown) table?.scrollIntoView({ block: 'nearest' });
        });
        break;
      case 'connect':
        button.addEventListener('click', () => options.openConnectionSettings());
        break;
      case 'save-draft':
        button.addEventListener('click', () => {
          options.setStatus(TASK_BAR_SAVED, 'success');
          surface.close(true);
        });
        break;
      case 'run-link':
        button.addEventListener('click', () => {
          if (plan !== null) options.openRunSurface(plan);
        });
        break;
      case 'revise':
        break;
    }
    return button;
  }

  /** Every bar action waits while one is under way; the bar is painted again when it ends. */
  function beginWork(): boolean {
    if (working || interrupted || plan === null || request === null) return false;
    working = true;
    refusal = null;
    for (const button of bar.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
    return true;
  }

  /**
   * The action ended. A refusal is said at once beside the actions, which are offered again with focus back
   * on the one that was refused; either way the plan is read again — started, reconfirmed, or unchanged.
   */
  function endWork(asked: TaskPlanRequest | null): void {
    working = false;
    if (interrupted || root.hidden) return;
    // A read replaces the request object; compare the Task identity, not object identity.
    const sameTask = asked !== null && request !== null
      && asked.bookId === request.bookId && asked.kind === request.kind && asked.ref === request.ref;
    if (!sameTask) {
      // An old action must not put its refusal or focus into a different Task's drawer.
      refusal = null;
      focusBar = false;
    }
    if (refusal !== null && plan !== null) {
      paintBar(plan);
      bar.querySelector<HTMLElement>('[data-task-drawer-control="start"]:not(:disabled), [data-task-drawer-control="reconfirm-plan"]:not(:disabled)')?.focus();
    }
    // `working` is not part of the projection cache key. Even an unchanged plan must repaint
    // after cancellation, an intervening read, or opening another Task while this action ran.
    // Keep successful actions disabled until the fresh authority read has completed.
    painted = '';
    if (request !== null) read();
  }

  /**
   * 开始任务 (AUTH-002, AUTH-004): one activation records the Run Authorization and the Run Record for exactly
   * the plan on show — the digests the bar read with it — through the kind's own authorization: J-03's
   * record-only, the analysis into the one slot, a Review Run's one approval into its drive loop. A refusal
   * is said beside the actions — the one slot busy in the bar's own words — and nothing waits in a queue.
   */
  async function start(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || !beginWork()) return;
    const recordOnly = current.start.readiness === 'record-only' || current.start.readiness === 'no-route';
    options.setStatus(recordOnly ? '正在记录运行…' : '正在开始任务…', 'busy');
    try {
      if (current.kind === 'review-run') {
        await api.authorizeReviewRun({ reviewRunId: current.ref, planDigests: current.start.categoryDigests });
      } else {
        const planEnvelopeDigest = current.start.planEnvelopeDigest;
        if (planEnvelopeDigest === null) throw new Error(TASK_BAR_START_FAILED);
        if (current.kind === 'fixed-task') await api.authorizeTaskAuthorization({ taskIntentId: current.ref, planEnvelopeDigest });
        else await api.authorizeBaselineAnalysis({ taskIntentId: current.ref, planEnvelopeDigest });
      }
      // The status line names the event, never a state the Run will leave (V2-UX-LIVE-004): the bar shows the state.
      options.setStatus(current.kind === 'fixed-task' ? '已记录授权 · 未派发' : recordOnly ? '已记录运行；派发前会被阻止' : '已开始任务', 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorCode(error) === 'EXECUTION_BUSY' ? TASK_BAR_SLOT_BUSY : options.errorMessage(error, TASK_BAR_START_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  /**
   * 重新确认计划 (V2-UX-PLAN-009, AUTH-006): prepares the next plan version of the same Task Intent from the
   * change the pending Plan Revision proposes, exactly as ②A did before the action moved into the bar. The
   * drawer then reads the next version, whose bar offers 开始任务 again.
   */
  async function reconfirm(): Promise<void> {
    const current = plan;
    const asked = request;
    const input = current?.start.reconfirm ?? null;
    if (current === null || input === null || !beginWork()) return;
    options.setStatus('正在按变化后的关键内容重新确认计划…', 'busy');
    try {
      const initial = await api.prepareBaselineAnalysis({ goal: input.goal, update: input.update, reconfirm: true });
      const completed = await options.awaitServiceJob(initial, (job) => options.setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
      if (completed.state === 'cancelled') {
        options.setStatus('重新确认计划已取消；原计划保持不变。', 'success');
        return;
      }
      if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null || !('coverageManifest' in completed.result)) {
        throw new Error('重新确认计划未返回计划。');
      }
      options.setStatus(`计划已重新确认为版本 ${completed.result.planVersion?.ordinal ?? '?'}。`, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, '无法重新确认计划。');
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  // ---- the surface --------------------------------------------------------------------------------------

  const surface: TaskDrawerSurface = {
    open(next, finder) {
      request = next;
      returnFocus = finder;
      plan = null;
      painted = '';
      refusal = null;
      diffShown = false;
      clearPoll();
      root.hidden = false;
      root.dataset['taskDrawer'] = 'open';
      shell.dataset['taskDrawer'] = 'open';
      root.dataset['taskPlanKind'] = next.kind;
      delete root.dataset['taskPlanRef'];
      delete root.dataset['taskPlanVersion'];
      delete root.dataset['taskPlanStart'];
      root.dataset['taskPlanState'] = 'loading';
      pill.hidden = true;
      body.replaceChildren(el('p', 'field-note task-drawer-loading', TASK_DRAWER_LOADING));
      bar.hidden = true;
      bar.replaceChildren();
      options.onOpen();
      focusTitle = true;
      if (interrupted) disableAll();
      read();
    },
    refresh(kind) {
      if (request === null || root.hidden || request.kind !== kind || interrupted) return;
      read();
    },
    close(restoreFocus) {
      if (root.hidden) return;
      ticket += 1;
      clearPoll();
      request = null;
      plan = null;
      painted = '';
      refusal = null;
      root.hidden = true;
      root.dataset['taskDrawer'] = 'closed';
      shell.dataset['taskDrawer'] = 'closed';
      const target = restoreFocus ? returnFocus() : null;
      returnFocus = () => null;
      if (target !== null && target.isConnected) target.focus();
    },
    isOpen() {
      return !root.hidden;
    },
    followScreen(state, bookId) {
      if (request === null || root.hidden) return;
      if (bookId === null || bookId !== request.bookId || !TASK_DRAWER_SCREENS.includes(state)) {
        surface.close(false);
        return;
      }
      read();
    },
    interrupt() {
      interrupted = true;
      ticket += 1;
      clearPoll();
      disableAll();
    },
  };
  return surface;
}
