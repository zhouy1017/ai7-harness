import type { DatabaseSync } from 'node:sqlite';
import type { LocalCheckTables } from '../../../shared/protocol/procedures.js';
import { DIGEST_PATTERN, UUID_PATTERN, hasExactKeys, isRecord } from '../../analysis/canonical.js';
import type { StandardTableKind, StandardStrength } from '../../standard-tables.js';
import readings from './mandarin-readings.json' with { type: 'json' };

export interface LibraryPin {
  tableId: string; versionId: string; digest: string; kind: StandardTableKind; name: string; label: string; source: string;
}

export function enabledStandardTables(db: DatabaseSync): LibraryPin[] {
  return db.prepare(`SELECT t.table_id tableId, v.version_id versionId, v.digest, t.kind, t.name, v.version_label label, v.source_description source
    FROM standard_tables t JOIN standard_table_versions v ON v.version_id = t.current_version_id AND v.table_id = t.table_id
    WHERE t.enabled = 1 ORDER BY t.table_id`).all() as unknown as LibraryPin[];
}
export function selectedStandardTables(db: DatabaseSync, tables: LocalCheckTables): LibraryPin[] {
  return enabledStandardTables(db).filter(pin => (pin.kind === 'character-forms' || pin.kind === 'standard-characters' ? tables.characters : tables.variantWords)
    && (tables.tableIds === undefined || tables.tableIds.includes(pin.tableId)));
}
export function validLibraryPins(pins: unknown): pins is LibraryPin[] {
  return Array.isArray(pins) && pins.every(pin => isRecord(pin) && hasExactKeys(pin, ['tableId', 'versionId', 'digest', 'kind', 'name', 'label', 'source']) &&
    typeof pin.tableId === 'string' && UUID_PATTERN.test(pin.tableId) &&
    typeof pin.versionId === 'string' && UUID_PATTERN.test(pin.versionId) && typeof pin.digest === 'string' && DIGEST_PATTERN.test(pin.digest) &&
    ['standard-characters', 'character-forms', 'word-forms', 'common-words'].includes(String(pin.kind)) &&
    typeof pin.name === 'string' && typeof pin.label === 'string' && typeof pin.source === 'string') && new Set(pins.map(pin => pin.tableId)).size === pins.length;
}
export function missingLibraryPins(db: DatabaseSync, pins: readonly LibraryPin[]): boolean {
  const version = db.prepare('SELECT 1 FROM standard_table_versions WHERE table_id = ? AND version_id = ? AND digest = ?');
  return pins.some(pin => !version.get(pin.tableId, pin.versionId, pin.digest));
}

export const STRENGTH = { national: '国家规范（应改）', dictionary: '辞书推荐（建议改）', house: '本社要求（按本社体例改）' };
export interface EntryEvidence {
  tableId: string; recommended: string; discouraged: string[]; condition: string | null; source: string | null; strength: StandardStrength;
}
export type LibraryRule = 'C01' | 'C02' | 'V01';
export interface LibraryHit { rule: LibraryRule; start: number; literal: string; entries: EntryEvidence[] }

const groups = new Map<string, string[]>();
function readingGroups(character: string): readonly string[] {
  if (!groups.size) for (const chars of Object.values(readings)) for (const char of chars) {
    const current = groups.get(char);
    if (current) current.push(chars);
    else groups.set(char, [chars]);
  }
  return groups.get(character) ?? [];
}
function sameReading(a: string, b: string): boolean {
  return readingGroups(a).some(group => group.includes(b));
}
function nearWord(a: string, b: string): boolean {
  const left = Array.from(a), right = Array.from(b);
  if (left.length !== right.length || left.length < 2) return false;
  const differences = left.flatMap((char, i) => char === right[i] ? [] : [i]);
  return differences.length === 1 && sameReading(left[differences[0]!]!, right[differences[0]!]!);
}

