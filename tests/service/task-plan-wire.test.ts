import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BASELINE_ANALYSIS_TASK_GOAL, MAX_FRAME_BYTES, type TaskPlanProjection, type ServiceResponse } from '../../src/shared/protocol.js';
import { serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { baselineAnalysisPlan, taskPlanOutbound, taskPlanWire, withResend } from '../../src/service/task-plan.js';
import { encodeServiceResponse } from '../../src/service/request-frames.js';
import { appendTaskPlanPage } from '../../src/renderer/analysis-paging.js';
import { longSettledAnalysis } from '../support/long-baseline-analysis.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';

const PLAN_OPS = ['inspectTaskPlan', 'resolveUnconfirmedOutcomes', 'editTaskPlan', 'controlTaskRun', 'startTaskWhenOnline', 'cancelWaitingTask'] as const;
const ID = '00000000-0000-4000-8000-000000000000';
function sweep(shape: string, state: string, op: string, result: unknown): void {
  const response = { id: ID, ok: true, op, result };
  const before = serializedBytes(response);
  const after = serializedBytes(taskPlanOutbound(response));
  console.info('TASK_REPLY_BYTES', JSON.stringify({ shape, state, op, before, after }));
  expect(after, `${shape}/${state}/${op}`).toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
  const frame = encodeServiceResponse(response as ServiceResponse);
  expect(JSON.parse(frame.subarray(4).toString('utf8')).ok).toBe(true);
}

function completePages(store: EditorialStore, original: TaskPlanProjection): void {
  let wire = taskPlanWire(original);
  const inspect = vi.spyOn(store, 'inspectTaskPlan').mockReturnValue(original);
  try {
    for (const path of Object.keys(wire.listPages ?? {})) {
      const visited = new Set<number>();
      while (wire.listPages![path]!.nextOrdinal !== null) {
        const meta = wire.listPages![path]!;
        expect(visited.has(meta.nextOrdinal!)).toBe(false);
        visited.add(meta.nextOrdinal!);
        const page = store.getTaskPlanPage({ bookId: original.bookId, kind: original.kind, ref: original.ref,
          path, afterOrdinal: meta.nextOrdinal!, digest: meta.digest });
        expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
        wire = appendTaskPlanPage(wire, page);
      }
      expect(wire.listPages![path]!.shown).toBe(wire.listPages![path]!.total);
    }
    const { listPages: _pages, ...rest } = wire;
    expect(rest).toEqual(original);
  } finally { inspect.mockRestore(); }
}

for (const shape of ['headings', 'dense'] as const) it(`sweeps drawer replies for ${shape}`, async () => {
  const roots = await createServiceTestRoots('ai7-task-wire-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    const inputPath = join(roots.inputRoot, 'generated.docx');
    await writeSyntheticDocx(inputPath, { paragraphs: Array.from({ length: shape === 'headings' ? 6000 : 1200 }, (_, index) => ({
      text: shape === 'headings' ? `生成标题${index}` : '甲乙丙丁戊己庚辛壬癸'.repeat(125),
      ...(shape === 'headings' ? { style: 'Heading1' } : {}),
    })) });
    const staged = await store.stageSelectedManuscript(randomUUID(), inputPath);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '生成测试' }, false);
    const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
      reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    const connection = store.saveModelServiceConnection('generated local setup', null, 'needs-attention', 'opencode-go');
    const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: connection.credentialReference };
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy, live: { ...binding, scope: 'ordinary-production', runBudgetCeiling: 'unset' } });
    store.initialEvaluationLedger.bindLaunch(store.baselineAnalysisLedger.launch);
    const search = store.getSearchBackendConnections().find((entry) => entry.selected)!;
    store.saveSearchBackendCredential(search.backendId, null, 'ready');
    await store.installEditorialWorkspaceProfile(commit.bookId);
    await store.enableEditorialWorkspaceProfile(commit.bookId);
    let work = store.createBaselineAnalysisPreparationWork(commit.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
    while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
    const plan = store.inspectTaskPlan({ bookId: commit.bookId, kind: 'baseline-analysis', ref: null });
    expect(work.projection!.coverageManifest!.units.length).toBeGreaterThanOrEqual(shape === 'headings' ? 6000 : 1200);
    const settled = longSettledAnalysis(work.projection!);
    const blocks = store.baselineAnalysisLedger.readRevisionBlocks(work.projection!.checkpoint!.manuscriptId, work.projection!.checkpoint!.revisionId);
    const settledPlan = baselineAnalysisPlan({ projection: settled, bookTitle: '生成测试', blocks });
    const units = work.projection!.coverageManifest!.units.map((unit) => unit.ordinal);
    const resend = withResend(settledPlan, units);
    const drift = { ...resend, drift: { reasons: ['生成变化'], resolution: '重新确认计划', entries: units.map((ordinal) => ({
      field: `generated-${ordinal}`, label: '生成字段', prior: '原值', proposed: '新值', materiality: 'material' as const })) },
      unconfirmed: { ranges: units.map((unitOrdinal) => ({ unitOrdinal, category: null, recordedAt: '2026-10-19T00:00:00.000Z', earlierText: false })), steps: [], digest: 'a'.repeat(64) } };
    for (const [state, next] of Object.entries({ prepared: plan, 'settled-update': settledPlan, resend, drift })) {
      for (const op of PLAN_OPS) sweep(shape, `baseline-analysis/${state}`, op, next);
      completePages(store, next);
    }
    let evaluation = store.createInitialEvaluationPreparationWork(commit.bookId, policy);
    while (!evaluation.done) evaluation = store.advanceInitialEvaluationPreparationWork(evaluation.workId!);
    let writing = store.createWritingPreparationWork(commit.bookId, { typeId: 'news-release', audience: '测试读者', channel: '测试渠道', requirements: null }, policy);
    while (!writing.done) writing = store.advanceWritingPreparationWork(writing.workId!);
    let reviewing = store.createReviewRunPreparationWork(commit.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!reviewing.done) reviewing = store.advanceReviewRunPreparationWork(reviewing.workId!);
    for (const kind of ['initial-evaluation', 'writing', 'review-run'] as const) {
      const next = store.inspectTaskPlan({ bookId: commit.bookId, kind, ref: kind === 'review-run' ? reviewing.projection!.run!.reviewRunId : null });
      for (const op of PLAN_OPS) sweep(shape, `${kind}/prepared`, op, next);
      completePages(store, next);
    }
    for (const [kind, projection] of Object.entries({ evaluation: store.inspectEvaluation(commit.bookId, null), writing: store.inspectWritingTask(commit.bookId), reviewing: reviewing.projection })) {
      for (const op of ['pollServiceJob', 'cancelServiceJob', 'redoTaskPlan']) sweep(shape, `${kind}/prepared`, op, {
        jobId: ID, kind: `${kind}-preparation`, state: 'completed', progress: { completed: 1, total: 1, label: '生成准备' }, result: projection, failure: null,
      });
    }
    const workspace = reviewing.projection!;
    sweep(shape, 'review-run/prepared', 'inspectReviewWorkspace', workspace);
    let wire = taskPlanOutbound(workspace) as typeof workspace;
    const path = 'scopeOptions.chapters.chapters';
    while (wire.listPages?.[path]?.nextOrdinal != null) {
      const meta = wire.listPages[path]!;
      const page = store.getTaskPlanPage({ bookId: commit.bookId, kind: 'review-run', ref: workspace.run!.reviewRunId,
        path, afterOrdinal: meta.nextOrdinal!, digest: meta.digest });
      expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
      wire = appendTaskPlanPage(wire, page);
    }
    expect(wire.scopeOptions).toEqual(workspace.scopeOptions);
    sweep(shape, 'prepared', 'inspectBookTasks', store.inspectBookTasks(commit.bookId, { snapshot: () => null } as never));
    sweep(shape, 'prepared', 'inspectTaskIntentDrafts', store.inspectTaskIntentDrafts({ bookId: commit.bookId, draftId: null }));
  } finally { store.close(); await roots.dispose(); }
}, 60_000);

