import { seedModelEfforts } from '../support/model-effort-catalogue.js';
import { randomUUID } from 'node:crypto';
import { cp } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { driveLaunchedReviewRun, ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader, parseReviewCrossChapterMessage, REVIEW_CROSS_CHAPTER_RESULT_SCHEMA } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { loadModelFixture, resolveFixtureEntry, type ModelFixtureResponse } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection, ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { capturedMapAnswer, capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { sample1SynthesisAnswer } from '../support/review-synthesis-answer.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { renderReportExport } from '../../src/service/report-export.js';
import { strFromU8, unzipSync } from 'fflate';

// 生成统合总结 (Issue #1506): the summary alone for a settled Review Run, over the captured ordinary-production transport.
const TYPOS = 'typos-and-usage';
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const FAILED: ModelFixtureResponse = { kind: 'adapter-failure', code: 'CAPTURED_SYNTHESIS_FAILED', message: 'Captured synthesis failure', status: 400 };
const STAGE_FAILS = (call: number): boolean => call === 1;
let roots: ServiceTestRoots;
let requestGovernor: ModelRequestGovernor;
let launchPolicy: LaunchPolicyProjection;
let releases: Array<() => void>;
type Book = Awaited<ReturnType<typeof importSample1Book>>;
interface Session { store: EditorialStore; owner: ReturnType<typeof capturedOrdinaryExecution>['owner']; driver: ReviewRunDriver; capture: ReturnType<typeof capturedOrdinaryExecution> }
beforeEach(async () => { roots = await createServiceTestRoots('ai7-review-synthesis-only-'); requestGovernor = new ModelRequestGovernor(); releases = []; });
afterEach(async () => { for (const release of releases) release(); requestGovernor.close(); await requestGovernor.whenIdle(); await roots.dispose(); });

/** The synthesis answers whose ordinal `fails` names are refused; every other one is the authored SampleBook summary. */
async function openSession(fails: ((call: number) => boolean) | null, controls: Parameters<typeof capturedOrdinaryExecution>[5] = {}, emptyFindings = false,
  dataRoot = roots.dataRoot): Promise<Session> {
  const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-review-cross-chapter-controls');
  const store = await EditorialStore.open(dataRoot, roots.codeRoot);
  const typos = reviewCategoryKindDefinition(TYPOS_AND_USAGE);
  let synthesisCalls = 0;
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, dataRoot, requestGovernor, (request, message) => {
    const synthesis = sample1SynthesisAnswer(message);
    if (synthesis !== undefined) { synthesisCalls += 1; return fails?.(synthesisCalls) === true ? FAILED : synthesis; }
    const header = parseReviewCategoryUnitMessageHeader(message);
    if (request.stage === 'units' && header?.categoryId === TYPOS) return emptyFindings
      ? { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] }), usage: { inputTokens: 10, outputTokens: 5 } }
      : resolveFixtureEntry(fixture.entries, header.ordinal, typos.requestDigest(header.ordinal, header.unitDigest), request.attemptIndex)?.response;
    if (parseReviewCrossChapterMessage(message) !== null) return { kind: 'unit-result', text: JSON.stringify({ schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    const baseline = parseUnitMessageHeader(message);
    if (request.stage === 'units' && baseline !== null) return resolveFixtureEntry(fixture.entries, baseline.ordinal, unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, baseline.ordinal, baseline.unitDigest), request.attemptIndex)?.response;
    const content = request.stage === 'assurance-sampling' ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message)
      .map((ref) => ({ ref, disposition: '成立', reason: 'SampleBook 精确引文核对。' })) }
      : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? capturedMapAnswer(fixture.entries)(request, message) : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 5 } };
  }, controls);
  launchPolicy = capture.policy;
  return { store, owner: capture.owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, capture.owner), capture };
}
async function closeSession(session: Session): Promise<void> {
  for (const release of releases) release();
  const stopped = session.driver.dispose(); await session.owner.dispose(); await stopped;
  try { session.capture.assertMatched(); session.store.markCleanShutdown(); } finally { session.store.close(); }
}
async function importBook(session: Session, title: string, first = true): Promise<Book> {
  const book = await importSample1Book(session.store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(session.store, book.bookId);
  if (first) recordMissingCredentialConnection(session.store, title);
  return book;
}
/** A settled whole-book review of sample1 whose stage synthesis answered `first`. */
async function settledReview(session: Session, book: Book): Promise<string> {
  await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS], scope: WHOLE }, launchPolicy));
  return session.store.inspectReviewWorkspace(book.bookId, null).run!.reviewRunId;
}
const run = (session: Session, bookId: string, reviewRunId: string) => session.store.inspectReviewWorkspace(bookId, reviewRunId).run!;
const synthesisRequests = (session: Session) => session.capture.wireRequests.filter((request) =>
  request.messages.some((message) => message.content.includes('"schema":"ai7.review.run-synthesis-input/1"')));
