import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { LaunchBinding, OrdinaryProductionLaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST,
  assuranceSamplingRequestDigest,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnitRequestDigest, parseCrossUnitCitedBlocks, parseCrossUnitMessageHeader } from '../../src/service/analysis/cross-unit-contract.js';
import {
  ORDINARY_PRODUCTION_ALLOWED_BINDINGS,
  allowedProductionBindingOf,
  resolveSourceCheckoutLaunchPolicy,
  type ConfiguredProviderBinding,
} from '../../src/service/launch-policy.js';
import { loadModelFixture, resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import {
  ownBlockIdsOf,
  substituteAssuranceSamplingRefPlaceholders,
  substituteBlockPlaceholders,
  substituteCrossUnitBlockPlaceholders,
} from '../../src/service/provider/local-deterministic-adapter.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  BASELINE_ANALYSIS_MODE_GOALS,
  MODEL_SERVICE_SETUP_REQUIRED_REASON,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
  type ModelServiceRouteId,
} from '../../src/shared/protocol.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../src/shared/provider-configuration.generated.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the local ordinary-production launch (Issue #811): the real store, plan, execution owner,
// DSH composition, Egress Gate and Credential Broker over exact `sample1`, with the editor's model service configured in the
// store and a stub transport in place of the captured `fetch`. No socket, no host, no credential value but a local placeholder.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
/** Eight unit turns, one reduction turn, one assurance-sampling anchor turn, one reflection turn. */
const FULL_CHAIN_TURNS = SAMPLE1_UNITS + 3;
const GO = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
const OFFICIAL = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[1];

type UnitAnswer = { text: string; usage: { inputTokens: number; outputTokens: number } };
interface StubCall { readonly url: string; readonly body: string }

let roots: ServiceTestRoots;
let opened: EditorialStore[] = [];
let owners: BaselineAnalysisExecutionOwner[] = [];

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-production-');
  opened = [];
  owners = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const owner of owners) await owner.dispose();
  for (const store of opened) {
    try {
      store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  await roots.dispose();
});

vi.setConfig({ hookTimeout: 60_000 });

/** The launch the service composes under ordinary-production: the configured binding and the policy it resolves, read live. */
interface ProductionLaunch {
  readonly launch: LaunchBinding;
  policy: LaunchPolicyProjection;
  live: OrdinaryProductionLaunchBinding | null;
  /** Re-read the store's configured route, as the service does after every settings change. */
  rebind(store: EditorialStore): Promise<void>;
}

function configuredOf(store: EditorialStore): ConfiguredProviderBinding | null {
  const connections = store.getModelServiceConnections();
  const selected = connections.find((connection) => connection.selected) ?? null;
  const connection = selected !== null && selected.credentialOperationState !== 'missing' ? selected : null;
  if (connection === null) return null;
  const allowed = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === connection.binding.providerId)!;
  return { ...allowed, credentialReference: connection.credentialReference };
}

async function productionLaunch(): Promise<ProductionLaunch> {
  const state: ProductionLaunch = {
    policy: await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null),
    live: null,
    launch: undefined as unknown as LaunchBinding,
    async rebind(store) {
      const configured = configuredOf(store);
      state.policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      const allowed = allowedProductionBindingOf(configured);
      state.live = allowed === null || configured === null ? null : {
        scope: 'ordinary-production', ...allowed, credentialReference: configured.credentialReference, runBudgetCeiling: 'unset',
      };
    },
  };
  (state as { launch: LaunchBinding }).launch = {
    operationalScope: 'ordinary-production',
    get policy() { return state.policy; },
    get live() { return state.live; },
  };
  return state;
}

async function openProductionStore(dataRoot: string = roots.dataRoot): Promise<{ store: EditorialStore; production: ProductionLaunch }> {
  const store = await EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null,
  });
  opened.push(store);
  const production = await productionLaunch();
  store.baselineAnalysisLedger.bindLaunch(production.launch);
  await production.rebind(store);
  return { store, production };
}

/** Save and choose one route's connection, as main does: the store mints the reference; the value lives in the OS store. */
async function configure(store: EditorialStore, production: ProductionLaunch, route: ModelServiceRouteId): Promise<string> {
  const pending = store.saveModelServiceConnection(`L2 ${route}`, null, 'needs-attention', route);
  store.saveModelServiceConnection(`L2 ${route}`, pending.credentialReference, 'ready', route);
  store.selectModelServiceRoute(route);
  await production.rebind(store);
  return pending.credentialReference;
}

