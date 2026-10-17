import {
  FOCUS_MODE_ENTERED,
  FOCUS_MODE_ENTER_TITLE,
  FOCUS_MODE_EXIT,
  FOCUS_MODE_LABEL,
  FOCUS_MODE_LEFT,
  FOCUS_MODE_NAME,
  VIEW_MENU_ITEMS,
  VIEW_MENU_LABEL,
  VIEW_MENU_NOTE,
  VIEW_MENU_RESTORE_HEADING,
} from './editor-modes-labels.js';
import { RESTORED_DEFAULT_LAYOUT, VIEW_SETTINGS_SAVE_FAILED } from './layout-labels.js';
import type { ViewPreferences } from './layout.js';

// 专注模式 and the 视图 menu of the manuscript's context header (Issue #951, wave 12 slice 12a; V2-UX-ED-004 to ED-007,
// ED-020, VIEW-010 to VIEW-012). 专注模式 is per window and per session: never persisted, left with Esc or its visible
// restore control, and changed by nothing but the editor — a Run starting, pausing, asking or ending never enters or leaves
// it and never moves focus (ED-006). Entering and leaving write nothing at all (ED-005). While it holds, the stylesheet hides
// the sidebar, the supporting surfaces and the task entries through :root[data-focus-mode="on"]; the manuscript, the context
// header with its persistence status and any protection danger, and the restore control stay (ED-004, ED-058).

export interface FocusMode {
  readonly active: boolean;
  enter(): void;
  leave(): void;
  toggle(): void;
  subscribe(listener: (active: boolean) => void): () => void;
}

export function createFocusMode(root: () => Pick<HTMLElement, 'dataset'> | null): FocusMode {
  let active = false;
  const listeners = new Set<(active: boolean) => void>();
  const set = (next: boolean): void => {
    if (next === active) return;
    active = next;
    const node = root();
    if (node !== null) node.dataset['focusMode'] = active ? 'on' : 'off';
    for (const listener of listeners) listener(active);
  };
  return {
    get active() { return active; },
    enter: () => set(true),
    leave: () => set(false),
    toggle: () => set(!active),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The window's one 专注模式 — part of the layout API: 12b's panel reads `focusMode.active` and subscribes. */
export const focusMode: FocusMode = createFocusMode(() => (typeof document === 'undefined' ? null : document.documentElement));

export interface EditorModesOptions {
  /** The context header's `#context-view` slot. */
  readonly host: HTMLElement;
  readonly view: ViewPreferences;
  readonly focus: FocusMode;
  /** The manuscript has a position rail to show or hide (a Production Document has one too). */
  readonly rail: boolean;
  openNavigation(): void;
  /** Reopen the Book's 任务 panel; absent where the surface has none. */
  openTasks?(): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  shortcutHint(commandId: string): string | null;
}

export interface EditorModes {
  /** Where the protection surface stands: first in the slot, before the mode controls, so danger reads first. */
  readonly protectionHost: HTMLElement;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The context header's mode controls for the manuscript on screen: 专注 and 视图, with the protection surface beside them. */
export function mountEditorModes(options: EditorModesOptions): EditorModes {
  const { host, focus, view } = options;
  const protectionHost = el('div', 'editing-protection-host');
  const toggle = el('button', 'secondary focus-mode-toggle', FOCUS_MODE_LABEL);
  toggle.type = 'button';
  toggle.dataset['viewCommand'] = 'focus-mode';
  toggle.dataset['shortcutCommand'] = 'view.focusMode';
  toggle.setAttribute('aria-pressed', 'false');

  const menu = el('details', 'view-menu');
  menu.dataset['viewMenu'] = 'open';
  const summary = el('summary', 'secondary', VIEW_MENU_LABEL);
  summary.dataset['viewCommand'] = 'menu';
  const list = el('div', 'view-menu-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', VIEW_MENU_LABEL);
  const item = (label: string, command: string, run: () => void): HTMLButtonElement => {
    const button = el('button', 'quiet', label);
    button.type = 'button';
    button.dataset['viewCommand'] = command;
    button.addEventListener('click', () => {
      menu.open = false;
      run();
    });
    return button;
  };
  const focusItem = item(FOCUS_MODE_NAME, 'focus-mode-item', () => focus.toggle());
  focusItem.setAttribute('aria-pressed', 'false');
  const restoreHeading = el('p', 'view-menu-heading', VIEW_MENU_RESTORE_HEADING);
  const navigationItem = item(VIEW_MENU_ITEMS.navigation, 'show-navigation', () => {
    focus.leave();
    options.openNavigation();
  });
  const tasksItem = options.openTasks === undefined ? null : item(VIEW_MENU_ITEMS.tasks, 'show-tasks', () => {
    focus.leave();
    options.openTasks?.();
  });
  const railItem = options.rail ? item(VIEW_MENU_ITEMS.rail, 'toggle-rail', () => {
    const hidden = view.current.regions.hidden.includes('position-rail');
    void view.setRegionHidden('position-rail', !hidden).catch(() => options.setStatus(VIEW_SETTINGS_SAVE_FAILED, 'error'));
  }) : null;
  const restoreItem = item(VIEW_MENU_ITEMS.restoreLayout, 'restore-default-layout', () => {
    void view.restoreDefaultLayout().then(
      () => options.setStatus(RESTORED_DEFAULT_LAYOUT, 'success'),
      () => options.setStatus(VIEW_SETTINGS_SAVE_FAILED, 'error'),
    );
  });
  list.append(focusItem, restoreHeading, navigationItem, ...(tasksItem === null ? [] : [tasksItem]), ...(railItem === null ? [] : [railItem]),
    restoreItem, el('p', 'field-note', VIEW_MENU_NOTE));
  menu.append(summary, list);
  host.replaceChildren(protectionHost, toggle, menu);

  const paint = (): void => {
    const active = focus.active;
    toggle.setAttribute('aria-pressed', String(active));
    toggle.textContent = active ? FOCUS_MODE_EXIT : FOCUS_MODE_LABEL;
    const hint = options.shortcutHint('view.focusMode');
    toggle.title = active ? FOCUS_MODE_EXIT : `${FOCUS_MODE_ENTER_TITLE}${hint === null ? '' : `（${hint}）`}`;
    focusItem.setAttribute('aria-pressed', String(active));
    if (railItem !== null) railItem.setAttribute('aria-pressed', String(!view.current.regions.hidden.includes('position-rail')));
  };
  toggle.addEventListener('click', () => focus.toggle());
  const unsubscribeFocus = focus.subscribe((active) => {
    paint();
    options.setStatus(active ? FOCUS_MODE_ENTERED : FOCUS_MODE_LEFT);
  });
  const unsubscribeView = view.subscribe(paint);
  // Esc leaves 专注模式 — after any surface that answers Esc itself (导航, the protection options, an open menu), and never
  // while an input method composes, where Esc is the input method's (KEY-006).
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (menu.open) {
      event.preventDefault();
      menu.open = false;
      summary.focus();
      return;
    }
    if (!focus.active) return;
    event.preventDefault();
    focus.leave();
  };
  window.addEventListener('keydown', onKeydown);
  paint();
  return {
    protectionHost,
    destroy: () => {
      window.removeEventListener('keydown', onKeydown);
      unsubscribeFocus();
      unsubscribeView();
      // 专注模式 belongs to the manuscript on screen: leaving the screen leaves it.
      focus.leave();
      host.replaceChildren();
    },
  };
}
