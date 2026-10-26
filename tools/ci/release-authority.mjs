// GitHub PR comments are the existing evidence owner; this module stores no dispatch state.
// A maintain/admin publisher attests the actual Orca records. Candidate prose is never authority.
export const RECEIPT_PREFIX = 'AI7_ORCA_V1\n';
const SHA = /^[a-f0-9]{40}$/u;
const WAVE = /^codex\/integration-[a-z0-9][a-z0-9-]*$/u;
const SLICE = /^codex\/[1-9][0-9]*-[a-z0-9-]+$/u;
const LADDER = ['doctor', 'bootstrap', 'check', 'test', 'service', 'build', 'e2e:all'];
// ADR 0097: the hosted full Gate and every nightly candidate run on Windows Server 2025 only. A macOS
// job is admitted again only when a new Owner decision re-adds it here and in the workflows.
const GATE_PLATFORMS = ['Windows Server 2025 x64 CI'];
// A Windows publisher may send CRLF. A trusted comment that starts with the marker in any other
// shape is a malformed receipt, never ordinary prose: ignoring it could silently drop a revoke.
const RECEIPT_MARK = 'AI7_ORCA_V1';
const RECEIPT_HEADER = /^AI7_ORCA_V1\r?\n/u;

/** Whether a comment claims to be a receipt, so its publisher must be authenticated. */
export function receiptCandidate(body) {
  return typeof body === 'string' && body.startsWith(RECEIPT_MARK);
}

export function candidateKind(record) {
  if (record.baseRefName === 'dev' && WAVE.test(record.headRefName ?? '')) return 'integration';
  if (WAVE.test(record.baseRefName ?? '') && SLICE.test(record.headRefName ?? '')) return 'slice';
  return null;
}

export function queueTarget(target) {
  return target === 'dev' || WAVE.test(target ?? '');
}

/** A complete diff, supplied by trusted Git/API inspection, determines the docs-only exception. */
export function documentationOnly(files) {
  return Array.isArray(files) && files.length > 0 && files.every((file) => typeof file.path === 'string' && file.path.endsWith('.md'));
}

function queueInfrastructureOnly(files) {
  const owners = new Set(['tools/nightly-queue.mjs', 'tools/orca-release.mjs',
    'tools/ci/queue.mjs', 'tools/ci/release-authority.mjs',
    'tests/unit/nightly-queue.test.ts', 'tests/unit/orca-release.test.ts',
    '.github/workflows/e2e.yml', '.github/workflows/e2e-nightly.yml',
    '.github/workflows/e2e-nightly-queue.yml', '.github/workflows/e2e-candidate.yml']);
  return Array.isArray(files) && files.length > 0 && files.every((file) => file.path.endsWith('.md') || owners.has(file.path));
}

function identity(binding) {
  return binding !== null && typeof binding === 'object' &&
    /^task_[a-z0-9]+$/u.test(binding.taskId ?? '') &&
    /^ctx_[a-z0-9]+$/u.test(binding.dispatchId ?? '') &&
    /^term_[a-z0-9-]+$/u.test(binding.terminal ?? '') &&
    typeof binding.workspace === 'string' && binding.workspace.length > 0 &&
    typeof binding.runtime === 'string' && binding.runtime.length > 0;
}

function coordinator(binding) {
  return binding !== null && typeof binding === 'object' &&
    /^run_[a-z0-9]+$/u.test(binding.runId ?? '') &&
    /^term_[a-z0-9-]+$/u.test(binding.terminal ?? '') &&
    typeof binding.workspace === 'string' && binding.workspace.length > 0 &&
    typeof binding.runtime === 'string' && binding.runtime.length > 0;
}

function effective(binding) {
  if (!identity(binding) || binding.verified !== true || binding.subscriptionActive !== true || binding.paidFallback !== false) return false;
  if (binding.channel === 'ChatGPT') return binding.client === 'Codex' && ['gpt-6.1-sol', 'gpt-6-astra'].includes(binding.model);
  if (binding.channel === 'Claude') return binding.client === 'Claude Code' && ['claude-sonnet-5-5', 'claude-opus-5-5'].includes(binding.model);
  return binding.channel === 'OpenCode Go' && binding.client === 'OpenCode' &&
    ['opencode-go/deepseek-v4.1-flash', 'opencode-go/glm-5.3-flash'].includes(binding.model);
}

function effectiveForTier(tier, binding) {
  if (!effective(binding)) return false;
  const spec = `${binding.channel}/${binding.model}/${binding.effort}`;
  if (tier === 'T1') return (binding.channel === 'OpenCode Go' && binding.effort === 'low') ||
    ['ChatGPT/gpt-6.1-sol/medium', 'ChatGPT/gpt-6.1-sol/high', 'Claude/claude-sonnet-5-5/high', 'Claude/claude-opus-5-5/high'].includes(spec);
  if (tier === 'T2') return ['ChatGPT/gpt-6.1-sol/medium', 'ChatGPT/gpt-6.1-sol/high', 'ChatGPT/gpt-6.1-sol/xhigh',
    'Claude/claude-sonnet-5-5/high', 'Claude/claude-opus-5-5/high', 'Claude/claude-opus-5-5/xhigh'].includes(spec);
  if (tier === 'T3') return ['ChatGPT/gpt-6.1-sol/high', 'ChatGPT/gpt-6.1-sol/xhigh', 'ChatGPT/gpt-6-astra/xhigh',
    'Claude/claude-opus-5-5/high', 'Claude/claude-opus-5-5/xhigh'].includes(spec);
  return false;
}

