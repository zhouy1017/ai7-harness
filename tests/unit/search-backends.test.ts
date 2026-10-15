import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  SEARCH_BACKENDS,
  SEARCH_BACKEND_DECLARATIONS,
  SEARCH_BACKEND_EVALUATION,
  SEARCH_RANKING_TIER_WIDTH,
  anonymousSearchInterface,
  defaultSearchBackend,
  pricePerCallUsd,
  rankSearchBackends,
  searchBackendDeclarationOf,
  searchBackendExclusion,
  searchBackendOutcome,
  type MeasuredSearchProfile,
  type SearchBackendDeclaration,
} from '../../src/service/provider/search-backends.js';
import { CONFIGURED_CREDENTIAL_SLOTS } from '../../src/shared/provider-configuration.generated.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// The search backend registry and decision 24⁵'s exclusion and ranking rule (Issue #883), over the checked-in documents, the
// recorded profiles and synthetic profiles only. Nothing here transmits and no credential is read.

installNodeNetworkDenial();

type Harness = {
  measuringHostRefusal: (env: Record<string, string | undefined>, host: string) => string | null;
  parseArguments: (argv: string[]) => unknown;
  onDomain: (url: string, domains: string[]) => string | null;
  judgeQuery: (query: unknown, referenceDomains: unknown, hits: Array<{ title: string; url: string }>) => { hit: boolean; primaryHit: boolean; listed: number; results: number };
  profileOf: (backendId: string, run: unknown, querySet: unknown) => MeasuredSearchProfile;
  percentile: (values: number[], fraction: number) => number | null;
  measuredCall: (transport: { fetch: (...args: unknown[]) => Promise<Response>; agent: unknown }, declaration: SearchBackendDeclaration, query: string, credential: string) => Promise<ProbeCall>;
  formatProbeResult: (backendId: string, call: ProbeCall) => string;
  recordRunOnce: (path: string, run: { backendId: string; finishedAt: string | null; calls: unknown[] }, measure: (checkpoint: () => Promise<void>) => Promise<void>) => Promise<void>;
};
type ProbeCall = { status: number | null; latencyMs: number; retried: boolean; transportError: string | null; hits: Array<{ title: string; url: string }> | null; shape: string | null; costUsd: number | null };
type Validator = { validatePolicyDocument: (data: unknown, schema: unknown) => void };

// @ts-expect-error tools/*.mjs carry no declarations; the harness is exercised as the plain module it is.
const harness = (await import('../../tools/search-backend-evaluation.mjs')) as unknown as Harness;
// @ts-expect-error tools/*.mjs carry no declarations.
const { validatePolicyDocument } = (await import('../../tools/validate-policies.mjs')) as unknown as Validator;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const readJson = (path: string): any => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const QUERY_SET = readJson('tools/search-backend-evaluation/queries.json');

function profile(backendId: string, overrides: Partial<{ verdict: MeasuredSearchProfile['verdict']; overall: number; chinese: number; international: number; cost: number | null }> = {}): MeasuredSearchProfile {
  const chinese = overrides.chinese ?? 10;
  const international = overrides.international ?? 10;
  return {
    backendId,
    verdict: overrides.verdict ?? 'measured',
    queries: 30,
    answered: 30,
    transportErrors: 0,
    transportRetries: 0,
    statusClasses: { '2xx': 30, '3xx': 0, '4xx': 0, '5xx': 0, none: 0 },
    hits: { overall: overrides.overall ?? chinese + international, chinese, international },
    totals: { overall: 30, chinese: 15, international: 15 },
    sourceQuality: { primaryHits: 0, primaryEligible: 0, listedResults: 0, results: 0 },
    latencyMs: { p50: 100, p95: 200 },
    costPerCallUsd: overrides.cost ?? null,
    note: null,
  };
}

describe('the search backend registry (Issue #883)', () => {
  it('declares the five backends from their documents, each on its own generated credential slot', () => {
    expect(SEARCH_BACKEND_DECLARATIONS.map((entry) => entry.id)).toEqual(['search-bochaai', 'search-brave', 'search-deepseek', 'search-parallel', 'search-tinyfish']);
    for (const declaration of SEARCH_BACKEND_DECLARATIONS) {
      const document = readJson(`config/providers/search-backends/${declaration.id}.json`);
      expect(declaration.endpoint).toBe(document.request.endpoint);
      expect(declaration.host).toBe(new URL(document.request.endpoint).hostname);
      expect(declaration.price).toEqual({ amount: document.price.amount, currency: document.price.currency, per: document.price.per, basis: document.price.basis });
      expect(declaration.keyRequired).toBe(document.credential.keyRequired);
      expect(CONFIGURED_CREDENTIAL_SLOTS as readonly string[]).toContain(declaration.credentialSlot);
    }
    expect(anonymousSearchInterface('parallel')).toEqual({ endpoint: 'https://search.parallel.ai/mcp', host: 'search.parallel.ai', protocol: 'mcp-tools-call', tool: 'web_search' });
    expect(anonymousSearchInterface('brave')).toBeNull();
    expect(anonymousSearchInterface('exa')).toBeNull();
    const bocha = SEARCH_BACKENDS.find((entry) => entry.id === 'search-bochaai')!;
    expect(bocha.price.amount).toBe(0.036);
    expect(bocha.priceSource).toMatchObject({ verified: false, source: null, readOn: null });
    expect(bocha.priceSource.note).toContain('exact URL not retained');
    expect(SEARCH_BACKENDS.filter((entry) => entry.id !== bocha.id).every((entry) => entry.priceSource.verified)).toBe(true);
  });

  it('refuses a document whose shape it does not know rather than guessing', () => {
    const document = readJson('config/providers/search-backends/search-brave.json');
    expect(searchBackendDeclarationOf(document).protocol).toBe('brave-web-search');
    expect(() => searchBackendDeclarationOf({ ...document, request: { ...document.request, protocol: 'other-search' } })).toThrowError(/SEARCH_BACKEND_CONFIGURATION/u);
    expect(() => searchBackendDeclarationOf({ ...document, backendId: 'brave' })).toThrowError(/SEARCH_BACKEND_CONFIGURATION/u);
    expect(() => searchBackendDeclarationOf({ ...document, support: 'not-supported' })).toThrowError(/SEARCH_BACKEND_CONFIGURATION/u);
    const unsupported = searchBackendDeclarationOf({ ...document, support: 'not-supported', request: { endpoint: null, method: null, protocol: null, evidence: 'x' } });
    expect(unsupported).toMatchObject({ support: 'not-supported', endpoint: null, host: null });
    expect(searchBackendExclusion(unsupported, profile(unsupported.id))).toBe('not-supported');
  });

  it('replays the recorded profiles: the registry derives exactly the recorded exclusions, ranking and default', () => {
    const record = readJson('config/providers/recorded-evidence/search-backend-profiles.json');
    validatePolicyDocument(record, readJson('config/providers/recorded-evidence/search-backend-profiles.v1.schema.json'));
    expect(record.evaluation.tierWidth).toBe(SEARCH_RANKING_TIER_WIDTH);
    expect(record.evaluation.querySet.queries).toBe(QUERY_SET.queries.length);
    const outcome = searchBackendOutcome(SEARCH_BACKEND_DECLARATIONS, record.profiles, record.evaluation.cnyPerUsd.rate);
    expect(outcome).toEqual(record.outcome);
    expect(SEARCH_BACKEND_EVALUATION.profiles).toEqual(record.profiles);
    // The registry's entries: shipped ones by rank, then the excluded ones with their reason.
    expect(SEARCH_BACKENDS.filter((entry) => entry.shipped).map((entry) => [entry.id, entry.rank, entry.tier]))
      .toEqual(record.outcome.ranking.map((entry: { backendId: string; tier: number }, index: number) => [entry.backendId, index + 1, entry.tier]));
    expect(SEARCH_BACKENDS.filter((entry) => !entry.shipped).map((entry) => [entry.id, entry.exclusion]))
      .toEqual(record.outcome.excluded.map((entry: { backendId: string; reason: string }) => [entry.backendId, entry.reason]));
    expect(SEARCH_BACKENDS).toHaveLength(SEARCH_BACKEND_DECLARATIONS.length);
    expect(defaultSearchBackend()?.id ?? null).toBe(record.outcome.default);
  });
});

describe("decision 24⁵'s exclusion and ranking rule", () => {
  const declaration = (id: string, price: SearchBackendDeclaration['price']): SearchBackendDeclaration => ({
    ...SEARCH_BACKEND_DECLARATIONS[0]!, id: id as SearchBackendDeclaration['id'], credentialSlot: id as SearchBackendDeclaration['id'], price,
  });

  it('excludes only the clearly unusable', () => {
    const brave = SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === 'search-brave')!;
    expect(searchBackendExclusion(brave, null)).toBe('not-measured');
    expect(searchBackendExclusion(brave, profile(brave.id, { verdict: 'unreachable', chinese: 0, international: 0 }))).toBe('unreachable');
    expect(searchBackendExclusion(brave, profile(brave.id, { verdict: 'no-authenticated-response', chinese: 0, international: 0 }))).toBe('no-authenticated-response');
    expect(searchBackendExclusion(brave, profile(brave.id, { chinese: 0, international: 0 }))).toBe('zero-hits-both-halves');
    // One half alone is enough to stay: decision 24⁵ excludes no hits on both halves, not a weak half.
    expect(searchBackendExclusion(brave, profile(brave.id, { chinese: 0, international: 1 }))).toBeNull();
    expect(searchBackendExclusion(brave, profile(brave.id, { chinese: 1, international: 0 }))).toBeNull();
  });

  it('puts every backend within ten points of the best in the top tier, ordered by price, and the rest in hit-rate order', () => {
    const ranking = rankSearchBackends([
      { backendId: 'a', hitRate: 0.9, pricePerCallUsd: 0.005 },
      { backendId: 'b', hitRate: 0.8, pricePerCallUsd: 0.001 },
      { backendId: 'c', hitRate: 0.85, pricePerCallUsd: null },
      { backendId: 'd', hitRate: 0.79, pricePerCallUsd: 0 },
      { backendId: 'e', hitRate: 0.5, pricePerCallUsd: 0 },
      { backendId: 'f', hitRate: 0.7, pricePerCallUsd: 0.01 },
    ]);
    // b (0.80) is exactly ten points below the best and in tier 1; d (0.79) is not, however cheap.
    expect(ranking).toEqual([
      { backendId: 'b', tier: 1 },
      { backendId: 'a', tier: 1 },
      { backendId: 'c', tier: 1 },
      { backendId: 'd', tier: 2 },
      { backendId: 'f', tier: 2 },
      { backendId: 'e', tier: 3 },
    ]);
    expect(rankSearchBackends([])).toEqual([]);
    // Equal price inside the top tier falls back to hit rate, then id.
    expect(rankSearchBackends([
      { backendId: 'y', hitRate: 0.8, pricePerCallUsd: 0.005 },
      { backendId: 'x', hitRate: 0.8, pricePerCallUsd: 0.005 },
      { backendId: 'z', hitRate: 0.85, pricePerCallUsd: 0.005 },
    ]).map((entry) => entry.backendId)).toEqual(['z', 'x', 'y']);
  });

  it('orders prices across currencies at the recorded rate, and a token-billed backend at its measured cost', () => {
    expect(pricePerCallUsd(declaration('search-cny', { amount: 0.036, currency: 'CNY', per: 1, basis: 'x' }), null, 6.7313)).toBeCloseTo(0.036 / 6.7313, 10);
    expect(pricePerCallUsd(declaration('search-usd', { amount: 5, currency: 'USD', per: 1000, basis: 'x' }), null, 6.7313)).toBeCloseTo(0.005, 10);
    const tokens = declaration('search-tokens', { amount: null, currency: 'USD', per: 1, basis: 'tokens' });
    expect(pricePerCallUsd(tokens, null, 6.7313)).toBeNull();
    expect(pricePerCallUsd(tokens, profile('search-tokens', { cost: 0.002 }), 6.7313)).toBe(0.002);
  });

  it('derives the outcome over synthetic profiles: exclusions first, then the ranking, the first ranked the default', () => {
    const [bochaai, brave, deepseek, parallel, tinyfish] = SEARCH_BACKEND_DECLARATIONS;
    const outcome = searchBackendOutcome(SEARCH_BACKEND_DECLARATIONS, [
      profile(bochaai!.id, { chinese: 14, international: 12 }),
      profile(brave!.id, { verdict: 'unreachable', chinese: 0, international: 0 }),
      profile(deepseek!.id, { chinese: 13, international: 13, cost: 0.003 }),
      profile(parallel!.id, { chinese: 0, international: 0 }),
    ], 6.7313);
    expect(outcome.excluded).toEqual([
      { backendId: 'search-brave', reason: 'unreachable' },
      { backendId: 'search-parallel', reason: 'zero-hits-both-halves' },
      { backendId: 'search-tinyfish', reason: 'not-measured' },
    ]);
    expect(tinyfish!.id).toBe('search-tinyfish');
    // 26 and 26 hits: one tier; bochaai at ¥0.036 ≈ $0.0053 against deepseek's measured $0.003.
    expect(outcome.ranking).toEqual([{ backendId: 'search-deepseek', tier: 1 }, { backendId: 'search-bochaai', tier: 1 }]);
    expect(outcome.default).toBe('search-deepseek');
  });
});

