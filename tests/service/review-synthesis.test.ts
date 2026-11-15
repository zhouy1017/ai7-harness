import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { driveLaunchedReviewRun, ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { loadModelFixture, resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection, ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { sample1SynthesisAnswer } from '../support/review-synthesis-answer.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { RUN_SYNTHESIS_SCHEMA_SQL } from '../../src/service/review/run-synthesis-storage.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';

const TYPOS = 'typos-and-usage';
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
let roots: ServiceTestRoots;
let requestGovernor: ModelRequestGovernor;
let launchPolicy: LaunchPolicyProjection;
let heldReleases: Array<() => void>;
type Book = Awaited<ReturnType<typeof importSample1Book>>;
interface Session { store: EditorialStore; owner: ReturnType<typeof capturedOrdinaryExecution>['owner']; driver: ReviewRunDriver; capture: ReturnType<typeof capturedOrdinaryExecution> }
beforeEach(async () => { roots = await createServiceTestRoots('ai7-review-synthesis-'); requestGovernor = new ModelRequestGovernor(); heldReleases = []; });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); await roots.dispose(); });

async function openCapturedSession(synthesisAnswer = sample1SynthesisAnswer,
  controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}): Promise<Session> {
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-review-contract-v2-controls');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const base = reviewCategoryKindDefinition(TYPOS_AND_USAGE);
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    if (sample1SynthesisAnswer(message) !== undefined) return synthesisAnswer(message);
    const header = parseReviewCategoryUnitMessageHeader(message);
    if (request.stage === 'units' && header?.categoryId === TYPOS) return resolveFixtureEntry(fixture.entries, header.ordinal,
      base.requestDigest(header.ordinal, header.unitDigest), request.attemptIndex)?.response;
    if (request.stage === 'units' && header !== null) return { kind: 'adapter-failure', code: 'CAPTURED_CATEGORY_FAILED', message: 'Captured category failure', status: 400 };
    const content = request.stage === 'assurance-sampling' ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message)
      .map((ref) => ({ ref, disposition: '成立', reason: 'SampleBook 精确引文核对。' })) }
      : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? undefined : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 5 } };
  }, controls);
  launchPolicy = capture.policy;
  return { store, owner: capture.owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, capture.owner), capture };
}
async function closeCapturedSession(session: Session): Promise<void> {
  for (const release of heldReleases) release();
  const stopped = session.driver.dispose(); await session.owner.dispose(); await stopped;
  try { session.capture.assertMatched(); session.store.markCleanShutdown(); } finally { session.store.close(); }
}
async function withCapturedReviewBook(body: (session: Session, book: Book) => Promise<void>, synthesisAnswer = sample1SynthesisAnswer,
  controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}): Promise<void> {
  const session = await openCapturedSession(synthesisAnswer, controls);
  try {
    const book = await importSample1Book(session.store, roots.codeRoot, 'sample1 全书审阅统合');
    await pinEditorialWorkspaceProfileRevision2(session.store, book.bookId);
    recordMissingCredentialConnection(session.store, '统合正式请求捕获');
    await body(session, book);
  } finally { await closeCapturedSession(session); }
}

function workspace(session: Session, book: Book, reviewRunId: string | null = null) { return session.store.inspectReviewWorkspace(book.bookId, reviewRunId); }
function synthesisOutcome(session: Session, book: Book): string {
  const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
  try {
    const events = db.prepare(`SELECT category_id, state, json_extract(canonical_json, '$.detail') detail,
      json_extract(canonical_json, '$.code') code FROM review_run_category_events WHERE category_id='run-synthesis' ORDER BY rowid`).all();
    return JSON.stringify(events);
  } finally { db.close(); }
}

