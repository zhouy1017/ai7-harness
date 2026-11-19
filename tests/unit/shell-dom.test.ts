import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountShell, ShellPreferences } from '../../src/renderer/shell.js';
import { SHELL_LABELS } from '../../src/renderer/shell-labels.js';
import { preferenceDefaults, PREFERENCES_NOTICES, type PreferenceValues, type PreferencesRendererApi } from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// #934: exercise the actual shell mount, including focus across preference-driven row replacement.
let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('document', {
    ...miniDocument,
    createElement: miniDocument.createElement,
    addEventListener: (type: string, listener: (event: unknown) => void) => miniDocument.body.addEventListener(type, listener),
    get activeElement() { return miniDocument.activeElement; },
    documentElement: new MiniElement('html'),
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: () => undefined }) });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

function mounted(notice: string | null = null) {
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
  const toggle = document.createElement('button');
  const surface = mountShell({
    sidebar, preferenceNotice, actions, preferences, title: document.createElement('h1'), position, pinLimit: 6,
    attentionEntry: document.createElement('button'), toggle,
    setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback,
    openDestination, openSection: vi.fn(), openAgentWorkspace, openBook, openSettings: vi.fn(),
  });
  return { toggle, sidebar, preferences, preferenceNotice, surface, actions, openAgentWorkspace, position, openBook, openDestination };
}

