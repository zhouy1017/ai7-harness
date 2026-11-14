import { technicalWords } from './technical-layer.js';
import { retainPollInteraction, pollControlEngaged } from './poll-interaction.js';
import type { RendererApi, TaskOverviewGroupProjection, TaskOverviewItemProjection, TaskOverviewProjection, TaskOverviewCall } from '../shared/protocol.js';
import { createSheet, sheetContent } from './components/sheet.js';
import { readActionDefaults, rememberActionDefaults } from './action-defaults.js';
import { showToast } from './components/toast.js';
import { menuPanel } from './components/controls.js';
import type { TaskPlanProjection, ClarificationOptionId } from '../shared/protocol.js';
import { attentionSentence, globalAttentionReason, globalAttentionTimeLine } from './global-attention-labels.js';
const GROUP_LABELS: Record<TaskOverviewGroupProjection['key'], string> = { running: '正在运行', queued: '排队等待', waiting: '等你处理', paused: '已暂停', recent: '最近完成' };
const STATE_LABELS: Record<TaskOverviewItemProjection['state'], string> = { running: '运行中', queued: '排队中', waiting: '等你处理', paused: '已暂停', completed: '已完成', cancelled: '已取消', stopped: '已停止' };
const PROCEDURES = [['baseline-analysis', '基线分析'], ['initial-evaluation', '评估']] as const;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text;
  if (tag === 'button') { node.classList.add('btn'); (node as HTMLButtonElement).type = 'button'; } return node;
}
function progressLine(item: TaskOverviewItemProjection): string {
  const usage = item.usage === null ? '' : ` · 用时 ${Math.max(1, Math.round(item.usage.elapsed / 60000))} 分钟 · 约 ${item.usage.calls} 次调用`;
  if (item.state === 'queued') return item.attention.state === 'analysis-waiting-network' ? '等待联网' : item.attention.state === 'analysis-waiting-connection' ? '等待模型连接' : item.attention.state === 'analysis-waiting-admission' ? '等待开始前检查' : item.queuePosition === null ? '等待运行名额' : `第 ${item.queuePosition} 位 · 前面 ${item.queuePosition - 1} 项${item.eta === null ? '' : ` · 预计 ≈ ${Math.ceil(item.eta / 60000)} 分钟后开始`}`;
  if (item.state === 'waiting') return globalAttentionReason(item.attention);
  if (item.state === 'paused') return item.attention.facts.resumeFailure ?? `你 ${new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 暂停${item.progress ? technicalWords(` · 已完成 ${item.progress.done} / ${item.progress.total}`, ` · 已完成约 ${item.progress.total === 0 ? 0 : Math.floor((item.progress.done / item.progress.total) * 100)}%`) : ''} · 可续行`;
  if (item.state === 'completed') return `已有结果${usage}`;
  if (item.state === 'cancelled') return `已取消 · ${item.result ? '保留已有结果' : '没有形成结果'}${usage}`;
  if (item.state === 'stopped') return `已停止 · 可查看运行${usage}`;
  // Ordinary mode reads a share of the work, never the reading ranges counted (Issue #1431 item 106).
  return item.progress === null ? '正在处理稿件。' : `${technicalWords(`已完成 ${item.progress.done} / ${item.progress.total} 个阅读范围`, `已完成约 ${item.progress.total === 0 ? 0 : Math.floor((item.progress.done / item.progress.total) * 100)}%`)}${item.progress.elapsedMs === null ? '' : `，已用时 ${Math.floor(item.progress.elapsedMs / 60000)} 分钟`}${item.progress.modelWaiting ? '，等待模型回答' : ''}。`;
}
export type TaskCardAction = 'open' | 'plan' | 'run' | 'book' | 'pause' | 'resume' | 'cancel' | 'up' | 'top' | 'answer' | 'redo' | 'result' | 'again' | 'jump';
/** Both the global page and the in-Book pane render this exact card. */
export function taskOverviewCard(item: TaskOverviewItemProjection, act: (item: TaskOverviewItemProjection, action: TaskCardAction) => void): HTMLElement {
  const node = el('article', 'task-overview-card'); node.dataset['taskItem'] = item.itemId; node.dataset['taskItemId'] = item.itemId; node.dataset['taskState'] = item.attention.state; node.tabIndex = 0;
  const title = el('div', 'task-overview-card-title'); title.append(el('span', 'task-overview-book', item.bookTitle ?? '全局'), el('span', undefined, ' · '), el('strong', undefined, item.label), el('span', `state-term task-overview-state task-overview-state-${item.state}`, item.attention.state === 'analysis-pausing' ? '正在暂停' : STATE_LABELS[item.state]));
  node.dataset['taskKind'] = item.taskKind;
  const line = el('div', 'task-overview-card-line', attentionSentence(progressLine(item))); line.title = line.textContent ?? '';
  const time = el('time', 'task-overview-card-time', globalAttentionTimeLine(item.attention.group, item.at, item.state)); time.dateTime = item.at;
  const body = el('div', 'task-overview-card-body'); body.append(el('div', 'task-overview-card-kind', item.taskKind), title, line, time);
  if (item.attention.modelLabel) body.append(el('span', 'task-overview-model', item.attention.modelLabel));
  if (item.state === 'running' && item.progress !== null) { const bar = el('progress', 'task-overview-progress'); bar.max = Math.max(1, item.progress.total); bar.value = Math.min(item.progress.done, item.progress.total); body.append(bar); }
  const actions = el('div', 'task-overview-card-actions');
  const add = (label: string, action: TaskCardAction): void => { const button = el('button', 'quiet', label); button.dataset['taskAction'] = action; button.addEventListener('click', (event) => { event.stopPropagation(); act(item, action); }); actions.append(button); };
  if (item.state === 'running') { add('暂停', 'pause'); add('取消', 'cancel'); }
  else if (item.state === 'queued') { if (item.queuePosition !== null) { add('上移', 'up'); add('置顶', 'top'); } add('取消等待', 'cancel'); }
  else if (item.attention.state === 'draft-unfinished') add('继续编辑草稿', 'answer');
  else if (item.state === 'waiting') add(item.nextAction === 'answer-clarification' || item.taskKind === '对话' ? '回答' : '处理', 'answer');
  else if (item.state === 'paused' && item.attention.state !== 'analysis-pausing') { add('续行', 'resume'); if (item.target.kind !== 'dialogue') add('改计划重做', 'redo'); }
  else if (item.state !== 'paused') { add('查看结果', 'result'); add('再做一次', 'again'); }
  if (item.selection) add('跳到所选文字', 'jump');
  const more = el('details', 'task-overview-more'); more.append(el('summary', undefined, '更多'));
  const menu = menuPanel(); more.append(menu);
  for (const [label, action] of [['查看计划', 'plan'], ['查看运行', 'run'], ['打开所在图书', 'book']] as const) { const button = el('button', 'quiet', label); button.dataset['taskAction'] = action; button.addEventListener('click', (event) => { event.stopPropagation(); act(item, action); more.open = false; }); menu.append(button); }
  more.addEventListener('click', (event) => event.stopPropagation()); actions.append(more); node.append(body, actions);
  node.addEventListener('click', () => act(item, 'open')); return node;
}
export interface TaskOverviewOptions {
  readonly beforeStart?: () => Promise<boolean>;
  readonly onChanged?: () => void; readonly onProjection?: (projection: TaskOverviewProjection) => void;
  readonly root: HTMLElement; readonly api: Pick<RendererApi, 'inspectTaskOverview' | 'controlAllTasks' | 'startQuickTasks' | 'reorderQueuedRun' | 'taskOverviewCall' | 'pollServiceJob'>; readonly bookId?: string;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly openTarget: (item: TaskOverviewItemProjection, view?: 'plan' | 'run' | 'redo') => void;
  readonly openBook: (bookId: string) => void; readonly openResult: (item: TaskOverviewItemProjection) => void;
  readonly configure?: (bookId: string, kind: 'review' | 'writing') => void;
  readonly closeDrawer?: () => void; readonly jumpToSelection?: (item: TaskOverviewItemProjection) => void;
}
export interface TaskOverviewSurface { refresh(): void; showStart(): void; focus(itemId: string): void; destroy(): void; }
export function mountTaskOverview(options: TaskOverviewOptions): TaskOverviewSurface {
  let destroyed = false, busy = false, inFlight = false; let projection: TaskOverviewProjection | null = null; let painted = ''; let selectedId: string | null = null; let pendingFocus: string | null = null;
  const key = `ai7.task-overview.filters.${options.bookId ?? 'all'}`;
  let selectedBook = options.bookId ?? 'all', selectedType = 'all', selectedTime = 'today';
  try { const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>; selectedBook = options.bookId ?? saved['book'] ?? 'all'; selectedType = saved['type'] ?? 'all'; selectedTime = saved['time'] ?? 'today'; } catch { /* A missing view preference uses its default. */ }
  const remember = (): void => { localStorage.setItem(key, JSON.stringify({ book: selectedBook, type: selectedType, time: selectedTime })); painted = ''; paint(); };
  const headingRow = el('div', 'task-overview-heading-row'); const heading = el(options.bookId ? 'h3' : 'h1', 'task-overview-title', '任务');
  const start = el('button', 'primary', '发起任务 ▾'); start.dataset['taskOverviewStart'] = ''; start.disabled = true;
  const all = el('button', 'quiet'); all.addEventListener('click', () => void perform(async () => { await options.api.controlAllTasks({ action: projection?.queueFrozen ? 'resume' : 'pause' }); }));
  const context = el('span', 'task-overview-context'); headingRow.append(heading, context, start); if (!options.bookId) headingRow.append(all);
  const filters = el('div', 'task-overview-filters'); const host = el('div', 'task-overview-groups'); const confirm = el('div', 'task-overview-confirm'); confirm.hidden = true; confirm.setAttribute('role', 'alert');
  const note = el('p', 'field-note', '队列顺序保存在本次使用中；重新启动后按发起顺序排列。');
  if (options.bookId) { heading.hidden = true; context.hidden = true; note.hidden = true; selectedType = 'all'; selectedTime = 'all'; }
  const sheet = createSheet('task-overview-sheet'); options.root.append(headingRow, filters, host, confirm, note, sheet);
  start.addEventListener('click', () => { if (sheet.open) sheet.close(); else { paintSheet(); sheet.show(); } });
  async function paintSheet(): Promise<void> {
    const defaults = await readActionDefaults(); if (destroyed) return;
    projection ??= await options.api.inspectTaskOverview(); if (destroyed) return;
    const books = projection?.books ?? []; const list = el('div', 'task-overview-sheet-books');
    for (const book of books.filter((book) => !options.bookId || options.bookId === book.bookId)) { const label = el('label', 'task-overview-sheet-book'); const input = el('input'); input.type = 'checkbox'; input.value = book.bookId; input.checked = options.bookId === book.bookId || (defaults.taskBooks.length ? defaults.taskBooks.includes(book.bookId) : selectedBook === 'all' || selectedBook === book.bookId); label.append(input, document.createTextNode(book.title)); list.append(label); }
    const type = el('select'); type.setAttribute('aria-label', '工序');
    const procedures = new Map<string, string>(PROCEDURES);
    for (const rule of projection?.quickStarts ?? []) if (!options.bookId || rule.bookId === options.bookId) procedures.set(rule.procedureId, rule.label);
    for (const [id, label] of procedures) type.add(new Option(label, id));
    type.value = procedures.has(defaults.taskProcedure) ? defaults.taskProcedure : PROCEDURES[0][0];
    const added = el('span'); added.dataset['taskOverviewAdded'] = ''; let count = 0;
    const add = el('button', 'primary', '加入队列'); add.dataset['taskOverviewEnqueue'] = '';
    add.addEventListener('click', () => { const tasks = [...list.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => ({ bookId: input.value, procedureId: type.value })); if (!tasks.length) { options.setStatus('请先选择图书。', 'error'); return; }
      add.disabled = true; void rememberActionDefaults({ taskBooks: tasks.map((task) => task.bookId), taskProcedure: type.value }).catch(() => options.setStatus('未能记住任务设置。', 'error'));
      const enqueue = async () => { if (options.beforeStart && !await options.beforeStart()) return null; return options.api.startQuickTasks({ tasks }); };
      void enqueue().then((result) => { if (result === null) return; count += result.results.length; added.textContent = `已加入 ${count} 项`; options.onChanged?.(); refresh(); }, (error: unknown) => { added.textContent = '未能全部加入，请查看任务列表后继续。'; options.setStatus(error instanceof Error ? error.message : '任务未能加入。', 'error'); refresh(); }).finally(() => { add.disabled = false; }); });
    const close = el('button', 'quiet', '关闭'); close.addEventListener('click', () => sheet.close());
    const foot = el('div'); foot.append(added, add, close);
    const config = el('div', 'button-row'); for (const [label, kind] of [['自定义审阅…', 'review'], ['写作任务说明…', 'writing']] as const) { const link = el('button', 'quiet', label); link.addEventListener('click', () => { const book = list.querySelector<HTMLInputElement>('input:checked')?.value; if (book) { sheet.close(); options.configure?.(book, kind); } }); config.append(link); }
    const popup = el('label'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.dataset['taskOverviewAutoResult'] = ''; checkbox.checked = localStorage.getItem('ai7.task-overview.auto-result') !== 'off'; checkbox.addEventListener('change', () => localStorage.setItem('ai7.task-overview.auto-result', checkbox.checked ? 'on' : 'off')); popup.append(checkbox, document.createTextNode('正在看本书时自动显示结果'));
    sheetContent(sheet, el('h2', undefined, '发起任务'), [list, type, config, popup], foot);
  }
  function filter(label: string, active: boolean, action: () => void): HTMLButtonElement { const node = el('button', 'quiet task-overview-filter', label); node.setAttribute('aria-pressed', String(active)); node.addEventListener('click', action); return node; }
  function paintFilters(): void {
    if (options.bookId) { filters.replaceChildren(); return; }
    const rows: HTMLElement[] = [];
    if (!options.bookId) { const row = el('div', 'task-overview-filter-row'); row.append(el('span', undefined, '图书'), filter('全部', selectedBook === 'all', () => { selectedBook = 'all'; remember(); })); for (const book of projection?.books ?? []) row.append(filter(book.title, selectedBook === book.bookId, () => { selectedBook = book.bookId; remember(); })); rows.push(row); }
    const types = el('div', 'task-overview-filter-row'); types.append(el('span', undefined, '类型')); for (const type of ['all', '分析', '审阅', '评估', '写作', '对话', '工序']) types.append(filter(type === 'all' ? '全部' : type, selectedType === type, () => { selectedType = type; remember(); }));
    const time = el('div', 'task-overview-filter-row'); time.append(el('span', undefined, '最近完成')); for (const [value, label] of [['today', '今天'], ['week', '7 天'], ['all', '全部']]) time.append(filter(label!, selectedTime === value, () => { selectedTime = value!; remember(); })); rows.push(types, time); filters.replaceChildren(...rows);
  }
  async function perform(action: () => Promise<void>): Promise<void> { if (busy) return; busy = true; try { await action(); } catch (error) { options.setStatus(error instanceof Error ? error.message : '任务操作未能完成。', 'error'); } finally { busy = false; options.onChanged?.(); refresh(); } }
  async function call(item: TaskOverviewItemProjection, operation: TaskOverviewCall['operation'], input: object): Promise<unknown> { if (!item.bookId) return; return options.api.taskOverviewCall({ operation, bookId: item.bookId, input } as TaskOverviewCall); }
  function act(item: TaskOverviewItemProjection, action: TaskCardAction): void {
    selectedId = item.itemId;
    if (action === 'answer' && item.nextAction === 'answer-clarification' && item.plan) { void answerOnCard(item); return; }
    if (['open', 'answer', 'plan', 'run'].includes(action)) { options.openTarget(item, action === 'plan' ? 'plan' : 'run'); return; }
    if (action === 'jump') { options.jumpToSelection?.(item); return; }
    if (action === 'book') { if (item.bookId) options.openBook(item.bookId); return; }
    if (action === 'result') { options.openResult(item); return; }
    if (action === 'cancel') {
      confirm.replaceChildren(el('span', undefined, '取消这项任务？已经完成的结果会保留。'));
      const yes = el('button', 'danger', '确认取消'); yes.addEventListener('click', () => { confirm.hidden = true; void perform(() => cancel(item)); });
      const no = el('button', 'quiet', '继续保留'); no.addEventListener('click', () => { confirm.hidden = true; }); confirm.append(yes, no); confirm.hidden = false; yes.focus(); return;
    }
    void perform(async () => {
      if (action === 'again' && options.beforeStart && !await options.beforeStart()) return;
      if ((action === 'up' || action === 'top') && item.runRecordId) await options.api.reorderQueuedRun({ runRecordId: item.runRecordId, position: action === 'top' ? 1 : Math.max(1, (item.queuePosition ?? 1) - 1) });
      else if (action === 'again' && item.target.kind === 'dialogue') await dialogueAction(item, 'regenerateDialogueAnswer');
      else if (action === 'again' && item.bookId && item.plan?.ref && item.plan.kind !== 'fixed-task') await options.api.startQuickTasks({ tasks: [{ bookId: item.bookId, procedureId: 'repeat', repeat: { kind: item.plan.kind, ref: item.plan.ref } }] });
      else if (action === 'redo') options.openTarget(item, 'redo');
      else if (item.target.kind === 'dialogue') { await dialogueAction(item, action === 'pause' ? 'stopDialogueAnswer' : 'continueDialogueAnswer'); }
      else if (item.plan?.ref) await call(item, item.plan.kind === 'baseline-analysis' ? action === 'pause' ? 'pauseBaselineAnalysisRun' : 'resumeBaselineAnalysisRun' : 'controlTaskRun', item.plan.kind === 'baseline-analysis' ? { taskIntentId: item.plan.ref } : { ...item.plan, action });
      if ((action === 'up' || action === 'top') && item.runRecordId && item.queuePosition !== null) showToast('队列顺序已更新。', { action: { label: '撤销', run: () => void perform(async () => { await options.api.reorderQueuedRun({ runRecordId: item.runRecordId!, position: item.queuePosition! }); }) } });
      else if (action === 'pause' || action === 'resume') showToast(action === 'pause' ? '任务已暂停。' : '任务已续行。', { action: { label: '撤销', run: () => act(item, action === 'pause' ? 'resume' : 'pause') } });
    });
  }
  async function answerOnCard(item: TaskOverviewItemProjection): Promise<void> {
    const node = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === item.itemId);
    if (!node || node.querySelector('[data-card-answer]') || !item.plan) return;
    try {
      const plan = await call(item, 'inspectTaskPlan', item.plan) as TaskPlanProjection;
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
    } catch (error) { options.setStatus(error instanceof Error ? error.message : '无法读取问题。', 'error'); }
  }
  async function dialogueAction(item: TaskOverviewItemProjection, operation: 'stopDialogueAnswer' | 'continueDialogueAnswer' | 'regenerateDialogueAnswer', cancel = false): Promise<void> {
    if (item.target.kind !== 'dialogue') return;
    const dialogue = await call(item, 'inspectDialogue', { dialogueId: item.target.dialogueId, afterFragment: 0 }) as Awaited<ReturnType<RendererApi['inspectDialogue']>>;
    const latest = dialogue.attempts.at(-1);
    if (latest) await call(item, operation, { dialogueId: item.target.dialogueId, attemptId: latest.attemptId, ...(cancel ? { cancel: true } : {}) });
  }
  async function cancel(item: TaskOverviewItemProjection): Promise<void> {
    if (item.target.kind === 'dialogue') { await dialogueAction(item, 'stopDialogueAnswer', true); return; }
    if (!item.plan?.ref) return;
    if (item.state === 'queued' && !['analysis-paused', 'analysis-resumable', 'analysis-yielded', 'analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-admission'].includes(item.attention.state)) await call(item, item.plan.kind === 'baseline-analysis' ? 'cancelWaitingBaselineAnalysis' : 'cancelWaitingTask', item.plan.kind === 'baseline-analysis' ? { taskIntentId: item.plan.ref } : item.plan);
    else await call(item, item.plan.kind === 'baseline-analysis' ? 'cancelBaselineAnalysisRun' : 'controlTaskRun', item.plan.kind === 'baseline-analysis' ? { taskIntentId: item.plan.ref } : { ...item.plan, action: 'cancel' });
  }
  function paint(): void {
    if (!projection) return; start.disabled = false; const signature = JSON.stringify([projection, selectedBook, selectedType, selectedTime]); if (signature === painted) return; painted = signature;
    const restoreInteraction = retainPollInteraction(options.root);
    const answers = [...host.querySelectorAll<HTMLElement>('[data-card-answer]')].map((form) => ({ form, itemId: form.closest<HTMLElement>('[data-task-item]')?.dataset['taskItem'] }));
    const count = (key: string): number => projection!.groups.find((group) => group.key === key)!.items.filter((item) => !options.bookId || item.bookId === options.bookId).length;
    context.textContent = `${options.bookId ? '本书' : '全部图书'} · 同时运行 ${count('running')} 项 · 排队 ${count('queued')} 项 · 上限 ${projection.capacity}`;
    all.textContent = projection.queueFrozen ? '继续全部' : '暂停全部'; all.disabled = projection.groups.some((group) => group.items.some((item) => item.attention.state === 'analysis-pausing')); all.hidden = !projection.queueFrozen && projection.runningCount === 0;
    paintFilters(); const midnight = new Date(); midnight.setHours(0, 0, 0, 0); const since = selectedTime === 'all' ? 0 : selectedTime === 'week' ? Date.now() - 7 * 86400000 : midnight.getTime();
    const visible = projection.groups.map((group) => ({ ...group, items: group.items.filter((item) => (selectedBook === 'all' || item.bookId === selectedBook) && (selectedType === 'all' || item.taskKind === selectedType) && (group.key !== 'recent' || Date.parse(item.at) >= since)) }));
    const groups = options.bookId ? [{ key: 'waiting' as const, items: visible[2]!.items }, { key: 'running' as const, items: [...visible[0]!.items, ...visible[1]!.items, ...visible[3]!.items] }, { key: 'recent' as const, items: visible[4]!.items }] : visible;
    host.replaceChildren(...groups.map((group) => { const section = el('section', 'task-overview-group'); section.dataset['taskGroup'] = group.key; section.append(el('h3', 'task-overview-group-heading', `${options.bookId && group.key === 'running' ? '进行中' : GROUP_LABELS[group.key]}`)); const count = el('span', 'task-overview-count', String(group.items.length)); section.firstElementChild?.append(' · ', count); const list = el('div', 'task-overview-items'); list.append(...group.items.map((item) => taskOverviewCard(item, act))); section.append(group.items.length ? list : el('p', 'task-overview-empty', '这里暂时没有任务。')); return section; }));
    for (const { form, itemId } of answers) { const card = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === itemId); card?.append(form); }
    restoreInteraction();
    if (pendingFocus) { const target = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((node) => node.dataset['taskItem'] === pendingFocus); if (target) { target.focus(); pendingFocus = null; } }
  }
  function refresh(): void { if (destroyed || inFlight) return; inFlight = true; void options.api.inspectTaskOverview().then((next) => { if (!destroyed) { projection = next; options.onProjection?.(next); if (!pollControlEngaged(options.root, false)) paint(); } }, (error: unknown) => options.setStatus(error instanceof Error ? error.message : '任务总览暂时无法读取。', 'error')).finally(() => { inFlight = false; }); }
  function keydown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const cards = [...host.querySelectorAll<HTMLElement>('[data-task-item]')]; const index = cards.findIndex((node) => node === document.activeElement || node.contains(document.activeElement));
    if (['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key)) { event.preventDefault(); const next = Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowUp' || event.key === 'k' ? -1 : 1))); cards[next]?.focus(); selectedId = cards[next]?.dataset['taskItem'] ?? null; return; }
    if (event.key === 'Escape') { if (sheet.open) sheet.close(); else if (!confirm.hidden) confirm.hidden = true; else options.closeDrawer?.(); return; }
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLElement && event.target.closest('details')) return;
    const item = projection?.groups.flatMap((group) => group.items).find((row) => row.itemId === (cards[index]?.dataset['taskItem'] ?? selectedId)); if (!item) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Delete') { event.preventDefault(); if (event.key === 'Enter') act(item, 'open'); else if (event.key === 'Delete' && ['running', 'queued', 'paused'].includes(item.state)) act(item, 'cancel'); else if (event.key === ' ' && ['running', 'paused'].includes(item.state)) act(item, item.state === 'running' ? 'pause' : 'resume'); }
  }
  const visible = (): void => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', visible);
  options.root.addEventListener('keydown', keydown); const timer = window.setInterval(refresh, 2000); refresh();
  return { refresh, showStart() { void paintSheet().then(() => { if (!destroyed) sheet.show(); }); }, focus(itemId) { selectedId = itemId; pendingFocus = itemId; const node = [...host.querySelectorAll<HTMLElement>('[data-task-item]')].find((row) => row.dataset['taskItem'] === itemId); node?.focus(); node?.scrollIntoView({ block: 'nearest' }); }, destroy() { destroyed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); options.root.removeEventListener('keydown', keydown); if (sheet.open) sheet.close(); options.root.replaceChildren(); } };
}
