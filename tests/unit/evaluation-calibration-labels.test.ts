import { describe, expect, it } from 'vitest';
import {
  ACTUALS_EMPTY,
  CALIBRATION_METHOD,
  CALIBRATION_OFF_EFFECT,
  CALIBRATION_PAGE_LEDE,
  CALIBRATION_SCOPE,
  CALIBRATION_WAITING,
  PREDICTION_ADDS,
  actualsBookLine,
  actualsLine,
  calibrationBasisLine,
  calibrationOffsetLine,
  calibrationOffsetWaiting,
  calibrationProgressLine,
  calibrationUnreadableLine,
  calibrationWithoutBasisLine,
  predictionProgressLine,
} from '../../src/renderer/evaluation-calibration-labels.js';
import {
  CALIBRATION_MIN_ADJUSTMENTS,
  MAX_FIRST_PRINT,
  MAX_PRICE_FEN,
  PREDICTION_MIN_BOOKS_WITH_ACTUALS,
  calibratedScore,
  calibrationActive,
  calibrationOffset,
  formatCalibrationOffset,
  formatPriceFen,
  parseFirstPrint,
  parsePriceYuan,
  predictionAvailable,
  roundToHalfPoint,
} from '../../src/shared/evaluation-calibration.js';
import { calibrationMinBooksForLaunch, parseCalibrationMinBooks } from '../../src/shared/protocol.js';

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

describe('J-11\'s calibration gate flag (EVAL-011a; the Commander\'s ruling of 2026-10-10)', () => {
  it('takes a whole number of Books from 2 to 10 and nothing else', () => {
    expect([parseCalibrationMinBooks('2'), parseCalibrationMinBooks('5'), parseCalibrationMinBooks('10')]).toEqual([2, 5, 10]);
    for (const value of ['1', '11', '0', '02', '2.5', '-2', ' 2', '2 ', '', 'two', '1e1']) expect([value, parseCalibrationMinBooks(value)]).toEqual([value, null]);
  });

  it('is refused in every launch but a J-11 Journey launch, where it sets the gate; absent, the product keeps its ten', () => {
    expect(calibrationMinBooksForLaunch(undefined, undefined)).toBeUndefined();
    expect(calibrationMinBooksForLaunch(undefined, 'J-11')).toBeUndefined();
    expect(calibrationMinBooksForLaunch('2', 'J-11')).toBe(2);
    expect(calibrationMinBooksForLaunch('10', 'J-11')).toBe(10);
    // No Journey, another Journey, or an out-of-range value: refused, never silently ignored.
    expect(calibrationMinBooksForLaunch('2', undefined)).toBeNull();
    expect(calibrationMinBooksForLaunch('2', 'J-09')).toBeNull();
    expect(calibrationMinBooksForLaunch('2', 'J-12')).toBeNull();
    expect(calibrationMinBooksForLaunch('1', 'J-11')).toBeNull();
    expect(calibrationMinBooksForLaunch('11', 'J-11')).toBeNull();
    // The product's own gate is untouched by the flag's existence.
    expect(CALIBRATION_MIN_ADJUSTMENTS).toBe(10);
    expect(calibrationActive(2, true)).toBe(false);
    expect(calibrationActive(2, true, 2)).toBe(true);
    expect(calibrationActive(1, true, 2)).toBe(false);
  });
});

