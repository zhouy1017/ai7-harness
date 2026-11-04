import { readFile, writeFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from './composed-fixture.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

/** Actual sample1 paragraphs in a two-cell table, followed by an authored one-pixel raster image and the remaining paragraphs. */
export async function composeSourceObjectDocx(path: string): Promise<Uint8Array> {
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 21, blocks: 8, title: '表图组稿' });
  const files = unzipSync(await readFile(path));
  const xml = strFromU8(files['word/document.xml']!);
  const paragraphs = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((match) => match[0]);
  const table = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="2500"/></w:tblGrid><w:tr>${paragraphs.slice(0, 2).map((p) => `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="dxa"/></w:tcPr>${p}</w:tc>`).join('')}</w:tr></w:tbl>`;
  const image = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Preview"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  files['word/document.xml'] = strToU8(xml.replace('<w:document ', '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ')
    .replace(paragraphs[0]! + paragraphs[1]!, table + image));
  files['word/_rels/document.xml.rels'] = strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/preview.png"/></Relationships>');
  files['word/media/preview.png'] = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']!).replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  const bytes = zipSync(files, { mtime: fixedArchiveTime() });
  await writeFile(path, bytes);
  return bytes;
}
