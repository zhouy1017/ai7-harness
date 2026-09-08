import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner, DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS } from '../../src/service/analysis/execution.js';
import {
  SAMPLE1_SOURCE_DIGEST,
  blockedReasons,
  namedNonEffects,
  providerConsequence,
} from '../../src/service/analysis/baseline-analysis-store.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { loadModelFixture, resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';
import { ownBlockIdsOf, substituteBlockPlaceholders } from '../../src/service/provider/local-deterministic-adapter.js';
import {
  OPENCODE_GO_ENDPOINT,
  OPENCODE_GO_SESSION_HEADER,
  OPENCODE_GO_USER_AGENT,
} from '../../src/service/provider/deepseek-adapter.js';
import {
  PROVIDER_LEDGER_FILE,
  ProviderResultCache,
  providerRequestDigest,
} from '../../src/service/provider/provider-result-cache.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';
import {
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the developer-live scope. Everything is real except the
// transport: the store, the plan, the pinned DSH composition, the Egress Gate, the Credential
// Broker, the Provider Test Ledger, and the Provider Result Cache all run exactly as they do on a
// developer host. The transport is a stub function, so no socket is opened, no host is resolved, and
// no credential value beyond a local placeholder exists. The manuscript is exact `sample1` (ADR 0043).

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
type Ceiling = { readonly kind: 'tokens'; readonly maxTotalTokens: number };
const CEILING: Ceiling = { kind: 'tokens', maxTotalTokens: 500_000 };
type UnitAnswer = { text: string; usage: { inputTokens: number; outputTokens: number } };

interface StubCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

let roots: ServiceTestRoots;
let cacheRoot: string;
let launchPolicy: LaunchPolicyProjection;
/** Every store this test opened, so a failing assertion still releases the database file. */
let opened: EditorialStore[] = [];

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-developer-live-');
  cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-provider-cache-'));
  opened = [];
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  expect(launchPolicy.integrityState).toBe('verified');
  expect(launchPolicy.operationalScope).toBe('developer-live');
});

afterEach(async () => {
  for (const store of opened) {
    try {
      await store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  await roots.dispose();
  await rm(cacheRoot, { recursive: true, force: true });
});

/** The trusted launch a developer-live host binds, with the ceiling under test. */
function liveBinding(ceiling: Ceiling) {
  return {
    operationalScope: 'developer-live' as const,
    live: {
      route: DEVELOPER_LIVE_POLICY_BINDING.route,
      model: DEVELOPER_LIVE_POLICY_BINDING.model,
      endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      runBudgetCeiling: ceiling,
    },
  };
}

async function openLiveStore(dataRoot: string, ceiling: Ceiling = CEILING): Promise<EditorialStore> {
  const store = await EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    // The live route replays no fixture, so no deterministic route is bound.
    baselineAnalysisRoute: null,
  });
  store.baselineAnalysisLedger.bindLaunch(liveBinding(ceiling));
  opened.push(store);
  return store;
}

/**
 * A stub transport standing in for the captured native `fetch`. It answers each unit with the
 * synthetic unit result the deterministic fixture already carries for that unit, so the contract,
 * the reducers, and the coverage axes see exactly the material they see on the local route.
 */
function stubTransport(options: {
  calls: StubCall[];
  responses: Map<number, UnitAnswer>;
  override?: (ordinal: number) => { status: number; body: unknown } | null;
}): typeof fetch {
  const transport = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    options.calls.push({ url, headers: { ...init.headers }, body: init.body });
    const request = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
    const last = request.messages.at(-1)!;
    const ordinal = Number(/^分析单元 (\d+)\//u.exec(last.content)?.[1] ?? '0');
    const forced = options.override?.(ordinal) ?? null;
    if (forced !== null) return { status: forced.status, json: async () => forced.body };
    const answer = options.responses.get(ordinal);
    if (answer === undefined) return { status: 500, json: async () => ({ error: { message: 'no synthetic answer' } }) };
    // Block identities are minted per import, so a hand-written fixture cites them by placeholder.
    // The stub substitutes exactly as the deterministic adapter does, which is what makes the two
    // routes comparable: the same synthetic result, cited against this import's own blocks.
    const text = substituteBlockPlaceholders(answer.text, ownBlockIdsOf(last.content));
    return {
      status: 200,
      json: async () => ({
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: answer.usage.inputTokens, completion_tokens: answer.usage.outputTokens },
      }),
    };
  };
  return transport as unknown as typeof fetch;
}

