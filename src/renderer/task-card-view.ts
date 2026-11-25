import type { GlobalAttentionStateKey, TaskOverviewItemProjection } from '../shared/protocol.js';
import { globalAttentionNextStepLine, globalAttentionReason, globalAttentionStateLabel } from './global-attention-labels.js';
import { serviceWords } from './service-wording.js';
import { technicalWords, technicalLayerVisible } from './technical-layer.js';
import { DIALOGUE_ACTIONS } from './dialogue-labels.js';
import { TASK_BAR_CANCEL_RUN, TASK_BAR_PROXY_SETTINGS, TASK_BAR_REDO, TASK_BAR_RESUME, TASK_BAR_VIEW_UNCONFIRMED } from './task-drawer-labels.js';

/**
 * One task card as data (Issue #1680; items 5.6 and 8.2 of #1539): the group the 任务 page and the Book panel place it in, its pill
 * and line in the words 待我处理 uses for the same record, and the one set of actions every surface offers for its state. Both the
 * global 任务 page and the Book's 任务 panel draw this view; the service's own grouping is left as it is.
 */
export type TaskPageGroup = 'pending' | 'running' | 'queued' | 'stopped' | 'recent';
export type TaskPanelGroup = 'pending' | 'active' | 'recent';
export const TASK_PAGE_GROUPS: readonly TaskPageGroup[] = ['pending', 'running', 'queued', 'stopped', 'recent'];
export const TASK_PANEL_GROUPS: readonly TaskPanelGroup[] = ['pending', 'active', 'recent'];
export const TASK_PAGE_GROUP_LABELS: Readonly<Record<TaskPageGroup, string>> = {
  pending: '待处理', running: '正在运行', queued: '排队中', stopped: '已暂停或中断', recent: '最近完成',
};
export const TASK_PANEL_GROUP_LABELS: Readonly<Record<TaskPanelGroup, string>> = { pending: '待处理', active: '进行中', recent: '最近完成' };

export type TaskCardAction = 'open' | 'plan' | 'run' | 'pause' | 'resume' | 'cancel' | 'up' | 'top' | 'answer' | 'redo' | 'result' | 'again' | 'jump'
  | 'proxy' | 'unconfirmed' | 'next' | 'book';
export interface TaskCardActionView { readonly action: TaskCardAction; readonly label: string }
export interface TaskCardView {
  readonly pageGroup: TaskPageGroup;
  readonly panelGroup: TaskPanelGroup;
  readonly pill: string;
  readonly line: string;
  /** The card's buttons outside 更多, in order. */
  readonly actions: ReadonlyArray<TaskCardActionView>;
  /** 取消任务 of a task that has sent nothing yet, or one with no impact to weigh: one press, no confirmation. */
  readonly cancelInOnePress: boolean;
}

const RUNNING: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-running', 'review-running', 'dialogue-answering', 'analysis-cancelling']);
const STOPPED: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-paused', 'analysis-pausing', 'analysis-resumable', 'analysis-yielded', 'review-continuable']);
/** Waits whose cancellation is the waiting-start cancellation: nothing has been sent. */
const WAIT_CANCELLED: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-waiting-capacity', 'analysis-waiting-slot', 'analysis-waiting-idle',
  'analysis-blocked', 'analysis-plan-moved', 'analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-admission']);
/**
 * A task in progress — running, or queued and waiting its turn — as the 任务 sidebar number and 待我处理's 「有 N 项任务正在进行。」 count
 * it (Issue #1680). A wait for a model connection needs the editor, so 待我处理 lists it instead.
 */
const IN_PROGRESS: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-running', 'review-running', 'dialogue-answering', 'analysis-cancelling',
  'analysis-queued', 'analysis-waiting-capacity', 'analysis-waiting-slot', 'analysis-waiting-idle', 'analysis-waiting-network', 'analysis-waiting-admission']);
export function taskInProgress(state: GlobalAttentionStateKey): boolean {
  return IN_PROGRESS.has(state);
}
/** A finished or ended task: no Run to cancel, a result or a record to read, and a new task to start. */
const ENDED_AGAIN: ReadonlySet<GlobalAttentionStateKey> = new Set(['analysis-failed', 'analysis-interrupted', 'analysis-orphaned', 'review-failed', 'review-stopped', 'analysis-budget-reached']);

function pageGroup(item: TaskOverviewItemProjection): TaskPageGroup {
  const state = item.attention.state;
  if (RUNNING.has(state)) return 'running';
  if (STOPPED.has(state) || state === 'dialogue-stopped' && !item.attention.facts.dialogueCancelled) return 'stopped';
  if (item.state === 'queued') return 'queued';
  if (item.state === 'completed' || item.state === 'cancelled' || item.state === 'stopped') return 'recent';
  if (item.attention.group === 'exceptions' || item.attention.group === 'decisions' || item.state === 'waiting') return 'pending';
  return item.state === 'running' ? 'running' : item.state === 'paused' ? 'stopped' : 'recent';
}

