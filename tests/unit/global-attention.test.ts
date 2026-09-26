import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  attentionWaitingFor,
  composeGlobalAttention,
  orderGlobalAttentionItems,
  recentWindowStart,
  type AnalysisOutcomeAttentionReading,
  type AnalysisTaskAttentionReading,
  type ConflictAttentionReading,
  type GlobalAttentionReadings,
  type ImportAttentionReading,
  type RecoveryAttentionReading,
  type ReviewRunAttentionReading,
} from '../../src/service/global-attention.js';
import type { RunProgress } from '../../src/service/analysis/baseline-analysis-store.js';
import {
  GLOBAL_ATTENTION_GROUP_KEYS,
  GLOBAL_ATTENTION_GROUP_LIMIT,
  GLOBAL_ATTENTION_RECENT_DAYS,
  GLOBAL_ATTENTION_RECENT_LIMIT,
  MAX_FRAME_BYTES,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionProjection,
} from '../../src/shared/protocol.js';

// Unit suite for 待我处理's composition (Issue #424, plan slice S78; V2-UX-ATTN-001 to 008): the owners'
// readings become the four groups — which record lands where, with which state, next step and target; the
// order inside each group; the bounds; and a count that is the first two groups' and nothing else. The
// readings are synthetic records; the service suite reads real ones.

const NOW = new Date('2026-09-23T12:00:00.000Z');
const minutesAgo = (minutes: number): string => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();

const NONE: GlobalAttentionReadings = {
  imports: [],
  recoveries: [],
  conflicts: [],
  analysisTasks: [],
  analysisOutcomes: [],
  reviewRuns: [],
  reviewCompletions: [],
  maintenance: [],
  busy: false,
  waitingFor: 'admitting',
};

function readings(partial: Partial<GlobalAttentionReadings>): GlobalAttentionReadings {
  return { ...NONE, ...partial };
}

function group(projection: GlobalAttentionProjection, key: GlobalAttentionGroupKey): ReadonlyArray<GlobalAttentionItemProjection> {
  return projection.groups.find((entry) => entry.key === key)!.items;
}

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

function analysisTask(title: string, overrides: Partial<AnalysisTaskAttentionReading> = {}): AnalysisTaskAttentionReading {
  return {
    bookId: randomUUID(),
    bookTitle: title,
    taskIntentId: randomUUID(),
    mode: 'first-baseline',
    createdAt: minutesAgo(90),
    run: null,
    planRevision: null,
    ...overrides,
  };
}

function run(state: NonNullable<AnalysisTaskAttentionReading['run']>['state'], stateAt: string, inFlight: RunProgress | null = null): NonNullable<AnalysisTaskAttentionReading['run']> {
  return { runRecordId: randomUUID(), state, stateAt, recordedAt: minutesAgo(80), progress: inFlight };
}

