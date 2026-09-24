import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ASSURANCE_SAMPLING_REMOVED, NO_PLAN_EDITS, SAFE_RETRY_WITHHELD, planEditDiff } from '../../src/service/analysis/plan-edits.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { SET_RULE_EDITED } from '../../src/service/default-execution-rules.js';
import { PLAN_EDIT_DRIFT_REASON, PLAN_EDIT_STARTED_REASON } from '../../src/service/task-plan.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { planRevisionsShapeAt33, plantRevision33Relations } from '../support/plan-edits.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the editable plan (Issue #419, plan slice S73; V2-UX-PLAN-009, PLAN-011): the real
// store on a temporary Agent Data Root, exact `sample1` imported through the supported path, J-04's deterministic
// route, and no Provider, socket or credential value. Schema revision 34 lets a Plan Revision record the editor's own
// edit; 更新计划 writes the next plan version as the editor left the plan; and the Run honours what it leaves out.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let happy: ResolvedModelFixture;
let transient: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const BOTH = { removedSteps: ['assurance-sampling'], disallowedAdaptations: ['safe-retry'] } as const;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-plan-edit-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(fixture: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

function owner(store: EditorialStore, fixture: ResolvedModelFixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null, reconfirm = false): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy, reconfirm);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function importedBook(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

async function runToSettled(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, bookId: string, digest: string, taskIntentId: string): Promise<BaselineAnalysisProjection> {
  execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, taskIntentId, digest).dispatchRunRecordId!);
  await execution.whenIdle();
  return store.inspectBaselineAnalysis(bookId, () => null);
}

function edit(store: EditorialStore, bookId: string, taskIntentId: string, planEnvelopeDigest: string, edits: { removedSteps: ReadonlyArray<string>; disallowedAdaptations: ReadonlyArray<string> }) {
  return store.editBaselineAnalysisPlan({ bookId, taskIntentId, planEnvelopeDigest, ...edits });
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

describe('schema revision 34 over the real store', () => {
  it('widens a planted revision-33 store\'s Plan Revisions with every row as it was', async () => {
    const first = await openWithRoute(happy);
    const execution = owner(first, happy);
    try {
      const bookId = await importedBook(first, 'L2 sample1 计划修改迁移');
      const prepared = prepare(first, bookId);
      const settled = await runToSettled(first, execution, bookId, prepared.planEnvelope!.digest, prepared.taskIntent!.taskIntentId);
      // A pending Plan Revision to carry across: a range update prepared at one range, then at another.
      const options = settled.updateControls!.actions['reanalyze-range'].options;
      prepare(first, bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: options[2]!.startPosition, endPosition: options[2]!.endPosition } });
      const drifted = prepare(first, bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: options[7]!.startPosition, endPosition: options[7]!.endPosition } });
      expect(drifted.planRevision).toMatchObject({ trigger: 'prepare', state: 'pending' });
      first.markCleanShutdown();
    } finally {
      await execution.dispose();
      first.close();
    }
    const before = withDatabase(false, (database) => {
      plantRevision33Relations(database);
      database.exec('PRAGMA user_version = 33');
      expect(planRevisionsShapeAt33(database)).toBe('revision-33');
      return { revisions: database.prepare('SELECT rowid, * FROM analysis_plan_revisions ORDER BY rowid').all() as Row[], truth: relationTruth(database) };
    });
    expect(before.revisions.map((row) => row.trigger_kind)).toEqual(['prepare']);
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION);
      expect(planRevisionsShapeAt33(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_plan_revisions ORDER BY rowid').all()).toEqual(before.revisions);
      const after = relationTruth(database);
      // Revision 35's relations arrive empty on the way (Issue #422, S76d).
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER].sort());
      for (const relation of CLARIFICATION_RELATIONS_DROP_ORDER) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name)).toEqual(['analysis_plan_revisions']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      // Still a ledger: nothing rewrites or removes a Plan Revision.
      expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_plan_revisions' ORDER BY name").all())
        .toEqual([{ name: 'analysis_plan_revisions_no_delete' }, { name: 'analysis_plan_revisions_no_update' }]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);
});