function owner(store: EditorialStore, nativeFetch: typeof fetch, ceiling: Ceiling = CEILING): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture: null,
    // A local placeholder: the broker releases it to the transmit step and nothing else ever sees it.
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: ceiling, providerCacheRoot: cacheRoot }, nativeFetch },
  });
}

/** Import exact `sample1` into a live-bound store and freeze its plan; the manifest comes back with it. */
async function prepareLive(dataRoot: string, ceiling: Ceiling = CEILING): Promise<{
  store: EditorialStore;
  bookId: string;
  prepared: BaselineAnalysisProjection;
}> {
  const store = await openLiveStore(dataRoot, ceiling);
  const imported = await importSample1Book(store, roots.codeRoot, 'developer-live sample1');
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'developer-live 主编辑角色连接');
  let progress = store.createBaselineAnalysisPreparationWork(imported.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return { store, bookId: imported.bookId, prepared: progress.projection! };
}

/**
 * The synthetic answer for each unit of a frozen plan, taken from the deterministic fixture so the
 * contract, the reducers, and the coverage axes see the same material they see on the local route.
 */
async function unitAnswers(prepared: BaselineAnalysisProjection, usage?: { inputTokens: number; outputTokens: number }): Promise<Map<number, UnitAnswer>> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  const answers = new Map<number, UnitAnswer>();
  for (const unit of prepared.coverageManifest!.units) {
    const digest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
    const entry = resolveFixtureEntry(fixture.entries, unit.ordinal, digest, 1);
    expect(entry?.response.kind, `fixture answer for unit ${unit.ordinal}`).toBe('unit-result');
    const response = entry!.response as { kind: 'unit-result'; text: string; usage: { inputTokens: number; outputTokens: number } };
    answers.set(unit.ordinal, { text: response.text, usage: usage ?? response.usage });
  }
  return answers;
}

async function runLive(
  store: EditorialStore,
  bookId: string,
  prepared: BaselineAnalysisProjection,
  execution: BaselineAnalysisExecutionOwner,
): Promise<BaselineAnalysisProjection> {
  const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  execution.admitAndDispatch(authorized.dispatchRunRecordId!);
  await execution.whenIdle();
  return store.inspectBaselineAnalysis(bookId, (runRecordId) => execution.progressFor(runRecordId));
}

/** The AI7 error code one call refuses with, or `no-throw`; the messages themselves are product text. */
function refusalCode(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return 'no-throw';
}

