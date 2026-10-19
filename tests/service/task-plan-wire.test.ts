import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BASELINE_ANALYSIS_TASK_GOAL, J03_TASK_GOAL, MAX_FRAME_BYTES, EVALUATION_REWRITE_KIND, EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_EXPECTED_OUTCOME, EVALUATION_REWRITE_MODE_GOALS, MAX_TASK_INTENT_GOAL_LENGTH,
  type EvaluationRewriteProjection, type TaskPlanProjection, type ServiceResponse } from '../../src/shared/protocol.js';
import { serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { baselineAnalysisPlan, evaluationRewritePlan, reviewWorkspaceWire, taskPlanOutbound, taskPlanWire, withAnswerBlockers, withResend } from '../../src/service/task-plan.js';
import { decodeRequest, encodeServiceResponse, ProtocolError } from '../../src/service/request-frames.js';
import { appendTaskPlanPage } from '../../src/renderer/analysis-paging.js';
import { longSettledAnalysis } from '../support/long-baseline-analysis.js';
import type { ClarificationFacts } from '../../src/service/analysis/clarifications.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

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

const REPLY_BUDGET = MAX_FRAME_BYTES - 72 * 1024;
/** An inline page never empties a list or text that holds entries, however far the guard shrank it. */
function expectNonEmptyPages(listPages: TaskPlanProjection['listPages']): void {
  for (const [path, meta] of Object.entries(listPages ?? {})) expect(meta.total === 0 || meta.shown >= 1, path).toBe(true);
}

const PAGEABLE_PATHS = ['drift.entries', 'edit.lastEdit.entries', 'resend.units', 'resend.statement', 'unconfirmed.ranges',
  'runControl.outcomeUnknown.units', 'runControl.continuation.pendingAnswerUnits', 'clarifications'];
function largestPageable(plan: TaskPlanProjection): number {
  const lists = PAGEABLE_PATHS.map((path) => path.split('.').reduce<unknown>((value, key) =>
    value === null || typeof value !== 'object' ? undefined : (value as Record<string, unknown>)[key], plan));
  return Math.max(...[...lists, ...plan.technical.map((row) => row.value)].map((value) => value === undefined ? 0 : serializedBytes(value)));
}

/**
 * Pages every state that holds a value worth paging, whether or not its whole reply fits: one byte under that size forces the
 * guard to page. A plan the store derives is read back through its real derivation, which must pin the same digests; only a
 * state the store cannot reach provider-free (`generated`) replaces that one read with the generated plan. A plan that fits
 * is returned unchanged.
 */
function completePages(store: EditorialStore, original: TaskPlanProjection, generated: boolean): void {
  if (serializedBytes(original) <= REPLY_BUDGET) expect(taskPlanWire(original)).toBe(original);
  if (largestPageable(original) < 16 * 1024) return;
  let wire = taskPlanWire(original, Math.min(serializedBytes(original) - 1, REPLY_BUDGET));
  expect(Object.keys(wire.listPages ?? {}).length).toBeGreaterThan(0);
  expectNonEmptyPages(wire.listPages);
  const inspect = generated ? vi.spyOn(store, 'inspectTaskPlan').mockReturnValue(original) : null;
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
  } finally { inspect?.mockRestore(); }
}

async function generatedBook(store: EditorialStore, inputRoot: string, paragraphs: ReadonlyArray<{ text: string; style?: string }>) {
  const inputPath = join(inputRoot, 'generated.docx');
  await writeSyntheticDocx(inputPath, { paragraphs: [...paragraphs] });
  const staged = await store.stageSelectedManuscript(randomUUID(), inputPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '生成测试' }, false);
  return store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!, commitId: randomUUID() });
}

