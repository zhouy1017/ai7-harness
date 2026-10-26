import { MAX_MARK_BODY_CODE_UNITS } from '../protocol.js';

/** Editor-authored local data. These declarations do not register an IPC operation. */
export const HOUSE_WORD_LIST_SCHEMA = 'ai7.house-word-list/1' as const;
export const MAX_HOUSE_ENTRIES = 500;
export const MAX_HOUSE_BYTES = 128 * 1024;
export const HOUSE_PAGE_SIZE = 50;
export const HOUSE_DISCLOSURE = '仅按你保存的字面词条提示风险；请编辑判断';
export interface HouseWordListPin { readonly listId: string; readonly versionId: string; readonly digest: string }
export interface HouseWordListEntry { readonly entryId: string; readonly literal: string; readonly note: string; readonly enabled: boolean }
export interface HouseWordListDraftEntry { readonly entryId: string | null; readonly literal: string; readonly note: string; readonly enabled: boolean }
export type HouseWordListSourceKind = 'editor-entry' | 'editor-paste';
export interface HouseWordListDocument {
  readonly schema: typeof HOUSE_WORD_LIST_SCHEMA;
  readonly listId: string; readonly versionId: string; readonly ordinal: number;
  readonly previous: { readonly versionId: string; readonly digest: string } | null;
  readonly createdAt: string; readonly source: { readonly kind: HouseWordListSourceKind };
  readonly entries: readonly HouseWordListEntry[];
}
export interface HouseWordListVersion {
  readonly pin: HouseWordListPin; readonly ordinal: number; readonly createdAt: string;
  readonly source: { readonly kind: HouseWordListSourceKind };
  readonly previous: HouseWordListDocument['previous']; readonly entryCount: number; readonly enabledCount: number;
}
export interface InspectHouseWordListInput { readonly versionId: string | null; readonly entryOffset: number; readonly historyOffset: number }
export interface HouseWordListPage {
  readonly current: HouseWordListPin | null; readonly selected: HouseWordListVersion | null;
  readonly entries: readonly HouseWordListEntry[]; readonly nextEntryOffset: number | null;
  readonly history: readonly HouseWordListVersion[]; readonly nextHistoryOffset: number | null;
}
export interface SaveHouseWordListInput {
  readonly expectedCurrent: { readonly versionId: string; readonly digest: string } | null;
  readonly sourceKind: HouseWordListSourceKind; readonly entries: readonly HouseWordListDraftEntry[];
}
export interface SaveHouseWordListResult { readonly pin: HouseWordListPin; readonly ordinal: number; readonly created: boolean }
export interface HouseWordListApi {
  inspectHouseWordList(input: InspectHouseWordListInput): Promise<HouseWordListPage>;
  saveHouseWordList(input: SaveHouseWordListInput): Promise<SaveHouseWordListResult>;
}
export class HouseWordListError extends Error {
  constructor(readonly code: string, message: string, readonly row: number | null = null) {
    super(message); this.name = 'HouseWordListError';
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
const SEGMENTER = new Intl.Segmenter('zh', { granularity: 'grapheme' });
export function houseRequire(value: unknown, code: string, message: string, row: number | null = null): asserts value {
  if (!value) throw new HouseWordListError(code, message, row);
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
export function validHousePin(value: unknown): value is HouseWordListPin {
  return record(value) && keys(value, ['listId', 'versionId', 'digest']) && typeof value.listId === 'string' && UUID.test(value.listId) &&
    typeof value.versionId === 'string' && UUID.test(value.versionId) && typeof value.digest === 'string' && DIGEST.test(value.digest);
}
export function houseUtf8Bytes(text: string): number { return new TextEncoder().encode(text).byteLength; }
function atMostGraphemes(text: string, max: number): boolean {
  let count = 0;
  for (const _ of SEGMENTER.segment(text)) if (++count > max) return false;
  return true;
}
/** The exact same public explanation is validated before save and used for H01 marks. */
export function houseAnnotationDetail(entry: HouseWordListEntry, version: Pick<HouseWordListVersion, 'pin' | 'ordinal'>): string {
  return `本社敏感词表 第${version.ordinal}版 · H01/v1\n词条：${entry.literal}\n词条说明：${entry.note || '（无）'}\n命中本社词条，请编辑判断。\n词条 ${entry.entryId} · 词表 ${version.pin.listId} · 版本 ${version.pin.versionId} · 摘要 ${version.pin.digest}`;
}
export function validateHouseEntries(value: unknown, persisted = false): asserts value is readonly HouseWordListDraftEntry[] {
  houseRequire(Array.isArray(value) && value.length <= MAX_HOUSE_ENTRIES, 'HOUSE_ENTRIES_INVALID', '词表最多保存500条词条。');
  const ids = new Set<string>(); const literals = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const row = index + 1; const entry: unknown = value[index];
    houseRequire(record(entry) && keys(entry, ['entryId', 'literal', 'note', 'enabled']), 'HOUSE_ENTRY_INVALID', `第${row}行的字段无效。`, row);
    houseRequire(entry.entryId === null && !persisted || typeof entry.entryId === 'string' && UUID.test(entry.entryId), 'HOUSE_ENTRY_ID_INVALID', `第${row}行的词条身份无效。`, row);
    houseRequire(typeof entry.literal === 'string' && entry.literal.length > 0 && entry.literal.length <= MAX_HOUSE_BYTES && entry.literal.isWellFormed() &&
      entry.literal.trim() === entry.literal && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(entry.literal) && atMostGraphemes(entry.literal, 80),
    'HOUSE_LITERAL_INVALID', `第${row}行须为1至80字的字面词条，不能含换行、控制字符或首尾空白。`, row);
    houseRequire(typeof entry.note === 'string' && entry.note.length <= MAX_HOUSE_BYTES && entry.note.isWellFormed() &&
      !/[\p{Cc}]/u.test(entry.note.replace(/[\r\n\t]/gu, '')) && atMostGraphemes(entry.note, 200), 'HOUSE_NOTE_INVALID', `第${row}行的词条说明须为200字以内的纯文本。`, row);
    houseRequire(typeof entry.enabled === 'boolean', 'HOUSE_ENTRY_INVALID', `第${row}行的启用状态无效。`, row);
    houseRequire(!literals.has(entry.literal) && (entry.entryId === null || !ids.has(entry.entryId)), 'HOUSE_ENTRY_DUPLICATE', `第${row}行的词条或身份重复。`, row);
    literals.add(entry.literal); if (entry.entryId !== null) ids.add(entry.entryId);
    const placeholder = '00000000-0000-4000-8000-000000000000';
    const detail = houseAnnotationDetail({ entryId: entry.entryId ?? placeholder, literal: entry.literal, note: entry.note, enabled: entry.enabled },
      { ordinal: Number.MAX_SAFE_INTEGER, pin: { listId: placeholder, versionId: placeholder, digest: '0'.repeat(64) } });
    houseRequire(detail.length <= MAX_MARK_BODY_CODE_UNITS, 'HOUSE_ANNOTATION_TOO_LONG', `第${row}行的词条与说明过长，无法完整显示在批注中。`, row);
  }
}
export function validateSaveHouseWordListInput(value: unknown): asserts value is SaveHouseWordListInput {
  houseRequire(record(value) && keys(value, ['expectedCurrent', 'sourceKind', 'entries']), 'HOUSE_INPUT_INVALID', '词表保存参数无效。');
  houseRequire(value.sourceKind === 'editor-entry' || value.sourceKind === 'editor-paste', 'HOUSE_SOURCE_INVALID', '请选择键入或粘贴词条。');
  const pin = value.expectedCurrent;
  houseRequire(pin === null || record(pin) && keys(pin, ['versionId', 'digest']) && typeof pin.versionId === 'string' && UUID.test(pin.versionId) &&
    typeof pin.digest === 'string' && DIGEST.test(pin.digest), 'HOUSE_PIN_INVALID', '词表版本无效，请重新载入。');
  validateHouseEntries(value.entries);
  houseRequire(houseUtf8Bytes(JSON.stringify(value)) <= MAX_HOUSE_BYTES, 'HOUSE_DOCUMENT_TOO_LARGE', '词表内容须在128KiB以内。');
}
export function validateInspectHouseWordListInput(value: unknown): asserts value is InspectHouseWordListInput {
  houseRequire(record(value) && keys(value, ['versionId', 'entryOffset', 'historyOffset']) &&
    (value.versionId === null || typeof value.versionId === 'string' && UUID.test(value.versionId)) &&
    Number.isSafeInteger(value.entryOffset) && Number(value.entryOffset) >= 0 && Number.isSafeInteger(value.historyOffset) && Number(value.historyOffset) >= 0,
  'HOUSE_PAGE_INVALID', '词表页码或版本无效。');
}
export interface HousePastePreview { readonly entries: readonly HouseWordListDraftEntry[]; readonly errors: readonly { readonly row: number | null; readonly message: string }[] }
/** A line is literal text, including metacharacters, URLs and JSON-looking text; nothing is evaluated or fetched. */
export function previewHousePaste(text: string): HousePastePreview {
  if (!text.isWellFormed() || text.length > MAX_HOUSE_BYTES || houseUtf8Bytes(text) > MAX_HOUSE_BYTES) return { entries: [], errors: [{ row: null, message: '粘贴文本须为128KiB以内的有效文本。' }] };
  const entries: HouseWordListDraftEntry[] = []; const errors: { row: number | null; message: string }[] = []; const seen = new Set<string>();
  const lines = text.split(/\r\n|\n|\r/u);
  for (let index = 0; index < lines.length; index++) {
    const literal = lines[index]!; if (literal.length === 0) continue;
    const row = index + 1;
    if (entries.length >= MAX_HOUSE_ENTRIES) { errors.push({ row, message: '词表最多保存500条词条。' }); break; }
    const entry = { entryId: null, literal, note: '', enabled: true };
    try {
      validateHouseEntries([entry]);
      houseRequire(!seen.has(literal), 'HOUSE_ENTRY_DUPLICATE', `第${row}行的词条重复。`, row);
      seen.add(literal); entries.push(entry);
    } catch (error) {
      if (!(error instanceof HouseWordListError)) throw error;
      errors.push({ row, message: error.message.replace('第1行', `第${row}行`) });
      // Error projections, like entry projections, remain bounded even on many tiny lines.
      if (errors.length === MAX_HOUSE_ENTRIES) break;
    }
  }
  return { entries, errors };
}
