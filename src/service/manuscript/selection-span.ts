import type { DatabaseSync } from 'node:sqlite';
import { graphemesOf } from '../../shared/mark-anchor.js';
import type { DialogueSelectionInput } from '../../shared/protocol.js';
import type { SelectionSpanBlockPin } from '../../shared/protocol/selection-span.js';
import {
  MAX_SELECTION_SPAN_BLOCKS,
  SELECTION_SPAN_INVALID,
  SELECTION_SPAN_NOTE,
  SELECTION_SPAN_SEPARATOR,
  selectionSpanStale,
} from '../../shared/selection-span.js';
import { StoreError } from '../store-records.js';
import { BLOCK_PATTERN, DIGEST_PATTERN, asNumber, asString, type SqlRow } from './bounded-kernel.js';

/**
 * A cross-paragraph selection against the working state (Issue #1176, W22-S5; F-09): the one owner that reads whether the
 * exact span a selection, a dialogue or a Task Intent Draft pinned still stands. Each block must be where the span names it —
 * contiguous, in order, holding the pinned part — and a block edited, split or merged since is refused by its place in the span,
 * never widened over. A span holding a note block is refused by name.
 */

/** One block of a span as the working state holds it now. */
export interface WorkingSpanBlock {
  readonly pin: SelectionSpanBlockPin;
  readonly position: number;
  /** The block's whole text, which a reading context is cut from. */
  readonly text: string;
  /** The words of the block the span selects. */
  readonly part: string;
  /** The block's digest now. */
  readonly digest: string;
}

/** A range carrying a span, in the vocabulary of whichever record holds it. */
export interface PinnedSpanRange {
  readonly blockId: string;
  readonly blockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly span: ReadonlyArray<SelectionSpanBlockPin>;
  readonly text: string;
}

type SpanReading = { readonly ok: true; readonly blocks: WorkingSpanBlock[] } | { readonly ok: false; readonly code: string; readonly message: string };

export function isSpanPin(value: unknown): value is SelectionSpanBlockPin {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const pin = value as Record<string, unknown>;
  return Object.keys(pin).length === 4 && typeof pin.blockId === 'string' && BLOCK_PATTERN.test(pin.blockId) &&
    typeof pin.blockDigest === 'string' && DIGEST_PATTERN.test(pin.blockDigest) && Number.isSafeInteger(pin.fromGrapheme) &&
    Number.isSafeInteger(pin.toGrapheme) && (pin.fromGrapheme as number) >= 0 && (pin.toGrapheme as number) >= (pin.fromGrapheme as number);
}

/** Whether a span is well formed on the range it rides on: two or more distinct blocks, the first being that range. */
export function isSpanOf(span: unknown, range: Omit<PinnedSpanRange, 'span' | 'text'>): span is ReadonlyArray<SelectionSpanBlockPin> {
  if (!Array.isArray(span) || span.length < 2 || span.length > MAX_SELECTION_SPAN_BLOCKS || !span.every(isSpanPin)) return false;
  const first = span[0]!;
  return new Set(span.map((pin) => pin.blockId)).size === span.length && first.blockId === range.blockId &&
    first.blockDigest === range.blockDigest && first.fromGrapheme === range.fromGrapheme && first.toGrapheme === range.toGrapheme;
}