/**
 * Under the 2026-10-26 Owner amendment to ADR 0089, mandatory cross-provider review is retired:
 * a slice may run with a single coding worker (`reviewer` omitted/null) or with an optional reviewer
 * on any valid subscription channel. Repair is gated strictly on E2E and CI test failures.
 */
export function approvedPair(tier, worker, reviewer = null) {
  if (!effectiveForTier(tier, worker)) return false;
  if (reviewer === null || reviewer === undefined) return true;
  return effectiveForTier(tier, reviewer);
}

/** Decode only unedited, authenticated comments. Malformed trusted receipts fail closed. */
export function roleReceipts(comments) {
  const receipts = [];
  for (const comment of comments) {
    if (comment.trusted !== true || !receiptCandidate(comment.body)) continue;
    if (!Number.isSafeInteger(comment.id) || comment.updated_at !== comment.created_at) throw new Error('edited-role-receipt');
    const header = RECEIPT_HEADER.exec(comment.body);
    if (header === null) throw new Error('malformed-role-receipt');
    let value;
    try { value = JSON.parse(comment.body.slice(header[0].length)); } catch { throw new Error('malformed-role-receipt'); }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('malformed-role-receipt');
    receipts.push({ ...value, id: comment.id, publisher: comment.user.login, at: comment.created_at });
  }
  return receipts.sort((left, right) => left.id - right.id);
}

function matches(receipt, candidate) {
  return receipt.head === candidate.headRefOid && receipt.base === candidate.baseRefOid &&
    receipt.target === candidate.baseRefName && SHA.test(receipt.head ?? '') && SHA.test(receipt.base ?? '');
}

function localTests(tests, candidate) {
  if (tests?.conclusion !== 'success' || tests.head !== candidate.headRefOid || tests.base !== candidate.baseRefOid) return false;
  if (documentationOnly(candidate.files)) return Array.isArray(tests.checks) &&
    ['links', 'directives', 'scenarios', 'git diff --check'].every((check) => tests.checks.includes(check));
  if (queueInfrastructureOnly(candidate.files) && Array.isArray(tests.checks) &&
      ['pnpm run check', 'git diff --check'].every((check) => tests.checks.includes(check)) &&
      ['pnpm test', 'pnpm exec vitest run tests/unit/nightly-queue.test.ts tests/unit/orca-release.test.ts'].some((check) => tests.checks.includes(check))) return true;
  return ['ai7-testbed-01', 'ai7-testbed-02'].includes(tests.guest) &&
    Array.isArray(tests.layers) && LADDER.every((layer, index) => tests.layers[index] === layer) &&
    tests.layers.length === LADDER.length;
}

/** A release refers to the latest completion and current assignment; no older green fallback. */
export function mergeAuthorization(candidate, receipts) {
  const deny = (reason) => ({ allowed: false, reason });
  const kind = candidateKind(candidate);
  if (kind === null) return deny('unsupported-target');
  if (candidate.isDraft !== false || candidate.state !== 'OPEN') return deny('not-ready');
  const assignment = receipts.filter((entry) => entry.kind === 'assignment').at(-1);
  if (!assignment || assignment.repo !== candidate.repo || assignment.pr !== candidate.number ||
      assignment.target !== candidate.baseRefName || assignment.source !== candidate.headRefName ||
      assignment.route !== kind || !coordinator(assignment.commander)) return deny('missing-assignment');
  const events = receipts.filter((entry) => entry.id > assignment.id);
  if (events.some((entry) => !['handoff', 'complete', 'release', 'revoke'].includes(entry.kind) || entry.assignment !== assignment.id)) return deny('contradictory-receipts');
  if (events.some((entry) => entry.publisher !== assignment.publisher)) return deny('contradictory-publisher');
  if (events.some((entry) => entry.kind === 'revoke')) return deny('revoked');
  if (kind === 'slice' && (!approvedPair(assignment.class, assignment.worker, assignment.reviewer ?? null) ||
      assignment.commander.terminal === assignment.worker.terminal ||
      (assignment.reviewer && assignment.commander.terminal === assignment.reviewer.terminal))) return deny('unsupported-binding');
  const complete = events.filter((entry) => entry.kind === 'complete').at(-1);
  const release = events.filter((entry) => entry.kind === 'release').at(-1);
  if (!complete || !matches(complete, candidate) || !localTests(complete.tests, candidate)) return deny('missing-current-completion');
  if (kind === 'slice') {
    const handoff = events.filter((entry) => entry.kind === 'handoff').at(-1);
    if (handoff === undefined) {
      // Single-writer / manual per-Issue flow: the assigned worker completes directly once E2E/CI pass.
      if (complete.dispatch !== assignment.worker.dispatchId || complete.writer !== assignment.worker.dispatchId) return deny('invalid-handoff');
    } else {
      // Legacy Worker -> Reviewer handoff flow remains supported for historical and two-agent slices.
      if (!assignment.reviewer || handoff.id >= complete.id || complete.handoff !== handoff.id ||
          handoff.from !== assignment.worker.dispatchId || handoff.to !== assignment.reviewer.dispatchId ||
          handoff.workerReleased !== true || handoff.reviewerAcknowledged !== true ||
          !SHA.test(handoff.incomingHead ?? '') || !SHA.test(handoff.base ?? '') ||
          complete.dispatch !== assignment.reviewer.dispatchId || complete.writer !== assignment.reviewer.dispatchId) return deny('invalid-handoff');
    }
  } else if (complete.coordinator !== assignment.commander.terminal || complete.writer !== assignment.commander.terminal ||
      !Array.isArray(complete.slices) || complete.slices.length === 0 ||
      new Set(complete.slices.map((slice) => slice.pr)).size !== complete.slices.length ||
      complete.slices.some((slice) => !Number.isSafeInteger(slice.pr) || slice.pr <= 0 ||
        !Number.isSafeInteger(slice.completion) || !Number.isSafeInteger(slice.release) || !SHA.test(slice.merge ?? ''))) return deny('missing-slice-closures');
  if (!release || release.id <= complete.id || release.completion !== complete.id ||
      release.coordinator !== assignment.commander.terminal || release.runId !== assignment.commander.runId || release.writerReleased !== true ||
      !matches(release, candidate)) return deny('missing-current-release');
  if (!documentationOnly(candidate.files) && (!Number.isSafeInteger(release.gateRun) || release.gateRun <= 0 ||
      !SHA.test(release.testedCommit ?? ''))) return deny('missing-hosted-test-reference');
  return { allowed: true, reason: 'released', assignment, complete, release };
}

