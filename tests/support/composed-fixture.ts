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
