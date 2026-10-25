import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admittedProxyRequest, armSingleHostAllowance, guardedConnect, guardedLookup } from '../../src/shared/network-denial.js';
import {
  ProxyConnectionEvidence, createProxyDispatcher, parseProxyUrl, proxyAwareFetch, readProxySetting, writeProxySetting, type ProxyDispatcherFactory,
} from '../../src/service/provider/proxy-setting.js';
import { DeepSeekOpenAiCompatibleAdapter, classifyTransportError } from '../../src/service/provider/deepseek-adapter.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { classifyModelFailure } from '../../src/service/provider/classification.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';

const proxy = { host: 'proxy.invalid', port: 8080 };
const modelUrl = 'https://model.invalid/v1/messages';
beforeAll(() => armSingleHostAllowance({ host: 'model.invalid', port: 443 }));
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('proxy settings validation and persistence', () => {
  it.each(['http://proxy.invalid:80', 'https://proxy.invalid:443', 'http://127.0.0.1:8080', 'http://[::1]:8080'])('accepts an explicit HTTP(S) host and port: %s', (value) => {
    expect(parseProxyUrl(value).mode).toBe('proxy');
  });
  it.each(['proxy.invalid:8080', '/proxy', 'socks://proxy.invalid:8080', 'http://proxy.invalid', 'http://proxy.invalid:0',
    'http://proxy.invalid:65536', 'http://proxy.invalid:8080/path', 'http://proxy.invalid:8080?secret=x', 'http://:8080'])('refuses malformed or unsupported URL: %s', (value) => {
    expect(() => parseProxyUrl(value)).toThrow('代理地址');
  });
  it('refuses userinfo without reflecting it, including an empty password', () => {
    for (const value of ['http://user:credential@proxy.invalid:8080', 'http://user@proxy.invalid:8080']) {
      try { parseProxyUrl(value); throw new Error('not refused'); }
      catch (error) { expect(String(error)).toContain('不能包含用户名或密码'); expect(String(error)).not.toContain('credential@'); }
    }
  });
  it('defaults off, survives restart, and logs no invalid value', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'ai7-proxy-'));
    directories.push(root);
    expect(await readProxySetting(root)).toEqual({ mode: 'direct' });
    const setting = parseProxyUrl('http://proxy.invalid:8080');
    await expect(writeProxySetting(root, setting)).resolves.toEqual(setting);
    expect(await readProxySetting(root)).toEqual(setting);
    await writeFile(join(root, 'settings', 'model-service-proxy.json'), '{"mode":"proxy","protocol":"http","hostPort":"user:credential@proxy.invalid:8080"}');
    const report = vi.fn();
    expect(await readProxySetting(root, report)).toEqual({ mode: 'direct' });
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/credential|user|proxy.invalid/u);
  });
});

describe('confined physical connection token', () => {
  it('allows one admitted request connection and lookup, refuses reuse, revocation and unrelated connections', () => {
    const original = vi.fn(() => ({}));
    const socket = guardedConnect(original);
    const lookup = guardedLookup(vi.fn(() => undefined));
    expect(() => socket(proxy)).toThrow();
    expect(() => admittedProxyRequest('https://other.invalid/', proxy)).toThrow();
    const token = admittedProxyRequest(modelUrl, proxy);
    token.run(() => {
      expect(() => socket({ host: 'other.invalid', port: 443 })).toThrow();
      const nested = guardedConnect(() => { lookup(proxy.host, () => undefined); return {}; });
      nested(proxy);
      expect(() => socket(proxy)).toThrow();
    });
    token.revoke();
    expect(() => token.run(() => socket(proxy))).toThrow();
    expect(() => socket(proxy)).toThrow();
    expect(original).not.toHaveBeenCalled();
  });
});

