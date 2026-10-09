import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import {
  DefaultExecutionRuleLedger,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_OFFLINE,
  QUICK_START_RULE_CHANGED,
  QUICK_START_SLOT_BUSY,
  SET_RULE_DEVELOPER_LIVE,
  quickStartNoRuleReason,
  ruleDriftReason,
  setRuleAlreadyReason,
} from '../../src/service/default-execution-rules.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { WRITING_LIVE_UNAVAILABLE, type LaunchPolicyProjection, type WritingProjection } from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_BOOK_TITLE, WRITING_FIXTURE_IDENTITY, WRITING_REQUEST } from '../support/writing-task.js';

// Service-integration suite (L2) for 快速开始 of a writing Task under a writing 默认执行规则 (Issue #432, plan slice S84b; S75's
// design, #421): the real store and ledger, the one execution owner and the AI7 local deterministic adapter over the authored
// fixture `sample1-writing-authored`, on exact `sample1` (ADR 0043). No Provider, socket or credential value is involved. A rule is
// set from a viewed writing plan; quick start records what 先看计划 + 开始任务 record with the rule named as the origin; anything
// that would make the start differ from the rule stops at the plan, recording nothing.

type Row = Record<string, SQLOutputValue>;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const LIVE_LAUNCH = {
  operationalScope: 'developer-live',
  live: {
    route: 'opencode-go',
    model: 'deepseek-v4-flash',
    endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
    credentialSlot: 'opencode-go',
    credentialReference: '00000000-0000-4000-8000-000000000000',
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
  },
} as const;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-writing-quick-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
});

afterEach(async () => {
  await roots.dispose();
});

interface Session {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
}