for (const shape of ['headings', 'dense'] as const) it(`sweeps drawer replies for ${shape}`, async () => {
  const roots = await createServiceTestRoots('ai7-task-wire-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    const commit = await generatedBook(store, roots.inputRoot, Array.from({ length: shape === 'headings' ? 6000 : 1200 }, (_, index) => ({
      text: shape === 'headings' ? `生成标题${index}` : '甲乙丙丁戊己庚辛壬癸'.repeat(125),
      ...(shape === 'headings' ? { style: 'Heading1' } : {}),
    })));
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
    const clarifications: ClarificationFacts[] = units.map((unitOrdinal) => ({ requestId: randomUUID(), runRecordId: settled.run!.runRecordId,
      attemptId: ID, taskIntentId: settled.taskIntent!.taskIntentId, unitOrdinal, planVersion: 1, raisedAt: '2026-10-19T00:00:00.000Z',
      requestDigest: 'a'.repeat(64), failure: { code: 'GENERATED', failureClass: 'retryable', status: null, reason: '生成原因' },
      firstPayloadDigest: null, firstUnitMessageDigest: null, firstUsage: null, firstWallMs: 0, answer: null }));
    const stopped = baselineAnalysisPlan({ projection: { ...settled, run: { ...settled.run!, state: 'resumable', progress: null } },
      bookTitle: '生成测试', blocks, clarifications, stopped: { waiting: units.map((unitOrdinal) => ({ unitOrdinal, answered: true })),
        unitsSettled: 0, unitsClosed: 0, unitsTotal: units.length, blockers: [], bindingHolds: true,
        outcomeUnknown: { units: units.map((unitOrdinal) => ({ unitOrdinal, attempts: 1, reason: '生成原因' })), stopped: true } } });
    stopped.edit = { ...stopped.edit, lastEdit: { ordinal: 2, recordedAt: '2026-10-19T00:00:00.000Z', entries: drift.drift.entries } };
    // The prepared plan is the store's own; the later states are #988's generated settled analysis through the real plan
    // factories (`withResend`, `baselineAnalysisPlan`), with drift lines, unconfirmed ranges and questions generated one per unit.
    for (const [state, next] of Object.entries({ prepared: plan, 'settled-update': settledPlan, resend, drift, 'stopped-clarifications': stopped })) {
      for (const op of PLAN_OPS) sweep(shape, `baseline-analysis/${state}`, op, next);
      completePages(store, next, state !== 'prepared');
    }
    // A reply that fits is the plan itself, unchanged (as #988's): only a larger one is paged.
    expect(serializedBytes(plan)).toBeLessThanOrEqual(REPLY_BUDGET);
    expect(largestPageable(plan), 'the store-derived plan was paged and read back for real').toBeGreaterThanOrEqual(16 * 1024);
    expect(serializedBytes(stopped)).toBeGreaterThan(REPLY_BUDGET);
    expect(taskPlanWire(stopped).listPages, 'a reply past the budget is paged').toBeDefined();
    let evaluation = store.createInitialEvaluationPreparationWork(commit.bookId, policy);
    while (!evaluation.done) evaluation = store.advanceInitialEvaluationPreparationWork(evaluation.workId!);
    // The rewrite cannot be stored before a settled 初评. Exercise its real plan factory over a generated frozen
    // preparation instead; no fabricated model result, stored authority record or live request is needed.
    const rewriteProjection: EvaluationRewriteProjection = { ...evaluation.projection!, kind: EVALUATION_REWRITE_KIND,
      contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION, resultSetRevision: null, update: null, updateControls: null, history: null, inspectedRevision: null,
      taskIntent: { ...evaluation.projection!.taskIntent!, goal: EVALUATION_REWRITE_MODE_GOALS['evaluation-rewrite-first'],
        expectedOutcome: EVALUATION_REWRITE_EXPECTED_OUTCOME, mode: 'evaluation-rewrite-first' } };
    const rewritePlan = evaluationRewritePlan({ projection: rewriteProjection, bookTitle: '生成测试', blocks,
      task: { recordOrdinal: 1, entryOrdinal: 2, profile: { title: '生成评估', version: '1' }, scored: [{ label: '生成评分项', score: 10, fullMarks: 20 }] } });
    for (const op of PLAN_OPS) sweep(shape, 'evaluation-rewrite/generated-prepared', op, rewritePlan);
    completePages(store, rewritePlan, true);
    let writing = store.createWritingPreparationWork(commit.bookId, { typeId: 'news-release', audience: '测试读者', channel: '测试渠道', requirements: null }, policy);
    while (!writing.done) writing = store.advanceWritingPreparationWork(writing.workId!);
    let reviewing = store.createReviewRunPreparationWork(commit.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!reviewing.done) reviewing = store.advanceReviewRunPreparationWork(reviewing.workId!);
    for (const kind of ['initial-evaluation', 'writing', 'review-run'] as const) {
      const next = store.inspectTaskPlan({ bookId: commit.bookId, kind, ref: kind === 'review-run' ? reviewing.projection!.run!.reviewRunId : null });
      for (const op of PLAN_OPS) sweep(shape, `${kind}/prepared`, op, next);
      completePages(store, next, false);
    }
    for (const [kind, preparationOp, projection] of [
      ['initial-evaluation', 'prepareInitialEvaluation', store.inspectEvaluation(commit.bookId, null)],
      ['writing', 'prepareWritingTask', store.inspectWritingTask(commit.bookId)],
      ['review-run', 'prepareReviewRun', reviewing.projection],
    ] as const) {
      for (const op of [preparationOp, 'pollServiceJob', 'cancelServiceJob', 'redoTaskPlan']) sweep(shape, `${kind}/prepared`, op, {
        jobId: ID, kind: `${kind}-preparation`, state: 'completed', progress: { completed: 1, total: 1, label: '生成准备' }, result: projection, failure: null,
      });
    }
    const workspace = reviewing.projection!;
    for (const op of ['inspectReviewWorkspace', 'authorizeReviewRun', 'continueReviewRun', 'cancelReviewRun', 'recordReviewFindingDisposition', 'generateReviewReport']) {
      sweep(shape, 'review-run/prepared', op, workspace);
    }
    sweep(shape, 'review-run/prepared', 'quickStartReviewRun', { outcome: 'fell-back', reasons: [], projection: workspace });
    // The chapter choices are paged whenever the workspace is (forced one byte under its size when it would fit), and read
    // back through the store's own workspace read, before and after the Run, until they equal the complete choices.
    const path = 'scopeOptions.chapters.chapters';
    for (const ref of [workspace.run!.reviewRunId, null]) {
      let wire = reviewWorkspaceWire(workspace, Math.min(serializedBytes(workspace) - 1, REPLY_BUDGET));
      expect(wire.listPages?.[path]?.nextOrdinal).not.toBeNull();
      expectNonEmptyPages(wire.listPages);
      while (wire.listPages?.[path]?.nextOrdinal != null) {
        const meta = wire.listPages[path]!;
        const page = store.getTaskPlanPage({ bookId: commit.bookId, kind: 'review-run', ref, path, afterOrdinal: meta.nextOrdinal!, digest: meta.digest });
        expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
        wire = appendTaskPlanPage(wire, page);
      }
      expect(wire.scopeOptions).toEqual(workspace.scopeOptions);
    }
    expect(() => store.getTaskPlanPage({ bookId: commit.bookId, kind: 'review-run', ref: null, path, afterOrdinal: 1, digest: '0'.repeat(64) }))
      .toThrow(/章节已变化/u);
    sweep(shape, 'prepared', 'inspectBookTasks', store.inspectBookTasks(commit.bookId, () => null));
    sweep(shape, 'prepared', 'inspectTaskIntentDrafts', store.inspectTaskIntentDrafts({ bookId: commit.bookId, draftId: null }));
    const record = store.startEvaluation(commit.bookId).record!;
    store.saveEvaluation({ bookId: commit.bookId, recordId: record.recordId, expectedEntries: 1, finalize: true,
      content: { ...record.content, items: record.content.items.map((item) => ({ ...item, score: 10 })),
        risks: record.content.risks.map((risk) => ({ ...risk, level: 'low', statement: '生成风险说明' })), conclusion: 'revise' } });
    let readers = store.createReadersReportPreparationWork(commit.bookId, 'author', policy);
    while (!readers.done) readers = store.advanceReadersReportPreparationWork(readers.workId!);
    const readersPlan = store.inspectTaskPlan({ bookId: commit.bookId, kind: 'readers-report', ref: readers.projection!.taskIntent!.taskIntentId });
    for (const op of PLAN_OPS) sweep(shape, 'readers-report/prepared', op, readersPlan);
    completePages(store, readersPlan, false);
    for (const op of ['prepareReadersReport', 'pollServiceJob', 'cancelServiceJob', 'redoTaskPlan']) sweep(shape, 'readers-report/prepared', op, {
      jobId: ID, kind: 'readers-report-preparation', state: 'completed', progress: { completed: 1, total: 1, label: '生成准备' },
      result: store.inspectEvaluation(commit.bookId, null), failure: null,
    });
    // Generated Books have no fixed sample1 lineage; a version begun without a settled 初评 has no rewrite to prepare.
    expect(() => store.createTaskAuthorizationPreparationWork(commit.bookId, J03_TASK_GOAL, policy)).toThrow();
    expect(() => store.createEvaluationRewritePreparationWork(commit.bookId, record.recordId, policy)).toThrow();
    // Stress the aggregate guard, and code-point cuts through escaped/astral text, using the same real prepared plan.
    const stressed = { ...stopped, drift: drift.drift, unconfirmed: drift.unconfirmed, resend: resend.resend,
      clarifications: stopped.clarifications.slice(0, 1000),
      technical: Array.from({ length: 32 }, (_, index) => ({ key: `generated-${index}`, label: '生成详情', value: '甲😀"\\'.repeat(6000) })) };
    sweep(shape, 'aggregate-guard', 'inspectTaskPlan', stressed);
    completePages(store, stressed, true);
    if (shape === 'headings') for (const path of ['drift.entries', 'edit.lastEdit.entries', 'resend.units', 'resend.statement',
      'unconfirmed.ranges', 'runControl.outcomeUnknown.units', 'runControl.continuation.pendingAnswerUnits', 'clarifications']) {
      expect(taskPlanWire(stressed).listPages?.[path], path).toBeDefined();
    }
    // Down the guard's whole ladder, every inline page keeps its first entry, until a budget below what the plan needs
    // even then is refused plainly instead of a reply that would not fit.
    for (let budget = serializedBytes(drift) - 1; ; budget = Math.floor(budget / 2)) {
      let wire: TaskPlanProjection;
      try { wire = taskPlanWire(drift, budget); } catch (error) { expect(String(error)).toMatch(/任务计划摘要超出可读取范围/u); break; }
      expect(serializedBytes(wire)).toBeLessThanOrEqual(budget);
      expectNonEmptyPages(wire.listPages);
    }
    const connected = withAnswerBlockers(stopped, ['生成连接未就绪']);
    const clarificationPage = taskPlanWire(connected).listPages!.clarifications!;
    const connectedPage = store.getTaskPlanPage({ bookId: connected.bookId, kind: connected.kind, ref: connected.ref,
      path: 'clarifications', afterOrdinal: clarificationPage.nextOrdinal!, digest: clarificationPage.digest }, connected);
    expect(connectedPage.digest).toBe(clarificationPage.digest);
    expect(() => store.getTaskPlanPage({ bookId: plan.bookId, kind: plan.kind, ref: plan.ref, path: 'technical.0.value', afterOrdinal: 0, digest: '0'.repeat(64) })).toThrow(/变化/u);
    if (shape === 'headings') {
      store.saveTaskIntentDraft({ bookId: commit.bookId, draftId: null, expectedOrdinal: null,
        origin: 'composer-book', goal: '生成目标'.repeat(100), target: { kind: 'book' }, outcomeClass: null });
      sweep(shape, 'one-draft', 'inspectTaskIntentDrafts', store.inspectTaskIntentDrafts({ bookId: commit.bookId, draftId: null }));
      sweep(shape, 'one-draft', 'inspectBookTasks', store.inspectBookTasks(commit.bookId, () => null));
    }
  } finally { store.close(); await roots.dispose(); }
}, 120_000);

