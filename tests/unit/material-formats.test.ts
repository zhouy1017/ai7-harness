import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  MATERIAL_FORMAT_BOUNDS,
  MATERIAL_FORMAT_CONVERTER_IDENTITIES,
  MaterialFormatRefusal,
  decodeHtmlReferences,
  extractMaterialFormatText,
  isMaterialTextFormat,
  type MaterialFormatBounds,
  type MaterialFormatRefusalReason,
  type MaterialTextFormat,
} from '../../src/service/material-formats.js';
import { MAX_ARCHIVE_BYTES } from '../../src/service/docx.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

// Unit suite (L1) for the Material Index's readers of HTML, EPUB, ODT and RTF (Issue #428, S80): the paragraphs and headings
// each reads, Chinese text in every encoding the formats carry it in, and the refusals — bombs, deep nesting, entity
// declarations, DRM and passwords, and text past its bound. Every text and file here is the suite's own synthetic words.

type Paragraphs = Array<[string | undefined, string[]]>;

/** An archive as every writer in the product writes one: at the fixed archive time (#611). */
const archive = (files: Zippable): Uint8Array => zipSync(files, { mtime: fixedArchiveTime() });

function read(content: string | Uint8Array, format: MaterialTextFormat, bounds?: MaterialFormatBounds): { title: string | null; paragraphs: Paragraphs } {
  const bytes = typeof content === 'string' ? strToU8(content) : content;
  const result = extractMaterialFormatText(bytes, format, bounds);
  return { title: result.title, paragraphs: result.paragraphs.map((paragraph) => [paragraph.style, paragraph.lines]) };
}

function refusal(content: string | Uint8Array, format: MaterialTextFormat, bounds?: MaterialFormatBounds): MaterialFormatRefusalReason | 'none' {
  try {
    extractMaterialFormatText(typeof content === 'string' ? strToU8(content) : content, format, bounds);
  } catch (error) {
    if (error instanceof MaterialFormatRefusal) return error.reason;
    throw error;
  }
  return 'none';
}

const small = (overrides: Partial<MaterialFormatBounds>): MaterialFormatBounds => ({ ...MATERIAL_FORMAT_BOUNDS, ...overrides });

describe('the four readers and their bounds', () => {
  it('names one converter per format, and keeps the DOCX parser\'s bounds', () => {
    expect(MATERIAL_FORMAT_CONVERTER_IDENTITIES).toEqual({ HTML: 'ai7-html-text/1', EPUB: 'ai7-epub-text/1', ODT: 'ai7-odt-text/1', RTF: 'ai7-rtf-text/1' });
    expect(['HTML', 'EPUB', 'ODT', 'RTF', 'DOCX', 'PDF', 'TXT'].map(isMaterialTextFormat)).toEqual([true, true, true, true, false, false, false]);
    // The DOCX parser's bounds (`docx.ts`), the archive's entry count raised for a book's many parts.
    expect(MATERIAL_FORMAT_BOUNDS).toEqual({
      entries: 4_096, entryBytes: 64 * 1024 * 1024, expandedBytes: 96 * 1024 * 1024, ratio: 2_000, depth: 128,
      markupCodeUnits: 32_768, textCodeUnits: 10_000_000, paragraphs: 100_000,
    });
    expect(MAX_ARCHIVE_BYTES).toBe(64 * 1024 * 1024);
  });
});

