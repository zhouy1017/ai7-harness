import { showToast } from './components/toast.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewProjection, TaskOverviewItemProjection } from '../shared/protocol.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import { completionLabel, isOrdinaryOutcome, QUIET_NOTICE_WORDS } from './notification-labels.js';

export const QUIET_NOTICE_MS = 2_500;
export function showTransientNotice(message: string): void { showToast(message); }

/** Persistent status and transient notices share the same renderer entry point. */
export function createStatusSurface(surface: HTMLElement): (message: string, tone?: 'busy' | 'success' | 'error') => void {
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
      dismiss.addEventListener('click', () => { error = null; paint(); });
      surface.append(dismiss);
    }
  };
  return (message, tone) => {
    if (tone === 'error') { error = message; busy = null; }
    else if (tone === 'busy') busy = message;
    else {
      busy = null;
      showToast(message, tone === undefined ? {} : { tone });
    }
    paint();
    // Keep the latest ordinary status available to existing status readers.
    if (surface.hidden) {
      surface.textContent = message;
      if (tone) surface.dataset['tone'] = tone;
      else delete surface.dataset['tone'];
    }
  };
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

/** A completion read may finish after the editor switches Books, resumes writing or turns automatic results off. */
export async function openCurrentBookCompletion(item: GlobalAttentionItemProjection, options: {
  currentBookId(): string | null; enabled(): boolean; read(): Promise<TaskOverviewProjection>; open(entry: TaskOverviewItemProjection): void;
}): Promise<void> {
  const current = (): boolean => item.book.bookId !== null && options.currentBookId() === item.book.bookId && options.enabled() &&
    !document.querySelector('[data-testid="manuscript-editor"]')?.contains(document.activeElement);
  if (!current()) return;
  const tasks = await options.read();
  if (!current()) return;
  const entry = tasks.groups.flatMap((group) => group.items).find((entry) => entry.itemId === item.itemId);
  if (entry) options.open(entry);
}
