import {
  INITIAL_EVALUATION_CONTRACT_VERSION,
  INITIAL_EVALUATION_EXPECTED_OUTCOME,
  INITIAL_EVALUATION_KIND,
  INITIAL_EVALUATION_MODE_GOALS,
  INITIAL_EVALUATION_MODE_LABELS,
  INITIAL_EVALUATION_MODE_MEANINGS,
  INITIAL_EVALUATION_TASK_MODES,
  INITIAL_EVALUATION_UPDATE_MODES,
  type InitialEvaluationResultProjection,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition } from '../analysis/kind-definition.js';
import { PRE_ASSURANCE_SAMPLE, type ClosedUnitOutcome } from '../analysis/reducers.js';
import { carryPositionalResult } from '../analysis/reused-result.js';
import {
  INITIAL_EVALUATION_RESULT_SET_REVISION_SCHEMA,
  INITIAL_EVALUATION_SUCCESSOR_REVISION_SCHEMA,
  INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
  INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
  buildInitialEvaluationSynthesisMessage,
  buildInitialEvaluationUnitMessage,
  initialEvaluationContract,
  initialEvaluationContractDigest,
  initialEvaluationMessageBlockIds,
  initialEvaluationObservationSetDigest,
  initialEvaluationRequestDigest,
  initialEvaluationSynthesisRequestDigest,
  parseInitialEvaluationSynthesis,
  parseInitialEvaluationUnitMessageHeader,
  parseInitialEvaluationUnitResult,
  type ClosedInitialEvaluationUnit,
  type InitialEvaluationProfileInput,
  type InitialEvaluationUnitResult,
} from './initial-evaluation-contract.js';
import { reduceInitialEvaluation, type InitialEvaluationUnitOutcome } from './initial-evaluation-reducers.js';

/**
 * Why 初评 cannot be prepared or started under a live scope (Issue #429 review, P2): its book-level synthesis is a transmission
 * the active Provider Processing policy (v5) does not name — v5 names the baseline's cross-unit reduction, and no reading has
 * made that term cover another kind's book-level turn. The provider-free scope is unaffected.
 */
export const INITIAL_EVALUATION_LIVE_UNAVAILABLE =
  'AI7 初评暂不可用：当前的模型处理策略没有写明 AI7 初评的全书综合可以发送给模型，在这个运行范围下不能准备或开始初评。' as const;

/**
 * AI7's 初评 as an analysis kind (Issue #429, plan slice S81b1): `evaluation`, read under `ai7.evaluation/1`, on the same real
 * path as every other kind — Task Intent, input checkpoint, Coverage Manifest, Plan Envelope, standard Run Authorization, Run,
 * Result Set Revision — through the same ledger, execution owner, Egress Gate and adapter. Its one book-level step is the
 * synthesis that scores the items, run as the baseline's cross-unit reduction is run: one admitted message, one turn, one
 * attempt — and, unlike that reduction, never under a live scope, since no Provider Processing policy names it yet.
 *
 * The kind takes the house Evaluation Profile it scores under; the profile is frozen into the contract, so the contract digest
 * and the schema digest every revision pins are that profile's own. It declares no assurance sample: AI7's scores are a draft
 * the editor scores against, never findings a re-read could uphold.
 */
export const INITIAL_EVALUATION_REDUCER_DESCRIPTOR = {
  schema: 'ai7.evaluation.reducers/1',
  stages: ['unit-validation', 'cross-unit-reduction', 'book-synthesis'],
  sufficiency: 'cited-blocks-at-least-3-in-half-the-units-sufficient-else-any-fair-else-insufficient',
  scorePolicy: 'synthesis-scores-or-none-never-derived',
} as const;

export const INITIAL_EVALUATION_REDUCER_DIGEST = sha256Hex(canonicalJson(INITIAL_EVALUATION_REDUCER_DESCRIPTOR));

const STAGES = ['unit-validation', 'cross-unit-reduction', 'book-synthesis'] as const;
const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行评估契约 v1，记下各评分项的依据', '全书综合：给出各项初评分数与评语，写出市场部分', '形成结果集修订版'] as const;
const UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算重读计划', '逐单元执行评估契约 v1，记下各评分项的依据', '全书综合：给出各项初评分数与评语，写出市场部分', '追加结果集修订版'] as const;
const NO_SAMPLE = 'AI7 初评没有保证抽样阶段：初评分数只作编辑打分的参考。' as const;
const SYNTHESIS_LABEL = '全书综合' as const;

/** What a settled 初评 Task tells its editor to do next: in 评估, never in ②A. */
const SAFE_NEXT_ACTIONS = {
  completed: '在「评估」中从 AI7 初评开始新的一版，逐项看过 AI7 的分数，再按你的判断定分。',
  'completed-with-gaps': '在「评估」中查看哪些阅读范围没有读到；全书综合没有给出分数时，可在稿件或网络恢复后重新初评。',
  failed: '核对运行失败原因；修复后可在「评估」中重新准备 AI7 初评。',
  interrupted: '运行已在派发后中断；已读完的阅读范围已保留，可在「评估」中重新准备 AI7 初评。',
  cancelled: '运行已按你的要求取消；需要时可在「评估」中重新准备 AI7 初评。',
} as const;

