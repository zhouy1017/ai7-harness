import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCleanTracerFidelity, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import {
  TEXT_CONVERTER_IDENTITY,
  convertTextManuscript,
  isTextConversionRefusal,
  type ConversionLoss,
  type ConvertibleSourceFormat,
} from '../../src/service/text-manuscript.js';

// Every input here is a synthetic string authored for this suite: the subject is the conversion —
// blocks, line breaks, heading markers, and which Markdown constructs survive as literal text — and
// no manuscript content would say anything about it that these strings do not.

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-text-test-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

const encoder = new TextEncoder();

function convert(text: string | Uint8Array, format: ConvertibleSourceFormat = 'TXT'): ReturnType<typeof convertTextManuscript> {
  return convertTextManuscript(typeof text === 'string' ? encoder.encode(text) : text, { format });
}

/** Read the working representation back through the product's own DOCX parser. */
async function parseConverted(
  text: string,
  format: ConvertibleSourceFormat = 'TXT',
): Promise<{ blocks: ParsedDocxBlock[]; parsed: Awaited<ReturnType<typeof parseDocx>>; loss: ConversionLoss }> {
  const { docx, loss } = convert(text, format);
  const path = join(sandbox, 'working.docx');
  await writeFile(path, docx);
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, '合成稿件.txt', (block) => blocks.push(block), undefined, { formatIdentified: true });
  return { blocks, parsed, loss };
}

function shape(blocks: readonly ParsedDocxBlock[]): Array<{ kind: string; level: number | null; text: string }> {
  return blocks.map((block) => ({ kind: block.kind, level: block.level, text: block.text }));
}

const NO_LOSS: ConversionLoss = {
  inlineStyles: 0,
  commentsRevisions: 0,
  notes: 0,
  tables: 0,
  imagesCaptions: 0,
  sections: 0,
  headersFooters: 0,
};

