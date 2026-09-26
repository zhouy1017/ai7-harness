import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { readGlobalAttention } from '../../src/service/global-attention.js';
import type { WaitingFor } from '../../src/service/task-plan.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, DECISION_FEEDBACK_SCHEMA_VERSION, EXPORT_LEDGER_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { analysisRunStatesShape, downgradeAnalysisRunStatesToRevision29 } from '../support/connectivity-wait.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, plantRevision30Relations } from '../support/default-execution-rules.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for Connectivity Wait (Issue #502, plan slice S74b): the real store on a
// temporary Agent Data Root, exact `sample1` imported through the supported path, and no Provider, socket
// or credential value. Schema revision 30 widens the Run states; `联网后开始任务` records a Run that waits,
// Reconnect Preflight admits it or says why not, and a waiting Run is cancelled before it dispatches.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-connectivity-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});

/** The store with J-04's deterministic route bound, as the J-04 model-adapter control binds it. */
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

/** What the service reads, as J-04's connectivity control makes it read: the deterministic route needs the network. */
function reader(state: { connectivity: Connectivity; busy: boolean }): TaskPlanConnectivity {
  return {
    reading: () => state.connectivity,
    reachesNetwork: (routeKind) => routeKind === LOCAL_DETERMINISTIC_ROUTE,
    slotBusy: () => state.busy,
  };
}

/** Reconnect Preflight wired exactly as the service wires it, over this store and this owner. */
function preflight(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, connectivity: () => Connectivity) {
  return reconnectPreflight({
    waitingRuns: () => store.waitingBaselineAnalysisRuns(null),
    stillWaiting: (runRecordId) => store.baselineAnalysisRunWaits(runRecordId),
    drift: (runRecordId) => store.baselineAnalysisPreflightDrift(runRecordId),
    block: (runRecordId, reasons, cause) => store.blockWaitingBaselineAnalysisRun(runRecordId, reasons, cause),
    reachesNetwork: true,
    connectivity,
    credentialReadiness: () => owner.liveCredentialReadiness(),
    slotBusy: () => owner.busy,
    admit: (runRecordId) => owner.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { afterReconnectPreflight: true }),
  });
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

async function preparedBook(store: EditorialStore, title: string): Promise<{ bookId: string; prepared: BaselineAnalysisProjection }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return { bookId: imported.bookId, prepared: prepare(store, imported.bookId) };
}

afterEach(async () => {
  await roots.dispose();
});

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

/** Every relation's exact text and a digest of its rows, so a migration can say exactly what it moved. */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Row[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

describe('schema revision 30 over the real store', () => {
  it('widens a planted revision-29 store\'s Run states with every row as it was, and moves nothing revision 31 does not', async () => {
    // A Task authorized with no route: the two Run states revision 29 already admitted.
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const imported = await importSample1Book(first, roots.codeRoot, 'L2 sample1 联网等待迁移');
      await pinEditorialWorkspaceProfileRevision2(first, imported.bookId);
      recordMissingCredentialConnection(first, 'L2 主编辑连接');
      const prepared = prepare(first, imported.bookId);
      first.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const before = withDatabase(false, (database) => {
      // Revision 31 (Issue #421) came after: a store revision 29 left holds neither its rule ledger nor its
      // widened authorization origin.
      plantRevision30Relations(database);
      downgradeAnalysisRunStatesToRevision29(database);
      database.exec(`PRAGMA user_version = ${EXPORT_LEDGER_SCHEMA_VERSION}`);
      expect(analysisRunStatesShape(database)).toBe('revision-29');
      return {
        states: database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all() as Row[],
        truth: relationTruth(database),
      };
    });
    expect(before.states.map((row) => row.state)).toEqual(['authorized', 'blocked-before-dispatch']);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DECISION_FEEDBACK_SCHEMA_VERSION);
      expect(analysisRunStatesShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all()).toEqual(before.states);
      const after = relationTruth(database);
      // Revision 31 then adds its rule ledger, empty, and widens the authorization origin the same way.
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER].sort());
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name))
        .toEqual(['analysis_run_authorizations', 'analysis_run_states']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_run_states' ORDER BY name").all())
        .toEqual([{ name: 'analysis_run_states_no_delete' }, { name: 'analysis_run_states_no_update' }]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);

  it('refuses a store whose Run states match neither shape, rather than rebuilding it', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    withDatabase(false, (database) => {
      plantRevision30Relations(database);
      downgradeAnalysisRunStatesToRevision29(database);
      // A hand-altered relation: a column no revision ever wrote.
      database.exec(`PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        DROP TRIGGER analysis_run_states_no_update;
        DROP TRIGGER analysis_run_states_no_delete;
        ALTER TABLE analysis_run_states ADD COLUMN note TEXT;
        PRAGMA user_version = ${EXPORT_LEDGER_SCHEMA_VERSION};
        COMMIT;
        PRAGMA foreign_keys = ON;`);
      expect(analysisRunStatesShape(database)).toBe('other');
    });
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 300_000);
});

