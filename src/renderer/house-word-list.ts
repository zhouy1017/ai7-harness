import { styleInput } from './components/controls.js';
import { technicalDisclosure } from './technical-layer.js';
import {
  HOUSE_ADD, HOUSE_CHANGED, HOUSE_COLUMNS, HOUSE_CREATE, HOUSE_DISCARD, HOUSE_DRAFT_FAILED, HOUSE_DRAFT_NOTE, HOUSE_EDIT, HOUSE_EMPTY,
  HOUSE_HISTORY_SUMMARY, HOUSE_LATEST, HOUSE_NEXT, HOUSE_PASTE_ADD, HOUSE_PASTE_FAILED, HOUSE_PASTE_LABEL,
  HOUSE_PASTE_NOTHING, HOUSE_PASTE_REFUSED, HOUSE_PASTE_SAVE, HOUSE_PREVIOUS, HOUSE_READING, HOUSE_READ_FAILED, HOUSE_REMOVE, HOUSE_RETRY_READ, HOUSE_SAVE,
  HOUSE_SAVED_READING, HOUSE_SAVED_READ_PENDING, HOUSE_TOO_MANY,
  houseCountLine, houseCurrentLine, houseEarlierLine, houseHistoryLabel, houseRowLabel, houseSavedStatus, houseSavedUnreadStatus,
} from './house-word-list-labels.js';
import {
  HOUSE_DISCLOSURE, HOUSE_PAGE_SIZE, MAX_HOUSE_ENTRIES, HouseWordListError, previewHousePaste, validateSaveHouseWordListInput,
  type HousePastePreview, type HouseWordListApi, type HouseWordListDraftEntry, type HouseWordListPage,
  type HouseWordListSourceKind, type InspectHouseWordListInput, type SaveHouseWordListInput, type SaveHouseWordListResult,
} from '../shared/protocol/house-word-list.js';

type Tone = 'primary' | 'secondary' | 'quiet';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

/**
 * The shared editor for the 本社词表 (Issue #1543): a page of 知识库, also mounted in the review sheet and from deterministic-check
 * setup. The caller names it; the editor holds no title of its own.
 */
