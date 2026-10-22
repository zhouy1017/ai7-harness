import {
  BASELINE_ANALYSIS_MODE_LABELS,
  BASELINE_ANALYSIS_MODE_MEANINGS,
  BASELINE_ANALYSIS_UPDATE_MODES,
  CUSTOM_ANALYSIS_ASSURANCE_STATEMENT,
  CUSTOM_ANALYSIS_CONTRACT_VERSION,
  customAnalysisExpectedOutcome,
  customAnalysisKindId,
  customAnalysisModeGoal,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type BaselineAnalysisTaskMode,
  type CoverageManifestProjection,
  type CustomAnalysisRowProjection,
  type TaskPlanProjection,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from './canonical.js';
import { buildUnitMessage, parseUnitMessageHeader, unitRequestDigest } from './contract.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import {
  CUSTOM_ANALYSIS_RESULT_SET_REVISION_SCHEMA,
  CUSTOM_ANALYSIS_SUCCESSOR_REVISION_SCHEMA,
  CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA,
  customAnalysisContract,
  customAnalysisContractDigest,
  parseCustomAnalysisUnitResult,
  type CustomAnalysisContractInput,
  type CustomAnalysisUnitResult,
} from './custom-analysis-contract.js';
import { locateQuotation, normalizedQuotation } from './factual-review-contract.js';
import { countByClass, modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition } from './kind-definition.js';
import { PRE_ASSURANCE_SAMPLE, coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type GapUnitOutcome } from './reducers.js';
import { carryPositionalResult } from './reused-result.js';

/**
 * One 自定义分析维度 version as an analysis kind (Issue #922, wave 10 slice 7f; ADR 0090 item 4): `custom-analysis/<dimension-id>`,
 * read under `ai7.custom-analysis/1`, on the same real path as every other kind — Task Intent, input checkpoint, Coverage
 * Manifest, Plan Envelope, standard Run Authorization, Run, Result Set Revision — through the same ledger, execution owner, Egress
 * Gate and adapter. Its Tasks take the baseline's four modes and its units travel in the baseline's unit message, so the
 * deterministic adapter keys them by this definition's own prompt-contract digest and needs nothing of its own.
 *
 * There is one contract, one reducer and this one function for every dimension: a dimension is the editor's document, not code.
 * What differs between two versions is exactly what the function is given, and all of it lands in the frozen contract, so the
 * contract digest — and through it every request digest and the schema digest each revision pins — is the version's own.
 *
 * The reducer lists and locates; it never synthesizes across units (the Authority Ceiling). Its counts are the revision's summary.
 */
export const CUSTOM_ANALYSIS_REDUCER_DESCRIPTOR = {
  schema: 'ai7.custom-analysis.reducers/1',
  stages: ['unit-validation', 'reference-integrity'],
  referenceIntegrity: 'deterministic-normalized-exact-match-in-committed-block',
  sourceRangeMapping: 'folded-utf16-code-units-to-source-graphemes',
  sourceRangeIntegrity: 'sole-candidate-normalized-grapheme-slice-equals-quotation',
  normalization: ['whitespace-collapse', 'fullwidth-halfwidth-ascii'],
  anchorStates: ['located', 'not-found', 'ambiguous'],
  crossUnitSynthesis: 'none',
  certaintyPolicy: 'answer-and-locate-never-score',
} as const;

export const CUSTOM_ANALYSIS_REDUCER_DIGEST = sha256Hex(canonicalJson(CUSTOM_ANALYSIS_REDUCER_DESCRIPTOR));

const REDUCER_STAGES = ['unit-validation', 'reference-integrity'] as const;
const CROSS_UNIT_ABSENT_REASON = '自定义分析不跨单元归纳。' as const;
const NO_SAMPLE = '自定义分析没有保证抽样阶段。' as const;

const SAFE_NEXT_ACTIONS = {
  completed: '在「分析 › 自定义」中逐单元查看回答与引文；稿件变化后可同步到当前稿件，或重新分析所选范围或全书，每次都追加后继修订版。',
  'completed-with-gaps': '逐项查看缺口单元；缺口单元在下一次覆盖它的分析中会重新回答，结果集修订版本身不会改写。已回答的单元仍可查看。',
  failed: '核对运行失败原因；修复后可在「分析 › 自定义」中重新运行这个维度。',
  interrupted: '运行已在派发后中断；已回答单元的结果与缺口均已保留，续行需要在「分析 › 自定义」中重新运行并授权。',
  cancelled: '运行已按你的要求取消；已回答单元的结果与缺口均已保留，没有读到的单元记为未尝试。需要时可在「分析 › 自定义」中重新运行。',
} as const;

