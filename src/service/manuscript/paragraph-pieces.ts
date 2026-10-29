import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, type LongParagraphMethod } from '../../shared/protocol.js';

/**
 * A paragraph longer than the block bound (Issue #1205; ADR 0096 §2) enters the Manuscript as several blocks, never as a refused
 * import. A paragraph with soft line breaks is split at every one of them; a paragraph without, and any line still over the bound,
 * is cut at the bound, and the review then lets the editor keep those cuts or split at sentence ends instead. The bound itself is
 * unchanged: every piece is one block within it.
 */
export type PieceJoint = 'soft-break' | 'bound';

/** One piece of an over-bound paragraph: its text and how it joins the piece before it — null for the first piece. */
export interface ParagraphPiece {
  text: string;
  joint: PieceJoint | null;
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const SENTENCE_END = /[。！？!?…]/u;
const CLOSING = /[”’」』）)》"'】]/u;

export function graphemeLength(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

export function withinBlockBound(text: string): boolean {
  return text.length <= MAX_BLOCK_CODE_UNITS && (text.length <= MAX_BLOCK_GRAPHEMES || graphemeLength(text) <= MAX_BLOCK_GRAPHEMES);
}

/** Text cut into consecutive pieces of at most the block bound, never inside a grapheme. */
export function boundCuts(text: string): string[] {
  const pieces: string[] = [];
  let current = '';
  let graphemes = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (graphemes + 1 > MAX_BLOCK_GRAPHEMES || current.length + segment.length > MAX_BLOCK_CODE_UNITS) {
      pieces.push(current);
      current = '';
      graphemes = 0;
    }
    current += segment;
    graphemes += 1;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/** Sentences of a text, each ending after a run of sentence-final marks and the closing quotes that follow them. */
function sentences(text: string): string[] {
  const found: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    if (SENTENCE_END.test(text[index]!)) {
      let end = index + 1;
      while (end < text.length && (SENTENCE_END.test(text[end]!) || CLOSING.test(text[end]!))) end += 1;
      found.push(text.slice(start, end));
      start = end;
      index = end;
    } else index += 1;
  }
  if (start < text.length) found.push(text.slice(start));
  return found;
}

/** Whole sentences packed greedily up to the bound; a sentence longer than the bound is cut at it. */
export function sentencePieces(text: string): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences(text)) {
    if (current.length > 0 && withinBlockBound(current + sentence)) {
      current += sentence;
      continue;
    }
    if (current.length > 0) pieces.push(current);
    current = '';
    if (withinBlockBound(sentence)) current = sentence;
    else {
      const cuts = boundCuts(sentence);
      current = cuts.pop()!;
      pieces.push(...cuts);
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/** The staged pieces of an over-bound paragraph: one per soft line break, and bound cuts of any line still over the bound. */
export function overBoundPieces(text: string): ParagraphPiece[] {
  const pieces: ParagraphPiece[] = [];
  const lines = text.includes('\n') ? text.split('\n').filter((line) => line.length > 0) : [text];
  for (const line of lines) {
    const cuts = withinBlockBound(line) ? [line] : boundCuts(line);
    cuts.forEach((cut, index) => pieces.push({ text: cut, joint: pieces.length === 0 ? null : index === 0 ? 'soft-break' : 'bound' }));
  }
  return pieces;
}

/**
 * The blocks a run of bound-cut pieces becomes under the review's choice: the cuts as they stand, or the run's text split at
 * sentence ends. A run is the pieces one line was cut into, so its text is their concatenation.
 */
export function recutRun(run: ReadonlyArray<string>, method: LongParagraphMethod): string[] {
  return method === 'blocks' ? [...run] : sentencePieces(run.join(''));
}