function outcome(title: string, recordedAt: string, overrides: Partial<AnalysisOutcomeAttentionReading> = {}): AnalysisOutcomeAttentionReading {
  return {
    bookId: randomUUID(),
    bookTitle: title,
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

function category(label: string, state: ReviewRunAttentionReading['categories'][number]['state'], pending: boolean, detail: string | null = null): ReviewRunAttentionReading['categories'][number] {
  return { categoryId: label, label, state, pending, detail, progress: null };
}

function reviewRun(title: string, overrides: Partial<ReviewRunAttentionReading> = {}): ReviewRunAttentionReading {
  return {
    bookId: randomUUID(),
    bookTitle: title,
    reviewRunId: randomUUID(),
    ordinal: 2,
    createdAt: minutesAgo(70),
    authorizedAt: minutesAgo(60),
    state: 'settled',
    canContinue: false,
    categories: [category('错别字与规范用语', 'settled', false)],
    lastEventAt: minutesAgo(30),
    ...overrides,
  };
}

function importReading(kind: ImportAttentionReading['kind'], at: string, title: string | null): ImportAttentionReading {
  return {
    kind,
    draftId: randomUUID(),
    commitAttemptId: kind === 'outcome-uncertain' ? randomUUID() : null,
    at,
    sourceDisplayName: 'sample1.docx',
    relationship: 'first-manuscript',
    book: { bookId: null, title },
  };
}

function recovery(title: string, status: RecoveryAttentionReading['status'], createdAt: string): RecoveryAttentionReading {
  return {
    attentionId: randomUUID(),
    attentionVersion: status === 'pending' ? 1 : 2,
    status,
    createdAt,
    bookId: randomUUID(),
    bookTitle: title,
    manuscriptId: randomUUID(),
    branchId: randomUUID(),
    branchName: '主分支',
  };
}

function conflict(title: string, conflictKind: ConflictAttentionReading['conflictKind'], deferredAt: string | null, updatedAt: string): ConflictAttentionReading {
  return { markId: randomUUID(), conflictKind, deferredAt, updatedAt, bookId: randomUUID(), bookTitle: title, manuscriptId: randomUUID(), branchId: randomUUID() };
}

describe('the four groups of 待我处理', () => {
  it('are always the four, in their one fixed order, empty or not, and count nothing when nothing needs the editor', () => {
    const projection = composeGlobalAttention(NONE, NOW);
    expect(projection.groups.map((entry) => entry.key)).toEqual(['exceptions', 'decisions', 'active', 'recent']);
    expect(projection.groups.map((entry) => entry.key)).toEqual([...GLOBAL_ATTENTION_GROUP_KEYS]);
    expect(projection.groups.every((entry) => entry.items.length === 0 && entry.total === 0)).toBe(true);
    expect(projection.actionableCount).toBe(0);
    expect(projection.running).toBe(false);
    // The owner's slot, and nothing else, says a Run is in flight.
    expect(composeGlobalAttention(readings({ busy: true }), NOW).running).toBe(true);
  });

  // V2-UX-ATTN-002: a Manuscript Conflict is 异常与结果待确认's, and blocks its suggestion until it is resolved.
  it('lists a Manuscript Conflict, before or after 暂不处理, as blocking, opening its 稿件冲突', () => {
    const open = conflict('冲突之书', 'suggestion', null, minutesAgo(30));
    const deferred = conflict('暂缓之书', 'reversal', minutesAgo(10), minutesAgo(35));
    const projection = composeGlobalAttention(readings({ conflicts: [deferred, open] }), NOW);
    const exceptions = group(projection, 'exceptions');
    // 暂不处理 is when the deferred state began, so the conflict first left open is the older item.
    expect(exceptions.map((entry) => [entry.itemId, entry.state, entry.blocked, entry.at])).toEqual([
      [`conflict:${open.markId}`, 'manuscript-conflict', true, open.updatedAt],
      [`conflict:${deferred.markId}`, 'manuscript-conflict-deferred', true, deferred.deferredAt],
    ]);
    expect(exceptions[1]).toMatchObject({
      group: 'exceptions',
      book: { bookId: deferred.bookId, title: '暂缓之书' },
      object: { kind: 'manuscript-conflict', conflictKind: 'reversal' },
      nextStep: 'resolve-conflict',
      target: { kind: 'manuscript-conflict', bookId: deferred.bookId, manuscriptId: deferred.manuscriptId, branchId: deferred.branchId, markId: deferred.markId },
    });
    expect(exceptions[0]!.technical.map((row) => row.key)).toEqual(['mark', 'conflict-kind', 'manuscript', 'branch', 'state-at']);
    expect(projection.actionableCount).toBe(2);
  });

  it('lists a 维护事项 still waiting on the editor under 等待你的决定, never blocking, opening the case on its 发稿版本 (Issue #426, S68b)', () => {
    const reading = (classification: 'errata' | 'supersession', status: 'unresolved' | 'waiting', nextStep: 'write-errata' | 'link-publication', at: string) => ({
      caseId: randomUUID(), ordinal: classification === 'errata' ? 1 : 3, classification, status, nextStep, at,
      bookId: randomUUID(), bookTitle: '维护之书', publicationVersionId: randomUUID(), publicationOrdinal: 1,
    });
    const errata = reading('errata', 'unresolved', 'write-errata', minutesAgo(40));
    const supersession = reading('supersession', 'waiting', 'link-publication', minutesAgo(20));
    const projection = composeGlobalAttention(readings({ maintenance: [supersession, errata] }), NOW);
    const decisions = group(projection, 'decisions');
    expect(decisions.map((entry) => [entry.itemId, entry.state, entry.blocked, entry.nextStep, entry.at])).toEqual([
      [`maintenance:${errata.caseId}`, 'maintenance-pending', false, 'maintenance-write-errata', errata.at],
      [`maintenance:${supersession.caseId}`, 'maintenance-waiting', false, 'maintenance-link-publication', supersession.at],
    ]);
    expect(decisions[1]).toMatchObject({
      book: { bookId: supersession.bookId, title: '维护之书' },
      object: { kind: 'maintenance', classification: 'supersession', ordinal: 3, publicationOrdinal: 1 },
      target: { kind: 'maintenance', bookId: supersession.bookId, publicationVersionId: supersession.publicationVersionId, caseId: supersession.caseId },
    });
    expect(decisions[0]!.technical.map((row) => row.key)).toEqual(['maintenance-case', 'publication-version', 'state-at']);
    expect(projection.actionableCount).toBe(2);
    // A 替代 or 再版 that recorded an interim 仍未解决 still waits for its version: it reads as waiting, never as a 更正.
    const interim = { ...reading('supersession', 'unresolved', 'link-publication', minutesAgo(10)), classification: 'reissue' as const };
    const later = group(composeGlobalAttention(readings({ maintenance: [interim] }), NOW), 'decisions');
    expect(later.map((entry) => [entry.state, entry.nextStep])).toEqual([['maintenance-waiting', 'maintenance-link-publication']]);
  });

  it('lists a Run waiting to start once online under 运行中与已暂停, in the words of what it waits for (Issue #502, ATTN-004)', () => {
    const waiting = analysisTask('等网之书', { run: run('awaiting-connectivity', minutesAgo(6)) });
    const states = (['network', 'connection', 'slot', 'admitting'] as const).map((waitingFor) => {
      const projection = composeGlobalAttention(readings({ analysisTasks: [waiting], waitingFor }), NOW);
      const [entry] = group(projection, 'active');
      return [entry?.state, entry?.blocked, entry?.nextStep, projection.actionableCount, projection.running];
    });
    // Only a missing model connection asks the editor to act; none of them is an exception or a decision to count.
    // A reader follows a waiting Run until it starts.
    expect(states).toEqual([
      ['analysis-waiting-network', false, 'view-run', 0, true],
      ['analysis-waiting-connection', true, 'view-run', 0, true],
      ['analysis-waiting-slot', false, 'view-run', 0, true],
      // Nothing in its way, the next look admits it: not yet in the scheduler, so never 正在排队's 已进入调度器 (Issue #539).
      ['analysis-waiting-admission', false, 'view-run', 0, true],
    ]);
  });

  it('reads what a Run waits for only while one waits, and a failed read as waiting for the connection (Issue #539)', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return 'connection' as const;
    };
    // No Run waits: the credential is never checked for 待我处理.
    expect(await attentionWaitingFor(false, read)).toBe('admitting');
    expect(reads).toBe(0);
    expect(await attentionWaitingFor(true, read)).toBe('connection');
    expect(reads).toBe(1);
    // A keyring read that fails does not fail the whole read of 待我处理, and reads as waiting for the connection: Reconnect
    // Preflight makes the same check and admits nothing while it fails, so the Run is not about to start.
    expect(await attentionWaitingFor(true, async () => { throw new Error('keyring unavailable'); })).toBe('connection');
  });

  it('places each record by its own state, with the next step and the record it opens', () => {
    const uncertain = importReading('outcome-uncertain', minutesAgo(50), '新书');
    const cleanup = importReading('cleanup-pending', minutesAgo(40), null);
    const pending = recovery('恢复之书', 'pending', minutesAgo(45));
    const deferred = recovery('稍后之书', 'deferred', minutesAgo(44));
    const failed = analysisTask('失败之书', { run: run('failed', minutesAgo(20)) });
    const interrupted = analysisTask('中断之书', { run: run('interrupted', minutesAgo(21)) });
    const blocked = analysisTask('阻止之书', { run: run('blocked-before-dispatch', minutesAgo(22)) });
    const orphaned = analysisTask('停止之书', { run: run('executing', minutesAgo(23)) });
    const orphanedAuthorized = analysisTask('未派发之书', { run: run('authorized', minutesAgo(24)) });
    const revised = analysisTask('修订之书', {
      planRevision: { planRevisionId: randomUUID(), at: minutesAgo(25), priorOrdinal: 1, changedFields: ['selectedRange', 'reusePlan.counts'] },
    });
    const prepared = analysisTask('待开始之书');
    const executing = analysisTask('运行之书', { run: run('executing', minutesAgo(5), progress()) });
    const queued = analysisTask('排队之书', { run: run('admitted', minutesAgo(4), progress({ unitsSettled: 0, currentUnitOrdinal: null })) });
    const settled = analysisTask('完成之书', { run: run('completed', minutesAgo(3)) });
    const completed = outcome('完成之书', minutesAgo(3));
    const withGaps = outcome('缺口之书', minutesAgo(2), { classification: 'completed-with-gaps', revisionOrdinal: 4 });
    const reviewFailed = reviewRun('审阅失败之书', {
      state: 'failed',
      categories: [category('错别字与规范用语', 'failed', false), category('体例与格式', 'refused', false)],
    });
    const reviewStopped = reviewRun('审阅中断之书', {
      state: 'partial',
      categories: [category('错别字与规范用语', 'interrupted', false), category('体例与格式', 'settled', false)],
    });
    const reviewRunning = reviewRun('审阅进行之书', {
      state: 'running',
      categories: [category('错别字与规范用语', 'settled', false), { ...category('体例与格式', 'running', true), progress: progress({ unitsSettled: 5 }) }],
    });
    const reviewContinuable = reviewRun('审阅停下之书', {
      state: 'partial',
      canContinue: true,
      categories: [category('错别字与规范用语', 'settled', false), category('体例与格式', 'waiting', true, '尚未开始；继续审阅时从这一类接着审。')],
    });
    const reviewSettled = reviewRun('审阅完成之书');
    const reviewPrepared = reviewRun('审阅待开始之书', { state: 'prepared', authorizedAt: null, lastEventAt: null });

    const projection = composeGlobalAttention(readings({
      imports: [uncertain, cleanup],
      recoveries: [pending, deferred],
      analysisTasks: [failed, interrupted, blocked, orphaned, orphanedAuthorized, revised, prepared, executing, queued, settled],
      analysisOutcomes: [completed, withGaps],
      reviewRuns: [reviewFailed, reviewStopped, reviewRunning, reviewContinuable, reviewSettled, reviewPrepared],
      reviewCompletions: [reviewSettled],
      busy: true,
    }), NOW);

    const all = projection.groups.flatMap((entry) => entry.items);
    const find = (itemId: string): GlobalAttentionItemProjection => {
      const found = all.filter((entry) => entry.itemId === itemId);
      expect(found).toHaveLength(1);
      return found[0]!;
    };
    const summary = (entry: GlobalAttentionItemProjection): unknown => [entry.group, entry.state, entry.nextStep, entry.target.kind, entry.blocked];

    expect(summary(find(`import:${uncertain.draftId}`))).toEqual(['exceptions', 'import-outcome-uncertain', 'await-local-check', 'import-recovery', true]);
    expect(find(`import:${uncertain.draftId}`).book).toEqual({ bookId: null, title: '新书' });
    expect(summary(find(`import:${cleanup.draftId}`))).toEqual(['exceptions', 'import-cleanup-pending', 'retry-abandon-cleanup', 'import-recovery', true]);
    expect(find(`import:${cleanup.draftId}`).book).toEqual({ bookId: null, title: null });
    expect(summary(find(`recovery:${pending.attentionId}`))).toEqual(['exceptions', 'recovery-pending', 'return-to-recovery', 'manuscript-recovery', true]);
    expect(summary(find(`recovery:${deferred.attentionId}`))).toEqual(['exceptions', 'recovery-deferred', 'return-to-recovery', 'manuscript-recovery', true]);
    expect(find(`recovery:${deferred.attentionId}`).target).toEqual({ kind: 'manuscript-recovery', attentionId: deferred.attentionId });

    expect(summary(find(`analysis:${failed.taskIntentId}`))).toEqual(['exceptions', 'analysis-failed', 'view-run', 'analysis', false]);
    expect(summary(find(`analysis:${interrupted.taskIntentId}`))).toEqual(['exceptions', 'analysis-interrupted', 'view-run', 'analysis', false]);
    expect(summary(find(`analysis:${blocked.taskIntentId}`))).toEqual(['exceptions', 'analysis-blocked', 'view-run', 'analysis', true]);
    // A Run left admitted, executing or only authorized with nothing in flight is read as stopped, and it
    // keeps the Book from a new update Task, so it counts as blocked.
    expect(summary(find(`analysis:${orphaned.taskIntentId}`))).toEqual(['exceptions', 'analysis-orphaned', 'view-run', 'analysis', true]);
    expect(summary(find(`analysis:${orphanedAuthorized.taskIntentId}`))).toEqual(['exceptions', 'analysis-orphaned', 'view-run', 'analysis', true]);
    expect(find(`analysis:${failed.taskIntentId}`).target).toEqual({ kind: 'analysis', bookId: failed.bookId, taskIntentId: failed.taskIntentId });
    expect(find(`analysis:${failed.taskIntentId}`).object).toEqual({ kind: 'analysis', mode: 'first-baseline' });

    expect(summary(find(`analysis:${revised.taskIntentId}`))).toEqual(['decisions', 'analysis-plan-revision', 'reconfirm-plan', 'analysis-plan', true]);
    expect(find(`analysis:${revised.taskIntentId}`).at).toBe(revised.planRevision!.at);
    expect(find(`analysis:${revised.taskIntentId}`).target).toEqual({ kind: 'analysis-plan', bookId: revised.bookId, taskIntentId: revised.taskIntentId });

    expect(summary(find(`analysis:${executing.taskIntentId}`))).toEqual(['active', 'analysis-running', 'view-run', 'analysis', false]);
    expect(find(`analysis:${executing.taskIntentId}`).facts.progress).toEqual({ stage: 'units', unitsSettled: 3, unitsTotal: 8 });
    expect(summary(find(`analysis:${queued.taskIntentId}`))).toEqual(['active', 'analysis-queued', 'view-run', 'analysis', false]);

    expect(summary(find(`analysis-outcome:${completed.outcomeId}`))).toEqual(['recent', 'analysis-completed', 'view-run', 'analysis', false]);
    expect(summary(find(`analysis-outcome:${withGaps.outcomeId}`))).toEqual(['recent', 'analysis-completed-with-gaps', 'view-run', 'analysis', false]);
    expect(find(`analysis-outcome:${withGaps.outcomeId}`).facts.revisionOrdinal).toBe(4);

    expect(summary(find(`review:${reviewFailed.reviewRunId}`))).toEqual(['exceptions', 'review-failed', 'view-review', 'review', false]);
    expect(find(`review:${reviewFailed.reviewRunId}`).facts.categories.map((entry) => [entry.label, entry.state, entry.stateLabel]))
      .toEqual([['错别字与规范用语', 'failed', '运行失败'], ['体例与格式', 'refused', '未能开始']]);
    expect(summary(find(`review:${reviewStopped.reviewRunId}`))).toEqual(['exceptions', 'review-stopped', 'view-review', 'review', false]);
    expect(find(`review:${reviewStopped.reviewRunId}`).facts.categories.map((entry) => entry.label)).toEqual(['错别字与规范用语']);
    expect(summary(find(`review:${reviewRunning.reviewRunId}`))).toEqual(['active', 'review-running', 'view-review', 'review', false]);
    expect(find(`review:${reviewRunning.reviewRunId}`).facts).toMatchObject({
      categories: [{ label: '体例与格式', state: 'running', stateLabel: '正在审阅' }],
      progress: { stage: 'units', unitsSettled: 5, unitsTotal: 8 },
    });
    // Stopped mid-way by a service that stopped: 继续审阅, and the first category it would take up.
    expect(summary(find(`review:${reviewContinuable.reviewRunId}`))).toEqual(['active', 'review-continuable', 'continue-review', 'review', false]);
    expect(find(`review:${reviewContinuable.reviewRunId}`).facts.categories).toEqual([
      { label: '体例与格式', state: 'waiting', stateLabel: '等待审阅', detail: '尚未开始；继续审阅时从这一类接着审。' },
    ]);
    // A Run on the manuscript in every category is a completion, listed once however it was read.
    expect(summary(find(`review:${reviewSettled.reviewRunId}`))).toEqual(['recent', 'review-completed', 'view-review', 'review', false]);

    // Nothing for a plan that stands, a settled Run's Task, or a Review Run not yet approved.
    for (const quiet of [prepared.taskIntentId, settled.taskIntentId]) expect(all.some((entry) => entry.itemId === `analysis:${quiet}`)).toBe(false);
    expect(all.some((entry) => entry.itemId === `review:${reviewPrepared.reviewRunId}`)).toBe(false);

    // The count is the first two groups' and no other (V2-UX-ATTN-006).
    expect(group(projection, 'exceptions')).toHaveLength(11);
    expect(group(projection, 'decisions')).toHaveLength(1);
    expect(group(projection, 'active')).toHaveLength(4);
    expect(group(projection, 'recent')).toHaveLength(3);
    expect(projection.actionableCount).toBe(12);
    expect(projection.running).toBe(true);
  });

  it('keeps every exact identity in the technical rows and never a manuscript excerpt', () => {
    const blocked = analysisTask('阻止之书', { run: run('blocked-before-dispatch', minutesAgo(22)) });
    const item = composeGlobalAttention(readings({ analysisTasks: [blocked] }), NOW).groups[0]!.items[0]!;
    expect(item.technical.map((row) => row.key)).toEqual(['task-intent', 'run-record', 'state-at']);
    expect(item.technical[0]!.value).toBe(blocked.taskIntentId);
    expect(item.technical[1]!.value).toBe(`${blocked.run!.runRecordId} · blocked-before-dispatch`);
    expect(item.book).toEqual({ bookId: blocked.bookId, title: '阻止之书' });
  });
});

