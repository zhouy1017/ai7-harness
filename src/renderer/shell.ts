import {
  MAX_RECENT_BOOKS,
  MAX_SHELL_BOOK_TITLE_CHARACTERS,
  preferenceDefaults,
  type PreferenceKey,
  type PreferencesProjection,
  type PreferencesRendererApi,
  type PreferenceValue,
  type PreferenceValues,
  type ShellBookEntry,
  type ShellBookSection,
  type ShellRecentBookEntry,
} from '../shared/preferences.js';
import {
  SHELL_BOOK_GROUPS,
  SHELL_DESTINATIONS,
  SHELL_LABELS,
  SHELL_SETTINGS,
  SETTINGS_PAGE_TITLES,
  shellDestinationLabel,
  shellRecentStateLine,
  shellSectionGroupLabel,
  shellSectionLabel,
  type ShellDestination,
} from './shell-labels.js';
import { HELP_ENTRY } from './help-labels.js';

// The shell around every screen (Issue #934, wave 11 slice 11a; editor-surfaces §0.3; IA-006 to IA-013, ADR 0076): a
// two-level sidebar — the five global destinations, 置顶 and 最近打开 Books, the current Book's three groups and 设置 — and
// a context header naming where the window is. The screens stay their own owners: they still replace `#screen`, and they
// tell the shell which Book and section they show through `follow`. The shell owns no record: pinning, recency and the
// collapsed state are preferences, written through the main process's file and nothing else.

/** Where a Book screen is: its Book and the section of the current-Book groups it belongs to. */
export interface ShellPlace {
  readonly bookId: string;
  readonly title: string;
  readonly section: ShellBookSection;
}

/** What the sidebar marks as current: a global destination, 设置, a Book section, or nothing it names. */
export type ShellActive =
  | { readonly kind: 'destination'; readonly destination: ShellDestination }
  | { readonly kind: 'settings' }
  | { readonly kind: 'help' }
  | { readonly kind: 'section'; readonly section: ShellBookSection }
  | { readonly kind: 'none' };

/** Below this width the sidebar shows icons only, whatever its remembered state (editor-surfaces §0.3). */
export const SIDEBAR_ICONS_ONLY_BELOW_PX = 760;

export type SidebarMode = 'full' | 'icons';

export function sidebarMode(collapsed: boolean, narrow: boolean): SidebarMode {
  return collapsed || narrow ? 'icons' : 'full';
}

/** The screen states that are global destinations or 设置 pages; a Book screen says its own place instead. */
const SCREEN_ACTIVE: Readonly<Record<string, ShellActive>> = Object.freeze({
  'book-findings': { kind: 'section', section: 'findings' },
  landing: { kind: 'destination', destination: 'library' },
  'global-attention': { kind: 'destination', destination: 'attention' },
  'series-list': { kind: 'destination', destination: 'series' },
  series: { kind: 'destination', destination: 'series' },
  'knowledge-base': { kind: 'destination', destination: 'knowledge' },
  'quality-learning': { kind: 'destination', destination: 'quality' },
  settings: { kind: 'settings' },
  help: { kind: 'help' },
  'model-service': { kind: 'settings' },
  'data-storage': { kind: 'settings' },
  'evaluation-calibration': { kind: 'settings' },
  appearance: { kind: 'settings' },
  diagnostics: { kind: 'settings' },
  usage: { kind: 'settings' },
  'usage-run': { kind: 'settings' },
  keyboard: { kind: 'settings' },
  notifications: { kind: 'settings' },
});

/** The import steps, which belong to 书库 though no Book is open yet. */
const IMPORT_STATES = new Set(['target', 'relationship', 'title', 'review', 'book-create', 'book-create-review']);

export function screenActive(state: string, place: ShellPlace | null): ShellActive {
  if (place !== null) return { kind: 'section', section: place.section };
  return SCREEN_ACTIVE[state] ?? (IMPORT_STATES.has(state) ? { kind: 'destination', destination: 'library' } : { kind: 'none' });
}

