import type { TaskWorkReader } from './task-work.js';
import type { ProgressReader } from './analysis/baseline-analysis-types.js';
import type { TaskWorkProjection } from '../shared/protocol/task-plan.js';
import type { BookTaskItemProjection, BookTasksProjection, GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewGroupKey, TaskOverviewItemProjection, TaskOverviewProjection, TaskPlanKind } from '../shared/protocol.js';

const GROUPS: readonly TaskOverviewGroupKey[] = ['running', 'queued', 'waiting', 'paused', 'recent'];
/** Bulk controls isolate stale individual tasks; resuming always restores dispatch. */
export async function controlOverviewTasks(action: 'pause' | 'resume', owner: {
  freeze(value: boolean): void; items(): ReadonlyArray<TaskOverviewItemProjection>;
  control(item: TaskOverviewItemProjection): Promise<void>;
}): Promise<void> {
  owner.freeze(true);
  const failures: string[] = [];
  try {
    for (const item of owner.items()) {
      try { await owner.control(item); }
      catch (error) { failures.push(error instanceof Error ? error.message : '任务未能处理。'); }
    }
  } finally { if (action === 'resume') owner.freeze(false); }
  if (failures.length) throw new Error(failures.join('；'));
}
export function taskPlanTarget(item: GlobalAttentionItemProjection): { kind: TaskPlanKind; ref: string | null } | null {
  const target = item.target;
  if (target.kind === 'analysis' || target.kind === 'analysis-plan') return { kind: 'baseline-analysis', ref: target.taskIntentId };
  if (target.kind === 'review' || target.kind === 'review-plan') return { kind: 'review-run', ref: target.reviewRunId };
  if (target.kind === 'task-plan') return { kind: target.taskKind, ref: target.ref };
  return null;
}
const KIND_LABELS: Record<string, string> = { 'baseline-analysis': '分析', 'review-run': '审阅', 'initial-evaluation': '评估', 'readers-report': '评估', 'evaluation-rewrite': '评估', writing: '写作', 'fixed-task': '工序' };
export function taskOverviewItem(item: GlobalAttentionItemProjection, queuePosition: (id: string) => number | null, result: BookTaskItemProjection['result'] = null): TaskOverviewItemProjection {
  const runRecordId = item.technical.find((row) => row.key === 'run-record' || row.key === 'run-records')?.value.split(' · ')[0] ?? null;
  const position = runRecordId === null ? null : queuePosition(runRecordId);
  let group: TaskOverviewGroupKey = item.group === 'recent' ? 'recent' : item.group === 'exceptions' || item.group === 'decisions' ? 'waiting'
    : position !== null || item.state === 'analysis-queued' && item.facts.progress === null || ['analysis-waiting-capacity', 'analysis-waiting-idle', 'analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-admission', 'analysis-waiting-slot', 'review-waiting'].includes(item.state) ? 'queued'
    : ['analysis-paused', 'analysis-pausing', 'analysis-resumable', 'analysis-yielded', 'dialogue-stopped'].includes(item.state) ? 'paused' : 'running';
  if (item.state === 'dialogue-stopped' && !item.facts.dialogueCancelled) group = 'paused';
  const plan = taskPlanTarget(item);
  const taskKind = item.object.kind === 'dialogue' ? '对话' : KIND_LABELS[plan?.kind ?? ''] ?? '工序';
  const modes: Record<string, string> = { 'first-baseline': '全书', 'reanalyze-book': '重新分析全书', 'reanalyze-range': '重新分析所选范围', 'sync-current': '同步到当前稿件' };
  const label = item.object.kind === 'analysis' ? `基线分析 · ${modes[item.object.mode] ?? '全书'}`
    : item.object.kind === 'dialogue' ? `对话${item.object.question ? ` · ${item.object.question}` : ''}`
    : item.object.kind === 'review' ? `审阅 · 第 ${item.object.ordinal} 次`
    : item.object.kind === 'draft' ? `任务草稿 · 「${item.object.goal}」` : taskKind;
  return { itemId: item.itemId, bookId: item.book.bookId, bookTitle: item.book.title, taskKind, label, at: item.at,
    selection: null, attention: item, detail: item.facts.resumeFailure ?? (item.object.kind === 'dialogue' ? item.object.question : null), plan, result,
    state: group === 'recent' ? item.state === 'analysis-cancelled' || item.facts.dialogueCancelled ? 'cancelled' : ['analysis-interrupted', 'analysis-failed', 'review-stopped', 'dialogue-stopped', 'dialogue-interrupted', 'dialogue-failed'].includes(item.state) ? 'stopped' : 'completed' : group,
    progress: item.facts.progress === null ? null : { done: item.facts.progress.unitsSettled, total: item.facts.progress.unitsTotal, currentUnitLabel: null, elapsedMs: null, modelWaiting: item.state === 'analysis-running' && item.facts.progress.stage !== 'units' },
    queuePosition: position, eta: null, usage: null, nextAction: item.nextStep, runRecordId, target: item.target };
}
/** Pure navigation projection; the Book ledgers and governor retain all authority. */
export function composeTaskOverview(attention: GlobalAttentionProjection, capacity: number, queuePosition: (id: string) => number | null,
  entries?: readonly BookTaskItemProjection[], books: TaskOverviewProjection['books'] = [], queueFrozen = false,
  usage: (item: TaskOverviewItemProjection) => TaskOverviewItemProjection['usage'] = () => null): TaskOverviewProjection {
  const source: readonly BookTaskItemProjection[] = entries ?? attention.groups.flatMap((group) => group.items).map((item) => ({ item, result: null }));
  const unique = new Map<string, TaskOverviewItemProjection>();
  for (const entry of source) {
    if (!['analysis', 'analysis-plan', 'review', 'review-plan', 'task-plan', 'dialogue', 'task-intent-draft'].includes(entry.item.target.kind)) continue;
    const item = taskOverviewItem(entry.item, queuePosition, entry.result);
    unique.set(item.itemId, { ...item, selection: entry.selection ?? null, label: item.label + (entry.selection ? ' · 所选段落' : ''), usage: usage(item),
      ...(entry.work === undefined ? {} : { work: entry.work }) });
  }
  const groups = GROUPS.map((key) => {
    const items = [...unique.values()].filter((item) => key === 'recent' ? ['completed', 'cancelled', 'stopped'].includes(item.state) : item.state === key);
    items.sort((a, b) => key === 'queued' ? (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) : key === 'recent' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at));
    return { key, items, total: items.length };
  });
  return { groups, capacity, books, queueFrozen, runningCount: groups[0]!.total, queuedCount: groups[1]!.total, actionableCount: groups[2]!.total };
}

