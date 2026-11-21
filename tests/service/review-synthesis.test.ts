import { appendBaselineUnitVariant } from '../support/synopsis-reuse.js';
import { randomUUID } from 'node:crypto';
import { writeFile, cp } from 'node:fs/promises';
import { basename } from 'node:path';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { driveLaunchedReviewRun, ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader, parseReviewCrossChapterMessage, REVIEW_CROSS_CHAPTER_RESULT_SCHEMA } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { loadModelFixture, resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection, ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { REVIEW_SYNTHESIS_PLAN_LINE } from '../../src/shared/review-synthesis-wording.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { capturedMapAnswer, capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { setLibraryDecision } from '../support/library-materials.js';
import { sample1SynthesisAnswer } from '../support/review-synthesis-answer.js';
import { sample1Seed } from '../support/sample1-seed.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { RUN_SYNTHESIS_SCHEMA_SQL } from '../../src/service/review/run-synthesis-storage.js';
import { SYNTHESIS_TEXT_LIMIT } from '../../src/service/review/run-synthesis-contract.js';
import { TYPOS_AND_USAGE, STYLE_AND_FORMAT, LITERARY_EXPRESSION } from '../support/review-categories.js';

const TYPOS = 'typos-and-usage', STYLE = 'style-and-format';
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
let roots: ServiceTestRoots;
let requestGovernor: ModelRequestGovernor;
let launchPolicy: LaunchPolicyProjection;
let heldReleases: Array<() => void>;
let restatedBranch: string | null = null;
type Book = Awaited<ReturnType<typeof importSample1Book>>;
interface Session { store: EditorialStore; owner: ReturnType<typeof capturedOrdinaryExecution>['owner']; driver: ReviewRunDriver; capture: ReturnType<typeof capturedOrdinaryExecution> }
beforeEach(async () => { roots = await createServiceTestRoots('ai7-review-synthesis-'); requestGovernor = new ModelRequestGovernor(); heldReleases = []; restatedBranch = null; });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); await roots.dispose(); });

// A case whose first act is the import starts from a copy of one imported sample1 store (#1621); the case that imports a second Book keeps
// `importSample1Book`.
const seeded = sample1Seed({ title: 'sample1 全书审阅统合' });

