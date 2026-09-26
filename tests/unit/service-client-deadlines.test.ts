import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceClient } from '../../src/main/service-client.js';
import { SERVICE_PROTOCOL_VERSION, type ServiceReadiness } from '../../src/shared/protocol.js';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));

const readiness: ServiceReadiness = {
  protocolVersion: SERVICE_PROTOCOL_VERSION, state: 'ready',
  runtime: { electron: '43.4.1', node: '24.18.1', modules: '148' },
  harness: { state: 'mounted-dormant', executionReady: false, providerFree: true,
    services: 6, serviceSet: ['agents', 'sessions', 'llm', 'systemPrompt', 'tools', 'agentLoop'],
    configuredAgents: 0, agents: 0, sessions: 0, providers: 0, configurableProviders: 0,
    tools: 0, assembledTools: 0, renderedPrompt: '', renderedRuntimeContext: '' },
};

/** A framed peer with explicit responses: the real client owns ordering, deadlines and faults. */
class Peer extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: Array<{ id: string; op: string }> = [];
  exitCode: number | null = null;
  signalCode: string | null = null;
  readonly stdin = new Writable({ write: (frame: Buffer, _encoding, done) => {
    const request = JSON.parse(frame.subarray(4).toString('utf8')) as { id: string; op: string };
    this.requests.push(request);
    if (request.op === 'ready') queueMicrotask(() => this.reply(request, readiness));
    done();
  } });
  readonly kill = vi.fn(() => { this.exitCode = 1; this.emit('exit', 1, null); return true; });

  reply(request: { id: string; op: string }, result: unknown): void {
    this.send({ ...request, ok: true, result });
  }
  send(response: unknown): void {
    const payload = Buffer.from(JSON.stringify(response));
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32BE(payload.length);
    payload.copy(frame, 4);
    this.stdout.write(frame);
  }
}

function outcome(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error instanceof Error && 'code' in error ? error.code : 'unexpected-error');
}

describe('serial service request execution deadlines', () => {
  let peer: Peer;
  let client: ServiceClient;
  beforeEach(async () => {
    vi.useFakeTimers();
    peer = new Peer();
    childProcess.spawn.mockReturnValue(peer);
    client = await ServiceClient.start(resolve('node'), resolve('service.js'), resolve('data'),
      { trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null });
    peer.requests.length = 0;
  });
  afterEach(() => { peer.kill(); vi.useRealTimers(); vi.clearAllMocks(); });

  it('does not kill a long operation for a normal read waiting behind it', async () => {
    const long = outcome(client.call('getStartup', {}));
    const read = outcome(client.call('inspectGlobalAttention', {}));
    await vi.advanceTimersByTimeAsync(35_000);
    expect(peer.kill).not.toHaveBeenCalled();
    peer.reply(peer.requests[0]!, { state: 'none' });
    await expect(long).resolves.toEqual({ state: 'none' });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(peer.kill).not.toHaveBeenCalled();
    peer.reply(peer.requests[1]!, { groups: [], running: false });
    await expect(read).resolves.toEqual({ groups: [], running: false });
  });

  it('starts the normal deadline when the preceding long response arrives', async () => {
    const long = outcome(client.call('getStartup', {}));
    const read = outcome(client.call('inspectGlobalAttention', {}));
    await vi.advanceTimersByTimeAsync(35_000);
    peer.reply(peer.requests[0]!, { state: 'none' });
    await long;
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(read).resolves.toBe('SERVICE_TIMEOUT');
    expect(peer.kill).toHaveBeenCalledTimes(1);
  });

  it('keeps the active long deadline and rejects waiting callers on its timeout', async () => {
    const long = outcome(client.call('getStartup', {}));
    const read = outcome(client.call('inspectGlobalAttention', {}));
    await vi.advanceTimersByTimeAsync(600_000);
    await expect(long).resolves.toBe('SERVICE_TIMEOUT');
    await expect(read).resolves.toBe('SERVICE_PROTOCOL_FAILED');
    expect(peer.kill).toHaveBeenCalledTimes(1);
  });

  it('rejects active and waiting callers immediately on service exit', async () => {
    const long = outcome(client.call('getStartup', {}));
    const read = outcome(client.call('inspectGlobalAttention', {}));
    peer.emit('exit', 1, null);
    await expect(long).resolves.toBe('SERVICE_STOPPED');
    await expect(read).resolves.toBe('SERVICE_STOPPED');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(peer.kill).not.toHaveBeenCalled();
  });

  it('keeps the sixteen-request admission bound', async () => {
    const admitted = Array.from({ length: 16 }, () => outcome(client.call('getStartup', {})));
    await expect(outcome(client.call('getStartup', {}))).resolves.toBe('SERVICE_UNAVAILABLE');
    expect(peer.requests).toHaveLength(16);
    peer.emit('exit', 1, null);
    await Promise.all(admitted);
  });
});
