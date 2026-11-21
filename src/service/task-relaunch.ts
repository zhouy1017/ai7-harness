import type { DatabaseSync } from 'node:sqlite';
import { BASELINE_ANALYSIS_KIND, WRITING_KIND, INITIAL_EVALUATION_KIND, READERS_REPORT_KIND, EVALUATION_REWRITE_KIND, isCustomAnalysisKindId, type ControlTaskRunInput } from '../shared/protocol.js';
import { asString, requireStore, sha256, canonicalJson, type SqlRow } from './store-records.js';
import { BASELINE_ANALYSIS_MODE_GOALS, type TaskPlanProjection } from '../shared/protocol.js';
import type { TaskRelaunchSource } from '../shared/runtime-execution-config.js';
import type { TaskPlanRelaunchProjection } from '../shared/protocol/task-plan.js';
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
  reviewFacts: ReviewRunStore['planFacts'];
  taskPlan: EditorialStore['inspectTaskPlan'];
}

export const TASK_RELAUNCH_STALE = '这项任务已经变化，请重新打开任务后再开始。';

function ledgerSource(host: TaskRelaunchHost, bookId: string, ref: string) {
  return host.authority.prepare(`SELECT r.run_record_id, t.kind, s.state, s.sha256,
    t.task_intent_id = (SELECT task_intent_id FROM analysis_task_intents WHERE book_id = t.book_id AND kind = t.kind ORDER BY created_at DESC, rowid DESC LIMIT 1) current
    FROM analysis_task_intents t JOIN analysis_run_records r USING(task_intent_id) JOIN analysis_run_states s USING(run_record_id)
    WHERE t.book_id = ? AND t.task_intent_id = ? ORDER BY r.rowid DESC, s.sequence DESC LIMIT 1`).get(bookId, ref);
}

function reviewRevision(host: TaskRelaunchHost, bookId: string, ref: string, boundary?: ReadonlyArray<number>) {
  const facts = host.reviewFacts(bookId, ref);
  const events = host.authority.prepare('SELECT rowid position, sha256, state, canonical_json, run_record_id FROM review_run_category_events WHERE review_run_id = ? ORDER BY rowid').all(ref);
  const runs = facts.categories.flatMap(category => category.task === null ? [] : host.authority.prepare(`SELECT s.rowid position, s.sha256, s.state, s.run_record_id FROM analysis_run_states s JOIN analysis_run_records r USING(run_record_id)
    WHERE r.task_intent_id = ? ORDER BY r.rowid, s.sequence`).all(category.task.taskIntentId));
  const local = host.authority.prepare('SELECT rowid position, sha256, state FROM review_local_stage_artifacts WHERE review_run_id = ? ORDER BY rowid').all(ref);
  const groups = [events, runs, local];
  const cursors = boundary ?? groups.map(rows => rows.reduce((maximum, row) => Math.max(maximum, Number(row.position)), 0));
  const prefix = groups.map((rows, index) => rows.filter(row => Number(row.position) <= cursors[index]!).map(row => row.sha256));
  return { state: facts.state, groups, revision: `${cursors.join(':')}:${sha256(canonicalJson(prefix))}` };
}

