import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { procedureOffersSeries, seriesScopeKindDefinition } from '../../src/service/review/series-consistency.js';

describe('optional Series scope compatibility', () => {
  it('returns the exact original definition without a Series selection, retaining every contract digest and byte', () => {
    const db = new DatabaseSync(':memory:');
    try {
      const original = baselineAnalysisKindDefinition();
      const before = JSON.stringify(original);
      expect(seriesScopeKindDefinition(db, original)).toBe(original);
      expect(seriesScopeKindDefinition(db, original, [])).toBe(original);
      expect(sha256Hex(JSON.stringify(seriesScopeKindDefinition(db, original)))).toBe(sha256Hex(before));
    } finally { db.close(); }
  });

  it('offers Series only for the exact /2 successor and its explicit authority ceiling', () => {
    expect(procedureOffersSeries({ schema: 'ai7.captured-procedure/1', authorityCeiling: { runSourceScope: 'series' } })).toBe(false);
    expect(procedureOffersSeries({ schema: 'ai7.captured-procedure/2', authorityCeiling: { runSourceScope: 'current-book' } })).toBe(false);
    expect(procedureOffersSeries({ schema: 'ai7.captured-procedure/2', authorityCeiling: { runSourceScope: 'series' } })).toBe(true);
    expect(procedureOffersSeries(null)).toBe(false);
  });
});
