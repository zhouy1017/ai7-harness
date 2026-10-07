import type { ReconnectPreflightProjection } from '../shared/protocol.js';
import type { Connectivity } from './connectivity.js';

/**
 * What Reconnect Preflight reads and does (Issue #502), handed in by the service so the rule below is the whole
 * of it and can be exercised without one.
 */
export interface ReconnectPreflightDependencies {
  /** The waiting Runs this preflight covers, oldest first. */
  waitingRuns(): ReadonlyArray<{ runRecordId: string }>;
  /** Whether the Run still waits — another preflight or the editor's 取消 may have settled it meanwhile. */
  stillWaiting(runRecordId: string): boolean;
  /** The labels of the material inputs of the Run's bound plan that moved; none while the plan stands. */
  drift(runRecordId: string): ReadonlyArray<string>;
  /**
   * Block the Run with its reasons and why (Issue #536): `plan-moved` when its bound plan moved, `launch` when this
   * launch cannot admit it. It never dispatches.
   */
  block(runRecordId: string, reasons: ReadonlyArray<string>, cause: WaitingRunBlockCause): void;
  /** Whether this launch's baseline route reaches its model over the network. */
  reachesNetwork: boolean;
  /** This device's reading now: local, never a probe. */
  connectivity(): Connectivity;
  /** The readiness the dispatch check itself reports; `null` when the route resolves no credential. */
  credentialReadiness(): Promise<'present' | 'missing' | null>;
  /** Whether the one execution slot is held. */
  slotBusy(): boolean;
  /** Admit the Run to the slot and dispatch it, through the execution owner; throws its admission error. */
  admit(runRecordId: string): void;
  /**
   * Whether nothing may be admitted or blocked now (Issue #434 review): a replacement of the local data is being prepared or
   * waits, and what a Run wrote would be lost with the data it replaces. Every waiting Run then waits.
   */
  frozen(): boolean;
}

/** Admission refusals that are only a matter of time: the slot is held, or the service is stopping. */
const RETRY_LATER = new Set(['EXECUTION_BUSY', 'EXECUTION_STOPPING']);

/** Why Reconnect Preflight blocked a waiting Run (Issue #536): its bound plan moved, or this launch cannot admit it. */
export type WaitingRunBlockCause = 'plan-moved' | 'launch';

/** 需要重新确认计划 (OFF-008): the state of a waiting Run whose plan moved before it could start. */
export const PLAN_MOVED_LABEL = '需要重新确认计划' as const;

/** 需要重新确认计划 (OFF-008), with the material inputs that moved named in the reason. */
export function planDriftReason(changed: ReadonlyArray<string>): string {
  return `${PLAN_MOVED_LABEL}：${changed.join('、')}已经变化，这次授权不再对应当前的情况。`;
}

/**
 * Reconnect Preflight (Issue #502, plan slice S74b; V2-UX-OFF-007 to OFF-009, OFF-013, UI ADR 0008). Each Run
 * waiting in Connectivity Wait, oldest first, is
 * - left waiting while this device has no network its route needs;
 * - left waiting while the credential its route resolves is missing: a blocker the editor fixes in 设置, never
 *   plan drift (OFF-009);
 * - blocked with what moved when the plan its authorization bound no longer stands — it never dispatches
 *   (OFF-008);
 * - left waiting while every place of the execution owner's governor is taken, since a waiting Run takes no
 *   place until it is admitted (Issue #49, S14);
 * - otherwise admitted to a place through the execution owner, exactly as an immediate start is, and
 *   dispatched — as many as the governor has places for; the rest wait for the next preflight.
 * An admission this launch can never make blocks the Run with the owner's own reason rather than leaving it to
 * wait for nothing. Nothing is sent and no usage arises before admission, and no credential value is read here —
 * only the readiness the dispatch check reports.
 */
export async function reconnectPreflight(deps: ReconnectPreflightDependencies): Promise<ReconnectPreflightProjection> {
  const outcome = { admitted: 0, blocked: 0, waiting: 0 };
  const runs = deps.waitingRuns();
  if (runs.length === 0) return outcome;
  if (deps.frozen()) return { ...outcome, waiting: runs.length };
  const offline = deps.reachesNetwork && deps.connectivity() === 'offline';
  const credential = offline ? null : await deps.credentialReadiness();
  for (const run of runs) {
    // Read again after the await: the editor may have cancelled, or another preflight admitted, meanwhile — or a replacement
    // may have begun, which nothing admitted or blocked may cross (Issue #434 review).
    if (deps.frozen()) {
      outcome.waiting += 1;
      continue;
    }
    if (!deps.stillWaiting(run.runRecordId)) continue;
    if (offline || credential === 'missing') {
      outcome.waiting += 1;
      continue;
    }
    const changed = deps.drift(run.runRecordId);
    if (changed.length > 0) {
      deps.block(run.runRecordId, [planDriftReason(changed)], 'plan-moved');
      outcome.blocked += 1;
      continue;
    }
    if (deps.slotBusy()) {
      outcome.waiting += 1;
      continue;
    }
    try {
      deps.admit(run.runRecordId);
      outcome.admitted += 1;
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
      if (RETRY_LATER.has(code)) {
        outcome.waiting += 1;
        continue;
      }
      deps.block(run.runRecordId, [error instanceof Error && error.message.length > 0 ? error.message : '运行未能进入调度。'], 'launch');
      outcome.blocked += 1;
    }
  }
  return outcome;
}
