import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Agent } from 'undici';
import { armSingleHostAllowance, guardedConnect } from '../../src/shared/network-denial.js';
import { parseProxyUrl, proxyAwareFetch, type ProxyDispatcherFactory } from '../../src/service/provider/proxy-setting.js';
// @ts-expect-error The development-only recorder is exercised as its existing plain module.
import { recordDevelopmentFetch } from '../../tools/development-call-recording.mjs';

const modelUrl = 'https://model.invalid/v1/messages';
const proxy = { host: 'proxy.invalid', port: 8080 };
const setting = parseProxyUrl('http://proxy.invalid:8080');
const directories: string[] = [], dispatchers: Agent[] = [];
beforeAll(() => armSingleHostAllowance({ host: 'model.invalid', port: 443 }));
afterEach(async () => {
  await Promise.all(dispatchers.splice(0).map(dispatcher => dispatcher.destroy()));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
function directory(): string { const path = mkdtempSync(join(tmpdir(), 'ai7-recording-proxy-')); directories.push(path); return path; }
function events(path: string): unknown[] {
  return readdirSync(path).flatMap(name => readFileSync(join(path, name), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
}
function record(path: string, native: typeof fetch): typeof fetch {
  return recordDevelopmentFetch({ directory: path, context: () => ({ material: 'admitted-public-samplebooks', caseId: 'synthetic-native-proxy-boundary' }), fetch: native });
}
function factory() {
  return vi.fn<ProxyDispatcherFactory>(() => {
    // The native sender is synthetic; this dispatcher never receives a dispatch or opens a socket.
    const dispatcher = new Agent();
    dispatchers.push(dispatcher); return dispatcher;
  });
}

describe('manual recording before the real proxy sanitation boundary', () => {
  it('retains native rejection codes inside admission while both callers receive sanitized errors', async () => {
    const outer = directory(), inner = directory(), makeDispatcher = factory();
    const connect = guardedConnect(vi.fn(() => ({})));
    const failure = new TypeError('NATIVE_SECRET_SENTINEL', { cause: Object.assign(Error('CAUSE_SECRET_SENTINEL'), { code: 'ECONNRESET' }) });
    const native = vi.fn<typeof fetch>(async (_url, init) => { expect(init?.redirect).toBe('manual'); expect(init).toHaveProperty('dispatcher'); connect(proxy); throw failure; });
    const init = { method: 'POST', body: '{"synthetic":true}', headers: { authorization: 'HEADER_SECRET_SENTINEL' } };
    const oldPlacement = record(outer, proxyAwareFetch(native, async () => setting, makeDispatcher));
    const oldPublic = await oldPlacement(modelUrl, init).catch((error: unknown) => error);
    expect(events(outer).at(-1)).toMatchObject({ nativeError: { name: 'Error', code: 'unclassified', causes: [] } });
    const correctPlacement = proxyAwareFetch(record(inner, native), async () => setting, makeDispatcher);
    const publicError = await correctPlacement(modelUrl, init).catch((error: unknown) => error);
    for (const observed of [oldPublic, publicError]) {
      expect(observed).toMatchObject({ code: 'TRANSPORT_FAILED' });
      expect(observed).not.toBe(failure); expect(observed).not.toHaveProperty('cause');
      expect(String(observed)).not.toMatch(/SENTINEL|ECONNRESET/u);
    }
    expect(events(inner).at(-1)).toMatchObject({ outcome: 'unknown', cause: 'transport-error', nativeError: {
      name: 'TypeError', code: 'unclassified', causes: [{ name: 'Error', code: 'ECONNRESET' }],
    } });
    expect(JSON.stringify([...events(outer), ...events(inner)])).not.toMatch(/SENTINEL/u);
    expect(native).toHaveBeenCalledTimes(2); expect(makeDispatcher).toHaveBeenCalledTimes(2);
    expect(native.mock.calls[1]?.[0]).toBe(modelUrl); expect(native.mock.calls[1]?.[1]?.body).toBe(init.body);
    expect(native.mock.calls[1]?.[1]?.headers).toBe(init.headers); expect(init).not.toHaveProperty('dispatcher');
    expect(() => connect(proxy)).toThrow();
  });

  it('captures the partial native stream and its read error before the proxy replaces that error', async () => {
    const path = directory(), bytes = new TextEncoder().encode('synthetic partial response');
    const failure = Object.assign(Error('STREAM_SECRET_SENTINEL'), { name: 'SocketError', code: 'UND_ERR_SOCKET' });
    let sent = false, fail!: () => void;
    const gate = new Promise<void>(resolve => { fail = resolve; });
    const native = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (!sent) { sent = true; controller.enqueue(bytes); }
      else return gate.then(() => controller.error(failure));
    } }), { status: 206 }));
    const fetch = proxyAwareFetch(record(path, native), async () => setting, factory());
    const reader = (await fetch(modelUrl)).body!.getReader();
    expect((await reader.read()).value).toEqual(bytes); fail();
    const publicError = await reader.read().catch((error: unknown) => error);
    expect(publicError).toBeInstanceOf(Error); expect(publicError).not.toBe(failure);
    expect(publicError).not.toHaveProperty('cause'); expect(String(publicError)).not.toMatch(/SENTINEL|UND_ERR_SOCKET/u);
    const captured = events(path);
    expect(captured).toContainEqual(expect.objectContaining({ kind: 'response', status: 206 }));
    expect(captured.at(-1)).toMatchObject({ outcome: 'unknown', cause: 'read-error', chunks: 1,
      responseBodySha256: createHash('sha256').update(bytes).digest('hex'), nativeError: { name: 'SocketError', code: 'UND_ERR_SOCKET', causes: [] } });
    expect(JSON.stringify(captured)).not.toMatch(/SENTINEL/u); expect(native).toHaveBeenCalledOnce();
  });

  it.each(['cancelled', 'denied-host'] as const)('creates no transmission record when %s prevents native entry', async reason => {
    const path = directory(), native = vi.fn<typeof fetch>(async () => new Response('not sent')), makeDispatcher = factory();
    const fetch = proxyAwareFetch(record(path, native), async () => setting, makeDispatcher);
    const controller = new AbortController(); if (reason === 'cancelled') controller.abort();
    await expect(fetch(reason === 'denied-host' ? 'https://other.invalid/' : modelUrl, { signal: controller.signal })).rejects.toThrow();
    expect(native).not.toHaveBeenCalled(); expect(makeDispatcher).not.toHaveBeenCalled(); expect(readdirSync(path)).toEqual([]);
  });
});
