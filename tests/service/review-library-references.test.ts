import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { IMPORTED_EXEMPLAR_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { reviewCategoryContractInput, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { taskMaterialKindDefinition, taskMaterialWords, TASK_MATERIAL_LIVE_UNAVAILABLE, REVIEW_MATERIAL_CATEGORY_REQUIRED, type TaskMaterialSource } from '../../src/service/task-material-references.js';
import type { LaunchPolicyProjection, ReviewRunProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Only admitted sample1 and synthetic library text, on the real store/ledger/execution path; no Provider or Electron.
const TEXT = '合成资料说明虚构的背景术语。\n另一段只用于资料库参考边界的测试。';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let entries: Map<string, ModelFixtureEntry>;
let fixture: ResolvedModelFixture;
let bookId: string;
let opened = false;

async function open(): Promise<void> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: {
    fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage,
  } });
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  opened = true;
}
async function close(): Promise<void> {
  if (!opened) return;
  opened = false;
  const stopped = driver.dispose();
  await owner.dispose();
  await stopped;
  store.markCleanShutdown();
  store.close();
}
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-review-library-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const base = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-review-authored');
  entries = new Map(base.entries);
  fixture = { ...base, entries };
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
function prepare(ids: ReadonlyArray<string> = [], categories = ['typos-and-usage']): ReviewRunProjection {
  let work = store.createReviewRunPreparationWork(bookId, categories, WHOLE, launchPolicy, null, ids);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  return work.projection!.run!;
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
/** Fixture answers, with no findings, for every unit of every referenced category of `run`. */
function answerEveryUnit(run: ReviewRunProjection, id: string): void {
  const pins = recordPins(run);
  const reading = store.readMaterialIndexForTask({ bookId, references: pins }, id, 1);
  for (const category of run.categories) {
    const entry = reviewCategoryEntry(category.categoryId)!;
    const definition = taskMaterialKindDefinition(reviewCategoryKindDefinition(reviewCategoryContractInput(entry)), { bookId, references: pins },
      pins.map((pin) => taskMaterialWords(pin, reading.segments.map((segment) => segment.text))));
    const manifest = database((db) => JSON.parse(String(db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component = 'coverage-manifest' AND task_intent_id = (SELECT json_extract(value, '$.task.taskIntentId') FROM review_runs, json_each(review_runs.canonical_json, '$.categories') WHERE review_run_id = ? AND json_extract(value, '$.categoryId') = ?)").get(run.reviewRunId, category.categoryId)!.canonical_json)));
    for (const unit of manifest.units) {
      const digest = definition.requestDigest(unit.ordinal, unit.digest);
      entries.set(fixtureEntryKey(unit.ordinal, digest), { unitOrdinal: unit.ordinal, requestDigest: digest, attempt: null, contentDigest: null,
        response: { kind: 'unit-result', text: JSON.stringify({ schema: definition.unitResultSchema, unitOrdinal: unit.ordinal, findings: [] }), usage: { inputTokens: 10, outputTokens: 10 } } });
    }
  }
}

describe('review categories reference exact local library versions', () => {
  it('offers eligible items and freezes read-only pins in the Run and consuming Task plans, across reopen', async () => {
    const id = await material();
    const before = indexRows();
    const offers = store.inspectReviewWorkspace(bookId, null).materials!;
    expect(offers.items.map((item) => item.materialId)).toEqual([id]);
    const run = prepare([id], ['typos-and-usage', 'style-and-format']);
    const first = plan(run);
    expect(first.scope.reference.some((line) => line.includes('资料库资料') && line.includes('按计划冻结的索引版本读取'))).toBe(true);
    expect(first.scope.send).toContain('资料库资料也只在本机读取');
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
    expect(database((db) => db.prepare('PRAGMA user_version').get()!.user_version)).toBe(IMPORTED_EXEMPLAR_SCHEMA_VERSION);
  });

  it('runs both referenced categories through the real execution owner, then still reads settled results with the build gone', async () => {
    const id = await material();
    const run = prepare([id], ['typos-and-usage', 'style-and-format']);
    for (const category of run.categories) {
      const frozen = plan(run).technical.find((row) => row.key === `category:${category.categoryId}`)!;
      expect(frozen.value).toContain(category.planEnvelopeDigest!);
    }
    answerEveryUnit(run, id);
    const before = indexRows();
    store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run));
    await driver.drive(run.reviewRunId);
    const result = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(result.categories.every((category) => category.state === 'settled')).toBe(true);
    expect(result.state).toBe('settled');
    expect(indexRows()).toBe(before);
    await close();
    removeBuild(id);
    await open();
    const completed = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!;
    expect(completed.state).toBe('settled');
    expect(plan(run).scope.reference.some((line) => line.includes('不能再开始'))).toBe(false);
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
    answerEveryUnit(run, id);
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
    const repeated = prepare([id]);
    expect(repeated.categories[0]!.taskIntentId).toBe(referenced.categories[0]!.taskIntentId);
    expect(repeated.categories[0]!.planEnvelopeDigest).toBe(referenced.categories[0]!.planEnvelopeDigest);
  });

  it('prepares under a changed guideline contract without misclassifying the old references as corrupt', async () => {
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
    const id = await material();
    for (const category of ['factual-review', 'plot-consistency']) expect(() => prepare([id], [category])).toThrow(REVIEW_MATERIAL_CATEGORY_REQUIRED);
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

  it('does not send reference text under developer-live, including a plan prepared before the scope changed', async () => {
    const id = await material();
    const run = prepare([id]);
    const free = store.baselineAnalysisLedger.launch;
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', live: { route: 'opencode-go', model: 'deepseek-v4-flash', endpoint: 'https://example.invalid/v1', credentialSlot: 'opencode-go', credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 }, platformTools: null, toolCalling: 'none' } });
    try {
      const offers = store.inspectReviewWorkspace(bookId, null).materials!;
      expect(offers.statement).toBe(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(offers.items.every((item) => !item.selectable)).toBe(true);
      expect(plan(run).start.readiness).toBe('changed');
      expect(plan(run).drift?.reasons).toContain(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(() => prepare([id])).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
      expect(() => store.authorizeReviewRun(bookId, run.reviewRunId, approvals(run))).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    } finally { store.baselineAnalysisLedger.bindLaunch(free); }
  });

  it('propagates corrupt index records instead of calling them moved', async () => {
    const id = await material();
    const run = prepare([id]);
    await close();
    database((db) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
      db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(id);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    }, true);
    await open();
    try { plan(run); throw new Error('corruption not refused'); } catch (error) {
      expect(error instanceof StoreError && error.code === 'MATERIAL_INDEX_RECORD_INVALID').toBe(true);
    }
  });

  it('says nothing would be sent when a plan listing library items is read under developer-live', async () => {
    const id = await material();
    const run = prepare([id]);
    expect(plan(run).scope.send).toContain('也只在本机读取');
    const free = store.baselineAnalysisLedger.launch;
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', live: { route: 'opencode-go', model: 'deepseek-v4-flash', endpoint: 'https://example.invalid/v1', credentialSlot: 'opencode-go', credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 }, platformTools: null, toolCalling: 'none' } });
    try {
      const send = plan(run).scope.send;
      expect(send.startsWith('不发送任何内容')).toBe(true);
      expect(send).not.toContain('原文');
      expect(send).not.toContain('也只在本机读取');
    } finally { store.baselineAnalysisLedger.bindLaunch(free); }
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
    const id = await material();
    const workspace = vi.spyOn(store, 'inspectReviewWorkspace');
    try {
      expect(() => prepare([id], ['factual-review'])).toThrow(REVIEW_MATERIAL_CATEGORY_REQUIRED);
      prepare([id]);
      expect(workspace).not.toHaveBeenCalled();
    } finally { workspace.mockRestore(); }
  });
});
