import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountStandardTables } from '../../src/renderer/standard-tables.js';
import type { StandardTableInspection, StandardTablePreview, StandardTableRendererApi, StandardTableRow, StandardTablesProjection } from '../../src/shared/protocol/standard-tables.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());
const row: StandardTableRow = { recommended: '甲词', discouraged: ['乙词'], rank: 3, source: '合成表第 1 行', condition: '限标题',
  strength: 'national', status: 'to-confirm', reviewNote: '请核对写法', sourceText: '甲词、乙词' };
const version = { versionId: 'v2', ordinal: 2, versionLabel: '修订版', sourceDescription: '公开合成词表', digest: 'digest',
  sourceFileName: '词表.tsv', sourceObjectDigest: 'source', recordedAt: '2026-11-23T01:00:00Z', entryCount: 2 };
const table: StandardTablesProjection['tables'][number] = { ...version, tableId: 'table', name: '合成预装表', kind: 'word-forms',
  origin: 'preinstalled', preinstalledKey: 'gf-1001-2001', enabled: true, currentVersionId: 'v2', counts: { applied: 1, toConfirm: 1, unrecognized: 0 }, recentChecksCount: 3 };
const inspection: StandardTableInspection = { table, versions: [version, { ...version, versionId: 'v1', ordinal: 1, versionLabel: '初版' }], versionsTotal: 2,
  selected: version, entries: [{ ...row, position: 7 }], total: 1, offset: 0, conversionReport: null,
  sourceContent: { fileName: '词表.tsv', digest: 'source', byteLength: 10, text: '', offset: 0, total: 0 } };
const preview: StandardTablePreview = { previewId: 'preview', tableId: null, expectedVersionId: null, name: '合成表', kind: 'word-forms', versionLabel: '第三版',
  sourceDescription: '合成新表', proposedStrength: 'national', sourceFileName: '新表.tsv', entries: [{ ...row, position: 1 }], total: 1, offset: 0,
  conversionReport: { method: 'direct', model: null, counts: { applied: 0, toConfirm: 1, unrecognized: 0 }, parts: [] }, diff: null };
function makeApi() {
  return {
    inspectStandardTables: vi.fn<StandardTableRendererApi['inspectStandardTables']>(async () => ({ tables: [table], missingPreinstalledKeys: [] })),
    inspectStandardTable: vi.fn<StandardTableRendererApi['inspectStandardTable']>(async () => inspection),
    previewStandardTableImport: vi.fn<StandardTableRendererApi['previewStandardTableImport']>(async () => preview),
    commitStandardTableImport: vi.fn<StandardTableRendererApi['commitStandardTableImport']>(async () => inspection),
    saveStandardTable: vi.fn<StandardTableRendererApi['saveStandardTable']>(async () => inspection),
    setStandardTableEnabled: vi.fn<StandardTableRendererApi['setStandardTableEnabled']>(async ({ enabled }) => ({ tables: [{ ...table, enabled }], missingPreinstalledKeys: [] })),
    deleteStandardTable: vi.fn<StandardTableRendererApi['deleteStandardTable']>(async () => ({ tables: [], missingPreinstalledKeys: ['gf-1001-2001'] })),
    restorePreinstalledStandardTables: vi.fn<StandardTableRendererApi['restorePreinstalledStandardTables']>(async () => ({ tables: [table], missingPreinstalledKeys: [] })),
  };
}
async function setup(api = makeApi()) {
  const root = document.createElement('main'); miniDocument.body.append(root as unknown as MiniElement);
  const status = vi.fn(); await mountStandardTables({ root, api, setStatus: status, errorMessage: (error, fallback) => error instanceof Error ? error.message : fallback }).load();
  return { root, api, status };
}
async function click(root: HTMLElement, action: string) {
  const button = root.querySelector<HTMLButtonElement>(`[data-standard-table-action="${action}"]`)!;
  expect(button, action).not.toBeNull(); expect(button.disabled, action).toBe(false); button.click();
  for (let i = 0; i < 4; i++) await setImmediate();
}
function field(root: HTMLElement, name: string, value: string, type = 'input') {
  const input = root.querySelector<HTMLInputElement>(`[data-standard-table-field="${name}"]`)!;
  expect(input, name).not.toBeNull(); input.value = value; (input as unknown as MiniElement).dispatchEvent({ type });
}

it('lists the four kinds with their file, conversion and application status', async () => {
  const api = makeApi(); api.inspectStandardTables.mockResolvedValue({ missingPreinstalledKeys: [], tables:
    (['standard-characters', 'character-forms', 'word-forms', 'common-words'] as const).map((kind, index) => ({ ...table, kind, tableId: String(index),
      sourceFileName: index === 0 ? null : '词表.tsv', recentChecksCount: index === 0 ? 0 : 3 })) });
  const { root } = await setup(api);
  expect(root.querySelectorAll('[data-standard-table-id]')).toHaveLength(4);
  for (const text of ['本社自建', '规范字', '字形对照', '词形', '常用词', '词表.tsv', '修订版', '已识别 1 · 待确认 1 · 未识别 0', '近期核查未用过', '最近 3 次核查用过']) expect(root.textContent).toContain(text);
  expect(root.querySelector('[data-standard-table-action="restore-preinstalled"]')).toBeNull();
});

