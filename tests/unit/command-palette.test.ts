import { expect, it, vi } from 'vitest';
import { createCommandPalette } from '../../src/renderer/command-palette.js';
import { commandUsable, goBack } from '../../src/renderer/command-usable.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { ScreenReturnHistory } from '../../src/renderer/screen-return.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

type Options = Parameters<typeof createCommandPalette>[0];

const books = [
  { bookId: 'book-one', title: 'sample1', manuscriptState: 'populated' },
  { bookId: 'book-two', title: 'sample2', manuscriptState: 'populated' },
];
const apiOf = (start = vi.fn(async () => ({ results: [] }))): Options['api'] => ({
  listBooks: async () => ({ items: books, nextCursor: null }),
  inspectTaskOverview: async () => ({ groups: [], quickStarts: [] }), startQuickTasks: start,
}) as unknown as Options['api'];
const everything = { has: () => true, currentBookId: () => null, bookPage: () => true };
const make = (over: Partial<Options> = {}) => createCommandPalette({ api: apiOf(), screen: everything, beforeStart: async () => true,
  execute: vi.fn(), openBook: vi.fn(), openResult: vi.fn(), openStart: vi.fn(), openHelp: vi.fn(), status: vi.fn(), ...over });
const rows = (): MiniElement[] => miniDocument.body.querySelectorAll('button.command-palette-entry');
const labels = (): string[] => rows().map((node) => node.textContent ?? '');
const search = (): MiniElement => miniDocument.body.querySelector('input')!;
const type = (text: string): void => { const box = search(); box.value = text; box.dispatchEvent({ type: 'input' }); };
const enter = (): void => { search().dispatchEvent({ type: 'keydown', key: 'Enter', bubbles: true, cancelable: true, preventDefault() {} } as never); };
const sidebar = (...destinations: string[]): void => { for (const destination of destinations) { const link = document.createElement('a'); link.dataset['navDestination'] = destination; miniDocument.body.append(link as never); } };
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

it('settles visible editing before a palette task starts, and respects a refused settlement', async () => {
  const restore = installMiniDom();
  const start = vi.fn(async () => ({ results: [] }));
  let release!: (allowed: boolean) => void;
  const settle = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
  try {
    const help = vi.fn();
    const palette = make({ api: apiOf(start), beforeStart: settle, openHelp: help });
    const choose = (): void => { miniDocument.body.querySelectorAll('button').find((node) => node.textContent === '发起任务 · sample1 · 基线分析')!.click(); };
    await palette.open(); choose();
    expect(settle).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled();
    release(false); await settled();
    expect(start).not.toHaveBeenCalled();
    await palette.open(); choose(); release(true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith({ tasks: [{ bookId: 'book-one', procedureId: 'baseline-analysis' }] }));
    await palette.open();
    miniDocument.body.querySelectorAll('button').find((node) => node.textContent === '设置 · 帮助')!.click();
    expect(help).toHaveBeenCalledOnce();
  } finally { restore(); }
});

it('never starts a task from Enter in the box: the row is walked to, and only choosing it starts', async () => {
  const restore = installMiniDom();
  const start = vi.fn(async () => ({ results: [] }));
  try {
    const palette = make({ api: apiOf(start) });
    await palette.open(); await settled();
    type('发起任务 · sample1'); enter(); await settled();
    expect(start).not.toHaveBeenCalled();
    expect(miniDocument.activeElement?.textContent).toBe('发起任务 · sample1 · 基线分析');
    miniDocument.activeElement!.click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  } finally { restore(); }
});

it('still runs the first command on Enter, and says so when nothing matches', async () => {
  const restore = installMiniDom();
  try {
    const execute = vi.fn();
    sidebar('library');
    const palette = make({ execute, screen: { ...everything, has: (id) => id === 'nav.library' || id === 'book.switch' } });
    await palette.open(); await settled();
    type('书库'); enter();
    expect(execute).toHaveBeenCalledWith('nav.library');
    await palette.open(); await settled();
    type('没有这个命令');
    expect(rows()).toHaveLength(0);
    expect(miniDocument.body.querySelector('.command-palette-none')?.textContent).toBe('没有匹配的命令');
  } finally { restore(); }
});

it('lists only commands that do something on this screen, with the current Book first', async () => {
  const restore = installMiniDom();
  try {
    sidebar('library', 'series');
    const palette = make({ screen: { ...everything, has: (id) => id === 'nav.library' || id === 'nav.series', currentBookId: () => 'book-two' } });
    await palette.open(); await settled();
    const shown = labels();
    expect(shown.some((label) => label.startsWith('书库'))).toBe(true);
    expect(shown.some((label) => label.startsWith('新建审阅') || label.startsWith('查找') || label.startsWith('保存'))).toBe(false);
    expect(shown.some((label) => label.startsWith('命令面板'))).toBe(false);
    const order = shown.filter((label) => label.includes('sample'));
    expect(order.slice(0, 3)).toEqual(['切换图书 · sample2', '发起任务 · sample2 · 基线分析', '发起任务 · sample2 · 评估']);
  } finally { restore(); }
});

