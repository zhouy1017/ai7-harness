// Issue #518: a Journey that waits past its readiness budget names what the product reported while it waited. For the
// launch in flight, that is when it launched, the last startup step main reached, how far the service's own startup came
// (Issue #675), AI7_READY, a startup failure and the exit, each in milliseconds since the launch began. The product's own
// words never pass: only its fixed markers are read, every other line is counted, and the one line a failure prints
// carries nothing else.
//
// Playwright reports a launch's lines — its process's output and its exit — only to its own `browser` debug log, which it
// sets up when it loads: never to a client logger. A Journey therefore points that log at a file in its run root before it
// loads Playwright, with each line's time (`DEBUG_COLORS=no`), and reads the launch in flight back from it.

import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';

/** The startup steps main names (src/main/application.ts), and the failures `AI7_STARTUP_FAILED/…` can carry. */
export const STARTUP_LOCATIONS = Object.freeze([
  'network-denial',
  'application-import',
  'runtime',
  'arguments',
  'data-root',
  'shell-root',
  'single-instance',
  'single-instance-lock',
  'electron-ready',
  'service-ready',
  'renderer-first-paint',
  'readiness-signal',
]);

/**
 * How far the service's own startup came while main waited for it at `service-ready` (Issue #675), in order: its process
 * exists, its module runs, it opens the store, it sets up the owners over the store, it serves requests — or it stopped
 * before it was ready. Main relays each as `AI7_SERVICE_STARTUP/<step>` on its own stderr.
 */
export const SERVICE_STARTUP_STEPS = Object.freeze(['spawned', 'process', 'store', 'owners', 'serving', 'stopped']);

const LOCATION = new Set(STARTUP_LOCATIONS);
const SCENARIO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A launch about to begin, under the Journey's own scenario label. */
export function createLaunchTrace(scenario, startedAt = Date.now()) {
  if (!SCENARIO.test(scenario)) throw new TypeError('A launch trace needs a scenario label.');
  return {
    scenario,
    startedAt,
    pid: null,
    launched: null,
    last: null,
    lastAt: null,
    service: null,
    serviceAt: null,
    ready: null,
    failed: null,
    exited: null,
    exitCode: null,
    target: false,
    other: 0,
  };
}

/**
 * Read one message of Playwright's `browser` log into `trace`: the launch, then main's startup markers on stderr,
 * AI7_READY on stdout and the exit of the process it launched. Another process's lines — an earlier launch's, still
 * closing — are never this launch's; a line of its own that is none of the markers is only counted.
 */
export function observeBrowserLog(trace, message, now = Date.now()) {
  const at = now - trace.startedAt;
  const text = String(message);
  const launched = /^<launched> pid=(\d{1,10})$/u.exec(text);
  if (launched !== null) {
    if (trace.pid === null) {
      trace.pid = launched[1];
      trace.launched = at;
    }
    return;
  }
  const stream = /^\[pid=(\d{1,10})\]\[(out|err)\] ?([\s\S]*)$/u.exec(text);
  if (stream !== null) {
    if (stream[1] !== trace.pid) return;
    const line = stream[3].trim();
    if (line.length === 0) return;
    if (stream[2] === 'out' && line === 'AI7_READY') {
      trace.ready ??= at;
      return;
    }
    if (stream[2] === 'err') {
      const reached = /^AI7_STARTUP\/([a-z-]+)$/u.exec(line);
      if (reached !== null && LOCATION.has(reached[1])) {
        trace.last = reached[1];
        trace.lastAt = at;
        return;
      }
      // The furthest step the service reached, however main's relays of them interleave.
      const service = /^AI7_SERVICE_STARTUP\/([a-z]+)$/u.exec(line);
      if (service !== null && SERVICE_STARTUP_STEPS.includes(service[1])) {
        if (trace.service === null || SERVICE_STARTUP_STEPS.indexOf(service[1]) > SERVICE_STARTUP_STEPS.indexOf(trace.service)) {
          trace.service = service[1];
          trace.serviceAt = at;
        }
        return;
      }
      const failed = /^AI7_STARTUP_FAILED\/([a-z-]+)$/u.exec(line);
      if (failed !== null && LOCATION.has(failed[1])) {
        trace.failed ??= failed[1];
        return;
      }
    }
    trace.other += 1;
    return;
  }
  // Up to ten digits: a Windows exit status such as 0xC0000005 is 3221225477.
  const exit = /^\[pid=(\d{1,10})\] <process did exit: exitCode=(-?\d{1,10}|null),/u.exec(text);
  if (exit !== null && exit[1] === trace.pid) {
    trace.exited ??= at;
    trace.exitCode ??= exit[2];
  }
}

