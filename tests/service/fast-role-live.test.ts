import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { SAMPLE1_SOURCE_DIGEST } from '../../src/service/analysis/baseline-analysis-store.js';
import { FastRoleExecutionOwner, fastRoleLiveRoutes, fastRoleRouteRefusal, type FastRoleLiveRoutes } from '../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests, fastInteractionRoutes, polishWordsOf, regenerationRegionOf } from '../../src/service/fast-role/fast-role-suggestions.js';
import { EDITORIAL_POLISH_PROMPT_CONTRACT, buildEditorialPolishMessage } from '../../src/service/fast-role/polish-contract.js';
import { CONFLICT_REGENERATE_PROMPT_CONTRACT, buildConflictRegenerateMessage } from '../../src/service/fast-role/conflict-regenerate-contract.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import { PROVIDER_LEDGER_FILE, isItemLine, type ProviderLedgerLine } from '../../src/service/provider/provider-result-cache.js';
import { EditorialStore } from '../../src/service/store.js';
import type { DevelopmentValidationIntent, FastInteractionRequestProjection, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import {
  AUTHORED_POLISH_ANSWER,
  AUTHORED_REGENERATION,
  AUTHORED_REGENERATION_ANSWER,
  conflictOf,
  conflictUnitIndex,
  constructSample1Conflict,
  polishSelectionOf,
  typoBlock,
  type Sample1Book,
} from '../support/fast-role.js';

// Service-integration suite (L2) for 润色这段 and 基于当前稿件重新生成建议 on the live route (Issue #842; ADR 0089; ADR 0067):
// the real store, PrimaryAgentHarness composition, Egress Gate, Credential Broker, Provider Test Ledger and Result Cache, under
// the selected developer-live Provider Processing v11 (Issue #841) and its two Fast Interaction Role rules.
// Only the transport is a stub, so no socket is opened and no credential value beyond a local placeholder exists.

const VALIDATION: DevelopmentValidationIntent = { family: 'fast-interaction-suggestions', case: 'sample1-selected-sentence', delta: null };

interface StubCall {
  readonly url: string;
  readonly body: string;
}

/** A transport that answers every request with `answer`; `unknown` accepts a request and never returns its answer whole. */
function stubTransport(calls: StubCall[], answer: (body: string) => string, options: { unknown?: boolean } = {}): typeof fetch {
  const transport = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    if (options.unknown === true) return { status: 200, json: async () => { throw new Error('connection closed mid-answer'); } };
    return {
      status: 200,
      json: async () => ({
        model: OPENCODE_GO_MODEL,
        choices: [{ message: { content: answer(init.body) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 260, completion_tokens: 70 },
      }),
    };
  };
  return transport as unknown as typeof fetch;
}

let roots: ServiceTestRoots;
let cacheRoot: string;
let livePolicy: LaunchPolicyProjection;
let store: EditorialStore;
let book: Sample1Book;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-fast-role-live-');
  await requireExactSample1(roots.codeRoot);
  cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-fast-role-cache-'));
  const verified = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  expect(verified.integrityState).toBe('verified');
  livePolicy = verified;
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '实时润色');
});

afterEach(async () => {
  try { store.close(); } catch { /* closed by its test */ }
  await roots.dispose();
  await rm(cacheRoot, { recursive: true, force: true });
});

function live(nativeFetch: typeof fetch, options: { validation?: DevelopmentValidationIntent | null; credential?: string | null; policy?: LaunchPolicyProjection } = {}): FastRoleLiveRoutes {
  const validation = options.validation === undefined ? VALIDATION : options.validation;
  const credential = options.credential === undefined ? 'placeholder-development-key' : options.credential;
  return fastRoleLiveRoutes(
    { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 }, providerCacheRoot: cacheRoot, validation }, nativeFetch },
    options.policy ?? livePolicy,
    { resolve: async () => credential },
  );
}

