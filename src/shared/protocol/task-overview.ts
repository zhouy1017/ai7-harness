import type { GlobalAttentionItemProjection, GlobalAttentionNextStep, GlobalAttentionTarget } from '../protocol.js';
import type { TaskPlanKind, TaskPlanProjection, TaskWorkProjection } from './task-plan.js';

// ---- ① 任务面 (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044, TASK-045) --------------------

/**
 * The three groups of a Book's 任务 panel, in their one fixed order (V2-UX-TASK-044): 等你处理 · 进行中 · 最近完成. They are
 * 待我处理's groups for this Book's Tasks: 等你处理 holds its 异常与结果待确认 and 等待你的决定, 进行中 its 运行中与已暂停.
 */
export type BookTaskGroupKey = 'waiting' | 'running' | 'recent';

export const BOOK_TASK_GROUP_KEYS: readonly BookTaskGroupKey[] = ['waiting', 'running', 'recent'];

/** How many finished Tasks 最近完成 lists, newest first; the panel has no age limit. */
export const BOOK_TASK_RECENT_LIMIT = 10;

/** What a finished Task's `查看结果` opens (V2-UX-TASK-045): the result it formed, read as its own screen reads it. */
export type BookTaskResultRef =
  | { kind: 'analysis-revision'; revisionId: string }
  | { kind: 'review-run'; reviewRunId: string }
  // A dialogue Task's `回答` (Issue #52, S17a; TASK-044): its latest answer, read from the Harness Session Ledger.
  | { kind: 'dialogue'; dialogueId: string };

/** One Task of the Book as the panel shows it: 待我处理's item for it, and the result `查看结果` opens. */
export interface BookTaskItemProjection {
  item: GlobalAttentionItemProjection;
  /** `null` for a Task that formed no result — a Run that stopped before it read anything. */
  result: BookTaskResultRef | null;
  /**
   * The paragraphs a selection Task was started on, by block identity — the first and the last — in the manuscript named
   * (Issue #423, S77 deferred item d): the card's `跳到所选文字` moves the caret there, or says the paragraph is gone. Absent for
   * every other Task.
   */
  selection?: { manuscriptId: string; fromBlockId: string; toBlockId: string };
  /** 用时 and, once ended, requests and model (Issue #1670): the same reading the plan and the 任务 overview row carry. */
  work?: TaskWorkProjection | null;
}

export interface BookTaskGroupProjection {
  key: BookTaskGroupKey;
  items: ReadonlyArray<BookTaskItemProjection>;
  /** How many Tasks the group holds; more than `items` when the group is longer than one answer lists. */
  total: number;
}

/**
 * The Book's 任务 panel (editor-surfaces §1 任务面; V2-UX-TASK-044): its Tasks — baseline analysis and 审阅 — in the three
 * groups. A read: it records, claims and terminalizes nothing, as 待我处理 does not. The panel lists only this Book's Tasks;
 * work across Books stays in 待我处理.
 */
export interface BookTasksProjection {
  bookId: string;
  /** Always the three groups, in the fixed order. */
  groups: ReadonlyArray<BookTaskGroupProjection>;
  /** A Run of this Book is in flight, a Review Run is being driven, or a Run waits to start: the panel follows it. */
  running: boolean;
  /** Snapshot-pinned pages retain every card field when a group exceeds the reply budget. */
  readonly listPages?: TaskPlanProjection['listPages'];
}

// ---- 任务总览 (Issue #1328, T1 rev 2) ---------------------------------------------------------------

export type TaskOverviewGroupKey = 'running' | 'queued' | 'waiting' | 'paused' | 'recent';

export interface TaskOverviewProgressProjection {
  readonly done: number;
  readonly total: number;
  readonly currentUnitLabel: string | null;
  readonly elapsedMs: number | null;
  readonly modelWaiting: boolean;
}

export interface TaskOverviewItemProjection {
  readonly itemId: string;
  readonly bookId: string | null;
  readonly bookTitle: string | null;
  readonly taskKind: string;
  readonly label: string;
  readonly at: string;
  readonly detail: string | null;
  readonly attention: GlobalAttentionItemProjection;
  readonly selection: BookTaskItemProjection['selection'] | null;
  readonly plan: { readonly kind: TaskPlanKind; readonly ref: string | null } | null;
  readonly result: BookTaskResultRef | null;
  readonly state: 'running' | 'queued' | 'waiting' | 'paused' | 'completed' | 'cancelled' | 'stopped';
  readonly progress: TaskOverviewProgressProjection | null;
  readonly queuePosition: number | null;
  /** An estimate is deliberately absent until an owner can provide authoritative timing data. */
  readonly eta: number | null;
  readonly usage: { readonly calls: number; readonly elapsed: number } | null;
  readonly nextAction: GlobalAttentionNextStep;
  readonly runRecordId: string | null;
  readonly target: GlobalAttentionTarget;
  /** 用时 and, once ended, requests and model (Issue #1670); `null` for a Task with no Run. */
  readonly work?: TaskWorkProjection | null;
}

export interface TaskOverviewGroupProjection {
  readonly key: TaskOverviewGroupKey;
  readonly items: ReadonlyArray<TaskOverviewItemProjection>;
  readonly total: number;
}

export interface TaskOverviewProjection {
  readonly quickStarts?: ReadonlyArray<{ readonly bookId: string; readonly procedureId: string; readonly label: string }>;
  readonly groups: ReadonlyArray<TaskOverviewGroupProjection>;
  readonly capacity: number;
  readonly queueFrozen: boolean;
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly actionableCount: number;
}
