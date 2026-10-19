import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

/**
 * Build the four public-domain Public SampleBooks ADR 0091 admits from their pinned Wikisource revisions.
 *
 *   node tools/build-public-samplebook.mjs --cache <dir> [--offline] [--check] [--work <id>]...
 *   node tools/build-public-samplebook.mjs --pin --cache <dir>
 *
 * Development-only: never run by CI, `build`, `package` or any test, and never imported by product code.
 * `SampleBooks/public-samplebooks.json` is the designation record: for every work its title, file name and
 * the ordered Wikisource pages with each page's pinned revision id, and for a page that transcludes scanned
 * `Page:` pages (ProofreadPage) the revision of each one. A build fetches every pinned revision through
 * `action=parse&oldid=<revid>&variant=zh-hans` — MediaWiki's own LanguageConverter does the simplified
 * conversion — keeps the section's title and its original paragraphs, and writes the DOCX deterministically.
 * Navigation and header templates, license boxes, images, reference markers and every 注释 section are
 * dropped; an element the rules below do not name refuses the build rather than being guessed at. What a
 * page loses beyond that furniture — its footnote markers, every Wikisource note, the paragraph of an edition
 * not kept — must be declared in its manifest entry (`footnotes`, `editorNoteDigests`, `variantChoice`), or the
 * build refuses.
 *
 * `--cache` names a directory outside the checkout where the raw API responses are kept, so a second build
 * reads them instead of the network and yields byte-identical files; raw responses never enter the
 * repository. `--offline` refuses a missing response instead of fetching it. `--check` builds in memory and
 * compares with the committed files. `--pin` fills in the revision ids a manifest entry lacks, and the
 * transcluded pages' revisions, from the pages' current revisions.
 *
 * The network is reached through `curl`, which honours the host proxy (Node's `fetch` does not), and only
 * `https://zh.wikisource.org/w/api.php`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_RELATIVE_PATH = 'SampleBooks/public-samplebooks.json';
export const MANIFEST_FORMAT = 'ai7.public-samplebooks/1';
export const WIKISOURCE_API = 'https://zh.wikisource.org/w/api.php';
export const VARIANT = 'zh-hans';
const USER_AGENT = 'ai7-harness-public-samplebook-generator/1 (https://github.com/zhouy1017/ai7-harness)';
const PAGE_NAMESPACE = 104;
const QUERY_BATCH = 50;
const REQUEST_SPACING_MS = 1200;

export class PublicSampleBookError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PublicSampleBookError';
    this.code = code;
  }
}

function refuse(code, detail) {
  throw new PublicSampleBookError(code, detail);
}

/** CLI diagnostics carry only a structural code, never HTML, API responses or exception text. */
export function diagnosticCode(error) {
  return error instanceof PublicSampleBookError && /^SAMPLEBOOK\/[a-z][a-z-]{0,63}$/.test(error.code)
    ? error.code
    : 'SAMPLEBOOK/unclassified';
}

// ---------------------------------------------------------------------------------------------------------
// Manifest

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates a manifest. A build needs every revision pinned; `--pin` validates with `{ pinned: false }`
 * so that the entries it is about to fill in may still lack them.
 */
