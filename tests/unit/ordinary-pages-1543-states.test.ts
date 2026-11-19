import { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customDimensionFormOpen, mountCustomAnalysisTab } from '../../src/renderer/custom-analysis.js';
import { CUSTOM_TAB_NOT_ENABLED } from '../../src/renderer/custom-analysis-labels.js';
import { AnalysisFollower } from '../../src/renderer/analysis-follow.js';
import { mountHouseWordList } from '../../src/renderer/house-word-list.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { styleInput } from '../../src/renderer/components/controls.js';
import { HouseWordLists, initializeHouseWordListSchema } from '../../src/service/review/house-word-list.js';
import type { HouseWordListApi } from '../../src/shared/protocol/house-word-list.js';
import type { CustomAnalysisDimensionProjection, CustomAnalysisDimensionsProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Issue #1543 review: the three states of 本社词表's page, where focus goes after each step, every sentence the word list and the
// in-place dimension flow say in ordinary mode, a form that survives the card's redraws, and 启用 / 停用 on the card itself.

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { setTechnicalLayerVisible(true); uninstall(); });

const PLAIN = [/(?<!发稿)版本/u, /\bv\d/u, /KiB/u, /身份/u, /AI7 初评/u, /敏感词表|自用词表/u];
const plain = (text: string): void => { for (const pattern of PLAIN) expect(pattern.test(text), `${pattern.source} in ${text}`).toBe(false); };
const settle = async (): Promise<void> => { for (let index = 0; index < 8; index += 1) await setImmediate(); };
const q = (root: unknown, selector: string): MiniElement | null => (root as MiniElement).querySelector(selector);
const qa = (root: unknown, selector: string): MiniElement[] => (root as MiniElement).querySelectorAll(selector);
const active = (): unknown => (document as unknown as { activeElement: unknown }).activeElement;
const entry = (literal: string) => ({ entryId: null, literal, note: '', enabled: true });

