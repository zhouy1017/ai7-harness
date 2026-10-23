import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admittedProxyRequest, armSingleHostAllowance, guardedConnect, guardedLookup } from '../../src/shared/network-denial.js';
import { parseProxyUrl, proxyAwareFetch, readProxySetting, writeProxySetting, type ProxyDispatcherFactory } from '../../src/service/provider/proxy-setting.js';
import { classifyTransportError } from '../../src/service/provider/deepseek-adapter.js';
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
  it('keeps a cancellation before physical send transport-failed and preserves a sent timeout', async () => {
    const { native, factory } = fixture();
    const controller = new AbortController();
    const fetch = proxyAwareFetch(native, async () => {
      controller.abort();
      return { mode: 'direct' };
    }, factory);
    let failure: unknown;
    try { await fetch(modelUrl, { signal: controller.signal }); } catch (error) { failure = error; }
    expect(classifyTransportError(failure, true).code).toBe('TRANSPORT_FAILED');
    expect(native).not.toHaveBeenCalled();
    const bodyTimeout = proxyAwareFetch(async () => { throw new TypeError('private', { cause: { code: 'UND_ERR_BODY_TIMEOUT' } }); }, async () => ({ mode: 'direct' }));
    try { await bodyTimeout(modelUrl); } catch (error) {
      expect(classifyTransportError(error, true).code).toBe('AI7_OUTCOME_UNKNOWN');
    }
    const timeout = proxyAwareFetch(async () => { throw new DOMException('private', 'TimeoutError'); }, async () => ({ mode: 'direct' }));
    try { await timeout(modelUrl); } catch (error) {
      expect(classifyTransportError(error, true).code).toBe('AI7_OUTCOME_UNKNOWN');
    }
  });
  it('recognizes proxy 407 separately and preserves cancellation', async () => {
    const { factory } = fixture();
    const fetch = proxyAwareFetch(async () => new Response('', { status: 407 }), async () => parseProxyUrl('https://proxy.invalid:8080'), factory);
    await expect(fetch(modelUrl)).rejects.toMatchObject({ code: 'AI7_PROXY_UNREACHABLE' });
    const aborted = proxyAwareFetch(async () => { throw new DOMException('secret', 'AbortError'); }, async () => ({ mode: 'direct' }), factory);
    await expect(aborted(modelUrl)).rejects.toMatchObject({ name: 'AbortError', message: '请求已中止或超过时限。' });
  });
});