/** Derive the card and Apply payload from the entry evidence also kept by historical results. */
export function libraryDetail(pins: readonly LibraryPin[], rule: LibraryRule, literal: string, entries: unknown) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const lines: string[] = [];
  const forms = new Set<string>();
  let conditional = false;
  let advisory = false;
  for (const entry of entries) {
    if (!isRecord(entry) || !hasExactKeys(entry, ['tableId', 'recommended', 'discouraged', 'condition', 'source', 'strength']) ||
        typeof entry.strength !== 'string' || !Object.hasOwn(STRENGTH, entry.strength) ||
        typeof entry.recommended !== 'string' || (!entry.recommended && rule !== 'C01') || !Array.isArray(entry.discouraged) || !entry.discouraged.every(d => typeof d === 'string') ||
        !(entry.condition === null || typeof entry.condition === 'string') || !(entry.source === null || typeof entry.source === 'string')) return null;
    const pin = pins.find(pin => pin.tableId === entry.tableId);
    if (!pin) return null;
    if (rule === 'C01') {
      if (pin.kind !== 'standard-characters' || entry.recommended !== '' || entry.discouraged.length || !/^\p{Unified_Ideograph}$/u.test(literal)) return null;
    } else if (pin.kind === 'common-words') {
      if (rule !== 'V01' || !nearWord(literal, entry.recommended)) return null;
      advisory = true;
    } else {
      if ((pin.kind !== 'character-forms' && pin.kind !== 'word-forms') || (rule === 'V01' && pin.kind !== 'word-forms') ||
          (entry.recommended !== literal && !entry.discouraged.includes(literal))) return null;
    }
    forms.add(entry.recommended);
    conditional ||= Boolean(entry.condition);
    const comparison = rule === 'C01' ? '未收录此字，表外用字请核对' : pin.kind === 'common-words' ? `收录“${entry.recommended}”；可能是不常用的写法，请核对`
      : `${entry.discouraged.join('、')} → ${entry.recommended}`;
    lines.push(`${STRENGTH[entry.strength as StandardStrength]} · ${pin.name}（${pin.label}） · ${entry.source || pin.source} · ${comparison}${entry.condition ? ' · ' + entry.condition : ''}`);
  }
  if (rule === 'C02' && !entries.some(entry => pins.some(pin => pin.tableId === entry.tableId && pin.kind === 'character-forms'))) return null;
  return { basis: 'standard-table' as const, observation: lines.join('\n') + (forms.size > 1 && !advisory ? '\n各表写法不一致，请核对。' : ''),
    replacement: rule === 'V01' && !advisory && !conditional && forms.size === 1 && !forms.has(literal) ? [...forms][0]! : null };
}

