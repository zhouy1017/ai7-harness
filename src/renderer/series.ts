import type {
  BookSeriesProjection,
  RendererApi,
  SeriesCandidatesCursor,
  SeriesImpactGroupProjection,
  SeriesListProjection,
  SeriesSummaryProjection,
  SeriesMembershipChangeKind,
  SeriesMembershipChangeProjection,
  SeriesMembershipPreviewProjection,
  SeriesProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  BOOK_SERIES_HEADING,
  BOOK_SERIES_HISTORY,
  BOOK_SERIES_NONE,
  SERIES_ADD_LEGEND,
  SERIES_ADD_MORE,
  SERIES_ADD_NO_BOOKS,
  SERIES_ADD_NO_MATCH,
  SERIES_ADD_NONE,
  SERIES_ADD_OPEN,
  SERIES_ADD_SEARCH,
  SERIES_ADD_SEARCH_LABEL,
  SERIES_CANCEL,
  SERIES_CHANGES_LABEL,
  SERIES_CREATE,
  SERIES_CREATE_OPEN,
  SERIES_EMPTY,
  SERIES_HISTORY_EMPTY,
  SERIES_HISTORY_HEADING,
  SERIES_HISTORY_IMPACT,
  SERIES_HISTORY_MORE,
  SERIES_LIST_MORE,
  SERIES_MEMBER_COLUMNS,
  SERIES_MEMBERS_EMPTY,
  SERIES_MEMBERS_HEADING,
  SERIES_MEMBERS_MORE,
  SERIES_NAME_LABEL,
  SERIES_NO_CHANGE,
  SERIES_NOTE_LABEL,
  SERIES_PREVIEW_ACTION,
  SERIES_REFRESH,
  SERIES_REMOVE_OPEN,
  SERIES_SCOPE_NOTE,
  SERIES_STATUS,
  SERIES_UNCHANGED_LABEL,
  bookSeriesChangeLine,
  bookSeriesMembershipLine,
  bookSeriesMoreLine,
  seriesChangeByline,
  seriesChangeLine,
  seriesConsistencyLine,
  seriesListLine,
  seriesPeopleLine,
  seriesPreviewHeading,
  seriesPreviewIdentity,
} from './series-labels.js';

/**
 * 书系 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012): the house's Series with 新建书系, one Series' 成员与共享范围 —
 * its members, 加入书系 and 移出书系 through the four-part impact preview, and the change records — and a Book's own side.
 * Membership changes nothing but later explicit Series-scope selection; the page says so and never reads a member's text.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['seriesAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function alertNode(message: string): HTMLElement {
  const alert = el('p', 'attention-note series-refusal', message);
  alert.setAttribute('role', 'alert');
  return alert;
}

/** Escape closes an open form or preview unless an input method is composing (J-14). */
function onEscape(root: HTMLElement, cancel: () => void): void {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    cancel();
  });
}

/** One consequence group of a preview or of a record: what changes, and what stays as it is (SER-003). */
export function renderImpactGroup(group: SeriesImpactGroupProjection, heading: 'h4' | 'h5'): HTMLElement {
  const box = el('div', 'series-impact-group');
  box.dataset['impactGroup'] = group.key;
  box.append(el(heading, undefined, group.title));
  const changes = el('div', 'series-impact-changes');
  changes.append(el('p', 'series-impact-label', SERIES_CHANGES_LABEL));
  if (group.changes.length === 0) changes.append(el('p', 'field-note', SERIES_NO_CHANGE));
  else {
    const list = el('ul');
    for (const line of group.changes) list.append(el('li', undefined, line));
    changes.append(list);
  }
  const unchanged = el('div', 'series-impact-unchanged');
  const list = el('ul');
  for (const line of group.unchanged) list.append(el('li', undefined, line));
  unchanged.append(el('p', 'series-impact-label', SERIES_UNCHANGED_LABEL), list);
  box.append(changes, unchanged);
  return box;
}