// One line of the log: the time it was written, the namespace, and Playwright's message.
const LOG_LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) pw:browser (.*)$/u;

/**
 * Read the launch in flight from the text of Playwright's `browser` log: every line written since `trace.startedAt`, at
 * the time it was written. A line without its time — the log was not set up as this module asks — is never read.
 */
export function readBrowserLog(trace, text) {
  for (const line of String(text).split(/\r?\n/u)) {
    const found = LOG_LINE.exec(line);
    if (found === null) continue;
    const at = Date.parse(found[1]);
    if (!(at >= trace.startedAt)) continue;
    observeBrowserLog(trace, found[2], at);
  }
  return trace;
}

const ms = (value) => (value === null ? 'none' : String(Math.max(0, Math.min(999_999_999, Math.round(value)))));

/** The one content-free line a failure prints: `READINESS/<journey>/<field>=<value>;…`. */
export function formatReadinessTrace(journey, trace, now = Date.now()) {
  return `READINESS/${journey}/` + [
    `launch=${trace.scenario}`,
    `launched=${ms(trace.launched)}`,
    `last=${trace.last ?? 'none'}@${ms(trace.lastAt)}`,
    `service=${trace.service ?? 'none'}@${ms(trace.serviceAt)}`,
    `ready=${ms(trace.ready)}`,
    `failed=${trace.failed ?? 'none'}`,
    `exit=${trace.exitCode ?? 'none'}@${ms(trace.exited)}`,
    `target=${trace.target ? 'yes' : 'no'}`,
    `other=${Math.min(trace.other, 999_999)}`,
    `age=${ms(now - trace.startedAt)}`,
  ].join(';');
}

const LOCATION_WORD = `(?:${STARTUP_LOCATIONS.join('|')}|none)`;
const SERVICE_WORD = `(?:${SERVICE_STARTUP_STEPS.join('|')}|none)`;
const MS = '(?:\\d{1,9}|none)';
const FIELDS = new RegExp(
  `^launch=[a-z0-9]+(?:-[a-z0-9]+)*;launched=${MS};last=${LOCATION_WORD}@${MS};service=${SERVICE_WORD}@${MS};ready=${MS};failed=${LOCATION_WORD};` +
    `exit=(?:-?\\d{1,10}|null|none)@${MS};target=(?:yes|no);other=\\d{1,6};age=\\d{1,9}$`,
  'u',
);

/** The trace a Journey's child printed, without its prefix, only when it is exactly the content-free shape above. */
export function readReadinessTrace(stderr, journey) {
  const prefix = `READINESS/${journey}/`;
  const found = String(stderr)
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(prefix) && FIELDS.test(line.slice(prefix.length)));
  return found.length === 1 ? found[0].slice(prefix.length) : null;
}

/**
 * Whether main is still waiting for its service when a renderer target misses its budget (Issue #675): at `service-ready`,
 * with no startup failure and no exit. Main makes the window only once the service is ready, so no target can exist yet.
 */
export function waitingForService(trace) {
  return trace !== null && trace !== undefined && trace.last === 'service-ready' && trace.failed === null && trace.exited === null;
}