async function ledgerLines(root: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8');
  return raw.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('the developer-live scope over exact sample1 with a stub transport', () => {
  it('freezes the v4 plan, transmits once per unit through the gate, and opens one Session per unit', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const responses = await unitAnswers(prepared);
    const execution = owner(store, stubTransport({ calls, responses }));
    const settled = await runLive(store, bookId, prepared, execution);

    // The frozen plan names the live binding, not the denied production one.
    const provider = settled.providerResolutionPlan!;
    expect(provider.remoteBinding).toMatchObject({
      providerId: 'opencode-go',
      modelId: 'deepseek-v4-flash',
      credentialSlot: 'opencode-go',
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      providerProcessing: { operationalScope: 'developer-live', version: 'v4', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
    });
    expect(provider.executionRoute).toEqual({ kind: 'opencode-go', model: 'deepseek-v4-flash', endpoint: OPENCODE_GO_ENDPOINT });
    expect(provider.runBudgetCeiling).toEqual(CEILING);
    expect(settled.planEnvelope!.providerStatus).toBe('remote-eligible-developer-live');
    expect(settled.planEnvelope!.dispatchAllowed).toBe(true);

    // The gate admitted exactly one transmission per unit, and every one carried the route's headers.
    expect(calls).toHaveLength(SAMPLE1_UNITS);
    for (const call of calls) {
      expect(call.url).toBe(OPENCODE_GO_ENDPOINT);
      expect(call.headers.authorization).toBe('Bearer placeholder-development-key');
      expect(call.headers['user-agent']).toBe(OPENCODE_GO_USER_AGENT);
      expect(call.headers[OPENCODE_GO_SESSION_HEADER]).toMatch(/^[0-9a-f-]{36}$/u);
      const body = JSON.parse(call.body) as Record<string, unknown>;
      expect(body.model).toBe('deepseek-v4-flash');
      // The profile's declared constraint reaches the wire on the real path, not only at assembly.
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body).not.toHaveProperty('thinking');
      expect(body).not.toHaveProperty('reasoning_effort');
      // The credential never enters the body or its digest.
      expect(call.body).not.toContain('placeholder-development-key');
    }

    // One technical Session per Analysis Unit: every unit's request carries its own Session id, and
    // the spans record the same ones, with the binding's own id as the lineage root above them.
    const sessionHeaders = calls.map((call) => call.headers[OPENCODE_GO_SESSION_HEADER]!);
    expect(new Set(sessionHeaders).size).toBe(SAMPLE1_UNITS);
    const attempt = settled.run!.attempt!;
    const spanSessions = attempt.spans.map((span) => span.harnessSessionId);
    expect(new Set(spanSessions).size).toBe(SAMPLE1_UNITS);
    expect(spanSessions).toEqual(sessionHeaders);
    expect(spanSessions).not.toContain(attempt.executionBinding!.harnessSessionId);
    expect(attempt.credentialReadinessCheck).toMatchObject({ slot: 'opencode-go', readiness: 'present', valueReleased: false });

    // The revision records the live route and the v4 policy pin, through the existing real path.
    const revision = settled.resultSetRevision!;
    expect(revision.adapterPin).toEqual({ route: 'opencode-go', model: 'deepseek-v4-flash', fixtureIdentity: null, fixtureSha256: null });
    expect(revision.policyPin).toEqual({
      operationalScope: 'developer-live', providerProcessingVersion: 'v4', activePolicySetVersion: 'v4', liveTransmissions: 'bounded-by-run',
    });
    expect(revision.usage.requests).toBe(SAMPLE1_UNITS);
    expect(revision.gaps).toEqual([]);
    expect(settled.run!.state).toBe('completed');

    // Every live call is a named test item, numbered by the ledger under the Task mode's purpose.
    const lines = await ledgerLines(cacheRoot);
    expect(lines.map((line) => line.itemId)).toEqual(
      Array.from({ length: SAMPLE1_UNITS }, (_unused, index) => `S40/first-baseline/${index + 1}`),
    );
    expect(new Set(lines.map((line) => line.outcome))).toEqual(new Set(['transmitted']));
    expect(lines.every((line) => line.promptContractDigest === BASELINE_PROMPT_CONTRACT_DIGEST)).toBe(true);
    // The ledger records identities and counts, never content.
    for (const line of lines) {
      expect(JSON.stringify(line)).not.toContain('placeholder-development-key');
      expect(line).not.toHaveProperty('requestBody');
      expect(line).not.toHaveProperty('response');
    }
    await store.close();
  });

  it('replays an identical request from the cache without transmitting', async () => {
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const firstCalls: StubCall[] = [];
    const responses = await unitAnswers(prepared);
    await runLive(store, bookId, prepared, owner(store, stubTransport({ calls: firstCalls, responses })));
    expect(firstCalls).toHaveLength(SAMPLE1_UNITS);

    // `重新分析全书` over an unedited manuscript recomputes every unit from the same Coverage Manifest,
    // so every unit message — and therefore every canonical request body — is byte-identical to the
    // first Run's. Every one replays from the cache and the transport is never called again.
    let progress = store.createBaselineAnalysisPreparationWork(
      bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book', selectedRange: null }, launchPolicy,
    );
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const again = progress.projection!;
    expect(again.update!.reusePlan!.counts.recomputed).toBe(SAMPLE1_UNITS);
    const secondCalls: StubCall[] = [];
    const settled = await runLive(store, bookId, again, owner(store, stubTransport({ calls: secondCalls, responses })));

    expect(secondCalls).toEqual([]);
    expect(settled.run!.state).toBe('completed');
    expect(settled.resultSetRevision!.usage.requests).toBe(SAMPLE1_UNITS);

    const lines = await ledgerLines(cacheRoot);
    expect(lines.filter((line) => line.outcome === 'transmitted')).toHaveLength(SAMPLE1_UNITS);
    expect(lines.filter((line) => line.outcome === 'replayed')).toHaveLength(SAMPLE1_UNITS);
    // The replayed calls are named under their own Task mode, numbered from one.
    expect(lines.slice(SAMPLE1_UNITS).map((line) => line.itemId)).toEqual(
      Array.from({ length: SAMPLE1_UNITS }, (_unused, index) => `S40/reanalyze-book/${index + 1}`),
    );
    // A replay is recorded with the cached usage and never re-stores the entry.
    expect(lines.at(-1)).toMatchObject({ outcome: 'replayed', status: 200 });
    await store.close();
  });

  it('refuses a repeated test item id unless the ledger marked it stale', async () => {
    const cache = new ProviderResultCache(cacheRoot);
    await cache.open();
    const line = {
      itemId: 'S40/smoke/1',
      purpose: 'smoke',
      model: 'deepseek-v4-flash',
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      requestDigest: providerRequestDigest('{"model":"deepseek-v4-flash"}'),
      outcome: 'transmitted' as const,
      status: 200,
      usage: { inputTokens: 1, outputTokens: 1 },
      recordedAt: new Date().toISOString(),
    };
    await cache.record(line);
    expect(refusalCode(() => cache.claimItem('S40/smoke/1'))).toBe('PROVIDER_TEST_ITEM_REPEATED');
    // The ledger numbers the next item past the highest it already carries.
    expect(cache.nextItemId('smoke')).toBe('S40/smoke/2');
    expect(refusalCode(() => cache.claimItem('S40/smoke/2'))).toBe('no-throw');
    expect(refusalCode(() => cache.claimItem('smoke/1'))).toBe('PROVIDER_TEST_ITEM_INVALID');
    expect(refusalCode(() => cache.claimItem('S41/smoke/1'))).toBe('PROVIDER_TEST_ITEM_INVALID');

    // An item whose every line is stale may run live again: that is the deliberate act. Marking one
    // of several lines stale is not enough, so `S40/smoke/1` stays reserved by its live line.
    await cache.record({ ...line, itemId: 'S40/smoke/9', stale: true });
    expect(refusalCode(() => cache.claimItem('S40/smoke/9'))).toBe('no-throw');
    await cache.record({ ...line, stale: true, outcome: 'failed', status: null, usage: null });
    expect(refusalCode(() => cache.claimItem('S40/smoke/1'))).toBe('PROVIDER_TEST_ITEM_REPEATED');

    // A fresh reader sees exactly the lines that were appended, in order.
    const fresh = new ProviderResultCache(cacheRoot);
    await fresh.open();
    expect(fresh.lines.map((entry) => entry.itemId)).toEqual(['S40/smoke/1', 'S40/smoke/9', 'S40/smoke/1']);
    expect(fresh.nextItemId('smoke')).toBe('S40/smoke/10');
  });

  it('records an empty answer as its own outcome instead of handing the contract an empty string', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const responses = await unitAnswers(prepared);
    const execution = owner(store, stubTransport({
      calls,
      responses,
      // The shape the first live Run produced for three of its eight units (#306, #307): the declared
      // answer channel present and empty, beside a reasoning channel that had content. Before the
      // normalization boundary existed this reached `parseUnitResult` as `''`, whose only reading of
      // an empty string is `not-json` — a model reported as having broken the contract when what it
      // actually did was answer with nothing.
      override: (ordinal) => ordinal !== 2 ? null : {
        status: 200,
        body: {
          choices: [{ message: { content: '', reasoning_content: '合成推理内容。' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 40, completion_tokens: 60 },
        },
      },
    }));
    const settled = await runLive(store, bookId, prepared, execution);

    expect(settled.run!.state).toBe('completed-with-gaps');
    const gaps = settled.resultSetRevision!.gaps;
    expect(gaps.map((entry) => entry.unitOrdinal)).toEqual([2]);
    expect(gaps[0]!.code).toBe('contract-invalid');
    // What an editor actually reads: what came back, and whether re-running this unit is likely to help.
    expect(gaps[0]!.reason).toBe(
      '模型完成了推理，但没有给出答案：答案通道为空，推理通道有内容。这不是稿件或契约的问题；重新分析本单元通常会得到结果。',
    );
    // The mislabel this replaces: an empty answer is not a model that produced something unparseable.
    expect(gaps[0]!.reason).not.toContain('不是 JSON');
    // The Run continues and the empty unit's usage still counts: nothing about it is a failure.
    expect(settled.resultSetRevision!.coverage.unitsClosed).toBe(SAMPLE1_UNITS - 1);
    expect(calls).toHaveLength(SAMPLE1_UNITS);
    await store.close();
  });

  it('stops at the Run Budget Ceiling with the partial revision preserved', async () => {
    const calls: StubCall[] = [];
    // 100 tokens for the first unit against a 100-token ceiling: the second unit never dispatches,
    // because the ceiling is evaluated from accumulated usage before the unit forms its request.
    const ceiling: Ceiling = { kind: 'tokens', maxTotalTokens: 100 };
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot, ceiling);
    const responses = await unitAnswers(prepared, { inputTokens: 60, outputTokens: 40 });
    const execution = owner(store, stubTransport({ calls, responses }), ceiling);
    const settled = await runLive(store, bookId, prepared, execution);

    expect(calls).toHaveLength(1);
    expect(settled.run!.state).toBe('interrupted');
    expect(settled.taskOutcome!.classification).toBe('interrupted');
    // The closed CHECK sets record `interrupted`; the safe next action is where the two developer-live
    // interruptions are told apart, and it names the ceiling rather than a limit window.
    expect(settled.taskOutcome!.safeNextAction).toContain('--run-budget-ceiling');
    expect(settled.taskOutcome!.safeNextAction).not.toContain('账户限额');
    // The partial revision survives: one unit closed, the rest recorded as exact gaps.
    const revision = settled.resultSetRevision!;
    expect(revision.coverage.unitsTotal).toBe(SAMPLE1_UNITS);
    expect(revision.coverage.unitsClosed).toBe(1);
    expect(revision.usage.inputTokens + revision.usage.outputTokens).toBe(100);
    await store.close();
  });

  it('ends the Run on a Provider Account Limit with no retry, fallback, or second model', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const responses = await unitAnswers(prepared);
    const execution = owner(store, stubTransport({
      calls,
      responses,
      // The gateway's limit shape is undocumented, so a bare 429 must already mean the account limit.
      override: () => ({ status: 429, body: { error: { message: 'usage limit reached', reset_at: '2026-09-08T00:00:00Z' } } }),
    }));
    const settled = await runLive(store, bookId, prepared, execution);

    // Exactly one transmission: a Provider Account Limit is not retry-safe, so no unit is repeated
    // and no later unit is dispatched.
    expect(calls).toHaveLength(1);
    expect(settled.run!.state).toBe('interrupted');
    expect(settled.taskOutcome!.classification).toBe('interrupted');
    expect(settled.taskOutcome!.safeNextAction).toContain('账户限额');
    expect(settled.taskOutcome!.safeNextAction).toContain('不会自动重试');
    expect(settled.taskOutcome!.safeNextAction).not.toContain('--run-budget-ceiling');

    const lines = await ledgerLines(cacheRoot);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ outcome: 'failed', status: 429, classification: 'quota-exhausted', resetWindow: '2026-09-08T00:00:00Z' });
    // A limit response is never cached: the same request must be asked again later.
    expect(await new ProviderResultCache(cacheRoot).lookup('deepseek-v4-flash', String(lines[0]!.requestDigest))).toBeNull();
    await store.close();
  });

  it('states the bound scope, version, route, and ceiling on every reading that names them', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const responses = await unitAnswers(prepared);
    const settled = await runLive(store, bookId, prepared, owner(store, stubTransport({ calls, responses })));
    expect(calls).toHaveLength(SAMPLE1_UNITS);

    // Not one surface may say the remote binding was refused or that nothing was transmitted while
    // this Run was transmitting: that contradiction is the defect (#307 problem P2).
    const consequence = settled.updateControls!.providerConsequence;
    for (const reading of [...settled.namedNonEffects, consequence]) {
      expect(reading).not.toContain('development-ci');
      expect(reading).not.toContain('拒绝');
      expect(reading).not.toContain('0 次');
    }

    // The scope, the version, the bound route, and the ceiling as the number the launch froze.
    const scopeStatement = settled.namedNonEffects.find((statement) => statement.includes('Provider Processing'))!;
    expect(scopeStatement).toContain('developer-live · Provider Processing v4');
    expect(scopeStatement).toContain('任务运行预算上限 500000 tokens');
    expect(scopeStatement).toContain('opencode-go · deepseek-v4-flash');
    expect(consequence).toContain('developer-live · Provider Processing v4');
    expect(consequence).toContain('任务运行预算上限 500000 tokens');
    expect(consequence).toContain('opencode-go · deepseek-v4-flash');
    // The transmission count an update states is the recomputed unit count, never zero.
    expect(consequence).toContain('每个重算单元形成一次实时传输并计入用量');
    // A developer-live plan always dispatches, so a blocked Run is unreachable under this scope.
    expect(settled.run!.blockedReasons).toBeNull();

    // The ceiling is read from the binding rather than from a second constant: another launch, another number.
    const narrower = liveBinding({ kind: 'tokens', maxTotalTokens: 250_000 }).live;
    expect(namedNonEffects(narrower).join('\n')).toContain('任务运行预算上限 250000 tokens');
    expect(providerConsequence(narrower)).toContain('任务运行预算上限 250000 tokens');
    expect(blockedReasons(narrower)[0]).toContain('任务运行预算上限 250000 tokens');
    await store.close();
  });

  // The exact text this file's base (dev@5aadb1c2) stated as constants, captured before they were
  // derived. J-03, J-04, and the local service suite pin these readings; deriving them from the bound
  // launch must not move one byte of what `development-ci` produces.
  it('leaves every development-ci reading byte-identical to the captured base text', () => {
    expect(namedNonEffects(null)).toEqual([
      '不修改稿件，不创建修订版或事实判定',
      '不创建学习资格、策略激活、Enrollment、Apply 或 Effect',
      '只读取当前图书的任务输入修订版，不读取其他图书',
      'development-ci · Provider Processing v1：0 次实时传输，远程绑定被拒绝',
      '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容',
    ]);
    expect(blockedReasons(null)).toEqual([
      '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝。',
      '未提供 J-04 专用的本地确定性模型适配器控制，因此没有可执行的本地路由。',
      '运行授权已记录；派发前阻止，未创建 Session、未构造 Provider payload、未访问网络。',
    ]);
    expect(providerConsequence(null)).toBe(
      '与首次基线分析相同：远程 DeepSeek 绑定被 development-ci · Provider Processing v1 拒绝（0 次实时传输），只有 J-04 控制绑定的 AI7 本地确定性模型适配器可执行；外发数据类别 public-or-synthetic；未设置任务预算上限；只有重算单元形成模型请求并计入用量，复用单元不形成任何模型负载。',
    );
  });

  it('admits exactly the one Public SampleBook of this slice as transmittable', () => {
    expect([...DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS]).toEqual([SAMPLE1_SOURCE_DIGEST]);
  });

  it('refuses to prepare a baseline analysis Task whose lineage is not exact sample1, before any transport, workspace-profile pin, or credential is touched', async () => {
    // A generated-only synthetic manuscript (no manuscript or manuscript derivative involved): its
    // lineage must never reach a Run Authorization, let alone dispatch. This is the earlier,
    // always-reached refusal — deleting it would leave every other test in this file green while the
    // transmit guarantee it exists to protect is gone.
    const store = await openLiveStore(roots.dataRoot);
    const selectedPath = join(roots.inputRoot, 'non-sample1.docx');
    await writeSyntheticDocx(selectedPath, {
      paragraphs: [{ text: '合成非 sample1 稿件正文。' }],
      coreTitle: 'developer-live 非 sample1 血缘',
    });
    const staged = await store.stageSelectedDocx(randomUUID(), selectedPath);
    expect(staged.source.format).toBe('DOCX');
    expect(staged.source.sourceSha256).not.toBe(SAMPLE1_SOURCE_DIGEST);
    const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
    expect(review.reviewDigest).not.toBeNull();
    const commitId = randomUUID();
    const commit = await store.commitNewBookImport({
      draftId: staged.draftId,
      expectedDraftVersion: review.draftVersion,
      reviewDigest: review.reviewDigest!,
      commitId,
    });
    await store.acknowledgeImportCompletion(commitId);

    // No workspace-profile pin and no credential connection exist for this Book: the lineage check in
    // `#binding()` is the first condition it evaluates, ahead of the artifact-pin and credential checks
    // it also owns and ahead of the developer-live transmittable-set check in the execution owner.
    expect(refusalCode(() => store.createBaselineAnalysisPreparationWork(commit.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy)))
      .toBe('ANALYSIS_LINEAGE_UNAVAILABLE');
    await store.close();
  });
});
