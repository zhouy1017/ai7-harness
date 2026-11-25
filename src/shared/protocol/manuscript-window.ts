import type { EditorialMarkAnchorProjection } from './editorial-marks.js';
import type { ManuscriptBlockProjection } from './manuscript-notes.js';
import type { ManuscriptWindowTarget } from './series.js';

/** The manuscript window, its position rail and entry position, durable undo/redo and the edit journal acknowledgement (Issue #1536). */

export interface ManuscriptWindowProjection {
  bookId: string;
  /**
   * 🔒 锁定 (Issue #1412): the blocks of this window AI7 may not change — locked one by one or inside a locked section — and
   * the digest of the branch's lock set, which a scoped AI edit or a lock change names. Absent from a store without locks.
   */
  aiLockedBlockIds?: ReadonlyArray<string>;
  aiLocksDigest?: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  recoveredStateReview: null | {
    restorationId: string;
    recoveredRevisionId: string;
    label: '当前为恢复的工作状态';
  };
  focusBlockId: string | null;
  focusGrapheme: number | null;
  previousCursor: string | null;
  nextCursor: string | null;
  position: {
    startBlock: number;
    endBlock: number;
    totalBlocks: number;
    startCharacter: number;
    endCharacter: number;
    totalCharacters: number;
    proportion: number;
    structureLabel: string | null;
    label: string;
  };
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
  /**
   * The Editorial Marks that stand in this window's blocks, as the working state holds them at
   * `journalSequence` — so the ranges are consistent with `blocks` by construction. At most
   * `MAX_WINDOW_MARKS`; `marksTruncated` says the window holds more than this answer carries, and then `marksPage` says
   * how many and how to read the rest (Issue #1604). Absent while the window carries every mark it holds.
   */
  marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  marksTruncated: boolean;
  marksPage?: ManuscriptMarksPage;
  /**
   * `production-document` when the window holds a Production Document (Issue #415, S66), however it was reached — 交付物's
   * 打开, 解决冲突 → 返回, recovery, 待我处理 or 最近稿件 — so it is always drawn as the document it is. Absent for the Book's
   * Manuscript.
   */
  deliverable?: 'production-document';
}

/** A window read at a place; `marks` asks for the page of its marks after an ordinal (Issue #1604, see `ManuscriptMarksPage`). */
export interface ManuscriptWindowAtInput {
  manuscriptId: string;
  branchId: string;
  target: ManuscriptWindowTarget;
  marks?: { afterOrdinal: number; digest: string };
}

/**
 * The paging facts of a window's marks (Issue #1604), the shape #1592 gives a paged list: `shown` marks in this answer, `total`
 * in the window, in the window's reading order; `nextOrdinal` (0-based) is where the next page starts, `null` after the last.
 * `digest` names the window's marks — their identities and order, not their state. The next page is `getManuscriptWindowAt`
 * at the window's first block (`window-start`) with `marks: { afterOrdinal: nextOrdinal, digest }`. Despite its name,
 * `afterOrdinal` is the page's first ordinal, inclusive; any ordinal below `total` is accepted (and `0` of an empty window, which
 * answers an empty page). A changed digest is refused with `WINDOW_MARKS_CHANGED`, and the window is read again from its start.
 */
export interface ManuscriptMarksPage {
  shown: number;
  total: number;
  nextOrdinal: number | null;
  digest: string;
}

/** The most chapters and marks the Whole-manuscript Position Rail draws; beyond them it says it is sparse. */
export const MAX_RAIL_CHAPTERS = 400;

export const MAX_RAIL_MARKS = 2_000;

/**
 * What the Whole-manuscript Position Rail draws beside its track (Issue #409; V2-UX-ED-015, ED-020):
 * chapter ticks on one side, and on the other the open 修改建议, 批注 and 备注 with the ranges the
 * analysis left unread. Every place is a proportion of the whole manuscript's characters, so the rail
 * never needs the manuscript's text; nothing here is a durable record.
 */
export interface ManuscriptRailProjection {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  totalCharacters: number;
  chapters: ReadonlyArray<{
    blockId: string;
    title: string;
    level: number;
    proportion: number;
    suggestions: number;
    annotations: number;
    notes: number;
  }>;
  chaptersTruncated: boolean;
  marks: ReadonlyArray<{ kind: 'change-suggestion' | 'annotation' | 'editor-note'; blockId: string; proportion: number }>;
  marksTruncated: boolean;
  /** `null` while the Book has no analysis to have gaps; otherwise the ranges its latest analysis left unread. */
  uncovered: ReadonlyArray<{ fromProportion: number; toProportion: number; reason: string }> | null;
}

/**
 * Where an editor last entered a Book's primary Manuscript, already resolved against the working
 * state the branch holds now. It speaks the window projection's own vocabulary — a block identity
 * and a grapheme offset inside it — so a caller passes `blockId` straight to a `block` window target.
 * `state` says which of the two the resolution was: `exact` when the recorded Revision is still the
 * branch's base Revision and the block it names is still there, `nearest-anchor` when the recorded
 * position was superseded and the nearest surviving block answered for it.
 */
export interface ManuscriptEntryPositionProjection {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  blockId: string;
  grapheme: number;
  /** The Manuscript Revision the stored position was recorded against. */
  recordedRevisionId: string;
  state: 'exact' | 'nearest-anchor';
}

export interface DurableHistoryProjection {
  action: 'undo' | 'redo';
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  /** The last command group the step replayed; `null` for a step of Apply Effects only (Issue #1654). */
  commandGroupId: string | null;
  completionLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  /** The editor step taken back or replayed, where it stands now, and whether it was set aside instead (Issue #1654). */
  stepLabel: string;
  anchorBlockId: string | null;
  paragraph: number | null;
  blocked: boolean;
}

/** The next step Ctrl+Z or redo would take (Issue #1654): what it is, how large, where, and the review batch it was. */
export interface EditorStepSummary {
  stepId: string;
  kind: 'typing' | 'style' | 'split' | 'merge' | 'replace' | 'accept' | 'accept-batch' | 'replace-all' | 'ai-edit' | 'reverse-card' | 'inline-decision' | 'restore';
  label: string;
  changeCount: number;
  paragraph: number | null;
  /** The review batch it was: every Run that found its marks (a later Run that finds the same words names the same marks), newest first. */
  batch: { reviewRunIds: ReadonlyArray<string>; categoryId: string } | null;
}

/** `inspectEditorHistory` (Issue #1654): the steps Ctrl+Z and redo would take next. */
export interface EditorHistoryProjection {
  branchId: string;
  undo: EditorStepSummary | null;
  redo: EditorStepSummary | null;
}

/** Ctrl+Z, redo and the review page's 撤销本批应用 (`expectedStepId`, Issue #1654). */
export interface ManuscriptHistoryInput {
  manuscriptId: string;
  branchId: string;
  expectedWorkingDigest: string;
  expectedStepId?: string;
}

export interface JournalAcknowledgement {
  clientEditId: string;
  branchId: string;
  baseRevisionId: string;
  blockId: string;
  sequence: number;
  resultingBlockDigest: string;
  resultingWorkingDigest: string;
  durableAt: string;
  completionLabel: '已写入修订日志';
  window: ManuscriptWindowProjection;
}
