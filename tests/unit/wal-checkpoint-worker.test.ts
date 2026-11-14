import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDatabase, WalCheckpointPolicy } from '../../src/service/store-schema.js';
import { WalCheckpointMaintenance } from '../../src/service/wal-checkpoint-maintenance.js';

const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
const script = join(codeRoot, '.cache', `wal-checkpoint-worker-unit-${process.pid}.mjs`);
let root: string, path: string, db: DatabaseSync, reader: DatabaseSync | undefined;
let policy: WalCheckpointPolicy, maintenance: WalCheckpointMaintenance, worker: Worker;
let readyMessage: unknown;
beforeAll(async () => {
  await mkdir(join(codeRoot, '.cache'), { recursive: true });
  await build({ entryPoints: [join(codeRoot, 'src/service/wal-checkpoint-worker.ts')], outfile: script,
    bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
});
afterAll(async () => { await rm(script, { force: true }); });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-checkpoint-worker-')); path = join(root, 'store.sqlite');
  db = new DatabaseSync(path); configureDatabase(db);
  db.exec("CREATE TABLE edits(id TEXT PRIMARY KEY, value TEXT); INSERT INTO edits VALUES ('base','original')");
  policy = new WalCheckpointPolicy(db, path, { softBytes: 32 * 1024, emergencyBytes: 256 * 1024 }); policy.shutdown();
  maintenance = new WalCheckpointMaintenance(policy, path, databasePath => {
    worker = new Worker(script, { workerData: { databasePath } });
    worker.once('message', packet => { readyMessage = packet; }); return worker;
  });
  expect(await maintenance.ready).toBe(true);
});
afterEach(async () => { reader?.close(); reader = undefined; await maintenance.stop(false); db.close(); await rm(root, { recursive: true, force: true }); });
function write(id: string): void {
  maintenance.admitJournalWrite();
  db.prepare('INSERT OR IGNORE INTO edits VALUES (?, ?)').run(id, 'x'.repeat(80 * 1024)); maintenance.journalWritten();
}

