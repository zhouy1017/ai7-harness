import type { ImportHeadingCandidateProjection } from '../../shared/protocol.js';
import { graphemeLength } from './paragraph-pieces.js';

/**
 * Candidate structure of a manuscript whose file carries no heading styles (Issue #1205; ADR 0096 §2), read from the text alone
 * by deterministic rules — no model is asked. The review lists the candidates unchecked; only what the editor confirms becomes
 * a heading. Rules, in the order a block is tested against them:
 *
 * - **numbered**: a line of at most 40 characters with no sentence-final mark that opens with 第X章/回/卷/部/篇, 第X节, a Chinese
 *   numeral and 、, or 1. / 1、 / (1). Each family is one level; the levels follow the order the families first appear, 1 to n.
 * - **contents**: a line 目录 or 目次 followed by at least three short entries opens a table of contents; a later line that reads
 *   as one of its entries, leaders and page numbers aside, is a candidate. The contents lines themselves stay paragraphs.
 * - **short-line**: a line of at most 30 characters with no sentence or clause punctuation, standing between two paragraphs of
 *   at least 80 characters. It is level 1 when the file has no numbered candidate, otherwise one below the deepest numbered level.
 */
export interface CandidateSourceBlock {
  position: number;
  kind: 'title' | 'heading' | 'paragraph' | 'note';
  text: string;
  graphemeLength: number;
}

export const MAX_HEADING_CANDIDATES = 1_000;
const EXCERPT_GRAPHEMES = 40;
const NUMERALS = '一二三四五六七八九十百千万零〇两\\d０-９';
const FAMILIES: ReadonlyArray<RegExp> = [
  new RegExp(`^第[${NUMERALS}]+[章回卷部篇]`, 'u'),
  new RegExp(`^第[${NUMERALS}]+节`, 'u'),
  /^[一二三四五六七八九十百千]+[、．]/u,
  /^(?:[0-9０-９]{1,3}[.．、](?![0-9０-９])|[（(][0-9０-９]{1,3}[)）])/u,
];
const SENTENCE_MARKS = /[。！？；!?;]/u;
const CLAUSE_MARKS = /[。！？；，、：!?;,:…]/u;
const CONTENTS_TITLES = new Set(['目录', '目次']);
const LONG_NEIGHBOUR = 80;

/** A contents entry or a body line as the two are compared: no spaces, leaders or trailing page number. */
function contentsKey(text: string): string {
  return text.replace(/[\s　]+/gu, '').replace(/[.．·…—_-]{2,}[0-9０-９ivxlcIVXLC]*$/u, '').replace(/[0-9０-９]+$/u, '');
}

function excerpt(text: string): string {
  const line = text.split('\n')[0]!;
  return graphemeLength(line) <= EXCERPT_GRAPHEMES ? line : `${Array.from(new Intl.Segmenter('zh-CN').segment(line), (s) => s.segment).slice(0, EXCERPT_GRAPHEMES).join('')}…`;
}

function numberedFamily(block: CandidateSourceBlock): number | null {
  if (block.graphemeLength > 40 || block.text.includes('\n') || SENTENCE_MARKS.test(block.text)) return null;
  const family = FAMILIES.findIndex((pattern) => pattern.test(block.text));
  return family < 0 ? null : family;
}

/** The positions a table of contents occupies and the entry keys it lists. */
function contents(blocks: ReadonlyArray<CandidateSourceBlock>): { positions: Set<number>; keys: Set<string> } {
  const positions = new Set<number>();
  const keys = new Set<string>();
  blocks.forEach((block, index) => {
    if (!CONTENTS_TITLES.has(block.text.replace(/[\s　]+/gu, ''))) return;
    const entries: CandidateSourceBlock[] = [];
    for (let next = index + 1; next < blocks.length && blocks[next]!.graphemeLength <= 60 && !blocks[next]!.text.includes('\n'); next += 1) {
      entries.push(blocks[next]!);
    }
    if (entries.length < 3) return;
    positions.add(block.position);
    for (const entry of entries) {
      positions.add(entry.position);
      const key = contentsKey(entry.text);
      if (key.length > 0) keys.add(key);
    }
  });
  return { positions, keys };
}

/** Whether the staged body offers candidates at all: only a file whose reading made no heading. */
export function offersHeadingCandidates(blocks: ReadonlyArray<CandidateSourceBlock>): boolean {
  return !blocks.some((block) => block.kind === 'heading');
}

export function headingCandidates(blocks: ReadonlyArray<CandidateSourceBlock>): ImportHeadingCandidateProjection[] {
  const body = blocks.filter((block) => block.kind === 'paragraph');
  if (!offersHeadingCandidates(blocks)) return [];
  const order: number[] = [];
  const families = body.map((block) => {
    const family = numberedFamily(block);
    if (family !== null && !order.includes(family)) order.push(family);
    return family;
  });
  const toc = contents(body);
  const shortLevel = Math.min(order.length + 1, 6);
  const candidates: ImportHeadingCandidateProjection[] = [];
  body.forEach((block, index) => {
    if (toc.positions.has(block.position)) return;
    const family = families[index]!;
    let candidate: Pick<ImportHeadingCandidateProjection, 'rule' | 'suggestedLevel'> | null = null;
    if (family !== null) candidate = { rule: 'numbered', suggestedLevel: Math.min(order.indexOf(family) + 1, 6) };
    else if (toc.keys.has(contentsKey(block.text)) && block.graphemeLength <= 60) candidate = { rule: 'contents', suggestedLevel: 1 };
    else if (block.graphemeLength <= 30 && !block.text.includes('\n') && !CLAUSE_MARKS.test(block.text) &&
      (body[index - 1]?.graphemeLength ?? 0) >= LONG_NEIGHBOUR && (body[index + 1]?.graphemeLength ?? 0) >= LONG_NEIGHBOUR &&
      body[index - 1]!.position === block.position - 1 && body[index + 1]!.position === block.position + 1) {
      candidate = { rule: 'short-line', suggestedLevel: order.length === 0 ? 1 : shortLevel };
    }
    if (candidate !== null) candidates.push({ position: block.position, excerpt: excerpt(block.text), ...candidate });
  });
  return candidates;
}
