// What 新建审阅 lets the editor choose and what each combination of choices sends (0.7.4, I-2): the pure rules (which categories
// run, why one cannot, what blocks 先看计划, the request a start sends) and the one-line category rows, the local-check switch
// and the 核查力度 control under 事实核查. The sheet in review-workspace.ts holds the state and the foot; nothing here talks to a service.

import type { createDispatchChooser } from './components/dispatch-chooser.js';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';
import {
  EVIDENCE_ASSURANCE_LEVELS, EVIDENCE_ASSURANCE_LEVEL_CONSEQUENCES, EVIDENCE_ASSURANCE_LEVEL_LABELS,
  type EvidenceAssuranceLevel,
} from '../shared/protocol/factual-verification.js';
import type { LocalCheckOptions, ProcedureDefinitionPin } from '../shared/protocol/procedures.js';
import type {
  CapturedProcedureApplicabilityEntryProjection, CapturedProcedureRunProjection, RendererApi, ReviewChapterOptionProjection,
  ReviewRunScopeRequest, ReviewScopeKind, ReviewWorkspaceCategoryProjection, ReviewWorkspaceProjection,
} from '../shared/protocol.js';
import { procedureCategoryOpen, type ProcedureChoiceRequests, type ProcedureRecommendationSelection } from './procedure-choice.js';
import { reviewBasisWords } from './review-basis.js';
import {
  estimateReviewCalls, REVIEW_CATEGORY_LEGEND, REVIEW_CHAPTERS_REVERSED, REVIEW_LEVEL_LEGEND, REVIEW_LOCAL_ONLY_LINE, REVIEW_LOCAL_SWITCH_NAME,
  REVIEW_LOCAL_SWITCH_SENTENCE, REVIEW_NEEDS_MANUSCRIPT, REVIEW_PICK_CATEGORY, REVIEW_PICK_CHAPTERS, REVIEW_PICK_SCOPE,
} from './review-labels.js';
import { taskMaterialSelection } from './task-material-selection.js';

/** The paragraphs a 当前选区 Run named (Issue #423 review, P2-4): 返回修改 asks for the same ones again. */
export type SheetSelection = { readonly fromBlockId: string; readonly toBlockId: string };

export interface SheetState {
  /** The 核查力度 on show: the remembered one when the sheet opened, then the editor's own choice. */
  evidenceAssuranceLevel: EvidenceAssuranceLevel;
  estimate?: string;
  launchInput?: string;
  rememberedChoice?: boolean;
  executionConfig?: RuntimeExecutionConfig;
  chooser?: ReturnType<typeof createDispatchChooser>;
  choicePending?: boolean;
  choiceReady?: Promise<void>;
  startWhen?: 'now' | 'when-online';
  choiceTicket?: number;
  launchPending?: boolean;
  clientCommandId?: string;
  dismissed: boolean;
  localOptions: LocalCheckOptions;
  houseWordListWanted: boolean;
  houseWordListRequest: number;
  houseWordListLoading: boolean;
  seriesId: string | null;
  readonly seriesChoices: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>;
  readonly recommendation: ProcedureRecommendationSelection;
  readonly materialIds: Set<string>;
  readonly categories: Set<string>;
  /**
   * The selection the sheet holds: a 当前选区 Run's paragraphs, kept for 返回修改 and 修改计划并重新授权 (P2-4). The sheet holds no
   * selection of its own; without one, 当前选区 stays unavailable and is refused here, before anything is sent.
   */
  readonly selection: SheetSelection | null;
  scope: ReviewScopeKind | null;
  from: string | null;
  to: string | null;
  problem: string | null;
  /** Where focus returns when the sheet closes: the control that opened it. */
  readonly openerKey: string | null;
  /** The plan is on screen: focus goes to it instead of back to the opener. */
  launched: boolean;
  /** The enabled Captured Procedures 按已保存的工序 offers (Issue #65, S30), each as it applies to this Book (S31b), read when the sheet opens. */
  procedures: ReadonlyArray<CapturedProcedureApplicabilityEntryProjection>;
  /** The Captured Procedure the sheet was filled from, resolved for this Book; `null` for categories chosen by hand. */
  procedure: CapturedProcedureRunProjection | null;
  /** Its choices in flight (Issue #66, S31 review P2-1): only the newest answer fills the sheet, and 先看计划 waits for it. */
  readonly requests: ProcedureChoiceRequests;
  /** A composite Procedure Definition version opened by 运行此工序… (Issue #1173): its members are the categories, in its order. */
  definition: { readonly composite: boolean; readonly pin: ProcedureDefinitionPin; readonly title: string; readonly categoryIds: readonly string[] } | null;
}

