import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import {
  applyAssuranceSample,
  baselineAnalysisKindDefinition,
  factualReviewKindDefinition,
} from '../../src/service/analysis/kind-definition.js';
import {
  assuranceSampleNotRun,
  assuranceSampleOutcome,
  assuranceSamplePrecision,
} from '../../src/service/analysis/reducers.js';
import type { AnalysisReductionResult } from '../../src/service/analysis/kind-definition.js';
import type {
  AnalysisAssuranceSampleDispositionProjection,
  AnalysisCrossUnitFindingProjection,
  FactualReviewFindingProjection,
} from '../../src/shared/protocol.js';

const SEED = 's'.repeat(64);
const DRAW = { seed: SEED, size: 2, candidateCount: 2, strata: [{ sectionOrdinal: 1, candidates: 2, sampled: 2 }] };

function disposition(
  ref: string,
  tier: string,
  value: AnalysisAssuranceSampleDispositionProjection['disposition'],
): AnalysisAssuranceSampleDispositionProjection {
  return { ref, unitOrdinal: 1, tier, disposition: value, reason: `合成理由（${value}）。` };
}

function crossUnitFinding(description: string, confidence: AnalysisCrossUnitFindingProjection['confidence'], first: number, second: number): AnalysisCrossUnitFindingProjection {
  return {
    kind: 'contradiction',
    description,
    sides: [
      { unitOrdinal: first, sourceRanges: [{ blockId: `blk_${'a'.repeat(24)}`, fromGrapheme: null, toGrapheme: null }] },
      { unitOrdinal: second, sourceRanges: [{ blockId: `blk_${'b'.repeat(24)}`, fromGrapheme: null, toGrapheme: null }] },
    ],
    unitOrdinals: [first, second],
    confidence,
  };
}

/** A reduction with just enough shape to fold a sample into; the components are what must survive. */
function reduction(components: Record<string, unknown>): AnalysisReductionResult {
  return {
    coverage: { axis: 'coverage', state: 'complete', label: '覆盖完整', unitsTotal: 3, unitsClosed: 3, unitsReused: 0, gapCount: 0 },
    reducerClosure: { axis: 'reducer-closure', state: 'closed', label: '归约/综合闭合：全部阶段已闭合', stages: [{ stage: 'unit-validation', state: 'closed', inputCount: 3 }] },
    assurance: {
      axis: 'assurance',
      state: 'qualified',
      label: '语义/证据保证：合格 · 无未解决冲突',
      unresolvedConflictCount: 0,
      unresolvedItemCount: 0,
      lowConfidenceUnitCount: 0,
      crossUnitFindingCount: 2,
      sampledPrecision: null,
      statement: '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。',
    },
    gaps: [],
    components,
    conflictCount: 0,
  };
}

describe('applyAssuranceSample (the second reducer pass)', () => {
  const findings = [crossUnitFinding('合成发现一。', 'medium', 1, 3), crossUnitFinding('合成发现二。', 'low', 1, 3)];
  const base = reduction({ crossUnitFindings: findings, conflicts: [], sections: [], synthesis: {} });

  /**
   * Acceptance criterion 2, and the whole promise of ADR 0066's "sampling never edits, deletes, or
   * reorders findings": every component the kind reduced comes through byte for byte, whatever the
   * dispositions said. `应删除` is the strongest case — the model asked for a removal and got none.
   */
  it('leaves every finding component byte-identical, whatever the dispositions say', () => {
    const before = canonicalJson(base.components);
    for (const sample of [
      assuranceSampleNotRun('本次运行没有可抽样的发现。'),
      assuranceSampleOutcome(DRAW, [disposition('0', 'medium', '成立'), disposition('1', 'low', '应删除')], { inputTokens: 1, outputTokens: 1 }, []),
      assuranceSampleOutcome(DRAW, [], null, ['合成缺口。']),
    ]) {
      const applied = applyAssuranceSample(base, sample);
      expect(canonicalJson({ ...applied.components, assuranceSample: undefined })).toBe(before);
      expect(canonicalJson(applied.components.crossUnitFindings)).toBe(canonicalJson(findings));
      expect(applied.components.assuranceSample).toEqual(sample);
      // Nothing but the assurance axis, the stage list, and the new component moves.
      expect(applied.coverage).toEqual(base.coverage);
      expect(applied.gaps).toEqual(base.gaps);
      expect(applied.conflictCount).toBe(base.conflictCount);
      expect(applied.assurance.state).toBe(base.assurance.state);
      expect(applied.assurance.unresolvedConflictCount).toBe(base.assurance.unresolvedConflictCount);
      expect(applied.assurance.crossUnitFindingCount).toBe(base.assurance.crossUnitFindingCount);
    }
  });

  it('states the sample size and the estimated precision in the axis label when the sample closed', () => {
    const closed = assuranceSampleOutcome(DRAW, [disposition('0', 'medium', '成立'), disposition('1', 'low', '需降级')], null, []);
    const applied = applyAssuranceSample(base, closed);
    expect(applied.assurance.sampledPrecision).toEqual({ size: 2, upheld: 1, estimate: 0.5 });
    expect(applied.assurance.label).toBe('语义/证据保证：合格 · 无未解决冲突 · 抽样 2 条 · 估计精度 0.50');
  });

  it('leaves sampledPrecision null and the label untouched when the sample did not close', () => {
    for (const sample of [assuranceSampleNotRun('合成原因。'), assuranceSampleOutcome(DRAW, [], null, ['合成缺口。'])]) {
      const applied = applyAssuranceSample(base, sample);
      expect(applied.assurance.sampledPrecision).toBeNull();
      expect(applied.assurance.label).toBe(base.assurance.label);
    }
  });

  it('appends the sampling stage after the kind’s last stage, reporting what the sampling did', () => {
    const states = {
      'not-run': assuranceSampleNotRun('合成原因。'),
      closed: assuranceSampleOutcome(DRAW, [disposition('0', 'medium', '成立')], null, []),
      'closed-with-gaps': assuranceSampleOutcome(DRAW, [disposition('0', 'medium', '成立')], null, ['合成缺口。']),
      gap: assuranceSampleOutcome(DRAW, [], null, ['合成缺口。']),
    } as const;
    for (const [expected, sample] of Object.entries(states)) {
      const stages = applyAssuranceSample(base, sample).reducerClosure.stages;
      expect(stages).toHaveLength(base.reducerClosure.stages.length + 1);
      expect(stages.at(-1)).toEqual({
        stage: 'assurance-sampling',
        state: expected === 'not-run' ? 'not-run' : expected === 'closed' ? 'closed' : 'closed-with-gaps',
        inputCount: sample.candidateCount,
      });
      // The closure axis keeps the reading its kind's reducers gave it; the sampling reports its own.
      expect(applyAssuranceSample(base, sample).reducerClosure.state).toBe(base.reducerClosure.state);
      expect(applyAssuranceSample(base, sample).reducerClosure.label).toBe(base.reducerClosure.label);
    }
  });
});

