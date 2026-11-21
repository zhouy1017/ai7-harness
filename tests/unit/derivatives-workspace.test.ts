import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountDerivativesWorkspace } from '../../src/renderer/derivatives-workspace.js';
import type { ProductionDocumentProjection, ProductionDocumentsProjection, ProductionDocumentTypeProjection,
  RendererApi, WritingTaskProjection } from '../../src/shared/protocol.js';
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

/** The writing sheet's projection: one type, its draft promised only once the start is recorded. */
function writingPage(drafted: boolean): WritingTaskProjection {
  return { bookId: 'book', unavailable: null,
    references: { synopsis: '', evaluation: '', book: '', materials: { statement: '', items: [], more: 0 } },
    consequences: { read: '', send: '', notDo: '', cost: '' },
    types: [{ typeId: 'promotion-article', label: '宣传文章', prepare: { allowed: true, mode: 'writing-first' },
      exemplars: { count: 0, statement: '' },
      drafted: drafted ? { revisionId: 'draft-1', createdAt: '2026-11-09T00:00:00Z' } : null,
      quickStart: { available: false, reason: null, rule: null } }],
    task: null };
}

function setup(extraTypes: ProductionDocumentsProjection['types'] = []) {
  const projection: ProductionDocumentsProjection = { bookId: 'book', configuration: { schema: '', version: '', digest: '' }, unavailableReason: null,
    sources: [], sourcesTruncated: false, types: [
      { typeId: 'news-release', label: '新闻稿', notForThisBook: false, documents: Array.from({ length: 20 }, (_, i) => doc(i)), document: null },
      { typeId: 'custom', label: '人物资料', notForThisBook: false, documents: Array.from({ length: 20 }, (_, i) => doc(i + 20)), document: null },
      ...extraTypes,
    ] };
  let started = false;
  const methods = { inspectProductionDocuments: vi.fn(async () => projection),
    getManuscriptWindow: vi.fn(async () => ({ bookId: 'book' })),
    saveProductionDocumentVersion: vi.fn(async () => ({ bookId: 'book', document: { versions: [{ revisionId: 'saved' }] } })),
    reviewManuscriptExport: vi.fn(async () => ({ bookId: 'book', target: { revisionId: 'saved' }, reviewDigest: 'review', suggestedFileName: '媒体稿.docx', format: 'docx' })),
    chooseManuscriptExportDestination: vi.fn(async () => ({ outcome: 'cancelled' })),
    saveProductionDocumentType: vi.fn(async () => ({ types: [] })),
    reorderProductionDocumentTypes: vi.fn(async () => ({ types: [] })),
    deleteProductionDocumentType: vi.fn(async (input: { typeId: string }) => {
      const types = projection.types as ProductionDocumentTypeProjection[];
      const type = types.find((entry) => entry.typeId === input.typeId);
      if (type !== undefined && type.documents.length > 0) throw new Error('这个类别下还有衍生稿件，请先改到别的类别。');
      const index = types.findIndex((entry) => entry.typeId === input.typeId);
      if (index >= 0) types.splice(index, 1);
      return { types: [] };
    }),
    updateProductionDocumentMeta: vi.fn(async (input: { documentId: string; finalized?: boolean }) => {
      const target = projection.types.flatMap((type) => type.documents).find((entry) => entry.documentId === input.documentId);
      if (target !== undefined && input.finalized !== undefined) target.finalized = input.finalized;
      return projection;
    }),
    renameProductionDocument: vi.fn(async (input: { documentId: string; title: string }) => {
      // A call over the bridge resolves later than the key that made it: a second save in between must be refused by the page.
      await Promise.resolve();
      const renamed = projection.types.flatMap((type) => type.documents).find((entry) => entry.documentId === input.documentId);
      if (renamed !== undefined) { renamed.title = input.title; renamed.updatedAt = '2026-12-01T00:00:00Z'; }
      return { document: renamed ?? null };
    }),
    createProductionDocument: vi.fn(async (input: { typeId: string; sourceVersionId?: string | null; title?: string }) => ({
      bookId: 'book', documents: projection, document: { ...doc(99), title: input.title ?? '媒体稿 99' }, typeId: input.typeId, notice: null })),
    selectAndStageManuscript: vi.fn(async () => ({ status: 'cancelled' })),
    decideProductionDocumentType: vi.fn(async (input: { typeId: string }) => ({ bookId: 'book', documents: projection, document: null, typeId: input.typeId, notice: null })),
    inspectWritingTask: vi.fn(async () => writingPage(started)),
    createWritingDraft: vi.fn(async () => ({ writing: writingPage(false), typeId: 'promotion-article', typeLabel: '宣传文章',
      document: { ...doc(98), title: '宣传文章' } })) };
  const api = methods as unknown as RendererApi;
  const root = document.createElement('main'); document.body.append(root);
  const openDocument = vi.fn(async () => {});
  const setStatus = vi.fn();
  const writingLaunch = vi.fn();
  const surface = mountDerivativesWorkspace({ root, bookId: 'book', bookTitle: '测试图书', api, openDocument, setStatus,
    errorMessage: (error) => error instanceof Error ? error.message : '操作未完成',
    writing: { awaitServiceJob: async (job) => job, openLaunch: writingLaunch, openWritingPlan: vi.fn() } });
  surface.start();
  return { root, methods, openDocument, setStatus, writingLaunch, surface, projection,
    recordStart: () => { started = true; } };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function click(root: HTMLElement, text: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === text);
  expect(button).toBeDefined(); button!.click();
}
function change(node: HTMLElement): void { (node as unknown as MiniElement).dispatchEvent({ type: 'change' }); }
function key(node: HTMLElement, name: string, composing = false): void {
  (node as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: name, isComposing: composing });
}
function blur(node: HTMLElement): void { (node as unknown as MiniElement).dispatchEvent({ type: 'blur' }); }
/** A row menu is opened the way a hand does before one of its entries can be pressed. */
function openRowMenu(row: HTMLElement, name: string): void {
  const menu = row.querySelector<HTMLElement>(`[data-derivative-row-menu="${name}"]`)!.parentElement as unknown as { open: boolean };
  menu.open = true;
  expect((row.querySelector(`[data-derivative-row-menu="${name}"]`)!.parentElement as unknown as { open: boolean }).open).toBe(true);
}

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
  const row = root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!;
  openRowMenu(row, 'export');
  click(row, '导出 DOCX'); await flush();
  expect(methods.getManuscriptWindow).toHaveBeenCalledWith({ manuscriptId: 'doc-0', branchId: 'branch-0', cursor: null });
  expect(methods.saveProductionDocumentVersion).toHaveBeenCalledWith({ documentId: 'doc-0', branchId: 'branch-0' });
  expect(methods.getManuscriptWindow.mock.invocationCallOrder[0]).toBeLessThan(methods.saveProductionDocumentVersion.mock.invocationCallOrder[0]!);
  expect(methods.reviewManuscriptExport).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'document', documentId: 'doc-0', revisionId: 'saved' }, format: 'docx' }));
  expect(methods.chooseManuscriptExportDestination).toHaveBeenCalledOnce();
  surface.destroy();
});

