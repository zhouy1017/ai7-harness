import {
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  PRODUCTION_DOCUMENT_REOPEN_REASONS,
  PRODUCTION_DOCUMENT_SKIP_REASONS,
  type ProductionDocumentPhaseAction,
  type ProductionDocumentPhaseId,
  type ProductionDocumentPhaseProjection,
  type ProductionDocumentProjection,
  type ProductionDocumentWorkflowProjection,
} from '../shared/protocol.js';
import { publicationCountLine } from './deliverables-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  DOCUMENT_PHASE_ACTION_LABELS,
  DOCUMENT_PHASE_CANCEL,
  DOCUMENT_PHASE_CONFIRM_LABELS,
  DOCUMENT_PHASE_CUSTOM_NEEDED,
  DOCUMENT_PHASE_MOVE_FAILED,
  DOCUMENT_PHASE_MOVING,
  DOCUMENT_PHASE_REASON_LEGENDS,
  DOCUMENT_PHASE_REASON_NEEDED,
  DOCUMENT_PHASE_REASON_TEXT_LABEL,
  DOCUMENT_PHASE_SHOW_REASON,
  DOCUMENT_WORKFLOW_NEXT_EMPTY,
  DOCUMENT_WORKFLOW_NEXT_HEADING,
  DOCUMENT_WORKFLOW_PHASES_HEADING,
  phaseActionName,
  phaseLatestLine,
  phaseMovedLine,
  phaseMovesLine,
  phaseReasonTextProblem,
  workflowProfileLine,
} from './production-document-labels.js';