describe('the evaluation harness, provider-free', () => {
  it('refuses CI and guest CLI invocations before loading the credential or transport owners', () => {
    const runtimeGuard = "import { registerHooks, syncBuiltinESMExports } from 'node:module'; import os from 'node:os'; registerHooks({ resolve(s,c,next) { if (['esbuild','undici','@napi-rs/keyring'].includes(s)) throw new Error('runtime-loading-refused'); return next(s,c); } });";
    const script = join(ROOT, 'tools/search-backend-evaluation.mjs');
    for (const name of ['CI', 'GITHUB_ACTIONS', 'AI7_E2E_JOURNEY']) {
      const child = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(runtimeGuard)}`, script, '--probe', 'search-brave'], {
        encoding: 'utf8', env: { [name]: '' }, timeout: 10_000, windowsHide: true,
      });
      expect(child.status, name).toBe(1);
      expect(child.stdout, name).toBe('');
      expect(child.stderr.trim(), name).toBe('SEARCH_EVALUATION/ci-refused');
    }
    for (const host of ['ai7-testbed-01', 'AI7-TESTBED-02']) {
      const preload = `${runtimeGuard} os.hostname = () => ${JSON.stringify(host)}; syncBuiltinESMExports();`;
      const child = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, script, '--run', 'search-brave'], {
        encoding: 'utf8', env: {}, timeout: 10_000, windowsHide: true,
      });
      expect(child.status, host).toBe(1);
      expect(child.stdout, host).toBe('');
      expect(child.stderr.trim(), host).toBe('SEARCH_EVALUATION/guest-refused');
    }
  });

  it('sends once after a timeout or body failure, retaining an observed HTTP status without raw errors', async () => {
    const declaration = SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === 'search-tinyfish')!;
    const failing = vi.fn(async () => { throw Object.assign(new Error('synthetic-private-detail'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); });
    const timedOut = await harness.measuredCall({ fetch: failing, agent: {} }, declaration, 'public test query', 'unit-test-credential');
    expect(failing).toHaveBeenCalledTimes(1);
    expect(timedOut).toMatchObject({ status: null, retried: false, transportError: 'UND_ERR_CONNECT_TIMEOUT', hits: null });
    const tooLarge = vi.fn(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1), { status: 200 }));
    const bounded = await harness.measuredCall({ fetch: tooLarge, agent: {} }, declaration, 'public test query', 'unit-test-credential');
    expect(tooLarge).toHaveBeenCalledTimes(1);
    expect(bounded).toMatchObject({ status: 200, retried: false, transportError: 'SEARCH_EVALUATION/body-too-large', hits: null });
    const untrustedError = vi.fn(async () => { throw { name: 'synthetic-private-detail', cause: { code: 'synthetic-private-detail' } }; });
    const redacted = await harness.measuredCall({ fetch: untrustedError, agent: {} }, declaration, 'public test query', 'unit-test-credential');
    expect(untrustedError).toHaveBeenCalledTimes(1);
    expect(redacted.transportError).toBe('transport-error');
    expect(JSON.stringify([timedOut, bounded, redacted])).not.toContain('synthetic-private-detail');
  });

  it('projects the single-query probe to no more than three bounded title/URL lines', async () => {
    const declaration = SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === 'search-tinyfish')!;
    const fetch = vi.fn(async () => new Response(JSON.stringify({ results: Array.from({ length: 8 }, (_, i) => ({
      title: `${i}\n${'t'.repeat(150)}`, url: `https://example.org/${i}/${'u'.repeat(250)}`, snippet: 'raw-payload-not-for-output',
    })) }), { status: 200 }));
    const call = await harness.measuredCall({ fetch, agent: {} }, declaration, QUERY_SET.probe.query, 'unit-test-credential');
    expect(fetch).toHaveBeenCalledTimes(1);
    const output = harness.formatProbeResult(declaration.id, call);
    expect(output.split('\n')).toHaveLength(4);
    expect(output).toContain('8 results');
    expect(output).not.toContain('raw-payload-not-for-output');
    expect(output).not.toContain('unit-test-credential');
    for (const line of output.split('\n').slice(1)) expect(line.length).toBeLessThanOrEqual(325);
  });

  it('persists the run before sending and retains completed calls when interrupted, refusing another invocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai7-search-evaluation-'));
    const path = join(directory, 'run.json');
    const run = { backendId: 'search-test', finishedAt: null, calls: [] as unknown[] };
    try {
      await expect(harness.recordRunOnce(path, run, async (checkpoint) => {
        expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(run);
        run.calls.push({ id: 'zh-01', status: 200 });
        await checkpoint();
        throw new Error('interrupted-before-next-answer');
      })).rejects.toThrow('interrupted-before-next-answer');
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(run);
      const sendAgain = vi.fn(async () => undefined);
      await expect(harness.recordRunOnce(path, run, sendAgain)).rejects.toMatchObject({ code: 'SEARCH_EVALUATION/already-run' });
      expect(sendAgain).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('lets only one concurrent invocation send, then finishes that same run record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai7-search-evaluation-'));
    const path = join(directory, 'run.json');
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const run = { backendId: 'search-test', finishedAt: null, calls: [] };
    const first = harness.recordRunOnce(path, run, async () => { entered.resolve(); await finish.promise; });
    try {
      await entered.promise;
      const concurrentSend = vi.fn(async () => undefined);
      await expect(harness.recordRunOnce(path, run, concurrentSend)).rejects.toMatchObject({ code: 'SEARCH_EVALUATION/already-run' });
      expect(concurrentSend).not.toHaveBeenCalled();
      finish.resolve();
      await first;
      expect(JSON.parse(await readFile(path, 'utf8')).finishedAt).toMatch(/^20\d\d-/u);
    } finally {
      finish.resolve();
      await first;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('runs on a developer host only', () => {
    expect(harness.measuringHostRefusal({ CI: 'true' }, 'owner-pc')).toBe('SEARCH_EVALUATION/ci-refused');
    expect(harness.measuringHostRefusal({ GITHUB_ACTIONS: 'true' }, 'owner-pc')).toBe('SEARCH_EVALUATION/ci-refused');
    expect(harness.measuringHostRefusal({}, 'ai7-testbed-01')).toBe('SEARCH_EVALUATION/guest-refused');
    expect(harness.measuringHostRefusal({}, 'owner-pc')).toBeNull();
    expect(harness.parseArguments(['--probe', 'search-brave'])).toEqual({ mode: 'probe', backendId: 'search-brave' });
    expect(harness.parseArguments(['--report'])).toEqual({ mode: 'report' });
    expect(() => harness.parseArguments(['--run'])).toThrowError(/arguments/u);
    expect(() => harness.parseArguments(['--run', 'search-brave', '--extra'])).toThrowError(/arguments/u);
  });

  it('holds a fixed bilingual public query set with a rubric for every query', () => {
    const queries = QUERY_SET.queries as Array<{ id: string; language: string; international: boolean; query: string; primary: string[]; reference: string[] }>;
    expect(queries).toHaveLength(30);
    expect(new Set(queries.map((query) => query.id)).size).toBe(30);
    expect(queries.filter((query) => query.language === 'zh')).toHaveLength(15);
    expect(queries.filter((query) => query.language === 'en')).toHaveLength(15);
    expect(queries.filter((query) => query.international).length).toBeGreaterThanOrEqual(10);
    for (const query of queries) {
      expect(query.query.length, query.id).toBeGreaterThan(0);
      expect(query.primary.length + query.reference.length + QUERY_SET.referenceDomains[query.language].length, query.id).toBeGreaterThan(0);
    }
    expect(QUERY_SET.rubric.topK).toBe(5);
  });

  it('judges the top five by domain and profiles a recorded run without any payload', () => {
    expect(harness.onDomain('https://www.npc.gov.cn/npc/x.html', ['gov.cn'])).toBe('gov.cn');
    expect(harness.onDomain('https://notgov.cn/x', ['gov.cn'])).toBeNull();
    expect(harness.onDomain('not a url', ['gov.cn'])).toBeNull();
    const zh = QUERY_SET.queries[0];
    const sixth = [1, 2, 3, 4, 5].map((n) => ({ title: `t${n}`, url: `https://example${n}.com/` })).concat([{ title: 'late', url: 'https://www.npc.gov.cn/' }]);
    expect(harness.judgeQuery(zh, QUERY_SET.referenceDomains, sixth)).toMatchObject({ hit: false, primaryHit: false, listed: 0, results: 5 });
    expect(harness.judgeQuery(zh, QUERY_SET.referenceDomains, [{ title: 'p', url: 'https://www.npc.gov.cn/' }, { title: 'r', url: 'https://baike.baidu.com/item/x' }]))
      .toMatchObject({ hit: true, primaryHit: true, listed: 2, results: 2 });
    expect(harness.percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(harness.percentile([], 0.95)).toBeNull();
    const calls = QUERY_SET.queries.map((query: { id: string; language: string }, index: number) => ({
      id: query.id,
      status: index === 0 ? null : 200,
      latencyMs: 100 + index,
      retried: index === 0,
      transportError: index === 0 ? 'UND_ERR_CONNECT_TIMEOUT' : null,
      shape: 'results',
      costUsd: null,
      hits: index === 0 ? null : [{ title: 't', url: query.language === 'zh' ? 'https://zh.wikipedia.org/wiki/x' : 'https://example.com/' }],
    }));
    const measured = harness.profileOf('search-tinyfish', { calls }, QUERY_SET);
    expect(measured).toMatchObject({
      verdict: 'measured', queries: 30, answered: 29, transportErrors: 1, transportRetries: 1,
      statusClasses: { '2xx': 29, none: 1 }, hits: { overall: 14, chinese: 14, international: 0 }, totals: { overall: 30, chinese: 15, international: 15 },
    });
    const unreachable = harness.profileOf('search-brave', { calls: calls.map((call: object) => ({ ...call, status: null, hits: null })) }, QUERY_SET);
    expect(unreachable.verdict).toBe('unreachable');
    const refused = harness.profileOf('search-brave', { calls: calls.map((call: object) => ({ ...call, status: 401, hits: null })) }, QUERY_SET);
    expect(refused.verdict).toBe('no-authenticated-response');
  });
});