/** The context header's words for a screen: its title (a Book's in serif) and where it sits. */
export function contextHeading(state: string, active: ShellActive, book: ShellBookEntry | null): { title: string; position: string; book: boolean } {
  if (active.kind === 'section' && book !== null) {
    return { title: book.title, position: `${shellSectionGroupLabel(active.section)} · ${shellSectionLabel(active.section)}`, book: true };
  }
  if (active.kind === 'settings') return { title: SHELL_SETTINGS.label, position: SETTINGS_PAGE_TITLES[state] ?? SHELL_LABELS.global, book: false };
  if (active.kind === 'help') return { title: HELP_ENTRY.label, position: SHELL_LABELS.global, book: false };
  if (active.kind === 'destination') {
    const label = shellDestinationLabel(active.destination);
    return IMPORT_STATES.has(state) ? { title: SHELL_LABELS.importing, position: label, book: false } : { title: label, position: SHELL_LABELS.global, book: false };
  }
  if (book !== null) return { title: book.title, position: SHELL_LABELS.currentBook, book: true };
  return { title: SHELL_LABELS.application, position: SHELL_LABELS.global, book: false };
}

/** A title kept within what a preference holds; the service's titles are already bounded, this only guards the file. */
function boundedTitle(title: string): string {
  // The shared validator bounds UTF-16 length; never split a supplementary character at that boundary.
  const bounded = title.slice(0, MAX_SHELL_BOOK_TITLE_CHARACTERS).replace(/[\uD800-\uDBFF]$/u, '');
  return bounded || SHELL_LABELS.untitledBook;
}

/** 最近打开 after a visit: the Book first with the section it was seen in, then the others, at most eight. */
export function rememberRecentBook(recent: ReadonlyArray<ShellRecentBookEntry>, place: ShellPlace, limit = MAX_RECENT_BOOKS): ReadonlyArray<ShellRecentBookEntry> {
  const entry: ShellRecentBookEntry = { bookId: place.bookId, title: boundedTitle(place.title), section: place.section };
  return [entry, ...recent.filter((item) => item.bookId !== place.bookId)].slice(0, limit);
}

/** 置顶 after the row's pin is pressed: pinned at the end, or removed when it already was. */
export function togglePinnedBook(pinned: ReadonlyArray<ShellBookEntry>, book: ShellBookEntry, limit: number): ReadonlyArray<ShellBookEntry> {
  if (pinned.some((item) => item.bookId === book.bookId)) return pinned.filter((item) => item.bookId !== book.bookId);
  return [...pinned, { bookId: book.bookId, title: boundedTitle(book.title) }].slice(-limit);
}

export interface SidebarBookRow {
  readonly bookId: string;
  readonly title: string;
  readonly state: string;
  readonly pinned: boolean;
  readonly current: boolean;
}

/** The sidebar's Book rows: pinned first, in pin order, then up to eight recent ones not pinned (IA-009). */
export function sidebarBookRows(
  pinned: ReadonlyArray<ShellBookEntry>,
  recent: ReadonlyArray<ShellRecentBookEntry>,
  currentBookId: string | null,
): { pinned: ReadonlyArray<SidebarBookRow>; recent: ReadonlyArray<SidebarBookRow> } {
  const seen = new Map(recent.map((entry) => [entry.bookId, entry]));
  const pinnedRows = pinned.map((entry) => {
    const visit = seen.get(entry.bookId);
    return { bookId: entry.bookId, title: visit?.title ?? entry.title, state: visit ? shellRecentStateLine(visit.section) : SHELL_LABELS.pinned, pinned: true, current: entry.bookId === currentBookId };
  });
  const pinnedIds = new Set(pinned.map((entry) => entry.bookId));
  const recentRows = recent.filter((entry) => !pinnedIds.has(entry.bookId)).slice(0, MAX_RECENT_BOOKS).map((entry) => ({
    bookId: entry.bookId, title: entry.title, state: shellRecentStateLine(entry.section), pinned: false, current: entry.bookId === currentBookId,
  }));
  return { pinned: pinnedRows, recent: recentRows };
}

