import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
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
import { renderMarkdownExport, renderPdfHtmlExport } from '../../src/service/text-export.js';
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
      /** A bookmark of this name around the paragraph's runs, the way a table of contents marks a heading. */
      bookmark?: string;
      /** Raw markup before and after the paragraph's runs: a bookmark half, alone or in a tracked insertion. */
      before?: string;
      after?: string;
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
  if (item.bookmark !== undefined) {
    runs.unshift(`<w:bookmarkStart w:id="0" w:name="${item.bookmark}"/>`);
    runs.push('<w:bookmarkEnd w:id="0"/>');
  }
  if (item.before !== undefined) runs.unshift(item.before);
  if (item.after !== undefined) runs.push(item.after);
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
  const archive = zipSync(entries, { level: 6, mtime: fixedArchiveTime() });
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

describe('a regenerated paragraph keeps its bookmarks', () => {
  it('writes an edited paragraph’s bookmark around its text, so a link to it still lands', async () => {
    const path = join(sandbox, 'bookmarks.docx');
    const original = await composeSource(path, { body: [{ runs: [{ span: { block: 3 } }], bookmark: 'mark' }, { runs: [{ span: { block: 4 } }], link: true }] });
    const { blocks } = await parse(path);
    const input: DocxExportInput = {
      title: '书签',
      blocks: exportBlocks(blocks).map((block, index) => index === 0 ? edited(block, `${block.text}（改）`) : block),
      marks: [],
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
    };
    const result = renderDocxExport(input, { emit: true });
    expect([result.restoredBlocks, result.regeneratedBlocks]).toEqual([1, 1]);
    const document = partOf(result.bytes!, 'word/document.xml')!;
    const start = document.indexOf('<w:bookmarkStart w:id="0" w:name="mark"/>');
    const text = document.indexOf('（改）');
    const end = document.indexOf('<w:bookmarkEnd w:id="0"/>');
    expect(start >= 0 && start < text && text < end).toBe(true);
    expect(document.split('w:name="mark"').length).toBe(2);
    expect(document).toContain('w:anchor="mark"');
  });

  it('never writes half a bookmark whose other half stood in a tracked insertion (Issue #537)', async () => {
    const inserted = async (half: string) =>
      `<w:ins w:id="101" w:author="${AUTHOR}" w:date="2026-09-01T00:00:00Z">${half}${await runXml({ span: { block: 5, from: 0, to: 4 } })}</w:ins>`;
    const start = '<w:bookmarkStart w:id="7" w:name="split"/>';
    const end = '<w:bookmarkEnd w:id="7"/>';
    const halves = (document: string) => [document.includes('w:id="7" w:name="split"'), document.includes('<w:bookmarkEnd w:id="7"/>')];
    // A restored paragraph drops its insertion whole, the reading the import took; the edited, regenerated one writes
    // its own half. Either way round, and with the insertion in the regenerated paragraph instead, no half is left.
    const cases: Array<[string, ComposedBodyItem[], number]> = [
      ['start inserted in the restored paragraph', [{ runs: [{ span: { block: 3 } }], before: await inserted(start) }, { runs: [{ span: { block: 4 } }], after: end }], 1],
      ['end inserted in the restored paragraph', [{ runs: [{ span: { block: 3 } }], before: start }, { runs: [{ span: { block: 4 } }], after: await inserted(end) }], 0],
      ['start inserted in the regenerated paragraph', [{ runs: [{ span: { block: 3 } }], before: await inserted(start) }, { runs: [{ span: { block: 4 } }], after: end }], 0],
    ];
    for (const [name, body, editedIndex] of cases) {
      const path = join(sandbox, `${name}.docx`);
      const original = await composeSource(path, { body });
      const { blocks } = await parse(path);
      const result = renderDocxExport({
        title: '书签',
        blocks: exportBlocks(blocks).map((block, index) => index === editedIndex ? edited(block, `${block.text}（改）`) : block),
        marks: [],
        options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
        source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
      }, { emit: true });
      expect([name, result.restoredBlocks, result.regeneratedBlocks]).toEqual([name, 1, 1]);
      expect([name, ...halves(partOf(result.bytes!, 'word/document.xml')!)]).toEqual([name, false, false]);
    }
  });

  it('keeps a bookmark half that stands in a bidirectional run of a regenerated paragraph, as the reading does (Issue #537)', async () => {
    const run = await runXml({ span: { block: 5, from: 0, to: 4 } });
    for (const container of ['dir', 'bdo']) {
      const path = join(sandbox, `bidi-${container}.docx`);
      const original = await composeSource(path, { body: [
        { runs: [{ span: { block: 3 } }], before: `<w:${container} w:val="rtl"><w:bookmarkStart w:id="9" w:name="bidi"/>${run}</w:${container}>` },
        { runs: [{ span: { block: 4 } }], after: '<w:bookmarkEnd w:id="9"/>' },
      ] });
      const { blocks } = await parse(path);
      const result = renderDocxExport({
        title: '书签',
        blocks: exportBlocks(blocks).map((block, index) => index === 0 ? edited(block, `${block.text}（改）`) : block),
        marks: [],
        options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
        source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
      }, { emit: true });
      expect([container, result.restoredBlocks, result.regeneratedBlocks]).toEqual([container, 1, 1]);
      // The regenerated paragraph writes its start; the restored one keeps its end: the pair stays whole.
      const document = partOf(result.bytes!, 'word/document.xml')!;
      expect([container, document.includes('w:id="9" w:name="bidi"'), document.includes('<w:bookmarkEnd w:id="9"/>')]).toEqual([container, true, true]);
    }
  });
});

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

