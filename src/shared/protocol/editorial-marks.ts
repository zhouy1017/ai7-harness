import type { EditorialMarkCategoryKey } from '../editorial-mark-category.js';
import type { FactualCorrectionLineageProjection } from './factual-verification.js';
import type { ManuscriptMarksPage, ManuscriptWindowProjection } from './manuscript-window.js';
import type { EditorialMarkConflictProjection, ProposalConflictKind, ProposalConflictState } from './proposal-conflicts.js';

/** Editorial Marks (修改建议, 批注, 备注, highlights), their Proposal Decisions, AI7 Apply, its receipts and reversal, and the proposal workspace (Issue #1536). */

/** The most marks one window projection carries; the rest stay reachable once the window moves. */
export const MAX_WINDOW_MARKS = 400;

export const MAX_MARK_BODY_CODE_UNITS = 4_000;

export const MAX_MARK_REPLIES = 100;

/**
 * The Editorial Mark family of `docs/ui-ux-v2/CONTEXT.md` (V2-UX-MARK-001): a Change Suggestion is
 * the editor-facing form of a Proposal Change Item, an Annotation is an exportable comment, an Editor
 * Note is private to the editor, and a Personal Highlight carries no product meaning.
 */
export type EditorialMarkKind = 'change-suggestion' | 'annotation' | 'editor-note' | 'personal-highlight';

export type PersonalHighlightColor = 1 | 2 | 3;

/** `applied`: a Change Suggestion whose replacement an AI7 Apply wrote; the mark now stands on the applied text. */
export type EditorialMarkStatus = 'open' | 'resolved' | 'applied';

export type ProposalItemDisposition = 'accepted' | 'rejected' | 'accepted-with-edit' | 'deferred';

/** A Proposal Change Item's kind (V2-UX-PROP-014): `insert` since schema revision 28 (Issue #411). */
export type ProposalChangeType = 'replace' | 'delete' | 'insert';

/**
 * Who a mark comes from (V2-UX-MARK-002): the editor, AI7 with what produced it — a Task, a review
 * category or the analysis — or the author an imported file carried in.
 */
export interface EditorialMarkSourceProjection {
  kind: 'editor' | 'ai7' | 'imported-author';
  origin: 'task' | 'review-category' | 'analysis' | null;
  /** The Task's title, the review category's name, or the imported author's name. */
  label: string | null;
  taskId: string | null;
  /** Registered Book editors, or the frozen producing model's human/technical labels (#1379). */
  editorName?: string | null;
  modelLabel?: string | null;
  modelTechnicalLabel?: string | null;
}

/** One mark as the manuscript surface draws it; the card's content is read on demand. */
export interface EditorialMarkAnchorProjection {
  inlineRevision?: { beforeText: string; afterText: string; sessionId: string };
  markId: string;
  kind: EditorialMarkKind;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** `drifted` when the text the mark was made on no longer stands at its range (原文已变). */
  anchorState: 'exact' | 'drifted';
  status: EditorialMarkStatus;
  highlightColor: PersonalHighlightColor | null;
  sourceKind: EditorialMarkSourceProjection['kind'];
  sourceOrigin: EditorialMarkSourceProjection['origin'];
  sourceLabel: string | null;
  categoryKey: EditorialMarkCategoryKey;
  categoryLabel: string;
  /** The current Proposal Decision of a Change Suggestion, which the surface shows without a card. */
  disposition: ProposalItemDisposition | null;
  /**
   * The words an applied 修改建议 deleted, where the mark is the point they left (pinned on no text);
   * `null` for every other mark. The surface names them on the point it draws there.
   */
  deletedText: string | null;
  /**
   * The words a 修改建议 that inserts (Issue #411) would write at the point it stands on, while it is not
   * applied; `null` for every other mark. The surface names them on the point it draws there.
   */
  insertedText: string | null;
  /** Where a 修改建议's Three-way Proposal Conflict stands (Issue #57); `null` for a mark that has none. */
  conflict: ProposalConflictState | null;
}

/** One basis a mark or a suggestion rests on: a labelled place in the manuscript, quoted exactly. */
export interface EditorialMarkBasisProjection {
  label: string;
  blockId: string | null;
  fromGrapheme: number | null;
  toGrapheme: number | null;
  quote: string | null;
}

