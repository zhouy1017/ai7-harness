import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSynthesisInput, parseSynthesisSummary, type SynthesisFinding } from '../../src/service/review/run-synthesis-contract.js';

// Reuse authored findings from the admitted Public SampleBook; never manufacture manuscript prose.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/model/sample1-review-authored.json', import.meta.url), 'utf8'));
const findings: SynthesisFinding[] = fixture.entries.filter((entry: { unitOrdinal: number }) => entry.unitOrdinal > 0)
  .flatMap((entry: { unitOrdinal: number; response: { text: string } }, index: number) => {
    const result = JSON.parse(entry.response.text);
    return (result.findings ?? []).filter((finding: { note?: string; quote?: string; clauseId?: string }) =>
      typeof finding.note === 'string' && typeof finding.quote === 'string' && typeof finding.clauseId === 'string')
      .map((finding: { note: string; quote: string; clauseId: string; severity: string }, ordinal: number) => ({
      ...finding, findingId: `finding-${index}-${ordinal}`, chapterOrdinal: entry.unitOrdinal,
      chapterLabel: `第 ${entry.unitOrdinal} 章`, categoryId: finding.clauseId.split('/')[0],
    }));
  });

describe('whole-book synthesis contract', () => {
  it('keeps a readable assessment and valid cited items when other model fields are malformed', () => {
    const input = buildSynthesisInput({ findings, missingCategories: [], baseline: null });
    const summary = parseSynthesisSummary(JSON.stringify({ overallAssessment: '先统一数字体例，再逐条核对表达。',
      recurringProblems: [null, { title: '数字体例', explanation: '跨章存在相同问题。', evidenceRefs: ['e1', 'e99999'] },
        { title: '无依据', explanation: '不能采用。', evidenceRefs: ['e99999'] }], priorities: [null, '先核对数字体例。'] }), input);
    expect(summary?.overallAssessment).toBe('先统一数字体例，再逐条核对表达。');
    expect(summary?.recurringProblems).toEqual([{ title: '数字体例', explanation: '跨章存在相同问题。', evidenceRefs: ['e1'], priority: '' }]);
    expect(summary?.priorities).toEqual(['先核对数字体例。']);
  });

  it('fits smaller contexts while retaining valid evidence references and disclosing omitted records', () => {
    const input = buildSynthesisInput({ findings, missingCategories: ['事实核查'], baseline: {
      revisionId: 'baseline', synopses: Array.from({ length: 220 }, (_, index) => ({ unitOrdinal: 220 - index, synopsis: findings[index % findings.length]!.note.repeat(40) })),
    } }, 4096);
    expect(Buffer.byteLength(JSON.stringify(input), 'utf8')).toBeLessThanOrEqual(4096);
    expect(input.omitted.findings + input.omitted.synopses).toBeGreaterThan(0);
    const refs = new Set(input.evidence.map((entry) => entry.ref));
    expect(input.clusters.every((cluster) => cluster.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
    expect(input.findings.every((finding) => finding.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
  });
});
