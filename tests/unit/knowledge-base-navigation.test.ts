import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createKnowledgeBase, type KnowledgeBaseOptions } from '../../src/renderer/knowledge-base.js';
import type { DefaultExecutionRulesProjection, ExemplarBookProjection, ExemplarProjection } from '../../src/shared/protocol.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { ScreenReturnHistory } from '../../src/renderer/screen-return.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(true); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

function navigation(returnToOrigin: KnowledgeBaseOptions['returnToOrigin'] = vi.fn()) {
  const root = document.createElement('main');
  miniDocument.body.append(root as unknown as MiniElement);
  const element: KnowledgeBaseOptions['element'] = (tag, className, text) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
  };
  const setStatus = vi.fn();
  const options: KnowledgeBaseOptions = {
    element, panel: () => element('section'), setStatus, rendererErrorMessage: (_error, fallback) => fallback,
    replaceScreen: (_state, content) => root.replaceChildren(content), rememberReturn: vi.fn(),
    button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
    technicalDetails: () => element('details'), leaveThen: async (open) => open(),
    openWordSourceVersion: vi.fn(), renderGlobalAgent: vi.fn(), returnToOrigin, initializeStartup: vi.fn(),
    openFeedbackTarget: vi.fn(), openLearningMaterialSource: vi.fn(), requestBookWorkbenchRoute: vi.fn(),
    renderBookDeliverables: vi.fn(), renderBookEvaluation: vi.fn(), renderBookAnalysis: vi.fn(), renderBookReview: vi.fn(),
  };
  return { root, setStatus, ...createKnowledgeBase(options) };
}

it.each(['guidelines', 'library'] as const)('returns a direct %s entry to its Book surface', async (tab) => {
  vi.stubGlobal('window', { ai7: {
    inspectReviewGuidelines: vi.fn(async () => ({ documents: [] })),
    inspectLibraryMaterials: vi.fn(async () => ({ materials: [], nextCursor: null })),
    inspectLibraryMaterial: vi.fn(async () => null),
  } });
  const history = new ScreenReturnHistory();
  const book = vi.fn(); const fallback = vi.fn();
  history.enter('book-review', fallback);
  history.enter('knowledge-base', book);
  const page = navigation(() => history.back('knowledge-base', fallback));
  await page.renderKnowledgeBase(tab, false, tab === 'library' ? 'attention-material' : null);
  expect(page.root.querySelector('[role="tabpanel"]')).not.toBeNull();
  const buttons = Array.from(page.root.querySelectorAll('button'));
  expect(buttons.some((button) => button.textContent === '返回知识库')).toBe(true);
  const back = buttons.find((button) => button.textContent === '返回');
  expect(back).toBeDefined();
  back!.click();
  expect(book).toHaveBeenCalledOnce();
  expect(fallback).not.toHaveBeenCalled();
});

it.each([false, true])('ignores a late rules response after navigating away (developer mode switched off: %s)', async (switchOff) => {
  let finish!: (value: DefaultExecutionRulesProjection) => void;
  const rules = new Promise<DefaultExecutionRulesProjection>((resolve) => { finish = resolve; });
  vi.stubGlobal('window', { ai7: { inspectDefaultExecutionRules: vi.fn(() => rules),
    inspectKnowledgeProcedures: vi.fn(async () => ({ preinstalled: [] })) } });
  const page = navigation();
  const pending = page.renderKnowledgeBase('rules');
  const help = document.createElement('section'); help.textContent = '帮助';
  page.root.replaceChildren(help);
  if (switchOff) setTechnicalLayerVisible(false);
  finish({ rules: [] } as unknown as DefaultExecutionRulesProjection);
  await pending;
  expect(page.root.textContent).toBe('帮助');
  expect(page.root.querySelector('[data-knowledge-tab="rules"]')).toBeNull();
  expect(page.setStatus).not.toHaveBeenCalledWith('工序与规则已打开');
});

