import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

/**
 * Whether this device has a network its model service could be reached over (Issue #502, plan slice S74b;
 * V2-UX-OFF-004, UI ADR 0008). The reading is local and side-effect-free, never a probe: nothing is sent,
 * no name is resolved, and the process-wide network denial is neither consulted nor relaxed. The product has
 * no way to know a model service is reachable short of calling it, and calling it is exactly what a Run in
 * Connectivity Wait must not do (OFF-005), so this answers only the part a device can know about itself.
 * Reconnect Preflight then decides the rest from the credential and the plan.
 */
export type Connectivity = 'online' | 'offline';

/**
 * Online when any interface carries an address that is neither internal nor link-local. A link-local address
 * (169.254/16, fe80::/10) is what an interface assigns itself when no network answered it, so an adapter that
 * is up but reaches nothing still reads offline.
 */
export function hostConnectivity(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): Connectivity {
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.internal) continue;
      if (address.family === 'IPv4' && address.address.startsWith('169.254.')) continue;
      if (address.family === 'IPv6' && /^fe[89ab]/iu.test(address.address)) continue;
      return 'online';
    }
  }
  return 'offline';
}

/**
 * J-04's connectivity control (`--j04-connectivity-path`): the file the Journey writes says `offline`, or the
 * reading is online — when it says anything else, and before it exists. Read at each reading, so one launch
 * can go offline and come back, which a launch-time flag alone could not show.
 */
export function controlledConnectivity(path: string): Connectivity {
  try {
    return readFileSync(path, 'utf8').trim() === 'offline' ? 'offline' : 'online';
  } catch {
    return 'online';
  }
}

/**
 * What the service knows about reaching a model service, read once per plan the drawer shows (Issue #502).
 * The store asks it three things and decides nothing else from it.
 */
export interface TaskPlanConnectivity {
  /** This device's reading now: local, never a probe. */
  reading(): Connectivity;
  /** Whether a plan whose route is this kind reaches its model over the network. */
  reachesNetwork(routeKind: string): boolean;
  /** Whether the one execution slot is held now, so a waiting Run would wait for it. */
  slotBusy(): boolean;
  /**
   * Whether this launch can still carry a stopped Run under the Execution Binding it persisted — go on with it, or
   * form what it kept into a revision when it is cancelled (Issue #422, S76c). Absent, it can.
   */
  carriesStoppedRun?(runRecordId: string): boolean;
}

/** A reader for callers that read plans without a service: always online, no route reaching a network, a free slot. */
export const ALWAYS_ONLINE: TaskPlanConnectivity = {
  reading: () => 'online',
  reachesNetwork: () => false,
  slotBusy: () => false,
};
