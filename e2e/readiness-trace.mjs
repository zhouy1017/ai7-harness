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
import { lstat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
    // What the Journey saw of the launch's user-data-dir and the host just before the launch began, and what a probe of a
    // launch never acquired found (Issue #675): `observeLaunchStart` and `probeStalledProduct`, `null` when not taken.
    start: null,
    stall: null,
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
    ...(trace.start === null || trace.start === undefined ? [] : [`start=${formatLaunchStart(trace.start)}`]),
    ...(trace.stall === null || trace.stall === undefined ? [] : [`stall=${formatStalledProduct(trace.stall)}`]),
  ].join(';');
}

/** A count as a word: the number up to `cap`, or `unknown`. */
const countWord = (value, cap) => (Number.isSafeInteger(value) && value >= 0 ? String(Math.min(value, cap)) : 'unknown');
const LOCK_WORDS = Object.freeze(['yes', 'no', 'unknown']);
/** `ps`'s process states (macOS ps(1) `state`), as words: runnable, sleeping, idle (asleep over 20 s), in an uninterruptible wait, stopped, zombie. */
const PROCESS_STATES = Object.freeze({ R: 'run', S: 'sleep', I: 'idle', U: 'wait', T: 'stop', Z: 'zombie' });
const PROCESS_STATE_WORDS = Object.freeze([...Object.values(PROCESS_STATES), 'unknown']);
/**
 * The files a macOS Electron browser process opens or maps on its way to its main script, in that order (Issue #675): the
 * Electron framework (dyld loaded it), ICU's data, the V8 snapshot, the resource packs, an `.asar` archive (Electron's own
 * JavaScript started: the bundled default app the main script is loaded through), and anything in its user-data-dir.
 */
export const STARTUP_FILES = Object.freeze(['framework', 'icu', 'snapshot', 'pak', 'asar', 'data']);
/** A system identifier — a logging subsystem, the basename of the binary image that logged — as a word, or `other`. */
const SYSTEM_TOKEN = /^[a-z0-9][a-z0-9.-]{0,47}$/u;

/** `lock:<yes|no|unknown>,prior:<n|unknown>`: the user-data-dir's single-instance lock, and the same Electron's processes, before a launch. */
export function formatLaunchStart(start) {
  return `lock:${LOCK_WORDS.includes(start.lock) ? start.lock : 'unknown'},prior:${countWord(start.prior, 99)}`;
}

/**
 * `threads:<n>,state:<word>,rss:<MB>,files:<none|unknown|file+…>,log:<n>:<sender>:<subsystem>`: what a probe of a launch
 * never acquired found of its main process (Issue #675). Every value is a count, a closed word, or a system identifier.
 */
export function formatStalledProduct(stall) {
  const files = Array.isArray(stall.files)
    ? (stall.files.length === 0 ? 'none' : STARTUP_FILES.filter((file) => stall.files.includes(file)).join('+') || 'none')
    : 'unknown';
  const token = (value) => (value === null || value === undefined ? 'none' : SYSTEM_TOKEN.test(value) ? value : 'other');
  const log = stall.log === null || stall.log === undefined
    ? 'unknown:none:none'
    : `${countWord(stall.log.entries, 999_999)}:${token(stall.log.sender)}:${token(stall.log.subsystem)}`;
  return [
    `threads:${countWord(stall.threads, 999)}`,
    `state:${PROCESS_STATE_WORDS.includes(stall.state) ? stall.state : 'unknown'}`,
    `rss:${countWord(stall.rssMb, 999_999)}`,
    `files:${files}`,
    `log:${log}`,
  ].join(',');
}

const LOCATION_WORD = `(?:${STARTUP_LOCATIONS.join('|')}|none)`;
const SERVICE_WORD = `(?:${SERVICE_STARTUP_STEPS.join('|')}|none)`;
const MS = '(?:\\d{1,9}|none)';
const COUNT = (digits) => `(?:\\d{1,${digits}}|unknown)`;
const TOKEN = '(?:[a-z0-9][a-z0-9.-]{0,47}|none|other)';
const START = `;start=lock:(?:${LOCK_WORDS.join('|')}),prior:${COUNT(2)}`;
const STALL =
  `;stall=threads:${COUNT(3)},state:(?:${PROCESS_STATE_WORDS.join('|')}),rss:${COUNT(6)},` +
  `files:(?:none|unknown|(?:${STARTUP_FILES.join('|')})(?:\\+(?:${STARTUP_FILES.join('|')}))*),log:${COUNT(6)}:${TOKEN}:${TOKEN}`;
const FIELDS = new RegExp(
  `^launch=[a-z0-9]+(?:-[a-z0-9]+)*;launched=${MS};last=${LOCATION_WORD}@${MS};service=${SERVICE_WORD}@${MS};ready=${MS};failed=${LOCATION_WORD};` +
    `exit=(?:-?\\d{1,10}|null|none)@${MS};target=(?:yes|no);other=\\d{1,6};age=\\d{1,9}(?:${START})?(?:${STALL})?$`,
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

/** The listing command's output and the id of the process that produced it, or `null` when it could not be read. */
const listingOutput = (file, args, timeout = 10_000) => new Promise((settle) => {
  const child = execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
    settle(error ? null : { text: String(stdout), pid: child.pid ?? null });
  });
});