export interface ProposalItemDecisionProjection {
  decisionId: string;
  disposition: ProposalItemDisposition;
  /** The text the editor accepted instead of AI7's or their own first wording. */
  editedText: string | null;
  /** The editor's Non-blocking Decision Reason as it now stands, and how it was given (V2-UX-PDEC-010). */
  reason: string | null;
  reasonSource: 'reason-field' | 'suggested' | 'free-text' | null;
  /**
   * Whether the editor gave a reason, said `不说明`, or neither (Issue #61, S26a; FDBK-006, FDBK-007). A dismissal records
   * only that no reason was given: never agreement, satisfaction or a judgment of any kind.
   */
  reasonState: 'none' | 'given' | 'dismissed';
  /** How many `不说明` and `改原因` entries follow the decision: the count the next one names. */
  feedbackEntries: number;
  /** When the editor last changed the reason after first giving it; `null` when it is the first. */
  reasonRevisedAt: string | null;
  recordedAt: string;
}

/**
 * Everything a Mark Card shows (V2-UX-MARK-003, MARK-004). A Change Suggestion carries its Proposal
 * Change Item in the content-first hierarchy of V2-UX-PROP-022: proposed then current wording,
 * rationale, author, collapsed evidence and the editor's decision, a record apart from the item and
 * from any change to the manuscript.
 */
export interface EditorialMarkCardProjection {
  inlineRevision?: boolean;
  markId: string;
  categoryKey: EditorialMarkCategoryKey;
  categoryLabel: string;
  kind: EditorialMarkKind;
  status: EditorialMarkStatus;
  anchorState: 'exact' | 'drifted' | 'detached';
  highlightColor: PersonalHighlightColor | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /**
   * The exact text the mark stands on: what it was made on, or what an Apply wrote there. Empty where
   * an applied 修改建议 deleted its words: the mark is then the point between two graphemes where they were.
   */
  pinnedText: string;
  source: EditorialMarkSourceProjection;
  body: string;
  replies: ReadonlyArray<{ replyId: string; body: string; createdAt: string }>;
  basis: ReadonlyArray<EditorialMarkBasisProjection>;
  suggestion: null | {
    itemId: string;
    /**
     * What the item asks: replace its current text, delete it, or — for an insertion a file's author
     * proposed (Issue #411) — write its proposal at a point, where its current text is empty.
     */
    changeType: ProposalChangeType;
    currentText: string;
    proposedText: string;
    rationale: string;
    atomicGroupId: string | null;
    decision: ProposalItemDecisionProjection | null;
    /** The committed Apply that wrote this item, as its Effect Receipt states it; `null` until one has. */
    application: ManuscriptApplyProjection | null;
  };
  convertedFrom: null | { markId: string; kind: EditorialMarkKind; sourceKind: EditorialMarkSourceProjection['kind'] };
  /**
   * ADR 0085 §2: the paragraph of this 修改建议 changed elsewhere after its base while its own words stayed
   * exact — a Safe Non-interacting Merge. A label only; it records and decides nothing.
   */
  changedElsewhere: boolean;
  /** The mark's Three-way Proposal Conflict (Issue #57), or `null` when it has none. */
  conflict: EditorialMarkConflictProjection | null;
  /** The conflict this 修改建议 was saved from as a new Proposal version, or `null`. */
  resolvedFrom: null | { markId: string; conflictKind: ProposalConflictKind };
  /** What an export does with this mark unless the editor says otherwise (V2-UX-MARK-006, MARK-007). */
  exportDisposition: 'exported-by-default' | 'only-when-included' | 'never-exported';
  createdAt: string;
  updatedAt: string;
  /** The pin itself, for the Technical Identity Layer. */
  pin: { revisionId: string; revisionLabel: string; journalSequence: number; blockDigest: string };
  /** A Correction Proposal's factual lineage (Issue #901), shown in 依据与核查; absent on every other mark. */
  factualCorrection?: FactualCorrectionLineageProjection;
}

/** Binds a mark command to the manuscript state the editor saw, and asks for the window's marks back. */
export interface EditorialMarkBindingInput {
  manuscriptId: string;
  branchId: string;
  windowStartBlockId: string;
}

export interface CreateEditorialMarkInput extends EditorialMarkBindingInput {
  clientMarkId: string;
  baseRevisionId: string;
  expectedJournalSequence: number;
  blockId: string;
  baseBlockDigest: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** The text the editor selected; the service refuses a mark whose range does not hold it. */
  selectedText: string;
  kind: EditorialMarkKind;
  highlightColor: PersonalHighlightColor | null;
  body: string;
  proposedText: string | null;
  rationale: string | null;
}