describe('the order inside each group', () => {
  it('puts blocked work first, then the oldest first, then the Book title and the record', () => {
    const olderFailed = analysisTask('乙', { run: run('failed', minutesAgo(90)) });
    const newerFailed = analysisTask('甲', { run: run('failed', minutesAgo(10)) });
    const newerBlocked = analysisTask('丙', { run: run('blocked-before-dispatch', minutesAgo(5)) });
    const olderBlocked = recovery('丁', 'pending', minutesAgo(200));
    const tieA = analysisTask('子', { run: run('interrupted', minutesAgo(30)) });
    const tieB = analysisTask('丑', { run: run('interrupted', minutesAgo(30)) });
    const projection = composeGlobalAttention(readings({ analysisTasks: [olderFailed, newerFailed, newerBlocked, tieA, tieB], recoveries: [olderBlocked] }), NOW);
    const titles = group(projection, 'exceptions').map((entry) => entry.book.title);
    // Blocked: 丁 (oldest) then 丙; then not blocked, oldest first: 乙, then the tie at 30 minutes by title
    // in code-point order (丑 U+4E11 before 子 U+5B50), then 甲.
    expect(titles).toEqual(['丁', '丙', '乙', '丑', '子', '甲']);
  });

  it('keeps each Book\'s items together in 运行中与已暂停', () => {
    const bookA = { bookId: randomUUID(), bookTitle: 'A 书' };
    const bookB = { bookId: randomUUID(), bookTitle: 'B 书' };
    const analysisOfB = analysisTask('B 书', { ...bookB, run: run('executing', minutesAgo(1), progress()) });
    const reviewOfA = reviewRun('A 书', { ...bookA, state: 'partial', canContinue: true, authorizedAt: minutesAgo(3), categories: [category('体例与格式', 'waiting', true)] });
    const reviewOfB = reviewRun('B 书', { ...bookB, state: 'partial', canContinue: true, authorizedAt: minutesAgo(100), categories: [category('体例与格式', 'waiting', true)] });
    const projection = composeGlobalAttention(readings({ analysisTasks: [analysisOfB], reviewRuns: [reviewOfB, reviewOfA] }), NOW);
    // A 书 first by its title though its item is the newest; inside B 书 the older item first: the Review Run
    // started 100 minutes ago, the analysis Run 80.
    expect(group(projection, 'active').map((entry) => [entry.book.title, entry.state])).toEqual([
      ['A 书', 'review-continuable'],
      ['B 书', 'review-continuable'],
      ['B 书', 'analysis-running'],
    ]);
  });

  it('lists 最近完成 newest first, within the window, at most the recent limit', () => {
    const inside = Array.from({ length: GLOBAL_ATTENTION_RECENT_LIMIT + 3 }, (_, index) => outcome(`书${String(index).padStart(2, '0')}`, minutesAgo(index + 1)));
    const outside = outcome('早书', daysAgo(GLOBAL_ATTENTION_RECENT_DAYS + 1));
    const edge = outcome('界书', recentWindowStart(NOW));
    const settledOutside = reviewRun('早审书', { lastEventAt: daysAgo(GLOBAL_ATTENTION_RECENT_DAYS + 2) });
    const projection = composeGlobalAttention(readings({ analysisOutcomes: [outside, edge, ...inside], reviewCompletions: [settledOutside] }), NOW);
    const recent = projection.groups.find((entry) => entry.key === 'recent')!;
    expect(recent.items).toHaveLength(GLOBAL_ATTENTION_RECENT_LIMIT);
    expect(recent.total).toBe(GLOBAL_ATTENTION_RECENT_LIMIT + 4);
    expect(recent.items.map((entry) => entry.book.title)).toEqual(inside.slice(0, GLOBAL_ATTENTION_RECENT_LIMIT).map((entry) => entry.bookTitle));
    expect(recent.items.some((entry) => entry.book.title === '早书' || entry.book.title === '早审书')).toBe(false);
    // Completions count nowhere.
    expect(projection.actionableCount).toBe(0);
  });

  it('orders one group by itself, and the same records the same way every time', () => {
    const items = composeGlobalAttention(readings({
      analysisTasks: Array.from({ length: 6 }, (_, index) => analysisTask(`书${index % 2}`, { run: run('failed', minutesAgo(10)) })),
    }), NOW).groups[0]!.items;
    const shuffled = [...items].reverse();
    expect(orderGlobalAttentionItems('exceptions', shuffled)).toEqual(items);
    const ids = items.map((entry) => entry.itemId);
    expect(items.filter((entry) => entry.book.title === '书0').map((entry) => entry.itemId))
      .toEqual(ids.filter((_, index) => items[index]!.book.title === '书0').sort());
  });
});

