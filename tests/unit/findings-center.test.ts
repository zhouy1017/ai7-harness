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