function owner(store: EditorialStore, production: ProductionLaunch, nativeFetch: typeof fetch, reads: string[] = []): BaselineAnalysisExecutionOwner {
  const execution = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy: production.policy,
    currentLaunchPolicy: () => production.policy,
    productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding),
    fixture: null,
    // A local placeholder for the editor's own credential: the broker releases it to the transmit step alone.
    secretResolver: { resolve: async (reference) => { reads.push(reference); return 'placeholder-production-key'; } },
    production: { scope: 'ordinary-production', nativeFetch },
  });
  owners.push(execution);
  return execution;
}

function prepare(store: EditorialStore, bookId: string, policy: LaunchPolicyProjection): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function sample1Book(store: EditorialStore, title: string): Promise<string> {
  const { bookId } = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  return bookId;
}

/** The deterministic fixture's answers for the whole baseline chain, so the contract and reducers see known material. */
async function chainAnswers(prepared: BaselineAnalysisProjection): Promise<{ units: Map<number, UnitAnswer>; named: Map<string, UnitAnswer> }> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  const units = new Map<number, UnitAnswer>();
  for (const unit of prepared.coverageManifest!.units) {
    const entry = resolveFixtureEntry(fixture.entries, unit.ordinal, unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest), 1)!;
    const response = entry.response as { kind: 'unit-result'; text: string; usage: { inputTokens: number; outputTokens: number } };
    units.set(unit.ordinal, { text: response.text, usage: response.usage });
  }
  const named = new Map<string, UnitAnswer>();
  for (const entry of fixture.entries.values()) {
    if (entry.unitOrdinal === 0 && entry.response.kind === 'unit-result') named.set(entry.requestDigest, { text: entry.response.text, usage: entry.response.usage });
  }
  return { units, named };
}

const REFLECTION: UnitAnswer = {
  text: JSON.stringify({
    schema: 'ai7.analysis.run-report-reflection-result/1',
    items: [{ suggestion: '下次运行按单元预算复查重算范围，并保留跨单元归纳的主题分段。', basis: '本次账目显示单元数、重算数与归纳分段均为已知计数。' }],
  }),
  usage: { inputTokens: 30, outputTokens: 20 },
};

/** A stub standing in for the captured native `fetch`: it answers the chain from the fixture and records every call. */
function stubTransport(calls: StubCall[], answers: { units: Map<number, UnitAnswer>; named: Map<string, UnitAnswer> },
  override?: (ordinal: number) => { status: number; body: unknown } | null): typeof fetch {
  const transport = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    const request = JSON.parse(init.body) as { messages: Array<{ content: string }> };
    const text = request.messages.at(-1)!.content;
    const crossUnit = parseCrossUnitMessageHeader(text);
    const sampling = crossUnit === null ? parseAssuranceSamplingMessageHeader(text) : null;
    const reflection = crossUnit === null && sampling === null && text.startsWith('运行反思 ');
    let content: string;
    let usage: UnitAnswer['usage'];
    if (crossUnit !== null || sampling !== null || reflection) {
      const answer = reflection ? REFLECTION : answers.named.get(crossUnit !== null
        ? crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnit.unitSetDigest)
        : assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST, sampling!.unitOrdinal, sampling!.unitDigest, sampling!.sampleDigest));
      if (answer === undefined) return { status: 500, json: async () => ({ error: { message: 'no synthetic named answer' } }) };
      content = crossUnit !== null ? substituteCrossUnitBlockPlaceholders(answer.text, parseCrossUnitCitedBlocks(text))
        : sampling !== null ? substituteAssuranceSamplingRefPlaceholders(answer.text, parseAssuranceSamplingListedRefs(text)) : answer.text;
      usage = answer.usage;
    } else {
      const ordinal = Number(/^分析单元 (\d+)\//u.exec(text)?.[1] ?? '0');
      const forced = override?.(ordinal) ?? null;
      if (forced !== null) return { status: forced.status, json: async () => forced.body };
      const answer = answers.units.get(ordinal)!;
      content = substituteBlockPlaceholders(answer.text, ownBlockIdsOf(text));
      usage = answer.usage;
    }
    return { status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens } }) };
  };
  return transport as unknown as typeof fetch;
}