function requireOfferedSource(host: TaskRelaunchHost, bookId: string, source: TaskRelaunchSource): void {
  const offered = host.taskPlan({ bookId, kind: source.kind, ref: source.ref }).relaunch?.input.relaunchOf;
  requireStore(offered !== undefined && canonicalJson(offered) === canonicalJson(source), 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
}

/** The command replay lookup runs before this read; a new command must still name the offered source. */
export function requireTaskRelaunchSource(host: TaskRelaunchHost, bookId: string, source: TaskRelaunchSource | undefined, expected?: TaskRelaunchSource['kind'] | 'custom-analysis', preview = false): void {
  if (source === undefined) return;
  requireStore(expected === undefined || source.kind === (expected === 'custom-analysis' ? 'baseline-analysis' : expected), 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
  if (source.kind === 'review-run') {
    const latest = host.authority.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId);
    requireStore(latest?.review_run_id === source.ref && source.runRecordId === source.ref, 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
    const current = reviewRevision(host, bookId, source.ref);
    if (!source.cancelsFirst) { requireStore(current.revision === source.revision, 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE); requireOfferedSource(host, bookId, source); return; }
    if (preview && current.revision === source.revision) { requireOfferedSource(host, bookId, source); return; }
    const boundary = source.revision.split(':').slice(0, 3).map(Number);
    requireStore(boundary.length === 3 && boundary.every(Number.isSafeInteger) && current.state === 'cancelled' &&
      reviewRevision(host, bookId, source.ref, boundary).revision === source.revision, 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
    const [events, runs, local] = current.groups.map((rows, index) => rows.filter(row => Number(row.position) > boundary[index]!));
    const cancelled = new Set(runs!.filter(row => row.state === 'cancelled').map(row => row.run_record_id));
    requireStore(runs!.every(row => row.state === 'cancelling' || row.state === 'cancelled') && local!.every(row => row.state === 'cancelled') &&
      events!.every(row => JSON.parse(String(row.canonical_json)).code === 'REVIEW_RUN_CANCELLED' || cancelled.has(row.run_record_id)), 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
    return;
  }
  const row = ledgerSource(host, bookId, source.ref);
  requireStore(row !== undefined && row.current === 1 && row.run_record_id === source.runRecordId, 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
  requireStore(expected !== 'baseline-analysis' && expected !== 'custom-analysis' || (expected === 'custom-analysis' ? isCustomAnalysisKindId(row.kind) : row.kind === BASELINE_ANALYSIS_KIND), 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
  if (preview && source.cancelsFirst && row.sha256 === source.revision) { requireOfferedSource(host, bookId, source); return; }
  if (!source.cancelsFirst && row.sha256 === source.revision) { requireOfferedSource(host, bookId, source); return; }
  const previous = host.authority.prepare('SELECT sequence FROM analysis_run_states WHERE run_record_id = ? AND sha256 = ?').get(source.runRecordId, source.revision);
  const later = previous === undefined ? [] : host.authority.prepare('SELECT state FROM analysis_run_states WHERE run_record_id = ? AND sequence > ? ORDER BY sequence').all(source.runRecordId, Number(previous.sequence));
  requireStore(source.cancelsFirst && later.length > 0 && later.every(entry => entry.state === 'cancelling' || entry.state === 'cancelled') && row.state === 'cancelled', 'TASK_RELAUNCH_STALE', TASK_RELAUNCH_STALE);
}

/** Add a launch recipe without changing the legacy redo projection or writing anything. */
export function withTaskRelaunch(host: TaskRelaunchHost, plan: TaskPlanProjection): TaskPlanProjection {
  try { return taskRelaunchPlan(host, plan); } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && ['TASK_REPEAT_UNAVAILABLE', 'REVIEW_MANUSCRIPT_ABSENT'].includes(String(error.code))) return { ...plan, relaunch: null };
    throw error;
  }
}

function taskRelaunchPlan(host: TaskRelaunchHost, plan: TaskPlanProjection): TaskPlanProjection {
  if (plan.kind === 'fixed-task') return plan;
  const absent = (): TaskPlanProjection => ({ ...plan, relaunch: null });
  if (!['settled', 'stopped', 'cancelled', 'cancelled-after-start', 'blocked', 'plan-moved', 'paused', 'resumable', 'awaiting-clarification', 'budget-reached', 'account-limit'].includes(plan.state.key) ||
    plan.runControl?.outcomeUnknown != null || plan.state.stopReason === 'outcome-unknown' || plan.runControl?.stopReason === 'outcome-unknown' || plan.state.key === 'outcome-unknown') return absent();
  const { bookId, ref, kind } = plan;
  const row = kind === 'review-run' ? null : ledgerSource(host, bookId, ref);
  if (kind !== 'review-run' && (row === undefined || row === null || row.current !== 1)) return absent();
  if (kind === 'review-run' && host.authority.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId)?.review_run_id !== ref) return absent();
  if (kind === 'review-run' && plan.state.key !== 'settled' && host.authority.prepare('SELECT 1 FROM review_run_category_events WHERE review_run_id = ? LIMIT 1').get(ref) === undefined) return absent();
  if (kind === 'review-run' && host.reviewFacts(bookId, ref).categories.some(category => category.task !== null &&
    ['authorized', 'admitted', 'executing', 'awaiting-connectivity', 'cancelling', 'pausing'].includes(String(host.authority.prepare(`SELECT state FROM analysis_run_states s JOIN analysis_run_records r USING(run_record_id)
      WHERE r.task_intent_id = ? ORDER BY r.rowid DESC, s.sequence DESC LIMIT 1`).get(category.task.taskIntentId)?.state)))) return absent();
  const betweenCategories = kind === 'review-run' && plan.runControl?.resume == null && host.reviewFacts(bookId, ref).canContinue;
  const cancel = betweenCategories || row !== null && row !== undefined && ['paused', 'resumable', 'awaiting-clarification', 'blocked-before-dispatch'].includes(String(row.state)) || kind === 'review-run' && plan.runControl?.resume != null;
  const relaunchOf: TaskRelaunchSource = { kind, ref, runRecordId: row == null ? ref : String(row.run_record_id), revision: row == null ? reviewRevision(host, bookId, ref).revision : String(row.sha256), cancelsFirst: cancel };
  const blocked = row?.state === 'blocked-before-dispatch';
  const cancelsFirst = !cancel ? null : betweenCategories ? { operation: 'cancelReviewRun' as const, input: { bookId, reviewRunId: ref } } : kind === 'baseline-analysis'
    ? { operation: blocked ? 'cancelWaitingBaselineAnalysis' as const : 'cancelBaselineAnalysisRun' as const, input: { bookId, taskIntentId: ref } }
    : blocked ? { operation: 'cancelWaitingTask' as const, input: { bookId, kind, ref } }
      : { operation: 'controlTaskRun' as const, input: { bookId, kind, ref, action: 'cancel' as const } };
  const carries = kind !== 'review-run' && plan.redo !== null;
  const redoOf = carries ? relaunchOf.runRecordId : undefined;
  const summary = cancel && (plan.state.key === 'blocked' || plan.state.key === 'plan-moved')
    ? ['先取消这项尚未开始的任务，再重新开始。', '重新开始一项新任务，已完成的内容不会带入。']
    : [...(cancel ? ['先取消这项未完成的任务，再重新开始。'] : []), carries ? '重新开始一项新任务；可以沿用的已完成部分会保留，其余重新处理。' : plan.state.key === 'settled' ? '按原来的要求重新开始一项新任务。' : '重新开始一项新任务，已完成的内容不会带入。'];
  const request = repeatTaskRequest(host, bookId, { kind, ref }, true);
  const common = { summary, cancelsFirst };
  const input = { bookId, relaunchOf, ...(redoOf === undefined ? {} : { redoOf }) };
  let relaunch: TaskPlanRelaunchProjection;
  switch (request.kind) {
    case 'baseline-analysis': {
      const preparation = carries && plan.redo !== null && 'goal' in plan.redo.prepare ? plan.redo.prepare : null;
      const update = preparation === null ? request.update : preparation.update;
      relaunch = request.customRef === null
        ? { ...common, operation: 'launchBaselineAnalysis', input: { ...input, goal: preparation?.goal ?? BASELINE_ANALYSIS_MODE_GOALS[update?.mode ?? 'first-baseline'], update } }
        : { ...common, operation: 'launchCustomAnalysis', input: { ...input, dimensionId: String(row!.kind).slice('custom-analysis/'.length), update } };
      break;
    }
    case 'initial-evaluation': relaunch = { ...common, operation: 'launchInitialEvaluation', input: { ...input, materialIds: request.materialIds } }; break;
    case 'readers-report': relaunch = { ...common, operation: 'launchReadersReport', input: { ...input, template: request.template, materialIds: request.materialIds } }; break;
    case 'evaluation-rewrite': relaunch = { ...common, operation: 'launchEvaluationRewrite', input: { ...input, recordId: request.recordId } }; break;
    case 'writing': relaunch = { ...common, operation: 'launchWritingTask', input: { ...input, ...request.request } }; break;
    case 'review-run': { const { kind: _kind, ...review } = request; relaunch = { ...common, operation: 'launchReviewRun', input: { bookId, relaunchOf, ...review } }; break; }
  }
  return { ...plan, relaunch };
}

export function repeatTaskRequest(host: TaskRelaunchHost, bookId: string, source: NonNullable<import('../shared/protocol.js').StartQuickTasksInput['tasks'][number]['repeat']>, projectionOnly = false) {
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
    // A relaunch reading may choose another connection; reading its request is not an execution preflight.
    const facts = projectionOnly ? ledger.inspect(bookId) : ledger.loadExecutionPlan(asString(row.run_record_id));
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

