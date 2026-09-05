import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `e2e/controller.mjs` is runner infrastructure outside the typed program (`allowJs: false`), so it
// is loaded through a runtime specifier the compiler does not resolve and typed at this boundary.
interface DeadlineOptions {
  timeoutError?: Error;
  onDeadlineExpired?: () => void;
}

type AwaitWithinDeadline = <T>(
  operation: Promise<T>,
  deadline: number,
  options?: DeadlineOptions,
) => Promise<T>;

const { awaitWithinDeadline } = (await import(
  new URL('../../e2e/controller.mjs', import.meta.url).href
)) as { awaitWithinDeadline: AwaitWithinDeadline };

const TIMEOUT_ERROR = new Error('J-01/renderer-cdp-timeout');
const OPERATION_MS = 1_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolveRequest, rejectRequest) => {
    resolve = resolveRequest;
    reject = rejectRequest;
  });
  return { promise, resolve, reject };
}

// Advancing the clock rejects the guarded operation, so its handler must already be attached when
// the deadline fires; otherwise the rejection the test is about surfaces as an unhandled one.
function rejection(guarded: Promise<unknown>): Promise<unknown> {
  return guarded.then(
    (value) => {
      throw new Error(`expected a rejection, received ${String(value)}`);
    },
    (error: unknown) => error,
  );
}

// Fake timers keep the deadline arithmetic exact and make `vi.getTimerCount()` the direct evidence
// that the raced timer is gone, without waiting on a real deadline.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('awaitWithinDeadline', () => {
  it('resolves the operation value when it settles before the deadline', async () => {
    const value = { targetInfos: [] };
    await expect(
      awaitWithinDeadline(Promise.resolve(value), Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    ).resolves.toBe(value);
  });

  it('lets a real rejection before the deadline win', async () => {
    const failure = new Error('Target.getTargets: protocol error');
    await expect(
      awaitWithinDeadline(Promise.reject(failure), Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    ).rejects.toBe(failure);
  });

  it('rejects with the runner-supplied error at the deadline so classification by identity is preserved', async () => {
    const operation = deferred<string>();
    const rejected = rejection(
      awaitWithinDeadline(operation.promise, Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    );
    await vi.advanceTimersByTimeAsync(OPERATION_MS);
    expect(await rejected).toBe(TIMEOUT_ERROR);
  });

  it('clears the raced timer on the resolved path', async () => {
    await expect(
      awaitWithinDeadline(Promise.resolve('root'), Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    ).resolves.toBe('root');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the raced timer on the deadline path', async () => {
    const operation = deferred<string>();
    const rejected = rejection(
      awaitWithinDeadline(operation.promise, Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    );
    await vi.advanceTimersByTimeAsync(OPERATION_MS);
    expect(await rejected).toBe(TIMEOUT_ERROR);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails an already-spent deadline through the runner handler, arming no timer', async () => {
    const expired = new Error('J-01/renderer-cdp-timeout');
    const operation = deferred<string>();
    await expect(
      awaitWithinDeadline(operation.promise, Date.now(), {
        timeoutError: TIMEOUT_ERROR,
        onDeadlineExpired: () => {
          throw expired;
        },
      }),
    ).rejects.toBe(expired);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to the supplied timeout error when a caller offers no expired-deadline handler', async () => {
    const operation = deferred<string>();
    await expect(
      awaitWithinDeadline(operation.promise, Date.now() - 1, { timeoutError: TIMEOUT_ERROR }),
    ).rejects.toBe(TIMEOUT_ERROR);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('binds the abandoned operation, so a rejection arriving after the deadline stays handled', async () => {
    const operation = deferred<string>();
    const rejected = rejection(
      awaitWithinDeadline(operation.promise, Date.now() + OPERATION_MS, {
        timeoutError: TIMEOUT_ERROR,
      }),
    );
    await vi.advanceTimersByTimeAsync(OPERATION_MS);
    expect(await rejected).toBe(TIMEOUT_ERROR);
    // The runner has already stopped waiting; only the helper's own binding keeps this handled.
    operation.reject(new Error('Target closed'));
    await vi.advanceTimersByTimeAsync(OPERATION_MS);
  });
});
