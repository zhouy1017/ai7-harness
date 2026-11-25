import type { StandardEntryStatus, StandardStrength, StandardTableCounts, StandardTableKind, StandardTableRow } from '../shared/protocol/standard-tables.js';
import { createButton, styleInput } from './components/controls.js';

export const TABLE_PAGE_SIZE = 200;
export const TABLE_KINDS: Record<StandardTableKind, string> = {
  'standard-characters': '规范字', 'character-forms': '字形对照', 'word-forms': '词形', 'common-words': '常用词',
};
export const TABLE_STRENGTHS: Record<StandardStrength, string> = {
  national: '国家规范（应改）', dictionary: '辞书推荐（建议改）', house: '本社要求（按本社体例改）',
};
const STATUSES: Record<StandardEntryStatus, string> = { applied: '已识别', 'to-confirm': '待确认', unrecognized: '未识别' };
export const countsLabel = (counts: StandardTableCounts): string => `已识别 ${counts.applied} · 待确认 ${counts.toConfirm} · 未识别 ${counts.unrecognized}`;
export function tableNode<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}
export function tableButton(label: string, action: string, run: () => void, disabled = false): HTMLButtonElement {
  const node = createButton(); node.textContent = label; node.classList.add('secondary');
  node.dataset['standardTableAction'] = action; node.disabled = disabled;
  node.addEventListener('click', run); return node;
}
export function tableActions(...nodes: HTMLElement[]): HTMLElement {
  const row = tableNode('div', undefined, 'button-row'); row.append(...nodes); return row;
}
export function tableField(parent: HTMLElement, name: string, label: string, value: string, change: (value: string) => void, maxLength = 8192): HTMLInputElement {
  const wrapper = tableNode('label', label, 'standard-table-field');
  const input = styleInput(tableNode('input')); input.value = value; input.maxLength = maxLength;
  input.dataset['standardTableField'] = name;
  input.addEventListener('input', () => change(input.value)); wrapper.append(input); parent.append(wrapper); return input;
}
export function tableSelect<T extends string>(parent: HTMLElement, name: string, label: string, value: T, choices: Record<T, string>, change: (value: T) => void): HTMLSelectElement {
  const wrapper = tableNode('label', label, 'standard-table-field'); const select = tableNode('select');
  select.dataset['standardTableField'] = name;
  for (const [key, text] of Object.entries<string>(choices)) { const option = tableNode('option', text); option.value = key; select.append(option); }
  select.value = value; select.addEventListener('change', () => change(select.value as T));
  wrapper.append(select); parent.append(wrapper); return select;
}
export interface TableMetadata { name: string; kind: StandardTableKind; versionLabel: string; sourceDescription: string }
export function metadataFields(parent: HTMLElement, metadata: TableMetadata, strength: StandardStrength, changeStrength: (value: StandardStrength) => void, existing = false): void {
  const fields = tableNode('div', undefined, 'standard-table-fields');
  tableField(fields, 'name', '名称', metadata.name, value => { metadata.name = value; }, 180).required = true;
  tableSelect(fields, 'kind', '种类', metadata.kind, TABLE_KINDS, value => { metadata.kind = value; }).disabled = existing;
  tableField(fields, 'versionLabel', '版本', metadata.versionLabel, value => { metadata.versionLabel = value; }, 180);
  tableField(fields, 'sourceDescription', '来源说明', metadata.sourceDescription, value => { metadata.sourceDescription = value; });
  tableSelect(fields, 'strength', '整表强度', strength, TABLE_STRENGTHS, changeStrength);
  parent.append(fields);
}

