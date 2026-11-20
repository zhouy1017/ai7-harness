import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveSourceCheckoutLaunchPolicy } from '../../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../../src/shared/protocol.js';
import { withRuleFor } from '../../support/policy-rules.js';
import { type EditorialCase, validateCase } from './case-file.js';
import { runPolishCase } from './run-polish.js';
import { chapterScope, observeReviewRun, runReviewCase } from './run-review.js';
import { clarificationRun, finalizedNewsRelease, sample1DerivedLibraryItem } from './run-setups.js';
import { initialEvaluationCase, readersReportCase, writingDraftCase } from './run-structural.js';
import { createCaseRoots, deterministicOwner, developerLiveReplayOwner, type ImportedBook, importManuscript, openStore, type ReplayTally, workingBlocks } from './session.js';
import { resolveTextAnchors } from './text-cases.js';

/**
 * The editorial case runner (Issue #812) that `tools/editorial-evidence.mjs` bundles in memory. `runEditorialCase` runs one
 * case in its own disposable product and returns its metrics; every field is a count, an identity, a digest, a state or a case's
 * own id — never manuscript or model text — so the harness can print and store it anywhere.
 */

export { validateCase };
export * as scoring from './scoring.js';

export interface CaptureSummary {
  readonly itemId: string | null;
  readonly selectedItemId: string | null;
  readonly capturedAt: string | null;
  readonly model: string | null;
  readonly route: string | null;
  readonly taskPromptContractDigest: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface CaseMetrics {
  readonly id: string;
  readonly kind: EditorialCase['kind'];
  readonly title: string;
  readonly manuscript: string;
  readonly measuredPass: EditorialCase['measuredPass'];
  readonly pass?: string;
  readonly evidence: {
    readonly fixtures: ReadonlyArray<{ identity: string; sha256: string; provenance: string }>;
    readonly binding: 'deterministic' | 'developer-live-replay' | 'developer-live-store-copy';
    readonly captures: ReadonlyArray<CaptureSummary>;
    readonly model: string | null;
    readonly route: string | null;
    readonly taskContracts: ReadonlyArray<string>;
    readonly capturedFrom: string | null;
    readonly capturedTo: string | null;
    readonly recordedUsage: { requests: number; inputTokens: number; outputTokens: number };
    /** Developer-live replay only: the task contracts the replayed Runs froze, and whether every answering capture's is among them. */
    readonly replayContracts: ReadonlyArray<string>;
    readonly contractsAgree: boolean | null;
  };
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly findings: Readonly<Record<string, number>> | null;
  /** `unmeasured`: in a unit the Run holds no answer for; `excludedOnly`: raised by the model in a quotation the product could not place. */
  readonly concerns: { total: number; met: ReadonlyArray<string>; missed: ReadonlyArray<string>; unmeasured?: ReadonlyArray<string>; excludedOnly?: ReadonlyArray<string> };
  readonly checks: { total: number; triggered: ReadonlyArray<string> };
  readonly effort: Readonly<Record<string, number | boolean>> | null;
  readonly delivery: { kind: string; recorded: boolean } | null;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly replay: { answered: number; unmatched: number; elapsedMs: number };
}

export interface RunCaseRequest {
  readonly codeRoot: string;
  readonly fixturesRoot: string;
  readonly testCase: EditorialCase;
}

/** Historical captures keep their declared contract: no platform tools, and no v14 question wrapper unless recorded. */
function replayPolicy(policy: LaunchPolicyProjection, testCase: EditorialCase): LaunchPolicyProjection {
  if (testCase.replay.route !== 'developer-live') return policy;
  const modelQuestions = testCase.replay.modelQuestions;
  const platformTools = testCase.replay.platformTools === true;
  const kinds = testCase.kind === 'initial-evaluation' ? ['evaluation'] : testCase.kind === 'readers-report' ? ['evaluation', 'readers-report']
    : testCase.kind === 'writing-draft' ? ['writing']
      : (testCase.input.categories as ReadonlyArray<string> | undefined)?.map((category) => `editorial-review/${category}`) ?? [];
  return kinds.reduce((current, kind) => withRuleFor(current, kind, {
    webSearchToolAllowed: false,
    ...(platformTools ? {} : { platformTools: null }),
    ...(modelQuestions ? {} : { clarificationQuestionAllowed: false, clarificationTimeoutHours: null }),
  }), policy);
}

async function replayLedgerContracts(inputRoot: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(inputRoot, 'replay-ledger', 'ledger.jsonl'), 'utf8');
    return new Set(raw.split('\n').filter((line) => line.length > 0).flatMap((line) => {
      const parsed = JSON.parse(line) as { taskPromptContractDigest?: string; promptContractDigest?: string };
      return [parsed.taskPromptContractDigest, parsed.promptContractDigest].filter((digest): digest is string => typeof digest === 'string');
    }));
  } catch { return new Set(); }
}

