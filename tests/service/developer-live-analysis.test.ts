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
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  assuranceSamplingRequestDigest,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { loadModelFixture, resolveFixtureEntry, type ModelFixture } from '../../src/service/provider/model-fixture.js';
import {
  ownBlockIdsOf,
  substituteAssuranceSamplingRefPlaceholders,
  substituteBlockPlaceholders,
  substituteCrossUnitBlockPlaceholders,
} from '../../src/service/provider/local-deterministic-adapter.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnitRequestDigest, parseCrossUnitCitedBlocks, parseCrossUnitMessageHeader } from '../../src/service/analysis/cross-unit-contract.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
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
  type DeveloperLiveCeiling,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
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
/** Either bound form: an explicit launch total, or the policy's per-frozen-unit default (ADR 0070). */
type Ceiling = DeveloperLiveCeiling;
const CEILING: Ceiling = { kind: 'tokens', maxTotalTokens: 500_000 };
/** What a developer-live launch binds when the form names no ceiling: 30,000 tokens per frozen unit. */
const POLICY_DEFAULT_CEILING: Ceiling = {
  kind: 'tokens-per-frozen-unit',
  tokensPerFrozenUnit: DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit,
};
/** Eight unit turns, one reduction turn, one assurance-sampling anchor turn, one reflection turn. */
const FULL_CHAIN_TURNS = SAMPLE1_UNITS + 3;
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

/** One synthetic answer and the usage it reports, whatever turn it serves. */
interface StubAnswer extends UnitAnswer {}

/**
 * The deterministic fixture's answers for the whole v5 chain: the eight unit results, and the
 * reduction and assurance-sampling entries keyed by the request digest the deterministic adapter
 * computes. The fixture carries no reflection entry, so the stub synthesizes a valid one — a
 * deterministic stand-in that keeps the chain closed without inventing fixture bytes.
 */
interface ChainAnswers {
  readonly units: Map<number, UnitAnswer>;
  readonly named: Map<string, UnitAnswer>;
}

const SYNTHETIC_REFLECTION: StubAnswer = {
  text: JSON.stringify({
    schema: 'ai7.analysis.run-report-reflection-result/1',
    items: [{ suggestion: '下次运行按单元预算复查重算范围，并保留跨单元归纳的主题分段。', basis: '本次账目显示单元数、重算数与归纳分段均为已知计数。' }],
  }),
  usage: { inputTokens: 30, outputTokens: 20 },
};

/**
 * A stub transport standing in for the captured native `fetch`. It answers the whole v5 chain with
 * the synthetic results the deterministic fixture already carries, so the contract, the reducers,
 * the reducers' suboperations, and the coverage axes see exactly the material they see on the local
 * route. Block and finding identities are minted per import, so the stub substitutes exactly as the
 * deterministic adapter does, which is what makes the two routes comparable.
 */
function stubTransport(options: {
  calls: StubCall[];
  responses: Map<number, UnitAnswer>;
  /** The reduction and sampling answers, keyed by their request digests; absent means a 500 refusal. */
  named?: Map<string, UnitAnswer>;
  override?: (ordinal: number) => { status: number; body: unknown } | null;
  /** The reflection answer, when the policy names the reflection turn; defaults to the synthetic one. */
  reflection?: StubAnswer;
}): typeof fetch {
  const transport = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    options.calls.push({ url, headers: { ...init.headers }, body: init.body });
    const request = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
    const last = request.messages.at(-1)!;
    const text = last.content;
    const crossUnit = parseCrossUnitMessageHeader(text);
    const sampling = crossUnit === null ? parseAssuranceSamplingMessageHeader(text) : null;
    const reflection = crossUnit === null && sampling === null && text.startsWith('运行反思 ');
    if (crossUnit !== null || sampling !== null || reflection) {
      const answer = reflection
        ? options.reflection ?? SYNTHETIC_REFLECTION
        : options.named?.get(crossUnit !== null
          ? crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnit.unitSetDigest)
          : assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, sampling!.unitOrdinal, sampling!.unitDigest, sampling!.sampleDigest));
      if (answer === undefined) return { status: 500, json: async () => ({ error: { message: 'no synthetic named answer' } }) };
      const content = crossUnit !== null
        ? substituteCrossUnitBlockPlaceholders(answer.text, parseCrossUnitCitedBlocks(text))
        : sampling !== null
          ? substituteAssuranceSamplingRefPlaceholders(answer.text, parseAssuranceSamplingListedRefs(text))
          : answer.text;
      return {
        status: 200,
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: answer.usage.inputTokens, completion_tokens: answer.usage.outputTokens },
        }),
      };
    }
    const ordinal = Number(/^分析单元 (\d+)\//u.exec(text)?.[1] ?? '0');
    const forced = options.override?.(ordinal) ?? null;
    if (forced !== null) return { status: forced.status, json: async () => forced.body };
    const answer = options.responses.get(ordinal);
    if (answer === undefined) return { status: 500, json: async () => ({ error: { message: 'no synthetic answer' } }) };
    // Block identities are minted per import, so a hand-written fixture cites them by placeholder.
    const substituted = substituteBlockPlaceholders(answer.text, ownBlockIdsOf(text));
    return {
      status: 200,
      json: async () => ({
        choices: [{ message: { content: substituted } }],
        usage: { prompt_tokens: answer.usage.inputTokens, completion_tokens: answer.usage.outputTokens },
      }),
    };
  };
  return transport as unknown as typeof fetch;
}

