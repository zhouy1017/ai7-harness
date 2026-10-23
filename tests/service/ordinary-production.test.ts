import { MODEL_SERVICE_CONNECTION_REVISION_72_SQL } from '../../src/service/bounded-manuscript.js';
import { FastRoleExecutionOwner, productionFastRoleRoutes, testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { materialTranslator, MATERIAL_TRANSLATION_RESULT_SCHEMA } from '../../src/service/fast-role/material-translation-contract.js';
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
import { BackgroundAnalysisDispatcher } from '../../src/service/background-analysis.js';
import { liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
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
  it.each(['opencode-go', 'deepseek-open-platform'] as const)('dispatches an enrolled background Run under v23 on %s with its mandatory frozen ceiling (#864)', async (route) => {
    const { store, production } = await openProductionStore();
    await configure(store, production, route);
    const reference = await sample1Book(store, 'L2 后台合成回答参照');
    const answers = await chainAnswers(prepare(store, reference, production.policy));
    const bookId = await sample1Book(store, 'L2 正式后台分析');
    const runtime = { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 3_600_000, quietMs: 30_000 };
    const selected = production.policy;
    expect(selected.providerProcessing.version).toBe('v25');
    expect(liveKindRule(selected, 'baseline-manuscript-analysis', ['unpublished-excerpts'])?.backgroundOrigin).toBe(false);
    expect(liveKindRule(selected, 'baseline-manuscript-analysis', ['unpublished-excerpts'], 'background')?.ruleId)
      .toBe('enrolled-background-manuscript-analysis-processing');
    // The predecessor v13 has no background rule. This in-memory projection isolates that origin boundary.
    production.policy = { ...selected, providerProcessing: { ...selected.providerProcessing,
      admittedRules: selected.providerProcessing.admittedRules.filter((rule) => !rule.backgroundOrigin) } };
    expect(store.inspectBackgroundAnalysisEnrollment(bookId, runtime).offer.canEnroll).toBe(false);
    expect(liveKindRule(production.policy, 'baseline-manuscript-analysis', ['unpublished-excerpts'], 'background')).toBeNull();
    production.policy = selected;
    const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime);
    // One token proves the ceiling actually stops subsequent sends, even though a production foreground ceiling may be unset.
    const ceiling = route === 'opencode-go' ? 1 : 400_000;
    store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, 'backfill', { kind: 'book', seriesId: null }, ceiling, runtime);
    const calls: StubCall[] = [];
    const execution = owner(store, production, stubTransport(calls, answers));
    const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy: selected, now: () => runtime.now });
    try {
      production.policy = { ...selected, providerProcessing: { ...selected.providerProcessing,
        admittedRules: selected.providerProcessing.admittedRules.filter((rule) => !rule.backgroundOrigin) } };
      dispatcher.nudge();
      await dispatcher.settled();
      expect(store.inspectBaselineAnalysis(bookId, () => null).taskIntent).toBeNull();
      expect(calls).toHaveLength(0);
      production.policy = selected;
      dispatcher.nudge();
      await dispatcher.settled();
      await execution.whenIdle();
      const after = store.inspectBaselineAnalysis(bookId, () => null);
      expect(after.authorization!.origin).toBe('background-analysis-enrollment');
      expect(after.planVersion!.materialInputs.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: ceiling });
      expect(store.baselineAnalysisLedger.loadExecutionPlan(after.run!.runRecordId).runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: ceiling });
      expect(after.taskOutcome!.report!.background![0]).toBe('由后台分析登记开始 · 按第 1 版登记');
      if (ceiling === 1) {
        expect(calls).toHaveLength(1);
        expect(after.taskOutcome!.stop?.reason).toBe('run-budget-ceiling-reached');
        expect(after.taskOutcome!.report!.background![2]).toMatch(/^达到上限后停下/u);
      } else {
        expect(after.run!.state).toBe('completed');
        expect(calls).toHaveLength(FULL_CHAIN_TURNS);
      }
    } finally {
      await dispatcher.dispose();
    }
  });

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
    for (const rule of production.policy.providerProcessing.admittedRules.filter((rule) => rule.ruleId !== 'ordinary-production-model-connection-test')) {
      expect(rule.outboundDataCategories).toEqual(expect.arrayContaining(['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']));
    }
    const bookId = await sample1Book(store, 'L2 官方路线');
    const prepared = prepare(store, bookId, production.policy);
    expect(prepared.planEnvelope).toMatchObject({ providerStatus: 'remote-eligible-ordinary-production', dispatchAllowed: true });
    expect(prepared.providerResolutionPlan).toMatchObject({
      remoteBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-flash', credentialSlot: 'deepseek-api-key', credentialReference: reference,
        providerProcessing: { operationalScope: 'ordinary-production', version: 'v25' } },
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
      policyPin: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v25' } });
    expect(settled.resultSetRevision?.policyPin).toMatchObject({ operationalScope: 'ordinary-production', providerProcessingVersion: 'v25' });
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

  it.each(['foreground', 'background'] as const)('keeps a %s Run on its frozen binding when settings switch route', async (origin) => {
    const { store, production } = await openProductionStore();
    await configure(store, production, 'opencode-go');
    const first = await sample1Book(store, 'L2 切换前');
    const runtime = { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 3_600_000, quietMs: 30_000 };
    let version: string | null = null;
    let preparedFirst: BaselineAnalysisProjection;
    if (origin === 'background') {
      const shown = store.inspectBackgroundAnalysisEnrollment(first, runtime);
      version = store.enrollBackgroundAnalysis(first, shown.offer.disclosureDigest!, 'backfill', { kind: 'book', seriesId: null }, 400_000, runtime)
        .enrollment!.enrollmentVersionId;
      let work = store.createBackgroundBaselineAnalysisPreparationWork(first, 'first-baseline', version, production.policy);
      while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
      preparedFirst = work.projection!;
    } else {
      preparedFirst = prepare(store, first, production.policy);
    }
    expect(preparedFirst.providerResolutionPlan?.executionRoute).toMatchObject({ kind: 'opencode-go' });
    const authorized = version === null
      ? store.authorizeBaselineAnalysis(first, preparedFirst.taskIntent!.taskIntentId, preparedFirst.planEnvelope!.digest)
      : store.startEnrolledBaselineAnalysis(first, preparedFirst.taskIntent!.taskIntentId, preparedFirst.planEnvelope!.digest, version, 'first-baseline', runtime);
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


describe('persisted OpenAI Fast text binding (Issue #1044)', () => {
  function responsesTransport(calls: Array<{ url: string; model: string; cap: number }>, answer: string): typeof fetch {
    return (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, model: body.model, cap: body.max_output_tokens });
      expect(body.tools).toBeUndefined(); expect(body.stream).toBeUndefined();
      return { status: 200, json: async () => ({ status: 'completed', output: [{ type: 'reasoning', id: 'rs_public_synthetic', summary: [], encrypted_content: 'public-synthetic-opaque-reasoning' }, { type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text: answer }] }], usage: { input_tokens: 12, output_tokens: 7, output_tokens_details: { reasoning_tokens: 2 } } }) };
    }) as unknown as typeof fetch;
  }

  it('tests, independently selects both reviewed models, restarts and translates through the exact persisted composition', async () => {
    let { store } = await openProductionStore();
    const official = store.saveModelServiceConnection('Main official', null, 'ready', 'deepseek-open-platform');
    store.selectModelServiceRoute('deepseek-open-platform');
    const openai = store.saveModelServiceConnection('Fast OpenAI', null, 'ready', 'openai-platform');
    expect(openai.connectionTest).toBeNull();
    expect(() => store.selectFastRoleModel('openai-platform', 'gpt-5.6-luna')).toThrowError();
    const calls: Array<{ url: string; model: string; cap: number }> = [];
    const reads: string[] = [];
    const resolver = { resolve: async (reference: string) => { reads.push(reference); return 'public-synthetic-placeholder'; } };
    for (const modelId of ['gpt-5.6-sol', 'gpt-5.6-luna']) {
      const tested = await testModelServiceConnection(store, roots.codeRoot,
        { scope: 'ordinary-production', nativeFetch: responsesTransport(calls, 'AI7_OK') }, { route: 'openai-platform', modelId }, resolver);
      expect(tested).toMatchObject({ modelId, outcome: 'passed', verified: 'buffered-text-only' });
      store.selectFastRoleModel('openai-platform', modelId);
      expect(store.getConfiguredModelRoleBinding('main-editorial')?.credentialReference).toBe(official.credentialReference);
      expect(store.getConfiguredModelRoleBinding('fast-interaction')?.model).toBe(modelId);
    }
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); opened.push(store);
    const fast = store.getConfiguredModelRoleBinding('fast-interaction')!;
    expect(fast).toEqual({ route: 'openai-platform', endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-5.6-luna',
      credentialSlot: 'openai-platform', credentialReference: openai.credentialReference });
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', store.getConfiguredModelRoleBinding('main-editorial'), fast);
    expect(policy.integrityState).toBe('verified');
    const owner = new FastRoleExecutionOwner({ fixture: null, live: productionFastRoleRoutes(
      { scope: 'ordinary-production', nativeFetch: responsesTransport(calls, JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA,
        translations: [{ n: 1, text: '公开连接测试的合成译文。' }] })) }, () => policy, () => fast.credentialReference, resolver) });
    try {
      const translator = materialTranslator(owner, 'ordinary-production', () => 1);
      const result = await translator.translate('a'.repeat(64), ['Public synthetic reference text for a connection contract.'], 'selection-proof');
      expect(result.kind).toBe('translated');
      if (result.kind !== 'translated') throw new Error('production translation failed');
      expect(result.made).toMatchObject({ model: fast.model, route: fast.route, policyRuleId: 'ordinary-production-material-translation',
        provenance: { role: 'Fast Interaction Role', endpoint: fast.endpoint, credentialReference: fast.credentialReference, policyVersion: 'v25',
          usage: { inputTokens: 12, outputTokens: 7 }, failureCode: null } });
      expect(calls).toEqual([{ url: fast.endpoint, model: 'gpt-5.6-sol', cap: 512 },
        { url: fast.endpoint, model: fast.model, cap: 512 }, { url: fast.endpoint, model: fast.model, cap: 8192 }]);
      expect(reads.every((reference) => reference === openai.credentialReference)).toBe(true);
      // Finish the existing user-facing task through its store/index owner, not only the text contract.
      store.useMaterialTranslator(translator);
      const referencePath = join(roots.inputRoot, 'public-synthetic-reference.txt');
      await fs.writeFile(referencePath, 'Public synthetic reference paragraph for the persisted translation test.');
      const preview = await store.previewLibraryMaterial(referencePath);
      const material = await store.addLibraryMaterial({ previewId: preview.previewId, title: 'Public synthetic reference', kind: 'document' });
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      store.requestMaterialTranslation(material.materialId);
      await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(material.materialId).index?.translation?.lastFailure).toBeNull();
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const translations = database.prepare('SELECT canonical_json FROM material_index_translations').all();
        expect(translations).toHaveLength(1);
        const record = JSON.parse(String(translations[0]!.canonical_json));
        expect(record.provenance).toMatchObject({ role: 'Fast Interaction Role', route: fast.route, model: fast.model,
          endpoint: fast.endpoint, credentialSlot: fast.credentialSlot, credentialReference: fast.credentialReference,
          policyVersion: 'v25', usage: { inputTokens: 12, outputTokens: 7, reasoningTokens: 2 }, failureCode: null });
        expect(record.label).toBe('来源译文');
        expect(JSON.stringify(record)).not.toContain('public-synthetic-opaque-reasoning');
      } finally { database.close(); }
      expect(calls).toHaveLength(4);

      expect(store.getModelServiceRouteConnection('deepseek-open-platform')?.selected).toBe(true);
    } finally { owner.dispose(); }
  });

  it('refuses missing credentials, unsupported models and wrong scopes before resolving a secret', async () => {
    const { store } = await openProductionStore();
    const resolver = { resolve: vi.fn(async () => 'public-placeholder') };
    for (const [runtime, modelId] of [[null, 'gpt-5.6-luna'], [{ scope: 'ordinary-production', nativeFetch: vi.fn() }, 'gpt-6-astra'],
      [{ scope: 'ordinary-production', nativeFetch: vi.fn() }, 'gpt-5.6-luna']] as const) {
      await expect(testModelServiceConnection(store, roots.codeRoot, runtime, { route: 'openai-platform', modelId }, resolver)).rejects.toThrow();
    }
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it.each(['invalid-key', 'account-limit', 'malformed', 'refusal', 'unexpected-text', 'unknown'] as const)('keeps %s attributed and sends only once', async (failure) => {
    const { store } = await openProductionStore();
    const connection = store.saveModelServiceConnection('Failure probe', null, 'ready', 'openai-platform');
    const transport = vi.fn(async () => {
      if (failure === 'unknown') throw new Error('synthetic transport failure after submission');
      return { status: failure === 'invalid-key' ? 401 : failure === 'account-limit' ? 429 : 200,
        json: async () => failure === 'unexpected-text' ? { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'unexpected public synthetic answer' }] }], usage: { input_tokens: 12, output_tokens: 1 } }
          : failure === 'refusal' ? { output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'synthetic refusal' }] }], usage: { input_tokens: 12, output_tokens: 1 } }
          : failure === 'malformed' ? { invalid: true, usage: { input_tokens: 12, output_tokens: 0 } } : { error: { message: 'never retain synthetic provider body' } } };
    });
    const status = await testModelServiceConnection(store, roots.codeRoot,
      { scope: 'ordinary-production', nativeFetch: transport as unknown as typeof fetch },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, { resolve: async () => 'public-placeholder' });
    expect(status.outcome).toBe(failure === 'unknown' ? 'outcome-unknown' : 'failed');
    expect(transport).toHaveBeenCalledTimes(1);
    if (failure === 'malformed' || failure === 'refusal' || failure === 'unexpected-text') expect(status.provenance?.usage).toMatchObject({ inputTokens: 12, outputTokens: failure === 'malformed' ? 0 : 1 });
    expect(status.provenance?.failureCode).toBe(status.code);
    expect(store.getModelServiceRouteConnection('openai-platform')?.connectionTest).toEqual(status);
    expect(JSON.stringify(status)).not.toContain('synthetic provider body');
    expect(store.getConfiguredModelRoleBinding('fast-interaction')).toBeNull();
    expect(connection.credentialReference).toHaveLength(36);
  });
  it('cancels an explicit probe before dispatch without resolving a key', async () => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Cancelled probe', null, 'ready', 'openai-platform');
    const resolver = { resolve: vi.fn(async () => 'public-placeholder') };
    const transport = vi.fn(); const controller = new AbortController(); controller.abort();
    const result = await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: transport },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, controller.signal);
    expect(result.outcome).toBe('cancelled'); expect(resolver.resolve).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('keeps a probe cancelled after its key resolves but before it is sent cancelled, never outcome-unknown (#1080 review)', async () => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Cancelled late probe', null, 'ready', 'openai-platform');
    const controller = new AbortController();
    const resolver = { resolve: vi.fn(async () => { controller.abort(); return 'public-placeholder'; }) };
    const transport = vi.fn();
    const result = await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: transport },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, controller.signal);
    expect(resolver.resolve).toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(result.outcome).toBe('cancelled');
  });

  it('invalidates tested state on key replacement and refuses a stale selection before secret release', async () => {
    const { store } = await openProductionStore();
    const connection = store.saveModelServiceConnection('Exact probe', null, 'ready', 'openai-platform');
    const calls: Array<{ url: string; model: string; cap: number }> = [];
    const resolver = { resolve: async () => 'public-placeholder' };
    await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: responsesTransport(calls, 'AI7_OK') },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver);
    store.selectFastRoleModel('openai-platform', 'gpt-5.6-luna');
    const fast = store.getConfiguredModelRoleBinding('fast-interaction')!;
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null, fast);
    const forbiddenReads: string[] = []; const transport = vi.fn();
    const owner = new FastRoleExecutionOwner({ fixture: null, live: productionFastRoleRoutes({ scope: 'ordinary-production', nativeFetch: transport },
      () => policy, () => fast.credentialReference, { resolve: async (reference) => { forbiddenReads.push(reference); return 'public-placeholder'; } }, () => false) });
    try {
      const result = await owner.ask('material-translation', 'Public synthetic stale request.', 'stale');
      expect(result.kind).toBe('failed'); expect(transport).not.toHaveBeenCalled(); expect(forbiddenReads).toHaveLength(0);
      // Readiness may inspect presence; no ticket releases the value to a transport.
      expect(owner.busy).toBe(false);
    } finally { owner.dispose(); }
    store.saveModelServiceConnection('Exact probe', connection.credentialReference, 'ready', 'openai-platform');
    expect(store.getModelServiceRouteConnection('openai-platform')?.connectionTest).toBeNull();
    expect(store.getConfiguredModelRoleBinding('fast-interaction')).toBeNull();
    expect(() => store.selectFastRoleModel('openai-platform', 'gpt-5.6-luna')).toThrow();
  });

  it('migrates revision83 without changing Main/reference/history and freezes the prior Fast choice independently', async () => {
    const { store } = await openProductionStore();
    const connection = store.saveModelServiceConnection('Legacy Main', null, 'ready', 'deepseek-open-platform');
    store.selectModelServiceRoute('deepseek-open-platform'); store.close();
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    const columns = 'connection_id, role_id, connection_name, provider_id, model_id, adapter_revision, configuration_revision, approved_fallback_chain, credential_slot, credential_reference, credential_operation_state, created_at, updated_at, credential_updated_at, selected';
    const before = database.prepare(`SELECT ${columns} FROM model_service_connections`).all();
    database.exec(`CREATE TEMP TABLE legacy_model_selection AS SELECT ${columns} FROM model_service_connections; DROP TABLE model_service_connections;`);
    database.exec(MODEL_SERVICE_CONNECTION_REVISION_72_SQL);
    database.exec(`INSERT INTO model_service_connections SELECT * FROM legacy_model_selection; DROP TABLE legacy_model_selection;
      DROP TABLE material_translation_attempts; PRAGMA user_version = 83;`);
    database.close();
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot); opened.push(migrated);
    const after = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(after.prepare(`SELECT ${columns} FROM model_service_connections`).all()).toEqual(before);
      expect(after.prepare('SELECT count(*) AS count FROM material_translation_attempts').get()!.count).toBe(0);
    }
    finally { after.close(); }
    const saved = migrated.getModelServiceRouteConnection('deepseek-open-platform')!;
    expect(saved).toMatchObject({ credentialReference: connection.credentialReference, selected: true, fastSelected: true, connectionTest: null });
    migrated.saveModelServiceConnection('New Main', null, 'ready', 'opencode-go'); migrated.selectModelServiceRoute('opencode-go');
    expect(migrated.getConfiguredModelRoleBinding('main-editorial')?.route).toBe('opencode-go');
    expect(migrated.getConfiguredModelRoleBinding('fast-interaction')?.route).toBe('deepseek-open-platform');
  });

  it.each([1, 2])('refuses a replaced and retested credential during secret read %s without retargeting the attempt', async (replaceAt) => {
    const { store } = await openProductionStore();
    const connection = store.saveModelServiceConnection('Generation race', null, 'ready', 'openai-platform');
    const probes: Array<{ url: string; model: string; cap: number }> = [];
    const runtime = { scope: 'ordinary-production' as const, nativeFetch: responsesTransport(probes, 'AI7_OK') };
    const selection = { route: 'openai-platform' as const, modelId: 'gpt-5.6-luna' };
    const retest = () => testModelServiceConnection(store, roots.codeRoot, runtime, selection, { resolve: async () => 'public-synthetic-probe' });
    await retest();
    store.selectFastRoleModel(selection.route, selection.modelId);
    const fast = store.getConfiguredModelRoleBinding('fast-interaction')!;
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null, fast);
    let reads = 0;
    const transport = vi.fn();
    const routes = productionFastRoleRoutes({ scope: 'ordinary-production', nativeFetch: transport }, () => policy, () => fast.credentialReference,
      { resolve: async () => {
        reads += 1;
        if (reads === replaceAt) {
          store.saveModelServiceConnection('Generation race', connection.credentialReference, 'ready', selection.route);
          await retest();
          store.selectFastRoleModel(selection.route, selection.modelId);
        }
        return 'public-synthetic-replacement';
      } },
      (reference, route) => { const current = store.getConfiguredModelRoleBinding('fast-interaction');
        return current?.credentialReference === reference && current.route === route.profile.route && current.model === route.modelProfile.model; },
      () => store.getModelServiceRouteConnection(selection.route)!.credentialUpdatedAt);
    const owner = new FastRoleExecutionOwner({ fixture: null, live: routes });
    try {
      const result = await owner.ask('material-translation', 'Public synthetic replacement-race input.', 'generation-race');
      expect(result.kind).toBe('failed');
      expect(transport).not.toHaveBeenCalled();
      expect(routes.broker.releaseCount).toBe(0);
      expect(probes).toHaveLength(2);
      expect(store.getConfiguredModelRoleBinding('fast-interaction')).toEqual(fast);
    } finally { owner.dispose(); }
  });

  it.each(['contract-invalid', 'malformed', 'refusal', 'incomplete', 'unknown'] as const)('retains %s translation attribution across restart without a translation or automatic resend', async (failure) => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Attempt provenance', null, 'ready', 'openai-platform');
    const probes: Array<{ url: string; model: string; cap: number }> = [];
    const resolver = { resolve: async () => 'public-synthetic-placeholder' };
    await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: responsesTransport(probes, 'AI7_OK') },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver);
    store.selectFastRoleModel('openai-platform', 'gpt-5.6-luna');
    const fast = store.getConfiguredModelRoleBinding('fast-interaction')!;
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null, fast);
    const transport = vi.fn(async () => {
      if (failure === 'unknown') throw new Error('public synthetic lost response');
      const usage = { input_tokens: 12, output_tokens: 7, output_tokens_details: { reasoning_tokens: 2 } };
      return { status: 200, json: async () => failure === 'malformed' ? { status: 'completed', usage, invalid: true } : {
        status: failure === 'incomplete' ? 'incomplete' : 'completed', usage,
        output: [{ type: 'message', role: 'assistant', content: [failure === 'refusal' ? { type: 'refusal', refusal: 'public synthetic refusal' }
          : { type: 'output_text', text: 'public synthetic invalid translation contract' }] }],
      } };
    });
    const owner = new FastRoleExecutionOwner({ fixture: null, live: productionFastRoleRoutes(
      { scope: 'ordinary-production', nativeFetch: transport as unknown as typeof fetch }, () => policy, () => fast.credentialReference, resolver) });
    try {
      store.useMaterialTranslator(materialTranslator(owner, 'ordinary-production', () => 1));
      const path = join(roots.inputRoot, 'public-synthetic-failed-reference.txt');
      await fs.writeFile(path, 'Public synthetic reference paragraph for failure attribution.');
      const preview = await store.previewLibraryMaterial(path);
      const material = await store.addLibraryMaterial({ previewId: preview.previewId, title: 'Public synthetic failed attempt', kind: 'document' });
      store.startMaterialIndexing(); await store.settleMaterialIndexing();
      store.requestMaterialTranslation(material.materialId); await store.settleMaterialLayers();
      expect(transport).toHaveBeenCalledTimes(1);
      store.close();
      const restarted = await EditorialStore.open(roots.dataRoot, roots.codeRoot); opened.push(restarted);
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        expect(database.prepare('SELECT count(*) AS count FROM material_index_translations').get()!.count).toBe(0);
        const rows = database.prepare('SELECT canonical_json FROM material_translation_attempts').all();
        expect(rows).toHaveLength(1);
        expect(() => database.exec('UPDATE material_translation_attempts SET outcome = outcome')).toThrow('MATERIAL_INDEX_LEDGER_IMMUTABLE');
        expect(() => database.exec('DELETE FROM material_translation_attempts')).toThrow('MATERIAL_INDEX_LEDGER_IMMUTABLE');
        const attempt = JSON.parse(String(rows[0]!.canonical_json));
        expect(attempt).toMatchObject({ outcome: failure === 'unknown' ? 'outcome-unknown' : 'failed',
          provenance: { role: 'Fast Interaction Role', route: fast.route, model: fast.model, endpoint: fast.endpoint,
            credentialSlot: fast.credentialSlot, credentialReference: fast.credentialReference,
            usage: failure === 'unknown' ? null : { inputTokens: 12, outputTokens: 7, reasoningTokens: 2 } } });
        expect(attempt.provenance.failureCode).toMatch(/^[A-Z0-9_]+$/u);
        expect(attempt.batch).toHaveLength(1);
        expect(JSON.stringify(attempt)).not.toContain('public synthetic');
        const translation = restarted.inspectLibraryMaterial(material.materialId).index?.translation;
        expect(translation?.lastAttempt?.attemptId).toBe(attempt.attemptId);
        expect(translation?.lastFailure).not.toBeNull();
      } finally { database.close(); }
      if (failure === 'contract-invalid' || failure === 'unknown') {
        const before = restarted.inspectLibraryMaterial(material.materialId).index?.translation?.lastAttempt;
        const destination = join(roots.inputRoot, `${failure}-attempt.ai7db`);
        const prepared = await restarted.prepareDatabaseExport(destination, true);
        expect((await restarted.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
        const preview = await restarted.inspectDatabaseImport(destination);
        expect(preview).toMatchObject({ compatibility: 'compatible', schemaRevision: 86, dataVersion: 1 });
        await restarted.prepareDatabaseReplacement(preview.previewId);
        restarted.close();
        const replaced = await EditorialStore.open(roots.dataRoot, roots.codeRoot); opened.push(replaced);
        expect((await replaced.inspectDatabaseReplacements()).replacements[0]?.outcome).toBe('applied');
        expect(replaced.inspectLibraryMaterial(material.materialId).index?.translation?.lastAttempt).toEqual(before);
        expect(replaced.inspectLibraryMaterial(material.materialId).index?.translation?.translated).toBe(0);
      }
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { owner.dispose(); }
  });

});