describe('convertTextManuscript', () => {
  it('declares the identity the records name it by', () => {
    expect(TEXT_CONVERTER_IDENTITY).toBe('ai7-text-to-docx/1');
  });

  it('makes one paragraph per blank-line-separated block', async () => {
    const { blocks, loss } = await parseConverted('第一段。\n\n第二段。\n\n\n第三段。\n');
    expect(shape(blocks)).toEqual([
      { kind: 'paragraph', level: null, text: '第一段。' },
      { kind: 'paragraph', level: null, text: '第二段。' },
      { kind: 'paragraph', level: null, text: '第三段。' },
    ]);
    expect(loss).toEqual(NO_LOSS);
  });

  it('keeps a single newline inside a block as a hard line break, never a space', async () => {
    const { blocks } = await parseConverted('第一行\n第二行\n第三行\n\n另一段\n');
    expect(shape(blocks)).toEqual([
      { kind: 'paragraph', level: null, text: '第一行\n第二行\n第三行' },
      { kind: 'paragraph', level: null, text: '另一段' },
    ]);
  });

  it('converts CRLF, a lone CR, and a byte-order mark to exactly the bytes plain LF text gives', () => {
    const plain = convert('第一段。\n\n第二段。\n').docx;
    expect(convert('第一段。\r\n\r\n第二段。\r\n').docx).toEqual(plain);
    expect(convert('第一段。\r\r第二段。\r').docx).toEqual(plain);
    expect(convert(new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode('第一段。\n\n第二段。\n')])).docx).toEqual(plain);
  });

  it('converts the same bytes to the same bytes', () => {
    const source = '# 标题\n\n正文一。\n正文二。\n\n- 列表项\n';
    expect(convert(source, 'MD').docx).toEqual(convert(source, 'MD').docx);
    expect(convert(source, 'TXT').docx).toEqual(convert(source, 'TXT').docx);
    // The two formats read the same bytes differently, so their working representations differ.
    expect(convert(source, 'MD').docx).not.toEqual(convert(source, 'TXT').docx);
  });

  it('reads every ATX heading level and both setext forms as headings, markers removed', async () => {
    const source =
      '# 一级\n\n## 二级\n\n### 三级\n\n#### 四级\n\n##### 五级\n\n###### 六级\n\n' +
      '设置文本一级\n===\n\n设置文本二级\n---\n';
    const { blocks, loss } = await parseConverted(source, 'MD');
    expect(shape(blocks)).toEqual([
      { kind: 'heading', level: 1, text: '一级' },
      { kind: 'heading', level: 2, text: '二级' },
      { kind: 'heading', level: 3, text: '三级' },
      { kind: 'heading', level: 4, text: '四级' },
      { kind: 'heading', level: 5, text: '五级' },
      { kind: 'heading', level: 6, text: '六级' },
      { kind: 'heading', level: 1, text: '设置文本一级' },
      { kind: 'heading', level: 2, text: '设置文本二级' },
    ]);
    expect(loss).toEqual(NO_LOSS);
  });

  it('keeps a heading that ends its block from swallowing the paragraph beside it', async () => {
    const { blocks } = await parseConverted('段落一\n# 标题\n段落二\n', 'MD');
    expect(shape(blocks)).toEqual([
      { kind: 'paragraph', level: null, text: '段落一' },
      { kind: 'heading', level: 1, text: '标题' },
      { kind: 'paragraph', level: null, text: '段落二' },
    ]);
  });

  it('counts each Markdown construct it kept as literal text, once, in its class', async () => {
    const cases: ReadonlyArray<{ source: string; expected: Partial<ConversionLoss>; kept: string[] }> = [
      { source: '带 *强调* 的一行\n', expected: { inlineStyles: 1 }, kept: ['带 *强调* 的一行'] },
      { source: '带 **加粗** 的一行\n', expected: { inlineStyles: 1 }, kept: ['带 **加粗** 的一行'] },
      { source: '带 `代码` 的一行\n', expected: { inlineStyles: 1 }, kept: ['带 `代码` 的一行'] },
      {
        source: '带 [链接](页面.html) 的一行\n',
        expected: { inlineStyles: 1 },
        kept: ['带 [链接](页面.html) 的一行'],
      },
      { source: '- 列表项\n', expected: { inlineStyles: 1 }, kept: ['- 列表项'] },
      { source: '1. 有序项\n', expected: { inlineStyles: 1 }, kept: ['1. 有序项'] },
      { source: '> 引用行\n', expected: { inlineStyles: 1 }, kept: ['> 引用行'] },
      { source: '```\n代码行\n```\n', expected: { inlineStyles: 1 }, kept: ['```\n代码行\n```'] },
      { source: '前一段\n\n***\n', expected: { inlineStyles: 1 }, kept: ['前一段', '***'] },
      { source: '![图注](图片.png)\n', expected: { imagesCaptions: 1 }, kept: ['![图注](图片.png)'] },
      { source: '| 甲 | 乙 |\n', expected: { tables: 1 }, kept: ['| 甲 | 乙 |'] },
    ];
    for (const { source, expected, kept } of cases) {
      const { blocks, loss } = await parseConverted(source, 'MD');
      // Nothing but a heading marker is interpreted: the characters stay exactly as they were typed.
      expect({ source, blocks: blocks.map((block) => block.text), loss })
        .toEqual({ source, blocks: kept, loss: { ...NO_LOSS, ...expected } });
    }
  });

  it('counts an image reference as an image alone, never also as a link', () => {
    expect(convert('![图注](图片.png) 与 [链接](页面.html)\n', 'MD').loss)
      .toEqual({ ...NO_LOSS, inlineStyles: 1, imagesCaptions: 1 });
  });

  it('counts nothing inside a fenced block beyond the fence itself', () => {
    expect(convert('```\n*不是强调* 与 | 不是表格 |\n```\n', 'MD').loss).toEqual({ ...NO_LOSS, inlineStyles: 1 });
  });

  it('interprets and counts nothing at all for plain text', async () => {
    const source = '# 不是标题\n\n- 不是列表\n\n| 不是 | 表格 |\n\n![不是图片](图片.png)\n';
    const { blocks, loss } = await parseConverted(source, 'TXT');
    expect(shape(blocks)).toEqual([
      { kind: 'paragraph', level: null, text: '# 不是标题' },
      { kind: 'paragraph', level: null, text: '- 不是列表' },
      { kind: 'paragraph', level: null, text: '| 不是 | 表格 |' },
      { kind: 'paragraph', level: null, text: '![不是图片](图片.png)' },
    ]);
    expect(loss).toEqual(NO_LOSS);
  });

  it('leaves the DOCX parser no fidelity signal of its own, so every merged count is the conversion’s', async () => {
    const source =
      '# 标题\n\n带 *强调*、`代码`、[链接](页面.html) 与 ![图注](图片.png) 的一段。\n\n| 甲 | 乙 |\n\n> 引用\n\n---\n';
    const { parsed, loss } = await parseConverted(source, 'MD');
    expect(isCleanTracerFidelity(parsed.fidelity)).toBe(true);
    expect(loss.inlineStyles + loss.tables + loss.imagesCaptions).toBeGreaterThan(0);
  });

  it('suggests the file name rather than DOCX metadata, because the original carried none', async () => {
    const { parsed } = await parseConverted('一段合成文本。\n');
    expect(parsed.titleSuggestion).toEqual({ value: '合成稿件', sourceLabel: '文件名' });
  });

  it('refuses an empty, a text-free, and a non-UTF-8 input with the reason stated', () => {
    for (const bytes of [new Uint8Array(0), encoder.encode('   \n\t\n'), Uint8Array.of(0xc3, 0x28), Uint8Array.of(0x41, 0x00, 0x42)]) {
      try {
        convertTextManuscript(bytes, { format: 'TXT' });
        throw new Error('Expected a conversion refusal.');
      } catch (error) {
        expect(isTextConversionRefusal(error)).toBe(true);
        expect((error as Error).message.split(':').slice(1).join(':').length).toBeGreaterThan(0);
      }
    }
  });
});
