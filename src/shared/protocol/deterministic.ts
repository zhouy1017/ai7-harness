import type { BookTermEntry, LocalCheckTables } from './procedures.js';
import { validHousePin } from './house-word-list.js';
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasExactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));

function validLiteral(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.isWellFormed() && !/[\r\n\t\u0000-\u001f]/u.test(value);
}
export function validBookTerms(value: unknown): value is readonly BookTermEntry[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  const literals = new Set<string>();
  return value.every((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ['kind', 'preferred', 'variants']) || !['term', 'person', 'place'].includes(String(entry.kind)) ||
        !validLiteral(entry.preferred) || !Array.isArray(entry.variants) || entry.variants.length < 1 || entry.variants.length > 16) return false;
    for (const literal of [entry.preferred, ...entry.variants]) {
      if (!validLiteral(literal) || literals.has(literal)) return false;
      literals.add(literal);
    }
    return true;
  });
}
export function validLocalTables(value: unknown): value is LocalCheckTables {
  return isRecord(value) && hasExactKeys(value, ['characters', 'variantWords', 'bookTerms', 'houseWordList']) &&
    typeof value.characters === 'boolean' && typeof value.variantWords === 'boolean' && validBookTerms(value.bookTerms) &&
    (value.houseWordList === null || validHousePin(value.houseWordList));
}

/** A Book-local editor declaration: type, preferred spelling, and explicit variants separated by |. */
export function parseBookTerms(text: string): readonly BookTermEntry[] {
  const entries = text.split(/\r?\n/u).filter((line) => line.trim()).map((line) => {
    const cells = line.split('\t');
    if (cells.length !== 3) throw new Error('每行须为类型、采用写法、异写三列，以制表符分隔。');
    const kind = ({ '术语': 'term', '人名': 'person', '地名': 'place' } as Record<string, BookTermEntry['kind']>)[cells[0]!] ?? cells[0];
    return { kind, preferred: cells[1], variants: cells[2]!.split('|') };
  });
  if (!validBookTerms(entries)) throw new Error('本书词表须使用术语/人名/地名类型；写法不为空、不重复，每条最多16种异写，最多500条。');
  return entries;
}
