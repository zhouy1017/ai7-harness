import { BASELINE_ANALYSIS_MODE_GOALS, type StartQuickTasksInput, type StartQuickTasksResult, type LaunchPolicyProjection, type TaskPlanKind, type ServiceJobProjection } from '../shared/protocol.js';
import type { EditorialStore } from './store.js';
import { StoreError } from './store.js';
import type { CooperativeJobOwner } from './cooperative-jobs.js';
import type { BaselineAnalysisExecutionOwner } from './analysis/execution.js';
import type { TaskPlanConnectivity } from './connectivity.js';

type Dependencies = { store: EditorialStore; jobs: CooperativeJobOwner; policy: LaunchPolicyProjection; execution: BaselineAnalysisExecutionOwner;
  connectivity: TaskPlanConnectivity; credentialReadiness: Parameters<EditorialStore['quickStartBaselineAnalysis']>[4]['credentialReadiness']; driveReview(id: string): void };

/** Continuous enqueue uses the same preparation, defaults and exact authorization as each one-action initiator. */
export async function startQuickTasks(input: StartQuickTasksInput, deps: Dependencies): Promise<StartQuickTasksResult> {
  const { store, jobs, policy, execution } = deps;
  const results: Array<StartQuickTasksResult['results'][number]> = [];
  for (const task of input.tasks) {
    let kind: TaskPlanKind;
    let initial: ServiceJobProjection;
    if (task.procedureId === 'ai7-procedure/baseline-analysis') {
      kind = 'baseline-analysis';
      const prior = store.inspectBaselineAnalysis(task.bookId);
      const mode = prior.resultSetRevision === null ? 'first-baseline' : 'reanalyze-book';
      initial = jobs.startBaselineAnalysisPreparation(task.bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], mode === 'first-baseline' ? null : { mode, selectedRange: null }, policy, false);
    } else if (task.procedureId === 'ai7-procedure/review-common') {
      kind = 'review-run';
      initial = jobs.startReviewRunPreparation(task.bookId, ['typos-and-usage', 'style-and-format'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    } else if (task.procedureId === 'ai7-procedure/initial-evaluation') {
      kind = 'initial-evaluation';
      initial = jobs.startInitialEvaluationPreparation(task.bookId, policy);
    } else if (task.procedureId.startsWith('ai7-procedure/writing/')) {
      kind = 'writing';
      initial = jobs.startWritingPreparation(task.bookId, { typeId: task.procedureId.slice('ai7-procedure/writing/'.length), audience: '本书读者', channel: '图书宣传', requirements: null }, policy);
    } else throw new StoreError('QUICK_TASK_PROCEDURE_INVALID', '请选择快速开始中的工序。');
    let job = initial;
    while (job.state === 'queued' || job.state === 'running') {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      job = jobs.poll(job.jobId);
    }
    if (job.state !== 'completed') throw new StoreError(job.failure?.code ?? 'QUICK_TASK_PREPARATION_FAILED', job.failure?.message ?? '任务未能准备完成。');
    const plan = await store.inspectTaskPlanWithConnection({ bookId: task.bookId, kind, ref: null }, deps.credentialReadiness, deps.connectivity);
    if (!['ready', 'no-route', 'record-only'].includes(plan.start.readiness)) throw new StoreError('QUICK_TASK_NOT_READY', plan.start.unavailableReason ?? '请先连接模型服务再开始。');
    let runRecordId: string | null = null;
    if (kind === 'review-run') {
      store.authorizeReviewRun(task.bookId, plan.ref, plan.start.categoryDigests);
      deps.driveReview(plan.ref);
      results.push({ ...task, state: execution.busy || execution.queueFrozen ? 'queued' : 'started' });
      continue;
    }
    const digest = plan.start.planEnvelopeDigest;
    if (digest === null) throw new StoreError('QUICK_TASK_PLAN_UNAVAILABLE', '任务计划尚未准备完成。');
    const authorize = kind === 'baseline-analysis' ? store.authorizeBaselineAnalysis.bind(store) : kind === 'initial-evaluation' ? store.authorizeInitialEvaluation.bind(store) : store.authorizeWriting.bind(store);
    const authorized = authorize(task.bookId, plan.ref, digest);
    runRecordId = authorized.dispatchRunRecordId;
    const state = runRecordId === null ? 'prepared' : execution.admitOrQueue(runRecordId, authorized.ledger) === 'queued' ? 'queued' : 'started';
    results.push({ ...task, state });
  }
  return { started: results.filter((row) => row.state === 'started').length, queued: results.filter((row) => row.state === 'queued').length, results };
}
