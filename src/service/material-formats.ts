import { posix } from 'node:path';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { MAX_BLOCK_CODE_UNITS } from '../shared/protocol.js';
import type { ConvertedParagraph } from './text-manuscript.js';

/**
 * ⑤ 资料库 · 资料索引 (Issue #428, S80): the text of a web page (HTML), an EPUB book, an OpenDocument text (ODT) and a Rich
 * Text file (RTF), read on this machine into the paragraphs every other format's index is made of.
 *
 * Nothing here is a new dependency: the two containers that are ZIP archives (EPUB, ODT) are opened with the `fflate` the
 * DOCX parser already uses, their XML parts are read with its `saxes`, and HTML (an EPUB's chapters included) and RTF are
 * read by the small tokenizers below. Each reader hands back paragraphs — lines, and a heading style where the format names
 * one — which the Material Index packages and reads through the DOCX parser exactly as it reads a converted `.txt`, so the
 * segments, their anchors and their digests are the same model for every format.
 *
 * Every reader is bounded the way the DOCX parser is: the archive's entries (count, each one's expanded size, all of them
 * together, and the expansion ratio), the nesting depth of the markup, one tag's length, and the text and paragraphs read.
 * What crosses a bound is refused, never cut. A document that declares entities or an internal DTD subset is refused before
 * anything of it is read (nothing is ever fetched or expanded), and an EPUB carrying DRM or encryption, or an ODT saved with
 * a password, is refused with that reason. Scripts, styles, notes, comments, headers and footers, and hidden text are not
 * read: an index holds the body text a reader sees.
 */

/** Each reader's identity, recorded in a build's `converter` beside the DOCX parser it is read through. */
export const MATERIAL_FORMAT_CONVERTER_IDENTITIES = {
  HTML: 'ai7-html-text/1',
  EPUB: 'ai7-epub-text/1',
  ODT: 'ai7-odt-text/1',
  RTF: 'ai7-rtf-text/1',
} as const;

export type MaterialTextFormat = keyof typeof MATERIAL_FORMAT_CONVERTER_IDENTITIES;

export function isMaterialTextFormat(format: string): format is MaterialTextFormat {
  return Object.hasOwn(MATERIAL_FORMAT_CONVERTER_IDENTITIES, format);
}

/** Why a file was not read, in the Material Index's own reasons. */
export type MaterialFormatRefusalReason = 'over-bound' | 'unreadable' | 'empty' | 'encrypted' | 'external-entity';

export class MaterialFormatRefusal extends Error {
  constructor(readonly reason: MaterialFormatRefusalReason, detail: string) {
    super(`MATERIAL_FORMAT_REFUSED:${reason}:${detail}`);
    this.name = 'MaterialFormatRefusal';
  }
}

function refuse(reason: MaterialFormatRefusalReason, detail: string): never {
  throw new MaterialFormatRefusal(reason, detail);
}

function requireFormat(condition: unknown, reason: MaterialFormatRefusalReason, detail: string): asserts condition {
  if (!condition) refuse(reason, detail);
}

export interface MaterialFormatBounds {
  /** Entries in one archive. Higher than a DOCX's 256: a book holds a part per chapter and per image. */
  readonly entries: number;
  /** One entry's expanded bytes. */
  readonly entryBytes: number;
  /** All entries' expanded bytes together. */
  readonly expandedBytes: number;
  /** Expanded bytes over archive bytes, once more than a mebibyte is expanded. */
  readonly ratio: number;
  /** Open elements (or RTF groups) at once. */
  readonly depth: number;
  /** One tag or declaration, in code units. */
  readonly markupCodeUnits: number;
  /** The text read, in code units. */
  readonly textCodeUnits: number;
  /** The paragraphs read. */
  readonly paragraphs: number;
}

/** The bounds of the DOCX parser (`docx.ts`), with the archive entry count raised for books. */
export const MATERIAL_FORMAT_BOUNDS: MaterialFormatBounds = {
  entries: 4_096,
  entryBytes: 64 * 1024 * 1024,
  expandedBytes: 96 * 1024 * 1024,
  ratio: 2_000,
  depth: 128,
  markupCodeUnits: MAX_BLOCK_CODE_UNITS * 8,
  textCodeUnits: 10_000_000,
  paragraphs: 100_000,
};

export interface MaterialFormatText {
  /** The file's own title, when it names one. */
  readonly title: string | null;
  readonly paragraphs: ConvertedParagraph[];
}

const MAX_TITLE_CODE_UNITS = 180;

/** A title as the DOCX parser keeps one: well formed, NFC, one line, at most 180 code units; anything else is none. */
function normalizedTitle(value: string | null): string | null {
  if (value === null || !value.isWellFormed()) return null;
  const title = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  return title.length > 0 && title.length <= MAX_TITLE_CODE_UNITS ? title : null;
}

/**
 * The text of one file of the four formats, as paragraphs. Refused with a `MaterialFormatRefusal` naming why: a bound
 * crossed, encryption or DRM, an entity declaration, no text at all, or anything else that could not be read.
 */
export function extractMaterialFormatText(bytes: Uint8Array, format: MaterialTextFormat, bounds: MaterialFormatBounds = MATERIAL_FORMAT_BOUNDS): MaterialFormatText {
  let read: MaterialFormatText;
  try {
    switch (format) {
      case 'HTML':
        read = readHtmlDocument(bytes, bounds);
        break;
      case 'EPUB':
        read = readEpub(bytes, bounds);
        break;
      case 'ODT':
        read = readOdt(bytes, bounds);
        break;
      case 'RTF':
        read = readRtf(bytes, bounds);
        break;
    }
  } catch (error) {
    if (error instanceof MaterialFormatRefusal) throw error;
    refuse('unreadable', error instanceof Error ? error.message : String(error));
  }
  requireFormat(read.paragraphs.length > 0, 'empty', 'no text');
  return { title: normalizedTitle(read.title), paragraphs: read.paragraphs };
}

// ---- paragraphs ------------------------------------------------------------------------------------------------------

