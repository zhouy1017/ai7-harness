import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL } from '../../src/service/captured-procedures.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { LEADS_ABSENT_REASON } from '../../src/service/review/review-scope.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CAPTURED_PROCEDURE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type LaunchPolicyProjection, type ReviewRunProjection, type ReviewRunScopeRequest } from '../../src/shared/protocol.js';
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

async function open(wrap?: (inner: BaselineAnalysisExecutionOwner) => ReviewRunExecutionOwner): Promise<Session> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
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
        procedureId: saved.procedureId, versionId: first!.versionId, version: 1, title: '线索与体例复核', documentSha256: pin.documentSha256, stopped: false,
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
      expect(store.inspectCapturedProcedures().procedures[0]!.versions[1]).toMatchObject({ runCount: 1, runs: [{ bookId: target, bookTitle: 'L2 第二本书', label: '第 1 次' }] });

      // A Run prepared from version 1 and not yet authorized when version 1 is stopped is prepared again, never authorized.
      const waiting = prepare(session, target, [STYLE], WHOLE, pin);
      const stopped = store.stopCapturedProcedure(saved.procedureId, first!.versionId);
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
      expect(store.stopCapturedProcedure(saved.procedureId, null).versions.map((version) => version.state)).toEqual(['stopped', 'stopped']);
      const check = database();
      try {
        expect((check.prepare('SELECT count(*) n FROM captured_procedure_versions').get() as { n: number }).n).toBe(2);
        expect((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(CAPTURED_PROCEDURE_SCHEMA_VERSION);
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
      const text = readFileSync(destination, 'utf8');
      expect(text.startsWith('# 开发建议：图注核对\n')).toBe(true);
      expect(text.includes('图片说明读取插件')).toBe(true);
      expect(text.includes('AI7 不会发送这份开发建议')).toBe(true);
      expect(text.includes(revised.versions[0]!.technical.sha256)).toBe(true);
      expect(store.inspectCapturedProcedures().proposals[0]!.versions[0]!.files).toHaveLength(1);
      await expect(store.writeDeveloperProposalFile(revised.versions[0]!.proposalVersionId, 'relative.md')).rejects.toMatchObject({ code: 'DEVELOPER_PROPOSAL_DESTINATION_INVALID' });
    } finally {
      await close(session);
    }
  });
});

describe('revision 63', () => {
  it('adds six empty append-only relations', () => {
    expect(Object.keys(CAPTURED_PROCEDURE_SCHEMA_SQL)).toEqual([
      'captured_procedures', 'captured_procedure_versions', 'captured_procedure_states', 'review_run_procedure_pins',
      'developer_capability_proposals', 'developer_capability_proposal_exports',
    ]);
  });
});
