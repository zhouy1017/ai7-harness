import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptExportFormat, type ProductionDocumentProjection,
  type ProductionDocumentsProjection, type RendererApi, type ServiceWireJobProjection as ServiceJobProjection } from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { documentCreatedLine } from './production-document-labels.js';
import { showToast } from './components/toast.js';
import { menuPanel } from './components/controls.js';
import { DERIVATIVE_CREATE_WORDS, createDerivative, derivativeCreateForm, suggestedDerivativeTitle,
  type DerivativeCreateFocus, type DerivativeCreateState } from './components/derivative-create.js';
import { mountWritingTask, type WritingTaskSurface } from './writing-task.js';
import type { TaskLaunchRequest } from './task-drawer.js';

/** What the management page needs of the writing surface it hosts for AI 写作生成, as 稿件 hosts it. */
interface WritingOptions {
  awaitServiceJob(job: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  openLaunch(request: TaskLaunchRequest): void;
  openWritingPlan(taskIntentId: string, note?: string): void;
}

interface WorkspaceOptions {
  root: HTMLElement;
  bookId: string;
  bookTitle: string;
  api: RendererApi;
  openDocument(document: ProductionDocumentProjection, type: { typeId: string; label: string }, notice?: string | null): Promise<void>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** AI 写作生成's one writing sheet, hosted here as 稿件 hosts it. */
  writing: WritingOptions;
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
  let form: DerivativeCreateState | null = null;
  /** The category 删除类别 asks about, and the service's refusal while it stands. */
  let pendingDelete: string | null = null;
  let deleteProblem: string | null = null;
  const heading = el('h2', '衍生稿件');
  const toolbar = el('div', undefined, 'derivatives-toolbar');
  const createPanel = el('div', undefined, 'derivatives-create-panel');
  const writingHost = el('div', undefined, 'derivative-writing-host');
  const categories = el('section', undefined, 'derivatives-category-editor');
  /** Where 删除类别's question stands, so asking and cancelling repaint only it and never the names being typed above. */
  const stripSlot = el('div');
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
  root.append(heading, toolbar, createPanel, writingHost, categories, chips, filters, resultCount, list);

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
    if (form !== null && !next.types.some((type) => type.typeId === form!.typeId)) form = null;
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

  function paint(focus: DerivativeCreateFocus = null): void {
    if (projection === null || stopped) return;
    const total = projection.types.reduce((count, type) => count + type.documents.length, 0);
    heading.textContent = `衍生稿件 (${total})`;
    const create = button(form === null ? '+ 新建衍生稿件' : '收起新建表单', () => {
      if (form !== null) { form = null; paint(); return; }
      const first = projection?.types[0];
      if (first === undefined) return;
      form = { title: suggestedDerivativeTitle(options.bookTitle, first.label, first.documents.length),
        titleEdited: false, typeId: first.typeId, mode: 'blank', sourceVersionId: null, problem: null };
      paint('title');
    }, 'primary');
    create.disabled = busy || projection.unavailableReason !== null || projection.types.length === 0;
    create.dataset['derivativeAction'] = 'new';
    const manageCategories = button('管理衍生稿件类别', () => { managing = !managing; paintCategories(); });
    manageCategories.dataset['derivativeAction'] = 'categories';
    toolbar.replaceChildren(create, manageCategories);
    paintCreate(focus); paintCategories(); paintChips(); paintList();
  }

  function paintCreate(focus: DerivativeCreateFocus): void {
    createPanel.replaceChildren();
    createPanel.hidden = form === null;
    if (form === null || projection === null) return;
    const state = form;
    const built = derivativeCreateForm({
      state,
      types: projection.types,
      sources: projection.sources,
      busy,
      focus,
      suggest: (typeId) => {
        const type = projection?.types.find((entry) => entry.typeId === typeId);
        return type === undefined ? '' : suggestedDerivativeTitle(options.bookTitle, type.label, type.documents.length);
      },
      changed: (next) => paint(next),
      run: () => void create(state),
      cancel: () => { form = null; paint(); },
    });
    createPanel.append(built.element);
    built.focus();
  }