it('opens and searches entries, then displays the original in the same card', async () => {
  const { root, api } = await setup(); await click(root, 'inspect');
  expect(api.inspectStandardTable).toHaveBeenCalledWith({ tableId: 'table' });
  for (const text of ['甲词', '乙词', '第 3 位', '合成表第 1 行', '限标题', '国家规范（应改）', '待确认', '请核对写法']) expect(root.textContent).toContain(text);
  field(root, 'query', '甲词'); await click(root, 'search');
  expect(api.inspectStandardTable).toHaveBeenLastCalledWith({ tableId: 'table', versionId: 'v2', query: '甲词', offset: 0, versionsOffset: 0 });
  api.inspectStandardTable.mockResolvedValueOnce({ ...inspection, sourceContent: { ...inspection.sourceContent!, text: '原文件的合成文字', total: 9 } });
  await click(root, 'view-source');
  expect(api.inspectStandardTable).toHaveBeenLastCalledWith(expect.objectContaining({ query: '甲词', sourceOffset: 0 }));
  expect(root.querySelector('[data-standard-table-id="table"] [data-standard-table-source]')?.textContent).toContain('词表.tsv原文件的合成文字');
});

it('confirms held rows and preserves their absolute positions across search pages when saving', async () => {
  const { root, api } = await setup(); await click(root, 'inspect'); await click(root, 'confirm-row');
  field(root, 'condition', '本社标题');
  api.inspectStandardTable.mockResolvedValueOnce({ ...inspection, entries: [{ ...row, position: 201 }], total: 401, offset: 200 });
  await click(root, 'search'); await click(root, 'remove-row');
  await click(root, 'next'); expect(api.inspectStandardTable).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 400 }));
  await click(root, 'save-version');
  expect(api.saveStandardTable).toHaveBeenCalledWith({ tableId: 'table', expectedVersionId: 'v2', edits: [
    { position: 7, row: { ...row, status: 'applied', condition: '本社标题' } }, { position: 201, row: null },
  ] });
});

it('keeps earlier versions read-only and restores the current version draft', async () => {
  const { root, api } = await setup(); await click(root, 'inspect'); await click(root, 'confirm-row');
  api.inspectStandardTable.mockResolvedValueOnce({ ...inspection, selected: inspection.versions[1]! });
  field(root, 'version', 'v1', 'change'); await vi.waitFor(() => expect(root.querySelector('[data-standard-table-detail="v1"]')).not.toBeNull());
  expect(root.querySelector('[data-standard-table-action="save-version"]')).toBeNull();
  expect(root.querySelector('[data-standard-table-action="confirm-row"]')).toBeNull();
  field(root, 'version', 'v2', 'change'); await vi.waitFor(() => expect(root.querySelector('[data-standard-table-detail="v2"]')).not.toBeNull());
  expect(root.querySelector('[data-standard-table-field="status"]')?.getAttribute('value') ?? root.querySelector<HTMLSelectElement>('[data-standard-table-field="status"]')?.value).toBe('applied');
  await click(root, 'save-version'); expect(api.saveStandardTable).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 'v2', edits: [{ position: 7, row: { ...row, status: 'applied' } }] }));
});

it('previews update differences and commits metadata and confirmed rows', async () => {
  const api = makeApi(); api.previewStandardTableImport.mockResolvedValue({ ...preview, tableId: 'table', expectedVersionId: 'v2',
    diff: { counts: { added: 1, removed: 1, changed: 1 }, added: [row], removed: [{ ...row, recommended: '旧词' }], changed: [{ before: row, after: { ...row, recommended: '新词' } }] } });
  const { root } = await setup(api); await click(root, 'import-version');
  expect(api.previewStandardTableImport).toHaveBeenCalledWith({ tableId: 'table' });
  expect(root.querySelector('[data-standard-table-id="table"] [data-standard-table-preview]')).not.toBeNull();
  expect(root.textContent).toContain('新增 1 · 删除 1 · 修改 1'); expect(root.textContent).toContain('旧词'); expect(root.textContent).toContain('新词');
  field(root, 'name', '修订词表'); await click(root, 'confirm-row'); await click(root, 'commit-import');
  expect(api.commitStandardTableImport).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'preview', name: '修订词表', edits: [{ position: 1, row: { ...row, status: 'applied' } }] }));
  expect(root.querySelector('[data-standard-table-preview]')).toBeNull();
});

