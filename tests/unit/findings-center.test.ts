import { expect, it, vi } from 'vitest';
import { mountFindingsCenter } from '../../src/renderer/findings-center.js';
import type { BookFindingsProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { applyFindingBatches } from '../../src/renderer/manuscript-apply.js';
import type { RendererApi } from '../../src/shared/protocol.js';

it('clamps a shrinking final page to its page start after a changed poll (#1383 F3)', async () => {
  const restore = installMiniDom(); vi.useFakeTimers(); vi.stubGlobal('window', { setInterval, clearInterval });
  const root = miniDocument.createElement('section'); miniDocument.body.append(root); let total = 81;
  const items = Array.from({ length: total }, (_, index) => ({ id: String(index), category: 'review', categoryLabel: '审阅', severity: '提示', status: '待处理', summary: '公开合成发现', target: { kind: 'review' as const, reviewRunId: 'run', findingId: String(index), blockId: 'block' } }));
  try {
    mountFindingsCenter(root as unknown as HTMLElement, async (offset) => ({ bookId: 'book', total, offset, pageSize: 40, next: offset + 40 < total ? offset + 40 : null, groups: [{ category: 'review', label: '审阅', count: total, bySeverity: {}, byStatus: {} }], items: items.slice(offset, Math.min(total, offset + 40)) }), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    const rail = root.querySelector('[data-list-position]')!; rail.value = '2'; rail.dispatchEvent({ type: 'change' });
    total = 79; await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelectorAll('[data-finding-id]')).toHaveLength(39);
    expect(root.querySelector('[data-finding-id]')?.dataset['findingId']).toBe('40');
    expect(root.textContent).toContain('41–79 / 79'); expect(root.querySelector('[data-list-position]')?.value).toBe('1');
  } finally { root.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); restore(); }
});

function batchConsumer(refuseLast: boolean, unknownLast = false) {
  const suggestions = Array.from({ length: 501 }, (_, index) => ({ manuscriptId: 'manuscript', branchId: 'branch', markId: `mark-${index}`, blockId: 'block', batchAllowed: true, quote: '合成', replacement: '修订' }));
  const api = { applyChangeSuggestionBatch: vi.fn<RendererApi['applyChangeSuggestionBatch']>(async () => ({} as never)), applyChangeSuggestion: vi.fn<RendererApi['applyChangeSuggestion']>(async () => { if (refuseLast) throw new Error('current Apply wrote nothing'); return {} as never; }),
    reverseAppliedChangeSuggestion: vi.fn<RendererApi['reverseAppliedChangeSuggestion']>(async () => ({} as never)), getManuscriptApplyOutcome: vi.fn<RendererApi['getManuscriptApplyOutcome']>(async () => { if (unknownLast) throw new Error('unavailable'); return { state: 'not-committed', application: null }; }) };
  return { suggestions, api, apply: () => applyFindingBatches(suggestions, api as unknown as Parameters<typeof applyFindingBatches>[1]) };
}

it('applies >500 through bounded requests and reverses every confirmed group in reverse order (#1383 F5)', async () => {
  const { api, apply } = batchConsumer(false); const result = await apply();
  expect(api.applyChangeSuggestionBatch.mock.calls[0]![0].markIds).toHaveLength(500);
  expect(api.applyChangeSuggestion.mock.calls[0]![0].markId).toBe('mark-500');
  expect(result.message).toContain('已接受并应用 501 条');
  const reversed = await result.undo!();
  expect(api.reverseAppliedChangeSuggestion.mock.calls.map(([input]) => input.markId)).toEqual(['mark-500', 'mark-0']);
  expect(reversed.message).toContain('已撤销 501 条'); expect(reversed.undo).toBeUndefined();
});

