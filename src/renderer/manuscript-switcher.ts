import type { TaskLaunchRequest } from './task-drawer.js';
import { menuPanel } from './components/controls.js';
import type {
  ProductionDocumentProjection,
  ProductionDocumentsProjection,
  ProductionDocumentTypeProjection,
  RendererApi,
  ServiceWireJobProjection as ServiceJobProjection,
} from '../shared/protocol.js';
import { DOCUMENT_STATUS_LINES, documentCreatedLine } from './production-document-labels.js';
import { mountWritingTask, type WritingTaskSurface } from './writing-task.js';
import { DERIVATIVE_CREATE_WORDS, createDerivative, derivativeCreateForm, suggestedDerivativeTitle,
  type DerivativeCreateFocus, type DerivativeCreateState } from './components/derivative-create.js';

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
  unavailable: '本书的衍生稿件暂时无法读取。',
} as const;

/** `[新闻稿] 首发媒体通稿`: a derivative document as the switcher lists it. */
export function derivativeSwitchLabel(typeLabel: string, title: string): string {
  return `[${typeLabel}] ${title}`;
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
  openLaunch(request: TaskLaunchRequest): void;
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
type CreateForm = DerivativeCreateState;

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
    openLaunch: options.openLaunch,
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

  function paintPanel(focus: DerivativeCreateFocus): void {
    if (destroyed || form === null || projection === null) return;
    const state = form;
    const built = derivativeCreateForm({
      state,
      types: projection.types,
      sources: projection.sources,
      busy: working,
      focus,
      suggest,
      changed: (next) => paintPanel(next),
      run: () => void create(state),
      cancel: () => closeForm(),
    });
    panel.replaceChildren(built.element);
    panel.hidden = false;
    built.focus();
  }

  /** Each way of making a document, under the title written first, then the document opened (Issue #1403). */
  async function create(state: CreateForm): Promise<void> {
    if (working || destroyed || form !== state || projection === null) return;
    const type = projection.types.find((entry) => entry.typeId === state.typeId);
    if (type === undefined) return;
    // AI 写作生成 goes straight to the one writing sheet with the title and type carried (Issue #1431 item 29): its own
    // 开始写作 starts, so this form adds no 继续 step.
    if (state.mode === 'writing') {
      form = null;
      panel.hidden = true;
      panel.replaceChildren();
      paintBar();
      writing.open(type.typeId, state.title);
      return;
    }
    if (state.mode === 'source' && state.sourceVersionId === null) {
      state.problem = DERIVATIVE_CREATE_WORDS.pickSource;
      paintPanel('source');
      return;
    }
    working = true;
    paintBar();
    paintPanel(null);
    options.setStatus(DOCUMENT_STATUS_LINES.creating, 'busy');
    const mode = state.mode;
    try {
      const outcome = await createDerivative({ api, bookId, types: projection.types, state: { ...state, mode } });
      if (destroyed) return;
      if (outcome.kind === 'cancelled') {
        working = false;
        options.setStatus('');
        paintBar();
        paintPanel('confirm');
        return;
      }
      if (outcome.kind === 'problem') {
        working = false;
        state.problem = outcome.problem;
        paintBar();
        paintPanel(outcome.focus);
        return;
      }
      working = false;
      form = null;
      projection = outcome.documents;
      panel.hidden = true;
      panel.replaceChildren();
      paintBar();
      options.setStatus(documentCreatedLine(outcome.document.title), 'success');
      await options.openDocument(outcome.document, outcome.type, outcome.notice);
    } catch (error) {
      working = false;
      if (destroyed) return;
      state.problem = options.errorMessage(error, DERIVATIVE_CREATE_WORDS.createFailed);
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
