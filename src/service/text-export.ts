import { graphemesOf } from '../shared/mark-anchor.js';
import type { ExportFidelityRowProjection } from '../shared/protocol.js';
import {
  EDITOR_NOTE_AUTHOR_LABEL,
  contentTallies,
  fidelityRow,
  included,
  planMarks,
  type ContentClassKey,
  type DocxExportBlock,
  type DocxExportInput,
  type DocxExportMark,
  type MarkPlan,
} from './docx-export.js';

/**
 * The two formats laid out from the manuscript's own words (Issue #500, plan slice S64b; V2-UX-EXP-001, EXP-005,
 * EXP-006, EXP-009): PDF, an optional fixed layout with no editable round trip, and Markdown, the 备用格式 that keeps
 * only the words and their heading levels. Neither restores anything from the original file, so the review names every
 * class of it they leave behind, from the same counts the DOCX review takes.
 *
 * The module is pure: the same input always gives the same bytes. For PDF the bytes are the HTML page the main process
 * prints, since printing needs a Chromium the service does not have; the page is what the preparation binds, and the
 * receipt binds the printed file.
 */
export const MARKDOWN_EXPORT_WRITER_IDENTITY = 'ai7-markdown-export/1';
export const PDF_EXPORT_WRITER_IDENTITY = 'ai7-pdf-export/1';

export type TextExportFormat = 'pdf' | 'markdown';

export interface TextExportResult {
  /** The Markdown file, or the HTML page the PDF is printed from; `null` when only the review was asked for. */
  bytes: Uint8Array | null;
  fidelity: ExportFidelityRowProjection[];
  /** Whether any class is `降级导出` or `无法导出` (V2-UX-EXP-008). */
  degraded: boolean;
  written: { annotations: number; suggestions: number; editorNotes: number; replies: number };
}

// ---- where each mark sits in its block -------------------------------------------------------------------

/** One numbered note: a 批注 or 备注, or the record of a 修改建议 whose words stand in the text. */
interface Note {
  number: number;
  mark: DocxExportMark;
  current: string | null;
  proposed: string | null;
}

type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'suggestion'; current: string; proposed: string; note: number }
  | { kind: 'reference'; note: number };

/**
 * A block as pieces: its words, each pending 修改建议 standing in place of the words it would change, and a reference
 * after the words each 批注 or 备注 is on. A note's reference that would fall inside a suggestion's words follows the
 * suggestion instead. Notes are numbered in reading order across the whole document.
 */
function blockPieces(block: DocxExportBlock, plan: MarkPlan, notes: Note[]): Piece[] {
  const parts = graphemesOf(block.text);
  const suggestions = [...(plan.suggestionsByBlock.get(block.blockId) ?? [])]
    .sort((left, right) => left.fromGrapheme - right.fromGrapheme || left.toGrapheme - right.toGrapheme);
  const references = new Map<number, DocxExportMark[]>();
  for (const comment of plan.commentsByBlock.get(block.blockId) ?? []) {
    let end = comment.toGrapheme;
    for (const suggestion of suggestions) {
      if (suggestion.fromGrapheme < end && end < suggestion.toGrapheme) end = suggestion.toGrapheme;
    }
    const list = references.get(end) ?? [];
    list.push(comment.mark);
    references.set(end, list);
  }
  const pieces: Piece[] = [];
  let text = '';
  const flushText = (): void => {
    if (text.length > 0) pieces.push({ kind: 'text', text });
    text = '';
  };
  const referencesAt = (position: number): void => {
    for (const mark of references.get(position) ?? []) {
      flushText();
      const number = notes.length + 1;
      notes.push({ number, mark, current: null, proposed: null });
      pieces.push({ kind: 'reference', note: number });
    }
  };
  let next = 0;
  let position = 0;
  while (position <= parts.length) {
    referencesAt(position);
    // Every suggestion that starts here: an insertion (no words) keeps the position, a change moves past its words.
    let moved = false;
    while (next < suggestions.length && suggestions[next]!.fromGrapheme === position) {
      const suggestion = suggestions[next]!;
      next += 1;
      flushText();
      const number = notes.length + 1;
      notes.push({ number, mark: suggestion.mark, current: suggestion.currentText, proposed: suggestion.proposedText });
      pieces.push({ kind: 'suggestion', current: suggestion.currentText, proposed: suggestion.proposedText, note: number });
      if (suggestion.toGrapheme > position) {
        // The references on words inside the change follow it.
        for (let inside = position + 1; inside < suggestion.toGrapheme; inside += 1) referencesAt(inside);
        position = suggestion.toGrapheme;
        moved = true;
        break;
      }
    }
    if (moved) continue;
    if (position === parts.length) break;
    text += parts[position]!;
    position += 1;
  }
  flushText();
  return pieces;
}

