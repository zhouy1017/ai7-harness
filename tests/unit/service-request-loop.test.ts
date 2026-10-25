import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FRAME_BYTES, type ModelConnectionTestStatus, type ModelServiceConnectionProjection, type ServiceResponse } from '../../src/shared/protocol.js';
import { ModelRequestGovernor, type ModelRequestPermit, type ModelRequestProducer } from '../../src/service/analysis/execution.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { ServiceRequestLoop } from '../../src/service/service-request-loop.js';
import type { EditorialStore } from '../../src/service/store.js';

function deferred<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const wireIds = new Map<string, string>();
function wireId(label: string): string {
  let id = wireIds.get(label);
  if (id === undefined) { id = randomUUID(); wireIds.set(label, id); }
  return id;
}

function frame(value: { id: string; op: string; input: unknown }): Buffer {
  // Keep assertions readable while exercising the production UUID decoder.
  const body = Buffer.from(JSON.stringify({ ...value, id: wireId(value.id) }));
  const bytes = Buffer.alloc(4 + body.length);
  bytes.writeUInt32BE(body.length); body.copy(bytes, 4);
  return bytes;
}

class Responses extends Writable {
  readonly frames: ServiceResponse[] = [];
  readonly #waiting = new Map<string, ReturnType<typeof deferred<ServiceResponse>>>();
  hold: ((done: (error?: Error | null) => void) => void) | null = null;

  constructor() { super({ highWaterMark: 1 }); }