describe('store-owned checkpoint worker', () => {
  it('reclaims below-soft emergency WAL after worker failure so the next edit succeeds', async () => {
    policy.limits.softBytes = 256 * 1024 * 1024;
    write('first');
    policy.limits.emergencyBytes = 64 * 1024;
    await worker.terminate();
    expect(() => write('pending')).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
    expect(maintenance.maintain(true)?.afterBytes).toBe(0);
    write('pending');
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 3 });
  });
  it('keeps fallback idle reclamation alive after the worker dies', async () => {
    policy.limits.softBytes = 256 * 1024 * 1024;
    write('first'); policy.limits.emergencyBytes = 64 * 1024;
    await worker.terminate();
    vi.useFakeTimers();
    try {
      expect(() => write('pending')).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
      maintenance.maintain(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(policy.fileBytes()).toBe(0);
      write('pending');
      expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 3 });
      await maintenance.stop(false);
    } finally { vi.useRealTimers(); }
  });

  it('coalesces requests with at most one checkpoint in flight', async () => {
    expect(readyMessage).toMatchObject({ ready: true, wal: true, synchronous: 2, autoCheckpoint: 0 });
    const send = worker.postMessage.bind(worker);
    let inFlight = 0, maximum = 0;
    worker.prependListener('message', packet => { if ('id' in packet) inFlight--; });
    const sent = vi.spyOn(worker, 'postMessage').mockImplementation((...args) => { inFlight++; maximum = Math.max(maximum, inFlight); send(...args); });
    write('first');
    for (let request = 0; request < 5; request++) maintenance.maintain(false);
    await maintenance.settled();
    expect(maximum).toBe(1);
    expect(sent.mock.calls.length).toBeLessThanOrEqual(2);
    expect(sent.mock.calls.length).toBeGreaterThan(0);
  });

  it('keeps serving writes and falls back to synchronous maintenance after worker death', async () => {
    await worker.terminate();
    expect(maintenance.available).toBe(false);
    write('after-worker-death');
    expect(maintenance.maintain(true)?.afterBytes).toBe(0);
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
  });

  it('falls back when worker startup fails', async () => {
    await maintenance.stop(false);
    maintenance = new WalCheckpointMaintenance(policy, path, () => { throw new Error('startup failed'); });
    expect(await maintenance.ready).toBe(false);
    write('after-startup-failure');
    expect(maintenance.maintain(true)?.afterBytes).toBe(0);
  });

  it('keeps the worker and one deferred request through busy/partial checkpoints, then drains after the reader releases', async () => {
    reader = new DatabaseSync(path, { readOnly: true }); reader.exec('BEGIN'); reader.prepare('SELECT * FROM edits').all();
    const busy = new Promise<void>(resolve => { worker.on('message', packet => { if (packet.busy || packet.logFrames > packet.checkpointedFrames) resolve(); }); });
    write('first'); maintenance.maintain(false); await maintenance.settled();
    expect(maintenance.available).toBe(true);
    await busy; // PASSIVE reports the reader-pinned remainder without retiring the thread.
    expect(maintenance.available).toBe(true);
    expect(maintenance.maintain(false)).toBeNull();
    const drained = new Promise<void>(resolve => { worker.on('message', packet => { if ('id' in packet && packet.afterBytes === 0) resolve(); }); });
    reader.exec('ROLLBACK'); write('second');
    await drained; // The live worker's own spaced retry, not shutdown, must finish this maintenance.
    expect(policy.fileBytes()).toBe(0);
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 3 });
  });

  it('records the mode and reason for a real checkpoint error and uses the fallback', async () => {
    const diagnostic = vi.spyOn(process.stderr, 'write');
    const send = worker.postMessage.bind(worker);
    vi.spyOn(worker, 'postMessage').mockImplementation(request => send({ ...request, mode: 'invalid' }));
    write('first'); maintenance.maintain(false); await maintenance.settled();
    expect(maintenance.available).toBe(false);
    expect(diagnostic.mock.calls.some(([line]) => String(line).includes('"reason":"checkpoint-error","mode":"PASSIVE"'))).toBe(true);
    expect(maintenance.maintain(true)?.afterBytes).toBe(0);
    diagnostic.mockRestore();
  });

  it('awaits the last checkpoint, truncates and closes before the main connection closes', async () => {
    write('acknowledged'); maintenance.maintain(false);
    await maintenance.stop(true); await maintenance.stop(false);
    expect(policy.fileBytes()).toBe(0);
    expect(maintenance.available).toBe(false);
    expect(db.prepare('SELECT id FROM edits WHERE id = ?').get('acknowledged')).toMatchObject({ id: 'acknowledged' });
  });
  it('keeps active-write maintenance PASSIVE and truncates only after write-idle', async () => {
    const sent = vi.spyOn(worker, 'postMessage');
    const truncated = new Promise<void>(resolve => {
      worker.on('message', packet => { if ('id' in packet && policy.fileBytes() === 0) resolve(); });
    });
    write('first'); maintenance.maintain(false); await maintenance.settled();
    write('second'); maintenance.maintain(false); await maintenance.settled();
    expect(sent.mock.calls.every(([request]) => request.mode === 'PASSIVE')).toBe(true);
    await truncated;
    expect(sent.mock.calls.some(([request]) => request.mode === 'TRUNCATE')).toBe(true);
    expect(policy.fileBytes()).toBe(0);
  });

  it('bounds a missing worker response and settles without a synthetic cleanup response', async () => {
    vi.useFakeTimers();
    const diagnostic = vi.spyOn(process.stderr, 'write');
    let heldId = 0;
    const send = worker.postMessage.bind(worker);
    const held = vi.spyOn(worker, 'postMessage').mockImplementation(request => {
      if (request.mode === 'PASSIVE') { heldId = request.id; return; }
      send(request);
    });
    try {
      write('first'); maintenance.maintain(false);
      expect(heldId).toBeGreaterThan(0);
      const settled = maintenance.settled();
      await vi.advanceTimersByTimeAsync(60_000); await settled;
      expect(maintenance.available).toBe(false);
      expect(diagnostic.mock.calls.some(([line]) => String(line).includes('"reason":"flight-timeout","mode":"PASSIVE"'))).toBe(true);
      await maintenance.stop(false);
    } finally { vi.useRealTimers(); held.mockRestore(); diagnostic.mockRestore(); await worker.terminate(); }
  });

  it('does not run synchronous fallback while a healthy thread is still starting', async () => {
    await maintenance.stop(false);
    db.prepare('INSERT INTO edits VALUES (?, ?)').run('recovered', 'x'.repeat(80 * 1024));
    const fallback = vi.spyOn(policy, 'maintain');
    maintenance = new WalCheckpointMaintenance(policy, path, () => {
      worker = new Worker(`const {parentPort}=require('node:worker_threads'); parentPort.on('message', packet=>{
        if(packet==='release-ready') parentPort.postMessage({ready:true});
        else { parentPort.postMessage({id:packet.id,ok:true,busy:false,beforeBytes:0,afterBytes:0,logFrames:0,checkpointedFrames:0}); if(packet.close) parentPort.close(); }
      });`, { eval: true }); return worker;
    });
    expect(maintenance.maintain(true)).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
    worker.postMessage('release-ready'); expect(await maintenance.ready).toBe(true);
    fallback.mockRestore();
  });

  it('finishes shutdown unreferenced after close acknowledgement even if thread termination never settles', async () => {
    let referenced = true;
    const ref = vi.spyOn(worker, 'ref').mockImplementation(() => { referenced = true; });
    const unref = vi.spyOn(worker, 'unref').mockImplementation(() => { referenced = false; });
    // Node terminate() calls ref() itself before requesting native thread termination.
    const termination = vi.spyOn(worker, 'terminate').mockImplementation(() => { worker.ref(); return new Promise<number>(() => undefined); });
    let stopped = false;
    vi.useFakeTimers();
    try {
      const stopping = maintenance.stop(false).then(() => { stopped = true; });
      // close() is real SQLite; wait for that acknowledgement before advancing the cleanup bound.
      await once(worker, 'message');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(stopped).toBe(true);
      expect(referenced).toBe(false);
      await stopping;
    } finally { vi.useRealTimers(); termination.mockRestore(); ref.mockRestore(); unref.mockRestore(); await worker.terminate(); }
  });

  it('skips response and idle ticks rather than throwing for an un-reset authority statement', async () => {
    write('first');
    const rows = db.prepare('SELECT * FROM edits').iterate(); rows.next();
    vi.useFakeTimers();
    try {
      expect(() => maintenance.maintain(false)).not.toThrow();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(maintenance.available).toBe(true);
    } finally { rows.return?.(); vi.useRealTimers(); }
  });

  it('retains acknowledged WAL if the worker dies while bounded shutdown starts', async () => {
    write('acknowledged');
    const terminated = worker.terminate();
    const stopped = maintenance.stop(true);
    await terminated; await stopped;
    const reopened = new DatabaseSync(path, { readOnly: true });
    try { expect(reopened.prepare('SELECT id FROM edits WHERE id = ?').get('acknowledged')).toMatchObject({ id: 'acknowledged' }); }
    finally { reopened.close(); }
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
  });

});
