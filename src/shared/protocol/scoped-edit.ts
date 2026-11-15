import type { RuntimeExecutionConfig } from '../runtime-execution-config.js';
import type { SelectionSpanBlockPin } from './selection-span.js';

// ---- 局部 AI 修改与 🔒 锁定 (Issue #1412) ------------------------------------------------------------------------------
//
// An editor asks AI7 to change only part of a manuscript — the Book's or any of its derivative documents — and locks
// paragraphs or whole sections so no AI change ever reaches them. The service freezes the base it read (revision, journal
// position, each target's block digest and the lock set's digest), sends the targets apart from the read-only context, keeps
// only the model's words for those targets — anything else it wrote is dropped — and applies each changed target as its own
// applied 修改建议 in the same step as it checks the base again. What was not a target stays exactly as it was.

/** What one lock names: one block, or a section — a heading and the blocks under it up to the next heading of its level or above. */
export type AiEditLockTarget =
  | { readonly kind: 'block'; readonly blockId: string }
  | { readonly kind: 'section'; readonly headingBlockId: string };

/** The most targets one lock change names. */
export const MAX_AI_EDIT_LOCK_TARGETS = 200;

export interface InspectAiEditLocksInput {
  readonly manuscriptId: string;
  readonly branchId: string;
}

/** Lock or unlock targets, against the lock set the editor saw: a lock set changed since is refused (`AI_EDIT_LOCKS_STALE`). */
export interface SetAiEditLocksInput extends InspectAiEditLocksInput {
  readonly targets: ReadonlyArray<AiEditLockTarget>;
  readonly locked: boolean;
  readonly expectedLocksDigest: string;
}

/** A manuscript branch's locks as they stand: the blocks locked one by one, the sections locked whole, and their digest. */
export interface AiEditLocksProjection {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly blockIds: ReadonlyArray<string>;
  readonly sectionHeadingBlockIds: ReadonlyArray<string>;
  /** Digest of exactly this lock set; a request names it, and the service refuses one whose lock set moved since. */
  readonly digest: string;
  /** In the editor's words, e.g. `已锁定 3 段、1 节`. */
  readonly label: string;
}

/** The window's view of the locks: which of its blocks AI may not change, and the digest of the lock set they come from. */
export interface ManuscriptWindowAiLocks {
  readonly aiLockedBlockIds?: ReadonlyArray<string>;
  readonly aiLocksDigest?: string;
}

/** The longest instruction the editor gives one scoped edit, in characters. */
export const MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS = 500;
/** The most graphemes one scoped edit may hand the model to change. */
export const MAX_SCOPED_AI_EDIT_TARGET_GRAPHEMES = 6_000;
/** The most blocks one scoped edit may change. */
export const MAX_SCOPED_AI_EDIT_TARGETS = 60;

/**
 * Which part the edit may change. `selected-only`: exactly the selected words — one block's range or a cross-paragraph span,
 * whose first and last blocks may be partial — minus whatever is locked. `unlocked-only`: every unlocked block of the
 * document, or of one section.
 */
export type ScopedAiEditScope =
  | { readonly mode: 'selected-only'; readonly span: ReadonlyArray<SelectionSpanBlockPin> }
  | { readonly mode: 'unlocked-only'; readonly range: { readonly kind: 'document' } | { readonly kind: 'section'; readonly headingBlockId: string } };

export interface StartScopedAiEditInput {
  readonly clientCommandId?: string;
  readonly executionConfig?: RuntimeExecutionConfig;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly baseRevisionId: string;
  readonly expectedJournalSequence: number;
  readonly expectedLocksDigest: string;
  readonly instruction: string;
  readonly scope: ScopedAiEditScope;
}

export interface InspectScopedAiEditInput {
  readonly requestId: string;
}

/**
 * One scoped edit as it stands. `applied`: the changed targets are applied 修改建议 (`markIds`, one Effect each);
 * `unchanged`: the model changed none of them; `withheld`: what it answered was not usable; `stale`: the text or the locks
 * moved while it answered, so nothing was applied; `failed`: it did not complete.
 */
export interface ScopedAiEditProjection {
  readonly bookId: string;
  readonly requestId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly state: 'requesting' | 'applied' | 'unchanged' | 'withheld' | 'stale' | 'failed';
  readonly label: string;
  readonly changedBlockIds: ReadonlyArray<string>;
  readonly markIds: ReadonlyArray<string>;
  /** Blocks of the manuscript left exactly as they were: every block but the changed ones. */
  readonly keptBlockCount: number;
  /** What the model wrote outside the targets it was given, dropped without being read. */
  readonly droppedCount: number;
  readonly outcomeUnknown: boolean;
}

/** Why a locked block refuses an AI change, in the editor's words. */
export const AI_EDIT_LOCKED_REASON = '这段已锁定：AI 的修改不会应用到锁定的段落；先解锁再应用。';
