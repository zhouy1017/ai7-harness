import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { parseReviewCategoryUnitMessageHeader, parseReviewCrossChapterMessage, REVIEW_CROSS_CHAPTER_RESULT_SCHEMA } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BookDeliveryPackages } from '../../src/service/book-delivery-packages.js';
import { CapturedProcedures, PROCEDURE_STEP_NOT_CHOSEN } from '../../src/service/captured-procedures.js';
import { mergeBooks } from '../../src/service/database-merge.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { BASELINE_ANALYSIS_TASK_GOAL, MAX_FRAME_BYTES, type LaunchPolicyProjection, type ReviewRunProjection, type ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { LITERARY_EXPRESSION, STYLE_AND_FORMAT } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { makeJ13Series } from '../support/series-consistency.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for 可复用工序 (Issue #65, plan slice S30; ADR 0087): the real store on a temporary Agent Data
// Root, exact `sample1` imported through the supported path into two Books, the baseline and the Review Run drive loop over the
// authored review fixture. A finished Review Run is captured, validated, enabled and run as an ordinary Review Run in the
// other Book, pinned; 停用 keeps that pin; a Developer Capability Proposal is saved and written to a file. Nothing here calls a
// Provider: every model turn is the local deterministic adapter's.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const STYLE = STYLE_AND_FORMAT.categoryId;
const LITERARY = LITERARY_EXPRESSION.categoryId;
const PLOT = 'plot-consistency';
const SERIES = 'series-consistency';

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-captured-procedures-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

interface Session {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly driver: ReviewRunDriver;
  readonly capture?: ReturnType<typeof capturedOrdinaryExecution>;
}

/** The one owner, refusing its first hand-off as a launch without a route would: that category fails, the rest go on. */
class RefusingFirstDispatch implements ReviewRunExecutionOwner {
  readonly #inner: BaselineAnalysisExecutionOwner;
  #refused = false;

  constructor(inner: BaselineAnalysisExecutionOwner) {
    this.#inner = inner;
  }

  admitAndDispatch(runRecordId: string, ledger: BaselineAnalysisStore): void {
    if (!this.#refused) {
      this.#refused = true;
      throw Object.assign(new Error('没有可执行的本地确定性路由。'), { code: 'EXECUTION_ROUTE_ABSENT' });
    }
    this.#inner.admitAndDispatch(runRecordId, ledger);
  }

  whenPlaceFree(): Promise<void> {
    return this.#inner.whenPlaceFree();
  }

  whenDone(runRecordId: string): Promise<void> {
    return this.#inner.whenDone(runRecordId);
  }
}

async function open(wrap?: (inner: BaselineAnalysisExecutionOwner) => ReviewRunExecutionOwner, dataRoot: string = roots.dataRoot): Promise<Session> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-cross-chapter-authored');
  const store = await EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  return { store, owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, wrap === undefined ? owner : wrap(owner)) };
}

async function close(session: Session): Promise<void> {
  const stopped = session.driver.dispose();
  await session.owner.dispose();
  await stopped;
  try { session.capture?.assertMatched(); session.store.markCleanShutdown(); } finally { session.store.close(); }
}

async function importBook(session: Session, title: string, connection = true): Promise<string> {
  await requireExactSample1(roots.codeRoot);
  const imported = await importSample1Book(session.store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(session.store, imported.bookId);
  if (connection) recordMissingCredentialConnection(session.store, 'L2 主编辑连接');
  return imported.bookId;
}

async function runBaseline(session: Session, bookId: string): Promise<void> {
  let progress = session.store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = session.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = session.store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  session.owner.admitAndDispatch(authorized.dispatchRunRecordId!);
  await session.owner.whenIdle();
  expect(session.store.inspectBaselineAnalysis(bookId).state).toBe('settled');
}

function prepare(session: Session, bookId: string, categoryIds: ReadonlyArray<string>, scope: ReviewRunScopeRequest = WHOLE,
  capturedProcedure: { versionId: string; documentSha256: string } | null = null): ReviewRunProjection {
  let progress = session.store.createReviewRunPreparationWork(bookId, categoryIds, scope, launchPolicy, capturedProcedure);
  while (!progress.done) progress = session.store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!;
}

function approvals(run: ReviewRunProjection): Array<{ categoryId: string; planEnvelopeDigest: string }> {
  return run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! }));
}

async function authorizeAndDrive(session: Session, bookId: string, run: ReviewRunProjection): Promise<ReviewRunProjection> {
  session.store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
  await session.driver.drive(run.reviewRunId);
  return session.store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

async function captureReview(session: Session, title: string) {
  const { store } = session;
  const source = await importBook(session, title);
  const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
  const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId,
    categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
  return { source, saved, versionId: saved.versions[0]!.versionId };
}

function useLedger<T>(use: (db: DatabaseSync) => T, readOnly = true): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try { return use(db); } finally { db.close(); }
}

