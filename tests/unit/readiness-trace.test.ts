import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Issue #518: the readiness trace a Journey prints when it waits past its budget, read from Playwright's `browser` debug
// log — each line with the time it was written, as a Journey sets that log up — and relayed by the controller only in its
// content-free shape. One case reads a real launch through the installed Playwright, so a channel it never feeds fails.
const trace = (await import(new URL('../../e2e/readiness-trace.mjs', import.meta.url).href)) as {
  STARTUP_LOCATIONS: ReadonlyArray<string>;
  SERVICE_STARTUP_STEPS: ReadonlyArray<string>;
  createLaunchTrace(scenario: string, startedAt?: number): Record<string, unknown>;
  readBrowserLog(trace: Record<string, unknown>, text: string): Record<string, unknown>;
  formatReadinessTrace(journey: string, trace: Record<string, unknown>, now?: number): string;
  readReadinessTrace(stderr: string, journey: string): string | null;
  waitingForService(trace: Record<string, unknown> | null): boolean;
  classifyRendererTargetMiss(
    atBudget: Record<string, unknown> | null,
    afterWatch?: Record<string, unknown> | null,
  ): { outcome: string; step: string | null };
  productRuntimeRoot(executable: string, platform?: string): string;
  psCpuSeconds(text: string): number | null;
  parsePsProcessListing(text: string): Array<ProcessRow>;
  parseWindowsProcessListing(text: string): Array<ProcessRow>;
  summarizeProductProcesses(rows: ReadonlyArray<ProcessRow>, pid: number, runtimeRoot: string, platform?: string): ProcessSample;
  sampleProductProcesses(pid: number, executable: string): Promise<ProcessSample | null>;
  classifyBrowserLaunchMiss(trace: Record<string, unknown> | null, sample: ProcessSample | null): Record<string, unknown>;
  cpuShares(before: ReadonlyArray<ProcessRow>, after: ReadonlyArray<ProcessRow>, rootPid: number, windowMs: number, cores: number, listingPid?: number | null): { product: number; host: number };
  measureCpuShares(rootPid: number, windowMs?: number): Promise<{ product: number; host: number } | null>;
  listHostProcessesWithListing(platform?: string): Promise<{ rows: Array<ProcessRow>; listingPid: number | null } | null>;
  STARTUP_FILES: ReadonlyArray<string>;
  singletonLockName(platform?: string): string;
  observeLaunchStart(userDataDir: string, executable: string, platform?: string): Promise<{ lock: string; prior: number | null }>;
  parseProcessStatus(text: string | null): { state: string | null; rssMb: number | null };
  parseThreadCount(text: string | null): number | null;
  startupFilesOpen(text: string | null, runtimeRoot: string, userDataDir: string): Array<string> | null;
  lastLogEntry(text: string | null, pid: number): { entries: number; sender: string | null; subsystem: string | null } | null;
  probeStalledProduct(pid: number, executable: string, userDataDir: string, lookbackSeconds: number, platform?: string): Promise<Record<string, unknown> | null>;
  formatLaunchStart(start: { lock: string; prior: number | null }): string;
  formatStalledProduct(stall: Record<string, unknown>): string;
};
interface ProcessRow { pid: number; ppid: number; cpuSeconds: number | null; path: string | null }
interface ProcessSample { alive: boolean; cpuSeconds: number | null; helpers: number; prior: number }
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  collectReadinessTrace(result: { stderr: string }, journey: string): string | null;
};

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Playwright's `browser` log with each message at `offset` ms past t = 1000 ms, where the launch begins. */
function logOf(lines: ReadonlyArray<readonly [number, string]>): string {
  return lines.map(([offset, message]) => `${new Date(1_000 + offset).toISOString()} pw:browser ${message}`).join('\n');
}

function launched(lines: ReadonlyArray<readonly [number, string]>): Record<string, unknown> {
  return trace.readBrowserLog(trace.createLaunchTrace('empty-book-first-import', 1_000), logOf(lines));
}

