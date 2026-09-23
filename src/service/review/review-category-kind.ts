import {
  EDITORIAL_REVIEW_CONTRACT_VERSION,
  REVIEW_CATEGORY_MODE_LABELS,
  REVIEW_CATEGORY_MODE_MEANINGS,
  REVIEW_CATEGORY_TASK_MODES,
  REVIEW_CATEGORY_UPDATE_MODES,
  reviewCategoryExpectedOutcome,
  reviewCategoryKindId,
  reviewCategoryModeGoal,
  type ReviewCategoryExcludedProjection,
  type ReviewCategoryFindingProjection,
  type ReviewCategoryIdentityProjection,
  type ReviewCategoryTaskMode,
} from '../../shared/protocol.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, ASSURANCE_SAMPLING_RESULT_SCHEMA } from '../analysis/assurance-sampling-contract.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { countByClass, modeIndex, type AnalysisKindDefinition, type AnalysisModeDefinition, type ModeRecomputeScope } from '../analysis/kind-definition.js';
import { PRE_ASSURANCE_SAMPLE } from '../analysis/reducers.js';
import { carryPositionalResult } from '../analysis/reused-result.js';
import {
  REVIEW_CATEGORY_RESULT_SET_REVISION_SCHEMA,
  REVIEW_CATEGORY_SUCCESSOR_REVISION_SCHEMA,
  REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
  buildReviewCategoryUnitMessage,
  parseReviewCategoryUnitMessageHeader,
  parseReviewCategoryUnitResult,
  reviewCategoryContract,
  reviewCategoryContractDigest,
  reviewCategoryMessageBlockIds,
  reviewCategoryRequestDigest,
  type ReviewCategoryContractInput,
  type ReviewCategoryUnitResult,
} from './review-category-contract.js';
import { reduceReviewCategory, type ReviewUnitOutcome } from './review-category-reducers.js';

/**
 * One Review Category as an analysis kind (Issue #417, plan slice S69): `editorial-review/<categoryId>`,
 * read under `ai7.editorial-review/1`, on the same real path as the baseline and the factual kind —
 * Task Intent, input checkpoint, Coverage Manifest, Plan Envelope, standard Run Authorization, Run,
 * Result Set Revision — through the same ledger, execution owner, Egress Gate and adapter.
 *
 * There is one contract, one reducer and this one function for every category, because a category is
 * configuration and not code. What differs between two categories is exactly what the function is
 * given, and all of it lands in the frozen prompt contract, so the contract digest — and through it
 * the schema digest every revision pins — is the category's own.
 *
 * The reducer descriptor is shared by the whole family: how findings are located, merged and excluded
 * does not depend on the category.
 */
export const REVIEW_CATEGORY_REDUCER_DESCRIPTOR = {
  schema: 'ai7.editorial-review.reducers/1',
  stages: ['unit-validation', 'reference-integrity', 'finding-reduction', 'assurance-sampling'],
  referenceIntegrity: 'deterministic-normalized-exact-match-in-committed-block',
  normalization: ['whitespace-collapse', 'fullwidth-halfwidth-ascii'],
  mergeRule: 'same-block-same-normalized-quotation-same-replacement',
  exclusionReasons: ['quote-not-found', 'quote-ambiguous', 'replacement-identical'],
  certaintyPolicy: 'list-and-locate-never-decide',
} as const;

export const REVIEW_CATEGORY_REDUCER_DIGEST = sha256Hex(canonicalJson(REVIEW_CATEGORY_REDUCER_DESCRIPTOR));

const REVIEW_CATEGORY_REDUCER_STAGES = ['unit-validation', 'reference-integrity', 'finding-reduction'] as const;
const REVIEW_CATEGORY_CROSS_UNIT_ABSENT_REASON = '审阅类别没有跨单元归纳阶段。' as const;

