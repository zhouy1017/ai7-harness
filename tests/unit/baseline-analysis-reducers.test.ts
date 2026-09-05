import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { BASELINE_UNIT_RESULT_SCHEMA, type BaselineUnitResult } from '../../src/service/analysis/contract.js';
import { ASSURANCE_STATEMENT, detectCrossUnitConflicts, reduceBaselineAnalysis, type UnitOutcome } from '../../src/service/analysis/reducers.js';

// Synthetic unit results over a synthetic manifest. The reducers must preserve unit lineage, keep
// every gap and conflict visible, and never collapse the four axes into one flag.

function block(position: number, kind: ManifestBlockInput['kind'], level: number | null = null): ManifestBlockInput {
  const text = kind === 'paragraph' ? `合成段落 ${position}` : `合成标题 ${position}`;
  return {
    blockId: `blk_${createHash('sha256').update(`unit-block-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level,
    text,
    digest: createHash('sha256').update(text).digest('hex'),
    graphemes: text.length,
  };
}

const blocks = [block(1, 'heading', 1), block(2, 'paragraph'), block(3, 'heading', 1), block(4, 'paragraph'), block(5, 'heading', 1), block(6, 'paragraph')];
const manifest = deriveCoverageManifest({
  bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(),
  revisionLabel: 'r1', revisionDigest: 'f'.repeat(64), blocks,
});

function range(position: number) {
  return { blockId: blocks[position - 1]!.blockId, fromGrapheme: null, toGrapheme: null };
}

function result(unitOrdinal: number, overrides: Partial<BaselineUnitResult>): BaselineUnitResult {
  return {
    schema: BASELINE_UNIT_RESULT_SCHEMA,
    unitOrdinal,
    synopsis: `单元 ${unitOrdinal} 的合成概述。`,
    entities: [],
    events: [],
    relationships: [],
    settingClaims: [],
    conflicts: [],
    unresolved: [],
    confidence: 'high',
    ...overrides,
  };
}

const closedUnit1: UnitOutcome = {
  unitOrdinal: 1,
  state: 'closed',
  result: result(1, {
    entities: [
      { name: '合成人物甲', kind: 'person', aliases: ['阿甲'], note: null, sourceRanges: [range(2)] },
      { name: '合成之城', kind: 'place', aliases: [], note: '合成注记', sourceRanges: [range(2)] },
    ],
    events: [{ ordinal: 2, summary: '第二事件', chronology: null, participants: ['合成人物甲'], sourceRanges: [range(2)] },
      { ordinal: 1, summary: '第一事件', chronology: '开端', participants: [], sourceRanges: [range(1)] }],
    relationships: [{ subject: '合成人物甲', object: '合成之城', relation: '居于', sourceRanges: [range(2)] }],
    settingClaims: [{ subject: '合成之城', claim: '位于北方', sourceRanges: [range(2)] }],
    unresolved: [{ description: '合成人物甲的来历未交代。', sourceRanges: [range(2)] }],
  }),
};

const closedUnit3: UnitOutcome = {
  unitOrdinal: 3,
  state: 'closed',
  result: result(3, {
    entities: [
      { name: '合成人物乙', kind: 'person', aliases: ['阿甲'], note: null, sourceRanges: [range(6)] },
      { name: '合成之城', kind: 'organization', aliases: ['城邦'], note: null, sourceRanges: [range(6)] },
    ],
    relationships: [{ subject: '合成人物甲', object: '合成之城', relation: '居于', sourceRanges: [range(6)] }],
    settingClaims: [{ subject: '合成之城', claim: '位于南方', sourceRanges: [range(6)] }],
    conflicts: [{ description: '本单元内前后称谓不一致。', sourceRanges: [range(6)] }],
    confidence: 'medium',
  }),
};

const gapUnit2: UnitOutcome = { unitOrdinal: 2, state: 'gap', code: 'adapter-failure', reason: '适配器返回失败。' };