async function openCapturedSession(synthesisAnswer = sample1SynthesisAnswer,
  controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}, emptyFindings = false, literary = false, restatedNotes = false, failedUnit = 0, dataRoot = roots.dataRoot, restatedSynopses = false, seed = false): Promise<Session> {
  if (seed) (await seeded()).place(dataRoot);
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-review-cross-chapter-controls');
  const store = await EditorialStore.open(dataRoot, roots.codeRoot, { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const bases = new Map([[TYPOS, reviewCategoryKindDefinition(TYPOS_AND_USAGE)], [STYLE, reviewCategoryKindDefinition(STYLE_AND_FORMAT)], ...(literary ? [['literary-expression', reviewCategoryKindDefinition(LITERARY_EXPRESSION)] as const] : [])]);
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, dataRoot, requestGovernor, (request, message) => {
    if (sample1SynthesisAnswer(message) !== undefined) return synthesisAnswer(message);
    const header = parseReviewCategoryUnitMessageHeader(message);
    if (request.stage === 'units' && header !== null && header.ordinal === failedUnit) return { kind: 'adapter-failure', code: 'CAPTURED_UNIT_GAP', message: 'Captured unit gap', status: 400 };
    if (request.stage === 'units' && header !== null && bases.has(header.categoryId)) {
      const response = resolveFixtureEntry(fixture.entries, header.ordinal, bases.get(header.categoryId)!.requestDigest(header.ordinal, header.unitDigest), request.attemptIndex)?.response;
      if (restatedNotes && response?.kind === 'unit-result') {
        let value;
        try { value = JSON.parse(response.text); } catch { return response; }
        if (!Array.isArray(value.findings)) return response;
        const paragraph = store.baselineAnalysisLedger.readWorkingBlocks(restatedBranch!).find(block => block.text.length > 100)?.text;
        if (paragraph !== undefined) for (const finding of value.findings) if (finding !== null && typeof finding === 'object') finding.note = paragraph;
        return { ...response, text: JSON.stringify(value) };
      }
      return !emptyFindings ? response : { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    }
    if (parseReviewCrossChapterMessage(message) !== null) return { kind: 'unit-result', text: JSON.stringify({ schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    if (parseFactualReviewUnitMessageHeader(message) !== null) return { kind: 'adapter-failure', code: 'CAPTURED_CATEGORY_FAILED', message: 'Captured category failure', status: 400 };
    const baseline = parseUnitMessageHeader(message);
    if (request.stage === 'units' && baseline?.ordinal === failedUnit) return { kind: 'adapter-failure', code: 'CAPTURED_UNIT_GAP', message: 'Captured unit gap', status: 400 };
    if (request.stage === 'units' && baseline !== null) {
      const response = resolveFixtureEntry(fixture.entries, baseline.ordinal, unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, baseline.ordinal, baseline.unitDigest), request.attemptIndex)?.response;
      if (!restatedSynopses || response?.kind !== 'unit-result') return response;
      let value;
      try { value = JSON.parse(response.text); } catch { return response; }
      if (typeof value.synopsis !== 'string') return response;
      const paragraph = store.baselineAnalysisLedger.readWorkingBlocks(restatedBranch!).find(block => [...block.text].length > 400)?.text;
      if (paragraph !== undefined) value.synopsis = paragraph;
      return { ...response, text: JSON.stringify(value) };
    }
    if (request.stage === 'units' && header !== null) return { kind: 'adapter-failure', code: 'CAPTURED_CATEGORY_FAILED', message: 'Captured category failure', status: 400 };
    if ((failedUnit > 0 || restatedSynopses) && request.stage === 'cross-unit-reduction') return { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.baseline-manuscript-analysis.cross-unit-result/1', findings: [], notes: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    const content = request.stage === 'assurance-sampling' ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message)
      .map((ref) => ({ ref, disposition: '成立', reason: 'SampleBook 精确引文核对。' })) }
      : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? capturedMapAnswer(fixture.entries)(request, message) : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 5 } };
  }, controls);
  launchPolicy = capture.policy;
  return { store, owner: capture.owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, capture.owner), capture };
}
async function closeCapturedSession(session: Session): Promise<void> {
  for (const release of heldReleases) release();
  const stopped = session.driver.dispose(); await session.owner.dispose(); await stopped;
  try { session.capture.assertMatched(); session.store.markCleanShutdown(); } finally { session.store.close(); }
}
function openSeededSession(synthesisAnswer = sample1SynthesisAnswer, controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}): Promise<Session> {
  return openCapturedSession(synthesisAnswer, controls, false, false, false, 0, roots.dataRoot, false, true);
}
async function withCapturedReviewBook(body: (session: Session, book: Book) => Promise<void>, synthesisAnswer = sample1SynthesisAnswer,
  controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}, emptyFindings = false, literary = false, restatedNotes = false, failedUnit = 0, restatedSynopses = false): Promise<void> {
  const session = await openCapturedSession(synthesisAnswer, controls, emptyFindings, literary, restatedNotes, failedUnit, roots.dataRoot, restatedSynopses, true);
  try {
    const { book } = await seeded();
    recordMissingCredentialConnection(session.store, '统合正式请求捕获');
    restatedBranch = book.branchId;
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
    expect(new Set(run.synthesis!.evidence.map(entry => entry.chapterLabel)).size).toBeGreaterThan(1);
    expect(payload.evidence.every((entry: Record<string, unknown>) => !Object.hasOwn(entry, 'chapterLabel'))).toBe(true);
    expect(payload.findings.every((finding: { ref: string }) => /^f\d+$/u.test(finding.ref))).toBe(true);
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
    expect(session.store.inspectBookTasks(book.bookId, () => null).groups.find(group => group.key === 'recent')!.items.some(item => item.item.target.kind === 'review' && item.item.target.reviewRunId === completed.reviewRunId)).toBe(true);
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
        expect(session.capture.abortedRequests).toHaveLength(1);
        expect(workspace(session, book).run!.synthesis?.state).toBe('missing');
        expect(workspace(session, book).run!.state).toBe('cancelled');
        const fresh = session.store.launchReviewRun({ ...input, clientCommandId: randomUUID() }, launchPolicy);
        await driveLaunchedReviewRun(session.driver, fresh);
        expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
      }
      expect(workspace(session, book, run.reviewRunId).run!.findings).toEqual(before.findings);
      const sent = session.capture!.wireRequests.filter(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')));
      expect(sent).toHaveLength(action === 'cancel' ? 2 : 1);
    }, sample1SynthesisAnswer, { transportHold: async (_request, message) => {
      if (sample1SynthesisAnswer(message) !== undefined && !stoppedOnce) { stoppedOnce = true; reached(); await gate; }
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
    const stopped = workspace(session, book).run!;
    expect(stopped.synthesis?.state).toBe(stopped.findings.length === 0 ? undefined : 'missing');
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
    expect(run.synthesis?.missingCategories.some(label => label.startsWith('文学性与表达改进') && label.includes('0/8'))).toBe(true);
    expect(run.findings.length).toBeGreaterThan(0);
  });
});

