import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptExportFormat, type ProductionDocumentProjection,
  type ProductionDocumentsProjection, type RendererApi } from '../shared/protocol.js';
import { importedDerivativeTitle } from './manuscript-switcher.js';
import { localInstantLabel } from './plan-preview-labels.js';

interface WorkspaceOptions {
  root: HTMLElement;
  bookId: string;
  bookTitle: string;
  api: RendererApi;
  openDocument(document: ProductionDocumentProjection, type: { typeId: string; label: string }, notice?: string | null): Promise<void>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** A book's derivatives share the manuscript editor; this surface owns browsing and management only. */
export function mountDerivativesWorkspace(options: WorkspaceOptions): { start(): void; destroy(): void } {
  const { root, api } = options;
  root.classList.add('derivatives-workspace');
  let stopped = false;
  let busy = false;
  let projection: ProductionDocumentsProjection | null = null;
  let category = '';
  let status = '';
  let keyword = '';
  let managing = false;
  let creating = false;
  let createType = '';
  let createTitle = '';
  const heading = el('h2', '衍生稿件');
  const toolbar = el('div', undefined, 'derivatives-toolbar');
  const createPanel = el('div', undefined, 'derivatives-create-panel');
  const categories = el('section', undefined, 'derivatives-category-editor');
  const chips = el('nav', undefined, 'derivatives-category-chips');
  chips.setAttribute('aria-label', '按衍生稿件类别筛选');
  const filters = el('div', undefined, 'derivatives-filters');
  const search = el('input');
  search.type = 'search'; search.placeholder = '搜索题目或正文'; search.setAttribute('aria-label', '搜索衍生稿件');
  search.addEventListener('input', () => { keyword = search.value; paintList(); });
  const statusSelect = el('select'); statusSelect.setAttribute('aria-label', '衍生稿件状态');
  for (const [value, label] of [['', '全部状态'], ['draft', '草稿'], ['final', '已定稿']]) {
    const option = el('option', label); option.value = value!; statusSelect.append(option);
  }
  statusSelect.addEventListener('change', () => { status = statusSelect.value; paintList(); });
  filters.append(search, statusSelect);
  const list = el('ul', undefined, 'derivatives-list');
  const resultCount = el('p', '', 'field-note'); resultCount.setAttribute('role', 'status');
  root.append(heading, toolbar, createPanel, categories, chips, filters, resultCount, list);

  function button(label: string, run: () => void, className = 'secondary'): HTMLButtonElement {
    const node = el('button', label, `btn ${className}`); node.type = 'button'; node.disabled = busy;
    node.addEventListener('click', run); return node;
  }

  function typeSelect(value: string): HTMLSelectElement {
    const select = el('select'); select.setAttribute('aria-label', '衍生稿件类别');
    for (const type of projection?.types ?? []) {
      const option = el('option', type.label); option.value = type.typeId; select.append(option);
    }
    select.value = value; return select;
  }

  async function refresh(): Promise<void> {
    const next = await api.inspectProductionDocuments();
    if (stopped) return;
    if (next.bookId !== options.bookId) throw new Error('衍生稿件不属于当前图书。');
    projection = next;
    if (!next.types.some((type) => type.typeId === category)) category = '';
    if (!next.types.some((type) => type.typeId === createType)) createType = next.types[0]?.typeId ?? '';
    paint();
  }

  async function act(operation: () => Promise<void>, message = '已保存'): Promise<void> {
    if (busy || stopped) return;
    busy = true;
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select').forEach((node) => { node.disabled = true; });
    try {
      await operation();
      if (!stopped) { if (message) options.setStatus(message, 'success'); await refresh(); }
    } catch (error) {
      if (!stopped) options.setStatus(options.errorMessage(error, '操作未完成，请重试。'), 'error');
    } finally {
      busy = false;
      if (!stopped) { search.disabled = false; statusSelect.disabled = false; paint(); }
    }
  }

  function paint(): void {
    if (projection === null || stopped) return;
    const total = projection.types.reduce((count, type) => count + type.documents.length, 0);
    heading.textContent = `衍生稿件 (${total})`;
    const create = button('+ 新建衍生稿件', () => { creating = !creating; paintCreate(); }, 'primary');
    const importFile = button('导入外部文档为衍生稿件', () => void act(() => createDocument(true), '已导入衍生稿件'));
    create.disabled = busy || projection.unavailableReason !== null || createType === '';
    importFile.disabled = create.disabled;
    const importType = typeSelect(createType); importType.setAttribute('aria-label', '新建或导入的类别'); importType.disabled = busy;
    importType.addEventListener('change', () => { createType = importType.value; paintCreate(); });
    toolbar.replaceChildren(create, importType, importFile, button('管理衍生稿件类别', () => { managing = !managing; paintCategories(); }));
    paintCreate(); paintCategories(); paintChips(); paintList();
  }

  function paintCreate(): void {
    createPanel.replaceChildren(); createPanel.hidden = !creating;
    if (!creating) return;
    const title = el('input'); title.placeholder = '稿件题目（可留空）'; title.setAttribute('aria-label', '新衍生稿件题目');
    title.maxLength = 80; title.value = createTitle; title.disabled = busy;
    title.addEventListener('input', () => { createTitle = title.value; });
    const type = typeSelect(createType); type.disabled = busy; type.addEventListener('change', () => { createType = type.value; });
    createPanel.append(title, type, button('创建并打开', () => void act(() => createDocument(false), '已新建衍生稿件'), 'primary'),
      button('取消', () => { creating = false; paintCreate(); }, 'quiet'));
  }

  async function createDocument(importFile: boolean): Promise<void> {
    const type = projection?.types.find((entry) => entry.typeId === createType);
    if (type === undefined) return;
    let sourceVersionId: string | null = null;
    let title = createTitle.trim();
    if (importFile) {
      const picked = await api.selectAndStageManuscript();
      if (picked.status === 'cancelled' || stopped) return;
      const staged = picked.staged;
      if (!['DOCX', 'TXT', 'MD'].includes(staged.source.format)) {
        await api.abandonImportDraft({ draftId: staged.draftId, expectedDraftVersion: staged.draftVersion, preserveBookRoute: true });
        throw new Error('请选择 DOCX、TXT 或 Markdown 文件。');
      }
      const review = await api.prepareSourceImportReview({ draftId: staged.draftId, expectedDraftVersion: staged.draftVersion,
        target: { kind: 'existing-book', bookId: options.bookId, relationship: 'source-only', reuseSourceVersionId: null } });
      const imported = await api.commitSourceImport({ draftId: review.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitAttemptId: review.commitAttemptId });
      await api.acknowledgeImportCompletion({ commitId: imported.commitId });
      sourceVersionId = imported.sourceVersionId;
      if (!title) title = importedDerivativeTitle(staged.source.displayName);
    }
    if (type.notForThisBook) await api.decideProductionDocumentType({ typeId: type.typeId, notForThisBook: false });
    const result = await api.createProductionDocument({ typeId: type.typeId, sourceVersionId, ...(title ? { title } : {}) });
    if (stopped) return;
    if (result.bookId !== options.bookId || result.document === null) throw new Error('未能创建衍生稿件。');
    await options.openDocument(result.document, type, result.notice);
  }

  function paintCategories(): void {
    categories.replaceChildren(); categories.hidden = !managing;
    if (!managing || projection === null) return;
    categories.append(el('h3', '管理衍生稿件类别'));
    const types = projection.types;
    types.forEach((type, index) => {
      const row = el('div', undefined, 'derivatives-category-row');
      const name = el('input'); name.value = type.label; name.maxLength = 80; name.disabled = busy;
      name.setAttribute('aria-label', `类别名称：${type.label}`);
      const move = (delta: number): void => {
        const ids = types.map((entry) => entry.typeId);
        [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
        void act(async () => { await api.reorderProductionDocumentTypes({ typeIds: ids }); });
      };
      const up = button('上移', () => move(-1)); up.disabled = busy || index === 0;
      const down = button('下移', () => move(1)); down.disabled = busy || index === types.length - 1;
      row.append(name, button('保存名称', () => void act(async () => { await api.saveProductionDocumentType({ typeId: type.typeId, name: name.value }); })), up, down,
        button('删除类别', () => { if (window.confirm(`删除「${type.label}」类别？`)) void act(async () => { await api.deleteProductionDocumentType({ typeId: type.typeId }); }, '已删除类别'); }, 'quiet'));
      categories.append(row);
    });
    const name = el('input'); name.placeholder = '新类别名称'; name.setAttribute('aria-label', '新类别名称'); name.maxLength = 80; name.disabled = busy;
    categories.append(name, button('添加类别', () => void act(async () => { await api.saveProductionDocumentType({ name: name.value }); })));
  }

  function paintChips(): void {
    if (projection === null) return;
    chips.replaceChildren();
    const total = projection.types.reduce((count, type) => count + type.documents.length, 0);
    for (const type of [{ typeId: '', label: '全部', count: total }, ...projection.types.map((type) => ({ ...type, count: type.documents.length }))]) {
      const chip = button(`${type.label} (${type.count})`, () => { category = type.typeId; paintChips(); paintList(); }, 'quiet');
      chip.setAttribute('aria-pressed', String(category === type.typeId)); chip.dataset['derivativeCategory'] = type.typeId;
      chips.append(chip);
    }
  }

  function paintList(): void {
    if (projection === null || stopped) return;
    list.replaceChildren();
    const query = keyword.normalize('NFC').trim().toLocaleLowerCase();
    const rows = projection.types.flatMap((type) => type.documents.map((document) => ({ type, document })))
      .filter(({ type, document }) => (!category || type.typeId === category) && (!status || (document.finalized ? 'final' : 'draft') === status) &&
        (!query || `${document.title} ${document.preview ?? ''}`.normalize('NFC').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (b.document.updatedAt ?? b.document.createdAt).localeCompare(a.document.updatedAt ?? a.document.createdAt));
    resultCount.textContent = `显示 ${rows.length} 篇`;
    if (!rows.length) list.append(el('li', projection.unavailableReason ?? '暂无符合条件的衍生稿件。', 'derivatives-empty'));
    for (const { type, document: doc } of rows) {
      const row = el('li', undefined, 'derivatives-item'); row.dataset['derivativeDocument'] = doc.documentId;
      const title = el('input'); title.value = doc.title; title.maxLength = 80; title.disabled = busy; title.setAttribute('aria-label', `稿件题目：${doc.title}`);
      const categorySelect = typeSelect(type.typeId); categorySelect.disabled = busy;
      categorySelect.addEventListener('change', () => void act(async () => { await api.updateProductionDocumentMeta({ documentId: doc.documentId, typeId: categorySelect.value }); }));
      const meta = el('div', undefined, 'derivatives-item-meta');
      meta.append(categorySelect, el('span', doc.finalized ? '已定稿' : '草稿', 'status-pill'), el('span', `${doc.characterCount ?? 0} 字`),
        el('time', localInstantLabel(doc.updatedAt ?? doc.createdAt)));
      const actions = el('div', undefined, 'derivatives-item-actions');
      actions.append(button('打开编辑', () => void act(() => options.openDocument(doc, type), ''), 'primary'),
        button('保存题目', () => void act(async () => { await api.renameProductionDocument({ documentId: doc.documentId, title: title.value }); })),
        button(doc.finalized ? '撤回草稿' : '设为定稿', () => void act(async () => { await api.updateProductionDocumentMeta({ documentId: doc.documentId, finalized: !doc.finalized }); })),
        button('导出 DOCX', () => void act(() => exportDocument(doc, 'docx'), '')),
        button('导出 MD', () => void act(() => exportDocument(doc, 'markdown'), '')),
        button('删除', () => { if (window.confirm(`删除衍生稿件「${doc.title}」？`)) void act(async () => { await api.updateProductionDocumentMeta({ documentId: doc.documentId, deleted: true }); }, '已删除衍生稿件'); }, 'quiet'));
      row.append(title, meta, el('p', doc.preview ?? '', 'derivatives-preview'), actions); list.append(row);
    }
  }

  async function exportDocument(doc: ProductionDocumentProjection, format: ManuscriptExportFormat): Promise<void> {
    // Main grants the existing document capability on read, including for documents never opened on this screen.
    const opened = await api.getManuscriptWindow({ manuscriptId: doc.documentId, branchId: doc.branchId, cursor: null });
    if (stopped) return;
    if (opened.bookId !== options.bookId) throw new Error('衍生稿件不属于当前图书。');
    const saved = await api.saveProductionDocumentVersion({ documentId: doc.documentId, branchId: doc.branchId });
    if (stopped || saved.document === null || saved.bookId !== options.bookId) return;
    const target = { kind: 'document' as const, documentId: doc.documentId, revisionId: saved.document.versions[0]!.revisionId };
    const exportOptions = DEFAULT_MANUSCRIPT_EXPORT_OPTIONS;
    const review = await api.reviewManuscriptExport({ target, options: exportOptions, format });
    if (stopped || review.bookId !== options.bookId) return;
    const chosen = await api.chooseManuscriptExportDestination({ revisionId: review.target.revisionId, target,
      options: exportOptions, reviewDigest: review.reviewDigest, suggestedFileName: review.suggestedFileName, format: review.format });
    if (stopped || chosen.outcome === 'cancelled') return;
    const result = await api.approveManuscriptExport({ preparationId: chosen.preparation.preparationId });
    if (!stopped) options.setStatus(result.outcomeLabel, result.outcome === 'created' || result.outcome === 'replaced' ? 'success' : 'error');
  }

  return { start: () => { void refresh().catch((error: unknown) => { if (!stopped) options.setStatus(options.errorMessage(error, '无法读取衍生稿件。'), 'error'); }); },
    destroy: () => { stopped = true; } };
}
