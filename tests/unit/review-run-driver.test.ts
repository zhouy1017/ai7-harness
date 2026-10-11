import { describe, expect, it } from 'vitest';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { ReviewRunDriver, type ReviewRunDriveSteps, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import type { ReviewRunDriveStep } from '../../src/service/review/review-runs.js';

// Unit suite for the Review Run drive loop's wait for a place (Issue #64 review): a category whose start an earlier hand-off
// authorized waits for a place of the governor, and what it needs is read again once it has one. A Run stopped during the
// wait — a Series Retrieval Exclusion recorded, its start blocked — dispatches nothing and records nothing more.

const LEDGER = {} as BaselineAnalysisStore;

function harness(): { driver: ReviewRunDriver; calls: string[]; stop: () => void; free: () => void } {
  const calls: string[] = [];
  let stopped = false;
  let release!: () => void;
  const place = new Promise<void>((resolve) => { release = resolve; });
  const steps: ReviewRunDriveSteps = {
    begin: () => ['typos-and-usage'],
    end: () => undefined,
    step: (): ReviewRunDriveStep => stopped ? { kind: 'done' } : { kind: 'dispatch', runRecordId: 'run-1', ledger: LEDGER },
    start: () => null,
    recordDispatch: () => { calls.push('recordDispatch'); },
    refuseDispatch: () => { calls.push('refuseDispatch'); },
    settle: () => { calls.push('settle'); },
    write: () => { calls.push('write'); },
    fail: () => { calls.push('fail'); },
    waitingForPlace: () => undefined,
  };
  const owner: ReviewRunExecutionOwner = {
    busy: true,
    admitAndDispatch: () => { calls.push('admitAndDispatch'); },
    whenPlaceFree: () => place,
    whenDone: async () => { stopped = true; },
  };
  return { driver: new ReviewRunDriver(steps, owner), calls, stop: () => { stopped = true; }, free: () => release() };
}

describe('the drive loop\'s wait for a place', () => {
  it('reads the step again after the wait, and dispatches nothing for a Run stopped meanwhile', async () => {
    const { driver, calls, stop, free } = harness();
    const driven = driver.drive('review-run');
    stop();
    free();
    await driven;
    expect(calls).toEqual([]);
  });

  it('dispatches the start it waited for when nothing moved', async () => {
    const { driver, calls, free } = harness();
    const driven = driver.drive('review-run');
    free();
    await driven;
    expect(calls).toEqual(['admitAndDispatch', 'recordDispatch']);
  });
});

describe('the drive loop takes a free place in the turn it is handed a Run (Issue #764)', () => {
  function drivenWith(busy: boolean | undefined): { calls: string[]; driver: ReviewRunDriver } {
    const calls: string[] = [];
    const steps: ReviewRunDriveSteps = {
      begin: () => ['typos-and-usage'],
      end: () => undefined,
      step: (): ReviewRunDriveStep => calls.includes('admitAndDispatch') ? { kind: 'done' } : { kind: 'dispatch', runRecordId: 'run-1', ledger: LEDGER },
      start: () => null,
      recordDispatch: () => { calls.push('recordDispatch'); },
      refuseDispatch: () => undefined,
      settle: () => undefined,
      write: () => undefined,
      fail: () => undefined,
      waitingForPlace: () => undefined,
    };
    const owner: ReviewRunExecutionOwner = {
      ...(busy === undefined ? {} : { busy }),
      admitAndDispatch: () => { calls.push('admitAndDispatch'); },
      whenPlaceFree: async () => undefined,
      whenDone: async () => undefined,
    };
    return { calls, driver: new ReviewRunDriver(steps, owner) };
  }

  it('hands the category to the owner before drive returns when a place is free, so a Run admitted next sees it taken', async () => {
    const { calls, driver } = drivenWith(false);
    const driven = driver.drive('review-run');
    expect(calls).toEqual(['admitAndDispatch', 'recordDispatch']);
    await driven;
  });

  it('still waits through the owner for an owner that does not say whether a place is free', async () => {
    const { calls, driver } = drivenWith(undefined);
    const driven = driver.drive('review-run');
    expect(calls).toEqual([]);
    await driven;
    expect(calls).toEqual(['admitAndDispatch', 'recordDispatch']);
  });
});