/** Positions belong to the inspected version, never the filtered page's row number. */
export class TableDraft {
  readonly edits = new Map<number, StandardTableRow | null>();
  strength: StandardStrength | undefined;
  private next = -1;
  row(position: number, original: StandardTableRow): StandardTableRow | null {
    if (this.edits.has(position)) return this.edits.get(position)!;
    const { recommended, discouraged, rank, condition, source, strength, status, reviewNote, sourceText } = original;
    return { recommended, discouraged: [...discouraged], rank, condition, source, strength: this.strength ?? strength, status, reviewNote, sourceText };
  }
  setStrength(strength: StandardStrength): void {
    this.strength = strength;
    for (const [position, row] of this.edits) if (row) this.edits.set(position, { ...row, strength });
  }
  add(): number {
    const position = this.next--;
    this.edits.set(position, { recommended: '', discouraged: [], rank: null, condition: null, source: null,
      strength: this.strength ?? 'house', status: 'applied', reviewNote: null, sourceText: null });
    return position;
  }
  remove(position: number): void { if (position < 0) this.edits.delete(position); else this.edits.set(position, null); }
  input(): { position: number | null; row: StandardTableRow | null }[] {
    return [...this.edits].map(([position, row]) => ({ position: position < 0 ? null : position, row }));
  }
}

export function rowSummary(row: StandardTableRow): string {
  return [row.recommended || '未识别条目', row.discouraged.length ? `不推荐：${row.discouraged.join('、')}` : '',
    row.rank === null ? '' : `第 ${row.rank} 位`, TABLE_STRENGTHS[row.strength], STATUSES[row.status],
    row.source ? `出处：${row.source}` : '', row.condition ? `条件：${row.condition}` : '', row.reviewNote ?? ''].filter(Boolean).join(' · ');
}

export function renderTableRows(root: HTMLElement, entries: (StandardTableRow & { position: number })[], draft: TableDraft | null): void {
  root.replaceChildren();
  const renderRow = (position: number, original: StandardTableRow): HTMLElement => {
    const row = draft?.row(position, original) ?? original;
    const item = tableNode('article', undefined, 'standard-table-entry'); item.dataset['standardTableRow'] = String(position);
    const summary = tableNode('p', rowSummary(row)); item.append(summary);
    if (row.sourceText) item.append(tableNode('p', `原文：${row.sourceText}`, 'field-note'));
    if (!draft) return item;
    const update = (patch: Partial<StandardTableRow>): void => {
      Object.assign(row, patch); draft.edits.set(position, row); summary.textContent = rowSummary(row);
    };
    const editor = tableNode('details'); editor.open = position < 0;
    editor.append(tableNode('summary', '编辑此行'));
    const fields = tableNode('div', undefined, 'standard-table-fields');
    tableField(fields, 'recommended', '推荐写法', row.recommended, value => update({ recommended: value }), 4096);
    tableField(fields, 'discouraged', '不推荐写法（用顿号分隔）', row.discouraged.join('、'), value => update({ discouraged: value.split(/[、\n]/u).map(v => v.trim()).filter(Boolean) }));
    tableField(fields, 'condition', '适用条件', row.condition ?? '', value => update({ condition: value || null }));
    tableField(fields, 'source', '出处', row.source ?? '', value => update({ source: value || null }));
    tableSelect(fields, 'strength', '强度', row.strength, TABLE_STRENGTHS, value => update({ strength: value }));
    const status = tableSelect(fields, 'status', '识别状态', row.status, STATUSES, value => update({ status: value }));
    editor.append(fields); item.append(editor);
    const actions = tableActions(tableButton('删除此行', 'remove-row', () => { draft.remove(position); item.remove(); }));
    if (row.status === 'to-confirm') actions.prepend(tableButton('确认此行', 'confirm-row', () => {
      update({ status: 'applied' }); status.value = 'applied'; actions.querySelector('[data-standard-table-action="confirm-row"]')?.remove();
    }));
    item.append(actions); return item;
  };
  for (const row of entries) {
    if (draft?.edits.get(row.position) === null) continue;
    root.append(renderRow(row.position, row));
  }
  if (draft) for (const [position, row] of draft.edits) if (position < 0 && row) root.append(renderRow(position, row));
  if (!root.childElementCount) root.append(tableNode('p', '没有符合条件的条目。', 'field-note'));
}

export function tablePager(offset: number, total: number, read: (offset: number) => void, step = TABLE_PAGE_SIZE): HTMLElement {
  return tableActions(tableButton('上一页', 'previous', () => read(Math.max(0, offset - step)), offset === 0),
    tableNode('span', total === 0 ? '共 0 条' : `${offset + 1}–${Math.min(total, offset + step)} / ${total}`),
    tableButton('下一页', 'next', () => read(offset + step), offset + step >= total));
}
