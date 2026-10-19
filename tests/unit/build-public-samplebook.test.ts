import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveImportFidelityPlan, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

// Issue #989 (ADR 0091): the development-only generator of the four public-domain Public SampleBooks. Only its
// pure parts are exercised — manifest validation, extraction from synthetic MediaWiki-shaped HTML, and the
// deterministic DOCX — never the network or the committed works. Every text here is synthetic.

interface Block { readonly style: string | null; readonly text: string }
interface Section { readonly heading: string; readonly blocks: readonly Block[] }
interface Tally {
  readonly referenceMarkers: number; readonly otherVersionParagraphs: number; readonly referenceLists: number;
  readonly noteSections: number; readonly furniture: number;
}
type SampleBookTool = {
  readonly MANIFEST_FORMAT: string;
  readonly WIKISOURCE_API: string;
  readonly VARIANT: string;
  readonly NOTE_HEADING: RegExp;
  validateManifest(manifest: unknown, options?: { pinned?: boolean }): unknown;
  serializeManifest(manifest: unknown): string;
  parseHtml(html: string): unknown;
  paragraphLines(text: string): string[];
  extractSection(html: string, options?: { sectionTitle?: string; variantChoice?: string }): { heading: string; blocks: Block[]; notes: string[]; tally: Tally };
  checkDeclarations(section: Record<string, unknown>, extracted: { notes: readonly string[]; tally: { referenceMarkers: number } }): void;
  buildSampleBookDocx(work: { title: string; author: string; sections: readonly Section[] }): Uint8Array;
  fixedArchiveTime(): Date;
};

// @ts-expect-error tools/*.mjs carry no declarations; the tool is exercised as the plain module it is.
const tool = (await import('../../tools/build-public-samplebook.mjs')) as unknown as SampleBookTool;

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

function manifest(): Record<string, unknown> {
  return {
    format: tool.MANIFEST_FORMAT,
    designation: { issue: 989, adr: '0091' },
    source: { api: tool.WIKISOURCE_API, variant: tool.VARIANT },
    pinnedOn: '2026-10-19',
    works: [{
      id: 'synthetic-work',
      file: 'synthetic-work.docx',
      title: '合成书',
      author: '合成作者',
      sections: [
        { page: '合成书/第01回', revid: 101, transcludes: [] },
        { page: '合成书', section: 2, sectionTitle: '自序', revid: 102, transcludes: [{ page: 'Page:合成.pdf/3', revid: 103 }] },
      ],
    }],
  };
}

function output(inner: string): string {
  return `<div class="mw-content-ltr mw-parser-output" lang="zh-Hans" dir="ltr">${inner}</div>`;
}

const WS_HEADER =
  '<table class="ws-header"><tbody>' +
  '<tr><td><a href="/wiki/x" title="合成书">合成书</a></td><td><b>合成作者</b></td><td></td></tr>' +
  `<tr><td>上一回</td><td>第一回${IDEOGRAPHIC_SPACE}<b>合成回目上联${IDEOGRAPHIC_SPACE}合成回目下联</b></td><td><a href="/wiki/y">下一回▶</a></td></tr>` +
  '</tbody></table>';

const MODULE_HEADER =
  '<div id="headerContainer"><table><tbody><tr><td>←</td><td><a href="/wiki/a">前篇</a></td>' +
  '<td><b>合成篇名</b><br /><span>作者：</span><a href="/wiki/Author:x">合成作者</a></td><td><a href="/wiki/b">后篇</a></td><td class="noprint">→</td></tr>' +
  '</tbody></table></div>';

