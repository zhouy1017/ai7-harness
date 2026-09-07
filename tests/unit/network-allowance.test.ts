import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import {
  NETWORK_ALLOWANCE_INVALID_CODE,
  NETWORK_ALLOWANCE_LATE_CODE,
  NETWORK_DENIED_CODE,
  allowanceAdmitsConnection,
  allowanceAdmitsLookup,
  armSingleHostAllowance,
  connectionTargetOf,
  installNodeNetworkDenial,
  singleHostAllowance,
} from '../../src/shared/network-denial.js';

// The single-host allowance of the developer-live scope, exercised without any socket: the gates are
// proven through their pure admission predicates and through synchronous denials of every other
// target. This file arms the allowance before the process-wide install, so it runs in its own worker.

const ALLOWED = { host: 'opencode.ai', port: 443 };

function deniedCode(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return 'no-throw';
}

describe('armSingleHostAllowance', () => {
  it('validates the target, arms once, and refuses a late arming after the install', () => {
    expect(singleHostAllowance()).toBeNull();
    expect(() => armSingleHostAllowance({ host: 'opencode.ai', port: 0 })).toThrowError(new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u'));
    expect(() => armSingleHostAllowance({ host: 'not a host', port: 443 })).toThrowError(new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u'));
    expect(() => armSingleHostAllowance({ host: 'https://opencode.ai', port: 443 })).toThrowError(new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u'));
    expect(singleHostAllowance()).toBeNull();
    armSingleHostAllowance({ host: 'OpenCode.ai', port: 443 });
    expect(singleHostAllowance()).toEqual(ALLOWED);
    expect(() => armSingleHostAllowance(ALLOWED)).toThrowError(new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u'));
    expect(() => installNodeNetworkDenial()).not.toThrow();
    expect(() => armSingleHostAllowance({ host: 'example.com', port: 443 })).toThrowError(new RegExp(NETWORK_ALLOWANCE_LATE_CODE, 'u'));
    expect(singleHostAllowance()).toEqual(ALLOWED);
  });

  it('admits exactly the armed host and port in every connect shape and denies everything else', () => {
    expect(connectionTargetOf([{ host: 'opencode.ai', port: 443 }])).toEqual(ALLOWED);
    expect(connectionTargetOf([{ hostname: 'OPENCODE.AI', port: '443' }])).toEqual(ALLOWED);
    expect(connectionTargetOf([443, 'opencode.ai'])).toEqual(ALLOWED);
    expect(connectionTargetOf(['443', 'opencode.ai'])).toEqual(ALLOWED);
    expect(connectionTargetOf([443])).toEqual({ host: 'localhost', port: 443 });
    expect(connectionTargetOf([{ path: '\\\\.\\pipe\\ai7', host: 'opencode.ai', port: 443 }])).toBeNull();
    expect(connectionTargetOf([{ port: 'x' }])).toBeNull();
    expect(connectionTargetOf([])).toBeNull();
    expect(allowanceAdmitsConnection([{ host: 'opencode.ai', port: 443 }])).toBe(true);
    expect(allowanceAdmitsConnection([{ host: 'opencode.ai', port: 443, servername: 'opencode.ai', ALPNProtocols: ['http/1.1'] }])).toBe(true);
    expect(allowanceAdmitsConnection([{ host: 'opencode.ai', port: 80 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ host: 'api.opencode.ai', port: 443 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ host: 'opencode.ai.attacker.invalid', port: 443 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ host: '127.0.0.1', port: 443 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ path: '/tmp/socket' }])).toBe(false);
    expect(allowanceAdmitsLookup(['opencode.ai'])).toBe(true);
    expect(allowanceAdmitsLookup(['OPENCODE.AI', { family: 4 }])).toBe(true);
    expect(allowanceAdmitsLookup(['api.opencode.ai'])).toBe(false);
    expect(allowanceAdmitsLookup([''])).toBe(false);
  });

  it('keeps every other primitive, host, and port denied synchronously, before any socket exists', () => {
    expect(deniedCode(() => net.connect({ host: '127.0.0.1', port: 9 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => net.connect({ host: 'opencode.ai', port: 80 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => net.createConnection(9, 'opencode.ai'))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => new net.Socket().connect({ host: 'api.opencode.ai', port: 443 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => tls.connect({ host: 'api.opencode.ai', port: 443 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => tls.connect(443, 'example.com'))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => dns.lookup('example.invalid', () => undefined))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => dns.resolve4('opencode.ai', () => undefined))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => dnsPromises.resolve4('opencode.ai'))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => http.request({ host: 'opencode.ai', port: 443 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => net.createServer())).toBe(NETWORK_DENIED_CODE);
  });

  it('keeps the global fetch denied even for the armed host; only a captured native fetch may reach it', async () => {
    await expect(fetch('https://opencode.ai/zen/go/v1/chat/completions', { method: 'POST' })).rejects.toMatchObject({ code: NETWORK_DENIED_CODE });
    // The promise-returning resolvers deny synchronously, exactly as the callback forms do: no denied
    // call ever reaches the event loop, so an unadmitted lookup cannot be awaited into existence.
    expect(deniedCode(() => dnsPromises.lookup('example.invalid'))).toBe(NETWORK_DENIED_CODE);
  });
});
