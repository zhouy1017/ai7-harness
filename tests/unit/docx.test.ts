import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOCX_PARSER_IDENTITY,
  DOCX_PARSER_IDENTITY_V1,
  buildFidelityReport,
  deriveImportFidelityPlan,
  isCleanTracerFidelity,
  parseDocx,
  withTextBoxDisposition,
  type DocumentSignals,
  type ParsedDocxBlock,
} from '../../src/service/docx.js';
import type { ConversionLoss } from '../../src/service/text-manuscript.js';
import type { FidelityCategoryProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_V1_REPORT } from '../support/import-retention.js';
import { buildSyntheticDocx, writeSyntheticDocx, type SyntheticDocxOptions } from '../support/synthetic-docx.js';

const NO_SIGNALS: DocumentSignals = {
  inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, textBoxes: 0, fields: 0,
};
const NO_LOSS: ConversionLoss = {
  inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, headersFooters: 0,
  textBoxes: 0, fields: 0,
};

// Every fixture in this suite is generated, and stays generated: the subject throughout is the DOCX
// container — packaging, parts, entry and size bounds, fidelity classes, and the shapes the parser must
// refuse — where the block text is irrelevant by construction. A manuscript composed from an admitted
// Public SampleBook would say nothing here that a generated container does not already say. The one
// exception reads exact `sample1` itself for counts alone, because its fidelity outcome is the subject.
//
// Size bounds a small synthetic archive cannot exercise (decision 3 of #353), with the size each would need,
// and which of them a `zipSync` of zeros reaches under 4 MiB instead:
//   - `DOCX archive is too large` (64 MiB) — checked against bytes actually read off disk as the archive
//     streams in, not against any decompressed or declared size, so no compression trick shrinks the fixture;
//     would need a real ~64 MiB file on disk.
//   - `document XML exceeded its bound` (`word/document.xml` alone past 64 MiB, or the shared 96 MiB expanded
//     total crossed while it streams) — unreachable under 4 MiB with this helper: `buildSyntheticDocx` always
//     emits `word/document.xml` as the archive's second entry, before any `extraEntries` filler, so no earlier
//     entry can pre-load the shared expanded-bytes counter before `word/document.xml` streams, and its own
//     declared size is capped below 64 MiB by `ZIP entry is too large` (below) before it could reach 96 MiB
//     anyway; would need a real ~65 MiB `word/document.xml`.
//   - `metadata XML exceeded its bound` (`docProps/core.xml` or `[Content_Types].xml` past 1 MiB while
//     streaming) — unreachable by any well-formed archive: `zipSync` always declares a part's exact real size,
//     so `metadata XML entry is too large` (the declared-size check, already covered above) rejects an
//     oversized metadata part before this streamed-size check ever runs.
//   - `suspicious ZIP ratio` (2,000 : 1 above 1 MiB expanded) — unreachable by a well-formed archive: deflate's
//     practical ceiling for a maximally repetitive payload is on the order of 1,032 : 1, below the bound.
// `ZIP entry is too large`, `expanded DOCX is too large`, and `document text is too large` all turn out to be
// reachable under 4 MiB from a `zipSync` of zeros (or another maximally repetitive payload) and are covered
// below instead of listed here; so is `too many manuscript blocks`, which needs only a hundred thousand
// one-character paragraphs and stays well under 4 MiB uncompressed.
//
// `duplicate terminal section properties` (`docx.ts`) is unreachable at this base, per #352's Worker report:
// a second body-level `sectPr` trips `terminal section properties are not terminal` first, and a nested one
// trips `unsupported section properties` first — both covered below. The guard stays in the parser.
//
// `DOCTYPE in core properties` (`docx.ts`) is also unreachable, which corrects decision 2 of #353: `parseDocx`
// runs `docProps/core.xml` through `decodeMetadataXml` before it ever reaches the title parser, and that gate
// already rejects any `<!DOCTYPE` substring as `DTD or entity declaration` first. `DOCTYPE in document XML`
// has no such earlier gate and is covered below.

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-docx-test-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

async function parseFixture(
  options: SyntheticDocxOptions,
  displayName = 'fixture.docx',
): Promise<{ parsed: Awaited<ReturnType<typeof parseDocx>>; blocks: ParsedDocxBlock[] }> {
  const path = join(sandbox, 'fixture.docx');
  await writeSyntheticDocx(path, options);
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, displayName, (block) => blocks.push(block));
  return { parsed, blocks };
}

