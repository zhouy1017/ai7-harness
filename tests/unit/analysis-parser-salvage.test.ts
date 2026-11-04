import { describe, expect, it } from 'vitest';
import { parseUnitResult, BASELINE_UNIT_RESULT_SCHEMA } from '../../src/service/analysis/contract.js';
import { parseCrossUnitResult, BASELINE_CROSS_UNIT_RESULT_SCHEMA } from '../../src/service/analysis/cross-unit-contract.js';
import { parseAssuranceSamplingResult, ASSURANCE_SAMPLING_RESULT_SCHEMA } from '../../src/service/analysis/assurance-sampling-contract.js';
import { parseCustomAnalysisUnitResult, CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA } from '../../src/service/analysis/custom-analysis-contract.js';
import { parseRunReportReflectionResult, RUN_REPORT_REFLECTION_RESULT_SCHEMA } from '../../src/service/analysis/run-report-contract.js';
import { parseFactualReviewUnitResult, FACTUAL_REVIEW_UNIT_RESULT_SCHEMA } from '../../src/service/analysis/factual-review-contract.js';
import { parseFactualReviewUnitResultV2, FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA } from '../../src/service/analysis/factual-review-contract-v2.js';
import { parseFactualClaimExtraction, parseFactualClaimVerification, FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA } from '../../src/service/analysis/factual-claim-contract.js';
import { FACTUAL_CLAIM_EXTRACTION_CONTRACT } from '../../src/service/analysis/factual-claim-ledger.js';
import type { SalvagedModelResult } from '../../src/service/analysis/canonical.js';

const blockId = `blk_${'a'.repeat(24)}`;
const expected = { unitOrdinal: 1, blockCount: 1 };
const assertion = { quote: '合成引文', blockOrdinal: 1, assertionClass: 'real-world-fact' as const, category: '史实' as const,
  severity: 'C' as const, question: '合成问题', basis: '合成依据' };
const approxAssertion = { ...assertion, assertionClass: ' REAL WORLD FACT ', category: ' history ', severity: ' low ' };
const relation = { sourceRef: 'https://example.org/evidence', relation: '支持', excerptRef: '合成摘录', lineage: 'original' };
type Parsed = { ok: true; result: SalvagedModelResult } | { ok: false; code: string; detail: string };
interface ParserCase {
  name: string; schema: string; section: string; good: object; bad: unknown;
  parse: (text: string) => Parsed; envelope?: object;
}
const cases: ParserCase[] = [
  { name: 'baseline', schema: BASELINE_UNIT_RESULT_SCHEMA, section: 'entities', good: { name: '合成实体', kind: '人物' }, bad: { name: '' },
    parse: (text) => parseUnitResult(text, { unitOrdinal: 1, blockIds: [blockId] }) },
  { name: 'cross-unit', schema: BASELINE_CROSS_UNIT_RESULT_SCHEMA, section: 'findings',
    good: { kind: '矛盾', description: '合成跨单元发现', sides: [{ unitOrdinal: 1 }, { unitOrdinal: 2 }], confidence: '中' }, bad: null,
    parse: (text) => parseCrossUnitResult(text, { closedOrdinals: [1, 2], citedBlocksByUnit: new Map() }) },
  { name: 'sampling', schema: ASSURANCE_SAMPLING_RESULT_SCHEMA, section: 'dispositions', good: { ref: 0, disposition: '降级' }, bad: { ref: 'unlisted' },
    parse: (text) => parseAssuranceSamplingResult(text, { refs: ['0'] }) },
  { name: 'custom', schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, section: 'rows', good: { answer: '合成回答', blockOrdinal: '1', quote: '合成引文' }, bad: { answer: '坏条目', blockOrdinal: 2, quote: '合成引文' },
    parse: (text) => parseCustomAnalysisUnitResult(text, expected) },
  { name: 'reflection', schema: RUN_REPORT_REFLECTION_RESULT_SCHEMA, section: 'items', good: { suggestion: '合成建议' }, bad: null, parse: parseRunReportReflectionResult },
  { name: 'factual-v1', schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, section: 'assertions', good: approxAssertion, bad: { ...assertion, blockOrdinal: 2 }, parse: (text) => parseFactualReviewUnitResult(text, expected) },
  { name: 'factual-v2', schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, section: 'assertions', good: approxAssertion, bad: { ...assertion, blockOrdinal: 2 }, parse: (text) => parseFactualReviewUnitResultV2(text, expected) },
  { name: 'claim-extraction', schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT, section: 'assertions', good: approxAssertion, bad: { ...assertion, quote: '\ud800' }, parse: (text) => parseFactualClaimExtraction(text, expected) },
  { name: 'claim-verification', schema: FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA, section: 'evidenceRelations', good: { ...relation, relation: 'SUPPORT', lineage: '原始来源' }, bad: { ...relation, sourceRef: 'http://example.org' },
    envelope: { claimId: 'claim-1' }, parse: (text) => parseFactualClaimVerification(text, { claimId: 'claim-1', assertion }) },
];