describe('联网后开始任务 and Connectivity Wait over the real store', () => {
  it('records the exact authorization and a Run that waits, sending nothing, and keeps a new Task from being prepared over it', async () => {
    const store = await openWithRoute();
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 联网后开始');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const waiting = store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest);
      expect(waiting.state).toBe('waiting');
      // The analysis reads as its Run does, never as 已中断 (OFF-012).
      expect(waiting.stateLabel).toBe('等待网络 · 未启动');
      // The same Run Authorization 开始任务 records: this is still the editor's direct start (AUTH-004).
      expect(waiting.authorization).toMatchObject({ origin: 'standard-direct', authority: 'standard-direct-dispatch' });
      expect(waiting.run).toMatchObject({ state: 'awaiting-connectivity', stateLabel: '等待网络 · 未启动', attempt: null, progress: null });
      expect(waiting.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'awaiting-connectivity']);
      // A repeat answers as the first did, and a waiting Run is active: nothing is prepared over it — and the refusal
      // says it waits to start, never that it is under way (OFF-005, OFF-006).
      expect(store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest).run?.runRecordId).toBe(waiting.run?.runRecordId);
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');
      expect(() => prepare(store, bookId)).toThrow('有一项分析任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的更新任务。');
      expect(store.waitingBaselineAnalysisRuns(null)).toEqual([{ bookId, taskIntentId, runRecordId: waiting.run!.runRecordId }]);
      expect(store.waitingBaselineAnalysisRuns(bookId)).toHaveLength(1);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses to wait for a network a plan without a route would never use', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 无路由不等待');
      expect(await refusal(() => store.startBaselineAnalysisWhenOnline(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest)))
        .toBe('ANALYSIS_START_WHEN_ONLINE_INVALID');
      expect(store.inspectBaselineAnalysis(bookId, () => null).run).toBeNull();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('cancels a waiting Run directly and for good: nothing sent, cancelling twice answers the same, and a new Task can be prepared (OFF-010)', async () => {
    const store = await openWithRoute();
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 取消等待');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const cancelled = store.cancelWaitingBaselineAnalysis(bookId, taskIntentId);
      // Its own state, never 已中断, which OFF-012 keeps for a Run that can resume.
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.stateLabel).toBe('已取消 · 未启动');
      expect(cancelled.run).toMatchObject({ state: 'cancelled', stateLabel: '已取消 · 未启动', attempt: null });
      expect(cancelled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'awaiting-connectivity', 'cancelled']);
      expect(cancelled.taskOutcome).toBeNull();
      // The 任务 panel keeps it, in 最近完成 as 已取消 with nothing formed, though no Task Outcome names it (Issue #423 review).
      const panel = store.inspectBookTasks(bookId, () => null);
      expect(panel.groups.map((group) => [group.key, group.items.map((entry) => [entry.item.itemId, entry.item.state, entry.item.facts.revisionOrdinal ?? null, entry.result])]))
        .toEqual([['waiting', []], ['running', []], ['recent', [[`analysis:${taskIntentId}`, 'analysis-cancelled', null, null]]]]);
      expect(panel.running).toBe(false);
      // The Book still holds no revision, so the first baseline is offered again.
      expect(cancelled.actions.canPrepare).toBe(true);
      expect(store.cancelWaitingBaselineAnalysis(bookId, taskIntentId).run?.transitions).toHaveLength(3);
      expect(store.waitingBaselineAnalysisRuns(null)).toEqual([]);
      expect(prepare(store, bookId).taskIntent?.taskIntentId).not.toBe(taskIntentId);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('cancels only a Run that waits: one started now is not the waiting Run\'s to cancel', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 不在等待');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest);
      expect(await refusal(() => store.cancelWaitingBaselineAnalysis(bookId, taskIntentId))).toBe('ANALYSIS_CANCEL_NOT_WAITING');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('reads 离线 while the device has no network the route needs, then says what the waiting Run waits for (Issue #502; OFF-004, OFF-006)', async () => {
    const store = await openWithRoute();
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 离线计划');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const state = { connectivity: 'offline' as Connectivity, busy: false };
      const input = { bookId, kind: 'baseline-analysis' as const, ref: taskIntentId };
      const offline = await store.inspectTaskPlanWithConnection(input, async () => null, reader(state));
      expect(offline.state).toEqual({ key: 'offline', label: '离线' });
      expect(offline.start).toMatchObject({ readiness: 'offline', planEnvelopeDigest: prepared.planEnvelope!.digest });
      // The same plan read online is ready, and without the reader it never reaches a network at all.
      state.connectivity = 'online';
      expect((await store.inspectTaskPlanWithConnection(input, async () => null, reader(state))).start.readiness).toBe('ready');
      expect((await store.inspectTaskPlanWithConnection(input, async () => null)).start.readiness).toBe('ready');

      store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, offline.start.planEnvelopeDigest!);
      state.connectivity = 'offline';
      const waiting = await store.inspectTaskPlanWithConnection(input, async () => null, reader(state));
      expect(waiting.start.readiness).toBe('started');
      expect(waiting.state).toEqual({ key: 'waiting', label: '等待网络' });
      state.connectivity = 'online';
      state.busy = true;
      expect((await store.inspectTaskPlanWithConnection(input, async () => null, reader(state))).state.label).toBe('等待运行名额');
      state.busy = false;
      expect((await store.inspectTaskPlanWithConnection(input, async () => null, reader(state))).state.label).toBe('正在排队');
      expect((await store.inspectTaskPlanWithConnection(input, async () => 'missing', reader(state))).state.label).toBe('需要处理模型连接');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('leaves the Run waiting while offline, then admits it through the one slot and runs it to its end once online (OFF-008)', async () => {
    const store = await openWithRoute();
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 联网后执行');
      store.startBaselineAnalysisWhenOnline(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      let connectivity: Connectivity = 'offline';
      expect(await preflight(store, owner, () => connectivity)).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('awaiting-connectivity');
      connectivity = 'online';
      expect(await preflight(store, owner, () => connectivity)).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await owner.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
      expect(settled.state).toBe('settled');
      expect(settled.run?.transitions.map((transition) => transition.state).slice(0, 3)).toEqual(['authorized', 'awaiting-connectivity', 'admitted']);
      expect(settled.taskOutcome?.classification).toBe('completed');
      expect(await preflight(store, owner, () => connectivity)).toEqual({ admitted: 0, blocked: 0, waiting: 0 });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps a waiting Run across a restart, and admits it once the service is active again (OFF-013)', async () => {
    const first = await openWithRoute();
    let bookId: string;
    try {
      const book = await preparedBook(first, 'L2 sample1 重启后等待');
      bookId = book.bookId;
      first.startBaselineAnalysisWhenOnline(bookId, book.prepared.taskIntent!.taskIntentId, book.prepared.planEnvelope!.digest);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const second = await openWithRoute();
    const owner = new BaselineAnalysisExecutionOwner({ ledger: second.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    try {
      expect(second.inspectBaselineAnalysis(bookId, () => null).state).toBe('waiting');
      expect(await preflight(second, owner, () => 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await owner.whenIdle();
      expect(second.inspectBaselineAnalysis(bookId, () => null).state).toBe('settled');
      second.markCleanShutdown();
    } finally {
      await owner.dispose();
      second.close();
    }
  }, 300_000);

  it('blocks a waiting Run whose bound plan no longer stands, naming what moved, and never dispatches it (OFF-008)', async () => {
    const store = await openWithRoute();
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 计划已变');
      store.startBaselineAnalysisWhenOnline(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = store.waitingBaselineAnalysisRuns(bookId)[0]!.runRecordId;
      expect(store.baselineAnalysisPreflightDrift(runRecordId)).toEqual([]);
      // The Run was deferred under development-ci and is looked at under another launch: the provider binding and
      // the Run Budget Ceiling it froze are material inputs, and neither is what this launch would bind now.
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
      const changed = store.baselineAnalysisPreflightDrift(runRecordId);
      expect(changed.length).toBeGreaterThan(0);
      expect(await preflight(store, owner, () => 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      const blocked = store.inspectBaselineAnalysis(bookId, () => null);
      expect(blocked.run?.state).toBe('blocked-before-dispatch');
      expect(blocked.run?.attempt).toBeNull();
      expect(blocked.run?.blockedReasons).toEqual([`需要重新确认计划：${changed.join('、')}已经变化，这次授权不再对应当前的情况。`]);
      // 需要重新确认计划 (Issue #536): the Run keeps why it was blocked, and every place it is shown says so, never 派发前已阻止.
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      expect([blocked.run?.blockedBy, blocked.state, blocked.stateLabel, blocked.run?.stateLabel])
        .toEqual(['plan-moved', 'authorized-blocked', '需要重新确认计划', '需要重新确认计划']);
      // A first baseline blocked here left the Book no revision: ②A offers it again (Issue #539).
      expect([blocked.resultSetRevision, blocked.actions.canPrepare]).toEqual([null, true]);
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'plan-moved', label: '需要重新确认计划' });
      // 重新准备 is the Task it was — the first baseline — prepared anew; nothing is started by reading it.
      expect(plan.reprepare).toEqual({ reason: blocked.run!.blockedReasons![0], prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null } });
      const itemOf = () => store.inspectGlobalAttention(() => null, false).groups
        .flatMap((group) => group.items.map((entry) => ({ group: group.key, entry })))
        .find(({ entry }) => entry.itemId === `analysis:${taskIntentId}`);
      // 待我处理 puts it with the other plan decisions, blocking, with 重新准备 as its step and the plan as its target.
      expect(itemOf()).toMatchObject({
        group: 'decisions',
        entry: { state: 'analysis-plan-moved', blocked: true, nextStep: 'reprepare', target: { kind: 'analysis-plan', bookId, taskIntentId } },
      });
      // A blocked Run no longer holds the Book: back under the launch it was prepared for, 重新准备's request prepares the
      // new plan, and the decision is made — nothing of the old Task asks for the editor any more.
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      let progress = store.createBaselineAnalysisPreparationWork(bookId, plan.reprepare!.prepare.goal, plan.reprepare!.prepare.update, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      expect(progress.projection?.state).toBe('prepared');
      expect(progress.projection?.taskIntent?.taskIntentId).not.toBe(taskIntentId);
      expect(itemOf()).toBeUndefined();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('checks what a waiting Run waits for only while one waits, and reads a failed check as waiting for the connection (Issue #539)', async () => {
    const store = await openWithRoute();
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 待我处理读取');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      let checks = 0;
      const checking = (answer: () => Promise<WaitingFor>) => () => {
        checks += 1;
        return answer();
      };
      const itemOf = async (answer: () => Promise<WaitingFor>) => (await readGlobalAttention(store, () => null, false, checking(answer))).groups
        .flatMap((group) => group.items).find((entry) => entry.itemId === `analysis:${taskIntentId}`);
      // Nothing waits: 待我处理 is read without the keyring check.
      expect(await itemOf(async () => 'network')).toBeUndefined();
      expect(checks).toBe(0);
      store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest);
      // A Run waits: the check is made once per read, and names what the Run waits for.
      expect((await itemOf(async () => 'network'))?.state).toBe('analysis-waiting-network');
      expect((await itemOf(async () => 'admitting'))?.state).toBe('analysis-waiting-admission');
      expect(checks).toBe(2);
      // A check that fails does not fail the read. Reconnect Preflight admits nothing while it fails, so the Run reads as
      // waiting for the connection, never as about to start.
      expect((await itemOf(async () => { throw new Error('keyring unavailable'); }))?.state).toBe('analysis-waiting-connection');
      expect(checks).toBe(3);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('keeps 派发前已阻止 for a waiting Run this launch cannot admit, and records why in the state it wrote (Issue #536)', async () => {
    const store = await openWithRoute();
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 启动无法接纳');
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = store.waitingBaselineAnalysisRuns(bookId)[0]!.runRecordId;
      expect(await refusal(() => store.blockWaitingBaselineAnalysisRun(runRecordId, ['运行未能进入调度。'], 'unknown' as 'launch'))).toBe('ANALYSIS_RUN_INVALID');
      store.blockWaitingBaselineAnalysisRun(runRecordId, ['当前图书不在可传输的集合内；未发起任何传输。'], 'launch');
      const blocked = store.inspectBaselineAnalysis(bookId, () => null);
      expect([blocked.run?.blockedBy, blocked.stateLabel, blocked.run?.stateLabel]).toEqual(['launch', '已授权 · 派发前阻止', '派发前阻止 · 未启动']);
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect([plan.state, plan.reprepare]).toEqual([{ key: 'blocked', label: '派发前已阻止' }, null]);
      expect(store.inspectGlobalAttention(() => null, false).groups.find((group) => group.key === 'exceptions')?.items
        .find((entry) => entry.itemId === `analysis:${taskIntentId}`)).toMatchObject({ state: 'analysis-blocked', nextStep: 'view-run' });
      // Why travels in the state record's canonical detail: no schema change.
      const detail = withDatabase(true, (database) => database.prepare(
        'SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1',
      ).get(runRecordId) as { canonical_json: string });
      expect(JSON.parse(detail.canonical_json)).toMatchObject({ state: 'blocked-before-dispatch', cause: 'launch', reasons: ['当前图书不在可传输的集合内；未发起任何传输。'] });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('admits a waiting Run only through Reconnect Preflight: the ordinary admission refuses it', async () => {
    const store = await openWithRoute();
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    try {
      const { bookId, prepared } = await preparedBook(store, 'L2 sample1 须经预检');
      store.startBaselineAnalysisWhenOnline(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      const runRecordId = store.waitingBaselineAnalysisRuns(bookId)[0]!.runRecordId;
      expect(() => owner.admitAndDispatch(runRecordId)).toThrowError(/重新联网预检/u);
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('awaiting-connectivity');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);
});
