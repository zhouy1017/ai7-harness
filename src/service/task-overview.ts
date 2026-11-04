import type { BookTaskItemProjection, GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewGroupKey, TaskOverviewItemProjection, TaskOverviewProjection, TaskPlanKind } from '../shared/protocol.js';

const GROUPS: readonly TaskOverviewGroupKey[] = ['running', 'queued', 'waiting', 'paused', 'recent'];
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
    : position !== null || ['analysis-waiting-capacity', 'analysis-waiting-idle', 'review-waiting'].includes(item.state) ? 'queued'
    : ['analysis-paused', 'analysis-pausing', 'analysis-resumable', 'analysis-yielded'].includes(item.state) ? 'paused' : 'running';
  const plan = taskPlanTarget(item);
  const taskKind = item.object.kind === 'dialogue' ? '对话' : KIND_LABELS[plan?.kind ?? ''] ?? '工序';
  const modes: Record<string, string> = { 'first-baseline': '全书', 'reanalyze-book': '重新分析全书', 'reanalyze-range': '重新分析所选范围', 'sync-current': '同步到当前稿件' };
  const label = item.object.kind === 'analysis' ? `基线分析 · ${modes[item.object.mode] ?? '全书'}`
    : item.object.kind === 'dialogue' ? `对话${item.object.question ? ` · ${item.object.question}` : ''}`
    : item.object.kind === 'review' ? `审阅 · 第 ${item.object.ordinal} 次`
    : item.object.kind === 'draft' ? `任务草稿 · 「${item.object.goal}」` : taskKind;
  return { itemId: item.itemId, bookId: item.book.bookId, bookTitle: item.book.title, taskKind, label, at: item.at,
    selection: null, attention: item, detail: item.object.kind === 'dialogue' ? item.object.question : null, plan, result,
    state: group === 'recent' ? item.state === 'analysis-cancelled' ? 'cancelled' : ['analysis-interrupted', 'analysis-failed', 'review-stopped', 'dialogue-stopped', 'dialogue-interrupted', 'dialogue-failed'].includes(item.state) ? 'stopped' : 'completed' : group,
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
    unique.set(item.itemId, { ...item, selection: entry.selection ?? null, label: item.label + (entry.selection ? ' · 所选段落' : ''), usage: usage(item) });
  }
  const groups = GROUPS.map((key) => {
    const items = [...unique.values()].filter((item) => key === 'recent' ? ['completed', 'cancelled', 'stopped'].includes(item.state) : item.state === key);
    items.sort((a, b) => key === 'queued' ? (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) : key === 'recent' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at));
    return { key, items, total: items.length };
  });
  return { groups, capacity, books, queueFrozen, runningCount: groups[0]!.total, queuedCount: groups[1]!.total, actionableCount: groups[2]!.total };
}
