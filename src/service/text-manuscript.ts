import { strToU8, zipSync } from 'fflate';

/**
 * The local converter that gives a plain-text or Markdown manuscript a DOCX working representation
 * (ADR 0072 §5). It adds no dependency beyond the `fflate` the DOCX parser already uses, reads
 * nothing but the bytes it is handed, and is pure: the same bytes always convert to the same bytes,
 * so a re-selection of the same file reproduces the same working object.
 *
 * What it interprets is deliberately small. Paragraphs come from blank-line separation and headings
 * from Markdown heading markers; every other Markdown construct stays as the literal characters the
 * author typed and is counted as conversion loss, so the Import Fidelity Review can name conversion
 * as the cause instead of claiming a structure the converter never read (ADR 0072 §3).
 */
export const TEXT_CONVERTER_IDENTITY = 'ai7-text-to-docx/1';

/** The refusal every caller reads by code; the reason is stated for the surface that shows it. */
export const TEXT_CONVERSION_REFUSED = 'TEXT_CONVERSION_REFUSED';

/** The two formats this converter accepts. The intake router sends it nothing else. */
export type ConvertibleSourceFormat = 'TXT' | 'MD';

/**
 * What the converter kept as literal text, counted into the fidelity classes the Import Fidelity
 * Review already has. The shape mirrors the review's seven counted classes so that merging a
 * conversion into a parser's report is one addition per class and never a re-classification.
 */
export interface ConversionLoss {
  inlineStyles: number;
  commentsRevisions: number;
  notes: number;
  tables: number;
  imagesCaptions: number;
  sections: number;
  headersFooters: number;
}

export interface ConvertedTextManuscript {
  docx: Uint8Array;
  loss: ConversionLoss;
}

/**
 * A fixed archive timestamp is what makes the conversion reproducible: a ZIP records an mtime per
 * entry, so a clock reading would make the same text convert to different bytes every time.
 */
const ARCHIVE_MTIME = new Date('2026-01-01T00:00:00.000Z');
const ARCHIVE_LEVEL = 6;

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml"' +
  ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

/**
 * Core properties without a `dc:title`: the original carried no document metadata, so the working
 * representation claims none and the title suggestion falls back to the file name (ADR 0072 §2).
 */
const CORE_PROPERTIES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<cp:coreProperties' +
  ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>';

const BYTE_ORDER_MARK = 0xfeff;
const TAB = 9;
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;
const FIRST_PRINTABLE = 32;
const DELETE_CHARACTER = 127;

const BLANK_LINE = /^[ \t]*$/;
const ATX_HEADING = /^(#{1,6})[ \t]+(.*)$/;
const SETEXT_HEADING_1 = /^=+[ \t]*$/;
const SETEXT_HEADING_2 = /^-+[ \t]*$/;
const FENCE = /^[ \t]{0,3}(?:```|~~~)/;
const HORIZONTAL_RULE = /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const LIST_MARKER = /^[ \t]{0,3}(?:[-*+][ \t]+|\d{1,9}[.)][ \t]+)/;
const BLOCK_QUOTE = /^[ \t]{0,3}>/;
const TABLE_ROW = /^[ \t]{0,3}\|.*\|[ \t]*$/;
const IMAGE_REFERENCE = /!\[[^\]\n]*\]\([^)\s]*\)/g;
const LINK_REFERENCE = /\[[^\]\n]*\]\([^)\s]*\)/g;
const INLINE_CODE = /`[^`\n]+`/g;
const EMPHASIS = /\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_/g;

interface ConvertedParagraph {
  /** The literal lines of one paragraph; a boundary between two of them is a hard line break. */
  lines: string[];
  /** A `w:pStyle` value the DOCX parser reads as a heading, or none for a body paragraph. */
  style?: string;
}

function requireText(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`${TEXT_CONVERSION_REFUSED}:${reason}`);
}

/** True for the refusal this module raises, so a caller can route it without matching on text. */
export function isTextConversionRefusal(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(`${TEXT_CONVERSION_REFUSED}:`);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emptyLoss(): ConversionLoss {
  return {
    inlineStyles: 0,
    commentsRevisions: 0,
    notes: 0,
    tables: 0,
    imagesCaptions: 0,
    sections: 0,
    headersFooters: 0,
  };
}

function countMatches(value: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let total = 0;
  while (pattern.exec(value) !== null) total += 1;
  return total;
}

/** Text carries no C0 control other than a tab or a line ending; anything else is not text. */
function hasForbiddenControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) continue;
    if (code < FIRST_PRINTABLE || code === DELETE_CHARACTER) return true;
  }
  return false;
}

/**
 * Decode the selected bytes as the strict UTF-8 the sniffer identified, with a byte-order mark
 * removed and every line ending normalized, so a CRLF file and an LF file convert identically.
 */
