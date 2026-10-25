import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { join } from 'node:path';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

describe('model-service proxy environment setting', () => {
  it('keeps a proxy-failed unit unsettled, displays the reason, and resumes the same Run', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    let execution: BaselineAnalysisExecutionOwner | undefined;
    try {
      const loaded = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-baseline-account-limit');
      const entries = new Map(loaded.entries);
      for (const [key, entry] of entries) {
        if (entry.response.kind === 'quota-exceeded') entries.set(key, { ...entry, response: {
          kind: 'adapter-failure', code: 'AI7_PROXY_UNREACHABLE', message: '代理不可达', status: null,
        } });
      }
      const fixture = { ...loaded, entries };
      const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
        induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
        induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
        baselineAnalysisRoute: {
        fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage,
      } });
      execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
      const { bookId } = await importSample1Book(store, roots.codeRoot, 'L2 proxy failure');
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 connection');
      let prepared = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!prepared.done) prepared = store.advanceBaselineAnalysisPreparationWork(prepared.workId!);
      const projection = prepared.projection!;
      const taskIntentId = projection.taskIntent!.taskIntentId;
      const run = store.authorizeBaselineAnalysis(bookId, taskIntentId, projection.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(run);
      await execution.whenIdle();
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.state).toBe('resumable');
      expect(stopped.run?.transitions.at(-1)?.detail).toContain('代理不可达');
      expect(store.baselineAnalysisLedger.unitCheckpoints(run).map((item) => item.unit.unitOrdinal)).toEqual([1, 2, 3]);
      expect(stopped.taskOutcome).toBeNull();
      execution.admitAndDispatch(run, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).taskOutcome?.classification).toBe('completed');
    } finally { await execution?.dispose(); store?.close(); await roots.dispose(); }
  });
  it('persists through the existing store owner without altering the connection or SQLite schema', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(await store.getModelServiceProxy()).toEqual({ mode: 'direct' });
      const connection = store.getModelServiceConnection();
      const setting = { mode: 'proxy', protocol: 'https', hostPort: 'proxy.invalid:8443' } as const;
      await expect(store.saveModelServiceProxy(setting)).resolves.toEqual(setting);
      expect(store.getModelServiceConnection()).toEqual(connection);
      store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(await store.getModelServiceProxy()).toEqual(setting);
      await store.saveModelServiceProxy({ mode: 'direct' });
      expect(await store.getModelServiceProxy()).toEqual({ mode: 'direct' });
    } finally { store?.close(); await roots.dispose(); }
  });
});