/** One Series Membership Change Record, with what its preview showed behind a disclosure (SER-009). */
function renderChange(change: SeriesMembershipChangeProjection, line: string): HTMLElement {
  const item = el('li', 'series-change');
  item.dataset['changeId'] = change.changeId;
  item.dataset['changeKind'] = change.kind;
  item.dataset['bookId'] = change.bookId;
  item.dataset['seriesId'] = change.seriesId;
  const details = el('details', 'series-change-impact');
  details.append(el('summary', undefined, SERIES_HISTORY_IMPACT), ...change.impact.map((group) => renderImpactGroup(group, 'h5')));
  item.append(el('p', 'series-change-line', line), el('p', 'field-note series-change-byline', seriesChangeByline(change, localInstantLabel)), details);
  return item;
}

export interface MountSeriesListOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectSeriesList' | 'createSeries'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly openSeries: (seriesId: string) => void;
  /** The Series whose entry takes focus once the list is drawn, when the editor came back from it. */
  readonly focusSeriesId: string | null;
}

/** 书系: every Series by name with its member count, and 新建书系 in place. */
export function mountSeriesList(options: MountSeriesListOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('series-list-page');
  let projection: SeriesListProjection | null = null;
  let listLater = false;
  let form: { title: string; note: string } | null = null;
  let refusal: string | null = null;
  let busy = false;

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    root.dataset['seriesCount'] = String(projection.series.length);
    const toolbar = el('div', 'button-row');
    const nodes: HTMLElement[] = [toolbar];
    if (form === null) {
      const open = action(SERIES_CREATE_OPEN, 'secondary', 'create-open', () => {
        if (busy) return;
        form = { title: '', note: '' };
        refusal = null;
        paint('#series-title');
      });
      open.disabled = busy;
      toolbar.append(open);
    } else nodes.push(formNode());
    if (projection.series.length === 0) nodes.push(el('p', 'field-note series-empty', SERIES_EMPTY));
    else {
      const list = el('ul', 'series-list');
      for (const entry of projection.series) {
        const item = el('li', 'series-item');
        item.dataset['seriesId'] = entry.seriesId;
        const open = action(seriesListLine(entry), 'secondary', 'open', () => options.openSeries(entry.seriesId));
        open.disabled = busy;
        item.append(open);
        if (entry.note.length > 0) item.append(el('p', 'field-note series-item-note', entry.note));
        list.append(item);
      }
      nodes.push(list);
    }
    if (projection.nextCursor !== null) {
      const row = el('div', 'button-row series-more');
      const more = action(SERIES_LIST_MORE, 'secondary', 'list-more', () => void loadMore());
      more.disabled = busy;
      row.append(more);
      nodes.push(row);
    }
    if (listLater) {
      const reset = action('回到开头', 'secondary', 'list-first', () => void loadMore(true));
      reset.disabled = busy;
      nodes.push(reset);
    }
    root.replaceChildren(...nodes);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  /** `更多书系…`: the next page by name, a Series already shown (one just created) never twice. */
  const loadMore = async (fresh = false): Promise<void> => {
    if (busy || projection === null || (!fresh && projection.nextCursor === null)) return;
    busy = true;
    paint(null);
    setStatus(SERIES_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectSeriesList({ after: fresh ? null : projection.nextCursor });
      if (!root.isConnected) return;
      const added = page.series;
      projection = page;
      listLater = !fresh;
      busy = false;
      paint(added[0] === undefined ? '[data-series-action="create-open"]' : `[data-series-id="${added[0].seriesId}"] [data-series-action="open"]`);
      setStatus(SERIES_STATUS.opened);
    } catch (error) {
      busy = false;
      paint(fresh ? '[data-series-action="list-first"]' : '[data-series-action="list-more"]');
      setStatus(errorMessage(error, SERIES_STATUS.unavailable), 'error');
    }
  };

  /** The new Series in its place by name among those shown: the answer carries it alone (Issue #63 review). */
  const withCreated = (series: ReadonlyArray<SeriesSummaryProjection>, created: SeriesSummaryProjection): SeriesSummaryProjection[] => {
    if (series.some((entry) => entry.seriesId === created.seriesId)) return [...series];
    const at = series.findIndex((entry) => entry.title > created.title);
    return at < 0 ? [...series, created] : [...series.slice(0, at), created, ...series.slice(at)];
  };

  const formNode = (): HTMLElement => {
    const box = el('form', 'series-create-form');
    box.noValidate = true;
    const titleLabel = el('label', 'series-field');
    const title = el('input');
    title.id = 'series-title';
    title.type = 'text';
    title.value = form!.title;
    title.disabled = busy;
    titleLabel.append(el('span', undefined, SERIES_NAME_LABEL), title);
    const noteLabel = el('label', 'series-field');
    const note = el('textarea');
    note.id = 'series-note';
    note.rows = 3;
    note.value = form!.note;
    note.disabled = busy;
    noteLabel.append(el('span', undefined, SERIES_NOTE_LABEL), note);
    const create = action(SERIES_CREATE, 'primary', 'create', () => void submit());
    const cancel = action(SERIES_CANCEL, 'secondary', 'create-cancel', () => {
      if (busy) return;
      form = null;
      refusal = null;
      paint('[data-series-action="create-open"]');
    });
    const sync = (): void => { create.disabled = busy || title.value.trim().length === 0; };
    title.addEventListener('input', () => { if (form !== null) form.title = title.value; sync(); });
    note.addEventListener('input', () => { if (form !== null) form.note = note.value; });
    sync();
    cancel.disabled = busy;
    const buttons = el('div', 'button-row');
    buttons.append(create, cancel);
    box.append(titleLabel, noteLabel, buttons);
    if (refusal !== null) box.append(alertNode(refusal));
    box.addEventListener('submit', (event) => { event.preventDefault(); if (!create.disabled) void submit(); });
    onEscape(box, () => cancel.click());
    return box;
  };

  const submit = async (): Promise<void> => {
    if (busy || form === null || form.title.trim().length === 0) return;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(SERIES_STATUS.creating, 'busy');
    try {
      const created = await api.createSeries({ title: form.title, note: form.note });
      // Refresh one bounded page; retain at most the exact new Series beyond it, never every earlier creation.
      try { projection = await api.inspectSeriesList({ after: null }); } catch { projection = { series: [], nextCursor: null }; }
      if (!root.isConnected) return;
      projection = { ...projection, series: withCreated(projection.series, created.series) };
      listLater = true;
      busy = false;
      form = null;
      paint(`[data-series-id="${created.seriesId}"] [data-series-action="open"]`);
      setStatus(created.completionLabel, 'success');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, SERIES_STATUS.failed);
      paint('#series-title');
      setStatus(refusal, 'error');
    }
  };

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', SERIES_STATUS.loading));
      projection = await api.inspectSeriesList({ after: null });
      paint(options.focusSeriesId === null ? null : `[data-series-id="${options.focusSeriesId}"] [data-series-action="open"]`);
    },
  };
}

