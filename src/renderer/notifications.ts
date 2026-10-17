import type { GlobalAttentionItemProjection, GlobalAttentionProjection } from '../shared/protocol.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import { completionLabel, isOrdinaryOutcome } from './notification-labels.js';

export const QUIET_NOTICE_MS = 6_000;

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

/** One in-app notice. Hover/focus pauses the remaining six-second reading time. */
export function mountQuietNotice(open: (item: GlobalAttentionItemProjection) => void): (item: GlobalAttentionItemProjection) => void {
  const host = document.createElement('aside');
  host.dataset['quietCompletionNotice'] = 'true';
  host.setAttribute('aria-label', '最近完成提示');
  host.hidden = true;
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const view = document.createElement('button');
  view.type = 'button';
  view.textContent = '查看结果';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭提示';
  host.append(status, view, close);
  // Reuse shell surface roles without adding another styling owner.
  host.className = 'panel button-row quiet-completion-notice';
  document.body.append(host);
  let current: GlobalAttentionItemProjection | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = QUIET_NOTICE_MS;
  let since = 0;
  let paused = false;
  const hide = (): void => { clearTimeout(timer); host.hidden = true; current = null; };
  const pause = (): void => {
    if (!paused) remaining = Math.max(0, remaining - (Date.now() - since));
    paused = true;
    clearTimeout(timer);
  };
  const resume = (): void => {
    clearTimeout(timer);
    if (host.hidden || host.matches(':hover') || host.contains(document.activeElement)) return;
    since = Date.now();
    paused = false;
    timer = setTimeout(hide, remaining);
  };
  host.addEventListener('mouseenter', pause);
  host.addEventListener('mouseleave', resume);
  host.addEventListener('focusin', pause);
  host.addEventListener('focusout', () => queueMicrotask(resume));
  close.addEventListener('click', hide);
  view.addEventListener('click', () => { const item = current; hide(); if (item) open(item); });
  return (item) => {
    clearTimeout(timer);
    current = item;
    status.textContent = completionLabel(item);
    host.dataset['noticeClass'] = item.state;
    host.hidden = false;
    remaining = QUIET_NOTICE_MS;
    since = Date.now();
    paused = false;
    resume();
  };
}