export function localOnly(state: SheetState): boolean {
  return state.definition === null && state.categories.has('local-text-check');
}

export function categoryUnavailableReason(entry: ReviewWorkspaceCategoryProjection, state: SheetState): string | null {
  if (state.definition !== null && !state.definition.categoryIds.includes(entry.categoryId)) return '不在所选的固定成员工序里。';
  if (localOnly(state) && entry.categoryId !== 'local-text-check') return '本次仅运行本地文字检查；取消后恢复模型审阅类别。';
  const filled = state.procedure?.resolved ?? null;
  const step = filled?.steps.find((candidate) => candidate.categoryId === entry.categoryId) ?? null;
  const scope = state.scope === null ? null : entry.scopes[state.scope];
  return filled !== null && step === null ? '不在所选的可复用工序里。'
    : step !== null && !step.available ? step.unavailableReason
    : !entry.available ? entry.unavailableReason : scope !== null && !scope.available ? scope.unavailableReason : null;
}

/** Stored choices survive temporary conditions; only this effective set is estimated and submitted. */
export function effectiveCategories(workspace: ReviewWorkspaceProjection, state: SheetState): string[] {
  // A definition is indivisible: the service requires its complete ordered membership, or no submission.
  if (state.definition !== null) return [...state.definition.categoryIds];
  const ordered = ['local-text-check', ...workspace.categories.filter((entry) => entry.categoryId !== 'local-text-check').map((entry) => entry.categoryId)];
  return ordered.filter((id) => {
    if (!state.categories.has(id)) return false;
    if (id === 'local-text-check') return workspace.manuscript !== null && state.scope !== 'changed';
    if (localOnly(state)) return false;
    const entry = workspace.categories.find((category) => category.categoryId === id);
    return entry !== undefined && (categoryUnavailableReason(entry, state) === null || entry.networkUnavailable === true);
  });
}

export function sheetPreparationReason(workspace: ReviewWorkspaceProjection, state: SheetState): string | null {
  for (const id of state.definition?.categoryIds ?? []) {
    if (id === 'local-text-check') {
      if (workspace.manuscript === null) return '本地文字检查：导入稿件后即可检查。';
      if (state.scope === 'changed') return '本地文字检查请选择全书、选章或当前选区。';
      continue;
    }
    const entry = workspace.categories.find((category) => category.categoryId === id);
    if (entry === undefined) return '固定成员已不在审阅配置中，请重新打开此工序。';
    const why = categoryUnavailableReason(entry, state) ?? (entry.networkUnavailable === true ? '此类别需要联网检索。' : null);
    if (why !== null) return `${entry.label}：${why}`;
  }
  return state.categories.has('local-text-check') && state.houseWordListWanted && state.houseWordListLoading
    ? '正在更新本社词表，请稍候再开始审阅。' : null;
}

/** The renderer-made 本地文字检查 entry: no model, never offered for 只审改动过的章, unavailable without a manuscript. */
export function localCheckCategory(workspace: ReviewWorkspaceProjection): ReviewWorkspaceCategoryProjection {
  return {
    categoryId: 'local-text-check', label: REVIEW_LOCAL_SWITCH_NAME, description: '单独在本机检查标点、规范字形与异形词；数字检查可选。',
    output: 'change-suggestion', riskPointsOnly: false, batchApply: true, searchEngine: false, modelFree: true,
    materialReferencesAllowed: false, basis: { categoryId: 'local-text-check', executor: 'local-text-check', searchEngine: false, guidelineDocuments: [], procedure: { title: '确定性检查', version: '3' } }, guidelineDocuments: [],
    procedure: { title: '确定性检查', version: '3' }, available: workspace.manuscript !== null,
    unavailableReason: workspace.manuscript === null ? REVIEW_NEEDS_MANUSCRIPT : null,
    scopes: { whole: workspace.scopeOptions.whole, chapters: workspace.scopeOptions.chapters,
      changed: { available: false, unavailableReason: '本地文字检查请选择全书、选章或当前选区。' }, selection: { available: true, unavailableReason: null } },
  };
}

