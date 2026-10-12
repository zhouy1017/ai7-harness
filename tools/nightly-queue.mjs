import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateKind, queueTarget, documentationOnly, roleReceipts, mergeAuthorization, hostedGatePassed, testsPrecedeRelease } from './orca-release.mjs';

// The nightly merge queue of ADR 0081: the scheduled orchestrator lists the candidates, builds the
// tree each one would land, and merges the ones the full Gate passed. Every pull-request-touching
// step of the two workflows runs through this file, so the same code is rehearsed locally with
// `--dry-run`. It is CI and developer infrastructure, never a product surface.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The Owner-reserved exclusions of ADR 0081 §4, stated as paths so the Owner can widen them. */
export const OWNER_RESERVED_ADR_PREFIX = 'docs/adr/';
export const OWNER_RESERVED_POLICY_PREFIX = 'docs/policies/';

const MERGEABLE = 'MERGEABLE';
const UNKNOWN = 'UNKNOWN';
const DEV = 'dev';
// How long the listing waits for GitHub to answer what it asked. Four more listings over about
// half a minute: enough for an ordinary answer, far short of delaying the night.
const MERGEABILITY_ATTEMPTS = 5;
const MERGEABILITY_PAUSE_MS = 7_000;
// An ADR declares its status either in frontmatter (`status: accepted`) or in an inline heading
// (`Status: **accepted** — …`), and only the one word before any prose decides the reservation.
const ADR_STATUS_LINE = /^status:\s*(.+?)\s*$/iu;
const PROPOSED = 'proposed';

/** The status an ADR's own text declares, from the frontmatter form or the inline heading form. */
/**
 * The status an ADR's own text declares — the frontmatter form ADR 0073–0080 use, or the inline
 * heading form ADR 0081 carries — reduced to the first word so surrounding prose cannot matter.
 */
export function adrStatus(text) {
  for (const raw of text.split(/\r?\n/u)) {
    const declared = ADR_STATUS_LINE.exec(raw.trim());
    if (declared !== null) return (declared[1].match(/[A-Za-z-]+/u)?.[0] ?? '').toLowerCase();
  }
  return null;
}

/**
 * The Owner-reserved record a candidate touches, or `null`. Any change under the canonical policy
 * directory counts; an ADR counts when its own text reads `proposed`.
 */
export function ownerReservation(files) {
  for (const file of files) {
    if (file.path.startsWith(OWNER_RESERVED_POLICY_PREFIX)) {
      return { kind: 'policy', path: file.path };
    }
  }
  const proposed = files
    .filter((file) => file.path.startsWith(OWNER_RESERVED_ADR_PREFIX))
    .map((file) => ({ path: file.path, status: adrStatus(file.text ?? '') }))
    .filter((file) => file.status === PROPOSED)
    .sort((left, right) => left.path.localeCompare(right.path));
  return proposed.length === 0 ? null : { kind: 'adr', path: proposed[0].path };
}

/**
 * The pure filter: open, non-draft, mergeable pull requests against `dev`, ascending, each marked
 * with whether the queue may merge it. A pull request it may not merge is still tested and
 * reported; `merge: false` is the whole difference (ADR 0081 §4).
 */
export function selectCandidates(records) {
  return records
    .filter(
      (record) =>
        typeof record.number === 'number' &&
        record.isDraft === false &&
        record.mergeable === MERGEABLE &&
        queueTarget(record.baseRefName),
    )
    .map((record) => {
      const reservation = ownerReservation(record.files ?? []);
      return {
        number: record.number,
        title: record.title,
        head: record.headRefOid,
        merge: reservation === null && candidateKind(record) !== null && record.authorization?.allowed === true,
        reserved: reservation,
      };
    })
    .sort((left, right) => left.number - right.number);
}

/**
 * The pull requests whose mergeability GitHub has not answered yet, ascending. It computes `mergeable`
 * lazily and a listing is itself what asks, so the first answer of a night is `UNKNOWN` for every pull
 * request nothing else has warmed; the listing asks again while any of these remain (Issue #507). Only
 * a pull request the queue would otherwise consider counts — a draft or one aimed elsewhere is not
 * waited for.
 */
export function pendingMergeability(records) {
  return records
    .filter((record) => record.isDraft === false && queueTarget(record.baseRefName) && record.mergeable === UNKNOWN)
    .map((record) => record.number)
    .sort((left, right) => left - right);
}

/**
 * The candidate set as the orchestrator consumes it. A pull request still `UNKNOWN` when the listing
 * has finished asking is left to the next night and said so.
 */
export function assembleCandidateSet(records) {
  const candidates = selectCandidates(records);
  const unmergeable = records
    .filter((record) => record.isDraft === false && queueTarget(record.baseRefName) && record.mergeable !== MERGEABLE)
    .map((record) => ({ number: record.number, reason: String(record.mergeable).toLowerCase() }))
    .sort((left, right) => left.number - right.number);
  return {
    count: candidates.length,
    candidates,
    mergeable: candidates.filter((entry) => entry.merge).length,
    unmergeable,
  };
}

/** The matrix the orchestrator runs one candidate at a time over. */
export function toMatrix(set) {
  // Only what the candidate workflow consumes: a free-text title or a nested reservation object is
  // nothing the matrix needs to carry.
  return { include: set.candidates.map(({ number, merge }) => ({ number, merge })) };
}

// ---- Reading a Gate occurrence's result -----------------------------------------------------