export function validateManifest(manifest, { pinned = true } = {}) {
  const fail = (detail) => refuse('SAMPLEBOOK/manifest-invalid', detail);
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) fail('not an object');
  if (manifest.format !== MANIFEST_FORMAT) fail(`format is not ${MANIFEST_FORMAT}`);
  const source = manifest.source;
  if (source?.api !== WIKISOURCE_API) fail(`source.api is not ${WIKISOURCE_API}`);
  if (source?.variant !== VARIANT) fail(`source.variant is not ${VARIANT}`);
  if (pinned && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.pinnedOn ?? '')) fail('pinnedOn is not a date');
  if (!Array.isArray(manifest.works) || manifest.works.length === 0) fail('works is empty');
  const files = new Set();
  for (const work of manifest.works) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(work?.id ?? '')) fail('a work id is not lower-case ASCII words');
    if (work.file !== `${work.id}.docx`) fail(`${work.id}: file is not ${work.id}.docx`);
    if (files.has(work.file)) fail(`${work.id}: duplicate file`);
    files.add(work.file);
    if (!nonEmptyString(work.title) || !nonEmptyString(work.author)) fail(`${work.id}: title and author are required`);
    if (!Array.isArray(work.sections) || work.sections.length === 0) fail(`${work.id}: sections is empty`);
    const keys = new Set();
    for (const section of work.sections) {
      if (!nonEmptyString(section?.page)) fail(`${work.id}: a section has no page`);
      const key = `${section.page}#${section.section ?? ''}`;
      if (keys.has(key)) fail(`${work.id}: ${key} appears twice`);
      keys.add(key);
      if (section.revid !== undefined ? !isPositiveInteger(section.revid) : pinned) fail(`${work.id}: ${section.page} has no pinned revid`);
      if ((section.section === undefined) !== (section.sectionTitle === undefined)) fail(`${work.id}: ${section.page} needs section and sectionTitle together`);
      if (section.section !== undefined && (!isPositiveInteger(section.section) || !nonEmptyString(section.sectionTitle))) {
        fail(`${work.id}: ${section.page} has a malformed section`);
      }
      if (section.variantChoice !== undefined && !nonEmptyString(section.variantChoice)) fail(`${work.id}: ${section.page} has a malformed variantChoice`);
      if (section.footnotes !== undefined && !isPositiveInteger(section.footnotes)) fail(`${work.id}: ${section.page} has a malformed footnotes count`);
      if (section.editorNotes !== undefined) fail(`${work.id}: ${section.page} must declare note digests, not note text`);
      if (section.editorNoteDigests !== undefined && (!Array.isArray(section.editorNoteDigests) || section.editorNoteDigests.length === 0 || !section.editorNoteDigests.every((digest) => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest)))) {
        fail(`${work.id}: ${section.page} has a malformed editorNoteDigests list`);
      }
      if (section.transcludes === undefined) {
        if (pinned) fail(`${work.id}: ${section.page} has no transcludes list`);
        continue;
      }
      if (!Array.isArray(section.transcludes)) fail(`${work.id}: ${section.page} transcludes is not a list`);
      for (const page of section.transcludes) {
        if (!/^Page:./.test(page?.page ?? '') || !isPositiveInteger(page.revid)) fail(`${work.id}: ${section.page} has a malformed transclusion`);
      }
    }
  }
  return manifest;
}

/** Serializes with two-space indentation and every object of plain values (or empty lists) on one line, so the record reads as a list. */
export function serializeManifest(manifest) {
  const plain = (entry) => entry === null || typeof entry !== 'object' || (Array.isArray(entry) && entry.length === 0);
  const flat = (value) => value !== null && typeof value === 'object' && Object.values(value).every(plain);
  const write = (value, indent) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (!Array.isArray(value) && flat(value)) {
      return `{ ${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${JSON.stringify(entry)}`).join(', ')} }`;
    }
    const inner = `${indent}  `;
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return `[\n${value.map((entry) => inner + write(entry, inner)).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(value).map(([key, entry]) => `${inner}${JSON.stringify(key)}: ${write(entry, inner)}`);
    return `{\n${entries.join(',\n')}\n${indent}}`;
  };
  return `${write(manifest, '')}\n`;
}

// ---------------------------------------------------------------------------------------------------------
// HTML: a small tree builder for MediaWiki's balanced parser output

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0) };
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (!Object.hasOwn(NAMED_ENTITIES, name)) refuse('SAMPLEBOOK/html-entity', `unknown entity &${name};`);
    return NAMED_ENTITIES[name];
  });
}

