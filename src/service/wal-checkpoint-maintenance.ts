import { Worker } from 'node:worker_threads';
import type { WalCheckpointPolicy } from './store-schema.js';
import { requireStore } from './store-records.js';

const WRITE_IDLE_MS = 1_000;
type Mode = 'PASSIVE' | 'TRUNCATE' | 'close';
type Result = { id: number; ok: boolean; busy: boolean; beforeBytes: number; afterBytes: number };
export type CheckpointWorkerFactory = (path: string) => Worker;

/** One store-owned checkpoint connection; all data transactions remain on the existing writer connections. */
export class WalCheckpointMaintenance {
  #worker: Worker | undefined;
  #available = false;
  #failed = false;
  #stopping = false;
  #pending = false;
  #truncatePending = false;
  #nextId = 0;
  #lastWrite = Date.now();
  #lastFrames = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #flight: { id: number; mode: Mode; done: Promise<void>; resolve: () => void } | undefined;
  #termination: Promise<number> | undefined;
  #stopPromise: Promise<void> | undefined;
  #resolveReady!: (ready: boolean) => void;
  readonly ready = new Promise<boolean>(resolve => { this.#resolveReady = resolve; });

  constructor(
    private readonly policy: WalCheckpointPolicy,
    path: string,
    createWorker: CheckpointWorkerFactory = path => new Worker(new URL('./wal-checkpoint-worker.mjs', import.meta.url), { workerData: { databasePath: path } }),
  ) {
    try {
      this.#lastFrames = policy.frames();
      this.#worker = createWorker(path);
      this.#worker.on('message', (packet: Result | { ready: true }) => {
        if ('ready' in packet) {
          if (this.#failed || this.#stopping) return;
          this.#available = true; this.#resolveReady(true); this.#scheduleIdle(); this.#pump(); return;
        }
        const flight = this.#flight;
        if (!flight || flight.id !== packet.id) return;
        this.#flight = undefined; flight.resolve();
        if (!packet.ok || packet.busy) { this.#fail(); return; }
        this.#pump(); this.#scheduleIdle();
      });
      this.#worker.on('error', () => this.#fail());
      this.#worker.on('exit', () => {
        if (this.#flight || !this.#stopping) this.#fail();
        this.#available = false; this.#resolveReady(false);
      });
    } catch { this.#fail(); }
  }

  get available(): boolean { return this.#available && !this.#failed && !this.#stopping; }

  #fail(): void {
    this.#failed = true; this.#available = false; this.#pending = false;
    this.#resolveReady(false); this.#clearIdle();
    this.#flight?.resolve(); this.#flight = undefined;
    this.#termination ??= this.#worker?.terminate();
    void this.#termination?.catch(() => undefined);
  }

  #clearIdle(): void { if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined; }

  #observeWrites(): void {
    const frames = this.policy.frames();
    if (frames !== this.#lastFrames && frames > 0) this.#lastWrite = Date.now();
    this.#lastFrames = frames;
  }

  journalWritten(): void {
    this.#lastFrames = this.policy.frames(); this.#lastWrite = Date.now(); this.#scheduleIdle();
  }

  admitJournalWrite(): void {
    requireStore(!this.#stopping, 'JOURNAL_CHECKPOINT_BUSY', '本机存储正在整理，请稍候重试保存。');
    this.policy.admitJournalWrite();
  }

  maintain(idle: boolean): ReturnType<WalCheckpointPolicy['maintain']> {
    if (this.#stopping) return null;
    if (!this.available) return this.policy.maintain(idle);
    this.#observeWrites();
    if (this.policy.needsMaintenance()) { this.#pending = true; this.#pump(); }
    this.#scheduleIdle(); return null;
  }

  #scheduleIdle(): void {
    this.#clearIdle();
    if (!this.available || this.policy.fileBytes() === 0) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined; this.#observeWrites();
      if (Date.now() - this.#lastWrite < WRITE_IDLE_MS) { this.#scheduleIdle(); return; }
      this.#pending = true; this.#truncatePending = true; this.#pump();
    }, Math.max(1, WRITE_IDLE_MS - (Date.now() - this.#lastWrite)));
    this.#timer.unref();
  }

  #pump(): void {
    if (!this.available || this.#flight || !this.#pending) return;
    this.#observeWrites();
    const truncate = this.#truncatePending && Date.now() - this.#lastWrite >= WRITE_IDLE_MS;
    this.#pending = false; this.#truncatePending = false;
    if (!truncate && !this.policy.needsMaintenance()) return;
    this.#send(truncate ? 'TRUNCATE' : 'PASSIVE');
  }

  #send(mode: Mode, close = false): Promise<void> {
    const id = ++this.#nextId;
    let resolve!: () => void;
    const done = new Promise<void>(yes => { resolve = yes; });
    this.#flight = { id, mode, done, resolve };
    try { this.#worker!.postMessage({ id, mode, close }); }
    catch { this.#fail(); }
    return done;
  }

  async settled(): Promise<void> { while (this.#flight) await this.#flight.done; }

  stop(clean: boolean): Promise<void> {
    this.#stopPromise ??= this.#stop(clean);
    return this.#stopPromise;
  }

  async #stop(clean: boolean): Promise<void> {
    this.#stopping = true; this.#pending = false; this.#clearIdle();
    await this.settled();
    if (!this.#available || this.#failed) {
      this.#termination ??= this.#worker?.terminate();
      await this.#termination;
      if (clean) this.policy.shutdown();
      return;
    }
    await this.#send(clean ? 'TRUNCATE' : 'close', true);
    this.#termination ??= this.#worker!.terminate();
    await this.#termination;
    if (clean && this.#failed) this.policy.shutdown();
  }

  abort(): void { this.#stopping = true; this.#clearIdle(); this.#termination ??= this.#worker?.terminate(); void this.#termination?.catch(() => undefined); }
}
