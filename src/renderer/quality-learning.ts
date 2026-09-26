import type {
  LearningEligibilityChoice,
  LearningMaterialProjection,
  LearningMaterialsBookProjection,
  LearningMaterialsProjection,
  RendererApi,
} from '../shared/protocol.js';
import {
  LEARNING_CANCEL,
  LEARNING_CARD_TERMS,
  LEARNING_CHANGED_NOTE,
  LEARNING_CHOICE_LEGEND,
  LEARNING_CHOICES,
  LEARNING_EMPTY,
  LEARNING_INFLUENCE,
  LEARNING_MORE,
  LEARNING_NOTE_LABEL,
  LEARNING_OPEN,
  LEARNING_RECOMMENDED,
  LEARNING_RECORD,
  LEARNING_SERIES,
  LEARNING_SERIES_UNAVAILABLE,
  LEARNING_STATE_LABELS,
  LEARNING_STATUS,
  learningBookHeading,
  learningChoiceConsequence,
  learningDecisionLine,
  learningOriginLine,
  learningPeopleLine,
} from './quality-learning-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-002 to LEARN-012, FDBK-013): each Book's Learning Material,
 * grouped by Book with its 作者 and 责编, each with where it stands. `查看…` opens its Review Card in place — the bounded
 * material, where it came from, why it is one, the basis, what it could later influence, and the decision it has — with the
 * choice unselected and `仅纳入当前图书` marked recommended; a wider choice says its consequence beside it before
 * `记录学习准入决定`. Nothing here counts or reminds.
 *
 * Nothing is read whole (Issue #61 review): the materials come forty at a time, `更多学习材料…` reading the next and a Book
 * that runs on continuing its section; a decision answers with its one material, and a refusal reads that material again.
 */
export interface MountLearningMaterialsOptions {
  readonly root: HTMLElement;
  /** The one Book to show, when the page was opened for it; `null` lists every Book with material. */
  readonly bookId: string | null;
  readonly api: Pick<RendererApi, 'inspectLearningMaterials' | 'inspectLearningMaterial' | 'decideLearningMaterial'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['learningAction'] = name;
  node.addEventListener('click', run);
  return node;
}

interface Draft {
  choice: LearningEligibilityChoice | null;
  note: string;
}

export function mountLearningMaterials(options: MountLearningMaterialsOptions): { load(): Promise<void> } {
  const { root, bookId, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('learning-materials');
  let projection: LearningMaterialsProjection | null = null;
  let busy = false;
  /** The one card open, by Book and material, with what the editor chose and wrote so far. */
  let open: { readonly bookId: string; readonly materialKey: string; readonly draft: Draft } | null = null;
  let refusal: string | null = null;

  const materialSelector = (key: string): string => `[data-material-key="${CSS.escape(key)}"]`;

  /** A page read after the first: a Book that runs on continues its section, and the next Book begins its own. */
  const merge = (page: LearningMaterialsProjection): void => {
    if (projection === null) {
      projection = page;
      return;
    }
    const books = [...projection.books];
    for (const book of page.books) {
      const last = books.at(-1);
      if (last !== undefined && last.bookId === book.bookId) books[books.length - 1] = { ...last, materials: [...last.materials, ...book.materials] };
      else books.push(book);
    }
    projection = { basis: page.basis, books, nextCursor: page.nextCursor };
  };

  /** One material as it now reads, wherever its Book's section shows it. */
  const replace = (bookKey: string, next: LearningMaterialProjection): void => {
    if (projection === null) return;
    projection = {
      ...projection,
      books: projection.books.map((book) => (book.bookId !== bookKey ? book : {
        ...book,
        materials: book.materials.map((material) => (material.materialKey === next.materialKey ? next : material)),
      })),
    };
  };

  const loadMore = async (): Promise<void> => {
    if (busy || projection?.nextCursor == null) return;
    busy = true;
    const known = new Set(projection.books.flatMap((book) => book.materials.map((material) => material.materialKey)));
    setStatus(LEARNING_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectLearningMaterials({ bookId, after: projection.nextCursor });
      if (!root.isConnected) return;
      merge(page);
      busy = false;
      setStatus(LEARNING_STATUS.opened);
      const first = page.books.flatMap((book) => book.materials).find((material) => !known.has(material.materialKey));
      paint(first === undefined ? null : `${materialSelector(first.materialKey)} [data-learning-action="open"]`);
    } catch (error) {
      busy = false;
      setStatus(errorMessage(error, LEARNING_STATUS.unavailable), 'error');
      paint('[data-learning-action="more"]');
    }
  };

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    root.dataset['learningBooks'] = String(projection.books.length);
    const parts: HTMLElement[] = [el('p', 'field-note learning-basis', projection.basis)];
    const books = projection.books.filter((book) => book.materials.length > 0);
    if (books.length === 0) parts.push(el('p', 'field-note learning-empty', LEARNING_EMPTY));
    for (const book of books) parts.push(bookNode(book));
    if (projection.nextCursor !== null) {
      const row = el('div', 'button-row learning-more');
      const more = action(LEARNING_MORE, 'secondary', 'more', () => void loadMore());
      more.disabled = busy;
      row.append(more);
      parts.push(row);
    }
    root.replaceChildren(...parts);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const bookNode = (book: LearningMaterialsBookProjection): HTMLElement => {
    const section = el('section', 'learning-book');
    section.dataset['bookId'] = book.bookId;
    section.append(el('h3', undefined, learningBookHeading(book)), el('p', 'field-note learning-people', learningPeopleLine(book)));
    const list = el('ul', 'learning-material-list');
    for (const material of book.materials) list.append(materialNode(book, material));
    section.append(list);
    return section;
  };

  const materialNode = (book: LearningMaterialsBookProjection, material: LearningMaterialProjection): HTMLElement => {
    const item = el('li', 'learning-material');
    item.dataset['materialKey'] = material.materialKey;
    item.dataset['learningState'] = material.state;
    const head = el('div', 'learning-material-head');
    const pill = el('span', `status-pill learning-state learning-state-${material.state}`, LEARNING_STATE_LABELS[material.state]);
    head.append(el('span', 'learning-origin', learningOriginLine(material, localInstantLabel)), pill);
    item.append(head);
    const isOpen = open !== null && open.bookId === book.bookId && open.materialKey === material.materialKey;
    if (isOpen) {
      item.append(cardNode(book, material, open!.draft));
    } else {
      const view = action(LEARNING_OPEN, 'quiet', 'open', () => {
        if (busy) return;
        open = { bookId: book.bookId, materialKey: material.materialKey, draft: { choice: null, note: '' } };
        refusal = null;
        paint(`${materialSelector(material.materialKey)} .learning-card h4`);
      });
      view.setAttribute('aria-label', `${LEARNING_OPEN.replace('…', '')}：${material.originLabel}`);
      view.disabled = busy;
      item.append(view);
    }
    return item;
  };

  const cardNode = (book: LearningMaterialsBookProjection, material: LearningMaterialProjection, draft: Draft): HTMLElement => {
    const card = el('section', 'learning-card');
    card.setAttribute('aria-label', `学习材料：${material.originLabel}`);
    const heading = el('h4', undefined, material.originLabel);
    heading.tabIndex = -1;
    const excerpt = el('ul', 'learning-excerpt');
    for (const line of material.excerpt) excerpt.append(el('li', undefined, line));
    const facts = el('dl', 'learning-facts');
    const fact = (term: string, value: HTMLElement | string, key: string): void => {
      const dd = typeof value === 'string' ? el('dd', undefined, value) : el('dd');
      if (typeof value !== 'string') dd.append(value);
      dd.dataset['learningFact'] = key;
      facts.append(el('dt', undefined, term), dd);
    };
    fact(LEARNING_CARD_TERMS.excerpt, excerpt, 'excerpt');
    fact(LEARNING_CARD_TERMS.origin, learningOriginLine(material, localInstantLabel), 'origin');
    fact(LEARNING_CARD_TERMS.rationale, material.rationale, 'rationale');
    fact(LEARNING_CARD_TERMS.basis, projection?.basis ?? '', 'basis');
    fact(LEARNING_CARD_TERMS.influence, LEARNING_INFLUENCE, 'influence');
    fact(LEARNING_CARD_TERMS.decision, learningDecisionLine(material, localInstantLabel), 'decision');
    card.append(heading, facts);
    if (material.state === 'changed') card.append(el('p', 'attention-note learning-changed', LEARNING_CHANGED_NOTE));

    // The choice, none selected; the recommendation is a pill beside it, never a checked box (LEARN-004).
    const choices = el('fieldset', 'learning-choices');
    choices.append(el('legend', undefined, LEARNING_CHOICE_LEGEND));
    const consequence = el('p', 'field-note learning-consequence');
    consequence.setAttribute('aria-live', 'polite');
    const record = action(LEARNING_RECORD, 'primary', 'record', () => void save(book, material, draft));
    const show = (): void => {
      consequence.hidden = draft.choice === null;
      consequence.textContent = draft.choice === null ? '' : learningChoiceConsequence(draft.choice, book.title);
      record.disabled = busy || draft.choice === null;
    };
    const radio = (value: LearningEligibilityChoice | 'series', label: string, disabled: boolean): HTMLLabelElement => {
      const wrapper = el('label', 'learning-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = `learning-choice-${material.materialKey}`;
      input.value = value;
      input.checked = value !== 'series' && draft.choice === value;
      input.disabled = disabled || busy;
      input.addEventListener('change', () => {
        if (!input.checked || value === 'series') return;
        draft.choice = value;
        show();
      });
      wrapper.append(input, el('span', undefined, label));
      return wrapper;
    };
    for (const entry of LEARNING_CHOICES) {
      const option = radio(entry.choice, entry.label, false);
      if (entry.choice === 'book') option.append(el('span', 'status-pill learning-recommended', LEARNING_RECOMMENDED));
      choices.append(option);
      if (entry.choice === 'book') {
        const series = radio('series', LEARNING_SERIES, true);
        series.append(el('span', 'field-note learning-series-reason', LEARNING_SERIES_UNAVAILABLE));
        choices.append(series);
      }
    }
    const noteField = el('label', 'learning-note');
    const note = el('textarea');
    note.rows = 2;
    note.value = draft.note;
    note.disabled = busy;
    note.dataset['learningField'] = 'note';
    note.addEventListener('input', () => { draft.note = note.value; });
    noteField.append(el('span', undefined, LEARNING_NOTE_LABEL), note);
    const cancel = action(LEARNING_CANCEL, 'secondary', 'cancel', () => {
      if (busy) return;
      open = null;
      refusal = null;
      paint(`${materialSelector(material.materialKey)} [data-learning-action="open"]`);
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row learning-actions');
    buttons.append(record, cancel);
    show();
    card.append(choices, consequence, noteField, buttons);
    if (refusal !== null) {
      const alert = el('p', 'attention-note learning-refusal', refusal);
      alert.setAttribute('role', 'alert');
      card.append(alert);
    }
    card.append(technicalDetails('learning-facts',
      el('dt', undefined, '学习材料'), el('dd', 'technical-identity', `${material.materialKey} · ${material.digest}`),
      el('dt', undefined, '决定次数'), el('dd', 'technical-identity', String(material.decisions)),
    ));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      cancel.click();
    });
    return card;
  };

  const save = async (book: LearningMaterialsBookProjection, material: LearningMaterialProjection, draft: Draft): Promise<void> => {
    if (busy || draft.choice === null) return;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(LEARNING_STATUS.recording, 'busy');
    try {
      const decided = await api.decideLearningMaterial({
        bookId: book.bookId,
        materialKey: material.materialKey,
        materialDigest: material.digest,
        expectedDecisions: material.decisions,
        choice: draft.choice,
        note: draft.note.trim().length === 0 ? null : draft.note,
      });
      replace(book.bookId, decided);
      busy = false;
      open = null;
      paint(`${materialSelector(material.materialKey)} [data-learning-action="open"]`);
      setStatus(LEARNING_STATUS.recorded, 'success');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, LEARNING_STATUS.failed);
      // What moved since the card opened is read again, so the next 记录 answers what is there now; a material that changed
      // meanwhile is a new version, and a choice made on the old one never carries over to it (Issue #61 review).
      try {
        const fresh = await api.inspectLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey });
        if (fresh.digest !== material.digest) draft.choice = null;
        replace(book.bookId, fresh);
      } catch { /* the page keeps what it had */ }
      paint(`${materialSelector(material.materialKey)} [data-learning-action="record"]`);
      setStatus(refusal, 'error');
    }
  };

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', LEARNING_STATUS.loading));
      projection = null;
      merge(await api.inspectLearningMaterials({ bookId, after: null }));
      paint(null);
    },
  };
}
