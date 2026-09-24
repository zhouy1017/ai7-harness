import { posix } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { graphemesOf } from '../shared/mark-anchor.js';
import {
  EXPORT_FIDELITY_STATUS_LABELS,
  MAX_EXPORT_FIDELITY_POSITIONS,
  type ExportFidelityKey,
  type ExportFidelityRowProjection,
  type ExportFidelityStatus,
  type ManuscriptExportOptions,
} from '../shared/protocol.js';

/**
 * DOCX export (Issue #413, plan slice S64; ADR 0086 §3, ADR 0079 §3; V2-UX-EXP-001, EXP-007, EXP-023, EXP-024).
 *
 * Pure: it reads the bytes and records it is handed and returns bytes and a review, and touches no store,
 * file or clock. The same input always gives the same bytes, so a preparation's payload digest can be
 * checked again at approval by writing the payload again.
 *
 * **Restore from the original (E2).** When the Revision's blocks carry the source-paragraph mapping of the
 * import that made them (`manuscript_block_sources`, schema revision 27), the original `word/document.xml` is
 * walked in order. Every element named `p` takes the next paragraph index, exactly as the parser counts them.
 * - A source paragraph mapped to an unedited block (the block's digest is still the one the mapping recorded)
 *   that carries no exported mark is restored from the original, stripped to the view the parser read: every
 *   revision rejected (`w:ins` and `w:moveTo` content dropped, `w:del` and `w:moveFrom` unwrapped with their
 *   deleted text written as text), and every comment anchor, formatting revision and revision marker dropped.
 * - An edited block, or one carrying an exported mark, is regenerated: the source paragraph's properties and
 *   its first run's properties over the block's text, with the marks written from AI7's own state, and its
 *   bookmarks kept at its beginning and close so a table of contents still links to it. What the paragraph held
 *   beyond its text — a drawing, a text box's anchor, a note reference, a field, other runs' formatting — is not
 *   written, and the review names the block (降级导出).
 * - A source paragraph mapped to nothing (an empty one, a text box's own paragraph, a section carrier) is
 *   restored stripped. A text box merged into the body at import is not written as a box: its paragraphs are
 *   written as body paragraphs right after the paragraph that anchored it.
 * - Every other part of the package — styles, numbering, settings, headers and footers, notes, media and
 *   relationships — is copied from the original. The original's comment parts are dropped and replaced by
 *   AI7's own.
 *
 * **Fresh build.** A Revision without a mapping (an import before revision 27) or of a converted file is
 * written fresh from its blocks with default styles, and every class the file carries is `无法导出`.
 *
 * **Marks (E3).** A 批注 becomes a Word comment whose author is the mark's source (the editor is 「编辑」), with
 * the editor's replies as threaded replies and a resolved one marked done; a pending 修改建议 — open, or
 * accepted and not applied — becomes a tracked deletion of its current words and a tracked insertion of its
 * proposal; an applied one is already text; a 备注 is written only when the export includes 备注, as a comment
 * whose author is 「备注」. A highlight is never written, and neither is any basis or evidence. A mark that no
 * longer stands on its words is not written and is counted `无法导出`.
 */
export const DOCX_EXPORT_WRITER_IDENTITY = 'ai7-docx-export/1';

/** The author a mark the editor wrote carries in the exported file, and the one a 备注 carries. */
export const EDITOR_AUTHOR_LABEL = '编辑';
export const EDITOR_NOTE_AUTHOR_LABEL = '备注';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 96 * 1024 * 1024;
const MAX_ENTRY_COUNT = 256;
const MAX_XML_NESTING_DEPTH = 128;
const ARCHIVE_MTIME = new Date('2026-01-01T00:00:00.000Z');
const ARCHIVE_LEVEL = 6;

const WORD_MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MARKUP_COMPATIBILITY = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const DOCUMENT_RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const OFFICE_DOCUMENT_TYPE = `${DOCUMENT_RELATIONSHIPS}/officeDocument`;
const CORE_PROPERTIES_TYPE = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const STYLES_TYPE = `${DOCUMENT_RELATIONSHIPS}/styles`;
const COMMENTS_TYPE = `${DOCUMENT_RELATIONSHIPS}/comments`;
const COMMENTS_EXTENDED_TYPE = 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended';
/** Every part that carries or indexes a file's comments: the export replaces them all with AI7's own. */
const COMMENT_PART_TYPES: ReadonlySet<string> = new Set([
  COMMENTS_TYPE,
  COMMENTS_EXTENDED_TYPE,
  'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds',
  'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible',
  'http://schemas.microsoft.com/office/2011/relationships/people',
]);
const COMMENT_PART_NAMES = /^word\/(?:comments|commentsExtended|commentsIds|commentsExtensible|people)\.xml$/i;
const MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const COMMENTS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';
const COMMENTS_EXTENDED_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml';
const STYLES_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml';
const CORE_CONTENT_TYPE = 'application/vnd.openxmlformats-package.core-properties+xml';
const RELATIONSHIPS_CONTENT_TYPE = 'application/vnd.openxmlformats-package.relationships+xml';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Revision markup that holds formatting, not text: dropped, keeping the formatting as it stands. */
const FORMATTING_REVISIONS: ReadonlySet<string> = new Set([
  'rPrChange', 'pPrChange', 'sectPrChange', 'tblPrChange', 'trPrChange', 'tcPrChange', 'tblGridChange',
  'tblPrExChange', 'numberingChange',
]);
/** Markers that only say a revision or a comment is there. */
const REVISION_MARKERS: ReadonlySet<string> = new Set([
  'cellIns', 'cellDel', 'cellMerge', 'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd',
  'customXmlInsRangeStart', 'customXmlInsRangeEnd', 'customXmlDelRangeStart', 'customXmlDelRangeEnd',
  'customXmlMoveFromRangeStart', 'customXmlMoveFromRangeEnd', 'customXmlMoveToRangeStart', 'customXmlMoveToRangeEnd',
]);
const COMMENT_MARKERS: ReadonlySet<string> = new Set(['commentRangeStart', 'commentRangeEnd', 'commentReference']);
/**
 * The revisions that change no text of either reading and become no mark on import (Issue #411): a cell's merge,
 * and custom XML's markup — each counted once, by the marker that opens it. The export drops them, so they are
 * counted under 原文件中的修订.
 */
const TEXT_NEUTRAL_REVISIONS: ReadonlySet<string> = new Set([
  'cellMerge', 'customXmlInsRangeStart', 'customXmlDelRangeStart', 'customXmlMoveFromRangeStart', 'customXmlMoveToRangeStart',
]);
/** What a table cell must hold at least one of (ISO/IEC 29500-1 §17.4.66): a cell without one is corrupt. */
const CELL_CONTENT: ReadonlySet<string> = new Set(['p', 'tbl', 'sdt', 'customXml', 'altChunk']);
/** The parents under which `w:ins` and its kin mark a property rather than hold runs. */
const PROPERTY_PARENTS: ReadonlySet<string> = new Set(['rPr', 'trPr', 'numPr', 'pPr']);
/** What makes a paragraph more than an empty mark: text, a drawing, a field, a note or a section carrier. */
const CONTENT_ELEMENTS: ReadonlySet<string> = new Set([
  'tab', 'br', 'cr', 'drawing', 'pict', 'object', 'fldSimple', 'fldChar', 'footnoteReference', 'endnoteReference', 'sym',
  'noBreakHyphen', 'softHyphen', 'ptab', 'sectPr', 'txbxContent',
]);
const HYPERLINK_FIELD = 'HYPERLINK';

export class DocxExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DocxExportError';
  }
}

function requireExport(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DocxExportError(code, message);
}

// ---- inputs and outputs ---------------------------------------------------------------------------

/** One block of the exported Revision, in position order. */
export interface DocxExportBlock {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
}

/** One row of the source-paragraph mapping the Revision's lineage recorded at import (ADR 0086 §3). */
export interface DocxExportSourceRow {
  blockId: string;
  sourcePart: 'body' | 'text-box';
  sourceParagraphIndex: number;
  sourceParagraphDigest: string;
}

/** Where a mark stands on the exported block's text, resolved by the caller against that exact Revision. */
export type DocxExportMarkStanding =
  | { state: 'exact'; fromGrapheme: number; toGrapheme: number }
  | { state: 'moved' };

/** One live mark of the exported Revision's blocks, with only what the file may carry. */
export interface DocxExportMark {
  markId: string;
  blockId: string;
  kind: 'annotation' | 'editor-note' | 'change-suggestion';
  standing: DocxExportMarkStanding;
  /** The author the file names: the mark's source label, 「编辑」 for the editor, 「备注」 for a 备注. */
  authorLabel: string;
  createdAt: string;
  /** A 批注's or 备注's words; empty for a 修改建议. */
  body: string;
  /** The editor's replies to a 批注, oldest first. */
  replies: ReadonlyArray<{ body: string; createdAt: string }>;
  /** A 批注 marked 已处理. */
  resolved: boolean;
  /** A pending 修改建议: the words it stands on and what it proposes (the accepted edit when there is one). */
  suggestion: { currentText: string; proposedText: string } | null;
}

export type DocxExportSource =
  | {
      kind: 'mapped';
      /** The original file of the Source Version, exactly as retained. */
      original: Uint8Array;
      rows: ReadonlyArray<DocxExportSourceRow>;
      /** The text-box choice the import recorded (ADR 0086 §2). */
      textBoxes: 'retain' | 'merge';
    }
  | {
      kind: 'fresh';
      /** Why the file is written fresh: no mapping, a converted file, or an original AI7 cannot restore in place. */
      reason: 'no-mapping' | 'converted' | 'unprefixed';
      /** The DOCX whose classes the review counts: the original, or a converted file's working representation. */
      scan: Uint8Array | null;
      /** The converter a converted file names. */
      converter: string | null;
    };

export interface DocxExportInput {
  /** The `dc:title` a fresh package carries: the Book's title. */
  title: string;
  blocks: ReadonlyArray<DocxExportBlock>;
  marks: ReadonlyArray<DocxExportMark>;
  options: ManuscriptExportOptions;
  source: DocxExportSource;
}

export interface DocxExportResult {
  /** The file, or `null` when only the review was asked for. */
  bytes: Uint8Array | null;
  fidelity: ExportFidelityRowProjection[];
  /** Whether any class is `降级导出` or `无法导出` (V2-UX-EXP-008). */
  degraded: boolean;
  restoration: 'from-original' | 'regenerated';
  restoredBlocks: number;
  regeneratedBlocks: number;
  written: { annotations: number; suggestions: number; editorNotes: number; replies: number };
}

// ---- XML trees ------------------------------------------------------------------------------------

interface XmlElement {
  name: string;
  local: string;
  uri: string;
  attributes: Array<[string, string]>;
  children: XmlNode[];
  /** The element's index among every element named `p` of the part, in document order; -1 for any other. */
  paragraphIndex: number;
}