it('makes a document through the editor\'s one create form, with its four modes (#1551)', async () => {
  const { root, methods, openDocument, setStatus, surface } = setup(); await flush();
  click(root, '+ 新建衍生稿件');
  const form = root.querySelector<HTMLElement>('.derivative-create-form')!;
  expect(form).not.toBeNull();
  expect(form.querySelector('[data-document-field]')?.getAttribute('data-document-field')).toBe('title');
  expect([...form.querySelectorAll<HTMLInputElement>('.derivative-modes input')].map((radio) => radio.value))
    .toEqual(['blank', 'writing', 'source', 'import']);
  const type = form.querySelector<HTMLSelectElement>('select[data-document-field="type"]')!;
  type.focus();
  type.value = 'custom'; change(type);
  // The type is chosen in place: the same select keeps focus and the offered title follows it.
  expect(root.querySelector('.derivative-create-form select[data-document-field="type"]')).toBe(type);
  expect(type.isConnected).toBe(true);
  expect(document.activeElement).toBe(type);
  expect(root.querySelector<HTMLInputElement>('.derivative-create-form [data-document-field="title"]')!.value).toBe('《测试图书》人物资料 21');
  click(root.querySelector<HTMLElement>('.derivative-create-form')!, '创建并打开'); await flush();
  expect(methods.createProductionDocument).toHaveBeenCalledWith({ typeId: 'custom', sourceVersionId: null, title: '《测试图书》人物资料 21' });
  expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-99' }), expect.objectContaining({ typeId: 'custom' }), null);
  // The document is opened at once — no extra read stands between the create and the editor — and the line names it.
  expect(methods.inspectProductionDocuments).toHaveBeenCalledTimes(1);
  expect(setStatus).toHaveBeenCalledWith('已创建「《测试图书》人物资料 21」', 'success');
  surface.destroy();
});

