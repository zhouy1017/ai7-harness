import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Composed manuscript inputs for the Journey runners: the plain-JS twin of the vitest builder
// `tests/support/composed-fixture.ts`. A Journey whose subject is manuscript content composes its DOCX
// at run time from a contiguous excerpt of the one admitted Public SampleBook (ADR 0043 as narrowed by
// ADR 0079 §5) instead of generating prose, per the content-versus-container rule in
// `docs/agents/ci-test-boundaries.md`. The
// two files exist because a runner cannot reach the vitest one: that builder is TypeScript importing
// `src/service/docx.ts` under vitest, and the built carrier set exposes no parseable service module —
// `dist/service/index.mjs` is the bundled service entry, not a parser. So this file mirrors the block
// rule of `src/service/docx.ts` (text only inside a `w:t` within a `w:p`, tabs and breaks as
// whitespace, NFC and whitespace normalization, a paragraph that normalizes to nothing is not a block)
// closely enough that its 1-based positions agree with the block counts `SampleBooks/README.md`
// records. Nothing leaves `SampleBooks/`: the composed bytes are written only to the path the runner
// names under its own disposable root, and a runner speaks of its source, its block range, digests, and
// counts rather than of any excerpt's text, so no assertion, stage name, or failure line can carry
// manuscript content. A Journey whose subject is the DOCX container keeps generating its own fixture.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The one admitted source: exact `sample1`, the ADR 0044 compatibility baseline; 97 blocks. */
export const ADMITTED_BASELINE_DOCX = 'sample1.docx';

/** The admitted file itself. Reading it is what ADR 0043 admitted it for; copying it is not admitted. */
function admittedSourcePath(source) {
  return resolve(ROOT, 'SampleBooks', source);
}

// Third-party carriers load on first composition rather than at import, so a runner that installs the
// built Node egress guard before its third-party imports keeps that order with this module imported.
let archiveCarrier;
let parserCarrier;

async function carriers() {
  archiveCarrier ??= await import('fflate');
  parserCarrier ??= await import('saxes');
  return { unzipSync: archiveCarrier.unzipSync, zipSync: archiveCarrier.zipSync, strToU8: archiveCarrier.strToU8, SaxesParser: parserCarrier.SaxesParser };
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The excerpt's own paragraph style, canonicalized the way the product classifies one, so a composed
 * block keeps the source block's kind and heading level and carries no other style name across.
 */
function styleOf(style) {
  const normalized = style?.toLocaleLowerCase('en-US') ?? '';
  if (normalized === 'title' || normalized === '标题') return 'Title';
  const heading = /(?:heading|标题)\s*([1-6])/.exec(normalized);
  return heading ? `Heading${heading[1]}` : undefined;
}

function collectBlocks(documentXml, SaxesParser, source) {
  const blocks = [];
  let paragraph;
  let textDepth = 0;
  const append = (addition) => { if (paragraph !== undefined) paragraph.text += addition; };
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    switch (tag.local) {
      case 'p':
        if (paragraph !== undefined) throw new Error(`composed source has a nested paragraph: ${admittedSourcePath(source)}`);
        paragraph = { text: '', style: undefined };
        break;
      case 'pStyle':
        // Attributes are keyed by qualified name under `xmlns`, so the style is found by local name.
        if (paragraph !== undefined) paragraph.style = Object.values(tag.attributes).find((attribute) => attribute.local === 'val')?.value;
        break;
      case 't':
        textDepth += 1;
        break;
      case 'tab':
        append('\t');
        break;
      case 'br':
      case 'cr':
        append('\n');
        break;
      default:
        break;
    }
  });
  parser.on('text', (text) => { if (paragraph !== undefined && textDepth > 0) append(text); });
  parser.on('closetag', (tag) => {
    if (tag.local === 't') textDepth -= 1;
    if (tag.local !== 'p' || paragraph === undefined) return;
    const text = paragraph.text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (text.length > 0) blocks.push({ text, style: styleOf(paragraph.style) });
    paragraph = undefined;
  });
  parser.write(documentXml).close();
  return blocks;
}

// One parse per admitted file per process: the pending promise is memoized, so a runner composing
// several excerpts of the same source reads and parses it once.
const sourceBlocks = new Map();

function admittedBlocks(source) {
  const pending = sourceBlocks.get(source);
  if (pending !== undefined) return pending;
  const path = admittedSourcePath(source);
  const started = (async () => {
    const { unzipSync, SaxesParser } = await carriers();
    const archive = unzipSync(await readFile(path), { filter: (entry) => entry.name === 'word/document.xml' });
    const documentXml = archive['word/document.xml'];
    if (documentXml === undefined) throw new Error(`composed source has no main document part: ${path}`);
    return collectBlocks(new TextDecoder('utf-8', { fatal: true }).decode(documentXml), SaxesParser, source);
  })();
  sourceBlocks.set(source, started);
  return started;
}

function paragraphXml(block) {
  const style = block.style === undefined ? '' : `<w:pPr><w:pStyle w:val="${escapeXml(block.style)}"/></w:pPr>`;
  return `<w:p>${style}<w:r><w:t>${escapeXml(block.text)}</w:t></w:r></w:p>`;
}

/**
 * The plain paragraph texts of the contiguous 1-based excerpt `[startBlock, startBlock + blocks)` of
 * `source` under exact root `SampleBooks/`, in order — the same block reading `composeAdmittedDocx`
 * performs internally, without building a DOCX around it.
 */
