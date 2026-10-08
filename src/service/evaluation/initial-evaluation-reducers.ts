import {
  INITIAL_EVALUATION_ASSURANCE_STATEMENT,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type CoverageManifestProjection,
  type InitialEvaluationItemProjection,
  type InitialEvaluationObservationProjection,
  type InitialEvaluationResultProjection,
} from '../../shared/protocol.js';
import { evaluationSufficiency } from '../../shared/evaluation-scoring.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type CrossUnitOutcome, type GapUnitOutcome } from '../analysis/reducers.js';
import {
  initialEvaluationMessageBlockIds,
  type InitialEvaluationProfileInput,
  type InitialEvaluationSynthesisResult,
  type InitialEvaluationUnitResult,
} from './initial-evaluation-contract.js';

/**
 * Typed reducers over AI7's 初评 (Issue #429, plan slice S81b1): the observations of every closed unit gathered per scored item,
 * each cited position resolved to the block it names; 依据充分度 counted from those blocks alone (`evaluationSufficiency`);
 * and the book-level synthesis's scores and comments set beside them, or none at all when the synthesis did not close. The
 * reducer never scores: a number is the synthesis's or nothing, and nothing here turns an observation into one.
 */
export type InitialEvaluationUnitOutcome = ClosedUnitOutcome<InitialEvaluationUnitResult> | GapUnitOutcome;


export interface InitialEvaluationReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly evaluation: InitialEvaluationResultProjection;
}

export interface InitialEvaluationReductionInput {
  readonly profile: InitialEvaluationProfileInput & { readonly sha256: string };
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<InitialEvaluationUnitOutcome>;
  readonly reusedUnitOrdinals?: ReadonlySet<number>;
  /** The book-level synthesis; its closed outcome carries the parsed synthesis result. */
  readonly synthesis: CrossUnitOutcome;
}

function stage(name: AnalysisReducerStageProjection['stage'], state: AnalysisReducerStageProjection['state'], inputCount: number): AnalysisReducerStageProjection {
  return { stage: name, state, inputCount };
}

export function reduceInitialEvaluation(input: InitialEvaluationReductionInput): InitialEvaluationReduction {
  const { manifest, profile } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<InitialEvaluationUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);
  const outOfScope = gaps.filter((gap) => gap.code === 'out-of-scope').length;
  const lost = gaps.length - outOfScope;

  // Every observation, in unit order, with its positions resolved to the blocks the unit message listed.
  const observations: InitialEvaluationObservationProjection[] = [];
  for (const outcome of closed) {
    const blockIds = initialEvaluationMessageBlockIds(manifest.units[outcome.unitOrdinal - 1]!);
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

  const synthesis: InitialEvaluationSynthesisResult | null = input.synthesis.state === 'closed'
    ? (input.synthesis.result as InitialEvaluationSynthesisResult | undefined) ?? null
    : null;
  const items: InitialEvaluationItemProjection[] = profile.items.map((item) => {
    const own = observations.filter((observation) => observation.itemId === item.itemId);
    const citedBlocks = new Set(own.flatMap((observation) => observation.blockIds)).size;
    const unitsCited = new Set(own.map((observation) => observation.unitOrdinal)).size;
    const scored = synthesis?.items.find((entry) => entry.itemId === item.itemId) ?? null;
    return {
      itemId: item.itemId,
      score: scored?.score ?? null,
      comment: scored?.comment ?? null,
      sufficiency: evaluationSufficiency({ citedBlocks, unitsCited, unitsTotal: manifest.units.length }),
      citedBlocks,
      unitsCited,
      observations: own,
    };
  });

  const synthesisState: InitialEvaluationResultProjection['synthesis'] = input.synthesis.state === 'closed' && synthesis !== null
    ? { state: 'closed', reason: null }
    : input.synthesis.state === 'gap'
      ? { state: 'gap', reason: input.synthesis.reason }
      : { state: 'not-run', reason: input.synthesis.state === 'not-run' ? input.synthesis.reason : '全书综合没有给出结果。' };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', lost > 0 ? 'closed-with-gaps' : 'closed', ordered.length - outOfScope),
    stage('cross-unit-reduction', synthesisState.state === 'closed' ? 'closed' : synthesisState.state === 'gap' ? 'closed-with-gaps' : 'not-run', closed.length),
    stage('book-synthesis', synthesisState.state === 'closed' ? 'closed' : 'closed-with-gaps', profile.items.length),
  ];
  const gapsCarried = stages.some((entry) => entry.state !== 'closed');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: gapsCarried ? 'closed-with-gaps' : 'closed',
    label: !gapsCarried
      ? '归约/综合闭合：全部阶段已闭合'
      : synthesisState.state !== 'closed'
        ? '归约/综合闭合：已闭合 · 全书综合未给出分数'
        : `归约/综合闭合：已闭合 · 保留 ${lost} 处缺口`,
    stages,
  };

  const insufficient = items.filter((item) => item.sufficiency === 'insufficient').length;
  const assuranceState: AnalysisAssuranceAxis['state'] = synthesisState.state === 'closed' && insufficient === 0 ? 'qualified' : 'limited';
  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: assuranceState,
    label: synthesisState.state !== 'closed'
      ? '语义/证据保证：有限 · 全书综合未闭合，没有初评分数'
      : insufficient === 0
        ? `语义/证据保证：合格 · ${items.length} 项均有引用依据 · 分数待编辑定分`
        : `语义/证据保证：有限 · ${insufficient} 项依据不足 · 分数待编辑定分`,
    unresolvedConflictCount: 0,
    unresolvedItemCount: 0,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    sampledPrecision: null,
    statement: INITIAL_EVALUATION_ASSURANCE_STATEMENT,
  };

  const unitsReused = closed.filter((outcome) => (input.reusedUnitOrdinals ?? new Set<number>()).has(outcome.unitOrdinal)).length;
  const coverage = coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  return {
    coverage,
    reducerClosure,
    assurance,
    gaps,
    evaluation: {
      profile: { profileId: profile.profileId, version: profile.version, sha256: profile.sha256 },
      items,
      strengths: synthesis?.strengths ?? [],
      weaknesses: synthesis?.weaknesses ?? [],
      nextStep: synthesis?.nextStep ?? null,
      suggestedConclusion: synthesis?.suggestedConclusion ?? null,
      synthesis: synthesisState,
    },
  };
}