async function run(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, bookId: string, prepared: BaselineAnalysisProjection): Promise<BaselineAnalysisProjection> {
  const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  execution.admitAndDispatch(authorized.dispatchRunRecordId!);
  await execution.whenIdle();
  return store.inspectBaselineAnalysis(bookId, (runRecordId) => execution.progressFor(runRecordId));
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('ordinary production over exact sample1 with a stub transport (Issue #811)', { timeout: 120_000 }, () => {
  it.each(['opencode-go', 'deepseek-open-platform'] as const)('discloses %s transmission and metered usage with no default ceiling before authorization', async (route) => {
    const { store, production } = await openProductionStore();
    await configure(store, production, route);
    const bookId = await sample1Book(store, 'L2 正式使用披露');
    const prepared = prepare(store, bookId, production.policy);
    const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: prepared.taskIntent!.taskIntentId });
    expect(plan.start.needsModelConnection).toBe(true);
    expect(plan.scope.send).not.toBe('不发送任何内容');
    expect(plan.service.decision).toContain('本地正式生产');
    expect(plan.service.send).toContain(route);
    expect(plan.service.usage).toBe('发送到所选模型服务；模型用量按实际调用记录，未设任务运行预算上限');
    const blocked = await store.inspectTaskPlanWithConnection({ bookId, kind: 'baseline-analysis', ref: prepared.taskIntent!.taskIntentId }, async () => 'missing');
    expect(blocked.start.readiness).toBe('needs-connection');
  });
  it('says 模型服务需设置 and prepares nothing until a route is configured', async () => {
    const { store, production } = await openProductionStore();
    expect(production.policy.providerProcessing).toMatchObject({ bindingState: 'setup-required', admittedRules: [], liveTransmissionAllowed: false });
    const bookId = await sample1Book(store, 'L2 需设置');
    let refused: unknown = null;
    try {
      prepare(store, bookId, production.policy);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(StoreError);
    expect((refused as StoreError).code).toBe('ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED');
    expect((refused as StoreError).message).toBe(MODEL_SERVICE_SETUP_REQUIRED_REASON);
    // Reading the analysis says the same, naming both routes.
    expect(code(() => store.inspectBaselineAnalysis(bookId, () => null))).toBe('ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED');
  });

  it('runs the configured DeepSeek 官方 route on the editor\'s own reference, with no cache, ledger or validation', async () => {
    const { store, production } = await openProductionStore();
    const reference = await configure(store, production, 'deepseek-open-platform');
    expect(production.live).toMatchObject({ route: 'deepseek-open-platform', model: 'deepseek-flash', credentialReference: reference });
    // v13 names the editor's unpublished words in every admitted rule (#853 revision 5), which is what the gate admits them by.
    for (const rule of production.policy.providerProcessing.admittedRules) {
      expect(rule.outboundDataCategories).toEqual(expect.arrayContaining(['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']));
    }
    const bookId = await sample1Book(store, 'L2 官方路线');
    const prepared = prepare(store, bookId, production.policy);
    expect(prepared.planEnvelope).toMatchObject({ providerStatus: 'remote-eligible-ordinary-production', dispatchAllowed: true });
    expect(prepared.providerResolutionPlan).toMatchObject({
      remoteBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-flash', credentialSlot: 'deepseek-api-key', credentialReference: reference,
        providerProcessing: { operationalScope: 'ordinary-production', version: 'v15' } },
      executionRoute: { kind: 'deepseek-open-platform', model: 'deepseek-flash', endpoint: OFFICIAL.endpoint },
      outboundDataCategory: 'unpublished-excerpts',
      runBudgetCeiling: 'unset',
    });
    const calls: StubCall[] = [];
    const reads: string[] = [];
    const settled = await run(store, owner(store, production, stubTransport(calls, await chainAnswers(prepared)), reads), bookId, prepared);
    expect(settled.run?.state).toBe('completed');
    expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
    expect(calls).toHaveLength(FULL_CHAIN_TURNS);
    expect(calls.every((call) => call.url === OFFICIAL.endpoint && (JSON.parse(call.body) as { model: string }).model === 'deepseek-flash')).toBe(true);
    // The editor's own reference, and never a development one.
    expect(new Set(reads)).toEqual(new Set([reference]));
    expect(Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)).not.toContain(reference);
    const binding = store.baselineAnalysisLedger.executionBindingOf(settled.run!.runRecordId)!;
    expect(binding.binding).toMatchObject({ route: 'deepseek-open-platform', model: 'deepseek-flash', outboundDataCategory: 'unpublished-excerpts',
      policyPin: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v15' } });
    expect(settled.resultSetRevision?.policyPin).toMatchObject({ operationalScope: 'ordinary-production', providerProcessingVersion: 'v15' });
  });

  it('restarts beside an exact seeded development response, reads no cache file, and sends identical Tasks twice', async () => {
    const cacheRoot = join(dirname(roots.dataRoot), 'ai7-harness-provider-cache');
    const first = await openProductionStore();
    await configure(first.store, first.production, 'opencode-go');
    const bookId = await sample1Book(first.store, 'L2 相同输入');
    const prepared = prepare(first.store, bookId, first.production.policy);
    const answers = await chainAnswers(prepared);
    const firstCalls: StubCall[] = [];
    const firstOwner = owner(first.store, first.production, stubTransport(firstCalls, answers));
    expect((await run(first.store, firstOwner, bookId, prepared)).run?.state).toBe('completed');
    await firstOwner.dispose();
    first.store.close();
    opened = opened.filter((candidate) => candidate !== first.store);

    // Seed the real cache namespace with an exact request, using a synthetic transport only, and prove development replay.
    const cache = new ProviderResultCache(cacheRoot);
    await cache.open();
    const request = firstCalls[0]!;
    const item = { purpose: 'first-baseline', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST };
    const validation = { intent: { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null }, step: 'first-baseline/unit-1',
      requestShape: OPENCODE_GO_V41_FLASH_PROFILE.capabilities.requestShape };
    const init = { method: 'POST' as const, headers: {}, body: request.body };
    await transmitOnce(cache, async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: 'synthetic cache sentinel' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 } }) }), item, validation, OPENCODE_GO_ROUTE_PROFILE, GO.model, request.url, init);
    const replay = await transmitOnce(cache, async () => { throw new Error('development replay must not send'); },
      item, validation, OPENCODE_GO_ROUTE_PROFILE, GO.model, request.url, init);
    expect(replay.replayed).toBe(true);
    const files = (await readdir(cacheRoot, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
    const before = await Promise.all(files.map((path) => readFile(path)));
    const read = vi.spyOn(fs, 'readFile');
    const open = vi.spyOn(fs, 'open');
    const list = vi.spyOn(fs, 'readdir');
    const cacheOpen = vi.spyOn(ProviderResultCache.prototype, 'open');
    syncBuiltinESMExports();
    const second = await openProductionStore();
    let progress = second.store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'],
      { mode: 'reanalyze-book', selectedRange: null }, second.production.policy);
    while (!progress.done) progress = second.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const secondCalls: StubCall[] = [];
    const settled = await run(second.store, owner(second.store, second.production, stubTransport(secondCalls, answers)), bookId, progress.projection!);
    expect(settled.run?.state).toBe('completed');
    expect(firstCalls).toHaveLength(FULL_CHAIN_TURNS);
    expect(secondCalls).toHaveLength(FULL_CHAIN_TURNS);
    // Compare booleans so a failure cannot print manuscript-bearing request bodies.
    expect(secondCalls.slice(0, SAMPLE1_UNITS).every((call, index) => call.body === firstCalls[index]!.body && call.url === GO.endpoint)).toBe(true);
    expect(settled.resultSetRevision!.usage.inputTokens).toBeGreaterThan(0);
    expect(cacheOpen).not.toHaveBeenCalled();
    for (const calls of [read.mock.calls, open.mock.calls, list.mock.calls]) {
      expect(calls.some(([path]) => String(path).startsWith(cacheRoot))).toBe(false);
    }
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    expect((await Promise.all(files.map((path) => readFile(path)))).every((bytes, index) => bytes.equals(before[index]!))).toBe(true);
    expect((await readdir(roots.dataRoot)).some((name) => /cache|ledger/u.test(name))).toBe(false);
  });

  it('switches route for the next Task only: a planned Run keeps the binding its plan froze', async () => {
    const { store, production } = await openProductionStore();
    await configure(store, production, 'opencode-go');
    const first = await sample1Book(store, 'L2 切换前');
    const preparedFirst = prepare(store, first, production.policy);
    expect(preparedFirst.providerResolutionPlan?.executionRoute).toMatchObject({ kind: 'opencode-go' });
    const authorized = store.authorizeBaselineAnalysis(first, preparedFirst.taskIntent!.taskIntentId, preparedFirst.planEnvelope!.digest);
    // The editor switches to the official route while the first Task waits to run.
    const officialReference = await configure(store, production, 'deepseek-open-platform');
    expect(store.baselineAnalysisLedger.preflightDrift(authorized.dispatchRunRecordId!)).toEqual([]);
    const second = await sample1Book(store, 'L2 切换后');
    const preparedSecond = prepare(store, second, production.policy);
    expect(preparedSecond.providerResolutionPlan).toMatchObject({ executionRoute: { kind: 'deepseek-open-platform' }, remoteBinding: { credentialReference: officialReference } });
    const calls: StubCall[] = [];
    const execution = owner(store, production, stubTransport(calls, await chainAnswers(preparedFirst)));
    execution.admitAndDispatch(authorized.dispatchRunRecordId!);
    await execution.whenIdle();
    expect(store.inspectBaselineAnalysis(first, () => null).run?.state).toBe('completed');
    expect(calls.every((call) => call.url === GO.endpoint)).toBe(true);
    calls.length = 0;
    expect((await run(store, execution, second, preparedSecond)).run?.state).toBe('completed');
    expect(calls.every((call) => call.url === OFFICIAL.endpoint)).toBe(true);
  });

  it('stops on the account limit as 模型服务账户限额 with 续行: no retry, no fallback, the same route again', async () => {
    const { store, production } = await openProductionStore();
    const frozenReference = await configure(store, production, 'deepseek-open-platform');
    const bookId = await sample1Book(store, 'L2 账户限额');
    const prepared = prepare(store, bookId, production.policy);
    const calls: StubCall[] = [];
    let limited = true;
    const reads: string[] = [];
    const execution = owner(store, production, stubTransport(calls, await chainAnswers(prepared),
      (ordinal) => ordinal === 3 && limited ? { status: 402, body: { error: { message: 'Insufficient Balance' } } } : null), reads);
    const stopped = await run(store, execution, bookId, prepared);
    expect(stopped.state).toBe('resumable');
    expect(stopped.stateLabel).toBe('模型服务账户限额');
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.url === OFFICIAL.endpoint)).toBe(true);
    // The new selection has no credential; continuation must still inspect and use the old Run's reference.
    const missing = store.saveModelServiceConnection('L2 Go missing', null, 'needs-attention', 'opencode-go');
    store.setModelServiceCredentialState(missing.credentialReference, 'missing');
    store.selectModelServiceRoute('opencode-go');
    await production.rebind(store);
    expect(production.live).toBeNull();
    reads.length = 0;
    const drawer = await store.inspectTaskPlanWithConnection({ bookId, kind: 'baseline-analysis', ref: prepared.taskIntent!.taskIntentId },
      (binding) => execution.liveCredentialReadiness(binding));
    expect(drawer.runControl?.resume?.reason).toBeNull();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((reference) => reference === frozenReference)).toBe(true);
    expect(await execution.liveCredentialReadiness(store.taskCredentialBinding(
      { bookId, kind: 'baseline-analysis', ref: prepared.taskIntent!.taskIntentId }, stopped.run!.runRecordId))).toBe('present');
    expect(await execution.liveCredentialReadiness()).toBe('missing');
    const newBook = await sample1Book(store, 'L2 新任务需设置');
    expect(code(() => prepare(store, newBook, production.policy))).toBe('ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED');
    limited = false;
    execution.admitAndDispatch(stopped.run!.runRecordId, store.baselineAnalysisLedger, { resume: true });
    await execution.whenIdle();
    const settled = store.inspectBaselineAnalysis(bookId, () => null);
    expect(settled.run?.state).toBe('completed');
    expect(calls.every((call) => call.url === OFFICIAL.endpoint)).toBe(true);
  });

  it('runs without a ceiling by default and honours the one the editor sets', async () => {
    const { store, production } = await openProductionStore();
    await configure(store, production, 'opencode-go');
    const bookId = await sample1Book(store, 'L2 预算上限');
    const prepared = prepare(store, bookId, production.policy);
    expect(prepared.providerResolutionPlan?.runBudgetCeiling).toBe('unset');
    const edited = store.editBaselineAnalysisPlan({ bookId, taskIntentId: prepared.taskIntent!.taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest,
      removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1 } });
    expect(edited.providerResolutionPlan?.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 1 });
    const calls: StubCall[] = [];
    const stopped = await run(store, owner(store, production, stubTransport(calls, await chainAnswers(prepared))), bookId, edited);
    expect(stopped.taskOutcome?.stop).toMatchObject({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 1 });
    expect(calls).toHaveLength(1);
  });

  it('lifts exact-sample1 lineage only in production, with development-ci and developer-live still refusing', async () => {
    const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
    await composeManuscriptDocx(selectedPath, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 12, title: '编辑自己的书稿' });
    const importOwn = async (store: EditorialStore): Promise<string> => {
      const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '编辑自己的书稿' }, false);
      const commitId = randomUUID();
      const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
      await store.acknowledgeImportCompletion(commitId);
      await pinEditorialWorkspaceProfileRevision2(store, commit.bookId);
      return commit.bookId;
    };
    const { store, production } = await openProductionStore();
    await configure(store, production, 'opencode-go');
    const own = await importOwn(store);
    const prepared = prepare(store, own, production.policy);
    expect(prepared.manuscriptPin?.sourceDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(prepared.manuscriptPin?.sourceDigest).not.toBe('b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483');
    store.close();
    opened = opened.filter((candidate) => candidate !== store);
    // The same Book under development-ci: the exact-sample1 requirement stands.
    const ci = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    opened.push(ci);
    ci.saveModelServiceConnection('L2 官方', null, 'needs-attention');
    const ciPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'development-ci');
    expect(code(() => ci.createBaselineAnalysisPreparationWork(own, BASELINE_ANALYSIS_TASK_GOAL, null, ciPolicy))).toBe('ANALYSIS_LINEAGE_UNAVAILABLE');
    const livePolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    ci.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy: livePolicy, live: {
      ...GO, credentialReference: CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 },
    } });
    expect(code(() => ci.createBaselineAnalysisPreparationWork(own, BASELINE_ANALYSIS_TASK_GOAL, null, livePolicy))).toBe('ANALYSIS_LINEAGE_UNAVAILABLE');
  });
});