export async function admittedParagraphs({ source, startBlock, blocks }) {
  const available = await admittedBlocks(source);
  const lastBlock = startBlock + blocks - 1;
  if (!Number.isSafeInteger(startBlock) || !Number.isSafeInteger(blocks) || startBlock < 1 || blocks < 1 || lastBlock > available.length) {
    throw new Error(`composed excerpt out of range: blocks ${startBlock}-${lastBlock} of ${available.length} in ${admittedSourcePath(source)}`);
  }
  return available.slice(startBlock - 1, lastBlock).map((block) => block.text);
}

const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const WPS = 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const V = 'xmlns:v="urn:schemas-microsoft-com:vml"';

function runXml(text) {
  return `<w:r><w:t>${escapeXml(text)}</w:t></w:r>`;
}

function styledParagraphXml(block, runs) {
  const style = block.style === undefined ? '' : `<w:pPr><w:pStyle w:val="${escapeXml(block.style)}"/></w:pPr>`;
  return `<w:p>${style}${runs}</w:p>`;
}

/**
 * The composed body with the content ADR 0086 classifies beyond plain paragraphs, every word of it still
 * the admitted source's — the twin of `retentionParts` in `tests/support/composed-fixture.ts`:
 * - `textBox: { anchorBlock, sourceStartBlock, blocks }` anchors a text box at the end of the excerpt's
 *   `anchorBlock`-th paragraph holding the source's blocks `[sourceStartBlock, sourceStartBlock + blocks)`,
 *   written the way Word writes one (DrawingML in `mc:Choice`, the same paragraphs in VML in `mc:Fallback`);
 * - `field: { block }` displays the excerpt's `block`-th paragraph through a simple field, text unchanged;
 * - `footnote: { block, noteSourceBlock }` adds a footnote reference after the excerpt's `block`-th
 *   paragraph, whose note in `word/footnotes.xml` is the source's `noteSourceBlock`.
 */
function retentionParts(excerpt, available, retention, strToU8) {
  const range = (start, count) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 1 || count < 1 || start + count - 1 > available.length) {
      throw new Error('composed retention content out of range');
    }
    return available.slice(start - 1, start + count - 1);
  };
  const inExcerpt = (block) => {
    if (!Number.isSafeInteger(block) || block < 1 || block > excerpt.length) throw new Error('composed retention anchor outside the excerpt');
  };
  const box = retention.textBox;
  if (box !== undefined) inExcerpt(box.anchorBlock);
  if (retention.field !== undefined) inExcerpt(retention.field.block);
  if (retention.footnote !== undefined) inExcerpt(retention.footnote.block);
  const boxParagraphs = box === undefined ? '' : range(box.sourceStartBlock, box.blocks)
    .map((block) => styledParagraphXml(block, runXml(block.text))).join('');
  const body = excerpt.map((block, index) => {
    const position = index + 1;
    const text = runXml(block.text);
    const displayed = retention.field?.block === position ? `<w:fldSimple w:instr=" TITLE ">${text}</w:fldSimple>` : text;
    const note = retention.footnote?.block === position ? '<w:r><w:footnoteReference w:id="1"/></w:r>' : '';
    const anchored = box?.anchorBlock === position
      ? `<w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing><wp:anchor ${WP}><a:graphic ${A}><a:graphicData>` +
        `<wps:wsp ${WPS}><wps:txbx><w:txbxContent>${boxParagraphs}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData>` +
        `</a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape ${V}><v:textbox><w:txbxContent>` +
        `${boxParagraphs}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`
      : '';
    return styledParagraphXml(block, `${displayed}${note}${anchored}`);
  }).join('');
  const parts = {
    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}<w:sectPr/></w:body></w:document>`,
    ),
  };
  if (retention.footnote !== undefined) {
    const [note] = range(retention.footnote.noteSourceBlock, 1);
    parts['word/footnotes.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:footnote w:id="1"><w:p>${runXml(note.text)}</w:p></w:footnote></w:footnotes>`,
    );
  }
  return parts;
}

/**
 * Compose one DOCX at `path` from the contiguous 1-based excerpt `[startBlock, startBlock + blocks)` of
 * `source` under exact root `SampleBooks/`, carrying the caller's `title` as the package's `dc:title` —
 * the title is always authored and never taken from the source. `retention`, when given, adds the text
 * box, field or footnote `retentionParts` describes, all of it the source's own words. Returns the
 * archive bytes. The same request yields the same bytes: the excerpt is deterministic and the archive
 * mtime is fixed, so a composed digest is stable across runs and processes.
 */
export async function composeAdmittedDocx(path, { source, startBlock, blocks, title, retention }) {
  const { zipSync, strToU8 } = await carriers();
  const available = await admittedBlocks(source);
  const lastBlock = startBlock + blocks - 1;
  if (!Number.isSafeInteger(startBlock) || !Number.isSafeInteger(blocks) || startBlock < 1 || blocks < 1 || lastBlock > available.length) {
    throw new Error(`composed excerpt out of range: blocks ${startBlock}-${lastBlock} of ${available.length} in ${admittedSourcePath(source)}`);
  }
  const excerpt = available.slice(startBlock - 1, lastBlock);
  const body = retention === undefined
    ? { 'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${excerpt.map(paragraphXml).join('')}</w:body></w:document>`) }
    : retentionParts(excerpt, available, retention, strToU8);
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title></cp:coreProperties>`),
    ...body,
  }, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') });
  await writeFile(path, archive, { flag: 'wx' });
  return archive;
}