/** The first and last chapter of the range the sheet holds. */
export function sheetChapters(workspace: ReviewWorkspaceProjection, state: SheetState): { from: ReviewChapterOptionProjection | null; to: ReviewChapterOptionProjection | null } {
  const chapters = workspace.scopeOptions.chapters.chapters;
  return {
    from: chapters.find((chapter) => chapter.blockId === state.from) ?? null,
    to: chapters.find((chapter) => chapter.blockId === state.to) ?? null,
  };
}

/**
 * What 先看计划 asks a Review Run to read, or why it asks nothing (Issue #423 review, P2-4): 选章 names its two chapters, 当前选区
 * the paragraphs the sheet holds from a Run — and with none held it is refused here, never sent as a frame the boundary rejects.
 */
export function reviewSheetScope(input: {
  readonly scope: ReviewScopeKind | null;
  readonly from: Pick<ReviewChapterOptionProjection, 'blockId' | 'position'> | null;
  readonly to: Pick<ReviewChapterOptionProjection, 'blockId' | 'position'> | null;
  readonly selection: { readonly fromBlockId: string; readonly toBlockId: string } | null;
  readonly selectionReason: string | null;
}): { readonly problem: string } | { readonly request: ReviewRunScopeRequest } {
  const { scope, from, to, selection } = input;
  if (scope === null) return { problem: REVIEW_PICK_SCOPE };
  if (scope === 'chapters') {
    if (from === null || to === null) return { problem: REVIEW_PICK_CHAPTERS };
    if (to.position < from.position) return { problem: REVIEW_CHAPTERS_REVERSED };
    return { request: { kind: 'chapters', fromChapterBlockId: from.blockId, toChapterBlockId: to.blockId } };
  }
  if (scope === 'selection') {
    if (selection === null) return { problem: input.selectionReason ?? REVIEW_PICK_SCOPE };
    return { request: { kind: 'selection', fromChapterBlockId: selection.fromBlockId, toChapterBlockId: selection.toBlockId } };
  }
  return { request: { kind: scope, fromChapterBlockId: null, toChapterBlockId: null } };
}

export type SheetPreparationInput = Parameters<RendererApi['prepareReviewRun']>[0];
/** What a start sends beside the `clientCommandId`, the model choice and the remembered-choice flag the sheet adds. */
export type SheetLaunchInput = SheetPreparationInput & Pick<Parameters<RendererApi['launchReviewRun']>[0], 'evidenceAssuranceLevel' | 'startWhen'>;

export type SheetRequest =
  | { readonly problem: string }
  | { readonly categoryIds: string[]; readonly scope: ReviewRunScopeRequest; readonly preparation: SheetPreparationInput; readonly launch: SheetLaunchInput };

/**
 * The request the sheet's choices make: the categories that run, the scope, and the input 先看计划 and 开始审阅 send — or the one
 * line that says why nothing can be asked yet. `localCheck` is present only when the local check runs, `evidenceAssuranceLevel`
 * only when 事实核查 runs, and `startWhen` only offline (unless local only) or when the editor chose to wait for the network.
 */
export function reviewSheetRequest(workspace: ReviewWorkspaceProjection, state: SheetState,
  capturedProcedure: { versionId: string; documentSha256: string } | null): SheetRequest {
  const categoryIds = effectiveCategories(workspace, state);
  const { from, to } = sheetChapters(workspace, state);
  const asked = reviewSheetScope({ scope: state.scope, from, to, selection: state.selection, selectionReason: workspace.scopeOptions.selection.unavailableReason });
  if (categoryIds.length === 0) return { problem: REVIEW_PICK_CATEGORY };
  if ('problem' in asked) return { problem: asked.problem };
  const scope = asked.request;
  const preparation: SheetPreparationInput = {
    ...(categoryIds.includes('local-text-check') ? { localCheck: { ...state.localOptions, numeralsConfirmed: state.localOptions.numerals !== 'off' && state.localOptions.numeralsConfirmed } } : {}),
    ...(state.seriesId === null ? {} : { seriesId: state.seriesId }),
    categoryIds,
    scope,
    ...(state.materialIds.size === 0 ? {} : { materialIds: taskMaterialSelection(workspace.materials?.items ?? [], state.materialIds) }),
    ...(capturedProcedure === null ? {} : { capturedProcedure }),
    ...(state.definition?.composite !== true ? {} : { procedureDefinition: state.definition.pin }),
  };
  const launch: SheetLaunchInput = { ...preparation,
    ...(categoryIds.includes('factual-review') ? { evidenceAssuranceLevel: state.evidenceAssuranceLevel } : {}),
    ...(workspace.connectivity === 'offline' && !localOnly(state) || state.startWhen === 'when-online' ? { startWhen: 'when-online' as const } : {}) };
  return { categoryIds, scope, preparation, launch };
}

