import { MAX_WRITING_MATERIALS, MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES, type WritingTaskMaterialProjection } from '../shared/protocol.js';

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