const MODES: ReadonlyArray<AnalysisModeDefinition> = INITIAL_EVALUATION_TASK_MODES.map((mode) => ({
  mode,
  goal: INITIAL_EVALUATION_MODE_GOALS[mode],
  label: INITIAL_EVALUATION_MODE_LABELS[mode],
  meaning: INITIAL_EVALUATION_MODE_MEANINGS[mode],
  initial: mode === 'evaluation-first',
  rangeBound: false,
  recompute: 'everything',
}));

export function initialEvaluationSchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({
    contractVersion: INITIAL_EVALUATION_CONTRACT_VERSION,
    unitResultSchema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
    promptContractDigest,
  }));
}

function closedUnits(closed: ReadonlyArray<ClosedUnitOutcome<unknown>>): ClosedInitialEvaluationUnit[] {
  return closed.map((outcome) => ({ unitOrdinal: outcome.unitOrdinal, result: outcome.result as InitialEvaluationUnitResult }));
}

export function initialEvaluationKindDefinition(profile: InitialEvaluationProfileInput & { readonly sha256: string }): AnalysisKindDefinition {
  const contract = initialEvaluationContract(profile);
  const promptContractDigest = initialEvaluationContractDigest(contract);
  const itemIds = contract.profile.items.map((item) => item.itemId);
  return {
    kind: INITIAL_EVALUATION_KIND,
    contractVersion: INITIAL_EVALUATION_CONTRACT_VERSION,
    expectedOutcome: INITIAL_EVALUATION_EXPECTED_OUTCOME,
    taskGoal: INITIAL_EVALUATION_MODE_GOALS['evaluation-first'],
    initialMode: 'evaluation-first',
    modes: MODES,
    updateModes: INITIAL_EVALUATION_UPDATE_MODES,
    // Every 初评 reads the whole manuscript afresh; the scope plan says so unit by unit.
    outOfScope: 'leave-unreviewed',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    unitResultSchema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
    revisionSchema: INITIAL_EVALUATION_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: INITIAL_EVALUATION_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: initialEvaluationSchemaDigest(promptContractDigest),
    reducerDigest: INITIAL_EVALUATION_REDUCER_DIGEST,
    reducerStages: STAGES,
    executionSteps: EXECUTION_STEPS,
    updateExecutionSteps: UPDATE_EXECUTION_STEPS,
    crossUnit: {
      promptContractDigest,
      resultSchema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
      step: {
        label: SYNTHESIS_LABEL,
        minimumClosedUnits: 1,
        notEnoughReason: '没有读完的阅读范围，全书综合未发起，AI7 没有给出初评分数。',
        buildMessage: (closed, totalUnits) => buildInitialEvaluationSynthesisMessage(contract, closedUnits(closed), totalUnits),
        requestDigest: (closed) => initialEvaluationSynthesisRequestDigest(promptContractDigest, initialEvaluationObservationSetDigest(closedUnits(closed))),
        parse: (text) => parseInitialEvaluationSynthesis(text, contract.profile),
      },
    },
    crossUnitAbsentReason: '',
    assurance: null,
    assuranceAbsentReason: NO_SAMPLE,
    safeNextActions: SAFE_NEXT_ACTIONS,
    // The kind's classes: each item's 依据充分度. A count of sufficiency, never a score or a quotation.
    findingCounts: (reduction) => {
      const evaluation = reduction.components.evaluation as InitialEvaluationResultProjection;
      const counts = new Map<string, number>();
      for (const item of evaluation.items) counts.set(`sufficiency:${item.sufficiency}`, (counts.get(`sufficiency:${item.sufficiency}`) ?? 0) + 1);
      return [...counts.keys()].sort().map((kind) => ({ kind, count: counts.get(kind)! }));
    },
    buildUnitMessage: (unit, totalUnits, blocksById) => buildInitialEvaluationUnitMessage(contract, unit, totalUnits, blocksById),
    parseUnitMessageHeader: parseInitialEvaluationUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => initialEvaluationRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseInitialEvaluationUnitResult(text, {
      unitOrdinal: unit.ordinal,
      blockCount: initialEvaluationMessageBlockIds(unit).length,
      itemIds,
    }),
    reduce: (input) => {
      const reduction = reduceInitialEvaluation({
        profile: { ...contract.profile, sha256: profile.sha256 },
        manifest: input.manifest,
        outcomes: input.outcomes as ReadonlyArray<InitialEvaluationUnitOutcome>,
        reusedUnitOrdinals: input.reusedUnitOrdinals,
        synthesis: input.crossUnit,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: { evaluation: reduction.evaluation },
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ observations: (result as InitialEvaluationUnitResult).observations }),
    unitResultOfRecord: (record, unitOrdinal): InitialEvaluationUnitResult => ({
      schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      observations: record.observations as InitialEvaluationUnitResult['observations'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as InitialEvaluationUnitResult, predecessorUnit, newUnit),
    // A 初评 settled before the market section existed (S81b2) holds none: it reads as having none.
    revisionComponents: (body) => ({
      evaluation: { ...(body.evaluation as InitialEvaluationResultProjection), market: (body.evaluation as Partial<InitialEvaluationResultProjection>).market ?? null },
      assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE,
    }),
    conflictCountOf: () => 0,
    mode: modeIndex(MODES),
  };
}
