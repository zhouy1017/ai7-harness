import { describe, expect, it } from 'vitest';

// `tools/*.mjs` is CI infrastructure outside the typed program (`allowJs: false`), so it is loaded
// through a runtime specifier the compiler does not resolve and typed at this boundary.
type QueueRecord = {
  number: number;
  title: string;
  isDraft: boolean;
  mergeable: string;
  baseRefName: string;
  headRefOid: string;
  files?: readonly { path: string; text?: string }[];
};
type Candidate = { number: number; title: string; head: string; merge: boolean; reserved: unknown };
type CandidateSet = {
  count: number;
  candidates: readonly Candidate[];
  mergeable: number;
  unmergeable: readonly { number: number; reason: string }[];
};
type GateResult = {
  journeys: readonly { journey: string; phase: string }[];
  failed: readonly { journey: string; phase: string }[];
  disclosures: readonly { journey: string; name: string }[];
  complete: boolean;
  unclassified: number;
};

const queue = (await import(new URL('../../tools/nightly-queue.mjs', import.meta.url).href)) as {
  selectCandidates: (records: readonly QueueRecord[]) => readonly Candidate[];
  assembleCandidateSet: (records: readonly QueueRecord[]) => CandidateSet;
  toMatrix: (set: CandidateSet) => { include: ReadonlyArray<{ number: number; merge: boolean }> };
  ownerReservation: (files: readonly { path: string; text?: string }[]) => { kind: string; path: string } | null;
  adrStatus: (text: string) => string | null;
  parseGateLog: (text: string) => GateResult;
  formatResultComment: (options: {
    platform: string;
    runUrl: string;
    attempt: number;
    result: GateResult | null;
  }) => string[];
  formatCandidateComment: (options: {
    reason: string;
    dev: string;
    devTip: string;
    reservedPath: string;
  }) => string[];
  coAuthorTrailers: (message: string) => string[];
  squashMessage: (title: string, body: string, trailers: readonly string[]) => string;
  mergeBody: (body: string, trailers: readonly string[]) => string;
  commitIdentity: (authorLine: string) => Record<string, string>;
  candidateRef: (pr: number, runId: string) => string;
};

const record = (overrides: Partial<QueueRecord> = {}): QueueRecord => ({
  number: 100,
  title: 'a pull request',
  isDraft: false,
  mergeable: 'MERGEABLE',
  baseRefName: 'dev',
  headRefOid: 'a'.repeat(40),
  files: [],
  ...overrides,
});

// PR #449 as the live repository reports it: an ADR whose own status line reads `proposed`.
const PROPOSED_ADR = {
  path: 'docs/adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md',
  text: '---\nstatus: proposed\ndate: 2026-09-11\ndeciders: Owner\n---\n\n# 0080 · Assign a provider route and model\n',
};
const ACCEPTED_ADR = {
  path: 'docs/adr/0079-record-the-owner-s-decisions-of-2026-09-10.md',
  text: '---\nstatus: accepted\ndate: 2026-09-10\n---\n\n# 0079 · Record the Owner decisions\n',
};

