import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountShell, ShellPreferences } from '../../src/renderer/shell.js';
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
  const surface = mountShell({
    sidebar, preferenceNotice, actions, preferences, title: document.createElement('h1'), position, pinLimit: 6,
    attentionEntry: document.createElement('button'), toggle: document.createElement('button'),
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

// #1319: switching is a direct book row; the library contains the complete catalog.
describe('sidebar book entries', () => {
  it('opens a recent book directly and keeps the complete library reachable without a switcher', async () => {
    const { sidebar, preferences, surface, openBook, openDestination } = mounted();
    await preferences.visit({ bookId: 'book-a', title: '甲书', section: 'overview' });
    surface.follow('book-overview', { bookId: 'book-a', title: '甲书', section: 'overview' });
    expect(sidebar.querySelector('[data-shell-book-switcher]')).toBeNull();
    expect(sidebar.querySelector('.sidebar-book-title')).toBeNull();
    expect(sidebar.querySelector('.sidebar-current-book')?.textContent).toBe('甲书');
    const row = sidebar.querySelector<HTMLAnchorElement>('[data-nav-book="book-a"]')!;
    expect(row.querySelector('.nav-book-initial')?.textContent).toBe('甲');
    expect(row.querySelector('.icon')).toBeNull();
    expect(row.querySelector('.nav-label')?.textContent).toBe('甲书');
    expect(row.querySelector('.nav-state')?.textContent).toBe('当前');
    expect(row.getAttribute('aria-current')).toBe('true');
    row.click();
    expect(openBook).toHaveBeenCalledWith('book-a');
    sidebar.querySelector<HTMLAnchorElement>('[data-nav-destination="library"]')!.click();
    expect(openDestination).toHaveBeenCalledWith('library');
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
