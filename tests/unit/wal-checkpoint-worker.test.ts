import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
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
  policy = new WalCheckpointPolicy(db, path, { softBytes: 32 * 1024, hardBytes: 256 * 1024 }); policy.shutdown();
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

  it('uses the fallback after a busy checkpoint, then resumes after the reader releases its snapshot', async () => {
    reader = new DatabaseSync(path, { readOnly: true }); reader.exec('BEGIN'); reader.prepare('SELECT * FROM edits').all();
    write('first'); maintenance.maintain(false); await maintenance.settled();
    expect(maintenance.available).toBe(false);
    reader.exec('ROLLBACK'); expect(maintenance.maintain(true)?.afterBytes).toBe(0);
    write('second'); expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 3 });
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

});
