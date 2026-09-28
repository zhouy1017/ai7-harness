import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { EXECUTION_SLOT_BUSY_REASON } from '../../src/service/analysis/execution-error.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { validateTaskAuthorizationSchema } from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  J03_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisUpdateRequest,
  type LaunchPolicyProjection,
  type ReviewRunScopeRequest,
  type TaskPlanKind,
  type TaskPlanProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the Task Drawer's plan projection (Issue #418, plan slice S72): the
// real store over exact `sample1` (ADR 0043), the three Task kinds that hold a plan today, and the AI7
// local deterministic adapter where a Run has to settle first. The projection is a read, so every case
// also proves it digest-neutral: every row of every relation reads byte for byte the same after it, and
// J-03's own startup validation still accepts the ledger. #288's visible half is the range case: the
// chips name the current plan version's range, while the Task Intent row keeps the one first asked for.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const EDIT_SUFFIX = '，S72 准备任务前的确认编辑';
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-task-plan-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  expect(launchPolicy.operationalScope).toBe('development-ci');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(route: ResolvedModelFixture | null): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: route === null ? null : { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

async function importBook(store: EditorialStore, title: string): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  await requireExactSample1(roots.codeRoot);
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported;
}

/** One acknowledged edit at the end of the first block, so preparing next saves a revision for it (TASK-039). */
function acknowledgeEdit(store: EditorialStore, manuscriptId: string, branchId: string): void {
  const window = store.getManuscriptWindow(manuscriptId, branchId, null);
  const block = window.blocks[0]!;
  const graphemes = store.baselineAnalysisLedger.readWorkingBlocks(branchId).find((entry) => entry.blockId === block.blockId)!.graphemes;
  store.flushJournalEdit({
    clientEditId: randomUUID(),
    manuscriptId,
    branchId,
    baseRevisionId: window.revisionId,
    blockId: block.blockId,
    windowStartBlockId: block.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence,
    fromGrapheme: graphemes,
    toGrapheme: graphemes,
    insertText: EDIT_SUFFIX,
  });
}

function plan(store: EditorialStore, bookId: string, kind: TaskPlanKind, ref: string | null = null): TaskPlanProjection {
  return store.inspectTaskPlan({ bookId, kind, ref });
}

/**
 * The plan as the authorization bar reads it (Issue #420, S74a A3), with a credential reader that counts
 * how often it was asked: a plan whose route sends nothing must never ask at all.
 */
async function barPlan(store: EditorialStore, bookId: string, kind: TaskPlanKind, ref: string | null, credential: 'present' | 'missing' | null): Promise<{ plan: TaskPlanProjection; asked: number }> {
  let asked = 0;
  const read = await store.inspectTaskPlanWithConnection({ bookId, kind, ref }, async () => {
    asked += 1;
    return credential;
  });
  return { plan: read, asked };
}

function storeCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/**
 * Every row of every relation of the Book database as one digest per relation: what a digest-neutral read
 * must leave exactly as it found it.
 */
function relationDigests(): Record<string, string> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map((row) => row.name);
    // Some relations are `WITHOUT ROWID`, so the rows are compared as a sorted set of their exact values.
    return Object.fromEntries(tables.map((table) => {
      const rows = database.prepare(`SELECT * FROM "${table}"`).all()
        .map((row) => JSON.stringify(row, (_key, value: unknown) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value))
        .sort();
      return [table, createHash('sha256').update(rows.join('\n')).digest('hex')] as const;
    }));
  } finally {
    database.close();
  }
}

/** J-03's own startup check over the stored ledger: every row still validates byte for byte. */
function validateLedger(): void {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    validateTaskAuthorizationSchema(database);
  } finally {
    database.close();
  }
}

/** The graphemes of a block range of one revision, summed straight from the stored block versions. */
function revisionGraphemes(revisionId: string, range: BaselineAnalysisSelectedRange | null): number {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = database.prepare(
      `SELECT sum(grapheme_length) total FROM manuscript_block_versions
       WHERE revision_id = ? AND (? IS NULL OR position BETWEEN ? AND ?)`,
    ).get(revisionId, range === null ? null : 1, range?.startPosition ?? null, range?.endPosition ?? null) as { total: number };
    return row.total;
  } finally {
    database.close();
  }
}

function technical(projection: TaskPlanProjection, key: string): string | undefined {
  return projection.technical.find((row) => row.key === key)?.value;
}

