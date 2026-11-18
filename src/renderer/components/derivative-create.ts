import type { ProductionDocumentProjection, ProductionDocumentsProjection, ProductionDocumentTypeProjection,
  RendererApi } from '../../shared/protocol.js';
import { localInstantLabel } from '../plan-preview-labels.js';
import { DOCUMENT_NO_SOURCES, documentSourceLine } from '../production-document-labels.js';

/**
 * The one create form for a Book's derivative documents (Issue #1551): 稿件 on the editor's 新建 / 导入衍生稿件 and
 * its management page offer the same four ways of making one — 空白新建, AI 写作生成, 从来源材料创建, 导入文件 — with
 * the 稿件题目 first, then the type, and the chosen way last. Every choice is the service's own projection; nothing here
 * records a document beyond the create request below.
 */

export type DerivativeCreateMode = 'blank' | 'writing' | 'source' | 'import';

export const DERIVATIVE_CREATE_MODES: ReadonlyArray<readonly [DerivativeCreateMode, string]> = [
  ['blank', '空白新建'],
  ['writing', 'AI 写作生成'],
  ['source', '从来源材料创建'],
  ['import', '导入文件（DOCX / Markdown）'],
];

/** The form's words; a document's title and type labels come from the service's projection. */
export const DERIVATIVE_CREATE_WORDS = {
  heading: '新建 / 导入衍生稿件',
  title: '稿件题目',
  type: '稿件类型',
  mode: '创建方式',
  source: '来源材料',
  confirm: '创建并打开',
  cancel: '取消',
  pickSource: '请先选择一份来源材料。',
  createFailed: '无法创建衍生稿件。',
} as const;