// Since Issue #746 `run-all.mjs` prints a Journey's wall time on its pass and fail lines as whole seconds
// (`…/pass/412s`); the line reads as the same pass or fail, and a log printed before that reads as it did.
const COMPLETION = /^LOCAL_COMPLETION\/([A-Za-z0-9-]+)\/(start|pass|fail|interrupted)(?:\/\d{1,7}s)?$/u;
const FAILURE = /^LOCAL_COMPLETION\/([A-Z0-9-]+)\/fail\/([a-z0-9-]+)\/([a-z0-9-]+)$/u;
const DISCLOSURE = /^(?:DISCLOSED_SKIP\/([A-Z0-9-]+)|LOCAL_COMPLETION\/([A-Z0-9-]+)\/disclosed-skip)\/([a-z0-9-]+)$/u;

/**
 * Reduce a Gate occurrence's captured output to what `run-all.mjs` and `controller.mjs` print:
 * which Journeys started, passed, failed or were interrupted, where a failure stopped, and which
 * scenarios a Journey disclosed as skipped. Those lines carry no path, payload, or child output,
 * so they are the only lines this queue reproduces; anything else is counted, never quoted
 * (ADR 0081 §5). No new marker vocabulary is created — this reads the lines as printed.
 */
export function parseGateLog(text) {
  const journeys = [];
  const named = new Map();
  let unclassified = 0;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const disclosure = DISCLOSURE.exec(line);
    if (disclosure !== null) {
      // A Journey names its own skip on stdout and `run-all.mjs` repeats it beside the result, so
      // an occurrence reports one skip twice. It is one skip.
      const journey = disclosure[1] ?? disclosure[2];
      named.set(`${journey}/${disclosure[3]}`, { journey, name: disclosure[3] });
      continue;
    }
    const failure = FAILURE.exec(line);
    if (failure !== null) {
      journeys.push({ journey: failure[1], phase: 'fail', location: failure[2], errorClass: failure[3] });
      continue;
    }
    const completion = COMPLETION.exec(line);
    if (completion !== null) {
      journeys.push({ journey: completion[1], phase: completion[2] });
      continue;
    }
    // Counted, never reproduced: a line outside the marker vocabulary may carry anything.
    unclassified += 1;
  }
  const failed = [];
  const namedFailures = new Map();
  for (const entry of journeys) {
    if (entry.phase !== 'fail' && entry.phase !== 'interrupted') continue;
    if (entry.errorClass === undefined) {
      failed.push(entry);
      continue;
    }
    // A sequenced failure prints both `…/fail` and `…/fail/<location>/<errorClass>`. One failure.
    namedFailures.set(entry.journey, entry);
    failed.push(entry);
  }
  const deduped = failed.filter((entry) => entry.errorClass !== undefined || !namedFailures.has(entry.journey));
  return {
    journeys,
    disclosures: [...named.values()],
    failed: deduped,
    complete: deduped.length === 0 && journeys.some((entry) => entry.journey.toLowerCase() === 'all' && entry.phase === 'pass'),
    unclassified,
  };
}

const FOOTER = 'The pull request stays open; the next nightly occurrence reconsiders it.';

/** The pull-request comment body for one platform's result: run link, platform, then the lines. */
export function formatResultComment({ platform, runUrl, attempt, result }) {
  const lines = [`Nightly merge queue — ${platform} · [run ${runUrl}](${runUrl})${attempt > 1 ? ` (attempt ${attempt})` : ''}`, ''];
  if (result === null) {
    lines.push('The occurrence ended before `pnpm run e2e:all` left a `LOCAL_COMPLETION/…` line.');
  } else if (result.failed.length > 0) {
    lines.push('Failed among the admitted Journeys:');
    for (const entry of result.failed) {
      lines.push(
        entry.errorClass === undefined
          ? `\`LOCAL_COMPLETION/${entry.journey}/${entry.phase}\``
          : `\`LOCAL_COMPLETION/${entry.journey}/fail/${entry.location}/${entry.errorClass}\``,
      );
    }
  } else if (result.complete) {
    lines.push('The full admitted Journey set passed on this platform.');
  } else {
    lines.push('No failing marker was classified; the admitted set did not complete on this platform.');
  }
  if (result !== null && result.disclosures.length > 0) {
    lines.push('', 'Disclosed skips:');
    for (const entry of result.disclosures) {
      lines.push(`\`DISCLOSED_SKIP/${entry.journey}/${entry.name}\``);
    }
  }
  if (result !== null && result.unclassified > 0) {
    lines.push(
      '',
      `${result.unclassified} \`LOCAL_COMPLETION/…\` line(s) fell outside the admitted vocabulary and are not reproduced here.`,
    );
  }
  lines.push('', FOOTER);
  return lines;
}

/** The two comments that end a candidate before or instead of a merge, worded for the case. */
export function formatCandidateComment({ reason, dev, devTip, reservedPath }) {
  if (reason === 'unreleased') return [
    'Nightly merge queue — both platforms passed, but this candidate has no current role release or changes an Owner-reserved record.',
    '', 'Green tests alone do not authorize a merge. The Commander must attest the current assignment, completion and exact head/target/base release; Owner reservations still apply.',
  ];
  if (reason === 'conflict') {
    return [
      `Nightly merge queue — this pull request cannot be squashed onto the current \`${dev}\` tip, so it was skipped before testing.`,
      '',
      `\`conflict on ${dev}@${devTip.slice(0, 12)}\``,
      '',
      FOOTER,
    ];
  }
  if (reason === 'moved') {
    return [
      `Nightly merge queue — \`${dev}\` moved to \`${devTip.slice(0, 12)}\` after this pull request was tested, so the tested tree is no longer the tree that would land and the merge was refused.`,
      '',
      FOOTER,
    ];
  }
  return [
    'Nightly merge queue — the full admitted Journey set passed on both platforms, but this pull request is left to the Owner: it changes an Owner-reserved record.',
    '',
    `\`${reservedPath}\``,
    '',
    'ADR 0081 §4 keeps this one exclusion: an ADR that still reads `proposed` and a canonical policy document under `docs/policies/` are tested and reported, never merged by the queue.',
  ];
}

