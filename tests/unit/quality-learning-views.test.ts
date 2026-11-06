import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountEditorialMemory } from '../../src/renderer/knowledge-base-memory.js';
import { mountFeedbackHistory } from '../../src/renderer/feedback-history.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { EditorialLearningProjection, FeedbackHistoryProjection, RendererApi } from '../../src/shared/protocol.js';
import type { EditorialMemoryVersion } from '../../src/shared/protocol/learning.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
function host(): HTMLElement { const root = document.createElement('main'); miniDocument.body.append(root as unknown as MiniElement); return root; }
function click(root: HTMLElement, label: string): void { Array.from(root.querySelectorAll('button')).find((button) => button.textContent === label)!.click(); }
const ID = '10000000-0000-4000-8000-000000000001';
const AT = '2026-11-06T12:00:00.000Z';
const memory = (itemId: string, state: EditorialMemoryVersion['state']): EditorialMemoryVersion => ({
  schema: 'ai7.global-editorial-memory/2', itemId, versionId: `${itemId}-version`, ordinal: 1, supersedes: null,
  recordedAt: AT, operationalScope: 'development-ci', applicability: { kind: 'house' }, editorialDimension: 'typos-and-usage',
  title: state === 'proposed' ? '保留作者的短句' : '统一术语', confidence: .8, state, actor: 'AI7', actionId: ID,
  action: 'create', signalIds: [], positiveExamples: [], negativeExamples: [], sources: [], parentVersions: [], supervisionDirectiveRefs: [],
});
function learning() {
  let page: EditorialLearningProjection = {
    basis: '工程依据 SHA ' + 'a'.repeat(64), enabled: true, controlEntries: 2, excludedBooks: [], excludedMaterials: [], signals: [],
    items: [memory('active', 'active'), memory('candidate', 'proposed')].map((current) => ({ current, usable: current.state === 'active', history: [current] })),
    nextSignalOffset: null, nextItemOffset: null, nextExclusionOffset: null,
    curation: { available: true, disclosure: '整理预算', envelope: null, passesUsed: 0, reservedTokens: 0, recentRuns: [] },
  };
  const change = (itemId: string, state: EditorialMemoryVersion['state']) => {
    page = { ...page, items: page.items.map((item) => item.current.itemId === itemId
      ? { ...item, current: { ...item.current, state } as EditorialMemoryVersion, usable: state === 'active' } : item) }; return page;
  };
  const global = { categories: [{ categoryId: 'typos-and-usage', label: '错别字与规范用语' }], books: [], items: [
    { kind: 'preference', itemId: 'legacy', revisionId: 'legacy-version', categoryId: 'typos-and-usage', bookId: null, text: '沿用本社用语', state: 'active', lineage: [] },
  ] };
  const api = {
    inspectEditorialLearning: vi.fn(async () => page), inspectGlobalAgent: vi.fn(async () => global),
    inspectHouseReviewPreference: vi.fn(async () => ({ current: null, history: [] })),
    acceptEditorialMemory: vi.fn(async (input: Parameters<RendererApi['acceptEditorialMemory']>[0]) => change(input.itemId, 'active')),
    deactivateEditorialMemory: vi.fn(async (input: Parameters<RendererApi['deactivateEditorialMemory']>[0]) => change(input.itemId, 'inactive')),
    changeEditorialLearning: vi.fn(async (input: Parameters<RendererApi['changeEditorialLearning']>[0]) => { page = { ...page, enabled: input.kind === 'switch' ? input.enabled : page.enabled, controlEntries: 3 }; return page; }),
    recordLearningSupervision: vi.fn(async () => ({ ...global, items: global.items.map((item) => ({ ...item, state: 'inactive' })) })),
  } satisfies Partial<Record<keyof RendererApi, unknown>>;
  return { api, renderer: api as unknown as RendererApi };
}

it('puts candidates first, accepts and excludes them, disables memory and keeps ordinary metadata private', async () => {
  const root = host(); const { api, renderer } = learning();
  await mountEditorialMemory(root, renderer, vi.fn());
  expect(Array.from(root.querySelectorAll<HTMLElement>('[data-memory-item]'), (item) => item.dataset['memoryItem'])).toEqual(['candidate', 'active']);
  expect(root.textContent).toContain('错别字与规范用语');
  expect(root.querySelector('form')).toBeNull();
  expect(root.textContent).not.toMatch(/token|1–10|SHA|日志|candidate-version|active-version/iu);
  expect(root.querySelector('details')!.textContent).toContain(AT);
  click(root.querySelector('[data-memory-item="candidate"]')!, '接受记忆'); await settle();
  expect(api.acceptEditorialMemory).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'candidate', expectedVersionId: 'candidate-version' }));
  click(root.querySelector('[data-memory-item="candidate"]')!, '停用'); await settle();
  expect(root.querySelector('[data-memory-item="candidate"]')!.textContent).toContain('已停用');
  const second = learning(); await mountEditorialMemory(host(), second.renderer, vi.fn());
  const candidate = document.body.querySelectorAll<HTMLElement>('[data-memory-item="candidate"]')[1]!;
  click(candidate, '排除'); await settle();
  expect(second.api.deactivateEditorialMemory).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'candidate' }));
});

