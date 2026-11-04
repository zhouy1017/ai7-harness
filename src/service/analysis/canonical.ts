import { createHash } from 'node:crypto';

export class AnalysisError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export function requireAnalysis(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AnalysisError(code, message);
}

/**
 * The one canonical JSON form every analysis record, manifest, and digest uses: object keys sorted
 * by code point, arrays in order, scalars as `JSON.stringify` emits them, no whitespace. The same
 * value therefore always yields byte-identical text, which is what the manifest and revision
 * digests promise.
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === 'string') {
    requireAnalysis(value.isWellFormed(), 'ANALYSIS_CANONICAL_INVALID', '分析记录无法规范化。');
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireAnalysis(encoded !== undefined, 'ANALYSIS_CANONICAL_INVALID', '分析记录无法规范化。');
  return encoded;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalRecord(value: unknown): { json: string; digest: string } {
  const json = canonicalJson(value);
  return { json, digest: sha256Hex(json) };
}

/** Parse canonical JSON and require that it round-trips byte for byte. */
export function parseCanonicalJson(json: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new AnalysisError('ANALYSIS_RECORD_INVALID', '分析记录不是有效 JSON。');
  }
  requireAnalysis(canonicalJson(parsed) === json, 'ANALYSIS_RECORD_INVALID', '分析记录不是规范 JSON。');
  return parsed;
}

/**
 * Parse a stored row's JSON, a parse failure thrown as the owner's own error (Issue #689): a row whose digest matches text that
 * is not JSON is a damaged row like any other, so the guards that catch the owner's errors catch it too.
 */
export function parseStoredJson(json: string, invalid: () => Error): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw invalid();
  }
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
export const BLOCK_ID_PATTERN = /^blk_[0-9a-f]{24}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** Model fields are an open set; optional names document the caller's contract, not a whitelist. */
export function hasKeys(value: unknown, required: readonly string[], _optional: readonly string[] = []): value is Record<string, unknown> {
  return isRecord(value) && required.every((key) => Object.hasOwn(value, key));
}

export type { ModelResultSalvage, SalvagedModelResult } from '../../shared/protocol/analysis.js';

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export function graphemeCount(text: string): number {
  let count = 0;
  for (const _segment of GRAPHEMES.segment(text)) count += 1;
  return count;
}

/** Validate without changing quotations or anchors. Normalized prose uses normalizeLine instead. */
export function boundedText(value: unknown, maximumGraphemes: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.isWellFormed() && (allowEmpty || value.trim().length > 0) &&
    graphemeCount(value) <= maximumGraphemes;
}

/** NFC, folded whitespace and optional whole-grapheme clipping for descriptive model prose. */
export function normalizeLine(text: string, maximumGraphemes = Infinity): string {
  const normalized = text.normalize('NFC').replace(/\s+/gu, ' ').trim();
  let result = '';
  let count = 0;
  for (const { segment } of GRAPHEMES.segment(normalized)) {
    if (count >= maximumGraphemes) break;
    result += segment;
    count += 1;
  }
  return result.trimEnd();
}

/** Compatibility extraction for parsers not yet migrated to extractModelJson. */
export function stripModelJsonFence(text: string): string {
  return /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text)?.[1] ?? text;
}

/**
 * Read the first JSON object among prose or fences, without interpreting braces inside strings.
 * With partial enabled, retain only complete values from an unfinished object/array; never invent
 * a string, number or missing field. Callers still validate every recovered entry against its scope.
 */
export function extractModelJson(text: string, { partial = false, arrayKey }: { partial?: boolean; arrayKey?: string } = {}): Record<string, unknown> | null {
  // Array contracts use the same balanced/partial reader without changing object-only callers.
  const arrayStart = text.indexOf('[');
  const objectStart = text.indexOf('{');
  if (arrayKey !== undefined && arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    return extractModelJson(`{${JSON.stringify(arrayKey)}:${text.slice(arrayStart)}`, { partial });
  }
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const stack: string[] = [];
    const checkpoints: Array<{ end: number; suffix: string }> = [];
    let quoted = false;
    let escaped = false;
    let balanced = false;
    for (let at = start; at < text.length; at += 1) {
      const char = text[at];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
        // An empty array is useful even before its first item arrives.
        if (char === '[' && stack.length === 2) checkpoints.push({ end: at + 1, suffix: [...stack].reverse().join('') });
      } else if (char === '}' || char === ']') {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          balanced = true;
          try {
            const value: unknown = JSON.parse(text.slice(start, at + 1));
            if (isRecord(value)) return value;
          } catch { /* Explanatory braces are not a model object. */ }
          start = at;
          break;
        }
        if (stack.length === 1 || (stack.length === 2 && stack[1] === ']')) checkpoints.push({ end: at + 1, suffix: [...stack].reverse().join('') });
      } else if (char === ',' && (stack.length === 1 || (stack.length === 2 && stack[1] === ']'))) checkpoints.push({ end: at, suffix: [...stack].reverse().join('') });
    }
    if (partial && !balanced) {
      for (const checkpoint of checkpoints.reverse()) {
        try {
          const value: unknown = JSON.parse(text.slice(start, checkpoint.end) + checkpoint.suffix);
          if (isRecord(value)) return value;
        } catch { /* Discard an unfinished value, keeping the earlier complete entries. */ }
      }
    }
    // Do not mistake a completed child of a truncated envelope for the envelope itself.
    if (!balanced) return null;
  }
  return null;
}
