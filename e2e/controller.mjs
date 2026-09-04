import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const JOURNEY_RUNNER_ENTRY = resolve(ROOT, 'e2e', 'run.mjs');
const MAX_CAPTURE_BYTES = 64 * 1024;
const CANCELLATION_MESSAGE = 'ai7-e2e-cancel';
const CANCELLATION_SIGNALS = new Set(['SIGINT', 'SIGTERM']);
const CONTROLLER_DISCONNECT = 'controller-disconnect';
const SIGNAL_CLEANUP_GRACE_MS = 90_000;
// Local debug (ADR 0062): controller-only switch. Never forwarded to the product process, refused under CI.
const LOCAL_DEBUG_ENV = 'AI7_E2E_LOCAL_DEBUG';
const LOCAL_DEBUG_DIR_ENV = 'AI7_E2E_LOCAL_DEBUG_DIR';
const CI_SELECTORS = Object.freeze(['CI', 'GITHUB_ACTIONS', 'AI7_CI_WINDOWS_SERVER_2025']);
const DEBUG_CAPTURE_TIMEOUT_MS = 10_000;
const debugCaptures = new Set();
let debugArtifactRoot;
let productAttachSequence = 0;
let screenshotsWritten = 0;
const cancellationHandlers = new Set();
let pendingCancellationSignal = null;
let runnerForcedTermination;

function disconnectControllerChannel() {
  process.removeListener('message', receiveControllerMessage);
  process.removeListener('disconnect', receiveControllerDisconnect);
  process.removeListener('SIGINT', receiveDirectSigint);
  process.removeListener('SIGTERM', receiveDirectSigterm);
  if (runnerForcedTermination !== undefined) {
    clearTimeout(runnerForcedTermination);
    runnerForcedTermination = undefined;
  }
  if (typeof process.send === 'function' && process.connected) {
    try {
      process.disconnect();
    } catch {
      // Process exit remains the final fallback for an already-closing channel.
    }
  }
}

function requestRunnerCancellation(signal) {
  if (pendingCancellationSignal !== null) return;
  pendingCancellationSignal = signal;
  runnerForcedTermination = setTimeout(() => process.exit(1), SIGNAL_CLEANUP_GRACE_MS);
  runnerForcedTermination.unref();
  for (const handler of cancellationHandlers) handler(pendingCancellationSignal);
}

function receiveControllerMessage(message) {
  if (
    message === null ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    Object.keys(message).length !== 2 ||
    message.type !== CANCELLATION_MESSAGE ||
    !CANCELLATION_SIGNALS.has(message.signal)
  ) {
    return;
  }
  requestRunnerCancellation(message.signal);
}

function receiveControllerDisconnect() {
  requestRunnerCancellation(CONTROLLER_DISCONNECT);
}

function receiveDirectSigint() {
  requestRunnerCancellation('SIGINT');
}

function receiveDirectSigterm() {
  requestRunnerCancellation('SIGTERM');
}

const isJourneyRunner =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === JOURNEY_RUNNER_ENTRY;

if (isJourneyRunner) {
  process.on('SIGINT', receiveDirectSigint);
  process.on('SIGTERM', receiveDirectSigterm);
  if (typeof process.send === 'function') {
    process.on('message', receiveControllerMessage);
    process.on('disconnect', receiveControllerDisconnect);
    if (!process.connected) requestRunnerCancellation(CONTROLLER_DISCONNECT);
  }
}

export const ADMITTED_JOURNEYS = Object.freeze(['J-01', 'J-02', 'J-08', 'J-12', 'J-15', 'J-03']);

const JOURNEY_MODULES = Object.freeze({
  'J-01': new URL('./run-j01.mjs', import.meta.url),
  'J-02': new URL('./run-j02.mjs', import.meta.url),
  'J-08': new URL('./run-j08.mjs', import.meta.url),
  'J-12': new URL('./run-j12.mjs', import.meta.url),
  'J-15': new URL('./run-j15.mjs', import.meta.url),
  'J-03': new URL('./run-j03.mjs', import.meta.url),
});

