import {
  SERIES_KNOWLEDGE_CLASSES,
  SERIES_KNOWLEDGE_CLASS_LABELS,
  type RendererApi,
  type SeriesKnowledgeCandidateProjection,
  type SeriesKnowledgeClass,
  type SeriesKnowledgeItemProjection,
  type SeriesKnowledgeProjection,
  type SeriesKnowledgeReuseScope,
  type SeriesKnowledgeReviewProjection,
  type SeriesKnowledgeRevisionProjection,
  type SeriesKnowledgeTarget,
  type SeriesProjection,
} from '../shared/protocol.js';
import {
  KNOWLEDGE_CANCEL,
  KNOWLEDGE_CANDIDATES_EMPTY,
  KNOWLEDGE_CANDIDATES_HEADING,
  KNOWLEDGE_CANDIDATES_MORE,
  KNOWLEDGE_CLASS_LABEL,
  KNOWLEDGE_CLASS_PLACEHOLDER,
  KNOWLEDGE_CONTENT_LABEL,
  KNOWLEDGE_EDIT,
  KNOWLEDGE_EDIT_SAVE,
  KNOWLEDGE_HEADING,
  KNOWLEDGE_ITEMS_EMPTY,
  KNOWLEDGE_ITEMS_HEADING,
  KNOWLEDGE_ITEMS_MORE,
  KNOWLEDGE_NOTE,
  KNOWLEDGE_PRESERVE,
  KNOWLEDGE_PRESERVED_NOTE,
  KNOWLEDGE_PROMOTE_NOTE,
  KNOWLEDGE_PROPOSE,
  KNOWLEDGE_PROPOSE_FOR_ITEM,
  KNOWLEDGE_PROPOSE_OPEN,
  KNOWLEDGE_REUSE_LEGEND,
  KNOWLEDGE_REVIEW_HEADING,
  KNOWLEDGE_REVIEW_OPEN,
  KNOWLEDGE_REVIEW_REFRESH,
  KNOWLEDGE_REVISIONS_MORE,
  KNOWLEDGE_SEARCH,
  KNOWLEDGE_SEARCH_LABEL,
  KNOWLEDGE_SEARCH_NONE,
  KNOWLEDGE_STATUS,
  KNOWLEDGE_SUBJECT_LABEL,
  KNOWLEDGE_TARGET_LEGEND,
  KNOWLEDGE_TARGET_NEW,
  knowledgeConflictsMoreLine,
  knowledgeItemLine,
  knowledgeKeptConflictsLine,
  knowledgePromoteWaits,
  knowledgeProvenanceLine,
  knowledgeReuseLine,
  knowledgeReviewIdentity,
  knowledgeRevisionLine,
  knowledgeRevisionsSummary,
  knowledgeSupersededLine,
  knowledgeTargetLine,
} from './series-knowledge-labels.js';

/**
 * 书系知识 on one Series' page (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019): the items with their immutable revisions,
 * the candidates waiting for review, 提议为书系知识 in the editor's own words, and 书系知识纳入审阅 — the item, the words, where
 * they came from, the revision they would supersede, the disclosed conflicts with `编辑候选项`, `保留已披露冲突` and `取消`
 * none chosen, and where the revision may later be used, none chosen — whose only committing action is `纳入书系知识`.
 *
 * Nothing is read whole (Issue #63 review): items come a page at a time by name, with `查找条目` and `更多条目…`, each with its
 * current revision and `历次版本` read when opened; candidates come a page at a time with `更多候选项…`; and after a write the
 * page reads the Series again rather than take a whole Series in the answer. `提议修改…` on any item proposes for exactly it.
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
  node.dataset['knowledgeAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function alertNode(message: string): HTMLElement {
  const alert = el('p', 'attention-note knowledge-refusal', message);
  alert.setAttribute('role', 'alert');
  return alert;
}

function onEscape(root: HTMLElement, cancel: () => void): void {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    cancel();
  });
}

/** What a propose or edit form holds while the editor writes it. */
interface Draft {
  target: 'new' | string | null;
  /** The name of an item the form was opened for, which may lie on a page not read yet. */
  targetLabel?: string;
  subject: string;
  knowledgeClass: SeriesKnowledgeClass | '';
  content: string;
}