it('renames a row in place: Enter and leaving the field save once each, unchanged and Escape save nothing (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (id = 'doc-0'): HTMLElement => root.querySelector<HTMLElement>(`[data-derivative-document="${id}"]`)!;
  click(row(), '改名');
  let input = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (input as unknown as MiniElement).value = '改过的题目';
  key(input, 'Enter');
  blur(input); // the key already saved: leaving the field saves nothing more
  await flush();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(1);
  expect(methods.renameProductionDocument).toHaveBeenCalledWith({ documentId: 'doc-0', title: '改过的题目' });
  expect(row().querySelector('.derivatives-item-title-text')?.textContent).toBe('改过的题目');
  click(row(), '改名');
  input = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (input as unknown as MiniElement).value = '第二次改名';
  blur(input); await flush();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(2);
  expect(methods.renameProductionDocument).toHaveBeenLastCalledWith({ documentId: 'doc-0', title: '第二次改名' });
  click(row(), '改名');
  input = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  key(input, 'Enter'); await flush();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(2);
  expect(row().querySelector('.derivatives-item-title-text')?.textContent).toBe('第二次改名');
  surface.destroy();
});

it('starts a rename on a double-click and leaves the title alone on Escape or an IME Enter (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (): HTMLElement => root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!;
  (row().querySelector<HTMLElement>('.derivatives-item-title-text')! as unknown as MiniElement).dispatchEvent({ type: 'dblclick' });
  let input = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  expect(input).not.toBeNull();
  (input as unknown as MiniElement).value = '不要这个';
  key(input, 'Enter', true); await flush();
  expect(methods.renameProductionDocument).not.toHaveBeenCalled();
  expect(row().querySelector<HTMLElement>('.derivatives-item-title-input')).not.toBeNull();
  key(input, 'Escape');
  expect(methods.renameProductionDocument).not.toHaveBeenCalled();
  expect(row().querySelector('.derivatives-item-title-text')?.textContent).toBe('媒体稿 0');
  // Escape hands focus back to the row's own 改名.
  expect(document.activeElement?.textContent).toBe('改名');
  surface.destroy();
});

it('keeps a click on another row\'s 改名 working while a title is edited or saved (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-derivative-document="${id}"]`)!;
  // An unchanged title repaints only that row; the next press still lands on the row it aimed at.
  click(row('doc-0'), '改名');
  blur(row('doc-0').querySelector<HTMLElement>('.derivatives-item-title-input')!);
  click(row('doc-1'), '改名');
  expect(row('doc-1').querySelector<HTMLElement>('.derivatives-item-title-input')).not.toBeNull();
  blur(row('doc-1').querySelector<HTMLElement>('.derivatives-item-title-input')!);
  // A saved title disables nothing of the page, so the press that took focus away still opens the next row.
  click(row('doc-2'), '改名');
  const typed = row('doc-2').querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (typed as unknown as MiniElement).value = '另一个题目';
  blur(typed);
  click(row('doc-3'), '改名'); await flush();
  expect(row('doc-3').querySelector<HTMLElement>('.derivatives-item-title-input')).not.toBeNull();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(1);
  surface.destroy();
});

