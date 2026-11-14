import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS } from '../../src/service/launch-policy.js';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { NETWORK_ALLOWANCE_INVALID_CODE, NETWORK_DENIED_CODE, admitTicketHost, allowanceAdmitsConnection, hostAllowanceSet, installNodeNetworkDenial, perTicketHostAdmissionArmed } from '../../src/shared/network-denial.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';

// The denial patches process-wide Node primitives, so this file runs in its own isolated worker.
installNodeNetworkDenial();

function deniedCode(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return 'no-throw';
}

describe('installNodeNetworkDenial', () => {
  it('blocks model, search, public fetch and discovery/probe transports 100% in development-ci (#1453)', async () => {
    const endpoint = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]!.endpoint;
    const endpoints = { model: endpoint, search: SEARCH_BACKENDS.find((backend) => backend.shipped)!.endpoint!,
      publicFetch: 'https://example.org/', discoveryProbe: new URL('/models', endpoint).href };
    for (const [operation, target] of Object.entries(endpoints))
      await expect(fetch(target), operation).rejects.toMatchObject({ code: NETWORK_DENIED_CODE });
  });

  it('is idempotent', () => {
    expect(() => installNodeNetworkDenial()).not.toThrow();
  });

  it('denies HTTP, HTTPS, and raw socket clients', () => {
    expect(deniedCode(() => http.request({ host: '127.0.0.1', port: 9 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => https.get('https://127.0.0.1:9/'))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => net.connect({ host: '127.0.0.1', port: 9 }))).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => new http.ClientRequest({ host: '127.0.0.1', port: 9 }))).toBe(NETWORK_DENIED_CODE);
  });

  it('denies servers and DNS', () => {
    expect(deniedCode(() => http.createServer())).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => net.createServer())).toBe(NETWORK_DENIED_CODE);
    expect(deniedCode(() => dns.lookup('example.invalid', () => undefined))).toBe(NETWORK_DENIED_CODE);
  });

  it('denies fetch with the fixed code', async () => {
    await expect(fetch('http://127.0.0.1:9/')).rejects.toMatchObject({ code: NETWORK_DENIED_CODE });
  });

  it('denies WebSocket construction', () => {
    expect(deniedCode(() => new WebSocket('ws://127.0.0.1:9/'))).toBe(NETWORK_DENIED_CODE);
  });

  // development-ci, guests and CI (#473): nothing is armed, so no search backend host opens by connection, by ticket or by fetch.
  it('keeps every shipped search backend host closed: no allowance, no per-ticket admission, no fetch', async () => {
    expect(hostAllowanceSet()).toEqual([]);
    expect(perTicketHostAdmissionArmed()).toBe(false);
    const shipped = SEARCH_BACKENDS.filter((entry) => entry.shipped);
    expect(shipped).toHaveLength(5);
    for (const [index, entry] of shipped.entries()) {
      expect(allowanceAdmitsConnection([{ host: entry.host, port: 443 }])).toBe(false);
      expect(() => admitTicketHost({ host: entry.host!, port: 443, ticketId: `ticket-${index}` })).toThrowError(new RegExp(NETWORK_ALLOWANCE_INVALID_CODE, 'u'));
      await expect(fetch(entry.endpoint!)).rejects.toMatchObject({ code: NETWORK_DENIED_CODE });
    }
  });
});