describe('HTML', () => {
  it('reads paragraphs and headings a reader of the page sees, without scripts, styles or comments', () => {
    const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>春日 &amp; 河流</title>
<style>p { color: red } </p></style><script>document.write("<p>不该读到</p>")</script></head>
<body>
<!-- 一段注释 <p>也不读</p> -->
<h1>第一章　春</h1>
<p>她推开窗。风从<b>河上</b>吹来，带着潮湿的气味！</p>
<div>外层<div>内层文字</div>收尾</div>
<ul><li>第一项<li>第二项</ul>
<p>第一行<br>第二行<br><br>换段之后</p>
<pre>  保留
    换行</pre>
<h3 class="x" data-note='a > b'>小节&nbsp;标题</h3>
<p>实体：&#x4E2D;&#25991; &mdash; &copy &unknown; &lt;b&gt;
<p>没有闭合的段落
<noscript><p>请启用脚本</p></noscript><template><p>模板</p></template><svg><title>图</title><text>图中字</text></svg>
</body></html>`;
    const { title, paragraphs } = read(page, 'HTML');
    expect(title).toBe('春日 & 河流');
    expect(paragraphs).toEqual([
      ['Heading1', ['第一章　春']],
      [undefined, ['她推开窗。风从河上吹来，带着潮湿的气味！']],
      [undefined, ['外层']],
      [undefined, ['内层文字']],
      [undefined, ['收尾']],
      [undefined, ['第一项']],
      [undefined, ['第二项']],
      [undefined, ['第一行', '第二行']],
      [undefined, ['换段之后']],
      [undefined, ['保留', '换行']],
      ['Heading3', ['小节\u00a0标题']],
      [undefined, ['实体：中文 — © &unknown; <b>']],
      [undefined, ['没有闭合的段落']],
    ]);
  });

  it('decodes character references without ever expanding an unknown one', () => {
    expect(decodeHtmlReferences('&#20013;&#x6587;&#0;&#xD800;&#x110000;&nbsp&nbsp;&mdash&hellip;&amp;amp;')).toBe('中文\ufffd\ufffd\ufffd\u00a0\u00a0&mdash…&amp;');
  });

  it('reads the encoding the page declares, GBK included', () => {
    // 「中文」 in GBK, under a page that declares it.
    const head = strToU8('<html><head><meta http-equiv="Content-Type" content="text/html; charset=gbk"></head><body><p>');
    const gbk = Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4);
    const tail = strToU8('</p></body></html>');
    expect(read(Uint8Array.from([...head, ...gbk, ...tail]), 'HTML').paragraphs).toEqual([[undefined, ['中文']]]);
    // A byte-order mark decides over any declaration.
    expect(read(Uint8Array.from([0xef, 0xbb, 0xbf, ...strToU8('<meta charset="gbk"><p>中文</p>')]), 'HTML').paragraphs).toEqual([[undefined, ['中文']]]);
    expect(refusal(Uint8Array.from([...strToU8('<p>'), 0xff, 0xfe, 0xfd]), 'HTML')).toBe('unreadable');
    expect(refusal('<meta charset="x-no-such-charset"><p>字</p>', 'HTML')).toBe('unreadable');
  });

  it('refuses entity declarations and internal DTD subsets, and lets a DOCTYPE that only names a DTD pass unfetched', () => {
    expect(refusal('<!DOCTYPE html [<!ENTITY xxe SYSTEM "file:///etc/hosts">]><html><body><p>&xxe;</p></body></html>', 'HTML')).toBe('external-entity');
    expect(refusal('<html><!ENTITY a "b"><body><p>字</p></body></html>', 'HTML')).toBe('external-entity');
    expect(read('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html><body><p>字&xxe;</p></body></html>', 'HTML').paragraphs)
      .toEqual([[undefined, ['字&xxe;']]]);
  });

  it('refuses nesting, a tag and text past their bounds, and a page with no text', () => {
    const nested = (depth: number): string => `<html><body>${'<span>'.repeat(depth)}字${'</span>'.repeat(depth)}</body></html>`;
    // html and body are two of the open elements.
    expect(refusal(nested(MATERIAL_FORMAT_BOUNDS.depth - 2), 'HTML')).toBe('none');
    expect(refusal(nested(MATERIAL_FORMAT_BOUNDS.depth - 1), 'HTML')).toBe('over-bound');
    // A tag of L code units is within the bound while L - 1 <= markupCodeUnits: `<p title="` is 10 of them and `">` 2.
    expect(refusal(`<p title="${'长'.repeat(MATERIAL_FORMAT_BOUNDS.markupCodeUnits - 10)}">字</p>`, 'HTML')).toBe('over-bound');
    expect(refusal(`<p title="${'长'.repeat(MATERIAL_FORMAT_BOUNDS.markupCodeUnits - 11)}">字</p>`, 'HTML')).toBe('none');
    expect(refusal(`<!DOCTYPE ${'x'.repeat(MATERIAL_FORMAT_BOUNDS.markupCodeUnits)}><p>字</p>`, 'HTML')).toBe('over-bound');
    expect(refusal('<p>一二三四五</p>', 'HTML', small({ textCodeUnits: 4 }))).toBe('over-bound');
    expect(refusal('<p>一二三四</p>', 'HTML', small({ textCodeUnits: 4 }))).toBe('none');
    expect(refusal('<p>一</p><p>二</p><p>三</p>', 'HTML', small({ paragraphs: 2 }))).toBe('over-bound');
    expect(refusal('<p>一</p><p>二</p>', 'HTML', small({ paragraphs: 2 }))).toBe('none');
    expect(refusal('<html><body><script>var a = "<p>字</p>";</script>   </body></html>', 'HTML')).toBe('empty');
  });

  it('keeps text that XML cannot carry out of the paragraphs', () => {
    expect(read('<p>甲\u0001乙\uFFFE丙\ud800丁</p>', 'HTML').paragraphs).toEqual([[undefined, ['甲乙丙\ufffd丁']]]);
  });
});

// ---- the archive formats --------------------------------------------------------------------------------------------

function epub(parts: Record<string, string | Uint8Array>, options: { container?: string; packagePath?: string } = {}): Uint8Array {
  const packagePath = options.packagePath ?? 'OEBPS/content.opf';
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(options.container ?? `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${packagePath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
  };
  for (const [name, content] of Object.entries(parts)) files[name] = typeof content === 'string' ? strToU8(content) : content;
  return archive(files);
}

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">synthetic</dc:identifier><dc:title>  合成 的
  样书 </dc:title></metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml#start" media-type="application/xhtml+xml"/>
    <item id="img" href="images/a.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine><itemref idref="nav"/><itemref idref="c2"/><itemref idref="c1"/><itemref idref="missing"/><itemref idref="css"/></spine>
</package>`;

const chapter = (body: string, head = '<title>章</title>'): string => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head>${head}</head><body>${body}</body></html>`;

const BOOK = {
  'OEBPS/content.opf': OPF,
  'OEBPS/nav.xhtml': chapter('<nav epub:type="toc"><ol><li>目录不读</li></ol></nav>'),
  'OEBPS/text/ch 1.xhtml': chapter('<h2>第二章</h2><p>后面的一章，&nbsp;放在书脊第二位。</p><p><![CDATA[a & b < c]]></p>'),
  'OEBPS/text/ch2.xhtml': chapter('<h1>第一章</h1><section><p>书脊里的第一章。</p><p>第二段<br/>换行</p></section>'),
  'OEBPS/images/a.png': Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
  'OEBPS/style.css': 'p { margin: 0 }',
};

/** Where the archive's end-of-central-directory record starts. */
function directoryEnd(archive: Uint8Array): number {
  for (let at = archive.length - 22; at >= 0; at -= 1) {
    if (archive[at] === 0x50 && archive[at + 1] === 0x4b && archive[at + 2] === 0x05 && archive[at + 3] === 0x06) return at;
  }
  throw new Error('no directory');
}

/** The archive with every local header and directory record of `name` claiming `size` expanded bytes: a lie the stream must catch. */
function understated(archive: Uint8Array, name: string, size: number): Uint8Array {
  const copy = archive.slice();
  const encoded = strToU8(name);
  const write = (at: number): void => {
    copy[at] = size & 0xff;
    copy[at + 1] = (size >>> 8) & 0xff;
    copy[at + 2] = (size >>> 16) & 0xff;
    copy[at + 3] = (size >>> 24) & 0xff;
  };
  const named = (at: number): boolean => encoded.every((byte, index) => copy[at + index] === byte);
  for (let at = 0; at + 46 < copy.length; at += 1) {
    if (copy[at] !== 0x50 || copy[at + 1] !== 0x4b) continue;
    if (copy[at + 2] === 0x03 && copy[at + 3] === 0x04 && named(at + 30)) write(at + 22);
    if (copy[at + 2] === 0x01 && copy[at + 3] === 0x02 && named(at + 46)) write(at + 24);
  }
  return copy;
}

/** The archive whose end record names `count` entries, whatever it holds. */
function undercounted(archive: Uint8Array, count: number): Uint8Array {
  const copy = archive.slice();
  const end = directoryEnd(copy);
  copy[end + 8] = count;
  copy[end + 9] = 0;
  copy[end + 10] = count;
  copy[end + 11] = 0;
  return copy;
}

/** The archive with general-purpose flag bit 0 (encrypted) set on its first central directory record. */
function withEncryptedEntry(archive: Uint8Array): Uint8Array {
  const copy = archive.slice();
  const end = directoryEnd(copy);
  const offset = copy[end + 16]! | (copy[end + 17]! << 8) | (copy[end + 18]! << 16) | (copy[end + 19]! << 24);
  copy[offset + 8] = copy[offset + 8]! | 1;
  return copy;
}

describe('EPUB', () => {
  it('reads its chapters in spine order, without the navigation document, with the book\'s own title', () => {
    expect(read(epub(BOOK), 'EPUB')).toEqual({
      title: '合成 的 样书',
      paragraphs: [
        ['Heading1', ['第一章']],
        [undefined, ['书脊里的第一章。']],
        [undefined, ['第二段', '换行']],
        ['Heading2', ['第二章']],
        [undefined, ['后面的一章，\u00a0放在书脊第二位。']],
        [undefined, ['a & b < c']],
      ],
    });
  });

  it('refuses DRM and encryption, and lets font obfuscation alone pass', () => {
    expect(refusal(epub({ ...BOOK, 'META-INF/rights.xml': '<rights/>' }), 'EPUB')).toBe('encrypted');
    expect(refusal(epub({ ...BOOK, 'META-INF/sinf.xml': '<sinf/>' }), 'EPUB')).toBe('encrypted');
    const encryption = (algorithm: string): string => `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="OEBPS/text/ch2.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`;
    expect(refusal(epub({ ...BOOK, 'META-INF/encryption.xml': encryption('http://www.w3.org/2001/04/xmlenc#aes128-cbc') }), 'EPUB')).toBe('encrypted');
    expect(refusal(epub({ ...BOOK, 'META-INF/encryption.xml': encryption('http://www.idpf.org/2008/embedding') }), 'EPUB')).toBe('none');
    expect(refusal(withEncryptedEntry(epub(BOOK)), 'EPUB')).toBe('encrypted');
  });

  it('refuses entity declarations in a chapter or a package part, never expanding one', () => {
    const xxe = chapter('<p>&xxe;</p>').replace('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
      '<!DOCTYPE html [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]>');
    expect(refusal(epub({ ...BOOK, 'OEBPS/text/ch2.xhtml': xxe }), 'EPUB')).toBe('external-entity');
    expect(refusal(epub({ ...BOOK, 'OEBPS/content.opf': OPF.replace('<package', '<!DOCTYPE package [<!ENTITY t "x">]><package') }), 'EPUB')).toBe('external-entity');
    // A billion laughs in the container is refused before any entity is read.
    const laughs = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><container>&lol2;</container>';
    expect(refusal(epub(BOOK, { container: laughs }), 'EPUB')).toBe('external-entity');
  });

  it('refuses a bomb, too many entries, an entry past its bound, deep nesting and a name that leaves the archive', () => {
    const zeros = new Uint8Array(2 * 1024 * 1024);
    expect(refusal(epub({ ...BOOK, 'OEBPS/images/bomb.png': zeros }), 'EPUB', small({ entryBytes: 1024 * 1024 }))).toBe('over-bound');
    expect(refusal(epub({ ...BOOK, 'OEBPS/images/bomb.png': zeros }), 'EPUB', small({ expandedBytes: 1024 * 1024 }))).toBe('over-bound');
    expect(refusal(epub({ ...BOOK, 'OEBPS/images/bomb.png': zeros }), 'EPUB', small({ ratio: 10 }))).toBe('over-bound');
    expect(refusal(epub({ ...BOOK, 'OEBPS/images/bomb.png': zeros }), 'EPUB')).toBe('none');
    // An entry whose headers understate what it expands to is held to its bound as it expands, not as it claims.
    const lying = understated(epub({ ...BOOK, 'OEBPS/images/bomb.png': zeros }), 'OEBPS/images/bomb.png', 1_000);
    expect(refusal(lying, 'EPUB', small({ entryBytes: 1024 * 1024 }))).toBe('over-bound');
    expect(refusal(lying, 'EPUB', small({ entryBytes: 4 * 1024 * 1024 }))).toBe('none');
    // One whose headers claim more than the bound is refused before anything of it is expanded.
    expect(refusal(understated(epub(BOOK), 'OEBPS/style.css', 2 * 1024 * 1024), 'EPUB', small({ entryBytes: 1024 * 1024 }))).toBe('over-bound');
    const many: Record<string, string | Uint8Array> = { ...BOOK };
    for (let index = 0; index < 8; index += 1) many[`OEBPS/extra-${index}.txt`] = '多';
    expect(refusal(epub(many), 'EPUB', small({ entries: 10 }))).toBe('over-bound');
    expect(refusal(epub(many), 'EPUB', small({ entries: 16 }))).toBe('none');
    // A directory that names fewer entries than the archive holds: the entries are counted as they stream.
    expect(refusal(undercounted(epub(many), 2), 'EPUB', small({ entries: 10 }))).toBe('over-bound');
    expect(refusal(undercounted(epub(many), 2), 'EPUB', small({ entries: 16 }))).toBe('none');
    // A directory that names more than the bound is refused before anything is expanded, before its records are read.
    expect(refusal(undercounted(epub(BOOK), 20), 'EPUB', small({ entries: 10 }))).toBe('over-bound');
    const deep = chapter(`${'<div>'.repeat(130)}深${'</div>'.repeat(130)}`);
    expect(refusal(epub({ ...BOOK, 'OEBPS/text/ch2.xhtml': deep }), 'EPUB')).toBe('over-bound');
    const deepPackage = OPF.replace('<metadata', `${'<x>'.repeat(130)}${'</x>'.repeat(130)}<metadata`);
    expect(refusal(epub({ ...BOOK, 'OEBPS/content.opf': deepPackage }), 'EPUB')).toBe('over-bound');
    expect(refusal(epub({ ...BOOK, '../outside.xhtml': '<p>外</p>' }), 'EPUB')).toBe('unreadable');
    expect(refusal(epub({ 'OEBPS/content.opf': OPF }), 'EPUB')).toBe('empty');
    expect(refusal(epub(BOOK, { packagePath: 'OEBPS/missing.opf' }), 'EPUB')).toBe('unreadable');
    expect(refusal(strToU8('PK\u0003\u0004 not an archive'), 'EPUB')).toBe('unreadable');
  });
});

const ODT_CONTENT = (body: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">
  <office:automatic-styles><text:p>样式里的字不读</text:p></office:automatic-styles>
  <office:body><office:text>${body}</office:text></office:body>
</office:document-content>`;

function odt(body: string, extra: Record<string, string> = {}): Uint8Array {
  return archive({
    mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
    'content.xml': strToU8(ODT_CONTENT(body)),
    'meta.xml': strToU8(`<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><office:meta><dc:title>开放文档</dc:title></office:meta></office:document-meta>`),
    'META-INF/manifest.xml': strToU8(extra['META-INF/manifest.xml'] ?? '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>'),
    ...Object.fromEntries(Object.entries(extra).filter(([name]) => name !== 'META-INF/manifest.xml').map(([name, value]) => [name, strToU8(value)])),
  });
}

describe('ODT', () => {
  it('reads headings by outline level and paragraphs, with their spaces, tabs and line breaks, and not notes, comments or frames', () => {
    const body = `
<text:h text:outline-level="2">第一节</text:h>
<text:p>她<text:span>推开</text:span>窗。<text:s text:c="3"/>风<text:tab/>来了<text:line-break/>第二行<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>脚注不读</text:p></text:note-body></text:note></text:p>
<text:p><office:annotation><text:p>批注不读</text:p></office:annotation>正文<draw:frame><draw:text-box><text:p>框里不读</text:p></draw:text-box></draw:frame>继续</text:p>
<text:list><text:list-item><text:p>列表一</text:p></text:list-item><text:list-item><text:list><text:list-item><text:p>嵌套</text:p></text:list-item></text:list></text:list-item></text:list>
<table:table><table:table-row><table:table-cell><text:p>单元格</text:p></table:table-cell></table:table-row></table:table>
<text:tracked-changes><text:changed-region><text:deletion><text:p>删掉的</text:p></text:deletion></text:changed-region></text:tracked-changes>
<text:h text:outline-level="9">深标题</text:h>
<text:p>   </text:p>`;
    expect(read(odt(body), 'ODT')).toEqual({
      title: '开放文档',
      paragraphs: [
        ['Heading2', ['第一节']],
        [undefined, ['她推开窗。   风\t来了', '第二行']],
        [undefined, ['正文继续']],
        [undefined, ['列表一']],
        [undefined, ['嵌套']],
        [undefined, ['单元格']],
        ['Heading6', ['深标题']],
      ],
    });
  });

  it('refuses a password, a DTD, deep nesting and a file without content', () => {
    const encrypted = '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"><manifest:encryption-data manifest:checksum="x"/></manifest:file-entry></manifest:manifest>';
    expect(refusal(odt('<text:p>字</text:p>', { 'META-INF/manifest.xml': encrypted }), 'ODT')).toBe('encrypted');
    const withDoctype = archive({
      mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
      'content.xml': strToU8(ODT_CONTENT('<text:p>&x;</text:p>').replace('<office:document-content', '<!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><office:document-content')),
    });
    expect(refusal(withDoctype, 'ODT')).toBe('external-entity');
    const deep = `${'<text:span>'.repeat(130)}深${'</text:span>'.repeat(130)}`;
    expect(refusal(odt(`<text:p>${deep}</text:p>`), 'ODT')).toBe('over-bound');
    // document-content, body, text and p are four of the open elements: 124 spans reach the bound exactly.
    const spans = (count: number): string => `<text:p>${'<text:span>'.repeat(count)}浅${'</text:span>'.repeat(count)}</text:p>`;
    expect(refusal(odt(spans(MATERIAL_FORMAT_BOUNDS.depth - 4)), 'ODT')).toBe('none');
    expect(refusal(odt(spans(MATERIAL_FORMAT_BOUNDS.depth - 3)), 'ODT')).toBe('over-bound');
    expect(refusal(archive({ mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }] }), 'ODT')).toBe('unreadable');
    expect(refusal(odt('<text:p>  </text:p>'), 'ODT')).toBe('empty');
    expect(refusal(odt(`<text:p>${'字'.repeat(20)}</text:p>`), 'ODT', small({ textCodeUnits: 10 }))).toBe('over-bound');
    expect(refusal(odt('<text:p>unclosed'), 'ODT')).toBe('unreadable');
  });
});

describe('RTF', () => {
  it('reads Unicode escapes with their stand-ins passed over, GBK bytes by the font\'s charset, headings, lines and the title', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0
{\fonttbl{\f0\fswiss\fcharset0 Arial;}{\f1\fnil\fcharset134 \'cb\'ce\'cc\'e5;}}
{\colortbl;\red0\green0\blue0;}
{\stylesheet{\s1 heading 1;}}
{\info{\title \u21512?\u25104? Title}{\author Someone}}
{\*\generator Synthetic;}
\pard\s1\outlinelevel0\f1 \'b5\'da\'d2\'bb\'d5\'c2\par
\pard\plain\f0\uc1 \u22905?\u25512?\u24320?\u31383?\u12290? Caf\'e9 \{braces\} \\ back\line second line\par
{\uc2 \u20013\'d6\'d0\u25991\'ce\'c4}{\v hidden text}\par
{\field{\*\fldinst HYPERLINK "http://example.invalid"}{\fldrslt link text}}\tab after\par
{\footnote footnote text}{\header header text}{\pict\wmetafile8 0102}{\*\unknowndest skipped}\par
\u-10179?\u-8704?\par
{\upr{ansi version}{\*\ud{unicode version}}}\par
\bin3 {\}x tail\par
\cell a\cell b\row
\'b5\'da\par}trailing after the document`;
    expect(read(rtf, 'RTF')).toEqual({
      title: '合成 Title',
      paragraphs: [
        ['Heading1', ['第一章']],
        [undefined, ['她推开窗。 Café {braces} \\ back', 'second line']],
        [undefined, ['中文']],
        [undefined, ['link text\tafter']],
        [undefined, ['😀']],
        [undefined, ['unicode version']],
        [undefined, ['x tail']],
        [undefined, ['a\tb']],
        [undefined, ['µÚ']],
      ],
    });
  });

  it('reads the document\'s ANSI code page when the font names none, GB2312 as GBK', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg936{\fonttbl{\f0\fnil SimSun;}}\f0 \'d6\'d0\'ce\'c4\'a3\'ac\'ba\'c3\'a1\'a3\par}`;
    expect(read(rtf, 'RTF').paragraphs).toEqual([[undefined, ['中文，好。']]]);
    expect(read(String.raw`{\rtf1\ansi\ansicpg20936 \'d6\'d0\par}`, 'RTF').paragraphs).toEqual([[undefined, ['中']]]);
    // Raw 8-bit bytes are read in the code page too.
    expect(read(Uint8Array.from([...strToU8('{\\rtf1\\ansi\\ansicpg936 '), 0xd6, 0xd0, ...strToU8('\\par}')]), 'RTF').paragraphs).toEqual([[undefined, ['中']]]);
  });

  it('refuses a code page it cannot decode, nesting past its bound, binary data past the file, and what is not RTF', () => {
    expect(refusal(String.raw`{\rtf1\ansi\ansicpg99999 \'d6\'d0\par}`, 'RTF')).toBe('unreadable');
    const nested = (depth: number): string => `{\\rtf1 ${'{'.repeat(depth)}深${'}'.repeat(depth)}\\par}`;
    expect(refusal(nested(MATERIAL_FORMAT_BOUNDS.depth - 1), 'RTF')).toBe('none');
    expect(refusal(nested(MATERIAL_FORMAT_BOUNDS.depth), 'RTF')).toBe('over-bound');
    expect(refusal(String.raw`{\rtf1 \bin999 abc}`, 'RTF')).toBe('unreadable');
    expect(refusal(`{\\rtf1 \\${'a'.repeat(40)} x}`, 'RTF')).toBe('unreadable');
    expect(refusal('plain text', 'RTF')).toBe('unreadable');
    expect(refusal(String.raw`{\rtf1{\fonttbl{\f0 Arial;}}{\info{\title only a title}}}`, 'RTF')).toBe('empty');
    expect(refusal(`{\\rtf1 ${'字'.repeat(20)}\\par}`, 'RTF', small({ textCodeUnits: 10 }))).toBe('over-bound');
  });
});

