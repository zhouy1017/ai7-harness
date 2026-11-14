import type { BaselineAnalysisStore, BaselineAnalysisPrepareInput, BaselineAnalysisPreparationResult, LaunchBinding } from './analysis/baseline-analysis-store.js';

/** Shared validation/contract builders choose their writer; a launch never enters preparation. */
export type TaskPlanCreator = (ledger: BaselineAnalysisStore, input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>) => BaselineAnalysisPreparationResult;

export interface TaskLaunchContext {
  readonly snapshotId: string;
  readonly execution: LaunchBinding;
}

export function launchedTaskPlan(context: TaskLaunchContext): TaskPlanCreator {
  return (ledger, input) => ({ done: true, workId: null, completed: 1, total: 1,
    projection: ledger.launchTask(input, context.snapshotId, context.execution) });
}
