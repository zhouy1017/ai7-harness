import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASSURANCE_SAMPLING_CANCELLED,
  BaselineAnalysisExecutionOwner,
  CANCELLED_BEFORE_UNITS,
  CANCELLED_WITHOUT_EXECUTION,
  CROSS_UNIT_CANCELLED,
  RUN_REPORT_REFLECTION_CANCELLED,
} from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { EXPORT_LEDGER_SCHEMA_VERSION, CLARIFICATION_SCHEMA_VERSION, DATABASE_EXPORT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { RUN_CONTROL_CANCELLING_REASON, RUN_CONTROL_REDO_REASON } from '../../src/service/task-plan.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { plantRevision30Relations } from '../support/default-execution-rules.js';
import { plantRevision31Relations, runCancellationShape } from '../support/run-cancellation.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 取消任务 (Issue #422, plan slice S76a): the real store on a temporary Agent
// Data Root, exact `sample1` imported through the supported path, J-04's deterministic route, and no Provider,
// socket or credential value. Schema revision 32 widens the Run states and the Task Outcomes; a Run under way is
// cancelled at the next unit boundary with what it completed kept; one not yet reading, and one AI7 left behind
// when it last closed, end without provider work.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-cancel-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});

afterEach(async () => {
  await roots.dispose();
});

/** The store with J-04's deterministic route bound, as the model-adapter control binds it for J-10. */
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

/** The owner as the service builds it for J-10: the deterministic route, and the unit hold read from `holdPath`. */
function owner(store: EditorialStore, holdPath: string | null): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture,
    secretResolver: { resolve: async () => null },
    unitHold: holdPath === null ? null : controlledUnitHold(holdPath, { pollMs: 5 }),
  });
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

async function preparedBook(store: EditorialStore, title: string): Promise<{ bookId: string; prepared: BaselineAnalysisProjection }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return { bookId: imported.bookId, prepared: prepare(store, imported.bookId) };
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

/** Wait, bounded, until `condition` holds: the owner moves between awaits the test does not see. */
async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
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

/** Every relation's exact text and a digest of its rows, so a migration can say exactly what it moved. */
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

describe('schema revision 32 over the real store', () => {
  it('widens a planted revision-31 store\'s Run states and Task Outcomes with every row as it was, and moves nothing else', async () => {
    // A Run that ran to its end: its states and its outcome are ones revision 31 already admitted.
    const first = await openWithRoute();
    const execution = owner(first, null);
    try {
      const { bookId, prepared } = await preparedBook(first, 'L2 sample1 取消迁移');
      const authorized = first.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      execution.admitAndDispatch(authorized.dispatchRunRecordId!);
      await execution.whenIdle();
      expect(first.inspectBaselineAnalysis(bookId, () => null).taskOutcome?.classification).toBe('completed');
      first.markCleanShutdown();
    } finally {
      await execution.dispose();
      first.close();
    }
    const before = withDatabase(false, (database) => {
      plantRevision31Relations(database);
      database.exec(`PRAGMA user_version = 31`);
      expect(runCancellationShape(database, 'analysis_run_states')).toBe('revision-31');
      expect(runCancellationShape(database, 'analysis_task_outcomes')).toBe('revision-31');
      return {
        states: database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all() as Row[],
        outcomes: database.prepare('SELECT rowid, * FROM analysis_task_outcomes ORDER BY rowid').all() as Row[],
        truth: relationTruth(database),
      };
    });
    expect(before.states.map((row) => row.state)).toEqual(['authorized', 'admitted', 'executing', 'completed']);
    expect(before.outcomes).toHaveLength(1);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      expect(runCancellationShape(database, 'analysis_run_states')).toBe('current');
      expect(runCancellationShape(database, 'analysis_task_outcomes')).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all()).toEqual(before.states);
      expect(database.prepare('SELECT rowid, * FROM analysis_task_outcomes ORDER BY rowid').all()).toEqual(before.outcomes);
      const after = relationTruth(database);
      // Revision 33 (S76b) then adds its checkpoint relation, empty.
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER].sort());
      for (const relation of RUN_CHECKPOINT_RELATIONS_DROP_ORDER) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name))
        .toEqual(['analysis_run_states', 'analysis_task_outcomes']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      for (const table of ['analysis_run_states', 'analysis_task_outcomes']) {
        expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ? ORDER BY name").all(table))
          .toEqual([{ name: `${table}_no_delete` }, { name: `${table}_no_update` }]);
      }
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);

  it('widens a store as old as revision 29 in one step, both relations from the texts it holds', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    withDatabase(false, (database) => {
      // Revision 31's rule ledger and origin, then revision 32's two widenings, taken back; revision 29's Run states
      // are revision 31's without the two Connectivity Wait states, and no Run exists to hold either.
      plantRevision30Relations(database);
      plantRevision31Relations(database);
      database.exec(`PRAGMA user_version = ${EXPORT_LEDGER_SCHEMA_VERSION}`);
    });
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      expect(runCancellationShape(database, 'analysis_run_states')).toBe('current');
      expect(runCancellationShape(database, 'analysis_task_outcomes')).toBe('current');
    });
  }, 300_000);

  it('refuses a store whose Task Outcomes match no shape, rather than rebuilding them', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    withDatabase(false, (database) => {
      plantRevision31Relations(database);
      // A hand-altered relation: a column no revision ever wrote.
      database.exec(`PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        DROP TRIGGER analysis_task_outcomes_no_update;
        DROP TRIGGER analysis_task_outcomes_no_delete;
        ALTER TABLE analysis_task_outcomes ADD COLUMN note TEXT;
        PRAGMA user_version = 31;
        COMMIT;
        PRAGMA foreign_keys = ON;`);
      expect(runCancellationShape(database, 'analysis_task_outcomes')).toBe('other');
    });
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 300_000);
});

