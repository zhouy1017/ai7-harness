import { describe, expect, it } from 'vitest';
import { parseUnitPrices, parseKeyboardBindings } from '../../src/shared/preferences.js';

const price = { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY', enteredAt: '2026-10-17' };

describe('the slice-11c preference values', () => {
  it('accepts only exact unit-price entries: non-negative bounded numbers, an ISO currency and a real day', () => {
    expect(parseUnitPrices({ 'opencode-go': price })).toEqual({ 'opencode-go': price });
    expect(parseUnitPrices({})).toEqual({});
    for (const bad of [
      { ...price, currency: 'cny' }, { ...price, currency: 'RMB1' }, { ...price, inputPerMillion: Number.NaN },
      { ...price, inputPerMillion: 1_000_001 }, { ...price, enteredAt: '2026-02-30' }, { ...price, enteredAt: '2026-10-17T00:00:00Z' },
      { ...price, extra: 1 }, { inputPerMillion: 1, outputPerMillion: 1, currency: 'CNY' },
    ]) expect(parseUnitPrices({ 'opencode-go': bad }), JSON.stringify(bad)).toBeNull();
    expect(parseUnitPrices({ 'Bad Route': price })).toBeNull();
    expect(parseUnitPrices([price])).toBeNull();
  });

  it('accepts only chord sequences of one or two steps, keyed by a command id', () => {
    expect(parseKeyboardBindings({ 'nav.library': 'Mod+Alt+Shift+L', 'search.next': 'F3', 'nav.series': 'Mod+K Mod+B' })).not.toBeNull();
    for (const bad of ['', 'Mod+', 'Shift+Mod+L', 'Mod+L Mod+K Mod+B', 'Mod+L+K', 'mod+l ']) {
      expect(parseKeyboardBindings({ 'nav.library': bad }), bad).toBeNull();
    }
    expect(parseKeyboardBindings({ 'Nav Library': 'Mod+L' })).toBeNull();
    expect(parseKeyboardBindings({ 'nav.library': 5 })).toBeNull();
  });
});