// ---- Process helpers ------------------------------------------------------------------------

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

function describeFailure(command, args, result) {
  const detail = result.stderr.trim() || result.stdout.trim() || result.error?.message || 'no output';
  return new Error(`${command} ${args.join(' ')} failed: ${detail}`);
}

function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error !== null || result.status !== 0) throw describeFailure(command, args, result);
  return result.stdout;
}

function ghOrThrow(args, options = {}) {
  return runOrThrow('gh', args, options);
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} did not return JSON.`);
  }
}

function runUrl() {
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = process.env.GITHUB_REPOSITORY ?? 'zhouy1017/ai7-harness';
  return `${server}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'local'}`;
}

/**
 * Comment on a pull request. A re-run must not stack duplicate comments, so an occurrence passes
 * the marker its comment carries and a second identical attempt is a no-op.
 */
function postComment(repo, pr, lines, options) {
  const body = `${lines.join('\n')}\n`;
  if (options.dryRun === true) {
    process.stdout.write(`[dry-run] comment on #${pr}:\n${body}`);
    return;
  }
  const existing = ghOrThrow([
    'pr',
    'view',
    String(pr),
    '--repo',
    repo,
    '--json',
    'comments',
    '--jq',
    `[.comments[].body | contains(${JSON.stringify(options.marker)})] | any`,
  ]);
  if (existing.trim() === 'true') {
    process.stdout.write(`queue: #${pr} already carries this occurrence's comment\n`);
    return;
  }
  ghOrThrow(['pr', 'comment', String(pr), '--repo', repo, '--body-file', '-'], { input: body });
}

// ---- list -----------------------------------------------------------------------------------

const PR_LIST_FIELDS = 'number,title,isDraft,mergeable,baseRefName,baseRefOid,headRefName,headRefOid';
const PR_VIEW_FIELDS = `${PR_LIST_FIELDS},body,state,headRepository`;

function api(repo, suffix) {
  return parseJson(ghOrThrow(['api', `repos/${repo}/${suffix}`]), 'GitHub API');
}

function pagedApi(repo, suffix) {
  return parseJson(ghOrThrow(['api', '--paginate', '--slurp', `repos/${repo}/${suffix}`]), 'GitHub paginated API').flat();
}

function receiptsFor(repo, pr) {
  const comments = pagedApi(repo, `issues/${pr}/comments?per_page=100`);
  const permissions = new Map();
  for (const comment of comments) {
    if (!comment.body?.startsWith('AI7_ORCA_V1\n')) continue;
    const login = comment.user?.login;
    if (!login || comment.user.type !== 'User') continue;
    if (!permissions.has(login)) {
      const permission = api(repo, `collaborators/${encodeURIComponent(login)}/permission`);
      permissions.set(login, ['admin', 'maintain'].includes(permission.role_name ?? permission.permission));
    }
    comment.trusted = permissions.get(login);
  }
  return roleReceipts(comments);
}

function authorizationFor(repo, record) {
  try {
    return mergeAuthorization({ ...record, repo, files: record.files ?? pullRequestFiles(repo, record.number, record) }, receiptsFor(repo, record.number));
  } catch {
    return { allowed: false, reason: 'unverifiable-role-receipts' };
  }
}

function gateOccurrence(repo, id) {
  const run = api(repo, `actions/runs/${id}`);
  const jobs = pagedApi(repo, `actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100`).flatMap((page) => page.jobs ?? []);
  return { run, jobs };
}

function verifyHostedRelease(repo, record, authorization) {
  const files = pullRequestFiles(repo, record.number, record);
  if (documentationOnly(files)) return true;
  const release = authorization.release;
  const { run: gateRun, jobs } = gateOccurrence(repo, release.gateRun);
  const tested = fetchRef('origin', release.testedCommit, `refs/remotes/origin/nightly/released-test-${record.number}`);
  const testedTree = runOrThrow('git', ['show', '-s', '--format=%T', tested]).trim();
  const headTree = runOrThrow('git', ['show', '-s', '--format=%T', record.headRefOid]).trim();
  if (gateRun.repository?.full_name !== repo || testedTree !== headTree ||
      !hostedGatePassed({ run: gateRun, jobs, pr: record.number, candidate: tested, head: record.headRefOid, base: record.baseRefOid }) ||
      !testsPrecedeRelease(jobs, release.at)) {
    throw new Error('release-precedes-or-mismatches-hosted-tests');
  }
  return true;
}

function verifySliceClosures(repo, authorization, waveHead) {
  if (authorization.assignment.route !== 'integration') return;
  const mergedSlices = pagedApi(repo, `pulls?state=closed&base=${encodeURIComponent(authorization.assignment.source)}&per_page=100`)
    .filter((record) => record.merged_at !== null && record.merge_commit_sha &&
      run('git', ['merge-base', '--is-ancestor', record.merge_commit_sha, waveHead]).status === 0);
  if (mergedSlices.some((record) => !authorization.complete.slices.some((slice) => slice.pr === record.number))) {
    throw new Error('integration-unlisted-slice');
  }
  for (const slice of authorization.complete.slices) {
    const record = pullRequest(repo, slice.pr);
    const merge = api(repo, `pulls/${slice.pr}`).merge_commit_sha;
    if (record.state !== 'MERGED' || record.baseRefName !== authorization.assignment.source || merge !== slice.merge) {
      throw new Error('integration-slice-not-merged');
    }
    const receipts = receiptsFor(repo, slice.pr);
    const completion = receipts.find((entry) => entry.id === slice.completion);
    const release = receipts.find((entry) => entry.id === slice.release);
    if (!completion || !release || release.completion !== completion.id) throw new Error('integration-slice-closure-missing');
    const historical = mergeAuthorization({ ...record, repo, files: pullRequestFiles(repo, slice.pr, record), state: 'OPEN', isDraft: false,
      headRefOid: completion.head, baseRefOid: completion.base }, receipts);
    if (!historical.allowed || historical.complete.id !== slice.completion || historical.release.id !== slice.release) {
      throw new Error('integration-slice-closure-invalid');
    }
    verifyHostedRelease(repo, { ...record, headRefOid: completion.head, baseRefOid: completion.base }, historical);
    if (run('git', ['merge-base', '--is-ancestor', slice.merge, waveHead]).status !== 0) throw new Error('integration-slice-not-in-candidate');
  }
}