function evidenceOf(
  fixtures: ReadonlyArray<ResolvedModelFixture>,
  binding: CaseMetrics['evidence']['binding'],
  relevant: (entry: { requestDigest: string; capture?: { taskPromptContractDigest: string | null } | null }) => boolean,
  replay: { used: ReadonlySet<string>; answered: ReadonlySet<string> } | null = null,
): CaseMetrics['evidence'] {
  const entries = fixtures.flatMap((fixture) => [...fixture.entries.values()]).filter((entry) => relevant(entry));
  const captures: CaptureSummary[] = entries.map((entry) => ({
    itemId: entry.capture?.itemId ?? null, selectedItemId: entry.capture?.selectedItemId ?? null, capturedAt: entry.capture?.capturedAt ?? null,
    model: entry.capture?.model ?? null, route: entry.capture?.route ?? null, taskPromptContractDigest: entry.capture?.taskPromptContractDigest ?? null,
    inputTokens: entry.response.kind === 'unit-result' ? entry.response.usage.inputTokens : 0,
    outputTokens: entry.response.kind === 'unit-result' ? entry.response.usage.outputTokens : 0,
  }));
  const dates = captures.flatMap((capture) => capture.capturedAt ?? []).sort();
  const only = <T>(values: ReadonlyArray<T | null>): T | null => { const set = [...new Set(values.filter((value): value is T => value !== null))]; return set.length === 1 ? set[0]! : null; };
  return {
    fixtures: fixtures.map((fixture) => ({ identity: fixture.identity, sha256: fixture.sha256, provenance: fixture.provenance })),
    binding, captures,
    model: only(captures.map((capture) => capture.model)), route: only(captures.map((capture) => capture.route)),
    taskContracts: [...new Set(captures.flatMap((capture) => capture.taskPromptContractDigest ?? []))],
    capturedFrom: dates[0] ?? null, capturedTo: dates.at(-1) ?? null,
    recordedUsage: { requests: entries.length, inputTokens: captures.reduce((total, capture) => total + capture.inputTokens, 0),
      outputTokens: captures.reduce((total, capture) => total + capture.outputTokens, 0) },
    replayContracts: replay === null ? [] : [...replay.used].sort(),
    contractsAgree: replay === null ? null : [...replay.answered].every((digest) => replay.used.has(digest)),
  };
}

