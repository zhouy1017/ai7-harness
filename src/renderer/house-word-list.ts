import {
  HOUSE_DISCLOSURE, HOUSE_PAGE_SIZE, MAX_HOUSE_ENTRIES, HouseWordListError, previewHousePaste, validateSaveHouseWordListInput,
  type HousePastePreview, type HouseWordListApi, type HouseWordListDraftEntry, type HouseWordListPage,
  type HouseWordListSourceKind, type InspectHouseWordListInput, type SaveHouseWordListInput, type SaveHouseWordListResult,
} from '../shared/protocol/house-word-list.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
/** The shared editor for the House list, also mounted from deterministic-check setup. */
export function mountHouseWordList(options: {
  readonly root: HTMLElement; readonly api: HouseWordListApi;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly onSaved?: () => void;
}): { load(): Promise<void>; destroy(): void } {
  const { root, api, setStatus } = options;
  let page: HouseWordListPage | null = null; let draft: HouseWordListDraftEntry[] | null = null;
  let expectedCurrent: SaveHouseWordListInput['expectedCurrent'] = null; let sourceKind: HouseWordListSourceKind = 'editor-entry';
  let request: InspectHouseWordListInput = { versionId: null, entryOffset: 0, historyOffset: 0 };
  let preview: HousePastePreview | null = null; let pastedText = ''; let draftOffset = 0;
  /** A successful save is durable even when the following read fails; retrying this state never saves again. */
  let committedRead: SaveHouseWordListResult | null = null;
  let busy = false; let destroyed = false;
  const button = (label: string, name: string, run: () => void, disabled = false): HTMLButtonElement => {
    const node = el('button', label); node.type = 'button'; node.className = 'button secondary'; node.dataset['houseAction'] = name;
    node.disabled = busy || disabled; node.addEventListener('click', run); return node;
  };
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy || destroyed) return;
    busy = true; paint();
    try { await work(); }
    catch (error) {
      if (!destroyed) setStatus(committedRead !== null
        ? `${committedRead.created ? '已保存本社敏感词表' : '词条未变，仍为'} 第${committedRead.ordinal}版；读取未完成，请重试读取。`
        : error instanceof HouseWordListError ? error.message : draft === null ? '词表读取未完成，请重试。' : '词表操作未完成；草稿已保留，请重试。', 'error');
    } finally { if (!destroyed) { busy = false; paint(); } }
  };
  const inspect = async (next: InspectHouseWordListInput): Promise<void> => {
    const result = await api.inspectHouseWordList(next);
    if (!destroyed) { page = result; request = next; }
  };
  const readCommitted = async (): Promise<void> => {
    const saved = committedRead; if (saved === null) return;
    await inspect({ versionId: saved.pin.versionId, entryOffset: 0, historyOffset: 0 });
    if (!destroyed) {
      committedRead = null;
      setStatus(saved.created ? `已保存本社敏感词表 第${saved.ordinal}版。` : `词条未变，仍为第${saved.ordinal}版。`, 'success');
    }
  };
  const beginDraft = (): Promise<void> => run(async () => {
    const first = await api.inspectHouseWordList({ versionId: null, entryOffset: 0, historyOffset: 0 });
    const pin = first.current; const entries = [...first.entries]; let next = first.nextEntryOffset;
    while (next !== null && pin !== null) {
      const part = await api.inspectHouseWordList({ versionId: pin.versionId, entryOffset: next, historyOffset: 0 });
      if (JSON.stringify(part.current) !== JSON.stringify(pin) || part.selected?.pin.versionId !== pin.versionId || part.nextEntryOffset !== null && part.nextEntryOffset <= next) {
        throw new HouseWordListError('HOUSE_CURRENT_CHANGED', '词表已有新版本，请重新打开编辑。');
      }
      entries.push(...part.entries);
      if (entries.length > MAX_HOUSE_ENTRIES) throw new HouseWordListError('HOUSE_ENTRIES_INVALID', '词表条数无效。');
      next = part.nextEntryOffset;
    }
    if (destroyed) return;
    page = first; draft = entries; expectedCurrent = pin === null ? null : { versionId: pin.versionId, digest: pin.digest };
    sourceKind = 'editor-entry'; preview = null; pastedText = ''; draftOffset = 0;
  });
  const save = (): Promise<void> => run(async () => {
    if (draft === null) return;
    const input: SaveHouseWordListInput = { expectedCurrent, sourceKind, entries: draft };
    validateSaveHouseWordListInput(input);
    const saved = await api.saveHouseWordList(input);
    options.onSaved?.();
    if (destroyed) return;
    draft = null; preview = null; pastedText = '';
    committedRead = saved; page = null;
    await readCommitted();
  });
  const paint = (): void => {
    if (destroyed) return;
    const panel = el('section'); panel.className = 'guideline-card'; panel.dataset['houseWordList'] = 'panel';
    panel.append(el('h3', '本社敏感词表'), el('p', HOUSE_DISCLOSURE));
    if (committedRead !== null) {
      panel.append(el('p', `第${committedRead.ordinal}版已保存；${busy ? '正在读取词条。' : '读取未完成，请重试读取。'}`),
        button('重新读取已保存版本', 'retry-read', () => void run(readCommitted)));
      root.replaceChildren(panel); return;
    }
    if (draft !== null) {
      panel.append(el('p', '编辑草稿；保存后成为新版本。打开、编辑和保存词表都不会开始检查。'));
      const list = el('ol');
      for (let index = draftOffset; index < Math.min(draft.length, draftOffset + HOUSE_PAGE_SIZE); index++) {
        const entry = draft[index]!; const row = el('li'); row.dataset['houseEntryRow'] = String(index + 1); row.value = index + 1;
        const literalLabel = el('label', '字面词条'); const literal = el('input'); literal.value = entry.literal; literal.disabled = busy;
        literal.dataset['houseField'] = 'literal'; literal.setAttribute('aria-label', `第${index + 1}行字面词条`);
        literal.addEventListener('input', () => { if (draft !== null) draft[index] = { ...draft[index]!, literal: literal.value }; }); literalLabel.append(literal);
        const noteLabel = el('label', '词条说明（会随批注显示）'); const note = el('textarea'); note.value = entry.note; note.disabled = busy;
        note.dataset['houseField'] = 'note'; note.setAttribute('aria-label', `第${index + 1}行词条说明`);
        note.addEventListener('input', () => { if (draft !== null) draft[index] = { ...draft[index]!, note: note.value }; }); noteLabel.append(note);
        const enabledLabel = el('label', '启用'); const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = entry.enabled; enabled.disabled = busy;
        enabled.dataset['houseField'] = 'enabled'; enabled.setAttribute('aria-label', `第${index + 1}行启用`);
        enabled.addEventListener('change', () => { if (draft !== null) draft[index] = { ...draft[index]!, enabled: enabled.checked }; }); enabledLabel.append(enabled);
        row.append(literalLabel, noteLabel, enabledLabel, button('移除词条', `remove-${index}`, () => {
          draft?.splice(index, 1); if (draftOffset >= (draft?.length ?? 0)) draftOffset = Math.max(0, draftOffset - HOUSE_PAGE_SIZE); paint();
        })); list.append(row);
      }
      panel.append(list, el('p', `共${draft.length}条；每页最多50条。`),
        button('上一页词条', 'draft-previous', () => { draftOffset -= HOUSE_PAGE_SIZE; paint(); }, draftOffset === 0),
        button('下一页词条', 'draft-next', () => { draftOffset += HOUSE_PAGE_SIZE; paint(); }, draftOffset + HOUSE_PAGE_SIZE >= draft.length),
        button('添加词条', 'add', () => { draft?.push({ entryId: null, literal: '', note: '', enabled: true }); draftOffset = Math.floor(((draft?.length ?? 1) - 1) / HOUSE_PAGE_SIZE) * HOUSE_PAGE_SIZE; paint(); }, draft.length >= MAX_HOUSE_ENTRIES));
      const pasteLabel = el('label', '粘贴词条（一行一条，空行忽略）'); const paste = el('textarea'); paste.value = pastedText; paste.disabled = busy; paste.dataset['houseField'] = 'paste';
      paste.addEventListener('input', () => { pastedText = paste.value; preview = null; }); pasteLabel.append(paste);
      panel.append(pasteLabel, button('预览粘贴', 'preview-paste', () => { preview = previewHousePaste(pastedText); paint(); }));
      if (preview !== null) {
        const result = el('div'); result.dataset['housePastePreview'] = 'true';
        result.append(el('p', `预览${preview.entries.length}条；尚未加入草稿或保存。`));
        for (const error of preview.errors) result.append(el('p', error.message));
        const literals = el('ul'); for (const entry of preview.entries.slice(0, HOUSE_PAGE_SIZE)) literals.append(el('li', entry.literal)); result.append(literals);
        result.append(button('加入草稿', 'accept-paste', () => {
          if (draft === null || preview === null || preview.errors.length > 0) return;
          try {
            const combined = [...draft, ...preview.entries]; validateSaveHouseWordListInput({ expectedCurrent, sourceKind: 'editor-paste', entries: combined });
            draft = combined; sourceKind = 'editor-paste'; preview = null; pastedText = ''; paint();
          } catch (error) { setStatus(error instanceof HouseWordListError ? error.message : '粘贴未完成。', 'error'); }
        }, preview.errors.length > 0 || preview.entries.length === 0)); panel.append(result);
      }
      panel.append(button('保存词表版本', 'save', () => void save()), button('放弃草稿并重新载入', 'discard', () => void run(async () => {
        await inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }); draft = null; preview = null;
      })));
    } else {
      const selected = page?.selected;
      panel.append(el('p', selected === undefined || selected === null ? '尚未保存词表；AI7不提供预置词条。' : `第${selected.ordinal}版 · ${selected.entryCount}条 · 启用${selected.enabledCount}条`));
      if (selected !== undefined && selected !== null) {
        const entries = el('ol');
        for (let index = 0; index < (page?.entries.length ?? 0); index++) {
          const entry = page!.entries[index]!; const row = el('li'); row.value = request.entryOffset + index + 1;
          row.append(el('span', `${entry.literal} · ${entry.enabled ? '启用' : '停用'}`), el('p', `词条说明：${entry.note || '（无）'}`)); entries.append(row);
        }
        panel.append(entries, button('上一页词条', 'entries-previous', () => void run(() => inspect({ ...request, entryOffset: Math.max(0, request.entryOffset - HOUSE_PAGE_SIZE) })), request.entryOffset === 0),
          button('下一页词条', 'entries-next', () => void run(() => inspect({ ...request, entryOffset: page!.nextEntryOffset! })), page?.nextEntryOffset === null));
        const details = el('details'); details.append(el('summary', '版本技术详情'), el('p', `词表 ${selected.pin.listId} · 版本 ${selected.pin.versionId} · 摘要 ${selected.pin.digest}`)); panel.append(details);
      }
      panel.append(button(page?.current === null ? '创建词表' : '编辑当前版本', 'edit', () => void beginDraft()));
      const history = el('details'); history.append(el('summary', '版本历史（只读）'));
      for (const version of page?.history ?? []) history.append(button(`查看第${version.ordinal}版`, `history-${version.ordinal}`, () => void run(() => inspect({ ...request, versionId: version.pin.versionId, entryOffset: 0 }))));
      history.append(button('最新历史', 'history-first', () => void run(() => inspect({ ...request, historyOffset: 0 })), request.historyOffset === 0),
        button('更早历史', 'history-next', () => void run(() => inspect({ ...request, historyOffset: page!.nextHistoryOffset! })), page?.nextHistoryOffset === null || page === null)); panel.append(history);
      panel.append(button('查看当前版本', 'current', () => void run(() => inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }))));
    }
    root.replaceChildren(panel);
  };
  paint();
  return { load: () => run(() => committedRead === null ? inspect({ versionId: null, entryOffset: 0, historyOffset: 0 }) : readCommitted()), destroy: () => { destroyed = true; root.replaceChildren(); } };
}