describe('更新计划 over the real store', () => {
  it('writes the next plan version as the editor left the plan, records the edit, and the Run leaves out 核对与抽检', async () => {
    const store = await openWithRoute(happy);
    const execution = owner(store, happy);
    try {
      const bookId = await importedBook(store, 'L2 sample1 更新计划');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const v1 = prepared.planEnvelope!.digest;
      const input = { bookId, kind: 'baseline-analysis' as const, ref: taskIntentId };
      // The plan AI7 proposed: three steps, one the Run can do without, and the one adaptation the editor may withdraw.
      const proposed = store.inspectTaskPlan(input);
      expect(proposed.steps.map((step) => [step.id, step.label, step.removable, step.removed])).toEqual([
        ['units', '逐章读取', false, false],
        ['reduction', '汇总全书', false, false],
        ['assurance-sampling', '核对与抽检', true, false],
      ]);
      expect(proposed.boundary.adaptable).toEqual([{ id: 'safe-retry', label: '模型服务暂时出错时，同一个阅读范围安全地再试一次', removable: true, removed: false, movable: true, askFirst: false }]);
      // 设置上限… is offered with the other edits (Issue #51, S16a): no ceiling yet, and the editor's to set.
      expect(proposed.edit).toEqual({ editable: true, reason: null, lastEdit: null, planEnvelopeDigest: v1, budget: { ceiling: 'unset', settable: true, reason: null } });
      expect(prepared.planVersion?.edits).toEqual(NO_PLAN_EDITS);
      expect(prepared.executionPlan).not.toHaveProperty('editorEdits');

      // 更新计划: version 2, its Plan Revision the editor's edit, the material inputs as they were.
      const edited = edit(store, bookId, taskIntentId, v1, BOTH);
      const v2 = edited.planEnvelope!.digest;
      expect(edited.planVersion).toMatchObject({ ordinal: 2, state: 'current', edits: BOTH });
      expect(edited.planVersions.map((version) => [version.ordinal, version.state, version.edits])).toEqual([[1, 'superseded', NO_PLAN_EDITS], [2, 'current', BOTH]]);
      expect(edited.planVersion!.materialInputs).toEqual(prepared.planVersion!.materialInputs);
      const revision = edited.planRevisions.at(-1)!;
      expect(revision).toMatchObject({ trigger: 'plan-edit', state: 'resolved', priorOrdinal: 1, nextOrdinal: 2, resolved: true });
      expect(revision.diff).toEqual(planEditDiff(NO_PLAN_EDITS, BOTH));
      expect(edited.planRevision).toBeNull();
      expect(edited.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });
      expect(edited.executionPlan?.editorEdits).toEqual(BOTH);
      expect(edited.planEnvelope?.boundary?.adaptable).toEqual([]);
      // The editor is the actor, recorded with the time (PLAN-011).
      const stored = withDatabase(true, (database) => database.prepare("SELECT trigger_kind, detected_at, canonical_json FROM analysis_plan_revisions WHERE task_intent_id = ?").get(taskIntentId) as Row);
      expect(stored.trigger_kind).toBe('plan-edit');
      expect(JSON.parse(String(stored.canonical_json))).toMatchObject({ actor: 'editor', trigger: 'plan-edit', detectedAt: stored.detected_at });
      // The drawer reads the version as the editor left it, with the edit that made it.
      const shown = store.inspectTaskPlan(input);
      expect(shown.planVersion).toBe(2);
      expect(shown.steps[2]).toMatchObject({ id: 'assurance-sampling', removable: true, removed: true });
      expect(shown.boundary.adaptable[0]).toMatchObject({ id: 'safe-retry', removed: true });
      expect(shown.edit.lastEdit).toEqual({
        ordinal: 2,
        recordedAt: revision.detectedAt,
        entries: [
          { field: 'steps.assurance-sampling', label: '步骤 · 核对与抽检', prior: '要做', proposed: '不做', materiality: 'edited' },
          { field: 'adaptations.safe-retry', label: '可以自己调整 · 安全地再试一次', prior: '允许', proposed: '不允许', materiality: 'edited' },
        ],
      });

      // Nothing is recorded for an edit that changes nothing, one against the version the editor no longer reads, or
      // one that leaves out what the plan cannot.
      expect(await refusal(() => edit(store, bookId, taskIntentId, v2, BOTH))).toBe('ANALYSIS_PLAN_EDIT_UNCHANGED');
      expect(await refusal(() => edit(store, bookId, taskIntentId, v1, NO_PLAN_EDITS))).toBe('ANALYSIS_PLAN_EDIT_STALE');
      expect(await refusal(() => edit(store, bookId, taskIntentId, v2, { removedSteps: ['units'], disallowedAdaptations: [] }))).toBe('ANALYSIS_PLAN_EDIT_INVALID');
      expect(store.inspectBaselineAnalysis(bookId).planVersions).toHaveLength(2);

      // 恢复 is an edit as well: version 3 takes 核对与抽检 back and still withholds the retry; version 4 leaves it out again.
      const restored = edit(store, bookId, taskIntentId, v2, { removedSteps: [], disallowedAdaptations: ['safe-retry'] });
      expect(restored.planVersion).toMatchObject({ ordinal: 3, edits: { removedSteps: [], disallowedAdaptations: ['safe-retry'] } });
      expect(restored.planRevisions.at(-1)!.diff).toEqual([{ field: 'steps.assurance-sampling', label: '核对与抽检', prior: '不做', proposed: '要做', materiality: 'edited' }]);
      const v4 = edit(store, bookId, taskIntentId, restored.planEnvelope!.digest, BOTH);
      expect(v4.planVersions.map((version) => version.ordinal)).toEqual([1, 2, 3, 4]);

      // The Run binds version 4 and honours it: eight ranges and the reduction's turn, and no sample.
      const settled = await runToSettled(store, execution, bookId, v4.planEnvelope!.digest, taskIntentId);
      expect(settled.run?.state).toBe('completed');
      expect(settled.authorization?.planVersionOrdinal).toBe(4);
      const result = settled.resultSetRevision!;
      expect(result.usage.requests).toBe(SAMPLE1_UNITS + 1);
      expect(result.assuranceSample).toMatchObject({ state: 'not-run', reason: ASSURANCE_SAMPLING_REMOVED });
      expect(settled.taskOutcome!.report!.stages.find((stage) => stage.stage === 'assurance-sampling')?.state).toBe('not-run');
      // Once started, the plan takes no edit, and says why.
      expect(await refusal(() => edit(store, bookId, taskIntentId, v4.planEnvelope!.digest, NO_PLAN_EDITS))).toBe('ANALYSIS_PLAN_EDIT_STARTED');
      expect(store.inspectTaskPlan(input).edit).toMatchObject({ editable: false, reason: PLAN_EDIT_STARTED_REASON });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('makes no safe retry the editor did not allow, and the gap says so', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 不允许重试');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const edited = edit(store, bookId, taskIntentId, prepared.planEnvelope!.digest, { removedSteps: [], disallowedAdaptations: ['safe-retry'] });
      const settled = await runToSettled(store, execution, bookId, edited.planEnvelope!.digest, taskIntentId);
      // Unit 5's first attempt fails retry-safe, and no second attempt is made: one turn per range, no adaptation.
      expect(settled.run!.attempt!.spans.map((span) => [span.unitOrdinal, span.attemptIndex])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]);
      expect(settled.run!.adaptations).toEqual([]);
      const revision = settled.resultSetRevision!;
      expect(revision.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'gap', 'closed', 'closed', 'closed']);
      const withheld = revision.gaps.find((gap) => gap.unitOrdinal === 5)!;
      expect(withheld).toMatchObject({ code: 'adapter-failure' });
      expect(withheld.reason).toContain('PROVIDER_ERROR');
      expect(withheld.reason.endsWith(`；${SAFE_RETRY_WITHHELD}`)).toBe(true);
      expect(settled.taskOutcome!.report!.units.retried).toBe(0);
      expect(revision.provenance).toMatchObject({ planVersion: 2, adaptations: { count: 0, unitOrdinals: [] } });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('waits for 重新确认计划 when the key content changed, and the version it writes keeps what the editor left out', async () => {
    const store = await openWithRoute(happy);
    const execution = owner(store, happy);
    try {
      const bookId = await importedBook(store, 'L2 sample1 修改与计划修订');
      const first = prepare(store, bookId);
      const settled = await runToSettled(store, execution, bookId, first.planEnvelope!.digest, first.taskIntent!.taskIntentId);
      const options = settled.updateControls!.actions['reanalyze-range'].options;
      const rangeA = { startPosition: options[2]!.startPosition, endPosition: options[2]!.endPosition };
      const rangeB = { startPosition: options[7]!.startPosition, endPosition: options[7]!.endPosition };
      const range = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeA });
      const taskIntentId = range.taskIntent!.taskIntentId;
      const edited = edit(store, bookId, taskIntentId, range.planEnvelope!.digest, { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] });
      expect(edited.planVersion).toMatchObject({ ordinal: 2, edits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] } });
      // The key content changes: the plan takes no edit until 重新确认计划, and says why.
      const drifted = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB });
      expect(drifted.planRevision).toMatchObject({ trigger: 'prepare', state: 'pending' });
      expect(await refusal(() => edit(store, bookId, taskIntentId, edited.planEnvelope!.digest, NO_PLAN_EDITS))).toBe('ANALYSIS_PLAN_REVISION_PENDING');
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).edit).toEqual({ editable: false, reason: PLAN_EDIT_DRIFT_REASON, lastEdit: { ordinal: 2, recordedAt: edited.planRevisions.at(-1)!.detectedAt, entries: [{ field: 'steps.assurance-sampling', label: '步骤 · 核对与抽检', prior: '要做', proposed: '不做', materiality: 'edited' }] }, planEnvelopeDigest: null, budget: { ceiling: 'unset', settable: false, reason: PLAN_EDIT_DRIFT_REASON } });
      // The version 重新确认计划 writes answers the change and keeps the edit.
      const reconfirmed = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB }, true);
      expect(reconfirmed.planVersion).toMatchObject({ ordinal: 3, edits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] } });
      expect(reconfirmed.planVersion!.materialInputs.selectedRange).toEqual(rangeB);
      expect(reconfirmed.executionPlan?.editorEdits).toEqual({ removedSteps: ['assurance-sampling'], disallowedAdaptations: [] });
      expect(reconfirmed.planEnvelope?.boundary?.adaptable.map((entry) => entry.adaptationClass)).toEqual(['safe-retry']);
      // Version 3 was made by the reconfirmation, so it names no edit of its own; its items still read as left out.
      const shown = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(shown.edit).toEqual({ editable: true, reason: null, lastEdit: null, planEnvelopeDigest: reconfirmed.planEnvelope!.digest, budget: { ceiling: 'unset', settable: true, reason: null } });
      expect(shown.steps.find((step) => step.id === 'assurance-sampling')?.removed).toBe(true);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('edits a plan whose model connection changed its credential readiness since it froze, which is not key content', async () => {
    const store = await openWithRoute(happy);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 凭据状态变化');
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      const reference = recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const bookId = imported.bookId;
      const prepared = prepare(store, bookId);
      expect(prepared.providerResolutionPlan?.remoteBinding.credentialReadiness).toBe('missing');
      // The credential is ready after the plan froze: no Plan Revision waits, and the edit is written.
      store.setModelServiceCredentialState(reference, 'ready');
      expect(store.inspectBaselineAnalysis(bookId).planRevision).toBeNull();
      const edited = edit(store, bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest, BOTH);
      expect(edited.planVersion?.ordinal).toBe(2);
      // The version it writes keeps the readiness the edited version froze: only the execution plan and the envelope moved.
      expect(edited.providerResolutionPlan?.remoteBinding.credentialReadiness).toBe('missing');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('keeps an edited plan from becoming the quick-start default, which would start without its edits (TASK-022)', async () => {
    const store = await openWithRoute(happy);
    const execution = owner(store, happy);
    try {
      const bookId = await importedBook(store, 'L2 sample1 改过的计划不设默认');
      const first = prepare(store, bookId);
      await runToSettled(store, execution, bookId, first.planEnvelope!.digest, first.taskIntent!.taskIntentId);
      const whole = prepare(store, bookId, { mode: 'reanalyze-book', selectedRange: null });
      const taskIntentId = whole.taskIntent!.taskIntentId;
      const input = { bookId, kind: 'baseline-analysis' as const, ref: taskIntentId };
      // As the procedure proposed it, the plan can set the rule.
      expect(store.inspectTaskPlan(input).defaultRule).toMatchObject({ canSet: true, reason: null });
      // Edited, it cannot, and says why; nothing is set.
      const edited = edit(store, bookId, taskIntentId, whole.planEnvelope!.digest, BOTH);
      expect(store.inspectTaskPlan(input).defaultRule).toMatchObject({ canSet: false, reason: SET_RULE_EDITED, planEnvelopeDigest: null });
      expect(await refusal(() => store.setDefaultExecutionRule(bookId, taskIntentId, edited.planEnvelope!.digest))).toBe('DEFAULT_EXECUTION_RULE_UNAVAILABLE');
      expect(store.inspectDefaultExecutionRules().rules).toEqual([]);
      // A retry moved into 先问你 (Issue #422, S76d) is an edit as well: the rule would start without it.
      const asked = store.editBaselineAnalysisPlan({ bookId, taskIntentId, planEnvelopeDigest: edited.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] });
      expect(asked.planVersion?.edits).toMatchObject({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] });
      expect(store.inspectTaskPlan(input).defaultRule).toMatchObject({ canSet: false, reason: SET_RULE_EDITED });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('refuses an edit once the route this launch binds is no longer the one the plan froze', async () => {
    const first = await openWithRoute(happy);
    let bookId: string;
    let taskIntentId: string;
    let digest: string;
    try {
      bookId = await importedBook(first, 'L2 sample1 路由已变');
      const prepared = prepare(first, bookId);
      taskIntentId = prepared.taskIntent!.taskIntentId;
      digest = prepared.planEnvelope!.digest;
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    // The same store, launched with another fixture: a version written now would silently bind it, so none is.
    const second = await openWithRoute(transient);
    try {
      expect(await refusal(() => edit(second, bookId, taskIntentId, digest, BOTH))).toBe('ANALYSIS_PLAN_EDIT_STALE');
      expect(second.inspectBaselineAnalysis(bookId).planVersions).toHaveLength(1);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);
});
