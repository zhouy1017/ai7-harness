import {
  WRITING_CONTRACT_VERSION,
  WRITING_EXPECTED_OUTCOME,
  WRITING_KIND,
  WRITING_MODE_GOALS,
  WRITING_MODE_LABELS,
  WRITING_MODE_MEANINGS,
  WRITING_TASK_MODES,
  WRITING_UPDATE_MODES,
  type WritingResultProjection,
} from '../../shared/protocol.js';
import { AnalysisError, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { countByClass, modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition } from '../analysis/kind-definition.js';
import { PRE_ASSURANCE_SAMPLE, type ClosedUnitOutcome } from '../analysis/reducers.js';
import { carryPositionalResult } from '../analysis/reused-result.js';
import {
  WRITING_EXEMPLAR_MOVED,
  WRITING_RESULT_SET_REVISION_SCHEMA,
  WRITING_SUCCESSOR_REVISION_SCHEMA,
  WRITING_SYNTHESIS_RESULT_SCHEMA,
  WRITING_UNIT_RESULT_SCHEMA,
  buildWritingSynthesisMessage,
  buildWritingUnitMessage,
  parseWritingSynthesis,
  parseWritingUnitMessageHeader,
  parseWritingUnitResult,
  writingContract,
  writingContractDigest,
  writingExemplarLine,
  writingMessageBlockIds,
  writingPassageSetDigest,
  writingRequestDigest,
  writingSynthesisRequestDigest,
  WRITING_COPY_RULES,
  type ClosedWritingUnit,
  type WritingCopyRules,
  type WritingContractInput,
  type WritingUnitResult,
} from './writing-contract.js';
import { reduceWriting, type WritingUnitOutcome } from './writing-reducers.js';

/**
 * 写作任务 as an analysis kind (Issue #432, plan slice S84a; V2-UX-DELIV-007): `writing`, read under `ai7.writing/1`, on the
 * same real path as every other kind — Task Intent, input checkpoint, Coverage Manifest, Plan Envelope, standard Run
 * Authorization, Run, Result Set Revision — through the same ledger, execution owner, Egress Gate and adapter. One definition
 * per frozen contract: the house type, the editor's words, the reference set and the exemplars, as a 审稿意见's definition is one
 * per template and 定稿 version.
 *
 * It reads the manuscript, as 审稿意见 does, because the analysis path's one way to a book-level turn is through its units, and
 * because a document about a book draws on what is in it: its highlights, its people, its themes. Its book-level synthesis is a
 * transmission no Provider Processing policy names yet, so it is never prepared or started under a live scope; it declares no
 * assurance sample, since a draft the editor rewrites is not a finding a re-read could uphold.
 */
export const WRITING_REDUCER_DESCRIPTOR = {
  schema: 'ai7.writing.reducers/1',
  stages: ['unit-validation', 'cross-unit-reduction', 'book-synthesis'],
  draftPolicy: 'synthesis-sections-or-none-never-derived',
  exemplarPolicy: 'referenced-never-copied',
} as const;

export const WRITING_REDUCER_DIGEST = sha256Hex(canonicalJson(WRITING_REDUCER_DESCRIPTOR));

const STAGES = ['unit-validation', 'cross-unit-reduction', 'book-synthesis'] as const;
const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行写作契约 v1，找出文档可以取用的看点、人物与主题', '全书综合：依据参考材料写出文档的标题与各部分，范例只参照不复制', '形成结果集修订版'] as const;
const UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算重读计划', '逐单元执行写作契约 v1，找出文档可以取用的看点、人物与主题', '全书综合：依据参考材料写出文档的标题与各部分，范例只参照不复制', '追加结果集修订版'] as const;
const NO_SAMPLE = '写作任务没有保证抽样阶段：草稿由编辑修改后才用。' as const;
const SYNTHESIS_LABEL = '全书综合' as const;
/** The reading of a draft refused for copying an exemplar: it parsed, and it was turned away. */
export const WRITING_EXEMPLAR_REFUSAL_PREFIX = '全书综合写出的草稿被拒绝（exemplar-copied），AI7 没有写出可以打开的草稿：' as const;
/** The reading of a draft refused for copying a 资料库 item (Issue #428): it parsed, and it was turned away. */
export const WRITING_MATERIAL_REFUSAL_PREFIX = '全书综合写出的草稿被拒绝（material-copied），AI7 没有写出可以打开的草稿：' as const;

/** What a settled writing Task tells its editor to do next: in 交付物, where its draft opens. */
const SAFE_NEXT_ACTIONS = {
  completed: '在「交付物」的新建文档 · 写作任务中打开草稿，它成为这一类型的文档，处于「起草」阶段，在稿件编辑面上修改。',
  'completed-with-gaps': '在「交付物」中查看哪些阅读范围没有读到；全书综合没有写出草稿（包括因照抄范例被拒绝）时，可以重新起草。',
  failed: '核对运行失败原因；修复后可在「交付物」中重新起草。',
  interrupted: '运行已在派发后中断；可在「交付物」中重新起草。',
  cancelled: '运行已按你的要求取消；需要时可在「交付物」中重新起草。',
} as const;

const MODES: ReadonlyArray<AnalysisModeDefinition> = WRITING_TASK_MODES.map((mode) => ({
  mode,
  goal: WRITING_MODE_GOALS[mode],
  label: WRITING_MODE_LABELS[mode],
  meaning: WRITING_MODE_MEANINGS[mode],
  initial: mode === 'writing-first',
  rangeBound: false,
  recompute: 'everything',
}));

export function writingSchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({
    contractVersion: WRITING_CONTRACT_VERSION,
    unitResultSchema: WRITING_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: WRITING_SYNTHESIS_RESULT_SCHEMA,
    promptContractDigest,
  }));
}