describe('the house offset (EVAL-011a)', () => {
  it('is the mean of the Books\' differences to the half point, a quarter rounding away from zero, and nothing over no Book', () => {
    expect(calibrationOffset([])).toBeNull();
    expect(calibrationOffset([-2, -2, -2])).toBe(-2);
    expect(calibrationOffset([1, 0, 0, 0])).toBe(0.5);
    expect(calibrationOffset([1, 0, 0, 0, 0])).toBe(0);
    expect(calibrationOffset([0.5, 0.5, 0, 0])).toBe(0.5);
    expect(calibrationOffset([-0.5, -0.5, 0, 0])).toBe(-0.5);
    expect(calibrationOffset([-1, 0, 0, 0, 0])).toBe(0);
    expect(calibrationOffset([0.3, 0.3, 0.3])).toBe(0.5);
    expect(calibrationOffset([-0.3, -0.3, -0.3])).toBe(-0.5);
    // Never −0.
    expect(Object.is(calibrationOffset([-0.1, 0.1]), 0)).toBe(true);
    expect(roundToHalfPoint(1.74)).toBe(1.5);
    expect(roundToHalfPoint(1.75)).toBe(2);
    expect(roundToHalfPoint(-1.75)).toBe(-2);
  });

  it('keeps an adjusted starting score within 0 and the item\'s 满分', () => {
    expect(calibratedScore(12, -2, 20)).toBe(10);
    expect(calibratedScore(16.5, 0.5, 20)).toBe(17);
    expect(calibratedScore(19.5, 1, 20)).toBe(20);
    expect(calibratedScore(20, 3.5, 20)).toBe(20);
    expect(calibratedScore(0.5, -1, 20)).toBe(0);
    expect(calibratedScore(0, -2, 20)).toBe(0);
  });

  it('states an offset with its sign', () => {
    expect(formatCalibrationOffset(0)).toBe('0');
    expect(formatCalibrationOffset(1.5)).toBe('+1.5');
    expect(formatCalibrationOffset(2)).toBe('+2');
    expect(formatCalibrationOffset(-0.5)).toBe('−0.5');
    expect(formatCalibrationOffset(-3)).toBe('−3');
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
    // Books left out because their records are damaged are named, never silently missing (Issue #702 review).
    expect(calibrationUnreadableLine(0)).toBeNull();
    expect(calibrationUnreadableLine(2)).toBe('另有 2 本书的评估记录已损坏，未计入调分记录。');
    expect(calibrationProgressLine({ adjustments: 3, threshold: 10, enabled: false, active: false })).toBe('调分记录 3 / 10 本 · 已关闭');
    expect(calibrationProgressLine({ adjustments: 12, threshold: 10, enabled: true, active: true })).toBe('调分记录 12 / 10 本 · 已生效');
    expect(calibrationProgressLine({ adjustments: 10, threshold: 10, enabled: true, active: true })).toBe('调分记录 10 / 10 本 · 已生效');
    expect(calibrationProgressLine({ adjustments: 9, threshold: 10, enabled: true, active: false })).toBe('调分记录 9 / 10 本 · 满 10 本后生效');
  });

  it('discloses the house offset\'s method, its basis and each item\'s offset, or what it waits for, and what off does (EVAL-011a)', () => {
    expect(CALIBRATION_METHOD).toContain('你的定稿分数减去 AI7 初评分数的平均值');
    expect(CALIBRATION_METHOD).toContain('取到半分');
    expect(CALIBRATION_METHOD).toContain('不另存');
    // The waiting line names the gate the service answers, so it agrees with the progress line: ten in the product, two under
    // J-11's Journey-only control (#741 review P1).
    expect(calibrationOffsetWaiting(10)).toBe('校准偏移尚未计算：满 10 本调分记录后，按上述方法得出，新版本从 AI7 初评开始时按偏移调整起始分数。');
    expect(calibrationOffsetWaiting(2)).toBe('校准偏移尚未计算：满 2 本调分记录后，按上述方法得出，新版本从 AI7 初评开始时按偏移调整起始分数。');
    expect(CALIBRATION_OFF_EFFECT).toBe('校准已关闭：新版本从 AI7 初评开始时直接用 AI7 的原始分数；可以随时再打开，关闭和打开都有记录。');
    expect(calibrationBasisLine({ basisBooks: 10 })).toBe('校准依据：10 本书的定稿评估；各评分项的偏移如下（正数表示你的定稿分数通常高于 AI7 初评）。');
    // Why the basis can be fewer Books than 调分记录 counts (P3-1): said only when it is.
    expect(calibrationWithoutBasisLine({ booksWithoutBasis: 0 })).toBeNull();
    expect(calibrationWithoutBasisLine({ booksWithoutBasis: 1 })).toBe('其中 1 本书有从 AI7 初评开始的版本已损坏，不计入校准依据。');
    expect(calibrationWithoutBasisLine({ booksWithoutBasis: 3 })).toBe('其中 3 本书有从 AI7 初评开始的版本已损坏，不计入校准依据。');
    expect(calibrationOffsetLine({ itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20, offset: -2, books: 10 }))
      .toBe('读者与市场潜力：−2（依据 10 本书，满分 20，调整后不超出 0 到 20）');
    expect(calibrationOffsetLine({ itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20, offset: 0.5, books: 10 }))
      .toBe('文学品质与作者声音：+0.5（依据 10 本书，满分 20，调整后不超出 0 到 20）');
    expect(calibrationOffsetLine({ itemId: 'chinese-language', label: '中文语言与表达', fullMarks: 20, offset: 0, books: 9 }))
      .toBe('中文语言与表达：0（依据 9 本书，满分 20，调整后不超出 0 到 20）');
    expect(calibrationOffsetLine({ itemId: 'theme-and-context', label: '主题、价值与社会文化语境', fullMarks: 20, offset: null, books: 0 }))
      .toBe('主题、价值与社会文化语境：暂无数据（没有书同时有你的定稿分数和 AI7 初评分数）');
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