it('ignores a late rules response when mode changes while the rules loading page stays attached', async () => {
  let finish!: (value: DefaultExecutionRulesProjection) => void;
  const rules = new Promise<DefaultExecutionRulesProjection>((resolve) => { finish = resolve; });
  vi.stubGlobal('window', { ai7: { inspectDefaultExecutionRules: vi.fn(() => rules),
    inspectKnowledgeProcedures: vi.fn(async () => ({ preinstalled: [] })) } });
  const page = navigation();
  const pending = page.renderKnowledgeBase('rules');
  setTechnicalLayerVisible(false);
  finish({ rules: [] } as unknown as DefaultExecutionRulesProjection);
  await pending;
  expect(page.root.querySelector('.knowledge-procedures')).toBeNull();
  expect(page.root.querySelector('[data-rule-count]')).toBeNull();
  expect(page.setStatus).not.toHaveBeenCalledWith('工序与规则已打开');
});

const sampleExemplar: ExemplarProjection = {
  title: '春季发布会新闻稿', documentId: 'news-a', typeId: 'news-release', typeLabel: '新闻稿', version: 1,
  revisionId: 'revision', revisionDigest: 'a'.repeat(64), deliveredTo: '营销部', deliveredAt: '2026-11-01T00:00:00Z',
  archivedAt: '2026-11-01T00:00:00Z', earlierVersionCount: 0, earlierVersions: [], eligibility: 'house-only',
};
const sampleBook: ExemplarBookProjection = {
  bookId: 'book-a', bookTitle: '春季图书', authors: ['作者甲'], editors: ['责编乙'], publicationOrdinal: 1,
  designatedAt: '2026-11-01T00:00:00Z', withdrawn: false,
  exemplars: [sampleExemplar, { ...sampleExemplar, documentId: 'news-b', title: '秋季发布会新闻稿' }],
  readersReports: [{ template: 'author', typeId: 'readers-report-author', typeLabel: '审稿意见 · 给作者的修改意见',
    documentId: 'report', version: 2, revisionId: 'report-r', revisionDigest: 'b'.repeat(64), savedAt: '2026-11-01T00:00:00Z',
    pin: 'designation', eligibility: 'house-only', admission: { state: 'offered', admittedAt: null, decisions: 0 } }],
};

it('shows each same-type document title directly and refreshes a renamed title in ordinary mode', async () => {
  setTechnicalLayerVisible(false);
  const inspect = vi.fn(async () => ({ books: [sampleBook], nextCursor: null }));
  vi.stubGlobal('window', { ai7: { inspectExemplars: inspect } });
  const page = navigation();
  await page.renderKnowledgeBase('exemplars');
  expect(Array.from(page.root.querySelectorAll('.exemplar-title'), (node) => node.textContent))
    .toEqual(['春季发布会新闻稿', '秋季发布会新闻稿', '《春季图书》审稿意见 · 给作者的修改意见']);
  expect(page.root.querySelector('.knowledge-file-more')).toBeNull();
  expect(page.root.querySelector('.exemplar-kind-badge')?.textContent).toBe('工作文档 · 新闻稿');
  expect(page.root.querySelector('.exemplar-context')?.textContent).toContain('来自《春季图书》（作者：作者甲 · 责编：责编乙）');
  inspect.mockResolvedValueOnce({ books: [{ ...sampleBook, exemplars: [{ ...sampleExemplar, title: '更名后的新闻稿' }] }], nextCursor: null });
  await page.renderKnowledgeBase('exemplars');
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('更名后的新闻稿');
});

