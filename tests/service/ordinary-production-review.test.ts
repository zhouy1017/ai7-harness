import { afterEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';

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
});

// Real store, review driver, harness, gate and broker; a local transport over admitted sample1 only.
it('admits one byte-identical contract retry under v26 and publishes risk points with 未联网核查', async () => {
  roots = await createServiceTestRoots('ai7-production-review-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const choice = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
  const pending = store.saveModelServiceConnection('合成生产连接', null, 'needs-attention', choice.route);
  store.saveModelServiceConnection('合成生产连接', pending.credentialReference, 'ready', choice.route);
  store.selectModelServiceRoute(choice.route);
  const binding = { ...choice, credentialReference: pending.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
  const requests: Array<{ category: string; ordinal: number; body: string; tools: string[] }> = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }>; tools?: Array<{ function: { name: string } }> };
    const message = body.messages.at(-1)!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    let content: string;
    if (header !== null) {
      const prior = requests.filter((entry) => entry.category === header.categoryId && entry.ordinal === header.ordinal);
      requests.push({ category: header.categoryId, ordinal: header.ordinal, body: String(init?.body), tools: body.tools?.map((tool) => tool.function.name) ?? [] });
      if (header.categoryId === 'typos-and-usage' && header.ordinal === 1 && prior.length === 0) content = '{invalid';
      else {
        const blocks = message.split('\n').flatMap((line) => {
          const match = /^\[([1-9][0-9]*)\] \[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
          return match === null ? [] : [{ ordinal: Number(match[1]), text: match[2]! }];
        });
        const block = blocks.find((entry) => entry.text.length >= 10 && entry.text.length <= 80);
        content = JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal,
          findings: header.categoryId === 'publication-risk' && header.ordinal === 1 && block !== undefined
            ? [{ quote: block.text, blockOrdinal: block.ordinal, severity: 'should', note: '合成风险点；请按本社制度人工复核。', clauseId: 'publication-risk/1' }] : [],
        });
      }
    } else if (message.startsWith('保证抽样 ')) content = JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
      dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) });
    else content = JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
    return new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => 'placeholder-production-key' },
    productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', selected),
  });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, '合成生产审阅');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  let work = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage', 'publication-risk'],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const run = work.projection!.run!;
  store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  await driver.drive(run.reviewRunId);
  const result = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!)));
  expect(result.run!.adaptations?.map((entry) => [entry.adaptationClass, entry.attemptIndex, entry.repetition]))
    .toEqual([['contract-retry', 2, 'byte-identical']]);
  const retried = requests.filter((entry) => entry.category === 'typos-and-usage' && entry.ordinal === 1);
  expect(retried).toHaveLength(2);
  expect(retried[0]!.body === retried[1]!.body).toBe(true);
  const riskRequests = requests.filter((entry) => entry.category === 'publication-risk');
  expect(riskRequests.length).toBeGreaterThan(0);
  // Existing retrieval remains available; no web tool or newly declared F-18a tool registers.
  expect(riskRequests.every((entry) => [...entry.tools].sort().join(',') === 'exact_fetch,retrieve')).toBe(true);
  const settled = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
  expect(settled.categories.every((category) => category.state === 'settled')).toBe(true);
  const risk = settled.findings.filter((finding) => finding.categoryId === 'publication-risk');
  expect(risk).toHaveLength(1);
  expect(risk.every((finding) => finding.riskPoint && finding.stateLine === '未联网核查' && finding.note.includes('未联网核查'))).toBe(true);
}, 60_000);
