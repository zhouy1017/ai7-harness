import { unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { extname } from 'node:path';
import { extractMaterialFormatText, extractPdfText, MaterialFormatRefusal } from '../material-formats.js';
import { STANDARD_TABLE_FORMAT, type StandardEntry } from '../standard-tables.js';
import type { StandardTableRow, StandardTableKind, StandardStrength } from '../../shared/protocol/standard-tables.js';
import { standardTableKind, standardTableRow } from './schemas.js';
import { requireStore } from '../store-records.js';

export const MAX_TABLE_BYTES = 16 * 1024 * 1024;
export const rowTuple = (r: StandardTableRow): StandardEntry => [r.recommended, r.discouraged, r.rank, r.condition, r.source, r.strength, r.status, r.reviewNote, r.sourceText];
export const tupleRow = (r: StandardEntry): StandardTableRow => ({ recommended: r[0], discouraged: [...r[1]], rank: r[2], condition: r[3], source: r[4], strength: r[5], status: r[6], reviewNote: r[7], sourceText: r[8] });
export function checkedRows(value: unknown): StandardTableRow[] {
  requireStore(Array.isArray(value) && value.length <= 100000, 'STANDARD_TABLE_INVALID', '字表条目无效或超过十万条，请分开导入。');
  return value.map(row => {
    const tuple = Array.isArray(row) && row.length === 9 && Array.isArray(row[1]);
    const parsed = standardTableRow.safeParse(tuple ? tupleRow(row as unknown as StandardEntry) : row);
    requireStore(parsed.success, 'STANDARD_TABLE_INVALID', '字表条目的写法、频序、效力或确认状态无效，请核对。');
    return parsed.data;
  });
}
export function holdConflicts(rows: StandardTableRow[]): StandardTableRow[] {
  const choices = new Map<string, Set<string>>();
  for (const r of rows) if (r.status !== 'unrecognized') for (const form of [r.recommended, ...r.discouraged]) {
    const set = choices.get(form) ?? new Set<string>(); set.add(r.recommended); choices.set(form, set);
  }
  return rows.map(r => r.status !== 'unrecognized' && [r.recommended, ...r.discouraged].some(f => choices.get(f)!.size > 1)
    ? { ...r, status: 'to-confirm', reviewNote: '同一文件对同一写法给出了不同的推荐写法，请核对。' } : r);
}
export function counts(rows: readonly StandardTableRow[]) {
  return { applied: rows.filter(r => r.status === 'applied').length, toConfirm: rows.filter(r => r.status === 'to-confirm').length,
    unrecognized: rows.filter(r => r.status === 'unrecognized').length };
}
const emptyRow = (strength: StandardStrength): StandardTableRow => ({ recommended: '', discouraged: [], rank: null, condition: null, source: null,
  strength, status: 'applied', reviewNote: null, sourceText: null });
const aliases: Record<string, keyof StandardTableRow> = {};
for (const [field, names] of Object.entries({ recommended: ['recommended', 'recommended form', '推荐写法', '规范字', '词条'],
  discouraged: ['discouraged', 'discouraged forms', '不推荐写法', '异形词', '繁体字', '异体字'], rank: ['rank', '频序'],
  condition: ['condition', 'note', '条件', '说明'], source: ['source', '来源', '出处'], strength: ['strength', '效力', '级别'] })) {
  for (const name of names) aliases[name] = field as keyof StandardTableRow;
}
const strengths: Record<string, StandardStrength> = { national: 'national', dictionary: 'dictionary', house: 'house',
  国家规范: 'national', 辞书推荐: 'dictionary', 本社要求: 'house', '国家规范（应改）': 'national', '辞书推荐（建议改）': 'dictionary', '本社要求（按本社体例改）': 'house' };
function forms(value: string): string[] { return value.split(/[、/;；|\n]+/u).map(s => s.trim()).filter(Boolean); }
export function delimited(text: string, separator: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (ch === separator || ch === '\n')) {
      row.push(cell.replace(/\r$/u, '').trim()); cell = ''; if (ch === '\n') { rows.push(row); row = []; }
    } else cell += ch;
  }
  requireStore(!quoted, 'STANDARD_TABLE_INVALID', '表格的引号没有闭合，请核对文件。');
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(r => r.some(Boolean));
}
function tableRows(grid: string[][], strength: StandardStrength): StandardTableRow[] | null {
  const header = grid.findIndex(r => r.some(cell => aliases[cell.toLowerCase()] === 'recommended'));
  if (header < 0) return null;
  const fields = grid[header]!.map(cell => aliases[cell.toLowerCase()]);
  return grid.slice(header + 1).filter(r => r.some(Boolean)).map(cells => {
    const row = emptyRow(strength); row.sourceText = cells.join('\t');
    for (let i = 0; i < cells.length; i++) {
      const value = cells[i]!.trim(), field = fields[i]; if (!value || !field) continue;
      if (field === 'discouraged') row.discouraged.push(...forms(value));
      else if (field === 'rank') { row.rank = Number(value); if (!Number.isSafeInteger(row.rank) || row.rank < 1) { row.rank = null; row.status = 'to-confirm'; row.reviewNote = '频序不是正整数，请核对。'; } }
      else if (field === 'strength') { if (strengths[value]) row.strength = strengths[value]; else { row.status = 'to-confirm'; row.reviewNote = '效力未能识别，请核对。'; } }
      else if (field === 'recommended') row.recommended = value;
      else if (field === 'condition') row.condition = [row.condition, value].filter(Boolean).join('；');
      else if (field === 'source') row.source = value;
    }
    if (!row.recommended) { row.status = 'unrecognized'; row.reviewNote = '未找到推荐写法，请核对原文。'; }
    return row;
  });
}
function xml(text: string, open: (name: string, attrs: Record<string, string>) => void, close: (name: string) => void, content: (text: string) => void) {
  const parser = new SaxesParser({ xmlns: false });
  parser.on('doctype', () => { throw new Error('DTD'); });
  parser.on('opentag', tag => open(tag.name.split(':').at(-1)!, tag.attributes));
  parser.on('closetag', tag => close(tag.name.split(':').at(-1)!)); parser.on('text', content); parser.on('cdata', content);
  parser.write(text).close();
}
const worksheetPart = /^xl\/worksheets\/sheet(\d+)\.xml$/u;
function office(bytes: Uint8Array, spreadsheet: boolean): { grids: string[][][]; paragraphs: string[] } {
  let expanded = 0;
  const archive = unzipSync(bytes, { filter: file => {
    expanded += file.originalSize;
    requireStore(expanded <= 64 * 1024 * 1024, 'STANDARD_TABLE_TOO_LARGE', '文件展开后过大，请分开导入。');
    return spreadsheet ? file.name === 'xl/sharedStrings.xml' || worksheetPart.test(file.name) : file.name === 'word/document.xml';
  } });
  const decode = (name: string) => new TextDecoder('utf-8', { fatal: true }).decode(archive[name]);
  const grids: string[][][] = [], paragraphs: string[] = [];
  if (spreadsheet) {
    const shared: string[] = []; let value = '', capture = false, phonetic = false;
    if (archive['xl/sharedStrings.xml']) xml(decode('xl/sharedStrings.xml'), name => {
      if (name === 'si') value = '';
      if (name === 'rPh') phonetic = true;
      if (name === 't') capture = !phonetic;
    }, name => {
      if (name === 'rPh') phonetic = false;
      if (name === 't') capture = false;
      if (name === 'si') shared.push(value);
    }, text => { if (capture) value += text; });
    const sheets = Object.keys(archive).flatMap(name => {
      const part = worksheetPart.exec(name);
      return part === null ? [] : [{ name, number: Number(part[1]) }];
    }).sort((a, b) => a.number - b.number);
    for (const { name } of sheets) {
      const grid: string[][] = []; let row: string[] = [], column = 0, type = '', cell = '', reading = false;
      xml(decode(name), (tag, attrs) => {
        if (tag === 'row') row = [];
        if (tag === 'c') { const letters = (attrs.r ?? '').match(/^[A-Z]+/u)?.[0] ?? ''; column = letters ? [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : row.length; type = attrs.t ?? ''; cell = ''; }
        if (tag === 'v' || tag === 't') reading = true;
      }, tag => {
        if (tag === 'v' || tag === 't') reading = false;
        if (tag === 'c') { requireStore(column < 1024, 'STANDARD_TABLE_INVALID', '表格列数过多，请只保留字表字段。'); while (row.length < column) row.push(''); row[column] = type === 's' ? shared[Number(cell)] ?? '' : cell; }
        if (tag === 'row' && row.some(value => value.trim())) grid.push(row);
      }, text => { if (reading) cell += text; });
      if (grid.length) grids.push(grid);
      paragraphs.push(...grid.map(r => r.join('\t')));
    }
  } else {
    let grid: string[][] = [], row: string[] = [], cell = '', paragraph = '', inCell = false, inText = false;
    requireStore(archive['word/document.xml'], 'STANDARD_TABLE_INVALID', 'Word 文件没有可读取的正文。');
    xml(decode('word/document.xml'), tag => { if (tag === 'tbl') grid = []; if (tag === 'tr') row = []; if (tag === 'tc') { cell = ''; inCell = true; }
      if (tag === 'p') paragraph = ''; if (tag === 't') inText = true; if (tag === 'tab') paragraph += '\t'; }, tag => {
      if (tag === 't') inText = false;
      if (tag === 'p' && paragraph.trim()) { paragraphs.push(paragraph); if (inCell) cell += (cell ? '\n' : '') + paragraph; }
      if (tag === 'tc') { row.push(cell); inCell = false; }
      if (tag === 'tr' && row.some(Boolean)) grid.push(row);
      if (tag === 'tbl' && grid.length) grids.push(grid);
    }, text => { if (inText) paragraph += text; });
  }
  return { grids, paragraphs };
}
function gfRows(paragraphs: string[], strength: StandardStrength): StandardTableRow[] | null {
  const rows: StandardTableRow[] = []; let appendix: string | null = null;
  for (const text of paragraphs) {
    if (/^附[录録]/u.test(text)) { appendix = text; continue; }
    const segments = text.split(/\s+(?=[^\s—]+\s*—{1,2})/u);
    const matches = segments.map(segment => segment.match(/^\s*(?:\d+[.、\s]+)?([^—\s]+)\s*—{1,2}\s*([^\s（(]+)(.*)$/u));
    if (matches.every(match => match !== null)) for (const match of matches) rows.push({ ...emptyRow(strength), recommended: match![1]!, discouraged: forms(match![2]!),
      condition: [appendix, match![3]!.trim()].filter(Boolean).join('；') || null, source: appendix, sourceText: text });
    else if (rows.length && /^(?:注|说明|[（(])/u.test(text)) {
      const last = rows.at(-1)!; last.condition = [last.condition, text].filter(Boolean).join('；'); last.sourceText += '\n' + text;
    } else if (rows.length && text.trim() && !/^(?:\d+|[A-Z])$/u.test(text)) return null;
  }
  return rows.length ? rows : null;
}
export interface ConvertedTable { rows: StandardTableRow[] | null; paragraphs: string[]; name?: string; kind?: StandardTableKind; versionLabel?: string; sourceDescription?: string }
export async function convertTable(bytes: Uint8Array, fileName: string, strength: StandardStrength): Promise<ConvertedTable> {
  requireStore(bytes.length > 0 && bytes.length <= MAX_TABLE_BYTES, 'STANDARD_TABLE_TOO_LARGE', '文件为空或超过16 MB，请分开导入。');
  const extension = extname(fileName).toLowerCase(); let paragraphs: string[], grids: string[][][] = [];
  if (extension === '.xlsx' || extension === '.docx') ({ paragraphs, grids } = office(bytes, extension === '.xlsx'));
  else if (extension === '.pdf') {
    try { paragraphs = (await extractPdfText(bytes)).paragraphs.map(p => p.lines.join("\n")); }
    catch (e) { if (e instanceof MaterialFormatRefusal && e.reason === 'needs-recognition') requireStore(false, 'STANDARD_TABLE_SCAN_UNSUPPORTED', '这份 PDF 没有可读取的文字层，需要先识别。暂不支持扫描 PDF 识别（#1034）。'); throw e; }
  } else if (extension === '.html' || extension === '.htm') paragraphs = extractMaterialFormatText(bytes, 'HTML').paragraphs.map(p => p.lines.join("\n"));
  else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '');
    if (extension === '.json' || text.trimStart().startsWith('{')) {
      let value; try { value = JSON.parse(text); } catch { requireStore(false, 'STANDARD_TABLE_INVALID', '字表文件不是有效的 JSON，请核对。'); }
      requireStore(value && (value.schema ?? value.format) === STANDARD_TABLE_FORMAT && standardTableKind.safeParse(value.kind).success,
        'STANDARD_TABLE_INVALID', '请选择 ai7.standard-table/1 格式的字表文件。');
      requireStore(typeof value.name === 'string' && value.name.trim() && value.name.length <= 180 &&
        (value.versionLabel === undefined || typeof value.versionLabel === 'string') && (value.sourceDescription === undefined || typeof value.sourceDescription === 'string'), 'STANDARD_TABLE_INVALID', '字表名称或版本说明无效。');
      const entries = Array.isArray(value.entries) ? value.entries.map((r: unknown) => r && typeof r === 'object' && !Array.isArray(r)
        ? { ...emptyRow(strength), ...r } : r) : value.entries;
      return { rows: holdConflicts(checkedRows(entries)), paragraphs: text.split(/\r?\n/u), name: value.name, kind: value.kind,
        versionLabel: value.versionLabel ?? '', sourceDescription: value.sourceDescription ?? '' };
    }
    paragraphs = text.split(/\r?\n/u).map(p => p.trim()).filter(Boolean);
    if (extension === '.csv' || extension === '.tsv' || text.includes('\t')) grids = [delimited(text, extension === '.csv' ? ',' : '\t')];
  }
  requireStore(paragraphs.length > 0, 'STANDARD_TABLE_EMPTY', '文件没有可读取的文字。');
  const converted = grids.map(grid => tableRows(grid, strength)).filter(rows => rows !== null);
  const rows = converted.length ? converted.flat() : gfRows(paragraphs, strength);
  return { rows: rows === null ? null : holdConflicts(checkedRows(rows)), paragraphs };
}