function clock(at: string): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function line(item: TaskOverviewItemProjection, group: TaskPageGroup): string {
  const state = item.attention.state;
  if (state === 'analysis-running' || state === 'review-running') {
    // Ordinary mode reads a share of the work, never the reading ranges counted (Issue #1431 item 106).
    return item.progress === null ? '正在处理稿件。' : `${technicalWords(`已完成 ${item.progress.done} / ${item.progress.total} 个阅读范围`, `已完成约 ${item.progress.total === 0 ? 0 : Math.floor((item.progress.done / item.progress.total) * 100)}%`)}${!technicalLayerVisible || item.progress.elapsedMs === null ? '' : `，已用时 ${Math.floor(item.progress.elapsedMs / 60000)} 分钟`}${item.progress.modelWaiting ? '，等待模型回答' : ''}。`;
  }
  if (group === 'queued' && item.queuePosition !== null) return `第 ${item.queuePosition} 位 · 前面 ${item.queuePosition - 1} 项${item.eta === null ? '' : ` · 预计 ≈ ${Math.ceil(item.eta / 60000)} 分钟后开始`}`;
  // Only the editor's own pause says 「你」: a pause AI7 made at its close, an interruption or a yield say why in the record's words.
  // A 继续 the service refused says why first, in its own sentence.
  if (group === 'stopped' && item.attention.facts.resumeFailure !== undefined) return serviceWords(item.attention.facts.resumeFailure);
  if (state === 'analysis-paused' && item.attention.facts.stopReason === undefined) return `你在 ${clock(item.at)} 暂停；继续时接着处理。`;
  if (item.state === 'cancelled') return `已取消 · ${item.result ? '保留已有结果' : '没有形成结果'}`;
  return globalAttentionReason(item.attention);
}

function actions(item: TaskOverviewItemProjection, relaunch: boolean): TaskCardActionView[] {
  const state = item.attention.state;
  const redo: TaskCardActionView[] = relaunch ? [{ action: 'redo', label: TASK_BAR_REDO }] : [];
  const cancel: TaskCardActionView = { action: 'cancel', label: TASK_BAR_CANCEL_RUN };
  const resume: TaskCardActionView = { action: 'resume', label: TASK_BAR_RESUME };
  const unconfirmed: TaskCardActionView = { action: 'unconfirmed', label: TASK_BAR_VIEW_UNCONFIRMED };
  const result: TaskCardActionView = { action: 'result', label: '查看结果' };
  const next: TaskCardActionView = { action: 'next', label: globalAttentionNextStepLine(item.nextAction) };
  switch (state) {
    case 'analysis-running': case 'review-running': case 'dialogue-answering':
      return [{ action: 'pause', label: '暂停' }, cancel];
    case 'analysis-cancelling': case 'analysis-pausing':
      return [];
    case 'analysis-paused': case 'analysis-yielded':
      return [resume, ...redo, cancel];
    case 'analysis-resumable': {
      const reason = item.attention.facts.stopReason;
      if (reason === 'outcome-unknown') return [unconfirmed, cancel];
      return [...(reason === 'proxy-unreachable' || reason === 'model-service-unreachable' ? [{ action: 'proxy', label: TASK_BAR_PROXY_SETTINGS } as const] : []), resume, ...redo, cancel];
    }
    case 'review-continuable':
      return [resume, ...redo, cancel];
    case 'analysis-account-limit':
      return [resume, ...redo, cancel];
    case 'analysis-outcome-unknown':
      return [unconfirmed, cancel];
    case 'analysis-outcome-unconfirmed':
      return [unconfirmed, ...redo];
    case 'analysis-clarification':
      return [{ action: 'answer', label: '回答' }, ...redo, cancel];
    case 'analysis-blocked': case 'analysis-plan-moved':
      return [...redo, cancel];
    case 'analysis-plan-revision': case 'analysis-prepared': case 'review-prepared':
      return [next];
    case 'draft-unfinished':
      return [{ action: 'answer', label: '继续编辑草稿' }];
    case 'dialogue-stopped':
      return item.attention.facts.dialogueCancelled ? [result, { action: 'again', label: DIALOGUE_ACTIONS.regenerate }]
        : [resume, { action: 'again', label: DIALOGUE_ACTIONS.regenerate }];
    case 'dialogue-answered': case 'dialogue-interrupted': case 'dialogue-failed':
      return [result, { action: 'again', label: DIALOGUE_ACTIONS.regenerate }];
    default:
      if (item.state === 'queued') return [...(item.queuePosition !== null ? [{ action: 'up', label: '上移' } as const, { action: 'top', label: '置顶' } as const] : []), cancel];
      if (state === 'analysis-queued') return [cancel];
      if (ENDED_AGAIN.has(state)) return redo.length > 0 ? redo : [{ action: 'run', label: '查看运行' }];
      if (item.state === 'completed' || item.state === 'cancelled' || item.state === 'stopped') return [result, ...redo];
      return [next];
  }
}

export function taskCardView(item: TaskOverviewItemProjection, relaunch = false): TaskCardView {
  const group = pageGroup(item);
  const state = item.attention.state;
  return {
    pageGroup: group,
    panelGroup: group === 'pending' ? 'pending' : group === 'recent' ? 'recent' : 'active',
    pill: globalAttentionStateLabel(item.attention),
    line: line(item, group),
    actions: [...actions(item, relaunch), ...(item.selection && state !== 'analysis-cancelling' && state !== 'analysis-pausing' ? [{ action: 'jump', label: '跳到所选文字' } as const] : [])],
    cancelInOnePress: WAIT_CANCELLED.has(state) || item.target.kind === 'dialogue',
  };
}
