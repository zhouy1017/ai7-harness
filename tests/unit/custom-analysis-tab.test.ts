import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCustomAnalysisDimensions, mountCustomAnalysisTab, ANALYSIS_TAB_SHOWN_EVENT } from '../../src/renderer/custom-analysis.js';
import { CUSTOM_TAB_EMPTY, CUSTOM_TAB_FEEDBACK_NOTE, CUSTOM_TAB_NOT_RUN, CUSTOM_TAB_PREPARED, customRowAnchorLabel, customTabCountsLine } from '../../src/renderer/custom-analysis-labels.js';
import { CUSTOM_DIMENSIONS_HEADING, CUSTOM_DIMENSION_FIXED_LINES, customDimensionVersionLine } from '../../src/renderer/knowledge-base-labels.js';
import type { CustomAnalysisDimensionProjection, CustomAnalysisDimensionsProjection, CustomAnalysisRevisionSummaryProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Issue #922 (slice 7f): ②A's 自定义 tab and 知识库 › 工序与规则 › 自定义分析维度 on a minimal DOM — the empty states, a listed
// dimension with its latest result and per-unit rows whose quotations jump to the manuscript, 运行 opening the prepared plan, and
// the house's versions with 验证并启用 and 停用. No service: the renderer API is a stub.

const BOOK = '11111111-1111-4111-8111-111111111111';
const DIMENSION = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const BLOCK = `blk_${'a'.repeat(24)}`;
const FIXED = { answerSchema: {} as never, authorityCeiling: {} as never };

let uninstall: () => void;
let book = 0;
beforeEach(() => {
  uninstall = installMiniDom();
  book += 1;
});
afterEach(() => uninstall());

const bookId = (): string => `${BOOK.slice(0, -2)}${String(book).padStart(2, '0')}`;

function revision(): CustomAnalysisRevisionSummaryProjection {
  return {
    revisionId: '44444444-4444-4444-8444-444444444444', ordinal: 1, createdAt: '2026-10-17T00:00:00.000Z',
    dimensionVersion: { versionId: VERSION, version: 1, documentDigest: 'd'.repeat(64) }, manuscriptRevisionLabel: 'r1',
    coverage: { axis: 'coverage', state: 'partial', label: '覆盖：部分 · 1/2 单元 · 1 处缺口', unitsTotal: 2, unitsClosed: 1, unitsReused: 0, gapCount: 1 },
    freshness: { axis: 'freshness', state: 'current', label: '新鲜度：当前', boundRevisionId: 'x', boundRevisionDigest: 'y', currentRevisionId: 'x', currentWorkingDigest: 'z', currentJournalSequence: 0, comparison: 'local-deterministic' },
    gaps: [{ unitOrdinal: 2, code: 'adapter-failure', reason: '合成失败。' }],
    rowCounts: { units: 1, rows: 2, located: 1, unlocated: 1 },
    rows: [
      { rowId: 'car_1', unitOrdinal: 1, answer: '本单元从一封信写起。', confidenceNote: '依据充分。', blockOrdinal: 2, quote: '收到一封信', sourceRange: { blockId: BLOCK, fromGrapheme: 5, toGrapheme: 10 }, anchorState: 'located' },
      { rowId: 'car_2', unitOrdinal: 1, answer: '开篇有雷声。', confidenceNote: '引文是改写。', blockOrdinal: 2, quote: '雷雨大作', sourceRange: null, anchorState: 'not-found' },
    ],
    rowsTruncated: false,
  };
}

function dimension(book: CustomAnalysisDimensionProjection['book']): CustomAnalysisDimensionProjection {
  return {
    dimensionId: DIMENSION, kind: `custom-analysis/${DIMENSION}`, title: '单元开篇', enabledVersion: { versionId: VERSION, version: 1 },
    versions: [{ versionId: VERSION, version: 1, title: '单元开篇', questionTemplate: '{本单元}从哪里写起？', documentDigest: 'd'.repeat(64), supersedes: null,
      state: 'enabled', stateLabel: '已启用', createdAt: '2026-10-17T00:00:00.000Z', stateRecordedAt: '2026-10-17T00:00:00.000Z', taskCount: 0 }],
    versionsTruncated: false,
    book,
  };
}

const projection = (dimensions: CustomAnalysisDimensionProjection[], forBook = true): CustomAnalysisDimensionsProjection =>
  ({ bookId: forBook ? bookId() : null, dimensions, truncated: false, fixed: FIXED });

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function mountTab(reading: CustomAnalysisDimensionsProjection) {
  const panel = miniDocument.createElement('section');
  miniDocument.body.append(panel);
  const api = {
    inspectCustomAnalysisDimensions: vi.fn(async () => reading),
    prepareCustomAnalysis: vi.fn(async () => ({ taskIntentId: '55555555-5555-4555-8555-555555555555', dimensions: reading })),
  };
  const options = { bookId: bookId(), api, setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback, openPlan: vi.fn(), jump: vi.fn() };
  mountCustomAnalysisTab(panel as unknown as HTMLElement, options);
  return { panel, api, options };
}

describe('②A › 自定义', () => {
  it('says 尚无自定义分析维度 when the house has none enabled', async () => {
    const { panel, api } = mountTab(projection([]));
    await settle();
    expect(api.inspectCustomAnalysisDimensions).toHaveBeenCalledWith({ forBook: true });
    expect(panel.dataset['customAnalysis']).toBe('ready');
    expect(panel.querySelector('[data-custom-empty="no-dimension"]')?.textContent).toContain(CUSTOM_TAB_EMPTY);
    expect(panel.querySelectorAll('button')).toHaveLength(0);
  });

  it('lists an enabled dimension that has not run as 尚未运行, and 运行 prepares its first Task and opens the plan', async () => {
    const { panel, api, options } = mountTab(projection([dimension({ taskState: null, latest: null, unavailableReason: null })]));
    await settle();
    const card = panel.querySelector(`[data-dimension-id="${DIMENSION}"]`)!;
    expect(card.querySelector('[data-custom-empty="not-run"]')?.textContent).toBe(CUSTOM_TAB_NOT_RUN);
    const run = card.querySelector('[data-analysis-action="custom-run"]') as MiniElement;
    expect(run.disabled).toBe(false);
    run.click();
    await settle();
    expect(api.prepareCustomAnalysis).toHaveBeenCalledWith({ dimensionId: DIMENSION, update: null });
    expect(options.openPlan).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(options.setStatus).toHaveBeenLastCalledWith(CUSTOM_TAB_PREPARED, 'success');
  });

  it('shows the latest result: axes, gaps, rows with a located quotation as a jump link and an unlocated one said so', async () => {
    const latest = revision();
    const { panel, api, options } = mountTab(projection([dimension({
      taskState: { taskIntentId: '66666666-6666-4666-8666-666666666666', state: 'settled', stateLabel: '已完成' }, latest, unavailableReason: null,
    })]));
    await settle();
    const section = panel.querySelector('.custom-revision')!;
    expect(section.dataset['freshness']).toBe('current');
    expect(section.textContent).toContain(latest.coverage.label);
    expect(section.textContent).toContain(customTabCountsLine(latest.rowCounts));
    expect(section.querySelector('[data-gap-unit="2"]')).not.toBeNull();
    const rows = panel.querySelectorAll('.custom-row');
    expect(rows.map((row) => row.dataset['anchorState'])).toEqual(['located', 'not-found']);
    const jump = rows[0]!.querySelector('[data-analysis-action="custom-jump"]') as MiniElement;
    expect(jump.textContent).toBe(customRowAnchorLabel(latest.rows[0]!));
    jump.click();
    expect(options.jump).toHaveBeenCalledWith(BLOCK);
    expect(rows[1]!.querySelector('button')).toBeNull();
    expect(rows[1]!.textContent).toContain('未定位');
    expect(section.textContent).toContain(CUSTOM_TAB_FEEDBACK_NOTE);
    // A result that still reads the current manuscript is read again whole.
    (panel.querySelector('[data-analysis-action="custom-run"]') as MiniElement).click();
    await settle();
    expect(api.prepareCustomAnalysis).toHaveBeenCalledWith({ dimensionId: DIMENSION, update: { mode: 'reanalyze-book', selectedRange: null } });
    (panel.querySelector('[data-analysis-action="custom-open-plan"]') as MiniElement).click();
    expect(options.openPlan).toHaveBeenLastCalledWith('66666666-6666-4666-8666-666666666666');
  });

  it('withholds 运行 with its reason, and reads again when the tab is shown', async () => {
    const { panel, api } = mountTab(projection([dimension({ taskState: null, latest: null, unavailableReason: '这个维度没有已启用的版本。' })]));
    await settle();
    expect((panel.querySelector('[data-analysis-action="custom-run"]') as MiniElement).disabled).toBe(true);
    expect(panel.querySelector('.custom-unavailable')?.textContent).toBe('这个维度没有已启用的版本。');
    panel.dispatchEvent({ type: ANALYSIS_TAB_SHOWN_EVENT });
    await settle();
    expect(api.inspectCustomAnalysisDimensions).toHaveBeenCalledTimes(2);
  });
});

describe('知识库 › 工序与规则 › 自定义分析维度', () => {
  it('states what AI7 fixes, lists each version with its state, and offers 验证并启用 and 停用 by state', async () => {
    const pending = { ...dimension(null).versions[0]!, versionId: '77777777-7777-4777-8777-777777777777', version: 2, state: 'pending-validation' as const, stateLabel: '待验证' };
    const listed = projection([{ ...dimension(null), versions: [pending, dimension(null).versions[0]!] }], false);
    const root = miniDocument.createElement('div');
    miniDocument.body.append(root);
    const api = {
      inspectCustomAnalysisDimensions: vi.fn(async () => listed),
      saveCustomAnalysisDimension: vi.fn(async () => listed),
      enableCustomAnalysisDimension: vi.fn(async () => listed),
      stopCustomAnalysisDimension: vi.fn(async () => listed),
    };
    const surface = mountCustomAnalysisDimensions({
      root: root as unknown as HTMLElement, api, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback,
      technicalDetails: () => miniDocument.createElement('details') as unknown as HTMLElement, localInstantLabel: (instant) => instant,
    });
    await surface.load();
    expect(api.inspectCustomAnalysisDimensions).toHaveBeenCalledWith({ forBook: false });
    expect(root.querySelector('h3')?.textContent).toBe(CUSTOM_DIMENSIONS_HEADING);
    expect(root.querySelectorAll('.custom-dimension-fixed li').map((item) => item.textContent)).toEqual([...CUSTOM_DIMENSION_FIXED_LINES]);
    const versions = root.querySelectorAll('.custom-dimension-version');
    expect(versions.map((item) => item.dataset['versionState'])).toEqual(['pending-validation', 'enabled']);
    expect(versions[0]!.textContent).toContain(customDimensionVersionLine(pending));
    expect(versions[0]!.querySelector('[data-custom-action="enable"]')).not.toBeNull();
    expect(versions[1]!.querySelector('[data-custom-action="enable"]')).toBeNull();
    (versions[0]!.querySelector('[data-custom-action="enable"]') as MiniElement).click();
    await settle();
    expect(api.enableCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: pending.versionId });
    (root.querySelectorAll('.custom-dimension-version')[1]!.querySelector('[data-custom-action="stop"]') as MiniElement).click();
    await settle();
    expect(api.stopCustomAnalysisDimension).toHaveBeenCalledWith({ versionId: VERSION });
    // 新建维度… opens the form; saving sends the trimmed words, the dimension `null` for a new one.
    (root.querySelector('[data-custom-action="new"]') as MiniElement).click();
    const form = root.querySelector('[data-custom-form="new"]')!;
    (form.querySelector('input') as MiniElement).value = ' 人物出场 ';
    (form.querySelector('textarea') as MiniElement).value = '本单元有哪些人物出场？';
    form.dispatchEvent({ type: 'submit', preventDefault() {} });
    await settle();
    expect(api.saveCustomAnalysisDimension).toHaveBeenCalledWith({ dimensionId: null, title: '人物出场', questionTemplate: '本单元有哪些人物出场？' });
  });
});
