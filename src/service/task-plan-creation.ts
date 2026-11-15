import type { BaselineAnalysisStore, BaselineAnalysisPrepareInput, BaselineAnalysisPreparationResult, LaunchBinding } from './analysis/baseline-analysis-store.js';
import type { PlanEditsProjection } from '../shared/protocol/analysis-plan.js';

/** Shared validation/contract builders choose their writer; a launch never enters preparation. */
export type TaskPlanCreator = (ledger: BaselineAnalysisStore, input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>) => BaselineAnalysisPreparationResult;

export interface TaskLaunchContext {
  readonly snapshotId: string;
  readonly execution: LaunchBinding;
  readonly planEdits?: PlanEditsProjection;
  readonly startWhen?: 'now' | 'idle';
}

export function launchedTaskPlan(context: TaskLaunchContext): TaskPlanCreator {
  return (ledger, input) => ({ done: true, workId: null, completed: 1, total: 1,
    projection: ledger.launchTask({ ...input, launchStartWhen: context.startWhen ?? 'now' }, context.snapshotId, context.execution, false, context.planEdits) });
}