function requests(routes: FastRoleLiveRoutes): FastRoleRequests {
  return new FastRoleRequests(new FastRoleExecutionOwner({ fixture: null, live: routes }), store);
}

async function ledgerLines(): Promise<ProviderLedgerLine[]> {
  const raw = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8').catch(() => '');
  return raw.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as ProviderLedgerLine).filter(isItemLine);
}

async function settled(fast: FastRoleRequests, requestId: string): Promise<FastInteractionRequestProjection> {
  await fast.settled();
  return fast.inspect(book.bookId, requestId);
}

describe('the fast-role routes under developer-live', () => {
  it('admits each kind only under its own rule, and refuses a Book outside the admitted SampleBooks before anything is sent', async () => {
    const calls: StubCall[] = [];
    const admitted = live(stubTransport(calls, () => AUTHORED_POLISH_ANSWER));
    expect(admitted.routes['editorial-polish']!.ruleId).toBe('developer-live-public-samplebook-editorial-polish');
    expect(admitted.routes['conflict-regenerate']!.ruleId).toBe('developer-live-public-samplebook-conflict-regenerate');
    expect(fastRoleRouteRefusal({ fixture: null, live: admitted }, 'editorial-polish', SAMPLE1_SOURCE_DIGEST)).toBeNull();
    expect(fastRoleRouteRefusal({ fixture: null, live: admitted }, 'editorial-polish', '0'.repeat(64)))
      .toBe('当前运行范围未允许润色这段：这本书不在开发者实时可发送的公开样书范围内。');
    // A policy that names neither kind — v10's rules, here — refuses both with the route-aware reason.
    const withoutFastRules = livePolicy.providerProcessing.admittedRules.filter((rule) => !rule.taskKinds.some((kind) => kind === 'editorial-polish' || kind === 'conflict-regenerate'));
    const unadmitted = live(stubTransport(calls, () => AUTHORED_POLISH_ANSWER), {
      policy: { ...livePolicy, providerProcessing: { ...livePolicy.providerProcessing, admittedRules: withoutFastRules } },
    });
    const owner = new FastRoleExecutionOwner({ fixture: null, live: unadmitted });
    expect(fastInteractionRoutes(owner, book.bookId)).toEqual({
      bookId: book.bookId,
      editorialPolish: { available: false, reason: '当前运行范围未允许润色这段：选定的模型处理规则没有准许它使用实时模型。' },
      conflictRegenerate: { available: false, reason: '当前运行范围未允许重新生成建议：选定的模型处理规则没有准许它使用实时模型。' },
    });
    expect(() => new FastRoleRequests(owner, store).polish(book.bookId, { selection: polishSelectionOf(store, book) })).toThrow(/选定的模型处理规则没有准许它使用实时模型/u);
    expect(calls).toHaveLength(0);
    expect(await ledgerLines()).toHaveLength(0);
  });
});

