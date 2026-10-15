import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractMaterialFormatText, type MaterialTextFormat } from '../../src/service/material-formats.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import { SYNTHETIC_RTF } from '../fixtures/material-formats/sample-rtf.js';

// Unit suite (L1) for Issue #766, item 3: the four readers on the synthetic file set under `tests/fixtures/material-formats/`
// — one EPUB, one ODT and one RTF written the way real software writes them (nested navigation, styles at scale, images and
// fonts the package names but does not hold). The files are the suite's own invented words, no manuscript and no outside file:
// real public-domain files are not admitted yet (the Owner's decision, #766), so this suite is the synthetic stand-in for them
// and does not show that a real book reads the same way. The EPUB and the ODT are source trees zipped here at the fixed
// archive time, and the RTF is source text (`sample-rtf.ts`): `.gitignore` refuses document-format files everywhere.

const ROOT = fileURLToPath(new URL('../fixtures/material-formats/', import.meta.url));

/** Every file under `directory`, by its path below it, with `/` separators and in a fixed order. */
function treeFiles(directory: string, below = ''): string[] {
  const names = readdirSync(join(directory, below), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return names.flatMap((entry) => (entry.isDirectory() ? treeFiles(directory, `${below}${entry.name}/`) : [`${below}${entry.name}`]));
}

/** A fixture source tree as the archive the format is: `mimetype` first and stored, the rest deflated, at the fixed archive time. */
function treeArchive(name: string): Uint8Array {
  const directory = join(ROOT, name);
  const files: Zippable = { mimetype: [readFileSync(join(directory, 'mimetype')), { level: 0 }] };
  for (const path of treeFiles(directory)) {
    if (path !== 'mimetype') files[path] = readFileSync(join(directory, path));
  }
  return zipSync(files, { mtime: fixedArchiveTime() });
}

type Read = { title: string | null; paragraphs: Array<[string | undefined, string[]]> };

function read(bytes: Uint8Array, format: MaterialTextFormat): Read {
  const result = extractMaterialFormatText(bytes, format);
  return { title: result.title, paragraphs: result.paragraphs.map((paragraph) => [paragraph.style, paragraph.lines]) };
}

const CHAPTER_ONE: Read['paragraphs'] = [
  ['Heading1', ['第一章']],
  ['Heading2', ['一、起风']],
  [undefined, ['夜里风从海面上慢慢地吹过来，[1]灯塔的窗口亮着。']],
  [undefined, ['守灯人合上书，说：“明天要涨潮。”']],
  [undefined, ['图一　灯塔的外形']],
  ['Heading3', ['灯塔的第一盏灯']],
  [undefined, ['第一盏灯是在春天点起来的。', '它很小，却一直没有熄过。']],
  [undefined, ['层层嵌套的行内元素里的字也被读到。']],
  [undefined, ['准备油和灯芯']],
  [undefined, ['擦亮玻璃']],
  [undefined, ['先擦里面']],
  [undefined, ['再擦外面']],
  [undefined, ['时辰']],
  [undefined, ['潮位']],
  [undefined, ['清晨']],
  [undefined, ['低']],
  [undefined, ['黄昏']],
  [undefined, ['高']],
];

describe('the synthetic EPUB', () => {
  const book = treeArchive('epub');

  it('names images, a font and a cover the archive does not hold, and nests its navigation four lists deep', () => {
    const held = Object.keys(unzipSync(book));
    expect(held.some((name) => /^OEBPS\/(?:images|fonts)\//u.test(name))).toBe(false);
    const manifest = readFileSync(join(ROOT, 'epub/OEBPS/content.opf'), 'utf8');
    expect(manifest).toContain('href="images/cover.jpg"');
    expect(manifest).toContain('href="fonts/SyntheticSerif-Regular.otf"');
    const nav = readFileSync(join(ROOT, 'epub/OEBPS/nav.xhtml'), 'utf8');
    expect(nav.match(/<ol>/gu)).toHaveLength(5);
    expect(nav).toContain('<ol><li><a href="text/chapter01.xhtml#c1s1a">');
  });

  it('reads the chapters in spine order, without the navigation, the cover and what is hidden or scripted, and the book\'s title', () => {
    expect(read(book, 'EPUB')).toEqual({
      title: '合成样书：潮声与灯塔',
      paragraphs: [
        ['Heading1', ['前言']],
        [undefined, ['这是一本合成的样书，它只用来检验阅读器。']],
        [undefined, ['书里的人物、地名和句子都是编出来的，与任何真实稿件无关。']],
        ...CHAPTER_ONE,
        ['Heading1', ['第二章']],
        [undefined, ['清晨，海面平静。她把昨夜的记录抄在本子上。']],
        [undefined, ['“灯不灭，船就不会迷路。”']],
        [undefined, ['她读完这句话，把本子放回抽屉。']],
        [undefined, ['这是第二章里的一条旁注。']],
        ['Heading1', ['注释']],
        [undefined, ['[1] 合成注释：潮水每天涨落两次。↩']],
      ],
    });
  });

  it('reads the complete HTML chapter past absent images, preserving blocks and headings and excluding hidden text', () => {
    const chapter = readFileSync(join(ROOT, 'epub/OEBPS/text/chapter01.xhtml'));
    const { title, paragraphs } = read(chapter, 'HTML');
    expect(title).toBe('第一章');
    expect(paragraphs).toEqual(CHAPTER_ONE);
    const navigation = read(readFileSync(join(ROOT, 'epub/OEBPS/nav.xhtml')), 'HTML').paragraphs;
    // The navigation document is a page of its own to the HTML reader: its lists read as one paragraph per item, the
    // landmarks hidden. (As part of the EPUB it is left out.)
    expect(navigation.map(([, lines]) => lines.join(''))).toEqual(
      ['目录', '前言', '第一卷', '第一章', '一、起风', '灯塔的第一盏灯', '第二章', '注释'],
    );
  });
});

describe('the synthetic ODT', () => {
  const document = treeArchive('odt');

  it('holds hundreds of styles, and names pictures and a thumbnail the archive does not hold', () => {
    const content = readFileSync(join(ROOT, 'odt/content.xml'), 'utf8');
    expect(content.match(/<style:style /gu)?.length).toBeGreaterThanOrEqual(360);
    const held = Object.keys(unzipSync(document));
    expect(held.some((name) => name.startsWith('Pictures/') || name.startsWith('Thumbnails/'))).toBe(false);
    expect(readFileSync(join(ROOT, 'odt/META-INF/manifest.xml'), 'utf8')).toContain('Pictures/image1.png');
  });

  it('reads headings, paragraphs, the table of contents and cells, and not hidden text of any style depth, notes, comments, frames or the page header', () => {
    expect(read(document, 'ODT')).toEqual({
      title: '合成样稿：港口与钟楼',
      paragraphs: [
        [undefined, ['合成样稿：港口与钟楼']],
        [undefined, ['目录']],
        [undefined, ['第一节　清晨\t1']],
        [undefined, ['一、钟声\t2']],
        ['Heading1', ['第一节　清晨']],
        [undefined, ['港口的钟楼在清晨敲了七下，雾还没有散。']],
        [undefined, ['她  走过码头，这句话没有被隐藏。看见一条合成链接。']],
        ['Heading2', ['一、钟声']],
        [undefined, ['钟声先到', '然后才是回响。']],
        [undefined, ['图片之后的字照常读。']],
        [undefined, ['备好缆绳']],
        [undefined, ['检查船舱']],
        [undefined, ['先看舱底']],
        [undefined, ['时辰']],
        [undefined, ['水位']],
        [undefined, ['正午']],
        [undefined, ['高']],
        [undefined, ['末尾的段落。']],
      ],
    });
  });
});

describe('the synthetic RTF', () => {
  const sample = Buffer.from(SYNTHETIC_RTF, 'latin1');

  it('names a picture field whose image is not in the file, and carries a stylesheet, a list table and tables of its own', () => {
    const text = sample.toString('latin1');
    expect(text).toContain('INCLUDEPICTURE "missing-image.png"');
    expect(text).toMatch(/\{\\\*\\listtable/u);
    expect(text).toMatch(/\{\\stylesheet/u);
  });

  it('reads headings, GBK and Unicode text, field results and table rows, excluding hidden runs, headers, footers, notes and pictures', () => {
    expect(read(sample, 'RTF')).toEqual({
      title: 'Synthetic RTF: Harbour and Bell Tower',
      paragraphs: [
        ['Heading1', ['First section']],
        [undefined, ['The bell tower of the synthetic harbour rang seven times at dawn, and the fog had not lifted.']],
        [undefined, ['She walked along the quay past boats, ropes and nets.']],
        [undefined, ['合成样稿：港口与钟楼。']],
        [undefined, ['港口的钟楼在清晨敲了七下，雾还没有散。']],
        ['Heading2', ['Second section']],
        [undefined, ['Visible text follows the hidden run.']],
        [undefined, ['a synthetic link and a picture field: that is absent from the file.']],
        [undefined, ['After the pictures.']],
        [undefined, ['First list item']],
        [undefined, ['Nested list item']],
        [undefined, ['Hour\tLevel']],
        [undefined, ['Noon\tHigh']],
        [undefined, ['Closing paragraph.']],
      ],
    });
  });
});
