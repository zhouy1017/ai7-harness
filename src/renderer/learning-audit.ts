import type {
  LearningAuditBookProjection,
  LearningAuditChoicesProjection,
  LearningAuditInput,
  LearningAuditMaterialProjection,
  LearningAuditProjection,
  LearningLineageProjection,
  LearningMaterialCursor,
  LearningRemediationItemInput,
  LearningRemediationPreviewProjection,
  RendererApi,
} from '../shared/protocol.js';
import { LEARNING_AUDIT_STANDINGS, LEARNING_MATERIAL_KINDS } from '../shared/protocol.js';
import {
  LEARNING_AUDIT_ALL,
  LEARNING_AUDIT_BATCH_MISMATCH,
  LEARNING_AUDIT_CLEAR_SELECTION,
  LEARNING_AUDIT_EMPTY,
  LEARNING_AUDIT_FILTERS,
  LEARNING_AUDIT_FILTERS_LATER,
  LEARNING_AUDIT_FIRST,
  LEARNING_AUDIT_KIND_LABELS,
  LEARNING_AUDIT_MORE,
  LEARNING_AUDIT_NONE_MATCH,
  LEARNING_AUDIT_NOTE,
  LEARNING_AUDIT_OPEN,
  LEARNING_AUDIT_SEARCH,
  LEARNING_AUDIT_STANDING_LABELS,
  LEARNING_AUDIT_STATUS,
  LEARNING_AUDIT_UNUSED,
  LEARNING_LINEAGE_BACK,
  LEARNING_LINEAGE_FORWARD,
  LEARNING_LINEAGE_NO_DECISION,
  LEARNING_LINEAGE_NOT_YET,
  LEARNING_LINEAGE_REINCLUDE,
  LEARNING_LINEAGE_REINCLUDE_LEGEND,
  LEARNING_LINEAGE_REINCLUDE_NOTE,
  LEARNING_LINEAGE_STEPS,
  LEARNING_LINEAGE_STOP,
  LEARNING_LINEAGE_TASKS_NONE,
  LEARNING_LINEAGE_WHY_EMPTY,
  LEARNING_REMEDIATION_CANCEL,
  LEARNING_REMEDIATION_CONFIRM,
  LEARNING_REMEDIATION_GROUPS,
  LEARNING_REMEDIATION_HEADING,
  LEARNING_REMEDIATION_MEMORY,
  LEARNING_REMEDIATION_RUNNING,
  learningAuditBatchStop,
  learningAuditBookHeading,
  learningAuditChoicesCut,
  learningAuditMaterialName,
  learningAuditMaterialNames,
  learningAuditOpenLabel,
  learningAuditSelectLabel,
  learningAuditSelected,
  learningLineageDecisionLine,
  learningLineageDecisionStatus,
  learningLineageEarlier,
  learningLineageHeading,
  learningRemediationCompleted,
  learningRemediationFuture,
  learningRemediationLeftOutLine,
  learningRemediationOutcome,
  learningRemediationRereadFailed,
  LEARNING_REMEDIATION_INCLUDED,
} from './learning-audit-labels.js';
import {
  LEARNING_CHOICES,
  LEARNING_RECORD,
  feedbackAttributionLine,
  feedbackDateBounds,
  learningChoiceConsequence,
  learningOriginLine,
  learningPeopleLine,
} from './quality-learning-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 质量与学习 › 学习回溯 (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012): every Book's Learning Material, Book by Book,
 * filtered before paging by search, Book, Series, type, time and where it stands, each saying what used it. `查看来源链…`
 * opens its Learning Lineage Explorer in place — 学习材料 → 准入决定 → 学习信号 → 记忆候选 → 已启用记忆 → 使用过的任务 —
 * with the whole chain of decisions and ids under `审计详情`; `返回学习回溯` comes back to the row it left. `停止今后使用…`
 * opens a 学习补救影响预览 in its four groups first, and only `确认停止今后使用` appends the exclusion; an excluded material
 * may be re-included, a new decision beside the old. A selection of one Book's materials of one kind and one scope stops
 * together; whatever drifted is named and left out.
 */
export interface MountLearningAuditOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectLearningAudit' | 'inspectLearningLineage' | 'previewLearningRemediation' | 'recordLearningRemediation' |
    'decideLearningMaterial'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
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
  node.dataset['learningAuditAction'] = name;
  node.addEventListener('click', run);
  return node;
}

type Filter = keyof typeof LEARNING_AUDIT_FILTERS;
interface Selected { readonly bookId: string; readonly material: LearningAuditMaterialProjection }
type Panel =
  | null
  | { readonly kind: 'preview'; readonly preview: LearningRemediationPreviewProjection; readonly items: ReadonlyArray<LearningRemediationItemInput> }
  | { kind: 'reinclude'; choice: 'book' | 'house' | null };

