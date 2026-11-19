import { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEvaluationCalibration } from '../../src/renderer/evaluation-calibration.js';
import { CALIBRATION_METHOD, CALIBRATION_PAGE_LEDE } from '../../src/renderer/evaluation-calibration-labels.js';
import { mountHouseWordList } from '../../src/renderer/house-word-list.js';
import { houseSavedAt } from '../../src/renderer/house-word-list-labels.js';
import { mountCustomAnalysisTab } from '../../src/renderer/custom-analysis.js';
import { visibleKnowledgeBaseTabs } from '../../src/renderer/knowledge-base-labels.js';
import { SETTINGS_HUB_GROUPS } from '../../src/renderer/shell-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { HouseWordLists, initializeHouseWordListSchema } from '../../src/service/review/house-word-list.js';
import type { HouseWordListApi } from '../../src/shared/protocol/house-word-list.js';
import type { CustomAnalysisDimensionProjection, CustomAnalysisDimensionsProjection, EvaluationCalibrationProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Issue #1543: the three places newly open to ordinary editors — 评估校准与预测, 本社词表 and 分析 › 自定义 — read as ordinary pages. The
// ordinary-mode text carries no 「版本」 without a date, no `v` + digits, no KiB, no 「身份」, and the calibration formula only inside
// its folded 怎么算的.

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { setTechnicalLayerVisible(true); uninstall(); });

const PLAIN_WORDS = [/(?<!发稿)版本/u, /\bv\d/u, /KiB/u, /身份/u, /AI7 初评/u, /敏感词表|自用词表/u];
function expectOrdinaryWords(text: string): void {
  for (const pattern of PLAIN_WORDS) expect(pattern.test(text), `${pattern.source} in ${text}`).toBe(false);
}
const settle = async (): Promise<void> => { for (let index = 0; index < 8; index += 1) await setImmediate(); };

function calibration(overrides: Partial<EvaluationCalibrationProjection['calibration']> = {}): EvaluationCalibrationProjection {
  return {
    calibration: { adjustments: 12, unreadableBooks: 0, initialScoresConnected: true, threshold: 10, enabled: true, active: true,
      offset: { basisBooks: 12, booksWithoutBasis: 1, items: [{ itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20, offset: 0.5, books: 12 }] }, ...overrides },
    prediction: { booksWithActuals: 3, threshold: 30, enabled: false, available: false },
    preferenceEntries: 1,
    books: [{ bookId: 'b1', title: '合成书', publicationVersionId: 'p1', publicationOrdinal: 1, designatedAt: '2026-11-01T00:00:00.000Z', actuals: null, entries: 0 }],
    nextCursor: { title: '合成书', bookId: 'b1' }, focusedBook: null,
  };
}

