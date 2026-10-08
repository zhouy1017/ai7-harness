import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL } from '../../src/service/captured-procedures.js';
import { mergeBooks } from '../../src/service/database-merge.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { LEADS_ABSENT_REASON } from '../../src/service/review/review-scope.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { WRITING_TASK_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { BASELINE_ANALYSIS_TASK_GOAL, MAX_FRAME_BYTES, type LaunchPolicyProjection, type ReviewRunProjection, type ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { LITERARY_EXPRESSION, STYLE_AND_FORMAT } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

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
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
  const store = await EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  return { store, owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, wrap === undefined ? owner : wrap(owner)) };
}

async function close(session: Session): Promise<void> {
  const stopped = session.driver.dispose();
  await session.owner.dispose();
  await stopped;
  session.store.markCleanShutdown();
  session.store.close();
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

function database(): DatabaseSync {
  return new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
}

describe('可复用工序 over the real store (ADR 0087)', () => {
  it('captures a finished Review Run, validates and enables it, and runs it as an ordinary Review Run pinned in another Book', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 来源书');
      await runBaseline(session, source);
      const prepared = prepare(session, source, [LITERARY, PLOT, STYLE]);
      // Not yet authorized: nothing to capture, and the Run says why.
      expect(prepared.capture).toEqual({ available: false, unavailableReason: '这次审阅还没有开始；审阅完成后才能保存为可复用工序。' });
      expect(store.inspectProcedureCapture(source, prepared.reviewRunId).available).toBe(false);
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: prepared.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_SOURCE_INELIGIBLE');
      const finished = await authorizeAndDrive(session, source, prepared);
      expect(finished.state).toBe('settled');
      expect(finished.procedure).toBeNull();
      expect(finished.capture).toEqual({ available: true, unavailableReason: null });

      // The source set: every category in the configuration's order, each eligible, and the classification it recommends.
      const capture = store.inspectProcedureCapture(source, finished.reviewRunId);
      expect(capture).toMatchObject({ available: true, runLabel: '第 1 次审阅', scopeSlot: 'whole', sourceScopeLabel: '全书', procedures: [] });
      expect(capture.steps.map((step) => [step.categoryId, step.eligible, step.model, step.output])).toEqual([
        [STYLE, true, true, 'annotation'], [PLOT, true, false, 'annotation'], [LITERARY, true, true, 'change-suggestion'],
      ]);
      expect(capture.classification).toEqual({
        recommended: 'captured-procedure',
        alternatives: [
          { kind: 'developer-proposal', available: true }, { kind: 'skill-draft', available: false },
          { kind: 'workflow-draft', available: false }, { kind: 'default-rule', available: false },
        ],
      });
      // A capture names its steps in any order and keeps the configuration's; a title is a label within its bounds.
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: ' 空格 ', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_TITLE_INVALID');
      expect(refusal(() => store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: ['academic-integrity'], scopeSlot: 'whole', title: '引用', procedureId: null })))
        .toBe('CAPTURED_PROCEDURE_STEPS_INVALID');
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [PLOT, STYLE], scopeSlot: 'whole', title: '线索与体例复核', procedureId: null });
      expect(saved).toMatchObject({ title: '线索与体例复核', versionCount: 1, runnable: false });
      const [first] = saved.versions;
      expect(first).toMatchObject({ version: 1, state: 'pending-validation', stateLabel: '待验证', scopeSlot: 'whole', runCount: 0, validationProblems: [] });
      expect(first!.steps.map((step) => step.categoryId)).toEqual([STYLE, PLOT]);
      expect(first!.source).toEqual({ bookId: source, bookTitle: 'L2 来源书', reviewRunId: finished.reviewRunId, runLabel: '第 1 次审阅' });
      expect(first!.technical.previousDocumentSha256).toBeNull();

      // The document holds nothing of the Book: no Book, Run, title or manuscript words — only its title, steps, slot and ceiling.
      const db = database();
      try {
        const row = db.prepare('SELECT document_json, document_sha256, canonical_json FROM captured_procedure_versions').get() as { document_json: string; document_sha256: string; canonical_json: string };
        const document = JSON.parse(row.document_json) as Record<string, unknown>;
        expect(Object.keys(document).sort()).toEqual(['authorityCeiling', 'parameters', 'runAs', 'schema', 'steps', 'title']);
        expect(document).toMatchObject({
          schema: 'ai7.captured-procedure/1', title: '线索与体例复核', runAs: 'review-run', parameters: { scope: 'whole' },
          authorityCeiling: { runSourceScope: 'current-book', outputs: ['annotation'], model: true, searchEngine: false,
            steps: [{ categoryId: STYLE, executor: 'review-category-contract' }, { categoryId: PLOT, executor: 'baseline-leads' }] },
        });
        for (const forbidden of [source, finished.reviewRunId, 'L2 来源书', finished.manuscript.revisionId, 'clauses', 'guideline']) {
          expect(row.document_json.includes(forbidden)).toBe(false);
        }
        // The provenance is outside the digest, in the version's own record.
        expect(JSON.parse(row.canonical_json).provenance).toEqual({ bookId: source, reviewRunId: finished.reviewRunId, reviewRunOrdinal: 1 });
        expect(row.document_sha256).toBe(first!.technical.documentSha256);
      } finally {
        db.close();
      }

      // 验证并启用…: the preview, confirmed by its digest, enables the version; a stale digest is refused.
      const preview = store.previewCapturedProcedureValidation(first!.versionId);
      expect(preview).toMatchObject({ passes: true, problems: [], scopeSlot: 'whole', state: 'pending-validation' });
      expect(preview.steps.find((step) => step.categoryId === STYLE)!.guidelines).toEqual([{ title: '体例条款', issuer: 'AI7 内置默认', version: '1', sourceVersion: '1' }]);
      expect(refusal(() => store.enableCapturedProcedure(first!.versionId, '0'.repeat(64)))).toBe('CAPTURED_PROCEDURE_PREVIEW_STALE');
      const enabled = store.enableCapturedProcedure(first!.versionId, preview.previewDigest);
      expect(enabled).toMatchObject({ runnable: true, versions: [{ state: 'enabled', stateLabel: '已启用' }] });
      expect(refusal(() => store.enableCapturedProcedure(first!.versionId, store.previewCapturedProcedureValidation(first!.versionId).previewDigest)))
        .toBe('CAPTURED_PROCEDURE_ALREADY_ENABLED');

      // A second Book, with no baseline analysis: the newest enabled version resolves, the leads are left out with why.
      const target = await importBook(session, 'L2 第二本书', false);
      const run = store.inspectCapturedProcedureRun(target, saved.procedureId);
      expect(run.unavailableReason).toBeNull();
      expect(run.resolved).toMatchObject({ versionId: first!.versionId, version: 1, scopeSlot: 'whole', guidelineChanges: [] });
      expect(run.resolved!.steps).toEqual([
        { categoryId: STYLE, label: '体例与格式', available: true, unavailableReason: null },
        { categoryId: PLOT, label: '情节逻辑与前后一致', available: false, unavailableReason: LEADS_ABSENT_REASON },
      ]);
      const pin = { versionId: run.resolved!.versionId, documentSha256: run.resolved!.documentSha256 };
      // Nothing beyond its steps, never a step the Book could take dropped, and the scope its slot says.
      expect(refusal(() => prepare(session, target, [STYLE, LITERARY], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STEPS_INVALID');
      expect(refusal(() => prepare(session, target, [STYLE], { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null }, pin))).toBe('REVIEW_PROCEDURE_SCOPE_INVALID');
      expect(refusal(() => prepare(session, target, [STYLE], WHOLE, { ...pin, documentSha256: '0'.repeat(64) }))).toBe('REVIEW_PROCEDURE_STALE');
      // In the source Book the leads can run: leaving them out there is refused.
      const inSource = store.inspectCapturedProcedureRun(source, saved.procedureId);
      expect(inSource.resolved!.steps.every((step) => step.available)).toBe(true);
      expect(refusal(() => prepare(session, source, [STYLE], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STEP_SKIPPED');
      const pinned = prepare(session, target, [STYLE], WHOLE, pin);
      expect(pinned.procedure).toEqual({
        procedureId: saved.procedureId, versionId: first!.versionId, version: 1, title: '线索与体例复核', documentSha256: pin.documentSha256, stopped: false, missing: false,
        leftOut: [{ categoryId: PLOT, label: '情节逻辑与前后一致', reason: LEADS_ABSENT_REASON }],
      });
      // The ordinary path: its plan, the one approval, the drive.
      const ran = await authorizeAndDrive(session, target, pinned);
      expect(ran.state).toBe('settled');
      expect(ran.categories.map((category) => category.categoryId)).toEqual([STYLE]);

      // A next version from a new capture is chained to the first by its digest, and waits for its own validation.
      const second = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'chapters', title: '体例与表达复核', procedureId: saved.procedureId });
      expect(second.versions.map((version) => [version.version, version.state])).toEqual([[2, 'pending-validation'], [1, 'enabled']]);
      expect(second.versions[0]!.technical.previousDocumentSha256).toBe(first!.technical.documentSha256);
      expect(second.title).toBe('体例与表达复核');
      // An unvalidated newer version is never resolved: the run still takes version 1 (REUSE-044).
      expect(store.inspectCapturedProcedureRun(target, saved.procedureId).resolved!.version).toBe(1);
      expect(store.inspectCapturedProcedures().procedures[0]).toMatchObject({ versionCount: 2, latestVersion: 2, latestState: 'pending-validation', runnable: true });
      expect(store.inspectCapturedProcedure(saved.procedureId, null).versions[1]).toMatchObject({ runCount: 1, runs: [{ bookId: target, bookTitle: 'L2 第二本书', label: '第 1 次' }] });

      // A Run prepared from version 1 and not yet authorized when version 1 is stopped is prepared again, never authorized.
      const waiting = prepare(session, target, [STYLE], WHOLE, pin);
      const stopped = store.stopCapturedProcedure(saved.procedureId, first!.versionId, store.previewCapturedProcedureStop(saved.procedureId, first!.versionId).previewDigest);
      expect(stopped.versions.map((version) => [version.version, version.state])).toEqual([[2, 'pending-validation'], [1, 'stopped']]);
      expect(stopped.runnable).toBe(false);
      expect(refusal(() => store.authorizeReviewRun(target, waiting.reviewRunId, approvals(waiting)))).toBe('REVIEW_PROCEDURE_STOPPED');
      expect(store.inspectReviewWorkspace(target, waiting.reviewRunId).run!.procedure!.stopped).toBe(true);
      // The finished Run keeps naming it, and a stopped version is final.
      expect(store.inspectReviewWorkspace(target, ran.reviewRunId).run!.procedure).toMatchObject({ versionId: first!.versionId, stopped: true });
      expect(refusal(() => store.enableCapturedProcedure(first!.versionId, store.previewCapturedProcedureValidation(first!.versionId).previewDigest)))
        .toBe('CAPTURED_PROCEDURE_STOPPED');
      expect(store.inspectCapturedProcedureRun(target, saved.procedureId)).toMatchObject({
        resolved: null, unavailableReason: '这个工序还没有启用的版本；先在知识库「工序与规则」里验证并启用。',
      });
      expect(refusal(() => prepare(session, target, [STYLE], WHOLE, pin))).toBe('REVIEW_PROCEDURE_STALE');
      // 停用 for all of them stops version 2 too, and nothing is deleted.
      expect(store.stopCapturedProcedure(saved.procedureId, null, store.previewCapturedProcedureStop(saved.procedureId, null).previewDigest).versions
        .map((version) => version.state)).toEqual(['stopped', 'stopped']);
      const check = database();
      try {
        expect((check.prepare('SELECT count(*) n FROM captured_procedure_versions').get() as { n: number }).n).toBe(2);
        expect((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(WRITING_TASK_SCHEMA_VERSION);
      } finally {
        check.close();
      }
    } finally {
      await close(session);
    }
  });

  it('discloses today\'s guideline versions against the source Run and refuses an enable confirmed against an older preview', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 规范变化');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
      const versionId = saved.versions[0]!.versionId;
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
    } finally {
      await close(session);
    }
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

  it('refuses a version whose document was altered behind the ledger, whatever digest it was given', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 验证失败');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
      const versionId = saved.versions[0]!.versionId;
      // A document altered behind the ledger's back — even with a matching document digest — no longer matches its version record.
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const db = new DatabaseSync(path);
      try {
        db.exec('DROP TRIGGER captured_procedure_versions_no_update');
        const row = db.prepare('SELECT document_json FROM captured_procedure_versions WHERE version_id = ?').get(versionId) as { document_json: string };
        const altered = row.document_json.replace('"procedureId":"ai7-review-procedure/style-and-format","version":"1"', '"procedureId":"ai7-review-procedure/style-and-format","version":"9"');
        expect(altered).not.toBe(row.document_json);
        const { createHash } = await import('node:crypto');
        db.prepare('UPDATE captured_procedure_versions SET document_json = ?, document_sha256 = ? WHERE version_id = ?')
          .run(altered, createHash('sha256').update(altered).digest('hex'), versionId);
      } finally {
        db.close();
      }
      expect(refusal(() => store.previewCapturedProcedureValidation(versionId))).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
      expect(refusal(() => store.inspectCapturedProcedureRun(source, saved.procedureId))).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
      expect(refusal(() => store.inspectCapturedProcedures())).toBe('CAPTURED_PROCEDURE_RECORD_INVALID');
    } finally {
      await close(session);
    }
  });

  it('refuses a Developer Capability Proposal without its missing capability, or as the next version of none', async () => {
    const session = await open();
    try {
      const { store } = session;
      expect(refusal(() => store.saveDeveloperProposal({ proposalId: null, title: '空', missingCapability: '  ', affectedProcedure: '', direction: '', pluginCandidate: '' })))
        .toBe('DEVELOPER_PROPOSAL_INVALID');
      expect(refusal(() => store.saveDeveloperProposal({ proposalId: '00000000-0000-4000-8000-000000000000', title: '图注核对', missingCapability: '核对图注。', affectedProcedure: '', direction: '', pluginCandidate: '' })))
        .toBe('DEVELOPER_PROPOSAL_NOT_FOUND');
      expect(store.inspectCapturedProcedures()).toEqual({ procedures: [], proceduresTruncated: false, proposals: [], proposalsTruncated: false });
    } finally {
      await close(session);
    }
  });

  it('writes a proposal version to the file the editor chose and records the file, never sending it', async () => {
    const session = await open();
    try {
      const { store } = session;
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
    } finally {
      await close(session);
    }
  });
});

const wireBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('exact procedure versions (Issue #66, plan slice S31; UI ADR 0013; REUSE-031, REUSE-038 to REUSE-045, REUSE-054)', () => {
  it('resolves the latest eligible version, lets the editor pin an older eligible one, and previews a 停用 before it is confirmed', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 版本来源');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE, LITERARY]));
      const enable = (versionId: string): void => {
        store.enableCapturedProcedure(versionId, store.previewCapturedProcedureValidation(versionId).previewDigest);
      };
      const one = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
      const procedureId = one.procedureId;
      const v1 = one.versions[0]!.versionId;
      enable(v1);
      const v2 = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE, LITERARY], scopeSlot: 'whole', title: '体例复核', procedureId }).versions[0]!.versionId;
      enable(v2);
      // A third version waits for validation: never resolved, and said so (REUSE-044).
      const v3 = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [LITERARY], scopeSlot: 'whole', title: '体例复核', procedureId }).versions[0]!.versionId;
      const target = await importBook(session, 'L2 版本目标', false);

      // The latest eligible version by default, every eligible one offered, the newer one passed over with why.
      const latest = store.inspectCapturedProcedureRun(target, procedureId);
      expect(latest.resolved).toMatchObject({ versionId: v2, version: 2, latestEligible: true });
      expect(latest.eligibleVersions).toEqual([{ versionId: v2, version: 2 }, { versionId: v1, version: 1 }]);
      expect(latest.passedOver).toEqual([{ version: 3, reason: '这一版还没有验证并启用。' }]);
      expect(store.inspectCapturedProcedure(procedureId, null).latestEligibleVersionId).toBe(v2);
      // The older eligible version chosen instead (REUSE-054); a version that is not eligible cannot be.
      const older = store.inspectCapturedProcedureRun(target, procedureId, v1);
      expect(older.resolved).toMatchObject({ versionId: v1, version: 1, latestEligible: false });
      expect(older.resolved!.steps.map((step) => step.categoryId)).toEqual([STYLE]);
      expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, v3))).toBe('REVIEW_PROCEDURE_VERSION_INELIGIBLE');
      expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, '00000000-0000-4000-8000-000000000000'))).toBe('CAPTURED_PROCEDURE_NOT_FOUND');

      // The Run pins exactly the version chosen, and a finished Run names it among the version's linked work with where it stands.
      const pinOne = { versionId: v1, documentSha256: older.resolved!.documentSha256 };
      const ranOne = await authorizeAndDrive(session, target, prepare(session, target, [STYLE], WHOLE, pinOne));
      expect(ranOne.procedure).toMatchObject({ versionId: v1, version: 1 });
      const page = store.inspectCapturedProcedure(procedureId, null);
      expect(page.versions.find((version) => version.versionId === v1)!.runs).toEqual([
        { bookId: target, bookTitle: 'L2 版本目标', reviewRunId: ranOne.reviewRunId, label: '第 1 次', createdAt: expect.any(String), stateLabel: '已完成' },
      ]);
      // A choice of version 1 is still a choice of exactly version 1: version 2's digest under its identity is refused.
      expect(refusal(() => prepare(session, target, [STYLE], WHOLE, { versionId: v1, documentSha256: latest.resolved!.documentSha256 }))).toBe('REVIEW_PROCEDURE_STALE');
      const waiting = prepare(session, target, [STYLE], WHOLE, pinOne);
      expect(waiting.procedure).toMatchObject({ versionId: v1, stopped: false });
      // A second Book's prepared Run from version 1 too: the preview names the newest first.
      const waitingSource = prepare(session, source, [STYLE], WHOLE, pinOne);

      // 停用… of version 1 names the prepared Runs as ones prepared again, keeps the finished one, and says version 2 runs afterwards.
      const preview = store.previewCapturedProcedureStop(procedureId, v1);
      expect(preview).toMatchObject({ procedureId, title: '体例复核', versionId: v1, afterVersion: 2 });
      expect(preview.versions).toEqual([{
        versionId: v1, version: 1, stateLabel: '已启用', runCount: 1, preparedCount: 2, activeCount: 0, active: [],
        prepared: [
          { bookId: source, bookTitle: 'L2 版本来源', reviewRunId: waitingSource.reviewRunId, label: '第 2 次', stateLabel: '计划已冻结 · 待授权' },
          { bookId: target, bookTitle: 'L2 版本目标', reviewRunId: waiting.reviewRunId, label: '第 2 次', stateLabel: '计划已冻结 · 待授权' },
        ],
      }]);
      // A preview that moved is refused, and nothing is stopped: the older of its two prepared Runs superseded by a Run chosen
      // by hand — the newest it named unchanged — binds the digest as much as the newest does (S31 review P2-2, P3-4).
      prepare(session, target, [STYLE]);
      expect(store.previewCapturedProcedureStop(procedureId, v1).versions[0]!.prepared.map((run) => run.reviewRunId)).toEqual([waitingSource.reviewRunId]);
      expect(refusal(() => store.stopCapturedProcedure(procedureId, v1, preview.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
      // So is one that moved by another Run prepared from version 1 since.
      const newer = prepare(session, target, [STYLE], WHOLE, pinOne);
      expect(refusal(() => store.stopCapturedProcedure(procedureId, v1, preview.previewDigest))).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
      expect(store.inspectCapturedProcedure(procedureId, null).versions.find((version) => version.versionId === v1)!.state).toBe('enabled');
      // The superseded prepared Run can never be approved anyway: only the Book's newest is named.
      const again = store.previewCapturedProcedureStop(procedureId, v1);
      expect(again.versions[0]!.prepared.map((run) => run.reviewRunId)).toEqual([newer.reviewRunId, waitingSource.reviewRunId]);
      expect(again.previewDigest).not.toBe(preview.previewDigest);
      const stopped = store.stopCapturedProcedure(procedureId, v1, again.previewDigest);
      expect(stopped.versions.map((version) => [version.version, version.state])).toEqual([[3, 'pending-validation'], [2, 'enabled'], [1, 'stopped']]);
      expect(stopped.latestEligibleVersionId).toBe(v2);
      expect(refusal(() => store.authorizeReviewRun(target, newer.reviewRunId, approvals(newer)))).toBe('REVIEW_PROCEDURE_STOPPED');
      expect(refusal(() => store.authorizeReviewRun(source, waitingSource.reviewRunId, approvals(waitingSource)))).toBe('REVIEW_PROCEDURE_STOPPED');
      expect(store.inspectReviewWorkspace(target, ranOne.reviewRunId).run!.procedure).toMatchObject({ versionId: v1, stopped: true });
      // A stopped version is no longer offered, cannot be chosen, and is said when newer than the latest eligible.
      expect(store.inspectCapturedProcedureRun(target, procedureId).eligibleVersions.map((version) => version.version)).toEqual([2]);
      expect(refusal(() => store.inspectCapturedProcedureRun(target, procedureId, v1))).toBe('REVIEW_PROCEDURE_VERSION_INELIGIBLE');
      expect(refusal(() => store.previewCapturedProcedureStop(procedureId, v1))).toBe('CAPTURED_PROCEDURE_STOPPED');
      expect(() => store.previewCapturedProcedureStop(procedureId, v1)).toThrowError('《体例复核》第 1 版已经停用。');

      // An approved Run that is still running goes on under its version, and the preview says so. Once it has finished, that
      // preview no longer holds: the confirmation is refused as stale and nothing is stopped (S31 review P3-4).
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
      // Nothing was deleted, and each 停用 records the preview it confirmed.
      const db = database();
      try {
        expect((db.prepare('SELECT count(*) n FROM captured_procedure_versions').get() as { n: number }).n).toBe(3);
        const states = db.prepare("SELECT canonical_json FROM captured_procedure_states WHERE state = 'stopped' ORDER BY recorded_at").all() as Array<{ canonical_json: string }>;
        expect(states.map((row) => (JSON.parse(row.canonical_json) as { previewDigest: string }).previewDigest))
          .toEqual([again.previewDigest, afterRun.previewDigest, afterRun.previewDigest]);
      } finally {
        db.close();
      }
    } finally {
      await close(session);
    }
  }, 300_000);
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
  it('lists summaries, pages long version histories by bytes, and answers every save within the frame', async () => {
    const session = await open();
    try {
      const { store } = session;
      const source = await importBook(session, 'L2 有界');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
      // The longest a title may be: 21 family emoji, 231 UTF-16 code units, 21 graphemes.
      const title = (index: number): string => `${'👨‍👩‍👧‍👦'.repeat(20)}${String.fromCodePoint(0x4e00 + index)}`;
      let first = '';
      for (let index = 0; index < 51; index += 1) {
        const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: title(index), procedureId: null });
        first ||= saved.procedureId;
        expect(wireBytes(saved)).toBeLessThan(MAX_FRAME_BYTES);
      }
      for (let version = 2; version <= 30; version += 1) {
        const next = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'chapters', title: title(99), procedureId: first });
        expect(wireBytes(next)).toBeLessThan(MAX_FRAME_BYTES);
      }
      // A field as long as either bound allows: 363 family emoji, 3,993 code units and about 9 KB each.
      const long = '👨‍👩‍👧‍👦'.repeat(363);
      let proposalId: string | null = null;
      for (let version = 1; version <= 25; version += 1) {
        const saved = store.saveDeveloperProposal({ proposalId, title: title(version), missingCapability: long, affectedProcedure: long, direction: long, pluginCandidate: long });
        proposalId = saved.proposalId;
        expect(wireBytes(saved)).toBeLessThan(MAX_FRAME_BYTES);
      }
      expect(() => store.saveDeveloperProposal({ proposalId: null, title: '过长', missingCapability: `${long}字字字字字字字字`, affectedProcedure: '', direction: '', pluginCandidate: '' }))
        .toThrowError('请写明缺少的能力');
      for (let index = 0; index < 51; index += 1) {
        store.saveDeveloperProposal({ proposalId: null, title: title(index), missingCapability: long, affectedProcedure: '', direction: '', pluginCandidate: '' });
      }
      const listed = store.inspectCapturedProcedures();
      expect(listed.procedures).toHaveLength(50);
      expect(listed.proposals).toHaveLength(50);
      expect([listed.proceduresTruncated, listed.proposalsTruncated]).toEqual([true, true]);
      expect(wireBytes(listed)).toBeLessThan(MAX_FRAME_BYTES);
      // Summaries only: no versions in the list.
      expect(Object.keys(listed.procedures[0]!).sort()).toEqual(['latestState', 'latestStateLabel', 'latestVersion', 'procedureId', 'runnable', 'title', 'versionCount']);
      expect(Object.keys(listed.proposals[0]!).sort()).toEqual(['latestCreatedAt', 'latestVersion', 'proposalId', 'title', 'versionCount']);
      // Every version is reached a page at a time, each page within the frame.
      const walk = <T extends { versions: ReadonlyArray<{ version: number }>; versionsBefore: number | null }>(read: (before: number | null) => T): number[] => {
        const seen: number[] = [];
        let before: number | null = null;
        do {
          const page = read(before);
          expect(wireBytes(page)).toBeLessThan(MAX_FRAME_BYTES);
          expect(page.versions.length).toBeGreaterThan(0);
          seen.push(...page.versions.map((version) => version.version));
          before = page.versionsBefore;
        } while (before !== null);
        return seen;
      };
      expect(walk((before) => store.inspectCapturedProcedure(first, before))).toEqual(Array.from({ length: 30 }, (_, index) => 30 - index));
      // 全部停用… of thirty versions lists the newest page within the frame and counts the rest; confirmed, it stops all thirty
      // (Issue #66, S31 review P2-2).
      const stopAll = store.previewCapturedProcedureStop(first, null);
      expect(wireBytes(stopAll)).toBeLessThan(MAX_FRAME_BYTES);
      expect(stopAll.versionCount).toBe(30);
      expect(stopAll.versions.map((version) => version.version)).toEqual([30, 29, 28, 27, 26]);
      const stoppedAll = store.stopCapturedProcedure(first, null, stopAll.previewDigest);
      expect(wireBytes(stoppedAll)).toBeLessThan(MAX_FRAME_BYTES);
      expect(walk((before) => store.inspectCapturedProcedure(first, before)).length).toBe(30);
      let page: ReturnType<typeof store.inspectCapturedProcedure> | null = null;
      let before: number | null = null;
      do {
        page = store.inspectCapturedProcedure(first, before);
        expect(page.versions.every((version) => version.state === 'stopped')).toBe(true);
        before = page.versionsBefore;
      } while (before !== null);
      expect(walk((before) => store.inspectDeveloperProposal(proposalId!, before))).toEqual(Array.from({ length: 25 }, (_, index) => 25 - index));
    } finally {
      await close(session);
    }
  }, 300_000);
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
      const source = await importBook(session, 'L2 来源');
      const finished = await authorizeAndDrive(session, source, prepare(session, source, [STYLE]));
      const saved = store.saveCapturedProcedure({ bookId: source, reviewRunId: finished.reviewRunId, categoryIds: [STYLE], scopeSlot: 'whole', title: '体例复核', procedureId: null });
      const versionId = saved.versions[0]!.versionId;
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
      // The house's procedures stayed behind; the Book's Runs keep naming what they were prepared from.
      expect(store.inspectCapturedProcedures().procedures).toEqual([]);
      expect(store.inspectReviewWorkspace(target, finishedPinned).run!.procedure).toMatchObject({ title: '体例复核', version: 1, missing: true, stopped: false });
      const waiting = store.inspectReviewWorkspace(target, waitingPinned).run!;
      expect(waiting.procedure!.missing).toBe(true);
      expect(refusal(() => store.authorizeReviewRun(target, waitingPinned, approvals(waiting)))).toBe('REVIEW_PROCEDURE_MISSING');
      // Prepared again by hand — this house's own connection set up — it is an ordinary Review Run.
      recordMissingCredentialConnection(store, 'L2 本机连接');
      const again = prepare(merged, target, [STYLE]);
      expect(again.procedure).toBeNull();
    } finally {
      await close(merged);
    }
  }, 300_000);
});

describe('revision 63', () => {
  it('adds six empty append-only relations', () => {
    expect(Object.keys(CAPTURED_PROCEDURE_SCHEMA_SQL)).toEqual([
      'captured_procedures', 'captured_procedure_versions', 'captured_procedure_states', 'review_run_procedure_pins',
      'developer_capability_proposals', 'developer_capability_proposal_exports',
    ]);
  });
});
