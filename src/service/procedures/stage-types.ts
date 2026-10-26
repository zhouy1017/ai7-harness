import type { ProcedureStageType } from '../../shared/protocol/procedures.js';
import type { AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { buildReviewReport } from '../review/review-report.js';
import { checkLocalPlan } from '../review/deterministic/checker.js';
import { reduceReviewCategory } from '../review/review-category-reducers.js';

/** The registry describes existing owners; it neither schedules work nor constructs model messages. */
export const PROCEDURE_STAGE_LABELS: Readonly<Record<ProcedureStageType, string>> = {
  'read-through-ledger': '通读记账',
  'chunked-review': '分块审读',
  'deterministic-check': '确定性检查',
  'claim-extraction': '断言抽取',
  'web-verification': '联网取证',
  'cross-unit-reduction': '跨单元归并与跨章一致性',
  'cross-chapter-consistency': '跨章一致性',
  synthesis: '综合',
  drafting: '起草',
  'derived-report': '派生报告',
};

export type ProcedureStageExecutor =
  | { readonly state: 'available'; readonly executor: 'local-text-check'; readonly check: typeof checkLocalPlan }
  | { readonly state: 'unavailable'; readonly reason: string }
  | { readonly state: 'available'; readonly executor: 'unit-contract'; readonly definition: AnalysisKindDefinition }
  | { readonly state: 'available'; readonly executor: 'cross-unit'; readonly binding: NonNullable<AnalysisKindDefinition['crossUnit']> }
  | { readonly state: 'available'; readonly executor: 'reducer'; readonly reduce: AnalysisKindDefinition['reduce'] }
  | { readonly state: 'available'; readonly executor: 'review-grouping'; readonly reduce: typeof reduceReviewCategory }
  | { readonly state: 'available'; readonly executor: 'review-report'; readonly buildReport: typeof buildReviewReport };

/** A caller must supply its already admitted kind; no registry entry can introduce another executor. */
export function resolveProcedureStage(stageType: ProcedureStageType, definition?: AnalysisKindDefinition): ProcedureStageExecutor {
  switch (stageType) {
    case 'deterministic-check':
      return { state: 'available', executor: 'local-text-check', check: checkLocalPlan };
    case 'chunked-review':
      return definition === undefined ? unavailable('尚未绑定现有单元契约。')
        : { state: 'available', executor: 'unit-contract', definition };
    case 'cross-unit-reduction':
      if (definition?.reviewCrossChapter !== undefined) return { state: 'available', executor: 'review-grouping', reduce: reduceReviewCategory };
      return definition?.crossUnit == null ? unavailable('这一契约没有跨单元阶段。')
        : { state: 'available', executor: 'cross-unit', binding: definition.crossUnit };
    case 'cross-chapter-consistency':
      return definition?.reviewCrossChapter === undefined || definition.crossUnit === null ? unavailable('这一契约没有跨章一致性阶段。')
        : { state: 'available', executor: 'cross-unit', binding: definition.crossUnit };
    case 'synthesis':
      return definition === undefined ? unavailable('尚未绑定现有归并器。')
        : { state: 'available', executor: 'reducer', reduce: definition.reduce };
    case 'derived-report':
      return { state: 'available', executor: 'review-report', buildReport: buildReviewReport };
    default:
      return unavailable('这一阶段类型尚未接通。');
  }
}

function unavailable(reason: string): ProcedureStageExecutor {
  return { state: 'unavailable', reason };
}