describe('per-request native-fetch dispatcher', () => {
  function fixture() {
    const destroy = vi.fn(async () => undefined);
    const factory = vi.fn<ProxyDispatcherFactory>(() => ({ destroy } as unknown as ReturnType<ProxyDispatcherFactory>));
    const native = vi.fn<typeof fetch>(async () => new Response('ok'));
    return { factory, native, destroy };
  }
  it('keeps default-off direct, hot-reloads the next request, and destroys the dispatcher after body consumption', async () => {
    const { factory, native, destroy } = fixture();
    let setting: Awaited<ReturnType<typeof readProxySetting>> = { mode: 'direct' };
    const fetch = proxyAwareFetch(native, async () => setting, factory);
    await (await fetch(modelUrl)).text();
    expect(factory).not.toHaveBeenCalled();
    expect(native.mock.calls[0]?.[1]).not.toHaveProperty('dispatcher');
    setting = parseProxyUrl('http://proxy.invalid:8080');
    const response = await fetch(modelUrl);
    expect(factory).toHaveBeenCalledOnce();
    expect(native.mock.calls[1]?.[1]).toHaveProperty('dispatcher');
    expect(native.mock.calls[1]?.[1]?.redirect).toBe('manual');
    expect(await response.text()).toBe('ok');
    expect(destroy).toHaveBeenCalledOnce();
    setting = { mode: 'direct' };
    await (await fetch(modelUrl)).text();
    expect(factory).toHaveBeenCalledOnce();
  });
  it('never constructs a dispatcher for a non-admitted logical host', async () => {
    const { native, factory } = fixture();
    const fetch = proxyAwareFetch(native, async () => parseProxyUrl('http://proxy.invalid:8080'), factory);
    await expect(fetch('https://other.invalid/')).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled(); expect(native).not.toHaveBeenCalled();
  });
  it('sanitizes proxy connect errors and maps proxy failure to preflight and resumable interruption', async () => {
    const { factory, destroy } = fixture();
    factory.mockImplementation((_uri, failed) => { failed(); return { destroy } as unknown as ReturnType<ProxyDispatcherFactory>; });
    const native = vi.fn<typeof fetch>(async () => { throw new Error('http://proxy.invalid:8080/private?secret=credential'); });
    let failure: 'proxy-unreachable' | 'model-service-unreachable' | null = null;
    const fetch = proxyAwareFetch(native, async () => parseProxyUrl('http://proxy.invalid:8080'), factory, (value) => { failure = value; });
    let classified: ReturnType<typeof classifyTransportError> | undefined;
    try { await fetch(modelUrl); } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/proxy.invalid|credential|http/u);
      classified = classifyTransportError(error);
    }
    expect(classified?.message).toContain('代理不可达');
    expect(classifyModelFailure(classified!, { QUOTA_EXCEEDED_CODE: 'quota', INVALID_CREDENTIAL_CODE: 'credential', CONTEXT_WINDOW_EXCEEDED_CODE: 'context' }))
      .toMatchObject({ signal: 'interrupted', failureClass: 'proxy-unreachable', retrySafe: false });
    const preflight = (online: boolean) => reconnectPreflight({ waitingRuns: () => [], stillWaiting: () => true,
      drift: () => [], block: () => undefined, reachesNetwork: true, connectivity: () => online ? 'online' : 'offline',
      credentialReadiness: async () => 'present', slotBusy: () => false, admit: () => undefined, frozen: () => false,
      transportFailure: () => failure });
    expect((await preflight(true)).connectivity).toEqual({ classification: 'proxy-unreachable', label: '代理不可达' });
    expect((await preflight(false)).connectivity).toEqual({ classification: 'offline', label: '离线' });
    expect(native).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('proves a cancellation before the native call unsent for that exact request only, and keeps sent timeouts unknown (#1131)', async () => {
    const { native, factory } = fixture();
    const controller = new AbortController();
    const fetch = proxyAwareFetch(native, async () => {
      controller.abort();
      return { mode: 'direct' };
    }, factory);
    const init = { method: 'POST', body: '{}', signal: controller.signal };
    let failure: unknown;
    try { await fetch(modelUrl, init); } catch (error) { failure = error; }
    expect(classifyTransportError(failure, true, init).code).toBe('TRANSPORT_FAILED');
    // Another request object, no identity, or the existing coded hint alone proves nothing once sent.
    expect(classifyTransportError(failure, true, { ...init }).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(classifyTransportError(failure, true).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(classifyTransportError(Object.assign(new Error('forged'), { code: 'TRANSPORT_FAILED', requestSent: false }), true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(native).not.toHaveBeenCalled();
    const bodyTimeout = proxyAwareFetch(async () => { throw new TypeError('private', { cause: { code: 'UND_ERR_BODY_TIMEOUT' } }); }, async () => ({ mode: 'direct' }));
    expect(classifyTransportError(await bodyTimeout(modelUrl).catch((error: unknown) => error), true).code).toBe('AI7_OUTCOME_UNKNOWN');
    const timeout = proxyAwareFetch(async () => { throw new DOMException('private', 'TimeoutError'); }, async () => ({ mode: 'direct' }));
    expect(classifyTransportError(await timeout(modelUrl).catch((error: unknown) => error), true).code).toBe('AI7_OUTCOME_UNKNOWN');
  });
  it('reports an injected connect failure as unreachable but proves no send only from the production connector (#1080 review, #1131)', async () => {
    const { factory, destroy } = fixture();
    factory.mockImplementation((_uri, failed) => { failed(); return { destroy } as unknown as ReturnType<ProxyDispatcherFactory>; });
    const connectTimeout = async (): Promise<Response> => { throw new TypeError('private', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); };
    const reports: Array<'proxy-unreachable' | 'model-service-unreachable' | null> = [];
    const init = { method: 'POST', body: '{}' };
    const proxied = proxyAwareFetch(connectTimeout, async () => parseProxyUrl('http://proxy.invalid:8080'), factory, (value) => { reports.push(value); });
    const proxiedFailure = await proxied(modelUrl, init).catch((error: unknown) => error);
    // The cause keeps its class; an injected callback, a code or a timeout is not this call's physical connector observation.
    expect(classifyTransportError(proxiedFailure).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(proxiedFailure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
    const direct = proxyAwareFetch(connectTimeout, async () => ({ mode: 'direct' }), factory, (value) => { reports.push(value); });
    expect(classifyTransportError(await direct(modelUrl, init).catch((error: unknown) => error), true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
    const proxiedSocket = proxyAwareFetch(async () => { throw new TypeError('private', { cause: { code: 'ETIMEDOUT' } }); },
      async () => parseProxyUrl('http://proxy.invalid:8080'), factory, (value) => { reports.push(value); });
    const socketFailure = await proxiedSocket(modelUrl, init).catch((error: unknown) => error);
    expect(classifyTransportError(socketFailure).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(socketFailure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(reports).toEqual(['proxy-unreachable', 'model-service-unreachable', 'proxy-unreachable']);
  });
  it('recognizes proxy 407 separately and preserves cancellation', async () => {
    const { factory } = fixture();
    const fetch = proxyAwareFetch(async () => new Response('', { status: 407 }), async () => parseProxyUrl('https://proxy.invalid:8080'), factory);
    await expect(fetch(modelUrl)).rejects.toMatchObject({ code: 'AI7_PROXY_UNREACHABLE' });
    const aborted = proxyAwareFetch(async () => { throw new DOMException('secret', 'AbortError'); }, async () => ({ mode: 'direct' }), factory);
    await expect(aborted(modelUrl)).rejects.toMatchObject({ name: 'AbortError', message: '请求已中止或超过时限。' });
  });
});

// Issue #1131 revision 23: only this call's own production connector proves a proxied model request unsent. A loopback
// listener stands in for the proxy; no model service, credential or outside network is reached.
describe('physical proxy no-send proof through the production connector (#1131)', () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((done) => server.close(() => done())); });
  async function listen(onSocket?: (socket: Socket) => void): Promise<number> {
    const server = createServer((socket) => { socket.on('error', () => undefined); onSocket?.(socket); });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
    return (server.address() as AddressInfo).port;
  }
  async function closedPort(): Promise<number> {
    const port = await listen(); const server = servers.pop()!;
    await new Promise<void>((done) => server.close(() => done()));
    return port;
  }
  function proxiedFetch(port: number, reports: Array<string | null> = []): typeof fetch {
    return proxyAwareFetch(globalThis.fetch, async () => parseProxyUrl(`http://127.0.0.1:${port}`), createProxyDispatcher, (value) => { reports.push(value); });
  }
  const modelRequest = () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const codes = { QUOTA_EXCEEDED_CODE: 'quota', INVALID_CREDENTIAL_CODE: 'credential', CONTEXT_WINDOW_EXCEEDED_CODE: 'context' };

  it('proves a refused proxy connection sent nothing, for that exact request only', async () => {
    const reports: Array<string | null> = []; const init = modelRequest();
    const failure = await proxiedFetch(await closedPort(), reports)(modelUrl, init).then(() => null, (error: unknown) => error);
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(failure, true, modelRequest()).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(reports).toEqual(['proxy-unreachable']);
    expect(JSON.stringify(failure)).not.toMatch(/127\.0\.0\.1|model\.invalid/u);
  });

  it('proves a CONNECT the proxy itself answered 407 sent nothing', async () => {
    let connects = 0; const reports: Array<string | null> = []; const init = modelRequest();
    const port = await listen((socket) => socket.once('data', () => {
      connects += 1; socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
    }));
    const failure = await proxiedFetch(port, reports)(modelUrl, init).then(() => null, (error: unknown) => error);
    expect(connects).toBeGreaterThan(0);
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(reports).toEqual(['proxy-unreachable']);
  });

  it('keeps a call unknown once its tunnel was established, however the connection then fails', async () => {
    const init = modelRequest();
    const port = await listen((socket) => socket.once('data', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); setImmediate(() => socket.destroy());
    }));
    const failure = await proxiedFetch(port)(modelUrl, init).then(() => null, (error: unknown) => error);
    expect(failure).not.toBeNull();
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
  });

  it('keeps a native 421 replay unknown: the model request crossed the tunnel before the reconnect was refused', async () => {
    // Plain HTTP inside the CONNECT tunnel lets the loopback proxy see the model request itself; the logical host is unchanged.
    const replayUrl = 'http://model.invalid:443/v1/messages';
    let connections = 0; let tunnelledRequests = 0; const reports: Array<string | null> = []; const init = modelRequest();
    const port = await listen((socket) => {
      const ordinal = ++connections; let tunnelled = false; let buffered = '';
      socket.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('latin1');
        if (!tunnelled) {
          const end = buffered.indexOf('\r\n\r\n'); if (end === -1) return;
          buffered = buffered.slice(end + 4);
          if (ordinal > 1) { socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n'); return; }
          tunnelled = true; socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        }
        if (/\r\n\r\n\{\}$/u.test(buffered)) {
          tunnelledRequests += 1; buffered = '';
          socket.end('HTTP/1.1 421 Misdirected Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        }
      });
    });
    const failure = await proxiedFetch(port, reports)(replayUrl, init).then(() => null, (error: unknown) => error);
    expect(tunnelledRequests).toBe(1); expect(connections).toBe(2);
    expect(failure).not.toBeNull(); expect(reports).toEqual(['proxy-unreachable']);
    // The later refusal is the proxy's, but the earlier tunnel carried the request: possibly sent, never resent.
    expect(classifyTransportError(failure).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
  });

  it('gives an injected factory no evidence to forge: a fake dispatcher plus a native failure after a possible send stays unknown', async () => {
    const forged = new ProxyConnectionEvidence(); forged.connectFailed();
    const received: unknown[][] = [];
    const factory = vi.fn<ProxyDispatcherFactory>((...args: unknown[]) => {
      received.push(args); (args[1] as () => void)(); (args[2] as ProxyConnectionEvidence | undefined)?.connectFailed();
      return { destroy: async () => undefined } as unknown as ReturnType<ProxyDispatcherFactory>;
    });
    const init = modelRequest();
    const fetch = proxyAwareFetch(async () => { throw new TypeError('sent, then failed'); }, async () => parseProxyUrl('http://127.0.0.1:9'), factory);
    const failure = await fetch(modelUrl, init).then(() => null, (error: unknown) => error);
    expect(classifyTransportError(failure).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(received).toHaveLength(1); expect(received[0]).toHaveLength(2);
    expect(forged.provesNoModelRequest).toBe(true);
  });

  it('accepts physical evidence only from the owned connector, never from a factory that delegates to it', async () => {
    const init = modelRequest(); const reports: Array<string | null> = [];
    const delegating: ProxyDispatcherFactory = (uri, failed) => createProxyDispatcher(uri, failed);
    const port = await closedPort();
    const fetch = proxyAwareFetch(globalThis.fetch, async () => parseProxyUrl(`http://127.0.0.1:${port}`), delegating, (value) => { reports.push(value); });
    const failure = await fetch(modelUrl, init).then(() => null, (error: unknown) => error);
    expect(reports).toEqual(['proxy-unreachable']);
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
  });

  it('keeps each concurrent call\'s evidence and request identity its own', async () => {
    const refusedPort = await closedPort();
    const tunnelPort = await listen((socket) => socket.once('data', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); setImmediate(() => socket.destroy());
    }));
    const ports = [refusedPort, tunnelPort];
    const fetch = proxyAwareFetch(globalThis.fetch, async () => parseProxyUrl(`http://127.0.0.1:${ports.shift()!}`), createProxyDispatcher);
    const [refusedInit, tunnelledInit] = [modelRequest(), modelRequest()];
    const [refused, tunnelled] = await Promise.all([refusedInit, tunnelledInit].map((init) => fetch(modelUrl, init).then(() => null, (error: unknown) => error)));
    expect(classifyTransportError(refused, true, refusedInit).code).toBe('AI7_PROXY_UNREACHABLE');
    expect(classifyTransportError(refused, true, tunnelledInit).code).toBe('AI7_OUTCOME_UNKNOWN');
    expect(classifyTransportError(tunnelled, true, tunnelledInit).code).toBe('AI7_OUTCOME_UNKNOWN');
  });

  it('keeps a failure of the response body after a tunnelled request unknown', async () => {
    const bodyUrl = 'http://model.invalid:443/v1/messages'; const init = modelRequest(); const reports: Array<string | null> = [];
    const port = await listen((socket) => {
      let tunnelled = false; let buffered = '';
      socket.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('latin1');
        if (!tunnelled) {
          const end = buffered.indexOf('\r\n\r\n'); if (end === -1) return;
          buffered = buffered.slice(end + 4); tunnelled = true; socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        }
        if (/\r\n\r\n\{\}$/u.test(buffered)) {
          buffered = '';
          socket.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 64\r\n\r\n{"choices":');
          setImmediate(() => socket.destroy());
        }
      });
    });
    const response = await proxiedFetch(port, reports)(bodyUrl, init);
    expect(response.status).toBe(200); expect(reports).toEqual([null]);
    const failure = await response.text().then(() => null, (error: unknown) => error);
    expect(failure).not.toBeNull();
    expect(classifyTransportError(failure, true, init).code).toBe('AI7_OUTCOME_UNKNOWN');
  });

  it('keeps any established tunnel decisive for the whole call, a later reconnect failure included', () => {
    const reconnected = new ProxyConnectionEvidence(); reconnected.connectAnswered(200); reconnected.connectFailed();
    const tunnelledAfterRefusal = new ProxyConnectionEvidence(); tunnelledAfterRefusal.connectAnswered(407); tunnelledAfterRefusal.connectAnswered(200);
    const failed = new ProxyConnectionEvidence(); failed.connectFailed();
    const refused = new ProxyConnectionEvidence(); refused.connectAnswered(407);
    expect([reconnected, tunnelledAfterRefusal, failed, refused, new ProxyConnectionEvidence()].map((evidence) => evidence.provesNoModelRequest))
      .toEqual([false, false, true, true, false]);
    expect([reconnected, tunnelledAfterRefusal, failed, refused, new ProxyConnectionEvidence()].map((evidence) => evidence.proxyRefused))
      .toEqual([true, true, true, true, false]);
  });

  it('reaches the adapter as that request\'s observed no-send in the resumable proxy class', async () => {
    const proxied = proxiedFetch(await closedPort());
    const notSent = vi.fn(); let ticket: TransmitTicket | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    const adapter = new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => 'public-synthetic-placeholder' }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'deepseek-api-key', credentialReference: randomUUID() },
      tickets: { take: () => { const current = ticket; ticket = null; return current; } }, attribution: () => ({}),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, codes, onRequestNotSent: notSent,
      // The logical host this file admits; the adapter's own request object travels unchanged.
      transport: (_url, init) => proxied(modelUrl, init) as never,
    });
    const chunks = [];
    for await (const chunk of adapter.stream({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, system: '合成系统提示。',
      messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: '合成单元。' }], source: { kind: 'user' } }] })) chunks.push(chunk);
    expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'AI7_PROXY_UNREACHABLE' } } });
    expect(notSent).toHaveBeenCalledOnce(); expect(adapter.transmissions).toBe(1);
    expect(classifyModelFailure({ code: 'AI7_PROXY_UNREACHABLE', message: '代理不可达' }, codes)).toMatchObject({ failureClass: 'proxy-unreachable', retrySafe: false });
  });
});
