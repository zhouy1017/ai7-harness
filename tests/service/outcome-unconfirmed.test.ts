import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, OUTCOME_UNKNOWN_NOT_RESENT } from '../../src/service/analysis/execution.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { fixtureEntryKey, loadLaunchFixture, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { EditorialStore, StoreError, UNCONFIRMED_CHANGED } from '../../src/service/store.js';
import { categoryResendDisclosure, resendDisclosure } from '../../src/service/task-plan.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisUpdateRequest,
  type BaselineAnalysisProjection,
  type GlobalAttentionItemProjection,
  type LaunchPolicyProjection,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
} from '../../src/shared/protocol.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { MATERIAL_INDEX_SCHEMA_VERSION, OUTCOME_RESOLUTION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';

// Service-integration suite (L2) for 结果待确认 a completed Run left (Issue #757; V2-UX-ATTN-002, NOTIF-004, CTRL-007, CONT-011;
// execution CONTEXT.md, Manual Outcome Resolution): the real store on a temporary Agent Data Root, exact `sample1` imported
// through the supported path, and the deterministic route over authored fixtures edited in memory so that one request is sent
// and its answer never comes back whole. No Provider, socket or credential value. A kind that keeps no progress reads on past
// such a range and completes, and any kind reads on past such a step: 待我处理 lists it in 异常与结果待确认, the kind's plan lists
// it, a later Task that sends the range again says so before it starts, and it is settled by a later Run that reads the range
// or by the editor's 保留为缺口, which records only that.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const DROPPED = { kind: 'outcome-unknown' as const, message: '合成：回答没有完整传回。' };

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-outcome-unconfirmed-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  writeFileSync(join(roots.dataRoot, '..', 'j10-unit-hold.txt'), 'release');
});

afterEach(async () => {
  await roots.dispose();
});