it('resumes a synthesis waiting for its turn after restart under its launched model (#1433)', async () => {
  let session = await openSeededSession();
  let book!: Book, runId!: string, launchedModel!: string;
  try {
    book = (await seeded()).book; recordMissingCredentialConnection(session.store, '统合排队重启');
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

it('makes no synthesis request or missing-summary projection when model review has no findings (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    expect(run.state).toBe('settled'); expect(run.findings).toEqual([]); expect(run.synthesis).toBeUndefined();
    expect(session.capture.requests.some(request => request.stage === 'cross-unit-reduction')).toBe(false);
  }, sample1SynthesisAnswer, {}, true);
});

it('reuses only the closed baseline chapter synopsis chain in the ordinary synthesis request (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const baseline = session.store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, launchPolicy);
    session.owner.admitAndDispatch(baseline.runRecordId, session.store.baselineAnalysisLedger);
    await session.owner.whenIdle();
    expect(session.store.inspectBaselineAnalysis(book.bookId).state).toBe('settled');
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const request = session.capture.wireRequests.find(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))!;
    const input = JSON.parse(request.messages.findLast(message => message.role === 'user')!.content);
    expect(input.baseline.synopses.length).toBeGreaterThan(1);
    expect(input.baseline.synopses.every((unit: { unitOrdinal: number; synopsis: string }) => Number.isSafeInteger(unit.unitOrdinal) && typeof unit.synopsis === 'string')).toBe(true);
    expect(Object.keys(input.baseline).sort()).toEqual(['missingUnitOrdinals', 'synopses']);
    expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
  });
});

it.each(['bad-digest', 'missing-synopsis'] as const)('preserves review baseline damage semantics for %s (#1500 R3 R4)', async variant => {
  await withCapturedReviewBook(async (session, book) => {
    const baseline = session.store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, launchPolicy);
    session.owner.admitAndDispatch(baseline.runRecordId, session.store.baselineAnalysisLedger); await session.owner.whenIdle();
    const launched = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy);
    const affectedOrdinal = appendBaselineUnitVariant(roots.dataRoot, book.bookId, variant);
    await driveLaunchedReviewRun(session.driver, launched);
    expect(workspace(session, book).run!.findings.length).toBeGreaterThan(0);
    if (variant === 'bad-digest') {
      expect(synthesisOutcome(session, book)).toContain('REVIEW_RECORD_INVALID');
      expect(synthesisOutcome(session, book)).not.toContain('BASELINE_SYNOPSIS_RECORD_INVALID');
    } else {
      const request = session.capture.wireRequests.find(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))!;
      const input = JSON.parse(request.messages.findLast(message => message.role === 'user')!.content);
      expect(input.baseline.missingUnitOrdinals).toContain(affectedOrdinal);
      expect(input.baseline.synopses.some((unit: { unitOrdinal: number }) => unit.unitOrdinal === affectedOrdinal)).toBe(false);
      expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
    }
  });
});

it.each([0, 1])('keeps the pre-dispatch ceiling rule with %i tokens remaining and counts synthesis usage (#1433 R8)', async remaining => {
  await withCapturedReviewBook(async (session, sample) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: sample.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const definition = reviewCategoryKindDefinition(TYPOS_AND_USAGE);
    const usage = session.store.inspectReviewCategory(sample.bookId, definition).taskOutcome!.report!.usagePerStage;
    const priorTotal = Object.values(usage).reduce((sum, stage) => sum + stage.inputTokens + stage.outputTokens, 0);
    const maxTotalTokens = priorTotal + remaining;
    expect(maxTotalTokens).toBeGreaterThan(0);
    const book = await importSample1Book(session.store, roots.codeRoot, 'sample1 有限统合预算');
    await pinEditorialWorkspaceProfileRevision2(session.store, book.bookId);
    let category = session.store.createReviewCategoryPreparationWork(book.bookId, definition, { mode: 'review-first', selectedRange: null }, launchPolicy);
    while (!category.done) category = session.store.advanceReviewCategoryPreparationWork(definition, category.workId!);
    const projection = category.projection!;
    session.store.reviewCategoryLedger(definition).editPlan(book.bookId, { taskIntentId: projection.taskIntent!.taskIntentId,
      planEnvelopeDigest: projection.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens } });
    let work = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS], WHOLE, launchPolicy);
    while (!work.done) work = session.store.advanceReviewRunPreparationWork(work.workId!);
    const run = work.projection!.run!;
    session.store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map(category => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    await session.driver.drive(run.reviewRunId);
    const finished = workspace(session, book).run!;
    expect(finished.synthesis?.state).toBe(remaining === 0 ? 'budget' : 'completed');
    if (remaining === 0) expect(finished.synthesis?.detail).toContain('预算');
    else { expect(finished.usage!.inputTokens + finished.usage!.outputTokens).toBe(priorTotal + 1080); expect(finished.usage!.inputTokens + finished.usage!.outputTokens).toBeGreaterThan(maxTotalTokens); }
    expect(finished.findings.length).toBeGreaterThan(0);
    expect(session.capture.wireRequests.filter(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))).toHaveLength(remaining === 0 ? 1 : 2);
  });
});

