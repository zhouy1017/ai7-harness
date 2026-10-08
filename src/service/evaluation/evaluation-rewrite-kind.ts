import {
  EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_EXPECTED_OUTCOME,
  EVALUATION_REWRITE_KIND,
  EVALUATION_REWRITE_MODE_GOALS,
  EVALUATION_REWRITE_MODE_LABELS,
  EVALUATION_REWRITE_MODE_MEANINGS,
  EVALUATION_REWRITE_TASK_MODES,
  EVALUATION_REWRITE_UPDATE_MODES,
  type EvaluationRewriteResultProjection,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { countByClass, modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition } from '../analysis/kind-definition.js';
import { PRE_ASSURANCE_SAMPLE, type ClosedUnitOutcome } from '../analysis/reducers.js';
import { carryPositionalResult } from '../analysis/reused-result.js';
import {
  EVALUATION_REWRITE_RESULT_SET_REVISION_SCHEMA,
  EVALUATION_REWRITE_SUCCESSOR_REVISION_SCHEMA,
  EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
  EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
  buildEvaluationRewriteSynthesisMessage,
  buildEvaluationRewriteUnitMessage,
  evaluationRewriteContract,
  evaluationRewriteContractDigest,
  evaluationRewriteMessageBlockIds,
  evaluationRewriteObservationSetDigest,
  evaluationRewriteRequestDigest,
  evaluationRewriteScoredItems,
  evaluationRewriteSynthesisRequestDigest,
  parseEvaluationRewriteSynthesis,
  parseEvaluationRewriteUnitMessageHeader,
  parseEvaluationRewriteUnitResult,
  type ClosedEvaluationRewriteUnit,
  type EvaluationRewriteContractInput,
  type EvaluationRewriteUnitResult,
} from './evaluation-rewrite-contract.js';
import { reduceEvaluationRewrite, type EvaluationRewriteUnitOutcome } from './evaluation-rewrite-reducers.js';

/**
 * 按我的评分重写评语 as an analysis kind (Issue #429, plan slice S81b2; V2-UX-EVAL-008): `evaluation-rewrite`, read under
 * `ai7.evaluation-rewrite/1`, on the same real path as every other kind — Task Intent, input checkpoint, Coverage Manifest, Plan
 * Envelope, standard Run Authorization, Run, Result Set Revision — through the same ledger, execution owner, Egress Gate and
 * adapter. One definition per frozen contract: one version's words at one saved entry, as 审稿意见's is one per 定稿 version.
 *
 * It reads the manuscript for the reason 审稿意见 does: the analysis path's one way to a book-level turn is through its units —
 * and a 评语 rewritten to the editor's score is one that can point to what bears that score out (EVAL-006: a comment citing
 * sources). Like 初评, its book-level synthesis is a transmission no Provider Processing policy names yet, so it is never
 * prepared or started under a live scope; it declares no assurance sample, since a proposal the editor 采用 or 放弃 is not a
 * finding a re-read could uphold.
 */
export const EVALUATION_REWRITE_REDUCER_DESCRIPTOR = {
  schema: 'ai7.evaluation-rewrite.reducers/1',
  stages: ['unit-validation', 'cross-unit-reduction', 'book-synthesis'],
  wordsPolicy: 'synthesis-words-or-none-never-derived-never-a-number',
} as const;

export const EVALUATION_REWRITE_REDUCER_DIGEST = sha256Hex(canonicalJson(EVALUATION_REWRITE_REDUCER_DESCRIPTOR));

const STAGES = ['unit-validation', 'cross-unit-reduction', 'book-synthesis'] as const;
const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行评语重写契约 v1，记下能说明编辑所给分数的依据', '全书综合：按编辑的评分重写各项评语与总评', '形成结果集修订版'] as const;
const UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算重读计划', '逐单元执行评语重写契约 v1，记下能说明编辑所给分数的依据', '全书综合：按编辑的评分重写各项评语与总评', '追加结果集修订版'] as const;
const NO_SAMPLE = '评语重写没有保证抽样阶段：重写的评语由编辑决定是否采用。' as const;
const SYNTHESIS_LABEL = '全书综合' as const;

/** What a settled rewrite Task tells its editor to do next: in 评估, where its proposal waits. */
const SAFE_NEXT_ACTIONS = {
  completed: '在「评估」中对照重写前后的评语，决定采用还是放弃；采用后才记入这一版评估，分数不变。',
  'completed-with-gaps': '在「评估」中查看哪些阅读范围没有读到；全书综合没有写出评语时，可在稿件或网络恢复后再次重写。',
  failed: '核对运行失败原因；修复后可在「评估」中再次按你的评分重写评语。',
  interrupted: '运行已在派发后中断；可在「评估」中再次按你的评分重写评语。',
  cancelled: '运行已按你的要求取消；需要时可在「评估」中再次按你的评分重写评语。',
} as const;

const MODES: ReadonlyArray<AnalysisModeDefinition> = EVALUATION_REWRITE_TASK_MODES.map((mode) => ({
  mode,
  goal: EVALUATION_REWRITE_MODE_GOALS[mode],
  label: EVALUATION_REWRITE_MODE_LABELS[mode],
  meaning: EVALUATION_REWRITE_MODE_MEANINGS[mode],
  initial: mode === 'evaluation-rewrite-first',
  rangeBound: false,
  recompute: 'everything',
}));

export function evaluationRewriteSchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({
    contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION,
    unitResultSchema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
    promptContractDigest,
  }));
}

