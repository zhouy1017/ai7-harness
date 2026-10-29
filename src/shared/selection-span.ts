import { graphemesOf } from './mark-anchor.js';
import type { SelectionSpanBlockPin } from './protocol/selection-span.js';

/**
 * Cross-paragraph selection (Issue #1176, W22-S5; F-09): one exact span over contiguous blocks, from `(startBlockId,
 * fromGrapheme)` to `(endBlockId, toGrapheme)`, read the same way by the editor that makes it and every owner that checks it.
 * A selection inside one block is no span: it keeps its single range, so nothing made of it changes.
 */

/** What joins the blocks' parts into one selected text. A block's text holds no line break, so the parts read back exactly. */
export const SELECTION_SPAN_SEPARATOR = '\n';
/** The most blocks one span crosses: those of one manuscript window. */
export const MAX_SELECTION_SPAN_BLOCKS = 32;

export const SELECTION_SPAN_INVALID = '所选文字无效。';
export const SELECTION_SPAN_NOTE = '所选文字跨过了注释块；请分开选择。';
/** A block of the span — 1-based from its start — was edited, split or merged since it was pinned. */
export function selectionSpanStale(ordinal: number): string {
  return `所选文字的第 ${ordinal} 段已改动、拆分或合并；请重新选择。`;
}

/** Any range a span rides on: its first block's range, and the span when it crosses blocks. */
export interface SpannedRange {
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly span?: ReadonlyArray<SelectionSpanBlockPin>;
}

/** Every block a range names, in order, each with its pin: the span's blocks, or the one block it lies in. */
export function spanPins(range: SpannedRange, blockDigest: string): ReadonlyArray<SelectionSpanBlockPin> {
  return range.span ?? [{ blockId: range.blockId, blockDigest, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme }];
}

/** How many graphemes of the manuscript a range selects; the line breaks that join a span's parts are not counted. */
export function spanGraphemes(range: SpannedRange): number {
  return (range.span ?? [range]).reduce((total, pin) => total + pin.toGrapheme - pin.fromGrapheme, 0);
}

/** One block between a selection's two ends, as the editor holds it. */
export interface SpanSourceBlock {
  readonly blockId: string;
  readonly digest: string;
  readonly kind: string;
  readonly text: string;
}

export type SpanReading =
  | { readonly kind: 'none' }
  | { readonly kind: 'note' }
  | { readonly kind: 'range'; readonly pin: SelectionSpanBlockPin; readonly text: string }
  | { readonly kind: 'span'; readonly pins: ReadonlyArray<SelectionSpanBlockPin>; readonly text: string };

/**
 * The exact selection over `blocks` — every block from the one the selection starts in to the one it ends in, contiguous and
 * in order — from grapheme `fromGrapheme` of the first to grapheme `toGrapheme` of the last. An end standing at a block's edge
 * names no text of that block, so the selection begins after it or ends before it; what is left inside one block is a range.
 * A selection holding a note block is no span.
 */
export function readSelectionSpan(blocks: ReadonlyArray<SpanSourceBlock>, fromGrapheme: number, toGrapheme: number): SpanReading {
  const parts = blocks.map((block) => graphemesOf(block.text));
  let first = 0;
  let last = blocks.length - 1;
  let from = fromGrapheme;
  let to = toGrapheme;
  while (first < last && from >= parts[first]!.length) { first += 1; from = 0; }
  while (last > first && to <= 0) { last -= 1; to = parts[last]!.length; }
  if (blocks.length === 0 || (first === last && to <= from)) return { kind: 'none' };
  const inside = blocks.slice(first, last + 1);
  if (inside.some((block) => block.kind === 'note')) return { kind: 'note' };
  const pins = inside.map((block, index): SelectionSpanBlockPin => ({
    blockId: block.blockId,
    blockDigest: block.digest,
    fromGrapheme: index === 0 ? from : 0,
    toGrapheme: index === inside.length - 1 ? to : parts[first + index]!.length,
  }));
  const text = pins.map((pin, index) => parts[first + index]!.slice(pin.fromGrapheme, pin.toGrapheme).join('')).join(SELECTION_SPAN_SEPARATOR);
  return pins.length === 1 ? { kind: 'range', pin: pins[0]!, text } : { kind: 'span', pins, text };
}
