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
  squashOutcome: (result: { status: number; stdout: string; stderr: string }) => 'merged' | 'conflict' | 'failed';
  candidateRef: (pr: number, runId: string) => string;
  linkedIssues: (references: unknown, repo: string) => number[];
  closingComment: (options: { pr: number; dev: string; commit: string }) => string;
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

describe('the Issues a merged pull request links', () => {
  const reference = (number: number, owner = 'zhouy1017', name = 'ai7-harness') => ({
    id: `I_${number}`,
    number,
    repository: { id: 'R', name, owner: { id: 'U', login: owner } },
    url: `https://github.com/${owner}/${name}/issues/${number}`,
  });

  it('lists this repository\'s linked Issues once each, in ascending order', () => {
    expect(queue.linkedIssues([reference(411), reference(407), reference(411)], 'zhouy1017/ai7-harness')).toEqual([407, 411]);
  });

  it('ignores an Issue in another repository and anything that is not a reference', () => {
    expect(queue.linkedIssues([reference(7, 'someone', 'elsewhere'), null, { number: 'x' }, reference(0)], 'zhouy1017/ai7-harness')).toEqual([]);
    expect(queue.linkedIssues(undefined, 'zhouy1017/ai7-harness')).toEqual([]);
  });

  it('closes with a comment naming only the pull request, the line and the commit', () => {
    const comment = queue.closingComment({ pr: 482, dev: 'dev', commit: 'cf9b0a5d97de7220b46763b6267ae4da4cf4774f' });
    expect(comment).toBe('Integrated by pull request #482, squashed onto `dev` by the nightly merge queue (ADR 0081) as `cf9b0a5d97de`. ' +
      'A merge made with the workflow\'s token does not close the Issues a pull request links, so the queue closes this one (#496).');
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

  it('reads a squash as a conflict only when git reported one, never for another failure', () => {
    expect(queue.squashOutcome({ status: 0, stdout: 'Squash commit -- not updating HEAD', stderr: '' })).toBe('merged');
    expect(
      queue.squashOutcome({
        status: 1,
        stdout: 'Auto-merging PROGRESS.md\nCONFLICT (content): Merge conflict in PROGRESS.md',
        stderr: 'Automatic merge failed; fix conflicts and then commit the result.',
      }),
    ).toBe('conflict');
    expect(queue.squashOutcome({ status: 128, stdout: '', stderr: 'fatal: no email was given and auto-detection is disabled' })).toBe('failed');
    expect(queue.squashOutcome({ status: 128, stdout: '', stderr: 'fatal: refusing to merge unrelated histories' })).toBe('failed');
  });

  it('scopes the temporary ref to the pull request and the run', () => {
    expect(queue.candidateRef(449, '123456')).toBe('refs/heads/nightly/candidate-449-123456');
  });
});

// The orchestrator's own shape. A called workflow may only narrow the caller's token: a scope it asks
// for and the call site withholds refuses the whole run before a single job exists, with no log to read
// — which is how the queue of 2026-09-22 died (Issue #504). These cases are text over the workflow
// files, because the repository has no YAML parser and this invariant needs none.
describe('the orchestrator grants every scope the workflows it calls ask for', () => {
  const WORKFLOWS = new URL('../../.github/workflows/', import.meta.url);
  const SCOPE = /^(\s*)([a-z-]+): (read|write|none)$/;

  /** Every `permissions:` block of one workflow, as maps from scope to level, in file order. */
  function permissionBlocks(text: string): Map<string, string>[] {
    const lines = text.split('\n');
    const blocks: Map<string, string>[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const opener = /^(\s*)permissions:\s*$/.exec(lines[index]!);
      if (opener === null) continue;
      const block = new Map<string, string>();
      for (let scan = index + 1; scan < lines.length; scan += 1) {
        const scope = SCOPE.exec(lines[scan]!);
        if (scope === null || scope[1]!.length <= opener[1]!.length) break;
        block.set(scope[2]!, scope[3]!);
      }
      blocks.push(block);
    }
    return blocks;
  }

  /** Every job of the calling workflow that calls another workflow of this repository, with what it grants. */
  function callSites(text: string): { called: string; granted: Map<string, string> }[] {
    const lines = text.split('\n');
    const sites: { called: string; granted: Map<string, string> }[] = [];
    let granted = new Map<string, string>();
    for (let index = 0; index < lines.length; index += 1) {
      const opener = /^(\s{4})permissions:\s*$/.exec(lines[index]!);
      if (opener !== null) {
        granted = new Map<string, string>();
        for (let scan = index + 1; scan < lines.length; scan += 1) {
          const scope = SCOPE.exec(lines[scan]!);
          if (scope === null || scope[1]!.length <= 4) break;
          granted.set(scope[2]!, scope[3]!);
        }
      }
      const call = /^\s{4}uses: \.\/\.github\/workflows\/(\S+)$/.exec(lines[index]!);
      if (call !== null) sites.push({ called: call[1]!, granted: new Map(granted) });
    }
    return sites;
  }

  it('reads the call sites of the queue', async () => {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(new URL('e2e-nightly-queue.yml', WORKFLOWS), 'utf8');
    expect(callSites(text).map((site) => site.called)).toEqual(['e2e-candidate.yml', 'e2e-nightly.yml']);
  });

  it('withholds no scope a called workflow asks to write', async () => {
    const { readFile } = await import('node:fs/promises');
    const caller = await readFile(new URL('e2e-nightly-queue.yml', WORKFLOWS), 'utf8');
    const withheld: string[] = [];
    for (const site of callSites(caller)) {
      const called = await readFile(new URL(site.called, WORKFLOWS), 'utf8');
      for (const block of permissionBlocks(called)) {
        for (const [scope, level] of block) {
          if (level === 'write' && site.granted.get(scope) !== 'write') withheld.push(`${site.called} asks ${scope}: write`);
        }
      }
    }
    expect(withheld).toEqual([]);
  });
});
