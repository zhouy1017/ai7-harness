// ---- Cross-paragraph selection (Issue #1176, W22-S5; F-09) ----------------------------------------------------------

/** One paragraph of a cross-paragraph selection: the graphemes selected in it, pinned to the block's digest. */
export interface SelectionSpanBlockPin {
  readonly blockId: string;
  readonly blockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
}

/**
 * The exact span of a selection from `(startBlockId, fromGrapheme)` to `(endBlockId, toGrapheme)` over contiguous blocks: the
 * first block from `fromGrapheme` to its end, every interior block whole, the last from 0 to `toGrapheme`. It is present only
 * when the selection crosses a paragraph boundary; the range it rides on then names the span's first block, and its selected
 * text is the blocks' parts joined by one line break. A single-block selection carries no `span`, so its wire and every digest
 * made of it stay as they were.
 */
export interface SelectionSpanField {
  readonly span?: ReadonlyArray<SelectionSpanBlockPin>;
}
