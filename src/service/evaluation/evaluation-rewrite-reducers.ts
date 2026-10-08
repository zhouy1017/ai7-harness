import {
  EVALUATION_REWRITE_ASSURANCE_STATEMENT,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type CoverageManifestProjection,
  type EvaluationRewriteObservationProjection,
  type EvaluationRewriteResultProjection,
} from '../../shared/protocol.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type CrossUnitOutcome, type GapUnitOutcome } from '../analysis/reducers.js';
import { evaluationRewriteMessageBlockIds, type EvaluationRewriteSynthesisResult, type EvaluationRewriteUnitResult } from './evaluation-rewrite-contract.js';

/**
 * Typed reducers over 按我的评分重写评语 (Issue #429, plan slice S81b2): the observations of every closed unit, each cited position
 * resolved to the block it names, and the book-level synthesis's rewritten 评语 and 总评 beside them — or none at all when the
 * synthesis did not close. The reducer never writes a word and never a number: the words are the synthesis's or nothing.
 */
export type EvaluationRewriteUnitOutcome = ClosedUnitOutcome<EvaluationRewriteUnitResult> | GapUnitOutcome;

export interface EvaluationRewriteReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly rewrite: EvaluationRewriteResultProjection;
}

export interface EvaluationRewriteReductionInput {
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<EvaluationRewriteUnitOutcome>;
  readonly reusedUnitOrdinals?: ReadonlySet<number>;
  /** How many items the editor scored: the 评语 the synthesis writes. */
  readonly scoredItems: number;
  /** The book-level synthesis; its closed outcome carries the parsed words. */
  readonly synthesis: CrossUnitOutcome;
}

function stage(name: AnalysisReducerStageProjection['stage'], state: AnalysisReducerStageProjection['state'], inputCount: number): AnalysisReducerStageProjection {
  return { stage: name, state, inputCount };
}

export function reduceEvaluationRewrite(input: EvaluationRewriteReductionInput): EvaluationRewriteReduction {
  const { manifest } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<EvaluationRewriteUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);
  const outOfScope = gaps.filter((gap) => gap.code === 'out-of-scope').length;
  const lost = gaps.length - outOfScope;

  // Every observation, in unit order, with its positions resolved to the blocks the unit message listed.
  const observations: EvaluationRewriteObservationProjection[] = [];
  for (const outcome of closed) {
    const blockIds = evaluationRewriteMessageBlockIds(manifest.units[outcome.unitOrdinal - 1]!);
    for (const observation of outcome.result.observations) {
      observations.push({
        itemId: observation.itemId,
        unitOrdinal: outcome.unitOrdinal,
        note: observation.note,
        // The parser refused a position past the unit's blocks, so every one names a block here.
        blockIds: observation.blockOrdinals.map((ordinal) => blockIds[ordinal - 1]!),
      });
    }
  }

  const synthesis: EvaluationRewriteSynthesisResult | null = input.synthesis.state === 'closed'
    ? (input.synthesis.result as EvaluationRewriteSynthesisResult | undefined) ?? null
    : null;
  const synthesisState: EvaluationRewriteResultProjection['synthesis'] = input.synthesis.state === 'closed' && synthesis !== null
    ? { state: 'closed', reason: null }
    : input.synthesis.state === 'gap'
      ? { state: 'gap', reason: input.synthesis.reason }
      : { state: 'not-run', reason: input.synthesis.state === 'not-run' ? input.synthesis.reason : '全书综合没有给出结果。' };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', lost > 0 ? 'closed-with-gaps' : 'closed', ordered.length - outOfScope),
    stage('cross-unit-reduction', synthesisState.state === 'closed' ? 'closed' : synthesisState.state === 'gap' ? 'closed-with-gaps' : 'not-run', closed.length),
    stage('book-synthesis', synthesisState.state === 'closed' ? 'closed' : 'closed-with-gaps', input.scoredItems + 1),
  ];
  const gapsCarried = stages.some((entry) => entry.state !== 'closed');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: gapsCarried ? 'closed-with-gaps' : 'closed',
    label: !gapsCarried
      ? '归约/综合闭合：全部阶段已闭合'
      : synthesisState.state !== 'closed'
        ? '归约/综合闭合：已闭合 · 全书综合没有重写评语'
        : `归约/综合闭合：已闭合 · 保留 ${lost} 处缺口`,
    stages,
  };

  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: synthesisState.state === 'closed' && lost === 0 ? 'qualified' : 'limited',
    label: synthesisState.state !== 'closed'
      ? '语义/证据保证：有限 · 全书综合未闭合，没有重写的评语'
      : lost === 0
        ? `语义/证据保证：合格 · 引用 ${observations.length} 条依据重写评语 · 待编辑决定是否采用`
        : `语义/证据保证：有限 · ${lost} 个阅读范围没有读到 · 待编辑决定是否采用`,
    unresolvedConflictCount: 0,
    unresolvedItemCount: 0,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    sampledPrecision: null,
    statement: EVALUATION_REWRITE_ASSURANCE_STATEMENT,
  };

  const unitsReused = closed.filter((outcome) => (input.reusedUnitOrdinals ?? new Set<number>()).has(outcome.unitOrdinal)).length;
  const coverage = coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  return {
    coverage,
    reducerClosure,
    assurance,
    gaps,
    rewrite: {
      observations,
      words: synthesis === null ? null : { items: synthesis.items.map((item) => ({ itemId: item.itemId, comment: item.comment })), verdict: synthesis.verdict },
      synthesis: synthesisState,
    },
  };
}
