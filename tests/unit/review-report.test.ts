import { describe, expect, it } from 'vitest';
import { buildReviewReport, reportQuote, reviewFindingCounts, type ReviewReportInput } from '../../src/service/review/review-report.js';

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
    expect(report.schema).toBe('ai7.review.report/1');
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