it('has its own title and words while it switches Books', async () => {
  const restore = installMiniDom();
  try {
    const palette = make();
    await palette.open(true); await settled();
    expect(miniDocument.body.querySelector('h2')?.textContent).toBe('切换图书');
    expect(search().placeholder).toBe('搜索图书');
    expect(labels()).toEqual(['切换图书 · sample1', '切换图书 · sample2']);
    miniDocument.body.querySelector('.command-palette')?.close();
    await palette.open(); await settled();
    expect(miniDocument.body.querySelector('h2')?.textContent).toBe('命令面板');
    expect(search().placeholder).toBe('搜索命令、图书或工序');
  } finally { restore(); }
});

it('knows a command is usable only with a handler and, for a Book command, a Book on screen', () => {
  const screen = { has: (id: string) => id !== 'search.find', currentBookId: () => null, bookPage: () => false };
  expect(commandUsable('search.find', screen)).toBe(false);
  expect(commandUsable('review.new', screen)).toBe(false);
  expect(commandUsable('review.new', { ...screen, currentBookId: () => 'book-one' })).toBe(true);
  expect(commandUsable('view.openTasks', screen)).toBe(false);
  expect(commandUsable('view.openTasks', { ...screen, bookPage: () => true })).toBe(true);
  expect(commandUsable('view.toggleSidebar', screen)).toBe(true);
});

it('goes back from a settings page to where the editor came from, and from any other page without a 返回 to 书库', async () => {
  const restore = installMiniDom();
  try {
    const history = new ScreenReturnHistory(); const book = vi.fn(); const library = vi.fn();
    history.enter('book-review', library); history.enter('model-service', book);
    const press = vi.fn();
    const settings = document.createElement('div'); const layout = document.createElement('div'); layout.className = 'settings-layout'; settings.append(layout as never);
    goBack({ screen: settings, press, returnToOrigin: () => void history.back('model-service', library) });
    expect(book).toHaveBeenCalledOnce(); expect(press).not.toHaveBeenCalled();
    goBack({ screen: document.createElement('div'), press, returnToOrigin: vi.fn() });
    expect(press).toHaveBeenCalledWith('[data-nav-destination="library"]');
  } finally { restore(); }
});

it('keeps the navigation commands while the sidebar is hidden, and the Book sections only with a Book', () => {
  const restore = installMiniDom();
  try {
    const link = document.createElement('a'); link.dataset['navDestination'] = 'library'; link.hidden = true; miniDocument.body.append(link as never);
    const section = document.createElement('a'); section.dataset['navBookSection'] = 'review'; miniDocument.body.append(section as never);
    const screen = { has: () => true, currentBookId: () => null as string | null, bookPage: () => false };
    expect(commandUsable('nav.library', screen)).toBe(true);
    expect(commandUsable('nav.book.review', screen)).toBe(false);
    expect(commandUsable('nav.book.review', { ...screen, currentBookId: () => 'book-one' })).toBe(true);
  } finally { restore(); }
});

it('ignores a held Enter on a row that starts a task', async () => {
  const restore = installMiniDom();
  const start = vi.fn(async () => ({ results: [] }));
  try {
    const palette = make({ api: apiOf(start) });
    await palette.open(); await settled();
    type('发起任务 · sample1'); enter(); await settled();
    const row = miniDocument.activeElement!;
    const held = { type: 'keydown', key: 'Enter', repeat: true, bubbles: true } as never as { defaultPrevented?: boolean };
    row.dispatchEvent(held as never);
    expect(held.defaultPrevented).toBe(true); expect(start).not.toHaveBeenCalled();
  } finally { restore(); }
});

it('lists AI 助手 anywhere its entry is, and AI 改稿 only with a Book on screen', async () => {
  const restore = installMiniDom();
  try {
    setTechnicalLayerVisible(false);
    const link = (attribute: 'navDestination' | 'navAgentWorkspace', value: string): void => { const node = document.createElement('a'); node.dataset[attribute] = value; miniDocument.body.append(node as never); };
    const open = async (currentBookId: string | null): Promise<string[]> => {
      miniDocument.body.replaceChildren(); link('navDestination', 'global-agent'); link('navAgentWorkspace', 'row');
      const palette = make({ screen: { ...everything, has: () => false, currentBookId: () => currentBookId } });
      await palette.open(); await settled();
      const shown = labels();
      miniDocument.body.querySelector('.command-palette')?.close();
      return shown.filter((label) => label === 'AI 助手' || label === 'AI 改稿');
    };
    expect(await open(null)).toEqual(['AI 助手']);
    expect(await open('book-one')).toEqual(['AI 改稿', 'AI 助手']);
  } finally { setTechnicalLayerVisible(true); restore(); }
});