  response(id: string): Promise<ServiceResponse> {
    const found = this.frames.find((response) => response.id === id);
    if (found !== undefined) return Promise.resolve(found);
    let waiting = this.#waiting.get(id);
    if (waiting === undefined) { waiting = deferred<ServiceResponse>(); this.#waiting.set(id, waiting); }
    return waiting.promise;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    expect(chunk.readUInt32BE(0)).toBe(chunk.length - 4);
    const response = JSON.parse(chunk.subarray(4).toString('utf8')) as ServiceResponse;
    response.id = [...wireIds].find(([, id]) => id === response.id)?.[0] ?? response.id;
    this.frames.push(response);
    this.#waiting.get(response.id)?.resolve(response);
    if (this.hold === null) done(); else this.hold(done);
  }
}

const probeInput = { route: 'opencode-go', modelId: 'deepseek-v4.1-flash' } as const;
const readyConnection = (): ModelServiceConnectionProjection => ({
  connectionId: 'main-editorial-opencode-go', roleId: 'main-editorial', connectionName: 'Loop test',
  binding: { providerId: 'opencode-go', providerLabel: 'OpenCode Go', modelId: 'deepseek-v4.1-flash',
    modelLabel: 'DeepSeek', adapterRevision: 1, configurationRevision: 1, approvedFallbackChain: [], credentialSlot: 'opencode-go' },
  credentialReference: randomUUID(), credentialOperationState: 'ready', selected: false,
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', credentialUpdatedAt: '2026-10-25T00:00:00.000Z',
});
const modelBody = () => ({ model: probeInput.modelId, choices: [{ message: { content: 'AI7_OK' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 3 } });

describe('the production framed service loop', () => {
  let governor: ModelRequestGovernor;
  let input: PassThrough;
  let output: Responses;
  let loop: ServiceRequestLoop | undefined;
  let running: Promise<void> | undefined;
  let connection: ModelServiceConnectionProjection;
  let records: ModelConnectionTestStatus[];
  let events: string[];
  let sends: number;
  let secretReads: number;
  let blocker: ModelRequestProducer | undefined;
  let held: ModelRequestPermit | undefined;
  let native: (signal: AbortSignal) => Promise<unknown>;
  let dispatch: (operation: string) => Promise<void>;
  let responseFinished: () => void;
  let completion: () => Promise<void>;
  let refused: (wire: string) => void;

  beforeEach(() => {
    governor = new ModelRequestGovernor({ globalCapacity: 1 });
    input = new PassThrough(); output = new Responses(); connection = readyConnection();
    records = []; events = []; sends = 0; secretReads = 0;
    native = async () => modelBody(); dispatch = async () => undefined; responseFinished = () => undefined;
    completion = async () => undefined; refused = () => undefined;
    loop = undefined; running = undefined; blocker = undefined; held = undefined;
  });

  afterEach(async () => {
    held?.release();
    if (blocker !== undefined) governor.unregisterProducer(blocker);
    loop?.close(); input.end();
    await running?.catch(() => undefined);
    governor.close(); await governor.whenIdle();
    vi.restoreAllMocks();
  });

  function start(admitProbe?: () => void): void {
    // Only storage and native I/O are stubs. Framing, dispatch branch, probe owner, harness,
    // gate, adapter, shared admission and conditional-settlement scheduling are production code.
    const store = {
      getModelServiceRouteConnection: () => connection,
      recordModelConnectionTest: (frozen: ModelServiceConnectionProjection, result: ModelConnectionTestStatus) => {
        events.push('record');
        if (frozen.credentialUpdatedAt !== connection.credentialUpdatedAt || frozen.credentialReference !== connection.credentialReference) {
          throw Object.assign(new Error('stale'), { code: 'MODEL_SERVICE_CONNECTION_CONFLICT' });
        }
        records.push(result);
      },
    } as unknown as EditorialStore;
    loop = new ServiceRequestLoop({
      input, output, requestGovernor: governor,
      probe: (selection, execution) => testModelServiceConnection(store, resolve('.'), {
        scope: 'ordinary-production', nativeFetch: (async (_url: unknown, init: RequestInit) => {
          sends += 1; events.push('send');
          return { status: 200, json: () => native(init.signal as AbortSignal) };
        }) as unknown as typeof fetch,
      }, selection, { resolve: async () => { secretReads += 1; return 'public-synthetic-placeholder'; } }, execution),
      probeCompleted: async () => { events.push('refresh'); await completion(); },
      ...(admitProbe === undefined ? {} : { admitProbe }),
      dispatch: async (request) => {
        events.push(request.op); await dispatch(request.op);
        return { id: request.id, ok: true, op: request.op, result: undefined } as ServiceResponse;
      },
      failure: (id, error) => {
        refused(id);
        return { id, ok: false, error: {
          code: error instanceof Error && 'code' in error ? String(error.code) : 'SERVICE_REQUEST_FAILED', message: '请求未完成。',
        } };
      },
      afterResponse: () => responseFinished(),
      onFatal: () => { input.end(); },
    });
    running = loop.run();
    void running.catch(() => undefined);
  }

  async function occupy(): Promise<void> {
    blocker = governor.registerProducer({ key: 'existing-model-request', kind: 'dialogue', lane: 'foreground' });
    held = await governor.acquire(blocker, new AbortController().signal);
  }

  function nextAdmission(): Promise<void> {
    const called = deferred(); const acquire = governor.acquire.bind(governor);
    vi.spyOn(governor, 'acquire').mockImplementation((producer, signal) => {
      const result = acquire(producer, signal); called.resolve(); return result;
    });
    return called.promise;
  }

  function send(id: string, op: string, value: unknown = {}): void { input.write(frame({ id, op, input: value })); }

  it('serves settings and cancellation while a real probe waits, then holds capacity through JSON cleanup', async () => {
    await occupy(); const queued = nextAdmission(); const body = deferred<unknown>(); const consuming = deferred();
    native = async () => { consuming.resolve(); return body.promise; };
    start(); send('p', 'testModelServiceConnection', probeInput); await queued;
    expect(governor.snapshot()).toMatchObject({ registered: 2, waiting: 1, inFlight: 1 });
    send('m', 'selectFastRoleModel', probeInput); send('c', 'cancelBaselineAnalysisRun', { bookId: randomUUID(), taskIntentId: randomUUID() });
    await output.response('c');
    expect(events).toEqual(['selectFastRoleModel', 'cancelBaselineAnalysisRun']); expect(sends).toBe(0);
    held!.release(); await consuming.promise;
    expect(governor.snapshot()).toMatchObject({ waiting: 0, inFlight: 1 });
    send('p2', 'testModelServiceConnection', probeInput);
    expect(await output.response('p2')).toMatchObject({ ok: false, error: { code: 'MODEL_CONNECTION_TEST_BUSY' } });
    expect(secretReads).toBe(2); expect(governor.snapshot().registered).toBe(2);
    body.resolve(modelBody()); expect(await output.response('p')).toMatchObject({ ok: true, result: { outcome: 'passed' } });
    expect(events.slice(-3)).toEqual(['send', 'record', 'refresh']);
    input.end(); await running;
    expect(records).toHaveLength(1); expect(sends).toBe(1);
    expect(governor.snapshot()).toMatchObject({ registered: 1, waiting: 0, inFlight: 0 });
  });

  it('applies the ordinary admission gate in order before a probe registers, and reports its registration lifetime', async () => {
    let waiting = true;
    start(() => { if (waiting) throw Object.assign(new Error('replacement waiting'), { code: 'DATABASE_REPLACEMENT_WAITING' }); });
    send('a', 'getStartup'); send('p', 'testModelServiceConnection', probeInput);
    expect(await output.response('p')).toMatchObject({ ok: false, error: { code: 'DATABASE_REPLACEMENT_WAITING' } });
    expect(output.frames.map((response) => response.id)).toEqual(['a', 'p']);
    expect(secretReads).toBe(0); expect(sends).toBe(0); expect(records).toEqual([]); expect(loop!.probing).toBe(false);
    expect(governor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
    waiting = false; await occupy(); const queued = nextAdmission();
    send('p2', 'testModelServiceConnection', probeInput); await queued;
    expect(loop!.probing).toBe(true);
    held!.release(); expect(await output.response('p2')).toMatchObject({ ok: true, result: { outcome: 'passed' } });
    input.end(); await running;
    expect(loop!.probing).toBe(false); expect(sends).toBe(1); expect(records).toHaveLength(1);
  });

  it('refuses a stale credential generation after queued grant without sending or overwriting it', async () => {
    await occupy(); const queued = nextAdmission();
    dispatch = async () => { connection = { ...connection, credentialUpdatedAt: '2026-10-25T00:00:01.000Z' }; };
    start(); send('p', 'testModelServiceConnection', probeInput); await queued;
    send('m', 'selectFastRoleModel', probeInput); await output.response('m');
    held!.release();
    expect(await output.response('p')).toMatchObject({ ok: false, error: { code: 'MODEL_SERVICE_CONNECTION_CONFLICT' } });
    expect(sends).toBe(0); expect(records).toEqual([]); expect(events).not.toContain('refresh');
  });

  it('aborts queued admission on EOF and publishes cleanup before run resolves', async () => {
    await occupy(); const queued = nextAdmission();
    start(); send('p', 'testModelServiceConnection', probeInput); await queued;
    input.end(); await running;
    expect(await output.response('p')).toMatchObject({ ok: true, result: { outcome: 'cancelled' } });
    expect(sends).toBe(0); expect(records).toHaveLength(1);
    expect(governor.snapshot()).toMatchObject({ registered: 1, waiting: 0, inFlight: 1 });
    const settled = events.slice(); await Promise.resolve(); expect(events).toEqual(settled);
  });

  it('rechecks cancellation after grant before its awaiting continuation resumes', async () => {
    await occupy(); const queued = nextAdmission();
    start(); send('p', 'testModelServiceConnection', probeInput); await queued;
    held!.release(); loop!.close(); input.end();
    expect(governor.snapshot().inFlight).toBe(1);
    await running; expect(sends).toBe(0);
    expect(governor.snapshot()).toMatchObject({ registered: 1, inFlight: 0 });
  });

  it('waits for active body cleanup and probe publication before the shutdown effect', async () => {
    const body = deferred<unknown>(); const consuming = deferred<AbortSignal>(); const aborted = deferred();
    native = async (signal) => { signal.addEventListener('abort', () => aborted.resolve(), { once: true }); consuming.resolve(signal); return body.promise; };
    start(); send('p', 'testModelServiceConnection', probeInput); await consuming.promise;
    send('s', 'shutdown'); await aborted.promise;
    expect(events).not.toContain('shutdown'); expect(governor.snapshot().inFlight).toBe(1);
    body.reject(new DOMException('aborted', 'AbortError'));
    await running;
    expect(output.frames.map((response) => response.id)).toEqual(['p', 's']);
    expect(events).toEqual(['send', 'record', 'refresh', 'shutdown']);
    expect(records[0]?.outcome).toBe('outcome-unknown'); expect(governor.snapshot().registered).toBe(0);
  });

  it('retains probe registration through response callback and backpressure cleanup', async () => {
    const blockedWrite = deferred<(error?: Error | null) => void>();
    output.hold = (done) => blockedWrite.resolve(done);
    start(); send('p', 'testModelServiceConnection', probeInput);
    const finish = await blockedWrite.promise;
    expect(await output.response('p')).toMatchObject({ ok: true });
    expect(governor.snapshot()).toMatchObject({ registered: 1, inFlight: 0 });
    let finished = false; void running!.then(() => { finished = true; });
    input.end(); await Promise.resolve(); expect(finished).toBe(false);
    finish(); await running; expect(governor.snapshot().registered).toBe(0);
  });

  it('refuses a probe whose ordered start runs after close, before registration, secret or send', async () => {
    // The first probe's completion holds the effect lane, so the second probe's ordered start waits behind it.
    const held = deferred(); const refreshing = deferred();
    completion = async () => { refreshing.resolve(); await held.promise; };
    start(); send('p', 'testModelServiceConnection', probeInput); await refreshing.promise;
    const second = deferred(); refused = (wire) => { if (wire === wireId('p2')) second.resolve(); };
    send('p2', 'testModelServiceConnection', probeInput); await new Promise((resolve) => setTimeout(resolve, 5));
    loop!.close(); held.resolve(); await second.promise;
    expect(await output.response('p2')).toMatchObject({ ok: false, error: { code: 'MODEL_CONNECTION_TEST_UNAVAILABLE' } });
    input.end(); await running;
    expect(output.frames.map((response) => response.id)).toEqual(['p', 'p2']);
    // One accepted probe reads its credential twice (readiness, then release); the refused one reads none.
    expect(secretReads).toBe(2); expect(sends).toBe(1); expect(governor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
  });

  it('keeps a completed probe registered while its response write is held, so a second probe is busy', async () => {
    const blockedWrite = deferred<(error?: Error | null) => void>();
    output.hold = (done) => blockedWrite.resolve(done);
    start(); send('p', 'testModelServiceConnection', probeInput);
    const finish = await blockedWrite.promise; output.hold = null;
    const second = deferred(); refused = (wire) => { if (wire === wireId('p2')) second.resolve(); };
    send('p2', 'testModelServiceConnection', probeInput); await second.promise;
    expect(governor.snapshot().registered).toBe(1); expect(loop!.probing).toBe(true);
    finish();
    expect(await output.response('p2')).toMatchObject({ ok: false, error: { code: 'MODEL_CONNECTION_TEST_BUSY' } });
    input.end(); await running;
    expect(output.frames.map((response) => response.id)).toEqual(['p', 'p2']);
    expect(sends).toBe(1); expect(secretReads).toBe(2); expect(governor.snapshot().registered).toBe(0);
  });

  it('stops on a late probe response write failure and releases its registration without further writes', async () => {
    output.hold = (done) => done(new Error('late probe write failed'));
    start(); send('p', 'testModelServiceConnection', probeInput);
    await expect(running).rejects.toThrow('late probe write failed');
    expect(sends).toBe(1); expect(records).toHaveLength(1);
    expect(governor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
    const settled = output.frames.length; await Promise.resolve(); expect(output.frames).toHaveLength(settled);
  });

  it('decodes split/coalesced frames and awaits each ordinary write before dispatching the next', async () => {
    const blockedWrite = deferred<(error?: Error | null) => void>(); const ordinary = deferred();
    output.hold = (done) => blockedWrite.resolve(done);
    dispatch = async () => ordinary.promise;
    start(); const frames = Buffer.concat([frame({ id: 'a', op: 'getStartup', input: {} }), frame({ id: 'b', op: 'getStartup', input: {} })]);
    input.write(frames.subarray(0, 2)); input.write(frames.subarray(2, 9)); input.write(frames.subarray(9));
    ordinary.resolve(); const finish = await blockedWrite.promise;
    expect(events).toEqual(['getStartup']);
    output.hold = null; finish(); await output.response('b'); input.end(); await running;
    expect(events).toEqual(['getStartup', 'getStartup']); expect(output.frames.map((response) => response.id)).toEqual(['a', 'b']);
  });

  it('keeps probe settlement behind the current ordinary effect without holding that lane while waiting', async () => {
    const consuming = deferred(); const body = deferred<unknown>(); const mutation = deferred(); const entered = deferred();
    native = async () => { consuming.resolve(); return body.promise; };
    dispatch = async () => { entered.resolve(); await mutation.promise; };
    start(); send('p', 'testModelServiceConnection', probeInput); await consuming.promise;
    send('m', 'selectFastRoleModel', probeInput); await entered.promise;
    body.resolve(modelBody()); await Promise.resolve(); expect(records).toEqual([]);
    mutation.resolve(); await output.response('p'); input.end(); await running;
    expect(events).toEqual(['send', 'selectFastRoleModel', 'record', 'refresh']);
  });

  it('reports invalid requests through real decoding and continues to the next ordinary request', async () => {
    start(); input.write(frame({ id: 'bad', op: 'not-an-operation', input: {} })); send('good', 'getStartup');
    expect(await output.response('bad')).toMatchObject({ ok: false }); await output.response('good'); input.end(); await running;
    expect(events).toEqual(['getStartup']);
  });

  it.each(['zero', 'oversize', 'header', 'payload'] as const)('rejects %s framing and drains its owned resources', async (kind) => {
    start(); const header = Buffer.alloc(4);
    header.writeUInt32BE(kind === 'zero' ? 0 : kind === 'oversize' ? MAX_FRAME_BYTES + 1 : 10);
    input.end(kind === 'header' ? header.subarray(0, 2) : kind === 'payload' ? Buffer.concat([header, Buffer.from('{}')]) : header);
    await expect(running).rejects.toMatchObject({ code: 'PROTOCOL_INVALID' });
    expect(governor.snapshot().registered).toBe(0);
  });

  it('aborts active work on a writer fault and awaits body cleanup without late writes', async () => {
    const consuming = deferred(); const body = deferred<unknown>(); const aborted = deferred();
    native = async (signal) => { signal.addEventListener('abort', () => aborted.resolve(), { once: true }); consuming.resolve(); return body.promise; };
    start(); send('p', 'testModelServiceConnection', probeInput); await consuming.promise;
    output.destroy(new Error('writer failed')); await aborted.promise;
    expect(governor.snapshot().inFlight).toBe(1);
    body.reject(new DOMException('abort', 'AbortError'));
    await expect(running).rejects.toThrow('writer failed');
    expect(output.frames).toEqual([]); expect(governor.snapshot().registered).toBe(0);
    const settled = events.slice(); await Promise.resolve(); expect(events).toEqual(settled);
  });

  it('propagates the post-acknowledgement fault hook at its original response boundary', async () => {
    responseFinished = () => { throw new Error('after acknowledgement'); };
    start(); send('a', 'getStartup'); await expect(running).rejects.toThrow('after acknowledgement');
    expect(output.frames.map((response) => response.id)).toEqual(['a']);
  });
});