const generate = (session: Session, bookId: string, reviewRunId: string, extra: { clientCommandId?: string; executionConfig?: { modelId: string; reasoningEffort: string } } = {},
  startWhen: 'now' | 'when-online' = 'now') => session.store.launchReviewSynthesis({ bookId, reviewRunId, clientCommandId: extra.clientCommandId ?? randomUUID(),
  ...(extra.executionConfig === undefined ? {} : { executionConfig: extra.executionConfig }) }, launchPolicy, startWhen);
function refusal(body: () => unknown): string | undefined {
  try { body(); } catch (error) { return (error as { code?: string }).code; }
  return undefined;
}

it('sends the stage’s own request once under the model chosen now, keeps every finding, and names that model (#1506)', async () => {
  const session = await openSession(STAGE_FAILS);
  try {
    const book = await importBook(session, 'sample1 单独统合');
    const runId = await settledReview(session, book);
    const before = run(session, book.bookId, runId);
    expect(before.synthesis?.state).toBe('missing');
    expect(before.synthesis?.canGenerate).toBe(true);
    expect(before.findings.length).toBeGreaterThan(0);
    const command = randomUUID();
    seedModelEfforts(session.store, 'opencode-go', { 'synthesis-only-model': ['high'] });
    const launched = generate(session, book.bookId, runId, { clientCommandId: command, executionConfig: { modelId: 'synthesis-only-model', reasoningEffort: 'high' } });
    expect(launched.repeated).toBe(false);
    await session.driver.drive(runId);
    const after = run(session, book.bookId, runId);
    expect(after.synthesis?.state).toBe('completed');
    expect(after.synthesis?.modelLabel).toContain('synthesis-only-model');
    expect(after.synthesis?.canGenerate).toBeUndefined();
    expect(after.state).toBe('settled');
    expect(after.findings).toEqual(before.findings);
    const [stage, alone] = synthesisRequests(session);
    expect(synthesisRequests(session)).toHaveLength(2);
    // Byte for byte the stage's request: the same system and user messages; only the model and its effort were chosen now.
    expect(alone!.messages).toEqual(stage!.messages);
    expect(alone!.model).toBe('synthesis-only-model'); expect(alone!.reasoning_effort).toBe('high');
    expect(stage!.model).not.toBe('synthesis-only-model');
    // A replayed command answers as the first did and sends nothing again; a summary already present refuses a new one.
    expect(generate(session, book.bookId, runId, { clientCommandId: command, executionConfig: { modelId: 'synthesis-only-model', reasoningEffort: 'high' } }).repeated).toBe(true);
    await session.driver.drive(runId);
    expect(synthesisRequests(session)).toHaveLength(2);
    expect(refusal(() => generate(session, book.bookId, runId))).toBe('REVIEW_SYNTHESIS_UNAVAILABLE');
    const report = session.store.generateReviewReport(book.bookId, runId).run!.report!;
    expect(report.record.synthesis?.summary).toEqual(after.synthesis?.summary);
    expect(report.record.synthesis?.modelLabel).toBe(after.synthesis?.modelLabel);
    // The published DOCX's summary carries its own source mark, the model 生成统合总结 used.
    const docx = renderReportExport({ bookTitle: 'sample1 单独统合', version: report.version, generatedAt: report.generatedAt, record: report.record }, 'docx', { emit: true });
    const xml = strFromU8(unzipSync(docx.bytes!)['word/document.xml']!);
    const summaryAt = xml.indexOf('>全书审阅统合总结</w:t>');
    expect(summaryAt).toBeGreaterThan(-1);
    expect(xml.indexOf(`>${after.synthesis!.modelLabel}</w:t>`, summaryAt)).toBeGreaterThan(summaryAt);
    expect(after.synthesis!.modelLabel).not.toBe(after.modelLabel);
  } finally { await closeSession(session); }
});