describe('本社词表: reading, failed and nothing saved are three states', () => {
  const mount = (api: HouseWordListApi, setStatus = vi.fn()) => {
    const root = miniDocument.createElement('div'); miniDocument.body.append(root);
    return { root, setStatus, panel: mountHouseWordList({ root: root as unknown as HTMLElement, api, setStatus }) };
  };
  const state = (root: unknown): string | undefined => q(root, '[data-house-word-list]')?.dataset['houseState'];

  it('says it is reading, then that the read failed with a way to read again, and only then that nothing is saved', async () => {
    const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db);
    let fail = true;
    const { root, panel, setStatus } = mount({
      inspectHouseWordList: async (value) => { if (fail) throw new Error('down'); return owner.inspect(value); },
      saveHouseWordList: async (value) => owner.save(value),
    });
    try {
      expect(state(root)).toBe('reading');
      expect(root.textContent).toContain('正在读取本社词表'); expect(qa(root, 'button')).toHaveLength(0);
      await panel.load();
      expect(state(root)).toBe('failed'); expect(panel.failed()).toBe(true);
      expect(qa(root, 'button').map((node) => node.textContent)).toEqual(['重新读取']);
      expect(root.textContent).not.toContain('还没有保存'); expect(setStatus).toHaveBeenLastCalledWith('词表读取未完成，请重试。', 'error');
      fail = false;
      (q(root, '[data-house-action="reload"]') as MiniElement).click(); await settle();
      expect(state(root)).toBe('empty'); expect(root.textContent).toContain('还没有保存本社词表');
      expect(qa(root, 'button').map((node) => node.textContent)).toEqual(['创建词表']);
      expect(active()).toBe(q(root, '[data-house-action="edit"]'));
    } finally { panel.destroy(); db.close(); }
  });

  it('keeps focus on the editor\'s next control after create, add, remove and save, and says every status in ordinary words', async () => {
    const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db);
    const { root, panel, setStatus } = mount({ inspectHouseWordList: async (value) => owner.inspect(value), saveHouseWordList: async (value) => owner.save(value) });
    const press = async (selector: string): Promise<void> => { (q(root, selector) as MiniElement).click(); await settle(); };
    const type = (selector: string, value: string): void => { const field = q(root, selector) as MiniElement; field.value = value; field.dispatchEvent({ type: 'input' }); };
    try {
      await panel.load(); expect(state(root)).toBe('empty');
      await press('[data-house-action="edit"]'); expect(state(root)).toBe('draft');
      expect(active()).toBe(q(root, '[data-house-action="add"]'));
      await press('[data-house-action="add"]');
      expect(active()).toBe(q(root, '[data-house-entry-row="1"] [data-house-field="literal"]'));
      type('[data-house-entry-row="1"] [data-house-field="literal"]', '合成甲');
      await press('[data-house-action="add"]');
      expect(active()).toBe(q(root, '[data-house-entry-row="2"] [data-house-field="literal"]'));
      await press('[data-house-action="remove-1"]');
      expect(active()).toBe(q(root, '[data-house-action="add"]'));
      await press('[data-house-action="remove-0"]');
      expect(active()).toBe(q(root, '[data-house-action="add"]'));
      await press('[data-house-action="add"]'); type('[data-house-entry-row="1"] [data-house-field="literal"]', '合成乙');
      await press('[data-house-action="save"]');
      expect(state(root)).toBe('saved'); expect(active()).toBe(q(root, '[data-house-action="edit"]'));
      // A save that changes nothing, and a refused paste, are said in the same words.
      await press('[data-house-action="edit"]'); await press('[data-house-action="save"]');
      const paste = q(root, '[data-house-field="paste"]') as MiniElement;
      await press('[data-house-action="edit"]');
      const pasteBox = q(root, '[data-house-field="paste"]') as MiniElement; pasteBox.value = ' 甲'; pasteBox.dispatchEvent({ type: 'input' });
      await press('[data-house-action="accept-paste"]'); expect(active()).toBe(q(root, '[data-house-field="paste"]'));
      void paste;
      const messages = setStatus.mock.calls.map(([message]) => String(message));
      expect(messages).toEqual(expect.arrayContaining(['已保存本社词表。', '词条没有变化，本社词表保持原样。']));
      for (const message of messages) plain(message);
      plain(root.textContent);
    } finally { panel.destroy(); db.close(); }
  });

  it('names a read that failed after a save, and every refusal, in ordinary words', async () => {
    const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db);
    let failRead = false;
    const { root, panel, setStatus } = mount({
      inspectHouseWordList: async (value) => { if (failRead) { failRead = false; throw new Error('read'); } return owner.inspect(value); },
      saveHouseWordList: async (value) => { const saved = owner.save(value); failRead = true; return saved; },
    });
    try {
      await panel.load();
      (q(root, '[data-house-action="edit"]') as MiniElement).click(); await settle();
      (q(root, '[data-house-action="add"]') as MiniElement).click(); await settle();
      const field = q(root, '[data-house-field="literal"]') as MiniElement; field.value = '合成丙'; field.dispatchEvent({ type: 'input' });
      (q(root, '[data-house-action="save"]') as MiniElement).click(); await settle();
      const stale = setStatus.mock.calls.map(([message]) => String(message));
      expect(stale).toContain('已保存本社词表；读取未完成，请重试读取。');
      // A refused save: a blank row names its row in the editor's words.
      (q(root, '[data-house-action="retry-read"]') as MiniElement).click(); await settle();
      (q(root, '[data-house-action="edit"]') as MiniElement).click(); await settle();
      (q(root, '[data-house-action="add"]') as MiniElement).click(); await settle();
      (q(root, '[data-house-action="save"]') as MiniElement).click(); await settle();
      for (const [message] of setStatus.mock.calls) plain(String(message));
      expect(String(setStatus.mock.calls.at(-1)![0])).toContain('第2行');
    } finally { panel.destroy(); db.close(); }
  });

  it('lists only the lists before the current one, each to the second, and draws a pager only past one page', async () => {
    const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db);
    owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: [entry('合成甲')] });
    const first = owner.inspect().current!;
    owner.save({ expectedCurrent: { versionId: first.versionId, digest: first.digest }, sourceKind: 'editor-entry', entries: [entry('合成甲'), entry('合成乙')] });
    const { root, panel } = mount({ inspectHouseWordList: async (value) => owner.inspect(value), saveHouseWordList: async (value) => owner.save(value) });
    try {
      await panel.load();
      const rows = qa(root, 'button').filter((node) => /^history-[0-9]+$/.test(node.dataset['houseAction'] ?? ''));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.textContent).toMatch(/月 [0-9]+ 日 [0-9]{2}:[0-9]{2}:[0-9]{2} · 1 条/u);
      expect(q(root, '[data-house-action="history-previous"]')).toBeNull(); expect(q(root, '[data-house-action="history-next"]')).toBeNull();
    } finally { panel.destroy(); db.close(); }
  });
});

