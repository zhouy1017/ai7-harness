import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { CooperativeJobOwner } from '../../src/service/cooperative-jobs.js';
import { ALWAYS_ONLINE } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { EditorialStore } from '../../src/service/store.js';
import type { AnalysisProjection, StartWhenOnlineTaskKind } from '../../src/shared/protocol.js';
import { beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_BOOK_TITLE, WRITING_REQUEST } from '../support/writing-task.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const CASES = [
  ['initial-evaluation', 'sample1-evaluation-authored'],
  ['readers-report', 'sample1-readers-report-authored'],
  ['evaluation-rewrite', 'sample1-evaluation-rewrite-authored'],
  ['writing', 'sample1-writing-authored'],
  ['review-run', 'sample1-review-authored'],
] as const;

async function until(read: () => boolean): Promise<void> {
  const limit = Date.now() + 20_000;
  while (!read()) {
    if (Date.now() > limit) throw new Error('Control boundary did not arrive');
    await new Promise((done) => setTimeout(done, 5));
  }
}

for (const [kind, identity] of CASES) it(`${kind}: pause checkpoints, resume the attempt, cancel keeps units, and redo edits a fresh plan`, async () => {
  const roots = await createServiceTestRoots('ai7-kind-controls-');
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const authored = await loadModelFixture(FIXTURES, identity);
  const entries = new Map(authored.entries);
  const fixture = { ...authored, entries };
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  let hold = false;
  let waiting = false;
  let release!: () => void;
  let gate = Promise.resolve();
  const block = (): void => { hold = true; waiting = false; gate = new Promise<void>((done) => { release = done; }); };
  const execution = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture,
    secretResolver: { resolve: async () => null },
    unitHold: async () => { if (hold) { waiting = true; await gate; } },
  });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, execution);
  const jobs = new CooperativeJobOwner(store);
  try {
    const book = await importSample1Book(store, roots.codeRoot, kind === 'writing' ? WRITING_BOOK_TITLE : '任务控制之书');
    const bookId = book.bookId;
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    let projection: AnalysisProjection | null = null;
    let ref: string;
    if (kind === 'initial-evaluation') {
      let work = store.createInitialEvaluationPreparationWork(bookId, policy);
      while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
      projection = work.projection!;
    } else if (kind === 'writing') {
      let work = store.createWritingPreparationWork(bookId, WRITING_REQUEST, policy);
      while (!work.done) work = store.advanceWritingPreparationWork(work.workId!);
      projection = work.projection!;
    } else if (kind === 'readers-report' || kind === 'evaluation-rewrite') {
      await runInitialEvaluationToEnd(store, execution, bookId, policy);
      finalizeAsJ11(store, bookId);
      if (kind === 'readers-report') {
        let work = store.createReadersReportPreparationWork(bookId, 'editorial', policy);
        while (!work.done) work = store.advanceReadersReportPreparationWork(work.workId!);
        projection = work.projection!;
      } else {
        const record = beginRewriteAsJ11(store, bookId);
        let work = store.createEvaluationRewritePreparationWork(bookId, record.recordId, policy);
        while (!work.done) work = store.advanceEvaluationRewritePreparationWork(work.workId!);
        projection = work.projection!;
      }
    }
    if (kind === 'review-run') {
      let work = store.createReviewRunPreparationWork(bookId, ['typos-and-usage', 'style-and-format'],
        { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      ref = work.projection!.run!.reviewRunId;
    } else ref = projection!.taskIntent!.taskIntentId;
    const input = { bookId, kind: kind as StartWhenOnlineTaskKind, ref };
    let plan = store.inspectTaskPlan(input);
    expect(plan.edit.editable).toBe(true);
    expect(() => store.editTaskPlan({ ...input, planEnvelopeDigest: plan.edit.planEnvelopeDigest!, removedSteps: ['invented'], disallowedAdaptations: [] })).toThrow();
    plan = store.editTaskPlan({ ...input, planEnvelopeDigest: plan.edit.planEnvelopeDigest!, removedSteps: [], disallowedAdaptations: ['safe-retry'] });
    const revisedCategoryDigests = plan.start.categoryDigests;
    expect(plan.boundary.adaptable.find((entry) => entry.id === 'safe-retry')?.removed).toBe(true);
    // A retry-safe first-unit failure proves the edited restriction is honoured by each real kind's Run.
    for (const [key, entry] of entries) if (entry.unitOrdinal === 1) entries.set(key, { ...entry,
      response: { kind: 'adapter-failure', code: 'PROVIDER_ERROR', message: '模型服务暂时出错。', status: 503 } });
    block();
    let driven: Promise<void> | null = null;
    if (kind === 'review-run') {
      store.authorizeReviewRun(bookId, ref, plan.start.categoryDigests);
      driven = driver.drive(ref);
    } else {
      const digest = plan.start.planEnvelopeDigest!;
      const started = kind === 'initial-evaluation' ? store.authorizeInitialEvaluation(bookId, ref, digest)
        : kind === 'readers-report' ? store.authorizeReadersReport(bookId, ref, digest)
          : kind === 'evaluation-rewrite' ? store.authorizeEvaluationRewrite(bookId, ref, digest) : store.authorizeWriting(bookId, ref, digest);
      execution.admitAndDispatch(started.dispatchRunRecordId!, started.ledger);
    }
    await until(() => waiting);
    const ledger = store.taskRunLedger(input);
    const runId = ledger.inspect(bookId).run!.runRecordId;
    const pause = store.requestTaskRunControl({ ...input, action: 'pause' });
    execution.pauseRun(pause.runRecordId!, pause.ledger);
    hold = false; release();
    await execution.whenDone(runId);
    if (driven !== null) await driven;
    expect(ledger.currentRunState(runId)).toBe('paused');
    expect(ledger.unitCheckpoints(runId)).toHaveLength(1);
    expect(ledger.unitAttemptsOf(runId).get(1)).toBe(1);
    expect(ledger.unitCheckpoints(runId)[0]!.unit.closed).toMatchObject({ state: 'gap' });
    const attempt = ledger.executionBindingOf(runId)!.attemptId;
    plan = store.inspectTaskPlan(input, (id) => execution.progressFor(id));
    expect(plan.state.key).toBe('paused');
    expect(plan.runControl?.resume?.reason).toBeNull();
    const panel = store.inspectBookTasks(bookId, (id) => execution.progressFor(id));
    expect(panel).toBeDefined();
    if (kind === 'review-run') {
      const reviewed = store.inspectReviewWorkspace(bookId, ref).run!;
      expect(reviewed.categories[1]!.state).toBe('waiting');
      expect(reviewed.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest }))).toEqual(revisedCategoryDigests);
    }
    block();
    const resume = store.requestTaskRunControl({ ...input, action: 'resume' });
    if (kind === 'review-run') driven = driver.continue(ref);
    else execution.admitAndDispatch(resume.runRecordId!, resume.ledger, { resume: true });
    await until(() => waiting);
    expect(ledger.executionBindingOf(runId)!.attemptId).toBe(attempt);
    plan = store.inspectTaskPlan(input, (id) => execution.progressFor(id));
    expect(plan.runControl?.cancel.impact.length).toBeGreaterThan(0);
    expect(plan.runControl?.cancel.impact.join('')).toContain('保留');
    const cancel = store.requestTaskRunControl({ ...input, action: 'cancel' });
    execution.cancelRun(cancel.runRecordId!, cancel.ledger);
    hold = false; release();
    await execution.whenDone(runId);
    if (driven !== null) await driven;
    if (kind === 'review-run') store.finishCancelledReviewRun(runId);
    expect(ledger.currentRunState(runId)).toBe('cancelled');
    expect(ledger.unitCheckpoints(runId)).toHaveLength(2);
    expect(ledger.executionBindingOf(runId)!.attemptId).toBe(attempt);
    expect(store.inspectTaskPlan(input).redo).not.toBeNull();
    let job = jobs.startTaskRedo(input, policy);
    await until(() => {
      if (['completed', 'failed', 'cancelled'].includes(job.state)) return true;
      job = jobs.poll(job.jobId);
      return ['completed', 'failed', 'cancelled'].includes(job.state);
    });
    expect(job.state, job.failure?.message).toBe('completed');
    const result = job.result!;
    const nextRef = kind !== 'review-run' ? store.inspectTaskPlan({ bookId, kind, ref: null }).ref
      : 'run' in result && result.run !== null && 'reviewRunId' in result.run ? result.run.reviewRunId : null;
    expect(nextRef).not.toBeNull();
    expect(nextRef).not.toBe(ref);
    const next = store.inspectTaskPlan({ ...input, ref: nextRef! });
    expect(next.edit.editable).toBe(true);
    expect(next.start.readiness).toBe('ready');
    expect(next.boundary.adaptable.find((entry) => entry.id === 'safe-retry')?.removed).toBe(true);
    expect(next.runControl).toBeNull();
    if (kind === 'initial-evaluation') {
      // A dirty checkpoint makes redo a cooperative preparation; cancelling it sends nothing and leaves the old Run cancelled.
      block();
      const started = store.authorizeInitialEvaluation(bookId, nextRef!, next.start.planEnvelopeDigest!);
      execution.admitAndDispatch(started.dispatchRunRecordId!, started.ledger);
      await until(() => waiting);
      const stopped = store.requestTaskRunControl({ bookId, kind, ref: nextRef!, action: 'cancel' });
      execution.cancelRun(stopped.runRecordId!, stopped.ledger);
      hold = false; release();
      await execution.whenDone(stopped.runRecordId!);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const first = window.blocks[0]!;
      store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
        baseRevisionId: window.revisionId, blockId: first.blockId, windowStartBlockId: first.blockId,
        baseBlockDigest: first.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '（编辑）' });
      const preparing = jobs.startTaskRedo({ bookId, kind, ref: nextRef! }, policy);
      expect(preparing.state).toBe('queued');
      expect(jobs.cancel(preparing.jobId).state).toBe('cancelled');
      expect(stopped.ledger.currentRunState(stopped.runRecordId!)).toBe('cancelled');
      expect(execution.progressFor(stopped.runRecordId!)).toBeNull();
    }
    store.markCleanShutdown();
  } finally {
    hold = false; release?.();
    await jobs.dispose();
    const stopped = driver.dispose();
    await execution.dispose();
    await stopped;
    store.close();
    await roots.dispose();
  }
}, 120_000);
