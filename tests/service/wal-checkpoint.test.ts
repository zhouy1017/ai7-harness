import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, rm, readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { setImmediate as tick } from 'node:timers/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { configureDatabase, WAL_CHECKPOINT_LIMITS } from '../../src/service/store-schema.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
const serviceAdapter = join(codeRoot, '.cache', 'service', `wal-service-adapter-${process.pid}.mjs`);
const helper = join(codeRoot, '.cache', 'service', `wal-crash-child-${process.pid}.mjs`);
let roots: ServiceTestRoots, store: EditorialStore | undefined, child: ChildProcess | undefined;
let pinned: DatabaseSync | undefined;
let book: { manuscriptId: string; branchId: string };
const database = () => join(roots.dataRoot, 'store', 'ai7.sqlite');
beforeAll(async () => {
  await mkdir(join(codeRoot, '.cache', 'service'), { recursive: true });
  const entry = await readFile(join(codeRoot, 'src/service/index.ts'), 'utf8');
  const boundary = entry.lastIndexOf('\nawait run().catch(');
  if (boundary < 0) throw new Error('SERVICE_STARTUP_BOUNDARY_NOT_FOUND');
  // Exercise the actual dispatcher and failure mapper without booting the service as a side effect of import.
  await build({ stdin: { resolveDir: join(codeRoot, 'src/service'), sourcefile: 'index.ts', loader: 'ts', contents: entry.slice(0, boundary) + `
export { prepareCleanShutdown };
export async function journalResponse(store, request, errorClass) {
  StoreErrorClass = errorClass;
  try { return { response: await dispatch(store, undefined, undefined, undefined, undefined, undefined, undefined, undefined, request, undefined, undefined, undefined, undefined), sqliteCode: 0 }; }
  catch (error) { return { response: failureResponse(request.id, error, errorClass), sqliteCode: typeof error === 'object' && error !== null && typeof error.errcode === 'number' ? error.errcode : 0 }; }
}
` }, outfile: serviceAdapter, bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
  await build({ entryPoints: [join(codeRoot, 'src/service/wal-checkpoint-worker.ts')], outfile: join(codeRoot, '.cache', 'service', 'wal-checkpoint-worker.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
  await build({ entryPoints: [join(codeRoot, 'tests/support/wal-crash-child.ts')], outfile: helper,
    bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
});
afterAll(async () => { await rm(helper, { force: true }); await rm(serviceAdapter, { force: true }); await rm(join(codeRoot, '.cache', 'service', 'wal-checkpoint-worker.mjs'), { force: true }); });
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-wal-recovery-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const path = join(roots.inputRoot, 'checkpoint.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '持久保存组稿' });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const result = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  book = { manuscriptId: result.manuscriptId, branchId: result.branchId };
});
afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
  child = undefined; pinned?.close(); pinned = undefined; store?.close(); store = undefined; await roots.dispose();
});
function edit() {
  const window = store!.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find(value => value.kind === 'paragraph')!;
  return { clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '甲' };
}

describe('durable edit acknowledgement with store-owned checkpoints', () => {
  it('recovers every acknowledged edit after killing the store process while the edits exist only in WAL', async () => {
    store!.markCleanShutdown(); store!.close(); store = undefined;
    pinned = new DatabaseSync(database(), { readOnly: true }); pinned.exec('BEGIN'); pinned.prepare('SELECT * FROM branch_working_state').all();
    child = spawn(process.execPath, [helper, roots.dataRoot, roots.codeRoot, book.manuscriptId, book.branchId], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let childError = ''; child.stderr?.on('data', bytes => { childError = (childError + String(bytes)).slice(-6000); });
    const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(([code]) => { throw new Error('WAL child exited before acknowledgement: ' + String(code) + '\n' + childError); })]);
    const ack = message as { sequence: number; workingDigest: string; blockId: string };
    expect(ack.sequence).toBe(3);
    const mainOnly = join(roots.inputRoot, 'main-only.sqlite');
    await copyFile(database(), mainOnly);
    const disk = new DatabaseSync(mainOnly, { readOnly: true });
    try { expect(disk.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').get(book.branchId)).toMatchObject({ journal_sequence: 0 }); }
    finally { disk.close(); }
    const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped;
    pinned.close(); pinned = undefined;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const recovered = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    expect(recovered.journalSequence).toBe(ack.sequence);
    expect(recovered.workingDigest).toBe(ack.workingDigest);
    expect(recovered.blocks.find(block => block.blockId === ack.blockId)?.text.startsWith('甲')).toBe(true);
  });

  it('acknowledges a journal request with no error response when it meets a real TRUNCATE writer lock', async () => {
    store!.markCleanShutdown(); store!.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.flushJournalEdit(edit());
    const reader = new DatabaseSync(database(), { readOnly: true });
    // Pin the current tail: PASSIVE can backfill everything, but TRUNCATE must still wait for this reader.
    reader.exec('PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0; BEGIN');
    reader.prepare('SELECT * FROM branch_working_state').all();
    const pending = edit();
    const adapter = await import(pathToFileURL(serviceAdapter).href);
    const probe = new DatabaseSync(database()); configureDatabase(probe); probe.exec('PRAGMA busy_timeout=0');
    let started!: () => void;
    const checkpointStarted = new Promise<void>(resolve => { started = resolve; });
    try {
      expect(await store.startCheckpointWorker(databasePath => {
        const worker = new Worker(`
          const { parentPort, workerData } = require('node:worker_threads');
          const { DatabaseSync } = require('node:sqlite');
          const { statSync } = require('node:fs');
          const db = new DatabaseSync(workerData.databasePath);
          // Test only: a pinned reader holds a real TRUNCATE lock beyond the writer's unchanged 5s busy wait.
          db.exec('PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=20000');
          const bytes = () => { try { return statSync(workerData.databasePath+'-wal').size; } catch { return 0; } };
          parentPort.postMessage({ready:true});
          parentPort.on('message', request => {
            if (request.mode === 'close') { db.close(); parentPort.postMessage({id:request.id,ok:true,busy:false,beforeBytes:0,afterBytes:bytes()}); parentPort.close(); return; }
            const beforeBytes = bytes(); if(request.mode==='TRUNCATE') parentPort.postMessage({checkpointStarted:true});
            const row = db.prepare('PRAGMA wal_checkpoint('+request.mode+')').get();
            if (request.close) db.close();
            parentPort.postMessage({id:request.id,ok:true,busy:Number(row.busy)!==0,beforeBytes,afterBytes:bytes(),logFrames:Number(row.log),checkpointedFrames:Number(row.checkpointed)});
            if(request.close)parentPort.close();
          });
        `, { eval: true, workerData: { databasePath } });
        worker.on('message', packet => { if (packet.checkpointStarted) started(); }); return worker;
      })).toBe(true);
      await checkpointStarted;
      // Confirm SQLite itself holds the writer lock; no fixed sleep or scheduler-timing assumption.
      const until = Date.now() + 10_000;
      while (true) {
        try { probe.exec('BEGIN IMMEDIATE; ROLLBACK'); }
        catch (error) { if (typeof error === 'object' && error !== null && 'errcode' in error && Number(error.errcode) % 256 === 5) break; throw error; }
        if (Date.now() >= until) throw new Error('TRUNCATE_WRITER_LOCK_NOT_ACQUIRED');
        await tick();
      }
      const began = Date.now();
      const reply = adapter.journalResponse(store, { id: randomUUID(), op: 'flushJournalEdit', input: pending }, StoreError);
      // An async wait lets the reader release here; the old synchronous write instead times out first.
      reader.exec('ROLLBACK');
      const result = await reply;
      if (!result.response.ok) console.error('DIAG_WAL_LOCK/' + JSON.stringify({ sqliteCode: result.sqliteCode, response: result.response.ok ? 'ACKNOWLEDGED' : result.response.error.code, elapsedMs: Date.now() - began }));
      expect(result.response.ok).toBe(true);
      expect(result.response.result.sequence).toBe(pending.expectedJournalSequence + 1);
      const duplicate = await adapter.journalResponse(store, { id: randomUUID(), op: 'flushJournalEdit', input: pending }, StoreError);
      expect(duplicate.response.ok).toBe(true);
      expect(duplicate.response.result.sequence).toBe(result.response.result.sequence);
    } finally {
      if (reader.isTransaction) reader.exec('ROLLBACK');
      reader.close(); probe.close(); await store.stopCheckpointWorker(false);
    }
  }, 30_000);

  it('truncates WAL after clean-shutdown preparation while retaining acknowledged journal state', () => {
    const ack = store!.flushJournalEdit(edit());
    expect(statSync(database() + '-wal').size).toBeGreaterThan(0);
    store!.markCleanShutdown();
    expect(statSync(database() + '-wal').size).toBe(0);
    expect(store!.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence).toBe(ack.sequence);
  });

  it('reclaims below-soft emergency WAL after worker failure and admits the store exact retry once', async () => {
    store!.checkpointAfterResponse(true);
    expect(await store!.startCheckpointWorker(() => { throw new Error('worker unavailable'); })).toBe(false);
    store!.flushJournalEdit(edit());
    expect(statSync(database() + '-wal').size).toBeLessThan(WAL_CHECKPOINT_LIMITS.softBytes);
    const pending = edit(), ceiling = WAL_CHECKPOINT_LIMITS.emergencyBytes;
    try {
      WAL_CHECKPOINT_LIMITS.emergencyBytes = 1;
      expect(() => store!.flushJournalEdit(pending)).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
      store!.checkpointAfterResponse(true);
      const ack = store!.flushJournalEdit(pending); store!.checkpointAfterResponse(true);
      expect(store!.flushJournalEdit(pending).sequence).toBe(ack.sequence);
      expect(ack.sequence).toBe(pending.expectedJournalSequence + 1);
    } finally { WAL_CHECKPOINT_LIMITS.emergencyBytes = ceiling; await store!.stopCheckpointWorker(false); }
  });

  it('acknowledges a non-journal annotation while idle PASSIVE backfills a large WAL', async () => {
    const writer = new DatabaseSync(database()); configureDatabase(writer);
    // Isolated zero padding creates WAL pressure without adding manuscript content or changing any product row.
    writer.exec('CREATE TABLE checkpoint_test_padding(bytes BLOB); INSERT INTO checkpoint_test_padding VALUES (zeroblob(33554432))');
    const modes: string[] = [];
    let started!: () => void;
    const checkpointStarted = new Promise<void>(resolve => { started = resolve; });
    try {
      expect(await store!.startCheckpointWorker(databasePath => {
        const worker = new Worker(`const {parentPort}=require('node:worker_threads');
          parentPort.on('message', request => { if(request.mode==='PASSIVE') parentPort.postMessage({checkpointStarted:true}); });
          import(${JSON.stringify(pathToFileURL(join(codeRoot, '.cache', 'service', 'wal-checkpoint-worker.mjs')).href)});`,
        { eval: true, workerData: { databasePath } });
        worker.on('message', packet => { if (packet.checkpointStarted) started(); });
        const send = worker.postMessage.bind(worker);
        vi.spyOn(worker, 'postMessage').mockImplementation(request => { modes.push(request.mode); send(request); });
        return worker;
      })).toBe(true);
      await checkpointStarted;
      expect(modes[0]).toBe('PASSIVE');
      const window = store!.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks.find(value => value.kind === 'paragraph' && value.text.length > 0)!;
      const card = store!.createEditorialMark({ ...book, windowStartBlockId: window.blocks[0]!.blockId,
        clientMarkId: randomUUID(), baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
        blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1,
        selectedText: Array.from(block.text)[0]!, kind: 'annotation', highlightColor: null, body: '核对用语。', proposedText: null, rationale: null }).card!;
      expect(card.kind).toBe('annotation');
      expect(store!.getEditorialMarkCard(book.manuscriptId, book.branchId, card.markId).body).toBe('核对用语。');
      expect(store!.flushJournalEdit(edit()).sequence).toBe(1);
    } finally { await store!.stopCheckpointWorker(false); writer.exec('DROP TABLE checkpoint_test_padding'); writer.close(); }
  });

  it('marks a normal quit clean before a checkpoint exceeds the shutdown bound', async () => {
    const adapter = await import(pathToFileURL(serviceAdapter).href);
    store!.flushJournalEdit(edit());
    let worker!: Worker;
    expect(await store!.startCheckpointWorker(databasePath => {
      worker = new Worker(join(codeRoot, '.cache', 'service', 'wal-checkpoint-worker.mjs'), { workerData: { databasePath } }); return worker;
    })).toBe(true);
    const events: string[] = [];
    const mark = store!.markCleanShutdown.bind(store!);
    vi.spyOn(store!, 'markCleanShutdown').mockImplementation(checkpoint => { events.push('clean'); mark(checkpoint); });
    const send = worker.postMessage.bind(worker);
    vi.spyOn(worker, 'postMessage').mockImplementation(request => {
      if (request.mode === 'PASSIVE') { events.push('checkpoint'); return; }
      send(request);
    });
    vi.useFakeTimers();
    try {
      const stopped = adapter.prepareCleanShutdown(store!, async () => { events.push('owners-stopped'); });
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toEqual(['owners-stopped', 'clean', 'checkpoint']);
      await vi.advanceTimersByTimeAsync(5_000); await stopped;
    } finally { vi.useRealTimers(); await worker.terminate(); }
    store!.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect((await store.getStartup()).state).not.toBe('manuscript-recovery');
    expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence).toBe(1);
  });
});
