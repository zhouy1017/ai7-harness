import { describe, expect, it } from 'vitest';
import { BackgroundAnalysisDispatcher, type BackgroundAnalysisDispatcherDependencies } from '../../src/service/background-analysis.js';
import type { BackgroundAnalysisDecision } from '../../src/service/background-analysis-enrollments.js';
import { BASELINE_ANALYSIS_MODE_GOALS, type LaunchPolicyProjection } from '../../src/shared/protocol.js';

// Unit suite for the 后台分析登记 dispatcher (Issue #95, plan slice S39): it asks the store, prepares exactly as 先看计划 does
// only on a `start`, starts through the governor, never runs two passes at once, and starts nothing while a replacement waits
// or once it is disposed.

const POLICY = {} as LaunchPolicyProjection;

interface Calls { decided: string[]; prepared: Array<[string, string, unknown]>; advanced: number; cancelled: number; started: string[]; admitted: string[] }

function harness(decisions: Readonly<Record<string, BackgroundAnalysisDecision>>, options: { frozen?: boolean; steps?: number; busy?: boolean } = {}) {
  const calls: Calls = { decided: [], prepared: [], advanced: 0, cancelled: 0, started: [], admitted: [] };
  let remaining = options.steps ?? 0;
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
    createBaselineAnalysisPreparationWork: (bookId: string, goal: string, update: unknown) => {
      calls.prepared.push([bookId, goal, update]);
      return remaining === 0
        ? { done: true, workId: null, completed: 1, total: 1, projection: projection(bookId) }
        : { done: false, workId: `work-${bookId}`, completed: 0, total: 1, projection: null };
    },
    advanceBaselineAnalysisPreparationWork: (workId: string) => {
      calls.advanced += 1;
      remaining -= 1;
      const bookId = workId.slice('work-'.length);
      return remaining <= 0
        ? { done: true, workId: null, completed: 1, total: 1, projection: projection(bookId) }
        : { done: false, workId, completed: 0, total: 1, projection: null };
    },
    cancelBaselineAnalysisPreparationWork: () => {
      calls.cancelled += 1;
      return true;
    },
    startEnrolledBaselineAnalysis: (bookId: string, taskIntentId: string, digest: string, versionId: string, mode: string) => {
      calls.started.push(`${bookId}:${taskIntentId}:${digest}:${versionId}:${mode}`);
      return { dispatchRunRecordId: `run-${bookId}`, reason: null };
    },
  } as unknown as BackgroundAnalysisDispatcherDependencies['store'];
  const execution = {
    busy: options.busy ?? false,
    routeExecutable: true,
    admitOrQueue: (runRecordId: string) => {
      calls.admitted.push(runRecordId);
      return 'admitted' as const;
    },
  };
  return { calls, store, execution };
}

describe('the 后台分析登记 dispatcher', () => {
  it('prepares and starts only the Books whose decision is start, each in the mode it names, through the governor', async () => {
    const { calls, store, execution } = harness({
      a: { kind: 'start', mode: 'sync-current', reason: 'go' },
      b: { kind: 'wait', reason: 'busy' },
      c: { kind: 'start', mode: 'first-baseline', reason: 'go' },
    });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY, now: () => 7, quietMs: 5 });
    expect(dispatcher.runtime()).toEqual({ routeExecutable: true, placeFree: true, now: 7, quietMs: 5 });
    dispatcher.nudge();
    await dispatcher.settled();
    expect(calls.decided).toEqual(['a', 'b', 'c']);
    expect(calls.prepared).toEqual([
      ['a', BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: null }],
      ['c', BASELINE_ANALYSIS_MODE_GOALS['first-baseline'], null],
    ]);
    expect(calls.started).toEqual(['a:task-a:digest-a:version-a:sync-current', 'c:task-c:digest-c:version-c:first-baseline']);
    expect(calls.admitted).toEqual(['run-a', 'run-c']);
  });

  it('reads a busy governor as no free place', () => {
    const { store, execution } = harness({}, { busy: true });
    expect(new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY }).runtime().placeFree).toBe(false);
  });

  it('starts nothing while a replacement of the local data waits', async () => {
    const { calls, store, execution } = harness({ a: { kind: 'start', mode: 'sync-current', reason: 'go' } }, { frozen: true });
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.decided, calls.prepared, calls.started]).toEqual([[], [], []]);
  });

  it('advances a preparation step by step, yielding between, and runs a nudge made meanwhile as one more pass', async () => {
    const { calls, store, execution } = harness({ a: { kind: 'start', mode: 'sync-current', reason: 'go' } }, { steps: 3 });
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
    const { calls, store, execution } = harness({ a: { kind: 'start', mode: 'sync-current', reason: 'go' } }, { steps: 3 });
    let dispatcher: BackgroundAnalysisDispatcher | null = null;
    dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: POLICY, yieldStep: async () => void dispatcher!.dispose() });
    dispatcher.nudge();
    await dispatcher.settled();
    expect([calls.cancelled, calls.started, calls.admitted]).toEqual([1, [], []]);
    dispatcher.nudge();
    dispatcher.start();
    await dispatcher.settled();
    expect(calls.prepared).toHaveLength(1);
  });

  it('keeps going past a Book whose start failed', async () => {
    const { calls, store, execution } = harness({
      a: { kind: 'start', mode: 'sync-current', reason: 'go' },
      b: { kind: 'start', mode: 'sync-current', reason: 'go' },
    });
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
