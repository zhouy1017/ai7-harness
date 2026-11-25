import { createBaselineRelations } from '../support/baseline-relations.js';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCustomAnalysisTab } from '../../src/renderer/custom-analysis.js';
import { CUSTOM_TAB_STOPPED } from '../../src/renderer/custom-analysis-labels.js';
import { mountHouseWordList } from '../../src/renderer/house-word-list.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { styleInput } from '../../src/renderer/components/controls.js';
import { HouseWordLists, HOUSE_WORD_LIST_SCHEMA_SQL } from '../../src/service/review/house-word-list.js';
import type { HouseWordListApi } from '../../src/shared/protocol/house-word-list.js';
import type { CustomAnalysisDimensionProjection, CustomAnalysisDimensionsProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Issue #1543 review: the three states of 本社词表's page, where focus goes after each step, every sentence the word list and the
// in-place dimension flow say in ordinary mode, a form kept per Book, and 停用 on the card itself.

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
    const db = new DatabaseSync(':memory:'); createBaselineRelations(db, HOUSE_WORD_LIST_SCHEMA_SQL);
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
    const db = new DatabaseSync(':memory:'); createBaselineRelations(db, HOUSE_WORD_LIST_SCHEMA_SQL);
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
      await press('[data-house-action="edit"]');
      const pasteBox = q(root, '[data-house-field="paste"]') as MiniElement; pasteBox.value = ' 甲'; pasteBox.dispatchEvent({ type: 'input' });
      await press('[data-house-action="accept-paste"]'); expect(active()).toBe(q(root, '[data-house-field="paste"]'));
      const messages = setStatus.mock.calls.map(([message]) => String(message));
      expect(messages).toEqual(expect.arrayContaining(['已保存本社词表。', '词条没有变化，本社词表保持原样。']));
      for (const message of messages) plain(message);
      plain(root.textContent);
    } finally { panel.destroy(); db.close(); }
  });

  it('names a read that failed after a save, and every refusal, in ordinary words', async () => {
    const db = new DatabaseSync(':memory:'); createBaselineRelations(db, HOUSE_WORD_LIST_SCHEMA_SQL);
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
    const db = new DatabaseSync(':memory:'); createBaselineRelations(db, HOUSE_WORD_LIST_SCHEMA_SQL);
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

describe('本社词表: the fold and the pager keep the place of the editor', () => {
  it('keeps the history fold open across a paint and hands a pager at its boundary to its other button, never to 保存', async () => {
    const db = new DatabaseSync(':memory:'); createBaselineRelations(db, HOUSE_WORD_LIST_SCHEMA_SQL);
    const owner = new HouseWordLists(db);
    owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: Array.from({ length: 53 }, (_, index) => entry(`词${index}`)) });
    const first = owner.inspect().current!;
    owner.save({ expectedCurrent: { versionId: first.versionId, digest: first.digest }, sourceKind: 'editor-entry', entries: [entry('词0')] });
    const root = miniDocument.createElement('div'); miniDocument.body.append(root);
    const panel = mountHouseWordList({ root: root as unknown as HTMLElement, api: { inspectHouseWordList: async (value) => owner.inspect(value), saveHouseWordList: async (value) => owner.save(value) }, setStatus: vi.fn() });
    try {
      await panel.load();
      const fold = q(root, 'details.house-history') ?? qa(root, 'details').find((node) => node.className.includes('house-history'))!;
      fold.open = true; fold.dispatchEvent({ type: 'toggle' });
      const row = qa(root, 'button').find((node) => /^history-[0-9]+$/.test(node.dataset['houseAction'] ?? ''))!;
      row.click(); await settle();
      expect(qa(root, 'details').find((node) => node.className.includes('house-history'))!.open).toBe(true);
      expect(active()).toBe(q(root, '[data-house-action="current"]'));
      (q(root, '[data-house-action="current"]') as MiniElement).click(); await settle();
      (q(root, '[data-house-action="edit"]') as MiniElement).click(); await settle();
    } finally { panel.destroy(); }
    // A draft of more than one page: 下一页 onto the last page leaves focus on 上一页, so one more Enter does not save.
    const long = miniDocument.createElement('div'); miniDocument.body.append(long);
    owner.save({ expectedCurrent: { versionId: owner.inspect().current!.versionId, digest: owner.inspect().current!.digest }, sourceKind: 'editor-entry', entries: Array.from({ length: 53 }, (_, index) => entry(`新词${index}`)) });
    const second = mountHouseWordList({ root: long as unknown as HTMLElement, api: { inspectHouseWordList: async (value) => owner.inspect(value), saveHouseWordList: async (value) => owner.save(value) }, setStatus: vi.fn() });
    try {
      await second.load();
      (q(long, '[data-house-action="edit"]') as MiniElement).click(); await settle();
      (q(long, '[data-house-action="draft-next"]') as MiniElement).click();
      expect(active()).toBe(q(long, '[data-house-action="draft-previous"]'));
      (q(long, '[data-house-action="draft-previous"]') as MiniElement).click();
      expect(active()).toBe(q(long, '[data-house-action="draft-next"]'));
    } finally { second.destroy(); db.close(); }
  });
});

