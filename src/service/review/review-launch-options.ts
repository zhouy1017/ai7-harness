import type { PlanEditsProjection } from '../../shared/protocol/analysis-plan.js';
import type { ReviewExecutionLaunchInput } from '../../shared/runtime-execution-config.js';
import type { EditTaskPlanInput } from '../../shared/protocol.js';
import { requireStore } from '../store-records.js';

export type ReviewLaunchOptions = Pick<ReviewExecutionLaunchInput, 'planEdits' | 'evidenceAssuranceLevel' | 'startWhen'>;

export function requireReviewRetryChoice(edits: { askFirstAdaptations?: ReadonlyArray<string> } | undefined): void {
  requireStore((edits?.askFirstAdaptations?.length ?? 0) === 0, 'REVIEW_RETRY_CHOICE_UNAVAILABLE',
    '审阅暂不支持“失败时先问你”；可以选自动重试或不重试。');
}

/** The same shared edit applies to each model category; a summary uses the members' allowance. */
export function reviewCategoryEdits(shared: PlanEditsProjection, categoryId: string, budgetMembers: number, hasAssurance?: boolean): PlanEditsProjection;
export function reviewCategoryEdits(shared: EditTaskPlanInput, categoryId: string, budgetMembers: number, hasAssurance?: boolean): EditTaskPlanInput;
export function reviewCategoryEdits(shared: PlanEditsProjection | EditTaskPlanInput, categoryId: string, budgetMembers: number, hasAssurance = true) {
  const { evidenceAssuranceLevel, ...edits } = shared;
  return { ...edits,
    ...(!hasAssurance ? { removedSteps: [] } : {}),
    ...(categoryId === 'run-synthesis' && shared.runBudgetCeiling != null
      ? { runBudgetCeiling: { ...shared.runBudgetCeiling, maxTotalTokens: shared.runBudgetCeiling.maxTotalTokens * budgetMembers } } : {}),
    ...(categoryId === 'factual-review' && evidenceAssuranceLevel !== undefined ? { evidenceAssuranceLevel } : {}) };
}

/** Omitting options keeps the historical envelope construction, including absence of default keys. */
export function reviewLaunchEdits(options: ReviewLaunchOptions, categoryId: string, budgetMembers: number,
  summaryCeiling: PlanEditsProjection['runBudgetCeiling'] | 'unset', hasAssurance: boolean): PlanEditsProjection | undefined {
  const level = categoryId === 'factual-review' ? options.evidenceAssuranceLevel : undefined;
  const old = (level !== undefined && level !== 'standard') || (summaryCeiling !== undefined && summaryCeiling !== 'unset')
    ? { removedSteps: [], disallowedAdaptations: [], ...(level === undefined || level === 'standard' ? {} : { evidenceAssuranceLevel: level }),
      ...(summaryCeiling === undefined || summaryCeiling === 'unset' ? {} : { runBudgetCeiling: summaryCeiling }) } : undefined;
  if (options.planEdits === undefined) return old;
  return { ...old, ...reviewCategoryEdits(options.planEdits, categoryId, budgetMembers, hasAssurance),
    ...(level === undefined || level === 'standard' ? {} : { evidenceAssuranceLevel: level }) };
}
