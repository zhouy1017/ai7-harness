import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAX_CAPTURE_BYTES = 64 * 1024;

export const ADMITTED_JOURNEYS = Object.freeze(['J-01', 'J-02', 'J-08', 'J-12']);

const JOURNEY_MODULES = Object.freeze({
  'J-01': new URL('./run-j01.mjs', import.meta.url),
  'J-02': new URL('./run-j02.mjs', import.meta.url),
  'J-08': new URL('./run-j08.mjs', import.meta.url),
  'J-12': new URL('./run-j12.mjs', import.meta.url),
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
    'editor',
    'launch',
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
  console.error(`${journey}/${admitted}`);
  process.exitCode = 1;
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
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stdout = boundedCollector(child.stdout);
  const stderr = boundedCollector(child.stderr);

  return new Promise((resolveExit) => {
    let settled = false;
    let controllerSignal = null;
    let forcedTermination;
    const forwardSignal = (signal) => {
      if (controllerSignal === null) controllerSignal = signal;
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.kill(signal);
      } catch {
        // The close/error event below remains the single completion owner.
      }
      forcedTermination ??= setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 5_000);
      forcedTermination.unref();
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);

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
