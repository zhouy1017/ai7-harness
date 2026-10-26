import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { MODEL_SERVICE_CONNECTION_REVISION_72_SQL } from '../../src/service/bounded-manuscript.js';
import { FastRoleExecutionOwner, productionFastRoleRoutes, testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { materialTranslator, MATERIAL_TRANSLATION_RESULT_SCHEMA } from '../../src/service/fast-role/material-translation-contract.js';
import { randomUUID } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { ServiceRequestLoop } from '../../src/service/service-request-loop.js';
import * as harnessExecution from '../../src/service/harness/primary-agent-harness.js';
import { adaptationMode } from '../../src/service/analysis/plan-edits.js';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { cpSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner, type ExecutionOwnerDependencies } from '../../src/service/analysis/execution.js';
import { BackgroundAnalysisDispatcher } from '../../src/service/background-analysis.js';
import { liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import { validateRequestAdmissionRecords, type LaunchBinding, type OrdinaryProductionLaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { dataVersionMarkerPath } from '../../src/service/data-version.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_V1_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { withModelClarification } from '../../src/service/provider/clarification-contract.js';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
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
  resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync,
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
  type ServiceResponse,
} from '../../src/shared/protocol.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../src/shared/provider-configuration.generated.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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

function owner(store: EditorialStore, production: ProductionLaunch, nativeFetch: typeof fetch, reads: string[] = [],
  controls: Pick<ExecutionOwnerDependencies, 'stageHold' | 'unitHold'> = {}): BaselineAnalysisExecutionOwner {
  const execution = new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.baselineAnalysisLedger,
    launchPolicy: production.policy,
    currentLaunchPolicy: () => production.policy,
    productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding),
    fixture: null,
    // A local placeholder for the editor's own credential: the broker releases it to the transmit step alone.
    secretResolver: { resolve: async (reference) => { reads.push(reference); return 'placeholder-production-key'; } },
    production: { scope: 'ordinary-production', nativeFetch },
    ...controls,
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

it('keeps launch fields enumerable across retained-reader fallback without freezing getters or changing their receiver (#1161)', async () => {
  const { store, production } = await openProductionStore();
  const ledger = store.baselineAnalysisLedger;
  const fallback = ledger.launch.retainedPolicyFor;
  expect(fallback).toBeTypeOf('function');
  const runtime = () => store.localFixtureRuntime();
  const launch: LaunchBinding = {
    operationalScope: 'ordinary-production',
    get policy() { expect(this).toBe(launch); return production.policy; },
    get live() { expect(this).toBe(launch); return production.live; },
    localFixtureRuntime: runtime,
  };
  ledger.bindLaunch(launch);
  const bound = ledger.launch;
  for (const key of ['operationalScope', 'live', 'policy', 'retainedPolicyFor', 'localFixtureRuntime']) {
    expect(Object.prototype.propertyIsEnumerable.call(bound, key)).toBe(true);
  }
  expect(bound.retainedPolicyFor).toBe(fallback);
  expect(bound.localFixtureRuntime).toBe(runtime);
  expect(bound.live).toBeNull();
  const first = await configure(store, production, 'opencode-go');
  expect(bound.policy).toBe(production.policy);
  expect(bound.live).toBe(production.live);
  expect(bound.live?.credentialReference).toBe(first);
  const next = await configure(store, production, 'deepseek-open-platform');
  expect(next).not.toBe(first);
  expect(bound.policy).toBe(production.policy);
  expect(bound.live).toBe(production.live);
  expect(bound.live?.credentialReference).toBe(next);
  const copied = { ...bound };
  ledger.bindLaunch(copied);
  expect(ledger.launch).toBe(copied);
  expect(ledger.launch).toMatchObject({ operationalScope: 'ordinary-production', policy: production.policy, live: production.live });
  expect(ledger.launch.retainedPolicyFor).toBe(fallback);
  expect(ledger.launch.localFixtureRuntime).toBe(runtime);
  const supplied: NonNullable<LaunchBinding['retainedPolicyFor']> = () => null;
  ledger.bindLaunch({ ...copied, retainedPolicyFor: supplied });
  expect(ledger.launch.retainedPolicyFor).toBe(supplied);
  ledger.bindLaunch(launch);
  expect(ledger.launch.retainedPolicyFor).toBe(supplied);
  expect(ledger.launch.localFixtureRuntime).toBe(runtime);
  ledger.bindLaunch({ operationalScope: 'ordinary-production', policy: production.policy, live: production.live });
  expect(ledger.launch.retainedPolicyFor).toBe(supplied);
  expect(Object.hasOwn(ledger.launch, 'localFixtureRuntime')).toBe(false);
  expect(ledger.launch.localFixtureRuntime).toBeUndefined();
  store.markCleanShutdown();
});

it.each(['missing', 'ambiguous'] as const)('refuses the %s actual baseline rule without inventing a serial receipt or admission history (#1131 rev10)', async (selection) => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '合成规则唯一性'); const prepared = prepare(store, bookId, production.policy);
  const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  const runId = authorized.dispatchRunRecordId!;
  const actualRule = liveKindRule(production.policy, store.baselineAnalysisLedger.definition.kind)!;
  const projected: LaunchPolicyProjection = { ...production.policy, providerProcessing: { ...production.policy.providerProcessing,
    admittedRules: selection === 'missing' ? production.policy.providerProcessing.admittedRules!.filter((rule) => rule.ruleId !== actualRule.ruleId)
      : [...production.policy.providerProcessing.admittedRules!, { ...actualRule, ruleId: 'duplicate-baseline-rule' }],
  } };
  let calls = 0; let credentials = 0;
  const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, fixture: null,
    launchPolicy: projected, currentLaunchPolicy: () => projected, productionPolicyFor: () => projected,
    secretResolver: { resolve: async () => { credentials += 1; return 'synthetic-placeholder'; } },
    production: { scope: 'ordinary-production', nativeFetch: async () => { calls += 1; throw new Error('unexpected synthetic send'); } } });
  owners.push(execution);
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  const before = db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runId);
  try {
    expect(() => execution.admitAndDispatch(runId)).toThrow('规则');
    expect(store.baselineAnalysisLedger.requestAdmissionOf(runId)).toBeNull();
    expect(db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runId)).toEqual(before);
    expect([calls, credentials]).toEqual([0, 0]); expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
  } finally { db.close(); }
});

it.each(['missing', 'denied', 'different-binding'] as const)('refuses a %s frozen-policy resolver before history or secret access (#1131)', async (resolution) => {
  const { store, production } = await openProductionStore();
  const reference = await configure(store, production, 'deepseek-open-platform');
  const bookId = await sample1Book(store, '合成固定策略准入拒绝'); const prepared = prepare(store, bookId, production.policy);
  const runId = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
  const before = store.inspectBaselineAnalysis(bookId, () => null).run!.transitions;
  let reads = 0; let sends = 0; const bindings: ConfiguredProviderBinding[] = [];
  const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: production.policy, fixture: null,
    ...(resolution === 'missing' ? {} : { productionPolicyFor: (binding: ConfiguredProviderBinding) => {
      bindings.push(binding);
      return resolution === 'denied' ? { ...production.policy, integrityState: 'denied' as const, denialReason: 'launch-policy-integrity-denied' as const }
        : resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', { ...GO, credentialReference: reference });
    } }),
    production: { scope: 'ordinary-production', nativeFetch: async () => { sends += 1; throw new Error('unexpected transport'); } },
    secretResolver: { resolve: async () => { reads += 1; return 'public-synthetic-placeholder'; } } });
  owners.push(execution);
  expect(() => execution.admitAndDispatch(runId)).toThrow();
  expect(store.inspectBaselineAnalysis(bookId, () => null).run!.transitions).toEqual(before);
  expect(reads).toBe(0); expect(sends).toBe(0);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
  expect(bindings).toEqual(resolution === 'missing' ? [] : [{ ...OFFICIAL, credentialReference: reference }]);
});