function layout(input: DocxExportInput): { plan: MarkPlan; blocks: Array<{ block: DocxExportBlock; pieces: Piece[] }>; notes: Note[] } {
  const byId = new Map(input.blocks.map((block) => [block.blockId, block]));
  const plan = planMarks(input, byId);
  const notes: Note[] = [];
  const blocks = input.blocks.map((block) => ({ block, pieces: blockPieces(block, plan, notes) }));
  return { plan, blocks, notes };
}

/** The day a mark was made, as a note states it: the UTC date of its instant. */
function noteDate(instant: string): string {
  return /^\d{4}-\d{2}-\d{2}/u.test(instant) ? instant.slice(0, 10) : instant;
}

function headingLevel(block: DocxExportBlock): number {
  return Math.min(Math.max((block.level ?? 1) + 1, 2), 6);
}

function written(notes: ReadonlyArray<Note>): TextExportResult['written'] {
  return {
    annotations: notes.filter((note) => note.mark.kind === 'annotation').length,
    suggestions: notes.filter((note) => note.mark.kind === 'change-suggestion').length,
    editorNotes: notes.filter((note) => note.mark.kind === 'editor-note').length,
    replies: notes.reduce((total, note) => total + (note.mark.kind === 'annotation' ? note.mark.replies.length : 0), 0),
  };
}

// ---- Markdown -----------------------------------------------------------------------------------------

/** A character Markdown or CriticMarkup would read as syntax, escaped wherever it appears. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>{}|~&#]/gu, (character) => `\\${character}`);
}

/**
 * A line that would open a quotation, a list, a heading's underline or an indented code block is escaped at its
 * start; a leading space or tab is written as its character reference, so it stays part of the words.
 */
export function escapeLineStart(line: string): string {
  const indent = /^[ \t]+/u.exec(line);
  if (indent !== null) return `${indent[0].replace(/[ \t]/gu, (space) => (space === ' ' ? '&#32;' : '&#9;'))}${line.slice(indent[0].length)}`;
  const list = /^(\d+)([.)])/u.exec(line);
  if (list !== null) return `${list[1]}\\${list[2]}${line.slice(list[0].length)}`;
  return /^[>+=-]/u.test(line) ? `\\${line}` : line;
}

/** A block in Markdown: a paragraph keeps each line break as a hard break; a title or heading stays one line. */
function markdownBlock(block: DocxExportBlock, pieces: ReadonlyArray<Piece>): string {
  const lines = pieces.map(markdownPiece).join('').split('\n').map(escapeLineStart);
  if (block.kind === 'title') return `# ${lines.join(' ')}`;
  if (block.kind === 'heading') return `${'#'.repeat(headingLevel(block))} ${lines.join(' ')}`;
  return lines.join('\\\n');
}

function markdownPiece(piece: Piece): string {
  switch (piece.kind) {
    case 'text':
      return escapeMarkdown(piece.text);
    case 'reference':
      return `[^${piece.note}]`;
    case 'suggestion': {
      const current = escapeMarkdown(piece.current);
      const proposed = escapeMarkdown(piece.proposed);
      const change = current.length === 0 ? `{++${proposed}++}` : proposed.length === 0 ? `{--${current}--}` : `{~~${current}~>${proposed}~~}`;
      return `${change}[^${piece.note}]`;
    }
  }
}

/** A note's words, every line after its first escaped at its start and indented so the footnote keeps them. */
function footnote(number: number, text: string): string {
  const [first, ...rest] = text.split('\n');
  return [`[^${number}]: ${first ?? ''}`, ...rest.map((line) => `    ${escapeLineStart(line)}`)].join('\n');
}

/** A note's own words — a body, a reply, an author, a suggestion's words — escaped as the manuscript's are. */
function noteWords(text: string): string {
  return escapeMarkdown(text.replace(/\r\n?/gu, '\n'));
}

