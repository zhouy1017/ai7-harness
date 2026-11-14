import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { installNodeNetworkDenial } from '../shared/network-denial.js';

// This connection never opens a data transaction: only connection configuration and checkpoint pragmas.
installNodeNetworkDenial();
if (!parentPort) throw new Error('CHECKPOINT_WORKER_PARENT_REQUIRED');
const path = String(workerData.databasePath);
if (!statSync(path).isFile()) throw new Error('CHECKPOINT_DATABASE_REQUIRED');
const db = new DatabaseSync(path);
if (db.prepare('PRAGMA journal_mode').get()?.['journal_mode'] !== 'wal') throw new Error('CHECKPOINT_WAL_REQUIRED');
db.exec('PRAGMA synchronous = FULL; PRAGMA wal_autocheckpoint = 0; PRAGMA busy_timeout = 0');
const bytes = (): number => { try { return statSync(path + '-wal').size; } catch { return 0; } };
parentPort.postMessage({ ready: true, wal: true, synchronous: Number(db.prepare('PRAGMA synchronous').get()!['synchronous']), autoCheckpoint: Number(db.prepare('PRAGMA wal_autocheckpoint').get()!['wal_autocheckpoint']) });
parentPort.on('message', (request: { id: number; mode: 'PASSIVE' | 'TRUNCATE' | 'close'; close?: boolean }) => {
  const beforeBytes = bytes();
  try {
    if (request.mode === 'close') {
      db.close(); parentPort!.postMessage({ id: request.id, ok: true, busy: false, beforeBytes, afterBytes: bytes() }); parentPort!.close(); return;
    }
    if (request.mode !== 'PASSIVE' && request.mode !== 'TRUNCATE') throw new Error('CHECKPOINT_MODE_INVALID');
    const result = db.prepare(`PRAGMA wal_checkpoint(${request.mode})`).get()!;
    const busy = Number(result['busy']) !== 0 || Number(result['checkpointed']) < Number(result['log']);
    if (request.close) db.close();
    parentPort!.postMessage({ id: request.id, ok: true, busy, beforeBytes, afterBytes: bytes() });
  } catch {
    if (request.close) { try { db.close(); } catch {} }
    parentPort!.postMessage({ id: request.id, ok: false, busy: true, beforeBytes, afterBytes: bytes() });
  }
  if (request.close) parentPort!.close();
});