it('keeps preview edits across pages and allows a row strength to override the whole-table choice', async () => {
  const api = makeApi(); api.previewStandardTableImport.mockResolvedValueOnce({ ...preview, total: 201 })
    .mockResolvedValueOnce({ ...preview, total: 201, offset: 200, entries: [{ ...row, position: 201 }] });
  const { root } = await setup(api); await click(root, 'import');
  field(root, 'strength', 'house', 'change');
  field(root.querySelector<HTMLElement>('[data-standard-table-row="1"]')!, 'strength', 'dictionary', 'change');
  await click(root, 'next'); expect(api.previewStandardTableImport).toHaveBeenLastCalledWith({ previewId: 'preview', offset: 200 });
  await click(root, 'confirm-row'); await click(root, 'commit-import');
  expect(api.commitStandardTableImport).toHaveBeenCalledWith(expect.objectContaining({ strength: 'house', edits: [
    { position: 1, row: { ...row, strength: 'dictionary' } }, { position: 201, row: { ...row, strength: 'house', status: 'applied' } },
  ] }));
});

it('cancels the file picker or preview without importing and can start again', async () => {
  const api = makeApi(); api.previewStandardTableImport.mockResolvedValueOnce(null);
  const { root } = await setup(api); await click(root, 'import'); expect(root.querySelector('[data-standard-table-preview]')).toBeNull();
  await click(root, 'import'); await click(root, 'cancel-preview');
  expect(root.querySelector('[data-standard-table-preview]')).toBeNull(); expect(api.commitStandardTableImport).not.toHaveBeenCalled();
  await click(root, 'create'); expect(root.querySelector('[data-standard-table-create]')).not.toBeNull();
});

it('creates an empty house table and adds an editable row to a new version', async () => {
  const { root, api } = await setup(); await click(root, 'create');
  expect(root.querySelector<HTMLSelectElement>('[data-standard-table-field="strength"]')?.value).toBe('house');
  field(root, 'name', '本社新表'); field(root, 'kind', 'common-words', 'change'); await click(root, 'save-create');
  expect(api.saveStandardTable).toHaveBeenCalledWith({ name: '本社新表', kind: 'common-words', versionLabel: '1', sourceDescription: '本社自建', edits: [] });
  await click(root, 'add-row'); field(root.querySelector<HTMLElement>('[data-standard-table-row="-1"]')!, 'recommended', '本社词');
  await click(root, 'save-version');
  expect(api.saveStandardTable).toHaveBeenLastCalledWith(expect.objectContaining({ edits: [{ position: null, row: expect.objectContaining({ recommended: '本社词', strength: 'house' }) }] }));
});

it('toggles a table, deletes its card, and restores the missing preinstalled table', async () => {
  const { root, api, status } = await setup(); await click(root, 'toggle-enabled');
  expect(api.setStandardTableEnabled).toHaveBeenLastCalledWith({ tableId: 'table', enabled: false }); expect(root.textContent).toContain('停用 · 最近 3 次核查用过');
  await click(root, 'toggle-enabled'); expect(api.setStandardTableEnabled).toHaveBeenLastCalledWith({ tableId: 'table', enabled: true });
  await click(root, 'delete'); expect(api.deleteStandardTable).toHaveBeenCalledWith({ tableId: 'table' }); expect(root.querySelector('[data-standard-table-id]')).toBeNull();
  await click(root, 'restore-preinstalled'); expect(api.restorePreinstalledStandardTables).toHaveBeenCalledWith({});
  expect(root.querySelectorAll('[data-standard-table-id]')).toHaveLength(1); expect(status).toHaveBeenLastCalledWith('已恢复预装字表。', 'success');
});

it('retains edits after a failed save and does not submit twice while saving', async () => {
  const { root, api, status } = await setup(); await click(root, 'inspect'); await click(root, 'confirm-row');
  let fail!: (error: Error) => void; api.saveStandardTable.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  await click(root, 'save-version'); const button = root.querySelector<HTMLButtonElement>('[data-standard-table-action="save-version"]')!;
  expect(button.disabled).toBe(true); button.click(); expect(api.saveStandardTable).toHaveBeenCalledTimes(1);
  fail(new Error('字表已有新版本')); await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(status).toHaveBeenLastCalledWith('字表已有新版本', 'error');
  expect(root.querySelector<HTMLSelectElement>('[data-standard-table-field="status"]')?.value).toBe('applied');
});

it('keeps an import preview while saving an already opened table', async () => {
  const { root } = await setup(); await click(root, 'inspect');
  await click(root, 'import'); field(root.querySelector<HTMLElement>('[data-standard-table-preview]')!, 'name', '未保存的导入名称');
  const card = root.querySelector<HTMLElement>('[data-standard-table-id="table"]')!;
  await click(card, 'confirm-row'); await click(card, 'save-version');
  expect(root.querySelector<HTMLInputElement>('[data-standard-table-preview] [data-standard-table-field="name"]')?.value).toBe('未保存的导入名称');
});

it('does not report a late failure after leaving the surface', async () => {
  const { root, api, status } = await setup(); let fail!: (error: Error) => void;
  api.inspectStandardTable.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  await click(root, 'inspect'); root.remove(); fail(new Error('late'));
  for (let i = 0; i < 4; i++) await setImmediate(); expect(status).not.toHaveBeenCalled();
});
