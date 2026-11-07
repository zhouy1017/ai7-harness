import { graphemesOf } from '../../shared/mark-anchor.js';

/** Only governed preference lines enter this selector; reference-only memory/examples have no input here. */
export interface PreferenceLineCandidate {
  versionId: string;
  ordinal: number;
  lineIndex: number;
  text: string;
  bookId: string | null;
  categoryId: string;
  active: boolean;
  /** Unknown confidence is zero, rather than an invented probability. */
  confidence: number;
  recordedAt: string;
}

export const EDITORIAL_MEMORY_REQUEST_LINES = 15;
export const EDITORIAL_MEMORY_REQUEST_GRAPHEMES = 1_200;
export const EDITORIAL_MEMORY_LIBRARY_LINES = 64;
export const EDITORIAL_MEMORY_LIBRARY_GRAPHEMES = 6_000;

export interface EditorialMemoryContext {
  bookId: string | null;
  categoryId?: string;
  taskKind?: string;
}

const CORE = new Set(['typos-and-usage', 'style-and-format', 'literary-expression', 'punctuation', 'general']);
const WRITING = new Set([...CORE, 'publication-risk']);

/** Book rules win ties; house rules are recalled by the actual task dimension. */
export function preferenceRelevant(line: PreferenceLineCandidate, context: EditorialMemoryContext): boolean {
  const kind = context.taskKind;
  if (kind === undefined) return line.categoryId === context.categoryId;
  if (kind === 'global-agent') return line.bookId === null;
  if (kind === 'editorial-dialogue' || kind === 'agent-workspace') return line.bookId === context.bookId || CORE.has(line.categoryId);
  if (kind.startsWith('editorial-review/')) return line.categoryId === kind.slice('editorial-review/'.length) || line.categoryId === 'style-and-format' || line.categoryId === 'general';
  if (/writing|evaluation|readers-report/u.test(kind)) return WRITING.has(line.categoryId);
  if (kind.includes('factual')) return ['factual-review', 'academic-integrity', 'general'].includes(line.categoryId);
  return line.categoryId === context.categoryId || ['plot-consistency', 'academic-integrity', 'publication-risk', 'general'].includes(line.categoryId);
}

/** Preserve whole lines and record identities; historical consumers can supply their original budget. */
export function selectPreferenceLines(
  candidates: readonly PreferenceLineCandidate[],
  unit: EditorialMemoryContext,
  budget = { lines: EDITORIAL_MEMORY_REQUEST_LINES, graphemes: EDITORIAL_MEMORY_REQUEST_GRAPHEMES },
): PreferenceLineCandidate[] {
  const ranked = candidates.filter((line) => line.active && line.versionId.length > 0 &&
    Number.isSafeInteger(line.ordinal) && line.ordinal >= 1 && Number.isSafeInteger(line.lineIndex) && line.lineIndex >= 0 &&
    preferenceRelevant(line, unit) && (line.bookId === null || line.bookId === unit.bookId) &&
    line.text.trim().length > 0 && line.text.isWellFormed() && !/[\r\n\p{Cc}\p{Zl}\p{Zp}]/u.test(line.text) &&
    Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 1 &&
    Number.isFinite(Date.parse(line.recordedAt)))
    .sort((a, b) => Number(b.bookId !== null && b.bookId === unit.bookId) - Number(a.bookId !== null && a.bookId === unit.bookId) ||
      b.confidence - a.confidence || Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
      a.versionId.localeCompare(b.versionId, 'en') || a.lineIndex - b.lineIndex);
  const selected: PreferenceLineCandidate[] = [];
  const seen = new Set<string>();
  let characters = 0;
  for (const line of ranked) {
    const key = `${line.versionId}/${line.lineIndex}`;
    const length = graphemesOf(line.text).length;
    if (seen.has(key) || characters + length > budget.graphemes) continue;
    seen.add(key);
    selected.push({ versionId: line.versionId, ordinal: line.ordinal, lineIndex: line.lineIndex, text: line.text,
      bookId: line.bookId, categoryId: line.categoryId, active: line.active, confidence: line.confidence, recordedAt: line.recordedAt });
    characters += length;
    if (selected.length === budget.lines) break;
  }
  return selected;
}
