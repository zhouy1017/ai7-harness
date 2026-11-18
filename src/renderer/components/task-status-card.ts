import { TASK_PLAN_OPEN, TASK_STATUS_VIEW_RESULT, type TaskStatusLines } from '../task-drawer-labels.js';

/**
 * The status card of a started Task in ordinary mode (Issue #1527): what is under way or what came of it, in a few lines, and the
 * way to the result and to the plan. It is built once and updated in place — the clock moves its text every second — so focus on its
 * buttons survives every read of the Task.
 */
export interface TaskStatusCard {
  readonly element: HTMLElement;
  /** `result` is the way to the finished Task's result, or `null` while there is none to open. */
  update(lines: TaskStatusLines, result: (() => void) | null): void;
}

function line(className: string): HTMLElement {
  const node = document.createElement('p');
  node.className = `task-status-${className}`;
  node.hidden = true;
  return node;
}

function setLine(node: HTMLElement, text: string | null): void {
  node.hidden = text === null;
  const next = text ?? '';
  if (node.textContent !== next) node.textContent = next;
}

export function createTaskStatusCard(options: { readonly viewPlan: () => void }): TaskStatusCard {
  const element = document.createElement('section');
  element.className = 'task-status-card';
  element.dataset['taskStatusCard'] = '';
  const sentence = line('sentence');
  const progress = document.createElement('div');
  progress.className = 'task-plan-progress task-status-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '任务进度');
  progress.setAttribute('aria-valuemin', '0');
  const fill = document.createElement('span');
  fill.className = 'task-plan-progress-fill';
  progress.append(fill);
  progress.hidden = true;
  const stale = line('stale');
  stale.classList.add('attention-note');
  const stage = line('line');
  const ceiling = line('ceiling');
  const model = line('model');
  const actions = document.createElement('div');
  actions.className = 'task-status-actions';
  const viewResult = document.createElement('button');
  viewResult.type = 'button';
  viewResult.className = 'btn primary';
  viewResult.dataset['taskDrawerControl'] = 'view-result';
  viewResult.textContent = TASK_STATUS_VIEW_RESULT;
  viewResult.hidden = true;
  const viewPlan = document.createElement('button');
  viewPlan.type = 'button';
  viewPlan.className = 'btn quiet task-plan-full-link';
  viewPlan.dataset['taskDrawerControl'] = 'full-link';
  viewPlan.textContent = TASK_PLAN_OPEN;
  viewPlan.addEventListener('click', options.viewPlan);
  actions.append(viewResult, viewPlan);
  element.append(sentence, progress, stale, stage, ceiling, model, actions);
  let open: (() => void) | null = null;
  viewResult.addEventListener('click', () => open?.());
  return {
    element,
    update(lines, result) {
      setLine(sentence, lines.sentence);
      progress.hidden = lines.progress === null;
      if (lines.progress !== null) {
        progress.setAttribute('aria-valuemax', String(lines.progress.total));
        progress.setAttribute('aria-valuenow', String(lines.progress.settled));
        progress.setAttribute('aria-valuetext', lines.progress.text);
        fill.setAttribute('style', `width: ${lines.progress.total === 0 ? 0 : lines.progress.settled / lines.progress.total * 100}%`);
      }
      setLine(stale, lines.stale);
      setLine(stage, lines.line);
      setLine(ceiling, lines.ceiling);
      setLine(model, lines.model);
      open = result;
      viewResult.hidden = result === null;
    },
  };
}
