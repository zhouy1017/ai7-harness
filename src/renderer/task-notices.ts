import { navigation } from './navigation-generation.js';
import { AUTO_RESULT_KEY, createNotificationObserver, mountAttentionNotice, mountQuietNotice, openCurrentBookCompletion } from './notifications.js';
import { attentionKind } from './notification-labels.js';
import type { GlobalAttentionReader } from './global-attention.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import type { GlobalAttentionItemProjection, RendererApi, TaskOverviewItemProjection } from '../shared/protocol.js';
import type { TaskDrawerSurface } from './task-drawer.js';

export interface TaskNoticeOptions {
  api: Pick<RendererApi, 'inspectTaskOverview'> & Pick<NotificationsRendererApi, 'notify'>;
  reader: GlobalAttentionReader;
  screen: HTMLElement;
  drawerView: TaskDrawerSurface['view'];
  /** 查看结果: a finished task's result, in place. */
  openResult(item: GlobalAttentionItemProjection): void;
  /** 去处理: the record a task that stopped for the editor waits at. */
  openAttention(item: GlobalAttentionItemProjection): void;
  /** Several at once: 待我处理, narrowed to the Book when they are all its. */
  openList(bookId: string | undefined): void;
  /** The automatic result window of 0.7.2 (#1510): not a navigation. */
  openWindow(entry: TaskOverviewItemProjection): void;
}

/**
 * The notices of 待我处理's tasks (#1528): a completion in the foreground says so in the quiet toast and, where the editor is
 * watching that task, opens its result window as it did in 0.7.2; a task that stopped for the editor stays in its own notice
 * until closed; and what happened while the window was in the background is said once on return. None takes focus or navigates.
 */
export function mountTaskNotices(options: TaskNoticeOptions): void {
  const { screen } = options;
  const showQuietNotice = mountQuietNotice((item) => options.openResult(item));
  const notice = mountAttentionNotice((items) => {
    const [only] = items;
    if (items.length === 1 && only !== undefined) { if (attentionKind(only) === null) options.openResult(only); else options.openAttention(only); return; }
    const books = new Set(items.map((item) => item.book.bookId));
    options.openList(books.size === 1 ? items[0]?.book.bookId ?? undefined : undefined);
  });

  /** Automatic results stay with the task being watched; an open review already shows its own result. */
  function canAutoOpenTaskResult(item: GlobalAttentionItemProjection): boolean {
    const bookId = item.book.bookId;
    if (bookId === null || document.querySelector('dialog[open]') !== null) return false;
    const target = item.target;
    const ref = 'taskIntentId' in target ? target.taskIntentId : 'reviewRunId' in target ? target.reviewRunId : 'ref' in target ? target.ref : null;
    const review = target.kind === 'review' || target.kind === 'review-plan' || target.kind === 'task-plan' && target.taskKind === 'review-run';
    if (review && screen.dataset['screen'] === 'book-review' && screen.querySelector<HTMLElement>('.review-run')?.dataset['reviewRunId'] === ref) return false;
    const view = options.drawerView();
    if (view !== null) return view.bookId === bookId && (view.kind === 'panel' || view.kind === 'plan' && ref !== null && view.task.ref === ref);
    return screen.dataset['screen'] === 'task-overview';
  }

  // The window in the background: what the observer finds is collected, and said once at the first reading after it returns.
  let returning = false;
  let standing = new Set<string>();
  let finished: GlobalAttentionItemProjection[] = [];
  let needing: GlobalAttentionItemProjection[] = [];
  window.addEventListener('focus', () => { returning = finished.length + needing.length > 0; });

  const observe = createNotificationObserver({
    api: options.api,
    focused: () => document.hasFocus() && !returning,
    completed: (item) => {
      showQuietNotice(item);
      void openCurrentBookCompletion(item, {
        allowed: canAutoOpenTaskResult, navigation: navigation.route(),
        enabled: () => localStorage.getItem(AUTO_RESULT_KEY) !== 'off',
        read: () => options.api.inspectTaskOverview(), open: (entry) => options.openWindow(entry),
      }).catch(() => undefined);
    },
    attention: (item) => notice.raise(item),
    away: (item, kind) => { (kind === 'completed' ? finished : needing).push(item); },
    standing: (items) => { standing = new Set(items.map((item) => item.itemId)); notice.settle(standing); },
  });
  options.reader.subscribe((reading) => {
    if (reading.kind !== 'projection') return;
    observe(reading.projection);
    if (!returning) return;
    returning = false;
    const waiting = needing.filter((item) => standing.has(item.itemId));
    const done = finished;
    finished = []; needing = [];
    if (waiting.length + done.length > 0) notice.summarize(done, waiting);
  });
}