/** Read a span against the working blocks: by digest for a selection made now, by its words for a pin kept since. */
function readWorkingSpan(db: DatabaseSync, branchId: string, range: PinnedSpanRange, byDigest: boolean): SpanReading {
  const invalid = { ok: false, code: 'SELECTION_SPAN_INVALID', message: SELECTION_SPAN_INVALID } as const;
  const pieces = range.text.split(SELECTION_SPAN_SEPARATOR);
  if (!isSpanOf(range.span, range) || pieces.length !== range.span.length) return invalid;
  const last = range.span.length - 1;
  const blocks: WorkingSpanBlock[] = [];
  for (const [index, pin] of range.span.entries()) {
    const stale = { ok: false, code: 'SELECTION_SPAN_STALE', message: selectionSpanStale(index + 1) } as const;
    const row = db.prepare('SELECT position, kind, text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?')
      .get(branchId, pin.blockId) as SqlRow | undefined;
    if (row === undefined || (byDigest && asString(row.digest) !== pin.blockDigest)) return stale;
    if (asString(row.kind) === 'note') return { ok: false, code: 'SELECTION_SPAN_NOTE', message: SELECTION_SPAN_NOTE };
    const text = asString(row.text);
    const parts = graphemesOf(text);
    const shaped = index === 0 ? pin.fromGrapheme < pin.toGrapheme && pin.toGrapheme === parts.length
      : index === last ? pin.fromGrapheme === 0 && pin.toGrapheme > 0 && pin.toGrapheme <= parts.length
        : pin.fromGrapheme === 0 && pin.toGrapheme === parts.length;
    const part = parts.slice(pin.fromGrapheme, pin.toGrapheme).join('');
    if (!shaped || part !== pieces[index]) return byDigest ? invalid : stale;
    const position = asNumber(row.position);
    if (index > 0 && position !== blocks[index - 1]!.position + 1) return stale;
    blocks.push({ pin, position, text, part, digest: asString(row.digest) });
  }
  return { ok: true, blocks };
}

/** The span's blocks as they stand now, each exactly as it was selected; otherwise refused by name. */
export function verifyWorkingSpan(db: DatabaseSync, branchId: string, range: PinnedSpanRange): WorkingSpanBlock[] {
  const reading = readWorkingSpan(db, branchId, range, true);
  if (!reading.ok) throw new StoreError(reading.code, reading.message);
  return reading.blocks;
}

/**
 * A span a record kept, pinned again where it still holds its words, contiguous and in order — each block with the digest it
 * has now — or `null` once any block no longer does.
 */
export function heldSpanPins(db: DatabaseSync, branchId: string, range: PinnedSpanRange): ReadonlyArray<SelectionSpanBlockPin> | null {
  const reading = readWorkingSpan(db, branchId, range, false);
  if (!reading.ok) return null;
  return reading.blocks.map((block) => ({ ...block.pin, blockDigest: block.digest }));
}

/** A wire selection's span in the vocabulary of the checks above. */
export function selectionSpanRange(selection: DialogueSelectionInput & { readonly span: ReadonlyArray<SelectionSpanBlockPin> }): PinnedSpanRange {
  return { blockId: selection.blockId, blockDigest: selection.baseBlockDigest, fromGrapheme: selection.fromGrapheme,
    toGrapheme: selection.toGrapheme, span: selection.span, text: selection.selectedText };
}

/** The selection narrowed to its first block, which the single-block binding checks read: the revision and journal it names. */
export function firstBlockSelection(selection: DialogueSelectionInput): DialogueSelectionInput {
  const { span: _span, ...single } = selection;
  return { ...single, selectedText: selection.selectedText.split(SELECTION_SPAN_SEPARATOR, 1)[0]! };
}

/** A selection made now, checked whole: its binding through the single-block check of its first block, then every block. */
export interface VerifiedSelection {
  readonly bookId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly text: string;
  readonly blocks: ReadonlyArray<WorkingSpanBlock>;
}

export function verifySelectionSpan(
  db: DatabaseSync,
  verifyFirst: (selection: DialogueSelectionInput) => Omit<VerifiedSelection, 'blocks'>,
  selection: DialogueSelectionInput & { readonly span: ReadonlyArray<SelectionSpanBlockPin> },
): VerifiedSelection {
  if (typeof selection.selectedText !== 'string' || typeof selection.branchId !== 'string') throw new StoreError('SELECTION_SPAN_INVALID', SELECTION_SPAN_INVALID);
  const blocks = verifyWorkingSpan(db, selection.branchId, selectionSpanRange(selection));
  return { ...verifyFirst(firstBlockSelection(selection)), text: selection.selectedText, blocks };
}
