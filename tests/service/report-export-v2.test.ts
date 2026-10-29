import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { renderReportExport, type ReportExportInput } from '../../src/service/report-export.js';
import { buildReviewReport, reportChapterOf, type ReviewReportInput } from '../../src/service/review/review-report.js';

// Issue #1174 (ADR 0095 §5): a /2 审阅报告 as a file — 章节与类别统计 as a table and each finding's sources as links in
// Markdown and DOCX, the PDF page through the existing print path, and a /1 record exactly as before. Synthetic text only.

const CHAPTERS = [{ blockId: 'b1', title: '（不写入报告）', level: 1, position: 1, endPosition: 4 }];
const SOURCE = { name: '馆藏说明', url: 'https://example.org/vessel?a=1&b="2"', snippet: '现藏湖北省博物馆', translation: '这件器物现藏湖北省博物馆。',
  note: '已精确取文 · 支持', evidenceId: null };
const category = (categoryId: string, label: string): ReviewReportInput['categories'][number] => ({
  categoryId, label, output: 'annotation', state: 'settled', stateLabel: '已完成', stateLine: '已完成', basisStatement: '依据：示例。', excludedCount: 0,
  guidelineDocuments: [], procedure: { procedureId: `p-${categoryId}`, title: '示例工序', version: '1' }, planEnvelopeDigest: null, resultSetRevisionId: null, adapterPin: null,
});
const finding = (findingId: string, categoryId: string, position: number, sources = [SOURCE]): ReviewReportInput['findings'][number] => ({
  findingId, categoryId, severity: 'must', status: 'pending', quote: '示例引文', note: '请核对。', locationLabel: `内容块 ${position}`,
  place: { blockId: `blk-${position}`, position, fromGrapheme: 0, toGrapheme: 4 }, replacement: null, chapter: reportChapterOf(CHAPTERS, position), sources,
});
const RECORD = buildReviewReport({
  reviewRunId: 'run-1', version: 1, generatedAt: '2026-10-28T00:00:00.000Z',
  run: { ordinal: 1, label: '第 1 次', createdAt: '2026-10-28T00:00:00.000Z', scopeLabel: '全书', manuscript: { revisionId: 'rev-1', revisionLabel: 'r1', journalSequence: 1 } },
  configuration: { schema: 'ai7.review.category-configuration/1', version: '1', digest: 'd'.repeat(64) },
  categories: [category('factual-review', '事实核查'), category('style', '体例与格式')],
  findings: [finding('rvf_1', 'factual-review', 2), finding('rvf_2', 'style', 2, []), finding('rvf_3', 'style', 7, [])],
});
const input = (record = RECORD): ReportExportInput => ({ bookTitle: '示例书名', version: record.version, generatedAt: record.generatedAt, record });
const text = (bytes: Uint8Array | null): string => new TextDecoder().decode(bytes!);

describe('the /2 审阅报告 as a file', () => {
  it('writes Markdown with the statistics table, the merged 发现详单 and each source as a link', () => {
    const blocks = text(renderReportExport(input(), 'markdown', { emit: true }).bytes).slice(0, -1).split('\n\n');
    expect(blocks.filter((block) => block.startsWith('## '))).toEqual(['## 概览表', '## 必须处理的事项', '## 章节与类别统计', '## 发现详单', '## 各类别摘要', '## 附录']);
    expect(blocks[blocks.indexOf('## 概览表') + 2]).toBe('全部发现：必须处理 3 · 建议处理 0 · 提示 0 · 待处理 3 · 已处理 0 · 已忽略 0');
    expect(blocks[blocks.indexOf('## 章节与类别统计') + 1]).toBe([
      '| 章节 | 事实核查 | 体例与格式 | 合计 |', '| --- | --- | --- | --- |',
      '| 章节 1（内容块 1–4） | 1 | 1 | 2 |', '| 章节之外 | 0 | 1 | 1 |', '| 合计 | 1 | 2 | 3 |',
    ].join('\n'));
    const findings = blocks.slice(blocks.indexOf('## 发现详单') + 1, blocks.indexOf('## 各类别摘要'));
    expect(findings[0]).toBe('### 第 1 条 · 事实核查、体例与格式 · 必须处理 · 待处理');
    expect(findings[1]).toBe('章节 1（内容块 1–4） · 内容块 2\\\n引文：「示例引文」\\\n理由：请核对。');
    expect(findings[2]).toBe('- [来源：馆藏说明](<https://example.org/vessel?a=1&b="2">)\\\n  已精确取文 · 支持\\\n  摘录：「现藏湖北省博物馆」\\\n  来源译文：这件器物现藏湖北省博物馆。');
    expect(findings.filter((block) => block.startsWith('### '))).toHaveLength(2);
  });

  it('writes a DOCX with both tables and each source name as a HYPERLINK field', () => {
    const documentXml = strFromU8(unzipSync(renderReportExport(input(), 'docx', { emit: true }).bytes!)['word/document.xml']!);
    expect(documentXml.match(/<w:tbl>/gu)?.length).toBe(2);
    expect(documentXml).toContain('<w:instrText xml:space="preserve"> HYPERLINK "https://example.org/vessel?a=1&amp;b=%222%22" </w:instrText>');
    expect(documentXml).toContain('<w:t xml:space="preserve">来源：馆藏说明</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/>');
    expect(documentXml.match(/HYPERLINK/gu)?.length).toBe(1);
    const page = text(renderReportExport(input(), 'pdf', { emit: true }).bytes);
    expect(page).toContain('<a href="https://example.org/vessel?a=1&amp;b=&quot;2&quot;">来源：馆藏说明</a>');
    expect([...page.matchAll(/<h2>([^<]+)<\/h2>/gu)].map((match) => match[1])).toContain('章节与类别统计');
  });

  it('says in its review what each format keeps, and a /1 record keeps its four rows', () => {
    const rows = (format: 'docx' | 'pdf' | 'markdown', record = RECORD) =>
      renderReportExport(input(record), format, { emit: false }).fidelity.map((row) => `${row.key}:${row.status}:${row.count}`);
    expect(rows('docx')).toEqual(['report-overview:preserved:2', 'report-must-items:preserved:3', 'report-statistics:preserved:3',
      'report-findings:preserved:2', 'report-summaries:preserved:2', 'report-appendix:preserved:3']);
    expect(rows('markdown').filter((row) => row.includes(':degraded:'))).toEqual(['report-overview:degraded:2', 'report-statistics:degraded:3']);
    expect(renderReportExport(input(), 'docx', { emit: false }).fidelity.find((row) => row.key === 'report-findings')?.detail).toContain('写成 Word 超链接');
    const { totals: _totals, statistics: _statistics, findings: _findings, ...v1 } = RECORD;
    const legacy = { ...v1, schema: 'ai7.review.report/1' as const };
    expect(rows('docx', legacy)).toEqual(['report-overview:preserved:2', 'report-must-items:preserved:3', 'report-summaries:preserved:2', 'report-appendix:preserved:3']);
    expect(text(renderReportExport(input(legacy), 'markdown', { emit: true }).bytes)).not.toMatch(/章节与类别统计|发现详单|全部发现/u);
  });
});
