import { editorialMarkCardMoreOpen as moreOpen, renderEditorialMarkCard, settleEditorialMarkCard } from './editorial-mark-card.js';
import { EDITORIAL_MARK_CATEGORIES, type EditorialMarkCategoryKey } from '../shared/editorial-mark-category.js';
import { matchesEditorialMarkFilter, type EditorialMarkFilter } from './editorial-mark-filter.js';
import { windowStep } from './components/controls.js';
import { showToast } from './components/toast.js';
import { technicalDisclosure, technicalLayerVisible, technicalWords } from './technical-layer.js';
import { readProposalWorkspace } from './proposal-workspace.js';
import { readFindingSources } from './research-evidence-labels.js';
import { findingEvidenceList } from './research-evidence.js';
import type { ApplyReceiptProjection, ProposalWorkspaceProjection } from '../shared/protocol.js';
import { MAX_DIALOGUE_QUESTION_CHARACTERS, SERIES_KNOWLEDGE_CLASSES, SERIES_KNOWLEDGE_CLASS_LABELS } from '../shared/protocol.js';
import type { AskAboutSelectionInput, DialogueProjection, DialogueSelectionInput, EditorialPolishProjection, FastInteractionRoutesProjection, PolishSelectionInput } from '../shared/protocol.js';
import {
  DIALOGUE_ASK,
  DIALOGUE_COMPOSER_TITLE,
  DIALOGUE_MENU_HINT,
  DIALOGUE_MENU_LABEL,
  DIALOGUE_QUESTION_LABEL,
  DIALOGUE_SENDS_NOTE,
  DIALOGUE_STATUS,
  dialogueQuestionRefusal,
} from './dialogue-labels.js';
import type { BookSeriesProjection, ProposeSeriesKnowledgeInput, SeriesKnowledgeClass, SeriesKnowledgeProposalProjection, SeriesListCursor } from '../shared/protocol.js';
import {
  KNOWLEDGE_CLASS_LABEL,
  KNOWLEDGE_CONTENT_LABEL,
  KNOWLEDGE_MENU_GROUP,
  KNOWLEDGE_MENU_NOTE,
  KNOWLEDGE_PROPOSE,
  KNOWLEDGE_SUBJECT_LABEL,
  knowledgeMenuLabel,
} from './series-knowledge-labels.js';
import type { BoundedEditor } from './editor.js';
import { learningReasonAskCard } from './analysis-feedback.js';
import type {
  EditorClipboardCommand,
  EditorialMarkAnchorProjection,
  EditorialMarkCardProjection,
  EditorialMarkCommandProjection,
  EditorialMarkKind,
  ManuscriptApplyCommandProjection,
  ManuscriptWindowProjection,
  PersonalHighlightColor,
  ProposalItemDecisionProjection,
  RendererApi,
  ReviewFindingOfMarkProjection,
  UpdateEditorialMarkInput,
} from '../shared/protocol.js';
import {
  DECISION_REASON_ADD,
  DECISION_REASON_CANCEL,
  DECISION_REASON_CHIPS,
  DECISION_REASON_OWN,
  DECISION_REASON_PROMPTS,
  DECISION_REASON_REVISE,
  DECISION_REASON_STATUS,
  decisionReasonLine,
  HIGHLIGHT_COLOR_LABELS,
  INSERTION_CONVERT_REASON,
  MARK_KIND_LABELS,
  RESOLVE_CONFLICT_LABEL,
  REVERSAL_CORRECTION_LINE,
  SAFE_MERGE_LINE,
  markDriftNote,
  markTimeLabel,
  selectionMenuReason,
} from './editorial-mark-labels.js';
import { applyOnce } from './manuscript-apply.js';
import { type EditorInputMode } from './editor-input-mode.js';
import {
  AI_LOCK_SELECTION_LABEL, AI_UNLOCK_SELECTION_LABEL, SCOPED_AI_EDIT_MENU_LABEL, openScopedAiEditComposer, selectionLockTargets, selectionLocked,
  setAiLocks, type ScopedAiEditHost,
} from './scoped-ai-edit.js';
import {
  EDITOR_REVISION_RATIONALE, QUICK_REVISE_APPLIED, QUICK_REVISE_FIELD, QUICK_REVISE_FIELD_HINT, QUICK_REVISE_HINT, QUICK_REVISE_LABEL,
  QUICK_REVISE_NOTE, QUICK_REVISE_RATIONALE, QUICK_REVISE_SPAN_HINT, QUICK_REVISE_SUBMIT, QUICK_REVISE_TITLE, QUICK_REVISE_UNCHANGED,
  REVERSE_REVISION_DONE, REVERSE_REVISION_LABEL, spanRevisionSegments, type RevisionSegment,
} from './editor-revisions.js';
import { spanGraphemes } from '../shared/selection-span.js';
import { REVIEW_VIEW_TASK_ABSENT, REVIEW_VIEW_TASK_RESOLVING } from './review-labels.js';
import { sheetChosenApartLine } from './captured-procedure-labels.js';
import {
  SELECTION_POLISH_HINT,
  SELECTION_POLISH_LABEL,
  SELECTION_POLISH_READING,
  SELECTION_POLISH_STATUS,
  SELECTION_TASK_CHOSEN_APART_LEGEND,
  SELECTION_TASK_DOCUMENT_REASON,
  SELECTION_TASK_FIELD,
  SELECTION_SPAN_PROCEDURE_REASON,
  SELECTION_TASK_MENU_LABEL,
  SELECTION_TASK_NOTE,
  SELECTION_TASK_PICK_RANGE,
  SELECTION_TASK_PREPARE,
  SELECTION_TASK_STATUS,
  SELECTION_TASK_TITLE,
  selectionTaskContextLine,
  selectionTaskGroupNote,
  type SelectionProcedureEntry,
  type SelectionTaskChoice,
  type SelectionTaskChoices,
} from './selection-task-labels.js';

/**
 * The Editorial Mark surface of the manuscript (Issue #407; editor-surfaces.md §1 标记系统 and 右键菜单;
 * V2-UX-MARK-001 to 008, TASK-046). It owns three floating things over the text column — the
 * selection or mark menu, a composer, and the Mark Card — and nothing else: marks are drawn by the
 * editor as decorations, stored by the service, and every command answers with the window's marks.
 * Nothing here changes a character of the manuscript.
 */
/** The words selected now (Issue #423, slice 7a): the exact span, where its paragraph stands, and the window's revision. */
export interface SelectionSpanReading {
  readonly span: DialogueSelectionInput;
  readonly position: number | null;
  readonly revisionLabel: string;
  readonly journalSequence: number;
}

export interface EditorialMarksSurface {
  refreshComments(retryFailed?: boolean): void;
  /** Close whatever is floating: the blocks it was anchored to may be gone. */
  close(): void;
  /**
   * Another window of the manuscript was loaded (Issue #423 review, P2-3): menus close, and so does a Mark Card; a composer — with
   * what was chosen and written in it — stays, placed again below its paragraph, while that paragraph is still in the window.
   */
  reanchor(): void;
  /** Whether a menu, a Mark Card or a composer is open over the text (Issue #423 review, P2-7): a background reload waits for it. */
  holdsFloating(): boolean;
  /**
   * The words selected now, as the exact span a mark names (Issue #423, slice 7a; TASK-046's 再选一段加入): with the paragraph's
   * position and the revision and journal position the window stands at — or why nothing can be taken.
   */
  selectionSpan(): Promise<SelectionSpanReading | string>;
  /** 按现成工序准备… (Issue #423, slice 7a): the house's 工序 on those words, in the composer anchored to their paragraph (S77b). */
  composeProcedures(range: { readonly blockId: string; readonly fromGrapheme: number; readonly toGrapheme: number }): void;
  /** Open one mark's card, as a click on it would: 审阅's 回到原文 arrives at a finding's mark this way. */
  openMark(markId: string): Promise<void>;
  /** 修改此处 (Issue #1411): the selection's revision composer, prefilled with the selected words; `false` when nothing is selected. */
  quickRevise(): boolean;
  /**
   * The editor's own revision (Issue #1411): one 修改建议 of theirs on exactly these words — `编辑修订` unless they said why — applied
   * at once; its mark identity once applied, or `null` when it was not (the surface said why). Never for an AI result.
   */
  recordAndApplyEditorRevision(range: Omit<RevisionSegment, 'proposedText'>, proposedText: string, rationale?: string | null): Promise<string | null>;
  /** An applied revision's card brought forward in the 批注栏 (Issue #1411): opened, scrolled to and highlighted. */
  revealRevision(markId: string): Promise<void>;
  /** 让 AI 修改… with nothing selected (Issue #1412): the unlocked parts of the section the caret is in, or of the whole text. */
  composeScopedAiEdit(): void;
  /**
   * Whether the pane's position is this surface's doing: a composer or a Mark Card is open — bringing
   * one into view may rest the pane at its edge — or one just closed and the pane, shorter by the
   * card's height, was put back where it now ends. Neither is the reader asking for the next window.
   */
  ownsScroll(): boolean;
  destroy(): void;
}

interface MountOptions {
  /** The manuscript's existing supporting slot; absent on embedded document editors. */
  comments?: { host: HTMLElement; enabled(): boolean };
  scroll: HTMLElement;
  host: HTMLElement;
  editor: BoundedEditor;
  api: Pick<
    RendererApi,
    'createEditorialMark' | 'getEditorialMarkCard' | 'updateEditorialMark' | 'recordChangeSuggestionDecision' |
    'recordProposalDecisionReason' | 'recordProposalDecisionFeedback' | 'recordLearningReasonAsk' | 'runEditorClipboardCommand' | 'applyChangeSuggestion' | 'applyChangeSuggestionBatch' | 'reverseAppliedChangeSuggestion' |
    'inspectProposalWorkspace' | 'inspectApplyReceipt' | 'prepareReverseApply' | 'getManuscriptApplyOutcome' | 'inspectReviewFindingOfMark' |
    // A factual finding's sources on its card (Issue #1174), read as its review card reads them.
    'inspectFactualVerification' | 'inspectEvidenceWorkspace' | 'inspectResearchEvidence'
  >;
  /**
   * 查看任务 on a mark a Review Run produced (V2-UX-MARK-008): leave for 审阅 with that Run open and the
   * finding in view. Without it, 查看任务 stays disabled for every mark.
   */
  openReviewFinding?(target: ReviewFindingOfMarkProjection): void;
  /**
   * 解决冲突… on a 修改建议 in a Three-way Proposal Conflict (Issue #57): leave for 稿件冲突 on that mark.
   * Without it, the entry is not offered.
   */
  openConflict?(markId: string): void;
  openProposalWorkspace?(): void;
  /**
   * The Series the Book is in now (Issue #63, S28b): for each, the selection menu offers 提议为书系「…」的知识… on the selected
   * words. Without it — a Production Document, or a Book in no Series — the menu offers nothing of 书系.
   */
  seriesOf?(after: SeriesListCursor | null): Promise<Pick<BookSeriesProjection, 'memberships' | 'membershipsNext' | 'membershipCount'>>;
  proposeSeriesKnowledge?(input: ProposeSeriesKnowledgeInput): Promise<SeriesKnowledgeProposalProjection>;
  /**
   * 就这段提问… (Issue #52, S17a; TASK-046): the selected words of the Book's manuscript and the editor's question, sent as they
   * stand — no plan and no 开始任务. Without it (a Production Document) the item stays disabled with its reason.
   */
  askAboutSelection?(input: AskAboutSelectionInput): Promise<DialogueProjection>;
  /** The question was asked: its dialogue comes to the foreground beside the manuscript. */
  onAsked?(dialogue: DialogueProjection): void;
  /**
   * 润色这段 (Issue #842): whether this launch can run it, the request on the selected words — no plan and no 开始任务 — read
   * again until it settles, and the window's marks read again once it placed its 修改建议. Without it (a Production Document)
   * the item stays disabled with its reason.
   */
  polish?: {
    routes(): Promise<FastInteractionRoutesProjection>;
    polish(input: PolishSelectionInput): Promise<EditorialPolishProjection>;
    inspect(taskId: string): Promise<EditorialPolishProjection>;
    marks(): Promise<{ readonly journalSequence: number; readonly marks: ReadonlyArray<EditorialMarkAnchorProjection>; readonly truncated: boolean } | null>;
  };
  /**
   * 就这段发起任务… (Issue #423, S77b; TASK-001, TASK-046): the Tasks the selected words' paragraph can start now, and the one
   * the editor chose prepared on that paragraph — its plan opened beside the manuscript. `prepare` answers whether the plan was
   * prepared. Without it (a Production Document) the item stays disabled with its reason.
   */
  startTaskOnSelection?: {
    /** The Book the manuscript is of, which the composer names (TASK-002). */
    readonly bookTitle: string;
    choices(): Promise<SelectionTaskChoices>;
    /**
     * The house's enabled 可复用工序 as each applies to a selection of this Book (Issue #423, S77 deferred item a): one menu
     * entry each, read again for every selection menu and drawn once read.
     */
    procedures(): Promise<ReadonlyArray<SelectionProcedureEntry>>;
    /** `chosenApart`: the categories of the chosen procedure's Series steps the editor ticked (REUSE-050); empty for any other choice. */
    prepare(choice: SelectionTaskChoice, anchor: { readonly blockId: string }, chosenApart: ReadonlyArray<string>): Promise<boolean>;
    /**
     * The Context-bound Task Composer (Issue #423, slice 7a; TASK-001): the menu's 就这段发起任务… hands it exactly the selected words;
     * the house's 常用工序 entries still open the composer that prepares at once. Without it, 就这段发起任务… opens that composer too.
     */
    compose?(reading: SelectionSpanReading): void;
  };
  busy(): boolean;
  /** The set of marks changed: whatever counts them elsewhere on the surface reads again. */
  marksChanged?(): void;
  /**
   * Run one write of the manuscript the way the surface runs every authoritative one — local edits
   * settled, the editor locked, the window reloaded from the service and checked against the state the
   * Effect Receipt names. `undefined` when it did not complete; the surface has then said why.
   */
  writeInlineRevision?(operation: () => Promise<EditorialMarkCommandProjection>): Promise<EditorialMarkCommandProjection | undefined>;
  writeManuscript<T extends ManuscriptApplyCommandProjection>(operation: () => Promise<T>, done: string): Promise<T | undefined>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** The surface's current input mode. Clipboard input remains available in both modes. */
  inputMode?(): EditorInputMode;
  /** Open the 批注栏 for a card it should show; `false` where it cannot show now (专注模式), and the card floats instead. */
  revealComments?(): boolean;
  /**
   * 就选中部分让 AI 修改… and 🔒 锁定 (Issue #1412), on the Book's manuscript and on a derivative document alike: the request, the
   * lock calls and the reload after them are the scoped edit's own; `sectionOf` names the heading whose section holds a block.
   */
  scopedAiEdit?: { readonly host: ScopedAiEditHost; sectionOf(blockId: string): string | null };
}

