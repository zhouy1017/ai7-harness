import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountShell, ShellPreferences, type MountShellOptions } from '../../src/renderer/shell.js';
import { preferenceDefaults, PREFERENCES_NOTICES, type PreferenceValues, type PreferencesRendererApi } from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// #934: exercise the actual shell mount, including focus across preference-driven row replacement.
let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('document', {
    createElement: miniDocument.createElement,
    addEventListener: (type: string, listener: (event: unknown) => void) => miniDocument.body.addEventListener(type, listener),
    get activeElement() { return miniDocument.activeElement; },
    documentElement: new MiniElement('html'),
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: () => undefined }) });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

function mounted(notice: string | null = null, listBooks = async () => [{ bookId: 'book-a', title: '甲书' }, { bookId: 'book-b', title: '乙书' }], pages?: MountShellOptions['listBooks']) {
  let values: PreferenceValues = preferenceDefaults();
  const api: PreferencesRendererApi = {
    getPreferences: async () => ({ version: 1, values, notice }),
    savePreference: async ({ key, value }) => {
      values = { ...values, [key]: value };
      notice = null;
      return { version: 1, values, notice };
    },
  };
  const preferences = new ShellPreferences(api);
  const sidebar = document.createElement('nav');
  const preferenceNotice = document.createElement('p');
  const actions = document.createElement('div');
  const openAgentWorkspace = vi.fn();
  const position = document.createElement('p');
  const openBook = vi.fn();
  const openDestination = vi.fn();
  miniDocument.body.append(sidebar as unknown as MiniElement);
  const surface = mountShell({
    sidebar, preferenceNotice, actions, preferences,
    attentionEntry: document.createElement('button'), toggle: document.createElement('button'),
    title: document.createElement('h1'), position, pinLimit: 20, listBooks: pages ?? (async () => ({ items: await listBooks(), nextCursor: null })),
    setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback,
    openDestination, openSection: vi.fn(), openAgentWorkspace, openBook, openSettings: vi.fn(),
  });
  return { sidebar, preferences, preferenceNotice, surface, actions, openAgentWorkspace, position, openBook, openDestination };
}

describe('mounted shell preferences', () => {
  it('keeps focus on the same Book pin when pinning and unpinning moves it between lists', async () => {
    const { sidebar, preferences } = mounted();
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    let pin = sidebar.querySelector<HTMLButtonElement>('[data-nav-pin="book-a"]')!;
    pin.focus();
    pin.click();
    await vi.waitFor(() => expect(sidebar.querySelector('[data-nav-books="pinned"] [data-nav-pin="book-a"]')).not.toBeNull());
    pin = sidebar.querySelector<HTMLButtonElement>('[data-nav-pin="book-a"]')!;
    expect(document.activeElement).toBe(pin);
    pin.click();
    await vi.waitFor(() => expect(sidebar.querySelector('[data-nav-books="recent"] [data-nav-pin="book-a"]')).not.toBeNull());
    expect(document.activeElement).toBe(sidebar.querySelector('[data-nav-pin="book-a"]'));
  });

  it('keeps the corruption status line through screen changes and automatic recency saves', async () => {
    const { preferences, preferenceNotice, surface } = mounted(PREFERENCES_NOTICES.unreadable);
    await preferences.load();
    surface.follow('landing', null);
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    await preferences.load();
    expect(preferenceNotice.hidden).toBe(false);
    expect(preferenceNotice.textContent).toBe(PREFERENCES_NOTICES.unreadable);
    await preferences.setCollapsed(true);
    expect(preferenceNotice.hidden).toBe(true);
  });

  it('offers Agent 工作区 as the 工作 group’s own row of the current Book, never a section or a recent visit (#90)', async () => {
    const { sidebar, surface, preferences, openAgentWorkspace, position } = mounted();
    await preferences.load();
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    await vi.waitFor(() => expect(preferences.current['shell.recentBooks'][0]?.section).toBe('overview'));
    const row = sidebar.querySelector<HTMLAnchorElement>('[data-nav-book-group="work"] [data-nav-agent-workspace="row"]')!;
    expect(row.textContent).toBe('Agent 工作区');
    expect(row.getAttribute('data-nav-book-section')).toBeNull();
    row.click();
    expect(openAgentWorkspace).toHaveBeenCalledWith({ bookId: 'book-a', title: '甲书' });
    const recent = preferences.current['shell.recentBooks'];
    surface.follow('agent-workspace', null);
    expect(row.getAttribute('aria-current')).toBe('page');
    expect(position.textContent).toBe('工作 · Agent 工作区');
    expect(preferences.current['shell.recentBooks']).toEqual(recent);
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    expect(row.getAttribute('aria-current')).toBeNull();
  });

  it('leaves action hosting opt-in and clears the slot on the next screen', () => {
    const { surface, actions } = mounted();
    expect(actions.children).toHaveLength(0);
    surface.setContextActions(document.createElement('button'));
    expect(actions.children).toHaveLength(1);
    surface.follow('settings', null);
    expect(actions.children).toHaveLength(0);
  });
});

