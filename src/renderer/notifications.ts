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
 * announcer — a polite live region that is always in the accessibility tree and never on screen — and its text stays in the
 * bar's element for status readers; it shows no toast and no bar. An empty message shows nothing.
 */
export function createStatusSurface(surface: HTMLElement, announcer?: HTMLElement): StatusSurface {
  let error: string | null = null;
  let busy: string | null = null;
  const paint = (): void => {
    surface.textContent = [error, busy].filter((message) => message !== null).join(' · ');
    surface.hidden = error === null && busy === null;
    surface.dataset['tone'] = error !== null ? 'error' : 'busy';
    if (error !== null) {
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'btn small quiet status-dismiss';
      dismiss.setAttribute('aria-label', '关闭错误提示');
      dismiss.title = '关闭错误提示';
      // The bar sits on the manuscript page's save menu trigger: closing the error must not toggle that menu.
      dismiss.addEventListener('click', (event) => { event.stopPropagation(); error = null; paint(); });
      surface.append(dismiss);
    }
  };
  const update = (message: string, tone?: StatusTone): void => {
    if (message === '') busy = null;
    else if (tone === 'error') { error = message; busy = null; }
    else if (tone === 'busy') busy = message;
    else {
      busy = null;
      if (tone === 'success') { error = null; showToast(message, { tone }); }
    }
    paint();
    // Said once: a success by its toast, an error or busy line by the bar, any other line by the announcer.
    if (announcer !== undefined) announcer.textContent = tone === undefined ? message : '';
    // The latest ordinary status stays in the bar's element for existing status readers (it is not on screen while hidden).
    if (surface.hidden) {
      surface.textContent = message;
      if (tone) surface.dataset['tone'] = tone;
      else delete surface.dataset['tone'];
    }
  };
  return Object.assign(update, { clearError: (): void => { if (error !== null) { error = null; paint(); } } });
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
