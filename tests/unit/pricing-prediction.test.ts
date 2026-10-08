import { describe, expect, it } from 'vitest';
import { predictionRange, quantile } from '../../src/service/evaluation/pricing-prediction.js';

// Unit suite (L1) for 定价与首印's prediction range (Issue #429, plan slice S81b2; V2-UX-EVAL-010): the middle half and the median
// of published Books' actuals by linear interpolation between the closest ranks, rounded to whole 分 and copies, and nothing over
// no Book. The figures are the suite's own.

describe('定价与首印\'s range', () => {
  it('interpolates between the closest ranks', () => {
    expect(quantile([10], 0.25)).toBe(10);
    expect(quantile([10, 20], 0.5)).toBe(15);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(quantile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(quantile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(quantile([1, 2, 3], 1)).toBe(3);
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(() => quantile([], 0.5)).toThrow('PREDICTION_EMPTY');
  });

  it('is the middle half and the median, in any order, with the count it rests on', () => {
    expect(predictionRange([])).toBeNull();
    expect(predictionRange([{ priceFen: 4500, firstPrint: 3000 }])).toEqual({
      books: 1, priceFen: { low: 4500, median: 4500, high: 4500 }, firstPrint: { low: 3000, median: 3000, high: 3000 },
    });
    const books = [5900, 3100, 4500, 3800, 5200].map((priceFen, index) => ({ priceFen, firstPrint: 1000 * (index + 1) }));
    expect(predictionRange(books)).toEqual({
      books: 5, priceFen: { low: 3800, median: 4500, high: 5200 }, firstPrint: { low: 2000, median: 3000, high: 4000 },
    });
    // Each figure is rounded to a whole 分 or copy.
    expect(predictionRange([{ priceFen: 3333, firstPrint: 1001 }, { priceFen: 3334, firstPrint: 1002 }])).toEqual({
      books: 2, priceFen: { low: 3333, median: 3334, high: 3334 }, firstPrint: { low: 1001, median: 1002, high: 1002 },
    });
  });
});
