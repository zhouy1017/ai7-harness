import net from 'node:net';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { armSingleHostAllowance, installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { proxyAwareFetch } from '../../src/service/provider/proxy-setting.js';

// This isolated worker installs the actual denial over a fake socket primitive. No socket is opened.
const capturedFetch = globalThis.fetch;
const connections: unknown[] = [];
class FakeSocket extends EventEmitter {
  destroyed = false;
  setKeepAlive(): this { return this; }
  setNoDelay(): this { return this; }
  destroy(): this { this.destroyed = true; this.emit('close'); return this; }
  unref(): this { return this; }
}
const fakeConnect = (options: unknown): FakeSocket => {
  connections.push(options);
  const socket = new FakeSocket();
  queueMicrotask(() => socket.emit('error', Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })));
  return socket;
};
Object.defineProperty(net, 'connect', { configurable: true, writable: true, value: fakeConnect });
Object.defineProperty(tls, 'connect', { configurable: true, writable: true, value: fakeConnect });
armSingleHostAllowance({ host: 'model.invalid', port: 443 });
installNodeNetworkDenial();

describe('native Node fetch with real ProxyAgent under installed denial', () => {
  it.each(['http', 'https'] as const)('reaches only the request-scoped %s proxy socket and classifies its physical-stage failure', async (protocol) => {
    const before = connections.length;
    const report = vi.fn();
    const fetch = proxyAwareFetch(capturedFetch, async () => ({ mode: 'proxy', protocol, hostPort: 'proxy.invalid:8080' }), undefined, report);
    await expect(fetch('https://not-admitted.invalid/')).rejects.toThrow();
    expect(connections).toHaveLength(before);
    expect(() => net.connect({ host: 'proxy.invalid', port: 8080 })).toThrow();
    await expect(fetch('https://model.invalid/v1/messages')).rejects.toMatchObject({ code: 'AI7_PROXY_UNREACHABLE' });
    expect(connections).toHaveLength(before + 1);
    expect(connections[before]).toMatchObject({ host: 'proxy.invalid', port: '8080' });
    expect(report).toHaveBeenLastCalledWith('proxy-unreachable');
    expect(() => net.connect({ host: 'proxy.invalid', port: 8080 })).toThrow();
    await expect(globalThis.fetch('https://model.invalid/')).rejects.toMatchObject({ code: 'AI7_OUTBOUND_NETWORK_DENIED' });
  });
});
