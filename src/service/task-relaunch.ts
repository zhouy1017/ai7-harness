import type { DatabaseSync } from 'node:sqlite';
import { BASELINE_ANALYSIS_KIND, WRITING_KIND, INITIAL_EVALUATION_KIND, READERS_REPORT_KIND, EVALUATION_REWRITE_KIND, isCustomAnalysisKindId, type ControlTaskRunInput } from '../shared/protocol.js';
import { asString, requireStore, type SqlRow } from './store-records.js';
import type { EditorialStore } from './store.js';
import type { ReviewRunStore } from './review/review-runs.js';
import type { ReadersReports, latestReadersReport } from './readers-reports.js';
import type { EvaluationRewrites, latestEvaluationRewrite } from './evaluation-rewrites.js';
import type { WritingTasks } from './writing-tasks.js';
import type { BaselineAnalysisStore } from './analysis/baseline-analysis-store.js';

/** Reconstruct the existing editorial request; execution choices belong to the launch owner. */
export interface TaskRelaunchHost {
  authority: DatabaseSync;
  reviewRepeat: ReviewRunStore['repeatRequest'];
  reviewRedo: ReviewRunStore['redoRequest'];
  analysisLedger(bookId: string, ref: string): BaselineAnalysisStore;
  ledger: EditorialStore['taskRunLedger'];
  materialIds(ref: string): ReadonlyArray<string>;
  readersTask: ReadersReports['task'];
  rewriteTask: EvaluationRewrites['task'];
  writingTask: WritingTasks['task'];
  latestReaders(bookId: string): ReturnType<typeof latestReadersReport>;
  latestRewrite(bookId: string): ReturnType<typeof latestEvaluationRewrite>;
  latestWriting(bookId: string): { task: NonNullable<ReturnType<WritingTasks['task']>> } | null;
}

export function repeatTaskRequest(host: TaskRelaunchHost, bookId: string, source: NonNullable<import('../shared/protocol.js').StartQuickTasksInput['tasks'][number]['repeat']>) {
    if (source.kind === 'review-run') return { kind: source.kind, ...host.reviewRepeat(bookId, source.ref) };
    const row = host.authority.prepare(`SELECT r.run_record_id, t.kind FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      WHERE t.book_id = ? AND t.task_intent_id = ? ORDER BY r.rowid DESC LIMIT 1`).get(bookId, source.ref) as SqlRow | undefined;
    requireStore(row !== undefined, 'TASK_REPEAT_UNAVAILABLE', '原任务的运行记录不存在。');
    const expected = source.kind === 'baseline-analysis' ? BASELINE_ANALYSIS_KIND : source.kind === 'writing' ? WRITING_KIND
      : source.kind === 'initial-evaluation' ? INITIAL_EVALUATION_KIND : source.kind === 'readers-report' ? READERS_REPORT_KIND : EVALUATION_REWRITE_KIND;
    requireStore(asString(row.kind) === expected || source.kind === 'baseline-analysis' && isCustomAnalysisKindId(row.kind), 'TASK_REPEAT_UNAVAILABLE', '原任务类型不一致。');
    if (source.kind === 'baseline-analysis') {
      const ledger = host.analysisLedger(bookId, source.ref);
      const facts = ledger.loadExecutionPlan(asString(row.run_record_id));
      const mode = facts.update?.mode;
      const update = mode === 'sync-current' || mode === 'reanalyze-range' || mode === 'reanalyze-book' ? { mode, selectedRange: facts.update!.selectedRange }
        : ledger.inspect(bookId).resultSetRevision === null ? null : { mode: 'reanalyze-book' as const, selectedRange: null };
      return { kind: source.kind, update, customRef: isCustomAnalysisKindId(row.kind) ? source.ref : null };
    }
    const materialIds = host.materialIds(source.ref);
    if (source.kind === 'initial-evaluation') return { kind: source.kind, materialIds };
    if (source.kind === 'readers-report') {
      const task = host.readersTask(source.ref);
      requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原审稿意见任务不存在。');
      return { kind: source.kind, template: task.template, materialIds };
    }
    if (source.kind === 'evaluation-rewrite') {
      const task = host.rewriteTask(source.ref);
      requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原评估重写任务不存在。');
      return { kind: source.kind, recordId: task.recordId };
    }
    const task = host.writingTask(source.ref);
    requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原写作任务不存在。');
    return { kind: source.kind, request: { typeId: task.typeId, audience: task.input.audience, channel: task.input.channel,
      requirements: task.input.requirements, materialIds: task.materials.map((material) => material.source.materialId) } };
  }


export function redoTaskRequest(host: TaskRelaunchHost, input: Pick<ControlTaskRunInput, 'bookId' | 'kind' | 'ref'>) {
    if (input.kind === 'review-run') return { kind: input.kind, ...host.reviewRedo(input.bookId, input.ref) };
    const ledger = host.ledger(input);
    const projection = ledger.inspect(input.bookId);
    requireStore(projection.taskIntent?.taskIntentId === input.ref && projection.run !== null &&
      (projection.run.state === 'cancelled' || (projection.run.state === 'interrupted' && projection.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached')) &&
      projection.run.transitions.some((entry) => entry.state === 'executing'), 'ANALYSIS_REDO_STALE', '只有开始后取消的运行可以改计划重做。');
    const redoOf = projection.run.runRecordId;
    const materialIds = ledger.definition.materialReferences?.sources.map((source) => source.materialId) ?? [];
    switch (input.kind) {
      case 'initial-evaluation': return { kind: input.kind, redoOf, materialIds };
      case 'readers-report': return { kind: input.kind, redoOf, materialIds, template: host.latestReaders(input.bookId)!.task.template };
      case 'evaluation-rewrite': return { kind: input.kind, redoOf, recordId: host.latestRewrite(input.bookId)!.task.recordId };
      case 'writing': {
        const task = host.latestWriting(input.bookId)!.task;
        return { kind: input.kind, redoOf, request: { typeId: task.typeId, audience: task.input.audience,
          channel: task.input.channel, requirements: task.input.requirements, materialIds: task.materials.map((material) => material.source.materialId) } };
      }
    }
  }