it('combines stable type and book filters, preserves admission, and names an empty result in ordinary mode', async () => {
  setTechnicalLayerVisible(false);
  const other = { ...sampleBook, bookId: 'book-b', bookTitle: '另一本书', exemplars: [], readersReports: [] };
  const admitted = { ...sampleBook, readersReports: sampleBook.readersReports.map((entry) => ({ ...entry,
    admission: { state: 'admitted' as const, admittedAt: '2026-11-02T00:00:00Z', decisions: 1 } })) };
  const admit = vi.fn(async () => admitted);
  vi.stubGlobal('window', { ai7: { inspectExemplars: async () => ({ books: [sampleBook, other], nextCursor: null }), admitReadersReportExemplar: admit } });
  const page = navigation(); await page.renderKnowledgeBase('exemplars');
  page.root.querySelector<HTMLElement>('[data-exemplar-filter="kind"] [data-filter-value="readers-report"]')!.click();
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(1);
  page.root.querySelector<HTMLElement>('[data-exemplar-action="admit"]')!.click();
  await vi.waitFor(() => expect(page.root.querySelector('[data-exemplar-admission="admitted"]')).not.toBeNull());
  expect(admit).toHaveBeenCalledWith({ bookId: 'book-a', template: 'author', revisionDigest: 'b'.repeat(64), expectedDecisions: 0 });
  page.root.querySelector<HTMLElement>('[data-exemplar-filter="book"] [data-filter-value="book-b"]')!.click();
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(0);
  expect(page.root.querySelector('.exemplars-empty')?.textContent).toBe('没有符合筛选条件的范例。');
  expect(page.root.querySelector('[data-exemplar-filter="kind"]')?.getAttribute('data-value')).toBe('readers-report');
  page.root.querySelector<HTMLElement>('[data-exemplar-filter="book"] [data-filter-value="book-a"]')!.click();
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(1);
  expect(page.root.querySelector('[data-exemplar-admission="admitted"]')).not.toBeNull();
  page.root.querySelector<HTMLElement>('[data-exemplar-filter="kind"] [data-filter-value="news-release"]')!.click();
  expect(page.root.querySelectorAll('.exemplar-title')).toHaveLength(2);
});

it('finds unvisited later-page types and Books before paginating and resets pages on filter round trips', async () => {
  setTechnicalLayerVisible(false);
  const books = Array.from({ length: 21 }, (_, index) => ({ ...sampleBook, bookId: `book-${index}`, bookTitle: `来源书 ${index}`,
    exemplars: [{ ...sampleExemplar, documentId: `document-${index}`, title: `题目 ${index}`,
      ...(index === 20 ? { typeId: 'commentary', typeLabel: '评论文章' } : {}) }], readersReports: [] }));
  const cursor = { title: books[19]!.bookTitle, bookId: books[19]!.bookId };
  const inspect = vi.fn(async ({ after }: { after: typeof cursor | null }) =>
    after === null ? { books: books.slice(0, 20), nextCursor: cursor } : { books: books.slice(20), nextCursor: null });
  vi.stubGlobal('window', { ai7: { inspectExemplars: inspect } });
  const page = navigation(); await page.renderKnowledgeBase('exemplars');
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(inspect).toHaveBeenLastCalledWith({ after: cursor });
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(20);
  const choose = (key: string, value: string) => page.root.querySelector<HTMLElement>(`[data-exemplar-filter="${key}"] [data-filter-value="${value}"]`)!.click();
  choose('kind', 'commentary');
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('题目 20');
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(1);
  choose('kind', '');
  page.root.querySelector<HTMLElement>('[data-exemplar-action="more"]')!.click();
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('题目 20');
  choose('book', 'book-0');
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('题目 0');
  expect(page.root.querySelector<HTMLElement>('[data-exemplar-action="first"]')?.hidden).toBe(true);
  choose('book', 'book-20');
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('题目 20');
  choose('kind', 'news-release');
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(0);
  choose('kind', '');
  expect(page.root.querySelector('.exemplar-title')?.textContent).toBe('题目 20');
  expect(page.root.querySelector('[data-exemplar-filter="book"]')?.getAttribute('data-value')).toBe('book-20');
  choose('book', '');
  expect(page.root.querySelectorAll('.exemplar-entry')).toHaveLength(20);
  expect(inspect).toHaveBeenCalledTimes(2);
});
