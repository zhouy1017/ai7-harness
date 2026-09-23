import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  GLOBAL_ATTENTION_COUNTED_GROUPS,
  GLOBAL_ATTENTION_GROUP_KEYS,
  GLOBAL_ATTENTION_GROUP_LIMIT,
  GLOBAL_ATTENTION_RECENT_DAYS,
  GLOBAL_ATTENTION_RECENT_LIMIT,
  type BaselineAnalysisRunState,
  type BaselineAnalysisTaskMode,
  type GlobalAttentionFactsProjection,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionNextStep,
  type GlobalAttentionObjectProjection,
  type GlobalAttentionProjection,
  type GlobalAttentionStateKey,
  type GlobalAttentionTarget,
  type ProposalConflictKind,
  type ReviewRunCategoryState,
  type ReviewRunState,
} from '../shared/protocol.js';
import type { RunProgress } from './analysis/baseline-analysis-store.js';
import { REVIEW_RUN_CATEGORY_STATE_LABELS } from './review/review-run-state.js';

/**
 * 待我处理 (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001 to 009, IA-007): the one place
 * the readings every owner takes of its own records become the four groups. The owners read — the import
 * and recovery relations here, the baseline ledger and the Review Run ledger in their own modules — and
 * nothing in this file or in those readings writes, claims or terminalizes anything (V2-UX-ATTN-008): a Run
 * a stopped service left executing is *read* as stopped, never recorded so.
 *
 * The Manuscript Conflicts are read by `proposal-conflicts.ts`, their owner.
 *
 * Composition is pure, so the grouping, the ordering, the bounds and the count are pinned by the unit suite
 * without a store. An item resolves by itself when its record moves on: only the Book's latest Task of a
 * kind is read for anything but a completion, so a newer Task of the same kind settles an older one's
 * item; a decision made removes its Plan Revision; a completion ages out after the recent window.
 */

type SqlRow = Record<string, SQLOutputValue>;

/**
 * The most records of one kind a read considers: every reading filters in SQL to the records that could need
 * the editor, and stops here, so one answer stays one bounded read whatever the library holds. The groups
 * list fewer still (`GLOBAL_ATTENTION_GROUP_LIMIT`, `GLOBAL_ATTENTION_RECENT_LIMIT`).
 */
export const GLOBAL_ATTENTION_READ_LIMIT = 500;

export class GlobalAttentionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GlobalAttentionError';
  }
}

// ---- the readings each owner takes of its own records --------------------------------------------------

/** An import whose commit outcome local evidence cannot prove, or whose abandonment cleanup is pending. */
export interface ImportAttentionReading {
  readonly kind: 'outcome-uncertain' | 'cleanup-pending';
  readonly draftId: string;
  readonly commitAttemptId: string | null;
  /** When the state began: the attempt turned uncertain, or the abandonment was requested. */
  readonly at: string;
  readonly sourceDisplayName: string;
  readonly relationship: 'first-manuscript' | 'source-only' | 'reimport' | null;
  /** The reviewed target: an existing Book, the title of a new one, or none. */
  readonly book: { readonly bookId: string | null; readonly title: string | null };
}

/** A Recovery Attention State that is pending or was deferred (稍后处理). */
export interface RecoveryAttentionReading {
  readonly attentionId: string;
  readonly attentionVersion: number;
  readonly status: 'pending' | 'deferred';
  readonly createdAt: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly branchName: string;
}

/**
 * A 修改建议 in conflict with the manuscript and not yet resolved (V2-UX-ATTN-002), read by `proposal-conflicts.ts`:
 * its own words changed while it was open (`suggestion`), or after its Apply (`reversal`).
 */
export interface ConflictAttentionReading {
  readonly markId: string;
  readonly conflictKind: ProposalConflictKind;
  /** When 暂不处理 was last recorded for it; `null` before any. */
  readonly deferredAt: string | null;
  /** When the suggestion last moved: its words drifting is what made it a conflict. */
  readonly updatedAt: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly manuscriptId: string;
  readonly branchId: string;
}

