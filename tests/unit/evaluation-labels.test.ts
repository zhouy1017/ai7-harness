import { describe, expect, it } from 'vitest';
import {
  EVALUATION_ADJUSTMENT_LEGEND,
  EVALUATION_ADJUSTMENT_REASON_LABELS,
  EVALUATION_AI7_LEDE,
  EVALUATION_AI7_PENDING,
  EVALUATION_AI7_PREPARE,
  EVALUATION_STATE_LABELS,
  evaluationAi7CalibrationLine,
  evaluationAi7ConclusionLine,
  evaluationAi7ItemLine,
  evaluationSkipDamagedLine,
  evaluationSkippedRecordsLine,
  evaluationStartLabel,
  evaluationAi7LatestLine,
  evaluationAi7RecordLine,
  evaluationAi7SufficiencyLine,
  evaluationAi7TaskLine,
  evaluationAi7EvidenceLine,
  evaluationAi7EvidenceSummary,
  evaluationAi7UnreadLine,
  EVALUATION_FINALIZE_NEEDS_SCORE,
  EVALUATION_LEDE,
  EVALUATION_RECOMMEND_BLOCKED,
  EVALUATION_STAY,
  evaluationBandLine,
  evaluationComparisonLines,
  evaluationDiscardAndOpen,
  evaluationFinalizedLine,
  evaluationHeading,
  evaluationItemLegend,
  evaluationOverviewLine,
  evaluationProfilePill,
  evaluationProfileUse,
  evaluationRevisionLine,
  evaluationUnreadableLine,
  evaluationScore,
  evaluationScoreFeedback,
  evaluationScoreInvalidLine,
  evaluationTotalLine,
  evaluationUnsavedLine,
  evaluationVersionLine,
  EVALUATION_MARKET_OFFLINE,
  EVALUATION_PREDICTION_HEADING,
  EVALUATION_PRICING_BASIS,
  EVALUATION_PRICING_UNREADABLE,
  EVALUATION_COMPARABLES_UNREADABLE,
  EVALUATION_REWRITE_LEDE,
  evaluationComparableLine,
  evaluationComparablesMoreLine,
  evaluationPredictionLine,
  evaluationPricingLines,
  evaluationPricingRangeLine,
  evaluationRewriteDecidedLine,
  evaluationRewriteProposalLine,
  evaluationRewriteReadingLine,
  evaluationRewriteTaskLine,
} from '../../src/renderer/evaluation-labels.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { evaluationBand, evaluationTotal, finalizationNeedsScore, provisionalEvaluationScore, recommendationBlocked, validEvaluationScore } from '../../src/shared/evaluation-scoring.js';
import type { EvaluationProfileProjection, EvaluationRecordSummaryProjection } from '../../src/shared/protocol.js';

// Unit suite for ②C 评估's arithmetic and words (Issue #429, plan slice S81a; V2-UX-EVAL-002 to EVAL-005, EVAL-007, EVAL-012):
// the scale, the bands applied to each item by its 满分, a total that leaves `不评` out with its 满分, the cap `推荐出版` waits
// on, and every line the page says — none of which names a weight or a percentage.

const PROFILE: EvaluationProfileProjection = { ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) };
const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;

