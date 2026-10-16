import { describe, expect, it } from 'vitest';
import {
  MATERIAL_FORMAT_BOUNDS,
  MIN_PDF_LETTERS_PER_PAGE,
  MaterialFormatRefusal,
  PDF_TEXT_CONVERTER_IDENTITY,
  extractPdfText,
} from '../../src/service/material-formats.js';
import { identifyManuscriptFormat } from '../../src/service/manuscript-format.js';
import { malformedPdf, sampleTextPdf, syntheticPdf } from '../fixtures/material-formats/synthetic-pdf.js';

// Unit suite (L1) for the PDF text layer of the Material Index (Issue #892): `pdfjs-dist`'s Node build in this process, no
// worker file, no canvas, over synthetic PDFs written by `tests/fixtures/material-formats/synthetic-pdf.ts` — the suite's own
// words, never a real-world file.

async function refusal(bytes: Uint8Array, ...rest: [AbortSignal?, typeof MATERIAL_FORMAT_BOUNDS?, number?]): Promise<string> {
  try {
    await extractPdfText(bytes, ...rest);
  } catch (error) {
    if (error instanceof MaterialFormatRefusal) return error.reason;
    if (error instanceof DOMException) return error.name;
    throw error;
  }
  return 'read';
}

describe('a PDF\'s text layer', () => {
  it('reads paragraphs page by page, each with its page and its place on that page, and the document\'s own title', async () => {
    const read = await extractPdfText(sampleTextPdf());
    expect(read.title).toBe('合成 PDF 资料');
    expect(read.pageCount).toBe(2);
    expect(read.paragraphs).toEqual([
      // Two wrapped lines of one paragraph are joined with a space; Chinese lines join without one.
      { lines: ['The first paragraph opens the page. It wraps onto a second line.'] },
      { lines: ['A second paragraph follows. It has two sentences.'] },
      { lines: ['第二页的第一段。还有一句！'] },
      { lines: ['第二页的第二段。'] },
    ]);
    expect(read.pages).toEqual([{ page: 1, paragraph: 1 }, { page: 1, paragraph: 2 }, { page: 2, paragraph: 1 }, { page: 2, paragraph: 2 }]);
    expect(PDF_TEXT_CONVERTER_IDENTITY).toBe('ai7-pdf-text/1+pdfjs-dist@6.4.299');
    // The manuscript intake still names the signature, and still refuses a PDF as a manuscript (J-01's source-only-pdf).
    expect(identifyManuscriptFormat(sampleTextPdf().subarray(0, 64), 'x.pdf')).toBe('PDF');
  });

  it('joins a Latin line broken at a hyphen, and never lets a paragraph run over a page', async () => {
    const read = await extractPdfText(syntheticPdf({ pages: [[['A carefully hyph-', 'enated word ends here.']], [['Continued on the next page.']]] }));
    expect(read.paragraphs.map((paragraph) => paragraph.lines.join(''))).toEqual(['A carefully hyphenated word ends here.', 'Continued on the next page.']);
    expect(read.pages).toEqual([{ page: 1, paragraph: 1 }, { page: 2, paragraph: 1 }]);
  });

  it('says a scan needs recognition: pages with no text layer, or too little text to speak of', async () => {
    expect(await refusal(syntheticPdf({ pages: [[['x']]], imageOnly: new Set([0]) }))).toBe('needs-recognition');
    // A stray page number on two scanned pages is below the density a reader could use.
    expect(await refusal(syntheticPdf({ pages: [[['12']], [['13']]] }))).toBe('needs-recognition');
    expect(MIN_PDF_LETTERS_PER_PAGE).toBe(8);
    // A text page beside a scanned one is read; the scanned page gives no paragraph.
    const mixed = await extractPdfText(syntheticPdf({ pages: [[['Enough words on this page to be read.']], [['x']]], imageOnly: new Set([1]) }));
    expect(mixed.pages).toEqual([{ page: 1, paragraph: 1 }]);
  });

  it('refuses an encrypted PDF and one that cannot be read, naming why', async () => {
    expect(await refusal(syntheticPdf({ pages: [[['Locked words that are never read.']]], encrypted: true }))).toBe('encrypted');
    expect(await refusal(malformedPdf())).toBe('unreadable');
  });

  it('holds the page, paragraph and text bounds every reader keeps, and stops when asked', async () => {
    const two = sampleTextPdf();
    expect(await refusal(two, undefined, MATERIAL_FORMAT_BOUNDS, 1)).toBe('over-bound');
    expect(await refusal(two, undefined, { ...MATERIAL_FORMAT_BOUNDS, paragraphs: 3 })).toBe('over-bound');
    expect(await refusal(two, undefined, { ...MATERIAL_FORMAT_BOUNDS, textCodeUnits: 40 })).toBe('over-bound');
    const stopped = new AbortController();
    stopped.abort();
    expect(await refusal(two, stopped.signal)).toBe('AbortError');
  });
});