it('keeps the local switch and legacy preference disable connected to their existing owners', async () => {
  const root = host(); const { api, renderer } = learning(); await mountEditorialMemory(root, renderer, vi.fn());
  const toggle = root.querySelector<HTMLInputElement>('[data-learning-enabled]')!;
  toggle.checked = false; (toggle as unknown as MiniElement).dispatchEvent({ type: 'change' }); await settle();
  expect(api.changeEditorialLearning).toHaveBeenCalledWith({ kind: 'switch', enabled: false, expectedEntries: 2 });
  expect(root.querySelector<HTMLInputElement>('[data-learning-enabled]')!.checked).toBe(false);
  click(root.querySelector('[data-review-preference="legacy"]')!, '停用'); await settle();
  expect(api.recordLearningSupervision).toHaveBeenCalledWith(expect.objectContaining({ operation: 'deactivate', targets: [{ itemId: 'legacy', revisionId: 'legacy-version' }] }));
  expect(root.querySelector('[data-review-preference="legacy"]')!.textContent).toContain('已停用');
});

it('preserves the developer budget, signal synthesis and full memory lineage', async () => {
  setTechnicalLayerVisible(true); const root = host(); const { api, renderer } = learning();
  await mountEditorialMemory(root, renderer, vi.fn());
  expect(root.textContent).toContain('空闲时整理学习记录');
  expect(root.querySelector('[data-memory-candidate-form]')).not.toBeNull();
  expect(root.textContent).toContain('来源与版本历史');
  expect(root.textContent).toContain('信心 80%');
  expect(api.inspectGlobalAgent).not.toHaveBeenCalled();
});

const feedback = (): FeedbackHistoryProjection => ({ books: [
  { bookId: 'a', title: '甲书', authors: [], editors: [], peopleVersions: [] },
  { bookId: 'b', title: '乙书', authors: [], editors: [], peopleVersions: [] },
], entries: [0, 1, 2].map((index) => ({ entryId: `entry-${index}`, bookId: index === 1 ? 'b' : 'a', origin: 'proposal-decision', dimension: null,
  signal: '拒绝', reason: '保留作者表达', reasonState: 'given', recordedAt: new Date(Date.parse(AT) - index * 1000).toISOString(), peopleVersion: 0,
  target: { kind: 'mark', bookId: 'a', manuscriptId: ID, branchId: ID, blockId: 'blk_' + 'a'.repeat(24), markId: ID, detached: false },
})), truncated: false });
it.each([false, true])('shows the ordinary two-filter rows and preserves all developer filters (developer=%s)', async (developer) => {
  setTechnicalLayerVisible(developer); const root = host(); const page = feedback();
  const api = { inspectFeedbackHistory: vi.fn(async () => page) }; const open = vi.fn(async () => {});
  await mountFeedbackHistory({ root, api, open, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }).load();
  const controls = Array.from(root.querySelectorAll<HTMLElement>('[data-feedback-filter]'), (control) => control.dataset['feedbackFilter']);
  expect(controls).toEqual(developer ? ['book', 'origin', 'signal', 'author', 'editor'] : ['book', 'origin']);
  expect(root.querySelector('[id="feedback-group-by"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-dimension"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-from"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-to"]') === null).toBe(!developer);
  if (!developer) {
    expect(Array.from(root.querySelectorAll('[id="feedback-filter-origin"] option'), (option) => option.textContent)).toEqual(['全部', '修改建议决定', '审阅处理', '分析反馈']);
    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-entry-id]'), (item) => item.dataset['entryId'])).toEqual(['entry-0', 'entry-1', 'entry-2']);
    expect(root.querySelector('.feedback-entry-line')!.textContent).toContain('《甲书》 · 修改建议 · 拒绝');
    expect(root.querySelector('.feedback-entry-reason')!.textContent).toBe('你的原因：保留作者表达');
    click(root, '查看原处'); await settle(); expect(open).toHaveBeenCalledWith(page.entries[0]!.target, 'entry-0');
  }
  const book = root.querySelector<HTMLSelectElement>('[id="feedback-filter-book"]')!;
  if (developer) book.querySelector<HTMLButtonElement>('[data-filter-value="b"]')!.click();
  else { book.value = 'b'; (book as unknown as MiniElement).dispatchEvent({ type: 'change' }); }
  await settle();
  expect(api.inspectFeedbackHistory).toHaveBeenLastCalledWith(expect.objectContaining({ bookId: 'b', after: null, signal: null, author: null, editor: null }));
});
