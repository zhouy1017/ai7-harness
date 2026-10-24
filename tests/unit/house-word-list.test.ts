import { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  HOUSE_PAGE_SIZE, MAX_HOUSE_BYTES, HouseWordListError, houseUtf8Bytes, previewHousePaste, validateHouseEntries,
  validateInspectHouseWordListInput, validateSaveHouseWordListInput, type HouseWordListApi, type HouseWordListDraftEntry,
} from '../../src/shared/protocol/house-word-list.js';
import { HouseWordLists, houseWordListPin, initializeHouseWordListSchema, validateHouseWordListSnapshot } from '../../src/service/review/house-word-list.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { mountHouseWordList } from '../../src/renderer/house-word-list.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

const entry = (literal: string, note = ''): HouseWordListDraftEntry => ({ entryId: null, literal, note, enabled: true });
const input = (entries: readonly HouseWordListDraftEntry[]) => ({ expectedCurrent: null, sourceKind: 'editor-entry' as const, entries });

describe('editor-authored House input bounds', () => {
  it('freezes closed canonical document bytes and keeps the digest in its pin', () => {
    const bytes = '{"createdAt":"2026-10-24T00:00:00.000Z","entries":[{"enabled":true,"entryId":"00000000-0000-4000-8000-000000000003","literal":"合成甲","note":"公开说明"}],"listId":"00000000-0000-4000-8000-000000000001","ordinal":1,"previous":null,"schema":"ai7.house-word-list/1","source":{"kind":"editor-entry"},"versionId":"00000000-0000-4000-8000-000000000002"}';
    const document: unknown = JSON.parse(bytes);
    const pin = { listId: '00000000-0000-4000-8000-000000000001', versionId: '00000000-0000-4000-8000-000000000002', digest: sha256Hex(bytes) };
    validateHouseWordListSnapshot(document, pin);
    expect(canonicalJson(document)).toBe(bytes); expect(houseWordListPin(document)).toEqual(pin);
    expect(() => validateHouseWordListSnapshot({ ...document, digest: pin.digest }, pin)).toThrow();
  });
  it('keeps literal metacharacters, case, normalization and plain public notes exactly', () => {
    const entries = ['a.*[b]', 'Case', 'case', 'é', 'e\u0301', '🟦'.repeat(80), 'https://host.invalid/path', '{"literal":"text"}'].map((text) => entry(text, '词条说明'));
    expect(() => validateSaveHouseWordListInput(input(entries))).not.toThrow();
    expect(entries.map((row) => row.literal)).toContain('e\u0301');
    expect(() => validateHouseEntries([entry('🟦'.repeat(81))])).toThrow();
    expect(() => validateHouseEntries([entry('字', '🟦'.repeat(201))])).toThrow();
    expect(() => validateHouseEntries(Array.from({ length: 501 }, (_, index) => entry(`词${index}`)))).toThrow();
    expect(() => validateHouseEntries([])).not.toThrow();
  });
  it.each(['', ' 词', '词 ', '词\n条', '词\t条', '词\u0000条', '\ud800'])('refuses malformed or unbounded literal %j', (text) => {
    expect(() => validateSaveHouseWordListInput(input([entry(text)]))).toThrow(HouseWordListError);
  });
  it('refuses duplicate rows/IDs, unknown fields, invalid pins and byte-heavy drafts', () => {
    expect(() => validateSaveHouseWordListInput(input([entry('重复'), entry('重复')]))).toThrow('第2行');
    const identified = { ...entry('甲'), entryId: '00000000-0000-4000-8000-000000000001' };
    expect(() => validateHouseEntries([identified, { ...identified, literal: '乙' }])).toThrow();
    expect(() => validateSaveHouseWordListInput({ ...input([]), unexpected: true })).toThrow();
    expect(() => validateSaveHouseWordListInput({ ...input([]), expectedCurrent: { versionId: 'foreign', digest: 'x' } })).toThrow();
    expect(() => validateInspectHouseWordListInput({ versionId: null, entryOffset: -1, historyOffset: 0 })).toThrow();
    expect(() => validateInspectHouseWordListInput({ versionId: null, entryOffset: 0, historyOffset: Infinity })).toThrow();
    const heavy = input(Array.from({ length: 500 }, (_, index) => entry(`词${index}`, '注'.repeat(100))));
    expect(houseUtf8Bytes(JSON.stringify(heavy))).toBeGreaterThan(MAX_HOUSE_BYTES);
    expect(() => validateSaveHouseWordListInput(heavy)).toThrow('128KiB');
  });
  it('bounds prospective public annotation UTF16 units even when a grapheme is extremely long', () => {
    expect(() => validateHouseEntries([entry(`a${'\u0301'.repeat(4050)}`)])).toThrow('批注');
    expect(() => validateHouseEntries([entry('词', `a${'\u0301'.repeat(4050)}`)])).toThrow('批注');
  });
  it('previews one unchanged literal per nonempty line with bounded original row feedback', () => {
    expect(previewHousePaste('甲\r\n\na.*[b]\nhttps://host.invalid/path')).toEqual({ entries: [entry('甲'), entry('a.*[b]'), entry('https://host.invalid/path')], errors: [] });
    const preview = previewHousePaste('甲\n\n甲\n 乙\n丙');
    expect(preview.errors.map((error) => error.row)).toEqual([3, 4]);
    expect(preview.entries.map((row) => row.literal)).toEqual(['甲', '丙']);
    expect(previewHousePaste('字'.repeat(MAX_HOUSE_BYTES)).errors).toHaveLength(1);
    expect(previewHousePaste('\ud800').errors).toHaveLength(1);
    expect(previewHousePaste('甲\n'.repeat(10000)).errors.length).toBeLessThanOrEqual(500);
  });
});