it('starts a queued enrolled background Run on its frozen route after Main becomes missing (#1131)', async () => {
  const { store, production } = await openProductionStore();
  const reference = await configure(store, production, 'deepseek-open-platform');
  const bookId = await sample1Book(store, '合成等待后台固定路线');
  const runtime = { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 3_600_000, quietMs: 30_000 };
  const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime);
  const version = store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, 'backfill', { kind: 'book', seriesId: null }, 400_000, runtime).enrollment!.enrollmentVersionId;
  let work = store.createBackgroundBaselineAnalysisPreparationWork(bookId, 'first-baseline', version, production.policy);
  while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
  const prepared = work.projection!;
  const runId = store.startEnrolledBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest, version, 'first-baseline', runtime).dispatchRunRecordId!;
  const calls: StubCall[] = []; const reads: string[] = [];
  const execution = owner(store, production, stubTransport(calls, await chainAnswers(prepared)), reads);
  execution.setBackgroundIdle(false);
  expect(execution.admitOrQueue(runId, store.baselineAnalysisLedger, 'background')).toBe('queued');
  expect(calls).toHaveLength(0); expect(reads).toHaveLength(0);
  const missing = store.saveModelServiceConnection('合成后台等待时新选择', null, 'needs-attention', 'opencode-go');
  store.setModelServiceCredentialState(missing.credentialReference, 'missing'); store.selectModelServiceRoute('opencode-go');
  await production.rebind(store); expect(production.live).toBeNull();
  execution.setBackgroundIdle(true); await execution.whenIdle();
  expect(store.baselineAnalysisLedger.currentRunState(runId)).toBe('completed');
  expect(calls.length).toBeGreaterThan(0); expect(calls.every((call) => call.url === OFFICIAL.endpoint)).toBe(true);
  expect(reads.length).toBeGreaterThan(0); expect(reads.every((read) => read === reference)).toBe(true);
  expect(store.baselineAnalysisLedger.requestAdmissionOf(runId)!.pins.policyRuleId).toBe('enrolled-background-manuscript-analysis-processing');
  expect(store.baselineAnalysisLedger.requestAdmissionOf(runId)!.width).toBe(1);
});

it('reopens a stopped Run on its frozen official route after Main switches to an unready connection (#1131)', async () => {
  const { store, production } = await openProductionStore(); const reference = await configure(store, production, 'deepseek-open-platform');
  const bookId = await sample1Book(store, '合成重启后固定路线'); const prepared = prepare(store, bookId, production.policy);
  const calls: StubCall[] = []; let limited = true;
  const transport = stubTransport(calls, await chainAnswers(prepared), (ordinal) => ordinal === 3 && limited
    ? { status: 402, body: { error: { message: 'Insufficient Balance' } } } : null);
  const original = owner(store, production, transport); const stopped = await run(store, original, bookId, prepared);
  expect(stopped.state).toBe('resumable');
  const runId = stopped.run!.runRecordId; const facts = store.baselineAnalysisLedger.loadExecutionPlan(runId);
  const originalDefinition = store.baselineAnalysisLedger.definitionForRun(runId, facts.promptContractDigest);
  const binding = store.baselineAnalysisLedger.executionBindingOf(runId); const checkpoints = store.baselineAnalysisLedger.unitCheckpoints(runId);
  const missing = store.saveModelServiceConnection('合成未就绪新选择', null, 'needs-attention', 'opencode-go');
  store.setModelServiceCredentialState(missing.credentialReference, 'missing'); store.selectModelServiceRoute('opencode-go');
  await original.dispose(); await store.close(); requestGovernor.close(); await requestGovernor.whenIdle(); requestGovernor = new ModelRequestGovernor();
  const reopened = await openProductionStore(roots.dataRoot); expect(reopened.production.live).toBeNull(); limited = false;
  const reads: string[] = []; const continued = owner(reopened.store, reopened.production, transport, reads);
  const ledger = reopened.store.baselineAnalysisLedger; const defaultDefinition = ledger.definition;
  const restored = ledger.definitionForRun(runId, facts.promptContractDigest);
  expect(restored.promptContractDigest).toBe(originalDefinition.promptContractDigest);
  expect(restored.schemaDigest).toBe(originalDefinition.schemaDigest); expect(restored.systemPrompt).toBe(originalDefinition.systemPrompt);
  expect(ledger.definition).toBe(defaultDefinition); expect(ledger.executionBindingOf(runId)).toEqual(binding);
  expect(ledger.unitCheckpoints(runId)).toEqual(checkpoints);
  expect(() => continued.admitAndDispatch(stopped.run!.runRecordId, reopened.store.baselineAnalysisLedger, { resume: true })).not.toThrow();
  await continued.whenIdle();
  expect(reopened.store.inspectBaselineAnalysis(bookId, () => null).run!.state).toBe('completed');
  expect(calls.every((call) => call.url === OFFICIAL.endpoint)).toBe(true);
  expect(reads.length).toBeGreaterThan(0); expect(reads.every((read) => read === reference)).toBe(true);
  expect(ledger.executionBindingOf(runId)?.bindingDigest).toBe(binding?.bindingDigest);
  expect(ledger.unitCheckpoints(runId).slice(0, checkpoints.length)).toEqual(checkpoints); expect(ledger.definition).toBe(defaultDefinition);
});

it('restores only exact current baseline contract variants without changing the new-plan default (#1131 rev14)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'deepseek-open-platform');
  const ledger = store.baselineAnalysisLedger; const selected = ledger.definition; const base = selected.clarificationBase ?? selected;
  const wrapped = withModelClarification(base);
  expect(ledger.definitionForDigest(base.promptContractDigest).promptContractDigest).toBe(base.promptContractDigest);
  expect(ledger.definitionForDigest(wrapped.promptContractDigest).promptContractDigest).toBe(wrapped.promptContractDigest);
  expect(ledger.definitionForDigest('0'.repeat(64)).promptContractDigest).not.toBe('0'.repeat(64));
  expect(ledger.definitionForDigest(BASELINE_PROMPT_CONTRACT_V1_DIGEST).promptContractDigest).not.toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
  expect(ledger.definition).toBe(selected);
});