describe('reduceBaselineAnalysis', () => {
  const reduction = reduceBaselineAnalysis(manifest, [closedUnit3, gapUnit2, closedUnit1]);

  it('reports coverage over the manifest with the exact gap and never an aggregate flag', () => {
    expect(reduction.coverage).toMatchObject({ axis: 'coverage', state: 'partial', unitsTotal: 3, unitsClosed: 2, gapCount: 1 });
    expect(reduction.coverage.label).toBe('覆盖：部分 · 2/3 单元 · 1 处缺口');
    expect(reduction.gaps).toEqual([{
      unitOrdinal: 2, code: 'adapter-failure', reason: '适配器返回失败。', startPosition: 3, endPosition: 4,
      blockIds: [blocks[2]!.blockId, blocks[3]!.blockId],
    }]);
    expect(Object.keys(reduction)).not.toContain('complete');
    expect(JSON.stringify(reduction)).not.toMatch(/"complete":|完整"|"score"/u);
  });

  it('closes every reducer stage while recording that gaps were carried through', () => {
    expect(reduction.reducerClosure.state).toBe('closed-with-gaps');
    expect(reduction.reducerClosure.stages.map((stage) => [stage.stage, stage.state])).toEqual([
      ['unit-validation', 'closed-with-gaps'],
      ['section-reduction', 'closed-with-gaps'],
      ['contradiction-continuity', 'closed-with-gaps'],
      ['book-synthesis', 'closed-with-gaps'],
    ]);
  });

  it('preserves unit lineage in section and book reductions', () => {
    expect(reduction.sections.map((section) => [section.sectionOrdinal, section.unitOrdinals, section.closedUnitOrdinals, section.gapUnitOrdinals])).toEqual([
      [1, [1], [1], []], [2, [2], [], [2]], [3, [3], [3], []],
    ]);
    expect(reduction.sections[1]!.synopsis).toBe('');
    expect(reduction.sections[1]!.entities).toEqual([]);
    const city = reduction.synthesis.entities.find((entity) => entity.name === '合成之城');
    expect(city).toMatchObject({ kind: 'place', aliases: ['城邦'], note: '合成注记', unitOrdinals: [1, 3] });
    expect(city!.sourceRanges).toEqual([range(2), range(6)]);
    expect(reduction.synthesis.events.map((event) => [event.unitOrdinal, event.ordinal])).toEqual([[1, 1], [1, 2]]);
    expect(reduction.synthesis.relationships).toEqual([{
      subject: '合成人物甲', object: '合成之城', relation: '居于', sourceRanges: [range(2), range(6)], unitOrdinals: [1, 3],
    }]);
    expect(reduction.synthesis.unresolved).toEqual([{ unitOrdinal: 1, description: '合成人物甲的来历未交代。', sourceRanges: [range(2)] }]);
  });

  it('runs the deterministic contradiction pass before synthesis and leaves every conflict unresolved', () => {
    const kinds = reduction.conflicts.map((conflict) => conflict.kind);
    expect(kinds).toEqual(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']);
    const alias = reduction.conflicts.find((conflict) => conflict.kind === 'alias-collision')!;
    expect(alias.unitOrdinals).toEqual([1, 3]);
    expect(alias.description).toContain('阿甲');
    const claim = reduction.conflicts.find((conflict) => conflict.kind === 'setting-claim-divergence')!;
    expect(claim.description).toContain('位于北方');
    expect(claim.description).toContain('位于南方');
    expect(claim.sourceRanges).toEqual([range(2), range(6)]);
    expect(reduction.synthesis.conflicts).toEqual(reduction.conflicts);
    expect(reduction.synthesis.settingClaims).toHaveLength(2);
  });

  it('reports assurance independently of coverage, with the unresolved conflict count and the fixed statement', () => {
    expect(reduction.assurance).toMatchObject({
      axis: 'assurance', state: 'qualified-with-open-conflicts', unresolvedConflictCount: 4, unresolvedItemCount: 1, lowConfidenceUnitCount: 0,
      statement: ASSURANCE_STATEMENT,
    });
    const clean = reduceBaselineAnalysis(manifest, [
      { unitOrdinal: 1, state: 'closed', result: result(1, {}) },
      { unitOrdinal: 2, state: 'closed', result: result(2, {}) },
      { unitOrdinal: 3, state: 'closed', result: result(3, { confidence: 'low' }) },
    ]);
    expect(clean.coverage.state).toBe('complete');
    expect(clean.reducerClosure.state).toBe('closed');
    expect(clean.assurance.state).toBe('limited');
    expect(clean.assurance.lowConfidenceUnitCount).toBe(1);
    expect(clean.gaps).toEqual([]);
  });

  it('records a unit the run never reached as a not-attempted gap', () => {
    const partial = reduceBaselineAnalysis(manifest, [closedUnit1]);
    expect(partial.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[2, 'not-attempted'], [3, 'not-attempted']]);
    expect(partial.coverage.unitsClosed).toBe(1);
  });

  it('detects no conflict when units agree', () => {
    expect(detectCrossUnitConflicts([
      { unitOrdinal: 1, state: 'closed', result: result(1, { entities: [{ name: '甲', kind: 'person', aliases: ['小甲'], note: null, sourceRanges: [] }] }) },
      { unitOrdinal: 2, state: 'closed', result: result(2, { entities: [{ name: ' 甲', kind: 'person', aliases: ['小甲'], note: null, sourceRanges: [] }] }) },
    ])).toEqual([]);
  });
});