function parseAttributes(raw) {
  const attributes = {};
  for (const match of raw.matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Text nodes are decoded strings; elements are `{ tag, attributes, children }`. Unbalanced markup refuses. */
export function parseHtml(html) {
  const root = { tag: '#root', attributes: {}, children: [] };
  const stack = [root];
  const pushText = (text) => {
    if (text.length > 0) stack.at(-1).children.push(decodeEntities(text));
  };
  let last = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(html); match !== null; match = TAG.exec(html)) {
    pushText(html.slice(last, match.index));
    last = TAG.lastIndex;
    if (match[0].startsWith('<!--')) continue;
    const [, closing, rawTag, rawAttributes, selfClosing] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const open = stack.at(-1);
      if (open.tag !== tag) refuse('SAMPLEBOOK/html-unbalanced', `</${tag}> closes <${open.tag}>`);
      stack.pop();
      continue;
    }
    const element = { tag, attributes: parseAttributes(rawAttributes), children: [] };
    stack.at(-1).children.push(element);
    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const end = html.indexOf(`</${tag}>`, last);
      if (end < 0) refuse('SAMPLEBOOK/html-unbalanced', `<${tag}> is never closed`);
      element.children.push(html.slice(last, end));
      last = end + tag.length + 3;
      TAG.lastIndex = last;
      continue;
    }
    if (selfClosing || VOID_ELEMENTS.has(tag)) continue;
    stack.push(element);
  }
  pushText(html.slice(last));
  if (stack.length !== 1) refuse('SAMPLEBOOK/html-unbalanced', `<${stack.at(-1).tag}> is never closed`);
  return root;
}

function plainText(element) {
  return element.children.map((child) => (typeof child === 'string' ? child : plainText(child))).join('');
}

function classes(element) {
  return (element.attributes.class ?? '').split(/\s+/).filter(Boolean);
}

function hasClass(element, ...names) {
  const own = classes(element);
  return names.some((name) => own.includes(name));
}

function describe(element) {
  const own = classes(element);
  return `<${element.tag}${own.length > 0 ? `.${own.join('.')}` : ''}${element.attributes.id ? `#${element.attributes.id}` : ''}>`;
}

function elementChildren(element) {
  return element.children.filter((child) => typeof child !== 'string');
}

function find(element, predicate) {
  for (const child of elementChildren(element)) {
    if (predicate(child)) return child;
    const nested = find(child, predicate);
    if (nested) return nested;
  }
  return undefined;
}

