import { graphemesOf } from '../../shared/mark-anchor.js';
import { SELECTION_SPAN_SEPARATOR } from '../../shared/selection-span.js';
import type { WorkingSpanBlock } from '../manuscript/selection-span.js';
import type { EditorialPolishSuggestion, EditorialPolishWithheld } from './polish-contract.js';

/**
 * 润色这段 over a cross-paragraph selection (Issue #1176, W22-S5; Commander decision of brief revision 3): the answer is read
 * against the selection's words with one line break between paragraphs, and each suggestion is placed within the span's
 * blocks. A suggestion inside one paragraph is one 修改建议 there, as it always was. One whose words cross a paragraph break,
 * with a replacement holding exactly the same breaks, becomes one 修改建议 per paragraph it changes — together an atomic group,
 * applied as one Effect — and a replacement that would merge or split paragraphs is withheld by name.
 */

/** Why the parts of a cross-paragraph suggestion are taken or left together. */
export const EDITORIAL_POLISH_SPAN_ATOMIC_REASON = '这条润色建议跨越多个段落：各段的改动要一起采用，只采用其中一段会让句子前后不接。';

/** One paragraph's share of a suggestion: the words it replaces there, in the block's own graphemes, and what replaces them. */
export interface PolishPart {
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly original: string;
  readonly replacement: string;
}

export interface PolishPlacement {
  readonly ordinal: number;
  readonly reason: string;
  /** One part: an ordinary 修改建议. Two or more: one atomic group. */
  readonly parts: ReadonlyArray<PolishPart>;
}

/** Place each suggestion read from a span's words in the blocks it lies in, or withhold it with why. */
export function placeSpanSuggestions(suggestions: ReadonlyArray<EditorialPolishSuggestion>, blocks: ReadonlyArray<WorkingSpanBlock>): {
  placed: PolishPlacement[];
  withheld: EditorialPolishWithheld[];
} {
  // Where each block's part starts in the joined words: one grapheme of line break after every part but the last.
  const starts: number[] = [];
  blocks.reduce((at, block) => { starts.push(at); return at + graphemesOf(block.part).length + 1; }, 0);
  const placed: PolishPlacement[] = [];
  const withheld: EditorialPolishWithheld[] = [];
  for (const suggestion of suggestions) {
    const first = starts.findLastIndex((start) => start <= suggestion.fromGrapheme);
    const originals = suggestion.original.split(SELECTION_SPAN_SEPARATOR);
    const replacements = suggestion.replacement.split(SELECTION_SPAN_SEPARATOR);
    if (replacements.length !== originals.length) {
      withheld.push({ ordinal: suggestion.ordinal, reason: '替换后的文字会合并或拆分段落' });
      continue;
    }
    if (originals.length > 1 && originals.some((piece) => piece.length === 0)) {
      withheld.push({ ordinal: suggestion.ordinal, reason: '跨段的建议要在每一段里都摘出文字' });
      continue;
    }
    const parts = originals.map((original, index): PolishPart => {
      const block = blocks[first + index]!;
      const fromGrapheme = block.pin.fromGrapheme + (index === 0 ? suggestion.fromGrapheme - starts[first]! : 0);
      return { blockId: block.pin.blockId, fromGrapheme, toGrapheme: fromGrapheme + graphemesOf(original).length, original, replacement: replacements[index]! };
    }).filter((part) => part.replacement !== part.original);
    if (parts.length === 0) {
      withheld.push({ ordinal: suggestion.ordinal, reason: '替换后的文字与原文相同' });
      continue;
    }
    placed.push({ ordinal: suggestion.ordinal, reason: suggestion.reason, parts });
  }
  return { placed, withheld };
}
