import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The nightly merge queue of ADR 0081: the scheduled orchestrator lists the candidates, builds the
// tree each one would land, and merges the ones the full Gate passed. Every pull-request-touching
// step of the two workflows runs through this file, so the same code is rehearsed locally with
// `--dry-run`. It is CI and developer infrastructure, never a product surface.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The Owner-reserved exclusions of ADR 0081 §4, stated as paths so the Owner can widen them. */
export const OWNER_RESERVED_ADR_PREFIX = 'docs/adr/';
export const OWNER_RESERVED_POLICY_PREFIX = 'docs/policies/';

const MERGEABLE = 'MERGEABLE';
const DEV = 'dev';
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
        record.baseRefName === DEV,
    )
    .map((record) => {
      const reservation = ownerReservation(record.files ?? []);
      return {
        number: record.number,
        title: record.title,
        head: record.headRefOid,
        merge: reservation === null,
        reserved: reservation,
      };
    })
    .sort((left, right) => left.number - right.number);
}

/**
 * The candidate set as the orchestrator consumes it. `mergeable` is computed lazily by GitHub, so
 * an occurrence that reads `UNKNOWN` leaves that pull request to the next night and says so.
 */
export function assembleCandidateSet(records) {
  const candidates = selectCandidates(records);
  const unmergeable = records
    .filter((record) => record.isDraft === false && record.baseRefName === DEV && record.mergeable !== MERGEABLE)
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

const COMPLETION = /^LOCAL_COMPLETION\/([A-Za-z0-9-]+)\/(start|pass|fail|interrupted)$/u;
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

const PR_LIST_FIELDS = 'number,title,isDraft,mergeable,baseRefName,headRefOid';
const PR_VIEW_FIELDS = 'number,title,body,headRefOid,state';

function pullRequestFileText(repo, pr, path) {
  // The raw media type, not the JSON `content` field: the contents API returns an empty body for a
  // file past its size threshold, and an ADR is exactly that size. Read at the pull request's head.
  const ref = encodeURIComponent(`refs/pull/${pr}/head`);
  const query = path.split('/').map(encodeURIComponent).join('/');
  return ghOrThrow(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${query}?ref=${ref}`]);
}

/**
 * One pull request's changed paths, with the text of every changed ADR — the only file text the
 * Owner-reserved filter reads. The list is read at the pull request's own head, so a force-push
 * between listing and testing cannot make the listing describe a different tree.
 */
function pullRequestFiles(repo, pr) {
  const listed = parseJson(ghOrThrow(['pr', 'view', String(pr), '--repo', repo, '--json', 'files']), `gh pr view ${pr}`);
  return (listed.files ?? []).map((file) => {
    const path = String(file.path);
    return path.startsWith(OWNER_RESERVED_ADR_PREFIX)
      ? { path, text: pullRequestFileText(repo, pr, path) }
      : { path };
  });
}

function openPullRequests(repo) {
  const listed = parseJson(
    ghOrThrow(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', PR_LIST_FIELDS]),
    'gh pr list',
  );
  return listed.map((record) => ({ ...record, files: pullRequestFiles(repo, record.number) }));
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

/** The ref a candidate is tested on: temporary, run-scoped, deleted after the attempt. */
export function candidateRef(pr, runId) {
  return `refs/heads/nightly/candidate-${pr}-${runId}`;
}

function pullRequest(repo, pr) {
  return parseJson(ghOrThrow(['pr', 'view', String(pr), '--repo', repo, '--json', PR_VIEW_FIELDS]), `gh pr view ${pr}`);
}

function fetchRef(remote, source, target) {
  runOrThrow('git', ['fetch', '--no-tags', remote, `+${source}:${target}`]);
  return runOrThrow('git', ['rev-parse', target]).trim();
}

function prepareCommand(options) {
  const { repo, pr, remote, dev, dryRun } = options;
  const runId = options.runId ?? process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
  const ref = candidateRef(pr, runId);
  const record = pullRequest(repo, pr);

  const headRef = `refs/remotes/origin/nightly/candidate-${pr}`;
  const head = fetchRef(remote, `refs/pull/${pr}/head`, headRef);
  const devTip = fetchRef(remote, `refs/heads/${dev}`, `refs/remotes/origin/${dev}`);

  const worktree = mkdtempSync(join(tmpdir(), `ai7-queue-${pr}-`));
  try {
    runOrThrow('git', ['worktree', 'add', '--detach', worktree, `refs/remotes/origin/${dev}`]);
    const merged = run('git', ['merge', '--squash', '--no-commit', headRef], { cwd: worktree });
    if (merged.status !== 0) {
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
    // The committer date is the head's own, so a re-run reproduces one commit rather than a new
    // one and the forced update of a stale temporary ref is a true no-op.
    const commit = runOrThrow('git', ['commit-tree', tree, '-p', devTip, '-F', '-'], {
      cwd: worktree,
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
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
    const summary = { pr, ref, devTip, head, commit };
    if (options.output !== undefined) writeGithubOutput(options.output, summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } finally {
    run('git', ['worktree', 'remove', '--force', worktree]);
    rmSync(worktree, { recursive: true, force: true });
  }
}

// ---- merge and cleanup ----------------------------------------------------------------------

function mergeCommand(options) {
  const { repo, pr, remote, dev, expectedDevTip, head, dryRun } = options;
  const devTip = fetchRef(remote, `refs/heads/${dev}`, `refs/remotes/origin/${dev}`);

  const record = pullRequest(repo, pr);
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

  // The same trailers `prepare` put on the tested commit, read from the same head.
  const headRef = `refs/remotes/origin/nightly/merge-${pr}`;
  fetchRef(remote, `refs/pull/${pr}/head`, headRef);
  const body = mergeBody(record.body ?? '', coAuthorTrailers(runOrThrow('git', ['log', '-1', '--format=%B', headRef])));
  const args = ['pr', 'merge', String(pr), '--repo', repo, '--squash', '--match-head-commit', head, '--subject', record.title, '--body-file', '-'];
  if (dryRun) {
    process.stdout.write(`[dry-run] gh ${args.join(' ')}\n[dry-run] body:\n${body}`);
    return 0;
  }
  ghOrThrow(args, { input: body });
  process.stdout.write(`queue: #${pr} squashed onto ${dev}@${devTip.slice(0, 12)}\n`);
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
    reason === 'reserved'
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
  merge     --pr <n> --head <sha> --expected-dev-tip <sha> [--dry-run]
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
  options.dev = options.dev ?? DEV;
  options.dryRun = options.dryRun === true;
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  const [command] = options._;

  if (command === 'list') return listCommand(options);

  if (command === 'prepare') {
    if (options.pr === undefined) throw new Error('prepare needs --pr');
    return prepareCommand({ ...options, pr: Number(options.pr) });
  }

  if (command === 'merge') {
    for (const required of ['pr', 'head', 'expected-dev-tip']) {
      if (options[required] === undefined) throw new Error(`merge needs --${required}`);
    }
    return mergeCommand({
      ...options,
      pr: Number(options.pr),
      head: options.head,
      expectedDevTip: options['expected-dev-tip'],
    });
  }

  if (command === 'cleanup') {
    if (options.ref === undefined) throw new Error('cleanup needs --ref');
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
