import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModelRequestGovernor,
  type ModelRequestGovernorOptions,
  type ModelRequestLane,
  type ModelRequestProducer,
  type ModelRequestProducerKind,
} from '../../src/service/analysis/execution.js';

// Issue #1131 Phase A: the bounded permit capability only. No product wiring, model transport,
// policy/fixture substitution, clock or network; deferred bodies model caller-owned cleanup.
const governors: ModelRequestGovernor[] = [];

function governor(options: ModelRequestGovernorOptions = {}): ModelRequestGovernor {
  const owner = new ModelRequestGovernor(options);
  governors.push(owner);
  return owner;
}

function producer(owner: ModelRequestGovernor, key: string, lane: ModelRequestLane = 'foreground',
  kind: ModelRequestProducerKind = 'analysis-unit'): ModelRequestProducer {
  return owner.registerProducer({ key, kind, lane });
}

function acquire(owner: ModelRequestGovernor, registration: ModelRequestProducer): ReturnType<ModelRequestGovernor['acquire']> {
  return owner.acquire(registration, new AbortController().signal);
}

afterEach(() => {
  for (const owner of governors.splice(0)) {
    owner.close();
    expect(owner.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
  }
  vi.restoreAllMocks();
});

describe('ModelRequestGovernor capacity and identity', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 5])(
    'refuses invalid or raised global capacity %s', (globalCapacity) => {
      expect(() => new ModelRequestGovernor({ globalCapacity })).toThrow('MODEL_REQUEST_CAPACITY_INVALID');
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 2])(
    'refuses invalid or raised background capacity %s', (backgroundCapacity) => {
      expect(() => new ModelRequestGovernor({ backgroundCapacity })).toThrow('MODEL_REQUEST_CAPACITY_INVALID');
    },
  );

  it.each([1, 2, 3, 4])('allows lower trusted request capacity %s', async (globalCapacity) => {
    const owner = governor({ globalCapacity, backgroundCapacity: 1 });
    const permits = await Promise.all(Array.from({ length: globalCapacity }, (_, index) => acquire(owner, producer(owner, `unit-${index}`))));
    const next = acquire(owner, producer(owner, 'next'));
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: globalCapacity });
    permits[0]!.release();
    const nextPermit = await next;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: globalCapacity });
    for (const permit of permits) permit.release();
    nextPermit.release();
  });

  it.each([{}, { globalCapacity: 1, backgroundCapacity: 1 }])('keeps all nine producer registrations with options %j', async (options) => {
    const owner = governor(options);
    const kinds: ModelRequestProducerKind[] = [
      'analysis-unit', 'analysis-unit', 'analysis-unit', 'analysis-stage', 'analysis-stage', 'analysis-stage',
      'dialogue', 'fast-role', 'connection-test',
    ];
    const registrations = kinds.map((kind, index) => producer(owner, `producer-${index}`, 'foreground', kind));
    expect(owner.snapshot()).toEqual({ registered: 9, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    expect(() => producer(owner, 'tenth')).toThrow('MODEL_REQUEST_PRODUCER_CAPACITY');
    const snapshot = owner.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    owner.unregisterProducer(registrations[0]!);
    const replacement = producer(owner, 'tenth');
    const permit = await acquire(owner, replacement);
    expect(snapshot).toEqual({ registered: 9, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 1 });
    permit.release();
  });

  it('refuses duplicate live keys and alien registrations without changing either governor', async () => {
    const owner = governor();
    const other = governor();
    const registration = producer(owner, 'shared-key');
    const alien = producer(other, 'shared-key');
    expect(Object.isFrozen(registration)).toBe(true);
    expect(() => producer(owner, 'shared-key')).toThrow('MODEL_REQUEST_PRODUCER_DUPLICATE');
    await expect(acquire(owner, alien)).rejects.toThrow('MODEL_REQUEST_PRODUCER_ALIEN');
    expect(() => owner.unregisterProducer(alien)).toThrow('MODEL_REQUEST_PRODUCER_ALIEN');
    expect(owner.snapshot()).toEqual(other.snapshot());
    const permit = await acquire(owner, registration);
    permit.release();
  });

  it('refuses a second queued or active acquisition from the same producer', async () => {
    const owner = governor({ globalCapacity: 1 });
    const first = producer(owner, 'first');
    const second = producer(owner, 'second');
    const firstPermit = await acquire(owner, first);
    await expect(acquire(owner, first)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    const secondRequest = acquire(owner, second);
    await expect(acquire(owner, second)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    expect(owner.snapshot()).toMatchObject({ registered: 2, waiting: 1, inFlight: 1 });
    firstPermit.release();
    const secondPermit = await secondRequest;
    secondPermit.release();
  });
});

describe('ModelRequestGovernor eligible FIFO', () => {
  it('caps defaults at four total and one background, skipping only ineligible background waits', async () => {
    const owner = governor();
    const background = await acquire(owner, producer(owner, 'background-1', 'background'));
    const foreground = await Promise.all([0, 1, 2].map((index) => acquire(owner, producer(owner, `foreground-${index}`))));
    const nextBackground = acquire(owner, producer(owner, 'background-2', 'background'));
    const nextForeground = acquire(owner, producer(owner, 'foreground-next'));
    expect(owner.snapshot()).toEqual({ registered: 6, waiting: 2, inFlight: 4, backgroundInFlight: 1 });
    foreground[0]!.release();
    const foregroundPermit = await nextForeground;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 4, backgroundInFlight: 1 });
    background.release();
    const backgroundPermit = await nextBackground;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 4, backgroundInFlight: 1 });
    for (const permit of foreground) permit.release();
    foregroundPermit.release();
    backgroundPermit.release();
  });

  it('never reserves an idle permit for background work', async () => {
    const owner = governor();
    const permits = await Promise.all([0, 1, 2, 3].map((index) => acquire(owner, producer(owner, `foreground-${index}`))));
    expect(owner.snapshot()).toMatchObject({ inFlight: 4, backgroundInFlight: 0 });
    for (const permit of permits) permit.release();
  });

  it('admits an older background waiter before a younger foreground waiter once eligible', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const background = acquire(owner, producer(owner, 'older-background', 'background'));
    const foreground = acquire(owner, producer(owner, 'younger-foreground'));
    active.release();
    const backgroundPermit = await background;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1, backgroundInFlight: 1 });
    backgroundPermit.release();
    const foregroundPermit = await foreground;
    foregroundPermit.release();
  });

  it('puts a registered producer re-acquiring after tools behind older queued requests', async () => {
    const owner = governor({ globalCapacity: 1 });
    const first = producer(owner, 'first');
    const firstPermit = await acquire(owner, first);
    const second = acquire(owner, producer(owner, 'second'));
    const third = acquire(owner, producer(owner, 'third'));
    firstPermit.release(); // Tool processing retains this registration without a permit or priority.
    const firstAgain = acquire(owner, first);
    const secondPermit = await second;
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 2, inFlight: 1 });
    secondPermit.release();
    const thirdPermit = await third;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    thirdPermit.release();
    const firstAgainPermit = await firstAgain;
    firstAgainPermit.release();
  });
});

