import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  composeBookTasks,
  composeGlobalAttention,
  type AnalysisOutcomeAttentionReading,
  type AnalysisTaskAttentionReading,
  type BookTaskReadings,
  type ReviewRunAttentionReading,
} from '../../src/service/global-attention.js';
import type { RunProgress } from '../../src/service/analysis/baseline-analysis-store.js';
import { BOOK_TASK_GROUP_KEYS, BOOK_TASK_RECENT_LIMIT, type BookTaskGroupKey, type BookTasksProjection } from '../../src/shared/protocol.js';

// Unit suite for the 任务 panel's composition (Issue #423, plan slice S77a; V2-UX-TASK-044): one Book's readings become
// 等你处理 · 进行中 · 最近完成 — 待我处理's item for every Task it lists, the panel's own for a plan nobody started and a
// Task the editor cancelled, the order inside each group, 最近完成's bound, and whether the panel follows a Run. The
// readings are synthetic records; the service suite reads real ones.

const BOOK = randomUUID();
const OTHER = randomUUID();
const NOW = new Date('2026-09-25T12:00:00.000Z');
const minutesAgo = (minutes: number): string => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function progress(overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    unitsTotal: 8,
    unitsSettled: 3,
    currentUnitOrdinal: 4,
    currentUnitStartedAt: minutesAgo(1),
    attemptState: 'dispatched',
    completedAttempts: 3,
    longestSettledUnitMs: 800,
    stage: 'units',
    ...overrides,
  };
}

function task(overrides: Partial<AnalysisTaskAttentionReading> = {}): AnalysisTaskAttentionReading {
  return {
    bookId: BOOK,
    bookTitle: '任务面之书',
    taskIntentId: randomUUID(),
    mode: 'first-baseline',
    createdAt: minutesAgo(90),
    run: null,
    planRevision: null,
    ...overrides,
  };
}

function run(state: NonNullable<AnalysisTaskAttentionReading['run']>['state'], inFlight: RunProgress | null = null): NonNullable<AnalysisTaskAttentionReading['run']> {
  return { runRecordId: randomUUID(), state, stateAt: minutesAgo(40), recordedAt: minutesAgo(80), progress: inFlight };
}

