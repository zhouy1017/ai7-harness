import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { parseReviewCategoryUnitMessageHeader, parseReviewCrossChapterMessage, REVIEW_CROSS_CHAPTER_RESULT_SCHEMA } from '../../src/service/review/review-category-contract.js';
import { ruleFor, withRuleFor } from '../support/policy-rules.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE, REVIEW_MATERIAL_CATEGORY_REQUIRED, type TaskMaterialSource } from '../../src/service/task-material-references.js';
import type { LaunchPolicyProjection, ReviewRunProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Only admitted sample1 and synthetic library text, on the real store/ledger/execution path; no Provider or Electron.
const TEXT = '合成资料说明虚构的背景术语。\n另一段只用于资料库参考边界的测试。';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let capture: ReturnType<typeof capturedOrdinaryExecution> | undefined;
let localReadFixture: ResolvedModelFixture | null = null;
let bookId: string;
let opened = false;
let unitBoundary: (() => void) | null = null;

async function open(): Promise<void> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: localReadFixture === null ? null : {
      fixtureIdentity: localReadFixture.identity, fixtureSha256: localReadFixture.sha256, fixtureLineage: localReadFixture.lineage } });
  if (localReadFixture !== null) {
    launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    capture = undefined;
    owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy,
      fixture: localReadFixture, secretResolver: { resolve: async () => null } });
    driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner); opened = true; return;
  }
  const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
  capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    const header = parseReviewCategoryUnitMessageHeader(message);
    const content = request.stage === 'units' && header !== null
      ? { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] }
      : request.stage === 'cross-unit-reduction' && parseReviewCrossChapterMessage(message) !== null ? { schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [] }
        : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? undefined : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 10 } };
  }, { materialGuard: (id, ledger) => store.materialGuard(id, ledger), unitHold: async () => { unitBoundary?.(); } });
  owner = capture.owner; launchPolicy = capture.policy;
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  opened = true;
}
async function close(): Promise<void> {
  if (!opened) return;
  opened = false;
  const stopped = driver.dispose();
  await owner.dispose();
  await stopped;
  try { capture?.assertMatched(); store.markCleanShutdown(); } finally { store.close(); }
}
async function selectLocalReadRoute(): Promise<void> {
  await close();
  localReadFixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-review-cross-chapter-authored');
  await open();
}
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-review-library-');
  localReadFixture = null;
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  await open();
  const book = await importSample1Book(store, roots.codeRoot, '合成参考边界测试');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, '参考测试连接');
});
afterEach(async () => {
  await close();
  await roots.dispose();
});

