import type { GlobalAttentionItemProjection } from '../shared/protocol.js';
import type { NotificationNavigation, PreferenceValues } from '../shared/preferences.js';
import { completionLabel, NOTIFICATION_LABELS } from '../renderer/notification-labels.js';

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
      const abnormal = [...items.values()].some((entry) => entry.group === 'exceptions');
      const decision = [...items.values()].some((entry) => entry.group === 'decisions');
      let body = abnormal ? NOTIFICATION_LABELS.abnormal : decision ? NOTIFICATION_LABELS.decision : `AI7：${completionLabel(item)}`;
      if (prefs['notifications.bookName'] && item.book.title) body += ` · ${item.book.title}`;
      if (items.size > 1) body += ` · 共 ${items.size} 项`;
      const notice = options.factory({ title: 'AI7', body, silent: !prefs['notifications.sound'] });
      notice.on('click', () => {
        books.delete(item.book.bookId);
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
