import { randomUUID } from 'node:crypto';
import { BASELINE_ANALYSIS_MODE_GOALS, type StartQuickTasksInput, type LaunchPolicyProjection, type TaskPlanKind, type ServiceJobProjection } from '../shared/protocol.js';
import { StoreError, type EditorialStore } from './store.js';
import type { CooperativeJobOwner } from './cooperative-jobs.js';

type Dependencies = { store: EditorialStore; jobs: CooperativeJobOwner; policy: LaunchPolicyProjection };

/** Return one cooperative preparation immediately; the desktop polls between ordinary service requests. */
export function prepareQuickTask(task: StartQuickTasksInput['tasks'][number], deps: Dependencies) {
  const { store, jobs, policy } = deps;
  let kind: TaskPlanKind;
  let initial: ServiceJobProjection;
  const rule = task.procedureId.startsWith('rule:') ? store.quickTaskRule(task.bookId, task.procedureId.slice(5)) : null;
  if (rule) {
    kind = rule.taskKind;
    if (kind === 'baseline-analysis') {
      const mode = rule.pattern === 'sync-current' ? 'sync-current' : 'reanalyze-book';
      initial = jobs.startBaselineAnalysisPreparation(task.bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], { mode, selectedRange: null }, policy, false);
    } else if (kind === 'review-run') initial = jobs.startReviewRunPreparation(task.bookId, rule.pattern.slice(7).split('+'), { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    else {
      const request = store.repeatTaskRequest(task.bookId, { kind: 'writing', ref: rule.version.sourceTaskIntentId });
      if (request.kind !== 'writing') throw new StoreError('QUICK_TASK_PROCEDURE_INVALID', '写作规则无效。');
      initial = jobs.startWritingPreparation(task.bookId, request.request, policy);
    }
  } else if (task.repeat) {
    const request = store.repeatTaskRequest(task.bookId, task.repeat);
    kind = request.kind;
    switch (request.kind) {
      case 'baseline-analysis': {
        if (request.customRef) {
          const result = store.prepareRepeatedCustomAnalysis(task.bookId, request.customRef, request.update, policy);
          initial = { jobId: randomUUID(), kind: 'baseline-analysis-preparation', state: 'completed', progress: { completed: 1, total: 1, label: '任务准备完成' }, result, failure: null };
        } else initial = jobs.startBaselineAnalysisPreparation(task.bookId, BASELINE_ANALYSIS_MODE_GOALS[request.update?.mode ?? 'first-baseline'], request.update, policy, false);
        break;
      }
      case 'review-run': initial = jobs.startReviewRunPreparation(task.bookId, request.categoryIds, request.scope, policy, request.capturedProcedure, request.materialIds, null, null, null, request.localCheck, undefined, request.procedureDefinition); break;
      case 'initial-evaluation': initial = jobs.startInitialEvaluationPreparation(task.bookId, policy, request.materialIds); break;
      case 'readers-report': initial = jobs.startReadersReportPreparation(task.bookId, request.template, policy, request.materialIds); break;
      case 'evaluation-rewrite': initial = jobs.startEvaluationRewritePreparation(task.bookId, request.recordId, policy); break;
      case 'writing': initial = jobs.startWritingPreparation(task.bookId, request.request, policy); break;
    }
  } else if (task.procedureId === 'baseline-analysis') {
    kind = 'baseline-analysis';
    const prior = store.inspectBaselineAnalysis(task.bookId);
    const mode = prior.resultSetRevision === null ? 'first-baseline' : 'reanalyze-book';
    initial = jobs.startBaselineAnalysisPreparation(task.bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], mode === 'first-baseline' ? null : { mode, selectedRange: null }, policy, false);
  } else if (task.procedureId === 'initial-evaluation') {
    kind = 'initial-evaluation';
    initial = jobs.startInitialEvaluationPreparation(task.bookId, policy);
  } else throw new StoreError('QUICK_TASK_PROCEDURE_INVALID', '请选择快速开始中的工序。');
  return { kind, job: initial, ruleVersionId: rule?.version.ruleVersionId ?? null };
}
