import { COMMAND_NAMES } from './commands-labels.js';
import { shortcutLabel } from './commands.js';
import { commandUsable, shownEntry, type UsableScreen } from './command-usable.js';
import { createSheet, sheetContent } from './components/sheet.js';
import { SHELL_AGENT_WORKSPACE_ROW, shellDestinationLabel } from './shell-labels.js';
import type { RendererApi, TaskOverviewItemProjection } from '../shared/protocol.js';

/** `starts` marks an entry that begins a task: only choosing its row runs it, never Enter in the search box. */
interface Entry { label: string; run(): void | Promise<void>; starts?: boolean; }

const PALETTE_WORDS = {
  commands: { title: '命令面板', placeholder: '搜索命令、图书或工序', name: '搜索命令', none: '没有匹配的命令' },
  books: { title: '切换图书', placeholder: '搜索图书', name: '搜索图书', none: '没有匹配的图书' },
} as const;

export function createCommandPalette(options: {
  api: Pick<RendererApi, 'listBooks' | 'inspectTaskOverview' | 'startQuickTasks'>;
  execute(id: string): void;
  /** What the screen is showing: a command that does nothing there is not listed, and the current Book's entries come first. */
  screen: UsableScreen;
  openBook(bookId: string): Promise<void>;
  openResult(item: TaskOverviewItemProjection): void;
  openStart(): void;
  openHelp(): void;
  beforeStart(): Promise<boolean>;
  status(message: string, tone?: 'busy' | 'success' | 'error'): void;
}) {
  const sheet = createSheet('command-palette'); document.body.append(sheet);
  const input = document.createElement('input'); input.type = 'search';
  const list = document.createElement('div'); list.className = 'command-palette-results';
  const title = document.createElement('h2');
  title.id = 'command-palette-title'; sheet.setAttribute('aria-labelledby', title.id);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn quiet'; close.textContent = '关闭'; close.addEventListener('click', () => sheet.close());
  sheetContent(sheet, title, [input, list], close);
  const rowEntry = new WeakMap<HTMLButtonElement, Entry>();
  let entries: Entry[] = [], opener: HTMLElement | null = null, generation = 0, words: (typeof PALETTE_WORDS)[keyof typeof PALETTE_WORDS] = PALETTE_WORDS.commands, loaded = false;
  const choose = (entry: Entry): void => {
    sheet.close(); opener?.focus({ preventScroll: true });
    void Promise.resolve(entry.run()).catch(() => options.status('命令未能完成，请重试。', 'error'));
  };
  const paint = (): void => {
    const query = input.value.trim().toLocaleLowerCase(); list.replaceChildren();
    const shown = entries.filter((entry) => entry.label.toLocaleLowerCase().includes(query));
    for (const entry of shown) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn quiet command-palette-entry'; button.textContent = entry.label;
      rowEntry.set(button, entry); button.addEventListener('click', () => choose(entry)); list.append(button);
    }
    // An empty answer is said once the entries have been read, not while the Books are still loading.
    if (shown.length === 0 && (loaded || query !== '')) { const none = document.createElement('p'); none.className = 'command-palette-none'; none.setAttribute('role', 'status'); none.textContent = words.none; list.append(none); }
  };
  input.addEventListener('input', paint);
  sheet.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const rows = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus(); }
    else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      const first = rows[0]; if (first === undefined) return;
      // Enter in the box runs the first command; a row that starts a task is only walked to, so a second Enter is the choice.
      if (rowEntry.get(first)?.starts) first.focus(); else first.click();
    }
  });
  sheet.addEventListener('close', () => { generation++; opener?.focus({ preventScroll: true }); });
  return { open: async (booksOnly = false): Promise<void> => {
    if (sheet.open) { input.focus(); return; }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; input.value = '';
    words = booksOnly ? PALETTE_WORDS.books : PALETTE_WORDS.commands; loaded = false;
    title.textContent = words.title; input.placeholder = words.placeholder; input.setAttribute('aria-label', words.name);
    const ticket = ++generation;
    entries = booksOnly ? [] : Object.entries(COMMAND_NAMES).filter(([id]) => id !== 'command.palette' && commandUsable(id, options.screen)).map(([id, name]) => ({ label: `${name}${shortcutLabel(id) ? ` · ${shortcutLabel(id)}` : ''}`, run: () => options.execute(id) }));
    if (!booksOnly) {
      // AI 改稿 and AI 助手 are sidebar entries with no chord: listed only while their entry is on screen.
      for (const [name, selector] of [[SHELL_AGENT_WORKSPACE_ROW.label, '[data-nav-agent-workspace]'], [shellDestinationLabel('global-agent'), '[data-nav-destination="global-agent"]']] as const) {
        if (shownEntry(selector) !== null) entries.push({ label: name, run: () => shownEntry(selector)?.click() });
      }
      entries.push({ label: '发起任务 · 连续加入队列', run: options.openStart }, { label: '设置 · 帮助', run: options.openHelp });
    }
    paint(); sheet.show(); input.focus();
    try {
      const [first, tasks] = await Promise.all([options.api.listBooks({ after: null }), options.api.inspectTaskOverview()]);
      const books = [...first.items]; let after = first.nextCursor;
      while (after !== null) { const page = await options.api.listBooks({ after }); books.push(...page.items); after = page.nextCursor; }
      if (ticket !== generation || !sheet.open) return;
      const current = options.screen.currentBookId();
      books.sort((a, b) => Number(b.bookId === current) - Number(a.bookId === current));
      for (const book of books) {
        entries.push({ label: `切换图书 · ${book.title}`, run: () => options.openBook(book.bookId) });
        if (booksOnly || book.manuscriptState !== 'populated') continue;
        const procedures = new Map([['baseline-analysis', '基线分析'], ['initial-evaluation', '评估'], ...(tasks.quickStarts ?? []).filter((rule) => rule.bookId === book.bookId).map((rule) => [rule.procedureId, rule.label] as [string, string])]);
        for (const [procedureId, label] of procedures) entries.push({ label: `发起任务 · ${book.title} · ${label}`, starts: true, run: async () => {
          if (!await options.beforeStart()) return;
          await options.api.startQuickTasks({ tasks: [{ bookId: book.bookId, procedureId }] }); options.status('已加入队列。', 'success');
        } });
      }
      if (!booksOnly) for (const item of tasks.groups.find((group) => group.key === 'recent')?.items ?? []) entries.push({ label: `最近完成 · ${item.bookTitle ?? '全局'} · ${item.label}`, run: () => options.openResult(item) });
      loaded = true; paint();
    } catch { options.status('未能读取图书与最近完成的任务。', 'error'); loaded = true; paint(); }
  } };
}
