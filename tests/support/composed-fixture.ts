import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { LOCAL_ONLY_HEADING_DOCX, localOnlyPath } from './local-only-manuscripts.js';
import { buildSyntheticDocx, type SyntheticDocxParagraph } from './synthetic-docx.js';

// Composed manuscript fixtures for tests whose subject is manuscript content. The builder assembles a
// DOCX at test time from a contiguous excerpt of an admitted Public SampleBook (ADR 0043), read
// through the product's own parser, so a test that reads block text back runs on real prose instead of
// invented text. Nothing leaves `SampleBooks/`: the bytes are returned and written only to the path the
// calling test names under its own temporary root, and a test speaks of the source, the block range,
// and digests and counts rather than of any excerpt's text. A test whose subject is the DOCX container
// itself keeps `./synthetic-docx.js`.

/**
 * The one admitted DOCX Public SampleBook after ADR 0079 §5 narrowed the repository to exact
 * `sample1`: the ADR 0044 compatibility baseline, 97 blocks at parser identity
 * `ai7-docx-fflate-saxes/1` and `/2` alike, as the import-verdict table in `SampleBooks/README.md` records. Every
 * composed fixture excerpts it, and the composed container never reproduces its digest.
 */
export const ADMITTED_BASELINE_DOCX = 'sample1.docx';

/**
 * A local-only source, admitted to no repository fixture. Only a case whose subject exact `sample1`
 * cannot be — real heading styles, which `sample1` carries none of — reaches for one, and it skips
 * wherever the material is absent (`./local-only-manuscripts.js`).
 */
export const LOCAL_ONLY_HEADING_SOURCE = LOCAL_ONLY_HEADING_DOCX;

const SAMPLE_BOOKS_ROOT = fileURLToPath(new URL('../../SampleBooks/', import.meta.url));

/** The admitted file itself. Reading it is what ADR 0043 admitted it for; copying it is not admitted. */
export function admittedSourcePath(source: string): string {
  return source === LOCAL_ONLY_HEADING_SOURCE.name
    ? localOnlyPath(LOCAL_ONLY_HEADING_SOURCE)
    : join(SAMPLE_BOOKS_ROOT, source);
}

/**
 * One parse per admitted file per process. The pending promise is what is memoized, so callers that
 * ask for the same source before the first parse settles share it rather than starting a second.
 */
const sourceBlocks = new Map<string, Promise<readonly ParsedDocxBlock[]>>();

function blocksOf(source: string): Promise<readonly ParsedDocxBlock[]> {
  const pending = sourceBlocks.get(source);
  if (pending !== undefined) return pending;
  const path = admittedSourcePath(source);
  const started = (async () => {
    const blocks: ParsedDocxBlock[] = [];
    await parseDocx(path, basename(path), (block) => blocks.push(block));
    return blocks;
  })();
  sourceBlocks.set(source, started);
  return started;
}

/**
 * Content a composed package may carry beyond plain paragraphs (ADR 0086), every word of it still taken
 * from the admitted source: a text box whose paragraphs are the source's blocks, a field whose displayed
 * text is one excerpt block's own, and a footnote whose note is a source block.
 */
export interface ComposedRetentionContent {
  /**
   * A text box anchored at the end of the excerpt's `anchorBlock`-th paragraph (1-based within the
   * excerpt), holding the source's blocks `[sourceStartBlock, sourceStartBlock + blocks)`, written the way
   * Word writes one: DrawingML in `mc:Choice` and the same paragraphs in VML in `mc:Fallback`.
   */
  readonly textBox?: { readonly anchorBlock: number; readonly sourceStartBlock: number; readonly blocks: number };
  /** The excerpt's `block`-th paragraph displayed through a simple field, so its text stays what it was. */
  readonly field?: { readonly block: number };
  /** A footnote reference after the excerpt's `block`-th paragraph, whose note is the source's `noteSourceBlock`. */
  readonly footnote?: { readonly block: number; readonly noteSourceBlock: number };
}