describe('the Task Drawer plan projection over the real store on exact sample1', () => {
  it('reads J-03\'s fixed task in the editor\'s words without moving one stored byte', async () => {
    const store = await openWithRoute(null);
    try {
      const imported = await importBook(store, 'L2 sample1 任务计划');
      const { bookId } = imported;
      // Nothing is prepared yet, so there is no plan to show; the Book and the request are checked first.
      expect(storeCode(() => plan(store, bookId, 'fixed-task'))).toBe('TASK_PLAN_UNAVAILABLE');
      expect(storeCode(() => plan(store, randomUUID(), 'fixed-task'))).toBe('TASK_PLAN_BOOK_NOT_FOUND');
      expect(storeCode(() => plan(store, bookId, 'review-run'))).toBe('TASK_PLAN_INVALID');
      expect(storeCode(() => store.inspectTaskPlan({ bookId, kind: 'writing' as TaskPlanKind, ref: null }))).toBe('TASK_PLAN_INVALID');

      acknowledgeEdit(store, imported.manuscriptId, imported.branchId);
      let progress = store.createTaskAuthorizationPreparationWork(bookId, J03_TASK_GOAL, launchPolicy);
      while (!progress.done) progress = store.advanceTaskAuthorizationPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      expect(prepared.checkpoint?.createdForDirtyJournal).toBe(true);

      const before = relationDigests();
      const drawer = plan(store, bookId, 'fixed-task');
      expect(plan(store, bookId, 'fixed-task', prepared.taskIntent!.taskIntentId)).toEqual(drawer);
      expect(relationDigests()).toEqual(before);
      validateLedger();

      expect(drawer).toMatchObject({
        bookId,
        kind: 'fixed-task',
        ref: prepared.taskIntent!.taskIntentId,
        state: { key: 'ready', label: '尚未开始' },
        planVersion: null,
        goal: {
          sentence: J03_TASK_GOAL,
          chips: {
            book: 'L2 sample1 任务计划',
            position: '全书',
            selectedGraphemes: revisionGraphemes(prepared.checkpoint!.revisionId, null),
            taskInputRevision: prepared.checkpoint!.revisionLabel,
            procedure: '固定任务',
          },
          savedForEdits: true,
        },
        participation: { during: '预计无需中途参与', after: null },
        drift: null,
      });
      // D7: the two steps this Task really takes, each with what it leaves behind.
      expect(drawer.steps).toEqual([
        { id: 'task-input', label: '准备任务输入', result: `任务输入修订版 ${prepared.checkpoint!.revisionLabel}`, removable: false, removed: false },
        { id: 'record-run', label: '记录运行（不派发）', result: '运行记录', removable: false, removed: false },
      ]);
      // A Task that keeps no plan versions takes no edit (Issue #419).
      expect(drawer.edit).toEqual({ editable: false, reason: null, lastEdit: null, planEnvelopeDigest: null, budget: null });
      expect(drawer.scope.reference).toEqual([]);
      expect(drawer.scope.send).toBe('不发送任何内容');
      expect(drawer.scope.notRead).toContain('仅作血缘证据，不属于可读范围');
      // LAYER-002, MODEL-013/014: the decision, the ceiling state and the account limit stay stated.
      expect(drawer.service).toMatchObject({
        role: '主编辑角色',
        send: '本环境不连接模型服务，不会发送任何内容',
        usageIsCeiling: false,
        duration: '暂无可靠估计',
        budgetCeiling: '未设置任务预算上限',
        accountLimit: '未知 · 提供方未返回',
      });
      expect(drawer.service.decision).toContain('远程模型服务被拒绝');
      for (const text of [drawer.service.budgetCeiling, drawer.service.accountLimit, drawer.service.usage]) {
        expect(text).not.toMatch(/^0$|免费|无限/u);
      }
      // §10: the engineer's non-effects move to the technical layer whole; the editor's list is new words.
      expect(drawer.notDo.technical).toEqual([...prepared.namedNonEffects]);
      expect(drawer.notDo.editorial).toContain('不会直接修改稿件');
      expect(drawer.boundary.adaptable).toEqual([]);
      expect(drawer.boundary.askFirst).toHaveLength(3);
      // Every exact identity is still there, one step below.
      expect(technical(drawer, 'plan-envelope')).toBe(prepared.planEnvelope!.digest);
      expect(technical(drawer, 'credential-reference')).toBe(prepared.providerResolutionPlan!.credentialReference);
      expect(technical(drawer, 'provider-processing')).toBe('development-ci · v1 · 拒绝 · 0 次实时传输');
      expect(technical(drawer, 'native-artifact')).toContain(prepared.artifactPin!.nativeCarrierSha256);
      expect(technical(drawer, 'readable-scope')).toContain(bookId);
      expect(technical(drawer, 'execution-steps')).toBe('分析结构 → 分析叙事连贯性 → 形成编辑复核重点');

      // Issue #420 (S74a): the bar records this Task only (ADR 0055), binding the exact envelope the plan
      // names. Its route sends nothing, so the credential this Book holds — `missing` — is never asked for.
      expect(drawer.start).toEqual({ readiness: 'record-only', needsModelConnection: false, planEnvelopeDigest: prepared.planEnvelope!.digest, categoryDigests: [], reconfirm: null });
      const unasked = await barPlan(store, bookId, 'fixed-task', null, 'missing');
      expect(unasked).toEqual({ plan: drawer, asked: 0 });
      expect(relationDigests()).toEqual(before);

      const authorized = store.authorizeTaskAuthorization(bookId, prepared.taskIntent!.taskIntentId, drawer.start.planEnvelopeDigest!);
      const afterAuthorization = relationDigests();
      const recorded = plan(store, bookId, 'fixed-task');
      expect(relationDigests()).toEqual(afterAuthorization);
      expect(recorded.state).toEqual({ key: 'recorded', label: '已记录 · 未派发' });
      expect(recorded.start).toEqual({ readiness: 'started', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null });
      expect(technical(recorded, 'run-record')).toContain(authorized.runRecord!.runRecordId);
      // A ref that is not the Book's current Task is refused rather than read as another Task's plan.
      expect(storeCode(() => plan(store, bookId, 'fixed-task', randomUUID()))).toBe('TASK_PLAN_NOT_CURRENT');
    } finally {
      store.close();
    }
    validateLedger();
  }, 180_000);

  it('names the current plan version\'s range after 重新确认计划 while the Task Intent keeps the first (#288)', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    const store = await openWithRoute(fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    const prepare = (bookId: string, update: BaselineAnalysisUpdateRequest | null, reconfirm = false): BaselineAnalysisProjection => {
      const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
      let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy, reconfirm);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      return progress.projection!;
    };
    try {
      const { bookId } = await importBook(store, 'L2 sample1 计划范围');
      const first = prepare(bookId, null);
      const firstPlan = plan(store, bookId, 'baseline-analysis');
      expect(firstPlan).toMatchObject({
        kind: 'baseline-analysis',
        ref: first.taskIntent!.taskIntentId,
        state: { key: 'ready', label: '尚未开始' },
        planVersion: 1,
        goal: { chips: { position: '全书', selectedGraphemes: revisionGraphemes(first.checkpoint!.revisionId, null), procedure: '基线分析' }, savedForEdits: false },
      });
      expect(firstPlan.steps.map((step) => step.label)).toEqual(['逐章读取', '汇总全书', '核对与抽检']);
      expect(firstPlan.steps.map((step) => step.result)).toEqual(['各章摘要', '梗概与人物、事件、关系、设定', '可信程度说明']);
      expect(firstPlan.boundary.adaptable).toEqual([{ id: 'safe-retry', label: '模型服务暂时出错时，同一个阅读范围安全地再试一次', removable: true, removed: false, movable: true, askFirst: false }]);
      // Issue #419: of the three steps only 核对与抽检 can be left out, and the prepared plan takes edits.
      expect(firstPlan.steps.map((step) => [step.id, step.removable, step.removed])).toEqual([['units', false, false], ['reduction', false, false], ['assurance-sampling', true, false]]);
      expect(firstPlan.edit).toEqual({ editable: true, reason: null, lastEdit: null, planEnvelopeDigest: first.planEnvelope!.digest, budget: { ceiling: 'unset', settable: true, reason: null } });
      expect(technical(firstPlan, 'coverage-manifest')).toContain(first.coverageManifest!.digest);
      expect(technical(firstPlan, 'execution-route')).toContain(fixture.identity);
      expect(technical(firstPlan, 'material-fields')?.split('、')).toHaveLength(15);

      // Issue #420 (S74a): the deterministic route sends nothing, so this plan starts without a credential
      // — the Book's is `missing` — and the bar binds the exact envelope version 1 froze.
      expect(firstPlan.start).toEqual({ readiness: 'ready', needsModelConnection: false, planEnvelopeDigest: first.planEnvelope!.digest, categoryDigests: [], reconfirm: null });
      expect(await barPlan(store, bookId, 'baseline-analysis', null, 'missing')).toEqual({ plan: firstPlan, asked: 0 });
      expect(owner.busy).toBe(false);
      // The instance's governor (Issue #49, S14; CONC-007): the start is recorded, and until the owner admits it the Run
      // waits for a place — 等待运行名额, with 取消 — whatever else runs; nothing refuses it for a busy instance.
      const authorized = store.authorizeBaselineAnalysis(bookId, first.taskIntent!.taskIntentId, firstPlan.start.planEnvelopeDigest!);
      expect(authorized.projection.state).toBe('queued');
      expect(plan(store, bookId, 'baseline-analysis').state).toEqual({ key: 'queued', label: '等待运行名额' });
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      // The same start again is its own authorization, answered as it always was.
      expect(store.authorizeBaselineAnalysis(bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest).dispatchRunRecordId).toBeNull();
      await owner.whenIdle();
      expect(owner.busy).toBe(false);
      // A development-ci owner holds no credential of a route that sends: it reads none.
      expect(await owner.liveCredentialReadiness()).toBeNull();
      const settled = store.inspectBaselineAnalysis(bookId);
      expect(settled.state).toBe('settled');
      const settledPlan = plan(store, bookId, 'baseline-analysis');
      expect(settledPlan.state).toEqual({ key: 'settled', label: '已完成' });
      expect(settledPlan.start).toEqual({ readiness: 'started', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null });

      const options = settled.updateControls!.actions['reanalyze-range'].options;
      const rangeA = { startPosition: options[2]!.startPosition, endPosition: options[2]!.endPosition };
      const rangeB = { startPosition: options[7]!.startPosition, endPosition: options[7]!.endPosition };
      const preparedA = prepare(bookId, { mode: 'reanalyze-range', selectedRange: rangeA });
      const revisionId = preparedA.checkpoint!.revisionId;
      const planA = plan(store, bookId, 'baseline-analysis');
      expect(planA.goal.chips.position).toBe(`第 ${rangeA.startPosition}–${rangeA.endPosition} 段`);
      expect(planA.goal.chips.selectedGraphemes).toBe(revisionGraphemes(revisionId, rangeA));
      expect(planA.scope.reference).toEqual(['上一份基线分析（第 1 份，读的是 r1）']);
      expect(technical(planA, 'selected-range')).toBe(`内容块 ${rangeA.startPosition}–${rangeA.endPosition}`);
      // The reuse plan unit by unit, and where each unit of the predecessor goes, as the plan records them.
      const reusePlan = preparedA.update!.reusePlan!;
      expect(technical(planA, 'reuse-plan')).toBe(`${preparedA.update!.reusePlanDigest} · ${reusePlan.units.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}（${unit.reason}）`).join('；')}`);
      expect(technical(planA, 'reuse-plan-predecessors')).toBe(reusePlan.predecessorUnits.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}`).join('；'));
      expect(reusePlan.predecessorUnits.some((unit) => unit.disposition === 'bypassed')).toBe(true);

      // The range moves on the prepared Task: the plan's key content changed, and the chips keep naming
      // version 1's range until the change is reconfirmed. The diff reads in the drawer's words, by key.
      prepare(bookId, { mode: 'reanalyze-range', selectedRange: rangeB });
      const beforeDrift = relationDigests();
      const drifted = plan(store, bookId, 'baseline-analysis');
      expect(relationDigests()).toEqual(beforeDrift);
      expect(drifted.state).toEqual({ key: 'changed', label: '计划已变化' });
      expect(drifted.goal.chips.position).toBe(`第 ${rangeA.startPosition}–${rangeA.endPosition} 段`);
      expect(drifted.drift?.entries).toEqual([
        {
          field: 'selectedRange',
          label: '处理范围',
          prior: `第 ${rangeA.startPosition}–${rangeA.endPosition} 段 · ${revisionGraphemes(revisionId, rangeA).toLocaleString('en-US')} 字`,
          proposed: `第 ${rangeB.startPosition}–${rangeB.endPosition} 段 · ${revisionGraphemes(revisionId, rangeB).toLocaleString('en-US')} 字`,
          materiality: 'material',
        },
        { field: 'reusePlan.counts', label: '重新分析与沿用的阅读范围', prior: '重新分析 3 个，沿用 5 个', proposed: '重新分析 2 个，沿用 6 个', materiality: 'derived' },
      ]);
      // S74a A4: 重新确认计划 is the drawer's own action now, so the resolution no longer points at ②A.
      expect(drifted.drift?.resolution).toBe('重新确认计划后，新的计划版本才能开始。');
      // AUTH-006: the changed plan offers no start and binds nothing; the bar carries the exact preparation
      // 重新确认计划 sends — the same Task Intent's goal and mode, and the range the revision proposes.
      expect(drifted.start).toEqual({
        readiness: 'changed',
        needsModelConnection: false,
        planEnvelopeDigest: null,
        categoryDigests: [],
        reconfirm: { goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], update: { mode: 'reanalyze-range', selectedRange: rangeB } },
      });

      const reconfirmRequest = drifted.start.reconfirm!;
      expect(reconfirmRequest.goal).toBe(preparedA.taskIntent!.goal);
      const reconfirmed = prepare(bookId, reconfirmRequest.update, true);
      expect(reconfirmed.planVersion?.ordinal).toBe(2);
      const planB = plan(store, bookId, 'baseline-analysis');
      expect(planB.planVersion).toBe(2);
      expect(planB.drift).toBeNull();
      expect(planB.state.key).toBe('ready');
      expect(planB.start).toEqual({ readiness: 'ready', needsModelConnection: false, planEnvelopeDigest: reconfirmed.planEnvelope!.digest, categoryDigests: [], reconfirm: null });
      expect(planB.start.planEnvelopeDigest).not.toBe(preparedA.planEnvelope!.digest);
      expect(planB.goal.chips.position).toBe(`第 ${rangeB.startPosition}–${rangeB.endPosition} 段`);
      expect(planB.goal.chips.selectedGraphemes).toBe(revisionGraphemes(revisionId, rangeB));
      expect(technical(planB, 'selected-range')).toBe(`内容块 ${rangeB.startPosition}–${rangeB.endPosition}`);
      // Every surface that names the range names the current one: ②A's update projection agrees.
      expect(store.inspectBaselineAnalysis(bookId).update?.selectedRange).toEqual(rangeB);
      // The Task Intent row keeps the range first asked for; the drawer read through to the plan version.
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const intent = database.prepare('SELECT selected_start_position start, selected_end_position end FROM analysis_task_intents WHERE task_intent_id = ?')
          .get(reconfirmed.taskIntent!.taskIntentId) as { start: number; end: number };
        expect(intent).toEqual({ start: rangeA.startPosition, end: rangeA.endPosition });
      } finally {
        database.close();
      }
    } finally {
      await owner.dispose();
      store.close();
    }
    validateLedger();
  }, 300_000);

  it('reads a Review Run\'s plan per category and reports the newer Run that supersedes it', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
    const store = await openWithRoute(fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    const prepareRun = (bookId: string, categoryIds: ReadonlyArray<string>): string => {
      let progress = store.createReviewRunPreparationWork(bookId, categoryIds, WHOLE, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      return progress.projection!.run!.reviewRunId;
    };
    try {
      const { bookId } = await importBook(store, 'L2 sample1 审阅计划');
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const baseline = progress.projection!;
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, baseline.taskIntent!.taskIntentId, baseline.planEnvelope!.digest).dispatchRunRecordId!);
      await owner.whenIdle();

      const firstRunId = prepareRun(bookId, [TYPOS_AND_USAGE.categoryId, 'plot-consistency']);
      const before = relationDigests();
      const drawer = plan(store, bookId, 'review-run', firstRunId);
      expect(relationDigests()).toEqual(before);
      expect(drawer).toMatchObject({
        kind: 'review-run',
        ref: firstRunId,
        state: { key: 'ready', label: '尚未开始' },
        planVersion: null,
        goal: {
          sentence: `按 2 类审阅全书：${TYPOS_AND_USAGE.label}、情节逻辑与前后一致`,
          chips: { position: '全书', selectedGraphemes: revisionGraphemes(store.inspectReviewWorkspace(bookId, firstRunId).run!.manuscript.revisionId, null) },
        },
        drift: null,
      });
      expect(drawer.steps).toEqual([
        { id: `category:${TYPOS_AND_USAGE.categoryId}`, label: `逐章审读：${TYPOS_AND_USAGE.label}`, result: `${TYPOS_AND_USAGE.label}的发现（稿件上的标记）`, removable: false, removed: false },
        { id: 'category:plot-consistency', label: '读取基线分析的线索：情节逻辑与前后一致', result: '情节逻辑与前后一致的发现（稿件上的标记）', removable: false, removed: false },
        { id: 'report', label: '汇总', result: '审阅报告', removable: false, removed: false },
      ]);
      // A Review Run keeps no plan versions: its plan takes no edit here (Issue #419).
      expect(drawer.edit).toEqual({ editable: false, reason: null, lastEdit: null, planEnvelopeDigest: null, budget: null });
      expect(drawer.participation.after).toContain('每一类完成后');
      expect(technical(drawer, `category:${TYPOS_AND_USAGE.categoryId}`)).toMatch(/计划权限边界 [0-9a-f]{64}/u);
      expect(technical(drawer, 'category:plot-consistency')).toContain('没有任务');

      // Issue #420 (S74a): the Run's one approval binds the exact digest of every Task-backed category — the
      // leads have no Task and bind none — and its deterministic route needs no credential.
      const typosDigest = store.inspectReviewWorkspace(bookId, firstRunId).run!.categories.find((category) => category.categoryId === TYPOS_AND_USAGE.categoryId)!.planEnvelopeDigest!;
      expect(drawer.start).toEqual({
        readiness: 'ready',
        needsModelConnection: false,
        planEnvelopeDigest: null,
        categoryDigests: [{ categoryId: TYPOS_AND_USAGE.categoryId, planEnvelopeDigest: typosDigest }],
        reconfirm: null,
      });
      expect(await barPlan(store, bookId, 'review-run', firstRunId, 'missing')).toEqual({ plan: drawer, asked: 0 });
      // One slot, no queue (S74a A2): while a Run holds the slot the approval is refused before it is written.
      const beforeBusy = relationDigests();
      let busy: unknown = null;
      try {
        store.authorizeReviewRun(bookId, firstRunId, drawer.start.categoryDigests, true);
      } catch (error) {
        busy = error;
      }
      expect(busy).toMatchObject({ code: 'EXECUTION_BUSY', message: EXECUTION_SLOT_BUSY_REASON });
      expect(relationDigests()).toEqual(beforeBusy);
      expect(plan(store, bookId, 'review-run', firstRunId).start.readiness).toBe('ready');

      // A second preparation supersedes the first before it was approved: the first Run's plan says why
      // its approval would now be refused, in the refusal's own words, and asks for nothing else.
      const secondRunId = prepareRun(bookId, [TYPOS_AND_USAGE.categoryId]);
      const superseded = plan(store, bookId, 'review-run', firstRunId);
      expect(superseded.state).toEqual({ key: 'changed', label: '计划已变化' });
      expect(superseded.drift?.reasons).toEqual(['这次审阅的计划已被之后准备的一次取代；请授权最新的一次。']);
      expect(superseded.drift?.entries).toEqual([]);
      expect(superseded.start).toEqual({ readiness: 'changed', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null });

      // The latest Run's bar binds its own digests; once approved, the same region is the Run's state.
      const second = plan(store, bookId, 'review-run', secondRunId);
      expect(second.start.readiness).toBe('ready');
      store.authorizeReviewRun(bookId, secondRunId, second.start.categoryDigests);
      expect(plan(store, bookId, 'review-run', secondRunId).start).toEqual({ readiness: 'started', needsModelConnection: false, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null });
      // A repeat of the approval already recorded answers as it always has, whatever the slot.
      expect(() => store.authorizeReviewRun(bookId, secondRunId, second.start.categoryDigests, true)).not.toThrow();
    } finally {
      await owner.dispose();
      store.close();
    }
    validateLedger();
  }, 300_000);

  it('records a plan with no executable route without taking the slot, blocked before dispatch (Issue #420, S74a)', async () => {
    const store = await openWithRoute(null);
    try {
      const { bookId } = await importBook(store, 'L2 sample1 无路由');
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const drawer = plan(store, bookId, 'baseline-analysis');
      // No local route is bound and the remote one is denied: the bar says the start only records.
      expect(drawer.start).toEqual({ readiness: 'no-route', needsModelConnection: false, planEnvelopeDigest: prepared.planEnvelope!.digest, categoryDigests: [], reconfirm: null });
      // Such a Run never waits on the governor: it is recorded blocked before dispatch.
      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, drawer.start.planEnvelopeDigest!);
      expect(authorized.dispatchRunRecordId).toBeNull();
      expect(authorized.projection.state).toBe('authorized-blocked');
      const recorded = plan(store, bookId, 'baseline-analysis');
      expect(recorded.state).toEqual({ key: 'blocked', label: '派发前已阻止' });
      expect(recorded.start.readiness).toBe('started');
    } finally {
      store.close();
    }
    validateLedger();
  }, 180_000);
});
