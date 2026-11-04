import type { ServiceClient } from './service-client.js';
import type { StartQuickTasksInput, StartQuickTasksResult, ServiceJobProjection, ServiceWireJobProjection } from '../shared/protocol.js';
import { ServiceCallError } from './service-client.js';

/** Poll cooperative jobs from the desktop, leaving the service's ordinary request lane available. */
export async function enqueueQuickTasks(service: Pick<ServiceClient, 'call'>, input: StartQuickTasksInput,
  effect: <T>(operation: () => Promise<T>) => Promise<T>): Promise<StartQuickTasksResult> {
  const results: Array<StartQuickTasksResult['results'][number]> = [];
  for (const task of input.tasks) {
    const prepared = await effect(() => service.call('startQuickTasks', { tasks: [task] }));
    let job: ServiceJobProjection | ServiceWireJobProjection = prepared.job;
    while (job.state === 'queued' || job.state === 'running') {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      job = await service.call('pollServiceJob', { jobId: job.jobId });
    }
    if (job.state !== 'completed') throw new ServiceCallError(job.failure?.code ?? 'QUICK_TASK_PREPARATION_FAILED', job.failure?.message ?? '任务未能准备完成。');
    const ref = prepared.kind === 'review-run' && job.result && 'run' in job.result && job.result.run && 'reviewRunId' in job.result.run ? job.result.run.reviewRunId
      : job.result && 'taskIntent' in job.result ? job.result.taskIntent?.taskIntentId ?? null : null;
    const plan = await service.call('inspectTaskPlan', { bookId: task.bookId, kind: prepared.kind, ref });
    if (!['ready', 'no-route', 'record-only'].includes(plan.start.readiness)) throw new ServiceCallError('QUICK_TASK_NOT_READY', plan.start.unavailableReason ?? '请先连接模型服务再开始。');
    const common = { bookId: task.bookId, taskIntentId: plan.ref, planEnvelopeDigest: plan.start.planEnvelopeDigest! };
    await effect(async () => {
      if (prepared.ruleVersionId) {
        const ruled = { ...common, ruleVersionId: prepared.ruleVersionId };
        const result = prepared.kind === 'review-run'
          ? await service.call('quickStartReviewRun', { bookId: task.bookId, reviewRunId: plan.ref, planEnvelopeDigest: plan.defaultRule!.planEnvelopeDigest!, ruleVersionId: prepared.ruleVersionId })
          : prepared.kind === 'writing' ? await service.call('quickStartWritingTask', ruled) : await service.call('quickStartBaselineAnalysis', ruled);
        if (result.outcome !== 'started') throw new ServiceCallError('QUICK_TASK_NOT_READY', result.reasons.join('；'));
      } else {
        switch (prepared.kind) {
          case 'review-run': await service.call('authorizeReviewRun', { bookId: task.bookId, reviewRunId: plan.ref, planDigests: plan.start.categoryDigests }); break;
          case 'baseline-analysis': await service.call('authorizeBaselineAnalysis', common); break;
          case 'initial-evaluation': await service.call('authorizeInitialEvaluation', common); break;
          case 'readers-report': await service.call('authorizeReadersReport', common); break;
          case 'evaluation-rewrite': await service.call('authorizeEvaluationRewrite', common); break;
          case 'writing': await service.call('authorizeWritingTask', common); break;
          default: throw new ServiceCallError('QUICK_TASK_INVALID', '这类任务请从图书内开始。');
        }
      }
    });
    const overview = await service.call('inspectTaskOverview', {});
    const item = overview.groups.flatMap((group) => group.items).find((item) => item.bookId === task.bookId && item.plan?.kind === prepared.kind && item.plan.ref === plan.ref);
    results.push({ ...task, state: item?.state === 'queued' ? 'queued' : item?.state === 'running' || item?.state === 'completed' ? 'started' : 'prepared' });
  }
  return { results, started: results.filter((result) => result.state === 'started').length, queued: results.filter((result) => result.state === 'queued').length };
}