it('keeps confirmed counts and reversal visible after a later chunk refusal (#1383 F5)', async () => {
  const restore = installMiniDom(); vi.stubGlobal('window', { setInterval: () => 0, clearInterval: vi.fn() });
  const { api, suggestions } = batchConsumer(true); const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  let available = true;
  const read = async (): Promise<BookFindingsProjection> => ({ bookId: 'book', offset: 0, total: available ? 1 : 0, pageSize: 40, next: null, groups: available ? [{ category: 'review', label: '审阅', count: 1, bySeverity: {}, byStatus: {} }] : [], items: available ? [{ id: 'finding', category: 'review', categoryLabel: '审阅', severity: '提示', status: '待处理', summary: '合成', suggestion: suggestions[0]!, target: { kind: 'review', reviewRunId: 'run', findingId: 'finding', blockId: 'block' } }] : [] });
  try {
    mountFindingsCenter(root as unknown as HTMLElement, read, vi.fn(), async () => { available = false; return applyFindingBatches(suggestions, api as unknown as RendererApi); });
    await vi.waitFor(() => expect(root.querySelector('[data-finding-apply]')).not.toBeNull()); root.querySelector('[data-finding-apply]')!.click();
    await vi.waitFor(() => expect(root.querySelector('.findings-apply-feedback')?.textContent).toContain('已接受并应用 500 条；未应用 1 条'));
    expect(root.querySelector('.findings-apply-feedback')!.textContent).not.toContain('current Apply wrote nothing');
    root.querySelector('.findings-apply-feedback button')!.click();
    await vi.waitFor(() => expect(root.querySelector('.findings-apply-feedback')?.textContent).toContain('已撤销 500 条'));
    expect(api.reverseAppliedChangeSuggestion).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); restore(); }
});

it('recovers the same unknown Effect without replaying a failed later chunk (#1383 F5)', async () => {
  const { api, apply } = batchConsumer(true, true); const result = await apply();
  expect(result.message).toContain('已接受并应用 500 条；未应用 0 条；结果待确认 1 条');
  const identity = api.getManuscriptApplyOutcome.mock.calls[0]![0].clientEffectId;
  api.getManuscriptApplyOutcome.mockResolvedValue({ state: 'committed', application: null });
  const recovered = await result.recover!(); expect(recovered.message).toContain('已接受并应用 501 条');
  expect(api.getManuscriptApplyOutcome.mock.calls.at(-1)![0].clientEffectId).toBe(identity);
  expect(api.applyChangeSuggestion).toHaveBeenCalledTimes(1);
});

