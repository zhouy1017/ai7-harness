import { createButton } from './components/controls.js';
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
    memory.removals.set(id, item === undefined ? `${label}已不在清单，已移除。`
      : !item.selectable ? `${label}已移除：${item.reason ?? '现在不能选'}`
        : `${label}已移除：最多参考 4 份资料，合计不超过 6,000 字。`);
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

/** The optional references of a review live in segment 2 of the full plan (#1320). */
export function reviewPlanReferences(options: {
  api: Pick<RendererApi, 'searchReferableMaterials'>; bookId: string; items: readonly WritingTaskMaterialProjection[];
  selected: ReadonlySet<string>; change(selected: Set<string>): void;
}): HTMLElement {
  const root = document.createElement('div'); root.className = 'task-reference-chips';
  root.dataset['reviewPlanReferences'] = '';
  const selected = new Set(taskMaterialSelection(options.items, options.selected));
  for (const item of options.items.filter((item) => selected.has(item.materialId))) {
    const chip = createButton(); chip.classList.add('small'); chip.textContent = `${item.title} ×`;
    chip.setAttribute('aria-label', `移除参考《${item.title}》`);
    chip.addEventListener('click', () => { const next = new Set(selected); next.delete(item.materialId); options.change(next); });
    root.append(chip);
  }
  const add = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = '+ 添加参考…'; add.append(summary);
  for (const item of options.items) {
    const row = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox';
    input.dataset['reviewMaterial'] = item.materialId; input.checked = selected.has(item.materialId);
    const reason = taskMaterialSelectionReason(item, options.items, selected);
    input.disabled = reason !== null; row.title = reason ?? '';
    input.addEventListener('change', () => { const next = new Set(selected); if (input.checked) next.add(item.materialId); else next.delete(item.materialId); options.change(next); });
    row.append(input, document.createTextNode(item.title)); add.append(row);
  }
  add.append(similarMaterialsField(options.api, options.bookId, options.items, selected, (id) => options.change(new Set([...selected, id]))));
  root.append(add);
  return root;
}

/** Read the current Book-owned plan input; editing references prepares a new plan, never authorizes it. */
export function reviewPlanReferenceField(options: {
  api: Pick<RendererApi, 'inspectReviewWorkspace' | 'prepareReviewRun' | 'searchReferableMaterials' | 'inspectBookSeries'>;
  bookId: string; reviewRunId: string;
  awaitJob: (job: Awaited<ReturnType<RendererApi['prepareReviewRun']>>) => Promise<import('../shared/protocol.js').ServiceWireJobProjection>;
  change(operation: () => Promise<string>): void;
}): HTMLElement {
  const host = document.createElement('div');
  void options.api.inspectReviewWorkspace({ reviewRunId: options.reviewRunId }).then(async (workspace) => {
    if (!host.isConnected) return;
    const input = workspace.run?.referenceInput;
    if (!input || !workspace.categories.some((entry) => input.categoryIds.includes(entry.categoryId) && entry.materialReferencesAllowed)) return;
    const selected = new Set(taskMaterialSelection(workspace.materials?.items ?? [], new Set(input.materialIds ?? [])));
    const update = (next: ReadonlySet<string>, seriesId = input.seriesId ?? null): void => options.change(async () => {
      const job = await options.api.prepareReviewRun({ ...input, materialIds: taskMaterialSelection(workspace.materials?.items ?? [], next), seriesId });
      const completed = await options.awaitJob(job);
      const result = completed.result;
      if (completed.kind !== 'review-run-preparation' || completed.state !== 'completed' || !result || !('scopeOptions' in result) || !result.run) throw new Error('未能更新参考资料。');
      return result.run.reviewRunId;
    });
    host.append(reviewPlanReferences({ api: options.api, bookId: options.bookId, items: workspace.materials?.items ?? [], selected, change: update }));
    if (input.capturedProcedure != null) return;
    const page = await options.api.inspectBookSeries({ bookId: options.bookId, membershipsAfter: null });
    if (!host.isConnected || page.memberships.length === 0) return;
    const row = document.createElement('label'); const select = document.createElement('select');
    select.dataset['reviewField'] = 'series-scope'; select.append(new Option('仅本书，不参考书系知识', ''));
    for (const series of page.memberships) select.append(new Option(`书系《${series.title}》`, series.seriesId));
    select.value = input.seriesId ?? '';
    select.addEventListener('change', () => update(selected, select.value || null));
    row.append(document.createTextNode('允许参考 '), select); host.append(row);
  }).catch(() => { if (host.isConnected) host.textContent = '参考资料读取失败，请重新打开计划。'; });
  return host;
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
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  label.append(status, input);
  const selection = window.getSelection()?.toString() ?? '';
  const useSelection = createButton();
  useSelection.type = 'button'; useSelection.textContent = '使用当前选中文字';
  useSelection.addEventListener('click', () => { input.value = (window.getSelection()?.toString() || selection).slice(0, 1_000); });
  const search = createButton();
  search.type = 'button'; search.textContent = '检索相似段落';
  const results = document.createElement('ul');
  search.addEventListener('click', () => {
    if (search.disabled || input.value.trim().length === 0) return;
    search.disabled = true; status.textContent = ' · 正在本机检索…'; results.replaceChildren();
    void api.searchReferableMaterials({ bookId, query: input.value, k: 8 }).then((page) => {
      if (!root.isConnected) return;
      status.textContent = page.candidates.length === 0 ? ' · 没有找到相似段落。' : ' · 以下是检索候选，预览只供选择参考资料。';
      for (const candidate of page.candidates) {
        const item = items.find((offer) => offer.materialId === candidate.sourceId);
        const row = document.createElement('li');
        const choice = createButton();
        choice.type = 'button';
        choice.textContent = `${item?.title ?? '资料'} · 第 ${candidate.anchor.segmentOrdinal ?? 1} 段 · ${candidate.anchor.start}–${candidate.anchor.end}`;
        choice.disabled = item === undefined || selected.has(candidate.sourceId) || taskMaterialSelectionReason(item, items, selected) !== null;
        choice.addEventListener('click', () => {
          if (choice.disabled || item === undefined) return;
          const reason = taskMaterialSelectionReason(item, items, selected);
          if (reason !== null) { status.textContent = ` · ${reason}`; choice.disabled = true; return; }
          choice.disabled = true;
          if (!selected.has(candidate.sourceId)) choose(candidate.sourceId);
        });
        const preview = document.createElement('p'); preview.textContent = candidate.preview;
        row.append(choice, preview); results.append(row);
      }
    }).catch(() => { status.textContent = ' · 这次检索没有完成，请稍后重试。'; }).finally(() => { search.disabled = false; });
  });
  root.append(label, useSelection, search, results);
  return root;
}
