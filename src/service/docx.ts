import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename, extname, posix } from 'node:path';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, type FidelityCategoryProjection } from '../shared/protocol.js';

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_COUNT = 256;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_BLOCK_COUNT = 2_048;
const MAX_TEXT_CODE_UNITS = 1_000_000;
const MAX_ZIP_RATIO = 200;
const PARSER_IDENTITY = 'ai7-docx-fflate-saxes/1';

export interface ParsedDocxBlock {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
}

export interface ParsedDocx {
  parserIdentity: typeof PARSER_IDENTITY;
  sourceDigest: string;
  contentDigest: string;
  structureDigest: string;
  archiveBytes: number;
  blocks: ParsedDocxBlock[];
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: {
    value: string;
    sourceLabel: 'DOCX 标题元数据' | '文档首个标题' | '文件名';
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

function requireDocx(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOCX_REJECTED:${message}`);
}

function canonicalJson(value: unknown): string {
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

function graphemeCount(value: string): number {
  return Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value)).length;
}

function safeDisplayName(input: string): string {
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

async function readBoundedArchive(path: string): Promise<{
  sourceDigest: string;
  archiveBytes: number;
  entries: Map<string, Uint8Array>;
  entryNames: string[];
}> {
  const selectedNames = new Set([
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/core.xml',
    'word/document.xml',
    'word/_rels/document.xml.rels',
  ]);
  const selectedPrefixes = ['word/header', 'word/footer', 'word/comments', 'word/footnotes', 'word/endnotes'];
  const entries = new Map<string, Uint8Array>();
  const entryNames: string[] = [];
  const seen = new Set<string>();
  const sourceHash = createHash('sha256');
  let archiveBytes = 0;
  let expandedBytes = 0;
  let callbackFailure: Error | undefined;

  const unzip = new Unzip((file) => {
    try {
      const name = validateEntryName(file.name, seen);
      entryNames.push(name);
      requireDocx(entryNames.length <= MAX_ENTRY_COUNT, 'too many ZIP entries');
      requireDocx(file.compression === 0 || file.compression === 8, 'unsupported ZIP compression');
      requireDocx(file.originalSize !== undefined && file.size !== undefined, 'ZIP entry lacks bounded sizes');
      requireDocx(file.originalSize <= MAX_ENTRY_BYTES, 'ZIP entry is too large');
      expandedBytes += file.originalSize;
      requireDocx(expandedBytes <= MAX_EXPANDED_BYTES, 'expanded DOCX is too large');
      if (file.originalSize > 1_048_576) {
        requireDocx(file.size > 0 && file.originalSize / file.size <= MAX_ZIP_RATIO, 'suspicious ZIP ratio');
      }
      requireDocx(
        !/(^|\/)(vbaProject\.bin|embeddings|activeX)(\/|$)/i.test(name) && !name.endsWith('.bin'),
        'active or embedded content is outside this tracer',
      );

      const selected =
        selectedNames.has(name) ||
        selectedPrefixes.some((prefix) => name.startsWith(prefix) && name.toLowerCase().endsWith('.xml'));
      if (!selected || name.endsWith('/')) return;
      requireDocx(file.originalSize <= MAX_XML_BYTES, 'XML entry is too large');
      const chunks: Uint8Array[] = [];
      let received = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          callbackFailure = error;
          return;
        }
        received += chunk.byteLength;
        if (received > MAX_XML_BYTES || received > (file.originalSize ?? MAX_XML_BYTES)) {
          callbackFailure = new Error('DOCX_REJECTED:XML entry exceeded its bound');
          return;
        }
        chunks.push(chunk);
        if (final) {
          const joined = new Uint8Array(received);
          let offset = 0;
          for (const part of chunks) {
            joined.set(part, offset);
            offset += part.byteLength;
          }
          entries.set(name, joined);
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
  requireDocx(entries.has('[Content_Types].xml') && entries.has('word/document.xml'), 'not a WordprocessingML DOCX');

  return { sourceDigest: sourceHash.digest('hex'), archiveBytes, entries, entryNames };
}

function decodeXml(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  requireDocx(!/<!DOCTYPE|<!ENTITY/i.test(text), 'DTD or entity declaration');
  return text;
}

function attributeValue(tag: SaxesTagNS, localName: string): string | undefined {
  return Object.values(tag.attributes).find((attribute) => attribute.local === localName)?.value;
}

function parseCoreTitle(xml: string | undefined): string | undefined {
  if (!xml) return undefined;
  let inTitle = 0;
  let value = '';
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireDocx(false, 'DOCTYPE in core properties'));
  parser.on('processinginstruction', () => requireDocx(false, 'processing instruction in core properties'));
  parser.on('opentag', (tag) => {
    if (tag.local === 'title') inTitle += 1;
  });
  parser.on('text', (text) => {
    if (inTitle > 0) value += text;
  });
  parser.on('closetag', (tag) => {
    if (tag.local === 'title') inTitle -= 1;
  });
  parser.write(xml).close();
  const normalized = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= 180 ? normalized : undefined;
}

function parseDocument(xml: string): { blocks: ParsedDocxBlock[]; signals: DocumentSignals } {
  const blocks: ParsedDocxBlock[] = [];
  const signals: DocumentSignals = {
    inlineStyles: 0,
    commentsRevisions: 0,
    notes: 0,
    tables: 0,
    imagesCaptions: 0,
    sections: 0,
  };
  let textCodeUnits = 0;
  let textDepth = 0;
  let paragraph:
    | {
        text: string;
        style: string | undefined;
      }
    | undefined;

  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireDocx(false, 'DOCTYPE in document XML'));
  parser.on('processinginstruction', () => requireDocx(false, 'processing instruction in document XML'));
  parser.on('opentag', (tag) => {
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
      case 'tab':
        if (paragraph) paragraph.text += '\t';
        break;
      case 'br':
      case 'cr':
        if (paragraph) paragraph.text += '\n';
        break;
      case 'b':
      case 'i':
      case 'u':
      case 'strike':
      case 'color':
      case 'highlight':
        signals.inlineStyles += 1;
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
        signals.sections += 1;
        break;
      default:
        break;
    }
  });
  parser.on('text', (text) => {
    if (paragraph && textDepth > 0) {
      textCodeUnits += text.length;
      requireDocx(textCodeUnits <= MAX_TEXT_CODE_UNITS, 'document text is too large');
      paragraph.text += text;
    }
  });
  parser.on('closetag', (tag) => {
    if (tag.local === 't') textDepth -= 1;
    if (tag.local !== 'p') return;
    requireDocx(paragraph, 'paragraph state missing');
    const text = paragraph.text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (text.length > 0) {
      requireDocx(text.length <= MAX_BLOCK_CODE_UNITS && graphemeCount(text) <= MAX_BLOCK_GRAPHEMES, 'paragraph exceeds the bounded block size');
      requireDocx(blocks.length < MAX_BLOCK_COUNT, 'too many manuscript blocks');
      const style = paragraph.style?.toLocaleLowerCase('en-US') ?? '';
      const headingMatch = /(?:heading|标题)\s*([1-6])/.exec(style);
      const kind = style === 'title' || style === '标题' ? 'title' : headingMatch ? 'heading' : 'paragraph';
      const level = kind === 'title' ? 1 : headingMatch ? Number(headingMatch[1]) : null;
      const position = blocks.length + 1;
      const digest = sha256(canonicalJson({ kind, level, text }));
      blocks.push({
        blockId: `blk_${sha256(`${position}\u0000${digest}`).slice(0, 24)}`,
        position,
        kind,
        level,
        text,
        digest,
      });
    }
    paragraph = undefined;
  });
  parser.write(xml).close();
  requireDocx(paragraph === undefined && textDepth === 0, 'incomplete document XML state');
  requireDocx(blocks.length > 0, 'DOCX contains no editable text blocks');
  return { blocks, signals };
}

function fidelityReport(signals: DocumentSignals, entryNames: string[]): FidelityCategoryProjection[] {
  const headersFooters = entryNames.filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)).length;
  const rows: FidelityCategoryProjection[] = [
    {
      key: 'inline-styles',
      label: '行内样式',
      count: signals.inlineStyles,
      status: 'preserved',
      statusLabel: '完整保留',
      detail: signals.inlineStyles === 0 ? '未检测到行内样式。' : '检测到的基础粗体、斜体、下划线与颜色标记可保留。',
    },
    {
      key: 'comments-revisions',
      label: '批注与修订',
      count: signals.commentsRevisions,
      status: signals.commentsRevisions === 0 ? 'preserved' : 'unsupported',
      statusLabel: signals.commentsRevisions === 0 ? '完整保留' : '不支持导入',
      detail: signals.commentsRevisions === 0 ? '未检测到批注或修订标记。' : '本次 tracer 不导入批注或修订标记。',
    },
    {
      key: 'notes',
      label: '脚注与尾注',
      count: signals.notes,
      status: signals.notes === 0 ? 'preserved' : 'unsupported',
      statusLabel: signals.notes === 0 ? '完整保留' : '不支持导入',
      detail: signals.notes === 0 ? '未检测到脚注或尾注。' : '本次 tracer 不导入脚注或尾注。',
    },
    {
      key: 'tables',
      label: '表格',
      count: signals.tables,
      status: signals.tables === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.tables === 0 ? '完整保留' : '降级导入',
      detail: signals.tables === 0 ? '未检测到表格。' : '表格会退化为连续文本；本次 clean tracer 不提交该分支。',
    },
    {
      key: 'images-captions',
      label: '图片与图注',
      count: signals.imagesCaptions,
      status: signals.imagesCaptions === 0 ? 'preserved' : 'degraded',
      statusLabel: signals.imagesCaptions === 0 ? '完整保留' : '降级导入',
      detail: signals.imagesCaptions === 0 ? '未检测到图片或图注。' : '图片不会进入可编辑稿件；本次 clean tracer 不提交该分支。',
    },
    {
      key: 'sections',
      label: '分节',
      count: signals.sections,
      status: 'preserved',
      statusLabel: '完整保留',
      detail: '分节只用于确认文档结构；可编辑文本按稳定段落顺序保留。',
    },
    {
      key: 'headers-footers',
      label: '页眉与页脚',
      count: headersFooters,
      status: headersFooters === 0 ? 'preserved' : 'degraded',
      statusLabel: headersFooters === 0 ? '完整保留' : '降级导入',
      detail: headersFooters === 0 ? '未检测到页眉或页脚。' : '页眉页脚不进入稿件正文；本次 clean tracer 不提交该分支。',
    },
    {
      key: 'round-trip-export',
      label: 'DOCX 往返与导出预期',
      count: 0,
      status: 'unsupported',
      statusLabel: '不支持导入',
      detail: '本 tracer 不提供 DOCX 导出，因此无法建立往返行为、版式复原或导出结果保证。',
    },
  ];
  return rows;
}

export function isCleanTracerFidelity(fidelity: ReadonlyArray<FidelityCategoryProjection>): boolean {
  return fidelity.length === 8 && fidelity.every((category) =>
    category.key === 'round-trip-export' ? category.status === 'unsupported' : category.status === 'preserved',
  );
}

export async function parseDocx(path: string, displayNameInput: string): Promise<ParsedDocx> {
  const displayName = safeDisplayName(displayNameInput);
  const archive = await readBoundedArchive(path);
  const contentTypes = decodeXml(archive.entries.get('[Content_Types].xml')!);
  requireDocx(
    contentTypes.includes('wordprocessingml.document.main+xml'),
    'package does not declare a WordprocessingML document',
  );
  const documentXml = decodeXml(archive.entries.get('word/document.xml')!);
  const { blocks, signals } = parseDocument(documentXml);
  const coreTitle = archive.entries.get('docProps/core.xml');
  const metadataTitle = parseCoreTitle(coreTitle ? decodeXml(coreTitle) : undefined);
  const titleBlock = blocks.find((block) => block.kind === 'title' || block.kind === 'heading');
  const fallbackTitle = displayName.slice(0, -extname(displayName).length).trim();
  const titleSuggestion = metadataTitle
    ? { value: metadataTitle, sourceLabel: 'DOCX 标题元数据' as const }
    : titleBlock
      ? { value: titleBlock.text.slice(0, 180), sourceLabel: '文档首个标题' as const }
      : { value: fallbackTitle, sourceLabel: '文件名' as const };
  requireDocx(titleSuggestion.value.length > 0, 'no usable title suggestion');
  const fidelity = fidelityReport(signals, archive.entryNames);
  requireDocx(isCleanTracerFidelity(fidelity), 'document uses a fidelity branch outside the clean J-01 tracer');

  return {
    parserIdentity: PARSER_IDENTITY,
    sourceDigest: archive.sourceDigest,
    contentDigest: sha256(blocks.map((block) => block.text).join('\u001e')),
    structureDigest: sha256(
      canonicalJson(blocks.map(({ blockId, position, kind, level, digest }) => ({ blockId, position, kind, level, digest }))),
    ),
    archiveBytes: archive.archiveBytes,
    blocks,
    fidelity,
    titleSuggestion,
  };
}