  /** The four ways of the editor's menu: AI 写作生成 opens the one writing sheet, the others make the document here. */
  async function create(state: DerivativeCreateState): Promise<void> {
    if (busy || stopped || projection === null || form !== state) return;
    const type = projection.types.find((entry) => entry.typeId === state.typeId);
    if (type === undefined) return;
    if (state.mode === 'writing') {
      form = null;
      paint();
      writingSurface().open(type.typeId, state.title);
      return;
    }
    if (state.mode === 'source' && state.sourceVersionId === null) { state.problem = DERIVATIVE_CREATE_WORDS.pickSource; paint('source'); return; }
    busy = true;
    paint();
    const mode = state.mode;
    try {
      const outcome = await createDerivative({ api, bookId: options.bookId, types: projection.types, state: { ...state, mode } });
      if (stopped) return;
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'problem') { state.problem = outcome.problem; paint(outcome.focus); return; }
      form = null;
      projection = outcome.documents;
      paint();
      options.setStatus(documentCreatedLine(outcome.document.title), 'success');
      await options.openDocument(outcome.document, outcome.type, outcome.notice);
    } catch (error) {
      if (stopped) return;
      state.problem = options.errorMessage(error, DERIVATIVE_CREATE_WORDS.createFailed);
      options.setStatus(state.problem, 'error');
    } finally {
      busy = false;
      if (!stopped) paint(form === null ? null : 'confirm');
    }
  }

  let writing: WritingTaskSurface | null = null;
  /** 稿件's writing surface, mounted beside this page's form the first time AI 写作生成 asks for it. */
  function writingSurface(): WritingTaskSurface {
    if (writing === null) {
      writing = mountWritingTask({
        root: writingHost,
        api,
        embedded: true,
        suggestTitle: (typeId) => {
          const type = projection?.types.find((entry) => entry.typeId === typeId);
          return type === undefined ? '' : suggestedDerivativeTitle(options.bookTitle, type.label, type.documents.length);
        },
        setStatus: options.setStatus,
        errorMessage: options.errorMessage,
        awaitServiceJob: options.writing.awaitServiceJob,
        openPlan: options.writing.openWritingPlan,
        // The writing surface is this page's only poller: a start from its sheet refreshes it at once, so the task is
        // followed and its draft opens here (the editor's own registration lives in index.ts and is not this screen's).
        openLaunch: (request: TaskLaunchRequest) => options.writing.openLaunch({ ...request,
          onStarted: () => { request.onStarted?.(); writing?.refresh(); } } as TaskLaunchRequest),
        openDocument: (document, type) => options.openDocument(document, type),
        documentsChanged: () => { void reload(); },
      });
    }
    return writing;
  }

  async function reload(): Promise<void> {
    try {
      await refresh();
    } catch (error) {
      if (!stopped) options.setStatus(options.errorMessage(error, '无法读取衍生稿件。'), 'error');
    }
  }

