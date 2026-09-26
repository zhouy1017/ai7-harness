import {
  LIBRARY_MATERIAL_KINDS,
  type BookSummaryCursor,
  type LearningEligibilityChoice,
  type LibraryMaterialCursor,
  type LibraryMaterialDecisionInput,
  type LibraryMaterialKind,
  type LibraryMaterialPreviewProjection,
  type LibraryMaterialProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  LIBRARY_ADD,
  LIBRARY_ADD_CONFIRM,
  LIBRARY_ATTRIBUTE,
  LIBRARY_ATTRIBUTE_CONFIRM,
  LIBRARY_ATTRIBUTION_TERM,
  LIBRARY_BOOKS_MORE,
  LIBRARY_CANCEL,
  LIBRARY_ELIGIBILITY,
  LIBRARY_ELIGIBILITY_BOUNDARY,
  LIBRARY_ELIGIBILITY_CONFIRM,
  LIBRARY_ELIGIBILITY_NEEDS_ATTRIBUTION,
  LIBRARY_ELIGIBILITY_RESET,
  LIBRARY_ELIGIBILITY_TERM,
  LIBRARY_EMPTY,
  LIBRARY_HOUSE,
  LIBRARY_HOUSE_CONSEQUENCE,
  LIBRARY_KIND_LABELS,
  LIBRARY_KIND_LEGEND,
  LIBRARY_MORE,
  LIBRARY_REASON_LABEL,
  LIBRARY_RECOMMENDED,
  LIBRARY_SERIES,
  LIBRARY_SERIES_ELIGIBILITY,
  LIBRARY_SERIES_ELIGIBILITY_UNAVAILABLE,
  LIBRARY_SERIES_UNAVAILABLE,
  LIBRARY_STATUS,
  LIBRARY_TITLE_LABEL,
  eligibilityChoiceLabel,
  libraryAdded,
  libraryAttributed,
  libraryAttributionLine,
  libraryDecisionLine,
  libraryDecisionsSummary,
  libraryEligibilityDecided,
  libraryEligibilityLine,
  libraryPreviewFacts,
  libraryPreviewHeading,
  libraryReferenceLine,
  librarySourceLine,
} from './knowledge-base-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, ATTN-009, LEARN-004 to LEARN-012): every item the editor
 * collected — what it is and when it came, where it belongs, its Learning Eligibility and whose Tasks may list it under
 * 允许参考 — with every decision on record. `放入资料…` opens the picker and shows the file as it will arrive, the editor
 * names it and says what it is, and `放入资料库` keeps it. `定归属…` and `定学习准入…` each open one choice in the card; the
 * eligibility choices start unselected, a wider one states its consequence where it is chosen, and nothing is decided until
 * the editor records it.
 *
 * Nothing here is read whole (Issue #427 review): the items come twenty at a time, newest first, with `更多资料…`; an arrival
 * or a decision answers with its one item; the item 待我处理 opened is read by itself when it is not on the first page, and
 * shown first; and 定归属 names its Books from 书库's own pages, with `更多图书…`.
 */
export interface MountLibraryMaterialsOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectLibraryMaterials' | 'inspectLibraryMaterial' | 'previewLibraryMaterial' | 'addLibraryMaterial' |
    'decideLibraryMaterial' | 'listBooks' | 'readLibraryDecisionReason'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
  /** The item 待我处理 opened: its card, with the decision it waits for in focus. */
  readonly focusMaterialId: string | null;
}

type Chooser =
  | { readonly materialId: string; readonly kind: 'attribution'; choice: string | null; book: { bookId: string; title: string } | null }
  | { readonly materialId: string; readonly kind: 'eligibility'; choice: LearningEligibilityChoice | null; reason: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['libraryAction'] = name;
  node.addEventListener('click', run);
  return node;
}