describe('ModelRequestGovernor cancellation and permit ownership', () => {
  it('rejects a pre-aborted acquisition without queuing or closing its registration', async () => {
    const owner = governor();
    const registration = producer(owner, 'unit');
    const controller = new AbortController();
    const reason = new Error('cancelled before queue');
    controller.abort(reason);
    const listener = vi.spyOn(controller.signal, 'addEventListener');
    await expect(owner.acquire(registration, controller.signal)).rejects.toBe(reason);
    expect(listener).not.toHaveBeenCalled();
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    const permit = await acquire(owner, registration);
    permit.release();
  });

  it('removes a queued abort, detaches its listener and preserves the remaining FIFO', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const cancelled = producer(owner, 'cancelled');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = new Error('cancelled while queued');
    const queued = owner.acquire(cancelled, controller.signal);
    const rejected = expect(queued).rejects.toBe(reason);
    const next = acquire(owner, producer(owner, 'next'));
    controller.abort(reason);
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 1, inFlight: 1 });
    const cancelledAgain = acquire(owner, cancelled);
    active.release();
    const nextPermit = await next;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    nextPermit.release();
    const retriedPermit = await cancelledAgain;
    retriedPermit.release();
  });

  it('cancels an ineligible background waiter without disturbing active foreground work', async () => {
    const owner = governor({ globalCapacity: 2 });
    const background = await acquire(owner, producer(owner, 'background', 'background'));
    const controller = new AbortController();
    const queued = owner.acquire(producer(owner, 'queued-background', 'background'), controller.signal);
    const rejected = expect(queued).rejects.toHaveProperty('name', 'AbortError');
    const foreground = await acquire(owner, producer(owner, 'foreground'));
    controller.abort();
    await rejected;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 2, backgroundInFlight: 1 });
    background.release();
    foreground.release();
  });

  it('keeps an immediate grant occupied when aborted before the awaiting continuation', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit');
    const controller = new AbortController();
    const attached = vi.spyOn(controller.signal, 'addEventListener');
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const request = owner.acquire(registration, controller.signal);
    const next = acquire(owner, producer(owner, 'next'));
    const reason = new Error('abort after grant');
    controller.abort(reason);
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    expect(detached).toHaveBeenCalledWith('abort', attached.mock.calls[0]![1]);
    const permit = await request;
    expect(() => controller.signal.throwIfAborted()).toThrow(reason);
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    permit.release();
    const nextPermit = await next;
    nextPermit.release();
  });

  it('keeps a queued grant occupied when aborted synchronously after release grants it', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const controller = new AbortController();
    const request = owner.acquire(producer(owner, 'queued'), controller.signal);
    active.release();
    controller.abort(); // The grant happened, but the awaiting caller has not resumed.
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 1 });
    const permit = await request;
    permit.release();
  });

  it('holds capacity during aborted body consumption until caller-owned cleanup finishes', async () => {
    const owner = governor({ globalCapacity: 1 });
    const controller = new AbortController();
    const body = Promise.withResolvers<void>();
    const consuming = Promise.withResolvers<void>();
    const cleaning = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const reason = new Error('transport aborted');
    const consume = async (): Promise<void> => {
      const permit = await owner.acquire(producer(owner, 'body'), controller.signal);
      try {
        controller.signal.throwIfAborted();
        consuming.resolve();
        await body.promise;
      } finally {
        cleaning.resolve();
        await cleanup.promise;
        permit.release();
      }
    };
    const consumption = consume();
    const rejected = expect(consumption).rejects.toBe(reason);
    await consuming.promise;
    const next = acquire(owner, producer(owner, 'next'));
    controller.abort(reason);
    body.reject(reason);
    await cleaning.promise;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    cleanup.resolve();
    await rejected;
    const nextPermit = await next;
    nextPermit.release();
  });
});