/** Markup already serialized, spliced into a tree where a paragraph was regenerated. */
interface RawXml {
  raw: string;
}

type XmlNode = XmlElement | RawXml | string;

function isElement(node: XmlNode): node is XmlElement {
  return typeof node === 'object' && 'name' in node;
}

const INVALID_XML_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu;

function escapeText(value: string): string {
  return value.replace(INVALID_XML_CHARACTERS, '\uFFFD').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text as a DOCX part carries it, for a writer that builds its own body (Issue #500, S64b part 2: the 审阅报告). */
export { escapeText as escapeWordText };

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

function openTag(name: string, attributes: ReadonlyArray<readonly [string, string]>, empty: boolean): string {
  let tag = `<${name}`;
  for (const [attribute, value] of attributes) tag += ` ${attribute}="${escapeAttribute(value)}"`;
  return `${tag}${empty ? '/>' : '>'}`;
}

function serializeInto(node: XmlNode, out: string[]): void {
  if (typeof node === 'string') {
    out.push(escapeText(node));
    return;
  }
  if ('raw' in node) {
    out.push(node.raw);
    return;
  }
  out.push(openTag(node.name, node.attributes, node.children.length === 0));
  if (node.children.length === 0) return;
  for (const child of node.children) serializeInto(child, out);
  out.push(`</${node.name}>`);
}

function serialize(nodes: ReadonlyArray<XmlNode>): string {
  const out: string[] = [];
  for (const node of nodes) serializeInto(node, out);
  return out.join('');
}

function attributeOf(element: XmlElement, local: string): string | undefined {
  for (const [name, value] of element.attributes) {
    const colon = name.indexOf(':');
    if ((colon === -1 ? name : name.slice(colon + 1)) === local) return value;
  }
  return undefined;
}

function elementFrom(tag: SaxesTagNS, paragraphIndex: number): XmlElement {
  return {
    name: tag.name,
    local: tag.local,
    uri: tag.uri,
    attributes: Object.values(tag.attributes).map((attribute) => [attribute.name, attribute.value] as [string, string]),
    children: [],
    paragraphIndex,
  };
}

function appendText(parent: XmlElement, text: string): void {
  const last = parent.children.at(-1);
  if (typeof last === 'string') parent.children[parent.children.length - 1] = last + text;
  else parent.children.push(text);
}

function newParser(part: string) {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireExport(false, 'DOCX_EXPORT_SOURCE_INVALID', `${part} 含有文档类型声明。`));
  parser.on('processinginstruction', () => requireExport(false, 'DOCX_EXPORT_SOURCE_INVALID', `${part} 含有处理指令。`));
  return parser;
}

/** A whole part as one tree: small parts only — relationships, content types, headers and notes. */
function parseXmlPart(xml: string, part: string): XmlElement {
  const parser = newParser(part);
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  parser.on('opentag', (tag) => {
    requireExport(stack.length < MAX_XML_NESTING_DEPTH, 'DOCX_EXPORT_SOURCE_INVALID', `${part} 嵌套过深。`);
    const element = elementFrom(tag, -1);
    if (stack.length === 0) root = element;
    else stack.at(-1)!.children.push(element);
    stack.push(element);
  });
  parser.on('text', (text) => {
    if (stack.length > 0) appendText(stack.at(-1)!, text);
  });
  parser.on('cdata', (text) => {
    if (stack.length > 0) appendText(stack.at(-1)!, text);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.write(xml).close();
  requireExport(root !== undefined && stack.length === 0, 'DOCX_EXPORT_SOURCE_INVALID', `${part} 不完整。`);
  return root;
}

function decode(bytes: Uint8Array, part: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocxExportError('DOCX_EXPORT_SOURCE_INVALID', `${part} 不是有效的 UTF-8。`);
  }
}

// ---- the package ----------------------------------------------------------------------------------

/** The original package, entry by entry in its own order, under the bounds the import applied. */
function readPackage(bytes: Uint8Array): { names: string[]; entries: Map<string, Uint8Array> } {
  requireExport(bytes.byteLength > 0 && bytes.byteLength <= MAX_ARCHIVE_BYTES, 'DOCX_EXPORT_SOURCE_INVALID', '原文件大小超出导出边界。');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new DocxExportError('DOCX_EXPORT_SOURCE_INVALID', '原文件不是可读取的 DOCX。');
  }
  const names: string[] = [];
  const entries = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let expanded = 0;
  for (const [name, data] of Object.entries(files)) {
    requireExport(names.length < MAX_ENTRY_COUNT, 'DOCX_EXPORT_SOURCE_INVALID', '原文件条目过多。');
    requireExport(
      name.length > 0 && name.length <= 240 && !name.includes('\\') && !name.includes('\u0000') && !name.startsWith('/') &&
        !/^[A-Za-z]:/.test(name) && posix.normalize(name) === name && !name.startsWith('../'),
      'DOCX_EXPORT_SOURCE_INVALID',
      '原文件条目名称无效。',
    );
    const identity = name.toLocaleLowerCase('en-US');
    requireExport(!seen.has(identity), 'DOCX_EXPORT_SOURCE_INVALID', '原文件条目重复。');
    seen.add(identity);
    if (name.endsWith('/')) continue;
    expanded += data.byteLength;
    requireExport(expanded <= MAX_EXPANDED_BYTES, 'DOCX_EXPORT_SOURCE_INVALID', '原文件解压后超出导出边界。');
    names.push(name);
    entries.set(name, data);
  }
  requireExport(entries.has('word/document.xml') && entries.has('[Content_Types].xml'), 'DOCX_EXPORT_SOURCE_INVALID', '原文件缺少正文部件。');
  return { names, entries };
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

function readRelationships(bytes: Uint8Array | undefined, part: string): Relationship[] {
  if (bytes === undefined) return [];
  const root = parseXmlPart(decode(bytes, part), part);
  return root.children.filter(isElement).filter((child) => child.local === 'Relationship').map((child) => ({
    id: attributeOf(child, 'Id') ?? '',
    type: attributeOf(child, 'Type') ?? '',
    target: attributeOf(child, 'Target') ?? '',
    external: attributeOf(child, 'TargetMode') === 'External',
  }));
}

function relationshipsXml(relationships: ReadonlyArray<Relationship>): string {
  const items = relationships.map((relationship) => openTag('Relationship', [
    ['Id', relationship.id],
    ['Type', relationship.type],
    ['Target', relationship.target],
    ...(relationship.external ? [['TargetMode', 'External'] as [string, string]] : []),
  ], true));
  return `${XML_DECLARATION}<Relationships xmlns="${RELATIONSHIPS}">${items.join('')}</Relationships>`;
}

/** The part a relationship of `word/document.xml` names, or `null` for an external one. */
function relationshipPart(relationship: Relationship): string | null {
  if (relationship.external) return null;
  const target = relationship.target.startsWith('/') ? relationship.target.slice(1) : posix.join('word', relationship.target);
  const normalized = posix.normalize(target);
  return normalized.startsWith('../') ? null : normalized;
}

interface ContentTypes {
  defaults: Array<[string, string]>;
  overrides: Array<[string, string]>;
}

function readContentTypes(bytes: Uint8Array): ContentTypes {
  const root = parseXmlPart(decode(bytes, '[Content_Types].xml'), '[Content_Types].xml');
  const types: ContentTypes = { defaults: [], overrides: [] };
  for (const child of root.children.filter(isElement)) {
    if (child.local === 'Default') types.defaults.push([attributeOf(child, 'Extension') ?? '', attributeOf(child, 'ContentType') ?? '']);
    if (child.local === 'Override') types.overrides.push([attributeOf(child, 'PartName') ?? '', attributeOf(child, 'ContentType') ?? '']);
  }
  return types;
}

function contentTypesXml(types: ContentTypes): string {
  const defaults = types.defaults.map(([extension, type]) => openTag('Default', [['Extension', extension], ['ContentType', type]], true));
  const overrides = types.overrides.map(([part, type]) => openTag('Override', [['PartName', part], ['ContentType', type]], true));
  return `${XML_DECLARATION}<Types xmlns="${CONTENT_TYPES}">${defaults.join('')}${overrides.join('')}</Types>`;
}

function ensureDefault(types: ContentTypes, extension: string, type: string): void {
  if (!types.defaults.some(([candidate]) => candidate.toLowerCase() === extension)) types.defaults.push([extension, type]);
}

function setOverride(types: ContentTypes, part: string, type: string): void {
  const name = `/${part}`;
  types.overrides = types.overrides.filter(([candidate]) => candidate.toLowerCase() !== name.toLowerCase());
  types.overrides.push([name, type]);
}

function zipPackage(entries: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of entries) files[name] = data;
  return zipSync(files, { level: ARCHIVE_LEVEL, mtime: ARCHIVE_MTIME });
}

// ---- reading a paragraph as the parser reads it ---------------------------------------------------

/**
 * The children of an element as the parser reads them: an `mc:AlternateContent` through its first
 * `mc:Choice` only, never its `mc:Fallback`, which repeats the same content.
 */
function readableChildren(element: XmlElement): XmlNode[] {
  if (element.local !== 'AlternateContent') return element.children;
  const choice = element.children.find((child): child is XmlElement => isElement(child) && child.local === 'Choice');
  return choice === undefined ? [] : [choice];
}

function* readableElements(nodes: ReadonlyArray<XmlNode>): Generator<{ element: XmlElement; ancestors: ReadonlyArray<XmlElement> }> {
  const stack: Array<{ nodes: ReadonlyArray<XmlNode>; index: number; owner: XmlElement | null }> = [{ nodes, index: 0, owner: null }];
  const ancestors: XmlElement[] = [];
  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.index >= frame.nodes.length) {
      stack.pop();
      if (frame.owner !== null) ancestors.pop();
      continue;
    }
    const node = frame.nodes[frame.index++]!;
    if (!isElement(node)) continue;
    yield { element: node, ancestors };
    ancestors.push(node);
    stack.push({ nodes: readableChildren(node), index: 0, owner: node });
  }
}

function contains(element: XmlElement, local: string): boolean {
  for (const { element: candidate } of readableElements(element.children)) if (candidate.local === local) return true;
  return false;
}

/** What one paragraph — or one body-level element — holds of each class, counted as the parser counts it. */
interface ClassCounts {
  inlineStyles: number;
  notes: number;
  tables: number;
  images: number;
  textBoxes: number;
  fields: number;
  sections: number;
  fileRevisions: number;
}

function emptyCounts(): ClassCounts {
  return { inlineStyles: 0, notes: 0, tables: 0, images: 0, textBoxes: 0, fields: 0, sections: 0, fileRevisions: 0 };
}

function addCounts(into: ClassCounts, from: ClassCounts): void {
  for (const key of Object.keys(into) as Array<keyof ClassCounts>) into[key] += from[key];
}