describe('评估校准与预测 for an ordinary editor', () => {
  it('opens on the editors\' sentence, one sentence of state per section, and keeps the formula inside 怎么算的', async () => {
    const root = document.createElement('div'); document.body.append(root);
    const read = vi.fn(async () => calibration());
    const surface = mountEvaluationCalibration({ root, focusBookId: null, api: { inspectEvaluationCalibration: read, recordPublicationActuals: vi.fn(), setEvaluationPreferences: vi.fn() },
      setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback });
    await surface.load();
    expect(root.querySelector('.calibration-lede')?.textContent).toBe(CALIBRATION_PAGE_LEDE);
    expect(root.firstElementChild?.textContent).toBe(CALIBRATION_PAGE_LEDE);
    expectOrdinaryWords(root.textContent);
    // The formula is stated once, inside the fold, and nowhere else.
    const folds = root.querySelectorAll('.calibration-how');
    expect(folds).toHaveLength(2);
    expect(folds.filter((fold) => fold.textContent.includes('校准偏移 =')).map((fold) => fold.textContent.includes(CALIBRATION_METHOD))).toEqual([true]);
    expect(root.querySelector('.calibration-calibration')?.querySelector('summary')?.textContent).toBe('怎么算的');
    const outside = root.textContent.replace(CALIBRATION_METHOD, '');
    expect(outside).not.toContain('校准偏移 =');
    // The per-item offsets stay in view, the state is one line, and the switch carries the shared checkbox style.
    expect(root.querySelectorAll('.calibration-offset-list li')).toHaveLength(1);
    expect(root.querySelector('.calibration-progress')?.textContent).toBe('调分记录 12 / 10 本 · 已生效');
    expect(root.querySelector('[data-calibration-switch="calibration"]')?.className).toContain('ui-checkbox');
  });

  it('pages the Books as two text buttons, the page before and the page after', async () => {
    const root = document.createElement('div'); document.body.append(root);
    const first = calibration(); const second = { ...calibration(), nextCursor: null, books: [{ ...calibration().books[0]!, bookId: 'b2', title: '合成书二' }] };
    const read = vi.fn(async (input?: { after: unknown }) => input?.after === null || input === undefined ? first : second);
    const surface = mountEvaluationCalibration({ root, focusBookId: null, api: { inspectEvaluationCalibration: read as never, recordPublicationActuals: vi.fn(), setEvaluationPreferences: vi.fn() },
      setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback });
    await surface.load();
    const button = (name: string): MiniElement => root.querySelector(`[data-calibration-action="${name}"]`) as MiniElement;
    expect([button('previous').textContent, button('next').textContent]).toEqual(['上一页', '下一页']);
    expect([button('previous').disabled, button('next').disabled]).toEqual([true, false]);
    button('next').click(); await settle();
    expect(root.querySelectorAll('li.calibration-book').map((item) => item.dataset['bookId'])).toEqual(['b2']);
    expect([button('previous').disabled, button('next').disabled]).toEqual([false, true]);
    button('previous').click(); await settle();
    expect(root.querySelectorAll('li.calibration-book').map((item) => item.dataset['bookId'])).toEqual(['b1']);
    expect(read).toHaveBeenLastCalledWith({ after: null, focusBookId: null });
  });

  it('is an ordinary settings row, and 编辑工作 is no empty heading', () => {
    const row = SETTINGS_HUB_GROUPS.flatMap((group) => group.rows).find((entry) => entry.route === 'evaluation-calibration');
    expect(row?.developerOnly).toBeUndefined();
    const editorial = SETTINGS_HUB_GROUPS.find((group) => group.key === 'editorial')!;
    expect(editorial.rows.filter((entry) => entry.developerOnly !== true).map((entry) => entry.label)).toEqual(['评估校准与预测']);
  });
});

