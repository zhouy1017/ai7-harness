import { isRecord } from '../analysis/canonical.js';
import type { RetrievalCandidate, RetrievalIndex } from './index.js';

export const NOT_EXACT_FETCHED = '未经精确取文';
export const RETRIEVAL_CITATION_PATTERN = /\[retrieval:([0-9a-f]{64})\]/gu;
interface RejectedCitation { readonly collection: string; readonly ordinal: number; readonly path?: readonly (string | number)[] }

/** Ordinary recorded answers without retrieval anchors pass through byte-for-byte. */
export function prepareRetrievalResult(text: string, index: RetrievalIndex | null): {
  readonly text: string; readonly rejected: readonly RejectedCitation[];
} {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { text, rejected: [] }; }
  if (!isRecord(value)) return { text, rejected: [] };
  const rejected: RejectedCitation[] = [];
  let changed = false;
  const walk = (item: unknown, path: readonly (string | number)[]): void => {
    if (Array.isArray(item)) { item.forEach((entry: unknown, ordinal) => walk(entry, [...path, ordinal])); return; }
    if (!isRecord(item)) return;
    if (Object.hasOwn(item, 'retrievalAnchor') || Object.hasOwn(item, 'retrievalCandidateId')) {
      const anchor = item.retrievalAnchor;
      const candidateId = typeof anchor === 'string' ? anchor : isRecord(anchor) ? anchor.candidateId : item.retrievalCandidateId;
      changed = true;
      delete item.retrievalAnchor;
      delete item.retrievalCandidateId;
      const quote = typeof item.quote === 'string' ? item.quote : typeof item.passage === 'string' ? item.passage : '';
      let valid = false;
      if (typeof candidateId === 'string' && index !== null && index.citation(candidateId) !== null) {
        try { valid = quote.length > 0 && index.exactFetch(candidateId).text.includes(quote); } catch { /* stale/withdrawn */ }
      }
      if (!valid) rejected.push({ collection: typeof path[0] === 'string' ? path[0] : '', ordinal: typeof path[1] === 'number' ? path[1] : -1, path });
    }
    for (const [key, child] of Object.entries(item)) walk(child, [...path, key]);
  };
  walk(value, []);
  return { text: changed ? JSON.stringify(value) : text, rejected };
}

/** Persist the validator's decision with the unit finding so continuations/reuse preserve the exclusion. */
export function markRetrievalResult(result: unknown, rejected: readonly RejectedCitation[]): void {
  if (!isRecord(result)) return;
  for (const { collection, ordinal, path } of rejected) {
    const entries = result[collection];
    const item = Array.isArray(entries) ? entries[ordinal] as unknown : null;
    if (isRecord(item)) item.retrievalValidation = 'not-exact-fetched';
    if (path !== undefined) {
      let target: unknown = result;
      for (const key of path) target = isRecord(target) ? target[key] : Array.isArray(target) && typeof key === 'number' ? target[key] : null;
      if (isRecord(target)) target.retrievalValidation = 'not-exact-fetched';
    }
  }
}
export function notExactFetched(item: unknown): boolean { return isRecord(item) && item.retrievalValidation === 'not-exact-fetched'; }

export function dialogueRetrievalCitations(text: string, exact: ReadonlyMap<string, RetrievalCandidate>): { anchors: RetrievalCandidate[]; unverified: boolean } {
  const ids = [...text.matchAll(RETRIEVAL_CITATION_PATTERN)].map((match) => match[1]!);
  return { anchors: [...new Set(ids)].flatMap((id) => exact.has(id) ? [exact.get(id)!] : []), unverified: ids.some((id) => !exact.has(id)) };
}