/** Whether a run-properties element sets anything but revision markup. */
function styled(properties: XmlElement): boolean {
  return properties.children.some((child) => isElement(child) && !FORMATTING_REVISIONS.has(child.local) &&
    !((child.local === 'ins' || child.local === 'del' || child.local === 'moveFrom' || child.local === 'moveTo')));
}

/**
 * Count the classes of `nodes`. A text box's own content is read, as the parser reads it; a paragraph's
 * section carrier counts once; a field counts by the first word of its instruction, a HYPERLINK field as an
 * inline style. Revision and comment markup inside a text box, and every formatting revision, count as the
 * file's own revisions that did not become marks.
 */
function countClasses(nodes: ReadonlyArray<XmlNode>): ClassCounts {
  const counts = emptyCounts();
  let instruction: string | undefined;
  const settle = (): void => {
    if (instruction === undefined) return;
    const word = /^[A-Za-z]*/.exec(instruction.trimStart())![0];
    if (word.toUpperCase() === HYPERLINK_FIELD) counts.inlineStyles += 1;
    else counts.fields += 1;
    instruction = undefined;
  };
  for (const { element, ancestors } of readableElements(nodes)) {
    const parent = ancestors.at(-1);
    const inTextBox = ancestors.some((ancestor) => ancestor.local === 'txbxContent');
    const inChange = ancestors.some((ancestor) => FORMATTING_REVISIONS.has(ancestor.local));
    if (inChange) continue;
    switch (element.local) {
      case 'rPr':
        if (styled(element)) counts.inlineStyles += 1;
        break;
      case 'b':
      case 'i':
      case 'u':
      case 'strike':
      case 'color':
      case 'highlight':
        if (!ancestors.some((ancestor) => ancestor.local === 'rPr')) counts.inlineStyles += 1;
        break;
      case 'hyperlink':
        counts.inlineStyles += 1;
        break;
      case 'footnoteReference':
      case 'endnoteReference':
        counts.notes += 1;
        break;
      case 'tbl':
        counts.tables += 1;
        break;
      case 'drawing':
      case 'pict':
        if (!contains(element, 'txbxContent')) counts.images += 1;
        break;
      case 'txbxContent':
        counts.textBoxes += 1;
        break;
      case 'fldSimple': {
        instruction = attributeOf(element, 'instr') ?? '';
        settle();
        break;
      }
      case 'fldChar': {
        const type = attributeOf(element, 'fldCharType');
        if (type === 'begin') {
          settle();
          instruction = '';
        } else if (type === 'separate' || type === 'end') settle();
        break;
      }
      case 'instrText':
        if (instruction !== undefined) {
          instruction += element.children.filter((child): child is string => typeof child === 'string').join('');
          if (/[^A-Za-z]/.test(instruction.trimStart()) || instruction.trimStart().length > HYPERLINK_FIELD.length) settle();
        }
        break;
      case 'sectPr':
        if (parent?.local === 'pPr') counts.sections += 1;
        break;
      default:
        if (FORMATTING_REVISIONS.has(element.local) || TEXT_NEUTRAL_REVISIONS.has(element.local)) counts.fileRevisions += 1;
        else if (inTextBox && (COMMENT_MARKERS.has(element.local) || element.local === 'ins' || element.local === 'del' ||
          element.local === 'moveFrom' || element.local === 'moveTo')) counts.fileRevisions += 1;
        break;
    }
  }
  settle();
  return counts;
}

// ---- restoring: the view the parser read ------------------------------------------------------------

/**
 * Whether a table row or cell was inserted as a whole (`w:trPr/w:ins`, `w:tcPr/w:cellIns`): the rejected reading the
 * manuscript stands for does not hold it, and the import made the paragraphs it held 批注 (Issue #411).
 */
function insertedWhole(element: XmlElement): boolean {
  const properties = element.local === 'tr' ? 'trPr' : element.local === 'tc' ? 'tcPr' : null;
  if (properties === null) return false;
  const marker = element.local === 'tr' ? 'ins' : 'cellIns';
  return element.children.some((child) => isElement(child) && child.local === properties &&
    child.children.some((grandchild) => isElement(grandchild) && grandchild.local === marker));
}

/** Whether a restored node is a block-level element a table cell may hold; a regenerated paragraph is one. */
function holdsCellContent(node: XmlNode): boolean {
  if (typeof node === 'string') return false;
  return !isElement(node) || CELL_CONTENT.has(node.local);
}

interface StripContext {
  /** Inside a `w:del` or `w:moveFrom` that is being unwrapped: its deleted text is the paragraph's. */
  deleted: boolean;
  /** Drop only comment markup, and leave revisions as they are: for the parts copied beside the body. */
  commentsOnly: boolean;
}

function renamed(element: XmlElement, local: string): XmlElement {
  return { ...element, name: `${element.name.slice(0, element.name.length - element.local.length)}${local}`, local };
}

function stripChildren(nodes: ReadonlyArray<XmlNode>, parent: XmlElement, context: StripContext): XmlNode[] {
  const out: XmlNode[] = [];
  for (const node of nodes) {
    if (isElement(node)) out.push(...stripElement(node, parent, context));
    else out.push(node);
  }
  return out;
}

/**
 * One element of a restored subtree, as the parser read it: inserted and moved-in content dropped, deleted
 * and moved-away content unwrapped with its deleted text as text, and every comment anchor, formatting
 * revision and revision marker gone. A run left with nothing but its properties goes too.
 */
function stripElement(element: XmlElement, parent: XmlElement, context: StripContext): XmlNode[] {
  const local = element.local;
  if (COMMENT_MARKERS.has(local)) return [];
  if (!context.commentsOnly) {
    if (FORMATTING_REVISIONS.has(local) || REVISION_MARKERS.has(local)) return [];
    if (local === 'ins' || local === 'moveTo') return [];
    if (local === 'del' || local === 'moveFrom') {
      if (PROPERTY_PARENTS.has(parent.local)) return [];
      return stripChildren(element.children, element, { ...context, deleted: true });
    }
    if (local === 'delText') return context.deleted ? [{ ...renamed(element, 't'), children: element.children }] : [];
    if (local === 'delInstrText') return context.deleted ? [{ ...renamed(element, 'instrText'), children: element.children }] : [];
  }
  const children = stripChildren(element.children, element, context);
  if (local === 'r' && !children.some((child) => isElement(child) && child.local !== 'rPr')) return [];
  return [{ ...element, children }];
}

function stripped(element: XmlElement, context: StripContext = { deleted: false, commentsOnly: false }): XmlElement {
  const children = stripChildren(element.children, element, context);
  return { ...element, children };
}

/** A paragraph's revision on its own mark: inserted or moved in, it has no place in the rejected reading. */
function paragraphMarkInserted(paragraph: XmlElement): boolean {
  const properties = paragraph.children.find((child): child is XmlElement => isElement(child) && child.local === 'pPr');
  const markProperties = properties?.children.find((child): child is XmlElement => isElement(child) && child.local === 'rPr');
  return markProperties?.children.some((child) => isElement(child) && (child.local === 'ins' || child.local === 'moveTo')) === true;
}

/**
 * The inline containers a paragraph's own bookmarks may stand in; a text box's paragraphs are other paragraphs. A
 * bidirectional run (`w:dir`, `w:bdo`) is one: the reading takes its text as the paragraph's. A tracked insertion or
 * move-to is none of them (Issue #537): the reading the import took rejects it whole, bookmarks and all, as a restored
 * paragraph drops it, so a regenerated paragraph keeps the bookmarks that reading keeps.
 */
const BOOKMARK_CONTAINERS = new Set(['hyperlink', 'smartTag', 'sdt', 'sdtContent', 'customXml', 'fldSimple', 'dir', 'bdo', 'del', 'moveFrom']);

const BOOKMARK_HALF = /<(?:[A-Za-z_][\w.-]*:)?bookmark(Start|End)\b([^>]*?)(?:\/>|>\s*<\/(?:[A-Za-z_][\w.-]*:)?bookmark(?:Start|End)>)/g;
const BOOKMARK_ID = /(?:^|\s)(?:[A-Za-z_][\w.-]*:)?id\s*=\s*"([^"]*)"/;

/**
 * No bookmark is written half (Issue #537). A bookmark whose other half the written body does not hold — it stood in a
 * tracked insertion the reading rejects, or in a paragraph not written — is dropped whole, so no end stands without its
 * start and no start without its end.
 */
function withoutHalfBookmarks(xml: string): string {
  const starts = new Set<string>();
  const ends = new Set<string>();
  for (const match of xml.matchAll(BOOKMARK_HALF)) {
    const id = BOOKMARK_ID.exec(match[2]!)?.[1];
    if (id !== undefined) (match[1] === 'Start' ? starts : ends).add(id);
  }
  return xml.replace(BOOKMARK_HALF, (whole: string, kind: string, attributes: string) => {
    const id = BOOKMARK_ID.exec(attributes)?.[1];
    return id === undefined || (kind === 'Start' ? ends : starts).has(id) ? whole : '';
  });
}

/**
 * The bookmarks a regenerated paragraph keeps — a table of contents' `_Toc` targets among them — each start at the
 * paragraph's beginning and each end at its close, so a link to a heading still lands on it. A bookmark spanning
 * paragraphs keeps its other half where that paragraph writes it; ids and names are the original's, unique there.
 */
function paragraphBookmarks(paragraph: XmlElement): { starts: string; ends: string } {
  let starts = '';
  let ends = '';
  const walk = (nodes: ReadonlyArray<XmlNode>): void => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.local === 'bookmarkStart') starts += openTag(node.name, node.attributes, true);
      else if (node.local === 'bookmarkEnd') ends += openTag(node.name, node.attributes, true);
      else if (BOOKMARK_CONTAINERS.has(node.local)) walk(node.children);
    }
  };
  walk(paragraph.children);
  return { starts, ends };
}

/**
 * How much of a paragraph's formatting a regeneration cannot keep: every text run formatted otherwise than the
 * first — whose properties the regenerated runs take — every link, and every HYPERLINK field. The paragraph
 * mark's own properties stay with the paragraph's.
 */