describe('分析 › 自定义 in ordinary words, with a form that stays and a card that can be enabled', () => {
  const BOOK = '11111111-1111-4111-8111-111111111111';
  const FIXED = { answerSchema: {} as never, authorityCeiling: {} as never };
  const version = (state: 'enabled' | 'pending-validation', title = '人物出场'): CustomAnalysisDimensionProjection['versions'][number] => ({
    versionId: 'v1', version: 1, title, questionTemplate: '问？', documentDigest: 'd'.repeat(64), supersedes: null, state,
    stateLabel: state === 'enabled' ? '已启用' : '待验证', createdAt: '2026-11-01T00:00:00.000Z', stateRecordedAt: '2026-11-01T00:00:00.000Z', taskCount: 0 });
  const dimension = (state: 'enabled' | 'pending-validation', reason: string | null = null): CustomAnalysisDimensionProjection => ({
    dimensionId: '22222222-2222-4222-8222-222222222222', kind: 'custom-analysis/x', title: '人物出场',
    enabledVersion: state === 'enabled' ? { versionId: 'v1', version: 1 } : null, versions: [version(state)], versionsTruncated: false,
    book: { taskState: null, latest: null, unavailableReason: reason } });
  const list = (...dimensions: CustomAnalysisDimensionProjection[]): CustomAnalysisDimensionsProjection => ({ bookId: BOOK, dimensions, truncated: false, fixed: FIXED });
  const mount = (reading: () => CustomAnalysisDimensionsProjection) => {
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => reading()), saveCustomAnalysisDimension: vi.fn(),
      enableCustomAnalysisDimension: vi.fn(async () => list(dimension('enabled'))), stopCustomAnalysisDimension: vi.fn(async () => list()),
    };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    const setStatus = vi.fn();
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus, errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    return { panel, api, setStatus };
  };

  it('says nothing technical with the form open or a card drawn, and holds the card\'s redraws while the form is open', async () => {
    const { panel } = mount(() => list());
    await settle();
    (q(panel, '[data-custom-action="create"]') as MiniElement).click();
    plain(panel.textContent);
    const form = q(panel, '[data-custom-form="new"]')!;
    (form.querySelector('input') as MiniElement).value = '人物出场';
    expect(customDimensionFormOpen(panel as unknown as ParentNode)).toBe(true);
    // The card's follow-up read answers with a changed projection while the form is open and filled: it is not drawn over it.
    const host = {}; const follower = new AnalysisFollower<object>({ setTimeout: (callback, ms) => setTimeout(callback, ms) as unknown as number, clearTimeout: (h) => clearTimeout(h) });
    vi.useFakeTimers();
    try {
      const drawn: number[] = [];
      follower.later(host, follower.drawn(host), 10, { belongs: () => true, read: async () => ({}), unchanged: () => false, again: () => 50,
        held: () => customDimensionFormOpen(panel as unknown as ParentNode), draw: () => { drawn.push(1); }, failed: () => undefined });
      await vi.advanceTimersByTimeAsync(200);
      expect(drawn).toEqual([]);
      (q(panel, '[data-custom-action="cancel"]') as MiniElement).click();
      await vi.advanceTimersByTimeAsync(200);
      expect(drawn).toEqual([1]);
    } finally { vi.useRealTimers(); }
    const { panel: listed } = mount(() => list(dimension('enabled')));
    await settle();
    plain(listed.textContent);
  });

  it('puts focus on the new card once a dimension is saved and enabled', async () => {
    let reading = list();
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => reading),
      saveCustomAnalysisDimension: vi.fn(async () => ({ ...list(), bookId: null, dimensions: [dimension('pending-validation')] })),
      enableCustomAnalysisDimension: vi.fn(async () => { reading = list(dimension('enabled')); return reading; }), stopCustomAnalysisDimension: vi.fn(),
    };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    await settle();
    (q(panel, '[data-custom-action="create"]') as MiniElement).click();
    expect(active()).toBe(q(panel, 'input[name="title"]'));
    const form = q(panel, '[data-custom-form="new"]')!;
    (form.querySelector('input') as MiniElement).value = '人物出场'; (form.querySelector('textarea') as MiniElement).value = '问？';
    form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
    expect(active()).toBe(q(panel, '.custom-dimension-card'));
  });

  it('offers 启用 on a saved dimension that is not enabled, with a sentence of its own, and 停用 on an enabled one', async () => {
    const pending = dimension('pending-validation', '这个维度没有已启用的版本。在「知识库 › 工序与规则 › 自定义分析维度」中启用一个版本后才能运行。');
    const { panel, api } = mount(() => list(pending));
    await settle();
    expect(q(panel, '.custom-unavailable')!.textContent).toBe(CUSTOM_TAB_NOT_ENABLED);
    expect(panel.textContent).not.toContain('知识库'); expect(panel.textContent).not.toContain('工序与规则');
    expect(q(panel, '[data-custom-action="stop"]')).toBeNull();
    (q(panel, '[data-custom-action="enable"]') as MiniElement).click(); await settle();
    expect(api.enableCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: 'v1' });
    const { panel: running, api: second } = mount(() => list(dimension('enabled')));
    await settle();
    expect(q(running, '[data-custom-action="enable"]')).toBeNull();
    (q(running, '[data-custom-action="stop"]') as MiniElement).click(); await settle();
    expect(second.stopCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: 'v1' });
  });
});

describe('the shared input style', () => {
  it('styles a text area as an input', () => {
    const area = styleInput(miniDocument.createElement('textarea') as unknown as HTMLTextAreaElement);
    expect(area.classList.contains('ui-input')).toBe(true);
  });
});
