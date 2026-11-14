import { Worker } from 'node:worker_threads';
import { recordCheckpointSkip, type WalCheckpointPolicy } from './store-schema.js';
import { requireStore } from './store-records.js';

const WRITE_IDLE_MS = 1_000;
// Slow PASSIVE work stays on the worker: it never owns the data-writer lock.
const TRUNCATE_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
type Mode = 'PASSIVE' | 'TRUNCATE' | 'close';
type Result = { id: number; ok: boolean; busy: boolean; beforeBytes: number; afterBytes: number; logFrames?: number; checkpointedFrames?: number; sqliteCode?: number };
type FailureReason = 'start-error' | 'start-timeout' | 'thread-error' | 'thread-exit' | 'checkpoint-error' | 'send-error' | 'flight-timeout' | 'shutdown-timeout';
const sqliteCodeOf = (error: unknown): number => typeof error === 'object' && error !== null && 'errcode' in error && typeof error.errcode === 'number' ? error.errcode : 0;
export type CheckpointWorkerFactory = (path: string) => Worker;

/** One store-owned checkpoint connection; all data transactions remain on the existing writer connections. */
export class WalCheckpointMaintenance {
  #worker: Worker | undefined;
  #available = false;
  #failed = false;
  #stopping = false;
  #pending = false;
  #idleCycle = false;
  #trimReady: { frames: number; version: number } | undefined;
  #nextId = 0;
  #lastWrite = Date.now();
  #writeVersion = 0;
  #lastFrames = 0;
  #retryAt = 0;
  #waitingWriters = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #startupTimer: ReturnType<typeof setTimeout> | undefined;
  #flight: { id: number; mode: Mode; idle: boolean; version: number; done: Promise<void>; resolve: () => void; timer: ReturnType<typeof setTimeout> | undefined } | undefined;
  #lastResult: Result | undefined;
  #termination: Promise<number> | undefined;
  #stopPromise: Promise<void> | undefined;
  #resolveReady!: (ready: boolean) => void;
  readonly ready = new Promise<boolean>(resolve => { this.#resolveReady = resolve; });

  constructor(
    private readonly policy: WalCheckpointPolicy,
    path: string,
    createWorker: CheckpointWorkerFactory = path => new Worker(new URL('./wal-checkpoint-worker.mjs', import.meta.url), { workerData: { databasePath: path } }),
  ) {
    this.#observeWrites();
    try {
      this.#worker = createWorker(path);
      this.#startupTimer = setTimeout(() => { setImmediate(() => {
        if (!this.#available && !this.#failed && !this.#stopping) this.#fail('start-timeout', 'startup');
      }); }, 10_000);
      this.#startupTimer.unref();
      this.#worker.on('message', (packet: Result | { ready: true }) => {
        if ('ready' in packet) {
          if (this.#failed || this.#stopping) return;
          clearTimeout(this.#startupTimer); this.#startupTimer = undefined;
          this.#available = true; this.#resolveReady(true); this.#scheduleIdle(); this.#pump(); return;
        }
        const flight = this.#flight;
        if (!flight || flight.id !== packet.id) return;
        clearTimeout(flight.timer); this.#flight = undefined; this.#lastResult = packet; flight.resolve();
        if (!packet.ok) { this.#fail('checkpoint-error', flight.mode, packet.sqliteCode ?? 0); return; }
        if (this.#stopping) return;
        if (packet.busy || (packet.logFrames ?? 0) > (packet.checkpointedFrames ?? 0)) {
          this.#pending = true; this.#trimReady = undefined; this.#retryAt = Date.now() + WRITE_IDLE_MS;
          this.#scheduleIdle(); return;
        }
        // Idle backfill is PASSIVE. A new commit invalidates this permission to take the short truncation lock.
        if (flight.mode === 'PASSIVE' && flight.idle && this.#observeWrites() && flight.version === this.#writeVersion) {
          this.#trimReady = { frames: packet.logFrames ?? 0, version: flight.version }; this.#pending = true;
        }
        this.#retryAt = 0; this.#pump(); this.#scheduleIdle();
      });
      this.#worker.on('error', error => this.#fail('thread-error', this.#flight?.mode ?? (this.#available ? 'none' : 'startup'), sqliteCodeOf(error)));
      this.#worker.on('exit', code => {
        if (this.#flight || !this.#stopping) this.#fail('thread-exit', this.#flight?.mode ?? 'none', 0, code);
        this.#available = false; this.#resolveReady(false);
      });
    } catch (error) { this.#fail('start-error', 'startup', sqliteCodeOf(error)); }
  }

  get available(): boolean { return this.#available && !this.#failed && !this.#stopping; }
  #terminate(): Promise<number> | undefined {
    this.#termination ??= this.#worker?.terminate();
    // Node's terminate() calls ref(); detach only after requesting termination.
    this.#worker?.unref();
    void this.#termination?.catch(() => undefined);
    return this.#termination;
  }
  #fail(reason: FailureReason, mode: Mode | 'startup' | 'none', sqliteCode = 0, exitCode = 0): void {
    if (!this.#failed) process.stderr.write('AI7_CHECKPOINT_WORKER_FAILED/' + JSON.stringify({ reason, mode, sqliteCode, exitCode }) + '\n');
    this.#failed = true; this.#available = false; this.#pending = false; this.#trimReady = undefined;
    clearTimeout(this.#startupTimer); this.#startupTimer = undefined;
    this.#resolveReady(false); this.#clearIdle();
    if (this.#flight) { clearTimeout(this.#flight.timer); this.#flight.resolve(); this.#flight = undefined; }
    this.#terminate(); this.#scheduleIdle();
  }
  #clearIdle(): void { if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined; }
  #observeWrites(): boolean {
    try {
      const frames = this.policy.frames();
      if (frames !== this.#lastFrames && frames > 0) { this.#lastWrite = Date.now(); this.#writeVersion++; this.#trimReady = undefined; }
      this.#lastFrames = frames; return true;
    } catch (error) { recordCheckpointSkip(error, 'observe'); this.#retryAt = Date.now() + WRITE_IDLE_MS; return false; }
  }
  journalWritten(): void {
    this.#observeWrites(); this.#lastWrite = Date.now(); this.#writeVersion++; this.#trimReady = undefined; this.#scheduleIdle();
  }
  async waitForJournalWrite(): Promise<void> {
    const checkpoint = this.#flight;
    if (checkpoint?.mode !== 'TRUNCATE') return;
    this.#waitingWriters++;
    // The owned TRUNCATE flight already has the five-second bound; a second timer cannot win.
    try { await checkpoint.done; }
    finally { this.#waitingWriters--; }
  }

  admitJournalWrite(): void {
    requireStore(!this.#stopping, 'JOURNAL_CHECKPOINT_BUSY', '本机存储正在整理，请稍候重试保存。');
    this.policy.admitJournalWrite();
  }
  maintain(idle: boolean): ReturnType<WalCheckpointPolicy['maintain']> {
    if (this.#stopping) return null;
    // Starting is healthy: never put a recovered-WAL checkpoint on the response lane while the thread starts.
    if (this.#failed) { const result = this.policy.maintain(idle); this.#scheduleIdle(); return result; }
    if (!this.available) return null;
    if (!this.#observeWrites()) { this.#scheduleIdle(); return null; }
    try { if (this.policy.needsMaintenance()) { this.#pending = true; this.#pump(); } }
    catch (error) { recordCheckpointSkip(error, 'response'); this.#retryAt = Date.now() + WRITE_IDLE_MS; }
    this.#scheduleIdle(); return null;
  }
  #scheduleIdle(): void {
    this.#clearIdle();
    if (this.#stopping || (!this.#available && !this.#failed)) return;
    try { if (this.policy.fileBytes() === 0) return; }
    catch (error) { recordCheckpointSkip(error, 'size'); this.#retryAt = Date.now() + WRITE_IDLE_MS; }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (this.#failed) { this.policy.maintain(true, true); this.#retryAt = Date.now() + WRITE_IDLE_MS; this.#scheduleIdle(); return; }
      if (!this.#observeWrites() || Date.now() - this.#lastWrite < WRITE_IDLE_MS) { this.#scheduleIdle(); return; }
      this.#pending = true; this.#idleCycle = true; this.#pump();
    }, Math.max(1, this.#retryAt - Date.now(), WRITE_IDLE_MS - (Date.now() - this.#lastWrite)));
    this.#timer.unref();
  }
  #pump(): void {
    if (!this.available || this.#flight || !this.#pending) return;
    if (Date.now() < this.#retryAt || !this.#observeWrites()) { this.#scheduleIdle(); return; }
    const trim = this.#trimReady;
    const truncate = trim && trim.version === this.#writeVersion && trim.frames === this.#lastFrames && this.#waitingWriters === 0 && Date.now() - this.#lastWrite >= WRITE_IDLE_MS;
    const idle = this.#idleCycle;
    this.#pending = false; this.#idleCycle = false; this.#trimReady = undefined;
    try { if (!truncate && !idle && !this.policy.needsMaintenance()) return; }
    catch (error) { recordCheckpointSkip(error, 'pump'); this.#retryAt = Date.now() + WRITE_IDLE_MS; this.#scheduleIdle(); return; }
    this.#send(truncate ? 'TRUNCATE' : 'PASSIVE', false, idle, truncate ? trim.frames : undefined);
  }
  #send(mode: Mode, close = false, idle = false, expectedFrames?: number): Promise<void> {
    const id = ++this.#nextId;
    let resolve!: () => void;
    const done = new Promise<void>(yes => { resolve = yes; });
    const timer = mode === 'PASSIVE' ? undefined : setTimeout(() => { setImmediate(() => {
      // A busy main loop may have delayed an already-queued reply until after the timer became due.
      if (this.#flight?.id === id) this.#fail('flight-timeout', mode);
    }); }, TRUNCATE_TIMEOUT_MS);
    timer?.unref();
    this.#flight = { id, mode, idle, version: this.#writeVersion, done, resolve, timer };
    try { this.#worker!.postMessage({ id, mode, close, ...(expectedFrames === undefined ? {} : { expectedFrames }) }); }
    catch (error) { this.#fail('send-error', mode, sqliteCodeOf(error)); }
    return done;
  }
  async settled(): Promise<void> { while (this.#flight) await this.#flight.done; }
  stop(clean: boolean): Promise<void> { this.#stopPromise ??= this.#stop(clean); return this.#stopPromise; }
  async #stop(clean: boolean): Promise<void> {
    this.#stopping = true; this.#pending = false; this.#clearIdle();
    clearTimeout(this.#startupTimer); this.#startupTimer = undefined; this.#resolveReady(false);
    let completed = false;
    const deadline = setTimeout(() => { setImmediate(() => {
      if (!completed) this.#fail('shutdown-timeout', this.#flight?.mode ?? 'none');
    }); }, SHUTDOWN_TIMEOUT_MS); deadline.unref();
    try {
      await this.settled();
      if (this.#available && !this.#failed && clean) {
        await this.#send('PASSIVE');
        const result = this.#lastResult;
        if (!this.#failed && result && !result.busy && result.logFrames === result.checkpointedFrames) await this.#send('TRUNCATE', false, false, result.logFrames);
      }
      if (this.#available && !this.#failed) await this.#send('close', true);
      // Native I/O can keep the process alive despite unref; the main process kill bounds its lifetime.
      // Stop waiting here; do not await that unbounded native work.
      // A healthy close acknowledgement already proves the database connection closed.
      this.#terminate();
    } finally { completed = true; clearTimeout(deadline); }
  }
  abort(): void {
    this.#stopping = true; this.#clearIdle(); clearTimeout(this.#startupTimer);
    if (this.#flight) { clearTimeout(this.#flight.timer); this.#flight.resolve(); this.#flight = undefined; }
    this.#terminate();
  }
}