describe('可复用工序 over the real store (ADR 0087)', () => {
  describe('capture, validation and reuse of a finished Run', () => {
    let session: Session;
    let source: string;
    let prepared: ReviewRunProjection;
    let store: EditorialStore;
    beforeEach(async () => {
      session = await open();
      store = session.store;
      source = await importBook(session, 'L2 来源书');
      await runBaseline(session, source);
      prepared = prepare(session, source, [LITERARY, PLOT, STYLE]);
    });
    afterEach(async () => { await close(session); });
    const finish = () => authorizeAndDrive(session, source, prepared);
    const save = (finished: ReviewRunProjection) => store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId,
      categoryIds: [PLOT, STYLE], scopeSlot: 'whole', title: '线索与体例复核', procedureId: null });
    it('refuses to capture a Run before it has been authorized', async () => {
      expect(prepared.capture).toEqual({ available: false, unavailableReason: '这次审阅还没有开始；审阅完成后才能保存为可复用工序。' });
      expect(store.inspectProcedureCapture(source, prepared.reviewRunId).available).toBe(false);
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: prepared.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_SOURCE_INELIGIBLE');
    });
    it('offers the settled categories and recommends a captured procedure', async () => {
      const finished = await finish();
      expect(finished.state).toBe('settled');
      expect(finished.procedure).toBeNull();
      expect(finished.capture).toEqual({ available: true, unavailableReason: null });
      const capture = store.inspectProcedureCapture(source, finished.reviewRunId);
      expect(capture).toMatchObject({ available: true, runLabel: '第 1 次审阅', scopeSlot: 'whole', sourceScopeLabel: '全书', procedures: [] });
      expect(capture.steps.map((step) => [step.categoryId, step.eligible, step.model, step.output])).toEqual([
        [STYLE, true, true, 'annotation'], [PLOT, true, true, 'annotation'], [LITERARY, true, true, 'change-suggestion'],
      ]);
      expect(capture.classification).toEqual({
        recommended: 'captured-procedure',
        alternatives: [
          { kind: 'developer-proposal', available: true }, { kind: 'skill-draft', available: false },
          { kind: 'workflow-draft', available: false }, { kind: 'default-rule', available: false },
        ],
      });
    });
    it('refuses an invalid title or a step absent from the source Run', async () => {
      const finished = await finish();
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: ' 空格 ', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_TITLE_INVALID');
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: ['academic-integrity'], scopeSlot: 'whole', title: '引用', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_STEPS_INVALID');
    });
    it('saves ordered steps and provenance outside the reusable document', async () => {
      const finished = await finish();
      const saved = save(finished);
      const first = saved.versions[0]!;
      expect(saved).toMatchObject({ title: '线索与体例复核', versionCount: 1, runnable: false });
      expect(first).toMatchObject({ version: 1, state: 'pending-validation', stateLabel: '待验证', scopeSlot: 'whole', runCount: 0, validationProblems: [] });
      expect(first.steps.map((step) => step.categoryId)).toEqual([STYLE, PLOT]);
      expect(first.source).toEqual({ bookId: source, bookTitle: 'L2 来源书', reviewRunId: finished.reviewRunId, runLabel: '第 1 次审阅' });
      expect(first.technical.previousDocumentSha256).toBeNull();
      useLedger((db) => {
        const stored = new CapturedProcedures(db).version(first.versionId)!;
        expect(Object.keys(stored.document).sort()).toEqual(['authorityCeiling', 'parameters', 'runAs', 'schema', 'steps', 'title']);
        expect(stored.document).toMatchObject({
          schema: 'ai7.captured-procedure/1', title: '线索与体例复核', runAs: 'review-run', parameters: { scope: 'whole' },
          authorityCeiling: { runSourceScope: 'current-book', outputs: ['annotation'], model: true, searchEngine: false,
            steps: [{ categoryId: STYLE, executor: 'review-category-contract' }, { categoryId: PLOT, executor: 'review-category-contract' }] },
        });
        for (const forbidden of [source, finished.reviewRunId, 'L2 来源书', finished.manuscript.revisionId, 'clauses', 'guideline']) {
          expect(JSON.stringify(stored.document).includes(forbidden)).toBe(false);
        }
        expect([stored.sourceBookId, stored.sourceReviewRunId]).toEqual([source, finished.reviewRunId]);
        expect(stored.documentSha256).toBe(first.technical.documentSha256);
      });
    });
    it('enables only against the current validation preview', async () => {
      const saved = save(await finish());
      const first = saved.versions[0]!;
      const preview = store.previewCapturedProcedureValidation(first!.versionId);
      expect(preview).toMatchObject({ passes: true, problems: [], scopeSlot: 'whole', state: 'pending-validation' });
      expect(preview.steps.find((step) => step.categoryId === STYLE)!.guidelines).toEqual([{ title: '体例条款', issuer: 'AI7 内置默认', version: '1', sourceVersion: '1' }]);
      expect(refusal(() => store.enableCapturedProcedure(first!.versionId, '0'.repeat(64)))).toBe('CAPTURED_PROCEDURE_PREVIEW_STALE');
      const enabled = store.enableCapturedProcedure(first!.versionId, preview.previewDigest);
      expect(enabled).toMatchObject({ runnable: true, versions: [{ state: 'enabled', stateLabel: '已启用' }] });
      expect(refusal(() => store.enableCapturedProcedure(first!.versionId, store.previewCapturedProcedureValidation(first!.versionId).previewDigest)))
        .toBe('CAPTURED_PROCEDURE_ALREADY_ENABLED');
    });
    describe('an enabled version in another Book', () => {
      let finished: ReviewRunProjection;
      let saved: ReturnType<EditorialStore['saveCapturedProcedure']>;
      let first: (typeof saved.versions)[number];
      let target: string;
      let pin: { versionId: string; documentSha256: string };
      beforeEach(async () => {
        finished = await finish();
        saved = save(finished);
        first = saved.versions[0]!;
        store.enableCapturedProcedure(first.versionId, store.previewCapturedProcedureValidation(first.versionId).previewDigest);
        target = await importBook(session, 'L2 第二本书', false);
        pin = { versionId: first.versionId, documentSha256: first.technical.documentSha256 };
      });
      it('resolves its exact steps and refuses a changed pin, scope or mandatory step', async () => {
        const run = store.inspectCapturedProcedureRun(target, saved.procedureId);
        expect(run.unavailableReason).toBeNull();
        expect(run.resolved).toMatchObject({ versionId: first!.versionId, version: 1, scopeSlot: 'whole', guidelineChanges: [] });
        expect(run.resolved!.steps).toEqual([
          { categoryId: STYLE, label: '体例与格式', available: true, unavailableReason: null, chosenApart: false },
          { categoryId: PLOT, label: '情节逻辑与前后一致', available: true, unavailableReason: null, chosenApart: false },
        ]);
        expect(refusal(() => prepare(session, target, [STYLE, LITERARY], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STEPS_INVALID');
        expect(refusal(() => prepare(session, target, [STYLE], { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null }, pin))).toBe('REVIEW_PROCEDURE_SCOPE_INVALID');
        expect(refusal(() => prepare(session, target, [STYLE], WHOLE, { ...pin, documentSha256: '0'.repeat(64) }))).toBe('REVIEW_PROCEDURE_STALE');
        const inSource = store.inspectCapturedProcedureRun(source, saved.procedureId);
        expect(inSource.resolved!.steps.every((step) => step.available)).toBe(true);
        expect(refusal(() => prepare(session, source, [STYLE], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STEP_SKIPPED');
      });
      it('offers the procedure and drives an ordinary Review Run under its pin', async () => {
        expect(store.inspectCapturedProcedureApplicability(target)).toEqual({
          bookId: target, truncated: false,
          procedures: [{
            procedureId: saved.procedureId, title: '线索与体例复核', latestEligible: { versionId: first!.versionId, version: 1 }, fit: 'all',
            stepCount: 2, availableCount: 2, chosenApart: [], chosenApartSteps: [], leftOut: [],
          }],
        });
        expect(store.inspectCapturedProcedureApplicability(source).procedures).toEqual([expect.objectContaining({ fit: 'all', stepCount: 2, availableCount: 2, leftOut: [] })]);
        expect(refusal(() => store.inspectCapturedProcedureApplicability('book'))).toBe('BOOK_INVALID');
        expect(first!.steps.map((step) => step.requirement)).toEqual([null, null]);
        const pinned = prepare(session, target, [STYLE, PLOT], WHOLE, pin);
        expect(pinned.procedure).toEqual({
          procedureId: saved.procedureId, versionId: first!.versionId, version: 1, title: '线索与体例复核', documentSha256: pin.documentSha256, stopped: false, missing: false,
          leftOut: [],
        });
        const ran = await authorizeAndDrive(session, target, pinned);
        expect(ran.state).toBe('settled');
        expect(ran.categories.map((category) => category.categoryId)).toEqual([STYLE, PLOT]);
      });
      it('chains a new capture while continuing to resolve the enabled version', async () => {
        const second = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'chapters', title: '体例与表达复核', procedureId: saved.procedureId });
        expect(second.versions.map((version) => [version.version, version.state])).toEqual([[2, 'pending-validation'], [1, 'enabled']]);
        expect(second.versions[0]!.technical.previousDocumentSha256).toBe(first!.technical.documentSha256);
        expect(second.title).toBe('体例与表达复核');
        expect(store.inspectCapturedProcedureRun(target, saved.procedureId).resolved!.version).toBe(1);
        expect(store.inspectCapturedProcedures().procedures[0]).toMatchObject({ versionCount: 2, latestVersion: 2, latestState: 'pending-validation', runnable: true });
      });
      it('stops new uses while keeping finished and prepared Runs pinned', async () => {
        const ran = await authorizeAndDrive(session, target, prepare(session, target, [STYLE, PLOT], WHOLE, pin));
        expect(store.inspectCapturedProcedure(saved.procedureId, null).versions[0]).toMatchObject({ runCount: 1,
          runs: [{ bookId: target, bookTitle: 'L2 第二本书', label: '第 1 次' }] });
        store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY],
          scopeSlot: 'chapters', title: '体例与表达复核', procedureId: saved.procedureId });
        const waiting = prepare(session, target, [STYLE, PLOT], WHOLE, pin);
        const stopped = store.stopCapturedProcedure(saved.procedureId, first!.versionId, store.previewCapturedProcedureStop(saved.procedureId, first!.versionId).previewDigest);
        expect(stopped.versions.map((version) => [version.version, version.state])).toEqual([[2, 'pending-validation'], [1, 'stopped']]);
        expect(stopped.runnable).toBe(false);
        expect(store.inspectCapturedProcedureApplicability(target).procedures).toEqual([]);
        expect(refusal(() => store.authorizeReviewRun(target, waiting.reviewRunId, approvals(waiting)))).toBe('REVIEW_PROCEDURE_STOPPED');
        expect(store.inspectReviewWorkspace(target, waiting.reviewRunId).run!.procedure!.stopped).toBe(true);
        expect(store.inspectReviewWorkspace(target, ran.reviewRunId).run!.procedure).toMatchObject({ versionId: first!.versionId, stopped: true });
        expect(refusal(() => store.enableCapturedProcedure(first!.versionId, store.previewCapturedProcedureValidation(first!.versionId).previewDigest)))
          .toBe('CAPTURED_PROCEDURE_STOPPED');
        expect(store.inspectCapturedProcedureRun(target, saved.procedureId)).toMatchObject({
          resolved: null, unavailableReason: '这个工序还没有启用的版本；先在知识库「工序与规则」里验证并启用。',
        });
        expect(refusal(() => prepare(session, target, [STYLE], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STALE');
        expect(store.stopCapturedProcedure(saved.procedureId, null, store.previewCapturedProcedureStop(saved.procedureId, null).previewDigest).versions
          .map((version) => version.state)).toEqual(['stopped', 'stopped']);
        expect(store.inspectCapturedProcedure(saved.procedureId, null).versions).toHaveLength(2);
        expect(store.inspectDataVersion().schemaRevision).toBe(LATEST_SCHEMA_VERSION);
      });
    });
  });

  describe('capture integrity and developer proposals', () => {
    let session: Session;
    let store: EditorialStore;
    beforeEach(async () => { session = await open(); store = session.store; });
    afterEach(async () => { await close(session); });
    it('discloses today\'s guideline versions against the source Run and refuses an enable confirmed against an older preview', async () => {
      const { source, saved, versionId } = await captureReview(session, 'L2 规范变化');
      const before = store.previewCapturedProcedureValidation(versionId);
      const file = join(roots.inputRoot, 'style.txt');
      writeFileSync(file, '1. 标题层级按本社体例统一。\n2. 数字写法全书一致。');
      const guideline = await store.previewReviewGuidelineVersion('ai7-builtin/style-and-format', file);
      store.importReviewGuidelineVersion(guideline.previewId);
      const after = store.previewCapturedProcedureValidation(versionId);
      expect(after.passes).toBe(true);
      expect(after.steps[0]!.guidelines).toEqual([{ title: '体例条款', issuer: '本社', version: '2', sourceVersion: '1' }]);
      expect(after.previewDigest).not.toBe(before.previewDigest);
      expect(refusal(() => store.enableCapturedProcedure(versionId, before.previewDigest))).toBe('CAPTURED_PROCEDURE_PREVIEW_STALE');
      store.enableCapturedProcedure(versionId, after.previewDigest);
      expect(store.inspectCapturedProcedureRun(source, saved.procedureId).resolved!.guidelineChanges).toEqual([
        { categoryId: STYLE, label: '体例与格式', title: '体例条款', sourceVersion: '1', version: '2' },
      ]);
    });

    it('refuses a version whose document was altered behind the ledger, whatever digest it was given', async () => {
      const { source, saved, versionId } = await captureReview(session, 'L2 验证失败');
      // A document altered behind the ledger's back — even with a matching document digest — no longer matches its version record.
      useLedger((db) => {
        db.exec('DROP TRIGGER captured_procedure_versions_no_update');
        const original = canonicalJson(new CapturedProcedures(db).version(versionId)!.document);
        const altered = original.replace('"procedureId":"ai7-review-procedure/style-and-format","version":"2"', '"procedureId":"ai7-review-procedure/style-and-format","version":"9"');
        expect(altered).not.toBe(original);
        db.prepare('UPDATE captured_procedure_versions SET document_json = ?, document_sha256 = ? WHERE version_id = ?')
          .run(altered, sha256Hex(altered), versionId);
      }, false);
      expect(refusal(() => store.previewCapturedProcedureValidation(versionId))).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
      expect(refusal(() => store.inspectCapturedProcedureRun(source, saved.procedureId))).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
      expect(refusal(() => store.inspectCapturedProcedures())).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
    });

    it('refuses a Developer Capability Proposal without its missing capability, or as the next version of none', async () => {
      expect(refusal(() => store.saveDeveloperProposal({ proposalId: null, title: '空', missingCapability: '  ', affectedProcedure: '', direction: '', pluginCandidate: '' })))
        .toBe('DEVELOPER_PROPOSAL_INVALID');
      expect(refusal(() => store.saveDeveloperProposal({ proposalId: '00000000-0000-4000-8000-000000000000', title: '图注核对', missingCapability: '核对图注。', affectedProcedure: '', direction: '', pluginCandidate: '' })))
        .toBe('DEVELOPER_PROPOSAL_NOT_FOUND');
      expect(store.inspectCapturedProcedures()).toEqual({ procedures: [], proceduresTruncated: false, proposals: [], proposalsTruncated: false });
    });

    it('writes a proposal version to the file the editor chose and records the file, never sending it', async () => {
      const proposal = store.saveDeveloperProposal({
        proposalId: null, title: '图注核对', missingCapability: '核对图注与正文图号是否一致。', affectedProcedure: '体例与格式', direction: '读取图片的说明文字。', pluginCandidate: '',
      });
      const revised = store.saveDeveloperProposal({
        proposalId: proposal.proposalId, title: '图注核对', missingCapability: '核对图注与正文图号是否一致。', affectedProcedure: '体例与格式', direction: '先读取图片标题，再与正文对照。', pluginCandidate: '图片说明读取插件',
      });
      expect(revised.versions.map((version) => version.version)).toEqual([2, 1]);
      const destination = join(roots.inputRoot, '开发建议.md');
      const written = await store.writeDeveloperProposalFile(revised.versions[0]!.proposalVersionId, destination);
      expect(written.versions[0]!.files).toEqual([{ fileName: '开发建议.md', writtenAt: expect.any(String) }]);
      expect(written.versions[0]!.fileCount).toBe(1);
      expect(store.inspectDeveloperProposalVersion(revised.versions[0]!.proposalVersionId)).toMatchObject({ version: 2, pluginCandidate: '图片说明读取插件', fileCount: 1 });
      const text = readFileSync(destination, 'utf8');
      expect(text.startsWith('# 开发建议：图注核对\n')).toBe(true);
      expect(text.includes('图片说明读取插件')).toBe(true);
      expect(text.includes('AI7 不会发送这份开发建议')).toBe(true);
      expect(text.includes(revised.versions[0]!.technical.sha256)).toBe(true);
      expect(store.inspectCapturedProcedures().proposals[0]).toMatchObject({ title: '图注核对', versionCount: 2, latestVersion: 2 });
      expect(store.inspectDeveloperProposal(proposal.proposalId, 2).versions.map((version) => version.version)).toEqual([1]);
      await expect(store.writeDeveloperProposalFile(revised.versions[0]!.proposalVersionId, 'relative.md')).rejects.toMatchObject({ code: 'DEVELOPER_PROPOSAL_DESTINATION_INVALID' });
    });
  });

  it('captures a partial Run only from the categories it settled, refusing the one that failed', async () => {
    const session = await open((inner) => new RefusingFirstDispatch(inner));
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 部分完成');
      // 体例与格式's dispatch is refused, so that category fails and the Run ends 部分完成 with nothing to continue.
      const partial = await authorizeAndDrive(session, source, prepare(session, source, [STYLE, LITERARY]));
      expect([partial.state, partial.canContinue]).toEqual(['partial', false]);
      expect(partial.capture.available).toBe(true);
      const capture = store.inspectProcedureCapture(source, partial.reviewRunId);
      expect(capture.steps.map((step) => [step.categoryId, step.eligible])).toEqual([[STYLE, false], [LITERARY, true]]);
      expect(capture.steps[0]!.excludedReason).toBe('这一类在这次审阅中没有完成（运行失败），不会保存。');
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: partial.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'whole', title: '表达', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_STEP_INELIGIBLE');
      expect(store.saveCapturedProcedure({ bookId: source, reviewRunId: partial.reviewRunId, categoryIds: [LITERARY], scopeSlot: 'whole', title: '表达', procedureId: null }).versionCount).toBe(1);
    } finally {
      await close(session);
    }
  });
});

const wireBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('exact procedure versions (Issue #66, plan slice S31; UI ADR 0013; REUSE-031, REUSE-038 to REUSE-045, REUSE-054)', () => {
  let session: Session;
  let store: EditorialStore;
  let source: string, target: string, procedureId: string, v1: string, v2: string, v3: string;
  let latest: ReturnType<EditorialStore['inspectCapturedProcedureRun']>;
  let pinOne: { versionId: string; documentSha256: string };
  let ranOne: ReviewRunProjection, waiting: ReviewRunProjection, waitingSource: ReviewRunProjection;
  beforeEach(async () => {
    session = await open();
    store = session.store;
    source = await importBook(session, 'L2 版本来源');
    const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE, LITERARY]));
    const enable = (versionId: string): void => {
      store.enableCapturedProcedure(versionId, store.previewCapturedProcedureValidation(versionId).previewDigest);
    };
    const one = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
    procedureId = one.procedureId;
    v1 = one.versions[0]!.versionId;
    enable(v1);
    v2 = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'whole', title: '体例复核', procedureId }).versions[0]!.versionId;
    enable(v2);

    v3 = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [LITERARY], scopeSlot: 'whole', title: '体例复核', procedureId }).versions[0]!.versionId;
    target = await importBook(session, 'L2 版本目标', false);
    latest = store.inspectCapturedProcedureRun(target, procedureId);
    pinOne = { versionId: v1, documentSha256: store.inspectCapturedProcedureRun(target, procedureId, v1).resolved!.documentSha256 };
    ranOne = await authorizeAndDrive(session, target, prepare(session, target, [STYLE], WHOLE, pinOne));
    waiting = prepare(session, target, [STYLE], WHOLE, pinOne);
    waitingSource = prepare(session, source, [STYLE], WHOLE, pinOne);
  });
  afterEach(async () => { await close(session); });
  const stopFirst = () => {
    const preview = store.previewCapturedProcedureStop(procedureId, v1);
    return { preview, stopped: store.stopCapturedProcedure(procedureId, v1, preview.previewDigest) };
  };
  it('resolves eligible versions and allows an exact older version to be chosen', async () => {
    expect(latest.resolved).toMatchObject({ versionId: v2, version: 2, latestEligible: true });
    expect(latest.eligibleVersions).toEqual([{ versionId: v2, version: 2 }, { versionId: v1, version: 1 }]);
    expect(latest.passedOver).toEqual([{ version: 3, reason: '这一版还没有验证并启用。' }]);
    expect(store.inspectCapturedProcedure(procedureId, null).latestEligibleVersionId).toBe(v2);
    const older = store.inspectCapturedProcedureRun(target, procedureId, v1);
    expect(older.resolved).toMatchObject({ versionId: v1, version: 1, latestEligible: false });
    expect(older.resolved!.steps.map((step) => step.categoryId)).toEqual([STYLE]);
    expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, v3))).toBe('REVIEW_PROCEDURE_VERSION_INELIGIBLE');
    expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, '00000000-0000-4000-8000-000000000000'))).toBe('CAPTURED_PROCEDURE_NOT_FOUND');
  });
  it('links finished work to its chosen version and refuses another version digest', async () => {
    expect(ranOne.procedure).toMatchObject({ versionId: v1, version: 1 });
    const page = store.inspectCapturedProcedure(procedureId, null);
    expect(page.versions.find((version) => version.versionId === v1)!.runs.filter((run) => run.reviewRunId === ranOne.reviewRunId)).toEqual([
      { bookId: target, bookTitle: 'L2 版本目标', reviewRunId: ranOne.reviewRunId, label: '第 1 次', createdAt: expect.any(String), stateLabel: '已完成' },
    ]);
    expect(refusal(() => prepare(session, target, [STYLE], WHOLE, { versionId: v1, documentSha256: latest.resolved!.documentSha256 }))).toBe('REVIEW_PROCEDURE_STALE');
    expect(waiting.procedure).toMatchObject({ versionId: v1, stopped: false });
  });
  it('previews the prepared Runs affected by stopping one version', async () => {
    const preview = store.previewCapturedProcedureStop(procedureId, v1);
    expect(preview).toMatchObject({ procedureId, title: '体例复核', versionId: v1, afterVersion: 2 });
    expect(preview.versions).toEqual([{
      versionId: v1, version: 1, stateLabel: '已启用', runCount: 1, preparedCount: 2, activeCount: 0, active: [],
      prepared: [
        { bookId: source, bookTitle: 'L2 版本来源', reviewRunId: waitingSource.reviewRunId, label: '第 2 次', stateLabel: '计划已冻结 · 待授权' },
        { bookId: target, bookTitle: 'L2 版本目标', reviewRunId: waiting.reviewRunId, label: '第 2 次', stateLabel: '计划已冻结 · 待授权' },
      ],
    }]);
  });
  it('refuses a stop preview after prepared work is superseded or added', async () => {
    const preview = store.previewCapturedProcedureStop(procedureId, v1);
    prepare(session, target, [STYLE]);
    expect(store.previewCapturedProcedureStop(procedureId, v1).versions[0]!.prepared.map((run) => run.reviewRunId)).toEqual([waitingSource.reviewRunId]);
    expect(refusal(() => store.stopCapturedProcedure(procedureId, v1, preview.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
    const newer = prepare(session, target, [STYLE], WHOLE, pinOne);
    expect(refusal(() => store.stopCapturedProcedure(procedureId, v1, preview.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
    expect(store.inspectCapturedProcedure(procedureId, null).versions.find((version) => version.versionId === v1)!.state).toBe('enabled');
  });
  it('stops prepared uses and preserves finished history under the stopped version', async () => {
    const preview = store.previewCapturedProcedureStop(procedureId, v1);
    prepare(session, target, [STYLE]);
    const newer = prepare(session, target, [STYLE], WHOLE, pinOne);
    const again = store.previewCapturedProcedureStop(procedureId, v1);
    expect(again.versions[0]!.prepared.map((run) => run.reviewRunId)).toEqual([newer.reviewRunId, waitingSource.reviewRunId]);
    expect(again.previewDigest).not.toBe(preview.previewDigest);
    const stopped = store.stopCapturedProcedure(procedureId, v1, again.previewDigest);
    expect(stopped.versions.map((version) => [version.version, version.state])).toEqual([[3, 'pending-validation'], [2, 'enabled'], [1, 'stopped']]);
    expect(stopped.latestEligibleVersionId).toBe(v2);
    expect(refusal(() => store.authorizeReviewRun(target, newer.reviewRunId, approvals(newer)))).toBe('REVIEW_PROCEDURE_STOPPED');
    expect(refusal(() => store.authorizeReviewRun(source, waitingSource.reviewRunId, approvals(waitingSource)))).toBe('REVIEW_PROCEDURE_STOPPED');
    expect(store.inspectReviewWorkspace(target, ranOne.reviewRunId).run!.procedure).toMatchObject({ versionId: v1, stopped: true });
    expect(store.inspectCapturedProcedureRun(target, procedureId).eligibleVersions.map((version) => version.version)).toEqual([2]);
    expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, v1))).toBe('REVIEW_PROCEDURE_VERSION_INELIGIBLE');
    expect(refusal(() => store.previewCapturedProcedureStop(procedureId, v1))).toBe('CAPTURED_PROCEDURE_STOPPED');
    expect(() => store.previewCapturedProcedureStop(procedureId, v1)).toThrowError('《体例复核》第 1 版已经停用。');
  });
  it('refuses a stop preview after active work finishes and keeps the approved pin', async () => {
    stopFirst();
    const pinTwo = { versionId: v2, documentSha256: latest.resolved!.documentSha256 };
    const runningTwo = prepare(session, target, [STYLE, LITERARY], WHOLE, pinTwo);
    store.authorizeReviewRun(target, runningTwo.reviewRunId, approvals(runningTwo));
    const driving = session.driver.drive(runningTwo.reviewRunId);
    const whileRunning = store.previewCapturedProcedureStop(procedureId, null);
    expect(whileRunning.versions.map((version) => version.version)).toEqual([3, 2]);
    expect(whileRunning.afterVersion).toBeNull();
    const two = whileRunning.versions.find((version) => version.version === 2)!;
    expect([two.preparedCount, two.activeCount, two.active.map((run) => run.reviewRunId)]).toEqual([0, 1, [runningTwo.reviewRunId]]);
    expect(two.active[0]!.stateLabel).toBe('正在审阅');
    await driving;
    expect(refusal(() => store.stopCapturedProcedure(procedureId, null, whileRunning.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
    expect(store.inspectCapturedProcedure(procedureId, null).latestEligibleVersionId).toBe(v2);
    const afterRun = store.previewCapturedProcedureStop(procedureId, null);
    expect(afterRun.versions.find((version) => version.version === 2)).toMatchObject({ activeCount: 0, active: [], runCount: 1 });
    expect(afterRun.versionCount).toBe(2);
    store.stopCapturedProcedure(procedureId, null, afterRun.previewDigest);
    const finishedTwo = store.inspectReviewWorkspace(target, runningTwo.reviewRunId).run!;
    expect(finishedTwo.state).toBe('settled');
    expect(finishedTwo.procedure).toMatchObject({ versionId: v2, stopped: true });
    expect(refusal(() => store.previewCapturedProcedureStop(procedureId, null))).toBe('CAPTURED_PROCEDURE_STOPPED');
    expect(store.inspectCapturedProcedure(procedureId, null).latestEligibleVersionId).toBeNull();
  });
  it('retains all versions and the exact confirmed stop previews in the ledger', async () => {
    const { preview: again } = stopFirst();
    const afterRun = store.previewCapturedProcedureStop(procedureId, null);
    store.stopCapturedProcedure(procedureId, null, afterRun.previewDigest);
    expect(store.inspectCapturedProcedure(procedureId, null).versions).toHaveLength(3);
    useLedger((db) => {
      const states = db.prepare("SELECT canonical_json FROM captured_procedure_states WHERE state = 'stopped' ORDER BY recorded_at").all() as Array<{ canonical_json: string }>;
      expect(states.map((row) => (JSON.parse(row.canonical_json) as { previewDigest: string }).previewDigest))
        .toEqual([again.previewDigest, afterRun.previewDigest, afterRun.previewDigest]);
    });
  });
});

describe('a 停用 that moved, or met a preparation in flight (Issue #66, S31 review P3-1, P3-4)', () => {
  it('refuses a confirmation once a newer version became the one a new use takes, and a preparation that finishes after the 停用', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 停用之后');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE, LITERARY]));
      const one = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'whole', title: '体例', procedureId: null });
      const procedureId = one.procedureId;
      const v1 = one.versions[0]!.versionId;
      store.enableCapturedProcedure(v1, store.previewCapturedProcedureValidation(v1).previewDigest);
      const v2 = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [LITERARY], scopeSlot: 'whole', title: '体例', procedureId }).versions[0]!.versionId;
      // 停用… of version 1 says nothing will run afterwards; version 2 enabled meanwhile changes that, so the preview is stale.
      const before = store.previewCapturedProcedureStop(procedureId, v1);
      expect(before.afterVersion).toBeNull();
      store.enableCapturedProcedure(v2, store.previewCapturedProcedureValidation(v2).previewDigest);
      expect(refusal(() => store.stopCapturedProcedure(procedureId, v1, before.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
      expect(store.inspectCapturedProcedure(procedureId, null).versions.map((version) => version.state)).toEqual(['enabled', 'enabled']);
      const after = store.previewCapturedProcedureStop(procedureId, v1);
      expect(after.afterVersion).toBe(2);
      // A preparation pinned to version 1 still advancing when version 1 is stopped is not written: its preview could not name it.
      const pin = { versionId: v1, documentSha256: store.inspectCapturedProcedureRun(source, procedureId, v1).resolved!.documentSha256 };
      // Two categories: the first step plans one and returns, the Run is written by a later step.
      let progress = store.createReviewRunPreparationWork(source, [STYLE, LITERARY], WHOLE, launchPolicy, pin);
      expect(progress.done).toBe(false);
      store.stopCapturedProcedure(procedureId, v1, store.previewCapturedProcedureStop(procedureId, v1).previewDigest);
      const finish = (): void => {
        while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      };
      expect(refusal(finish)).toBe('REVIEW_PROCEDURE_STALE');
      expect(refusal(() => store.createReviewRunPreparationWork(source, [STYLE, LITERARY], WHOLE, launchPolicy, pin))).toBe('REVIEW_PROCEDURE_STALE');
      // The Book's newest Run is still the finished one: nothing was prepared against the stopped version.
      expect(store.inspectReviewWorkspace(source, null).run!.reviewRunId).toBe(finished.reviewRunId);
      expect(store.inspectCapturedProcedure(procedureId, null).versions.find((version) => version.versionId === v1)).toMatchObject({ runCount: 0, preparedRunCount: 0 });
    } finally {
      await close(session);
    }
  }, 300_000);
});

/**
 * The one owner, holding its `gateAt`-th wait after it is armed until released, as a service stopped between two categories
 * would leave it.
 */
class GatedOwner implements ReviewRunExecutionOwner {
  readonly #inner: BaselineAnalysisExecutionOwner;
  readonly #gateAt: number;
  readonly reached: Promise<void>;
  readonly #gate: Promise<void>;
  #reach: () => void = () => {};
  #release: () => void = () => {};
  #waits = 0;
  #armed = false;

  constructor(inner: BaselineAnalysisExecutionOwner, gateAt: number) {
    this.#inner = inner;
    this.#gateAt = gateAt;
    this.reached = new Promise((resolve) => { this.#reach = resolve; });
    this.#gate = new Promise((resolve) => { this.#release = resolve; });
  }

  admitAndDispatch(runRecordId: string, ledger: BaselineAnalysisStore): void {
    this.#inner.admitAndDispatch(runRecordId, ledger);
  }

  whenPlaceFree(): Promise<void> {
    return this.#wait(() => this.#inner.whenPlaceFree());
  }

  whenDone(runRecordId: string): Promise<void> {
    return this.#wait(() => this.#inner.whenDone(runRecordId));
  }

  arm(): void {
    this.#armed = true;
  }

  async #wait(then: () => Promise<void>): Promise<void> {
    if (this.#armed) this.#waits += 1;
    if (this.#armed && this.#waits === this.#gateAt) {
      this.#reach();
      await this.#gate;
    }
    return then();
  }

  release(): void {
    this.#release();
  }
}

describe('a 停用 while an approved Run is left to continue (Issue #66, S31)', () => {
  it('names the interrupted Run as going on under its version, and 继续审阅 finishes it after the 停用', async () => {
    let gated = null as GatedOwner | null;
    const first = await open((inner) => { gated = new GatedOwner(inner, 3); return gated; });
    let source = '';
    let procedureId = '';
    let versionId = '';
    let reviewRunId = '';
    try {
      const { store } = first;
      source = await importBook(first, 'L2 中断');
      const finished = await authorizeAndDrive(first, source, prepare(first, source, [STYLE, LITERARY]));
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'whole', title: '体例与表达', procedureId: null });
      procedureId = saved.procedureId;
      versionId = saved.versions[0]!.versionId;
      store.enableCapturedProcedure(versionId, store.previewCapturedProcedureValidation(versionId).previewDigest);
      const resolved = store.inspectCapturedProcedureRun(source, procedureId).resolved!;
      const pinned = prepare(first, source, [STYLE, LITERARY], WHOLE, { versionId, documentSha256: resolved.documentSha256 });
      reviewRunId = pinned.reviewRunId;
      store.authorizeReviewRun(source, reviewRunId, approvals(pinned));
      gated!.arm();
      const loop = first.driver.drive(reviewRunId);
      // The first category is on the manuscript; the service stops before the second starts.
      await gated!.reached;
      const stopped = first.driver.dispose();
      gated!.release();
      await stopped;
      await loop;
    } finally {
      await close(first);
    }
    const second = await open();
    try {
      const { store } = second;
      expect(store.inspectReviewWorkspace(source, reviewRunId).run).toMatchObject({ state: 'partial', canContinue: true });
      const preview = store.previewCapturedProcedureStop(procedureId, versionId);
      expect(preview.versions[0]).toMatchObject({ preparedCount: 0, activeCount: 1, runCount: 1 });
      expect(preview.versions[0]!.active).toEqual([{ bookId: source, bookTitle: 'L2 中断', reviewRunId, label: '第 2 次', stateLabel: '部分完成 · 可继续审阅' }]);
      store.stopCapturedProcedure(procedureId, versionId, preview.previewDigest);
      // The 停用 does not move an approved Run: it continues under the version it was approved with, and keeps naming it.
      await second.driver.continue(reviewRunId);
      const done = store.inspectReviewWorkspace(source, reviewRunId).run!;
      expect(done.state).toBe('settled');
      expect(done.procedure).toMatchObject({ versionId, stopped: true });
    } finally {
      await close(second);
    }
  }, 300_000);
});

describe('what 工序与规则 answers stays within one frame (Issue #65 review)', () => {
  let session: Session;
  let store: EditorialStore;
  let source: string, first: string;
  let proposalId: string | null;
  let savedFrameBytes: number[];
  const long = '👨‍👩‍👧‍👦'.repeat(363);
  const title = (index: number): string => `${'👨‍👩‍👧‍👦'.repeat(20)}${String.fromCodePoint(0x4e00 + index)}`;
  beforeEach(async () => {
    session = await open();
    store = session.store;
    source = await importBook(session, 'L2 有界');
    const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
    first = '';
    proposalId = null;
    savedFrameBytes = [];
    for (let index = 0; index < 51; index += 1) {
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: title(index), procedureId: null });
      first ||= saved.procedureId;
      savedFrameBytes.push(wireBytes(saved));
    }
    for (let version = 2; version <= 30; version += 1) {
      const next = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'chapters', title: title(99), procedureId: first });
      savedFrameBytes.push(wireBytes(next));
    }
    for (let version = 1; version <= 25; version += 1) {
      const saved = store.saveDeveloperProposal({ proposalId, title: title(version), missingCapability: long, affectedProcedure: long, direction: long, pluginCandidate: long });
      proposalId = saved.proposalId;
      savedFrameBytes.push(wireBytes(saved));
    }
    for (let index = 0; index < 51; index += 1) {
      store.saveDeveloperProposal({ proposalId: null, title: title(index), missingCapability: long, affectedProcedure: '', direction: '', pluginCandidate: '' });
    }
  });
  afterEach(async () => { await close(session); });
  const walk = <T extends { version: number }>(read: (before: number | null) => { versions: ReadonlyArray<T>; versionsBefore: number | null }): T[] => {
    const seen: T[] = [];
    let before: number | null = null;
    do {
      const page = read(before);
      expect(wireBytes(page)).toBeLessThan(MAX_FRAME_BYTES);
      expect(page.versions.length).toBeGreaterThan(0);
      seen.push(...page.versions);
      before = page.versionsBefore;
    } while (before !== null);
    return seen;
  };
  it('keeps every save response within one frame at the title and field limits', async () => {
    expect(savedFrameBytes).toHaveLength(105);
    for (const size of savedFrameBytes) expect(size).toBeLessThan(MAX_FRAME_BYTES);
  });
  it('refuses a proposal field exceeding the supported bound', async () => {
    expect(() => store.saveDeveloperProposal({ proposalId: null, title: '过长', missingCapability: `${long}字字字字字字字字`, affectedProcedure: '', direction: '', pluginCandidate: '' }))
      .toThrowError('请写明缺少的能力');
  });
  it('lists bounded summaries and discloses truncated procedure applicability', async () => {
    const listed = store.inspectCapturedProcedures();
    expect(listed.procedures).toHaveLength(50);
    expect(listed.proposals).toHaveLength(50);
    expect([listed.proceduresTruncated, listed.proposalsTruncated]).toEqual([true, true]);
    const offered = store.inspectCapturedProcedureApplicability(source);
    expect([offered.procedures, offered.truncated]).toEqual([[], true]);
    expect(wireBytes(offered)).toBeLessThan(MAX_FRAME_BYTES);
    expect(wireBytes(listed)).toBeLessThan(MAX_FRAME_BYTES);
    expect(Object.keys(listed.procedures[0]!).sort()).toEqual(['latestState', 'latestStateLabel', 'latestVersion', 'procedureId', 'runnable', 'title', 'versionCount']);
    expect(Object.keys(listed.proposals[0]!).sort()).toEqual(['latestCreatedAt', 'latestVersion', 'proposalId', 'title', 'versionCount']);
  });
  it('pages every procedure and proposal version within the frame', async () => {
    expect(walk((before) => store.inspectCapturedProcedure(first, before)).map((version) => version.version)).toEqual(Array.from({ length: 30 }, (_, index) => 30 - index));
    expect(walk((before) => store.inspectDeveloperProposal(proposalId!, before)).map((version) => version.version)).toEqual(Array.from({ length: 25 }, (_, index) => 25 - index));
  });
  it('stops every version even when the stop preview can show only a page', async () => {
    const stopAll = store.previewCapturedProcedureStop(first, null);
    expect(wireBytes(stopAll)).toBeLessThan(MAX_FRAME_BYTES);
    expect(stopAll.versionCount).toBe(30);
    expect(stopAll.versions.map((version) => version.version)).toEqual([30, 29, 28, 27, 26]);
    const stoppedAll = store.stopCapturedProcedure(first, null, stopAll.previewDigest);
    expect(wireBytes(stoppedAll)).toBeLessThan(MAX_FRAME_BYTES);
    const versions = walk((before) => store.inspectCapturedProcedure(first, before));
    expect(versions).toHaveLength(30);
    expect(versions.every((version) => version.state === 'stopped')).toBe(true);
  });
});