function picker(sidebar: HTMLElement) {
  return {
    toggle: sidebar.querySelector<HTMLButtonElement>('[data-shell-book-switcher]')!,
    panel: sidebar.querySelector<HTMLElement>('[data-shell-book-picker="panel"]')!,
    search: sidebar.querySelector<HTMLInputElement>('[data-shell-book-search]')!,
    status: sidebar.querySelector<HTMLElement>('[data-shell-book-picker-status]')!,
    retry: sidebar.querySelector<HTMLButtonElement>('[data-shell-book-retry]')!,
  };
}
function dispatch(node: HTMLElement, event: object) { (node as unknown as MiniElement).dispatchEvent(event as never); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('current-catalog Book switcher (#1002)', () => {
  it('reports loading and failure, retries, distinguishes empty catalog from no matches and uses existing routes', async () => {
    const request = deferred<Array<{ bookId: string; title: string }>>();
    const list = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce([]).mockResolvedValue([{ bookId: 'book-a', title: '<甲书>' }]);
    const { sidebar, openBook, openDestination } = mounted(null, list);
    const ui = picker(sidebar);
    ui.toggle.click();
    expect(ui.status.textContent).toContain('正在读取');
    expect(document.activeElement).toBe(ui.search);
    request.reject(new Error('untrusted error must not render'));
    await vi.waitFor(() => expect(ui.retry.hidden).toBe(false));
    expect(ui.status.textContent).not.toContain('untrusted');
    ui.retry.click();
    await vi.waitFor(() => expect(ui.status.textContent).toBe('书库里还没有图书。'));
    dispatch(ui.search, { type: 'keydown', key: 'Escape', bubbles: true });
    expect(ui.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(ui.toggle);
    ui.toggle.click();
    await vi.waitFor(() => expect(sidebar.querySelector('[data-shell-picker-book="book-a"]')).not.toBeNull());
    ui.search.value = '不存在'; dispatch(ui.search, { type: 'input' });
    expect(ui.status.textContent).toBe('未找到匹配的图书。');
    ui.search.value = '<甲'; dispatch(ui.search, { type: 'input' });
    const row = sidebar.querySelector<HTMLButtonElement>('[data-shell-picker-book="book-a"]')!;
    expect(row.textContent).toContain('<甲书>');
    row.click(); expect(openBook).toHaveBeenCalledWith('book-a');
    expect(ui.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(ui.toggle);
    ui.toggle.click();
    sidebar.querySelector<HTMLButtonElement>('[data-shell-book-library]')!.click();
    expect(openDestination).toHaveBeenCalledWith('library');
  });

  it('ignores stale successful and failed requests across rapid openings and interruption', async () => {
    const old = deferred<Array<{ bookId: string; title: string }>>();
    const current = deferred<Array<{ bookId: string; title: string }>>();
    const list = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { sidebar, surface } = mounted(null, list);
    const ui = picker(sidebar);
    ui.toggle.click(); ui.toggle.click(); ui.toggle.click();
    current.resolve([{ bookId: 'fresh', title: '现在的书名' }]);
    await vi.waitFor(() => expect(sidebar.querySelector('[data-shell-picker-book="fresh"]')).not.toBeNull());
    old.reject(new Error('late failure')); await Promise.resolve();
    expect(ui.retry.hidden).toBe(true);
    expect(sidebar.querySelector('[data-shell-picker-book="fresh"]')).not.toBeNull();
    surface.interrupt();
    expect(ui.panel.hidden).toBe(true); expect(ui.toggle.disabled).toBe(true);
  });

  it('refreshes catalog titles/removals and preserves picker focus through preference paints', async () => {
    let catalog = [{ bookId: 'book-a', title: '新标题' }, { bookId: 'book-b', title: '乙书' }];
    const { sidebar, preferences, surface } = mounted(null, async () => catalog);
    await preferences.visit({ bookId: 'book-a', title: '旧标题', section: 'history' });
    await preferences.togglePin({ bookId: 'removed', title: '已删除' }, 20);
    await preferences.togglePin({ bookId: 'book-a', title: '旧标题' }, 20);
    surface.follow('editor', { bookId: 'book-a', title: '旧标题', section: 'manuscript' });
    const ui = picker(sidebar); ui.toggle.click();
    await vi.waitFor(() => expect(sidebar.querySelectorAll('[data-shell-picker-book]')).toHaveLength(2));
    expect(sidebar.querySelector('[data-shell-picker-book="removed"]')).toBeNull();
    expect(sidebar.querySelector('[data-shell-picker-book="book-a"]')!.textContent).toContain('新标题');
    expect(sidebar.querySelector('[data-shell-picker-book="book-a"]')!.getAttribute('aria-current')).toBe('true');
    ui.search.focus();
    await preferences.setCollapsed(true);
    expect(document.activeElement).toBe(ui.search); expect(ui.panel.hidden).toBe(false);
    dispatch(ui.search, { type: 'keydown', key: 'Escape', bubbles: true });
    catalog = [{ bookId: 'book-b', title: '乙书改名' }];
    ui.toggle.click();
    await vi.waitFor(() => expect(sidebar.querySelectorAll('[data-shell-picker-book]')).toHaveLength(1));
    expect(sidebar.querySelector('[data-shell-picker-book="book-b"]')!.textContent).toContain('乙书改名');
    expect(sidebar.querySelector('[data-shell-picker-book="book-a"]')).toBeNull();
  });

  it('dismisses on outside pointer or focus without stealing an outside control’s focus', async () => {
    const { sidebar } = mounted(); const ui = picker(sidebar);
    ui.toggle.click(); await Promise.resolve();
    const outside = new MiniElement('button'); miniDocument.body.append(outside);
    outside.dispatchEvent({ type: 'pointerdown', bubbles: true });
    expect(ui.panel.hidden).toBe(true); expect(document.activeElement).toBe(ui.toggle);
    outside.focus();
    ui.toggle.click(); await Promise.resolve(); outside.focus();
    outside.dispatchEvent({ type: 'focusin', bubbles: true });
    expect(ui.panel.hidden).toBe(true); expect(document.activeElement).toBe(outside);
  });
});

describe('paginated current catalog (#1002)', () => {
  it('reads all pages before publishing groups, stops obsolete paging and rejects a stuck cursor', async () => {
    const cursor = { bookId: 'a', title: '甲' };
    const pages = vi.fn().mockResolvedValueOnce({ items: [{ bookId: 'a', title: '甲' }], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [{ bookId: 'b', title: '乙' }], nextCursor: null });
    const { sidebar } = mounted(null, undefined, pages);
    const ui = picker(sidebar); ui.toggle.click();
    await vi.waitFor(() => expect(sidebar.querySelectorAll('[data-shell-picker-book]')).toHaveLength(2));
    expect(pages).toHaveBeenNthCalledWith(1, { after: null });
    expect(pages).toHaveBeenNthCalledWith(2, { after: cursor });
    ui.toggle.click();
    const old = deferred<{ items: Array<{ bookId: string; title: string }>; nextCursor: typeof cursor | null }>();
    pages.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [{ bookId: 'new', title: '新' }], nextCursor: null });
    ui.toggle.click(); ui.toggle.click(); ui.toggle.click();
    await vi.waitFor(() => expect(sidebar.querySelector('[data-shell-picker-book="new"]')).not.toBeNull());
    const calls = pages.mock.calls.length;
    old.resolve({ items: [{ bookId: 'old', title: '旧' }], nextCursor: cursor }); await Promise.resolve();
    expect(pages).toHaveBeenCalledTimes(calls);
    expect(sidebar.querySelector('[data-shell-picker-book="old"]')).toBeNull();
    ui.toggle.click();
    pages.mockResolvedValue({ items: [], nextCursor: cursor }); ui.toggle.click();
    await vi.waitFor(() => expect(ui.retry.hidden).toBe(false));
    expect(ui.status.textContent).toContain('无法读取');
  });
});