describe('the public SampleBook manifest', () => {
  it('accepts a pinned manifest and serializes each plain entry on one line', () => {
    const valid = manifest();
    expect(tool.validateManifest(valid)).toBe(valid);
    const text = tool.serializeManifest(valid);
    expect(text).toContain('{ "page": "合成书/第01回", "revid": 101, "transcludes": [] }');
    expect(text).toContain('{ "page": "Page:合成.pdf/3", "revid": 103 }');
    expect(JSON.parse(text)).toEqual(valid);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it.each([
    ['a foreign source', (m: any) => { m.source.api = 'https://example.org/w/api.php'; }],
    ['another variant', (m: any) => { m.source.variant = 'zh-hant'; }],
    ['a file not named after its id', (m: any) => { m.works[0].file = 'other.docx'; }],
    ['a non-ASCII id', (m: any) => { m.works[0].id = '合成'; }],
    ['an unpinned revision', (m: any) => { delete m.works[0].sections[0].revid; }],
    ['a section number without its title', (m: any) => { delete m.works[0].sections[1].sectionTitle; }],
    ['a transclusion outside the Page namespace', (m: any) => { m.works[0].sections[1].transcludes[0].page = 'Template:x'; }],
    ['a page listed twice', (m: any) => { m.works[0].sections.push({ ...m.works[0].sections[0] }); }],
    ['no pin date', (m: any) => { m.pinnedOn = null; }],
    ['an empty editorNotes list', (m: any) => { m.works[0].sections[0].editorNotes = []; }],
    ['an empty variantChoice', (m: any) => { m.works[0].sections[0].variantChoice = ''; }],
    ['a zero footnotes count', (m: any) => { m.works[0].sections[0].footnotes = 0; }],
  ])('refuses %s', (_label, mutate) => {
    const invalid = manifest();
    mutate(invalid);
    expect(() => tool.validateManifest(invalid)).toThrow(/^SAMPLEBOOK\/manifest-invalid/);
  });

  it('lets --pin validate entries whose revisions it is about to fill in', () => {
    const unpinned = manifest() as any;
    unpinned.pinnedOn = null;
    delete unpinned.works[0].sections[0].revid;
    delete unpinned.works[0].sections[0].transcludes;
    expect(() => tool.validateManifest(unpinned, { pinned: false })).not.toThrow();
  });
});

describe('extracting a pinned page', () => {
  it("takes a 回 novel's chapter line from ws-header and keeps only the original paragraphs", () => {
    const html = output(
      WS_HEADER +
      '<table class="ws-header"><tbody><tr><td></td></tr></tbody></table>' +
      '<dl><dd><dl><dd>合成开篇词上句。</dd><dd>合成开篇词下句。</dd></dl></dd></dl>' +
      `<p>${IDEOGRAPHIC_SPACE}${IDEOGRAPHIC_SPACE}合成正文第一段，<a href="/wiki/z">链接文字</a>照常保留。\n</p>` +
      '<p>&#160;&#160;合成正文第二段<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup>没有注码。</p>' +
      '<p class="mw-empty-elt"></p>' +
      '<table class="ws-noexport noprint ws-footer"><tbody><tr><td>上一回</td><td>下一回▶</td></tr></tbody></table>',
    );
    const { heading, blocks, tally } = tool.extractSection(html);
    expect(heading).toBe(`第一回${IDEOGRAPHIC_SPACE}合成回目上联${IDEOGRAPHIC_SPACE}合成回目下联`);
    expect(blocks).toEqual([
      { style: null, text: '合成开篇词上句。' },
      { style: null, text: '合成开篇词下句。' },
      { style: null, text: '合成正文第一段，链接文字照常保留。' },
      { style: null, text: '合成正文第二段没有注码。' },
    ]);
    expect(tally).toEqual({ referenceMarkers: 1, otherVersionParagraphs: 0, referenceLists: 0, noteSections: 0, furniture: 4 });
  });

  it("takes an essay's bold header title and drops the license box, the reference list and a 注释 section", () => {
    const html = output(
      MODULE_HEADER +
      '<p>合成散文一段。<br />合成散文另起一行。</p>' +
      '<div class="mw-heading mw-heading2"><h2 id="x">合成小节</h2><span class="mw-editsection">编辑</span></div>' +
      '<p>合成小节正文。</p>' +
      '<style>.licenseContainer{}</style><div class="licenseContainer licenseBanner"><p>公有领域说明。</p></div>' +
      '<ol class="references"><li><span class="reference-text">现代注释。</span></li></ol>' +
      '<div class="mw-heading mw-heading2"><h2 id="n">注释</h2></div>' +
      '<p>注释正文不属于原作。</p>',
    );
    const { heading, blocks, tally } = tool.extractSection(html);
    expect(heading).toBe('合成篇名');
    expect(blocks).toEqual([
      { style: null, text: '合成散文一段。' },
      { style: null, text: '合成散文另起一行。' },
      { style: 'Heading2', text: '合成小节' },
      { style: null, text: '合成小节正文。' },
    ]);
    expect(tally).toMatchObject({ referenceLists: 1, noteSections: 1 });
  });

  it('opens a numbered section with its pinned heading and descends into transcluded pages', () => {
    const html = output(
      '<div class="mw-heading mw-heading2"><h2 id="s">自序</h2></div>' +
      '<div class="prp-pages-output"><span class="pagenum ws-pagenum" id="290">[290]</span><p>合成序言一段。</p><p>合成序言二段。</p></div>',
    );
    const { heading, blocks } = tool.extractSection(html, { sectionTitle: '自序' });
    expect(heading).toBe('自序');
    expect(blocks.map((block) => block.text)).toEqual(['合成序言一段。', '合成序言二段。']);
    expect(() => tool.extractSection(html, { sectionTitle: '他序' })).toThrow(/^SAMPLEBOOK\/section-mismatch/);
  });

  it('drops images and 另作 notes, strips scan-page joins, and reads text standing among blocks as a paragraph', () => {
    const zeroWidthSpace = String.fromCharCode(0x200b);
    const html = output(
      `${MODULE_HEADER}\n合成开篇一句。\n` +
      '<p>合成<span class="variant-text">正文<span class="variant-tooltip">一作“异文”</span></span>一段。</p>' +
      '<figure class="mw-default-size"><a href="/wiki/File:x"><img src="x.png" /></a><figcaption></figcaption></figure>' +
      `<div class="prp-pages-output"><span><span class="pagenum ws-pagenum" id="7">${zeroWidthSpace}</span></span>\n合成扫描页正文。\n<p>合成扫描页${zeroWidthSpace}续文。</p></div>`,
    );
    const { blocks, notes, tally } = tool.extractSection(html);
    expect(blocks.map((block) => block.text)).toEqual(['合成开篇一句。', '合成正文一段。', '合成扫描页正文。', '合成扫描页续文。']);
    expect(notes).toEqual(['一作“异文”']);
    expect(tally).toMatchObject({ furniture: 2 });
  });

  it("keeps the declared edition's paragraph and drops compiler notes, glosses and the discussion link", () => {
    const html = output(
      WS_HEADER +
      '<p>合成正文<small><span>〈</span>(音:合)<span>〉</span></small>一段。</p>' +
      '<p><small><span>〈</span>(合成编者:　甲本版本)<span>〉</span></small>\n合成甲本结尾。</p>' +
      '<p><small><span>〈</span>(合成编者:　乙本版本)<span>〉</span></small>\n合成乙本结尾。</p>' +
      '<p><br />\n<a href="/wiki/Talk:x" title="Talk:合成书">Discuss</a></p>',
    );
    const kept = tool.extractSection(html, { variantChoice: '乙本版本' });
    expect(kept.blocks.map((block) => block.text)).toEqual(['合成正文一段。', '合成乙本结尾。']);
    expect(kept.notes).toEqual(['〈(音:合)〉', '〈(合成编者: 甲本版本)〉', '〈(合成编者: 乙本版本)〉']);
    expect(kept.tally).toMatchObject({ otherVersionParagraphs: 1 });
    expect(() => tool.extractSection(html)).toThrow(/^SAMPLEBOOK\/variant-choice-required/);
    expect(() => tool.extractSection(html, { variantChoice: '丙本版本' })).toThrow(/^SAMPLEBOOK\/variant-choice-unmatched/);
  });

  it('drops a body heading that only repeats the header title', () => {
    const html = output(`${MODULE_HEADER}<h2 id="t">合成篇名</h2><p>合成正文。</p><h2 id="u">合成小节</h2><p>合成小节正文。</p>`);
    expect(tool.extractSection(html).blocks.map((block) => block.style ?? block.text)).toEqual(['合成正文。', 'Heading2', '合成小节正文。']);
  });

  it('holds every dropped note and footnote marker to its manifest declaration', () => {
    const extracted = { notes: ['一作“异文”'], tally: { referenceMarkers: 2 } };
    expect(() => tool.checkDeclarations({ page: 'x', editorNotes: ['一作“异文”'], footnotes: 2 }, extracted)).not.toThrow();
    expect(() => tool.checkDeclarations({ page: 'x', footnotes: 2 }, extracted)).toThrow(/^SAMPLEBOOK\/notes-undeclared/);
    expect(() => tool.checkDeclarations({ page: 'x', editorNotes: ['一作“异文”'] }, extracted)).toThrow(/^SAMPLEBOOK\/notes-undeclared/);
    expect(() => tool.checkDeclarations({ page: 'x', editorNotes: ['一作“他文”'], footnotes: 2 }, extracted)).toThrow(/^SAMPLEBOOK\/notes-undeclared/);
  });

  it('refuses what its rules do not name instead of guessing', () => {
    expect(() => tool.extractSection(output(`${MODULE_HEADER}<ul><li>合成列表。</li></ul>`))).toThrow(/^SAMPLEBOOK\/unhandled-block/);
    expect(() => tool.extractSection(output(`${MODULE_HEADER}<p>合成<img src="x.png" />图。</p>`))).toThrow(/^SAMPLEBOOK\/unhandled-inline/);
    expect(() => tool.extractSection(output(`${MODULE_HEADER}<p>合成<b>未闭合</p>`))).toThrow(/^SAMPLEBOOK\/html-unbalanced/);
    expect(() => tool.extractSection(output('<p>没有页眉的正文。</p>'))).toThrow(/^SAMPLEBOOK\/title-absent/);
    expect(() => tool.extractSection(output(MODULE_HEADER))).toThrow(/^SAMPLEBOOK\/section-empty/);
    expect(() => tool.extractSection('<p>合成。</p>')).toThrow(/^SAMPLEBOOK\/output-absent/);
  });

  it('reads note headings by their opening words alone', () => {
    for (const title of ['注释', '註釋', '注解', '脚注', '参考文献', '校勘记']) expect(tool.NOTE_HEADING.test(title)).toBe(true);
    for (const title of ['自序', '第一章　序', '后记']) expect(tool.NOTE_HEADING.test(title)).toBe(false);
  });
});

describe('the SampleBook DOCX', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'ai7-public-samplebook-'));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  const work = {
    title: '合成书',
    author: '合成作者',
    sections: [
      { heading: '第一回　合成回目', blocks: [{ style: null, text: '合成正文<一>&二。' }, { style: 'Heading2', text: '合成小节' }, { style: null, text: '合成正文三。' }] },
      { heading: '第二回　合成回目', blocks: [{ style: null, text: '合成正文四。' }] },
    ],
  };

  it('carries the product archive time and the same bytes for the same input', () => {
    expect(tool.fixedArchiveTime().getTime()).toBe(fixedArchiveTime().getTime());
    expect(Buffer.from(tool.buildSampleBookDocx(work)).equals(Buffer.from(tool.buildSampleBookDocx(structuredClone(work))))).toBe(true);
  });

  it('imports through the ordinary parser as a title, headings and paragraphs with nothing to degrade', async () => {
    const path = join(sandbox, 'synthetic-work.docx');
    await writeFile(path, tool.buildSampleBookDocx(work));
    const blocks: ParsedDocxBlock[] = [];
    const parsed = await parseDocx(path, 'synthetic-work.docx', (block) => blocks.push(block));
    expect(blocks.map((block) => [block.kind, block.level, block.text])).toEqual([
      ['title', 1, '合成书'],
      ['heading', 1, '第一回　合成回目'],
      ['paragraph', null, '合成正文<一>&二。'],
      ['heading', 2, '合成小节'],
      ['paragraph', null, '合成正文三。'],
      ['heading', 1, '第二回　合成回目'],
      ['paragraph', null, '合成正文四。'],
    ]);
    expect(parsed.titleSuggestion).toEqual({ value: '合成书', sourceLabel: 'DOCX 标题元数据' });
    expect(parsed.fidelity.every((category) => category.count === 0)).toBe(true);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toBeDefined();
  });
});
