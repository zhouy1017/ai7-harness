import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveSourceCheckoutLaunchPolicy } from '../../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../../src/shared/protocol.js';
import { withRuleFor } from '../../support/policy-rules.js';
import { type EditorialCase, validateCase } from './case-file.js';
import { runPolishCase } from './run-polish.js';
import { runReviewCase } from './run-review.js';
import { clarificationRun, finalizedNewsRelease, sample1DerivedLibraryItem } from './run-setups.js';
import { initialEvaluationCase, readersReportCase, writingDraftCase } from './run-structural.js';
import { createCaseRoots, deterministicOwner, developerLiveReplayOwner, importManuscript, openStore, type ReplayTally } from './session.js';
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
  readonly evidence: {
    readonly fixtures: ReadonlyArray<{ identity: string; sha256: string; provenance: string }>;
    readonly binding: 'deterministic' | 'developer-live-replay';
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
  const kinds = testCase.kind === 'initial-evaluation' ? ['evaluation'] : testCase.kind === 'readers-report' ? ['evaluation', 'readers-report']
    : testCase.kind === 'writing-draft' ? ['writing']
      : (testCase.input.categories as ReadonlyArray<string> | undefined)?.map((category) => `editorial-review/${category}`) ?? [];
  return kinds.reduce((current, kind) => withRuleFor(current, kind, {
    webSearchToolAllowed: false, platformTools: null,
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
  const base = {
    id: testCase.id, kind: testCase.kind, title: testCase.title,
    manuscript: testCase.manuscript.source === 'sample1' ? 'sample1' : testCase.manuscript.id, measuredPass: testCase.measuredPass,
  };
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

  const fixture = await loadModelFixture(fixturesRoot, testCase.fixture);
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