function findAll(element, predicate, found = []) {
  for (const child of elementChildren(element)) {
    if (predicate(child)) found.push(child);
    else findAll(child, predicate, found);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------
// Extraction: the section's own title and its original paragraphs

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const LINE_BREAK = String.fromCharCode(0xe000);
// ProofreadPage joins scanned pages with zero-width spaces; they are no part of the text.
const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b)}${String.fromCharCode(0xfeff)}]`, 'g');

/** Navigation, header and license furniture, images, and the machinery around references: dropped with everything inside. */
function isFurniture(element) {
  if (['style', 'script', 'link', 'meta', 'hr', 'figure'].includes(element.tag)) return true;
  if (element.attributes.id === 'headerContainer') return true;
  return hasClass(element, 'ws-header', 'ws-footer', 'ws-noexport', 'noprint', 'licenseContainer', 'licensetpl',
    'mw-editsection', 'mw-empty-elt', 'catlinks', 'navbox', 'ws-pagenum', 'pagenum', 'mw-references-wrap', 'reflist');
}

function isReferenceMarker(element) {
  return element.tag === 'sup' && hasClass(element, 'reference');
}

/** Wikisource's 另作 note: another edition's reading, shown on hover beside the text it annotates. */
function isVariantNote(element) {
  return element.tag === 'span' && hasClass(element, 'variant-tooltip');
}

/** A compiler's note or gloss set in small type as `〈(…)〉`, such as a pronunciation or an edition label. */
function isEditorNote(element) {
  return element.tag === 'small' && /^〈\(.*\)〉$/s.test(plainText(element).trim());
}

/** A link into the wiki's own discussion pages, never part of a work. */
function isDiscussionLink(element) {
  return element.tag === 'a' && /^Talk:/.test(element.attributes.title ?? '');
}

function isReferenceList(element) {
  return element.tag === 'ol' && hasClass(element, 'references');
}

function headingLevel(element) {
  const own = /^h([1-6])$/.exec(element.tag);
  if (own) return Number(own[1]);
  if (element.tag === 'div' && hasClass(element, 'mw-heading')) {
    const inner = find(element, (child) => /^h[1-6]$/.test(child.tag));
    return inner ? Number(inner.tag[1]) : undefined;
  }
  return undefined;
}

/** A heading that opens editorial apparatus rather than the work: annotations, notes, references, collation. */
export const NOTE_HEADING = /^(?:注|註|脚注|腳注|尾注|参考|參考|参见|參見|校勘|校记|校記|编者|編者|外部链接|外部連結|延伸阅读|延伸閱讀)/;

const INLINE_ELEMENTS = new Set(['a', 'b', 'strong', 'i', 'em', 'span', 'font', 'u', 's', 'big', 'sub', 'sup', 'abbr', 'ruby', 'rb', 'bdi', 'q', 'cite', 'var', 'mark', 'wbr', 'small']);
const RUBY_ANNOTATION = new Set(['rt', 'rp']);

function noteText(element) {
  return plainText(element).replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

/** A paragraph's text; every editorial note it drops is appended to `notes`, in order. */
function inlineText(element, tally, notes = []) {
  let text = '';
  for (const child of element.children) {
    if (typeof child === 'string') {
      text += child;
      continue;
    }
    if (isReferenceMarker(child)) {
      tally.referenceMarkers += 1;
      continue;
    }
    if (isVariantNote(child) || isEditorNote(child)) {
      notes.push(noteText(child));
      continue;
    }
    if (isDiscussionLink(child)) {
      tally.furniture += 1;
      continue;
    }
    if (isFurniture(child) || RUBY_ANNOTATION.has(child.tag)) continue;
    if (child.tag === 'br') {
      text += LINE_BREAK;
      continue;
    }
    if (!INLINE_ELEMENTS.has(child.tag)) refuse('SAMPLEBOOK/unhandled-inline', `${describe(child)} inside a paragraph`);
    text += inlineText(child, tally, notes);
  }
  return text;
}

/** HTML whitespace collapses to one space; each `<br>` ends a paragraph; leading indentation and trailing space go. */
export function paragraphLines(text) {
  return text
    .replace(ZERO_WIDTH, '')
    .replace(/[\t\n\f\r ]+/g, ' ')
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function headingText(element, tally) {
  return paragraphLines(inlineText(element, tally)).join(IDEOGRAPHIC_SPACE);
}

/** The header's own title for the page: a 回 novel's chapter line (row two of `ws-header`), else the bold title. */
function pageTitle(output, tally) {
  const wsHeader = find(output, (element) => element.tag === 'table' && hasClass(element, 'ws-header'));
  if (wsHeader) {
    const rows = findAll(wsHeader, (element) => element.tag === 'tr');
    for (const row of [rows[1], rows[0]]) {
      const cells = row ? elementChildren(row).filter((cell) => cell.tag === 'td') : [];
      const middle = cells.length === 3 ? headingText(cells[1], tally) : '';
      if (middle.length > 0) return middle;
    }
  }
  const container = find(output, (element) => element.attributes.id === 'headerContainer');
  if (container) {
    const bold = find(container, (element) => element.tag === 'b');
    const title = bold ? headingText(bold, tally) : '';
    if (title.length > 0) return title;
  }
  return refuse('SAMPLEBOOK/title-absent', 'the page has neither a ws-header chapter line nor a header title');
}

/** A compiler's edition label, `〈(…: 五十六回版本)〉`: the paragraph it heads belongs to that edition alone. */
const VERSION_NOTE = /^〈\([^:：]*[:：]\s*(\S+版本)\)〉$/;

function pushParagraphs(element, state) {
  const notes = [];
  const lines = paragraphLines(inlineText(element, state.tally, notes));
  state.notes.push(...notes);
  const versions = notes.map((note) => VERSION_NOTE.exec(note)?.[1]).filter((version) => version !== undefined);
  if (versions.length > 0) {
    if (state.variantChoice === undefined) refuse('SAMPLEBOOK/variant-choice-required', `a paragraph is labelled as one edition's (${versions.join(', ')}) and the manifest declares no variantChoice`);
    for (const version of versions) state.versionsSeen.add(version);
    if (!versions.includes(state.variantChoice)) {
      state.tally.otherVersionParagraphs += lines.length;
      return;
    }
  }
  for (const line of lines) state.blocks.push({ style: null, text: line });
}