/** What XML 1.0 cannot carry, and so the working package never may: C0 controls but tab, and the two non-characters. */
const NOT_XML_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/gu;
const LINE_ENDS = /[\r\n]/gu;

/** The paragraphs a reader finds, within the text and paragraph bounds. */
class ParagraphSink {
  readonly paragraphs: ConvertedParagraph[] = [];
  #lines: string[] = [''];
  #characters = 0;

  constructor(readonly bounds: MaterialFormatBounds) {}

  text(value: string): void {
    if (value.length === 0) return;
    this.#characters += value.length;
    requireFormat(this.#characters <= this.bounds.textCodeUnits, 'over-bound', 'text exceeds its bound');
    const clean = value.toWellFormed().replace(NOT_XML_TEXT, '').replace(LINE_ENDS, ' ');
    this.#lines[this.#lines.length - 1] += clean;
  }

  /** Whether the line being read holds nothing but white space. */
  lineEmpty(): boolean {
    return this.#lines[this.#lines.length - 1]!.trim().length === 0;
  }

  /** Whether the paragraph being read holds any text yet. */
  holdsText(): boolean {
    return this.#lines.some((line) => line.trim().length > 0);
  }

  lineBreak(): void {
    this.#lines.push('');
  }

  /** The paragraph read so far ends: kept when it holds text, with its empty lines dropped. */
  flush(style?: string): void {
    const lines = this.#lines.map((line) => line.trim()).filter((line) => line.length > 0);
    this.#lines = [''];
    if (lines.length === 0) return;
    requireFormat(this.paragraphs.length < this.bounds.paragraphs, 'over-bound', 'too many paragraphs');
    this.paragraphs.push(style === undefined ? { lines } : { lines, style });
  }
}

// ---- HTML (a web page, or an EPUB's chapter) -----------------------------------------------------------------------

/** Elements that end the paragraph before them and start a new one. */
const HTML_BLOCKS: ReadonlySet<string> = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'dd', 'details', 'dialog', 'dir', 'div', 'dl',
  'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup',
  'hr', 'html', 'legend', 'li', 'listing', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
/** Elements that never hold content. */
const HTML_VOID: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
/** Elements whose content is no text a reader of the page sees. */
const HTML_SKIPPED: ReadonlySet<string> = new Set([
  'template', 'noscript', 'svg', 'math', 'object', 'select', 'button', 'canvas', 'audio', 'video', 'map', 'datalist',
]);
/** Elements whose content is raw text up to their own end tag: scripts and styles are dropped, a title is the title. */
const HTML_RAW_TEXT: ReadonlySet<string> = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'textarea', 'title']);
/** Elements that keep their line breaks. */
const HTML_PREFORMATTED: ReadonlySet<string> = new Set(['pre', 'listing', 'plaintext']);
/** A start tag of the first closes an open element of the second right above it, as HTML's parser does. */
const HTML_IMPLIED_END: Readonly<Record<string, ReadonlySet<string>>> = {
  li: new Set(['li']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  tr: new Set(['tr', 'td', 'th']),
  td: new Set(['td', 'th']),
  th: new Set(['td', 'th']),
  option: new Set(['option']),
};
const HTML_HEADING = /^h([1-6])$/u;
const HTML_SPACE = /[\t\n\f\r ]+/gu;

/** The named character references a page commonly writes; any other name stays as the characters written. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00a0', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
  zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', hellip: '…', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°',
  plusmn: '±', times: '×', divide: '÷', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', iexcl: '¡', iquest: '¿',
  cent: '¢', pound: '£', yen: '¥', euro: '€', sect: '§', para: '¶', shy: '\u00ad', prime: '′', Prime: '″', micro: 'µ',
  frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
};
/** Names a page may write without their semicolon, as browsers read them. */
const HTML_LEGACY_ENTITIES: ReadonlySet<string> = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg']);
const HTML_REFERENCE = /&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8}|[A-Za-z][A-Za-z0-9]{1,31})(;?)/gu;

function codePointText(value: number): string {
  return value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff) ? String.fromCodePoint(value) : '\uFFFD';
}

