import {
  READERS_REPORT_ASSURANCE_STATEMENT,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type CoverageManifestProjection,
  type ReadersReportPassageProjection,
  type ReadersReportResultProjection,
  type ReadersReportTemplate,
} from '../../shared/protocol.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type CrossUnitOutcome, type GapUnitOutcome } from '../analysis/reducers.js';
import { readersReportMessageBlockIds, type ReadersReportSynthesisResult, type ReadersReportUnitResult } from './readers-report-contract.js';

/**
 * Typed reducers over a 审稿意见 draft (Issue #429, plan slice S81c): the passages of every closed unit, each cited position
 * resolved to the block it names, and the book-level synthesis's five sections beside them — or none at all when the
 * synthesis did not close. The reducer never writes: every word of the draft is the synthesis's or nothing.
 */
export type ReadersReportUnitOutcome = ClosedUnitOutcome<ReadersReportUnitResult> | GapUnitOutcome;

export interface ReadersReportReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly readersReport: ReadersReportResultProjection;
}

export interface ReadersReportReductionInput {
  readonly template: ReadersReportTemplate;
  readonly exemplars: { readonly count: number; readonly statement: string };
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<ReadersReportUnitOutcome>;
  readonly reusedUnitOrdinals?: ReadonlySet<number>;
  /** The book-level synthesis; its closed outcome carries the parsed five sections. */
  readonly synthesis: CrossUnitOutcome;
}

function stage(name: AnalysisReducerStageProjection['stage'], state: AnalysisReducerStageProjection['state'], inputCount: number): AnalysisReducerStageProjection {
  return { stage: name, state, inputCount };
}

export function reduceReadersReport(input: ReadersReportReductionInput): ReadersReportReduction {
  const { manifest } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<ReadersReportUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);
  const outOfScope = gaps.filter((gap) => gap.code === 'out-of-scope').length;
  const lost = gaps.length - outOfScope;

  // Every passage, in unit order, with its positions resolved to the blocks the unit message listed.
  const passages: ReadersReportPassageProjection[] = [];
  for (const outcome of closed) {
    const blockIds = readersReportMessageBlockIds(manifest.units[outcome.unitOrdinal - 1]!);
    for (const passage of outcome.result.passages) {
      passages.push({
        unitOrdinal: outcome.unitOrdinal,
        kind: passage.kind,
        note: passage.note,
        // The parser refused a position past the unit's blocks, so every one names a block here.
        blockIds: passage.blockOrdinals.map((ordinal) => blockIds[ordinal - 1]!),
      });
    }
  }

  const synthesis: ReadersReportSynthesisResult | null = input.synthesis.state === 'closed'
    ? (input.synthesis.result as ReadersReportSynthesisResult | undefined) ?? null
    : null;
  const synthesisState: ReadersReportResultProjection['synthesis'] = input.synthesis.state === 'closed' && synthesis !== null
    ? { state: 'closed', reason: null }
    : input.synthesis.state === 'gap'
      ? { state: 'gap', reason: input.synthesis.reason }
      : { state: 'not-run', reason: input.synthesis.state === 'not-run' ? input.synthesis.reason : '全书综合没有给出结果。' };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', lost > 0 ? 'closed-with-gaps' : 'closed', ordered.length - outOfScope),
    stage('cross-unit-reduction', synthesisState.state === 'closed' ? 'closed' : synthesisState.state === 'gap' ? 'closed-with-gaps' : 'not-run', closed.length),
    stage('book-synthesis', synthesisState.state === 'closed' ? 'closed' : 'closed-with-gaps', 5),
  ];
  const gapsCarried = stages.some((entry) => entry.state !== 'closed');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: gapsCarried ? 'closed-with-gaps' : 'closed',
    label: !gapsCarried
      ? '归约/综合闭合：全部阶段已闭合'
      : synthesisState.state !== 'closed'
        ? '归约/综合闭合：已闭合 · 全书综合没有写出审稿意见'
        : `归约/综合闭合：已闭合 · 保留 ${lost} 处缺口`,
    stages,
  };

  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: synthesisState.state === 'closed' && lost === 0 ? 'qualified' : 'limited',
    label: synthesisState.state !== 'closed'
      ? '语义/证据保证：有限 · 全书综合未闭合，没有审稿意见草稿'
      : lost === 0
        ? `语义/证据保证：合格 · 引用 ${passages.length} 处段落写成五个部分 · 草稿待编辑修改`
        : `语义/证据保证：有限 · ${lost} 个阅读范围没有读到 · 草稿待编辑修改`,
    unresolvedConflictCount: 0,
    unresolvedItemCount: 0,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    sampledPrecision: null,
    statement: READERS_REPORT_ASSURANCE_STATEMENT,
  };

  const unitsReused = closed.filter((outcome) => (input.reusedUnitOrdinals ?? new Set<number>()).has(outcome.unitOrdinal)).length;
  const coverage = coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  return {
    coverage,
    reducerClosure,
    assurance,
    gaps,
    readersReport: {
      template: input.template,
      exemplars: { count: input.exemplars.count, statement: input.exemplars.statement },
      passages,
      sections: synthesis === null ? null : {
        overall: synthesis.overall,
        strengths: [...synthesis.strengths],
        problems: [...synthesis.problems],
        suggestions: [...synthesis.suggestions],
        conclusion: synthesis.conclusion,
      },
      synthesis: synthesisState,
    },
  };
}
