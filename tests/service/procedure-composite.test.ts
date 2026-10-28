import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { EditorialStore } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { IMPORTED_SKILL_RECOMMENDATION_EXCLUSION } from '../../src/service/procedure-recommendation.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { fullReviewProcedureDefinition } from '../../src/service/procedures/preinstalled.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { STYLE_AND_FORMAT } from '../support/review-categories.js';
import type { LaunchPolicyProjection, ProcedureDefinitionPin } from '../../src/shared/protocol.js';
import type { LocalCheckOptions } from '../../src/shared/protocol/procedures.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots;
let store: EditorialStore | undefined;
afterEach(async () => { store?.close(); store = undefined; await roots?.dispose(); });

const FULL_REVIEW = 'ai7-procedure/full-review';
const MEMBERS = ['local-text-check', 'typos-and-usage', 'style-and-format', 'plot-consistency', 'factual-review'];
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
const LOCAL: LocalCheckOptions = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false,
  excludedRanges: [], doubledEllipsisBlockIds: [], tables: { characters: true, variantWords: true, houseWordList: null, bookTerms: [] } };
const pinOf = ({ procedureId, version, digest }: ProcedureDefinitionPin): ProcedureDefinitionPin => ({ procedureId, version, digest });

async function open(prefix: string): Promise<EditorialStore> {
  roots = await createServiceTestRoots(prefix);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  return store;
}

async function book(target: EditorialStore, title: string): Promise<string> {
  const { bookId } = await importSample1Book(target, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(target, bookId);
  return bookId;
}

function fullReview(target: EditorialStore): ProcedureDefinitionPin {
  return pinOf(target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!);
}

function prepare(target: EditorialStore, bookId: string, policy: LaunchPolicyProjection, procedure: ProcedureDefinitionPin, categoryIds = MEMBERS) {
  let work = target.createReviewRunPreparationWork(bookId, categoryIds, WHOLE, policy, null, [], null, null, null, LOCAL, undefined, procedure);
  while (!work.done) work = target.advanceReviewRunPreparationWork(work.workId!);
  return work.projection!.run!;
}

/** Ordinary production with the claim-scoped factual stages bound, as 全文审校 needs; nothing here sends. */
async function ordinaryProduction(target: EditorialStore): Promise<LaunchPolicyProjection> {
  const connection = target.saveModelServiceConnection('合成普通连接', null, 'ready', 'opencode-go');
  const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!, credentialReference: connection.credentialReference };
  target.selectModelServiceRoute('opencode-go');
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
  const search = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
  target.saveSearchBackendCredential(search.id, target.getSearchBackendConnections().find((entry) => entry.backendId === search.id)?.credentialReference ?? null, 'ready');
  target.selectSearchBackend(search.id);
  const launch = { operationalScope: 'ordinary-production' as const, policy,
    live: { ...binding, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } };
  target.baselineAnalysisLedger.bindLaunch(launch);
  target.factualReviewLedger.bindLaunch(launch);
  return policy;
}