it('filters the whole book beyond 500, resets position, and retains focus and scroll across two changed polls (#1375, #1383)', async () => {
  const restore = installMiniDom(); vi.useFakeTimers(); setTechnicalLayerVisible(false);
  vi.stubGlobal('window', { setInterval, clearInterval });
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  let tick = 0;
  const items: BookFindingsProjection['items'] = Array.from({ length: 541 }, (_, index) => ({ id: String(index), category: index < 500 ? 'early' : 'late', categoryLabel: '合成类别', severity: index < 500 ? '提示' : '必须处理', status: '待处理', summary: '公开合成发现',
    target: { kind: 'review', reviewRunId: 'run', findingId: String(index), blockId: 'block' }, suggestion: { manuscriptId: 'manuscript', branchId: 'branch', markId: `mark-${index}`, blockId: 'block', batchAllowed: true, quote: '合成', replacement: '修订' } }));
  const read = vi.fn(async (offset: number): Promise<BookFindingsProjection> => ({ bookId: 'book', total: items.length, offset, next: offset + 40 < items.length ? offset + 40 : null, pageSize: 40,
    items: items.slice(offset, offset + 40).map((item) => ({ ...item, summary: `${item.summary}${tick}` })), groups: ['early', 'late'].map((category) => ({ category, label: category, count: category === 'early' ? 500 : 41, bySeverity: { '提示': 500, '必须处理': 41 }, byStatus: { '待处理': 541 } })) }));
  try {
    mountFindingsCenter(root as unknown as HTMLElement, read, vi.fn(), vi.fn()); await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('接受并应用全部 541 条');
    const rail = root.querySelector('[data-list-position]')!; rail.value = '10'; rail.dispatchEvent({ type: 'change' });
    root.querySelector('[data-findings-filter="category"] [data-filter-value="late"]')!.click();
    expect(root.querySelectorAll('[data-finding-id]')).toHaveLength(40);
    expect(root.querySelector('[data-finding-id]')?.dataset['findingId']).toBe('500');
    expect(root.querySelector('[data-list-position]')!.value).toBe('0');
    expect(root.textContent).toContain('1–40 / 41');
    root.querySelector('[data-findings-filter="category"] [data-filter-value="late"]')!.focus(); root.scrollTop = 75;
    for (let cycle = 0; cycle < 2; cycle++) {
      tick++; await vi.advanceTimersByTimeAsync(2000);
      expect(document.activeElement).toBe(root.querySelector('[data-findings-filter="category"] [data-filter-value="late"]'));
      expect(root.scrollTop).toBe(75); expect(root.textContent).toContain(`公开合成发现${tick}`);
    }
    const last = root.querySelector('[data-list-position]')!; last.value = '1'; last.dispatchEvent({ type: 'change' });
    root.querySelector('[data-findings-filter="severity"] [data-filter-value="必须处理"]')!.click();
    expect(root.querySelector('[data-list-position]')!.value).toBe('0');
    expect(root.textContent).toContain('接受并应用全部 41 条');
  } finally { root.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); }
});

it('renders each finding status with its actual tone, defaulting unknown statuses to neutral', async () => {
  const restore = installMiniDom();
  vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined });
  vi.stubGlobal('document', {
    ...miniDocument,
    createElement: (tag: string) => {
      const node = miniDocument.createElement(tag);
      Object.defineProperty(node, 'childElementCount', { get: () => node.children.length });
      return node;
    },
    createTextNode: (text: string) => { const node = new MiniElement('#text'); node.textContent = text; return node; },
  });
  try {
    const statuses = ['未覆盖', '待复核', '待处理', '已处理', '已忽略', '已停用'];
    const page: BookFindingsProjection = {
      bookId: 'synthetic-book', total: statuses.length, offset: 0, next: null, pageSize: 40,
      groups: [{ category: 'synthetic', label: '发现', count: statuses.length, bySeverity: {}, byStatus: {} }],
      items: statuses.map((status, index) => ({
        id: String(index), category: 'synthetic', categoryLabel: '发现', severity: '提示', status, summary: '合成发现',
        target: { kind: 'review', reviewRunId: 'synthetic-run', findingId: String(index), blockId: 'synthetic-block' },
      })),
    };
    const root = miniDocument.createElement('div');
    miniDocument.body.append(root);
    mountFindingsCenter(root as unknown as HTMLElement, async () => page, vi.fn());
    await Promise.resolve();
    expect(root.dataset['findingsState']).toBe('ready');
    expect(root.querySelectorAll('.state-term').filter((pill) => statuses.includes(pill.textContent)).map((pill) => [pill.textContent, pill.dataset['pillTone']])).toEqual([
      ['未覆盖', 'attention'], ['待复核', 'attention'], ['待处理', 'progress'],
      ['已处理', 'good'], ['已忽略', 'neutral'], ['已停用', 'neutral'],
    ]);
  } finally { vi.unstubAllGlobals(); restore(); }
});

