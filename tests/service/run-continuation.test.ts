import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECONCILED_PAUSED_DETAIL, RECONCILED_RESUMABLE_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { BaselineAnalysisExecutionOwner, CANCELLED_WITHOUT_REVISION, pausedDetail, resumableDetail } from '../../src/service/analysis/execution.js';
import type { TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, ANALYSIS_FEEDBACK_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { RESUME_BLOCKED_OFFLINE, RESUME_BLOCKED_SLOT, RUN_CONTROL_CANCELLING_REASON } from '../../src/service/task-plan.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER, plantRevision32Relations, runStatesShapeAt32 } from '../support/run-continuation.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 暂停 and 续行 (Issue #422, plan slice S76b): the real store on a temporary Agent
// Data Root, exact `sample1` imported through the supported path, J-04's deterministic route, and no Provider, socket
// or credential value. Schema revision 33 widens the Run states and keeps each unit as it settles; a Run pauses at the
// next unit boundary and 续行 goes on in the same attempt; AI7 closing under a Run leaves it 可续行; a stopped service's
// Runs are reconciled at the next start; and a stopped Run cancelled keeps what it read.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;
let holdPath: string;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const ONLINE: TaskPlanConnectivity = { reading: () => 'online', reachesNetwork: () => false, slotBusy: () => false };

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-continue-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
  writeFileSync(holdPath, 'release');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

function owner(store: EditorialStore): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture,
    secretResolver: { resolve: async () => null },
    unitHold: controlledUnitHold(holdPath, { pollMs: 5 }),
  });
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

/** The one Main Editorial Role connection is the store's, not a Book's: it is recorded once per store. */
const connected = new WeakSet<EditorialStore>();

async function preparedBook(store: EditorialStore, title: string): Promise<{ bookId: string; taskIntentId: string; digest: string }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (!connected.has(store)) {
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    connected.add(store);
  }
  const prepared = prepare(store, imported.bookId);
  return { bookId: imported.bookId, taskIntentId: prepared.taskIntent!.taskIntentId, digest: prepared.planEnvelope!.digest };
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

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((settle) => setTimeout(settle, 5));
  }
}

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Row[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [String(relation.name), { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

/** A first baseline started and held once `held` units have settled, the next in flight. */
async function heldRun(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, title: string, held: number) {
  const book = await preparedBook(store, title);
  writeFileSync(holdPath, String(held));
  const runRecordId = store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.digest).dispatchRunRecordId!;
  execution.admitAndDispatch(runRecordId);
  await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === held + 1, `unit ${held + 1} in flight`);
  return { ...book, runRecordId };
}

const states = (projection: BaselineAnalysisProjection): string[] => projection.run!.transitions.map((transition) => transition.state);
const kept = (store: EditorialStore, runRecordId: string): number[] =>
  store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((checkpoint) => checkpoint.unit.unitOrdinal);

describe('schema revision 33 over the real store', () => {
  it('widens a planted revision-32 store\'s Run states with every row as it was, and adds the unit checkpoints empty', async () => {
    const first = await openWithRoute();
    const execution = owner(first);
    try {
      const book = await preparedBook(first, 'L2 sample1 续行迁移');
      execution.admitAndDispatch(first.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.digest).dispatchRunRecordId!);
      await execution.whenIdle();
      first.markCleanShutdown();
    } finally {
      await execution.dispose();
      first.close();
    }
    const before = withDatabase(false, (database) => {
      plantRevision32Relations(database);
      database.exec('PRAGMA user_version = 32');
      expect(runStatesShapeAt32(database)).toBe('revision-32');
      return { states: database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all() as Row[], truth: relationTruth(database) };
    });
    expect(before.states.map((row) => row.state)).toEqual(['authorized', 'admitted', 'executing', 'completed']);
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(ANALYSIS_FEEDBACK_SCHEMA_VERSION);
      expect(runStatesShapeAt32(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all()).toEqual(before.states);
      const after = relationTruth(database);
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER].sort());
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER]) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name)).toEqual(['analysis_run_states']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      // The checkpoints are a ledger too: nothing rewrites or removes one.
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_unit_checkpoints' ORDER BY name").all())
        .toEqual([{ name: 'analysis_unit_checkpoints_no_delete' }, { name: 'analysis_unit_checkpoints_no_update' }]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);
});

