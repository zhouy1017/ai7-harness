import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename, extname, posix } from 'node:path';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  type FidelityCategoryKey,
  type FidelityCategoryProjection,
  type ManuscriptConversionProjection,
  type TextBoxDisposition,
} from '../shared/protocol.js';
import type { ConversionLoss } from './text-manuscript.js';

/**
 * How a text box enters the Manuscript (ADR 0086 §2): kept as a text box with the Source Version, the
 * default, or merged into the body right after the paragraph that anchors it.
 */
export type { TextBoxDisposition };

/** The intake router applies this same bound to a file of any format before it is retained. */
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 96 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_COUNT = 256;
const MAX_METADATA_XML_BYTES = 1024 * 1024;
const MAX_BLOCK_COUNT = 100_000;
const MAX_TEXT_CODE_UNITS = 10_000_000;
const MAX_ZIP_RATIO = 2_000;
const MAX_XML_FEED_BYTES = MAX_BLOCK_CODE_UNITS;
const MAX_XML_TEXT_TOKEN_CODE_UNITS = MAX_BLOCK_CODE_UNITS;
const MAX_XML_MARKUP_TOKEN_CODE_UNITS = MAX_BLOCK_CODE_UNITS * 8;
const MAX_XML_NESTING_DEPTH = 128;
/** A document may carry at most this many text boxes; each is one record the review can offer to merge. */
const MAX_TEXT_BOXES = 10_000;
/**
 * The parser identity every review is rebuilt under (ADR 0086). Revision 2 reads text boxes instead of
 * refusing the file, counts fields, records which source paragraph every block came from, and reports
 * ten content classes; revision 1's eight-row report stays rebuildable through its frozen builder, so a
 * review recorded under it still reads back exactly (`buildFidelityReportV1`).
 */
export const DOCX_PARSER_IDENTITY = 'ai7-docx-fflate-saxes/2';
/** The identity of every review written before revision 2: eight classes, rebuilt by the frozen builder. */
export const DOCX_PARSER_IDENTITY_V1 = 'ai7-docx-fflate-saxes/1';

export interface ImportFidelityDegradation {
  categoryKey: FidelityCategoryKey;
  label: string;
  count: number;
}

export interface ImportFidelityPlan {
  outcome: 'clean-import-no-round-trip' | 'degraded-import-no-round-trip';
  degradations: ImportFidelityDegradation[];
  /**
   * The disposition a revision-2 report of a natively read file states for its text boxes, or null
   * when it has none to state: no text box, a converted file (whose converter dropped them), or a
   * revision-1 report (which refused every file that had one).
   */
  textBoxDisposition: TextBoxDisposition | null;
}

export interface ParsedDocxBlock {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
  /**
   * Which `w:p` of `word/document.xml` the block came from: the 0-based index of that element among
   * every `w:p` start tag of the part, in document order (ADR 0086 §3). Nothing else in the block
   * depends on it, so block identities and digests stay what revision 1 made them.
   */
  sourceParagraphIndex: number;
}

/** One non-empty paragraph of a text box, in the form it would take as a Manuscript block. */
export interface ParsedTextBoxParagraph {
  /** 1-based among the non-empty paragraphs of its box. */
  boxParagraphOrdinal: number;
  /** The paragraph's own `w:p` index, counted exactly as a block's is. */
  sourceParagraphIndex: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
}

/**
 * One text box as the parser read it (ADR 0086 §2): which body paragraph anchors it and its non-empty
 * paragraphs. Its paragraphs are never blocks of the body; the review decides whether they merge.
 */
export interface ParsedTextBox {
  /** 1-based, in document order. */
  boxOrdinal: number;
  /** The `w:p` index of the body paragraph the box is anchored in. */
  anchorParagraphIndex: number;
  paragraphs: ParsedTextBoxParagraph[];
}

export interface ParsedDocx {
  parserIdentity: typeof DOCX_PARSER_IDENTITY;
  sourceDigest: string;
  contentDigest: string;
  structureDigest: string;
  archiveBytes: number;
  blockCount: number;
  characterCount: number;
  fidelity: FidelityCategoryProjection[];
  textBoxes: ParsedTextBox[];
  titleSuggestion: {
    value: string;
    sourceLabel: 'DOCX 标题元数据' | '文件名';
  };
}

export interface DocumentSignals {
  inlineStyles: number;
  commentsRevisions: number;
  notes: number;
  tables: number;
  imagesCaptions: number;
  sections: number;
  textBoxes: number;
  fields: number;
}

/** The six body signals a revision-1 report counted; kept only to rebuild such a report exactly. */
type DocumentSignalsV1 = Omit<DocumentSignals, 'textBoxes' | 'fields'>;

/**
 * A conversion whose loss the report counts and names (ADR 0072 §3). The labels stay the class's:
 * what changes is that a class carrying conversion loss says who converted the file and what that
 * converter did with the content. What a converter lost is never retained with the file — the working
 * representation does not hold it — so such a class keeps the label it had before ADR 0086.
 */
export interface FidelityConversion {
  identity: string;
  sourceFormat: ManuscriptConversionProjection['sourceFormat'];
  loss: ConversionLoss;
}

/** A revision-1 conversion: the seven counted classes that report carried. */
interface FidelityConversionV1 {
  identity: string;
  sourceFormat: ManuscriptConversionProjection['sourceFormat'];
  loss: Omit<ConversionLoss, 'textBoxes' | 'fields'>;
}

/**
 * What each converter did to the content a class counts. A text conversion keeps the author's
 * characters and loses only the structure they spelled out; a `.doc` conversion drops content the
 * reader could not carry across. One prefix cannot say both, so the review says which happened.
 *
 * An identity absent from this map cannot be phrased: `buildFidelityReport` refuses to write such a
 * detail and `deriveImportFidelityPlan` refuses to plan a report that names one, so a converter can
 * never reach the editor with a review nobody can reconstruct.
 */
const CONVERSION_LOSS_PHRASES: Readonly<Record<string, string>> = {
  'ai7-text-to-docx/1': '转换保留为原文字符',
  'ai7-doc-to-docx/1': '转换时未能保留',
};

/**
 * What a persisted converted report can be rebuilt from. The loss is not stored per class and does
 * not need to be: a converted DOCX gives the parser no signal of its own, so every count in such a
 * report is the conversion's and `count > 0` is exactly `loss > 0`.
 */