const J01_LAUNCH_SCENARIOS = Object.freeze([
  'window-close',
  'empty-book-first-import',
  'empty-book-review-recovery',
  'populated-book-open-before-source',
  'source-bound-new',
  'source-same-book-reuse',
  'source-empty-cross-book',
  'source-reviewed-restart',
  'source-populated-cross-book-import',
  'source-populated-cross-book-review',
  'source-after-commit-import',
  'source-after-commit-recovered',
  'source-uncertain-import',
  'source-uncertain-recovered',
  'reimport-initial',
  'reimport-verified-changed',
  'reimport-reviewed-restart',
  'reimport-verified-no-change',
  'reimport-unconfirmed-changed',
  'reimport-unconfirmed-no-change',
  'reimport-no-change-lineage',
  'reimport-no-change-lineage-restart',
  'reimport-degraded-initial',
  'reimport-degraded-review',
  'reimport-degraded-restart-required',
  'reimport-degraded-restart-accepted',
  'reimport-paged-initial',
  'reimport-paged-review',
  'reimport-paged-replay',
  'reimport-repeated-initial',
  'reimport-repeated-review',
  'reimport-ambiguous-initial',
  'reimport-ambiguous-review',
  'reimport-tamper-proof',
  'reimport-before-commit-initial',
  'reimport-before-commit-interruption',
  'reimport-before-commit-recovery',
  'reimport-after-commit-initial',
  'reimport-after-commit-interruption',
  'reimport-after-commit-recovery',
  'reimport-uncertain-initial',
  'reimport-uncertain-interruption',
  'reimport-uncertain-recovery',
  'reimport-path-loss-initial',
  'reimport-path-loss-review',
  'reimport-path-loss-recovery',
  'reimport-reselection-initial',
  'reimport-reselection-interruption',
  'reimport-reselection-required',
  'reimport-reselection-preserved',
  'restart-before-review',
  'path-loss-recovery',
  'continuity-exact-sample',
  'continuity-synthetic-a',
  'continuity-identity-review-recovery',
  'continuity-synthetic-b',
  'abandon-stage',
  'abandon-recovery',
  'legacy-review-initial',
  'legacy-review-recovery',
  'before-paint-initial',
  'before-paint-recovery',
  'abandon-failure-stage',
  'abandon-failure-interruption',
  'abandon-failure-retry',
  'abandon-interruption-stage',
  'abandon-interruption-interruption',
  'abandon-interruption-retry',
  'before-commit-initial',
  'before-commit-recovery',
  'after-commit-initial',
  'after-commit-recovery',
  'uncertain-initial',
  'uncertain-recovery',
]);

const J01_LAUNCH_LOCATIONS = Object.freeze(
  J01_LAUNCH_SCENARIOS.flatMap((scenario) => [
    `launch-${scenario}-browser-acquisition`,
    `launch-${scenario}-renderer-target`,
  ]),
);