/** The dimension a revision was read under: what `revisionComponents` pins and the 自定义 tab names. */
export interface CustomAnalysisDimensionPin {
  readonly dimensionId: string;
  readonly versionId: string;
  readonly version: number;
  readonly documentDigest: string;
}

export interface CustomAnalysisRowCounts {
  readonly units: number;
  readonly rows: number;
  readonly located: number;
  readonly unlocated: number;
}

export type CustomAnalysisUnitOutcome = ClosedUnitOutcome<CustomAnalysisUnitResult> | GapUnitOutcome;

/** The schema digest of one version: the contract version, the unit result schema, and the version's own frozen contract. */
export function customAnalysisSchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({ contractVersion: CUSTOM_ANALYSIS_CONTRACT_VERSION, unitResultSchema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, promptContractDigest }));
}

/** A stable identity for one row: a pure function of the dimension version, the unit, the row's place and what it says. */
function rowId(parts: Readonly<Record<string, unknown>>): string {
  return `car_${sha256Hex(canonicalJson(parts)).slice(0, 24)}`;
}

function stage(name: AnalysisReducerStageProjection['stage'], inputCount: number, gaps: number): AnalysisReducerStageProjection {
  return { stage: name, state: gaps > 0 ? 'closed-with-gaps' : 'closed', inputCount };
}

/**
 * Typed reduction of one Run's unit results: every row's quotation located in the block it named — exactly once or not at all —
 * and the per-unit rows kept in unit order. A row whose quotation could not be located stays with its reason; it is never dropped,
 * because hiding it would hide what the model said. Nothing here reads across units.
 */
export function reduceCustomAnalysis(input: {
  readonly dimension: CustomAnalysisDimensionPin;
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<CustomAnalysisUnitOutcome>;
  readonly reusedUnitOrdinals: ReadonlySet<number>;
  readonly blocks: ReadonlyMap<string, ManifestBlockInput>;
}): {
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: AnalysisGapProjection[];
  rows: CustomAnalysisRowProjection[];
  rowCounts: CustomAnalysisRowCounts;
} {
  const { manifest, blocks, dimension } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<CustomAnalysisUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);
  const rows: CustomAnalysisRowProjection[] = [];
  for (const outcome of closed) {
    const unit = manifest.units[outcome.unitOrdinal - 1]!;
    const messageBlockIds = [...unit.overlapBlockIds, ...unit.blockIds];
    outcome.result.rows.forEach((row, index) => {
      const blockId = messageBlockIds[row.blockOrdinal - 1];
      const block = blockId === undefined ? undefined : blocks.get(blockId);
      const location = block === undefined ? { state: 'not-found' as const } : locateQuotation(block.text, row.quote);
      rows.push({
        rowId: rowId({ dimensionVersion: dimension.versionId, unitOrdinal: outcome.unitOrdinal, rowOrdinal: index + 1, quote: normalizedQuotation(row.quote), answer: row.answer }),
        unitOrdinal: outcome.unitOrdinal,
        answer: row.answer,
        confidenceNote: row.confidenceNote,
        blockOrdinal: row.blockOrdinal,
        quote: row.quote,
        sourceRange: location.state === 'verified' ? { blockId: blockId!, fromGrapheme: location.fromGrapheme, toGrapheme: location.toGrapheme } : null,
        anchorState: location.state === 'verified' ? 'located' : location.state === 'ambiguous' ? 'ambiguous' : 'not-found',
      });
    });
  }
  const located = rows.filter((row) => row.anchorState === 'located').length;
  const rowCounts: CustomAnalysisRowCounts = { units: closed.length, rows: rows.length, located, unlocated: rows.length - located };
  const stages = [stage('unit-validation', ordered.length, gaps.length), stage('reference-integrity', rows.length, rowCounts.unlocated)];
  const carriedGaps = stages.some((entry) => entry.state === 'closed-with-gaps');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: carriedGaps ? 'closed-with-gaps' : 'closed',
    label: !carriedGaps ? '归约/综合闭合：全部阶段已闭合'
      : gaps.length > 0 ? `归约/综合闭合：已闭合 · 保留 ${gaps.length} 处缺口`
        : `归约/综合闭合：已闭合 · ${rowCounts.unlocated} 条回答的引文未能唯一定位`,
    stages,
  };
  const assuranceState: AnalysisAssuranceAxis['state'] = rowCounts.unlocated > 0 ? 'limited' : 'qualified';
  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: assuranceState,
    label: assuranceState === 'qualified'
      ? `语义/证据保证：合格 · ${rows.length} 条回答均已定位引文`
      : `语义/证据保证：有限 · ${located} 条回答已定位引文 · ${rowCounts.unlocated} 条未能定位`,
    unresolvedConflictCount: 0,
    unresolvedItemCount: 0,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    sampledPrecision: null,
    statement: CUSTOM_ANALYSIS_ASSURANCE_STATEMENT,
  };
  const unitsReused = closed.filter((outcome) => input.reusedUnitOrdinals.has(outcome.unitOrdinal)).length;
  const coverage = coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  return { coverage, reducerClosure, assurance, gaps, rows, rowCounts };
}