/**
 * Every process on the host as `{ pid, ppid, cpuSeconds, path }`, with the id of the process that listed them (`listingPid`,
 * a child of this one that is in its own listing, alive while it lists), or `null` when the listing could not be read.
 */
export async function listHostProcessesWithListing(platform = process.platform) {
  let listing;
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot === undefined) return null;
    listing = await listingOutput(resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}`t{3}" -f $_.ProcessId, $_.ParentProcessId, ([uint64]$_.UserModeTime + [uint64]$_.KernelModeTime), $_.ExecutablePath }',
    ]);
    if (listing === null) return null;
    return { rows: parseWindowsProcessListing(listing.text), listingPid: listing.pid };
  }
  listing = await listingOutput('/bin/ps', ['-A', '-ww', '-o', 'pid=,ppid=,time=,args=']);
  if (listing === null) return null;
  return { rows: parsePsProcessListing(listing.text), listingPid: listing.pid };
}

/** Every process on the host as `{ pid, ppid, cpuSeconds, path }`, or `null` when the listing could not be read. */
export async function listHostProcesses(platform = process.platform) {
  const listing = await listHostProcessesWithListing(platform);
  return listing === null ? null : listing.rows;
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

/**
 * How busy the product and the host were between two listings of the host's processes (Issue #621): the CPU time used in
 * the window by every process below `rootPid` — the Journey that launched the product — as a share of one core, and by
 * every process on the host as a share of all `cores`. A process that started in the window counts all its time; one that
 * ended in it counts none; process 0, which on Windows carries the idle time, never counts. The process that made the
 * `after` listing — `listingPid`, a child of the Journey alive while it lists itself, costing a few tenths of a second on a
 * hosted Windows runner — and anything it started count for neither share, or an idle product would read as working.
 */
export function cpuShares(before, after, rootPid, windowMs, cores, listingPid = null) {
  const earlier = new Map(before.filter((row) => row.cpuSeconds !== null).map((row) => [row.pid, row.cpuSeconds]));
  const descendants = (origin) => {
    const found = new Set([origin]);
    for (let grew = true; grew;) {
      grew = false;
      for (const row of after) {
        if (!found.has(row.pid) && found.has(row.ppid)) {
          found.add(row.pid);
          grew = true;
        }
      }
    }
    return found;
  };
  const sampler = listingPid === null ? new Set() : descendants(listingPid);
  const below = descendants(rootPid);
  let product = 0;
  let host = 0;
  for (const row of after) {
    if (row.pid === 0 || row.cpuSeconds === null || sampler.has(row.pid)) continue;
    const used = Math.max(0, row.cpuSeconds - (earlier.get(row.pid) ?? 0));
    host += used;
    if (row.pid !== rootPid && below.has(row.pid)) product += used;
  }
  const seconds = Math.max(windowMs, 1) / 1_000;
  return { product: product / seconds, host: host / seconds / Math.max(cores, 1) };
}

/**
 * `cpuShares` over a window of `windowMs` from now, or `null` when the host's processes could not be read. The first
 * listing's process has ended by the second listing, so only the second's own process needs leaving out.
 */
export async function measureCpuShares(rootPid, windowMs = 5_000) {
  const before = await listHostProcesses();
  const startedAt = Date.now();
  await new Promise((settle) => setTimeout(settle, windowMs));
  const after = await listHostProcessesWithListing();
  if (before === null || after === null) return null;
  return cpuShares(before, after.rows, rootPid, Date.now() - startedAt, availableParallelism(), after.listingPid);
}

/** The launched product's processes as `summarizeProductProcesses` says them, or `null` when the host's could not be read. */
export async function sampleProductProcesses(pid, executable) {
  const rows = await listHostProcesses();
  return rows === null ? null : summarizeProductProcesses(rows, pid, productRuntimeRoot(executable));
}

/**
 * The file Chromium's single-instance lock keeps in a user-data-dir while an instance holds it: the `SingletonLock` link on
 * macOS, the `lockfile` a Windows instance deletes as it closes. Electron takes that lock only when main asks for it.
 */
export function singletonLockName(platform = process.platform) {
  return platform === 'win32' ? 'lockfile' : 'SingletonLock';
}

/**
 * What a launch began from (Issue #675), taken just before it: whether its user-data-dir still held an instance's lock
 * (`yes`, `no`, or `unknown` when it could not be read), and on macOS — where listing the host's processes is quick — how
 * many processes of the same Electron were running (`prior`, `null` elsewhere or when they could not be read).
 */
export async function observeLaunchStart(userDataDir, executable, platform = process.platform) {
  let lock;
  try {
    await lstat(join(userDataDir, singletonLockName(platform)));
    lock = 'yes';
  } catch (error) {
    lock = error?.code === 'ENOENT' ? 'no' : 'unknown';
  }
  let prior = null;
  if (platform === 'darwin') {
    const rows = await listHostProcesses(platform);
    if (rows !== null) prior = summarizeProductProcesses(rows, -1, productRuntimeRoot(executable, platform), platform).prior;
  }
  return { lock, prior };
}

/** `ps -o state=,rss=` for one process: its state as a word of `PROCESS_STATES` and its resident memory in whole MB. */
export function parseProcessStatus(text) {
  const found = /^([A-Za-z])\S*\s+(\d{1,12})$/u.exec(String(text ?? '').trim());
  if (found === null) return { state: null, rssMb: null };
  return { state: PROCESS_STATES[found[1]] ?? 'unknown', rssMb: Math.round(Number(found[2]) / 1_024) };
}

/** `ps -M -p <pid>`: one header line, then one line per thread of the process. */
export function parseThreadCount(text) {
  const lines = String(text ?? '').split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return lines.length >= 2 && /^\s*USER\s/u.test(lines[0]) ? lines.length - 1 : null;
}

/**
 * Which of `STARTUP_FILES` a process has open or mapped, from `lsof -F n`'s name lines; `null` without a listing. A path is
 * compared, never kept.
 */
export function startupFilesOpen(text, runtimeRoot, userDataDir) {
  if (text === null || text === undefined) return null;
  const root = runtimeRoot.endsWith('/') ? runtimeRoot : `${runtimeRoot}/`;
  const found = new Set();
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line.startsWith('n/')) continue;
    const name = line.slice(1);
    const base = name.slice(name.lastIndexOf('/') + 1);
    if (name.startsWith(root) && name.includes('/Electron Framework.framework/')) found.add('framework');
    if (base === 'icudtl.dat') found.add('icu');
    if (/^(?:v8_context_snapshot|snapshot_blob)(?:\.[a-z0-9_]+)?\.bin$/u.test(base)) found.add('snapshot');
    if (base.endsWith('.pak')) found.add('pak');
    if (base.endsWith('.asar')) found.add('asar');
    if (name === userDataDir || name.startsWith(`${userDataDir}/`)) found.add('data');
  }
  return STARTUP_FILES.filter((file) => found.has(file));
}

/** A system identifier as a word: lower case, any other character run as one hyphen, or `other` when that is not a word. */
function systemToken(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const token = value.toLowerCase().replace(/[^a-z0-9.]+/gu, '-').replace(/^[-.]+|[-.]+$/gu, '');
  return SYSTEM_TOKEN.test(token) ? token : 'other';
}

/**
 * The process's own entries in the macOS unified log, from `log show --style ndjson`: how many there were and, of the last,
 * the binary image that logged it (its basename) and its subsystem — where the process was when it last said anything.
 * `null` without a listing. No message is read.
 */
export function lastLogEntry(text, pid) {
  if (text === null || text === undefined) return null;
  let entries = 0;
  let last = null;
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line.startsWith('{')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.processID !== pid) continue;
    entries += 1;
    last = entry;
  }
  const sender = typeof last?.senderImagePath === 'string' ? last.senderImagePath.slice(last.senderImagePath.lastIndexOf('/') + 1) : null;
  return { entries, sender: systemToken(sender), subsystem: systemToken(last?.subsystem) };
}

/**
 * What a launch never acquired was doing (Issue #675), probed on macOS beside the sample before its timeout: its main
 * process's thread count, state and resident memory, which of its startup files it had open, and its last word in the
 * unified log over the last `lookbackSeconds`. Each part is `null` when it could not be read; elsewhere the probe is `null`.
 */
export async function probeStalledProduct(pid, executable, userDataDir, lookbackSeconds, platform = process.platform) {
  if (platform !== 'darwin' || !Number.isSafeInteger(pid) || pid <= 0) return null;
  const id = String(pid);
  const seconds = Math.max(1, Math.min(600, Math.ceil(Number(lookbackSeconds) || 0)));
  const [status, threads, files, log] = await Promise.all([
    listingOutput('/bin/ps', ['-o', 'state=,rss=', '-p', id]),
    listingOutput('/bin/ps', ['-M', '-p', id]),
    listingOutput('/usr/sbin/lsof', ['-n', '-P', '-w', '-p', id, '-F', 'n']),
    listingOutput('/usr/bin/log', ['show', '--last', `${seconds}s`, '--info', '--debug', '--style', 'ndjson', '--predicate', `processIdentifier == ${id}`], 30_000),
  ]);
  return {
    ...parseProcessStatus(status?.text ?? null),
    threads: parseThreadCount(threads?.text ?? null),
    files: startupFilesOpen(files?.text ?? null, productRuntimeRoot(executable, platform), userDataDir),
    log: lastLogEntry(log?.text ?? null, pid),
  };
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
