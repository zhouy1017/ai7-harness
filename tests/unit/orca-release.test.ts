import { describe, expect, it } from 'vitest';

type Receipt = Record<string, unknown> & { id: number; kind: string; publisher: string };
const release = await import(new URL('../../tools/orca-release.mjs', import.meta.url).href) as {
  RECEIPT_PREFIX: string;
  approvedPair: (tier: string, worker: Record<string, unknown>, reviewer: Record<string, unknown>) => boolean;
  roleReceipts: (comments: Record<string, unknown>[]) => Receipt[];
  mergeAuthorization: (candidate: Record<string, unknown>, receipts: Receipt[]) => { allowed: boolean; reason: string };
  candidateKind: (candidate: Record<string, unknown>) => string | null;
  hostedGatePassed: (input: Record<string, unknown>) => boolean;
  testsPrecedeRelease: (jobs: Record<string, unknown>[], at: string) => boolean;
};

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const CORRECTED = 'c'.repeat(40);
const worker = {
  taskId: 'task_worker', dispatchId: 'ctx_worker', terminal: 'term_worker', workspace: 'repo::worker', runtime: 'runtime',
  channel: 'ChatGPT', client: 'Codex', model: 'gpt-6.1-sol', effort: 'high',
  verified: true, subscriptionActive: true, paidFallback: false,
};
const reviewer = { ...worker, taskId: 'task_reviewer', dispatchId: 'ctx_reviewer', terminal: 'term_reviewer',
  channel: 'Claude', client: 'Claude Code', model: 'claude-opus-5-5', effort: 'xhigh' };
const commander = { runId: 'run_wave', terminal: 'term_commander', workspace: 'repo::commander', runtime: 'runtime' };
const candidate = { repo: 'owner/repo', number: 806, state: 'OPEN', isDraft: false,
  headRefName: 'codex/806-orca-ci', baseRefName: 'codex/integration-806', headRefOid: HEAD, baseRefOid: BASE };
const tests = { head: HEAD, base: BASE, guest: 'ai7-testbed-02', conclusion: 'success',
  layers: ['doctor', 'bootstrap', 'check', 'test', 'service', 'build', 'e2e:all'] };
const event = (id: number, kind: string, value: Record<string, unknown>): Receipt => ({ id, kind, publisher: 'maintainer', ...value });
const assignment = event(1, 'assignment', { repo: 'owner/repo', pr: 806, route: 'slice', source: candidate.headRefName,
  target: candidate.baseRefName, class: 'T3', worker, reviewer, commander });
const handoff = event(2, 'handoff', { assignment: 1, from: 'ctx_worker', to: 'ctx_reviewer',
  workerReleased: true, reviewerAcknowledged: true, incomingHead: HEAD, base: BASE });
const complete = event(3, 'complete', { assignment: 1, handoff: 2, dispatch: 'ctx_reviewer', writer: 'ctx_reviewer',
  head: HEAD, base: BASE, target: candidate.baseRefName, tests });
const released = event(4, 'release', { assignment: 1, completion: 3, coordinator: commander.terminal,
  runId: commander.runId, writerReleased: true, head: HEAD, base: BASE, target: candidate.baseRefName,
  gateRun: 100, testedCommit: HEAD });
const receipts = () => [assignment, handoff, complete, released].map((entry) => ({ ...entry }));

