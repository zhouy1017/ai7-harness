import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { standardsTable, runStructuredFlashTask } from '../../src/service/fast-role/flash-task-contract.js';
import type { StandardTableRow } from '../../src/shared/protocol/standard-tables.js';
import { syntheticPdf } from '../fixtures/material-formats/synthetic-pdf.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import { randomUUID } from 'node:crypto';

let roots: ServiceTestRoots, store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-standard-import-'); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); });
afterEach(async () => { store?.close(); await roots.dispose(); vi.restoreAllMocks(); });
const row = (recommended: string, discouraged: string[] = []): StandardTableRow => ({ recommended, discouraged, rank: null, condition: null, source: null,
  strength: 'house', status: 'applied', reviewNote: null, sourceText: null });
const prose = { text: '本社写作中推荐甲词，乙词需要改为甲词。', fileName: '用语说明.txt' };
const multipart = { text: Array.from({ length: 161 }, (_, i) => `第${i + 1}段公开说明推荐甲词而非乙词。`).join('\n') };
async function importText(text: string, fileName = '词表.tsv') {
  const preview = await store.standardTables.previewStandardTableImport({ text, fileName });
  return store.standardTables.commitStandardTableImport({ previewId: preview.previewId });
}

describe('R5-L2 standard-table library service', () => {
  it('imports a native table without a model, retains the source across reopen, and searches its rows', async () => {
    const format = vi.fn(); store.useStandardTableFormatter({ model: () => 'test / flash', format });
    const text = JSON.stringify({ schema: 'ai7.standard-table/1', name: '公开合成词表', kind: 'word-forms', entries: [row('甲词', ['乙词'])] });
    const path = join(roots.inputRoot, 'table.json'); await writeFile(path, text);
    const preview = await store.standardTables.previewStandardTableImport({ path });
    const saved = await store.standardTables.commitStandardTableImport({ previewId: preview.previewId });
    expect(saved.table.counts).toEqual({ applied: 1, toConfirm: 0, unrecognized: 0 }); expect(format).not.toHaveBeenCalled();
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const inspected = await store.standardTables.inspectStandardTable({ tableId: saved.table.tableId, query: '乙词', sourceOffset: 0 });
    expect(inspected.entries[0]).toMatchObject({ recommended: '甲词', discouraged: ['乙词'], position: 1 });
    expect(inspected.sourceContent?.text).toBe(text); expect(inspected.versions).toHaveLength(1);
  });

  it('offers the selected Flash model and usage before sending, and holds untraced and uncertain rows', async () => {
    const send = vi.fn(async () => JSON.stringify({ items: [{ paragraph: 1, recommended: '甲词', discouraged: ['乙词'] }, { paragraph: 1, recommended: '无中生有', discouraged: [] }] }));
    const format = (paragraphs: readonly string[]) => runStructuredFlashTask(standardsTable, paragraphs, send);
    store.useStandardTableFormatter({ model: () => '公开测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport({ ...prose, formatConfirmed: true })).rejects.toMatchObject({ code: 'STANDARD_TABLE_CHANGED' });
    await expect(store.standardTables.previewStandardTableImport(prose)).rejects.toThrow(/公开测试 \/ flash.*预计 1 次请求/u);
    expect(send).not.toHaveBeenCalled();
    const preview = await store.standardTables.previewStandardTableImport({ ...prose, formatConfirmed: true });
    expect(send).toHaveBeenCalledOnce(); expect(preview.entries.map(r => r.status)).toEqual(['to-confirm', 'unrecognized']);
    expect(preview.entries[1]?.reviewNote).toBe('词形未对应所引原文。');
    const saved = await store.standardTables.commitStandardTableImport({ previewId: preview.previewId });
    expect(saved.table.counts).toEqual({ applied: 0, toConfirm: 1, unrecognized: 1 });
  });

  it('retries a formatting failure once and reports a part that still fails alongside the successful parts', async () => {
    const invalid = { state: 'fallback', value: null, reason: '返回内容未能对应输入。', formattingParseFailure: true };
    const checked = { state: 'checked', value: [{ paragraph: 1, recommended: '甲词', discouraged: ['乙词'], status: '待确认', reason: '请核对。' }] };
    const format = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(invalid).mockResolvedValue(checked);
    store.useStandardTableFormatter({ model: () => '测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport(multipart)).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_OFFER' });
    const preview = await store.standardTables.previewStandardTableImport({ ...multipart, formatConfirmed: true });
    expect(format).toHaveBeenCalledTimes(4);
    expect(preview.conversionReport.parts.map(p => [p.state, p.attempts, p.reason])).toEqual([
      ['fallback', 2, invalid.reason], ['checked', 1, null], ['checked', 1, null],
    ]);
    expect(preview.entries.map(entry => entry.source)).toEqual(['第81段', '第161段']);
  });

  it.each([
    ['fallback', '受保护凭据库中没有保存的凭据。', 'STANDARD_TABLE_FORMAT_FAILED'],
    ['fallback', '无法连接模型服务，请检查网络。', 'STANDARD_TABLE_FORMAT_FAILED'],
    ['outcome-unknown', '请求可能已经发出，但没有收到完整回答。', 'STANDARD_TABLE_FORMAT_OUTCOME_UNKNOWN'],
  ])('stops a multipart import on %s and surfaces its exact reason', async (state, reason, code) => {
    const format = vi.fn().mockResolvedValue({ state, value: null, reason });
    store.useStandardTableFormatter({ model: () => '测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport(multipart)).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_OFFER' });
    await expect(store.standardTables.previewStandardTableImport({ ...multipart, formatConfirmed: true })).rejects.toMatchObject({ code, message: reason });
    expect(format).toHaveBeenCalledOnce();
  });

  it('surfaces a formatting failure if the retry leaves no rows to preview', async () => {
    const reason = '返回内容未能对应输入。';
    const format = vi.fn().mockResolvedValue({ state: 'fallback', value: null, reason, formattingParseFailure: true });
    store.useStandardTableFormatter({ model: () => '测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport(prose)).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_OFFER' });
    await expect(store.standardTables.previewStandardTableImport({ ...prose, formatConfirmed: true })).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_FAILED', message: reason });
    expect(format).toHaveBeenCalledTimes(2);
  });

  it('refuses scanned PDFs with the recognition reason and offers text-layer PDFs for formatting', async () => {
    const scan = join(roots.inputRoot, 'scan.pdf'); await writeFile(scan, syntheticPdf({ pages: [[['公开合成扫描页']]], imageOnly: new Set([0]) }));
    await expect(store.standardTables.previewStandardTableImport({ path: scan })).rejects.toThrow(/暂不支持扫描 PDF 识别/u);
    const text = join(roots.inputRoot, 'text.pdf'); await writeFile(text, syntheticPdf({ pages: [[['公开合成说明中推荐使用甲词，而非乙词。']]] }));
    const format = vi.fn(); store.useStandardTableFormatter({ model: () => '测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport({ path: text })).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_OFFER' });
    expect(format).not.toHaveBeenCalled();
  });

  it('creates custom tables and immutable edit versions, confirms held rows, and detects stale edits', async () => {
    const empty = await store.standardTables.saveStandardTable({ name: '本社新词表', kind: 'word-forms' });
    const held = { ...row('甲词', ['乙词']), status: 'to-confirm' as const, reviewNote: '请核对。' };
    const added = await store.standardTables.saveStandardTable({ tableId: empty.table.tableId, expectedVersionId: empty.selected.versionId, edits: [{ position: null, row: held }] });
    const edited = await store.standardTables.saveStandardTable({ tableId: empty.table.tableId, expectedVersionId: added.selected.versionId,
      edits: [{ position: 1, row: { ...held, status: 'applied', reviewNote: null, condition: '限本社标题' } }, { position: null, row: row('丙词') }] });
    expect(edited.selected.ordinal).toBe(3); expect(edited.table.counts.applied).toBe(2);
    const historical = await store.standardTables.inspectStandardTable({ tableId: empty.table.tableId, versionId: added.selected.versionId });
    expect(historical.entries[0]?.status).toBe('to-confirm');
    await expect(store.standardTables.saveStandardTable({ tableId: empty.table.tableId, expectedVersionId: added.selected.versionId, entries: [] })).rejects.toThrow(/已有新版本/u);
    const removed = await store.standardTables.saveStandardTable({ tableId: empty.table.tableId, expectedVersionId: edited.selected.versionId, edits: [{ position: 2, row: null }] });
    expect(removed.entries).toHaveLength(1);
    expect(store.standardTables.setStandardTableEnabled({ tableId: empty.table.tableId, enabled: false }).tables.find(t => t.tableId === empty.table.tableId)?.enabled).toBe(false);
  });

  it('applies a table-wide strength while preserving explicit row choices on import', async () => {
    const preview = await store.standardTables.previewStandardTableImport({ text: '推荐写法\t不推荐写法\n甲词\t乙词\n丙词\t丁词', fileName: '词表.tsv' });
    const saved = await store.standardTables.commitStandardTableImport({ previewId: preview.previewId, strength: 'national',
      edits: [{ position: 1, row: { ...row('甲词', ['乙词']), strength: 'dictionary' } }] });
    expect(saved.entries.map(entry => entry.strength)).toEqual(['dictionary', 'national']);
  });

  it('shows added, removed and changed rows before importing a new version', async () => {
    const first = await importText('推荐写法\t不推荐写法\n甲词\t乙词\n丙词\t丁词');
    const preview = await store.standardTables.previewStandardTableImport({ tableId: first.table.tableId, text: '推荐写法\t不推荐写法\n甲词\t戊词\n新词\t旧词', fileName: '新版本.tsv' });
    expect(preview.diff?.counts).toEqual({ added: 1, removed: 1, changed: 1 }); expect(preview.diff?.changed[0]?.after.discouraged).toEqual(['戊词']);
    const saved = await store.standardTables.commitStandardTableImport({ previewId: preview.previewId });
    expect(saved.selected.ordinal).toBe(2); expect(saved.selected.sourceFileName).toBe('新版本.tsv'); expect(saved.versions).toHaveLength(2);
  });

  it('removes every version and unshared source, preserves a shared source, and restores deleted seeds', async () => {
    const original = await importText('推荐写法\t不推荐写法\n甲词\t乙词');
    const shared = await importText('推荐写法\t不推荐写法\n甲词\t乙词');
    const prefix = original.sourceContent!.digest.slice(0, 2), folder = join(roots.dataRoot, 'objects', 'sha256', prefix);
    const files = await readdir(folder); expect(files).toHaveLength(1);
    await store.standardTables.saveStandardTable({ tableId: original.table.tableId, expectedVersionId: original.selected.versionId, entries: [row('丙词')] });
    await store.standardTables.deleteStandardTable({ tableId: original.table.tableId });
    await expect(store.standardTables.inspectStandardTable({ tableId: original.table.tableId, versionId: original.selected.versionId })).rejects.toThrow(/已删除/u);
    expect(await readFile(join(folder, files[0]!))).toBeTruthy();
    await store.standardTables.deleteStandardTable({ tableId: shared.table.tableId }); expect(await readdir(folder)).toEqual([]);
    const seed = store.standardTables.inspectStandardTables().tables.find(t => t.preinstalledKey === 'gf-1001-2001')!;
    expect((await store.standardTables.deleteStandardTable({ tableId: seed.tableId })).missingPreinstalledKeys).toContain('gf-1001-2001');
    const restored = store.standardTables.restorePreinstalledStandardTables({ keys: ['gf-1001-2001'] });
    expect(restored.tables.find(t => t.tableId === seed.tableId)?.counts.applied).toBe(382); expect(restored.missingPreinstalledKeys).toEqual([]);
  });

  it('validates new protocol operations and rejects malformed edits before a write', () => {
    const frame = (input: unknown) => Buffer.from(JSON.stringify({ id: randomUUID(), op: 'saveStandardTable', input }));
    expect(() => decodeRequest(frame({ name: '公开合成字表', entries: [row('甲词')] }))).not.toThrow();
    expect(() => decodeRequest(frame({ name: '公开合成字表', entries: [{ ...row('甲词'), rank: -1 }] }))).toThrow();
  });

  it('rolls back deletion of versions and entries when a source cannot be removed', async () => {
    const first = await importText('推荐写法\t不推荐写法\n甲词\t乙词');
    const preview = await store.standardTables.previewStandardTableImport({ tableId: first.table.tableId, text: '推荐写法\t不推荐写法\n丙词\t丁词', fileName: '新版.tsv' });
    const current = await store.standardTables.commitStandardTableImport({ previewId: preview.previewId });
    const digest = current.sourceContent!.digest, folder = join(roots.dataRoot, 'objects', 'sha256', digest.slice(0, 2));
    const name = (await readdir(folder)).find(n => n.startsWith(digest))!, path = join(folder, name);
    await rename(path, path + '.held');
    await expect(store.standardTables.deleteStandardTable({ tableId: first.table.tableId })).rejects.toThrow();
    await rename(path + '.held', path);
    const stillThere = await store.standardTables.inspectStandardTable({ tableId: first.table.tableId, versionId: first.selected.versionId, sourceOffset: 0 });
    expect(stillThere.versionsTotal).toBe(2); expect(stillThere.entries[0]?.recommended).toBe('甲词');
    expect(stillThere.sourceContent?.text).toContain('乙词');
  });

  it('binds model consent to the exact source and keeps large previews within the service reply limit', async () => {
    const format = vi.fn(); store.useStandardTableFormatter({ model: () => '测试 / flash', format });
    await expect(store.standardTables.previewStandardTableImport(prose)).rejects.toMatchObject({ code: 'STANDARD_TABLE_FORMAT_OFFER' });
    await expect(store.standardTables.previewStandardTableImport({ ...prose, text: prose.text + '新增说明。', formatConfirmed: true })).rejects.toMatchObject({ code: 'STANDARD_TABLE_CHANGED' });
    expect(format).not.toHaveBeenCalled();
    const text = ['推荐写法\t说明', ...Array.from({ length: 90 }, (_, i) => `第${i}词\t${'公开合成说明'.repeat(500)}`)].join('\n');
    const preview = await store.standardTables.previewStandardTableImport({ text, fileName: 'large.tsv' });
    expect(preview.total).toBe(90); expect(preview.entries.length).toBeLessThan(50); expect(Buffer.byteLength(JSON.stringify(preview))).toBeLessThan(512 * 1024);
    const next = await store.standardTables.previewStandardTableImport({ previewId: preview.previewId, offset: preview.entries.length });
    expect(next.entries[0]?.position).toBe(preview.entries.length + 1);
  });
});