const JOURNEY_LOCATIONS = Object.freeze({
  'J-01': Object.freeze([
    'entry',
    'cli',
    'controller-network-denial',
    'controller-imports',
    'renderer-ready',
    'landing-action-ready',
    'landing-target-transition',
    'reimport-pre-review',
    'review',
    'review-contract',
    'review-acceptance',
    'commit',
    'completion',
    'completion-visibility-transition',
    'continuity-review',
    'legacy-review',
    'before-paint-review',
    'before-commit-review',
    'after-commit-review',
    'uncertain-review',
    'editor',
    ...J01_LAUNCH_LOCATIONS,
    'window-close',
  ]),
  'J-02': Object.freeze([
    'entry',
    'renderer-ready',
    'renderer-ready-flag',
    'renderer-ready-landing',
    'bounded-workspace',
    'cooperative-position-input',
    'cooperative-position-resolve',
    'cooperative-position-percent',
    'cooperative-position-first-block',
    'cooperative-position-window-bound',
    'cooperative-position-late',
    'cooperative-position-stabilize',
    'cooperative-search-start',
    'cooperative-search-reentry',
    'cooperative-edit-during-search',
    'cooperative-journal-ack',
    'cooperative-cursor-continuity',
    'cooperative-search-close',
    'authoritative-mutation-drain',
    'bounded-exclusions',
    'search-replace',
    'milestone-form',
    'milestone-save-dispatch',
    'milestone-r2-resolution',
    'milestone-save-ipc-order',
    'milestone-search-state-stale',
    'milestone-authoritative-ready',
    'milestone-undo-drain',
    'milestone-close-risk-stable',
    'restart-browser-close',
    'launch-initial-browser-acquisition',
    'launch-initial-post-acquisition-cancellation',
    'launch-initial-renderer-cdp-session',
    'launch-initial-renderer-target-query',
    'launch-initial-renderer-target-classification',
    'launch-initial-renderer-target-cardinality',
    'launch-initial-renderer-target-wait',
    'launch-initial-renderer-target-timeout',
    'launch-initial-renderer-target-attach',
    'launch-initial-renderer-runtime-enable',
    'launch-restart-browser-acquisition',
    'launch-restart-post-acquisition-cancellation',
    'launch-restart-renderer-cdp-session',
    'launch-restart-renderer-target-query',
    'launch-restart-renderer-target-query-single-instance-lock',
    'launch-restart-renderer-target-query-startup-runtime',
    'launch-restart-renderer-target-query-startup-arguments',
    'launch-restart-renderer-target-query-startup-data-root',
    'launch-restart-renderer-target-query-startup-shell-root',
    'launch-restart-renderer-target-query-startup-electron-ready',
    'launch-restart-renderer-target-query-startup-service-ready',
    'launch-restart-renderer-target-query-startup-renderer-first-paint',
    'launch-restart-renderer-target-query-startup-readiness-signal',
    'launch-restart-renderer-target-query-browser-disconnected-multiple-startup-markers',
    'launch-restart-renderer-target-query-browser-disconnected-no-startup-marker',
    'launch-restart-renderer-target-query-session-closed-connected',
    'launch-restart-renderer-target-query-rejected-connected',
    'launch-restart-renderer-target-classification',
    'launch-restart-renderer-target-cardinality',
    'launch-restart-renderer-target-wait',
    'launch-restart-renderer-target-timeout',
    'launch-restart-renderer-target-attach',
    'launch-restart-renderer-runtime-enable',
    'restart-reopen',
    'j14-behavior',
  ]),
  'J-08': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'baseline-import-and-snapshot',
    'clean-reopen',
    'acknowledged-interruption-with-lower-priority-import',
    'recovery-priority-comparison-view-defer',
    'snapshot-newest-mismatch-fallback',
    'snapshot-mismatch-and-orphan-cleanup',
    'snapshot-incomplete',
    'snapshot-newest-missing-fallback',
    'snapshot-missing',
    'descendant-restore',
    'persistent-marker-and-later-milestone',
    'snapshot-none-interruption',
    'snapshot-none-comparison',
  ]),
  'J-12': Object.freeze([
    'entry',
    'controller-loopback',
    'controller-imports',
    'offline-empty-and-import',
    'distinct-and-duplicate-book-routing',
    'serialized-newest-route-wins',
    'background-state-no-focus-and-later-revision',
    'close-risk-route-preservation',
    'close-risk-same-window-request',
    'close-risk-cross-window-focus',
    'close-risk-cross-window-request',
    'close-risk-capability-preservation',
    'background-journal-non-focus-steal',
    'exact-immutable-history',
    'sender-owned-import-draft',
    'sender-owned-editor-capabilities',
    'sender-owned-editor-capabilities-import-b',
    'sender-owned-editor-capabilities-seed-b',
    'sender-owned-editor-capabilities-foreign-manuscript',
    'sender-owned-editor-capabilities-start-search',
    'sender-owned-editor-capabilities-foreign-job',
    'sender-owned-editor-capabilities-complete-search',
    'sender-owned-editor-capabilities-foreign-search',
    'sender-owned-editor-capabilities-preview',
    'sender-owned-editor-capabilities-foreign-preview',
    'sender-owned-editor-capabilities-final',
    'effect-before-route-arrival-order',
    'existing-book-source-commit-preflight',
    'restart-and-data-location',
    'model-service-first-save',
    'model-service-restart-and-replace',
    'model-service-remove-and-restart',
  ]),
  'J-15': Object.freeze([
    'entry',
    'controller-loopback',
    'controller-imports',
    'initial-empty-book',
    'install-disabled',
    'install-effect',
    'enable-current-book',
    'enable-effect',
    'restart-persistence',
    'restart-open-book-a',
    'restart-book-a-route-error',
    'restart-enabled-book-a',
    'restart-book-a-disabled',
    'restart-book-a-unavailable',
    'second-book-disabled',
    'accessibility-reflow-forced-colors',
    'zero-activity',
  ]),
  'J-03': Object.freeze([
    'entry',
    'controller-loopback',
    'controller-imports',
    'exact-sample1',
    'renderer-ready',
    'renderer-api-boundary',
    'renderer-task-api',
    'renderer-zero-execution-api',
    'sample1-import',
    'sample1-import-target',
    'sample1-import-relationship',
    'sample1-import-title',
    'sample1-import-review',
    'sample1-import-completed',
    'task-prerequisites-unavailable',
    'artifact-revision2',
    'artifact-install',
    'artifact-enable',
    'artifact-enabled',
    'model-setup-remove',
    'model-settings-ready',
    'model-credential-saved',
    'model-credential-removed',
    'acknowledged-edit',
    'j14-ime-focus',
    'j14-reflow-forced-colors',
    'plan-prepared',
    'cross-book-route-guard',
    'authorization-recorded',
    'post-authorization-edit',
    'restart-immutable',
    'zero-activity',
  ]),
});

