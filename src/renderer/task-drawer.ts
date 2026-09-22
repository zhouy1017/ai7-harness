import type { RendererApi, TaskPlanKind, TaskPlanProjection } from '../shared/protocol.js';
import {
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
  TASK_PLAN_DRIFT_VIEW,
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
  taskDrawerModeOf,
  taskPlanChips,
  taskPlanCompactRows,
  taskPlanSavedLine,
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
 * It reads the plan and states it; it records nothing. The actions that record an authorization stay on
 * the surfaces that raise each Task until S74 brings the authorization bar here, and the footer says so
 * whatever the drawer shows (PLAN-007). 精简 is the default and the editor's choice is remembered in this
 * renderer's own storage (PLAN-010); every exact identity is in 完整's 查看技术详情 (LAYER-001, LAYER-007).
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

export interface MountTaskDrawerOptions {
  /** The shell's own side panel, beside `#screen`. */
  readonly root: HTMLElement;
  /** The element whose `data-task-drawer` says whether the central area makes room for the drawer. */
  readonly shell: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectTaskPlan'>;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  errorMessage(error: unknown, fallback: string): string;
  /** The one side slot (IA): the drawer is opening, so 导航 closes. */
  onOpen(): void;
}

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
  let returnFocus: () => HTMLElement | null = () => null;
  let mode: TaskDrawerMode = storedMode();
  let ticket = 0;
  let interrupted = false;
  let focusTitle = false;

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
  const footer = el('p', 'task-drawer-footer', TASK_DRAWER_FOOTER);
  root.replaceChildren(header, body, footer);
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
    if (plan !== null) paint(plan);
    if (focusToggle) modeButtons.find((button) => button.dataset['taskDrawerMode'] === next)?.focus();
  }

  function disableAll(): void {
    for (const node of root.querySelectorAll<HTMLButtonElement>('button')) node.disabled = true;
  }

  // ---- reading --------------------------------------------------------------------------------------

  function read(): void {
    const asked = request;
    if (asked === null) return;
    const mine = ++ticket;
    void api.inspectTaskPlan({ kind: asked.kind, ref: asked.ref }).then(
      (next) => {
        if (mine !== ticket || request !== asked || root.hidden) return;
        // The first answer names the Task a `null` ref meant, so later reads ask for that Task.
        request = { ...asked, ref: next.ref };
        paint(next);
      },
      (error) => {
        if (mine !== ticket || request !== asked || root.hidden) return;
        plan = null;
        root.dataset['taskPlanState'] = 'unavailable';
        pill.textContent = '';
        pill.hidden = true;
        body.replaceChildren(el('p', 'attention-note task-drawer-unavailable', options.errorMessage(error, TASK_DRAWER_UNAVAILABLE)));
        if (focusTitle) {
          focusTitle = false;
          title.focus();
        }
      },
    );
  }

  // ---- painting ---------------------------------------------------------------------------------------

  function paint(next: TaskPlanProjection): void {
    plan = next;
    root.dataset['taskPlanKind'] = next.kind;
    root.dataset['taskPlanRef'] = next.ref;
    root.dataset['taskPlanState'] = next.state.key;
    if (next.planVersion === null) delete root.dataset['taskPlanVersion'];
    else root.dataset['taskPlanVersion'] = String(next.planVersion);
    const tone = TASK_PLAN_STATE_PILLS[next.state.key];
    pill.hidden = false;
    pill.className = `status-pill review-pill task-drawer-pill review-pill-${tone.tone}`;
    pill.dataset['pillTone'] = tone.tone;
    pill.dataset['pillShape'] = tone.shape;
    pill.textContent = next.state.label;
    const active = document.activeElement;
    const restore = active instanceof HTMLElement && body.contains(active) ? active.dataset['taskDrawerControl'] ?? null : null;
    body.replaceChildren(goalBlock(next), ...(next.drift === null ? [] : [driftBlock(next.drift)]), mode === 'compact' ? compactBlock(next) : fullBlock(next));
    if (interrupted) disableAll();
    if (focusTitle) {
      focusTitle = false;
      title.focus();
    } else if (restore !== null) {
      body.querySelector<HTMLElement>(`[data-task-drawer-control="${restore}"]`)?.focus();
    }
  }

  /** The disabled action with its reason in words beside it, not only in a tooltip. */
  function unavailable(label: string, name: string, reason: string): HTMLElement {
    const wrap = el('span', 'task-plan-unavailable');
    const button = control(label, 'quiet', name);
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

  function driftBlock(drift: NonNullable<TaskPlanProjection['drift']>): HTMLElement {
    const section = el('section', 'attention-note task-plan-drift');
    section.dataset['taskPlanDrift'] = drift.entries.length === 0 ? 'reasons' : 'diff';
    section.append(el('h3', undefined, TASK_PLAN_DRIFT_HEADING));
    for (const reason of drift.reasons) section.append(el('p', undefined, reason));
    section.append(el('p', 'task-plan-drift-resolution', drift.resolution));
    if (drift.entries.length === 0) return section;
    const table = el('table', 'task-plan-drift-table');
    table.id = uid('drift');
    table.hidden = true;
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
    const view = control(TASK_PLAN_DRIFT_VIEW, 'secondary', 'view-plan-revision');
    view.setAttribute('aria-expanded', 'false');
    view.setAttribute('aria-controls', table.id);
    view.addEventListener('click', () => {
      table.hidden = !table.hidden;
      view.setAttribute('aria-expanded', table.hidden ? 'false' : 'true');
    });
    section.append(view, table);
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

  // ---- the surface --------------------------------------------------------------------------------------

  const surface: TaskDrawerSurface = {
    open(next, finder) {
      request = next;
      returnFocus = finder;
      plan = null;
      root.hidden = false;
      root.dataset['taskDrawer'] = 'open';
      shell.dataset['taskDrawer'] = 'open';
      root.dataset['taskPlanKind'] = next.kind;
      delete root.dataset['taskPlanRef'];
      delete root.dataset['taskPlanVersion'];
      root.dataset['taskPlanState'] = 'loading';
      pill.hidden = true;
      body.replaceChildren(el('p', 'field-note task-drawer-loading', TASK_DRAWER_LOADING));
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
      request = null;
      plan = null;
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
      disableAll();
    },
  };
  return surface;
}