describe('润色这段 on the live route (provider-free)', () => {
  it('sends the one bounded message under its rule once, files it as S30, and places the anchored suggestions', async () => {
    const calls: StubCall[] = [];
    const fast = requests(live(stubTransport(calls, () => AUTHORED_POLISH_ANSWER)));
    const selection = polishSelectionOf(store, book);
    const started = fast.polish(book.bookId, { selection });
    const read = await settled(fast, started.taskId);
    expect(read.kind === 'editorial-polish' && read.polish).toMatchObject({ state: 'suggested', outcomeUnknown: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(OPENCODE_GO_ROUTE_PROFILE.endpoint);
    const body = JSON.parse(calls[0]!.body) as { model: string; tools?: unknown; messages: Array<{ role: string; content: string }> };
    expect(body.model).toBe(OPENCODE_GO_MODEL);
    // #893 rev 8: the selected v18 rule admits targeted retrieval, yet 润色's frozen contract says 不调用任何工具, so no tool is registered.
    expect(livePolicy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes('editorial-polish'))!.localTools.targetedRetrieval.allowed).toBe(true);
    expect(body.tools).toBeUndefined();
    // Exactly the frozen contract and the one message: the selection and its paragraph's bounded window, nothing else of the Book.
    const words = polishWordsOf(typoBlock(store, book).block.text, selection.fromGrapheme, selection.toGrapheme);
    expect(sha256Hex(canonicalJson(body.messages))).toBe(sha256Hex(canonicalJson([
      { role: 'system', content: EDITORIAL_POLISH_PROMPT_CONTRACT.systemPrompt },
      { role: 'user', content: buildEditorialPolishMessage({ before: words.before, selection: words.text, after: words.after }) },
    ])));
    const lines = await ledgerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ itemId: 'S30/editorial-polish/1', purpose: 'editorial-polish', outcome: 'transmitted', status: 200, model: OPENCODE_GO_MODEL });
    expect(lines[0]!.taskPromptContractDigest).toBe(lines[0]!.promptContractDigest);
    expect(lines[0]!.validation).toMatchObject({ family: VALIDATION.family, case: VALIDATION.case, step: 'editorial-polish/ask', decision: 'first-capture' });
    // The ledger records identities and counts, never content.
    expect(JSON.stringify(lines).includes(selection.selectedText)).toBe(false);
  });

  it('replays the identical request under the same validation and asks again as business', async () => {
    const devCalls: StubCall[] = [];
    const fast = requests(live(stubTransport(devCalls, () => AUTHORED_POLISH_ANSWER)));
    await settled(fast, fast.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    const again = await settled(fast, fast.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    expect(again.kind === 'editorial-polish' && again.polish.state).toBe('suggested');
    expect(devCalls).toHaveLength(1);
    expect((await ledgerLines()).map((line) => [line.itemId, line.outcome, line.validation?.decision])).toEqual([
      ['S30/editorial-polish/1', 'transmitted', 'first-capture'],
      ['S30/editorial-polish/2', 'replayed', 'exact-replay'],
    ]);
    const before = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
    const businessCalls: StubCall[] = [];
    const business = requests(live(stubTransport(businessCalls, () => AUTHORED_POLISH_ANSWER), { validation: null }));
    await settled(business, business.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    expect(businessCalls).toHaveLength(1);
    expect(await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8')).toBe(before);
  });

  it('holds a request whose answer never came back whole as outcome-unknown and never sends it again on its own', async () => {
    const calls: StubCall[] = [];
    const fast = requests(live(stubTransport(calls, () => AUTHORED_POLISH_ANSWER, { unknown: true })));
    const first = await settled(fast, fast.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    expect(first.kind === 'editorial-polish' && first.polish).toMatchObject({ state: 'failed', outcomeUnknown: true, markIds: [] });
    const second = await settled(fast, fast.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    expect(second.kind === 'editorial-polish' && second.polish).toMatchObject({ state: 'failed', outcomeUnknown: true });
    expect(calls).toHaveLength(1);
    expect((await ledgerLines()).map((line) => [line.outcome, line.classification ?? null])).toEqual([['failed', 'outcome-unknown'], ['refused', null]]);
  });

  it('sends nothing when the credential is absent', async () => {
    const calls: StubCall[] = [];
    const fast = requests(live(stubTransport(calls, () => AUTHORED_POLISH_ANSWER), { credential: null }));
    const read = await settled(fast, fast.polish(book.bookId, { selection: polishSelectionOf(store, book) }).taskId);
    expect(read.kind === 'editorial-polish' && read.polish).toMatchObject({ state: 'failed', outcomeUnknown: false });
    expect(calls).toHaveLength(0);
    expect(await ledgerLines()).toHaveLength(0);
  });
});

describe('基于当前稿件重新生成建议 on the live route (provider-free)', () => {
  it('replays S22 validation and sends fresh business requests without recording them as tests', async () => {
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const input = { manuscriptId: book.manuscriptId, branchId: book.branchId, markId, basisDigest: conflict.basisDigest, unitIndex: conflictUnitIndex(conflict) };
    const calls: StubCall[] = [];
    const fast = requests(live(stubTransport(calls, () => AUTHORED_REGENERATION_ANSWER)));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await settled(fast, fast.regenerate(input).requestId);
      expect(result.kind === 'conflict-regenerate' && result.regeneration.outcome).toBe('drafted');
    }
    expect(calls).toHaveLength(1);
    expect((await ledgerLines()).map((line) => [line.itemId, line.outcome, line.validation?.decision])).toEqual([
      ['S22/conflict-regenerate/1', 'transmitted', 'first-capture'],
      ['S22/conflict-regenerate/2', 'replayed', 'exact-replay'],
    ]);
    const before = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
    const businessCalls: StubCall[] = [];
    const business = requests(live(stubTransport(businessCalls, () => AUTHORED_REGENERATION_ANSWER), { validation: null }));
    await settled(business, business.regenerate(input).requestId);
    expect(businessCalls).toHaveLength(1);
    expect(await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8')).toBe(before);
  });

  it('retains an S22 unknown outcome without resending or saving a draft', async () => {
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const unknownInput = { manuscriptId: book.manuscriptId, branchId: book.branchId, markId, basisDigest: conflict.basisDigest, unitIndex: conflictUnitIndex(conflict) };
    const unknownCalls: StubCall[] = [];
    const unknown = requests(live(stubTransport(unknownCalls, () => AUTHORED_REGENERATION_ANSWER, { unknown: true }), {
      validation: { ...VALIDATION, case: 'sample1-conflict-unknown' },
    }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await settled(unknown, unknown.regenerate(unknownInput).requestId);
      expect(result.kind === 'conflict-regenerate' && result.regeneration).toMatchObject({ outcome: 'failed', outcomeUnknown: true });
    }
    expect(unknownCalls).toHaveLength(1);
    expect(conflictOf(store, book, markId).draft).toBeNull();
  });

  it('sends the conflict unit under its own rule and category, files it as S22, and saves the draft with the rule as lineage', async () => {
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const unitIndex = conflictUnitIndex(conflict);
    const calls: StubCall[] = [];
    const fast = requests(live(stubTransport(calls, () => AUTHORED_REGENERATION_ANSWER)));
    const started = fast.regenerate({ manuscriptId: book.manuscriptId, branchId: book.branchId, markId, basisDigest: conflict.basisDigest, unitIndex });
    const read = await settled(fast, started.requestId);
    expect(read.kind === 'conflict-regenerate' && read.regeneration.outcome).toBe('drafted');
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.body) as { tools?: unknown; messages: Array<{ role: string; content: string }> };
    // #893 rev 8: as for 润色, the admitted retrieval registers no tool under the frozen no-tool contract.
    expect(livePolicy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes('conflict-regenerate'))!.localTools.targetedRetrieval.allowed).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(sha256Hex(canonicalJson(body.messages))).toBe(sha256Hex(canonicalJson([
      { role: 'system', content: CONFLICT_REGENERATE_PROMPT_CONTRACT.systemPrompt },
      { role: 'user', content: buildConflictRegenerateMessage(regenerationRegionOf(conflict, unitIndex)) },
    ])));
    expect((await ledgerLines()).map((line) => [line.itemId, line.purpose, line.outcome, line.validation?.step])).toEqual([
      ['S22/conflict-regenerate/1', 'conflict-regenerate', 'transmitted', 'conflict-regenerate/unit'],
    ]);
    const drafted = conflictOf(store, book, markId);
    expect(drafted.draft!.resolutions[unitIndex]).toEqual({ resolution: 'edited', text: AUTHORED_REGENERATION });
    expect(drafted.draft!.regeneration?.unitIndex).toBe(unitIndex);
  });
});
