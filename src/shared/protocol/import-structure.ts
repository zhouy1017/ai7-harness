/**
 * Candidate structure and long paragraphs in the import fidelity review (protocol 183; Issue #1205, ADR 0096 §2).
 *
 * A file whose reading made no heading is offered the headings deterministic text rules recognise, none of them preselected;
 * the editor confirms some, sets their levels, or confirms none. A paragraph over the block bound was split when it was read:
 * at its soft line breaks, which the review only discloses, and otherwise at the bound, where the review asks one question for
 * the whole file — split those paragraphs at sentence ends, or keep them as several blocks. Every split names its source
 * paragraph: 「第N段 来自原文第K段（共M段）」.
 */
export type ImportHeadingRule = 'numbered' | 'contents' | 'short-line';

export interface ImportHeadingCandidateProjection {
  /** The staged block's position, which is also its position in the imported manuscript. */
  position: number;
  /** The candidate line, at most 40 characters and an ellipsis. */
  excerpt: string;
  rule: ImportHeadingRule;
  /** 1 to 6. */
  suggestedLevel: number;
}

/** How the paragraphs cut at the bound enter the manuscript: split at sentence ends, or as the cuts stand. */
export type LongParagraphMethod = 'sentences' | 'blocks';

export interface ImportSplitParagraphProjection {
  /** 原文第K段: the paragraph's place among the file's body paragraphs with text. */
  sourceOrdinal: number;
  /** The position of the first block the paragraph becomes. */
  firstPosition: number;
  /** How many blocks it becomes: with the review's choice once it is made, as cut at the bound until then. */
  pieceCount: number;
  /** For a paragraph cut at the bound: how many blocks it becomes split at sentence ends, and kept as cut. */
  choice?: { sentences: number; blocks: number };
  excerpt: string;
}

export interface ImportStructureProjection {
  headings: ReadonlyArray<ImportHeadingCandidateProjection>;
  /** True when the rules found more candidates than the review lists. */
  headingsTruncated: boolean;
  /** Paragraphs split at their soft line breaks, which needs no choice. */
  softBreakSplits: ReadonlyArray<ImportSplitParagraphProjection>;
  /** Paragraphs cut at the bound: the review cannot be formed until `longParagraphs` is chosen. */
  longParagraphs: ReadonlyArray<ImportSplitParagraphProjection>;
}

export interface ImportStructureChoice {
  /** The confirmed candidates with their levels, in position order; empty keeps every candidate a paragraph. */
  headings: ReadonlyArray<{ position: number; level: number }>;
  /** Required exactly when the staged structure lists long paragraphs. */
  longParagraphs: LongParagraphMethod | null;
}

/** The wire shape of a structure choice: at most the candidates a review lists, each at a level from 1 to 6. */
export function validStructureChoice(value: unknown): value is ImportStructureChoice {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return keys.length === 2 && keys[0] === 'headings' && keys[1] === 'longParagraphs' &&
    (record.longParagraphs === null || record.longParagraphs === 'sentences' || record.longParagraphs === 'blocks') &&
    Array.isArray(record.headings) && record.headings.length <= 1_000 && record.headings.every((heading: unknown) =>
      heading !== null && typeof heading === 'object' && !Array.isArray(heading) && Object.keys(heading).length === 2 &&
      Number.isSafeInteger((heading as { position?: unknown }).position) && (heading as { position: number }).position > 0 &&
      Number.isSafeInteger((heading as { level?: unknown }).level) && (heading as { level: number }).level >= 1 &&
      (heading as { level: number }).level <= 6);
}