describe('本社词表 for an ordinary editor', () => {
  const entry = (literal: string, note = '') => ({ entryId: null, literal, note, enabled: true });
  const mount = (api: HouseWordListApi) => {
    const root = document.createElement('div'); document.body.append(root);
    return { root, panel: mountHouseWordList({ root, api, setStatus: vi.fn() }) };
  };
  const click = async (name: string): Promise<void> => { (miniDocument.body.querySelector(`[data-house-action="${name}"]`) as MiniElement).click(); await settle(); };

  it('says one name, shows only what applies in each state, and words every state without a bare 版本', async () => {
    const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
    const owner = new HouseWordLists(db);
    const { root, panel } = mount({ inspectHouseWordList: async (value) => owner.inspect(value), saveHouseWordList: async (value) => owner.save(value) });
    try {
      await panel.load();
      // Nothing saved: one primary action, no history and no way to view a current list.
      expect(root.querySelectorAll('button').map((node) => node.textContent)).toEqual(['创建词表']);
      expectOrdinaryWords(root.textContent);
      await click('edit');
      // The draft is a grid of rows under three headings, each with its own 移除, and one primary action: 保存.
      (miniDocument.body.querySelector('[data-house-action="add"]') as MiniElement).click();
      expect(root.querySelector('.house-row-head')?.textContent).toBe('词条说明启用');
      expect(root.querySelectorAll('[data-house-entry-row]')).toHaveLength(1);
      expect(root.querySelector('[data-house-entry-row] [data-house-action="remove-0"]')?.textContent).toBe('移除');
      const literal = miniDocument.body.querySelector('[data-house-field="literal"]') as MiniElement;
      literal.value = '合成甲'; literal.dispatchEvent({ type: 'input' });
      expect(root.querySelectorAll('button.primary').map((node) => node.textContent)).toEqual(['保存']);
      expectOrdinaryWords(root.textContent);
      // An error in an editor's words: a refused paste names its row and none of the limits' units.
      const paste = miniDocument.body.querySelector('[data-house-field="paste"]') as MiniElement;
      paste.value = ' 甲'; paste.dispatchEvent({ type: 'input' }); await click('accept-paste');
      expect(root.querySelector('[data-house-paste-preview]')?.textContent ?? root.textContent).toContain('第1行');
      expectOrdinaryWords(root.textContent);
      paste.value = '合成乙\n合成丙'; paste.dispatchEvent({ type: 'input' }); await click('accept-paste');
      await click('save');
      // Saved once: named by its date and time with the entry count; no history of one.
      const line = root.textContent;
      expect(line).toContain(houseSavedAt(owner.inspect().selected!.createdAt)); expect(line).toContain('3 条，启用 3 条');
      expect(root.textContent).not.toContain('以前保存的词表');
      expect(root.querySelectorAll('button.primary').map((node) => node.textContent)).toEqual(['编辑']);
      expectOrdinaryWords(root.textContent);
      // Saved twice: the earlier list is a row named by date and time with its count.
      await click('edit');
      (miniDocument.body.querySelector('[data-house-field="literal"]') as MiniElement).value = '合成丁';
      (miniDocument.body.querySelector('[data-house-field="literal"]') as MiniElement).dispatchEvent({ type: 'input' });
      await click('save');
      const rows = root.querySelectorAll('button').filter((node) => /^history-[0-9]+$/.test(node.dataset['houseAction'] ?? ''));
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.textContent).toMatch(/月 \d+ 日 \d\d:\d\d · 3 条/u);
      expectOrdinaryWords(root.textContent);
    } finally { panel.destroy(); db.close(); }
  });

  it('is a category of 知识库 for an ordinary editor', () => {
    expect(visibleKnowledgeBaseTabs(false).map((view) => view.label)).toContain('本社词表');
  });
});

