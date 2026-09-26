import { describe, expect, it } from 'vitest';
import {
  ACTUALS_EMPTY,
  CALIBRATION_PAGE_LEDE,
  CALIBRATION_SCOPE,
  CALIBRATION_WAITING,
  PREDICTION_ADDS,
  actualsBookLine,
  actualsLine,
  calibrationProgressLine,
  predictionProgressLine,
} from '../../src/renderer/evaluation-calibration-labels.js';
import {
  CALIBRATION_MIN_ADJUSTMENTS,
  MAX_FIRST_PRINT,
  MAX_PRICE_FEN,
  PREDICTION_MIN_BOOKS_WITH_ACTUALS,
  calibrationActive,
  formatPriceFen,
  parseFirstPrint,
  parsePriceYuan,
  predictionAvailable,
} from '../../src/shared/evaluation-calibration.js';

// Unit suite for 设置 › 评估校准与预测 (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7): the two
// thresholds as ADR 0076 records them, when each switch applies, how the editor's typing becomes a price in 分 and a first
// print run, and every line the page states. Every number is the suite's own.

describe('评估校准与预测 thresholds', () => {
  it('keeps the thresholds ADR 0076 records: ten adjustments, thirty published Books with actuals', () => {
    expect(CALIBRATION_MIN_ADJUSTMENTS).toBe(10);
    expect(PREDICTION_MIN_BOOKS_WITH_ACTUALS).toBe(30);
  });

  it('opens the prediction only at thirty published Books with actuals, never before', () => {
    expect(predictionAvailable(0)).toBe(false);
    expect(predictionAvailable(29)).toBe(false);
    expect(predictionAvailable(30)).toBe(true);
    expect(predictionAvailable(31)).toBe(true);
  });

  it('applies calibration only at ten adjustments, and never while the editor has turned it off', () => {
    expect(calibrationActive(0, true)).toBe(false);
    expect(calibrationActive(9, true)).toBe(false);
    expect(calibrationActive(10, true)).toBe(true);
    expect(calibrationActive(10, false)).toBe(false);
    expect(calibrationActive(40, false)).toBe(false);
  });
});

describe('定价与首印 as the editor types them', () => {
  it('reads a price in yuan with at most two decimals as 分', () => {
    expect(parsePriceYuan('45')).toBe(4500);
    expect(parsePriceYuan('45.8')).toBe(4580);
    expect(parsePriceYuan('45.08')).toBe(4508);
    expect(parsePriceYuan(' 39.90 ')).toBe(3990);
    expect(parsePriceYuan('0.01')).toBe(1);
    expect(parsePriceYuan('1000000')).toBe(MAX_PRICE_FEN);
    // A Chinese input method's full-width digits and point, and its 。, read as meant (Issue #430 review).
    expect(parsePriceYuan('４５')).toBe(4500);
    expect(parsePriceYuan('４５．５')).toBe(4550);
    expect(parsePriceYuan('45。5')).toBe(4550);
    expect(parsePriceYuan('　３９．９０　')).toBe(3990);
  });

  it('refuses a price that is not a positive amount of yuan with at most two decimals', () => {
    for (const text of ['', ' ', '0', '0.00', '-45', '45.', '.5', '45.123', '4,500', '４，５００', '四十五', '45元', '¥45', '￥45', '1e3', '1000000.01', '12345678', '45。。5']) {
      expect(parsePriceYuan(text), text).toBeNull();
    }
  });

  it('reads a first print run as a whole positive number of copies', () => {
    expect(parseFirstPrint('3000')).toBe(3000);
    expect(parseFirstPrint(' 1 ')).toBe(1);
    expect(parseFirstPrint(String(MAX_FIRST_PRINT))).toBe(MAX_FIRST_PRINT);
    expect(parseFirstPrint('３０００')).toBe(3000);
  });

  it('refuses a first print run that is not a whole positive number of copies', () => {
    for (const text of ['', '0', '-3000', '3000.5', '3000。5', '3,000', '三千', '3000册', '1e4', String(MAX_FIRST_PRINT + 1), '1234567890']) {
      expect(parseFirstPrint(text), text).toBeNull();
    }
  });

  it('writes 分 back as yuan with two decimals, and round-trips what it reads', () => {
    expect(formatPriceFen(4500)).toBe('¥45.00');
    expect(formatPriceFen(4508)).toBe('¥45.08');
    expect(formatPriceFen(1)).toBe('¥0.01');
    expect(formatPriceFen(MAX_PRICE_FEN)).toBe('¥1000000.00');
    for (const fen of [1, 99, 100, 3990, 4580, 123_456]) expect(parsePriceYuan(formatPriceFen(fen).slice(1))).toBe(fen);
  });
});