// ---- The form -------------------------------------------------------------------------------------------------

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

interface Row {
  readonly entry: ReviewWorkspaceCategoryProjection;
  readonly input: HTMLInputElement;
  readonly label: HTMLLabelElement;
  readonly reason: HTMLElement;
  readonly calls: HTMLElement;
}

export interface ReviewChoices {
  /** The switch, the line that replaces the list while it is on, the category list and, under 事实核查, 核查力度. */
  readonly element: HTMLElement;
  /** Redraw what the choices imply, in place: `effective` is `effectiveCategories`, `preparing` locks the controls. */
  update(view: { readonly effective: readonly string[]; readonly preparing: boolean }): void;
}

/**
 * The top of the form: 本地文字检查 as a switch, then one line for each of the nine categories — checkbox, name, short state, basis
 * link, call estimate — with 核查力度 directly under 事实核查. The description sentence sits in the detail the basis link opens.
 */
export function createReviewChoices(input: {
  readonly workspace: ReviewWorkspaceProjection;
  readonly state: SheetState;
  /** A tick or the switch changed `state.categories`: the sheet draws itself again and puts focus back on that control. */
  readonly changed: (categoryId: string) => void;
  /** 核查力度 changed: the sheet redraws what follows in place. */
  readonly levelChanged: () => void;
  readonly nextId: (prefix: string) => string;
}): ReviewChoices {
  const { workspace, state } = input;
  const chapters = workspace.scopeOptions.chapters.chapters;
  const rows = new Map<string, Row>();

  const buildRow = (entry: ReviewWorkspaceCategoryProjection, isSwitch: boolean): Row => {
    const label = node('label', isSwitch ? 'review-local-switch' : 'review-category-option');
    if (isSwitch) label.dataset['reviewLocalSwitch'] = ''; else label.dataset['reviewCategoryOption'] = entry.categoryId;
    const box = node('input');
    box.type = 'checkbox';
    box.name = 'review-category';
    box.value = entry.categoryId;
    if (isSwitch) box.setAttribute('role', 'switch');
    box.checked = state.categories.has(entry.categoryId);
    const text = node('span', 'review-category-text');
    const name = node('strong', 'review-category-name', entry.label);
    name.title = entry.label;
    const reason = node('span', 'review-category-reason');
    reason.id = input.nextId('category-reason');
    const sentence = entry.description.split(/[；。]/u)[0] + '。';
    const basis = node('a', 'review-category-basis', [...entry.guidelineDocuments.map((document) => document.title), entry.procedure.title].join(' · '));
    basis.href = '#'; basis.title = basis.textContent ?? '';
    basis.id = input.nextId('category-basis');
    // The description sentence the row face used to carry sits beside the basis words; the switch shows it on its face.
    const detail = node('p', 'review-category-basis-detail');
    if (!isSwitch) detail.append(node('span', 'review-category-description', sentence), ' ');
    detail.append(reviewBasisWords(entry.basis));
    detail.hidden = true;
    basis.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); detail.hidden = !detail.hidden; basis.setAttribute('aria-expanded', String(!detail.hidden)); });
    box.setAttribute('aria-describedby', `${basis.id} ${reason.id}`);
    text.append(name);
    if (isSwitch) { const face = node('span', 'review-category-description', REVIEW_LOCAL_SWITCH_SENTENCE); face.title = REVIEW_LOCAL_SWITCH_SENTENCE; text.append(face); }
    text.append(reason);
    const calls = node('span', 'review-category-calls');
    label.append(box, text, basis, calls, detail);
    box.addEventListener('change', () => {
      if (box.checked) state.categories.add(entry.categoryId);
      else state.categories.delete(entry.categoryId);
      state.problem = null;
      input.changed(entry.categoryId);
    });
    return { entry, input: box, label, reason, calls };
  };

  const local = buildRow(localCheckCategory(workspace), true);
  rows.set(local.entry.categoryId, local);
  const localLine = node('p', 'review-local-only-line', REVIEW_LOCAL_ONLY_LINE);
  localLine.hidden = true;

  const categories = node('fieldset', 'review-category-options');
  categories.append(node('legend', undefined, REVIEW_CATEGORY_LEGEND));
  // 核查力度 (Issue #1679): directly under the 事实核查 row, shown while it will run, starting from the level remembered on this computer.
  const assurance = node('div', 'review-evidence-assurance');
  const assuranceLabel = node('label', 'review-field');
  const select = node('select');
  select.dataset['reviewField'] = 'evidenceAssuranceLevel';
  select.setAttribute('aria-label', REVIEW_LEVEL_LEGEND);
  for (const level of EVIDENCE_ASSURANCE_LEVELS) {
    const option = node('option', undefined, EVIDENCE_ASSURANCE_LEVEL_LABELS[level]);
    option.value = level;
    select.append(option);
  }
  select.value = state.evidenceAssuranceLevel;
  const note = node('p', 'field-note');
  select.addEventListener('change', () => {
    const chosen = EVIDENCE_ASSURANCE_LEVELS.find((level) => level === select.value);
    if (chosen !== undefined) state.evidenceAssuranceLevel = chosen;
    input.levelChanged();
  });
  assuranceLabel.append(node('span', undefined, REVIEW_LEVEL_LEGEND), select);
  assurance.append(assuranceLabel, note);
  for (const entry of workspace.categories.filter((category) => category.categoryId !== 'local-text-check')) {
    const row = buildRow(entry, false);
    rows.set(entry.categoryId, row);
    categories.append(row.label);
    if (entry.categoryId === 'factual-review') categories.append(assurance);
  }

  const element = node('div', 'review-choices');
  element.append(local.label, localLine, categories);
  return {
    element,
    update({ effective, preparing }) {
      const filled = state.procedure?.resolved ?? null;
      const from = chapters.find((chapter) => chapter.blockId === state.from);
      const to = chapters.find((chapter) => chapter.blockId === state.to);
      for (const { entry, input: box, label, reason, calls } of rows.values()) {
        box.checked = effective.includes(entry.categoryId);
        const step = filled?.steps.find((candidate) => candidate.categoryId === entry.categoryId) ?? null;
        const why = categoryUnavailableReason(entry, state);
        const networkUnavailable = entry.networkUnavailable === true && !localOnly(state);
        // A filled sheet's categories are the procedure's: neither added to nor dropped here (ADR 0087 §4) — but a Series step
        // is the editor's to choose at each run (S31b; REUSE-050).
        box.disabled = state.definition !== null || (why !== null && !networkUnavailable) || preparing || !procedureCategoryOpen(filled !== null, step);
        if (step !== null && step.available && step.chosenApart) label.dataset['procedureChosenApart'] = 'true';
        else delete label.dataset['procedureChosenApart'];
        const short = networkUnavailable ? '此类别需要联网检索。' : (why ?? '').split(/[；。]/u)[0] + (why === null ? '' : '。');
        reason.textContent = short;
        reason.title = short;
        reason.hidden = why === null;
        const count = estimateReviewCalls(entry, state.scope, workspace.scopeUnitCounts, from && to ? { startPosition: from.position, endPosition: to.endPosition } : null);
        calls.textContent = count === null ? '选好范围后估计' : `约 ${count} 次调用`;
        if (why === null) {
          delete label.dataset['unavailableReason'];
          delete box.dataset['unavailableReason'];
        } else {
          label.dataset['unavailableReason'] = why;
          box.dataset['unavailableReason'] = why;
        }
      }
      // While the local check runs alone the nine rows give way to one line; their ticks stay in the state for the way back.
      const hideList = state.definition === null && effective.includes('local-text-check');
      categories.hidden = hideList;
      localLine.hidden = !hideList;
      assurance.hidden = !effective.includes('factual-review');
      select.disabled = preparing;
      note.textContent = EVIDENCE_ASSURANCE_LEVEL_CONSEQUENCES[state.evidenceAssuranceLevel];
    },
  };
}
