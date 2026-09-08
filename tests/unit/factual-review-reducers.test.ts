import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import {
  FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  factualReviewMessageBlockIds,
  sliceGraphemes,
  type FactualReviewUnitResult,
  type FactualUnitAssertion,
} from '../../src/service/analysis/factual-review-contract.js';
import { reduceFactualReview, type FactualUnitOutcome } from '../../src/service/analysis/factual-review-reducers.js';
import { researchCapabilityFor } from '../../src/service/capabilities/research.js';
import {
  FACTUAL_RESEARCH_NOT_AUTHORIZED,
  FACTUAL_REVIEW_ASSURANCE_STATEMENT,
  FACTUAL_UNCHECKED_STATE,
  FACTUAL_UNREVIEWED_VERDICT,
} from '../../src/shared/protocol.js';

// Synthetic text only. What the reduction owes the editor: a finding exists exactly when the service
// located its quotation in the block the model named, its range slices that block back to the
// quotation, an assertion the model declined to treat as fact is counted and never promoted, and
// nothing is judged — every verdict is `未外部复核` because no evidence was gathered.

function block(name: string, position: number, text: string, kind: ManifestBlockInput['kind'] = 'paragraph'): ManifestBlockInput {
  return {
    blockId: `blk_${createHash('sha256').update(`reduce-${name}-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level: kind === 'heading' ? 1 : null,
    text,
    digest: createHash('sha256').update(`${kind}:${text}`).digest('hex'),
    graphemes: [...text].length,
  };
}

const blocks = [
  block('h', 1, '合成章节', 'heading'),
  block('a', 2, '甲地于民国２６年设立合成机构，辖三县。'),
  block('b', 3, '乙地亦设合成机构，辖三县。同一句重复：辖三县。'),
];

const manifest = deriveCoverageManifest({
  bookId: randomUUID(),
  manuscriptId: randomUUID(),
  branchId: randomUUID(),
  revisionId: randomUUID(),
  revisionLabel: 'r1',
  revisionDigest: 'd'.repeat(64),
  blocks,
});
const unit = manifest.units[0]!;
const blocksById = new Map(blocks.map((entry) => [entry.blockId, entry] as const));
const messageBlockIds = factualReviewMessageBlockIds(unit);
const research = researchCapabilityFor('development-ci');

function assertion(overrides: Partial<FactualUnitAssertion> = {}): FactualUnitAssertion {
  return {
    quote: '民国２６年',
    blockOrdinal: messageBlockIds.indexOf(blocks[1]!.blockId) + 1,
    assertionClass: 'real-world-fact',
    category: '时间',
    severity: 'A',
    question: '该机构是否于该年设立？',
    basis: '年代与机构设立是可对照公开记录核查的事实。',
    ...overrides,
  };
}

function closed(assertions: ReadonlyArray<FactualUnitAssertion>): FactualUnitOutcome {
  const result: FactualReviewUnitResult = { schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, assertions };
  return { unitOrdinal: unit.ordinal, state: 'closed', result };
}

function countOf<K extends string>(rows: ReadonlyArray<Record<string, unknown>>, key: K, value: string): number {
  return rows.find((row) => row[key] === value)?.count as number;
}

function reduce(outcomes: ReadonlyArray<FactualUnitOutcome>) {
  return reduceFactualReview({ manifest, outcomes, blocks: blocksById, research });
}

