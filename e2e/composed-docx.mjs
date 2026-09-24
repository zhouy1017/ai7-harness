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

// ---- comments and tracked changes (Issue #411) -------------------------------------------------------

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** The graphemes `[from, to)` of the source's 1-based `block`-th block; the whole block by default. */
export async function admittedSpanText(source, { block, from, to }) {
  const available = await admittedBlocks(source);
  const text = available[block - 1]?.text;
  if (text === undefined) throw new Error(`composed span outside the source: ${admittedSourcePath(source)}`);
  const graphemes = Array.from(segmenter.segment(text), ({ segment }) => segment);
  const start = from ?? 0;
  const end = to ?? graphemes.length;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > graphemes.length || end <= start) {
    throw new Error('composed span outside its block');
  }
  return graphemes.slice(start, end).join('');
}

const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
const W15 = 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';

function commentParagraphId(commentId) {
  return (0x10000000 + commentId).toString(16).toUpperCase();
}

/**
 * Compose a DOCX whose paragraphs carry comments and tracked changes, every word a span of the admitted
 * source — the twin of `composeRevisedDocx` in `tests/support/composed-fixture.ts`, written the way Word
 * writes them: `w:ins`/`w:del`/`w:moveFrom`/`w:moveTo` around runs, deleted text in `w:delText`, the paragraph
 * mark's revision in `w:pPr/w:rPr`, a formatting revision as `w:pPrChange` and `w:rPrChange`, comment ranges
 * and references in the body, the comments in `word/comments.xml` and their threads and 已处理 in
 * `word/commentsExtended.xml`. A paragraph's `runs` are `{ text: span, revision? }` or `{ comment, id }`.
 */