/**
 * The same stub transport, held open. Each call announces its arrival and then waits until the test
 * releases that call, so a Run can be observed while a unit is genuinely in flight rather than only
 * between units — which is the whole question the Run Liveness Signal answers. A released call
 * answers exactly as `stubTransport` would; nothing about the request changes.
 */
function heldTransport(options: {
  calls: StubCall[];
  responses: Map<number, UnitAnswer>;
  named?: Map<string, UnitAnswer>;
}): {
  transport: typeof fetch;
  arrived(index: number): Promise<void>;
  release(index: number): void;
} {
  const inner = stubTransport(options) as unknown as (url: string, init: { headers: Record<string, string>; body: string }) => Promise<unknown>;
  const arrivals: Array<() => void> = [];
  const gates: Array<() => void> = [];
  const arrived: Array<Promise<void>> = [];
  const held: Array<Promise<void>> = [];
  // Slots are made on demand from either side, so the test may wait on a call that has not arrived
  // and release one that has not either.
  const ensure = (index: number): void => {
    while (arrived.length <= index) {
      arrived.push(new Promise<void>((resolve) => arrivals.push(resolve)));
      held.push(new Promise<void>((resolve) => gates.push(resolve)));
    }
  };
  let next = 0;
  const transport = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const index = next;
    next += 1;
    ensure(index);
    arrivals[index]!();
    await held[index]!;
    return inner(url, init);
  };
  return {
    transport: transport as unknown as typeof fetch,
    arrived: (index) => { ensure(index); return arrived[index]!; },
    release: (index) => { ensure(index); gates[index]!(); },
  };
}

function owner(
  store: EditorialStore,
  nativeFetch: typeof fetch,
  ceiling: Ceiling = CEILING,
  policy: LaunchPolicyProjection = launchPolicy,
): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy: policy,
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
 * The synthetic answers for a frozen plan, taken from the deterministic fixture so the contract, the
 * reducers, and the coverage axes see the same material they see on the local route: every unit's
 * result, plus the reduction and assurance-sampling entries keyed by the request digest the
 * deterministic adapter computes.
 */