/** The Book's latest baseline analysis Task, read by the baseline ledger. */
export interface AnalysisTaskAttentionReading {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly taskIntentId: string;
  readonly mode: BaselineAnalysisTaskMode;
  readonly createdAt: string;
  readonly run: null | {
    readonly runRecordId: string;
    readonly state: BaselineAnalysisRunState;
    /** When the Run's last recorded state was recorded. */
    readonly stateAt: string;
    /** When the Run was recorded. */
    readonly recordedAt: string;
    /** The execution owner's reading while the Run is in flight; `null` when nothing executes it. */
    readonly progress: RunProgress | null;
    /** The first question the Run asked that still waits for the editor's answer (Issue #422, S76d); `null` when none. */
    readonly openClarification?: null | { readonly requestId: string; readonly unitOrdinal: number; readonly raisedAt: string };
    /** An interrupted Run the Run Budget Ceiling stopped (Issue #51, S16a): 已停止 · 预算已达上限. */
    readonly budgetReached?: boolean;
  };
  /** A prepared Task's pending Plan Revision that 重新确认计划 settles; `null` otherwise. */
  readonly planRevision: null | {
    /** `null` for a difference the ledger has not recorded yet: it is detected by the read. */
    readonly planRevisionId: string | null;
    /** When it was detected — or, for one not recorded yet, when the plan version it supersedes froze. */
    readonly at: string;
    readonly priorOrdinal: number;
    readonly changedFields: ReadonlyArray<string>;
  };
}

/** One completed baseline Task Outcome of the recent window. */
export interface AnalysisOutcomeAttentionReading {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly taskIntentId: string;
  readonly mode: BaselineAnalysisTaskMode;
  readonly outcomeId: string;
  readonly runRecordId: string;
  readonly classification: 'completed' | 'completed-with-gaps';
  readonly recordedAt: string;
  readonly revisionId: string | null;
  readonly revisionOrdinal: number | null;
}

/** One Review Run as the Review Run ledger reads it: the Book's latest, or one that completed recently. */
export interface ReviewRunAttentionReading {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly reviewRunId: string;
  readonly ordinal: number;
  readonly createdAt: string;
  readonly authorizedAt: string | null;
  readonly state: ReviewRunState;
  readonly canContinue: boolean;
  readonly categories: ReadonlyArray<{
    readonly categoryId: string;
    readonly label: string;
    readonly state: ReviewRunCategoryState;
    /** The category has no terminal event yet: 继续审阅 would take it up. */
    readonly pending: boolean;
    readonly detail: string | null;
    /** The execution owner's reading of the category's Run while it is in flight. */
    readonly progress: RunProgress | null;
  }>;
  /** When the Run's last category event was recorded; `null` before any. */
  readonly lastEventAt: string | null;
}

export interface GlobalAttentionReadings {
  readonly imports: ReadonlyArray<ImportAttentionReading>;
  readonly recoveries: ReadonlyArray<RecoveryAttentionReading>;
  readonly conflicts: ReadonlyArray<ConflictAttentionReading>;
  readonly analysisTasks: ReadonlyArray<AnalysisTaskAttentionReading>;
  readonly analysisOutcomes: ReadonlyArray<AnalysisOutcomeAttentionReading>;
  /** Each Book's latest Review Run. */
  readonly reviewRuns: ReadonlyArray<ReviewRunAttentionReading>;
  /** The Review Runs that reached the manuscript in every category within the recent window. */
  readonly reviewCompletions: ReadonlyArray<ReviewRunAttentionReading>;
  /** Whether a Run holds the execution owner's one slot now. */
  readonly busy: boolean;
}