for (const entry of cases) describe(`${entry.name} per-entry salvage (#1311 H2)`, () => {
  const envelope = { schema: entry.schema, unitOrdinal: 1, ...entry.envelope };
  const read = (items: unknown[]) => entry.parse(JSON.stringify({ ...envelope, [entry.section]: items }));
  it('retains a valid sibling and records the bad entry', () => {
    const parsed = read([entry.bad, entry.good]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect((parsed.result as Record<string, unknown>)[entry.section]).toHaveLength(1);
    const item = ((parsed.result as Record<string, unknown>)[entry.section] as object[])[0];
    const normalized: Record<string, object> = { baseline: { kind: 'person' }, 'cross-unit': { kind: 'contradiction', confidence: 'medium' }, sampling: { disposition: '需降级' },
      'factual-v1': { assertionClass: 'real-world-fact', category: '史实', severity: 'C' }, 'factual-v2': { assertionClass: 'real-world-fact', category: '史实', severity: 'C' },
      'claim-extraction': { assertionClass: 'real-world-fact', category: '史实', severity: 'C' }, 'claim-verification': { relation: '支持', lineage: 'original' } };
    if (normalized[entry.name] !== undefined) expect(item).toMatchObject(normalized[entry.name]!);
    expect(parsed.result.salvaged).toEqual(expect.arrayContaining([expect.objectContaining({ section: entry.section, index: 0 })]));
  });
  it('accepts extra keys, missing optional fields and a fenced answer with surrounding prose', () => {
    const parsed = entry.parse('说明。\n```JSON\n' + JSON.stringify({ ...envelope, extra: true, [entry.section]: [{ ...entry.good, extra: true }] }) + '\n```\n结束。');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect((parsed.result as Record<string, unknown>)[entry.section]).toHaveLength(1);
  });
  it('recovers complete entries from a truncated array and records the truncation', () => {
    const json = JSON.stringify({ ...envelope, [entry.section]: [entry.good] });
    const parsed = entry.parse(json.slice(0, -2) + ',{"unfinished":');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect((parsed.result as Record<string, unknown>)[entry.section]).toHaveLength(1);
    expect(parsed.result.salvaged).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'truncated-json' })]));
  });
  it('fails only when nothing usable survives', () => {
    expect(read([entry.bad])).toMatchObject({ ok: false, detail: '模型回答无法读出任何可用条目' });
    expect(entry.parse('not json')).toMatchObject({ ok: false, code: 'not-json' });
    expect(entry.parse('null')).toMatchObject({ ok: false, code: 'schema-invalid' });
  });
});

it('remaps correction references after assertion salvage and drops only invalid references/variants', () => {
  const parsed = parseFactualReviewUnitResultV2(JSON.stringify({ assertions: [{ ...assertion, blockOrdinal: 2 }, assertion], corrections: [
    { assertionRef: 1, variants: [{ text: '被丢弃断言的更正' }] },
    { assertionRef: 2, variants: [null, { text: '改'.repeat(201), rationale: '据'.repeat(121) }] },
    { assertionRef: 3, variants: [{ text: '越界' }] },
  ] }), expected);
  expect(parsed).toMatchObject({ ok: true, result: { assertions: [assertion], corrections: [{ assertionRef: 1, variants: [{ text: '改'.repeat(200), rationale: '据'.repeat(120) }] }] } });
});

it('validates relation strings before canonicalization and never trims an exact excerpt', () => {
  const parsed = parseFactualClaimVerification(JSON.stringify({ claimId: 'other', evidenceRelations: [
    { ...relation, sourceRef: '\ud800' }, { ...relation, excerptRef: '引'.repeat(201), relation: 'SUPPORT', lineage: '原始来源' },
    { ...relation, sourceRef: `retrieval:${'b'.repeat(64)}` },
  ] }), { claimId: 'claim-1', assertion });
  expect(parsed).toMatchObject({ ok: true, result: { claimId: 'claim-1', evidenceRelations: [{ ...relation, excerptRef: null }] } });
});