function markdownNote(note: Note): string {
  const mark = note.mark;
  if (mark.kind === 'change-suggestion') {
    return footnote(note.number,
      `修改建议 · ${noteWords(mark.authorLabel)} · ${noteDate(mark.createdAt)}：「${noteWords(note.current ?? '')}」改为「${noteWords(note.proposed ?? '')}」`);
  }
  if (mark.kind === 'editor-note') return footnote(note.number, `${EDITOR_NOTE_AUTHOR_LABEL} · ${noteDate(mark.createdAt)}：${noteWords(mark.body)}`);
  const lines = [`批注 · ${noteWords(mark.authorLabel)} · ${noteDate(mark.createdAt)}${mark.resolved ? ' · 已处理' : ''}：${noteWords(mark.body)}`];
  for (const reply of mark.replies) lines.push(`回复 · ${noteDate(reply.createdAt)}：${noteWords(reply.body)}`);
  return footnote(note.number, lines.join('\n'));
}

export function renderMarkdownExport(input: DocxExportInput, options: { emit: boolean }): TextExportResult {
  const laid = layout(input);
  const fidelity = textFidelityRows('markdown', input, laid.plan);
  const result = { fidelity, degraded: fidelity.some((row) => row.status === 'degraded' || row.status === 'unavailable'), written: written(laid.notes) };
  if (!options.emit) return { bytes: null, ...result };
  const lines = laid.blocks.map(({ block, pieces }) => markdownBlock(block, pieces));
  const body = [...lines, ...(laid.notes.length === 0 ? [] : laid.notes.map(markdownNote))].join('\n\n');
  return { bytes: new TextEncoder().encode(`${body}\n`), ...result };
}

// ---- PDF: the page the main process prints -----------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

/** Words on the page: escaped, each line break kept as one. */
export function htmlLines(text: string): string {
  return text.split(/\r?\n/u).map(escapeHtml).join('<br>');
}

function htmlPiece(piece: Piece): string {
  switch (piece.kind) {
    case 'text':
      return htmlLines(piece.text);
    case 'reference':
      return `<sup class="note-ref">${piece.note}</sup>`;
    case 'suggestion':
      return `${piece.current.length === 0 ? '' : `<del>${htmlLines(piece.current)}</del>`}` +
        `${piece.proposed.length === 0 ? '' : `<ins>${htmlLines(piece.proposed)}</ins>`}<sup class="note-ref">${piece.note}</sup>`;
  }
}

function htmlNote(note: Note): string {
  const mark = note.mark;
  if (mark.kind === 'change-suggestion') {
    return `<li value="${note.number}"><span class="note-kind">修改建议</span> · ${escapeHtml(mark.authorLabel)} · ${noteDate(mark.createdAt)}：` +
      `「${htmlLines(note.current ?? '')}」改为「${htmlLines(note.proposed ?? '')}」</li>`;
  }
  if (mark.kind === 'editor-note') {
    return `<li value="${note.number}"><span class="note-kind">${EDITOR_NOTE_AUTHOR_LABEL}</span> · ${noteDate(mark.createdAt)}：${htmlLines(mark.body)}</li>`;
  }
  const replies = mark.replies.map((reply) => `<p class="note-reply">回复 · ${noteDate(reply.createdAt)}：${htmlLines(reply.body)}</p>`).join('');
  return `<li value="${note.number}"><span class="note-kind">批注</span> · ${escapeHtml(mark.authorLabel)} · ${noteDate(mark.createdAt)}` +
    `${mark.resolved ? ' · 已处理' : ''}：${htmlLines(mark.body)}${replies}</li>`;
}

/**
 * The print sheet: A4, the reading faces a CJK system carries, and nothing the page could load — no script, no
 * remote font, no image — so the printed file holds the manuscript's words and nothing else.
 */