it('sends one structured synthesis request in ordinary production, preserves findings, and replays without resending (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const input = { bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE };
    const first = session.store.launchReviewRun(input, launchPolicy);
    await driveLaunchedReviewRun(session.driver, first);
    const run = workspace(session, book).run!;
    const outcome = synthesisOutcome(session, book);
    expect(run.synthesis?.state, outcome).toBe('completed');
    expect(run.findings.length).toBeGreaterThan(0);
    const requests = session.capture!.wireRequests.filter((request) => request.messages.some((message) => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')));
    expect(requests).toHaveLength(1);
    const sent = requests[0]!.messages.findLast((message) => message.role === 'user')!.content;
    const payload = JSON.parse(sent);
    expect(payload.evidence.length).toBeGreaterThan(0);
    expect(payload.findings.every((finding: { ref: string }) => /^f\d+$/u.test(finding.ref))).toBe(true);
    for (const block of session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).filter((block) => block.text.length > 160)) expect(sent).not.toContain(block.text);
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun(input, launchPolicy));
    expect(session.capture!.wireRequests).toHaveLength(session.capture!.requests.length);
    expect(session.capture!.wireRequests.filter((request) => request.messages.some((message) => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))).toHaveLength(1);
  });
});

it('keeps a failed synthesis optional and immediately permits a fresh ordinary review (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const first = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy);
    await driveLaunchedReviewRun(session.driver, first);
    const completed = workspace(session, book).run!;
    expect(completed.findings.length).toBeGreaterThan(0);
    expect(completed.synthesis?.state).toBe('missing');
    expect(completed.state).toBe('settled');
    expect(session.capture.requests.some(request => request.stage === 'cross-unit-reduction')).toBe(true);
    expect(() => session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy)).not.toThrow();
  }, () => ({ kind: 'adapter-failure', code: 'CAPTURED_SYNTHESIS_FAILED', message: 'Captured synthesis failure', status: 400 }));
});

it.each(['pause', 'cancel'] as const)('preserves ordinary findings and launch binding when synthesis receives %s (#1433)', async (action) => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let stoppedOnce = false;
  heldReleases.push(release);
  try {
    await withCapturedReviewBook(async (session, book) => {
      const input = { bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE };
      const run = session.store.launchReviewRun(input, launchPolicy).projection.run!;
      const driving = session.driver.drive(run.reviewRunId);
      await Promise.race([held, driving.then(() => { throw new Error('synthesis-ended-before-hold'); })]);
      const before = workspace(session, book).run!;
      expect(before.findings.length).toBeGreaterThan(0);
      const stopped = session.store.requestTaskRunControl({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId, action });
      if (action === 'pause') session.owner.pauseRun(stopped.runRecordId!, stopped.ledger);
      else session.owner.cancelRun(stopped.runRecordId!, stopped.ledger);
      release(); await driving;
      const model = session.capture!.wireRequests[0]!.model;
      if (action === 'pause') {
        session.store.selectMainRoleModel('opencode-go', 'changed-after-launch', 'off');
        await session.driver.continue(run.reviewRunId);
        expect(workspace(session, book).run!.synthesis?.state, synthesisOutcome(session, book)).toBe('completed');
        expect(session.capture!.wireRequests.every(request => request.model === model)).toBe(true);
      } else {
        expect(workspace(session, book).run!.state).toBe('cancelled');
        expect(() => session.store.launchReviewRun({ ...input, clientCommandId: randomUUID() }, launchPolicy)).not.toThrow();
      }
      expect(workspace(session, book, run.reviewRunId).run!.findings).toHaveLength(before.findings.length);
      const sent = session.capture!.wireRequests.filter(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')));
      expect(sent).toHaveLength(1);
    }, sample1SynthesisAnswer, { stageHold: async (stage) => {
      if (stage === 'cross-unit-reduction' && !stoppedOnce) { stoppedOnce = true; reached(); await gate; }
    } });
  } finally { release(); }
});


it('carries a completed synthesis and its frozen report through public export, Book merge and database replacement (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const run = session.store.generateReviewReport(book.bookId, workspace(session, book).run!.reviewRunId).run!;
    expect(run.synthesis?.state).toBe('completed');
    expect(run.report!.record.synthesis).toEqual(run.synthesis);
    const destination = join(roots.inputRoot, 'synthesis.ai7db');
    const prepared = await session.store.prepareDatabaseExport(destination, true);
    expect((await session.store.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
    for (const mode of ['merge', 'replacement'] as const) {
      const dataRoot = join(roots.inputRoot, `${mode}-data`);
      let target = await EditorialStore.open(dataRoot, roots.codeRoot);
      try {
        const preview = await target.inspectDatabaseImport(destination);
        if (mode === 'merge') await target.prepareDatabaseMerge(preview.previewId, new Date());
        else await target.prepareDatabaseReplacement(preview.previewId, new Date());
      } finally { target.markCleanShutdown(); target.close(); }
      target = await EditorialStore.open(dataRoot, roots.codeRoot);
      try {
        const carried = target.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
        expect(carried.synthesis).toEqual(run.synthesis);
        expect(carried.report!.record).toEqual(run.report!.record);
        expect(carried.report!.digest).toEqual(run.report!.digest);
      } finally { target.markCleanShutdown(); target.close(); }
    }
  });
});

