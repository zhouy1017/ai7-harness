import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { allowanceAdmitsConnection, armPerTicketHostAdmission, ticketHostHolds } from '../../src/shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { BaselineAnalysisProjection, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// #473 (6b): one web-bearing review category through the real store, frozen plan, execution owner, harness tool loop, Egress
// Gate, Credential Broker and per-ticket host admission, on a socket-free transport: the model asks for one public search per
// unit, the frozen TinyFish backend answers once, and every later unit reuses that result. Nothing reaches a real host; the
// credential is a placeholder; no manuscript text is printed or compared.
armPerTicketHostAdmission();

const QUERY = 'public background fact for a provider-free regression';
const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
const shippedHosts = SEARCH_BACKENDS.filter((entry) => entry.shipped).map((entry) => entry.host!);

let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let modelCalls: number;
let toolCallsAsked: number;
let searchSends: Array<{ query: string | null; open: string[] }>;

/** The real owners under developer-live v16 with a Run Budget Ceiling of maxTotalTokens. */
async function setup(maxTotalTokens: number): Promise<void> {
  roots = await createServiceTestRoots('ai7-platform-tool-run-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens } },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  modelCalls = 0; toolCallsAsked = 0; searchSends = [];
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === TINYFISH.host) {
      searchSends.push({ query: url.searchParams.get('query'), open: shippedHosts.filter((host) => allowanceAdmitsConnection([{ host, port: 443 }])) });
      return new Response(JSON.stringify({ results: [{ title: 'Public source', url: 'https://example.org/source', snippet: 'A public fact.' }] }), { status: 200 });
    }
    modelCalls += 1;
    const body = JSON.parse(String(init?.body)) as { tools?: unknown[]; messages: Array<{ role: string; content: string | null }> };
    const unit = body.messages.find((message) => message.role === 'user')!.content ?? '';
    const header = parseReviewCategoryUnitMessageHeader(unit);
    const usage = { prompt_tokens: 40, completion_tokens: 20 };
    // A unit's first turn asks for the one search; the turn after the tool result answers.
    if (header !== null && body.tools !== undefined && !body.messages.some((message) => message.role === 'tool')) {
      toolCallsAsked += 1;
      return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model, choices: [{ message: { content: null, reasoning_content: '合成推理通道。',
        tool_calls: [{ id: `call_${header.ordinal}`, type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: QUERY }) } }] }, finish_reason: 'tool_calls' }], usage }), { status: 200 });
    }
    const last = body.messages.at(-1)!.content ?? '';
    const result = header !== null ? { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] }
      : last.startsWith('保证抽样 ') ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
        : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查联网结果。', basis: '合成回归账目。' }] };
    return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model, choices: [{ message: { content: JSON.stringify(result), reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }], usage }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'reference-free-review', case: 'sample1-whole-book', delta: null } }, nativeFetch },
  });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
}

/** One prepared and authorized 学术道德与引用 Run on exact sample1, driven to its end. */
async function driveAcademicIntegrity(name: string): Promise<{ bookId: string; reviewRunId: string }> {
  const book = await importSample1Book(store, roots.codeRoot, name);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  recordMissingCredentialConnection(store, '合成连接');
  let progress = store.createReviewRunPreparationWork(book.bookId, ['academic-integrity'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  const run = progress.projection!.run!;
  expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId }).service.decision)
    .toContain('学术道德与引用 · 未联网核查 · TinyFish');
  expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId }).service.provider).toContain('联网检索 · TinyFish');
  store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  await driver.drive(run.reviewRunId);
  return { bookId: book.bookId, reviewRunId: run.reviewRunId };
}

afterEach(async () => {
  const stopped = driver?.dispose();
  await owner?.dispose();
  await stopped;
  store?.close();
  await roots?.dispose();
});

describe('a web-bearing review Run on the frozen backend', () => {
  it('searches once through the frozen host, reuses the result in later units and accounts it in the Run Report', async () => {
    await setup(500_000);
    const book = await driveAcademicIntegrity('联网检索运行回归');
    expect(store.inspectReviewWorkspace(book.bookId, book.reviewRunId).run!.categories.map((category) => category.state)).toEqual(['settled']);

    // Every unit asked; only the first search left, to the frozen host alone, opened for its ticket and closed after it.
    expect(toolCallsAsked).toBeGreaterThan(1);
    expect(searchSends).toEqual([{ query: QUERY, open: [TINYFISH.host] }]);
    expect(ticketHostHolds()).toBe(0);
    expect(shippedHosts.filter((host) => allowanceAdmitsConnection([{ host, port: 443 }]))).toEqual([]);

    const category = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('academic-integrity')!))) as unknown as BaselineAnalysisProjection;
    const report = category.taskOutcome!.report!;
    expect(report.webToolsBackend).toMatchObject({ backendId: 'search-tinyfish', host: TINYFISH.host });
    expect(report.usagePerStage['platform-tools']).toMatchObject({ requests: 1, searchCalls: { 'search-tinyfish': 1 }, refusedSearchCalls: 0, fetchCount: 0, fetchBytes: 0 });
    expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: book.reviewRunId }).service.decision)
      .toContain('学术道德与引用 · 联网核查已完成 · TinyFish');
    // The units' stage carries every model turn of each tool loop; the revision's usage reconciles with the stages plus the tools.
    expect(report.usagePerStage.units.requests).toBe(toolCallsAsked * 2);
    expect(runReportUsageReconciles(report, category.resultSetRevision!.usage)).toBe(true);

    // The live-once ledger keeps one search item with digests only: never the query.
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    const searchLines = cache.lines.filter((line) => (line as { kind?: string }).kind === 'search-call');
    expect(searchLines).toHaveLength(1);
    expect(searchLines[0]).toMatchObject({ host: TINYFISH.host, outcome: 'transmitted', status: 200 });
    expect(JSON.stringify(cache.lines).includes(QUERY)).toBe(false);
  });

  it('counts the tool loop’s own tokens toward the ceiling before its search or its next model call leaves', async () => {
    // The unit's first turn (60 tokens) already exceeds a 50-token ceiling: the search and the loop's second model call are refused.
    await setup(50);
    await driveAcademicIntegrity('联网检索上限回归');
    expect(toolCallsAsked).toBe(1);
    expect(modelCalls).toBe(1);
    expect(searchSends).toEqual([]);
    expect(ticketHostHolds()).toBe(0);
  });
});