const MODE_FACTS: Readonly<Record<ReviewCategoryTaskMode, { initial: boolean; recompute: ModeRecomputeScope }>> = {
  'review-first': { initial: true, recompute: 'everything' },
  'review-first-range': { initial: true, recompute: 'selected-range' },
  'review-again': { initial: false, recompute: 'everything' },
  'review-sync': { initial: false, recompute: 'changed' },
  'review-range': { initial: false, recompute: 'selected-range' },
};

/**
 * What a settled review Task tells its editor to do next. The execution owner's long-standing wording
 * names the baseline's three update actions, which a review category does not have.
 */
const REVIEW_SAFE_NEXT_ACTIONS = {
  completed: '在「审阅」中逐条处置发现；稿件变化后可只审改动过的章，或重新审阅所选范围或全书，每次都追加后继修订版。',
  'completed-with-gaps': '逐项查看缺口单元；缺口单元在下一次覆盖它的审阅中会重审，结果集修订版本身不会改写。已定位的发现仍可逐条处置。',
  failed: '核对运行失败原因；修复后可在「审阅」中重新准备并授权新的运行。',
  interrupted: '运行已在派发后中断；已完成单元的发现与缺口均已保留，续行需要在「审阅」中发起新的授权运行。',
  cancelled: '运行已按你的要求取消；已完成单元的发现与缺口均已保留，没有读到的单元记为未尝试。需要时可在「审阅」中发起新的授权运行。',
} as const;

/** The schema digest of one category: the contract version, the unit result schema, and the category's own frozen contract. */
export function reviewCategorySchemaDigest(promptContractDigest: string): string {
  return sha256Hex(canonicalJson({
    contractVersion: EDITORIAL_REVIEW_CONTRACT_VERSION,
    unitResultSchema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
    promptContractDigest,
  }));
}

