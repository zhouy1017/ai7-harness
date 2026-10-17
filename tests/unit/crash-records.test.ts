import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CrashRecords, crashHook, installCrashHooks } from '../../src/main/crash-records.js';
import { CRASH_KINDS } from '../../src/main/diagnostics.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function records() {
  const root = mkdtempSync(join(tmpdir(), 'ai7-crash-unit-'));
  roots.push(root);
  let time = 0;
  return new CrashRecords(root, () => ({ appVersion: '0.1.0', dataVersion: 83, protocol: 151,
    platform: 'win32', arch: 'x64', electron: '42.0.0', uptimeSeconds: 5 }), () => new Date(time++));
}
describe('local crash records', () => {
  it('installs and removes the actual app and process hooks with record-before-terminate ordering', () => {
    const store = records();
    const app = new EventEmitter();
    const main = new EventEmitter();
    let terminations = 0;
    const dispose = installCrashHooks(store, app, main, () => {
      terminations++;
      expect(store.list()).toHaveLength(terminations + 1);
    });
    app.emit('child-process-gone', {}, { reason: 'crashed', exitCode: 7 });
    expect(terminations).toBe(0);
    expect(store.list()[0]!.kind).toBe('child-process-gone');
    main.emit('uncaughtException', new TypeError('SYNTHETIC_PRIVATE_TEXT'));
    main.emit('unhandledRejection', new Error('SYNTHETIC_PRIVATE_TEXT'));
    expect(store.list().map((record) => record.kind)).toEqual(['child-process-gone', 'uncaughtException', 'unhandledRejection']);
    main.emit('uncaughtException', null);
    main.emit('unhandledRejection', 'SYNTHETIC_PRIVATE_TEXT');
    expect(terminations).toBe(4);
    expect(store.list().slice(-2).every((record) => record.reason === '<redacted>' && record.stack === '')).toBe(true);
    dispose();
    expect(app.listenerCount('child-process-gone')).toBe(0);
    expect(main.listenerCount('uncaughtException')).toBe(0);
    expect(main.listenerCount('unhandledRejection')).toBe(0);
  });
  it.each(CRASH_KINDS)('records %s before its existing follow-up', (kind) => {
    const store = records();
    let followed = false;
    const hook = crashHook(store, kind, () => {
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0]).toMatchObject({ kind, reason: 'crashed', exitCode: 1, dataVersion: 83, protocol: 151 });
      followed = true;
    });
    hook({ reason: 'crashed', exitCode: 1, stack: 'Error: SYNTHETIC_PRIVATE_TEXT\n    at private (C:\\Users\\Synthetic\\private.key.txt:3:4)' });
    expect(followed).toBe(true);
    const bytes = readFileSync(join(store.directory, readdirSync(store.directory)[0]!), 'utf8');
    expect(bytes).not.toContain('SYNTHETIC_PRIVATE_TEXT');
    expect(bytes).not.toContain('Synthetic');
    expect(bytes).toContain('<redacted-path>');
  });
  it('prunes oldest records and ignores foreign files and malformed records', () => {
    const store = records();
    for (let i = 0; i < 35; i++) store.write('uncaughtException');
    expect(store.list()).toHaveLength(30);
    expect(store.list()[0]!.instant).toBe(new Date(5).toISOString());
    writeFileSync(join(store.directory, 'foreign.key.txt'), 'synthetic-secret');
    writeFileSync(join(store.directory, '2026-01-01T00-00-00.000Z-uncaughtException.json'), 'invalid');
    expect(store.list().every((record) => record.stack === '')).toBe(true);
  });
  it('continues termination when persistence fails', () => {
    let followed = false;
    crashHook({ write: () => { throw new Error('synthetic'); } }, 'uncaughtException', () => { followed = true; })();
    expect(followed).toBe(true);
  });
});