export interface MountSeriesOptions {
  readonly root: HTMLElement;
  readonly seriesId: string;
  readonly api: Pick<RendererApi, 'inspectSeries' | 'inspectSeriesMembers' | 'inspectSeriesCandidates' | 'inspectSeriesHistory' |
    'previewSeriesMembershipChange' | 'changeSeriesMembership'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
}

/**
 * One Series' 成员与共享范围 (SER-001 to SER-010): the member table, 加入书系… and 移出书系… each through the inline preview
 * whose only committing action is exactly `加入书系` or `移出书系`, and the change records, newest first.
 *
 * Every list is read a page at a time (Issue #63 review): members newest joined first with `更多成员…`, the records with
 * `更早的记录…`, and 加入书系…'s Books by title with `查找书名` and `更多图书…` — so every Book can be added and every member
 * removed, however many there are.
 */
export function mountSeries(options: MountSeriesOptions): { load(): Promise<SeriesProjection> } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('series-page');
  let projection: SeriesProjection | null = null;
  let membersLater = false;
  let historyLater = false;
  /**
   * 加入书系…'s chooser while it is open: the Book chosen, the words searched for, one page — `null` while the
   * first page is on its way — and where the next page starts.
   */
  let chooser: {
    bookId: string | null;
    selected: { readonly bookId: string; readonly title: string } | null;
    later: boolean;
    text: string;
    candidates: ReadonlyArray<{ readonly bookId: string; readonly title: string }> | null;
    next: SeriesCandidatesCursor | null;
  } | null = null;
  let preview: SeriesMembershipPreviewProjection | null = null;
  /** The preview the editor asked for and could not see, so a stale refusal can ask again. */
  let asked: { bookId: string; kind: SeriesMembershipChangeKind } | null = null;
  let refusal: { message: string; stale: boolean } | null = null;
  let busy = false;

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    root.dataset['seriesId'] = projection.seriesId;
    root.dataset['memberCount'] = String(projection.members.length);
    const members = el('section', 'series-members');
    members.append(el('h3', undefined, SERIES_MEMBERS_HEADING), el('p', 'field-note series-scope-note', SERIES_SCOPE_NOTE));
    if (projection.members.length === 0) members.append(el('p', 'field-note series-members-empty', SERIES_MEMBERS_EMPTY));
    else members.append(memberTable(projection));
    if (projection.membersNext !== null) {
      const row = el('div', 'button-row series-more');
      const more = action(SERIES_MEMBERS_MORE, 'secondary', 'members-more', () => void loadMembers());
      more.disabled = busy;
      row.append(more);
      members.append(row);
    }
    if (membersLater) {
      const reset = action('回到开头', 'secondary', 'members-first', () => void loadMembers(true));
      reset.disabled = busy;
      members.append(reset);
    }
    const addRow = el('div', 'button-row series-add-row');
    const addOpen = action(SERIES_ADD_OPEN, 'secondary', 'add-open', () => {
      if (busy) return;
      chooser = { bookId: null, selected: null, later: false, text: '', candidates: null, next: null };
      preview = null;
      refusal = null;
      void loadCandidates(true);
    });
    const nothingToAdd = projection.memberCount >= projection.bookCount;
    addOpen.disabled = busy || nothingToAdd || chooser !== null || preview !== null;
    addRow.append(addOpen);
    // A house with no Book yet says so, rather than that every Book is already in (Issue #63 review).
    if (nothingToAdd) addRow.append(el('p', 'field-note series-add-none', projection.bookCount === 0 ? SERIES_ADD_NO_BOOKS : SERIES_ADD_NONE));
    members.append(addRow);
    if (chooser !== null) members.append(chooserNode());
    if (preview !== null || (refusal !== null && asked !== null)) members.append(previewNode());

    const history = el('section', 'series-history-section');
    const historyHeading = el('h3', undefined, SERIES_HISTORY_HEADING);
    historyHeading.tabIndex = -1;
    history.append(historyHeading);
    if (projection.history.length === 0) history.append(el('p', 'field-note series-history-empty', SERIES_HISTORY_EMPTY));
    else {
      const list = el('ol', 'series-history');
      for (const change of projection.history) list.append(renderChange(change, seriesChangeLine(change)));
      history.append(list);
    }
    if (projection.historyNext !== null) {
      const row = el('div', 'button-row series-more');
      const more = action(SERIES_HISTORY_MORE, 'secondary', 'history-more', () => void loadHistory());
      more.disabled = busy;
      row.append(more);
      history.append(row);
    }
    if (historyLater) {
      const reset = action('回到最新记录', 'secondary', 'history-first', () => void loadHistory(true));
      reset.disabled = busy;
      history.append(reset);
    }
    root.replaceChildren(members, history);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const memberTable = (series: SeriesProjection): HTMLElement => {
    const table = el('table', 'series-member-table');
    const head = el('thead');
    const headRow = el('tr');
    for (const column of SERIES_MEMBER_COLUMNS) {
      const cell = el('th', undefined, column);
      cell.scope = 'col';
      headRow.append(cell);
    }
    head.append(headRow);
    const body = el('tbody');
    for (const member of series.members) {
      const row = el('tr');
      row.dataset['bookId'] = member.bookId;
      const title = el('th', undefined, `《${member.title}》`);
      title.scope = 'row';
      const remove = action(SERIES_REMOVE_OPEN, 'quiet', 'remove-open', () => void ask(member.bookId, 'remove'));
      remove.disabled = busy || chooser !== null || preview !== null;
      remove.setAttribute('aria-label', `移出书系：《${member.title}》`);
      const actions = el('td');
      actions.append(remove);
      // Each cell names its column, which a narrow window shows beside it once the table stacks.
      const cell = (column: number, text: string, className?: string): HTMLTableCellElement => {
        const node = el('td', className, text);
        node.dataset['label'] = SERIES_MEMBER_COLUMNS[column]!;
        return node;
      };
      row.append(
        title,
        cell(1, seriesPeopleLine(member.authors)),
        cell(2, seriesPeopleLine(member.editors)),
        cell(3, localInstantLabel(member.joinedAt)),
        cell(4, seriesConsistencyLine(member, localInstantLabel), 'series-consistency'),
        actions,
      );
      body.append(row);
    }
    table.append(head, body);
    return table;
  };

  const chooserNode = (): HTMLElement => {
    const box = el('fieldset', 'series-add-chooser');
    box.append(el('legend', undefined, SERIES_ADD_LEGEND));
    // 查找书名 first, so Tab from a chosen Book goes on to 查看影响.
    const searchRow = el('div', 'series-add-search');
    const searchLabel = el('label', 'series-field');
    const search = el('input');
    search.id = 'series-add-search';
    search.type = 'search';
    search.value = chooser?.text ?? '';
    search.disabled = busy;
    search.addEventListener('input', () => { if (chooser !== null) chooser.text = search.value; });
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      void loadCandidates(true);
    });
    searchLabel.append(el('span', undefined, SERIES_ADD_SEARCH_LABEL), search);
    const find = action(SERIES_ADD_SEARCH, 'secondary', 'add-search', () => void loadCandidates(true));
    find.disabled = busy;
    searchRow.append(searchLabel, find);
    box.append(searchRow);
    const candidates = chooser?.candidates ?? null;
    if (candidates === null) box.append(el('p', 'field-note', SERIES_STATUS.loading));
    else if (candidates.length === 0) box.append(el('p', 'field-note series-add-no-match', (chooser?.text.trim() ?? '') === '' ? SERIES_ADD_NONE : SERIES_ADD_NO_MATCH));
    const visible = [...(candidates ?? [])];
    const selected = chooser?.selected;
    if (selected && !visible.some((entry) => entry.bookId === selected.bookId)) visible.push(selected);
    for (const candidate of visible) {
      const label = el('label', 'series-add-choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'series-add-book';
      radio.value = candidate.bookId;
      radio.checked = chooser?.bookId === candidate.bookId;
      radio.disabled = busy;
      radio.addEventListener('change', () => {
        if (chooser === null || !radio.checked) return;
        chooser.bookId = candidate.bookId;
        chooser.selected = candidate;
        look.disabled = busy;
      });
      label.append(radio, el('span', undefined, `《${candidate.title}》`));
      box.append(label);
    }
    if (chooser?.next != null) {
      const row = el('div', 'button-row series-more');
      const more = action(SERIES_ADD_MORE, 'secondary', 'add-more', () => void loadCandidates(false));
      more.disabled = busy;
      row.append(more);
      box.append(row);
    }
    if (chooser?.later) {
      const reset = action('回到开头', 'secondary', 'add-first', () => void loadCandidates(true));
      reset.disabled = busy;
      box.append(reset);
    }
    const look = action(SERIES_PREVIEW_ACTION, 'primary', 'preview', () => {
      if (chooser?.bookId) void ask(chooser.bookId, 'add');
    });
    look.disabled = busy || chooser?.bookId === null;
    const cancel = action(SERIES_CANCEL, 'secondary', 'add-cancel', () => {
      if (busy) return;
      chooser = null;
      paint('[data-series-action="add-open"]');
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row');
    buttons.append(look, cancel);
    box.append(buttons);
    onEscape(box, () => cancel.click());
    return box;
  };

  const previewNode = (): HTMLElement => {
    const box = el('section', 'series-preview');
    if (preview !== null) {
      box.dataset['previewKind'] = preview.kind;
      box.dataset['bookId'] = preview.bookId;
      const heading = el('h4', 'series-preview-heading', seriesPreviewHeading(preview));
      heading.tabIndex = -1;
      box.append(heading, el('p', 'series-preview-identity', seriesPreviewIdentity(preview)), ...preview.groups.map((group) => renderImpactGroup(group, 'h5')));
    }
    if (refusal !== null) box.append(alertNode(refusal.message));
    const buttons = el('div', 'button-row');
    if (refusal?.stale && asked !== null) {
      const again = asked;
      const refresh = action(SERIES_REFRESH, 'secondary', 'refresh', () => void ask(again.bookId, again.kind));
      refresh.disabled = busy;
      buttons.append(refresh);
    } else if (preview !== null) {
      const commit = action(preview.actionLabel, 'primary', 'commit', () => void submit());
      commit.disabled = busy;
      buttons.append(commit);
    }
    const cancel = action(SERIES_CANCEL, 'secondary', 'preview-cancel', () => {
      if (busy) return;
      const kind = preview?.kind ?? asked?.kind;
      const bookId = preview?.bookId ?? asked?.bookId;
      preview = null;
      asked = null;
      refusal = null;
      chooser = null;
      paint(kind === 'remove' && bookId !== undefined ? `tr[data-book-id="${bookId}"] [data-series-action="remove-open"]` : '[data-series-action="add-open"]');
    });
    cancel.disabled = busy;
    buttons.append(cancel);
    box.append(buttons);
    onEscape(box, () => cancel.click());
    return box;
  };

  /**
   * 加入书系…'s Books (Issue #63 review): the first page for the words searched — every Book the Series does not hold when there
   * are none — or the next page after those shown. Focus goes to the first Book the read brought.
   */
  const loadCandidates = async (fresh: boolean): Promise<void> => {
    if (busy || projection === null || chooser === null) return;
    const open = chooser;
    busy = true;
    if (fresh) {
      open.candidates = null;
      open.next = null;
      open.bookId = null;
      open.selected = null;
    }
    paint(null);
    try {
      const page = await api.inspectSeriesCandidates({ seriesId: projection.seriesId, text: open.text, after: fresh ? null : open.next });
      busy = false;
      if (!root.isConnected || chooser !== open) return;
      const added = page.candidates;
      open.candidates = added;
      open.later = !fresh;
      open.next = page.nextCursor;
      paint(added[0] === undefined ? '#series-add-search' : `input[name="series-add-book"][value="${added[0].bookId}"]`);
    } catch (error) {
      busy = false;
      if (open.candidates === null) open.candidates = [];
      paint('#series-add-search');
      setStatus(errorMessage(error, SERIES_STATUS.unavailable), 'error');
    }
  };

  /** `更多成员…`: the next page of members, newest joined first. */
  const loadMembers = async (fresh = false): Promise<void> => {
    if (busy || projection === null || (!fresh && projection.membersNext === null)) return;
    const shown = projection;
    busy = true;
    paint(null);
    setStatus(SERIES_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectSeriesMembers({ seriesId: shown.seriesId, after: fresh ? null : shown.membersNext });
      if (!root.isConnected) return;
      const added = page.members;
      projection = { ...shown, members: added, membersNext: page.nextCursor };
      membersLater = !fresh;
      busy = false;
      paint(added[0] === undefined ? '[data-series-action="members-first"]' : `tr[data-book-id="${added[0].bookId}"] [data-series-action="remove-open"]`);
      setStatus(SERIES_STATUS.opened);
    } catch (error) {
      busy = false;
      paint(fresh ? '[data-series-action="members-first"]' : '[data-series-action="members-more"]');
      setStatus(errorMessage(error, SERIES_STATUS.unavailable), 'error');
    }
  };

  /** `更早的记录…`: the next page of the Series' change records, newest first. */
  const loadHistory = async (fresh = false): Promise<void> => {
    if (busy || projection === null || (!fresh && projection.historyNext === null)) return;
    const shown = projection;
    busy = true;
    paint(null);
    setStatus(SERIES_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectSeriesHistory({ seriesId: shown.seriesId, bookId: null, after: fresh ? null : shown.historyNext });
      if (!root.isConnected) return;
      projection = { ...shown, history: page.history, historyNext: page.nextCursor };
      historyLater = !fresh;
      busy = false;
      paint('.series-history-section h3');
      setStatus(SERIES_STATUS.opened);
    } catch (error) {
      busy = false;
      paint(fresh ? '[data-series-action="history-first"]' : '[data-series-action="history-more"]');
      setStatus(errorMessage(error, SERIES_STATUS.unavailable), 'error');
    }
  };

  /** Ask the service what the change would do: the preview replaces the chooser, and nothing is recorded yet. */
  const ask = async (bookId: string, kind: SeriesMembershipChangeKind): Promise<void> => {
    if (busy || projection === null) return;
    busy = true;
    asked = { bookId, kind };
    refusal = null;
    paint(null);
    setStatus(SERIES_STATUS.previewing, 'busy');
    try {
      preview = await api.previewSeriesMembershipChange({ seriesId: projection.seriesId, bookId, kind });
      busy = false;
      chooser = null;
      paint('.series-preview-heading');
      setStatus(seriesPreviewHeading(preview));
    } catch (error) {
      busy = false;
      preview = null;
      refusal = { message: errorMessage(error, SERIES_STATUS.failed), stale: false };
      try { projection = await api.inspectSeries({ seriesId: projection.seriesId }); membersLater = false; historyLater = false; } catch { /* the page keeps what it had */ }
      paint('[data-series-action="preview-cancel"]');
      setStatus(refusal.message, 'error');
    }
  };

  const submit = async (): Promise<void> => {
    if (busy || projection === null || preview === null) return;
    const shown = preview;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(SERIES_STATUS.committing, 'busy');
    try {
      const result = await api.changeSeriesMembership({ seriesId: shown.seriesId, bookId: shown.bookId, kind: shown.kind, previewDigest: shown.previewDigest });
      // The answer is the record alone (Issue #63 review): the Series is read again, its first pages newest first, so a Book
      // just added heads the member table. The change stands whatever that read meets.
      try { projection = await api.inspectSeries({ seriesId: shown.seriesId }); membersLater = false; historyLater = false; } catch { /* the page keeps what it had */ }
      busy = false;
      preview = null;
      asked = null;
      paint(shown.kind === 'add' ? `tr[data-book-id="${shown.bookId}"] [data-series-action="remove-open"]` : '[data-series-action="add-open"]');
      setStatus(result.completionLabel, 'success');
    } catch (error) {
      busy = false;
      const stale = typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SERIES_PREVIEW_STALE';
      refusal = { message: errorMessage(error, SERIES_STATUS.failed), stale };
      // A stale preview is withdrawn: the editor reads the consequence again before any commit (SER-010).
      preview = null;
      try { projection = await api.inspectSeries({ seriesId: shown.seriesId }); membersLater = false; historyLater = false; } catch { /* the page keeps what it had */ }
      paint(stale ? '[data-series-action="refresh"]' : '[data-series-action="preview-cancel"]');
      setStatus(refusal.message, 'error');
    }
  };

  return {
    async load(): Promise<SeriesProjection> {
      root.replaceChildren(el('p', 'field-note', SERIES_STATUS.loading));
      projection = await api.inspectSeries({ seriesId: options.seriesId });
      paint(null);
      return projection;
    },
  };
}

export interface MountBookSeriesOptions {
  readonly root: HTMLElement;
  readonly bookId: string;
  readonly api: Pick<RendererApi, 'inspectBookSeries' | 'inspectSeriesHistory'>;
}

/** A Book's 书系 on its 工作概览 (SER-009): the Series it is in now and its membership change records. A read. */
export function mountBookSeries(options: MountBookSeriesOptions): void {
  const { root } = options;
  root.classList.add('source-card', 'book-series');
  root.dataset['bookId'] = options.bookId;
  root.replaceChildren(el('h3', undefined, BOOK_SERIES_HEADING), el('p', 'field-note', SERIES_STATUS.loading));
  void options.api.inspectBookSeries({ bookId: options.bookId }).then(
    (projection: BookSeriesProjection) => {
      if (!root.isConnected) return;
      root.dataset['seriesCount'] = String(projection.memberships.length);
      const nodes: HTMLElement[] = [el('h3', undefined, BOOK_SERIES_HEADING)];
      if (projection.memberships.length === 0) nodes.push(el('p', 'book-series-none', BOOK_SERIES_NONE));
      for (const membership of projection.memberships) {
        const line = el('p', 'book-series-membership', bookSeriesMembershipLine(membership, localInstantLabel));
        line.dataset['seriesId'] = membership.seriesId;
        nodes.push(line);
      }
      if (projection.membershipCount > projection.memberships.length) {
        nodes.push(el('p', 'field-note book-series-more', bookSeriesMoreLine(projection.membershipCount - projection.memberships.length)));
      }
      if (projection.historyCount > 0) {
        const details = el('details', 'book-series-history');
        const list = el('ol');
        for (const change of projection.history) list.append(renderChange(change, bookSeriesChangeLine(change)));
        // The summary counts every record; `更早的记录…` reads those past the first page (Issue #63 review).
        details.append(el('summary', undefined, `${BOOK_SERIES_HISTORY}（${projection.historyCount}）`), list);
        let next = projection.historyNext;
        let loading = false;
        const loadPage = async (fresh: boolean): Promise<void> => {
          if (loading || (!fresh && next === null)) return;
          loading = true;
          more.disabled = true;
          reset.disabled = true;
          try {
            const page = await options.api.inspectSeriesHistory({ seriesId: null, bookId: options.bookId, after: fresh ? null : next });
            if (!root.isConnected) return;
            list.replaceChildren(...page.history.map((change) => renderChange(change, bookSeriesChangeLine(change))));
            next = page.nextCursor;
            more.hidden = next === null;
            reset.hidden = fresh;
            (list.querySelector('summary') ?? details.querySelector('summary'))?.focus();
          } catch {
            if (root.isConnected) details.querySelector('summary')?.focus();
          } finally {
            loading = false;
            more.disabled = false;
            reset.disabled = false;
          }
        };
        const more = action(SERIES_HISTORY_MORE, 'secondary', 'book-history-more', () => void loadPage(false));
        more.hidden = next === null;
        const reset = action('回到最新记录', 'secondary', 'book-history-first', () => void loadPage(true));
        reset.hidden = true;
        details.append(more, reset);
        nodes.push(details);
      }
      root.replaceChildren(...nodes);
    },
    () => {
      if (!root.isConnected) return;
      root.replaceChildren(el('h3', undefined, BOOK_SERIES_HEADING), el('p', 'attention-note', SERIES_STATUS.unavailable));
    },
  );
}