function closedUnits(closed: ReadonlyArray<ClosedUnitOutcome<unknown>>): ClosedEvaluationRewriteUnit[] {
  return closed.map((outcome) => ({ unitOrdinal: outcome.unitOrdinal, result: outcome.result as EvaluationRewriteUnitResult }));
}

export function evaluationRewriteKindDefinition(input: EvaluationRewriteContractInput): AnalysisKindDefinition {
  const contract = evaluationRewriteContract(input);
  const promptContractDigest = evaluationRewriteContractDigest(contract);
  const itemIds = evaluationRewriteScoredItems(contract.input).map((item) => item.itemId);
  return {
    kind: EVALUATION_REWRITE_KIND,
    contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION,
    expectedOutcome: EVALUATION_REWRITE_EXPECTED_OUTCOME,
    taskGoal: EVALUATION_REWRITE_MODE_GOALS['evaluation-rewrite-first'],
    initialMode: 'evaluation-rewrite-first',
    modes: MODES,
    updateModes: EVALUATION_REWRITE_UPDATE_MODES,
    // Every rewrite reads the whole manuscript afresh; the scope plan says so unit by unit.
    outOfScope: 'leave-unreviewed',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    unitResultSchema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
    revisionSchema: EVALUATION_REWRITE_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: EVALUATION_REWRITE_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: evaluationRewriteSchemaDigest(promptContractDigest),
    reducerDigest: EVALUATION_REWRITE_REDUCER_DIGEST,
    reducerStages: STAGES,
    executionSteps: EXECUTION_STEPS,
    updateExecutionSteps: UPDATE_EXECUTION_STEPS,
    crossUnit: {
      promptContractDigest,
      resultSchema: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
      step: {
        label: SYNTHESIS_LABEL,
        minimumClosedUnits: 1,
        notEnoughReason: '没有读完的阅读范围，全书综合未发起，AI7 没有重写评语。',
        buildMessage: (closed, totalUnits) => buildEvaluationRewriteSynthesisMessage(contract, closedUnits(closed), totalUnits),
        requestDigest: (closed) => evaluationRewriteSynthesisRequestDigest(promptContractDigest, evaluationRewriteObservationSetDigest(closedUnits(closed))),
        parse: (text) => parseEvaluationRewriteSynthesis(text, contract.input),
      },
    },
    crossUnitAbsentReason: '',
    assurance: null,
    assuranceAbsentReason: NO_SAMPLE,
    safeNextActions: SAFE_NEXT_ACTIONS,
    // The kind's classes: the observations by the item they bear out. A count, never a quotation.
    findingCounts: (reduction) => countByClass((reduction.components.rewrite as EvaluationRewriteResultProjection).observations, 'observation', (observation) => observation.itemId),
    buildUnitMessage: (unit, totalUnits, blocksById) => buildEvaluationRewriteUnitMessage(contract, unit, totalUnits, blocksById),
    parseUnitMessageHeader: parseEvaluationRewriteUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => evaluationRewriteRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseEvaluationRewriteUnitResult(text, {
      unitOrdinal: unit.ordinal,
      blockCount: evaluationRewriteMessageBlockIds(unit).length,
      itemIds,
    }),
    reduce: (reductionInput) => {
      const reduction = reduceEvaluationRewrite({
        manifest: reductionInput.manifest,
        outcomes: reductionInput.outcomes as ReadonlyArray<EvaluationRewriteUnitOutcome>,
        reusedUnitOrdinals: reductionInput.reusedUnitOrdinals,
        scoredItems: itemIds.length,
        synthesis: reductionInput.crossUnit,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: { rewrite: reduction.rewrite },
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ observations: (result as EvaluationRewriteUnitResult).observations }),
    unitResultOfRecord: (record, unitOrdinal): EvaluationRewriteUnitResult => ({
      schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      observations: record.observations as EvaluationRewriteUnitResult['observations'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as EvaluationRewriteUnitResult, predecessorUnit, newUnit),
    revisionComponents: (body) => ({ rewrite: body.rewrite, assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE }),
    conflictCountOf: () => 0,
    mode: modeIndex(MODES),
  };
}
