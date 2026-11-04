import type { RendererApi, TaskOverviewGroupProjection, TaskOverviewItemProjection, TaskOverviewProjection } from '../shared/protocol.js';

const GROUP_LABELS: Record<TaskOverviewGroupProjection['key'], string> = {
  running: '正在运行', queued: '排队等待', waiting: '等你处理', paused: '已暂停', recent: '最近完成',
};
const STATE_LABELS: Record<TaskOverviewItemProjection['state'], string> = {
  running: '运行中', queued: '排队中', waiting: '等你处理', paused: '已暂停', completed: '已完成', cancelled: '已取消', stopped: '已停止',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') { node.className = `${node.className} btn`.trim(); (node as HTMLButtonElement).type = 'button'; }
  return node;
}

function progressLine(item: TaskOverviewItemProjection): string {
  if (item.state === 'queued') return item.queuePosition === null ? '等待运行名额' : `第 ${item.queuePosition} 位 · 等待运行名额`;
  if (item.state === 'waiting') return item.nextAction === 'answer-clarification' ? 'AI7 有问题等你回答' : '有一项处理需要你的决定';
  if (item.state === 'paused') return '你已暂停 · 可续行';
  if (item.state === 'completed') return '已有结果';
  if (item.state === 'cancelled') return '已取消 · 没有形成结果';
  if (item.state === 'stopped') return '已停止 · 可查看运行';
  const progress = item.progress;
  return progress === null ? '正在处理' : `第 ${progress.done} / ${progress.total} 个单元${progress.modelWaiting ? ' · 等待模型响应' : ''}`;
}

export interface TaskOverviewOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectTaskOverview' | 'reorderQueuedRun' | 'startQuickTasks'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly openTarget: (item: TaskOverviewItemProjection) => void;
}

export interface TaskOverviewSurface { refresh(): void; destroy(): void; }