describe('a Book merged from another house (Issue #65 review)', () => {
  it('brings the pins of its Review Runs by value, and refuses to authorize a prepared Run pinned to a version this house lacks', async () => {
    const otherRoot = join(dirname(roots.dataRoot), 'other-data');
    let target = '';
    let finishedPinned = '';
    let waitingPinned = '';
    const session = await open();
    try {
      const { store } = session;
      const { saved, versionId } = await captureReview(session, 'L2 来源');
      store.enableCapturedProcedure(versionId, store.previewCapturedProcedureValidation(versionId).previewDigest);
      target = await importBook(session, 'L2 合并出去', false);
      const resolved = store.inspectCapturedProcedureRun(target, saved.procedureId).resolved!;
      const pin = { versionId: resolved.versionId, documentSha256: resolved.documentSha256 };
      finishedPinned = (await authorizeAndDrive(session, target, prepare(session, target, [STYLE], WHOLE, pin))).reviewRunId;
      waitingPinned = prepare(session, target, [STYLE], WHOLE, pin).reviewRunId;
    } finally {
      await close(session);
    }
    (await EditorialStore.open(otherRoot, roots.codeRoot)).close();
    const db = new DatabaseSync(join(otherRoot, 'store', 'ai7.sqlite'));
    try {
      db.prepare('ATTACH DATABASE ? AS src').run(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      mergeBooks(db, [target], { source: roots.dataRoot, target: otherRoot });
      db.exec('DETACH DATABASE src');
    } finally {
      db.close();
    }
    const merged = await open(undefined, otherRoot);
    try {
      const { store } = merged;
      expect(store.inspectCapturedProcedures().procedures).toEqual([]);
      expect(store.inspectReviewWorkspace(target, finishedPinned).run!.procedure).toMatchObject({ title: '体例复核', version: 1, missing: true, stopped: false });
      const waiting = store.inspectReviewWorkspace(target, waitingPinned).run!;
      expect(waiting.procedure!.missing).toBe(true);
      expect(refusal(() => store.authorizeReviewRun(target, waitingPinned, approvals(waiting)))).toBe('REVIEW_PROCEDURE_MISSING');
      recordMissingCredentialConnection(store, 'L2 本机连接');
      const again = prepare(merged, target, [STYLE]);
      expect(again.procedure).toBeNull();
    } finally {
      await close(merged);
    }
  }, 300_000);
});

/** Mixed review/Series business assertions use the admitted ordinary route, without a union fixture partition. */
async function openLayered(): Promise<Session> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    const header = parseReviewCategoryUnitMessageHeader(message);
    const content = request.stage === 'units' && header !== null
      ? { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] }
      : request.stage === 'assurance-sampling'
        ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message)
          .map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
        : request.stage === 'cross-unit-reduction' && parseReviewCrossChapterMessage(message) !== null ? { schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [] }
          : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? undefined : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 5 } };
  }, { seriesScopeGuard: (id) => store.seriesScopeGuard(id) });
  launchPolicy = capture.policy;
  return { store, owner: capture.owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, capture.owner), capture };
}

