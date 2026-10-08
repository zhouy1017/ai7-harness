import { describe, expect, it } from 'vitest';
import { BUILTIN_EVALUATION_PROFILE } from '../../src/service/evaluation-records.js';
import { claimsConclusion, claimsQuantity, claimsScore } from '../../src/service/evaluation/claim-guards.js';

/** The built-in profile's 满分 and its total: the denominators a score is written over. */
const FULL_MARKS = [...BUILTIN_EVALUATION_PROFILE.items.map((item) => item.fullMarks), BUILTIN_EVALUATION_PROFILE.total];
/** The house's own conclusion labels, as the rewrite contract freezes them. */
const CONCLUSIONS = BUILTIN_EVALUATION_PROFILE.conclusions.map((entry) => entry.label);

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

  it('finds copies in 本, and a bare figure after 首印, 定价, 销量 or 印数 (Issue #689)', () => {
    for (const text of ['首印八千本。', '预计销量3000本。', '首印3000。', '定价39。', '首印 3,000。', '定价为 ¥39。', '首印数量约五千。', '印数一万。',
      '销量约两万。', '同类书卖到十万。', '可达百万销量。', '销量千万。', '首印两千册上下。', '售价４５。', '能卖三五千本。']) {
      expect(claimsQuantity(text), text).toBe(true);
    }
    for (const text of ['销量一直平稳。', '定价两档都可以。', '第十二本同类书。', '上下两册的篇幅。', '一本书的分量。', '首印要谨慎。']) {
      expect(claimsQuantity(text), text).toBe(false);
    }
  });

  it('passes the ordinary words a numeral opens — 这一块, 二元对立, 一成不变, 万一成功, 亿万读者, 千万不要 (Issue #689)', () => {
    for (const text of ['这一块的读者最稳定。', '书里的二元对立很鲜明。', '叙事并非一成不变。', '万一成功，会带动同类书。', '面向亿万读者的大众题材。',
      '千万不要把它当作通俗读物推广。', '千万别低估学术读者。', '全书约二十万字。', '十万余字的篇幅适合通勤阅读。', '一元论的视角。']) {
      expect(claimsQuantity(text), text).toBe(false);
    }
  });

  it('finds a score in a 评语 — digits or Chinese numerals before 分, a fraction, 满分 — and not 十分, 部分, 三分之一 or minutes', () => {
    for (const text of ['本项可给 18 分。', '可得16.5分。', '13 / 20 的分数偏低。', '离满分还远。', '应给十八分。', '只值两分。', '可给十二分。', '总分85/100。',
      '给 15 分以上。', '十八分左右', '16.5／20。', '１８分。']) {
      expect(claimsScore(text, FULL_MARKS), text).toBe(true);
    }
    for (const text of ['叙述十分凝练。', '部分章节节奏拖沓。', '约三分之一的篇幅写考古。', '开头5分钟就进入悬念。', '结构清楚，分章合理。', '第3章最好。']) {
      expect(claimsScore(text, FULL_MARKS), text).toBe(false);
    }
  });

  it('passes 入木三分, 十二分的, 一分为二 and a fraction that is no score such as 2/3 (Issue #689)', () => {
    for (const text of ['人物刻画入木三分。', '作者对史料下了十二分的功夫。', '十二分投入地写考古现场。', '把问题一分为二地看。', '约2/3的篇幅写考古。', '前 1 / 3 节奏偏慢。',
      '三分天下的格局写得清楚。']) {
      expect(claimsScore(text, FULL_MARKS), text).toBe(false);
    }
    // A fraction over a 满分 the profile does not have is no score either; over one it has, it is.
    expect(claimsScore('13 / 20', [10, 50])).toBe(false);
    expect(claimsScore('7 / 10', [10, 50])).toBe(true);
  });

  it('finds a conclusion by the house\'s own labels — 推荐出版, 修改后再议, 暂缓, 不推荐 — wherever it stands in the line', () => {
    expect(CONCLUSIONS).toEqual(['推荐出版', '修改后再议', '暂缓', '不推荐']);
    for (const text of ['建议推荐出版。', '可以修改后再议。', '建议暂缓。', '目前暂缓出版为宜。', '不推荐。', '编辑部不推荐这部书稿。', '总体不推荐出版。']) {
      expect(claimsConclusion(text, CONCLUSIONS), text).toBe(true);
    }
    for (const text of ['值得推荐给文史读者。', '推荐语可以写得更具体。', '可以先缓一缓再改第3章。', '出版前还要修改。']) {
      expect(claimsConclusion(text, CONCLUSIONS), text).toBe(false);
    }
    expect(claimsConclusion('任何话', [''])).toBe(false);
  });

  it('reads a line in time linear in its length, however its numerals fall', () => {
    for (const text of ['一'.repeat(200_000), '1'.repeat(200_000), '1/'.repeat(100_000), '千万'.repeat(100_000), '1,'.repeat(100_000), '首印'.repeat(100_000)]) {
      const started = performance.now();
      claimsQuantity(text);
      claimsScore(text, FULL_MARKS);
      expect(performance.now() - started, text.slice(0, 4)).toBeLessThan(2_000);
    }
  });
});