describe('the bounds', () => {
  it('lists at most the group limit and still counts every item of the first two groups', () => {
    const many = Array.from({ length: GLOBAL_ATTENTION_GROUP_LIMIT + 7 }, (_, index) => analysisTask(`书${index}`, { run: run('failed', minutesAgo(index + 1)) }));
    const decisions = Array.from({ length: 3 }, (_, index) => analysisTask(`修订${index}`, {
      planRevision: { planRevisionId: null, at: minutesAgo(index), priorOrdinal: 1, changedFields: ['providerBinding'] },
    }));
    const projection = composeGlobalAttention(readings({ analysisTasks: [...many, ...decisions] }), NOW);
    const exceptions = projection.groups[0]!;
    expect(exceptions.items).toHaveLength(GLOBAL_ATTENTION_GROUP_LIMIT);
    expect(exceptions.total).toBe(GLOBAL_ATTENTION_GROUP_LIMIT + 7);
    // Oldest first: the ones listed are the oldest.
    expect(exceptions.items[0]!.book.title).toBe(`书${GLOBAL_ATTENTION_GROUP_LIMIT + 6}`);
    expect(projection.actionableCount).toBe(GLOBAL_ATTENTION_GROUP_LIMIT + 7 + 3);
  });

  it('fits one frame at its fullest: every group at its limit, long titles and every review category', () => {
    const long = '长'.repeat(180);
    const categories = Array.from({ length: 9 }, (_, index) => category(`${'类'.repeat(40)}${index}`, 'failed', false, '这一类的运行失败了；继续审阅时记下这一结果，再接着审其余类别。'));
    const projection = composeGlobalAttention(readings({
      imports: Array.from({ length: 30 }, () => ({ ...importReading('outcome-uncertain', minutesAgo(5), long), sourceDisplayName: `${'名'.repeat(170)}.docx` })),
      recoveries: Array.from({ length: 30 }, () => recovery(long, 'deferred', minutesAgo(5))),
      analysisTasks: [
        ...Array.from({ length: GLOBAL_ATTENTION_GROUP_LIMIT }, () => analysisTask(long, {
          planRevision: { planRevisionId: randomUUID(), at: minutesAgo(3), priorOrdinal: 9, changedFields: ['providerBinding', 'artifactPin', 'selectedRange', 'reusePlan.counts', 'runBudgetCeiling'] },
        })),
        ...Array.from({ length: GLOBAL_ATTENTION_GROUP_LIMIT }, () => analysisTask(long, { run: run('executing', minutesAgo(2), progress()) })),
      ],
      analysisOutcomes: Array.from({ length: GLOBAL_ATTENTION_RECENT_LIMIT }, () => outcome(long, minutesAgo(1))),
      reviewRuns: Array.from({ length: 10 }, () => reviewRun(long, { state: 'failed', categories })),
      busy: true,
    }), NOW);
    expect(projection.groups.map((entry) => entry.items.length)).toEqual([GLOBAL_ATTENTION_GROUP_LIMIT, GLOBAL_ATTENTION_GROUP_LIMIT, GLOBAL_ATTENTION_GROUP_LIMIT, GLOBAL_ATTENTION_RECENT_LIMIT]);
    const answer = JSON.stringify({ id: randomUUID(), ok: true, op: 'inspectGlobalAttention', result: projection });
    expect(Buffer.byteLength(answer, 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  });
});