export function mountHouseWordList(options: {
  readonly root: HTMLElement; readonly api: HouseWordListApi;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly onSaved?: () => void;
}): { load(): Promise<void>; destroy(): void; failed(): boolean } {
  const { root, api, setStatus } = options;
  let page: HouseWordListPage | null = null; let draft: HouseWordListDraftEntry[] | null = null;
  let expectedCurrent: SaveHouseWordListInput['expectedCurrent'] = null; let sourceKind: HouseWordListSourceKind = 'editor-entry';
  let request: InspectHouseWordListInput = { versionId: null, entryOffset: 0, historyOffset: 0 };
  let preview: HousePastePreview | null = null; let pastedText = ''; let draftOffset = 0;
  /** A successful save is durable even when the following read fails; retrying this state never saves again. */
  let committedRead: SaveHouseWordListResult | null = null;
  let busy = false; let destroyed = false; let failed = false;
  /** The first read did not come: told apart from a list nobody has saved. */
  let loadFailed = false;
  /** Where the editor's place goes after the next paint: every paint draws the panel anew, so the control they were on is gone. */
  let pendingFocus: string | null = null;
  const EDIT = '[data-house-action="edit"]'; const ADD = '[data-house-action="add"]'; const SAVE = '[data-house-action="save"]';
  const rowField = (row: number): string => `[data-house-entry-row="${row}"] [data-house-field="literal"]`;
  const button = (label: string, name: string, run: () => void, disabled = false, tone: Tone = 'secondary'): HTMLButtonElement => {
    const node = el('button', label); node.type = 'button'; node.className = `btn button ${tone}`; node.dataset['houseAction'] = name;
    node.disabled = busy || disabled;
    // The editor's place is the control they pressed, unless the step says where it goes next.
    node.addEventListener('click', () => { pendingFocus = `[data-house-action="${name}"]`; run(); }); return node;
  };
  const buttons = (...nodes: HTMLElement[]): HTMLElement => { const row = el('div', undefined, 'button-row'); row.append(...nodes); return row; };
  /** Two text buttons side by side: the page before and the page after. */
  const pager = (name: string, before: () => void, after: () => void, atStart: boolean, atEnd: boolean): HTMLElement =>
    buttons(button(HOUSE_PREVIOUS, `${name}-previous`, before, atStart), button(HOUSE_NEXT, `${name}-next`, after, atEnd));
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy || destroyed) return;
    busy = true; failed = false; loadFailed = false; paint();
    try { await work(); }
    catch (error) {
      failed = true;
      loadFailed = page === null && draft === null && committedRead === null;
      if (!destroyed) setStatus(committedRead !== null ? houseSavedUnreadStatus(committedRead.created)
        : error instanceof HouseWordListError ? error.message : draft === null ? HOUSE_READ_FAILED : HOUSE_DRAFT_FAILED, 'error');
    } finally { if (!destroyed) { busy = false; paint(); } }
  };
  const inspect = async (next: InspectHouseWordListInput): Promise<void> => {
    const result = await api.inspectHouseWordList(next);
    if (!destroyed) { page = result; request = next; }
  };
  const readCommitted = async (): Promise<void> => {
    const saved = committedRead; if (saved === null) return;
    await inspect({ versionId: saved.pin.versionId, entryOffset: 0, historyOffset: 0 });
    if (!destroyed) { committedRead = null; pendingFocus = EDIT; setStatus(houseSavedStatus(saved.created, saved.ordinal), 'success'); }
  };
  const beginDraft = (): Promise<void> => { pendingFocus = EDIT; return run(async () => {
    const first = await api.inspectHouseWordList({ versionId: null, entryOffset: 0, historyOffset: 0 });
    const pin = first.current; const entries = [...first.entries]; let next = first.nextEntryOffset;
    while (next !== null && pin !== null) {
      const part = await api.inspectHouseWordList({ versionId: pin.versionId, entryOffset: next, historyOffset: 0 });
      if (JSON.stringify(part.current) !== JSON.stringify(pin) || part.selected?.pin.versionId !== pin.versionId || part.nextEntryOffset !== null && part.nextEntryOffset <= next) {
        throw new HouseWordListError('HOUSE_CURRENT_CHANGED', HOUSE_CHANGED);
      }
      entries.push(...part.entries);
      if (entries.length > MAX_HOUSE_ENTRIES) throw new HouseWordListError('HOUSE_ENTRIES_INVALID', HOUSE_TOO_MANY);
      next = part.nextEntryOffset;
    }
    if (destroyed) return;
    page = first; draft = entries; expectedCurrent = pin === null ? null : { versionId: pin.versionId, digest: pin.digest };
    sourceKind = 'editor-entry'; preview = null; pastedText = ''; draftOffset = 0;
    pendingFocus = entries.length > 0 ? rowField(1) : ADD;
  }); };
  const save = (): Promise<void> => { pendingFocus = SAVE; return run(async () => {
    if (draft === null) return;
    const input: SaveHouseWordListInput = { expectedCurrent, sourceKind, entries: draft };
    validateSaveHouseWordListInput(input);
    const saved = await api.saveHouseWordList(input);
    options.onSaved?.();
    if (destroyed) return;
    draft = null; preview = null; pastedText = '';
    committedRead = saved; page = null;
    await readCommitted();
    pendingFocus = EDIT;
  }); };

  /** One draft row: the word, its note, and 启用 with the row's own 移除, under the three column headings. */
  const draftRow = (entry: HouseWordListDraftEntry, index: number): HTMLElement => {
    const row = el('li', undefined, 'house-row'); row.dataset['houseEntryRow'] = String(index + 1);
    const literal = styleInput(el('input')); literal.value = entry.literal; literal.disabled = busy;
    literal.dataset['houseField'] = 'literal'; literal.setAttribute('aria-label', houseRowLabel(index + 1, HOUSE_COLUMNS[0]));
    literal.addEventListener('input', () => { if (draft !== null) draft[index] = { ...draft[index]!, literal: literal.value }; });
    const note = styleInput(el('textarea')); note.value = entry.note; note.disabled = busy; note.rows = 1;
    note.dataset['houseField'] = 'note'; note.setAttribute('aria-label', houseRowLabel(index + 1, HOUSE_COLUMNS[1]));
    note.addEventListener('input', () => { if (draft !== null) draft[index] = { ...draft[index]!, note: note.value }; });
    const enabled = el('input'); enabled.type = 'checkbox'; styleInput(enabled); enabled.checked = entry.enabled; enabled.disabled = busy;
    enabled.dataset['houseField'] = 'enabled'; enabled.setAttribute('aria-label', houseRowLabel(index + 1, HOUSE_COLUMNS[2]));
    enabled.addEventListener('change', () => { if (draft !== null) draft[index] = { ...draft[index]!, enabled: enabled.checked }; });
    const remove = button(HOUSE_REMOVE, `remove-${index}`, () => {
      draft?.splice(index, 1); if (draftOffset >= (draft?.length ?? 0)) draftOffset = Math.max(0, draftOffset - HOUSE_PAGE_SIZE);
      pendingFocus = index >= draftOffset && index < Math.min(draft?.length ?? 0, draftOffset + HOUSE_PAGE_SIZE) ? rowField(index + 1) : ADD; paint();
    }, false, 'quiet');
    remove.setAttribute('aria-label', houseRowLabel(index + 1, HOUSE_REMOVE));
    const tail = el('span', undefined, 'house-row-tail'); tail.append(enabled, remove);
    row.append(literal, note, tail);
    return row;
  };

  const paintDraft = (panel: HTMLElement, current: HouseWordListDraftEntry[]): void => {
    panel.append(el('p', HOUSE_DRAFT_NOTE, 'field-note'));
    const head = el('div', undefined, 'house-row house-row-head');
    for (const column of HOUSE_COLUMNS) head.append(el('span', column));
    const list = el('ul', undefined, 'house-rows');
    const last = Math.min(current.length, draftOffset + HOUSE_PAGE_SIZE);
    for (let index = draftOffset; index < last; index++) list.append(draftRow(current[index]!, index));
    if (current.length > 0) panel.append(head);
    panel.append(list, el('p', current.length === 0 ? '' : houseCountLine(current.length, draftOffset + 1, last), 'field-note'));
    if (current.length > HOUSE_PAGE_SIZE) {
      panel.append(pager('draft', () => { draftOffset -= HOUSE_PAGE_SIZE; pendingFocus = '[data-house-action="draft-previous"]'; paint(); }, () => { draftOffset += HOUSE_PAGE_SIZE; pendingFocus = '[data-house-action="draft-next"]'; paint(); },
        draftOffset === 0, draftOffset + HOUSE_PAGE_SIZE >= current.length));
    }
    panel.append(buttons(button(HOUSE_ADD, 'add', () => {
      current.push({ entryId: null, literal: '', note: '', enabled: true }); draftOffset = Math.floor((current.length - 1) / HOUSE_PAGE_SIZE) * HOUSE_PAGE_SIZE;
      pendingFocus = rowField(current.length); paint();
    }, current.length >= MAX_HOUSE_ENTRIES)));
    const pasteLabel = el('label', HOUSE_PASTE_LABEL, 'house-paste'); const paste = styleInput(el('textarea')); paste.value = pastedText; paste.disabled = busy; paste.dataset['houseField'] = 'paste';
    paste.addEventListener('input', () => { pastedText = paste.value; preview = null; }); pasteLabel.append(paste);
    // The pasted lines are parsed and joined to the draft in one step (Issue #1410 item 26); 加入并保存 also saves the list.
    // A line that cannot be kept stops the whole paste with its reason, and nothing is joined.
    const acceptPaste = (): boolean => {
      if (draft === null) return false;
      preview = previewHousePaste(pastedText);
      if (preview.errors.length > 0 || preview.entries.length === 0) { pendingFocus = '[data-house-field="paste"]'; paint(); return false; }
      try {
        const combined = [...draft, ...preview.entries]; validateSaveHouseWordListInput({ expectedCurrent, sourceKind: 'editor-paste', entries: combined });
        draft = combined; sourceKind = 'editor-paste'; preview = null; pastedText = ''; pendingFocus = '[data-house-field="paste"]'; paint(); return true;
      } catch (error) { setStatus(error instanceof HouseWordListError ? error.message : HOUSE_PASTE_FAILED, 'error'); return false; }
    };
    panel.append(pasteLabel, buttons(button(HOUSE_PASTE_ADD, 'accept-paste', () => { acceptPaste(); }),
      button(HOUSE_PASTE_SAVE, 'paste-save', () => { if (acceptPaste()) void save(); })));
    if (preview !== null && (preview.errors.length > 0 || preview.entries.length === 0)) {
      const result = el('div'); result.dataset['housePastePreview'] = 'true'; result.setAttribute('role', 'alert');
      result.append(el('p', preview.errors.length > 0 ? HOUSE_PASTE_REFUSED : HOUSE_PASTE_NOTHING));
      for (const error of preview.errors) result.append(el('p', error.message));
      panel.append(result);
    }
    panel.append(buttons(button(HOUSE_SAVE, 'save', () => void save(), false, 'primary'), button(HOUSE_DISCARD, 'discard', () => void run(async () => {
      await inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }); draft = null; preview = null; pendingFocus = EDIT;
    }), false, 'quiet')));
  };

  const paintRead = (panel: HTMLElement): void => {
    const selected = page?.selected ?? null;
    // Reading, a read that did not come, and nothing saved are three states: only the last offers to create.
    if (page === null) {
      if (loadFailed) panel.append(el('p', HOUSE_READ_FAILED), buttons(button(HOUSE_RETRY_READ, 'reload', () => void run(async () => { await inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }); pendingFocus = EDIT; }), false, 'primary')));
      else panel.append(el('p', HOUSE_READING));
      return;
    }
    if (selected === null) {
      panel.append(el('p', HOUSE_EMPTY), buttons(button(HOUSE_CREATE, 'edit', () => void beginDraft(), false, 'primary')));
      return;
    }
    const isCurrent = page.current !== null && page.current.versionId === selected.pin.versionId;
    panel.append(el('p', isCurrent ? houseCurrentLine(selected) : houseEarlierLine(selected)));
    const entries = el('ul', undefined, 'house-entries');
    for (const entry of page.entries) {
      const row = el('li'); row.dataset['houseEntry'] = '';
      row.append(el('span', `${entry.literal} · ${entry.enabled ? '启用' : '停用'}`), el('p', `说明：${entry.note || '（无）'}`, 'field-note'));
      entries.append(row);
    }
    panel.append(entries);
    if (request.entryOffset > 0 || page.nextEntryOffset !== null) {
      panel.append(pager('entries', () => void run(() => inspect({ ...request, entryOffset: Math.max(0, request.entryOffset - HOUSE_PAGE_SIZE) })),
        () => void run(() => inspect({ ...request, entryOffset: page!.nextEntryOffset! })), request.entryOffset === 0, page.nextEntryOffset === null));
    }
    const details = el('details'); details.append(el('summary', '查看技术详情'), el('p', `词表 ${selected.pin.listId} · 版本 ${selected.pin.versionId} · 摘要 ${selected.pin.digest}`));
    panel.append(technicalDisclosure(details));
    panel.append(isCurrent
      ? buttons(button(HOUSE_EDIT, 'edit', () => void beginDraft(), false, 'primary'))
      : buttons(button(HOUSE_LATEST, 'current', () => { pendingFocus = EDIT; void run(() => inspect({ versionId: null, entryOffset: 0, historyOffset: 0 })); }, false, 'primary')));
    // Earlier lists are named by when they were saved; with only one saved there is nothing to look back at.
    const currentId = page.current?.versionId; const earlier = page.history.filter((version) => version.pin.versionId !== currentId);
    if (earlier.length > 0 || request.historyOffset > 0 || page.nextHistoryOffset !== null) {
      const history = el('details', undefined, 'house-history'); history.append(el('summary', HOUSE_HISTORY_SUMMARY));
      for (const version of earlier) {
        history.append(button(houseHistoryLabel(version), `history-${version.ordinal}`, () => { pendingFocus = '[data-house-action="current"]'; void run(() => inspect({ ...request, versionId: version.pin.versionId, entryOffset: 0 })); }, false, 'quiet'));
      }
      if (request.historyOffset > 0 || page.nextHistoryOffset !== null) {
        history.append(pager('history', () => void run(() => inspect({ ...request, historyOffset: Math.max(0, request.historyOffset - HOUSE_PAGE_SIZE) })),
          () => void run(() => inspect({ ...request, historyOffset: page!.nextHistoryOffset! })), request.historyOffset === 0, page.nextHistoryOffset === null));
      }
      panel.append(history);
    }
  };

  const paint = (): void => {
    if (destroyed) return;
    const panel = el('section', undefined, 'guideline-card house-word-list'); panel.dataset['houseWordList'] = 'panel';
    panel.dataset['houseState'] = committedRead !== null ? 'saved' : draft !== null ? 'draft' : page === null ? (loadFailed ? 'failed' : 'reading') : page.selected === null ? 'empty' : 'saved';
    panel.append(el('p', HOUSE_DISCLOSURE, 'field-note'));
    if (committedRead !== null) {
      panel.append(el('p', busy ? HOUSE_SAVED_READING : HOUSE_SAVED_READ_PENDING), buttons(button(HOUSE_RETRY_READ, 'retry-read', () => void run(readCommitted), false, 'primary')));
    } else if (draft !== null) paintDraft(panel, draft);
    else paintRead(panel);
    root.replaceChildren(panel);
    if (pendingFocus !== null && !busy) {
      // Where the step said, if that control is there and can be used; else the page's primary action, else its first control.
      const usable = (node: HTMLElement | null): node is HTMLButtonElement => node !== null && (node as HTMLButtonElement).disabled !== true;
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter((node) => !node.disabled);
      const target = root.querySelector<HTMLElement>(pendingFocus);
      (usable(target) || target?.tagName !== 'BUTTON' && target !== null ? target : buttons.find((node) => node.className.includes('primary')) ?? buttons[0])?.focus();
      pendingFocus = null;
    }
  };
  paint();
  return { load: () => run(() => committedRead === null ? inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }) : readCommitted()), destroy: () => { destroyed = true; root.replaceChildren(); }, failed: () => failed };
}