/** One bounded page of a visible item's 历次版本, and whether it is open. */
interface History {
  open: boolean;
  revisions: SeriesKnowledgeRevisionProjection[] | null;
  nextBefore: number | null;
  later: boolean;
  failed: boolean;
  retryFresh: boolean;
}

export interface MountSeriesKnowledgeOptions {
  readonly root: HTMLElement;
  readonly seriesId: string;
  readonly api: Pick<RendererApi, 'inspectSeries' | 'proposeSeriesKnowledge' | 'inspectSeriesKnowledgeReview' | 'editSeriesKnowledgeCandidate' |
    'promoteSeriesKnowledge' | 'inspectSeriesKnowledgeItems' | 'inspectSeriesKnowledgeCandidates' | 'inspectSeriesKnowledgeRevisions'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  /** The page's own read, when a write here has read the Series again. */
  readonly seriesChanged: (series: SeriesProjection) => void;
}

export function mountSeriesKnowledge(options: MountSeriesKnowledgeOptions): { update(knowledge: SeriesKnowledgeProjection, focus?: string | null): void } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('series-knowledge');
  let knowledge: SeriesKnowledgeProjection | null = null;
  let propose: Draft | null = null;
  let proposeRefusal: string | null = null;
  let review: SeriesKnowledgeReviewProjection | null = null;
  let reviewing: string | null = null;
  let reviewRefusal: { message: string; stale: boolean; where: 'edit' | 'promote' } | null = null;
  let preserved = false;
  let reuse: SeriesKnowledgeReuseScope | null = null;
  let edit: Draft | null = null;
  let busy = false;
  /** The words the items were searched for, and those typed since. */
  let searched = '';
  let searchText = '';
  const histories = new Map<string, History>();
  let historyEpoch = 0;
  let itemsLater = false;
  let candidatesLater = false;

  const paint = (focus: string | null): void => {
    if (knowledge === null) return;
    root.dataset['knowledgeItems'] = String(knowledge.items.length);
    root.dataset['knowledgeCandidates'] = String(knowledge.candidates.length);
    const heading = el('h3', 'knowledge-heading', KNOWLEDGE_HEADING);
    heading.tabIndex = -1;
    const nodes: HTMLElement[] = [heading, el('p', 'field-note knowledge-note', KNOWLEDGE_NOTE)];
    const toolbar = el('div', 'button-row');
    const open = action(KNOWLEDGE_PROPOSE_OPEN, 'secondary', 'propose-open', () => {
      if (busy) return;
      propose = { target: null, subject: '', knowledgeClass: '', content: '' };
      proposeRefusal = null;
      paint('input[name="knowledge-target"]');
    });
    open.disabled = busy || propose !== null;
    toolbar.append(open);
    nodes.push(toolbar);
    if (propose !== null) nodes.push(draftForm(propose, 'propose'));

    nodes.push(el('h4', undefined, KNOWLEDGE_ITEMS_HEADING));
    if (knowledge.itemCount > 0) nodes.push(searchRow());
    if (knowledge.items.length === 0) {
      nodes.push(el('p', 'field-note knowledge-items-empty', searched === '' ? KNOWLEDGE_ITEMS_EMPTY : KNOWLEDGE_SEARCH_NONE));
    } else {
      const list = el('ul', 'knowledge-items');
      for (const item of knowledge.items) list.append(itemNode(item));
      nodes.push(list);
    }
    if (knowledge.itemsNext !== null) nodes.push(moreRow(KNOWLEDGE_ITEMS_MORE, 'items-more', () => void loadItems(false)));
    if (itemsLater) nodes.push(moreRow('回到首批条目', 'items-reset', () => void loadItems(true, true)));
    nodes.push(el('h4', undefined, KNOWLEDGE_CANDIDATES_HEADING));
    if (knowledge.candidates.length === 0) nodes.push(el('p', 'field-note knowledge-candidates-empty', KNOWLEDGE_CANDIDATES_EMPTY));
    else {
      const list = el('ul', 'knowledge-candidates');
      for (const candidate of knowledge.candidates) list.append(candidateNode(candidate));
      nodes.push(list);
    }
    if (knowledge.candidatesNext !== null) nodes.push(moreRow(KNOWLEDGE_CANDIDATES_MORE, 'candidates-more', () => void loadCandidates(false)));
    if (candidatesLater) nodes.push(moreRow('回到首批候选项', 'candidates-reset', () => void loadCandidates(true)));
    if (reviewing !== null) nodes.push(reviewNode());
    root.replaceChildren(...nodes);
    if (focus !== null) {
      const target = root.querySelector<HTMLElement>(focus);
      const enabled = target !== null && !target.matches(':disabled') ? target : heading;
      enabled.focus();
    }
  };

  const moreRow = (label: string, name: string, run: () => void): HTMLElement => {
    const row = el('div', 'button-row knowledge-more');
    const more = action(label, 'secondary', name, run);
    more.disabled = busy;
    row.append(more);
    return row;
  };

  /** 查找条目: the items whose names hold the words, a page at a time; empty words read every item again. */
  const searchRow = (): HTMLElement => {
    const row = el('div', 'knowledge-search');
    const label = el('label', 'knowledge-field');
    const input = el('input');
    input.id = 'knowledge-search';
    input.type = 'search';
    input.value = searchText;
    input.disabled = busy;
    input.addEventListener('input', () => { searchText = input.value; });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      void loadItems(true);
    });
    label.append(el('span', undefined, KNOWLEDGE_SEARCH_LABEL), input);
    const find = action(KNOWLEDGE_SEARCH, 'secondary', 'search', () => void loadItems(true));
    find.disabled = busy;
    row.append(label, find);
    return row;
  };

  const itemNode = (item: SeriesKnowledgeItemProjection): HTMLElement => {
    const node = el('li', 'knowledge-item');
    node.dataset['itemId'] = item.itemId;
    const current = item.current;
    node.dataset['revision'] = String(current.ordinal);
    const title = el('p', 'knowledge-item-title', knowledgeItemLine(item));
    title.tabIndex = -1;
    node.append(title, el('p', 'knowledge-item-content', current.content),
      el('p', 'field-note knowledge-item-provenance', knowledgeProvenanceLine(current.provenance)), el('p', 'field-note knowledge-item-reuse', knowledgeReuseLine(current)));
    const kept = knowledgeKeptConflictsLine(current.conflicts.length);
    if (kept !== null) node.append(el('p', 'field-note knowledge-item-conflicts', kept));
    const forItem = action(KNOWLEDGE_PROPOSE_FOR_ITEM, 'quiet', 'propose-item', () => {
      if (busy) return;
      propose = { target: item.itemId, targetLabel: `「${item.subject}」（${item.classLabel}）`, subject: '', knowledgeClass: '', content: '' };
      proposeRefusal = null;
      paint('#knowledge-content-propose');
    });
    forItem.disabled = busy || propose !== null;
    forItem.setAttribute('aria-label', `${KNOWLEDGE_PROPOSE_FOR_ITEM.replace('…', '')}：「${item.subject}」`);
    node.append(forItem);
    if (item.revisionCount > 1) node.append(historyNode(item));
    return node;
  };

  /** 历次版本: read the first time the editor opens it, newest first, with `更早的版本…` for the rest (Issue #63 review). */
  const historyNode = (item: SeriesKnowledgeItemProjection): HTMLElement => {
    const state = histories.get(item.itemId) ?? { open: false, revisions: null, nextBefore: null, later: false, failed: false, retryFresh: true };
    const details = el('details', 'knowledge-item-history');
    details.open = state.open;
    details.append(el('summary', undefined, knowledgeRevisionsSummary(item.revisionCount)));
    if (state.revisions === null) {
      if (state.open && !state.failed) details.append(el('p', 'field-note', KNOWLEDGE_STATUS.loadingMore));
    } else {
      const list = el('ol');
      for (const revision of state.revisions) list.append(el('li', undefined, knowledgeRevisionLine(revision)));
      details.append(list);
      if (state.nextBefore !== null) details.append(moreRow(KNOWLEDGE_REVISIONS_MORE, 'revisions-more', () => void loadRevisions(item.itemId, false)));
      if (state.later) details.append(moreRow('回到最新版本', 'revisions-reset', () => void loadRevisions(item.itemId, true)));
    }
    if (state.failed) {
      details.append(el('p', 'field-note', '历次版本未能读取。可以重试；已有页面保留。'));
      details.append(moreRow('重试读取版本', 'revisions-retry', () => void loadRevisions(item.itemId, state.retryFresh)));
    }
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      const known = histories.get(item.itemId) ?? { open: false, revisions: null, nextBefore: null, later: false, failed: false, retryFresh: true };
      if (busy) { details.open = known.open; return; }
      const opening = details.open && !known.open;
      known.open = details.open;
      histories.set(item.itemId, known);
      if (opening && known.revisions === null) void loadRevisions(item.itemId, true);
    });
    return details;
  };

  const loadRevisions = async (itemId: string, fresh: boolean): Promise<void> => {
    if (busy || !knowledge?.items.some((item) => item.itemId === itemId)) return;
    const state = histories.get(itemId) ?? { open: true, revisions: null, nextBefore: null, later: false, failed: false, retryFresh: true };
    const epoch = historyEpoch;
    state.failed = false;
    state.retryFresh = fresh;
    busy = true;
    paint(null);
    try {
      const page = await api.inspectSeriesKnowledgeRevisions({ seriesId: options.seriesId, itemId, before: fresh ? null : state.nextBefore });
      busy = false;
      if (!root.isConnected) return;
      if (epoch !== historyEpoch) { paint('#knowledge-search'); return; }
      state.revisions = [...page.revisions];
      state.nextBefore = page.nextBefore;
      state.later = !fresh;
      histories.set(itemId, state);
      paint('[data-item-id="' + itemId + '"] .knowledge-item-history summary');
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      if (epoch === historyEpoch) { state.failed = true; histories.set(itemId, state); }
      setStatus(errorMessage(error, KNOWLEDGE_STATUS.failed), 'error');
      paint('[data-item-id="' + itemId + '"] .knowledge-item-history summary');
    }
  };

  /** 查找条目 or `更多条目…`: the first page for the words searched, or the next page after those shown. */
  const loadItems = async (fresh: boolean, keepSearch = false): Promise<void> => {
    if (busy || knowledge === null) return;
    const shown = knowledge;
    const words = fresh && !keepSearch ? searchText.trim() : searched;
    busy = true;
    paint(null);
    setStatus(KNOWLEDGE_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectSeriesKnowledgeItems({ seriesId: options.seriesId, text: words, after: fresh ? null : shown.itemsNext });
      if (!root.isConnected) return;
      knowledge = { ...shown, items: [...page.items], itemsNext: page.nextCursor };
      histories.clear();
      historyEpoch += 1;
      itemsLater = !fresh;
      searched = words;
      busy = false;
      paint(page.items[0] === undefined ? '#knowledge-search' : `[data-item-id="${page.items[0].itemId}"] .knowledge-item-title`);
      setStatus(KNOWLEDGE_HEADING);
    } catch (error) {
      busy = false;
      paint('#knowledge-search');
      setStatus(errorMessage(error, KNOWLEDGE_STATUS.failed), 'error');
    }
  };

  /** `更多候选项…`: the next page of candidates waiting for review, oldest proposed first. */
  const loadCandidates = async (fresh: boolean): Promise<void> => {
    if (busy || knowledge === null || (!fresh && knowledge.candidatesNext === null)) return;
    const shown = knowledge;
    busy = true;
    paint(null);
    setStatus(KNOWLEDGE_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectSeriesKnowledgeCandidates({ seriesId: options.seriesId, after: fresh ? null : shown.candidatesNext });
      if (!root.isConnected) return;
      knowledge = { ...shown, candidates: [...page.candidates], candidatesNext: page.nextCursor };
      candidatesLater = !fresh;
      busy = false;
      paint(page.candidates[0] === undefined ? '[data-knowledge-action="propose-open"]' : `[data-candidate-id="${page.candidates[0].candidateId}"] [data-knowledge-action="review"]`);
      setStatus(KNOWLEDGE_HEADING);
    } catch (error) {
      busy = false;
      paint(fresh ? '[data-knowledge-action="candidates-reset"]' : '[data-knowledge-action="candidates-more"]');
      setStatus(errorMessage(error, KNOWLEDGE_STATUS.failed), 'error');
    }
  };

  /** After a write, the Series as it now stands, its lists from their first pages (Issue #63 review). */
  const reread = async (): Promise<void> => {
    const series = await api.inspectSeries({ seriesId: options.seriesId });
    knowledge = series.knowledge;
    searched = '';
    searchText = '';
    itemsLater = false;
    candidatesLater = false;
    historyEpoch += 1;
    histories.clear();
    options.seriesChanged(series);
  };

  const candidateNode = (candidate: SeriesKnowledgeCandidateProjection): HTMLElement => {
    const node = el('li', 'knowledge-candidate');
    node.dataset['candidateId'] = candidate.candidateId;
    node.dataset['authoring'] = candidate.authoring;
    node.append(el('p', 'knowledge-candidate-target', knowledgeTargetLine(candidate)), el('p', 'knowledge-candidate-content', candidate.content),
      el('p', 'field-note knowledge-candidate-provenance', knowledgeProvenanceLine(candidate.provenance)));
    if (candidate.conflicts > 0) node.append(el('p', 'attention-note knowledge-candidate-conflict', '存在书系知识冲突 · 需要处理'));
    const open = action(KNOWLEDGE_REVIEW_OPEN, 'quiet', 'review', () => void openReview(candidate.candidateId));
    open.disabled = busy || reviewing !== null;
    node.append(open);
    return node;
  };

  /** A 提议 or 编辑候选项 form: the item — new or one existing, none chosen — its name and class when new, and the words. */
  const draftForm = (draft: Draft, mode: 'propose' | 'edit'): HTMLElement => {
    const form = el('form', `knowledge-form knowledge-form-${mode}`);
    form.noValidate = true;
    const targets = el('fieldset', 'knowledge-targets');
    targets.append(el('legend', undefined, KNOWLEDGE_TARGET_LEGEND));
    // The items read so far, and the one the form was opened for wherever it lies (Issue #63 review).
    const listed = knowledge!.items.map((item): [string, string] => [item.itemId, `「${item.subject}」（${item.classLabel}）`]);
    const opened: Array<[string, string]> = draft.target !== null && draft.target !== 'new' && draft.targetLabel !== undefined &&
      !listed.some(([value]) => value === draft.target) ? [[draft.target, draft.targetLabel]] : [];
    const choices: Array<[string, string]> = [['new', KNOWLEDGE_TARGET_NEW], ...opened, ...listed];
    for (const [value, label] of choices) {
      const choice = el('label', 'knowledge-target-choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'knowledge-target';
      radio.value = value;
      radio.checked = draft.target === value;
      radio.disabled = busy;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        draft.target = value;
        if (value === 'new') delete draft.targetLabel;
        else draft.targetLabel = label;
        paint(`input[name="knowledge-target"][value="${value}"]`);
      });
      choice.append(radio, el('span', undefined, label));
      targets.append(choice);
    }
    form.append(targets);
    if (draft.target === 'new') {
      const subjectLabel = el('label', 'knowledge-field');
      const subject = el('input');
      subject.id = `knowledge-subject-${mode}`;
      subject.type = 'text';
      subject.value = draft.subject;
      subject.disabled = busy;
      subject.addEventListener('input', () => { draft.subject = subject.value; });
      subjectLabel.append(el('span', undefined, KNOWLEDGE_SUBJECT_LABEL), subject);
      const classLabel = el('label', 'knowledge-field');
      const select = el('select');
      select.id = `knowledge-class-${mode}`;
      select.disabled = busy;
      const placeholder = el('option', undefined, KNOWLEDGE_CLASS_PLACEHOLDER);
      placeholder.value = '';
      select.append(placeholder);
      for (const knowledgeClass of SERIES_KNOWLEDGE_CLASSES) {
        const option = el('option', undefined, SERIES_KNOWLEDGE_CLASS_LABELS[knowledgeClass]);
        option.value = knowledgeClass;
        select.append(option);
      }
      select.value = draft.knowledgeClass;
      select.addEventListener('change', () => { draft.knowledgeClass = select.value as SeriesKnowledgeClass | ''; });
      classLabel.append(el('span', undefined, KNOWLEDGE_CLASS_LABEL), select);
      form.append(subjectLabel, classLabel);
    }
    const contentLabel = el('label', 'knowledge-field');
    const content = el('textarea');
    content.id = `knowledge-content-${mode}`;
    content.rows = 3;
    content.value = draft.content;
    content.disabled = busy;
    content.addEventListener('input', () => { draft.content = content.value; });
    contentLabel.append(el('span', undefined, KNOWLEDGE_CONTENT_LABEL), content);
    form.append(contentLabel);
    const refusal = mode === 'propose' ? proposeRefusal : reviewRefusal?.where === 'edit' ? reviewRefusal.message : null;
    if (refusal !== null) form.append(alertNode(refusal));
    const submit = action(mode === 'propose' ? KNOWLEDGE_PROPOSE : KNOWLEDGE_EDIT_SAVE, 'primary', mode === 'propose' ? 'propose' : 'edit-save',
      () => void (mode === 'propose' ? submitPropose() : submitEdit()));
    submit.disabled = busy || draft.target === null;
    const cancel = action(KNOWLEDGE_CANCEL, 'secondary', mode === 'propose' ? 'propose-cancel' : 'edit-cancel', () => {
      if (busy) return;
      if (mode === 'propose') {
        propose = null;
        proposeRefusal = null;
        paint('[data-knowledge-action="propose-open"]');
      } else {
        edit = null;
        reviewRefusal = null;
        paint(`[data-knowledge-action="edit"]`);
      }
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row');
    buttons.append(submit, cancel);
    form.append(buttons);
    form.addEventListener('submit', (event) => { event.preventDefault(); if (!submit.disabled) submit.click(); });
    onEscape(form, () => cancel.click());
    return form;
  };

  const targetOf = (draft: Draft): SeriesKnowledgeTarget => draft.target === 'new'
    ? { kind: 'new', subject: draft.subject, knowledgeClass: draft.knowledgeClass as SeriesKnowledgeClass }
    : { kind: 'existing', itemId: draft.target! };

  const submitPropose = async (): Promise<void> => {
    if (busy || propose === null || propose.target === null) return;
    const draft = propose;
    busy = true;
    proposeRefusal = null;
    paint(null);
    setStatus(KNOWLEDGE_STATUS.proposing, 'busy');
    try {
      const result = await api.proposeSeriesKnowledge({ seriesId: options.seriesId, target: targetOf(draft), content: draft.content, span: null });
      propose = null;
      // The candidate stands whatever the read after it meets.
      try { await reread(); } catch { /* the page keeps what it had */ }
      busy = false;
      paint(`[data-candidate-id="${result.candidateId}"] [data-knowledge-action="review"]`);
      setStatus(result.completionLabel, 'success');
    } catch (error) {
      busy = false;
      proposeRefusal = errorMessage(error, KNOWLEDGE_STATUS.failed);
      paint(`#knowledge-content-propose`);
      setStatus(proposeRefusal, 'error');
    }
  };

  const reviewNode = (): HTMLElement => {
    const box = el('section', 'knowledge-review');
    box.dataset['candidateId'] = reviewing!;
    const heading = el('h4', 'knowledge-review-heading', KNOWLEDGE_REVIEW_HEADING);
    heading.tabIndex = -1;
    box.append(heading);
    if (review !== null) {
      box.dataset['version'] = String(review.candidate.version);
      box.append(el('p', 'knowledge-review-identity', knowledgeReviewIdentity(review)), el('p', 'knowledge-review-content', review.candidate.content),
        el('p', 'field-note knowledge-review-provenance', knowledgeProvenanceLine(review.candidate.provenance)));
      if (review.current !== null) box.append(el('p', 'field-note knowledge-review-superseded', knowledgeSupersededLine(review.current)));
      if (review.conflictLabel !== null) {
        const conflicts = el('div', 'knowledge-review-conflicts');
        conflicts.append(el('p', 'attention-note knowledge-conflict-label', review.conflictLabel));
        const list = el('ul');
        for (const conflict of review.conflicts) {
          const line = el('li', undefined, conflict.line);
          line.dataset['conflictKind'] = conflict.kind;
          list.append(line);
        }
        conflicts.append(list);
        const more = knowledgeConflictsMoreLine(review.conflicts.length, review.conflictCount);
        if (more !== null) conflicts.append(el('p', 'field-note knowledge-conflicts-more', more));
        const choices = el('div', 'button-row knowledge-dispositions');
        const editButton = action(KNOWLEDGE_EDIT, 'secondary', 'edit', () => openEdit());
        const keep = action(KNOWLEDGE_PRESERVE, 'secondary', 'preserve', () => {
          if (busy) return;
          preserved = !preserved;
          paint('[data-knowledge-action="preserve"]');
        });
        keep.setAttribute('aria-pressed', String(preserved));
        const close = action(KNOWLEDGE_CANCEL, 'secondary', 'review-cancel', () => closeReview());
        for (const button of [editButton, keep, close]) button.disabled = busy;
        choices.append(editButton, keep, close);
        conflicts.append(choices);
        if (preserved) conflicts.append(el('p', 'field-note knowledge-preserved-note', KNOWLEDGE_PRESERVED_NOTE));
        box.append(conflicts);
      }
      if (edit !== null) box.append(draftForm(edit, 'edit'));
      const uses = el('fieldset', 'knowledge-reuse');
      uses.append(el('legend', undefined, KNOWLEDGE_REUSE_LEGEND));
      for (const entry of review.reuseScopes) {
        const choice = el('label', 'knowledge-reuse-choice');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'knowledge-reuse';
        radio.value = entry.scope;
        radio.checked = reuse === entry.scope;
        radio.disabled = busy;
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          reuse = entry.scope;
          paint(`input[name="knowledge-reuse"][value="${entry.scope}"]`);
        });
        choice.append(radio, el('span', undefined, entry.label));
        uses.append(choice);
      }
      box.append(uses, el('p', 'field-note knowledge-promote-note', KNOWLEDGE_PROMOTE_NOTE));
      const waits = knowledgePromoteWaits(review, reuse !== null, preserved);
      const buttons = el('div', 'button-row');
      const promote = action(review.actionLabel, 'primary', 'promote', () => void submitPromote());
      promote.disabled = busy || waits !== null || edit !== null;
      buttons.append(promote);
      if (review.conflictLabel === null) {
        const close = action(KNOWLEDGE_CANCEL, 'secondary', 'review-cancel', () => closeReview());
        close.disabled = busy;
        buttons.append(close);
      }
      box.append(buttons);
      if (waits !== null) box.append(el('p', 'field-note knowledge-promote-waits', waits));
    }
    if (reviewRefusal?.where === 'promote') {
      box.append(alertNode(reviewRefusal.message));
      // A review the knowledge moved past is read again before any commit (SER-019).
      if (reviewRefusal.stale) {
        const refresh = action(KNOWLEDGE_REVIEW_REFRESH, 'secondary', 'review-refresh', () => void openReview(reviewing!));
        refresh.disabled = busy;
        box.append(refresh);
      }
    }
    onEscape(box, () => { if (edit === null) closeReview(); });
    return box;
  };

  const closeReview = (): void => {
    if (busy) return;
    const candidateId = reviewing;
    reviewing = null;
    review = null;
    reviewRefusal = null;
    edit = null;
    preserved = false;
    reuse = null;
    paint(candidateId === null ? null : `[data-candidate-id="${candidateId}"] [data-knowledge-action="review"]`);
  };

  /** 纳入审阅…: the review read now; any disposition or use chosen before starts again unchosen. */
  const openReview = async (candidateId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    reviewing = candidateId;
    reviewRefusal = null;
    edit = null;
    preserved = false;
    reuse = null;
    setStatus(KNOWLEDGE_STATUS.reviewing, 'busy');
    try {
      review = await api.inspectSeriesKnowledgeReview({ seriesId: options.seriesId, candidateId });
      busy = false;
      paint('.knowledge-review-heading');
      setStatus(KNOWLEDGE_REVIEW_HEADING);
    } catch (error) {
      busy = false;
      review = null;
      reviewing = null;
      setStatus(errorMessage(error, KNOWLEDGE_STATUS.failed), 'error');
      paint(null);
    }
  };

  const openEdit = (): void => {
    if (busy || review === null) return;
    const { candidate } = review;
    edit = {
      target: candidate.target.kind === 'new' ? 'new' : candidate.target.itemId,
      targetLabel: '「' + candidate.target.subject + '」（' + candidate.target.classLabel + '）',
      subject: candidate.target.kind === 'new' ? candidate.target.subject : '',
      knowledgeClass: candidate.target.kind === 'new' ? candidate.target.knowledgeClass : '',
      content: candidate.content,
    };
    reviewRefusal = null;
    paint('input[name="knowledge-target"]:checked');
  };

  const submitEdit = async (): Promise<void> => {
    if (busy || review === null || edit === null || edit.target === null) return;
    const draft = edit;
    busy = true;
    paint(null);
    setStatus(KNOWLEDGE_STATUS.saving, 'busy');
    try {
      review = await api.editSeriesKnowledgeCandidate({
        seriesId: options.seriesId, candidateId: review.candidate.candidateId, expectedVersion: review.candidate.version, target: targetOf(draft), content: draft.content,
      });
      busy = false;
      edit = null;
      preserved = false;
      reuse = null;
      reviewRefusal = null;
      paint('.knowledge-review-heading');
      setStatus(KNOWLEDGE_STATUS.edited, 'success');
    } catch (error) {
      busy = false;
      reviewRefusal = { message: errorMessage(error, KNOWLEDGE_STATUS.failed), stale: false, where: 'edit' };
      paint(`#knowledge-content-edit`);
      setStatus(reviewRefusal.message, 'error');
    }
  };

  const submitPromote = async (): Promise<void> => {
    if (busy || review === null || reuse === null) return;
    const read = review;
    busy = true;
    paint(null);
    setStatus(KNOWLEDGE_STATUS.promoting, 'busy');
    try {
      const result = await api.promoteSeriesKnowledge({
        seriesId: options.seriesId,
        candidateId: read.candidate.candidateId,
        candidateVersion: read.candidate.version,
        reviewDigest: read.reviewDigest,
        reuseScope: reuse,
        conflictDisposition: read.conflictCount > 0 && preserved ? 'preserved' : 'none',
      });
      reviewing = null;
      review = null;
      preserved = false;
      reuse = null;
      // The item stands whatever the read after it meets; it heads the list when it is on the first page.
      try { await reread(); } catch { /* the page keeps what it had */ }
      busy = false;
      paint(`[data-item-id="${result.itemId}"] .knowledge-item-title`);
      setStatus(result.completionLabel, 'success');
    } catch (error) {
      busy = false;
      const stale = typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SERIES_KNOWLEDGE_REVIEW_STALE';
      reviewRefusal = { message: errorMessage(error, KNOWLEDGE_STATUS.failed), stale, where: 'promote' };
      if (stale) review = null;
      paint(stale ? '[data-knowledge-action="review-refresh"]' : '[data-knowledge-action="promote"]');
      setStatus(reviewRefusal.message, 'error');
    }
  };

  return {
    update(next: SeriesKnowledgeProjection, focus: string | null = null): void {
      knowledge = next;
      searched = '';
      searchText = '';
      itemsLater = false;
      candidatesLater = false;
      historyEpoch += 1;
      histories.clear();
      if (!busy) paint(focus);
    },
  };
}
