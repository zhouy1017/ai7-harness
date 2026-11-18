import type { NavigationCheckpoint } from './navigation-generation.js';
import { showToast } from './components/toast.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewProjection, TaskOverviewItemProjection } from '../shared/protocol.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import { completionLabel, isOrdinaryOutcome, QUIET_NOTICE_WORDS } from './notification-labels.js';

export const QUIET_NOTICE_MS = 2_500;
export function showTransientNotice(message: string): void { showToast(message); }

/**
 * A result the editor should see that settles no standing error — a cancelled dialog, a refusal to open a page, a quick start
 * that fell back to a prepared plan: one toast, said once (the announcer says nothing), a busy line ended, an error left alone.
 */
export function reportResult(setStatus: (message: string) => void, message: string): void {
  setStatus('');
  showTransientNotice(message);
}

export type StatusTone = 'busy' | 'success' | 'error';
export interface StatusSurface {
  (message: string, tone?: StatusTone): void;
  /** A different destination was rendered: an error from the one before it no longer applies. */
  clearError(): void;
}

/**
 * The one status line. An error and a busy line stand in the bar until replaced, dismissed or (for an error) cleared by the
 * next `success` or a new destination; a `success` is also said once in a toast. A status without a tone is said once by the
 * announcer — a polite live region that is always in the accessibility tree and never on screen — and, while the bar is hidden,
 * its text stays in the bar's element for status readers; it shows no toast and no bar. An empty message shows nothing.
 * One owner per announcement: an update that does not concern the standing error leaves the error's text and its × button
 * the same nodes, so the bar's live region does not say the error again.
 */
export function createStatusSurface(surface: HTMLElement, announcer?: HTMLElement): StatusSurface {
  let error: string | null = null;
  let busy: string | null = null;
  const line = document.createElement('span');
  line.className = 'status-line';
  const errorText = document.createElement('span');
  const busyText = document.createElement('span');
  line.append(errorText, busyText);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn small quiet status-dismiss';
  dismiss.setAttribute('aria-label', '关闭错误提示');
  dismiss.title = '关闭错误提示';
  // The bar sits on the manuscript page's save menu trigger: closing the error must not toggle that menu.
  dismiss.addEventListener('click', (event) => { event.stopPropagation(); error = null; paint(''); });
  const write = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };
  /** `latest` is the line just said, kept in the hidden bar's element with its tone. */
  const paint = (latest: string, tone?: StatusTone): void => {
    if (line.parentElement !== surface) surface.replaceChildren(line);
    write(errorText, error ?? '');
    write(busyText, busy === null ? (error === null ? latest : '') : `${error === null ? '' : ' · '}${busy}`);
    if (error === null) dismiss.remove();
    else if (dismiss.parentElement !== surface) surface.append(dismiss);
    surface.hidden = error === null && busy === null;
    if (!surface.hidden) surface.dataset['tone'] = error !== null ? 'error' : 'busy';
    else if (tone) surface.dataset['tone'] = tone;
    else delete surface.dataset['tone'];
  };
  const update = (message: string, tone?: StatusTone): void => {
    if (message === '') busy = null;
    // A new error is said again even when its words repeat the standing one: the bar's text is replaced.
    else if (tone === 'error') { error = message; busy = null; errorText.textContent = message; }
    else if (tone === 'busy') busy = message;
    else {
      busy = null;
      if (tone === 'success') { error = null; showToast(message, { tone }); }
    }
    paint(message, tone);
    // Said once: a success by its toast, an error or busy line by the bar, any other line by the announcer.
    if (announcer !== undefined) announcer.textContent = tone === undefined ? message : '';
  };
  return Object.assign(update, { clearError: (): void => { if (error !== null) { error = null; paint(''); } } });
}

/**
 * The page's bottom controls (#1519): the manuscript's 向后浏览 and technical disclosure, a sticky action bar, and developer
 * mode's fixed technical-details control. The bar is an
 * overlay at the bottom of the content area that reserves nothing while hidden; while it shows it stands above each of these
 * that is in the lower half of the window, and on the manuscript it keeps to the text column (clear of the right edge, the
 * supporting regions and an overlaying Task Drawer). The page publishes that clearance as `--bottom-controls`; the scroll
 * padding that lets a page's last line be scrolled clear of the bar applies only while `data-status-bar="shown"`.
 */
const BOTTOM_CONTROLS = '#screen .commit-bar, #screen .workbench-actions, #screen .task-overview-confirm:not([hidden]), #screen .window-actions .btn:not([hidden]), #screen .editor-identities, .technical-layer-control';
const STATUS_AREA = '#screen .manuscript-surface';

