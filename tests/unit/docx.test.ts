import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOCX_PARSER_IDENTITY,
  deriveImportFidelityPlan,
  isCleanTracerFidelity,
  parseDocx,
  type ParsedDocxBlock,
} from '../../src/service/docx.js';
import type { FidelityCategoryProjection } from '../../src/shared/protocol.js';
import { writeSyntheticDocx, type SyntheticDocxOptions } from '../support/synthetic-docx.js';

// Every fixture in this suite is generated, and stays generated: the subject throughout is the DOCX
// container — packaging, parts, entry and size bounds, fidelity classes, and the shapes the parser must
// refuse — where the block text is irrelevant by construction. A manuscript composed from an admitted
// Public SampleBook would say nothing here that a generated container does not already say.

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
    expect(parsed.blockCount).toBe(4);
    expect(blocks.map((block) => block.kind)).toEqual(['title', 'heading', 'heading', 'paragraph']);
    expect(blocks.map((block) => block.level)).toEqual([1, 1, 2, null]);
    expect(blocks.map((block) => block.position)).toEqual([1, 2, 3, 4]);
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

  it('counts a terminal section that carries attributes and children exactly once', async () => {
    const { parsed } = await parseFixture({
      terminalSection: { attributes: { rsidR: '00AB12CD' }, children: ['pgSz', 'pgMar', 'cols', 'docGrid'] },
    });
    const sections = parsed.fidelity.find((category) => category.key === 'sections');
    expect(sections?.count).toBe(1);
    expect(sections?.statusLabel).toBe('降级导入');
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'sections', label: '分节', count: 1 }],
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
    });
    expect(fidelity.every((category) => category.key === 'round-trip-export' || category.count === 0)).toBe(true);
  });

  it('plans a degraded import for a degraded projection that is not the compatibility baseline', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>加粗文字</w:t></w:r></w:p><w:sectPr/>',
        ),
      },
    });
    expect(isCleanTracerFidelity(parsed.fidelity)).toBe(false);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'inline-styles', label: '行内样式', count: 1 }],
    });
  });

  it('lists an unsupported category with a positive count as a degradation', async () => {
    const { parsed } = await parseFixture({
      extraEntries: {
        'word/document.xml': bodyDocumentXml(
          '<w:p><w:r><w:t>正文</w:t><w:footnoteReference w:id="2"/></w:r></w:p><w:sectPr/>',
        ),
      },
    });
    const notes = parsed.fidelity.find((category) => category.key === 'notes');
    expect(notes?.statusLabel).toBe('不支持导入');
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)).toEqual({
      outcome: 'degraded-import-no-round-trip',
      degradations: [{ categoryKey: 'notes', label: '脚注与尾注', count: 1 }],
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
});
