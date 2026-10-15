import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING, ORDINARY_PRODUCTION_ALLOWED_BINDINGS } from '../../src/service/launch-policy.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

describe('a review Run freezes its search backend', () => {
  it('refuses a production Run without its selected backend key, naming the backend and 设置', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成 Go 连接', configured.credentialReference, 'ready', 'opencode-go');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      expect(policy.providerProcessing.version).toBe('v17');
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '生产检索密钥回归');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId); recordMissingCredentialConnection(store, '合成连接');
      expect(() => {
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      }).toThrow(/TinyFish.*设置/u);
    } finally { store.close(); await roots.dispose(); }
  });

  it('keeps A in the authorized facts and drawer after selection changes to B', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      expect(policy.providerProcessing.version).toBe('v16');
      const launch = { operationalScope: 'developer-live' as const, policy, live: {
        ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
        runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 },
      } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '联网检索冻结回归');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId); recordMissingCredentialConnection(store, '合成连接');
      let preparation = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!preparation.done) preparation = store.advanceReviewRunPreparationWork(preparation.workId!);
      const run = preparation.projection!.run!;
      const category = run.categories[0]!;
      const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId });
      expect(plan.service.provider).toContain('联网检索 · TinyFish');
      store.authorizeReviewRun(book.bookId, run.reviewRunId, [{ categoryId: 'factual-review', planEnvelopeDigest: category.planEnvelopeDigest! }]);
      const preparedChild = store.factualReviewLedger.inspect(book.bookId);
      store.authorizeFactualReview(book.bookId, preparedChild.taskIntent!.taskIntentId, preparedChild.planEnvelope!.digest);
      const child = store.factualReviewLedger.inspect(book.bookId);
      const before = store.factualReviewLedger.loadExecutionPlan(child.run!.runRecordId);
      expect(before.webToolsBackend?.backendId).toBe('search-tinyfish');
      store.selectSearchBackend('search-brave');
      const after = store.factualReviewLedger.loadExecutionPlan(child.run!.runRecordId);
      expect(after.webToolsBackend).toEqual(before.webToolsBackend);
      expect(after.planEnvelopeDigest).toBe(before.planEnvelopeDigest);
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId }).service.provider).toContain('联网检索 · TinyFish');
      const frozen = store.factualReviewLedger.frozenPlan(child.taskIntent!.taskIntentId, child.planEnvelope!.digest);
      expect(frozen.components['web-tools-backend']).toEqual(before.webToolsBackend);
      expect((frozen.components['plan-envelope'] as Record<string, unknown>)['webToolsBackendDigest']).toMatch(/^[0-9a-f]{64}$/u);
    } finally { store.close(); await roots.dispose(); }
  });
});
