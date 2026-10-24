import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import { MAX_FRAME_BYTES, type FastModelSelectionInput, type ModelConnectionTestStatus, type ServiceFailureResponse, type ServiceRequest, type ServiceResponse } from '../shared/protocol.js';
import type { ModelRequestGovernor, ModelRequestProducer } from './analysis/execution.js';
import type { ModelConnectionTestExecution } from './fast-role/fast-role-execution.js';
import { FastRoleError } from './fast-role/fast-role-error.js';
import { decodeRequest, encodeServiceResponse, ProtocolError } from './request-frames.js';

export interface ServiceRequestLoopOptions {
  readonly input: AsyncIterable<Uint8Array>;
  readonly output: Writable;
  readonly requestGovernor: ModelRequestGovernor;
  readonly dispatch: (request: Exclude<ServiceRequest, { op: 'testModelServiceConnection' }>) => Promise<ServiceResponse>;
  readonly probe: (input: FastModelSelectionInput, execution: ModelConnectionTestExecution) => Promise<ModelConnectionTestStatus>;
  readonly probeCompleted: () => Promise<void>;
  readonly failure: (id: string, error: unknown) => ServiceFailureResponse;
  readonly afterResponse?: (request: ServiceRequest, response: ServiceResponse) => void;
  readonly onFatal: (error: unknown) => void;
}

interface ActiveProbe {
  readonly cancellation: AbortController;
  readonly producer: ModelRequestProducer;
  done: Promise<void>;
}

/** The existing length-prefixed service input, including split/coalesced frames and truncated EOF. */
async function* readFrames(input: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const header = Buffer.allocUnsafe(4);
  let headerOffset = 0;
  let payload: Buffer | undefined;
  let payloadOffset = 0;
  for await (const incoming of input) {
    const chunk = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming);
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      if (payload === undefined) {
        const length = Math.min(4 - headerOffset, chunk.length - chunkOffset);
        chunk.copy(header, headerOffset, chunkOffset, chunkOffset + length);
        headerOffset += length; chunkOffset += length;
        if (headerOffset < 4) continue;
        const size = header.readUInt32BE(0);
        if (size === 0 || size > MAX_FRAME_BYTES) throw new ProtocolError();
        payload = Buffer.allocUnsafe(size);
        payloadOffset = 0;
      }
      const length = Math.min(payload.length - payloadOffset, chunk.length - chunkOffset);
      chunk.copy(payload, payloadOffset, chunkOffset, chunkOffset + length);
      payloadOffset += length; chunkOffset += length;
      if (payloadOffset === payload.length) {
        yield payload;
        payload = undefined; payloadOffset = 0; headerOffset = 0;
      }
    }
  }
  if (headerOffset !== 0 || payload !== undefined) throw new ProtocolError();
}

/**
 * One detached connection probe, one serial ordinary effect lane and one complete-frame writer.
 * The read loop still awaits each ordinary response; the probe stays owned through its final write.
 */
export class ServiceRequestLoop {
  readonly #options: ServiceRequestLoopOptions;
  #probe: ActiveProbe | null = null;
  #effects = Promise.resolve();
  #writes = Promise.resolve();
  #closing = false;
  #disposed = false;
  #failure: { readonly error: unknown } | null = null;

  constructor(options: ServiceRequestLoopOptions) { this.#options = options; }

  close(): void {
    this.#closing = true;
    this.#probe?.cancellation.abort();
  }

  #fatal(error: unknown): void {
    if (this.#failure !== null) return;
    this.#failure = { error };
    this.close();
    this.#options.onFatal(error);
  }

  #effect<Result>(operation: () => Result | Promise<Result>): Promise<Result> {
    const result = this.#effects.then(operation, operation);
    this.#effects = result.then(() => undefined, () => undefined);
    return result;
  }

  #requireOpenStore(): void {
    if (this.#disposed || this.#failure !== null) throw new Error('SERVICE_REQUEST_LOOP_CLOSED');
  }