/** A literal `word/document.xml` body, for the shapes `writeSyntheticDocx` deliberately cannot emit. */
function bodyDocumentXml(body: string): Uint8Array {
  return new TextEncoder().encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`,
  );
}

describe('parseDocx', () => {
  it('parses title, heading, and paragraph blocks carrying CJK text', async () => {
    const { parsed, blocks } = await parseFixture({
      paragraphs: [
        { text: '合成书稿', style: 'Title' },
        { text: '第一章 起源', style: 'Heading1' },
        { text: '正文内容，包含中文与标点。', style: '标题 2' },
        { text: '普通段落。' },
      ],
    });

    expect(parsed.parserIdentity).toBe(DOCX_PARSER_IDENTITY);
    expect(DOCX_PARSER_IDENTITY).toBe('ai7-docx-fflate-saxes/2');
    expect(parsed.blockCount).toBe(4);
    expect(blocks.map((block) => block.kind)).toEqual(['title', 'heading', 'heading', 'paragraph']);
    expect(blocks.map((block) => block.level)).toEqual([1, 1, 2, null]);
    expect(blocks.map((block) => block.position)).toEqual([1, 2, 3, 4]);
    expect(blocks.map((block) => block.sourceParagraphIndex)).toEqual([0, 1, 2, 3]);
    expect(parsed.textBoxes).toEqual([]);
    expect(blocks.map((block) => block.text)).toEqual([
      '合成书稿',
      '第一章 起源',
      '正文内容，包含中文与标点。',
      '普通段落。',
    ]);
    for (const block of blocks) {
      expect(block.blockId).toMatch(/^blk_[0-9a-f]{24}$/);
      expect(block.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(block.graphemeLength).toBe(Array.from(block.text).length);
    }
    expect(parsed.characterCount).toBe(blocks.reduce((total, block) => total + block.graphemeLength, 0));
    expect(parsed.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.structureDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.archiveBytes).toBeGreaterThan(0);
  });

  it('skips empty paragraphs and collapses inner whitespace', async () => {
    const { parsed, blocks } = await parseFixture({
      paragraphs: [{ text: '' }, { text: '  多余   空格  ' }, { text: '' }],
    });

    expect(parsed.blockCount).toBe(1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe('多余 空格');
    expect(blocks[0]?.position).toBe(1);
    // An empty paragraph makes no block but is still a paragraph of the source part.
    expect(blocks[0]?.sourceParagraphIndex).toBe(1);
  });

  it('prefers the DOCX title metadata and falls back to the file name', async () => {
    const withMetadata = await parseFixture({ coreTitle: '元数据标题' });
    expect(withMetadata.parsed.titleSuggestion).toEqual({
      value: '元数据标题',
      sourceLabel: 'DOCX 标题元数据',
    });

    const withoutMetadata = await parseFixture({}, '书稿草案.docx');
    expect(withoutMetadata.parsed.titleSuggestion).toEqual({
      value: '书稿草案',
      sourceLabel: '文件名',
    });
  });

  it('produces identical digests for identical content', async () => {
    const options: SyntheticDocxOptions = { paragraphs: [{ text: '稳定内容。' }] };
    const first = await parseFixture(options);
    const second = await parseFixture(options);
    expect(second.parsed.contentDigest).toBe(first.parsed.contentDigest);
    expect(second.parsed.structureDigest).toBe(first.parsed.structureDigest);
    expect(second.parsed.sourceDigest).toBe(first.parsed.sourceDigest);
  });

  it('rejects a malformed archive', async () => {
    const path = join(sandbox, 'fixture.docx');
    await writeFile(path, Buffer.from('PK not actually a zip payload', 'utf8'));
    const blocks: ParsedDocxBlock[] = [];
    await expect(parseDocx(path, 'fixture.docx', (block) => blocks.push(block))).rejects.toThrow();
    expect(blocks).toHaveLength(0);
  });

  it('rejects an archive without word/document.xml', async () => {
    await expect(parseFixture({ omitDocument: true })).rejects.toThrow(
      'DOCX_REJECTED:not a WordprocessingML DOCX',
    );
  });

  it('rejects an archive without [Content_Types].xml', async () => {
    await expect(parseFixture({ omitContentTypes: true })).rejects.toThrow(
      'DOCX_REJECTED:not a WordprocessingML DOCX',
    );
  });

  it('rejects a metadata part whose declared size exceeds its bound', async () => {
    const oversized = new TextEncoder().encode(`<cp:coreProperties>${'x'.repeat(1_100_000)}</cp:coreProperties>`);
    await expect(parseFixture({ extraEntries: { 'docProps/core.xml': oversized } })).rejects.toThrow(
      'DOCX_REJECTED:metadata XML entry is too large',
    );
  });

  it('rejects a display name that is not a DOCX file', async () => {
    await expect(parseFixture({}, 'fixture.txt')).rejects.toThrow(
      'DOCX_REJECTED:selected file is not DOCX',
    );
  });

  it('rejects a document that carries no editable text block', async () => {
    await expect(parseFixture({ paragraphs: [{ text: '' }] })).rejects.toThrow(
      'DOCX_REJECTED:DOCX contains no editable text blocks',
    );
  });

  it('counts an empty terminal section as no section at all', async () => {
    const { parsed } = await parseFixture({ terminalSection: {} });
    const sections = parsed.fidelity.find((category) => category.key === 'sections');
    expect(sections?.count).toBe(0);
    expect(sections?.statusLabel).toBe('完整保留');
  });

  it('counts a terminal section that carries attributes and children exactly once, retained with the file', async () => {
    const { parsed } = await parseFixture({
      terminalSection: { attributes: { rsidR: '00AB12CD' }, children: ['pgSz', 'pgMar', 'cols', 'docGrid'] },
    });
    const sections = parsed.fidelity.find((category) => category.key === 'sections');
    expect(sections?.count).toBe(1);
    expect(sections?.label).toBe('分节（含页面设置）');
    expect(sections?.status).toBe('retained');
    expect(sections?.statusLabel).toBe('完整保留（随文件保留）');
    // Page setup is retained with the Source Version, so it asks for no degradation decision (ADR 0086 §2).
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
  });

  it('rejects a body-level element after the terminal section properties', async () => {
    await expect(
      parseFixture({
        extraEntries: {
          'word/document.xml': bodyDocumentXml('<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr/><w:p/>'),
        },
      }),
    ).rejects.toThrow('DOCX_REJECTED:terminal section properties are not terminal');
  });

  it('rejects section properties in an unsupported place', async () => {
    await expect(
      parseFixture({
        extraEntries: {
          'word/document.xml': bodyDocumentXml('<w:p><w:sectPr/><w:r><w:t>正文</w:t></w:r></w:p>'),
        },
      }),
    ).rejects.toThrow('DOCX_REJECTED:unsupported section properties');
  });

  it('rejects a source that changed after staging', async () => {
    const path = join(sandbox, 'fixture.docx');
    await writeSyntheticDocx(path, {});
    await expect(
      parseDocx(path, 'fixture.docx', () => {}, { digest: '0'.repeat(64), bytes: 1 }),
    ).rejects.toThrow('DOCX_REJECTED:selected file changed during staging');
  });
});

describe('parseDocx: hostile-input bounds', () => {
  it("keeps buildSyntheticDocx({})'s bytes unchanged now that hostile-input options exist", () => {
    const digest = createHash('sha256').update(buildSyntheticDocx()).digest('hex');
    expect(digest).toBe('ddb296070783f25122c67d9b5a82bbc0d103a79f92f6d946d1bd8e231b5c7d32');
  });

  it('rejects a traversal ZIP entry name', async () => {
    await expect(
      parseFixture({ extraEntries: { '../evil.xml': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:traversal ZIP entry');
  });

  it('rejects an absolute ZIP entry name', async () => {
    await expect(
      parseFixture({ extraEntries: { '/evil.xml': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:absolute ZIP entry name');
  });

  it('rejects a duplicate ZIP entry name that differs only by case', async () => {
    await expect(
      parseFixture({ extraEntries: { 'WORD/DOCUMENT.XML': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:duplicate ZIP entry');
  });

  it('rejects a DTD or entity declaration in a metadata part', async () => {
    await expect(
      parseFixture({ injectedDeclaration: { part: 'docProps/core.xml', declaration: '<!DOCTYPE x>' } }),
    ).rejects.toThrow('DOCX_REJECTED:DTD or entity declaration');
  });

  it('rejects a DOCTYPE in document XML', async () => {
    await expect(
      parseFixture({ injectedDeclaration: { part: 'word/document.xml', declaration: '<!DOCTYPE x>' } }),
    ).rejects.toThrow('DOCX_REJECTED:DOCTYPE in document XML');
  });

  it('rejects core properties XML nesting past its safe bound', async () => {
    await expect(
      parseFixture({ nestingDepth: { part: 'docProps/core.xml', depth: 150 } }),
    ).rejects.toThrow('DOCX_REJECTED:core properties XML nesting exceeds its safe bound');
  });

  it('rejects document XML nesting past its safe bound', async () => {
    await expect(
      parseFixture({ nestingDepth: { part: 'word/document.xml', depth: 150 } }),
    ).rejects.toThrow('DOCX_REJECTED:document XML nesting exceeds its safe bound');
  });

  it('rejects a document XML markup token past its bound', async () => {
    await expect(
      parseFixture({ terminalSection: { attributes: { rsidR: 'x'.repeat(40_000) } } }),
    ).rejects.toThrow('DOCX_REJECTED:document XML markup token exceeds its bound');
  });

  it('rejects a document XML text token past its block bound', async () => {
    await expect(
      parseFixture({ paragraphs: [{ text: 'x'.repeat(4_200) }] }),
    ).rejects.toThrow('DOCX_REJECTED:document XML text token exceeds its block bound');
  });

  it('rejects a paragraph past its bounded block size', async () => {
    await expect(
      parseFixture({ paragraphs: [{ text: '字'.repeat(2_100) }] }),
    ).rejects.toThrow('DOCX_REJECTED:paragraph exceeds the bounded block size');
  });

  it('rejects too many ZIP entries', async () => {
    const extraEntries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 257; i += 1) extraEntries[`extra/${i}.xml`] = new Uint8Array();
    await expect(parseFixture({ extraEntries })).rejects.toThrow('DOCX_REJECTED:too many ZIP entries');
  });

  it('rejects a vbaProject.bin entry', async () => {
    await expect(
      parseFixture({ extraEntries: { 'word/vbaProject.bin': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:active or embedded content is outside this import');
  });

  it('rejects an embeddings/ entry', async () => {
    await expect(
      parseFixture({ extraEntries: { 'word/embeddings/oleObject1.xml': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:active or embedded content is outside this import');
  });

  it('rejects an activeX/ entry', async () => {
    await expect(
      parseFixture({ extraEntries: { 'word/activeX/activeX1.xml': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:active or embedded content is outside this import');
  });

  it('rejects any .bin entry', async () => {
    await expect(
      parseFixture({ extraEntries: { 'word/media/blob.bin': new Uint8Array() } }),
    ).rejects.toThrow('DOCX_REJECTED:active or embedded content is outside this import');
  });

  it('rejects too many manuscript blocks', async () => {
    const paragraphs = Array.from({ length: 100_001 }, (_, index) => ({ text: String(index % 10) }));
    await expect(parseFixture({ paragraphs })).rejects.toThrow('DOCX_REJECTED:too many manuscript blocks');
  }, 30_000);

  it('rejects document text past its total size bound', async () => {
    const paragraphs = Array.from({ length: 4_885 }, () => ({ text: '字'.repeat(2_048) }));
    await expect(parseFixture({ paragraphs })).rejects.toThrow('DOCX_REJECTED:document text is too large');
  }, 30_000);

  it('rejects a ZIP entry whose declared size is too large, from a zipSync of zeros under 4 MiB', async () => {
    const filler = new Uint8Array(64 * 1024 * 1024 + 1);
    await expect(
      parseFixture({ extraEntries: { 'word/media/filler.dat': filler } }),
    ).rejects.toThrow('DOCX_REJECTED:ZIP entry is too large');
  }, 30_000);

  it('rejects an archive whose expanded content exceeds its bound, from a zipSync of zeros under 4 MiB', async () => {
    const filler = new Uint8Array(50 * 1024 * 1024);
    await expect(
      parseFixture({
        extraEntries: {
          'word/media/filler1.dat': filler,
          'word/media/filler2.dat': filler,
        },
      }),
    ).rejects.toThrow('DOCX_REJECTED:expanded DOCX is too large');
  }, 60_000);
});

describe('deriveImportFidelityPlan and isCleanTracerFidelity', () => {
  async function cleanFidelity(): Promise<{
    fidelity: FidelityCategoryProjection[];
    sourceDigest: string;
    archiveBytes: number;
  }> {
    const path = join(sandbox, 'fixture.docx');
    await writeSyntheticDocx(path, {});
    const parsed = await parseDocx(path, 'fixture.docx', () => {});
    return {
      fidelity: parsed.fidelity,
      sourceDigest: parsed.sourceDigest,
      archiveBytes: parsed.archiveBytes,
    };
  }

  it('accepts a clean projection as a clean tracer import', async () => {
    const { fidelity, sourceDigest, archiveBytes } = await cleanFidelity();
    expect(isCleanTracerFidelity(fidelity)).toBe(true);
    expect(deriveImportFidelityPlan(fidelity, sourceDigest, archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
    expect(fidelity.every((category) => category.key === 'round-trip-export' || category.count === 0)).toBe(true);
  });

  it('reports the ten classes in their order, with 预计往返 as the closing card', async () => {
    const { fidelity } = await cleanFidelity();
    expect(fidelity.map((category) => [category.key, category.label])).toEqual([
      ['inline-styles', '行内样式'],
      ['comments-revisions', '批注与修订'],
      ['notes', '脚注与尾注'],
      ['tables', '表格'],
      ['images-captions', '图片与图注'],
      ['sections', '分节（含页面设置）'],
      ['headers-footers', '页眉与页脚'],
      ['text-boxes', '文本框'],
      ['fields', '域（目录等）'],
      ['round-trip-export', '预计往返'],
    ]);
    // An absent class reads 完整保留; 预计往返 counts nothing and never asks for a decision.
    expect(fidelity.slice(0, 9).every((category) => category.status === 'preserved' && category.statusLabel === '完整保留')).toBe(true);
    const roundTrip = fidelity.at(-1)!;
    expect(roundTrip.count).toBe(0);
    expect(roundTrip.detail).toContain('样式表');
  });

  it('retains inline styles with the file instead of asking for a degradation decision', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>加粗文字</w:t></w:r></w:p><w:sectPr/>',
        ),
      },
    });
    expect(isCleanTracerFidelity(parsed.fidelity)).toBe(false);
    const inline = parsed.fidelity.find((category) => category.key === 'inline-styles')!;
    expect([inline.count, inline.status, inline.statusLabel]).toEqual([1, 'retained', '完整保留（随文件保留）']);
    expect(inline.detail).toContain('改过的段落，导出时逐段说明格式能否原样恢复');
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
  });

  it('lists a note as 降级导入: neither the reference nor the note is in the manuscript', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:t>正文</w:t><w:footnoteReference w:id="2"/></w:r></w:p><w:sectPr/>',
        ),
      },
    });
    const notes = parsed.fidelity.find((category) => category.key === 'notes')!;
    expect([notes.status, notes.statusLabel]).toEqual(['degraded', '降级导入']);
    expect(notes.detail).toContain('注文随来源版本保留');
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'notes', label: '脚注与尾注', count: 1 }],
      textBoxDisposition: null,
    });
  });

  it('refuses a report whose category no longer matches its own count', async () => {
    const { fidelity, sourceDigest, archiveBytes } = await cleanFidelity();
    const inconsistent: FidelityCategoryProjection[] = fidelity.map((category) =>
      category.key === 'inline-styles' ? { ...category, count: 1 } : category,
    );
    expect(isCleanTracerFidelity(inconsistent)).toBe(false);
    expect(deriveImportFidelityPlan(inconsistent, sourceDigest, archiveBytes)).toBeUndefined();
  });

  it('refuses a projection that is not a fidelity report at all', async () => {
    const { sourceDigest, archiveBytes } = await cleanFidelity();
    expect(deriveImportFidelityPlan(null, sourceDigest, archiveBytes)).toBeUndefined();
    expect(deriveImportFidelityPlan([], sourceDigest, archiveBytes)).toBeUndefined();
    expect(deriveImportFidelityPlan([{ key: 'inline-styles' }], sourceDigest, archiveBytes)).toBeUndefined();
    expect(isCleanTracerFidelity([])).toBe(false);
  });

  // The two conversion cases of #356; everything else in this file is #353's.
  it('names the converter in every class a conversion carried loss into, and nowhere else', () => {
    const report = buildFidelityReport(
      NO_SIGNALS,
      0,
      {
        identity: 'ai7-text-to-docx/1',
        sourceFormat: 'MD',
        loss: { ...NO_LOSS, inlineStyles: 2, tables: 1 },
      },
    );
    // What a converter lost is not in the working representation, so it is never retained with the file.
    expect(report.map((category) => [category.key, category.count, category.statusLabel])).toEqual([
      ['inline-styles', 2, '降级导入'],
      ['comments-revisions', 0, '完整保留'],
      ['notes', 0, '完整保留'],
      ['tables', 1, '降级导入'],
      ['images-captions', 0, '完整保留'],
      ['sections', 0, '完整保留'],
      ['headers-footers', 0, '完整保留'],
      ['text-boxes', 0, '完整保留'],
      ['fields', 0, '完整保留'],
      ['round-trip-export', 0, '不支持导入'],
    ]);
    const named = report.filter((category) => category.detail.startsWith('由 ai7-text-to-docx/1 从 MD 转换保留为原文字符：'));
    expect(named.map((category) => category.key)).toEqual(['inline-styles', 'tables']);
  });

  it('refuses to plan a converted report unless the conversion that made it is named', () => {
    const conversion = { identity: 'ai7-text-to-docx/1', sourceFormat: 'MD' as const };
    const report = buildFidelityReport(NO_SIGNALS, 0, { ...conversion, loss: { ...NO_LOSS, inlineStyles: 2, tables: 1 } });
    expect(deriveImportFidelityPlan(report, 'a'.repeat(64), 1024)).toBeUndefined();
    expect(deriveImportFidelityPlan(report, 'a'.repeat(64), 1024, conversion)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [
        { categoryKey: 'inline-styles', label: '行内样式', count: 2 },
        { categoryKey: 'tables', label: '表格', count: 1 },
      ],
      textBoxDisposition: null,
    });
    // A parser's own report is equally not a converted one, whichever way it is read.
    expect(deriveImportFidelityPlan(report, 'a'.repeat(64), 1024, { ...conversion, sourceFormat: 'TXT' }))
      .toBeUndefined();
  });

  // #351's case: one prefix per converter, and an identity this build cannot phrase is refused.
  it('says what each converter did to the content, and refuses an identity it cannot phrase', () => {
    const loss = { ...NO_LOSS, headersFooters: 1 };
    const text = { identity: 'ai7-text-to-docx/1', sourceFormat: 'TXT' as const };
    const legacy = { identity: 'ai7-doc-to-docx/1', sourceFormat: 'DOC' as const };
    const textReport = buildFidelityReport(NO_SIGNALS, 0, { ...text, loss });
    const legacyReport = buildFidelityReport(NO_SIGNALS, 0, { ...legacy, loss });
    const detail = (report: FidelityCategoryProjection[]): string =>
      report.find((category) => category.key === 'headers-footers')!.detail;
    // The text conversion kept the author's characters; the legacy one could not.
    expect(detail(textReport).startsWith('由 ai7-text-to-docx/1 从 TXT 转换保留为原文字符：')).toBe(true);
    expect(detail(legacyReport).startsWith('由 ai7-doc-to-docx/1 从 DOC 转换时未能保留：')).toBe(true);
    const planned = {
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'headers-footers', label: '页眉与页脚', count: 1 }],
      textBoxDisposition: null,
    };
    expect(deriveImportFidelityPlan(textReport, 'a'.repeat(64), 1024, text)).toEqual(planned);
    expect(deriveImportFidelityPlan(legacyReport, 'a'.repeat(64), 1024, legacy)).toEqual(planned);
    // Each rebuilds under its own identity alone: the prefixes no longer read the same.
    expect(deriveImportFidelityPlan(legacyReport, 'a'.repeat(64), 1024, { ...text, sourceFormat: 'DOC' }))
      .toBeUndefined();
    const unknown = { identity: 'ai7-unwritten-converter/1', sourceFormat: 'DOC' as const };
    expect(() => buildFidelityReport(NO_SIGNALS, 0, { ...unknown, loss }))
      .toThrow('DOCX_REJECTED:unknown converter identity');
    expect(deriveImportFidelityPlan(legacyReport, 'a'.repeat(64), 1024, unknown)).toBeUndefined();
  });

  it('keeps a converter\'s dropped text boxes and fields in their own classes, 降级导入 and never merged', () => {
    const legacy = { identity: 'ai7-doc-to-docx/1', sourceFormat: 'DOC' as const };
    const report = buildFidelityReport(NO_SIGNALS, 0, { ...legacy, loss: { ...NO_LOSS, textBoxes: 2, fields: 3 } });
    expect(report.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['text-boxes', 2, 'degraded'], ['fields', 3, 'degraded']]);
    expect(deriveImportFidelityPlan(report, 'a'.repeat(64), 1024, legacy)?.textBoxDisposition).toBeNull();
    expect(withTextBoxDisposition(report, 'merge', legacy)).toBeUndefined();
    expect(withTextBoxDisposition(report, 'retain', legacy)).toEqual(report);
  });
});

describe('parser identity /1 reviews', () => {
  it('still rebuild exactly through the frozen eight-class builder, under their own identity only', () => {
    expect(deriveImportFidelityPlan(SAMPLE1_V1_REPORT, 'a'.repeat(64), 1024, undefined, DOCX_PARSER_IDENTITY_V1)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [
        { categoryKey: 'inline-styles', label: '行内样式', count: 266 },
        { categoryKey: 'sections', label: '分节', count: 1 },
      ],
      textBoxDisposition: null,
    });
    // Eight rows are not a revision-2 report, and ten are not a revision-1 one.
    expect(deriveImportFidelityPlan(SAMPLE1_V1_REPORT, 'a'.repeat(64), 1024)).toBeUndefined();
    const v2 = buildFidelityReport({ ...NO_SIGNALS, inlineStyles: 266, sections: 1 }, 0);
    expect(deriveImportFidelityPlan(v2, 'a'.repeat(64), 1024, undefined, DOCX_PARSER_IDENTITY_V1)).toBeUndefined();
    expect(deriveImportFidelityPlan(v2, 'a'.repeat(64), 1024, undefined, 'ai7-docx-fflate-saxes/3')).toBeUndefined();
    // A one-character change to a frozen detail no longer rebuilds.
    const drifted = SAMPLE1_V1_REPORT.map((category, index) => index === 0 ? { ...category, detail: `${category.detail} ` } : category);
    expect(deriveImportFidelityPlan(drifted, 'a'.repeat(64), 1024, undefined, DOCX_PARSER_IDENTITY_V1)).toBeUndefined();
  });

  it('rebuild a converted revision-1 review under its converter, as before', () => {
    const legacy = { identity: 'ai7-doc-to-docx/1', sourceFormat: 'DOC' as const };
    const converted = SAMPLE1_V1_REPORT.map((category) => category.key === 'headers-footers'
      ? { ...category, count: 1, status: 'degraded' as const, statusLabel: '降级导入' as const, detail: '由 ai7-doc-to-docx/1 从 DOC 转换时未能保留：页眉页脚不进入稿件正文；本次受限导入不提交该分支。' }
      : category.key === 'inline-styles' || category.key === 'sections'
        ? { ...category, count: 0, status: 'preserved' as const, statusLabel: '完整保留' as const, detail: category.key === 'inline-styles' ? '未检测到行内样式。' : '未检测到额外分节；单节正文顺序完整保留，且不据此建立版式往返保证。' }
        : category);
    expect(deriveImportFidelityPlan(converted, 'a'.repeat(64), 1024, legacy, DOCX_PARSER_IDENTITY_V1)?.degradations)
      .toEqual([{ categoryKey: 'headers-footers', label: '页眉与页脚', count: 1 }]);
  });
});

const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const WPS = 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const V = 'xmlns:v="urn:schemas-microsoft-com:vml"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A complex field as Word writes one: begin, its instruction, separate, what it displays, end. */
function complexField(instruction: string, shown: string): string {
  return '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${shown}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function textRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

/** A text box the way Word writes one: DrawingML in `mc:Choice`, the same content again in VML in `mc:Fallback`. */
function wordTextBox(paragraphs: string): string {
  return `<w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing><wp:anchor ${WP}><a:graphic ${A}>` +
    `<a:graphicData><wps:wsp ${WPS}><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx></wps:wsp>` +
    `</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape ${V}><v:textbox>` +
    `<w:txbxContent>${paragraphs}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
}

