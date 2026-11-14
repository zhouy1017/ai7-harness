import { mkdtemp, rm } from 'node:fs/promises';
import { statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDatabase, WalCheckpointPolicy, WAL_CHECKPOINT_LIMITS } from '../../src/service/store-schema.js';

const lowDisk = vi.hoisted(() => ({ enabled: false, unavailable: false }));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, statfsSync: (path: import('node:fs').PathLike) => {
    if (lowDisk.unavailable) throw Object.assign(new Error('space unavailable'), { errno: -5 });
    const result = actual.statfsSync(path); return lowDisk.enabled ? { ...result, bavail: 0 } : result;
  } };
});

let root: string, path: string, db: DatabaseSync, reader: DatabaseSync | undefined;
let policy: WalCheckpointPolicy;
beforeEach(async () => {
  lowDisk.enabled = false;
  lowDisk.unavailable = false;
  root = await mkdtemp(join(tmpdir(), 'ai7-checkpoint-'));
  path = join(root, 'store.sqlite');
  db = new DatabaseSync(path); configureDatabase(db);
  db.exec('CREATE TABLE edits(id TEXT PRIMARY KEY, value TEXT); INSERT INTO edits VALUES (\'initial\', \'original\')');
  policy = new WalCheckpointPolicy(db, path, { softBytes: 32 * 1024, emergencyBytes: 64 * 1024 });
  policy.shutdown();
});
afterEach(async () => { reader?.close(); reader = undefined; db.close(); await rm(root, { recursive: true, force: true }); });
const write = (id: string): void => {
  policy.admitJournalWrite();
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT OR IGNORE INTO edits VALUES (?, ?)').run(id, 'x'.repeat(80 * 1024));
  db.exec('COMMIT');
};

describe('store-owned WAL checkpoint policy', () => {
  it('reclaims idle physical WAL below the soft threshold after emergency admission refuses an edit', () => {
    policy = new WalCheckpointPolicy(db, path, { softBytes: 256 * 1024 * 1024, emergencyBytes: 64 * 1024 });
    write('first');
    expect(() => write('pending')).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
    expect(policy.maintain(true)?.afterBytes).toBe(0);
    expect(() => write('pending')).not.toThrow();
  });

  it('uses the configured emergency ceiling when free-space inspection is unavailable', () => {
    lowDisk.unavailable = true;
    expect(() => write('pending')).not.toThrow();
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
  });

  it('skips maintenance bookkeeping while an authority statement is un-reset', () => {
    write('first');
    const rows = db.prepare('SELECT * FROM edits').iterate(); rows.next();
    try { expect(() => policy.maintain(true)).not.toThrow(); }
    finally { rows.return?.(); }
    expect(policy.maintain(true)?.afterBytes).toBe(0);
  });
  it('keeps FULL durability and disables automatic checkpoint on every configured connection', () => {
    reader = new DatabaseSync(path); configureDatabase(reader);
    for (const connection of [db, reader]) {
      expect(connection.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
      expect(connection.prepare('PRAGMA synchronous').get()).toMatchObject({ synchronous: 2 });
      expect(connection.prepare('PRAGMA wal_autocheckpoint').get()).toMatchObject({ wal_autocheckpoint: 0 });
    }
    expect(WAL_CHECKPOINT_LIMITS).toEqual({ softBytes: 256 * 1024 * 1024, emergencyBytes: 16 * 1024 * 1024 * 1024 });
  });

  it('leaves acknowledged rows in WAL until maintenance, then truncates on clean shutdown', () => {
    write('acknowledged');
    expect(statSync(path + '-wal').size).toBeGreaterThan(64 * 1024);
    expect(db.prepare('SELECT id FROM edits WHERE id = ?').get('acknowledged')).toMatchObject({ id: 'acknowledged' });
    policy.shutdown();
    expect(statSync(path + '-wal').size).toBe(0);
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
  });

  it('backpressures the next command behind a pinned reader, then admits its exact retry once', () => {
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec('BEGIN'); reader.prepare('SELECT * FROM edits').all();
    write('first');
    policy.maintain(false);
    expect(() => write('pending')).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
    const diagnostic = JSON.parse(readFileSync(join(root, 'wal-checkpoint-pressure.json'), 'utf8'));
    expect(Object.keys(diagnostic).sort()).toEqual(['ceilingBytes', 'flag', 'freeBytes', 'timestamp', 'walBytes']);
    expect(diagnostic.flag).toBe('JOURNAL_CHECKPOINT_BUSY');
    expect(diagnostic.walBytes).toBeGreaterThanOrEqual(diagnostic.ceilingBytes);
    expect(diagnostic.ceilingBytes).toBeLessThanOrEqual(diagnostic.freeBytes / 4);
    expect([diagnostic.timestamp, diagnostic.walBytes, diagnostic.ceilingBytes, diagnostic.freeBytes].every(Number.isFinite)).toBe(true);
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
    reader.exec('ROLLBACK');
    expect(policy.maintain(true)?.afterBytes).toBe(0);
    write('pending'); policy.maintain(true); write('pending');
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 3 });
  });
  it('leaves durable WAL for the next open when a local statement prevents clean truncation', () => {
    write('acknowledged');
    const rows = db.prepare('SELECT * FROM edits').iterate(); rows.next();
    try { expect(() => policy.shutdown()).not.toThrow(); expect(policy.fileBytes()).toBeGreaterThan(0); }
    finally { rows.return?.(); }
    policy.shutdown(); expect(policy.fileBytes()).toBe(0);
  });

  it('leaves durable WAL when another connection pins its snapshot at shutdown', () => {
    reader = new DatabaseSync(path, { readOnly: true }); reader.exec('BEGIN'); reader.prepare('SELECT * FROM edits').all();
    write('acknowledged');
    expect(() => policy.shutdown()).not.toThrow(); expect(policy.fileBytes()).toBeGreaterThan(0);
    reader.exec('ROLLBACK'); policy.shutdown(); expect(policy.fileBytes()).toBe(0);
  });

  it('refuses before beginning a write when disk headroom is exhausted, and resumes after space returns', () => {
    lowDisk.enabled = true;
    expect(() => write('pending')).toThrowError(expect.objectContaining({ code: 'JOURNAL_DISK_FULL', message: '磁盘已满，请腾出空间后再保存。' }));
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 1 });
    lowDisk.enabled = false; write('pending');
    expect(db.prepare('SELECT count(*) AS total FROM edits').get()).toMatchObject({ total: 2 });
  });

});
