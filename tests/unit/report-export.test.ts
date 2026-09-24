import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { REPORT_EXPORT_WRITER_IDENTITIES, renderReportExport, type ReportExportInput } from '../../src/service/report-export.js';
import { localInstantLabel } from '../../src/shared/report-wording.js';
import type { ReviewReportRecord } from '../../src/shared/protocol.js';

// The 审阅报告 as a file (Issue #500, plan slice S64b part 2; V2-UX-REV-009; ADR 0079 §3.4): one recorded version laid
// out as DOCX, as the page a PDF is printed from, and in the Markdown 备用格式. The record is authored here — its
// quotations and notes are neutral phrases, not manuscript words — so an assertion may compare text whole.

const COUNTS = { must: 1, should: 2, note: 0, pending: 2, handled: 1, ignored: 0 };
const NO_COUNTS = { must: 0, should: 0, note: 0, pending: 0, handled: 0, ignored: 0 };

function record(overrides: Partial<ReviewReportRecord> = {}): ReviewReportRecord {
  return {
    schema: 'ai7.review.report/1',
    reviewRunId: 'run-1',
    version: 2,
    generatedAt: '2026-09-23T10:00:00.000Z',
    run: { ordinal: 1, label: '第 1 次', createdAt: '2026-09-23T09:00:00.000Z', scopeLabel: '全书', manuscript: { revisionId: 'rev-1', revisionLabel: 'r2', journalSequence: 7 } },
    overview: {
      title: '概览表',
      rows: [
        { categoryId: 'typos', label: '错别字与规范用语', state: 'completed', stateLabel: '已完成', counts: COUNTS },
        { categoryId: 'style', label: '体例与格式', state: 'completed', stateLabel: '已完成', counts: NO_COUNTS },
      ],
    },
    mustItems: {
      title: '必须处理的事项',
      items: [
        { findingId: 'f-1', categoryId: 'typos', categoryLabel: '错别字与规范用语', locationLabel: '内容块 3', quote: '示例*引文', note: '请核对。\n- 另见第二处', status: 'pending', statusLabel: '待处理' },
      ],
    },
    categorySummaries: {
      title: '各类别摘要',
      entries: [
        { categoryId: 'typos', label: '错别字与规范用语', output: 'change-suggestion', counts: COUNTS, basisStatement: '依据：示例规范。', excludedCount: 0, stateLine: '已完成' },
        { categoryId: 'style', label: '体例与格式', output: 'annotation', counts: NO_COUNTS, basisStatement: '依据：示例体例 <第二版>。', excludedCount: 2, stateLine: '已完成' },
      ],
    },
    appendix: {
      title: '附录',
      configuration: { schema: 'ai7.review.configuration/1', version: '1', digest: 'd'.repeat(64) },
      categories: [
        {
          categoryId: 'typos', label: '错别字与规范用语',
          guidelineDocuments: [{ documentId: 'doc-1', title: '示例规范', issuer: '示例单位', version: '1' }],
          procedure: { procedureId: 'proc-1', title: '示例工序', version: '1' },
          planEnvelopeDigest: null, resultSetRevisionId: null, adapterPin: null,
        },
        {
          categoryId: 'style', label: '体例与格式', guidelineDocuments: [],
          procedure: { procedureId: 'proc-2', title: '体例工序', version: '2' },
          planEnvelopeDigest: null, resultSetRevisionId: null, adapterPin: null,
        },
      ],
    },
    ...overrides,
  } as ReviewReportRecord;
}

function input(overrides: Partial<ReviewReportRecord> = {}): ReportExportInput {
  const value = record(overrides);
  return { bookTitle: '示例书名', version: value.version, generatedAt: value.generatedAt, record: value };
}