// ---- #761 review ----------------------------------------------------------------------------------------------------

/** How long reading takes, in milliseconds. */
function timed(read: () => unknown): number {
  const start = performance.now();
  read();
  return performance.now() - start;
}

describe('what the review of #761 found', () => {
  it('reads a run of line breaks in time linear in it, with or without white space between them (P1-1)', () => {
    const breaks = 200_000;
    expect(read(`<p>${'<br>'.repeat(breaks)}x</p>`, 'HTML').paragraphs).toEqual([[undefined, ['x']]]);
    expect(timed(() => read(`<p>${'<br>'.repeat(breaks)}x</p>`, 'HTML'))).toBeLessThan(1_000);
    expect(timed(() => read(`<p>${'<br> \n'.repeat(breaks)}x</p>`, 'HTML'))).toBeLessThan(1_000);
    expect(timed(() => read(`<div>甲${'<br/>'.repeat(breaks)}乙</div>`, 'HTML'))).toBeLessThan(1_000);
    // The ODT and RTF line breaks share the paragraphs' rule: a break after an empty line adds nothing.
    expect(timed(() => read(odt(`<text:p>${'<text:line-break/>'.repeat(breaks)}x</text:p>`), 'ODT'))).toBeLessThan(1_000);
    expect(timed(() => read(`{\\rtf1 ${'\\line '.repeat(breaks)}x\\par}`, 'RTF'))).toBeLessThan(1_000);
  });

  it('parts paragraphs at a run of line breaks, and at each line break straight in body or a div (P3-4)', () => {
    expect(read('<html><body>第一段<br>第二段<br />第三段</body></html>', 'HTML').paragraphs)
      .toEqual([[undefined, ['第一段']], [undefined, ['第二段']], [undefined, ['第三段']]]);
    expect(read('<div><span>甲</span><br>乙<br><br><br>丙</div>', 'HTML').paragraphs)
      .toEqual([[undefined, ['甲']], [undefined, ['乙']], [undefined, ['丙']]]);
    // Inside a paragraph, a list item or a cell, one line break breaks a line of the same paragraph; two part it.
    expect(read('<p>一行<br>二行<br><br>新段</p><ul><li>项<br>续</li></ul><table><tr><td>格<br>续</td></tr></table>', 'HTML').paragraphs)
      .toEqual([[undefined, ['一行', '二行']], [undefined, ['新段']], [undefined, ['项', '续']], [undefined, ['格', '续']]]);
    // A converted web novel whose chapter is one div of lines no longer crosses the paragraph bound as one paragraph.
    const lines = Array.from({ length: 400 }, (_, index) => `第${index}行的文字，长短不一。`).join('<br>\n');
    expect(read(`<html><body><div id="content">${lines}</div></body></html>`, 'HTML').paragraphs).toHaveLength(400);
  });

  it('reads each chapter once however often the spine or the manifest names it (P1-2)', () => {
    const markup = chapter(`${'<span></span>'.repeat(80_000)}<p>只读一次。</p>`);
    const repeated = OPF
      .replace('<item id="c1"', '<item id="again" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="c1"')
      .replace('<spine>', `<spine>${'<itemref idref="c2"/><itemref idref="again"/>'.repeat(1_000)}`);
    const book = epub({ ...BOOK, 'OEBPS/content.opf': repeated, 'OEBPS/text/ch2.xhtml': markup });
    expect(read(book, 'EPUB').paragraphs.filter(([, lines]) => lines[0] === '只读一次。')).toHaveLength(1);
    expect(timed(() => read(book, 'EPUB'))).toBeLessThan(2_000);
  });

  it('reads `./x` and `a//b` as the paths they mean, and still refuses an absolute or backslashed one (P3-3)', () => {
    const odd = epub({
      './OEBPS//content.opf': OPF,
      'OEBPS/./text/ch2.xhtml': BOOK['OEBPS/text/ch2.xhtml'],
      'OEBPS/text//ch 1.xhtml': BOOK['OEBPS/text/ch 1.xhtml'],
    }, { packagePath: './OEBPS//content.opf' });
    expect(read(odd, 'EPUB').paragraphs.map(([, lines]) => lines[0])).toEqual(['第一章', '书脊里的第一章。', '第二段', '第二章', '后面的一章，\u00a0放在书脊第二位。', 'a & b < c']);
    expect(refusal(epub({ ...BOOK, '/absolute.xhtml': '<p>外</p>' }), 'EPUB')).toBe('unreadable');
    expect(refusal(epub({ ...BOOK, 'OEBPS\\back.xhtml': '<p>外</p>' }), 'EPUB')).toBe('unreadable');
    expect(refusal(epub({ ...BOOK, 'OEBPS/../../up.xhtml': '<p>外</p>' }), 'EPUB')).toBe('unreadable');
    expect(refusal(epub(BOOK, { packagePath: '../content.opf' }), 'EPUB')).toBe('unreadable');
    // Two names that mean one path are one entry twice.
    expect(refusal(epub({ ...BOOK, 'OEBPS/./content.opf': OPF }), 'EPUB')).toBe('unreadable');
  });

  it('does not read hidden text: HTML `hidden` and `display: none`, ODT hidden text, paragraphs and sections (P3-1)', () => {
    expect(read('<p>看得见</p><p hidden>藏起来</p><div style="color: red; display:none !important"><p>也藏</p></div>' +
      '<p style="color: red">红字</p><p title="hidden">标题叫 hidden</p><span hidden="">行内藏</span>', 'HTML').paragraphs)
      .toEqual([[undefined, ['看得见']], [undefined, ['红字']], [undefined, ['标题叫 hidden']]]);
    expect(read(odt('<text:p>可见<text:hidden-text text:condition="ooow:true" text:string-value="藏">藏</text:hidden-text>的字</text:p>' +
      '<text:p><text:hidden-paragraph text:condition="ooow:true" text:is-hidden="true"/>整段藏起来</text:p>' +
      '<text:p><text:hidden-paragraph text:condition="ooow:false" text:is-hidden="false"/>这段显示</text:p>' +
      '<text:section text:name="s" text:display="none"><text:p>节藏起来</text:p></text:section>' +
      '<text:section text:name="t"><text:p>节显示</text:p></text:section>'), 'ODT').paragraphs)
      .toEqual([[undefined, ['可见的字']], [undefined, ['这段显示']], [undefined, ['节显示']]]);
  });

  it('decodes numeric references with any leading zeros, windows-1252 for 128 to 159, and drops C1 controls (P3-2)', () => {
    expect(decodeHtmlReferences('&#0000000065;&#x000000004E2D;&#128;&#150;&#x9F;&#99999999999;&#x0000000000000000110000;'))
      .toBe('A中€–Ÿ\uFFFD\uFFFD');
    expect(read('<p>甲&#129;乙&#x8D;丙&#133;</p>', 'HTML').paragraphs).toEqual([[undefined, ['甲乙丙…']]]);
  });

  it('reads an RTF `\\ud` only as the alternative of an `\\upr`, and never a tracked deletion (P2-1, P2-2)', () => {
    // The fixture's own characters are UTF-8 bytes, read under that code page.
    const rtf = String.raw`{\rtf1\ansi\ansicpg65001 正文{\header {\*\ud{页眉密文}}}{\footnote {\*\ud{脚注密文}}}{\field{\*\fldinst {\*\ud{域代码密文}}}{\fldrslt 域结果}}` +
      String.raw`{\upr{旧}{乙 {\*\ud{嵌套密文}}}{\*\ud{新}}}\par` +
      String.raw`甲{\deleted 删掉的}乙\deleted 也删\deleted0 丙{\deleted\plain 回来了}\par}`;
    expect(read(rtf, 'RTF').paragraphs).toEqual([[undefined, ['正文域结果新']], [undefined, ['甲乙丙回来了']]]);
  });
});