export function followBottomControls(bar: HTMLElement): void {
  const root = document.documentElement;
  let queued = false;
  // The bar's own frame source, taken as it mounts: placing it is not one of the frames a page's paint waits for (J-01 holds
  // those and counts the completion's alone).
  const nextFrame = window.requestAnimationFrame.bind(window);
  const place = (): void => {
    queued = false;
    if (bar.hidden) {
      delete root.dataset['statusBar'];
      for (const name of ['--bottom-controls', '--status-area-right', '--status-bar-height']) root.style.removeProperty(name);
      return;
    }
    const area = document.querySelector(STATUS_AREA)?.getBoundingClientRect();
    let clearance = area === undefined ? 0 : innerHeight - area.bottom;
    for (const control of document.querySelectorAll<HTMLElement>(BOTTOM_CONTROLS)) {
      const box = control.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && box.bottom > innerHeight / 2 && box.top < innerHeight) clearance = Math.max(clearance, innerHeight - box.top);
    }
    root.style.setProperty('--bottom-controls', `${Math.max(0, Math.ceil(clearance))}px`);
    root.style.setProperty('--status-area-right', `${area === undefined ? 0 : Math.max(0, Math.ceil(innerWidth - area.right))}px`);
    root.style.setProperty('--status-bar-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    // The first placement adds the scroll padding and the space above a sticky bar, which moves the controls once more.
    const first = root.dataset['statusBar'] !== 'shown';
    root.dataset['statusBar'] = 'shown';
    if (first) schedule();
  };
  // Only while the bar shows (and once more as it hides) is anything measured: once per frame in a visible window, and in a
  // microtask in a background one (it has no frames), so it still places its bar.
  const schedule = (): void => {
    if (queued || (bar.hidden && root.dataset['statusBar'] === undefined)) return;
    queued = true;
    if (document.hidden) queueMicrotask(place);
    else nextFrame(place);
  };
  new MutationObserver(schedule).observe(bar, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
  new ResizeObserver(schedule).observe(bar);
  addEventListener('resize', schedule);
  // A frame asked for just before the window went to the background never comes: place the bar now instead.
  document.addEventListener('visibilitychange', () => { if (queued) place(); });
  // The body's padding eases when the drawer docks or the sidebar folds: the text column's edge is final only when that ends.
  document.body.addEventListener('transitionend', (event) => { if (event.target === document.body) schedule(); });
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  // A page change, the sidebar folding or the Task Drawer opening moves the controls without a scroll or a resize.
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-sidebar', 'data-focus-mode'] });
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-task-drawer'], childList: true, subtree: true });
}

/** Observe the existing attention projection; history and its count remain owned by that projection. */
export function createNotificationObserver(options: {
  api: Pick<NotificationsRendererApi, 'notify'>;
  focused(): boolean;
  completed(item: GlobalAttentionItemProjection): void;
  startedAt?: number;
}) {
  const startedAt = options.startedAt ?? Date.now();
  const seen = new Set<string>();
  return (projection: GlobalAttentionProjection): void => {
    for (const group of projection.groups) for (const item of group.items) {
      if (!['exceptions', 'decisions', 'recent'].includes(item.group)) continue;
      const key = `${item.itemId}:${item.state}:${item.at}`;
      const at = Date.parse(item.at);
      if (!Number.isFinite(at) || at <= startedAt || seen.has(key)) continue;
      seen.add(key);
      if (item.group === 'recent' && !isOrdinaryOutcome(item, projection)) continue;
      void options.api.notify({ bookId: item.book.bookId, eventId: item.itemId }).catch(() => {
        // Notifications are optional; durable attention and the authoritative record remain available.
      });
      if (item.group === 'recent' && options.focused()) options.completed(item);
    }
  };
}

/** Completion notices share the ordinary transient-message capsule. */
export function mountQuietNotice(open: (item: GlobalAttentionItemProjection) => void): (item: GlobalAttentionItemProjection) => void {
  return (item) => showToast(completionLabel(item), { tone: item.state, action: { label: QUIET_NOTICE_WORDS.view, run: () => open(item) } });
}

/** Automatic results belong to the task surface that received the completion, never a later destination. */
export async function openCurrentBookCompletion(item: GlobalAttentionItemProjection, options: {
  allowed(item: GlobalAttentionItemProjection): boolean; enabled(): boolean; navigation: NavigationCheckpoint;
  read(): Promise<TaskOverviewProjection>; open(entry: TaskOverviewItemProjection): void;
}): Promise<void> {
  const current = (): boolean => item.book.bookId !== null && options.navigation.isCurrent() && options.allowed(item) && options.enabled() &&
    !document.querySelector('[data-testid="manuscript-editor"]')?.contains(document.activeElement);
  if (!current()) return;
  const tasks = await options.read();
  if (!current()) return;
  const entry = tasks.groups.flatMap((group) => group.items).find((entry) => entry.itemId === item.itemId);
  if (entry) options.open(entry);
}