export interface ComposedManuscriptRequest {
  /** Exact file name: the admitted constant above, or a local-only source a gated case names. */
  readonly source: string;
  /** 1-based position of the excerpt's first block in the source. */
  readonly startBlock: number;
  /** Length of the contiguous excerpt `[startBlock, startBlock + blocks)`. */
  readonly blocks: number;
  /** `dc:title` of the composed package. Test-authored: no title is ever taken from the source. */
  readonly title: string;
  readonly retention?: ComposedRetentionContent;
}

function paragraphOf(block: ParsedDocxBlock): SyntheticDocxParagraph {
  if (block.kind === 'paragraph') return { text: block.text };
  return { text: block.text, style: block.kind === 'title' ? 'Title' : `Heading${block.level ?? 1}` };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const WPS = 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const V = 'xmlns:v="urn:schemas-microsoft-com:vml"';

function styledParagraphXml(paragraph: SyntheticDocxParagraph, runs: string): string {
  const style = paragraph.style === undefined ? '' : `<w:pPr><w:pStyle w:val="${escapeXml(paragraph.style)}"/></w:pPr>`;
  return `<w:p>${style}${runs}</w:p>`;
}

/** The composed `word/document.xml` with the retention content, and the footnotes part it needs. */
function retentionParts(
  excerpt: ReadonlyArray<ParsedDocxBlock>,
  available: ReadonlyArray<ParsedDocxBlock>,
  retention: ComposedRetentionContent,
): Record<string, Uint8Array> {
  const range = (start: number, count: number): ReadonlyArray<ParsedDocxBlock> => {
    if (start < 1 || count < 1 || start + count - 1 > available.length) throw new Error('composed retention content out of range');
    return available.slice(start - 1, start + count - 1);
  };
  const inExcerpt = (block: number): void => {
    if (block < 1 || block > excerpt.length) throw new Error('composed retention anchor outside the excerpt');
  };
  const box = retention.textBox;
  if (box !== undefined) inExcerpt(box.anchorBlock);
  if (retention.field !== undefined) inExcerpt(retention.field.block);
  if (retention.footnote !== undefined) inExcerpt(retention.footnote.block);
  const boxParagraphs = box === undefined ? '' : range(box.sourceStartBlock, box.blocks)
    .map((block) => styledParagraphXml(paragraphOf(block), `<w:r><w:t>${escapeXml(block.text)}</w:t></w:r>`)).join('');
  const body = excerpt.map((block, index) => {
    const position = index + 1;
    const text = `<w:r><w:t>${escapeXml(block.text)}</w:t></w:r>`;
    const displayed = retention.field?.block === position ? `<w:fldSimple w:instr=" TITLE ">${text}</w:fldSimple>` : text;
    const note = retention.footnote?.block === position ? '<w:r><w:footnoteReference w:id="1"/></w:r>' : '';
    const anchored = box?.anchorBlock === position
      ? `<w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing><wp:anchor ${WP}><a:graphic ${A}><a:graphicData>` +
        `<wps:wsp ${WPS}><wps:txbx><w:txbxContent>${boxParagraphs}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData>` +
        `</a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape ${V}><v:textbox><w:txbxContent>` +
        `${boxParagraphs}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`
      : '';
    return styledParagraphXml(paragraphOf(block), `${displayed}${note}${anchored}`);
  }).join('');
  const encoder = new TextEncoder();
  const parts: Record<string, Uint8Array> = {
    'word/document.xml': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      `${body}<w:sectPr/></w:body></w:document>`,
    ),
  };
  if (retention.footnote !== undefined) {
    const [note] = range(retention.footnote.noteSourceBlock, 1);
    parts['word/footnotes.xml'] = encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:footnote w:id="1"><w:p><w:r><w:t>${escapeXml(note!.text)}</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    );
  }
  return parts;
}

// ---- comments and tracked changes (Issue #411) -------------------------------------------------------

