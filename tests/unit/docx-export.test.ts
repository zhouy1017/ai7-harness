import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import {
  DocxExportError,
  EDITOR_AUTHOR_LABEL,
  EDITOR_NOTE_AUTHOR_LABEL,
  renderDocxExport,
  type DocxExportBlock,
  type DocxExportInput,
  type DocxExportMark,
  type DocxExportSourceRow,
} from '../../src/service/docx-export.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ExportFidelityRowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText, type SourceSpan } from '../support/composed-fixture.js';

// DOCX export (Issue #413, plan slice S64) over composed documents: every word of every input is a span of exact
// `sample1`, and every mark body and author is a neutral authored phrase. Each written file is read back with the
// product's own parser. Assertions compare digests, counts, keys and positions, so a failure prints no excerpt.

const SOURCE = ADMITTED_BASELINE_DOCX;
const AUTHOR = '示例作者';
const REVIEWER = 'AI7 · 错别字与用法';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-docx-export-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A block's digest exactly as the parser writes it. */
function blockDigest(kind: DocxExportBlock['kind'], level: number | null, text: string): string {
  return digest(JSON.stringify({ kind, level, text }));
}

// ---- composing the source ------------------------------------------------------------------------------

interface ComposedRun {
  span: SourceSpan;
  bold?: boolean;
}

type ComposedBodyItem =
  | {
      runs: ReadonlyArray<ComposedRun>;
      style?: string;
      /** Paragraphs of a text box anchored at the end of the paragraph, the way Word writes one. */
      textBox?: ReadonlyArray<SourceSpan>;
      footnote?: boolean;
      /** The paragraph's first run displayed through a simple field. */
      field?: boolean;
      /** An inline picture after the runs. */
      drawing?: boolean;
      /** A hyperlink around the paragraph's last run. */
      link?: boolean;
    }
  | { table: ReadonlyArray<ReadonlyArray<SourceSpan>> };

interface ComposedSource {
  body: ReadonlyArray<ComposedBodyItem>;
  header?: SourceSpan;
}

const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const WPS = 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const V = 'xmlns:v="urn:schemas-microsoft-com:vml"';
const PIC = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

async function runXml(run: ComposedRun): Promise<string> {
  const text = escapeXml(await sourceSpanText(SOURCE, run.span));
  return `<w:r>${run.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

async function paragraphXml(item: Extract<ComposedBodyItem, { runs: unknown }>): Promise<string> {
  const runs = await Promise.all(item.runs.map(runXml));
  if (item.field && runs.length > 0) runs[0] = `<w:fldSimple w:instr=" TITLE ">${runs[0]}</w:fldSimple>`;
  if (item.link && runs.length > 0) runs[runs.length - 1] = `<w:hyperlink w:anchor="mark">${runs.at(-1)}</w:hyperlink>`;
  if (item.footnote) runs.push('<w:r><w:footnoteReference w:id="1"/></w:r>');
  if (item.drawing) {
    runs.push(`<w:r><w:drawing><wp:inline ${WP}><a:graphic ${A}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic ${PIC}/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
  }
  if (item.textBox !== undefined) {
    const box = (await Promise.all(item.textBox.map(async (span) => `<w:p>${await runXml({ span })}</w:p>`))).join('');
    runs.push(`<w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing><wp:anchor ${WP}><a:graphic ${A}><a:graphicData>` +
      `<wps:wsp ${WPS}><wps:txbx><w:txbxContent>${box}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor>` +
      `</w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape ${V}><v:textbox><w:txbxContent>${box}</w:txbxContent></v:textbox>` +
      '</v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>');
  }
  const style = item.style === undefined ? '' : `<w:pPr><w:pStyle w:val="${item.style}"/></w:pPr>`;
  return `<w:p>${style}${runs.join('')}</w:p>`;
}

