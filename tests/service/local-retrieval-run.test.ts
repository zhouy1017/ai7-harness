import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { reviewCategoryKindId, type BaselineAnalysisProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { withLocalRetrievalFor } from '../support/policy-rules.js';

// #893: a non-web Run freezes and executes its local-only composition through the real owners. The model transport is an
// in-process stub under network denial, not a Provider call. All manuscript words come from exact sample1 at runtime.
installNodeNetworkDenial();

describe('registered local retrieval in a non-web authorized Run', () => {
  it('freezes the two-tool subset, exact-fetches pinned anchors, and accounts every model loop step without a search backend', async () => {
    const roots = await createServiceTestRoots('ai7-local-retrieval-run-');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const policy = withLocalRetrievalFor(await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live'), reviewCategoryKindId('typos-and-usage'));
    const live = { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 100_000 } };
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy, live });
    let query = '';
    let retrievalCalls = 0;
    let exactCalls = 0;
    const nativeFetch: typeof fetch = async (input, init) => {
      if (new URL(String(input)).hostname !== new URL(live.endpoint).hostname) throw new Error('local retrieval reached an external host');
      const body = JSON.parse(String(init?.body)) as { tools?: Array<{ function: { name: string } }>; messages: Array<{ role: string; content: string | null }> };
      const header = parseReviewCategoryUnitMessageHeader(body.messages.find((message) => message.role === 'user')!.content ?? '');
      const usage = { prompt_tokens: 10, completion_tokens: 5 };
      const result = (text: string | null, tool_calls?: unknown[]) => new Response(JSON.stringify({ model: live.model, choices: [{ message: {
        content: text, reasoning_content: '合成推理通道。', ...(tool_calls === undefined ? {} : { tool_calls }),
      }, finish_reason: tool_calls === undefined ? 'stop' : 'tool_calls' }], usage }), { status: 200 });
      if (header !== null) {
        expect(body.tools?.map((tool) => tool.function.name)).toEqual(['exact_fetch', 'retrieve']);
        const tools = body.messages.filter((message) => message.role === 'tool');
        const call = (name: string, args: unknown) => result(null, [{ id: `${header.ordinal}-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
        if (tools.length === 0) { retrievalCalls += 1; return call('retrieve', { query, k: 1 }); }
        if (tools.length === 1) {
          const candidates = JSON.parse(tools[0]!.content ?? '[]') as Array<{ candidateId: string }>;
          exactCalls += 1; return call('exact_fetch', { candidateId: candidates[0]!.candidateId });
        }
        return result(JSON.stringify({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal, findings: [] }));
      }
      return result(JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '核对引文。', basis: '合成回归账目。' }] }));
    };
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
      secretResolver: { resolve: async () => 'placeholder-development-key' },
      retrievalSources: (id, ledger) => store.retrievalSourcesForRun(id, ledger),
      developerLive: { launch: { runBudgetCeiling: live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: null }, nativeFetch } });
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '本机检索运行回归');
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      query = window.blocks.find((block) => block.kind === 'paragraph' && block.text.length > 20)!.text.slice(0, 20);
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      recordMissingCredentialConnection(store, '合成连接');
      let work = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      const run = work.projection!.run!;
      store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      await driver.drive(run.reviewRunId);
      expect(store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.categories[0]!.state).toBe('settled');
      const category = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!))) as unknown as BaselineAnalysisProjection;
      const report = category.taskOutcome!.report!;
      expect(retrievalCalls).toBeGreaterThan(1);
      expect(exactCalls).toBe(retrievalCalls);
      expect(report.webToolsBackend).toBeUndefined();
      expect(report.usagePerStage['platform-tools']).toMatchObject({ requests: 0, retrievalCalls, exactFetchCalls: exactCalls, refusedRetrievalCalls: 0 });
      expect(report.usagePerStage.units.requests).toBe(retrievalCalls * 3);
      expect(runReportUsageReconciles(report, category.resultSetRevision!.usage)).toBe(true);
      store.markCleanShutdown();
    } finally { const stopped = driver.dispose(); await owner.dispose(); await stopped; store.close(); await roots.dispose(); }
  });
});