it('adds a cascade-owned synthesis relation without an immutable deletion barrier (#1433)', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY) STRICT;');
    db.exec(RUN_SYNTHESIS_SCHEMA_SQL.review_run_synthesis);
    db.prepare('INSERT INTO review_runs VALUES (?)').run('sample1-run');
    db.prepare('INSERT INTO review_run_synthesis(review_run_id,synthesis_key,summary_json,summary_digest) VALUES (?,?,?,?)').run('sample1-run', 'sample1-summary', '{}', '0'.repeat(64));
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name='review_run_synthesis'").all()).toEqual([]);
    db.prepare('DELETE FROM review_runs WHERE review_run_id=?').run('sample1-run');
    expect(db.prepare('SELECT * FROM review_run_synthesis').all()).toEqual([]);
  } finally { db.close(); }
});

it('refuses the remaining synthesis after category cancellation and relaunches immediately (#1433)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); heldReleases.push(release);
  let once = false;
  await withCapturedReviewBook(async (session, book) => {
    const input = { bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE };
    const run = session.store.launchReviewRun(input, launchPolicy).projection.run!;
    const driving = session.driver.drive(run.reviewRunId); await held;
    const control = session.store.requestTaskRunControl({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId, action: 'cancel' });
    session.owner.cancelRun(control.runRecordId!, control.ledger); release(); await driving;
    expect(workspace(session, book).run!.state).toBe('cancelled');
    expect(session.capture.requests.some(request => request.stage === 'cross-unit-reduction')).toBe(false);
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ ...input, clientCommandId: randomUUID() }, launchPolicy));
    expect(workspace(session, book).run!.synthesis?.state, synthesisOutcome(session, book)).toBe('completed');
  }, sample1SynthesisAnswer, { unitHold: async () => { if (!once) { once = true; reached(); await gate; } } });
});

it('synthesizes settled findings with editorial disclosure of a failed category (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS, 'literary-expression'], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    expect(run.synthesis?.state).toBe('completed');
    expect(run.synthesis?.missingCategories).toEqual(['文学性与表达改进']);
    expect(run.findings.length).toBeGreaterThan(0);
  });
});

it('resumes a synthesis waiting for its turn after restart under its launched model (#1433)', async () => {
  let session = await openCapturedSession();
  let book!: Book, runId!: string, launchedModel!: string;
  try {
    book = await importSample1Book(session.store, roots.codeRoot, 'sample1 统合排队重启');
    await pinEditorialWorkspaceProfileRevision2(session.store, book.bookId); recordMissingCredentialConnection(session.store, '统合排队重启');
    runId = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy).projection.run!.reviewRunId;
    const categoryOnly = new ReviewRunDriver({ ...session.store.reviewRunDriveSteps, begin: id => session.store.reviewRunDriveSteps.begin(id).filter(category => category === TYPOS) }, session.owner);
    try { await categoryOnly.drive(runId); } finally { await categoryOnly.dispose(); }
    expect(workspace(session, book).run!.synthesis?.state).toBe('pending');
    expect(workspace(session, book).run!.canContinue).toBe(true);
    launchedModel = session.capture.wireRequests[0]!.model;
  } finally { await closeCapturedSession(session); }
  session = await openCapturedSession();
  try {
    session.store.selectMainRoleModel('opencode-go', 'changed-after-restart', 'off');
    await session.driver.continue(runId);
    expect(workspace(session, book, runId).run!.synthesis?.state).toBe('completed');
    expect(session.capture.wireRequests).toHaveLength(1);
    expect(session.capture.wireRequests[0]!.model).toBe(launchedModel);
  } finally { await closeCapturedSession(session); }
});
