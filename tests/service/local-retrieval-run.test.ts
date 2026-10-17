import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
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
import { reviewCategoryKindId, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { withRuleFor } from '../support/policy-rules.js';

// #893: a non-web authorized Run freezes and executes its local-only composition through the real owners under the selected
// v22 rule. The model transport is an in-process stub under network denial, not a Provider call. Manuscript words come from
// exact sample1 at runtime; the two 资料库 items carry clearly synthetic public vocabulary only.
installNodeNetworkDenial();

const KIND = reviewCategoryKindId('typos-and-usage');
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
interface ChatBody { tools?: Array<{ function: { name: string } }>; messages: Array<{ role: string; content: string | null }> }
type Turn = (header: { ordinal: number; total: number }, toolResults: string[], call: (name: string, args: unknown) => Response, answer: (text: string) => Response) => Response;

async function session(name: string, policyOf: (policy: LaunchPolicyProjection) => LaunchPolicyProjection = (policy) => policy) {
  const roots: ServiceTestRoots = await createServiceTestRoots(`ai7-local-retrieval-${name}-`);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  expect(selected.providerProcessing.version).toBe('v22');
  const policy = policyOf(selected);
  const live = { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
    runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 100_000 } };
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy, live });
  let turn: Turn = () => { throw new Error('no turn bound'); };
  const nativeFetch: typeof fetch = async (input, init) => {
    if (new URL(String(input)).hostname !== new URL(live.endpoint).hostname) throw new Error('local retrieval reached an external host');
    const body = JSON.parse(String(init?.body)) as ChatBody;
    const header = parseReviewCategoryUnitMessageHeader(body.messages.find((message) => message.role === 'user')!.content ?? '');
    const usage = { prompt_tokens: 10, completion_tokens: 5 };
    const result = (text: string | null, tool_calls?: unknown[]) => new Response(JSON.stringify({ model: live.model, choices: [{ message: {
      content: text, reasoning_content: '合成推理通道。', ...(tool_calls === undefined ? {} : { tool_calls }),
    }, finish_reason: tool_calls === undefined ? 'stop' : 'tool_calls' }], usage }), { status: 200 });
    if (header === null) return result(JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '核对引文。', basis: '合成回归账目。' }] }));
    // Only the selected rule's two local tools are offered: no web tool, no search backend.
    expect(body.tools?.map((tool) => tool.function.name)).toEqual(['exact_fetch', 'retrieve']);
    const toolResults = body.messages.filter((message) => message.role === 'tool').map((message) => message.content ?? '');
    return turn(header, toolResults, (toolName, args) => result(null, [{ id: `${header.ordinal}-${toolResults.length}-${toolName}`, type: 'function',
      function: { name: toolName, arguments: JSON.stringify(args) } }]), (text) => result(text));
  };
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    retrievalIndex: (id, ledger) => store.retrievalIndexForRun(id, ledger),
    developerLive: { launch: { runBudgetCeiling: live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: null }, nativeFetch } });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, `本机检索运行回归 ${name}`);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  recordMissingCredentialConnection(store, '合成连接');
  return {
    roots, store, policy, book,
    bind(next: Turn) { turn = next; },
    async run(materialIds: string[] = []) {
      let work = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], WHOLE, policy, null, materialIds);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      const run = work.projection!.run!;
      store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      await driver.drive(run.reviewRunId);
      expect(store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.categories[0]!.state).toBe('settled');
    },
    category(): BaselineAnalysisProjection {
      return store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!))) as unknown as BaselineAnalysisProjection;
    },
    async dispose() { const stopped = driver.dispose(); await owner.dispose(); await stopped; store.close(); await roots.dispose(); },
  };
}

