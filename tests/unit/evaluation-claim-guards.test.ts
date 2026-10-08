import { describe, expect, it } from 'vitest';
import { claimsConclusion, claimsQuantity, claimsScore } from '../../src/service/evaluation/claim-guards.js';

describe('what AI7\'s evaluation words may not claim (Issue #429, S81b2)', () => {
  it('finds a quantity in Arabic, full-width or Chinese numerals before a unit, a percentage or odds, and nothing in the Book\'s own figures', () => {
    for (const text of ['首年销量约八千册。', '获奖可能约有三成。', '同类书年销5万册。', '定价约４５元。', '可卖到百分之六十。', '销量可翻两倍。', '获奖概率不高。',
      '市场占有率约 12%。', '首印 3,000 册。', '约1.5万册。', '涨几个百分点。']) {
      expect(claimsQuantity(text), text).toBe(true);
    }
    for (const text of ['第3章的冲突最适合做营销话题。', '对80年代背景感兴趣的读者。', '适合2-3个渠道并行。', '一本学术悬疑小说。', '全书分为十二章。',
      '有参评文学奖的潜力，但确定性低。', '书中的青铜器与甲骨文。', '成年读者。', '多数成年读者。']) {
      expect(claimsQuantity(text), text).toBe(false);
    }
  });

  it('finds a score in a 评语 — digits or Chinese numerals before 分, a fraction, 满分 — and not 十分, 部分, 三分之一 or minutes', () => {
    for (const text of ['本项可给 18 分。', '可得16.5分。', '13 / 20 的分数偏低。', '离满分还远。', '应给十八分。', '只值两分。']) {
      expect(claimsScore(text), text).toBe(true);
    }
    for (const text of ['叙述十分凝练。', '部分章节节奏拖沓。', '约三分之一的篇幅写考古。', '开头5分钟就进入悬念。', '结构清楚，分章合理。', '第3章最好。']) {
      expect(claimsScore(text), text).toBe(false);
    }
  });

  it('finds a conclusion only by its exact label', () => {
    const labels = ['推荐出版', '修改后再议', '暂不考虑', '退稿'];
    expect(claimsConclusion('建议推荐出版。', labels)).toBe(true);
    expect(claimsConclusion('可以修改后再议。', labels)).toBe(true);
    expect(claimsConclusion('值得推荐给文史读者。', labels)).toBe(false);
    expect(claimsConclusion('任何话', [''])).toBe(false);
  });
});