/** Approximate FIFO start times from measured same-kind unit throughput; unknown work leaves the estimate absent. */
export function estimateTaskStarts(projection: TaskOverviewProjection, now = Date.now()): TaskOverviewProjection {
  if (projection.queueFrozen) return projection;
  const items = projection.groups.flatMap((group) => group.items);
  const samples = new Map<string, number[]>();
  for (const item of items) {
    const units = item.attention.facts.completion?.total;
    if (item.state !== 'completed' || !units || !item.usage || item.usage.elapsed <= 0 || now - Date.parse(item.at) > 7 * 86400000) continue;
    const rates = samples.get(item.taskKind) ?? []; rates.push(item.usage.elapsed / units); samples.set(item.taskKind, rates);
  }
  if (samples.size === 0) return projection;
  const remaining = (item: TaskOverviewItemProjection): number | null => {
    const rates = samples.get(item.taskKind);
    if (!rates?.length || !item.progress) return null;
    return Math.max(0, item.progress.total - item.progress.done) * rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  };
  const slots: number[] = [];
  for (const item of projection.groups.find((group) => group.key === 'running')!.items) { const duration = remaining(item); if (duration === null) return projection; slots.push(duration); }
  while (slots.length < projection.capacity) slots.push(0);
  let known = true;
  const queued = projection.groups.find((group) => group.key === 'queued')!.items.map((item) => {
    if (!known) return item;
    const earliest = Math.min(...slots), slot = slots.indexOf(earliest), duration = remaining(item);
    if (duration === null) { known = false; return item; }
    slots[slot] = earliest + duration;
    return { ...item, eta: earliest };
  });
  return { ...projection, groups: projection.groups.map((group) => group.key === 'queued' ? { ...group, items: queued } : group) };
}