it('confirms all eligible findings in the selected category across list windows', async () => {
  const restore = installMiniDom();
  vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined });
  vi.stubGlobal('document', {
    ...miniDocument,
    createElement: (tag: string) => {
      const node = miniDocument.createElement(tag);
      Object.defineProperty(node, 'childElementCount', { get: () => node.children.length });
      return node;
    },
    createTextNode: (text: string) => { const node = new MiniElement('#text'); node.textContent = text; return node; },
  });
  try {
    const items: BookFindingsProjection['items'] = Array.from({ length: 41 }, (_, index) => ({
      id: String(index), category: index === 0 || index === 40 ? 'a' : 'b', categoryLabel: '合成类别', severity: index === 40 ? '必须处理' : '提示', status: index === 40 ? '待复核' : '待处理', summary: '合成发现',
      target: { kind: 'review', reviewRunId: 'run', findingId: String(index), blockId: 'block' },
      ...([0, 1, 40].includes(index) ? { suggestion: { manuscriptId: 'manuscript', branchId: 'branch', markId: `mark-${index}`, blockId: 'block', batchAllowed: true, quote: '原文', replacement: '修订' } } : {}),
    }));
    const read = vi.fn(async (offset: number): Promise<BookFindingsProjection> => ({
      bookId: 'book', total: 41, offset, next: offset === 0 ? 40 : null, pageSize: 40,
      groups: ['a', 'b'].map((category) => ({ category, label: category, count: category === 'a' ? 2 : 39, bySeverity: { '提示': 40, '必须处理': 1 }, byStatus: { '待处理': 40, '待复核': 1 } })),
      items: items.slice(offset, offset + 40),
    }));
    const apply = vi.fn(async () => undefined);
    const root = miniDocument.createElement('div'); miniDocument.body.append(root);
    mountFindingsCenter(root as unknown as HTMLElement, read, vi.fn(), apply);
    const batch = () => root.querySelectorAll('button').find((button) => button.textContent.startsWith('接受并应用全部'));
    await vi.waitFor(() => expect(batch()?.textContent).toBe('接受并应用全部 3 条'));
    root.querySelector('[data-filter-value="a"]')!.click();
    expect(batch()?.textContent).toBe('接受并应用全部 2 条');
    root.querySelector('[data-findings-filter="severity"] [data-filter-value="必须处理"]')!.click();
    expect(batch()?.textContent).toBe('接受并应用全部 1 条');
    root.querySelector('[data-findings-filter="status"] [data-filter-value="待处理"]')!.click();
    expect(batch()?.hidden).toBe(true);
    root.querySelector('[data-findings-filter="status"] [data-filter-value=""]')!.click();
    root.querySelector('[data-findings-filter="severity"] [data-filter-value=""]')!.click();

    expect(root.querySelector('.list-position-rail')?.disabled).toBe(true);
    expect(root.querySelectorAll('[data-finding-id]').map((row) => row.dataset['findingId'])).toEqual(['0', '40']);
    expect(batch()?.textContent).toBe('接受并应用全部 2 条');
    batch()!.click();
    expect(apply).not.toHaveBeenCalled();
    root.querySelectorAll('button').find((button) => button.textContent === '确认应用')!.click();
    expect(apply).toHaveBeenCalledWith([items[0], items[40]]);
    await Promise.resolve();
    await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBeNull());
  } finally { vi.unstubAllGlobals(); restore(); }
});


it('offers one review action in the empty card without filters or pagination', async () => {
  const restore = installMiniDom();
  vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined });
  try {
    const root = miniDocument.createElement('div'); miniDocument.body.append(root);
    const start = vi.fn();
    mountFindingsCenter(root as unknown as HTMLElement, async () => ({ bookId: 'book', total: 0, offset: 0, next: null, pageSize: 40, groups: [], items: [] }), vi.fn(), undefined, start);
    await Promise.resolve();
    expect(root.querySelectorAll('.findings-empty')).toHaveLength(1);
    expect(root.querySelectorAll('select, table, [data-list-position], [data-findings-filter]')).toHaveLength(0);
    expect(root.querySelector('p')?.textContent).toBe('还没有待处理的发现，发起审阅后会自动列在这里。');
    root.querySelector('button')!.click();
    expect(start).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); restore(); }
});