it('keeps a failed rename\'s text in its field and lets it be saved again or given up (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (): HTMLElement => root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!;
  methods.renameProductionDocument.mockRejectedValueOnce(new Error('题目没有保存'));
  click(row(), '改名');
  const input = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (input as unknown as MiniElement).value = '保存不了';
  key(input, 'Enter'); await flush();
  const again = row().querySelector<HTMLElement>('.derivatives-item-title-input');
  expect(again).toBe(input);
  expect((again as unknown as MiniElement).value).toBe('保存不了');
  expect(document.activeElement).toBe(again);
  // The field is not dead: Enter saves the same text now.
  key(input, 'Enter'); await flush();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(2);
  expect(row().querySelector('.derivatives-item-title-text')?.textContent).toBe('保存不了');
  // And after another failure Escape gives the edit up.
  methods.renameProductionDocument.mockRejectedValueOnce(new Error('题目没有保存'));
  click(row(), '改名');
  const second = row().querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (second as unknown as MiniElement).value = '又保存不了';
  key(second, 'Enter'); await flush();
  key(second, 'Escape');
  expect(row().querySelector('.derivatives-item-title-input')).toBeNull();
  expect(row().querySelector('.derivatives-item-title-text')?.textContent).toBe('保存不了');
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(3);
  surface.destroy();
});

it('returns focus to 改名 after a key\'s save, names the ⋯ menu by the new title and reads the list again (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-derivative-document="${id}"]`)!;
  const first = (): string | undefined => root.querySelector<HTMLElement>('.derivatives-item')?.dataset['derivativeDocument'];
  expect(first()).toBe('doc-0');
  const reads = methods.inspectProductionDocuments.mock.calls.length;
  click(row('doc-5'), '改名');
  const input = row('doc-5').querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (input as unknown as MiniElement).value = '换了名字';
  key(input, 'Enter'); await flush();
  expect(methods.inspectProductionDocuments.mock.calls.length).toBe(reads + 1);
  // The re-read moves the renamed row to the top (its time is the newest) and focus stays on its 改名.
  expect(first()).toBe('doc-5');
  expect(document.activeElement?.textContent).toBe('改名');
  expect(row('doc-5').contains(document.activeElement as unknown as HTMLElement)).toBe(true);
  expect(row('doc-5').querySelector('[data-derivative-row-menu="more"]')?.getAttribute('aria-label')).toBe('更多操作：换了名字');
  surface.destroy();
});

it('repaints no other row while a save by leaving the field is read back, so the next press is not lost (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-derivative-document="${id}"]`)!;
  click(row('doc-5'), '改名');
  const typed = row('doc-5').querySelector<HTMLElement>('.derivatives-item-title-input')!;
  (typed as unknown as MiniElement).value = '离开时保存';
  blur(typed);
  const target = row('doc-6').querySelector<HTMLElement>('[data-derivative-action="rename"]')!;
  await flush();
  expect(methods.renameProductionDocument).toHaveBeenCalledTimes(1);
  // The read-back did not rebuild the list: the button the press was aimed at is still the one on the page.
  expect(target.isConnected).toBe(true);
  expect(row('doc-6').querySelector('[data-derivative-action="rename"]')).toBe(target);
  // Nothing was repainted, so the ⋯ menu's name follows the new title in place.
  expect(row('doc-5').querySelector('[data-derivative-row-menu="more"]')?.getAttribute('aria-label')).toBe('更多操作：离开时保存');
  surface.destroy();
});

