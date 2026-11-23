import type { StandardStrength, StandardTablePreview, StandardTableRendererApi, StandardTableInspection } from '../shared/protocol/standard-tables.js';
import type { TableWork } from './standard-table-detail.js';
import { TableDraft, countsLabel, metadataFields, renderTableRows, rowSummary, tableActions, tableButton, tableNode, tablePager } from './standard-table-editor.js';

/** A single form owns the metadata and sparse row edits across bounded preview pages. */
export function mountStandardTableImport(root: HTMLElement, initial: StandardTablePreview | null, api: StandardTableRendererApi,
  run: TableWork, saved: (inspection: StandardTableInspection) => void, cancel: () => void): void {
  let preview = initial;
  const metadata = { name: initial?.name ?? '', kind: initial?.kind ?? 'word-forms' as const,
    versionLabel: initial?.versionLabel ?? '1', sourceDescription: initial?.sourceDescription ?? '本社自建' };
  const draft = new TableDraft();
  let strength: StandardStrength = initial?.proposedStrength ?? 'house';
  const paint = (): void => {
    root.replaceChildren();
    root.dataset[preview ? 'standardTablePreview' : 'standardTableCreate'] = '';
    root.append(tableNode('h3', preview ? `${preview.tableId ? '导入新版本' : '导入预览'} · ${preview.sourceFileName}` : '新建字表或词表'));
    const entries = tableNode('div', undefined, 'standard-table-entries');
    const paintRows = (): void => renderTableRows(entries, preview?.entries ?? [], draft);
    metadataFields(root, metadata, strength, value => { strength = value; draft.setStrength(value); paintRows(); }, preview?.tableId != null);
    if (preview) {
      root.append(tableNode('p', countsLabel(preview.conversionReport.counts)));
      for (const part of preview.conversionReport.parts) if (part.reason) root.append(tableNode('p', `第 ${part.part} 部分：${part.reason}`, 'attention-note'));
      if (preview.diff) {
        const diff = preview.diff; const changes = tableNode('details'); changes.dataset['standardTableDiff'] = ''; changes.open = true;
        changes.append(tableNode('summary', `新增 ${diff.counts.added} · 删除 ${diff.counts.removed} · 修改 ${diff.counts.changed}`));
        for (const row of diff.added) changes.append(tableNode('p', `新增：${rowSummary(row)}`));
        for (const row of diff.removed) changes.append(tableNode('p', `删除：${rowSummary(row)}`));
        for (const row of diff.changed) changes.append(tableNode('p', `修改：${rowSummary(row.before)} → ${rowSummary(row.after)}`));
        root.append(changes);
      }
    }
    paintRows(); root.append(entries);
    if (preview) {
      // Diff and conversion-report pages share the preview's offset, including removed-only updates.
      const total = Math.max(preview.total, preview.conversionReport.partsTotal ?? 0, ...Object.values(preview.diff?.counts ?? {}));
      root.append(tablePager(preview.offset, total, offset => run(async () => {
        const next = await api.previewStandardTableImport({ previewId: preview!.previewId, offset });
        if (next && root.isConnected) { preview = next; paint(); }
      })));
    }
    root.append(tableActions(tableButton('添加词条', 'add-row', () => {
      const position = draft.add(); paintRows(); entries.querySelector<HTMLInputElement>(`[data-standard-table-row="${position}"] input`)?.focus();
    }),
      tableButton(preview ? preview.tableId ? '确认导入新版本' : '确认导入' : '保存字表或词表', preview ? 'commit-import' : 'save-create', () => run(async () => {
        if (!metadata.name.trim()) { root.querySelector<HTMLInputElement>('[data-standard-table-field="name"]')?.focus(); throw new Error('请填写字表或词表名称。'); }
        const input = { ...metadata, ...(draft.strength === undefined ? {} : { strength: draft.strength }), edits: draft.input() };
        const result = preview ? await api.commitStandardTableImport({ ...input, previewId: preview.previewId }) : await api.saveStandardTable(input);
        if (root.isConnected) saved(result);
      })), tableButton('取消', 'cancel-preview', cancel)));
  };
  paint();
}