it('waits offline and reconnects the final synthesis on the launched ordinary model exactly once (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const input = { bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE, executionConfig: { modelId: 'frozen-offline-model', reasoningEffort: 'high' } };
    const launched = session.store.launchReviewRun(input, launchPolicy, 'when-online');
    expect(launched.projection.run!.state).toBe('waiting');
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun(input, launchPolicy));
    expect(session.capture.requests).toHaveLength(0);
    session.store.selectMainRoleModel('opencode-go', 'changed-while-offline', 'off');
    const waiting = session.store.waitingTaskRuns(book.bookId).find(run => run.kind === 'review-run')!;
    expect(session.store.taskPreflightDrift(waiting)).toEqual([]);
    let driven = Promise.resolve();
    session.store.admitWaitingReviewRun(waiting.ref, () => { driven = session.driver.drive(waiting.ref); }); await driven;
    expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
    expect(session.capture.wireRequests.every(request => request.model === 'frozen-offline-model' && request.reasoning_effort === 'high')).toBe(true);
    const count = session.capture.requests.length;
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun(input, launchPolicy));
    expect(session.capture.requests).toHaveLength(count);
  });
});

it('settles a graceful stop during the ordinary transport request without resending synthesis (#1433)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); heldReleases.push(release);
  const first = await openSeededSession(sample1SynthesisAnswer, { transportHold: async (_request, message) => { if (sample1SynthesisAnswer(message) !== undefined) { reached(); await gate; } } });
  let book!: Book, runId!: string;
  try {
    book = (await seeded()).book; recordMissingCredentialConnection(first.store, '统合运行重启');
    runId = first.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy).projection.run!.reviewRunId;
    const driving = first.driver.drive(runId); await held;
    await first.owner.dispose(); await driving;
    expect(first.capture.abortedRequests).toHaveLength(1);
    expect(workspace(first, book).run!.synthesis?.state).toBe('missing');
    expect(workspace(first, book).run!.canContinue).toBe(false);
  } finally { await closeCapturedSession(first); }
  const second = await openCapturedSession();
  try {
    second.store.reconcileStoppedReviewCategoryRuns();
    await second.driver.drive(runId);
    expect(workspace(second, book, runId).run!.synthesis?.state).toBe('missing');
    expect(second.capture.requests).toHaveLength(0);
  } finally { await closeCapturedSession(second); }
});

it('uses identical synthesis wording in the pre-start plan and the frozen launched plan (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    let work = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS], WHOLE, launchPolicy);
    while (!work.done) work = session.store.advanceReviewRunPreparationWork(work.workId!);
    const prepared = session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: work.projection!.run!.reviewRunId });
    const launched = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy);
    const frozen = session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: launched.projection.run!.reviewRunId });
    expect(frozen.steps).toEqual(prepared.steps);
    expect(frozen.steps.find(step => step.id === 'category:run-synthesis')?.result).toBe(REVIEW_SYNTHESIS_PLAN_LINE);
    expect(session.capture.requests).toEqual([]);
  });
});