/**
 * Why a launch's renderer target missed its budget (Issue #675), from its trace when the budget passed and again after the
 * launch was watched to the product's own service deadline (the same trace when it was not watched). `outcome` is one of:
 * `service-start-stalled` (the product gave up on its service), `service-start-slow` (the service became ready after all),
 * `service-start-exited` (the product exited without a failure), `service-start-unbounded` (none of these by the deadline),
 * each with `step`, how far the service's own startup had come when the budget passed; or, with `step` null,
 * `startup-failed`, `product-exited`, `window` (main was making the window), `after-readiness`, or `timeout`.
 */
export function classifyRendererTargetMiss(atBudget, afterWatch = atBudget) {
  if (waitingForService(atBudget)) {
    const step = SERVICE_STARTUP_STEPS.includes(atBudget.service) ? atBudget.service : 'none';
    if (afterWatch.failed === 'service-ready') return { outcome: 'service-start-stalled', step };
    if (afterWatch.failed === null && afterWatch.exited === null) {
      return { outcome: afterWatch.last === 'service-ready' ? 'service-start-unbounded' : 'service-start-slow', step };
    }
    if (afterWatch.failed === null) return { outcome: 'service-start-exited', step };
  }
  const trace = afterWatch ?? atBudget ?? null;
  if (trace !== null && trace.failed !== null) return { outcome: 'startup-failed', step: null };
  if (trace !== null && trace.exited !== null) return { outcome: 'product-exited', step: null };
  if (trace?.last === 'renderer-first-paint') return { outcome: 'window', step: null };
  if (trace?.last === 'readiness-signal') return { outcome: 'after-readiness', step: null };
  return { outcome: 'timeout', step: null };
}

/**
 * The folder every process of the product's Electron runs from (Issue #675): its `.app` bundle on macOS, whose helpers live
 * inside it, and the executable's own folder elsewhere.
 */
export function productRuntimeRoot(executable, platform = process.platform) {
  if (platform === 'darwin') {
    const bundle = executable.lastIndexOf('.app/');
    if (bundle > 0) return executable.slice(0, bundle + 4);
  }
  return platform === 'win32' ? executable.replace(/[\\/][^\\/]*$/u, '') : dirname(executable);
}