const decode = (bytes: Uint8Array | null): string => new TextDecoder().decode(bytes!);
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-report-export-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('the 审阅报告 as a file', () => {
  it('names a refused category by its decision-layer state, never the technical line it carries (reading 4)', async () => {
    const refusedLine = '派发前已阻止：Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝，未构造 Provider payload（EXECUTION_STOPPING）';
    const base = record();
    const refused = input({
      overview: { ...base.overview, rows: [base.overview.rows[0]!, { ...base.overview.rows[1]!, state: 'blocked', stateLabel: '派发前已阻止' }] },
      categorySummaries: { ...base.categorySummaries, entries: [base.categorySummaries.entries[0]!, { ...base.categorySummaries.entries[1]!, stateLine: refusedLine }] },
      appendix: {
        ...base.appendix,
        categories: base.appendix.categories.map((category) => ({ ...category, adapterPin: { route: 'ai7-local-deterministic', model: 'ai7-local-deterministic-model', fixtureIdentity: 'fixture', fixtureSha256: 'f'.repeat(64) } })),
      },
    } as Partial<ReviewReportRecord>);
    const markdown = decode(renderReportExport(refused, 'markdown', { emit: true }).bytes);
    const page = decode(renderReportExport(refused, 'pdf', { emit: true }).bytes);
    const docxPath = join(sandbox, 'refused.docx');
    await writeFile(docxPath, renderReportExport(refused, 'docx', { emit: true }).bytes!);
    const blocks: ParsedDocxBlock[] = [];
    await parseDocx(docxPath, 'refused.docx', (block) => blocks.push(block));
    const words = blocks.map((block) => block.text).join(' ');
    for (const text of [markdown, page, words]) {
      expect(text).toContain('体例与格式 · 派发前已阻止');
      for (const technical of ['Provider Processing', 'DeepSeek', 'EXECUTION_STOPPING', 'payload', 'ai7-local-deterministic', 'f'.repeat(64)]) {
        expect(text).not.toContain(technical);
      }
    }
  });

  it('writes the Markdown 备用格式: the title, what it reports on, a table, the items numbered, each summary, and the appendix', () => {
    const generated = localInstantLabel('2026-09-23T10:00:00.000Z');
    const result = renderReportExport(input(), 'markdown', { emit: true });
    expect(decode(result.bytes)).toBe([
      '# 示例书名 · 审阅报告',
      `第 1 次审阅 · 全书 · 稿件修订版 r2 · 报告第 2 版 · 生成于 ${generated}`,
      '## 概览表',
      '| 类别 | 状态 | 发现 |\n| --- | --- | --- |\n' +
        '| 错别字与规范用语 | 已完成 | 必须处理 1 · 建议处理 2 · 提示 0 · 待处理 2 · 已处理 1 · 已忽略 0 |\n' +
        '| 体例与格式 | 已完成 | 必须处理 0 · 建议处理 0 · 提示 0 · 待处理 0 · 已处理 0 · 已忽略 0 |',
      '## 必须处理的事项',
      // A line break in a note stays a hard break, and the line after it cannot open a list inside the item.
      '1. 错别字与规范用语 · 内容块 3 · 「示例\\*引文」 · 请核对。\\\n   \\- 另见第二处 · 待处理',
      '## 各类别摘要',
      '### 错别字与规范用语 · 已完成',
      '必须处理 1 · 建议处理 2 · 提示 0 · 待处理 2 · 已处理 1 · 已忽略 0',
      '依据：示例规范。',
      '列出的发现都已在稿件上定位',
      '### 体例与格式 · 已完成',
      '必须处理 0 · 建议处理 0 · 提示 0 · 待处理 0 · 已处理 0 · 已忽略 0',
      '依据：示例体例 \\<第二版\\>。',
      '另有 2 条无法在稿件上定位，没有列为发现',
      '## 附录',
      '- 审阅配置第 1 版\n- 错别字与规范用语：示例单位 · 示例规范（第 1 版）；工序：示例工序（第 1 版）\n- 体例与格式：没有规范文件；工序：体例工序（第 2 版）',
    ].join('\n\n') + '\n');
  });

  it('lays out the PDF\'s page as a table, a numbered list and the appendix, with nothing to load', () => {
    const page = decode(renderReportExport(input(), 'pdf', { emit: true }).bytes);
    expect(page.startsWith('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">')).toBe(true);
    expect(page).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`);
    expect(page).toContain('<title>示例书名 · 审阅报告</title>');
    expect(page).not.toMatch(/<script|<img|<link|url\(|https?:/iu);
    expect(page).toContain('<h1 class="book-title">示例书名 · 审阅报告</h1>');
    expect(page).toContain('<thead><tr><th scope="col">类别</th><th scope="col">状态</th><th scope="col">发现</th></tr></thead>');
    expect(page).toContain('<tr><th scope="row">错别字与规范用语</th><td>已完成</td><td>必须处理 1 · 建议处理 2 · 提示 0 · 待处理 2 · 已处理 1 · 已忽略 0</td></tr>');
    expect(page).toContain('<ol><li>错别字与规范用语 · 内容块 3 · 「示例*引文」 · 请核对。<br>- 另见第二处 · 待处理</li></ol>');
    expect(page).toContain('<p>依据：示例体例 &lt;第二版&gt;。</p>');
    expect([...page.matchAll(/<h2>([^<]+)<\/h2>/gu)].map((match) => match[1])).toEqual(['概览表', '必须处理的事项', '各类别摘要', '附录']);
    expect(page.match(/<h3>/gu)?.length).toBe(2);
  });

  it('writes a DOCX the product reads back: the title, a heading per part, the table, and every line', async () => {
    const bytes = renderReportExport(input(), 'docx', { emit: true }).bytes!;
    const parts = unzipSync(bytes);
    expect(Object.keys(parts)).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml',
    ]);
    const documentXml = strFromU8(parts['word/document.xml']!);
    expect(documentXml.match(/<w:tbl>/gu)?.length).toBe(1);
    expect(documentXml.match(/<w:tr>/gu)?.length).toBe(3);
    expect(documentXml).toContain('<w:tblHeader/>');
    expect(strFromU8(parts['docProps/core.xml']!)).toContain('<dc:title>示例书名 · 审阅报告</dc:title>');
    const path = join(sandbox, 'report.docx');
    await writeFile(path, bytes);
    const blocks: ParsedDocxBlock[] = [];
    await parseDocx(path, 'report.docx', (block) => blocks.push(block));
    const shaped = blocks.map((block) => `${block.kind}:${block.level ?? ''}:${block.text}`);
    expect(shaped[0]).toBe('title:1:示例书名 · 审阅报告');
    expect(shaped.filter((line) => line.startsWith('heading:1:'))).toEqual(['heading:1:概览表', 'heading:1:必须处理的事项', 'heading:1:各类别摘要', 'heading:1:附录']);
    expect(shaped.filter((line) => line.startsWith('heading:2:'))).toEqual(['heading:2:错别字与规范用语 · 已完成', 'heading:2:体例与格式 · 已完成']);
    expect(blocks.map((block) => block.text)).toContain('1. 错别字与规范用语 · 内容块 3 · 「示例*引文」 · 请核对。\n- 另见第二处 · 待处理');
    expect(blocks.map((block) => block.text)).toContain('体例与格式：没有规范文件；工序：体例工序（第 2 版）');
  });

  it('reviews its four parts in each format — only Markdown\'s table is 降级导出 — and writes the same bytes for the same version', () => {
    const rows = (format: 'docx' | 'pdf' | 'markdown') => renderReportExport(input(), format, { emit: false }).fidelity
      .map((row) => `${row.key}:${row.status}:${row.count}`);
    expect(rows('docx')).toEqual(['report-overview:preserved:2', 'report-must-items:preserved:1', 'report-summaries:preserved:2', 'report-appendix:preserved:3']);
    expect(rows('pdf')).toEqual(rows('docx'));
    expect(rows('markdown')).toEqual(['report-overview:degraded:2', 'report-must-items:preserved:1', 'report-summaries:preserved:2', 'report-appendix:preserved:3']);
    expect(renderReportExport(input(), 'markdown', { emit: false }).degraded).toBe(true);
    expect(renderReportExport(input(), 'docx', { emit: false }).degraded).toBe(false);
    const markdown = renderReportExport(input(), 'markdown', { emit: false }).fidelity[0]!;
    expect(markdown.detail).toBe('写成 Markdown 表格，2 个类别各占一行；不支持表格的阅读器按文字显示。');

    // No item to handle: the part says so, and still counts as written.
    const none = renderReportExport(input({ mustItems: { title: '必须处理的事项', items: [] } }), 'docx', { emit: true });
    expect(none.fidelity[1]).toMatchObject({ key: 'report-must-items', status: 'preserved', count: 0, detail: '没有必须处理的事项。' });
    const noneMarkdown = decode(renderReportExport(input({ mustItems: { title: '必须处理的事项', items: [] } }), 'markdown', { emit: true }).bytes);
    expect(noneMarkdown).toContain('## 必须处理的事项\n\n没有必须处理的事项。\n\n## 各类别摘要');

    for (const format of ['docx', 'pdf', 'markdown'] as const) {
      const first = renderReportExport(input(), format, { emit: true }).bytes!;
      expect(digest(renderReportExport(input(), format, { emit: true }).bytes!)).toBe(digest(first));
      expect(renderReportExport(input(), format, { emit: false }).bytes).toBeNull();
    }
    expect(REPORT_EXPORT_WRITER_IDENTITIES).toEqual({ docx: 'ai7-report-docx/1', pdf: 'ai7-report-pdf/1', markdown: 'ai7-report-markdown/1' });
  });
});
