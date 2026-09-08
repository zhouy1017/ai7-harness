import { writeFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';

// Generated-only DOCX fixtures for tests whose subject is the container: malformed packaging, a
// missing part, an import bound, a fixture whose only role is to exist. A test whose subject is
// manuscript content composes real prose instead, through `./composed-fixture.js`.

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml"' +
  ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

export interface SyntheticDocxParagraph {
  /** Literal paragraph text; an empty string produces a paragraph that carries no run. */
  text: string;
  /** Optional `w:pStyle` value, for example `Title`, `Heading1`, or `标题 2`. */
  style?: string;
}

export interface SyntheticDocxTerminalSection {
  /** `w:sectPr` attributes by local name, for example `{ rsidR: '00AB12CD' }`. */
  attributes?: Readonly<Record<string, string>>;
  /** Empty child elements by local name, for example `['pgSz', 'pgMar', 'cols', 'docGrid']`. */
  children?: readonly string[];
}

export interface SyntheticDocxOptions {
  paragraphs?: readonly SyntheticDocxParagraph[];
  /** Shape of the body-level terminal `w:sectPr`; omitted means the bare `<w:sectPr/>` container. */
  terminalSection?: SyntheticDocxTerminalSection;
  /** Adds `docProps/core.xml` carrying this `dc:title`. */
  coreTitle?: string;
  omitContentTypes?: boolean;
  omitDocument?: boolean;
  /** Extra ZIP entries, written after the generated ones so a test can replace or oversize a part. */
  extraEntries?: Readonly<Record<string, Uint8Array>>;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function terminalSectionXml(section: SyntheticDocxTerminalSection | undefined): string {
  const attributes = Object.entries(section?.attributes ?? {})
    .map(([name, value]) => ` w:${name}="${escapeXml(value).replace(/"/g, '&quot;')}"`)
    .join('');
  const children = (section?.children ?? []).map((name) => `<w:${name}/>`).join('');
  return children.length === 0 ? `<w:sectPr${attributes}/>` : `<w:sectPr${attributes}>${children}</w:sectPr>`;
}

function paragraphXml(paragraph: SyntheticDocxParagraph): string {
  const style = paragraph.style === undefined
    ? ''
    : `<w:pPr><w:pStyle w:val="${escapeXml(paragraph.style)}"/></w:pPr>`;
  const run = paragraph.text.length === 0 ? '' : `<w:r><w:t>${escapeXml(paragraph.text)}</w:t></w:r>`;
  return `<w:p>${style}${run}</w:p>`;
}

export function buildSyntheticDocx(options: SyntheticDocxOptions = {}): Uint8Array {
  const paragraphs = options.paragraphs ?? [{ text: '合成段落内容。' }];
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs.map(paragraphXml).join('') +
    terminalSectionXml(options.terminalSection) +
    '</w:body></w:document>';

  const entries: Record<string, Uint8Array> = {};
  if (options.omitContentTypes !== true) entries['[Content_Types].xml'] = strToU8(CONTENT_TYPES_XML);
  if (options.omitDocument !== true) entries['word/document.xml'] = strToU8(documentXml);
  if (options.coreTitle !== undefined) {
    entries['docProps/core.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties' +
      ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `<dc:title>${escapeXml(options.coreTitle)}</dc:title>` +
      '</cp:coreProperties>',
    );
  }
  for (const [name, bytes] of Object.entries(options.extraEntries ?? {})) entries[name] = bytes;
  return zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') });
}

export async function writeSyntheticDocx(path: string, options: SyntheticDocxOptions = {}): Promise<Uint8Array> {
  const archive = buildSyntheticDocx(options);
  await writeFile(path, archive);
  return archive;
}