/**
 * One change to a mark. Every field is always present so the frame is exact; a field an action does
 * not use is `null`. `convert` makes a new mark on the same pinned text and retires this one, so a
 * mark's kind never changes under a record that points at it.
 */
export interface UpdateEditorialMarkInput extends EditorialMarkBindingInput {
  markId: string;
  action: 'edit-body' | 'recolor' | 'set-status' | 'reply' | 'remove' | 'convert' | 'apply-inline-revision' | 'revert-inline-revision';
  body: string | null;
  highlightColor: PersonalHighlightColor | null;
  status: EditorialMarkStatus | null;
  targetKind: EditorialMarkKind | null;
  proposedText: string | null;
  rationale: string | null;
}

/**
 * The editor's decision on one Change Suggestion (V2-UX-MARK-004, MARK-005). It records a Proposal
 * Decision and changes no manuscript text: `withdrawn` supersedes the current decision and returns
 * the item to undecided (V2-UX-PDEC-008).
 */
export interface RecordChangeSuggestionDecisionInput extends EditorialMarkBindingInput {
  markId: string;
  clientDecisionId: string;
  disposition: ProposalItemDisposition | 'withdrawn';
  editedText: string | null;
  reason: string | null;
}

/**
 * The optional reason chips that follow a decision recorded without one (V2-UX-PDEC-009, PDEC-010):
 * a suggested reason the editor picked, or their own words. One reason per decision; a decision that
 * already carries one — from the 为什么这样改 field or an earlier chip — is never asked again.
 */
export interface RecordProposalDecisionReasonInput extends EditorialMarkBindingInput {
  markId: string;
  decisionId: string;
  reason: string;
  reasonSource: 'suggested' | 'free-text';
}

/**
 * After a decision (Issue #61, S26a; FDBK-006, FDBK-007, interaction-spec's feedback rules): `不说明`, which records only that
 * no reason was given and ends the prompt, or `改原因`, a successor to the reason that keeps the one it replaced. Either names
 * how many entries the editor saw after the decision.
 */
export interface RecordProposalDecisionFeedbackInput extends EditorialMarkBindingInput {
  markId: string;
  decisionId: string;
  expectedFeedback: number;
  action: 'dismiss' | 'revise';
  reason: string | null;
  reasonSource: 'suggested' | 'free-text' | null;
}

export interface EditorialMarkCommandProjection {
  window?: ManuscriptWindowProjection;
  markId: string;
  marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  marksTruncated: boolean;
  /** Present only when the window holds more than `MAX_WINDOW_MARKS` marks: this answer carries their first page. */
  marksPage?: ManuscriptMarksPage;
  card: EditorialMarkCardProjection | null;
}

/**
 * 上一条 / 下一条待处理 under a filter (Issue #1604, review #1541 一·3): the Book's next (or previous) pending mark after `from`
 * — an open 修改建议, 批注 or 备注 standing in the text, the set and the reading order (paragraph, grapheme, mark identity) the
 * position rail lists — whose category is one of `categories` and whose model is one of `models`; an empty list does not filter.
 * Both are judged by the functions the 批注栏's filter uses; a mark that is not AI7's never passes a model filter.
 * `from` is a place in reading order: `markId` is the selected card (its `fromGrapheme` as `grapheme`), `null` for the caret, and
 * `grapheme: -1` is the start of `blockId`. With the caret on a mark's first grapheme (`markId: null`), 下一条 includes that mark
 * and 上一条 skips it. A `from.blockId` the working state no longer holds is refused with `MARK_BINDING_CHANGED`. `null` in the
 * answer means none further in that direction: nothing wraps.
 */
export interface FindPendingMarkInput {
  manuscriptId: string;
  branchId: string;
  from: { blockId: string; grapheme: number; markId: string | null };
  direction: 'next' | 'previous';
  categories: ReadonlyArray<EditorialMarkCategoryKey>;
  models: ReadonlyArray<string>;
}

/** Where the mark `findPendingMark` found stands; `null` in its answer when none passes in that direction. */
export interface PendingMarkPlace {
  markId: string;
  blockId: string;
  fromGrapheme: number;
}

/** One exact state of a manuscript: the Revision it rests on, the journal position, and the working digest. */
export interface ManuscriptStateProjection {
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
}