export function reviewCategoryKindDefinition(input: ReviewCategoryContractInput): AnalysisKindDefinition {
  const contract = reviewCategoryContract(input);
  const category = contract.category;
  const promptContractDigest = reviewCategoryContractDigest(contract);
  const clauseIds = category.clauses.map((clause) => clause.clauseId);
  const identity: ReviewCategoryIdentityProjection = {
    categoryId: category.categoryId,
    label: category.label,
    output: category.output,
    riskPointsOnly: category.riskPointsOnly,
  };
  const modes: ReadonlyArray<AnalysisModeDefinition> = REVIEW_CATEGORY_TASK_MODES.map((mode) => ({
    mode,
    goal: reviewCategoryModeGoal(category.label, mode),
    label: REVIEW_CATEGORY_MODE_LABELS[mode],
    meaning: REVIEW_CATEGORY_MODE_MEANINGS[mode],
    initial: MODE_FACTS[mode].initial,
    rangeBound: MODE_FACTS[mode].recompute === 'selected-range',
    recompute: MODE_FACTS[mode].recompute,
  }));
  const executionSteps = ['派生覆盖清单', `逐单元执行编辑审阅契约 v1 ·「${category.label}」`, '按内容块文本确定性定位每条引文', '归约为审阅发现', '形成结果集修订版'];
  return {
    kind: reviewCategoryKindId(category.categoryId),
    contractVersion: EDITORIAL_REVIEW_CONTRACT_VERSION,
    expectedOutcome: reviewCategoryExpectedOutcome(category.label),
    taskGoal: reviewCategoryModeGoal(category.label, 'review-first'),
    initialMode: 'review-first',
    modes,
    updateModes: REVIEW_CATEGORY_UPDATE_MODES,
    // A review reads what it was asked to read. A unit outside the scope with no reusable result stays
    // unreviewed and says so, rather than being sent because the ledger wanted a whole manuscript.
    outOfScope: 'leave-unreviewed',
    systemPrompt: contract.systemPrompt,
    promptContractDigest,
    unitResultSchema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
    revisionSchema: REVIEW_CATEGORY_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: REVIEW_CATEGORY_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: reviewCategorySchemaDigest(promptContractDigest),
    reducerDigest: REVIEW_CATEGORY_REDUCER_DIGEST,
    reducerStages: REVIEW_CATEGORY_REDUCER_STAGES,
    executionSteps,
    updateExecutionSteps: ['派生覆盖清单并计算审阅范围计划', '按血缘复用内容一致的已审单元', ...executionSteps.slice(1, 4), '追加结果集修订版'],
    crossUnit: null,
    crossUnitAbsentReason: REVIEW_CATEGORY_CROSS_UNIT_ABSENT_REASON,
    assurance: {
      promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
      resultSchema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
      // A category's sampleable findings are the ones Reference Integrity located: an excluded finding
      // has no source range to re-read it against, and its exclusion is already its reading. The
      // candidate states what the finding says — and, for a 修改建议, what it proposes — because that is
      // the claim a re-read of the unit's blocks can uphold or not.
      candidates: (reduction) =>
        (reduction.components.findings as ReadonlyArray<ReviewCategoryFindingProjection>).map((finding) => ({
          ref: finding.findingId,
          unitOrdinal: finding.unitOrdinal,
          tier: finding.severity,
          text: finding.replacement === null
            ? `「${finding.quote}」${finding.note}`
            : `「${finding.quote}」→「${finding.replacement}」${finding.note}`,
        })),
    },
    assuranceAbsentReason: '',
    safeNextActions: REVIEW_SAFE_NEXT_ACTIONS,
    // A category's finding classes: the severity of every located finding, and the exclusion reason of
    // every finding that could not be anchored. Both are closed sets and neither carries a quotation.
    findingCounts: (reduction) => [
      ...countByClass(
        reduction.components.findings as ReadonlyArray<ReviewCategoryFindingProjection>,
        'finding',
        (finding) => finding.severity,
      ),
      ...countByClass(
        reduction.components.excluded as ReadonlyArray<ReviewCategoryExcludedProjection>,
        'excluded',
        (excluded) => excluded.reason,
      ),
    ],
    buildUnitMessage: (unit, totalUnits, blocksById) => buildReviewCategoryUnitMessage(contract, unit, totalUnits, blocksById),
    // A message of another category is not this kind's: the header names the category it belongs to.
    parseUnitMessageHeader: (text) => {
      const header = parseReviewCategoryUnitMessageHeader(text);
      return header === null || header.categoryId !== category.categoryId
        ? null
        : { ordinal: header.ordinal, total: header.total, unitDigest: header.unitDigest };
    },
    requestDigest: (unitOrdinal, unitDigest) => reviewCategoryRequestDigest(promptContractDigest, category.categoryId, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseReviewCategoryUnitResult(text, {
      unitOrdinal: unit.ordinal,
      blockCount: reviewCategoryMessageBlockIds(unit).length,
      output: category.output,
      clauseIds,
    }),
    reduce: (reductionInput) => {
      const reduction = reduceReviewCategory({
        categoryId: category.categoryId,
        manifest: reductionInput.manifest,
        outcomes: reductionInput.outcomes as ReadonlyArray<ReviewUnitOutcome>,
        reusedUnitOrdinals: reductionInput.reusedUnitOrdinals,
        blocks: reductionInput.blocks,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: {
          category: identity,
          findings: reduction.findings,
          excluded: reduction.excluded,
          findingCounts: reduction.findingCounts,
        },
        // A review category runs no conflict pass; what it leaves unresolved are its findings.
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ findings: (result as ReviewCategoryUnitResult).findings }),
    unitResultOfRecord: (record, unitOrdinal): ReviewCategoryUnitResult => ({
      schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
      unitOrdinal,
      findings: record.findings as ReviewCategoryUnitResult['findings'],
    }),
    // The contract names a block by its position in the unit message, which a reused unit keeps.
    remapReusedResult: (result, predecessorUnit, newUnit) => carryPositionalResult(result as ReviewCategoryUnitResult, predecessorUnit, newUnit),
    revisionComponents: (body) => ({
      category: body.category,
      findings: body.findings,
      excluded: body.excluded,
      findingCounts: body.findingCounts,
      assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE,
    }),
    conflictCountOf: () => 0,
    mode: modeIndex(modes),
  };
}