it.each(['unrelated', 'retained-v1'] as const)('refuses an unmatched %s baseline contract before continuation effects (#1131 rev14)', async (variant) => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'deepseek-open-platform');
  const bookId = await sample1Book(store, '合成契约失配拒绝'); const prepared = prepare(store, bookId, production.policy);
  const calls: StubCall[] = []; const reads: string[] = [];
  const execution = owner(store, production, stubTransport(calls, await chainAnswers(prepared), () => ({ status: 402, body: { error: { message: 'Insufficient Balance' } } })), reads);
  const stopped = await run(store, execution, bookId, prepared); const runId = stopped.run!.runRecordId;
  const ledger = store.baselineAnalysisLedger; const facts = ledger.loadExecutionPlan(runId);
  const before = store.inspectBaselineAnalysis(bookId, () => null).run!.transitions; const sent = calls.length; const secrets = reads.length;
  const load = vi.spyOn(ledger, 'loadExecutionPlan').mockReturnValue({ ...facts,
    promptContractDigest: variant === 'retained-v1' ? BASELINE_PROMPT_CONTRACT_V1_DIGEST : '0'.repeat(64) });
  try {
    expect(() => execution.admitAndDispatch(runId, ledger, { resume: true })).toThrow('契约');
    expect(calls).toHaveLength(sent); expect(reads).toHaveLength(secrets);
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
  } finally { load.mockRestore(); }
  expect(store.inspectBaselineAnalysis(bookId, () => null).run!.transitions).toEqual(before);
});

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function deferred<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Synchronous fault boundary: public-sample test data only, with a consistent SQLite snapshot. */
function snapshotAtBoundary(name: string): string {
  const target = join(roots.dataRoot, '..', name);
  cpSync(roots.dataRoot, target, { recursive: true,
    filter: (source) => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
  const source = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { source.prepare('VACUUM INTO ?').run(join(target, 'store', 'ai7.sqlite')); } finally { source.close(); }
  return target;
}

it.each(['cross-unit-reduction', 'assurance-sampling'] as const)('reconciles a returned %s response lost before its checkpoint without a paused row or resend (#1131)', async (stage) => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的阶段中断'); const prepared = prepare(store, bookId, production.policy);
  const calls: StubCall[] = []; const transport = stubTransport(calls, await chainAnswers(prepared));
  const reached = deferred(); const release = deferred();
  const execution = owner(store, production, transport, [], { stageHold: async (current) => { if (current === stage) { reached.resolve(); await release.promise; } } });
  const running = run(store, execution, bookId, prepared); void running.catch(() => undefined); await reached.promise;
  const runRecordId = store.inspectBaselineAnalysis(bookId).run!.runRecordId;
  expect(store.baselineAnalysisLedger.currentRunState(runRecordId)).toBe('executing');
  expect([...store.baselineAnalysisLedger.requestAdmissionOf(runRecordId)!.open.values()].map((request) => request.stage)).toEqual([stage]);
  const snapshot = snapshotAtBoundary(`crash-returned-${stage}`);
  const stopped = execution.dispose(); release.resolve(); await stopped; await running;
  const reopened = await openProductionStore(snapshot); reopened.store.reconcileStoppedBaselineAnalysisRuns();
  const kept = reopened.store.baselineAnalysisLedger; const stages = kept.stageContinuationOf(runRecordId)!;
  if (stage === 'cross-unit-reduction') expect(stages.reduction?.outcome).toMatchObject({ state: 'gap', code: 'outcome-unknown' });
  else expect(stages.sampling?.turns.at(-1)?.state).toBe('outcome-unknown');
  expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  const count = () => calls.filter((call) => {
    const message = (JSON.parse(call.body) as { messages: Array<{ role: string; content: string }> }).messages.findLast((entry) => entry.role === 'user')!.content;
    return stage === 'cross-unit-reduction' ? parseCrossUnitMessageHeader(message) !== null : parseAssuranceSamplingMessageHeader(message) !== null;
  }).length;
  const before = count(); const continued = owner(reopened.store, reopened.production, transport);
  continued.admitAndDispatch(runRecordId, kept, { resume: true }); await continued.whenIdle();
  expect(count()).toBe(before); expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
  expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
});

it('reuses immediate completed reduction evidence and its exact usage after restart without a preceding pause (#1131)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的归纳结算'); const prepared = prepare(store, bookId, production.policy);
  const ledger = store.baselineAnalysisLedger; const checkpoint = ledger.checkpointStageRequests.bind(ledger); let snapshot: string | undefined;
  vi.spyOn(ledger, 'checkpointStageRequests').mockImplementation((runId, stage, stages, usage) => {
    checkpoint(runId, stage, stages, usage);
    if (stage === 'cross-unit-reduction' && stages.reduction?.outcome.state === 'closed' && snapshot === undefined) snapshot = snapshotAtBoundary('crash-after-reduction-settlement');
  });
  const calls: StubCall[] = []; const transport = stubTransport(calls, await chainAnswers(prepared));
  const settled = await run(store, owner(store, production, transport), bookId, prepared); const runId = settled.run!.runRecordId;
  expect(snapshot).toBeDefined();
  const reopened = await openProductionStore(snapshot!); reopened.store.reconcileStoppedBaselineAnalysisRuns();
  const kept = reopened.store.baselineAnalysisLedger; const saved = kept.stageContinuationOf(runId)!;
  expect(saved.reduction?.outcome.state).toBe('closed');
  const usage = kept.carriedUsageOf(runId)!.stages!['cross-unit-reduction']; expect(usage.requests).toBe(1);
  const before = calls.filter((call) => parseCrossUnitMessageHeader((JSON.parse(call.body).messages as Array<{ content: string }>).at(-1)!.content) !== null).length;
  const continued = owner(reopened.store, reopened.production, transport); continued.admitAndDispatch(runId, kept, { resume: true }); await continued.whenIdle();
  expect(calls.filter((call) => parseCrossUnitMessageHeader((JSON.parse(call.body).messages as Array<{ content: string }>).at(-1)!.content) !== null)).toHaveLength(before);
  const db = new DatabaseSync(join(snapshot!, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const outcome = JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ?').get(runId)!.canonical_json));
    expect(outcome.report.usagePerStage['cross-unit-reduction']).toEqual(usage);
  } finally { db.close(); }
});

it('settles a fenced unit by its frozen contract after a restart with Main missing, and the store opens again (#1131 review)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'deepseek-open-platform');
  const bookId = await sample1Book(store, '公开样书的冻结契约结算'); const prepared = prepare(store, bookId, production.policy);
  const ledger = store.baselineAnalysisLedger; const admit = ledger.admitModelRequest.bind(ledger); let snapshot: string | undefined;
  const fence = vi.spyOn(ledger, 'admitModelRequest').mockImplementation((runId, request, claim) => {
    admit(runId, request, claim);
    if (snapshot === undefined && request.stage === 'units' && request.unitOrdinal === 2) snapshot = snapshotAtBoundary('fenced-unit-under-frozen-contract');
  });
  const runId = (await run(store, owner(store, production, stubTransport([], await chainAnswers(prepared))), bookId, prepared)).run!.runRecordId;
  fence.mockRestore(); expect(snapshot).toBeDefined();
  const reopened = await openProductionStore(snapshot!);
  const missing = reopened.store.saveModelServiceConnection('合成重启后缺失的连接', null, 'needs-attention', 'opencode-go');
  reopened.store.setModelServiceCredentialState(missing.credentialReference, 'missing'); reopened.store.selectModelServiceRoute('opencode-go');
  await reopened.production.rebind(reopened.store); expect(reopened.production.live).toBeNull();
  const kept = reopened.store.baselineAnalysisLedger; const receipt = kept.requestAdmissionOf(runId)!;
  // The scenario this guards: the launch's current contract is no longer the one the Run froze.
  expect(kept.definition.promptContractDigest).not.toBe(receipt.pins.promptContractDigest);
  const admitted = new Map([...receipt.open.values()].filter((request) => request.stage === 'units').map((request) => [request.unitOrdinal!, request.requestDigest]));
  expect(admitted.has(2)).toBe(true);
  reopened.store.reconcileStoppedBaselineAnalysisRuns();
  expect(kept.requestAdmissionOf(runId)!.open.size).toBe(0);
  for (const [ordinal, requestDigest] of admitted) {
    const checkpoint = kept.unitCheckpoints(runId).find((entry) => entry.unit.unitOrdinal === ordinal)!;
    expect(checkpoint.unit.requestDigest).toBe(requestDigest);
    if (ordinal === 2) expect(checkpoint.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
  }
  const settled = kept.unitCheckpoints(runId);
  reopened.store.markCleanShutdown(); reopened.store.close();
  const again = await openProductionStore(snapshot!);
  expect(again.store.baselineAnalysisLedger.unitCheckpoints(runId)).toEqual(settled);
});

it('keeps an actually selected finite-ceiling production v2 Run serial with free global capacity (#1131)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的有限预算'); const initial = prepare(store, bookId, production.policy);
  const prepared = store.editBaselineAnalysisPlan({ bookId, taskIntentId: initial.taskIntent!.taskIntentId, planEnvelopeDigest: initial.planEnvelope!.digest,
    removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 },
  });
  const calls: StubCall[] = []; const normal = stubTransport(calls, await chainAnswers(prepared));
  const entered = deferred(); const release = deferred(); let first = true;
  const transport = (async (url: Parameters<typeof fetch>[0], init: RequestInit) => {
    const response = await normal(url, init);
    if (!first) return response; first = false;
    return { status: response.status, json: async () => { entered.resolve(); await release.promise; return response.json(); } };
  }) as unknown as typeof fetch;
  const execution = owner(store, production, transport); const running = run(store, execution, bookId, prepared); void running.catch(() => undefined);
  try {
    await entered.promise; const runId = store.inspectBaselineAnalysis(bookId).run!.runRecordId;
    expect(store.baselineAnalysisLedger.executionBindingOf(runId)!.binding.compositionVersion).toBe(2);
    expect(store.baselineAnalysisLedger.requestAdmissionOf(runId)!.width).toBe(1);
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 1, inFlight: 1, waiting: 0 }); expect(calls).toHaveLength(1);
    release.resolve(); expect((await running).run!.state).toBe('completed');
  } finally { release.resolve(); await execution.dispose(); await running; }
});