it('builds both row menus on the component\'s own menu class with the shared panel (#1551)', async () => {
  const { root, surface } = setup(); await flush();
  const row = root.querySelector<HTMLElement>('[data-derivative-document="doc-0"]')!;
  for (const name of ['export', 'more']) {
    const menu = row.querySelector(`[data-derivative-row-menu="${name}"]`)!.parentElement!;
    expect(menu.tagName).toBe('DETAILS');
    expect(menu.className).toBe('derivative-menu');
    expect(menu.querySelector('.ui-menu-panel')).not.toBeNull();
  }
  surface.destroy();
});

it('offers 取消定稿 in the row\'s more menu once the document is finalized (#1551)', async () => {
  const { root, methods, surface } = setup(); await flush();
  const row = (): HTMLElement => root.querySelector<HTMLElement>('[data-derivative-document="doc-1"]')!;
  openRowMenu(row(), 'more');
  click(row(), '设为定稿'); await flush();
  expect(methods.updateProductionDocumentMeta).toHaveBeenCalledWith({ documentId: 'doc-1', finalized: true });
  expect(row().querySelector('.status-pill')?.textContent).toBe('已定稿');
  openRowMenu(row(), 'more');
  expect([...row().querySelectorAll('button')].map((node) => node.textContent)).toContain('取消定稿');
  surface.destroy();
});

it('asks about a category in an app strip that names it and its documents, and shows the service\'s refusal (#1551)', async () => {
  const { root, methods, setStatus, surface } = setup(); await flush(); click(root, '管理衍生稿件类别');
  const strip = (): HTMLElement | null => root.querySelector<HTMLElement>('.derivatives-confirm');
  click(root.querySelector<HTMLElement>('[data-derivative-type="news-release"]')!, '删除类别');
  expect(strip()!.textContent).toContain('新闻稿');
  expect(strip()!.textContent).toContain('20 篇衍生稿件');
  click(strip()!, '确认删除'); await flush();
  expect(methods.deleteProductionDocumentType).toHaveBeenCalledWith({ typeId: 'news-release' });
  // The service's own refusal stands in the strip; the renderer copied none of its rule.
  expect(strip()!.textContent).toContain('这个类别下还有衍生稿件，请先改到别的类别。');
  // Said once, where the editor is looking: the status bar does not repeat it.
  expect(setStatus).not.toHaveBeenCalledWith(expect.stringContaining('这个类别下还有衍生稿件'), 'error');
  // Asking and cancelling repaint only the strip: a category name being typed stays as it is.
  const typed = root.querySelector<HTMLInputElement>('[aria-label="新类别名称"]')!; typed.value = '还没保存的名称';
  click(root.querySelector<HTMLElement>('[data-derivative-type="custom"]')!, '删除类别');
  click(strip()!, '取消');
  expect(strip()).toBeNull();
  expect(document.activeElement?.textContent).toBe('删除类别');
  expect(root.querySelector('[aria-label="新类别名称"]')).toBe(typed);
  expect(typed.value).toBe('还没保存的名称');
  surface.destroy();
});

