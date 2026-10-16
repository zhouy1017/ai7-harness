import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armPerTicketHostAdmission } from '../../src/shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { FACTUAL_REVIEW_TASK_GOAL } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Issue #425 (S70): the retention hooks the brief admitted into the execution owner and the platform-tool session are inert
// wherever no research unit of 事实核查 runs — the deterministic 事实核查 route has no platform tools, and a web-bearing review
// category is not 事实核查. Both Runs below carry the retention sink, and neither reaches it. No network, no manuscript text.
armPerTicketHostAdmission();

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;

afterEach(async () => {
  const stopped = driver?.dispose();
  await owner?.dispose();
  await stopped;
  store?.close();
  await roots?.dispose();
  driver = undefined; owner = undefined; store = undefined; roots = undefined;
});

describe('the retention hooks are inert without a research unit', () => {
  it('records nothing for a deterministic 事实核查 Run, which has no platform tools', async () => {
    roots = await createServiceTestRoots('ai7-research-inert-ci-');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
    });
    const sunk: unknown[] = [];
    owner = new BaselineAnalysisExecutionOwner({ ledger: store.factualReviewLedger, launchPolicy: policy, fixture,
      secretResolver: { resolve: async () => null }, researchEvidence: (input) => { sunk.push(input); } });
    const book = await importSample1Book(store, roots.codeRoot, '惰性回归');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '惰性连接');
    let work = store.createFactualReviewPreparationWork(book.bookId, FACTUAL_REVIEW_TASK_GOAL, policy);
    while (!work.done) work = store.advanceFactualReviewPreparationWork(work.workId!);
    const prepared = work.projection!;
    expect(prepared.providerResolutionPlan?.webToolsBackend).toBeUndefined();
    const authorized = store.authorizeFactualReview(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!);
    await owner.whenIdle();
    const review = store.inspectFactualReview(book.bookId);
    expect(review.state).toBe('settled');
    expect(review.resultSetRevision!.findings.length).toBeGreaterThan(0);
    expect(sunk).toEqual([]);
    expect(store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null })).toMatchObject({ records: [], units: [], findings: [] });
  });

  it('records nothing for a web-bearing review category that is not 事实核查, though its units search', async () => {
    roots = await createServiceTestRoots('ai7-research-inert-live-');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const runBudgetCeiling = { kind: 'tokens' as const, maxTotalTokens: 500_000 };
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy,
      live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling } });
    let searches = 0;
    const usage = { prompt_tokens: 40, completion_tokens: 20 };
    const nativeFetch: typeof fetch = async (input, init) => {
      if (new URL(String(input)).hostname === TINYFISH.host) {
        searches += 1;
        return new Response(JSON.stringify({ results: [{ title: '公开来源 - 维基百科', url: 'https://example.org/source', snippet: '一则公开事实。' }] }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as { tools?: unknown[]; messages: Array<{ role: string; content: string | null }> };
      const header = parseReviewCategoryUnitMessageHeader(body.messages.find((message) => message.role === 'user')!.content ?? '');
      if (header !== null && body.tools !== undefined && !body.messages.some((message) => message.role === 'tool')) {
        return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model, choices: [{ message: { content: null, reasoning_content: '合成。',
          tool_calls: [{ id: `call_${header.ordinal}`, type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: 'public fact' }) } }] }, finish_reason: 'tool_calls' }], usage }), { status: 200 });
      }
      const last = body.messages.at(-1)!.content ?? '';
      const result = header !== null ? { schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal, findings: [] }
        : last.startsWith('保证抽样 ') ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成。' })) }
          : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '合成。', basis: '合成。' }] };
      return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model, choices: [{ message: { content: JSON.stringify(result), reasoning_content: '合成。' }, finish_reason: 'stop' }], usage }), { status: 200 });
    };
    const sunk: unknown[] = [];
    owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
      secretResolver: { resolve: async () => 'placeholder-development-key' },
      developerLive: { launch: { runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'reference-free-review', case: 'sample1-whole-book', delta: null } }, nativeFetch },
      researchEvidence: (input) => { sunk.push(input); } });
    driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
    const book = await importSample1Book(store, roots.codeRoot, '惰性联网回归');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '惰性连接');
    let progress = store.createReviewRunPreparationWork(book.bookId, ['academic-integrity'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
    const run = progress.projection!.run!;
    store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    await driver.drive(run.reviewRunId);
    expect(store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.categories.map((category) => category.state)).toEqual(['settled']);
    expect(searches).toBe(1);
    expect(sunk).toEqual([]);
    expect(store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null })).toMatchObject({ records: [], units: [], findings: [] });
  });
});