it('keeps a historical v2 binding without an execution receipt serial on explicit resume (#1131)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的历史绑定'); const prepared = prepare(store, bookId, production.policy);
  const ledger = store.baselineAnalysisLedger; const begin = ledger.beginRequestAdmissions.bind(ledger); let snapshot: string | undefined;
  vi.spyOn(ledger, 'beginRequestAdmissions').mockImplementation((runId, width, rule) => {
    if (snapshot === undefined) snapshot = snapshotAtBoundary('historical-v2-binding-without-receipt');
    return begin(runId, width, rule);
  });
  const answers = await chainAnswers(prepared); const firstCalls: StubCall[] = [];
  const original = await run(store, owner(store, production, stubTransport(firstCalls, answers)), bookId, prepared); const runId = original.run!.runRecordId;
  const reopened = await openProductionStore(snapshot!); reopened.store.reconcileStoppedBaselineAnalysisRuns();
  const kept = reopened.store.baselineAnalysisLedger;
  expect(kept.requestAdmissionOf(runId)).toBeNull(); const binding = kept.executionBindingOf(runId)!;
  expect(binding.binding.compositionVersion).toBe(2);
  const calls: StubCall[] = []; const normal = stubTransport(calls, answers); const entered = deferred(); const release = deferred(); let first = true;
  const transport = (async (url: Parameters<typeof fetch>[0], init: RequestInit) => {
    const response = await normal(url, init);
    if (!first) return response; first = false;
    return { status: response.status, json: async () => { entered.resolve(); await release.promise; return response.json(); } };
  }) as unknown as typeof fetch;
  const capacity = new ModelRequestGovernor(); const execution = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity,
    ledger: kept, launchPolicy: reopened.production.policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: transport },
    productionPolicyFor: (frozen) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', frozen),
    secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
  try {
    execution.admitAndDispatch(runId, kept, { resume: true }); await entered.promise;
    expect(kept.requestAdmissionOf(runId)!.width).toBe(1); expect(calls).toHaveLength(1);
    expect(capacity.snapshot()).toMatchObject({ registered: 1, inFlight: 1, waiting: 0 });
    release.resolve(); await execution.whenIdle();
    expect(kept.currentRunState(runId)).toBe('completed'); expect(kept.executionBindingOf(runId)!.bindingDigest).toBe(binding.bindingDigest);
  } finally { release.resolve(); await execution.dispose(); capacity.close(); await capacity.whenIdle(); }
});

