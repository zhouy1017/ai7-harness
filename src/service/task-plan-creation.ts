import type { AnalysisProjection, TaskPlanProjection } from '../shared/protocol.js';
import type { ManifestBlockInput } from './analysis/coverage-manifest.js';
import type { BaselineAnalysisStore, BaselineAnalysisPrepareInput, BaselineAnalysisPreparationResult, LaunchBinding } from './analysis/baseline-analysis-store.js';
import type { PlanEditsProjection } from '../shared/protocol/analysis-plan.js';
import type { TaskLaunchPreviewProjection } from '../shared/runtime-execution-config.js';

/** Stops the shared contract builder before its persistence callback, carrying only the read-only projection. */
export class TaskLaunchPreview {
  constructor(readonly projection: TaskLaunchPreviewProjection) {}
}

export type TaskPlanDescription = (projection: AnalysisProjection, blocks: ReadonlyArray<ManifestBlockInput>, bookTitle: string) => TaskPlanProjection;

/** Shared validation/contract builders choose their writer; a launch never enters preparation. */
export type TaskPlanCreator = (ledger: BaselineAnalysisStore, input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>, describe?: TaskPlanDescription) => BaselineAnalysisPreparationResult;

export interface TaskLaunchContext {
  readonly snapshotId: string;
  readonly execution: LaunchBinding;
  readonly planEdits?: PlanEditsProjection;
  readonly startWhen?: 'now' | 'idle' | 'when-online';
  readonly preview?: (ledger: BaselineAnalysisStore, input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>, describe?: TaskPlanDescription) => never;
}

export function launchedTaskPlan(context: TaskLaunchContext): TaskPlanCreator {
  if (context.preview !== undefined) return context.preview;
  return (ledger, input) => ({ done: true, workId: null, completed: 1, total: 1,
    projection: ledger.launchTask({ ...input, launchStartWhen: context.startWhen ?? 'now' }, context.snapshotId, context.execution, false, context.planEdits) });
}
