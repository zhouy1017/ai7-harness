import { expect, it, vi } from 'vitest';
import { mountFindingsCenter } from '../../src/renderer/findings-center.js';
import type { BookFindingsProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';

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