/** An actual pre-receipt attempt, extended exclusively through the retained legacy question/answer/claim writers. */
async function legacyClaimLaunch() {
  const application = await openProductionStore(); await configure(application.store, application.production, 'opencode-go');
  const bookId = await sample1Book(application.store, '合成历史澄清回答'); const prepared = prepare(application.store, bookId, application.production.policy);
  const initialLedger = application.store.baselineAnalysisLedger; const begin = initialLedger.beginRequestAdmissions.bind(initialLedger);
  let snapshot: string | undefined;
  const intercept = vi.spyOn(initialLedger, 'beginRequestAdmissions').mockImplementation((id, width, rule) => {
    snapshot ??= snapshotAtBoundary('legacy-answer-before-first-receipt'); return begin(id, width, rule);
  });
  const answers = await chainAnswers(prepared); let runId: string;
  try { runId = (await run(application.store, owner(application.store, application.production, stubTransport([], answers)), bookId, prepared)).run!.runRecordId; }
  finally { intercept.mockRestore(); }
  const reopened = await openProductionStore(snapshot!); const ledger = reopened.store.baselineAnalysisLedger;
  expect(ledger.requestAdmissionOf(runId)).toBeNull();
  const facts = ledger.loadExecutionPlan(runId); const binding = ledger.executionBindingOf(runId)!;
  const definition = ledger.definitionForRun(runId, facts.promptContractDigest);
  const questionFor = (ordinal: number) => {
    const unit = facts.manifest.units[ordinal - 1]!;
    const message = definition.buildUnitMessage(unit, facts.manifest.units.length,
      new Map(ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId).map((block) => [block.blockId, block])));
    const id = ledger.recordClarificationRequest({ runRecordId: runId, attemptId: binding.attemptId, taskIntentId: facts.taskIntentId,
      unitOrdinal: ordinal, planVersion: facts.planVersionOrdinal, planEnvelopeDigest: facts.planEnvelopeDigest,
      requestDigest: definition.requestDigest(ordinal, unit.digest), failure: { code: 'MODEL_CLARIFICATION_REQUIRED', failureClass: 'clarification', status: null, reason: '合成历史问题。' },
      firstPayloadDigest: null, firstUnitMessageDigest: sha256Hex(message), firstUsage: { inputTokens: 10, outputTokens: 5 }, firstWallMs: 1,
      modelQuestion: { question: '按哪个合成阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true }, firstAttempts: 1 });
    ledger.recordRunState(runId, 'awaiting-clarification', { detail: '合成历史等待回答。' });
    ledger.recordClarificationAnswer(bookId, { taskIntentId: facts.taskIntentId, requestId: id, optionId: 'model-option-0', note: null });
    return id;
  };
  const questionId = questionFor(1); expect(ledger.claimModelClarificationAnswer(runId, questionId)).toBe(true);
  ledger.recordRunState(runId, 'resumable', { detail: '合成历史回答提交后中断。', modelClarificationAnswerClaim: questionId });
  expect(ledger.requestAdmissionOf(runId)).toBeNull(); expect(ledger.modelClarificationAnswerNotSent(runId, questionId, 1)).toBe(false);
  const predecessor = new DatabaseSync(join(snapshot!, 'store', 'ai7.sqlite'), { readOnly: true });
  try { expect(() => validateRequestAdmissionRecords(predecessor, false)).not.toThrow(); } finally { predecessor.close(); }
  const evidence = () => {
    const db = new DatabaseSync(join(snapshot!, 'store', 'ai7.sqlite'), { readOnly: true });
    try { return {
      schemaRevision: db.prepare('PRAGMA user_version').get()!.user_version,
      marker: readFileSync(dataVersionMarkerPath(snapshot!), 'utf8'),
      questions: db.prepare('SELECT request_id, canonical_json, sha256 FROM analysis_clarification_requests WHERE run_record_id = ? ORDER BY unit_ordinal').all(runId),
      answers: db.prepare('SELECT answer_id, canonical_json, sha256 FROM analysis_clarification_answers WHERE request_id IN (SELECT request_id FROM analysis_clarification_requests WHERE run_record_id = ?) ORDER BY answer_id').all(runId),
      states: db.prepare('SELECT sequence, canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runId),
    }; } finally { db.close(); }
  };
  const request = (ordinal: number) => ({ requestId: randomUUID(), producerId: randomUUID(), requestOrdinal: 1, sessionId: randomUUID(),
    unitOrdinal: ordinal, stage: 'units' as const, attemptIndex: 1, adaptationId: null, payloadDigest: sha256Hex('synthetic-no-send-payload'),
    messageDigest: sha256Hex('synthetic-no-send-message'), requestDigest: definition.requestDigest(ordinal, facts.manifest.units[ordinal - 1]!.digest),
    inputDigest: facts.manifest.units[ordinal - 1]!.digest, contractDigest: facts.promptContractDigest });
  return { ...reopened, ledger, runId, bookId, facts, binding, answers, snapshot: snapshot!, questionId, questionFor, evidence, request };
}

it.each([false, true])('keeps a real legacy answer claim unknown without repeating it, later no-send=%s (#1131 rev18)', async (laterNoSend) => {
  const legacy = await legacyClaimLaunch(); const original = legacy.evidence();
  if (laterNoSend) {
    legacy.ledger.beginRequestAdmissions(legacy.runId, 1, liveKindRule(legacy.production.policy, 'baseline-manuscript-analysis')!.ruleId);
    const unrelated = legacy.request(1); legacy.ledger.admitModelRequest(legacy.runId, unrelated);
    legacy.ledger.recordModelRequestNotSent(legacy.runId, unrelated.requestId);
    expect(legacy.ledger.modelClarificationAnswerNotSent(legacy.runId, legacy.questionId, 1)).toBe(false);
  }
  await legacy.store.close(); const restarted = await openProductionStore(legacy.snapshot);
  restarted.store.reconcileStoppedBaselineAnalysisRuns(); const kept = restarted.store.baselineAnalysisLedger;
  const calls: StubCall[] = []; const execution = owner(restarted.store, restarted.production, stubTransport(calls, legacy.answers));
  execution.admitAndDispatch(legacy.runId, kept, { resume: true }); await execution.whenIdle();
  expect(kept.requestAdmissionOf(legacy.runId)!.width).toBe(1);
  expect(kept.currentRunState(legacy.runId)).toBe('completed-with-gaps');
  expect(kept.unitCheckpoints(legacy.runId).find((checkpoint) => checkpoint.unit.unitOrdinal === 1)?.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.some((call) => /^分析单元 1\//u.test((JSON.parse(call.body) as { messages: Array<{ role: string; content: string }> }).messages.findLast((message) => message.role === 'user')!.content))).toBe(false);
  expect(kept.executionBindingOf(legacy.runId)!.bindingDigest).toBe(legacy.binding.bindingDigest);
  const after = legacy.evidence(); expect(after.questions).toEqual(original.questions); expect(after.answers).toEqual(original.answers);
  expect(after.states.slice(0, original.states.length)).toEqual(original.states);
  expect(kept.unitCheckpoints(legacy.runId).find((checkpoint) => checkpoint.unit.unitOrdinal === 1)?.observation?.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
});

it.each([{ guard: 'influence', cancel: false }, { guard: 'series', cancel: false }, { guard: 'influence', cancel: true }])
  ('keeps a receipt-free legacy claimed answer unknown during a denying $guard callback, cancel=$cancel (#1131 rev19)', async ({ guard, cancel }) => {
    const legacy = await legacyClaimLaunch(); const before = legacy.evidence(); let effects = 0;
    const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: legacy.ledger, launchPolicy: legacy.production.policy, fixture: null,
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding),
      production: { scope: 'ordinary-production', nativeFetch: async () => { effects += 1; throw new Error('unexpected stopped legacy send'); } },
      secretResolver: { resolve: async () => { effects += 1; return 'public-synthetic-placeholder'; } },
      ...(guard === 'influence' ? { influenceGuard: () => '合成拒绝继续读取' } : { seriesScopeGuard: () => '合成拒绝继续读取' }) });
    owners.push(execution);
    if (cancel) legacy.ledger.requestCancel(legacy.bookId, legacy.facts.taskIntentId);
    execution.admitAndDispatch(legacy.runId, legacy.ledger, { resume: true, ...(cancel ? { cancel: true } : {}) }); await execution.whenIdle();
    expect(effects).toBe(0); expect(legacy.ledger.requestAdmissionOf(legacy.runId)).toBeNull();
    expect(legacy.ledger.currentRunState(legacy.runId)).toBe(cancel ? 'cancelled' : 'interrupted');
    expect(legacy.ledger.unitCheckpoints(legacy.runId).find((checkpoint) => checkpoint.unit.unitOrdinal === 1)?.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
    expect(legacy.ledger.inspect(legacy.bookId).taskOutcome?.report?.usagePerStage.units).toMatchObject({ inputTokens: 10, outputTokens: 5 });
    expect(legacy.ledger.executionBindingOf(legacy.runId)!.bindingDigest).toBe(legacy.binding.bindingDigest);
    const after = legacy.evidence(); expect(after.questions).toEqual(before.questions); expect(after.answers).toEqual(before.answers);
    expect(after.states.slice(0, before.states.length)).toEqual(before.states);
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
    // Local settlement keeps the receipt-free historical checkpoint format, so the next real open still validates it.
    const db = new DatabaseSync(join(legacy.snapshot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const checkpoints = db.prepare('SELECT canonical_json FROM analysis_unit_checkpoints WHERE run_record_id = ?').all(legacy.runId);
      expect(checkpoints.length).toBeGreaterThan(0);
      expect(checkpoints.every((row) => !Object.hasOwn(JSON.parse(String(row.canonical_json)) as object, 'requests'))).toBe(true);
    } finally { db.close(); }
    await execution.dispose(); legacy.store.markCleanShutdown(); legacy.store.close();
    const reopened = await openProductionStore(legacy.snapshot);
    expect(reopened.store.baselineAnalysisLedger.requestAdmissionOf(legacy.runId)).toBeNull();
    expect(reopened.store.baselineAnalysisLedger.currentRunState(legacy.runId)).toBe(cancel ? 'cancelled' : 'interrupted');
  });

it.each(['null', 'object', 'non-uuid', 'foreign-question', 'wrong-answer-pin', 'unpaired', 'wrong-unit'] as const)
  ('refuses $0 claim evidence without treating old rows as new admissions (#1131 rev18)', async (damage) => {
    const legacy = await legacyClaimLaunch(); const rule = liveKindRule(legacy.production.policy, 'baseline-manuscript-analysis')!.ruleId;
    legacy.ledger.beginRequestAdmissions(legacy.runId, 1, rule);
    if (damage === 'wrong-unit' || damage === 'unpaired') {
      const question = legacy.questionFor(2);
      if (damage === 'wrong-unit') {
        const before = legacy.evidence();
        expect(() => legacy.ledger.admitModelRequest(legacy.runId, legacy.request(3), question)).toThrow('准入记录无法核对');
        expect(legacy.evidence()).toEqual(before); return;
      }
      legacy.ledger.recordRunState(legacy.runId, 'resumable', { modelClarificationAnswerClaim: question });
    } else {
      const db = new DatabaseSync(join(legacy.snapshot, 'store', 'ai7.sqlite'));
      const table = damage === 'wrong-answer-pin' ? 'analysis_clarification_answers' : 'analysis_run_states';
      const row = db.prepare(`SELECT rowid, canonical_json FROM ${table} WHERE ${table === 'analysis_run_states' ? "json_type(canonical_json, '$.modelClarificationAnswerClaim') IS NOT NULL" : 'request_id = ?'} ORDER BY rowid LIMIT 1`)
        .get(...(table === 'analysis_run_states' ? [] : [legacy.questionId]))!;
      const record = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
      if (damage === 'wrong-answer-pin') record.requestSha256 = '0'.repeat(64);
      else record.modelClarificationAnswerClaim = damage === 'null' ? null : damage === 'object' ? {} : damage === 'non-uuid' ? 'not-a-uuid' : randomUUID();
      const changed = canonicalRecord(record);
      const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?").all(table);
      db.exec('BEGIN');
      try {
        for (const trigger of triggers) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
        db.prepare(`UPDATE ${table} SET canonical_json = ?, sha256 = ? WHERE rowid = ?`).run(changed.json, changed.digest, row.rowid!);
        for (const trigger of triggers) db.exec(String(trigger.sql));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
    }
    const before = legacy.evidence();
    expect(() => legacy.ledger.requestAdmissionOf(legacy.runId)).toThrow();
    await expect(EditorialStore.open(legacy.snapshot, roots.codeRoot).then((incoming) => { opened.push(incoming); return incoming; })).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
    expect(legacy.evidence()).toEqual(before);
  });

it.each(['runRecordId', 'sequence', 'recordedAt'].flatMap((field) => [false, true].map((receiptExists) => ({ field, receiptExists }))))
  ('refuses rehashed legacy claim row $field drift, receiptExists=$receiptExists (#1131 rev19)', async ({ field, receiptExists }) => {
    const legacy = await legacyClaimLaunch();
    const rule = liveKindRule(legacy.production.policy, 'baseline-manuscript-analysis')!.ruleId;
    if (receiptExists) legacy.ledger.beginRequestAdmissions(legacy.runId, 1, rule);
    const db = new DatabaseSync(join(legacy.snapshot, 'store', 'ai7.sqlite'));
    const row = db.prepare("SELECT rowid, canonical_json FROM analysis_run_states WHERE run_record_id = ? AND json_type(canonical_json, '$.modelClarificationAnswerClaim') IS NOT NULL ORDER BY sequence LIMIT 1").get(legacy.runId)!;
    const record = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
    record[field] = field === 'runRecordId' ? randomUUID() : field === 'sequence' ? Number(record.sequence) + 100 : '1900-01-01T00:00:00.000Z';
    const changed = canonicalRecord(record); const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_run_states'").all();
    db.exec('BEGIN');
    try {
      for (const trigger of triggers) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
      db.prepare('UPDATE analysis_run_states SET canonical_json = ?, sha256 = ? WHERE rowid = ?').run(changed.json, changed.digest, row.rowid!);
      for (const trigger of triggers) db.exec(String(trigger.sql)); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
    const before = legacy.evidence();
    if (receiptExists) expect(() => legacy.ledger.requestAdmissionOf(legacy.runId)).toThrow();
    else expect(() => legacy.ledger.beginRequestAdmissions(legacy.runId, 1, rule)).toThrow();
    expect(legacy.evidence()).toEqual(before);
    await expect(EditorialStore.open(legacy.snapshot, roots.codeRoot).then((incoming) => { opened.push(incoming); return incoming; })).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
    expect(legacy.evidence()).toEqual(before);
  });

it.each(['carriedUsage', 'stageContinuation'] as const)('refuses a rehashed inherited %s copy on a later governed row (#1131 review)', async (field) => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的阶段证据副本'); const prepared = prepare(store, bookId, production.policy);
  const runId = (await run(store, owner(store, production, stubTransport([], await chainAnswers(prepared))), bookId, prepared)).run!.runRecordId;
  store.markCleanShutdown(); store.close();
  // Control: the untouched completed Run, its stage checkpoints and their inherited copies, opens.
  const control = await EditorialStore.open(roots.dataRoot, roots.codeRoot); control.markCleanShutdown(); control.close();
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  const copies = (db.prepare("SELECT rowid, canonical_json FROM analysis_run_states WHERE run_record_id = ? AND json_type(canonical_json, '$.requestAdmission') IS NOT NULL ORDER BY sequence").all(runId))
    .filter((row) => { const record = JSON.parse(String(row.canonical_json)) as { requestAdmission: { data: { event: { evidence?: { kind: string } } } }; carriedUsage?: unknown };
      return record.carriedUsage !== undefined && record.requestAdmission.data.event.evidence?.kind !== 'stage-checkpoint'; });
  expect(copies.length).toBeGreaterThan(0);
  const row = copies.at(-1)!; const record = JSON.parse(String(row.canonical_json)) as Record<string, any>;
  if (field === 'carriedUsage') record.carriedUsage.inputTokens += 1;
  else { record.stageContinuation.data.reduction.outcome = { state: 'not-run', reason: '合成篡改。' }; record.stageContinuation.digest = canonicalRecord(record.stageContinuation.data).digest; }
  const changed = canonicalRecord(record); const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_run_states'").all();
  db.exec('BEGIN');
  try {
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
    db.prepare('UPDATE analysis_run_states SET canonical_json = ?, sha256 = ? WHERE rowid = ?').run(changed.json, changed.digest, row.rowid!);
    for (const trigger of triggers) db.exec(String(trigger.sql)); db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
  await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot).then((incoming) => { opened.push(incoming); return incoming; })).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
});

it('claims a live clarification answer only with its granted fence and preserves a pause plus queued restart evidence (#1131)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的排队澄清'); const prepared = prepare(store, bookId, production.policy);
  const answers = await chainAnswers(prepared); const calls: StubCall[] = []; let asked = false;
  const transport = stubTransport(calls, answers, (ordinal) => {
    if (ordinal !== 1 || asked) return null; asked = true;
    return { status: 200, body: { model: GO.model, choices: [{ message: { content: JSON.stringify({ question: '本范围按哪个阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 } } };
  });
  const execution = owner(store, production, transport); const initial = await run(store, execution, bookId, prepared);
  const ledger = store.baselineAnalysisLedger; const runId = initial.run!.runRecordId; const question = ledger.clarificationsOf(runId)[0]!;
  expect(initial.run!.state).toBe('awaiting-clarification'); expect(ledger.unitCheckpoints(runId)).toHaveLength(7);
  expect(ledger.requestAdmissionOf(runId)!.open.size).toBe(0);
  store.answerBaselineAnalysisClarification({ bookId, taskIntentId: prepared.taskIntent!.taskIntentId, requestId: question.requestId, optionId: 'model-option-0', note: null });
  const occupiers = Array.from({ length: 4 }, (_, index) => requestGovernor.registerProducer({ key: `clarification-occupier:${index}`, kind: 'analysis-unit', lane: 'foreground' }));
  const permits = await Promise.all(occupiers.map((producer) => requestGovernor.acquire(producer, new AbortController().signal)));
  const queued = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor);
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => { const result = acquire(producer, signal); queued.resolve(); return result; });
  let stateAtClaim: string | undefined; const admit = ledger.admitModelRequest.bind(ledger);
  vi.spyOn(ledger, 'admitModelRequest').mockImplementation((id, request, claim) => { admit(id, request, claim); if (claim !== null && claim !== undefined) stateAtClaim = ledger.currentRunState(id); });
  try {
    execution.continueAnswered(runId); await queued.promise;
    expect(ledger.modelClarificationAnswerClaimed(runId, question.requestId)).toBe(false);
    expect(ledger.requestAdmissionOf(runId)!.open.size).toBe(0);
    const snapshot = snapshotAtBoundary('queued-unsent-clarification-answer');
    ledger.requestPause(bookId, prepared.taskIntent!.taskIntentId); execution.pauseRun(runId);
    for (const permit of permits) permit.release();
    await execution.whenIdle(); expect(stateAtClaim).toBe('pausing'); expect(ledger.currentRunState(runId)).toBe('paused');
    expect(ledger.unitCheckpoints(runId)).toHaveLength(8); expect(ledger.requestAdmissionOf(runId)!.open.size).toBe(0);
    for (const producer of occupiers) requestGovernor.unregisterProducer(producer);
    execution.admitAndDispatch(runId, ledger, { resume: true }); await execution.whenIdle(); expect(ledger.currentRunState(runId)).toBe('completed');
    const reopened = await openProductionStore(snapshot); reopened.store.reconcileStoppedBaselineAnalysisRuns();
    const kept = reopened.store.baselineAnalysisLedger;
    expect(kept.unitCheckpoints(runId)).toHaveLength(7); expect(kept.modelClarificationAnswerClaimed(runId, question.requestId)).toBe(false);
    const restartedCalls: StubCall[] = []; const restarted = owner(reopened.store, reopened.production, stubTransport(restartedCalls, answers));
    restarted.admitAndDispatch(runId, kept, { resume: true }); await restarted.whenIdle();
    expect(kept.currentRunState(runId)).toBe('completed'); expect(kept.unitCheckpoints(runId)).toHaveLength(8);
    expect(restartedCalls.filter((call) => /^分析单元 1\//u.test((JSON.parse(call.body).messages as Array<{ role: string; content: string }>).findLast((entry) => entry.role === 'user')!.content))).toHaveLength(1);
  } finally { for (const permit of permits) permit.release(); for (const producer of occupiers) requestGovernor.unregisterProducer(producer); }
});

it.each(['generic', 'AbortError', 'TimeoutError', 'forged-no-send'] as const)('never resends a possibly-sent production %s rejection during settlement, continuation or reopen (#1131)', async (kind) => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的未知结果回归');
  const prepared = prepare(store, bookId, production.policy); const calls: StubCall[] = [];
  const normal = stubTransport(calls, await chainAnswers(prepared)); let firstUnitCalls = 0;
  const transport: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const message = body.messages.findLast((entry) => entry.role === 'user')!.content;
    if (/^分析单元 1\//u.test(message)) {
      firstUnitCalls += 1;
      if (kind === 'AbortError' || kind === 'TimeoutError') throw new DOMException('synthetic admitted rejection', kind);
      throw kind === 'forged-no-send' ? Object.assign(new Error('synthetic admitted rejection'), { requestSent: false, code: 'UND_ERR_CONNECT_TIMEOUT' }) : new Error('synthetic admitted rejection');
    }
    return normal(url, init);
  };
  const execution = owner(store, production, transport); const settled = await run(store, execution, bookId, prepared);
  expect(firstUnitCalls).toBe(1);
  expect(settled.resultSetRevision?.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ unitOrdinal: 1, code: 'outcome-unknown' })]));
  const runRecordId = settled.run!.runRecordId;
  expect(adaptationMode(store.baselineAnalysisLedger.loadExecutionPlan(runRecordId).editorEdits, 'safe-retry')).toBe('automatic');
  expect(store.baselineAnalysisLedger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(() => execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true })).toThrow();
  expect(firstUnitCalls).toBe(1); await execution.dispose(); store.close();
  const reopened = await openProductionStore();
  reopened.store.reconcileStoppedBaselineAnalysisRuns();
  const restarted = owner(reopened.store, reopened.production, transport);
  expect(() => restarted.admitAndDispatch(runRecordId, reopened.store.baselineAnalysisLedger, { resume: true })).toThrow();
  expect(reopened.store.inspectBaselineAnalysis(bookId).resultSetRevision?.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ unitOrdinal: 1, code: 'outcome-unknown' })]));
  expect(firstUnitCalls).toBe(1);
});

