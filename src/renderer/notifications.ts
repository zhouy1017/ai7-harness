import type { GlobalAttentionItemProjection, GlobalAttentionProjection } from '../shared/protocol.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import { completionLabel, isOrdinaryOutcome, QUIET_NOTICE_WORDS } from './notification-labels.js';

export const QUIET_NOTICE_MS = 2_500;

let showMessage: (message: string) => void = () => {};

/** Show a transient editor notice in the same capsule as completion notices. */
export function showTransientNotice(message: string): void { showMessage(message); }

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

/** One in-app notice, replaced by the latest completion and dismissed after 2.5 seconds. */
export function mountQuietNotice(open: (item: GlobalAttentionItemProjection) => void): (item: GlobalAttentionItemProjection) => void {
  const host = document.createElement('aside');
  host.dataset['quietCompletionNotice'] = 'true';
  host.setAttribute('aria-label', QUIET_NOTICE_WORDS.region);
  host.hidden = true;
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const view = document.createElement('button');
  view.type = 'button';
  view.textContent = QUIET_NOTICE_WORDS.view;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = QUIET_NOTICE_WORDS.close;
  host.append(status, view, close);
  // Reuse shell surface roles without adding another styling owner.
  host.className = 'panel button-row quiet-completion-notice status-pill';
  document.body.append(host);
  let current: GlobalAttentionItemProjection | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => { clearTimeout(timer); host.hidden = true; current = null; delete status.dataset['entryNotice']; };
  showMessage = (message) => {
    clearTimeout(timer);
    current = null;
    view.hidden = true;
    status.textContent = message;
    status.dataset['entryNotice'] = 'visible';
    host.hidden = false;
    timer = setTimeout(hide, QUIET_NOTICE_MS);
  };
  close.addEventListener('click', hide);
  view.addEventListener('click', () => { const item = current; hide(); if (item) open(item); });
  return (item) => {
    clearTimeout(timer);
    current = item;
    view.hidden = false;
    delete status.dataset['entryNotice'];
    status.textContent = completionLabel(item);
    host.dataset['noticeClass'] = item.state;
    host.hidden = false;
    timer = setTimeout(hide, QUIET_NOTICE_MS);
  };
}