export function normalizePnpmArgs(args) {
  const normalized = [...args];
  if (normalized[0] === '--') normalized.shift();
  return normalized;
}

export function isAdmittedJourney(value) {
  return ADMITTED_JOURNEYS.includes(value);
}

export function journeyModuleUrl(journey) {
  return JOURNEY_MODULES[journey];
}

export function isAdmittedLocation(journey, location) {
  return location === 'controller' || JOURNEY_LOCATIONS[journey]?.includes(location) === true;
}

export function reportJourneyFailure(journey, location, error) {
  const admitted = isAdmittedLocation(journey, location) ? location : 'controller';
  disconnectControllerChannel();
  console.error(`${journey}/${admitted}`);
  process.exitCode = 1;
  if (!localDebugEnabled()) return undefined;
  return writeDebugFailure(journey, location, error);
}

export function installJourneyCancellationCleanup(cleanup, interrupt = () => undefined) {
  if (typeof cleanup !== 'function') throw new TypeError('Journey cleanup must be callable.');
  if (typeof interrupt !== 'function') throw new TypeError('Journey interrupt must be callable.');
  let cleanupPromise;
  let interruptionPromise;
  let interruptedSignal = null;
  let disposed = false;
  const runCleanup = () => {
    cleanupPromise ??= Promise.resolve().then(async () => {
      await interruptionPromise;
      if (localDebugEnabled()) await captureArmedBrowsers('final');
      await cleanup();
    });
    return cleanupPromise;
  };
  const beginCancellation = (signal) => {
    if (disposed || interruptedSignal !== null) return;
    interruptedSignal = signal;
    interruptionPromise ??= Promise.resolve().then(interrupt).catch(() => undefined);
  };
  cancellationHandlers.add(beginCancellation);
  if (pendingCancellationSignal !== null) {
    queueMicrotask(() => beginCancellation(pendingCancellationSignal));
  }
  return {
    cleanup: runCleanup,
    throwIfRequested: () => {
      if (interruptedSignal !== null || pendingCancellationSignal !== null) {
        throw new Error('Journey cancellation requested.');
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancellationHandlers.delete(beginCancellation);
      disconnectControllerChannel();
    },
  };
}

function boundedCollector(stream) {
  const chunks = [];
  let bytes = 0;
  let overflow = false;
  stream.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const available = MAX_CAPTURE_BYTES - bytes;
    if (available > 0) {
      const admitted = buffer.subarray(0, available);
      chunks.push(admitted);
      bytes += admitted.length;
    }
    if (buffer.length > available) overflow = true;
  });
  return {
    output: () => Buffer.concat(chunks).toString('utf8'),
    overflow: () => overflow,
  };
}

export async function runJourneyProcess(journey, options = {}) {
  const args = [resolve(ROOT, 'e2e', 'run.mjs'), '--journey', journey];
  const artifactRoot = options.debug === true ? createDebugArtifactRoot(journey) : null;
  const env = artifactRoot === null
    ? process.env
    : {
        ...process.env,
        [LOCAL_DEBUG_ENV]: '1',
        [LOCAL_DEBUG_DIR_ENV]: artifactRoot,
        DEBUG: 'pw:browser',
        DEBUG_FILE: resolve(artifactRoot, 'playwright-browser.log'),
      };
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });

  const stdout = boundedCollector(child.stdout);
  const stderr = boundedCollector(child.stderr);
  if (artifactRoot !== null) {
    teeStream(child.stdout, resolve(artifactRoot, 'runner-stdout.log'));
    teeStream(child.stderr, resolve(artifactRoot, 'runner-stderr.log'));
  }

  return new Promise((resolveExit) => {
    let settled = false;
    let controllerSignal = null;
    let forcedTermination;
    const forwardSignal = (signal) => {
      if (controllerSignal !== null) return;
      if (child.exitCode !== null || child.signalCode !== null) return;
      controllerSignal = signal;
      if (child.connected) {
        try {
          child.send({ type: CANCELLATION_MESSAGE, signal }, () => undefined);
        } catch {
          // The bounded hard-stop below remains the final fallback.
        }
      }
      forcedTermination ??= setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, SIGNAL_CLEANUP_GRACE_MS);
      forcedTermination.unref();
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (forcedTermination !== undefined) clearTimeout(forcedTermination);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      resolveExit({
        ...result,
        controllerSignal,
        artifactRoot,
        stdout: stdout.output(),
        stderr: stderr.output(),
        outputOverflow: stdout.overflow() || stderr.overflow(),
      });
    };
    child.once('error', () => finish({ code: 1, signal: null, spawnError: true }));
    child.once('close', (code, signal) =>
      finish({ code: code ?? 1, signal, spawnError: false }),
    );
  });
}

