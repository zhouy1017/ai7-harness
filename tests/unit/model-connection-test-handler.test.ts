import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerModelConnectionTestHandler } from '../../src/main/model-connection-test-handler.js';
import { ServiceCallError } from '../../src/main/service-client.js';
import { IPC_CHANNELS, type FastModelSelectionInput, type RendererCallResult } from '../../src/shared/protocol.js';

type Event = { readonly sender: number };
type Projection = { readonly generation: number };
type Handler = (event: Event, input: FastModelSelectionInput) => Promise<RendererCallResult<Projection>>;
const selection: FastModelSelectionInput = { route: 'opencode-go', modelId: 'deepseek-v4.1-flash' };
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function subject(start: (input: FastModelSelectionInput) => Promise<unknown>, onQueue: () => void = () => undefined) {
  let current = 0;
  let authority = true;
  let handler: Handler | undefined;
  let tail = Promise.resolve();
  // These are Main's supplied effect-queue semantics: failures release the lane, and promises
  // returned by an effect are adopted. The registrar must return a holder for the long wait.
  const serializeEffect = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    onQueue();
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const project = vi.fn(async (): Promise<Projection> => ({ generation: current }));
  const removeHandler = vi.fn();
  const dispose = registerModelConnectionTestHandler<Event, Projection>({
    ipc: { handle: (channel, registered) => { expect(channel).toBe(IPC_CHANNELS.testModelServiceConnection); handler = registered; }, removeHandler },
    requireSender: (event) => { if (event.sender !== 1) throw new ServiceCallError('AI7_RENDERER_BOUNDARY_INVALID', 'sender refused'); },
    requireAuthority: () => { if (!authority) throw new ServiceCallError('SERVICE_INTERRUPTED', 'authority ended'); },
    serializeEffect, start, project,
    envelope: async (operation) => {
      try { return { ok: true, result: await operation() }; }
      catch (error) { return { ok: false, error: { code: error instanceof ServiceCallError ? error.code : 'DESKTOP_REQUEST_FAILED', message: 'refused' } }; }
    },
  });
  disposers.push(dispose);
  const captured = handler;
  if (captured === undefined) throw new Error('handler missing');
  return { invoke: (event: Event = { sender: 1 }) => captured(event, selection), serializeEffect, project, dispose, removeHandler,
    setAuthority: (value: boolean) => { authority = value; }, setGeneration: (value: number) => { current = value; } };
}

describe('the production Main connection-test registrar', () => {
  it('orders A before P, lets M and C finish during P, then projects current settings in order', async () => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const prior = Promise.withResolvers<void>();
    const events: string[] = [];
    const owner = subject(async () => { events.push('P'); started.resolve(); await probe.promise; });
    const a = owner.serializeEffect(async () => { events.push('A:start'); await prior.promise; events.push('A:end'); });
    const answer = owner.invoke();
    const m = owner.serializeEffect(async () => { events.push('M'); owner.setGeneration(1); });
    expect(events).toEqual([]);
    prior.resolve();
    await a;
    await started.promise;
    await m;
    await owner.serializeEffect(async () => { events.push('C'); owner.setGeneration(2); });
    expect(events).toEqual(['A:start', 'A:end', 'P', 'M', 'C']);
    expect(owner.project).not.toHaveBeenCalled();
    probe.resolve();
    await expect(answer).resolves.toEqual({ ok: true, result: { generation: 2 } });
    expect(owner.project).toHaveBeenCalledOnce();
  });

  it('lets a second probe reach the service busy boundary while the first remains pending', async () => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const owner = subject(async () => {
      calls += 1;
      if (calls > 1) throw new ServiceCallError('MODEL_CONNECTION_TEST_BUSY', 'busy');
      started.resolve(); await probe.promise;
    });
    const first = owner.invoke();
    await started.promise;
    await expect(owner.invoke()).resolves.toMatchObject({ ok: false, error: { code: 'MODEL_CONNECTION_TEST_BUSY' } });
    expect(calls).toBe(2);
    expect(owner.project).not.toHaveBeenCalled();
    probe.resolve(); await first;
  });

  it('refuses sender and initial authority before starting a service request', async () => {
    const start = vi.fn(async () => undefined);
    const owner = subject(start);
    await expect(owner.invoke({ sender: 2 })).resolves.toMatchObject({ ok: false, error: { code: 'AI7_RENDERER_BOUNDARY_INVALID' } });
    owner.setAuthority(false);
    await expect(owner.invoke()).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_INTERRUPTED' } });
    expect(start).not.toHaveBeenCalled();
    expect(owner.project).not.toHaveBeenCalled();
  });

  it.each(['close', 'authority'] as const)('rechecks %s before a queued start executes', async (action) => {
    const prior = Promise.withResolvers<void>();
    const start = vi.fn(async () => undefined);
    const owner = subject(start);
    const earlier = owner.serializeEffect(async () => prior.promise);
    const answer = owner.invoke();
    if (action === 'close') owner.dispose(); else owner.setAuthority(false);
    prior.resolve(); await earlier;
    await expect(answer).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_INTERRUPTED' } });
    expect(start).not.toHaveBeenCalled();
  });

  it('closes before removal and suppresses late projection after an outstanding probe settles', async () => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const owner = subject(async () => { started.resolve(); await probe.promise; });
    const answer = owner.invoke(); await started.promise;
    owner.dispose(); owner.dispose();
    expect(owner.removeHandler).toHaveBeenCalledExactlyOnceWith(IPC_CHANNELS.testModelServiceConnection);
    probe.resolve();
    await expect(answer).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_INTERRUPTED' } });
    expect(owner.project).not.toHaveBeenCalled();
    await expect(owner.invoke()).resolves.toMatchObject({ ok: false });
  });

  it('rechecks authority after settlement and again when the final projection leaves its queue', async () => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const mutation = Promise.withResolvers<void>();
    const projectionQueued = Promise.withResolvers<void>();
    let queued = 0;
    const owner = subject(async () => { started.resolve(); await probe.promise; }, () => { if (++queued === 3) projectionQueued.resolve(); });
    const answer = owner.invoke(); await started.promise;
    const m = owner.serializeEffect(async () => mutation.promise);
    probe.resolve(); await projectionQueued.promise;
    owner.setAuthority(false);
    mutation.resolve(); await m;
    await expect(answer).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_INTERRUPTED' } });
    expect(owner.project).not.toHaveBeenCalled();
  });

  it.each(['start', 'result'] as const)('reports %s rejection without projecting or blocking later effects', async (where) => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const owner = subject(() => {
      started.resolve();
      if (where === 'start') throw new ServiceCallError('SERVICE_WRITE_FAILED', 'start failed');
      return probe.promise;
    });
    const answer = owner.invoke(); await started.promise;
    await owner.serializeEffect(async () => owner.setGeneration(1));
    if (where === 'result') probe.reject(new ServiceCallError('SERVICE_STOPPED', 'child exited'));
    await expect(answer).resolves.toMatchObject({ ok: false, error: { code: where === 'start' ? 'SERVICE_WRITE_FAILED' : 'SERVICE_STOPPED' } });
    expect(owner.project).not.toHaveBeenCalled();
  });

  it('does not enqueue a projection after child failure revokes authority', async () => {
    const probe = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    let queued = 0;
    const owner = subject(async () => { started.resolve(); await probe.promise; }, () => { queued += 1; });
    const answer = owner.invoke(); await started.promise;
    owner.setAuthority(false); probe.resolve();
    await expect(answer).resolves.toMatchObject({ ok: false });
    expect(queued).toBe(1);
    expect(owner.project).not.toHaveBeenCalled();
  });
});