export function loadLibraryCheck(db: DatabaseSync, pins: readonly LibraryPin[], terms: LocalCheckTables['bookTerms']) {
  const membership = new Set<string>();
  const members: EntryEvidence[] = [];
  const forms = new Map<string, EntryEvidence[]>();
  const words = new Map<string, EntryEvidence[]>();
  const common = new Map<string, EntryEvidence[]>();
  const book = new Set(terms.flatMap(term => [term.preferred, ...term.variants]));
  function add(map: Map<string, EntryEvidence[]>, literal: string, row: EntryEvidence) {
    if (!literal) return;
    const rows = map.get(literal);
    if (rows) rows.push(row); else map.set(literal, [row]);
  }
  const rows = db.prepare(`SELECT recommended, discouraged, condition_note AS condition, source, strength FROM standard_table_entries
    WHERE version_id = ? AND status = 'applied' ORDER BY position`);
  for (const pin of pins) {
    for (const raw of rows.iterate(pin.versionId)) {
      const row = { tableId: pin.tableId, recommended: String(raw.recommended), discouraged: JSON.parse(String(raw.discouraged)) as string[],
        condition: raw.condition as string | null, source: raw.source as string | null, strength: raw.strength as StandardStrength };
      if (pin.kind === 'standard-characters') {
        membership.add(row.recommended);
        if (members.at(-1)?.tableId !== pin.tableId) members.push({ ...row, recommended: '', source: null, condition: null });
      } else if (pin.kind === 'common-words') add(common, row.recommended, row);
      else {
        const map = pin.kind === 'character-forms' ? forms : words;
        for (const literal of new Set([row.recommended, ...row.discouraged])) add(map, literal, row);
      }
    }
  }
  const wordLengths = [...new Set([...words.keys(), ...book].map(word => word.length))].sort((a, b) => a - b);
  const neighbors = new Map<string, EntryEvidence[]>();
  function commonAlternatives(literal: string): EntryEvidence[] {
    const cached = neighbors.get(literal);
    if (cached) return cached;
    const chars = Array.from(literal);
    const found = new Set<EntryEvidence>();
    for (const [i, char] of chars.entries()) {
      for (const group of readingGroups(char)) for (const alternative of group) {
        chars[i] = alternative;
        for (const row of common.get(chars.join('')) ?? []) found.add(row);
      }
      chars[i] = char;
    }
    const result = [...found];
    neighbors.set(literal, result);
    return result;
  }
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return async function* scan(text: string, checkpoint: () => Promise<void>): AsyncGenerator<LibraryHit> {
    const covered = new Uint8Array(text.length);
    const bookCovered = new Uint8Array(text.length);
    for (let start = 0; start < text.length; start++) {
      if (start > 0 && start % 2048 === 0) await checkpoint();
      for (const length of wordLengths) {
        if (start + length > text.length) break;
        const literal = text.slice(start, start + length);
        if (book.has(literal)) bookCovered.fill(1, start, start + length);
        if (words.has(literal) || book.has(literal)) covered.fill(1, start, start + length);
      }
    }
    let start = 0;
    let work = 0;
    for (const char of text) {
      if (++work % 2048 === 0) await checkpoint();
      const characterRows = forms.get(char) ?? [];
      const wordRows = bookCovered.subarray(start, start + char.length).includes(1) ? [] : words.get(char) ?? [];
      const samePlace = [...characterRows, ...wordRows];
      const disagreement = characterRows.length && wordRows.length && samePlace.some(row => row.discouraged.includes(char)) &&
        new Set(samePlace.map(row => row.recommended)).size > 1;
      for (const length of wordLengths) {
        if (start + length > text.length) break;
        if (disagreement && length === char.length) continue;
        const literal = text.slice(start, start + length);
        const entries = words.get(literal);
        if (entries?.some(row => row.discouraged.includes(literal)) && !bookCovered.subarray(start, start + length).includes(1)) {
          yield { rule: 'V01', start, literal, entries };
        }
      }
      if (/^\p{Unified_Ideograph}$/u.test(char)) {
        if (disagreement || characterRows.some(row => row.discouraged.includes(char))) {
          yield { rule: 'C02', start, literal: char, entries: disagreement ? samePlace : characterRows };
          covered.fill(1, start, start + char.length);
        } else if (members.length && !membership.has(char)) {
          yield { rule: 'C01', start, literal: char, entries: members };
          covered.fill(1, start, start + char.length);
        }
      }
      start += char.length;
    }
    if (!common.size) return;
    for (const run of text.matchAll(/\p{Unified_Ideograph}+/gu)) {
      if (common.has(run[0])) continue;
      const segments = /^\p{Unified_Ideograph}{2}$/u.test(run[0])
        ? [{ segment: run[0], index: 0 }] : segmenter.segment(run[0]);
      for (const { segment, index } of segments) {
        if (++work % 256 === 0) await checkpoint();
        const offset = run.index + index;
        if (!/^\p{Unified_Ideograph}{2,8}$/u.test(segment) || common.has(segment) || covered.subarray(offset, offset + segment.length).includes(1)) continue;
        const entries = commonAlternatives(segment);
        if (entries.length) yield { rule: 'V01', start: offset, literal: segment, entries };
      }
    }
  };
}
