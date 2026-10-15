import { strToU8, zipSync } from 'fflate';
import { fixedArchiveTime } from '../../../src/shared/archive-time.js';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';
import { ADMITTED_BASELINE_DOCX, sourceSpanText } from '../../support/composed-fixture.js';

// Issue #814 explicitly admits this container corpus. Synthetic tokens exercise OOXML elements, not
// editorial content. The sample1 case reads admitted spans at runtime; no prose or derivative is stored here.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text: string, props = ''): string => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;

export type CorpusSource = 'synthetic' | 'sample1';
export type CorpusVariant = 'unchanged' | 'edited' | 'mark-exported';

export async function buildCorpusSource(source: CorpusSource): Promise<Uint8Array> {
  const words = source === 'sample1'
    ? await Promise.all([8, 10, 12, 14, 15, 16, 17].map(async (block) => graphemesOf(await sourceSpanText(ADMITTED_BASELINE_DOCX, { block })).slice(0, 18).join('')))
    : ['AABBCCDDEEFF', 'FIELD01', 'CELL01', 'BEFORE01', 'AFTER01', 'BOX01', 'NOTE01'];
  const split = graphemesOf(words[0]!);
  const rich = run(split.slice(0, 3).join(''), '<w:b/><w:rFonts w:ascii="Arial"/><w:rPrChange w:id="30" w:author="示例作者" w:date="2026-10-15T00:00:00Z"><w:rPr><w:i/></w:rPr></w:rPrChange>') +
    run(split.slice(3, 6).join(''), '<w:i/><w:color w:val="336699"/>') +
    `<w:hyperlink r:id="rLink">${run(split.slice(6).join(''), '<w:u w:val="single"/><w:vertAlign w:val="superscript"/>')}</w:hyperlink>`;
  const drawing = '<w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="pixel"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    '<pic:blipFill><a:blip r:embed="rImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  const box = `<w:r><w:pict><v:shape id="box1"><v:textbox><w:txbxContent><w:p>${run(words[5]!)}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
  const properties = '<w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
  const field = `<w:p><w:fldSimple w:instr=" DATE ">${run(words[1]!)}</w:fldSimple>` +
    '<w:r><w:fldChar w:fldCharType="begin"/><w:instrText> PAGE </w:instrText><w:fldChar w:fldCharType="separate"/></w:r>' +
    `${run('1')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const date = '2026-10-15T00:00:00Z';
  const revised = `<w:p><w:commentRangeStart w:id="7"/><w:del w:id="8" w:author="示例作者" w:date="${date}">` +
    `<w:r><w:delText>${escape(words[3]!)}</w:delText></w:r></w:del>` +
    `<w:ins w:id="9" w:author="示例作者" w:date="${date}">${run(words[4]!)}</w:ins>` +
    '<w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>';
  const types = [
    ['document', 'document.main'], ['styles', 'styles'], ['numbering', 'numbering'], ['footnotes', 'footnotes'],
    ['endnotes', 'endnotes'], ['header1', 'header'], ['footer1', 'footer'], ['comments', 'comments'],
  ].map(([name, type]) => `<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('');
  const relationships = [
    ['rStyles', 'styles', 'styles.xml'], ['rNumbering', 'numbering', 'numbering.xml'],
    ['rFootnotes', 'footnotes', 'footnotes.xml'], ['rEndnotes', 'endnotes', 'endnotes.xml'],
    ['rHeader', 'header', 'header1.xml'], ['rFooter', 'footer', 'footer1.xml'],
    ['rComments', 'comments', 'comments.xml'], ['rImage', 'image', 'media/pixel.png'],
  ].map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('');
  const parts: Record<string, Uint8Array> = {};
  const add = (name: string, xml: string): void => { parts[name] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>${xml}`); };
  add('[Content_Types].xml', `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${types}</Types>`);
  add('_rels/.rels', `<Relationships xmlns="${PR}"><Relationship Id="rDoc" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
  add('word/_rels/document.xml.rels', `<Relationships xmlns="${PR}">${relationships}<Relationship Id="rLink" Type="${R}/hyperlink" Target="https://example.org/" TargetMode="External"/></Relationships>`);
  add('word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>` +
    `<w:p>${properties}${rich}${drawing}${box}<w:r><w:footnoteReference w:id="1"/><w:endnoteReference w:id="1"/></w:r></w:p>` +
    field + `<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p>${run(words[2]!)}</w:p></w:tc></w:tr></w:tbl>` +
    revised + '<w:sectPr><w:headerReference w:type="default" r:id="rHeader"/><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440"/></w:sectPr></w:body></w:document>');
  add('word/styles.xml', `<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
  add('word/numbering.xml', `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  for (const [name, root, item] of [['footnotes', 'footnotes', 'footnote'], ['endnotes', 'endnotes', 'endnote']]) {
    add(`word/${name}.xml`, `<w:${root} xmlns:w="${W}"><w:${item} w:id="1"><w:p>${run(words[6]!)}</w:p></w:${item}></w:${root}>`);
  }
  add('word/header1.xml', `<w:hdr xmlns:w="${W}"><w:p>${run('HEADER01')}</w:p></w:hdr>`);
  add('word/footer1.xml', `<w:ftr xmlns:w="${W}"><w:p>${run('FOOTER01')}</w:p></w:ftr>`);
  add('word/comments.xml', `<w:comments xmlns:w="${W}"><w:comment w:id="7" w:author="示例作者" w:date="${date}"><w:p>${run('请核对。')}</w:p></w:comment></w:comments>`);
  parts['word/media/pixel.png'] = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  return zipSync(parts, { level: 6, mtime: fixedArchiveTime() });
}