/** Graphemes `[from, to)` of the admitted source's `block`-th block (1-based); the whole block by default. */
export interface SourceSpan {
  readonly block: number;
  readonly from?: number;
  readonly to?: number;
}

/** A tracked-change container around a run, possibly holding another — a deletion inside an insertion. */
export interface ComposedRevisionWrap {
  readonly kind: 'ins' | 'del' | 'moveFrom' | 'moveTo';
  readonly author: string;
  readonly date: string;
  readonly inner?: ComposedRevisionWrap;
}

export type ComposedRevisedRun =
  | { readonly text: SourceSpan; readonly revision?: ComposedRevisionWrap }
  | { readonly comment: 'start' | 'end' | 'reference'; readonly id: number };

export interface ComposedRevisedParagraph {
  readonly runs: ReadonlyArray<ComposedRevisedRun>;
  /** A revision on the paragraph mark itself: the paragraph inserted, deleted, split or joined. */
  readonly markRevision?: { readonly kind: 'ins' | 'del' | 'moveFrom' | 'moveTo'; readonly author: string; readonly date: string };
  /** A formatting revision on the paragraph (`w:pPrChange`) and on its first run (`w:rPrChange`). */
  readonly formattingRevision?: { readonly author: string; readonly date: string };
  /** Paragraphs of a text box anchored in this paragraph, with comments or revisions of their own. */
  readonly textBox?: ReadonlyArray<ComposedRevisedParagraph>;
}

/**
 * A table among the paragraphs: rows of cells of paragraphs. A row may be inserted or deleted as a whole
 * (`w:trPr/w:ins`, `w:trPr/w:del`), a cell inserted, deleted or its vertical merge changed (`w:tcPr/w:cellIns`,
 * `w:cellDel`, `w:cellMerge`), each with its own author and date.
 */
export interface ComposedRevisedTable {
  readonly table: ReadonlyArray<{
    readonly revision?: { readonly kind: 'ins' | 'del'; readonly author: string; readonly date: string };
    readonly cells: ReadonlyArray<{
      readonly revision?: { readonly kind: 'cellIns' | 'cellDel' | 'cellMerge'; readonly author: string; readonly date: string };
      readonly paragraphs: ReadonlyArray<ComposedRevisedParagraph>;
    }>;
  }>;
}

/** One comment of `word/comments.xml`: its paragraphs are source spans; a reply names the comment it answers. */
export interface ComposedComment {
  readonly id: number;
  readonly author: string;
  readonly text: ReadonlyArray<SourceSpan>;
  readonly replyTo?: number;
  readonly done?: boolean;
}