describe('assuranceSamplePrecision', () => {
  it('counts 成立 only, rounds to two decimals, and orders tiers deterministically', () => {
    expect(assuranceSamplePrecision([
      disposition('0', 'medium', '成立'),
      disposition('1', 'low', '需降级'),
      disposition('2', 'high', '成立'),
      disposition('3', 'high', '应删除'),
      disposition('4', 'high', '成立'),
    ])).toEqual([
      { tier: 'high', sampled: 3, upheld: 2, estimate: 0.67 },
      { tier: 'low', sampled: 1, upheld: 0, estimate: 0 },
      { tier: 'medium', sampled: 1, upheld: 1, estimate: 1 },
    ]);
    expect(assuranceSamplePrecision([])).toEqual([]);
  });
});

describe('the two kinds’ sampling bindings', () => {
  it('declares the baseline kind’s cross-unit findings, anchored in each finding’s first side', () => {
    const definition = baselineAnalysisKindDefinition();
    expect(definition.assurance).not.toBeNull();
    expect(definition.assuranceAbsentReason).toBe('');
    expect(definition.assurance!.candidates(reduction({
      crossUnitFindings: [crossUnitFinding('合成发现一。', 'medium', 3, 1), crossUnitFinding('合成发现二。', 'low', 1, 3)],
    }))).toEqual([
      { ref: '0', unitOrdinal: 3, tier: 'medium', text: '合成发现一。' },
      { ref: '1', unitOrdinal: 1, tier: 'low', text: '合成发现二。' },
    ]);
    // A Run whose reduction never closed has nothing to sample, and says so by drawing nothing.
    expect(definition.assurance!.candidates(reduction({ crossUnitFindings: [] }))).toEqual([]);
    // The reducer stage list the plan digests now names the stage after the kind's last one.
    expect(definition.reducerStages).not.toContain('assurance-sampling');
  });

  it('declares the factual kind’s located findings, by identity, severity, quotation, and question', () => {
    const finding = {
      findingId: 'fnd_0123456789abcdef01234567',
      unitOrdinal: 6,
      severity: 'A',
      quote: '合成引文',
      question: '合成核查问题？',
    } as unknown as FactualReviewFindingProjection;
    const definition = factualReviewKindDefinition();
    expect(definition.assurance).not.toBeNull();
    expect(definition.assurance!.candidates(reduction({ findings: [finding] }))).toEqual([
      { ref: 'fnd_0123456789abcdef01234567', unitOrdinal: 6, tier: 'A', text: '「合成引文」合成核查问题？' },
    ]);
    // The excluded appendix is not sampleable: an unlocated quotation has no range to re-read it against.
    expect(definition.assurance!.candidates(reduction({ findings: [], excluded: [finding] }))).toEqual([]);
  });
});
