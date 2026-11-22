import type { TaskOverviewProjection } from '../shared/protocol.js';
import type { GlobalAttentionReader } from './global-attention.js';
import { taskInProgress } from './task-card-view.js';

/**
 * 任务's sidebar number (Issue #1680; item 8.2 of #1539): the tasks in progress — running and queued — and nothing 待我处理 counts,
 * so a failed analysis is never counted twice. One function for the two places that draw it: the shell's own reading and the
 * 任务 page's projection.
 */
export function taskNavigationCount(projection: Pick<TaskOverviewProjection, 'groups'>, bookId?: string | null): number {
  return projection.groups.flatMap((group) => group.items).filter((item) => (bookId === undefined || item.bookId === bookId) && taskInProgress(item.attention.state)).length;
}

export function taskNavigationName(count: number): string {
  return `任务，${count} 项任务正在进行`;
}

export function paintTaskNavigationBadge(badge: HTMLElement, projection: Pick<TaskOverviewProjection, 'groups'>): void {
  const count = taskNavigationCount(projection);
  badge.textContent = count > 0 ? String(count) : '';
  badge.hidden = count === 0;
  const link = badge.parentElement;
  if (link === null) return;
  if (count > 0) link.setAttribute('aria-label', taskNavigationName(count));
  else link.removeAttribute('aria-label');
}

/** The badge on the sidebar's 任务, read again on every attention reading (Issue #1328). */
export function mountTaskNavigationBadge(link: HTMLElement | null, reader: GlobalAttentionReader, make: () => HTMLSpanElement): HTMLSpanElement {
  const badge = make();
  badge.classList.add('task-navigation-badge');
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;
  if (link === null) return badge;
  link.append(badge);
  reader.subscribe((reading) => {
    if (reading.kind === 'projection') paintTaskNavigationBadge(badge, reading.tasks);
  });
  return badge;
}
