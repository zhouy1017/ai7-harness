import { menuPanel } from './components/controls.js';
import type {
  ProductionDocumentProjection,
  ProductionDocumentsProjection,
  ProductionDocumentTypeProjection,
  RendererApi,
  ServiceWireJobProjection as ServiceJobProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { DOCUMENT_NO_SOURCES, DOCUMENT_STATUS_LINES, documentCreatedLine, documentSourceLine } from './production-document-labels.js';
import { mountWritingTask, type WritingTaskSurface } from './writing-task.js';

/**
 * 本书稿件 on 稿件 (Issues #1403, #1404): the Book's manuscript and every derivative document — 新闻稿、内容简介、审稿意见 … — side by
 * side as one switcher above the editor, and `+ 新建 / 导入衍生稿件` in place. Its panel asks for the 稿件题目 first, then the
 * type and how to make it — 空白新建, AI 写作, 从来源材料创建 or 导入文件 — and opens what it made. Every name and version is the
 * service's projection; nothing here is recorded beyond the document itself.
 */
export const SWITCHER_WORDS = {
  label: '本书稿件',
  primary: (bookTitle: string) => `主稿件（《${bookTitle}》）`,
  create: '新建 / 导入衍生稿件…',
  draftReady: (count: number) => `草稿已写好 ${count} 篇`,
  writing: 'AI 写作进行中',
  panelHeading: '新建 / 导入衍生稿件',
  title: '稿件题目',
  type: '稿件类型',
  mode: '创建方式',
  source: '来源材料',
  confirm: '创建并打开',
  cancel: '取消',
  pickSource: '请先选择一份来源材料。',
  unavailable: '本书的衍生稿件暂时无法读取。',
} as const;

export type DerivativeCreateMode = 'blank' | 'writing' | 'source' | 'import';
export const DERIVATIVE_CREATE_MODES: ReadonlyArray<readonly [DerivativeCreateMode, string]> = [
  ['blank', '空白新建'],
  ['writing', 'AI 写作生成'],
  ['source', '从来源材料创建'],
  ['import', '导入文件（DOCX / Markdown）'],
];

/** `[新闻稿] 首发媒体通稿`: a derivative document as the switcher lists it. */
export function derivativeSwitchLabel(typeLabel: string, title: string): string {
  return `[${typeLabel}] ${title}`;
}

/** The 稿件题目 offered for a new document of one type: `《书名》新闻稿`, numbered once the Book has one already. */
export function suggestedDerivativeTitle(bookTitle: string, typeLabel: string, existing: number): string {
  const base = `《${bookTitle}》${typeLabel}`;
  const named = existing === 0 ? base : `${base} ${existing + 1}`;
  return Array.from(named).slice(0, 80).join('');
}

/** A file's own name, without its extension, as an imported document's 稿件题目. */
export function importedDerivativeTitle(displayName: string): string {
  return Array.from(displayName.replace(/\.[^.]+$/u, '').normalize('NFC').trim()).slice(0, 80).join('');
}

type SwitcherApi = Pick<RendererApi, 'inspectProductionDocuments' | 'createProductionDocument' | 'decideProductionDocumentType' |
  'selectAndStageManuscript' | 'abandonImportDraft' | 'prepareSourceImportReview' | 'commitSourceImport' | 'acknowledgeImportCompletion' |
  'inspectWritingTask' | 'prepareWritingTask' | 'quickStartWritingTask' | 'createWritingDraft'> &
  Partial<Pick<RendererApi, 'inspectTaskPlan' | 'authorizeWritingTask' | 'searchReferableMaterials'>>;

export interface MountManuscriptSwitcherOptions {
  bookId: string;
  bookTitle: string;
  api: SwitcherApi;
  /** The document on screen, or `null` for the manuscript. */
  currentDocumentId: string | null;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  awaitServiceJob(job: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  /** Leave for the manuscript, its edits settled first by the caller. */
  openPrimary(): Promise<void>;
  openWorkspace?(): Promise<void>;
  /** Open one document in this editor; `notice` says what its creation did not carry. */
  openDocument(document: ProductionDocumentProjection, type: { typeId: string; label: string }, notice?: string | null): Promise<void>;
  openWritingPlan(taskIntentId: string, note?: string): void;
}

export interface ManuscriptSwitcher {
  readonly element: HTMLElement;
  /** A rename on the editor's own title (Issue #1404): the switcher's entry says it at once, then the Book is read again. */
  renamed(documents: ProductionDocumentsProjection): void;
  refreshWriting(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `manuscript-switcher-${prefix}-${identities}`;
}

/** The panel while it is open: what the editor has written and chosen so far. */
interface CreateForm {
  title: string;
  titleEdited: boolean;
  typeId: string;
  mode: DerivativeCreateMode;
  sourceVersionId: string | null;
  problem: string | null;
}

export function mountManuscriptSwitcher(options: MountManuscriptSwitcherOptions): ManuscriptSwitcher {
  const { api, bookId, bookTitle } = options;
  let destroyed = false;
  let working = false;
  let ticket = 0;
  let projection: ProductionDocumentsProjection | null = null;
  let form: CreateForm | null = null;
  let writingState = { underWay: false, drafted: 0 };

  const root = el('div', 'manuscript-switcher');
  const bar = el('nav', 'manuscript-switcher-bar');
  bar.setAttribute('aria-label', SWITCHER_WORDS.label);
  const panel = el('section', 'derivative-create');
  panel.id = uid('panel');
  panel.hidden = true;
  const writingHost = el('div', 'derivative-writing-host');
  root.append(bar, panel, writingHost);
  // Keep the disclosure mounted: writing polls update its state without replaying popup entry animation.
  const list = el('ul', 'manuscript-switcher-list');
  const menu = el('details', 'derivative-menu');
  const trigger = el('summary', 'btn secondary', '衍生稿件 ▾');
  trigger.dataset['derivativeMenu'] = 'true';
  trigger.setAttribute('aria-label', '衍生稿件');
  trigger.setAttribute('aria-haspopup', 'true');
  const createEntry = el('button', 'manuscript-switch-create', SWITCHER_WORDS.create);
  createEntry.type = 'button';
  createEntry.dataset['manuscriptSwitch'] = 'new';
  createEntry.setAttribute('role', 'menuitem');
  createEntry.setAttribute('aria-controls', panel.id);
  createEntry.addEventListener('click', () => { menu.open = false; toggleForm(); });
  const manage = el('button', 'manuscript-switch-manage');
  manage.type = 'button';
  manage.dataset['manuscriptSwitch'] = 'manage';
  manage.setAttribute('role', 'menuitem');
  manage.addEventListener('click', () => { menu.open = false; if (options.openWorkspace) void leave(options.openWorkspace); });
  const menuBody = menuPanel(createEntry, manage);
  menuBody.setAttribute('role', 'menu');
  menuBody.setAttribute('aria-label', '衍生稿件');
  menu.append(trigger, menuBody);
  const state = el('span', 'manuscript-switcher-state');
  bar.append(list, menu, state);


  const documentsOf = (next: ProductionDocumentsProjection): Array<{ type: ProductionDocumentTypeProjection; document: ProductionDocumentProjection }> =>
    next.types.flatMap((type) => type.documents.map((document) => ({ type, document })));
  const suggest = (typeId: string): string => {
    const type = projection?.types.find((entry) => entry.typeId === typeId);
    return type === undefined ? '' : suggestedDerivativeTitle(bookTitle, type.label, type.documents.length);
  };

  const writing: WritingTaskSurface = mountWritingTask({
    root: writingHost,
    api,
    embedded: true,
    suggestTitle: suggest,
    setStatus: options.setStatus,
    errorMessage: options.errorMessage,
    awaitServiceJob: options.awaitServiceJob,
    openPlan: options.openWritingPlan,
    openDocument: (document, type) => options.openDocument(document, type),
    documentsChanged: () => refresh(),
    onState: (state) => {
      writingState = state;
      paintBar();
    },
  });

  function refresh(): void {
    if (destroyed) return;
    const mine = ++ticket;
    void api.inspectProductionDocuments().then(
      (next) => {
        if (destroyed || mine !== ticket || next.bookId !== bookId) return;
        projection = next;
        paintBar();
        if (form !== null) paintPanel(null);
      },
      (error: unknown) => {
        if (destroyed || mine !== ticket) return;
        options.setStatus(options.errorMessage(error, SWITCHER_WORDS.unavailable), 'error');
      },
    );
  }

  function paintBar(): void {
    if (destroyed) return;
    const focused = document.activeElement instanceof HTMLElement && bar.contains(document.activeElement)
      ? document.activeElement.dataset['manuscriptSwitch'] ?? null : null;
    const focusedId = focused === null ? null : (document.activeElement as HTMLElement).dataset['documentId'] ?? null;
    list.replaceChildren();
    const entry = (label: string, kind: 'primary' | 'document', run: () => void, documentId?: string): HTMLButtonElement => {
      const item = el('li');
      const button = el('button', 'quiet manuscript-switch', label);
      button.type = 'button';
      button.dataset['manuscriptSwitch'] = kind;
      if (documentId !== undefined) button.dataset['documentId'] = documentId;
      const current = kind === 'primary' ? options.currentDocumentId === null : options.currentDocumentId === documentId;
      if (current) button.setAttribute('aria-current', 'page');
      button.disabled = working;
      button.addEventListener('click', () => { if (!current) run(); });
      item.append(button);
      list.append(item);
      return button;
    };
    entry(SWITCHER_WORDS.primary(bookTitle), 'primary', () => void leave(() => options.openPrimary()));
    const all = projection === null ? [] : documentsOf(projection);
    const compact = all.length <= 3 ? all : [...all].sort((a, b) => Number(b.document.documentId === options.currentDocumentId) - Number(a.document.documentId === options.currentDocumentId) ||
      (b.document.updatedAt ?? b.document.createdAt).localeCompare(a.document.updatedAt ?? a.document.createdAt)).slice(0, 3);
    for (const { type, document: documentNow } of compact) {
      const button = entry(derivativeSwitchLabel(type.label, documentNow.title), 'document',
        () => void leave(() => options.openDocument(documentNow, { typeId: type.typeId, label: type.label })), documentNow.documentId);
      button.dataset['documentTypeId'] = type.typeId;
    }
    createEntry.setAttribute('aria-expanded', String(form !== null));
    createEntry.disabled = working || projection === null || projection.unavailableReason !== null;
    manage.textContent = `管理全部衍生稿件（${all.length}）`;
    manage.disabled = working || options.openWorkspace === undefined;
    state.textContent = writingState.drafted > 0 ? SWITCHER_WORDS.draftReady(writingState.drafted) : writingState.underWay ? SWITCHER_WORDS.writing : '';
    state.hidden = state.textContent === '';
    bar.dataset['documentCount'] = String(projection === null ? 0 : documentsOf(projection).length);
    if (focused !== null) {
      const again = Array.from(bar.querySelectorAll<HTMLElement>('[data-manuscript-switch]'))
        .find((node) => node.dataset['manuscriptSwitch'] === focused && (node.dataset['documentId'] ?? null) === focusedId);
      if (again !== document.activeElement) again?.focus();
    }
  }

  async function leave(open: () => Promise<void>): Promise<void> {
    if (working) return;
    options.setStatus(DOCUMENT_STATUS_LINES.opening, 'busy');
    try {
      await open();
    } catch (error) {
      if (!destroyed) options.setStatus(options.errorMessage(error, DOCUMENT_STATUS_LINES.openFailed), 'error');
    }
  }

  function toggleForm(): void {
    if (working || projection === null) return;
    if (form !== null) {
      closeForm();
      return;
    }
    const first = projection.types[0];
    if (first === undefined) return;
    form = { title: suggest(first.typeId), titleEdited: false, typeId: first.typeId, mode: 'blank', sourceVersionId: null, problem: null };
    paintPanel('title');
    paintBar();
  }

  function closeForm(): void {
    form = null;
    panel.hidden = true;
    panel.replaceChildren();
    paintBar();
    bar.querySelector<HTMLElement>('[data-derivative-menu]')?.focus();
  }

  function paintPanel(focus: 'title' | 'confirm' | 'source' | null): void {
    if (destroyed || form === null || projection === null) return;
    const state = form;
    const next = projection;
    const node = el('form', 'derivative-create-form');
    node.noValidate = true;
    node.addEventListener('submit', (event) => event.preventDefault());
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !working) { event.preventDefault(); closeForm(); }
    });
    const heading = el('h3', undefined, SWITCHER_WORDS.panelHeading);
    // 稿件题目 is the first field (Issue #1404): offered from the type until the editor writes their own.
    const titleLabel = el('label', 'derivative-field');
    const title = el('input');
    title.type = 'text';
    title.dataset['documentField'] = 'title';
    title.maxLength = 80;
    title.value = state.title;
    title.disabled = working;
    title.addEventListener('input', () => {
      state.title = title.value;
      state.titleEdited = title.value.trim() !== '';
      state.problem = null;
    });
    titleLabel.append(el('span', undefined, SWITCHER_WORDS.title), title);
    const typeLabel = el('label', 'derivative-field');
    const type = el('select');
    type.dataset['documentField'] = 'type';
    type.disabled = working;
    for (const entry of next.types) {
      const option = el('option', undefined, entry.label);
      option.value = entry.typeId;
      option.selected = entry.typeId === state.typeId;
      type.append(option);
    }
    type.addEventListener('change', () => {
      state.typeId = type.value;
      if (!state.titleEdited) {
        state.title = suggest(type.value);
        title.value = state.title;
      }
      state.problem = null;
    });
    typeLabel.append(el('span', undefined, SWITCHER_WORDS.type), type);
    const modes = el('fieldset', 'derivative-modes');
    modes.append(el('legend', undefined, SWITCHER_WORDS.mode));
    for (const [mode, words] of DERIVATIVE_CREATE_MODES) {
      const label = el('label', 'choice-row');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'derivative-mode';
      radio.value = mode;
      radio.checked = state.mode === mode;
      radio.disabled = working;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.mode = mode;
        state.problem = null;
        // AI 写作生成 goes straight to the one writing sheet with the title and type carried (Issue #1431 item 29): its own
        // 开始写作 starts, so this form adds no 继续 step.
        if (mode === 'writing') { void create(state); return; }
        // Issue #1410 item 23: 从来源材料创建 begins with the Book's first source chosen; another stays one click away.
        if (mode === 'source' && state.sourceVersionId === null) state.sourceVersionId = next.sources[0]?.sourceVersionId ?? null;
        paintPanel(mode === 'source' ? 'source' : null);
      });
      label.append(radio, el('span', undefined, words));
      modes.append(label);
    }
    node.append(heading, titleLabel, typeLabel, modes);
    if (state.mode === 'source') {
      const sources = el('fieldset', 'derivative-sources');
      sources.append(el('legend', undefined, SWITCHER_WORDS.source));
      if (next.sources.length === 0) sources.append(el('p', 'field-note', DOCUMENT_NO_SOURCES));
      for (const source of next.sources) {
        const label = el('label', 'choice-row');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'derivative-source';
        radio.value = source.sourceVersionId;
        radio.checked = state.sourceVersionId === source.sourceVersionId;
        radio.disabled = working;
        radio.addEventListener('change', () => { state.sourceVersionId = source.sourceVersionId; state.problem = null; });
        label.append(radio, el('span', undefined, documentSourceLine(source, localInstantLabel(source.createdAt))));
        sources.append(label);
      }
      node.append(sources);
    }
    if (state.problem !== null) {
      const problem = el('p', 'attention-note derivative-problem', state.problem);
      problem.setAttribute('role', 'alert');
      node.append(problem);
    }
    const row = el('div', 'button-row compact-actions');
    const confirm = el('button', 'primary', SWITCHER_WORDS.confirm);
    confirm.type = 'button';
    confirm.dataset['documentAction'] = 'create-derivative';
    confirm.disabled = working;
    confirm.addEventListener('click', () => void create(state));
    const cancel = el('button', 'quiet', SWITCHER_WORDS.cancel);
    cancel.type = 'button';
    cancel.dataset['documentAction'] = 'cancel-derivative';
    cancel.disabled = working;
    cancel.addEventListener('click', () => closeForm());
    row.append(confirm, cancel);
    node.append(row);
    panel.replaceChildren(node);
    panel.hidden = false;
    if (focus === 'title') title.focus();
    else if (focus === 'confirm') confirm.focus();
    else if (focus === 'source') node.querySelector<HTMLElement>('input[name="derivative-source"]')?.focus();
  }

  /** Each way of making a document, under the title written first, then the document opened (Issue #1403). */
  async function create(state: CreateForm): Promise<void> {
    if (working || destroyed || form !== state || projection === null) return;
    const type = projection.types.find((entry) => entry.typeId === state.typeId);
    if (type === undefined) return;
    if (state.mode === 'writing') {
      form = null;
      panel.hidden = true;
      panel.replaceChildren();
      paintBar();
      writing.open(type.typeId, state.title);
      return;
    }
    if (state.mode === 'source' && state.sourceVersionId === null) {
      state.problem = SWITCHER_WORDS.pickSource;
      paintPanel('source');
      return;
    }
    working = true;
    paintBar();
    paintPanel(null);
    options.setStatus(DOCUMENT_STATUS_LINES.creating, 'busy');
    try {
      // A type an earlier edition marked 本书不做 is taken up again: making one of its documents is the editor's answer.
      if (type.notForThisBook) await api.decideProductionDocumentType({ typeId: type.typeId, notForThisBook: false });
      let sourceVersionId = state.mode === 'source' ? state.sourceVersionId : null;
      let title = state.title.trim();
      if (state.mode === 'import') {
        const picked = await api.selectAndStageManuscript();
        if (picked.status === 'cancelled') {
          working = false;
          options.setStatus('');
          paintBar();
          paintPanel('confirm');
          return;
        }
        const staged = picked.staged;
        if (!['DOCX', 'MD', 'TXT'].includes(staged.source.format)) {
          await api.abandonImportDraft({ draftId: staged.draftId, expectedDraftVersion: staged.draftVersion, preserveBookRoute: true });
          throw new Error('请选择 DOCX、Markdown 或 TXT 文件。');
        }
        const review = await api.prepareSourceImportReview({ draftId: staged.draftId, expectedDraftVersion: staged.draftVersion,
          target: { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null } });
        const imported = await api.commitSourceImport({ draftId: review.draftId, expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest, commitAttemptId: review.commitAttemptId });
        await api.acknowledgeImportCompletion({ commitId: imported.commitId });
        sourceVersionId = imported.sourceVersionId;
        // An imported file is named after itself unless the editor wrote a title of their own.
        if (!state.titleEdited) title = importedDerivativeTitle(staged.source.displayName);
      }
      const result = await api.createProductionDocument({ typeId: type.typeId, sourceVersionId, ...(title === '' ? {} : { title }) });
      if (destroyed) return;
      if (result.bookId !== bookId || result.document === null) throw new Error(DOCUMENT_STATUS_LINES.createFailed);
      working = false;
      form = null;
      projection = result.documents;
      panel.hidden = true;
      panel.replaceChildren();
      paintBar();
      options.setStatus(documentCreatedLine(result.document.title), 'success');
      await options.openDocument(result.document, { typeId: type.typeId, label: type.label }, result.notice);
    } catch (error) {
      working = false;
      if (destroyed) return;
      state.problem = options.errorMessage(error, DOCUMENT_STATUS_LINES.createFailed);
      options.setStatus(state.problem, 'error');
      paintBar();
      if (form === state) paintPanel('confirm');
      refresh();
    }
  }

  paintBar();
  refresh();
  writing.refresh();
  return {
    element: root,
    renamed: (documents) => {
      if (destroyed || documents.bookId !== bookId) return;
      ticket += 1;
      projection = documents;
      paintBar();
    },
    refreshWriting: () => writing.refresh(),
    destroy: () => {
      destroyed = true;
      ticket += 1;
      writing.destroy();
    },
  };
}