describe('ModelRequestGovernor unregister, close and idle', () => {
  it('unregisters idle or queued producers, detaches waits and refuses released identities', async () => {
    const owner = governor({ globalCapacity: 1 });
    const idle = producer(owner, 'idle');
    owner.unregisterProducer(idle);
    owner.unregisterProducer(idle);
    await expect(acquire(owner, idle)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    const active = await acquire(owner, producer(owner, 'active'));
    const queued = producer(owner, 'queued');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const request = owner.acquire(queued, controller.signal);
    const rejected = expect(request).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    const next = acquire(owner, producer(owner, 'next'));
    owner.unregisterProducer(queued);
    owner.unregisterProducer(queued);
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    controller.abort();
    await expect(acquire(owner, queued)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    expect(owner.snapshot()).toMatchObject({ registered: 2, waiting: 1, inFlight: 1 });
    active.release();
    const nextPermit = await next;
    nextPermit.release();
  });

  it('retains a closing active producer and key until release, isolating all later same-key registrations', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit', 'background');
    const permit = await acquire(owner, registration);
    owner.unregisterProducer(registration);
    owner.unregisterProducer(registration);
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 1 });
    expect(() => producer(owner, 'unit')).toThrow('MODEL_REQUEST_PRODUCER_DUPLICATE');
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    permit.release();
    const replacement = producer(owner, 'unit');
    expect(replacement).not.toBe(registration);
    const replacementPermit = await acquire(owner, replacement);
    owner.unregisterProducer(registration);
    permit.release();
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 0 });
    replacementPermit.release();
  });

  it('keeps closing active registrations inside the fixed nine-producer bound', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registrations = Array.from({ length: 9 }, (_, index) => producer(owner, `unit-${index}`));
    const active = await acquire(owner, registrations[0]!);
    owner.unregisterProducer(registrations[0]!);
    expect(() => producer(owner, 'replacement')).toThrow('MODEL_REQUEST_PRODUCER_CAPACITY');
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 1 });
    active.release();
    producer(owner, 'replacement');
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 0 });
  });

  it('closes queued and idle registrations while retaining active counts until cleanup', async () => {
    const owner = governor({ globalCapacity: 1 });
    const activeRegistration = producer(owner, 'active', 'background');
    const active = await acquire(owner, activeRegistration);
    const queuedRegistration = producer(owner, 'queued');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const queued = owner.acquire(queuedRegistration, controller.signal);
    const rejected = expect(queued).rejects.toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    producer(owner, 'idle');
    owner.close();
    owner.close();
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 1 });
    expect(controller.signal.aborted).toBe(false); // The governor does not own transport cancellation.
    expect(() => producer(owner, 'new')).toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    await expect(acquire(owner, activeRegistration)).rejects.toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    owner.unregisterProducer(queuedRegistration);
    owner.unregisterProducer(activeRegistration);
    active.release();
    active.release();
    await owner.whenIdle();
    expect(owner.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
  });

  it('waits for queued and active requests, shares one idle promise, and ignores idle registrations', async () => {
    const owner = governor({ globalCapacity: 1 });
    const idleRegistration = producer(owner, 'idle');
    await owner.whenIdle();
    const active = await acquire(owner, producer(owner, 'active'));
    const queued = acquire(owner, producer(owner, 'queued'));
    const idle = owner.whenIdle();
    expect(owner.whenIdle()).toBe(idle);
    let settled = false;
    const observedIdle = idle.then(() => { settled = true; });
    active.release();
    const queuedPermit = await queued;
    expect(settled).toBe(false);
    queuedPermit.release();
    await observedIdle;
    expect(settled).toBe(true);
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 0, inFlight: 0 });
    const nextPermit = await acquire(owner, idleRegistration);
    expect(owner.whenIdle()).not.toBe(idle);
    nextPermit.release();
    await owner.whenIdle();
  });

  it('does not resolve idle while an aborted granted request remains active after close', async () => {
    const owner = governor({ globalCapacity: 1 });
    const controller = new AbortController();
    const permit = await owner.acquire(producer(owner, 'active'), controller.signal);
    let settled = false;
    const idle = owner.whenIdle().then(() => { settled = true; });
    controller.abort();
    owner.close();
    await Promise.resolve();
    expect(settled).toBe(false);
    permit.release();
    await idle;
    expect(settled).toBe(true);
  });

  it('releasing an old permit twice cannot release its re-acquired successor', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit');
    const first = await acquire(owner, registration);
    first.release();
    const second = await acquire(owner, registration);
    first.release();
    expect(owner.snapshot()).toMatchObject({ inFlight: 1 });
    second.release();
    second.release();
    await owner.whenIdle();
  });
});