it('refuses 生成统合总结 for a run with no model finding (#1506)', async () => {
  const session = await openSession(null, {}, true);
  try {
    const book = await importBook(session, 'sample1 无发现统合');
    const runId = await settledReview(session, book);
    expect(run(session, book.bookId, runId).synthesis).toBeUndefined();
    expect(refusal(() => generate(session, book.bookId, runId))).toBe('REVIEW_SYNTHESIS_UNAVAILABLE');
    expect(synthesisRequests(session)).toHaveLength(0);
  } finally { await closeSession(session); }
});

it('counts every summary request in the Run’s usage: the stage’s and each 生成统合总结’s (#1506)', async () => {
  const session = await openSession(call => call <= 2);
  try {
    const book = await importBook(session, 'sample1 统合用量');
    const runId = await settledReview(session, book);
    const stage = run(session, book.bookId, runId).usage!.requests;
    // 预计 of a whole-book review (#1670): one request per part (this category has no cross-chapter step); the synthesis, sent only
    // when the findings span two parts, may add one, so 「至少」 holds.
    const estimate = session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: runId }).estimate!;
    expect([estimate.fewestRequests, estimate.more]).toEqual([estimate.parts, ['retry', 'sampling', 'synthesis', 'reflection']]);
    expect(stage).toBeGreaterThanOrEqual(estimate.fewestRequests);
    generate(session, book.bookId, runId);
    await session.driver.drive(runId);
    const first = run(session, book.bookId, runId);
    expect(first.synthesis?.state).toBe('missing');
    expect(first.usage!.requests).toBe(stage + 1);
    generate(session, book.bookId, runId);
    await session.driver.drive(runId);
    const second = run(session, book.bookId, runId);
    expect(second.synthesis?.state).toBe('completed');
    expect(second.usage!.requests).toBe(stage + 2);
    expect(synthesisRequests(session)).toHaveLength(3);
    // The 任务 rows and the plan count the page's requests, every summary included (#1670).
    const row = session.store.inspectBookTasks(book.bookId, () => null).groups.flatMap((group) => group.items)
      .find((entry) => (entry.item.target.kind === 'review' || entry.item.target.kind === 'review-plan') && entry.item.target.reviewRunId === runId)!;
    expect(row.work?.finished?.requests).toBe(second.usage!.requests);
    expect(session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: runId }).work).toEqual(row.work);
  } finally { await closeSession(session); }
});

it('refuses 生成统合总结 for a one-range chapter review and for a selection review (#1506)', async () => {
  const session = await openSession(null);
  try {
    const book = await importBook(session, 'sample1 单范围统合');
    const chapters = session.store.inspectReviewWorkspace(book.bookId, null).scopeOptions.chapters.chapters;
    // sample1's first chapter is one reading range with model findings.
    const first = chapters[0]!;
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS],
      scope: { kind: 'chapters', fromChapterBlockId: first.blockId, toChapterBlockId: first.blockId } }, launchPolicy));
    const oneRange = session.store.inspectReviewWorkspace(book.bookId, null).run!;
    // It has model findings: one range alone is why no summary is offered.
    expect(oneRange.findings.length).toBeGreaterThan(0);
    expect(oneRange.synthesis).toBeUndefined();
    expect(refusal(() => generate(session, book.bookId, oneRange.reviewRunId))).toBe('REVIEW_SYNTHESIS_UNAVAILABLE');
    // The summary it never sent was never counted among the fewest requests (#1670).
    const oneEstimate = session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: oneRange.reviewRunId }).estimate!;
    expect(oneEstimate.fewestRequests).toBe(oneEstimate.parts);
    expect(session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: oneRange.reviewRunId }).work!.finished!.requests).toBeGreaterThanOrEqual(oneEstimate.fewestRequests);
    const blocks = session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId);
    await driveLaunchedReviewRun(session.driver, session.store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: [TYPOS],
      scope: { kind: 'selection', fromChapterBlockId: blocks[0]!.blockId, toChapterBlockId: blocks[Math.min(blocks.length, 40) - 1]!.blockId } }, launchPolicy));
    const selection = session.store.inspectReviewWorkspace(book.bookId, null).run!;
    expect(selection.reviewRunId).not.toBe(oneRange.reviewRunId);
    expect(selection.scope.kind).toBe('selection');
    expect(selection.synthesis).toBeUndefined();
    expect(session.store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: selection.reviewRunId }).estimate!.more).not.toContain('synthesis');
    expect(refusal(() => generate(session, book.bookId, selection.reviewRunId))).toBe('REVIEW_SYNTHESIS_UNAVAILABLE');
    expect(synthesisRequests(session)).toHaveLength(0);
  } finally { await closeSession(session); }
});