describe('a score as the editor types it (Issue #638)', () => {
  it('counts a whole or half point within its 满分, and takes anything else for no score, saying so', () => {
    expect(provisionalEvaluationScore('', 20)).toEqual({ score: null, invalid: false });
    expect(provisionalEvaluationScore('16.5', 20)).toEqual({ score: 16.5, invalid: false });
    expect(provisionalEvaluationScore('0', 20)).toEqual({ score: 0, invalid: false });
    expect(provisionalEvaluationScore('20', 20)).toEqual({ score: 20, invalid: false });
    for (const raw of ['25', '-5', '7.25', 'abc', 'Infinity']) expect(provisionalEvaluationScore(raw, 20)).toEqual({ score: null, invalid: true });
    // An inadmissible score reaches neither a band nor the total: the total reads that item as not yet scored.
    expect(evaluationTotal([
      { fullMarks: 20, score: provisionalEvaluationScore('25', 20).score, notRated: false },
      { fullMarks: 80, score: provisionalEvaluationScore('60', 80).score, notRated: false },
    ])).toEqual({ score: 60, fullMarks: 100, notRated: 0, unscored: 1 });
    expect(evaluationScoreInvalidLine(20)).toBe('得分要在 0 到 20 之间，按整分或半分填写；这个得分不计入总分，也不能保存。');
  });

  it('says what the field holds: a counted score, a number the scale refuses, or text the number field cannot read (Issue #638 review)', () => {
    expect(evaluationScoreFeedback('', false, 20)).toEqual({ score: null, line: null });
    expect(evaluationScoreFeedback('16.5', false, 20)).toEqual({ score: 16.5, line: null });
    expect(evaluationScoreFeedback('25', false, 20)).toEqual({ score: null, line: evaluationScoreInvalidLine(20) });
    // A type=number field reports "" for text it cannot parse; validity.badInput says it holds some.
    expect(evaluationScoreFeedback('', true, 20)).toEqual({ score: null, line: '这里填的不是数字，这一项按没有打分计；得分要在 0 到 20 之间，按整分或半分填写。' });
  });
});

describe('定稿 with every item 不评 (Issue #638; the Owner\'s answer of 2026-10-07)', () => {
  it('waits while every item is 不评, and says why', () => {
    const notRated = { score: null, notRated: true };
    expect(finalizationNeedsScore([notRated, notRated, notRated, notRated, notRated])).toBe(true);
    expect(finalizationNeedsScore([{ score: 0, notRated: false }, notRated, notRated, notRated, notRated])).toBe(false);
    // An item not yet scored is the per-item refusal's, not this one's.
    expect(finalizationNeedsScore([{ score: null, notRated: false }, notRated, notRated, notRated, notRated])).toBe(false);
    expect(finalizationNeedsScore([])).toBe(false);
    expect(EVALUATION_FINALIZE_NEEDS_SCORE).toBe('至少要给一项打分才能定稿。');
  });
});

describe('another version asked for while the open one has unsaved edits (Issue #638)', () => {
  it('says what would be lost, keeps the version by default, and names the discard', () => {
    expect(evaluationUnsavedLine(2, 1)).toBe('第 2 版有未保存的修改；打开第 1 版会放弃这些修改。');
    expect(EVALUATION_STAY).toBe('留在这一版');
    expect(evaluationDiscardAndOpen(1)).toBe('放弃修改并打开第 1 版');
  });
});

describe('评估 arithmetic', () => {
  it('takes whole and half points within 满分, and bands each item by its share of the scale', () => {
    expect([validEvaluationScore(0, 20), validEvaluationScore(16.5, 20), validEvaluationScore(20, 20)]).toEqual([true, true, true]);
    expect([validEvaluationScore(-0.5, 20), validEvaluationScore(20.5, 20), validEvaluationScore(7.25, 20), validEvaluationScore(Number.NaN, 20)])
      .toEqual([false, false, false, false]);
    // 18 of 20 is 卓越's floor; 17.5 is not; 6 of 20 is 薄弱's floor; below it 不宜.
    expect([evaluationBand(18, 20), evaluationBand(17.5, 20), evaluationBand(14, 20), evaluationBand(10, 20), evaluationBand(6, 20), evaluationBand(5.5, 20)])
      .toEqual(['excellent', 'good', 'good', 'adequate', 'weak', 'unsuitable']);
  });

  it('leaves 不评 out of the total with its 满分, and counts what is still unscored', () => {
    expect(evaluationTotal([
      { fullMarks: 20, score: 18, notRated: false },
      { fullMarks: 20, score: 16.5, notRated: false },
      { fullMarks: 20, score: null, notRated: true },
      { fullMarks: 20, score: null, notRated: false },
    ])).toEqual({ score: 34.5, fullMarks: 60, notRated: 1, unscored: 1 });
  });

  it('keeps 推荐出版 waiting while any 高 risk has no person\'s review', () => {
    expect(recommendationBlocked([{ level: 'high', reviewed: false }, { level: 'low', reviewed: false }])).toBe(true);
    expect(recommendationBlocked([{ level: 'high', reviewed: true }, { level: 'medium', reviewed: false }])).toBe(false);
    expect(recommendationBlocked([{ level: null, reviewed: false }])).toBe(false);
  });
});