function walkBlocks(container, state) {
  // Text and inline elements standing directly among blocks render as one anonymous paragraph, as in HTML.
  let run = [];
  const flush = () => {
    if (run.length > 0) pushParagraphs({ tag: '#run', attributes: {}, children: run }, state);
    run = [];
  };
  for (const child of container.children) {
    if (state.stopped) break;
    if (typeof child === 'string' || child.tag === 'br' || INLINE_ELEMENTS.has(child.tag)) {
      run.push(child);
      continue;
    }
    if (isReferenceList(child)) {
      state.tally.referenceLists += 1;
      continue;
    }
    if (isFurniture(child)) {
      state.tally.furniture += 1;
      continue;
    }
    flush();
    const level = headingLevel(child);
    if (level !== undefined) {
      const text = headingText(child.tag === 'div' ? find(child, (nested) => /^h[1-6]$/.test(nested.tag)) : child, state.tally);
      if (NOTE_HEADING.test(text)) {
        // Annotations close a page: the heading and everything after it at this level go.
        state.tally.noteSections += 1;
        state.stopped = true;
        break;
      }
      if (state.sectionTitle !== undefined && state.heading === undefined) {
        if (text !== state.sectionTitle) refuse('SAMPLEBOOK/section-mismatch', `the section opens with a heading other than its pinned title`);
        state.heading = text;
        continue;
      }
      state.blocks.push({ style: 'Heading2', text });
      continue;
    }
    switch (child.tag) {
      case 'p':
      case 'dd':
      case 'dt':
        if (child.tag !== 'p' && elementChildren(child).some((nested) => nested.tag === 'dl')) {
          walkBlocks(child, state);
          break;
        }
        pushParagraphs(child, state);
        break;
      case 'div':
      case 'dl':
      case 'center':
      case 'blockquote':
        walkBlocks(child, state);
        break;
      default:
        refuse('SAMPLEBOOK/unhandled-block', `${describe(child)} inside ${describe(container)}`);
    }
  }
  if (!state.stopped) flush();
}

/**
 * Extracts one pinned page (or one numbered section of it) from MediaWiki parser output. Returns the
 * section's heading, its body blocks in order, and the tally of what was dropped — counts only, so the
 * caller can report them without carrying any of the text.
 */
export function extractSection(html, { sectionTitle, variantChoice } = {}) {
  const root = parseHtml(html);
  const output = find(root, (element) => element.tag === 'div' && hasClass(element, 'mw-parser-output'));
  if (!output) refuse('SAMPLEBOOK/output-absent', 'no mw-parser-output container');
  const tally = { referenceMarkers: 0, otherVersionParagraphs: 0, referenceLists: 0, noteSections: 0, furniture: 0 };
  const state = { blocks: [], tally, notes: [], sectionTitle, variantChoice, versionsSeen: new Set(), heading: undefined, stopped: false };
  walkBlocks(output, state);
  if (variantChoice !== undefined && !state.versionsSeen.has(variantChoice)) {
    refuse('SAMPLEBOOK/variant-choice-unmatched', `no paragraph is labelled ${variantChoice}`);
  }
  const heading = sectionTitle === undefined ? pageTitle(output, tally) : state.heading;
  if (heading === undefined) refuse('SAMPLEBOOK/section-mismatch', 'the section has no heading');
  // A body that opens by repeating the header's title would carry it twice.
  if (state.blocks[0]?.style === 'Heading2' && state.blocks[0].text === heading) state.blocks.shift();
  if (!state.blocks.some((block) => block.style === null)) refuse('SAMPLEBOOK/section-empty', 'no body paragraph survived extraction');
  return { heading, blocks: state.blocks, notes: state.notes, tally };
}