  async #write(response: ServiceResponse): Promise<void> {
    const writing = this.#writes.then(async () => {
      this.#requireOpenStore();
      const frame = encodeServiceResponse(response);
      const output = this.#options.output;
      await new Promise<void>((resolve, reject) => {
        let returned = false;
        let completed = false;
        let drained = false;
        let settled = false;
        const cleanup = (): void => {
          output.removeListener('drain', drain);
          output.removeListener('error', fail);
          output.removeListener('close', closed);
        };
        const finish = (): void => {
          if (!returned || !completed || !drained || settled) return;
          settled = true; cleanup(); resolve();
        };
        const fail = (error: Error): void => { if (settled) return; settled = true; cleanup(); reject(error); };
        const drain = (): void => { drained = true; finish(); };
        const closed = (): void => fail(new Error('SERVICE_RESPONSE_WRITER_CLOSED'));
        output.once('drain', drain);
        output.once('error', fail);
        output.once('close', closed);
        try {
          const accepted = output.write(frame, (error) => { if (error) fail(error); else { completed = true; finish(); } });
          returned = true;
          if (accepted) drained = true;
          finish();
        } catch (error) { fail(error instanceof Error ? error : new Error('SERVICE_RESPONSE_WRITE_FAILED')); }
      });
    });
    // Observe every writer immediately; the actual caller still receives and reports its rejection.
    this.#writes = writing.then(() => undefined, () => undefined);
    return writing;
  }

  async #executeProbe(request: Extract<ServiceRequest, { op: 'testModelServiceConnection' }>, probe: ActiveProbe): Promise<void> {
    let response: ServiceResponse;
    try {
      const result = await this.#options.probe(request.input, {
        requestGovernor: this.#options.requestGovernor, producer: probe.producer, signal: probe.cancellation.signal,
        settle: (operation) => this.#effect(() => { this.#requireOpenStore(); return operation(); }),
      });
      await this.#effect(async () => { this.#requireOpenStore(); await this.#options.probeCompleted(); });
      response = { id: request.id, ok: true, op: request.op, result };
    } catch (error) {
      response = this.#options.failure(request.id, error);
    }
    if (!this.#disposed && this.#failure === null) await this.#write(response);
  }

  async #startProbe(request: Extract<ServiceRequest, { op: 'testModelServiceConnection' }>): Promise<void> {
    let refusal: ServiceFailureResponse | null = null;
    await this.#effect(() => {
      if (this.#closing || this.#disposed) {
        refusal = this.#options.failure(request.id, new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', 'AI7 正在关闭；没有发送任何内容。'));
        return;
      }
      if (this.#probe !== null) {
        refusal = this.#options.failure(request.id, new FastRoleError('MODEL_CONNECTION_TEST_BUSY', '另一项文本连接测试正在进行；请等它完成。'));
        return;
      }
      // Registration precedes construction/readiness, and its key survives final publication/writing.
      const producer = this.#options.requestGovernor.registerProducer({ key: `connection-test:${randomUUID()}`, kind: 'connection-test', lane: 'foreground' });
      const probe: ActiveProbe = { producer, cancellation: new AbortController(), done: Promise.resolve() };
      this.#probe = probe;
      probe.done = this.#executeProbe(request, probe).catch((error: unknown) => this.#fatal(error)).finally(() => {
        this.#options.requestGovernor.unregisterProducer(producer);
        if (this.#probe === probe) this.#probe = null;
      });
      void probe.done.catch((error: unknown) => this.#fatal(error));
    }).catch((error: unknown) => { refusal = this.#options.failure(request.id, error); });
    if (refusal !== null) await this.#write(refusal);
  }

  async run(): Promise<void> {
    const writerFailure = (error: Error): void => this.#fatal(error);
    this.#options.output.on('error', writerFailure);
    try {
      for await (const frame of readFrames(this.#options.input)) {
        if (this.#closing) break;
        let request: ServiceRequest;
        try { request = decodeRequest(frame); }
        catch (error) {
          await this.#write(this.#options.failure(error instanceof ProtocolError ? error.requestId : 'invalid', error));
          continue;
        }
        if (request.op === 'testModelServiceConnection') { await this.#startProbe(request); continue; }
        if (request.op === 'shutdown') {
          this.close();
          // Completion can re-enter the effect lane; never await it while holding that lane.
          await this.#probe?.done;
        }
        const response = await this.#effect(() => this.#options.dispatch(request));
        await this.#write(response);
        this.#options.afterResponse?.(request, response);
        if (request.op === 'shutdown') break;
      }
    } catch (error) {
      this.#fatal(error);
    } finally {
      this.close();
      await this.#probe?.done;
      await this.#effects;
      await this.#writes;
      this.#disposed = true;
      this.#options.output.removeListener('error', writerFailure);
    }
    if (this.#failure !== null) throw this.#failure.error;
  }
}