async function composeSource(path: string, source: ComposedSource): Promise<Uint8Array> {
  const body: string[] = [];
  for (const item of source.body) {
    if ('table' in item) {
      const rows = await Promise.all(item.table.map(async (cells) =>
        `<w:tr>${(await Promise.all(cells.map(async (span) => `<w:tc><w:p>${await runXml({ span })}</w:p></w:tc>`))).join('')}</w:tr>`));
      body.push(`<w:tbl><w:tblPr/>${rows.join('')}</w:tbl>`);
    } else {
      body.push(await paragraphXml(item));
    }
  }
  const header = source.header === undefined ? '' : '<w:headerReference w:type="default" r:id="rIdHeader1"/>';
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      (source.header === undefined ? '' : '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>') +
      '</Types>',
    ),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${body.join('')}<w:sectPr>${header}<w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
    ),
    'word/footnotes.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>1</w:t></w:r></w:p></w:footnote></w:footnotes>`),
  };
  if (source.header !== undefined) {
    entries['word/header1.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W}"><w:p>${await runXml({ span: source.header })}</w:p></w:hdr>`);
    entries['word/_rels/document.xml.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
  }
  const archive = zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') });
  await writeFile(path, archive);
  return archive;
}

async function parse(path: string): Promise<{ parsed: ParsedDocx; blocks: ParsedDocxBlock[] }> {
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, 'export.docx', (block) => blocks.push(block));
  return { parsed, blocks };
}

async function parseBytes(bytes: Uint8Array, name = 'written.docx'): Promise<{ parsed: ParsedDocx; blocks: ParsedDocxBlock[] }> {
  const path = join(sandbox, name);
  await writeFile(path, bytes);
  return parse(path);
}

function exportBlocks(blocks: ReadonlyArray<ParsedDocxBlock>): DocxExportBlock[] {
  return blocks.map((block) => ({ blockId: block.blockId, position: block.position, kind: block.kind, level: block.level, text: block.text, digest: block.digest }));
}

function bodyRows(blocks: ReadonlyArray<ParsedDocxBlock>): DocxExportSourceRow[] {
  return blocks.map((block) => ({ blockId: block.blockId, sourcePart: 'body', sourceParagraphIndex: block.sourceParagraphIndex, sourceParagraphDigest: block.digest }));
}

function edited(block: DocxExportBlock, text: string): DocxExportBlock {
  return { ...block, text, digest: blockDigest(block.kind, block.level, text) };
}