describe('the factual review reduction', () => {
  it('records a located assertion as a finding whose range slices the block back to its quotation', () => {
    const reduction = reduce([closed([assertion()])]);
    expect(reduction.findings).toHaveLength(1);
    const finding = reduction.findings[0]!;
    expect(finding.findingId).toMatch(/^fnd_[0-9a-f]{24}$/);
    expect(finding.blockId).toBe(blocks[1]!.blockId);
    expect(finding.states.referenceIntegrity).toBe('verified');
    expect(sliceGraphemes(blocks[1]!.text, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme)).toBe('民国２６年');
    expect(finding.sourceRange.blockId).toBe(finding.blockId);
    expect(reduction.excluded).toEqual([]);
  });

  it('judges nothing: every verdict is 未外部复核 and both evidence states are 未核查', () => {
    const reduction = reduce([closed([assertion(), assertion({ quote: '辖三县', blockOrdinal: messageBlockIds.indexOf(blocks[1]!.blockId) + 1, category: '数字' })])]);
    expect(reduction.findings).toHaveLength(2);
    for (const finding of reduction.findings) {
      expect(finding.verdict).toBe(FACTUAL_UNREVIEWED_VERDICT);
      expect(finding.states.claimSupport).toBe(FACTUAL_UNCHECKED_STATE);
      expect(finding.states.factualVerification).toBe(FACTUAL_UNCHECKED_STATE);
      expect(finding.evidence).toEqual([]);
      expect(finding.research).toEqual({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, budget: null });
    }
    expect(reduction.research).toMatchObject({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, fetched: 0 });
    expect(reduction.assurance.statement).toBe(FACTUAL_REVIEW_ASSURANCE_STATEMENT);
  });

  it('excludes a quotation that is not found and one that is found twice, with the reason and no range', () => {
    const absent = assertion({ quote: '并不存在的引文' });
    const twice = assertion({ quote: '辖三县', blockOrdinal: messageBlockIds.indexOf(blocks[2]!.blockId) + 1 });
    const reduction = reduce([closed([absent, twice])]);
    expect(reduction.findings).toEqual([]);
    expect(reduction.excluded.map((entry) => entry.reason)).toEqual(['quote-not-found', 'quote-ambiguous']);
    for (const entry of reduction.excluded) {
      expect(entry.states.referenceIntegrity).toBe('failed');
      expect(entry.reasonLabel.length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty('sourceRange');
    }
    expect(reduction.assurance.state).toBe('limited');
    expect(reduction.reducerClosure.stages.map((stage) => stage.stage)).toEqual(['unit-validation', 'reference-integrity', 'finding-reduction']);
    expect(reduction.reducerClosure.stages[1]).toMatchObject({ stage: 'reference-integrity', state: 'closed-with-gaps', inputCount: 2 });
  });

  it('merges duplicates of the same block and normalized quotation into one record', () => {
    const first = assertion();
    const second = assertion({ severity: 'C', category: '机构', question: '同一处引文的另一个问题？' });
    const reduction = reduce([closed([first, second])]);
    expect(reduction.findings).toHaveLength(1);
    const finding = reduction.findings[0]!;
    // The first occurrence keeps the record; the merged one is listed by its identity, not dropped.
    expect(finding.severity).toBe('A');
    expect(finding.category).toBe('时间');
    expect(finding.mergedFrom).toEqual([{ unitOrdinal: unit.ordinal, blockOrdinal: second.blockOrdinal, assertionOrdinal: 2 }]);
    expect(reduction.assertionCounts.merged).toBe(1);
    expect(reduction.assertionCounts.verified).toBe(2);
  });

  it('does not silently anchor a quotation whose spacing the model changed', () => {
    // Whitespace is collapsed, not removed: a quotation that adds interior spaces the block does not
    // have is a changed presentation this rule refuses to guess at, and the refusal is disclosed.
    const reduction = reduce([closed([assertion({ quote: '民国 ２６ 年' })])]);
    expect(reduction.findings).toEqual([]);
    expect(reduction.excluded).toHaveLength(1);
    expect(reduction.excluded[0]).toMatchObject({ reason: 'quote-not-found', quote: '民国 ２６ 年' });
  });

  it('counts what the model declined to treat as fact and never promotes it', () => {
    const reduction = reduce([closed([
      assertion(),
      assertion({ quote: '合成章节', blockOrdinal: messageBlockIds.indexOf(blocks[0]!.blockId) + 1, assertionClass: 'fictional-canon', category: '其他' }),
      assertion({ quote: '辖三县', assertionClass: 'judgment', category: '其他', severity: 'C' }),
    ])]);
    expect(reduction.findings).toHaveLength(1);
    expect(reduction.excluded).toEqual([]);
    expect(reduction.assertionCounts.listed).toBe(3);
    expect(countOf(reduction.assertionCounts.byClass, 'assertionClass', 'real-world-fact')).toBe(1);
    expect(countOf(reduction.assertionCounts.byClass, 'assertionClass', 'fictional-canon')).toBe(1);
    expect(countOf(reduction.assertionCounts.byClass, 'assertionClass', 'judgment')).toBe(1);
    expect(countOf(reduction.assertionCounts.byCategory, 'category', '时间')).toBe(1);
    expect(countOf(reduction.assertionCounts.byCategory, 'category', '其他')).toBe(2);
    expect(countOf(reduction.assertionCounts.bySeverity, 'severity', 'A')).toBe(2);
    expect(countOf(reduction.assertionCounts.bySeverity, 'severity', 'C')).toBe(1);
  });

  it('keeps a unit the Run never reached as an exact gap and reports partial coverage', () => {
    const reduction = reduce([]);
    expect(reduction.coverage).toMatchObject({ state: 'partial', unitsClosed: 0, unitsTotal: manifest.units.length });
    expect(reduction.gaps).toHaveLength(manifest.units.length);
    expect(reduction.gaps[0]).toMatchObject({ unitOrdinal: 1, code: 'not-attempted' });
    expect(reduction.reducerClosure.state).toBe('closed-with-gaps');
    expect(reduction.findings).toEqual([]);
  });

  it('reports complete coverage and a qualified axis when every quotation anchored', () => {
    const reduction = reduce([closed([assertion()])]);
    expect(reduction.coverage).toMatchObject({ state: 'complete', unitsClosed: manifest.units.length, gapCount: 0 });
    expect(reduction.assurance.state).toBe('qualified');
    expect(reduction.assurance.unresolvedItemCount).toBe(1);
    expect(reduction.assurance.unresolvedConflictCount).toBe(0);
    expect(reduction.reducerClosure.state).toBe('closed');
  });
});