it('preserves the committed production outcome when real harness cleanup subsequently rejects (#1131 rev8)', async () => {
  const prepareHarness = harnessExecution.prepareExecution;
  let preparations = 0; let cleanups = 0;
  vi.spyOn(harnessExecution, 'prepareExecution').mockImplementation(async (request) => {
    const terminalContext = preparations++ === 0;
    const handle = await prepareHarness(request);
    if (terminalContext) {
      const finish = handle.finish.bind(handle);
      vi.spyOn(handle, 'finish').mockImplementation(async () => { cleanups += 1; await finish(); throw new Error('synthetic cleanup rejection after real disposal'); });
    }
    return handle;
  });
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  const bookId = await sample1Book(store, '公开样书的清理回归'); const prepared = prepare(store, bookId, production.policy);
  const calls: StubCall[] = []; const execution = owner(store, production, stubTransport(calls, await chainAnswers(prepared)));
  const settled = await run(store, execution, bookId, prepared); const runRecordId = settled.run!.runRecordId;
  expect(cleanups).toBe(1);
  expect(settled.run?.state).toMatch(/^completed/u); expect(settled.resultSetRevision).not.toBeNull();
  expect(store.baselineAnalysisLedger.hasCommittedOutcome(runRecordId)).toBe(true);
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(db.prepare('SELECT classification FROM analysis_task_outcomes WHERE run_record_id = ?').all(runRecordId)).toEqual([{ classification: settled.run!.state }]);
    expect(db.prepare("SELECT 1 FROM analysis_run_states WHERE run_record_id = ? AND state = 'failed'").all(runRecordId)).toEqual([]);
  } finally { db.close(); }
  expect(store.baselineAnalysisLedger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
});