/** Window-only memory. A new projection/version fences every outstanding read, including failed reads. */
export class EditorialCardCache {
  readonly cards = new Map<string, EditorialMarkCardProjection>();
  #identity = '';
  #marks: ReadonlyArray<EditorialMarkAnchorProjection> | undefined;
  #reads = new Map<string, Promise<EditorialMarkCardProjection | undefined>>();
  #failed = new Set<string>();
  #epoch = 0;
  sync(window: Pick<ManuscriptWindowProjection, 'bookId' | 'manuscriptId' | 'branchId' | 'revisionId' | 'journalSequence' | 'workingDigest' | 'blocks' | 'marks'>): void {
    const identity = JSON.stringify([window.bookId, window.manuscriptId, window.branchId, window.revisionId, window.journalSequence,
      window.workingDigest, window.blocks.map((block) => block.blockId)]);
    if (identity === this.#identity && window.marks === this.#marks) return;
    this.#identity = identity;
    this.#marks = window.marks;
    this.clear();
  }
  clear(): void { this.#epoch++; this.cards.clear(); this.#reads.clear(); this.#failed.clear(); }
  failed(markId: string): boolean { return this.#failed.has(markId); }
  invalidate(markId: string): void { this.cards.delete(markId); this.#reads.delete(markId); this.#failed.delete(markId); }
  put(card: EditorialMarkCardProjection): void {
    // Replacing the pending entry prevents an older read from overwriting a command's returned card.
    this.invalidate(card.markId);
    if (card.kind === 'personal-highlight') this.cards.delete(card.markId);
    else this.cards.set(card.markId, card);
  }
  read(markId: string, fetch: () => Promise<EditorialMarkCardProjection>, retryFailed = false): Promise<EditorialMarkCardProjection | undefined> {
    if (retryFailed && this.#failed.has(markId)) this.invalidate(markId);
    const cached = this.cards.get(markId);
    if (cached) return Promise.resolve(cached);
    const existing = this.#reads.get(markId);
    if (existing) return existing;
    const epoch = this.#epoch;
    const read = Promise.resolve().then(fetch).then((card) => {
      if (epoch !== this.#epoch || this.#reads.get(markId) !== read) return undefined;
      if (card.kind !== 'personal-highlight') this.cards.set(markId, card);
      return card;
    }).catch((error: unknown) => {
      if (epoch !== this.#epoch || this.#reads.get(markId) !== read) return undefined;
      this.#failed.add(markId);
      throw error;
    });
    this.#reads.set(markId, read);
    return read;
  }
}

/** Measured cards stay in anchor order and remain reachable in the pane's own scroll area. */
export function stackEditorialComments<T extends { desiredTop: number; measuredHeight: number }>(items: readonly T[], selectedIndex = -1, viewport?: { top: number; height: number }): Array<T & { top: number }> {
  let bottom = 8;
  const ordered = [...items].sort((a, b) => a.desiredTop - b.desiredTop);
  const placed = ordered.map((item) => {
    const top = Math.max(item.desiredTop, bottom);
    bottom = top + item.measuredHeight + 10;
    return { ...item, top };
  });
  const selected = items[selectedIndex];
  const pivot = selected === undefined ? -1 : ordered.indexOf(selected);
  if (pivot < 0) return placed;
  const chosen = placed[pivot]!;
  chosen.top = viewport ? Math.max(viewport.top, Math.min(chosen.desiredTop, viewport.top + Math.max(0, viewport.height - chosen.measuredHeight))) : chosen.desiredTop;
  for (let i = pivot - 1; i >= 0; i--) placed[i]!.top = Math.min(placed[i]!.desiredTop, placed[i + 1]!.top - placed[i]!.measuredHeight - 10);
  for (let i = pivot + 1; i < placed.length; i++) placed[i]!.top = Math.max(placed[i]!.desiredTop, placed[i - 1]!.top + placed[i - 1]!.measuredHeight + 10);
  return placed;
}

/** Shared pointer/caret rule: shortest range, starts before ends, then window order. */
export function pickEditorialComment(marks: readonly EditorialMarkAnchorProjection[], blockId: string | undefined, grapheme: number): EditorialMarkAnchorProjection | undefined {
  const candidates = marks.filter(mark => mark.kind !== 'personal-highlight' && mark.blockId === blockId && grapheme >= mark.fromGrapheme && grapheme <= mark.toGrapheme);
  const starts = candidates.some(mark => mark.fromGrapheme === grapheme);
  return candidates.filter(mark => !starts || mark.toGrapheme !== grapheme || mark.fromGrapheme === grapheme)
    .sort((a, b) => (a.toGrapheme - a.fromGrapheme) - (b.toGrapheme - b.fromGrapheme))[0];
}

/** How often 润色这段 reads its request again while it is in flight (Issue #842). */
const POLISH_READ_AGAIN_MS = 400;

/** A composer whose paragraph left the window as another one was loaded (Issue #423 review, P2-3). */
export const COMPOSER_LEFT_WINDOW = '撰写框所在的段落已不在当前稿件窗口中，撰写框已关闭；没有记下任何内容。';

interface FormField {
  name: 'body' | 'proposedText' | 'rationale' | 'reason' | 'subject' | 'knowledgeClass' | 'question' | 'procedure' | 'chosenApart';
  label: string;
  value: string;
  required: boolean;
  hint?: string;
  /** A closed choice, drawn as a select with none chosen (Issue #63, S28b). */
  options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  /**
   * Boxes none of which is ticked for the editor (Issue #423, S77 deferred item a; REUSE-050), each shown only while the field
   * `groupedBy` names holds its `group`; the value is the ticked, shown boxes' values, one per line.
   */
  checkboxes?: ReadonlyArray<{ readonly value: string; readonly label: string; readonly hint?: string; readonly group: string }>;
  groupedBy?: FormField['name'];
}

interface FormConfig {
  id: string;
  title: string;
  quote: string | null;
  fields: ReadonlyArray<FormField>;
  submitLabel: string;
  note?: string;
  submit(values: Readonly<Record<FormField['name'], string>>): Promise<void>;
  cancel(): void;
}

export interface MenuItem {
  action: string;
  label: string;
  hint?: string;
  disabledReason?: string;
  swatch?: PersonalHighlightColor;
  /** The Series an entry of the 书系 group speaks for: its entries share one action, so a redraw keeps focus by this (Issue #642). */
  seriesId?: string;
  run?(): void;
  /**
   * An item shown disabled with its reason until this answers what it does; `null` keeps it disabled.
   * The menu's 查看任务 learns this way whether an AI7 mark came from a Review Run.
   */
  resolve?(): Promise<(() => void) | null>;
}

export interface MenuGroup {
  label: string;
  note?: string;
  items: ReadonlyArray<MenuItem>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

const CONVERT_LABELS: Readonly<Record<EditorialMarkKind, string>> = {
  'change-suggestion': '提出修改建议',
  annotation: '转为批注',
  'editor-note': '转为备注',
  'personal-highlight': '加高亮',
};

/**
 * Where a menu asked for at a point goes so that it stays inside the window on every side. The point
 * can lie outside the window: the context-menu key speaks for a caret that may have been scrolled out
 * of view, above the window as easily as below it. A menu larger than the window starts at the margin.
 */
export function menuPlacement(
  at: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(at.x, viewport.width - margin - size.width)),
    top: Math.max(margin, Math.min(at.y, viewport.height - margin - size.height)),
  };
}

type SeriesChoice = { readonly seriesId: string; readonly title: string };
/** Words the AI7 actions take: one block's range, or the exact span across paragraphs (Issue #1176). */
type SelectedWords = Extract<ReturnType<BoundedEditor['selectedRange']>, { kind: 'range' | 'span' }>;

/**
 * The selection menu's 书系 group (Issue #63, S28b): one entry per Series the Book is in, then the chooser. A Book in no
 * Series has no group, and neither has one whose Series are not known yet: a group drawn before the editor's first read
 * answers would flash a chooser on a Book in no Series (Issue #642 review). The menu is drawn again once that read answers.
 */
export function seriesKnowledgeMenuGroup(
  membership: ReadonlyArray<SeriesChoice> | null,
  why: string | undefined,
  act: { compose(series: SeriesChoice): void; choose(): void },
): MenuGroup | null {
  if (membership === null || membership.length === 0) return null;
  return {
    label: KNOWLEDGE_MENU_GROUP,
    note: why ?? KNOWLEDGE_MENU_NOTE,
    items: [...membership.map((series): MenuItem => ({
      action: 'propose-series-knowledge',
      label: knowledgeMenuLabel(series.title),
      seriesId: series.seriesId,
      ...(why ? { disabledReason: why } : { run: () => act.compose(series) }),
    })), {
      action: 'choose-knowledge-series', label: '选择书系并提议知识…',
      ...(why ? { disabledReason: why } : { run: () => act.choose() }),
    }],
  };
}

/** Whether two readings of the Book's Series draw the same 书系 group: not known yet and in none both draw nothing. */
export function sameSeriesGroup(a: ReadonlyArray<SeriesChoice> | null, b: ReadonlyArray<SeriesChoice> | null): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((series, index) => series.seriesId === right[index]!.seriesId && series.title === right[index]!.title);
}

/**
 * Whether two readings of the house's 可复用工序 draw the same entries of the AI7 任务 group (Issue #423, S77 deferred item a):
 * not known yet draws none and no note; known and none draws the note that there are none, so the two differ.
 */
export function sameProcedureEntries(a: ReadonlyArray<SelectionProcedureEntry> | null, b: ReadonlyArray<SelectionProcedureEntry> | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((entry, index) => JSON.stringify(entry) === JSON.stringify(b[index]));
}

/**
 * The latest answer of one read, as the editor last had it: `null` until the first read answers. Only the latest read's answer
 * counts, and a read that fails leaves the last answer standing — as `seriesMembership` reads the Book's Series.
 */
export function latestAnswer<T>(read: () => Promise<T>, alive: () => boolean = () => true): { current(): T | null; refresh(): Promise<void> } {
  let current: T | null = null;
  let asked = 0;
  return {
    current: () => current,
    async refresh(): Promise<void> {
      const mine = ++asked;
      const answer = await read().then((value) => ({ value }), () => null);
      if (answer !== null && alive() && mine === asked) current = answer.value;
    },
  };
}

/**
 * The Book's Series as the editor last read them (Issue #63, S28b; #642): `null` until the first read answers. Membership can
 * change while the editor is open — 加入书系 from another window — so each selection menu reads it again. Only the latest
 * read's answer counts, and a read that fails leaves the last answer standing.
 */
export function seriesMembership(
  read: () => Promise<{ readonly memberships: ReadonlyArray<SeriesChoice> }>,
  alive: () => boolean = () => true,
): { current(): ReadonlyArray<SeriesChoice> | null; refresh(): Promise<void> } {
  let current: ReadonlyArray<SeriesChoice> | null = null;
  let asked = 0;
  return {
    current: () => current,
    async refresh(): Promise<void> {
      const mine = ++asked;
      const page = await read().catch(() => null);
      if (page !== null && alive() && mine === asked) current = page.memberships;
    },
  };
}

export function mountEditorialMarks(options: MountOptions): EditorialMarksSurface {
  const { editor, api } = options;
  const layer = el('div', 'editorial-mark-layer');
  options.scroll.append(layer);
  // A composer and a Mark Card belong to their paragraph and scroll with it. A menu belongs to the
  // pointer: it floats over the window in a layer of its own, so opening one can never change the
  // text pane's scrollable area — a scrollbar the menu itself brought in used to resize the pane,
  // and the pane's resize closed the menu the moment it opened on a small window.
  const menuLayer = el('div', 'editorial-mark-menu-layer');
  document.body.append(menuLayer);
  let destroyed = false;
  let menu: HTMLElement | undefined;
  let floating: HTMLElement | undefined;
  let floatingBlockId: string | undefined;
  /**
   * Composers asked for and not on screen yet (Issue #423 review, P2-3, P3-8): from the menu's choice, through the settled selection
   * every composer waits on and any read after it, to `openComposer`. Paging at the pane's edge waits while any is, as it waits for
   * an open composer. A count, since one asking can hold the selection's wait inside its own.
   */
  let composersPending = 0;
  /** The open composer's own refresh after a window load (P3-7): the 就这段发起任务 composer's context line. */
  let floatingRefresh: (() => void) | undefined;
  let openCardId: string | undefined;
  let inlinePreviewId: string | undefined;
  /**
   * The one reason row open on the card (Issue #61, S26a): the editor's own `补充原因…` / `改原因…`. Leaving the card ends it.
   * A decision no longer opens it by itself (Issue #1109): the learning ask below follows 经常 / 偶尔 / 关闭 instead.
   */
  let promptFor: { readonly markId: string; readonly decisionId: string; readonly mode: 'add' | 'revise' } | null = null;
  /** Offered learning asks by mark (Issue #1109), drawn again with their card until answered or dismissed; never re-requested. */
  const learningAsks = new Map<string, { readonly decisionId: string; readonly node: HTMLElement }>();
  let collapsedBeforeContextClick = true;
  const recoveryCards = new Map<string, ApplyReceiptProjection>();
  const setRecovery = (markId: string, receipt?: ApplyReceiptProjection): void => {
    if (receipt) recoveryCards.set(markId, receipt); else recoveryCards.delete(markId);
    scheduleCommentsLayout();
  };
  let working = false;
  /** The Series the Book is in (Issue #63, S28b): each selection menu reads them again and is drawn again when they moved (#642). */
  const seriesOf = options.seriesOf;
  const inSeries = seriesOf === undefined ? null : seriesMembership(() => seriesOf(null), () => !destroyed);
  void inSeries?.refresh();
  let closedAt: { top: number } | undefined;

  const cardCache = new EditorialCardCache();
  const commentNodes = new Map<string, { card: EditorialMarkCardProjection; node: HTMLElement; receipt?: ApplyReceiptProjection | undefined; readState?: string }>();
  const commentsScroll = el('div', 'manuscript-comments-scroll');
  // These nodes and this selection belong to the mounted pane, never to a polling/card redraw.
  const markFilter: EditorialMarkFilter = { selectedCategories: new Set(), status: 'all', keyword: '' };
  const filterBar = el('div', 'editorial-mark-filters');
  filterBar.setAttribute('role', 'region');
  filterBar.setAttribute('aria-label', '筛选批注');
  const categoryChips = el('div', 'editorial-mark-filter-chips');
  categoryChips.setAttribute('role', 'group');
  categoryChips.setAttribute('aria-label', '批注分类（可多选）');
  const categoryButtons = new Map<EditorialMarkCategoryKey | 'all', HTMLButtonElement>();
  for (const key of ['all', ...Object.keys(EDITORIAL_MARK_CATEGORIES)] as Array<EditorialMarkCategoryKey | 'all'>) {
    const chip = el('button', 'quiet');
    chip.type = 'button';
    chip.dataset['markCategoryFilter'] = key;
    if (key !== 'all') chip.dataset['markCategory'] = key;
    chip.addEventListener('click', () => {
      if (key === 'all') markFilter.selectedCategories.clear();
      else if (!markFilter.selectedCategories.delete(key)) markFilter.selectedCategories.add(key);
      scheduleCommentsLayout();
    });
    categoryButtons.set(key, chip);
    categoryChips.append(chip);
  }
  const statusChips = el('div', 'editorial-mark-filter-chips');
  statusChips.setAttribute('role', 'group');
  statusChips.setAttribute('aria-label', '批注状态');
  for (const [status, label] of [['all', '全部'], ['open', '待处理'], ['applied', '已应用']] as const) {
    const chip = el('button', 'quiet', label);
    chip.type = 'button';
    chip.dataset['markStatusFilter'] = status;
    chip.addEventListener('click', () => { markFilter.status = status; scheduleCommentsLayout(); });
    statusChips.append(chip);
  }
  const search = el('input', 'editorial-mark-search');
  search.type = 'search';
  search.dataset['markSearchInput'] = '';
  search.placeholder = '搜索原文、修改建议或理由';
  search.setAttribute('aria-label', '搜索批注');
  search.addEventListener('input', () => { markFilter.keyword = search.value; scheduleCommentsLayout(); });
  const filterSummary = el('p', 'editorial-mark-filter-summary');
  filterSummary.setAttribute('role', 'status');
  filterSummary.setAttribute('aria-live', 'polite');
  filterBar.append(categoryChips, statusChips, search, filterSummary);
  const commentsCanvas = el('div', 'manuscript-comments-canvas');
  commentsCanvas.setAttribute('role', 'list');
  commentsCanvas.setAttribute('aria-label', '当前可见区域批注');
  commentsScroll.append(commentsCanvas);
  options.comments?.host.append(filterBar, commentsScroll);
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaders.classList.add('manuscript-comments-leaders');
  leaders.setAttribute('aria-hidden', 'true');
  options.comments?.host.parentElement?.append(leaders);
  let commentsFrame: number | undefined;
  let preservePanePositions = false;
  let commentsFrameScroll = 0;
  let pressedComment: string | undefined;
  let pressedTextMark: EditorialMarkAnchorProjection | undefined;
  let textPointerDown = false;
  let activeComment: string | undefined;
  let hoveredComment: string | undefined;
  let suppressCommentSelection = false;
  /** The card an applied revision's badge brought forward (Issue #1411), and whether it is still to be scrolled to. */
  let revealed: { readonly markId: string; readonly pending: boolean } | undefined;
  /** The pane position a reveal scrolled the text to: this surface's own movement, which never pages the window. */
  let revealScroll: { top: number } | undefined;
  let commentsReading = 0;
  let commentCardReads = 0;
  let commentsIdentity = '';
  const commentAnchor = (mark: EditorialMarkAnchorProjection): HTMLElement | null =>
    options.host.querySelector<HTMLElement>(`[data-mark-id="${CSS.escape(mark.markId)}"]`) ?? blockElement(mark.blockId);
  const clearInlinePreview = (): void => {
    if (inlinePreviewId === undefined) return;
    inlinePreviewId = undefined;
    if (openCardId === undefined) editor.setActiveMark(null);
  };
  const activateComment = (markId: string | undefined): void => {
    if (inlinePreviewId !== undefined && inlinePreviewId !== markId) clearInlinePreview();
    activeComment = markId;
    for (const [id, entry] of commentNodes) entry.node.dataset['active'] = entry.node.dataset['selected'] = String(id === markId);
    editor.setLinkedMark(activeComment ?? null);
    scheduleCommentsLayout();
  };
  const hoverComment = (markId: string | undefined): void => {
    if (hoveredComment === markId) return;
    const previous = hoveredComment;
    hoveredComment = markId;
    for (const id of [previous, markId]) {
      if (id === undefined) continue;
      const entry = commentNodes.get(id);
      if (entry) entry.node.dataset['hovered'] = String(id === markId);
      for (const node of options.host.querySelectorAll<HTMLElement>(`[data-mark-id="${CSS.escape(id)}"]`)) {
        if (id === markId) node.dataset['commentHovered'] = 'true';
        else delete node.dataset['commentHovered'];
      }
    }
  };
  const returnToCommentAnchor = (card: Pick<EditorialMarkCardProjection, 'blockId' | 'fromGrapheme'>): void => {
    editor.selectRange(card.blockId, card.fromGrapheme, card.fromGrapheme);
    editor.focus();
  };
  function openCommentReply(markId: string): void {
    const entry = commentNodes.get(markId);
    if (!entry) return;
    const existing = entry.node.querySelector<HTMLTextAreaElement>('[data-comment-reply]');
    if (existing) { existing.focus(); return; }
    const form = el('form', 'manuscript-comments-reply');
    const input = el('textarea');
    input.rows = 2;
    input.dataset['commentReply'] = markId;
    input.setAttribute('aria-label', '回复内容');
    const send = el('button', 'secondary', '发送回复');
    send.type = 'submit';
    send.dataset['markAction'] = 'send-reply';
    const problem = el('p', 'manuscript-comments-problem');
    problem.setAttribute('role', 'alert');
    form.append(input, send, problem);
    let generation = 0;
    let composing = false;
    input.addEventListener('input', () => { generation++; });
    input.addEventListener('compositionstart', () => { composing = true; generation++; });
    input.addEventListener('compositionend', () => { composing = false; generation++; });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim() || send.disabled || composing) return;
      if (!cardCache.cards.has(markId)) { problem.textContent = '批注正在更新，请稍候再发送。'; return; }
      send.disabled = true;
      form.dataset['sending'] = 'true';
      const body = input.value;
      const submitted = generation;
      void change(markId, 'reply', { body }, '已回复。', false).then((done) => {
        if (done) {
          if (input.value === body && generation === submitted && !composing) input.value = '';
          problem.textContent = '';
        }
        else problem.textContent = '回复未发送，请查看状态提示后重试。';
      }).finally(() => { form.dataset['sending'] = 'false'; send.disabled = !cardCache.cards.has(markId); scheduleCommentsLayout(); });
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    entry.node.append(form);
    input.focus({ preventScroll: true });
    scheduleCommentsLayout();
  }
  function scheduleCommentsLayout(): void {
    preservePanePositions = false;
    queueCommentsLayout();
  }
  function queueCommentsLayout(): void {
    if (destroyed || commentsFrame !== undefined || !options.comments) return;
    commentsFrame = requestAnimationFrame(() => { commentsFrame = undefined; layoutComments(); preservePanePositions = false; });
  }
  function scrollCommentsPane(): void {
    // Reading neighbouring cards must not snap the pane back to its selected card.
    if (commentsFrame === undefined) preservePanePositions = true;
    queueCommentsLayout();
  }
  function scrollCommentsText(): void {
    if (activeComment === undefined) { commentsFrameScroll = 0; commentsScroll.scrollTop = 0; }
    scheduleCommentsLayout();
  }
  function releaseCommentPress(): void {
    const id = pressedComment;
    pressedComment = undefined;
    if (!destroyed && id !== undefined) activateComment(id);
    if (!destroyed && textPointerDown) {
      textPointerDown = false;
      pressedTextMark = undefined;
      commentSelection();
    }
  }
  const finishCommentPress = (): void => {
    const id = pressedComment;
    setTimeout(() => { if (pressedComment === id) releaseCommentPress(); }, 0);
  };
  function layoutComments(): void {
    if (pressedComment !== undefined) return;
    const visible = options.comments?.enabled() === true && options.comments.host.getClientRects().length > 0;
    leaders.replaceChildren();
    if (!visible) { hoverComment(undefined); editor.setVisibleMarkIds(null); return; }
    const marks = editor.currentWindow().marks;
    const comments = marks.filter((mark) => mark.kind !== 'personal-highlight');
    const matching = new Set(comments.filter((mark) => matchesEditorialMarkFilter(mark, cardCache.cards.get(mark.markId) ?? commentNodes.get(mark.markId)?.card, markFilter)).map((mark) => mark.markId));
    if (inlinePreviewId !== undefined && !matching.has(inlinePreviewId)) clearInlinePreview();
    if (activeComment !== undefined && !matching.has(activeComment)) activateComment(undefined);
    const filtering = markFilter.selectedCategories.size > 0 || markFilter.status !== 'all' || markFilter.keyword.trim() !== '';
    editor.setVisibleMarkIds(filtering ? new Set([...matching, ...marks.filter((mark) => mark.kind === 'personal-highlight').map((mark) => mark.markId)]) : null);
    for (const [key, button] of categoryButtons) {
      const count = key === 'all' ? comments.length : comments.filter((mark) => mark.categoryKey === key).length;
      const label = key === 'all' ? '全部' : EDITORIAL_MARK_CATEGORIES[key].label;
      const text = `${label} (${count})`;
      if (button.textContent !== text) button.textContent = text;
      button.hidden = key !== 'all' && count === 0 && !markFilter.selectedCategories.has(key);
      button.setAttribute('aria-pressed', String(key === 'all' ? markFilter.selectedCategories.size === 0 : markFilter.selectedCategories.has(key)));
    }
    for (const button of statusChips.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset['markStatusFilter'] === markFilter.status));
    const summary = `当前区域 ${matching.size} / ${comments.length} 条批注${matching.size === 0 && filtering ? ' · 没有匹配的批注' : ''}`;
    if (filterSummary.textContent !== summary) filterSummary.textContent = summary;
    const viewport = options.scroll.getBoundingClientRect();
    const base = commentsScroll.getBoundingClientRect();
    const items = [];
    const present = new Set<string>();
    for (const mark of editor.currentWindow().marks) {
      if (mark.kind === 'personal-highlight' || !matching.has(mark.markId)) continue;
      const anchor = commentAnchor(mark);
      if (!anchor) continue;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < viewport.top - 200 || rect.top > viewport.bottom + 200) continue;
      const freshCard = cardCache.cards.get(mark.markId);
      let entry = commentNodes.get(mark.markId);
      const card = freshCard ?? entry?.card;
      if (!card) continue;
      const readState = freshCard ? 'ready' : cardCache.failed(mark.markId) ? 'failed' : 'pending';
      const stale = readState !== 'ready';
      present.add(mark.markId);
      if (!entry) {
        const node = el('article', 'manuscript-comments-card');
        node.tabIndex = 0;
        node.dataset['commentCard'] = mark.markId;
        entry = { card, node };
        commentNodes.set(mark.markId, entry);
        commentsCanvas.append(node);
        commentsResize.observe(node);
        node.addEventListener('pointerdown', (event) => { if (event.button === 0) pressedComment = mark.markId; });
        node.addEventListener('pointerenter', () => hoverComment(mark.markId));
        node.addEventListener('pointerleave', () => hoverComment(undefined));
        node.addEventListener('focusin', () => {
          if (pressedComment !== undefined) return;
          const rect = commentAnchor(mark)?.getBoundingClientRect();
          const currentViewport = options.scroll.getBoundingClientRect();
          if (rect && (rect.bottom < currentViewport.top || rect.top > currentViewport.bottom)) commentAnchor(mark)?.scrollIntoView({ block: 'center', behavior: 'instant' });
          activateComment(mark.markId);
        });
        node.addEventListener('click', (event) => {
          activateComment(mark.markId);
          if ((event.target as Element).closest('button, input, textarea, summary, a')) return;
          const current = commentNodes.get(mark.markId)?.card;
          if (!current) return;
          commentAnchor({ ...mark, blockId: current.blockId })?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          activateComment(mark.markId);
          if (cardCache.cards.get(mark.markId) !== current) return;
          closeFloating();
          inlinePreviewId = current.markId;
          const preview = current.suggestion && current.status !== 'applied' && current.anchorState === 'exact' && current.suggestion.decision?.disposition !== 'rejected';
          editor.setActiveMark({ markId: current.markId, previewText: preview ? current.suggestion!.decision?.editedText ?? current.suggestion!.proposedText : null });
        });
        node.addEventListener('keydown', (event) => {
          if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
          const current = commentNodes.get(mark.markId)?.card;
          if (!current) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); suppressCommentSelection = true; activateComment(undefined); returnToCommentAnchor(editor.currentWindow().marks.find((entry) => entry.markId === mark.markId) ?? current); return; }
          if (event.target !== node) return;
          const ordered = Array.from(commentsCanvas.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hidden);
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            ordered[Math.max(0, Math.min(ordered.length - 1, ordered.indexOf(node) + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
          } else if (event.key === 'Enter') { event.preventDefault(); void openCard(mark.markId); }
        });
      }
      const receipt = recoveryCards.get(mark.markId);
      if (entry.card !== card || entry.receipt !== receipt || entry.readState !== readState || !entry.node.firstElementChild) {
        // Keep the actual reply form node: browser selection, IME and caret survive background refreshes.
        const reply = entry.node.querySelector<HTMLFormElement>('.manuscript-comments-reply');
        const focused = entry.node.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
        const action = focused?.dataset['markAction'];
        const more = entry.node.querySelector<HTMLDetailsElement>('.editorial-mark-more');
        if (more) moreOpen.set(mark.markId, more.open);
        const selection = focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] as const : null;
        const composed = composeCard(card, undefined, true);
        if (stale) {
          for (const control of composed.querySelectorAll<HTMLButtonElement>('button')) control.disabled = true;
          const status = el('p', 'manuscript-comments-refresh', readState === 'failed' ? '批注读取失败。' : '正在更新批注…');
          status.setAttribute('role', 'status');
          if (readState === 'failed') {
            const retry = el('button', 'quiet', '重试读取');
            retry.type = 'button';
            retry.dataset['commentRetry'] = mark.markId;
            retry.addEventListener('click', () => refreshComments(true));
            status.append(retry);
          }
          composed.append(status);
        }
        const previous = entry.node.firstElementChild;
        if (previous && previous !== reply) previous.replaceWith(composed);
        else entry.node.prepend(composed);
        entry.card = card;
        entry.receipt = receipt;
        entry.readState = readState;
        // The reply node never moved. Do not disturb its live IME/selection when it kept focus.
        if (focused && document.activeElement !== focused) {
          const target = reply?.contains(focused) ? focused : action ? entry.node.querySelector<HTMLElement>(`[data-mark-action="${CSS.escape(action)}"]`)
            : focused.tagName === 'SUMMARY' ? entry.node.querySelector<HTMLElement>('.editorial-mark-more summary') : entry.node;
          target?.focus({ preventScroll: true });
          if (selection && focused instanceof HTMLTextAreaElement) focused.setSelectionRange(...selection);
        }
      }
      entry.node.dataset['revalidating'] = String(stale);
      entry.node.setAttribute('aria-busy', String(readState === 'pending'));
      const replyForm = entry.node.querySelector<HTMLFormElement>('.manuscript-comments-reply');
      const replySend = replyForm?.querySelector<HTMLButtonElement>('[data-mark-action="send-reply"]');
      if (replySend) replySend.disabled = stale || replyForm?.dataset['sending'] === 'true';
      entry.node.hidden = false;
      entry.node.dataset['markCategory'] = mark.categoryKey;
      items.push({ mark, anchor: rect, node: entry.node, desiredTop: rect.top - base.top + (activeComment === undefined ? commentsFrameScroll : commentsScroll.scrollTop || 0), measuredHeight: entry.node.getBoundingClientRect().height });
    }
    for (const [id, entry] of commentNodes) {
      if (!present.has(id)) {
        // Offscreen drafts stay in memory only while their mark still belongs to this window.
        if (editor.currentWindow().marks.some((mark) => mark.markId === id)) entry.node.hidden = true;
        else { if (inlinePreviewId === id) clearInlinePreview(); commentsResize.unobserve(entry.node); entry.node.remove(); commentNodes.delete(id); }
      }
    }
    const selectedIndex = items.findIndex(item => item.mark.markId === activeComment && item.anchor.bottom >= viewport.top && item.anchor.top <= viewport.bottom);
    const paneTop = commentsScroll.scrollTop || 0;
    const holdingFrame = preservePanePositions || (activeComment === undefined && paneTop > 0);
    const placed = holdingFrame ? (() => {
      const existing = items.filter(item => Number.isFinite(Number.parseFloat(item.node.style.top)))
        .sort((a, b) => Number.parseFloat(a.node.style.top) - Number.parseFloat(b.node.style.top));
      let bottom = 8;
      const held = existing.map(item => {
        const top = Math.max(Number.parseFloat(item.node.style.top), bottom);
        bottom = top + item.measuredHeight + 10;
        return { ...item, top };
      });
      for (const item of items) if (!existing.includes(item)) {
        held.push({ ...item, top: bottom }); bottom += item.measuredHeight + 10;
      }
      return held;
    })() : stackEditorialComments(items, selectedIndex, { top: paneTop, height: commentsScroll.clientHeight });
    // Shift canvas and scroll together: cards above the selection remain reachable.
    const shift = selectedIndex < 0 || preservePanePositions ? 0 : Math.max(0, 8 - Math.min(...placed.map(item => item.top)));
    for (const item of placed) item.top += shift;
    const forward = revealed?.pending ? placed.find(item => item.mark.markId === revealed!.markId) : undefined;
    if (forward && revealed) { revealed = { markId: revealed.markId, pending: false }; forward.node.focus({ preventScroll: true }); }
    else if (revealed?.pending && !revealScroll) {
      const mark = marks.find(item => item.markId === revealed!.markId);
      if (mark) { commentAnchor(mark)?.scrollIntoView?.({ block: 'center' }); revealScroll = { top: options.scroll.scrollTop }; scheduleCommentsLayout(); }
    }
    for (const [index, item] of placed.entries()) {
      item.node.style.top = `${item.top}px`;
      item.node.dataset['active'] = item.node.dataset['selected'] = String(item.mark.markId === activeComment);
      item.node.dataset['hovered'] = String(item.mark.markId === hoveredComment);
      if (item.mark.markId === activeComment) item.node.classList.add('editorial-mark-card-active');
      else item.node.classList.remove('editorial-mark-card-active');
      if (commentsCanvas.children[index] !== item.node) commentsCanvas.insertBefore(item.node, commentsCanvas.children[index] ?? null);
    }
    // The final card may align near the viewport's top: retain blank space below it so the browser does not clamp
    // the requested scroll offset and push the pair apart. Manual pane reading keeps that existing canvas extent.
    const scrollFloor = holdingFrame ? Number.parseFloat(commentsCanvas.style.height) || 0
      : selectedIndex >= 0 ? paneTop + shift + commentsScroll.clientHeight : 0;
    commentsCanvas.style.height = `${Math.max(commentsScroll.clientHeight, scrollFloor, ...placed.map((item) => item.top + item.measuredHeight + 10))}px`;
    if (shift) commentsScroll.scrollTop = paneTop + shift;
    if (activeComment !== undefined && !preservePanePositions) commentsFrameScroll = paneTop + shift;
    if (hoveredComment !== undefined) for (const node of options.host.querySelectorAll<HTMLElement>(`[data-mark-id="${CSS.escape(hoveredComment)}"]`)) node.dataset['commentHovered'] = 'true';
    const active = selectedIndex < 0 ? undefined : placed.find((item) => item.mark.markId === activeComment);
    if (active) {
      const origin = options.comments!.host.parentElement!.getBoundingClientRect();
      const target = active.node.getBoundingClientRect();
      if (target.bottom >= base.top && target.top <= base.bottom) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const firstLine = commentAnchor(active.mark)?.getClientRects()[0] || active.anchor;
        const x = Math.min(firstLine.right, viewport.right) - origin.left;
        const y = firstLine.top + Math.min(firstLine.height, 20) / 2 - origin.top;
        const endX = target.left - origin.left;
        const endY = Math.max(base.top, target.top) + 12 - origin.top;
        line.dataset['commentLeader'] = active.mark.markId;
        line.dataset['markCategory'] = active.mark.categoryKey;
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.dataset['markCategory'] = active.mark.categoryKey;
        dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '3');
        leaders.append(dot);
        line.setAttribute('d', `M ${x} ${y} L ${endX - 8} ${y} L ${endX - 8} ${endY} L ${endX} ${endY}`);
        leaders.append(line);
      }
    }
    commentsCanvas.dataset['loading'] = String(commentsReading > 0);
  }
  function refreshComments(retryFailed = false): void {
    const current = editor.currentWindow();
    const identity = JSON.stringify([current.bookId, current.manuscriptId, current.branchId]);
    if (identity !== commentsIdentity) {
      commentsIdentity = identity;
      for (const entry of commentNodes.values()) { commentsResize.unobserve(entry.node); entry.node.remove(); }
      commentNodes.clear();
      activateComment(undefined);
    }
    cardCache.sync(current);
    scheduleCommentsLayout();
    if (!options.comments?.enabled()) { activateComment(undefined); return; }
    for (const mark of current.marks) {
      if (mark.kind === 'personal-highlight') continue;
      commentsReading++;
      void cardCache.read(mark.markId, () => {
        commentsCanvas.dataset['cardReads'] = String(++commentCardReads);
        return api.getEditorialMarkCard({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId: mark.markId });
      }, retryFailed)
        .catch((error) => { if (!destroyed && current === editor.currentWindow()) options.setStatus(options.errorMessage(error, '批注内容未能读取。'), 'error'); })
        .finally(() => { commentsReading--; scheduleCommentsLayout(); });
    }
  }
  const commentsResize = new ResizeObserver(scheduleCommentsLayout);
  commentsResize.observe(options.scroll);
  commentsResize.observe(options.host);
  if (options.comments) commentsResize.observe(commentsScroll);
  const commentSelection = (): void => {
    if (!options.comments?.enabled()) return;
    if (textPointerDown) return;
    scheduleCommentsLayout();
    // Focusing a card leaves the editor's native selection in place; that retained selection does not own activation.
    if (!options.host.contains(document.activeElement) || !options.host.contains(document.getSelection()?.anchorNode ?? null)) return;
    if (suppressCommentSelection) return;
    const point = editor.captureContinuity().head;
    activateComment(pickEditorialComment(editor.currentWindow().marks, point.blockId, point.grapheme)?.markId);
  };
  document.addEventListener('selectionchange', commentSelection);
  options.scroll.addEventListener('scroll', scrollCommentsText, { passive: true });
  document.addEventListener('pointerup', finishCommentPress);
  document.addEventListener('pointercancel', finishCommentPress);
  document.addEventListener('click', releaseCommentPress);
  commentsScroll.addEventListener('scroll', scrollCommentsPane, { passive: true });
  window.addEventListener('resize', scheduleCommentsLayout);

  /**
   * The proposal workspace a 修改建议 card reads for its 在专用工作区审阅 and atomic group (Issue #1178): read once for the marks the
   * window holds, not again for every card opened over them; a decision or a new window — new marks — reads it again.
   */
  let workspaceRead: { readonly marks: unknown; readonly read: Promise<ProposalWorkspaceProjection> } | null = null;
  const proposalWorkspace = (): Promise<ProposalWorkspaceProjection> => {
    const current = editor.currentWindow();
    if (workspaceRead?.marks !== current.marks) {
      const read = readProposalWorkspace(api, { manuscriptId: current.manuscriptId, branchId: current.branchId, resultId: null });
      workspaceRead = { marks: current.marks, read };
      read.catch(() => { if (workspaceRead?.read === read) workspaceRead = null; });
    }
    return workspaceRead.read;
  };

  const binding = (): { manuscriptId: string; branchId: string; windowStartBlockId: string } => {
    const current = editor.currentWindow();
    return { manuscriptId: current.manuscriptId, branchId: current.branchId, windowStartBlockId: current.blocks[0]!.blockId };
  };

  const blockElement = (blockId: string): HTMLElement | null =>
    options.host.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);

  /** Below the paragraph and aligned to the text column (V2-UX-MARK-003). */
  const placeBelowBlock = (node: HTMLElement, blockId: string): void => {
    const block = blockElement(blockId);
    const base = options.scroll.getBoundingClientRect();
    const rect = (block ?? options.host).getBoundingClientRect();
    node.style.top = `${rect.bottom - base.top + options.scroll.scrollTop + 6}px`;
    node.style.left = `${rect.left - base.left + options.scroll.scrollLeft}px`;
    node.style.width = `${rect.width}px`;
  };

  const closeMenu = (): void => {
    menu?.remove();
    menu = undefined;
  };

  const closeFloating = (): void => {
    floatingRefresh = undefined;
    if (floating !== undefined) {
      const details = floating.querySelector<HTMLDetailsElement>('.editorial-mark-more');
      if (details && floating.dataset['markCard']) moreOpen.set(floating.dataset['markCard'], details.open);
      floating.remove();
      // Where the pane rests once the card's height is gone. The mark lapses two frames on, past the
      // frame that dispatches the `scroll` event of that adjustment, exactly as the editor's own does.
      const mark = { top: options.scroll.scrollTop };
      closedAt = mark;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (closedAt === mark) closedAt = undefined;
      }));
    }
    floating = undefined;
    floatingBlockId = undefined;
    promptFor = null;
    if (openCardId !== undefined) {
      openCardId = undefined;
      editor.setActiveMark(null);
    }
  };

  const close = (): void => {
    closeMenu();
    closeFloating();
  };

  const refuseWhileBusy = (): boolean => {
    if ([...recoveryCards.values()].some((receipt) => receipt.state === 'confirming' || receipt.state === 'unresolved')) {
      options.setStatus('应用结果待确认，请先重新核对原来的应用结果。', 'error');
      return true;
    }
    if (!options.busy() && !working) return false;
    options.setStatus('稿件正在处理另一项操作，请稍候再试。', 'busy');
    return true;
  };

  const applyCommand = (result: EditorialMarkCommandProjection): void => {
    if (destroyed) return;
    editor.setMarks(result.marks, result.marksTruncated);
    cardCache.sync(editor.currentWindow());
    if (result.card) {
      const card = result.card;
      cardCache.put(card);
      if (inlinePreviewId === card.markId || openCardId === card.markId) {
        const previews = card.suggestion !== null && card.status !== 'applied' && card.anchorState === 'exact' && card.suggestion.decision?.disposition !== 'rejected';
        editor.setActiveMark({ markId: card.markId, previewText: previews ? card.suggestion!.decision?.editedText ?? card.suggestion!.proposedText : null });
      }
    }
    refreshComments();
    options.marksChanged?.();
  };

  /** Run one mark command: refused while another is in flight, and every failure is said in words. */
  const command = async (run: () => Promise<void>, failure: string): Promise<boolean> => {
    if (destroyed || refuseWhileBusy()) return false;
    working = true;
    try {
      await run();
      return true;
    } catch (error) {
      options.setStatus(options.errorMessage(error, failure), 'error');
      return false;
    } finally {
      working = false;
    }
  };

  const buildForm = (config: FormConfig): HTMLFormElement => {
    const form = el('form', 'editorial-mark-form');
    form.dataset['markForm'] = config.id;
    form.noValidate = true;
    form.append(el('h4', undefined, config.title));
    if (config.quote !== null) {
      const quote = el('blockquote', 'editorial-mark-quote', config.quote);
      quote.dataset['markQuote'] = 'pinned';
      form.append(quote);
    }
    const inputs = new Map<FormField['name'], HTMLTextAreaElement | HTMLSelectElement>();
    /** A field of boxes (REUSE-050): the boxes with the group each belongs to, and what shows them. */
    const boxGroups: Array<{ field: FormField; set: HTMLFieldSetElement; boxes: Array<{ box: HTMLInputElement; row: HTMLElement; group: string }> }> = [];
    for (const field of config.fields) {
      if (field.checkboxes !== undefined) {
        const set = el('fieldset', 'editorial-mark-field editorial-mark-checkboxes');
        set.dataset['markField'] = field.name;
        set.append(el('legend', undefined, field.label));
        const boxes = field.checkboxes.map((choice) => {
          const row = el('label', 'editorial-mark-checkbox');
          row.dataset['markChoiceGroup'] = choice.group;
          const box = el('input');
          box.type = 'checkbox';
          box.name = field.name;
          box.value = choice.value;
          box.dataset['markCheckbox'] = choice.value;
          row.append(box, el('span', undefined, choice.label));
          if (choice.hint) row.append(el('small', 'muted', choice.hint));
          set.append(row);
          return { box, row, group: choice.group };
        });
        boxGroups.push({ field, set, boxes });
        form.append(set);
        continue;
      }
      const label = el('label', 'editorial-mark-field');
      label.append(el('span', undefined, field.label));
      let input: HTMLTextAreaElement | HTMLSelectElement;
      if (field.options !== undefined) {
        const select = el('select');
        const none = el('option', undefined, '请选择');
        none.value = '';
        select.append(none, ...field.options.map((option) => {
          const node = el('option', undefined, option.label);
          node.value = option.value;
          return node;
        }));
        input = select;
      } else {
        const area = el('textarea');
        area.rows = field.name === 'subject' ? 1 : field.name === 'rationale' || field.name === 'reason' ? 2 : 3;
        input = area;
      }
      input.name = field.name;
      input.value = field.value;
      input.required = field.required;
      input.dataset['markField'] = field.name;
      label.append(input);
      if (field.hint) label.append(el('small', 'muted', field.hint));
      inputs.set(field.name, input);
      form.append(label);
    }
    // A box shows only while the field it is grouped by holds its group; a field with no box to show is hidden whole.
    const showBoxes = (): void => {
      for (const { field, set, boxes } of boxGroups) {
        const held = field.groupedBy === undefined ? null : inputs.get(field.groupedBy)?.value ?? null;
        for (const entry of boxes) entry.row.hidden = held !== null && entry.group !== held;
        set.hidden = boxes.every((entry) => entry.row.hidden);
      }
    };
    for (const { field } of boxGroups) {
      if (field.groupedBy !== undefined) inputs.get(field.groupedBy)?.addEventListener('change', showBoxes);
    }
    showBoxes();
    const problem = el('p', 'editorial-mark-problem');
    problem.setAttribute('role', 'alert');
    problem.hidden = true;
    const submit = el('button', 'primary', config.submitLabel);
    submit.type = 'submit';
    submit.dataset['markAction'] = 'submit';
    const cancel = el('button', 'quiet', '取消');
    cancel.type = 'button';
    cancel.dataset['markAction'] = 'cancel';
    cancel.addEventListener('click', () => config.cancel());
    const row = el('div', 'button-row');
    row.append(submit, cancel);
    // What the action will do is said before the button that does it.
    if (config.note) {
      const note = el('p', 'editorial-mark-form-note', config.note);
      note.dataset['markFormNote'] = config.id;
      form.append(note);
    }
    form.append(problem, row);
    // Ctrl/Cmd+Enter submits from any field (Issue #1411: 修改此处 applies with it); Enter alone stays a line break.
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      form.requestSubmit();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = { body: '', proposedText: '', rationale: '', reason: '', subject: '', knowledgeClass: '', question: '', procedure: '', chosenApart: '' };
      for (const [name, input] of inputs) values[name] = input.value;
      for (const { field, boxes } of boxGroups) values[field.name] = boxes.filter((entry) => !entry.row.hidden && entry.box.checked).map((entry) => entry.box.value).join('\n');
      const missing = config.fields.find((field) => field.required && values[field.name].trim().length === 0);
      if (missing) {
        problem.textContent = `请填写「${missing.label}」。`;
        problem.hidden = false;
        inputs.get(missing.name)?.focus();
        return;
      }
      problem.hidden = true;
      submit.disabled = true;
      void config.submit(values).finally(() => {
        submit.disabled = false;
      });
    });
    queueMicrotask(() => inputs.values().next().value?.focus());
    return form;
  };

  const openComposer = (blockId: string, config: FormConfig): void => {
    close();
    const composer = el('section', 'editorial-mark-composer');
    composer.setAttribute('role', 'dialog');
    composer.setAttribute('aria-label', config.title);
    composer.dataset['markComposer'] = config.id;
    composer.append(buildForm(config));
    placeBelowBlock(composer, blockId);
    layer.append(composer);
    floating = composer;
    floatingBlockId = blockId;
    composer.scrollIntoView({ block: 'nearest' });
  };

  /** Make a mark on what is selected now; the journal is settled first so the range is durable text. */
  const createFromSelection = async (
    kind: EditorialMarkKind,
    content: { highlightColor: PersonalHighlightColor | null; body: string; proposedText: string | null; rationale: string | null },
    range: Extract<ReturnType<BoundedEditor['selectedRange']>, { kind: 'range' }>,
    done: string,
  ): Promise<boolean> => command(async () => {
    await editor.flush();
    const current = editor.currentWindow();
    const result = await api.createEditorialMark({
      ...binding(),
      clientMarkId: crypto.randomUUID(),
      baseRevisionId: current.revisionId,
      expectedJournalSequence: current.journalSequence,
      blockId: range.blockId,
      baseBlockDigest: range.blockDigest,
      fromGrapheme: range.fromGrapheme,
      toGrapheme: range.toGrapheme,
      selectedText: range.text,
      kind,
      ...content,
    });
    applyCommand(result);
    options.setStatus(done, 'success');
  }, '标记未能添加。');

  /** The words selected now, settled first — one block's range, or a span across paragraphs (Issue #1176); `null` once the reason was said. */
  const settledWords = async (): Promise<SelectedWords | null> => {
    composersPending += 1;
    try {
      await editor.flush();
    } finally {
      composersPending -= 1;
    }
    const range = editor.selectedRange();
    if (range.kind === 'range' || range.kind === 'span') return range;
    options.setStatus(selectionMenuReason(range.kind), 'error');
    return null;
  };
  /** The words selected now inside one paragraph, as a mark names them; a span is refused with the marks' reason. */
  const settledRange = async (): Promise<Extract<SelectedWords, { kind: 'range' }> | null> => {
    const words = await settledWords();
    if (words === null || words.kind === 'range') return words;
    options.setStatus(selectionMenuReason('span'), 'error');
    return null;
  };
  /** Those words as the service reads them, bound to the window as it stands: a span carries every block's pin. */
  const selectionInputOf = (range: SelectedWords): DialogueSelectionInput => {
    const current = editor.currentWindow();
    return {
      ...binding(),
      baseRevisionId: current.revisionId,
      expectedJournalSequence: current.journalSequence,
      blockId: range.blockId,
      baseBlockDigest: range.blockDigest,
      fromGrapheme: range.fromGrapheme,
      toGrapheme: range.toGrapheme,
      selectedText: range.text,
      ...(range.kind === 'span' ? { span: range.span } : {}),
    };
  };

  /**
   * 提议为书系「…」的知识… (Issue #63, S28b; SER-013): the selected words of this member Book's manuscript become a candidate
   * for a new item of the Series, citing the exact span at the revision and journal position they stand at now. The manuscript
   * is not changed, and nothing is Series Knowledge until the candidate is taken in by review on the Series' page.
   */
  const composeKnowledge = async (series: { readonly seriesId: string; readonly title: string }, pinnedRange?: Extract<ReturnType<BoundedEditor['selectedRange']>, { kind: 'range' }>): Promise<void> => {
    if (refuseWhileBusy() || options.proposeSeriesKnowledge === undefined) return;
    const propose = options.proposeSeriesKnowledge;
    const range = pinnedRange ?? await settledRange();
    if (range === null) return;
    openComposer(range.blockId, {
      id: 'propose-series-knowledge',
      title: knowledgeMenuLabel(series.title).replace('…', ''),
      quote: range.text,
      fields: [
        { name: 'subject', label: KNOWLEDGE_SUBJECT_LABEL, value: '', required: true },
        {
          name: 'knowledgeClass',
          label: KNOWLEDGE_CLASS_LABEL,
          value: '',
          required: true,
          options: SERIES_KNOWLEDGE_CLASSES.map((knowledgeClass) => ({ value: knowledgeClass, label: SERIES_KNOWLEDGE_CLASS_LABELS[knowledgeClass] })),
        },
        { name: 'body', label: KNOWLEDGE_CONTENT_LABEL, value: range.text, required: true },
      ],
      submitLabel: KNOWLEDGE_PROPOSE,
      note: KNOWLEDGE_MENU_NOTE,
      submit: async (values) => {
        try {
          await editor.flush();
          const current = editor.currentWindow();
          const result = await propose({
            seriesId: series.seriesId,
            target: { kind: 'new', subject: values.subject, knowledgeClass: values.knowledgeClass as SeriesKnowledgeClass },
            content: values.body,
            span: {
              ...binding(),
              baseRevisionId: current.revisionId,
              expectedJournalSequence: current.journalSequence,
              blockId: range.blockId,
              baseBlockDigest: range.blockDigest,
              fromGrapheme: range.fromGrapheme,
              toGrapheme: range.toGrapheme,
              selectedText: range.text,
            },
          });
          options.setStatus(result.completionLabel, 'success');
          closeFloating();
          editor.focus();
        } catch (error) {
          options.setStatus(options.errorMessage(error, '无法提议为书系知识。'), 'error');
        }
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
  };

  const composeNewMark = async (kind: 'annotation' | 'editor-note' | 'change-suggestion'): Promise<void> => {
    if (refuseWhileBusy()) return;
    const range = await settledRange();
    if (range === null) return;
    const suggestion = kind === 'change-suggestion';
    openComposer(range.blockId, {
      id: `create-${kind}`,
      title: suggestion ? '提出修改建议' : kind === 'annotation' ? '添加批注' : '添加备注',
      quote: range.text,
      fields: suggestion
        ? [
            { name: 'proposedText', label: '改为', value: range.text, required: false, hint: '留空表示删去这段文字。' },
            { name: 'rationale', label: '修改理由 · 可选', value: '', required: false },
          ]
        : [{ name: 'body', label: kind === 'annotation' ? '批注内容' : '备注内容', value: '', required: true }],
      submitLabel: suggestion ? '提出修改建议' : kind === 'annotation' ? '添加批注' : '添加备注',
      note: suggestion
        ? '修改建议替换原文，待接受；提出后稿件本身不变。'
        : kind === 'annotation' ? '批注随稿件导出（导出时可选不含批注）。' : '备注仅自己可见：默认不随稿件导出（导出时可选含备注），也不会发送给模型。',
      submit: async (values) => {
        const made = await createFromSelection(
          kind,
          suggestion
            ? { highlightColor: null, body: '', proposedText: values.proposedText, rationale: values.rationale.trim().length > 0 ? values.rationale : null }
            : { highlightColor: null, body: values.body, proposedText: null, rationale: null },
          range,
          suggestion ? '已提出修改建议；稿件本身未改动。' : kind === 'annotation' ? '已添加批注。' : '已添加备注。',
        );
        if (made) {
          closeFloating();
          editor.focus();
        }
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
  };

  /** The editor's revision of each part of their selection, applied at once: one Effect, so one 撤销本次修改 takes it all back. */
  async function recordAndApplySegments(segments: ReadonlyArray<RevisionSegment>, rationale: string | null): Promise<string | null> {
    if (destroyed || refuseWhileBusy() || segments.length === 0) return null;
    const markIds: string[] = [];
    const recorded = await command(async () => {
      await editor.flush();
      const current = editor.currentWindow();
      for (const segment of segments) {
        const result = await api.createEditorialMark({
          ...binding(),
          clientMarkId: crypto.randomUUID(),
          baseRevisionId: current.revisionId,
          expectedJournalSequence: current.journalSequence,
          blockId: segment.blockId,
          baseBlockDigest: segment.blockDigest,
          fromGrapheme: segment.fromGrapheme,
          toGrapheme: segment.toGrapheme,
          selectedText: segment.text,
          kind: 'change-suggestion',
          highlightColor: null,
          body: '',
          proposedText: segment.proposedText,
          rationale: rationale?.trim() || EDITOR_REVISION_RATIONALE,
        });
        markIds.push(result.markId);
        applyCommand(result);
      }
    }, '修订未能记录。');
    if (!recorded || markIds.length !== segments.length) return null;
    const first = markIds[0]!;
    await writeManuscript(first, (clientEffectId) => markIds.length === 1
      ? api.applyChangeSuggestion({ ...binding(), markId: first, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null })
      : api.applyChangeSuggestionBatch({ ...binding(), markIds, clientEffectId }), QUICK_REVISE_APPLIED, undefined, false);
    return editor.currentWindow().marks.find((mark) => mark.markId === first)?.status === 'applied' ? first : null;
  }

  const recordAndApplyEditorRevision: EditorialMarksSurface['recordAndApplyEditorRevision'] = (range, proposedText, rationale) =>
    recordAndApplySegments([{ ...range, proposedText }], rationale ?? null);

  /** 修改此处 (Issue #1411): the composer below the selection, prefilled with its words; 应用修改 records and applies the revision. */
  const composeQuickRevision = async (): Promise<void> => {
    if (refuseWhileBusy()) return;
    const words = await settledWords();
    if (words === null) return;
    const span = words.kind === 'span' ? words.span : null;
    openComposer(words.blockId, {
      id: 'quick-revise',
      title: QUICK_REVISE_TITLE,
      quote: null,
      fields: [
        { name: 'proposedText', label: QUICK_REVISE_FIELD, value: words.text, required: false, hint: span === null ? QUICK_REVISE_FIELD_HINT : QUICK_REVISE_SPAN_HINT },
        { name: 'rationale', label: QUICK_REVISE_RATIONALE, value: '', required: false },
      ],
      submitLabel: QUICK_REVISE_SUBMIT,
      note: QUICK_REVISE_NOTE,
      submit: async (values) => {
        const textOf = (blockId: string): string | undefined => editor.currentWindow().blocks.find((block) => block.blockId === blockId)?.text;
        const segments = span === null
          ? (values.proposedText === words.text ? QUICK_REVISE_UNCHANGED : [{ blockId: words.blockId, blockDigest: words.blockDigest, fromGrapheme: words.fromGrapheme,
              toGrapheme: words.toGrapheme, text: words.text, proposedText: values.proposedText }])
          : spanRevisionSegments(span, textOf, values.proposedText);
        if (typeof segments === 'string') { options.setStatus(segments, 'error'); return; }
        const applied = await recordAndApplySegments(segments, values.rationale.trim().length > 0 ? values.rationale : null);
        if (applied !== null) {
          closeFloating();
          editor.focus();
        }
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
    const field = floating?.querySelector<HTMLTextAreaElement>('[data-mark-field="proposedText"]');
    queueMicrotask(() => { field?.focus(); field?.select(); });
  };

  /** The 批注栏 opened on an applied revision's card, scrolled to it and highlighted; its floating card where the pane cannot show. */
  async function revealRevision(markId: string): Promise<void> {
    if (destroyed) return;
    if (options.revealComments?.() !== true) { await openCard(markId); return; }
    // The pane lays the card out once it is read; the layout brings it forward then (see `layoutComments`), however long that takes.
    revealed = { markId, pending: true };
    revealScroll = undefined;
    closeFloating();
    activateComment(markId);
    refreshComments();
  }

  const update = (
    markId: string,
    action: UpdateEditorialMarkInput['action'],
    extra: Partial<Pick<UpdateEditorialMarkInput, 'body' | 'highlightColor' | 'status' | 'targetKind' | 'proposedText' | 'rationale'>>,
  ): Promise<EditorialMarkCommandProjection> => api.updateEditorialMark({
    ...binding(),
    markId,
    action,
    body: null,
    highlightColor: null,
    status: null,
    targetKind: null,
    proposedText: null,
    rationale: null,
    ...extra,
  });

  async function changeInlineRevision(markId: string, action: 'apply-inline-revision' | 'revert-inline-revision'): Promise<void> {
    if (refuseWhileBusy() || !options.writeInlineRevision) return;
    working = true;
    try {
      const result = await options.writeInlineRevision(() => update(markId, action, {}));
      if (result) { applyCommand(result); refreshComments(); }
    } catch (error) { options.setStatus(options.errorMessage(error, '修订未能更新。'), 'error'); }
    finally { working = false; }
  }

  /** Apply one change to a mark and show what it became: its card, or nothing when it has none now. */
  const change = (
    markId: string,
    action: UpdateEditorialMarkInput['action'],
    extra: Parameters<typeof update>[2],
    done: string,
    reveal = true,
  ): Promise<boolean> => command(async () => {
    const result = await update(markId, action, extra);
    if (destroyed) return;
    applyCommand(result);
    options.setStatus(done, 'success');
    if (reveal) {
      if (result.card !== null && result.card.kind !== 'personal-highlight') showCard(result.card);
      else closeFloating();
    }
  }, '标记未能更新。');

  const convertForm = (
    source: { markId: string; kind: EditorialMarkKind; blockId: string; pinnedText: string; body: string },
    target: EditorialMarkKind,
    cancel: () => void,
  ): FormConfig => {
    const suggestion = target === 'change-suggestion';
    return {
      id: `convert-${target}`,
      title: CONVERT_LABELS[target],
      quote: source.pinnedText,
      fields: suggestion
        ? [
            { name: 'proposedText', label: '改为', value: source.pinnedText, required: false, hint: '留空表示删去这段文字。' },
            { name: 'rationale', label: '修改理由 · 可选', value: source.kind === 'annotation' || source.kind === 'editor-note' ? source.body : '', required: false },
          ]
        : [{ name: 'body', label: target === 'annotation' ? '批注内容' : '备注内容', value: source.body, required: true }],
      submitLabel: CONVERT_LABELS[target],
      submit: async (values) => {
        await change(source.markId, 'convert', suggestion
          ? { targetKind: target, proposedText: values.proposedText, rationale: values.rationale.trim().length > 0 ? values.rationale : null }
          : { targetKind: target, body: values.body },
        `已${CONVERT_LABELS[target].replace('提出', '转为')}。`);
      },
      cancel,
    };
  };

  const copyMarkedText = (mark: Pick<EditorialMarkAnchorProjection, 'blockId' | 'fromGrapheme' | 'toGrapheme'>): void => {
    close();
    if (!editor.selectRange(mark.blockId, mark.fromGrapheme, mark.toGrapheme)) {
      options.setStatus('请先等待当前写入完成，再复制这段文字。', 'error');
      return;
    }
    void runClipboard('copy');
  };

  const runClipboard = async (clipboardCommand: EditorClipboardCommand): Promise<void> => {
    closeMenu();
    editor.focus();
    try {
      await api.runEditorClipboardCommand({ command: clipboardCommand });
    } catch (error) {
      options.setStatus(options.errorMessage(error, '文字处理未完成。'), 'error');
    }
  };

  const region = (name: string, title: string, ...children: Array<Node | string>): HTMLElement => {
    const section = el('section', 'editorial-mark-region');
    section.dataset['markRegion'] = name;
    section.append(el('h4', undefined, title), ...children);
    return section;
  };

  const actionButton = (action: string, label: string, tone: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement => {
    const control = el('button', tone, label);
    control.type = 'button';
    control.dataset['markAction'] = action;
    control.addEventListener('click', run);
    return control;
  };

  const disabledAction = (action: string, label: string, reason: string): HTMLElement => {
    const wrap = el('span', 'editorial-mark-unavailable');
    const control = el('button', 'secondary', label);
    control.type = 'button';
    control.disabled = true;
    control.dataset['markAction'] = action;
    const why = el('small', 'muted', reason);
    why.id = `mark-reason-${action}-${crypto.randomUUID()}`;
    control.setAttribute('aria-describedby', why.id);
    wrap.append(control, why);
    return wrap;
  };

  // Which Review Run and finding a mark came from, asked once per mark while this surface stands: only a
  // later Review Run in 审阅 — a place this surface is gone from by then — can change the answer.
  const reviewLookups = new Map<string, Promise<ReviewFindingOfMarkProjection | null>>();
  const reviewFindingOf = (markId: string): Promise<ReviewFindingOfMarkProjection | null> => {
    let lookup = reviewLookups.get(markId);
    if (lookup === undefined) {
      const current = editor.currentWindow();
      lookup = api.inspectReviewFindingOfMark({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId }).catch(() => {
        reviewLookups.delete(markId);
        return null;
      });
      reviewLookups.set(markId, lookup);
    }
    return lookup;
  };

  const TASK_CARD_REASON = '这条标记的来源任务还不能从这里打开。';
  /**
   * 查看任务 on a card (V2-UX-MARK-008). A mark a Review Run produced opens 审阅 on that Run with the
   * finding in view, once the Run is found; every other AI7 mark keeps the reason it waits for the Task
   * surface, and so does a review mark whose Run cannot be found.
   */
  const viewTaskAction = (card: EditorialMarkCardProjection): HTMLElement => {
    const openReview = options.openReviewFinding;
    if (card.source.origin !== 'review-category' || openReview === undefined) return disabledAction('view-task', '查看任务', TASK_CARD_REASON);
    const waiting = disabledAction('view-task', '查看任务', REVIEW_VIEW_TASK_RESOLVING);
    void reviewFindingOf(card.markId).then((found) => {
      if (destroyed || !waiting.isConnected) return;
      if (found === null) {
        const reason = waiting.querySelector('small');
        if (reason !== null) reason.textContent = REVIEW_VIEW_TASK_ABSENT;
        return;
      }
      waiting.replaceWith(actionButton('view-task', '查看任务', 'secondary', () => {
        close();
        openReview(found);
      }));
    });
    return waiting;
  };

  /** The mark menu's 查看任务 knows only that a mark is AI7's, so it asks, and comes alive for a review mark. */
  const viewTaskMenuResolver = (markId: string): Pick<MenuItem, 'resolve'> => {
    const openReview = options.openReviewFinding;
    if (openReview === undefined) return {};
    return {
      resolve: async () => {
        const found = await reviewFindingOf(markId);
        return found === null ? null : () => openReview(found);
      },
    };
  };

  const basisList = (card: EditorialMarkCardProjection): HTMLElement => {
    if (card.basis.length === 0) return el('p', 'muted', '这条标记没有附带依据与核查记录。');
    const list = el('ul', 'editorial-mark-basis');
    for (const basis of card.basis) {
      const item = el('li');
      item.append(el('strong', undefined, basis.label));
      if (basis.quote !== null) item.append(el('span', 'editorial-mark-basis-quote', `「${basis.quote}」`));
      list.append(item);
    }
    return list;
  };

  /**
   * A review mark's factual sources (ADR 0095 §5; Issue #1174): once its Run and finding are found, the sources its review card
   * lists — the result's, less the excluded, with their retained 来源译文. Nothing for a mark with no factual result.
   */
  const findingEvidence = (card: EditorialMarkCardProjection): HTMLElement[] => {
    if (card.source.origin !== 'review-category') return [];
    const slot = el('div', 'editorial-mark-evidence');
    void reviewFindingOf(card.markId).then(async (found) => {
      if (found === null) return;
      const sources = (await readFindingSources(api, found.bookId, found.reviewRunId, undefined, found.findingId)).get(found.findingId) ?? [];
      if (sources.length > 0 && !destroyed && slot.isConnected) slot.replaceChildren(findingEvidenceList(sources));
    });
    return [slot];
  };

  /**
   * A Correction Proposal's factual lineage (Issue #901; CORR-012, EASSURE-012): the result version it came from with its three
   * states apart, the level, the sources checked and only candidates, the policy version — and 证据核查未完成 with what is
   * missing, kept on the card through decision, Apply and reversal. Nothing for any other mark.
   */
  const factualLineage = (card: EditorialMarkCardProjection): HTMLElement[] => {
    const lineage = card.factualCorrection;
    if (lineage === undefined) return [];
    const block = el('div', 'editorial-mark-factual');
    block.dataset['markFactualResult'] = lineage.resultId;
    block.dataset['markFactualVersion'] = String(lineage.resultVersion);
    if (lineage.assuranceLabel !== null) {
      const label = el('p', 'editorial-mark-factual-incomplete', lineage.assuranceLabel);
      label.dataset['markAssurance'] = 'incomplete';
      block.append(label);
      if (lineage.missingChecks.length > 0) block.append(el('p', 'muted', `尚缺：${lineage.missingChecks.join('、')}`));
    }
    const facts = el('dl', 'editorial-mark-factual-facts');
    for (const [term, value] of [
      ['事实核查结果', `第 ${lineage.resultVersion} 版 · ${lineage.levelLabel}`],
      ['引文完整性', lineage.states.referenceIntegrity === 'verified' ? '引文已在原文中定位' : '引文未能定位'],
      ['断言支持', lineage.states.claimSupport],
      ['事实核查', lineage.states.factualVerification],
      ['来源', `已核对 ${lineage.checkedSources} 个 · 候选 ${lineage.candidateSources} 个`],
      ['核查政策', `${lineage.policyPin.document} · ${lineage.policyPin.sha256.slice(0, 12)}`],
    ] as ReadonlyArray<readonly [string, string]>) facts.append(el('dt', undefined, term), el('dd', undefined, value));
    block.append(facts, el('p', 'muted', '核查结果是证据评估，不是事实定论；这条修改建议仍由你决定是否应用。'));
    return [block];
  };

  function composeCard(card: EditorialMarkCardProjection, form?: (cancel: () => void) => FormConfig, inline = false): HTMLElement {
    const cardAction = (action: string, label: string, tone: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement =>
      actionButton(action, label, tone, () => {
        if (inline && cardCache.cards.get(card.markId) !== card) { options.setStatus('批注正在更新，请稍候再操作。', 'busy'); return; }
        run();
      });
    if (!inline) closeMenu();
    if (promptFor !== null && promptFor.markId !== card.markId) promptFor = null;
    const previous = inline ? commentNodes.get(card.markId)?.node : floating?.dataset['markCard'] === card.markId ? floating : null;
    const active = previous?.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusAction = active?.dataset['markAction'];
    const focusMore = active?.tagName === 'SUMMARY' && active.parentElement?.classList.contains('editorial-mark-more');
    const priorMore = previous?.querySelector<HTMLDetailsElement>('.editorial-mark-more');
    if (priorMore) moreOpen.set(card.markId, priorMore.open);
    const dismiss = cardAction(inline ? 'expand' : 'close', inline ? '展开' : '关闭', 'quiet', () => {
      if (inline) showCard(card);
      else { closeFloating(); editor.focus(); }
    });
    const { panel, more, actions } = renderEditorialMarkCard(card, { technical: technicalLayerVisible, moreOpen, dismiss });
    panel.setAttribute('role', inline ? 'listitem' : 'dialog');
    panel.setAttribute('aria-label', `${MARK_KIND_LABELS[card.kind]}${inline ? '卡片' : '浮卡'}`);

    if (card.anchorState !== 'exact') {
      const drifted = el('p', 'editorial-mark-drifted', markDriftNote(card));
      drifted.dataset['markDrifted'] = 'true';
      more.append(drifted);
    }

    const reopen = (): void => showCard(card);
    const exact = card.anchorState === 'exact';
    const disposition = el('div', 'button-row');
    const convertOrExplain = (target: EditorialMarkKind): HTMLElement => exact
      ? cardAction(`convert-${target}`, CONVERT_LABELS[target], 'secondary', () => {
          if (card.kind === 'editor-note' && target === 'annotation') {
            void change(card.markId, 'convert', { targetKind: 'annotation' }, '已转为批注；它会随稿件导出。');
          } else if (card.kind === 'change-suggestion') {
            void change(card.markId, 'convert', { targetKind: 'annotation' }, '已转为批注。');
          } else {
            showCard(card, (cancel) => convertForm(card, target, cancel));
          }
        })
      : disabledAction(`convert-${target}`, CONVERT_LABELS[target], '原文已变，无法在这段文字上转换。');

    if (card.kind === 'change-suggestion' && card.suggestion !== null) {
      const suggestion = card.suggestion;
      const decision = suggestion.decision;
      // A conflict that is not resolved yet blocks the Apply; 解决冲突… stands beside what it blocks (Issue #57).
      const conflictOpen = card.conflict !== null && (card.conflict.state === 'unresolved' || card.conflict.state === 'deferred');
      const openConflict = options.openConflict;
      const resolveConflict = (): HTMLButtonElement[] => conflictOpen && openConflict !== undefined
        ? [cardAction('resolve-conflict', RESOLVE_CONFLICT_LABEL, 'primary', () => {
            close();
            openConflict(card.markId);
          })]
        : [];
      // ADR 0085 §2: said beside an available 接受并应用 or 应用到稿件, never beside a blocked one.
      const safeMerge = (): HTMLElement[] => {
        if (!exact || !card.changedElsewhere) return [];
        const line = el('p', 'editorial-mark-safe-merge', SAFE_MERGE_LINE);
        line.dataset['markSafeMerge'] = 'true';
        return [line];
      };
      const applied = card.status === 'applied' ? suggestion.application : null;
      const shown = decision?.editedText ?? suggestion.proposedText;
      // An insertion a file's author proposed stands at a point and replaces nothing (Issue #411).
      const inserts = suggestion.changeType === 'insert';
      more.append(
        el('p', 'muted', card.inlineRevision
          ? card.status === 'applied' ? '这处修改已保存并应用；可撤销本次修改。' : '正文正在显示你的修改；可应用修改或忽略/还原。'
          : applied !== null
          ? '这处修改已经写入稿件；正文里是应用后的文字。'
          : exact && decision?.disposition !== 'rejected'
            ? technicalWords(inserts
              ? '正文里在插入处显示要插入的文字（预览 · 未应用）；稿件本身仍是原文。'
              : '正文里显示的是替换后的样子（预览 · 未应用）；稿件本身仍是原文。', '待采纳的修改')
            : technicalWords('稿件本身仍是原文。', '尚未应用')),
        region('basis', '依据与核查', basisList(card), ...factualLineage(card), ...findingEvidence(card)),
      );
      const yours = actions;
      const pendingReceipt = recoveryCards.get(card.markId);
      if (pendingReceipt) {
        const state = el('p', 'editorial-mark-recorded', pendingReceipt.state === 'confirming' ? '正在确认应用结果' : pendingReceipt.state === 'unresolved' ? '结果待确认' : pendingReceipt.state === 'applied' ? '已应用' : '未应用');
        state.dataset['applyReceiptState'] = pendingReceipt.state; yours.append(state, el('p', 'muted', pendingReceipt.reason));
      }
      // One decision system on the card (ADR 0096 §3): the draft dispositions live only in the proposal workspace, which the
      // card opens; an atomic group is decided there as a whole.
      if (applied === null && pendingReceipt?.state !== 'unresolved' && pendingReceipt?.state !== 'confirming') {
        const workspaceRow = el('div', 'button-row'); more.append(workspaceRow);
        void proposalWorkspace().then((workspace) => {
          if (!workspaceRow.isConnected) return;
          const item = workspace.items.find((entry) => entry.markId === card.markId); if (!item) return;
          if ((workspace.offerWorkspace || item.atomicGroupId !== null) && options.openProposalWorkspace) workspaceRow.append(cardAction('proposal-workspace', '在专用工作区审阅', 'secondary', () => options.openProposalWorkspace?.()));
          if (item.atomicGroupId !== null) {
            workspaceRow.append(el('p', 'muted', technicalWords(`原子组：${item.atomicReason ?? '依赖说明缺失'}；部分采纳会造成上述不一致。拆分需要新的提案版本。`,
              `这些修改需要一起处理${item.atomicReason === null ? '' : `：${item.atomicReason}`}`)));
            for (const member of workspace.items.filter((entry) => entry.atomicGroupId === item.atomicGroupId)) workspaceRow.append(el('p', 'muted', `${member.chapter} · 第 ${member.position} 段${technicalWords(` ${member.fromGrapheme}–${member.toGrapheme}`)}`));
          }
        }).catch(() => {});
      }

      if (card.inlineRevision) {
        const act = (action: 'apply-inline-revision' | 'revert-inline-revision') => changeInlineRevision(card.markId, action);
        if (card.status === 'open') disposition.append(cardAction('accept-and-apply', '应用修改', 'primary', () => void act('apply-inline-revision')));
        disposition.append(exact ? cardAction('reverse-revision', card.status === 'applied' ? REVERSE_REVISION_LABEL : '忽略/还原', 'secondary',
          () => void act('revert-inline-revision')) : disabledAction('reverse-revision', '这处文字又改过', '请先查看当前稿件。'));
        yours.append(disposition);
      } else if (pendingReceipt?.state === 'confirming' || pendingReceipt?.state === 'unresolved') {
        yours.append(el('p', 'muted', technicalWords('应用结果确认前不能再次应用。', '正在确认上次修改的结果，请稍后再试。')));
        // EREC-005: the editor's re-check reads the authoritative records by the same Effect identity; it dispatches nothing.
        if (pendingReceipt.state === 'unresolved') yours.append(cardAction('receipt-recheck', '重新核对应用结果', 'secondary', () => void api.inspectApplyReceipt({
          manuscriptId: binding().manuscriptId, branchId: binding().branchId, clientEffectId: pendingReceipt.clientEffectId, recovery: 'recheck',
        }).then(async (receipt) => {
          setRecovery(card.markId, receipt.state === 'unresolved' ? receipt : undefined);
          cardCache.invalidate(card.markId);
          options.setStatus(receipt.reason, receipt.state === 'unresolved' ? 'error' : 'success');
          await openCard(card.markId);
        }).catch((error) => options.setStatus(options.errorMessage(error, '无法重新核对应用结果。'), 'error'))));
      } else if (suggestion.atomicGroupId !== null && applied === null) {
        yours.append(el('p', 'muted', '本组只能记录一个整体处理；在专用提案工作区记录决定和准备应用。'));
      } else if (applied !== null) {
        // 已应用 is said only of a verified Effect Receipt (V2-UX-EAPP-011, EREC-002); what it binds is one step away.
        const receipt = el('p', 'editorial-mark-recorded', `已应用 · 已写入稿件 · ${markTimeLabel(applied.committedAt)} · 你`);
        receipt.dataset['markApplication'] = applied.effectId;
        more.append(receipt);
        void api.inspectApplyReceipt({ manuscriptId: binding().manuscriptId, branchId: binding().branchId, clientEffectId: applied.effectId, recovery: 'settled' }).then((value) => { if (receipt.isConnected) receipt.dataset['applyReceiptState'] = value.state; }).catch(() => {});
        more.append(cardAction('receipt-manuscript', '在稿件中查看', 'quiet', () => { closeFloating(); editor.focus(); }), cardAction('receipt-proposal', '返回提案', 'quiet', reopen));
        if (decision) {
          yours.dataset['markReasonState'] = decision.reasonState;
          more.append(...reasonNodes(card, decision));
        }
        const credentials = el('details', 'editorial-mark-receipt');
        credentials.dataset['markReceipt'] = applied.receiptId;
        credentials.append(el('summary', undefined, '查看完整凭据'));
        const bound = el('dl');
        for (const [term, value] of [
          ['应用（Effect）', applied.effectId],
          ['提案决定', decision?.decisionId ?? ''],
          ['应用批准（Effect Approval）', applied.approvalId],
          ['派发', applied.dispatchId],
          ['应用凭据（Effect Receipt）', `${applied.receiptId} · ${applied.receiptDigest}`],
          ['应用前的稿件', `${applied.before.revisionId} · 修订日志序号 ${applied.before.journalSequence} · ${applied.before.workingDigest}`],
          ['应用后的稿件', `${applied.after.revisionId} · 修订日志序号 ${applied.after.journalSequence} · ${applied.after.workingDigest}`],
          ['写入处数', String(applied.changeCount)],
        ] as ReadonlyArray<readonly [string, string]>) {
          bound.append(el('dt', undefined, term), el('dd', undefined, value));
        }
        credentials.append(bound, el('p', 'muted', '凭据只证明这次写入发生了，不证明内容的对错。'));
        more.append(technicalDisclosure(credentials));
        if (form) {
          yours.append(buildForm(form(reopen)));
        } else if (exact) {
          // 撤销本次修改 (Issue #1411): one click writes the original back as a reversal Effect (Issue #1410 item 7: no prepared second step).
          disposition.append(cardAction('reverse-revision', REVERSE_REVISION_LABEL, 'secondary', () => void writeManuscript(card.markId,
            (clientEffectId) => api.reverseAppliedChangeSuggestion({ ...binding(), markId: card.markId, clientEffectId }), REVERSE_REVISION_DONE)));
          yours.append(disposition);
        } else {
          // Issue #1410 item 7: the one undo is 撤销本次修改; when the applied words changed again it says why it cannot act.
          disposition.append(disabledAction('reverse-revision', REVERSE_REVISION_LABEL, '应用后的文字又改过，不能直接撤销这次应用。'));
          yours.append(disposition);
          yours.append(...resolveConflict());
          if (card.conflict?.state === 'resolved' && card.conflict.outcome === 'new-version') {
            const correction = el('p', 'muted', REVERSAL_CORRECTION_LINE);
            correction.dataset['markCorrection'] = card.conflict.newMarkId ?? '';
            yours.append(correction);
          }
        }
      } else if (decision === null) {
        disposition.append(
          exact
            ? cardAction('accept-and-apply', '接受并应用', 'primary', () => void writeManuscript(card.markId, (clientEffectId) => api.applyChangeSuggestion({
                ...binding(), markId: card.markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null,
              }), '已应用这条修改建议。', null, !inline))
            : disabledAction('accept-and-apply', '接受并应用', '原文已变，无法应用这条修改建议。'),
          ...resolveConflict(),
          cardAction('reject', '拒绝', 'secondary', () => void decide(card, 'rejected', null, null, !inline)),
          exact
            ? cardAction('accept-with-edit', '修改后接受', 'secondary', () => showCard(card, (cancel) => ({
                id: 'accept-with-edit',
                title: '修改后接受',
                quote: inserts ? null : suggestion.currentText,
                fields: [
                  {
                    name: 'proposedText', label: '编辑建议文本', value: suggestion.proposedText, required: false,
                    hint: inserts ? '填写要在此插入的文字。' : '留空表示删去这段文字。',
                  },
                  { name: 'reason', label: '为什么这样改？ · 可选', value: '', required: false },
                ],
                submitLabel: '接受修改后的版本并应用',
                submit: (values) => writeManuscript(card.markId, (clientEffectId) => api.applyChangeSuggestion({
                  ...binding(), markId: card.markId, clientEffectId, interaction: 'accept-edited-and-apply',
                  editedText: values.proposedText, reason: values.reason.trim().length > 0 ? values.reason : null,
                }), '已按你改定的文字应用。', null),
                cancel,
              })))
            : disabledAction('accept-with-edit', '修改后接受', '原文已变，无法接受这条修改建议。'),
        );
        yours.append(disposition, ...safeMerge());
        more.append(inserts ? disabledAction('convert-annotation', CONVERT_LABELS.annotation, INSERTION_CONVERT_REASON) : convertOrExplain('annotation'));
        if (form) yours.append(buildForm(form(reopen)));
      } else {
        const recorded = el('p', 'editorial-mark-recorded', decision.disposition === 'rejected'
          ? card.conflict?.outcome === 'keep-current' ? '已拒绝 · 保留当前稿件' : '已拒绝 · 原文保留'
          : decision.disposition === 'deferred' ? '已记录 · 暂不决定' : '已采纳 · 尚未应用');
        recorded.dataset['markDecision'] = decision.disposition;
        if (decision.disposition === 'accepted-with-edit' || decision.disposition === 'accepted') {
          disposition.append(exact
            ? cardAction('apply-recorded', '应用到稿件', 'primary', () => void writeManuscript(card.markId, (clientEffectId) => api.applyChangeSuggestion({
                ...binding(), markId: card.markId, clientEffectId, interaction: 'apply-recorded-decision', editedText: null, reason: null,
              }), '已按你改定的文字应用。', decision.decisionId, !inline))
            : disabledAction('apply-recorded', '应用到稿件', '原文已变，无法应用这条修改建议。'), ...resolveConflict());
        }
        // 保留当前稿件 resolved a conflict with this rejection; that resolution is final (Issue #57).
        if (card.conflict?.outcome !== 'keep-current') {
          more.append(cardAction('withdraw', '撤回', 'quiet', () => void decide(card, 'withdrawn', null, null)));
        }
        more.append(recorded);
        yours.append(disposition, ...(decision.disposition === 'accepted-with-edit' ? safeMerge() : []));
        yours.dataset['markReasonState'] = decision.reasonState;
        more.append(...reasonNodes(card, decision));
        if (form) yours.append(buildForm(form(reopen)));
      }
      if (card.source.kind === 'ai7') more.append(viewTaskAction(card));
    } else {
      if (card.kind === 'annotation' && (card.basis.length > 0 || card.source.kind === 'ai7')) more.append(region('basis', '依据', basisList(card), ...findingEvidence(card)));
      const yours = actions;
      if (card.kind === 'annotation') {
        disposition.append(
          cardAction('reply', '回复', 'secondary', () => { if (inline) { openCommentReply(card.markId); return; } showCard(card, (cancel) => ({
            id: 'reply',
            title: '回复',
            quote: null,
            fields: [{ name: 'body', label: '回复内容', value: '', required: true }],
            submitLabel: '发送回复',
            submit: async (values) => { await change(card.markId, 'reply', { body: values.body }, '已回复。'); },
            cancel,
          })); }),
          card.status === 'open'
            ? cardAction('resolve', '标记为已处理', 'secondary', () => void change(card.markId, 'set-status', { status: 'resolved' }, '已标记为已处理。', !inline))
            : cardAction('reopen', '重新打开', 'secondary', () => void change(card.markId, 'set-status', { status: 'open' }, '已重新打开。', !inline)),
        );
        more.append(convertOrExplain('change-suggestion'));
        if (card.source.kind === 'ai7') more.append(viewTaskAction(card));
      } else {
        more.append(convertOrExplain('annotation'), convertOrExplain('change-suggestion'));
      }
      if (card.source.kind === 'editor') {
        disposition.prepend(cardAction('edit', '编辑', 'secondary', () => showCard(card, (cancel) => ({
          id: 'edit',
          title: card.kind === 'annotation' ? '编辑批注' : '编辑备注',
          quote: null,
          fields: [{ name: 'body', label: card.kind === 'annotation' ? '批注内容' : '备注内容', value: card.body, required: true }],
          submitLabel: '保存',
          submit: async (values) => { await change(card.markId, 'edit-body', { body: values.body }, '已保存。'); },
          cancel,
        }))));
      }
      more.append(cardAction('remove', '删除', 'quiet', () => void change(card.markId, 'remove', {}, card.kind === 'annotation' ? '已删除批注。' : '已删除备注。')));
      yours.append(disposition);
      if (form) yours.append(buildForm(form(reopen)));
      more.append(el('p', 'muted', card.kind === 'annotation'
        ? '批注随稿件导出（导出时可选不含批注）。'
        : '默认不随稿件导出（导出时可选含备注），也不会发送给模型。'));
    }

    const technical = el('details', 'technical-details');
    technical.append(el('summary', undefined, '查看技术详情'));
    const identities = el('dl');
    const identityRows: Array<readonly [string, string]> = [
      ['标记标识', card.markId],
      ['标记时的修订版', `${card.pin.revisionLabel} · ${card.pin.revisionId}`],
      ['标记时的修订日志序号', String(card.pin.journalSequence)],
      ['标记时的段落摘要', card.pin.blockDigest],
      ['段落', `${card.blockId} · 字素 ${card.fromGrapheme}–${card.toGrapheme}`],
    ];
    if (card.suggestion) identityRows.push(['提案修改项', card.suggestion.itemId]);
    if (card.suggestion?.decision) identityRows.push(['提案决定', card.suggestion.decision.decisionId]);
    for (const [term, value] of identityRows) {
      identities.append(el('dt', undefined, term), el('dd', undefined, value));
    }
    technical.append(identities);
    more.append(technicalDisclosure(technical));
    settleEditorialMarkCard({ more, actions });

    if (inline) return panel;
    floating?.remove();
    placeBelowBlock(panel, card.blockId);
    layer.append(panel);
    floating = panel;
    floatingBlockId = card.blockId;
    openCardId = card.markId;
    panel.scrollIntoView({ block: 'nearest' });
    const previews = card.suggestion !== null && card.status !== 'applied' && card.anchorState === 'exact' && card.suggestion.decision?.disposition !== 'rejected';
    inlinePreviewId = undefined;
    editor.setActiveMark({
      markId: card.markId,
      previewText: previews ? card.suggestion!.decision?.editedText ?? card.suggestion!.proposedText : null,
    });
    if (!form) {
      const restore = focusMore ? more.querySelector<HTMLElement>('summary') : focusAction ? panel.querySelector<HTMLElement>(`[data-mark-action="${CSS.escape(focusAction)}"]`) : null;
      (restore ?? dismiss).focus({ preventScroll: true });
    }
    return panel;
  }

  function showCard(card: EditorialMarkCardProjection, form?: (cancel: () => void) => FormConfig): void {
    if (destroyed) return;
    composeCard(card, form);
  }

  /**
   * The reason under `你的处理` (Issue #61, S26a): as it stands, if one was given; the one row asking for it, while it is open;
   * otherwise the editor's own way to give or change it. Nothing here counts, reminds or asks again.
   */
  function reasonNodes(card: EditorialMarkCardProjection, decision: ProposalItemDecisionProjection): HTMLElement[] {
    const asking = promptFor !== null && promptFor.markId === card.markId && promptFor.decisionId === decision.decisionId ? promptFor.mode : null;
    const nodes: HTMLElement[] = [];
    if (decision.reasonState === 'given' && decision.reason !== null) {
      const reason = el('p', 'muted', decisionReasonLine(decision.reason, decision.reasonRevisedAt, markTimeLabel));
      reason.dataset['markReason'] = decision.reasonSource ?? '';
      nodes.push(reason);
      const source = el('p', 'muted', decision.reasonSource === 'suggested' ? '原因来源：你选择的选项' : '原因来源：你自行输入的文字');
      source.dataset['markReasonSource'] = decision.reasonSource ?? '';
      nodes.push(source);
    }
    if (asking !== null) {
      nodes.push(reasonChips(card, decision, asking));
    } else {
      const later = el('div', 'button-row editorial-mark-reason-later');
      const revising = decision.reasonState === 'given';
      later.append(actionButton(revising ? 'reason-revise' : 'reason-add', revising ? DECISION_REASON_REVISE : DECISION_REASON_ADD, 'quiet', () => {
        promptFor = { markId: card.markId, decisionId: decision.decisionId, mode: revising ? 'revise' : 'add' };
        showCard(card);
        floating?.querySelector<HTMLElement>('[data-mark-reasons] button')?.focus();
      }));
      nodes.push(later);
    }
    const ask = learningAsks.get(card.markId);
    if (ask !== undefined && (ask.decisionId !== decision.decisionId || ask.node.dataset['learningAskState'] !== undefined)) learningAsks.delete(card.markId);
    else if (ask !== undefined) nodes.push(ask.node);
    return nodes;
  }

  function reasonChips(card: EditorialMarkCardProjection, decision: ProposalItemDecisionProjection, mode: 'add' | 'revise'): HTMLElement {
    const disposition = decision.disposition;
    const wrap = el('div', 'editorial-mark-reasons');
    wrap.dataset['markReasons'] = disposition;
    wrap.dataset['markReasonMode'] = mode;
    const question = el('p', 'muted', DECISION_REASON_PROMPTS[disposition]);
    question.id = `mark-reason-question-${crypto.randomUUID()}`;
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-labelledby', question.id);
    wrap.append(question);
    const row = el('div', 'button-row');
    const finish = (result: EditorialMarkCommandProjection, status: string): void => {
      promptFor = null;
      applyCommand(result);
      options.setStatus(status, 'success');
      if (result.card) showCard(result.card);
    };
    const record = (reason: string, reasonSource: 'suggested' | 'free-text'): void => void command(async () => {
      if (mode === 'revise') {
        finish(await api.recordProposalDecisionFeedback({
          ...binding(), markId: card.markId, decisionId: decision.decisionId, expectedFeedback: decision.feedbackEntries, action: 'revise', reason, reasonSource,
        }), DECISION_REASON_STATUS.revised);
      } else {
        finish(await api.recordProposalDecisionReason({ ...binding(), markId: card.markId, decisionId: decision.decisionId, reason, reasonSource }), DECISION_REASON_STATUS.recorded);
      }
    }, DECISION_REASON_STATUS.failed);
    for (const chip of DECISION_REASON_CHIPS[disposition]) {
      const control = actionButton('reason-chip', chip, 'quiet', () => record(chip, 'suggested'));
      control.dataset['markReasonChip'] = chip;
      row.append(control);
    }
    row.append(actionButton('reason-own', DECISION_REASON_OWN, 'quiet', () => showCard(card, (cancel) => ({
      id: 'decision-reason',
      title: '你的原因',
      quote: null,
      fields: [{ name: 'reason', label: '原因', value: '', required: true }],
      submitLabel: '记下原因',
      submit: async (values) => record(values.reason, 'free-text'),
      cancel,
    }))));
    row.append(actionButton('reason-cancel', DECISION_REASON_CANCEL, 'quiet', () => {
      promptFor = null;
      showCard(card);
      floating?.querySelector<HTMLElement>(`[data-mark-action="${mode === 'revise' ? 'reason-revise' : 'reason-add'}"]`)?.focus({ preventScroll: true });
    }));
    wrap.append(row);
    return wrap;
  }

  /**
   * A decision just recorded may raise the learning ask (Issue #1109; ADR 0095 §7), which the service offers or withholds by the
   * persisted 经常 / 偶尔 / 关闭. The decision is already complete: a slow or failed ask delays no repaint, Apply or decision.
   */
  function notePrompt(before: string | null, after: EditorialMarkCardProjection | null): void {
    const decision = after?.suggestion?.decision ?? null;
    promptFor = null;
    if (after === null || decision === null || decision.decisionId === before) return;
    void api.recordLearningReasonAsk({ action: 'offer', decisionId: decision.decisionId }).then((ask) => {
      if (ask === null || destroyed) return;
      const node = learningReasonAskCard(ask, api);
      learningAsks.set(after.markId, { decisionId: decision.decisionId, node });
      if (openCardId !== after.markId || floating?.dataset['learningDecisionId'] !== decision.decisionId) return;
      floating?.querySelector<HTMLElement>('[data-mark-region="disposition"]')?.append(node);
    }).catch(() => {});
  }

  async function decide(
    card: EditorialMarkCardProjection,
    disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn',
    editedText: string | null,
    reason: string | null,
    reveal = true,
  ): Promise<void> {
    const before = card.suggestion?.decision?.decisionId ?? null;
    await command(async () => {
      const result = await api.recordChangeSuggestionDecision({
        ...binding(),
        markId: card.markId,
        clientDecisionId: crypto.randomUUID(),
        disposition,
        editedText,
        reason,
      });
      if (destroyed) return;
      applyCommand(result);
      options.setStatus(
        disposition === 'rejected' ? '已拒绝这条修改建议；原文保留。'
          : disposition === 'withdrawn' ? '已撤回你的处理。'
            : '已记录「修改后接受」；稿件尚未改动。',
        'success',
      );
      notePrompt(before, result.card);
      if (reveal && result.card) showCard(result.card);
    }, '你的处理未能记录。');
  }

  /**
   * One manuscript write through AI7 Apply, with its Effect identity made once and a lost acknowledgement
   * recovered by that same identity (`applyOnce`, shared with 审阅's results).
   */
  async function writeManuscript(
    markId: string,
    run: (clientEffectId: string) => Promise<ManuscriptApplyCommandProjection>,
    done: string,
    /** The decision an Apply starts from, when it may record a new one to ask about; `undefined` for a reversal. */
    decidedBefore?: string | null,
    reveal = true,
  ): Promise<void> {
    if (destroyed || refuseWhileBusy()) return;
    working = true;
    try {
      options.setStatus('正在应用到稿件…', 'busy');
      const applied = await applyOnce(
        editor.currentWindow(),
        (clientEffectId) => options.writeManuscript(() => run(clientEffectId), done),
        (input) => api.getManuscriptApplyOutcome(input),
        undefined,
        async (clientEffectId, state) => {
          const label = state === 'confirming' ? '正在确认应用结果' : '结果待确认';
          const status = el('p', 'editorial-mark-recorded', label); status.dataset['applyReceiptState'] = state;
          (floating?.querySelector('[data-mark-region="disposition"]') ?? layer).append(status); options.setStatus(label, 'busy');
          const receipt = await api.inspectApplyReceipt({ manuscriptId: editor.currentWindow().manuscriptId, branchId: editor.currentWindow().branchId, clientEffectId, recovery: state });
          setRecovery(markId, receipt); status.remove();
          if (receipt.state === 'applied' || receipt.state === 'not-applied') cardCache.invalidate(markId);
          if (state === 'unresolved') await openCard(markId);
        },
      );
      if (applied.acknowledged) {
        setRecovery(markId);
        if (decidedBefore !== undefined) notePrompt(decidedBefore, applied.result.card);
        applyCommand(applied.result);
        if (reveal && applied.result.card !== null) showCard(applied.result.card);
        if (decidedBefore !== undefined) showToast(done, { action: { label: '撤销', run: () => void writeManuscript(markId,
          (clientEffectId) => api.reverseAppliedChangeSuggestion({ ...binding(), markId, clientEffectId }), '已撤销本次应用。') } });
        return;
      }
      if (applied.outcome === null) throw applied.outcomeFailure;
      setRecovery(markId);
      if (applied.outcome.state === 'committed') options.setStatus(`${done}写入结果已从记录确认。`, 'success');
      cardCache.invalidate(markId);
      await openCard(markId);
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法确认这次应用的结果；请重新打开这条修改建议查看。'), 'error');
    } finally {
      working = false;
    }
  }

  const openCard = async (markId: string, form?: (card: EditorialMarkCardProjection, cancel: () => void) => FormConfig): Promise<void> => {
    if (destroyed) return;
    try {
      const current = editor.currentWindow();
      cardCache.sync(current);
      const card = await cardCache.read(markId, () => api.getEditorialMarkCard({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId }), true);
      if (destroyed || !card || editor.currentWindow() !== current) return;
      scheduleCommentsLayout();
      showCard(card, form ? (cancel) => form(card, cancel) : undefined);
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法打开这条标记。'), 'error');
    }
  };

  const showMenu = (kind: 'selection' | 'mark', title: string, groups: ReadonlyArray<MenuGroup>, at: { x: number; y: number }): void => {
    close();
    const panel = el('div', 'editorial-mark-menu');
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', title);
    panel.dataset['markMenu'] = kind;
    const controls: HTMLButtonElement[] = [];
    for (const group of groups) {
      const section = el('div', 'editorial-mark-menu-group');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', group.label);
      section.append(el('p', 'section-label', group.label));
      for (const item of group.items) {
        const control = el('button', 'editorial-mark-menu-item');
        control.type = 'button';
        control.setAttribute('role', 'menuitem');
        control.dataset['markAction'] = item.action;
        if (item.action === 'quick-revise') control.dataset['markQuickRevise'] = 'true';
        const caption = el('span', 'menu-caption');
        if (item.seriesId !== undefined) control.dataset['seriesId'] = item.seriesId;
        if (item.swatch !== undefined) {
          control.dataset['markColor'] = String(item.swatch);
          caption.append(el('span', 'editorial-mark-swatch'));
        }
        caption.append(el('span', undefined, item.label));
        if (item.hint) caption.append(el('small', 'muted', item.hint));
        control.append(caption);
        const clipboardShortcuts: Readonly<Record<string, string>> = { cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', 'paste-plain-text': 'Ctrl+Shift+V' };
        const shortcut = clipboardShortcuts[item.action];
        const key = el('kbd', 'menu-shortcut', shortcut ?? '');
        key.setAttribute('aria-hidden', 'true');
        control.append(key);
        if (item.disabledReason !== undefined || item.run === undefined) {
          control.disabled = true;
          control.setAttribute('aria-disabled', 'true');
          if (item.disabledReason) control.title = item.disabledReason;
          void item.resolve?.().then((resolved) => {
            if (resolved === null || menu !== panel || !control.isConnected) return;
            control.disabled = false;
            control.removeAttribute('aria-disabled');
            control.removeAttribute('title');
            control.addEventListener('click', () => {
              closeMenu();
              resolved();
            });
          });
        } else {
          const run = item.run;
          control.addEventListener('click', () => {
            closeMenu();
            run();
          });
        }
        controls.push(control);
        section.append(control);
      }
      if (group.note) section.append(el('small', 'muted', group.note));
      panel.append(section);
    }
    panel.addEventListener('keydown', (event) => {
      const enabled = controls.filter((control) => !control.disabled);
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      let next: HTMLButtonElement | undefined;
      if (event.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length];
      else if (event.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length];
      else if (event.key === 'Home') next = enabled[0];
      else if (event.key === 'End') next = enabled.at(-1);
      else if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        closeMenu();
        editor.focus();
        return;
      } else return;
      event.preventDefault();
      next?.focus();
    });
    panel.style.left = `${at.x}px`;
    panel.style.top = `${at.y}px`;
    menuLayer.append(panel);
    menu = panel;
    const rect = panel.getBoundingClientRect();
    const placed = menuPlacement(at, rect, { width: window.innerWidth, height: window.innerHeight });
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    controls.find((control) => !control.disabled)?.focus({ preventScroll: true });
  };

  // 就这段提问… (Issue #52, S17a), 就这段发起任务… (Issue #423, S77b) and the house's 可复用工序 on the selection (S77 deferred item a)
  // are connected; 润色这段 waits for a polishing 工序. A Production Document's manuscript offers no selection Task (its surface
  // passes no way to start one; the Owner, 2026-10-09).
  const AI7_TASK_REASON = SELECTION_TASK_DOCUMENT_REASON;
  const VIEW_TASK_REASON = '这条标记的来源任务还不能从这里打开';
  const taskOnSelection = (selectionReason: string | undefined, run: () => void): MenuItem => ({
    action: 'task-on-selection',
    label: SELECTION_TASK_MENU_LABEL,
    ...(options.startTaskOnSelection === undefined ? { disabledReason: AI7_TASK_REASON }
      : selectionReason !== undefined ? { disabledReason: selectionReason } : { run }),
  });
  /** Whether this launch can run 润色这段 (Issue #842), as the service says it: read again for each selection menu. */
  const polishOptions = options.polish;
  const polishRoute = polishOptions === undefined ? null : latestAnswer(() => polishOptions.routes(), () => !destroyed);
  void polishRoute?.refresh();
  const polishItem = (selectionReason: string | undefined): MenuItem => {
    const route = polishRoute?.current()?.editorialPolish ?? null;
    return {
      action: 'preset-polish', label: SELECTION_POLISH_LABEL, hint: SELECTION_POLISH_HINT,
      ...(polishOptions === undefined ? { disabledReason: AI7_TASK_REASON }
        : selectionReason !== undefined ? { disabledReason: selectionReason }
          : route === null ? { disabledReason: SELECTION_POLISH_READING }
            : !route.available ? { disabledReason: route.reason ?? SELECTION_POLISH_READING } : { run: () => void polishSelection() }),
    };
  };
  /** The house's 可复用工序 as they apply to a selection of this Book: read again for each selection menu, drawn once read. */
  const startOnSelection = options.startTaskOnSelection;
  const houseProcedures = startOnSelection === undefined ? null : latestAnswer(() => startOnSelection.procedures(), () => !destroyed);
  void houseProcedures?.refresh();
  const aiTaskGroup = (selectionReason: string | undefined, procedures: ReadonlyArray<SelectionProcedureEntry> | null, spanned = false): MenuGroup => ({
    label: 'AI7 任务',
    note: selectionTaskGroupNote(options.startTaskOnSelection === undefined ? null : procedures),
    items: [
      taskOnSelection(selectionReason, () => void composeTask()),
      {
        action: 'ask-on-selection', label: DIALOGUE_MENU_LABEL, hint: DIALOGUE_MENU_HINT,
        ...(options.askAboutSelection === undefined ? { disabledReason: AI7_TASK_REASON }
          : selectionReason !== undefined ? { disabledReason: selectionReason } : { run: () => void composeQuestion() }),
      },
      // One entry per enabled procedure (as 新建审阅's 按已保存的工序 lists them): it opens the same composer with that procedure chosen.
      ...(options.startTaskOnSelection === undefined ? [] : procedures ?? []).map((entry): MenuItem => ({
        action: entry.value,
        label: entry.label,
        ...(entry.hint === null ? {} : { hint: entry.hint }),
        ...(selectionReason !== undefined ? { disabledReason: selectionReason } : spanned ? { disabledReason: SELECTION_SPAN_PROCEDURE_REASON }
          : entry.disabledReason !== null ? { disabledReason: entry.disabledReason } : { run: () => void composeTask(entry.value) }),
      })),
      polishItem(selectionReason),
      ...scopedAiEditItems(selectionReason),
    ],
  });

  /** 就选中部分让 AI 修改… and the selection's 🔒 (Issue #1412): offered wherever the surface passes the scoped edit. */
  const scopedAiEditItems = (selectionReason: string | undefined): MenuItem[] => {
    const scoped = options.scopedAiEdit;
    if (scoped === undefined) return [];
    const range = editor.selectedRange();
    const words = range.kind === 'range' || range.kind === 'span' ? range : null;
    const reading = words === null ? null : selectionInputOf(words);
    const locked = reading !== null && selectionLocked(editor.currentWindow(), reading);
    return [
      { action: 'scoped-ai-edit', label: SCOPED_AI_EDIT_MENU_LABEL, ...(selectionReason !== undefined ? { disabledReason: selectionReason } : { run: () => void composeScopedOnSelection() }) },
      { action: locked ? 'ai-unlock-selection' : 'ai-lock-selection', label: locked ? AI_UNLOCK_SELECTION_LABEL : AI_LOCK_SELECTION_LABEL,
        ...(selectionReason !== undefined || reading === null ? { disabledReason: selectionReason ?? '先选中文字' }
          : { run: () => void setAiLocks(scoped.host, selectionLockTargets(reading), !locked) }) },
    ];
  };
  /** The scoped edit's composer below a paragraph, closed once its request settles. */
  const openScopedComposer = (blockId: string, selection: DialogueSelectionInput | null, quote?: string): void => {
    const scoped = options.scopedAiEdit;
    if (scoped === undefined) return;
    close();
    const holder = el('section', 'editorial-mark-composer scoped-ai-edit-holder');
    holder.dataset['markComposer'] = 'scoped-ai-edit';
    placeBelowBlock(holder, blockId);
    layer.append(holder);
    floating = holder;
    floatingBlockId = blockId;
    openScopedAiEditComposer(scoped.host, {
      selection, ...(quote === undefined ? {} : { quote }), sectionHeadingBlockId: scoped.sectionOf(blockId), mount: holder,
      onSettled: () => { if (floating === holder) closeFloating(); },
    });
    holder.scrollIntoView?.({ block: 'nearest' });
  };
  const composeScopedOnSelection = async (): Promise<void> => {
    if (refuseWhileBusy()) return;
    const reading = await spanNow();
    if (reading === null) return;
    openScopedComposer(reading.span.blockId, reading.span, reading.span.selectedText);
  };

  /**
   * 润色这段 (Issue #842; the Owner's decision 18 of 2026-10-13): the selected words go to the model at once with their paragraph's
   * context, and what comes back is 修改建议 on those words — open, attributed to the polish, never accepted or applied. The
   * request is read again until it settles; the editor keeps working meanwhile, and a suggestion whose words changed is not placed.
   */
  const polishSelection = async (): Promise<void> => {
    if (refuseWhileBusy() || polishOptions === undefined) return;
    const range = await settledWords();
    if (range === null || destroyed) return;
    closeMenu();
    options.setStatus(SELECTION_POLISH_STATUS.requesting, 'busy');
    let settled: EditorialPolishProjection;
    try {
      settled = await polishOptions.polish({ selection: selectionInputOf(range) });
    } catch (error) {
      options.setStatus(options.errorMessage(error, SELECTION_POLISH_STATUS.failed), 'error');
      return;
    }
    try {
      while (settled.state === 'requesting' && !destroyed) {
        await new Promise((resolve) => window.setTimeout(resolve, POLISH_READ_AGAIN_MS));
        settled = await polishOptions.inspect(settled.taskId);
      }
    } catch (error) {
      if (!destroyed) options.setStatus(options.errorMessage(error, SELECTION_POLISH_STATUS.unreadable), 'error');
      return;
    }
    if (destroyed) return;
    options.setStatus(settled.label, settled.state === 'suggested' || settled.state === 'nothing-to-suggest' ? 'success' : 'error');
    if (settled.markIds.length === 0) return;
    // The new 修改建议 are drawn from the window as the service holds it once the editor's own typing is written.
    await editor.flush();
    const read = await polishOptions.marks().catch(() => null);
    if (read === null || destroyed || read.journalSequence !== editor.currentWindow().journalSequence) return;
    editor.setMarks(read.marks, read.truncated);
    refreshComments();
    options.marksChanged?.();
  };

  /**
   * 就这段发起任务… (Issue #423, S77b; TASK-001 to 003, TASK-046): the composer anchored to the selected words' paragraph, which
   * it carries and nothing else, offering the Tasks that read a range now. 准备任务 prepares the chosen one on that paragraph
   * and its plan opens beside the manuscript, where it is started — or not.
   */
  const composeTask = async (preselect?: string, procedures = false): Promise<void> => {
    if (refuseWhileBusy() || options.startTaskOnSelection === undefined) return;
    const start = options.startTaskOnSelection;
    composersPending += 1;
    try {
      // 就这段发起任务… (Issue #423, slice 7a): the selected words go to the Context-bound Task Composer, and nothing else does.
      if (start.compose !== undefined && preselect === undefined && !procedures) {
        const reading = await spanNow();
        if (reading !== null && !destroyed) start.compose(reading);
        return;
      }
      await composeTaskNow(start, preselect);
    } finally {
      composersPending -= 1;
    }
  };
  /** The words selected now as the exact span a mark names, settled first; `null` once the reason was said. */
  const spanNow = async (): Promise<SelectionSpanReading | null> => {
    const range = await settledWords();
    if (range === null || destroyed) return null;
    const current = editor.currentWindow();
    return {
      span: selectionInputOf(range),
      position: current.blocks.find((block) => block.blockId === range.blockId)?.position ?? null,
      revisionLabel: current.revisionLabel,
      journalSequence: current.journalSequence,
    };
  };
  /** `preselect`: the 工序 the menu's own entry chose — one of the house's 可复用工序 — held in the field when it is still offered. */
  const composeTaskNow = async (start: NonNullable<MountOptions['startTaskOnSelection']>, preselect?: string): Promise<void> => {
    const range = await settledRange();
    if (range === null || destroyed) return;
    options.setStatus(SELECTION_TASK_STATUS.reading, 'busy');
    let offered: SelectionTaskChoices;
    try {
      offered = await start.choices();
    } catch (error) {
      options.setStatus(options.errorMessage(error, SELECTION_TASK_STATUS.unreadable), 'error');
      return;
    }
    if (destroyed) return;
    if (offered.refusal !== null || offered.choices.length === 0) {
      options.setStatus(offered.refusal ?? SELECTION_TASK_STATUS.unreadable, 'error');
      return;
    }
    const current = editor.currentWindow();
    const position = current.blocks.find((block) => block.blockId === range.blockId)?.position ?? null;
    if (position === null) {
      options.setStatus(SELECTION_TASK_STATUS.gone, 'error');
      return;
    }
    options.setStatus(SELECTION_TASK_STATUS.choose);
    // A procedure's Series steps are the editor's to tick (REUSE-049, REUSE-050): one box each, shown while that procedure is
    // chosen, each carrying the step's category (Issue #423 review, P3-3).
    const apartBoxes = offered.choices.flatMap((choice) => choice.kind === 'procedure'
      ? choice.chosenApart.map((step) => ({ value: step.categoryId, label: step.label, hint: sheetChosenApartLine(step.label), group: choice.value }))
      : []);
    openComposer(range.blockId, {
      id: 'task-on-selection',
      title: SELECTION_TASK_TITLE,
      quote: range.text,
      fields: [{
        name: 'procedure',
        label: SELECTION_TASK_FIELD,
        // Issue #1410 item 17: the first offered Task is chosen to begin with, so 开始任务 acts at once.
        value: preselect !== undefined && offered.choices.some((choice) => choice.value === preselect) ? preselect : offered.choices[0]?.value ?? '',
        required: true,
        hint: selectionTaskContextLine({
          bookTitle: start.bookTitle,
          revisionLabel: current.revisionLabel,
          journalSequence: current.journalSequence,
          graphemes: range.toGrapheme - range.fromGrapheme,
          position,
        }),
        options: offered.choices.map((choice) => ({ value: choice.value, label: choice.label })),
      }, ...(apartBoxes.length === 0 ? [] : [{
        name: 'chosenApart' as const,
        label: SELECTION_TASK_CHOSEN_APART_LEGEND,
        value: '',
        required: false,
        checkboxes: apartBoxes,
        groupedBy: 'procedure' as const,
      }])],
      submitLabel: SELECTION_TASK_PREPARE,
      note: SELECTION_TASK_NOTE,
      submit: async (values) => {
        const choice = offered.choices.find((candidate) => candidate.value === values.procedure);
        if (choice === undefined) {
          options.setStatus(SELECTION_TASK_STATUS.pickFirst, 'error');
          return;
        }
        // Words typed in the manuscript while the composer was open are written first, so the Task Input checkpoint pins the text
        // on screen (Issue #423 review, P3-5); the paragraph is named by its block identity, which the service resolves (P3-3).
        await editor.flush();
        const chosenApart = values.chosenApart.split('\n').filter((label) => label.length > 0);
        if (await start.prepare(choice, { blockId: range.blockId }, chosenApart) && !destroyed) closeFloating();
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
    // After a window load keeps this composer, its context line names the revision and journal position the window now stands at.
    floatingRefresh = () => {
      const hint = floating?.querySelector<HTMLElement>('[data-mark-field="procedure"]')?.closest('label')?.querySelector('small');
      const now = editor.currentWindow();
      const at = now.blocks.find((block) => block.blockId === range.blockId)?.position ?? null;
      if (hint === null || hint === undefined || at === null) return;
      hint.textContent = selectionTaskContextLine({
        bookTitle: start.bookTitle,
        revisionLabel: now.revisionLabel,
        journalSequence: now.journalSequence,
        graphemes: range.toGrapheme - range.fromGrapheme,
        position: at,
      });
    };
  };

  /**
   * 就这段提问… (Issue #52, S17a; TASK-046; the Owner, 2026-10-07): the question about the exact selected words, asked at once.
   * The composer says plainly what is sent — only the selected words and the question — and nothing in the manuscript changes.
   */
  const composeQuestion = async (): Promise<void> => {
    if (refuseWhileBusy() || options.askAboutSelection === undefined) return;
    const ask = options.askAboutSelection;
    const range = await settledWords();
    if (range === null) return;
    openComposer(range.blockId, {
      id: 'ask-about-selection',
      title: DIALOGUE_COMPOSER_TITLE,
      quote: range.text,
      fields: [{ name: 'question', label: DIALOGUE_QUESTION_LABEL, value: '', required: true }],
      submitLabel: DIALOGUE_ASK,
      note: DIALOGUE_SENDS_NOTE,
      submit: async (values) => {
        const refusal = dialogueQuestionRefusal([...values.question.trim()].length, MAX_DIALOGUE_QUESTION_CHARACTERS);
        if (refusal !== null) {
          options.setStatus(refusal, 'error');
          return;
        }
        try {
          await editor.flush();
          options.setStatus(DIALOGUE_STATUS.asking, 'busy');
          const dialogue = await ask({ selection: selectionInputOf(range), question: values.question });
          options.setStatus(DIALOGUE_STATUS.asked, 'success');
          closeFloating();
          options.onAsked?.(dialogue);
        } catch (error) {
          options.setStatus(options.errorMessage(error, DIALOGUE_STATUS.askFailed), 'error');
        }
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
  };

  /** Select any current member Series, one bounded page at a time, keeping the exact settled manuscript selection. */
  const chooseKnowledgeSeries = async (): Promise<void> => {
    if (refuseWhileBusy() || options.seriesOf === undefined) return;
    const read = options.seriesOf;
    const range = await settledRange();
    if (range === null || destroyed) return;
    close();
    const chooser = el('section', 'editorial-mark-composer');
    chooser.dataset['markComposer'] = 'choose-knowledge-series';
    chooser.setAttribute('role', 'dialog');
    chooser.setAttribute('aria-label', '选择书系并提议知识');
    chooser.append(el('h4', undefined, '选择书系并提议知识'), el('blockquote', 'editorial-mark-quote', range.text));
    const list = el('div', 'knowledge-series-choices');
    const status = el('p', 'muted');
    status.setAttribute('aria-live', 'polite');
    const row = el('div', 'button-row');
    const next = windowStep(el('button', 'quiet', '向后浏览书系'), 'after', '向后浏览书系');
    const reset = el('button', 'quiet', '回到第一页');
    const retry = el('button', 'quiet', '重试读取书系');
    const cancel = el('button', 'quiet', '取消');
    for (const control of [next, reset, retry, cancel]) control.type = 'button';
    row.append(next, reset, retry, cancel);
    chooser.append(status, list, row);
    layer.append(chooser);
    floating = chooser;
    floatingBlockId = range.blockId;
    placeBelowBlock(chooser, range.blockId);
    let after: SeriesListCursor | null = null;
    let nextAfter: SeriesListCursor | null = null;
    let failedAfter: SeriesListCursor | null = null;
    let failed = false;
    let loading = false;
    const active = (): boolean => !destroyed && floating === chooser && chooser.isConnected;
    const load = async (cursor: SeriesListCursor | null): Promise<void> => {
      if (loading || !active()) return;
      loading = true;
      for (const control of chooser.querySelectorAll<HTMLButtonElement>('button')) if (control !== cancel) control.disabled = true;
      status.textContent = '正在读取书系…';
      try {
        const page = await read(cursor);
        if (!active()) return;
        after = cursor;
        nextAfter = page.membershipsNext;
        failed = false;
        list.replaceChildren(...page.memberships.map((series) => {
          const select = el('button', 'quiet', series.title);
          select.type = 'button';
          select.dataset['seriesId'] = series.seriesId;
          select.addEventListener('click', () => { if (!loading && active()) void composeKnowledge(series, range); });
          return select;
        }));
        status.textContent = `共 ${page.membershipCount} 个书系 · 本页 ${page.memberships.length} 个`;
      } catch (error) {
        if (!active()) return;
        failed = true;
        failedAfter = cursor;
        status.textContent = options.errorMessage(error, '无法读取书系；可以重试。');
      } finally {
        loading = false;
        if (active()) {
          for (const control of chooser.querySelectorAll<HTMLButtonElement>('button')) control.disabled = false;
          next.disabled = nextAfter === null;
          reset.disabled = after === null;
          retry.hidden = !failed;
          (failed ? retry : list.querySelector<HTMLButtonElement>('button') ?? cancel).focus();
        }
      }
    };
    next.addEventListener('click', () => { if (nextAfter !== null) void load(nextAfter); });
    reset.addEventListener('click', () => void load(null));
    retry.addEventListener('click', () => void load(failedAfter));
    cancel.addEventListener('click', () => { closeFloating(); editor.focus(); });
    chooser.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeFloating(); editor.focus(); } });
    chooser.scrollIntoView({ block: 'nearest' });
    await load(null);
  };

  let contextParagraph: string | null = null;
  const showSelectionMenu = (at: { x: number; y: number }, reread = true): void => {
    const range = editor.selectedRange();
    const markable = range.kind === 'range' || range.kind === 'unsettled';
    const why = markable ? undefined : selectionMenuReason(range.kind);
    const selected = range.kind === 'range' ? `已选 ${range.toGrapheme - range.fromGrapheme} 字`
      : range.kind === 'span' ? `已选 ${spanGraphemes(range)} 字 · ${range.span.length} 段` : range.kind === 'none' ? '未选中文字' : '已选中文字';
    const needsSelection = range.kind === 'none' ? '先选中文字' : undefined;
    const shown = inSeries?.current() ?? null;
    const shownProcedures = houseProcedures?.current() ?? null;
    const paragraph = range.kind === 'none' && contextParagraph ? editor.currentWindow().blocks.find((block) => block.blockId === contextParagraph) : undefined;
    const taskGroup = aiTaskGroup(paragraph ? undefined : range.kind === 'range' || range.kind === 'span' ? undefined : why ?? selectionMenuReason(range.kind), shownProcedures, range.kind === 'span');
    if (paragraph) for (const item of taskGroup.items) {
      if (!item.run) continue;
      const run = item.run;
      item.run = () => { if (editor.selectRange(paragraph.blockId, 0, [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(paragraph.text)].length)) run(); };
      if (item.action === 'task-on-selection') item.label = '就本段发起任务…';
      if (item.action === 'ask-on-selection') item.label = '就本段提问…';
    }
    const knowledge = inSeries === null || options.proposeSeriesKnowledge === undefined ? null
      : seriesKnowledgeMenuGroup(shown, why, { compose: (series) => void composeKnowledge(series), choose: () => void chooseKnowledgeSeries() });
    const writes = (run: () => void): Pick<MenuItem, 'run' | 'disabledReason'> => ({ run });
    // 修改此处 (Issue #1411) leads: the selected words, across paragraphs too, revised with a card and applied at once.
    const reviseReason = range.kind === 'range' || range.kind === 'span' ? undefined : range.kind === 'none' ? '先选中文字' : why ?? selectionMenuReason(range.kind);
    showMenu('selection', '稿件右键菜单', [
      ...(range.kind === 'none' ? [] : [{
        label: '修订',
        items: [{ action: 'quick-revise', label: QUICK_REVISE_LABEL, hint: QUICK_REVISE_HINT,
          ...(reviseReason !== undefined ? { disabledReason: reviseReason } : { run: () => void composeQuickRevision() }) }],
      }]),
      {
        label: range.kind === 'none' ? '文字处理' : `文字处理 · ${selected}`,
        items: [
          { action: 'cut', label: '剪切', ...(needsSelection ? { disabledReason: needsSelection } : writes(() => void runClipboard('cut'))) },
          { action: 'copy', label: '复制', ...(needsSelection ? { disabledReason: needsSelection } : { run: () => void runClipboard('copy') }) },
          { action: 'paste', label: '粘贴', ...writes(() => void runClipboard('paste')) },
          { action: 'paste-plain-text', label: '粘贴为纯文本', ...writes(() => void runClipboard('paste-plain-text')) },
        ],
      },
      ...(range.kind === 'none' ? [] : [{
        label: '编辑标记',
        ...(why ? { note: why } : {}),
        items: [
          { action: 'add-change-suggestion', label: '提出修改建议', hint: '替换原文，待接受', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('change-suggestion') }) },
          { action: 'add-annotation', label: '添加批注', hint: '可导出', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('annotation') }) },
          { action: 'add-editor-note', label: '添加备注', hint: '仅自己可见', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('editor-note') }) },
          ...([1, 2, 3] as const).map((color): MenuItem => ({
            action: `add-highlight-${color}`,
            label: `加高亮 · ${HIGHLIGHT_COLOR_LABELS[color]}`,
            swatch: color,
            ...(why ? { disabledReason: why } : {
              run: () => void (async () => {
                if (refuseWhileBusy()) return;
                const settled = await settledRange();
                if (settled === null) return;
                await createFromSelection('personal-highlight', { highlightColor: color, body: '', proposedText: null, rationale: null }, settled, '已加高亮。');
                editor.focus();
              })(),
            }),
          })),
        ],
      }]),
      // Across paragraphs (Issue #1176) the AI7 actions take the exact span; marks and 书系 knowledge stay in one paragraph.
      taskGroup,
      ...(knowledge === null ? [] : [knowledge]),
    ], at);
    if (!reread || (inSeries === null && houseProcedures === null && polishRoute === null)) return;
    const drawn = menu;
    const shownPolish = JSON.stringify(polishRoute?.current()?.editorialPolish ?? null);
    // The Book's Series, the house's procedures and whether 润色这段 can run are read again together; the menu is drawn again once
    // when any of them moved.
    void Promise.all([inSeries?.refresh(), houseProcedures?.refresh(), polishRoute?.refresh()]).then(() => {
      if (drawn === undefined || menu !== drawn) return;
      if (sameSeriesGroup(shown, inSeries?.current() ?? null) && sameProcedureEntries(shownProcedures, houseProcedures?.current() ?? null) &&
        shownPolish === JSON.stringify(polishRoute?.current()?.editorialPolish ?? null)) return;
      // The answer differs from what this menu shows: draw it again from the corner it stands at — it moves only if it no
      // longer fits the window — keeping the item the editor is on, a 书系 entry by its Series (Issue #642 review).
      const active = document.activeElement;
      const on = active instanceof HTMLElement && drawn.contains(active) ? active : null;
      const corner = { x: Number.parseFloat(drawn.style.left), y: Number.parseFloat(drawn.style.top) };
      showSelectionMenu(Number.isFinite(corner.x) && Number.isFinite(corner.y) ? corner : at, false);
      const seriesId = on?.dataset['seriesId'];
      const action = on?.dataset['markAction'];
      const target = seriesId !== undefined
        ? menu?.querySelector<HTMLButtonElement>(`[data-series-id="${CSS.escape(seriesId)}"]:not(:disabled)`)
        : action === undefined ? null : menu?.querySelector<HTMLButtonElement>(`[data-mark-action="${CSS.escape(action)}"]:not(:disabled)`);
      target?.focus({ preventScroll: true });
    });
  };

  const showMarkMenu = (mark: EditorialMarkAnchorProjection, at: { x: number; y: number }): void => {
    const exact = mark.anchorState === 'exact';
    const drifted = '原文已变，无法在这段文字上转换。';
    // A pending insertion stands at a point, with no text for a 批注 to stand on (Issue #411).
    const insertion = mark.insertedText !== null;
    const convert = (target: EditorialMarkKind): MenuItem => ({
      action: `convert-${target}`,
      label: CONVERT_LABELS[target],
      ...(insertion ? { disabledReason: INSERTION_CONVERT_REASON } : exact ? {
        run: () => {
          if (mark.kind === 'personal-highlight') {
            void (async () => {
              const current = editor.currentWindow();
              const card = await api.getEditorialMarkCard({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId: mark.markId });
              openComposer(mark.blockId, convertForm(card, target, () => {
                closeFloating();
                editor.focus();
              }));
            })().catch((error: unknown) => options.setStatus(options.errorMessage(error, '无法打开这条标记。'), 'error'));
          } else if ((mark.kind === 'editor-note' && target === 'annotation') || mark.kind === 'change-suggestion') {
            void change(mark.markId, 'convert', { targetKind: target }, '已转为批注。');
          } else {
            void openCard(mark.markId, (card, cancel) => convertForm(card, target, cancel));
          }
        },
      } : { disabledReason: drifted }),
    });
    const common: MenuGroup = {
      label: '这段文字',
      items: [
        { action: 'copy-marked-text', label: '复制这段', run: () => copyMarkedText(mark) },
        // The marked words are the selection the composer carries (Issue #423, S77b).
        taskOnSelection(undefined, () => {
          close();
          if (!editor.selectRange(mark.blockId, mark.fromGrapheme, mark.toGrapheme)) {
            options.setStatus('请先等待当前写入完成，再就这段发起任务。', 'error');
            return;
          }
          void composeTask();
        }),
      ],
    };
    const title = `${MARK_KIND_LABELS[mark.kind]}${mark.sourceKind === 'ai7' ? ' · AI7' : mark.sourceKind === 'imported-author' ? ' · 导入文件的作者' : ' · 你'}`;
    let items: MenuItem[];
    if (mark.kind === 'personal-highlight') {
      items = [
        ...([1, 2, 3] as const).filter((color) => color !== mark.highlightColor).map((color): MenuItem => ({
          action: `recolor-${color}`,
          label: `换颜色 · ${HIGHLIGHT_COLOR_LABELS[color]}`,
          swatch: color,
          run: () => void change(mark.markId, 'recolor', { highlightColor: color }, '已换颜色。'),
        })),
        { action: 'remove', label: '取消高亮', run: () => void change(mark.markId, 'remove', {}, '已取消高亮。') },
        convert('editor-note'),
        convert('annotation'),
        convert('change-suggestion'),
      ];
    } else if (mark.kind === 'annotation') {
      items = [
        { action: 'open-card', label: '打开批注', run: () => void openCard(mark.markId) },
        mark.status === 'open'
          ? { action: 'resolve', label: '标记为已处理', run: () => void change(mark.markId, 'set-status', { status: 'resolved' }, '已标记为已处理。') }
          : { action: 'reopen', label: '重新打开', run: () => void change(mark.markId, 'set-status', { status: 'open' }, '已重新打开。') },
        convert('change-suggestion'),
        ...(mark.sourceKind === 'ai7' ? [
          { action: 'view-task', label: '查看任务', disabledReason: VIEW_TASK_REASON, ...viewTaskMenuResolver(mark.markId) },
          { action: 'view-basis', label: '看依据', run: () => void openCard(mark.markId) },
        ] : []),
        { action: 'remove', label: '删除', run: () => void change(mark.markId, 'remove', {}, '已删除批注。') },
      ];
    } else if (mark.kind === 'editor-note') {
      items = [
        { action: 'open-card', label: '打开备注', run: () => void openCard(mark.markId) },
        convert('annotation'),
        convert('change-suggestion'),
        { action: 'remove', label: '删除', run: () => void change(mark.markId, 'remove', {}, '已删除备注。') },
      ];
    } else {
      items = mark.inlineRevision ? [
        { action: 'open-card', label: '打开编辑修订', run: () => void openCard(mark.markId) },
        ...(mark.status === 'open' ? [{ action: 'accept-and-apply', label: '应用修改', run: () => void changeInlineRevision(mark.markId, 'apply-inline-revision') }] : []),
        { action: 'reverse-revision', label: mark.status === 'applied' ? REVERSE_REVISION_LABEL : '忽略/还原',
          ...(exact ? { run: () => void changeInlineRevision(mark.markId, 'revert-inline-revision') } : { disabledReason: '这处文字又改过，请先查看当前稿件。' }) },
      ] : [
        { action: 'open-card', label: '打开修改建议', run: () => void openCard(mark.markId) },
        mark.status === 'applied'
          // The menu's undo is the card's one click (Issue #1410 item 7); the service refuses it when the words changed again.
          ? { action: 'reverse-revision', label: REVERSE_REVISION_LABEL, run: () => void writeManuscript(mark.markId,
              (clientEffectId) => api.reverseAppliedChangeSuggestion({ ...binding(), markId: mark.markId, clientEffectId }), REVERSE_REVISION_DONE) }
          : mark.disposition === null && exact
            ? {
                action: 'accept-and-apply',
                label: '接受并应用',
                // The menu's 接受并应用 is the card's own decision, and asks why once as the card's does (Issue #61 review).
                run: () => void writeManuscript(mark.markId, (clientEffectId) => api.applyChangeSuggestion({
                  ...binding(), markId: mark.markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null,
                }), '已应用这条修改建议。', null),
              }
            : { action: 'accept-and-apply', label: '接受并应用', disabledReason: exact ? '这条修改建议已经处理过' : '原文已变，无法应用' },
        ...((mark.conflict === 'unresolved' || mark.conflict === 'deferred') && options.openConflict !== undefined
          ? [{ action: 'resolve-conflict', label: RESOLVE_CONFLICT_LABEL, run: () => options.openConflict!(mark.markId) }]
          : []),
        ...(mark.disposition === null && mark.status !== 'applied' ? [convert('annotation')] : []),
        ...(mark.sourceKind === 'ai7' ? [
          { action: 'view-task', label: '查看任务', disabledReason: VIEW_TASK_REASON, ...viewTaskMenuResolver(mark.markId) },
          { action: 'view-basis', label: '看依据', run: () => void openCard(mark.markId) },
        ] : []),
      ];
    }
    showMenu('mark', title, [{ label: title, items }, common], at);
  };

  /** The mark a pointer event landed on: the innermost one that has something to open. */
  const markAt = (target: EventTarget | null, includeHighlights: boolean): EditorialMarkAnchorProjection | undefined => {
    const marks = editor.currentWindow().marks;
    let node = target instanceof Element ? target.closest<HTMLElement>('[data-mark-id]') : null;
    while (node !== null) {
      const mark = marks.find((candidate) => candidate.markId === node!.dataset['markId']);
      if (mark !== undefined && (includeHighlights || mark.kind !== 'personal-highlight')) return mark;
      node = node.parentElement?.closest<HTMLElement>('[data-mark-id]') ?? null;
    }
    return undefined;
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) { textPointerDown = true; suppressCommentSelection = false; pressedTextMark = markAt(event.target, false); }
    // Some platforms select the word under a context click before the menu opens; what decides the
    // menu is what was selected before that.
    if (event.button === 2) collapsedBeforeContextClick = editor.selectedRange().kind === 'none';
  };
  const onMarkHover = (event: PointerEvent): void => {
    if (!options.comments?.enabled()) return;
    hoverComment(event.type === 'pointerout' ? undefined : markAt(event.target, false)?.markId);
  };
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    contextParagraph = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'] ?? null : null;
    const mark = collapsedBeforeContextClick ? markAt(event.target, true) : undefined;
    collapsedBeforeContextClick = true;
    if (mark) showMarkMenu(mark, { x: event.clientX, y: event.clientY });
    else showSelectionMenu({ x: event.clientX, y: event.clientY });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') suppressCommentSelection = false;
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const selection = window.getSelection();
    contextParagraph = selection?.anchorNode?.parentElement?.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'] ?? null;
    const rects = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0).getClientRects() : undefined;
    const rect = rects && rects.length > 0 ? rects[rects.length - 1]! : options.host.getBoundingClientRect();
    const at = { x: rect.right, y: rect.bottom };
    const mark = editor.selectedRange().kind === 'none' ? markAt(selection?.anchorNode?.parentElement ?? null, true) : undefined;
    if (mark) showMarkMenu(mark, at);
    else showSelectionMenu(at);
  };
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    textPointerDown = false;
    const downMark = pressedTextMark;
    pressedTextMark = undefined;
    // ✎ 已改 (Issue #1411): the badge, or the applied words themselves, bring the revision's card forward in the 批注栏.
    const badge = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-applied-mark-id]') : null;
    if (badge !== null) { event.preventDefault(); void revealRevision(badge.dataset['appliedMarkId']!); return; }
    // 🔒 (Issue #1412): the badge beside a locked block unlocks it.
    const lock = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ai-lock-block]') : null;
    if (lock !== null && options.scopedAiEdit !== undefined) {
      event.preventDefault();
      void setAiLocks(options.scopedAiEdit.host, [{ kind: 'block', blockId: lock.dataset['aiLockBlock']! }], false);
      return;
    }
    if (editor.selectedRange().kind !== 'none') return;
    suppressCommentSelection = false;
    const hit = markAt(event.target, false) ?? downMark;
    const point = editor.captureContinuity().head;
    // Updating linked decorations can replace the down-target before click and retarget it to the paragraph.
    const mark = hit ? hit
      : options.comments?.enabled() ? pickEditorialComment(editor.currentWindow().marks, point.blockId, point.grapheme) : undefined;
    if (options.comments?.enabled()) {
      if (!mark) { activateComment(undefined); return; }
      if (mark.anchorState === 'exact') { closeFloating(); activateComment(mark.markId); suppressCommentSelection = hit !== undefined; return; }
    }
    // A drifted one still opens its floating card, where its conflict is resolved.
    if (mark !== undefined && mark.kind === 'change-suggestion' && mark.status === 'applied' && mark.anchorState === 'exact') { void revealRevision(mark.markId); return; }
    if (mark !== undefined && mark.markId !== openCardId) void openCard(mark.markId);
  };
  const onDocumentMouseDown = (event: MouseEvent): void => {
    if (event.target instanceof Node && (layer.contains(event.target) || menuLayer.contains(event.target))) return;
    closeMenu();
    if (floating !== undefined && !(event.target instanceof Element && event.target.closest('[data-mark-id]'))) closeFloating();
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    // An Escape that ends an input method's composition belongs to the composition (J-14): the composer stays open.
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || (menu === undefined && floating === undefined)) return;
    event.preventDefault();
    close();
    editor.focus();
  };

  // The text column moves when the pane reflows and grows when its text does; what floats below a
  // paragraph follows it, and a menu opened at a pointer position that no longer means anything goes.
  const reflow = new ResizeObserver(() => {
    if (floating !== undefined && floatingBlockId !== undefined) placeBelowBlock(floating, floatingBlockId);
  });
  // A menu points at a place on screen: once the reader scrolls the text from under it — a wheel or a touch moving over
  // the pane — it points at nothing and goes (a drag on the pane's scrollbar is a mousedown, which closes it already).
  // The pane moving on its own leaves it standing (Issue #745): the editor revealing its caret as it takes focus, a card
  // brought into view, a window restored after an Apply, the text reflowing. Their `scroll` events arrive a frame after
  // the movement, often after the menu the reader just opened, and the menu acts on the selection, not on the point.
  const onReaderScroll = (): void => closeMenu();
  const onWindowResize = (): void => closeMenu();
  options.scroll.addEventListener('wheel', onReaderScroll, { passive: true });
  options.scroll.addEventListener('touchmove', onReaderScroll, { passive: true });
  window.addEventListener('resize', onWindowResize);
  reflow.observe(options.scroll);
  reflow.observe(options.host);

  options.host.addEventListener('mousedown', onMouseDown);
  options.host.addEventListener('pointerover', onMarkHover);
  options.host.addEventListener('pointerout', onMarkHover);
  options.host.addEventListener('contextmenu', onContextMenu);
  options.host.addEventListener('keydown', onKeyDown);
  options.host.addEventListener('click', onClick);
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('keydown', onDocumentKeyDown);

  refreshComments();

  return {
    refreshComments,
    close,
    reanchor: () => {
      refreshComments();
      closeMenu();
      if (floating === undefined) return;
      const blockId = floatingBlockId;
      if (floating.dataset['markComposer'] !== undefined && blockId !== undefined && blockElement(blockId) !== null) {
        placeBelowBlock(floating, blockId);
        floatingRefresh?.();
        return;
      }
      const composer = floating.dataset['markComposer'] !== undefined;
      closeFloating();
      if (composer) options.setStatus(COMPOSER_LEFT_WINDOW, 'error');
    },
    holdsFloating: () => menu !== undefined || floating !== undefined || composersPending > 0,
    selectionSpan: async () => {
      if (!['range', 'span'].includes(editor.selectedRange().kind)) return SELECTION_TASK_PICK_RANGE;
      return (await spanNow()) ?? SELECTION_TASK_PICK_RANGE;
    },
    composeProcedures: (range) => {
      if (!editor.selectRange(range.blockId, range.fromGrapheme, range.toGrapheme)) {
        options.setStatus('请先等待当前写入完成，再就这段发起任务。', 'error');
        return;
      }
      void composeTask(undefined, true);
    },
    openMark: async (markId) => {
      const mark = editor.currentWindow().marks.find(item => item.markId === markId);
      if (options.comments?.enabled() && mark?.anchorState === 'exact') { commentAnchor(mark)?.scrollIntoView?.({ block: 'center' }); closeFloating(); activateComment(markId); refreshComments(); }
      else await openCard(markId);
    },
    quickRevise: () => {
      const kind = editor.selectedRange().kind;
      if (kind !== 'range' && kind !== 'span') return false;
      void composeQuickRevision();
      return true;
    },
    recordAndApplyEditorRevision,
    revealRevision,
    composeScopedAiEdit: () => {
      const blockId = editor.captureContinuity().head.blockId;
      if (blockId !== undefined) openScopedComposer(blockId, null);
    },
    ownsScroll: () => composersPending > 0 || floating !== undefined || (closedAt !== undefined && options.scroll.scrollTop === closedAt.top) ||
      (revealScroll !== undefined && options.scroll.scrollTop === revealScroll.top),
    destroy: () => {
      destroyed = true;
      cardCache.clear();
      commentNodes.clear();
      commentsResize.disconnect();
      if (commentsFrame !== undefined) cancelAnimationFrame(commentsFrame);
      document.removeEventListener('selectionchange', commentSelection);
      options.scroll.removeEventListener('scroll', scrollCommentsText);
      document.removeEventListener('pointerup', finishCommentPress);
      document.removeEventListener('pointercancel', finishCommentPress);
      document.removeEventListener('click', releaseCommentPress);
      commentsScroll.removeEventListener('scroll', scrollCommentsPane);
      window.removeEventListener('resize', scheduleCommentsLayout);
      commentsScroll.remove();
      options.host.removeEventListener('pointerover', onMarkHover);
      options.host.removeEventListener('pointerout', onMarkHover);
      filterBar.remove();
      leaders.remove();
      editor.setLinkedMark(null);
      editor.setVisibleMarkIds(null);
      reflow.disconnect();
      options.scroll.removeEventListener('wheel', onReaderScroll);
      options.scroll.removeEventListener('touchmove', onReaderScroll);
      window.removeEventListener('resize', onWindowResize);
      close();
      options.host.removeEventListener('mousedown', onMouseDown);
      options.host.removeEventListener('contextmenu', onContextMenu);
      options.host.removeEventListener('keydown', onKeyDown);
      options.host.removeEventListener('click', onClick);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
      layer.remove();
      menuLayer.remove();
    },
  };
}
