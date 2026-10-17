import type { GlobalAttentionItemProjection } from '../shared/protocol.js';
import type { NotificationNavigation, PreferenceValues } from '../shared/preferences.js';
import { notificationClass, systemNoticeSuffix, systemNoticeText } from '../renderer/notification-labels.js';

export const NOTIFICATION_CHANNELS = Object.freeze({ notify: 'ai7:notify', navigate: 'ai7:notification-navigate' });

export interface SystemNotice {
  show(): void;
  close(): void;
  on(event: 'click', listener: () => void): unknown;
}

/** One main-process session, shared by every window. The caller supplies authoritative attention items only. */
export function createNotifier(options: {
  preferences(): PreferenceValues;
  focused(): boolean;
  factory(input: { title: string; body: string; silent: boolean }): SystemNotice;
  navigate(target: NotificationNavigation): void;
  startedAt?: number;
}) {
  const startedAt = options.startedAt ?? Date.now();
  const seen = new Set<string>();
  const books = new Map<string | null, { items: Map<string, GlobalAttentionItemProjection>; notice: SystemNotice }>();
  return {
    accept(item: GlobalAttentionItemProjection, currentItems?: ReadonlyArray<GlobalAttentionItemProjection>): void {
      if (!['exceptions', 'decisions', 'recent'].includes(item.group)) return;
      const identity = `${item.itemId}:${item.state}:${item.at}`;
      const at = Date.parse(item.at);
      if (!Number.isFinite(at) || at <= startedAt || seen.has(identity)) return;
      // Consume even suppressed events: focus changes and preference changes never replay a backlog.
      seen.add(identity);
      const prefs = options.preferences();
      if (!prefs['notifications.enabled'] || options.focused() ||
          (item.group === 'recent' && !prefs['notifications.completions'])) return;
      const previous = books.get(item.book.bookId);
      const currentIds = currentItems === undefined ? null : new Set(currentItems
        .filter((entry) => ['exceptions', 'decisions', 'recent'].includes(entry.group)).map((entry) => entry.itemId));
      const items = new Map([...(previous?.items ?? [])].filter(([id]) => currentIds === null || currentIds.has(id)));
      items.set(item.itemId, item);
      // A coalesced notice names its most pressing class: failure, then 结果待确认, then a pending decision.
      const classes = new Set([...items.values()].map(notificationClass));
      const lead = (['failure', 'ambiguous', 'pending'] as const).find((key) => classes.has(key));
      const body = systemNoticeText(lead ?? notificationClass(item)) +
        systemNoticeSuffix(prefs['notifications.bookName'] ? item.book.title || null : null, items.size);
      const notice = options.factory({ title: 'AI7', body, silent: !prefs['notifications.sound'] });
      notice.on('click', () => {
        if (books.get(item.book.bookId)?.notice === notice) books.delete(item.book.bookId);
        options.navigate({
          bookId: item.book.bookId,
          eventId: items.size === 1 ? item.itemId : null,
          ...(items.size === 1 ? { target: item.target } : {}),
        });
      });
      previous?.notice.close();
      books.set(item.book.bookId, { items, notice });
      notice.show();
    },
    dispose(): void {
      for (const entry of books.values()) entry.notice.close();
      books.clear();
    },
  };
}
