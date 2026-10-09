import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { describeComposition } from '../../src/service/harness/primary-agent-harness.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner, WEB_VERIFICATION_INCOMPLETE_GAP_REASON } from '../../src/service/analysis/execution.js';
import type { LaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, factualReviewRequestDigest, parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  assuranceSamplingRequestDigest,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { loadModelFixture, resolveFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ownBlockIdsOf, substituteAssuranceSamplingRefPlaceholders, substituteBlockPlaceholders } from '../../src/service/provider/local-deterministic-adapter.js';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { PLATFORM_TOOL_ROUND_TRIP_BREAKER } from '../../src/service/provider/platform-tools.js';
import { PROVIDER_LEDGER_FILE } from '../../src/service/provider/provider-result-cache.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  FACTUAL_REVIEW_TASK_GOAL,
  WEB_VERIFICATION_INCOMPLETE,
  type FactualReviewProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the execution wiring of AI7's platform tools (Issue #473, S87-f3b; ADR 0080 §7).
// Everything is real except the transport and one capability byte: the store, the frozen plan, the pinned DSH composition
// with the two tools registered, the Egress Gate's three decisions and their tickets, the per-unit breakers, the Provider
// Test Ledger and the Research Snapshot Cache. The transport is a stub that stands in for the captured native `fetch` at
// both the model endpoint and the search host, so no socket is opened and no credential value beyond a local placeholder
// exists. The bound profile is `opencode-go/deepseek-v4-flash` with `toolCalling` read as `function` — the one byte the ADR
// 0080 §7.7 evidence item will establish — because with the shipped `none` no composition registers a tool at all, which
// the second case pins. The manuscript is exact `sample1` (ADR 0043).

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const CEILING = { kind: 'tokens', maxTotalTokens: 5_000_000 } as const;
const SEARCH_HOST = DEVELOPER_LIVE_POLICY_BINDING.websearchHost;
/** The shipped flash profile with the one capability the §7.7 item would evidence; every other byte is the profile's own. */
const FUNCTION_CALLING_FLASH: ProviderModelProfile = {
  ...OPENCODE_GO_V4_FLASH_PROFILE,
  capabilities: { ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities, toolCalling: 'function' },
};

interface StubCall {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

let roots: ServiceTestRoots;
let cacheRoot: string;
let livePolicy: LaunchPolicyProjection;
let ciPolicy: LaunchPolicyProjection;
let baselineFixture: ResolvedModelFixture;
let factualFixture: ResolvedModelFixture;
let opened: EditorialStore[] = [];

vi.setConfig({ hookTimeout: 60_000 });

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-platform-tools-');
  cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-provider-cache-'));
  opened = [];
  livePolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  ciPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(livePolicy.integrityState).toBe('verified');
  expect(livePolicy.providerProcessing.platformTools?.websearch.host).toBe(SEARCH_HOST);
  baselineFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  factualFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
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

function liveBinding(toolCalling: 'none' | 'function'): LaunchBinding {
  return {
    operationalScope: 'developer-live',
    live: {
      route: DEVELOPER_LIVE_POLICY_BINDING.route,
      model: DEVELOPER_LIVE_POLICY_BINDING.model,
      endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      runBudgetCeiling: CEILING,
      // What the service entry reads from the verified v8 projection and the bound profile (Issue #473).
      platformTools: livePolicy.providerProcessing.platformTools ?? null,
      toolCalling,
    },
  };
}

/** A settled baseline analysis on the deterministic route, so that the factual review has something to sit beside. */
async function settleBaseline(): Promise<string> {
  await requireExactSample1(roots.codeRoot);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: baselineFixture.identity, fixtureSha256: baselineFixture.sha256, fixtureLineage: baselineFixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: ciPolicy, fixture: baselineFixture, secretResolver: { resolve: async () => null },
  });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, 'platform tools sample1');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'platform tools 主编辑连接');
    let progress = store.createBaselineAnalysisPreparationWork(imported.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, ciPolicy);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const authorized = store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!);
    await owner.whenIdle();
    expect(store.inspectBaselineAnalysis(imported.bookId).resultSetRevision!.ordinal).toBe(1);
    store.markCleanShutdown();
    return imported.bookId;
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** The same store reopened under the developer-live launch, both ledgers bound to it. */
async function openLive(toolCalling: 'none' | 'function'): Promise<EditorialStore> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null,
  });
  store.baselineAnalysisLedger.bindLaunch(liveBinding(toolCalling));
  store.factualReviewLedger.bindLaunch(liveBinding(toolCalling));
  opened.push(store);
  return store;
}