describe('分析 › 自定义 writes a dimension in place', () => {
  const BOOK = '11111111-1111-4111-8111-111111111111';
  const FIXED = { answerSchema: {} as never, authorityCeiling: {} as never };
  const none = (): CustomAnalysisDimensionsProjection => ({ bookId: BOOK, dimensions: [], truncated: false, fixed: FIXED });
  const enabled = (title: string): CustomAnalysisDimensionProjection => ({
    dimensionId: '22222222-2222-4222-8222-222222222222', kind: 'custom-analysis/x', title, enabledVersion: { versionId: 'v1', version: 1 },
    versions: [{ versionId: 'v1', version: 1, title, questionTemplate: '问？', documentDigest: 'd'.repeat(64), supersedes: null, state: 'enabled', stateLabel: '已启用',
      createdAt: '2026-11-01T00:00:00.000Z', stateRecordedAt: '2026-11-01T00:00:00.000Z', taskCount: 0 }],
    versionsTruncated: false, book: { taskState: null, latest: null, unavailableReason: null },
  });

  it('offers 新建自定义分析维度… in the empty state, opens the form there, and shows the new card once saved', async () => {
    let listed = none();
    const pending = { ...enabled('人物出场').versions[0]!, state: 'pending-validation' as const, stateLabel: '待验证' };
    const saved: CustomAnalysisDimensionsProjection = { ...none(), bookId: null, dimensions: [{ ...enabled('人物出场'), versions: [pending] }] };
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => listed),
      saveCustomAnalysisDimension: vi.fn(async () => saved),
      enableCustomAnalysisDimension: vi.fn(async () => { listed = { ...none(), dimensions: [enabled('人物出场')] }; return listed; }),
      stopCustomAnalysisDimension: vi.fn(),
    };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    const setStatus = vi.fn();
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus, errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    await settle();
    const empty = panel.querySelector('[data-custom-empty="no-dimension"]')!;
    expect(empty.textContent).not.toContain('知识库'); expect(empty.textContent).not.toContain('工序与规则');
    const create = empty.querySelector('[data-custom-action="create"]') as MiniElement;
    expect(create.textContent).toBe('新建自定义分析维度…'); expect(create.className).toContain('primary');
    create.click();
    const form = panel.querySelector('[data-custom-form="new"]')!;
    expect(form).not.toBeNull(); expect(panel.querySelector('[data-custom-action="create"]')).toBeNull();
    (form.querySelector('input') as MiniElement).value = '人物出场';
    (form.querySelector('textarea') as MiniElement).value = '本部分有哪些人物出场？';
    form.dispatchEvent({ type: 'submit', preventDefault() {} });
    await settle();
    expect(api.saveCustomAnalysisDimension).toHaveBeenCalledWith({ dimensionId: null, title: '人物出场', questionTemplate: '本部分有哪些人物出场？' });
    expect(api.enableCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: 'v1' });
    expect(panel.querySelector('[data-custom-form="new"]')).toBeNull();
    expect(panel.querySelector('.custom-dimension-card h3')?.textContent).toBe('人物出场');
    expect(setStatus).toHaveBeenLastCalledWith('已保存并启用「人物出场」，可在分析中运行。', 'success');
    // With a card on the page the offer stands above the list, as a secondary action.
    expect(panel.querySelector('.custom-head [data-custom-action="create"]')?.className).toContain('secondary');
  });

  it('writes onto the version it already saved when enabling was refused, never a second dimension', async () => {
    const pending = { ...enabled('人物出场').versions[0]!, state: 'pending-validation' as const, stateLabel: '待验证' };
    const saved: CustomAnalysisDimensionsProjection = { ...none(), bookId: null, dimensions: [{ ...enabled('人物出场'), versions: [pending] }] };
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => none()),
      saveCustomAnalysisDimension: vi.fn(async () => saved),
      enableCustomAnalysisDimension: vi.fn(async () => { throw new Error('refused'); }),
      stopCustomAnalysisDimension: vi.fn(),
    };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    await settle();
    (panel.querySelector('[data-custom-action="create"]') as MiniElement).click();
    const form = panel.querySelector('[data-custom-form="new"]')!;
    (form.querySelector('input') as MiniElement).value = '人物出场';
    (form.querySelector('textarea') as MiniElement).value = '问？';
    form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
    // The form stays open; its next try names the dimension saved.
    expect(panel.querySelector('[data-custom-form="new"]')).not.toBeNull();
    form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
    expect(api.saveCustomAnalysisDimension).toHaveBeenLastCalledWith({ dimensionId: '22222222-2222-4222-8222-222222222222', title: '人物出场', questionTemplate: '问？' });
  });

  it('cancelling closes the form and gives the offer back', async () => {
    const api = { inspectCustomAnalysisDimensions: vi.fn(async () => none()), saveCustomAnalysisDimension: vi.fn(), enableCustomAnalysisDimension: vi.fn(), stopCustomAnalysisDimension: vi.fn() };
    const panel = miniDocument.createElement('section'); miniDocument.body.append(panel);
    mountCustomAnalysisTab(panel as unknown as HTMLElement, { bookId: BOOK, api, author: { api }, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openLaunch: vi.fn(), openPlan: vi.fn(), jump: vi.fn() });
    await settle();
    (panel.querySelector('[data-custom-action="create"]') as MiniElement).click();
    (panel.querySelector('[data-custom-action="cancel"]') as MiniElement).click();
    expect(panel.querySelector('[data-custom-form="new"]')).toBeNull();
    expect(panel.querySelector('[data-custom-action="create"]')).not.toBeNull();
    expect(api.saveCustomAnalysisDimension).not.toHaveBeenCalled();
  });
});