// ---------------------------------------------------------------------------------------------------------
// DOCX: a minimal WordprocessingML package with fixed bytes for fixed input

/** The same instant as `src/shared/archive-time.ts`'s `fixedArchiveTime()`, built from local fields for the same reason. */
export function fixedArchiveTime() {
  return new Date(2026, 0, 1, 8, 0, 0);
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORDML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const CONTENT_TYPES_XML = XML_PROLOG
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '</Types>';

const PACKAGE_RELS_XML = XML_PROLOG
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + '</Relationships>';

const DOCUMENT_RELS_XML = XML_PROLOG
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '</Relationships>';

function styleXml(id, name, size, extra = '') {
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>`
    + `<w:qFormat/><w:pPr><w:keepNext/>${extra}</w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
}

const STYLES_XML = XML_PROLOG
  + `<w:styles xmlns:w="${WORDML}">`
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>'
  + '<w:pPr><w:spacing w:after="120"/><w:ind w:firstLineChars="200"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>'
  + styleXml('Title', 'Title', 44, '<w:jc w:val="center"/><w:ind w:firstLineChars="0"/>')
  + styleXml('Heading1', 'heading 1', 32, '<w:spacing w:before="480" w:after="240"/><w:ind w:firstLineChars="0"/><w:outlineLvl w:val="0"/>')
  + styleXml('Heading2', 'heading 2', 28, '<w:spacing w:before="240" w:after="120"/><w:ind w:firstLineChars="0"/><w:outlineLvl w:val="1"/>')
  + '</w:styles>';

function coreXml(title, author) {
  return XML_PROLOG
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/">'
    + `<dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(author)}</dc:creator>`
    + '</cp:coreProperties>';
}

function paragraphXml(style, text) {
  const properties = style === null ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`;
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * The DOCX for one work: a `Title` paragraph, then per section a `Heading1` and its blocks. The terminal
 * section properties stay bare, so the file carries no page setup the import would have to degrade.
 */
export function buildSampleBookDocx({ title, author, sections }) {
  const body = [paragraphXml('Title', title)];
  for (const section of sections) {
    body.push(paragraphXml('Heading1', section.heading));
    for (const block of section.blocks) body.push(paragraphXml(block.style, block.text));
  }
  const documentXml = `${XML_PROLOG}<w:document xmlns:w="${WORDML}"><w:body>${body.join('')}<w:sectPr/></w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(PACKAGE_RELS_XML),
    'docProps/core.xml': strToU8(coreXml(title, author)),
    'word/_rels/document.xml.rels': strToU8(DOCUMENT_RELS_XML),
    'word/styles.xml': strToU8(STYLES_XML),
    'word/document.xml': strToU8(documentXml),
  }, { level: 9, mtime: fixedArchiveTime() });
}