/** What the lens may ask of the service: move a phase, and read the document again once a move was refused. */
export interface DocumentWorkflowActions {
  move(input: {
    phaseId: ProductionDocumentPhaseId;
    action: ProductionDocumentPhaseAction;
    expectedTransitions: number;
    reason: { choice: string; text: string | null } | null;
  }): Promise<ProductionDocumentProjection | null>;
  read(): Promise<ProductionDocumentProjection | null>;
  setStatus(text: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

interface ReasonForm {
  phaseId: ProductionDocumentPhaseId;
  action: 'skip' | 'reopen';
  choice: string | null;
  text: string;
  problem: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let sequence = 0;
const uid = (prefix: string): string => `${prefix}-${++sequence}`;

/**
 * The Deliverable Workflow of a Production Document at the top of its 工作流程 column (Issue #415, S66c; V2-UX-WORK-001 to
 * 009): the profile it follows and since when, its summary, 下一项需要处理, and its seven phases, each with its pill, what
 * it waits on, its latest move and the moves open to it. 跳过… and 重新打开… open the phase's own reason form, whose
 * choices start unselected (WORK-009). A move is the editor's command and nothing else: the lens records it and paints what
 * the service answers, never a guess. Without `actions` — a window that cannot move phases — it only reads.
 */
export function renderDocumentWorkflow(
  initial: ProductionDocumentWorkflowProjection,
  actions: DocumentWorkflowActions | null,
): { element: HTMLElement; paint(next: ProductionDocumentWorkflowProjection): void } {
  const section = el('section', 'document-lens-section document-workflow');
  let workflow = initial;
  let form: ReasonForm | null = null;
  let working = false;
  // Where focus goes once the next draw is in: a phase's reason form, or the phase itself after a move.
  let focusNext: { phaseId: ProductionDocumentPhaseId; target: 'form' | 'phase' | 'action' } | null = null;

  const move = async (
    phase: ProductionDocumentPhaseProjection,
    action: ProductionDocumentPhaseAction,
    reason: { choice: string; text: string | null } | null,
  ): Promise<void> => {
    if (actions === null || working) return;
    working = true;
    draw();
    actions.setStatus(DOCUMENT_PHASE_MOVING, 'busy');
    try {
      const next = await actions.move({ phaseId: phase.phaseId, action, expectedTransitions: workflow.transitions, reason });
      if (next !== null) workflow = next.workflow;
      form = null;
      focusNext = { phaseId: phase.phaseId, target: 'phase' };
      actions.setStatus(phaseMovedLine(action, phase.label), 'success');
    } catch (error) {
      actions.setStatus(actions.errorMessage(error, DOCUMENT_PHASE_MOVE_FAILED), 'error');
      // What stands now, so the next move is against it: another window may have moved the workflow first.
      try {
        const now = await actions.read();
        if (now !== null) workflow = now.workflow;
      } catch {
        // The status line already says the move failed; the lens keeps what it last read.
      }
      if (form !== null && !workflow.phases.some((entry) => entry.phaseId === form!.phaseId && entry.actions.includes(form!.action))) form = null;
      focusNext = { phaseId: phase.phaseId, target: form === null ? 'phase' : 'form' };
    } finally {
      working = false;
      draw();
    }
  };

  function phaseRow(phase: ProductionDocumentPhaseProjection): HTMLElement {
    const item = el('li', 'document-phase');
    item.dataset['phaseId'] = phase.phaseId;
    item.dataset['phaseState'] = phase.state;
    item.dataset['phaseWaiting'] = String(phase.waiting !== null);
    item.tabIndex = -1;
    const name = el('strong', 'document-phase-name', phase.label);
    name.id = uid('document-phase');
    item.setAttribute('aria-labelledby', name.id);
    const pill = el('span', 'phase-pill', phase.stateLabel);
    pill.dataset['phaseState'] = phase.waiting === null ? phase.state : 'waiting';
    const head = el('div', 'document-phase-head');
    head.append(name, pill);
    item.append(head);
    if (phase.waiting !== null) item.append(el('p', 'attention-note document-phase-waiting', phase.waiting));
    if (phase.latest !== null) {
      const line = phaseLatestLine(phase.latest, localInstantLabel(phase.latest.recordedAt));
      if (phase.latest.reason === null) {
        item.append(el('p', 'field-note document-phase-latest', line));
      } else {
        const why = el('details', 'document-phase-reason');
        why.append(el('summary', undefined, DOCUMENT_PHASE_SHOW_REASON), el('p', 'document-phase-latest', line));
        item.append(why);
      }
    }
    if (phase.moves > 1) item.append(el('p', 'field-note document-phase-moves', phaseMovesLine(phase.moves)));
    if (actions !== null && phase.actions.length > 0) {
      const buttons = el('div', 'button-row compact-actions');
      for (const action of phase.actions) {
        const control = el('button', action === 'start' || action === 'complete' ? 'secondary' : 'quiet', DOCUMENT_PHASE_ACTION_LABELS[action]);
        control.type = 'button';
        control.dataset['phaseAction'] = action;
        control.setAttribute('aria-label', phaseActionName(action, phase.label));
        control.disabled = working;
        if (action === 'skip' || action === 'reopen') {
          const open = form?.phaseId === phase.phaseId && form.action === action;
          control.setAttribute('aria-expanded', String(open));
          control.addEventListener('click', () => {
            form = open ? null : { phaseId: phase.phaseId, action, choice: null, text: '', problem: null };
            focusNext = { phaseId: phase.phaseId, target: open ? 'action' : 'form' };
            draw();
          });
        } else {
          control.addEventListener('click', () => void move(phase, action, null));
        }
        buttons.append(control);
      }
      item.append(buttons);
    }
    if (actions !== null && form !== null && form.phaseId === phase.phaseId) item.append(reasonForm(phase, form));
    return item;
  }

  function reasonForm(phase: ProductionDocumentPhaseProjection, state: ReasonForm): HTMLElement {
    const node = el('form', 'document-phase-form');
    node.dataset['phaseForm'] = state.action;
    node.noValidate = true;
    const choices = el('fieldset');
    choices.append(el('legend', undefined, DOCUMENT_PHASE_REASON_LEGENDS[state.action]));
    const reasons: Readonly<Record<string, string>> = state.action === 'skip' ? PRODUCTION_DOCUMENT_SKIP_REASONS : PRODUCTION_DOCUMENT_REOPEN_REASONS;
    const group = uid('document-phase-reason');
    for (const [choice, label] of Object.entries(reasons)) {
      const option = el('label', 'choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = group;
      radio.value = choice;
      radio.checked = state.choice === choice;
      radio.disabled = working;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.choice = choice;
        state.problem = null;
      });
      option.append(radio, el('span', undefined, label));
      choices.append(option);
    }
    const textLabel = el('label', 'field');
    const words = el('textarea');
    words.rows = 2;
    words.value = state.text;
    words.disabled = working;
    words.dataset['phaseReasonText'] = 'true';
    // Counted as the service counts it, and refused here with its reason rather than by the frame (Issue #626), as the 发稿
    // and 交付 forms do.
    const count = el('small', 'field-note document-phase-reason-count', publicationCountLine(state.text.trim(), MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS));
    count.id = uid('document-phase-reason-count');
    // Its own class, as the 发稿 fields' problems have theirs: the form's one `field-error` stays the form's own ask.
    const textProblem = el('p', 'document-phase-reason-problem');
    textProblem.id = uid('document-phase-reason-problem');
    const showTextProblem = (): void => {
      const problem = phaseReasonTextProblem(state.text.trim());
      textProblem.textContent = problem ?? '';
      textProblem.hidden = problem === null;
      words.setAttribute('aria-invalid', problem === null ? 'false' : 'true');
    };
    words.setAttribute('aria-describedby', `${count.id} ${textProblem.id}`);
    words.addEventListener('input', () => {
      state.text = words.value;
      count.textContent = publicationCountLine(state.text.trim(), MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS);
      showTextProblem();
    });
    showTextProblem();
    textLabel.append(el('span', undefined, DOCUMENT_PHASE_REASON_TEXT_LABEL), words, count, textProblem);
    node.append(choices, textLabel);
    if (state.problem !== null) {
      const problem = el('p', 'field-error', state.problem);
      problem.setAttribute('role', 'alert');
      node.append(problem);
    }
    const buttons = el('div', 'button-row compact-actions');
    const confirm = el('button', 'primary', DOCUMENT_PHASE_CONFIRM_LABELS[state.action]);
    confirm.type = 'submit';
    confirm.dataset['phaseFormConfirm'] = 'true';
    confirm.disabled = working;
    const cancel = el('button', 'quiet', DOCUMENT_PHASE_CANCEL);
    cancel.type = 'button';
    cancel.dataset['phaseFormCancel'] = 'true';
    cancel.disabled = working;
    cancel.addEventListener('click', () => {
      form = null;
      focusNext = { phaseId: phase.phaseId, target: 'action' };
      draw();
    });
    buttons.append(confirm, cancel);
    node.append(buttons);
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = state.text.trim();
      const problem = state.choice === null ? DOCUMENT_PHASE_REASON_NEEDED
        : state.choice === 'custom' && text.length === 0 ? DOCUMENT_PHASE_CUSTOM_NEEDED : phaseReasonTextProblem(text);
      if (problem !== null) {
        state.problem = problem;
        focusNext = { phaseId: phase.phaseId, target: 'form' };
        draw();
        return;
      }
      void move(phase, state.action, { choice: state.choice!, text: text.length === 0 ? null : text });
    });
    return node;
  }