const itemOf = (material: { readonly materialKey: string; readonly digest: string; readonly decisions: number }): LearningRemediationItemInput =>
  ({ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions });

/**
 * The audit's local view state (interaction-spec, Learning Audit rules): the filters and the page they were read at, kept in
 * this window across 质量与学习's tabs and other screens. It is not Learning Audit authority and does not outlive a restart.
 */
let remembered: { readonly chosen: Readonly<Record<Filter, string>>; readonly pageAfter: LearningMaterialCursor | null } | null = null;

export function mountLearningAudit(options: MountLearningAuditOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('learning-audit');
  let projection: LearningAuditProjection | null = null;
  /** The filters as the editor set them; `''` is 全部. */
  let chosen: Record<Filter, string> = { query: '', book: '', series: '', kind: '', standing: '', from: '', to: '' };
  /** The cursor the shown page was read from: `null` for the first. */
  let pageAfter: LearningMaterialCursor | null = null;
  /**
   * The filters' choices as the last page answered them (LAUD-002; Issue #677): the house's Books and Series, and whether
   * either list was cut. The 图书 filter also keeps every Book a page has named, so a chosen Book stays offered.
   */
  let filterChoices: LearningAuditChoicesProjection = { books: [], booksTruncated: false, series: [], seriesTruncated: false };
  const knownBooks = new Map<string, string>();
  /** Each material's name on the shown page, told apart where two read alike (Issue #677). */
  let names = new Map<string, string>();
  let busy = false;
  const selection = new Map<string, Selected>();
  let batch: Extract<Panel, { kind: 'preview' }> | null = null;
  /** A batch refusal kept above the re-read list, so the editor sees why the preview closed. */
  let listRefusal: string | null = null;
  /** The explorer open, if any: its material, what it read, the panel open beneath it, and a refusal to show. */
  let lineage: { readonly bookId: string; readonly materialKey: string; projection: LearningLineageProjection; panel: Panel; refusal: string | null } | null = null;
  /** A record made in the explorer: the list reads its page again on the way back. */
  let listStale = false;

  const rowSelector = (key: string): string => `[data-material-key="${CSS.escape(key)}"]`;
  const focusOn = (selector: string | null): void => {
    if (selector === null) return;
    const target = root.querySelector<HTMLElement>(selector);
    if (target !== null && !target.matches(':disabled')) target.focus();
    else root.querySelector<HTMLElement>('h4, .learning-audit-none, #learning-audit-query')?.focus();
  };

  const inputOf = (filters: Record<Filter, string>, after: LearningMaterialCursor | null): LearningAuditInput | null => {
    const bounds = feedbackDateBounds(filters.from, filters.to);
    if (bounds === null) return null;
    return {
      bookId: filters.book || null,
      seriesId: filters.series || null,
      kind: LEARNING_MATERIAL_KINDS.find((kind) => kind === filters.kind) ?? null,
      standing: LEARNING_AUDIT_STANDINGS.find((standing) => standing === filters.standing) ?? null,
      query: filters.query.trim() === '' ? null : filters.query.trim(),
      ...bounds,
      after,
    };
  };

  /**
   * Reads one page for the filters; on success the page, filters and cursor are the shown ones, the selection clears, and it
   * answers `true`. A failed read keeps the page that was shown, says so in the status, and answers `false`.
   */
  const request = async (filters: Record<Filter, string>, after: LearningMaterialCursor | null, focus: string | null, refusal: string | null = null): Promise<boolean> => {
    if (busy) return false;
    const input = inputOf(filters, after);
    if (input === null) {
      setStatus(LEARNING_AUDIT_STATUS.invalidDates, 'error');
      paint(focus);
      return false;
    }
    busy = true;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.loading, 'busy');
    let read = false;
    try {
      const page = await api.inspectLearningAudit(input);
      if (!root.isConnected) return false;
      projection = page;
      chosen = { ...filters };
      pageAfter = after;
      remembered = { chosen: { ...filters }, pageAfter: after };
      filterChoices = page.choices;
      for (const book of page.choices.books) knownBooks.set(book.bookId, book.title);
      for (const book of page.books) knownBooks.set(book.bookId, book.title);
      names = learningAuditMaterialNames(page.books.flatMap((book) => book.materials), localInstantLabel);
      selection.clear();
      batch = null;
      listRefusal = refusal;
      listStale = false;
      read = true;
      setStatus(LEARNING_AUDIT_STATUS.opened);
    } catch (error) {
      if (projection === null) {
        busy = false;
        throw error;
      }
      if (root.isConnected) setStatus(errorMessage(error, LEARNING_AUDIT_STATUS.unavailable), 'error');
    } finally {
      busy = false;
      if (root.isConnected) paint(focus);
    }
    return read;
  };

  const paint = (focus: string | null): void => {
    if (lineage !== null) paintLineage(focus);
    else paintList(focus);
  };

  // ---- the list -------------------------------------------------------------------------------------------------------

  /** The search as typed: another filter changed applies it too, so words typed are never dropped. */
  const liveQuery = (): string => root.querySelector<HTMLInputElement>('#learning-audit-query')?.value ?? chosen.query;

  /** A material's name as its page tells it apart from any that read alike. */
  const nameOf = (material: Parameters<typeof learningAuditMaterialName>[0] & { readonly materialKey: string }): string =>
    names.get(material.materialKey) ?? learningAuditMaterialName(material, localInstantLabel);

  /** The note under a filter whose list was cut, which that filter names as its description. */
  const cutNote = (filter: 'book' | 'series', listed: number): HTMLElement => {
    const note = el('p', `field-note learning-audit-cut learning-audit-cut-${filter}`, learningAuditChoicesCut(filter, listed));
    note.id = `learning-audit-cut-${filter}`;
    return note;
  };

  const select = (filter: 'book' | 'series' | 'kind' | 'standing', choices: ReadonlyArray<readonly [string, string]>): HTMLLabelElement => {
    const wrapper = el('label', 'feedback-filter learning-audit-filter');
    const control = el('select');
    control.id = `learning-audit-filter-${filter}`;
    control.dataset['learningAuditFilter'] = filter;
    for (const [value, label] of [['', LEARNING_AUDIT_ALL] as const, ...choices]) {
      const option = el('option', undefined, label);
      option.value = value;
      control.append(option);
    }
    control.value = chosen[filter];
    control.disabled = busy;
    if ((filter === 'book' && filterChoices.booksTruncated) || (filter === 'series' && filterChoices.seriesTruncated)) {
      control.setAttribute('aria-describedby', `learning-audit-cut-${filter}`);
    }
    control.addEventListener('change', () => {
      if (busy) return;
      void request({ ...chosen, query: liveQuery(), [filter]: control.value }, null, `#learning-audit-filter-${filter}`);
    });
    wrapper.append(el('span', undefined, LEARNING_AUDIT_FILTERS[filter]), control);
    return wrapper;
  };

  const dateFilter = (filter: 'from' | 'to'): HTMLLabelElement => {
    const wrapper = el('label', 'feedback-filter learning-audit-filter');
    const control = el('input');
    control.type = 'date';
    control.id = `learning-audit-filter-${filter}`;
    control.value = chosen[filter];
    control.disabled = busy;
    control.addEventListener('change', () => {
      if (busy) return;
      void request({ ...chosen, query: liveQuery(), [filter]: control.value }, null, `#learning-audit-filter-${filter}`);
    });
    wrapper.append(el('span', undefined, LEARNING_AUDIT_FILTERS[filter]), control);
    return wrapper;
  };

  const searchFilter = (): HTMLFormElement => {
    const form = el('form', 'learning-audit-search');
    form.setAttribute('role', 'search');
    const label = el('label', 'feedback-filter learning-audit-filter');
    const control = el('input');
    control.type = 'search';
    control.id = 'learning-audit-query';
    control.maxLength = 100;
    control.value = chosen.query;
    control.disabled = busy;
    label.append(el('span', undefined, LEARNING_AUDIT_FILTERS.query), control);
    const go = el('button', 'button secondary', LEARNING_AUDIT_SEARCH);
    go.type = 'submit';
    go.dataset['learningAuditAction'] = 'search';
    go.disabled = busy;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      void request({ ...chosen, query: control.value }, null, '#learning-audit-query');
    });
    form.append(label, go);
    return form;
  };

  /** Whether the selection may stop together: one Book, one kind, one scope (LAUD-010). */
  const homogeneous = (): boolean => {
    const all = [...selection.values()];
    return all.length > 0 && all.every((entry) => entry.bookId === all[0]!.bookId && entry.material.kind === all[0]!.material.kind &&
      entry.material.standing === all[0]!.material.standing);
  };

  const batchNode = (): HTMLElement => {
    const section = el('section', 'learning-audit-batch');
    section.setAttribute('aria-label', learningAuditSelected(selection.size));
    section.append(el('p', 'learning-audit-selected', learningAuditSelected(selection.size)));
    const row = el('div', 'button-row');
    const stop = action(learningAuditBatchStop(selection.size), 'secondary', 'batch-stop', () => void previewBatch());
    stop.disabled = busy || batch !== null || !homogeneous();
    const clear = action(LEARNING_AUDIT_CLEAR_SELECTION, 'quiet', 'clear-selection', () => {
      if (busy) return;
      selection.clear();
      batch = null;
      paint('#learning-audit-query');
    });
    clear.disabled = busy;
    row.append(stop, clear);
    section.append(row);
    if (!homogeneous()) section.append(el('p', 'field-note learning-audit-mismatch', LEARNING_AUDIT_BATCH_MISMATCH));
    if (batch !== null) section.append(previewNode(batch, null, (materialKey) => {
      const entry = selection.get(materialKey);
      return entry === undefined ? null : nameOf(entry.material);
    }, () => {
      batch = null;
      paint('[data-learning-audit-action="batch-stop"]');
    }, () => void confirmBatch()));
    return section;
  };

  const paintList = (focus: string | null): void => {
    if (projection === null) return;
    const parts: HTMLElement[] = [el('p', 'field-note learning-audit-note', LEARNING_AUDIT_NOTE)];
    const filters = el('div', 'feedback-filters learning-audit-filters');
    filters.append(
      searchFilter(),
      select('book', [...knownBooks].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([bookId, title]) => [bookId, `《${title}》`] as const)),
      select('series', filterChoices.series.map((entry) => [entry.seriesId, entry.title] as const)),
      select('kind', LEARNING_MATERIAL_KINDS.map((kind) => [kind, LEARNING_AUDIT_KIND_LABELS[kind]] as const)),
      select('standing', LEARNING_AUDIT_STANDINGS.map((standing) => [standing, LEARNING_AUDIT_STANDING_LABELS[standing]] as const)),
      dateFilter('from'), dateFilter('to'),
    );
    parts.push(filters);
    // A house with more Books or Series than the filters list says so beside them (Issue #677).
    if (filterChoices.booksTruncated) parts.push(cutNote('book', filterChoices.books.length));
    if (filterChoices.seriesTruncated) parts.push(cutNote('series', filterChoices.series.length));
    parts.push(el('p', 'field-note learning-audit-later', LEARNING_AUDIT_FILTERS_LATER));
    if (listRefusal !== null) {
      const alert = el('p', 'attention-note learning-audit-refusal', listRefusal);
      alert.setAttribute('role', 'alert');
      alert.tabIndex = -1;
      parts.push(alert);
    }
    if (selection.size > 0) parts.push(batchNode());
    root.dataset['learningAuditBooks'] = String(projection.books.length);
    root.dataset['learningAuditView'] = 'list';
    if (projection.books.length === 0) {
      const none = el('p', 'field-note learning-audit-none',
        Object.values(chosen).every((value) => value === '') && pageAfter === null ? LEARNING_AUDIT_EMPTY : LEARNING_AUDIT_NONE_MATCH);
      none.tabIndex = -1;
      none.setAttribute('role', 'status');
      parts.push(none);
    }
    for (const book of projection.books) parts.push(bookNode(book));
    if (projection.nextCursor !== null || pageAfter !== null) {
      const row = el('div', 'button-row learning-audit-pages');
      if (projection.nextCursor !== null) {
        const more = action(LEARNING_AUDIT_MORE, 'secondary', 'more', () => void request(chosen, projection!.nextCursor, '[data-learning-audit-action="open"]'));
        more.disabled = busy;
        row.append(more);
      }
      if (pageAfter !== null) {
        const first = action(LEARNING_AUDIT_FIRST, 'secondary', 'first', () => void request(chosen, null, '[data-learning-audit-action="open"]'));
        first.disabled = busy;
        row.append(first);
      }
      parts.push(row);
    }
    root.replaceChildren(...parts);
    focusOn(focus);
  };

  const bookNode = (book: LearningAuditBookProjection): HTMLElement => {
    const section = el('section', 'learning-book learning-audit-book');
    section.dataset['bookId'] = book.bookId;
    section.append(el('h3', undefined, learningAuditBookHeading(book)), el('p', 'field-note learning-people', learningPeopleLine(book)));
    const list = el('ul', 'learning-material-list');
    for (const material of book.materials) list.append(materialNode(book, material));
    section.append(list);
    return section;
  };

  const materialNode = (book: LearningAuditBookProjection, material: LearningAuditMaterialProjection): HTMLElement => {
    const item = el('li', 'learning-material learning-audit-material');
    item.dataset['materialKey'] = material.materialKey;
    item.dataset['learningStanding'] = material.standing;
    const head = el('div', 'learning-material-head');
    if (material.standing === 'book' || material.standing === 'house') {
      const check = el('input', 'learning-audit-select');
      check.type = 'checkbox';
      check.checked = selection.has(material.materialKey);
      check.disabled = busy || batch !== null;
      check.setAttribute('aria-label', learningAuditSelectLabel(nameOf(material)));
      check.addEventListener('change', () => {
        if (busy || batch !== null) return;
        if (check.checked) selection.set(material.materialKey, { bookId: book.bookId, material });
        else selection.delete(material.materialKey);
        paint(`${rowSelector(material.materialKey)} .learning-audit-select`);
      });
      head.append(check);
    }
    head.append(
      el('span', 'learning-origin', learningOriginLine(material, localInstantLabel)),
      el('span', `status-pill learning-state learning-audit-standing learning-audit-standing-${material.standing}`, LEARNING_AUDIT_STANDING_LABELS[material.standing]),
    );
    item.append(head);
    const reason = material.excerpt.at(-1);
    if (reason !== undefined) item.append(el('p', 'learning-audit-excerpt', reason));
    item.append(el('p', 'field-note learning-audit-use', LEARNING_AUDIT_UNUSED));
    const open = action(LEARNING_AUDIT_OPEN, 'quiet', 'open', () => void openLineage(book.bookId, material.materialKey));
    open.setAttribute('aria-label', learningAuditOpenLabel(nameOf(material)));
    open.disabled = busy || batch !== null;
    item.append(open);
    return item;
  };

  const previewBatch = async (): Promise<void> => {
    if (busy || !homogeneous()) return;
    const entries = [...selection.values()];
    const items = entries.map((entry) => itemOf(entry.material));
    busy = true;
    listRefusal = null;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.previewing, 'busy');
    try {
      const preview = await api.previewLearningRemediation({ bookId: entries[0]!.bookId, items });
      if (!root.isConnected) return;
      batch = { kind: 'preview', preview, items };
      setStatus(LEARNING_REMEDIATION_HEADING);
    } catch (error) {
      if (root.isConnected) setStatus(errorMessage(error, LEARNING_AUDIT_STATUS.previewFailed), 'error');
    } finally {
      busy = false;
      if (root.isConnected) paint(batch === null ? '[data-learning-audit-action="batch-stop"]' : '.learning-remediation-preview h4');
    }
  };

  const confirmBatch = async (): Promise<void> => {
    if (busy || batch === null) return;
    const { preview, items } = batch;
    busy = true;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.recording, 'busy');
    let outcome: Awaited<ReturnType<typeof api.recordLearningRemediation>>;
    try {
      outcome = await api.recordLearningRemediation({ bookId: preview.bookId, items, previewDigest: preview.previewDigest });
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      // The preview is known stale or refused: it closes, the page is read again so every row shows where it stands now, and
      // the refusal stays above it — as the explorer does with its chain.
      const refusal = errorMessage(error, LEARNING_AUDIT_STATUS.failed);
      batch = null;
      if (await request(chosen, pageAfter, '.learning-audit-refusal', refusal)) {
        setStatus(refusal, 'error');
        return;
      }
      // Not read again: the refusal stays above the page, and the status says the list may be out of date, as a recorded
      // batch's does (Issue #677).
      listRefusal = refusal;
      paint('.learning-audit-refusal');
      setStatus(learningRemediationRereadFailed(refusal), 'error');
      return;
    }
    busy = false;
    if (!root.isConnected) return;
    // The record stands whatever the read after it does: the preview and the selection it was made of close first.
    batch = null;
    selection.clear();
    const message = learningRemediationOutcome(outcome.recorded.length, outcome.leftOut.length);
    if (await request(chosen, pageAfter, '#learning-audit-query')) setStatus(message, 'success');
    else {
      paint('#learning-audit-query');
      setStatus(learningRemediationRereadFailed(message), 'error');
    }
  };

  // ---- 学习补救影响预览 ------------------------------------------------------------------------------------------------

  const previewNode = (
    panel: Extract<Panel, { kind: 'preview' }>,
    refusal: string | null,
    nameOf: (materialKey: string) => string | null,
    cancel: () => void,
    confirm: () => void,
  ): HTMLElement => {
    const { preview } = panel;
    const section = el('section', 'learning-remediation-preview');
    section.setAttribute('aria-label', LEARNING_REMEDIATION_HEADING);
    section.dataset['remediationIncluded'] = String(preview.included.length);
    const heading = el('h4', undefined, LEARNING_REMEDIATION_HEADING);
    heading.tabIndex = -1;
    section.append(heading);
    if (preview.included.length > 0) {
      const included = el('ul', 'learning-remediation-included');
      for (const entry of preview.included) included.append(el('li', undefined, nameOf(entry.materialKey) ?? entry.originLabel));
      section.append(el('p', 'field-note', LEARNING_REMEDIATION_INCLUDED), included);
    }
    const texts: Record<(typeof LEARNING_REMEDIATION_GROUPS)[number]['group'], string> = {
      future: learningRemediationFuture(preview.groups.future, preview.scope, preview.bookTitle),
      running: LEARNING_REMEDIATION_RUNNING,
      memory: LEARNING_REMEDIATION_MEMORY,
      completed: learningRemediationCompleted(preview.groups.decisionsKept),
    };
    const counts: Record<(typeof LEARNING_REMEDIATION_GROUPS)[number]['group'], number> = {
      future: preview.groups.future, running: preview.groups.running, memory: preview.groups.memory, completed: preview.groups.completed,
    };
    for (const { group, label } of LEARNING_REMEDIATION_GROUPS) {
      const node = el('div', 'learning-remediation-group');
      node.dataset['remediationGroup'] = group;
      node.dataset['remediationCount'] = String(counts[group]);
      node.append(el('h5', undefined, `${label} · ${counts[group]}`), el('p', undefined, texts[group]));
      section.append(node);
    }
    if (preview.leftOut.length > 0) {
      const list = el('ul', 'learning-remediation-left-out');
      for (const entry of preview.leftOut) {
        const line = el('li', undefined, learningRemediationLeftOutLine({ name: nameOf(entry.materialKey) ?? entry.originLabel, reason: entry.reason }));
        line.dataset['leftOutReason'] = entry.reason;
        list.append(line);
      }
      section.append(list);
    }
    const row = el('div', 'button-row');
    const confirmButton = action(LEARNING_REMEDIATION_CONFIRM, 'primary', 'confirm', confirm);
    confirmButton.disabled = busy || preview.included.length === 0;
    const cancelButton = action(LEARNING_REMEDIATION_CANCEL, 'secondary', 'cancel-preview', cancel);
    cancelButton.disabled = busy;
    row.append(confirmButton, cancelButton);
    section.append(row);
    if (refusal !== null) {
      const alert = el('p', 'attention-note learning-audit-refusal', refusal);
      alert.setAttribute('role', 'alert');
      section.append(alert);
    }
    return section;
  };

  // ---- the Learning Lineage Explorer --------------------------------------------------------------------------------------

  const openLineage = async (bookId: string, materialKey: string, focus = '.learning-lineage h4'): Promise<void> => {
    if (busy) return;
    busy = true;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.lineage, 'busy');
    try {
      const read = await api.inspectLearningLineage({ bookId, materialKey });
      if (!root.isConnected) return;
      lineage = { bookId, materialKey, projection: read, panel: null, refusal: lineage?.materialKey === materialKey ? lineage.refusal : null };
      setStatus(LEARNING_AUDIT_STATUS.lineageOpened);
    } catch (error) {
      if (root.isConnected) setStatus(errorMessage(error, LEARNING_AUDIT_STATUS.lineageUnavailable), 'error');
    } finally {
      busy = false;
      if (root.isConnected) paint(lineage === null ? `${rowSelector(materialKey)} [data-learning-audit-action="open"]` : focus);
    }
  };

  const back = async (): Promise<void> => {
    if (busy || lineage === null) return;
    const key = lineage.materialKey;
    lineage = null;
    const focus = `${rowSelector(key)} [data-learning-audit-action="open"]`;
    if (listStale) await request(chosen, pageAfter, focus);
    else paint(focus);
  };

  const stopOne = async (): Promise<void> => {
    if (busy || lineage === null) return;
    const open = lineage;
    const items = [itemOf(open.projection.material)];
    busy = true;
    open.refusal = null;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.previewing, 'busy');
    try {
      const preview = await api.previewLearningRemediation({ bookId: open.bookId, items });
      if (!root.isConnected) return;
      open.panel = { kind: 'preview', preview, items };
      setStatus(LEARNING_REMEDIATION_HEADING);
    } catch (error) {
      if (root.isConnected) setStatus(errorMessage(error, LEARNING_AUDIT_STATUS.previewFailed), 'error');
    } finally {
      busy = false;
      if (root.isConnected) paint(open.panel === null ? '[data-learning-audit-action="stop"]' : '.learning-remediation-preview h4');
    }
  };

  const confirmOne = async (): Promise<void> => {
    if (busy || lineage?.panel?.kind !== 'preview') return;
    const open = lineage;
    const { preview, items } = lineage.panel;
    busy = true;
    open.refusal = null;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.recording, 'busy');
    try {
      const outcome = await api.recordLearningRemediation({ bookId: open.bookId, items, previewDigest: preview.previewDigest });
      busy = false;
      listStale = true;
      if (!root.isConnected) return;
      await openLineage(open.bookId, open.materialKey, '.learning-lineage h4');
      setStatus(learningRemediationOutcome(outcome.recorded.length, outcome.leftOut.length), 'success');
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      // What moved since the preview is read again, so the next 停止今后使用 answers what is there now.
      open.refusal = errorMessage(error, LEARNING_AUDIT_STATUS.failed);
      const refusal = open.refusal;
      await openLineage(open.bookId, open.materialKey, '.learning-audit-refusal');
      setStatus(refusal, 'error');
    }
  };

  const reinclude = async (): Promise<void> => {
    if (busy || lineage?.panel?.kind !== 'reinclude' || lineage.panel.choice === null) return;
    const open = lineage;
    const choice = lineage.panel.choice;
    busy = true;
    open.refusal = null;
    paint(null);
    setStatus(LEARNING_AUDIT_STATUS.reincluding, 'busy');
    try {
      await api.decideLearningMaterial({
        bookId: open.bookId, materialKey: open.materialKey, materialDigest: open.projection.material.digest,
        expectedDecisions: open.projection.material.decisions, choice, note: null,
      });
      busy = false;
      listStale = true;
      if (!root.isConnected) return;
      await openLineage(open.bookId, open.materialKey, '.learning-lineage h4');
      setStatus(LEARNING_AUDIT_STATUS.reincluded, 'success');
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      open.refusal = errorMessage(error, LEARNING_AUDIT_STATUS.reincludeFailed);
      const refusal = open.refusal;
      await openLineage(open.bookId, open.materialKey, '.learning-audit-refusal');
      setStatus(refusal, 'error');
    }
  };

  const closePanel = (): void => {
    if (busy || lineage === null || lineage.panel === null) return;
    const was = lineage.panel.kind;
    lineage.panel = null;
    paint(`[data-learning-audit-action="${was === 'preview' ? 'stop' : 'reinclude'}"]`);
  };

  const reincludeNode = (open: NonNullable<typeof lineage>, panel: Extract<Panel, { kind: 'reinclude' }>): HTMLElement => {
    const fieldset = el('fieldset', 'learning-choices learning-reinclude');
    fieldset.append(el('legend', undefined, LEARNING_LINEAGE_REINCLUDE_LEGEND));
    const consequence = el('p', 'field-note learning-consequence');
    consequence.setAttribute('aria-live', 'polite');
    const record = action(LEARNING_RECORD, 'primary', 'reinclude-record', () => void reinclude());
    const show = (): void => {
      consequence.hidden = panel.choice === null;
      consequence.textContent = panel.choice === null ? '' : learningChoiceConsequence(panel.choice, open.projection.bookTitle);
      record.disabled = busy || panel.choice === null;
    };
    for (const entry of LEARNING_CHOICES) {
      if (entry.choice !== 'book' && entry.choice !== 'house') continue;
      const value = entry.choice;
      const wrapper = el('label', 'learning-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = 'learning-reinclude';
      input.value = value;
      input.checked = panel.choice === value;
      input.disabled = busy;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        panel.choice = value;
        show();
      });
      wrapper.append(input, el('span', undefined, entry.label));
      fieldset.append(wrapper);
    }
    const cancel = action(LEARNING_REMEDIATION_CANCEL, 'secondary', 'reinclude-cancel', closePanel);
    cancel.disabled = busy;
    const row = el('div', 'button-row');
    row.append(record, cancel);
    show();
    fieldset.append(consequence, el('p', 'field-note', LEARNING_LINEAGE_REINCLUDE_NOTE), row);
    return fieldset;
  };

  const paintLineage = (focus: string | null): void => {
    if (lineage === null) return;
    const open = lineage;
    const { projection: read } = open;
    const { material } = read;
    root.dataset['learningAuditView'] = 'lineage';
    const section = el('section', 'learning-lineage');
    section.dataset['materialKey'] = material.materialKey;
    section.dataset['learningStanding'] = read.standing;
    section.setAttribute('aria-label', learningLineageHeading(material.originLabel));
    const heading = el('h4', undefined, learningLineageHeading(material.originLabel));
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note learning-lineage-book', `《${read.bookTitle}》 · ${LEARNING_AUDIT_STANDING_LABELS[read.standing]}`));

    const step = (index: number, body: ReadonlyArray<HTMLElement>, count: number | null): HTMLLIElement => {
      const { step: key, label } = LEARNING_LINEAGE_STEPS[index]!;
      const item = el('li', 'learning-lineage-step');
      item.dataset['lineageStep'] = key;
      if (count !== null) item.dataset['lineageCount'] = String(count);
      item.append(el('h5', undefined, label), ...body);
      return item;
    };
    const backward = el('ol', 'learning-lineage-steps');
    const excerpt = el('ul', 'learning-excerpt');
    for (const line of material.excerpt) excerpt.append(el('li', undefined, line));
    const materialBody: HTMLElement[] = [excerpt, el('p', 'field-note', learningOriginLine(material, localInstantLabel))];
    if (material.sourceTask !== null) materialBody.push(el('p', 'field-note', `来源任务：${material.sourceTask.label}`));
    backward.append(step(0, materialBody, null));
    const decisions = el('ol', 'learning-lineage-decisions');
    for (const entry of [...read.decisions].reverse()) {
      const item = el('li', 'learning-lineage-decision');
      item.dataset['decisionOrdinal'] = String(entry.ordinal);
      item.dataset['decisionState'] = entry.superseded ? 'superseded' : 'current';
      item.dataset['decisionVia'] = entry.via;
      item.append(el('p', 'learning-lineage-decision-line', learningLineageDecisionLine(entry, localInstantLabel)),
        el('p', 'field-note learning-lineage-decision-status', learningLineageDecisionStatus(entry)));
      if (entry.attribution !== null) item.append(el('p', 'field-note learning-lineage-attribution', feedbackAttributionLine(entry.attribution)));
      decisions.append(item);
    }
    const decisionBody: HTMLElement[] = read.decisions.length === 0 ? [el('p', 'field-note', LEARNING_LINEAGE_NO_DECISION)] : [decisions];
    if (read.earlierDecisions > 0) decisionBody.push(el('p', 'field-note', learningLineageEarlier(read.earlierDecisions)));
    backward.append(step(1, decisionBody, read.decisions.length + read.earlierDecisions));
    section.append(backward);

    // 后来影响了什么 (LAUD-004): each stage after the decision, empty because nothing makes it yet, and saying so.
    const forward = el('section', 'learning-lineage-forward');
    forward.setAttribute('aria-label', LEARNING_LINEAGE_FORWARD);
    forward.append(el('h5', 'learning-lineage-forward-heading', LEARNING_LINEAGE_FORWARD), el('p', 'field-note learning-lineage-why', LEARNING_LINEAGE_WHY_EMPTY));
    const later = el('ol', 'learning-lineage-steps');
    later.start = 3;
    const counts = [read.downstream.signals, read.downstream.memoryCandidates, read.downstream.activeMemories, read.downstream.tasks];
    counts.forEach((count, offset) => {
      const empty = offset === 3 ? LEARNING_LINEAGE_TASKS_NONE : LEARNING_LINEAGE_NOT_YET;
      later.append(step(2 + offset, [el('p', 'learning-lineage-empty', empty)], count));
    });
    forward.append(later);
    section.append(forward);

    const actions = el('div', 'button-row learning-lineage-actions');
    if (read.standing === 'book' || read.standing === 'house') {
      const stop = action(LEARNING_LINEAGE_STOP, 'secondary', 'stop', () => void stopOne());
      stop.disabled = busy || open.panel !== null;
      actions.append(stop);
    }
    if (read.standing === 'excluded') {
      const again = action(LEARNING_LINEAGE_REINCLUDE, 'secondary', 'reinclude', () => {
        if (busy || open.panel !== null) return;
        open.panel = { kind: 'reinclude', choice: null };
        open.refusal = null;
        paint('.learning-reinclude input');
      });
      again.disabled = busy || open.panel !== null;
      actions.append(again);
    }
    const leave = action(LEARNING_LINEAGE_BACK, 'quiet', 'back', () => void back());
    leave.disabled = busy;
    actions.append(leave);
    section.append(actions);
    if (open.panel?.kind === 'preview') {
      const name = nameOf(material);
      section.append(previewNode(open.panel, null, (materialKey) => (materialKey === material.materialKey ? name : null), closePanel, () => void confirmOne()));
    }
    if (open.panel?.kind === 'reinclude') section.append(reincludeNode(open, open.panel));
    if (open.refusal !== null) {
      const alert = el('p', 'attention-note learning-audit-refusal', open.refusal);
      alert.setAttribute('role', 'alert');
      alert.tabIndex = -1;
      section.append(alert);
    }

    // 审计详情 (LAUD-005): ids and governing references, inspect only.
    const details = el('details', 'technical-details learning-audit-details');
    const rows = el('dl', 'learning-facts');
    const row = (term: string, value: string): void => { rows.append(el('dt', undefined, term), el('dd', 'technical-identity', value)); };
    row('学习材料', `${material.materialKey} · ${material.digest}`);
    if (material.sourceTask !== null) row('来源任务', material.sourceTask.taskIntentId);
    for (const entry of read.decisions) {
      row(`准入决定 ${entry.ordinal}`, [
        entry.decisionId, `记录 ${entry.audit.recordDigest}`, `材料版本 ${entry.audit.materialDigest}`,
        `取代 ${entry.audit.supersedes ?? '无'}`, `依据 ${entry.audit.basis}`, entry.recordedAt,
        ...(entry.audit.remediationPreview === null ? [] : [`补救预览 ${entry.audit.remediationPreview}`]),
      ].join(' · '));
    }
    details.append(el('summary', undefined, '审计详情'), rows);
    section.append(details);
    section.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      if (open.panel !== null) closePanel();
      else void back();
    });
    root.replaceChildren(section);
    focusOn(focus);
  };

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || lineage !== null || batch === null || busy) return;
    event.preventDefault();
    batch = null;
    paint('[data-learning-audit-action="batch-stop"]');
  });

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', LEARNING_AUDIT_STATUS.loading));
      // The filters' choices — the house's Books and Series (LAUD-002) — come with the page itself (Issue #677): opening reads
      // no Book or Series list of its own. The view state this window kept from an earlier visit, if any: the filters and the
      // page they were read at. A kept Series or Book may be gone since: the service refuses either, and the page then opens
      // unfiltered at its start.
      const kept = remembered;
      if (kept !== null) {
        try {
          if (await request({ ...kept.chosen }, kept.pageAfter, null)) return;
        } catch { /* read afresh below */ }
        remembered = null;
      }
      await request(chosen, null, null);
    },
  };
}
