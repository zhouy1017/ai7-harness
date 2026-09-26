import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReadinessTrace } from './readiness-trace.mjs';

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
// Grace that lets a real protocol rejection or a late response win after the browser disconnects.
const CDP_DISCONNECT_SETTLE_MS = 250;
const CDP_REQUEST_ABANDONED = 'child CDP request abandoned after the browser disconnected';
const browserDisconnectWatchers = new WeakMap();
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

export const ADMITTED_JOURNEYS = Object.freeze(['J-01', 'J-02', 'J-08', 'J-12', 'J-15', 'J-03', 'J-04', 'J-05', 'J-06', 'J-07', 'J-09', 'J-10', 'J-11', 'J-16']);

// The bounded pull-request subset of ADMITTED_JOURNEYS under ADR 0075. Every member launches the
// same production-shaped subject, so a broken build, launch, IPC, data root, or service still fails
// the pull request; J-01 and J-02 are excluded on cost alone and run in the nightly full Gate. This
// is a subset of ADMITTED_JOURNEYS, never a separate admission list: a Journey enters here only
// after it is admitted there.
export const GATE_JOURNEYS = Object.freeze(['J-08', 'J-12', 'J-15', 'J-03', 'J-04']);

const J01_COMMON_COMPLETION_PHASES = Object.freeze([
  'imported-transition',
  'content-contract',
  'durable-paint-ack',
]);
const J01_REIMPORT_INITIAL_PHASES = Object.freeze([
  ...J01_COMMON_COMPLETION_PHASES,
  'post-completion-identities',
  'source-graph',
]);
const J01_COMPLETION_PHASES_BY_SCENARIO = Object.freeze({
  'source-populated-cross-book': Object.freeze([
    ...J01_COMMON_COMPLETION_PHASES,
    'post-completion-identities',
    'source-graph',
  ]),
  reimport: Object.freeze([...J01_REIMPORT_INITIAL_PHASES, 'reimport-initial-edit']),
  'reimport-degraded': J01_REIMPORT_INITIAL_PHASES,
  'reimport-paged': Object.freeze([
    ...J01_REIMPORT_INITIAL_PHASES,
    'reimport-initial-edit',
    'editor-scan',
  ]),
  'reimport-repeated': Object.freeze([
    ...J01_REIMPORT_INITIAL_PHASES,
    'reimport-initial-edit',
  ]),
  'reimport-ambiguous': Object.freeze([...J01_REIMPORT_INITIAL_PHASES, 'editor-scan']),
  'reimport-before-commit': J01_REIMPORT_INITIAL_PHASES,
  'reimport-after-commit': J01_REIMPORT_INITIAL_PHASES,
  'reimport-uncertain': J01_REIMPORT_INITIAL_PHASES,
  'reimport-path-loss': J01_REIMPORT_INITIAL_PHASES,
  'reimport-reselection': J01_REIMPORT_INITIAL_PHASES,
  'continuity-path-loss': J01_COMMON_COMPLETION_PHASES,
  'continuity-sample1': J01_COMMON_COMPLETION_PHASES,
  'continuity-identity-review-resumed': J01_COMMON_COMPLETION_PHASES,
  'continuity-synthetic-b': J01_COMMON_COMPLETION_PHASES,
  'legacy-review-rereview': J01_COMMON_COMPLETION_PHASES,
  // ADR 0086 (Issue #410): the decision path on a composed field and footnote, and a composed text box
  // kept as a text box and merged into the body.
  'retention-degraded': J01_COMMON_COMPLETION_PHASES,
  'retention-text-box-retain': J01_COMMON_COMPLETION_PHASES,
  'retention-text-box-merge': J01_COMMON_COMPLETION_PHASES,
  // Issue #411: a DOCX's comments and tracked changes enter as 批注 and 修改建议 whose source is its author.
  'imported-marks': J01_COMMON_COMPLETION_PHASES,
  'before-paint': Object.freeze([
    'imported-transition',
    'content-contract',
    'held-before-paint',
  ]),
  'before-commit-resumed': J01_COMMON_COMPLETION_PHASES,
});
const formatJ01CompletionLocation = (scenario, phase) => `completion-${scenario}-${phase}`;
const J01_COMPLETION_LOCATIONS = Object.freeze(
  Object.entries(J01_COMPLETION_PHASES_BY_SCENARIO).flatMap(([scenario, phases]) =>
    phases.map((phase) => formatJ01CompletionLocation(scenario, phase)),
  ),
);

export function createJ01CompletionLocation(scenario) {
  if (!Object.hasOwn(J01_COMPLETION_PHASES_BY_SCENARIO, scenario)) {
    throw new TypeError('J-01 completion diagnostic scenario is not admitted.');
  }
  const admittedPhases = J01_COMPLETION_PHASES_BY_SCENARIO[scenario];
  return (phase) => {
    if (!admittedPhases.includes(phase)) {
      throw new TypeError('J-01 completion diagnostic phase is not admitted.');
    }
    return formatJ01CompletionLocation(scenario, phase);
  };
}

