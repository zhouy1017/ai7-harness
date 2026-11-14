import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import type { RuntimeExecutionConfig } from '../../src/shared/runtime-execution-config.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { CUSTOM_DIMENSION_TEMPLATE, CUSTOM_DIMENSION_TITLE } from '../support/custom-analysis.js';
import { beginRewriteAsJ11, EVALUATION_REWRITE_FIXTURE_IDENTITY } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_REQUEST } from '../support/writing-task.js';

// D4: the six ordinary drawer starts use real stores and SampleBook input. No task is dispatched to a provider here.
const KINDS = ['baseline-analysis', 'custom-analysis', 'writing', 'initial-evaluation', 'readers-report', 'evaluation-rewrite'] as const;
type Kind = typeof KINDS[number];
let roots: ServiceTestRoots;
let store: EditorialStore;
let governor: ModelRequestGovernor;
let policy: LaunchPolicyProjection;
let capture: ReturnType<typeof capturedOrdinaryExecution> | undefined;
let setupOwner: BaselineAnalysisExecutionOwner | undefined;
let dimensionId: string | undefined;

beforeEach(async () => {
  dimensionId = undefined;
  roots = await createServiceTestRoots('ai7-task-dispatch-');
  governor = new ModelRequestGovernor();
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), EVALUATION_REWRITE_FIXTURE_IDENTITY);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  setupOwner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy: policy,
    fixture, secretResolver: { resolve: async () => null } });
});
afterEach(async () => {
  await capture?.owner.dispose();
  await setupOwner?.dispose();
  governor.close(); await governor.whenIdle();
  capture?.assertMatched();
  store?.markCleanShutdown(); store?.close();
  await roots?.dispose();
  capture = undefined; setupOwner = undefined;
});

async function book(kind: Kind) {
  const imported = await importSample1Book(store, roots.codeRoot, 'sample1 任务派发');
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  let recordId = '';
  if (kind === 'evaluation-rewrite') {
    recordMissingCredentialConnection(store, '初评本地检查');
    await runInitialEvaluationToEnd(store, setupOwner!, imported.bookId, policy);
    finalizeAsJ11(store, imported.bookId);
    recordId = beginRewriteAsJ11(store, imported.bookId).recordId;
  } else if (kind === 'readers-report') finalizeAsJ11(store, imported.bookId);
  return { ...imported, recordId };
}

function ordinary(): void {
  capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, () => undefined);
}

function command(kind: Kind, target: Awaited<ReturnType<typeof book>>, executionConfig: RuntimeExecutionConfig, clientCommandId = randomUUID(), rememberedChoice = false) {
  const common = { bookId: target.bookId, clientCommandId, executionConfig, rememberedChoice };
  switch (kind) {
    case 'baseline-analysis': return () => store.launchBaselineAnalysis({ ...common, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, policy);
    case 'custom-analysis': {
      dimensionId ??= store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE }).dimensions[0]!.dimensionId;
      const selectedDimension = dimensionId;
      return () => store.launchCustomAnalysis({ ...common, dimensionId: selectedDimension, update: null }, policy);
    }
    case 'writing': return () => store.launchWritingTask({ ...common, ...WRITING_REQUEST }, policy);
    case 'initial-evaluation': return () => store.launchInitialEvaluation(common, policy);
    case 'readers-report': return () => store.launchReadersReport({ ...common, template: 'author' }, policy);
    case 'evaluation-rewrite': return () => store.launchEvaluationRewrite({ ...common, recordId: target.recordId }, policy);
  }
}

describe.each(KINDS)('%s one-step launch', (kind) => {
  it('freezes concurrent choices, launches no approval-only records and replays after settings change', async () => {
    const a = await book(kind), b = await book(kind), fallbackBook = await book(kind);
    ordinary();
    const defaults = store.getConfiguredModelRoleBinding('main-editorial')!;
    const shown = store.getManuscriptWindow(a.manuscriptId, a.branchId, null);
    const paragraph = shown.blocks.find(block => block.kind === 'paragraph')!;
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: a.manuscriptId, branchId: a.branchId,
      baseRevisionId: shown.revisionId, blockId: paragraph.blockId, windowStartBlockId: shown.blocks[0]!.blockId,
      baseBlockDigest: paragraph.digest, expectedJournalSequence: shown.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '。' });
    const current = store.getManuscriptWindow(a.manuscriptId, a.branchId, null);
    const clientCommandId = randomUUID();
    const firstCommand = command(kind, a, { modelId: defaults.model, reasoningEffort: 'high' }, clientCommandId);
    const secondCommand = command(kind, b, { modelId: 'account-future-model', reasoningEffort: 'low' });
    const [first, second] = await Promise.all([Promise.resolve().then(firstCommand), Promise.resolve().then(secondCommand)]);
    expect(first.runRecordId).not.toBe(second.runRecordId);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).checkpoint.journalSequence).toBe(current.journalSequence);
    expect(first.ledger.loadExecutionPlan(first.runRecordId).productionBinding).toMatchObject({ model: defaults.model, reasoningEffort: 'high' });
    expect(second.ledger.loadExecutionPlan(second.runRecordId).productionBinding).toMatchObject({ model: 'account-future-model', reasoningEffort: 'low' });
    expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual(defaults);
    for (const [target, launched, effort] of [[a, first, 'high'], [b, second, 'low']] as const) {
      const task = store.inspectBookTasks(target.bookId, () => null).groups.flatMap(group => group.items)
        .find(entry => entry.item.technical.some(line => line.key === 'run-record' && line.value.includes(launched.runRecordId)));
      expect(task?.item.modelLabel).toContain(`@${effort}`);
    }
    store.selectMainRoleModel('opencode-go', defaults.model, 'off');
    expect(firstCommand()).toMatchObject({ repeated: true, runRecordId: first.runRecordId, taskIntentId: first.taskIntentId });
    expect(() => command(kind, a, { modelId: defaults.model, reasoningEffort: 'low' }, clientCommandId)()).toThrowError(expect.objectContaining({
      code: 'TASK_LAUNCH_COMMAND_CHANGED', message: expect.stringContaining('请重新发起'),
    }));
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(db.prepare('SELECT count(*) n FROM task_launch_snapshots WHERE task_kind = ?').get(kind)?.n).toBe(2);
      for (const launched of [first, second]) {
        const authority = db.prepare(`SELECT a.canonical_json FROM analysis_run_records r JOIN analysis_run_authorizations a USING(authorization_id) WHERE r.run_record_id = ?`).get(launched.runRecordId);
        expect(JSON.parse(String(authority?.canonical_json)).launchSnapshotId).toEqual(expect.any(String));
        expect(db.prepare('SELECT count(*) n FROM analysis_plan_revisions WHERE task_intent_id = ?').get(launched.taskIntentId)?.n).toBe(0);
        expect(launched.ledger.currentRunState(launched.runRecordId)).toBe('authorized');
      }
    } finally { db.close(); }
    const fallback = command(kind, fallbackBook, { modelConnectionId: 'removed-instance-connection', modelId: 'removed-model' }, randomUUID(), true)();
    expect(fallback.launchNotice).toBe('上次选择的模型已不可用，本次已使用角色默认模型。');
    expect(fallback.ledger.loadExecutionPlan(fallback.runRecordId).productionBinding).toMatchObject({ model: defaults.model });
    expect(capture!.requests).toHaveLength(0);
  });
});