async function unitAnswers(prepared: BaselineAnalysisProjection, usage?: { inputTokens: number; outputTokens: number }): Promise<ChainAnswers> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  const units = new Map<number, UnitAnswer>();
  for (const unit of prepared.coverageManifest!.units) {
    const digest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
    const entry = resolveFixtureEntry(fixture.entries, unit.ordinal, digest, 1);
    expect(entry?.response.kind, `fixture answer for unit ${unit.ordinal}`).toBe('unit-result');
    const response = entry!.response as { kind: 'unit-result'; text: string; usage: { inputTokens: number; outputTokens: number } };
    units.set(unit.ordinal, { text: response.text, usage: usage ?? response.usage });
  }
  const named = new Map<string, UnitAnswer>();
  for (const entry of fixture.entries.values()) {
    if (entry.unitOrdinal === 0 && entry.response.kind === 'unit-result') {
      named.set(entry.requestDigest, { text: entry.response.text, usage: entry.response.usage });
    }
  }
  return { units, named };
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
  it('freezes the v5 plan and transmits the full declared chain through the gate', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const { units: responses, named } = await unitAnswers(prepared);
    const execution = owner(store, stubTransport({ calls, responses, named }));
    const settled = await runLive(store, bookId, prepared, execution);

    // The frozen plan names the live binding, not the denied production one.
    const provider = settled.providerResolutionPlan!;
    expect(provider.remoteBinding).toMatchObject({
      providerId: 'opencode-go',
      modelId: 'deepseek-v4-flash',
      credentialSlot: 'opencode-go',
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      providerProcessing: { operationalScope: 'developer-live', version: 'v5', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
    });
    expect(provider.executionRoute).toEqual({ kind: 'opencode-go', model: 'deepseek-v4-flash', endpoint: OPENCODE_GO_ENDPOINT });
    expect(provider.runBudgetCeiling).toEqual(CEILING);
    expect(settled.planEnvelope!.providerStatus).toBe('remote-eligible-developer-live');
    expect(settled.planEnvelope!.dispatchAllowed).toBe(true);

    // The gate admitted the whole chain ADR 0079 §2.2 bounds: eight unit turns, the reduction's one
    // topic-section turn, the sample's one anchor-unit turn, and the one report reflection turn.
    expect(calls).toHaveLength(FULL_CHAIN_TURNS);
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

    // One technical Session per turn: every turn carries its own Session id, and the unit-only spans
    // record exactly the unit turns' ones, with the binding's own id as the lineage root above them.
    const sessionHeaders = calls.map((call) => call.headers[OPENCODE_GO_SESSION_HEADER]!);
    expect(new Set(sessionHeaders).size).toBe(FULL_CHAIN_TURNS);
    const attempt = settled.run!.attempt!;
    const spanSessions = attempt.spans.map((span) => span.harnessSessionId);
    expect(new Set(spanSessions).size).toBe(SAMPLE1_UNITS);
    expect(spanSessions).toEqual(sessionHeaders.slice(0, SAMPLE1_UNITS));
    expect(spanSessions).not.toContain(attempt.executionBinding!.harnessSessionId);
    expect(attempt.credentialReadinessCheck).toMatchObject({ slot: 'opencode-go', readiness: 'present', valueReleased: false });

    // The revision records the live route and the v5 policy pin, through the existing real path.
    const revision = settled.resultSetRevision!;
    expect(revision.adapterPin).toEqual({ route: 'opencode-go', model: 'deepseek-v4-flash', fixtureIdentity: null, fixtureSha256: null });
    expect(revision.policyPin).toEqual({
      operationalScope: 'developer-live', providerProcessingVersion: 'v5', activePolicySetVersion: 'v5', liveTransmissions: 'bounded-by-run',
    });
    // The revision counts the three revision-facing stages: eight unit turns, the reduction turn and
    // the sampling turn. The reflection turn is dispatched after the revision is persisted, so its
    // usage is recorded on the Run Report alone. Every turn is a distinct technical Session.
    expect(revision.usage.requests).toBe(FULL_CHAIN_TURNS - 1);
    expect(settled.taskOutcome!.report!.usagePerStage['run-report-reflection'].requests).toBe(1);
    expect(revision.gaps).toEqual([]);
    expect(revision.crossUnitReduction.state).toBe('closed');
    expect(revision.crossUnitFindings).toHaveLength(2);
    expect(revision.assuranceSample.state).toBe('closed');
    expect(revision.reducerClosure.stages.at(-1)?.stage).toBe('assurance-sampling');
    expect(settled.taskOutcome!.report!.ifRedone.state).toBe('closed');
    expect(settled.run!.state).toBe('completed');

    // Every live call is a named test item, numbered by the ledger under the Task mode's purpose.
    const lines = await ledgerLines(cacheRoot);
    expect(lines.map((line) => line.itemId)).toEqual(
      Array.from({ length: FULL_CHAIN_TURNS }, (_unused, index) => `S40/first-baseline/${index + 1}`),
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

  /**
   * The three declared suboperations are gated one key each. Under the verified v5 bytes all three
   * are named, so this is the fail-closed half: a projection that names the reduction and neither the
   * sample nor the reflection. The reduction closes, the sample is drawn but not dispatched, and the
   * report says exactly which policy stopped each step.
   */
  it('records policy-bounded and transmits nothing for a sample the active policy does not name', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const { units: responses, named } = await unitAnswers(prepared);
    const namesReductionOnly: LaunchPolicyProjection = {
      ...launchPolicy,
      providerProcessing: {
        ...launchPolicy.providerProcessing,
        crossUnitReductionAllowed: true,
        assuranceSamplingAllowed: false,
        runReportReflectionAllowed: false,
      },
    };
    const transport = stubTransport({ calls, responses, named });
    const settled = await runLive(store, bookId, prepared, owner(store, transport, CEILING, namesReductionOnly));

    // Eight unit turns and the one reduction turn the policy names; not one sampling turn.
    expect(calls).toHaveLength(SAMPLE1_UNITS + 1);
    expect(calls.some((call) => call.body.includes('保证抽样'))).toBe(false);
    const revision = settled.resultSetRevision!;
    expect(revision.usage.requests).toBe(SAMPLE1_UNITS + 1);
    expect(revision.crossUnitReduction.state).toBe('closed');
    expect(revision.crossUnitFindings).toHaveLength(2);

    // The sample was drawn — it is the dispatch the policy stopped, not the draw — and says exactly why.
    expect(revision.assuranceSample).toMatchObject({
      state: 'gap',
      size: 2,
      candidateCount: 2,
      dispositions: [],
      precision: [],
      usage: null,
      reason: '保证抽样未派发：当前 Provider Processing 策略仅授权单元数内的传输',
    });
    expect(revision.assuranceSample.seed).toMatch(/^[0-9a-f]{64}$/u);
    // Nothing about the findings or the axis moved: no disposition exists to move them.
    expect(revision.assurance.sampledPrecision).toBeNull();
    expect(revision.assurance.label).not.toContain('抽样');
    expect(revision.reducerClosure.stages.at(-1)).toEqual({ stage: 'assurance-sampling', state: 'closed-with-gaps', inputCount: 2 });

    // The Run Report's reflection turn is one more transmission this policy does not name either, so
    // it never formed a request: no call carries its header, and the report says exactly why.
    expect(calls.some((call) => call.body.includes('运行反思'))).toBe(false);
    const report = settled.taskOutcome!.report!;
    expect(report.ifRedone).toEqual({
      state: 'policy-bounded',
      items: [],
      reason: '运行反思未派发：当前 Provider Processing 策略仅授权单元数内的传输',
    });
    // A turn that never dispatched costs nothing, and the reconciliation is untouched by it.
    expect(report.usagePerStage['run-report-reflection']).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0 });
    expect(runReportUsageReconciles(report, revision.usage)).toBe(true);
    expect(report.usagePerStage['cross-unit-reduction'].requests).toBe(1);
    expect(report.usagePerStage['assurance-sampling'].requests).toBe(0);
    await store.close();
  });

  it('answers what the Run is doing while a unit is in flight, and measures each step as it settles', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const { units: responses, named } = await unitAnswers(prepared);
    const held = heldTransport({ calls, responses, named });
    const execution = owner(store, held.transport);
    const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    const runRecordId = authorized.dispatchRunRecordId!;
    execution.admitAndDispatch(runRecordId);

    // Unit 1's request is in the transport and no answer has come back. This is the ninety-second
    // interval the first live Run could say nothing about; every fact below is one the owner holds.
    await held.arrived(0);
    const inFlight = execution.progressFor(runRecordId)!;
    expect(inFlight.currentUnitOrdinal).toBe(1);
    expect(inFlight.unitsSettled).toBe(0);
    expect(inFlight.completedAttempts).toBe(0);
    expect(inFlight.attemptState).toBe('awaiting-response');
    expect(inFlight.longestSettledUnitMs).toBeNull();
    expect(Number.isNaN(Date.parse(inFlight.currentUnitStartedAt!))).toBe(false);

    // The store composes the fifth fact from the Run Record's own latest transition, and the whole
    // projection stays identities, counts, and instants: no unit message, no answer, no payload.
    const executing = store.inspectBaselineAnalysis(bookId, (id) => execution.progressFor(id));
    expect(executing.run!.state).toBe('executing');
    const projected = executing.run!.progress!;
    expect(projected.lastTransitionAt).toBe(executing.run!.transitions[executing.run!.transitions.length - 1]!.recordedAt);
    expect(projected.attemptState).toBe('awaiting-response');
    expect(projected.currentUnitStartedAt).toBe(inFlight.currentUnitStartedAt);
    expect(JSON.stringify(projected)).not.toContain('分析单元');

    // Released, unit 1 settles; by the time unit 2 has reached the transport the Run has measured a
    // step of its own, which is what the stale case is judged against from here on.
    held.release(0);
    await held.arrived(1);
    const nextUnit = execution.progressFor(runRecordId)!;
    expect(nextUnit.currentUnitOrdinal).toBe(2);
    expect(nextUnit.unitsSettled).toBe(1);
    expect(nextUnit.completedAttempts).toBe(1);
    expect(nextUnit.longestSettledUnitMs).not.toBeNull();
    expect(nextUnit.longestSettledUnitMs!).toBeGreaterThanOrEqual(0);
    expect(nextUnit.currentUnitStartedAt).not.toBe(inFlight.currentUnitStartedAt);
    expect(nextUnit.attemptState).toBe('awaiting-response');

    for (let index = 1; index < FULL_CHAIN_TURNS; index += 1) held.release(index);
    await execution.whenIdle();

    // A settled Run projects no progress at all: the signal ends with the state that produced it,
    // rather than lingering as the first live Run's status toast did.
    const settled = store.inspectBaselineAnalysis(bookId, (id) => execution.progressFor(id));
    expect(settled.run!.state).toBe('completed');
    expect(settled.run!.progress).toBeNull();
    expect(execution.progressFor(runRecordId)).toBeNull();
    expect(calls).toHaveLength(FULL_CHAIN_TURNS);
    await store.close();
  });

  it('replays an identical request from the cache without transmitting', async () => {
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const firstCalls: StubCall[] = [];
    const { units: responses, named } = await unitAnswers(prepared);
    await runLive(store, bookId, prepared, owner(store, stubTransport({ calls: firstCalls, responses, named })));
    expect(firstCalls).toHaveLength(FULL_CHAIN_TURNS);

    // `重新分析全书` over an unedited manuscript recomputes every unit from the same Coverage Manifest,
    // so every turn's message — and therefore every canonical request body — is byte-identical to the
    // first Run's. Every one replays from the cache and the transport is never called again.
    let progress = store.createBaselineAnalysisPreparationWork(
      bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book', selectedRange: null }, launchPolicy,
    );
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const again = progress.projection!;
    expect(again.update!.reusePlan!.counts.recomputed).toBe(SAMPLE1_UNITS);
    const secondCalls: StubCall[] = [];
    const settled = await runLive(store, bookId, again, owner(store, stubTransport({ calls: secondCalls, responses, named })));

    expect(settled.run!.state).toBe('completed');
    expect(settled.resultSetRevision!.usage.requests).toBe(FULL_CHAIN_TURNS - 1);

    // The reduction and sampling turns are byte-identical to the first Run's and replay from the
    // cache; the reflection turn's message carries this Run's own Run Record identity, which no
    // fixture or previous request can pin, so exactly that one turn transmits again.
    expect(secondCalls).toHaveLength(1);
    expect(secondCalls[0]!.body).toContain('运行反思');
    expect(secondCalls[0]!.body).toContain('账目摘要');

    const lines = await ledgerLines(cacheRoot);
    expect(lines.filter((line) => line.outcome === 'transmitted')).toHaveLength(FULL_CHAIN_TURNS + 1);
    expect(lines.filter((line) => line.outcome === 'replayed')).toHaveLength(FULL_CHAIN_TURNS - 1);
    // The replayed calls are named under their own Task mode, numbered from one.
    expect(lines.slice(FULL_CHAIN_TURNS).map((line) => line.itemId)).toEqual(
      Array.from({ length: FULL_CHAIN_TURNS }, (_unused, index) => `S40/reanalyze-book/${index + 1}`),
    );
    // The reflection is the last line, its own transmission replayed from nothing.
    expect(lines.at(-1)).toMatchObject({ outcome: 'transmitted', status: 200 });
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
    const { units: responses, named } = await unitAnswers(prepared);
    const execution = owner(store, stubTransport({
      calls,
      responses,
      named,
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
    // The Run continues and the empty unit's usage still counts: nothing about it is a failure. The
    // seven closed units form a reduction request the fixture cannot key, and the report reflection
    // is the chain's last turn; neither is a unit transmission.
    expect(settled.resultSetRevision!.coverage.unitsClosed).toBe(SAMPLE1_UNITS - 1);
    expect(calls).toHaveLength(SAMPLE1_UNITS + 2);
    await store.close();
  });

  it('stops at the Run Budget Ceiling with the partial revision preserved', async () => {
    const calls: StubCall[] = [];
    // 100 tokens for the first unit against a 100-token ceiling: the second unit never dispatches,
    // because the ceiling is evaluated from accumulated usage before the unit forms its request.
    const ceiling: Ceiling = { kind: 'tokens', maxTotalTokens: 100 };
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot, ceiling);
    const { units: responses } = await unitAnswers(prepared, { inputTokens: 60, outputTokens: 40 });
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

    // An interrupted Run still leaves a Run Report, and it carries what the interruption cost it:
    // one unit's usage, seven not-attempted gaps, and the two suboperations that never ran.
    const report = settled.taskOutcome!.report!;
    expect(settled.taskOutcome!.reportAbsentReason).toBeNull();
    expect(report.classification).toBe('interrupted');
    expect(runReportUsageReconciles(report, revision.usage)).toBe(true);
    expect(report.usagePerStage.units).toEqual({ requests: 1, inputTokens: 60, outputTokens: 40 });
    expect(report.usagePerStage['cross-unit-reduction']).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0 });
    expect(report.usagePerStage['assurance-sampling']).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0 });
    expect(report.units).toEqual({ submitted: SAMPLE1_UNITS, reused: 0, recomputed: SAMPLE1_UNITS, gaps: SAMPLE1_UNITS - 1, retried: 0 });
    // Every gap the revision carries is named once, and the units it never reached say exactly that.
    expect(report.failures).toEqual(revision.gaps.map((entry) => ({ stage: 'units', code: entry.code, reason: entry.reason })));
    expect(report.unitRows.filter((row) => row.gapCode === 'not-attempted')).toHaveLength(SAMPLE1_UNITS - 1);
    expect(report.unitRows[0]).toMatchObject({ unitOrdinal: 1, state: 'closed', attempts: 1, usage: { inputTokens: 60, outputTokens: 40 } });
    // The two suboperations and the reflection never ran; the deterministic reduction did.
    expect(report.stages.map((stage) => [stage.stage, stage.state])).toEqual([
      ['units', 'closed-with-gaps'], ['cross-unit-reduction', 'not-run'], ['assurance-sampling', 'not-run'], ['reduction', 'closed'],
    ]);
    expect(report.stages[1]!.wallMs).toBeNull();
    expect(report.stages[2]!.wallMs).toBeNull();
    expect(report.ifRedone.state).toBe('not-run');
    expect(report.ifRedone.items).toEqual([]);
    await store.close();
  });

  /**
   * The launch form named no ceiling, so the launch bound the policy's per-frozen-unit default and
   * nothing resolved it into a total until this Run's Coverage Manifest froze (ADR 0070, ADR 0079
   * §2.3). What the frozen Provider Resolution Plan carries must therefore be this manuscript's own
   * arithmetic — 30,000 tokens times the units the manifest actually holds — and not a constant.
   */
  it('freezes the per-frozen-unit default into the total this frozen manifest sizes', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot, POLICY_DEFAULT_CEILING);
    const { units: responses, named } = await unitAnswers(prepared);
    const settled = await runLive(store, bookId, prepared, owner(store, stubTransport({ calls, responses, named }), POLICY_DEFAULT_CEILING));

    // The unit count is read from the frozen manifest, never restated as a literal: a manuscript of a
    // different length would move this number and the assertion with it.
    const unitCount = settled.coverageManifest!.units.length;
    expect(unitCount).toBe(SAMPLE1_UNITS);
    expect(settled.providerResolutionPlan!.runBudgetCeiling).toEqual({
      kind: 'tokens',
      maxTotalTokens: DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit * unitCount,
    });
    // The plan carries a total, never the formula: the ceiling the gate reads can hold no unit count.
    expect(settled.providerResolutionPlan!.runBudgetCeiling).not.toHaveProperty('tokensPerFrozenUnit');

    // Every surface that names the ceiling states that same resolved total, and the Run spent far less
    // than it, so the whole declared chain ran inside the default.
    const resolved = `任务运行预算上限 ${DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit * unitCount} tokens`;
    expect(settled.namedNonEffects.find((statement) => statement.includes('Provider Processing'))).toContain(resolved);
    expect(settled.updateControls!.providerConsequence).toContain(resolved);
    expect(calls).toHaveLength(FULL_CHAIN_TURNS);
    expect(settled.run!.state).toBe('completed');
    await store.close();
  });

  /**
   * The same bound default, against a Run whose first unit alone spends more than the resolved total.
   * The ceiling is a precondition of the transmit decision, so the second unit never forms a request:
   * the Run stops, names `run-budget-ceiling-reached`, and transmits nothing further.
   */
  it('stops at the resolved per-frozen-unit ceiling and transmits nothing past it', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot, POLICY_DEFAULT_CEILING);
    const resolvedCeiling = DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit * prepared.coverageManifest!.units.length;
    // One unit's usage past the whole Run's resolved ceiling; the next unit is refused before it forms.
    const perUnit = { inputTokens: resolvedCeiling, outputTokens: 10_000 };
    const { units: responses } = await unitAnswers(prepared, perUnit);
    const settled = await runLive(store, bookId, prepared, owner(store, stubTransport({ calls, responses }), POLICY_DEFAULT_CEILING));

    expect(settled.providerResolutionPlan!.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: resolvedCeiling });
    // Exactly one transmission: the gate's ceiling precondition holds against the resolved total.
    expect(calls).toHaveLength(1);
    expect(settled.run!.state).toBe('interrupted');
    expect(settled.taskOutcome!.classification).toBe('interrupted');
    expect(settled.run!.transitions.at(-1)!.detail).toContain('run-budget-ceiling-reached');
    expect(settled.taskOutcome!.safeNextAction).toContain('--run-budget-ceiling');
    expect(settled.taskOutcome!.safeNextAction).not.toContain('账户限额');

    // The partial revision survives with the one unit it paid for, and the reduction and sampling
    // turns the policy names never dispatched either.
    const revision = settled.resultSetRevision!;
    expect(revision.coverage.unitsClosed).toBe(1);
    expect(revision.coverage.unitsTotal).toBe(SAMPLE1_UNITS);
    expect(revision.usage.inputTokens + revision.usage.outputTokens).toBe(perUnit.inputTokens + perUnit.outputTokens);
    const report = settled.taskOutcome!.report!;
    expect(report.usagePerStage['cross-unit-reduction']).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0 });
    expect(report.usagePerStage['assurance-sampling']).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0 });
    expect(report.unitRows.filter((row) => row.gapCode === 'not-attempted')).toHaveLength(SAMPLE1_UNITS - 1);

    // Nothing left the host past the one transmission: the ledger carries exactly that line.
    const lines = await ledgerLines(cacheRoot);
    expect(lines.filter((line) => line.outcome === 'transmitted')).toHaveLength(1);
    await store.close();
  });

  it('ends the Run on a Provider Account Limit with no retry, fallback, or second model', async () => {
    const calls: StubCall[] = [];
    const { store, bookId, prepared } = await prepareLive(roots.dataRoot);
    const { units: responses } = await unitAnswers(prepared);
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
    const { units: responses, named } = await unitAnswers(prepared);
    const settled = await runLive(store, bookId, prepared, owner(store, stubTransport({ calls, responses, named })));
    expect(calls).toHaveLength(FULL_CHAIN_TURNS);

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
    expect(scopeStatement).toContain('developer-live · Provider Processing v5');
    expect(scopeStatement).toContain('任务运行预算上限 500000 tokens');
    expect(scopeStatement).toContain('opencode-go · deepseek-v4-flash');
    expect(consequence).toContain('developer-live · Provider Processing v5');
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
    // A manuscript composed from exact sample1's own prose — real text, but not exact sample1's
    // bytes — is still not exact sample1 (ADR 0043 as narrowed by ADR 0079 §5, ADR 0044): a lineage
    // that must never reach a Run Authorization, let alone dispatch. This is the earlier,
    // always-reached refusal — deleting it would leave every other test in this file green while the
    // transmit guarantee it exists to protect is gone. Nothing composed here can be transmitted: the
    // refusal fires at preparation, and the transmittable set the case above pins still admits exact
    // sample1 alone.
    const store = await openLiveStore(roots.dataRoot);
    const selectedPath = join(roots.inputRoot, 'non-sample1.docx');
    await composeManuscriptDocx(selectedPath, {
      source: ADMITTED_BASELINE_DOCX,
      startBlock: 1,
      blocks: 4,
      title: 'developer-live 非 sample1 血缘',
    });
    const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
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
