import { createHash } from 'node:crypto';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';

/**
 * The pure half of the editorial case runner (Issue #812): where a case's concerns stand in the manuscript, which concern or
 * check a finding meets, what a simulated editor does with the mark, and which structural concerns a result meets. Nothing
 * here reads a store or prints text; the runner hands it the texts it read and keeps only what it returns.
 */

export interface TextAnchor {
  readonly id: string;
  /** Block `n` of the imported Book, 1-based. */
  readonly paragraph: number;
  readonly from: number;
  readonly to: number;
  readonly words: string;
  /** Acceptable corrected forms of `words`, the first preferred; empty when any reasonable rewording is acceptable. */
  readonly corrections: ReadonlyArray<string>;
  readonly category: string | null;
}

export interface TextFinding {
  readonly key: string;
  readonly categoryId: string;
  /** `null` when the product could not place the finding in the manuscript. */
  readonly paragraph: number | null;
  readonly from: number;
  readonly to: number;
  readonly quote: string;
  /** What a 修改建议 proposes in place of the quotation; `null` for a 批注. */
  readonly replacement: string | null;
  readonly markId: string | null;
}

export type FindingVerdict =
  | { readonly kind: 'useful'; readonly concernId: string; readonly precise: boolean }
  | { readonly kind: 'false-positive'; readonly checkId: string }
  | { readonly kind: 'unclassified' };

export type EditorAction =
  | { readonly action: 'adopt' }
  | { readonly action: 'edit'; readonly editedText: string }
  | { readonly action: 'reject' }
  | { readonly action: 'leave'; readonly reason: 'unclassified' | 'extent' | 'not-located' };

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function graphemeCount(text: string): number {
  return graphemesOf(text).length;
}

function occurrences(text: string, words: string): number {
  if (words.length === 0) return 0;
  let count = 0;
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + words.length)) count += 1;
  return count;
}

/** The grapheme range of `words` in `text`, which must occur exactly once: an ambiguous anchor is a broken case, not a guess. */
export function locateOnce(text: string, words: string, label: string): { from: number; to: number } {
  const at = text.indexOf(words);
  if (words.length === 0 || at < 0 || text.indexOf(words, at + 1) >= 0) throw new Error(`EDITORIAL_CASE/anchor-not-unique: ${label}`);
  const from = graphemesOf(text.slice(0, at)).length;
  return { from, to: from + graphemesOf(words).length };
}

export function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * A located finding meets a false-positive check when it lies in the check's paragraph and its range overlaps the check's words
 * — the editor would have to refuse it — and otherwise meets the first concern of its category whose words it overlaps. A
 * check wins over a concern, because a finding that rewrites protected words is not made useful by also touching a defect.
 */
export function classifyFinding(
  finding: TextFinding,
  concerns: ReadonlyArray<TextAnchor>,
  checks: ReadonlyArray<Omit<TextAnchor, 'corrections' | 'category'>>,
): FindingVerdict {
  if (finding.paragraph === null) return { kind: 'unclassified' };
  const check = checks.find((candidate) => candidate.paragraph === finding.paragraph && overlaps(candidate, finding));
  if (check !== undefined) return { kind: 'false-positive', checkId: check.id };
  const concern = concerns.find((candidate) => candidate.paragraph === finding.paragraph && overlaps(candidate, finding) &&
    (candidate.category === null || candidate.category === finding.categoryId));
  if (concern === undefined) return { kind: 'unclassified' };
  return { kind: 'useful', concernId: concern.id, precise: finding.from <= concern.from && finding.to >= concern.to };
}

/**
 * The simulated editor (the report names it as such). A useful 修改建议 is adopted when applying it leaves one of the concern's
 * corrections in the block and one fewer occurrence of the defect; otherwise, when the finding covers the defect, it is edited
 * to the preferred correction; a concern with no fixed correction accepts any rewording. A useful 批注 is adopted (resolved). A
 * false positive is rejected. An unclassified finding is left for the editor's own judgement.
 */
export function simulatedEditor(finding: TextFinding, verdict: FindingVerdict, concerns: ReadonlyArray<TextAnchor>, blockText: string): EditorAction {
  if (finding.paragraph === null) return { action: 'leave', reason: 'not-located' };
  if (verdict.kind === 'false-positive') return { action: 'reject' };
  if (verdict.kind === 'unclassified') return { action: 'leave', reason: 'unclassified' };
  const concern = concerns.find((candidate) => candidate.id === verdict.concernId)!;
  if (finding.replacement === null || concern.corrections.length === 0) return { action: 'adopt' };
  const graphemes = graphemesOf(blockText);
  const applied = graphemes.slice(0, finding.from).join('') + finding.replacement + graphemes.slice(finding.to).join('');
  if (concern.corrections.some((correction) => applied.includes(correction)) && occurrences(applied, concern.words) < occurrences(blockText, concern.words)) {
    return { action: 'adopt' };
  }
  if (finding.from <= concern.from && finding.to >= concern.to) {
    const quote = graphemesOf(finding.quote);
    const editedText = quote.slice(0, concern.from - finding.from).join('') + concern.corrections[0]! + quote.slice(concern.to - finding.from).join('');
    if (editedText !== finding.quote) return { action: 'edit', editedText };
  }
  return { action: 'leave', reason: 'extent' };
}

/** After an Apply: the block now carries one of the concern's corrections in place of its words. */
export function correctionInPlace(concern: TextAnchor, before: string, after: string): boolean {
  if (concern.corrections.length === 0) return after !== before;
  return concern.corrections.some((correction) => after.includes(correction)) && occurrences(after, concern.words) < occurrences(before, concern.words);
}

/** Model words tied to the paragraphs they cite: an evaluation observation, a report or writing passage. */
export interface CitedNote {
  readonly text: string;
  readonly paragraphs: ReadonlyArray<number>;
  readonly item?: string;
  readonly passageKind?: string;
}

export interface StructuralAnchor {
  readonly id: string;
  readonly item?: string;
  readonly passageKind?: string;
  readonly paragraphs?: ReadonlyArray<number>;
  readonly keywords?: ReadonlyArray<string>;
  readonly section?: string;
  readonly maxGraphemes?: number;
}

/**
 * Whether model words meet a structural anchor. A `section` anchor reads one named part of the result (its keywords present,
 * within its length bound); any other anchor looks for a cited note of the named item or passage kind that cites one of its
 * paragraphs and carries one of its keywords. An anchor naming neither section, paragraphs, item nor kind reads every word.
 */
export function structuralMet(anchor: StructuralAnchor, notes: ReadonlyArray<CitedNote>, sections: Readonly<Record<string, string>>): boolean {
  const hasKeyword = (text: string): boolean => anchor.keywords === undefined || anchor.keywords.some((keyword) => text.includes(keyword));
  if (anchor.section !== undefined) {
    const text = sections[anchor.section] ?? '';
    return text.length > 0 && hasKeyword(text) && (anchor.maxGraphemes === undefined || graphemeCount(text) <= anchor.maxGraphemes);
  }
  const scoped = anchor.item !== undefined || anchor.passageKind !== undefined || anchor.paragraphs !== undefined;
  if (!scoped) return [...notes.map((note) => note.text), ...Object.values(sections)].some(hasKeyword);
  return notes.some((note) => (anchor.item === undefined || note.item === anchor.item) &&
    (anchor.passageKind === undefined || note.passageKind === anchor.passageKind) &&
    (anchor.paragraphs === undefined || note.paragraphs.some((paragraph) => anchor.paragraphs!.includes(paragraph))) &&
    hasKeyword(note.text));
}