function inlineStylesLost(paragraph: XmlElement): number {
  let first: string | undefined;
  let lost = 0;
  let instruction: string | undefined;
  const walk = (nodes: ReadonlyArray<XmlNode>, deleted: boolean): void => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.local === 'ins' || node.local === 'moveTo' || node.local === 'txbxContent' || node.local === 'pPr' ||
          FORMATTING_REVISIONS.has(node.local)) continue;
      if (node.local === 'hyperlink') lost += 1;
      if (node.local === 'fldSimple' && /^\s*HYPERLINK\b/i.test(attributeOf(node, 'instr') ?? '')) lost += 1;
      if (node.local === 'fldChar') {
        const type = attributeOf(node, 'fldCharType');
        if (type === 'begin') instruction = '';
        else if (instruction !== undefined) {
          if (/^\s*HYPERLINK\b/i.test(instruction)) lost += 1;
          instruction = undefined;
        }
      }
      if (node.local === 'instrText' && instruction !== undefined) {
        instruction += node.children.filter((child): child is string => typeof child === 'string').join('');
      }
      if (node.local === 'r') {
        const text = node.children.some((child) => isElement(child) && ((child.local === 't' &&
          child.children.some((part) => typeof part === 'string' && part.length > 0)) || (deleted && child.local === 'delText')));
        if (text) {
          const properties = node.children.find((child): child is XmlElement => isElement(child) && child.local === 'rPr');
          const key = properties === undefined ? '' : serialize([stripped(properties)]);
          if (first === undefined) first = key;
          else if (key !== first) lost += 1;
        }
      }
      walk(readableChildren(node), deleted || node.local === 'del' || node.local === 'moveFrom');
    }
  };
  walk(paragraph.children, false);
  return lost;
}

function hasContent(paragraph: XmlElement): boolean {
  for (const { element } of readableElements(paragraph.children)) {
    if (CONTENT_ELEMENTS.has(element.local)) return true;
    if (element.local === 't' && element.children.some((child) => typeof child === 'string' && child.length > 0)) return true;
  }
  return false;
}

// ---- text boxes merged into the body ------------------------------------------------------------------

/**
 * Remove every text box from a paragraph, keeping the paragraphs of each box's readable content in order:
 * the `mc:AlternateContent` holding a box goes whole, or the drawing that holds one when it stands alone.
 */
function withoutTextBoxes(paragraph: XmlElement, boxParagraphs: XmlElement[]): XmlElement {
  const visit = (element: XmlElement): XmlNode[] => {
    const holdsBox = (element.local === 'AlternateContent' || element.local === 'drawing' || element.local === 'pict') &&
      contains(element, 'txbxContent');
    if (holdsBox) {
      for (const { element: candidate, ancestors } of readableElements(readableChildren(element))) {
        if (candidate.local === 'p' && ancestors.some((ancestor) => ancestor.local === 'txbxContent') &&
            !ancestors.some((ancestor) => ancestor.local === 'p')) {
          boxParagraphs.push(candidate);
        }
      }
      return [];
    }
    const children: XmlNode[] = [];
    for (const child of element.children) {
      if (isElement(child)) children.push(...visit(child));
      else children.push(child);
    }
    if (element.local === 'r' && element !== paragraph && !children.some((child) => isElement(child) && child.local !== 'rPr')) return [];
    return [{ ...element, children }];
  };
  const result = visit(paragraph)[0];
  return isElement(result!) ? result : paragraph;
}

// ---- marks ------------------------------------------------------------------------------------------

export interface PlannedComment {
  mark: DocxExportMark;
  fromGrapheme: number;
  toGrapheme: number;
}

export interface PlannedSuggestion {
  mark: DocxExportMark;
  fromGrapheme: number;
  toGrapheme: number;
  currentText: string;
  proposedText: string;
}

interface WrittenComment {
  id: number;
  author: string;
  date: string;
  body: string;
  paraId: string;
  parentParaId: string | null;
  done: boolean;
}

/** Which marks an export writes and where; shared by every format (Issue #500, S64b). */
export interface MarkPlan {
  commentsByBlock: Map<string, PlannedComment[]>;
  suggestionsByBlock: Map<string, PlannedSuggestion[]>;
  /** Block positions of the marks of each kind that cannot be written. */
  unwritable: Record<'annotation' | 'editor-note' | 'change-suggestion', number[]>;
  /** Marks of each kind the export would carry, before any is found unwritable. */
  considered: Record<'annotation' | 'editor-note' | 'change-suggestion', number>;
  /** Live marks of each kind on the Revision's blocks, whether or not this export includes the kind. */
  live: Record<'annotation' | 'editor-note' | 'change-suggestion', number>;
}

export function included(kind: DocxExportMark['kind'], options: ManuscriptExportOptions): boolean {
  if (kind === 'annotation') return options.includeAnnotations;
  if (kind === 'editor-note') return options.includeEditorNotes;
  return options.includeSuggestions;
}

/**
 * Decide which marks are written and where. A comment needs its words; a suggestion needs its current words
 * exactly where it stands, and two suggestions whose ranges overlap cannot both be tracked changes — the one
 * made first is written and the other counted.
 */
export function planMarks(input: DocxExportInput, blocks: ReadonlyMap<string, DocxExportBlock>): MarkPlan {
  const plan: MarkPlan = {
    commentsByBlock: new Map(),
    suggestionsByBlock: new Map(),
    unwritable: { annotation: [], 'editor-note': [], 'change-suggestion': [] },
    considered: { annotation: 0, 'editor-note': 0, 'change-suggestion': 0 },
    live: { annotation: 0, 'editor-note': 0, 'change-suggestion': 0 },
  };
  const graphemes = new Map<string, string[]>();
  const graphemesOfBlock = (block: DocxExportBlock): string[] => {
    let parts = graphemes.get(block.blockId);
    if (parts === undefined) {
      parts = graphemesOf(block.text);
      graphemes.set(block.blockId, parts);
    }
    return parts;
  };
  const suggestions: PlannedSuggestion[] = [];
  const ordered = [...input.marks].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.markId.localeCompare(right.markId));
  for (const mark of ordered) {
    const block = blocks.get(mark.blockId);
    if (block === undefined) continue;
    plan.live[mark.kind] += 1;
    if (!included(mark.kind, input.options)) continue;
    plan.considered[mark.kind] += 1;
    const parts = graphemesOfBlock(block);
    const standing = mark.standing;
    const exact = standing.state === 'exact' && Number.isSafeInteger(standing.fromGrapheme) && Number.isSafeInteger(standing.toGrapheme) &&
      standing.fromGrapheme >= 0 && standing.toGrapheme >= standing.fromGrapheme && standing.toGrapheme <= parts.length;
    if (!exact || standing.state !== 'exact') {
      plan.unwritable[mark.kind].push(block.position);
      continue;
    }
    const words = parts.slice(standing.fromGrapheme, standing.toGrapheme).join('');
    if (mark.kind === 'change-suggestion') {
      const suggestion = mark.suggestion;
      if (suggestion === null || words !== suggestion.currentText || suggestion.currentText === suggestion.proposedText) {
        plan.unwritable[mark.kind].push(block.position);
        continue;
      }
      suggestions.push({
        mark,
        fromGrapheme: standing.fromGrapheme,
        toGrapheme: standing.toGrapheme,
        currentText: suggestion.currentText,
        proposedText: suggestion.proposedText,
      });
      continue;
    }
    if (standing.toGrapheme <= standing.fromGrapheme) {
      plan.unwritable[mark.kind].push(block.position);
      continue;
    }
    const list = plan.commentsByBlock.get(block.blockId) ?? [];
    list.push({ mark, fromGrapheme: standing.fromGrapheme, toGrapheme: standing.toGrapheme });
    plan.commentsByBlock.set(block.blockId, list);
  }
  for (const suggestion of suggestions) {
    const list = plan.suggestionsByBlock.get(suggestion.mark.blockId) ?? [];
    const overlaps = list.some((other) => {
      const pointLeft = suggestion.fromGrapheme === suggestion.toGrapheme;
      const pointRight = other.fromGrapheme === other.toGrapheme;
      if (pointLeft && pointRight) return false;
      if (pointLeft) return suggestion.fromGrapheme > other.fromGrapheme && suggestion.fromGrapheme < other.toGrapheme;
      if (pointRight) return other.fromGrapheme > suggestion.fromGrapheme && other.fromGrapheme < suggestion.toGrapheme;
      return suggestion.fromGrapheme < other.toGrapheme && other.fromGrapheme < suggestion.toGrapheme;
    });
    if (overlaps) {
      plan.unwritable['change-suggestion'].push(blocks.get(suggestion.mark.blockId)!.position);
      continue;
    }
    list.push(suggestion);
    plan.suggestionsByBlock.set(suggestion.mark.blockId, list);
  }
  return plan;
}

