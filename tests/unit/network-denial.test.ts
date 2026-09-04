import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { NETWORK_DENIED_CODE, installNodeNetworkDenial } from '../../src/shared/network-denial.js';

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
});
