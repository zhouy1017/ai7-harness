import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import {
  DEFAULT_EXECUTION_RULES_STATEMENT,
  DefaultExecutionRuleLedger,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_OFFLINE,
  QUICK_START_RANGE_REASON,
  QUICK_START_RULE_CHANGED,
  QUICK_START_SLOT_BUSY,
  SET_RULE_FIRST_BASELINE,
  quickStartNoRuleReason,
} from '../../src/service/default-execution-rules.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CONNECTIVITY_WAIT_SCHEMA_VERSION, CLARIFICATION_SCHEMA_VERSION, PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateMode,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import {
  DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER,
  analysisRunAuthorizationsShape,
  plantRevision30Relations,
} from '../support/default-execution-rules.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for 快速开始 under a 默认执行规则 (Issue #421, plan slice S75): the real store on a
// temporary Agent Data Root, exact `sample1` imported through the supported path, and no Provider, socket or
// credential value. Schema revision 31 widens the Run Authorization origin and adds the rule ledger; a rule is set
// from a viewed plan, quick start records what 先看计划 + 开始任务 record with the rule named as the origin, and
// anything that would make the start differ from the rule stops at the plan.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-quick-start-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});

afterEach(async () => {
  await roots.dispose();
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

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
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

function prepare(store: EditorialStore, bookId: string, mode: BaselineAnalysisUpdateMode | null = null): BaselineAnalysisProjection {
  const goal = mode === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, mode === null ? null : { mode, selectedRange: null }, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

/** A Book whose first baseline analysis has run to its end, so ②A offers its three updates. */
async function analysedBook(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  const first = prepare(store, imported.bookId);
  const authorized = store.authorizeBaselineAnalysis(imported.bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest);
  owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.baselineAnalysisLedger);
  await owner.whenIdle();
  expect(store.inspectBaselineAnalysis(imported.bookId, () => null).state).toBe('settled');
  return imported.bookId;
}

function ownerOf(store: EditorialStore): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
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

describe('schema revision 31 over the real store', () => {
  it('widens a planted revision-30 store\'s authorization origin with every row as it was, and adds the empty rule ledger', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const imported = await importSample1Book(first, roots.codeRoot, 'L2 sample1 规则迁移');
      await pinEditorialWorkspaceProfileRevision2(first, imported.bookId);
      recordMissingCredentialConnection(first, 'L2 主编辑连接');
      const prepared = prepare(first, imported.bookId);
      first.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const before = withDatabase(false, (database) => {
      plantRevision30Relations(database);
      database.exec(`PRAGMA user_version = ${CONNECTIVITY_WAIT_SCHEMA_VERSION}`);
      expect(analysisRunAuthorizationsShape(database)).toBe('revision-30');
      return {
        authorizations: database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all() as Row[],
        truth: relationTruth(database),
      };
    });
    expect(before.authorizations.map((row) => row.origin)).toEqual(['standard-direct']);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.inspectDefaultExecutionRules()).toEqual({ rules: [], statement: DEFAULT_EXECUTION_RULES_STATEMENT });
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION);
      expect(analysisRunAuthorizationsShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all()).toEqual(before.authorizations);
      const after = relationTruth(database);
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER].sort());
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name)).toEqual(['analysis_run_authorizations']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_run_authorizations' ORDER BY name").all())
        .toEqual([{ name: 'analysis_run_authorizations_no_delete' }, { name: 'analysis_run_authorizations_no_update' }]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);

  it('refuses a store whose authorizations match neither shape, rather than rebuilding it', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    withDatabase(false, (database) => {
      plantRevision30Relations(database);
      // A hand-altered relation: a column no revision ever wrote.
      database.exec(`PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        DROP TRIGGER analysis_run_authorizations_no_update;
        DROP TRIGGER analysis_run_authorizations_no_delete;
        ALTER TABLE analysis_run_authorizations ADD COLUMN note TEXT;
        PRAGMA user_version = ${CONNECTIVITY_WAIT_SCHEMA_VERSION};
        COMMIT;
        PRAGMA foreign_keys = ON;`);
      expect(analysisRunAuthorizationsShape(database)).toBe('other');
    });
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 300_000);

  it('keeps every rule row as it was written: the ledger refuses an update or a delete', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 规则只追加');
      const plan = prepare(store, bookId, 'reanalyze-book');
      store.setDefaultExecutionRule(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    withDatabase(false, (database) => {
      for (const relation of DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER) {
        expect(() => database.exec(`UPDATE ${relation} SET canonical_json = canonical_json`)).toThrowError(/DEFAULT_EXECUTION_RULE_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${relation}`)).toThrowError(/DEFAULT_EXECUTION_RULE_IMMUTABLE/u);
      }
    });
  }, 300_000);
});

describe('设为快速开始默认… over the real store (AUTH-009, TASK-019)', () => {
  it('sets the Book\'s rule from the plan on show, answers the same plan again as it is, and gives ②A its quick start', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 设为默认');
      // The standard authorization of the first baseline set no rule (AUTH-009), and no mode starts quickly yet.
      expect(store.inspectDefaultExecutionRules().rules).toEqual([]);
      const before = store.inspectBaselineAnalysis(bookId, () => null).updateControls!;
      expect(before.actions['reanalyze-book'].quickStart).toEqual({ available: false, reason: quickStartNoRuleReason('reanalyze-book'), rule: null });
      expect(before.actions['reanalyze-range'].quickStart).toEqual({ available: false, reason: QUICK_START_RANGE_REASON, rule: null });

      const plan = prepare(store, bookId, 'reanalyze-book');
      const taskIntentId = plan.taskIntent!.taskIntentId;
      const offered = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).defaultRule;
      expect(offered).toMatchObject({ canSet: true, reason: null, planEnvelopeDigest: plan.planEnvelope!.digest, current: null, startedBy: null });
      expect(offered.binds.map((row) => row.label)).toEqual(['模型服务', '工序', '预算上限', '发送内容类别', '会得到']);

      const rule = store.setDefaultExecutionRule(bookId, taskIntentId, plan.planEnvelope!.digest);
      expect(rule).toMatchObject({
        bookId, bookTitle: 'L2 sample1 设为默认', pattern: 'reanalyze-book', ordinal: 1, name: '开始全部重来 · 第 1 版',
        state: 'active', stateLabel: '使用中', setBy: '本机编辑', sourceTaskIntentId: taskIntentId, sourcePlanEnvelopeDigest: plan.planEnvelope!.digest,
      });
      expect(rule.binds).toEqual(offered.binds);
      // What the rule binds is the plan's material inputs without the range and the predecessor, which are each Run's own.
      const inputs = plan.planVersion!.materialInputs;
      expect(rule.binding).toEqual({
        providerBinding: inputs.providerBinding, artifactPin: inputs.artifactPin, runBudgetCeiling: inputs.runBudgetCeiling,
        outboundDataCategory: inputs.outboundDataCategory, expectedOutcome: inputs.expectedOutcome,
      });
      // The same plan set again is the same rule, with no new version.
      expect(store.setDefaultExecutionRule(bookId, taskIntentId, plan.planEnvelope!.digest)).toEqual(rule);
      const shown = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).defaultRule;
      expect(shown).toMatchObject({ canSet: false, current: { ruleId: rule.ruleId, ordinal: 1, state: 'active', fromThisPlan: true } });
      expect(store.inspectDefaultExecutionRules().rules).toEqual([rule]);

      const after = store.inspectBaselineAnalysis(bookId, () => null).updateControls!;
      // The prepared update holds the Book, so no mode is on offer until it is settled or started — but the rule is named.
      expect(after.actions['reanalyze-book'].quickStart?.rule).toEqual({ ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: 1, name: '开始全部重来 · 第 1 版' });
      expect(after.actions['sync-current'].quickStart).toEqual({ available: false, reason: quickStartNoRuleReason('sync-current'), rule: null });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never sets a rule from a first baseline, and says why', async () => {
    const store = await openWithRoute();
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 首次不设默认');
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = prepare(store, imported.bookId);
      const offered = store.inspectTaskPlan({ bookId: imported.bookId, kind: 'baseline-analysis', ref: first.taskIntent!.taskIntentId }).defaultRule;
      expect(offered).toEqual({ canSet: false, reason: SET_RULE_FIRST_BASELINE, planEnvelopeDigest: null, current: null, binds: [], startedBy: null });
      expect(await refusal(() => store.setDefaultExecutionRule(imported.bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest)))
        .toBe('DEFAULT_EXECUTION_RULE_UNAVAILABLE');
      expect(store.inspectDefaultExecutionRules().rules).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});

describe('快速开始 over the real store (TASK-017, TASK-020, TASK-026, TASK-028)', () => {
  it('starts the prepared Task exactly as 开始任务 would, naming the rule version, and runs it to its end', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 快速开始');
      const source = prepare(store, bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      // The plan the rule came from is started from its bar as usual; the next update is the quick start.
      const started = store.authorizeBaselineAnalysis(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      owner.admitAndDispatch(started.dispatchRunRecordId!, store.baselineAnalysisLedger);
      await owner.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).updateControls!.actions['reanalyze-book'].quickStart)
        .toEqual({ available: true, reason: null, rule: { ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: 1, name: rule.name } });

      const plan = prepare(store, bookId, 'reanalyze-book');
      const state = { connectivity: 'online' as Connectivity, busy: false };
      const quick = await store.quickStartBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, rule.ruleVersionId,
        { credentialReadiness: async () => null, connectivity: reader(state) });
      expect(quick.outcome).toBe('started');
      expect(quick.reasons).toEqual([]);
      expect(quick.dispatchRunRecordId).not.toBeNull();
      const recorded = store.inspectBaselineAnalysis(bookId, () => null);
      expect(recorded.authorization).toMatchObject({ origin: 'default-execution-rule', ruleVersionId: rule.ruleVersionId, authority: 'standard-direct-dispatch' });
      owner.admitAndDispatch(quick.dispatchRunRecordId!, store.baselineAnalysisLedger);
      await owner.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(settled.state).toBe('settled');
      expect(settled.run?.transitions[0]).toMatchObject({ state: 'authorized', detail: '快速开始按默认执行规则记录了运行授权。' });
      // The drawer names the rule the Task was started under, and a repeat of the same quick start answers as the first did.
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: plan.taskIntent!.taskIntentId }).defaultRule.startedBy)
        .toEqual({ ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: 1, name: rule.name });
      expect(await store.quickStartBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, rule.ruleVersionId,
        { credentialReadiness: async () => null, connectivity: reader(state) })).toEqual({ outcome: 'started', reasons: [], dispatchRunRecordId: null });
      // The record set is the one 开始任务 writes: one authorization and one Run per Task, the rule only named in it.
      withDatabase(true, (database) => {
        const origins = database.prepare('SELECT origin FROM analysis_run_authorizations ORDER BY rowid').all() as Row[];
        expect(origins.map((row) => row.origin)).toEqual(['standard-direct', 'standard-direct', 'default-execution-rule']);
        expect((database.prepare('SELECT count(*) total FROM analysis_run_records').get() as { total: number }).total).toBe(3);
        expect((database.prepare('SELECT count(*) total FROM default_execution_rule_versions').get() as { total: number }).total).toBe(1);
      });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('stops at the plan, recording nothing, when offline, when the slot is busy, or when the rule was turned off', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 快速开始退回');
      const source = prepare(store, bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      const taskIntentId = source.taskIntent!.taskIntentId;
      const digest = source.planEnvelope!.digest;
      const state = { connectivity: 'offline' as Connectivity, busy: false };
      const runtime = { credentialReadiness: async () => null, connectivity: reader(state) };
      expect(await store.quickStartBaselineAnalysis(bookId, taskIntentId, digest, rule.ruleVersionId, runtime))
        .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_OFFLINE], dispatchRunRecordId: null });
      state.connectivity = 'online';
      state.busy = true;
      expect(await store.quickStartBaselineAnalysis(bookId, taskIntentId, digest, rule.ruleVersionId, runtime))
        .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_SLOT_BUSY], dispatchRunRecordId: null });
      state.busy = false;
      // A version the editor did not start under — a stale one — is never used.
      expect(await store.quickStartBaselineAnalysis(bookId, taskIntentId, digest, randomUUID(), runtime))
        .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_RULE_CHANGED], dispatchRunRecordId: null });
      const off = store.deactivateDefaultExecutionRule(rule.ruleId);
      expect(off).toMatchObject({ state: 'deactivated', stateLabel: '已停用', ordinal: 1 });
      expect(store.deactivateDefaultExecutionRule(rule.ruleId)).toEqual(off);
      expect(await store.quickStartBaselineAnalysis(bookId, taskIntentId, digest, rule.ruleVersionId, runtime))
        .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_RULE_CHANGED], dispatchRunRecordId: null });
      // Nothing was recorded: the plan stands prepared, and the bar still starts it.
      const unchanged = store.inspectBaselineAnalysis(bookId, () => null);
      expect(unchanged.authorization).toBeNull();
      expect(unchanged.state).toBe('prepared');
      // Set again from the plan now on show: the rule's second version is in force.
      const again = store.setDefaultExecutionRule(bookId, taskIntentId, digest);
      expect(again).toMatchObject({ ruleId: rule.ruleId, ordinal: 2, name: '开始全部重来 · 第 2 版', state: 'active' });
      expect(store.inspectDefaultExecutionRules().rules).toEqual([again]);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('prepares the Task again after an edit, so a quick start never reads text older than the editor (TASK-024)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 快速开始后又编辑');
      const source = prepare(store, bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      const state = { connectivity: 'offline' as Connectivity, busy: false };
      const runtime = { credentialReadiness: async () => null, connectivity: reader(state) };
      // 开始全部重来 falls back offline: the Task stays prepared, pinned to the text it read.
      expect((await store.quickStartBaselineAnalysis(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest, rule.ruleVersionId, runtime)).outcome)
        .toBe('fell-back');
      // Preparing again with nothing edited answers with the same Task.
      expect(prepare(store, bookId, 'reanalyze-book').taskIntent!.taskIntentId).toBe(source.taskIntent!.taskIntentId);

      // The editor edits, then presses the quick start again: the preparation it makes pins the edited text, as a new Task.
      const checkpoint = source.checkpoint!;
      const window = store.getManuscriptWindow(checkpoint.manuscriptId, checkpoint.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: checkpoint.manuscriptId, branchId: checkpoint.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '〔快速开始前的改动〕',
      });
      const again = prepare(store, bookId, 'reanalyze-book');
      expect(again.taskIntent!.taskIntentId).not.toBe(source.taskIntent!.taskIntentId);
      expect(again.checkpoint!.journalSequence).toBeGreaterThan(checkpoint.journalSequence);
      expect(again.checkpoint!.revisionId).not.toBe(checkpoint.revisionId);
      state.connectivity = 'online';
      const quick = await store.quickStartBaselineAnalysis(bookId, again.taskIntent!.taskIntentId, again.planEnvelope!.digest, rule.ruleVersionId, runtime);
      expect(quick.outcome).toBe('started');
      expect(store.inspectBaselineAnalysis(bookId, () => null).checkpoint!.revisionId).toBe(again.checkpoint!.revisionId);
      if (quick.dispatchRunRecordId !== null) {
        owner.admitAndDispatch(quick.dispatchRunRecordId);
        await owner.whenIdle();
      }
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('stops at the plan when what the rule binds differs from the plan, naming what differs', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 规则已变');
      const source = prepare(store, bookId, 'reanalyze-book');
      store.setDefaultExecutionRule(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      // The rule's next version binds another credential reference, as a rule set under another connection would.
      const other = withDatabase(false, (database) => {
        const ledger = new DefaultExecutionRuleLedger(database);
        const current = ledger.activeFor(bookId, 'reanalyze-book')!;
        return ledger.set({
          bookId, pattern: 'reanalyze-book', sourceTaskIntentId: source.taskIntent!.taskIntentId, sourcePlanEnvelopeDigest: 'f'.repeat(64),
          binding: { ...current.version.binding, providerBinding: { ...current.version.binding.providerBinding, credentialReference: randomUUID() } },
        });
      });
      const reason = `默认执行规则「开始全部重来 · 第 2 版」定下的「模型服务 · 连接」已经变化，不能按规则直接开始；请看过计划后再开始，也可以把新的计划设为快速开始默认。`;
      const quick = await store.quickStartBaselineAnalysis(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest, other.version.ruleVersionId,
        { credentialReadiness: async () => null, connectivity: reader({ connectivity: 'online', busy: false }) });
      expect(quick).toEqual({ outcome: 'fell-back', reasons: [reason], dispatchRunRecordId: null });
      expect(store.inspectBaselineAnalysis(bookId, () => null).authorization).toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never uses a rule under developer-live (Provider Processing: matchingActiveDefaultExecutionRuleAllowed false)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const bookId = await analysedBook(store, owner, 'L2 sample1 开发者实时');
      const source = prepare(store, bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
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
      expect(store.inspectBaselineAnalysis(bookId, () => null).updateControls!.actions['reanalyze-book'].quickStart)
        .toEqual({ available: false, reason: QUICK_START_DEVELOPER_LIVE, rule: { ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: 1, name: rule.name } });
      expect(await store.quickStartBaselineAnalysis(bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest, rule.ruleVersionId,
        { credentialReadiness: async () => 'present', connectivity: reader({ connectivity: 'online', busy: false }) }))
        .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_DEVELOPER_LIVE], dispatchRunRecordId: null });
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);
});
