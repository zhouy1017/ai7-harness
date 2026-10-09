import { describe, expect, it } from 'vitest';
import { BackgroundAnalysisDispatcher, type BackgroundAnalysisDispatcherDependencies } from '../../src/service/background-analysis.js';
import { BACKGROUND_CHECKPOINT_PREEMPTED, BACKGROUND_RECOVERY_PENDING, type BackgroundAnalysisDecision } from '../../src/service/background-analysis-enrollments.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';

// Unit suite for the 后台分析登记 dispatcher (Issue #95, plan slice S39; #713 review): it asks the store, prepares a Task of its
// own only on a `start`, asks again before every step whether it may go on, starts in the same turn as the step that froze the
// plan, cancels its preparation and checkpoint on any failure, never runs two passes at once, and starts nothing while a
// replacement waits or once it is disposed.

const POLICY = {} as LaunchPolicyProjection;

interface Calls {
  decided: string[];
  prepared: Array<[string, string, string]>;
  advanced: number;
  cancelled: string[];
  guards: Array<[string, string | null]>;
  notes: string[];
  started: string[];
  admitted: string[];
}

interface Options {
  frozen?: boolean;
  steps?: number;
  busy?: boolean;
  /** The guard's answer before step n (0 = before preparing). */
  guard?: (step: number) => string | null;
  /** The step whose advance throws. */
  throwAt?: number;
}

function harness(decisions: Readonly<Record<string, BackgroundAnalysisDecision>>, options: Options = {}) {
  const calls: Calls = { decided: [], prepared: [], advanced: 0, cancelled: [], guards: [], notes: [], started: [], admitted: [] };
  const remaining = new Map<string, number>();
  let guardStep = 0;
  const projection = (bookId: string) => ({ taskIntent: { taskIntentId: `task-${bookId}` }, planEnvelope: { digest: `digest-${bookId}` } });
  const store = {
    replacementFrozen: () => options.frozen ?? false,
    backgroundAnalysisBooks: () => Object.keys(decisions),
    backgroundAnalysisDecisionFor: (bookId: string) => {
      calls.decided.push(bookId);
      // A Book whose Run was started reads, from then on, as one whose Task is under way.
      const decision = calls.started.some((entry) => entry.startsWith(`${bookId}:`)) ? { kind: 'wait', reason: 'running' } : decisions[bookId]!;
      return { decision, enrollmentVersionId: `version-${bookId}` };
    },
    backgroundMayContinue: (bookId: string, _version: string, workId: string | null) => {
      calls.guards.push([bookId, workId]);
      return options.guard?.(guardStep++) ?? null;
    },
    createBackgroundBaselineAnalysisPreparationWork: (bookId: string, mode: string, version: string) => {
      calls.prepared.push([bookId, mode, version]);
      const steps = options.steps ?? 0;
      remaining.set(`work-${bookId}`, steps);
      return steps === 0
        ? { done: true, workId: null, completed: 1, total: 1, projection: projection(bookId) }
        : { done: false, workId: `work-${bookId}`, completed: 0, total: 1, projection: null };
    },
    advanceBaselineAnalysisPreparationWork: (workId: string) => {
      calls.advanced += 1;
      if (options.throwAt === calls.advanced) throw Object.assign(new Error('建立重新导入安全固定点时稿件已变化。'), { code: 'REIMPORT_CHECKPOINT_STALE' });
      const left = remaining.get(workId)! - 1;
      remaining.set(workId, left);
      const bookId = workId.slice('work-'.length);
      return left <= 0
        ? { done: true, workId: null, completed: 1, total: 1, projection: projection(bookId) }
        : { done: false, workId, completed: 0, total: 1, projection: null };
    },
    cancelBaselineAnalysisPreparationWork: (workId: string) => {
      calls.cancelled.push(workId);
      return true;
    },
    noteBackgroundNotStarted: (bookId: string, reason: string) => {
      calls.notes.push(`${bookId}:${reason}`);
    },
    startEnrolledBaselineAnalysis: (bookId: string, taskIntentId: string, digest: string, versionId: string, mode: string) => {
      calls.started.push(`${bookId}:${taskIntentId}:${digest}:${versionId}:${mode}`);
      return { dispatchRunRecordId: `run-${bookId}`, reason: null };
    },
  } as unknown as BackgroundAnalysisDispatcherDependencies['store'];
  const execution = {
    busy: options.busy ?? false,
    routeExecutable: true,
    capacity: 2,
    admitOrQueue: (runRecordId: string) => {
      calls.admitted.push(runRecordId);
      return 'admitted' as const;
    },
  };
  return { calls, store, execution };
}

const START: BackgroundAnalysisDecision = { kind: 'start', mode: 'sync-current', reason: 'go' };

