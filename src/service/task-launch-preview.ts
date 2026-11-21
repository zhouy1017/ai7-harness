import type { EditorialStore } from './store.js';
import { StoreError } from './store-records.js';
import { TaskLaunchPreview, type TaskLaunchContext } from './task-plan-creation.js';
import { baselineAnalysisPlan, withLedgerRunControls } from './task-plan.js';
import type { BaselineAnalysisProjection, LaunchPolicyProjection } from '../shared/protocol.js';
import type { TaskLaunchPreviewInput, TaskLaunchPreviewProjection, ReviewExecutionLaunchInput } from '../shared/runtime-execution-config.js';

export function previewTaskLaunch(store: EditorialStore, input: TaskLaunchPreviewInput, policy: LaunchPolicyProjection,
  title: (bookId: string) => string, review: (input: ReviewExecutionLaunchInput) => TaskLaunchPreviewProjection): TaskLaunchPreviewProjection {
  const preview: NonNullable<TaskLaunchContext['preview']> = (ledger, task, describe) => ledger.previewLaunch(task,
    'planEdits' in input.launch.input ? input.launch.input.planEdits : undefined, (projection, blocks) => {
      const plan = describe === undefined ? baselineAnalysisPlan({ projection: projection as BaselineAnalysisProjection, bookTitle: title(input.bookId), blocks })
        : describe(projection, blocks, title(input.bookId));
      throw new TaskLaunchPreview(launchPreviewProjection(withLedgerRunControls(plan, projection as BaselineAnalysisProjection, blocks), projection.coverageManifest!.units.length));
    }, 'relaunchOf' in input.launch.input && input.launch.input.relaunchOf?.cancelsFirst === true);
  const launch = input.launch;
  try {
    switch (launch.operation) {
      case 'launchReviewRun': return review({ ...launch.input, bookId: input.bookId });
      case 'startScopedAiEdit': throw new StoreError('TASK_PREVIEW_FAILED', '这次计划暂时无法读取。');
      case 'launchBaselineAnalysis': store.launchBaselineAnalysis({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      case 'launchCustomAnalysis': store.launchCustomAnalysis({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      case 'launchWritingTask': store.launchWritingTask({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      case 'launchInitialEvaluation': store.launchInitialEvaluation({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      case 'launchReadersReport': store.launchReadersReport({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      case 'launchEvaluationRewrite': store.launchEvaluationRewrite({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
    }
  } catch (result) { if (result instanceof TaskLaunchPreview) return result.projection; throw result; }
  throw new StoreError('TASK_PREVIEW_FAILED', '这次计划暂时无法读取。');
}

export function launchPreviewProjection(plan: import('../shared/protocol.js').TaskPlanProjection, units: number): TaskLaunchPreviewProjection {
  return { steps: plan.steps.map(step => `${step.label}${step.removed ? '（本次不做）' : ''}`),
    scope: plan.scope.process, units, reference: plan.scope.reference, send: `${plan.scope.send}；${plan.service.send}`, usage: plan.service.usage,
    adaptations: plan.boundary.adaptable.map(entry => `${entry.label}：${entry.removed ? '不允许' : entry.askFirst ? '先问我' : '允许'}`) };
}