// The trusted projection jobs publish authority; they are not test evidence and may legitimately
// finish after the release they read.
const PROJECTION_JOBS = new Set(['Publish E2E Functional Gate result', 'Refresh existing Gate authorization']);

/** The actual hosted result, separate from role authority and from any receipt's claim. */
export function hostedGatePassed({ run, jobs, pr, candidate, head, base, docs = false, currentRun, candidateRefHead }) {
  if (!SHA.test(run?.head_sha ?? '') || run.repository?.full_name === undefined) return false;
  if (run.path === '.github/workflows/e2e.yml' && run.event === 'pull_request_target') {
    return run.status === 'completed' && ['success', 'failure'].includes(run.conclusion) &&
      run.display_title === `E2E Functional Gate · ${head} · ${base}` &&
      jobs.some((job) => job.name === 'Route E2E' && job.status === 'completed' && job.conclusion === 'success') &&
      jobs.some((job) => job.name === 'J-08 + J-12 + J-15 + J-03 + J-04 (Windows Server 2025 x64 CI)' &&
        job.status === 'completed' && (job.conclusion === 'success' || (docs && job.conclusion === 'skipped'))) &&
      jobs.every((job) => PROJECTION_JOBS.has(job.name) || ['success', 'skipped'].includes(job.conclusion));
  }
  if (run.head_branch !== 'dev') return false;
  if (run.path === '.github/workflows/e2e-nightly.yml' && run.event === 'workflow_dispatch') {
    const gateJobs = jobs.filter((job) => GATE_PLATFORMS.some((label) => job.name.includes(`(${label})`)));
    return run.status === 'completed' && run.conclusion === 'success' &&
      run.display_title === `E2E Nightly Full Gate · ${candidate}` &&
      gateJobs.length === GATE_PLATFORMS.length &&
      GATE_PLATFORMS.every((label) => gateJobs.some((job) => job.name.includes(`(${label})`))) &&
      jobs.every((job) => job.status === 'completed' && job.conclusion === 'success');
  }
  if (run.path !== '.github/workflows/e2e-nightly-queue.yml' || !['schedule', 'workflow_dispatch'].includes(run.event) ||
      run.status !== 'in_progress' || String(run.id) !== String(currentRun) || candidateRefHead !== candidate) return false;
  const platformJobs = jobs.filter((job) => job.name.startsWith(`Candidate #${pr} / `) &&
    GATE_PLATFORMS.some((label) => job.name.endsWith(`(${label})`)));
  return platformJobs.length === GATE_PLATFORMS.length &&
    GATE_PLATFORMS.every((label) => platformJobs.some((job) => job.name.endsWith(`(${label})`))) &&
    platformJobs.every((job) => job.status === 'completed' && job.conclusion === 'success');
}

export function testsPrecedeRelease(jobs, releasedAt) {
  const at = Date.parse(releasedAt);
  const tests = jobs.filter((job) => !PROJECTION_JOBS.has(job.name));
  return Number.isFinite(at) && tests.some((job) => job.conclusion === 'success') &&
    tests.every((job) => job.conclusion !== 'success' ||
      (Number.isFinite(Date.parse(job.completed_at)) && Date.parse(job.completed_at) <= at));
}