it('keeps cited quotations after an editor handles or removes their findings and freezes each report copy (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [STYLE], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    const report = session.store.generateReviewReport(book.bookId, run.reviewRunId).run!.report!;
    const entries = run.synthesis!.evidence.filter(entry => entry.blockId !== null && run.findings.some(finding => finding.findingId === entry.findingId && finding.markId !== null));
    const ignored = entries[0]!, removed = entries.find(entry => entry.findingId !== ignored.findingId)!;
    expect(removed).toBeDefined();
    session.store.recordReviewFindingDisposition(book.bookId, run.reviewRunId, ignored.findingId, '编辑决定保留原写法。');
    const mark = run.findings.find(finding => finding.findingId === removed.findingId)!;
    const window = session.store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: removed.blockId! });
    session.store.updateEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
      markId: mark.markId!, action: 'remove', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
    const current = workspace(session, book).run!;
    expect(current.synthesis!.evidence.find(entry => entry.ref === ignored.ref)).toMatchObject({ status: 'ignored', quote: ignored.quote });
    expect(current.synthesis!.evidence.find(entry => entry.ref === removed.ref)).toMatchObject({ status: 'absent', quote: removed.quote });
    expect(current.report!.record).toEqual(report.record);
    expect(canonicalRecord(current.report!.record).digest).toBe(report.digest);
  });
});

it('freezes inherited procedure instructions for synthesis and accepts the next selected version (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const materialText = '样书审阅参考：数字体例应结合全书用法解释。';
    const path = join(roots.inputRoot, 'review-reference.txt'); await writeFile(path, materialText, 'utf8');
    const preview = await session.store.previewLibraryMaterial(path);
    const material = await session.store.addLibraryMaterial({ previewId: preview.previewId, title: '样书审阅参考', kind: 'document' });
    setLibraryDecision(session.store, { materialId: material.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: book.bookId } } });
    setLibraryDecision(session.store, { materialId: material.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    session.store.startMaterialIndexing(); await session.store.settleMaterialIndexing();
    let preferenceEnabled = false;
    const stock = session.store.procedureLibrary({ action: 'inspect' }).procedures.find(procedure => procedure.procedureId === 'ai7-procedure/review-style-and-format')!;
    const pin = (procedure: typeof stock) => ({ procedureId: procedure.procedureId, version: procedure.version, digest: procedure.digest });
    let chosen = session.store.procedureLibrary({ action: 'save', input: { procedureId: null, basedOn: pin(stock), title: '样书数字体例审阅',
      editorInstruction: '对数字体例先核对全书用法。', stages: stock.document.stages.map((stage, index) => index === 0 ? { ...stage, exemptionRules: ['只提示编辑核对，不自动改写。'] } : stage) } }).procedures.find(procedure => procedure.document.title === '样书数字体例审阅')!;
    for (const text of ['对数字体例先核对全书用法。', '先解释全书脉络，再列待核对事项。']) {
      if (chosen.document.editorInstruction !== text) chosen = session.store.procedureLibrary({ action: 'save', input: { procedureId: chosen.procedureId,
        basedOn: pin(chosen), title: chosen.document.title, editorInstruction: text, stages: chosen.document.stages } }).procedures.find(procedure => procedure.procedureId === chosen.procedureId)!;
      session.store.procedureLibrary({ action: 'select', bookId: book.bookId, procedure: pin(chosen) });
      await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [STYLE], materialIds: [material.materialId], scope: WHOLE }, launchPolicy));
      expect(workspace(session, book).run!.synthesis?.state, synthesisOutcome(session, book)).toBe('completed');
      const request = session.capture.wireRequests.findLast(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))!;
      const system = request.messages.find(message => message.role === 'system')!.content;
      expect(system).toContain(text); expect(system).toContain(materialText); expect(system).toContain('只提示编辑核对，不自动改写。');
      if (preferenceEnabled) { expect(system).toContain('本社审阅与编辑偏好'); expect(system).toContain('保留本书体例'); }
      else {
        const run = workspace(session, book).run!, finding = run.findings.find(finding => finding.markId !== null)!;
        session.store.recordReviewFindingDisposition(book.bookId, run.reviewRunId, finding.findingId, '保留本书体例');
        const learning = session.store.inspectLearningMaterials(book.bookId).books[0]!.materials.find(entry => entry.kind === 'review-disposition')!;
        session.store.decideLearningMaterial({ bookId: book.bookId, materialKey: learning.materialKey, materialDigest: learning.digest, expectedDecisions: 0, choice: 'house', note: null });
        preferenceEnabled = true;
      }
    }
  });
});