export const PRINT_BASE_STYLE = [
  '@page{size:A4;margin:25mm 22mm}',
  "html{font-family:'Songti SC','STSong','SimSun','Noto Serif CJK SC','Source Han Serif SC','Noto Serif SC',serif;font-size:11pt;line-height:1.8;color:#000;background:#fff}",
  'body{margin:0}',
  'h1.book-title{text-align:center;font-size:20pt;margin:0 0 1.2em}',
  'h2,h3,h4,h5,h6{break-after:avoid;margin:1.2em 0 .6em}',
  'h2{font-size:16pt}h3{font-size:14pt}h4,h5,h6{font-size:12pt}',
].join('');
const PRINT_STYLE = PRINT_BASE_STYLE + [
  'p{margin:0 0 .5em;text-indent:2em;text-align:justify}',
  'del{text-decoration:line-through}ins{text-decoration:underline;text-decoration-style:double}',
  'sup.note-ref{font-size:.7em;line-height:0}',
  'section.notes{break-before:page;font-size:9.5pt}',
  'section.notes h2{font-size:12pt}',
  'section.notes li{margin:0 0 .4em}',
  'section.notes p.note-reply{margin:.2em 0 0;text-indent:0}',
].join('');

export function renderPdfHtmlExport(input: DocxExportInput, options: { emit: boolean }): TextExportResult {
  const laid = layout(input);
  const fidelity = textFidelityRows('pdf', input, laid.plan);
  const result = { fidelity, degraded: fidelity.some((row) => row.status === 'degraded' || row.status === 'unavailable'), written: written(laid.notes) };
  if (!options.emit) return { bytes: null, ...result };
  const blocks = laid.blocks.map(({ block, pieces }) => {
    const inner = pieces.map(htmlPiece).join('');
    if (block.kind === 'title') return `<h1 class="book-title">${inner}</h1>`;
    if (block.kind === 'heading') {
      const level = headingLevel(block);
      return `<h${level}>${inner}</h${level}>`;
    }
    return `<p>${inner}</p>`;
  });
  const notes = laid.notes.length === 0
    ? ''
    : `<section class="notes"><h2>批注与修改建议</h2><ol>${laid.notes.map(htmlNote).join('')}</ol></section>`;
  return { bytes: new TextEncoder().encode(printPage(input.title, PRINT_STYLE, `<main>${blocks.join('')}</main>${notes}`)), ...result };
}

