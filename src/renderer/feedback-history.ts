import type { FeedbackHistoryInput, FeedbackHistoryEntryProjection, FeedbackHistoryPeopleVersion, FeedbackHistoryProjection, FeedbackHistoryTarget, RendererApi } from '../shared/protocol.js';
import {
  FEEDBACK_HISTORY_ALL,
  FEEDBACK_HISTORY_DETACHED,
  FEEDBACK_HISTORY_EMPTY,
  FEEDBACK_HISTORY_FILTERS,
  FEEDBACK_HISTORY_NONE_MATCH,
  FEEDBACK_HISTORY_NOTE,
  FEEDBACK_HISTORY_OPEN,
  FEEDBACK_HISTORY_STATUS,
  FEEDBACK_HISTORY_TRUNCATED,
  FEEDBACK_ORIGIN_LABELS,
  feedbackAttributionLine,
  feedbackEntryLine,
  feedbackReasonLine,
  learningPeopleLine,
} from './quality-learning-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 质量与学习 › 反馈历史 (Issue #61, plan slice S26c; V2-UX-FDBK-009, FDBK-010, FDBK-013): every piece of the editor's feedback,
 * grouped by Book with its 作者 and 责编, newest first — where it came from, what it is about, what they decided or judged,
 * and the reason as it stands — filtered by 图书, 来源, 作者 and 责编, each opening the exact record it came from. Passive
 * history: nothing is pending, counted or asked for again.
 *
 * Each entry is attributed to the Book's people as they stood when it was given (Issue #61 review): 作者 and 责编 filter by
 * those, their choices are the names any entry here is attributed to, and an entry whose people are not the Book's now says
 * whose it is.
 */
export interface MountFeedbackHistoryOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectFeedbackHistory'>;
  /** Open the record an entry came from, in its Book. */
  readonly open: (target: FeedbackHistoryTarget) => Promise<void>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Filter = 'book' | 'origin' | 'author' | 'editor';

