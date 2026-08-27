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
} from '../shared/protocol.js';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
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
const PARSER_IDENTITY = 'ai7-docx-fflate-saxes/1';
const SAMPLE1_SOURCE_BYTES = 29_550;
const SAMPLE1_SOURCE_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';

export interface ImportFidelityDegradation {
  categoryKey: FidelityCategoryKey;
  label: string;
  count: number;
}

export interface ImportFidelityPlan {
  outcome: 'clean-import-no-round-trip' | 'degraded-import-no-round-trip';
  degradations: ImportFidelityDegradation[];
}

export interface ParsedDocxBlock {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
}

export interface ParsedDocx {
  parserIdentity: typeof PARSER_IDENTITY;
  sourceDigest: string;
  contentDigest: string;
  structureDigest: string;
  archiveBytes: number;
  blockCount: number;
  characterCount: number;
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: {
    value: string;
    sourceLabel: 'DOCX 标题元数据' | '文件名';
  };
}

interface DocumentSignals {
  inlineStyles: number;
  commentsRevisions: number;
  notes: number;
  tables: number;
  imagesCaptions: number;
  sections: number;
}

interface DocumentParseResult {
  blockCount: number;
  characterCount: number;
  contentDigest: string;
  structureDigest: string;
  signals: DocumentSignals;
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

function safeDisplayName(input: string): string {
  requireDocx(input.isWellFormed(), 'invalid display name');
  const name = basename(input).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireDocx(name.length > 0 && name.length <= 180, 'invalid display name');
  requireDocx(extname(name).toLowerCase() === '.docx', 'selected file is not DOCX');
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

function attributeLocalNames(tag: SaxesTagNS): string[] {
  return Object.values(tag.attributes)
    .map((attribute) => attribute.local)
    .sort();
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

function createDocumentParser(
  exactSample1: boolean,
  onBlock: (block: ParsedDocxBlock) => void,
): { write(chunk: Uint8Array, final: boolean): void; finish(): DocumentParseResult } {
  const signals: DocumentSignals = {
    inlineStyles: 0,
    commentsRevisions: 0,
    notes: 0,
    tables: 0,
    imagesCaptions: 0,
    sections: 0,
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
  let terminalSection: { depth: number; kind: 'default' | 'sample1'; children: string[] } | undefined;
  let paragraph: { text: string; style: string | undefined } | undefined;
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

  const appendParagraphText = (addition: string): void => {
    if (!paragraph || addition.length === 0) return;
    requireDocx(addition.length <= MAX_BLOCK_CODE_UNITS, 'paragraph text chunk exceeds the bounded block size');
    requireDocx(
      paragraph.text.length <= MAX_BLOCK_CODE_UNITS - addition.length,
      'paragraph exceeds the bounded block size',
    );
    requireDocx(textCodeUnits <= MAX_TEXT_CODE_UNITS - addition.length, 'document text is too large');
    const nextText = paragraph.text + addition;
    requireDocx(graphemeCount(nextText) <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
    paragraph.text = nextText;
    textCodeUnits += addition.length;
  };

  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireDocx(false, 'DOCTYPE in document XML'));
  parser.on('processinginstruction', () => requireDocx(false, 'processing instruction in document XML'));
  parser.on('opentag', (tag) => {
    requireDocx(ancestors.length < MAX_XML_NESTING_DEPTH, 'document XML nesting exceeds its safe bound');
    const parent = ancestors.at(-1);
    const grandparent = ancestors.at(-2);
    if (terminalSectionSeen && parent === 'body') requireDocx(false, 'terminal section properties are not terminal');
    if (terminalSection && tag.local !== 'sectPr') {
      requireDocx(
        terminalSection.kind === 'sample1' && ancestors.length === terminalSection.depth + 1,
        'non-default terminal section properties',
      );
      terminalSection.children.push(tag.local);
    }
    if (runProperties) runProperties.styled = true;
    switch (tag.local) {
      case 'p':
        requireDocx(paragraph === undefined, 'nested paragraph');
        paragraph = { text: '', style: undefined };
        break;
      case 'pStyle':
        if (paragraph) paragraph.style = attributeValue(tag, 'val');
        break;
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
        signals.imagesCaptions += 1;
        break;
      case 'sectPr':
        if (parent === 'body') {
          requireDocx(!terminalSectionSeen && terminalSection === undefined, 'duplicate terminal section properties');
          const attributes = attributeLocalNames(tag);
          if (attributes.length === 0) terminalSection = { depth: ancestors.length, kind: 'default', children: [] };
          else {
            requireDocx(exactSample1 && hasExactStrings(attributes, ['rsidR', 'rsidRPr']), 'non-default terminal section properties');
            terminalSection = { depth: ancestors.length, kind: 'sample1', children: [] };
          }
        } else if (parent === 'pPr' && grandparent === 'p') signals.sections += 1;
        else requireDocx(false, 'unsupported section properties');
        break;
      default:
        break;
    }
    ancestors.push(tag.local);
  });
  parser.on('text', (text) => {
    if (paragraph && textDepth > 0) appendParagraphText(text);
  });
  parser.on('closetag', (tag) => {
    requireDocx(ancestors.pop() === tag.local, 'document element stack mismatch');
    if (tag.local === 't') textDepth -= 1;
    if (tag.local === 'rPr') {
      requireDocx(runProperties?.depth === ancestors.length, 'run properties state mismatch');
      if (runProperties.styled) signals.inlineStyles += 1;
      runProperties = undefined;
    }
    if (tag.local === 'sectPr' && terminalSection?.depth === ancestors.length) {
      if (terminalSection.kind === 'default') requireDocx(terminalSection.children.length === 0, 'non-default terminal section properties');
      else {
        requireDocx(hasExactStrings(terminalSection.children, ['pgSz', 'pgMar', 'cols', 'docGrid']), 'non-default terminal section properties');
        signals.sections += 1;
      }
      terminalSectionSeen = true;
      terminalSection = undefined;
    }
    if (tag.local !== 'p') return;
    requireDocx(paragraph, 'paragraph state missing');
    requireDocx(paragraph.text.isWellFormed(), 'paragraph contains invalid text');
    const text = paragraph.text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (text.length > 0) {
      const blockGraphemes = graphemeCount(text);
      requireDocx(text.length <= MAX_BLOCK_CODE_UNITS && blockGraphemes <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
      requireDocx(blockCount < MAX_BLOCK_COUNT, 'too many manuscript blocks');
      const style = paragraph.style?.toLocaleLowerCase('en-US') ?? '';
      const headingMatch = /(?:heading|标题)\s*([1-6])/.exec(style);
      const kind = style === 'title' || style === '标题' ? 'title' : headingMatch ? 'heading' : 'paragraph';
      const level = kind === 'title' ? 1 : headingMatch ? Number(headingMatch[1]) : null;
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
        paragraph === undefined && textDepth === 0 && ancestors.length === 0 && runProperties === undefined && terminalSection === undefined,
        'incomplete document XML state',
      );
      requireDocx(blockCount > 0, 'DOCX contains no editable text blocks');
      return {
        blockCount,
        characterCount,
        contentDigest: contentHash.digest('hex'),
        structureDigest: structureHash.update(']').digest('hex'),
        signals,
      };
    },
  };
}

async function readStreamingArchive(
  path: string,
  exactSample1: boolean,
  onBlock: (block: ParsedDocxBlock) => void,
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
  const documentParser = createDocumentParser(exactSample1, onBlock);
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

  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    archiveBytes += chunk.byteLength;
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
  const headersFooters = entryNames.filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)).length;
  return [
    {
      key: 'inline-styles', label: '行内样式', count: signals.inlineStyles,
      status: signals.inlineStyles === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.inlineStyles === 0 ? '完整保留' : '降级导入',
      detail: signals.inlineStyles === 0 ? '未检测到行内样式。' : '检测到字体与字号（rFonts、sz、szCs）等行内样式；可编辑内容块仅保留文字顺序，后续导出无法恢复这些样式。',
    },
    {
      key: 'comments-revisions', label: '批注与修订', count: signals.commentsRevisions,
      status: signals.commentsRevisions === 0 ? 'preserved' : 'unsupported',
      statusLabel: signals.commentsRevisions === 0 ? '完整保留' : '不支持导入',
      detail: signals.commentsRevisions === 0 ? '未检测到批注或修订标记。' : '本次受限导入不导入批注或修订标记。',
    },
    {
      key: 'notes', label: '脚注与尾注', count: signals.notes,
      status: signals.notes === 0 ? 'preserved' : 'unsupported',
      statusLabel: signals.notes === 0 ? '完整保留' : '不支持导入',
      detail: signals.notes === 0 ? '未检测到脚注或尾注。' : '本次受限导入不导入脚注或尾注。',
    },
    {
      key: 'tables', label: '表格', count: signals.tables,
      status: signals.tables === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.tables === 0 ? '完整保留' : '降级导入',
      detail: signals.tables === 0 ? '未检测到表格。' : '表格会退化为连续文本；本次受限导入不提交该分支。',
    },
    {
      key: 'images-captions', label: '图片与图注', count: signals.imagesCaptions,
      status: signals.imagesCaptions === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.imagesCaptions === 0 ? '完整保留' : '降级导入',
      detail: signals.imagesCaptions === 0 ? '未检测到图片或图注。' : '图片不会进入可编辑稿件；本次受限导入不提交该分支。',
    },
    {
      key: 'sections', label: '分节', count: signals.sections,
      status: signals.sections === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.sections === 0 ? '完整保留' : '降级导入',
      detail: signals.sections === 0 ? '未检测到额外分节；单节正文顺序完整保留，且不据此建立版式往返保证。' : '检测到页尺寸、页边距、分栏与文档网格等分节设置；正文按单一连续稿件顺序导入，后续导出无法恢复原分节版式。',
    },
    {
      key: 'headers-footers', label: '页眉与页脚', count: headersFooters,
      status: headersFooters === 0 ? 'preserved' : 'degraded',
      statusLabel: headersFooters === 0 ? '完整保留' : '降级导入',
      detail: headersFooters === 0 ? '未检测到页眉或页脚。' : '页眉页脚不进入稿件正文；本次受限导入不提交该分支。',
    },
    {
      key: 'round-trip-export', label: 'DOCX 往返与导出预期', count: 0, status: 'unsupported', statusLabel: '不支持导入',
      detail: '本导入功能不提供 DOCX 导出，因此无法建立往返行为、版式复原或导出结果保证。',
    },
  ];
}

export function isCleanTracerFidelity(fidelity: ReadonlyArray<FidelityCategoryProjection>): boolean {
  return hasExactFidelityProjection(
    fidelity,
    fidelityReport({ inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0 }, []),
  );
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

export function deriveImportFidelityPlan(fidelity: unknown, sourceDigest: string, sourceBytes: number): ImportFidelityPlan | undefined {
  const cleanProjection = fidelityReport(
    { inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0 },
    [],
  );
  if (hasExactFidelityProjection(fidelity, cleanProjection)) return { outcome: 'clean-import-no-round-trip', degradations: [] };
  if (sourceDigest !== SAMPLE1_SOURCE_SHA256 || sourceBytes !== SAMPLE1_SOURCE_BYTES) return undefined;
  const sample1Projection = fidelityReport(
    { inlineStyles: 266, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 1 },
    [],
  );
  if (!hasExactFidelityProjection(fidelity, sample1Projection)) return undefined;
  return {
    outcome: 'degraded-import-no-round-trip',
    degradations: fidelity.filter((category) => category.status === 'degraded')
      .map((category) => ({ categoryKey: category.key, label: category.label, count: category.count })),
  };
}

export async function parseDocx(
  path: string,
  displayNameInput: string,
  onBlock: (block: ParsedDocxBlock) => void,
  expectedSource?: { digest: string; bytes: number },
): Promise<ParsedDocx> {
  const displayName = safeDisplayName(displayNameInput);
  const exactSample1 = expectedSource?.digest === SAMPLE1_SOURCE_SHA256 && expectedSource.bytes === SAMPLE1_SOURCE_BYTES;
  const archive = await readStreamingArchive(path, exactSample1, onBlock);
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
  requireDocx(deriveImportFidelityPlan(fidelity, archive.sourceDigest, archive.archiveBytes) !== undefined, 'document uses a fidelity branch outside the bounded import');
  return {
    parserIdentity: PARSER_IDENTITY,
    sourceDigest: archive.sourceDigest,
    contentDigest: archive.document.contentDigest,
    structureDigest: archive.document.structureDigest,
    archiveBytes: archive.archiveBytes,
    blockCount: archive.document.blockCount,
    characterCount: archive.document.characterCount,
    fidelity,
    titleSuggestion,
  };
}
