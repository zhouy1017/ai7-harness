import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BoundedManuscriptStore } from '../../src/service/bounded-manuscript.js';
import { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { withAmbiguousClarificationValidation } from '../../src/service/provider/clarification-contract.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Original result-cache captures only: fresh Book/block identities, no credential, cache or Provider access.
it.each(['baseline', 'ambiguous'] as const)('replays the recorded /2 %s Run and each recorded answer on a fresh sample1 import', async (mode) => {
  const roots = await createServiceTestRoots('ai7-clarification-recorded-');
  let store: EditorialStore | undefined;
  let database: DatabaseSync | undefined;
  let owner: BaselineAnalysisExecutionOwner | undefined;
  try {
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const fixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), `sample1-model-clarification-live-${mode}`);
    const route = { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage };
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: route,
      induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
    const { bookId } = await importSample1Book(store, roots.codeRoot, '记录回放');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'Provider-free recorded replay');
    database = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'));
    database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    const definition = mode === 'ambiguous' ? withAmbiguousClarificationValidation(baselineAnalysisKindDefinition()) : baselineAnalysisKindDefinition();
    const ledger = new BaselineAnalysisStore(database, new BoundedManuscriptStore(database), route, definition);
    let work = ledger.prepare({ phase: 'start', bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, launchPolicy: policy });
    while (!work.done) work = ledger.prepare({ phase: 'advance', workId: work.workId! });
    const prepared = work.projection!;
    const taskIntentId = prepared.taskIntent!.taskIntentId;
    const runId = ledger.authorize(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    owner = new BaselineAnalysisExecutionOwner({ ledger, launchPolicy: policy, fixture,
      secretResolver: { resolve: async () => null } });
    owner.admitAndDispatch(runId);
    await owner.whenIdle();
    const questions = ledger.clarificationsOf(runId).filter((request) => request.origin === 'model');
    expect(questions).toHaveLength(mode === 'baseline' ? 0 : 8);
    if (questions.length > 0) {
      expect(ledger.currentRunState(runId)).toBe('awaiting-clarification');
      for (const request of questions) {
        expect(request.modelQuestion?.options?.length).toBeGreaterThan(0);
        ledger.recordClarificationAnswer(bookId, { taskIntentId, requestId: request.requestId, optionId: 'model-option-0', note: null });
      }
      owner.continueAnswered(runId);
      await owner.whenIdle();
    }
    const settled = ledger.inspect(bookId);
    expect(settled.run?.state).toBe('completed');
    expect(settled.resultSetRevision?.coverage.unitsClosed).toBe(8);
    expect(settled.resultSetRevision?.coverage.gapCount).toBe(0);
    expect(settled.run?.attempt?.spans).toHaveLength(8 + questions.length);
    expect(settled.taskOutcome?.report?.modelClarifications ?? []).toHaveLength(questions.length);
    expect((settled.taskOutcome?.report?.modelClarifications ?? []).every((entry) => entry.outcome === 'answered')).toBe(true);
    expect(ledger.clarificationsOf(runId).every((request) => request.answer !== null)).toBe(true);
  } finally {
    await owner?.dispose();
    database?.close();
    store?.close();
    await roots.dispose();
  }
});