function closedUnits(closed: ReadonlyArray<ClosedUnitOutcome<unknown>>): ClosedWritingUnit[] {
  return closed.map((outcome) => ({ unitOrdinal: outcome.unitOrdinal, result: outcome.result as WritingUnitResult }));
}

/**
 * The writing kind as one recorded Task reads it when an exemplar it referenced no longer gives the text it pinned (#688
 * re-review): the contract digest is the row's, since the contract cannot be composed again without that text, and every step
 * that would build a request or read an answer refuses. Its records — outcome, revisions, drafts — read as any other's.
 */
export function writingRecordedKindDefinition(
  input: WritingContractInput,
  promptContractDigest: string,
  rules: WritingCopyRules,
  moved: { readonly code: string; readonly message: string } = { code: 'WRITING_EXEMPLAR_MOVED', message: WRITING_EXEMPLAR_MOVED },
): AnalysisKindDefinition {
  const composed = writingKindDefinition(input, rules);
  // Why nothing of it builds a request: an exemplar's text, or a 资料库 item's pinned build, is no longer here (Issue #428).
  const refuse = (): never => {
    throw new AnalysisError(moved.code, moved.message);
  };
  const crossUnit = composed.crossUnit!;
  const step = crossUnit.step!;
  return {
    ...composed,
    promptContractDigest,
    schemaDigest: writingSchemaDigest(promptContractDigest),
    crossUnit: {
      ...crossUnit,
      promptContractDigest,
      step: {
        ...step,
        buildMessage: refuse,
        requestDigest: (closed) => writingSynthesisRequestDigest(promptContractDigest, writingPassageSetDigest(closedUnits(closed))),
        parse: refuse,
      },
    },
    buildUnitMessage: refuse,
    requestDigest: (unitOrdinal, unitDigest) => writingRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
  };
}

/**
 * The writing kind of one frozen contract, under the copy rules it was recorded with: `/2` for every Task prepared now, `/1` for
 * a Task recorded under #688's contract, which its parse keeps judging under `/1`'s sizes (the Commander's ruling on #704 P2-2).
 */