describe('standalone House panel through its two-operation interface', () => {
  it('keeps a known committed save truthful after a failed read and retries only the read', async () => {
    const restore = installMiniDom(); const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db); const status = vi.fn(); let failRead = false;
    const api: HouseWordListApi = {
      inspectHouseWordList: vi.fn(async (value) => { if (failRead) { failRead = false; throw new Error('synthetic read failure'); } return owner.inspect(value); }),
      saveHouseWordList: vi.fn(async (value) => { const saved = owner.save(value); failRead = true; return saved; }),
    };
    const root = document.createElement('div'); document.body.append(root);
    const panel = mountHouseWordList({ root, api, setStatus: status });
    const click = async (name: string) => { miniDocument.body.querySelector(`[data-house-action="${name}"]`)!.click(); await setImmediate(); };
    try {
      await panel.load(); await click('edit'); await click('add');
      const literal = miniDocument.body.querySelector('[data-house-field="literal"]')!;
      literal.value = '已保存的合成词'; literal.dispatchEvent({ type: 'input' });
      await click('save');
      expect(owner.inspect().selected?.ordinal).toBe(1); expect(api.saveHouseWordList).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenLastCalledWith(expect.stringContaining('已保存本社敏感词表 第1版；读取未完成'), 'error');
      expect(root.textContent).toContain('第1版已保存'); expect(root.textContent).not.toContain('尚未保存');
      expect(root.textContent).not.toContain('草稿'); expect(miniDocument.body.querySelector('[data-house-action="save"]')).toBeNull();
      await click('retry-read');
      expect(root.textContent).toContain('已保存的合成词'); expect(api.saveHouseWordList).toHaveBeenCalledTimes(1);
      expect(owner.inspect().history).toHaveLength(1);
      expect(status).toHaveBeenLastCalledWith('已保存本社敏感词表 第1版。', 'success');
    } finally { panel.destroy(); db.close(); restore(); }
  });
  it('authors/pastes/saves immutable versions, preserves a stale draft and shows historical versions read-only', async () => {
    const restore = installMiniDom(); const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db); const status = vi.fn();
    const api: HouseWordListApi = { inspectHouseWordList: vi.fn(async (value) => owner.inspect(value)), saveHouseWordList: vi.fn(async (value) => owner.save(value)) };
    const root = document.createElement('div'); document.body.append(root);
    const panel = mountHouseWordList({ root, api, setStatus: status });
    const click = async (name: string) => { miniDocument.body.querySelector(`[data-house-action="${name}"]`)!.click(); await setImmediate(); };
    const type = (name: string, value: string) => { const field = miniDocument.body.querySelector(`[data-house-field="${name}"]`)!; field.value = value; field.dispatchEvent({ type: 'input' }); };
    try {
      await panel.load(); expect(root.textContent).toContain('尚未保存'); expect(api.saveHouseWordList).not.toHaveBeenCalled();
      await click('edit'); type('paste', '合成甲\n合成乙'); await click('preview-paste');
      expect(root.textContent).toContain('尚未加入草稿或保存'); expect(owner.inspect().current).toBeNull();
      await click('accept-paste'); await click('save');
      const first = owner.inspect(); expect(first.selected?.ordinal).toBe(1); expect(first.selected?.source.kind).toBe('editor-paste');
      expect(first.entries.map((row) => row.literal)).toEqual(['合成甲', '合成乙']);
      await click('edit'); type('literal', '草稿保留');
      owner.save({ expectedCurrent: { versionId: first.current!.versionId, digest: first.current!.digest }, sourceKind: 'editor-entry', entries: first.entries.map((row) => ({ ...row, enabled: false })) });
      await click('save'); expect(status).toHaveBeenLastCalledWith(expect.stringContaining('已有新版本'), 'error');
      expect(miniDocument.body.querySelector('[data-house-field="literal"]')?.value).toBe('草稿保留');
      expect(owner.inspect().selected?.ordinal).toBe(2);
      await click('discard'); await click('history-1');
      expect(root.textContent).toContain('第1版'); expect(miniDocument.body.querySelector('[data-house-field="literal"]')).toBeNull();
      expect(root.textContent).toContain('词条说明'); expect(Object.keys(api).sort()).toEqual(['inspectHouseWordList', 'saveHouseWordList']);
    } finally { panel.destroy(); db.close(); restore(); }
  });
  it('loads a bounded current draft page by page and keeps its DOM page at fifty rows', async () => {
    const restore = installMiniDom(); const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db); owner.save(input(Array.from({ length: 53 }, (_, index) => entry(`词${index}`))));
    const inspect = vi.fn(async (value: Parameters<HouseWordListApi['inspectHouseWordList']>[0]) => owner.inspect(value));
    const root = document.createElement('div'); document.body.append(root);
    const panel = mountHouseWordList({ root, api: { inspectHouseWordList: inspect, saveHouseWordList: async (value) => owner.save(value) }, setStatus: vi.fn() });
    try {
      await panel.load(); miniDocument.body.querySelector('[data-house-action="edit"]')!.click(); await setImmediate();
      expect(inspect.mock.calls.map(([value]) => value.entryOffset)).toEqual([0, 0, HOUSE_PAGE_SIZE]);
      expect(root.querySelectorAll('[data-house-entry-row]')).toHaveLength(50);
      miniDocument.body.querySelector('[data-house-action="draft-next"]')!.click();
      expect(root.querySelectorAll('[data-house-entry-row]')).toHaveLength(3);
      expect(root.textContent).toContain('共53条');
    } finally { panel.destroy(); db.close(); restore(); }
  });
});