function decodeText(bytes: Uint8Array): string {
  let decoded: string | undefined;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    decoded = undefined;
  }
  requireText(decoded !== undefined, '文件不是有效的 UTF-8 文本，无法转换。');
  const text = decoded.codePointAt(0) === BYTE_ORDER_MARK ? decoded.slice(1) : decoded;
  requireText(!hasForbiddenControlCharacter(text), '文件包含无法转换为稿件的控制字符。');
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** A block is a maximal run of non-blank lines; blank lines separate paragraphs and carry nothing. */
function textBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (BLANK_LINE.test(line)) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Count one line's Markdown constructs into the classes the review carries. Every construct here
 * survives into the working representation as the literal characters the author typed, which is
 * exactly why it is loss: the review must not suggest the converter understood it.
 *
 * A horizontal rule is counted alone, because its characters are also a list marker's; a table row
 * is counted as a table and still scanned, because a cell may carry its own inline markup.
 */
function countLineLoss(line: string, loss: ConversionLoss): void {
  if (HORIZONTAL_RULE.test(line)) {
    loss.inlineStyles += 1;
    return;
  }
  if (TABLE_ROW.test(line)) loss.tables += 1;
  else if (LIST_MARKER.test(line)) loss.inlineStyles += 1;
  if (BLOCK_QUOTE.test(line)) loss.inlineStyles += 1;
  loss.imagesCaptions += countMatches(line, IMAGE_REFERENCE);
  const withoutImages = line.replace(IMAGE_REFERENCE, '');
  loss.inlineStyles += countMatches(withoutImages, LINK_REFERENCE);
  loss.inlineStyles += countMatches(withoutImages, INLINE_CODE);
  loss.inlineStyles += countMatches(withoutImages.replace(INLINE_CODE, ''), EMPHASIS);
}

/**
 * Markdown blocks: an ATX heading line and a setext-underlined line become headings with their
 * markers removed; nothing else is interpreted. A fenced code block is counted once and its lines
 * are scanned no further, because inside a fence the author's characters mean themselves.
 */
function markdownParagraphs(block: string[], loss: ConversionLoss): ConvertedParagraph[] {
  const paragraphs: ConvertedParagraph[] = [];
  let pending: string[] = [];
  let fenced = false;
  const flush = (): void => {
    if (pending.length > 0) paragraphs.push({ lines: pending });
    pending = [];
  };
  for (let index = 0; index < block.length; index += 1) {
    const line = block[index]!;
    if (FENCE.test(line)) {
      if (!fenced) loss.inlineStyles += 1;
      fenced = !fenced;
      pending.push(line);
      continue;
    }
    if (fenced) {
      pending.push(line);
      continue;
    }
    const heading = ATX_HEADING.exec(line);
    if (heading) {
      flush();
      countLineLoss(heading[2]!, loss);
      paragraphs.push({ lines: [heading[2]!.trim()], style: `Heading${heading[1]!.length}` });
      continue;
    }
    const underline = block[index + 1];
    if (underline !== undefined && (SETEXT_HEADING_1.test(underline) || SETEXT_HEADING_2.test(underline))) {
      flush();
      countLineLoss(line, loss);
      paragraphs.push({ lines: [line.trim()], style: SETEXT_HEADING_1.test(underline) ? 'Heading1' : 'Heading2' });
      index += 1;
      continue;
    }
    countLineLoss(line, loss);
    pending.push(line);
  }
  flush();
  return paragraphs;
}

function paragraphXml(paragraph: ConvertedParagraph): string {
  const style = paragraph.style === undefined
    ? ''
    : `<w:pPr><w:pStyle w:val="${escapeXml(paragraph.style)}"/></w:pPr>`;
  // A single newline inside a block is a hard line break, never a space: the author put it there.
  const runs = paragraph.lines.map((line) => `<w:t>${escapeXml(line)}</w:t>`).join('<w:br/>');
  return `<w:p>${style}<w:r>${runs}</w:r></w:p>`;
}

/**
 * Convert a plain-text or Markdown manuscript into the DOCX working representation the product
 * reads it through. The result is never the digest of record: the caller keeps the original file
 * and its digest as the Source Version's identity (ADR 0072 §2).
 *
 * The package carries no run properties, table, image, section child, header, or footer, so the
 * DOCX parser reports no fidelity signal of its own for it and every count in the merged review is
 * this conversion's — the invariant `deriveImportFidelityPlan` relies on to rebuild the report.
 */
export function convertTextManuscript(
  bytes: Uint8Array,
  options: { format: ConvertibleSourceFormat },
): ConvertedTextManuscript {
  requireText(bytes.byteLength > 0, '所选文件为空，无法转换。');
  const text = decodeText(bytes);
  const loss = emptyLoss();
  const paragraphs = textBlocks(text).flatMap((block) =>
    options.format === 'MD' ? markdownParagraphs(block, loss) : [{ lines: block }]);
  requireText(
    paragraphs.some((paragraph) => paragraph.lines.join('').trim().length > 0),
    '文件没有可转换为稿件的文本内容。',
  );
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs.map(paragraphXml).join('') +
    '<w:sectPr/></w:body></w:document>';
  const docx = zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
      'docProps/core.xml': strToU8(CORE_PROPERTIES_XML),
      'word/document.xml': strToU8(documentXml),
    },
    { level: ARCHIVE_LEVEL, mtime: ARCHIVE_MTIME },
  );
  return { docx, loss };
}