  function paintCategories(): void {
    categories.replaceChildren(); categories.hidden = !managing;
    if (!managing || projection === null) { pendingDelete = null; deleteProblem = null; stripSlot.replaceChildren(); return; }
    categories.append(el('h3', '管理衍生稿件类别'));
    const types = projection.types;
    types.forEach((type, index) => {
      const row = el('div', undefined, 'derivatives-category-row');
      row.dataset['derivativeType'] = type.typeId;
      const name = el('input'); name.value = type.label; name.maxLength = 80; name.disabled = busy;
      name.setAttribute('aria-label', `类别名称：${type.label}`);
      const move = (delta: number): void => {
        const ids = types.map((entry) => entry.typeId);
        [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
        void act(async () => { await api.reorderProductionDocumentTypes({ typeIds: ids }); });
      };
      const up = button('上移', () => move(-1)); up.disabled = busy || index === 0;
      const down = button('下移', () => move(1)); down.disabled = busy || index === types.length - 1;
      const remove = button('删除类别', () => {
        pendingDelete = type.typeId; deleteProblem = null; paintStrip();
        categories.querySelector<HTMLElement>('.derivatives-confirm [data-derivative-confirm="yes"]')?.focus();
      }, 'quiet');
      remove.dataset['derivativeAction'] = 'delete-type';
      row.append(name, button('保存名称', () => void act(async () => { await api.saveProductionDocumentType({ typeId: type.typeId, name: name.value }); })), up, down, remove);
      categories.append(row);
    });
    const name = el('input'); name.placeholder = '新类别名称'; name.setAttribute('aria-label', '新类别名称'); name.maxLength = 80; name.disabled = busy;
    const add = button('添加类别', () => void act(async () => { await api.saveProductionDocumentType({ name: name.value }); }));
    add.dataset['derivativeAction'] = 'add-type';
    categories.append(name, add, stripSlot);
    paintStrip();
  }

  function paintStrip(): void {
    stripSlot.replaceChildren();
    if (pendingDelete === null || projection === null) return;
    const type = projection.types.find((entry) => entry.typeId === pendingDelete);
    // A category removed elsewhere takes its question with it.
    if (type === undefined) { pendingDelete = null; deleteProblem = null; return; }
    stripSlot.append(deleteStrip(type));
  }

  /**
   * 删除类别 asks in an in-app strip (Issue #1551) that always names the category and how many documents it holds; 确认删除
   * asks the service, whose refusal for a category still in use is said here.
   */
  function deleteStrip(type: ProductionDocumentsProjection['types'][number]): HTMLElement {
    const strip = el('div', undefined, 'derivatives-confirm');
    strip.setAttribute('role', 'alert');
    strip.append(el('span', `删除「${type.label}」类别？类别里有 ${type.documents.length} 篇衍生稿件。`));
    if (deleteProblem !== null) strip.append(el('p', deleteProblem, 'derivatives-confirm-problem'));
    const yes = button('确认删除', () => void deleteType(type), 'danger');
    yes.dataset['derivativeConfirm'] = 'yes';
    const no = button('取消', () => { pendingDelete = null; deleteProblem = null; paintStrip(); focusDeleteType(type.typeId); }, 'quiet');
    no.dataset['derivativeConfirm'] = 'no';
    strip.append(yes, no);
    return strip;
  }

  function focusDeleteType(typeId: string): void {
    const row = Array.from(categories.querySelectorAll<HTMLElement>('[data-derivative-type]')).find((node) => node.dataset['derivativeType'] === typeId);
    row?.querySelector<HTMLElement>('[data-derivative-action="delete-type"]')?.focus();
  }

  /** One delete, its refusal kept in the strip that asked; nothing of the service's rule is copied here. */
  async function deleteType(type: ProductionDocumentsProjection['types'][number]): Promise<void> {
    if (busy || stopped) return;
    busy = true;
    paintCategories();
    try {
      await api.deleteProductionDocumentType({ typeId: type.typeId });
      if (stopped) return;
      pendingDelete = null; deleteProblem = null;
      options.setStatus('已删除类别', 'success');
      await refresh();
    } catch (error) {
      if (stopped) return;
      deleteProblem = options.errorMessage(error, '删除类别未完成，请重试。');
      options.setStatus(deleteProblem, 'error');
    } finally {
      busy = false;
      if (!stopped) paint();
    }
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

  /** The rows the filters show, newest first. */
  function visibleRows(shown: ProductionDocumentsProjection): Array<{ type: ProductionDocumentsProjection['types'][number]; document: ProductionDocumentProjection }> {
    const query = keyword.normalize('NFC').trim().toLocaleLowerCase();
    return shown.types.flatMap((type) => type.documents.map((document) => ({ type, document })))
      .filter(({ type, document }) => (!category || type.typeId === category) && (!status || (document.finalized ? 'final' : 'draft') === status) &&
        (!query || `${document.title} ${document.preview ?? ''}`.normalize('NFC').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (b.document.updatedAt ?? b.document.createdAt).localeCompare(a.document.updatedAt ?? a.document.createdAt));
  }

  /** One row: its 稿件题目 as text until 改名 or a double-click edits it, then its category and its two menus. */
  function paintList(): void {
    if (projection === null || stopped) return;
    list.replaceChildren();
    const rows = visibleRows(projection);
    resultCount.textContent = `显示 ${rows.length} 篇`;
    if (!rows.length) list.append(el('li', projection.unavailableReason ?? '暂无符合条件的衍生稿件。', 'derivatives-empty'));
    for (const { type, document: doc } of rows) {
      const row = el('li', undefined, 'derivatives-item'); row.dataset['derivativeDocument'] = doc.documentId;
      const titleRow = el('div', undefined, 'derivatives-item-title');
      const titleText = el('span', doc.title, 'derivatives-item-title-text');
      const timeNode = el('time', localInstantLabel(doc.updatedAt ?? doc.createdAt));
      let moreSummary: HTMLElement | null = null;
      /**
       * A saved title changes the row's time and place, so the list is read again. Only a key's save moves the rows (and
       * gives 改名 its focus back); a save by leaving the field may be the first half of a press on another row, so it
       * only refreshes this row's time, and a row being edited elsewhere keeps its field.
       */
      const reread = async (byKey: boolean): Promise<void> => {
        const hadFocus = document.activeElement === rename;
        try {
          const next = await api.inspectProductionDocuments();
          if (stopped) return;
          if (next.bookId !== options.bookId) throw new Error('衍生稿件不属于当前图书。');
          projection = next;
          const fresh = next.types.flatMap((entry) => entry.documents).find((entry) => entry.documentId === doc.documentId);
          if (fresh !== undefined) timeNode.textContent = localInstantLabel(fresh.updatedAt ?? fresh.createdAt);
          if (!byKey || list.querySelector('.derivatives-item-title-input') !== null) return;
          // The rows are moved, not rebuilt, so nothing a hand is aimed at is replaced.
          const order = visibleRows(next).map(({ document: shown }) => shown.documentId);
          const nodes = new Map(Array.from(list.children, (node) => [(node as HTMLElement).dataset['derivativeDocument'], node]));
          if (order.every((id, index) => list.children[index] === nodes.get(id))) return;
          for (const id of order) { const node = nodes.get(id); if (node !== undefined) list.append(node); }
          if (hadFocus) rename.focus();
        } catch (error) {
          if (!stopped) options.setStatus(options.errorMessage(error, '无法读取衍生稿件。'), 'error');
        }
      };
      const beginRename = (): void => {
        if (titleRow.querySelector('.derivatives-item-title-input') !== null) return;
        const input = el('input', undefined, 'derivatives-item-title-input');
        input.value = doc.title; input.maxLength = 80; input.disabled = busy;
        input.setAttribute('aria-label', `稿件题目：${doc.title}`);
        let done = false;
        const restore = (focusRename: boolean): void => { titleRow.replaceChildren(titleText, rename); if (focusRename) rename.focus(); };
        const finish = (save: boolean, byKey = false): void => {
          if (done) return; done = true;
          const title = input.value.trim();
          // Only a changed, non-empty title is written; Enter and leaving the field both save once. Nothing of the page
          // is disabled here, so the click that took focus away still reaches what it was aimed at.
          if (!save || title === '' || title === doc.title) { restore(true); return; }
          void commitTitle(title, byKey);
        };
        const commitTitle = async (title: string, byKey: boolean): Promise<void> => {
          input.disabled = true;
          try {
            const result = await api.renameProductionDocument({ documentId: doc.documentId, title });
            if (stopped) return;
            doc.title = result.document?.title ?? title;
            titleText.textContent = doc.title;
            moreSummary?.setAttribute('aria-label', `更多操作：${doc.title}`);
            restore(byKey);
            options.setStatus('已保存', 'success');
          } catch (error) {
            if (stopped) return;
            // The typed text stays where it is, ready to be saved again (or given up with Escape).
            input.disabled = false;
            input.focus();
            done = false;
            options.setStatus(options.errorMessage(error, '题目未改成，请重试。'), 'error');
            return;
          }
          await reread(byKey);
        };
        input.addEventListener('keydown', (event) => {
          if (event.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter') { event.preventDefault(); finish(true, true); }
          else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
        titleRow.replaceChildren(input);
        input.focus();
        input.select?.();
      };
      titleText.addEventListener('dblclick', beginRename);
      const rename = button('改名', beginRename, 'quiet small');
      rename.dataset['derivativeAction'] = 'rename';
      titleRow.append(titleText, rename);
      const categorySelect = typeSelect(type.typeId); categorySelect.disabled = busy;
      categorySelect.addEventListener('change', () => void act(async () => { await api.updateProductionDocumentMeta({ documentId: doc.documentId, typeId: categorySelect.value }); }));
      const meta = el('div', undefined, 'derivatives-item-meta');
      meta.append(categorySelect, el('span', doc.finalized ? '已定稿' : '草稿', 'status-pill'), el('span', `${doc.characterCount ?? 0} 字`),
        timeNode);
      const actions = el('div', undefined, 'derivatives-item-actions');
      const open = button('打开编辑', () => void act(() => options.openDocument(doc, type), ''), 'primary');
      open.dataset['derivativeAction'] = 'open';
      const exportDocx = button('导出 DOCX', () => void act(() => exportDocument(doc, 'docx'), ''), 'secondary');
      exportDocx.dataset['derivativeAction'] = 'export-docx';
      const exportMarkdown = button('导出 MD', () => void act(() => exportDocument(doc, 'markdown'), ''), 'secondary');
      exportMarkdown.dataset['derivativeAction'] = 'export-markdown';
      const exportMenu = rowMenu('导出 ▾', 'export', [exportDocx, exportMarkdown]);
      // One step with 撤销 (Issue #1431 item 28): the delete is a soft record the toast's action restores.
      const finalize = button(doc.finalized ? '取消定稿' : '设为定稿', () => void act(async () => { await api.updateProductionDocumentMeta({ documentId: doc.documentId, finalized: !doc.finalized }); }), 'secondary');
      finalize.dataset['derivativeAction'] = doc.finalized ? 'unfinalize' : 'finalize';
      const remove = button('删除', () => void act(async () => {
        await api.updateProductionDocumentMeta({ documentId: doc.documentId, deleted: true });
        showToast(`已删除「${doc.title}」`, { tone: 'success', action: { label: '撤销', run: () => void act(async () => {
          await api.updateProductionDocumentMeta({ documentId: doc.documentId, deleted: false });
        }, '已恢复衍生稿件') } });
      }, ''), 'quiet');
      remove.dataset['derivativeAction'] = 'delete';
      const moreMenu = rowMenu('⋯', 'more', [finalize, remove]);
      moreSummary = moreMenu.querySelector('summary')!;
      moreSummary.setAttribute('aria-label', `更多操作：${doc.title}`);
      actions.append(open, exportMenu, moreMenu);
      row.append(titleRow, meta, el('p', doc.preview ?? '', 'derivatives-preview'), actions); list.append(row);
    }
  }

  /** A row's secondary actions in the shared disclosure menu, so Escape, an outside click and focus behave as elsewhere. */
  function rowMenu(summaryText: string, name: string, items: HTMLButtonElement[]): HTMLDetailsElement {
    const menu = el('details', undefined, 'derivative-menu');
    const summary = el('summary', summaryText, 'btn secondary');
    summary.dataset['derivativeRowMenu'] = name;
    const body = menuPanel(...items);
    body.dataset['derivativeRowMenuBody'] = name;
    menu.append(summary, body);
    return menu;
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

  return { start: () => { options.setStatus('衍生稿件'); void reload(); },
    destroy: () => { stopped = true; writing?.destroy(); } };
}
