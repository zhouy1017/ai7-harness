import { lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeCrashRecord, type CrashKind, type CrashRecord } from './diagnostics.js';

const RECORD_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-zA-Z-]+(?:-\d+)?\.json$/u;
export type CrashFacts = Pick<CrashRecord, 'appVersion' | 'dataVersion' | 'protocol' | 'platform' | 'arch' | 'electron' | 'uptimeSeconds'>;

/** Synchronous by design: fatal hooks must finish the bounded record before invoking termination. */
export class CrashRecords {
  readonly directory: string;
  constructor(userData: string, private readonly facts: () => CrashFacts, private readonly now = () => new Date()) {
    this.directory = join(userData, 'crashes');
  }
  ensureDirectory(): void {
    mkdirSync(this.directory, { recursive: true });
    const stat = lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('AI7_CRASH_DIRECTORY_INVALID');
  }
  private names(): string[] {
    this.ensureDirectory();
    return readdirSync(this.directory).filter((name) => RECORD_NAME.test(name)).sort();
  }
  write(kind: CrashKind, detail: { reason?: unknown; exitCode?: unknown; stack?: unknown } = {}): void {
    this.ensureDirectory();
    const record = sanitizeCrashRecord({ ...this.facts(), instant: this.now().toISOString(), kind,
      reason: typeof detail.reason === 'string' ? detail.reason : '<redacted>',
      exitCode: typeof detail.exitCode === 'number' ? detail.exitCode : null,
      stack: typeof detail.stack === 'string' ? detail.stack : '',
    });
    const stem = `${record.instant.replaceAll(':', '-')}-${kind}`;
    let suffix = 0;
    for (;;) {
      try {
        writeFileSync(join(this.directory, `${stem}${suffix === 0 ? '' : `-${suffix}`}.json`), JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || ++suffix > 100) throw error;
      }
    }
    const names = this.names();
    for (const name of names.slice(0, Math.max(0, names.length - 30))) unlinkSync(join(this.directory, name));
  }
  list(): CrashRecord[] {
    return this.names().slice(-30).flatMap((name) => {
      try {
        const path = join(this.directory, name);
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return [];
        return [sanitizeCrashRecord(JSON.parse(readFileSync(path, 'utf8')) as Partial<CrashRecord>)];
      } catch { return []; }
    });
  }
}

/** A failed record must never suppress the original shutdown. No raw exception is logged. */
export function crashHook(records: Pick<CrashRecords, 'write'>, kind: CrashKind, afterwards: () => void):
  (detail?: { reason?: unknown; exitCode?: unknown; stack?: unknown }) => void {
  return (detail = {}) => {
    try { records.write(kind, detail); }
    catch { process.stderr.write('AI7_CRASH_RECORD_WRITE_FAILED\n'); }
    finally { afterwards(); }
  };
}

interface HookSource {
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}

export function installCrashHooks(records: CrashRecords, electronApp: HookSource, mainProcess: HookSource,
  terminate: () => void): () => void {
  const child = (_event: unknown, detail: { reason: string; exitCode: number }): void =>
    crashHook(records, 'child-process-gone', terminate)(detail);
  const uncaught = (error: Error): void =>
    crashHook(records, 'uncaughtException', terminate)({ reason: error.name, stack: error.stack });
  const rejected = (reason: unknown): void =>
    crashHook(records, 'unhandledRejection', terminate)(reason instanceof Error ? { reason: reason.name, stack: reason.stack } : {});
  electronApp.on('child-process-gone', child);
  mainProcess.on('uncaughtException', uncaught);
  mainProcess.on('unhandledRejection', rejected);
  return () => {
    electronApp.removeListener('child-process-gone', child);
    mainProcess.removeListener('uncaughtException', uncaught);
    mainProcess.removeListener('unhandledRejection', rejected);
  };
}
