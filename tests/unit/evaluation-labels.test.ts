import { describe, expect, it } from 'vitest';
import {
  EVALUATION_AI7_PENDING,
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
  evaluationScore,
  evaluationScoreInvalidLine,
  evaluationTotalLine,
  evaluationUnsavedLine,
  evaluationVersionLine,
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
    expect(EVALUATION_AI7_PENDING).toBe('AI7 初评尚未接通：这一版由你打分。');
    expect([evaluationScore(18), evaluationScore(16.5)]).toEqual(['18', '16.5']);
    expect(evaluationTotalLine(PROFILE, { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 })).toBe('总分 66.5 / 80 · 优秀（1 项不评）');
    expect(evaluationTotalLine(PROFILE, { score: 34, fullMarks: 100, notRated: 0, unscored: 3 })).toBe('总分 34 / 100 · 还有 3 项没有打分');
    expect(evaluationItemLegend(PROFILE.items[0]!)).toBe('文学品质与作者声音 · 满分 20');
    expect(evaluationHeading({ ordinal: 2, state: 'editing' })).toBe('第 2 版 · 编辑评分中');
    expect(evaluationRevisionLine({ revisionLabel: 'r1', uncheckpointed: false })).toBe('评估的是修订版 r1');
    expect(evaluationRevisionLine({ revisionLabel: 'r1', uncheckpointed: true })).toBe('评估的是修订版 r1（当时另有写入修订日志、尚未保存为修订版的改动）');
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
