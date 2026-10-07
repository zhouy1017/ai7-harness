import { describe, expect, it } from 'vitest';
import type { Connectivity } from '../../src/service/connectivity.js';
import { planDriftReason, reconnectPreflight, type ReconnectPreflightDependencies } from '../../src/service/reconnect-preflight.js';

// Reconnect Preflight's rule (Issue #502; OFF-007 to OFF-009, UI ADR 0008), over fakes: which waiting Run is
// left waiting, which is blocked and why, and the one that is admitted.

class AdmissionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface World {
  waiting: string[];
  drift: Record<string, string[]>;
  connectivity: Connectivity;
  credential: 'present' | 'missing' | null;
  busy: boolean;
  admitThrows: Record<string, AdmissionError>;
  admitted: string[];
  blocked: Array<{ runRecordId: string; reasons: ReadonlyArray<string>; cause: 'plan-moved' | 'launch' }>;
  settledElsewhere: Set<string>;
  reachesNetwork: boolean;
  frozen: boolean;
  /** Set while the credential is read: a replacement asked for while a preflight waits on it (Issue #434 review). */
  freezeDuringCredentialRead: boolean;
}

function world(overrides: Partial<World> = {}): World {
  return {
    waiting: ['run-a'],
    drift: {},
    connectivity: 'online',
    credential: null,
    busy: false,
    admitThrows: {},
    admitted: [],
    blocked: [],
    settledElsewhere: new Set(),
    reachesNetwork: true,
    frozen: false,
    freezeDuringCredentialRead: false,
    ...overrides,
  };
}

function dependencies(state: World): ReconnectPreflightDependencies {
  return {
    waitingRuns: () => state.waiting.map((runRecordId) => ({ runRecordId })),
    stillWaiting: (runRecordId) => !state.settledElsewhere.has(runRecordId) && !state.admitted.includes(runRecordId),
    drift: (runRecordId) => state.drift[runRecordId] ?? [],
    block: (runRecordId, reasons, cause) => {
      state.blocked.push({ runRecordId, reasons, cause });
    },
    reachesNetwork: state.reachesNetwork,
    connectivity: () => state.connectivity,
    credentialReadiness: async () => {
      if (state.freezeDuringCredentialRead) state.frozen = true;
      return state.credential;
    },
    slotBusy: () => state.busy,
    admit: (runRecordId) => {
      const error = state.admitThrows[runRecordId];
      if (error !== undefined) throw error;
      state.admitted.push(runRecordId);
      state.busy = true;
    },
    frozen: () => state.frozen,
  };
}

describe('Reconnect Preflight', () => {
  it('does nothing at all while no Run waits', async () => {
    const state = world({ waiting: [] });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 0, blocked: 0, waiting: 0 });
  });

  it('admits a waiting Run once the device is online, its credential ready and its plan unchanged (OFF-008)', async () => {
    const state = world({ credential: 'present' });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
    expect(state.admitted).toEqual(['run-a']);
  });

  it('leaves every Run waiting while the device has no network its route needs, and reads nothing else', async () => {
    const state = world({ connectivity: 'offline', waiting: ['run-a', 'run-b'], drift: { 'run-a': ['处理范围'] } });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 0, blocked: 0, waiting: 2 });
    expect(state.blocked).toEqual([]);
  });

  it('ignores the reading for a route that reaches no network', async () => {
    const state = world({ connectivity: 'offline', reachesNetwork: false });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
  });

  it('leaves a Run waiting while its credential is missing — a blocker, never drift (OFF-009)', async () => {
    const state = world({ credential: 'missing', drift: { 'run-a': ['主编辑角色的模型服务'] } });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
    expect(state.blocked).toEqual([]);
  });

  it('blocks a Run whose bound plan no longer stands, naming what moved, and never dispatches it (OFF-008)', async () => {
    const state = world({ drift: { 'run-a': ['处理范围', '前一修订版'] } });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
    expect(state.blocked).toEqual([{ runRecordId: 'run-a', reasons: ['需要重新确认计划：处理范围、前一修订版已经变化，这次授权不再对应当前的情况。'], cause: 'plan-moved' }]);
    expect(planDriftReason(['处理范围'])).toBe('需要重新确认计划：处理范围已经变化，这次授权不再对应当前的情况。');
    expect(state.admitted).toEqual([]);
  });

  it('leaves a Run waiting for the slot, and admits at most one per look because the slot holds one', async () => {
    const busy = world({ busy: true });
    expect(await reconnectPreflight(dependencies(busy))).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
    const two = world({ waiting: ['run-a', 'run-b'] });
    expect(await reconnectPreflight(dependencies(two))).toEqual({ admitted: 1, blocked: 0, waiting: 1 });
    expect(two.admitted).toEqual(['run-a']);
  });

  it('leaves a Run waiting when the owner answers it is busy or stopping, and blocks it with the owner\'s reason otherwise', async () => {
    for (const code of ['EXECUTION_BUSY', 'EXECUTION_STOPPING']) {
      const state = world({ admitThrows: { 'run-a': new AdmissionError(code, '稍后再试。') } });
      expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
    }
    const never = world({ admitThrows: { 'run-a': new AdmissionError('EXECUTION_SOURCE_NOT_TRANSMITTABLE', '当前图书不在可传输的集合内；未发起任何传输。') } });
    expect(await reconnectPreflight(dependencies(never))).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
    expect(never.blocked).toEqual([{ runRecordId: 'run-a', reasons: ['当前图书不在可传输的集合内；未发起任何传输。'], cause: 'launch' }]);
  });

  it('skips a Run the editor cancelled, or another look admitted, while it read the credential', async () => {
    const state = world({ waiting: ['run-a', 'run-b'], settledElsewhere: new Set(['run-a']) });
    expect(await reconnectPreflight(dependencies(state))).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
    expect(state.admitted).toEqual(['run-b']);
  });

  it('admits and blocks nothing while a replacement of the local data is prepared or waits, even one begun while it looked (Issue #434 review)', async () => {
    // Frozen before the look: every Run waits, and the credential is not even read.
    const before = world({ waiting: ['run-a', 'run-b'], drift: { 'run-b': ['稿件'] }, frozen: true, freezeDuringCredentialRead: false });
    let read = false;
    const deps = dependencies(before);
    expect(await reconnectPreflight({ ...deps, credentialReadiness: async () => { read = true; return null; } })).toEqual({ admitted: 0, blocked: 0, waiting: 2 });
    expect([read, before.admitted, before.blocked]).toEqual([false, [], []]);
    // A replacement asked for while the look awaited the credential: nothing is admitted or blocked after it.
    const during = world({ waiting: ['run-a', 'run-b'], drift: { 'run-b': ['稿件'] }, freezeDuringCredentialRead: true });
    expect(await reconnectPreflight(dependencies(during))).toEqual({ admitted: 0, blocked: 0, waiting: 2 });
    expect([during.frozen, during.admitted, during.blocked]).toEqual([true, [], []]);
  });
});
