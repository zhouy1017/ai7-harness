import type {
  ClarificationOptionId,
  RendererApi,
  RunBudgetCeilingState,
  ServiceJobProjection,
  TaskPlanClarificationProjection,
  TaskPlanKind,
  TaskPlanProjection,
  TaskPlanRunControlProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  parseBudgetCeiling,
  TASK_PLAN_BUDGET_APPLY,
  TASK_PLAN_BUDGET_CANCEL,
  TASK_PLAN_BUDGET_HINT,
  TASK_PLAN_BUDGET_INPUT,
  TASK_PLAN_BUDGET_INVALID,
  TASK_PLAN_BUDGET_NOTE,
  TASK_PLAN_BUDGET_REMOVE,
  TASK_PLAN_BUDGET_SET,
  taskPlanBudgetEdited,
  TASK_BAR_CANCEL_CONFIRM,
  TASK_BAR_CANCEL_FAILED,
  TASK_BAR_CANCEL_IMPACT_HEADING,
  TASK_BAR_CANCEL_KEEP,
  TASK_BAR_CANCEL_RUN_FAILED,
  TASK_BAR_CANCELLED,
  TASK_BAR_CANCELLING_NOTE,
  TASK_BAR_CANCELLED_NOTE,
  TASK_BAR_PAUSE_FAILED,
  TASK_BAR_PAUSING_NOTE,
  TASK_BAR_RESUME_FAILED,
  TASK_PLAN_ACTIVITY_STALE,
  TASK_PLAN_ACTIVITY_TITLE,
  TASK_PLAN_ACTIVITY_UNREPORTED,
  taskBarContinuationNote,
  taskPlanActivityIsStale,
  taskPlanActivityRows,
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
  TASK_PLAN_DEFAULT_RULE_CANCEL,
  TASK_PLAN_DEFAULT_RULE_CONFIRM,
  TASK_PLAN_DEFAULT_RULE_FAILED,
  TASK_PLAN_DEFAULT_RULE_HEADING,
  TASK_PLAN_DEFAULT_RULE_LEAD,
  TASK_PLAN_VIEW_RULES,
  taskPlanDefaultRuleCurrent,
  taskPlanDefaultRuleSet,
  taskPlanQuickStarted,
  TASK_PLAN_DRIFT_COLUMNS,
  TASK_PLAN_DRIFT_HEADING,
  TASK_PLAN_EDIT,
  TASK_PLAN_EDIT_REASON,
  TASK_PLAN_EDIT_ADAPTATION_WITHDRAWN,
  TASK_PLAN_EDIT_ADAPTATION_ASK_FIRST,
  taskPlanEditAskFirst,
  TASK_PLAN_CLARIFICATION_DEFER,
  TASK_PLAN_CLARIFICATION_FAILED,
  TASK_PLAN_CLARIFICATION_HEADING,
  TASK_PLAN_CLARIFICATION_RECOMMENDED,
  TASK_PLAN_CLARIFICATION_RECORD,
  TASK_PLAN_CLARIFICATION_REOPEN,
  TASK_PLAN_CLARIFICATION_SUBMIT,
  TASK_PLAN_CLARIFICATION_SUBMIT_REASON,
  TASK_PLAN_CLARIFICATION_SUBMITTED,
  taskBarQuestionsNote,
  TASK_PLAN_EDIT_ASK_FIRST_NOTE,
  TASK_PLAN_EDIT_RESTORE,
  TASK_PLAN_EDIT_STEP_REMOVED,
  TASK_PLAN_EDIT_STEPS_NOTE,
  TASK_PLAN_EDIT_TAG,
  TASK_PLAN_FULL_LINK_EDITABLE,
  TASK_BAR_UPDATE_FAILED,
  TASK_BAR_REDO_CONFIRM,
  TASK_BAR_REDO_FAILED,
  TASK_BAR_REDO_HEADING,
  TASK_BAR_REDO_KEEP,
  TASK_BAR_REDOING_NOTE,
  taskPlanEditRemoveStep,
  taskPlanEditWithdraw,
  taskPlanLastEdit,
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
  /**
   * Show one Task's plan; `returnFocus` finds the control focus goes back to when the drawer closes. `note` is said
   * beside the bar's actions until the next one — why a quick start stopped at this plan (Issue #421).
   */
  open(request: TaskPlanRequest, returnFocus: () => HTMLElement | null, note?: string): void;
  /** Read the plan on show again when it is one of `kind`'s: the surface that raised it just recorded something. */
  refresh(kind: TaskPlanKind): void;
  close(restoreFocus: boolean): void;
  isOpen(): boolean;
  /** The central destination changed: stay beside a destination of the same Book, close for anything else. */
  followScreen(state: string, bookId: string | null): void;
  /** The local service is gone: every control is disabled, as the rest of the window's are. */
  interrupt(): void;
}

type DrawerApi = Pick<
  RendererApi,
  | 'inspectTaskPlan'
  | 'authorizeTaskAuthorization'
  | 'authorizeBaselineAnalysis'
  | 'authorizeReviewRun'
  | 'prepareBaselineAnalysis'
  | 'startBaselineAnalysisWhenOnline'
  | 'cancelWaitingBaselineAnalysis'
  | 'cancelBaselineAnalysisRun'
  | 'pauseBaselineAnalysisRun'
  | 'resumeBaselineAnalysisRun'
  | 'editBaselineAnalysisPlan'
  | 'answerBaselineAnalysisClarification'
  | 'runReconnectPreflight'
  | 'setDefaultExecutionRule'
>;

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
  /** 查看规则: 知识库 › 工序与规则, where every 默认执行规则 is listed and turned off (Issue #421). */
  openRules(): void;
}