/**
 * One committed AI7 Apply as its Effect Receipt states it (V2-UX-EREC-002). Identities, digests, times
 * and the two manuscript states only: a receipt holds no manuscript text. The Effect Approval and the
 * dispatch are records of their own, named here by identity; the Proposal Decision is the item's.
 */
export interface ManuscriptApplyProjection {
  effectId: string;
  kind: 'apply' | 'reverse-apply';
  interaction: 'accept-and-apply' | 'accept-edited-and-apply' | 'apply-recorded-decision' | 'confirm-batch-apply' | 'confirm-reverse-apply' | 'undo-step' | 'redo-step';
  approvalId: string;
  dispatchId: string;
  receiptId: string;
  changeCount: number;
  payloadDigest: string;
  receiptDigest: string;
  before: ManuscriptStateProjection;
  after: ManuscriptStateProjection;
  committedAt: string;
  reversesEffectId: string | null;
  reversedByEffectId: string | null;
}

/**
 * 接受并应用 for one inline 修改建议 (V2-UX-PDEC-012, EAPP-003 to 006): one interaction records the
 * Proposal Decision, records the Effect Approval and dispatches the Apply. `clientEffectId` is the
 * Effect's idempotency key: the same key never writes twice, and asking again with it answers with
 * the receipt it already has.
 */
export interface ApplyChangeSuggestionInput extends EditorialMarkBindingInput {
  markId: string;
  clientEffectId: string;
  interaction: 'accept-and-apply' | 'accept-edited-and-apply' | 'apply-recorded-decision';
  editedText: string | null;
  reason: string | null;
}

/** 确认应用 on the batch confirmation strip: one Effect over the exact suggestions the strip named, all or none. */
export interface ApplyChangeSuggestionBatchInput extends EditorialMarkBindingInput {
  markIds: ReadonlyArray<string>;
  clientEffectId: string;
}

/** 确认撤销本次应用: a Reverse Apply is a new Effect with its own approval and receipt (UI ADR 0003). */
export interface ReverseAppliedChangeSuggestionInput extends EditorialMarkBindingInput {
  markId: string;
  clientEffectId: string;
}

export interface ManuscriptApplyCommandProjection extends EditorialMarkCommandProjection {
  application: ManuscriptApplyProjection;
  /** The window the command was issued from, as the working state holds it now. */
  window: ManuscriptWindowProjection;
}

/**
 * Apply Outcome Recovery (V2-UX-EREC-004): what the store holds for one Effect identity. The text and
 * its receipt are written in one transaction, so there is no third answer: `committed` with the
 * receipt, or `not-committed` and the manuscript unchanged by that Effect.
 */
export interface ManuscriptApplyOutcomeProjection {
  state: 'committed' | 'not-committed';
  application: ManuscriptApplyProjection | null;
}

/** Issue #902: settled legacy outcomes retain their exact wire shape. */
export interface ApplyReceiptProjection {
  state: 'applied' | 'not-applied' | 'confirming' | 'unresolved';
  application: ManuscriptApplyProjection | null;
  clientEffectId: string;
  manuscriptId: string;
  branchId: string;
  bookId: string;
  actor: 'editor';
  approvedAt: string | null;
  replayPolicy: 'idempotency-keyed';
  safeRetry: boolean;
  reason: string;
  decisionIds: ReadonlyArray<string>;
}

/** Rev 2 compatibility: transient recovery states can never masquerade as settled evidence. */
export function applyReceiptState(outcome: ManuscriptApplyOutcomeProjection): 'applied' | 'not-applied' {
  return outcome.state === 'committed' ? 'applied' : 'not-applied';
}

export function legacyApplyOutcome(receipt: Pick<ApplyReceiptProjection, 'state' | 'application'>): ManuscriptApplyOutcomeProjection | null {
  if (receipt.state === 'confirming' || receipt.state === 'unresolved') return null;
  return { state: receipt.state === 'applied' ? 'committed' : 'not-committed', application: receipt.application };
}

export type ProposalDraftDisposition = 'accepted' | 'rejected' | 'deferred';

export interface ProposalWorkspaceInput {
  /** Bounded metadata page; scope digests always bind the full result. */
  offset?: number;
  manuscriptId: string;
  branchId: string;
  /** Exact Review Run or producing Task; null is the editor's branch-local proposals. */
  resultId: string | null;
  returnPosition?: ProposalReviewReturnPosition | null;
}

