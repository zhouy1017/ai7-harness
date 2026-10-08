import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import {
  NETWORK_ALLOWANCE_INVALID_CODE,
  NETWORK_ALLOWANCE_LATE_CODE,
  NETWORK_DENIED_CODE,
  admitTicketHost,
  allowanceAdmitsConnection,
  allowanceAdmitsLookup,
  armHostAllowanceSet,
  armPerTicketHostAdmission,
  hostAllowanceSet,
  installNodeNetworkDenial,
  perTicketHostAdmissionArmed,
  singleHostAllowance,
} from '../../src/shared/network-denial.js';

// The policy-declared allowance set and per-ticket host admission (ADR 0080 §7.3; Issue #473, S87-f3a), proven without a
// socket. This file arms both before the process-wide install, so it runs in its own worker; the single-host file beside
// it proves the unarmed reading every launch has today.

const MODEL = { host: 'opencode.ai', port: 443 };
const SEARCH = { host: 'search.parallel.ai', port: 443 };
const invalid = new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u');

function deniedCode(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return 'no-throw';
}

describe('the allowance set', () => {
  it('arms once before the install, validates every host, and refuses a late, empty, or duplicated set', () => {
    expect(() => admitTicketHost({ host: 'example.org', port: 443 })).toThrowError(invalid);
    expect(() => armHostAllowanceSet([])).toThrowError(invalid);
    expect(() => armHostAllowanceSet([MODEL, { host: 'OpenCode.ai', port: 443 }])).toThrowError(invalid);
    expect(() => armHostAllowanceSet([MODEL, { host: 'not a host', port: 443 }])).toThrowError(invalid);
    expect(hostAllowanceSet()).toEqual([]);
    armHostAllowanceSet([MODEL, SEARCH]);
    expect(hostAllowanceSet()).toEqual([MODEL, SEARCH]);
    // The model endpoint stays the single allowance every existing reader sees.
    expect(singleHostAllowance()).toEqual(MODEL);
    expect(() => armHostAllowanceSet([SEARCH])).toThrowError(invalid);
    expect(perTicketHostAdmissionArmed()).toBe(false);
    armPerTicketHostAdmission();
    expect(() => armPerTicketHostAdmission()).toThrowError(invalid);
    installNodeNetworkDenial();
    expect(() => armHostAllowanceSet([{ host: 'example.org', port: 443 }])).toThrowError(new RegExp(NETWORK_ALLOWANCE_LATE_CODE, 'u'));
    expect(() => armPerTicketHostAdmission()).toThrowError(new RegExp(NETWORK_ALLOWANCE_LATE_CODE, 'u'));
  });

  it('admits exactly the armed hosts and ports', () => {
    expect(allowanceAdmitsConnection([{ host: 'opencode.ai', port: 443 }])).toBe(true);
    expect(allowanceAdmitsConnection([{ host: 'search.parallel.ai', port: 443 }])).toBe(true);
    expect(allowanceAdmitsConnection([{ host: 'search.parallel.ai', port: 80 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ host: 'mcp.exa.ai', port: 443 }])).toBe(false);
    expect(allowanceAdmitsLookup(['search.parallel.ai'])).toBe(true);
    expect(allowanceAdmitsLookup(['example.org'])).toBe(false);
    expect(deniedCode(() => tls.connect({ host: 'example.org', port: 443 }))).toBe(NETWORK_DENIED_CODE);
  });
});

describe('per-ticket host admission', () => {
  it('holds one public host open for one ticket and closes it on release', () => {
    const release = admitTicketHost({ host: 'Example.org', port: 443 });
    expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])).toBe(true);
    expect(allowanceAdmitsLookup(['example.org'])).toBe(true);
    expect(allowanceAdmitsConnection([{ host: 'example.org', port: 80 }])).toBe(false);
    // One at a time: maxParallelToolCalls is 1, and a second ticket waits for the first to release.
    expect(() => admitTicketHost({ host: 'example.com', port: 443 })).toThrowError(invalid);
    expect(allowanceAdmitsConnection([{ host: 'example.com', port: 443 }])).toBe(false);
    release();
    expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])).toBe(false);
    expect(allowanceAdmitsLookup(['example.org'])).toBe(false);
    expect(deniedCode(() => net.connect({ host: 'example.org', port: 443 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => dns.lookup('example.org', () => undefined))).toBe(NETWORK_DENIED_CODE);
  });

  it('never opens an address literal or a loopback name, and a stale release closes nothing it did not open', () => {
    for (const host of ['127.0.0.1', '10.0.0.1', 'localhost', 'a.localhost', 'single']) {
      expect(() => admitTicketHost({ host, port: 443 })).toThrowError(invalid);
    }
    const first = admitTicketHost({ host: 'example.org', port: 443 });
    first();
    const second = admitTicketHost({ host: 'example.net', port: 443 });
    first();
    expect(allowanceAdmitsConnection([{ host: 'example.net', port: 443 }])).toBe(true);
    second();
    expect(allowanceAdmitsConnection([{ host: 'example.net', port: 443 }])).toBe(false);
    // The global fetch stays denied whatever is admitted: only the captured native fetch reaches a host.
    const held = admitTicketHost({ host: 'example.org', port: 443 });
    return expect(fetch('https://example.org/')).rejects.toMatchObject({ code: NETWORK_DENIED_CODE }).finally(held);
  });
});