describe('the nightly merge queue filter', () => {
  it('lists an open, mergeable, non-draft pull request against dev', () => {
    expect(queue.selectCandidates([record()])).toEqual([
      { number: 100, title: 'a pull request', head: 'a'.repeat(40), merge: true, reserved: null },
    ]);
  });

  it('excludes a draft pull request', () => {
    expect(queue.selectCandidates([record({ isDraft: true })])).toEqual([]);
  });

  it('excludes a conflicting pull request and says why in the set', () => {
    const set = queue.assembleCandidateSet([record({ mergeable: 'CONFLICTING' })]);
    expect(set.candidates).toEqual([]);
    expect(set.count).toBe(0);
    expect(set.unmergeable).toEqual([{ number: 100, reason: 'conflicting' }]);
  });

  it('excludes a pull request whose base is not dev, and one GitHub has not yet computed', () => {
    expect(queue.selectCandidates([record({ baseRefName: 'main' })])).toEqual([]);
    expect(queue.assembleCandidateSet([record({ mergeable: 'UNKNOWN' })]).unmergeable).toEqual([
      { number: 100, reason: 'unknown' },
    ]);
  });

  it('orders candidates ascending by number whatever order it reads them in', () => {
    const set = queue.assembleCandidateSet([
      record({ number: 42 }),
      record({ number: 7 }),
      record({ number: 19 }),
    ]);
    expect(set.candidates.map((entry) => entry.number)).toEqual([7, 19, 42]);
    expect(queue.toMatrix(set).include.map((entry) => entry.number)).toEqual([7, 19, 42]);
  });

  it('marks a pull request changing a proposed ADR testable but not mergeable by the queue', () => {
    const set = queue.assembleCandidateSet([record({ number: 449, files: [PROPOSED_ADR] })]);
    expect(set.count).toBe(1);
    expect(set.mergeable).toBe(0);
    expect(set.candidates[0]?.merge).toBe(false);
    expect(set.candidates[0]?.reserved).toEqual({ kind: 'adr', path: PROPOSED_ADR.path });
  });

  it('marks a pull request changing a canonical policy document the same way', () => {
    const set = queue.assembleCandidateSet([
      record({ number: 440, files: [{ path: 'docs/policies/provider-processing-policy.v6.json' }] }),
    ]);
    expect(set.candidates[0]?.merge).toBe(false);
    expect(set.candidates[0]?.reserved).toEqual({
      kind: 'policy',
      path: 'docs/policies/provider-processing-policy.v6.json',
    });
  });

  it('merges a pull request whose ADR is already accepted', () => {
    const set = queue.assembleCandidateSet([record({ number: 79, files: [ACCEPTED_ADR] })]);
    expect(set.candidates[0]?.merge).toBe(true);
    expect(set.candidates[0]?.reserved).toBeNull();
  });

  it('reads the inline status heading the landed ADRs use', () => {
    expect(queue.adrStatus('# ADR 0081: Run the nightly\n\nStatus: **accepted** — the Owner decision\n')).toBe(
      'accepted',
    );
    expect(queue.adrStatus('# ADR 0081: Run the nightly\n\nStatus: **proposed**\n')).toBe('proposed');
  });

  it('reserves a policy path even where no ADR text is readable', () => {
    expect(queue.ownerReservation([{ path: 'docs/adr/0079-x.md' }])).toBeNull();
    expect(queue.ownerReservation([{ path: 'docs/policies/active-policy-set.v6.json' }])).toEqual({
      kind: 'policy',
      path: 'docs/policies/active-policy-set.v6.json',
    });
  });

  it('returns an empty set when nothing is open', () => {
    const set = queue.assembleCandidateSet([]);
    expect(set).toEqual({ count: 0, candidates: [], mergeable: 0, unmergeable: [] });
    expect(queue.toMatrix(set)).toEqual({ include: [] });
  });
});

describe('the queue reads the marker lines as printed', () => {
  // What a Windows occurrence actually prints: the Journey names its own skip on stdout, and
  // `run-all.mjs` repeats it beside the result. One skip is disclosed twice and named once.
  const PASSING = [
    'LOCAL_COMPLETION/J-01/start',
    'DISCLOSED_SKIP/J-01/doc-manuscript-local-only-absent',
    'LOCAL_COMPLETION/J-01/disclosed-skip/doc-manuscript-local-only-absent',
    'LOCAL_COMPLETION/J-01/pass',
    'LOCAL_COMPLETION/all/pass',
  ].join('\n');
  const FAILING = [
    'LOCAL_COMPLETION/J-01/start',
    'LOCAL_COMPLETION/J-01/pass',
    'LOCAL_COMPLETION/J-08/start',
    'LOCAL_COMPLETION/J-08/fail',
    'LOCAL_COMPLETION/J-08/fail/recovery-identity/journey-failure',
  ].join('\n');

  it('reduces a passing run to its Journeys and its disclosed skips', () => {
    const result = queue.parseGateLog(PASSING);
    expect(result.complete).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.journeys.map((entry) => `${entry.journey}/${entry.phase}`)).toEqual([
      'J-01/start',
      'J-01/pass',
      'all/pass',
    ]);
    expect(result.disclosures).toEqual([{ journey: 'J-01', name: 'doc-manuscript-local-only-absent' }]);
  });

  it('names the failing Journey and location once, not the bare fail line as well', () => {
    const result = queue.parseGateLog(FAILING);
    expect(result.complete).toBe(false);
    expect(result.failed).toEqual([
      { journey: 'J-08', phase: 'fail', location: 'recovery-identity', errorClass: 'journey-failure' },
    ]);
  });

  it('counts a marker line outside the admitted vocabulary instead of reproducing it', () => {
    const result = queue.parseGateLog('LOCAL_COMPLETION/J-01/fail/../secret/manuscript-text\n');
    expect(result.unclassified).toBe(1);
    expect(result.failed).toEqual([]);
  });

  it('never reproduces the text of a line that is not a marker', () => {
    const result = queue.parseGateLog('some child output with manuscript text\nLOCAL_COMPLETION/all/pass\n');
    // The line is counted, never quoted, so no comment can carry what it said.
    expect(result.unclassified).toBe(1);
    expect(result.complete).toBe(true);
    expect(JSON.stringify(result)).not.toContain('manuscript');
  });

  it('writes a comment carrying only the platform, the run link and the marker lines', () => {
    const body = queue
      .formatResultComment({
        platform: 'macOS 15 arm64',
        runUrl: 'https://github.com/zhouy1017/ai7-harness/actions/runs/1',
        attempt: 1,
        result: queue.parseGateLog(FAILING),
      })
      .join('\n');
    expect(body).toContain('macOS 15 arm64');
    expect(body).toContain('https://github.com/zhouy1017/ai7-harness/actions/runs/1');
    expect(body).toContain('`LOCAL_COMPLETION/J-08/fail/recovery-identity/journey-failure`');
  });

  it('says so rather than inventing a result when the occurrence left no marker', () => {
    const body = queue
      .formatResultComment({ platform: 'Windows', runUrl: 'u', attempt: 2, result: null })
      .join('\n');
    expect(body).toContain('ended before');
    expect(body).toContain('(attempt 2)');
  });

  it('explains the Owner reservation without naming anything but the path', () => {
    const body = queue
      .formatCandidateComment({
        reason: 'reserved',
        dev: 'dev',
        devTip: 'f'.repeat(40),
        reservedPath: 'docs/adr/0080-assign-a-provider-route-and-model.md',
      })
      .join('\n');
    expect(body).toContain('docs/adr/0080-assign-a-provider-route-and-model.md');
    expect(body).toContain('left to the Owner');
  });
});