// ---- Local debug (ADR 0062) -------------------------------------------------------------------

/** True when a hosted CI marker is present; the local debug switch is refused there. */
export function localDebugRefused() {
  return CI_SELECTORS.some((name) => process.env[name] !== undefined);
}

/** True only on a developer host that set the controller switch. Never true under CI. */
export function localDebugEnabled() {
  return process.env[LOCAL_DEBUG_ENV] === '1' && !localDebugRefused();
}

/** The ignored per-run artifact directory under test-results/; created lazily, shared with a launching controller. */
export function localDebugArtifactRoot(journey) {
  if (debugArtifactRoot === undefined) {
    const inherited = process.env[LOCAL_DEBUG_DIR_ENV];
    debugArtifactRoot = inherited !== undefined && inherited !== ''
      ? inherited
      : resolve(ROOT, 'test-results', 'e2e', journey, new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(debugArtifactRoot, { recursive: true });
  }
  return debugArtifactRoot;
}

let createdArtifactRoots = 0;

/** A fresh artifact directory for one launched run; the child inherits it through the environment. */
export function createDebugArtifactRoot(journey) {
  createdArtifactRoots += 1;
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${createdArtifactRoots}`;
  const path = resolve(ROOT, 'test-results', 'e2e', journey, stamp);
  mkdirSync(path, { recursive: true });
  return path;
}

export function debugArtifactLabel(path) {
  return relative(ROOT, path).split(sep).join('/');
}

/** Append one developer-facing detail line; a no-op without the switch. */
export function recordDebugDetail(journey, text) {
  if (!localDebugEnabled()) return;
  appendFileSync(resolve(localDebugArtifactRoot(journey), 'details.log'), `${new Date().toISOString()} ${text}\n`);
}

/** Arm a screenshot capture for every page of a launched browser; product process output arrives through Playwright's browser log. */
export function attachProductOutput(journey, browser, label = 'launch') {
  if (!localDebugEnabled() || browser === undefined || browser === null) return;
  const artifactRoot = localDebugArtifactRoot(journey);
  const sequence = ++productAttachSequence;
  const capture = (phase) => captureBrowserScreenshots(browser, artifactRoot, `${sequence}-${label}-${phase}`);
  debugCaptures.add(capture);
  if (typeof browser.once === 'function') browser.once('disconnected', () => debugCaptures.delete(capture));
}

async function captureArmedBrowsers(phase) {
  let written = 0;
  for (const capture of [...debugCaptures]) {
    try {
      written += await capture(phase);
    } catch (captureError) {
      if (debugArtifactRoot !== undefined) {
        appendFileSync(
          resolve(debugArtifactRoot, 'details.log'),
          `${new Date().toISOString()} screenshot capture (${phase}) failed: ${captureError instanceof Error ? captureError.message : String(captureError)}\n`,
        );
      }
    }
  }
  screenshotsWritten += written;
  return written;
}

function teeStream(source, path) {
  const file = createWriteStream(path, { flags: 'a' });
  source.on('data', (chunk) => file.write(chunk));
  source.once('close', () => file.end());
  source.once('error', () => file.end());
}

function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('debug-capture-timeout')), milliseconds);
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

async function captureBrowserScreenshots(browser, artifactRoot, label) {
  if (typeof browser.isConnected === 'function' && !browser.isConnected()) return 0;
  const session = await withTimeout(browser.newBrowserCDPSession(), DEBUG_CAPTURE_TIMEOUT_MS);
  let written = 0;
  try {
    const { targetInfos } = await withTimeout(session.send('Target.getTargets'), DEBUG_CAPTURE_TIMEOUT_MS);
    for (const target of targetInfos.filter((info) => info.type === 'page')) {
      const { sessionId } = await withTimeout(
        session.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }),
        DEBUG_CAPTURE_TIMEOUT_MS,
      );
      try {
        const data = await withTimeout(
          new Promise((resolveShot, rejectShot) => {
            const id = 1;
            const onMessage = ({ sessionId: incoming, message }) => {
              if (incoming !== sessionId) return;
              let parsed;
              try {
                parsed = JSON.parse(message);
              } catch {
                return;
              }
              if (parsed.id !== id) return;
              session.off('Target.receivedMessageFromTarget', onMessage);
              if (parsed.error) rejectShot(new Error(parsed.error.message ?? 'debug-capture-error'));
              else resolveShot(parsed.result?.data);
            };
            session.on('Target.receivedMessageFromTarget', onMessage);
            session
              .send('Target.sendMessageToTarget', {
                sessionId,
                message: JSON.stringify({ id, method: 'Page.captureScreenshot', params: { format: 'png' } }),
              })
              .catch(rejectShot);
          }),
          DEBUG_CAPTURE_TIMEOUT_MS,
        );
        if (typeof data === 'string' && data.length > 0) {
          written += 1;
          writeFileSync(resolve(artifactRoot, `screenshot-${label}-${written}.png`), Buffer.from(data, 'base64'));
        }
      } finally {
        await session.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
      }
    }
  } finally {
    await session.detach().catch(() => undefined);
  }
  return written;
}

function describeError(error, depth = 0) {
  if (depth > 8 || error === undefined || error === null) return [];
  const lines = [];
  const prefix = depth === 0 ? 'error' : `cause[${depth}]`;
  if (error instanceof Error) {
    lines.push(`${prefix}: ${error.stack ?? `${error.name}: ${error.message}`}`);
    if ('code' in error && error.code !== undefined) lines.push(`${prefix}.code: ${String(error.code)}`);
    if ('detail' in error && error.detail !== undefined) {
      let detail;
      try {
        detail = typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail, null, 2);
      } catch {
        detail = String(error.detail);
      }
      lines.push(`${prefix}.detail: ${detail}`);
    }
    lines.push(...describeError(error.cause, depth + 1));
  } else {
    let rendered;
    try {
      rendered = typeof error === 'string' ? error : JSON.stringify(error);
    } catch {
      rendered = String(error);
    }
    lines.push(`${prefix}: ${rendered}`);
  }
  return lines;
}

async function writeDebugFailure(journey, location, error) {
  const artifactRoot = localDebugArtifactRoot(journey);
  const lines = [
    `journey: ${journey}`,
    `location: ${location}`,
    `recorded_at: ${new Date().toISOString()}`,
    `node: ${process.versions.node}`,
    `platform: ${process.platform} ${process.arch}`,
    ...describeError(error),
  ];
  writeFileSync(resolve(artifactRoot, 'failure.txt'), `${lines.join('\n')}\n`);
  await captureArmedBrowsers('failure');
  console.error(`LOCAL_DEBUG/${journey}/artifacts/${debugArtifactLabel(artifactRoot)}/screenshots/${screenshotsWritten}`);
}

/** Classify a finished journey process the same way the payload-safe diagnostic does. */
export function classifyJourneyResult(result, journey) {
  if (result.spawnError) return { location: 'controller', errorClass: 'controller-spawn' };
  if (result.controllerSignal !== null) return { location: 'controller', errorClass: 'controller-signal' };
  if (result.signal !== null) return { location: 'controller', errorClass: 'controller-child-signal' };
  if (result.outputOverflow) return { location: 'controller', errorClass: 'controller-output-ambiguous' };
  const locations = result.stderr
    .split(/\r?\n/u)
    .map((line) => {
      const prefix = `${journey}/`;
      if (!line.startsWith(prefix)) return null;
      const location = line.slice(prefix.length);
      return isAdmittedLocation(journey, location) ? location : null;
    })
    .filter((location) => location !== null);
  if (locations.length === 1) return { location: locations[0], errorClass: 'journey-failure' };
  if (result.stdout.length === 0 && result.stderr.length === 0) return { location: 'controller', errorClass: 'controller-exit' };
  return { location: 'controller', errorClass: 'controller-output-ambiguous' };
}