function fidelityOf(rows: ReadonlyArray<ExportFidelityRowProjection>): Array<[string, string, number, number[]]> {
  return rows.filter((entry) => entry.count > 0 || entry.status !== 'preserved').map((entry) => [entry.key, entry.status, entry.count, [...entry.positions]]);
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

function partOf(bytes: Uint8Array, name: string): string | undefined {
  const entry = unzipSync(bytes)[name];
  return entry === undefined ? undefined : strFromU8(entry);
}

function mark(overrides: Partial<DocxExportMark> & Pick<DocxExportMark, 'markId' | 'blockId' | 'kind' | 'standing'>): DocxExportMark {
  return {
    authorLabel: EDITOR_AUTHOR_LABEL,
    createdAt: '2026-09-22T08:00:00.000Z',
    body: '',
    replies: [],
    resolved: false,
    suggestion: null,
    ...overrides,
  };
}

/** Ten blocks of sample1's longer paragraphs, carrying one item of every class the export restores. */
const RICH: ComposedSource = {
  header: { block: 20 },
  body: [
    { runs: [{ span: { block: 8 } }] },
    { runs: [{ span: { block: 10, from: 0, to: 4 } }, { span: { block: 10, from: 4 }, bold: true }] },
    { runs: [{ span: { block: 13 } }], footnote: true },
    { runs: [{ span: { block: 14 } }], field: true },
    { runs: [{ span: { block: 15 } }], textBox: [{ block: 11 }, { block: 12 }] },
    { runs: [{ span: { block: 16 } }], drawing: true },
    { table: [[{ block: 19 }, { block: 21 }]] },
    { runs: [{ span: { block: 22, from: 0, to: 3 } }, { span: { block: 22, from: 3 } }], link: true },
    { runs: [{ span: { block: 25 } }] },
  ],
};

async function richInput(options: Partial<DocxExportInput> = {}): Promise<{ input: DocxExportInput; blocks: ParsedDocxBlock[]; original: Uint8Array }> {
  const path = join(sandbox, 'rich.docx');
  const original = await composeSource(path, RICH);
  const { blocks } = await parse(path);
  return {
    blocks,
    original,
    input: {
      title: '导出组稿',
      blocks: exportBlocks(blocks),
      marks: [],
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
      ...options,
    },
  };
}

describe('DOCX export restores the original', () => {
  it('writes an unedited manuscript back as the file it came from, every retained class restored', async () => {
    const { input, blocks, original } = await richInput();
    const result = renderDocxExport(input, { emit: true });
    expect(result.restoration).toBe('from-original');
    expect([result.restoredBlocks, result.regeneratedBlocks]).toEqual([blocks.length, 0]);
    expect(result.degraded).toBe(false);
    expect(result.fidelity.map((entry) => entry.key)).toEqual([
      'inline-styles', 'annotations', 'change-suggestions', 'editor-notes', 'notes', 'tables', 'images-captions', 'sections',
      'headers-footers', 'text-boxes', 'fields', 'file-revisions',
    ]);
    expect(fidelityOf(result.fidelity)).toEqual([
      ['inline-styles', 'preserved', 2, []],
      ['editor-notes', 'excluded', 0, []],
      ['notes', 'preserved', 1, []],
      ['tables', 'preserved', 1, []],
      ['images-captions', 'preserved', 1, []],
      ['sections', 'preserved', 1, []],
      ['headers-footers', 'preserved', 1, []],
      ['text-boxes', 'preserved', 1, []],
      ['fields', 'preserved', 1, []],
    ]);
    const written = result.bytes!;
    const reread = await parseBytes(written);
    expect(reread.blocks.map((block) => [block.kind, block.level, block.digest])).toEqual(blocks.map((block) => [block.kind, block.level, block.digest]));
    expect(reread.parsed.fidelity.map((category) => [category.key, category.count])).toEqual(
      (await parse(join(sandbox, 'rich.docx'))).parsed.fidelity.map((category) => [category.key, category.count]),
    );
    // File-level parts are the original's, byte for byte, and the package now names its comment-free body.
    const source = unzipSync(original);
    const output = unzipSync(written);
    for (const part of ['word/header1.xml', 'word/footnotes.xml', 'word/_rels/document.xml.rels', '_rels/.rels']) {
      expect(digest(output[part]!)).toBe(digest(source[part]!));
    }
    expect(output['word/comments.xml']).toBeUndefined();
    // The bold run of the second paragraph is still bold: the paragraph was restored, not regenerated.
    expect(partOf(written, 'word/document.xml')!.match(/<w:b\/>/g)).toHaveLength(1);
  });

  it('writes the same bytes for the same input, and reviews without writing exactly as it writes', async () => {
    const { input } = await richInput();
    const first = renderDocxExport(input, { emit: true });
    const second = renderDocxExport(input, { emit: true });
    const review = renderDocxExport(input, { emit: false });
    expect(digest(first.bytes!)).toBe(digest(second.bytes!));
    expect(review.bytes).toBeNull();
    expect(review.fidelity).toEqual(first.fidelity);
  });

  it('regenerates an edited paragraph from its properties and first run, and names what it could not keep', async () => {
    const { input, blocks } = await richInput();
    const replacement = await sourceSpanText(SOURCE, { block: 30 });
    const changed = input.blocks.map((block) => {
      if (block.position === 2 || block.position === 5 || block.position === 6) return edited(block, `${block.text}${replacement}`);
      if (block.position === 3 || block.position === 4) return edited(block, replacement);
      return block;
    });
    const result = renderDocxExport({ ...input, blocks: changed }, { emit: true });
    expect([result.restoredBlocks, result.regeneratedBlocks]).toEqual([blocks.length - 5, 5]);
    expect(result.degraded).toBe(true);
    expect(fidelityOf(result.fidelity)).toEqual([
      ['inline-styles', 'degraded', 2, [2]],
      ['editor-notes', 'excluded', 0, []],
      ['notes', 'degraded', 1, [3]],
      ['tables', 'preserved', 1, []],
      ['images-captions', 'degraded', 1, [6]],
      ['sections', 'preserved', 1, []],
      ['headers-footers', 'preserved', 1, []],
      ['text-boxes', 'degraded', 1, [5]],
      ['fields', 'degraded', 1, [4]],
    ]);
    const reread = await parseBytes(result.bytes!);
    expect(reread.blocks.map((block) => block.digest)).toEqual(changed.map((block) => block.digest));
    // The regenerated second paragraph kept its first run's properties — none — so no bold remains.
    expect(partOf(result.bytes!, 'word/document.xml')!.includes('<w:b/>')).toBe(false);
    expect(reread.parsed.textBoxes).toHaveLength(0);
  });

  it('strips the file\'s own revisions and comments to the reading the import took', async () => {
    const path = join(sandbox, 'revised.docx');
    await composeRevisedDocx(path, {
      source: SOURCE,
      title: '修订组稿',
      paragraphs: [
        { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 8, from: 10, to: 14 }, revision: { kind: 'del', author: AUTHOR, date: '2026-09-01T10:00:00Z' } }, { text: { block: 8, from: 14 } }] },
        { runs: [{ text: { block: 10, from: 0, to: 20 } }, { text: { block: 11, from: 0, to: 5 }, revision: { kind: 'ins', author: AUTHOR, date: '2026-09-01T10:01:00Z' } }, { text: { block: 10, from: 20 } }] },
        { runs: [{ text: { block: 15, from: 0, to: 10 } }, { comment: 'start', id: 1 }, { text: { block: 15, from: 10, to: 20 } }, { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }, { text: { block: 15, from: 20 } }] },
        { runs: [{ text: { block: 12 } }], formattingRevision: { author: AUTHOR, date: '2026-09-01T13:00:00Z' } },
      ],
      comments: [{ id: 1, author: AUTHOR, text: [{ block: 14, from: 0, to: 10 }] }],
    });
    const { parsed, blocks } = await parse(path);
    expect(parsed.importedMarks).toHaveLength(3);
    const original = new Uint8Array(await import('node:fs/promises').then((fs) => fs.readFile(path)));
    const result = renderDocxExport({
      title: '修订组稿',
      blocks: exportBlocks(blocks),
      marks: [],
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
    }, { emit: true });
    expect(result.restoredBlocks).toBe(blocks.length);
    const reread = await parseBytes(result.bytes!);
    expect(reread.blocks.map((block) => block.digest)).toEqual(blocks.map((block) => block.digest));
    expect(reread.parsed.importedMarks).toEqual([]);
    const documentXml = partOf(result.bytes!, 'word/document.xml')!;
    for (const markup of ['<w:ins ', '<w:del ', 'w:delText', 'commentRange', 'commentReference', 'w:pPrChange', 'w:rPrChange']) {
      expect(documentXml.includes(markup)).toBe(false);
    }
    expect(unzipSync(result.bytes!)['word/comments.xml']).toBeUndefined();
    expect(fidelityOf(result.fidelity).find(([key]) => key === 'file-revisions')).toEqual(['file-revisions', 'degraded', 2, []]);
  });
});