/** 用时 of one row of the Book's 任务 panel (Issue #1670): the reading the plan of the same Task gives; `null` for a Task with no Run. */
export function taskItemWork(work: TaskWorkReader, item: GlobalAttentionItemProjection, live: (attemptId: string) => boolean): TaskWorkProjection | null {
  const target = item.target;
  if (target.kind === 'analysis' || target.kind === 'analysis-plan') return work.ofTaskIntents([target.taskIntentId], item.modelLabel);
  if (target.kind === 'review' || target.kind === 'review-plan') return work.ofReview(target.reviewRunId, item.modelLabel);
  if (target.kind === 'task-plan') return work.ofPlan(target.taskKind, target.ref);
  if (target.kind === 'dialogue') return work.ofDialogue(target.dialogueId, live, item.modelLabel ?? null);
  return null;
}

export function withBookTaskWork(work: TaskWorkReader | null, live: (attemptId: string) => unknown, projection: BookTasksProjection): BookTasksProjection {
  return work === null ? projection : { ...projection, groups: projection.groups.map((group) => ({ ...group,
    items: group.items.map((entry) => ({ ...entry, work: taskItemWork(work, entry.item, (attemptId) => live(attemptId) !== null) })) })) };
}

/** The finished card's 处理用时 · 约 N 次调用 as it always read: the Run Reports' stage wall times and requests; a dialogue's attempts. */
export function overviewUsage(owners: {
  taskSummary(target: { runRecordId: string } | { taskIntentIds: readonly string[] }): { calls: number; elapsed: number } | null;
  reviewTaskIntentIds(bookId: string, reviewRunId: string): string[];
  dialogueAttempts(bookId: string, dialogueId: string): ReadonlyArray<{ startedAt: string; settledAt: string | null }>;
}): (item: TaskOverviewItemProjection) => TaskOverviewItemProjection['usage'] {
  return (item) => {
    if (!['completed', 'cancelled', 'stopped'].includes(item.state)) return null;
    if (item.runRecordId !== null) return owners.taskSummary({ runRecordId: item.runRecordId });
    if (item.target.kind === 'review' || item.target.kind === 'review-plan') return owners.taskSummary({ taskIntentIds: owners.reviewTaskIntentIds(item.target.bookId, item.target.reviewRunId) });
    if (item.target.kind === 'dialogue') {
      const attempts = owners.dialogueAttempts(item.target.bookId, item.target.dialogueId);
      return { calls: attempts.length, elapsed: attempts.reduce((sum, attempt) => sum + (attempt.settledAt === null ? 0 : Math.max(0, Date.parse(attempt.settledAt) - Date.parse(attempt.startedAt))), 0) };
    }
    return null;
  };
}

/** A running or queued row's progress: its Run's parts, the one under way, and 已用时 counted from the Run's record, as before. */
export function withRunningProgress(projection: TaskOverviewProjection, progress: ProgressReader,
  executionPlan: (runRecordId: string) => { manifest: { units: ReadonlyArray<{ ordinal: number; headingText: string | null }> } }): TaskOverviewProjection {
  return { ...projection, groups: projection.groups.map((group) => ({ ...group, items: group.items.map((item) => {
    if (item.runRecordId === null || !['running', 'queued'].includes(item.state)) return item;
    const facts = executionPlan(item.runRecordId);
    const current = progress(item.runRecordId);
    const unit = facts.manifest.units.find((unit) => unit.ordinal === current?.currentUnitOrdinal);
    return { ...item, progress: { done: current?.unitsSettled ?? 0, total: facts.manifest.units.length,
      currentUnitLabel: unit?.headingText ?? null, elapsedMs: current === null ? null : Math.max(0, Date.now() - Date.parse(item.at)),
      modelWaiting: current?.attemptState === 'awaiting-response' } };
  }) })) };
}