describe('composite procedures and 全文审校 (#1173)', () => {
  it('lists 全文审校 v1 last, edits it into a new version, chooses it on any Book and recommends it from the library', async () => {
    const target = await open('ai7-procedure-composite-library-');
    const [first, second] = [await book(target, '全文审校公开样书一'), await book(target, '全文审校公开样书二')];
    const listed = target.procedureLibrary({ action: 'inspect' }).procedures;
    expect(listed.at(-1)).toMatchObject({ procedureId: FULL_REVIEW, version: 1, executorKind: 'review-run', preInstalled: true, stopped: false, uses: 0 });
    const preinstalled = (await target.inspectKnowledgeProcedures()).preinstalled;
    expect([preinstalled.length, preinstalled.at(-1)!.procedureId, preinstalled.at(-1)!.state]).toEqual([17, FULL_REVIEW, 'enabled']);
    const original = listed.at(-1)!;
    const stages = original.document.stages.map((stage, index) => index === 1 ? { ...stage, exemptionRules: ['方言对白不算语病。'] } : stage);
    const edited = target.procedureLibrary({ action: 'save', input: { procedureId: FULL_REVIEW, basedOn: pinOf(original), title: original.document.title,
      editorInstruction: original.document.editorInstruction, stages } }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!;
    expect([edited.versions.map((version) => version.version), edited.executorKind, edited.document.members]).toEqual([[2, 1], 'review-run', original.document.members]);
    for (const bookId of [first, second]) target.procedureLibrary({ action: 'select', bookId, procedure: pinOf(edited) });
    const library = target.procedureLibrary({ action: 'recommend', input: { bookId: second, goal: '', taskKind: 'review-run', scope: 'whole', categoryIds: [] } });
    expect(library.procedures).toEqual(target.procedureLibrary({ action: 'inspect' }).procedures);
    expect(library.recommendation).toMatchObject({ status: 'clear', selectedVersionId: null, excludedSkillReason: IMPORTED_SKILL_RECOMMENDATION_EXCLUSION });
    expect(library.recommendation!.candidates).toMatchObject([{ procedureId: FULL_REVIEW, versionId: `${FULL_REVIEW}@2`, version: 2, kind: '预装工序', fit: 'all' }]);
    const typos = target.procedureLibrary({ action: 'recommend', input: { bookId: first, goal: '', taskKind: 'review-run', scope: 'whole', categoryIds: ['typos-and-usage'] } });
    expect(typos.recommendation!.candidates.map((candidate) => [candidate.procedureId, candidate.fit])).toContainEqual([FULL_REVIEW, 'all']);
    // The 新建审阅 sheet's reading is the Captured Procedures' alone, as before.
    expect(target.recommendProcedures({ bookId: first, goal: '审阅当前稿件', taskKind: 'review-run', scope: 'whole', categoryIds: [] }).status).toBe('none');
    target.markCleanShutdown();
  });

  it('refuses the composite by name, before anything is prepared, when a member cannot run on the Book', async () => {
    const target = await open('ai7-procedure-composite-refusal-');
    const bookId = await book(target, '全文审校不可运行的样书');
    recordMissingCredentialConnection(target, '全文审校测试连接');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const pin = fullReview(target);
    expect(() => prepare(target, bookId, policy, pin)).toThrow(/改选其他工序版本/);
    target.procedureLibrary({ action: 'select', bookId, procedure: pin });
    expect(() => prepare(target, bookId, policy, pin, [...MEMBERS].reverse())).toThrow(/全部成员，并按它的顺序/);
    // This launch binds no claim contract: 事实核查's 断言抽取 is named, and no Run, Task or plan is written.
    expect(() => prepare(target, bookId, policy, pin)).toThrow(/「事实核查」的「断言抽取」：尚未绑定断言契约/);
    expect(target.inspectReviewWorkspace(bookId, null).run).toBeNull();
    // A Run asking for 确定性检查 beside other categories without a composite is still refused.
    let work = () => target.createReviewRunPreparationWork(bookId, ['local-text-check', 'typos-and-usage'], WHOLE, policy, null, [], null, null, null, LOCAL);
    expect(work).toThrow(/单独运行/);
    work = () => target.createReviewRunPreparationWork(bookId, MEMBERS, WHOLE, policy, null, [], null, null, null, undefined, undefined, pin);
    expect(work).toThrow(/确定性检查|本地检查/);
    target.markCleanShutdown();
  });

  it('runs one approved Review Run whose members start in the declared order under their own versions', async () => {
    const target = await open('ai7-procedure-composite-run-');
    const policy = await ordinaryProduction(target);
    const bookId = await book(target, '全文审校公开样书');
    const pin = fullReview(target);
    target.procedureLibrary({ action: 'select', bookId, procedure: pin });
    const run = prepare(target, bookId, policy, pin);
    expect(run.categories.map((category) => category.categoryId)).toEqual(MEMBERS);
    expect(run.preinstalledProcedures!.map((entry) => entry.procedure.procedureId)).toEqual(['ai7-procedure/local-text-check', ...Array(4).fill(FULL_REVIEW)]);
    const plan = target.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId });
    expect([plan.goal.chips.procedure, plan.goal.sentence.startsWith('按工序《全文审校》第 1 版依次审阅全书')]).toEqual(['全文审校 第 1 版', true]);
    expect(plan.start.categoryDigests.map((entry) => entry.categoryId)).toEqual(MEMBERS);
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const envelopes = db.prepare(`SELECT json_extract(p.canonical_json, '$.procedure.procedureId') pinned, json_extract(e.canonical_json, '$.compositionOptions.procedure.procedureId') executor
        FROM procedure_plan_pins p JOIN analysis_plan_records e ON e.sha256 = p.plan_envelope_sha256 AND e.component = 'plan-envelope' ORDER BY p.rowid`).all();
      expect(envelopes).toEqual(['review-typos-and-usage', 'review-style-and-format', 'review-plot-consistency', 'factual-claim-check']
        .map((executor) => ({ pinned: FULL_REVIEW, executor: `ai7-procedure/${executor}` })));
    } finally { db.close(); }
    target.authorizeReviewRun(bookId, run.reviewRunId, plan.start.categoryDigests);
    const order: string[] = [];
    const driver = new ReviewRunDriver(target.reviewRunDriveSteps, {
      // A stand-in owner that sends nothing: each member's Run ends at once, so the next member's turn comes.
      admitAndDispatch: (runRecordId, ledger) => { order.push(ledger.definition.kind); ledger.recordRunState(runRecordId, 'failed', { detail: '合成测试未发送。', code: 'TEST_NOT_SENT' }); },
      whenPlaceFree: async () => undefined, whenDone: async () => undefined,
    });
    await driver.drive(run.reviewRunId); await driver.dispose();
    expect(order).toEqual(['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/plot-consistency', 'factual-review']);
    const settled = target.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(settled.categories.map((category) => category.state)).toEqual(['settled', 'failed', 'failed', 'failed', 'failed']);
    expect(target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!.uses).toBe(1);
    target.markCleanShutdown();
  });

  /** 全文审校 saved with 体例与格式's model stages marked 空闲时处理 (Issue #1200), chosen on the Book when one is named. */
  function deferStyle(target: EditorialStore, bookId: string | null, marks = ['chunked-review', 'cross-chapter-consistency']): ProcedureDefinitionPin {
    const original = target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!;
    const styleFrom = original.document.members!.slice(0, 2).reduce((offset, member) => offset + member.stageCount, 0);
    const stages = original.document.stages.map(({ deferred: _deferred, ...stage }, index) => index >= styleFrom && index < styleFrom + 4 && marks.includes(stage.stageType)
      ? { ...stage, deferred: true as const } : stage);
    const saved = target.procedureLibrary({ action: 'save', input: { procedureId: FULL_REVIEW, basedOn: pinOf(original), title: original.document.title,
      editorInstruction: original.document.editorInstruction, stages } }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!;
    if (bookId !== null) target.procedureLibrary({ action: 'select', bookId, procedure: pinOf(saved) });
    return pinOf(saved);
  }

  /** A stand-in owner that sends nothing: an immediate member ends at once, a member started idle waits until it is released. */
  function idleLaneOwner() {
    const order: string[] = [];
    const queued = new Map<string, () => void>();
    const owner = {
      admitAndDispatch: (runRecordId: string, ledger: BaselineAnalysisStore) => {
        order.push(`${ledger.definition.kind}@now`); ledger.recordRunState(runRecordId, 'failed', { detail: '合成测试未发送。', code: 'TEST_NOT_SENT' });
      },
      admitOrQueue: (_runRecordId: string, ledger: BaselineAnalysisStore) => { order.push(`${ledger.definition.kind}@idle`); },
      whenPlaceFree: async () => undefined,
      whenDone: (runRecordId: string) => order.at(-1)?.endsWith('@idle') === true ? new Promise<void>((resolve) => queued.set(runRecordId, resolve)) : Promise.resolve(),
    };
    return { order, queued, owner };
  }

  it('saves a member marked 空闲时处理 into a new composite version and refuses a partial, local or single-executor mark by name', async () => {
    const target = await open('ai7-procedure-deferred-save-');
    const pin = deferStyle(target, null);
    const saved = target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === FULL_REVIEW && entry.version === pin.version)!;
    expect(saved.document.stages.filter((stage) => stage.deferred === true).map((stage) => stage.stageType)).toEqual(['chunked-review', 'cross-chapter-consistency']);
    expect(() => deferStyle(target, null, ['chunked-review'])).toThrow(/的模型阶段须全部立即或全部空闲时处理/);
    const latest = target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === FULL_REVIEW)!;
    expect(() => target.procedureLibrary({ action: 'save', input: { procedureId: FULL_REVIEW, basedOn: pinOf(latest), title: latest.document.title,
      editorInstruction: latest.document.editorInstruction, stages: latest.document.stages.map((stage, index) => index === 0 ? { ...stage, deferred: true as const } : stage) } }))
      .toThrow(/只有调用模型的阶段可以设为空闲时处理/);
    const typos = target.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === 'ai7-procedure/review-typos-and-usage')!;
    expect(() => target.procedureLibrary({ action: 'save', input: { procedureId: typos.procedureId, basedOn: pinOf(typos), title: typos.document.title,
      editorInstruction: '', stages: typos.document.stages.map((stage) => ({ ...stage, deferred: true as const })) } })).toThrow(/只有组合工序的成员阶段/);
    // 全文审校 v1 itself carries no mark: its bytes, and every plan that pinned it, are unchanged.
    expect(fullReviewProcedureDefinition().stages.some((stage) => stage.deferred !== undefined)).toBe(false);
    target.markCleanShutdown();
  });

  it('starts a member marked 空闲时处理 after the others, on the idle lane, under the one approval, and the drawer says so', async () => {
    const target = await open('ai7-procedure-deferred-run-');
    const policy = await ordinaryProduction(target);
    const bookId = await book(target, '全文审校空闲成员样书');
    const run = prepare(target, bookId, policy, deferStyle(target, bookId));
    const plan = target.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId });
    expect(plan.steps.map((step) => step.label)).toContain('逐章审读：体例与格式（空闲时处理）');
    expect(run.categories.find((category) => category.categoryId === 'style-and-format')!.stateLabel).toBe('空闲时处理');
    target.authorizeReviewRun(bookId, run.reviewRunId, plan.start.categoryDigests);
    const lane = idleLaneOwner();
    const driver = new ReviewRunDriver(target.reviewRunDriveSteps, lane.owner);
    const loop = driver.drive(run.reviewRunId);
    await vi.waitFor(() => expect(lane.queued.size).toBe(1));
    expect(lane.order).toEqual(['editorial-review/typos-and-usage@now', 'editorial-review/plot-consistency@now', 'factual-review@now', 'editorial-review/style-and-format@idle']);
    expect(target.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId }).state).toEqual({ key: 'waiting', label: '等待空闲' });
    const waiting = target.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(waiting.categories.find((category) => category.categoryId === 'style-and-format')!.stateLabel).toBe('等待空闲');
    const [runRecordId, release] = [...lane.queued][0]!;
    target.reviewRunDriveSteps.refuseDispatch(run.reviewRunId, 'style-and-format', runRecordId, 'TEST_NOT_SENT', '合成测试未发送。');
    release();
    await loop;
    await driver.dispose();
    expect(target.inspectReviewWorkspace(bookId, run.reviewRunId).run!.categories.map((category) => category.state)).toEqual(['settled', 'failed', 'failed', 'failed', 'failed']);
    target.markCleanShutdown();
  });

  it('cancels a member waiting on the idle lane as a waiting Run: nothing of it is dispatched', async () => {
    const target = await open('ai7-procedure-deferred-cancel-');
    const policy = await ordinaryProduction(target);
    const bookId = await book(target, '全文审校取消空闲成员样书');
    const run = prepare(target, bookId, policy, deferStyle(target, bookId));
    target.authorizeReviewRun(bookId, run.reviewRunId, target.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId }).start.categoryDigests);
    const lane = idleLaneOwner();
    const driver = new ReviewRunDriver(target.reviewRunDriveSteps, lane.owner);
    const loop = driver.drive(run.reviewRunId);
    await vi.waitFor(() => expect(lane.queued.size).toBe(1));
    const [runRecordId, release] = [...lane.queued][0]!;
    // The owner lets the queued Run go on this answer; that is what ends the Review Run's wait.
    expect(target.cancelWaitingTask({ bookId, kind: 'review-run', ref: run.reviewRunId })).toEqual({ dequeue: runRecordId });
    release();
    await loop;
    await driver.dispose();
    expect(target.reviewCategoryLedger(reviewCategoryKindDefinition(STYLE_AND_FORMAT, 2)).currentRunState(runRecordId)).toBe('cancelled');
    expect(lane.order.filter((entry) => entry.startsWith('editorial-review/style-and-format'))).toEqual(['editorial-review/style-and-format@idle']);
    expect(target.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId }).state.key).not.toBe('waiting');
    target.markCleanShutdown();
  });
});