export function writingKindDefinition(input: WritingContractInput, rules: WritingCopyRules = WRITING_COPY_RULES): AnalysisKindDefinition {
  const contract = writingContract(input, rules);
  const promptContractDigest = writingContractDigest(contract);
  const frozen = contract.input;
  const exemplars = { count: frozen.exemplars.length, statement: writingExemplarLine(frozen.type.label, frozen.exemplars) };
  return {
    kind: WRITING_KIND,
    contractVersion: WRITING_CONTRACT_VERSION,
    expectedOutcome: WRITING_EXPECTED_OUTCOME,
    taskGoal: WRITING_MODE_GOALS['writing-first'],
    initialMode: 'writing-first',
    modes: MODES,
    updateModes: WRITING_UPDATE_MODES,
    // Every draft reads the whole manuscript afresh; the scope plan says so unit by unit.
    outOfScope: 'leave-unreviewed',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    unitResultSchema: WRITING_UNIT_RESULT_SCHEMA,
    revisionSchema: WRITING_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: WRITING_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: writingSchemaDigest(promptContractDigest),
    reducerDigest: WRITING_REDUCER_DIGEST,
    reducerStages: STAGES,
    executionSteps: EXECUTION_STEPS,
    updateExecutionSteps: UPDATE_EXECUTION_STEPS,
    crossUnit: {
      promptContractDigest,
      resultSchema: WRITING_SYNTHESIS_RESULT_SCHEMA,
      step: {
        label: SYNTHESIS_LABEL,
        minimumClosedUnits: 1,
        notEnoughReason: '没有读完的阅读范围，全书综合未发起，AI7 没有写出文档草稿。',
        buildMessage: (closed, totalUnits) => buildWritingSynthesisMessage(contract, closedUnits(closed), totalUnits),
        requestDigest: (closed) => writingSynthesisRequestDigest(promptContractDigest, writingPassageSetDigest(closedUnits(closed))),
        // A draft that copies an exemplar is refused whole, a gap: AI7 then writes no draft (KB-004).
        parse: (text) => parseWritingSynthesis(text, contract),
        refusalReason: (code, detail) => (code === 'exemplar-copied' ? `${WRITING_EXEMPLAR_REFUSAL_PREFIX}${detail}`
          : code === 'material-copied' ? `${WRITING_MATERIAL_REFUSAL_PREFIX}${detail}` : null),
        // The draft is the Task's result: a Run that wrote none completed with gaps, never 已完成.
        requiredForCompletion: true,
      },
    },
    crossUnitAbsentReason: '',
    assurance: null,
    assuranceAbsentReason: NO_SAMPLE,
    safeNextActions: SAFE_NEXT_ACTIONS,
    // The kind's classes: the passages by what they are. A count, never a quotation.
    findingCounts: (reduction) => countByClass((reduction.components.writing as WritingResultProjection).passages, 'passage', (passage) => passage.kind),
    buildUnitMessage: (unit, totalUnits, blocksById) => buildWritingUnitMessage(contract, unit, totalUnits, blocksById),
    parseUnitMessageHeader: parseWritingUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => writingRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseWritingUnitResult(text, { unitOrdinal: unit.ordinal, blockCount: writingMessageBlockIds(unit).length }),
    reduce: (reductionInput) => {
      const reduction = reduceWriting({
        type: frozen.type,
        exemplars,
        manifest: reductionInput.manifest,
        outcomes: reductionInput.outcomes as ReadonlyArray<WritingUnitOutcome>,
        reusedUnitOrdinals: reductionInput.reusedUnitOrdinals,
        synthesis: reductionInput.crossUnit,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: { writing: reduction.writing },
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ passages: (result as WritingUnitResult).passages }),
    unitResultOfRecord: (record, unitOrdinal): WritingUnitResult => ({
      schema: WRITING_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      passages: record.passages as WritingUnitResult['passages'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as WritingUnitResult, predecessorUnit, newUnit),
    revisionComponents: (body) => ({ writing: body.writing, assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE }),
    conflictCountOf: () => 0,
    mode: modeIndex(MODES),
  };
}
