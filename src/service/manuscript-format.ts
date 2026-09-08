import { extname } from 'node:path';
import type { EditableImportProjection, SourceFormat } from '../shared/protocol.js';
import { DOC_CONVERTER_IDENTITY } from './doc-manuscript.js';
import { TEXT_CONVERTER_IDENTITY } from './text-manuscript.js';

/**
 * Intake identifies a selected file's format from its content, not from its extension (ADR 0072 §1).
 * Nothing but this window is read from a file the product will not parse, so an unrecognised or
 * fixed-layout file is retained whole without ever being interpreted.
 */
export const MANUSCRIPT_FORMAT_HEAD_BYTES = 64 * 1024;

const PDF_SIGNATURE = signature('%PDF-');
/** The OLE compound-file header that opens every legacy binary Word document. */
const OLE_COMPOUND_FILE_SIGNATURE = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const RTF_SIGNATURE = signature('{\\rtf');
const ZIP_LOCAL_HEADER_SIGNATURE = Uint8Array.of(0x50, 0x4b, 0x03, 0x04);
const ODF_MIMETYPE_ENTRY_NAME = signature('mimetype');
const ODF_TEXT_MEDIA_TYPE = signature('application/vnd.oasis.opendocument.text');
const ZIP_LOCAL_HEADER_BYTES = 30;
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

const EDITABLE_IMPORT_REFUSAL_CODE = 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT' as const;

/** One product-facing reason per format, naming the retention that is offered instead. */
const EDITABLE_IMPORT_REFUSAL_REASONS: Readonly<Record<Exclude<SourceFormat, 'DOCX' | 'TXT' | 'MD' | 'DOC'>, string>> = {
  PDF: 'PDF 为固定版式，没有可靠的可编辑往返；可作为来源材料保留。',
  ODT: '该格式的本地转换尚未提供；可作为来源材料保留。',
  RTF: '该格式的本地转换尚未提供；可作为来源材料保留。',
  UNKNOWN: '无法识别文件格式；可作为来源材料保留。',
};

/** The retained original keeps the identified format's extension, never the selected file's. */
const OBJECT_EXTENSIONS: Readonly<Record<SourceFormat, string>> = {
  DOCX: '.docx',
  DOC: '.doc',
  PDF: '.pdf',
  ODT: '.odt',
  RTF: '.rtf',
  TXT: '.txt',
  MD: '.md',
  UNKNOWN: '.bin',
};

function signature(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function matchesAt(head: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (head.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (head[offset + index] !== expected[index]) return false;
  }
  return true;
}

function readUint16LittleEndian(head: Uint8Array, offset: number): number {
  return head[offset]! | (head[offset + 1]! << 8);
}

/**
 * ODF requires `mimetype` to be the archive's first entry, stored uncompressed, holding exactly the
 * document's media type (OpenDocument v1.3 §3.3). A ZIP that does not place it there — a DOCX, or
 * anything else wearing a ZIP container — is a DOCX candidate and goes to the parser to decide.
 */
function isOpenDocumentText(head: Uint8Array): boolean {
  if (head.length < ZIP_LOCAL_HEADER_BYTES) return false;
  const compressionMethod = readUint16LittleEndian(head, 8);
  const nameLength = readUint16LittleEndian(head, 26);
  const extraLength = readUint16LittleEndian(head, 28);
  if (compressionMethod !== 0 || nameLength !== ODF_MIMETYPE_ENTRY_NAME.length) return false;
  if (!matchesAt(head, ZIP_LOCAL_HEADER_BYTES, ODF_MIMETYPE_ENTRY_NAME)) return false;
  return matchesAt(head, ZIP_LOCAL_HEADER_BYTES + nameLength + extraLength, ODF_TEXT_MEDIA_TYPE);
}

/**
 * Text is UTF-8 that carries no NUL. When the window cut the file short a trailing multi-byte
 * sequence may be incomplete, which is not a decoding failure; at end of file it is.
 */
function isUtf8Text(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: head.length >= MANUSCRIPT_FORMAT_HEAD_BYTES });
    return true;
  } catch {
    return false;
  }
}

/**
 * Identify the selected file's format from at most its first {@link MANUSCRIPT_FORMAT_HEAD_BYTES}
 * bytes. Pure: the same bytes and name always give the same verdict. The name decides nothing
 * except Markdown versus plain text, which have the same bytes and differ only by intent.
 */
export function identifyManuscriptFormat(head: Uint8Array, displayName: string): SourceFormat {
  if (matchesAt(head, 0, PDF_SIGNATURE)) return 'PDF';
  if (matchesAt(head, 0, OLE_COMPOUND_FILE_SIGNATURE)) return 'DOC';
  if (matchesAt(head, 0, RTF_SIGNATURE)) return 'RTF';
  if (matchesAt(head, 0, ZIP_LOCAL_HEADER_SIGNATURE)) return isOpenDocumentText(head) ? 'ODT' : 'DOCX';
  if (isUtf8Text(head)) {
    return MARKDOWN_EXTENSIONS.has(extname(displayName).toLocaleLowerCase('en-US')) ? 'MD' : 'TXT';
  }
  return 'UNKNOWN';
}

/** The extension the retained original is stored under, keyed by what it was identified as. */
export function manuscriptObjectExtension(format: SourceFormat): string {
  return OBJECT_EXTENSIONS[format];
}

/**
 * The routing table of ADR 0072 §1: a DOCX is read natively, a format with a converter is read
 * through the DOCX working representation that converter produces, and every other format states
 * its reason and is offered source-only retention instead (ADR 0072 §2, V2-UX-IMP-006).
 */
export function editableImport(format: SourceFormat): EditableImportProjection {
  if (format === 'DOCX') return { available: true };
  if (format === 'TXT' || format === 'MD') {
    return { available: true, conversion: { converterIdentity: TEXT_CONVERTER_IDENTITY, sourceFormat: format } };
  }
  if (format === 'DOC') {
    return { available: true, conversion: { converterIdentity: DOC_CONVERTER_IDENTITY, sourceFormat: format } };
  }
  return { available: false, code: EDITABLE_IMPORT_REFUSAL_CODE, reason: EDITABLE_IMPORT_REFUSAL_REASONS[format] };
}