/** The first character a collapsed row shows for a Book: its title's, as the editor reads it. */
export function bookIcon(title: string): string {
  return [...title.trim()][0] ?? SHELL_LABELS.bookIcon;
}

/**
 * The shell's preferences, apart from any page (Issue #934): they are read and written only through
 * `getPreferences`/`savePreference`, so pinning, recency and the collapsed state reach no service operation and no
 * business record. A list is written from the latest stored list, so two windows' visits do not undo each other's;
 * writes go one at a time, in order.
 */
export class ShellPreferences {
  private values: PreferenceValues = preferenceDefaults();
  private storedNotice: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(values: PreferenceValues) => void>();

  constructor(private readonly api: PreferencesRendererApi) {}

  get current(): PreferenceValues {
    return this.values;
  }

  get notice(): string | null {
    return this.storedNotice;
  }

  subscribe(listener: (values: PreferenceValues) => void): void {
    this.listeners.add(listener);
  }

  /** Read the stored values again; the notice is the line to disclose when the stored file was not usable. */
  async load(): Promise<string | null> {
    try {
      const projection = await this.api.getPreferences();
      this.accept(projection);
      return this.storedNotice;
    } catch (error) {
      this.storedNotice = SHELL_LABELS.preferenceReadFailed;
      for (const listener of this.listeners) listener(this.values);
      throw error;
    }
  }

  setCollapsed(collapsed: boolean): Promise<void> {
    return this.write('shell.sidebarCollapsed', () => collapsed, false);
  }

  viewAnalysis(bookId: string, revision: { revisionId: string; ordinal: number }): Promise<void> {
    const previous = this.values['analysis.lastViewedRevision'][bookId];
    if (previous !== undefined && previous.ordinal >= revision.ordinal) return Promise.resolve();
    return this.write('analysis.lastViewedRevision', (latest) => {
      const held = latest['analysis.lastViewedRevision'];
      if ((held[bookId]?.ordinal ?? 0) >= revision.ordinal) return held;
      return Object.fromEntries([...Object.entries(held).filter(([id]) => id !== bookId), [bookId, { revisionId: revision.revisionId, ordinal: revision.ordinal }]].slice(-256));
    }, true, false);
  }

  togglePin(book: ShellBookEntry, limit: number): Promise<void> {
    return this.write('shell.pinnedBooks', (latest) => togglePinnedBook(latest['shell.pinnedBooks'], book, limit), true);
  }

  visit(place: ShellPlace): Promise<void> {
    const front = this.values['shell.recentBooks'][0];
    if (front !== undefined && front.bookId === place.bookId && front.section === place.section && front.title === boundedTitle(place.title)) {
      return Promise.resolve();
    }
    return this.write('shell.recentBooks', (latest) => rememberRecentBook(latest['shell.recentBooks'], place), true, false);
  }

