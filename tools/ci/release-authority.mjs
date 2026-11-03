// Gate evidence is actual build/test output, independent of dispatch records or coding models.
const SHA = /^[a-f0-9]{40}$/u;
// ADR 0097: the standing Gate runs on Windows only.
const GATE_PLATFORMS = ['Windows Server 2025 x64 CI'];
const FULL_JOURNEYS = 'J-01 + J-02 + J-08 + J-12 + J-15 + J-03 + J-04 + J-05 + J-06 + J-07 + J-09 + J-10 + J-11 + J-16 + J-13';
export const FULL_GATE_RESOLVE_JOB = 'Resolve exact Full Gate pull request';
export const GATE_PUBLISH_JOB = 'Publish E2E Functional Gate result';

export function fullGateRunTitle(pr, head, base) {
  return `E2E Nightly Full Gate · ${head} · PR ${pr} · ${base}`;
}

/**
 * The existing full Journey job, bound by a manually dispatched reviewed workflow revision to
 * an exact PR head/base. While publishing, only that same in-progress occurrence may be read;
 * later consumers require the completed successful occurrence. No candidate output is authority.
 */
export function manualFullGatePassed({ run, jobs, pr, head, base, currentRun, controlSha }) {
  if (!Number.isSafeInteger(pr) || pr <= 0 || !SHA.test(head ?? '') || !SHA.test(base ?? '') ||
      !SHA.test(run?.head_sha ?? '') || typeof run.head_branch !== 'string' || run.head_branch.trim() === '' ||
      run.path !== '.github/workflows/e2e-nightly.yml' || run.event !== 'workflow_dispatch' ||
      run.display_title !== fullGateRunTitle(pr, head, base)) return false;
  const completed = run.status === 'completed' && run.conclusion === 'success';
  const publishing = run.status === 'in_progress' && run.conclusion == null &&
    String(run.id) === String(currentRun) && SHA.test(controlSha ?? '') && run.head_sha === controlSha;
  if (!completed && !publishing) return false;
  if (controlSha !== undefined && run.head_sha !== controlSha) return false;
  if (jobs.some((job) => String(job.run_id) !== String(run.id))) return false;
  const full = jobs.filter((job) => GATE_PLATFORMS.some((label) => job.name === `${FULL_JOURNEYS} (${label})`));
  return full.length === GATE_PLATFORMS.length &&
    GATE_PLATFORMS.every((label) => full.some((job) => job.name === `${FULL_JOURNEYS} (${label})`)) &&
    jobs.some((job) => job.name === FULL_GATE_RESOLVE_JOB && job.status === 'completed' && job.conclusion === 'success') &&
    jobs.every((job) => (publishing && job.name === GATE_PUBLISH_JOB) || (job.status === 'completed' && job.conclusion === 'success'));
}

// Branch names are conventions. Main promotion remains a separately authorized action.
export function queueTarget(target) {
  return typeof target === 'string' && target.length > 0 && target !== 'main';
}

/** A complete diff, supplied by trusted Git/API inspection, determines the docs-only exception. */
export function documentationOnly(files) {
  return Array.isArray(files) && files.length > 0 && files.every((file) => typeof file.path === 'string' && file.path.endsWith('.md'));
}

/** Project only the actual job outcome; a skipped Journey is valid only for a complete docs diff. */
export function gateResultPassed(result, docs) {
  return result === 'success' || (docs && result === 'skipped');
}

/** The actual successful hosted build/Journey jobs for the exact candidate. */
export function hostedGatePassed({ run, jobs, pr, candidate, head, base, docs = false, currentRun, candidateRefHead }) {
  if (!SHA.test(run?.head_sha ?? '') || run.repository?.full_name === undefined) return false;
  if (run.path === '.github/workflows/e2e.yml' && run.event === 'pull_request_target') {
    return run.status === 'completed' && run.conclusion === 'success' &&
      run.display_title === `E2E Functional Gate · ${head} · ${base}` &&
      jobs.some((job) => job.name === 'Route E2E' && job.status === 'completed' && job.conclusion === 'success') &&
      jobs.some((job) => job.name === 'J-08 + J-12 + J-15 + J-03 + J-04 (Windows Server 2025 x64 CI)' &&
        job.status === 'completed' && (job.conclusion === 'success' || (docs && job.conclusion === 'skipped'))) &&
      jobs.every((job) => job.name === 'Publish E2E Functional Gate result' || ['success', 'skipped'].includes(job.conclusion));
  }
  if (candidate === head && manualFullGatePassed({ run, jobs, pr, head, base })) return true;
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
