import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { journeyStartupRelay, ServiceClient, type ServiceStartupStep } from '../../src/main/service-client.js';
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

/** A service whose answer to `ready` waits until the test sends it, so its stderr can speak first. */
class Peer extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: Array<{ id: string; op: string }> = [];
  exitCode: number | null = null;
  signalCode: string | null = null;
  readonly stdin = new Writable({ write: (frame: Buffer, _encoding, done) => {
    this.requests.push(JSON.parse(frame.subarray(4).toString('utf8')) as { id: string; op: string });
    done();
  } });
  readonly kill = vi.fn(() => { this.exitCode = 1; this.emit('exit', 1, null); return true; });

  reply(request: { id: string; op: string }, result: unknown): void {
    const payload = Buffer.from(JSON.stringify({ ...request, ok: true, result }));
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32BE(payload.length);
    payload.copy(frame, 4);
    this.stdout.write(frame);
  }
}

const settle = (): Promise<void> => new Promise((done) => setImmediate(done));

function start(peer: Peer, onStartupStep?: (step: ServiceStartupStep) => void): Promise<ServiceClient> {
  childProcess.spawn.mockReturnValue(peer);
  return ServiceClient.start(resolve('node'), resolve('service.js'), resolve('data'),
    { trustedOperationalScope: 'development-ci', runBudgetCeiling: null, providerCacheRoot: null },
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, onStartupStep);
}

// Issue #675: main reads how far its service's startup came from the service's stderr, only its fixed lines, and only until
// the service is ready, so a Journey whose launch waits at `service-ready` can say where the service stood.
describe('the service startup trace (Issue #675)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('names spawned, then each step the service says, until it is ready, and nothing else it says', async () => {
    const peer = new Peer();
    const steps: ServiceStartupStep[] = [];
    const started = start(peer, (step) => steps.push(step));
    peer.emit('spawn');
    peer.stderr.write('AI7_SERVICE_STARTUP/process\n');
    // A line split across writes, a Windows line end, and words that are not a step.
    peer.stderr.write('AI7_SERVICE_STAR');
    peer.stderr.write('TUP/store\r\nExperimentalWarning: something C:\\Users\\someone\n');
    peer.stderr.write('AI7_SERVICE_STARTUP/renderer-first-paint\nAI7_SERVICE_STARTUP/store now\n');
    // A line longer than any step, ending in what would otherwise read as one.
    peer.stderr.write(`${'x'.repeat(200)}AI7_SERVICE_STARTUP/owners\n`);
    peer.stderr.write('AI7_SERVICE_STARTUP/owners\nAI7_SERVICE_STARTUP/serving\n');
    await settle();
    peer.reply(peer.requests[0]!, readiness);
    await started;
    expect(steps).toEqual(['spawned', 'process', 'store', 'owners', 'serving']);
    // Once the service is ready, nothing more is read from its stderr.
    peer.stderr.write('AI7_SERVICE_STARTUP/serving\n');
    peer.emit('spawn');
    await settle();
    expect(steps).toHaveLength(5);
    expect(peer.stderr.listenerCount('data')).toBe(0);
    peer.kill();
  });

  it('names a service that stopped before it was ready by that alone, never its code', async () => {
    const peer = new Peer();
    const steps: ServiceStartupStep[] = [];
    const started = start(peer, (step) => steps.push(step)).catch((error: unknown) => error);
    peer.stderr.write('AI7_SERVICE_STARTUP/store\nAI7_SERVICE_STOPPED/STORE_SCHEMA_INVALID\nAI7_SERVICE_STOPPED/not a code\n');
    await settle();
    peer.exitCode = 1;
    peer.emit('exit', 1, null);
    expect(await started).toMatchObject({ code: 'SERVICE_STOPPED' });
    expect(steps).toEqual(['store', 'stopped']);
  });

  it('is relayed by main only under an E2E Journey, one fixed line per step', () => {
    const written: string[] = [];
    expect(journeyStartupRelay({}, (line) => written.push(line))).toBeUndefined();
    expect(journeyStartupRelay({ AI7_E2E_JOURNEY: undefined }, (line) => written.push(line))).toBeUndefined();
    const relay = journeyStartupRelay({ AI7_E2E_JOURNEY: 'J-01' }, (line) => written.push(line));
    relay?.('store');
    relay?.('stopped');
    expect(written).toEqual(['AI7_SERVICE_STARTUP/store\n', 'AI7_SERVICE_STARTUP/stopped\n']);
  });

  it('reads nothing from the stream when no one asks for the trace', async () => {
    const peer = new Peer();
    const resume = vi.spyOn(peer.stderr, 'resume');
    const started = start(peer);
    peer.stderr.write('AI7_SERVICE_STARTUP/process\n');
    await settle();
    peer.reply(peer.requests[0]!, readiness);
    await started;
    expect(resume).toHaveBeenCalled();
    expect(peer.stderr.listenerCount('data')).toBe(0);
    peer.kill();
  });
});