/** Character references decoded; an unknown name, never expanded, stays as written. */
export function decodeHtmlReferences(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(HTML_REFERENCE, (whole, name: string, semicolon: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return codePointText(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return codePointText(Number.parseInt(name.slice(1), 10));
    const value = HTML_ENTITIES[name];
    if (value === undefined || (semicolon === '' && !HTML_LEGACY_ENTITIES.has(name))) return whole;
    return value;
  });
}

/** Where `token` next occurs from `from`, or the source's end when it never does. */
function indexOrEnd(source: string, token: string, from: number): number {
  const index = source.indexOf(token, from);
  return index < 0 ? source.length : index;
}

interface HtmlOpen {
  readonly name: string;
  readonly skipped: boolean;
}

/** One HTML or XHTML document read into a sink: a small tokenizer and the block model a reader of the page sees. */
class HtmlReader {
  readonly #sink: ParagraphSink;
  readonly #stack: HtmlOpen[] = [];
  #skipping = 0;
  #preformatted = 0;
  title: string | null = null;

  constructor(sink: ParagraphSink) {
    this.#sink = sink;
  }

  #style(): string | undefined {
    for (let index = this.#stack.length - 1; index >= 0; index -= 1) {
      const heading = HTML_HEADING.exec(this.#stack[index]!.name);
      if (heading !== null) return `Heading${heading[1]}`;
    }
    return undefined;
  }

  #flush(): void {
    this.#sink.flush(this.#style());
  }

  #pop(): void {
    const top = this.#stack.at(-1)!;
    if (this.#skipping === 0 && HTML_BLOCKS.has(top.name)) this.#flush();
    this.#stack.pop();
    if (top.skipped) this.#skipping -= 1;
    if (HTML_PREFORMATTED.has(top.name)) this.#preformatted -= 1;
  }

  #open(name: string, selfClosing: boolean): void {
    if (this.#skipping === 0) {
      if (name === 'br') {
        // Two line breaks in a row part two paragraphs, as a page means them.
        if (this.#sink.lineEmpty() && this.#sink.holdsText()) this.#flush();
        else this.#sink.lineBreak();
        return;
      }
      if (HTML_BLOCKS.has(name) && this.#stack.at(-1)?.name === 'p') this.#pop();
      const implied = HTML_IMPLIED_END[name];
      if (implied !== undefined && implied.has(this.#stack.at(-1)?.name ?? '')) this.#pop();
      if (HTML_BLOCKS.has(name)) this.#flush();
    }
    if (HTML_VOID.has(name) || selfClosing) return;
    requireFormat(this.#stack.length < this.#sink.bounds.depth, 'over-bound', 'markup nesting exceeds its bound');
    const skipped = HTML_SKIPPED.has(name);
    this.#stack.push({ name, skipped });
    if (skipped) this.#skipping += 1;
    if (HTML_PREFORMATTED.has(name)) this.#preformatted += 1;
  }

  #close(name: string): void {
    let index = this.#stack.length - 1;
    while (index >= 0 && this.#stack[index]!.name !== name) index -= 1;
    if (index < 0) {
      if (this.#skipping === 0 && name === 'p') this.#flush();
      return;
    }
    while (this.#stack.length > index) this.#pop();
  }

  #text(raw: string): void {
    if (this.#skipping > 0 || raw.length === 0) return;
    const text = decodeHtmlReferences(raw);
    if (this.#preformatted > 0) {
      text.split(/\r\n|\r|\n/u).forEach((line, index) => {
        if (index > 0) this.#sink.lineBreak();
        this.#sink.text(line);
      });
      return;
    }
    this.#sink.text(text.replace(HTML_SPACE, ' '));
  }

  read(source: string): void {
    const bound = this.#sink.bounds.markupCodeUnits;
    let at = 0;
    while (at < source.length) {
      const open = source.indexOf('<', at);
      if (open < 0) {
        this.#text(source.slice(at));
        break;
      }
      if (open > at) this.#text(source.slice(at, open));
      at = open;
      if (source.startsWith('<!--', at)) {
        const end = source.indexOf('-->', at + 4);
        at = end < 0 ? source.length : end + 3;
        continue;
      }
      if (source.startsWith('<![CDATA[', at)) {
        const end = indexOrEnd(source, ']]>', at + 9);
        // Character data means its characters: an `&` in it is no reference, so it is escaped before references are read.
        this.#text(source.slice(at + 9, end).replace(/&/gu, '&amp;'));
        at = end + 3;
        continue;
      }
      if (source.startsWith('<!', at) || source.startsWith('<?', at)) {
        const end = indexOrEnd(source, '>', at);
        requireFormat(end - at <= bound, 'over-bound', 'declaration exceeds its bound');
        const declaration = source.slice(at + 2, end);
        // An entity, element or attribute declaration, or a DOCTYPE with an internal subset: nothing of it is read or
        // expanded, and the file is refused. A DOCTYPE naming an external DTD is only a name: it is never fetched.
        if (/^(?:ENTITY|ELEMENT|ATTLIST|NOTATION)\b/iu.test(declaration) || (/^DOCTYPE\b/iu.test(declaration) && declaration.includes('['))) {
          refuse('external-entity', 'document declares entities or an internal DTD subset');
        }
        at = end + 1;
        continue;
      }
      const closing = source.charAt(at + 1) === '/';
      const nameMatch = /^[A-Za-z][A-Za-z0-9:_.-]*/u.exec(source.slice(at + (closing ? 2 : 1), at + (closing ? 2 : 1) + 128));
      if (nameMatch === null) {
        this.#text('&lt;');
        at += 1;
        continue;
      }
      const qualified = nameMatch[0].toLowerCase();
      const name = qualified.slice(qualified.lastIndexOf(':') + 1);
      // The tag's end: the first `>` outside an attribute's quoted value.
      let cursor = at + (closing ? 2 : 1) + nameMatch[0].length;
      let quote: string | null = null;
      let previous = '';
      while (cursor < source.length) {
        const character = source.charAt(cursor);
        if (quote !== null) {
          if (character === quote) quote = null;
        } else if ((character === '"' || character === '\'') && previous === '=') {
          quote = character;
        } else if (character === '>') {
          break;
        }
        if (!/\s/u.test(character)) previous = character;
        cursor += 1;
        requireFormat(cursor - at <= bound, 'over-bound', 'tag exceeds its bound');
      }
      const selfClosing = source.charAt(cursor - 1) === '/';
      at = cursor + 1;
      if (closing) {
        this.#close(name);
        continue;
      }
      if (HTML_RAW_TEXT.has(name) && !selfClosing) {
        const ending = new RegExp(`</${name}[\\s/>]`, 'giu');
        ending.lastIndex = at;
        const match = ending.exec(source);
        const end = match === null ? source.length : match.index;
        if (name === 'title' && this.title === null && this.#skipping === 0) {
          this.title = decodeHtmlReferences(source.slice(at, end));
        }
        const close = match === null ? -1 : source.indexOf('>', match.index);
        at = close < 0 ? source.length : close + 1;
        continue;
      }
      this.#open(name, selfClosing);
    }
  }

  /** The document's end: what is still open ends with it. */
  finish(): void {
    while (this.#stack.length > 0) this.#pop();
    this.#sink.flush();
  }
}

/** A charset a document declares in its first kibibyte: an XML declaration's, or a `<meta>`'s. */
function declaredCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  const xml = /^<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]{1,40})["']/u.exec(head);
  if (xml !== null) return xml[1]!;
  const meta = /<meta\b[^>]*?\bcharset\s*=\s*["']?([A-Za-z0-9._-]{1,40})/iu.exec(head);
  return meta === null ? null : meta[1]!;
}

/** A document's text in the encoding its byte-order mark or its own declaration names, UTF-8 when it names none. */
export function decodeMarkup(bytes: Uint8Array): string {
  let label = 'utf-8';
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) label = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be';
  else {
    const declared = declaredCharset(bytes)?.toLowerCase() ?? null;
    // A document that reached this reader as text is never UTF-16 without its mark: such a declaration means UTF-8.
    if (declared !== null && !declared.startsWith('utf-16')) label = declared;
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label, { fatal: true });
  } catch {
    refuse('unreadable', `unsupported encoding ${label}`);
  }
  try {
    const text = decoder.decode(bytes.subarray(start));
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    refuse('unreadable', `text is not valid ${label}`);
  }
}

function readHtmlDocument(bytes: Uint8Array, bounds: MaterialFormatBounds): MaterialFormatText {
  const sink = new ParagraphSink(bounds);
  const reader = new HtmlReader(sink);
  reader.read(decodeMarkup(bytes));
  reader.finish();
  return { title: reader.title, paragraphs: sink.paragraphs };
}

// ---- ZIP containers (EPUB, ODT) ------------------------------------------------------------------------------------

const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_BYTES = 22;
const ZIP_PUSH_BYTES = 16 * 1024;

function uint16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8);
}

function uint32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
}

/**
 * The archive's central directory, read before anything is expanded: how many entries it names, and whether any of them
 * is encrypted (general-purpose flag bit 0). An archive without a readable directory is not read.
 */
function inspectCentralDirectory(bytes: Uint8Array, bounds: MaterialFormatBounds): void {
  let end = -1;
  for (let at = bytes.length - ZIP_END_BYTES; at >= Math.max(0, bytes.length - ZIP_END_BYTES - 0xffff); at -= 1) {
    if (uint32(bytes, at) === ZIP_END_SIGNATURE) {
      end = at;
      break;
    }
  }
  requireFormat(end >= 0, 'unreadable', 'archive has no central directory');
  const count = uint16(bytes, end + 10);
  const offset = uint32(bytes, end + 16);
  requireFormat(count <= bounds.entries, 'over-bound', 'too many archive entries');
  // A ZIP64 directory (its count or offset saturated) is read by the streaming pass alone, under the same bounds.
  if (count === 0xffff || offset === 0xffffffff) return;
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    requireFormat(at + 46 <= bytes.length && uint32(bytes, at) === ZIP_CENTRAL_SIGNATURE, 'unreadable', 'archive directory is damaged');
    requireFormat((uint16(bytes, at + 8) & 1) === 0, 'encrypted', 'archive entry is encrypted');
    at += 46 + uint16(bytes, at + 28) + uint16(bytes, at + 30) + uint16(bytes, at + 32);
  }
}

