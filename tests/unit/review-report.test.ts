import { describe, expect, it } from 'vitest';
import { MAX_REPORT_FINDING_BYTES, buildReviewReport, reportChapterOf, reportQuote, reviewFindingCounts, type ReviewReportFindingInput, type ReviewReportInput } from '../../src/service/review/review-report.js';

// Unit suite for the 审阅报告 record (Issue #417, REV-009). Public synthetic text only.

const INPUT: ReviewReportInput = {
  reviewRunId: '11111111-1111-4111-8111-111111111111',
  version: 2,
  generatedAt: '2026-09-21T00:00:00.000Z',
  run: {
    ordinal: 3,
    label: '第 3 次',
    createdAt: '2026-09-20T00:00:00.000Z',
    scopeLabel: '全书',
    manuscript: { revisionId: '22222222-2222-4222-8222-222222222222', revisionLabel: 'R2', journalSequence: 4 },
  },
  configuration: { schema: 'ai7.review.category-configuration/1', version: '1', digest: 'a'.repeat(64) },
  categories: [
    {
      categoryId: 'typos-and-usage', label: '错别字与规范用语', output: 'change-suggestion', state: 'settled', stateLabel: '已完成 · 发现可处理',
      stateLine: '已完成 · 发现可处理', basisStatement: '依据：…', excludedCount: 2,
      guidelineDocuments: [{ documentId: 'ai7-builtin/typos-and-usage', title: '文字规范条款', issuer: 'AI7 内置默认', version: '1' }],
      procedure: { procedureId: 'ai7-review-procedure/typos-and-usage', title: '错别字与规范用语审阅工序', version: '1' },
      planEnvelopeDigest: 'b'.repeat(64), resultSetRevisionId: '33333333-3333-4333-8333-333333333333',
      adapterPin: { route: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', fixtureIdentity: 'fixture', fixtureSha256: 'c'.repeat(64) },
    },
    {
      categoryId: 'plot-consistency', label: '情节逻辑与前后一致', output: 'annotation', state: 'refused', stateLabel: '未能开始',
      stateLine: '未能开始：先完成基线分析，才有前后不一致的线索。', basisStatement: '依据：…', excludedCount: 0,
      guidelineDocuments: [], procedure: { procedureId: 'p', title: '线索转批注', version: '1' },
      planEnvelopeDigest: null, resultSetRevisionId: null, adapterPin: null,
    },
  ],
  findings: [
    { findingId: 'rvf_1', categoryId: 'typos-and-usage', severity: 'must', status: 'handled', quote: '甲乙', note: '改。', locationLabel: '内容块 3' },
    { findingId: 'rvf_2', categoryId: 'typos-and-usage', severity: 'should', status: 'pending', quote: '丙', note: '改。', locationLabel: '内容块 4' },
    { findingId: 'rvf_3', categoryId: 'typos-and-usage', severity: 'must', status: 'ignored', quote: '丁', note: '改。', locationLabel: '内容块 5' },
  ],
};

describe('the 审阅报告 record', () => {
  it('holds the four sections in their order with their Chinese titles', () => {
    const report = buildReviewReport(INPUT);
    expect(report.schema).toBe('ai7.review.report/2');
    expect([report.overview.title, report.mustItems.title, report.categorySummaries.title, report.appendix.title])
      .toEqual(['概览表', '必须处理的事项', '各类别摘要', '附录']);
    expect(report.version).toBe(2);
  });

  it('counts every finding once by severity and once by status, per category', () => {
    const report = buildReviewReport(INPUT);
    expect(report.overview.rows[0]!.counts).toEqual({ must: 2, should: 1, note: 0, pending: 1, handled: 1, ignored: 1 });
    expect(report.overview.rows[1]!.counts).toEqual({ must: 0, should: 0, note: 0, pending: 0, handled: 0, ignored: 0 });
    expect(reviewFindingCounts(INPUT.findings)).toEqual({ must: 2, should: 1, note: 0, pending: 1, handled: 1, ignored: 1 });
  });

  it('lists every 必须处理 finding whatever became of it, placed by position', () => {
    const report = buildReviewReport(INPUT);
    expect(report.mustItems.items.map((item) => [item.findingId, item.locationLabel, item.statusLabel])).toEqual([
      ['rvf_1', '内容块 3', '已处理'],
      ['rvf_3', '内容块 5', '已忽略'],
    ]);
  });

  it('names in its appendix the configuration, each category\'s guideline and 工序 versions, and what each read', () => {
    const report = buildReviewReport(INPUT);
    expect(report.appendix.configuration.digest).toBe('a'.repeat(64));
    expect(report.appendix.categories[0]).toMatchObject({
      guidelineDocuments: [{ title: '文字规范条款', version: '1' }],
      procedure: { version: '1' },
      planEnvelopeDigest: 'b'.repeat(64),
      adapterPin: { fixtureIdentity: 'fixture' },
    });
    expect(report.categorySummaries.entries[1]).toMatchObject({ stateLine: '未能开始：先完成基线分析，才有前后不一致的线索。', excludedCount: 0 });
  });

  it('carries a quotation of at most 80 graphemes', () => {
    const long = '字'.repeat(120);
    expect([...reportQuote(long)]).toHaveLength(80);
    expect(reportQuote(long).endsWith('…')).toBe(true);
    expect(reportQuote('短句')).toBe('短句');
  });
});

// Version /2 (ADR 0095 §5; Issue #1174): a derived view of the cards. Chapters are named by position only.
const CHAPTERS = [
  { blockId: 'b1', title: '（不写入报告）', level: 1, position: 1, endPosition: 4 },
  { blockId: 'b5', title: '（不写入报告）', level: 1, position: 5, endPosition: 9 },
];
const SOURCE = { name: '示例来源', url: 'https://example.org/a', snippet: null, translation: null, note: '候选来源 · 尚未核对 · 支持', evidenceId: null };
const placed = (finding: ReviewReportFindingInput, position: number | null, from = 0): ReviewReportFindingInput =>
  ({ ...finding, place: { blockId: `blk-${position}`, position, fromGrapheme: from, toGrapheme: from + 2 }, chapter: reportChapterOf(CHAPTERS, position) });
const V2: ReviewReportInput = {
  ...INPUT,
  findings: [
    placed({ ...INPUT.findings[0]!, replacement: '甲丙' }, 3),
    placed({ findingId: 'rvf_4', categoryId: 'plot-consistency', severity: 'note', status: 'pending', quote: '甲乙', note: '前后不一。', locationLabel: '内容块 3', replacement: null, sources: [SOURCE] }, 3),
    placed(INPUT.findings[1]!, 6),
    placed(INPUT.findings[2]!, null),
  ],
};

describe('the 审阅报告 record, version /2', () => {
  it('names a chapter by its order and block positions, and places what is outside or gone after every chapter', () => {
    expect(reportChapterOf(CHAPTERS, 7)).toEqual({ order: 2, label: '章节 2（内容块 5–9）' });
    expect(reportChapterOf(CHAPTERS.slice(0, 1), 7)).toEqual({ order: 2, label: '章节之外' });
    expect(reportChapterOf(CHAPTERS, null)).toEqual({ order: 4, label: '内容块已不在当前稿件中' });
  });

  it('counts each finding once per chapter and category, so its totals are the overview\'s', () => {
    const report = buildReviewReport(V2);
    expect(report.totals).toEqual(reviewFindingCounts(V2.findings));
    expect(report.statistics!.categories.map((category) => category.label)).toEqual(['错别字与规范用语', '情节逻辑与前后一致']);
    expect(report.statistics!.rows).toEqual([
      { label: '章节 1（内容块 1–4）', counts: [1, 1], total: 2 },
      { label: '章节 2（内容块 5–9）', counts: [1, 0], total: 1 },
      { label: '内容块已不在当前稿件中', counts: [1, 0], total: 1 },
    ]);
    expect([report.statistics!.totals, report.statistics!.total]).toEqual([[3, 1], 4]);
    expect(report.overview.rows.map((row) => row.counts.must + row.counts.should + row.counts.note)).toEqual([3, 1]);
  });

  it('merges the same quotation at the same place across categories into one row with every category, the highest severity and the union of sources', () => {
    const report = buildReviewReport(V2);
    expect(report.findings!.entries).toHaveLength(3);
    expect(report.findings!.entries[0]).toEqual({
      findingIds: ['rvf_1', 'rvf_4'], categoryLabels: ['错别字与规范用语', '情节逻辑与前后一致'], severityLabel: '必须处理', statusLabel: '已处理；待处理',
      chapterLabel: '章节 1（内容块 1–4）', locationLabel: '内容块 3', quote: '甲乙', suggestedText: '甲丙', reason: '改。；前后不一。', sources: [SOURCE],
    });
    expect(report.findings!.entries.map((entry) => entry.findingIds)).toEqual([['rvf_1', 'rvf_4'], ['rvf_2'], ['rvf_3']]);
    expect(report.findings!.entries[1]).toMatchObject({ suggestedText: null, sources: [] });
    expect(report.findings!.omitted).toBe(0);
  });

  it('bounds the 发现详单 by bytes and counts the rows it left out; a long excerpt is shortened like a quotation', () => {
    const note = '说'.repeat(4_000);
    const many = Array.from({ length: 30 }, (_, index) => placed({ ...INPUT.findings[1]!, findingId: `rvf_m${index}`, note,
      sources: [{ ...SOURCE, snippet: '摘'.repeat(500) }] }, 6, index * 3));
    const report = buildReviewReport({ ...INPUT, findings: many });
    const listed = report.findings!.entries.length;
    expect(listed).toBeGreaterThan(0);
    expect(report.findings!.omitted).toBeGreaterThan(0);
    expect(listed + report.findings!.omitted).toBe(30);
    expect(Buffer.byteLength(JSON.stringify(report.findings!.entries), 'utf8')).toBeLessThanOrEqual(MAX_REPORT_FINDING_BYTES);
    expect([...report.findings!.entries[0]!.sources[0]!.snippet!]).toHaveLength(200);
    expect(report.statistics!.total).toBe(30);
  });
});