/** An ISO instant as the file writes one: to the second, in UTC. */
function fileDate(instant: string): string {
  const time = Date.parse(instant);
  return Number.isNaN(time) ? '2026-01-01T00:00:00Z' : new Date(Math.floor(time / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

/**
 * What the file's markup is written with: the prefix the document binds to WordprocessingML, the numbers
 * every comment and revision takes, and the paragraph identities the comments part links its threads by.
 */
class MarkupWriter {
  readonly comments: WrittenComment[] = [];
  readonly written = { annotations: 0, suggestions: 0, editorNotes: 0, replies: 0 };
  #nextId: number;
  #nextParaId = 0x7a000001;
  readonly #usedParaIds: ReadonlySet<string>;

  constructor(readonly prefix: string, firstId: number, usedParaIds: ReadonlySet<string>) {
    this.#nextId = firstId;
    this.#usedParaIds = usedParaIds;
  }

  w(local: string): string {
    return `${this.prefix}${local}`;
  }

  #id(): number {
    return this.#nextId++;
  }

  #paraId(): string {
    for (;;) {
      const candidate = (this.#nextParaId++).toString(16).toUpperCase().padStart(8, '0');
      if (!this.#usedParaIds.has(candidate)) return candidate;
    }
  }

  /** Runs of `text` with `properties`: a line break is `w:br`, a tab `w:tab`, and deleted text `w:delText`. */
  run(text: string, properties: string, deleted: boolean): string {
    if (text.length === 0) return '';
    const tag = this.w(deleted ? 'delText' : 't');
    let inner = '';
    let pending = '';
    const flush = (): void => {
      if (pending.length > 0) inner += `<${tag} xml:space="preserve">${escapeText(pending)}</${tag}>`;
      pending = '';
    };
    for (const character of text) {
      if (character === '\n' || character === '\r') {
        flush();
        inner += `<${this.w('br')}/>`;
      } else if (character === '\t') {
        flush();
        inner += `<${this.w('tab')}/>`;
      } else pending += character;
    }
    flush();
    return `<${this.w('r')}>${properties}${inner}</${this.w('r')}>`;
  }

  #revision(kind: 'ins' | 'del', author: string, date: string, content: string): string {
    const name = this.w(kind);
    return `<${name} ${this.w('id')}="${this.#id()}" ${this.w('author')}="${escapeAttribute(author)}" ${this.w('date')}="${date}">${content}</${name}>`;
  }

  /**
   * The runs of one block with its marks: comments as ranges with their references after them — a reply
   * sharing its thread's range — and each pending suggestion as a deletion of its current words followed by
   * an insertion of its proposal. Comment boundaries inside a suggestion's range split its deletion.
   */
  blockRuns(block: DocxExportBlock, properties: string, comments: ReadonlyArray<PlannedComment>, suggestions: ReadonlyArray<PlannedSuggestion>): string {
    const parts = graphemesOf(block.text);
    const threads = comments.map((comment) => ({ comment, ids: [this.#id(), ...comment.mark.replies.map(() => this.#id())] }));
    const boundaries = new Set<number>([0, parts.length]);
    for (const { comment } of threads) {
      boundaries.add(comment.fromGrapheme);
      boundaries.add(comment.toGrapheme);
    }
    for (const suggestion of suggestions) {
      boundaries.add(suggestion.fromGrapheme);
      boundaries.add(suggestion.toGrapheme);
    }
    const points = [...boundaries].sort((left, right) => left - right);
    let out = '';
    const at = (point: number): void => {
      for (const suggestion of suggestions) {
        if (suggestion.toGrapheme === point && suggestion.toGrapheme > suggestion.fromGrapheme && suggestion.proposedText.length > 0) {
          out += this.#revision('ins', suggestion.mark.authorLabel, fileDate(suggestion.mark.createdAt), this.run(suggestion.proposedText, properties, false));
        }
      }
      for (const { comment, ids } of threads) {
        if (comment.toGrapheme !== point) continue;
        for (const id of ids) {
          out += `<${this.w('commentRangeEnd')} ${this.w('id')}="${id}"/>`;
          out += `<${this.w('r')}><${this.w('commentReference')} ${this.w('id')}="${id}"/></${this.w('r')}>`;
        }
      }
      for (const suggestion of suggestions) {
        if (suggestion.fromGrapheme === point && suggestion.toGrapheme === point) {
          out += this.#revision('ins', suggestion.mark.authorLabel, fileDate(suggestion.mark.createdAt), this.run(suggestion.proposedText, properties, false));
        }
      }
      for (const { comment, ids } of threads) {
        if (comment.fromGrapheme !== point) continue;
        for (const id of ids) out += `<${this.w('commentRangeStart')} ${this.w('id')}="${id}"/>`;
      }
    };
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      at(point);
      const next = points[index + 1];
      if (next === undefined || next <= point) continue;
      const text = parts.slice(point, next).join('');
      const within = suggestions.find((suggestion) => suggestion.fromGrapheme <= point && next <= suggestion.toGrapheme && suggestion.toGrapheme > suggestion.fromGrapheme);
      out += within === undefined
        ? this.run(text, properties, false)
        : this.#revision('del', within.mark.authorLabel, fileDate(within.mark.createdAt), this.run(text, properties, true));
    }
    for (const suggestion of suggestions) {
      if (suggestion.mark.kind === 'change-suggestion') this.written.suggestions += 1;
    }
    for (const { comment, ids } of threads) {
      const thread = this.#paraId();
      const kind = comment.mark.kind;
      if (kind === 'editor-note') this.written.editorNotes += 1;
      else this.written.annotations += 1;
      this.comments.push({
        id: ids[0]!,
        author: comment.mark.authorLabel,
        date: fileDate(comment.mark.createdAt),
        body: comment.mark.body,
        paraId: thread,
        parentParaId: null,
        done: comment.mark.resolved,
      });
      comment.mark.replies.forEach((reply, index) => {
        this.written.replies += 1;
        this.comments.push({
          id: ids[index + 1]!,
          author: EDITOR_AUTHOR_LABEL,
          date: fileDate(reply.createdAt),
          body: reply.body,
          paraId: this.#paraId(),
          parentParaId: thread,
          done: comment.mark.resolved,
        });
      });
    }
    return out;
  }

  commentsPart(mainUri: string): string {
    const comments = [...this.comments].sort((left, right) => left.id - right.id).map((comment) => {
      const lines = comment.body.length === 0 ? [''] : comment.body.split('\n');
      const paragraphs = lines.map((line, index) => {
        const last = index === lines.length - 1;
        const identity = last ? ` w14:paraId="${comment.paraId}" w14:textId="77777777"` : '';
        const reference = index === 0 ? '<w:r><w:annotationRef/></w:r>' : '';
        const words = line.length === 0 ? '' : `<w:r><w:t xml:space="preserve">${escapeText(line)}</w:t></w:r>`;
        return `<w:p${identity}>${reference}${words}</w:p>`;
      }).join('');
      const initials = Array.from(comment.author)[0] ?? '';
      return `<w:comment w:id="${comment.id}" w:author="${escapeAttribute(comment.author)}" w:date="${comment.date}" w:initials="${escapeAttribute(initials)}">${paragraphs}</w:comment>`;
    });
    return `${XML_DECLARATION}<w:comments xmlns:w="${mainUri}" xmlns:w14="${W14}">${comments.join('')}</w:comments>`;
  }

  commentsExtendedPart(): string {
    const threads = [...this.comments].sort((left, right) => left.id - right.id).map((comment) =>
      `<w15:commentEx w15:paraId="${comment.paraId}"${comment.parentParaId === null ? '' : ` w15:paraIdParent="${comment.parentParaId}"`} w15:done="${comment.done ? 1 : 0}"/>`);
    return `${XML_DECLARATION}<w15:commentsEx xmlns:w15="${W15}">${threads.join('')}</w15:commentsEx>`;
  }
}

// ---- the review -------------------------------------------------------------------------------------

interface ClassTally {
  total: number;
  lost: number;
  positions: number[];
}

interface ReviewFacts {
  restoration: 'from-original' | 'regenerated';
  freshReason: string | null;
  textBoxes: 'retain' | 'merge';
  tallies: Record<'inline-styles' | 'notes' | 'tables' | 'images-captions' | 'sections' | 'headers-footers' | 'text-boxes' | 'fields' | 'file-revisions', ClassTally>;
  marks: MarkPlan;
  options: ManuscriptExportOptions;
}

function emptyTally(): ClassTally {
  return { total: 0, lost: 0, positions: [] };
}

export function fidelityRow(
  key: ExportFidelityKey,
  label: string,
  count: number,
  status: ExportFidelityStatus,
  detail: string,
  positions: ReadonlyArray<number> = [],
): ExportFidelityRowProjection {
  const unique = [...new Set(positions)].sort((left, right) => left - right);
  return {
    key,
    label,
    count,
    status,
    statusLabel: EXPORT_FIDELITY_STATUS_LABELS[status],
    detail,
    positions: unique.slice(0, MAX_EXPORT_FIDELITY_POSITIONS),
    positionsTruncated: unique.length > MAX_EXPORT_FIDELITY_POSITIONS,
  };
}

/** A class that a fresh build cannot restore, or a mapped build restores or names the blocks it cannot. */
function contentRow(
  facts: ReviewFacts,
  key: 'inline-styles' | 'notes' | 'images-captions' | 'fields',
  label: string,
  absent: string,
  restored: string,
  lost: (count: number) => string,
): ExportFidelityRowProjection {
  const tally = facts.tallies[key];
  if (tally.total === 0) return fidelityRow(key, label, 0, 'preserved', absent);
  if (facts.restoration === 'regenerated') return fidelityRow(key, label, tally.total, 'unavailable', `${facts.freshReason}；${label}无法恢复。`);
  if (tally.lost === 0) return fidelityRow(key, label, tally.total, 'preserved', restored);
  return fidelityRow(key, label, tally.total, 'degraded', lost(tally.lost), tally.positions);
}

function structureRow(
  facts: ReviewFacts,
  key: 'tables' | 'sections' | 'headers-footers',
  label: string,
  absent: string,
  restored: string,
): ExportFidelityRowProjection {
  const tally = facts.tallies[key];
  if (tally.total === 0) return fidelityRow(key, label, 0, 'preserved', absent);
  if (facts.restoration === 'regenerated') return fidelityRow(key, label, tally.total, 'unavailable', `${facts.freshReason}；${label}无法恢复。`);
  return fidelityRow(key, label, tally.total, 'preserved', restored);
}

function markRow(
  facts: ReviewFacts,
  kind: 'annotation' | 'editor-note' | 'change-suggestion',
  key: 'annotations' | 'editor-notes' | 'change-suggestions',
  label: string,
  words: { excluded: (live: number) => string; none: string; written: (count: number) => string; unwritable: (count: number) => string },
): ExportFidelityRowProjection {
  const live = facts.marks.live[kind];
  if (!included(kind, facts.options)) return fidelityRow(key, label, live, 'excluded', words.excluded(live));
  const considered = facts.marks.considered[kind];
  if (considered === 0) return fidelityRow(key, label, 0, 'preserved', words.none);
  const unwritable = facts.marks.unwritable[kind];
  const written = considered - unwritable.length;
  if (unwritable.length === 0) return fidelityRow(key, label, considered, 'preserved', words.written(written));
  return fidelityRow(key, label, considered, 'unavailable', `${words.written(written)}${words.unwritable(unwritable.length)}`, unwritable);
}

function fidelityRows(facts: ReviewFacts): ExportFidelityRowProjection[] {
  const boxes = facts.tallies['text-boxes'];
  const revisions = facts.tallies['file-revisions'];
  return [
    contentRow(facts, 'inline-styles', '行内样式', '未检测到行内样式。',
      '字体、粗体、颜色等行内样式与超链接从原文件恢复。',
      (count) => `改过或带标记的段落按段首文字的格式重新写出，段内其他行内样式与超链接未能恢复（${count} 处）；其余从原文件恢复。`),
    markRow(facts, 'annotation', 'annotations', '批注', {
      excluded: (live) => `本次不含批注；稿件上的 ${live} 条批注不变。`,
      none: '稿件上没有批注。',
      written: (count) => `${count} 条批注作为 Word 批注写出，保留作者名与回复，已处理的标为已完成。`,
      unwritable: (count) => `${count} 条所在的文字已变化，无法导出。`,
    }),
    markRow(facts, 'change-suggestion', 'change-suggestions', '修改建议', {
      excluded: (live) => `本次不含修改建议；稿件上的 ${live} 条修改建议不变。`,
      none: '稿件上没有待处理的修改建议。',
      written: (count) => `${count} 条待处理的修改建议作为 Word 修订写出，保留作者名；已应用的已是正文。`,
      unwritable: (count) => `${count} 条原文已变化或与其他修改建议重叠，无法作为修订写出。`,
    }),
    markRow(facts, 'editor-note', 'editor-notes', '备注', {
      excluded: (live) => `备注默认不随导出（稿件上 ${live} 条）；勾选「含备注」后作为批注写出，作者为「${EDITOR_NOTE_AUTHOR_LABEL}」。`,
      none: '稿件上没有备注。',
      written: (count) => `${count} 条备注作为 Word 批注写出，作者为「${EDITOR_NOTE_AUTHOR_LABEL}」。`,
      unwritable: (count) => `${count} 条所在的文字已变化，无法导出。`,
    }),
    contentRow(facts, 'notes', '脚注与尾注', '未检测到脚注或尾注。', '脚注与尾注从原文件恢复。',
      (count) => `改过或带标记的段落中的脚注、尾注引用未能写出（${count} 处）；其余从原文件恢复。`),
    structureRow(facts, 'tables', '表格', '未检测到表格。', '表格结构从原文件恢复；改过的单元格文字按稿件写出。'),
    contentRow(facts, 'images-captions', '图片与图注', '未检测到图片。', '图片从原文件恢复；图注按稿件文字写出。',
      (count) => `改过或带标记的段落中的图片未能写出（${count} 张）；其余从原文件恢复。`),
    structureRow(facts, 'sections', '分节（含页面设置）', '未检测到分节或页面设置。', '页面设置与分节从原文件恢复。'),
    structureRow(facts, 'headers-footers', '页眉与页脚', '未检测到页眉或页脚。', '页眉与页脚从原文件恢复。'),
    boxes.total === 0
      ? fidelityRow('text-boxes', '文本框', 0, 'preserved', '未检测到文本框。')
      : facts.restoration === 'regenerated'
        ? fidelityRow('text-boxes', '文本框', boxes.total, 'unavailable', `${facts.freshReason}；文本框无法恢复。`)
        : facts.textBoxes === 'merge'
          ? fidelityRow('text-boxes', '文本框', boxes.total, 'preserved', '文本框已在导入时并入正文，按正文段落写出，不再写出原文本框。')
          : boxes.lost === 0
            ? fidelityRow('text-boxes', '文本框', boxes.total, 'preserved', '文本框从原文件恢复。')
            : fidelityRow('text-boxes', '文本框', boxes.total, 'degraded', `锚定在改过或带标记的段落中的文本框未能写出（${boxes.lost} 个）；其余从原文件恢复。`, boxes.positions),
    contentRow(facts, 'fields', '域（目录等）', '未检测到域。', '目录、页码等域从原文件恢复，打开后可以更新。',
      (count) => `改过或带标记的段落中的域只写出当前显示的文字，不再更新（${count} 个）；其余从原文件恢复。`),
    revisions.total === 0
      ? fidelityRow('file-revisions', '原文件中的修订', 0, 'preserved', '原文件没有未转为稿件标记的修订。')
      : fidelityRow('file-revisions', '原文件中的修订', revisions.total, facts.restoration === 'regenerated' ? 'unavailable' : 'degraded',
        `原文件中未转为稿件标记的修订（格式修订、文本框中的批注与修订等，${revisions.total} 处）不写出；导出的文字是拒绝这些修订后的文字。`),
  ];
}

// ---- the mapped build ----------------------------------------------------------------------------------

/** Every numeric annotation id and every paragraph identity the original already uses. */
function usedIdentities(documentXml: string): { nextId: number; paraIds: Set<string> } {
  let max = -1;
  for (const match of documentXml.matchAll(/:id="(\d{1,9})"/g)) max = Math.max(max, Number(match[1]));
  const paraIds = new Set<string>();
  for (const match of documentXml.matchAll(/paraId="([0-9A-Fa-f]{8})"/g)) paraIds.add(match[1]!.toUpperCase());
  return { nextId: max + 1, paraIds };
}

/** The properties a regenerated paragraph keeps, and its first run's, stripped of revision markup. */
function sourceProperties(paragraph: XmlElement): { paragraph: string; run: string } {
  const pPr = paragraph.children.find((child): child is XmlElement => isElement(child) && child.local === 'pPr');
  let runProperties: XmlElement | undefined;
  const walk = (nodes: ReadonlyArray<XmlNode>, deleted: boolean): boolean => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.local === 'ins' || node.local === 'moveTo' || node.local === 'txbxContent' || node.local === 'pPr' ||
          FORMATTING_REVISIONS.has(node.local)) continue;
      if (node.local === 'r') {
        const text = node.children.some((child) => isElement(child) && ((child.local === 't' &&
          child.children.some((part) => typeof part === 'string' && part.length > 0)) || (deleted && child.local === 'delText')));
        if (text) {
          runProperties = node.children.find((child): child is XmlElement => isElement(child) && child.local === 'rPr');
          return true;
        }
        continue;
      }
      if (walk(readableChildren(node), deleted || node.local === 'del' || node.local === 'moveFrom')) return true;
    }
    return false;
  };
  walk(paragraph.children, false);
  return {
    paragraph: pPr === undefined ? '' : serialize([stripped(pPr)]),
    run: runProperties === undefined ? '' : serialize([stripped(runProperties)]),
  };
}

/** The style a regenerated block without a source paragraph takes: the parser reads it back as the same kind. */
function freshParagraphProperties(block: DocxExportBlock, writer: MarkupWriter): string {
  if (block.kind === 'paragraph') return '';
  const style = block.kind === 'title' ? 'Title' : `Heading${block.level ?? 1}`;
  return `<${writer.w('pPr')}><${writer.w('pStyle')} ${writer.w('val')}="${style}"/></${writer.w('pPr')}>`;
}

interface MappedWalk {
  documentXml: string;
  restoredBlocks: number;
  regeneratedBlocks: number;
}

function blockComments(plan: MarkPlan, block: DocxExportBlock): PlannedComment[] {
  return plan.commentsByBlock.get(block.blockId) ?? [];
}

function blockSuggestions(plan: MarkPlan, block: DocxExportBlock): PlannedSuggestion[] {
  return (plan.suggestionsByBlock.get(block.blockId) ?? []).sort((left, right) =>
    left.fromGrapheme - right.fromGrapheme || left.toGrapheme - right.toGrapheme);
}

/**
 * Walk `word/document.xml` once, body child by body child: each child is read as a tree, its paragraphs
 * restored or regenerated in place, and written out before the next is read.
 */
function rewriteDocument(
  documentXml: string,
  input: DocxExportInput,
  source: Extract<DocxExportSource, { kind: 'mapped' }>,
  plan: MarkPlan,
  facts: ReviewFacts,
  makeWriter: (prefix: string) => MarkupWriter,
): MappedWalk & { writer: MarkupWriter; mainUri: string } {
  const blocksById = new Map(input.blocks.map((block) => [block.blockId, block]));
  const rows = new Map<number, DocxExportSourceRow>();
  for (const sourceRow of source.rows) {
    requireExport(!rows.has(sourceRow.sourceParagraphIndex), 'DOCX_EXPORT_MAPPING_INVALID', '来源段落对应重复。');
    rows.set(sourceRow.sourceParagraphIndex, sourceRow);
  }
  const mapped = new Set(source.rows.filter((sourceRow) => blocksById.has(sourceRow.blockId)).map((sourceRow) => sourceRow.blockId));
  const pending = input.blocks.filter((block) => !mapped.has(block.blockId));
  const emitted = new Set<string>();
  let writer: MarkupWriter | undefined;
  let mainUri = WORD_MAIN;
  let restoredBlocks = 0;
  let regeneratedBlocks = 0;
  const out: string[] = [];

  const note = (key: keyof ReviewFacts['tallies'], total: number, lost: number, position: number | null): void => {
    const tally = facts.tallies[key];
    tally.total += total;
    tally.lost += lost;
    if (lost > 0 && position !== null) tally.positions.push(position);
  };

  const noteCounts = (counts: ClassCounts, lostAt: number | null, inlineLost: number): void => {
    const lost = lostAt !== null;
    note('inline-styles', counts.inlineStyles, lost ? inlineLost : 0, lostAt);
    note('notes', counts.notes, lost ? counts.notes : 0, lostAt);
    note('tables', counts.tables, 0, null);
    note('images-captions', counts.images, lost ? counts.images : 0, lostAt);
    note('sections', counts.sections, 0, null);
    note('fields', counts.fields, lost ? counts.fields : 0, lostAt);
    note('file-revisions', counts.fileRevisions, 0, null);
    if (source.textBoxes === 'retain') note('text-boxes', counts.textBoxes, lost ? counts.textBoxes : 0, lostAt);
    else note('text-boxes', counts.textBoxes, 0, null);
  };

  const regenerate = (block: DocxExportBlock, paragraph: XmlElement | null): string => {
    const w = writer!;
    const properties = paragraph === null ? { paragraph: freshParagraphProperties(block, w), run: '' } : sourceProperties(paragraph);
    const attributes = paragraph === null ? [] : paragraph.attributes;
    const name = paragraph === null ? w.w('p') : paragraph.name;
    emitted.add(block.blockId);
    regeneratedBlocks += 1;
    const bookmarks = paragraph === null ? { starts: '', ends: '' } : paragraphBookmarks(paragraph);
    return `${openTag(name, attributes, false)}${properties.paragraph}${bookmarks.starts}${w.blockRuns(block, properties.run, blockComments(plan, block), blockSuggestions(plan, block))}${bookmarks.ends}</${name}>`;
  };

  /** The blocks no source paragraph holds, written fresh before the block that follows them. */
  const flushPending = (before: number): string => {
    let xml = '';
    while (pending.length > 0 && pending[0]!.position < before) {
      xml += regenerate(pending.shift()!, null);
    }
    return xml;
  };

  const carriesMarks = (block: DocxExportBlock): boolean =>
    blockComments(plan, block).length > 0 || blockSuggestions(plan, block).length > 0;

  /** One source paragraph — a body paragraph or a merged box's — restored or regenerated. */
  const emitMapped = (paragraph: XmlElement, sourceRow: DocxExportSourceRow | undefined, counted: XmlElement): XmlNode[] => {
    const block = sourceRow === undefined ? undefined : blocksById.get(sourceRow.blockId);
    const counts = countClasses(counted.children);
    if (block === undefined || emitted.has(block.blockId)) {
      noteCounts(counts, null, 0);
      if (paragraphMarkInserted(paragraph)) {
        const restored = stripped(paragraph);
        return hasContent(restored) ? [restored] : [];
      }
      return [stripped(paragraph)];
    }
    const lead: XmlNode[] = [];
    const flushed = flushPending(block.position);
    if (flushed.length > 0) lead.push({ raw: flushed });
    if (block.digest === sourceRow!.sourceParagraphDigest && !carriesMarks(block)) {
      noteCounts(counts, null, 0);
      emitted.add(block.blockId);
      restoredBlocks += 1;
      return [...lead, stripped(paragraph)];
    }
    noteCounts(counts, block.position, inlineStylesLost(paragraph));
    return [...lead, { raw: regenerate(block, paragraph) }];
  };

  /** A body paragraph, with the paragraphs of the text boxes merged into the body written right after it. */
  const emitParagraph = (paragraph: XmlElement): XmlNode[] => {
    const sourceRow = rows.get(paragraph.paragraphIndex);
    const body = sourceRow?.sourcePart === 'body' ? sourceRow : undefined;
    if (source.textBoxes === 'merge' && contains(paragraph, 'txbxContent')) {
      const boxParagraphs: XmlElement[] = [];
      const anchor = withoutTextBoxes(paragraph, boxParagraphs);
      const boxCounts = countClasses(paragraph.children);
      const anchorCounts = countClasses(anchor.children);
      // The merged boxes are counted once, as merged: their content is written as body paragraphs.
      note('text-boxes', boxCounts.textBoxes - anchorCounts.textBoxes, 0, null);
      const nodes = emitMapped(anchor, body, anchor);
      for (const boxParagraph of boxParagraphs) {
        const boxRow = rows.get(boxParagraph.paragraphIndex);
        if (boxRow?.sourcePart !== 'text-box') continue;
        nodes.push(...emitMapped(boxParagraph, boxRow, boxParagraph));
      }
      return nodes;
    }
    return emitMapped(paragraph, body, paragraph);
  };

  /** Any body-level element other than a paragraph: its paragraphs are emitted in place, the rest stripped. */
  const transform = (element: XmlElement, parent: XmlElement): XmlNode[] => {
    if (element.local === 'p' && element.uri === mainUri) return emitParagraph(element);
    if (element.local === 'sectPr' && parent.local === 'body') {
      const counts = countClasses([element]);
      // The terminal section counts when it sets anything, as the parser counts it.
      note('sections', element.attributes.length > 0 || element.children.some(isElement) ? 1 : 0, 0, null);
      note('file-revisions', counts.fileRevisions, 0, null);
      const flushed = flushPending(Number.POSITIVE_INFINITY);
      return [...(flushed.length > 0 ? [{ raw: flushed }] : []), stripped(element)];
    }
    if (COMMENT_MARKERS.has(element.local) || FORMATTING_REVISIONS.has(element.local) || REVISION_MARKERS.has(element.local)) {
      if (FORMATTING_REVISIONS.has(element.local) || TEXT_NEUTRAL_REVISIONS.has(element.local)) note('file-revisions', 1, 0, null);
      return [];
    }
    if (element.local === 'ins' || element.local === 'moveTo') return [];
    // A row or cell inserted as a whole is rejected with the rest: it is left out, as the manuscript leaves it out.
    // One deleted as a whole stays, its marker dropped.
    if (insertedWhole(element)) return [];
    const unwrap = element.local === 'del' || element.local === 'moveFrom';
    const children: XmlNode[] = [];
    for (const child of element.children) {
      if (isElement(child)) children.push(...transform(child, element));
      else children.push(child);
    }
    // A row left without a cell, or a table without a row, held only what was inserted, and is left out with it.
    if (element.local === 'tr' && !children.some((child) => isElement(child) && child.local === 'tc')) return [];
    if (element.local === 'tbl' && !children.some((child) => isElement(child) && child.local === 'tr')) return [];
    if (element.local === 'tbl') note('tables', 1, 0, null);
    // A cell whose every paragraph was left out keeps one empty paragraph: a cell without one is corrupt.
    if (element.local === 'tc' && !children.some(holdsCellContent)) {
      children.push({ raw: `<${element.name.slice(0, element.name.length - element.local.length)}p/>` });
    }
    return unwrap ? children : [{ ...element, children }];
  };

  let paragraphIndex = 0;
  let depth = 0;
  let bodyDepth = -1;
  let rootSeen = false;
  let bodyClosed = false;
  const tree: XmlElement[] = [];
  const outside: Array<{ name: string; local: string; empty: boolean }> = [];
  const parser = newParser('word/document.xml');
  parser.on('opentag', (tag) => {
    requireExport(depth < MAX_XML_NESTING_DEPTH, 'DOCX_EXPORT_SOURCE_INVALID', '正文嵌套过深。');
    const index = tag.local === 'p' ? paragraphIndex++ : -1;
    depth += 1;
    if (!rootSeen) {
      rootSeen = true;
      requireExport(tag.local === 'document', 'DOCX_EXPORT_SOURCE_INVALID', '正文部件的根元素无效。');
      mainUri = tag.uri;
      // Marks are written with the prefix the document binds; a document that binds none is written fresh.
      requireExport(tag.prefix.length > 0, 'DOCX_EXPORT_SOURCE_UNSUPPORTED', '正文部件没有为 WordprocessingML 使用前缀。');
      writer = makeWriter(`${tag.prefix}:`);
    }
    if (tree.length > 0 || (bodyDepth !== -1 && !bodyClosed && depth === bodyDepth + 1)) {
      const element = elementFrom(tag, index);
      if (tree.length > 0) tree.at(-1)!.children.push(element);
      tree.push(element);
      return;
    }
    if (tag.local === 'body' && depth === 2) bodyDepth = depth;
    outside.push({ name: tag.name, local: tag.local, empty: tag.isSelfClosing });
    out.push(openTag(tag.name, Object.values(tag.attributes).map((attribute) => [attribute.name, attribute.value]), tag.isSelfClosing));
  });
  parser.on('text', (text) => {
    if (tree.length > 0) appendText(tree.at(-1)!, text);
    else if (outside.length > 0) out.push(escapeText(text));
  });
  parser.on('cdata', (text) => {
    if (tree.length > 0) appendText(tree.at(-1)!, text);
    else if (outside.length > 0) out.push(escapeText(text));
  });
  parser.on('closetag', () => {
    depth -= 1;
    if (tree.length > 0) {
      const element = tree.pop()!;
      if (tree.length === 0) {
        const body = { name: 'body', local: 'body', uri: mainUri, attributes: [], children: [], paragraphIndex: -1 } satisfies XmlElement;
        out.push(serialize(transform(element, body)));
      }
      return;
    }
    const closing = outside.pop()!;
    if (closing.local === 'body' && depth + 1 === bodyDepth && !bodyClosed) {
      bodyClosed = true;
      out.push(flushPending(Number.POSITIVE_INFINITY));
    }
    if (!closing.empty) out.push(`</${closing.name}>`);
  });
  parser.write(documentXml).close();
  requireExport(rootSeen && bodyClosed && depth === 0, 'DOCX_EXPORT_SOURCE_INVALID', '正文部件不完整。');
  requireExport(pending.length === 0, 'DOCX_EXPORT_MAPPING_INVALID', '有稿件内容块未能写出。');
  const missing = input.blocks.filter((block) => !emitted.has(block.blockId));
  requireExport(missing.length === 0, 'DOCX_EXPORT_MAPPING_INVALID', '有稿件内容块未能写出。');
  return { documentXml: withoutHalfBookmarks(`${XML_DECLARATION}${out.join('')}`), restoredBlocks, regeneratedBlocks, writer: writer!, mainUri };
}

/** A part beside the body that anchors comments: its comment markup goes, since the comments are replaced. */
function withoutCommentMarkup(bytes: Uint8Array, part: string): Uint8Array {
  const xml = decode(bytes, part);
  if (!/commentRangeStart|commentRangeEnd|commentReference/.test(xml)) return bytes;
  const root = parseXmlPart(xml, part);
  return strToU8(`${XML_DECLARATION}${serialize([stripped(root, { deleted: false, commentsOnly: true })])}`);
}

function mappedPackage(input: DocxExportInput, source: Extract<DocxExportSource, { kind: 'mapped' }>, plan: MarkPlan, emit: boolean): {
  bytes: Uint8Array | null;
  facts: ReviewFacts;
  walk: MappedWalk;
  written: MarkupWriter['written'];
} {
  const original = readPackage(source.original);
  const documentXml = decode(original.entries.get('word/document.xml')!, 'word/document.xml');
  const identities = usedIdentities(documentXml);
  const facts: ReviewFacts = {
    restoration: 'from-original',
    freshReason: null,
    textBoxes: source.textBoxes,
    tallies: {
      'inline-styles': emptyTally(), notes: emptyTally(), tables: emptyTally(), 'images-captions': emptyTally(),
      sections: emptyTally(), 'headers-footers': emptyTally(), 'text-boxes': emptyTally(), fields: emptyTally(),
      'file-revisions': emptyTally(),
    },
    marks: plan,
    options: input.options,
  };
  facts.tallies['headers-footers'].total = original.names.filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)).length;
  const walk = rewriteDocument(documentXml, input, source, plan, facts,
    (prefix) => new MarkupWriter(prefix, identities.nextId, identities.paraIds));
  if (!emit) return { bytes: null, facts, walk, written: walk.writer.written };

  const relationshipsPart = 'word/_rels/document.xml.rels';
  const relationships = readRelationships(original.entries.get(relationshipsPart), relationshipsPart);
  const removed = new Set<string>();
  const kept = relationships.filter((relationship) => {
    if (!COMMENT_PART_TYPES.has(relationship.type)) return true;
    const part = relationshipPart(relationship);
    if (part !== null) removed.add(part);
    return false;
  });
  for (const name of original.names) if (COMMENT_PART_NAMES.test(name)) removed.add(name);
  for (const part of [...removed]) removed.add(posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`));
  const types = readContentTypes(original.entries.get('[Content_Types].xml')!);
  types.overrides = types.overrides.filter(([part]) => !removed.has(part.replace(/^\//, '')));
  ensureDefault(types, 'rels', RELATIONSHIPS_CONTENT_TYPE);
  ensureDefault(types, 'xml', 'application/xml');
  const writer = walk.writer;
  const added: Array<[string, Uint8Array]> = [];
  if (writer.comments.length > 0) {
    const ids = new Set(kept.map((relationship) => relationship.id));
    const freshId = (base: string): string => {
      let candidate = base;
      for (let suffix = 2; ids.has(candidate); suffix += 1) candidate = `${base}${suffix}`;
      ids.add(candidate);
      return candidate;
    };
    kept.push({ id: freshId('rIdAi7Comments'), type: COMMENTS_TYPE, target: 'comments.xml', external: false });
    kept.push({ id: freshId('rIdAi7CommentsExtended'), type: COMMENTS_EXTENDED_TYPE, target: 'commentsExtended.xml', external: false });
    added.push(['word/comments.xml', strToU8(writer.commentsPart(walk.mainUri))]);
    added.push(['word/commentsExtended.xml', strToU8(writer.commentsExtendedPart())]);
    setOverride(types, 'word/comments.xml', COMMENTS_CONTENT_TYPE);
    setOverride(types, 'word/commentsExtended.xml', COMMENTS_EXTENDED_CONTENT_TYPE);
  }
  const entries: Array<[string, Uint8Array]> = [];
  const replaced = new Map<string, Uint8Array>([
    ['[Content_Types].xml', strToU8(contentTypesXml(types))],
    ['word/document.xml', strToU8(walk.documentXml)],
  ]);
  if (original.entries.has(relationshipsPart) || kept.length > 0) replaced.set(relationshipsPart, strToU8(relationshipsXml(kept)));
  for (const name of original.names) {
    if (removed.has(name)) continue;
    const replacement = replaced.get(name);
    if (replacement !== undefined) {
      entries.push([name, replacement]);
      replaced.delete(name);
    } else if (/^word\/(header|footer)\d*\.xml$|^word\/(footnotes|endnotes)\.xml$/i.test(name)) {
      entries.push([name, withoutCommentMarkup(original.entries.get(name)!, name)]);
    } else {
      entries.push([name, original.entries.get(name)!]);
    }
  }
  for (const [name, bytes] of replaced) entries.push([name, bytes]);
  if (!original.entries.has('_rels/.rels')) {
    // A package with no relationships of its own opens nowhere; the export names its main part.
    const packageRelationships: Relationship[] = [{ id: 'rId1', type: OFFICE_DOCUMENT_TYPE, target: 'word/document.xml', external: false }];
    if (original.entries.has('docProps/core.xml')) {
      packageRelationships.push({ id: 'rId2', type: CORE_PROPERTIES_TYPE, target: 'docProps/core.xml', external: false });
    }
    entries.push(['_rels/.rels', strToU8(relationshipsXml(packageRelationships))]);
  }
  entries.push(...added);
  return { bytes: zipPackage(entries), facts, walk, written: writer.written };
}

// ---- the fresh build ------------------------------------------------------------------------------------

const FRESH_STYLES_XML =
  `${XML_DECLARATION}<w:styles xmlns:w="${WORD_MAIN}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>' +
  [1, 2, 3, 4, 5, 6].map((level) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${34 - level * 2}"/></w:rPr></w:style>`).join('') +
  '</w:styles>';

/** The content classes of the source a format lays out from the manuscript's words alone (Issue #500, S64b). */
export type ContentClassKey = keyof ReviewFacts['tallies'];

/**
 * How many of each content class the version's source holds, counted as the parser would — the original file of a
 * mapped version, or the file a fresh one was scanned from; none when there is none. A format that writes only the
 * manuscript's words (PDF, Markdown) names each class it leaves behind from these counts.
 */
export function contentTallies(source: DocxExportSource): Record<ContentClassKey, number> {
  const facts: ReviewFacts = {
    restoration: 'regenerated',
    freshReason: null,
    textBoxes: source.kind === 'mapped' ? source.textBoxes : 'retain',
    tallies: {
      'inline-styles': emptyTally(), notes: emptyTally(), tables: emptyTally(), 'images-captions': emptyTally(),
      sections: emptyTally(), 'headers-footers': emptyTally(), 'text-boxes': emptyTally(), fields: emptyTally(),
      'file-revisions': emptyTally(),
    },
    marks: { commentsByBlock: new Map(), suggestionsByBlock: new Map(), unwritable: { annotation: [], 'editor-note': [], 'change-suggestion': [] },
      considered: { annotation: 0, 'editor-note': 0, 'change-suggestion': 0 }, live: { annotation: 0, 'editor-note': 0, 'change-suggestion': 0 } },
    options: { includeAnnotations: false, includeSuggestions: false, includeEditorNotes: false },
  };
  const bytes = source.kind === 'mapped' ? source.original : source.scan;
  if (bytes !== null) scanPackage(bytes, facts);
  return Object.fromEntries(Object.entries(facts.tallies).map(([key, tally]) => [key, tally.total])) as Record<ContentClassKey, number>;
}

/** Count what a DOCX carries, as the parser would: the review of a fresh build says every present class is lost. */
function scanPackage(bytes: Uint8Array, facts: ReviewFacts): void {
  const scanned = readPackage(bytes);
  const documentXml = decode(scanned.entries.get('word/document.xml')!, 'word/document.xml');
  const root = parseXmlPart(documentXml, 'word/document.xml');
  const counts = countClasses(root.children);
  const body = root.children.find((child): child is XmlElement => isElement(child) && child.local === 'body');
  const terminal = body?.children.find((child): child is XmlElement => isElement(child) && child.local === 'sectPr');
  const tallies = facts.tallies;
  tallies['inline-styles'].total = counts.inlineStyles;
  tallies.notes.total = counts.notes;
  tallies.tables.total = counts.tables;
  tallies['images-captions'].total = counts.images;
  tallies.sections.total = counts.sections + (terminal !== undefined && (terminal.attributes.length > 0 || terminal.children.some(isElement)) ? 1 : 0);
  tallies['text-boxes'].total = counts.textBoxes;
  tallies.fields.total = counts.fields;
  tallies['file-revisions'].total = counts.fileRevisions;
  tallies['headers-footers'].total = scanned.names.filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name)).length;
}

function freshPackage(input: DocxExportInput, source: Extract<DocxExportSource, { kind: 'fresh' }>, plan: MarkPlan, emit: boolean): {
  bytes: Uint8Array | null;
  facts: ReviewFacts;
  walk: MappedWalk;
  written: MarkupWriter['written'];
} {
  const facts: ReviewFacts = {
    restoration: 'regenerated',
    freshReason: source.reason === 'converted'
      ? `这份稿件由 ${source.converter ?? '转换器'} 转换导入，导出按稿件文字重新生成 DOCX`
      : source.reason === 'unprefixed'
        ? '原文件的 XML 写法 AI7 无法在原处恢复，导出按稿件文字重新生成 DOCX'
        : '这份稿件导入时还没有建立来源段落对应，导出按稿件文字重新生成 DOCX',
    textBoxes: 'retain',
    tallies: {
      'inline-styles': emptyTally(), notes: emptyTally(), tables: emptyTally(), 'images-captions': emptyTally(),
      sections: emptyTally(), 'headers-footers': emptyTally(), 'text-boxes': emptyTally(), fields: emptyTally(),
      'file-revisions': emptyTally(),
    },
    marks: plan,
    options: input.options,
  };
  if (source.scan !== null) scanPackage(source.scan, facts);
  const writer = new MarkupWriter('w:', 0, new Set());
  const paragraphs = input.blocks.map((block) =>
    `<w:p>${freshParagraphProperties(block, writer)}${writer.blockRuns(block, '', blockComments(plan, block), blockSuggestions(plan, block))}</w:p>`);
  const walk: MappedWalk = { documentXml: '', restoredBlocks: 0, regeneratedBlocks: input.blocks.length };
  if (!emit) return { bytes: null, facts, walk, written: writer.written };
  const added: FreshParts = { relationships: [], overrides: [], parts: [] };
  if (writer.comments.length > 0) {
    added.relationships.push({ id: 'rId2', type: COMMENTS_TYPE, target: 'comments.xml', external: false });
    added.relationships.push({ id: 'rId3', type: COMMENTS_EXTENDED_TYPE, target: 'commentsExtended.xml', external: false });
    added.overrides.push(['/word/comments.xml', COMMENTS_CONTENT_TYPE], ['/word/commentsExtended.xml', COMMENTS_EXTENDED_CONTENT_TYPE]);
    added.parts.push(['word/comments.xml', strToU8(writer.commentsPart(WORD_MAIN))]);
    added.parts.push(['word/commentsExtended.xml', strToU8(writer.commentsExtendedPart())]);
  }
  return { bytes: assembleFreshPackage(input.title, paragraphs.join(''), added), facts, walk, written: writer.written };
}

/** What a fresh package carries beside its document, styles and core properties. */
interface FreshParts {
  relationships: Relationship[];
  overrides: Array<[string, string]>;
  parts: Array<[string, Uint8Array]>;
}

/**
 * A fresh package around one body: A4 with the fresh build's margins, the styles every fresh build carries (Title and
 * Heading 1 to 6), the title as `dc:title`, and the parts beside the document `added` names.
 */
function assembleFreshPackage(title: string, bodyXml: string, added: FreshParts): Uint8Array {
  const documentXml = `${XML_DECLARATION}<w:document xmlns:w="${WORD_MAIN}" xmlns:r="${DOCUMENT_RELATIONSHIPS}"><w:body>` +
    `${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  const types: ContentTypes = {
    defaults: [['rels', RELATIONSHIPS_CONTENT_TYPE], ['xml', 'application/xml']],
    overrides: [['/word/document.xml', MAIN_CONTENT_TYPE], ['/word/styles.xml', STYLES_CONTENT_TYPE], ['/docProps/core.xml', CORE_CONTENT_TYPE], ...added.overrides],
  };
  const relationships: Relationship[] = [{ id: 'rId1', type: STYLES_TYPE, target: 'styles.xml', external: false }, ...added.relationships];
  return zipPackage([
    ['[Content_Types].xml', strToU8(contentTypesXml(types))],
    ['_rels/.rels', strToU8(relationshipsXml([
      { id: 'rId1', type: OFFICE_DOCUMENT_TYPE, target: 'word/document.xml', external: false },
      { id: 'rId2', type: CORE_PROPERTIES_TYPE, target: 'docProps/core.xml', external: false },
    ]))],
    ['docProps/core.xml', strToU8(`${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeText(title)}</dc:title></cp:coreProperties>`)],
    ['word/document.xml', strToU8(documentXml)],
    ['word/_rels/document.xml.rels', strToU8(relationshipsXml(relationships))],
    ['word/styles.xml', strToU8(FRESH_STYLES_XML)],
    ...added.parts,
  ]);
}

/**
 * A fresh package holding one body and nothing beside it (Issue #500, S64b part 2): the 审阅报告's DOCX, written with
 * the same styles, page and title as a manuscript written fresh.
 */
export function freshBodyPackage(title: string, bodyXml: string): Uint8Array {
  return assembleFreshPackage(title, bodyXml, { relationships: [], overrides: [], parts: [] });
}

// ---- the entry point -------------------------------------------------------------------------------------

/**
 * Write the DOCX of one exact Revision, or only review it (`emit: false`). The review is the same either way:
 * it is what the walk found, not a prediction of it.
 */
export function renderDocxExport(input: DocxExportInput, options: { emit: boolean }): DocxExportResult {
  requireExport(input.blocks.length > 0, 'DOCX_EXPORT_EMPTY', '这一版稿件没有可导出的内容块。');
  let previous = 0;
  for (const block of input.blocks) {
    requireExport(block.position > previous && block.text.isWellFormed(), 'DOCX_EXPORT_BLOCKS_INVALID', '稿件内容块的顺序或文字无效。');
    previous = block.position;
  }
  const blocks = new Map(input.blocks.map((block) => [block.blockId, block]));
  const plan = planMarks(input, blocks);
  const built = input.source.kind === 'mapped'
    ? mappedPackage(input, input.source, plan, options.emit)
    : freshPackage(input, input.source, plan, options.emit);
  const fidelity = fidelityRows(built.facts);
  return {
    bytes: built.bytes,
    fidelity,
    degraded: fidelity.some((entry) => entry.status === 'degraded' || entry.status === 'unavailable'),
    restoration: built.facts.restoration,
    restoredBlocks: built.walk.restoredBlocks,
    regeneratedBlocks: built.walk.regeneratedBlocks,
    written: { ...built.written },
  };
}