describe('DOCX export of a table\'s own revisions (Issue #411)', () => {
  // The import reads a row or cell inserted as a whole as the paragraphs it held — left out of the manuscript, their
  // words described in 批注 — and one deleted as a whole as paragraphs kept. The export writes the same reading.
  it('leaves out a row, a cell or a table inserted whole, keeps one deleted, and never leaves a cell without a paragraph', async () => {
    const path = join(sandbox, 'table-revised.docx');
    const at = (minute: number) => ({ author: AUTHOR, date: `2026-09-01T14:${String(minute).padStart(2, '0')}:00Z` });
    await composeRevisedDocx(path, {
      source: SOURCE,
      title: '表格修订组稿',
      paragraphs: [
        { runs: [{ text: { block: 7 } }] },
        {
          table: [
            { cells: [{ paragraphs: [{ runs: [{ text: { block: 8 } }] }] }, { revision: { kind: 'cellIns', ...at(0) }, paragraphs: [{ runs: [{ text: { block: 9 } }] }] }] },
            { revision: { kind: 'ins', ...at(1) }, cells: [{ paragraphs: [{ runs: [{ text: { block: 6 } }] }] }] },
            { revision: { kind: 'del', ...at(2) }, cells: [{ paragraphs: [{ runs: [{ text: { block: 11 } }] }] }] },
            { cells: [{ revision: { kind: 'cellDel', ...at(3) }, paragraphs: [{ runs: [{ text: { block: 12 } }] }] }, { revision: { kind: 'cellMerge', ...at(4) }, paragraphs: [] }] },
            // A cell whose one paragraph is an inserted, empty paragraph mark: the export drops the paragraph, not the cell.
            { cells: [{ paragraphs: [{ runs: [], markRevision: { kind: 'ins', ...at(5) } }] }] },
          ],
        },
        { table: [{ revision: { kind: 'ins', ...at(6) }, cells: [{ paragraphs: [{ runs: [{ text: { block: 14 } }] }] }] }] },
        { runs: [{ text: { block: 13 } }] },
      ],
    });
    const { parsed, blocks } = await parse(path);
    // The manuscript: the inserted cell, row and table are not in it; the deleted row and cell are.
    expect(blocks).toHaveLength(5);
    expect(parsed.importedMarks.map((entry) => entry.origin))
      .toEqual(['paragraph-insertion', 'paragraph-insertion', 'paragraph-deletion', 'paragraph-deletion', 'paragraph-insertion']);
    const original = new Uint8Array(await import('node:fs/promises').then((fs) => fs.readFile(path)));
    const result = renderDocxExport({
      title: '表格修订组稿',
      blocks: exportBlocks(blocks),
      marks: [],
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'mapped', original, rows: bodyRows(blocks), textBoxes: 'retain' },
    }, { emit: true });
    expect(result.restoredBlocks).toBe(blocks.length);
    // The written file reads back as the manuscript: the same blocks, and no revision or mark left in it.
    const reread = await parseBytes(result.bytes!);
    expect(reread.blocks.map((block) => block.digest)).toEqual(blocks.map((block) => block.digest));
    expect(reread.parsed.importedMarks).toEqual([]);
    const documentXml = partOf(result.bytes!, 'word/document.xml')!;
    for (const markup of ['cellIns', 'cellDel', 'cellMerge', '<w:ins ', '<w:del ']) expect(documentXml.includes(markup)).toBe(false);
    // One table is left, of four rows: the first without its inserted cell, the deleted row, the row of the deleted and
    // merged cells, and the row whose cell kept an empty paragraph. The table inserted whole is gone.
    expect(documentXml.match(/<w:tbl>/gu)).toHaveLength(1);
    expect(documentXml.match(/<w:tr>/gu)).toHaveLength(4);
    const cells = documentXml.match(/<w:tc>[\s\S]*?<\/w:tc>/gu) ?? [];
    expect(cells).toHaveLength(5);
    expect(cells.every((cell) => /<w:p[\s>/]/u.test(cell))).toBe(true);
    // The merge changed no text and became no mark: it is the one revision of the file the export does not carry.
    expect(fidelityOf(result.fidelity).find(([key]) => key === 'file-revisions')).toEqual(['file-revisions', 'degraded', 1, []]);
    expect(result.fidelity.find((entry) => entry.key === 'tables')).toMatchObject({ count: 1, status: 'preserved' });
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

  it('says why a mapped original is written fresh when AI7 cannot restore it in place, apart from having no mapping', async () => {
    const { input, original } = await richInput();
    const unprefixed = renderDocxExport({ ...input, source: { kind: 'fresh', reason: 'unprefixed', scan: original, converter: null } }, { emit: false });
    const unmapped = renderDocxExport({ ...input, source: { kind: 'fresh', reason: 'no-mapping', scan: original, converter: null } }, { emit: false });
    const detail = (result: typeof unprefixed) => result.fidelity.find((entry) => entry.key === 'tables')?.detail;
    expect(detail(unprefixed)).toBe('原文件的 XML 写法 AI7 无法在原处恢复，导出按稿件文字重新生成 DOCX；表格无法恢复。');
    expect(detail(unmapped)).toBe('这份稿件导入时还没有建立来源段落对应，导出按稿件文字重新生成 DOCX；表格无法恢复。');
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

// ---- PDF and the Markdown 备用格式 (Issue #500, plan slice S64b) ----------------------------------------------

/** Markdown's own escaping, restated: every character Markdown or CriticMarkup reads as syntax. */
function md(value: string): string {
  return value.replace(/[\\`*_[\]<>{}|~&#]/gu, (character) => `\\${character}`);
}

function html(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

/**
 * The rich source laid out with a title, a heading and a heading deeper than Markdown's six levels, and the marks of
 * the DOCX test above plus a 批注 whose last words fall inside a 修改建议 and a 备注 the default leaves out.
 */
async function laidOutInput(): Promise<{ input: DocxExportInput; proposal: string; insertion: string; tenth: string[] }> {
  const { input } = await richInput();
  const blocks = input.blocks.map((block, index): DocxExportBlock => index === 0
    ? { ...block, kind: 'title', level: 1 }
    : index === 1 ? { ...block, kind: 'heading', level: 1 } : index === 2 ? { ...block, kind: 'heading', level: 6 } : block);
  const block = (position: number): DocxExportBlock => blocks[position - 1]!;
  const tenth = graphemes(block(10).text);
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
      authorLabel: REVIEWER, suggestion: { currentText: tenth.slice(0, 2).join(''), proposedText: proposal }, createdAt: '2026-09-22T08:20:00.000Z',
    }),
    mark({
      markId: 'insert', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 6, toGrapheme: 6 },
      authorLabel: AUTHOR, suggestion: { currentText: '', proposedText: insertion }, createdAt: '2026-09-22T08:30:00.000Z',
    }),
    mark({
      markId: 'delete', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 9, toGrapheme: 11 },
      suggestion: { currentText: tenth.slice(9, 11).join(''), proposedText: '' }, createdAt: '2026-09-22T08:40:00.000Z',
    }),
    mark({
      markId: 'overlap', blockId: block(10).blockId, kind: 'change-suggestion', standing: { state: 'exact', fromGrapheme: 1, toGrapheme: 3 },
      suggestion: { currentText: tenth.slice(1, 3).join(''), proposedText: proposal }, createdAt: '2026-09-22T08:50:00.000Z',
    }),
    mark({
      markId: 'inside', blockId: block(10).blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 7, toGrapheme: 10 },
      body: '这几个字要再看。', createdAt: '2026-09-22T09:10:00.000Z',
    }),
    mark({ markId: 'moved', blockId: block(8).blockId, kind: 'annotation', standing: { state: 'moved' }, body: '这条原文已改。' }),
    mark({
      markId: 'note', blockId: block(8).blockId, kind: 'editor-note', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 },
      authorLabel: EDITOR_NOTE_AUTHOR_LABEL, body: '二校时再看。',
    }),
  ];
  return { input: { ...input, blocks, marks }, proposal, insertion, tenth };
}

/** Every class of the rich source, left behind by a format that writes only the manuscript's words. */
const RICH_TEXT_FIDELITY: Array<[string, string, number, number[]]> = [
  ['inline-styles', 'unavailable', 2, []],
  ['annotations', 'unavailable', 4, [8]],
  ['change-suggestions', 'unavailable', 4, [10]],
  ['editor-notes', 'excluded', 1, []],
  ['notes', 'unavailable', 1, []],
  ['tables', 'unavailable', 1, []],
  ['images-captions', 'unavailable', 1, []],
  ['sections', 'unavailable', 1, []],
  ['headers-footers', 'unavailable', 1, []],
  ['text-boxes', 'unavailable', 1, []],
  ['fields', 'unavailable', 1, []],
];

describe('PDF and the Markdown 备用格式 lay the version out from its words', () => {
  it('writes Markdown with headings by level, 批注 as footnotes in reading order and 修改建议 as CriticMarkup, 备注 left out', async () => {
    const { input, proposal, insertion, tenth } = await laidOutInput();
    const result = renderMarkdownExport(input, { emit: true });
    expect(result.written).toEqual({ annotations: 3, suggestions: 3, editorNotes: 0, replies: 1 });
    expect(fidelityOf(result.fidelity)).toEqual(RICH_TEXT_FIDELITY);
    expect(result.degraded).toBe(true);

    const text = new TextDecoder().decode(result.bytes!);
    expect(text.endsWith('\n') && !text.endsWith('\n\n')).toBe(true);
    const parts = text.slice(0, -1).split('\n\n');
    const [body, notes] = [parts.slice(0, input.blocks.length), parts.slice(input.blocks.length)];
    expect(body.map((part) => /^#+ /u.exec(part)?.[0] ?? '')).toEqual(['# ', '## ', '###### ', '', '', '', '', '', '', '']);
    // The title's 批注 follows its words; its block is the manuscript's words, escaped, and nothing more.
    const first = graphemes(input.blocks[0]!.text);
    expect(digest(body[0]!)).toBe(digest(`# ${md(first.slice(0, 6).join(''))}[^1]${md(first.slice(6).join(''))}`));
    // The changed words stand in the text; the reference of a 批注 ending inside a change follows the change.
    expect(digest(body[9]!)).toBe(digest(
      `{~~${md(tenth.slice(0, 2).join(''))}~>${md(proposal)}~~}[^3]${md(tenth.slice(2, 6).join(''))}{++${md(insertion)}++}[^4]` +
      `${md(tenth.slice(6, 9).join(''))}{--${md(tenth.slice(9, 11).join(''))}--}[^5][^6]${md(tenth.slice(11).join(''))}`,
    ));
    // The overlapping 修改建议 and the 批注 whose words changed are left out and counted; the 备注 is not written.
    expect(notes.map((note) => note.replace(/^(\[\^\d+\]: \S+).*$/su, '$1'))).toEqual([
      '[^1]: 批注', '[^2]: 批注', '[^3]: 修改建议', '[^4]: 修改建议', '[^5]: 修改建议', '[^6]: 批注',
    ]);
    expect(notes[0]).toBe(`[^1]: 批注 · ${AUTHOR} · 2026-09-22 · 已处理：请核对这一句。\n    回复 · 2026-09-22：已核对。`);
    expect(notes[1]).toBe(`[^2]: 批注 · ${REVIEWER} · 2026-09-22：用字前后不一。`);
    expect(digest(notes[2]!)).toBe(digest(`[^3]: 修改建议 · ${REVIEWER} · 2026-09-22：「${md(tenth.slice(0, 2).join(''))}」改为「${md(proposal)}」`));
    expect(digest(notes[3]!)).toBe(digest(`[^4]: 修改建议 · ${AUTHOR} · 2026-09-22：「」改为「${md(insertion)}」`));
    expect(digest(notes[4]!)).toBe(digest(`[^5]: 修改建议 · ${EDITOR_AUTHOR_LABEL} · 2026-09-22：「${md(tenth.slice(9, 11).join(''))}」改为「」`));
    expect(notes[5]).toBe(`[^6]: 批注 · ${EDITOR_AUTHOR_LABEL} · 2026-09-22：这几个字要再看。`);
    expect(text.includes('二校时再看。') || text.includes('这条原文已改。')).toBe(false);
  });

  it('lays out the PDF\'s page: a title, headings, deleted and inserted words with numbered notes at the end, and nothing to load', async () => {
    const { input, proposal, insertion, tenth } = await laidOutInput();
    const result = renderPdfHtmlExport(input, { emit: true });
    expect(result.written).toEqual({ annotations: 3, suggestions: 3, editorNotes: 0, replies: 1 });
    const page = new TextDecoder().decode(result.bytes!);
    expect(page.startsWith('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">')).toBe(true);
    expect(page).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`);
    expect(page).toContain('@page{size:A4;');
    expect(page).not.toMatch(/<script|<img|<link|<iframe|url\(|https?:/iu);
    expect([page.match(/<h1 class="book-title">/gu)?.length, page.match(/<h2>/gu)?.length, page.match(/<h6>/gu)?.length, page.match(/<p>/gu)?.length])
      .toEqual([1, 2, 1, 7]);
    const paragraphs = [...page.matchAll(/<p>(.*?)<\/p>/gu)].map((match) => match[1]!);
    expect(digest(paragraphs.at(-1)!)).toBe(digest(
      `<del>${html(tenth.slice(0, 2).join(''))}</del><ins>${html(proposal)}</ins><sup class="note-ref">3</sup>${html(tenth.slice(2, 6).join(''))}` +
      `<ins>${html(insertion)}</ins><sup class="note-ref">4</sup>${html(tenth.slice(6, 9).join(''))}<del>${html(tenth.slice(9, 11).join(''))}</del>` +
      `<sup class="note-ref">5</sup><sup class="note-ref">6</sup>${html(tenth.slice(11).join(''))}`,
    ));
    const notes = page.slice(page.indexOf('<section class="notes">'));
    expect(notes.startsWith('<section class="notes"><h2>批注与修改建议</h2><ol>')).toBe(true);
    expect([...notes.matchAll(/<li value="(\d+)"><span class="note-kind">([^<]+)<\/span>/gu)].map((match) => `${match[1]} ${match[2]}`))
      .toEqual(['1 批注', '2 批注', '3 修改建议', '4 修改建议', '5 修改建议', '6 批注']);
    expect(notes).toContain(`<li value="1"><span class="note-kind">批注</span> · ${AUTHOR} · 2026-09-22 · 已处理：请核对这一句。` +
      '<p class="note-reply">回复 · 2026-09-22：已核对。</p></li>');
    expect(page.includes('二校时再看。') || page.includes('这条原文已改。')).toBe(false);

    // A manuscript without marks has no notes section.
    const bare = new TextDecoder().decode(renderPdfHtmlExport({ ...input, marks: [] }, { emit: true }).bytes!);
    expect(bare.includes('<section class="notes">')).toBe(false);
  });

  it('writes the same bytes for the same input, and reviews without writing exactly as it writes', async () => {
    const { input } = await laidOutInput();
    for (const render of [renderMarkdownExport, renderPdfHtmlExport]) {
      const first = render(input, { emit: true });
      const second = render(input, { emit: true });
      const review = render(input, { emit: false });
      expect(digest(first.bytes!)).toBe(digest(second.bytes!));
      expect(review.bytes).toBeNull();
      expect([review.fidelity, review.degraded, review.written]).toEqual([first.fidelity, first.degraded, first.written]);
    }
  });

  it('keeps words that Markdown or HTML would read as syntax as words, and a line break as one', async () => {
    const probe = (position: number, text: string, kind: DocxExportBlock['kind'] = 'paragraph', level: number | null = null): DocxExportBlock =>
      ({ blockId: `blk_${String(position).padStart(24, '0')}`, position, kind, level, text, digest: blockDigest(kind, level, text) });
    // Authored probes, not manuscript words: each opens a construct if written as it stands.
    const blocks = [
      probe(1, '<组稿> & 标题 #', 'title', 1),
      probe(2, '上\n下', 'heading', 2),
      probe(3, '1. 条目'),
      probe(4, '> 引文'),
      probe(5, '- 列表'),
      probe(6, '+ 加号'),
      probe(7, '= 等号'),
      probe(8, '*强调* _下划_ `代码` [链接](地址) <b> {++加++} ~~删~~ a|b \\ & #'),
      probe(9, '第一行\n# 第二行\n\n  缩进'),
    ];
    const note = mark({
      markId: 'a', blockId: blocks[2]!.blockId, kind: 'annotation', standing: { state: 'exact', fromGrapheme: 0, toGrapheme: 2 },
      body: '第一句*\n- 第二句\n\n1. 第三句',
    });
    const input: DocxExportInput = {
      title: '<组稿>', blocks, marks: [note], options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
      source: { kind: 'fresh', reason: 'converted', scan: null, converter: 'ai7-text-to-docx/1' },
    };
    const markdown = new TextDecoder().decode(renderMarkdownExport(input, { emit: true }).bytes!).split('\n\n');
    expect(markdown.slice(0, 9)).toEqual([
      '# \\<组稿\\> \\& 标题 \\#',
      '### 上 下',
      '1\\.[^1] 条目',
      '\\> 引文',
      '\\- 列表',
      '\\+ 加号',
      '\\= 等号',
      '\\*强调\\* \\_下划\\_ \\`代码\\` \\[链接\\](地址) \\<b\\> \\{++加++\\} \\~\\~删\\~\\~ a\\|b \\\\ \\& \\#',
      '第一行\\\n\\# 第二行\\\n\\\n&#32;&#32;缩进',
    ]);
    expect(markdown.slice(9).join('\n\n')).toBe(`[^1]: 批注 · ${EDITOR_AUTHOR_LABEL} · 2026-09-22：第一句\\*\n    \\- 第二句\n    \n    1\\. 第三句\n`);

    const page = new TextDecoder().decode(renderPdfHtmlExport(input, { emit: true }).bytes!);
    expect(page).toContain('<title>&lt;组稿&gt;</title>');
    expect(page).toContain('<h1 class="book-title">&lt;组稿&gt; &amp; 标题 #</h1><h3>上<br>下</h3><p>1.<sup class="note-ref">1</sup> 条目</p>');
    expect(page).toContain('<p>第一行<br># 第二行<br><br>  缩进</p>');
    expect(page).toContain('第一句*<br>- 第二句<br><br>1. 第三句</li>');
  });

  it('names every class of the source the format leaves behind, and what the marks keep in each format', async () => {
    const { input } = await laidOutInput();
    const pdf = renderPdfHtmlExport(input, { emit: false });
    expect(fidelityOf(pdf.fidelity)).toEqual(RICH_TEXT_FIDELITY);
    const detail = (rows: ReadonlyArray<ExportFidelityRowProjection>, key: string): string => rows.find((row) => row.key === key)!.detail;
    expect(detail(pdf.fidelity, 'sections')).toBe('原文件中的分节与页面设置不带入（1 处）；PDF 按 A4 纸张排版。');
    expect(detail(pdf.fidelity, 'annotations'))
      .toBe('3 条批注在正文中标出编号，连同作者、日期与回复列在文末；PDF 中不能再回复或标为已处理。1 条所在的文字已变化，无法导出。');
    const markdown = renderMarkdownExport(input, { emit: false });
    expect(detail(markdown.fidelity, 'change-suggestions'))
      .toBe('3 条待处理的修改建议写成 CriticMarkup 标记，作者与日期写在脚注里；Markdown 中不能接受或拒绝。1 条原文已变化或与其他修改建议重叠，无法导出。');
    expect(detail(markdown.fidelity, 'tables')).toBe('原文件中的表格不随 Markdown 导出（1 个）。');

    // Written without a loss, a mark is 降级导出: its words are kept, not what the editor can do with it.
    const writable = input.marks.filter((entry) => !['overlap', 'moved'].includes(entry.markId));
    const withNotes = renderMarkdownExport({ ...input, marks: writable, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, includeEditorNotes: true } }, { emit: true });
    expect(fidelityOf(withNotes.fidelity).filter(([key]) => ['annotations', 'change-suggestions', 'editor-notes'].includes(key))).toEqual([
      ['annotations', 'degraded', 3, []],
      ['change-suggestions', 'degraded', 3, []],
      ['editor-notes', 'degraded', 1, []],
    ]);
    expect(withNotes.written.editorNotes).toBe(1);
    expect(new TextDecoder().decode(withNotes.bytes!)).toContain(`: ${EDITOR_NOTE_AUTHOR_LABEL} · 2026-09-22：二校时再看。`);

    // Text boxes merged at import are body paragraphs, written as such.
    const merged = renderMarkdownExport({ ...input, source: { ...(input.source as Extract<DocxExportInput['source'], { kind: 'mapped' }>), textBoxes: 'merge' } }, { emit: false });
    expect(fidelityOf(merged.fidelity).find(([key]) => key === 'text-boxes')).toEqual(['text-boxes', 'preserved', 1, []]);

    // A source with nothing beyond its words, and marks the editor left out: nothing is lost, nothing is degraded.
    const plain = renderPdfHtmlExport({
      ...input, options: { includeAnnotations: false, includeSuggestions: false, includeEditorNotes: false },
      source: { kind: 'fresh', reason: 'converted', scan: null, converter: 'ai7-text-to-docx/1' },
    }, { emit: false });
    expect(fidelityOf(plain.fidelity)).toEqual([['annotations', 'excluded', 4, []], ['change-suggestions', 'excluded', 4, []], ['editor-notes', 'excluded', 1, []]]);
    expect(plain.degraded).toBe(false);
  });
});