export async function composeRevisedAdmittedDocx(path, { source, title, paragraphs, comments = [] }) {
  const { zipSync, strToU8 } = await carriers();
  let revisionId = 1000;
  const attributes = (author, date) => ` w:id="${revisionId++}" w:author="${escapeXml(author)}" w:date="${escapeXml(date)}"`;
  const runXmlOf = async (span, wrap) => {
    const text = escapeXml(await admittedSpanText(source, span));
    const chain = [];
    for (let current = wrap; current !== undefined; current = current.inner) chain.push(current);
    const deleted = chain.at(-1)?.kind === 'del';
    let xml = `<w:r>${deleted ? `<w:delText xml:space="preserve">${text}</w:delText>` : `<w:t xml:space="preserve">${text}</w:t>`}</w:r>`;
    for (const layer of chain.reverse()) xml = `<w:${layer.kind}${attributes(layer.author, layer.date)}>${xml}</w:${layer.kind}>`;
    return xml;
  };
  const body = [];
  for (const paragraph of paragraphs) {
    const properties = [];
    if (paragraph.formattingRevision !== undefined) {
      const { author, date } = paragraph.formattingRevision;
      properties.push(`<w:pPrChange${attributes(author, date)}><w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:pPrChange>`);
    }
    if (paragraph.markRevision !== undefined) {
      const { kind, author, date } = paragraph.markRevision;
      properties.push(`<w:rPr><w:${kind}${attributes(author, date)}/></w:rPr>`);
    }
    const runs = [];
    for (const [index, run] of paragraph.runs.entries()) {
      if (run.comment !== undefined) {
        runs.push(run.comment === 'start'
          ? `<w:commentRangeStart w:id="${run.id}"/>`
          : run.comment === 'end' ? `<w:commentRangeEnd w:id="${run.id}"/>` : `<w:r><w:commentReference w:id="${run.id}"/></w:r>`);
        continue;
      }
      let xml = await runXmlOf(run.text, run.revision);
      if (index === 0 && paragraph.formattingRevision !== undefined) {
        const { author, date } = paragraph.formattingRevision;
        xml = xml.replace('<w:r>', `<w:r><w:rPr><w:b/><w:rPrChange${attributes(author, date)}><w:rPr/></w:rPrChange></w:rPr>`);
      }
      runs.push(xml);
    }
    body.push(`<w:p>${properties.length === 0 ? '' : `<w:pPr>${properties.join('')}</w:pPr>`}${runs.join('')}</w:p>`);
  }
  const parts = {
    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body.join('')}<w:sectPr/></w:body></w:document>`,
    ),
  };
  if (comments.length > 0) {
    const commentXml = [];
    for (const comment of comments) {
      const commentParagraphs = [];
      for (const [index, span] of comment.text.entries()) {
        const id = index === comment.text.length - 1 ? ` w14:paraId="${commentParagraphId(comment.id)}"` : '';
        commentParagraphs.push(`<w:p${id}><w:r><w:t xml:space="preserve">${escapeXml(await admittedSpanText(source, span))}</w:t></w:r></w:p>`);
      }
      if (comment.text.length === 0) commentParagraphs.push(`<w:p w14:paraId="${commentParagraphId(comment.id)}"/>`);
      commentXml.push(`<w:comment w:id="${comment.id}" w:author="${escapeXml(comment.author)}" w:date="2026-09-01T00:00:00Z" w:initials="示">${commentParagraphs.join('')}</w:comment>`);
    }
    parts['word/comments.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ${W14}>${commentXml.join('')}</w:comments>`,
    );
    const threads = comments.map((comment) => {
      const parent = comment.replyTo === undefined ? '' : ` w15:paraIdParent="${commentParagraphId(comment.replyTo)}"`;
      return `<w15:commentEx w15:paraId="${commentParagraphId(comment.id)}"${parent} w15:done="${comment.done === true ? 1 : 0}"/>`;
    });
    parts['word/commentsExtended.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><w15:commentsEx ${W15}>${threads.join('')}</w15:commentsEx>`);
  }
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title></cp:coreProperties>`),
    ...parts,
  }, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') });
  await writeFile(path, archive, { flag: 'wx' });
  return archive;
}

/** The neutral author names of J-01's comments-and-revisions input. */
export const IMPORTED_MARKS_AUTHOR = '示例作者';
export const IMPORTED_MARKS_OTHER_AUTHOR = '另一位作者';

const plain = (block, from, to) => ({ text: { block, from, to } });
const revised = (block, from, to, kind, author, date) => ({ text: { block, from, to }, revision: { kind, author, date } });

/**
 * J-01's comments-and-revisions input (Issue #411, D8), every word sample1's own: a deletion, an insertion, a
 * same-author same-time replacement, a comment with a reply by another author, a comment marked done, a whole
 * paragraph inserted, a move and a formatting change. It reads with every revision rejected as the source's
 * blocks `IMPORTED_MARKS_REJECTED_BLOCKS` and becomes `IMPORTED_MARKS_COUNT` marks.
 */
export const IMPORTED_MARKS_RECIPE = Object.freeze({
  paragraphs: [
    { runs: [plain(8, 0, 10), revised(8, 10, 14, 'del', IMPORTED_MARKS_AUTHOR, '2026-09-01T10:00:00Z'), plain(8, 14)] },
    { runs: [plain(10, 0, 20), revised(11, 0, 5, 'ins', IMPORTED_MARKS_AUTHOR, '2026-09-01T10:01:00Z'), plain(10, 20)] },
    {
      runs: [
        plain(13, 0, 5), revised(13, 5, 9, 'del', IMPORTED_MARKS_AUTHOR, '2026-09-01T10:02:00Z'),
        revised(14, 0, 6, 'ins', IMPORTED_MARKS_AUTHOR, '2026-09-01T10:02:00Z'), plain(13, 9),
      ],
    },
    {
      runs: [
        plain(15, 0, 10), { comment: 'start', id: 1 }, { comment: 'start', id: 2 }, plain(15, 10, 20),
        { comment: 'end', id: 1 }, { comment: 'reference', id: 1 }, { comment: 'end', id: 2 }, { comment: 'reference', id: 2 }, plain(15, 20),
      ],
    },
    { runs: [plain(16, 0, 5), { comment: 'start', id: 3 }, plain(16, 5, 9), { comment: 'end', id: 3 }, { comment: 'reference', id: 3 }, plain(16, 9)] },
    {
      markRevision: { kind: 'ins', author: IMPORTED_MARKS_OTHER_AUTHOR, date: '2026-09-01T11:00:00Z' },
      runs: [revised(17, undefined, undefined, 'ins', IMPORTED_MARKS_OTHER_AUTHOR, '2026-09-01T11:00:00Z')],
    },
    { runs: [plain(19, 0, 10), revised(20, 0, 5, 'moveTo', IMPORTED_MARKS_AUTHOR, '2026-09-01T12:00:00Z'), plain(19, 10)] },
    { runs: [revised(20, 0, 5, 'moveFrom', IMPORTED_MARKS_AUTHOR, '2026-09-01T12:00:00Z'), plain(20, 5)] },
    { runs: [plain(12)], formattingRevision: { author: IMPORTED_MARKS_AUTHOR, date: '2026-09-01T13:00:00Z' } },
  ],
  comments: [
    { id: 1, author: IMPORTED_MARKS_AUTHOR, text: [{ block: 14, from: 0, to: 10 }] },
    { id: 2, author: IMPORTED_MARKS_OTHER_AUTHOR, text: [{ block: 16, from: 10, to: 18 }], replyTo: 1 },
    { id: 3, author: IMPORTED_MARKS_AUTHOR, text: [{ block: 9, from: 0, to: 8 }], done: true },
  ],
});
export const IMPORTED_MARKS_REJECTED_BLOCKS = Object.freeze([8, 10, 13, 15, 16, 19, 20, 12]);
export const IMPORTED_MARKS_COUNT = 7;

// ---- the export input and the exported file (Issue #413) ---------------------------------------------

const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * J-07's export input (Issue #413, E6), every word sample1's own: the contiguous excerpt with a header whose
 * words are the source's `header.sourceBlock`; the excerpt's `styledRun.block`-th paragraph split after its
 * fourth grapheme, the rest bold; one comment by `comment.author` over graphemes `[from, to)` of the excerpt's
 * `comment.block`-th paragraph, its words the source span `comment.text`; and one tracked replacement by
 * `replacement.author` of graphemes `[from, to)` of the excerpt's `replacement.block`-th paragraph by the source
 * span `replacement.insert`. Read with every revision rejected it is the excerpt itself.
 */
export async function composeExportAdmittedDocx(path, { source, startBlock, blocks, title, header, styledRun, comment, replacement }) {
  const { zipSync, strToU8 } = await carriers();
  const available = await admittedBlocks(source);
  const lastBlock = startBlock + blocks - 1;
  if (!Number.isSafeInteger(startBlock) || !Number.isSafeInteger(blocks) || startBlock < 1 || blocks < 1 || lastBlock > available.length) {
    throw new Error(`composed excerpt out of range: blocks ${startBlock}-${lastBlock} of ${available.length} in ${admittedSourcePath(source)}`);
  }
  const excerpt = available.slice(startBlock - 1, lastBlock);
  const graphemes = (text) => Array.from(segmenter.segment(text), ({ segment }) => segment);
  const plainRun = (text, bold = false) => text.length === 0 ? '' : `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  const within = (position) => {
    if (!Number.isSafeInteger(position) || position < 1 || position > excerpt.length) throw new Error('composed export content outside the excerpt');
    return graphemes(excerpt[position - 1].text);
  };
  const commentWords = await admittedSpanText(source, comment.text);
  const insertWords = await admittedSpanText(source, replacement.insert);
  const body = excerpt.map((block, index) => {
    const position = index + 1;
    const style = block.style === undefined ? '' : `<w:pPr><w:pStyle w:val="${escapeXml(block.style)}"/></w:pPr>`;
    let runs = plainRun(block.text);
    if (position === styledRun.block) {
      const parts = within(position);
      runs = `${plainRun(parts.slice(0, 4).join(''))}${plainRun(parts.slice(4).join(''), true)}`;
    } else if (position === comment.block) {
      const parts = within(position);
      runs = `${plainRun(parts.slice(0, comment.from).join(''))}<w:commentRangeStart w:id="1"/>${plainRun(parts.slice(comment.from, comment.to).join(''))}` +
        `<w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r>${plainRun(parts.slice(comment.to).join(''))}`;
    } else if (position === replacement.block) {
      const parts = within(position);
      const identity = `w:author="${escapeXml(replacement.author)}" w:date="${escapeXml(replacement.date)}"`;
      runs = `${plainRun(parts.slice(0, replacement.from).join(''))}` +
        `<w:del w:id="101" ${identity}><w:r><w:delText xml:space="preserve">${escapeXml(parts.slice(replacement.from, replacement.to).join(''))}</w:delText></w:r></w:del>` +
        `<w:ins w:id="102" ${identity}><w:r><w:t xml:space="preserve">${escapeXml(insertWords)}</w:t></w:r></w:ins>${plainRun(parts.slice(replacement.to).join(''))}`;
    }
    return `<w:p>${style}${runs}</w:p>`;
  }).join('');
  const [headerBlock] = available.slice(header.sourceBlock - 1, header.sourceBlock);
  if (headerBlock === undefined) throw new Error('composed header outside the source');
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title></cp:coreProperties>`),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ${REL}>` +
      `<w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/></w:sectPr></w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdComments1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'),
    'word/header1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>${plainRun(headerBlock.text)}</w:p></w:hdr>`),
    'word/comments.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:comment w:id="1" w:author="${escapeXml(comment.author)}" w:date="2026-09-01T00:00:00Z" w:initials="示"><w:p><w:r><w:t xml:space="preserve">${escapeXml(commentWords)}</w:t></w:r></w:p></w:comment></w:comments>`,
    ),
  }, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') });
  await writeFile(path, archive, { flag: 'wx' });
  return archive;
}

