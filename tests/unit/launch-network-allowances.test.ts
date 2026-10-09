import { describe, expect, it } from 'vitest';
import { DEVELOPER_LIVE_POLICY_BINDING, armLaunchNetworkAllowances } from '../../src/service/launch-policy.js';
import { hostAllowanceSet, perTicketHostAdmissionArmed } from '../../src/shared/network-denial.js';

// The service entry's arming as a function of the launch form (Issue #473, S87-f3b; #742 review P3-6). Module state is
// process-wide and arms once, so the development-ci case runs first — it must arm nothing — and the developer-live case
// after it is the one arming this process sees. No denial is installed here; nothing reaches a network.

describe('armLaunchNetworkAllowances', () => {
  it('arms nothing under development-ci, where every remote primitive stays denied', () => {
    expect(armLaunchNetworkAllowances({ trustedOperationalScope: 'development-ci' })).toEqual([]);
    expect(hostAllowanceSet()).toEqual([]);
    expect(perTicketHostAdmissionArmed()).toBe(false);
  });

  it('arms the policy-declared set under developer-live — the endpoint first, then the one search host — and per-ticket admission', () => {
    const armed = armLaunchNetworkAllowances({ trustedOperationalScope: 'developer-live' });
    expect(armed).toEqual([
      { host: 'opencode.ai', port: 443 },
      { host: DEVELOPER_LIVE_POLICY_BINDING.websearchHost, port: 443 },
    ]);
    expect(DEVELOPER_LIVE_POLICY_BINDING.websearchHost).toBe('search.parallel.ai');
    expect(hostAllowanceSet()).toEqual(armed);
    expect(perTicketHostAdmissionArmed()).toBe(true);
    // A second arming in the same process fails closed, as the denial's own contract says.
    expect(() => armLaunchNetworkAllowances({ trustedOperationalScope: 'developer-live' })).toThrow('AI7_NETWORK_ALLOWANCE_INVALID');
  });
});