it('pages the 500 retained drafts a Book lists, each saved for real, and refuses a page once the list moved', async () => {
  const roots = await createServiceTestRoots('ai7-task-drafts-wire-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    // A short Book keeps each save cheap; the list's size is its drafts', and the read lists at most 500 not yet promoted.
    const { bookId } = await generatedBook(store, roots.inputRoot, Array.from({ length: 3 }, (_, index) => ({ text: `生成段落${index}` })));
    const save = (index: number) => store.saveTaskIntentDraft({ bookId, draftId: null, expectedOrdinal: null,
      origin: 'composer-book', goal: `生成目标${index}`.padEnd(MAX_TASK_INTENT_GOAL_LENGTH, '甲'), target: { kind: 'book' }, outcomeClass: null });
    for (let index = 0; index < 500; index += 1) save(index);
    const drafts = store.inspectTaskIntentDrafts({ bookId, draftId: null });
    expect(drafts.drafts).toHaveLength(500);
    sweep('short-generated', '500-drafts', 'inspectTaskIntentDrafts', drafts);
    sweep('short-generated', '500-drafts', 'inspectBookTasks', store.inspectBookTasks(bookId, () => null));
    const first = taskPlanOutbound(drafts) as typeof drafts;
    expectNonEmptyPages(first.listPages);
    let wire = first;
    while (wire.listPages?.drafts?.nextOrdinal != null) {
      const meta = wire.listPages.drafts;
      const page = store.getTaskPlanPage({ bookId, kind: 'task-intent-drafts', ref: null, path: 'drafts', afterOrdinal: meta.nextOrdinal!, digest: meta.digest });
      expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
      wire = appendTaskPlanPage(wire, page);
    }
    expect(wire.drafts).toEqual(drafts.drafts);
    expect(wire.listPages!.drafts!.shown).toBe(500);
    // One more save moves the list (the newest leads, the oldest leaves the read): the earlier snapshot is refused plainly.
    save(500);
    const stale = first.listPages!.drafts!;
    expect(() => store.getTaskPlanPage({ bookId, kind: 'task-intent-drafts', ref: null, path: 'drafts', afterOrdinal: stale.nextOrdinal!, digest: stale.digest }))
      .toThrow(/任务草稿已变化/u);
  } finally { store.close(); await roots.dispose(); }
}, 120_000);