// ---------------------------------------------------------------------------------------------------------
// Wikisource access: curl, one request at a time, raw responses cached outside the checkout

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function apiRequest(parameters) {
  pause(REQUEST_SPACING_MS);
  // The query is percent-encoded here, as UTF-8, so curl's command line stays ASCII: on Windows curl would
  // otherwise re-encode a non-ASCII argument to the console code page before sending it.
  const query = Object.entries({ format: 'json', formatversion: '2', ...parameters })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const args = ['-sS', '--fail', '--retry', '4', '--retry-delay', '10', '-A', USER_AGENT, `${WIKISOURCE_API}?${query}`];
  const body = execFileSync('curl', args, { maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const response = JSON.parse(body.toString('utf8'));
  if (response.error) refuse('SAMPLEBOOK/api-error', `${response.error.code}: ${response.error.info}`);
  return { body, response };
}

function parseParameters(section) {
  return {
    action: 'parse',
    oldid: String(section.revid),
    variant: VARIANT,
    prop: 'text|revid|displaytitle|templates',
    ...(section.section === undefined ? {} : { section: String(section.section) }),
  };
}

function transcludedPages(parse) {
  return (parse.templates ?? []).filter((template) => template.ns === PAGE_NAMESPACE).map((template) => template.title).sort();
}

function currentRevisions(titles) {
  const revisions = new Map();
  for (let start = 0; start < titles.length; start += QUERY_BATCH) {
    const batch = titles.slice(start, start + QUERY_BATCH);
    const { response } = apiRequest({ action: 'query', prop: 'info', titles: batch.join('|') });
    const normalized = new Map((response.query.normalized ?? []).map((entry) => [entry.to, entry.from]));
    for (const page of response.query.pages) {
      const asked = normalized.get(page.title) ?? page.title;
      if (page.missing || page.invalid) refuse('SAMPLEBOOK/page-missing', `${asked} does not exist`);
      if (page.redirect) refuse('SAMPLEBOOK/page-redirect', `${asked} is a redirect; name its target`);
      revisions.set(asked, page.lastrevid);
    }
  }
  return revisions;
}

function cachePath(cache, section) {
  return join(cache, `parse-${section.revid}${section.section === undefined ? '' : `-s${section.section}`}.json`);
}

function loadParse(section, { cache, offline }) {
  const path = cachePath(cache, section);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')).parse;
  if (offline) refuse('SAMPLEBOOK/cache-miss', `${section.page} revision ${section.revid} is not cached`);
  const { body, response } = apiRequest(parseParameters(section));
  const parse = response.parse;
  if (parse?.revid !== section.revid) refuse('SAMPLEBOOK/revid-disappeared', `${section.page} revision ${section.revid} was not served`);
  const pinned = section.transcludes.map((page) => page.page).sort();
  const served = transcludedPages(parse);
  if (JSON.stringify(pinned) !== JSON.stringify(served)) refuse('SAMPLEBOOK/transclusion-moved', `${section.page} transcludes other pages than its pin`);
  if (served.length > 0) {
    const current = currentRevisions(served);
    for (const page of section.transcludes) {
      if (current.get(page.page) !== page.revid) refuse('SAMPLEBOOK/transclusion-moved', `${page.page} moved past revision ${page.revid}`);
    }
  }
  writeFileSync(path, body);
  return parse;
}

function pin(manifest) {
  const unpinned = manifest.works.flatMap((work) => work.sections).filter((section) => section.revid === undefined);
  const titles = [...new Set(unpinned.map((section) => section.page))];
  const current = titles.length > 0 ? currentRevisions(titles) : new Map();
  let changed = false;
  for (const work of manifest.works) {
    for (const section of work.sections) {
      if (section.revid === undefined) {
        section.revid = current.get(section.page);
        changed = true;
      }
      if (section.transcludes === undefined) {
        const { response } = apiRequest({ ...parseParameters(section), prop: 'revid|templates' });
        const pages = transcludedPages(response.parse);
        const revisions = pages.length > 0 ? currentRevisions(pages) : new Map();
        section.transcludes = pages.map((page) => ({ page, revid: revisions.get(page) }));
        changed = true;
      }
      // Normalized key order: page, section, sectionTitle, revid, the declarations, transcludes.
      const { page, section: number, sectionTitle, revid, transcludes, ...declarations } = section;
      for (const key of Object.keys(section)) delete section[key];
      Object.assign(section, { page, ...(number === undefined ? {} : { section: number, sectionTitle }), revid, ...declarations, transcludes });
    }
  }
  if (changed) manifest.pinnedOn = new Date().toISOString().slice(0, 10);
  return changed;
}

// ---------------------------------------------------------------------------------------------------------
// Command line

/**
 * What a page loses beyond furniture is declared in its manifest entry, so the designation record shows it:
 * every editorial note dropped (SHA-256 `editorNoteDigests`, in order; never the note text), the count of footnote markers (`footnotes`), and,
 * where a page carries one paragraph per edition, the edition kept (`variantChoice`).
 */
export function checkDeclarations(section, extracted) {
  const declaredNotes = section.editorNoteDigests ?? [];
  const noteDigests = extracted.notes.map((note) => createHash('sha256').update(note).digest('hex'));
  if (JSON.stringify(noteDigests) !== JSON.stringify(declaredNotes)) {
    refuse('SAMPLEBOOK/notes-undeclared', `${section.page} drops ${extracted.notes.length} editorial notes and its entry declares ${declaredNotes.length} that differ`);
  }
  if (extracted.tally.referenceMarkers !== (section.footnotes ?? 0)) {
    refuse('SAMPLEBOOK/notes-undeclared', `${section.page} drops ${extracted.tally.referenceMarkers} footnote markers and its entry declares ${section.footnotes ?? 0}`);
  }
}

export function buildWork(work, options) {
  const sections = [];
  const tally = { referenceMarkers: 0, otherVersionParagraphs: 0, referenceLists: 0, noteSections: 0, furniture: 0 };
  let notes = 0;
  for (const section of work.sections) {
    const parse = loadParse(section, options);
    let extracted;
    try {
      extracted = extractSection(parse.text, { sectionTitle: section.sectionTitle, variantChoice: section.variantChoice });
      checkDeclarations(section, extracted);
    } catch (error) {
      if (error instanceof PublicSampleBookError) error.message = `${error.message} (${work.id}: ${section.page})`;
      throw error;
    }
    sections.push({ heading: extracted.heading, blocks: extracted.blocks });
    for (const key of Object.keys(tally)) tally[key] += extracted.tally[key];
    notes += extracted.notes.length;
  }
  const bytes = buildSampleBookDocx({ title: work.title, author: work.author, sections });
  return { bytes, sections, tally, notes };
}

function argumentValues(argv, flag) {
  const values = [];
  argv.forEach((value, index) => {
    if (value === flag) values.push(argv[index + 1]);
  });
  return values;
}

/** Resolve the external cache without mistaking an in-checkout `..cache` name for a parent path. */
export function resolveCacheDirectory(cacheArgument, root = ROOT) {
  if (!cacheArgument || !isAbsolute(cacheArgument)) refuse('SAMPLEBOOK/usage', '--cache <absolute directory outside the checkout> is required');
  const cache = resolve(cacheArgument);
  const inside = relative(root, cache);
  if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)) refuse('SAMPLEBOOK/usage', 'the cache must lie outside the checkout');
  return cache;
}