describe('the tree the queue builds', () => {
  it('takes the pull request title, its body, and the head commit own trailers', () => {
    const trailers = queue.coAuthorTrailers(
      'feat: something\n\nbody text\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    );
    expect(trailers).toEqual(['Co-Authored-By: Claude <noreply@anthropic.com>']);
    expect(queue.squashMessage('the pull request title', 'the pull request body', trailers)).toBe(
      'the pull request title\n\nthe pull request body\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    );
  });

  it('keeps one trailer when the head commit repeats it, and invents none', () => {
    expect(queue.coAuthorTrailers('x\n\nCo-authored-by: A <a@b.c>\nco-authored-by: A <a@b.c>\n')).toEqual([
      'Co-Authored-By: A <a@b.c>',
    ]);
    expect(queue.coAuthorTrailers('x\n\nno trailer here\n')).toEqual([]);
    expect(queue.squashMessage('t', '', [])).toBe('t\n');
  });

  it('merges with the pull request body plus the head commit trailers, and the title only as the subject', () => {
    expect(queue.mergeBody('the pull request body\n', ['Co-Authored-By: Claude <noreply@anthropic.com>'])).toBe(
      'the pull request body\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    );
    expect(queue.mergeBody('', [])).toBe('\n');
    expect(queue.mergeBody('', ['Co-Authored-By: A <a@b.c>'])).toBe('Co-Authored-By: A <a@b.c>\n');
  });

  it('hands the matrix only the number and the merge flag of each candidate', () => {
    const set: CandidateSet = {
      count: 1,
      candidates: [{ number: 3, title: 'a title the matrix must not carry', head: 'a'.repeat(40), merge: true, reserved: null }],
      mergeable: 1,
      unmergeable: [],
    };
    expect(queue.toMatrix(set)).toEqual({ include: [{ number: 3, merge: true }] });
  });

  it('writes the prepared commit as the head author, so a runner without a git identity can write it', () => {
    expect(queue.commitIdentity('A Author\na@example.com\n')).toEqual({
      GIT_AUTHOR_NAME: 'A Author',
      GIT_AUTHOR_EMAIL: 'a@example.com',
      GIT_COMMITTER_NAME: 'A Author',
      GIT_COMMITTER_EMAIL: 'a@example.com',
    });
    expect(() => queue.commitIdentity('\n')).toThrow(/incomplete/u);
  });

  it('scopes the temporary ref to the pull request and the run', () => {
    expect(queue.candidateRef(449, '123456')).toBe('refs/heads/nightly/candidate-449-123456');
  });
});
