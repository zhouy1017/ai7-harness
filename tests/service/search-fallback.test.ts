import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { DEVELOPER_LIVE_POLICY_BINDING, ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync, searchFallbackTermsOf } from '../../src/service/launch-policy.js';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { ResearchEvidenceLedger } from '../../src/service/research-evidence.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { searchBackendConfigurationDigest } from '../../src/service/provider/search-backends/index.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { armPerTicketHostAdmission } from '../../src/shared/network-denial.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';

// Issue #1226 (W22b-A3; F-02 #1021; ADR 0094 §2): the 联网取证 stage's bounded resend and frozen 备用来源, through the real store, Review
// Run, frozen plan, execution owner, claim session, Egress Gate, Credential Broker and per-ticket host admission, on a socket-free
// transport over the fixture TinyFish (default) and Brave (备用来源) adapters. Every page and query is synthetic public text written
// here; the quotation is cut at run time from the unit message, so no manuscript text appears in this file.
armPerTicketHostAdmission();

let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
const BRAVE = SEARCH_BACKENDS.find((entry) => entry.id === 'search-brave')!;
const QUERY = 'public museum collection fact query for the fallback regression';
const MUSEUM = 'https://museum.example.org/zun';
const HELD = '它现藏湖北省博物馆';
const SECRET = 'synthetic-search-key-never-stored';
/** How one search send ends: answered with results, an HTTP status, a reset before any response byte, or a body that breaks after 200. */
type Reply = 'ok' | 'reset' | 'broken-body' | 401 | 429 | 503;

let roots: ServiceTestRoots;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let policy: LaunchPolicyProjection;
let replies: { primary: Reply[]; fallback: Reply[] };
let sent: Array<{ backend: 'primary' | 'fallback'; query: string | null; at: number }>;

function quoteFrom(unit: string): { quote: string; blockOrdinal: number } | null {
  const lines = unit.split('\n');
  const own = lines.findIndex((line) => line.startsWith('以下为本单元需要核查的内容块'));
  let ordinal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\[blk_[0-9a-f]{24}\] \([a-z]+(?: h\d)?\) (.*)$/u.exec(lines[index]!);
    if (match === null) continue;
    ordinal += 1;
    if (index < own) continue;
    const text = [...match[1]!];
    for (let start = 0; start + 8 <= text.length; start += 4) {
      const quote = text.slice(start, start + 8).join('');
      if (quote.trim().length === 8 && match[1]!.indexOf(quote) === match[1]!.lastIndexOf(quote)) return { quote, blockOrdinal: ordinal };
    }
  }
  return null;
}