describe('暂停 and 续行 over the real store', () => {
  it('says where 续行 goes on: the next range, or, with every range read, the reduction and the sample', () => {
    expect(pausedDetail(3, SAMPLE1_UNITS)).toBe('已在阅读范围之间暂停：已读完 3 / 8 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读。');
    expect(pausedDetail(SAMPLE1_UNITS, SAMPLE1_UNITS)).toBe('已暂停：全部 8 个阅读范围都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样。');
    expect(resumableDetail(2, SAMPLE1_UNITS)).toBe('AI7 关闭时这项任务正在运行：已读完 2 / 8 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。');
    expect(resumableDetail(SAMPLE1_UNITS, SAMPLE1_UNITS)).toBe('AI7 关闭时这项任务正在运行：全部 8 个阅读范围都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。');
  });

  it('pauses at the next unit boundary keeping what it read, frees the slot, and 续行 goes on to the end in the same attempt', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    const progress = (runRecordId: string) => execution.progressFor(runRecordId);
    try {
      const { bookId, taskIntentId, runRecordId } = await heldRun(store, execution, 'L2 sample1 暂停', 2);
      const running = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress);
      expect(running.runControl).toMatchObject({ pause: { reason: null }, resume: null, continuation: null });

      // 暂停: one click, recorded at once; the unit in flight is still in flight.
      expect(store.requestBaselineAnalysisPause(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.pauseRun(runRecordId, store.baselineAnalysisLedger)).toBe('pausing');
      const pausing = store.inspectBaselineAnalysis(bookId, progress);
      expect(pausing.state).toBe('pausing');
      expect(pausing.stateLabel).toBe('正在暂停');
      expect(states(pausing)).toEqual(['authorized', 'admitted', 'executing', 'pausing']);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress))
        .toMatchObject({ state: { key: 'pausing', label: '正在暂停' }, runControl: { pausing: true } });
      const attention = store.inspectGlobalAttention(progress, execution.busy);
      expect(attention.groups.flatMap((group) => group.items).find((item) => item.book.bookId === bookId)?.state).toBe('analysis-pausing');
      // A second click names the same Run and records nothing more.
      expect(store.requestBaselineAnalysisPause(bookId, taskIntentId)).toBe(runRecordId);
      expect(states(store.inspectBaselineAnalysis(bookId, progress))).toHaveLength(4);

      // The held unit finishes and is kept; the Run then waits, with no revision and no outcome, and the slot is free.
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      const paused = store.inspectBaselineAnalysis(bookId, progress);
      expect(paused.state).toBe('paused');
      expect(paused.stateLabel).toBe('已暂停');
      expect(states(paused)).toEqual(['authorized', 'admitted', 'executing', 'pausing', 'paused']);
      expect(paused.run!.transitions.at(-1)!.detail).toBe(pausedDetail(3, SAMPLE1_UNITS));
      expect(paused.taskOutcome).toBeNull();
      expect(paused.resultSetRevision).toBeNull();
      expect(execution.busy).toBe(false);
      expect(kept(store, runRecordId)).toEqual([1, 2, 3]);
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress);
      expect(plan.state).toEqual({ key: 'paused', label: '已暂停' });
      expect(plan.runControl).toMatchObject({ resume: { reason: null }, continuation: { unitsSettled: 3, unitsTotal: SAMPLE1_UNITS }, activity: null });
      expect(plan.runControl!.cancel.impact[1]).toContain('已读完的 3 个阅读范围');
      expect(store.inspectGlobalAttention(progress, execution.busy).groups.flatMap((group) => group.items).find((item) => item.book.bookId === bookId)?.state)
        .toBe('analysis-paused');
      // A paused Task is not done: the Book takes no new one until it is continued or cancelled.
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');

      // 续行: the same Run, the same attempt, a new span from unit 4 on; the three kept units are not read again.
      writeFileSync(holdPath, 'release');
      execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, progress);
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'pausing', 'paused', 'admitted', 'executing', 'completed']);
      expect(settled.run!.transitions[6]!.detail).toContain('续行：新的执行区段；已读完的 3 个阅读范围沿用，接着读其余 5 个。');
      expect(settled.taskOutcome?.classification).toBe('completed');
      expect(settled.resultSetRevision?.coverage.unitsClosed).toBe(SAMPLE1_UNITS);
      const spans = settled.run!.attempt!.spans;
      expect(spans.filter((span) => span.unitOrdinal !== null).map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(spans.map((span) => span.ordinal)).toEqual(spans.map((_, index) => index + 1));
      expect(withDatabase(true, (database) => (database.prepare('SELECT count(*) total FROM analysis_execution_attempts').get() as { total: number }).total)).toBe(1);
      const report = settled.taskOutcome!.report!;
      expect(report.units.submitted).toBe(SAMPLE1_UNITS);
      expect(report.usagePerStage.units.requests).toBe(SAMPLE1_UNITS);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('leaves a Run 可续行 when AI7 closes under it, and 续行 after the next start goes on from what it kept', async () => {
    const first = await openWithRoute();
    const firstOwner = owner(first);
    let bookId = '';
    let taskIntentId = '';
    let runRecordId = '';
    try {
      ({ bookId, taskIntentId, runRecordId } = await heldRun(first, firstOwner, 'L2 sample1 关闭时可续行', 1));
      await firstOwner.dispose();
      const stopped = first.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.state).toBe('resumable');
      expect(stopped.stateLabel).toBe('任务已中断 · 可续行');
      expect(stopped.run!.transitions.at(-1)!.detail).toBe(resumableDetail(2, SAMPLE1_UNITS));
      expect(kept(first, runRecordId)).toEqual([1, 2]);
      first.markCleanShutdown();
    } finally {
      await firstOwner.dispose();
      first.close();
    }

    const second = await openWithRoute();
    const secondOwner = owner(second);
    try {
      writeFileSync(holdPath, 'release');
      // Nothing to reconcile: the Run was left 可续行 already, and nothing is sent until 续行 (CONT-014).
      expect(second.reconcileStoppedBaselineAnalysisRuns()).toEqual({ settled: 0, cancelling: [], answered: [], queued: [] });
      const plan = await second.inspectTaskPlanWithConnection({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, async () => null, ONLINE, () => null);
      expect(plan).toMatchObject({ state: { key: 'resumable' }, runControl: { resume: { reason: null }, continuation: { unitsSettled: 2 } } });
      secondOwner.admitAndDispatch(runRecordId, second.baselineAnalysisLedger, { resume: true });
      await secondOwner.whenIdle();
      const settled = second.inspectBaselineAnalysis(bookId, () => null);
      expect(settled.taskOutcome?.classification).toBe('completed');
      expect(settled.resultSetRevision?.coverage.unitsClosed).toBe(SAMPLE1_UNITS);
      expect(settled.run!.attempt!.spans.filter((span) => span.unitOrdinal !== null).map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      second.markCleanShutdown();
    } finally {
      await secondOwner.dispose();
      second.close();
    }
  }, 300_000);

  it('reconciles the Runs a stopped service left under way: executing becomes 可续行, pausing 已暂停, cancelling is named', async () => {
    const store = await openWithRoute();
    try {
      const ledger = store.baselineAnalysisLedger;
      const run = async (title: string, left: ReadonlyArray<'admitted' | 'executing' | 'pausing' | 'cancelling'>) => {
        const book = await preparedBook(store, title);
        const runRecordId = store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.digest).dispatchRunRecordId!;
        for (const state of left) ledger.recordRunState(runRecordId, state, { detail: '服务停止前记录。' });
        return { ...book, runRecordId };
      };
      const executing = await run('L2 sample1 遗留执行', ['admitted', 'executing']);
      const pausing = await run('L2 sample1 遗留暂停', ['admitted', 'executing', 'pausing']);
      const cancelling = await run('L2 sample1 遗留取消', ['admitted', 'executing', 'cancelling']);
      expect(store.reconcileStoppedBaselineAnalysisRuns()).toEqual({ settled: 2, cancelling: [cancelling.runRecordId], answered: [], queued: [] });
      expect(store.inspectBaselineAnalysis(executing.bookId, () => null).run!.transitions.at(-1)).toMatchObject({ state: 'resumable', detail: RECONCILED_RESUMABLE_DETAIL });
      expect(store.inspectBaselineAnalysis(pausing.bookId, () => null).run!.transitions.at(-1)).toMatchObject({ state: 'paused', detail: RECONCILED_PAUSED_DETAIL });
      // A second look finds nothing left to settle.
      expect(store.reconcileStoppedBaselineAnalysisRuns()).toEqual({ settled: 0, cancelling: [cancelling.runRecordId], answered: [], queued: [] });
      // The Run left executing never persisted an attempt: 续行 starts its first one.
      const execution = owner(store);
      try {
        execution.admitAndDispatch(executing.runRecordId, ledger, { resume: true });
        await execution.whenIdle();
        expect(store.inspectBaselineAnalysis(executing.bookId, () => null).taskOutcome?.classification).toBe('completed');
        // The Run left cancelling kept nothing, so it ends here with no revision.
        expect(execution.cancelRun(cancelling.runRecordId, ledger)).toBe('settled');
        expect(store.inspectBaselineAnalysis(cancelling.bookId, () => null)).toMatchObject({ state: 'cancelled', resultSetRevision: null });
      } finally {
        await execution.dispose();
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('cancels a paused Run into the partial revision of what it kept, sending nothing more', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await heldRun(store, execution, 'L2 sample1 暂停后取消', 2);
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).state).toBe('paused');
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      // 正在取消 stays the Run's latest state until 已取消: its cancellation records no second admission.
      expect(states(cancelled)).toEqual(['authorized', 'admitted', 'executing', 'pausing', 'paused', 'cancelling', 'cancelled']);
      expect(cancelled.stateLabel).toBe('已取消');
      expect(cancelled.taskOutcome?.classification).toBe('cancelled');
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(3);
      expect(cancelled.resultSetRevision!.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([4, 5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted']));
      // Three unit turns and no other: the cancellation read what was kept and sent nothing.
      expect(cancelled.run!.attempt!.spans).toHaveLength(3);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('finishes a stopped Run\'s cancellation once the slot another Run holds is free', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const a = await heldRun(store, execution, 'L2 sample1 甲', 2);
      store.requestBaselineAnalysisPause(a.bookId, a.taskIntentId);
      execution.pauseRun(a.runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      const b = await heldRun(store, execution, 'L2 sample1 乙', 1);
      // Cancelling 甲 while 乙 holds the slot: 正在取消 until the slot is free, and nothing of 甲 runs meanwhile.
      store.requestBaselineAnalysisCancel(a.bookId, a.taskIntentId);
      expect(execution.cancelRun(a.runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      expect(store.inspectBaselineAnalysis(a.bookId, () => null).state).toBe('cancelling');
      // Held while it waits: stopped between two ranges with the three it kept, never read as a Run nothing holds, and
      // 取消任务 is not offered again.
      const progress = (runRecordId: string) => execution.progressFor(runRecordId);
      expect(progress(a.runRecordId)).toMatchObject({ unitsSettled: 3, unitsTotal: SAMPLE1_UNITS, currentUnitOrdinal: null, attemptState: null, stage: 'units' });
      expect(store.inspectGlobalAttention(progress, execution.busy).groups.flatMap((group) => group.items).find((item) => item.book.bookId === a.bookId)?.state)
        .toBe('analysis-cancelling');
      expect(store.inspectTaskPlan({ bookId: a.bookId, kind: 'baseline-analysis', ref: a.taskIntentId }, progress).runControl)
        .toMatchObject({ cancelling: true, cancel: { reason: RUN_CONTROL_CANCELLING_REASON, impact: [] } });
      writeFileSync(holdPath, 'release');
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(b.bookId, () => null).taskOutcome?.classification).toBe('completed');
      const cancelled = store.inspectBaselineAnalysis(a.bookId, () => null);
      expect(cancelled.taskOutcome?.classification).toBe('cancelled');
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(3);
      expect(states(cancelled).slice(-2)).toEqual(['cancelling', 'cancelled']);
      expect(progress(a.runRecordId)).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a stopped Run whose kept progress no longer reads back, saying so, and forms no revision', async () => {
    const first = await openWithRoute();
    const firstOwner = owner(first);
    let bookId = '';
    let taskIntentId = '';
    let runRecordId = '';
    try {
      ({ bookId, taskIntentId, runRecordId } = await heldRun(first, firstOwner, 'L2 sample1 进度无法核对', 2));
      first.requestBaselineAnalysisPause(bookId, taskIntentId);
      firstOwner.pauseRun(runRecordId, first.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await firstOwner.whenIdle();
      first.markCleanShutdown();
    } finally {
      await firstOwner.dispose();
      first.close();
    }
    // One kept unit's record no longer matches its digest; the ledger's own trigger is put back exactly as it was.
    withDatabase(false, (database) => {
      const trigger = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'analysis_unit_checkpoints_no_update'").get() as { sql: string };
      database.exec('DROP TRIGGER analysis_unit_checkpoints_no_update');
      database.prepare('UPDATE analysis_unit_checkpoints SET sha256 = ? WHERE run_record_id = ? AND unit_ordinal = 2').run('0'.repeat(64), runRecordId);
      database.exec(trigger.sql);
    });
    const second = await openWithRoute();
    const secondOwner = owner(second);
    try {
      const plan = await second.inspectTaskPlanWithConnection({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, async () => null, ONLINE, () => null);
      expect(plan.runControl?.continuation).toEqual({ unitsSettled: null, unitsTotal: SAMPLE1_UNITS });
      expect(plan.runControl?.resume?.reason).toContain('已保存的阅读进度无法核对');
      expect(plan.runControl?.cancel.impact[0]).toBe('这项任务已经停下，它已保存的阅读进度无法核对；取消后不会发送任何内容，也不会形成结果集修订版。');
      // 取消任务 still ends it: nothing of it can be gathered, so it is cancelled with no revision, and says why.
      expect(second.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(secondOwner.cancelRun(runRecordId, second.baselineAnalysisLedger)).toBe('settled');
      const cancelled = second.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.resultSetRevision).toBeNull();
      expect(cancelled.taskOutcome?.classification).toBe('cancelled');
      expect(cancelled.run!.transitions.at(-1)!.detail).toBe(CANCELLED_WITHOUT_REVISION);
      second.markCleanShutdown();
    } finally {
      await secondOwner.dispose();
      second.close();
    }
  }, 300_000);

  it('refuses 续行 while the plan moved or the slot is held, saying which, and records nothing', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await heldRun(store, execution, 'L2 sample1 续行重新核对', 2);
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      const input = { bookId, kind: 'baseline-analysis' as const, ref: taskIntentId };
      // The slot held by another Run: 续行 waits for it, in the service's own words.
      const busy = await store.inspectTaskPlanWithConnection(input, async () => null, { ...ONLINE, slotBusy: () => true }, () => null);
      expect(busy.runControl?.resume?.reason).toBe(RESUME_BLOCKED_SLOT);
      // This route reads a local fixture and sends nothing: it asks for no credential, and the device's network is
      // not its concern…
      const local = await store.inspectTaskPlanWithConnection(input, async () => 'missing', { ...ONLINE, reading: () => 'offline' }, () => null);
      expect(local.runControl?.resume?.reason).toBeNull();
      // …unless a launch's controlled connectivity has it stand for a route that reaches its model over the network,
      // as J-04's Connectivity Wait does: offline, 续行 waits until the device is online again.
      const offline = await store.inspectTaskPlanWithConnection(input, async () => null, { ...ONLINE, reading: () => 'offline', reachesNetwork: () => true }, () => null);
      expect(offline.runControl?.resume?.reason).toBe(RESUME_BLOCKED_OFFLINE);
      // The plan moved: the launch this Run was authorized under is not this one (CONT-016).
      store.baselineAnalysisLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go',
          model: 'deepseek-v4-flash',
          endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
          credentialSlot: 'opencode-go',
          credentialReference: randomUUID(),
          runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
        },
      });
      const moved = await store.inspectTaskPlanWithConnection(input, async () => null, ONLINE, () => null);
      expect(moved.runControl?.resume?.reason).toContain('计划的关键内容已经变化');
      // CONT-016: the way on is a newly authorized Redo Run (Issue #422, S76c).
      expect(moved.runControl?.resume?.reason).toContain('这次运行不能照原计划续行；请改计划重做。');
      expect(() => execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true })).toThrow();
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      expect(states(store.inspectBaselineAnalysis(bookId, () => null)).at(-1)).toBe('paused');
      // A Run that is not stopped offers no 续行, and one already paused is not paused again.
      expect(await refusal(() => store.continuableBaselineAnalysisRun(bookId, randomUUID()))).toBe('ANALYSIS_RESUME_STALE');
      expect(store.requestBaselineAnalysisPause(bookId, taskIntentId)).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