async function material(text = TEXT, scope: 'book' | 'house' = 'book', choice: 'book' | 'house' | 'deferred' = 'book'): Promise<string> {
  const path = join(roots.inputRoot, `${randomUUID()}.txt`);
  writeFileSync(path, text.length > 500 ? text.match(/[\s\S]{1,500}/gu)!.join('\n\n') : text);
  const preview = await store.previewLibraryMaterial(path);
  const item = await store.addLibraryMaterial({ previewId: preview.previewId, title: '合成背景资料', kind: 'document' });
  store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: scope === 'house' ? { scope } : { scope, bookId } } });
  store.decideLibraryMaterial({ materialId: item.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice, reason: null } });
  store.startMaterialIndexing();
  await store.settleMaterialIndexing();
  return item.materialId;
}
function prepare(ids: ReadonlyArray<string> = [], categories = ['typos-and-usage'], serial = false): ReviewRunProjection {
  let work = store.createReviewRunPreparationWork(bookId, categories, WHOLE, launchPolicy, null, ids);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const run = work.projection!.run!;
  if (!serial) return run;
  const input = { bookId, kind: 'review-run' as const, ref: run.reviewRunId };
  const plan = store.inspectTaskPlan(input);
  store.editTaskPlan({ ...input, planEnvelopeDigest: plan.edit.planEnvelopeDigest!, removedSteps: [], disallowedAdaptations: [],
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } });
  return store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
}
function plan(run: ReviewRunProjection) {
  return store.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId });
}
function approvals(run: ReviewRunProjection) {
  return run.categories.flatMap((category) => category.planEnvelopeDigest === null ? [] : [{ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest }]);
}
function database<T>(body: (db: DatabaseSync) => T, writable = false): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: !writable });
  try { return body(db); } finally { db.close(); }
}
function recordPins(run: ReviewRunProjection): TaskMaterialSource[] {
  return database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(run.reviewRunId)!.canonical_json)).materialReferences.references);
}
function indexRows(): string {
  return database((db) => JSON.stringify([db.prepare('SELECT * FROM material_index_builds ORDER BY index_id').all(), db.prepare('SELECT * FROM material_index_segments ORDER BY index_id, ordinal').all()]));
}
function removeBuild(id: string): void {
  database((db) => {
    for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) {
      db.exec(`DROP TRIGGER ${name}`);
    }
    db.prepare('DELETE FROM material_index_segments WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)').run(id);
    db.prepare('DELETE FROM material_index_builds WHERE material_id = ?').run(id);
    for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
  }, true);
}
/** A deny-only material guard on the actual selected developer-live rule; current-policy positives live in live-material-references. */
async function denyLiveMaterials(): Promise<void> {
  const selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  expect(ruleFor(selected, 'editorial-review/typos-and-usage').materialReferencesAllowed).toBe(true);
  launchPolicy = withRuleFor(selected, 'editorial-review/typos-and-usage', { materialReferencesAllowed: false });
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy: launchPolicy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 } } });
}