export async function runEditorialCase(request: RunCaseRequest): Promise<CaseMetrics> {
  const { codeRoot, fixturesRoot, testCase } = request;
  const started = Date.now();
  const tally: ReplayTally = { answered: 0, unmatched: 0, answeredContracts: new Set() };
  if (testCase.replay.route === 'score-only') throw new Error(`EDITORIAL_CASE/score-only: ${testCase.id}`);
  const base = caseBase(testCase);
  const concernsTotal = testCase.expectedConcerns.length;
  const checksTotal = testCase.falsePositiveChecks.length;
  if (testCase.kind === 'clarification') {
    const identities = testCase.input.fixtures as { normal: string; ambiguous: string };
    const fixtures = { normal: await loadModelFixture(fixturesRoot, identities.normal), ambiguous: await loadModelFixture(fixturesRoot, identities.ambiguous) };
    const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    const observe = async (fixture: ResolvedModelFixture, ambiguous: boolean) => {
      const roots = await createCaseRoots();
      const store = await openStore(roots, codeRoot, fixture);
      try {
        const book = await importManuscript(store, codeRoot, roots, testCase.manuscript, testCase.bookTitle);
        return await clarificationRun(store, roots.dataRoot, fixture, book, policy, ambiguous);
      } finally { store.close(); await roots.dispose(); }
    };
    const normal = await observe(fixtures.normal, false);
    const ambiguous = await observe(fixtures.ambiguous, true);
    const concern = testCase.expectedConcerns.find((entry) => entry.run === 'ambiguous');
    const met = concern !== undefined && (concern.units ?? []).every((unit) => ambiguous.unitsAsked.includes(unit)) ? [concern.id] : [];
    return {
      ...base,
      evidence: evidenceOf([fixtures.normal, fixtures.ambiguous], 'deterministic', () => true),
      outcome: { normal, ambiguous },
      findings: null,
      concerns: { total: concernsTotal, met, missed: testCase.expectedConcerns.map((entry) => entry.id).filter((id) => !met.includes(id)) },
      checks: { total: checksTotal, triggered: normal.questions > 0 ? testCase.falsePositiveChecks.filter((check) => check.run === 'normal').map((check) => check.id) : [] },
      effort: null, delivery: null, result: null,
      replay: { answered: 0, unmatched: 0, elapsedMs: Date.now() - started },
    };
  }

  const fixture = await loadModelFixture(fixturesRoot, testCase.fixture!);
  const basis = typeof testCase.input.evaluationFixture === 'string' ? await loadModelFixture(fixturesRoot, testCase.input.evaluationFixture) : null;
  const fixtures = basis === null ? [fixture] : [basis, fixture];
  const deterministic = testCase.replay.route === 'deterministic';
  const roots = await createCaseRoots();
  const store = await openStore(roots, codeRoot, fixture);
  let owner: ReturnType<typeof deterministicOwner> | null = null;
  const reportOwners: Array<ReturnType<typeof deterministicOwner>> = [];
  try {
    const book = await importManuscript(store, codeRoot, roots, testCase.manuscript, testCase.bookTitle);
    const policy = deterministic ? await resolveSourceCheckoutLaunchPolicy(codeRoot) : replayPolicy(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live'), testCase);
    const binding = deterministic ? 'deterministic' as const : 'developer-live-replay' as const;
    if (testCase.kind === 'polish') {
      const resolution = resolveTextAnchors(store, book, testCase);
      const observed = await runPolishCase(store, fixture, book, testCase, resolution);
      return {
        ...base,
        evidence: evidenceOf(fixtures, binding, (entry) => entry.requestDigest === observed.requestDigest),
        outcome: observed.outcome, findings: { ...observed.findings },
        concerns: { total: concernsTotal, ...observed.concerns }, checks: { total: checksTotal, ...observed.checks },
        effort: { ...observed.effort }, delivery: null, result: null,
        replay: { answered: observed.outcome.state === 'failed' ? 0 : 1, unmatched: observed.outcome.state === 'failed' ? 1 : 0, elapsedMs: Date.now() - started },
      };
    }
    let materialIds: string[] = [];
    if (testCase.kind === 'material-review') materialIds = [await sample1DerivedLibraryItem(store, roots, book)];
    if (testCase.kind === 'cross-deliverable') await finalizedNewsRelease(store, codeRoot, roots.dataRoot, book);
    owner = deterministic ? deterministicOwner(store, policy, fixture)
      : developerLiveReplayOwner(store, policy, basis === null ? [fixture] : [basis], roots, testCase.id, tally,
        testCase.kind === 'material-review' ? (runRecordId, ledger) => store.materialGuard(runRecordId, ledger) : undefined);
    // A recorded capture belongs to the case when its contract answered one of the case's requests.
    const evidence = async () => {
      if (deterministic) return evidenceOf(fixtures, binding, () => true);
      const used = await replayLedgerContracts(roots.inputRoot);
      return evidenceOf(fixtures, binding, (entry) => typeof entry.capture?.taskPromptContractDigest === 'string' &&
        tally.answeredContracts.has(entry.capture.taskPromptContractDigest), { used, answered: tally.answeredContracts });
    };
    if (testCase.kind === 'review' || testCase.kind === 'material-review' || testCase.kind === 'cross-deliverable') {
      const resolution = resolveTextAnchors(store, book, testCase);
      const observed = await runReviewCase(store, owner, book, policy, testCase, resolution, roots.dataRoot, materialIds);
      return {
        ...base,
        evidence: await evidence(),
        outcome: observed.outcome, findings: { ...observed.findings },
        concerns: { total: concernsTotal, ...observed.concerns }, checks: { total: checksTotal, ...observed.checks },
        effort: { ...observed.effort }, delivery: null, result: { ...observed.defect879 },
        replay: { answered: tally.answered, unmatched: tally.unmatched, elapsedMs: Date.now() - started },
      };
    }
    const observed = testCase.kind === 'initial-evaluation' ? await initialEvaluationCase(store, owner, book, policy, testCase)
      : testCase.kind === 'readers-report' ? await readersReportCase(store, owner,
        () => { const created = developerLiveReplayOwner(store, policy, [fixture], roots, testCase.id, tally); reportOwners.push(created); return created; }, book, policy, testCase)
        : await writingDraftCase(store, owner, book, policy, testCase);
    return {
      ...base,
      evidence: await evidence(),
      outcome: { ...observed.outcome, clarificationsAnswered: observed.clarificationsAnswered }, findings: null,
      concerns: { total: concernsTotal, ...observed.concerns }, checks: { total: checksTotal, ...observed.checks },
      effort: null, delivery: observed.delivery, result: observed.result,
      replay: { answered: tally.answered, unmatched: tally.unmatched, elapsedMs: Date.now() - started },
    };
  } finally {
    await owner?.dispose();
    for (const created of reportOwners) await created.dispose();
    store.markCleanShutdown();
    store.close();
    await roots.dispose();
  }
}

function caseBase(testCase: EditorialCase) {
  return {
    id: testCase.id, kind: testCase.kind, title: testCase.title,
    manuscript: testCase.manuscript.source === 'sample1' ? 'sample1' : testCase.manuscript.source === 'synthetic' ? testCase.manuscript.id : testCase.manuscript.file,
    measuredPass: testCase.measuredPass,
    ...(testCase.pass === undefined ? {} : { pass: testCase.pass }),
  };
}

/**
 * A score-only case's references checked without any Run (#1074): its exact ADR 0091 file is imported into a disposable product,
 * the chapter rule must resolve to the case's chapter titles and every false-positive check must stand exactly once in its
 * paragraph inside that range. Returns counts and positions only.
 */
export async function checkScoreOnlyCase(request: { readonly codeRoot: string; readonly testCase: EditorialCase }): Promise<{
  id: string; chapterRange: { startPosition: number; endPosition: number }; checks: number;
}> {
  const { codeRoot, testCase } = request;
  if (testCase.replay.route !== 'score-only') throw new Error(`EDITORIAL_CASE/not-score-only: ${testCase.id}`);
  const roots = await createCaseRoots();
  const store = await openStore(roots, codeRoot, null);
  try {
    const book = await importManuscript(store, codeRoot, roots, testCase.manuscript, testCase.bookTitle);
    const range = chapterScope(store, book, testCase);
    const resolution = resolveTextAnchors(store, book, testCase);
    for (const check of resolution.checks) {
      if (check.paragraph < range.startPosition || check.paragraph > range.endPosition) throw new Error(`EDITORIAL_CASE/check-outside-range: ${testCase.id}/${check.id}`);
    }
    return { id: testCase.id, chapterRange: { startPosition: range.startPosition, endPosition: range.endPosition }, checks: resolution.checks.length };
  } finally {
    store.markCleanShutdown();
    store.close();
    await roots.dispose();
  }
}

/** The Book's text as content only — kind, level and a digest of each block's words, in order — never its block identities. */
function contentSequence(store: Awaited<ReturnType<typeof openStore>>, book: ImportedBook): string {
  return createHash('sha256').update(JSON.stringify(workingBlocks(store, book).map((block) =>
    [block.kind, block.level, createHash('sha256').update(block.text).digest('hex')]))).digest('hex');
}

/** A fresh import of the case's exact file in a disposable product: its content sequence and its journal position. */
async function freshImport(codeRoot: string, testCase: EditorialCase): Promise<{ content: string; journalSequence: number }> {
  const roots = await createCaseRoots();
  const store = await openStore(roots, codeRoot, null);
  try {
    const book = await importManuscript(store, codeRoot, roots, testCase.manuscript, testCase.bookTitle);
    return { content: contentSequence(store, book), journalSequence: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence };
  } finally {
    store.markCleanShutdown();
    store.close();
    await roots.dispose();
  }
}

/**
 * Score a score-only case (#1074) on the developer-live Run it was made in. The data root is never opened: it is copied into a
 * disposable directory first (the caller has already refused every `fetch`; the product must have stopped before the copy). The
 * Run is bound to the case before anything is scored, and any mismatch refuses:
 * - the copy holds exactly one Book with a primary Manuscript and exactly one Review Run;
 * - that Run is a 选章 Run whose range is the case's chapters and whose categories are exactly the case's;
 * - that Run has settled (the completed state);
 * - the Book is unedited: its content sequence equals a fresh import of the exact file, the journal has not moved since that
 *   import, and the working state is the one the Run was prepared on (its working digest names block identities, which differ
 *   between imports, so it is compared with the copy's own working state, not with the fresh import's).
 * The same scoring, simulated editor, Apply and reversal as a replayed case then run on the copy, which is deleted. Counts, states
 * and identities only.
 */
export async function scoreEditorialCase(request: { readonly codeRoot: string; readonly testCase: EditorialCase; readonly dataRoot: string }): Promise<CaseMetrics> {
  const { codeRoot, testCase } = request;
  if (testCase.replay.route !== 'score-only') throw new Error(`EDITORIAL_CASE/not-score-only: ${testCase.id}`);
  const started = Date.now();
  const parent = await mkdtemp(join(await realpath(tmpdir()), 'ai7-editorial-score-'));
  const copy = join(parent, 'data');
  await cp(request.dataRoot, copy, { recursive: true, errorOnExist: true });
  const caseRoots = await createCaseRoots();
  let store: Awaited<ReturnType<typeof openStore>> | null = null;
  try {
    const database = new DatabaseSync(join(copy, 'store', 'ai7.sqlite'), { readOnly: true });
    const books = database.prepare("SELECT b.book_id, m.manuscript_id FROM books b JOIN manuscripts m ON m.book_id = b.book_id AND m.role = 'primary'").all() as Array<{ book_id: string; manuscript_id: string }>;
    const runCount = books.length !== 1 ? 0 : Number((database.prepare('SELECT COUNT(*) n FROM review_runs WHERE book_id = ?').get(books[0]!.book_id) as { n: number }).n);
    database.close();
    if (books.length !== 1) throw new Error(`EDITORIAL_CASE/score-book-ambiguous: ${testCase.id}`);
    store = await openStore({ ...caseRoots, dataRoot: copy }, codeRoot, null);
    const latest = store.inspectReviewWorkspace(books[0]!.book_id, null).run;
    if (latest === null || latest === undefined) throw new Error(`EDITORIAL_CASE/score-run-absent: ${testCase.id}`);
    const book: ImportedBook = { bookId: books[0]!.book_id, manuscriptId: latest.manuscript.manuscriptId, branchId: latest.manuscript.branchId, revisionId: latest.manuscript.revisionId };
    if (book.manuscriptId !== books[0]!.manuscript_id) throw new Error(`EDITORIAL_CASE/score-manuscript-mismatch: ${testCase.id}`);
    if (runCount !== 1) throw new Error(`EDITORIAL_CASE/score-runs-ambiguous: ${testCase.id}`);
    const range = chapterScope(store, book, testCase);
    const categories = [...(testCase.input.categories as ReadonlyArray<string>)].sort();
    if (latest.scope.kind !== 'chapters' || latest.scope.selectedRange?.startPosition !== range.startPosition || latest.scope.selectedRange?.endPosition !== range.endPosition ||
      JSON.stringify(latest.categories.map((category) => category.categoryId).sort()) !== JSON.stringify(categories)) throw new Error(`EDITORIAL_CASE/score-run-not-case: ${testCase.id}`);
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    const fresh = await freshImport(codeRoot, testCase);
    if (contentSequence(store, book) !== fresh.content || window.journalSequence !== fresh.journalSequence ||
      latest.manuscript.journalSequence !== fresh.journalSequence || latest.manuscript.workingDigest !== window.workingDigest) throw new Error(`EDITORIAL_CASE/score-book-edited: ${testCase.id}`);
    // Only a completed Run is evidence: a prepared, running, partial, failed or cancelled Run would read as "few changes".
    if (latest.state !== 'settled') throw new Error(`EDITORIAL_CASE/score-run-unsettled: ${testCase.id}`);
    const resolution = resolveTextAnchors(store, book, testCase);
    const observed = await observeReviewRun(store, book, latest.reviewRunId, testCase, resolution, copy);
    return {
      ...caseBase(testCase),
      evidence: { fixtures: [], binding: 'developer-live-store-copy', captures: [], model: null, route: null, taskContracts: [], capturedFrom: null, capturedTo: null,
        recordedUsage: { requests: 0, inputTokens: 0, outputTokens: 0 }, replayContracts: [], contractsAgree: null },
      outcome: { ...observed.outcome, chapterRange: { startPosition: range.startPosition, endPosition: range.endPosition } }, findings: { ...observed.findings },
      concerns: { total: 0, ...observed.concerns }, checks: { total: testCase.falsePositiveChecks.length, ...observed.checks },
      effort: { ...observed.effort }, delivery: null,
      result: { ...observed.defect879, changesToOriginal: observed.changesToOriginal,
        run: { reviewRunId: latest.reviewRunId, ordinal: latest.ordinal, state: latest.state, runCount } },
      replay: { answered: 0, unmatched: 0, elapsedMs: Date.now() - started },
    };
  } finally {
    store?.markCleanShutdown();
    store?.close();
    await caseRoots.dispose();
    await rm(parent, { recursive: true, force: true, maxRetries: 5 });
  }
}