it('keeps the category strip working after another action and drops it when its category is gone (#1551)', async () => {
  const { root, methods, surface, projection } = setup([{ typeId: 'empty', label: '空类别', notForThisBook: false, documents: [], document: null }]);
  await flush(); click(root, '管理衍生稿件类别');
  const strip = (): HTMLElement | null => root.querySelector<HTMLElement>('.derivatives-confirm');
  click(root.querySelector<HTMLElement>('[data-derivative-type="empty"]')!, '删除类别');
  expect(strip()!.textContent).toContain('空类别');
  expect(strip()!.textContent).toContain('0 篇衍生稿件');
  click(root, '添加类别'); await flush();
  expect(strip()).not.toBeNull();
  // Closing the category editor takes the question with it, and opening it again does not bring it back.
  click(root, '管理衍生稿件类别');
  expect(strip()).toBeNull();
  click(root, '管理衍生稿件类别');
  expect(strip()).toBeNull();
  click(root.querySelector<HTMLElement>('[data-derivative-type="empty"]')!, '删除类别');
  click(strip()!, '确认删除'); await flush();
  expect(methods.deleteProductionDocumentType).toHaveBeenCalledWith({ typeId: 'empty' });
  expect(root.querySelector('[data-derivative-type="empty"]')).toBeNull();
  // A category removed elsewhere takes its question with it.
  click(root.querySelector<HTMLElement>('[data-derivative-type="custom"]')!, '删除类别');
  expect(strip()).not.toBeNull();
  const types = projection.types as ProductionDocumentTypeProjection[];
  types.splice(types.findIndex((type) => type.typeId === 'custom'), 1);
  click(root, '添加类别'); await flush();
  expect(strip()).toBeNull();
  surface.destroy();
});

it('records 本书不做 only after an import is committed, so a closed picker decides nothing (#1551)', async () => {
  const { root, methods, surface } = setup([{ typeId: 'not-for-book', label: '本书不做类型', notForThisBook: true, documents: [], document: null }]);
  await flush();
  click(root, '+ 新建衍生稿件');
  const form = root.querySelector<HTMLElement>('.derivative-create-form')!;
  const type = form.querySelector<HTMLSelectElement>('select[data-document-field="type"]')!;
  type.value = 'not-for-book'; change(type);
  const radio = [...root.querySelectorAll<HTMLInputElement>('.derivative-create-form .derivative-modes input')]
    .find((node) => node.value === 'import')!;
  radio.checked = true; change(radio);
  click(root.querySelector<HTMLElement>('.derivative-create-form')!, '创建并打开'); await flush();
  // The picker answered cancelled: nothing is decided and nothing is made.
  expect(methods.decideProductionDocumentType).not.toHaveBeenCalled();
  expect(methods.createProductionDocument).not.toHaveBeenCalled();
  surface.destroy();
});

it('follows an AI 写作 start on the management page and opens its draft (#1551)', async () => {
  const { root, methods, openDocument, writingLaunch, surface, recordStart } =
    setup([{ typeId: 'promotion-article', label: '宣传文章', notForThisBook: false, documents: [], document: null }]);
  await flush();
  click(root, '+ 新建衍生稿件');
  const form = root.querySelector<HTMLElement>('.derivative-create-form')!;
  const type = form.querySelector<HTMLSelectElement>('select[data-document-field="type"]')!;
  type.value = 'promotion-article'; change(type);
  const radio = [...root.querySelectorAll<HTMLInputElement>('.derivative-create-form .derivative-modes input')]
    .find((node) => node.value === 'writing')!;
  radio.checked = true; change(radio); await flush();
  expect(root.querySelector('.writing-task-sheet')).not.toBeNull();
  expect(root.querySelector<HTMLInputElement>('.writing-task-sheet [data-document-field="title"]')!.value).toBe('《测试图书》宣传文章');
  const before = methods.inspectWritingTask.mock.calls.length;
  // The launch bar (0.7.3) owns the start control; the sheet hands it this task's request and the start's follow-up.
  expect(writingLaunch).toHaveBeenCalledOnce();
  recordStart();
  // The recorded start refreshes this page's writing surface at once: it follows the task and opens the new draft.
  const request = writingLaunch.mock.calls[0]![0] as { beforeLaunch?: () => Promise<boolean>; onStarted?: () => void };
  expect(await request.beforeLaunch?.()).toBe(true);
  request.onStarted?.();
  await flush(); await flush();
  expect(methods.inspectWritingTask.mock.calls.length).toBeGreaterThan(before);
  expect(methods.createWritingDraft).toHaveBeenCalledWith({ revisionId: 'draft-1', title: '《测试图书》宣传文章' });
  expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-98' }), expect.objectContaining({ typeId: 'promotion-article' }));
  surface.destroy();
});
