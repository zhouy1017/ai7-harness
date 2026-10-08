import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
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
  guardedLookup,
  guardedLookupPromise,
  isPublicAddress,
  isPublicHostName,
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

  it('vets what a ticket host resolves to inside the lookup the connect uses, with no resolver of its own (a stub here)', async () => {
    const answers: Record<string, unknown> = {};
    const stub = (hostname: unknown, options: unknown, callback?: unknown): void => {
      const done = (typeof options === 'function' ? options : callback) as (error: Error | null, address?: unknown, family?: number) => void;
      const answer = answers[hostname as string];
      if (answer instanceof Error) done(answer);
      else if (Array.isArray(answer)) done(null, answer);
      else done(null, answer, String(answer).includes(':') ? 6 : 4);
    };
    const lookup = guardedLookup(stub as (...args: unknown[]) => unknown);
    const ask = (hostname: string, options: unknown = {}): Promise<{ error: Error | null; address?: unknown }> =>
      new Promise((resolveAnswer) => { lookup(hostname, options, (error: Error | null, address?: unknown) => resolveAnswer({ error, address })); });
    const release = admitTicketHost({ host: 'example.org', port: 443 });
    try {
      answers['example.org'] = '93.184.215.14';
      expect(await ask('example.org')).toEqual({ error: null, address: '93.184.215.14' });
      for (const internal of ['127.0.0.1', '169.254.169.254', '10.1.2.3', '192.168.0.10', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) {
        answers['example.org'] = internal;
        expect((await ask('example.org')).error).toMatchObject({ code: NETWORK_DENIED_CODE });
      }
      // An `all: true` answer is denied when any one of its addresses is not public, and an empty one is denied too.
      answers['example.org'] = [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }];
      expect((await ask('example.org', { all: true })).error).toMatchObject({ code: NETWORK_DENIED_CODE });
      answers['example.org'] = [];
      expect((await ask('example.org', { all: true })).error).toMatchObject({ code: NETWORK_DENIED_CODE });
      answers['example.org'] = [{ address: '93.184.215.14', family: 4 }, { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 }];
      expect((await ask('example.org', { all: true })).error).toBeNull();
      // A resolver error passes through as itself.
      answers['example.org'] = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      expect((await ask('example.org')).error).toMatchObject({ code: 'ENOTFOUND' });
      // The policy-armed hosts are not ticket hosts: their answers pass as they always did.
      answers['opencode.ai'] = '10.0.0.5';
      expect(await ask('opencode.ai')).toEqual({ error: null, address: '10.0.0.5' });
      // A name nothing admits is denied before any query.
      expect(deniedCode(() => lookup('example.net', {}, () => undefined))).toBe(NETWORK_DENIED_CODE);
      // A connect to the ticket host that brings its own resolver would skip the vetting, so it is denied.
      expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])).toBe(true);
      expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443, lookup: stub }])).toBe(false);
      expect(allowanceAdmitsConnection([{ host: 'opencode.ai', port: 443, lookup: stub }])).toBe(true);
      // The promise form vets the same way.
      const promised = guardedLookupPromise(async (hostname: unknown) => ({ address: answers[hostname as string], family: 4 }));
      answers['example.org'] = '169.254.169.254';
      await expect(promised('example.org')).rejects.toMatchObject({ code: NETWORK_DENIED_CODE });
      answers['example.org'] = '93.184.215.14';
      await expect(promised('example.org')).resolves.toEqual({ address: '93.184.215.14', family: 4 });
    } finally {
      release();
    }
    // The installed lookups are these guards.
    expect(dns.lookup.name).toBe('gatedLookup');
    expect(dnsPromises.lookup.name).toBe('gatedLookupPromise');
  });

  it('reads every non-public range as non-public, in every IPv6 spelling', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.254', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '192.0.0.8', '198.18.0.1', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
      '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '::127.0.0.1', '64:ff9b::a9fe:a9fe',
      'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'ff02::1', '2001:db8::1', 'not-an-address', '1.2.3', '::ffff:1.2.3.4.5',
    ]) {
      expect([address, isPublicAddress(address)]).toEqual([address, false]);
    }
    for (const address of ['93.184.215.14', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '2606:4700::1111', '::ffff:93.184.215.14', '64:ff9b::808:808']) {
      expect([address, isPublicAddress(address)]).toEqual([address, true]);
    }
  });

  it('never admits a name in a zone only a local or private resolver answers', () => {
    for (const host of ['localhost', 'a.localhost', 'printer.local', 'metadata.google.internal', 'router.home.arpa', 'nas.lan', 'single']) {
      expect([host, isPublicHostName(host)]).toEqual([host, false]);
      expect(() => admitTicketHost({ host, port: 443 })).toThrowError(invalid);
    }
    expect(isPublicHostName('example.org')).toBe(true);
    expect(isPublicHostName('127.0.0.1.nip.io')).toBe(true); // a public name: its answer is what the lookup vets
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