describe('分析 › 自定义 in ordinary words, with a form that is kept and a card that can be stopped', () => {
  const BOOK = '11111111-1111-4111-8111-111111111111';
  const FIXED = { answerSchema: {} as never, authorityCeiling: {} as never };
  const version = (state: 'enabled' | 'stopped'): CustomAnalysisDimensionProjection['versions'][number] => ({
    versionId: 'v1', version: 1, title: '人物出场', questionTemplate: '问？', documentDigest: 'd'.repeat(64), supersedes: null, state,
    stateLabel: state === 'enabled' ? '已启用' : '已停用', createdAt: '2026-11-01T00:00:00.000Z', stateRecordedAt: '2026-11-01T00:00:00.000Z', taskCount: 1 });
  /** What the service lists: a dimension with an enabled version, or a stopped one only because it ran on the Book. */
  const dimension = (state: 'enabled' | 'stopped'): CustomAnalysisDimensionProjection => ({
    dimensionId: '22222222-2222-4222-8222-222222222222', kind: 'custom-analysis/x', title: '人物出场',
    enabledVersion: state === 'enabled' ? { versionId: 'v1', version: 1 } : null, versions: [version(state)], versionsTruncated: false,
    book: { taskState: { taskIntentId: 't1', state: 'settled', stateLabel: '已完成' }, latest: null,
      unavailableReason: state === 'enabled' ? null : '这个维度没有已启用的版本；在「知识库 › 工序与规则 › 自定义分析维度」中启用一个版本后才能运行。' } });
  const list = (...dimensions: CustomAnalysisDimensionProjection[]): CustomAnalysisDimensionsProjection => ({ bookId: BOOK, dimensions, truncated: false, fixed: FIXED });
  const mount = (reading: () => CustomAnalysisDimensionsProjection, saved?: () => CustomAnalysisDimensionsProjection) => {
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => reading()),
      saveCustomAnalysisDimension: vi.fn(async () => saved!()),
      enableCustomAnalysisDimension: vi.fn(), stopCustomAnalysisDimension: vi.fn(async () => list(dimension('stopped'))),
    };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    const setStatus = vi.fn();
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus, errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    return { panel, api, setStatus };
  };

  it('says nothing technical with the form open or a card drawn', async () => {
    const { panel } = mount(() => list());
    await settle();
    (q(panel, '[data-custom-action="create"]') as MiniElement).click();
    plain(panel.textContent);
    (q(panel, '[data-custom-action="cancel"]') as MiniElement).click();
    const { panel: listed } = mount(() => list(dimension('enabled')));
    await settle();
    plain(listed.textContent);
  });

  it('puts focus on the new card once a dimension is saved and enabled', async () => {
    let reading = list();
    const { panel } = mount(() => reading, () => { reading = list(dimension('enabled')); return reading; });
    await settle();
    (q(panel, '[data-custom-action="create"]') as MiniElement).click();
    expect(active()).toBe(q(panel, 'input[name="title"]'));
    const form = q(panel, '[data-custom-form="new"]')!;
    (form.querySelector('input') as MiniElement).value = '人物出场'; (form.querySelector('textarea') as MiniElement).value = '问？';
    form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
    expect(active()).toBe(q(panel, '.custom-dimension-card'));
  });

  it('keeps the form with its text and its field when the tab is drawn again, and drops it once saved or cancelled', async () => {
    const { panel } = mount(() => list());
    await settle();
    (q(panel, '[data-custom-action="create"]') as MiniElement).click();
    const title = q(panel, 'input[name="title"]') as MiniElement; title.value = '人物出场'; title.dispatchEvent({ type: 'input' });
    const template = q(panel, 'textarea[name="questionTemplate"]') as MiniElement; template.focus(); template.value = '本部分有哪些人物？'; template.dispatchEvent({ type: 'input' });
    (template as unknown as { dispatchEvent(event: { type: string }): void }).dispatchEvent({ type: 'focus' });
    // The card is drawn again (its follower or a direct draw): a new tab over the same Book finds the form as it was.
    panel.remove(); miniDocument.activeElement = null;
    const { panel: again } = mount(() => list());
    await settle();
    expect(q(again, '[data-custom-form="new"] input[name="title"]')!.value).toBe('人物出场');
    expect(q(again, '[data-custom-form="new"] textarea[name="questionTemplate"]')!.value).toBe('本部分有哪些人物？');
    expect(active()).toBe(q(again, 'textarea[name="questionTemplate"]'));
    (q(again, '[data-custom-action="cancel"]') as MiniElement).click();
    const { panel: last } = mount(() => list());
    await settle();
    expect(q(last, '[data-custom-form="new"]')).toBeNull();
  });

  it('says what to do next for a stopped dimension, and asks once before stopping one for every Book', async () => {
    const stopped = mount(() => list(dimension('stopped')));
    await settle();
    expect(q(stopped.panel, '.custom-unavailable')!.textContent).toBe(CUSTOM_TAB_STOPPED);
    expect(stopped.panel.textContent).not.toContain('知识库'); expect(stopped.panel.textContent).not.toContain('工序与规则');
    expect(q(stopped.panel, '[data-custom-action="stop"]')).toBeNull(); expect(q(stopped.panel, '[data-custom-action="enable"]')).toBeNull();
    const ask = vi.fn((_question: string) => false);
    vi.stubGlobal('confirm', ask);
    try {
      const running = mount(() => list(dimension('enabled')));
      await settle();
      (q(running.panel, '[data-custom-action="stop"]') as MiniElement).click(); await settle();
      expect(ask).toHaveBeenCalledOnce(); expect(ask.mock.calls[0]![0]).toContain('所有图书'); expect(ask.mock.calls[0]![0]).toContain('不能撤销');
      expect(running.api.stopCustomAnalysisDimension).not.toHaveBeenCalled();
      ask.mockReturnValue(true);
      (q(running.panel, '[data-custom-action="stop"]') as MiniElement).click(); await settle();
      expect(running.api.stopCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: 'v1' });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('停用 in place continues with the offer, and a press while it is out asks nothing', () => {
  it('focuses the offer to write another once the stopped card is gone, and does not ask twice while the stop is out', async () => {
    let reading: CustomAnalysisDimensionsProjection = { bookId: '11111111-1111-4111-8111-111111111111', truncated: false, fixed: { answerSchema: {} as never, authorityCeiling: {} as never }, dimensions: [{
      dimensionId: '22222222-2222-4222-8222-222222222222', kind: 'custom-analysis/x', title: '人物出场', enabledVersion: { versionId: 'v1', version: 1 }, versionsTruncated: false,
      versions: [{ versionId: 'v1', version: 1, title: '人物出场', questionTemplate: '问？', documentDigest: 'd'.repeat(64), supersedes: null, state: 'enabled', stateLabel: '已启用', createdAt: '2026-11-01T00:00:00.000Z', stateRecordedAt: '2026-11-01T00:00:00.000Z', taskCount: 0 }],
      book: { taskState: null, latest: null, unavailableReason: null } }] };
    const release = Promise.withResolvers<void>();
    const api = { inspectCustomAnalysisDimensions: vi.fn(async () => reading), saveCustomAnalysisDimension: vi.fn(), enableCustomAnalysisDimension: vi.fn(),
      stopCustomAnalysisDimension: vi.fn(async () => { await release.promise; reading = { ...reading, dimensions: [] }; return reading; }) };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: '11111111-1111-4111-8111-111111111111', api, author: { api }, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    const ask = vi.fn((_question: string) => true);
    vi.stubGlobal('confirm', ask);
    try {
      await settle();
      const stop = q(panel, '[data-custom-action="stop"]') as MiniElement;
      stop.click(); stop.click(); await settle();
      expect(ask).toHaveBeenCalledOnce(); expect(api.stopCustomAnalysisDimension).toHaveBeenCalledOnce();
      release.resolve(); await settle();
      expect(q(panel, '.custom-dimension-card')).toBeNull();
      expect(active()).toBe(q(panel, '[data-custom-action="create"]'));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('the shared input style', () => {
  it('styles a text area as an input', () => {
    const area = styleInput(miniDocument.createElement('textarea') as unknown as HTMLTextAreaElement);
    expect(area.classList.contains('ui-input')).toBe(true);
  });
});