describe('Series material chosen apart, and how each procedure fits a Book (Issue #66, plan slice S31b; REUSE-046, REUSE-049, REUSE-050, REUSE-053)', () => {
  let session: Session;
  let store: EditorialStore;
  let member: string;
  let finished: ReviewRunProjection;
  let saved: ReturnType<EditorialStore['saveCapturedProcedure']>;
  let alone: typeof saved;
  let version: (typeof saved.versions)[number];
  let pin: { versionId: string; documentSha256: string };
  beforeEach(async () => {
    session = await openLayered();
    store = session.store;
    member = await importBook(session, '星河之三');
    makeJ13Series(store, member);
    finished = await authorizeAndDrive(session, member, prepare(session, member, [STYLE, SERIES]));
    saved = store.saveCapturedProcedure({ bookId: member, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, SERIES], scopeSlot: 'whole', title: '书系复核', procedureId: null });
    version = saved.versions[0]!;

    store.enableCapturedProcedure(version.versionId, store.previewCapturedProcedureValidation(version.versionId).previewDigest);
    alone = store.saveCapturedProcedure({ bookId: member, reviewRunId: finished.reviewRunId, categoryIds: [SERIES], scopeSlot: 'whole', title: '只看书系', procedureId: null });
    store.enableCapturedProcedure(alone.versions[0]!.versionId, store.previewCapturedProcedureValidation(alone.versions[0]!.versionId).previewDigest);

    pin = { versionId: version.versionId, documentSha256: version.technical.documentSha256 };
  });
  afterEach(async () => { await close(session); });
  it('offers Series steps as available with an explicit per-Run choice', async () => {
    expect(finished.state).toBe('settled');
    expect(finished.categories.map((category) => [category.categoryId, category.state])).toEqual([[STYLE, 'settled'], [SERIES, 'settled']]);
    expect(version.steps.map((step) => [step.categoryId, step.requirement])).toEqual([[STYLE, null], [SERIES, 'series']]);
    const run = store.inspectCapturedProcedureRun(member, saved.procedureId);
    expect(run.resolved!.steps).toEqual([
      { categoryId: STYLE, label: '体例与格式', available: true, unavailableReason: null, chosenApart: false },
      { categoryId: SERIES, label: '书系一致性', available: true, unavailableReason: null, chosenApart: true },
    ]);
    expect(store.inspectCapturedProcedureApplicability(member)).toEqual({
      bookId: member, truncated: false,
      procedures: [
        { procedureId: alone.procedureId, title: '只看书系', latestEligible: { versionId: alone.versions[0]!.versionId, version: 1 }, fit: 'all', stepCount: 1, availableCount: 1, chosenApart: ['书系一致性'], chosenApartSteps: [{ categoryId: SERIES, label: '书系一致性' }], leftOut: [] },
        { procedureId: saved.procedureId, title: '书系复核', latestEligible: { versionId: version.versionId, version: 1 }, fit: 'all', stepCount: 2, availableCount: 2, chosenApart: ['书系一致性'], chosenApartSteps: [{ categoryId: SERIES, label: '书系一致性' }], leftOut: [] },
      ],
    });
  });
  it('requires mandatory steps while recording Series opt-in and opt-out explicitly', async () => {
    const unchosen = prepare(session, member, [STYLE], WHOLE, pin);
    expect(unchosen.categories.map((category) => category.categoryId)).toEqual([STYLE]);
    expect(unchosen.procedure!.leftOut).toEqual([{ categoryId: SERIES, label: '书系一致性', reason: PROCEDURE_STEP_NOT_CHOSEN, byChoice: true }]);
    const chosen = prepare(session, member, [STYLE, SERIES], WHOLE, pin);
    expect(chosen.categories.map((category) => category.categoryId)).toEqual([STYLE, SERIES]);
    expect(chosen.procedure!.leftOut).toEqual([]);
    expect(refusal(() => prepare(session, member, [SERIES], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STEP_SKIPPED');
  });
  it('leaves unavailable Series steps out with a reason for a Book outside the Series', async () => {
    const outsider = await importBook(session, 'L2 书系外', false);
    const outside = store.inspectCapturedProcedureApplicability(outsider).procedures;
    expect(outside.map((entry) => [entry.title, entry.fit, entry.availableCount, entry.chosenApart, entry.leftOut.map((step) => step.label)])).toEqual([
      ['只看书系', 'none', 0, [], ['书系一致性']], ['书系复核', 'partial', 1, [], ['书系一致性']],
    ]);
    const reason = outside[1]!.leftOut[0]!.reason;
    expect(reason.length).toBeGreaterThan(0);
    expect(store.inspectCapturedProcedureRun(outsider, saved.procedureId).resolved!.steps[1]).toEqual(
      { categoryId: SERIES, label: '书系一致性', available: false, unavailableReason: reason, chosenApart: true });
    const outsideRun = prepare(session, outsider, [STYLE], WHOLE, pin);
    expect(outsideRun.procedure!.leftOut).toEqual([{ categoryId: SERIES, label: '书系一致性', reason, byChoice: false }]);
  });
  it('stops offering a Series-only procedure once it is stopped', async () => {
    store.stopCapturedProcedure(alone.procedureId, null, store.previewCapturedProcedureStop(alone.procedureId, null).previewDigest);
    expect(store.inspectCapturedProcedureApplicability(member).procedures.map((entry) => entry.title)).toEqual(['书系复核']);
  });
});

describe('a procedure whose enabled versions no longer run (Issue #66, S31b review P3-2)', () => {
  it('is still offered on 新建审阅, with no version, and says why when chosen', async () => {
    const session = await open();
    try {
      const { store } = session;
      const { source, saved, versionId } = await captureReview(session, 'L2 不再可用');
      store.enableCapturedProcedure(versionId, store.previewCapturedProcedureValidation(versionId).previewDigest);
      // The enabled version's document now names a 工序 version the configuration no longer has, its digests kept whole: it
      // reads as a version, still 已启用, and no longer validates.
      useLedger((db) => {
        db.exec('DROP TRIGGER captured_procedure_versions_no_update');
        const stored = new CapturedProcedures(db).version(versionId)!;
        const original = canonicalJson(stored.document);
        const row = db.prepare('SELECT canonical_json FROM captured_procedure_versions WHERE version_id = ?').get(versionId) as { canonical_json: string };
        const document = original.replace('"procedureId":"ai7-review-procedure/style-and-format","version":"2"', '"procedureId":"ai7-review-procedure/style-and-format","version":"9"');
        expect(document).not.toBe(original);
        const documentSha256 = sha256Hex(document);
        const record = row.canonical_json.replace(stored.documentSha256, documentSha256);
        db.prepare('UPDATE captured_procedure_versions SET document_json = ?, document_sha256 = ?, canonical_json = ?, sha256 = ? WHERE version_id = ?')
          .run(document, documentSha256, record, sha256Hex(record), versionId);
      }, false);
      expect(store.inspectCapturedProcedure(saved.procedureId, null)).toMatchObject({ runnable: true, latestEligibleVersionId: null, versions: [{ state: 'enabled' }] });
      expect(store.inspectCapturedProcedureApplicability(source)).toEqual({
        bookId: source, truncated: false,
        procedures: [{ procedureId: saved.procedureId, title: '体例复核', latestEligible: null, fit: 'no-version', stepCount: 0, availableCount: 0, chosenApart: [], chosenApartSteps: [], leftOut: [] }],
      });
      expect(store.inspectCapturedProcedureRun(source, saved.procedureId)).toMatchObject({
        resolved: null, unavailableReason: '这个工序启用的各版现在都不能按原样运行；请从一次新的审阅重新保存。',
      });
    } finally {
      await close(session);
    }
  });
});

describe('a version linked to the 图书交付包 that holds its Runs\' reports (Issue #66, plan slice S31b; REUSE-031)', () => {
  type PackageVersion = ReturnType<EditorialStore['prepareBookDeliveryPackage']>['package']['versions'][number];
  let session: Session;
  let store: EditorialStore;
  let book: Awaited<ReturnType<typeof importSample1Book>>;
  let source: ReviewRunProjection, waiting: ReviewRunProjection;
  let saved: ReturnType<EditorialStore['saveCapturedProcedure']>, second: typeof saved;
  let first: (typeof saved.versions)[number];
  let firstPackage: PackageVersion;
  let unpinned: ReturnType<EditorialStore['inspectBookDeliveryPackage']>;
  beforeEach(async () => {
    session = await open();
    store = session.store;
    await requireExactSample1(roots.codeRoot);
    book = await importSample1Book(store, roots.codeRoot, 'L2 交付之书');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    source = await authorizeAndDrive(session, book.bookId, prepare(session, book.bookId, [STYLE]));
    saved = store.saveCapturedProcedure({ bookId: book.bookId, reviewRunId: source.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
    first = saved.versions[0]!;
    store.enableCapturedProcedure(first.versionId, store.previewCapturedProcedureValidation(first.versionId).previewDigest);
    second = store.saveCapturedProcedure({ bookId: book.bookId, reviewRunId: source.reviewRunId, categoryIds: [STYLE], scopeSlot: 'chapters', title: '体例复核', procedureId: saved.procedureId });

    waiting = prepare(session, book.bookId, [STYLE], WHOLE, { versionId: first.versionId, documentSha256: first.technical.documentSha256 });
    store.generateReviewReport(book.bookId, source.reviewRunId);
    const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
    store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
    for (const typeId of ['news-release', 'promotion-article', 'review-article', 'launch-materials', 'marketing-points']) {
      store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true });
    }
    unpinned = store.inspectBookDeliveryPackage(book.bookId);
    firstPackage = store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交出版社存档', expectedContentDigest: unpinned.content.digest }).package.versions[0]!;
  });
  afterEach(async () => { await close(session); });
  async function linkPinnedReport() {
    const pinned = await authorizeAndDrive(session, book.bookId, waiting);
    store.generateReviewReport(book.bookId, pinned.reviewRunId);
    const bundle = store.inspectBookDeliveryPackage(book.bookId);
    const prepared = store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交印厂', expectedContentDigest: bundle.content.digest });
    return { pinned, bundle, prepared, packageVersion: prepared.package.versions[0]! };
  }
  const thirdPackage = () => store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交发行部',
    expectedContentDigest: store.inspectBookDeliveryPackage(book.bookId).content.digest }).package.versions[0]!;
  it('links no package without a report from a Run pinned to that procedure version', async () => {
    expect(store.inspectCapturedProcedure(saved.procedureId, null).versions.map((version) => [version.version, version.packageCount, version.packages])).toEqual([[2, 0, []], [1, 0, []]]);
    expect(unpinned.ready).toBe(true);
    expect(store.inspectCapturedProcedure(saved.procedureId, null).versions[1]!.packages).toEqual([]);
  });
  it('links only the procedure version whose pinned Run has a packaged report', async () => {
    const { pinned, bundle, prepared, packageVersion } = await linkPinnedReport();
    expect(pinned.state).toBe('settled');
    expect(bundle.ready).toBe(true);
    expect(prepared.version).toBe(2);
    const versions = store.inspectCapturedProcedure(saved.procedureId, null).versions;
    expect(versions[1]!.packages).toEqual([{ bookId: book.bookId, bookTitle: 'L2 交付之书', packageVersionId: packageVersion.packageVersionId, version: 2, preparedAt: packageVersion.preparedAt }]);
    expect(versions[1]!.packageCount).toBe(1);
    expect([versions[0]!.version, versions[0]!.packageCount, versions[0]!.packages]).toEqual([2, 0, []]);
    expect(second.versions[0]!.packages).toEqual([]);
  });
  it('orders packages created at the same instant and counts beyond a limited reading', async () => {
    await authorizeAndDrive(session, book.bookId, waiting);
    store.generateReviewReport(book.bookId, waiting.reviewRunId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(firstPackage.preparedAt) + 1_000));
    let latest: PackageVersion;
    try {
      const bundle = store.inspectBookDeliveryPackage(book.bookId);
      const previous = store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交印厂', expectedContentDigest: bundle.content.digest }).package.versions[0]!;
      latest = thirdPackage();
      expect(latest.preparedAt).toBe(previous.preparedAt);
    } finally { vi.useRealTimers(); }
    expect(latest.version).toBe(3);
    const linked = store.inspectCapturedProcedure(saved.procedureId, null).versions[1]!;
    expect([linked.packages.map((link) => link.version), linked.packageCount]).toEqual([[3, 2], 2]);
    useLedger((reader) => {
      const packages = new BookDeliveryPackages(reader, { publication: () => null, documents: () => [], reviewRuns: () => [] });
      expect(packages.holdingReviewRuns([waiting.reviewRunId], 1)).toEqual({
        packages: [{ bookId: book.bookId, packageVersionId: latest.packageVersionId, version: 3, preparedAt: latest.preparedAt }], total: 2,
      });
      expect(packages.holdingReviewRuns([source.reviewRunId], 10).packages.map((link) => link.version)).toEqual([3, 2, 1]);
      expect(packages.holdingReviewRuns([], 10)).toEqual({ packages: [], total: 0 });
    });
  });
  it('keeps procedure pages and stop confirmations readable when package records are damaged', async () => {
    await linkPinnedReport();
    const latest = thirdPackage();
    useLedger((writer) => {
      writer.exec('DROP TRIGGER IF EXISTS book_delivery_package_versions_no_update');
      writer.prepare("UPDATE book_delivery_package_versions SET canonical_json = '{' WHERE package_version_id = ?").run(firstPackage.packageVersionId);
      writer.prepare("UPDATE book_delivery_package_versions SET canonical_json = replace(canonical_json, '交发行部', '改过的用途') WHERE package_version_id = ?")
        .run(latest.packageVersionId);
    }, false);
    const damaged = store.inspectCapturedProcedure(saved.procedureId, null).versions[1]!;
    expect([damaged.packages.map((link) => link.version), damaged.packageCount]).toEqual([[2], 2]);
    // A package that is JSON but holds a string where a report should be (Issue #697): first a report entry, then the whole
    // reviewReports. Neither names a Run and neither fails the page; the 停用 below answers over the second.
    for (const reports of ['["x"]', '"x"']) {
      useLedger((shaped) => {
        shaped.prepare("UPDATE book_delivery_package_versions SET canonical_json = json_object('content', json_object('reviewReports', json(?))) WHERE package_version_id = ?")
          .run(reports, firstPackage.packageVersionId);
      }, false);
      const page = store.inspectCapturedProcedure(saved.procedureId, null).versions[1]!;
      expect([reports, page.packages.map((link) => link.version), page.packageCount]).toEqual([reports, [2], 2]);
    }
    const stopped = store.stopCapturedProcedure(saved.procedureId, first.versionId, store.previewCapturedProcedureStop(saved.procedureId, first.versionId).previewDigest);
    expect(stopped.versions.map((version) => [version.version, version.state])).toEqual([[2, 'pending-validation'], [1, 'stopped']]);
    expect(stopped.versions[1]!.packages.map((link) => link.version)).toEqual([2]);
  });
});