describe('actual subscription and effective launch pairings', () => {
  it('accepts the assigned T3 pair and both approved routing directions', () => {
    expect(release.approvedPair('T3', worker, reviewer)).toBe(true);
    expect(release.approvedPair('T3', { ...reviewer, effort: 'high' }, { ...worker, model: 'gpt-6-astra', effort: 'xhigh' })).toBe(true);
    expect(release.approvedPair('T2', { ...worker, effort: 'medium' }, { ...reviewer, effort: 'high' })).toBe(true);
    expect(release.approvedPair('T2', { ...reviewer, model: 'claude-sonnet-5-5', effort: 'high' }, worker)).toBe(true);
  });

  it('accepts single-writer completion without a Reviewer or on the same subscription channel', () => {
    expect(release.approvedPair('T3', worker, undefined as unknown as Record<string, unknown>)).toBe(true);
    expect(release.approvedPair('T3', { ...reviewer, taskId: 'task_other', dispatchId: 'ctx_other', terminal: 'term_other',
      effort: 'high' }, reviewer)).toBe(true);
    expect(release.approvedPair('T2', { ...worker, effort: 'medium' }, { ...worker, taskId: 'task_other', dispatchId: 'ctx_other',
      terminal: 'term_other', model: 'gpt-6.1-sol', effort: 'high' })).toBe(true);
  });

  it('accepts Go models for T1 single-writer or reviewed work and rejects unsupported aliases', () => {
    const go = { ...worker, channel: 'OpenCode Go', client: 'OpenCode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'low' };
    expect(release.approvedPair('T1', go, undefined as unknown as Record<string, unknown>)).toBe(true);
    expect(release.approvedPair('T1', go, { ...reviewer, channel: 'OpenCode Go', client: 'OpenCode', model: 'opencode-go/glm-5.3-flash', effort: 'low' })).toBe(true);
    expect(release.approvedPair('T1', go, { ...reviewer, channel: 'ChatGPT', client: 'Codex', model: 'gpt-6.1-sol', effort: 'medium' })).toBe(true);
    expect(release.approvedPair('T1', { ...go, model: 'opencode-go/deepseek-flash' }, { ...reviewer, channel: 'ChatGPT', client: 'Codex', model: 'gpt-6.1-sol', effort: 'medium' })).toBe(false);
  });

  it.each([
    { model: 'unavailable' }, { effort: 'low' }, { verified: false }, { subscriptionActive: false }, { paidFallback: true },
  ])('refuses an unavailable binding, unsupported effort, unverified launch or paid fallback: %j', (change) => {
    expect(release.approvedPair('T3', { ...worker, ...change }, reviewer)).toBe(false);
  });
});

describe('authenticated existing PR records', () => {
  const comment = { id: 1, user: { login: 'maintainer' }, created_at: '2026-10-12T00:00:00Z',
    updated_at: '2026-10-12T00:00:00Z', trusted: true, body: release.RECEIPT_PREFIX + JSON.stringify(assignment) };
  it('ignores ordinary prose and forged records from an untrusted publisher', () => {
    expect(release.roleReceipts([{ ...comment, trusted: false }, { ...comment, body: JSON.stringify(assignment) }])).toEqual([]);
    expect(release.roleReceipts([comment])[0]?.publisher).toBe('maintainer');
  });
  it('refuses edited and malformed authenticated receipts', () => {
    expect(() => release.roleReceipts([{ ...comment, updated_at: '2026-10-13T00:00:00Z' }])).toThrow('edited-role-receipt');
    expect(() => release.roleReceipts([{ ...comment, body: release.RECEIPT_PREFIX + '{' }])).toThrow('malformed-role-receipt');
  });
  it('reads a CRLF receipt and never silently drops a near-miss trusted one, such as a revoke', () => {
    const revoke = JSON.stringify(event(2, 'revoke', { assignment: 1 }));
    expect(release.roleReceipts([{ ...comment, body: `AI7_ORCA_V1\r\n${JSON.stringify(assignment)}` }])[0]?.kind).toBe('assignment');
    for (const body of [`AI7_ORCA_V1 ${revoke}`, `AI7_ORCA_V1${revoke}`, `AI7_ORCA_V1\r${revoke}`]) {
      expect(() => release.roleReceipts([{ ...comment, id: 2, body }])).toThrow('malformed-role-receipt');
      expect(release.roleReceipts([{ ...comment, id: 2, body, trusted: false }])).toEqual([]);
    }
  });
});

describe('single-writer exact-candidate merge release', () => {
  it('accepts normal Worker handoff, Reviewer completion and Commander slot release', () => {
    expect(release.mergeAuthorization(candidate, receipts()).allowed).toBe(true);
  });
  it('accepts Reviewer correction only with fresh final-head tests and release', () => {
    const events = receipts();
    events[2] = { ...complete, head: CORRECTED, tests: { ...tests, head: CORRECTED } };
    events[3] = { ...released, head: CORRECTED, testedCommit: CORRECTED };
    expect(release.mergeAuthorization({ ...candidate, headRefOid: CORRECTED }, events).allowed).toBe(true);
    expect(release.mergeAuthorization({ ...candidate, headRefOid: CORRECTED }, receipts()).allowed).toBe(false);
  });
  it.each([
    { headRefOid: CORRECTED }, { baseRefOid: CORRECTED }, { baseRefName: 'codex/integration-another' }, { isDraft: true }, { state: 'CLOSED' },
  ])('invalidates changed head, base, target, Draft or closed candidate: %j', (change) => {
    expect(release.mergeAuthorization({ ...candidate, ...change }, receipts()).allowed).toBe(false);
  });
  it('accepts direct single-writer Worker completion without handoff, and rejects mismatched writers or late handoffs', () => {
    const singleAssignment = event(1, 'assignment', { repo: 'owner/repo', pr: 806, route: 'slice', source: candidate.headRefName,
      target: candidate.baseRefName, class: 'T3', worker, commander });
    const workerComplete = event(3, 'complete', { assignment: 1, dispatch: 'ctx_worker', writer: 'ctx_worker',
      head: HEAD, base: BASE, target: candidate.baseRefName, tests });
    expect(release.mergeAuthorization(candidate, [singleAssignment, workerComplete, released]).allowed).toBe(true);
    expect(release.mergeAuthorization(candidate, [assignment, complete, released]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [assignment, { ...handoff, workerReleased: false }, complete, released]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [assignment, handoff, { ...complete, writer: 'ctx_worker' }, released]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [...receipts(), { ...handoff, id: 5 }]).allowed).toBe(false);
  });
  it('keeps the handoff when the wave moves, but needs completion and release at the new base', () => {
    const moved = { ...candidate, baseRefOid: CORRECTED };
    const atNewBase = [assignment, handoff, { ...complete, base: CORRECTED, tests: { ...tests, base: CORRECTED } },
      { ...released, base: CORRECTED }];
    expect(release.mergeAuthorization(moved, atNewBase).allowed).toBe(true);
    expect(release.mergeAuthorization(moved, receipts()).allowed).toBe(false);
    expect(release.mergeAuthorization(moved, [assignment, { ...handoff, base: 'stale' }, ...atNewBase.slice(2)]).allowed).toBe(false);
  });
  it('rejects failed, incomplete, stale or host-desktop tests', () => {
    for (const change of [{ conclusion: 'failure' }, { head: CORRECTED }, { base: CORRECTED }, { guest: 'host' }, { layers: ['build'] }]) {
      expect(release.mergeAuthorization(candidate, [assignment, handoff, { ...complete, tests: { ...tests, ...change } }, released]).allowed).toBe(false);
    }
  });
  it('uses the complete trusted diff for documentation and bounded queue-infrastructure checks', () => {
    const checks = { head: HEAD, base: BASE, conclusion: 'success', checks: ['links', 'directives', 'scenarios', 'git diff --check'] };
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'docs/agents/orca-dispatch.md' }] },
      [assignment, handoff, { ...complete, tests: checks }, released]).allowed).toBe(true);
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'docs/agents/orca-dispatch.md' }, { path: 'src/service/authority.ts' }] },
      [assignment, handoff, { ...complete, tests: checks }, released]).allowed).toBe(false);
    const infrastructure = { ...checks, checks: ['pnpm run check', 'pnpm test', 'git diff --check'] };
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'tools/nightly-queue.mjs' }] },
      [assignment, handoff, { ...complete, tests: infrastructure }, released]).allowed).toBe(true);
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'tools/ci/queue.mjs' }, { path: 'tools/ci/release-authority.mjs' }] },
      [assignment, handoff, { ...complete, tests: infrastructure }, released]).allowed).toBe(true);
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'tools/ci/unrecognized.mjs' }] },
      [assignment, handoff, { ...complete, tests: infrastructure }, released]).allowed).toBe(false);
    expect(release.mergeAuthorization({ ...candidate, files: [{ path: 'tools/nightly-queue.mjs' }, { path: 'src/main/index.ts' }] },
      [assignment, handoff, { ...complete, tests: infrastructure }, released]).allowed).toBe(false);
  });
  it('does not fall back to an older release after revocation, reassignment or newer failure', () => {
    expect(release.mergeAuthorization(candidate, [...receipts(), event(5, 'revoke', { assignment: 1 })]).reason).toBe('revoked');
    expect(release.mergeAuthorization(candidate, [...receipts(), { ...assignment, id: 5 }]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [...receipts(), { ...complete, id: 5, tests: { ...tests, conclusion: 'failure' } }]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [...receipts(), event(5, 'complete', { assignment: 999 })]).reason).toBe('contradictory-receipts');
  });
  it('refuses a release before completion and a different publisher or coordinator', () => {
    expect(release.mergeAuthorization(candidate, [assignment, handoff, { ...complete, id: 5 }, released]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [assignment, handoff, complete, { ...released, publisher: 'other-admin' }]).allowed).toBe(false);
    expect(release.mergeAuthorization(candidate, [assignment, handoff, complete, { ...released, coordinator: 'term_other' }]).allowed).toBe(false);
  });
  it('keeps main promotion separate and admits descriptive wave names', () => {
    expect(release.candidateKind({ ...candidate, baseRefName: 'main' })).toBeNull();
    expect(release.candidateKind({ ...candidate, baseRefName: 'codex/integration-editor' })).toBe('slice');
  });
  it('requires cumulative completion, included slice closures and exact Commander release for dev', () => {
    const final = { ...candidate, headRefName: 'codex/integration-806', baseRefName: 'dev' };
    const finalAssignment = { ...assignment, route: 'integration', source: final.headRefName, target: 'dev' };
    const cumulative = { ...complete, target: 'dev', coordinator: commander.terminal, writer: commander.terminal,
      slices: [{ pr: 816, completion: 20, release: 21, merge: CORRECTED }] };
    const finalRelease = { ...released, target: 'dev' };
    expect(release.mergeAuthorization(final, [finalAssignment, cumulative]).allowed).toBe(false);
    expect(release.mergeAuthorization({ ...final, isDraft: true }, [finalAssignment, cumulative, finalRelease]).allowed).toBe(false);
    expect(release.mergeAuthorization(final, [finalAssignment, cumulative, finalRelease]).allowed).toBe(true);
    expect(release.mergeAuthorization(final, [finalAssignment, { ...cumulative, slices: [] }, finalRelease]).allowed).toBe(false);
    // An Owner direct-merged slice is closed by its merge record alone; mixing the forms is refused.
    const closes = (slices: Record<string, unknown>[]) =>
      release.mergeAuthorization(final, [finalAssignment, { ...cumulative, slices }, finalRelease]).allowed;
    const direct = { pr: 817, merge: CORRECTED, directMerge: true };
    expect(closes([direct])).toBe(true);
    expect(closes([...cumulative.slices, direct])).toBe(true);
    expect(closes([{ pr: 817, merge: CORRECTED }])).toBe(false);
    expect(closes([{ ...direct, completion: 20, release: 21 }])).toBe(false);
    expect(closes([{ ...direct, directMerge: 'true' }])).toBe(false);
    expect(closes([{ ...cumulative.slices[0], directMerge: false }])).toBe(false);
  });
});

