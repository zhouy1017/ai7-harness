import {
  READERS_REPORT_CONTRACT_VERSION,
  READERS_REPORT_EXPECTED_OUTCOME,
  READERS_REPORT_KIND,
  READERS_REPORT_MODE_GOALS,
  READERS_REPORT_MODE_LABELS,
  READERS_REPORT_MODE_MEANINGS,
  READERS_REPORT_TASK_MODES,
  READERS_REPORT_UPDATE_MODES,
  type ReadersReportResultProjection,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { countByClass, modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition } from '../analysis/kind-definition.js';
import { PRE_ASSURANCE_SAMPLE, type ClosedUnitOutcome } from '../analysis/reducers.js';
import { carryPositionalResult } from '../analysis/reused-result.js';
import {
  READERS_REPORT_RESULT_SET_REVISION_SCHEMA,
  READERS_REPORT_SUCCESSOR_REVISION_SCHEMA,
  READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
  READERS_REPORT_UNIT_RESULT_SCHEMA,
  buildReadersReportSynthesisMessage,
  buildReadersReportUnitMessage,
  parseReadersReportSynthesis,
  parseReadersReportUnitMessageHeader,
  parseReadersReportUnitResult,
  readersReportContract,
  readersReportContractDigest,
  readersReportExemplarLine,
  readersReportMessageBlockIds,
  readersReportPassageSetDigest,
  readersReportRequestDigest,
  readersReportSynthesisRequestDigest,
  type ClosedReadersReportUnit,
  type ReadersReportContractInput,
  type ReadersReportUnitResult,
} from './readers-report-contract.js';
import { reduceReadersReport, type ReadersReportUnitOutcome } from './readers-report-reducers.js';

/**
 * 审稿意见 as an analysis kind (Issue #429, plan slice S81c; V2-UX-EVAL-013): `readers-report`, read under
 * `ai7.readers-report/1`, on the same real path as every other kind — Task Intent, input checkpoint, Coverage Manifest, Plan
 * Envelope, standard Run Authorization, Run, Result Set Revision — through the same ledger, execution owner, Egress Gate and
 * adapter. One definition per frozen contract: the template, the finalized record's words and the exemplars, as a review
 * category's definition is one per frozen category.
 *
 * Why it reads the manuscript at all, when its synthesis could have read the record alone: the analysis path's one way to a
 * book-level turn is through its units, and a second, unit-less execution path — its own states, cancellation and reports —
 * would be far more than this slice. Reading each range for the passages the report can point to is also what makes 主要问题
 * and 修改建议 something an author can find. Like 初评, its book-level synthesis is a transmission no Provider Processing policy
 * names yet, so it is never prepared or started under a live scope; it declares no assurance sample, since a draft the editor
 * rewrites is not a finding a re-read could uphold.
 */
export const READERS_REPORT_REDUCER_DESCRIPTOR = {
  schema: 'ai7.readers-report.reducers/1',
  stages: ['unit-validation', 'cross-unit-reduction', 'book-synthesis'],
  draftPolicy: 'synthesis-sections-or-none-never-derived',
} as const;

export const READERS_REPORT_REDUCER_DIGEST = sha256Hex(canonicalJson(READERS_REPORT_REDUCER_DESCRIPTOR));

const STAGES = ['unit-validation', 'cross-unit-reduction', 'book-synthesis'] as const;
const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行审稿意见契约 v1，找出可以引用的段落', '全书综合：按模板写出审稿意见的五个部分', '形成结果集修订版'] as const;
const UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算重读计划', '逐单元执行审稿意见契约 v1，找出可以引用的段落', '全书综合：按模板写出审稿意见的五个部分', '追加结果集修订版'] as const;
const NO_SAMPLE = '审稿意见没有保证抽样阶段：草稿由编辑修改后才用。' as const;
const SYNTHESIS_LABEL = '全书综合' as const;

/** What a settled 审稿意见 Task tells its editor to do next: in 评估, where its draft opens. */
const SAFE_NEXT_ACTIONS = {
  completed: '在「评估」的审稿意见中打开草稿，在稿件编辑面上修改，保存为版本后可导出为 DOCX。',
  'completed-with-gaps': '在「评估」中查看哪些阅读范围没有读到；全书综合没有写出草稿时，可在稿件或网络恢复后重新起草。',
  failed: '核对运行失败原因；修复后可在「评估」中重新起草审稿意见。',
  interrupted: '运行已在派发后中断；可在「评估」中重新起草审稿意见。',
  cancelled: '运行已按你的要求取消；需要时可在「评估」中重新起草审稿意见。',
} as const;

const MODES: ReadonlyArray<AnalysisModeDefinition> = READERS_REPORT_TASK_MODES.map((mode) => ({
  mode,
  goal: READERS_REPORT_MODE_GOALS[mode],
  label: READERS_REPORT_MODE_LABELS[mode],
  meaning: READERS_REPORT_MODE_MEANINGS[mode],
  initial: mode === 'readers-report-first',
  rangeBound: false,
  recompute: 'everything',
}));

export function readersReportSchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({
    contractVersion: READERS_REPORT_CONTRACT_VERSION,
    unitResultSchema: READERS_REPORT_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
    promptContractDigest,
  }));
}