function searchReply(backend: 'primary' | 'fallback', reply: Reply | undefined): Response {
  if (reply === 'reset') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  if (typeof reply === 'number') return new Response('unavailable', { status: reply, headers: reply === 429 ? { 'retry-after': '1' } : {} });
  if (reply === 'broken-body') return new Response(new ReadableStream({ start: (controller) => controller.error(new Error('stream broke')) }), { status: 200 });
  const hit = { title: '馆藏 - 博物馆', url: MUSEUM };
  return new Response(JSON.stringify(backend === 'primary' ? { results: [{ ...hit, snippet: '馆藏页。' }] } : { web: { results: [{ ...hit, description: '馆藏页。' }] } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
}

/** The real owners under ordinary-production v32 with TinyFish as the default and, unless `fallback` is null, Brave as the 备用来源. */
async function setup(primary: Reply[], fallback: Reply[] = ['ok'], options: { chooseFallback?: boolean } = {}): Promise<void> {
  replies = { primary: [...primary], fallback: [...fallback] }; sent = [];
  roots = await createServiceTestRoots('ai7-search-fallback-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const connection = store.saveModelServiceConnection('合成普通连接', null, 'ready', 'opencode-go');
  store.selectModelServiceRoute('opencode-go');
  const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!, credentialReference: connection.credentialReference };
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
  for (const backend of [TINYFISH, BRAVE]) store.saveSearchBackendCredential(backend.id, store.getSearchBackendConnections().find((row) => row.backendId === backend.id)!.credentialReference, 'ready');
  store.selectSearchBackend(TINYFISH.id);
  if (options.chooseFallback !== false) store.selectSearchBackend(BRAVE.id, 'fallback');
  const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...binding, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
  store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
  const answer = (message: Record<string, unknown>): Response => new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { reasoning_content: '合成推理通道。', ...message }, finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    for (const [backend, declared] of [['primary', TINYFISH], ['fallback', BRAVE]] as const) {
      if (url.hostname !== declared.host) continue;
      sent.push({ backend, query: url.searchParams.get('query') ?? url.searchParams.get('q'), at: Date.now() });
      return searchReply(backend, replies[backend].shift());
    }
    if (url.href === MUSEUM) return new Response(`<html><head><meta charset="utf-8"></head><body><p>这件尊盘出土于1978年。${HELD}，是馆藏重器。</p></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string | null }> };
    const unit = body.messages.findLast((message) => message.role === 'user')!.content ?? '';
    const header = parseFactualReviewUnitMessageHeader(unit);
    const tools = body.messages.filter((message) => message.role === 'tool').length;
    if (header !== null) {
      const cited = header.ordinal === 1 ? quoteFrom(unit) : null;
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-claim-extraction/1', unitOrdinal: header.ordinal, assertions: cited === null ? [] : [{
        quote: cited.quote, blockOrdinal: cited.blockOrdinal, assertionClass: 'real-world-fact', category: '机构', severity: 'A', question: '该器物现藏何处？', basis: '馆藏页。' }] }) });
    }
    if (unit.startsWith('{')) {
      if (tools === 0) return answer({ content: null, tool_calls: [{ id: 'search_1', type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: QUERY }) } }] });
      if (tools === 1) return answer({ content: null, tool_calls: [{ id: 'fetch_1', type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: MUSEUM }) } }] });
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-claim-verification-result/1', claimId: (JSON.parse(unit) as { claimId: string }).claimId,
        evidenceRelations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }], corrections: [] }) });
    }
    const last = body.messages.at(-1)!.content ?? '';
    return answer({ content: JSON.stringify(last.startsWith('保证抽样 ')
      ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] }) });
  };
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.factualReviewLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => SECRET }, production: { scope: 'ordinary-production', nativeFetch }, currentLaunchPolicy: () => policy,
    productionPolicyFor: (frozen) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', frozen),
    researchEvidence: (input) => { store.recordResearchEvidence(input); } });
}

afterEach(async () => { await owner?.dispose(); store?.close(); await roots?.dispose(); });

/** Prepare, authorize and drive one whole-Book 事实核查; returns the Review Run, its factual Run and its frozen execution facts. */
async function review(name: string, prepared?: () => void) {
  const book = await importSample1Book(store, roots.codeRoot, name);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const reviewRunId = work.projection!.run!.reviewRunId;
  prepared?.();
  const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
  store.authorizeReviewRun(book.bookId, reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try { await driver.drive(reviewRunId); } finally { await driver.dispose(); }
  const child = store.factualReviewLedger.inspect(book.bookId);
  const runRecordId = child.run!.runRecordId;
  return { book, reviewRunId, runRecordId, facts: store.factualReviewLedger.loadExecutionPlan(runRecordId), report: child.taskOutcome?.report ?? null,
    decision: store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId }).service.decision };
}

function claimAllowance(runRecordId: string) {
  const ledger = store.factualReviewLedger.factualVerification;
  const claimId = ledger.claims(runRecordId)!.claims[0]!.claimId;
  return ledger.claimAllowance(ledger.claimSession(runRecordId, 'web-verification', claimId)!.sessionId);
}

describe('the 联网检索 备用来源 in the 联网取证 stage (#1226)', () => {
  it('freezes the chosen 备用来源 beside the default, which a later settings change does not move', async () => {
    await setup(['ok']);
    const reference = store.getSearchBackendConnections().find((row) => row.backendId === BRAVE.id)!.credentialReference!;
    const { facts, book } = await review('备用来源冻结', () => store.selectSearchBackend(null, 'fallback'));
    expect(store.getSearchBackendSettings().fallbackBackendId).toBeNull();
    expect(facts.webToolsBackend).toMatchObject({ backendId: TINYFISH.id, host: TINYFISH.host });
    expect(facts.webToolsFallback).toEqual({ backendId: BRAVE.id, host: BRAVE.host, configurationDigest: searchBackendConfigurationDigest(BRAVE.id),
      credentialReference: reference, selectedAt: expect.any(String) });
    expect(store.factualReviewLedger.inspect(book.bookId).providerResolutionPlan?.webToolsFallback?.backendId).toBe(BRAVE.id);
    // The default answered: nothing went to the fallback.
    expect(sent.map((entry) => entry.backend)).toEqual(['primary']);
  }, 60_000);

  it.each([[503], [429], ['reset']] as const)('resends once to the default after %s and needs no fallback when the resend answers', async (failure) => {
    await setup([failure, 'ok']);
    const { report, runRecordId, decision } = await review(`默认来源重发 ${failure}`);
    expect(sent.map((entry) => entry.backend)).toEqual(['primary', 'primary']);
    expect(sent.every((entry) => entry.query === QUERY)).toBe(true);
    // A 429's Retry-After (one second here) is honoured before the resend.
    if (failure === 429) expect(sent[1]!.at - sent[0]!.at).toBeGreaterThanOrEqual(950);
    expect(report!.usagePerStage['platform-tools']?.searchCalls ?? {}).not.toHaveProperty(BRAVE.id);
    expect(decision).not.toContain('已切换备用来源');
    // The resend repeats the same canonical query: one distinct submission, and one more tool round, of the claim's allowance.
    expect(claimAllowance(runRecordId).search).toBe(2);
  }, 60_000);

  it('sends the same query once to the 备用来源 only after the resend failed too, and attributes its retained source to it', async () => {
    await setup([503, 503], ['ok']);
    const { report, runRecordId, book, decision } = await review('切换备用来源');
    expect(sent.map((entry) => [entry.backend, entry.query])).toEqual([['primary', QUERY], ['primary', QUERY], ['fallback', QUERY]]);
    // A Plan that froze a 备用来源 reports its claim sends per backend (requests stay with the claim stage, as before).
    expect(report!.usagePerStage['platform-tools']).toMatchObject({ requests: 0, searchCalls: { [TINYFISH.id]: 2, [BRAVE.id]: 1 } });
    expect(report!.webToolsBackend?.backendId).toBe(TINYFISH.id);
    expect(decision).toContain('已切换备用来源 Brave 1 次');
    const evidence = store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null });
    const line = evidence.records.find((record) => record.url === MUSEUM)!;
    expect(line.backendId).toBe(BRAVE.id);
    expect(evidence.units[0]!.backendId).toBe(BRAVE.id);
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(new ResearchEvidenceLedger(db).source(book.bookId, line.evidenceId)).toMatchObject({ backendId: BRAVE.id,
        fallback: { fallbackFrom: TINYFISH.id, failureClass: 'http-5xx' } });
    } finally { db.close(); }
    // The three sends spent one distinct query of the claim and three tool rounds (the model's call, the resend, the fallback).
    expect(claimAllowance(runRecordId).search).toBe(2);
  }, 60_000);

  it.each([[401], ['broken-body']] as const)('never resends an answered submission (%s), to the default or to the 备用来源', async (failure) => {
    await setup([failure, 'ok'], ['ok']);
    const { report } = await review(`已应答不重发 ${failure}`);
    expect(sent.map((entry) => entry.backend)).toEqual(['primary']);
    expect(report!.usagePerStage['platform-tools']?.searchCalls ?? {}).not.toHaveProperty(BRAVE.id);
  }, 60_000);

  it('counts the resend and the fallback each as one more tool round of the claim', async () => {
    await setup([503, 503], ['ok']);
    const first = await review('工具额度计数');
    const tools = claimAllowance(first.runRecordId).tool;
    await owner.dispose(); store.close(); await roots.dispose();
    await setup(['ok']);
    const baseline = await review('工具额度基线');
    // Same model turns; the failing Run spent two more tool rounds: its resend and its fallback.
    expect(claimAllowance(baseline.runRecordId).tool - tools).toBe(2);
  }, 90_000);

  it('keeps a Plan without a 备用来源 byte-free of it, and its one failed send unretried', async () => {
    await setup([503, 'ok'], ['ok'], { chooseFallback: false });
    const plain = await review('无备用来源');
    expect(plain.facts.webToolsFallback).toBeUndefined();
    expect(store.factualReviewLedger.inspect(plain.book.bookId).providerResolutionPlan).not.toHaveProperty('webToolsFallback');
    expect(sent.map((entry) => entry.backend)).toEqual(['primary']);
    // The terms come only from the verified v32 document: a v31-era identity reads none, so its Plans freeze no fallback and resend nothing.
    const v31 = { ...policy.selectedPolicyIdentity!, providerProcessingVersion: 'v31' as const, providerProcessingSha256: '1cf19c82e46adf7a731e4f0c625cc1dd1f8e07e5b744eb06a872cbaa01849bd5' };
    expect(searchFallbackTermsOf({ ...policy, selectedPolicyIdentity: v31 })).toBeNull();
    expect(searchFallbackTermsOf(policy)?.resendableFailureClasses).toEqual(['transport-failure-before-any-response-byte', 'http-5xx', 'http-429']);
  }, 60_000);

  it('refuses the default, a keyless backend and the direct-search candidate as 备用来源, and stores no key value', async () => {
    await setup([503, 503], ['ok']);
    const code = (operation: () => void): string => { try { operation(); return 'no-error'; } catch (error) { return error instanceof StoreError ? error.code : 'other'; } };
    expect(code(() => store.selectSearchBackend(TINYFISH.id, 'fallback'))).toBe('SEARCH_FALLBACK_IS_DEFAULT');
    expect(code(() => store.selectSearchBackend('search-parallel', 'fallback'))).toBe('SEARCH_CREDENTIAL_MISSING');
    const frame = (input: unknown) => () => decodeRequest(new TextEncoder().encode(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', op: 'selectSearchBackend', input })));
    for (const input of [{ backendId: 'deepseek-direct-search-v1', role: 'fallback' }, { backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1', role: 'fallback' },
      { backendId: 'search-brave', role: 'primary' }, { backendId: null }]) expect(frame(input)).toThrow(ProtocolError);
    expect(decodeRequest(new TextEncoder().encode(JSON.stringify({ id: '00000000-0000-4000-8000-000000000002', op: 'selectSearchBackend', input: { backendId: null, role: 'fallback' } }))).op).toBe('selectSearchBackend');
    // A Run that fell back released two keys to their own sends only; no value reaches any stored record.
    await review('不存密钥');
    const store_ = join(roots.dataRoot, 'store');
    for (const file of readdirSync(store_)) expect(readFileSync(join(store_, file)).includes(SECRET)).toBe(false);
    // Making the 备用来源 the default leaves no fallback: a backend is never its own fallback.
    store.selectSearchBackend(BRAVE.id);
    expect(store.getSearchBackendSettings()).toMatchObject({ selectedBackendId: BRAVE.id, fallbackBackendId: null });
  }, 60_000);
});
