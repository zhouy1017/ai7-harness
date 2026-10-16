// Synthetic PDFs for the Material Index's PDF text layer (Issue #892): written here, byte for byte, from the suite's own
// words — no real-world file, no manuscript. Each page holds its paragraphs as lines of text set in a Type0 font whose ToUnicode
// map is the identity, so Chinese and Latin text alike read back as written; a page may instead carry only an image (a scan),
// and a file may be locked with a user password or be no PDF at all past its signature.

export interface SyntheticPdfOptions {
  /** Each page's paragraphs; each paragraph's lines, set one under another. */
  readonly pages: ReadonlyArray<ReadonlyArray<ReadonlyArray<string>>>;
  /** The document information Title. */
  readonly title?: string;
  /** Pages that carry only an image and no text, by index. */
  readonly imageOnly?: ReadonlySet<number>;
  /** Locked with a user password the reader is not given. */
  readonly encrypted?: boolean;
}

const LINE_HEIGHT = 14;
const PARAGRAPH_GAP = 28;
const FONT_SIZE = 12;

/** A text as the font's two-byte codes: its UTF-16 code units, which the identity ToUnicode map reads back. */
function hex(text: string): string {
  let out = '';
  for (let index = 0; index < text.length; index += 1) out += text.charCodeAt(index).toString(16).padStart(4, '0');
  return out;
}

function stream(content: string, extra = ''): string {
  return `<< /Length ${Buffer.byteLength(content, 'latin1')}${extra} >>\nstream\n${content}\nendstream`;
}

function pdfString(text: string): string {
  return `<FEFF${hex(text)}>`;
}

const TO_UNICODE = [
  '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
  '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def',
  '1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange',
  'endcmap CMapName currentdict /CMap defineresource pop end end',
].join('\n');

/** One synthetic PDF's bytes. */
export function syntheticPdf(options: SyntheticPdfOptions): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pages = add('');
  const font = add('');
  const descendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AI7Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 500 >>');
  const toUnicode = add(stream(TO_UNICODE));
  add('<< /Type /FontDescriptor /FontName /AI7Synthetic /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');
  const image = add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x80\nendstream');
  objects[font - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /AI7Synthetic /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${toUnicode} 0 R >>`;
  const kids: number[] = [];
  options.pages.forEach((paragraphs, index) => {
    let content: string;
    if (options.imageOnly?.has(index) === true) {
      content = 'q 400 0 0 500 100 150 cm /Im1 Do Q';
    } else {
      const operations: string[] = [`BT /F1 ${FONT_SIZE} Tf`];
      let y = 760;
      for (const lines of paragraphs) {
        for (const line of lines) {
          operations.push(`1 0 0 1 72 ${y} Tm <${hex(line)}> Tj`);
          y -= LINE_HEIGHT;
        }
        y -= PARAGRAPH_GAP - LINE_HEIGHT;
      }
      operations.push('ET');
      content = operations.join('\n');
    }
    const contents = add(stream(content));
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${contents} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = options.title === undefined ? null : add(`<< /Title ${pdfString(options.title)} >>`);
  // A Standard security handler whose user password is not the empty one: the reader is asked for a password it does not have.
  const encrypt = options.encrypted === true ? add(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`) : null;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  const trailer = [`/Size ${objects.length + 1}`, `/Root ${catalog} 0 R`];
  if (info !== null) trailer.push(`/Info ${info} 0 R`);
  if (encrypt !== null) trailer.push(`/Encrypt ${encrypt} 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]`);
  out += `trailer\n<< ${trailer.join(' ')} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** A file that opens as a PDF and holds nothing a reader can parse past its signature. */
export function malformedPdf(): Uint8Array {
  return new Uint8Array(Buffer.from('%PDF-1.4\n% synthetic, deliberately broken: no objects, no cross-reference table\n', 'latin1'));
}

/** A two-page text PDF of the suite's own words: English on its first page, Chinese on its second. */
export function sampleTextPdf(): Uint8Array {
  return syntheticPdf({
    title: '合成 PDF 资料',
    pages: [
      [['The first paragraph opens the page.', 'It wraps onto a second line.'], ['A second paragraph follows. It has two sentences.']],
      [['第二页的第一段。还有一句！'], ['第二页的第二段。']],
    ],
  });
}
