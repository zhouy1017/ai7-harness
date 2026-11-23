import type { StandardTableInspection, StandardTableItem, StandardTableRendererApi, StandardTablesProjection } from '../shared/protocol/standard-tables.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { mountStandardTableDetail, type TableWork } from './standard-table-detail.js';
import { mountStandardTableImport } from './standard-table-import.js';
import { TABLE_KINDS, countsLabel, tableActions, tableButton, tableNode } from './standard-table-editor.js';

/** ADR 0106 §4–§5: a table's source, rows and versions share one knowledge-base item. */
export function mountStandardTables(options: {
  root: HTMLElement; api: StandardTableRendererApi;
  setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  errorMessage: (error: unknown, fallback: string) => string;
}): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('standard-tables');
  const toolbar = tableNode('div', undefined, 'button-row'), creation = tableNode('div'), list = tableNode('div', undefined, 'standard-table-list');
  root.append(toolbar, creation, list);
  let projection: StandardTablesProjection = { tables: [], missingPreinstalledKeys: [] }, busy = false;
  let form: HTMLElement | null = null;
  const cards = new Map<string, { card: HTMLElement; header: HTMLElement; detail: HTMLElement; preview: HTMLElement }>();
  const run: TableWork = work => { void (async () => {
    if (busy || !root.isConnected) return;
    busy = true; root.setAttribute('aria-busy', 'true');
    const controls = Array.from(root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button, input, select, textarea'))
      .map(node => ({ node, disabled: node.disabled }));
    for (const { node } of controls) node.disabled = true;
    try { await work(); }
    catch (error) { if (root.isConnected) setStatus(errorMessage(error, '无法完成字表操作。'), 'error'); }
    finally {
      busy = false; root.removeAttribute('aria-busy');
      for (const { node, disabled } of controls) node.disabled = disabled;
    }
  })(); };
  const cancel = (): void => { form?.replaceChildren(); form?.removeAttribute('data-standard-table-preview'); form?.removeAttribute('data-standard-table-create'); form = null; };
  const saved = (inspection: StandardTableInspection): void => {
    const exists = projection.tables.some(table => table.tableId === inspection.table.tableId);
    projection.tables = exists ? projection.tables.map(table => table.tableId === inspection.table.tableId ? inspection.table : table)
      : [inspection.table, ...projection.tables];
    paint();
    mountStandardTableDetail(cards.get(inspection.table.tableId)!.detail, inspection, api, run, saved);
    setStatus('字表与词表已保存为新版本。', 'success');
  };
  const begin = async (table?: StandardTableItem, create = false): Promise<void> => {
    if (form?.isConnected && form.childElementCount > 0) throw new Error('请先完成或取消当前字表的编辑。');
    const preview = create ? null : await api.previewStandardTableImport(table ? { tableId: table.tableId } : {});
    if (!root.isConnected || (!create && preview === null)) return;
    form = table ? cards.get(table.tableId)!.preview : creation;
    mountStandardTableImport(form, preview, api, run, inspection => { cancel(); saved(inspection); }, cancel);
    form.querySelector<HTMLInputElement>('[data-standard-table-field="name"]')?.focus();
  };
  const paint = (): void => {
    toolbar.replaceChildren(tableButton('导入字表或词表', 'import', () => run(() => begin())),
      tableButton('新建字表或词表', 'create', () => run(() => begin(undefined, true))));
    if (projection.missingPreinstalledKeys.length) toolbar.append(tableButton('恢复预装字表', 'restore-preinstalled', () => run(async () => {
      const next = await api.restorePreinstalledStandardTables({});
      if (!root.isConnected) return;
      projection = next; paint(); setStatus('已恢复预装字表。', 'success');
    })));
    for (const [id, nodes] of cards) if (!projection.tables.some(table => table.tableId === id)) { nodes.card.remove(); cards.delete(id); }
    const items: HTMLElement[] = [];
    for (const table of projection.tables) {
      let nodes = cards.get(table.tableId);
      if (!nodes) {
        nodes = { card: tableNode('article', undefined, 'guideline-card'), header: tableNode('div'), detail: tableNode('div'), preview: tableNode('div') };
        nodes.card.dataset['standardTableId'] = table.tableId; nodes.card.append(nodes.header, nodes.preview, nodes.detail); cards.set(table.tableId, nodes);
      }
      const detail = nodes.detail;
      nodes.header.replaceChildren(tableNode('h3', table.name),
        tableNode('p', `${table.sourceFileName ?? '本社自建'} · ${TABLE_KINDS[table.kind]} · ${table.versionLabel} · ${localInstantLabel(table.recordedAt)}`, 'field-note'),
        tableNode('p', countsLabel(table.counts)),
        tableNode('p', `${table.enabled ? '启用' : '停用'} · ${table.recentChecksCount === 0 ? '近期核查未用过' : `最近 ${table.recentChecksCount} 次核查用过`}`),
        tableActions(tableButton('查看条目', 'inspect', () => run(async () => {
          if (detail.childElementCount) { detail.querySelector<HTMLInputElement>('[data-standard-table-field="query"]')?.focus(); return; }
          const inspection = await api.inspectStandardTable({ tableId: table.tableId });
          if (detail.isConnected) mountStandardTableDetail(detail, inspection, api, run, saved);
        })), tableButton('导入新版本', 'import-version', () => run(() => begin(table))),
        tableButton(table.enabled ? '停用' : '启用', 'toggle-enabled', () => run(async () => {
          const next = await api.setStandardTableEnabled({ tableId: table.tableId, enabled: !table.enabled });
          if (!root.isConnected) return;
          projection = next; paint(); setStatus(table.enabled ? '已停用字表。' : '已启用字表。', 'success');
        })), tableButton('删除', 'delete', () => run(async () => {
          const next = await api.deleteStandardTable({ tableId: table.tableId });
          if (!root.isConnected) return;
          projection = next; paint(); setStatus('已删除字表及其原件。', 'success');
        }))));
      items.push(nodes.card);
    }
    list.replaceChildren(...items);
    if (!items.length) list.append(tableNode('p', '尚未添加字表或词表。可导入文件、新建或恢复预装字表。', 'field-note'));
  };
  return { load: async () => { const next = await api.inspectStandardTables({}); if (root.isConnected) { projection = next; paint(); } } };
}
