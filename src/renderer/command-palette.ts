import { COMMAND_NAMES } from './commands-labels.js';
import { shortcutLabel } from './commands.js';
import { createSheet, sheetContent } from './components/sheet.js';
import type { RendererApi, TaskOverviewItemProjection } from '../shared/protocol.js';

interface Entry { label: string; run(): void | Promise<void>; }
export function createCommandPalette(options: {
  api: Pick<RendererApi, 'listBooks' | 'inspectTaskOverview' | 'startQuickTasks'>;
  execute(id: string): void;
  openBook(bookId: string): Promise<void>;
  openResult(item: TaskOverviewItemProjection): void;
  openStart(): void;
  status(message: string, tone?: 'busy' | 'success' | 'error'): void;
}) {
  const sheet = createSheet('command-palette'); document.body.append(sheet);
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜索命令、图书或工序'; input.setAttribute('aria-label', '搜索命令');
  const list = document.createElement('div'); list.className = 'command-palette-results';
  const title = document.createElement('h2'); title.textContent = '命令面板';
  title.id = 'command-palette-title'; sheet.setAttribute('aria-labelledby', title.id);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn quiet'; close.textContent = '关闭'; close.addEventListener('click', () => sheet.close());
  sheetContent(sheet, title, [input, list], close);
  let entries: Entry[] = [], opener: HTMLElement | null = null, generation = 0;
  const choose = (entry: Entry): void => {
    sheet.close(); opener?.focus({ preventScroll: true });
    void Promise.resolve(entry.run()).catch(() => options.status('命令未能完成，请重试。', 'error'));
  };
  const paint = (): void => {
    const query = input.value.trim().toLocaleLowerCase(); list.replaceChildren();
    for (const entry of entries.filter((entry) => entry.label.toLocaleLowerCase().includes(query))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn quiet command-palette-entry'; button.textContent = entry.label;
      button.addEventListener('click', () => choose(entry)); list.append(button);
    }
  };
  input.addEventListener('input', paint);
  sheet.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const rows = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus(); }
    else if (event.key === 'Enter' && event.target === input) { event.preventDefault(); rows[0]?.click(); }
  });
  sheet.addEventListener('close', () => { generation++; opener?.focus({ preventScroll: true }); });
  return { open: async (booksOnly = false): Promise<void> => {
    if (sheet.open) { input.focus(); return; }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; input.value = '';
    const ticket = ++generation;
    entries = booksOnly ? [] : Object.entries(COMMAND_NAMES).map(([id, name]) => ({ label: `${name}${shortcutLabel(id) ? ` · ${shortcutLabel(id)}` : ''}`, run: () => options.execute(id) }));
    if (!booksOnly) entries.push({ label: '发起任务 · 连续加入队列', run: options.openStart });
    paint(); sheet.show(); input.focus();
    try {
      const [first, tasks] = await Promise.all([options.api.listBooks({ after: null }), options.api.inspectTaskOverview()]);
      const books = [...first.items]; let after = first.nextCursor;
      while (after !== null) { const page = await options.api.listBooks({ after }); books.push(...page.items); after = page.nextCursor; }
      if (ticket !== generation || !sheet.open) return;
      for (const book of books) {
        entries.push({ label: `切换图书 · ${book.title}`, run: () => options.openBook(book.bookId) });
        if (booksOnly || book.manuscriptState !== 'populated') continue;
        const procedures = new Map([['baseline-analysis', '基线分析'], ['initial-evaluation', '评估'], ...(tasks.quickStarts ?? []).filter((rule) => rule.bookId === book.bookId).map((rule) => [rule.procedureId, rule.label] as [string, string])]);
        for (const [procedureId, label] of procedures) entries.push({ label: `发起任务 · ${book.title} · ${label}`, run: async () => {
          await options.api.startQuickTasks({ tasks: [{ bookId: book.bookId, procedureId }] }); options.status('已加入队列。', 'success');
        } });
      }
      if (!booksOnly) for (const item of tasks.groups.find((group) => group.key === 'recent')?.items ?? []) entries.push({ label: `最近完成 · ${item.bookTitle ?? '全局'} · ${item.label}`, run: () => options.openResult(item) });
      paint();
    } catch { options.status('未能读取图书与最近完成的任务。', 'error'); }
  } };
}