/** One choice of a radio group, its words beside it; a choice that is not there yet is shown disabled with why. */
function choice(name: string, value: string, label: string, checked: boolean, disabled: boolean, onChoose: (value: string) => void): HTMLLabelElement {
  const wrapper = el('label', 'library-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  input.dataset['libraryChoice'] = value;
  input.addEventListener('change', () => {
    if (input.checked) onChoose(value);
  });
  wrapper.append(input, el('span', undefined, label));
  return wrapper;
}

export function mountLibraryMaterials(options: MountLibraryMaterialsOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('library-materials');
  let busy = false;
  /** One page, newest first, and where the next page starts. */
  let materials: LibraryMaterialProjection[] = [];
  let cursor: LibraryMaterialCursor | null = null;
  let onFirstPage = true;
  /** The item 待我处理 opened when it is not among them: read by itself, and shown first. */
  let pinned: LibraryMaterialProjection | null = null;
  /** The Books 定归属 can name, as 书库 pages them, and where the next page starts; `null` until first read. */
  let books: Array<{ bookId: string; title: string }> | null = null;
  let booksCursor: BookSummaryCursor | null = null;
  let onFirstBooksPage = true;
  /** The file 放入资料… read, and what the editor has written about it so far. */
  let preview: LibraryMaterialPreviewProjection | null = null;
  let draft: { title: string; kind: LibraryMaterialKind | null } = { title: '', kind: null };
  let chooser: Chooser | null = null;
  /** A refusal, beside the item it concerns, or at the top for an arrival. */
  let refusal: { materialId: string | null; message: string } | null = null;

  /** Every item on the page: the pinned one first, then the pages read, each once. */
  const shown = (): LibraryMaterialProjection[] =>
    pinned === null || materials.some((material) => material.materialId === pinned!.materialId) ? materials : [pinned, ...materials];

  /** One item as it now reads, in whichever place it is shown. */
  const replace = (next: LibraryMaterialProjection): void => {
    materials = materials.map((material) => (material.materialId === next.materialId ? next : material));
    if (pinned?.materialId === next.materialId) pinned = next;
  };

  const paint = (focus: string | null): void => {
    const listed = shown();
    root.dataset['materialCount'] = String(listed.length);
    const actions = el('div', 'button-row library-actions');
    const add = action(LIBRARY_ADD, 'secondary', 'add', () => void choose());
    add.disabled = busy || preview !== null || chooser !== null;
    actions.append(add);
    const parts: HTMLElement[] = [actions];
    if (refusal !== null && refusal.materialId === null && preview === null) parts.push(alert(refusal.message));
    if (preview !== null) parts.push(previewSection(preview));
    if (listed.length === 0 && preview === null) parts.push(el('p', 'field-note library-empty', LIBRARY_EMPTY));
    const list = el('div', 'library-list');
    for (const material of listed) list.append(card(material));
    parts.push(list);
    if (cursor !== null || !onFirstPage) {
      const row = el('div', 'button-row library-more');
      if (!onFirstPage) {
        const first = action('回到最新资料', 'secondary', 'first', () => void loadMore(true));
        first.disabled = busy || chooser !== null || preview !== null;
        row.append(first);
      }
      if (cursor !== null) {
        const more = action(LIBRARY_MORE, 'secondary', 'more', () => void loadMore());
        more.disabled = busy || chooser !== null || preview !== null;
        row.append(more);
      }
      parts.push(row);
    }
    root.replaceChildren(...parts);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const alert = (message: string): HTMLElement => {
    const note = el('p', 'attention-note library-refusal', message);
    note.setAttribute('role', 'alert');
    return note;
  };

  const previewSection = (shown: LibraryMaterialPreviewProjection): HTMLElement => {
    const section = el('section', 'library-preview');
    const heading = el('h3', undefined, libraryPreviewHeading(shown));
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note library-preview-facts', libraryPreviewFacts(shown)));
    const confirm = action(LIBRARY_ADD_CONFIRM, 'primary', 'confirm-add', () => void commit());
    const cancel = action(LIBRARY_CANCEL, 'quiet', 'cancel-add', () => {
      preview = null;
      refusal = null;
      paint('[data-library-action="add"]');
    });
    const sync = (): void => {
      confirm.disabled = busy || draft.kind === null || draft.title.trim().length === 0;
    };
    const title = el('label', 'library-field');
    const input = el('input');
    input.type = 'text';
    input.value = draft.title;
    input.dataset['libraryField'] = 'title';
    input.addEventListener('input', () => {
      draft.title = input.value;
      sync();
    });
    title.append(el('span', undefined, LIBRARY_TITLE_LABEL), input);
    const kinds = el('fieldset', 'library-kinds');
    kinds.append(el('legend', undefined, LIBRARY_KIND_LEGEND));
    for (const kind of LIBRARY_MATERIAL_KINDS) {
      kinds.append(choice('library-kind', kind, LIBRARY_KIND_LABELS[kind], draft.kind === kind, busy, (value) => {
        draft.kind = value as LibraryMaterialKind;
        sync();
      }));
    }
    section.append(title, kinds);
    if (refusal !== null && refusal.materialId === null) section.append(alert(refusal.message));
    const row = el('div', 'button-row');
    cancel.disabled = busy;
    row.append(confirm, cancel);
    section.append(row);
    sync();
    return section;
  };

  /** The full immutable note stays readable one fragment at a time, independently of later decisions. */
  const reasonReader = (materialId: string, ordinal: number): HTMLElement => {
    const section = el('section', 'library-reason-reader');
    const open = action('说明未显示完；阅读完整说明…', 'quiet', 'read-reason', () => void read(0));
    section.append(open);
    let loading = false;
    const read = async (offset: number): Promise<void> => {
      if (loading) return;
      loading = true;
      const controls = [...section.querySelectorAll('button')];
      for (const button of controls) button.disabled = true;
      try {
        const page = await api.readLibraryDecisionReason({ materialId, ordinal, offset });
        if (!section.isConnected) return;
        const text = el('p', 'library-reason-text', page.text);
        text.tabIndex = -1;
        const row = el('div', 'button-row');
        if (page.previousOffset !== null) row.append(action('上一段', 'quiet', 'reason-previous', () => void read(page.previousOffset!)));
        if (page.nextOffset !== null) row.append(action('下一段', 'quiet', 'reason-next', () => void read(page.nextOffset!)));
        row.append(action('收起说明', 'quiet', 'reason-close', () => { section.replaceChildren(open); open.disabled = false; open.focus(); }));
        section.replaceChildren(text, row);
        text.focus();
      } catch (error) {
        if (!section.isConnected) return;
        section.querySelector('[role="alert"]')?.remove();
        section.append(alert(errorMessage(error, '暂时无法读取这段说明，请重试。')));
        for (const button of controls) button.disabled = false;
        controls[0]?.focus();
      } finally {
        loading = false;
      }
    };
    return section;
  };

  const card = (material: LibraryMaterialProjection): HTMLElement => {
    const node = el('article', 'library-material');
    node.dataset['materialId'] = material.materialId;
    node.dataset['attribution'] = material.attribution?.scope ?? 'none';
    node.dataset['eligibility'] = material.eligibility?.choice ?? 'none';
    node.dataset['reference'] = material.reference.state;
    node.dataset['decisions'] = String(material.decisionCount);
    const heading = el('div', 'library-heading');
    const title = el('h3', undefined, material.title);
    title.tabIndex = -1;
    heading.append(title, el('span', 'status-pill library-kind', LIBRARY_KIND_LABELS[material.kind]));
    node.append(heading, el('p', 'field-note library-source', librarySourceLine(material, localInstantLabel)));
    const facts = el('dl', 'library-facts');
    facts.append(
      el('dt', undefined, LIBRARY_ATTRIBUTION_TERM), el('dd', 'library-attribution', libraryAttributionLine(material)),
      el('dt', undefined, LIBRARY_ELIGIBILITY_TERM), el('dd', 'library-eligibility', libraryEligibilityLine(material)),
    );
    node.append(facts);
    if (material.eligibility?.reasonHasMore) node.append(reasonReader(material.materialId, material.eligibility.ordinal));
    if (material.eligibilityReset) node.append(el('p', 'attention-note library-reset', LIBRARY_ELIGIBILITY_RESET));
    node.append(el('p', `library-reference library-reference-${material.reference.state}`, libraryReferenceLine(material)));
    if (refusal?.materialId === material.materialId) node.append(alert(refusal.message));
    if (chooser?.materialId === material.materialId) {
      node.append(chooser.kind === 'attribution' ? attributionChooser(material, chooser) : eligibilityChooser(material, chooser));
    } else {
      const row = el('div', 'button-row library-card-actions');
      const waitsForEligibility = material.attribution !== null && (material.eligibility === null || material.eligibility.choice === 'deferred');
      const attribute = action(LIBRARY_ATTRIBUTE, material.attribution === null ? 'secondary' : 'quiet', 'attribute', () => open(material, 'attribution'));
      const eligibility = action(LIBRARY_ELIGIBILITY, waitsForEligibility ? 'secondary' : 'quiet', 'eligibility', () => open(material, 'eligibility'));
      attribute.disabled = busy || preview !== null || chooser !== null;
      eligibility.disabled = busy || preview !== null || chooser !== null || material.attribution === null;
      row.append(attribute, eligibility);
      node.append(row);
      if (material.attribution === null) {
        const note = el('p', 'field-note library-needs-attribution', LIBRARY_ELIGIBILITY_NEEDS_ATTRIBUTION);
        note.id = `library-needs-${material.materialId}`;
        eligibility.setAttribute('aria-describedby', note.id);
        node.append(note);
      }
    }
    // Every decision on record, oldest first, and the exact identities one step below.
    const history = el('details', 'library-decisions');
    history.append(el('summary', undefined, libraryDecisionsSummary(material.decisionCount, material.decisions.length)));
    const list = el('ol', 'library-decision-list');
    for (const entry of material.decisions) {
      const row = el('li', undefined, libraryDecisionLine(entry, localInstantLabel));
      row.dataset['decisionOrdinal'] = String(entry.ordinal);
      if (entry.decision.kind === 'eligibility' && entry.decision.reasonHasMore) row.append(reasonReader(material.materialId, entry.ordinal));
      list.append(row);
    }
    history.append(list, technicalDetails('library-material-facts',
      el('dt', undefined, '资料'), el('dd', 'technical-identity', material.materialId),
      el('dt', undefined, '文件 SHA-256'), el('dd', 'technical-identity', material.source.sha256),
      el('dt', undefined, '记录摘要'), el('dd', 'technical-identity', material.digest)));
    node.append(history);
    return node;
  };

  const chooserActions = (section: HTMLElement, material: LibraryMaterialProjection, label: string, name: string, run: () => void): HTMLButtonElement => {
    const row = el('div', 'button-row');
    const confirm = action(label, 'primary', name, run);
    const cancel = action(LIBRARY_CANCEL, 'quiet', 'cancel-decision', () => {
      const kind = chooser?.kind;
      chooser = null;
      paint(`[data-material-id="${material.materialId}"] [data-library-action="${kind === 'eligibility' ? 'eligibility' : 'attribute'}"]`);
    });
    cancel.disabled = busy;
    row.append(confirm, cancel);
    section.append(row);
    return confirm;
  };

  /** 定归属: one Book, a Series once Series exist, or the house — none chosen until the editor chooses. */
  const attributionChooser = (material: LibraryMaterialProjection, state: Extract<Chooser, { kind: 'attribution' }>): HTMLElement => {
    const section = el('section', 'library-chooser library-attribution-chooser');
    const fieldset = el('fieldset');
    fieldset.append(el('legend', undefined, `${LIBRARY_ATTRIBUTION_TERM}：「${material.title}」`));
    const name = `library-attribution-${material.materialId}`;
    let confirm: HTMLButtonElement | null = null;
    const chosen = (value: string): void => {
      state.choice = value;
      state.book = books?.find((book) => `book:${book.bookId}` === value) ??
        (state.book !== null && `book:${state.book.bookId}` === value ? state.book : null);
      if (confirm !== null) confirm.disabled = busy;
    };
    if (state.book !== null && !books?.some((book) => book.bookId === state.book!.bookId)) {
      fieldset.append(choice(name, `book:${state.book.bookId}`, `已选：《${state.book.title}》`, true, busy, chosen));
    }
    for (const book of books ?? []) {
      fieldset.append(choice(name, `book:${book.bookId}`, `《${book.title}》`, state.choice === `book:${book.bookId}`, busy, chosen));
    }
    if (booksCursor !== null) {
      const more = action(LIBRARY_BOOKS_MORE, 'quiet', 'more-books', () => void loadBooks(material));
      more.disabled = busy;
      fieldset.append(more);
    }
    if (!onFirstBooksPage) {
      const first = action('回到图书首页', 'quiet', 'first-books', () => void loadBooks(material, true));
      first.disabled = busy;
      fieldset.append(first);
    }
    fieldset.append(
      choice(name, 'series', LIBRARY_SERIES, false, true, chosen),
      el('p', 'field-note library-choice-note', LIBRARY_SERIES_UNAVAILABLE),
      choice(name, 'house', LIBRARY_HOUSE, state.choice === 'house', busy, chosen),
    );
    section.append(fieldset);
    confirm = chooserActions(section, material, LIBRARY_ATTRIBUTE_CONFIRM, 'confirm-attribution', () => {
      const value = state.choice;
      if (value === null) return;
      const decision: LibraryMaterialDecisionInput = value === 'house'
        ? { kind: 'attribution', attribution: { scope: 'house' } }
        : { kind: 'attribution', attribution: { scope: 'book', bookId: value.slice('book:'.length) } };
      const where = value === 'house' ? LIBRARY_HOUSE : `《${state.book?.title ?? ''}》`;
      void decide(material, decision, libraryAttributed(material.title, where));
    });
    confirm.disabled = busy || state.choice === null;
    return section;
  };

  /**
   * 定学习准入 (LEARN-004 to LEARN-007): the choices the attribution allows, none chosen; the Book's own is the recommendation;
   * the house states its consequence where it is chosen; 稍后决定 and 明确排除 are choices like the others, with an optional note.
   */
  const eligibilityChooser = (material: LibraryMaterialProjection, state: Extract<Chooser, { kind: 'eligibility' }>): HTMLElement => {
    const section = el('section', 'library-chooser library-eligibility-chooser');
    const fieldset = el('fieldset');
    fieldset.append(el('legend', undefined, `${LIBRARY_ELIGIBILITY_TERM}：「${material.title}」`));
    const name = `library-eligibility-${material.materialId}`;
    const bookTitle = material.attribution?.scope === 'book' ? material.attribution.bookTitle : null;
    const consequence = el('p', 'attention-note library-house-consequence', LIBRARY_HOUSE_CONSEQUENCE);
    consequence.hidden = state.choice !== 'house';
    let confirm: HTMLButtonElement | null = null;
    const chosen = (value: string): void => {
      state.choice = value as LearningEligibilityChoice;
      consequence.hidden = state.choice !== 'house';
      if (confirm !== null) confirm.disabled = busy;
    };
    if (bookTitle !== null) {
      const own = choice(name, 'book', eligibilityChoiceLabel('book', bookTitle), state.choice === 'book', busy, chosen);
      own.append(el('span', 'status-pill library-recommended', LIBRARY_RECOMMENDED));
      fieldset.append(own, choice(name, 'series', LIBRARY_SERIES_ELIGIBILITY, false, true, chosen),
        el('p', 'field-note library-choice-note', LIBRARY_SERIES_ELIGIBILITY_UNAVAILABLE));
    }
    fieldset.append(
      choice(name, 'house', eligibilityChoiceLabel('house', null), state.choice === 'house', busy, chosen),
      consequence,
      choice(name, 'excluded', eligibilityChoiceLabel('excluded', null), state.choice === 'excluded', busy, chosen),
      choice(name, 'deferred', eligibilityChoiceLabel('deferred', null), state.choice === 'deferred', busy, chosen),
    );
    const reason = el('label', 'library-field');
    const text = el('textarea');
    text.rows = 2;
    text.value = state.reason;
    text.dataset['libraryField'] = 'reason';
    text.addEventListener('input', () => {
      state.reason = text.value;
    });
    reason.append(el('span', undefined, LIBRARY_REASON_LABEL), text);
    section.append(fieldset, reason, el('p', 'field-note library-eligibility-boundary', LIBRARY_ELIGIBILITY_BOUNDARY));
    confirm = chooserActions(section, material, LIBRARY_ELIGIBILITY_CONFIRM, 'confirm-eligibility', () => {
      const value = state.choice;
      if (value === null) return;
      const note = state.reason.trim();
      void decide(material, { kind: 'eligibility', choice: value, reason: note.length === 0 ? null : note },
        libraryEligibilityDecided(material.title, eligibilityChoiceLabel(value, bookTitle)));
    });
    confirm.disabled = busy || state.choice === null;
    return section;
  };

  const open = (material: LibraryMaterialProjection, kind: 'attribution' | 'eligibility'): void => {
    if (busy) return;
    refusal = null;
    chooser = kind === 'attribution'
      ? { materialId: material.materialId, kind, choice: null, book: null }
      : { materialId: material.materialId, kind, choice: null, reason: '' };
    // The Books an attribution can name come from 书库's first page, read when the choice is first opened.
    if (kind === 'attribution' && books === null) {
      void loadBooks(material);
      return;
    }
    paint(`[data-material-id="${material.materialId}"] .library-chooser input:not([disabled])`);
  };

  /** 书库's next page of Books for 定归属, in its title order; the first new one takes focus. */
  const loadBooks = async (material: LibraryMaterialProjection, restart = false): Promise<void> => {
    if (busy) return;
    busy = true;
    const first = books === null;
    setStatus(LIBRARY_STATUS.loadingBooks, 'busy');
    try {
      const page = await api.listBooks({ after: first || restart ? null : booksCursor });
      if (!root.isConnected) return;
      books = page.items.map((item) => ({ bookId: item.bookId, title: item.title }));
      onFirstBooksPage = first || restart;
      booksCursor = page.nextCursor;
      busy = false;
      setStatus(LIBRARY_STATUS.opened);
      const added = books[0];
      paint(first || added === undefined
        ? `[data-material-id="${material.materialId}"] .library-chooser input:not([disabled])`
        : `[data-material-id="${material.materialId}"] [data-library-choice="book:${added.bookId}"]`);
    } catch (error) {
      if (!root.isConnected) return;
      busy = false;
      if (first) chooser = null;
      const message = errorMessage(error, LIBRARY_STATUS.booksFailed);
      refusal = { materialId: material.materialId, message };
      setStatus(message, 'error');
      paint(`[data-material-id="${material.materialId}"] h3`);
    }
  };

  /** The next page of items, oldest after the last shown; the first new one takes focus. */
  const loadMore = async (restart = false): Promise<void> => {
    if (busy || chooser !== null || preview !== null || (!restart && cursor === null)) return;
    busy = true;
    setStatus(LIBRARY_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectLibraryMaterials({ after: restart ? null : cursor });
      if (!root.isConnected) return;
      materials = [...page.materials];
      if (pinned !== null) pinned = materials.find((material) => material.materialId === pinned!.materialId) ?? pinned;
      onFirstPage = restart;
      cursor = page.nextCursor;
      busy = false;
      setStatus(LIBRARY_STATUS.opened);
      paint(materials[0] === undefined ? '[data-library-action="add"]' : `[data-material-id="${materials[0].materialId}"] h3`);
    } catch (error) {
      if (!root.isConnected) return;
      busy = false;
      setStatus(errorMessage(error, LIBRARY_STATUS.unavailable), 'error');
      paint(`[data-library-action="${restart ? 'first' : 'more'}"]`);
    }
  };

  const choose = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(LIBRARY_STATUS.choosing, 'busy');
    paint(null);
    try {
      const read = await api.previewLibraryMaterial();
      if (!root.isConnected) return;
      busy = false;
      if (read === null) {
        setStatus(LIBRARY_STATUS.cancelled);
        paint('[data-library-action="add"]');
        return;
      }
      preview = read;
      draft = { title: read.suggestedTitle, kind: read.suggestedKind };
      setStatus(libraryPreviewHeading(read));
      paint('.library-preview h3');
    } catch (error) {
      if (!root.isConnected) return;
      busy = false;
      const message = errorMessage(error, LIBRARY_STATUS.addFailed);
      refusal = { materialId: null, message };
      setStatus(message, 'error');
      paint('[data-library-action="add"]');
    }
  };

  const commit = async (): Promise<void> => {
    if (busy || preview === null || draft.kind === null) return;
    const shown = preview;
    const input = { previewId: shown.previewId, title: draft.title, kind: draft.kind };
    busy = true;
    refusal = null;
    setStatus(LIBRARY_STATUS.adding, 'busy');
    paint(null);
    try {
      const added = await api.addLibraryMaterial(input);
      if (!root.isConnected) return;
      // Keep the completed arrival as the one exact card above the current bounded page.
      pinned = added;
      // Refresh the catalogue independently of the committed arrival. A failed read leaves an explicit reset available.
      onFirstPage = false;
      try {
        const page = await api.inspectLibraryMaterials({ after: null });
        if (!root.isConnected) return;
        materials = [...page.materials];
        cursor = page.nextCursor;
        onFirstPage = true;
        if (materials.some((material) => material.materialId === added.materialId)) pinned = null;
      } catch {
        // The arrival succeeded. Its card and 回到最新资料 remain usable; never report it as a failed import.
      }
      if (!root.isConnected) return;
      busy = false;
      preview = null;
      setStatus(libraryAdded(added.title), 'success');
      paint(`[data-material-id="${added.materialId}"] h3`);
    } catch (error) {
      if (!root.isConnected) return;
      // The preview stays, so a title that could not stand can be written again; one the service no longer holds says so.
      busy = false;
      const message = errorMessage(error, LIBRARY_STATUS.addFailed);
      refusal = { materialId: null, message };
      setStatus(message, 'error');
      paint('.library-preview h3');
    }
  };

  const decide = async (material: LibraryMaterialProjection, decision: LibraryMaterialDecisionInput, success: string): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(LIBRARY_STATUS.deciding, 'busy');
    paint(null);
    try {
      const now = await api.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: material.decisionCount, decision });
      if (!root.isConnected) return;
      replace(now);
      busy = false;
      chooser = null;
      setStatus(success, 'success');
      // After an attribution, the eligibility the item now waits for; after an eligibility decision, the card.
      paint(now.attribution !== null && now.eligibility === null
        ? `[data-material-id="${material.materialId}"] [data-library-action="eligibility"]`
        : `[data-material-id="${material.materialId}"] h3`);
    } catch (error) {
      if (!root.isConnected) return;
      busy = false;
      chooser = null;
      const message = errorMessage(error, LIBRARY_STATUS.decideFailed);
      refusal = { materialId: material.materialId, message };
      setStatus(message, 'error');
      // What stands now, when another window decided first; the page keeps what it read when even that fails.
      try {
        replace(await api.inspectLibraryMaterial({ materialId: material.materialId }));
      } catch {
        // The refusal already says what happened.
      }
      if (!root.isConnected) return;
      paint(`[data-material-id="${material.materialId}"] h3`);
    }
  };

  return {
    async load(): Promise<void> {
      root.dataset['library'] = 'loading';
      try {
        const page = await api.inspectLibraryMaterials({ after: null });
        if (!root.isConnected) return;
        materials = [...page.materials];
        cursor = page.nextCursor;
        // The item 待我处理 opened, read by itself when it is older than the first page.
        if (options.focusMaterialId !== null && !materials.some((material) => material.materialId === options.focusMaterialId)) {
          try {
            pinned = await api.inspectLibraryMaterial({ materialId: options.focusMaterialId });
          } catch {
            pinned = null;
          }
        }
        if (!root.isConnected) return;
        root.dataset['library'] = 'ready';
        const target = options.focusMaterialId === null ? undefined : shown().find((material) => material.materialId === options.focusMaterialId);
        paint(target === undefined
          ? null
          : `[data-material-id="${target.materialId}"] [data-library-action="${target.attribution === null ? 'attribute' : 'eligibility'}"]`);
      } catch (error) {
        if (!root.isConnected) return;
        root.dataset['library'] = 'failed';
        root.replaceChildren(el('p', 'attention-note', errorMessage(error, LIBRARY_STATUS.unavailable)));
        throw error;
      }
    },
  };
}