async function withSession(body: (session: Session) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    await body({ store, owner });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** What the service reads, as J-04's connectivity control makes it read: the deterministic route needs the network. */
function reader(state: { connectivity: Connectivity; busy: boolean }): TaskPlanConnectivity {
  return {
    reading: () => state.connectivity,
    reachesNetwork: (routeKind) => routeKind === LOCAL_DETERMINISTIC_ROUTE,
    slotBusy: () => state.busy,
  };
}

const ONLINE = (): { credentialReadiness: () => Promise<null>; connectivity: TaskPlanConnectivity } =>
  ({ credentialReadiness: async () => null, connectivity: reader({ connectivity: 'online', busy: false }) });

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
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

async function sample1Book(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

/** 先看计划 of one writing Task to its frozen plan. */
function prepare(store: EditorialStore, bookId: string): WritingProjection {
  let progress = store.createWritingPreparationWork(bookId, WRITING_REQUEST, launchPolicy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!;
}

/** 开始任务 from the bar, and the Run to its end. */
async function runFromBar(session: Session, bookId: string, prepared: WritingProjection): Promise<WritingProjection> {
  const authorized = session.store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(session.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await session.owner.whenIdle();
  return session.store.inspectWriting(bookId)!;
}

/** A Book whose first 宣传文章 was drafted from its plan, and the writing rule set from that settled plan. */
async function ruledBook(session: Session, title: string) {
  const { store } = session;
  const bookId = await sample1Book(store, title);
  const first = prepare(store, bookId);
  expect((await runFromBar(session, bookId, first)).state).toBe('settled');
  const rule = store.setDefaultExecutionRule(bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest);
  return { bookId, first, rule, reference: { ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: rule.ordinal, name: rule.name } };
}

describe('the writing 默认执行规则 (S84b; AUTH-009, TASK-019)', () => {
  it('is set from a viewed writing plan, binds what a baseline rule binds, and names the writing Task', async () => {
    await withSession(async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      // Before any rule the sheet names none, and says how one is set.
      expect(store.inspectWritingTask(bookId).quickStart).toEqual({ available: false, reason: quickStartNoRuleReason('writing'), rule: null });
      expect(quickStartNoRuleReason('writing')).toBe('这本书还没有「写作任务」的默认执行规则：先看计划，可以在完整计划里设为快速开始默认。');
      const plan = prepare(store, bookId);
      const taskIntentId = plan.taskIntent!.taskIntentId;
      const digest = plan.planEnvelope!.digest;
      // The page names the plan the Task froze: the exact plan 快速开始 starts.
      expect(store.inspectWritingTask(bookId).task?.planEnvelopeDigest).toBe(digest);
      const offered = store.inspectTaskPlan({ bookId, kind: 'writing', ref: taskIntentId }).defaultRule;
      const inputs = plan.planVersion!.materialInputs;
      expect(offered).toEqual({
        canSet: true, reason: null, planEnvelopeDigest: digest, current: null, startedBy: null,
        binds: [
          { label: '模型服务', value: `DeepSeek 开放平台 · ${inputs.providerBinding.modelId}（凭据引用 ${inputs.providerBinding.credentialReference}）` },
          { label: '工序', value: `写作任务 · ${inputs.artifactPin.identity} ${inputs.artifactPin.version}（方案修订 ${inputs.artifactPin.sidecarRevision}）` },
          { label: '预算上限', value: '未设置任务预算上限' },
          { label: '发送内容类别', value: '公开或合成材料' },
          { label: '会得到', value: inputs.expectedOutcome },
        ],
      });

      const rule = store.setDefaultExecutionRule(bookId, taskIntentId, digest);
      expect(rule).toMatchObject({
        bookId, bookTitle: WRITING_BOOK_TITLE, taskKind: 'writing', pattern: 'writing', ordinal: 1, name: '写作任务 · 第 1 版',
        state: 'active', stateLabel: '使用中', setBy: '本机编辑', sourceTaskIntentId: taskIntentId, sourcePlanEnvelopeDigest: digest,
        does: '在「交付物」的新建文档里点「快速开始」后，AI7 先准备计划：计划与这条规则一致时直接开始，按你在新建文档里选的类型、写的受众和渠道起草文档，范例只参照、不复制；有任何不同都停在计划上，等你看过再开始。',
      });
      expect(rule.binds).toEqual(offered.binds);
      expect(rule.binding).toEqual({
        providerBinding: inputs.providerBinding, artifactPin: inputs.artifactPin, runBudgetCeiling: inputs.runBudgetCeiling,
        outboundDataCategory: inputs.outboundDataCategory, expectedOutcome: inputs.expectedOutcome,
      });
      // The same plan set again is the same rule, with no new version; the plan says it set the rule in force.
      expect(store.setDefaultExecutionRule(bookId, taskIntentId, digest)).toEqual(rule);
      const shown = store.inspectTaskPlan({ bookId, kind: 'writing', ref: taskIntentId }).defaultRule;
      expect(shown).toMatchObject({ canSet: false, reason: setRuleAlreadyReason('写作任务 · 第 1 版'), planEnvelopeDigest: null,
        current: { ruleId: rule.ruleId, ordinal: 1, state: 'active', fromThisPlan: true } });
      expect(store.inspectDefaultExecutionRules().rules).toEqual([rule]);
      // A stale plan never sets one.
      expect(await refusal(() => store.setDefaultExecutionRule(bookId, taskIntentId, 'e'.repeat(64))))
        .toBe('DEFAULT_EXECUTION_RULE_STALE:这份计划已经变化；请重新打开计划后再设为快速开始默认。');
      // A prepared Task does not hold the Book — another preparation replaces it — so the sheet's quick start is on offer.
      expect(store.inspectWritingTask(bookId).quickStart).toEqual({
        available: true, reason: null, rule: { ruleId: rule.ruleId, ruleVersionId: rule.ruleVersionId, ordinal: 1, name: '写作任务 · 第 1 版' },
      });
      withDatabase(true, (database) => {
        expect(database.prepare('SELECT task_kind, task_pattern FROM default_execution_rules').all())
          .toEqual([{ task_kind: 'writing', task_pattern: 'writing' }]);
      });
    });
  }, 300_000);

  it('keeps one Book\'s writing rule apart from its baseline rules, and reads a pattern under another kind as damaged', async () => {
    await withSession(async ({ store }) => {
      const bookId = await sample1Book(store, '写作规则分开');
      const plan = prepare(store, bookId);
      const writing = store.setDefaultExecutionRule(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      const baseline = withDatabase(false, (database) => new DefaultExecutionRuleLedger(database).set({
        bookId, pattern: 'sync-current', sourceTaskIntentId: plan.taskIntent!.taskIntentId, sourcePlanEnvelopeDigest: 'd'.repeat(64),
        binding: writing.binding,
      }));
      expect(baseline).toMatchObject({ taskKind: 'baseline-analysis', pattern: 'sync-current' });
      expect(baseline.ruleId).not.toBe(writing.ruleId);
      const rules = store.inspectDefaultExecutionRules().rules;
      expect(rules.map((rule) => [rule.taskKind, rule.pattern, rule.name])).toEqual([
        ['writing', 'writing', '写作任务 · 第 1 版'], ['baseline-analysis', 'sync-current', '开始同步 · 第 1 版'],
      ]);
      expect(rules[1]!.binds.find((row) => row.label === '工序')!.value.startsWith('基线分析 · ')).toBe(true);
      expect(store.inspectWritingTask(bookId).quickStart.rule?.ruleId).toBe(writing.ruleId);
      // A writing pattern held under the baseline kind is not a row this ledger wrote.
      withDatabase(false, (database) => {
        database.exec('PRAGMA foreign_keys = OFF');
        database.exec('DROP TRIGGER default_execution_rules_no_update');
        database.prepare("UPDATE default_execution_rules SET task_kind = 'baseline-analysis' WHERE rule_id = ?").run(writing.ruleId);
        const ledger = new DefaultExecutionRuleLedger(database);
        expect(ledger.forPattern(bookId, 'writing')).toBeNull();
        expect(() => ledger.list()).toThrow('默认执行规则记录无效。');
      });
    });
  }, 300_000);
});

describe('快速开始 of a writing Task (S84b; TASK-017, TASK-020, TASK-026, TASK-028)', () => {
  it('starts the prepared Task exactly as 开始任务 would, naming the rule version, and runs it to its end', async () => {
    await withSession(async (session) => {
      const { store, owner } = session;
      const { bookId, rule, reference } = await ruledBook(session, WRITING_BOOK_TITLE);
      // The settled Task frees the Book: the sheet's quick start is on offer under the rule.
      expect(store.inspectWritingTask(bookId).quickStart).toEqual({ available: true, reason: null, rule: reference });

      const again = prepare(store, bookId);
      expect(again.taskIntent!.mode).toBe('writing-again');
      const taskIntentId = again.taskIntent!.taskIntentId;
      const digest = again.planEnvelope!.digest;
      expect(store.inspectWritingTask(bookId).task).toMatchObject({ taskIntentId, planEnvelopeDigest: digest, state: 'prepared' });
      const quick = await store.quickStartWritingTask(bookId, taskIntentId, digest, rule.ruleVersionId, ONLINE());
      expect(quick.outcome).toBe('started');
      expect(quick.reasons).toEqual([]);
      expect(quick.dispatchRunRecordId).not.toBeNull();
      expect(quick.ledger).not.toBeNull();
      const recorded = store.inspectWriting(bookId)!;
      expect(recorded.authorization).toMatchObject({ origin: 'default-execution-rule', ruleVersionId: rule.ruleVersionId, authority: 'standard-direct-dispatch', planEnvelopeDigest: digest });
      // While it runs the sheet's quick start waits for it.
      expect(store.inspectWritingTask(bookId).quickStart).toMatchObject({ available: false, rule: reference });
      expect(owner.admitOrQueue(quick.dispatchRunRecordId!, quick.ledger!)).toBe('admitted');
      await owner.whenIdle();
      const settled = store.inspectWriting(bookId)!;
      expect(settled.state).toBe('settled');
      expect(settled.run?.transitions[0]).toMatchObject({ state: 'authorized', detail: '快速开始按默认执行规则记录了运行授权。' });
      expect(settled.resultSetRevision?.writing.draft).not.toBeNull();
      // The drawer names the rule the Task was started under; a plan the rule did not come from may set its next version.
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: taskIntentId });
      expect(plan.defaultRule).toMatchObject({ startedBy: reference, canSet: true, current: { ruleId: rule.ruleId, state: 'active', fromThisPlan: false } });
      expect(plan.technical.find((row) => row.key === 'authorization')?.value).toContain('default-execution-rule');
      // A repeat of the same quick start answers as the first did, and dispatches nothing.
      expect(await store.quickStartWritingTask(bookId, taskIntentId, digest, rule.ruleVersionId, ONLINE()))
        .toEqual({ outcome: 'started', reasons: [], dispatchRunRecordId: null, ledger: null });
      // The record set is the one 开始任务 writes: one authorization and one Run per Task, the rule only named in it.
      withDatabase(true, (database) => {
        const origins = database.prepare('SELECT origin FROM analysis_run_authorizations ORDER BY rowid').all() as Row[];
        expect(origins.map((row) => row.origin)).toEqual(['standard-direct', 'default-execution-rule']);
        expect((database.prepare('SELECT count(*) total FROM default_execution_rule_versions').get() as { total: number }).total).toBe(1);
      });
      // The newest draft opens as before.
      const drafted = store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'promotion-article')!.drafted;
      expect(drafted?.revisionId).toBe(settled.resultSetRevision!.revisionId);
      expect(store.createWritingDraft(bookId, drafted!.revisionId).typeId).toBe('promotion-article');
    });
  }, 300_000);

  it('stops at the plan, recording nothing, when offline, when not connected, when the slot is busy, or when the rule changed or was turned off', async () => {
    await withSession(async (session) => {
      const { store } = session;
      const { bookId, rule, reference } = await ruledBook(session, '写作快速开始退回');
      const plan = prepare(store, bookId);
      const taskIntentId = plan.taskIntent!.taskIntentId;
      const digest = plan.planEnvelope!.digest;
      const state = { connectivity: 'offline' as Connectivity, busy: false };
      const runtime = { credentialReadiness: async () => null, connectivity: reader(state) };
      const fell = (reason: string) => ({ outcome: 'fell-back', reasons: [reason], dispatchRunRecordId: null, ledger: null });
      expect(await store.quickStartWritingTask(bookId, taskIntentId, digest, rule.ruleVersionId, runtime)).toEqual(fell(QUICK_START_OFFLINE));
      state.connectivity = 'online';
      state.busy = true;
      expect(await store.quickStartWritingTask(bookId, taskIntentId, digest, rule.ruleVersionId, runtime)).toEqual(fell(QUICK_START_SLOT_BUSY));
      state.busy = false;
      // A version the editor did not start under — a stale one — is never used.
      expect(await store.quickStartWritingTask(bookId, taskIntentId, digest, randomUUID(), runtime)).toEqual(fell(QUICK_START_RULE_CHANGED));
      // A plan that is not the Task's own is refused outright, as 开始任务 refuses it.
      expect(await refusal(() => store.quickStartWritingTask(bookId, taskIntentId, 'e'.repeat(64), rule.ruleVersionId, runtime)))
        .toBe('ANALYSIS_AUTHORIZATION_STALE:任务计划已经变化；无法记录该授权。');
      expect(await refusal(() => store.quickStartWritingTask(bookId, taskIntentId, digest, 'not-a-uuid', runtime)))
        .toBe('QUICK_START_INVALID:快速开始的参数无效。');
      // Turned off: the sheet says there is none in force, and a quick start made before stops at the plan.
      const off = store.deactivateDefaultExecutionRule(rule.ruleId);
      expect(off).toMatchObject({ state: 'deactivated', taskKind: 'writing' });
      expect(store.inspectWritingTask(bookId).quickStart).toEqual({ available: false, reason: quickStartNoRuleReason('writing'), rule: null });
      expect(await store.quickStartWritingTask(bookId, taskIntentId, digest, rule.ruleVersionId, runtime)).toEqual(fell(QUICK_START_RULE_CHANGED));
      // Nothing was recorded: the plan stands prepared, and the bar still starts it.
      const unchanged = store.inspectWriting(bookId)!;
      expect(unchanged.authorization).toBeNull();
      expect(unchanged.state).toBe('prepared');
      // Set again from the plan now on show: the rule's second version is in force.
      const second = store.setDefaultExecutionRule(bookId, taskIntentId, digest);
      expect(second).toMatchObject({ ruleId: rule.ruleId, ordinal: 2, name: '写作任务 · 第 2 版', state: 'active' });
      expect(reference.ordinal).toBe(1);
      // A Task started from its bar is never started by a quick start after it.
      await runFromBar(session, bookId, plan);
      expect(await refusal(() => store.quickStartWritingTask(bookId, taskIntentId, digest, second.ruleVersionId, runtime)))
        .toBe('ANALYSIS_AUTHORIZATION_STALE:这项任务已经开始了。');
    });
  }, 300_000);

  it('stops when what the rule binds differs from the Book now, naming what differs, on the sheet and at the start', async () => {
    await withSession(async (session) => {
      const { store } = session;
      const { bookId, first } = await ruledBook(session, '写作规则已变');
      // The rule's next version binds another credential reference, as a rule set under another connection would.
      const other = withDatabase(false, (database) => {
        const ledger = new DefaultExecutionRuleLedger(database);
        const current = ledger.activeFor(bookId, 'writing')!;
        return ledger.set({
          bookId, pattern: 'writing', sourceTaskIntentId: first.taskIntent!.taskIntentId, sourcePlanEnvelopeDigest: 'f'.repeat(64),
          binding: { ...current.version.binding, providerBinding: { ...current.version.binding.providerBinding, credentialReference: randomUUID() } },
        });
      });
      const reason = ruleDriftReason('写作任务 · 第 2 版', ['模型服务 · 连接']);
      expect(reason).toBe('默认执行规则「写作任务 · 第 2 版」定下的「模型服务 · 连接」已经变化，不能按规则直接开始；请看过计划后再开始，也可以把新的计划设为快速开始默认。');
      expect(store.inspectWritingTask(bookId).quickStart).toEqual({
        available: false, reason, rule: { ruleId: other.ruleId, ruleVersionId: other.version.ruleVersionId, ordinal: 2, name: '写作任务 · 第 2 版' },
      });
      const plan = prepare(store, bookId);
      expect(await store.quickStartWritingTask(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, other.version.ruleVersionId, ONLINE()))
        .toEqual({ outcome: 'fell-back', reasons: [reason], dispatchRunRecordId: null, ledger: null });
      expect(store.inspectWriting(bookId)!.authorization).toBeNull();
    });
  }, 300_000);

  it('never uses a rule under developer-live, and never sets one there', async () => {
    await withSession(async (session) => {
      const { store } = session;
      const { bookId, rule, reference } = await ruledBook(session, '写作开发者实时');
      const plan = prepare(store, bookId);
      const free = store.baselineAnalysisLedger.launch;
      store.baselineAnalysisLedger.bindLaunch(LIVE_LAUNCH);
      try {
        const page = store.inspectWritingTask(bookId);
        expect(page.unavailable).toBe(WRITING_LIVE_UNAVAILABLE);
        expect(page.quickStart).toEqual({ available: false, reason: QUICK_START_DEVELOPER_LIVE, rule: reference });
        expect(await store.quickStartWritingTask(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, rule.ruleVersionId,
          { credentialReadiness: async () => 'present', connectivity: reader({ connectivity: 'online', busy: false }) }))
          .toEqual({ outcome: 'fell-back', reasons: [QUICK_START_DEVELOPER_LIVE], dispatchRunRecordId: null, ledger: null });
        // Nor is a rule set there, from a plan frozen before: the drawer says why, and the service refuses.
        expect(store.inspectTaskPlan({ bookId, kind: 'writing', ref: plan.taskIntent!.taskIntentId }).defaultRule)
          .toMatchObject({ canSet: false, reason: SET_RULE_DEVELOPER_LIVE, planEnvelopeDigest: null });
        expect(await refusal(() => store.setDefaultExecutionRule(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest)))
          .toBe(`DEFAULT_EXECUTION_RULE_UNAVAILABLE:${SET_RULE_DEVELOPER_LIVE}`);
      } finally {
        store.baselineAnalysisLedger.bindLaunch(free);
      }
      expect(store.inspectDefaultExecutionRules().rules.map((entry) => entry.ordinal)).toEqual([1]);
    });
  }, 300_000);
});