/** `ps`'s CPU time, `[[dd-]hh:]mm:ss[.ss]`, in seconds; `null` for any other shape. */
export function psCpuSeconds(text) {
  const found = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/u.exec(String(text).trim());
  if (found === null) return null;
  const [, days = '0', hours = '0', minutes, seconds] = found;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * What the launched product's processes were doing as its launch neared its budget (Issue #675), from one listing of the
 * host's processes as `{ pid, ppid, cpuSeconds, path }`: whether its main process was still there, the CPU time it had
 * used, how many processes it had started below it, and how many other processes of the same Electron were running beside
 * it — an earlier launch's, still closing. Only counts and seconds come out; a path is compared, never kept.
 */
export function summarizeProductProcesses(rows, pid, runtimeRoot, platform = process.platform) {
  const separator = platform === 'win32' ? '\\' : '/';
  const fold = (path) => (platform === 'win32' ? path.replaceAll('/', '\\').toLowerCase() : path);
  const root = fold(/[\\/]$/u.test(runtimeRoot) ? runtimeRoot : `${runtimeRoot}${separator}`);
  const main = rows.find((row) => row.pid === pid);
  const below = new Set([pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (!below.has(row.pid) && below.has(row.ppid)) {
        below.add(row.pid);
        grew = true;
      }
    }
  }
  const prior = rows.filter((row) => !below.has(row.pid) && typeof row.path === 'string' && fold(row.path).startsWith(root)).length;
  return {
    alive: main !== undefined,
    cpuSeconds: main?.cpuSeconds ?? null,
    helpers: below.size - 1,
    prior,
  };
}

const listingOutput = (file, args) => new Promise((settle) => {
  execFile(file, args, { timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
    settle(error ? null : String(stdout));
  });
});

/** Every process on the host as `{ pid, ppid, cpuSeconds, path }`, or `null` when the listing could not be read. */
export async function listHostProcesses(platform = process.platform) {
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot === undefined) return null;
    const text = await listingOutput(resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}`t{3}" -f $_.ProcessId, $_.ParentProcessId, ([uint64]$_.UserModeTime + [uint64]$_.KernelModeTime), $_.ExecutablePath }',
    ]);
    return text === null ? null : parseWindowsProcessListing(text);
  }
  const text = await listingOutput('/bin/ps', ['-A', '-ww', '-o', 'pid=,ppid=,time=,args=']);
  return text === null ? null : parsePsProcessListing(text);
}

/** The Windows listing's tab-separated lines: process id, parent id, CPU time in 100 ns units and executable path. */
export function parseWindowsProcessListing(text) {
  return String(text).split(/\r?\n/u).flatMap((line) => {
    const [pid, ppid, time, path] = line.split('\t');
    if (!/^\d+$/u.test(pid ?? '') || !/^\d+$/u.test(ppid ?? '') || !/^\d+$/u.test(time ?? '')) return [];
    return [{ pid: Number(pid), ppid: Number(ppid), cpuSeconds: Number(time) / 10_000_000, path: path ? path : null }];
  });
}

/** `ps -o pid=,ppid=,time=,args=` lines: the command line starts with the executable's path. */
export function parsePsProcessListing(text) {
  return String(text).split(/\r?\n/u).flatMap((line) => {
    const found = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/u.exec(line);
    if (found === null) return [];
    return [{ pid: Number(found[1]), ppid: Number(found[2]), cpuSeconds: psCpuSeconds(found[3]), path: found[4] }];
  });
}

/** The launched product's processes as `summarizeProductProcesses` says them, or `null` when the host's could not be read. */
export async function sampleProductProcesses(pid, executable) {
  const rows = await listHostProcesses();
  return rows === null ? null : summarizeProductProcesses(rows, pid, productRuntimeRoot(executable));
}

/**
 * Why a launch's browser was never acquired (Issue #675). The trace says how far main came: never started (`not-spawned`),
 * a startup failure or an exit, no step at all (`before-main`: the product's script never said its first step) or the last
 * step it said (`at-step`, with `step`). For a product still there, `sampled` says what the sample taken just before the
 * launch's own timeout found: the main process (`alive`), already `gone`, or nothing (`unsampled`, the host's processes
 * could not be read). Alive, `cpu` says whether the main process was `idle` (under 1 s of CPU), working (`some`, under
 * 10 s) or `busy`, and `helpers` and `prior` count the processes it had started and an earlier launch's still running, each
 * up to 9.
 */
export function classifyBrowserLaunchMiss(trace, sample) {
  const miss = (outcome, step = null) => ({ outcome, step, sampled: null, cpu: null, helpers: 0, prior: 0 });
  if (trace === null || trace === undefined || trace.launched === null) return miss('not-spawned');
  if (trace.failed !== null) return miss('startup-failed');
  if (trace.exited !== null) return miss('product-exited');
  const where = trace.last === null || !LOCATION.has(trace.last) ? miss('before-main') : miss('at-step', trace.last);
  if (sample === null || sample === undefined) return { ...where, sampled: 'unsampled' };
  if (!sample.alive) return { ...where, sampled: 'gone' };
  return {
    ...where,
    sampled: 'alive',
    cpu: sample.cpuSeconds === null ? 'unknown' : sample.cpuSeconds < 1 ? 'idle' : sample.cpuSeconds < 10 ? 'some' : 'busy',
    helpers: Math.min(sample.helpers, 9),
    prior: Math.min(sample.prior, 9),
  };
}