describe('取消任务 over the real store', () => {
  it('stops a Run at the next unit boundary, lets the unit in flight finish, and keeps what it completed', async () => {
    const holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
    writeFileSync(holdPath, '2');
    const store = await openWithRoute();
    const execution = owner(store, holdPath);
    const progress = (runRecordId: string) => execution.progressFor(runRecordId);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 取消任务');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const authorized = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      // Two units have settled and the third is in flight, held until the file lets it settle.
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'the third unit in flight');
      expect(execution.progressFor(runRecordId)).toMatchObject({ unitsSettled: 2, unitsTotal: SAMPLE1_UNITS, stage: 'units' });

      // The drawer offers 取消任务 with its summary, 暂停 (S76b), and 改计划重做 with why it waits.
      const running = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress);
      expect(running.state).toEqual({ key: 'running', label: '运行中' });
      expect(running.runControl).toMatchObject({
        runRecordId,
        cancelling: false,
        cancel: { reason: null },
        pause: { reason: null },
        resume: null,
        redo: { reason: RUN_CONTROL_REDO_REASON },
        activity: { unitsSettled: 2, unitsTotal: SAMPLE1_UNITS, currentUnitOrdinal: 3 },
      });
      expect(running.runControl!.cancel.impact).toEqual([
        `正在读的第 3 个阅读范围读完后停止；其余 ${SAMPLE1_UNITS - 3} 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。`,
        '已读完的 2 个阅读范围和正在读的这一个的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
        '这项分析不改稿，没有需要撤回的受控动作。',
        '正在等待的那一轮模型回答不会被中途切断，它的结果照常计入。',
      ]);
      expect(running.runControl!.executingSince).toBe(store.inspectBaselineAnalysis(bookId, progress).run!.transitions.find((transition) => transition.state === 'executing')!.recordedAt);

      // 确认取消任务: `cancelling` is recorded at once and the Run the owner holds is asked to stop.
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      const cancelling = store.inspectBaselineAnalysis(bookId, progress);
      expect(cancelling.state).toBe('cancelling');
      expect(cancelling.stateLabel).toBe('正在取消');
      expect(cancelling.run?.stateLabel).toBe('正在取消');
      expect(cancelling.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'cancelling']);
      // The unit in flight is still in flight: 正在取消 until it finishes (CTRL-005), and the slot is still held.
      expect(cancelling.run?.progress).toMatchObject({ unitsSettled: 2, currentUnitOrdinal: 3 });
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress);
      expect(plan.state).toEqual({ key: 'cancelling', label: '正在取消' });
      expect(plan.runControl).toMatchObject({ cancelling: true, cancel: { reason: RUN_CONTROL_CANCELLING_REASON, impact: [] } });
      const attention = store.inspectGlobalAttention(progress, execution.busy);
      expect(attention.groups.flatMap((group) => group.items).find((item) => item.book.bookId === bookId)?.state).toBe('analysis-cancelling');
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');
      // A second confirmation names the same Run and records nothing more.
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('stopping');

      // The held unit finishes; the Run stops at the boundary after it and sends nothing more.
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, progress);
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.stateLabel).toBe('已取消');
      expect(cancelled.run?.stateLabel).toBe('已取消');
      expect(cancelled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'cancelling', 'cancelled']);
      expect(cancelled.run?.progress).toBeNull();
      // Three unit turns and nothing after them: no reduction, no sample, no reflection (CTRL-005).
      expect(cancelled.run?.attempt?.spans).toHaveLength(3);
      const revision = cancelled.resultSetRevision!;
      expect(revision.coverage.unitsTotal).toBe(SAMPLE1_UNITS);
      expect(revision.coverage.unitsClosed).toBe(3);
      expect(revision.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual(
        Array.from({ length: SAMPLE1_UNITS - 3 }, (_, index) => [index + 4, 'not-attempted']),
      );
      const outcome = cancelled.taskOutcome!;
      expect(outcome.classification).toBe('cancelled');
      expect(outcome.label).toBe('任务结果：已取消');
      expect(outcome.resultSetRevisionId).toBe(revision.revisionId);
      expect(outcome.safeNextAction).toContain('已按你的要求取消');
      const report = outcome.report!;
      expect(report.classification).toBe('cancelled');
      expect(report.stages.map((stage) => [stage.stage, stage.state])).toEqual([
        ['units', 'closed-with-gaps'], ['cross-unit-reduction', 'not-run'], ['assurance-sampling', 'not-run'], ['reduction', 'closed'],
      ]);
      expect(report.usagePerStage['cross-unit-reduction'].requests).toBe(0);
      expect(report.usagePerStage['assurance-sampling'].requests).toBe(0);
      expect(report.ifRedone).toEqual({ state: 'not-run', items: [], reason: RUN_REPORT_REFLECTION_CANCELLED });
      expect(report.unitRows.filter((row) => row.gapCode === 'not-attempted')).toHaveLength(SAMPLE1_UNITS - 3);
      // The drawer reads 已取消 in the shape of every 已取消, and offers nothing further.
      const settled = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress);
      expect(settled.state).toEqual({ key: 'cancelled-after-start', label: '已取消' });
      expect(settled.runControl).toBeNull();
      // The Run is no longer active, and its partial revision is the Book's latest analysis: what comes next is an
      // update of it — here 重新分析全书, which reads every unit again — never a second first baseline.
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_FIRST_BASELINE_EXISTS');
      let update = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book', selectedRange: null }, launchPolicy);
      while (!update.done) update = store.advanceBaselineAnalysisPreparationWork(update.workId!);
      expect(update.projection?.update?.predecessor?.revisionId).toBe(revision.revisionId);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('lets a reduction turn already out come back and count, then stops before the sample', async () => {
    // A cancellation that arrives while the cross-unit reduction's turn is out: the owner is held just after that turn
    // comes back, the way J-10's hold keeps a unit in flight.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let heldAt: string | null = null;
    const store = await openWithRoute();
    const execution = new BaselineAnalysisExecutionOwner({
      ledger: store.baselineAnalysisLedger,
      launchPolicy,
      fixture,
      secretResolver: { resolve: async () => null },
      stageHold: async (stage) => {
        heldAt = stage;
        await held;
      },
    });
    const progress = (runRecordId: string) => execution.progressFor(runRecordId);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 归纳时取消');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => heldAt === 'cross-unit-reduction', 'the reduction turn out');
      expect(execution.progressFor(runRecordId)).toMatchObject({ stage: 'cross-unit-reduction', unitsSettled: SAMPLE1_UNITS });
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, progress).runControl!.cancel.impact[0])
        .toBe('正在进行的跨单元归纳完成后停止，之后的步骤都不再进行，不再发送任何内容。');

      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      release();
      await execution.whenIdle();

      const cancelled = store.inspectBaselineAnalysis(bookId, progress);
      expect(cancelled.state).toBe('cancelled');
      // Every unit and the reduction were kept; the sample and the reflection never started.
      const revision = cancelled.resultSetRevision!;
      expect(revision.coverage.unitsClosed).toBe(SAMPLE1_UNITS);
      const report = cancelled.taskOutcome!.report!;
      expect(report.classification).toBe('cancelled');
      expect(report.usagePerStage['cross-unit-reduction'].requests).toBe(1);
      expect(report.usagePerStage['assurance-sampling'].requests).toBe(0);
      expect(report.stages.find((stage) => stage.stage === 'assurance-sampling')?.state).toBe('not-run');
      expect(report.assurance).toMatchObject({ state: 'not-run', size: 0 });
      expect(revision.assuranceSample).toMatchObject({ state: 'not-run', reason: ASSURANCE_SAMPLING_CANCELLED });
      expect(report.ifRedone).toEqual({ state: 'not-run', items: [], reason: RUN_REPORT_REFLECTION_CANCELLED });
      store.markCleanShutdown();
    } finally {
      release();
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run admitted but not yet reading without provider work and without a revision', async () => {
    const store = await openWithRoute();
    const execution = owner(store, null);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 排队时取消');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const authorized = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      // Admitted and parked at its first await: nothing has been read or sent yet (CTRL-008).
      const queued = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      expect(queued.state).toEqual({ key: 'running', label: '正在排队' });
      expect(queued.runControl?.cancel.impact).toEqual(['这项任务还没有开始阅读；取消后不会发送任何内容，也不会形成结果集修订版。', '这项分析不改稿，没有需要撤回的受控动作。']);
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'cancelling', 'cancelled']);
      // It never began reading, so it reads as a Run that ran nothing, and no revision was formed.
      expect(cancelled.stateLabel).toBe('已取消 · 未启动');
      expect(cancelled.resultSetRevision).toBeNull();
      expect(cancelled.run?.attempt?.spans ?? []).toHaveLength(0);
      expect(cancelled.taskOutcome).toMatchObject({ classification: 'cancelled', label: '任务结果：已取消', resultSetRevisionId: null });
      expect(cancelled.taskOutcome!.report!.ifRedone.reason).toBe(RUN_REPORT_REFLECTION_CANCELLED);
      expect(cancelled.taskOutcome!.report!.stages.map((stage) => stage.state)).toEqual(['not-run', 'not-run', 'not-run', 'not-run']);
      const outcomeRow = withDatabase(true, (database) => database.prepare('SELECT canonical_json FROM analysis_task_outcomes').get() as Row);
      expect(JSON.parse(String(outcomeRow.canonical_json)).summary).toBe(CANCELLED_BEFORE_UNITS);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state).toEqual({ key: 'cancelled', label: '已取消' });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('settles at once a Run AI7 left executing when it last closed, forming no revision', async () => {
    const store = await openWithRoute();
    const execution = owner(store, null);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 遗留运行');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const authorized = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      // The ledger as a service that stopped mid-Run leaves it: executing, with no execution anywhere holding it.
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      const orphaned = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      expect(orphaned.runControl).toMatchObject({ activity: null, cancel: { reason: null } });
      expect(orphaned.runControl!.cancel.impact[0]).toBe('AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。');
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'cancelling', 'cancelled']);
      expect(cancelled.stateLabel).toBe('已取消');
      expect(cancelled.resultSetRevision).toBeNull();
      expect(cancelled.taskOutcome).toMatchObject({ classification: 'cancelled', resultSetRevisionId: null });
      const outcomeRow = withDatabase(true, (database) => database.prepare('SELECT canonical_json FROM analysis_task_outcomes').get() as Row);
      expect(JSON.parse(String(outcomeRow.canonical_json)).summary).toBe(CANCELLED_WITHOUT_EXECUTION);
      expect(cancelled.taskOutcome!.report!.stages.find((stage) => stage.stage === 'cross-unit-reduction')?.state).toBe('not-run');
      // Nothing is left active: the Book can take a new Task.
      expect(await refusal(() => prepare(store, bookId))).toBe('no-error');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('offers 取消任务 again for a Run AI7 left 正在取消 when it closed, and settles it', async () => {
    const store = await openWithRoute();
    const execution = owner(store, null);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 遗留的正在取消');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const authorized = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'cancelling', { detail: '编辑取消了这项任务。' });
      // Nothing holds it, so it is not stopping by itself: the bar offers 取消任务, whose summary says why.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      expect(plan.state).toEqual({ key: 'cancelling', label: '正在取消' });
      expect(plan.runControl).toMatchObject({ cancelling: false, activity: null, cancel: { reason: null } });
      expect(plan.runControl!.cancel.impact[0]).toBe('AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。');
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'cancelling', 'cancelled']);
      expect(cancelled.taskOutcome).toMatchObject({ classification: 'cancelled', resultSetRevisionId: null });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels only a Run under way, and answers a cancelled one as it did', async () => {
    const store = await openWithRoute();
    const execution = owner(store, null);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 取消的边界');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // Prepared, not started: nothing to cancel.
      expect(await refusal(() => store.requestBaselineAnalysisCancel(bookId, taskIntentId))).toBe('ANALYSIS_CANCEL_STALE');
      // Waiting for the network: that wait has its own 取消 (Issue #502).
      store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest);
      expect(await refusal(() => store.requestBaselineAnalysisCancel(bookId, taskIntentId))).toBe('ANALYSIS_CANCEL_WAITING');
      store.cancelWaitingBaselineAnalysis(bookId, taskIntentId);
      // Cancelled already: answered as it was, and nothing is named for the owner.
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBeNull();
      // A Run that ended cannot be cancelled.
      const next = prepare(store, bookId);
      const authorized = store.authorizeBaselineAnalysis(bookId, next.taskIntent!.taskIntentId, next.planEnvelope!.digest);
      execution.admitAndDispatch(authorized.dispatchRunRecordId!);
      await execution.whenIdle();
      expect(await refusal(() => store.requestBaselineAnalysisCancel(bookId, next.taskIntent!.taskIntentId))).toBe('ANALYSIS_CANCEL_NOT_RUNNING');
      // A Task this Book no longer holds is stale.
      expect(await refusal(() => store.requestBaselineAnalysisCancel(bookId, taskIntentId))).toBe('ANALYSIS_CANCEL_STALE');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('never lets the hold keep a Run from AI7 closing, and leaves it 可续行 with what it read kept (S76b, CONT-014)', async () => {
    const holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
    writeFileSync(holdPath, '1');
    const store = await openWithRoute();
    const execution = owner(store, holdPath);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 保持时关闭');
      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 2, 'the second unit in flight');
      await execution.dispose();
      // The held unit's turn had come back whole, so it settled and was kept; the Run then stopped without ending.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.run?.state).toBe('resumable');
      expect(stopped.stateLabel).toBe('任务已中断 · 可续行');
      expect(stopped.taskOutcome).toBeNull();
      expect(stopped.resultSetRevision).toBeNull();
      expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([1, 2]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});

describe('the sampling and reflection guards a cancellation sets', () => {
  it('names the cancellation in each of the steps it stops', () => {
    expect(CROSS_UNIT_CANCELLED).toBe('运行已按你的要求取消，跨单元归纳未发起。');
    expect(ASSURANCE_SAMPLING_CANCELLED).toBe('运行已按你的要求取消，保证抽样未发起。');
    expect(RUN_REPORT_REFLECTION_CANCELLED).toBe('运行已按你的要求取消，运行反思未发起。');
  });
});