describe('评估校准与预测 words', () => {
  it('states calibration\'s progress toward its threshold, and whether it is off, waiting or applying', () => {
    expect(calibrationProgressLine({ adjustments: 0, threshold: 10, enabled: true, active: false })).toBe('调分记录 0 / 10 本 · 满 10 本后生效');
    expect(calibrationProgressLine({ adjustments: 3, threshold: 10, enabled: false, active: false })).toBe('调分记录 3 / 10 本 · 已关闭');
    expect(calibrationProgressLine({ adjustments: 12, threshold: 10, enabled: true, active: true })).toBe('调分记录 12 / 10 本 · 已生效');
  });

  it('states what the prediction switch waits for until it may be turned on, then whether it is on', () => {
    expect(predictionProgressLine({ booksWithActuals: 1, threshold: 30, enabled: false, available: false }))
      .toBe('已录入实际数据的已发稿图书 1 / 30 本 · 满 30 本后才能打开');
    expect(predictionProgressLine({ booksWithActuals: 30, threshold: 30, enabled: false, available: true }))
      .toBe('已录入实际数据的已发稿图书 30 / 30 本 · 可以打开');
    expect(predictionProgressLine({ booksWithActuals: 31, threshold: 30, enabled: true, available: true }))
      .toBe('已录入实际数据的已发稿图书 31 / 30 本 · 已打开');
  });

  it('writes 定价与首印 with the price in yuan and the print run grouped', () => {
    expect(actualsLine({ priceFen: 4500, firstPrint: 3000 })).toBe('定价 ¥45.00 · 首印 3,000 册');
    expect(actualsLine({ priceFen: 3990, firstPrint: 12_000_000 })).toBe('定价 ¥39.90 · 首印 12,000,000 册');
  });

  it('names each published Book\'s 发稿版本, and says what was entered for an earlier one when the current one has none', () => {
    const recorded = { priceFen: 4500, firstPrint: 3000, publicationOrdinal: 1, recordedAt: '2026-09-25T00:00:00.000Z' };
    expect(actualsBookLine({ publicationOrdinal: 1, actuals: null })).toBe('第 1 次发稿版本 · 尚未录入');
    expect(actualsBookLine({ publicationOrdinal: 1, actuals: { ...recorded, current: true } })).toBe('第 1 次发稿版本 · 定价 ¥45.00 · 首印 3,000 册');
    expect(actualsBookLine({ publicationOrdinal: 2, actuals: { ...recorded, current: false } }))
      .toBe('第 2 次发稿版本 · 尚未录入（第 1 次发稿版本录入过：定价 ¥45.00 · 首印 3,000 册）');
  });

  it('says what calibration never touches, what the prediction would add, and why there is nothing to count yet', () => {
    expect(CALIBRATION_SCOPE).toContain('不改你的评分');
    expect(CALIBRATION_SCOPE).toContain('风险项');
    // 默认: with the prediction switch on, AI7 does predict (Issue #430 review).
    expect(CALIBRATION_PAGE_LEDE).toContain('AI7 默认不预测');
    expect(PREDICTION_ADDS).toContain('预测 · 低确定性');
    expect(CALIBRATION_WAITING).toContain('AI7 初评尚未接通');
    expect(ACTUALS_EMPTY).toContain('设为发稿版本');
  });
});
