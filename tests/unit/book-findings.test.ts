import { describe, expect, it } from 'vitest';
import { bookFindingsPage } from '../../src/service/book-findings.js';
import { analysisHintNeeded } from '../../src/renderer/paragraph-analysis.js';
import { readPreferenceEnvelope } from '../../src/shared/preferences.js';
import type { BookFindingProjection } from '../../src/shared/protocol.js';

describe('the disposable findings view', () => {
  it('pages without losing whole-Book category, severity and status counts or changing the sources', () => {
    const findings: BookFindingProjection[] = Array.from({ length: 83 }, (_, index) => ({
      id: `synthetic-${index}`, category: index % 2 === 0 ? 'review:typos' : 'analysis-gaps', categoryLabel: index % 2 === 0 ? '文字' : '分析未覆盖',
      severity: index % 3 === 0 ? '高' : '低', status: '待处理', summary: '合成发现', target: { kind: 'gap', revisionId: 'revision', unitOrdinal: index, blockId: 'block' },
    }));
    const before = JSON.stringify(findings);
    const page = bookFindingsPage('book', findings, 40);
    expect(page.items).toHaveLength(40);
    expect(page.total).toBe(83);
    expect(page.next).toBe(80);
    expect(page.groups.map((group) => group.count)).toEqual([42, 41]);
    expect(page.groups.reduce((sum, group) => sum + (group.byStatus['待处理'] ?? 0), 0)).toBe(83);
    expect(page.groups.reduce((sum, group) => sum + (group.bySeverity['高'] ?? 0), 0)).toBe(28);
    expect(bookFindingsPage('book', findings, 80).next).toBeNull();
    expect(bookFindingsPage('book', [], 0).total).toBe(0);
    expect(JSON.stringify(findings)).toBe(before);
  });

  it('hints once for a newer revision with nearby items, without changing viewed state or source state', () => {
    const shown = new Set<number>();
    expect(analysisHintNeeded(2, 1, 0, shown)).toBe(false);
    expect(analysisHintNeeded(1, 1, 4, shown)).toBe(false);
    expect(analysisHintNeeded(2, 1, 4, shown)).toBe(true);
    expect(shown.size).toBe(0);
    shown.add(2);
    expect(analysisHintNeeded(2, 1, 4, shown)).toBe(false);
    expect(analysisHintNeeded(3, 1, 4, shown)).toBe(true);
    expect(analysisHintNeeded(3, 3, 4, shown)).toBe(false);
  });

  it('validates the per-Book local preference and rejects record content', () => {
    const values = { 'analysis.lastViewedRevision': { book: { revisionId: 'revision', ordinal: 2 } } };
    const valid = readPreferenceEnvelope({ version: 1, values });
    expect(valid.damaged).toBe(false);
    expect(valid.values['analysis.lastViewedRevision']).toEqual(values['analysis.lastViewedRevision']);
    const invalid = readPreferenceEnvelope({ version: 1, values: { 'analysis.lastViewedRevision': { book: { ordinal: 2, text: 'not a preference' } } } });
    expect(invalid.damaged).toBe(true);
    expect(invalid.values['analysis.lastViewedRevision']).toEqual({});
  });
});