/** What a caller gives the definition: one dimension version's identity and question, and the title that names its Tasks. */
export interface CustomAnalysisVersionInput extends CustomAnalysisContractInput {
  /** The editor's label: in the Task's goal and plan, which stay on this device, and never in the contract. */
  readonly title: string;
}

export function customAnalysisKindDefinition(version: CustomAnalysisVersionInput): AnalysisKindDefinition {
  const contractInput: CustomAnalysisContractInput = {
    dimensionId: version.dimensionId, versionId: version.versionId, version: version.version, documentDigest: version.documentDigest,
    questionTemplate: version.questionTemplate,
  };
  const contract = customAnalysisContract(contractInput);
  const promptContractDigest = customAnalysisContractDigest(contract);
  const dimension: CustomAnalysisDimensionPin = {
    dimensionId: version.dimensionId, versionId: version.versionId, version: version.version, documentDigest: version.documentDigest,
  };
  const modes: ReadonlyArray<AnalysisModeDefinition> = (['first-baseline', ...BASELINE_ANALYSIS_UPDATE_MODES] as const).map((mode: BaselineAnalysisTaskMode) => ({
    mode,
    goal: customAnalysisModeGoal(mode),
    label: BASELINE_ANALYSIS_MODE_LABELS[mode],
    meaning: BASELINE_ANALYSIS_MODE_MEANINGS[mode].replaceAll('基线稿件分析契约 v1', '自定义分析契约 v1'),
    initial: mode === 'first-baseline',
    rangeBound: mode === 'reanalyze-range',
    recompute: mode === 'sync-current' ? 'changed' : mode === 'reanalyze-range' ? 'selected-range' : 'everything',
  }));
  const asked = `逐单元回答自定义分析维度「${version.title}」第 ${version.version} 版的提问`;
  const executionSteps = ['派生覆盖清单', asked, '按内容块文本确定性定位每条回答的引文', '形成结果集修订版'];
  return {
    kind: customAnalysisKindId(version.dimensionId),
    contractVersion: CUSTOM_ANALYSIS_CONTRACT_VERSION,
    expectedOutcome: customAnalysisExpectedOutcome(version.title),
    taskGoal: customAnalysisModeGoal('first-baseline'),
    initialMode: 'first-baseline',
    modes,
    updateModes: BASELINE_ANALYSIS_UPDATE_MODES,
    // Every revision of a dimension covers the whole manuscript, as the baseline's does: a unit no predecessor result serves is read.
    outOfScope: 'recompute',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    // The policy's custom analysis rule admits a version live only for the contract its owner re-derives from the frozen version.
    livePromptContractDigest: () => customAnalysisContractDigest(customAnalysisContract(contractInput)),
    unitResultSchema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA,
    revisionSchema: CUSTOM_ANALYSIS_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: CUSTOM_ANALYSIS_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: customAnalysisSchemaDigest(promptContractDigest),
    reducerDigest: CUSTOM_ANALYSIS_REDUCER_DIGEST,
    reducerStages: REDUCER_STAGES,
    executionSteps,
    updateExecutionSteps: ['派生覆盖清单并计算复用计划', '按血缘复用内容一致的已回答单元', `仅对重算单元${asked}`, executionSteps[2]!, '追加后继结果集修订版'],
    crossUnit: null,
    crossUnitAbsentReason: CROSS_UNIT_ABSENT_REASON,
    assurance: null,
    assuranceAbsentReason: NO_SAMPLE,
    safeNextActions: SAFE_NEXT_ACTIONS,
    // The kind's classes: each row by whether its quotation was located. A count, never a quotation.
    findingCounts: (reduction) => countByClass(reduction.components.rows as ReadonlyArray<CustomAnalysisRowProjection>, 'row', (row) => row.anchorState),
    buildUnitMessage,
    parseUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => unitRequestDigest(promptContractDigest, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseCustomAnalysisUnitResult(text, { unitOrdinal: unit.ordinal, blockCount: unit.overlapBlockIds.length + unit.blockIds.length }),
    reduce: (reductionInput) => {
      const reduction = reduceCustomAnalysis({
        dimension,
        manifest: reductionInput.manifest,
        outcomes: reductionInput.outcomes as ReadonlyArray<CustomAnalysisUnitOutcome>,
        reusedUnitOrdinals: reductionInput.reusedUnitOrdinals,
        blocks: reductionInput.blocks,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: { dimension, rows: reduction.rows, rowCounts: reduction.rowCounts },
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ rows: (result as CustomAnalysisUnitResult).rows }),
    unitResultOfRecord: (record, unitOrdinal): CustomAnalysisUnitResult => ({
      schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      rows: record.rows as CustomAnalysisUnitResult['rows'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as CustomAnalysisUnitResult, predecessorUnit, newUnit),
    revisionComponents: (body) => ({
      dimension: body.dimension,
      rows: body.rows,
      rowCounts: body.rowCounts,
      assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE,
    }),
    conflictCountOf: () => 0,
    mode: modeIndex(modes),
  };
}

/**
 * A custom Task's plan in the Task Drawer (Issue #922): the plan the ②A ledger builds for every analysis Task, named as the
 * dimension's — its title and exact version as the procedure, its steps, its outcome — and with the version's question template
 * on the 会发送 line, which a live Run sends beside the units' text and the local deterministic route never sends. The title
 * stays on this device: it is the editor's label, shown in the plan and never on the 会发送 line.
 */
export function customAnalysisPlan(
  plan: TaskPlanProjection,
  version: { readonly title: string; readonly versionId: string; readonly version: number; readonly documentDigest: string; readonly questionTemplate: string },
  live: boolean,
): TaskPlanProjection {
  const named = `自定义分析「${version.title}」第 ${version.version} 版`;
  const template = `该维度第 ${version.version} 版的提问模板「${version.questionTemplate}」`;
  const [units] = plan.steps;
  return {
    ...plan,
    // These preparation controls encode the built-in goal in the shared drawer. A custom Task is prepared only by its tab.
    start: { ...plan.start, reconfirm: null },
    redo: null,
    reprepare: null,
    budgetStop: null,
    goal: { ...plan.goal, sentence: `逐单元回答${named}的提问，定位每条回答所依据的原文，形成结果集修订版。`,
      // The chip reads 工序「…」, so the procedure is named without brackets of its own.
      chips: { ...plan.goal.chips, procedure: `自定义分析 · ${version.title} · 第 ${version.version} 版` } },
    scope: { ...plan.scope, send: live ? `${plan.scope.send}，以及${template}` : `${plan.scope.send}；实时运行时会一并发送${template}` },
    steps: [
      { ...units!, label: units!.label.replace('逐章读取', '逐单元回答提问'), result: '每个单元的回答与所依据的引文' },
      { id: 'reduction', label: '定位引文', result: '每条回答的引文位置；不跨单元归纳，不打分', removable: false, removed: false },
    ],
    service: { ...plan.service, send: live ? `${plan.service.send}；${template}` : plan.service.send },
    outcomes: [`${named}的结果集修订版：每个单元的回答与引文，在「分析 › 自定义」中查看`],
    technical: [...plan.technical, { key: 'custom-analysis-dimension', label: '自定义分析维度版本', value: `${version.versionId} · ${version.documentDigest}` }],
  };
}
