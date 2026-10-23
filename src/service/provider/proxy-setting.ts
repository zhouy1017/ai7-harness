import { randomUUID } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { Client, ProxyAgent, type Dispatcher, buildConnector } from 'undici';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../../shared/data-root.js';
import { admittedProxyRequest } from '../../shared/network-denial.js';
import type { ModelServiceProxySetting } from '../../shared/protocol.js';

export const DIRECT_PROXY_SETTING: ModelServiceProxySetting = { mode: 'direct' };
export const PROXY_UNREACHABLE = 'AI7_PROXY_UNREACHABLE';

export class ProxySettingError extends Error {
  readonly code = 'MODEL_SERVICE_PROXY_INVALID';
  constructor(message = '代理地址必须是 http://host:port 或 https://host:port。') { super(message); }
}

/** Validate locally before IPC; rejected values are never included in errors. Authentication is a follow-up. */
export function parseProxyUrl(value: string): ModelServiceProxySetting {
  let url: URL;
  try { url = new URL(value); } catch { throw new ProxySettingError(); }
  if (url.username || url.password || /@/u.test(value)) {
    throw new ProxySettingError('代理地址不能包含用户名或密码；代理认证将在后续版本提供。');
  }
  const authority = /^https?:\/\/([^/?#]+)$/u.exec(value);
  if (authority === null || !['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      !/^(?:\[[^\]]+\]|[^:]+):[0-9]+$/u.test(authority[1]!) ||
      url.search || url.hash || url.pathname !== '/') throw new ProxySettingError();
  const port = Number(authority[1]!.slice(authority[1]!.lastIndexOf(':') + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new ProxySettingError();
  return { mode: 'proxy', protocol: url.protocol === 'http:' ? 'http' : 'https', hostPort: `${url.hostname}:${port}` };
}

export function validateProxySetting(input: unknown): ModelServiceProxySetting {
  if (input === null || typeof input !== 'object') throw new ProxySettingError();
  const record = input as Record<string, unknown>;
  if (record.mode === 'direct' && Object.keys(record).join(',') === 'mode') return DIRECT_PROXY_SETTING;
  if (record.mode !== 'proxy' || Object.keys(record).sort().join(',') !== 'hostPort,mode,protocol' ||
      (record.protocol !== 'http' && record.protocol !== 'https') || typeof record.hostPort !== 'string' ||
      record.hostPort.length > 300) throw new ProxySettingError();
  return parseProxyUrl(`${record.protocol}://${record.hostPort}`);
}

export async function readProxySetting(dataRoot: string, report: (reason: string) => void = console.warn): Promise<ModelServiceProxySetting> {
  try {
    const directory = await ensureCanonicalDataDirectory(dataRoot, 'settings');
    const file = await inspectCanonicalDataFile(dataRoot, directory, 'model-service-proxy.json');
    if (!file.exists) return DIRECT_PROXY_SETTING;
    if ((await lstat(file.path)).size > 2_048) throw new ProxySettingError();
    return validateProxySetting(JSON.parse(await readFile(file.path, 'utf8')));
  } catch {
    report('网络代理设置无法读取或无效；已使用不使用代理。');
    return DIRECT_PROXY_SETTING;
  }
}

export async function writeProxySetting(dataRoot: string, input: unknown): Promise<ModelServiceProxySetting> {
  const setting = validateProxySetting(input);
  const directory = await ensureCanonicalDataDirectory(dataRoot, 'settings');
  const file = await inspectCanonicalDataFile(dataRoot, directory, 'model-service-proxy.json');
  const temporary = await inspectCanonicalDataFile(dataRoot, directory, `proxy-${randomUUID()}.tmp`);
  if (temporary.exists) throw new ProxySettingError('网络代理设置暂时无法保存。');
  try {
    await writeFile(temporary.path, JSON.stringify(setting), { flag: 'wx', mode: 0o600 });
    await rename(temporary.path, file.path);
  } finally { await rm(temporary.path, { force: true }); }
  return setting;
}

/** Factory injection makes construction and physical-stage failures observable without real networking. */
export type ProxyDispatcherFactory = (uri: string, failed: () => void) => Dispatcher;
export const createProxyDispatcher: ProxyDispatcherFactory = (uri, failed) => new ProxyAgent({
  uri, proxyTunnel: true, connections: 1,
  clientFactory: (origin, options) => {
    const connector = (options as { connect: ReturnType<typeof buildConnector> }).connect;
    return new Client(origin, { ...options, connect: (opts, callback) => connector(opts, (error, socket) => {
      if (error !== null) failed();
      if (error !== null) callback(error, null);
      else callback(null, socket!);
    }) });
  },
});

function interruptedOrDenied(error: unknown): Error | null {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new DOMException('请求已中止或超过时限。', error.name);
  }
  const cause = error instanceof Error ? error.cause : null;
  const timeoutCode = cause !== null && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  if (timeoutCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return Object.assign(new Error('连接在发送请求前超时。'), { code: 'TRANSPORT_FAILED', requestSent: false });
  }
  if (timeoutCode === 'UND_ERR_HEADERS_TIMEOUT' || timeoutCode === 'UND_ERR_BODY_TIMEOUT' || timeoutCode === 'ETIMEDOUT') {
    return new DOMException('模型服务响应超过时限。', 'TimeoutError');
  }
  if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'AI7_OUTBOUND_NETWORK_DENIED') {
    return Object.assign(new Error('出站网络在当前产品区间内被禁用。'), { code: 'AI7_OUTBOUND_NETWORK_DENIED' });
  }
  return null;
}

/** Captured fetch only. Called by admitted transports; no global dispatcher or host allowance is changed. */
export function proxyAwareFetch(nativeFetch: typeof fetch, read: () => Promise<ModelServiceProxySetting>,
  factory: ProxyDispatcherFactory = createProxyDispatcher,
  report: (failure: 'proxy-unreachable' | 'model-service-unreachable' | null) => void = () => undefined): typeof fetch {
  return async (input, init) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const beforeSend = (): void => {
      if (signal?.aborted === true) throw Object.assign(new Error('请求在发送前已中止。'), { code: 'TRANSPORT_FAILED', requestSent: false });
    };
    beforeSend();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const setting = await read();
    beforeSend();
    if (setting.mode === 'direct') {
      try { const response = await nativeFetch(input, { ...init, redirect: 'manual' }); report(null); return response; }
      catch (error) {
        const preserved = interruptedOrDenied(error);
        if (preserved !== null) throw preserved;
        report('model-service-unreachable'); throw Object.assign(new Error('模型服务不可达。'), { code: 'TRANSPORT_FAILED' });
      }
    }
    const proxy = new URL(`${setting.protocol}://${setting.hostPort}`);
    const token = admittedProxyRequest(url, { host: proxy.hostname.replace(/^\[|\]$/gu, ''), port: Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)) });
    let proxyFailed = false;
    let dispatcher: Dispatcher | undefined;
    const finish = (): void => { token.revoke(); void dispatcher?.destroy().catch(() => undefined); };
    try {
      dispatcher = factory(proxy.href, () => { proxyFailed = true; });
      const response = await token.run(() => nativeFetch(input, { ...init, redirect: 'manual', dispatcher } as RequestInit));
      if (response.status === 407) { proxyFailed = true; throw new Error(PROXY_UNREACHABLE); }
      report(null);
      if (response.body === null) { finish(); return response; }
      const reader = response.body.getReader();
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) { finish(); controller.close(); }
            else controller.enqueue(next.value);
          } catch { finish(); controller.error(new Error('模型服务传输失败。')); }
        },
        async cancel(reason) { try { await reader.cancel(reason); } finally { finish(); } },
      }), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      finish();
      const preserved = interruptedOrDenied(error);
      if (preserved !== null) throw preserved;
      // Undici's CONNECT refusal is a proxy response, never a model-service HTTP status.
      const cause = error instanceof Error ? error.cause : null;
      const refused = cause instanceof Error && /Proxy response \(407\)/u.test(cause.message);
      if (proxyFailed || refused) {
        report('proxy-unreachable');
        throw Object.assign(new Error('代理不可达：请检查网络代理设置。'), { code: PROXY_UNREACHABLE });
      }
      // Discard native error causes, which may contain proxy URLs or headers.
      report('model-service-unreachable');
      throw Object.assign(new Error('模型服务不可达。'), { code: 'TRANSPORT_FAILED' });
    }
  };
}
