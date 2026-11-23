/**
 * The status card of a started Task in ordinary mode (Issue #1527), as the editor sees it: the drawer names the Task, says its state in
 * the header, and holds one card — a bar and its stage while the Run is under way, one sentence, its duration, its model and 查看结果 once
 * it ended. What the card said once is not said again: no stage chain, goal, chips, footer, summary, status line or disabled 修改.
 *
 * "At most eight lines" is read from the rendered page: every visible line of words besides the controls counts for the lines it wraps
 * to (its height over its own line height), so a card that wraps at the Gate's window fails. Every geometry check is computed from the
 * window's own `innerWidth` and `innerHeight`, so the same stage runs at the wide window and at the Gate's.
 *
 * `ended` reads a Task that has finished (`model` is the frozen 模型@思考强度 it ran on, when the Journey knows it); otherwise a Run under
 * way, whose line is its stage and accumulated 用时. A finished Task keeps that same figure and its recorded request count;
 * `processed` requires a working-time reading, while tasks without a Run show none.
 */
export function statusCardExpression({ ended, model = null, processed = false }) {
  return `(() => {
    const drawer = document.querySelector('#task-drawer');
    if (!(drawer instanceof HTMLElement) || drawer.hidden || drawer.dataset.taskDrawer !== 'open') return false;
    const card = drawer.querySelector('[data-task-status-card]');
    if (!(card instanceof HTMLElement)) return false;
    const shown = (node) => node instanceof HTMLElement && node.getClientRects().length > 0;
    const line = (selector) => { const node = card.querySelector(selector); return shown(node) ? node.textContent : null; };
    const control = (name) => { const node = drawer.querySelector('[data-task-drawer-control="' + name + '"]'); return shown(node) && !node.disabled; };
    const box = drawer.getBoundingClientRect(), cardBox = card.getBoundingClientRect(), bar = drawer.querySelector('.task-drawer-bar');
    const words = Array.from(drawer.querySelectorAll('h2, h3, h4, p, li, dt, dd, .task-drawer-pill'))
      .filter((node) => shown(node) && node.textContent.trim().length > 0 && node.closest('button, .task-bar-actions, .task-drawer-modes') === null);
    const renderedLines = words.reduce((sum, node) => {
      const style = getComputedStyle(node), height = node.getBoundingClientRect().height;
      const inner = height - ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((total, key) => total + (parseFloat(style[key]) || 0), 0);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      return sum + Math.max(1, Math.round(inner / lineHeight));
    }, 0);
    const buttons = Array.from(drawer.querySelectorAll('.task-bar-actions button, .task-status-actions button')).filter(shown);
    const title = drawer.querySelector('.task-drawer-title')?.textContent ?? '';
    const duration = '\\\\d+ 秒|\\\\d+ 分 \\\\d+ 秒|\\\\d+ 小时 \\\\d+ 分';
    const progress = card.querySelector('.task-status-progress');
    const lineWords = line('.task-status-line');
    const kindOk = ${ended ? 'true' : 'false'}
      ? line('.task-status-sentence')?.startsWith('已完成，得到') === true &&
        (new RegExp('^用时 (' + duration + ')( · [0-9,]+ 次模型调用)?$', 'u').test(lineWords ?? '') || (${processed ? 'false' : 'true'} && lineWords === null)) &&
        control('view-result') && control('full-link') && (${JSON.stringify(model)} === null || line('.task-status-model') === '模型 ' + ${JSON.stringify(model)})
      : shown(progress) && progress.getAttribute('role') === 'progressbar' && Number(progress.getAttribute('aria-valuenow')) <= Number(progress.getAttribute('aria-valuemax')) &&
        new RegExp(' · 用时 (' + duration + ')$', 'u').test(lineWords ?? '') && control('pause') && control('cancel-run') && control('full-link');
    return kindOk && title.length > 0 && title !== '任务计划' &&
      Array.from(drawer.querySelectorAll('.task-drawer-mode'), (node) => node.textContent).join('|') === '运行|计划' &&
      ['.task-plan-stage-chain', '.task-plan-goal', '.task-plan-chips', '.task-plan-compact', '.task-plan-activity', '.task-bar-summary', '.task-bar-status',
        '[data-task-drawer-control="edit"]'].every((selector) => drawer.querySelector(selector) === null) &&
      !shown(drawer.querySelector('.task-drawer-footer')) && words.length <= 8 && renderedLines <= 8 &&
      box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && cardBox.left >= box.left - 1 && cardBox.right <= box.right + 1 &&
      shown(bar) && bar.getBoundingClientRect().bottom <= innerHeight + 1 &&
      buttons.length > 0 && buttons.every((button) => { const at = button.getBoundingClientRect(); return at.left >= box.left - 1 && at.right <= box.right + 1 && at.bottom <= innerHeight + 1; });
  })()`;
}

/**
 * The same task's 计划 view in ordinary mode: the goal and the plan, and — for a Run under way — the activity card without its stage
 * chain, whose rows keep the stage, the progress and the last update (and the step's own time while a step runs).
 */
export function planViewExpression({ running }) {
  return `(() => {
    const drawer = document.querySelector('#task-drawer');
    if (!(drawer instanceof HTMLElement) || drawer.hidden || drawer.dataset.taskDrawer !== 'open') return false;
    const rows = Array.from(drawer.querySelectorAll('.task-plan-activity-facts dt'), (node) => node.textContent);
    return drawer.querySelector('[data-task-status-card]') === null && drawer.querySelector('.task-plan-goal') !== null &&
      drawer.querySelector('.task-drawer-mode[aria-pressed="true"]')?.textContent === '计划' && drawer.querySelector('.task-plan-stage-chain') === null &&
      (${running ? 'true' : 'false'} ? ['阶段', '进度', '上次更新'].every((term) => rows.includes(term)) : rows.length === 0);
  })()`;
}