/** What the form holds while it is open: the editor's choices and the service's last refusal. */
export interface DerivativeCreateState {
  title: string;
  titleEdited: boolean;
  typeId: string;
  mode: DerivativeCreateMode;
  sourceVersionId: string | null;
  problem: string | null;
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The control the host wants focused once the form is in place, when it is not the first one. */
export type DerivativeCreateFocus = 'title' | 'confirm' | 'source' | null;

export interface DerivativeCreateFormOptions {
  state: DerivativeCreateState;
  types: ReadonlyArray<ProductionDocumentTypeProjection>;
  sources: ProductionDocumentsProjection['sources'];
  busy: boolean;
  focus: DerivativeCreateFocus;
  /** The 稿件题目 offered for a type until the editor writes their own. */
  suggest(typeId: string): string;
  /** Paint the form again, with this control focused, after a choice changed what it shows. */
  changed(focus: DerivativeCreateFocus): void;
  /** 创建并打开 — and  AI 写作生成, which opens the one writing sheet at once. */
  run(): void;
  cancel(): void;
}

export interface DerivativeCreateForm {
  readonly element: HTMLFormElement;
  focus(): void;
}

/** Build the form from the projection and the editor's choices; the caller inserts it and then focuses it. */
export function derivativeCreateForm(options: DerivativeCreateFormOptions): DerivativeCreateForm {
  const state = options.state;
  const busy = options.busy;
  const node = el('form', 'derivative-create-form');
  node.noValidate = true;
  node.addEventListener('submit', (event) => event.preventDefault());
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); options.cancel(); }
  });
  // 稿件题目 is the first field: offered from the type until the editor writes their own.
  const titleLabel = el('label', 'derivative-field');
  const title = el('input');
  title.type = 'text';
  title.dataset['documentField'] = 'title';
  title.maxLength = 80;
  title.value = state.title;
  title.disabled = busy;
  title.addEventListener('input', () => {
    state.title = title.value;
    state.titleEdited = title.value.trim() !== '';
    state.problem = null;
  });
  titleLabel.append(el('span', undefined, DERIVATIVE_CREATE_WORDS.title), title);
  const typeLabel = el('label', 'derivative-field');
  const type = el('select');
  type.dataset['documentField'] = 'type';
  type.disabled = busy;
  for (const entry of options.types) {
    const option = el('option', undefined, entry.label);
    option.value = entry.typeId;
    option.selected = entry.typeId === state.typeId;
    type.append(option);
  }
  type.addEventListener('change', () => {
    state.typeId = type.value;
    if (!state.titleEdited) {
      state.title = options.suggest(type.value);
      title.value = state.title;
    }
    state.problem = null;
    options.changed(null);
  });
  typeLabel.append(el('span', undefined, DERIVATIVE_CREATE_WORDS.type), type);
  const modes = el('fieldset', 'derivative-modes');
  modes.append(el('legend', undefined, DERIVATIVE_CREATE_WORDS.mode));
  for (const [mode, words] of DERIVATIVE_CREATE_MODES) {
    const label = el('label', 'choice-row');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'derivative-mode';
    radio.value = mode;
    radio.checked = state.mode === mode;
    radio.disabled = busy;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.mode = mode;
      state.problem = null;
      // AI 写作生成 goes straight to the one writing sheet with the title and type carried: its own 开始写作 starts.
      if (mode === 'writing') { options.run(); return; }
      // 从来源材料创建 begins with the Book's first source chosen; another stays one click away.
      if (mode === 'source' && state.sourceVersionId === null) state.sourceVersionId = options.sources[0]?.sourceVersionId ?? null;
      options.changed(mode === 'source' ? 'source' : null);
    });
    label.append(radio, el('span', undefined, words));
    modes.append(label);
  }
  node.append(el('h3', undefined, DERIVATIVE_CREATE_WORDS.heading), titleLabel, typeLabel, modes);
  if (state.mode === 'source') {
    const sources = el('fieldset', 'derivative-sources');
    sources.append(el('legend', undefined, DERIVATIVE_CREATE_WORDS.source));
    if (options.sources.length === 0) sources.append(el('p', 'field-note', DOCUMENT_NO_SOURCES));
    for (const source of options.sources) {
      const label = el('label', 'choice-row');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'derivative-source';
      radio.value = source.sourceVersionId;
      radio.checked = state.sourceVersionId === source.sourceVersionId;
      radio.disabled = busy;
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
  const confirm = el('button', 'btn primary', DERIVATIVE_CREATE_WORDS.confirm);
  confirm.type = 'button';
  confirm.dataset['documentAction'] = 'create-derivative';
  confirm.disabled = busy;
  confirm.addEventListener('click', options.run);
  const cancel = el('button', 'btn quiet', DERIVATIVE_CREATE_WORDS.cancel);
  cancel.type = 'button';
  cancel.dataset['documentAction'] = 'cancel-derivative';
  cancel.disabled = busy;
  cancel.addEventListener('click', options.cancel);
  row.append(confirm, cancel);
  node.append(row);
  return {
    element: node,
    focus: () => {
      const target = options.focus === 'confirm' ? confirm
        : options.focus === 'source' ? node.querySelector<HTMLElement>('input[name="derivative-source"]') ?? null
          : options.focus === 'title' ? title : null;
      target?.focus();
    },
  };
}

export type DerivativeCreateApi = Pick<RendererApi, 'createProductionDocument' | 'decideProductionDocumentType' |
  'selectAndStageManuscript' | 'abandonImportDraft' | 'prepareSourceImportReview' | 'commitSourceImport' | 'acknowledgeImportCompletion'>;

export interface DerivativeCreateRequest {
  api: DerivativeCreateApi;
  bookId: string;
  types: ReadonlyArray<ProductionDocumentTypeProjection>;
  /** The three ways that make the document here; AI 写作生成 opens the writing sheet instead. */
  state: DerivativeCreateState & { mode: 'blank' | 'source' | 'import' };
}

export type DerivativeCreateOutcome =
  | { kind: 'created'; document: ProductionDocumentProjection; documents: ProductionDocumentsProjection;
    type: { typeId: string; label: string }; notice: string | null }
  | { kind: 'problem'; problem: string; focus: 'source' }
  /** 导入文件's picker was closed: nothing was made and nothing changed. */
  | { kind: 'cancelled' };

/** Each way that makes a document, under the title written first, from the Book's projection and the editor's choices. */
export async function createDerivative(request: DerivativeCreateRequest): Promise<DerivativeCreateOutcome> {
  const { api, bookId, state } = request;
  const type = request.types.find((entry) => entry.typeId === state.typeId);
  if (type === undefined) return { kind: 'cancelled' };
  if (state.mode === 'source' && state.sourceVersionId === null) {
    return { kind: 'problem', problem: DERIVATIVE_CREATE_WORDS.pickSource, focus: 'source' };
  }
  // A type an earlier edition marked 本书不做 is taken up again: making one of its documents is the editor's answer.
  if (type.notForThisBook) await api.decideProductionDocumentType({ typeId: type.typeId, notForThisBook: false });
  let sourceVersionId = state.mode === 'source' ? state.sourceVersionId : null;
  let title = state.title.trim();
  if (state.mode === 'import') {
    const picked = await api.selectAndStageManuscript();
    if (picked.status === 'cancelled') return { kind: 'cancelled' };
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
  if (result.bookId !== bookId || result.document === null) throw new Error(DERIVATIVE_CREATE_WORDS.createFailed);
  return { kind: 'created', document: result.document, documents: result.documents,
    type: { typeId: type.typeId, label: type.label }, notice: result.notice };
}