export function mountTaskOverview(options: TaskOverviewOptions): TaskOverviewSurface {
  let destroyed = false;
  let projection: TaskOverviewProjection | null = null;
  let selectedBook = 'all';
  let selectedType = 'all';
  const headingRow = el('div', 'task-overview-heading-row');
  const heading = el('h1', 'task-overview-title', '任务');
  const start = el('button', 'btn primary', '发起任务 ▾');
  headingRow.append(heading, start);
  const context = el('p', 'task-overview-context');
  const filters = el('div', 'task-overview-filters');
  const host = el('div', 'task-overview-groups');
  const sheet = el('section', 'sheet task-overview-sheet');
  sheet.hidden = true;
  options.root.append(headingRow, context, filters, host, sheet);

  start.addEventListener('click', () => { sheet.hidden = !sheet.hidden; if (!sheet.hidden) paintSheet(); });

  function paintSheet(): void {
    sheet.replaceChildren();
    sheet.append(el('div', 'sheet-bar', '发起任务'), el('p', 'task-overview-sheet-note', '选择图书后加入快速开始队列；窗口保持在任务总览。'));
    const books = [...new Map((projection?.groups ?? []).flatMap((group) => group.items.filter((item) => item.bookId !== null).map((item) => [item.bookId!, item.bookTitle ?? '未命名图书'] as const))).entries()];
    const list = el('div', 'task-overview-sheet-books');
    books.forEach(([bookId, title]) => {
      const label = el('label', 'task-overview-sheet-book');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = bookId;
      label.append(checkbox, document.createTextNode(title)); list.append(label);
    });
    const foot = el('div', 'sheet-foot');
    const add = el('button', 'btn primary', '加入队列');
    add.addEventListener('click', () => {
      const tasks = [...list.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => ({ bookId: input.value, procedureId: 'ai7-procedure/baseline-analysis' }));
      if (tasks.length === 0) { options.setStatus('请先选择图书。', 'error'); return; }
      void options.api.startQuickTasks({ tasks }).then((result) => { options.setStatus(`已加入 ${result.results.length} 项`, 'success'); sheet.hidden = true; refresh(); }, (error: unknown) => options.setStatus(error instanceof Error ? error.message : '任务未能加入队列。', 'error'));
    });
    const close = el('button', 'btn quiet', '关闭'); close.addEventListener('click', () => { sheet.hidden = true; });
    foot.append(add, close); sheet.append(list, foot);
  }

  function button(label: string, action: () => void, active = false): HTMLButtonElement {
    const node = el('button', 'btn quiet task-overview-filter', label);
    node.setAttribute('aria-pressed', String(active));
    node.addEventListener('click', action);
    return node;
  }

  function paintFilters(): void {
    filters.replaceChildren();
    const books = ['all', ...new Set((projection?.groups ?? []).flatMap((group) => group.items.map((item) => item.bookTitle).filter((title): title is string => title !== null)))];
    const types = ['all', '分析', '审阅', '评估', '写作', '对话', '工序'];
    const bookRow = el('div', 'task-overview-filter-row');
    bookRow.append(el('span', 'task-overview-filter-label', '图书'));
    books.forEach((book) => bookRow.append(button(book === 'all' ? '全部' : book, () => { selectedBook = book; paint(); }, selectedBook === book)));
    const typeRow = el('div', 'task-overview-filter-row');
    typeRow.append(el('span', 'task-overview-filter-label', '类型'));
    types.forEach((type) => typeRow.append(button(type === 'all' ? '全部' : type, () => { selectedType = type; paint(); }, selectedType === type)));
    filters.append(bookRow, typeRow);
  }

  function card(item: TaskOverviewItemProjection): HTMLElement {
    const node = el('article', 'task-overview-card');
    node.dataset['taskItem'] = item.itemId;
    const title = el('div', 'task-overview-card-title');
    title.append(el('span', 'task-overview-book', item.bookTitle ?? '全局'), el('span', 'task-overview-separator', ' · '), el('strong', undefined, item.label));
    const pill = el('span', `state-term task-overview-state task-overview-state-${item.state}`, STATE_LABELS[item.state]);
    title.append(pill);
    const line = el('div', 'task-overview-card-line', progressLine(item));
    node.append(title, line);
    if (item.state === 'running' && item.progress !== null) {
      const bar = el('progress', 'task-overview-progress');
      bar.max = Math.max(1, item.progress.total); bar.value = Math.min(item.progress.done, item.progress.total);
      node.append(bar);
    }
    const actions = el('div', 'task-overview-card-actions');
    if (item.state === 'queued' && item.runRecordId !== null) {
      const up = el('button', 'btn quiet', '上移');
      up.addEventListener('click', (event) => { event.stopPropagation(); void move(item, Math.max(1, (item.queuePosition ?? 1) - 1)); });
      const top = el('button', 'btn quiet', '置顶');
      top.addEventListener('click', (event) => { event.stopPropagation(); void move(item, 1); });
      actions.append(up, top);
    }
    if (item.state === 'waiting') actions.append(el('span', 'task-overview-action-hint', '打开处理'));
    node.append(actions);
    node.addEventListener('click', () => options.openTarget(item));
    return node;
  }

  async function move(item: TaskOverviewItemProjection, position: number): Promise<void> {
    if (item.runRecordId === null) return;
    try { options.setStatus('正在调整队列…', 'busy'); await options.api.reorderQueuedRun({ runRecordId: item.runRecordId, position }); options.setStatus('队列顺序已更新', 'success'); refresh(); }
    catch (error) { options.setStatus(error instanceof Error ? error.message : '队列顺序未能更新。', 'error'); }
  }

  function paint(): void {
    if (projection === null) return;
    context.textContent = `全部图书 · 同时运行 ${projection.runningCount} 项 · 排队 ${projection.queuedCount} 项 · 上限 ${projection.capacity}`;
    paintFilters();
    if (!sheet.hidden) paintSheet();
    host.replaceChildren(...projection.groups.map((group) => {
      const section = el('section', 'task-overview-group');
      const heading = el('h2', 'task-overview-group-heading', `${GROUP_LABELS[group.key]} · ${group.total}`);
      const items = group.items.filter((item) => (selectedBook === 'all' || item.bookTitle === selectedBook) && (selectedType === 'all' || item.taskKind === selectedType));
      section.append(heading, items.length === 0 ? el('p', 'task-overview-empty', '这里暂时没有任务。') : el('div', 'task-overview-items'));
      const list = section.lastElementChild;
      if (list !== null && list.classList.contains('task-overview-items')) list.append(...items.map(card));
      return section;
    }));
  }

  function refresh(): void {
    if (destroyed) return;
    void options.api.inspectTaskOverview().then((next) => { if (!destroyed) { projection = next; paint(); } }, (error: unknown) => options.setStatus(error instanceof Error ? error.message : '任务总览暂时无法读取。', 'error'));
  }

  refresh();
  return { refresh, destroy() { destroyed = true; options.root.replaceChildren(); } };
}