/**
 * The complete exact-commit diff, with rename detection disabled so a source renamed to Markdown
 * cannot become a docs-only change. Only changed ADR text is read; never product/book contents.
 * Git avoids the hosting API's file-count cap and binds every read to immutable commits.
 */
function pullRequestFiles(repo, pr, record = pullRequest(repo, pr)) {
  const head = fetchRef('origin', record.headRefOid, `refs/remotes/origin/nightly/files-${pr}`);
  const base = fetchRef('origin', record.baseRefOid, `refs/remotes/origin/nightly/files-base-${pr}`);
  const paths = runOrThrow('git', ['diff', '--no-renames', '--name-only', '-z', `${base}...${head}`]).split('\0').filter(Boolean);
  return paths.map((path) => {
    if (!path.startsWith(OWNER_RESERVED_ADR_PREFIX)) return { path };
    const current = run('git', ['show', `${head}:${path}`]);
    const original = run('git', ['show', `${base}:${path}`]);
    // A proposed ADR's deletion or promotion remains Owner-reserved; its accepted replacement
    // cannot hide the proposed text the candidate actually changed.
    const text = adrStatus(original.stdout) === PROPOSED ? original.stdout : current.stdout;
    return { path, text };
  });
}

/** A pause this file can take: every `gh` call here is synchronous, so the listing waits the same way. */
function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * List until GitHub has answered, or until the attempts run out. Asking is what starts the
 * computation (Issue #507), so a night that asked once would read its own cold answer as a no and
 * merge nothing, every night. `list` is one listing and `waitFor` is given the pull requests still
 * unanswered, once per wait; both are the caller's, so this decides only how often to ask.
 */
export function listUntilAnswered(list, waitFor, attempts = MERGEABILITY_ATTEMPTS) {
  let listed = list();
  let asked = 1;
  while (asked < attempts) {
    const pending = pendingMergeability(listed);
    if (pending.length === 0) break;
    waitFor(pending);
    listed = list();
    asked += 1;
  }
  return { listed, pending: pendingMergeability(listed), asked };
}

function listOpenPullRequests(repo) {
  return parseJson(
    ghOrThrow(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', PR_LIST_FIELDS]),
    'gh pr list',
  );
}

/** Every open pull request with its changed paths, listed until GitHub has stated mergeability. */
function openPullRequests(repo) {
  const { listed } = listUntilAnswered(
    () => listOpenPullRequests(repo),
    (pending) => {
      process.stdout.write(`queue: asking again for the mergeability of ${pending.map((number) => `#${number}`).join(', ')}\n`);
      pause(MERGEABILITY_PAUSE_MS);
    },
  );
  return listed.filter((record) => queueTarget(record.baseRefName) && !record.isDraft).map((record) => ({
    ...record, files: pullRequestFiles(repo, record.number, record),
    authorization: authorizationFor(repo, { ...record, state: 'OPEN' }),
  }));
}

function writeGithubOutput(file, entries) {
  appendFileSync(file, `${Object.entries(entries).map(([name, value]) => `${name}=${value}\n`).join('')}`);
}

function listCommand(options) {
  const set = assembleCandidateSet(openPullRequests(options.repo));
  if (options.output !== undefined) {
    writeGithubOutput(options.output, { count: set.count, matrix: JSON.stringify(toMatrix(set)) });
  }
  process.stdout.write(`${JSON.stringify(set, null, 2)}\n`);
  return 0;
}

// ---- prepare --------------------------------------------------------------------------------

const TRAILER = /^co-authored-by:\s*(.+?)\s*$/iu;

/**
 * The `Co-Authored-By` trailers of the head commit, in the order it carries them and with its own
 * spelling. A squash keeps the authorship the pull request recorded; it never invents one.
 */
export function coAuthorTrailers(message) {
  const seen = new Map();
  for (const raw of message.split(/\r?\n/u)) {
    const match = TRAILER.exec(raw.trim());
    if (match !== null) seen.set(match[1].toLowerCase(), `Co-Authored-By: ${match[1]}`);
  }
  return [...seen.values()];
}

/** The message the queue commits: the pull request's own title, its body, its own trailers. */
export function squashMessage(title, body, trailers) {
  const parts = [title.trim()];
  const trimmed = body.replace(/\s+$/u, '');
  if (trimmed.length > 0) parts.push('', trimmed);
  if (trailers.length > 0) parts.push('', trailers.join('\n'));
  return `${parts.join('\n')}\n`;
}

/**
 * The body the queue merges with — the pull request's body plus the head commit's own trailers, the
 * title being the subject — so the landed commit carries exactly the authorship `prepare` recorded.
 */
export function mergeBody(body, trailers) {
  const trimmed = body.replace(/\s+$/u, '');
  const parts = [];
  if (trimmed.length > 0) parts.push(trimmed);
  if (trailers.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(trailers.join('\n'));
  }
  return parts.length === 0 ? '\n' : `${parts.join('\n')}\n`;
}

/**
 * What a `git merge --squash --no-commit` came to: `merged`, a `conflict` git reported as one, or
 * `failed` for anything else — a missing identity, unrelated histories — which is never the pull
 * request's fault and is raised as the tool's own error instead of a conflict comment.
 */
/**
 * The Issues in this repository a merged pull request's closing keywords linked, once each and in
 * ascending order. A merge made with the workflow's token does not close them the way a person's
 * merge does (#496), so the queue closes the ones still open itself.
 */
export function linkedIssues(references, repo) {
  if (!Array.isArray(references)) return [];
  const [owner, name] = String(repo).split('/');
  const numbers = references
    .filter((reference) =>
      reference !== null && typeof reference === 'object' &&
      Number.isInteger(reference.number) && reference.number > 0 &&
      reference.repository?.name === name && reference.repository?.owner?.login === owner)
    .map((reference) => reference.number);
  return [...new Set(numbers)].sort((left, right) => left - right);
}

/** The comment the queue closes such an Issue with: the pull request, the line and the commit only. */
export function closingComment({ pr, dev, commit }) {
  return `Integrated by pull request #${pr}, squashed onto \`${dev}\` by the nightly merge queue (ADR 0081) as \`${String(commit).slice(0, 12)}\`. ` +
    'A merge made with the workflow\'s token does not close the Issues a pull request links, so the queue closes this one (#496).';
}

export function squashOutcome({ status, stdout, stderr }) {
  if (status === 0) return 'merged';
  if (/^CONFLICT \(/mu.test(stdout) || /Automatic merge failed/u.test(stderr)) return 'conflict';
  return 'failed';
}

/** The ref a candidate is tested on: temporary, run-scoped, deleted after the attempt. */
export function candidateRef(pr, runId) {
  return `refs/heads/nightly/candidate-${pr}-${runId}`;
}

/**
 * The identity the prepared commit is written with: the head's own author, as author and committer.
 * A hosted runner has no configured `user.name`, and `git commit-tree` refuses an empty identity;
 * taking it from the head keeps the prepared commit reproducible from the head and the dev tip.
 * `authorLine` is the head's `git log -1 --format=%an%n%ae`.
 */
export function commitIdentity(authorLine) {
  const [name = '', email = ''] = authorLine.split(/\r?\n/u).map((part) => part.trim());
  if (name.length === 0 || email.length === 0) {
    throw new Error(`head author identity is incomplete: ${JSON.stringify(authorLine)}`);
  }
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

function pullRequest(repo, pr) {
  return parseJson(ghOrThrow(['pr', 'view', String(pr), '--repo', repo, '--json', PR_VIEW_FIELDS]), `gh pr view ${pr}`);
}

function fetchRef(remote, source, target) {
  runOrThrow('git', ['fetch', '--no-tags', remote, `+${source}:${target}`]);
  return runOrThrow('git', ['rev-parse', target]).trim();
}

function prepareCommand(options) {
  const { repo, pr, remote, dryRun } = options;
  const runId = options.runId ?? process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
  const ref = candidateRef(pr, runId);
  const record = pullRequest(repo, pr);
  const dev = record.baseRefName;
  if (options.requestedTarget !== undefined && options.requestedTarget !== dev) throw new Error('target-override-refused');
  if (!queueTarget(dev) || record.state !== 'OPEN' || record.isDraft || record.headRepository?.nameWithOwner !== repo) {
    throw new Error('unsupported-or-unready-candidate');
  }

  const headRef = `refs/remotes/origin/nightly/candidate-${pr}`;
  const head = fetchRef(remote, `refs/pull/${pr}/head`, headRef);
  const devTip = fetchRef(remote, `refs/heads/${dev}`, `refs/remotes/origin/${dev}`);
  if (head !== record.headRefOid || devTip !== record.baseRefOid) throw new Error('candidate-moved-before-prepare');

  // git resolves the committer before a three-way merge, even one that stops before committing, so
  // the squash and the commit run under the same identity: the head's own.
  const identity = commitIdentity(runOrThrow('git', ['log', '-1', '--format=%an%n%ae', headRef]));

  const worktree = mkdtempSync(join(tmpdir(), `ai7-queue-${pr}-`));
  try {
    runOrThrow('git', ['worktree', 'add', '--detach', worktree, `refs/remotes/origin/${dev}`]);
    // A conflict is a squash that fails with a merge base present. Without one the checkout does
    // not carry the history — a shallow checkout would report every candidate as a conflict.
    const base = run('git', ['merge-base', devTip, head]);
    if (base.status !== 0) {
      throw new Error(
        `no merge base between ${dev}@${devTip.slice(0, 12)} and the head ${head.slice(0, 12)} of #${pr}: prepare needs the full history of ${dev} (fetch-depth: 0), not a shallow checkout`,
      );
    }
    const merged = run('git', ['merge', '--squash', '--no-commit', headRef], { cwd: worktree, env: identity });
    const outcome = squashOutcome(merged);
    if (outcome === 'failed') {
      throw new Error(`git merge --squash of #${pr} onto ${dev}@${devTip.slice(0, 12)} failed, and not with a conflict:\n${merged.stderr}${merged.stdout}`);
    }
    if (outcome === 'conflict') {
      process.stdout.write(merged.stdout);
      postComment(repo, pr, formatCandidateComment({ reason: 'conflict', dev, devTip }), {
        dryRun,
        marker: `\`conflict on ${dev}@${devTip.slice(0, 12)}\``,
      });
      return 2;
    }

    const trailers = coAuthorTrailers(runOrThrow('git', ['log', '-1', '--format=%B', headRef]));
    const message = squashMessage(record.title, record.body ?? '', trailers);
    const date = runOrThrow('git', ['log', '-1', '--format=%aI', headRef]).trim();
    const tree = runOrThrow('git', ['write-tree'], { cwd: worktree }).trim();
    // The identity and both dates are the head's own: a hosted runner needs no configured
    // `user.name`, a re-run reproduces one commit rather than a new one, and the forced update of a
    // stale temporary ref is a true no-op.
    const commit = runOrThrow('git', ['commit-tree', tree, '-p', devTip, '-F', '-'], {
      cwd: worktree,
      env: { ...identity, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      input: message,
    }).trim();

    if (dryRun) {
      runOrThrow('git', ['update-ref', `refs/nightly/queue-dry-run-${pr}`, commit]);
      process.stdout.write(
        `${JSON.stringify(
          {
            dryRun: true,
            pr,
            ref,
            devTip,
            head,
            commit,
            wouldPush: `git push --force-with-lease ${remote} ${commit}:${ref}`,
            wouldMerge: `gh pr merge ${pr} --squash --match-head-commit ${head} --subject <title> --body-file -`,
            message,
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }

    runOrThrow('git', ['update-ref', ref, commit]);
    runOrThrow('git', ['push', '--force-with-lease', remote, `${ref}:${ref}`]);
    const summary = { pr, ref, dev, devTip, head, commit };
    if (options.output !== undefined) writeGithubOutput(options.output, summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } finally {
    run('git', ['worktree', 'remove', '--force', worktree]);
    rmSync(worktree, { recursive: true, force: true });
  }
}

// ---- merge and cleanup ----------------------------------------------------------------------

/**
 * Closes the open Issues the merged pull request links. The merge has already happened, so a failure
 * here is reported on the job's output and never undoes or fails it.
 */
function closeLinkedIssues(repo, pr, dev) {
  let merged;
  try {
    merged = parseJson(
      ghOrThrow(['pr', 'view', String(pr), '--repo', repo, '--json', 'closingIssuesReferences,mergeCommit']),
      `gh pr view ${pr}`,
    );
  } catch (error) {
    process.stdout.write(`queue: #${pr} merged; its linked Issues could not be read: ${error.message}\n`);
    return;
  }
  for (const issue of linkedIssues(merged.closingIssuesReferences, repo)) {
    try {
      const state = ghOrThrow(['issue', 'view', String(issue), '--repo', repo, '--json', 'state', '--jq', '.state']).trim();
      if (state !== 'OPEN') continue;
      const comment = closingComment({ pr, dev, commit: merged.mergeCommit?.oid ?? '' });
      ghOrThrow(['issue', 'close', String(issue), '--repo', repo, '--reason', 'completed', '--comment', comment]);
      process.stdout.write(`queue: closed #${issue}, which #${pr} links\n`);
    } catch (error) {
      process.stdout.write(`queue: #${pr} merged; #${issue} could not be closed: ${error.message}\n`);
    }
  }
}

function mergeCommand(options) {
  const { repo, pr, remote, expectedDevTip, head, dryRun } = options;
  const record = pullRequest(repo, pr);
  const dev = record.baseRefName;
  if (options.requestedTarget !== undefined && options.requestedTarget !== dev) throw new Error('target-override-refused');
  if (!queueTarget(dev)) throw new Error('unsupported-merge-target');
  const devTip = fetchRef(remote, `refs/heads/${dev}`, `refs/remotes/origin/${dev}`);
  if (record.state === 'MERGED') {
    process.stdout.write(`queue: #${pr} is already merged; nothing to do\n`);
    return 0;
  }
  if (devTip !== expectedDevTip) {
    postComment(repo, pr, formatCandidateComment({ reason: 'moved', dev, devTip }), {
      dryRun,
      marker: `\`${dev}\` moved to \`${devTip.slice(0, 12)}\``,
    });
    return 3;
  }
  if (record.headRefOid !== head || record.baseRefOid !== devTip || record.headRepository?.nameWithOwner !== repo) throw new Error('candidate-head-or-base-moved');
  const authorization = authorizationFor(repo, record);
  if (!authorization.allowed) throw new Error(`merge-not-authorized/${authorization.reason}`);
  if (ownerReservation(pullRequestFiles(repo, pr, record)) !== null) throw new Error('owner-reserved-candidate');

  // The same trailers `prepare` put on the tested commit, read from the same head.
  const headRef = `refs/remotes/origin/nightly/merge-${pr}`;
  if (fetchRef(remote, `refs/pull/${pr}/head`, headRef) !== head) throw new Error('candidate-head-moved');
  if (run('git', ['merge-base', '--is-ancestor', devTip, head]).status !== 0) throw new Error('candidate-needs-current-base');
  verifyHostedRelease(repo, record, authorization);
  verifySliceClosures(repo, authorization, head);
  const tested = fetchRef(remote, options.candidate, `refs/remotes/origin/nightly/tested-${pr}`);
  if (tested !== options.candidate) throw new Error('tested-candidate-moved');
  const parents = runOrThrow('git', ['show', '-s', '--format=%P', tested]).trim();
  const tree = runOrThrow('git', ['show', '-s', '--format=%T', tested]).trim();
  const mergeTree = runOrThrow('git', ['merge-tree', '--write-tree', devTip, head]).trim().split('\n')[0];
  if (parents !== devTip || tree !== mergeTree) throw new Error('gate-tested-another-candidate');
  const { run: gateRun, jobs: allJobs } = gateOccurrence(repo, options['gate-run']);
  let candidateRefHead;
  if (String(options['gate-run']) === process.env.GITHUB_RUN_ID) {
    candidateRefHead = api(repo, `git/ref/heads/nightly/candidate-${pr}-${options['gate-run']}`).object?.sha;
  }
  const proofCommit = String(options['gate-run']) === String(authorization.release.gateRun) ? authorization.release.testedCommit : tested;
  if (gateRun.repository?.full_name !== repo || !hostedGatePassed({ run: gateRun, jobs: allJobs, pr, candidate: proofCommit,
    head, base: devTip, docs: documentationOnly(pullRequestFiles(repo, pr, record)),
    currentRun: process.env.GITHUB_ACTIONS === 'true' ? process.env.GITHUB_RUN_ID : undefined, candidateRefHead })) {
    throw new Error('missing-successful-exact-candidate-gate');
  }
  const body = mergeBody(record.body ?? '', coAuthorTrailers(runOrThrow('git', ['log', '-1', '--format=%B', headRef])));
  const args = ['pr', 'merge', String(pr), '--repo', repo, '--squash', '--match-head-commit', head, '--subject', record.title, '--body-file', '-'];
  if (dryRun) {
    process.stdout.write(`[dry-run] gh ${args.join(' ')}\n[dry-run] body:\n${body}`);
    return 0;
  }
  // Re-read authority and both refs after remote evidence inspection, immediately before merge.
  const latest = pullRequest(repo, pr);
  const latestAuthorization = authorizationFor(repo, latest);
  if (latest.headRefOid !== head || latest.baseRefOid !== devTip || latest.isDraft || latest.state !== 'OPEN' ||
      latest.baseRefName !== dev || !latestAuthorization.allowed ||
      latestAuthorization.release.id !== authorization.release.id ||
      fetchRef(remote, `refs/heads/${dev}`, `refs/remotes/origin/${dev}`) !== devTip) throw new Error('release-or-candidate-changed');
  ghOrThrow(args, { input: body });
  process.stdout.write(`queue: #${pr} squashed onto ${dev}@${devTip.slice(0, 12)}\n`);
  if (dev === DEV) closeLinkedIssues(repo, pr, dev);
  return 0;
}

// ---- Existing PR Gate projection, executed only by its trusted control jobs -----------------

function gateCommand(options) {
  const { repo, pr, head, expectedDevTip } = options;
  const record = pullRequest(repo, pr);
  if (!queueTarget(record.baseRefName)) {
    process.stdout.write('E2E_GATE/unsupported-target\n');
    return 0;
  }
  const sameCandidate = record.headRefOid === head && record.baseRefOid === expectedDevTip &&
    queueTarget(record.baseRefName) && record.headRepository?.nameWithOwner === repo;
  const authorization = sameCandidate ? authorizationFor(repo, record) : { allowed: false };
  let currentTree = false;
  if (sameCandidate) {
    const fetchedHead = fetchRef('origin', `refs/pull/${pr}/head`, `refs/remotes/origin/nightly/gate-${pr}`);
    const fetchedBase = fetchRef('origin', `refs/heads/${record.baseRefName}`, `refs/remotes/origin/${record.baseRefName}`);
    currentTree = fetchedHead === head && fetchedBase === expectedDevTip &&
      run('git', ['merge-base', '--is-ancestor', expectedDevTip, head]).status === 0;
  }
  const docs = sameCandidate && documentationOnly(pullRequestFiles(repo, pr, record));
  let proven = false;
  if (authorization.allowed && currentTree) {
    try {
      verifySliceClosures(repo, authorization, head);
      proven = verifyHostedRelease(repo, record, authorization);
    } catch { /* Never replace missing proof with a receipt's claim. */ }
  }
  const tested = (proven && ['success', 'reused'].includes(options['gate-result'])) || (docs && options['gate-result'] === 'skipped');
  const allowed = sameCandidate && currentTree && authorization.allowed && tested;
  ghOrThrow(['api', '--method', 'POST', `repos/${repo}/statuses/${head}`,
    '-f', `state=${allowed ? 'success' : 'failure'}`, '-f', 'context=E2E Functional Gate',
    '-f', `target_url=${runUrl()}`, '-f', `description=${allowed ? 'Current candidate tested and expressly released' : 'Current candidate lacks tests or role release'}`]);
  if (!allowed) throw new Error('gate-candidate-not-authorized');
  process.stdout.write('E2E_GATE/current-candidate-released\n');
  return 0;
}

function reuseGateCommand(options) {
  const record = pullRequest(options.repo, options.pr);
  const authorization = authorizationFor(options.repo, record);
  let reuse = false;
  if (record.headRefOid === options.head && record.baseRefOid === options.expectedDevTip && authorization.allowed) {
    try {
      verifySliceClosures(options.repo, authorization, record.headRefOid);
      reuse = verifyHostedRelease(options.repo, record, authorization);
    } catch { /* Run the existing tests normally. */ }
  }
  if (options.output !== undefined) writeGithubOutput(options.output, { proof_reused: reuse, ...(reuse ? { run_gate: false } : {}) });
  return 0;
}

function cleanupCommand(options) {
  const { remote, ref, dryRun } = options;
  if (dryRun) {
    process.stdout.write(`[dry-run] git push --delete ${remote} ${ref}\n`);
    return 0;
  }
  const result = run('git', ['push', '--delete', remote, ref]);
  // A skipped candidate never pushed a ref; cleanup says so rather than failing the occurrence.
  if (result.status !== 0 && !/remote ref does not exist|unable to delete/iu.test(result.stderr)) {
    throw describeFailure('git', ['push', '--delete', ref], result);
  }
  process.stdout.write(`queue: deleted ${ref}\n`);
  return 0;
}

// ---- reporting a candidate's outcome --------------------------------------------------------

/**
 * Post one candidate's outcome on its own pull request. A platform's result is read back from the
 * payload-safe marker lines the platform job kept; a candidate the Owner reserved is announced
 * after both platforms passed, and one the queue refused to merge says why.
 */
function reportCommand(options) {
  const { repo, pr, reason, platform, log } = options;
  const marker =
    reason === 'unreleased'
      ? 'this candidate has no current role release'
      : reason === 'reserved'
      ? 'this pull request is left to the Owner'
      : reason === 'moved'
        ? 'is no longer the tree that would land'
        : reason === 'conflict'
          ? 'cannot be squashed onto the current'
          : `Nightly merge queue — ${platform}`;

  let lines;
  if (reason === undefined) {
    const result = log !== undefined && existsSync(log) ? parseGateLog(readFileSync(log, 'utf8')) : null;
    lines = formatResultComment({ platform, runUrl: runUrl(), result });
  } else {
    lines = formatCandidateComment({
      reason,
      dev: options.dev,
      devTip: options.devTip,
      reservedPath: reservationPath(repo, pr, options['reserved-path']),
    });
  }
  postComment(repo, pr, lines, { dryRun: options.dryRun, marker });
  process.stdout.write(`queue: reported #${pr} (${reason ?? platform})\n`);
  return 0;
}

/** What the Owner reserved in a candidate — read again here so the comment names a real path. */
function reservationPath(repo, pr, explicit) {
  if (explicit !== undefined) return explicit;
  const reservation = ownerReservation(pullRequestFiles(repo, pr));
  return reservation === null ? 'an Owner-reserved record' : reservation.path;
}

// ---- command line ---------------------------------------------------------------------------

const USAGE = `usage: node tools/nightly-queue.mjs <command> [options]

  list      [--repo <owner/name>] [--output <github-output file>]
  prepare   --pr <n> [--repo <…>] [--remote origin] [--dev dev] [--output <github-output file>]
  merge     --pr <n> --head <sha> --expected-dev-tip <sha> --candidate <sha> --gate-run <id> [--dry-run]
  cleanup   --ref <refs/heads/…> [--remote origin] [--dry-run]
  report    --pr <n> [--platform <label> --log <file> | --reason conflict|moved|reserved
            [--dev <branch> --dev-tip <sha> --reserved-path <path>]] [--dry-run]

  --dry-run prints what would be pushed and merged and touches no remote.`;

const VALUE_FLAGS = new Set([
  'repo',
  'output',
  'pr',
  'remote',
  'dev',
  'ref',
  'head',
  'expected-dev-tip',
  'dev-tip',
  'platform',
  'log',
  'reason',
  'reserved-path',
  'candidate',
  'gate-run',
  'gate-result',
]);

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name === 'dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new Error(`unknown option --${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
    index += 1;
    options[name] = value;
  }
  options.repo = options.repo ?? process.env.GITHUB_REPOSITORY ?? 'zhouy1017/ai7-harness';
  options.remote = options.remote ?? 'origin';
  options.requestedTarget = options.dev;
  options.dev = options.dev ?? DEV;
  options.dryRun = options.dryRun === true;
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  const [command] = options._;

  if (command === 'list') return listCommand(options);

  if (command === 'gate-refresh') {
    if (options.pr === undefined) throw new Error('gate-refresh needs --pr');
    const record = pullRequest(options.repo, Number(options.pr));
    return gateCommand({ ...options, pr: record.number, head: record.headRefOid, expectedDevTip: record.baseRefOid,
      'gate-result': documentationOnly(pullRequestFiles(options.repo, record.number, record)) ? 'skipped' : 'reused' });
  }

  if (command === 'gate-status' || command === 'gate-reuse') {
    for (const required of ['pr', 'head', 'expected-dev-tip']) {
      if (options[required] === undefined) throw new Error(`${command} needs --${required}`);
    }
    if (!/^[a-f0-9]{40}$/u.test(options.head) || !/^[a-f0-9]{40}$/u.test(options['expected-dev-tip'])) throw new Error('invalid-gate-candidate');
    const gateOptions = { ...options, pr: Number(options.pr), expectedDevTip: options['expected-dev-tip'] };
    return command === 'gate-reuse' ? reuseGateCommand(gateOptions) : gateCommand(gateOptions);
  }

  if (command === 'prepare') {
    if (options.pr === undefined) throw new Error('prepare needs --pr');
    return prepareCommand({ ...options, pr: Number(options.pr) });
  }

  if (command === 'merge') {
    for (const required of ['pr', 'head', 'expected-dev-tip', 'candidate', 'gate-run']) {
      if (options[required] === undefined) throw new Error(`merge needs --${required}`);
    }
    if (!/^[a-f0-9]{40}$/u.test(options.candidate) || !/^[1-9][0-9]*$/u.test(options['gate-run'])) throw new Error('invalid-gate-identity');
    return mergeCommand({
      ...options,
      pr: Number(options.pr),
      head: options.head,
      expectedDevTip: options['expected-dev-tip'],
    });
  }

  if (command === 'cleanup') {
    if (options.ref === undefined) throw new Error('cleanup needs --ref');
    if (!/^refs\/heads\/nightly\/candidate-[1-9][0-9]*-(?:[1-9][0-9]*|local-[0-9]+)$/u.test(options.ref)) throw new Error('cleanup-ref-outside-candidate-scope');
    return cleanupCommand(options);
  }

  if (command === 'report') {
    if (options.pr === undefined) throw new Error('report needs --pr');
    if (options.reason === undefined && options.platform === undefined) {
      throw new Error('report needs --platform or --reason');
    }
    return reportCommand({ ...options, pr: Number(options.pr), devTip: options['dev-tip'] });
  }

  process.stderr.write(`${USAGE}\n`);
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`NIGHTLY_QUEUE/${error instanceof Error ? error.message : 'unknown'}\n`);
    process.exitCode = 1;
  }
}
