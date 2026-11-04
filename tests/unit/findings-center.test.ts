import { expect, it, vi } from 'vitest';
import { mountFindingsCenter } from '../../src/renderer/findings-center.js';
import type { BookFindingsProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

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
    expect(root.querySelectorAll('.state-term').map((pill) => [pill.textContent, pill.dataset['pillTone']])).toEqual([
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
    const items: BookFindingsProjection['items'] = ['a', 'b', 'a'].map((category, index) => ({
      id: String(index), category, categoryLabel: category, severity: '提示', status: '待处理', summary: '合成发现',
      target: { kind: 'review', reviewRunId: 'run', findingId: String(index), blockId: 'block' },
      suggestion: { manuscriptId: 'manuscript', branchId: 'branch', markId: `mark-${index}`, blockId: 'block', batchAllowed: true, quote: '原文', replacement: '修订' },
    }));
    const read = vi.fn(async (offset: number): Promise<BookFindingsProjection> => ({
      bookId: 'book', total: 3, offset, next: offset === 0 ? 2 : null, pageSize: 2,
      groups: ['a', 'b'].map((category) => ({ category, label: category, count: category === 'a' ? 2 : 1, bySeverity: {}, byStatus: {} })),
      items: items.slice(offset, offset + 2),
    }));
    const apply = vi.fn(async () => undefined);
    const root = miniDocument.createElement('div'); miniDocument.body.append(root);
    mountFindingsCenter(root as unknown as HTMLElement, read, vi.fn(), apply);
    const batch = () => root.querySelectorAll('button').find((button) => button.textContent.startsWith('接受并应用全部'));
    await vi.waitFor(() => expect(batch()?.textContent).toBe('接受并应用全部 3 条'));
    root.querySelector('[data-filter-value="a"]')!.click();
    expect(batch()?.textContent).toBe('接受并应用全部 2 条');
    const rail = root.querySelector('[data-list-position]')!; rail.value = '1'; rail.dispatchEvent({ type: 'change' });
    await vi.waitFor(() => expect(root.querySelector('.list-position-rail')?.value).toBe('1'));
    expect(batch()?.textContent).toBe('接受并应用全部 2 条');
    batch()!.click();
    expect(apply).not.toHaveBeenCalled();
    root.querySelectorAll('button').find((button) => button.textContent === '确认应用')!.click();
    expect(apply).toHaveBeenCalledWith([items[0], items[2]]);
    await Promise.resolve();
    await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBeNull());
  } finally { vi.unstubAllGlobals(); restore(); }
});
