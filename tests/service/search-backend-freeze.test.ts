import { randomUUID } from 'node:crypto';
import { technicalReviewBasis } from '../../src/shared/review-basis.js';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING, ORDINARY_PRODUCTION_ALLOWED_BINDINGS } from '../../src/service/launch-policy.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

describe('a review Run freezes its search backend', () => {
  it('prepares a fresh factual Task on the same book after changing search backend, preserving the old plan', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      const launch = { operationalScope: 'developer-live' as const, policy, live: {
        ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
        runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 },
      } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '重新准备检索选择');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId); recordMissingCredentialConnection(store, '合成连接');
      const prepare = () => {
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
        return work.projection!.run!;
      };
      store.selectSearchBackend('search-brave');
      const first = prepare();
      const original = store.factualReviewLedger.inspect(book.bookId);
      const frozen = store.factualReviewLedger.frozenPlan(original.taskIntent!.taskIntentId, original.planEnvelope!.digest);
      expect(prepare().categories[0]!.taskIntentId).toBe(first.categories[0]!.taskIntentId);
      store.selectSearchBackend('search-bochaai');
      const second = prepare();
      expect(second.categories[0]!.taskIntentId).not.toBe(first.categories[0]!.taskIntentId);
      expect(store.factualReviewLedger.inspect(book.bookId).providerResolutionPlan!.webToolsBackend?.backendId).toBe('search-bochaai');
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: second.reviewRunId }).start.readiness).toBe('ready');
      expect(store.factualReviewLedger.frozenPlan(original.taskIntent!.taskIntentId, original.planEnvelope!.digest)).toEqual(frozen);
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: first.reviewRunId }).service.provider).toContain('Brave');
    } finally { store.close(); await roots.dispose(); }
  });

  it.each(['opencode-go'] as const)('explains missing search setup for %s', async (route) => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === route)!, credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成 Go 连接', configured.credentialReference, 'ready', route);
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      expect(policy.providerProcessing.version).toBe('v34');
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '生产检索密钥回归');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId); recordMissingCredentialConnection(store, '合成连接');
      const category = store.inspectReviewWorkspace(book.bookId, null).categories.find((entry) => entry.categoryId === 'factual-review')!;
      expect(category.available).toBe(false);
      expect(() => {
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      }).toThrow(/当前模型渠道不自带联网搜索.*联网检索.*保存一个后端密钥/u);
    } finally { store.close(); await roots.dispose(); }
  });

  it.each(['deepseek-open-platform', 'openai-platform', 'anthropic-claude'] as const)('freezes %s native search and its model UUID, round-tripping the configured override', async (route) => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === route)!, credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成官方连接', configured.credentialReference, 'ready', route);
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '随模型渠道搜索');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      const workspace = store.inspectReviewWorkspace(book.bookId, null);
      const category = workspace.categories.find((entry) => entry.categoryId === 'factual-review')!;
      expect(workspace.categories.find((entry) => entry.categoryId === 'academic-integrity')!.available).toBe(true);
      expect(category.available).toBe(true);
      expect(category.basis.modelChannelSearchLabel).toBe(store.getModelServiceRouteConnection(route)!.binding.providerLabel + (route === 'deepseek-open-platform' ? '' : '（未实测）'));
      expect(technicalReviewBasis(category.basis).includes('（未实测）')).toBe(route !== 'deepseek-open-platform');
      const backendId = `search-${route.split('-')[0]}`;
      const connections = store.getSearchBackendConnections();
      const prepare = () => {
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
        return store.factualReviewLedger.inspect(book.bookId).providerResolutionPlan!;
      };
      expect(prepare()).toMatchObject({ webToolsBackend: { backendId }, searchCredentialReference: configured.credentialReference });
      store.saveSearchBackendCredential('search-deepseek', connections.find((row) => row.backendId === 'search-deepseek')!.credentialReference, 'ready');
      const selectedReference = connections.find((row) => row.backendId === 'search-tinyfish')!.credentialReference;
      const fallbackReference = connections.find((row) => row.backendId === 'search-brave')!.credentialReference;
      store.saveSearchBackendCredential('search-tinyfish', selectedReference, 'ready');
      store.saveSearchBackendCredential('search-brave', fallbackReference, 'ready');
      store.selectSearchBackend('search-tinyfish');
      store.selectSearchBackend('search-brave', 'fallback');
      const frozen = prepare();
      expect(frozen.webToolsBackend).toMatchObject({ backendId, selectionSource: 'model-channel' });
      expect(frozen.searchCredentialReference).toBe(configured.credentialReference);
      expect(frozen.webToolsFallback).toBeUndefined();
      store.selectSearchBackend('search-tinyfish', undefined, true);
      const overridden = prepare();
      expect(overridden.webToolsBackend).toMatchObject({ backendId: 'search-tinyfish', selectionSource: 'configured-backend' });
      expect(overridden.searchCredentialReference).toBe(store.getSearchBackendConnections().find((row) => row.backendId === 'search-tinyfish')!.credentialReference);
      expect(overridden.webToolsFallback?.backendId).toBe('search-brave');
      store.selectSearchBackend('search-tinyfish', undefined, false);
      expect(prepare().webToolsBackend?.backendId).toBe(backendId);
    } finally { store.close(); await roots.dispose(); }
  });

  it.each([true, false])('uses configured Brave for OpenCode Go when selected=%s', async (selected) => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((row) => row.route === 'opencode-go')!, credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成 Go', configured.credentialReference, 'ready', 'opencode-go');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, 'Go 检索兜底');
      const brave = store.saveSearchBackendCredential('search-brave', null, 'ready');
      store.selectSearchBackend(selected ? 'search-brave' : 'search-tinyfish');
      let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      expect(store.factualReviewLedger.inspect(book.bookId).providerResolutionPlan).toMatchObject({
        webToolsBackend: { backendId: 'search-brave', selectionSource: 'configured-backend' }, searchCredentialReference: brave.credentialReference,
      });
    } finally { store.close(); await roots.dispose(); }
  });

  it('uses a newly chosen or cleared fallback in a fresh same-book preparation', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成连接', configured.credentialReference, 'ready', 'opencode-go');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '重新准备检索凭据和备用来源');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      const connections = store.getSearchBackendConnections();
      const primary = connections.find((row) => row.backendId === 'search-bochaai')!.credentialReference;
      const backup = connections.find((row) => row.backendId === 'search-brave')!.credentialReference;
      store.saveSearchBackendCredential('search-bochaai', primary, 'ready');
      store.saveSearchBackendCredential('search-brave', backup, 'ready');
      store.selectSearchBackend('search-bochaai');
      const prepare = () => {
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
        return store.factualReviewLedger.inspect(book.bookId);
      };
      const original = prepare();
      store.selectSearchBackend('search-brave', 'fallback');
      const withBackup = prepare();
      expect(withBackup.taskIntent!.taskIntentId).not.toBe(original.taskIntent!.taskIntentId);
      expect(withBackup.providerResolutionPlan!.webToolsFallback?.backendId).toBe('search-brave');
      store.selectSearchBackend(null, 'fallback');
      const cleared = prepare();
      expect(cleared.taskIntent!.taskIntentId).not.toBe(withBackup.taskIntent!.taskIntentId);
      expect(cleared.providerResolutionPlan!.webToolsFallback).toBeUndefined();
      expect(prepare().taskIntent!.taskIntentId).toBe(cleared.taskIntent!.taskIntentId);
      expect(store.factualReviewLedger.frozenPlan(original.taskIntent!.taskIntentId, original.planEnvelope!.digest).components['provider-resolution-plan']).toEqual(original.providerResolutionPlan);
    } finally { store.close(); await roots.dispose(); }
  });

  it('keeps A in the authorized facts and drawer after selection changes to B', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      expect(policy.providerProcessing.version).toBe('v24');
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
      const envelopeA = frozen.components['plan-envelope'] as Record<string, unknown>;
      expect(envelopeA['webToolsBackendDigest']).toBe(sha256Hex(canonicalJson(before.webToolsBackend)));
      // A new Task uses the current selection: B's component, and so the envelope digest over it, differ from A's.
      const second = await importSample1Book(store, roots.codeRoot, '联网检索冻结回归 B');
      await pinEditorialWorkspaceProfileRevision2(store, second.bookId);
      let next = store.createReviewRunPreparationWork(second.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!next.done) next = store.advanceReviewRunPreparationWork(next.workId!);
      expect(store.inspectTaskPlan({ bookId: second.bookId, kind: 'review-run', ref: next.projection!.run!.reviewRunId }).service.provider).toContain('联网检索 · Brave');
      const childB = store.factualReviewLedger.inspect(second.bookId);
      const frozenB = store.factualReviewLedger.frozenPlan(childB.taskIntent!.taskIntentId, childB.planEnvelope!.digest);
      const backendB = frozenB.components['web-tools-backend'] as { backendId: string; host: string; configurationDigest: string };
      expect(backendB).toMatchObject({ backendId: 'search-brave', host: 'api.search.brave.com' });
      expect(backendB.configurationDigest).not.toBe(before.webToolsBackend!.configurationDigest);
      const envelopeB = frozenB.components['plan-envelope'] as Record<string, unknown>;
      expect(envelopeB['webToolsBackendDigest']).toBe(sha256Hex(canonicalJson(backendB)));
      expect(envelopeB['webToolsBackendDigest']).not.toBe(envelopeA['webToolsBackendDigest']);
      // A's Run still reads A after B's preparation.
      expect(store.factualReviewLedger.loadExecutionPlan(child.run!.runRecordId).webToolsBackend).toEqual(before.webToolsBackend);
    } finally { store.close(); await roots.dispose(); }
  });

  it('uses official DeepSeek model credentials for 初评 without search setup', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const configured = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'deepseek-open-platform')!, credentialReference: randomUUID() };
      store.saveModelServiceConnection('合成官方连接', configured.credentialReference, 'ready', 'deepseek-open-platform');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
      const launch = { operationalScope: 'ordinary-production' as const, policy, live: { ...configured, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
      store.baselineAnalysisLedger.bindLaunch(launch); store.initialEvaluationLedger.bindLaunch(launch);
      const book = await importSample1Book(store, roots.codeRoot, '初评检索凭据就绪');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      let progress = store.createInitialEvaluationPreparationWork(book.bookId, policy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      expect(store.initialEvaluationLedger.inspect(book.bookId).providerResolutionPlan).toMatchObject({
        webToolsBackend: { backendId: 'search-deepseek', selectionSource: 'model-channel' }, searchCredentialReference: configured.credentialReference,
      });
    } finally { store.close(); await roots.dispose(); }
  });

});
