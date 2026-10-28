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

/** Deterministic Top-5, preserving whole lines and their record identities under the existing policy budget. */
export function selectPreferenceLines(
  candidates: readonly PreferenceLineCandidate[],
  unit: { bookId: string; categoryId: string },
): PreferenceLineCandidate[] {
  const ranked = candidates.filter((line) => line.active && line.versionId.length > 0 &&
    Number.isSafeInteger(line.ordinal) && line.ordinal >= 1 && Number.isSafeInteger(line.lineIndex) && line.lineIndex >= 0 &&
    line.categoryId === unit.categoryId && (line.bookId === null || line.bookId === unit.bookId) &&
    line.text.trim().length > 0 && line.text.isWellFormed() && !/[\r\n\p{Cc}\p{Zl}\p{Zp}]/u.test(line.text) &&
    Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 1 &&
    Number.isFinite(Date.parse(line.recordedAt)))
    .sort((a, b) => Number(b.bookId === unit.bookId) - Number(a.bookId === unit.bookId) ||
      b.confidence - a.confidence || Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
      a.versionId.localeCompare(b.versionId, 'en') || a.lineIndex - b.lineIndex);
  const selected: PreferenceLineCandidate[] = [];
  const seen = new Set<string>();
  let characters = 0;
  for (const line of ranked) {
    const key = `${line.versionId}/${line.lineIndex}`;
    const length = graphemesOf(line.text).length;
    if (seen.has(key) || characters + length > 200) continue;
    seen.add(key);
    selected.push({ versionId: line.versionId, ordinal: line.ordinal, lineIndex: line.lineIndex, text: line.text,
      bookId: line.bookId, categoryId: line.categoryId, active: line.active, confidence: line.confidence, recordedAt: line.recordedAt });
    characters += length;
    if (selected.length === 5) break;
  }
  return selected;
}