/**
 * What a written DOCX holds, as digests, counts and authors only — so a runner checks an exported file without
 * ever holding its words in a message: each part's digest; each body paragraph's text as the parser reads it
 * with every revision rejected, and whether a run of it is bold; each tracked insertion and deletion; each
 * comment's author and words; and whether the section still names its header.
 */
export async function readExportedDocx(path) {
  const { unzipSync, SaxesParser } = await carriers();
  const { createHash } = await import('node:crypto');
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const files = unzipSync(await readFile(path));
  const parts = Object.fromEntries(Object.entries(files).filter(([name]) => !name.endsWith('/')).map(([name, bytes]) => [name, digest(bytes)]));
  const decode = (name) => (files[name] === undefined ? undefined : new TextDecoder('utf-8', { fatal: true }).decode(files[name]));
  const attribute = (tag, local) => Object.values(tag.attributes).find((item) => item.local === local)?.value;
  const paragraphs = [];
  const insertions = [];
  const deletions = [];
  let headerReference = false;
  let paragraph;
  let run;
  let textDepth = 0;
  const revisions = [];
  const documentParser = new SaxesParser({ xmlns: true });
  documentParser.on('opentag', (tag) => {
    switch (tag.local) {
      case 'p':
        paragraph = { text: '', bold: false };
        break;
      case 'r':
        run = { bold: false };
        break;
      case 'b':
        if (run !== undefined && revisions.length === 0) run.bold = true;
        break;
      case 'ins':
      case 'del':
        if (paragraph !== undefined) {
          const record = { kind: tag.local, author: attribute(tag, 'author') ?? '', text: '' };
          revisions.push(record);
          (tag.local === 'ins' ? insertions : deletions).push(record);
        }
        break;
      case 't':
      case 'delText':
        textDepth += 1;
        break;
      case 'br':
      case 'cr':
        if (paragraph !== undefined && revisions.every((record) => record.kind === 'del')) paragraph.text += '\n';
        break;
      case 'headerReference':
        headerReference = true;
        break;
      default:
        break;
    }
  });
  documentParser.on('text', (text) => {
    if (paragraph === undefined || textDepth === 0) return;
    const innermost = revisions.at(-1);
    if (innermost !== undefined) innermost.text += text;
    if (revisions.every((record) => record.kind === 'del')) paragraph.text += text;
  });
  documentParser.on('closetag', (tag) => {
    if (tag.local === 't' || tag.local === 'delText') textDepth -= 1;
    if ((tag.local === 'ins' || tag.local === 'del') && paragraph !== undefined) revisions.pop();
    if (tag.local === 'r') {
      if (run?.bold === true && paragraph !== undefined) paragraph.bold = true;
      run = undefined;
    }
    if (tag.local === 'p' && paragraph !== undefined) {
      const text = paragraph.text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
      if (text.length > 0) paragraphs.push({ digest: digest(text), bold: paragraph.bold });
      paragraph = undefined;
    }
  });
  documentParser.write(decode('word/document.xml') ?? '').close();
  const comments = [];
  const commentsXml = decode('word/comments.xml');
  if (commentsXml !== undefined) {
    let current;
    let depth = 0;
    const commentParser = new SaxesParser({ xmlns: true });
    commentParser.on('opentag', (tag) => {
      if (tag.local === 'comment') current = { author: attribute(tag, 'author') ?? '', lines: [] };
      if (tag.local === 'p' && current !== undefined) current.lines.push('');
      if (tag.local === 't') depth += 1;
    });
    commentParser.on('text', (text) => {
      if (current !== undefined && depth > 0) current.lines[current.lines.length - 1] += text;
    });
    commentParser.on('closetag', (tag) => {
      if (tag.local === 't') depth -= 1;
      if (tag.local === 'comment' && current !== undefined) {
        comments.push({ author: current.author, digest: digest(current.lines.join('\n').trim()) });
        current = undefined;
      }
    });
    commentParser.write(commentsXml).close();
  }
  return {
    parts,
    paragraphs,
    insertions: insertions.map((record) => ({ author: record.author, digest: digest(record.text) })),
    deletions: deletions.map((record) => ({ author: record.author, digest: digest(record.text) })),
    comments,
    headerReference,
  };
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