it('generates the summary of a budget-reached run without inheriting the spent ceiling (#1506)', async () => {
  const session = await openSession(null);
  try {
    // The category's own reading, measured on a first Book, is the ceiling: the stage then sends no synthesis request.
    const measured = await importBook(session, 'sample1 预算测量');
    await settledReview(session, measured);
    const definition = reviewCategoryKindDefinition(TYPOS_AND_USAGE);
    const usage = session.store.inspectReviewCategory(measured.bookId, definition).taskOutcome!.report!.usagePerStage;
    const maxTotalTokens = Object.values(usage).reduce((sum, stage) => sum + stage.inputTokens + stage.outputTokens, 0);
    const spent = synthesisRequests(session).length;
    const book = await importBook(session, 'sample1 预算统合', false);
    let category = session.store.createReviewCategoryPreparationWork(book.bookId, definition, { mode: 'review-first', selectedRange: null }, launchPolicy);
    while (!category.done) category = session.store.advanceReviewCategoryPreparationWork(definition, category.workId!);
    const projection = category.projection!;
    session.store.reviewCategoryLedger(definition).editPlan(book.bookId, { taskIntentId: projection.taskIntent!.taskIntentId,
      planEnvelopeDigest: projection.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens } });
    let work = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS], WHOLE, launchPolicy);
    while (!work.done) work = session.store.advanceReviewRunPreparationWork(work.workId!);
    const prepared = work.projection!.run!;
    session.store.authorizeReviewRun(book.bookId, prepared.reviewRunId, prepared.categories.map(entry => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
    await session.driver.drive(prepared.reviewRunId);
    const before = run(session, book.bookId, prepared.reviewRunId);
    expect(before.synthesis?.state).toBe('budget');
    expect(before.synthesis?.canGenerate).toBe(true);
    expect(synthesisRequests(session)).toHaveLength(spent);
    generate(session, book.bookId, prepared.reviewRunId);
    await session.driver.drive(prepared.reviewRunId);
    const after = run(session, book.bookId, prepared.reviewRunId);
    expect(after.synthesis?.state).toBe('completed');
    expect(after.findings).toEqual(before.findings);
    expect(synthesisRequests(session)).toHaveLength(spent + 1);
  } finally { await closeSession(session); }
});

it('cancels a request under way without stopping the Run, refuses a second one meanwhile, and offers it again (#1506)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  releases.push(release);
  let calls = 0;
  const session = await openSession(STAGE_FAILS, { transportHold: async (_request, message) => {
    if (sample1SynthesisAnswer(message) !== undefined && ++calls === 2) { reached(); await gate; }
  } });
  try {
    const book = await importBook(session, 'sample1 取消单独统合');
    const runId = await settledReview(session, book);
    const before = run(session, book.bookId, runId);
    generate(session, book.bookId, runId);
    const driving = session.driver.drive(runId);
    await held;
    expect(run(session, book.bookId, runId).synthesis?.state).toBe('running');
    expect(refusal(() => generate(session, book.bookId, runId))).toBe('REVIEW_RUN_ACTIVE');
    const control = session.store.requestTaskRunControl({ bookId: book.bookId, kind: 'review-run', ref: runId, action: 'cancel' });
    session.owner.cancelRun(control.runRecordId!, control.ledger);
    release(); await driving;
    const after = run(session, book.bookId, runId);
    expect(session.capture.abortedRequests).toHaveLength(1);
    expect(after.synthesis?.state).toBe('missing');
    expect(after.synthesis?.canGenerate).toBe(true);
    expect(after.state).toBe('settled');
    expect(after.findings).toEqual(before.findings);
  } finally { await closeSession(session); }
});