describe('DOCX export writes AI7\'s marks', () => {
  it('writes 批注 as comments with replies and 已处理, and 修改建议 as tracked changes, read back as the marks they were', async () => {
    const { input, blocks } = await richInput();
    const block = (position: number): DocxExportBlock => input.blocks[position - 1]!;
    const text = (position: number): string[] => graphemes(block(position).text);
    const proposal = await sourceSpanText(SOURCE, { block: 31, from: 0, to: 4 });
    const insertion = await sourceSpanText(SOURCE, { block: 32, from: 0, to: 3 });
    const marks: DocxExportMark[] = [
      mark({
        markId: 'annotation', blockId: block(1).blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 2, toGrapheme: 6 },
        authorLabel: AUTHOR, body: '请核对这一句。', replies: [{ body: '已核对。', createdAt: '2026-09-22T09:00:00.000Z' }], resolved: true,
      }),
      mark({
        markId: 'reviewer', blockId: block(9).blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 3 },
        authorLabel: REVIEWER, body: '用字前后不一。', createdAt: '2026-09-22T08:10:00.000Z',
      }),
      mark({
        markId: 'replace', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 },
        authorLabel: REVIEWER, suggestion: { currentText: text(10).slice(0, 2).join(''), proposedText: proposal }, createdAt: '2026-09-22T08:20:00.000Z',
      }),
      mark({
        markId: 'insert', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 6, toGrapheme: 6 },
        authorLabel: AUTHOR, suggestion: { currentText: '', proposedText: insertion }, createdAt: '2026-09-22T08:30:00.000Z',
      }),
      mark({
        markId: 'delete', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 9, toGrapheme: 11 },
        suggestion: { currentText: text(10).slice(9, 11).join(''), proposedText: '' }, createdAt: '2026-09-22T08:40:00.000Z',
      }),
      mark({
        markId: 'overlap', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 1, toGrapheme: 3 },
        suggestion: { currentText: text(10).slice(1, 3).join(''), proposedText: proposal }, createdAt: '2026-09-22T08:50:00.000Z',
      }),
      mark({
        markId: 'moved', blockId: block(8).blockId, kind: 'annotation', standing: { state: 'moved' }, body: '这条原文已改。',
      }),
      mark({
        markId: 'note', blockId: block(8).blockId, kind: 'editor-note', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 },
        authorLabel: EDITOR_NOTE_AUTHOR_LABEL, body: '二校时再看。',
      }),
    ];
    const result = renderDocxExport({ ...input, marks }, { emit: true });
    expect(result.written).toEqual({ annotations: 2, suggestions: 3, editorNotes: 0, replies: 1 });
    expect(fidelityOf(result.fidelity).filter(([key]) => ['annotations', 'change-suggestions', 'editor-notes'].includes(key))).toEqual([
      ['annotations', 'unavailable', 3, [8]],
      ['change-suggestions', 'unavailable', 4, [10]],
      ['editor-notes', 'excluded', 1, []],
    ]);
    // The marked paragraphs 1, 9 and 10 are regenerated; the hyperlink of paragraph 9 is what it lost.
    expect(result.regeneratedBlocks).toBe(3);
    expect(fidelityOf(result.fidelity).find(([key]) => key === 'inline-styles')).toEqual(['inline-styles', 'degraded', 2, [9]]);

    const reread = await parseBytes(result.bytes!);
    // The rejected reading of the written file is the manuscript's own text.
    expect(reread.blocks.map((entry) => entry.digest)).toEqual(blocks.map((entry) => entry.digest));
    const imported = reread.parsed.importedMarks.map((entry) => ({
      position: entry.blockPosition, from: entry.fromGrapheme, to: entry.toGrapheme, kind: entry.kind, origin: entry.origin,
      author: entry.authorLabel, status: entry.status, body: digest(entry.body), proposed: entry.proposedText === null ? null : digest(entry.proposedText),
    }));
    expect(imported).toEqual([
      { position: 1, from: 2, to: 6, kind: 'annotation', origin: 'comment', author: AUTHOR, status: 'resolved', body: digest(`请核对这一句。\n回复（${EDITOR_AUTHOR_LABEL}）：已核对。`), proposed: null },
      { position: 9, from: 0, to: 3, kind: 'annotation', origin: 'comment', author: REVIEWER, status: 'open', body: digest('用字前后不一。'), proposed: null },
      { position: 10, from: 0, to: 2, kind: 'change-suggestion', origin: 'replacement', author: REVIEWER, status: 'open', body: digest(''), proposed: digest(proposal) },
      { position: 10, from: 6, to: 6, kind: 'change-suggestion', origin: 'insertion', author: AUTHOR, status: 'open', body: digest(''), proposed: digest(insertion) },
      { position: 10, from: 9, to: 11, kind: 'change-suggestion', origin: 'deletion', author: EDITOR_AUTHOR_LABEL, status: 'open', body: digest(''), proposed: digest('') },
    ]);
    const comments = partOf(result.bytes!, 'word/comments.xml')!;
    expect(comments.includes(EDITOR_NOTE_AUTHOR_LABEL)).toBe(false);
    expect(partOf(result.bytes!, 'word/commentsExtended.xml')!.match(/w15:paraIdParent=/g)).toHaveLength(1);
    const types = partOf(result.bytes!, '[Content_Types].xml')!;
    expect(types.includes('wordprocessingml.comments+xml') && types.includes('wordprocessingml.commentsExtended+xml')).toBe(true);
    const relationships = partOf(result.bytes!, 'word/_rels/document.xml.rels')!;
    expect(relationships.includes('relationships/comments"') && relationships.includes('relationships/commentsExtended"') &&
      relationships.includes('rIdHeader1')).toBe(true);
  });

  it('writes 备注 only when the export includes them, as comments whose author is 备注', async () => {
    const { input } = await richInput();
    const note = mark({
      markId: 'note', blockId: input.blocks[0]!.blockId, kind: 'editor-note', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 },
      authorLabel: EDITOR_NOTE_AUTHOR_LABEL, body: '二校时再看。',
    });
    const without = renderDocxExport({ ...input, marks: [note] }, { emit: true });
    expect(without.written.editorNotes).toBe(0);
    expect(without.restoredBlocks).toBe(input.blocks.length);
    const withNotes = renderDocxExport({ ...input, marks: [note], options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, includeEditorNotes: true } }, { emit: true });
    expect(withNotes.written.editorNotes).toBe(1);
    expect(fidelityOf(withNotes.fidelity).find(([key]) => key === 'editor-notes')).toEqual(['editor-notes', 'preserved', 1, []]);
    const reread = await parseBytes(withNotes.bytes!);
    expect(reread.parsed.importedMarks.map((entry) => [entry.blockPosition, entry.kind, entry.authorLabel])).toEqual([[1, 'annotation', EDITOR_NOTE_AUTHOR_LABEL]]);
  });

  it('leaves out 批注 and 修改建议 the editor excluded, and restores their paragraphs', async () => {
    const { input } = await richInput();
    const marks = [
      mark({ markId: 'a', blockId: input.blocks[0]!.blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 }, body: '批注。' }),
      mark({
        markId: 's', blockId: input.blocks[1]!.blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 1 },
        suggestion: { currentText: graphemes(input.blocks[1]!.text)[0]!, proposedText: graphemes(input.blocks[2]!.text)[0]! },
      }),
    ];
    const result = renderDocxExport({ ...input, marks, options: { includeAnnotations: false, includeSuggestions: false, includeEditorNotes: false } }, { emit: true });
    expect(result.restoredBlocks).toBe(input.blocks.length);
    expect(result.degraded).toBe(false);
    expect(fidelityOf(result.fidelity).filter(([key]) => ['annotations', 'change-suggestions'].includes(key))).toEqual([
      ['annotations', 'excluded', 1, []],
      ['change-suggestions', 'excluded', 1, []],
    ]);
    expect(unzipSync(result.bytes!)['word/comments.xml']).toBeUndefined();
    expect(partOf(result.bytes!, 'word/document.xml')!.includes('<w:ins ')).toBe(false);
  });
});