describe('the 后台分析登记 dispatcher', () => {
  it('prepares and starts only the Books whose decision is start, each in the mode it names, through the governor', async () => {
    const { calls, store, execution } = harness({
      a: START,
      b: { kind: 'wait', reason: 'busy' },
      c: { kind: 'start', mode: 'first-baseline', reason: 'go' },
    });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY, now: () => 7, quietMs: 5, editorWorkBusy: () => true });
    expect(dispatcher.runtime()).toEqual({ routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: true, now: 7, quietMs: 5 });
    dispatcher.nudge();
    expect(dispatcher.busy).toBe(true);
    await dispatcher.settled();
    expect(dispatcher.busy).toBe(false);
    expect(calls.decided).toEqual(['a', 'b', 'c']);
    expect(calls.prepared).toEqual([['a', 'sync-current', 'version-a'], ['c', 'first-baseline', 'version-c']]);
    expect(calls.started).toEqual(['a:task-a:digest-a:version-a:sync-current', 'c:task-c:digest-c:version-c:first-baseline']);
    expect(calls.admitted).toEqual(['run-a', 'run-c']);
  });

  it('reads a busy governor as no free place, and an editor with no jobs as idle', () => {
    const { store, execution } = harness({}, { busy: true });
    expect(new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY }).runtime())
      .toMatchObject({ placeFree: false, editorWorkBusy: false });
  });

  it('starts nothing while a replacement of the local data waits', async () => {
    const { calls, store, execution } = harness({ a: START }, { frozen: true });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.decided, calls.prepared, calls.started]).toEqual([[], [], []]);
  });

  it('asks before preparing and before every step, and prepares nothing when told not to', async () => {
    const { calls, store, execution } = harness({ a: START }, { steps: 2, guard: (step) => (step === 0 ? 'no' : null) });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.guards, calls.prepared, calls.started, calls.notes]).toEqual([[['a', null]], [], [], ['a:no']]);
  });

  it('stops before a step it may no longer take: the preparation is cancelled, why is noted, and nothing starts', async () => {
    const { calls, store, execution } = harness({ a: START }, { steps: 3, guard: (step) => (step === 2 ? '已撤销' : null) });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect(calls.guards).toEqual([['a', null], ['a', 'work-a'], ['a', 'work-a']]);
    expect([calls.advanced, calls.cancelled, calls.notes, calls.started, calls.admitted]).toEqual([1, ['work-a'], ['a:已撤销'], [], []]);
  });

  it('cancels its preparation and checkpoint when a step fails, and goes on to the next Book (P1-1)', async () => {
    const { calls, store, execution } = harness({ a: START, b: START }, { steps: 2, throwAt: 1 });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.cancelled, calls.notes]).toEqual([['work-a'], [`a:${BACKGROUND_CHECKPOINT_PREEMPTED}`]]);
    expect(calls.started).toEqual(['b:task-b:digest-b:version-b:sync-current']);
    expect(calls.admitted).toEqual(['run-b']);
  });

  it('notes why when the preparation cannot even begin, cancelling nothing it never made, and goes on to the next Book (P2-1)', async () => {
    const { calls, store, execution } = harness({ a: START, b: START });
    const refusing = { ...store, createBackgroundBaselineAnalysisPreparationWork: (bookId: string, ...rest: unknown[]) => {
      if (bookId === 'a') throw Object.assign(new Error('该稿件分支仍有恢复待确认状态；普通编辑保持只读。'), { code: 'RECOVERY_ATTENTION_REQUIRED' });
      return (store.createBackgroundBaselineAnalysisPreparationWork as (...args: unknown[]) => unknown)(bookId, ...rest);
    } } as BackgroundAnalysisDispatcherDependencies['store'];
    const dispatcher = new BackgroundAnalysisDispatcher({ store: refusing, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.cancelled, calls.notes, calls.admitted]).toEqual([[], [`a:${BACKGROUND_RECOVERY_PENDING}`], ['run-b']]);
  });

  it('advances a preparation step by step, yielding between, and runs a nudge made meanwhile as one more pass', async () => {
    const { calls, store, execution } = harness({ a: START }, { steps: 3 });
    let yields = 0;
    let dispatcher: BackgroundAnalysisDispatcher | null = null;
    dispatcher = new BackgroundAnalysisDispatcher({
      store, execution, launchPolicy: POLICY,
      yieldStep: async () => {
        yields += 1;
        // Nudges while a pass is under way never start a second pass beside it: they ask for one more after it.
        dispatcher!.nudge();
        dispatcher!.nudge();
      },
    });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([yields, calls.advanced, calls.prepared.length, calls.started.length]).toEqual([3, 3, 1, 1]);
    // The one more pass asked the store again, which says the Book's Task is under way now.
    expect(calls.decided).toEqual(['a', 'a']);
  });

  it('stops a preparation under way once disposed, and starts nothing after', async () => {
    const { calls, store, execution } = harness({ a: START }, { steps: 3 });
    let dispatcher: BackgroundAnalysisDispatcher | null = null;
    dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY, yieldStep: async () => void dispatcher!.dispose() });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.cancelled, calls.notes, calls.started, calls.admitted]).toEqual([['work-a'], [], [], []]);
    dispatcher.nudge();
    dispatcher.start();
    await dispatcher.settled();
    expect(calls.prepared).toHaveLength(1);
  });

  it('keeps going past a Book whose start failed', async () => {
    const { calls, store, execution } = harness({ a: START, b: START });
    const failing = { ...store, startEnrolledBaselineAnalysis: (bookId: string, ...rest: unknown[]) => {
      if (bookId === 'a') throw new Error('stale');
      return (store.startEnrolledBaselineAnalysis as (...args: unknown[]) => { dispatchRunRecordId: string | null; reason: string | null })(bookId, ...rest);
    } } as BackgroundAnalysisDispatcherDependencies['store'];
    const dispatcher = new BackgroundAnalysisDispatcher({ store: failing, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect(calls.admitted).toEqual(['run-b']);
  });
});
