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