function main(argv) {
  const [cacheArgument] = argumentValues(argv, '--cache');
  const cache = resolveCacheDirectory(cacheArgument);
  mkdirSync(cache, { recursive: true });
  const manifestPath = join(ROOT, MANIFEST_RELATIVE_PATH);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (argv.includes('--pin')) {
    validateManifest(manifest, { pinned: false });
    if (pin(manifest)) writeFileSync(manifestPath, serializeManifest(validateManifest(manifest)));
    console.log(`Pinned ${MANIFEST_RELATIVE_PATH}.`);
    return;
  }
  validateManifest(manifest);
  const only = argumentValues(argv, '--work');
  const check = argv.includes('--check');
  const options = { cache, offline: argv.includes('--offline') || check };
  let stale = false;
  for (const work of manifest.works) {
    if (only.length > 0 && !only.includes(work.id)) continue;
    const { bytes, sections, tally, notes } = buildWork(work, options);
    const target = join(ROOT, 'SampleBooks', work.file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const paragraphs = sections.reduce((sum, section) => sum + section.blocks.length, 0);
    if (check) {
      const same = existsSync(target) && Buffer.compare(readFileSync(target), Buffer.from(bytes)) === 0;
      if (!same) stale = true;
      console.log(`${work.file}: ${same ? 'matches' : 'DIFFERS'} (${bytes.length} bytes, sha256 ${digest})`);
      continue;
    }
    writeFileSync(target, bytes);
    console.log(`${work.file}: ${bytes.length} bytes, sha256 ${digest}; ${sections.length} sections, ${paragraphs} body paragraphs; `
      + `dropped ${tally.referenceMarkers} reference markers, ${notes} editorial notes, ${tally.otherVersionParagraphs} other-edition paragraphs, ${tally.referenceLists} reference lists, ${tally.noteSections} note sections, ${tally.furniture} furniture elements`);
  }
  if (stale) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(diagnosticCode(error));
    process.exitCode = 1;
  }
}