describe('real hosted Gate results independent of role receipts', () => {
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
  it('accepts the existing fast Gate only for its exact released head/base', () => {
    const fast = { ...run, path: '.github/workflows/e2e.yml', event: 'pull_request_target',
      status: 'completed', conclusion: 'success', display_title: `E2E Functional Gate · ${HEAD} · ${BASE}` };
    const fastJobs = [{ name: 'Route E2E', status: 'completed', conclusion: 'success' },
      { name: 'J-08 + J-12 + J-15 + J-03 + J-04 (Windows Server 2025 x64 CI)', status: 'completed', conclusion: 'success' },
      { name: 'Publish E2E Functional Gate result', status: 'completed', conclusion: 'success' }];
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: fastJobs, head: HEAD, base: BASE })).toBe(true);
    expect(release.hostedGatePassed({ ...input, run: { ...fast, conclusion: 'failure' }, jobs: fastJobs,
      head: HEAD, base: BASE })).toBe(true); // Tests precede release; only the authorization result may have failed.
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: [fastJobs[0], { ...fastJobs[1], conclusion: 'skipped' }, fastJobs[2]],
      head: HEAD, base: BASE })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: [fastJobs[0], { ...fastJobs[1], conclusion: 'skipped' }, fastJobs[2]],
      head: HEAD, base: BASE, docs: true })).toBe(true);
    expect(release.hostedGatePassed({ ...input, run: fast, jobs: fastJobs, head: HEAD, base: CORRECTED })).toBe(false);
    expect(release.hostedGatePassed({ ...input, run: { ...fast, event: 'pull_request' }, jobs: fastJobs, head: HEAD, base: BASE })).toBe(false);
  });
  it('requires completed actual tests before the Commander releases the candidate', () => {
    const passed = [{ conclusion: 'success', completed_at: '2026-10-12T00:02:00Z' }];
    expect(release.testsPrecedeRelease(passed, '2026-10-12T00:03:00Z')).toBe(true);
    expect(release.testsPrecedeRelease(passed, '2026-10-12T00:01:00Z')).toBe(false);
    expect(release.testsPrecedeRelease([{ conclusion: 'success' }], '2026-10-12T00:03:00Z')).toBe(false);
    expect(release.testsPrecedeRelease(passed, 'unknown')).toBe(false);
    const projected = [...passed, { name: 'Publish E2E Functional Gate result', conclusion: 'success', completed_at: '2026-10-12T00:09:00Z' }];
    expect(release.testsPrecedeRelease(projected, '2026-10-12T00:03:00Z')).toBe(true);
    expect(release.testsPrecedeRelease([projected[1]!], '2026-10-12T00:10:00Z')).toBe(false);
  });
});
