import { describe, expect, it } from 'vitest';

// `e2e/controller.mjs` is runner infrastructure outside the typed program (`allowJs: false`), so it
// is loaded through a runtime specifier the compiler does not resolve and typed at this boundary.
interface SettleOptions {
  disconnectError?: Error;
  coerceRejectionAfterDisconnect?: boolean;
  graceMs?: number;
}

type SettleOnBrowserDisconnect = <T>(
  browser: unknown,
  request: Promise<T>,
  options?: SettleOptions,
) => Promise<T>;

const { settleOnBrowserDisconnect } = (await import(
  new URL('../../e2e/controller.mjs', import.meta.url).href
)) as { settleOnBrowserDisconnect: SettleOnBrowserDisconnect };

const ABANDONED = 'child CDP request abandoned after the browser disconnected';
const GRACE_MS = 10;

function createBrowser(connected = true) {
  const listeners: Array<() => void> = [];
  let live = connected;
  return {
    browser: {
      on(event: string, listener: () => void) {
        if (event === 'disconnected') listeners.push(listener);
      },
      isConnected: () => live,
    },
    disconnect() {
      live = false;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.length,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolveRequest, rejectRequest) => {
    resolve = resolveRequest;
    reject = rejectRequest;
  });
  return { promise, resolve, reject };
}

describe('settleOnBrowserDisconnect', () => {
  it('settles a request still in flight when the browser disconnects', async () => {
    const { browser, disconnect } = createBrowser();
    const request = deferred<string>();
    const guarded = settleOnBrowserDisconnect(browser, request.promise, { graceMs: GRACE_MS });
    disconnect();
    await expect(guarded).rejects.toThrow(ABANDONED);
  });

  it('resolves the healthy path with the same value and keeps one browser listener', async () => {
    const { browser, listenerCount } = createBrowser();
    const value = { targetInfos: [] };
    await expect(settleOnBrowserDisconnect(browser, Promise.resolve(value))).resolves.toBe(value);
    for (let request = 0; request < 25; request += 1) {
      await expect(settleOnBrowserDisconnect(browser, Promise.resolve(request))).resolves.toBe(request);
    }
    expect(listenerCount()).toBe(1);
  });

  it('lets a real rejection win while the browser is still connected', async () => {
    const { browser } = createBrowser();
    const failure = new Error('Target.getTargets: protocol error');
    await expect(settleOnBrowserDisconnect(browser, Promise.reject(failure))).rejects.toBe(failure);
  });

  it('lets a real rejection arriving inside the grace win, so startup markers survive', async () => {
    const { browser, disconnect } = createBrowser();
    const request = deferred<never>();
    const failure = new Error('AI7_STARTUP_FAILED/service-ready');
    const guarded = settleOnBrowserDisconnect(browser, request.promise, { graceMs: 1_000 });
    disconnect();
    request.reject(failure);
    await expect(guarded).rejects.toBe(failure);
  });

  it('settles a request handed an already-disconnected browser', async () => {
    const { browser } = createBrowser(false);
    const request = deferred<string>();
    const guarded = settleOnBrowserDisconnect(browser, request.promise, { graceMs: GRACE_MS });
    await expect(guarded).rejects.toThrow(ABANDONED);
  });

  it('still resolves a response that lands after the browser is already gone', async () => {
    const { browser } = createBrowser(false);
    await expect(
      settleOnBrowserDisconnect(browser, Promise.resolve('late'), { graceMs: 1_000 }),
    ).resolves.toBe('late');
  });

  it('rejects with the runner-supplied error so classification by identity is preserved', async () => {
    const disconnectError = new Error('J-01/browser-disconnected');
    const { browser, disconnect } = createBrowser();
    const request = deferred<string>();
    const guarded = settleOnBrowserDisconnect(browser, request.promise, {
      disconnectError,
      coerceRejectionAfterDisconnect: true,
      graceMs: GRACE_MS,
    });
    disconnect();
    await expect(guarded).rejects.toBe(disconnectError);
  });

  it('coerces a post-disconnect rejection to the runner-supplied error when asked', async () => {
    const disconnectError = new Error('J-12/browser-disconnected');
    const { browser, disconnect } = createBrowser();
    const request = deferred<never>();
    const guarded = settleOnBrowserDisconnect(browser, request.promise, {
      disconnectError,
      coerceRejectionAfterDisconnect: true,
      graceMs: 1_000,
    });
    disconnect();
    request.reject(new Error('Target closed'));
    await expect(guarded).rejects.toBe(disconnectError);
  });
});
