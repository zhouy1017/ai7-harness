import { type StartQuickTasksInput, type StartQuickTasksResult, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import type { EditorialStore } from '../../src/service/store.js';
import { StoreError } from '../../src/service/store.js';
import type { CooperativeJobOwner } from '../../src/service/cooperative-jobs.js';
import type { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { TaskPlanConnectivity } from '../../src/service/connectivity.js';

type Dependencies = { store: EditorialStore; jobs: CooperativeJobOwner; policy: LaunchPolicyProjection; execution: BaselineAnalysisExecutionOwner;
  connectivity: TaskPlanConnectivity; credentialReadiness: Parameters<EditorialStore['quickStartBaselineAnalysis']>[4]['credentialReadiness']; driveReview(id: string): void };

import { prepareQuickTask } from '../../src/service/quick-tasks.js';

/** Continuous enqueue uses the same preparation, defaults and exact authorization as each one-action initiator. */
export async function startQuickTasks(input: StartQuickTasksInput, deps: Dependencies): Promise<StartQuickTasksResult> {
  const { store, jobs, execution } = deps;
  const results: Array<StartQuickTasksResult['results'][number]> = [];
  for (const task of input.tasks) {
    const { kind, job: initial, ruleVersionId } = prepareQuickTask(task, deps);
    let job = initial;
    while (job.state === 'queued' || job.state === 'running') {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      job = jobs.poll(job.jobId);
    }
    if (job.state !== 'completed') throw new StoreError(job.failure?.code ?? 'QUICK_TASK_PREPARATION_FAILED', job.failure?.message ?? '任务未能准备完成。');
    const ref = kind === 'review-run' && job.result && 'run' in job.result && job.result.run && 'reviewRunId' in job.result.run ? job.result.run.reviewRunId
      : job.result && 'taskIntent' in job.result ? job.result.taskIntent?.taskIntentId ?? null : null;
    const plan = await store.inspectTaskPlanWithConnection({ bookId: task.bookId, kind, ref }, deps.credentialReadiness, deps.connectivity);
    if (!['ready', 'no-route', 'record-only'].includes(plan.start.readiness)) throw new StoreError('QUICK_TASK_NOT_READY', plan.start.unavailableReason ?? '请先连接模型服务再开始。');
    if (ruleVersionId !== null) {
      const runtime = { credentialReadiness: deps.credentialReadiness, connectivity: deps.connectivity };
      if (kind === 'review-run') {
        const started = await store.quickStartReviewRun({ bookId: task.bookId, reviewRunId: plan.ref, planEnvelopeDigest: plan.defaultRule!.planEnvelopeDigest!, ruleVersionId }, runtime);
        if (started.outcome !== 'started') throw new StoreError('QUICK_TASK_NOT_READY', started.reasons.join('；'));
        if (started.dispatch) deps.driveReview(plan.ref);
      } else {
        const started = kind === 'writing' ? await store.quickStartWritingTask(task.bookId, plan.ref, plan.start.planEnvelopeDigest!, ruleVersionId, runtime)
          : await store.quickStartBaselineAnalysis(task.bookId, plan.ref, plan.start.planEnvelopeDigest!, ruleVersionId, runtime);
        if (started.outcome !== 'started') throw new StoreError('QUICK_TASK_NOT_READY', started.reasons.join('；'));
        if (started.dispatchRunRecordId) execution.admitOrQueue(started.dispatchRunRecordId, kind === 'writing' ? store.taskRunLedger({ bookId: task.bookId, kind: 'writing', ref: plan.ref }) : store.baselineAnalysisLedger);
      }
      results.push({ ...task, state: execution.busy ? 'queued' : 'started' }); continue;
    }
    let runRecordId: string | null = null;
    if (kind === 'review-run') {
      store.authorizeReviewRun(task.bookId, plan.ref, plan.start.categoryDigests);
      deps.driveReview(plan.ref);
      results.push({ ...task, state: execution.busy || execution.queueFrozen ? 'queued' : 'started' });
      continue;
    }
    const digest = plan.start.planEnvelopeDigest;
    if (digest === null) throw new StoreError('QUICK_TASK_PLAN_UNAVAILABLE', '任务计划尚未准备完成。');
    const authorize = kind === 'baseline-analysis' ? store.authorizeBaselineAnalysis.bind(store) : kind === 'initial-evaluation' ? store.authorizeInitialEvaluation.bind(store)
      : kind === 'readers-report' ? store.authorizeReadersReport.bind(store) : kind === 'evaluation-rewrite' ? store.authorizeEvaluationRewrite.bind(store) : store.authorizeWriting.bind(store);
    const authorized = authorize(task.bookId, plan.ref, digest);
    runRecordId = authorized.dispatchRunRecordId;
    const state = runRecordId === null ? 'prepared' : execution.admitOrQueue(runRecordId, authorized.ledger) === 'queued' ? 'queued' : 'started';
    results.push({ ...task, state });
  }
  return { started: results.filter((row) => row.state === 'started').length, queued: results.filter((row) => row.state === 'queued').length, results };
}