function outcome(recordedAt: string, overrides: Partial<AnalysisOutcomeAttentionReading> = {}): AnalysisOutcomeAttentionReading {
  return {
    bookId: BOOK,
    bookTitle: '任务面之书',
    taskIntentId: randomUUID(),
    mode: 'first-baseline',
    outcomeId: randomUUID(),
    runRecordId: randomUUID(),
    classification: 'completed',
    recordedAt,
    revisionId: randomUUID(),
    revisionOrdinal: 1,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRunAttentionReading> = {}): ReviewRunAttentionReading {
  return {
    bookId: BOOK,
    bookTitle: '任务面之书',
    reviewRunId: randomUUID(),
    ordinal: 1,
    createdAt: minutesAgo(70),
    authorizedAt: minutesAgo(60),
    state: 'settled',
    canContinue: false,
    categories: [{ categoryId: 'typos', label: '错别字与规范用语', state: 'settled', pending: false, detail: null, progress: null }],
    lastEventAt: minutesAgo(30),
    ...overrides,
  };
}

function readings(partial: Partial<BookTaskReadings>): BookTaskReadings {
  return { bookId: BOOK, analysisTasks: [], analysisOutcomes: [], reviewRuns: [], reviewCompletions: [], waitingFor: 'admitting', ...partial };
}

function states(projection: BookTasksProjection, key: BookTaskGroupKey): string[] {
  return projection.groups.find((group) => group.key === key)!.items.map((entry) => `${entry.item.state}/${entry.item.nextStep}`);
}

describe('the 任务 panel of one Book (S77a)', () => {
  it('always has its three groups in their order, and nothing when the Book has no Task', () => {
    const empty = composeBookTasks(readings({}));
    expect(empty.groups.map((group) => group.key)).toEqual(BOOK_TASK_GROUP_KEYS);
    expect(BOOK_TASK_GROUP_KEYS).toEqual(['waiting', 'running', 'recent']);
    expect(empty.groups.every((group) => group.items.length === 0 && group.total === 0)).toBe(true);
    expect([empty.bookId, empty.running]).toEqual([BOOK, false]);
  });

  it('lists a plan nobody started, which 待我处理 never lists, and opens its plan', () => {
    const prepared = task();
    const panel = composeBookTasks(readings({ analysisTasks: [prepared] }));
    expect(states(panel, 'waiting')).toEqual(['analysis-prepared/view-plan']);
    const entry = panel.groups[0]!.items[0]!;
    expect(entry.item.target).toEqual({ kind: 'analysis-plan', bookId: BOOK, taskIntentId: prepared.taskIntentId });
    expect([entry.item.blocked, entry.item.at, entry.result]).toEqual([false, prepared.createdAt, null]);
    // 待我处理 leaves it out: a plan nobody started asks nothing of anyone yet.
    const global = composeGlobalAttention({
      imports: [], recoveries: [], conflicts: [], analysisTasks: [prepared], analysisOutcomes: [], reviewRuns: [], reviewCompletions: [],
      maintenance: [], libraryMaterials: [], learningMaterials: [], busy: false, waitingFor: 'admitting',
    }, NOW);
    expect(global.groups.every((group) => group.items.length === 0)).toBe(true);
  });

  it('places each state where 待我处理 places it: its two counted groups in 等你处理, 运行中与已暂停 in 进行中', () => {
    const blocked = task({ run: run('blocked-before-dispatch'), createdAt: minutesAgo(100) });
    const running = task({ run: run('executing', progress()) });
    const paused = task({ run: run('paused') });
    const asked = task({ run: { ...run('awaiting-clarification'), openClarification: { requestId: randomUUID(), unitOrdinal: 3, raisedAt: minutesAgo(5) } } });
    const panel = composeBookTasks(readings({ analysisTasks: [blocked, running, paused, asked] }));
    // Blocked first, then the oldest: a question the Run waits for blocks it too.
    expect(states(panel, 'waiting')).toEqual(['analysis-blocked/view-run', 'analysis-clarification/answer-clarification']);
    expect(states(panel, 'running')).toEqual(['analysis-running/view-run', 'analysis-paused/view-run']);
    expect(panel.running).toBe(true);
    expect(panel.groups.find((group) => group.key === 'running')!.items[0]!.item.facts.progress).toEqual({ stage: 'units', unitsSettled: 3, unitsTotal: 8 });
  });

  it('follows a Run until it ends: in flight, stopping, waiting to start once online or to go on once answered — and not one stopped for the editor', () => {
    for (const state of ['authorized', 'admitted', 'executing', 'pausing', 'cancelling', 'awaiting-connectivity', 'awaiting-clarification'] as const) {
      expect(composeBookTasks(readings({ analysisTasks: [task({ run: run(state, progress()) })] })).running).toBe(true);
    }
    for (const state of ['paused', 'resumable', 'failed', 'interrupted', 'blocked-before-dispatch'] as const) {
      expect(composeBookTasks(readings({ analysisTasks: [task({ run: run(state) })] })).running).toBe(false);
    }
    expect(composeBookTasks(readings({ reviewRuns: [review({ state: 'running' })] })).running).toBe(true);
  });

  it('lists every finished Task in 最近完成, newest first and bounded, a cancelled one too, each with the result 查看结果 opens', () => {
    const completions = Array.from({ length: BOOK_TASK_RECENT_LIMIT + 2 }, (_, index) => outcome(minutesAgo(200 - index)));
    const cancelled = outcome(minutesAgo(1), { classification: 'cancelled', revisionId: randomUUID(), revisionOrdinal: 13 });
    const cancelledEarly = outcome(minutesAgo(250), { classification: 'cancelled', revisionId: null, revisionOrdinal: null });
    const panel = composeBookTasks(readings({ analysisOutcomes: [...completions, cancelled, cancelledEarly] }));
    const recent = panel.groups.find((group) => group.key === 'recent')!;
    expect([recent.items.length, recent.total]).toEqual([BOOK_TASK_RECENT_LIMIT, completions.length + 2]);
    expect(recent.items[0]!.item.state).toBe('analysis-cancelled');
    expect(recent.items[0]!.result).toEqual({ kind: 'analysis-revision', revisionId: cancelled.revisionId });
    expect(recent.items[0]!.item.facts.revisionOrdinal).toBe(13);
    expect(recent.items.slice(1).every((entry) => entry.item.state === 'analysis-completed')).toBe(true);
    expect(recent.items[1]!.result).toEqual({ kind: 'analysis-revision', revisionId: completions.at(-1)!.revisionId });
    // A Task cancelled before it read anything formed no result: it opens its Run instead.
    const early = composeBookTasks(readings({ analysisOutcomes: [cancelledEarly] })).groups[2]!.items[0]!;
    expect([early.item.state, early.item.nextStep, early.result]).toEqual(['analysis-cancelled', 'view-run', null]);
    // A Task cancelled while it waited to start has no outcome: its Run stands for it, 已取消 with nothing formed; a
    // cancelled Run with its outcome is listed once, as the outcome.
    const waiting = task({ run: run('cancelled') });
    const before = composeBookTasks(readings({ analysisTasks: [waiting] })).groups[2]!.items;
    expect(before.map((entry) => [entry.item.itemId, entry.item.state, entry.item.at, entry.item.facts.revisionOrdinal, entry.result]))
      .toEqual([[`analysis:${waiting.taskIntentId}`, 'analysis-cancelled', waiting.run!.stateAt, null, null]]);
    const withOutcome = composeBookTasks(readings({ analysisTasks: [task({ run: { ...run('cancelled'), runRecordId: cancelled.runRecordId } })], analysisOutcomes: [cancelled] }));
    expect(withOutcome.groups[2]!.items.map((entry) => entry.item.itemId)).toEqual([`analysis-outcome:${cancelled.outcomeId}`]);
    // 待我处理 never lists a cancellation.
    const global = composeGlobalAttention({
      imports: [], recoveries: [], conflicts: [], analysisTasks: [], analysisOutcomes: [cancelled], reviewRuns: [], reviewCompletions: [],
      maintenance: [], libraryMaterials: [], learningMaterials: [], busy: false, waitingFor: 'admitting',
    }, NOW);
    expect(global.groups.every((group) => group.items.length === 0)).toBe(true);
  });

  it('lists a 审阅 prepared and not started, one under way, and one on the manuscript, once each', () => {
    const prepared = review({ state: 'prepared', authorizedAt: null, lastEventAt: null, categories: [{ categoryId: 'typos', label: '错别字与规范用语', state: 'prepared', pending: true, detail: null, progress: null }] });
    const underWay = review({ state: 'running', ordinal: 2, categories: [{ categoryId: 'typos', label: '错别字与规范用语', state: 'running', pending: true, detail: null, progress: null }] });
    const done = review({ ordinal: 3 });
    const prepPanel = composeBookTasks(readings({ reviewRuns: [prepared] }));
    expect(states(prepPanel, 'waiting')).toEqual(['review-prepared/view-plan']);
    expect(prepPanel.groups[0]!.items[0]!.item.target).toEqual({ kind: 'review-plan', bookId: BOOK, reviewRunId: prepared.reviewRunId });
    const panel = composeBookTasks(readings({ reviewRuns: [underWay, done], reviewCompletions: [done] }));
    expect(states(panel, 'running')).toEqual(['review-running/view-review']);
    expect(states(panel, 'recent')).toEqual(['review-completed/view-review']);
    expect(panel.groups[2]!.items[0]!.result).toEqual({ kind: 'review-run', reviewRunId: done.reviewRunId });
  });

  it('lists only this Book’s Tasks, whatever the readings hold', () => {
    const panel = composeBookTasks(readings({
      analysisTasks: [task({ bookId: OTHER, run: run('executing', progress()) })],
      analysisOutcomes: [outcome(minutesAgo(3), { bookId: OTHER })],
      reviewRuns: [review({ bookId: OTHER, state: 'running' })],
      reviewCompletions: [review({ bookId: OTHER })],
    }));
    expect(panel.groups.every((group) => group.total === 0)).toBe(true);
    expect(panel.running).toBe(false);
  });
});