export interface ProposalReviewReturnPosition {
  blockId: string | null;
  activeMarkId: string | null;
  comparison: 'inline' | 'side-by-side';
  review: 'all' | 'unreviewed' | 'reviewed' | 'stale' | 'conflicting';
  chapterBlockId: string | null;
  changeType: ProposalChangeType | null;
  expanded: boolean;
}

export interface ProposalNavigatorItem {
  markId: string;
  itemId: string;
  blockId: string;
  position: number;
  fromGrapheme: number;
  toGrapheme: number;
  chapterBlockId: string | null;
  chapter: string;
  changeType: ProposalChangeType;
  baseRevisionId: string;
  stale: boolean;
  /** `drifted` is a classified Three-way Proposal Conflict (原文已变, ADR 0085); `detached` is not yet classified. */
  anchorState: 'exact' | 'drifted' | 'detached';
  conflict: boolean;
  loaded: boolean;
  otherVersion: boolean;
  atomicGroupId: string | null;
  atomicReason: string | null;
  draft: ProposalDraftDisposition | null;
  draftOrdinal: number;
  decisionId: string | null;
  disposition: ProposalItemDisposition | null;
  appliedRevisionId: string | null;
}

export interface ProposalDecisionProjection {
  decisionId: string;
  supersedes: string | null;
  baseRevisionIds: ReadonlyArray<string>;
  currentRevisionId: string;
  journalSequence: number;
  actor: 'editor';
  recordedAt: string;
  items: ReadonlyArray<{ markId: string; itemId: string; disposition: ProposalDraftDisposition; decisionId: string }>;
  unresolved: ReadonlyArray<string>;
}

export interface ProposalWorkspaceProjection {
  totalItems: number;
  nextOffset: number | null;
  bookId: string;
  manuscriptId: string;
  branchId: string;
  resultId: string | null;
  revisionId: string;
  journalSequence: number;
  items: ReadonlyArray<ProposalNavigatorItem>;
  offerWorkspace: boolean;
  truncated: boolean;
  scopeDigest: string;
  decision: ProposalDecisionProjection | null;
  returnPosition: ProposalReviewReturnPosition | null;
}

export interface SaveProposalDecisionDraftInput extends ProposalWorkspaceInput {
  markIds: ReadonlyArray<string>;
  disposition: ProposalDraftDisposition | null;
  atomicGroupId: string | null;
  expectedScopeDigest: string;
}

export interface BatchProposalDecisionDraftInput extends ProposalWorkspaceInput {
  scope: 'selection' | 'chapter' | 'change-type' | 'filter';
  markIds: ReadonlyArray<string>;
  chapterBlockId: string | null;
  changeType: ProposalChangeType | null;
  review: ProposalReviewReturnPosition['review'];
  disposition: ProposalDraftDisposition;
  /** null previews the exact frozen scope and every exclusion, without recording anything. */
  confirmDigest: string | null;
}

export interface ProposalDraftBatchProjection {
  nextOffset: number | null;
  scopeDigest: string;
  included: ReadonlyArray<string>;
  excluded: ReadonlyArray<{ markId: string; reason: 'conflict' | 'unclassified-stale' | 'unloaded' | 'other-version' | 'atomic-group' | 'applied' | 'guessed-anchor' }>;
  saved: boolean;
  workspace: ProposalWorkspaceProjection;
}

export interface RecordProposalDecisionInput extends ProposalWorkspaceInput {
  expectedScopeDigest: string;
  clientDecisionId: string;
}

export interface InspectApplyReceiptInput {
  manuscriptId: string;
  branchId: string;
  clientEffectId: string;
  /**
   * `settled` reads; `confirming` and `unresolved` are what a surface that lost its acknowledgement, or its recovery
   * read too, reports; `recheck` is the editor's explicit re-check of a 结果待确认 against the authoritative records.
   * None of them dispatches.
   */
  recovery: 'settled' | 'confirming' | 'unresolved' | 'recheck';
}

export interface PrepareReverseApplyInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

export interface ReverseApplyPreparationProjection {
  ranges: ReadonlyArray<{ markId: string; position: number; fromGrapheme: number; toGrapheme: number }>;
  originalEffectId: string;
  bookId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  markId: string;
  blockId: string;
  ready: boolean;
  reason: string;
}