const JOURNEY_MODULES = Object.freeze({
  'J-01': new URL('./run-j01.mjs', import.meta.url),
  'J-02': new URL('./run-j02.mjs', import.meta.url),
  'J-08': new URL('./run-j08.mjs', import.meta.url),
  'J-12': new URL('./run-j12.mjs', import.meta.url),
  'J-15': new URL('./run-j15.mjs', import.meta.url),
  'J-03': new URL('./run-j03.mjs', import.meta.url),
  'J-04': new URL('./run-j04.mjs', import.meta.url),
  'J-05': new URL('./run-j05.mjs', import.meta.url),
  'J-06': new URL('./run-j06.mjs', import.meta.url),
  'J-07': new URL('./run-j07.mjs', import.meta.url),
  'J-09': new URL('./run-j09.mjs', import.meta.url),
  'J-10': new URL('./run-j10.mjs', import.meta.url),
  'J-11': new URL('./run-j11.mjs', import.meta.url),
  'J-16': new URL('./run-j16.mjs', import.meta.url),
});

const J01_LAUNCH_SCENARIOS = Object.freeze([
  'window-close',
  'empty-book-first-import',
  'empty-book-review-recovery',
  'populated-book-open-before-source',
  'source-bound-new',
  'retention-degraded',
  'retention-text-box-retain',
  'retention-text-box-merge',
  'imported-marks',
  'source-only-pdf',
  'text-manuscript',
  'doc-manuscript',
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

export const JOURNEY_LOCATIONS = Object.freeze({
  'J-01': Object.freeze([
    'entry',
    'cli',
    'controller-network-denial',
    'controller-imports',
    'renderer-ready',
    'landing-action-ready',
    'landing-target-transition',
    'reimport-pre-review',
    // Issue #412 (S63): a reimport's rows resolved, its commit, where it lands, and the Book's records after it — so a
    // hosted failure names the step rather than the launch before it.
    'reimport-resolve',
    'reimport-commit',
    'reimport-landed',
    'reimport-history',
    // The source-only intake of a PDF: identified from its bytes, refused as editable, retained.
    'synthetic-pdf-identity',
    'source-only-pdf-landing',
    'source-only-pdf-stage',
    'source-only-pdf-target',
    'source-only-pdf-format',
    'source-only-pdf-target-select',
    'source-only-pdf-relationship',
    'source-only-pdf-relationship-only-source',
    'source-only-pdf-reason',
    'source-only-pdf-relationship-select',
    'source-only-pdf-title',
    'source-only-pdf-no-fidelity',
    'source-only-pdf-review-action',
    'source-only-pdf-review',
    'source-only-pdf-review-boundary',
    'source-only-pdf-commit',
    'source-only-pdf-imported',
    'source-only-pdf-completion-acknowledged',
    'source-only-pdf-completion-wording',
    'source-only-pdf-completion-identities',
    'source-only-pdf-view-source',
    'source-only-pdf-record-format',
    // The converted intake of a `.txt`: identified, converted to a DOCX working representation,
    // read as an editable Manuscript with the original retained as the digest of record.
    'synthetic-txt-identity',
    'text-manuscript-landing',
    'text-manuscript-stage',
    'text-manuscript-target',
    'text-manuscript-format',
    'text-manuscript-target-select',
    'text-manuscript-relationship',
    'text-manuscript-relationship-both',
    'text-manuscript-relationship-select',
    'text-manuscript-title',
    'text-manuscript-conversion-note',
    'text-manuscript-fidelity-clean',
    'text-manuscript-review-action',
    'text-manuscript-review',
    'text-manuscript-review-conversion-note',
    'text-manuscript-commit',
    'text-manuscript-imported',
    'text-manuscript-completion-acknowledged',
    'text-manuscript-completion-wording',
    'text-manuscript-view-source',
    'text-manuscript-record-conversion',
    // The converted intake of a legacy `.doc`: identified from its content, read through the
    // legacy-Word converter, and committed under the degradation decision the conversion caused.
    // Local-only material (ADR 0079 §5), so these locations are reachable only where the developer
    // has the document; absent, the Journey discloses the skip instead of reaching any of them.
    'local-doc-identity',
    'doc-manuscript-landing',
    'doc-manuscript-stage',
    'doc-manuscript-target',
    'doc-manuscript-format',
    'doc-manuscript-target-select',
    'doc-manuscript-relationship',
    'doc-manuscript-relationship-both',
    'doc-manuscript-relationship-select',
    'doc-manuscript-title',
    'doc-manuscript-conversion-note',
    'doc-manuscript-fidelity-degraded',
    'doc-manuscript-blocks',
    'doc-manuscript-review-action',
    'doc-manuscript-review',
    'doc-manuscript-review-conversion-note',
    'doc-manuscript-degradation-accept',
    'doc-manuscript-degradation-accepted',
    'doc-manuscript-commit',
    'doc-manuscript-imported',
    'doc-manuscript-completion-acknowledged',
    'doc-manuscript-completion-wording',
    'doc-manuscript-view-source',
    'doc-manuscript-record-conversion',
    'review',
    'review-contract',
    'review-acceptance',
    'commit',
    'completion-visibility-transition',
    'continuity-review',
    'legacy-review',
    'retention-review',
    'imported-marks-review',
    'imported-marks-record',
    'imported-marks-editor',
    'imported-marks-apply',
    'before-paint-review',
    'before-commit-review',
    'after-commit-review',
    'uncertain-review',
    'editor',
    ...J01_LAUNCH_LOCATIONS,
    'window-close',
    ...J01_COMPLETION_LOCATIONS,
  ]),
  'J-02': Object.freeze([
    'entry',
    'renderer-ready',
    'renderer-ready-flag',
    'renderer-ready-landing',
    'import-stage',
    // Where staging stood when its bound passed (#621).
    'import-stage-reading',
    'import-stage-parsing',
    'import-stage-recording',
    'import-stage-screen',
    'import-stage-unreadable',
    'import-review',
    'import-commit',
    'import-editor-open',
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
    'milestone-r2-ipc-diagnostic-unavailable-recovery-object-absent',
    'milestone-r2-ipc-diagnostic-unavailable-partial-object-present',
    'milestone-r2-ipc-diagnostic-unavailable-promoted-object-present',
    'milestone-r2-no-flush-invoke-recovery-object-absent',
    'milestone-r2-no-flush-invoke-partial-object-present',
    'milestone-r2-no-flush-invoke-promoted-object-present',
    'milestone-r2-flush-pending-recovery-object-absent',
    'milestone-r2-flush-pending-partial-object-present',
    'milestone-r2-flush-pending-promoted-object-present',
    'milestone-r2-flush-error-recovery-object-absent',
    'milestone-r2-flush-error-partial-object-present',
    'milestone-r2-flush-error-promoted-object-present',
    'milestone-r2-flush-result-no-save-invoke-recovery-object-absent',
    'milestone-r2-flush-result-no-save-invoke-partial-object-present',
    'milestone-r2-flush-result-no-save-invoke-promoted-object-present',
    'milestone-r2-save-pending-recovery-object-absent',
    'milestone-r2-save-pending-partial-object-present',
    'milestone-r2-save-pending-promoted-object-present',
    'milestone-r2-save-error-recovery-object-absent',
    'milestone-r2-save-error-partial-object-present',
    'milestone-r2-save-error-promoted-object-present',
    'milestone-r2-save-result-renderer-not-r2-recovery-object-absent',
    'milestone-r2-save-result-renderer-not-r2-partial-object-present',
    'milestone-r2-save-result-renderer-not-r2-promoted-object-present',
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
    'j14-composition-focus',
    'j14-ime-command-guard',
    'j14-ime-command-guard-window-unfocused',
    'j14-ime-command-guard-editor-unfocused',
    'j14-ime-command-guard-composition-absent',
    'j14-ime-command-guard-command-ran',
    'j14-ime-command-guard-status-missing',
    'j14-keyboard-search-focus',
    // Issue #579: which precondition of ⌘F was missing, or what the command did instead.
    'j14-keyboard-search-focus-composition-open',
    'j14-keyboard-search-focus-window-unfocused',
    'j14-keyboard-search-focus-editor-unfocused',
    'j14-keyboard-search-focus-guard-announced',
    // Issue #591: the ⌘F keydown never reached the page, or reached it without the platform's modifier.
    'j14-keyboard-search-focus-key-not-received',
    'j14-keyboard-search-focus-modifier-missing',
    'j14-keyboard-search-focus-no-focus-move',
    'j14-visible-focus',
    'j14-keyboard-focus-keeps-window',
    'j14-keyboard-focus-keeps-window-precondition',
    'j14-keyboard-focus-keeps-window-paged',
    // Issue #604: what the focus found when nothing was revealed.
    'j14-keyboard-focus-keeps-window-no-reveal-window-unfocused',
    'j14-keyboard-focus-keeps-window-no-reveal-caret-elsewhere',
    'j14-keyboard-focus-keeps-window-no-reveal-caret-outside',
    'j14-keyboard-focus-keeps-window-no-reveal-caret-none',
    'j14-keyboard-focus-keeps-window-no-reveal-moved-back',
    'j14-keyboard-focus-keeps-window-no-reveal',
    'j14-top-edge-pages-back-once',
    'j14-top-edge-pages-back-once-bounced',
    'j14-keyboard-window-crossing',
    'j14-keyboard-window-crossing-went-backward',
    'j14-fine-scroll-window-crossing',
    'j14-zoom-200-reflow',
    'j14-forced-colors',
    'completion-browser-close',
    'completion-fixture-survived',
    'completion-cleanup',
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
    'knowledge-guidelines',
    'knowledge-guideline-import',
    'j14-knowledge-keyboard',
    'j14-knowledge-reflow-forced-colors',
    'knowledge-guideline-restart',
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
    // Issue #418 (S72): the Task Drawer beside the card — its two modes, the keyboard, the column at
    // 1120 px and the overlay below, 200% and forced colours, and the one side slot it shares with 导航.
    'drawer-plan-compact',
    // Issue #420 (S74a): the authorization bar in the drawer's footer, record-only for this Task (ADR 0055).
    'drawer-bar-record-only',
    'drawer-plan-full',
    'drawer-keyboard',
    'drawer-push-overlay',
    'drawer-reflow-forced-colors',
    'drawer-one-slot-with-navigation',
    'cross-book-route-guard',
    // Issue #420 (S74a): 保存草稿 records nothing; the recording is the bar's 开始任务; then the way to the record.
    'drawer-save-draft',
    'authorization-recorded',
    'drawer-authorization-refresh',
    'drawer-run-link',
    'foreground-boundary-check',
    'post-authorization-edit',
    'restart-immutable',
    'drawer-restart-mode',
    'zero-activity',
  ]),
  'J-04': Object.freeze([
    'entry',
    'controller-loopback',
    'controller-imports',
    'exact-sample1',
    'renderer-ready',
    'renderer-api-boundary',
    'renderer-analysis-api',
    'renderer-zero-execution-api',
    'sample1-import',
    'sample1-import-target',
    'sample1-import-relationship',
    'sample1-import-title',
    'sample1-import-review',
    'sample1-import-completed',
    'analysis-prerequisites-unavailable',
    'artifact-revision2',
    'artifact-install',
    'artifact-enable',
    'artifact-enabled',
    'model-setup-remove',
    'model-settings-ready',
    'model-credential-saved',
    'model-credential-removed',
    'book-reopen',
    'j14-reflow-forced-colors',
    'coverage-manifest',
    // Issue #418 (S72): the plan the preparation froze, in the Task Drawer beside ②A.
    'analysis-plan-drawer',
    // Issue #420 (S74a): the drawer's authorization bar before the start and, the Run settled, after it.
    'analysis-bar-ready',
    'authorize-dispatch',
    'result-set-revision',
    'analysis-bar-started',
    'cross-unit-reduction',
    'assurance-sampling',
    'run-report',
    'return-to-range',
    'restart-immutable',
    'acknowledged-edit-stale',
    'update-controls-disclosed',
    'sync-current-prepare',
    'sync-current-dispatch',
    'sync-current-revision',
    'reanalyze-range-select',
    'reanalyze-range-prepare',
    'reanalyze-range-dispatch',
    'reanalyze-range-revision',
    'reanalyze-book-prepare',
    'reanalyze-book-dispatch',
    'reanalyze-book-revision',
    'revision-history',
    'history-open-read-only',
    'restart-history',
    'safe-retry-relaunch',
    'safe-retry-prepare',
    'safe-retry-dispatch',
    'safe-retry-adaptation',
    'plan-revision-prepare',
    'plan-revision-drift',
    // Issue #418 (S72 D8): the drift in the drawer's words; then #288's range, the one version 2 froze.
    'plan-revision-drawer-diff',
    // Issue #420 (S74a A4): a changed plan's bar offers 重新确认计划 and 查看计划修订, and no start.
    'plan-revision-bar',
    'plan-revision-stale-authorize',
    'plan-revision-revert',
    'plan-revision-reconfirm',
    'plan-revision-drawer-range',
    'plan-edit-open',
    'plan-edit-remove',
    'plan-edit-discard',
    'j14-plan-edit-keyboard',
    'plan-edit-update',
    'plan-revision-dispatch',
    'plan-revision-edit-unchanged',
    // Connectivity Wait (Issue #502): 离线, 联网后开始任务, 取消, and Reconnect Preflight admitting the Run.
    'connectivity-offline-bar',
    'connectivity-start-when-online',
    'connectivity-cancel',
    'connectivity-wait-again',
    'connectivity-online-dispatch',
    // 快速开始 (Issue #421): 设为快速开始默认…, a quick start that stops at its plan offline, one that starts, and 停用.
    'quick-start-set-rule',
    'quick-start-fallback',
    'quick-start-started',
    'quick-start-rules-page',
    'review-relaunch',
    'review-destination',
    'review-sheet',
    'review-prepare',
    // Issue #420 (S74a): the Run's one approval is the drawer bar's 开始任务.
    'review-bar-ready',
    'review-authorize',
    'review-marks-on-manuscript',
    'review-batch-apply',
    'review-ignore-with-reason',
    'review-report',
    'review-report-export',
    'review-coverage-moves',
    'review-return-to-analysis',
    'zero-activity',
  ]),
  // J-05, first slice (Issue #407): Editorial Marks. Each stage is one thing an editor does with a
  // mark, so a hosted failure names the behaviour that broke and not the Journey alone.
  'J-05': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'import-and-open',
    'selection-menu-empty',
    'selection-menu-cross-paragraph',
    'selection-menu-groups',
    'selection-menu-keys',
    'mark-highlight',
    'mark-annotation',
    'mark-editor-note',
    'mark-change-suggestion',
    'rail-lanes',
    'suggestion-decisions',
    'apply-accept-and-apply',
    'apply-reverse',
    'apply-drift-refused',
    'mark-conversions',
    'marks-follow-edits',
    'clipboard-commands',
    'j14-marks-zoom-200-reflow',
    'menu-stays-open-at-the-pane-edge',
    'menu-stays-open-at-the-pane-edge-never-opened',
    'menu-stays-open-at-the-pane-edge-closed-by-pane-scroll',
    'menu-stays-open-at-the-pane-edge-closed-by-window-resize',
    'menu-stays-open-at-the-pane-edge-closed-otherwise',
    'menu-stays-open-at-the-pane-edge-click-point-off-screen',
    'menu-stays-open-at-the-pane-edge-above-the-window',
    'menu-stays-open-at-the-pane-edge-left-of-the-window',
    'menu-stays-open-at-the-pane-edge-right-of-the-window',
    'menu-stays-open-at-the-pane-edge-pane-grew',
    'menu-stays-open-at-the-pane-edge-page-scrolls-sideways',
    'j14-marks-forced-colors',
    // The keyboard path names the precondition a step found missing, because a hosted runner says
    // nothing but the stage: the pattern `cooperative-position-*` set for J-02.
    'marks-keyboard-menu-open',
    'marks-keyboard-menu-open-window-moved',
    'marks-keyboard-menu-open-editor-read-only',
    'marks-keyboard-menu-open-no-menu',
    'marks-keyboard-menu-open-selection-menu',
    'marks-keyboard-menu-open-other-mark',
    'marks-keyboard-menu-open-unfocused',
    'marks-keyboard-menu-activate',
    'marks-keyboard-menu-activate-menu-still-open',
    'marks-keyboard-menu-activate-no-card',
    'marks-keyboard-menu-return',
    'marks-keyboard-menu-return-card-still-open',
    'marks-keyboard-menu-return-focus-elsewhere',
    'marks-settled-before-restart',
    'marks-survive-restart',
    'apply-lost-acknowledgement',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-06 (Issue #57, plan slice S22; ADR 0085): 稿件冲突 of a single 修改建议 — its three texts, the §2 line, the
  // Resolution Draft across a restart, the three ways out and a reversal's Correction Proposal. Each stage is
  // one thing an editor does or finds, so a hosted failure names the behaviour that broke.
  'J-06': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'import-and-open',
    'conflict-open',
    'conflict-three-texts',
    'safe-merge-line',
    'draft-quick-actions',
    'draft-undo-redo',
    'draft-edited-unit',
    'draft-restart',
    'new-version',
    'new-version-applied',
    'keep-current',
    'defer',
    // Issue #424 (S78): 待我处理 lists the conflict put aside, and its 解决冲突… opens 稿件冲突 of that suggestion.
    'attention-conflict-row',
    'reversal',
    'reversal-correction-applied',
    'j14-conflict-keyboard',
    'j14-conflict-zoom-200-reflow',
    'j14-conflict-forced-colors',
    'restart-keeps-every-record',
    'zero-activity',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-07 (Issue #414, plan slice S65): ⑥ 发稿 — Milestone Versions and 设为发稿版本. Each stage is one thing an
  // editor does or finds on 交付物, so a hosted failure names the behaviour that broke.
  'J-07': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'import-and-open',
    'deliverables-before-milestone',
    'milestone-needs-a-purpose',
    'milestone-first-saved',
    'milestone-changed-since',
    'milestone-second-saved',
    'milestones-listed',
    'designate-form',
    'designate-confirmed',
    'designate-repeat-unchanged',
    'change-notice-after-edit',
    'designate-older-milestone',
    'export-note-added',
    'export-open-current',
    'export-fidelity-table',
    'export-save-dialog',
    'export-approved',
    'export-receipt-recorded',
    'export-file-parsed',
    'restart-keeps-everything',
    'actuals-prompt-and-words',
    'export-cancel-creates-nothing',
    'j14-designate-keyboard',
    'j14-deliverables-zoom-200-reflow',
    'j14-deliverables-forced-colors',
    'j14-export-keyboard',
    'j14-export-zoom-200-reflow',
    'j14-export-forced-colors',
    'export-pdf',
    'export-markdown',
    // Issue #415 (S66a): 交付 · 生产文档 — a document made from the Book's source material, edited and versioned on the
    // manuscript's own surface, and 本书不做.
    'documents-source-import',
    'documents-cards',
    'document-create',
    'document-edit-and-version',
    // Issue #415 (S66c): the document's Deliverable Workflow — 开始, 完成, 跳过 and 重新打开 with their reasons.
    'document-workflow',
    'document-workflow-start',
    'document-workflow-start-focus',
    'document-workflow-complete',
    'document-workflow-skip-open',
    'document-workflow-skip-focus',
    'document-workflow-skip-unreasoned',
    'document-workflow-skip-reason',
    'document-workflow-skip-confirm',
    'document-workflow-reopen-open',
    'document-workflow-reopen-words',
    'document-workflow-reopen-confirm',
    'document-workflow-summary',
    'document-card-after-version',
    'document-not-for-this-book',
    // Issue #415 (S66b): 交付 — a Delivery Record of one saved version, its export, 交付后有修改 and 再交付….
    'document-deliver',
    'document-delivery-export',
    'document-changed-since-delivery',
    'document-redeliver',
    // Issue #416 (S67a): 图书交付包 — its conditions and routes, what it holds, v1, an unchanged repeat and v2.
    'package-conditions',
    'package-not-for-this-book',
    'package-prepare',
    'package-v2',
    // Issue #416 (S67b): v2 exported into a chosen folder, file by file with receipts, and its history.
    'package-export',
    // Issue #426 (S68a): 维护事项 — a 勘误 recorded, written and concluded, and 撤回 of the current designation.
    'maintenance-cases',
    // Issue #426 (S68b): 维护事项待处理 — a waiting 替代 in 待我处理, opened back at its case, and cleared by an 归档.
    'maintenance-attention',
    'documents-restart',
    'knowledge-exemplars',
    'zero-loopback-requests',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-09 (Issue #424, plan slice S78): 待我处理 — the cross-Book attention view, its four groups and its count,
  // made from two Books of exact `sample1`; then concurrent Book work (Issue #49, plan slice S14) over a third — two
  // Runs at once, a third start 等待运行名额, 暂停 handing its place over without taking focus, 取消任务, and each Run's
  // records kept to its own Book. Each stage is one thing an editor does or finds, so a hosted failure names the
  // behaviour that broke.
  'J-09': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'exact-sample1',
    'renderer-api-boundary',
    'entry-in-the-header',
    'first-book-import',
    'first-book-prerequisites',
    'model-credential-saved',
    'model-credential-removed',
    'first-book-blocked-run',
    'count-after-blocked',
    'second-book-launch',
    'second-book-import',
    'second-book-completed-run',
    'second-book-plan-revision',
    'attention-groups',
    'attention-count',
    'attention-writes-nothing',
    'open-blocked-run',
    'open-plan-revision',
    'open-completion',
    'j14-attention-keyboard',
    'j14-attention-zoom-200-reflow',
    'j14-attention-forced-colors',
    'concurrent-third-book',
    'concurrent-first-run',
    'concurrent-second-run',
    'concurrent-queued-run',
    'j14-queued-forced-colors',
    'concurrent-attention',
    'concurrent-pause',
    'concurrent-no-focus-theft',
    'concurrent-cancel',
    'concurrent-isolation',
    'zero-loopback-requests',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-10 (Issue #422, plan slices S76a and S76b): a Run under way — its activity card and its controls; 暂停 with
  // 正在暂停 while the range in flight finishes, 已暂停, and 续行 in the same Run; 取消任务 with its inline Cancellation
  // Impact Summary, 正在取消, and 已取消 with what it read kept; and a Run AI7 closed under, 任务已中断 · 可续行 on the
  // next launch, and 续行 to its end.
  'J-10': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'exact-sample1',
    'renderer-api-boundary',
    'book-import',
    'book-prerequisites',
    'model-credential-saved',
    'model-credential-removed',
    'run-under-way',
    'activity-card',
    'run-controls',
    'pause-requested',
    'pause-holds',
    'paused',
    'resumed',
    'cancel-impact-summary',
    'cancel-keep-running',
    'j14-cancel-keyboard',
    'cancel-confirmed',
    'cancelling-holds',
    'j14-cancelling-forced-colors',
    'cancel-settled',
    'partial-revision-kept',
    'nothing-sent-after',
    'redo-from-cancelled',
    'redo-plan-edit',
    'redo-run-completed',
    'relaunch-for-second-book',
    'second-book-import',
    'second-run-held',
    'closed-under-run',
    'relaunched-resumable',
    'resumed-after-restart',
    'third-book-import',
    'third-run-paused',
    'redo-summary',
    'redo-keep-plan',
    'j14-redo-keyboard',
    'redo-confirmed',
    'relaunch-for-clarification',
    'fourth-book-import',
    'ask-first-edit',
    'clarification-raised',
    'clarification-deferred',
    'clarification-waiting',
    'clarification-survives-restart',
    'j14-clarification-keyboard',
    'clarification-answered',
    'relaunch-for-budget',
    'fifth-book-import',
    'budget-set',
    'budget-reached',
    'budget-partial-results',
    'budget-redo',
    'j14-budget-keyboard',
    'budget-redo-completed',
    'relaunch-for-account-limit',
    'sixth-book-import',
    'account-limit-stop',
    'account-limit-resolve',
    'account-limit-resumed',
    'zero-loopback-requests',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-11 (Issue #431, plan slice S83): a Book's 作者, 责编 and 相关人 on its 工作概览, on 书库's cards, found by 书名, 作者
  // and 责编, and kept across a restart — two empty Books, no manuscript read.
  'J-11': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'renderer-api-boundary',
    'first-book-created',
    'people-empty',
    'j14-people-keyboard',
    'people-form',
    'j14-people-zoom-200-reflow',
    'j14-people-forced-colors',
    'people-saved',
    'people-unchanged',
    'second-book-created',
    'library-cards',
    'library-search',
    'restart-keeps-people',
    'zero-loopback-requests',
    'completion-browser-close',
    'completion-cleanup',
  ]),
  // J-16 (Issue #423, plan slice S77a): the 任务 panel — the Book's Tasks beside the manuscript, controlled from their cards,
  // a finished Task's result in a window beside the text, and the 回到<位置> chip a jump leaves.
  'J-16': Object.freeze([
    'entry',
    'controller-loopback-sentinel',
    'controller-imports',
    'exact-sample1',
    'renderer-api-boundary',
    'book-import',
    'book-prerequisites',
    'model-credential-saved',
    'model-credential-removed',
    'panel-open',
    'panel-prepare',
    'panel-start',
    'panel-pause',
    'panel-resume',
    'panel-compose-update',
    'panel-cancel',
    'result-window',
    'result-jump',
    'chip-persists',
    'chip-return',
    'chip-return-state-unavailable',
    'chip-return-retained-busy',
    'chip-return-retained-ready',
    'chip-return-target-missing',
    'chip-return-status-replaced',
    'chip-return-late-completion',
    'analysis-jump-chip',
    'j14-panel-keyboard',
    'j14-panel-zoom-200-reflow',
    'j14-panel-forced-colors',
    'restart-keeps-tasks',
    'zero-loopback-requests',
    'completion-browser-close',
    'completion-cleanup',
  ]),
});

// ---- Local-only manuscript material and disclosed skips (ADR 0079 §5) -------------------------

// Slice S88 (#438) narrowed the repository admission to exact `sample1.docx`. A scenario whose
// subject only one of the five withdrawn files can be — legacy binary `.doc` intake, for which no
// generator exists — reads the file where the developer keeps it and is skipped everywhere else,
// which includes every hosted occurrence: `docs/agents/ci-test-boundaries.md` admits no untracked
// source, personal path, or ambient payload as a Gate input, so the absence is the normal case
// there. A skipped scenario is never silently absent: the runner names it from the bounded
// vocabulary below, and each Gate occurrence prints it beside the Journey's result. The plain-JS
// twin of `tests/support/local-only-manuscripts.ts`, with the same environment variable.
const LOCAL_SAMPLEBOOKS_ENV = 'AI7_LOCAL_SAMPLEBOOKS';

/**
 * Where a developer keeps the local-only files: `AI7_LOCAL_SAMPLEBOOKS` when it names an absolute
 * directory, and otherwise the checkout's own `SampleBooks/`, which now ignores these exact names.
 */
function localManuscriptRoot() {
  const declared = process.env[LOCAL_SAMPLEBOOKS_ENV];
  return declared !== undefined && declared.length > 0 && isAbsolute(declared)
    ? declared
    : resolve(ROOT, 'SampleBooks');
}

/** The one legacy binary `.doc`, by the exact name and byte count `SampleBooks/README.md` records. */
export const LOCAL_ONLY_DOC = Object.freeze({
  name: '3天兽（定稿395870字)##＊.doc',
  bytes: 1_173_504,
});

/** The absolute path the developer's copy would occupy. Reading it is a local-only act. */
export function localManuscriptPath(manuscript) {
  return join(localManuscriptRoot(), manuscript.name);
}

/**
 * True only when a regular file of exactly the recorded size sits at that path. Size alone decides
 * whether the scenario runs; the scenario itself still proves identity by digest before launching.
 */
export function localManuscriptAvailable(manuscript) {
  try {
    const metadata = statSync(localManuscriptPath(manuscript));
    return metadata.isFile() && metadata.size === manuscript.bytes;
  } catch {
    return false;
  }
}

/** Bounded per-Journey disclosure vocabulary: no path, name, or manuscript-derived string. */
export const JOURNEY_DISCLOSURES = Object.freeze({
  'J-01': Object.freeze(['doc-manuscript-local-only-absent']),
});
const DISCLOSURE_PREFIX = 'DISCLOSED_SKIP';

export function isAdmittedDisclosure(journey, disclosure) {
  return JOURNEY_DISCLOSURES[journey]?.includes(disclosure) === true;
}

/** Name a skipped scenario on the runner's own stdout, where every orchestration can read it. */
export function discloseJourneySkip(journey, disclosure) {
  if (!isAdmittedDisclosure(journey, disclosure)) {
    throw new TypeError('Journey disclosure is not admitted.');
  }
  console.log(`${DISCLOSURE_PREFIX}/${journey}/${disclosure}`);
}

/** The admitted disclosures a finished journey process named, in the order it named them. */
export function collectJourneyDisclosures(result, journey) {
  const prefix = `${DISCLOSURE_PREFIX}/${journey}/`;
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : null))
    .filter((disclosure) => disclosure !== null && isAdmittedDisclosure(journey, disclosure));
}

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

function isBrowserConnected(browser) {
  return typeof browser.isConnected !== 'function' || browser.isConnected();
}

/** Keep exactly one `disconnected` listener per browser however many requests are in flight. */
function watchBrowserDisconnect(browser, onDisconnected) {
  if (!isBrowserConnected(browser)) {
    onDisconnected();
    return () => undefined;
  }
  let watcher = browserDisconnectWatchers.get(browser);
  if (watcher === undefined) {
    watcher = { waiters: new Set() };
    browser.on('disconnected', () => {
      for (const waiter of [...watcher.waiters]) waiter();
    });
    browserDisconnectWatchers.set(browser, watcher);
  }
  watcher.waiters.add(onDisconnected);
  return () => watcher.waiters.delete(onDisconnected);
}

/**
 * `browser.newBrowserCDPSession()` yields a child CDP session. Playwright's connection close
 * disposes only the root session, so a request that is still in flight when the product process
 * exits is never rejected and the caller waits forever. Bound every child-session request on the
 * browser's own `disconnected` event, after a short grace period that lets a real protocol
 * rejection or a late response win whenever Playwright still produces one, so each runner reaches
 * its existing classification instead of hanging.
 *
 * `disconnectError` is the runner's own rejection for an abandoned request. J-01 and J-12 classify
 * on that error's identity, so they also set `coerceRejectionAfterDisconnect`, which reports a
 * rejection arriving once the browser is already gone as that same error.
 */
export function settleOnBrowserDisconnect(browser, request, options = {}) {
  const {
    disconnectError,
    coerceRejectionAfterDisconnect = false,
    graceMs = CDP_DISCONNECT_SETTLE_MS,
  } = options;
  const abandoned = () => disconnectError ?? new Error(CDP_REQUEST_ABANDONED);
  return new Promise((resolve, reject) => {
    let settled = false;
    let graceTimer;
    let release = () => undefined;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      release();
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      settle(value);
    };
    const onDisconnected = () => {
      if (settled || graceTimer !== undefined) return;
      graceTimer = setTimeout(() => finish(reject, abandoned()), graceMs);
    };
    release = watchBrowserDisconnect(browser, onDisconnected);
    request.then(
      (value) => finish(resolve, value),
      (error) => finish(
        reject,
        coerceRejectionAfterDisconnect && !isBrowserConnected(browser) ? abandoned() : error,
      ),
    );
  });
}

/**
 * Race a CDP operation against the deadline its calling step already owns, so one deadline policy
 * serves every runner that bounds a child-session request.
 *
 * The runner keeps both identities this reports. `timeoutError` is the runner's own rejection for an
 * operation that outlives the deadline, whose identity the runner compares. `onDeadlineExpired` is
 * how the runner fails a deadline that is already spent before the operation starts, so that path
 * keeps reporting the runner's own location; a caller that supplies none is rejected with
 * `timeoutError`. The operation is bound before either decision so an abandoned request never
 * surfaces as an unhandled rejection, and the timer is unref'd and cleared on both settle paths so
 * it never holds the runner open.
 */
export async function awaitWithinDeadline(operation, deadline, options = {}) {
  const { timeoutError, onDeadlineExpired } = options;
  operation.catch(() => undefined);
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    if (onDeadlineExpired !== undefined) return onDeadlineExpired();
    throw timeoutError;
  }
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError), remaining);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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

/**
 * The readiness trace a failed Journey printed (Issue #518), without its prefix: which startup step the product reached
 * and when, validated as content-free, or `null`. A passing run's output is never read for it.
 */
export function collectReadinessTrace(result, journey) {
  return readReadinessTrace(result.stderr, journey);
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
