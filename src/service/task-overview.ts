import type {
  GlobalAttentionItemProjection,
  GlobalAttentionProjection,
  TaskOverviewGroupKey,
  TaskOverviewItemProjection,
  TaskOverviewProjection,
} from '../shared/protocol.js';

const GROUPS: readonly TaskOverviewGroupKey[] = ['running', 'queued', 'waiting', 'paused', 'recent'];

function runRecordIdOf(item: GlobalAttentionItemProjection): string | null {
  const row = item.technical.find((entry) => entry.key === 'run-record' || entry.key === 'run-records');
  if (row === undefined) return null;
  return row.value.split(' · ')[0] ?? null;
}

function taskKindOf(item: GlobalAttentionItemProjection): string {
  switch (item.object.kind) {
    case 'analysis': return '分析';
    case 'review': return '审阅';
    case 'dialogue': return '对话';
    case 'task': return item.object.taskKind;
    default: return '任务';
  }
}

function labelOf(item: GlobalAttentionItemProjection): string {
  switch (item.object.kind) {
    case 'analysis': return item.object.mode === 'first-baseline' ? '基线分析 · 全书' : '基线分析 · 重新分析全书';
    case 'review': return '审阅';
    case 'dialogue': return '对话';
    case 'task': return item.object.taskKind;
    default: return '任务';
  }
}

function groupOf(item: GlobalAttentionItemProjection): TaskOverviewGroupKey {
  if (item.group === 'recent') return 'recent';
  if (item.group === 'exceptions' || item.group === 'decisions') return 'waiting';
  if (item.state === 'analysis-waiting-capacity' || item.state === 'analysis-waiting-idle') return 'queued';
  if (item.state === 'analysis-paused' || item.state === 'analysis-pausing' || item.state === 'analysis-resumable' || item.state === 'analysis-yielded') return 'paused';
  return 'running';
}

function stateOf(group: TaskOverviewGroupKey, item: GlobalAttentionItemProjection): TaskOverviewItemProjection['state'] {
  if (group === 'recent' && item.state === 'analysis-cancelled') return 'cancelled';
  if (group === 'recent' && (item.state === 'analysis-interrupted' || item.state === 'review-stopped')) return 'stopped';
  if (group === 'recent') return 'completed';
  return group;
}

function overviewItem(item: GlobalAttentionItemProjection, queuePosition: (runRecordId: string) => number | null): TaskOverviewItemProjection {
  const group = groupOf(item);
  const runRecordId = runRecordIdOf(item);
  const progress = item.facts.progress === null ? null : {
    done: item.facts.progress.unitsSettled,
    total: item.facts.progress.unitsTotal,
    currentUnitLabel: null,
    elapsedMs: null,
    modelWaiting: item.state === 'analysis-running' && item.facts.progress.stage !== 'units',
  };
  return {
    itemId: item.itemId,
    bookId: item.book.bookId,
    bookTitle: item.book.title,
    taskKind: taskKindOf(item),
    label: labelOf(item),
    state: stateOf(group, item),
    progress,
    queuePosition: group === 'queued' && runRecordId !== null ? queuePosition(runRecordId) : null,
    eta: null,
    usage: null,
    nextAction: item.nextStep,
    runRecordId,
    target: item.target,
  };
}

/** Build the cross-Book navigation projection without creating a second task ledger (Issue #1328). */
export function composeTaskOverview(
  attention: GlobalAttentionProjection,
  capacity: number,
  queuePosition: (runRecordId: string) => number | null,
): TaskOverviewProjection {
  const items = attention.groups.flatMap((group) => group.items)
    .filter((item) => item.target.kind === 'analysis' || item.target.kind === 'analysis-plan' || item.target.kind === 'review' || item.target.kind === 'review-plan' || item.target.kind === 'task-plan' || item.target.kind === 'dialogue')
    .map((item) => overviewItem(item, queuePosition));
  const groups = GROUPS.map((key) => {
    const members = items.filter((item) => item.state === key || key === 'waiting' && item.state === 'waiting');
    return { key, items: members, total: members.length };
  });
  const runningCount = groups.find((group) => group.key === 'running')!.total;
  const queuedCount = groups.find((group) => group.key === 'queued')!.total;
  return {
    groups,
    capacity,
    runningCount,
    queuedCount,
    actionableCount: groups.find((group) => group.key === 'waiting')!.total,
  };
}