describe('mounted shell preferences', () => {
  it('keeps only Settings in the sidebar footer and selects it for Help', () => {
    const { sidebar, surface, position } = mounted();
    surface.follow('help', null);
    expect(sidebar.querySelector('[data-shell-slot="help"]')).toBeNull();
    expect(sidebar.querySelector('[data-nav-help]')).toBeNull();
    expect(sidebar.querySelector('[data-nav-settings]')?.getAttribute('aria-current')).toBe('page');
    expect(position.textContent).toBe('本机 · 帮助');
  });
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

// #1319: switching is a direct book row; the library contains the complete catalog.
describe('sidebar book entries', () => {
  it('reopens the Book from global attention through the library rather than hidden Book sections (#1394 J16)', async () => {
    const { sidebar, preferences, surface, openDestination, openBook } = mounted();
    await preferences.load();
    surface.follow('editor', { bookId: 'book-a', title: '甲书', section: 'manuscript' });
    await vi.waitFor(() => expect(preferences.current['shell.recentBooks'][0]?.bookId).toBe('book-a'));
    surface.leaveBook(); surface.follow('global-attention', null); surface.follow('help', null);
    expect(sidebar.querySelector<HTMLElement>('.sidebar-book')!.hidden).toBe(true);
    expect(surface.currentBook()).toBeNull();
    sidebar.querySelector<HTMLElement>('[data-nav-destination="library"]')!.click();
    expect(openDestination).toHaveBeenCalledWith('library');
    sidebar.querySelector<HTMLElement>('[data-nav-book="book-a"]')!.click();
    expect(openBook).toHaveBeenCalledWith('book-a');
  });

  it('opens a recent book directly and keeps the complete library reachable without a switcher', async () => {
    const { sidebar, preferences, surface, openBook, openDestination } = mounted();
    await preferences.visit({ bookId: 'book-b', title: '乙书', section: 'review' });
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    expect(sidebar.querySelector('[data-shell-book-switcher]')).toBeNull();
    expect(sidebar.querySelector('.sidebar-book-title')).toBeNull();
    // The open Book is the heading of its groups and has no row of its own (#1521); the others keep theirs.
    expect(sidebar.querySelector('.sidebar-current-book')?.textContent).toBe('甲书');
    expect(sidebar.querySelector('[data-nav-book="book-a"]')).toBeNull();
    expect(Array.from(sidebar.querySelectorAll<HTMLElement>('[data-nav-book-group]'), (group) => group.dataset['navBookGroup'])).toEqual(['work', 'records']);
    const row = sidebar.querySelector<HTMLAnchorElement>('[data-nav-book="book-b"]')!;
    expect(row.querySelector('.nav-book-initial')?.textContent).toBe('乙');
    expect(row.querySelector('.icon')).toBeNull();
    expect(row.querySelector('.nav-label')?.textContent).toBe('乙书');
    expect(row.querySelector('.nav-state')).toBeNull();
    expect(row.getAttribute('aria-current')).toBeNull();
    row.click();
    expect(openBook).toHaveBeenCalledWith('book-b');
    sidebar.querySelector<HTMLAnchorElement>('[data-nav-destination="library"]')!.click();
    expect(openDestination).toHaveBeenCalledWith('library');
  });

  it('pins and unpins the open Book from its heading with the list star write, and keeps focus there (#1521)', async () => {
    const { sidebar, preferences, surface } = mounted();
    await preferences.load();
    const pin = () => sidebar.querySelector<HTMLButtonElement>('.sidebar-current-book-row [data-nav-current-pin]')!;
    expect(pin().hidden).toBe(true);
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    await vi.waitFor(() => expect(preferences.current['shell.recentBooks'][0]?.bookId).toBe('book-a'));
    expect(pin().hidden).toBe(false);
    expect([pin().getAttribute('aria-pressed'), pin().getAttribute('aria-label'), pin().textContent]).toEqual(['false', '置顶《甲书》', '☆']);
    pin().focus();
    const element = pin();
    element.click();
    await vi.waitFor(() => expect(preferences.current['shell.pinnedBooks'].map((entry) => entry.bookId)).toEqual(['book-a']));
    // The same element, painted anew: it keeps the focus the keyboard put there; the Book still has no list row.
    expect(pin()).toBe(element);
    expect(document.activeElement).toBe(element);
    expect([element.getAttribute('aria-pressed'), element.getAttribute('aria-label'), element.textContent]).toEqual(['true', '取消置顶《甲书》', '★']);
    expect(sidebar.querySelector('[data-nav-book="book-a"]')).toBeNull();
    element.click();
    await vi.waitFor(() => expect(preferences.current['shell.pinnedBooks']).toEqual([]));
    expect([element.getAttribute('aria-pressed'), document.activeElement === element]).toEqual(['false', true]);
    surface.leaveBook();
    expect(pin().hidden).toBe(true);
  });

  it('hides the Book list while the open Book is the only one known, and says so when no Book is open (#1521)', async () => {
    const { sidebar, preferences, surface } = mounted();
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    expect(sidebar.querySelector<HTMLElement>('.sidebar-books')!.hidden).toBe(true);
    surface.leaveBook();
    expect(sidebar.querySelector<HTMLElement>('.sidebar-books')!.hidden).toBe(false);
    expect(sidebar.querySelector('[data-nav-book="book-a"]')).not.toBeNull();
  });

  it('remembers collapse through the existing preference store and keeps row tooltips', async () => {
    const { sidebar, preferences } = mounted();
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    await preferences.setCollapsed(true);
    await preferences.load();
    expect(document.documentElement.dataset['sidebar']).toBe('icons');
    expect(preferences.current['shell.sidebarCollapsed']).toBe(true);
    expect(sidebar.querySelector<HTMLAnchorElement>('[data-nav-book="book-a"]')?.title).toContain('甲书');
    expect(sidebar.querySelector<HTMLAnchorElement>('[data-nav-destination="library"]')?.title).toBe('书库');
  });
});

it('automatically shows icons without saving collapse and holds the toggle, saying why, until the column closes', async () => {
  let notify = () => {};
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { notify = callback; } observe() {} });
  const { toggle, preferences } = mounted();
  await preferences.load();
  document.documentElement.dataset['rightColumn'] = 'icons'; notify();
  expect(document.documentElement.dataset['sidebar']).toBe('icons');
  expect(preferences.current['shell.sidebarCollapsed']).toBe(false);
  expect([toggle.disabled, toggle.title]).toEqual([true, SHELL_LABELS.column]);
  toggle.click();
  expect(preferences.current['shell.sidebarCollapsed']).toBe(false);
  // The overlay form needs the width as much: the same automatic icons, the same held toggle.
  document.documentElement.dataset['rightColumn'] = 'overlay'; notify();
  expect([document.documentElement.dataset['sidebar'], toggle.disabled, toggle.title]).toEqual(['icons', true, SHELL_LABELS.column]);
  document.documentElement.dataset['rightColumn'] = 'none'; notify();
  expect([document.documentElement.dataset['sidebar'], toggle.disabled, toggle.title]).toEqual(['full', false, SHELL_LABELS.collapse]);
  toggle.click();
  await vi.waitFor(() => expect(preferences.current['shell.sidebarCollapsed']).toBe(true));
  expect(document.documentElement.dataset['sidebar']).toBe('icons');
  delete document.documentElement.dataset['rightColumn'];
});