/** How often the drawer reads a running Task's plan again, so the bar follows the Run to its end. */
const RUNNING_POLL_MS = 1_000;
/** How often a Run in Connectivity Wait is looked at again while the drawer shows it (Issue #502). */
const WAITING_POLL_MS = 2_000;
/** The diff table the bar's 查看计划修订 shows and hides; one drawer, so one table. */
const DRIFT_TABLE_ID = 'task-drawer-drift-table';
/** The Cancellation Impact Summary 取消任务 opens inline (Issue #422, CTRL-004); one bar, so one summary. */
const CANCEL_IMPACT_ID = 'task-drawer-cancel-impact';
const REDO_SUMMARY_ID = 'task-drawer-redo-summary';
/** How the editor left an editable item (Issue #419; S76d): kept, left out or withheld, or asked first. */
type ItemEdit = 'kept' | 'removed' | 'ask-first';

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
  /**
   * The editor's edits of each plan not yet made the plan (Issue #419, V2-UX-PLAN-011): per Task, each item's intended
   * state where it differs from the version shown. It lives outside every repaint — a read of the plan redraws the body
   * — so closing the drawer keeps it; only 更新计划, 撤销修改 or a restart of AI7 lets it go.
   */
  const editBuffers = new Map<string, Map<string, ItemEdit>>();
  /**
   * 设置上限… (Issue #51, S16a; MODEL-015): the ceiling the editor set on each plan and has not yet made the plan, kept like
   * the other edits; and the one ceiling form that is open, with what is typed in it, kept across repaints.
   */
  const budgetBuffers = new Map<string, RunBudgetCeilingState>();
  let budgetForm: { key: string; draft: string; error: string | null } | null = null;
  /**
   * 澄清卡 (Issue #422, S76d; INPUT-004): the choice and the note the editor has on each open question, kept outside every
   * repaint until they submit it; and the questions they set aside with 暂不回答, which records nothing (CLAR-007).
   */
  const clarificationDrafts = new Map<string, { optionId: ClarificationOptionId | null; noteOpen: boolean; note: string }>();
  const deferredQuestions = new Set<string>();
  let questionsPainted = '';
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
  /** Whether `设为快速开始默认…`'s confirmation is open; kept across the reads of the same plan version. */
  let ruleConfirmShown = false;
  /** Whether 取消任务's Cancellation Impact Summary is open; kept across the reads while the Run can still be cancelled. */
  let cancelConfirmShown = false;
  /** 改计划重做's summary is open (Issue #422, S76c). */
  let redoConfirmShown = false;
  /**
   * The redo the editor confirmed on a stopped Run: once that Run reads 已取消, the new Task is prepared. It lives outside
   * every repaint; if AI7 closes first, the cancelled Run still offers 改计划重做.
   */
  let redoPending: { ref: string; runRecordId: string } | null = null;
  /**
   * The next paint of the Task a redo prepared opens its editing: 完整, focused on the first thing that can change — or,
   * for 调整预算并重做 (Issue #51, S16a), on 设置上限….
   */
  let editOnOpen: 'first' | 'budget' | null = null;
  /** Said beside the bar's actions once the plan the drawer was opened on is painted (`open`'s `note`). */
  let pendingNote: string | null = null;
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
  // The open questions stand first in the body, and a repaint of the plan below them never removes them: a note being
  // written keeps its focus and its composition while the Run reads on (Issue #422, S76d).
  const questions = el('div', 'task-drawer-questions');
  questions.dataset['taskDrawerQuestions'] = '';
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

  /**
   * While the Run runs, read the plan again on a timer, so the bar follows it to its end wherever the editor is.
   * While it waits in Connectivity Wait, Reconnect Preflight looks first (Issue #502), so the Run the editor is
   * watching starts as soon as it can; the service also looks by itself, so nothing depends on the drawer.
   */
  function schedulePoll(next: TaskPlanProjection): void {
    clearPoll();
    const waiting = next.state.key === 'waiting';
    // 正在取消 and 正在暂停 are followed like 运行中 until the Run has stopped (Issue #422, CTRL-005); a stopped Run is
    // read again slowly, so 续行 is offered once what it waits for — the slot, the network — is back, and so is one
    // waiting for the editor's answer, which the service takes on by itself once the slot is free (S76d).
    const stopped = next.state.key === 'paused' || next.state.key === 'resumable' || next.state.key === 'awaiting-clarification';
    const followed = next.state.key === 'running' || next.state.key === 'cancelling' || next.state.key === 'pausing';
    if ((!followed && !waiting && !stopped) || interrupted || root.hidden) return;
    pollTimer = window.setTimeout(() => {
      pollTimer = undefined;
      if (!waiting) {
        read();
        return;
      }
      void api.runReconnectPreflight().catch(() => undefined).finally(() => read());
    }, waiting || stopped ? WAITING_POLL_MS : RUNNING_POLL_MS);
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
      // Nothing moved, but the activity card's times did: it holds no control, so it is simply drawn again.
      if (next.runControl !== null) body.querySelector('.task-plan-activity')?.replaceWith(activityBlock(next.runControl));
      schedulePoll(next);
      return;
    }
    if (!sameVersion) {
      diffShown = false;
      refusal = null;
      ruleConfirmShown = false;
    }
    // The summary stays open only while there is still a Run 取消任务 can name.
    if (next.runControl === null || next.runControl.cancel.reason !== null) cancelConfirmShown = false;
    if (next.redo === null || next.redo.summary.length === 0) redoConfirmShown = false;
    if (pendingNote !== null) {
      refusal = pendingNote;
      pendingNote = null;
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
    paintQuestions(next);
    replaceBody(
      ...(next.runControl === null ? [] : [activityBlock(next.runControl)]),
      ...(next.clarifications.some((card) => card.state !== 'open') ? [clarificationRecord(next)] : []),
      goalBlock(next),
      ...(next.defaultRule.startedBy === null ? [] : [quickStartedBlock(next.defaultRule.startedBy)]),
      ...(next.drift === null ? [] : [driftBlock(next.drift)]),
      ...(next.edit.lastEdit === null ? [] : [el('p', 'field-note task-plan-edit-record', taskPlanLastEdit(next.edit.lastEdit))]),
      mode === 'compact' ? compactBlock(next) : fullBlock(next),
    );
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
    // The Task a redo prepared opens in its editing (Issue #422, S76c), as 返回修改 would open it.
    if (editOnOpen !== null && next.edit.editable) {
      const target = editOnOpen === 'budget' ? '[data-task-plan-edit="budget"]:not(:disabled)' : '[data-task-plan-edit]:not(:disabled)';
      editOnOpen = null;
      if (mode !== 'full') setMode('full', false);
      (body.querySelector<HTMLElement>(target) ?? body.querySelector<HTMLElement>('[data-task-plan-edit]:not(:disabled)'))?.focus();
    }
    // The Run the editor redoes has stopped and reads 已取消: the new Task is prepared now.
    if (redoPending !== null && redoPending.ref === next.ref && next.state.key === 'cancelled-after-start' && next.redo !== null &&
        next.redo.prepare.redoOf === redoPending.runRecordId && !working && !interrupted) {
      queueMicrotask(() => void redoNow());
    }
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
    const full = control(next.edit.editable ? TASK_PLAN_FULL_LINK_EDITABLE : TASK_PLAN_FULL_LINK, 'quiet task-plan-full-link', 'full-link');
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
      item.dataset['taskPlanItem'] = step.id;
      const removed = shownRemoved(next, step.id, step.removed);
      if (removed) item.classList.add('task-plan-item-removed');
      item.append(el('span', 'task-plan-step', step.label), el('span', 'task-plan-step-result', `→ ${step.result}`));
      if (step.removable) item.append(...editControls(next, step.id, step.label, step.removed, removed, 'step'));
      steps.append(item);
    }
    const stepsNote = next.edit.editable && next.steps.some((step) => step.removable) ? [el('p', 'field-note task-plan-edit-note', TASK_PLAN_EDIT_STEPS_NOTE)] : [];
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
      planSection(2, steps, ...stepsNote),
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
      ]), ...budgetBlock(next)),
      planSection(5, facts([
        [TASK_PLAN_RESULT_TERMS[0], listOf(next.outcomes, 'task-plan-list')],
        [TASK_PLAN_RESULT_TERMS[1], listOf(next.notDo.editorial, 'task-plan-list task-plan-not-do')],
      ])),
      boundaryBlock(next),
      defaultRuleBlock(next),
      technicalBlock(next),
    );
    return whole;
  }

  function boundaryBlock(next: TaskPlanProjection): HTMLElement {
    const section = el('section', 'task-plan-boundary');
    const adaptable = el('div', 'task-plan-boundary-column');
    adaptable.dataset['taskPlanBoundary'] = 'adaptable';
    const adaptations = el('ul', 'task-plan-list');
    // An adaptation moved into 先问你 (Issue #422, S76d) stands in the right column, where the editor sees it asked first.
    const asked: HTMLElement[] = [];
    for (const entry of next.boundary.adaptable) {
      const item = el('li');
      item.dataset['taskPlanItem'] = entry.id;
      const committed = committedEdit(entry);
      const shown = shownEdit(next, entry.id, committed);
      if (shown === 'removed') item.classList.add('task-plan-item-removed');
      item.append(el('span', 'task-plan-adaptation', entry.label));
      if (entry.removable || entry.movable) item.append(...adaptationControls(next, entry, committed, shown));
      if (shown === 'ask-first') asked.push(item);
      else adaptations.append(item);
    }
    if (next.boundary.adaptable.length === 0 || adaptations.childElementCount === 0) adaptations.append(el('li', undefined, TASK_PLAN_NO_ADAPTATION));
    adaptable.append(el('h4', undefined, TASK_PLAN_BOUNDARY_COLUMNS[0]), adaptations);
    if (next.edit.editable && next.boundary.adaptable.some((entry) => entry.movable)) {
      adaptable.append(el('p', 'field-note task-plan-edit-note', TASK_PLAN_EDIT_ASK_FIRST_NOTE));
    }
    const askFirst = el('div', 'task-plan-boundary-column');
    askFirst.dataset['taskPlanBoundary'] = 'ask-first';
    const locked = el('ul', 'task-plan-list task-plan-locked');
    for (const item of next.boundary.askFirst) {
      const entry = el('li');
      entry.append(el('span', 'task-plan-lock', TASK_PLAN_LOCKED), item);
      locked.append(entry);
    }
    const movedIn = el('ul', 'task-plan-list task-plan-asked');
    movedIn.append(...asked);
    askFirst.append(el('h4', undefined, TASK_PLAN_BOUNDARY_COLUMNS[1]), ...(asked.length === 0 ? [] : [movedIn]), locked, el('p', 'field-note', TASK_PLAN_LOCKED_NOTE));
    section.append(adaptable, askFirst);
    return section;
  }

  /** 快速开始后 (S75 D5): which rule version started this Task, quietly, with the way to the rule. */
  function quickStartedBlock(startedBy: NonNullable<TaskPlanProjection['defaultRule']['startedBy']>): HTMLElement {
    const notice = el('p', 'field-note task-plan-quick-started');
    notice.dataset['taskPlanQuickStarted'] = startedBy.ruleVersionId;
    const view = control(TASK_PLAN_VIEW_RULES, 'quiet', 'view-rules');
    view.addEventListener('click', () => options.openRules());
    notice.append(taskPlanQuickStarted(startedBy.name), ' · ', view);
    return notice;
  }

  /**
   * `设为快速开始默认…` (AUTH-009, TASK-019; Issue #421): on a plan a rule may come from it opens a confirmation that
   * lists exactly what the rule binds, and only its `设为默认` sets the rule; on any other plan it is shown, disabled,
   * with the reason. The Book's rule for the plan's pattern is named beside it, in force or turned off.
   */
  function defaultRuleBlock(next: TaskPlanProjection): HTMLElement {
    const rule = next.defaultRule;
    const section = el('section', 'task-plan-default-rule');
    section.dataset['taskPlanDefaultRule'] = rule.canSet ? 'offered' : 'unavailable';
    if (rule.current !== null) {
      const line = el('p', 'field-note task-plan-default-rule-current', taskPlanDefaultRuleCurrent(rule.current));
      line.dataset['defaultRuleState'] = rule.current.state;
      section.append(line);
    }
    if (!rule.canSet || rule.planEnvelopeDigest === null) {
      section.append(unavailable(TASK_PLAN_DEFAULT_RULE, 'default-rule', rule.reason ?? TASK_PLAN_DEFAULT_RULE_FAILED));
      return section;
    }
    const open = control(TASK_PLAN_DEFAULT_RULE, 'secondary', 'default-rule');
    const confirm = el('div', 'task-plan-default-rule-confirm');
    confirm.id = uid('default-rule-confirm');
    confirm.hidden = !ruleConfirmShown;
    confirm.setAttribute('role', 'group');
    confirm.setAttribute('aria-label', TASK_PLAN_DEFAULT_RULE_HEADING);
    open.setAttribute('aria-controls', confirm.id);
    open.setAttribute('aria-expanded', ruleConfirmShown ? 'true' : 'false');
    const binds = el('dl', 'task-plan-facts task-plan-default-rule-binds');
    for (const row of rule.binds) {
      const value = el('dd', undefined, row.value);
      value.dataset['defaultRuleBind'] = row.label;
      binds.append(el('dt', undefined, row.label), value);
    }
    const yes = control(TASK_PLAN_DEFAULT_RULE_CONFIRM, 'primary', 'default-rule-confirm');
    const no = control(TASK_PLAN_DEFAULT_RULE_CANCEL, 'quiet', 'default-rule-cancel');
    const actions = el('div', 'button-row');
    actions.append(yes, no);
    confirm.append(el('h4', undefined, TASK_PLAN_DEFAULT_RULE_HEADING), el('p', undefined, TASK_PLAN_DEFAULT_RULE_LEAD), binds, actions);
    const show = (shown: boolean): void => {
      ruleConfirmShown = shown;
      confirm.hidden = !shown;
      open.setAttribute('aria-expanded', shown ? 'true' : 'false');
    };
    open.addEventListener('click', () => {
      show(!ruleConfirmShown);
      if (ruleConfirmShown) yes.focus();
    });
    no.addEventListener('click', () => {
      show(false);
      open.focus();
    });
    yes.addEventListener('click', () => void setDefaultRule());
    if (working) for (const button of [open, yes, no]) button.disabled = true;
    section.append(open, confirm);
    return section;
  }

  /** `设为默认`: the rule is set from exactly the plan on show, and every surface of the kind reads it again. */
  async function setDefaultRule(): Promise<void> {
    const current = plan;
    const asked = request;
    const planEnvelopeDigest = current?.defaultRule.planEnvelopeDigest ?? null;
    if (current === null || planEnvelopeDigest === null || !beginWork()) return;
    for (const button of body.querySelectorAll<HTMLButtonElement>('.task-plan-default-rule button')) button.disabled = true;
    options.setStatus('正在设为快速开始默认…', 'busy');
    try {
      const rule = await api.setDefaultExecutionRule({ taskIntentId: current.ref, planEnvelopeDigest });
      ruleConfirmShown = false;
      options.setStatus(taskPlanDefaultRuleSet(rule.name), 'success');
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_PLAN_DEFAULT_RULE_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
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
    const view = taskBarView(next, pendingEdits(next));
    const redoing = redoPending !== null && redoPending.ref === next.ref && next.state.key === 'cancelling';
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
      const note = el('p', 'task-bar-note', redoing ? TASK_BAR_REDOING_NOTE : view.note);
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
    const run = next.runControl;
    if (run !== null && run.cancel.reason === null && cancelConfirmShown) parts.push(cancelImpactBlock(run));
    if (next.redo !== null && next.redo.summary.length > 0 && redoConfirmShown) parts.push(redoSummaryBlock(next.redo));
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
      case 'start-when-online':
        button.addEventListener('click', () => void startWhenOnline());
        break;
      case 'cancel-wait':
        button.addEventListener('click', () => void cancelWait());
        break;
      // 暂停 is one click and needs no confirmation (CTRL-001, CTRL-004); 续行 goes on after the service revalidates.
      case 'pause':
        button.addEventListener('click', () => void pauseRun());
        break;
      case 'resume':
        button.addEventListener('click', () => void resumeRun());
        break;
      // 取消任务 records nothing: it opens the Cancellation Impact Summary, whose confirmation does (CTRL-004).
      case 'cancel-run':
        button.setAttribute('aria-controls', CANCEL_IMPACT_ID);
        button.setAttribute('aria-expanded', cancelConfirmShown ? 'true' : 'false');
        button.addEventListener('click', () => {
          cancelConfirmShown = !cancelConfirmShown;
          if (plan !== null) paintBar(plan);
          bar.querySelector<HTMLElement>(cancelConfirmShown ? `#${CANCEL_IMPACT_ID} h4` : '[data-task-drawer-control="cancel-run"]')?.focus();
        });
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
      // 改计划重做 (Issue #422, S76c): a stopped Run opens its summary first; a Run already cancelled is redone at once.
      case 'redo':
        if ((plan?.redo?.summary.length ?? 0) > 0) {
          button.setAttribute('aria-controls', REDO_SUMMARY_ID);
          button.setAttribute('aria-expanded', redoConfirmShown ? 'true' : 'false');
          button.addEventListener('click', () => {
            redoConfirmShown = !redoConfirmShown;
            if (redoConfirmShown) cancelConfirmShown = false;
            if (plan !== null) paintBar(plan);
            bar.querySelector<HTMLElement>(redoConfirmShown ? `#${REDO_SUMMARY_ID} h4` : '[data-task-drawer-control="redo"]')?.focus();
          });
        } else {
          button.addEventListener('click', () => void redoNow());
        }
        break;
      // 返回修改 (Issue #419): the plan's editing — 完整, focused on the first thing that can change.
      case 'revise':
        button.addEventListener('click', () => {
          if (mode !== 'full') setMode('full', false);
          body.querySelector<HTMLElement>('[data-task-plan-edit]:not(:disabled)')?.focus();
        });
        break;
      case 'update-plan':
        button.addEventListener('click', () => void updatePlan());
        break;
      case 'discard-edits':
        button.addEventListener('click', () => {
          if (plan === null || working) return;
          editBuffers.delete(editKey(plan));
          budgetBuffers.delete(editKey(plan));
          budgetForm = null;
          focusBar = true;
          paint(plan, true);
        });
        break;
    }
    return button;
  }

  // ---- the editable plan (Issue #419, plan slice S73; §6 可编辑, V2-UX-PLAN-011) -------------------------------

  function editKey(next: TaskPlanProjection): string {
    return `${next.kind}:${next.ref}`;
  }

  /** An item as the version shown has it: a step kept or left out; an adaptation allowed, withheld or asked first. */
  function committedEdit(entry: { removed: boolean; askFirst?: boolean }): ItemEdit {
    return entry.askFirst === true ? 'ask-first' : entry.removed ? 'removed' : 'kept';
  }

  /** An item as the editor now sees it: their pending edit where they made one, else the version shown. */
  function shownEdit(next: TaskPlanProjection, id: string, committed: ItemEdit): ItemEdit {
    return editBuffers.get(editKey(next))?.get(id) ?? committed;
  }

  function shownRemoved(next: TaskPlanProjection, id: string, committed: boolean): boolean {
    return shownEdit(next, id, committed ? 'removed' : 'kept') === 'removed';
  }

  /**
   * How many changes the editor has made and not yet made the plan. An intention the version shown already holds is
   * no pending edit — a version 更新计划 wrote clears it — and a started Task keeps none.
   */
  function pendingEdits(next: TaskPlanProjection): number {
    const key = editKey(next);
    if (next.start.readiness === 'started') {
      editBuffers.delete(key);
      budgetBuffers.delete(key);
      if (budgetForm?.key === key) budgetForm = null;
      return 0;
    }
    let count = 0;
    const buffer = editBuffers.get(key);
    if (buffer !== undefined) {
      const committed = new Map<string, ItemEdit>([
        ...next.steps.filter((step) => step.removable).map((step) => [step.id, committedEdit(step)] as const),
        ...next.boundary.adaptable.filter((entry) => entry.removable || entry.movable).map((entry) => [entry.id, committedEdit(entry)] as const),
      ]);
      for (const [id, state] of buffer) {
        if (committed.get(id) === undefined || committed.get(id) === state) buffer.delete(id);
      }
      if (buffer.size === 0) editBuffers.delete(key);
      count += buffer.size;
    }
    // The ceiling is one change (Issue #51, S16a), gone once the version shown holds it. Like the other edits it waits
    // through a key-content change for the version 重新确认计划 writes.
    const ceiling = budgetBuffers.get(key);
    if (ceiling !== undefined) {
      if (next.edit.budget === null || sameCeiling(ceiling, next.edit.budget.ceiling)) budgetBuffers.delete(key);
      else count += 1;
    }
    return count;
  }

  /** One item's edit, kept until 更新计划 or 撤销修改; focus stays on the item, now on its other control. */
  function setItemEdit(next: TaskPlanProjection, id: string, committed: ItemEdit, state: ItemEdit): void {
    // The plan on show, which a read may have replaced since this control was drawn; never another Task's.
    if (plan === null || editKey(plan) !== editKey(next) || working || interrupted || !plan.edit.editable) return;
    const key = editKey(plan);
    const buffer = editBuffers.get(key) ?? new Map<string, ItemEdit>();
    if (state === committed) buffer.delete(id);
    else buffer.set(id, state);
    if (buffer.size === 0) editBuffers.delete(key);
    else editBuffers.set(key, buffer);
    paint(plan, true);
    body.querySelector<HTMLElement>(`[data-task-plan-item="${id}"] [data-task-plan-edit]`)?.focus();
  }

  /**
   * An editable item's mark and control (PLAN-011): left out, it says so beside 你改的 with 恢复; kept, it offers `×`,
   * whose glyph is drawn by the style sheet so the item's words stay the only text it holds. A plan that takes no edit
   * shows the mark and no control.
   */
  function editControls(next: TaskPlanProjection, id: string, label: string, committed: boolean, removed: boolean, kind: 'step' | 'adaptation'): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (removed) {
      parts.push(el('span', 'task-plan-edit-tag', `${TASK_PLAN_EDIT_TAG} · ${kind === 'step' ? TASK_PLAN_EDIT_STEP_REMOVED : TASK_PLAN_EDIT_ADAPTATION_WITHDRAWN}`));
    }
    if (!next.edit.editable) return parts;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['taskPlanEdit'] = removed ? 'restore' : 'remove';
    if (removed) {
      button.className = 'quiet task-plan-edit-restore';
      button.textContent = TASK_PLAN_EDIT_RESTORE;
    } else {
      const name = kind === 'step' ? taskPlanEditRemoveStep(label) : taskPlanEditWithdraw(label);
      button.className = 'quiet task-plan-edit-remove';
      button.setAttribute('aria-label', name);
      button.title = name;
    }
    button.addEventListener('click', () => setItemEdit(next, id, committed ? 'removed' : 'kept', removed ? 'kept' : 'removed'));
    parts.push(button);
    return parts;
  }

  /**
   * An adaptation's mark and controls (PLAN-011, PLAN-012): allowed, it offers `×` (= 不允许) and 先问你; withheld or
   * asked first, it says so beside 你改的 with 恢复. A plan that takes no edit shows the mark and no control.
   */
  function adaptationControls(next: TaskPlanProjection, entry: TaskPlanProjection['boundary']['adaptable'][number], committed: ItemEdit, shown: ItemEdit): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (shown !== 'kept') {
      parts.push(el('span', 'task-plan-edit-tag', `${TASK_PLAN_EDIT_TAG} · ${shown === 'removed' ? TASK_PLAN_EDIT_ADAPTATION_WITHDRAWN : TASK_PLAN_EDIT_ADAPTATION_ASK_FIRST}`));
    }
    if (!next.edit.editable) return parts;
    if (shown !== 'kept') {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.dataset['taskPlanEdit'] = 'restore';
      restore.className = 'quiet task-plan-edit-restore';
      restore.textContent = TASK_PLAN_EDIT_RESTORE;
      restore.addEventListener('click', () => setItemEdit(next, entry.id, committed, 'kept'));
      parts.push(restore);
      return parts;
    }
    if (entry.removable) {
      const name = taskPlanEditWithdraw(entry.label);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset['taskPlanEdit'] = 'remove';
      remove.className = 'quiet task-plan-edit-remove';
      remove.setAttribute('aria-label', name);
      remove.title = name;
      remove.addEventListener('click', () => setItemEdit(next, entry.id, committed, 'removed'));
      parts.push(remove);
    }
    if (entry.movable) {
      const move = document.createElement('button');
      move.type = 'button';
      move.dataset['taskPlanEdit'] = 'ask-first';
      // Its words are the style sheet's, as `×`'s glyph is, so the item's text stays the adaptation's own words; the
      // name says what it does.
      move.className = 'quiet task-plan-edit-ask-first';
      move.setAttribute('aria-label', taskPlanEditAskFirst(entry.label));
      move.title = taskPlanEditAskFirst(entry.label);
      move.addEventListener('click', () => setItemEdit(next, entry.id, committed, 'ask-first'));
      parts.push(move);
    }
    return parts;
  }

  // ---- 设置上限… (Issue #51, plan slice S16a; §6 ⑤, V2-UX-MODEL-013, MODEL-015) ----------------------------------------

  function sameCeiling(left: RunBudgetCeilingState, right: RunBudgetCeilingState): boolean {
    return left === 'unset' || right === 'unset' ? left === right : left.maxTotalTokens === right.maxTotalTokens;
  }

  /**
   * The ceiling as the editor now sees it: theirs not yet made the plan, else the version's. None where the launch sets it
   * (developer-live), since the plan's edit never names that one.
   */
  function shownCeiling(next: TaskPlanProjection): RunBudgetCeilingState {
    const budget = next.edit.budget;
    if (budget === null || (!budget.settable && next.edit.editable)) return 'unset';
    return budgetBuffers.get(editKey(next)) ?? budget.ceiling;
  }

  /**
   * Section ⑤'s ceiling (MODEL-013, MODEL-015): what any ceiling leaves to the model service's own account; the editor's
   * ceiling not yet made the plan, beside 你改的 with 恢复; and 设置上限… — with 去掉上限 once there is one — whose form takes a
   * whole count of tokens. A plan that takes no edit shows the note alone, and one whose launch sets the ceiling says why.
   */
  function budgetBlock(next: TaskPlanProjection): HTMLElement[] {
    const budget = next.edit.budget;
    if (budget === null) return [];
    const key = editKey(next);
    const block = el('div', 'task-plan-budget');
    block.dataset['taskPlanBudget'] = 'ceiling';
    block.append(el('p', 'field-note task-plan-budget-note', TASK_PLAN_BUDGET_NOTE));
    const pending = budgetBuffers.get(key);
    if (pending !== undefined) {
      const line = el('p', 'task-plan-budget-edited');
      line.append(el('span', 'task-plan-edit-tag', `${TASK_PLAN_EDIT_TAG} · ${taskPlanBudgetEdited(pending)}`));
      if (next.edit.editable) {
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.dataset['taskPlanEdit'] = 'budget-restore';
        restore.className = 'quiet task-plan-edit-restore';
        restore.textContent = TASK_PLAN_EDIT_RESTORE;
        restore.addEventListener('click', () => setBudget(next, undefined));
        line.append(restore);
      }
      block.append(line);
    }
    if (!next.edit.editable) return [block];
    if (!budget.settable) {
      block.append(unavailable(TASK_PLAN_BUDGET_SET, 'budget', budget.reason ?? ''));
      return [block];
    }
    const open = budgetForm !== null && budgetForm.key === key;
    const actions = el('div', 'task-plan-budget-actions');
    const set = document.createElement('button');
    set.type = 'button';
    set.className = 'quiet task-plan-budget-set';
    set.dataset['taskPlanEdit'] = 'budget';
    set.textContent = TASK_PLAN_BUDGET_SET;
    set.setAttribute('aria-expanded', open ? 'true' : 'false');
    set.addEventListener('click', () => {
      if (plan === null || editKey(plan) !== key || working || interrupted) return;
      budgetForm = open ? null : { key, draft: '', error: null };
      paint(plan, true);
      body.querySelector<HTMLElement>(open ? '[data-task-plan-edit="budget"]' : '[data-task-drawer-control="budget-input"]')?.focus();
    });
    actions.append(set);
    if (shownCeiling(next) !== 'unset') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quiet task-plan-budget-remove';
      remove.dataset['taskPlanEdit'] = 'budget-remove';
      remove.textContent = TASK_PLAN_BUDGET_REMOVE;
      remove.addEventListener('click', () => setBudget(next, 'unset'));
      actions.append(remove);
    }
    block.append(actions);
    if (open && budgetForm !== null) block.append(budgetFormBlock(next, budgetForm));
    return [block];
  }

  /**
   * The ceiling's form: one labelled field for a whole count of tokens, what the ceiling does, and why a value was not
   * taken. Enter sets it (never mid-composition), Escape closes the form and not the drawer; what is typed survives a repaint.
   */
  function budgetFormBlock(next: TaskPlanProjection, form: { key: string; draft: string; error: string | null }): HTMLElement {
    const group = el('div', 'task-plan-budget-form');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', TASK_PLAN_BUDGET_SET);
    const input = el('input', 'task-plan-budget-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.id = uid('budget-input');
    input.dataset['taskDrawerControl'] = 'budget-input';
    input.value = form.draft;
    const label = el('label', undefined, TASK_PLAN_BUDGET_INPUT);
    label.htmlFor = input.id;
    const hint = el('small', 'field-note', TASK_PLAN_BUDGET_HINT);
    hint.id = uid('budget-hint');
    const described = [hint.id];
    const error = form.error === null ? null : el('small', 'field-note task-plan-budget-error', form.error);
    if (error !== null) {
      error.id = uid('budget-error');
      error.setAttribute('role', 'alert');
      described.push(error.id);
      input.setAttribute('aria-invalid', 'true');
    }
    input.setAttribute('aria-describedby', described.join(' '));
    input.addEventListener('input', () => {
      form.draft = input.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        applyBudgetForm(next, form);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeBudgetForm();
      }
    });
    const apply = control(TASK_PLAN_BUDGET_APPLY, 'primary', 'budget-apply');
    apply.addEventListener('click', () => applyBudgetForm(next, form));
    const cancel = control(TASK_PLAN_BUDGET_CANCEL, 'secondary', 'budget-cancel');
    cancel.addEventListener('click', () => closeBudgetForm());
    group.append(label, input, hint, ...(error === null ? [] : [error]), apply, cancel);
    return group;
  }

  /** 设定: a whole count of tokens becomes the editor's ceiling; anything else keeps the form open with why. */
  function applyBudgetForm(next: TaskPlanProjection, form: { key: string; draft: string; error: string | null }): void {
    const tokens = parseBudgetCeiling(form.draft);
    if (tokens === null) {
      form.error = TASK_PLAN_BUDGET_INVALID;
      if (plan !== null) paint(plan, true);
      body.querySelector<HTMLElement>('[data-task-drawer-control="budget-input"]')?.focus();
      return;
    }
    setBudget(next, { kind: 'tokens', maxTotalTokens: tokens });
  }

  function closeBudgetForm(): void {
    if (plan === null) return;
    budgetForm = null;
    paint(plan, true);
    body.querySelector<HTMLElement>('[data-task-plan-edit="budget"]')?.focus();
  }

  /** The editor's ceiling, kept until 更新计划 or 撤销修改 — `undefined` returns to the version's — with focus back on 设置上限…. */
  function setBudget(next: TaskPlanProjection, value: RunBudgetCeilingState | undefined): void {
    if (plan === null || editKey(plan) !== editKey(next) || working || interrupted || !plan.edit.editable || plan.edit.budget === null) return;
    const key = editKey(plan);
    if (value === undefined || sameCeiling(value, plan.edit.budget.ceiling)) budgetBuffers.delete(key);
    else budgetBuffers.set(key, value);
    budgetForm = null;
    paint(plan, true);
    body.querySelector<HTMLElement>('[data-task-plan-edit="budget"]')?.focus();
  }

  /** 更新计划 (PLAN-009, PLAN-011): the plan as the editor left it becomes the next version; a refusal is said beside the bar. */
  async function updatePlan(): Promise<void> {
    const current = plan;
    const asked = request;
    // The edit's own version: 模型未连接 or 离线 withholds 开始任务's digest, and the edit sends nothing.
    const planEnvelopeDigest = current?.edit.planEnvelopeDigest ?? null;
    if (current === null || current.kind !== 'baseline-analysis' || planEnvelopeDigest === null || !beginWork()) return;
    const removedSteps = current.steps.filter((step) => step.removable && shownRemoved(current, step.id, step.removed)).map((step) => step.id);
    const disallowedAdaptations = current.boundary.adaptable
      .filter((entry) => entry.removable && shownEdit(current, entry.id, committedEdit(entry)) === 'removed')
      .map((entry) => entry.id);
    // 先问你 (Issue #422, S76d): named only when something is asked first, as the plan's own record names it.
    const askFirstAdaptations = current.boundary.adaptable
      .filter((entry) => entry.movable && shownEdit(current, entry.id, committedEdit(entry)) === 'ask-first')
      .map((entry) => entry.id);
    // 设置上限… (Issue #51, S16a): the edit is the whole plan as the editor left it, so a ceiling set before is sent again.
    const ceiling = shownCeiling(current);
    options.setStatus('正在更新计划…', 'busy');
    try {
      const updated = await api.editBaselineAnalysisPlan({
        taskIntentId: current.ref,
        planEnvelopeDigest,
        removedSteps,
        disallowedAdaptations,
        ...(askFirstAdaptations.length === 0 ? {} : { askFirstAdaptations }),
        ...(ceiling === 'unset' ? {} : { runBudgetCeiling: ceiling }),
      });
      editBuffers.delete(editKey(current));
      budgetBuffers.delete(editKey(current));
      if (budgetForm?.key === editKey(current)) budgetForm = null;
      options.setStatus(`计划已更新为第 ${updated.planVersion?.ordinal ?? '?'} 版。`, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_UPDATE_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
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
      bar.querySelector<HTMLElement>(
        '[data-task-drawer-control="start"]:not(:disabled), [data-task-drawer-control="start-when-online"]:not(:disabled), ' +
          '[data-task-drawer-control="reconfirm-plan"]:not(:disabled), [data-task-drawer-control="cancel-wait"]:not(:disabled), ' +
          '[data-task-drawer-control="cancel-run"]:not(:disabled), [data-task-drawer-control="pause"]:not(:disabled), ' +
          '[data-task-drawer-control="resume"]:not(:disabled)',
      )?.focus();
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
   * 联网后开始任务 (Issue #502; AUTH-002, AUTH-004, OFF-005): one activation records the exact Run Authorization and
   * Run Record for the plan on show — the digest the bar read with it — and the Run waits in Connectivity Wait.
   * Nothing is sent and nothing implies it began; the bar then says what it waits for, beside 取消.
   */
  async function startWhenOnline(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.kind !== 'baseline-analysis' || !beginWork()) return;
    options.setStatus('正在记录授权…', 'busy');
    try {
      const planEnvelopeDigest = current.start.planEnvelopeDigest;
      if (planEnvelopeDigest === null) throw new Error(TASK_BAR_START_FAILED);
      await api.startBaselineAnalysisWhenOnline({ taskIntentId: current.ref, planEnvelopeDigest });
      options.setStatus('已记录授权 · 联网后开始', 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_START_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  /** 取消 while the Run waits (OFF-010): cancelled before it ever dispatched, directly — nothing ran to weigh first. */
  /**
   * The Cancellation Impact Summary (CTRL-004): the work that stops, what is kept, the Effects there are none of and
   * the turn not back yet, then the explicit confirmation, which is the one activation that records anything.
   */
  /** 改计划重做's summary (Issue #422, S76c): what stops, what is kept, what the new Task does; only its confirmation records. */
  function redoSummaryBlock(redo: NonNullable<TaskPlanProjection['redo']>): HTMLElement {
    const section = el('section', 'task-bar-cancel-impact task-bar-redo-summary');
    section.id = REDO_SUMMARY_ID;
    section.setAttribute('role', 'group');
    const heading = el('h4', undefined, TASK_BAR_REDO_HEADING);
    heading.id = uid('redo-summary');
    heading.tabIndex = -1;
    heading.dataset['taskDrawerControl'] = 'redo-summary';
    section.setAttribute('aria-labelledby', heading.id);
    const lines = el('ul', 'task-bar-cancel-lines');
    for (const line of redo.summary) lines.append(el('li', undefined, line));
    const confirm = control(TASK_BAR_REDO_CONFIRM, 'primary', 'confirm-redo');
    const keep = control(TASK_BAR_REDO_KEEP, 'secondary', 'keep-plan');
    confirm.addEventListener('click', () => void confirmRedo());
    keep.addEventListener('click', () => {
      redoConfirmShown = false;
      if (plan !== null) paintBar(plan);
      bar.querySelector<HTMLElement>('[data-task-drawer-control="redo"]')?.focus();
    });
    const actions = el('div', 'button-row');
    actions.append(confirm, keep);
    section.append(heading, lines, actions);
    if (working) for (const button of [confirm, keep]) button.disabled = true;
    return section;
  }

  /** The confirmed redo of a stopped Run: 取消任务 first, and the new Task once the Run reads 已取消 (see `paint`). */
  async function confirmRedo(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.redo === null || current.runControl === null || !beginWork()) return;
    options.setStatus('正在取消这次运行，然后准备新任务…', 'busy');
    try {
      await api.cancelBaselineAnalysisRun({ taskIntentId: current.ref });
      redoPending = { ref: current.ref, runRecordId: current.runControl.runRecordId };
      redoConfirmShown = false;
      options.setStatus(TASK_BAR_REDOING_NOTE, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_REDO_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  /**
   * The new Task of a redo (CONT-013): its own intent, plan and envelope, carrying what the cancelled Run read, prepared
   * from the exact request the plan names; the drawer then opens it, in its editing, for the editor to change and start.
   */
  async function redoNow(): Promise<void> {
    const current = plan;
    const asked = request;
    const redo = current?.redo ?? null;
    if (current === null || redo === null || !beginWork()) return;
    redoPending = null;
    options.setStatus('正在准备改计划重做的新任务…', 'busy');
    let prepared: string | null = null;
    try {
      const initial = await api.prepareBaselineAnalysis({ goal: redo.prepare.goal, update: redo.prepare.update, reconfirm: false, redoOf: redo.prepare.redoOf });
      const completed = await options.awaitServiceJob(initial, (job) => options.setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
      if (completed.state === 'cancelled') {
        options.setStatus('改计划重做的准备已取消；这次运行保持已取消。', 'success');
        return;
      }
      if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null || !('coverageManifest' in completed.result)) {
        throw new Error(TASK_BAR_REDO_FAILED);
      }
      prepared = completed.result.taskIntent?.taskIntentId ?? null;
      options.setStatus('新任务已准备：可以先改计划，再开始。', 'success');
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_REDO_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
    if (prepared !== null && !root.hidden) {
      editOnOpen = current.state.key === 'budget-reached' ? 'budget' : 'first';
      surface.open({ bookId: current.bookId, kind: current.kind, ref: prepared }, returnFocus);
    }
  }

  function cancelImpactBlock(run: TaskPlanRunControlProjection): HTMLElement {
    const section = el('section', 'task-bar-cancel-impact');
    section.id = CANCEL_IMPACT_ID;
    section.setAttribute('role', 'group');
    const heading = el('h4', undefined, TASK_BAR_CANCEL_IMPACT_HEADING);
    heading.id = uid('cancel-impact');
    heading.tabIndex = -1;
    // Named as the bar's controls are, so a repaint while the editor reads the summary keeps focus on it.
    heading.dataset['taskDrawerControl'] = 'cancel-impact';
    section.setAttribute('aria-labelledby', heading.id);
    const lines = el('ul', 'task-bar-cancel-lines');
    for (const line of run.cancel.impact) lines.append(el('li', undefined, line));
    const confirm = control(TASK_BAR_CANCEL_CONFIRM, 'primary', 'confirm-cancel-run');
    const keep = control(TASK_BAR_CANCEL_KEEP, 'secondary', 'keep-running');
    confirm.addEventListener('click', () => void cancelRun());
    keep.addEventListener('click', () => {
      cancelConfirmShown = false;
      if (plan !== null) paintBar(plan);
      bar.querySelector<HTMLElement>('[data-task-drawer-control="cancel-run"]')?.focus();
    });
    const actions = el('div', 'button-row');
    actions.append(confirm, keep);
    section.append(heading, lines, actions);
    if (working) for (const button of [confirm, keep]) button.disabled = true;
    return section;
  }

  /**
   * AUTH-011's activity card above the plan: the Run Liveness Signal in rows, measured and never estimated, with
   * LIVE-003's own words when the step has run longer than this Run can account for.
   */
  function activityBlock(run: TaskPlanRunControlProjection): HTMLElement {
    const section = el('section', 'task-plan-activity');
    section.setAttribute('aria-label', TASK_PLAN_ACTIVITY_TITLE);
    section.dataset['taskPlanActivity'] = run.cancelling ? 'cancelling' : run.pausing ? 'pausing'
      : run.continuation !== null ? 'stopped' : run.activity === null ? 'unreported' : 'running';
    section.append(el('h3', 'task-plan-activity-title', TASK_PLAN_ACTIVITY_TITLE));
    const activity = run.activity;
    // A stopped Run: nothing is in flight, and what it kept is its continuation point (CONT-015).
    if (run.continuation !== null) {
      section.dataset['taskPlanActivityProgress'] = `${run.continuation.unitsSettled ?? 'unreadable'}/${run.continuation.unitsTotal}`;
      section.append(el('p', 'field-note', taskBarContinuationNote(run.continuation.unitsSettled, run.continuation.unitsTotal)));
      return section;
    }
    if (activity === null) {
      section.append(el('p', 'field-note', TASK_PLAN_ACTIVITY_UNREPORTED));
      return section;
    }
    const now = Date.now();
    section.dataset['taskPlanActivityProgress'] = `${activity.unitsSettled}/${activity.unitsTotal}`;
    if (activity.currentUnitOrdinal !== null) section.dataset['taskPlanActivityUnit'] = String(activity.currentUnitOrdinal);
    if (taskPlanActivityIsStale(activity, now)) {
      section.dataset['runLiveness'] = 'stale';
      section.append(el('p', 'attention-note', TASK_PLAN_ACTIVITY_STALE));
    }
    const facts = el('dl', 'task-plan-facts task-plan-activity-facts');
    for (const [term, value] of taskPlanActivityRows(activity, run.executingSince, now, run.update)) {
      const cell = el('dd', undefined, value);
      cell.dataset['taskPlanActivityRow'] = term;
      facts.append(el('dt', undefined, term), cell);
    }
    section.append(facts);
    return section;
  }

  /**
   * 确认取消任务 (Issue #422; CTRL-004, CTRL-005): the Run the summary named is cancelled. The service records
   * 正在取消 at once and the Run stops at the next unit boundary; the drawer follows it to 已取消.
   */
  async function cancelRun(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.kind !== 'baseline-analysis' || current.runControl === null || !beginWork()) return;
    options.setStatus('正在取消任务…', 'busy');
    try {
      const answered = await api.cancelBaselineAnalysisRun({ taskIntentId: current.ref });
      cancelConfirmShown = false;
      // A Run under way stops at its next boundary; one nothing was running settled at once.
      options.setStatus(answered.run?.state === 'cancelling' ? TASK_BAR_CANCELLING_NOTE : TASK_BAR_CANCELLED_NOTE, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_CANCEL_RUN_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  /** 暂停 (Issue #422, S76b; CTRL-001): the pause is recorded at once, and the drawer follows the Run to 已暂停. */
  async function pauseRun(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.kind !== 'baseline-analysis' || current.runControl === null || !beginWork()) return;
    options.setStatus('正在暂停任务…', 'busy');
    try {
      await api.pauseBaselineAnalysisRun({ taskIntentId: current.ref });
      options.setStatus(TASK_BAR_PAUSING_NOTE, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_PAUSE_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  /** 续行 (CONT-015): the same Run goes on from where it stopped; a refusal says what it waits for, beside the bar. */
  async function resumeRun(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.kind !== 'baseline-analysis' || current.runControl === null || !beginWork()) return;
    options.setStatus('正在续行…', 'busy');
    try {
      await api.resumeBaselineAnalysisRun({ taskIntentId: current.ref });
      options.setStatus('已续行，从已保存的进度接着读。', 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_RESUME_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  async function cancelWait(): Promise<void> {
    const current = plan;
    const asked = request;
    if (current === null || current.kind !== 'baseline-analysis' || !beginWork()) return;
    options.setStatus('正在取消…', 'busy');
    try {
      await api.cancelWaitingBaselineAnalysis({ taskIntentId: current.ref });
      options.setStatus(TASK_BAR_CANCELLED, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_BAR_CANCEL_FAILED);
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

  // ---- Clarification Requests (Issue #422, plan slice S76d; CLAR-001 to CLAR-007, INPUT-001 to INPUT-004) ------

  /** The plan below the open questions: everything in the body after them goes, and they stay where they are. */
  function replaceBody(...children: HTMLElement[]): void {
    if (body.firstElementChild !== questions) body.prepend(questions);
    for (const child of [...body.children]) if (child !== questions) child.remove();
    body.append(...children);
  }

  /**
   * The open questions of the Task's Run, first in the body: drawn again only when what they are changes — a question
   * asked or answered, its scope, 暂不回答, the note opened, or an action under way — never because the Run read on.
   */
  function paintQuestions(next: TaskPlanProjection): void {
    const open = next.clarifications.filter((card) => card.state === 'open');
    const key = JSON.stringify({
      ref: next.ref,
      open: open.map((card) => [card.requestId, card.scope, card.answerable.reason, deferredQuestions.has(card.requestId),
        clarificationDrafts.get(card.requestId)?.noteOpen ?? false]),
      working,
      interrupted,
    });
    if (key === questionsPainted) return;
    questionsPainted = key;
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && questions.contains(active) ? active.dataset['taskDrawerControl'] ?? null : null;
    questions.replaceChildren(...open.map((card) => questionCard(next, card)));
    if (keep !== null) questions.querySelector<HTMLElement>(`[data-task-drawer-control="${keep}"]`)?.focus();
  }

  function repaintQuestions(focus: string | null): void {
    questionsPainted = '';
    if (plan !== null) paintQuestions(plan);
    if (focus !== null) questions.querySelector<HTMLElement>(`[data-task-drawer-control="${focus}"]`)?.focus();
  }

  /**
   * One open question as its card (CLAR-002, INPUT-002 to INPUT-004): the question and why it is asked, what waits and
   * what goes on, what an answer does, the choices — none chosen, 推荐 marked with its reason — the note that may
   * qualify a choice, and 提交回答, which alone records; 暂不回答 sets the card aside and records nothing.
   */
  function questionCard(next: TaskPlanProjection, card: TaskPlanClarificationProjection): HTMLElement {
    const id = card.requestId;
    if (deferredQuestions.has(id)) {
      const line = el('p', 'task-plan-clarification-deferred');
      line.dataset['taskPlanClarification'] = id;
      line.dataset['clarificationState'] = 'deferred';
      const reopen = control(TASK_PLAN_CLARIFICATION_REOPEN, 'secondary', `clarification-reopen:${id}`);
      reopen.addEventListener('click', () => {
        deferredQuestions.delete(id);
        repaintQuestions(`clarification-heading:${id}`);
      });
      line.append(el('span', undefined, taskBarQuestionsNote(1)), reopen);
      return line;
    }
    const draft = clarificationDrafts.get(id) ?? { optionId: null, noteOpen: false, note: '' };
    const section = el('section', 'task-plan-clarification');
    section.dataset['taskPlanClarification'] = id;
    section.dataset['clarificationState'] = 'open';
    section.setAttribute('role', 'group');
    const heading = el('h4', undefined, TASK_PLAN_CLARIFICATION_HEADING);
    heading.id = uid('clarification');
    heading.tabIndex = -1;
    heading.dataset['taskDrawerControl'] = `clarification-heading:${id}`;
    section.setAttribute('aria-labelledby', heading.id);
    const scope = el('p', 'task-plan-clarification-scope', card.scope);
    scope.dataset['clarificationScope'] = '';
    const choices = el('fieldset', 'task-plan-clarification-choices');
    choices.append(el('legend', 'task-plan-clarification-question', card.question));
    const submit = control(TASK_PLAN_CLARIFICATION_SUBMIT, 'primary', `clarification-submit:${id}`);
    const submitWhy = el('small', 'field-note', TASK_PLAN_CLARIFICATION_SUBMIT_REASON);
    submitWhy.id = uid('clarification-submit');
    // A drawer whose service stopped offers nothing; the card says why it cannot be answered only when the Run says so.
    const blocked = card.answerable.reason ?? (interrupted ? '' : null);
    const ready = (): void => {
      submit.disabled = draft.optionId === null || working || blocked !== null;
      submitWhy.textContent = blocked ?? TASK_PLAN_CLARIFICATION_SUBMIT_REASON;
      submitWhy.hidden = !submit.disabled;
      if (submit.disabled) submit.setAttribute('aria-describedby', submitWhy.id);
      else submit.removeAttribute('aria-describedby');
    };
    for (const option of card.options) {
      const choice = el('label', 'task-plan-choice');
      choice.dataset['clarificationOption'] = option.id;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `clarification-${id}`;
      input.value = option.id;
      input.checked = draft.optionId === option.id;
      input.disabled = blocked !== null;
      input.dataset['taskDrawerControl'] = `clarification-option:${id}:${option.id}`;
      // A choice stays editable until 提交回答 (INPUT-004); choosing records nothing and moves no Run.
      input.addEventListener('change', () => {
        if (!input.checked) return;
        draft.optionId = option.id;
        clarificationDrafts.set(id, draft);
        ready();
      });
      const text = el('span', 'task-plan-choice-text');
      text.append(el('span', 'task-plan-choice-label', option.label));
      if (option.recommended !== null) {
        text.append(el('span', 'task-plan-choice-recommended', TASK_PLAN_CLARIFICATION_RECOMMENDED), el('small', 'field-note task-plan-choice-why', option.recommended));
      }
      text.append(el('small', 'field-note task-plan-choice-consequence', option.consequence));
      choice.append(input, text);
      choices.append(choice);
    }
    const noteToggle = control(card.note.label, 'quiet', `clarification-note-toggle:${id}`);
    noteToggle.setAttribute('aria-expanded', draft.noteOpen ? 'true' : 'false');
    noteToggle.disabled = blocked !== null;
    noteToggle.addEventListener('click', () => {
      draft.noteOpen = !draft.noteOpen;
      clarificationDrafts.set(id, draft);
      repaintQuestions(draft.noteOpen ? `clarification-note:${id}` : `clarification-note-toggle:${id}`);
    });
    const parts: HTMLElement[] = [heading, scope, choices, el('p', 'field-note task-plan-clarification-why', card.why),
      el('p', 'field-note task-plan-clarification-detail', card.detail), noteToggle];
    if (draft.noteOpen) {
      // The note is IME-safe: Enter writes into it and nothing is submitted but by 提交回答.
      const note = document.createElement('textarea');
      note.className = 'task-plan-clarification-note';
      note.rows = 3;
      note.maxLength = card.note.maxLength;
      note.value = draft.note;
      note.disabled = blocked !== null;
      note.dataset['taskDrawerControl'] = `clarification-note:${id}`;
      note.setAttribute('aria-label', card.note.label);
      const hint = el('small', 'field-note', card.note.hint);
      hint.id = uid('clarification-note');
      note.setAttribute('aria-describedby', hint.id);
      note.addEventListener('input', () => {
        draft.note = note.value;
        clarificationDrafts.set(id, draft);
      });
      parts.push(note, hint);
    }
    const defer = control(TASK_PLAN_CLARIFICATION_DEFER, 'secondary', `clarification-defer:${id}`);
    defer.addEventListener('click', () => {
      deferredQuestions.add(id);
      repaintQuestions(`clarification-reopen:${id}`);
    });
    submit.addEventListener('click', () => void submitAnswer(next, card, draft));
    ready();
    const actions = el('div', 'button-row');
    actions.append(submit, defer);
    parts.push(el('p', 'field-note task-plan-clarification-after', card.after), actions, submitWhy);
    section.append(...parts);
    return section;
  }

  /** What the Run asked and how each question was answered, below the activity card (CLAR-005). */
  function clarificationRecord(next: TaskPlanProjection): HTMLElement {
    const section = el('section', 'task-plan-clarification-record');
    section.append(el('h4', undefined, TASK_PLAN_CLARIFICATION_RECORD));
    const list = el('ul', 'task-plan-list');
    for (const card of next.clarifications.filter((entry) => entry.state !== 'open')) {
      const item = el('li');
      item.dataset['taskPlanClarification'] = card.requestId;
      item.dataset['clarificationState'] = card.state;
      item.append(el('span', undefined, card.question));
      item.append(el('span', 'field-note task-plan-clarification-answer', card.answer === null
        ? card.answerable.reason ?? ''
        : `${card.answer.line}（${localInstantLabel(card.answer.answeredAt)}）`));
      list.append(item);
    }
    section.append(list);
    return section;
  }

  /** 提交回答 (CLAR-005, CLAR-006): the choice and the note, recorded as the editor's answer; a refusal is said beside the bar. */
  async function submitAnswer(next: TaskPlanProjection, card: TaskPlanClarificationProjection, draft: { optionId: ClarificationOptionId | null; noteOpen: boolean; note: string }): Promise<void> {
    const current = plan;
    const asked = request;
    const optionId = draft.optionId;
    if (current === null || current.ref !== next.ref || optionId === null || !beginWork()) return;
    options.setStatus('正在提交回答…', 'busy');
    try {
      const note = draft.noteOpen && draft.note.trim().length > 0 ? draft.note.trim() : null;
      await api.answerBaselineAnalysisClarification({ taskIntentId: current.ref, requestId: card.requestId, optionId, note });
      clarificationDrafts.delete(card.requestId);
      deferredQuestions.delete(card.requestId);
      options.setStatus(TASK_PLAN_CLARIFICATION_SUBMITTED, 'success');
      focusBar = true;
      options.onRecorded(current.kind, current.bookId);
    } catch (error) {
      refusal = options.errorMessage(error, TASK_PLAN_CLARIFICATION_FAILED);
      options.setStatus(refusal, 'error');
    } finally {
      endWork(asked);
    }
  }

  // ---- the surface --------------------------------------------------------------------------------------

  const surface: TaskDrawerSurface = {
    open(next, finder, note) {
      request = next;
      returnFocus = finder;
      plan = null;
      painted = '';
      refusal = null;
      pendingNote = note ?? null;
      diffShown = false;
      ruleConfirmShown = false;
      cancelConfirmShown = false;
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
      questions.replaceChildren();
      questionsPainted = '';
      body.replaceChildren(questions, el('p', 'field-note task-drawer-loading', TASK_DRAWER_LOADING));
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
      pendingNote = null;
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