it('waits offline, starts once on reconnect under the chosen model, and a waiting request cancels alone (#1506)', async () => {
  const session = await openSession(call => call === 1 || call === 3);
  try {
    const book = await importBook(session, 'sample1 联网后统合');
    const runId = await settledReview(session, book);
    seedModelEfforts(session.store, 'opencode-go', { 'offline-synthesis-model': ['high'] });
    const command = { clientCommandId: randomUUID(), executionConfig: { modelId: 'offline-synthesis-model', reasoningEffort: 'high' } };
    const launched = generate(session, book.bookId, runId, command, 'when-online');
    expect(launched.projection.run!.state).toBe('waiting');
    expect(launched.projection.run!.synthesis?.state).toBe('pending');
    expect(generate(session, book.bookId, runId, command, 'when-online').repeated).toBe(true);
    expect(synthesisRequests(session)).toHaveLength(1);
    const waiting = session.store.waitingTaskRuns(book.bookId).find(entry => entry.kind === 'review-run' && entry.ref === runId)!;
    expect(session.store.taskPreflightDrift(waiting)).toEqual([]);
    let driven = Promise.resolve();
    session.store.admitWaitingReviewRun(runId, () => { driven = session.driver.drive(runId); }); await driven;
    expect(run(session, book.bookId, runId).synthesis?.state).toBe('completed');
    expect(synthesisRequests(session)).toHaveLength(2);
    expect(synthesisRequests(session)[1]!.model).toBe('offline-synthesis-model');
    // A second Book's request that waits is cancelled alone: the Run is not cancelled, and nothing was sent.
    const other = await importBook(session, 'sample1 取消等待统合', false);
    const otherRun = await settledReview(session, other);
    generate(session, other.bookId, otherRun, {}, 'when-online');
    session.store.cancelWaitingTask({ bookId: other.bookId, kind: 'review-run', ref: otherRun });
    const cancelled = run(session, other.bookId, otherRun);
    expect(cancelled.state).toBe('settled');
    expect(cancelled.synthesis?.state).toBe('missing');
    expect(cancelled.synthesis?.canGenerate).toBe(true);
    expect(synthesisRequests(session)).toHaveLength(3);
  } finally { await closeSession(session); }
});

it('leaves 暂缺 when AI7 quits while the request is in flight, and sends nothing on the next start (#1506)', async () => {
  let reached!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  releases.push(release);
  let calls = 0;
  const first = await openSession(STAGE_FAILS, { transportHold: async (_request, message) => {
    if (sample1SynthesisAnswer(message) !== undefined && ++calls === 2) { reached(); await gate; }
  } });
  const crashRoot = join(roots.inputRoot, 'crash-data');
  let book!: Book, runId!: string, findings: unknown;
  try {
    book = await importBook(first, 'sample1 统合中退出');
    runId = await settledReview(first, book);
    findings = run(first, book.bookId, runId).findings;
    generate(first, book.bookId, runId);
    void first.driver.drive(runId); await held;
    await cp(roots.dataRoot, crashRoot, { recursive: true, filter: source => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
    const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
    try { await backup(db, join(crashRoot, 'store/ai7.sqlite')); } finally { db.close(); }
  } finally { await closeSession(first); }
  const second = await openSession(null, {}, false, crashRoot);
  try {
    second.store.reconcileStoppedReviewCategoryRuns();
    const after = run(second, book.bookId, runId);
    expect(after.synthesis?.state).toBe('missing');
    expect(after.synthesis?.canGenerate).toBe(true);
    expect(after.canContinue).toBe(false);
    expect(after.findings).toEqual(findings);
    await second.driver.drive(runId);
    expect(second.capture.requests).toHaveLength(0);
  } finally { await closeSession(second); }
});