describe('评估 words', () => {
  it('says the total, each item, the revision and 定稿 in the editor\'s words, never a weight', () => {
    expect(EVALUATION_LEDE).toContain('只看满分与得分');
    expect(EVALUATION_AI7_PENDING).toBe('这一版不是从 AI7 初评开始的：由你打分。');
    expect([evaluationScore(18), evaluationScore(16.5)]).toEqual(['18', '16.5']);
    expect(evaluationTotalLine(PROFILE, { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 })).toBe('总分 66.5 / 80 · 优秀（1 项不评）');
    expect(evaluationTotalLine(PROFILE, { score: 34, fullMarks: 100, notRated: 0, unscored: 3 })).toBe('总分 34 / 100 · 还有 3 项没有打分');
    expect(evaluationItemLegend(PROFILE.items[0]!)).toBe('文学品质与作者声音 · 满分 20');
    expect(evaluationHeading({ ordinal: 2, state: 'editing' })).toBe('第 2 版 · 编辑评分中');
    expect(evaluationRevisionLine({ revisionLabel: 'r1', uncheckpointed: false })).toBe('评估的是修订版 r1');
    expect(evaluationRevisionLine({ revisionLabel: 'r1', uncheckpointed: true })).toBe('评估的是修订版 r1（当时另有写入修订日志、尚未保存为修订版的改动）');
    // The versions that cannot be read are named beside the list (Issue #702 review).
    expect(evaluationUnreadableLine([])).toBeNull();
    expect(evaluationUnreadableLine([1, 3])).toBe('第 1、3 版评估记录已损坏，无法显示；其他版本照常可用。');
    // Every version damaged: no 其他版本 to promise (Issue #708).
    expect(evaluationUnreadableLine([1, 2], false)).toBe('第 1、2 版评估记录已损坏，无法显示。');
    expect(evaluationUnreadableLine([], false)).toBeNull();
    expect(evaluationFinalizedLine({ finalized: { actor: '本机编辑', at: '2026-09-25T03:00:00.000Z' } }, instant)).toBe('定稿 · 本机编辑 · 〔2026-09-25〕');
    expect(evaluationFinalizedLine({ finalized: null }, instant)).toBeNull();
    expect(EVALUATION_RECOMMEND_BLOCKED).toBe('有「高」风险还没有经人工复核，「推荐出版」暂不能选。');
    for (const line of [evaluationTotalLine(PROFILE, { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 }), ...PROFILE.bands.map(evaluationBandLine)]) {
      expect(line).not.toMatch(/权重|%|百分比/u);
    }
  });

  it('lists each version and the overview line, and compares a version with the one before item by item', () => {
    const summary: EvaluationRecordSummaryProjection = {
      recordId: 'r', ordinal: 1, state: 'finalized', revisionLabel: 'r1', total: { score: 81.5, fullMarks: 100, notRated: 0, unscored: 0 },
      conclusion: 'revise', createdAt: '2026-09-25T01:00:00.000Z', finalizedAt: '2026-09-25T02:00:00.000Z',
    };
    expect(evaluationVersionLine(PROFILE, summary)).toBe('第 1 版 · 定稿 · 修订版 r1 · 总分 81.5 / 100 · 优秀 · 修改后再议');
    expect(evaluationOverviewLine({ profile: PROFILE, records: [] })).toBe('还没有评估。');
    expect(evaluationOverviewLine({ profile: PROFILE, records: [{ ...summary, state: 'editing', conclusion: null }] }))
      .toBe('第 1 版 · 编辑评分中 · 修订版 r1 · 总分 81.5 / 100 · 优秀');
    expect(evaluationComparisonLines(PROFILE, {
      previousOrdinal: 1,
      items: [
        { itemId: 'literary-quality', previous: 18, current: 19 },
        { itemId: 'theme-and-context', previous: 16.5, current: 16.5 },
        { itemId: 'readers-and-market', previous: 'not-rated', current: 14 },
      ],
      risks: [{ riskId: 'law-rights-ethics-policy', previous: 'high', current: 'medium' }],
      total: { previous: { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 }, current: { score: 81.5, fullMarks: 100, notRated: 0, unscored: 0 } },
      conclusion: { previous: 'recommend', current: 'revise' },
    })).toEqual({
      heading: '与第 1 版相比',
      lines: ['文学品质与作者声音：18 → 19', '读者与市场潜力：不评 → 14', '法律、权利、伦理与出版政策：高 → 中', '总分：66.5 / 80 → 81.5 / 100', '结论：推荐出版 → 修改后再议'],
    });
  });

  it('states 知识库 › 评估方案: its version and issuer, each band by its floor and anchor, and its use', () => {
    expect(evaluationProfilePill(PROFILE)).toBe('第 1 版 · AI7 内置默认');
    expect(PROFILE.bands.map(evaluationBandLine)).toEqual([
      '卓越 · 90 分及以上（单项按满分折算）：可作为同类书的标杆。',
      '优秀 · 70 分及以上（单项按满分折算）：明显高于出版要求，少量修改即可。',
      '合格 · 50 分及以上（单项按满分折算）：达到出版要求，需要常规修改。',
      '薄弱 · 30 分及以上（单项按满分折算）：低于出版要求，需要较大修改。',
      '不宜 · 其余：在这一项上不宜出版。',
    ]);
    expect([evaluationProfileUse({ records: 0, books: 0 }), evaluationProfileUse({ records: 3, books: 2 })]).toEqual(['还没有评估用过', '已用于 2 本书的 3 版评估']);
    // The default profile divides the 100 evenly over its five items (EVAL-002, EVAL-003).
    expect(PROFILE.items.map((item) => item.fullMarks).reduce((sum, value) => sum + value, 0)).toBe(PROFILE.total);
    expect(new Set(PROFILE.items.map((item) => item.fullMarks)).size).toBe(1);
  });
});

