// Issue #518: a Journey that waits past its readiness budget names what the product reported while it waited. For the
// launch in flight, that is when it launched, the last startup step main reached, AI7_READY, a startup failure and the
// exit, each in milliseconds since the launch began. The product's own words never pass: only its fixed markers are read,
// every other line is counted, and the one line a failure prints carries nothing else.
//
// Playwright reports a launch's lines — its process's output and its exit — only to its own `browser` debug log, which it
// sets up when it loads: never to a client logger. A Journey therefore points that log at a file in its run root before it
// loads Playwright, with each line's time (`DEBUG_COLORS=no`), and reads the launch in flight back from it.

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
    `ready=${ms(trace.ready)}`,
    `failed=${trace.failed ?? 'none'}`,
    `exit=${trace.exitCode ?? 'none'}@${ms(trace.exited)}`,
    `target=${trace.target ? 'yes' : 'no'}`,
    `other=${Math.min(trace.other, 999_999)}`,
    `age=${ms(now - trace.startedAt)}`,
  ].join(';');
}

const LOCATION_WORD = `(?:${STARTUP_LOCATIONS.join('|')}|none)`;
const MS = '(?:\\d{1,9}|none)';
const FIELDS = new RegExp(
  `^launch=[a-z0-9]+(?:-[a-z0-9]+)*;launched=${MS};last=${LOCATION_WORD}@${MS};ready=${MS};failed=${LOCATION_WORD};` +
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
