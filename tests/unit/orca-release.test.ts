import { describe, expect, it } from 'vitest';

const release = await import(new URL('../../tools/orca-release.mjs', import.meta.url).href) as {
  hostedGatePassed: (input: Record<string, unknown>) => boolean;
  queueTarget: (target: unknown) => boolean;
  gateResultPassed: (result: string, docs: boolean) => boolean;
};
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const CORRECTED = 'c'.repeat(40);

describe('test-result admission without dispatch ceremony (#1280)', () => {
  it('accepts custom development targets and keeps main promotion separate', () => {
    for (const target of ['dev', 'codex/integration-23', 'beta/argon', 'owner-selected-target']) {
      expect(release.queueTarget(target)).toBe(true);
    }
    for (const target of ['main', '', null, undefined]) expect(release.queueTarget(target)).toBe(false);
  });

  it('accepts passing jobs without receipts and fails actual test/build failures', () => {
    expect(release.gateResultPassed('success', false)).toBe(true);
    expect(release.gateResultPassed('skipped', true)).toBe(true);
    for (const result of ['failure', 'cancelled', 'timed_out', 'skipped', 'reused', '']) {
      expect(release.gateResultPassed(result, false)).toBe(false);
    }
    expect(release.gateResultPassed('failure', true)).toBe(false);
  });
});

describe('real hosted Gate results independent of coding-agent conventions', () => {
  const run = { id: 100, repository: { full_name: 'owner/repo' }, head_branch: 'dev', head_sha: BASE,
    path: '.github/workflows/e2e-nightly-queue.yml', event: 'schedule', status: 'in_progress' };
  // ADR 0097: the queue and the full Gate have one Windows job; a macOS job is neither required nor counted.
  const jobs = [{ name: 'Candidate #806 / Journeys (Windows Server 2025 x64 CI)', status: 'completed', conclusion: 'success' }];
  const macJob = { name: 'Candidate #806 / Journeys (macOS 15 arm64)', status: 'completed', conclusion: 'success' };
  const input = { run, jobs, pr: 806, candidate: HEAD, currentRun: '100', candidateRefHead: HEAD };
  it('requires exactly the Windows job in the current trusted serial queue occurrence', () => {
    expect(release.hostedGatePassed(input)).toBe(true);
    expect(release.hostedGatePassed({ ...input, jobs: [] })).toBe(false);
    expect(release.hostedGatePassed({ ...input, jobs: [macJob] })).toBe(false);
    expect(release.hostedGatePassed({ ...input, jobs: [jobs[0], jobs[0]] })).toBe(false);
    expect(release.hostedGatePassed({ ...input, jobs: [{ ...jobs[0], conclusion: 'failure' }] })).toBe(false);
    expect(release.hostedGatePassed({ ...input, jobs: [{ ...jobs[0], status: 'in_progress', conclusion: null }] })).toBe(false);
    expect(release.hostedGatePassed({ ...input, candidateRefHead: CORRECTED })).toBe(false);
    expect(release.hostedGatePassed({ ...input, currentRun: '101' })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: { ...run, head_branch: 'codex/806-orca-ci' } })).toBe(false);
  });
  it('accepts the existing exact-ref full Gate and rejects another tested commit', () => {
    const nightly = { ...run, path: '.github/workflows/e2e-nightly.yml', event: 'workflow_dispatch',
      status: 'completed', conclusion: 'success', display_title: `E2E Nightly Full Gate · ${HEAD}` };
    expect(release.hostedGatePassed({ ...input, run: nightly })).toBe(true);
    for (const incomplete of [[], [macJob], [jobs[0], jobs[0]],
      [{ ...jobs[0], conclusion: 'failure' }], [{ ...jobs[0], status: 'in_progress', conclusion: null }]]) {
      expect(release.hostedGatePassed({ ...input, run: nightly, jobs: incomplete })).toBe(false);
    }
    expect(release.hostedGatePassed({ ...input, run: nightly, candidate: CORRECTED })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: { ...nightly, conclusion: 'cancelled' } })).toBe(false);
  });
  it('accepts the existing fast Gate only for its exact tested head/base', () => {
    const fast = { ...run, path: '.github/workflows/e2e.yml', event: 'pull_request_target',
      status: 'completed', conclusion: 'success', display_title: `E2E Functional Gate · ${HEAD} · ${BASE}` };
    const fastJobs = [{ name: 'Route E2E', status: 'completed', conclusion: 'success' },
      { name: 'J-08 + J-12 + J-15 + J-03 + J-04 (Windows Server 2025 x64 CI)', status: 'completed', conclusion: 'success' },
      { name: 'Publish E2E Functional Gate result', status: 'completed', conclusion: 'success' }];
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: fastJobs, head: HEAD, base: BASE })).toBe(true);
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
      const failedJobs = [fastJobs[0], { ...fastJobs[1], conclusion }, fastJobs[2]];
      expect(release.hostedGatePassed({ ...input, run: fast, jobs: failedJobs, head: HEAD, base: BASE })).toBe(false);
    }
    expect(release.hostedGatePassed({ ...input, run: { ...fast, conclusion: 'failure' }, jobs: fastJobs,
      head: HEAD, base: BASE })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: [fastJobs[0], { ...fastJobs[1], conclusion: 'skipped' }, fastJobs[2]],
      head: HEAD, base: BASE })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: [fastJobs[0], { ...fastJobs[1], conclusion: 'skipped' }, fastJobs[2]],
      head: HEAD, base: BASE, docs: true })).toBe(true);
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: fastJobs, head: HEAD, base: CORRECTED })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: { ...fast, event: 'pull_request' }, jobs: fastJobs, head: HEAD, base: BASE })).toBe(false);
  });
});
