import { rendererErrorMessage } from './error-words.js';
import { retainPollInteraction, pollControlEngaged } from './poll-interaction.js';
import type { RendererApi, TaskOverviewItemProjection, TaskOverviewProjection, TaskOverviewCall } from '../shared/protocol.js';
import { createSheet, sheetContent } from './components/sheet.js';
import { readActionDefaults, rememberActionDefaults } from './action-defaults.js';
import { showToast } from './components/toast.js';
import { menuPanel } from './components/controls.js';
import type { TaskPlanProjection, ClarificationOptionId } from '../shared/protocol.js';
import { attentionSentence, globalAttentionTimeLine } from './global-attention-labels.js';
import { TASK_BAR_CANCELLED, TASK_BAR_CANCELLED_NOTE, taskWorkLine } from './task-drawer-labels.js';
import { taskCardView, TASK_PAGE_GROUP_LABELS, TASK_PAGE_GROUPS, TASK_PANEL_GROUP_LABELS, TASK_PANEL_GROUPS, type TaskCardAction } from './task-card-view.js';
export type { TaskCardAction } from './task-card-view.js';
const BOOK_FILTER_BUTTONS = 6;
const PROCEDURES = [['baseline-analysis', '基线分析'], ['initial-evaluation', '评估']] as const;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text;
  if (tag === 'button') { node.classList.add('btn'); (node as HTMLButtonElement).type = 'button'; } return node;
}
/** Both the global page and the in-Book pane render this exact card; its words and actions are `taskCardView`'s (Issue #1680). */
export function taskOverviewCard(item: TaskOverviewItemProjection, act: (item: TaskOverviewItemProjection, action: TaskCardAction) => void, inBook = false, relaunch: boolean | Promise<boolean> = false): HTMLElement {
  const view = taskCardView(item, relaunch === true);
  const node = el('article', 'task-overview-card'); node.dataset['taskItem'] = item.itemId; node.dataset['taskItemId'] = item.itemId; node.dataset['taskState'] = item.attention.state; node.tabIndex = 0;
  const title = el('div', 'task-overview-card-title'); title.append(el('span', 'task-overview-book', item.bookTitle ?? '全局'), el('span', undefined, ' · '), el('strong', undefined, item.label), el('span', `state-term task-overview-state task-overview-state-${view.pageGroup}`, view.pill));
  node.dataset['taskKind'] = item.taskKind;
  const line = el('div', 'task-overview-card-line', attentionSentence(view.line)); line.title = line.textContent ?? '';
  const time = el('time', 'task-overview-card-time', globalAttentionTimeLine(item.attention.group, item.at, item.state)); time.dateTime = item.at;
  const body = el('div', 'task-overview-card-body'); body.append(el('div', 'task-overview-card-kind', item.taskKind), title, line, time);
  const work = taskWorkLine(item.work, Date.now());
  if (work !== null) body.append(el('span', 'task-overview-usage', work));
  const modelLabel = item.work?.finished ? item.work.finished.modelLabel : item.attention.modelLabel;
  if (modelLabel) body.append(el('span', 'task-overview-model', modelLabel));
  if (view.pageGroup === 'running' && item.progress !== null) { const bar = el('progress', 'task-overview-progress'); bar.max = Math.max(1, item.progress.total); bar.value = Math.min(item.progress.done, item.progress.total); body.append(bar); }
  const actions = el('div', 'task-overview-card-actions');
  function actionButton(entry: (typeof view.actions)[number]): HTMLButtonElement {
    const button = el('button', 'quiet', entry.label);
    button.dataset['taskAction'] = entry.action;
    button.addEventListener('click', event => { event.stopPropagation(); act(item, entry.action); });
    return button;
  }
  actions.append(...view.actions.map(actionButton));
  const more = el('details', 'task-overview-more'); more.append(el('summary', undefined, '更多'));
  const menu = menuPanel(); more.append(menu);
  // The Book panel is already the Book: 打开所在图书 is the 任务 page's alone (Issue #1680).
  for (const [label, action] of [['查看计划', 'plan'], ['查看运行', 'run'], ...(item.selection && !view.actions.some(entry => entry.action === 'jump') ? [['跳到所选文字', 'jump']] as const : []), ...(inBook ? [] : [['打开所在图书', 'book']] as const)] as const) { const button = el('button', 'quiet', label); button.dataset['taskAction'] = action; button.addEventListener('click', (event) => { event.stopPropagation(); act(item, action); more.open = false; }); menu.append(button); }
  more.addEventListener('click', (event) => event.stopPropagation()); actions.append(more); node.append(body, actions);
  if (typeof relaunch !== 'boolean') void relaunch.then(available => {
    if (!available) return;
    const offered = taskCardView(item, true).actions;
    for (const button of Array.from(actions.children)) {
      if (button.tagName === 'BUTTON' && !offered.some(entry => entry.action === button.getAttribute('data-task-action'))) button.remove();
    }
    const index = offered.findIndex(entry => entry.action === 'redo');
    if (index >= 0) actions.insertBefore(actionButton(offered[index]!), actions.children[index] ?? more);
  });
  node.addEventListener('click', () => act(item, 'open')); return node;
}
export interface TaskOverviewOptions {
  readonly beforeStart?: () => Promise<boolean>;
  readonly onChanged?: () => void; readonly onProjection?: (projection: TaskOverviewProjection) => void;
  readonly root: HTMLElement; readonly api: Pick<RendererApi, 'inspectTaskOverview' | 'controlAllTasks' | 'startQuickTasks' | 'reorderQueuedRun' | 'taskOverviewCall' | 'pollServiceJob'>; readonly bookId?: string;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  /** `cancel` opens the plan with 取消任务's Cancellation Impact Summary open; `redo` with 重新开始… pressed (Issue #1680). */
  readonly openTarget: (item: TaskOverviewItemProjection, view?: 'plan' | 'run' | 'redo' | 'cancel' | 'unconfirmed') => void;
  /** The record's own surface (继续 of a 审阅 a closed service left half-way: the 审阅 page, where it goes on). */
  readonly openRecord?: (item: TaskOverviewItemProjection) => void;
  /** 去设置 › 模型服务 › 网络代理 of a Run the proxy or the model service stopped. */
  readonly openNetworkProxySettings?: () => void;
  readonly openBook: (bookId: string) => void; readonly openResult: (item: TaskOverviewItemProjection) => void;
  readonly configure?: (bookId: string, kind: 'review' | 'writing') => void;
  readonly closeDrawer?: () => void; readonly jumpToSelection?: (item: TaskOverviewItemProjection) => void;
}
export interface TaskOverviewSurface { refresh(): void; showStart(): void; focus(itemId: string): void; destroy(): void; }
export function mountTaskOverview(options: TaskOverviewOptions): TaskOverviewSurface {
  let actionGeneration = 0;
  let destroyed = false, busy = false, inFlight = false; let projection: TaskOverviewProjection | null = null; let painted = ''; let selectedId: string | null = null; let pendingFocus: string | null = null;
  const recipes = new Map<string, Promise<boolean>>();
  let recipeSources = '';
  const key = `ai7.task-overview.filters.${options.bookId ?? 'all'}`;
  let selectedBook = options.bookId ?? 'all', selectedType = 'all', selectedTime = 'today';
  try { const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>; selectedBook = options.bookId ?? saved['book'] ?? 'all'; selectedType = saved['type'] ?? 'all'; selectedTime = saved['time'] ?? 'today'; } catch { /* A missing view preference uses its default. */ }
  const remember = (): void => { localStorage.setItem(key, JSON.stringify({ book: selectedBook, type: selectedType, time: selectedTime })); painted = ''; paint(); };
  // The page's name is said once, by the context header; the heading stays for the page's label (#1522).
  const headingRow = el('div', 'task-overview-heading-row'); const heading = el(options.bookId ? 'h3' : 'h1', options.bookId ? 'task-overview-title' : 'task-overview-title visually-hidden', '任务');
  const start = el('button', 'primary', '发起任务 ▾'); start.dataset['taskOverviewStart'] = ''; start.disabled = true;
  const all = el('button', 'quiet'); all.addEventListener('click', () => void perform(async () => { await options.api.controlAllTasks({ action: projection?.queueFrozen ? 'resume' : 'pause' }); }));
  const context = el('span', 'task-overview-context'); headingRow.append(heading, context); if (!options.bookId) headingRow.append(start, all);
  const filters = el('div', 'task-overview-filters'); const host = el('div', 'task-overview-groups');
  if (options.bookId) { heading.hidden = true; context.hidden = true; selectedType = 'all'; selectedTime = 'all'; }
  // The page's one sentence while it holds tasks; with none, the sentence in its place is the empty page's.
  const note = el('p', 'field-note', '队列顺序保存在本次使用中；重新启动后按发起顺序排列。'); note.hidden = true;
  const sheet = createSheet('task-overview-sheet'); options.root.append(headingRow, filters, host, note, sheet);
  // The sheet is painted before it is shown, so its focus and its ticked Book are there when it opens; the sheet itself takes focus in and returns it.
  let sheetOpening = false;
  const openSheet = (): Promise<void> => paintSheet().then(() => { if (!destroyed) { start.focus(); sheet.show(); } }, (error: unknown) => options.setStatus(rendererErrorMessage(error, '暂时无法打开发起任务。'), 'error'));
  start.addEventListener('click', () => {
    if (sheet.open) { sheet.close(); return; }
    if (sheetOpening) return;
    sheetOpening = true; void openSheet().finally(() => { sheetOpening = false; });
  });
  async function paintSheet(): Promise<void> {
    const defaults = await readActionDefaults(); if (destroyed) return;
    projection ??= await options.api.inspectTaskOverview(); if (destroyed) return;
    const books = (projection?.books ?? []).filter((book) => !options.bookId || options.bookId === book.bookId); const list = el('div', 'task-overview-sheet-books');
    // It opens with one Book: the one this page is about, else the Book last used, else none; a task is never started for a Book the editor did not tick.
    const opened = options.bookId ?? (selectedBook !== 'all' ? selectedBook : books.find((book) => defaults.taskBooks.includes(book.bookId))?.bookId) ?? null;
    for (const book of books) { const label = el('label', 'task-overview-sheet-book'); const input = el('input'); input.type = 'checkbox'; input.value = book.bookId; input.checked = book.bookId === opened; label.append(input, document.createTextNode(book.title)); list.append(label); }
    const type = el('select'); type.setAttribute('aria-label', '工序');
    const procedures = new Map<string, string>(PROCEDURES);
    for (const rule of projection?.quickStarts ?? []) if (!options.bookId || rule.bookId === options.bookId) procedures.set(rule.procedureId, rule.label);
    for (const [id, label] of procedures) type.add(new Option(label, id));
    type.value = procedures.has(defaults.taskProcedure) ? defaults.taskProcedure : PROCEDURES[0][0];
    const added = el('span'); added.dataset['taskOverviewAdded'] = ''; let count = 0;
    const add = el('button', 'primary'); add.dataset['taskOverviewEnqueue'] = '';
    const countTicked = (): void => { add.textContent = `加入队列（${list.querySelectorAll('input:checked').length} 本）`; };
    list.addEventListener('change', countTicked); countTicked();
    add.addEventListener('click', () => { const tasks = [...list.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => ({ bookId: input.value, procedureId: type.value })); if (!tasks.length) { options.setStatus('请先选择图书。', 'error'); return; }
      add.disabled = true; void rememberActionDefaults({ taskBooks: tasks.map((task) => task.bookId), taskProcedure: type.value }).catch(() => options.setStatus('未能记住任务设置。', 'error'));
      const enqueue = async () => { if (options.beforeStart && !await options.beforeStart()) return null; return options.api.startQuickTasks({ tasks }); };
      void enqueue().then((result) => { if (result === null) return; count += result.results.length; added.textContent = `已加入 ${count} 项`; options.onChanged?.(); refresh(); }, (error: unknown) => { added.textContent = '未能全部加入，请查看任务列表后继续。'; options.setStatus(rendererErrorMessage(error, '任务未能加入。'), 'error'); refresh(); }).finally(() => { add.disabled = false; }); });
    const close = el('button', 'quiet', '关闭'); close.addEventListener('click', () => sheet.close());
    const foot = el('div'); foot.append(added, add, close);
    const config = el('div', 'button-row'); for (const [label, kind] of [['自定义审阅…', 'review'], ['写作任务说明…', 'writing']] as const) { const link = el('button', 'quiet', label); link.addEventListener('click', () => { const book = list.querySelector<HTMLInputElement>('input:checked')?.value; if (book) { sheet.close(); options.configure?.(book, kind); } }); config.append(link); }
    sheetContent(sheet, el('h2', undefined, '发起任务'), [list, type, config], foot);
  }
  function filter(label: string, active: boolean, action: () => void): HTMLButtonElement { const node = el('button', 'quiet task-overview-filter', label); node.setAttribute('aria-pressed', String(active)); node.addEventListener('click', action); return node; }
  /** No task at all, whatever the filters say: the page is one sentence. */
  function nothingToShow(): boolean { return !options.bookId && projection !== null && projection.groups.every((group) => group.items.length === 0); }
  function paintFilters(): void {
    if (options.bookId || nothingToShow()) { filters.replaceChildren(); return; }
    const rows: HTMLElement[] = []; const books = projection?.books ?? [];
    const row = el('div', 'task-overview-filter-row'); row.append(el('span', undefined, '图书'));
    if (books.length > BOOK_FILTER_BUTTONS) {
      // Above six Books a button each no longer fits one line; the same choice is a list.
      const pick = el('select'); pick.setAttribute('aria-label', '图书'); pick.add(new Option('全部', 'all')); for (const book of books) pick.add(new Option(book.title, book.bookId)); pick.value = selectedBook;
      pick.addEventListener('change', () => { selectedBook = pick.value; remember(); }); row.append(pick); // the repaint keeps focus on the list's trigger, as every polled page's does
    } else { row.append(filter('全部', selectedBook === 'all', () => { selectedBook = 'all'; remember(); })); for (const book of books) row.append(filter(book.title, selectedBook === book.bookId, () => { selectedBook = book.bookId; remember(); })); }
    rows.push(row);
    const types = el('div', 'task-overview-filter-row'); types.append(el('span', undefined, '类型')); for (const type of ['all', '分析', '审阅', '评估', '写作', '对话', '工序']) types.append(filter(type === 'all' ? '全部' : type, selectedType === type, () => { selectedType = type; remember(); }));
    const time = el('div', 'task-overview-filter-row'); time.append(el('span', undefined, '最近完成')); for (const [value, label] of [['today', '今天'], ['week', '7 天'], ['all', '全部']]) time.append(filter(label!, selectedTime === value, () => { selectedTime = value!; remember(); })); rows.push(types, time); filters.replaceChildren(...rows);
  }
  // One action at a time; an answer that arrives after the surface left paints, focuses and opens nothing (Issue #1680).
  async function perform(action: () => Promise<void>): Promise<void> { if (busy || destroyed) return; busy = true; try { await action(); } catch (error) { if (!destroyed) options.setStatus(rendererErrorMessage(error, '任务操作未能完成。'), 'error'); } finally { busy = false; if (!destroyed) { options.onChanged?.(); refresh(); } } }
  async function call(item: TaskOverviewItemProjection, operation: TaskOverviewCall['operation'], input: object): Promise<unknown> { if (!item.bookId) return; return options.api.taskOverviewCall({ operation, bookId: item.bookId, input } as TaskOverviewCall); }
  function act(item: TaskOverviewItemProjection, action: TaskCardAction): void {
    if (destroyed) return;
    actionGeneration += 1;
    selectedId = item.itemId;
    if (action === 'answer' && item.nextAction === 'answer-clarification' && item.plan) { void answerOnCard(item); return; }
    if (action === 'open' || action === 'answer' || action === 'plan' || action === 'run' || action === 'next' || action === 'unconfirmed') { options.openTarget(item, action === 'plan' || action === 'unconfirmed' ? action : 'run'); return; }
    if (action === 'jump') { options.jumpToSelection?.(item); return; }
    if (action === 'book') { if (item.bookId) options.openBook(item.bookId); return; }
    if (action === 'result') { options.openResult(item); return; }
    if (action === 'proxy') { options.openNetworkProxySettings?.(); return; }
    // 重新开始… opens the plan and its relaunch there, with the model chooser (Issue #1680); nothing is sent from the card.
    if (action === 'redo') { options.openTarget(item, 'redo'); return; }
    // A 审阅 a closed service left half-way goes on on its own page.
    if (action === 'resume' && item.attention.state === 'review-continuable') { options.openRecord?.(item); return; }
    // One cancellation (Issue #1680): what has sent nothing is cancelled in one press; a started Run through the plan's impact summary.
    if (action === 'cancel' && !taskCardView(item).cancelInOnePress) { options.openTarget(item, 'cancel'); return; }
    void perform(async () => {
      if ((action === 'up' || action === 'top') && item.runRecordId) await options.api.reorderQueuedRun({ runRecordId: item.runRecordId, position: action === 'top' ? 1 : Math.max(1, (item.queuePosition ?? 1) - 1) });
      else if (action === 'again' && item.target.kind === 'dialogue') { if (options.beforeStart && !await options.beforeStart()) return; await dialogueAction(item, 'regenerateDialogueAnswer'); }
      else if (action === 'cancel') { const notSent = await cancel(item); if (!destroyed) options.setStatus(notSent ? TASK_BAR_CANCELLED : TASK_BAR_CANCELLED_NOTE, 'success'); }
      else if (item.target.kind === 'dialogue') { await dialogueAction(item, action === 'pause' ? 'stopDialogueAnswer' : 'continueDialogueAnswer'); }
      else if (item.plan?.ref) await call(item, item.plan.kind === 'baseline-analysis' ? action === 'pause' ? 'pauseBaselineAnalysisRun' : 'resumeBaselineAnalysisRun' : 'controlTaskRun', item.plan.kind === 'baseline-analysis' ? { taskIntentId: item.plan.ref } : { ...item.plan, action });
      if (destroyed) return;
      if ((action === 'up' || action === 'top') && item.runRecordId && item.queuePosition !== null) showToast('队列顺序已更新。', { action: { label: '撤销', run: () => void perform(async () => { await options.api.reorderQueuedRun({ runRecordId: item.runRecordId!, position: item.queuePosition! }); }) } });
      else if (action === 'pause' || action === 'resume') showToast(action === 'pause' ? '任务已暂停。' : '任务已继续。', { action: { label: '撤销', run: () => act(item, action === 'pause' ? 'resume' : 'pause') } });
    });
  }
  async function answerOnCard(item: TaskOverviewItemProjection): Promise<void> {
    const node = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === item.itemId);
    if (!node || node.querySelector('[data-card-answer]') || !item.plan) return;
    const generation = actionGeneration;
    try {
      const plan = await call(item, 'inspectTaskPlan', item.plan) as TaskPlanProjection;
      if (destroyed || generation !== actionGeneration || !host.contains(node) || selectedId !== item.itemId) return;
      const question = plan.clarifications.find((card) => card.state === 'open');
      if (!question) { options.openTarget(item); return; }
      const form = el('form', 'task-card-answer'); form.dataset['cardAnswer'] = ''; form.addEventListener('click', (event) => event.stopPropagation());
      const choices = el('fieldset'); choices.append(el('legend', undefined, question.question));
      let selected: ClarificationOptionId | null = null;
      const text = el('textarea'); text.setAttribute('aria-label', '补充说明'); text.maxLength = 1000;
      const submit = el('button', 'primary', '提交回答'); submit.disabled = true;
      const ready = (): void => { submit.disabled = question.answerable.reason !== null || selected === null || selected === 'free-text' && !text.value.trim(); };
      for (const option of question.options) { const label = el('label', 'choice'); const radio = el('input'); radio.type = 'radio'; radio.name = `answer-${item.itemId}`; radio.value = option.id; radio.checked = false;
        radio.addEventListener('change', () => { selected = option.id; ready(); }); label.append(radio, document.createTextNode(`${option.label} · ${option.consequence}`)); choices.append(label); }
      text.addEventListener('input', ready);
      form.addEventListener('submit', (event) => { event.preventDefault(); if (!selected || submit.disabled) return; submit.disabled = true; void perform(async () => {
        await call(item, 'answerBaselineAnalysisClarification', { taskIntentId: question.taskIntentId ?? plan.ref, requestId: question.requestId, optionId: selected,
          note: question.origin === 'model' && selected !== 'free-text' ? null : text.value.trim() || null }); form.remove(); options.setStatus('回答已提交。', 'success');
      }); });
      submit.type = 'submit'; const close = el('button', 'quiet', '收起'); close.addEventListener('click', () => form.remove());
      form.append(choices, text, submit, close); node.append(form); text.focus();
    } catch (error) { if (!destroyed && generation === actionGeneration && selectedId === item.itemId) options.setStatus(rendererErrorMessage(error, '无法读取问题。'), 'error'); }
  }
  async function dialogueAction(item: TaskOverviewItemProjection, operation: 'stopDialogueAnswer' | 'continueDialogueAnswer' | 'regenerateDialogueAnswer', cancel = false): Promise<void> {
    if (item.target.kind !== 'dialogue') return;
    const dialogue = await call(item, 'inspectDialogue', { dialogueId: item.target.dialogueId, afterFragment: 0 }) as Awaited<ReturnType<RendererApi['inspectDialogue']>>;
    const latest = dialogue.attempts.at(-1);
    if (latest) await call(item, operation, { dialogueId: item.target.dialogueId, attemptId: latest.attemptId, ...(cancel ? { cancel: true } : {}) });
  }
  /** The one-press cancellations; `true` when nothing had been sent. */
  async function cancel(item: TaskOverviewItemProjection): Promise<boolean> {
    if (item.target.kind === 'dialogue') { await dialogueAction(item, 'stopDialogueAnswer', true); return false; }
    if (!item.plan?.ref) return false;
    await call(item, item.plan.kind === 'baseline-analysis' ? 'cancelWaitingBaselineAnalysis' : 'cancelWaitingTask',
      item.plan.kind === 'baseline-analysis' ? { taskIntentId: item.plan.ref } : item.plan);
    return true;
  }
  function paint(): void {
    if (!projection) return; start.disabled = false; const signature = JSON.stringify([projection, selectedBook, selectedType, selectedTime]); if (signature === painted) return; painted = signature;
    const restoreInteraction = retainPollInteraction(options.root);
    const answers = [...host.querySelectorAll<HTMLElement>('[data-card-answer]')].map((form) => ({ form, itemId: form.closest<HTMLElement>('[data-task-item]')?.dataset['taskItem'] }));
    const count = (key: string): number => projection!.groups.find((group) => group.key === key)!.items.filter((item) => !options.bookId || item.bookId === options.bookId).length;
    context.textContent = `${options.bookId ? '本书' : '全部图书'} · 同时运行 ${count('running')} 项 · 排队 ${count('queued')} 项 · 上限 ${projection.capacity}`;
    all.textContent = projection.queueFrozen ? '继续全部' : '暂停全部'; all.disabled = projection.groups.some((group) => group.items.some((item) => item.attention.state === 'analysis-pausing')); all.hidden = !projection.queueFrozen && projection.runningCount === 0;
    note.hidden = !!options.bookId || nothingToShow();
    paintFilters(); const midnight = new Date(); midnight.setHours(0, 0, 0, 0); const since = selectedTime === 'all' ? 0 : selectedTime === 'week' ? Date.now() - 7 * 86400000 : midnight.getTime();
    // The renderer places each card by its record's state (Issue #1680); the service's own groups are only read as one list.
    const listed = projection.groups.flatMap((group) => group.items).filter((item) => (selectedBook === 'all' || item.bookId === selectedBook) && (selectedType === 'all' || item.taskKind === selectedType));
    const placed = listed.map((item) => ({ item, view: taskCardView(item) })).filter(({ item, view }) => view.pageGroup !== 'recent' || Date.parse(item.at) >= since);
    const groups = options.bookId
      ? TASK_PANEL_GROUPS.map((key) => ({ key, heading: TASK_PANEL_GROUP_LABELS[key], items: placed.filter(({ view }) => view.panelGroup === key).map(({ item }) => item) }))
      : TASK_PAGE_GROUPS.map((key) => ({ key, heading: TASK_PAGE_GROUP_LABELS[key], items: placed.filter(({ view }) => view.pageGroup === key).map(({ item }) => item) }));
    const painting = options.bookId ? groups : groups.filter((group) => group.items.length > 0);
    if (!options.bookId && painting.length === 0) host.replaceChildren(el('p', 'task-overview-none', nothingToShow() ? '现在没有任务，可以用上面的「发起任务」开始一项。' : '没有符合所选筛选的任务。'));
    else host.replaceChildren(...painting.map(group => {
      const section = el('section', 'task-overview-group');
      section.dataset['taskGroup'] = group.key;
      const heading = el('h3', 'task-overview-group-heading', group.heading);
      heading.append(' · ', el('span', 'task-overview-count', String(group.items.length)));
      section.append(heading);
      if (group.items.length) {
        const list = el('div', 'task-overview-items');
        list.append(...group.items.map(renderCard));
        section.append(list);
      } else section.append(el('p', 'task-overview-empty', '这里暂时没有任务。'));
      return section;
    }));
    for (const { form, itemId } of answers) { const card = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === itemId); card?.append(form); }
    restoreInteraction();
    if (pendingFocus) { const target = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === pendingFocus); if (target) { target.focus(); pendingFocus = null; } }
  }
  function renderCard(item: TaskOverviewItemProjection): HTMLElement {
    const source = item.plan;
    if (!item.bookId || !source?.ref || source.kind === 'fixed-task' || !taskCardView(item, true).actions.some(entry => entry.action === 'redo')) {
      return taskOverviewCard(item, act, options.bookId !== undefined);
    }
    const id = JSON.stringify([item.bookId, source.kind, source.ref]);
    let available = recipes.get(id);
    if (!available) {
      available = call(item, 'inspectTaskPlan', source).then(value => {
        const plan = value as TaskPlanProjection | undefined;
        return plan != null && plan.bookId === item.bookId && plan.kind === source.kind && plan.ref === source.ref && plan.relaunch != null;
      }, () => {
        if (recipes.get(id) === available) { recipes.delete(id); painted = ''; }
        return false;
      });
      recipes.set(id, available);
    }
    const node: HTMLElement = taskOverviewCard(item, act, options.bookId !== undefined, available.then(offered => offered && !destroyed && host.contains(node)));
    return node;
  }
  async function refresh(): Promise<void> {
    if (destroyed || inFlight) return;
    inFlight = true;
    try {
      const next = await options.api.inspectTaskOverview();
      if (destroyed) return;
      // A newer source of the same kind can supersede a completed plan without changing the older row.
      const sources = JSON.stringify(next.groups.flatMap(group => group.items).filter(item => item.plan)
        .map(item => [item.bookId, item.plan, item.at, item.attention.state, item.runRecordId, item.attention.facts.stopReason]));
      if (sources !== recipeSources) { recipes.clear(); recipeSources = sources; }
      projection = next;
      options.onProjection?.(next);
      if (!pollControlEngaged(options.root, false)) paint();
    } catch (error) {
      if (!destroyed) options.setStatus(rendererErrorMessage(error, '任务总览暂时无法读取。'), 'error');
    } finally { inFlight = false; }
  }
  function keydown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const cards = [...host.querySelectorAll<HTMLElement>('[data-task-item]')]; const index = cards.findIndex((node) => node === document.activeElement || node.contains(document.activeElement));
    if (['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key)) { event.preventDefault(); const next = Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowUp' || event.key === 'k' ? -1 : 1))); cards[next]?.focus(); selectedId = cards[next]?.dataset['taskItem'] ?? null; return; }
    if (event.key === 'Escape') { if (sheet.open) sheet.close(); else options.closeDrawer?.(); return; }
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLElement && event.target.closest('details')) return;
    const item = projection?.groups.flatMap((group) => group.items).find((row) => row.itemId === (cards[index]?.dataset['taskItem'] ?? selectedId)); if (!item) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Delete') { event.preventDefault(); const offered = new Set(taskCardView(item).actions.map((entry) => entry.action)); if (event.key === 'Enter') act(item, 'open'); else if (event.key === 'Delete' && offered.has('cancel')) act(item, 'cancel'); else if (event.key === ' ' && (offered.has('pause') || offered.has('resume'))) act(item, offered.has('pause') ? 'pause' : 'resume'); }
  }
  const visible = (): void => { if (document.visibilityState === 'visible') refresh(); };
  // Only the text ticks; open menus, keyboard focus and the service's polling cadence stay intact.
  const workClock = window.setInterval(() => {
    if (projection === null) return;
    const items = new Map(projection.groups.flatMap(group => group.items).map(item => [item.itemId, item]));
    for (const card of host.querySelectorAll<HTMLElement>('[data-task-item]')) {
      const work = items.get(card.dataset['taskItem']!)?.work;
      const line = card.querySelector<HTMLElement>('.task-overview-usage');
      if (line && work?.workingSince != null) line.textContent = taskWorkLine(work, Date.now());
    }
  }, 1000);
  document.addEventListener('visibilitychange', visible);
  options.root.addEventListener('keydown', keydown); const timer = window.setInterval(refresh, 2000); refresh();
  return { refresh, showStart() { void openSheet(); }, focus(itemId) { selectedId = itemId; pendingFocus = itemId; const node = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((row) => row.dataset['taskItem'] === itemId); node?.focus(); node?.scrollIntoView({ block: 'nearest' }); }, destroy() { destroyed = true; window.clearInterval(timer); window.clearInterval(workClock); document.removeEventListener('visibilitychange', visible); options.root.removeEventListener('keydown', keydown); if (sheet.open) sheet.close(); options.root.replaceChildren(); } };
}
