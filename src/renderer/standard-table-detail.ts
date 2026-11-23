import type { StandardTableInspection, StandardTableRendererApi } from '../shared/protocol/standard-tables.js';
import { TableDraft, renderTableRows, tableActions, tableButton, tableField, tableNode, tablePager, tableSelect } from './standard-table-editor.js';

export type TableWork = (work: () => Promise<void>) => void;

/** The draft stays tied to the current version while search, pages and older versions change. */
export function mountStandardTableDetail(root: HTMLElement, initial: StandardTableInspection, api: StandardTableRendererApi,
  run: TableWork, saved: (inspection: StandardTableInspection) => void): void {
  let inspection = initial, query = '', versionsOffset = 0;
  const draft = new TableDraft();
  let source: StandardTableInspection['sourceContent'] = null;
  const read = async (versionId = inspection.selected.versionId, offset = 0, sourceOffset?: number): Promise<void> => {
    const next = await api.inspectStandardTable({ tableId: inspection.table.tableId, versionId, query, offset, versionsOffset,
      ...(sourceOffset === undefined ? {} : { sourceOffset }) });
    if (!root.isConnected) return;
    if (next.selected.versionId !== inspection.selected.versionId) source = null;
    if (sourceOffset !== undefined) source = next.sourceContent;
    inspection = next; paint();
  };
  const paint = (): void => {
    root.replaceChildren(); root.dataset['standardTableDetail'] = inspection.selected.versionId;
    const current = inspection.selected.versionId === inspection.table.currentVersionId;
    const controls = tableNode('div', undefined, 'standard-table-fields');
    if (inspection.versionsTotal > 1) {
      const choices = Object.fromEntries([inspection.selected, ...inspection.versions].map(version =>
        [version.versionId, `${version.versionLabel} · 第 ${version.ordinal} 版`]));
      tableSelect(controls, 'version', '查看版本', inspection.selected.versionId, choices, version => run(() => read(version)));
      if (inspection.versionsTotal > 50) {
        const pager = tablePager(versionsOffset, inspection.versionsTotal, offset => run(async () => { versionsOffset = offset; await read(); }), 50);
        pager.dataset['standardTableVersions'] = ''; controls.append(pager);
      }
    }
    tableField(controls, 'query', '查询条目', query, value => { query = value; }, 200);
    const search = tableButton('查询', 'search', () => run(() => read())); controls.append(search);
    controls.querySelector<HTMLInputElement>('[data-standard-table-field="query"]')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); search.click(); }
    });
    root.append(controls, tableNode('p', inspection.selected.sourceDescription, 'field-note'));
    if (!current) root.append(tableNode('p', '此为早期版本，仅供查看。当前版本的未保存修改仍保留。', 'field-note'));
    const entries = tableNode('div', undefined, 'standard-table-entries'); entries.dataset['standardTableEntries'] = '';
    const paintRows = (): void => renderTableRows(entries, inspection.entries, current ? draft : null);
    paintRows(); root.append(entries, tablePager(inspection.offset, inspection.total, offset => run(() => read(inspection.selected.versionId, offset))));
    if (current) root.append(tableActions(
      tableButton('添加词条', 'add-row', () => {
        const position = draft.add(); paintRows(); entries.querySelector<HTMLInputElement>(`[data-standard-table-row="${position}"] input`)?.focus();
      }),
      tableButton('保存为新版本', 'save-version', () => run(async () => {
        const result = await api.saveStandardTable({ tableId: inspection.table.tableId, expectedVersionId: inspection.selected.versionId, edits: draft.input() });
        if (root.isConnected) saved(result);
      })),
    ));
    if (inspection.selected.sourceFileName || inspection.sourceContent) root.append(tableButton('查看原件', 'view-source', () => run(() => read(inspection.selected.versionId, inspection.offset, 0))));
    if (source) {
      const original = tableNode('section'); original.dataset['standardTableSource'] = '';
      original.append(tableNode('h4', source.fileName), tableNode('pre', source.text, 'standard-table-source-text'));
      if (source.total > 16000) original.append(tablePager(source.offset, source.total,
        offset => run(() => read(inspection.selected.versionId, inspection.offset, offset)), 16000));
      root.append(original);
    }
  };
  paint();
}