it.each(['queued', 'body', 'current-projection'] as const)('orders real-store settings and current projection through the framed probe loop at %s (#1131)', async (phase) => {
  const { store, production } = await openProductionStore();
  const reference = await configure(store, production, 'opencode-go');
  const initial = store.getModelServiceRouteConnection('opencode-go')!;
  if (phase === 'current-projection') store.saveModelServiceConnection('Other Fast route', null, 'ready', 'deepseek-open-platform');
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor({ globalCapacity: 1 });
  const blocker = requestGovernor.registerProducer({ key: 'other-live-consumer', kind: 'dialogue', lane: 'foreground' });
  const permit = await requestGovernor.acquire(blocker, new AbortController().signal);
  const queued = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor);
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => { const result = acquire(producer, signal); queued.resolve(); return result; });
  const input = new PassThrough(); const body = deferred<unknown>(); const consuming = deferred();
  const replies = new Map<string, ReturnType<typeof deferred<ServiceResponse>>>();
  const reply = (id: string): ReturnType<typeof deferred<ServiceResponse>> => {
    let pending = replies.get(id);
    if (pending === undefined) { pending = deferred<ServiceResponse>(); replies.set(id, pending); }
    return pending;
  };
  const output = new Writable({ write: (chunk: Buffer, _encoding, done) => {
    expect(chunk.readUInt32BE(0)).toBe(chunk.length - 4);
    const response = JSON.parse(chunk.subarray(4).toString('utf8')) as ServiceResponse;
    reply(response.id).resolve(response); done();
  } });
  const send = (op: string, value: unknown = {}) => {
    const id = randomUUID(); const bytes = Buffer.from(JSON.stringify({ id, op, input: value }));
    const frame = Buffer.alloc(4 + bytes.length); frame.writeUInt32BE(bytes.length); bytes.copy(frame, 4); input.write(frame); return id;
  };
  let sends = 0; let refreshed = 0; let finalFastRoute: string | undefined;
  const loop = new ServiceRequestLoop({ input, output, requestGovernor,
    probe: (selection, execution) => testModelServiceConnection(store, roots.codeRoot, {
      scope: 'ordinary-production', nativeFetch: (async () => { sends += 1; return { status: 200, json: async () => { consuming.resolve(); return body.promise; } }; }) as unknown as typeof fetch,
    }, selection, { resolve: async () => 'public-synthetic-placeholder' }, execution),
    probeCompleted: async () => { refreshed += 1; await production.rebind(store); finalFastRoute = store.getConfiguredModelRoleBinding('fast-interaction')?.route; },
    dispatch: async (request) => {
      if (request.op === 'saveModelServiceConnection') {
        const value = store.saveModelServiceConnection(request.input.connectionName, request.input.credentialReference,
          request.input.credentialOperationState, request.input.route);
        await production.rebind(store); return { id: request.id, ok: true, op: request.op, result: value };
      }
      if (request.op === 'getModelServiceStoredState') return { id: request.id, ok: true, op: request.op,
        result: { connection: store.getModelServiceConnection(), connections: store.getModelServiceConnections(), launchPolicy: production.policy, proxy: await store.getModelServiceProxy() } };
      if (request.op === 'selectFastRoleModel') {
        store.selectFastRoleModel(request.input.route, request.input.modelId); await production.rebind(store);
        return { id: request.id, ok: true, op: request.op, result: undefined };
      }
      throw new Error('unexpected ordinary operation');
    },
    failure: (id, error) => ({ id, ok: false, error: { code: error instanceof StoreError || error instanceof Error && 'code' in error ? String(error.code) : 'SERVICE_REQUEST_FAILED', message: '请求未完成。' } }),
    onFatal: () => input.end(),
  });
  const running = loop.run(); void running.catch(() => undefined);
  try {
    const p = send('testModelServiceConnection', { route: 'opencode-go', modelId: 'deepseek-v4.1-flash' }); await queued.promise;
    if (phase !== 'queued') { permit.release(); await consuming.promise; }
    const m = phase === 'current-projection' ? send('selectFastRoleModel', { route: 'deepseek-open-platform', modelId: 'deepseek-flash' })
      : send('saveModelServiceConnection', { route: 'opencode-go', connectionName: 'New generation', credentialReference: reference, credentialOperationState: 'ready' });
    expect(await reply(m).promise).toMatchObject({ ok: true });
    const c = send('getModelServiceStoredState');
    expect(await reply(c).promise).toMatchObject({ ok: true, result: { connections: expect.arrayContaining([
      expect.objectContaining({ credentialReference: reference, connectionTest: null }),
    ]) } });
    if (phase !== 'current-projection') expect(store.getModelServiceRouteConnection('opencode-go')!.credentialUpdatedAt).not.toBe(initial.credentialUpdatedAt);
    permit.release(); body.resolve({ model: GO.model, choices: [{ message: { content: 'AI7_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    expect(await reply(p).promise).toMatchObject(phase === 'current-projection' ? { ok: true, result: { outcome: 'passed' } }
      : { ok: false, error: { code: 'MODEL_SERVICE_CONNECTION_CONFLICT' } });
    input.end(); await running;
    expect(sends).toBe(phase === 'queued' ? 0 : 1); expect(refreshed).toBe(phase === 'current-projection' ? 1 : 0);
    if (phase === 'current-projection') {
      expect(finalFastRoute).toBe('deepseek-open-platform');
      expect(store.getModelServiceRouteConnection('opencode-go')!.connectionTest).toMatchObject({ outcome: 'passed', credentialUpdatedAt: initial.credentialUpdatedAt });
    } else {
      expect(store.getModelServiceRouteConnection('opencode-go')!.connectionTest).toBeNull();
      expect(store.getModelServiceRouteConnection('opencode-go')!.connectionName).toBe('New generation');
    }
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 1, inFlight: 0, waiting: 0 });
  } finally {
    body.resolve({}); permit.release(); requestGovernor.unregisterProducer(blocker); loop.close(); input.end(); await running;
  }
});

