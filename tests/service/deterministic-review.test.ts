import { randomUUID } from 'node:crypto';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor, type ModelRequestPermit, type ModelRequestProducer } from '../../src/service/analysis/execution.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { readLocalStageArtifacts } from '../../src/service/review/review-runs.js';
import { graphemeCount } from '../../src/service/analysis/factual-review-contract.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import * as checker from '../../src/service/review/deterministic/checker.js';
import { PROCEDURE_DEFINITION_TRIGGER_SQL } from '../../src/service/procedures/definition-store.js';
import * as adapter from '../../src/service/provider/deepseek-adapter.js';
import * as broker from '../../src/service/provider/credential-broker.js';
import * as harness from '../../src/service/harness/primary-agent-harness.js';
import * as transport from '../../src/service/provider/live-transmission.js';
import { EditorialMarkStore } from '../../src/service/editorial-marks.js';
import { decodeRequest, ProtocolError } from '../../src/service/request-frames.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import type { LocalCheckOptions } from '../../src/shared/protocol/procedures.js';
import type { LaunchPolicyProjection, ReviewRunScopeRequest } from '../../src/shared/protocol.js';

// #1119 / J-05: exact admitted sample1 plus tester-authored edits, no fixture route or provider setup.
const OPTIONS: LocalCheckOptions = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] };
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-local-review-'); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); try { store?.close(); } catch { /* closed by a restart test */ } await roots.dispose(); });
function noModel(): ReviewRunExecutionOwner {
  return { get busy(): boolean { throw new Error('local stage consulted model governor'); },
    admitAndDispatch() { throw new Error('local stage dispatched a model'); },
    whenPlaceFree() { throw new Error('local stage requested model permit'); }, whenDone() { throw new Error('local stage awaited a model'); } };
}
type Book = Awaited<ReturnType<typeof importSample1Book>>;
function replaceFirst(book: Book, text: string): string {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((block) => block.kind === 'paragraph')!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: 0, toGrapheme: graphemeCount(block.text), insertText: text });
  return block.blockId;
}
function prepare(book: Book, policy: LaunchPolicyProjection, options = OPTIONS) {
  let work = store.createReviewRunPreparationWork(book.bookId, ['local-text-check'], WHOLE, policy, null, [], null, null, null, options);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const run = work.projection!.run!;
  const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId });
  expect(plan.start.needsModelConnection).toBe(false);
  expect(plan.start.categoryDigests).toEqual([{ categoryId: 'local-text-check', planEnvelopeDigest: run.localCheck!.planDigest }]);
  return { run, plan };
}
function authorize(book: Book, prepared: ReturnType<typeof prepare>) {
  store.authorizeReviewRun(book.bookId, prepared.run.reviewRunId, prepared.plan.start.categoryDigests);
}
function database() { return new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite')); }
function blockText(book: Book, blockId: string): string {
  return store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId }).blocks.find((block) => block.blockId === blockId)!.text;
}
describe('provider-free local ReviewRun', () => {
  it.each(['complete-and-reopen', 'cancel'] as const)('keeps local %s independent of four occupied real model permits (#1131)', async (mode) => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const route = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]; const connection = store.saveModelServiceConnection('本地检查旁的正式连接', null, 'ready', route.route);
    const binding = { ...route, credentialReference: connection.credentialReference };
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
    const launch = { operationalScope: 'ordinary-production' as const, policy, live: { scope: 'ordinary-production' as const, ...binding, runBudgetCeiling: 'unset' as const } };
    store.baselineAnalysisLedger.bindLaunch(launch);
    const book = await importSample1Book(store, roots.codeRoot, '本地检查与模型名额'); replaceFirst(book, '他停住了…又望向门口。');
    const prepared = prepare(book, policy); authorize(book, prepared);
    const nativeFetch = vi.fn(async () => { throw new Error('local check entered a model transport'); });
    const secret = vi.fn(async () => { throw new Error('local check consulted model readiness'); });
    const rules = vi.spyOn(checker, 'checkLocalPlan');
    let capacity = new ModelRequestGovernor(); let execution: BaselineAnalysisExecutionOwner | undefined; let driver: ReviewRunDriver | undefined;
    let producers: ModelRequestProducer[] = []; let permits: ModelRequestPermit[] = [];
    const occupy = async (): Promise<void> => {
      producers = Array.from({ length: 4 }, (_, index) => capacity.registerProducer({ key: `occupied:${index}`, kind: 'analysis-unit', lane: 'foreground' }));
      permits = await Promise.all(producers.map((producer) => capacity.acquire(producer, new AbortController().signal)));
    };
    const release = async (): Promise<void> => { for (const permit of permits) permit.release(); for (const producer of producers) capacity.unregisterProducer(producer); capacity.close(); await capacity.whenIdle(); };
    const realOwner = () => new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: store.baselineAnalysisLedger,
      launchPolicy: policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch }, secretResolver: { resolve: secret } });
    try {
      await occupy(); let acquire = vi.spyOn(capacity, 'acquire'); let register = vi.spyOn(capacity, 'registerProducer'); execution = realOwner();
      if (mode === 'cancel') {
        driver = new ReviewRunDriver(store.reviewRunDriveSteps, execution); const running = driver.drive(prepared.run.reviewRunId);
        store.cancelReviewRun(book.bookId, prepared.run.reviewRunId); await running;
        const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
        expect(run.state).toBe('cancelled'); expect(run.findings).toEqual([]);
      } else {
        const steps = store.reviewRunDriveSteps; steps.begin(prepared.run.reviewRunId);
        await steps.local!(prepared.run.reviewRunId, () => { const db = database(); try { return db.prepare('SELECT state FROM review_local_stage_artifacts ORDER BY sequence DESC LIMIT 1').get()?.state === 'completed'; } finally { db.close(); } });
        steps.end(prepared.run.reviewRunId);
        expect(store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!.localCheck!.state).toBe('completed');
        expect(rules).toHaveBeenCalledTimes(1); expect(acquire).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled();
        await execution.dispose(); await release(); store.markCleanShutdown(); store.close();
        store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); store.baselineAnalysisLedger.bindLaunch(launch);
        capacity = new ModelRequestGovernor(); await occupy(); acquire = vi.spyOn(capacity, 'acquire'); register = vi.spyOn(capacity, 'registerProducer'); execution = realOwner();
        driver = new ReviewRunDriver(store.reviewRunDriveSteps, execution); await driver.continue(prepared.run.reviewRunId);
        const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
        expect(run.state).toBe('settled'); expect(run.findings.length).toBeGreaterThan(0); expect(rules).toHaveBeenCalledTimes(1);
      }
      expect(acquire).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled(); expect(secret).not.toHaveBeenCalled(); expect(nativeFetch).not.toHaveBeenCalled();
      expect(capacity.snapshot()).toEqual({ registered: 4, waiting: 0, inFlight: 4, backgroundInFlight: 0 });
    } finally { const stopped = driver?.dispose(); await execution?.dispose(); await stopped; await release(); }
  });

  // The last variant has a ready, selected production model service bound to the launch, so a model path exists and stays untouched.
  for (const [scope, configured] of [['development-ci', false], ['ordinary-production', false], ['ordinary-production', true]] as const) it(`runs without any model under ${scope}${configured ? ' beside a configured model service' : ''}, converts, applies, reverses and reopens`, async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, scope, null);
    if (configured) {
      const route = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'deepseek-open-platform')!;
      const pending = store.saveModelServiceConnection('本地检查旁的模型服务', null, 'needs-attention', route.route);
      store.saveModelServiceConnection('本地检查旁的模型服务', pending.credentialReference, 'ready', route.route);
      store.selectModelServiceRoute(route.route);
      const binding = { ...route, credentialReference: pending.credentialReference };
      policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy, live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
    } else store.baselineAnalysisLedger.bindLaunch({ operationalScope: scope, policy, live: null });
    const book = await importSample1Book(store, roots.codeRoot, '本地检查公开样书');
    const target = replaceFirst(book, '🟦e\u0301他停住了…又望向门口。比例为.37%。');
    const traps = [vi.spyOn(adapter, 'DeepSeekOpenAiCompatibleAdapter').mockImplementation(() => { throw new Error('provider construction'); }),
      vi.spyOn(broker, 'CredentialBroker').mockImplementation(() => { throw new Error('credential broker'); }),
      vi.spyOn(harness, 'prepareExecution').mockImplementation(() => { throw new Error('DSH execution'); }),
      vi.spyOn(transport, 'transmitOnce').mockImplementation(() => { throw new Error('transport'); })];
    const fetchTrap = vi.fn(() => { throw new Error('network'); }); vi.stubGlobal('fetch', fetchTrap);
    const prepared = prepare(book, policy); authorize(book, prepared);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel());
    await driver.drive(prepared.run.reviewRunId); await driver.dispose();
    let run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.state).toBe('settled'); expect(run.report).not.toBeNull();
    expect(run.localCheck!.counts!.N01!.disabled).toBe(97);
    const finding = run.findings.find((finding) => finding.blockId === target && finding.stateLine?.startsWith('P02/'))!;
    expect(finding.output).toBe('annotation'); expect(finding.replacement).toBeNull(); expect(finding.markId).not.toBeNull();
    // Exact grapheme offsets past an astral and a combining grapheme; numerals stay off, so `.37%` produces no card.
    expect([finding.fromGrapheme, finding.toGrapheme, finding.quote]).toEqual([6, 7, '…']);
    expect(run.findings.some((item) => item.stateLine?.startsWith('N0'))).toBe(false);
    expect(run.report!.record.appendix.categories).toEqual([expect.objectContaining({ categoryId: 'local-text-check', adapterPin: null, planEnvelopeDigest: prepared.run.localCheck!.planDigest })]);
    const original = blockText(book, target);
    const binding = () => ({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: target }).blocks[0]!.blockId });
    const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: target });
    const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, finding.markId!);
    const converted = store.updateEditorialMark({ ...binding(), markId: finding.markId!, action: 'convert', body: null, highlightColor: null, status: null, rationale: null, targetKind: 'change-suggestion', proposedText: '……' });
    expect(converted.card!.convertedFrom?.markId).toBe(finding.markId);
    const applied = store.applyChangeSuggestion({ ...binding(), markId: converted.card!.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    // The editor's replacement is written, never one the checker supplied; reversal restores the tester-edited text.
    expect(blockText(book, target)).toBe(original.replace('了…又', '了……又'));
    const reversed = store.reverseAppliedChangeSuggestion({ ...binding(), markId: converted.card!.markId, clientEffectId: randomUUID() });
    expect(reversed.application.reversesEffectId).toBe(applied.application.effectId);
    expect(blockText(book, target)).toBe(original);
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, converted.card!.markId).pinnedText === card.pinnedText).toBe(true);
    for (const trap of traps) expect(trap).not.toHaveBeenCalled(); expect(fetchTrap).not.toHaveBeenCalled();
    const db = database(); const before = readLocalStageArtifacts(db, run.reviewRunId).map((artifact) => artifact.digest);
    expect(before.length).toBe(3); expect(db.prepare('SELECT count(*) n FROM analysis_run_records').get()!.n).toBe(0); db.close();
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    run = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(run.state).toBe('settled'); expect(run.localCheck!.planDigest).toBe(prepared.run.localCheck!.planDigest);
    const repeat = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await repeat.drive(run.reviewRunId); await repeat.dispose();
    const reopened = database(); expect(readLocalStageArtifacts(reopened, run.reviewRunId).map((artifact) => artifact.digest)).toEqual(before); reopened.close();
  });
  it('refuses source drift before approval and before execution', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地漂移样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    replaceFirst(book, '他停住了…又望向门口。'); const first = prepare(book, policy);
    replaceFirst(book, '他停住了……又望向门口。'); expect(() => authorize(book, first)).toThrow();
    const next = prepare(book, policy); authorize(book, next); replaceFirst(book, '她停住了…又望向门口。');
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.drive(next.run.reviewRunId); await driver.dispose();
    const run = store.inspectReviewWorkspace(book.bookId, next.run.reviewRunId).run!;
    expect(run.localCheck!.state).toBe('refused'); expect(run.canContinue).toBe(false); expect(run.findings.length).toBe(0);
  });

  it('cancels cooperatively with no partial marks and never continues a cancelled stage', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地取消样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '甲'.repeat(100) + '…');
    const prepared = prepare(book, policy); authorize(book, prepared);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); const driving = driver.drive(prepared.run.reviewRunId);
    store.cancelReviewRun(book.bookId, prepared.run.reviewRunId); await driving; await driver.dispose();
    const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.state).toBe('cancelled'); expect(run.canContinue).toBe(false); expect(run.findings.length).toBe(0);
    const repeat = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); expect(() => repeat.continue(run.reviewRunId)).toThrow(); await repeat.dispose();
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.state).toBe('cancelled');
  });

  it('reconciles a durable started crash without auto-running and explicitly continues the exact plan', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地中断样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '他停住了…又望向门口。');
    const prepared = prepare(book, policy); authorize(book, prepared); store.markCleanShutdown(); store.close();
    // Exact durable boundary fixture: the service stopped after committing started, before a chunk returned.
    const db = database(); const snapshot = JSON.parse(String(db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(prepared.run.reviewRunId)!.canonical_json));
    const attemptId = randomUUID(); const instant = new Date().toISOString();
    const artifact = canonicalRecord({ schema: 'ai7.review.local-stage-artifact/1', reviewRunId: prepared.run.reviewRunId, categoryId: 'local-text-check', sequence: 1,
      attemptId, state: 'started', planDigest: snapshot.localPlan.digest, procedure: snapshot.localPlan.procedure, source: snapshot.localPlan.source, previousDigest: null,
      recordedAt: instant, result: null, detail: '正在本机检查冻结正文。' });
    db.prepare('INSERT INTO review_local_stage_artifacts VALUES (?, 1, ?, \'started\', ?, ?, ?, ?)').run(prepared.run.reviewRunId, attemptId, snapshot.localPlan.digest, instant, artifact.json, artifact.digest); db.close();
    const execution = vi.spyOn(checker, 'checkLocalPlan');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(execution).not.toHaveBeenCalled(); expect(run.canContinue).toBe(true); expect(run.localCheck!.state).toBe('interrupted'); expect(run.findings.length).toBe(0);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.continue(run.reviewRunId); await driver.dispose();
    run = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(run.state).toBe('settled'); expect(execution).toHaveBeenCalledTimes(1);
    const after = database(); const artifacts = readLocalStageArtifacts(after, run.reviewRunId); after.close();
    expect(artifacts.map(({ record }) => record.state)).toEqual(['started', 'interrupted', 'started', 'completed', 'materialized']);
    expect(artifacts[2]!.record.attemptId).not.toBe(attemptId); expect(artifacts.every(({ record }) => record.planDigest === prepared.run.localCheck!.planDigest)).toBe(true);
  });

  it('resumes a committed completion without checking again and excludes an invalid candidate visibly', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地完成边界样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); const target = replaceFirst(book, '他停住了…又望向门口。');
    const prepared = prepare(book, policy); authorize(book, prepared); const steps = store.reviewRunDriveSteps;
    steps.begin(prepared.run.reviewRunId);
    await steps.local!(prepared.run.reviewRunId, () => { const db = database(); try { return db.prepare('SELECT state FROM review_local_stage_artifacts ORDER BY sequence DESC LIMIT 1').get()?.state === 'completed'; } finally { db.close(); } });
    steps.end(prepared.run.reviewRunId);
    expect(store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!.localCheck!.state).toBe('completed');
    store.markCleanShutdown(); store.close();
    const db = database(); const before = readLocalStageArtifacts(db, prepared.run.reviewRunId); const completed = before.at(-1)!.record;
    // A candidate failing its exact anchor is dropped alone, while the valid sibling still becomes a mark.
    const original = completed.result!.candidates.find((candidate) => candidate.blockId === target)!;
    const invalid = { ...original, id: 'f'.repeat(64), from: 9000, to: 9001 };
    const changed = canonicalRecord({ ...completed, result: { ...completed.result, candidates: [...completed.result!.candidates, invalid] } });
    db.exec('DROP TRIGGER review_local_stage_artifacts_no_update');
    db.prepare('UPDATE review_local_stage_artifacts SET canonical_json = ?, sha256 = ? WHERE review_run_id = ? AND sequence = 2').run(changed.json, changed.digest, prepared.run.reviewRunId);
    db.exec("CREATE TRIGGER review_local_stage_artifacts_no_update BEFORE UPDATE ON review_local_stage_artifacts BEGIN SELECT RAISE(ABORT, 'REVIEW_LOCAL_STAGE_IMMUTABLE'); END"); db.close();
    const execution = vi.spyOn(checker, 'checkLocalPlan').mockImplementation(() => { throw new Error('completed stage rerun'); });
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel());
    await driver.continue(prepared.run.reviewRunId); await driver.dispose();
    const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.state).toBe('settled'); expect(execution).not.toHaveBeenCalled(); expect(run.localCheck!.excluded.some((entry) => entry.candidateId === invalid.id)).toBe(true);
    expect(run.findings.some((finding) => finding.blockId === target)).toBe(true);
    const after = database(); expect(readLocalStageArtifacts(after, run.reviewRunId).at(-1)!.record.state).toBe('materialized'); after.close();
  });

  it('refuses source drift after a committed completion without materializing or checking again', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地完成后漂移样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '他停住了…又望向门口。');
    const prepared = prepare(book, policy); authorize(book, prepared); const steps = store.reviewRunDriveSteps;
    const execution = vi.spyOn(checker, 'checkLocalPlan');
    steps.begin(prepared.run.reviewRunId);
    await steps.local!(prepared.run.reviewRunId, () => { const db = database(); try { return db.prepare('SELECT state FROM review_local_stage_artifacts ORDER BY sequence DESC LIMIT 1').get()?.state === 'completed'; } finally { db.close(); } });
    steps.end(prepared.run.reviewRunId);
    replaceFirst(book, '她停住了…又望向门口。');
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.continue(prepared.run.reviewRunId); await driver.dispose();
    const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.localCheck!.state).toBe('refused'); expect(run.findings).toEqual([]); expect(run.canContinue).toBe(false); expect(execution).toHaveBeenCalledTimes(1);
    const db = database(); expect(readLocalStageArtifacts(db, run.reviewRunId).map(({ record }) => record.state)).toEqual(['started', 'completed', 'refused']);
    expect(db.prepare("SELECT count(*) n FROM editorial_marks WHERE source_origin = 'review-category'").get()!.n).toBe(0); db.close();
  });

  it('needs the explicit options on the wire: a local check without them is refused, and exact options decode unchanged', () => {
    const frame = (input: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify({ id: randomUUID(), op: 'prepareReviewRun', input }));
    const local = { bookId: randomUUID(), categoryIds: ['local-text-check'], scope: WHOLE };
    expect(() => decodeRequest(frame(local))).toThrow(ProtocolError);
    expect(() => decodeRequest(frame({ ...local, localCheck: null }))).toThrow(ProtocolError);
    const decoded = decodeRequest(frame({ ...local, localCheck: OPTIONS }));
    expect(decoded).toMatchObject({ op: 'prepareReviewRun', input: { categoryIds: ['local-text-check'], localCheck: OPTIONS } });
  });

  it('freezes explicit exclusions into the plan and refuses one outside the frozen paragraphs in its own words', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地排除样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); const target = replaceFirst(book, '外语…片段。他停住了…又望向门口。');
    const excluded = { ...OPTIONS, excludedRanges: [{ blockId: target, from: 0, to: 3, reason: 'foreign' as const }] };
    const prepared = prepare(book, policy, excluded); expect(prepared.run.localCheck!.options.excludedRanges).toEqual(excluded.excludedRanges); authorize(book, prepared);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.drive(prepared.run.reviewRunId); await driver.dispose();
    const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.findings.filter((finding) => finding.blockId === target).map((finding) => [finding.fromGrapheme, finding.toGrapheme])).toEqual([[10, 11]]);
    expect(run.localCheck!.counts!.P02!.exempt).toBeGreaterThan(0);
    const outside = { ...OPTIONS, excludedRanges: [{ blockId: `blk_${'0'.repeat(24)}`, from: 0, to: 1, reason: 'technical' as const }] };
    let refusal: unknown;
    try { store.createReviewRunPreparationWork(book.bookId, ['local-text-check'], WHOLE, policy, null, [], null, null, null, outside); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(StoreError); expect(refusal).toMatchObject({ code: 'LOCAL_PLAN_INVALID', message: '本地检查计划或输入无效；请重新准备。' });
  });

  it('migrates genuine schema89 additively, tolerates a committed pre-stamp table and rejects corrupted artifact chains', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地迁移样书');
    store.markCleanShutdown(); store.close(); let db = database(); const prior = db.prepare('SELECT * FROM books').all();
    db.exec('DROP TABLE review_local_stage_artifacts; DROP TRIGGER procedure_definition_versions_no_delete; DROP TRIGGER procedure_definitions_no_delete;');
    db.exec("DELETE FROM procedure_definition_versions WHERE procedure_id = 'ai7-procedure/local-text-check'; DELETE FROM procedure_definitions WHERE procedure_id = 'ai7-procedure/local-text-check'; PRAGMA user_version = 89");
    db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL['procedure_definition_versions_no_delete']!); db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL['procedure_definitions_no_delete']!); db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); store.markCleanShutdown(); store.close(); db = database();
    expect(db.prepare('SELECT * FROM books').all()).toEqual(prior); expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(94);
    db.exec('PRAGMA user_version = 89'); db.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '他停住了…又望向门口。'); const prepared = prepare(book, policy); authorize(book, prepared);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.drive(prepared.run.reviewRunId); await driver.dispose(); store.markCleanShutdown(); store.close();
    db = database(); const record = readLocalStageArtifacts(db, prepared.run.reviewRunId).at(-1)!.record;
    expect(() => db.exec('UPDATE review_local_stage_artifacts SET sequence = sequence')).toThrow();
    const tampered = canonicalRecord({ ...record, previousDigest: '0'.repeat(64) }); db.exec('DROP TRIGGER review_local_stage_artifacts_no_update');
    db.prepare('UPDATE review_local_stage_artifacts SET canonical_json = ?, sha256 = ? WHERE review_run_id = ? AND sequence = 3').run(tampered.json, tampered.digest, prepared.run.reviewRunId);
    db.exec("CREATE TRIGGER review_local_stage_artifacts_no_update BEFORE UPDATE ON review_local_stage_artifacts BEGIN SELECT RAISE(ABORT, 'REVIEW_LOCAL_STAGE_IMMUTABLE'); END"); db.close();
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  });

  it('rolls back marks and findings at a materialization crash and continues from completion without checking again', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地物化回滚样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '他停住了…又望向门口。'); const prepared = prepare(book, policy); authorize(book, prepared);
    let stopping = false; let injected = false;
    const original = EditorialMarkStore.prototype.createProducedMany;
    const write = vi.spyOn(EditorialMarkStore.prototype, 'createProducedMany').mockImplementation(function (this: EditorialMarkStore, inputs, persist) {
      return original.call(this, inputs, (created) => { persist(created); stopping = true; injected = true; throw new Error('simulated shutdown before materialization commit'); });
    });
    const execution = vi.spyOn(checker, 'checkLocalPlan'); const steps = store.reviewRunDriveSteps; steps.begin(prepared.run.reviewRunId);
    await steps.local!(prepared.run.reviewRunId, () => stopping); steps.end(prepared.run.reviewRunId); write.mockRestore();
    expect(injected).toBe(true); expect(execution).toHaveBeenCalledTimes(1);
    let db = database(); expect(readLocalStageArtifacts(db, prepared.run.reviewRunId).map(({ record }) => record.state)).toEqual(['started', 'completed']);
    expect(db.prepare('SELECT count(*) n FROM review_findings').get()!.n).toBe(0);
    expect(db.prepare("SELECT count(*) n FROM editorial_marks WHERE source_origin = 'review-category'").get()!.n).toBe(0); db.close();
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!.canContinue).toBe(true);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.continue(prepared.run.reviewRunId); await driver.dispose();
    expect(execution).toHaveBeenCalledTimes(1); db = database(); expect(readLocalStageArtifacts(db, prepared.run.reviewRunId).at(-1)!.record.state).toBe('materialized');
    expect(Number(db.prepare('SELECT count(*) n FROM review_findings').get()!.n)).toBeGreaterThan(0); db.close();
  });

  it('exports and merges the selected Book with exact source pins, artifact digests and marks, without importing runnable authority', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); const book = await importSample1Book(store, roots.codeRoot, '本地合并样书');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot); replaceFirst(book, '他停住了…又望向门口。'); const prepared = prepare(book, policy); authorize(book, prepared);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await driver.drive(prepared.run.reviewRunId); await driver.dispose();
    const source = database(); const before = readLocalStageArtifacts(source, prepared.run.reviewRunId); source.close();
    const runBefore = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    // Source clock is deliberately ahead of the destination's import clock; authority uses provenance, never date ordering.
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const unstarted = prepare(book, policy); authorize(book, unstarted); vi.useRealTimers();
    const exported = join(roots.inputRoot, 'local-check.ai7db'); const preparation = await store.prepareDatabaseExport(exported, true);
    expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
    store.markCleanShutdown(); store.close();
    const targetRoot = join(roots.inputRoot, 'local-target'); await mkdir(targetRoot, { recursive: true });
    store = await EditorialStore.open(targetRoot, roots.codeRoot); const localBook = store.prepareBookCreation('目标原有图书', null);
    const targetBook = store.commitBookCreation({ ...localBook.proposed, reviewDigest: localBook.reviewDigest }).overview.book.bookId;
    const preview = await store.inspectDatabaseImport(exported); await store.prepareDatabaseMerge(preview.previewId, new Date()); store.markCleanShutdown(); store.close();
    store = await EditorialStore.open(targetRoot, roots.codeRoot);
    const run = store.inspectReviewWorkspace(book.bookId, prepared.run.reviewRunId).run!;
    expect(run.state).toBe('settled'); expect(run.localCheck!.planDigest).toBe(runBefore.localCheck!.planDigest); expect(run.findings.map((finding) => finding.markId)).toEqual(runBefore.findings.map((finding) => finding.markId));
    expect(store.getBookOverview(targetBook).book.bookId).toBe(targetBook);
    const merged = new DatabaseSync(join(targetRoot, 'store', 'ai7.sqlite')); const artifacts = readLocalStageArtifacts(merged, run.reviewRunId);
    expect(artifacts.map((artifact) => artifact.digest)).toEqual(before.map((artifact) => artifact.digest));
    expect(artifacts.map((artifact) => artifact.record.source)).toEqual(before.map((artifact) => artifact.record.source)); merged.close();
    const execution = vi.spyOn(checker, 'checkLocalPlan').mockImplementation(() => { throw new Error('imported stage rerun'); });
    const repeat = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await repeat.drive(run.reviewRunId); await repeat.dispose(); expect(execution).not.toHaveBeenCalled();
    const importedAuthority = new ReviewRunDriver(store.reviewRunDriveSteps, noModel()); await importedAuthority.drive(unstarted.run.reviewRunId); await importedAuthority.dispose();
    expect(execution).not.toHaveBeenCalled(); expect(store.inspectReviewWorkspace(book.bookId, unstarted.run.reviewRunId).run!.localCheck!.state).toBe('refused');
    execution.mockRestore();
    const fresh = prepare(book, policy); authorize(book, fresh); const own = new ReviewRunDriver(store.reviewRunDriveSteps, noModel());
    await own.drive(fresh.run.reviewRunId); await own.dispose(); expect(store.inspectReviewWorkspace(book.bookId, fresh.run.reviewRunId).run!.state).toBe('settled');
  });
});