function open(fixture: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

function ownerOf(store: EditorialStore, fixture: ResolvedModelFixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

/** The fixture with every entry `drop` names answering 结果待确认 instead; identity and digest stay, as the route bound them. */
function dropping(fixture: ResolvedModelFixture, drop: (entry: ModelFixtureEntry) => boolean): ResolvedModelFixture {
  return { ...fixture, entries: new Map([...fixture.entries].map(([key, entry]) => [key, drop(entry) ? { ...entry, response: DROPPED } : entry])) };
}

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

async function book(store: EditorialStore, title: string): Promise<string> {
  await requireExactSample1(roots.codeRoot);
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

function unconfirmedItem(store: EditorialStore, bookId: string, surface: string): GlobalAttentionItemProjection | undefined {
  const view = store.inspectGlobalAttention(() => null, false);
  return view.groups.flatMap((group) => group.items).find((entry) => entry.itemId === `unconfirmed:${bookId}:${surface}`);
}

/** Every row the analysis ledger and its neighbours hold, read whole: what a resolution must leave exactly as it was. */
function ledgerRows(): string {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return JSON.stringify(['analysis_result_set_revisions', 'analysis_unit_results', 'analysis_task_outcomes', 'analysis_run_states', 'analysis_harness_spans']
      .map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  } finally {
    database.close();
  }
}

function resolutionRows(): Array<{ book_id: string; canonical_json: string }> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return database.prepare('SELECT book_id, canonical_json FROM analysis_outcome_resolutions ORDER BY rowid').all() as Array<{ book_id: string; canonical_json: string }>;
  } finally {
    database.close();
  }
}

describe('结果待确认 a completed Run left (Issue #757)', () => {
  it('lists a range a completed Review Run left 结果待确认, discloses its re-send, and keeps it as a gap on 保留为缺口', async () => {
    const fixture = dropping(await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored'), (entry) => entry.unitOrdinal === 3);
    const store = await open(fixture);
    const execution = ownerOf(store, fixture);
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, execution);
    const prepareRun = (bookId: string): ReviewRunProjection => {
      let progress = store.createReviewRunPreparationWork(bookId, [TYPOS_AND_USAGE.categoryId], WHOLE, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      return progress.projection!.run!;
    };
    try {
      const bookId = await book(store, 'L2 sample1 审阅结果待确认');
      const first = prepareRun(bookId);
      store.authorizeReviewRun(bookId, first.reviewRunId, first.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      await driver.drive(first.reviewRunId);
      // The category keeps no progress: unit 3 is its own gap and the Run reached the manuscript.
      const category = store.inspectReviewWorkspace(bookId, first.reviewRunId).run!.categories[0]!;
      expect(category.state).toBe('settled');

      // 待我处理: 异常与结果待确认, counted, never blocking, next step 查看未确认的部分 on the Review Run's plan.
      const item = unconfirmedItem(store, bookId, 'review-run');
      expect(item).toMatchObject({
        group: 'exceptions',
        state: 'analysis-outcome-unconfirmed',
        blocked: false,
        nextStep: 'view-unconfirmed',
        target: { kind: 'task-plan', bookId, taskKind: 'review-run', ref: first.reviewRunId },
        object: { kind: 'unconfirmed', taskKind: 'review-run', ranges: 1, steps: [] },
      });
      expect(store.inspectGlobalAttention(() => null, false).actionableCount).toBeGreaterThanOrEqual(1);
      const plan = store.inspectTaskPlan({ bookId, kind: 'review-run', ref: first.reviewRunId });
      expect(plan.unconfirmed).toMatchObject({ ranges: [{ unitOrdinal: 3, category: TYPOS_AND_USAGE.label }], steps: [] });

      // A second 审阅 of the category reads unit 3 again: its plan says so before it starts.
      const second = prepareRun(bookId);
      const secondPlan = store.inspectTaskPlan({ bookId, kind: 'review-run', ref: second.reviewRunId });
      expect(secondPlan.resend).toEqual({ units: [3], statement: categoryResendDisclosure([{ category: TYPOS_AND_USAGE.label, units: [3] }]) });
      expect(secondPlan.unconfirmed?.digest).toBe(plan.unconfirmed!.digest);
      // The item names the latest Review Run's plan now.
      expect(unconfirmedItem(store, bookId, 'review-run')?.target).toEqual({ kind: 'task-plan', bookId, taskKind: 'review-run', ref: second.reviewRunId });

      // 保留为缺口: a list that moved is refused; the list on show is recorded, with its manual evidence class, and nothing else.
      const before = ledgerRows();
      expect(await refusal(() => store.resolveUnconfirmedOutcomes(bookId, 'review-run', 'f'.repeat(64)))).toBe('UNCONFIRMED_CHANGED');
      expect(UNCONFIRMED_CHANGED).toBe('结果待确认的列表已经变化；请重新查看后再确认。');
      expect(await refusal(() => store.resolveUnconfirmedOutcomes(bookId, 'fixed-task', plan.unconfirmed!.digest))).toBe('UNCONFIRMED_INVALID');
      expect(store.resolveUnconfirmedOutcomes(bookId, 'review-run', plan.unconfirmed!.digest)).toEqual({ resolved: 1 });
      expect(ledgerRows()).toBe(before);
      const rows = resolutionRows();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.canonical_json)).toMatchObject({
        schema: 'ai7.analysis.outcome-resolution/1', bookId, surface: 'review-run', determination: 'kept-as-gap', evidenceClass: 'manual',
      });
      expect(unconfirmedItem(store, bookId, 'review-run')).toBeUndefined();
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: second.reviewRunId }).unconfirmed).toBeNull();
      // Kept as a gap is not read: the next 审阅 still says it sends unit 3 again, and a second resolution has nothing to settle.
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: second.reviewRunId }).resend?.units).toEqual([3]);
      expect(await refusal(() => store.resolveUnconfirmedOutcomes(bookId, 'review-run', plan.unconfirmed!.digest))).toBe('UNCONFIRMED_CHANGED');
      store.markCleanShutdown();
    } finally {
      await driver.dispose();
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('lists what an interrupted 初评 left 结果待确认: an outcome that is not a completion still names the range (#763 review)', async () => {
    const authored = await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored');
    // Unit 3's answer never comes back whole; unit 6's turn is cut off, which ends a Run that keeps no progress `interrupted`.
    const fixture: ResolvedModelFixture = {
      ...authored,
      entries: new Map([...authored.entries].map(([key, entry]) => [key, entry.unitOrdinal === 3 ? { ...entry, response: DROPPED }
        : entry.unitOrdinal === 6 ? { ...entry, response: { kind: 'interrupted' as const, message: '合成：技术回合被中断。' } } : entry])),
    };
    const store = await open(fixture);
    const execution = ownerOf(store, fixture);
    try {
      const bookId = await book(store, 'L2 sample1 初评中断结果待确认');
      let progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(execution.admitOrQueue(authorized.dispatchRunRecordId!, store.initialEvaluationLedger)).toBe('admitted');
      await execution.whenIdle();
      const ended = store.inspectInitialEvaluation(bookId);
      expect(ended.taskOutcome?.classification).toBe('interrupted');
      expect(store.baselineAnalysisLedger.unconfirmedOutcomesOf(bookId, ended.kind).ranges.map((range) => [range.unitOrdinal, range.classification]))
        .toEqual([[3, 'interrupted']]);
      expect(unconfirmedItem(store, bookId, 'initial-evaluation')).toMatchObject({
        state: 'analysis-outcome-unconfirmed', target: { kind: 'task-plan', bookId, taskKind: 'initial-evaluation', ref: null },
        object: { kind: 'unconfirmed', taskKind: 'initial-evaluation', ranges: 1, steps: [] },
      });
      expect(store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: null }).unconfirmed?.ranges.map((range) => range.unitOrdinal)).toEqual([3]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('clears what a completed 初评 left 结果待确认 once a later 初评 reads the range to a result', async () => {
    const authored = await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored');
    const store = await open(authored);
    const run = async (fixture: ResolvedModelFixture, bookId: string): Promise<string> => {
      let progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const execution = ownerOf(store, fixture);
      try {
        const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
        expect(execution.admitOrQueue(authorized.dispatchRunRecordId!, store.initialEvaluationLedger)).toBe('admitted');
        await execution.whenIdle();
      } finally {
        await execution.dispose();
      }
      return prepared.taskIntent!.taskIntentId;
    };
    try {
      const bookId = await book(store, 'L2 sample1 初评结果待确认');
      // The first 初评's request for unit 3 is sent and its answer never comes back whole: the Run reads on and completes.
      await run(dropping(authored, (entry) => entry.unitOrdinal === 3), bookId);
      const settled = store.inspectInitialEvaluation(bookId);
      expect(settled.taskOutcome?.classification).toBe('completed-with-gaps');
      expect(settled.resultSetRevision?.gaps.filter((gap) => gap.code === 'outcome-unknown').map((gap) => gap.unitOrdinal)).toEqual([3]);
      expect(unconfirmedItem(store, bookId, 'initial-evaluation')).toMatchObject({
        target: { kind: 'task-plan', bookId, taskKind: 'initial-evaluation', ref: null },
        object: { kind: 'unconfirmed', taskKind: 'initial-evaluation', ranges: 1, steps: [] },
      });
      expect(store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: null }).unconfirmed?.ranges).toMatchObject([{ unitOrdinal: 3, category: null }]);

      // 重新初评: its plan says before it starts that it sends unit 3 again.
      let progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      expect(store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: null }).resend).toEqual({ units: [3], statement: resendDisclosure([3]) });

      // That 初评 reads unit 3 to a result: nothing is left to confirm, and the next plan names no re-send.
      await run(authored, bookId);
      expect(store.inspectInitialEvaluation(bookId).resultSetRevision?.gaps).toEqual([]);
      expect(unconfirmedItem(store, bookId, 'initial-evaluation')).toBeUndefined();
      expect(store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: null }).unconfirmed).toBeNull();
      progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      expect(store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: null }).resend).toBeNull();
      expect(resolutionRows()).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('adds revision 68 to a revision-67 store with nothing else moved, and every row kept', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const creation = first.prepareBookCreation('早先的图书', null);
      first.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest });
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const schemaOf = (database: DatabaseSync): Array<{ name: string; sql: string }> =>
      database.prepare("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'trigger', 'index') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const plant = new DatabaseSync(path);
    let before: Array<{ name: string; sql: string }>;
    let books: unknown[];
    try {
      plant.exec(`DROP TABLE analysis_outcome_resolutions; PRAGMA user_version = ${MATERIAL_INDEX_SCHEMA_VERSION};`);
      before = schemaOf(plant);
      books = plant.prepare('SELECT * FROM books ORDER BY rowid').all();
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(path, { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(OUTCOME_RESOLUTION_SCHEMA_VERSION);
      expect(OUTCOME_RESOLUTION_SCHEMA_VERSION).toBe(MATERIAL_INDEX_SCHEMA_VERSION + 1);
      const after = schemaOf(database);
      expect(after.filter((entry) => !entry.name.startsWith('analysis_outcome_resolutions'))).toEqual(before!);
      expect(after.filter((entry) => entry.name.startsWith('analysis_outcome_resolutions')).map((entry) => entry.name))
        .toEqual(['analysis_outcome_resolutions', 'analysis_outcome_resolutions_no_delete', 'analysis_outcome_resolutions_no_update']);
      expect(database.prepare('SELECT * FROM books ORDER BY rowid').all()).toEqual(books!);
      expect((database.prepare('SELECT count(*) total FROM analysis_outcome_resolutions').get() as { total: number }).total).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);

  it('lists a Run stopped 结果待确认 once it is cancelled — 取消任务 settles nothing — until 保留为缺口 (CTRL-007; #763 review)', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-outcome-unknown');
    const store = await open(fixture);
    const execution = ownerOf(store, fixture);
    try {
      const bookId = await book(store, 'L2 sample1 取消后仍列');
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      // Stopped 结果待确认, the Run has no outcome yet: it is its own item, and nothing is listed beside it.
      expect(unconfirmedItem(store, bookId, 'baseline-analysis')).toBeUndefined();
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      // The partial revision holds unit 4 as its own outcome-unknown gap, and the Run's outcome is the editor's cancellation —
      // which is not a settlement of unit 4's request: it is listed until the editor keeps it as a gap.
      expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[4, 'outcome-unknown']]);
      expect(store.baselineAnalysisLedger.unconfirmedOutcomesOf(bookId).ranges.map((range) => [range.unitOrdinal, range.classification])).toEqual([[4, 'cancelled']]);
      expect(unconfirmedItem(store, bookId, 'baseline-analysis')).toMatchObject({ state: 'analysis-outcome-unconfirmed', object: { ranges: 1, steps: [] } });
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.unconfirmed?.ranges).toEqual([{ unitOrdinal: 4, category: null, recordedAt: expect.any(String), earlierText: false }]);
      expect(store.resolveUnconfirmedOutcomes(bookId, 'baseline-analysis', plan.unconfirmed!.digest)).toEqual({ resolved: 1 });
      expect(unconfirmedItem(store, bookId, 'baseline-analysis')).toBeUndefined();
      // Kept as a gap is not read: the redo's plan still names unit 4 as sent again.
      const after = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      let redoProgress = store.createBaselineAnalysisPreparationWork(bookId, after.redo!.prepare.goal, after.redo!.prepare.update, launchPolicy, false, runRecordId);
      while (!redoProgress.done) redoProgress = store.advanceBaselineAnalysisPreparationWork(redoProgress.workId!);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redoProgress.projection!.taskIntent!.taskIntentId }).resend?.units).toEqual([4]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('J-10\'s reduction fixture: a first baseline Run completes with its reduction 结果待确认, listed until kept as a gap', async () => {
    // From disk, as J-10 binds it — and only J-10: every range is read and the reduction over the eight is sent and never answers.
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-reduction-unknown');
    await expect(loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-reduction-unknown', 'J-04')).rejects.toMatchObject({ code: 'MODEL_FIXTURE_REFUSED' });
    expect((await loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-reduction-unknown', 'J-10')).sha256).toBe(fixture.sha256);
    const store = await open(fixture);
    const execution = ownerOf(store, fixture);
    const run = async (bookId: string, update: BaselineAnalysisUpdateRequest | null): Promise<BaselineAnalysisProjection> => {
      let progress = store.createBaselineAnalysisPreparationWork(bookId, update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode], update, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!);
      await execution.whenIdle();
      return store.inspectBaselineAnalysis(bookId, () => null);
    };
    try {
      const bookId = await book(store, 'L2 sample1 归纳结果待确认夹具');
      const first = await run(bookId, null);
      expect(first.taskOutcome?.classification).toMatch(/^completed/);
      expect(first.resultSetRevision?.coverage.unitsClosed).toBe(8);
      expect(first.resultSetRevision?.gaps).toEqual([]);
      expect(first.taskOutcome?.report?.failures).toEqual([{ stage: 'cross-unit-reduction', code: 'gap', reason: expect.stringContaining(`；${OUTCOME_UNKNOWN_NOT_RESENT}。`) }]);
      const item = unconfirmedItem(store, bookId, 'baseline-analysis');
      expect(item).toMatchObject({ group: 'exceptions', state: 'analysis-outcome-unconfirmed', blocked: false, object: { ranges: 0, steps: ['cross-unit-reduction'] } });
      expect(item?.technical).toContainEqual({ key: 'run-records', label: '运行记录', value: first.run!.runRecordId });
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: null });
      expect(plan.unconfirmed).toMatchObject({ ranges: [], steps: [{ stage: 'cross-unit-reduction', category: null }] });
      // A step is no range: nothing a later Task reads is named as sent again.
      expect(plan.resend).toBeNull();
      expect(store.resolveUnconfirmedOutcomes(bookId, 'baseline-analysis', plan.unconfirmed!.digest)).toEqual({ resolved: 1 });
      expect(unconfirmedItem(store, bookId, 'baseline-analysis')).toBeUndefined();

      // 重新分析全书 completes over the same fixture: its own reduction is its own 结果待确认, listed anew — the earlier
      // resolution named the earlier Run's request, never this one.
      const again = await run(bookId, { mode: 'reanalyze-book', selectedRange: null });
      expect(again.run!.runRecordId).not.toBe(first.run!.runRecordId);
      expect(unconfirmedItem(store, bookId, 'baseline-analysis')?.technical).toContainEqual({ key: 'run-records', label: '运行记录', value: again.run!.runRecordId });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('lists a completed baseline Run\'s ambiguous reduction, sample and reflection as steps, each its own 结果待确认', async () => {
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    // Each variant on its own Agent Data Root, since a route is bound when the store opens.
    const runOver = async (route: ResolvedModelFixture, title: string, body: (store: EditorialStore, projection: BaselineAnalysisProjection) => Promise<void> | void) => {
      const outer = roots;
      roots = await createServiceTestRoots('ai7-service-outcome-unconfirmed-step-');
      writeFileSync(join(roots.dataRoot, '..', 'j10-unit-hold.txt'), 'release');
      const store = await open(route);
      const execution = ownerOf(store, route);
      try {
        const bookId = await book(store, title);
        let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
        while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
        const prepared = progress.projection!;
        execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!);
        await execution.whenIdle();
        await body(store, store.inspectBaselineAnalysis(bookId, () => null));
        store.markCleanShutdown();
      } finally {
        await execution.dispose();
        store.close();
        await roots.dispose();
        roots = outer;
      }
    };
    // The happy fixture's ordinal-0 entries of one suboperation, told apart by the result schema they answer in.
    const ambiguousFor = (schema: string): ResolvedModelFixture =>
      dropping(happy, (entry) => entry.unitOrdinal === 0 && entry.response.kind === 'unit-result' && entry.response.text.includes(schema));
    const stepsOf = (store: EditorialStore, projection: BaselineAnalysisProjection) => {
      const item = unconfirmedItem(store, projection.bookId, 'baseline-analysis');
      const plan = store.inspectTaskPlan({ bookId: projection.bookId, kind: 'baseline-analysis', ref: null });
      return { item, plan };
    };

    await runOver(ambiguousFor('cross-unit-result'), 'L2 sample1 归纳结果待确认', (store, projection) => {
      expect(projection.taskOutcome?.classification).toMatch(/^completed/);
      const { item, plan } = stepsOf(store, projection);
      expect(item).toMatchObject({ state: 'analysis-outcome-unconfirmed', object: { taskKind: 'baseline-analysis', ranges: 0, steps: ['cross-unit-reduction'] } });
      expect(item?.target).toEqual({ kind: 'task-plan', bookId: projection.bookId, taskKind: 'baseline-analysis', ref: null });
      expect(plan.unconfirmed).toMatchObject({ ranges: [], steps: [{ stage: 'cross-unit-reduction', category: null }] });
      // Kept as a gap: the item is gone, and the revision and the report are exactly as they were.
      expect(store.resolveUnconfirmedOutcomes(projection.bookId, 'baseline-analysis', plan.unconfirmed!.digest)).toEqual({ resolved: 1 });
      expect(stepsOf(store, projection).item).toBeUndefined();
      expect(store.inspectBaselineAnalysis(projection.bookId, () => null).taskOutcome?.report?.reportDigest).toBe(projection.taskOutcome?.report?.reportDigest);
    });

    await runOver(ambiguousFor('assurance-sampling-result'), 'L2 sample1 抽样结果待确认', (store, projection) => {
      const { item, plan } = stepsOf(store, projection);
      expect(item?.object).toEqual({ kind: 'unconfirmed', taskKind: 'baseline-analysis', ranges: 0, steps: ['assurance-sampling'] });
      expect(plan.unconfirmed?.steps.map((step) => step.stage)).toEqual(['assurance-sampling']);
    });

    // The reflection's request is keyed by the Run's own accounting, the same for every deterministic replay of one fixture over
    // one manuscript: a first Run with nothing ambiguous reads it, and a second answers exactly that request 结果待确认.
    let accountingDigest = '';
    await runOver(happy, 'L2 sample1 反思账目', (store, projection) => {
      accountingDigest = projection.taskOutcome!.report!.accountingDigest;
      expect(stepsOf(store, projection).item).toBeUndefined();
    });
    const requestDigest = runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, accountingDigest);
    const reflecting: ResolvedModelFixture = {
      ...happy,
      entries: new Map([...happy.entries, [fixtureEntryKey(0, requestDigest), { unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null, response: DROPPED }]]),
    };
    await runOver(reflecting, 'L2 sample1 反思结果待确认', (store, projection) => {
      const ifRedone = projection.taskOutcome!.report!.ifRedone;
      expect(ifRedone.state).toBe('gap');
      expect(ifRedone.reason).toContain(`；${OUTCOME_UNKNOWN_NOT_RESENT}。`);
      expect(ifRedone.reason).not.toContain('运行反思被中断');
      const { item, plan } = stepsOf(store, projection);
      expect(item?.object).toEqual({ kind: 'unconfirmed', taskKind: 'baseline-analysis', ranges: 0, steps: ['run-report-reflection'] });
      expect(plan.unconfirmed?.steps.map((step) => step.stage)).toEqual(['run-report-reflection']);
    });
  }, 600_000);
});