function closedUnits(closed: ReadonlyArray<ClosedUnitOutcome<unknown>>): ClosedReadersReportUnit[] {
  return closed.map((outcome) => ({ unitOrdinal: outcome.unitOrdinal, result: outcome.result as ReadersReportUnitResult }));
}

export function readersReportKindDefinition(input: ReadersReportContractInput): AnalysisKindDefinition {
  const contract = readersReportContract(input);
  const promptContractDigest = readersReportContractDigest(contract);
  const exemplars = { count: contract.input.exemplars.length, statement: readersReportExemplarLine(contract.input.exemplars) };
  return {
    kind: READERS_REPORT_KIND,
    contractVersion: READERS_REPORT_CONTRACT_VERSION,
    expectedOutcome: READERS_REPORT_EXPECTED_OUTCOME,
    taskGoal: READERS_REPORT_MODE_GOALS['readers-report-first'],
    initialMode: 'readers-report-first',
    modes: MODES,
    updateModes: READERS_REPORT_UPDATE_MODES,
    // Every draft reads the whole manuscript afresh; the scope plan says so unit by unit.
    outOfScope: 'leave-unreviewed',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    unitResultSchema: READERS_REPORT_UNIT_RESULT_SCHEMA,
    revisionSchema: READERS_REPORT_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: READERS_REPORT_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: readersReportSchemaDigest(promptContractDigest),
    reducerDigest: READERS_REPORT_REDUCER_DIGEST,
    reducerStages: STAGES,
    executionSteps: EXECUTION_STEPS,
    updateExecutionSteps: UPDATE_EXECUTION_STEPS,
    crossUnit: {
      promptContractDigest,
      resultSchema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
      step: {
        label: SYNTHESIS_LABEL,
        minimumClosedUnits: 1,
        notEnoughReason: '没有读完的阅读范围，全书综合未发起，AI7 没有写出审稿意见草稿。',
        buildMessage: (closed, totalUnits) => buildReadersReportSynthesisMessage(contract, closedUnits(closed), totalUnits),
        requestDigest: (closed) => readersReportSynthesisRequestDigest(promptContractDigest, readersReportPassageSetDigest(closedUnits(closed))),
        // The 结论 must carry the conclusion the editor chose: a draft that says another is refused whole, a gap.
        parse: (text) => parseReadersReportSynthesis(text, contract.input.record.conclusion),
      },
    },
    crossUnitAbsentReason: '',
    assurance: null,
    assuranceAbsentReason: NO_SAMPLE,
    safeNextActions: SAFE_NEXT_ACTIONS,
    // The kind's classes: the passages by what they bear out. A count, never a quotation.
    findingCounts: (reduction) => countByClass((reduction.components.readersReport as ReadersReportResultProjection).passages, 'passage', (passage) => passage.kind),
    buildUnitMessage: (unit, totalUnits, blocksById) => buildReadersReportUnitMessage(contract, unit, totalUnits, blocksById),
    parseUnitMessageHeader: parseReadersReportUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => readersReportRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseReadersReportUnitResult(text, { unitOrdinal: unit.ordinal, blockCount: readersReportMessageBlockIds(unit).length }),
    reduce: (reductionInput) => {
      const reduction = reduceReadersReport({
        template: contract.input.template,
        exemplars,
        manifest: reductionInput.manifest,
        outcomes: reductionInput.outcomes as ReadonlyArray<ReadersReportUnitOutcome>,
        reusedUnitOrdinals: reductionInput.reusedUnitOrdinals,
        synthesis: reductionInput.crossUnit,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: { readersReport: reduction.readersReport },
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ passages: (result as ReadersReportUnitResult).passages }),
    unitResultOfRecord: (record, unitOrdinal): ReadersReportUnitResult => ({
      schema: READERS_REPORT_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      passages: record.passages as ReadersReportUnitResult['passages'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as ReadersReportUnitResult, predecessorUnit, newUnit),
    revisionComponents: (body) => ({ readersReport: body.readersReport, assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE }),
    conflictCountOf: () => 0,
    mode: modeIndex(MODES),
  };
}
