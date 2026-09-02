import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const JOURNEY_RUNNER_ENTRY = resolve(ROOT, 'e2e', 'run.mjs');
const MAX_CAPTURE_BYTES = 64 * 1024;
const CANCELLATION_MESSAGE = 'ai7-e2e-cancel';
const CANCELLATION_SIGNALS = new Set(['SIGINT', 'SIGTERM']);
const CONTROLLER_DISCONNECT = 'controller-disconnect';
const SIGNAL_CLEANUP_GRACE_MS = 90_000;
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

export const ADMITTED_JOURNEYS = Object.freeze(['J-01', 'J-02', 'J-08', 'J-12', 'J-15']);

const JOURNEY_MODULES = Object.freeze({
  'J-01': new URL('./run-j01.mjs', import.meta.url),
  'J-02': new URL('./run-j02.mjs', import.meta.url),
  'J-08': new URL('./run-j08.mjs', import.meta.url),
  'J-12': new URL('./run-j12.mjs', import.meta.url),
  'J-15': new URL('./run-j15.mjs', import.meta.url),
});

const JOURNEY_LOCATIONS = Object.freeze({
  'J-01': Object.freeze([
    'entry',
    'cli',
    'controller-network-denial',
    'controller-imports',
    'renderer-ready',
    'landing',
    'review',
    'continuity-review',
    'legacy-review',
    'before-paint-review',
    'before-commit-review',
    'after-commit-review',
    'uncertain-review',
    'editor',
    'launch',
    'window-close',
  ]),
  'J-02': Object.freeze([
    'entry',
    'renderer-ready',
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
    'milestone-history',
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

export function reportJourneyFailure(journey, location) {
  const admitted = isAdmittedLocation(journey, location) ? location : 'controller';
  disconnectControllerChannel();
  console.error(`${journey}/${admitted}`);
  process.exitCode = 1;
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

export async function runJourneyProcess(journey) {
  const args = [resolve(ROOT, 'e2e', 'run.mjs'), '--journey', journey];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });

  const stdout = boundedCollector(child.stdout);
  const stderr = boundedCollector(child.stderr);

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