describe('the readiness trace (Issue #518)', () => {
  it('reads a launch that became ready: when it launched, the last startup step, AI7_READY and the exit', () => {
    const launch = launched([
      [2, '<launching> C:\\product\\ai7.exe --remote-debugging-pipe'],
      [9, '<launched> pid=2084'],
      [22, '[pid=2084][out] '],
      [30, '[pid=2084][err] AI7_STARTUP/runtime'],
      [800, '[pid=2084][err] AI7_STARTUP/service-ready'],
      [1_400, '[pid=2084][err] AI7_STARTUP/renderer-first-paint'],
      [1_590, '[pid=2084][err] AI7_STARTUP/readiness-signal'],
      [1_620, '[pid=2084][out] AI7_READY'],
      [2_300, '[pid=2084] <gracefully close start>'],
      [2_310, '[pid=2084] <process did exit: exitCode=0, signal=null>'],
    ]);
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 2_400)).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=9;last=readiness-signal@1590;service=none@none;ready=1620;failed=none;exit=0@2310;target=no;other=0;age=2400',
    );
  });

  it('says where a launch that never became ready stopped, and only counts the product\'s other words', () => {
    const lines: Array<readonly [number, string]> = [
      [8, '<launched> pid=7'],
      [900, '[pid=7][err] AI7_STARTUP/service-ready'],
      [1_500, '[pid=7][err] AI7_STARTUP/renderer-first-paint'],
      [1_600, '[pid=7][err] [1234:ERROR:gpu_init.cc(1)] something the product said about C:\\Users\\someone'],
      [1_700, '[pid=7][out] 稿件里的一句话'],
      [1_800, '[pid=7][err] AI7_STARTUP/not-a-step'],
    ];
    const launch = launched(lines);
    launch.target = true;
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_050);
    expect(line).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=8;last=renderer-first-paint@1500;service=none@none;ready=none;failed=none;exit=none@none;target=yes;other=3;age=60050',
    );
    expect(line).not.toContain('C:');
    expect(line).not.toContain('稿件');
    // A startup failure main names is kept by its location.
    const failed = launched([...lines,
      [61_000, '[pid=7][err] AI7_STARTUP_FAILED/renderer-first-paint'],
      [61_100, '[pid=7] <process did exit: exitCode=1, signal=null>'],
    ]);
    expect(trace.formatReadinessTrace('J-01', failed, 1_000 + 61_200)).toContain(';failed=renderer-first-paint;exit=1@61100;');
  });

  it('says how far the service\'s own startup came while main waited at service-ready, the furthest step it relayed (#675)', () => {
    const launch = launched([
      [7, '<launched> pid=5'],
      [1_226, '[pid=5][err] AI7_STARTUP/service-ready'],
      [1_300, '[pid=5][err] AI7_SERVICE_STARTUP/spawned'],
      [1_900, '[pid=5][err] AI7_SERVICE_STARTUP/store'],
      // Relayed out of order: the furthest step stands.
      [1_950, '[pid=5][err] AI7_SERVICE_STARTUP/process'],
      // Another process's, a step the service never names, and words around one: not the service's step.
      [2_000, '[pid=6][err] AI7_SERVICE_STARTUP/serving'],
      [2_100, '[pid=5][err] AI7_SERVICE_STARTUP/C:\\data'],
      [2_200, '[pid=5][err] AI7_SERVICE_STARTUP/serving now'],
    ]);
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_114);
    expect(line).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=7;last=service-ready@1226;service=store@1900;ready=none;failed=none;exit=none@none;target=no;other=2;age=60114',
    );
    expect(trace.readReadinessTrace(line, 'J-01')).toBe(line.slice('READINESS/J-01/'.length));
    // A service that stopped before it was ready says so, and main's failure follows.
    const stopped = launched([
      [7, '<launched> pid=5'],
      [1_226, '[pid=5][err] AI7_STARTUP/service-ready'],
      [1_400, '[pid=5][err] AI7_SERVICE_STARTUP/owners'],
      [1_500, '[pid=5][err] AI7_SERVICE_STARTUP/stopped'],
      [1_600, '[pid=5][err] AI7_STARTUP_FAILED/service-ready'],
    ]);
    expect(trace.formatReadinessTrace('J-01', stopped, 1_000 + 2_000)).toContain(';service=stopped@1500;ready=none;failed=service-ready;');
    // Every step is a word the relay accepts, and no other.
    const fields = line.slice('READINESS/J-01/'.length);
    for (const step of trace.SERVICE_STARTUP_STEPS) {
      expect(trace.readReadinessTrace(line.replace('service=store', `service=${step}`), 'J-01')).not.toBeNull();
    }
    expect(trace.readReadinessTrace(line.replace('service=store', 'service=renderer-first-paint'), 'J-01')).toBeNull();
    expect(trace.readReadinessTrace(`READINESS/J-01/${fields.replace(';service=store@1900', '')}`, 'J-01')).toBeNull();
  });

  it('names why a renderer target missed its budget, from the trace at the budget and after the watch (#675)', () => {
    const at = (lines: ReadonlyArray<readonly [number, string]>) => launched([[7, '<launched> pid=5'], ...lines]);
    const waiting = at([[126, '[pid=5][err] AI7_STARTUP/service-ready'], [281, '[pid=5][err] AI7_SERVICE_STARTUP/store']]);
    expect(trace.waitingForService(waiting)).toBe(true);
    // Main still waiting for its service at the budget, then what the watch to the product's own deadline saw.
    const after = (lines: ReadonlyArray<readonly [number, string]>) => at([
      [126, '[pid=5][err] AI7_STARTUP/service-ready'], [281, '[pid=5][err] AI7_SERVICE_STARTUP/store'], ...lines]);
    expect(trace.classifyRendererTargetMiss(waiting, after([[120_100, '[pid=5][err] AI7_STARTUP_FAILED/service-ready']])))
      .toEqual({ outcome: 'service-start-stalled', step: 'store' });
    expect(trace.classifyRendererTargetMiss(waiting, after([
      [73_943, '[pid=5][err] AI7_SERVICE_STARTUP/serving'], [73_961, '[pid=5][err] AI7_STARTUP/renderer-first-paint']])))
      .toEqual({ outcome: 'service-start-slow', step: 'store' });
    expect(trace.classifyRendererTargetMiss(waiting, after([[90_000, '[pid=5] <process did exit: exitCode=1, signal=null>']])))
      .toEqual({ outcome: 'service-start-exited', step: 'store' });
    expect(trace.classifyRendererTargetMiss(waiting, after([]))).toEqual({ outcome: 'service-start-unbounded', step: 'store' });
    // The step is the one at the budget, whatever the service reached later; a service that named none says so.
    const silent = at([[126, '[pid=5][err] AI7_STARTUP/service-ready']]);
    expect(trace.classifyRendererTargetMiss(silent, silent)).toEqual({ outcome: 'service-start-unbounded', step: 'none' });
    // A failure other than the service's, after the watch, is a startup failure.
    expect(trace.classifyRendererTargetMiss(waiting, after([
      [70_000, '[pid=5][err] AI7_STARTUP/renderer-first-paint'], [80_000, '[pid=5][err] AI7_STARTUP_FAILED/renderer-first-paint']])))
      .toEqual({ outcome: 'startup-failed', step: null });
    // Main past its service at the budget: no watch, and the trace then says why.
    const failed = at([[900, '[pid=5][err] AI7_STARTUP/renderer-first-paint'], [1_000, '[pid=5][err] AI7_STARTUP_FAILED/renderer-first-paint']]);
    expect(trace.waitingForService(failed)).toBe(false);
    expect(trace.classifyRendererTargetMiss(failed)).toEqual({ outcome: 'startup-failed', step: null });
    expect(trace.classifyRendererTargetMiss(at([[900, '[pid=5] <process did exit: exitCode=0, signal=null>']])))
      .toEqual({ outcome: 'product-exited', step: null });
    expect(trace.classifyRendererTargetMiss(at([[900, '[pid=5][err] AI7_STARTUP/renderer-first-paint']])))
      .toEqual({ outcome: 'window', step: null });
    expect(trace.classifyRendererTargetMiss(at([[900, '[pid=5][err] AI7_STARTUP/readiness-signal']])))
      .toEqual({ outcome: 'after-readiness', step: null });
    expect(trace.classifyRendererTargetMiss(at([[900, '[pid=5][err] AI7_STARTUP/electron-ready']])))
      .toEqual({ outcome: 'timeout', step: null });
    expect(trace.classifyRendererTargetMiss(null)).toEqual({ outcome: 'timeout', step: null });
  });

  it('names why a launch\'s browser was never acquired, from the trace and the sample taken before its timeout (#675)', () => {
    const at = (lines: ReadonlyArray<readonly [number, string]>) => launched([[2, '<launched> pid=5'], ...lines]);
    const idle = { alive: true, cpuSeconds: 0.4, helpers: 0, prior: 0 };
    const none = { step: null, sampled: null, cpu: null, helpers: 0, prior: 0 };
    // Hosted macOS, run 37870925275: launched, and not one word from main in sixty seconds.
    expect(trace.classifyBrowserLaunchMiss(at([]), idle))
      .toEqual({ outcome: 'before-main', step: null, sampled: 'alive', cpu: 'idle', helpers: 0, prior: 0 });
    expect(trace.classifyBrowserLaunchMiss(at([]), { alive: true, cpuSeconds: 4, helpers: 3, prior: 12 }))
      .toMatchObject({ outcome: 'before-main', cpu: 'some', helpers: 3, prior: 9 });
    expect(trace.classifyBrowserLaunchMiss(at([]), { alive: true, cpuSeconds: 42, helpers: 11, prior: 2 }))
      .toMatchObject({ cpu: 'busy', helpers: 9, prior: 2 });
    expect(trace.classifyBrowserLaunchMiss(at([]), { alive: true, cpuSeconds: null, helpers: 0, prior: 0 })).toMatchObject({ cpu: 'unknown' });
    expect(trace.classifyBrowserLaunchMiss(at([]), { alive: false, cpuSeconds: null, helpers: 0, prior: 1 }))
      .toEqual({ ...none, outcome: 'before-main', sampled: 'gone' });
    expect(trace.classifyBrowserLaunchMiss(at([]), null)).toEqual({ ...none, outcome: 'before-main', sampled: 'unsampled' });
    // Main's script ran: the last step it said.
    expect(trace.classifyBrowserLaunchMiss(at([[40, '[pid=5][err] AI7_STARTUP/network-denial'], [60, '[pid=5][err] AI7_STARTUP/application-import']]), idle))
      .toMatchObject({ outcome: 'at-step', step: 'application-import', sampled: 'alive', cpu: 'idle' });
    expect(trace.classifyBrowserLaunchMiss(at([[400, '[pid=5][err] AI7_STARTUP/electron-ready']]), null))
      .toEqual({ ...none, outcome: 'at-step', step: 'electron-ready', sampled: 'unsampled' });
    // A failure, an exit, or no process at all need no sample.
    expect(trace.classifyBrowserLaunchMiss(at([[400, '[pid=5][err] AI7_STARTUP_FAILED/arguments']]), idle)).toEqual({ ...none, outcome: 'startup-failed' });
    expect(trace.classifyBrowserLaunchMiss(at([[400, '[pid=5] <process did exit: exitCode=1, signal=null>']]), idle))
      .toEqual({ ...none, outcome: 'product-exited' });
    expect(trace.classifyBrowserLaunchMiss(launched([]), idle)).toEqual({ ...none, outcome: 'not-spawned' });
    expect(trace.classifyBrowserLaunchMiss(null, null)).toEqual({ ...none, outcome: 'not-spawned' });
  });

  it('has J-01 turn a launch it never acquired into a content-free label that names every step main says (#675)', () => {
    const source = readFileSync(join(ROOT, 'e2e', 'run-j01.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    // J-01 runs as it is imported, so its label builder is read from its source and run here on its own.
    const start = source.indexOf('const LAUNCH_STEP_WORDS = ');
    const end = source.indexOf('\n}\n', source.indexOf('function browserLaunchMissLabel(')) + 3;
    expect(start).toBeGreaterThan(-1);
    const label = new Function(`${source.slice(start, end)}\nreturn { browserLaunchMissLabel, LAUNCH_STEP_WORDS };`)() as {
      browserLaunchMissLabel(miss: unknown): string;
      LAUNCH_STEP_WORDS: ReadonlyArray<string>;
    };
    expect(label.LAUNCH_STEP_WORDS).toEqual(trace.STARTUP_LOCATIONS);
    const at = (lines: ReadonlyArray<readonly [number, string]>) => launched([[2, '<launched> pid=5'], ...lines]);
    const named = (lines: ReadonlyArray<readonly [number, string]>, sample: ProcessSample | null) =>
      label.browserLaunchMissLabel(trace.classifyBrowserLaunchMiss(at(lines), sample));
    expect(named([], { alive: true, cpuSeconds: 0.4, helpers: 0, prior: 0 })).toBe('browser-launch-before-main-cpu-idle-helpers-0-prior-0');
    expect(named([], { alive: true, cpuSeconds: 30, helpers: 14, prior: 1 })).toBe('browser-launch-before-main-cpu-busy-helpers-9-prior-1');
    expect(named([], { alive: false, cpuSeconds: null, helpers: 0, prior: 0 })).toBe('browser-launch-before-main-gone');
    expect(named([[60, '[pid=5][err] AI7_STARTUP/electron-ready']], null)).toBe('browser-launch-at-electron-ready-unsampled');
    expect(named([[60, '[pid=5][err] AI7_STARTUP_FAILED/arguments']], null)).toBe('browser-launch-startup-failed');
    expect(named([[60, '[pid=5] <process did exit: exitCode=1, signal=null>']], null)).toBe('browser-launch-product-exited');
    expect(label.browserLaunchMissLabel(trace.classifyBrowserLaunchMiss(null, null))).toBe('browser-launch-not-spawned');
    for (const location of trace.STARTUP_LOCATIONS) {
      const text = named([[40, `[pid=5][err] AI7_STARTUP/${location}`]], { alive: true, cpuSeconds: 99, helpers: 99, prior: 99 });
      expect(text).toBe(`browser-launch-at-${location}-cpu-busy-helpers-9-prior-9`);
      expect(text).toMatch(/^[a-z0-9][a-z0-9-]{0,95}$/u);
    }
  });

  it('samples the product\'s processes as counts and seconds only: its own, those it started, and an earlier launch\'s (#675)', () => {
    expect(trace.psCpuSeconds('0:00.52')).toBeCloseTo(0.52);
    expect(trace.psCpuSeconds('12:03.50')).toBeCloseTo(723.5);
    expect(trace.psCpuSeconds('1:02:03')).toBe(3_723);
    expect(trace.psCpuSeconds('2-01:00:00')).toBe(176_400);
    expect(trace.psCpuSeconds('n/a')).toBeNull();
    const app = '/runner/.runtime/electron/Electron.app';
    expect(trace.productRuntimeRoot(`${app}/Contents/MacOS/Electron`, 'darwin')).toBe(app);
    expect(trace.productRuntimeRoot('C:\\r\\.runtime\\electron\\electron.exe', 'win32')).toBe('C:\\r\\.runtime\\electron');
    const mac = trace.parsePsProcessListing([
      '    1     0   0:10.00 /sbin/launchd',
      `  500     1   0:00.40 ${app}/Contents/MacOS/Electron --remote-debugging-pipe /x/dist/main/index.cjs --data-root /tmp/a`,
      `  501   500   0:00.10 ${app}/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU) --type=gpu-process`,
      `  502   501   0:00.01 /usr/bin/something-it-started`,
      `  400     1   0:03.00 ${app}/Contents/MacOS/Electron /x/dist/service/index.mjs`,
      `  401     1   0:00.00 /runner/.runtime/electron/Electron.app.bak/Contents/MacOS/Electron`,
      'not a row',
    ].join('\n'));
    expect(mac).toHaveLength(6);
    expect(trace.summarizeProductProcesses(mac, 500, app, 'darwin')).toEqual({ alive: true, cpuSeconds: 0.4, helpers: 2, prior: 1 });
    expect(trace.summarizeProductProcesses(mac, 999, app, 'darwin')).toEqual({ alive: false, cpuSeconds: null, helpers: 0, prior: 3 });
    const windows = trace.parseWindowsProcessListing([
      '4\t0\t0\t',
      '7000\t6000\t5000000\tC:\\R\\.runtime\\electron\\electron.exe',
      '7001\t7000\t100000\tc:/r/.runtime/electron/electron.exe',
      '6500\t1\t20000000\tC:\\r\\.runtime\\electron\\electron.exe',
      '',
    ].join('\r\n'));
    expect(windows).toEqual([
      { pid: 4, ppid: 0, cpuSeconds: 0, path: null },
      { pid: 7000, ppid: 6000, cpuSeconds: 0.5, path: 'C:\\R\\.runtime\\electron\\electron.exe' },
      { pid: 7001, ppid: 7000, cpuSeconds: 0.01, path: 'c:/r/.runtime/electron/electron.exe' },
      { pid: 6500, ppid: 1, cpuSeconds: 2, path: 'C:\\r\\.runtime\\electron\\electron.exe' },
    ]);
    expect(trace.summarizeProductProcesses(windows, 7000, 'C:\\r\\.runtime\\electron', 'win32')).toEqual({ alive: true, cpuSeconds: 0.5, helpers: 1, prior: 1 });
  });

  it('says how busy the product and the host were over a window, from two listings (#621)', () => {
    const before = [
      { pid: 0, ppid: 0, cpuSeconds: 1_000, path: null },
      { pid: 10, ppid: 1, cpuSeconds: 5, path: 'node' },
      { pid: 20, ppid: 10, cpuSeconds: 2, path: 'electron' },
      { pid: 21, ppid: 20, cpuSeconds: 1, path: 'electron' },
      { pid: 30, ppid: 1, cpuSeconds: 50, path: 'scanner' },
      { pid: 40, ppid: 1, cpuSeconds: 9, path: 'ended' },
    ];
    const after = [
      { pid: 0, ppid: 0, cpuSeconds: 1_100, path: null },
      { pid: 10, ppid: 1, cpuSeconds: 5.5, path: 'node' },
      { pid: 20, ppid: 10, cpuSeconds: 6, path: 'electron' },
      { pid: 21, ppid: 20, cpuSeconds: 1, path: 'electron' },
      { pid: 22, ppid: 21, cpuSeconds: 1, path: 'electron' },
      { pid: 30, ppid: 1, cpuSeconds: 58.5, path: 'scanner' },
      { pid: 31, ppid: 1, cpuSeconds: null, path: 'unreadable' },
    ];
    // Over 5 s: the product (20, 21 and the new 22, not the Journey itself) used 5 s, one core; the host 14 s of 4 cores.
    const shares = trace.cpuShares(before, after, 10, 5_000, 4);
    expect(shares.product).toBeCloseTo(1);
    expect(shares.host).toBeCloseTo(0.7);
    expect(trace.cpuShares(after, after, 10, 5_000, 4)).toEqual({ product: 0, host: 0 });
    // The sampler's own listing process (review P2-1): a transient child of the Journey, in the second listing only, with
    // the few tenths of a second a hosted Windows listing costs, and a child of its own. Named, it counts for neither share;
    // unnamed, it would lift an idle product over the 0.1 `idle` bound on its own.
    const listing = [
      ...after,
      { pid: 99, ppid: 10, cpuSeconds: 0.6, path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
      { pid: 100, ppid: 99, cpuSeconds: 0.1, path: 'conhost' },
    ];
    const named = trace.cpuShares(before, listing, 10, 5_000, 4, 99);
    expect(named.product).toBeCloseTo(1);
    expect(named.host).toBeCloseTo(0.7);
    const unnamed = trace.cpuShares(before, listing, 10, 5_000, 4);
    expect(unnamed.product).toBeCloseTo(1.14);
    const idle = before.map((row) => ({ ...row }));
    expect(trace.cpuShares(idle, [...idle, { pid: 99, ppid: 10, cpuSeconds: 0.6, path: 'powershell.exe' }], 10, 5_000, 4, 99).product).toBe(0);
    expect(trace.cpuShares(idle, [...idle, { pid: 99, ppid: 10, cpuSeconds: 0.6, path: 'powershell.exe' }], 10, 5_000, 4).product).toBeCloseTo(0.12);
  });

  it('names the listing process, which is in its own listing as a child of this one (review P2-1)', async () => {
    const listing = await trace.listHostProcessesWithListing();
    expect(listing).not.toBeNull();
    expect(typeof listing!.listingPid).toBe('number');
    const own = listing!.rows.find((row) => row.pid === listing!.listingPid);
    expect(own).toBeDefined();
    expect(own!.ppid).toBe(process.pid);
  }, 30_000);

  it('measures a real busy process below this one (#621)', async () => {
    const child = spawn(process.execPath, ['-e', 'const end = Date.now() + 20_000; while (Date.now() < end);'], { stdio: 'ignore' });
    try {
      await new Promise((settle) => child.once('spawn', settle));
      const shares = await trace.measureCpuShares(process.pid, 1_500);
      expect(shares).not.toBeNull();
      expect(shares!.product).toBeGreaterThan(0.3);
      expect(shares!.host).toBeGreaterThan(0);
    } finally {
      child.kill();
    }
  }, 30_000);

  it('has J-02 name how busy the product and the host were when an import step ran out of its bound (#621)', async () => {
    const source = readFileSync(join(ROOT, 'e2e', 'run-j02.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    const start = source.indexOf('function cpuShareWord(');
    const end = source.indexOf('\n}\n', source.indexOf('async function importCpuWords(')) + 3;
    const words = (shares: { product: number; host: number } | null) =>
      (new Function('measureCpuShares', `${source.slice(start, end)}\nreturn importCpuWords();`) as (measure: () => Promise<unknown>) => Promise<string>)(
        async () => shares,
      );
    expect(await words({ product: 0.05, host: 0.9 })).toBe('product-idle-host-busy');
    expect(await words({ product: 0.5, host: 0.3 })).toBe('product-some-host-some');
    expect(await words({ product: 1.2, host: 0.1 })).toBe('product-busy-host-idle');
    expect(await words(null)).toBe('cpu-unsampled');
    for (const label of ['stage-target-progressing-at-${Number(tenths)}-tenths-${cpu}', 'stage-target-stalled-at-${Number(tenths)}-tenths-${cpu}',
      'imported-${outcome}-at-writing-${cpu}', 'imported-${outcome}-at-preparing-${cpu}', 'completion-acknowledged-before-open-stalled-${cpu}',
      'completion-acknowledged-before-open-progressing-${cpu}']) {
      expect(source).toContain(label);
    }
    // The longest label it can print still fits a check label.
    expect('imported-progressing-at-revalidating-10-tenths-product-busy-host-busy').toMatch(/^[a-z0-9][a-z0-9-]{0,95}$/u);
  });

  it('samples a real process on this host', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 60_000)'], { stdio: 'ignore' });
    try {
      await new Promise((settle) => child.once('spawn', settle));
      const sample = await trace.sampleProductProcesses(child.pid!, process.execPath);
      expect(sample).not.toBeNull();
      expect(sample).toMatchObject({ alive: true, helpers: 0 });
      expect(typeof sample!.cpuSeconds).toBe('number');
      expect(sample!.prior).toBeGreaterThanOrEqual(1);
    } finally {
      child.kill();
    }
  }, 30_000);

  it('has main say the steps before its application runs, and J-01 name a launch it never acquired (#675)', () => {
    const main = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8');
    const denial = main.indexOf("journeyStartup('network-denial')");
    const install = main.indexOf('installNodeNetworkDenial();');
    const importStep = main.indexOf("journeyStartup('application-import')");
    const load = main.indexOf("import('./application.js')");
    expect([denial, install, importStep, load].every((index) => index > -1)).toBe(true);
    expect(denial < install && install < importStep && importStep < load).toBe(true);
    expect(main).toContain("if (process.env.AI7_E2E_JOURNEY !== undefined) process.stderr.write(`AI7_STARTUP/${location}\\n`);");
    const j01 = readFileSync(join(ROOT, 'e2e', 'run-j01.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    expect(j01).toContain("throw journeyCheckFailure('J-01', browserLaunchMissLabel(classifyBrowserLaunchMiss(launchTraceNow(), sample)), { cause: error });");
    expect(j01).toMatch(/setTimeout\(\(\) => \{\n\s+const pid = [^\n]+\n\s+launchSample = [^\n]+sampleProductProcesses\(pid, executable\)/u);
    expect(j01).toContain('}, PRODUCT_READY_TIMEOUT_MS - LAUNCH_SAMPLE_LEAD_MS);');
  });

  it('reads only the launch in flight: nothing from before it began, from another process, or without its time', () => {
    const launch = launched([
      // The launch before, from its start: had lines before this launch began been read, it — the first `<launched>` in
      // the log — would be the one read, and its good start would stand in for this launch's stall (#581).
      [-900, '<launched> pid=11'],
      [-600, '[pid=11][err] AI7_STARTUP/service-ready'],
      [-300, '[pid=11][out] AI7_READY'],
      // The launch before, still closing: written before this one began, or by its own process after.
      [-5, '[pid=11][err] AI7_STARTUP/readiness-signal'],
      [3, '[pid=11] <process did exit: exitCode=0, signal=null>'],
      [9, '<launched> pid=12'],
      [40, '[pid=11][out] AI7_READY'],
      [50, '[pid=12][err] AI7_STARTUP/runtime'],
    ]) as Record<string, unknown>;
    const undated = trace.readBrowserLog(launch, 'pw:browser [pid=12][out] AI7_READY\n[pid=12][err] AI7_STARTUP/readiness-signal');
    expect(trace.formatReadinessTrace('J-01', undated, 1_000 + 60_000)).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=9;last=runtime@50;service=none@none;ready=none;failed=none;exit=none@none;target=no;other=0;age=60000',
    );
  });

  it('has J-01 mark its target between attaching and waiting for readiness, so a stall there says the target existed (#581)', () => {
    // J-01 runs as it is imported, so the order is read from its source: in `attachRendererTarget`, `onTarget()` follows
    // the attach and comes before the first command the readiness wait sends.
    const source = readFileSync(join(ROOT, 'e2e', 'run-j01.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    const start = source.indexOf('async function attachRendererTarget(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const attach = body.indexOf("'Target.attachToTarget'");
    const marked = body.indexOf('onTarget();');
    const waits = body.indexOf("await send('Runtime.enable'");
    const ready = body.indexOf("at('renderer-ready')");
    expect([attach > -1, marked > -1, waits > -1, ready > -1]).toEqual([true, true, true, true]);
    expect(attach < marked && marked < waits && waits < ready).toBe(true);
    expect(body.indexOf('onTarget();', marked + 1)).toBe(-1);
    // Its one caller hands it the mark itself, and nothing else sets the mark (#592). A mark set once
    // `attachRendererTarget` returned would keep the order above and J-01's good launch, yet a stall in the readiness
    // wait would say `target=no` of a target that attached.
    const calls = [...source.matchAll(/(?<!function )attachRendererTarget\(/gu)].map((match) => match.index);
    expect(calls).toHaveLength(1);
    const call = source.slice(calls[0], source.indexOf(');', calls[0]) + 2);
    // Whatever the layout: arguments over several lines, other spacing, a trailing comma (#602).
    expect(call).toMatch(/^attachRendererTarget\s*\(\s*browser\s*,\s*\(\)\s*=>\s*\{\s*inFlight\.target\s*=\s*true\s*;?\s*\}\s*,?\s*\);$/u);
    // Every write of the mark, whatever its spacing or the name it goes through, is one of two: the trace's copy of it
    // and that callback (#602). The record starts without it.
    expect((source.match(/\.target\s*=(?!=)/gu) ?? []).length).toBe(2);
    expect(source.match(/\btrace\.target\s*=\s*launchInFlight\.target\s*;/gu)).toHaveLength(1);
    expect((source.match(/\btarget\s*:\s*(?:true|false)\b/gu) ?? []).map((text) => text.replace(/\s+/gu, ''))).toEqual(['target:false']);
  });

  it('keeps a Windows exit status whole, and relays it', () => {
    const launch = launched([[9, '<launched> pid=3'], [700, '[pid=3] <process did exit: exitCode=3221225477, signal=null>']]);
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 800);
    expect(line).toContain(';exit=3221225477@700;');
    expect(trace.readReadinessTrace(line, 'J-01')).toBe(line.slice('READINESS/J-01/'.length));
    // Longer than any exit status: not read as one.
    const longer = launched([[9, '<launched> pid=3'], [700, '[pid=3] <process did exit: exitCode=32212254770, signal=null>']]);
    expect(trace.formatReadinessTrace('J-01', longer, 1_000 + 800)).toContain(';exit=none@none;');
  });

  it('relays only a trace of exactly its content-free shape, and only one', () => {
    const line = trace.formatReadinessTrace('J-01', launched([[9, '<launched> pid=1']]), 1_000 + 60_000);
    const fields = line.slice('READINESS/J-01/'.length);
    expect(trace.readReadinessTrace(`J-01/renderer-ready\n${line}\n`, 'J-01')).toBe(fields);
    expect(controller.collectReadinessTrace({ stderr: `${line}\r\n` }, 'J-01')).toBe(fields);
    // Another Journey's, a longer one, a step main never names, or two of them: none.
    expect(trace.readReadinessTrace(line, 'J-02')).toBeNull();
    expect(trace.readReadinessTrace(`${line};path=C:\\data`, 'J-01')).toBeNull();
    expect(trace.readReadinessTrace(line.replace('last=none', 'last=稿件'), 'J-01')).toBeNull();
    expect(trace.readReadinessTrace(`${line}\n${line}`, 'J-01')).toBeNull();
    expect(trace.readReadinessTrace('J-01/renderer-ready', 'J-01')).toBeNull();
    // Every step main can reach is a word the relay accepts.
    for (const location of trace.STARTUP_LOCATIONS) {
      expect(trace.readReadinessTrace(line.replace('last=none', `last=${location}`), 'J-01')).not.toBeNull();
    }
  });

  it('carries what a launch began from and what a probe of a launch never acquired found, and relays only their closed shape (#675)', () => {
    const launch = launched([[3, '<launched> pid=5']]);
    launch.start = { lock: 'no', prior: 0 };
    launch.stall = {
      state: 'sleep', rssMb: 142, threads: 31, files: ['icu', 'framework', 'pak'],
      log: { entries: 4, sender: 'skylight', subsystem: 'com.apple.skylight' },
    };
    const line = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009);
    expect(line).toBe(
      'READINESS/J-01/launch=empty-book-first-import;launched=3;last=none@none;service=none@none;ready=none;failed=none;exit=none@none;target=no;other=0;age=60009' +
        ';start=lock:no,prior:0;stall=threads:31,state:sleep,rss:142,files:framework+icu+pak,log:4:skylight:com.apple.skylight',
    );
    const fields = line.slice('READINESS/J-01/'.length);
    expect(controller.collectReadinessTrace({ stderr: `${line}\n` }, 'J-01')).toBe(fields);
    // Unread parts say so; a probe that never ran leaves the field out, and a launch with no start record leaves both out.
    launch.stall = { state: null, rssMb: null, threads: null, files: null, log: null };
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009))
      .toMatch(/;start=lock:no,prior:0;stall=threads:unknown,state:unknown,rss:unknown,files:unknown,log:unknown:none:none$/u);
    launch.stall = { state: 'wait', rssMb: 3, threads: 1, files: [], log: { entries: 0, sender: null, subsystem: null } };
    const bare = trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009);
    expect(bare).toMatch(/;stall=threads:1,state:wait,rss:3,files:none,log:0:none:none$/u);
    expect(trace.readReadinessTrace(bare, 'J-01')).not.toBeNull();
    launch.stall = null;
    launch.start = { lock: 'yes', prior: null };
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009)).toMatch(/;age=60009;start=lock:yes,prior:unknown$/u);
    launch.start = null;
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009)).toMatch(/;age=60009$/u);
    // Nothing outside the closed words passes: an unknown state or file, a path, a message.
    launch.start = { lock: '/tmp/x', prior: 400 };
    launch.stall = { state: 'blocked', rssMb: 1, threads: 2, files: ['framework', '/Users/x'], log: { entries: 1, sender: 'Electron Framework', subsystem: '稿件' } };
    expect(trace.formatReadinessTrace('J-01', launch, 1_000 + 60_009))
      .toMatch(/;start=lock:unknown,prior:99;stall=threads:2,state:unknown,rss:1,files:framework,log:1:other:other$/u);
    for (const forged of [
      `${fields.replace('files:framework+icu+pak', 'files:/Users/runner')}`,
      `${fields.replace('log:4:skylight', 'log:4:Sky Light')}`,
      `${fields.replace('state:sleep', 'state:稿件')}`,
      `${fields.replace(';start=lock:no,prior:0', '')};start=lock:no,prior:0`,
      `${fields};note=x`,
    ]) expect(trace.readReadinessTrace(`READINESS/J-01/${forged}`, 'J-01')).toBeNull();
  });

  it('says whether a launch\'s user-data-dir still held an instance\'s lock before it began (#675)', async () => {
    expect(trace.singletonLockName('darwin')).toBe('SingletonLock');
    expect(trace.singletonLockName('win32')).toBe('lockfile');
    const root = mkdtempSync(join(tmpdir(), 'ai7-launch-start-'));
    try {
      // Off macOS the host's processes are not listed before a launch.
      expect(await trace.observeLaunchStart(root, process.execPath, 'win32')).toEqual({ lock: 'no', prior: null });
      writeFileSync(join(root, 'lockfile'), '');
      expect(await trace.observeLaunchStart(root, process.execPath, 'win32')).toEqual({ lock: 'yes', prior: null });
      expect(await trace.observeLaunchStart(root, process.execPath, 'linux')).toEqual({ lock: 'no', prior: null });
      writeFileSync(join(root, 'SingletonLock'), '');
      expect(await trace.observeLaunchStart(root, process.execPath, 'linux')).toEqual({ lock: 'yes', prior: null });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a stalled macOS product\'s state, threads, startup files and last unified-log entry, keeping no path or message (#675)', async () => {
    expect(trace.parseProcessStatus('Ss    145408\n')).toEqual({ state: 'sleep', rssMb: 142 });
    expect(trace.parseProcessStatus('U       3072')).toEqual({ state: 'wait', rssMb: 3 });
    expect(trace.parseProcessStatus('I+ 1024')).toEqual({ state: 'idle', rssMb: 1 });
    expect(trace.parseProcessStatus('X 1024')).toEqual({ state: 'unknown', rssMb: 1 });
    expect(trace.parseProcessStatus('')).toEqual({ state: null, rssMb: null });
    expect(trace.parseProcessStatus(null)).toEqual({ state: null, rssMb: null });
    expect(trace.parseThreadCount([
      'USER     PID   TT  %CPU STAT PRI     STIME     UTIME COMMAND',
      'runner  5000   ??    0.0 S    31T   0:00.01   0:00.02 /a/Electron.app/Contents/MacOS/Electron --x',
      '        5000         0.0 S    31T   0:00.00   0:00.00',
      '',
    ].join('\n'))).toBe(2);
    expect(trace.parseThreadCount('USER PID\n')).toBeNull();
    expect(trace.parseThreadCount(null)).toBeNull();
    const app = '/runner/.runtime/electron/Electron.app';
    const data = '/private/var/folders/x/T/ai7-j01-e2e-1/before-paint-data/shell';
    const lsof = [
      'p5000',
      'ftxt',
      `n${app}/Contents/MacOS/Electron`,
      'ftxt',
      `n${app}/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework`,
      'ftxt',
      'n/usr/lib/dyld',
      'ftxt',
      `n${app}/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/icudtl.dat`,
      `n${app}/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/v8_context_snapshot.arm64.bin`,
      'f3',
      'npipe',
      `n${data}/SingletonLock`,
    ].join('\n');
    expect(trace.startupFilesOpen(lsof, app, data)).toEqual(['framework', 'icu', 'snapshot', 'data']);
    expect(trace.startupFilesOpen(`p1\nn${app}/Contents/Resources/default_app.asar\nn${app}/Contents/Frameworks/Electron Framework.framework/Resources/resources.pak`, app, data))
      .toEqual(['framework', 'pak', 'asar']);
    expect(trace.startupFilesOpen('p1\nfcwd\nn/\n', app, data)).toEqual([]);
    expect(trace.startupFilesOpen(null, app, data)).toBeNull();
    // A framework of the same name outside the runtime root is not this Electron's.
    expect(trace.startupFilesOpen('n/elsewhere/Electron Framework.framework/Electron Framework', app, data)).toEqual([]);
    const log = [
      'Filtering the log data using "processIdentifier == 5000"',
      JSON.stringify({ processID: 5000, subsystem: 'com.apple.CFPreferences', senderImagePath: '/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation', eventMessage: 'a message' }),
      JSON.stringify({ processID: 4999, subsystem: 'com.apple.other', senderImagePath: '/usr/lib/other.dylib' }),
      JSON.stringify({ processID: 5000, subsystem: '', senderImagePath: '/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight', eventMessage: '/Users/runner/secret' }),
      '{not json',
    ].join('\n');
    expect(trace.lastLogEntry(log, 5000)).toEqual({ entries: 2, sender: 'skylight', subsystem: null });
    expect(trace.lastLogEntry('', 5000)).toEqual({ entries: 0, sender: null, subsystem: null });
    expect(trace.lastLogEntry(null, 5000)).toBeNull();
    expect(trace.lastLogEntry(JSON.stringify({ processID: 5000, subsystem: 'com.apple.launchservices', senderImagePath: '/x/Electron Framework' }), 5000))
      .toEqual({ entries: 1, sender: 'electron-framework', subsystem: 'com.apple.launchservices' });
    // Off macOS there is no probe.
    expect(await trace.probeStalledProduct(process.pid, process.execPath, data, 60, 'win32')).toBeNull();
    expect(await trace.probeStalledProduct(0, process.execPath, data, 60, 'darwin')).toBeNull();
  });

  it('has J-01 record what each launch began from and carry the probe of a launch it never acquired (#675)', () => {
    const j01 = readFileSync(join(ROOT, 'e2e', 'run-j01.mjs'), 'utf8').replace(/\r\n/gu, '\n');
    const start = j01.indexOf('const start = await observeLaunchStart(shellRoot, executable).catch(() => null);');
    const inFlight = j01.indexOf('const inFlight = { scenario: launchScenario, startedAt: Date.now(), target: false, start, stall: null };');
    const launch = j01.indexOf('const launchPromise = chromium.launch({');
    expect(start).toBeGreaterThan(-1);
    expect(start < inFlight && inFlight < launch).toBe(true);
    expect(j01).toMatch(/launchProbe = Number\.isSafeInteger\(pid\) \? probeStalledProduct\(pid, executable, shellRoot, lookbackSeconds\)/u);
    const probe = j01.indexOf('inFlight.stall = launchProbe === undefined ? null : await launchProbe;');
    const label = j01.indexOf("throw journeyCheckFailure('J-01', browserLaunchMissLabel(classifyBrowserLaunchMiss(launchTraceNow(), sample)), { cause: error });");
    expect(probe).toBeGreaterThan(-1);
    expect(probe < label).toBe(true);
    expect(j01).toContain('trace.start = launchInFlight.start;\n  trace.stall = launchInFlight.stall;');
  });

  it('reads a real launch through the installed Playwright\'s browser log, set up as J-01 sets it up', () => {
    // Node stands in for the product: it says two startup steps and something else, prints AI7_READY and exits. Playwright
    // launches it as J-01 launches the product, and the launch then fails, since nothing answers on the pipe.
    const root = mkdtempSync(join(tmpdir(), 'ai7-readiness-trace-'));
    try {
      const product = join(root, 'product.mjs');
      writeFileSync(product, [
        "process.stderr.write('AI7_STARTUP/runtime\\n');",
        "process.stderr.write('something the product said\\n');",
        "process.stderr.write('AI7_STARTUP/readiness-signal\\n');",
        "process.stdout.write('AI7_READY\\n', () => setTimeout(() => process.exit(0), 100));",
      ].join('\n'));
      const launcher = join(root, 'launcher.mjs');
      writeFileSync(launcher, [
        "import { join } from 'node:path';",
        "import { pathToFileURL } from 'node:url';",
        'const [product, checkout] = process.argv.slice(2);',
        "const { chromium } = await import(pathToFileURL(join(checkout, 'node_modules', 'playwright-core', 'index.mjs')).href);",
        'await chromium.launch({ executablePath: process.execPath, ignoreDefaultArgs: true, args: [product], timeout: 30_000 }).catch(() => undefined);',
      ].join('\n'));
      const log = join(root, 'playwright-browser.log');
      const startedAt = Date.now();
      const run = spawnSync(process.execPath, [launcher, product, ROOT], {
        env: { ...process.env, DEBUG: 'pw:browser', DEBUG_FILE: log, DEBUG_COLORS: 'no' },
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(run.status).toBe(0);
      const read = trace.readBrowserLog(trace.createLaunchTrace('real-launch', startedAt), readFileSync(log, 'utf8'));
      expect(read).toMatchObject({ last: 'readiness-signal', failed: null, exitCode: '0' });
      for (const field of ['launched', 'lastAt', 'ready', 'exited']) expect(read[field]).not.toBeNull();
      expect(read.other).toBeGreaterThanOrEqual(1);
      expect(trace.formatReadinessTrace('J-01', read)).not.toContain('said');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