describe('DOCX export of text boxes and fresh builds', () => {
  it('writes a text box merged at import as body paragraphs after its anchor, and no longer as a box', async () => {
    const path = join(sandbox, 'merged.docx');
    const original = await composeSource(path, {
      body: [
        { runs: [{ span: { block: 1 } }] },
        { runs: [{ span: { block: 2 } }], textBox: [{ block: 11 }, { block: 12 }] },
        { runs: [{ span: { block: 3 } }] },
      ],
    });
    const { parsed, blocks } = await parse(path);
    const box = parsed.textBoxes[0]!;
    // The manuscript as a merged import made it: the box's paragraphs right after the anchor.
    const merged: DocxExportBlock[] = [];
    const rows: DocxExportSourceRow[] = [];
    let position = 0;
    for (const block of blocks) {
      position += 1;
      merged.push({ ...exportBlocks([block])[0]!, position });
      rows.push({ blockId: block.blockId, sourcePart: 'body', sourceParagraphIndex: block.sourceParagraphIndex, sourceParagraphDigest: block.digest });
      if (block.sourceParagraphIndex === box.anchorParagraphIndex) {
        for (const paragraph of box.paragraphs) {
          position += 1;
          const blockId = `blk_${digest(`box${paragraph.sourceParagraphIndex}`).slice(0, 24)}`;
          merged.push({ blockId, position, kind: paragraph.kind, level: paragraph.level, text: paragraph.text, digest: paragraph.digest });
          rows.push({ blockId, sourcePart: 'text-box', sourceParagraphIndex: paragraph.sourceParagraphIndex, sourceParagraphDigest: paragraph.digest });
        }
      }
    }
    const result = renderDocxExport({
      title: '文本框组稿', blocks: merged, marks: [], options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'mapped', original, rows, textBoxes: 'merge' },
    }, { emit: true });
    expect(result.restoredBlocks).toBe(merged.length);
    expect(fidelityOf(result.fidelity)).toEqual([
      ['editor-notes', 'excluded', 0, []], ['sections', 'preserved', 1, []], ['text-boxes', 'preserved', 1, []],
    ]);
    const reread = await parseBytes(result.bytes!);
    expect(reread.parsed.textBoxes).toHaveLength(0);
    expect(reread.blocks.map((block) => block.digest)).toEqual(merged.map((block) => block.digest));
    expect(partOf(result.bytes!, 'word/document.xml')!.includes('txbxContent')).toBe(false);
  });

  it('writes a manuscript without a mapping fresh, with every class the file carried named 无法导出', async () => {
    const { input, original } = await richInput();
    const note = mark({
      markId: 'a', blockId: input.blocks[3]!.blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 1, toGrapheme: 3 }, body: '批注。',
    });
    const result = renderDocxExport({
      ...input,
      marks: [note],
      source: { kind: 'fresh', reason: 'no-mapping', scan: original, converter: null },
    }, { emit: true });
    expect(result.restoration).toBe('regenerated');
    expect([result.restoredBlocks, result.regeneratedBlocks]).toEqual([0, input.blocks.length]);
    expect(fidelityOf(result.fidelity).map(([key, status]) => [key, status])).toEqual([
      ['inline-styles', 'unavailable'],
      ['annotations', 'preserved'],
      ['editor-notes', 'excluded'],
      ['notes', 'unavailable'],
      ['tables', 'unavailable'],
      ['images-captions', 'unavailable'],
      ['sections', 'unavailable'],
      ['headers-footers', 'unavailable'],
      ['text-boxes', 'unavailable'],
      ['fields', 'unavailable'],
    ]);
    const reread = await parseBytes(result.bytes!);
    expect(reread.blocks.map((block) => block.digest)).toEqual(input.blocks.map((block) => block.digest));
    expect(reread.parsed.importedMarks.map((entry) => [entry.blockPosition, entry.fromGrapheme, entry.toGrapheme, entry.kind])).toEqual([[4, 1, 3, 'annotation']]);
    const names = Object.keys(unzipSync(result.bytes!));
    expect(names).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml',
      'word/comments.xml', 'word/commentsExtended.xml',
    ]);
  });

  it('writes a heading block fresh in a style the parser reads back as the same heading', async () => {
    const text = await sourceSpanText(SOURCE, { block: 1 });
    const blocks: DocxExportBlock[] = [
      { blockId: 'blk_000000000000000000000001', position: 1, kind: 'heading', level: 2, text, digest: blockDigest('heading', 2, text) },
      { blockId: 'blk_000000000000000000000002', position: 2, kind: 'title', level: 1, text, digest: blockDigest('title', 1, text) },
    ];
    const result = renderDocxExport({
      title: '标题组稿', blocks, marks: [], options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'fresh', reason: 'converted', scan: null, converter: 'ai7-text-to-docx/1' },
    }, { emit: true });
    const reread = await parseBytes(result.bytes!);
    expect(reread.blocks.map((block) => [block.kind, block.level, block.digest])).toEqual(blocks.map((block) => [block.kind, block.level, block.digest]));
    expect(reread.parsed.titleSuggestion.value).toBe('标题组稿');
  });

  it('refuses a Revision without blocks and a mapping that names one source paragraph twice', async () => {
    const { input } = await richInput();
    expect(() => renderDocxExport({ ...input, blocks: [] }, { emit: true })).toThrow(DocxExportError);
    const rows = [...(input.source as Extract<DocxExportInput['source'], { kind: 'mapped' }>).rows];
    rows[1] = { ...rows[1]!, sourceParagraphIndex: rows[0]!.sourceParagraphIndex };
    expect(() => renderDocxExport({ ...input, source: { ...(input.source as Extract<DocxExportInput['source'], { kind: 'mapped' }>), rows } }, { emit: true }))
      .toThrow(DocxExportError);
  });
});