it('inherits the first factual category’s editorial memory through the same frozen wrapper (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const instruction = '核对历史年代时保留叙述的保留措辞。';
    session.store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'factual-review', text: instruction, effect: 'guide' });
    expect(session.store.editorialMemory(book.bookId, 'factual-review')?.block).toContain(instruction);
    const search = session.store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
    session.store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); session.store.selectSearchBackend('search-tinyfish');
    const launched = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: ['factual-review', 'literary-expression'], evidenceAssuranceLevel: 'quick', scope: WHOLE }, launchPolicy);
    await driveLaunchedReviewRun(session.driver, launched);
    const run = workspace(session, book).run!;
    expect(run.synthesis?.state, synthesisOutcome(session, book)).toBe('completed');
    const request = session.capture.wireRequests.findLast(request => request.messages.some(message => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')))!;
    expect(request.messages.find(message => message.role === 'system')!.content).toContain(instruction);
    const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
    try {
      const envelopes = db.prepare(`SELECT t.kind,p.canonical_json FROM analysis_task_intents t JOIN analysis_plan_records p ON p.task_intent_id=t.task_intent_id AND p.component='plan-envelope' WHERE t.book_id=?`).all(book.bookId);
      const memory = (kind: string) => JSON.parse(String(envelopes.find(row => row.kind === kind)!.canonical_json)).editorialMemory;
      expect(memory('editorial-review/run-synthesis')).toEqual(memory('factual-review'));
    } finally { db.close(); }
  }, sample1SynthesisAnswer, {}, false, true);
});

it('keeps a prepared multi-category synthesis on the edited combined ceiling and permits clearing it (#1433)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    let work = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS, STYLE], WHOLE, launchPolicy);
    while (!work.done) work = session.store.advanceReviewRunPreparationWork(work.workId!);
    let run = work.projection!.run!;
    for (const ceiling of [200_000, 300_000, 999_999_999_999, null]) {
      const target = { bookId: book.bookId, kind: 'review-run' as const, ref: run.reviewRunId };
      const plan = session.store.inspectTaskPlan(target);
      session.store.editTaskPlan({ ...target, planEnvelopeDigest: plan.edit.planEnvelopeDigest!, removedSteps: [], disallowedAdaptations: [],
        runBudgetCeiling: ceiling === null ? null : { kind: 'tokens', maxTotalTokens: ceiling } });
      const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
      try {
        const rows = db.prepare(`SELECT t.kind,p.canonical_json FROM analysis_task_intents t JOIN analysis_plan_records p ON p.task_intent_id=t.task_intent_id
          AND p.plan_version=(SELECT max(v.ordinal) FROM analysis_plan_versions v WHERE v.task_intent_id=t.task_intent_id)
          AND p.component='provider-resolution-plan' WHERE t.book_id=? AND t.task_intent_id IN (
            SELECT json_extract(member.value,'$.task.taskIntentId') FROM review_runs r JOIN json_each(r.canonical_json,'$.categories') member WHERE r.review_run_id=?)`).all(book.bookId, run.reviewRunId);
        expect(rows.map(row => [row.kind, JSON.parse(String(row.canonical_json)).runBudgetCeiling])).toEqual(expect.arrayContaining([
          ['editorial-review/typos-and-usage', ceiling === null ? 'unset' : { kind: 'tokens', maxTotalTokens: ceiling }],
          ['editorial-review/style-and-format', ceiling === null ? 'unset' : { kind: 'tokens', maxTotalTokens: ceiling }],
          ['editorial-review/run-synthesis', ceiling === null ? 'unset' : { kind: 'tokens', maxTotalTokens: ceiling * 2 }],
        ]));
      } finally { db.close(); }
      work = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS, STYLE], WHOLE, launchPolicy);
      while (!work.done) work = session.store.advanceReviewRunPreparationWork(work.workId!);
      run = work.projection!.run!;
    }
    const current = workspace(session, book, run.reviewRunId).run!;
    session.store.authorizeReviewRun(book.bookId, run.reviewRunId, current.categories.map(category => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    await session.driver.drive(run.reviewRunId);
    expect(workspace(session, book).run!.synthesis?.state, synthesisOutcome(session, book)).toBe('completed');
  });
});


