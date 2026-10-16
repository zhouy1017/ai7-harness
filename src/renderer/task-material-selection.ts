import { MAX_WRITING_MATERIALS, MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES, type WritingTaskMaterialProjection, type RendererApi } from '../shared/protocol.js';

/** Keep only still-offered choices, in offer order, within the same whole-item bounds the service enforces. */
export function taskMaterialSelection(items: ReadonlyArray<WritingTaskMaterialProjection>, selected: ReadonlySet<string>): string[] {
  const result: string[] = [];
  let total = 0;
  for (const item of items) {
    if (!item.selectable || !selected.has(item.materialId) || result.length >= MAX_WRITING_MATERIALS ||
        total + item.characters > MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES) continue;
    result.push(item.materialId);
    total += item.characters;
  }
  return result;
}

interface SelectionMemory {
  /** The names last offered, so a choice that has since left the offers can still be named. */
  readonly titles: Map<string, string>;
  /** Choices taken out of the selection and not yet acknowledged, by identity, each with its words. */
  readonly removals: Map<string, string>;
}
const selectionMemories = new WeakMap<object, SelectionMemory>();

function selectionMemory(owner: object): SelectionMemory {
  let memory = selectionMemories.get(owner);
  if (memory === undefined) { memory = { titles: new Map(), removals: new Map() }; selectionMemories.set(owner, memory); }
  return memory;
}

/**
 * Bring a selection up to the offers now (Issue #759): keep the still-offered choices in offer order — the same order whichever
 * was ticked first — and for each choice taken out say which and why: no longer offered, not selectable (the offer's own reason),
 * or beyond the whole-item bounds. `owner` is the surface's state; the words stay until `acknowledgeTaskMaterialRemovals`.
 * Returns the kept identities and every removal not yet acknowledged.
 */
export function reconcileTaskMaterialSelection(owner: object, items: ReadonlyArray<WritingTaskMaterialProjection>, selected: ReadonlySet<string>): { kept: string[]; removals: string[] } {
  const memory = selectionMemory(owner);
  const kept = taskMaterialSelection(items, selected);
  const keptIds = new Set(kept);
  for (const id of selected) {
    if (keptIds.has(id)) continue;
    const item = items.find((entry) => entry.materialId === id);
    const name = item?.title ?? memory.titles.get(id);
    const label = name === undefined ? '已选的一份资料' : `《${name}》`;
    memory.removals.set(id, item === undefined ? `${label}已不在可参考的清单中，已从所选中去掉。`
      : !item.selectable ? `${label}已从所选中去掉：${item.reason ?? '现在不能选'}`
        : `${label}已从所选中去掉：最多参考 4 份资料，合计不超过 6,000 字。`);
  }
  for (const id of keptIds) memory.removals.delete(id);
  for (const item of items) memory.titles.set(item.materialId, item.title);
  return { kept, removals: [...memory.removals.values()] };
}

/** The editor has seen the removals (they changed the ticks themselves): stop repeating them. */
export function acknowledgeTaskMaterialRemovals(owner: object): void {
  selectionMemories.get(owner)?.removals.clear();
}

/** What an offered item states of its size: the extracted characters, or none known when its damaged index record gives none. */
export function taskMaterialSizeText(item: Pick<WritingTaskMaterialProjection, 'characters'>): string {
  return item.characters > 0 ? `已提取 ${item.characters.toLocaleString('en-US')} 字` : '字数未知';
}

/** Name only current bounded choices; plans never display extracted reference text. */
export function taskMaterialSendLine(items: ReadonlyArray<WritingTaskMaterialProjection>, selected: ReadonlySet<string>): string | null {
  const ids = new Set(taskMaterialSelection(items, selected));
  if (ids.size === 0) return null;
  const names = items.filter((item) => ids.has(item.materialId)).map((item) => `《${item.title}》`).join('、');
  return `会发送：所选资料库资料${names}的提取文字随稿件一并发往，只参照，不照抄；本机确定性运行不发送任何内容。`;
}

export function taskMaterialSelectionReason(item: WritingTaskMaterialProjection, items: ReadonlyArray<WritingTaskMaterialProjection>, selected: ReadonlySet<string>): string | null {
  if (!item.selectable) return item.reason;
  if (selected.has(item.materialId)) return null;
  const chosen = items.filter((entry) => selected.has(entry.materialId));
  if (chosen.length >= MAX_WRITING_MATERIALS) return '最多参考 4 份资料；可以先去掉一份。';
  if (chosen.reduce((total, entry) => total + entry.characters, 0) + item.characters > MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES) {
    return '参考资料合计不能超过 6,000 字；可以先去掉一份。';
  }
  return null;
}

/** Local discovery leaves every choice to the editor and uses the fieldset's existing reference bounds. */
export function similarMaterialsField(api: Pick<RendererApi, 'searchReferableMaterials'>, bookId: string,
  items: readonly WritingTaskMaterialProjection[], selected: ReadonlySet<string>, choose: (materialId: string) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'similar-materials';
  const label = document.createElement('label');
  label.textContent = '相似段落检索';
  const input = document.createElement('textarea');
  input.maxLength = 1_000;
  input.rows = 2;
  input.setAttribute('aria-label', '相似段落检索');
  label.append(input);
  const selection = window.getSelection()?.toString() ?? '';
  const useSelection = document.createElement('button');
  useSelection.type = 'button'; useSelection.textContent = '使用当前选中文字';
  useSelection.addEventListener('click', () => { input.value = (window.getSelection()?.toString() || selection).slice(0, 1_000); });
  const search = document.createElement('button');
  search.type = 'button'; search.textContent = '检索相似段落';
  const status = document.createElement('p'); status.className = 'field-note'; status.setAttribute('role', 'status');
  const results = document.createElement('ul');
  search.addEventListener('click', () => {
    if (search.disabled || input.value.trim().length === 0) return;
    search.disabled = true; status.textContent = '正在本机检索…'; results.replaceChildren();
    void api.searchReferableMaterials({ bookId, query: input.value, k: 8 }).then((page) => {
      if (!root.isConnected) return;
      status.textContent = page.candidates.length === 0 ? '没有找到相似段落。' : '以下是检索候选，预览只供选择参考资料。';
      for (const candidate of page.candidates) {
        const item = items.find((offer) => offer.materialId === candidate.sourceId);
        const row = document.createElement('li');
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.textContent = `${item?.title ?? '资料'} · 第 ${candidate.anchor.segmentOrdinal ?? 1} 段 · ${candidate.anchor.start}–${candidate.anchor.end}`;
        choice.disabled = item === undefined || selected.has(candidate.sourceId) || taskMaterialSelectionReason(item, items, selected) !== null;
        choice.addEventListener('click', () => {
          if (choice.disabled || item === undefined) return;
          const reason = taskMaterialSelectionReason(item, items, selected);
          if (reason !== null) { status.textContent = reason; choice.disabled = true; return; }
          choice.disabled = true;
          if (!selected.has(candidate.sourceId)) choose(candidate.sourceId);
        });
        const preview = document.createElement('p'); preview.textContent = candidate.preview;
        row.append(choice, preview); results.append(row);
      }
    }).catch(() => { status.textContent = '这次检索没有完成，请稍后重试。'; }).finally(() => { search.disabled = false; });
  });
  root.append(label, useSelection, search, status, results);
  return root;
}