/** The instant the recent window opens, for a reader that filters in SQL. */
export function recentWindowStart(now: Date): string {
  return new Date(now.getTime() - GLOBAL_ATTENTION_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---- composition ---------------------------------------------------------------------------------------

const ACTIVE_RUN_STATES: ReadonlySet<BaselineAnalysisRunState> = new Set(['authorized', 'admitted', 'executing', 'cancelling', 'pausing']);

function item(
  group: GlobalAttentionGroupKey,
  state: GlobalAttentionStateKey,
  fields: {
    itemId: string;
    blocked: boolean;
    at: string;
    book: GlobalAttentionItemProjection['book'];
    object: GlobalAttentionObjectProjection;
    facts?: Partial<GlobalAttentionFactsProjection>;
    nextStep: GlobalAttentionNextStep;
    target: GlobalAttentionTarget;
    technical: GlobalAttentionItemProjection['technical'];
  },
): GlobalAttentionItemProjection {
  return {
    itemId: fields.itemId,
    group,
    state,
    blocked: fields.blocked,
    at: fields.at,
    book: fields.book,
    object: fields.object,
    facts: {
      progress: fields.facts?.progress ?? null,
      categories: fields.facts?.categories ?? [],
      revisionOrdinal: fields.facts?.revisionOrdinal ?? null,
    },
    nextStep: fields.nextStep,
    target: fields.target,
    technical: fields.technical,
  };
}

function progressFact(progress: RunProgress | null): GlobalAttentionFactsProjection['progress'] {
  return progress === null ? null : { stage: progress.stage, unitsSettled: progress.unitsSettled, unitsTotal: progress.unitsTotal };
}

function importItem(reading: ImportAttentionReading): GlobalAttentionItemProjection {
  const uncertain = reading.kind === 'outcome-uncertain';
  return item('exceptions', uncertain ? 'import-outcome-uncertain' : 'import-cleanup-pending', {
    itemId: `import:${reading.draftId}`,
    // Either state stops the import where it stands: retry, abandonment and cleanup wait for the proof;
    // continuing and every new authoritative reference wait for the cleanup.
    blocked: true,
    at: reading.at,
    book: reading.book,
    object: { kind: 'import', sourceDisplayName: reading.sourceDisplayName, relationship: reading.relationship },
    nextStep: uncertain ? 'await-local-check' : 'retry-abandon-cleanup',
    target: { kind: 'import-recovery', draftId: reading.draftId },
    technical: [
      { key: 'import-draft', label: '导入草稿', value: reading.draftId },
      ...(reading.commitAttemptId === null ? [] : [{ key: 'commit-attempt', label: '提交尝试', value: reading.commitAttemptId }]),
      { key: 'state-at', label: '状态开始时间', value: reading.at },
    ],
  });
}

function recoveryItem(reading: RecoveryAttentionReading): GlobalAttentionItemProjection {
  return item('exceptions', reading.status === 'pending' ? 'recovery-pending' : 'recovery-deferred', {
    itemId: `recovery:${reading.attentionId}`,
    // Ordinary editing of the branch stays read-only until the editor decides at the comparison.
    blocked: true,
    at: reading.createdAt,
    book: { bookId: reading.bookId, title: reading.bookTitle },
    object: { kind: 'recovery', branchName: reading.branchName },
    nextStep: 'return-to-recovery',
    target: { kind: 'manuscript-recovery', attentionId: reading.attentionId },
    technical: [
      { key: 'recovery-attention', label: '恢复待确认状态', value: `${reading.attentionId} · 版本 ${reading.attentionVersion}` },
      { key: 'manuscript', label: '稿件', value: reading.manuscriptId },
      { key: 'branch', label: '分支', value: reading.branchId },
      { key: 'state-at', label: '状态开始时间', value: reading.createdAt },
    ],
  });
}

/**
 * A Manuscript Conflict (V2-UX-ATTN-002, ADR 0085): the suggestion cannot be accepted or applied — nor its Apply
 * reversed — until the conflict is resolved, so it blocks; 暂不处理 records the conflict and leaves it standing.
 */
function conflictItem(reading: ConflictAttentionReading): GlobalAttentionItemProjection {
  const deferred = reading.deferredAt !== null;
  const at = reading.deferredAt ?? reading.updatedAt;
  return item('exceptions', deferred ? 'manuscript-conflict-deferred' : 'manuscript-conflict', {
    itemId: `conflict:${reading.markId}`,
    blocked: true,
    at,
    book: { bookId: reading.bookId, title: reading.bookTitle },
    object: { kind: 'manuscript-conflict', conflictKind: reading.conflictKind },
    nextStep: 'resolve-conflict',
    target: { kind: 'manuscript-conflict', bookId: reading.bookId, manuscriptId: reading.manuscriptId, branchId: reading.branchId, markId: reading.markId },
    technical: [
      { key: 'mark', label: '修改建议', value: reading.markId },
      { key: 'conflict-kind', label: '冲突类型', value: reading.conflictKind },
      { key: 'manuscript', label: '稿件', value: reading.manuscriptId },
      { key: 'branch', label: '分支', value: reading.branchId },
      { key: 'state-at', label: '状态开始时间', value: at },
    ],
  });
}

/** The analysis Task's item, if its latest state asks for one; a settled Run is 最近完成's, read from its outcome. */
function analysisTaskItem(reading: AnalysisTaskAttentionReading): GlobalAttentionItemProjection | null {
  const book = { bookId: reading.bookId, title: reading.bookTitle };
  const object: GlobalAttentionObjectProjection = { kind: 'analysis', mode: reading.mode };
  const target: GlobalAttentionTarget = { kind: 'analysis', bookId: reading.bookId, taskIntentId: reading.taskIntentId };
  const run = reading.run;
  if (run === null) {
    const revision = reading.planRevision;
    if (revision === null) return null;
    return item('decisions', 'analysis-plan-revision', {
      itemId: `analysis:${reading.taskIntentId}`,
      // The plan cannot start until the decision is made (AUTH-006).
      blocked: true,
      at: revision.at,
      book,
      object,
      nextStep: 'reconfirm-plan',
      target: { kind: 'analysis-plan', bookId: reading.bookId, taskIntentId: reading.taskIntentId },
      technical: [
        { key: 'task-intent', label: '任务意图', value: reading.taskIntentId },
        { key: 'plan-revision', label: '计划修订', value: `${revision.planRevisionId ?? '计划读取时发现，尚未记录'} · 计划版本 ${revision.priorOrdinal} · ${revision.changedFields.join('、')}` },
        { key: 'state-at', label: '状态开始时间', value: revision.at },
      ],
    });
  }
  const technical = [
    { key: 'task-intent', label: '任务意图', value: reading.taskIntentId },
    { key: 'run-record', label: '运行记录', value: `${run.runRecordId} · ${run.state}` },
    { key: 'state-at', label: '状态记录时间', value: run.stateAt },
  ];
  const itemId = `analysis:${reading.taskIntentId}`;
  // A question the Run asked that waits for the editor (Issue #422, S76d; ATTN-003): a named decision in 等待你的决定,
  // counted, and blocking when the Run itself waits for it. It opens the plan, where the card is answered.
  const asked = run.openClarification ?? null;
  if (asked !== null) {
    return item('decisions', 'analysis-clarification', {
      itemId,
      blocked: run.state === 'awaiting-clarification',
      at: asked.raisedAt,
      book,
      object,
      ...(run.progress === null ? {} : { facts: { progress: progressFact(run.progress) } }),
      nextStep: 'answer-clarification',
      target: { kind: 'analysis-plan', bookId: reading.bookId, taskIntentId: reading.taskIntentId },
      technical: [...technical, { key: 'clarification', label: '澄清请求', value: `${asked.requestId} · 第 ${asked.unitOrdinal} 个阅读范围` }],
    });
  }
  if (ACTIVE_RUN_STATES.has(run.state)) {
    if (run.progress !== null) {
      // 正在取消 stays visible wherever the editor looks until the Run has stopped (Issue #422, CTRL-005).
      const state = run.state === 'executing' ? 'analysis-running'
        : run.state === 'cancelling' ? 'analysis-cancelling'
          : run.state === 'pausing' ? 'analysis-pausing' : 'analysis-queued';
      return item('active', state, {
        itemId, blocked: false, at: run.recordedAt, book, object, facts: { progress: progressFact(run.progress) }, nextStep: 'view-run', target, technical,
      });
    }
    // Nothing executes it: the service stopped while it ran. It is read as stopped and left exactly as
    // recorded — terminalizing it is not a read's to do — and it keeps the Book from a new update Task.
    return item('exceptions', 'analysis-orphaned', { itemId, blocked: true, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
  }
  switch (run.state) {
    case 'failed':
      return item('exceptions', 'analysis-failed', { itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    case 'interrupted':
      // 已停止 · 预算已达上限 (Issue #51, S16a; MODEL-016, MODEL-017): the way on is the plan's 调整预算并重做.
      if (run.budgetReached === true) {
        return item('exceptions', 'analysis-budget-reached', {
          itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'adjust-budget-redo',
          target: { kind: 'analysis-plan', bookId: reading.bookId, taskIntentId: reading.taskIntentId }, technical,
        });
      }
      return item('exceptions', 'analysis-interrupted', { itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    case 'blocked-before-dispatch':
      return item('exceptions', 'analysis-blocked', { itemId, blocked: true, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    // 运行中与已暂停 (Issue #422, S76b): a paused Run, and one AI7 stopped under, wait for the editor's 续行 or 取消任务.
    case 'paused':
      return item('active', 'analysis-paused', { itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    case 'resumable':
      return item('active', 'analysis-resumable', { itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    // Answered, and waiting its turn in the slot to go on (Issue #422, S76d).
    case 'awaiting-clarification':
      return item('active', 'analysis-queued', { itemId, blocked: false, at: run.stateAt, book, object, nextStep: 'view-run', target, technical });
    default:
      return null;
  }
}

function analysisOutcomeItem(reading: AnalysisOutcomeAttentionReading): GlobalAttentionItemProjection {
  return item('recent', reading.classification === 'completed' ? 'analysis-completed' : 'analysis-completed-with-gaps', {
    itemId: `analysis-outcome:${reading.outcomeId}`,
    blocked: false,
    at: reading.recordedAt,
    book: { bookId: reading.bookId, title: reading.bookTitle },
    object: { kind: 'analysis', mode: reading.mode },
    facts: { revisionOrdinal: reading.revisionOrdinal },
    nextStep: 'view-run',
    target: { kind: 'analysis', bookId: reading.bookId, taskIntentId: reading.taskIntentId },
    technical: [
      { key: 'task-outcome', label: '任务结果', value: `${reading.outcomeId} · ${reading.classification}` },
      { key: 'run-record', label: '运行记录', value: reading.runRecordId },
      ...(reading.revisionId === null ? [] : [{ key: 'result-set-revision', label: '结果集修订版', value: reading.revisionId }]),
      { key: 'completed-at', label: '完成时间', value: reading.recordedAt },
    ],
  });
}

const STOPPED_CATEGORY_STATES: ReadonlySet<ReviewRunCategoryState> = new Set(['failed', 'interrupted', 'refused']);

function categoryFact(category: ReviewRunAttentionReading['categories'][number]): GlobalAttentionFactsProjection['categories'][number] {
  return { label: category.label, state: category.state, stateLabel: REVIEW_RUN_CATEGORY_STATE_LABELS[category.state], detail: category.detail };
}

function reviewTechnical(reading: ReviewRunAttentionReading, at: string): GlobalAttentionItemProjection['technical'] {
  return [
    { key: 'review-run', label: '审阅记录', value: `${reading.reviewRunId} · 第 ${reading.ordinal} 次 · ${reading.state}` },
    ...(reading.authorizedAt === null ? [] : [{ key: 'authorized-at', label: '开始时间', value: reading.authorizedAt }]),
    { key: 'state-at', label: '状态记录时间', value: at },
  ];
}

/** The Book's latest Review Run's item, if its state asks for one; a Run that reached the manuscript is 最近完成's. */
function reviewRunItem(reading: ReviewRunAttentionReading): GlobalAttentionItemProjection | null {
  const book = { bookId: reading.bookId, title: reading.bookTitle };
  const object: GlobalAttentionObjectProjection = { kind: 'review', ordinal: reading.ordinal };
  const target: GlobalAttentionTarget = { kind: 'review', bookId: reading.bookId, reviewRunId: reading.reviewRunId };
  const itemId = `review:${reading.reviewRunId}`;
  const started = reading.authorizedAt ?? reading.createdAt;
  if (reading.state === 'running') {
    const current = reading.categories.find((category) => category.state === 'running') ??
      reading.categories.find((category) => category.pending) ?? null;
    return item('active', 'review-running', {
      itemId, blocked: false, at: started, book, object,
      facts: { categories: current === null ? [] : [categoryFact(current)], progress: progressFact(current?.progress ?? null) },
      nextStep: 'view-review', target, technical: reviewTechnical(reading, started),
    });
  }
  if (reading.state === 'partial' && reading.canContinue) {
    // Stopped mid-way by a service that stopped; 继续审阅 goes on where it stopped, with the first category
    // left. It is never said to be 已暂停: no pause exists yet, so nothing here claims one.
    const next = reading.categories.find((category) => category.pending) ?? null;
    return item('active', 'review-continuable', {
      itemId, blocked: false, at: started, book, object,
      facts: { categories: next === null ? [] : [categoryFact(next)] },
      nextStep: 'continue-review', target, technical: reviewTechnical(reading, started),
    });
  }
  if (reading.state === 'failed' || (reading.state === 'partial' && !reading.canContinue)) {
    // Every category is finished and at least one never reached the manuscript: it failed, was interrupted,
    // or could not start. Nothing can continue it; a new 审阅 is the way on.
    const at = reading.lastEventAt ?? started;
    return item('exceptions', reading.state === 'failed' ? 'review-failed' : 'review-stopped', {
      itemId, blocked: false, at, book, object,
      facts: { categories: reading.categories.filter((category) => !category.pending && STOPPED_CATEGORY_STATES.has(category.state)).map(categoryFact) },
      nextStep: 'view-review', target, technical: reviewTechnical(reading, at),
    });
  }
  return null;
}

function reviewCompletionItem(reading: ReviewRunAttentionReading): GlobalAttentionItemProjection {
  const at = reading.lastEventAt ?? reading.authorizedAt ?? reading.createdAt;
  return item('recent', 'review-completed', {
    itemId: `review:${reading.reviewRunId}`,
    blocked: false,
    at,
    book: { bookId: reading.bookId, title: reading.bookTitle },
    object: { kind: 'review', ordinal: reading.ordinal },
    facts: { categories: reading.categories.map(categoryFact) },
    nextStep: 'view-review',
    target: { kind: 'review', bookId: reading.bookId, reviewRunId: reading.reviewRunId },
    technical: reviewTechnical(reading, at),
  });
}

// ---- ordering ------------------------------------------------------------------------------------------

/** Code-point order, the same on every host; a missing title sorts first. */
function compareText(left: string | null, right: string | null): number {
  const a = left ?? '';
  const b = right ?? '';
  return a < b ? -1 : a > b ? 1 : 0;
}

function tieBreak(left: GlobalAttentionItemProjection, right: GlobalAttentionItemProjection): number {
  return compareText(left.book.title, right.book.title) || compareText(left.itemId, right.itemId);
}

/**
 * One group in its order (interaction-spec › Ordering and naming): blocked work first, then the oldest
 * first; 运行中与已暂停 keeps each Book's items together; 最近完成 lists the newest first. Ties fall to the
 * Book's title, then to the record's identity, so two reads of the same records order them the same way.
 */
export function orderGlobalAttentionItems(
  group: GlobalAttentionGroupKey,
  items: ReadonlyArray<GlobalAttentionItemProjection>,
): GlobalAttentionItemProjection[] {
  const sorted = [...items];
  if (group === 'recent') {
    sorted.sort((left, right) => compareText(right.at, left.at) || tieBreak(left, right));
    return sorted;
  }
  const blockedFirst = (left: GlobalAttentionItemProjection, right: GlobalAttentionItemProjection): number =>
    Number(right.blocked) - Number(left.blocked) || compareText(left.at, right.at) || tieBreak(left, right);
  if (group === 'active') {
    sorted.sort((left, right) =>
      compareText(left.book.title, right.book.title) || compareText(left.book.bookId, right.book.bookId) || blockedFirst(left, right));
    return sorted;
  }
  sorted.sort(blockedFirst);
  return sorted;
}

/**
 * The four groups from the owners' readings (V2-UX-ATTN-001 to 007). Each group is ordered, then bounded —
 * 最近完成 to the completions of the last `GLOBAL_ATTENTION_RECENT_DAYS` days and at most
 * `GLOBAL_ATTENTION_RECENT_LIMIT`, every other group to `GLOBAL_ATTENTION_GROUP_LIMIT` — while each group's
 * `total` and the count keep every item, listed or not. The count is the first two groups' and nothing else.
 */
export function composeGlobalAttention(readings: GlobalAttentionReadings, now: Date): GlobalAttentionProjection {
  const since = recentWindowStart(now);
  const all: GlobalAttentionItemProjection[] = [
    ...readings.imports.map(importItem),
    ...readings.recoveries.map(recoveryItem),
    ...readings.conflicts.map(conflictItem),
    ...readings.analysisTasks.flatMap((reading) => analysisTaskItem(reading) ?? []),
    ...readings.analysisOutcomes.filter((reading) => reading.recordedAt >= since).map(analysisOutcomeItem),
    ...readings.reviewRuns.flatMap((reading) => reviewRunItem(reading) ?? []),
    ...readings.reviewCompletions
      .filter((reading) => reading.state === 'settled' && (reading.lastEventAt ?? '') >= since)
      .map(reviewCompletionItem),
  ];
  // One record is one item: a Review Run read both as a Book's latest and as a completion is listed once.
  const unique = Array.from(new Map(all.map((entry) => [`${entry.group}\n${entry.itemId}`, entry] as const)).values());
  const groups = GLOBAL_ATTENTION_GROUP_KEYS.map((key) => {
    const ordered = orderGlobalAttentionItems(key, unique.filter((entry) => entry.group === key));
    const limit = key === 'recent' ? GLOBAL_ATTENTION_RECENT_LIMIT : GLOBAL_ATTENTION_GROUP_LIMIT;
    return { key, items: ordered.slice(0, limit), total: ordered.length };
  });
  return {
    groups,
    actionableCount: groups.filter((group) => GLOBAL_ATTENTION_COUNTED_GROUPS.includes(group.key)).reduce((sum, group) => sum + group.total, 0),
    // A Run holds the slot, or a Review Run is being driven — between two categories it holds none.
    running: readings.busy || readings.reviewRuns.some((reading) => reading.state === 'running'),
  };
}

// ---- the import and recovery relations, read as they stand -----------------------------------------------

function invalid(): GlobalAttentionError {
  return new GlobalAttentionError('GLOBAL_ATTENTION_RECORD_INVALID', '待我处理读取的记录无效。');
}

function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw invalid();
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

function integer(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalid();
  return value;
}

function relationshipOf(value: string | null): ImportAttentionReading['relationship'] {
  if (value === 'first-manuscript' || value === 'new-book-first-manuscript') return 'first-manuscript';
  if (value === 'source-only') return 'source-only';
  if (value === 'reimport') return 'reimport';
  return null;
}

function importBookOf(row: SqlRow): ImportAttentionReading['book'] {
  const existing = nullableText(row.reviewed_existing_book_id);
  if (nullableText(row.reviewed_target_kind) === 'existing-book' && existing !== null) {
    return { bookId: existing, title: nullableText(row.existing_title) };
  }
  return { bookId: null, title: nullableText(row.reviewed_title) };
}

/**
 * The imports 待我处理 names: an attempt already recorded `uncertain`, and a persisted abandonment whose
 * cleanup is not finished. A `prepared` attempt is one in flight, or one the next startup reconciles; its
 * reconciliation writes, so it is never attempted here. An ordinary unfinished draft is left out: startup
 * already routes to it.
 */
export function readImportAttention(db: DatabaseSync, limit: number): ImportAttentionReading[] {
  const uncertain = (db.prepare(
    `SELECT a.attempt_id, a.draft_id, a.uncertain_at, d.display_name, d.reviewed_title, d.reviewed_target_kind,
            d.reviewed_existing_book_id, d.reviewed_relationship, b.title existing_title
     FROM import_commit_attempts a
     JOIN import_drafts d ON d.draft_id = a.draft_id
     LEFT JOIN books b ON b.book_id = d.reviewed_existing_book_id
     WHERE a.state = 'uncertain'
     ORDER BY a.uncertain_at, a.attempt_id LIMIT ?`,
  ).all(limit) as SqlRow[]).map((row): ImportAttentionReading => ({
    kind: 'outcome-uncertain',
    draftId: text(row.draft_id),
    commitAttemptId: text(row.attempt_id),
    at: text(row.uncertain_at),
    sourceDisplayName: text(row.display_name),
    relationship: relationshipOf(nullableText(row.reviewed_relationship)),
    book: importBookOf(row),
  }));
  const cleanup = (db.prepare(
    `SELECT c.draft_id, c.requested_at, d.display_name, d.reviewed_title, d.reviewed_target_kind,
            d.reviewed_existing_book_id, d.reviewed_relationship, b.title existing_title
     FROM import_abandonment_cleanup_intents c
     JOIN import_drafts d ON d.draft_id = c.draft_id
     LEFT JOIN books b ON b.book_id = d.reviewed_existing_book_id
     ORDER BY c.requested_at, c.draft_id LIMIT ?`,
  ).all(limit) as SqlRow[]).map((row): ImportAttentionReading => ({
    kind: 'cleanup-pending',
    draftId: text(row.draft_id),
    commitAttemptId: null,
    at: text(row.requested_at),
    sourceDisplayName: text(row.display_name),
    relationship: relationshipOf(nullableText(row.reviewed_relationship)),
    book: importBookOf(row),
  }));
  return [...uncertain, ...cleanup];
}

/** Every Recovery Attention State still unresolved, pending or deferred, with its Book and branch. */
export function readRecoveryAttention(db: DatabaseSync, limit: number): RecoveryAttentionReading[] {
  return (db.prepare(
    `SELECT ra.attention_id, ra.attention_version, ra.status, ra.created_at, ra.book_id, b.title book_title,
            ra.manuscript_id, ra.branch_id, mb.name branch_name
     FROM recovery_attention ra
     JOIN books b ON b.book_id = ra.book_id
     JOIN manuscript_branches mb ON mb.branch_id = ra.branch_id
     WHERE ra.status IN ('pending', 'deferred')
     ORDER BY ra.created_at, ra.attention_id LIMIT ?`,
  ).all(limit) as SqlRow[]).map((row) => {
    const status = text(row.status);
    if (status !== 'pending' && status !== 'deferred') throw invalid();
    return {
      attentionId: text(row.attention_id),
      attentionVersion: integer(row.attention_version),
      status,
      createdAt: text(row.created_at),
      bookId: text(row.book_id),
      bookTitle: text(row.book_title),
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      branchName: text(row.branch_name),
    };
  });
}