/** A page to print: its title, its print sheet and its body, under a policy that lets it load nothing at all. */
export function printPage(title: string, style: string, body: string): string {
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<title>${escapeHtml(title)}</title><style>${style}</style></head><body>${body}</body></html>`;
}

// ---- the review (V2-UX-EXP-007, EXP-009) -------------------------------------------------------------------

const FORMAT_NAMES: Readonly<Record<TextExportFormat, string>> = { pdf: 'PDF', markdown: 'Markdown' };

function markRow(
  plan: MarkPlan,
  input: DocxExportInput,
  kind: 'annotation' | 'editor-note' | 'change-suggestion',
  key: 'annotations' | 'editor-notes' | 'change-suggestions',
  label: string,
  words: { excluded: (live: number) => string; none: string; written: (count: number) => string },
): ExportFidelityRowProjection {
  const live = plan.live[kind];
  if (!included(kind, input.options)) return fidelityRow(key, label, live, 'excluded', words.excluded(live));
  const considered = plan.considered[kind];
  if (considered === 0) return fidelityRow(key, label, 0, 'preserved', words.none);
  const unwritable = plan.unwritable[kind];
  const writable = considered - unwritable.length;
  const lost = kind === 'change-suggestion'
    ? `${unwritable.length} 条原文已变化或与其他修改建议重叠，无法导出。`
    : `${unwritable.length} 条所在的文字已变化，无法导出。`;
  // Written, a mark keeps its words but not what an editor can do with it in the file: 降级导出 (EXP-009).
  if (unwritable.length === 0) return fidelityRow(key, label, considered, 'degraded', words.written(writable));
  return fidelityRow(key, label, considered, 'unavailable', `${words.written(writable)}${lost}`, unwritable);
}

function classRow(
  tallies: Record<ContentClassKey, number>,
  key: ContentClassKey,
  label: string,
  absent: string,
  left: (count: number) => string,
  status: 'unavailable' | 'degraded' = 'unavailable',
): ExportFidelityRowProjection {
  const count = tallies[key];
  return count === 0 ? fidelityRow(key, label, 0, 'preserved', absent) : fidelityRow(key, label, count, status, left(count));
}

/** Every class of the version under this format: what the file keeps, what it keeps only as words, what it leaves. */
function textFidelityRows(format: TextExportFormat, input: DocxExportInput, plan: MarkPlan): ExportFidelityRowProjection[] {
  const tallies = contentTallies(input.source);
  const name = FORMAT_NAMES[format];
  const pdf = format === 'pdf';
  const textBoxesMerged = input.source.kind === 'mapped' && input.source.textBoxes === 'merge';
  return [
    classRow(tallies, 'inline-styles', '行内样式', '未检测到行内样式。', (count) => pdf
      ? `PDF 按稿件文字排版，原文件中的字体、粗体、颜色等行内样式与超链接不带入（${count} 处）。`
      : `Markdown 只写出文字，原文件中的字体、粗体、颜色等行内样式与超链接不写出（${count} 处）。`),
    markRow(plan, input, 'annotation', 'annotations', '批注', {
      excluded: (live) => `本次不含批注；稿件上的 ${live} 条批注不变。`,
      none: '稿件上没有批注。',
      written: (count) => pdf
        ? `${count} 条批注在正文中标出编号，连同作者、日期与回复列在文末；PDF 中不能再回复或标为已处理。`
        : `${count} 条批注写成脚注，保留作者、日期与回复；Markdown 中不能再回复或标为已处理。`,
    }),
    markRow(plan, input, 'change-suggestion', 'change-suggestions', '修改建议', {
      excluded: (live) => `本次不含修改建议；稿件上的 ${live} 条修改建议不变。`,
      none: '稿件上没有待处理的修改建议。',
      written: (count) => pdf
        ? `${count} 条待处理的修改建议以删除线与双下划线标在正文中，并列在文末；PDF 中不能接受或拒绝。`
        : `${count} 条待处理的修改建议写成 CriticMarkup 标记，作者与日期写在脚注里；Markdown 中不能接受或拒绝。`,
    }),
    markRow(plan, input, 'editor-note', 'editor-notes', '备注', {
      excluded: (live) => `备注默认不随导出（稿件上 ${live} 条）；勾选「含备注」后${pdf ? '列在文末' : '写成脚注'}，作者为「${EDITOR_NOTE_AUTHOR_LABEL}」。`,
      none: '稿件上没有备注。',
      written: (count) => `${count} 条备注${pdf ? '列在文末' : '写成脚注'}，作者为「${EDITOR_NOTE_AUTHOR_LABEL}」。`,
    }),
    classRow(tallies, 'notes', '脚注与尾注', '未检测到脚注或尾注。', (count) => `原文件中的脚注与尾注不随 ${name} 导出（${count} 处）。`),
    classRow(tallies, 'tables', '表格', '未检测到表格。', (count) => `原文件中的表格不随 ${name} 导出（${count} 个）。`),
    classRow(tallies, 'images-captions', '图片与图注', '未检测到图片。', (count) => `原文件中的图片不随 ${name} 导出（${count} 张）；图注按稿件文字写出。`),
    classRow(tallies, 'sections', '分节（含页面设置）', '未检测到分节或页面设置。', (count) => pdf
      ? `原文件中的分节与页面设置不带入（${count} 处）；PDF 按 A4 纸张排版。`
      : `原文件中的分节与页面设置不随 Markdown 导出（${count} 处）。`),
    classRow(tallies, 'headers-footers', '页眉与页脚', '未检测到页眉或页脚。', (count) => `原文件中的页眉与页脚不随 ${name} 导出（${count} 处）。`),
    textBoxesMerged
      ? fidelityRow('text-boxes', '文本框', tallies['text-boxes'], 'preserved', '文本框已在导入时并入正文，按正文段落写出。')
      : classRow(tallies, 'text-boxes', '文本框', '未检测到文本框。', (count) => `原文件中的文本框不随 ${name} 导出（${count} 个）。`),
    classRow(tallies, 'fields', '域（目录等）', '未检测到域。', (count) => `原文件中的目录、页码等域不随 ${name} 导出（${count} 个）；只写出稿件中的文字。`),
    classRow(tallies, 'file-revisions', '原文件中的修订', '原文件没有未转为稿件标记的修订。',
      (count) => `原文件中未转为稿件标记的修订不写出（${count} 处）；导出的文字是稿件当前的文字。`, 'degraded'),
  ];
}