describe('review categories reference exact library versions over ordinary captured transport', () => {
  it('interrupts review consumption after withdrawal and keeps the completed unit', async () => {
    const id = await material();
    const run = prepare([id], ['typos-and-usage'], true);
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    unitBoundary = () => {
      unitBoundary = null;
      store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    };
    await driver.drive(run.reviewRunId);
    const stopped = database((db) => db.prepare("SELECT canonical_json FROM analysis_run_states WHERE state = 'interrupted' ORDER BY rowid DESC LIMIT 1").get());
    const state = JSON.parse(String(stopped!.canonical_json));
    expect(state.detail).toContain('在任务运行中已撤回允许参考');
    expect(database((db) => db.prepare('SELECT count(*) AS n FROM analysis_harness_spans').get()!.n)).toBe(1);
    expect(state.detail).toContain('已完成的单元保留');
    expect(state.cause).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
  });
  it.each([
    ['MATERIAL_INDEX_MOVED', '在任务运行中的索引版本已不在本机', '计划冻结的索引版本已不在本机；重新准备计划'],
    ['MATERIAL_INDEX_RECORD_INVALID', '在任务运行中的索引记录已损坏', '的索引记录已损坏；先在资料库处理这份资料'],
  ] as const)('interrupts under way on %s with that reason and its own next step, not the withdrawal wording (Issue #759)', async (code, detail, next) => {
    const id = await material();
    const run = prepare([id], ['typos-and-usage'], true);
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    unitBoundary = () => {
      unitBoundary = null;
      database((db) => {
        for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
        if (code === 'MATERIAL_INDEX_MOVED') {
          db.prepare('DELETE FROM material_index_segments WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)').run(id);
          db.prepare('DELETE FROM material_index_builds WHERE material_id = ?').run(id);
        } else db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(id);
        for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
      }, true);
    };
    await driver.drive(run.reviewRunId);
    const state = JSON.parse(String(database((db) => db.prepare("SELECT canonical_json FROM analysis_run_states WHERE state = 'interrupted' ORDER BY rowid DESC LIMIT 1").get())!.canonical_json));
    expect(state.detail).toContain(detail);
    expect(state.detail).not.toContain('已撤回允许参考');
    expect(state.detail).toContain('已完成的单元保留');
    expect(state.cause).toBe(code);
    const outcome = JSON.parse(String(database((db) => db.prepare('SELECT canonical_json FROM analysis_task_outcomes ORDER BY rowid DESC LIMIT 1').get())!.canonical_json));
    expect(outcome.safeNextAction).toContain(next);
    expect(outcome.summary).toContain(detail);
  });

  it('offers a damaged index as a named, unselectable choice instead of failing the 审阅 page or dropping it (Issue #759)', async () => {
    const damaged = await material();
    const healthy = await material('另一份可读取的合成资料。');
    await close();
    database((db) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
      db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(damaged);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    }, true);
    await open();
    const offers = store.inspectReviewWorkspace(bookId, null).materials!;
    expect(offers.items.find((item) => item.materialId === damaged)).toMatchObject({ selectable: false, reason: '索引记录已损坏 · 不可选', characters: 0 });
    expect(offers.items.find((item) => item.materialId === healthy)).toMatchObject({ selectable: true, reason: null });
  });

  it('offers eligible items and freezes read-only pins in the Run and consuming Task plans, across reopen', async () => {
    const id = await material();
    const before = indexRows();
    const offers = store.inspectReviewWorkspace(bookId, null).materials!;
    expect(offers.items.map((item) => item.materialId)).toEqual([id]);
    const run = prepare([id], ['typos-and-usage', 'style-and-format']);
    const first = plan(run);
    expect(first.scope.reference.some((line) => line.includes('资料库资料') && line.includes('按计划冻结的索引版本读取'))).toBe(true);
    expect(first.scope.send).toContain('以及上面列出的资料库资料原文');
    expect(first.technical.find((row) => row.key === 'material-references')?.value).toContain(id);
    expect(first.start.readiness).toBe('ready');
    const pins = recordPins(run);
    expect(pins[0]?.materialId).toBe(id);
    const executionPins = database((db) => db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component = 'execution-plan' AND task_intent_id IN (SELECT json_extract(value, '$.task.taskIntentId') FROM review_runs, json_each(review_runs.canonical_json, '$.categories') WHERE review_run_id = ?)").all(run.reviewRunId));
    expect(executionPins.every((row) => JSON.stringify(JSON.parse(String(row.canonical_json)).materialReferences) === JSON.stringify(pins))).toBe(true);
    expect(executionPins.length).toBe(2);
    expect(executionPins.some((row) => String(row.canonical_json).includes(TEXT))).toBe(false);
    expect(indexRows()).toBe(before);
    await close();
    await open();
    expect(plan(run)).toEqual(first);
    expect(database((db) => db.prepare('PRAGMA user_version').get()!.user_version)).toBe(LATEST_SCHEMA_VERSION);
  });

  it.each(['missing', 'withdrawn', 'corrupt'] as const)('keeps completed review results readable with a precise %s note (Issue #759)', async (change) => {
    const id = await material();
    const run = prepare([id], ['typos-and-usage', 'style-and-format']);
    for (const category of run.categories) {
      const frozen = plan(run).technical.find((row) => row.key === `category:${category.categoryId}`)!;
      expect(frozen.value).toContain(category.planEnvelopeDigest!);
    }
    const before = indexRows();
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    await driver.drive(run.reviewRunId);
    const result = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(result.categories.every((category) => category.state === 'settled')).toBe(true);
    expect(result.state).toBe('settled');
    expect(indexRows()).toBe(before);
    if (change === 'withdrawn') store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    else if (change === 'missing') removeBuild(id);
    else database((db) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
      db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(id);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    }, true);
    await close(); await open();
    const completed = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(completed.state).toBe('settled');
    expect(plan(run).scope.reference.some((line) => line.includes('不能再开始'))).toBe(false);
    // …and it says so (Issue #759): the build is gone, the result stays readable, a further run needs a plan prepared anew.
    expect(plan(run).scope.reference.join(' ')).toContain(`${change === 'missing' ? '计划冻结的索引版本现已不在本机' : change === 'withdrawn' ? '这份资料现已撤回允许参考' : '这份资料的索引记录现已损坏'}；已有的结果仍可查看，再次运行需重新准备计划`);
    expect(plan(run).drift).toBeNull();
  });

  it('distinguishes withdrawn eligibility from a missing frozen build and blocks stale authorization', async () => {
    const id = await material();
    const run = prepare([id]);
    store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    expect(plan(run).scope.reference.some((line) => line.includes('现在不能列进'))).toBe(true);
    expect(plan(run).start.readiness).toBe('changed');
    expect(() => store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run))).toThrow('现在不能列进');
    store.decideLibraryMaterial({ materialId: id, expectedDecisions: 3, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    await close();
    removeBuild(id);
    await open();
    expect(plan(run).scope.reference.some((line) => line.includes('索引版本已不在本机'))).toBe(true);
    expect(() => store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run))).toThrow('索引版本已不在本机');
    expect(plan(run).scope.reference.some((line) => line.includes('改计划重做'))).toBe(false);
  });

  it('runs a plan read while its reference was withdrawn once the reference is admitted again', async () => {
    const id = await material();
    const run = prepare([id]);
    store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    // A fresh start, so the plan is first read while the pin cannot be: that unreadable contract must not be the one kept.
    await close();
    await open();
    expect(plan(run).start.readiness).toBe('changed');
    store.decideLibraryMaterial({ materialId: id, expectedDecisions: 3, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    expect(plan(run).start.readiness).toBe('ready');
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    await driver.drive(run.reviewRunId);
    expect(store.inspectReviewWorkspace(bookId, run.reviewRunId).run!.state).toBe('settled');
  });

  it('keeps the same prepared intent and contract for the same pins, with a new contract when references change', async () => {
    const id = await material();
    const plain = prepare();
    const task = plain.categories[0]!.taskIntentId;
    const referenced = prepare([id]);
    expect(referenced.categories[0]!.taskIntentId).not.toBe(task);
    expect(referenced.categories[0]!.planEnvelopeDigest).not.toBe(plain.categories[0]!.planEnvelopeDigest);
    expect(plan(plain).scope.reference.some((line) => line.includes('资料库资料'))).toBe(false);
    const promptDigest = (taskId: string) => database((db) => JSON.parse(String(db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1").get(taskId)!.canonical_json)).promptContractDigest);
    const digest = promptDigest(referenced.categories[0]!.taskIntentId!);
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(digest).not.toBe(promptDigest(plain.categories[0]!.taskIntentId!));
    const repeated = prepare([id]);
    expect(promptDigest(repeated.categories[0]!.taskIntentId!)).toBe(digest);
    expect(repeated.categories[0]!.taskIntentId).toBe(referenced.categories[0]!.taskIntentId);
    expect(repeated.categories[0]!.planEnvelopeDigest).toBe(referenced.categories[0]!.planEnvelopeDigest);
  });

  it('prepares under a changed guideline contract without misclassifying the old references as corrupt', async () => {
    // Imported house clauses are a local read-only preparation case, not admitted ordinary egress.
    await selectLocalReadRoute();
    const id = await material();
    const earlier = prepare([id]);
    const originalPins = recordPins(earlier);
    const path = join(roots.inputRoot, '合成文字规范.txt');
    writeFileSync(path, '合成文字规范\n\n1. 指出错字、别字、多字与漏字，给出改正后的文字。\n2. 指出成分残缺与搭配不当，给出通顺的改法。');
    const preview = await store.previewReviewGuidelineVersion('ai7-builtin/typos-and-usage', path);
    store.importReviewGuidelineVersion(preview.previewId);
    expect(() => store.inspectReviewWorkspace(bookId, null)).not.toThrow();
    const next = prepare([id]);
    expect(next.categories[0]!.taskIntentId).not.toBe(earlier.categories[0]!.taskIntentId);
    expect(recordPins(next)).toEqual(originalPins);
    expect(plan(earlier).technical.find((row) => row.key === 'category:typos-and-usage')?.value).toContain(earlier.categories[0]!.planEnvelopeDigest!);
    await close();
    await open();
    expect(plan(next).start.readiness).toBe('ready');
  });

  it('refuses references for factual-review-only and leads-only selections without changing their contracts', async () => {
    await selectLocalReadRoute();
    const id = await material();
    expect(() => prepare([id], ['factual-review'])).toThrow(REVIEW_MATERIAL_CATEGORY_REQUIRED);
    expect(recordPins(prepare([id], ['plot-consistency']))).toHaveLength(1);
    await close(); localReadFixture = null; await open();
    const plain = prepare([], ['factual-review']);
    expect(plan(plain).scope.reference.some((line) => line.includes('资料库资料'))).toBe(false);
    expect(database((db) => String(db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(plain.reviewRunId)!.canonical_json))).not.toContain('materialReferences');
    const mixed = prepare([id], ['typos-and-usage', 'factual-review']);
    const factual = mixed.categories.find((category) => category.categoryId === 'factual-review')!;
    expect(database((db) => String(db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'execution-plan' ORDER BY plan_version DESC LIMIT 1").get(factual.taskIntentId!)!.canonical_json))).not.toContain('materialReferences');
    expect(plan(mixed).scope.reference).toContain('资料库资料只供调用模型的审阅类别参考；事实核查与只读已有线索的类别不参考这些资料。');
  });

  it('offers book and house references, excluding other books and eligible items without a completed index', async () => {
    const local = await material('本书归属的合成资料。');
    const house = await material('社级归属的合成资料。', 'house', 'house');
    const other = await importSample1Book(store, roots.codeRoot, '另一份合成边界测试');
    store.decideLibraryMaterial({ materialId: local, expectedDecisions: 2, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: other.bookId } } });
    expect(store.inspectReviewWorkspace(bookId, null).materials!.items.map((item) => item.materialId)).toEqual([house]);
    expect(() => prepare([local])).toThrow(StoreError);
    expect(recordPins(prepare([house]))[0]?.materialId).toBe(house);
    const path = join(roots.inputRoot, 'unindexed.txt');
    writeFileSync(path, '合成的尚未建好索引的资料。');
    const preview = await store.previewLibraryMaterial(path);
    const pending = await store.addLibraryMaterial({ previewId: preview.previewId, title: '尚未建索引', kind: 'document' });
    store.decideLibraryMaterial({ materialId: pending.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId } } });
    store.decideLibraryMaterial({ materialId: pending.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    expect(store.inspectReviewWorkspace(bookId, null).materials!.items.some((item) => item.materialId === pending.materialId)).toBe(false);
    expect(() => prepare([pending.materialId])).toThrow(StoreError);
  });

  it('enforces all whole-item bounds and current attribution and eligibility', async () => {
    const long = await material(Array.from({ length: 3001 }, (_, index) => String.fromCodePoint(0x4e00 + (index * 37) % 2000)).join(''));
    expect(store.inspectReviewWorkspace(bookId, null).materials!.items.find((item) => item.materialId === long)?.selectable).toBe(false);
    expect(() => prepare([long])).toThrow('3,000');
    const ids = [await material(Array.from({ length: 3000 }, (_, index) => String.fromCodePoint(0x4e00 + (index * 37) % 2000)).join('')), await material(Array.from({ length: 3000 }, (_, index) => String.fromCodePoint(0x5800 + (index * 37) % 2000)).join('')), await material('丙')];
    expect(() => prepare(ids)).toThrow('6,000');
    expect(() => prepare([ids[0]!, ids[0]!])).toThrow('不重复');
    expect(() => prepare(Array.from({ length: 5 }, () => randomUUID()))).toThrow('4 份');
    expect(() => prepare(['not-a-uuid'])).toThrow('4 份');
    const deferred = await material(TEXT, 'book', 'deferred');
    expect(() => prepare([deferred])).toThrow(StoreError);
    const pendingPath = join(roots.inputRoot, 'pending.txt');
    writeFileSync(pendingPath, '这是另一份尚未决定归属的合成资料。');
    const preview = await store.previewLibraryMaterial(pendingPath);
    const pending = await store.addLibraryMaterial({ previewId: preview.previewId, title: '待决定的合成资料', kind: 'document' });
    expect(store.inspectReviewWorkspace(bookId, null).materials!.items.some((item) => item.materialId === pending.materialId)).toBe(false);
    expect(() => prepare([pending.materialId])).toThrow(StoreError);
  });

  it('does not send reference text when developer-live material permission is denied, including a previously prepared plan', async () => {
    const id = await material();
    const run = prepare([id]);
    const free = store.baselineAnalysisLedger.launch;
    const actual = launchPolicy;
    await denyLiveMaterials();
    try {
      const offers = store.inspectReviewWorkspace(bookId, null).materials!;
      expect(offers.statement).toBe(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(offers.items.every((item) => !item.selectable)).toBe(true);
      expect(plan(run).start.readiness).toBe('changed');
      expect(plan(run).drift?.reasons).toContain(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(() => prepare([id])).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(() => store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run))).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    } finally { store.baselineAnalysisLedger.bindLaunch(free); launchPolicy = actual; }
  });

  it('refuses corrupt index records by their material-specific reason', async () => {
    const id = await material();
    const run = prepare([id]);
    await close();
    database((db) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
      db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(id);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    }, true);
    await open();
    const blocked = plan(run);
    expect(blocked.start.readiness).toBe('changed');
    expect(blocked.scope.reference.join(' ')).toContain('索引记录已损坏');
  });

  it('says nothing would be sent when developer-live material permission is denied', async () => {
    const id = await material();
    const run = prepare([id]);
    expect(plan(run).scope.send).toContain('以及上面列出的资料库资料原文');
    const free = store.baselineAnalysisLedger.launch;
    const actual = launchPolicy;
    await denyLiveMaterials();
    try {
      const send = plan(run).scope.send;
      expect(send.startsWith('不发送任何内容')).toBe(true);
      expect(send).not.toContain('原文');
      expect(send).not.toContain('提取文字随稿件一并发往');
    } finally { store.baselineAnalysisLedger.bindLaunch(free); launchPolicy = actual; }
  });

  it('reads each pinned item whole once, then only re-checks its first page on later workspace reads', async () => {
    const id = await material(Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 段合成资料。`).join('\n\n'));
    const run = prepare([id]);
    const pages = vi.spyOn(store, 'readMaterialIndexForTask');
    try {
      plan(run);
      const first = pages.mock.calls.length;
      expect(first).toBeGreaterThan(1);
      pages.mockClear();
      plan(run);
      plan(run);
      // One re-check per read and per referenced category's ledger, never the later pages again.
      expect(pages.mock.calls.every((call) => call[2] === 1)).toBe(true);
      expect(pages.mock.calls.length).toBeGreaterThan(0);
      // A reference withdrawn since still refuses: the cache never stands in for the pin's availability.
      store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      expect(plan(run).scope.reference.some((line) => line.includes('现在不能列进'))).toBe(true);
    } finally { pages.mockRestore(); }
  });

  it('gives ANALYSIS_RECORD_INVALID, not a TypeError, when a frozen plan has lost its envelope row', async () => {
    const id = await material();
    prepare([id]);
    await close();
    database((db) => {
      const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'analysis_plan_records'").all() as Array<{ name: string; sql: string }>;
      for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
      db.prepare("DELETE FROM analysis_plan_records WHERE component = 'plan-envelope'").run();
      for (const trigger of triggers) db.exec(trigger.sql);
    }, true);
    await open();
    try { store.inspectReviewWorkspace(bookId, null); throw new Error('missing envelope not refused'); } catch (error) {
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error instanceof StoreError && error.code === 'ANALYSIS_RECORD_INVALID').toBe(true);
    }
  });

  it('checks the category executor from the configuration without building the whole workspace', async () => {
    await selectLocalReadRoute();
    const id = await material();
    const workspace = vi.spyOn(store, 'inspectReviewWorkspace');
    try {
      expect(() => prepare([id], ['factual-review'])).toThrow(REVIEW_MATERIAL_CATEGORY_REQUIRED);
      prepare([id]);
      expect(workspace).not.toHaveBeenCalled();
    } finally { workspace.mockRestore(); }
  });
});