it.each([false, true])('bounds every contiguous manuscript run with paragraph-restating notes and baseline %s (#1433 R1 final additions)', async withBaseline => {
  await withCapturedReviewBook(async (session, book) => {
    if (withBaseline) {
      const baseline = session.store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, launchPolicy);
      session.owner.admitAndDispatch(baseline.runRecordId, session.store.baselineAnalysisLedger); await session.owner.whenIdle();
    }
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const request = session.capture.wireRequests.find(request => request.messages.some(message => sample1SynthesisAnswer(message.content) !== undefined))!;
    const allMessages = request.messages.map(message => message.content).join('\n');
    const payload = JSON.parse(request.messages.findLast(message => message.role === 'user')!.content);
    expect(payload.clusters.every((cluster: Record<string, unknown>) => !Object.hasOwn(cluster, 'topic') && typeof cluster.representativeRef === 'string')).toBe(true);
    expect(payload.findings.every((finding: { summary: string }) => [...finding.summary].length <= SYNTHESIS_TEXT_LIMIT)).toBe(true);
    expect(payload.evidence.every((evidence: { quote: string }) => [...evidence.quote].length <= SYNTHESIS_TEXT_LIMIT)).toBe(true);
    const bound = withBaseline ? 400 : SYNTHESIS_TEXT_LIMIT;
    if (withBaseline) {
      expect(payload.baseline.synopses.some((unit: { synopsis: string }) => [...unit.synopsis].length === 400)).toBe(true);
      expect(payload.baseline.synopses.every((unit: { synopsis: string }) => [...unit.synopsis].length <= 400)).toBe(true);
      const paragraph = session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).find(block => [...block.text].length > 400);
      expect(paragraph !== undefined && payload.baseline.synopses.some((unit: { synopsis: string }) => unit.synopsis === [...paragraph.text].slice(0, 400).join(''))).toBe(true);
      expect(REVIEW_SYNTHESIS_PLAN_LINE).toContain('每段最多 400 字');
      expect(REVIEW_SYNTHESIS_PLAN_LINE).toContain('各最多 80 字');
    }
    let oversized = false;
    for (const block of session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId)) {
      const words = [...block.text];
      for (let offset = 0; offset + bound < words.length; offset += 1)
        if (allMessages.includes(words.slice(offset, offset + bound + 1).join(''))) oversized = true;
    }
    expect(oversized).toBe(false);
    expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
  }, sample1SynthesisAnswer, {}, false, false, true, 0, withBaseline);
});

it('discloses partial category coverage and missing baseline units in the request and editorial summary (#1433 R3)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    const baseline = session.store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, launchPolicy);
    session.owner.admitAndDispatch(baseline.runRecordId, session.store.baselineAnalysisLedger); await session.owner.whenIdle();
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const request = session.capture.wireRequests.find(request => request.messages.some(message => sample1SynthesisAnswer(message.content) !== undefined))!;
    const payload = JSON.parse(request.messages.findLast(message => message.role === 'user')!.content);
    expect(payload.coverage[0]).toMatchObject({ unitsRead: 7, unitsTotal: 8, missingUnitOrdinals: [8] });
    expect(payload.baseline.missingUnitOrdinals).toContain(8);
    expect(payload.baseline.missingUnitOrdinals.length).toBe(8 - payload.baseline.synopses.length);
    const summary = workspace(session, book).run!.synthesis!;
    expect(summary.state).toBe('completed');
    expect(summary.detail).toContain('已读范围');
    expect(summary.missingCategories.some(label => label.includes('7/8'))).toBe(true);
    expect(summary.missingCategories.some(label => label.includes('基线概述') && label.includes('8'))).toBe(true);
  }, sample1SynthesisAnswer, {}, false, false, false, 8);
});

it('hides the internal synthesis from capture choices and usage links while accounting for its request (#1433 R4 R8)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    const library = session.store.procedureLibrary({ action: 'inspect' });
    expect(library.completedRuns.some(entry => entry.executorKind === 'editorial-review/run-synthesis')).toBe(false);
    expect(library.procedures.some(entry => entry.executorKind === 'editorial-review/run-synthesis')).toBe(false);
    const tasks = session.store.inspectBookTasks(book.bookId, () => null).groups.flatMap(group => group.items);
    expect(tasks.filter(entry => entry.item.target.kind === 'review')).toHaveLength(1);
    const attention = session.store.inspectGlobalAttention(() => null, false);
    expect(JSON.stringify(attention.groups.flatMap(group => group.items.map(item => item.target)))).not.toContain('editorial-review/run-synthesis');
    const usage = session.store.inspectUsage({ range: 'all', groupBy: 'book' }).rows.find(row => row.key === book.bookId)!;
    expect(usage.runs).toHaveLength(1);
    expect(usage.runs.some(entry => entry.taskKind === 'editorial-review/run-synthesis')).toBe(false);
    expect({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).toEqual({ inputTokens: run.usage!.inputTokens, outputTokens: run.usage!.outputTokens });
    const report = session.store.generateReviewReport(book.bookId, run.reviewRunId).run!.report!;
    expect(report.record.run.usage).toEqual(run.usage);
    const source = session.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE)).taskOutcome!.report!;
    const sourceTokens = Object.values(source.usagePerStage).reduce((sum, stage) => sum + stage.inputTokens + stage.outputTokens, 0);
    expect(run.usage!.inputTokens + run.usage!.outputTokens - sourceTokens).toBe(1080);
  });
});