  private write<Key extends PreferenceKey>(key: Key, next: (latest: PreferenceValues) => PreferenceValue<Key>, fromLatest: boolean, clearNotice = true): Promise<void> {
    const run = this.queue.then(async () => {
      const latest = fromLatest ? (await this.api.getPreferences()).values : this.values;
      this.accept(await this.api.savePreference({ key, value: next(latest) }), clearNotice);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private accept(projection: PreferencesProjection, clearNotice = false): void {
    this.values = projection.values;
    // A visit may repair the file automatically during startup. Keep the disclosure until an explicit settings change.
    if (projection.notice !== null || clearNotice) this.storedNotice = projection.notice;
    for (const listener of this.listeners) listener(this.values);
  }
}

export interface ShellSurface {
  /** A screen is on `#screen`: mark it, and when it belongs to a Book, make that Book current and recent. */
  follow(state: string, place: ShellPlace | null): void;
  /** The screen on `#screen` is shown for another section of its Book than its own (历史与恢复 on 工作概览). */
  markSection(section: ShellBookSection): void;
  /** The window left its Book (书库, 待我处理): the current-Book groups go. */
  leaveBook(): void;
  /** The Book whose groups show, if any. */
  currentBook(): ShellBookEntry | null;
  /** The local service stopped: nothing in the sidebar leads anywhere any more. */
  interrupt(): void;
  /** The context header's slot for a screen that opts in to hosting its actions there; a screen change empties it. */
  setContextActions(...nodes: ReadonlyArray<HTMLElement>): void;
}

export interface MountShellOptions {
  readonly sidebar: HTMLElement;
  /** 待我处理's entry, which keeps its own mount (count, badge, opening) and moves into the sidebar. */
  readonly attentionEntry: HTMLButtonElement;
  readonly toggle: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly position: HTMLElement;
  readonly actions: HTMLElement;
  readonly preferenceNotice: HTMLElement;
  readonly preferences: ShellPreferences;
  readonly pinLimit: number;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  openDestination(destination: Exclude<ShellDestination, 'attention'>): void;
  openSection(book: ShellBookEntry, section: ShellBookSection): void;
  openBook(bookId: string): void;
  openSettings(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A sidebar row: a link whose text is exactly its label, its icon drawn from `data-nav-icon`, and never a page load. */
function navLink(label: string, icon: string, activate: () => void): HTMLAnchorElement {
  const link = el('a', 'sidebar-link');
  link.href = '#';
  link.dataset['navIcon'] = icon;
  link.append(el('span', 'nav-label', label));
  link.addEventListener('click', (event) => {
    event.preventDefault();
    if (link.getAttribute('aria-disabled') === 'true') return;
    activate();
  });
  return link;
}

export function mountShell(options: MountShellOptions): ShellSurface {
  const { sidebar, preferences } = options;
  let book: ShellBookEntry | null = null;
  let active: ShellActive = { kind: 'none' };
  let state = '';
  let interrupted = false;
  const narrowQuery = window.matchMedia(`(max-width: ${SIDEBAR_ICONS_ONLY_BELOW_PX - 0.02}px)`);

  sidebar.setAttribute('aria-label', SHELL_LABELS.navigation);
  const destinations = el('ul', 'sidebar-destinations');
  const destinationLinks = new Map<ShellDestination, HTMLElement>();
  for (const entry of SHELL_DESTINATIONS) {
    const item = el('li');
    if (entry.key === 'attention') {
      const node = options.attentionEntry;
      node.dataset['navDestination'] = 'attention';
      node.dataset['navIcon'] = entry.icon;
      node.classList.add('sidebar-link');
      item.append(node);
      destinationLinks.set(entry.key, node);
    } else {
      const key = entry.key;
      const link = navLink(entry.label, entry.icon, () => options.openDestination(key));
      link.dataset['navDestination'] = key;
      // The 书系 / 知识库 / 质量与学习 entries keep the routes the old landing gave them, for one wave (Issue #934).
      if (key === 'series') link.dataset['settingsRoute'] = 'series';
      if (key === 'knowledge') link.dataset['settingsRoute'] = 'knowledge-base';
      if (key === 'quality') link.dataset['settingsRoute'] = 'quality-learning';
      item.append(link);
      destinationLinks.set(key, link);
    }
    destinations.append(item);
  }

  const books = el('section', 'sidebar-books');
  books.setAttribute('aria-label', SHELL_LABELS.books);
  const bookGroup = el('section', 'sidebar-book');
  bookGroup.setAttribute('aria-label', SHELL_LABELS.currentBook);
  bookGroup.hidden = true;
  const bookTitle = el('p', 'sidebar-book-title');
  bookGroup.append(bookTitle);
  const sectionLinks = new Map<ShellBookSection, HTMLAnchorElement>();
  for (const group of SHELL_BOOK_GROUPS) {
    const holder = el('div', 'sidebar-group');
    holder.setAttribute('role', 'group');
    holder.setAttribute('aria-label', group.label);
    holder.dataset['navBookGroup'] = group.key;
    const heading = el('p', 'sidebar-group-label', group.label);
    heading.setAttribute('aria-hidden', 'true');
    const list = el('ul');
    for (const section of group.sections) {
      const key = section.key;
      const link = navLink(section.label, section.icon, () => {
        if (book !== null) options.openSection(book, key);
      });
      link.dataset['navBookSection'] = key;
      sectionLinks.set(key, link);
      const item = el('li');
      item.append(link);
      list.append(item);
    }
    holder.append(heading, list);
    bookGroup.append(holder);
  }

  const foot = el('div', 'sidebar-foot');
  const settings = navLink(SHELL_SETTINGS.label, SHELL_SETTINGS.icon, () => options.openSettings());
  settings.dataset['navSettings'] = 'hub';
  // 帮助 (slice 11f) takes this slot beside 设置.
  const helpSlot = el('div', 'sidebar-help-slot');
  helpSlot.dataset['shellSlot'] = 'help';
  foot.append(settings, helpSlot);
  sidebar.replaceChildren(destinations, books, bookGroup, foot);

  const allLinks = (): ReadonlyArray<HTMLElement> => [...sidebar.querySelectorAll<HTMLElement>('a.sidebar-link, button.sidebar-pin')];

  const paintBooks = (values: PreferenceValues): void => {
    const focused = document.activeElement instanceof HTMLElement && books.contains(document.activeElement) ? document.activeElement : null;
    const focusKind = focused?.dataset['navPin'] !== undefined ? 'navPin' : 'navBook';
    const focusBook = focused?.dataset[focusKind];
    options.preferenceNotice.textContent = preferences.notice ?? '';
    options.preferenceNotice.hidden = preferences.notice === null;
    const rows = sidebarBookRows(values['shell.pinnedBooks'], values['shell.recentBooks'], book?.bookId ?? null);
    const list = (heading: string, entries: ReadonlyArray<SidebarBookRow>, kind: 'pinned' | 'recent'): HTMLElement | null => {
      if (entries.length === 0) return null;
      const block = el('div', 'sidebar-book-list');
      block.dataset['navBooks'] = kind;
      const label = el('p', 'sidebar-group-label', heading);
      const items = el('ul');
      for (const row of entries) {
        const item = el('li', 'sidebar-book-row');
        item.dataset['navBookRow'] = row.bookId;
        const link = navLink(row.title, bookIcon(row.title), () => options.openBook(row.bookId));
        link.dataset['navBook'] = row.bookId;
        link.setAttribute('aria-label', SHELL_LABELS.bookRowName(row.title, row.state));
        link.append(el('span', 'nav-state', row.state));
        if (row.current) link.setAttribute('aria-current', 'true');
        const pin = el('button', 'sidebar-pin', row.pinned ? '★' : '☆');
        pin.type = 'button';
        pin.dataset['navPin'] = row.bookId;
        pin.setAttribute('aria-pressed', String(row.pinned));
        pin.setAttribute('aria-label', row.pinned ? SHELL_LABELS.unpin(row.title) : SHELL_LABELS.pin(row.title));
        pin.addEventListener('click', () => {
          if (interrupted) return;
          void preferences.togglePin({ bookId: row.bookId, title: row.title }, options.pinLimit).catch((error: unknown) => {
            options.setStatus(options.errorMessage(error, SHELL_LABELS.preferenceWriteFailed), 'error');
          });
        });
        item.append(link, pin);
        items.append(item);
      }
      block.append(label, items);
      return block;
    };
    const blocks = [list(SHELL_LABELS.pinnedHeading, rows.pinned, 'pinned'), list(SHELL_LABELS.recentHeading, rows.recent, 'recent')].filter((node): node is HTMLElement => node !== null);
    if (blocks.length === 0) blocks.push(el('p', 'sidebar-empty field-note', SHELL_LABELS.noBooks));
    books.replaceChildren(...blocks);
    applyMode();
    // Pin/unpin moves the row between lists. Keep keyboard focus on that same control after painting it.
    if (focusBook !== undefined) {
      const replacement = [...books.querySelectorAll<HTMLElement>('[data-nav-pin], [data-nav-book]')]
        .find((node) => node.dataset[focusKind] === focusBook);
      replacement?.focus({ preventScroll: true });
    }
  };

  const applyMode = (): void => {
    const narrow = narrowQuery.matches;
    const mode = sidebarMode(preferences.current['shell.sidebarCollapsed'], narrow);
    const root = document.documentElement;
    root.dataset['sidebar'] = mode;
    root.dataset['sidebarCollapsed'] = String(preferences.current['shell.sidebarCollapsed']);
    options.toggle.disabled = narrow;
    options.toggle.setAttribute('aria-expanded', String(mode === 'full'));
    options.toggle.setAttribute('aria-label', narrow ? SHELL_LABELS.narrow : mode === 'full' ? SHELL_LABELS.collapse : SHELL_LABELS.expand);
    options.toggle.title = options.toggle.getAttribute('aria-label') ?? '';
    // A collapsed row says its name on hover too; a full row shows it already.
    for (const link of sidebar.querySelectorAll<HTMLElement>('.sidebar-link')) {
      const name = link.getAttribute('aria-label') ?? link.querySelector('.nav-label')?.textContent ?? '';
      if (mode === 'icons') link.title = name;
      else link.removeAttribute('title');
    }
    if (interrupted) for (const link of allLinks()) disable(link);
  };

  const disable = (node: HTMLElement): void => {
    if (node instanceof HTMLButtonElement) node.disabled = true;
    else node.setAttribute('aria-disabled', 'true');
  };

  const paintActive = (): void => {
    for (const [key, node] of destinationLinks) {
      if (active.kind === 'destination' && active.destination === key) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    }
    for (const [key, node] of sectionLinks) {
      if (active.kind === 'section' && active.section === key) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    }
    if (active.kind === 'settings') settings.setAttribute('aria-current', 'page');
    else settings.removeAttribute('aria-current');
    const helpLink = helpSlot.querySelector('[data-nav-help="hub"]');
    if (active.kind === 'help') helpLink?.setAttribute('aria-current', 'page');
    else helpLink?.removeAttribute('aria-current');
    bookGroup.hidden = book === null;
    if (book !== null) {
      bookTitle.textContent = book.title;
      bookTitle.dataset['navIcon'] = bookIcon(book.title);
      bookGroup.dataset['bookId'] = book.bookId;
    } else {
      delete bookGroup.dataset['bookId'];
    }
    const heading = contextHeading(state, active, book);
    options.title.textContent = heading.title;
    options.title.dataset['contextBook'] = String(heading.book);
    options.position.textContent = heading.position;
  };

  options.toggle.addEventListener('click', () => {
    void preferences.setCollapsed(!preferences.current['shell.sidebarCollapsed']).catch((error: unknown) => {
      options.setStatus(options.errorMessage(error, SHELL_LABELS.preferenceWriteFailed), 'error');
    });
  });
  narrowQuery.addEventListener('change', applyMode);
  preferences.subscribe((values) => paintBooks(values));
  paintBooks(preferences.current);
  paintActive();

  const visit = (place: ShellPlace): void => {
    void preferences.visit(place).catch((error: unknown) => {
      options.setStatus(options.errorMessage(error, SHELL_LABELS.preferenceWriteFailed), 'error');
    });
  };

  return {
    follow: (nextState, place) => {
      state = nextState;
      if (place !== null) book = { bookId: place.bookId, title: place.title };
      active = screenActive(nextState, place);
      options.actions.replaceChildren();
      paintActive();
      paintBooks(preferences.current);
      if (place !== null) visit(place);
    },
    markSection: (section) => {
      if (book === null) return;
      active = { kind: 'section', section };
      paintActive();
      visit({ ...book, section });
    },
    leaveBook: () => {
      book = null;
      paintActive();
      paintBooks(preferences.current);
    },
    currentBook: () => book,
    interrupt: () => {
      interrupted = true;
      for (const link of allLinks()) disable(link);
    },
    setContextActions: (...nodes) => options.actions.replaceChildren(...nodes),
  };
}
