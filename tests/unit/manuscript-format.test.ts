import { describe, expect, it } from 'vitest';
import {
  MANUSCRIPT_FORMAT_HEAD_BYTES,
  editableImport,
  identifyManuscriptFormat,
  manuscriptObjectExtension,
} from '../../src/service/manuscript-format.js';
import type { SourceFormat } from '../../src/shared/protocol.js';

const encoder = new TextEncoder();

function bytes(...parts: Array<Uint8Array | string | number[]>): Uint8Array {
  const encoded = parts.map((part) =>
    typeof part === 'string' ? encoder.encode(part) : part instanceof Uint8Array ? part : Uint8Array.from(part),
  );
  const total = encoded.reduce((sum, part) => sum + part.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const part of encoded) {
    buffer.set(part, offset);
    offset += part.length;
  }
  return buffer;
}

/** One ZIP local file header and its data, enough for the router's first-entry inspection. */
function zipFirstEntry(name: string, data: string, { method = 0, extra = 0 } = {}): Uint8Array {
  const nameBytes = encoder.encode(name);
  const dataBytes = encoder.encode(data);
  const header = new Uint8Array(30);
  header.set([0x50, 0x4b, 0x03, 0x04], 0);
  header[8] = method & 0xff;
  header[9] = (method >> 8) & 0xff;
  header[26] = nameBytes.length & 0xff;
  header[27] = (nameBytes.length >> 8) & 0xff;
  header[28] = extra & 0xff;
  header[29] = (extra >> 8) & 0xff;
  return bytes(header, nameBytes, new Uint8Array(extra), dataBytes);
}

const ODF_TEXT = 'application/vnd.oasis.opendocument.text';

describe('identifyManuscriptFormat', () => {
  it('identifies a PDF by its header', () => {
    expect(identifyManuscriptFormat(bytes('%PDF-1.7\n', [0xe2, 0xe3, 0xcf, 0xd3]), 'anything.docx')).toBe('PDF');
  });

  it('identifies a legacy Word document by the OLE compound-file signature', () => {
    const head = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], new Uint8Array(504));
    expect(identifyManuscriptFormat(head, 'anything.txt')).toBe('DOC');
  });

  it('identifies RTF by its control word', () => {
    expect(identifyManuscriptFormat(bytes('{\\rtf1\\ansi\\deff0}'), 'anything.pdf')).toBe('RTF');
  });

  it('identifies ODT when the first stored ZIP entry is the ODF text mimetype', () => {
    expect(identifyManuscriptFormat(zipFirstEntry('mimetype', ODF_TEXT), 'anything.docx')).toBe('ODT');
  });

  it('reads any other ZIP as a DOCX candidate', () => {
    expect(identifyManuscriptFormat(zipFirstEntry('[Content_Types].xml', '<Types/>'), 'anything.odt')).toBe('DOCX');
  });

  it('splits ODT from DOCX on placement, compression, and media type', () => {
    // ODF requires `mimetype` first, stored, holding exactly the media type; anything else is a candidate.
    expect(identifyManuscriptFormat(zipFirstEntry('mimetype', ODF_TEXT, { method: 8 }), 'a.odt')).toBe('DOCX');
    expect(identifyManuscriptFormat(zipFirstEntry('mimetype', 'application/vnd.oasis.opendocument.spreadsheet'), 'a.odt'))
      .toBe('DOCX');
    expect(identifyManuscriptFormat(zipFirstEntry('mimetypes', ODF_TEXT), 'a.odt')).toBe('DOCX');
    expect(identifyManuscriptFormat(zipFirstEntry('word/document.xml', ODF_TEXT), 'a.odt')).toBe('DOCX');
  });

  it('honours a declared extra field when locating the first entry data', () => {
    expect(identifyManuscriptFormat(zipFirstEntry('mimetype', ODF_TEXT, { extra: 12 }), 'a.odt')).toBe('ODT');
  });

  it('identifies UTF-8 without a NUL as text, and the extension alone splits Markdown from plain text', () => {
    const text = bytes('合成文本\n第二行\n');
    expect(identifyManuscriptFormat(text, 'notes.txt')).toBe('TXT');
    expect(identifyManuscriptFormat(text, 'notes.bin')).toBe('TXT');
    expect(identifyManuscriptFormat(text, 'notes.md')).toBe('MD');
    expect(identifyManuscriptFormat(text, 'notes.MARKDOWN')).toBe('MD');
  });

  it('allows a UTF-8 BOM', () => {
    expect(identifyManuscriptFormat(bytes([0xef, 0xbb, 0xbf], '# 标题\n'), 'notes.md')).toBe('MD');
    expect(identifyManuscriptFormat(bytes([0xef, 0xbb, 0xbf], '合成文本'), 'notes.txt')).toBe('TXT');
  });

  it('refuses to call bytes text when a NUL is present, whatever the extension claims', () => {
    expect(identifyManuscriptFormat(bytes('合成文本', [0x00], '更多'), 'notes.md')).toBe('UNKNOWN');
    expect(identifyManuscriptFormat(bytes([0x00]), 'notes.txt')).toBe('UNKNOWN');
  });

  it('calls an unrecognised byte string UNKNOWN even under a Markdown extension', () => {
    expect(identifyManuscriptFormat(bytes([0xff, 0xfe, 0x41, 0x42]), 'notes.md')).toBe('UNKNOWN');
    expect(identifyManuscriptFormat(bytes([0xc3, 0x28]), 'notes.markdown')).toBe('UNKNOWN');
  });

  it('tolerates a multi-byte sequence the window cut in half, but not one cut by end of file', () => {
    const truncatedWindow = bytes('a'.repeat(MANUSCRIPT_FORMAT_HEAD_BYTES - 1), [0xe5]);
    expect(truncatedWindow.length).toBe(MANUSCRIPT_FORMAT_HEAD_BYTES);
    expect(identifyManuscriptFormat(truncatedWindow, 'notes.txt')).toBe('TXT');
    expect(identifyManuscriptFormat(bytes('a', [0xe5]), 'notes.txt')).toBe('UNKNOWN');
  });

  it('is pure: it neither mutates its input nor depends on call order', () => {
    const head = zipFirstEntry('mimetype', ODF_TEXT);
    const before = Uint8Array.from(head);
    expect(identifyManuscriptFormat(head, 'a.docx')).toBe('ODT');
    expect(identifyManuscriptFormat(head, 'a.docx')).toBe('ODT');
    expect(head).toEqual(before);
  });
});

describe('the routing table', () => {
  const formats: ReadonlyArray<SourceFormat> = ['DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'];

  it('offers editable import for DOCX alone, with a stated reason for every other format', () => {
    expect(editableImport('DOCX')).toEqual({ available: true });
    for (const format of formats.filter((candidate) => candidate !== 'DOCX')) {
      const projection = editableImport(format);
      expect(projection.available).toBe(false);
      expect(projection).toMatchObject({ code: 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT' });
      // The copy is product-facing: it says why and names the retention, never a plan slot.
      expect(projection.available === false && projection.reason.endsWith('可作为来源材料保留。')).toBe(true);
    }
  });

  it('stores every retained original under the extension of what it was identified as', () => {
    expect(formats.map((format) => manuscriptObjectExtension(format))).toEqual([
      '.docx', '.doc', '.pdf', '.odt', '.rtf', '.txt', '.md', '.bin',
    ]);
  });
});
