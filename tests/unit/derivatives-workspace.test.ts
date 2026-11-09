import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountDerivativesWorkspace } from '../../src/renderer/derivatives-workspace.js';
import type { ProductionDocumentProjection, ProductionDocumentsProjection, RendererApi } from '../../src/shared/protocol.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { vi.unstubAllGlobals(); restore(); });

function doc(index: number): ProductionDocumentProjection {
  return { documentId: `doc-${index}`, branchId: `branch-${index}`, title: `媒体稿 ${index}`, createdAt: '2026-11-09T00:00:00Z',
    finalized: index % 2 === 0, preview: '', characterCount: 0, versions: [], versionsTruncated: false, changedSinceVersion: false,
    journalSequence: 0, workingDigest: '', deliveries: [], deliveriesTruncated: false, changedSinceDelivery: false,
    origin: { sourceVersionId: '', displayName: '', marksNotCarried: null, drafted: false },
    workflow: { profile: { id: '', name: '', version: '', activatedAt: '' }, summary: '', next: [], phases: [], transitions: 0 } };
}

function setup() {
  const projection: ProductionDocumentsProjection = { bookId: 'book', configuration: { schema: '', version: '', digest: '' }, unavailableReason: null,
    sources: [], sourcesTruncated: false, types: [
      { typeId: 'news-release', label: '新闻稿', notForThisBook: false, documents: Array.from({ length: 20 }, (_, i) => doc(i)), document: null },
      { typeId: 'custom', label: '人物资料', notForThisBook: false, documents: Array.from({ length: 20 }, (_, i) => doc(i + 20)), document: null },
    ] };
  const methods = { inspectProductionDocuments: vi.fn(async () => projection),
    getManuscriptWindow: vi.fn(async () => ({ bookId: 'book' })),
    saveProductionDocumentVersion: vi.fn(async () => ({ bookId: 'book', document: { versions: [{ revisionId: 'saved' }] } })),
    reviewManuscriptExport: vi.fn(async () => ({ bookId: 'book', target: { revisionId: 'saved' }, reviewDigest: 'review', suggestedFileName: '媒体稿.docx', format: 'docx' })),
    chooseManuscriptExportDestination: vi.fn(async () => ({ outcome: 'cancelled' })),
    saveProductionDocumentType: vi.fn(async () => ({ types: [] })), reorderProductionDocumentTypes: vi.fn(async () => ({ types: [] })),
    updateProductionDocumentMeta: vi.fn(async () => projection), renameProductionDocument: vi.fn(async () => ({})) };
  const api = methods as unknown as RendererApi;
  const root = document.createElement('main'); document.body.append(root);
  const openDocument = vi.fn(async () => {});
  const surface = mountDerivativesWorkspace({ root, bookId: 'book', bookTitle: '测试图书', api, openDocument, setStatus: vi.fn(),
    errorMessage: () => '操作未完成' });
  surface.start();
  return { root, methods, openDocument, surface };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function click(root: HTMLElement, text: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === text);
  expect(button).toBeDefined(); button!.click();
}
function change(node: HTMLElement): void { (node as unknown as MiniElement).dispatchEvent({ type: 'change' }); }

it('browses dozens of documents by category, status and title while keeping total counts (#1427)', async () => {
  const { root, surface } = setup(); await flush();
  expect(root.querySelectorAll('.derivatives-item')).toHaveLength(40);
  click(root, '人物资料 (20)');
  expect(root.querySelectorAll('.derivatives-item')).toHaveLength(20);
  const status = root.querySelector<HTMLSelectElement>('[aria-label="衍生稿件状态"]')!;
  status.value = 'final'; change(status);
  expect(root.querySelectorAll('.derivatives-item')).toHaveLength(10);
  const search = root.querySelector<HTMLInputElement>('[aria-label="搜索衍生稿件"]')!;
  search.value = '媒体稿 22'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' });
  expect(root.querySelectorAll('.derivatives-item')).toHaveLength(1);
  expect(root.querySelector<HTMLElement>('.derivatives-item')!.dataset['derivativeDocument']).toBe('doc-22');
  expect(root.querySelector('h2')!.textContent).toBe('衍生稿件 (40)');
  surface.destroy();
});

it('opens the selected document in the unified editor and saves its category inline (#1427)', async () => {
  const { root, methods, openDocument, surface } = setup(); await flush();
  const row = root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!;
  const select = row.querySelector<HTMLSelectElement>('select')!; select.value = 'custom'; change(select); await flush();
  expect(methods.updateProductionDocumentMeta).toHaveBeenCalledWith({ documentId: 'doc-0', typeId: 'custom' });
  click(root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!, '打开编辑'); await flush();
  expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-0' }), expect.objectContaining({ typeId: 'news-release' }));
  surface.destroy();
});

it('adds and renames categories and sends their new order from the category editor (#1427)', async () => {
  const { root, methods, surface } = setup(); await flush(); click(root, '管理衍生稿件类别');
  const name = root.querySelector<HTMLInputElement>('[aria-label="新类别名称"]')!; name.value = '人物小传';
  click(root, '添加类别'); await flush();
  expect(methods.saveProductionDocumentType).toHaveBeenCalledWith({ name: '人物小传' });
  const existing = root.querySelector<HTMLInputElement>('[aria-label="类别名称：新闻稿"]')!; existing.value = '媒体稿';
  click(root.querySelector<HTMLElement>('.derivatives-category-row')!, '保存名称'); await flush();
  expect(methods.saveProductionDocumentType).toHaveBeenCalledWith({ typeId: 'news-release', name: '媒体稿' });
  click(root.querySelector<HTMLElement>('.derivatives-category-row')!, '下移'); await flush();
  expect(methods.reorderProductionDocumentTypes).toHaveBeenCalledWith({ typeIds: ['custom', 'news-release'] });
  surface.destroy();
});

it('acquires the existing editor capability before exporting an unopened document (#1427)', async () => {
  const { root, methods, surface } = setup(); await flush();
  click(root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!, '导出 DOCX'); await flush();
  expect(methods.getManuscriptWindow).toHaveBeenCalledWith({ manuscriptId: 'doc-0', branchId: 'branch-0', cursor: null });
  expect(methods.saveProductionDocumentVersion).toHaveBeenCalledWith({ documentId: 'doc-0', branchId: 'branch-0' });
  expect(methods.getManuscriptWindow.mock.invocationCallOrder[0]).toBeLessThan(methods.saveProductionDocumentVersion.mock.invocationCallOrder[0]!);
  expect(methods.reviewManuscriptExport).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'document', documentId: 'doc-0', revisionId: 'saved' }, format: 'docx' }));
  expect(methods.chooseManuscriptExportDestination).toHaveBeenCalledOnce();
  surface.destroy();
});