it('starts the selected finite model deadline only after real shared capacity grants a queued probe (#1131)', async () => {
  const { store, production } = await openProductionStore(); await configure(store, production, 'opencode-go');
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor({ globalCapacity: 1 });
  const foreign = requestGovernor.registerProducer({ key: 'deadline-occupier', kind: 'dialogue', lane: 'foreground' });
  const permit = await requestGovernor.acquire(foreign, new AbortController().signal);
  const queued = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor);
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => { const waiting = acquire(producer, signal); queued.resolve(); return waiting; });
  const cancellation = new AbortController(); const consuming = deferred(); let sends = 0; let settled = false;
  vi.useFakeTimers();
  const deadlineMs = production.policy.providerProcessing.transport!.requestDeadlineSeconds * 1000;
  const probe = testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: (async (_url: unknown, init: RequestInit) => {
    sends += 1;
    return { status: 200, json: () => new Promise<never>((_resolve, reject) => {
      const signal = init.signal!;
      const abort = (): void => { signal.removeEventListener('abort', abort); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true }); consuming.resolve(); if (signal.aborted) abort();
    }) };
  }) as unknown as typeof fetch }, { route: 'opencode-go', modelId: 'deepseek-v4.1-flash' },
  { resolve: async () => 'public-synthetic-placeholder' }, { requestGovernor, signal: cancellation.signal });
  void probe.then(() => { settled = true; }, () => { settled = true; });
  try {
    await queued.promise; await vi.advanceTimersByTimeAsync(deadlineMs + 1);
    expect(sends).toBe(0); expect(settled).toBe(false); expect(requestGovernor.snapshot().waiting).toBe(1);
    permit.release(); await consuming.promise;
    await vi.advanceTimersByTimeAsync(deadlineMs - 1); expect(settled).toBe(false); expect(requestGovernor.snapshot().inFlight).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await probe).outcome).toBe('outcome-unknown'); expect(sends).toBe(1);
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 1, waiting: 0, inFlight: 0 });
  } finally {
    cancellation.abort(); permit.release(); requestGovernor.unregisterProducer(foreign);
    await vi.advanceTimersByTimeAsync(0); await probe.catch(() => undefined); vi.useRealTimers();
  }
});

describe('ordinary production over exact sample1 with a stub transport (Issue #811)', { timeout: 120_000 }, () => {
  it.each(['opencode-go', 'deepseek-open-platform'] as const)('dispatches an enrolled background Run under v23 on %s with its mandatory frozen ceiling (#864)', async (route) => {
    const { store, production } = await openProductionStore();
    await configure(store, production, route);
    const reference = await sample1Book(store, 'L2 后台合成回答参照');
    const answers = await chainAnswers(prepare(store, reference, production.policy));
    const bookId = await sample1Book(store, 'L2 正式后台分析');
    const runtime = { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 3_600_000, quietMs: 30_000 };
    const selected = production.policy;
    expect(selected.providerProcessing.version).toBe('v30');
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
      expect(after.taskOutcome!.report!.background![0]).toBe('由后台处理登记开始 · 按第 1 版登记');
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
        providerProcessing: { operationalScope: 'ordinary-production', version: 'v30' } },
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
      policyPin: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v30' } });
    expect(settled.resultSetRevision?.policyPin).toMatchObject({ operationalScope: 'ordinary-production', providerProcessingVersion: 'v30' });
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
        { scope: 'ordinary-production', nativeFetch: responsesTransport(calls, 'AI7_OK') }, { route: 'openai-platform', modelId }, resolver, { requestGovernor });
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
    const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: productionFastRoleRoutes(
      { scope: 'ordinary-production', nativeFetch: responsesTransport(calls, JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA,
        translations: [{ n: 1, text: '公开连接测试的合成译文。' }] })) }, () => policy, () => fast.credentialReference, resolver) });
    try {
      const translator = materialTranslator(owner, 'ordinary-production', () => 1);
      const result = await translator.translate('a'.repeat(64), ['Public synthetic reference text for a connection contract.'], 'selection-proof');
      expect(result.kind).toBe('translated');
      if (result.kind !== 'translated') throw new Error('production translation failed');
      expect(result.made).toMatchObject({ model: fast.model, route: fast.route, policyRuleId: 'ordinary-production-material-translation',
        provenance: { role: 'Fast Interaction Role', endpoint: fast.endpoint, credentialReference: fast.credentialReference, policyVersion: 'v30',
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
          policyVersion: 'v30', usage: { inputTokens: 12, outputTokens: 7, reasoningTokens: 2 }, failureCode: null });
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
      await expect(testModelServiceConnection(store, roots.codeRoot, runtime, { route: 'openai-platform', modelId }, resolver, { requestGovernor })).rejects.toThrow();
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
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status.outcome).toBe(failure === 'unknown' ? 'outcome-unknown' : 'failed');
    expect(transport).toHaveBeenCalledTimes(1);
    if (failure === 'malformed' || failure === 'refusal' || failure === 'unexpected-text') expect(status.provenance?.usage).toMatchObject({ inputTokens: 12, outputTokens: failure === 'malformed' ? 0 : 1 });
    expect(status.provenance?.failureCode).toBe(status.code);
    expect(store.getModelServiceRouteConnection('openai-platform')?.connectionTest).toEqual(status);
    expect(JSON.stringify(status)).not.toContain('synthetic provider body');
    expect(store.getConfiguredModelRoleBinding('fast-interaction')).toBeNull();
    expect(connection.credentialReference).toHaveLength(36);
  });
  // The selected v30 retains the connection-test declaration and actual v25/v26/v27 provenance.
  it('reads a retained connection-test status from v25, v26 or v27 beside v30 and refuses an unsupported version', async () => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Retained probe', null, 'ready', 'openai-platform');
    const status = await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: responsesTransport([], 'AI7_OK') },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status).toMatchObject({ outcome: 'passed', provenance: { policyVersion: 'v30' } });
    store.close();
    for (const policyVersion of ['v25', 'v26', 'v27', 'v24']) {
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        database.prepare("UPDATE model_service_connections SET connection_test = ? WHERE provider_id = 'openai-platform'")
          .run(JSON.stringify({ ...status, provenance: { ...status.provenance, policyVersion } }));
      } finally { database.close(); }
      if (policyVersion !== 'v25' && policyVersion !== 'v26' && policyVersion !== 'v27') {
        await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow('连接测试来历无效。');
        continue;
      }
      const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot); opened.push(reopened);
      expect(reopened.getModelServiceRouteConnection('openai-platform')?.connectionTest?.provenance?.policyVersion).toBe(policyVersion);
      reopened.close();
    }
  });
  it('cancels an explicit probe before dispatch without resolving a key', async () => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Cancelled probe', null, 'ready', 'openai-platform');
    const resolver = { resolve: vi.fn(async () => 'public-placeholder') };
    const transport = vi.fn(); const controller = new AbortController(); controller.abort();
    const result = await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: transport },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, { requestGovernor, signal: controller.signal });
    expect(result.outcome).toBe('cancelled'); expect(resolver.resolve).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('keeps a probe cancelled after its key resolves but before it is sent cancelled, never outcome-unknown (#1080 review)', async () => {
    const { store } = await openProductionStore();
    store.saveModelServiceConnection('Cancelled late probe', null, 'ready', 'openai-platform');
    const controller = new AbortController();
    const resolver = { resolve: vi.fn(async () => { controller.abort(); return 'public-placeholder'; }) };
    const transport = vi.fn();
    const result = await testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: transport },
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, { requestGovernor, signal: controller.signal });
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
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, { requestGovernor });
    store.selectFastRoleModel('openai-platform', 'gpt-5.6-luna');
    const fast = store.getConfiguredModelRoleBinding('fast-interaction')!;
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null, fast);
    const forbiddenReads: string[] = []; const transport = vi.fn();
    const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: productionFastRoleRoutes({ scope: 'ordinary-production', nativeFetch: transport },
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
    const retest = () => testModelServiceConnection(store, roots.codeRoot, runtime, selection, { resolve: async () => 'public-synthetic-probe' }, { requestGovernor });
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
    const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: routes });
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
      { route: 'openai-platform', modelId: 'gpt-5.6-luna' }, resolver, { requestGovernor });
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
    const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: productionFastRoleRoutes(
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
        expect(preview).toMatchObject({ compatibility: 'compatible', schemaRevision: 95, dataVersion: 1 });
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