export type FidelityConversionIdentity = Omit<FidelityConversion, 'loss'>;

interface DocumentParseResult {
  blockCount: number;
  characterCount: number;
  contentDigest: string;
  structureDigest: string;
  signals: DocumentSignals;
  textBoxes: ParsedTextBox[];
}

function requireDocx(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOCX_REJECTED:${message}`);
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') requireDocx(value.isWellFormed(), 'non-canonical text');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireDocx(encoded !== undefined, 'non-canonical value');
  return encoded;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

/**
 * The `.docx` extension is asked for only when nothing else has established the format. The intake
 * router identifies a manuscript from its content (ADR 0072 §1) and says so, because a DOCX under
 * any other name is still a DOCX; a caller that parses a file on the name alone keeps the check.
 */
function safeDisplayName(input: string, requireDocxExtension = true): string {
  requireDocx(input.isWellFormed(), 'invalid display name');
  const name = basename(input).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireDocx(name.length > 0 && name.length <= 180, 'invalid display name');
  if (requireDocxExtension) requireDocx(extname(name).toLowerCase() === '.docx', 'selected file is not DOCX');
  return name;
}

function validateEntryName(name: string, seen: Set<string>): string {
  requireDocx(name.length > 0 && name.length <= 240, 'invalid ZIP entry name');
  requireDocx(!name.includes('\\') && !name.includes('\u0000'), 'non-canonical ZIP entry name');
  requireDocx(!name.startsWith('/') && !/^[A-Za-z]:/.test(name), 'absolute ZIP entry name');
  const normalized = posix.normalize(name);
  requireDocx(normalized === name && !normalized.startsWith('../') && normalized !== '..', 'traversal ZIP entry');
  const identity = normalized.toLocaleLowerCase('en-US');
  requireDocx(!seen.has(identity), 'duplicate ZIP entry');
  seen.add(identity);
  return normalized;
}

function decodeMetadataXml(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  requireDocx(!/<!DOCTYPE|<!ENTITY/i.test(text), 'DTD or entity declaration');
  return text;
}

function attributeValue(tag: SaxesTagNS, localName: string): string | undefined {
  return Object.values(tag.attributes).find((attribute) => attribute.local === localName)?.value;
}

function hasExactStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function parseCoreTitle(xml: string | undefined): string | undefined {
  if (!xml) return undefined;
  let inTitle = 0;
  let depth = 0;
  let value = '';
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireDocx(false, 'DOCTYPE in core properties'));
  parser.on('processinginstruction', () => requireDocx(false, 'processing instruction in core properties'));
  parser.on('opentag', (tag) => {
    requireDocx(depth < MAX_XML_NESTING_DEPTH, 'core properties XML nesting exceeds its safe bound');
    depth += 1;
    if (tag.local === 'title') inTitle += 1;
  });
  parser.on('text', (text) => {
    if (inTitle > 0) value += text;
  });
  parser.on('closetag', (tag) => {
    if (tag.local === 'title') inTitle -= 1;
    requireDocx(depth > 0, 'core properties element stack mismatch');
    depth -= 1;
  });
  parser.write(xml).close();
  requireDocx(depth === 0, 'core properties element stack mismatch');
  requireDocx(value.isWellFormed(), 'invalid title text');
  const normalized = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= 180 ? normalized : undefined;
}

interface OpenParagraph {
  text: string;
  style: string | undefined;
  sourceParagraphIndex: number;
}

/** What a paragraph style makes of a block: a title, a heading of level 1 to 6, or a body paragraph. */
function blockShape(style: string | undefined): { kind: ParsedDocxBlock['kind']; level: number | null } {
  const normalized = style?.toLocaleLowerCase('en-US') ?? '';
  const headingMatch = /(?:heading|标题)\s*([1-6])/.exec(normalized);
  const kind = normalized === 'title' || normalized === '标题' ? 'title' : headingMatch ? 'heading' : 'paragraph';
  return { kind, level: kind === 'title' ? 1 : headingMatch ? Number(headingMatch[1]) : null };
}

/** A paragraph's collected text as a block carries it, or the empty string for one that holds none. */
function paragraphBlockText(open: OpenParagraph): string {
  requireDocx(open.text.isWellFormed(), 'paragraph contains invalid text');
  return open.text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/**
 * Read `word/document.xml` as a stream. Every body paragraph with text becomes one block; a text box
 * (`w:txbxContent`, whether DrawingML's `wps:txbx` or VML's `v:textbox` holds it) is read as a box of
 * its own instead of being refused, and its paragraphs are kept apart from the body (ADR 0086 §2).
 * Markup-compatibility alternatives are read once: the first `mc:Choice` of an `mc:AlternateContent`,
 * never its `mc:Fallback`, which repeats the same content — so a Word text box is one box, not two.
 */
function createDocumentParser(
  onBlock: (block: ParsedDocxBlock) => void,
): { write(chunk: Uint8Array, final: boolean): void; finish(): DocumentParseResult } {
  const signals: DocumentSignals = {
    inlineStyles: 0,
    commentsRevisions: 0,
    notes: 0,
    tables: 0,
    imagesCaptions: 0,
    sections: 0,
    textBoxes: 0,
    fields: 0,
  };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const contentHash = createHash('sha256');
  const structureHash = createHash('sha256');
  structureHash.update('[');
  let textCodeUnits = 0;
  let characterCount = 0;
  let blockCount = 0;
  let textDepth = 0;
  let closed = false;
  const ancestors: string[] = [];
  let runProperties: { depth: number; styled: boolean } | undefined;
  let terminalSectionSeen = false;
  let terminalSection: { depth: number; attributeCount: number; descendantCount: number } | undefined;
  // Every `w:p` start tag of the part takes the next index, whether it is read or skipped, so an
  // index names exactly one element of `word/document.xml` (ADR 0086 §3).
  let nextParagraphIndex = 0;
  let paragraph: OpenParagraph | undefined;
  let textBox: { record: ParsedTextBox; depth: number } | undefined;
  let boxParagraph: OpenParagraph | undefined;
  let boxParagraphCount = 0;
  const textBoxes: ParsedTextBox[] = [];
  // A drawing (`w:drawing`, `w:pict`) that holds a text box counts as that text box, never as an image.
  const drawings: Array<{ depth: number; holdsTextBox: boolean }> = [];
  const alternates: Array<{ depth: number; choiceRead: boolean }> = [];
  let skippedFrom: number | undefined;
  let xmlTokenCodeUnits = 0;
  let inXmlMarkup = false;
  let xmlMarkupQuote: '"' | "'" | undefined;

  const guardXmlTokenBounds = (text: string): void => {
    for (const character of text) {
      if (!inXmlMarkup && character === '<') {
        inXmlMarkup = true;
        xmlMarkupQuote = undefined;
        xmlTokenCodeUnits = 1;
      } else if (inXmlMarkup) {
        xmlTokenCodeUnits += character.length;
        requireDocx(xmlTokenCodeUnits <= MAX_XML_MARKUP_TOKEN_CODE_UNITS, 'document XML markup token exceeds its bound');
        if (xmlMarkupQuote) {
          if (character === xmlMarkupQuote) xmlMarkupQuote = undefined;
        } else if (character === '"' || character === "'") {
          xmlMarkupQuote = character;
        } else if (character === '>') {
          inXmlMarkup = false;
          xmlTokenCodeUnits = 0;
        }
      } else {
        xmlTokenCodeUnits += character.length;
        requireDocx(xmlTokenCodeUnits <= MAX_XML_TEXT_TOKEN_CODE_UNITS, 'document XML text token exceeds its block bound');
      }
    }
  };

  /** Text belongs to the innermost open paragraph: a text box's own, while one is open. */
  const openParagraph = (): OpenParagraph | undefined => (textBox === undefined ? paragraph : boxParagraph);

  const appendParagraphText = (addition: string): void => {
    const target = openParagraph();
    if (!target || addition.length === 0) return;
    requireDocx(addition.length <= MAX_BLOCK_CODE_UNITS, 'paragraph text chunk exceeds the bounded block size');
    requireDocx(
      target.text.length <= MAX_BLOCK_CODE_UNITS - addition.length,
      'paragraph exceeds the bounded block size',
    );
    requireDocx(textCodeUnits <= MAX_TEXT_CODE_UNITS - addition.length, 'document text is too large');
    const nextText = target.text + addition;
    requireDocx(graphemeCount(nextText) <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
    target.text = nextText;
    textCodeUnits += addition.length;
  };

  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireDocx(false, 'DOCTYPE in document XML'));
  parser.on('processinginstruction', () => requireDocx(false, 'processing instruction in document XML'));
  parser.on('opentag', (tag) => {
    requireDocx(ancestors.length < MAX_XML_NESTING_DEPTH, 'document XML nesting exceeds its safe bound');
    const sourceParagraphIndex = tag.local === 'p' ? nextParagraphIndex++ : -1;
    if (skippedFrom !== undefined) {
      ancestors.push(tag.local);
      return;
    }
    const parent = ancestors.at(-1);
    const grandparent = ancestors.at(-2);
    if (terminalSectionSeen && parent === 'body') requireDocx(false, 'terminal section properties are not terminal');
    if (terminalSection && tag.local !== 'sectPr') terminalSection.descendantCount += 1;
    if (runProperties) runProperties.styled = true;
    switch (tag.local) {
      case 'AlternateContent':
        alternates.push({ depth: ancestors.length, choiceRead: false });
        break;
      case 'Choice':
      case 'Fallback': {
        const alternate = alternates.at(-1);
        if (alternate !== undefined && alternate.depth === ancestors.length - 1) {
          if (tag.local === 'Choice' && !alternate.choiceRead) alternate.choiceRead = true;
          else skippedFrom = ancestors.length;
        }
        break;
      }
      case 'p':
        if (textBox === undefined) {
          requireDocx(paragraph === undefined, 'nested paragraph');
          paragraph = { text: '', style: undefined, sourceParagraphIndex };
        } else {
          requireDocx(boxParagraph === undefined, 'nested paragraph');
          boxParagraph = { text: '', style: undefined, sourceParagraphIndex };
        }
        break;
      case 'pStyle': {
        const open = openParagraph();
        if (open) open.style = attributeValue(tag, 'val');
        break;
      }
      case 't':
        textDepth += 1;
        break;
      case 'rPr':
        requireDocx(runProperties === undefined, 'nested run properties');
        runProperties = { depth: ancestors.length, styled: false };
        break;
      case 'tab':
        appendParagraphText('\t');
        break;
      case 'br':
      case 'cr':
        appendParagraphText('\n');
        break;
      case 'b':
      case 'i':
      case 'u':
      case 'strike':
      case 'color':
      case 'highlight':
        if (!runProperties) signals.inlineStyles += 1;
        break;
      case 'commentRangeStart':
      case 'commentReference':
      case 'ins':
      case 'del':
        signals.commentsRevisions += 1;
        break;
      case 'footnoteReference':
      case 'endnoteReference':
        signals.notes += 1;
        break;
      case 'tbl':
        signals.tables += 1;
        break;
      case 'drawing':
      case 'pict':
        drawings.push({ depth: ancestors.length, holdsTextBox: false });
        break;
      case 'txbxContent': {
        requireDocx(textBox === undefined, 'nested text box');
        requireDocx(paragraph !== undefined, 'text box outside a paragraph');
        requireDocx(textBoxes.length < MAX_TEXT_BOXES, 'too many text boxes');
        const drawing = drawings.at(-1);
        if (drawing !== undefined) drawing.holdsTextBox = true;
        textBox = {
          record: { boxOrdinal: textBoxes.length + 1, anchorParagraphIndex: paragraph.sourceParagraphIndex, paragraphs: [] },
          depth: ancestors.length,
        };
        signals.textBoxes += 1;
        break;
      }
      case 'fldSimple':
        signals.fields += 1;
        break;
      case 'fldChar':
        // A complex field is counted once, at its begin mark; its separate and end marks close it.
        if (attributeValue(tag, 'fldCharType') === 'begin') signals.fields += 1;
        break;
      case 'sectPr':
        if (parent === 'body') {
          requireDocx(!terminalSectionSeen && terminalSection === undefined, 'duplicate terminal section properties');
          terminalSection = {
            depth: ancestors.length,
            attributeCount: Object.keys(tag.attributes).length,
            descendantCount: 0,
          };
        } else if (parent === 'pPr' && grandparent === 'p') signals.sections += 1;
        else requireDocx(false, 'unsupported section properties');
        break;
      default:
        break;
    }
    ancestors.push(tag.local);
  });
  parser.on('text', (text) => {
    if (skippedFrom === undefined && textDepth > 0) appendParagraphText(text);
  });
  parser.on('closetag', (tag) => {
    requireDocx(ancestors.pop() === tag.local, 'document element stack mismatch');
    if (skippedFrom !== undefined) {
      if (ancestors.length === skippedFrom) skippedFrom = undefined;
      return;
    }
    if (tag.local === 't') textDepth -= 1;
    if (tag.local === 'rPr') {
      requireDocx(runProperties?.depth === ancestors.length, 'run properties state mismatch');
      if (runProperties.styled) signals.inlineStyles += 1;
      runProperties = undefined;
    }
    if (tag.local === 'sectPr' && terminalSection?.depth === ancestors.length) {
      if (terminalSection.attributeCount > 0 || terminalSection.descendantCount > 0) signals.sections += 1;
      terminalSectionSeen = true;
      terminalSection = undefined;
    }
    if (tag.local === 'AlternateContent' && alternates.at(-1)?.depth === ancestors.length) alternates.pop();
    if ((tag.local === 'drawing' || tag.local === 'pict') && drawings.at(-1)?.depth === ancestors.length) {
      if (!drawings.pop()!.holdsTextBox) signals.imagesCaptions += 1;
    }
    if (tag.local === 'txbxContent' && textBox?.depth === ancestors.length) {
      requireDocx(boxParagraph === undefined, 'text box paragraph state mismatch');
      textBoxes.push(textBox.record);
      textBox = undefined;
    }
    if (tag.local !== 'p') return;
    if (textBox !== undefined) {
      requireDocx(boxParagraph, 'paragraph state missing');
      const text = paragraphBlockText(boxParagraph);
      if (text.length > 0) {
        const graphemeLength = graphemeCount(text);
        requireDocx(text.length <= MAX_BLOCK_CODE_UNITS && graphemeLength <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
        // A merged box paragraph becomes a block, so the body and every box share the block bound.
        requireDocx(blockCount + boxParagraphCount < MAX_BLOCK_COUNT, 'too many manuscript blocks');
        const { kind, level } = blockShape(boxParagraph.style);
        textBox.record.paragraphs.push({
          boxParagraphOrdinal: textBox.record.paragraphs.length + 1,
          sourceParagraphIndex: boxParagraph.sourceParagraphIndex,
          kind,
          level,
          text,
          digest: sha256(canonicalJson({ kind, level, text })),
          graphemeLength,
        });
        boxParagraphCount += 1;
      }
      boxParagraph = undefined;
      return;
    }
    requireDocx(paragraph, 'paragraph state missing');
    const text = paragraphBlockText(paragraph);
    if (text.length > 0) {
      const blockGraphemes = graphemeCount(text);
      requireDocx(text.length <= MAX_BLOCK_CODE_UNITS && blockGraphemes <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
      requireDocx(blockCount + boxParagraphCount < MAX_BLOCK_COUNT, 'too many manuscript blocks');
      const { kind, level } = blockShape(paragraph.style);
      const position = blockCount + 1;
      const digest = sha256(canonicalJson({ kind, level, text }));
      const block = {
        blockId: `blk_${sha256(`${position}\u0000${digest}`).slice(0, 24)}`,
        position,
        kind,
        level,
        text,
        digest,
        graphemeLength: blockGraphemes,
        sourceParagraphIndex: paragraph.sourceParagraphIndex,
      } satisfies ParsedDocxBlock;
      if (blockCount > 0) contentHash.update('\u001e');
      contentHash.update(text);
      if (blockCount > 0) structureHash.update(',');
      structureHash.update(canonicalJson({ blockId: block.blockId, position, kind, level, digest }));
      blockCount += 1;
      characterCount += blockGraphemes;
      onBlock(block);
    }
    paragraph = undefined;
  });

  return {
    write(chunk, final) {
      requireDocx(!closed, 'document XML stream repeated');
      for (let offset = 0; offset < chunk.byteLength; offset += MAX_XML_FEED_BYTES) {
        const part = chunk.subarray(offset, Math.min(offset + MAX_XML_FEED_BYTES, chunk.byteLength));
        const text = decoder.decode(part, { stream: true });
        if (text.length > 0) {
          guardXmlTokenBounds(text);
          parser.write(text);
        }
      }
      if (final) {
        const tail = decoder.decode();
        if (tail.length > 0) {
          guardXmlTokenBounds(tail);
          parser.write(tail);
        }
        parser.close();
        closed = true;
      }
    },
    finish() {
      requireDocx(closed, 'document XML stream incomplete');
      requireDocx(
        paragraph === undefined && boxParagraph === undefined && textBox === undefined && skippedFrom === undefined &&
          drawings.length === 0 && alternates.length === 0 && textDepth === 0 && ancestors.length === 0 &&
          runProperties === undefined && terminalSection === undefined,
        'incomplete document XML state',
      );
      requireDocx(blockCount > 0, 'DOCX contains no editable text blocks');
      return {
        blockCount,
        characterCount,
        contentDigest: contentHash.digest('hex'),
        structureDigest: structureHash.update(']').digest('hex'),
        signals,
        textBoxes,
      };
    },
  };
}

async function readStreamingArchive(
  path: string,
  onBlock: (block: ParsedDocxBlock) => void,
  options: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void } = {},
): Promise<{
  sourceDigest: string;
  archiveBytes: number;
  entryNames: string[];
  metadata: Map<string, Uint8Array>;
  document: DocumentParseResult;
}> {
  const metadataNames = new Set(['[Content_Types].xml', 'docProps/core.xml']);
  const metadata = new Map<string, Uint8Array>();
  const entryNames: string[] = [];
  const seen = new Set<string>();
  const sourceHash = createHash('sha256');
  const documentParser = createDocumentParser(onBlock);
  let archiveBytes = 0;
  let expandedBytes = 0;
  let documentSeen = false;
  let callbackFailure: Error | undefined;

  const unzip = new Unzip((file) => {
    try {
      const name = validateEntryName(file.name, seen);
      entryNames.push(name);
      requireDocx(entryNames.length <= MAX_ENTRY_COUNT, 'too many ZIP entries');
      requireDocx(file.compression === 0 || file.compression === 8, 'unsupported ZIP compression');
      if (file.originalSize !== undefined && file.originalSize > 0) {
        requireDocx(file.originalSize <= MAX_ENTRY_BYTES, 'ZIP entry is too large');
      }
      requireDocx(
        !/(^|\/)(vbaProject\.bin|embeddings|activeX)(\/|$)/i.test(name) && !name.endsWith('.bin'),
        'active or embedded content is outside this import',
      );
      if (name.endsWith('/')) return;
      if (name === 'word/document.xml') {
        requireDocx(!documentSeen, 'duplicate document XML');
        documentSeen = true;
        let received = 0;
        file.ondata = (error, chunk, final) => {
          try {
            if (error) throw error;
            received += chunk.byteLength;
            expandedBytes += chunk.byteLength;
            requireDocx(received <= MAX_ENTRY_BYTES && expandedBytes <= MAX_EXPANDED_BYTES, 'document XML exceeded its bound');
            documentParser.write(chunk, final);
          } catch (failure) {
            callbackFailure = failure instanceof Error ? failure : new Error(String(failure));
          }
        };
        file.start();
        return;
      }
      if (!metadataNames.has(name)) {
        file.ondata = (error, chunk) => {
          try {
            if (error) throw error;
            expandedBytes += chunk.byteLength;
            requireDocx(expandedBytes <= MAX_EXPANDED_BYTES, 'expanded DOCX is too large');
          } catch (failure) {
            callbackFailure = failure instanceof Error ? failure : new Error(String(failure));
          }
        };
        file.start();
        return;
      }
      if (file.originalSize !== undefined && file.originalSize > 0) {
        requireDocx(file.originalSize <= MAX_METADATA_XML_BYTES, 'metadata XML entry is too large');
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      file.ondata = (error, chunk, final) => {
        try {
            if (error) throw error;
            received += chunk.byteLength;
            expandedBytes += chunk.byteLength;
            requireDocx(received <= MAX_METADATA_XML_BYTES && expandedBytes <= MAX_EXPANDED_BYTES, 'metadata XML exceeded its bound');
          chunks.push(chunk);
          if (final) {
            const joined = new Uint8Array(received);
            let offset = 0;
            for (const part of chunks) {
              joined.set(part, offset);
              offset += part.byteLength;
            }
            metadata.set(name, joined);
          }
        } catch (failure) {
          callbackFailure = failure instanceof Error ? failure : new Error(String(failure));
        }
      };
      file.start();
    } catch (error) {
      callbackFailure = error instanceof Error ? error : new Error(String(error));
    }
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024, signal: options.signal })) {
    archiveBytes += chunk.byteLength;
    options.onArchiveProgress?.(archiveBytes);
    requireDocx(archiveBytes <= MAX_ARCHIVE_BYTES, 'DOCX archive is too large');
    sourceHash.update(chunk);
    unzip.push(chunk, false);
    if (callbackFailure) throw callbackFailure;
  }
  requireDocx(archiveBytes > 0, 'empty DOCX');
  unzip.push(new Uint8Array(0), true);
  if (callbackFailure) throw callbackFailure;
  if (expandedBytes > 1_048_576) requireDocx(expandedBytes / archiveBytes <= MAX_ZIP_RATIO, 'suspicious ZIP ratio');
  requireDocx(metadata.has('[Content_Types].xml') && documentSeen, 'not a WordprocessingML DOCX');
  return {
    sourceDigest: sourceHash.digest('hex'),
    archiveBytes,
    entryNames,
    metadata,
    document: documentParser.finish(),
  };
}

function fidelityReport(signals: DocumentSignals, entryNames: string[]): FidelityCategoryProjection[] {
  return buildFidelityReport(signals, entryNames.filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)).length);
}

/** The status a class present in the file carries when its content stays with the Source Version. */
const RETAINED = { status: 'retained', statusLabel: '完整保留（随文件保留）' } as const;
const PRESERVED = { status: 'preserved', statusLabel: '完整保留' } as const;
const DEGRADED = { status: 'degraded', statusLabel: '降级导入' } as const;
const UNSUPPORTED = { status: 'unsupported', statusLabel: '不支持导入' } as const;

/** What an edit costs a retained class, stated when it is known — at export — and never guessed here. */
const EDITED_PARAGRAPH_LINE = '改过的段落，导出时逐段说明格式能否原样恢复。';

/**
 * The text-box row's detail under each disposition (ADR 0086 §2): the one class whose detail depends on
 * a choice, which is why a review is rebuilt from its counts and that choice.
 */
const TEXT_BOX_DETAILS: Readonly<Record<TextBoxDisposition, string>> = {
  retain: '保留为文本框：文本框随来源版本保留，不显示在稿件中，导出时恢复。',
  merge: '并入正文：文本框中的段落进入稿件，紧接在锚定它的段落之后；导出时不再写出原文本框。',
};

/**
 * The ten content classes with their counts, labels, and details (V2-UX-IMP-002 to 004, ADR 0086). Nine
 * are rows; the tenth, `round-trip-export`, is the closing 预计往返 card and always counts nothing.
 *
 * A class present in a natively read file is `完整保留（随文件保留）` when its content stays with the Source
 * Version and is restored on export — inline styles, tables, images, sections, headers and footers, text
 * boxes — and `降级导入` when it cannot be retained: notes, until the Manuscript has a note block, and
 * fields, whose displayed text no longer updates. Comments and revisions stay `不支持导入` until S62.
 *
 * A `conversion` adds its loss to the parser's counts and names itself in those classes' details. What a
 * converter lost is not in the working representation, so it cannot be retained: such a class keeps the
 * label it carried before ADR 0086, and the two new classes read `降级导入` (ADR 0086 §3).
 */
export function buildFidelityReport(
  signals: DocumentSignals,
  headersFooters: number,
  conversion?: FidelityConversion,
  textBoxDisposition: TextBoxDisposition = 'retain',
): FidelityCategoryProjection[] {
  const loss = conversion?.loss;
  const count = {
    inlineStyles: signals.inlineStyles + (loss?.inlineStyles ?? 0),
    commentsRevisions: signals.commentsRevisions + (loss?.commentsRevisions ?? 0),
    notes: signals.notes + (loss?.notes ?? 0),
    tables: signals.tables + (loss?.tables ?? 0),
    imagesCaptions: signals.imagesCaptions + (loss?.imagesCaptions ?? 0),
    sections: signals.sections + (loss?.sections ?? 0),
    headersFooters: headersFooters + (loss?.headersFooters ?? 0),
    textBoxes: signals.textBoxes + (loss?.textBoxes ?? 0),
    fields: signals.fields + (loss?.fields ?? 0),
  };
  const phrase = conversion === undefined ? undefined : CONVERSION_LOSS_PHRASES[conversion.identity];
  requireDocx(conversion === undefined || phrase !== undefined, 'unknown converter identity');
  const converted = (key: keyof typeof count): boolean => conversion !== undefined && loss![key] > 0;
  /**
   * One class: `absent` when it counts nothing; otherwise the converter's loss when a conversion
   * carried it, or the native reading when the parser found it.
   */
  const row = (
    key: FidelityCategoryKey,
    label: string,
    signal: keyof typeof count,
    absent: string,
    native: { status: typeof RETAINED | typeof DEGRADED | typeof UNSUPPORTED; detail: string },
    lost: { status: typeof DEGRADED | typeof UNSUPPORTED; detail: string },
  ): FidelityCategoryProjection => {
    const total = count[signal];
    if (total === 0) return { key, label, count: 0, ...PRESERVED, detail: absent };
    if (converted(signal)) {
      return { key, label, count: total, ...lost.status, detail: `由 ${conversion!.identity} 从 ${conversion!.sourceFormat} ${phrase}：${lost.detail}` };
    }
    return { key, label, count: total, ...native.status, detail: native.detail };
  };
  return [
    row('inline-styles', '行内样式', 'inlineStyles', '未检测到行内样式。',
      {
        status: RETAINED,
        detail: `检测到字体、字号、粗体、颜色等行内样式；稿件只编辑文字，这些样式随来源版本保留，未改过的段落导出时从原文件恢复。${EDITED_PARAGRAPH_LINE}`,
      },
      { status: DEGRADED, detail: '行内样式没有成为可编辑格式；可编辑内容块只保留文字，导出无法恢复这些样式。' }),
    row('comments-revisions', '批注与修订', 'commentsRevisions', '未检测到批注或修订标记。',
      { status: UNSUPPORTED, detail: '本次受限导入不导入批注或修订标记。' },
      { status: UNSUPPORTED, detail: '本次受限导入不导入批注或修订标记。' }),
    row('notes', '脚注与尾注', 'notes', '未检测到脚注或尾注。',
      {
        status: DEGRADED,
        detail: '稿件中既不显示脚注或尾注的引用标记，也不显示注文；注文随来源版本保留，稿件有注释块之前不能在稿件中编辑。未改过的段落导出时连同注释从原文件恢复。',
      },
      { status: UNSUPPORTED, detail: '本次受限导入不导入脚注或尾注。' }),
    row('tables', '表格', 'tables', '未检测到表格。',
      {
        status: RETAINED,
        detail: `单元格文字按阅读顺序作为段落进入稿件；表格结构随来源版本保留，未改过的段落导出时从原文件恢复。${EDITED_PARAGRAPH_LINE}`,
      },
      { status: DEGRADED, detail: '表格结构没有进入工作表示；稿件中只有其文字，导出无法恢复表格结构。' }),
    row('images-captions', '图片与图注', 'imagesCaptions', '未检测到图片或图注。',
      { status: RETAINED, detail: '图片随来源版本保留，导出时恢复；图注作为文字留在稿件中，稿件暂不显示图片占位。' },
      { status: DEGRADED, detail: '图片没有进入工作表示，稿件中不含图片，导出无法恢复。' }),
    row('sections', '分节（含页面设置）', 'sections', '未检测到分节或页面设置；正文按单一连续稿件顺序导入。',
      { status: RETAINED, detail: '页尺寸、页边距、分栏与文档网格等分节设置随来源版本保留，导出时恢复；稿件按单一连续顺序编辑正文。' },
      { status: DEGRADED, detail: '分节与页面设置没有进入工作表示；正文按单一连续稿件顺序导入，导出无法恢复原分节版式。' }),
    row('headers-footers', '页眉与页脚', 'headersFooters', '未检测到页眉或页脚。',
      { status: RETAINED, detail: '页眉与页脚不进入稿件正文，随来源版本保留，导出时恢复。' },
      { status: DEGRADED, detail: '页眉与页脚没有进入工作表示，不进入稿件，导出无法恢复。' }),
    row('text-boxes', '文本框', 'textBoxes', '未检测到文本框。',
      { status: RETAINED, detail: TEXT_BOX_DETAILS[textBoxDisposition] },
      { status: DEGRADED, detail: '文本框没有进入工作表示，不进入稿件，导出无法恢复。' }),
    row('fields', '域（目录等）', 'fields', '未检测到域。',
      {
        status: DEGRADED,
        detail: '目录、交叉引用、超链接等域按当前显示的文字进入稿件，之后不再更新；未改过的段落导出时从原文件恢复，改过的段落在导出保真审阅里逐段说明。',
      },
      { status: DEGRADED, detail: '域只保留当前显示的文字，之后不再更新。' }),
    {
      key: 'round-trip-export', label: '预计往返', count: 0, ...UNSUPPORTED,
      detail: 'DOCX 导出将在后续提供。届时从原文件恢复未改过的段落，以及随文件保留的页眉与页脚、页面设置、样式表、图片和保留为文本框的文本框；改过的段落在导出保真审阅里逐段说明能否原样恢复。样式表随文件保留，不单独计数。',
    },
  ];
}

/**
 * The eight classes exactly as parser identity `ai7-docx-fflate-saxes/1` reported them. Frozen: it
 * builds nothing new and exists so that a review recorded under revision 1 — staged, committed, or
 * reimported — still rebuilds byte for byte from its counts. Nothing may change a character of it.
 */
function buildFidelityReportV1(
  signals: DocumentSignalsV1,
  headersFooters: number,
  conversion?: FidelityConversionV1,
): FidelityCategoryProjection[] {
  const loss = conversion?.loss;
  const count = {
    inlineStyles: signals.inlineStyles + (loss?.inlineStyles ?? 0),
    commentsRevisions: signals.commentsRevisions + (loss?.commentsRevisions ?? 0),
    notes: signals.notes + (loss?.notes ?? 0),
    tables: signals.tables + (loss?.tables ?? 0),
    imagesCaptions: signals.imagesCaptions + (loss?.imagesCaptions ?? 0),
    sections: signals.sections + (loss?.sections ?? 0),
    headersFooters: headersFooters + (loss?.headersFooters ?? 0),
  };
  const phrase = conversion === undefined ? undefined : CONVERSION_LOSS_PHRASES[conversion.identity];
  requireDocx(conversion === undefined || phrase !== undefined, 'unknown converter identity');
  const detail = (key: keyof typeof count, text: string): string =>
    conversion && loss![key] > 0
      ? `由 ${conversion.identity} 从 ${conversion.sourceFormat} ${phrase}：${text}`
      : text;
  return [
    {
      key: 'inline-styles', label: '行内样式', count: count.inlineStyles,
      status: count.inlineStyles === 0 ? 'preserved' : 'degraded',
      statusLabel: count.inlineStyles === 0 ? '完整保留' : '降级导入',
      detail: detail('inlineStyles', count.inlineStyles === 0 ? '未检测到行内样式。' : '检测到字体与字号（rFonts、sz、szCs）等行内样式；可编辑内容块仅保留文字顺序，后续导出无法恢复这些样式。'),
    },
    {
      key: 'comments-revisions', label: '批注与修订', count: count.commentsRevisions,
      status: count.commentsRevisions === 0 ? 'preserved' : 'unsupported',
      statusLabel: count.commentsRevisions === 0 ? '完整保留' : '不支持导入',
      detail: detail('commentsRevisions', count.commentsRevisions === 0 ? '未检测到批注或修订标记。' : '本次受限导入不导入批注或修订标记。'),
    },
    {
      key: 'notes', label: '脚注与尾注', count: count.notes,
      status: count.notes === 0 ? 'preserved' : 'unsupported',
      statusLabel: count.notes === 0 ? '完整保留' : '不支持导入',
      detail: detail('notes', count.notes === 0 ? '未检测到脚注或尾注。' : '本次受限导入不导入脚注或尾注。'),
    },
    {
      key: 'tables', label: '表格', count: count.tables,
      status: count.tables === 0 ? 'preserved' : 'degraded',
      statusLabel: count.tables === 0 ? '完整保留' : '降级导入',
      detail: detail('tables', count.tables === 0 ? '未检测到表格。' : '表格会退化为连续文本；本次受限导入不提交该分支。'),
    },
    {
      key: 'images-captions', label: '图片与图注', count: count.imagesCaptions,
      status: count.imagesCaptions === 0 ? 'preserved' : 'degraded',
      statusLabel: count.imagesCaptions === 0 ? '完整保留' : '降级导入',
      detail: detail('imagesCaptions', count.imagesCaptions === 0 ? '未检测到图片或图注。' : '图片不会进入可编辑稿件；本次受限导入不提交该分支。'),
    },
    {
      key: 'sections', label: '分节', count: count.sections,
      status: count.sections === 0 ? 'preserved' : 'degraded',
      statusLabel: count.sections === 0 ? '完整保留' : '降级导入',
      detail: detail('sections', count.sections === 0 ? '未检测到额外分节；单节正文顺序完整保留，且不据此建立版式往返保证。' : '检测到页尺寸、页边距、分栏与文档网格等分节设置；正文按单一连续稿件顺序导入，后续导出无法恢复原分节版式。'),
    },
    {
      key: 'headers-footers', label: '页眉与页脚', count: count.headersFooters,
      status: count.headersFooters === 0 ? 'preserved' : 'degraded',
      statusLabel: count.headersFooters === 0 ? '完整保留' : '降级导入',
      detail: detail('headersFooters', count.headersFooters === 0 ? '未检测到页眉或页脚。' : '页眉页脚不进入稿件正文；本次受限导入不提交该分支。'),
    },
    {
      key: 'round-trip-export', label: 'DOCX 往返与导出预期', count: 0, status: 'unsupported', statusLabel: '不支持导入',
      detail: '本导入功能不提供 DOCX 导出，因此无法建立往返行为、版式复原或导出结果保证。',
    },
  ];
}

const NO_SIGNALS: DocumentSignals = {
  inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, textBoxes: 0, fields: 0,
};

export function isCleanTracerFidelity(fidelity: ReadonlyArray<FidelityCategoryProjection>): boolean {
  return hasExactFidelityProjection(fidelity, fidelityReport(NO_SIGNALS, []));
}

function hasExactFidelityProjection(value: unknown, expected: readonly FidelityCategoryProjection[]): value is FidelityCategoryProjection[] {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((candidate: unknown, index) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const actual = candidate as Record<string, unknown>;
    const row = expected[index]!;
    return hasExactStrings(Object.keys(actual).sort(), ['count', 'detail', 'key', 'label', 'status', 'statusLabel']) &&
      actual.key === row.key && actual.label === row.label && actual.count === row.count && actual.status === row.status &&
      actual.statusLabel === row.statusLabel && actual.detail === row.detail;
  });
}

/** The row counts of a candidate report, or `undefined` when a row carries no readable count. */
function candidateCounts(value: unknown, rows: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== rows) return undefined;
  const counts: number[] = [];
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
    const count = (candidate as Record<string, unknown>).count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
    counts.push(count);
  }
  return counts;
}

/**
 * Every report the classes could carry for these counts under `parserIdentity`, each with the text-box
 * disposition it states; empty when the counts are not readable or the identity is not one this build
 * can rebuild. A converted report is rebuilt from the other side of the same addition: the parser
 * contributed nothing, so every count is the conversion's loss.
 */
function reportsForCandidateCounts(
  value: unknown,
  conversion: FidelityConversionIdentity | undefined,
  parserIdentity: string,
): Array<{ report: FidelityCategoryProjection[]; textBoxDisposition: TextBoxDisposition | null }> {
  // A converter this build cannot phrase is not one whose report this build can rebuild.
  if (conversion !== undefined && CONVERSION_LOSS_PHRASES[conversion.identity] === undefined) return [];
  if (parserIdentity === DOCX_PARSER_IDENTITY_V1) {
    const counts = candidateCounts(value, 8);
    if (counts === undefined) return [];
    const signals: DocumentSignalsV1 = {
      inlineStyles: counts[0]!, commentsRevisions: counts[1]!, notes: counts[2]!,
      tables: counts[3]!, imagesCaptions: counts[4]!, sections: counts[5]!,
    };
    const report = conversion === undefined
      ? buildFidelityReportV1(signals, counts[6]!)
      : buildFidelityReportV1(
        { inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0 },
        0,
        { ...conversion, loss: { ...signals, headersFooters: counts[6]! } },
      );
    return [{ report, textBoxDisposition: null }];
  }
  if (parserIdentity !== DOCX_PARSER_IDENTITY) return [];
  const counts = candidateCounts(value, 10);
  if (counts === undefined) return [];
  const signals: DocumentSignals = {
    inlineStyles: counts[0]!, commentsRevisions: counts[1]!, notes: counts[2]!, tables: counts[3]!,
    imagesCaptions: counts[4]!, sections: counts[5]!, textBoxes: counts[7]!, fields: counts[8]!,
  };
  if (conversion !== undefined) {
    const { textBoxes, fields, ...rest } = signals;
    return [{
      report: buildFidelityReport(NO_SIGNALS, 0, {
        ...conversion,
        loss: { ...rest, headersFooters: counts[6]!, textBoxes, fields },
      }),
      textBoxDisposition: null,
    }];
  }
  if (signals.textBoxes === 0) return [{ report: buildFidelityReport(signals, counts[6]!), textBoxDisposition: null }];
  return (['retain', 'merge'] as const).map((disposition) => ({
    report: buildFidelityReport(signals, counts[6]!, undefined, disposition),
    textBoxDisposition: disposition,
  }));
}

/**
 * Plans any well-formed fidelity report (ADR 0072 §4, ADR 0086). A report whose classes carry the keys,
 * labels, statuses, status labels, details, and non-negative integer counts the builder of its parser
 * identity would emit — the ten classes of `ai7-docx-fflate-saxes/2`, or the frozen eight of `/1` — yields
 * `degraded-import-no-round-trip` when some class is `降级导入` or `不支持导入` with a positive count, listing
 * each such class in report order, and `clean-import-no-round-trip` otherwise: a class retained with the
 * file asks for no Import Degradation Decision. Anything that is not such a report yields `undefined`.
 * `sourceDigest` and `sourceBytes` no longer decide anything and are kept only so the store's and the
 * reimport path's call sites do not move.
 *
 * A report a converter's loss was merged into is planned by passing the same `conversion` its details
 * name (ADR 0072 §3): without it the merged details do not reconstruct and the report refuses as
 * malformed, so a converted review can never be read back as if it had been parsed. A revision-2 report
 * of a natively read file with text boxes rebuilds under exactly one disposition, which the plan states.
 */
export function deriveImportFidelityPlan(
  fidelity: unknown,
  sourceDigest: string,
  sourceBytes: number,
  conversion?: FidelityConversionIdentity,
  parserIdentity: string = DOCX_PARSER_IDENTITY,
): ImportFidelityPlan | undefined {
  const match = reportsForCandidateCounts(fidelity, conversion, parserIdentity)
    .find((candidate) => hasExactFidelityProjection(fidelity, candidate.report));
  if (match === undefined) return undefined;
  const degradations = match.report
    .filter((category) => (category.status === 'degraded' || category.status === 'unsupported') && category.count > 0)
    .map((category) => ({ categoryKey: category.key, label: category.label, count: category.count }));
  return {
    outcome: degradations.length === 0 ? 'clean-import-no-round-trip' : 'degraded-import-no-round-trip',
    degradations,
    textBoxDisposition: match.textBoxDisposition,
  };
}

/**
 * The same report stating `disposition` for its text boxes (ADR 0086 §2), or `undefined` when `fidelity`
 * is not a report this build can rebuild or the choice is not one it can state: only a revision-2
 * report of a natively read file with a text box can be merged, and any other keeps its text boxes, if
 * it has any, as they are.
 */
export function withTextBoxDisposition(
  fidelity: unknown,
  disposition: TextBoxDisposition,
  conversion?: FidelityConversionIdentity,
  parserIdentity: string = DOCX_PARSER_IDENTITY,
): FidelityCategoryProjection[] | undefined {
  const candidates = reportsForCandidateCounts(fidelity, conversion, parserIdentity);
  if (!candidates.some((candidate) => hasExactFidelityProjection(fidelity, candidate.report))) return undefined;
  const chosen = candidates.find((candidate) => (candidate.textBoxDisposition ?? 'retain') === disposition);
  return chosen?.report;
}

export async function parseDocx(
  path: string,
  displayNameInput: string,
  onBlock: (block: ParsedDocxBlock) => void,
  expectedSource?: { digest: string; bytes: number },
  options: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void; formatIdentified?: boolean } = {},
): Promise<ParsedDocx> {
  const displayName = safeDisplayName(displayNameInput, options.formatIdentified !== true);
  const archive = await readStreamingArchive(path, onBlock, options);
  if (expectedSource) {
    requireDocx(archive.sourceDigest === expectedSource.digest && archive.archiveBytes === expectedSource.bytes, 'selected file changed during staging');
  }
  const contentTypes = decodeMetadataXml(archive.metadata.get('[Content_Types].xml')!);
  requireDocx(contentTypes.includes('wordprocessingml.document.main+xml'), 'package does not declare a WordprocessingML document');
  const coreTitle = archive.metadata.get('docProps/core.xml');
  const metadataTitle = parseCoreTitle(coreTitle ? decodeMetadataXml(coreTitle) : undefined);
  const fallbackTitle = displayName.slice(0, -extname(displayName).length).trim();
  const titleSuggestion = metadataTitle
    ? { value: metadataTitle, sourceLabel: 'DOCX 标题元数据' as const }
    : { value: fallbackTitle, sourceLabel: '文件名' as const };
  requireDocx(titleSuggestion.value.length > 0, 'no usable title suggestion');
  const fidelity = fidelityReport(archive.document.signals, archive.entryNames);
  requireDocx(deriveImportFidelityPlan(fidelity, archive.sourceDigest, archive.archiveBytes) !== undefined, 'document fidelity report is malformed');
  return {
    parserIdentity: DOCX_PARSER_IDENTITY,
    sourceDigest: archive.sourceDigest,
    contentDigest: archive.document.contentDigest,
    structureDigest: archive.document.structureDigest,
    archiveBytes: archive.archiveBytes,
    blockCount: archive.document.blockCount,
    characterCount: archive.document.characterCount,
    fidelity,
    textBoxes: archive.document.textBoxes,
    titleSuggestion,
  };
}