describe('parseDocx: text boxes, fields, and source paragraphs (ADR 0086)', () => {
  it('reads a Word text box once, keeps its paragraphs out of the body, and anchors it to its paragraph', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:t>锚定段落</w:t></w:r>' +
            wordTextBox('<w:p><w:r><w:t>框内第一段</w:t></w:r></w:p><w:p/><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>框内标题</w:t></w:r></w:p>') +
            '<w:r><w:t>锚后文字</w:t></w:r></w:p><w:p><w:r><w:t>下一段</w:t></w:r></w:p><w:sectPr/>',
        ),
      },
    });
    expect(blocks.map((block) => [block.text, block.sourceParagraphIndex])).toEqual([
      ['锚定段落锚后文字', 0],
      // Three paragraphs in the Choice and the same three in the Fallback come between: every `w:p`
      // takes an index, read or skipped.
      ['下一段', 7],
    ]);
    expect(parsed.textBoxes).toHaveLength(1);
    const [box] = parsed.textBoxes;
    expect([box!.boxOrdinal, box!.anchorParagraphIndex]).toEqual([1, 0]);
    expect(box!.paragraphs.map((paragraph) => [
      paragraph.boxParagraphOrdinal, paragraph.sourceParagraphIndex, paragraph.kind, paragraph.level, paragraph.text,
    ])).toEqual([
      [1, 1, 'paragraph', null, '框内第一段'],
      [2, 3, 'heading', 2, '框内标题'],
    ]);
    for (const paragraph of box!.paragraphs) {
      expect(paragraph.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(paragraph.graphemeLength).toBe(Array.from(paragraph.text).length);
    }
    const counts = Object.fromEntries(parsed.fidelity.map((category) => [category.key, category.count]));
    // The drawing that holds the box is the box, not an image; its VML fallback is not a second box.
    expect(counts['text-boxes']).toBe(1);
    expect(counts['images-captions']).toBe(0);
    const row = parsed.fidelity.find((category) => category.key === 'text-boxes')!;
    expect([row.status, row.statusLabel]).toEqual(['retained', '完整保留（随文件保留）']);
    expect(row.detail.startsWith('保留为文本框：')).toBe(true);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: 'retain',
    });
  });

  it('reads a VML-only text box and still counts a plain drawing as an image, once per alternative', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p><w:r><w:pict><v:shape ${V}><v:textbox><w:txbxContent><w:p><w:r><w:t>旧式文本框</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>` +
            '<w:p><w:r><w:drawing/></w:r><w:r><w:t>图注</w:t></w:r></w:p>' +
            `<w:p><w:r><mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing/></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r><w:r><w:t>第二图注</w:t></w:r></w:p>` +
            '<w:sectPr/>',
        ),
      },
    });
    const counts = Object.fromEntries(parsed.fidelity.map((category) => [category.key, category.count]));
    expect([counts['text-boxes'], counts['images-captions']]).toEqual([1, 2]);
    // The box's anchor paragraph holds no text of its own, so it makes no block.
    expect(parsed.blockCount).toBe(2);
    expect(parsed.textBoxes[0]!.anchorParagraphIndex).toBe(0);
    expect(parsed.textBoxes[0]!.paragraphs.map((paragraph) => paragraph.sourceParagraphIndex)).toEqual([1]);
  });

  it('still refuses a text box inside a text box, a text box outside a paragraph, and a nested paragraph', async () => {
    const inner = `<w:r><w:pict><v:shape ${V}><v:textbox><w:txbxContent><w:p><w:r><w:t>内层</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
    await expect(parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p><w:r><w:t>正文</w:t></w:r><w:r><w:pict><v:shape ${V}><v:textbox><w:txbxContent><w:p>${inner}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p><w:sectPr/>`,
        ),
      },
    })).rejects.toThrow('DOCX_REJECTED:nested text box');
    await expect(parseFixture({
      extraEntries: { 'word/document.xml': bodyDocumentXml('<w:txbxContent><w:p/></w:txbxContent><w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr/>') },
    })).rejects.toThrow('DOCX_REJECTED:text box outside a paragraph');
    await expect(parseFixture({
      extraEntries: { 'word/document.xml': bodyDocumentXml('<w:p><w:r><w:t>正文</w:t></w:r><w:p/></w:p><w:sectPr/>') },
    })).rejects.toThrow('DOCX_REJECTED:nested paragraph');
  });

  it('counts every field once and keeps only the text it displays, which asks for a degradation decision', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r>' +
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>目录项</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
            '<w:p><w:r><w:t>第 </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>3</w:t></w:r></w:fldSimple><w:r><w:t> 页</w:t></w:r></w:p>' +
            '<w:sectPr/>',
        ),
      },
    });
    expect(blocks.map((block) => block.text)).toEqual(['目录项', '第 3 页']);
    const fields = parsed.fidelity.find((category) => category.key === 'fields')!;
    expect([fields.count, fields.status, fields.statusLabel]).toEqual([2, 'degraded', '降级导入']);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'fields', label: '域（目录等）', count: 2 }],
      textBoxDisposition: null,
    });
  });

  // A link is not a field (#410): a `w:hyperlink` or a HYPERLINK field is one inline-style item, kept with
  // the file; every other field is one item of 域.
  it('counts a w:hyperlink as one inline-style item kept with the file, and asks for no decision', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p>${textRun('参见')}<w:hyperlink ${R} r:id="rId9">${textRun('外部链接')}</w:hyperlink></w:p>` +
            `<w:p><w:hyperlink w:anchor="_Ref1">${textRun('书签链接')}</w:hyperlink></w:p><w:sectPr/>`,
        ),
      },
    });
    // The manuscript keeps each link's text; the link itself stays with the Source Version.
    expect(blocks.map((block) => block.text)).toEqual(['参见外部链接', '书签链接']);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 2, 'retained']]);
    // Said of the class, so a file whose only inline items are links is told of no font it does not have.
    expect(parsed.fidelity.find((category) => category.key === 'inline-styles')!.detail).toBe(
      '字体、字号、粗体、颜色等行内样式与超链接随来源版本保留；稿件只编辑文字，超链接只留下显示的文字；未改过的段落导出时从原文件恢复。改过的段落，导出时逐段说明格式能否原样恢复。',
    );
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
  });

  it('counts a HYPERLINK field as a link rather than a field, however its instruction is written', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p><w:fldSimple w:instr=" HYPERLINK &quot;https://example.org/&quot; ">${textRun('简单链接域')}</w:fldSimple></w:p>` +
            // Word may split an instruction across runs; the field's name is read case-insensitively.
            '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> hyper</w:instrText></w:r>' +
            '<w:r><w:instrText xml:space="preserve">link \\l "_Ref2" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
            `${textRun('复杂链接域')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:sectPr/>`,
        ),
      },
    });
    // Only the text each link displays enters the manuscript; its instruction never does.
    expect(blocks.map((block) => block.text)).toEqual(['简单链接域', '复杂链接域']);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 2, 'retained']]);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
  });

  it('counts a table of contents as Word writes one: the TOC and each page reference are fields, each entry\'s link is not', async () => {
    const entry = (bookmark: string, title: string, page: string): string =>
      `<w:hyperlink w:anchor="${bookmark}" w:history="1">${textRun(title)}<w:r><w:tab/></w:r>` +
      `${complexField(` PAGEREF ${bookmark} \\h `, textRun(page))}</w:hyperlink>`;
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          // The TOC field opens in its first entry's paragraph and closes in a paragraph of its own.
          '<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
            '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
            `${entry('_Toc1', '第一章', '1')}</w:p>` +
            `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>${entry('_Toc2', '第二章', '5')}</w:p>` +
            `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:p>${textRun('正文')}</w:p><w:sectPr/>`,
        ),
      },
    });
    expect(blocks.map((block) => block.text)).toEqual(['第一章 1', '第二章 5', '正文']);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 2, 'retained'], ['fields', 3, 'degraded']]);
    // The row names no link among its examples: a link is never one of its items.
    expect(parsed.fidelity.find((category) => category.key === 'fields')!.detail).toBe(
      '目录、交叉引用、页码等域按当前显示的文字进入稿件，之后不再更新；未改过的段落导出时从原文件恢复，改过的段落在导出保真审阅里逐段说明。',
    );
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'fields', label: '域（目录等）', count: 3 }],
      textBoxDisposition: null,
    });
  });

  it('counts a mixed document exactly: every link one inline-style item, every other field one item of 域', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>加粗</w:t></w:r><w:hyperlink w:anchor="_Ref1">${textRun('书签链接')}</w:hyperlink></w:p>` +
            // A HYPERLINK field whose displayed text holds a page reference: a link around a field.
            `<w:p>${complexField(' HYPERLINK \\l "_Ref1" ', `${textRun('见第')}${complexField(' PAGEREF _Ref1 \\h ', textRun('5'))}${textRun('页')}`)}</w:p>` +
            `<w:p>${textRun('图 ')}<w:fldSimple w:instr=" SEQ 图 \\* ARABIC ">${textRun('1')}</w:fldSimple>${textRun('，共 ')}` +
            `<w:fldSimple w:instr=" NUMPAGES ">${textRun('9')}</w:fldSimple>${textRun(' 页')}</w:p>` +
            `<w:p>${complexField(' DATE \\@ "yyyy-MM-dd" ', textRun('2026-09-22'))}${textRun('，')}` +
            `<w:fldSimple w:instr=" hyperlink &quot;https://example.org/&quot; ">${textRun('外链')}</w:fldSimple>` +
            `${complexField(' REF _Ref1 \\h ', textRun('引用'))}</w:p><w:sectPr/>`,
        ),
      },
    });
    expect(blocks.map((block) => block.text)).toEqual(['加粗书签链接', '见第5页', '图 1，共 9 页', '2026-09-22，外链引用']);
    // Inline-style items: the bold run and three links — the w:hyperlink and both HYPERLINK fields.
    // Fields: PAGEREF, SEQ, NUMPAGES, DATE and REF.
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 4, 'retained'], ['fields', 5, 'degraded']]);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'fields', label: '域（目录等）', count: 5 }],
      textBoxDisposition: null,
    });
  });

  it('counts each field once even when its marks are unbalanced or its instruction starts with another field', async () => {
    const { parsed, blocks } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          // An end mark with no field open counts nothing.
          `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r>${textRun('孤立的结束标记')}</w:p>` +
            // An instruction that starts with a nested field never names the outer field, which counts in 域
            // whatever follows the nested one.
            '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
            '<w:r><w:instrText> REF _Ref1 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' +
            '<w:r><w:instrText> HYPERLINK "x" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
            `${textRun('嵌套指令')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
            // A field still open when the part ends is counted there, by what its instruction said.
            `<w:p>${textRun('未闭合')}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>HYPERLINK</w:instrText></w:r></w:p>` +
            '<w:sectPr/>',
        ),
      },
    });
    expect(blocks.map((block) => block.text)).toEqual(['孤立的结束标记', '嵌套指令', '未闭合']);
    const counts = Object.fromEntries(parsed.fidelity.map((category) => [category.key, category.count]));
    expect([counts['inline-styles'], counts['fields']]).toEqual([1, 2]);
  });

  it('rebuilds a text-box report under the disposition it states, and only one it can state', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          `<w:p><w:r><w:t>正文</w:t></w:r>${wordTextBox('<w:p><w:r><w:t>框内</w:t></w:r></w:p>')}</w:p><w:sectPr/>`,
        ),
      },
    });
    const merged = withTextBoxDisposition(parsed.fidelity, 'merge')!;
    expect(merged.find((category) => category.key === 'text-boxes')!.detail.startsWith('并入正文：')).toBe(true);
    // Only the text-box row moves: the rest of the report is the parser's.
    expect(merged.filter((category) => category.key !== 'text-boxes'))
      .toEqual(parsed.fidelity.filter((category) => category.key !== 'text-boxes'));
    expect(deriveImportFidelityPlan(merged, parsed.sourceDigest, parsed.archiveBytes)?.textBoxDisposition).toBe('merge');
    expect(withTextBoxDisposition(merged, 'retain')).toEqual(parsed.fidelity);
    // A report without a text box cannot be merged, and a malformed one is refused either way.
    const { parsed: plain } = await parseFixture({});
    expect(withTextBoxDisposition(plain.fidelity, 'merge')).toBeUndefined();
    expect(withTextBoxDisposition(plain.fidelity, 'retain')).toEqual(plain.fidelity);
    expect(withTextBoxDisposition([{ key: 'text-boxes' }], 'retain')).toBeUndefined();
  });

  it('reads exact sample1 as clean: its inline styles and its one section are retained with the file', async () => {
    const path = fileURLToPath(new URL('../../SampleBooks/sample1.docx', import.meta.url));
    const blocks: ParsedDocxBlock[] = [];
    const parsed = await parseDocx(path, 'sample1.docx', (block) => blocks.push(block));
    expect(parsed.blockCount).toBe(97);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 266, 'retained'], ['sections', 1, 'retained']]);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'clean-import-no-round-trip',
      degradations: [],
      textBoxDisposition: null,
    });
    // Ninety-eight paragraphs, one of them empty: every block names its own, strictly in order.
    expect(blocks.every((block, index) => index === 0 || block.sourceParagraphIndex > blocks[index - 1]!.sourceParagraphIndex)).toBe(true);
    expect(blocks.at(-1)!.sourceParagraphIndex).toBeLessThanOrEqual(97);
  });
});