  function draw(): void {
    section.dataset['workflowTransitions'] = String(workflow.transitions);
    const profile = el('p', 'field-note document-workflow-profile',
      workflowProfileLine(workflow.profile.name, workflow.profile.version, localInstantLabel(workflow.profile.activatedAt)));
    const summary = el('p', 'document-workflow-summary', workflow.summary);
    const nextHeading = el('h3', undefined, DOCUMENT_WORKFLOW_NEXT_HEADING);
    nextHeading.id = uid('document-workflow-next');
    const next = workflow.next.length === 0
      ? el('p', 'field-note document-workflow-next-empty', DOCUMENT_WORKFLOW_NEXT_EMPTY)
      : el('ol', 'document-workflow-next');
    if (workflow.next.length > 0) {
      next.setAttribute('aria-labelledby', nextHeading.id);
      for (const entry of workflow.next) {
        const item = el('li', undefined, entry.text);
        item.dataset['phaseId'] = entry.phaseId;
        next.append(item);
      }
    }
    const phasesHeading = el('h3', undefined, DOCUMENT_WORKFLOW_PHASES_HEADING);
    phasesHeading.id = uid('document-phases');
    const phases = el('ol', 'document-phases');
    phases.setAttribute('aria-labelledby', phasesHeading.id);
    for (const phase of workflow.phases) phases.append(phaseRow(phase));
    section.replaceChildren(profile, summary, nextHeading, next, phasesHeading, phases);
    const target = focusNext;
    focusNext = null;
    if (target === null) return;
    const row = phases.querySelector<HTMLElement>(`li[data-phase-id="${target.phaseId}"]`);
    // A form asks for what is missing: its own words once 自行输入 is chosen without them, else the chosen reason, else the
    // first.
    const wordsWrong = form?.problem === DOCUMENT_PHASE_CUSTOM_NEEDED || (form !== null && form.problem !== null && form.problem === phaseReasonTextProblem(form.text.trim()));
    const focusable = target.target === 'form'
      ? (wordsWrong ? row?.querySelector<HTMLElement>('.document-phase-form textarea') : null) ??
        row?.querySelector<HTMLElement>('.document-phase-form input:checked') ?? row?.querySelector<HTMLElement>('.document-phase-form input')
      : target.target === 'action'
        ? row?.querySelector<HTMLElement>('[data-phase-action="skip"], [data-phase-action="reopen"]')
        : row;
    focusable?.focus();
  }

