import { createHash } from 'node:crypto';
import type { ModelResultSalvage } from '../../shared/protocol/analysis.js';

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

/** Never invoke object coercion on model ordinals/references; callers enforce their own bounds. */
export function modelNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
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
  // Scan candidate arrays as well as objects: a bracketed prose note is not an empty partial array.
  const nextStart = (from: number): number => {
    const object = text.indexOf('{', from);
    const array = arrayKey === undefined ? -1 : text.indexOf('[', from);
    return object === -1 ? array : array === -1 ? object : Math.min(object, array);
  };
  const resultObject = (value: unknown): Record<string, unknown> | null => isRecord(value) ? value
    : arrayKey !== undefined && Array.isArray(value) ? { [arrayKey]: value } : null;
  for (let start = nextStart(0); start !== -1; start = nextStart(start + 1)) {
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
        if (char === '[' && (stack.length === 2 || stack.length === 1)) checkpoints.push({ end: at + 1, suffix: [...stack].reverse().join('') });
      } else if (char === '}' || char === ']') {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          balanced = true;
          try {
            const value: unknown = JSON.parse(text.slice(start, at + 1));
            const result = resultObject(value);
            if (result !== null) return result;
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
          const result = resultObject(value);
          if (result !== null) return result;
        } catch { /* Discard an unfinished value, keeping the earlier complete entries. */ }
      }
    }
    // Do not mistake a completed child of a truncated envelope for the envelope itself.
    if (!balanced) return null;
  }
  return null;
}

export const NO_USABLE_MODEL_ENTRIES = '模型回答无法读出任何可用条目';

/** Entry parsers share recovery bookkeeping; stored AI7 records still use their strict readers. */
export class ModelResultReader {
  readonly salvaged: ModelResultSalvage[] = [];
  private constructor(readonly value: Record<string, unknown>, readonly partial: boolean, readonly schema: string) {}

  static failure(text: string): { ok: false; code: 'not-json' | 'schema-invalid'; detail: string } {
    let code: 'not-json' | 'schema-invalid' = 'not-json';
    try { JSON.parse(stripModelJsonFence(text)); code = 'schema-invalid'; } catch { /* No readable JSON. */ }
    return { ok: false, code, detail: NO_USABLE_MODEL_ENTRIES };
  }

  static read(text: string, schema: string, unitOrdinal?: number): ModelResultReader | null {
    const complete = extractModelJson(text);
    const value = complete ?? extractModelJson(text, { partial: true });
    if (value === null) return null;
    const reader = new ModelResultReader(value, complete === null, schema);
    if (complete === null) reader.drop('response', -1, 'truncated-json');
    if (value.schema !== schema) reader.drop('schema', -1, 'request-schema');
    if (unitOrdinal !== undefined && value.unitOrdinal !== unitOrdinal) reader.drop('unitOrdinal', -1, 'request-unitOrdinal');
    return reader;
  }

  drop(section: string, index: number, reason: string): void { this.salvaged.push({ section, index, reason }); }

  array(value: unknown, section: string, maximum = Infinity): unknown[] {
    if (!Array.isArray(value)) {
      if (value !== undefined) this.drop(section, -1, 'array-invalid');
      return [];
    }
    for (let index = maximum; index < value.length; index += 1) this.drop(section, index, 'item-limit');
    return value.slice(0, maximum) as unknown[];
  }

  text(value: unknown, maximum: number, section: string, index: number, optional = false): string | null {
    if (optional && (value === undefined || value === null)) return '';
    if (typeof value !== 'string' || !value.isWellFormed() || (!optional && value.trim() === '')) {
      if (optional) this.drop(section, index, 'text-invalid');
      return null;
    }
    const normalized = normalizeLine(value, maximum);
    if (normalized !== value) this.drop(section, index, 'text-normalized');
    return normalized;
  }

  enum<T extends string>(value: unknown, choices: readonly T[], aliases: Readonly<Record<string, T>>, fallback: T, section: string, index: number): T {
    const key = typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase().replace(/[\s_]+/gu, '-') : '';
    const result = choices.find((choice) => choice.toLowerCase() === key) ?? (Object.hasOwn(aliases, key) ? aliases[key] : undefined) ?? fallback;
    if (result !== value) this.drop(section, index, 'enum-normalized');
    return result;
  }

  /** An intentional empty answer is usable; a section emptied by rejecting every entry is not. */
  empty(section: string): boolean {
    return !this.partial && (Array.isArray(this.value[section]) && this.value[section].length === 0 ||
      this.value[section] === undefined && this.value.schema === this.schema);
  }

  finish<T extends object>(value: T) {
    const result = { ...value, ...(this.salvaged.length === 0 ? {} : { salvaged: this.salvaged }) };
    const json = canonicalJson(result);
    return { ok: true as const, result, ...(this.salvaged.length === 0 ? {} : { salvaged: this.salvaged }), canonicalJson: json, digest: sha256Hex(json) };
  }
}
