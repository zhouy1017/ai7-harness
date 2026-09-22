import {
  draftText,
  hasNonConflictingChanges,
  includeNonConflictingChanges,
  initialResolutions,
  isChangeUnit,
  resolvedUnitText,
  unresolvedUnits,
  type ConflictUnit,
  type ConflictUnitResolution,
} from '../shared/conflict-units.js';
import type { ProposalConflictProjection, RendererApi } from '../shared/protocol.js';
import { markSourceLine } from './editorial-mark-labels.js';
import {
  CONFLICT_COMPLETION,
  CONFLICT_CONFIRM_LABELS,
  CONFLICT_CONTEXT_NOTE,
  CONFLICT_DRAFT_HEADING,
  CONFLICT_DRAFT_NOTE,
  CONFLICT_DRAFT_STATUS,
  CONFLICT_DRAFT_TEXT_LABEL,
  CONFLICT_EDIT_FIELD,
  CONFLICT_EDIT_REFERENCE,
  CONFLICT_EMPTY_WORDS,
  CONFLICT_KEEP_BOTH_PROMPT,
  CONFLICT_NAVIGATOR_LABELS,
  CONFLICT_PATHS,
  CONFLICT_PATH_HEADING,
  CONFLICT_PATH_LABELS,
  CONFLICT_QUICK_ACTIONS,
  CONFLICT_REBASED_NOTICE,
  CONFLICT_REGENERATE_REASON,
  CONFLICT_RETURN_LABEL,
  CONFLICT_STATUS_LINES,
  CONFLICT_UNIT_KIND_LABELS,
  PROPOSAL_CONFLICT_CLASSIFICATION,
  PROPOSAL_CONFLICT_TITLE,
  REVERSAL_CONFLICT_LINE,
  conflictBulkSummary,
  conflictDeferredLine,
  conflictDraftUnsaved,
  conflictKeyboardHint,
  conflictPaneLabels,
  conflictPathNote,
  conflictPositionLine,
  conflictSaveReason,
  conflictUnitHeading,
  type ConflictPath,
  type ConflictSaveBlocker,
} from './proposal-conflict-labels.js';

/**
 * 稿件冲突 of one 修改建议 as a Dedicated Work Workspace (Issue #57, plan slice S22; ADR 0085; editor-surfaces
 * ED-003; IA › Proposal conflict workspace; V2-UX-CONFLICT-004 to 013). It takes the place of the
 * manuscript view and gives it back with `返回稿件`, at the conflict's paragraph with its card open.
 *
 * The three texts — 提案基准, 当前权威稿件, 提议内容 — are read-only panes aligned unit by unit, persistently
 * labelled, told apart by words and typography rather than colour. Below them the four paths wait
 * unselected. 自行编辑解决草稿 opens the Resolution Draft: quick actions per changed unit, draft-local
 * undo and redo, the unresolved units one step away, and every change saved at once (typing, once it
 * rests). The draft is only a draft: 保存为新提案版本 turns it into a new 修改建议, not accepted and not
 * applied, and nothing here ever writes the manuscript.
 */
export interface ProposalConflictSurface {
  /** Read the conflict for the first time; called once the workspace is on screen. */
  start(): void;
  /** Let nothing still in flight paint again: the screen is being replaced. */
  destroy(): void;
}

type ConflictApi = Pick<RendererApi, 'inspectProposalConflict' | 'saveProposalConflictDraft' | 'resolveProposalConflict'>;

export interface MountProposalConflictOptions {
  /** The workspace's panel: the surface appends everything it shows. */
  root: HTMLElement;
  manuscriptId: string;
  branchId: string;
  markId: string;
  bookTitle: string;
  platform: 'win32' | 'darwin';
  api: ConflictApi;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  errorCode(error: unknown): string | null;
  /**
   * Leave for the manuscript at `target.blockId` with `target.markId`'s card open, or where the editor last
   * was when there is no target, and say `completion` once there.
   */
  returnToManuscript(target: { blockId: string; markId: string } | null, completion: string | null): Promise<void>;
  /** Another unresolved conflict of the navigator, opened in this workspace. */
  openConflict(markId: string): void;
}

/** A save of the Resolution Draft: where it stands, in words (V2-UX-CONFLICT-012). */
type SaveState = { kind: 'none' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; reason: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `proposal-conflict-${prefix}-${identities}`;
}

function fact(term: string, value: string): HTMLElement[] {
  return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
}

function copyOf(resolutions: ReadonlyArray<ConflictUnitResolution>): ConflictUnitResolution[] {
  return resolutions.map((entry) => ({ resolution: entry.resolution, text: entry.text }));
}

/** Words as a pane shows them: an empty side is said to be empty. */
function wordsOf(text: string): string {
  return text.length === 0 ? CONFLICT_EMPTY_WORDS : text;
}