export interface ComposedRevisedRequest {
  readonly source: string;
  readonly title: string;
  readonly paragraphs: ReadonlyArray<ComposedRevisedParagraph | ComposedRevisedTable>;
  readonly comments?: ReadonlyArray<ComposedComment>;
  /** A section-property revision in the terminal `w:sectPr`. */
  readonly sectionRevision?: { readonly author: string; readonly date: string };
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** The exact text a span names, read from the admitted source through the product's parser. */
export async function sourceSpanText(source: string, span: SourceSpan): Promise<string> {
  const available = await blocksOf(source);
  const block = available[span.block - 1];
  if (block === undefined) throw new Error('composed span outside the source');
  const graphemes = Array.from(segmenter.segment(block.text), ({ segment }) => segment);
  const from = span.from ?? 0;
  const to = span.to ?? graphemes.length;
  if (from < 0 || to > graphemes.length || to <= from) throw new Error('composed span outside its block');
  return graphemes.slice(from, to).join('');
}

const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
const W15 = 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';

function paragraphId(commentId: number): string {
  return (0x10000000 + commentId).toString(16).toUpperCase();
}

/**
 * Compose a DOCX whose paragraphs carry comments and tracked changes, every word of it a span of the admitted
 * source, written the way Word writes them: `w:ins`/`w:del`/`w:moveFrom`/`w:moveTo` around runs, deleted text
 * in `w:delText`, the paragraph mark's revision in `w:pPr/w:rPr`, comment ranges and references in the body,
 * and the comments in `word/comments.xml` with their threads and 已处理 in `word/commentsExtended.xml`.
 * Author names are the caller's, neutral by convention. Returns the archive bytes.
 */
export async function composeRevisedDocx(path: string, request: ComposedRevisedRequest): Promise<Uint8Array> {
  let revisionId = 1000;
  const attributes = (author: string, date: string): string =>
    ` w:id="${revisionId++}" w:author="${escapeXml(author)}" w:date="${escapeXml(date)}"`;
  const runXml = async (span: SourceSpan, wrap: ComposedRevisionWrap | undefined): Promise<string> => {
    const text = escapeXml(await sourceSpanText(request.source, span));
    let innermost = wrap;
    while (innermost?.inner !== undefined) innermost = innermost.inner;
    const deleted = innermost?.kind === 'del';
    let xml = `<w:r>${deleted ? `<w:delText xml:space="preserve">${text}</w:delText>` : `<w:t xml:space="preserve">${text}</w:t>`}</w:r>`;
    const chain: ComposedRevisionWrap[] = [];
    for (let current = wrap; current !== undefined; current = current.inner) chain.push(current);
    for (const layer of chain.reverse()) xml = `<w:${layer.kind}${attributes(layer.author, layer.date)}>${xml}</w:${layer.kind}>`;
    return xml;
  };
  const paragraphXml = async (paragraph: ComposedRevisedParagraph): Promise<string> => {
    const properties: string[] = [];
    if (paragraph.formattingRevision !== undefined) {
      const { author, date } = paragraph.formattingRevision;
      properties.push(`<w:pPrChange${attributes(author, date)}><w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:pPrChange>`);
    }
    if (paragraph.markRevision !== undefined) {
      const { kind, author, date } = paragraph.markRevision;
      properties.push(`<w:rPr><w:${kind}${attributes(author, date)}/></w:rPr>`);
    }
    const runs: string[] = [];
    for (const [index, run] of paragraph.runs.entries()) {
      if ('comment' in run) {
        runs.push(run.comment === 'start'
          ? `<w:commentRangeStart w:id="${run.id}"/>`
          : run.comment === 'end'
            ? `<w:commentRangeEnd w:id="${run.id}"/>`
            : `<w:r><w:commentReference w:id="${run.id}"/></w:r>`);
        continue;
      }
      let xml = await runXml(run.text, run.revision);
      if (index === 0 && paragraph.formattingRevision !== undefined) {
        const { author, date } = paragraph.formattingRevision;
        xml = xml.replace('<w:r>', `<w:r><w:rPr><w:b/><w:rPrChange${attributes(author, date)}><w:rPr/></w:rPrChange></w:rPr>`);
      }
      runs.push(xml);
    }
    if (paragraph.textBox !== undefined) {
      const box = (await Promise.all(paragraph.textBox.map(paragraphXml))).join('');
      runs.push(`<w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing><wp:anchor ${WP}><a:graphic ${A}>` +
        `<a:graphicData><wps:wsp ${WPS}><wps:txbx><w:txbxContent>${box}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData>` +
        '</a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>');
    }
    const pPr = properties.length === 0 ? '' : `<w:pPr>${properties.join('')}</w:pPr>`;
    return `<w:p>${pPr}${runs.join('')}</w:p>`;
  };
  const tableXml = async (table: ComposedRevisedTable): Promise<string> => {
    const columns = Math.max(1, ...table.table.map((row) => row.cells.length));
    const rows: string[] = [];
    for (const row of table.table) {
      const rowRevision = row.revision === undefined ? '' : `<w:trPr><w:${row.revision.kind}${attributes(row.revision.author, row.revision.date)}/></w:trPr>`;
      const cells: string[] = [];
      for (const cell of row.cells) {
        const revision = cell.revision === undefined
          ? ''
          : `<w:${cell.revision.kind}${attributes(cell.revision.author, cell.revision.date)}${cell.revision.kind === 'cellMerge' ? ' w:vMerge="cont"' : ''}/>`;
        const paragraphs = (await Promise.all(cell.paragraphs.map(paragraphXml))).join('') || '<w:p/>';
        cells.push(`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/>${revision}</w:tcPr>${paragraphs}</w:tc>`);
      }
      rows.push(`<w:tr>${rowRevision}${cells.join('')}</w:tr>`);
    }
    const grid = '<w:gridCol w:w="4000"/>'.repeat(columns);
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join('')}</w:tbl>`;
  };
  const body = (await Promise.all(request.paragraphs.map((item) => 'table' in item ? tableXml(item) : paragraphXml(item)))).join('');
  const section = request.sectionRevision === undefined
    ? '<w:sectPr/>'
    : `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:sectPrChange${attributes(request.sectionRevision.author, request.sectionRevision.date)}><w:sectPr/></w:sectPrChange></w:sectPr>`;
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    'word/document.xml': encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      `${body}${section}</w:body></w:document>`,
    ),
  };
  const comments = request.comments ?? [];
  if (comments.length > 0) {
    const commentXml: string[] = [];
    for (const comment of comments) {
      const paragraphs: string[] = [];
      for (const [index, span] of comment.text.entries()) {
        const id = index === comment.text.length - 1 ? ` w14:paraId="${paragraphId(comment.id)}"` : '';
        paragraphs.push(`<w:p${id}><w:r><w:t xml:space="preserve">${escapeXml(await sourceSpanText(request.source, span))}</w:t></w:r></w:p>`);
      }
      if (comment.text.length === 0) paragraphs.push(`<w:p w14:paraId="${paragraphId(comment.id)}"/>`);
      commentXml.push(`<w:comment w:id="${comment.id}" w:author="${escapeXml(comment.author)}" w:date="2026-09-01T00:00:00Z" w:initials="示">${paragraphs.join('')}</w:comment>`);
    }
    entries['word/comments.xml'] = encoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ${W14}>${commentXml.join('')}</w:comments>`,
    );
    const threads = comments.map((comment) => {
      const parent = comment.replyTo === undefined ? '' : ` w15:paraIdParent="${paragraphId(comment.replyTo)}"`;
      return `<w15:commentEx w15:paraId="${paragraphId(comment.id)}"${parent} w15:done="${comment.done === true ? 1 : 0}"/>`;
    });
    entries['word/commentsExtended.xml'] = encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx ${W15}>${threads.join('')}</w15:commentsEx>`,
    );
  }
  const archive = buildSyntheticDocx({ paragraphs: [], coreTitle: request.title, extraEntries: entries });
  await writeFile(path, archive);
  return archive;
}

/**
 * Compose one DOCX at `path` from the requested excerpt and return its bytes. The same request yields
 * the same bytes — the excerpt is deterministic and `buildSyntheticDocx` fixes the archive mtime — so a
 * composed digest is stable across runs and processes.
 */
export async function composeManuscriptDocx(
  path: string,
  request: ComposedManuscriptRequest,
): Promise<Uint8Array> {
  const available = await blocksOf(request.source);
  const lastBlock = request.startBlock + request.blocks - 1;
  if (request.startBlock < 1 || request.blocks < 1 || lastBlock > available.length) {
    throw new Error(
      `composed excerpt out of range: blocks ${request.startBlock}-${lastBlock} of ${available.length} in ${request.source}`,
    );
  }
  const excerpt = available.slice(request.startBlock - 1, lastBlock);
  const archive = buildSyntheticDocx({
    paragraphs: excerpt.map(paragraphOf),
    coreTitle: request.title,
    ...(request.retention === undefined ? {} : { extraEntries: retentionParts(excerpt, available, request.retention) }),
  });
  await writeFile(path, archive);
  return archive;
}
