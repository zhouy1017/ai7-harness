import type { ConflictUnit, ConflictUnitResolution } from '../conflict-units.js';
import type { EditorialMarkSourceProjection } from './editorial-marks.js';

/** Proposal Conflicts and their resolution, including 基于当前稿件重新生成建议 (Issue #1536). */

/**
 * 稿件冲突 (Issue #57, plan slice S22; ADR 0085; V2-UX-CONFLICT-001 to 013). A 修改建议 is in a Three-way
 * Proposal Conflict when the words it replaces changed after its base — its anchor drifted, 原文已变 —
 * while it is undecided or accepted and not yet applied (`suggestion`), or when the words its Apply wrote
 * were edited afterwards, so that reversing the Apply meets them (`reversal`, V2-UX-EREC-012). A change
 * elsewhere in its paragraph is not a conflict (ADR 0085 §1). A conflict is `deferred` once 暂不处理 was
 * recorded and stays unresolved; it is `resolved` by its one outcome, 保留当前稿件 or 保存为新提案版本.
 */
export type ProposalConflictKind = 'suggestion' | 'reversal';

export type ProposalConflictState = 'unresolved' | 'deferred' | 'resolved';

export type ProposalConflictOutcome = 'keep-current' | 'new-version';

/** The most unresolved conflicts the navigator of 稿件冲突 lists across one manuscript. */
export const MAX_PROPOSAL_CONFLICT_NAVIGATOR = 200;

/** How many graphemes of the current paragraph stand on each side of the conflicting words. */
export const PROPOSAL_CONFLICT_CONTEXT_GRAPHEMES = 30;

/** The Resolution Drafts one conflict keeps; a draft is appended per save and never rewritten. */
export const MAX_PROPOSAL_CONFLICT_DRAFTS = 5_000;

/** The 暂不处理 records one conflict keeps. */
export const MAX_PROPOSAL_CONFLICT_DEFERRALS = 1_000;

/** The most units one conflict's texts can be cut into, which bounds a draft's request frame. */
export const MAX_PROPOSAL_CONFLICT_UNITS = 8_192;

/** What a Mark Card says of its mark's conflict, and whether 解决冲突… is offered for it. */
export interface EditorialMarkConflictProjection {
  kind: ProposalConflictKind;
  state: ProposalConflictState;
  /** The latest 暂不处理, while the conflict is unresolved. */
  deferredAt: string | null;
  outcome: ProposalConflictOutcome | null;
  /** The 修改建议 保存为新提案版本 created. */
  newMarkId: string | null;
  resolvedAt: string | null;
}

export interface ProposalConflictBindingInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

/** A Resolution Draft as saved: one entry per unit of the comparison, index for index. */
export interface ProposalConflictDraftProjection {
  draftId: string;
  ordinal: number;
  resolutions: ReadonlyArray<ConflictUnitResolution>;
  text: string;
  /** Every changed unit has a resolution; only then can it be saved as a new Proposal version. */
  complete: boolean;
  savedAt: string;
  /**
   * 基于当前稿件重新生成建议 saved this draft (Issue #842): the conflict unit whose words AI7 regenerated, and when. `null` for a
   * draft the editor saved; a later save of the editor's own carries none, and the regenerated draft stays as it was saved.
   */
  regeneration: { unitIndex: number; regeneratedAt: string } | null;
}

/**
 * 稿件冲突 for one 修改建议 (V2-UX-CONFLICT-004): the three texts, persistently distinct — 提案基准 (`base`),
 * 当前权威稿件 (`current`) and 提议内容 (`proposed`) — the bounded context around them, which is the current
 * paragraph's, the units they compare in, the latest Resolution Draft saved on exactly this basis, and
 * the other unresolved conflicts of the manuscript. `basisDigest` binds every command to these texts: a
 * later change of the paragraph makes it stale, and nothing is ever retargeted.
 */
export interface ProposalConflictProjection {
  markId: string;
  manuscriptId: string;
  branchId: string;
  bookId: string;
  conflictKind: ProposalConflictKind;
  deferral: { deferralId: string; deferredAt: string } | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  basisDigest: string;
  base: string;
  current: string;
  proposed: string;
  context: { before: string; after: string };
  units: ReadonlyArray<ConflictUnit>;
  draft: ProposalConflictDraftProjection | null;
  /** A Resolution Draft was saved against an earlier state of the paragraph; it is kept and not loaded. */
  draftOnEarlierBasis: boolean;
  /** 保存为新提案版本 needs words to stand on: where they were deleted, only the other paths are open. */
  newVersion: { available: boolean; blocker: 'target-deleted' | null };
  suggestion: { itemId: string; rationale: string; source: EditorialMarkSourceProjection };
  /** The manuscript's unresolved conflicts in reading order, this one included; at most `MAX_PROPOSAL_CONFLICT_NAVIGATOR`. */
  navigator: {
    entries: ReadonlyArray<{ markId: string; blockId: string; conflictKind: ProposalConflictKind; deferred: boolean }>;
    truncated: boolean;
  };
}

export interface SaveProposalConflictDraftInput extends ProposalConflictBindingInput {
  basisDigest: string;
  units: ReadonlyArray<ConflictUnitResolution>;
}

export interface ProposalConflictDraftSaveProjection {
  markId: string;
  basisDigest: string;
  draft: ProposalConflictDraftProjection;
}

/**
 * 确认保留当前稿件, 暂不处理, or 保存为新提案版本 from the saved draft `draftOrdinal` (V2-UX-CONFLICT-005,
 * CONFLICT-011, CONFLICT-013). None of them writes the manuscript.
 */
export interface ResolveProposalConflictInput extends ProposalConflictBindingInput {
  basisDigest: string;
  outcome: 'keep-current' | 'defer' | 'new-version';
  draftOrdinal: number | null;
}

export interface ProposalConflictResolutionProjection {
  markId: string;
  outcome: ResolveProposalConflictInput['outcome'];
  /** The new 修改建议 a new version created, not accepted and not applied; `null` for the other two. */
  newMarkId: string | null;
  blockId: string;
  recordedAt: string;
}

/** 基于当前稿件重新生成建议 for one `conflict` unit of the comparison the editor sees, on exactly its basis. */
export interface RegenerateProposalConflictUnitInput extends ProposalConflictBindingInput {
  readonly basisDigest: string;
  readonly unitIndex: number;
}

/**
 * What a regeneration came to: `requesting` while its one request is in flight; then `drafted` saved the regenerated words as
 * the unit's resolution in a new Resolution Draft, which the editor resolves through the existing paths; `same-as-current` and
 * `same-as-proposed` saved nothing, the words being the current manuscript's or the old proposal's; `withheld` and `failed`
 * saved nothing. The surface reads the conflict again once it settles.
 */
export interface ProposalConflictRegenerationProjection {
  readonly requestId: string;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly markId: string;
  readonly unitIndex: number;
  readonly outcome: 'requesting' | 'drafted' | 'same-as-current' | 'same-as-proposed' | 'withheld' | 'failed';
  readonly outcomeUnknown: boolean;
  readonly label: string;
}