function entryName(name: string, seen: Set<string>): string {
  requireFormat(name.length > 0 && name.length <= 1024 && !name.includes('\\') && !name.includes('\u0000'), 'unreadable', 'invalid archive entry name');
  requireFormat(!name.startsWith('/') && !/^[A-Za-z]:/u.test(name), 'unreadable', 'absolute archive entry name');
  const normalized = posix.normalize(name);
  requireFormat(normalized === name && !normalized.startsWith('../') && normalized !== '..', 'unreadable', 'archive entry name leaves the archive');
  const identity = normalized.toLocaleLowerCase('en-US');
  requireFormat(!seen.has(identity), 'unreadable', 'duplicate archive entry');
  seen.add(identity);
  return normalized;
}

/**
 * An archive read whole within its bounds, keeping the entries `keep` asks for. Every entry is expanded and counted, so a
 * bomb in any of them is refused, and nothing is kept past its bound.
 */
function readArchive(bytes: Uint8Array, bounds: MaterialFormatBounds, keep: (name: string) => boolean): Map<string, Uint8Array> {
  inspectCentralDirectory(bytes, bounds);
  const kept = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let entries = 0;
  let expanded = 0;
  let failure: unknown;
  const unzip = new Unzip((file) => {
    try {
      const name = entryName(file.name, seen);
      entries += 1;
      requireFormat(entries <= bounds.entries, 'over-bound', 'too many archive entries');
      requireFormat(file.compression === 0 || file.compression === 8, 'unreadable', 'unsupported archive compression');
      requireFormat(file.originalSize === undefined || file.originalSize <= bounds.entryBytes, 'over-bound', 'archive entry is too large');
      const chunks: Uint8Array[] | null = name.endsWith('/') || !keep(name) ? null : [];
      let received = 0;
      file.ondata = (error, chunk, final) => {
        try {
          if (error) throw error;
          received += chunk.byteLength;
          expanded += chunk.byteLength;
          requireFormat(received <= bounds.entryBytes, 'over-bound', 'archive entry exceeded its bound');
          requireFormat(expanded <= bounds.expandedBytes, 'over-bound', 'expanded archive exceeded its bound');
          if (chunks === null) return;
          chunks.push(chunk);
          if (final) {
            const joined = new Uint8Array(received);
            let offset = 0;
            for (const part of chunks) {
              joined.set(part, offset);
              offset += part.byteLength;
            }
            kept.set(name, joined);
          }
        } catch (caught) {
          failure ??= caught;
        }
      };
      file.start();
    } catch (caught) {
      failure ??= caught;
    }
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  for (let at = 0; at < bytes.length; at += ZIP_PUSH_BYTES) {
    unzip.push(bytes.subarray(at, Math.min(bytes.length, at + ZIP_PUSH_BYTES)), false);
    if (failure !== undefined) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  if (failure !== undefined) throw failure;
  requireFormat(expanded <= 1_048_576 || expanded / bytes.length <= bounds.ratio, 'over-bound', 'suspicious archive ratio');
  return kept;
}

/** An XML part's text: UTF-8 (or what it declares), with no DOCTYPE or entity declaration anywhere. */
function xmlPart(bytes: Uint8Array): string {
  const text = decodeMarkup(bytes);
  requireFormat(!/<!DOCTYPE|<!ENTITY/iu.test(text), 'external-entity', 'XML part declares a DTD or entities');
  return text;
}

interface XmlHandlers {
  open?(tag: SaxesTagNS): void;
  close?(tag: SaxesTagNS): void;
  text?(text: string): void;
}

/**
 * One XML part read with `saxes`: namespaces resolved, no DOCTYPE (so no entity is ever declared, fetched or expanded) and
 * no processing instruction, and its nesting bounded. `saxes` keeps one handler per event, so the bound and the caller's
 * handlers share each.
 */
function readXml(xml: string, bounds: MaterialFormatBounds, handlers: XmlHandlers): void {
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  parser.on('doctype', () => refuse('external-entity', 'XML part declares a DTD'));
  parser.on('processinginstruction', () => refuse('unreadable', 'processing instruction in XML part'));
  parser.on('opentag', (tag) => {
    depth += 1;
    requireFormat(depth <= bounds.depth, 'over-bound', 'XML nesting exceeds its bound');
    handlers.open?.(tag);
  });
  parser.on('closetag', (tag) => {
    depth -= 1;
    handlers.close?.(tag);
  });
  const text = handlers.text;
  if (text !== undefined) {
    parser.on('text', text);
    parser.on('cdata', text);
  }
  parser.write(xml).close();
}

function attribute(tag: SaxesTagNS, local: string): string | undefined {
  return Object.values(tag.attributes).find((entry) => entry.local === local)?.value;
}

/** The text of the first element of this local name in the part, or none. */
function firstElementText(xml: string, local: string, bounds: MaterialFormatBounds): string | null {
  let inside = 0;
  let found: string | null = null;
  let value = '';
  readXml(xml, bounds, {
    open: (tag) => {
      if (found === null && (inside > 0 || tag.local === local)) inside += 1;
    },
    text: (text) => {
      if (inside > 0 && value.length <= MAX_TITLE_CODE_UNITS * 4) value += text;
    },
    close: () => {
      if (inside === 0) return;
      inside -= 1;
      if (inside === 0) found = value;
    },
  });
  return found;
}

// ---- EPUB ----------------------------------------------------------------------------------------------------------

/** The two font obfuscations an ordinary EPUB carries: they hide only fonts, never the text. */
const EPUB_FONT_OBFUSCATION: ReadonlySet<string> = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);
/** Parts a DRM scheme leaves in the container: Adobe ADEPT's rights, Apple FairPlay's. */
const EPUB_DRM_PARTS: ReadonlySet<string> = new Set(['META-INF/rights.xml', 'META-INF/sinf.xml']);
const EPUB_CONTENT_TYPES: ReadonlySet<string> = new Set(['application/xhtml+xml', 'text/html']);
const EPUB_PACKAGE_TYPE = 'application/oebps-package+xml';
/** What is never text: kept out of memory while the archive is read (still expanded and counted). */
const EPUB_BINARY = /\.(?:png|jpe?g|gif|webp|bmp|tiff?|ico|svg|ttf|otf|woff2?|eot|mp3|mp4|m4a|m4v|aac|ogg|oga|webm|wav|css|js|pdf)$/iu;

/**
 * An EPUB's body text: its chapters in reading order (the package's spine), each read as HTML, the navigation document
 * left out. Refused when it carries DRM — Adobe's rights or Apple's FairPlay parts, or any encryption other than the font
 * obfuscation every ordinary EPUB may use — rather than reading ciphertext as text.
 */
function readEpub(bytes: Uint8Array, bounds: MaterialFormatBounds): MaterialFormatText {
  const entries = readArchive(bytes, bounds, (name) => !EPUB_BINARY.test(name));
  for (const part of EPUB_DRM_PARTS) requireFormat(!entries.has(part), 'encrypted', 'EPUB carries DRM');
  const encryption = entries.get('META-INF/encryption.xml');
  if (encryption !== undefined) {
    readXml(xmlPart(encryption), bounds, {
      open: (tag) => {
        if (tag.local !== 'EncryptionMethod') return;
        requireFormat(EPUB_FONT_OBFUSCATION.has(attribute(tag, 'Algorithm') ?? ''), 'encrypted', 'EPUB content is encrypted');
      },
    });
  }
  const container = entries.get('META-INF/container.xml');
  requireFormat(container !== undefined, 'unreadable', 'EPUB has no container');
  let packagePath: string | null = null;
  readXml(xmlPart(container), bounds, {
    open: (tag) => {
      if (tag.local === 'rootfile' && packagePath === null && (attribute(tag, 'media-type') ?? EPUB_PACKAGE_TYPE) === EPUB_PACKAGE_TYPE) {
        packagePath = attribute(tag, 'full-path') ?? null;
      }
    },
  });
  requireFormat(packagePath !== null, 'unreadable', 'EPUB names no package');
  const packageBytes = entries.get(packagePath);
  requireFormat(packageBytes !== undefined, 'unreadable', 'EPUB package is missing');

  const manifest = new Map<string, { href: string; type: string; nav: boolean }>();
  const spine: string[] = [];
  const packageXml = xmlPart(packageBytes);
  readXml(packageXml, bounds, {
    open: (tag) => {
      if (tag.local === 'item') {
        const id = attribute(tag, 'id');
        const href = attribute(tag, 'href');
        const nav = (attribute(tag, 'properties') ?? '').split(/\s+/u).includes('nav');
        if (id !== undefined && href !== undefined) manifest.set(id, { href, type: attribute(tag, 'media-type') ?? '', nav });
      } else if (tag.local === 'itemref') {
        const idref = attribute(tag, 'idref');
        if (idref !== undefined) spine.push(idref);
      }
    },
  });
  const title = firstElementText(packageXml, 'title', bounds);

  const sink = new ParagraphSink(bounds);
  const base = posix.dirname(packagePath);
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (item === undefined || item.nav || !EPUB_CONTENT_TYPES.has(item.type)) continue;
    let href: string;
    try {
      href = decodeURIComponent(item.href.replace(/#.*$/u, ''));
    } catch {
      continue;
    }
    const chapter = entries.get(posix.normalize(base === '.' ? href : posix.join(base, href)));
    if (chapter === undefined) continue;
    const reader = new HtmlReader(sink);
    reader.read(decodeMarkup(chapter));
    reader.finish();
  }
  return { title, paragraphs: sink.paragraphs };
}

// ---- ODT -----------------------------------------------------------------------------------------------------------

const ODF_TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const ODF_OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
const ODF_DRAW = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
/** What a reader of the body does not read as body text: notes, comments, tracked deletions, frames and their boxes. */
const ODF_SKIPPED: ReadonlySet<string> = new Set([
  `${ODF_TEXT} note`, `${ODF_TEXT} tracked-changes`, `${ODF_OFFICE} annotation`, `${ODF_OFFICE} forms`, `${ODF_DRAW} frame`,
  `${ODF_DRAW} custom-shape`, `${ODF_DRAW} rect`, `${ODF_DRAW} g`, `${ODF_TEXT} sequence-decls`, `${ODF_TEXT} variable-decls`,
]);
const ODF_SPACE = /[ \t\r\n]+/gu;
/** One `text:s` stands for at most this many spaces. */
const ODF_MAX_SPACES = 1_024;

/**
 * An OpenDocument text's body: every `text:p` a paragraph and every `text:h` a heading of its outline level, with `text:s`,
 * `text:tab` and `text:line-break` read as the space, tab and line break they stand for. A file saved with a password
 * (its manifest names encryption data) is refused.
 */
function readOdt(bytes: Uint8Array, bounds: MaterialFormatBounds): MaterialFormatText {
  const entries = readArchive(bytes, bounds, (name) => name === 'content.xml' || name === 'meta.xml' || name === 'META-INF/manifest.xml');
  const manifest = entries.get('META-INF/manifest.xml');
  if (manifest !== undefined) {
    readXml(xmlPart(manifest), bounds, {
      open: (tag) => requireFormat(tag.local !== 'encryption-data', 'encrypted', 'ODT is saved with a password'),
    });
  }
  const content = entries.get('content.xml');
  requireFormat(content !== undefined, 'unreadable', 'ODT has no content');
  const meta = entries.get('meta.xml');
  const title = meta === undefined ? null : firstElementText(xmlPart(meta), 'title', bounds);

  const sink = new ParagraphSink(bounds);
  let body = 0;
  let skipping = 0;
  /** The paragraphs open around the current position, innermost last, each with its heading style. */
  const open: Array<string | undefined> = [];
  readXml(xmlPart(content), bounds, {
    open: (tag) => {
      if (tag.uri === ODF_OFFICE && tag.local === 'body') body += 1;
      if (body === 0) return;
      if (skipping > 0 || ODF_SKIPPED.has(`${tag.uri} ${tag.local}`)) {
        skipping += 1;
        return;
      }
      if (tag.uri !== ODF_TEXT) return;
      switch (tag.local) {
        case 'p':
        case 'h': {
          // A paragraph inside a paragraph ends what the one around it read so far.
          if (open.length > 0) sink.flush(open.at(-1));
          const level = Math.min(6, Math.max(1, Number.parseInt(attribute(tag, 'outline-level') ?? '1', 10) || 1));
          open.push(tag.local === 'h' ? `Heading${level}` : undefined);
          break;
        }
        case 's':
          if (open.length > 0) {
            const count = Number.parseInt(attribute(tag, 'c') ?? '1', 10);
            sink.text(' '.repeat(Math.min(ODF_MAX_SPACES, Math.max(1, Number.isFinite(count) ? count : 1))));
          }
          break;
        case 'tab':
          if (open.length > 0) sink.text('\t');
          break;
        case 'line-break':
          if (open.length > 0) sink.lineBreak();
          break;
      }
    },
    text: (text) => {
      if (body > 0 && skipping === 0 && open.length > 0) sink.text(text.replace(ODF_SPACE, ' '));
    },
    close: (tag) => {
      if (body === 0) return;
      if (skipping > 0) {
        skipping -= 1;
        return;
      }
      if (tag.uri === ODF_TEXT && (tag.local === 'p' || tag.local === 'h')) sink.flush(open.pop());
      if (tag.uri === ODF_OFFICE && tag.local === 'body') body -= 1;
    },
  });
  return { title, paragraphs: sink.paragraphs };
}

// ---- RTF -----------------------------------------------------------------------------------------------------------

/** A font's `\fcharset` and the Windows code page its bytes are written in. */
const RTF_CHARSET_CODE_PAGES: Readonly<Record<number, number>> = {
  0: 1252, 77: 10000, 128: 932, 129: 949, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256,
  186: 1257, 204: 1251, 222: 874, 238: 1250,
};
/** A Windows code page as `TextDecoder` names its encoding. GB2312 (936, 20936) is read as GBK, which contains it. */
const RTF_CODE_PAGE_LABELS: Readonly<Record<number, string>> = {
  874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251',
  1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256',
  1257: 'windows-1257', 1258: 'windows-1258', 10000: 'macintosh', 20936: 'gbk', 54936: 'gb18030', 65001: 'utf-8',
};
/** Destinations whose content is no body text: tables of the file, pictures, objects, headers, footers, notes, fields' codes. */
const RTF_SKIPPED: ReadonlySet<string> = new Set([
  'colortbl', 'stylesheet', 'pict', 'object', 'objdata', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl',
  'footerr', 'footerf', 'footnote', 'annotation', 'atnid', 'atnauthor', 'fldinst', 'shp', 'shpinst', 'shppict',
  'nonshppict', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'listoverridetable',
  'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'filetbl', 'revtbl', 'pgdsctbl', 'xe', 'tc', 'txe', 'template',
  'docvar', 'private', 'author', 'operator', 'subject', 'keywords', 'comment', 'doccomm', 'company', 'category',
  'manager', 'hlinkbase', 'creatim', 'revtim', 'printim', 'buptim', 'userprops', 'bkmkstart', 'bkmkend', 'pntext',
  'pntxta', 'pntxtb', 'listpicture', 'background', 'falt', 'panose', 'fname',
]);
const RTF_SYMBOLS: Readonly<Record<string, string>> = {
  tab: '\t', emdash: '—', endash: '–', emspace: '\u2003', enspace: '\u2002', qmspace: '\u2005', bullet: '•',
  lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', zwj: '\u200d', zwnj: '\u200c', ltrmark: '\u200e',
  rtlmark: '\u200f', cell: '\t', nestcell: '\t',
};
const RTF_PARAGRAPH_ENDS: ReadonlySet<string> = new Set(['par', 'sect', 'page', 'row', 'nestrow']);
const RTF_MAX_WORD = 32;
const RTF_MAX_PARAMETER_DIGITS = 10;
const RTF_HEX = /^[0-9A-Fa-f]{2}$/u;
/** A run of plain 7-bit text: read in one piece rather than a character at a time. */
const RTF_PLAIN = /[^\\{}\r\n\t\u0080-\u00ff]+/y;
/** Body text is handed to the paragraphs in pieces of at most this many code units, so the text bound is checked as it grows. */
const RTF_BODY_PIECE = 65_536;

function rtfLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function rtfDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** Where a group's text goes: the body, the document's title, nowhere (the font table, the information group, a skipped destination). */
type RtfDestination = 'body' | 'title' | 'info' | 'fonttbl' | 'skip';

interface RtfGroup {
  destination: RtfDestination;
  /** How many characters stand in for one `\u` in this group (`\ucN`). */
  unicodeSkip: number;
  font: number | null;
  hidden: boolean;
  /** The paragraph's outline level (`\outlinelevelN`, 0 for a first-level heading). */
  outline: number | null;
}

function rtfStyle(group: RtfGroup): string | undefined {
  return group.outline === null || group.outline > 5 ? undefined : `Heading${group.outline + 1}`;
}

/**
 * A Rich Text file's body text. `\uN` is read as its UTF-16 code unit (a pair of them as one character) with the `\ucN`
 * characters after it passed over; `\'hh` and any byte past 7 bits are read in the code page of the current font's
 * `\fcharset` (or `\cpg`), or the document's `\ansicpg`, through `TextDecoder` — GBK for GB2312 — and a code page this
 * runtime cannot decode refuses the file rather than guessing. `\par`, `\sect`, `\page` and `\row` end a paragraph,
 * `\line` breaks a line, `\outlinelevelN` makes a heading, and hidden text, fields' codes, pictures, objects, headers,
 * footers, notes, comments and the file's tables are not read. The title is the information group's `\title`.
 */
function readRtf(bytes: Uint8Array, bounds: MaterialFormatBounds): MaterialFormatText {
  // One character a byte (true ISO-8859-1, not the WHATWG latin1 label, which is windows-1252).
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  requireFormat(source.startsWith('{\\rtf'), 'unreadable', 'not RTF');
  const sink = new ParagraphSink(bounds);
  const decoders = new Map<string, TextDecoder>();
  const fontCodePages = new Map<number, number>();
  let documentCodePage = 1252;
  let title = '';
  let fontDefinition: number | null = null;
  const stack: RtfGroup[] = [];
  let group: RtfGroup = { destination: 'body', unicodeSkip: 1, font: null, hidden: false, outline: null };
  let pending: number[] = [];
  let pendingCodePage = 1252;
  /** Characters still to pass over after a `\u`: what stands in for it for a reader without Unicode. */
  let skipCharacters = 0;
  /** A `\*` was read: the destination it marks is skipped unless this reader knows it. */
  let ignorable = false;
  /** The first half of a surrogate pair a `\u` gave, waiting for the second so that the two are one character. */
  let highSurrogate = '';

  /** Body text read and not yet handed to the paragraphs. */
  let body = '';

  const reading = (): boolean => (group.destination === 'body' || group.destination === 'title') && !group.hidden;
  const flushBody = (): void => {
    if (body.length === 0) return;
    sink.text(body);
    body = '';
  };
  const emit = (text: string): void => {
    const value = highSurrogate + text;
    highSurrogate = '';
    if (group.destination === 'body') {
      body += value;
      if (body.length >= RTF_BODY_PIECE) flushBody();
    } else if (title.length <= MAX_TITLE_CODE_UNITS * 4) title += value;
  };
  const flushBytes = (): void => {
    if (pending.length === 0) return;
    const label = RTF_CODE_PAGE_LABELS[pendingCodePage];
    requireFormat(label !== undefined, 'unreadable', `unsupported code page ${pendingCodePage}`);
    let decoder = decoders.get(label);
    if (decoder === undefined) {
      try {
        decoder = new TextDecoder(label);
      } catch {
        refuse('unreadable', `code page ${pendingCodePage} cannot be decoded here`);
      }
      decoders.set(label, decoder);
    }
    const text = decoder.decode(Uint8Array.from(pending));
    pending = [];
    emit(text);
  };
  const byte = (value: number): void => {
    if (!reading()) return;
    const page = (group.font === null ? undefined : fontCodePages.get(group.font)) ?? documentCodePage;
    if (pending.length > 0 && page !== pendingCodePage) flushBytes();
    pendingCodePage = page;
    pending.push(value);
  };
  const text = (value: string): void => {
    flushBytes();
    if (reading()) emit(value);
  };
  const endParagraph = (): void => {
    flushBytes();
    flushBody();
    if (group.destination === 'body') sink.flush(rtfStyle(group));
  };

  const control = (word: string, parameter: number | null): void => {
    const starred = ignorable;
    ignorable = false;
    if (word === 'u') {
      flushBytes();
      if (parameter !== null && reading()) {
        const unit = parameter < 0 ? parameter + 65_536 : parameter & 0xffff;
        if (unit >= 0xd800 && unit <= 0xdbff) {
          if (highSurrogate !== '') emit('');
          highSurrogate = String.fromCharCode(unit);
        } else emit(String.fromCharCode(unit));
      }
      skipCharacters = group.unicodeSkip;
      return;
    }
    if (skipCharacters > 0) {
      skipCharacters -= 1;
      return;
    }
    switch (word) {
      case 'uc':
        group.unicodeSkip = Math.max(0, Math.min(8, parameter ?? 1));
        return;
      case 'ansicpg':
        if (parameter !== null && parameter > 0) documentCodePage = parameter;
        return;
      case 'ansi':
        documentCodePage = 1252;
        return;
      case 'mac':
        documentCodePage = 10_000;
        return;
      case 'fonttbl':
        flushBytes();
        group.destination = 'fonttbl';
        return;
      case 'info':
        flushBytes();
        group.destination = 'info';
        return;
      case 'title':
        flushBytes();
        group.destination = group.destination === 'info' ? 'title' : 'skip';
        return;
      case 'f':
        if (parameter === null) return;
        flushBytes();
        if (group.destination === 'fonttbl') fontDefinition = parameter;
        else group.font = parameter;
        return;
      case 'fcharset':
        if (group.destination === 'fonttbl' && fontDefinition !== null && parameter !== null) {
          const page = RTF_CHARSET_CODE_PAGES[parameter];
          if (page !== undefined) fontCodePages.set(fontDefinition, page);
        }
        return;
      case 'cpg':
        if (group.destination === 'fonttbl' && fontDefinition !== null && parameter !== null) fontCodePages.set(fontDefinition, parameter);
        return;
      case 'pard':
        group.outline = null;
        return;
      case 'outlinelevel':
        group.outline = parameter === null ? null : Math.max(0, parameter);
        return;
      case 'plain':
        flushBytes();
        group.hidden = false;
        return;
      case 'v':
        flushBytes();
        group.hidden = parameter !== 0;
        return;
      case 'line':
      case 'lbr':
        flushBytes();
        flushBody();
        if (group.destination === 'body' && !group.hidden) sink.lineBreak();
        return;
      case 'upr':
        // `{\upr{ANSI text}{\*\ud{Unicode text}}}`: the ANSI alternative is passed over and the Unicode one read in its place.
        flushBytes();
        group.destination = 'skip';
        return;
      case 'ud': {
        const outer = stack.at(-2);
        if (stack.at(-1)?.destination === 'skip' && outer !== undefined) group.destination = outer.destination;
        return;
      }
    }
    if (RTF_PARAGRAPH_ENDS.has(word)) {
      endParagraph();
      return;
    }
    const symbol = RTF_SYMBOLS[word];
    if (symbol !== undefined) {
      text(symbol);
      return;
    }
    if (starred || RTF_SKIPPED.has(word)) {
      flushBytes();
      group.destination = 'skip';
    }
  };

  const length = source.length;
  let at = 0;
  while (at < length) {
    const character = source.charAt(at);
    if (character === '{') {
      flushBytes();
      requireFormat(stack.length < bounds.depth, 'over-bound', 'RTF group nesting exceeds its bound');
      stack.push(group);
      group = { ...group };
      skipCharacters = 0;
      at += 1;
      continue;
    }
    if (character === '}') {
      flushBytes();
      skipCharacters = 0;
      ignorable = false;
      if (group.destination === 'fonttbl') fontDefinition = null;
      at += 1;
      const outer = stack.pop();
      // The document's own group closed: anything after it is not RTF.
      if (outer === undefined || stack.length === 0) {
        flushBody();
        if (group.destination === 'body') sink.flush(rtfStyle(group));
        if (outer !== undefined) group = outer;
        break;
      }
      group = outer;
      continue;
    }
    if (character === '\\') {
      const next = source.charAt(at + 1);
      if (rtfLetter(next.charCodeAt(0))) {
        let end = at + 1;
        while (end < length && rtfLetter(source.charCodeAt(end))) end += 1;
        requireFormat(end - at - 1 <= RTF_MAX_WORD, 'unreadable', 'RTF control word is too long');
        const word = source.slice(at + 1, end);
        let parameter: number | null = null;
        const negative = source.charAt(end) === '-' && rtfDigit(source.charCodeAt(end + 1));
        const digits = negative ? end + 1 : end;
        if (rtfDigit(source.charCodeAt(digits))) {
          end = digits;
          while (end < length && rtfDigit(source.charCodeAt(end))) end += 1;
          requireFormat(end - digits <= RTF_MAX_PARAMETER_DIGITS, 'unreadable', 'RTF parameter is too long');
          parameter = Number.parseInt(source.slice(digits, end), 10) * (negative ? -1 : 1);
        }
        if (source.charAt(end) === ' ') end += 1;
        at = end;
        if (word === 'bin') {
          // Binary data of the given length, never text: passed over whole, within the file.
          const count = Math.max(0, parameter ?? 0);
          requireFormat(at + count <= length, 'unreadable', 'RTF binary data runs past the file');
          at += count;
          continue;
        }
        control(word, parameter);
        continue;
      }
      if (next === '\'') {
        const hex = source.slice(at + 2, at + 4);
        at += 4;
        if (!RTF_HEX.test(hex)) continue;
        if (skipCharacters > 0) {
          skipCharacters -= 1;
          continue;
        }
        byte(Number.parseInt(hex, 16));
        continue;
      }
      at += 2;
      if (next === '*') {
        ignorable = true;
        continue;
      }
      if (skipCharacters > 0) {
        skipCharacters -= 1;
        continue;
      }
      switch (next) {
        case '\\':
        case '{':
        case '}':
          text(next);
          break;
        case '~':
          text('\u00a0');
          break;
        case '_':
          text('\u2011');
          break;
        case '\r':
        case '\n':
          endParagraph();
          break;
        default:
          break;
      }
      continue;
    }
    if (character === '\r' || character === '\n') {
      at += 1;
      continue;
    }
    if (skipCharacters > 0) {
      skipCharacters -= 1;
      at += 1;
      continue;
    }
    const code = character.charCodeAt(0);
    if (code >= 0x20 && code < 0x80) {
      RTF_PLAIN.lastIndex = at;
      const run = RTF_PLAIN.exec(source)![0];
      text(run);
      at += run.length;
      continue;
    }
    at += 1;
    if (code >= 0x80) byte(code);
    else if (code === 0x09) text('\t');
    else if (code >= 0x20) text(character);
  }
  flushBytes();
  flushBody();
  if (group.destination === 'body') sink.flush(rtfStyle(group));
  return { title: title.length > 0 ? title : null, paragraphs: sink.paragraphs };
}