  /** The control focus is on, as a selector within its phase's row; the row itself is the empty one. */
  function controlOf(active: HTMLElement): string {
    if (active.dataset['phaseAction'] !== undefined) return `[data-phase-action="${active.dataset['phaseAction']}"]`;
    if (active instanceof HTMLInputElement) return `.document-phase-form input[value="${CSS.escape(active.value)}"]`;
    if (active instanceof HTMLTextAreaElement) return '.document-phase-form textarea';
    if (active.dataset['phaseFormConfirm'] !== undefined) return '[data-phase-form-confirm]';
    if (active.dataset['phaseFormCancel'] !== undefined) return '[data-phase-form-cancel]';
    if (active.localName === 'summary') return 'details.document-phase-reason > summary';
    return '';
  }

  /**
   * Draw again from a fresh read with the editor left where they were: on the same control of the same phase — the words of
   * a reason they are writing where their caret was — and the reasons they opened still open.
   */
  function redraw(): void {
    const active = document.activeElement instanceof HTMLElement && section.contains(document.activeElement) ? document.activeElement : null;
    const phaseId = active?.closest<HTMLElement>('li[data-phase-id]')?.dataset['phaseId'];
    const control = active === null ? '' : controlOf(active);
    const caret = active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] as const : null;
    const opened = Array.from(section.querySelectorAll('details.document-phase-reason[open]'),
      (details) => details.closest<HTMLElement>('li[data-phase-id]')?.dataset['phaseId']);
    draw();
    for (const phase of opened) {
      const details = section.querySelector<HTMLDetailsElement>(`li[data-phase-id="${phase}"] details.document-phase-reason`);
      if (details !== null) details.open = true;
    }
    if (phaseId === undefined) return;
    const row = section.querySelector<HTMLElement>(`li[data-phase-id="${phaseId}"]`);
    const target = control === '' ? row : row?.querySelector<HTMLElement>(control) ?? row;
    target?.focus();
    if (target instanceof HTMLTextAreaElement && caret !== null) target.setSelectionRange(caret[0], caret[1]);
  }

  draw();
  return {
    element: section,
    paint(next) {
      // A read that set out before a move can answer after it: it knows fewer moves, and the lens keeps the newer.
      if (next.transitions < workflow.transitions || JSON.stringify(next) === JSON.stringify(workflow)) return;
      workflow = next;
      if (form !== null && !next.phases.some((entry) => entry.phaseId === form!.phaseId && entry.actions.includes(form!.action))) form = null;
      redraw();
    },
  };
}

/** The 交付物 card's reading of a document's workflow: its summary, the first 下一项, and a chip per phase. */
export function renderWorkflowCardSummary(workflow: ProductionDocumentWorkflowProjection): HTMLElement {
  const node = el('div', 'document-workflow-card');
  node.dataset['workflowTransitions'] = String(workflow.transitions);
  node.append(el('p', 'document-workflow-summary', workflow.summary));
  const first = workflow.next[0];
  if (first !== undefined) {
    const next = el('p', 'document-workflow-next-line', `${DOCUMENT_WORKFLOW_NEXT_HEADING}：${first.text}`);
    next.dataset['phaseId'] = first.phaseId;
    node.append(next);
  }
  const chips = el('ol', 'document-phase-chips');
  for (const phase of workflow.phases) {
    const chip = el('li', 'phase-chip', `${phase.label} · ${phase.stateLabel}`);
    chip.dataset['phaseId'] = phase.phaseId;
    chip.dataset['phaseState'] = phase.waiting === null ? phase.state : 'waiting';
    chips.append(chip);
  }
  node.append(chips);
  return node;
}