it('offers no continuation when shutdown leaves no findings eligible for synthesis (#1433 R5)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); heldReleases.push(release);
  await withCapturedReviewBook(async (session, book) => {
    const launched = session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy);
    const driving = session.driver.drive(launched.projection.run!.reviewRunId); await held;
    await session.owner.dispose(); await driving;
    const run = workspace(session, book).run!;
    expect(run.state).toBe('failed'); expect(run.canContinue).toBe(false);
    expect(run.synthesis).toBeUndefined();
    expect(session.capture.requests.some(request => request.stage === 'cross-unit-reduction')).toBe(false);
  }, sample1SynthesisAnswer, { transportHold: async request => { if (request.stage === 'units') { reached(); await gate; } } });
});

it('reconciles a crash snapshot taken inside the synthesis transport at startup without resending (#1433 R7 R9c)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); heldReleases.push(release);
  const first = await openSeededSession(sample1SynthesisAnswer, { transportHold: async (_request, message) => { if (sample1SynthesisAnswer(message) !== undefined) { reached(); await gate; } } });
  const crashRoot = join(roots.inputRoot, 'crash-data');
  let book!: Book, runId!: string, findings: unknown;
  try {
    book = (await seeded()).book; recordMissingCredentialConnection(first.store, '统合崩溃快照');
    runId = first.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy).projection.run!.reviewRunId;
    void first.driver.drive(runId); await held;
    findings = workspace(first, book).run!.findings;
    await cp(roots.dataRoot, crashRoot, { recursive: true, filter: source => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
    const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
    try { await backup(db, join(crashRoot, 'store/ai7.sqlite')); } finally { db.close(); }
  } finally { await closeCapturedSession(first); }
  const second = await openCapturedSession(sample1SynthesisAnswer, {}, false, false, false, 0, crashRoot);
  try {
    second.store.reconcileStoppedReviewCategoryRuns();
    const run = workspace(second, book, runId).run!;
    expect(run.synthesis?.state).toBe('missing'); expect(run.canContinue).toBe(false);
    expect(run.findings).toEqual(findings);
    await second.driver.drive(runId); expect(second.capture.requests).toHaveLength(0);
  } finally { await closeCapturedSession(second); }
});

it.each([['```json\n', '\n```'], ['审阅总结：\n', '\n请逐条核对。']])('accepts the fenced or prose-wrapped ordinary synthesis answer %s (#1433 R6)', async (prefix, suffix) => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    expect(workspace(session, book).run!.synthesis?.state).toBe('completed');
    expect(workspace(session, book).run!.synthesis!.summary!.recurringProblems.length).toBeGreaterThan(0);
  }, message => { const answer = sample1SynthesisAnswer(message); return answer?.kind === 'unit-result' ? { ...answer, text: prefix + answer.text + suffix } : answer; });
});

it('shows no capacity omission for an under-capacity run of represented duplicates (#1433 re-review 1)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    const sent = session.capture.wireRequests.find(request => request.messages.some(message => sample1SynthesisAnswer(message.content) !== undefined))!;
    const input = JSON.parse(sent.messages.findLast(message => message.role === 'user')!.content);
    expect(input.clusters.reduce((sum: number, cluster: { count: number }) => sum + cluster.count, 0)).toBe(run.findings.length);
    expect(input.omitted.findings).toBe(0); expect(run.synthesis!.omissionLabel).toBeNull();
  }, sample1SynthesisAnswer, {}, false, false, true);
});
it('names an outcome-unknown synthesis editorially in the unconfirmed plan (#1433 re-review 5)', async () => {
  await withCapturedReviewBook(async (session, book) => {
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
    const run = workspace(session, book).run!;
    const plan = session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId });
    expect(plan.unconfirmed?.steps.some(step => step.category === '全书审阅统合总结')).toBe(true);
    expect(plan.unconfirmed?.steps.some(step => step.category === 'run-synthesis')).toBe(false);
  }, () => ({ kind: 'outcome-unknown', message: 'Captured ambiguous synthesis' }));
});