describe('AI7 初评 words (Issue #429, S81b1; EVAL-001, EVAL-005 to EVAL-007)', () => {
  const draftItem = { score: 16.5, sufficiency: 'sufficient' as const, citedBlocks: 9, unitsCited: 8 };
  it('says AI7\'s score beside the editor\'s with how well it stands, and never as the editor\'s', () => {
    expect(evaluationAi7ItemLine(draftItem, 20)).toBe('AI7 初评 16.5 / 20 · 依据充分度 充分（引用 9 个段落，分布在 8 个阅读范围）');
    expect(evaluationAi7ItemLine({ ...draftItem, score: null, sufficiency: 'insufficient', citedBlocks: 0, unitsCited: 0 }, 20))
      .toBe('AI7 初评 没有给出分数 · 依据充分度 不足（没有引用内容块）');
    expect(evaluationAi7SufficiencyLine({ sufficiency: 'fair', citedBlocks: 2, unitsCited: 1 })).toBe('依据充分度 一般（引用 2 个段落，分布在 1 个阅读范围）');
    expect(evaluationAi7RecordLine({ ordinal: 2, revisionLabel: 'r3' })).toBe('这一版从 AI7 第 2 次初评开始（读的是修订版 r3）：AI7 的分数列在每一项旁边，记录保存的是你的评分。');
    expect(EVALUATION_AI7_LEDE).toContain('记录保存的是你的评分，结论由你选定');
    expect(EVALUATION_STATE_LABELS).toEqual({ draft: 'AI7 初稿', editing: '编辑评分中', finalized: '定稿' });
  });

  it('marks AI7\'s suggested conclusion as AI7\'s, and names the five adjustment reasons unticked', () => {
    expect(evaluationAi7ConclusionLine(PROFILE, 'revise')).toBe('AI7 建议的结论：修改后再议（由你选定）');
    expect(evaluationAi7ConclusionLine(PROFILE, null)).toBe('AI7 没有给出建议结论。');
    expect(Object.values(EVALUATION_ADJUSTMENT_REASON_LABELS)).toEqual(['打分偏高', '打分偏低', '依据不足', '未考虑某方面', '自行输入']);
    expect(EVALUATION_ADJUSTMENT_LEGEND).toBe('调分原因（可多选，不预先勾选）');
  });

  it('says the Task and the latest 初评 in one line each, and when the manuscript moved past it', () => {
    expect(evaluationAi7TaskLine({ taskIntentId: 'x', state: 'executing', label: '运行中' })).toBe('AI7 初评 · 运行中');
    const latest = {
      revisionId: 'r', ordinal: 1, revisionLabel: 'r1', createdAt: '2026-10-07T00:00:00.000Z', items: [], strengths: [], weaknesses: [], nextStep: null,
      suggestedConclusion: null, complete: true, current: true, total: { score: 73, fullMarks: 100, notRated: 0, unscored: 0 },
      unitsTotal: 8, unreadUnits: [], market: null,
    };
    expect(evaluationAi7LatestLine(PROFILE, latest)).toBe('第 1 次初评 · 读的是修订版 r1 · 总分 73 / 100 · 优秀');
    expect(evaluationAi7LatestLine(PROFILE, { ...latest, current: false })).toBe('第 1 次初评 · 读的是修订版 r1 · 总分 73 / 100 · 优秀（稿件此后改过：重新初评后才能从初评开始）');
    expect(evaluationAi7LatestLine(PROFILE, { ...latest, complete: false })).toBe('第 1 次初评 · 读的是修订版 r1 · 全书综合没有给出分数');
    expect(EVALUATION_AI7_PREPARE).toEqual({ 'evaluation-first': '准备 AI7 初评', 'evaluation-again': '重新初评' });
  });

  it('shows AI7\'s evidence range by range, and says which ranges a 初评 that completed with gaps never read', () => {
    expect(evaluationAi7EvidenceSummary(3)).toBe('AI7 的依据（3 条）');
    expect(evaluationAi7EvidenceSummary(3, 3)).toBe('AI7 的依据（3 条）');
    // A long Book's notes, cut to a few spread over the ranges (Issue #689), say how many there are in all.
    expect(evaluationAi7EvidenceSummary(12, 140)).toBe('AI7 的依据（共 140 条，这里列出分布在各阅读范围的 12 条）');
    expect(evaluationAi7EvidenceLine({ unitOrdinal: 2, note: '冲突在第二章升级' })).toBe('阅读范围 2：冲突在第二章升级');
    expect(evaluationAi7UnreadLine({ unitsTotal: 8, unreadUnits: [] })).toBeNull();
    expect(evaluationAi7UnreadLine({ unitsTotal: 8, unreadUnits: [3, 5] }))
      .toBe('AI7 这次没有读到 2 / 8 个阅读范围（第 3、5 个）：这些范围里的内容没有进入它的分数和评语。');
  });

  it('says the market section rests on the Book and house data, tags comparables, and says 暂无法预测 where AI7 could not tell (S81b2)', () => {
    expect(EVALUATION_MARKET_OFFLINE).toBe('未联网核查：市场部分只依据本书稿件与本社数据，没有检索外网，也没有对比他社图书或获奖作品。');
    expect(EVALUATION_PREDICTION_HEADING).toBe('预测 · 低确定性');
    expect(evaluationComparableLine({ bookId: 'b', title: '星河之二', seriesTitle: '星河', published: true, source: 'series' })).toBe('《星河之二》 · 同书系「星河」 · 已发稿');
    expect(evaluationComparableLine({ bookId: 'b', title: '星河之三', seriesTitle: '星河', published: false, source: 'series' })).toBe('《星河之三》 · 同书系「星河」 · 尚未发稿');
    expect(evaluationComparablesMoreLine({ comparables: [], comparableCount: 0 })).toBeNull();
    expect(evaluationComparablesMoreLine({ comparables: Array(10).fill({}), comparableCount: 12 })).toBe('另有 2 本同书系图书没有列出。');
    expect(evaluationPredictionLine(null)).toBe('暂无法预测');
    expect(evaluationPredictionLine({ statement: '有潜力。', basis: '主题与语言' })).toBe('有潜力。（依据：主题与语言）');
  });

  it('says what 定价与首印 waits for, and once shown the ranges with the Books they rest on (S81b2)', () => {
    const range = { books: 29, priceFen: { low: 3800, median: 4500, high: 5200 }, firstPrint: { low: 2800, median: 13500, high: 4200 } };
    expect(evaluationPricingRangeLine('本社已发稿图书', range)).toBe('本社已发稿图书 29 本：定价 ¥38.00 – ¥52.00（中位数 ¥45.00） · 首印 2,800 – 4,200 册（中位数 13,500 册）');
    const base = {
      booksWithActuals: 4, otherBooksWithActuals: 4, threshold: 30, enabled: false, available: false, unreadable: false,
      house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: 5,
    };
    expect(evaluationPricingLines(base)).toEqual(['不预测。本社已录入定价与首印的已发稿图书 4 / 30 本；满 30 本后，可在「设置 › 评估校准与预测」里打开预测。']);
    expect(evaluationPricingLines({ ...base, enabled: true })).toEqual(['不预测。本社已录入定价与首印的已发稿图书 4 / 30 本；满 30 本后，可在「设置 › 评估校准与预测」里打开预测。']);
    expect(evaluationPricingLines({ ...base, booksWithActuals: 30, available: true })).toEqual(['不预测：「设置 › 评估校准与预测」里没有打开定价与首印预测（已录入实际数据的已发稿图书 30 本）。']);
    // The gate counts the other Books only: the Book itself making 30 shows no range over 29.
    expect(evaluationPricingLines({ ...base, booksWithActuals: 30, otherBooksWithActuals: 29, available: true, enabled: true }))
      .toEqual(['不预测：不计这本书，本社已录入定价与首印的已发稿图书 29 / 30 本；范围只依据其他图书，满 30 本后才给出。']);
    const shown = { ...base, booksWithActuals: 31, otherBooksWithActuals: 30, available: true, enabled: true, house: range };
    expect(evaluationPricingLines(shown)).toEqual([evaluationPricingRangeLine('本社已发稿图书', range), EVALUATION_PRICING_BASIS]);
    // A 书系 range only over enough of its Books; below, the count and the house range alone.
    expect(evaluationPricingLines({ ...shown, seriesBooksWithActuals: 3 })).toEqual([
      '同书系已录入实际数据的已发稿图书 3 本，不足 5 本，不给出同书系的范围。', evaluationPricingRangeLine('本社已发稿图书', range), EVALUATION_PRICING_BASIS,
    ]);
    const series = { ...range, books: 5 };
    expect(evaluationPricingLines({ ...shown, series, seriesBooksWithActuals: 5 })).toEqual([
      evaluationPricingRangeLine('同书系已发稿图书', series), evaluationPricingRangeLine('本社已发稿图书', range), EVALUATION_PRICING_BASIS,
    ]);
    // House data that cannot be read this time is said as such.
    expect(evaluationPricingLines({ ...shown, unreadable: true })).toEqual([EVALUATION_PRICING_UNREADABLE]);
    expect(EVALUATION_PRICING_UNREADABLE).toContain('暂时读不到本社数据');
    expect(EVALUATION_COMPARABLES_UNREADABLE).toContain('暂时读不到本社数据');
  });

  it('says what 按我的评分重写评语 does, waits for and decided (S81b2)', () => {
    expect(EVALUATION_REWRITE_LEDE).toContain('分数一个也不改，重写的评语要你采用后才记入这一版');
    expect(evaluationRewriteTaskLine({ taskIntentId: 't', recordId: 'r', recordOrdinal: 15, entryOrdinal: 2, state: 'settled', label: '已完成' }))
      .toBe('按我的评分重写评语 · 第 15 版 · 已完成');
    const reading = { unitsTotal: 8, unitsRead: 8 };
    expect(evaluationRewriteProposalLine({ revisionId: 'x', createdAt: 'y', entryOrdinal: 2, current: true, reading, items: [], verdict: { before: null, after: '新。' }, withheld: [] }))
      .toBe('AI7 按你第 2 次保存的评分重写了评语，等你决定：采用后才记入这一版，分数不变。');
    // How much of the Book the rewrite read is said whenever it shows, and plainly when some ranges were not read.
    expect(evaluationRewriteReadingLine(reading)).toBe('AI7 这次重写读了全部 8 个阅读范围。');
    expect(evaluationRewriteReadingLine({ unitsTotal: 8, unitsRead: 6 })).toBe('AI7 这次重写只读到 6 / 8 个阅读范围：没读到的范围里的内容没有进入重写的评语。');
    expect(evaluationRewriteDecidedLine({ decision: 'accepted', entryOrdinal: 3, decidedAt: 'x' })).toBe('上一次重写的评语已采用（记为第 3 次保存），分数没有改动。');
    expect(evaluationRewriteDecidedLine({ decision: 'discarded', entryOrdinal: null, decidedAt: 'x' })).toBe('上一次重写的评语已放弃，评语保持原样。');
  });

  it('names the start that skips a damaged latest version, what it will do, and what the new version says of it (Issue #726)', () => {
    expect(evaluationStartLabel({ allowed: true, kind: 'first', fromInitial: null, skipDamaged: null })).toBe('开始评估');
    expect(evaluationStartLabel({ allowed: true, kind: 'again', fromInitial: null, skipDamaged: null })).toBe('重新评估');
    expect(evaluationStartLabel({ allowed: true, kind: 'again', fromInitial: null, skipDamaged: { skipped: [3], seedOrdinal: 2 } })).toBe('从第 2 版重新评估');
    expect(evaluationStartLabel({ allowed: true, kind: 'again', fromInitial: null, skipDamaged: { skipped: [1, 2], seedOrdinal: null } })).toBe('从头重新评估');
    expect(evaluationSkipDamagedLine({ skipped: [3], seedOrdinal: 2 })).toBe('第 3 版评估记录已损坏：重新评估将从第 2 版定稿开始，新版本会记下跳过了它。');
    expect(evaluationSkipDamagedLine({ skipped: [3, 4], seedOrdinal: 2 })).toBe('第 3、4 版评估记录已损坏：重新评估将从第 2 版定稿开始，新版本会记下跳过了这些版本。');
    expect(evaluationSkipDamagedLine({ skipped: [1, 2], seedOrdinal: null })).toBe('第 1、2 版评估记录已损坏，没有可以读取的定稿：重新评估将从头开始，新版本会记下跳过了这些版本。');
    expect(evaluationSkippedRecordsLine({ skippedRecords: [], seededFrom: 3 })).toBeNull();
    expect(evaluationSkippedRecordsLine({ skippedRecords: [3], seededFrom: 2 })).toBe('这一版跳过了已损坏的第 3 版，从第 2 版定稿重新评估。');
    expect(evaluationSkippedRecordsLine({ skippedRecords: [1, 2], seededFrom: null })).toBe('这一版跳过了已损坏的第 1、2 版，从头开始评估。');
  });

  it('shows the calibrated start beside AI7\'s raw score, and says what the house calibration did to a version (EVAL-011a)', () => {
    const item = { score: 12, sufficiency: 'insufficient' as const, citedBlocks: 0, unitsCited: 0 };
    expect(evaluationAi7ItemLine(item, 20)).toBe('AI7 初评 12 / 20 · 依据充分度 不足（没有引用内容块）');
    expect(evaluationAi7ItemLine(item, 20, null)).toBe('AI7 初评 12 / 20 · 依据充分度 不足（没有引用内容块）');
    expect(evaluationAi7ItemLine(item, 20, { adjusted: 10 })).toBe('AI7 初评 12 / 20 · 校准后 10 / 20 · 依据充分度 不足（没有引用内容块）');
    expect(evaluationAi7ItemLine({ ...item, score: 16.5 }, 20, { adjusted: 17 })).toBe('AI7 初评 16.5 / 20 · 校准后 17 / 20 · 依据充分度 不足（没有引用内容块）');
    // No raw score, nothing to calibrate: the line says so and names no adjusted score.
    expect(evaluationAi7ItemLine({ ...item, score: null }, 20, { adjusted: 1 })).toBe('AI7 初评 没有给出分数 · 依据充分度 不足（没有引用内容块）');
    expect(evaluationAi7CalibrationLine(null)).toBeNull();
    expect(evaluationAi7CalibrationLine({ basisBooks: 10, items: [{ itemId: 'readers-and-market', raw: 12, offset: -2, adjusted: 10 }] }))
      .toBe('AI7 的初评分数已按本社校准（依据 10 本书的定稿评估）：调整了 1 项的起始分数，原始分数仍列在每一项旁边；校准只调 AI7 的分数，不调风险项，也不改你的评分。');
    expect(evaluationAi7CalibrationLine({ basisBooks: 12, items: [] }))
      .toBe('AI7 的初评分数已按本社校准（依据 12 本书的定稿评估）：各项偏移为 0，起始分数未变；校准只调 AI7 的分数，不调风险项，也不改你的评分。');
  });
});