describe('schema 72 (Issue #811)', () => {
  it('refuses a persisted development reference before model-service settings can inspect the protected store', async () => {
    const { store, production } = await openProductionStore();
    await configure(store, production, 'deepseek-open-platform');
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      for (const reference of Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)) {
        for (const spelling of [reference, reference.toUpperCase()]) {
          database.prepare('UPDATE model_service_connections SET credential_reference = ?').run(spelling);
          expect(code(() => store.getModelServiceConnections())).toBe('STORE_CORRUPT');
        }
      }
    } finally {
      database.close();
    }
  });

  it('keeps the official row its reference and state, names the current model, and adds the Go row beside it', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'ai7-schema72-'));
    try {
      const { store, production } = await openProductionStore(dataRoot);
      const official = await configure(store, production, 'deepseek-open-platform');
      const go = await configure(store, production, 'opencode-go');
      const rows = store.getModelServiceConnections();
      expect(rows.map((row) => [row.connectionId, row.binding.modelId, row.selected])).toEqual([
        ['main-editorial-opencode-go', 'deepseek-v4.1-flash', true],
        ['main-editorial-deepseek-v4-pro', 'deepseek-flash', false],
      ]);
      expect(new Set([official, go]).size).toBe(2);
      const otherRoot = join(dirname(roots.dataRoot), 'other-production');
      const other = await openProductionStore(otherRoot);
      const otherReference = await configure(other.store, other.production, 'opencode-go');
      expect([official, go]).not.toContain(otherReference);
      other.store.close();
      opened = opened.filter((candidate) => candidate !== other.store);
      await rm(otherRoot, { recursive: true, force: true });
      // A route cannot be chosen before it has a connection, and a development reference is never stored.
      expect(code(() => store.saveModelServiceConnection('dev', CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'], 'ready', 'opencode-go'))).toBe('MODEL_SERVICE_CONNECTION_INVALID');
      store.close();
      opened = opened.filter((candidate) => candidate !== store);
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