it('admits a page read only of a declared kind, naming its Task unless it reads a Book-wide list', () => {
  const frame = (input: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify({ id: ID, op: 'getTaskPlanPage', input }));
  const read = { bookId: ID, kind: 'baseline-analysis', ref: ID, path: 'technical.0.value', afterOrdinal: 0, digest: 'a'.repeat(64) };
  expect(decodeRequest(frame(read))).toEqual({ id: ID, op: 'getTaskPlanPage', input: read });
  for (const bookWide of [{ kind: 'task-intent-drafts', path: 'drafts' }, { kind: 'review-run', path: 'scopeOptions.chapters.chapters' }]) {
    expect(decodeRequest(frame({ ...read, ...bookWide, ref: null })).op).toBe('getTaskPlanPage');
  }
  for (const refused of [{ ...read, ref: null }, { ...read, kind: 'review-run', ref: null }, { ...read, kind: 'unknown' },
    { ...read, digest: 'A'.repeat(64) }, { ...read, afterOrdinal: -1 }, { ...read, extra: true }]) {
    expect(() => decodeRequest(frame(refused))).toThrow(ProtocolError);
  }
});

it('keeps sample1 plan and chapter projections byte-identical without additional reads', async () => {
  const roots = await createServiceTestRoots('ai7-short-task-wire-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const book = await importSample1Book(store, roots.codeRoot, '短书回归');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '短书连接');
    let baseline = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
    while (!baseline.done) baseline = store.advanceBaselineAnalysisPreparationWork(baseline.workId!);
    let fixed = store.createTaskAuthorizationPreparationWork(book.bookId, J03_TASK_GOAL, policy);
    while (!fixed.done) fixed = store.advanceTaskAuthorizationPreparationWork(fixed.workId!);
    for (const kind of ['baseline-analysis', 'fixed-task'] as const) {
      const plan = store.inspectTaskPlan({ bookId: book.bookId, kind, ref: null });
      expect(sha256Hex(JSON.stringify(taskPlanWire(plan)))).toBe(sha256Hex(JSON.stringify(plan)));
      expect(taskPlanWire(plan).listPages).toBeUndefined();
      sweep('sample1', `${kind}/prepared`, 'inspectTaskPlan', plan);
    }
    const review = store.inspectReviewWorkspace(book.bookId, null);
    expect(sha256Hex(JSON.stringify(taskPlanOutbound(review)))).toBe(sha256Hex(JSON.stringify(review)));
  } finally { store.close(); await roots.dispose(); }
}, 60_000);

