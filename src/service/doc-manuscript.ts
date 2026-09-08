import { createRequire } from 'node:module';
import {
  buildManuscriptPackage,
  emptyLoss,
  type ConversionLoss,
  type ConvertedParagraph,
} from './text-manuscript.js';

/**
 * The local converter that gives a legacy binary Word (`.doc`) manuscript a DOCX working
 * representation (ADR 0072 §5, ADR 0070 §3). It reads the selected bytes with `word-extractor`, a
 * pure-JavaScript reader, and builds its package through the same builder the plain-text converter
 * uses, so a converted `.doc` and a converted `.txt` differ only in the paragraphs their readers
 * found. It opens nothing but the bytes it is handed, calls nothing, and is pure: the same bytes
 * always convert to the same bytes, so a re-selection of the same file reproduces the same object.
 *
 * **What this reader can and cannot see.** ADR 0072 §5 says a `.doc` converts to paragraphs and
 * headings; through this reader it converts to paragraphs alone, because a heading is a paragraph
 * style and the reader returns text without styles. The reader also resolves Word's marker
 * characters while it extracts (`clean()` in `word-extractor/lib/filters.js`): a cell mark becomes
 * a tab, a line, page, and paragraph break all become a newline, a picture anchor is dropped, and a
 * field keeps only its result. The counting below reads the marks that reach it and will observe
 * none of them from this reader — which is the honest outcome rather than a silent one: what the
 * review cannot count, it does not claim. Inline styles beyond a field and sections beyond a page
 * break cannot be observed by this reader at all, so those counts stay at zero even for a document
 * that carries them.
 */
export const DOC_CONVERTER_IDENTITY = 'ai7-doc-to-docx/1';

/** The refusal every caller reads by code; the reason is stated for the surface that shows it. */
export const DOC_CONVERSION_REFUSED = 'DOC_CONVERSION_REFUSED';

export interface ConvertedDocManuscript {
  docx: Uint8Array;
  loss: ConversionLoss;
}

/** The OLE compound-file header that opens every legacy binary Word document. */
const OLE_COMPOUND_FILE_SIGNATURE = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

const PARAGRAPH_SEPARATOR = /\r\n|\r|\n/;
/** Word's hard line break inside a paragraph, which the package builder renders as `<w:br/>`. */
const LINE_BREAK = '\x0b';
/** The mark Word writes at the end of every table cell and row. */
const TABLE_CELL_MARK = '\x07';
/** The anchors an inline picture and a drawn object hang from. */
const PICTURE_ANCHOR = /[\x01\x08]/g;
const PAGE_BREAK = /\x0c/g;
/** A field: its code between `0x13` and `0x14`, its result between `0x14` and `0x15`. */
const FIELD = /\x13[^\x13\x14\x15]*(?:\x14([^\x13\x14\x15]*))?\x15/;
/** Everything else Word may leave behind. A tab is text here, as it is for the text converter. */
const OTHER_CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g;

/**
 * The reader ships no type declarations, so the surface this converter uses is declared here rather
 * than in a file of its own, and it is loaded through `createRequire` because it is CommonJS. Each
 * accessor returns one string for the whole part.
 */
interface ReaderOptions {
  filterUnicode?: boolean;
}

interface WordDocument {
  getBody(options?: ReaderOptions): string;
  getHeaders(options?: ReaderOptions & { includeFooters?: boolean }): string;
  getFooters(options?: ReaderOptions): string;
  getFootnotes(options?: ReaderOptions): string;
  getEndnotes(options?: ReaderOptions): string;
  getAnnotations(options?: ReaderOptions): string;
  getTextboxes(options?: ReaderOptions): string;
}

type WordExtractorConstructor = new () => { extract(source: Buffer): Promise<WordDocument> };

let readerConstructor: WordExtractorConstructor | undefined;

/** Loaded on the first `.doc` rather than at import: nothing else in the product reads one. */
function reader(): WordExtractorConstructor {
  readerConstructor ??= createRequire(import.meta.url)('word-extractor') as WordExtractorConstructor;
  return readerConstructor;
}

/**
 * The reader's own filter rewrites curly quotes, en and em dashes, and en and em spaces to ASCII.
 * That would edit the author's characters inside a conversion that says it kept them, and a Chinese
 * manuscript is written in exactly those quotation marks, so it stays off.
 */
const READER_OPTIONS: ReaderOptions = { filterUnicode: false };

function requireDoc(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`${DOC_CONVERSION_REFUSED}:${reason}`);
}

/** True for the refusal this module raises, so a caller can route it without matching on text. */
export function isDocConversionRefusal(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(`${DOC_CONVERSION_REFUSED}:`);
}

function hasOleSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < OLE_COMPOUND_FILE_SIGNATURE.length) return false;
  return OLE_COMPOUND_FILE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * One part of the document as a count of what it carried. A part is a single string, so its content
 * is counted by the lines that hold anything: a part of blank lines carried nothing and counts as
 * nothing, which is why a header area that exists but is empty never claims a dropped header.
 */
function countedSegments(value: string): number {
  return value.split(PARAGRAPH_SEPARATOR).filter((segment) => segment.trim().length > 0).length;
}

/**
 * What the reader exposes outside the body, counted into the classes the review already has. Every
 * one of these parts is dropped by the conversion: the working representation carries the body and
 * nothing else (ADR 0072 §3).
 */
function countPartLoss(document: WordDocument, loss: ConversionLoss): void {
  // Headers are asked for without footers, because the reader appends the footers to them by
  // default and the same footer must not be counted twice.
  loss.headersFooters +=
    countedSegments(document.getHeaders({ ...READER_OPTIONS, includeFooters: false })) +
    countedSegments(document.getFooters(READER_OPTIONS));
  loss.notes +=
    countedSegments(document.getFootnotes(READER_OPTIONS)) +
    countedSegments(document.getEndnotes(READER_OPTIONS));
  loss.commentsRevisions += countedSegments(document.getAnnotations(READER_OPTIONS));
  // A textbox is floating content with no place in a single ordered manuscript, so it is dropped.
  loss.imagesCaptions += countedSegments(document.getTextboxes(READER_OPTIONS));
}

/** A field's result text is kept, its code is dropped, and the field itself is counted once. */
function resolveFields(text: string, loss: ConversionLoss): string {
  let resolved = text;
  for (let field = FIELD.exec(resolved); field !== null; field = FIELD.exec(resolved)) {
    loss.inlineStyles += 1;
    resolved = resolved.slice(0, field.index) + (field[1] ?? '') + resolved.slice(field.index + field[0].length);
  }
  return resolved;
}

function countAndStrip(text: string, pattern: RegExp, count: (total: number) => void): string {
  const matches = text.match(pattern);
  if (matches !== null) count(matches.length);
  return text.replace(pattern, '');
}

/**
 * The body as the paragraphs the working representation carries, with every marker the reader left
 * in it counted into its class and removed from the text. An empty paragraph is dropped and counted
 * as nothing: a blank line is layout, and the review must not report it as lost content.
 *
 * A table is counted by its extent rather than by its marks — one entry per run of consecutive
 * paragraphs that carry a cell mark — so a table of a hundred cells reads as one table lost.
 */
function bodyParagraphs(body: string, loss: ConversionLoss): ConvertedParagraph[] {
  const paragraphs: ConvertedParagraph[] = [];
  let insideTable = false;
  for (const raw of body.split(PARAGRAPH_SEPARATOR)) {
    const withoutFields = resolveFields(raw, loss);
    const inTableRow = withoutFields.includes(TABLE_CELL_MARK);
    if (inTableRow && !insideTable) loss.tables += 1;
    insideTable = inTableRow;
    let text = withoutFields.split(TABLE_CELL_MARK).join('');
    text = countAndStrip(text, PICTURE_ANCHOR, (total) => { loss.imagesCaptions += total; });
    text = countAndStrip(text, PAGE_BREAK, (total) => { loss.sections += total; });
    const lines = text.split(LINE_BREAK).map((line) => line.replace(OTHER_CONTROL, ''));
    if (lines.join('').length === 0) continue;
    paragraphs.push({ lines });
  }
  return paragraphs;
}

/**
 * Convert a legacy binary Word manuscript into the DOCX working representation the product reads it
 * through. The result is never the digest of record: the caller keeps the original file and its
 * digest as the Source Version's identity (ADR 0072 §2).
 *
 * The router sends this only what the format sniffer identified as DOC; the signature is checked
 * again here because the sniffer read a window and this reads the whole file.
 */
export async function convertDocManuscript(bytes: Uint8Array): Promise<ConvertedDocManuscript> {
  requireDoc(bytes.byteLength > 0, '所选文件为空，无法转换。');
  requireDoc(hasOleSignature(bytes), '文件不是旧版 Word 文档，无法转换。');
  let document: WordDocument;
  try {
    const Reader = reader();
    document = await new Reader().extract(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    // The reader's own message is not repeated: it is written for a developer, and a message about
    // a manuscript is one of the places a manuscript can leak.
    throw new Error(`${DOC_CONVERSION_REFUSED}:无法读取该旧版 Word 文档的内容。`);
  }
  const loss = emptyLoss();
  countPartLoss(document, loss);
  const paragraphs = bodyParagraphs(document.getBody(READER_OPTIONS), loss);
  requireDoc(
    paragraphs.some((paragraph) => paragraph.lines.join('').trim().length > 0),
    '文件没有可转换为稿件的文本内容。',
  );
  return { docx: buildManuscriptPackage(paragraphs), loss };
}