export function mountProposalConflict(options: MountProposalConflictOptions): ProposalConflictSurface {
  const { api, markId } = options;
  const binding = { manuscriptId: options.manuscriptId, branchId: options.branchId, markId };
  let destroyed = false;
  let projection: ProposalConflictProjection | null = null;
  let path: ConflictPath | null = null;
  let resolutions: ConflictUnitResolution[] = [];
  let undoStack: ConflictUnitResolution[][] = [];
  let redoStack: ConflictUnitResolution[][] = [];
  /** The unit whose 两者都保留 asks for its order, and the unit whose words are being edited. */
  let orderingUnit: number | null = null;
  let editingUnit: number | null = null;
  let composing = false;
  let savedJson: string | null = null;
  let savedOrdinal: number | null = null;
  let saveState: SaveState = { kind: 'none' };
  let saveTimer: number | undefined;
  let saving: Promise<boolean> | null = null;
  let working = false;
  let bulkSummary: string | null = null;

  const host = el('div', 'proposal-conflict-host');
  host.dataset['conflictMarkId'] = markId;
  options.root.append(el('p', 'section-label', `${options.bookTitle} · ${PROPOSAL_CONFLICT_TITLE}`), host);
  let draftStatus: HTMLElement | undefined;
  let draftTextNode: HTMLElement | undefined;
  let saveButton: HTMLButtonElement | undefined;
  let saveReason: HTMLElement | undefined;

  const button = (action: string, label: string, tone: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement => {
    const control = el('button', tone, label);
    control.type = 'button';
    control.dataset['conflictAction'] = action;
    control.addEventListener('click', run);
    return control;
  };

  // ---- reading --------------------------------------------------------------------------------------

  async function load(): Promise<void> {
    try {
      const next = await api.inspectProposalConflict(binding);
      if (destroyed) return;
      if (next.markId !== markId || next.manuscriptId !== options.manuscriptId || next.branchId !== options.branchId) {
        throw new Error('稿件冲突不属于这条修改建议。');
      }
      const rebased = projection !== null && projection.basisDigest !== next.basisDigest;
      projection = next;
      resolutions = next.draft === null ? initialResolutions(next.units) : copyOf(next.draft.resolutions);
      savedJson = next.draft === null ? null : JSON.stringify(resolutions);
      savedOrdinal = next.draft?.ordinal ?? null;
      saveState = next.draft === null ? { kind: 'none' } : { kind: 'saved' };
      undoStack = [];
      redoStack = [];
      orderingUnit = null;
      editingUnit = null;
      bulkSummary = null;
      render();
      if (rebased || next.draftOnEarlierBasis) options.setStatus(CONFLICT_REBASED_NOTICE);
      else options.setStatus(CONFLICT_STATUS_LINES.opened);
    } catch (error) {
      if (destroyed) return;
      if (projection === null) renderUnavailable(error);
      else options.setStatus(options.errorMessage(error, CONFLICT_STATUS_LINES.openFailed), 'error');
    }
  }

  function renderUnavailable(error: unknown): void {
    const unavailable = el('section', 'proposal-conflict attention-note');
    unavailable.dataset['conflictState'] = 'unavailable';
    unavailable.append(el('h2', undefined, PROPOSAL_CONFLICT_TITLE), el('p', undefined, options.errorMessage(error, CONFLICT_STATUS_LINES.openFailed)));
    host.replaceChildren(unavailable, returnRow());
    options.setStatus(options.errorMessage(error, CONFLICT_STATUS_LINES.openFailed), 'error');
  }

  // ---- saving the draft ------------------------------------------------------------------------------

  /**
   * Whether the draft on screen differs from the one on record — or, before anything was saved, from the
   * untouched draft, which is never saved for its own sake.
   */
  const dirty = (): boolean => JSON.stringify(resolutions) !== (savedJson ?? JSON.stringify(initialResolutions(projection?.units ?? [])));

  function paintSaveState(): void {
    if (draftStatus === undefined) return;
    const state = saveState.kind === 'saving' || saveState.kind === 'failed'
      ? saveState.kind
      : dirty() ? 'unsaved' : savedOrdinal === null ? 'none' : 'saved';
    draftStatus.textContent = state === 'saving'
      ? CONFLICT_DRAFT_STATUS.saving
      : state === 'failed' && saveState.kind === 'failed'
        ? conflictDraftUnsaved(saveState.reason)
        : state === 'saved' ? CONFLICT_DRAFT_STATUS.saved : state === 'unsaved' ? CONFLICT_DRAFT_STATUS.unsaved : '';
    draftStatus.dataset['draftSave'] = state;
  }

  function scheduleSave(delay: number): void {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      void saveNow();
    }, delay);
  }

  /**
   * Save the draft as it stands now. Saves run one at a time; a change made while one is in flight is saved
   * by the next. Answers whether the draft on record is exactly the one on screen.
   */
  async function saveNow(): Promise<boolean> {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (destroyed || projection === null) return false;
    if (saving !== null) {
      await saving;
      return saveNow();
    }
    if (!dirty()) {
      if (savedOrdinal !== null) saveState = { kind: 'saved' };
      paintSaveState();
      return savedOrdinal !== null;
    }
    const snapshot = copyOf(resolutions);
    const json = JSON.stringify(snapshot);
    const basisDigest = projection.basisDigest;
    saveState = { kind: 'saving' };
    paintSaveState();
    saving = (async (): Promise<boolean> => {
      try {
        const result = await api.saveProposalConflictDraft({ ...binding, basisDigest, units: snapshot });
        if (result.markId !== markId || result.basisDigest !== basisDigest) throw new Error('解决草稿不属于这处冲突。');
        savedJson = json;
        savedOrdinal = result.draft.ordinal;
        saveState = { kind: 'saved' };
        return true;
      } catch (error) {
        saveState = { kind: 'failed', reason: options.errorMessage(error, '请稍候再试。') };
        if (options.errorCode(error) === 'PROPOSAL_CONFLICT_STALE') void load();
        return false;
      } finally {
        saving = null;
      }
    })();
    const saved = await saving;
    if (destroyed) return false;
    paintSaveState();
    if (saved && dirty()) return saveNow();
    return saved && !dirty();
  }

  // ---- the draft's state -----------------------------------------------------------------------------

  function change(next: ConflictUnitResolution[], focus: string | null): void {
    undoStack.push(copyOf(resolutions));
    redoStack = [];
    resolutions = next;
    renderDraft(focus);
    void saveNow();
  }

  function setUnit(index: number, entry: ConflictUnitResolution, focus: string | null): void {
    const next = copyOf(resolutions);
    next[index] = entry;
    orderingUnit = null;
    editingUnit = null;
    change(next, focus);
  }

  function undo(): void {
    const previous = undoStack.pop();
    if (previous === undefined) return;
    redoStack.push(copyOf(resolutions));
    resolutions = previous;
    orderingUnit = null;
    editingUnit = null;
    renderDraft('toolbar:undo');
    void saveNow();
  }

  function redo(): void {
    const next = redoStack.pop();
    if (next === undefined) return;
    undoStack.push(copyOf(resolutions));
    resolutions = next;
    orderingUnit = null;
    editingUnit = null;
    renderDraft('toolbar:redo');
    void saveNow();
  }

  function saveBlocker(): ConflictSaveBlocker | null {
    if (projection === null) return 'unresolved';
    if (!projection.newVersion.available) return 'target-deleted';
    if (unresolvedUnits(projection.units, resolutions).length > 0) return 'unresolved';
    if (draftText(projection.units, resolutions) === projection.current) return 'unchanged';
    return null;
  }

  /** The draft's text, the save state and whether 保存为新提案版本 can act, without touching a field being typed in. */
  function paintDraftSummary(): void {
    if (projection === null) return;
    if (draftTextNode !== undefined) draftTextNode.textContent = wordsOf(draftText(projection.units, resolutions));
    const blocker = saveBlocker();
    const reason = conflictSaveReason(blocker, unresolvedUnits(projection.units, resolutions).length);
    if (saveButton !== undefined) {
      saveButton.disabled = working || reason !== null;
      saveButton.dataset['saveBlocker'] = blocker ?? 'none';
    }
    if (saveReason !== undefined) {
      saveReason.textContent = reason ?? '';
      saveReason.hidden = reason === null;
    }
    paintSaveState();
  }

  // ---- the page -----------------------------------------------------------------------------------------

  let page: HTMLElement | undefined;
  let draftHost: HTMLElement | undefined;
  let pathDetail: HTMLElement | undefined;

  function render(): void {
    const next = projection;
    if (next === null || destroyed) return;
    const labels = conflictPaneLabels(next.conflictKind);
    const section = el('section', 'proposal-conflict');
    section.dataset['conflictMarkId'] = markId;
    section.dataset['conflictKind'] = next.conflictKind;
    section.dataset['conflictState'] = next.deferral === null ? 'unresolved' : 'deferred';
    section.dataset['conflictBasis'] = next.basisDigest;

    // The header: where this conflict is among the manuscript's unresolved ones, and the way to the others.
    const header = el('header', 'proposal-conflict-header');
    const heading = el('h2', undefined, PROPOSAL_CONFLICT_TITLE);
    heading.tabIndex = -1;
    const index = next.navigator.entries.findIndex((entry) => entry.markId === markId);
    const position = el('p', 'proposal-conflict-position', conflictPositionLine(index < 0 ? null : index, next.navigator.entries.length, next.navigator.truncated));
    position.dataset['conflictPosition'] = String(index < 0 ? '' : index + 1);
    const navigate = (step: -1 | 1): void => {
      const target = next.navigator.entries[index + step];
      if (target === undefined || working) return;
      void leave(async () => options.openConflict(target.markId));
    };
    const previous = button('previous-conflict', CONFLICT_NAVIGATOR_LABELS.previous, 'quiet', () => navigate(-1));
    previous.disabled = index <= 0;
    const following = button('next-conflict', CONFLICT_NAVIGATOR_LABELS.next, 'quiet', () => navigate(1));
    following.disabled = index < 0 || index >= next.navigator.entries.length - 1;
    const navigator = el('nav', 'button-row proposal-conflict-navigator');
    navigator.setAttribute('aria-label', '未解决的冲突');
    navigator.append(previous, following);
    header.append(heading, position, navigator);

    // Its classification, said in words (interaction spec › Proposal conflict resolution).
    const classification = el('div', 'proposal-conflict-classification');
    classification.dataset['conflictClassification'] = next.conflictKind;
    classification.append(el('strong', undefined, PROPOSAL_CONFLICT_CLASSIFICATION));
    if (next.conflictKind === 'reversal') classification.append(el('p', undefined, REVERSAL_CONFLICT_LINE));
    const source = el('p', 'muted proposal-conflict-source', `修改建议 · ${markSourceLine({ source: next.suggestion.source, convertedFrom: null })}`);
    classification.append(source);
    if (next.suggestion.rationale.length > 0) classification.append(el('p', 'muted', `修改理由：${next.suggestion.rationale}`));
    if (next.deferral !== null) {
      const deferred = el('p', 'proposal-conflict-deferred', conflictDeferredLine(next.deferral.deferredAt));
      deferred.dataset['conflictDeferred'] = next.deferral.deferredAt;
      classification.append(deferred);
    }
    if (next.draftOnEarlierBasis) {
      const rebased = el('p', 'attention-note', CONFLICT_REBASED_NOTICE);
      rebased.dataset['conflictRebased'] = 'true';
      classification.append(rebased);
    }

    section.append(header, classification, comparison(next, labels), paths(next), returnRow(), technical(next));
    if (page?.isConnected === true) page.replaceWith(section);
    else host.replaceChildren(section);
    page = section;
    section.addEventListener('keydown', onKeyDown);
    renderPathDetail(null);
    queueMicrotask(() => {
      if (!destroyed && page === section && !section.contains(document.activeElement)) heading.focus();
    });
  }

  /** The three read-only panes, aligned unit by unit, with the current paragraph's context around them. */
  function comparison(next: ProposalConflictProjection, labels: { base: string; current: string; proposed: string }): HTMLElement {
    const region = el('section', 'proposal-conflict-comparison');
    region.dataset['conflictComparison'] = 'true';
    region.setAttribute('aria-label', '三方比较');
    const context = el('div', 'proposal-conflict-context');
    const note = el('p', 'muted', CONFLICT_CONTEXT_NOTE);
    note.dataset['conflictContextNote'] = 'true';
    const before = el('p', undefined, `前文：${wordsOf(next.context.before)}`);
    before.dataset['conflictContext'] = 'before';
    const after = el('p', undefined, `后文：${wordsOf(next.context.after)}`);
    after.dataset['conflictContext'] = 'after';
    context.append(note, before, after);
    const panes = el('div', 'proposal-conflict-panes');
    panes.setAttribute('role', 'table');
    panes.setAttribute('aria-label', `${labels.base} · ${labels.current} · ${labels.proposed}`);
    const head = el('div', 'proposal-conflict-row proposal-conflict-head');
    head.setAttribute('role', 'row');
    const unitColumn = el('span', 'proposal-conflict-pane-heading', '比较单位');
    unitColumn.setAttribute('role', 'columnheader');
    head.append(unitColumn);
    for (const [pane, label] of [['base', labels.base], ['current', labels.current], ['proposed', labels.proposed]] as const) {
      const cell = el('span', 'proposal-conflict-pane-heading', label);
      cell.setAttribute('role', 'columnheader');
      cell.dataset['conflictPaneHeading'] = pane;
      head.append(cell);
    }
    panes.append(head);
    let ordinal = 0;
    next.units.forEach((unit, unitIndex) => {
      if (isChangeUnit(unit)) ordinal += 1;
      const row = el('div', 'proposal-conflict-row proposal-conflict-unit');
      row.setAttribute('role', 'row');
      row.dataset['conflictUnit'] = String(unitIndex);
      row.dataset['unitKind'] = unit.kind;
      const caption = el('p', 'proposal-conflict-unit-label', isChangeUnit(unit) ? `第 ${ordinal} 处 · ${CONFLICT_UNIT_KIND_LABELS[unit.kind]}` : CONFLICT_UNIT_KIND_LABELS.same);
      caption.setAttribute('role', 'rowheader');
      row.append(caption);
      for (const [pane, label, words] of [['base', labels.base, unit.base], ['current', labels.current, unit.current], ['proposed', labels.proposed, unit.proposed]] as const) {
        const cell = el('div', 'proposal-conflict-cell');
        cell.setAttribute('role', 'cell');
        cell.dataset['conflictPane'] = pane;
        // Every cell keeps its pane's label, so a narrow window that stacks the panes still says which is which.
        cell.append(el('span', 'proposal-conflict-cell-label', label));
        const text = el('span', 'proposal-conflict-words', wordsOf(words));
        text.dataset['conflictWords'] = words;
        cell.append(text);
        row.append(cell);
      }
      panes.append(row);
    });
    region.append(context, panes);
    return region;
  }

  /** The four paths, unselected (V2-UX-CONFLICT-005). */
  function paths(next: ProposalConflictProjection): HTMLElement {
    const fieldset = el('fieldset', 'proposal-conflict-paths');
    fieldset.dataset['conflictPaths'] = 'true';
    fieldset.append(el('legend', undefined, CONFLICT_PATH_HEADING));
    const group = uid('path');
    for (const choice of CONFLICT_PATHS) {
      const option = el('label', 'proposal-conflict-path');
      option.dataset['conflictPath'] = choice;
      const radio = el('input');
      radio.type = 'radio';
      radio.name = group;
      radio.value = choice;
      radio.checked = path === choice;
      const note = el('small', 'muted', conflictPathNote(choice, next.conflictKind));
      note.id = uid('path-note');
      radio.setAttribute('aria-describedby', note.id);
      if (choice === 'regenerate') {
        radio.disabled = true;
        note.textContent = CONFLICT_REGENERATE_REASON;
        note.dataset['conflictUnavailable'] = 'regenerate';
      }
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        path = choice;
        renderPathDetail(null);
      });
      option.append(radio, el('span', undefined, CONFLICT_PATH_LABELS[choice]), note);
      fieldset.append(option);
    }
    pathDetail = el('div', 'proposal-conflict-path-detail');
    pathDetail.dataset['conflictPathDetail'] = 'none';
    fieldset.append(pathDetail);
    return fieldset;
  }

  function renderPathDetail(focus: string | null): void {
    const next = projection;
    if (next === null || pathDetail === undefined) return;
    pathDetail.dataset['conflictPathDetail'] = path ?? 'none';
    draftHost = undefined;
    draftStatus = undefined;
    draftTextNode = undefined;
    saveButton = undefined;
    saveReason = undefined;
    if (path === 'keep-current') {
      pathDetail.replaceChildren(
        el('p', 'proposal-conflict-consequence', conflictPathNote('keep-current', next.conflictKind)),
        button('confirm-keep-current', CONFLICT_CONFIRM_LABELS.keepCurrent, 'primary', () => void resolve('keep-current')),
      );
    } else if (path === 'defer') {
      pathDetail.replaceChildren(
        el('p', 'proposal-conflict-consequence', conflictPathNote('defer', next.conflictKind)),
        button('confirm-defer', CONFLICT_CONFIRM_LABELS.defer, 'primary', () => void resolve('defer')),
      );
    } else if (path === 'edit-draft') {
      draftHost = el('section', 'proposal-conflict-draft');
      pathDetail.replaceChildren(draftHost);
      renderDraft(focus);
    } else {
      pathDetail.replaceChildren();
    }
  }

  /** The Resolution Draft: one row per changed unit with its quick actions, and the draft as a whole. */
  function renderDraft(focus: string | null): void {
    const next = projection;
    if (next === null || draftHost === undefined) return;
    const active = document.activeElement;
    const keep = focus ?? (active instanceof HTMLElement && draftHost.contains(active) ? focusKeyOf(active) : null);
    const section = el('section', 'proposal-conflict-draft');
    section.dataset['conflictDraft'] = 'true';
    section.setAttribute('aria-label', CONFLICT_DRAFT_HEADING);
    section.append(el('h3', undefined, CONFLICT_DRAFT_HEADING), el('p', 'muted', CONFLICT_DRAFT_NOTE));

    const toolbar = el('div', 'button-row proposal-conflict-draft-toolbar');
    toolbar.dataset['draftToolbar'] = 'true';
    const undoButton = button('undo', CONFLICT_QUICK_ACTIONS.undo, 'quiet', undo);
    undoButton.disabled = undoStack.length === 0;
    const redoButton = button('redo', CONFLICT_QUICK_ACTIONS.redo, 'quiet', redo);
    redoButton.disabled = redoStack.length === 0;
    const pending = unresolvedUnits(next.units, resolutions);
    const previousUnresolved = button('previous-unresolved', CONFLICT_QUICK_ACTIONS.previousUnresolved, 'quiet', () => moveToUnresolved(-1));
    const nextUnresolved = button('next-unresolved', CONFLICT_QUICK_ACTIONS.nextUnresolved, 'quiet', () => moveToUnresolved(1));
    previousUnresolved.disabled = pending.length === 0;
    nextUnresolved.disabled = pending.length === 0;
    toolbar.append(undoButton, redoButton, previousUnresolved, nextUnresolved);
    // Offered only when there is something to include; it never touches a conflicting unit (CONFLICT-010).
    if (hasNonConflictingChanges(next.units, resolutions)) {
      toolbar.append(button('include-non-conflicting', CONFLICT_QUICK_ACTIONS.includeNonConflicting, 'secondary', () => {
        const bulk = includeNonConflictingChanges(next.units, resolutions);
        bulkSummary = conflictBulkSummary(bulk.included, bulk.conflictsLeft);
        orderingUnit = null;
        editingUnit = null;
        change(bulk.resolutions, 'toolbar:undo');
        options.setStatus(bulkSummary, 'success');
      }));
    }
    section.append(toolbar, el('small', 'muted proposal-conflict-keyboard', conflictKeyboardHint(options.platform)));
    if (bulkSummary !== null) {
      const summary = el('p', 'muted', bulkSummary);
      summary.dataset['draftBulkSummary'] = 'true';
      section.append(summary);
    }

    const list = el('ol', 'proposal-conflict-draft-units');
    let ordinal = 0;
    next.units.forEach((unit, unitIndex) => {
      if (!isChangeUnit(unit)) return;
      ordinal += 1;
      list.append(draftUnit(unit, unitIndex, ordinal));
    });
    section.append(list);

    const whole = el('div', 'proposal-conflict-draft-text');
    whole.append(el('h4', undefined, CONFLICT_DRAFT_TEXT_LABEL));
    draftTextNode = el('p', 'proposal-conflict-words');
    draftTextNode.dataset['conflictDraftText'] = 'true';
    whole.append(draftTextNode);
    draftStatus = el('p', 'proposal-conflict-draft-status');
    draftStatus.setAttribute('role', 'status');
    draftStatus.dataset['conflictDraftStatus'] = 'true';
    const saveRow = el('div', 'button-row');
    saveButton = button('save-version', CONFLICT_QUICK_ACTIONS.saveVersion, 'primary', () => void saveVersion());
    saveReason = el('small', 'field-note proposal-conflict-save-reason');
    saveReason.id = uid('save-reason');
    saveReason.dataset['conflictSaveReason'] = 'true';
    saveButton.setAttribute('aria-describedby', saveReason.id);
    saveRow.append(saveButton);
    section.append(whole, draftStatus, saveRow, saveReason);

    if (draftHost.isConnected) draftHost.replaceWith(section);
    else pathDetail?.replaceChildren(section);
    draftHost = section;
    paintDraftSummary();
    if (keep !== null) restoreFocus(section, keep);
  }

  function draftUnit(unit: ConflictUnit, unitIndex: number, ordinal: number): HTMLElement {
    const entry = resolutions[unitIndex] ?? { resolution: 'unresolved', text: null };
    const resolution = entry.resolution ?? 'unresolved';
    const item = el('li', 'proposal-conflict-draft-unit');
    item.dataset['draftUnit'] = String(unitIndex);
    item.dataset['unitKind'] = unit.kind;
    item.dataset['unitResolution'] = resolution;
    const heading = el('p', 'proposal-conflict-unit-label', conflictUnitHeading(ordinal, unit.kind, resolution));
    heading.tabIndex = -1;
    heading.dataset['draftUnitHeading'] = 'true';
    item.append(heading);
    const resolvedWords = el('p', 'proposal-conflict-words proposal-conflict-resolved-words', wordsOf(resolvedUnitText(unit, entry)));
    resolvedWords.dataset['draftUnitWords'] = 'true';
    if (resolution !== 'unresolved') item.append(resolvedWords);
    const actions = el('div', 'button-row');
    const keepBoth = button('keep-both', CONFLICT_QUICK_ACTIONS.keepBoth, 'secondary', () => {
      orderingUnit = orderingUnit === unitIndex ? null : unitIndex;
      editingUnit = null;
      renderDraft(`${unitIndex}:keep-both`);
    });
    keepBoth.setAttribute('aria-expanded', String(orderingUnit === unitIndex));
    actions.append(
      button('take-current', CONFLICT_QUICK_ACTIONS.takeCurrent, 'secondary', () => setUnit(unitIndex, { resolution: 'current', text: null }, `${unitIndex}:take-current`)),
      button('take-proposed', CONFLICT_QUICK_ACTIONS.takeProposed, 'secondary', () => setUnit(unitIndex, { resolution: 'proposed', text: null }, `${unitIndex}:take-proposed`)),
      keepBoth,
      button('edit-unit', CONFLICT_QUICK_ACTIONS.edit, 'secondary', () => {
        // Choosing to edit resolves the unit as edited, starting from what it reads now.
        const next = copyOf(resolutions);
        next[unitIndex] = { resolution: 'edited', text: resolution === 'unresolved' ? unit.current : resolvedUnitText(unit, entry) };
        orderingUnit = null;
        editingUnit = unitIndex;
        change(next, `${unitIndex}:editor`);
      }),
    );
    for (const control of actions.querySelectorAll<HTMLButtonElement>('button')) control.disabled = working;
    item.append(actions);
    // 两者都保留 needs an explicit order; within one paragraph both orders are always well-formed (CONFLICT-009).
    if (orderingUnit === unitIndex) {
      const order = el('div', 'button-row proposal-conflict-order');
      order.setAttribute('role', 'group');
      order.setAttribute('aria-label', CONFLICT_KEEP_BOTH_PROMPT);
      order.append(
        el('span', 'muted', CONFLICT_KEEP_BOTH_PROMPT),
        button('keep-both-current-first', CONFLICT_QUICK_ACTIONS.currentFirst, 'secondary', () =>
          setUnit(unitIndex, { resolution: 'both-current-first', text: null }, `${unitIndex}:keep-both`)),
        button('keep-both-proposed-first', CONFLICT_QUICK_ACTIONS.proposedFirst, 'secondary', () =>
          setUnit(unitIndex, { resolution: 'both-proposed-first', text: null }, `${unitIndex}:keep-both`)),
      );
      item.append(order);
    }
    if (editingUnit === unitIndex) item.append(unitEditor(unit, unitIndex, entry));
    return item;
  }

  /** 编辑合并结果: an IME-safe field with the current and proposed words beside it for reference. */
  function unitEditor(unit: ConflictUnit, unitIndex: number, entry: ConflictUnitResolution): HTMLElement {
    const editor = el('div', 'proposal-conflict-unit-editor');
    const reference = el('dl', 'proposal-conflict-reference');
    reference.append(
      el('dt', undefined, CONFLICT_EDIT_REFERENCE.current), el('dd', 'proposal-conflict-words', wordsOf(unit.current)),
      el('dt', undefined, CONFLICT_EDIT_REFERENCE.proposed), el('dd', 'proposal-conflict-words', wordsOf(unit.proposed)),
    );
    const label = el('label', 'editorial-mark-field');
    label.append(el('span', undefined, CONFLICT_EDIT_FIELD));
    const field = el('textarea');
    field.rows = 3;
    field.value = entry.text ?? '';
    field.dataset['draftUnitEditor'] = String(unitIndex);
    field.dataset['conflictAction'] = 'editor';
    const record = (): void => {
      if (composing) return;
      resolutions[unitIndex] = { resolution: 'edited', text: field.value };
      redoStack = [];
      paintDraftSummary();
      scheduleSave(600);
    };
    field.addEventListener('compositionstart', () => {
      composing = true;
    });
    field.addEventListener('compositionend', () => {
      composing = false;
      record();
    });
    field.addEventListener('input', record);
    label.append(field);
    editor.append(reference, label, button('done-editing', CONFLICT_QUICK_ACTIONS.doneEditing, 'quiet', () => {
      editingUnit = null;
      renderDraft(`${unitIndex}:edit-unit`);
      void saveNow();
    }));
    return editor;
  }

  function moveToUnresolved(step: -1 | 1): void {
    const next = projection;
    if (next === null || draftHost === undefined) return;
    const pending = unresolvedUnits(next.units, resolutions);
    if (pending.length === 0) return;
    const current = document.activeElement instanceof HTMLElement
      ? Number(document.activeElement.closest<HTMLElement>('[data-draft-unit]')?.dataset['draftUnit'] ?? Number.NaN)
      : Number.NaN;
    const target = Number.isNaN(current)
      ? step === 1 ? pending[0]! : pending.at(-1)!
      : step === 1
        ? pending.find((unitIndex) => unitIndex > current) ?? pending[0]!
        : [...pending].reverse().find((unitIndex) => unitIndex < current) ?? pending.at(-1)!;
    const heading = draftHost.querySelector<HTMLElement>(`[data-draft-unit="${target}"] [data-draft-unit-heading]`);
    heading?.scrollIntoView({ block: 'nearest' });
    heading?.focus();
  }

  function focusKeyOf(node: HTMLElement): string | null {
    const unit = node.closest<HTMLElement>('[data-draft-unit]')?.dataset['draftUnit'];
    const action = node.dataset['conflictAction'];
    if (action === undefined) return null;
    return unit === undefined ? `toolbar:${action}` : `${unit}:${action}`;
  }

  function restoreFocus(section: HTMLElement, key: string): void {
    const [scope, action] = key.split(':');
    const within = scope === 'toolbar' ? section.querySelector<HTMLElement>('[data-draft-toolbar]') : section.querySelector<HTMLElement>(`[data-draft-unit="${scope}"]`);
    const target = within?.querySelector<HTMLElement>(`[data-conflict-action="${action}"]`);
    if (target instanceof HTMLButtonElement && target.disabled) {
      within?.querySelector<HTMLElement>('[data-draft-unit-heading]')?.focus();
      return;
    }
    target?.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (draftHost === undefined || !(event.target instanceof Node) || !draftHost.contains(event.target)) return;
    // A field being typed in keeps its own undo; the draft's undo acts on the units.
    if (event.target instanceof HTMLTextAreaElement) return;
    const modifier = options.platform === 'darwin' ? event.metaKey : event.ctrlKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      redo();
    }
  }

  // ---- leaving ------------------------------------------------------------------------------------------

  function returnRow(): HTMLElement {
    const row = el('div', 'button-row workbench-actions');
    row.append(button('return', CONFLICT_RETURN_LABEL, 'secondary', () => {
      const next = projection;
      void leave(() => options.returnToManuscript(next === null ? null : { blockId: next.blockId, markId }, null));
    }));
    return row;
  }

  /** Leave the workspace once the draft on screen is the one on record; a failed save keeps the editor here. */
  async function leave(go: () => Promise<void>): Promise<void> {
    if (working || destroyed) return;
    working = true;
    try {
      if (projection !== null && dirty() && !(await saveNow())) {
        options.setStatus(conflictDraftUnsaved(saveState.kind === 'failed' ? saveState.reason : '请稍候再试。'), 'error');
        return;
      }
      options.setStatus(CONFLICT_STATUS_LINES.returning, 'busy');
      await go();
    } catch (error) {
      options.setStatus(options.errorMessage(error, CONFLICT_STATUS_LINES.returnFailed), 'error');
    } finally {
      working = false;
    }
  }

  async function resolve(outcome: 'keep-current' | 'defer'): Promise<void> {
    const next = projection;
    if (next === null || working) return;
    working = true;
    try {
      // 暂不处理 keeps the draft: whatever is on screen is saved first.
      if (outcome === 'defer' && dirty() && !(await saveNow())) {
        options.setStatus(conflictDraftUnsaved(saveState.kind === 'failed' ? saveState.reason : '请稍候再试。'), 'error');
        return;
      }
      options.setStatus(CONFLICT_STATUS_LINES.resolving, 'busy');
      const result = await api.resolveProposalConflict({ ...binding, basisDigest: next.basisDigest, outcome, draftOrdinal: null });
      if (result.markId !== markId) throw new Error('处理结果不属于这处冲突。');
      await options.returnToManuscript({ blockId: result.blockId, markId }, outcome === 'defer' ? CONFLICT_COMPLETION.defer : CONFLICT_COMPLETION.keepCurrent);
    } catch (error) {
      options.setStatus(options.errorMessage(error, CONFLICT_STATUS_LINES.resolveFailed), 'error');
      if (options.errorCode(error) === 'PROPOSAL_CONFLICT_STALE') void load();
    } finally {
      working = false;
    }
  }

  /** 保存为新提案版本: the draft on record becomes a new 修改建议, which waits on the manuscript, not applied. */
  async function saveVersion(): Promise<void> {
    const next = projection;
    if (next === null || working) return;
    const reason = conflictSaveReason(saveBlocker(), unresolvedUnits(next.units, resolutions).length);
    if (reason !== null) {
      options.setStatus(reason, 'error');
      return;
    }
    working = true;
    paintDraftSummary();
    try {
      if (!(await saveNow()) || savedOrdinal === null) {
        options.setStatus(conflictDraftUnsaved(saveState.kind === 'failed' ? saveState.reason : '请稍候再试。'), 'error');
        return;
      }
      options.setStatus(CONFLICT_STATUS_LINES.resolving, 'busy');
      const result = await api.resolveProposalConflict({ ...binding, basisDigest: next.basisDigest, outcome: 'new-version', draftOrdinal: savedOrdinal });
      if (result.markId !== markId || result.newMarkId === null) throw new Error('处理结果不属于这处冲突。');
      await options.returnToManuscript({ blockId: result.blockId, markId: result.newMarkId }, CONFLICT_COMPLETION.newVersion);
    } catch (error) {
      options.setStatus(options.errorMessage(error, CONFLICT_STATUS_LINES.resolveFailed), 'error');
      if (options.errorCode(error) === 'PROPOSAL_CONFLICT_STALE') void load();
    } finally {
      working = false;
      paintDraftSummary();
    }
  }

  function technical(next: ProposalConflictProjection): HTMLElement {
    return options.technicalDetails(
      undefined,
      ...fact('修改建议标识', next.markId),
      ...fact('提案修改项', next.suggestion.itemId),
      ...fact('比较依据摘要', next.basisDigest),
      ...fact('内容块', `${next.blockId} · 字素 ${next.fromGrapheme}–${next.toGrapheme}`),
      ...(next.draft === null ? [] : fact('已保存的解决草稿', `第 ${next.draft.ordinal} 份 · ${next.draft.draftId}`)),
    );
  }

  return {
    start: () => {
      options.setStatus(CONFLICT_STATUS_LINES.opening, 'busy');
      void load();
    },
    destroy: () => {
      destroyed = true;
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    },
  };
}