function prepareFactual(store: EditorialStore, bookId: string): FactualReviewProjection {
  let progress = store.createFactualReviewPreparationWork(bookId, FACTUAL_REVIEW_TASK_GOAL, livePolicy);
  while (!progress.done) progress = store.advanceFactualReviewPreparationWork(progress.workId!);
  return progress.projection!;
}

/**
 * The stub transport at both hosts. Unit 1 of the factual Run is a model that never stops searching: every model call
 * answers with one new `websearch` call, so the unit's round trips reach the breaker. Every other unit answers from the
 * authored factual fixture; the sampling turn from its named entries; the reflection with a synthetic valid item. The
 * search host answers every query with one short public text naming a source.
 */
function stubTransport(prepared: FactualReviewProjection, record: { model: StubCall[]; search: StubCall[] }): typeof fetch {
  let searchCalls = 0;
  const units = new Map<number, string>();
  for (const unit of prepared.coverageManifest!.units) {
    const digest = factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
    const entry = resolveFixtureEntry(factualFixture.entries, unit.ordinal, digest, 1);
    expect(entry?.response.kind, `fixture answer for unit ${unit.ordinal}`).toBe('unit-result');
    units.set(unit.ordinal, (entry!.response as { text: string }).text);
  }
  const named = new Map<string, string>();
  for (const entry of factualFixture.entries.values()) {
    if (entry.unitOrdinal === 0 && entry.response.kind === 'unit-result') named.set(entry.requestDigest, entry.response.text);
  }
  const transport = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (new URL(url).hostname === SEARCH_HOST) {
      record.search.push({ url, body });
      searchCalls += 1;
      const payload = { jsonrpc: '2.0', id: body['id'], result: { content: [{ type: 'text', text: `公开资料第 ${searchCalls} 条：见 https://example.org/source-${searchCalls}` }] } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    record.model.push({ url, body });
    const messages = body['messages'] as Array<{ role: string; content: string | null }>;
    const first = messages.find((message) => message.role === 'user')?.content ?? '';
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    const answer = (content: string) => ({ status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content } }], usage }) });
    const header = parseFactualReviewUnitMessageHeader(first);
    if (header !== null) {
      if (header.ordinal === 1) {
        // The loop: one fresh search per model call, forever. The breaker, not the model, ends it.
        const call = record.model.length;
        return {
          status: 200,
          json: async () => ({
            choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${call}`, type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: `核查第 ${call} 条断言` }) } }] } }],
            usage,
          }),
        };
      }
      return answer(substituteBlockPlaceholders(units.get(header.ordinal)!, ownBlockIdsOf(first)));
    }
    const sampling = parseAssuranceSamplingMessageHeader(first);
    if (sampling !== null) {
      const text = named.get(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, sampling.unitOrdinal, sampling.unitDigest, sampling.sampleDigest));
      if (text === undefined) return { status: 500, json: async () => ({ error: { message: 'no synthetic sampling answer' } }) };
      return answer(substituteAssuranceSamplingRefPlaceholders(text, parseAssuranceSamplingListedRefs(first)));
    }
    if (first.startsWith('运行反思 ')) {
      return answer(JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '下次运行先限定需要联网核查的断言范围。', basis: '本次账目中有一个范围因工具往返达到熔断上限而未形成结果。' }] }));
    }
    return { status: 500, json: async () => ({ error: { message: 'unexpected message' } }) };
  };
  return transport as unknown as typeof fetch;
}

async function ledgerLines(): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
  return raw.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('the platform tools on a factual Run under developer-live (Issue #473, S87-f3b)', { timeout: 120_000 }, () => {
  it('registers the two tools for the declaring kind, ends a looping unit at the breaker as 联网核查未完成, and goes on', async () => {
    const bookId = await settleBaseline();
    const store = await openLive('function');
    const prepared = prepareFactual(store, bookId);
    // The plan froze the composition with the tools: the digest is the one `describeComposition` gives with them, and
    // it is not the tool-less one every plan froze before.
    const withTools = describeComposition('opencode-go', 'deepseek-v4-flash', FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, { platformTools: true });
    const without = describeComposition('opencode-go', 'deepseek-v4-flash', FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST);
    expect(withTools.tools.registeredTools).toBe(2);
    expect(prepared.planEnvelope!.behaviorCompositionDigest).toBe(withTools.digest);
    expect(prepared.planEnvelope!.behaviorCompositionDigest).not.toBe(without.digest);

    const record = { model: [] as StubCall[], search: [] as StubCall[] };
    const owner = new BaselineAnalysisExecutionOwner({
      ledger: store.factualReviewLedger,
      launchPolicy: livePolicy,
      fixture: null,
      secretResolver: { resolve: async () => 'placeholder-development-key' },
      developerLive: { launch: { runBudgetCeiling: CEILING, providerCacheRoot: cacheRoot }, nativeFetch: stubTransport(prepared, record) },
      modelProfile: FUNCTION_CALLING_FLASH,
    });
    try {
      const authorized = store.authorizeFactualReview(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      await owner.whenIdle();
      const settled = store.inspectFactualReview(bookId, (runRecordId) => owner.progressFor(runRecordId));

      // Every model request of the Run offered exactly the two platform tools; no tool text left as a credential could.
      expect(record.model.length).toBeGreaterThan(SAMPLE1_UNITS);
      for (const call of record.model) {
        expect((call.body['tools'] as unknown[]).map((tool) => (tool as { function: { name: string } }).function.name).sort()).toEqual(['webfetch', 'websearch']);
        expect(JSON.stringify(call.body)).not.toContain('placeholder-development-key');
      }
      // Unit 1 looped: the breaker admitted its first 128 distinct searches, refused the 129th call as tripped, and the gate
      // refused the model call after it — so the unit made one model call more than searches, and no 130th.
      const unitOne = record.model.filter((call) => parseFactualReviewUnitMessageHeader((call.body['messages'] as Array<{ role: string; content: string | null }>).find((m) => m.role === 'user')?.content ?? '')?.ordinal === 1);
      expect(record.search).toHaveLength(PLATFORM_TOOL_ROUND_TRIP_BREAKER);
      expect(unitOne).toHaveLength(PLATFORM_TOOL_ROUND_TRIP_BREAKER + 1);
      for (const call of record.search) {
        expect(call.url).toBe(`https://${SEARCH_HOST}/mcp`);
        expect(call.body).toMatchObject({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'web_search' } });
      }

      // The unit settled as the disclosed state, never as an adapter failure, and the Run went on to every other unit.
      const revision = settled.resultSetRevision!;
      expect(settled.state).toBe('settled');
      expect(settled.taskOutcome!.classification).toBe('completed-with-gaps');
      expect(revision.gaps).toEqual([expect.objectContaining({ unitOrdinal: 1, code: 'web-verification-incomplete', reason: WEB_VERIFICATION_INCOMPLETE_GAP_REASON })]);
      expect(revision.coverage.unitsClosed).toBe(SAMPLE1_UNITS - 1);
      expect(revision.findings.length).toBeGreaterThan(0);
      expect(revision.findings.every((finding) => finding.unitOrdinal !== 1)).toBe(true);
      // The factual revision's research discloses the same state and names the range; the other units' states are untouched.
      expect(revision.research.state).toBe(WEB_VERIFICATION_INCOMPLETE);
      expect(revision.research.statement).toContain('第 1 个阅读范围');
      expect(revision.research.fetched).toBe(0);
      // Nothing was retried: the attempt holds exactly one span for unit 1 — its failure is not retry-safe, so neither the
      // automatic safe retry nor the ask-first path could take it.
      const attempt = settled.run!.attempt!;
      expect(attempt.spans.filter((span) => span.unitOrdinal === 1)).toHaveLength(1);
      expect(settled.run!.state).toBe('completed-with-gaps');

      // Every search is a ledger item of its own kind under the Task mode's purpose — the digest and the host, never the
      // query text — beside the model-call lines, whose shape is unchanged.
      const lines = await ledgerLines();
      const searches = lines.filter((line) => line['kind'] === 'search-call');
      expect(searches).toHaveLength(PLATFORM_TOOL_ROUND_TRIP_BREAKER);
      for (const line of searches) {
        expect(String(line['itemId'])).toMatch(/^S87\//u);
        expect(line['host']).toBe(SEARCH_HOST);
        expect(JSON.stringify(line)).not.toContain('核查第');
        expect(JSON.stringify(line)).not.toContain('公开资料');
      }
      for (const line of lines.filter((line) => line['kind'] === undefined)) {
        expect(String(line['itemId'])).toMatch(/^S40\//u);
        expect(Object.keys(line).slice(0, 5)).toEqual(['itemId', 'purpose', 'model', 'promptContractDigest', 'requestDigest']);
      }
    } finally {
      await owner.dispose();
    }
  });

  it('registers no tool and freezes the tool-less composition while the bound profile declares no function calling', async () => {
    const bookId = await settleBaseline();
    const store = await openLive('none');
    const prepared = prepareFactual(store, bookId);
    // The declaring kind under the selected v8 rule, on the profile as it ships: the composition every plan froze before,
    // byte for byte, so nothing this selection changes reaches a request body today.
    const without = describeComposition('opencode-go', 'deepseek-v4-flash', FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST);
    expect(without.tools.registeredTools).toBe(0);
    expect(without).not.toHaveProperty('platformTools');
    expect(prepared.planEnvelope!.behaviorCompositionDigest).toBe(without.digest);
  });
});