export function mountFeedbackHistory(options: MountFeedbackHistoryOptions): { load(): Promise<void> } {
  const { root, api, open, setStatus, errorMessage } = options;
  root.classList.add('feedback-history');
  let projection: FeedbackHistoryProjection | null = null;
  /** The filters as the editor set them; `''` is 全部. They outlive a repaint, never the page. */
  let chosen: Record<Filter, string> = { book: '', origin: '', author: '', editor: '' };
  let opening = false;
  let loading = false;
  let after: FeedbackHistoryInput['after'] = null;
  let selectedBookLabel = '所选图书';

  const peopleOf = (entry: FeedbackHistoryEntryProjection): FeedbackHistoryPeopleVersion | null =>
    projection?.books.find((book) => book.bookId === entry.bookId)?.peopleVersions.find((version) => version.version === entry.peopleVersion) ?? null;
  const select = (filter: Filter, choices: ReadonlyArray<readonly [string, string]>): HTMLLabelElement => {
    const wrapper = el('label', 'feedback-filter');
    const control = el('select');
    control.id = `feedback-filter-${filter}`;
    control.dataset['feedbackFilter'] = filter;
    for (const [value, label] of [['', FEEDBACK_HISTORY_ALL] as const, ...choices]) {
      const option = el('option', undefined, label);
      option.value = value;
      control.append(option);
    }
    if (chosen[filter] !== '' && !choices.some(([value]) => value === chosen[filter])) {
      const option = el('option', undefined, filter === 'book' ? selectedBookLabel : chosen[filter]);
      option.value = chosen[filter];
      control.append(option);
    }
    control.value = chosen[filter];
    control.disabled = loading || opening;
    control.addEventListener('change', () => {
      if (loading || opening) return;
      if (filter === 'book') selectedBookLabel = control.selectedOptions[0]?.textContent ?? '所选图书';
      void request({ ...chosen, [filter]: control.value }, null, `#feedback-filter-${filter}`);
    });
    wrapper.append(el('span', undefined, FEEDBACK_HISTORY_FILTERS[filter]), control);
    return wrapper;
  };

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    const parts: HTMLElement[] = [el('p', 'field-note feedback-history-note', FEEDBACK_HISTORY_NOTE)];
    const versions = projection.books.flatMap((book) => book.peopleVersions);
    const authors = [...new Set(versions.flatMap((version) => version.authors))];
    const editors = [...new Set(versions.flatMap((version) => version.editors))];
    const filters = el('div', 'feedback-filters');
    filters.append(
      select('book', projection.books.map((book) => [book.bookId, `《${book.title}》`] as const)),
      select('origin', (Object.keys(FEEDBACK_ORIGIN_LABELS) as Array<keyof typeof FEEDBACK_ORIGIN_LABELS>).map((origin) => [origin, FEEDBACK_ORIGIN_LABELS[origin]] as const)),
      select('author', authors.map((name) => [name, name] as const)),
      select('editor', editors.map((name) => [name, name] as const)),
    );
    parts.push(filters);
    const shown = projection.entries;
    root.dataset['feedbackEntries'] = String(shown.length);
    if (shown.length === 0) {
      const none = el('p', 'field-note feedback-history-none', Object.values(chosen).every((value) => value === '') && after == null ? FEEDBACK_HISTORY_EMPTY : FEEDBACK_HISTORY_NONE_MATCH);
      none.setAttribute('role', 'status');
      parts.push(none);
    }
    for (const book of projection.books) {
      const entries = shown.filter((entry) => entry.bookId === book.bookId);
      if (entries.length === 0) continue;
      const section = el('section', 'feedback-book');
      section.dataset['bookId'] = book.bookId;
      section.append(el('h3', undefined, `《${book.title}》 · ${entries.length} 条`), el('p', 'field-note feedback-people', learningPeopleLine(book)));
      const list = el('ul', 'feedback-entries');
      const now = learningPeopleLine(book);
      for (const entry of entries) {
        const item = el('li', 'feedback-entry');
        item.dataset['entryId'] = entry.entryId;
        item.dataset['feedbackOrigin'] = entry.origin;
        item.dataset['reasonState'] = entry.reasonState;
        item.dataset['peopleVersion'] = String(entry.peopleVersion);
        item.append(
          el('p', 'feedback-entry-line', feedbackEntryLine(entry)),
          el('p', 'feedback-entry-reason', feedbackReasonLine(entry)),
          el('p', 'field-note feedback-entry-time', `记录于 ${localInstantLabel(entry.recordedAt)}`),
        );
        const people = peopleOf(entry);
        if (people !== null && learningPeopleLine(people) !== now) item.append(el('p', 'field-note feedback-entry-people', feedbackAttributionLine(people)));
        if (entry.target.kind === 'mark' && entry.target.detached) {
          item.append(el('p', 'field-note feedback-entry-detached', FEEDBACK_HISTORY_DETACHED));
        } else {
          const go = el('button', 'button quiet', FEEDBACK_HISTORY_OPEN);
          go.type = 'button';
          go.dataset['feedbackAction'] = 'open';
          go.setAttribute('aria-label', `${FEEDBACK_HISTORY_OPEN.replace('…', '')}：${feedbackEntryLine(entry)}`);
          go.disabled = opening || loading;
          go.addEventListener('click', () => void openEntry(entry));
          item.append(go);
        }
        list.append(item);
      }
      section.append(list);
      parts.push(section);
    }
    if (projection.truncated) parts.push(el('p', 'field-note feedback-history-truncated', FEEDBACK_HISTORY_TRUNCATED));
    const navigation = el('div', 'feedback-history-navigation');
    const next = el('button', 'button quiet', '更早的记录');
    next.type = 'button';
    next.dataset['feedbackAction'] = 'next';
    next.disabled = loading || opening || !projection.truncated;
    next.addEventListener('click', () => {
      const last = projection?.entries.at(-1);
      if (last !== undefined) void request(chosen, { recordedAt: last.recordedAt, entryId: last.entryId }, '[data-feedback-action="next"]');
    });
    const reset = el('button', 'button quiet', '回到最新记录');
    reset.type = 'button';
    reset.dataset['feedbackAction'] = 'reset';
    reset.disabled = loading || opening || after == null;
    reset.addEventListener('click', () => void request(chosen, null, '[data-feedback-action="reset"]'));
    navigation.append(next, reset);
    parts.push(navigation);
    root.replaceChildren(...parts);
    if (focus !== null) {
      const target = root.querySelector<HTMLElement>(focus);
      if (target?.matches(':disabled') === false) target.focus();
      else root.querySelector<HTMLElement>('[data-feedback-action="reset"]:not(:disabled), [data-feedback-action="next"]:not(:disabled), #feedback-filter-book')?.focus();
    }
  };

  const request = async (filters: Record<Filter, string>, cursor: FeedbackHistoryInput['after'], focus: string | null): Promise<void> => {
    if (loading || opening) return;
    loading = true;
    paint(null);
    try {
      const result = await api.inspectFeedbackHistory({ bookId: filters.book || null,
        origin: filters.origin === 'proposal-decision' || filters.origin === 'analysis-feedback' || filters.origin === 'review-disposition' ? filters.origin : null,
        author: filters.author || null,
        editor: filters.editor || null, after: cursor ?? null });
      if (!root.isConnected) return;
      projection = result;
      chosen = { ...filters };
      after = cursor;
    } catch (error) {
      if (root.isConnected) setStatus(errorMessage(error, FEEDBACK_HISTORY_STATUS.openFailed), 'error');
    } finally {
      loading = false;
      if (root.isConnected) paint(focus);
    }
  };

  const openEntry = async (entry: FeedbackHistoryEntryProjection): Promise<void> => {
    if (opening || loading) return;
    opening = true;
    setStatus(FEEDBACK_HISTORY_STATUS.opening, 'busy');
    try {
      await open(entry.target);
    } catch (error) {
      setStatus(errorMessage(error, FEEDBACK_HISTORY_STATUS.openFailed), 'error');
    } finally {
      opening = false;
      if (root.isConnected) paint(null);
    }
  };

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', FEEDBACK_HISTORY_STATUS.loading));
      await request(chosen, null, null);
    },
  };
}