describe('registered local retrieval in a non-web authorized Run', () => {
  it('freezes the two-tool subset, exact-fetches pinned anchors, and accounts every model loop step without a search backend', async () => {
    const s = await session('accounting');
    try {
      const window = s.store.getManuscriptWindow(s.book.manuscriptId, s.book.branchId, null);
      const query = window.blocks.find((block) => block.kind === 'paragraph' && block.text.length > 20)!.text.slice(0, 20);
      let retrievalCalls = 0;
      let exactCalls = 0;
      s.bind((header, tools, call, answer) => {
        if (tools.length === 0) { retrievalCalls += 1; return call('retrieve', { query, k: 1 }); }
        if (tools.length === 1) {
          const candidates = JSON.parse(tools[0]!) as Array<{ candidateId: string }>;
          exactCalls += 1; return call('exact_fetch', { candidateId: candidates[0]!.candidateId });
        }
        return answer(JSON.stringify({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal, findings: [] }));
      });
      await s.run();
      const category = s.category();
      const report = category.taskOutcome!.report!;
      expect(retrievalCalls).toBeGreaterThan(1);
      expect(exactCalls).toBe(retrievalCalls);
      expect(report.webToolsBackend).toBeUndefined();
      expect(report.usagePerStage['platform-tools']).toMatchObject({ requests: 0, retrievalCalls, exactFetchCalls: exactCalls, refusedRetrievalCalls: 0 });
      expect(report.usagePerStage.units.requests).toBe(retrievalCalls * 3);
      expect(runReportUsageReconciles(report, category.resultSetRevision!.usage)).toBe(true);
      s.store.markCleanShutdown();
    } finally { await s.dispose(); }
  });

  it('indexes only what the Run pinned: the revision and its 允许参考 item, never another referable item of the same Book (#893 review)', async () => {
    const s = await session('scope', (policy) => {
      const rule = policy.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(KIND))!;
      return withRuleFor(policy, KIND, { materialReferencesAllowed: true,
        outboundDataCategories: [...new Set([...rule.outboundDataCategories, 'frozen-material-reference-excerpt' as const])] });
    });
    try {
      const material = async (title: string, text: string): Promise<string> => {
        const path = join(s.roots.inputRoot, `${randomUUID()}.txt`);
        writeFileSync(path, text);
        const preview = await s.store.previewLibraryMaterial(path);
        const added = await s.store.addLibraryMaterial({ previewId: preview.previewId, title, kind: 'document' });
        s.store.decideLibraryMaterial({ materialId: added.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: s.book.bookId } } });
        s.store.decideLibraryMaterial({ materialId: added.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
        return added.materialId;
      };
      const pinned = await material('合成词表甲', 'zqxpinned alpha beta\n\nzqxpinned gamma');
      const unpinned = await material('合成词表乙', 'zqxunpinned delta epsilon\n\nzqxunpinned zeta');
      s.store.startMaterialIndexing();
      await s.store.settleMaterialIndexing();
      // Both items are referable for this Book; only one is listed under 允许参考 by the plan.
      expect((await s.store.searchReferableMaterials({ bookId: s.book.bookId, query: 'zqxunpinned', k: 8 })).candidates.map((candidate) => candidate.sourceId)).toContain(unpinned);
      const pin = s.store.pinMaterialReference(s.book.bookId, pinned);
      const results: Array<Array<{ sourceKind: string; sourceId: string; revisionOrIndexDigest: string }>> = [];
      s.bind((header, tools, call, answer) => {
        if (tools.length > 0) results.push(JSON.parse(tools.at(-1)!) as typeof results[number]);
        if (tools.length === 0) return call('retrieve', { query: 'zqxunpinned', k: 8 });
        if (tools.length === 1) return call('retrieve', { query: 'zqxpinned', k: 8, sourceKinds: ['material'] });
        return answer(JSON.stringify({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal, findings: [] }));
      });
      await s.run([pinned]);
      expect(results.length).toBeGreaterThan(1);
      const unpinnedQueries = results.filter((_, index) => index % 2 === 0);
      const pinnedQueries = results.filter((_, index) => index % 2 === 1);
      // The unpinned item's own word finds nothing of it; any candidate comes from the pinned revision (approximate ranking).
      expect(unpinnedQueries.every((candidates) => candidates.every((candidate) => candidate.sourceKind === 'manuscript'))).toBe(true);
      expect(pinnedQueries.every((candidates) => candidates.length > 0 && candidates.every((candidate) =>
        candidate.sourceKind === 'material' && candidate.sourceId === pinned && candidate.revisionOrIndexDigest === pin.indexDigest))).toBe(true);
      expect(results.flat().some((candidate) => candidate.sourceId === unpinned)).toBe(false);
      s.store.markCleanShutdown();
    } finally { await s.dispose(); }
  });

  it('excludes a finding citing an anchor the Run never exact-fetched as 未经精确取文 and accepts fenced, exact-fetched ones (#893 review)', async () => {
    const s = await session('validator');
    try {
      const window = s.store.getManuscriptWindow(s.book.manuscriptId, s.book.branchId, null);
      const query = window.blocks.find((block) => block.kind === 'paragraph' && block.text.length > 20)!.text.slice(0, 20);
      let units = 0;
      s.bind((header, tools, call, answer) => {
        units = header.total;
        if (tools.length === 0) return call('retrieve', { query, k: 1 });
        const [candidate] = JSON.parse(tools[0]!) as Array<{ candidateId: string }>;
        // Unit 1 cites the candidate without Exact Fetch; every other unit fetches it first and answers in a fenced body.
        if (tools.length === 1 && header.ordinal !== 1) return call('exact_fetch', { candidateId: candidate!.candidateId });
        const quote = tools.length === 2 ? (JSON.parse(tools[1]!) as { text: string }).text.slice(0, 10) : '合成引文';
        const finding = { quote, blockOrdinal: 1, severity: 'note', note: '合成说明。', replacement: `${quote}。`, retrievalAnchor: { candidateId: candidate!.candidateId } };
        const text = JSON.stringify({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal, findings: [finding] });
        return answer(header.ordinal === 1 ? text : `\`\`\`json\n${text}\n\`\`\``);
      });
      await s.run();
      const revision = s.category().resultSetRevision as unknown as { findingCounts: { listed: number }; excluded: Array<{ unitOrdinal: number; reason: string; reasonLabel: string }> };
      expect(units).toBeGreaterThan(1);
      // Every unit parsed, the fenced ones included; only the unit without Exact Fetch is excluded for it.
      expect(revision.findingCounts.listed).toBe(units);
      expect(revision.excluded.filter((item) => item.reason === 'not-exact-fetched').map((item) => [item.unitOrdinal, item.reasonLabel])).toEqual([[1, '未经精确取文']]);
      s.store.markCleanShutdown();
    } finally { await s.dispose(); }
  });
});
