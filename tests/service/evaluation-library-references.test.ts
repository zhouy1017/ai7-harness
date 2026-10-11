import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { IMPORTED_EXEMPLAR_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE, type TaskMaterialSource } from '../../src/service/task-material-references.js';
import { NOTHING_SENT } from '../../src/service/task-plan.js';
import type { LaunchPolicyProjection, InitialEvaluationProjection, ReadersReportProjection } from '../../src/shared/protocol.js';
import { INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { READERS_REPORT_UNIT_RESULT_SCHEMA, READERS_REPORT_SYNTHESIS_RESULT_SCHEMA } from '../../src/service/evaluation/readers-report-contract.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Exact admitted sample1 plus synthetic library inputs; real ledgers/execution, no Provider or Electron.
const TEXT = '合成资料说明虚构的背景术语。\n另一段只用于资料库参考边界的测试。';
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let entries: Map<string, ModelFixtureEntry>;
let fixture: ResolvedModelFixture;
let bookId: string;
let opened = false;
async function open(): Promise<void> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } });
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  opened = true;
}
async function close(): Promise<void> {
  if (!opened) return;
  opened = false;
  await owner.dispose();
  store.markCleanShutdown();
  store.close();
}
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-evaluation-library-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const base = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-evaluation-authored');
  entries = new Map(base.entries);
  fixture = { ...base, entries };
  await open();
  const book = await importSample1Book(store, roots.codeRoot, '合成评估参考测试');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, '参考测试连接');
});
afterEach(async () => { await close(); await roots.dispose(); });

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
function database<T>(body: (db: DatabaseSync) => T, writable = false): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: !writable });
  try { return body(db); } finally { db.close(); }
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

type Kind = 'initial-evaluation' | 'readers-report';
function finalize(): void {
  const page = store.startEvaluation(bookId);
  const record = page.record!;
  store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: record.entries, finalize: true, content: {
    ...record.content, items: record.content.items.map((item) => ({ ...item, score: 12, notRated: null, comment: '合成定稿评语' })),
    risks: record.content.risks.map((risk) => ({ ...risk, level: 'low', statement: '合成风险说明' })), conclusion: 'revise',
  } });
}
function prepare(kind: Kind, ids: ReadonlyArray<string> = []): InitialEvaluationProjection | ReadersReportProjection {
  if (kind === 'initial-evaluation') {
    let work = store.createInitialEvaluationPreparationWork(bookId, launchPolicy, ids);
    while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
    return work.projection!;
  }
  let work = store.createReadersReportPreparationWork(bookId, 'author', launchPolicy, ids);
  while (!work.done) work = store.advanceReadersReportPreparationWork(work.workId!);
  return work.projection!;
}
function component(taskId: string, name = 'execution-plan'): Record<string, unknown> {
  return database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = ? ORDER BY plan_version DESC LIMIT 1').get(taskId, name)!.canonical_json)));
}
function pins(taskId: string): TaskMaterialSource[] { return component(taskId).materialReferences as TaskMaterialSource[]; }
function ledger(kind: Kind) {
  if (kind === 'initial-evaluation') return store.initialEvaluationLedgerForBook(bookId);
  const current = store.inspectReadersReport(bookId)!;
  const taskId = current.taskIntent!.taskIntentId;
  const task = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM readers_report_tasks WHERE task_intent_id = ? ORDER BY rowid DESC LIMIT 1').get(taskId)!.canonical_json)));
  return store.readersReportLedger(task.input, { bookId, references: pins(taskId) }, current.planEnvelope!.promptContractDigest);
}
function plan(kind: Kind, taskId: string) { return store.inspectTaskPlan({ bookId, kind, ref: taskId }); }
function frozenRows(kind: Kind): { lines: ReadonlyArray<string>; blocked: boolean } {
  const references = store.inspectEvaluation(bookId, null).materialReferences!;
  const key = kind === 'initial-evaluation' ? 'initial' : 'readersReport';
  return { lines: references[key], blocked: references.blocked[key] };
}
function authorize(kind: Kind, prepared: InitialEvaluationProjection | ReadersReportProjection) {
  return kind === 'initial-evaluation' ? store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest)
    : store.authorizeReadersReport(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
}
function answer(kind: Kind, prepared: InitialEvaluationProjection | ReadersReportProjection): void {
  const definition = ledger(kind).definition;
  const closed = prepared.coverageManifest!.units.map((unit) => {
    const result = kind === 'initial-evaluation' ? { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: [] }
      : { schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages: [] };
    const requestDigest = definition.requestDigest(unit.ordinal, unit.digest);
    entries.set(fixtureEntryKey(unit.ordinal, requestDigest), { unitOrdinal: unit.ordinal, requestDigest, attempt: null, contentDigest: null,
      response: { kind: 'unit-result', text: JSON.stringify(result), usage: { inputTokens: 10, outputTokens: 10 } } });
    return { state: 'closed' as const, unitOrdinal: unit.ordinal, result };
  });
  const profile = store.inspectEvaluation(bookId, null).profile;
  const response = kind === 'initial-evaluation' ? { schema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
    items: profile.items.map((item) => ({ itemId: item.itemId, score: 12, comment: '合成初评评语' })), strengths: [], weaknesses: [],
    nextStep: null, suggestedConclusion: 'revise', market: null }
    : { schema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA, overall: '合成总体评价', strengths: [], problems: [], suggestions: [], conclusion: '修改后再议' };
  const requestDigest = definition.crossUnit!.step!.requestDigest(closed);
  entries.set(fixtureEntryKey(0, requestDigest), { unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null,
    response: { kind: 'unit-result', text: JSON.stringify(response), usage: { inputTokens: 10, outputTokens: 10 } } });
}

describe.each(['initial-evaluation', 'readers-report'] as const)('评估 reference boundaries (%s)', (kind) => {
  beforeEach(() => { if (kind === 'readers-report') finalize(); });
  it('pins selected items without text, discloses them separately, survives restart and preserves old pins after re-preparation', async () => {
    const firstId = await material();
    const secondId = await material('另一份合成背景资料。');
    const before = indexRows();
    const prepared = prepare(kind, [firstId]);
    const taskId = prepared.taskIntent!.taskIntentId;
    const original = component(taskId);
    expect(pins(taskId).map((pin) => pin.materialId)).toEqual([firstId]);
    expect(JSON.stringify(original)).not.toContain(TEXT);
    const firstPlan = plan(kind, taskId);
    expect(firstPlan.scope.reference.some((line) => line.includes('合成背景资料'))).toBe(true);
    expect(firstPlan.scope.send).toContain('只在本机读取');
    expect(firstPlan.scope.send).toContain('只参照，不照抄');
    expect(firstPlan.technical.find((row) => row.key === 'material-references')?.value).toContain(pins(taskId)[0]!.indexDigest);
    expect(firstPlan.start.readiness).toBe('ready');
    // The references add to the disclosure; they never take away what the plan already said it does not read or send.
    expect(firstPlan.scope.notRead).toContain('其他图书');
    expect(firstPlan.service.send).toBe(NOTHING_SENT);
    expect(frozenRows(kind)).toEqual({ lines: [expect.stringContaining('《合成背景资料》')], blocked: false });
    const digest = ledger(kind).definition.promptContractDigest;
    await close(); await open();
    expect(ledger(kind).definition.promptContractDigest).toBe(digest);
    expect(plan(kind, taskId)).toEqual(firstPlan);
    const next = prepare(kind, [secondId]);
    expect(next.taskIntent!.taskIntentId).not.toBe(taskId);
    expect(pins(next.taskIntent!.taskIntentId)[0]!.materialId).toBe(secondId);
    expect(component(taskId)).toEqual(original);
    expect(ledger(kind).definition.promptContractDigest).not.toBe(digest);
    await close(); await open();
    expect(pins(taskId)[0]!.materialId).toBe(firstId);
    expect(ledger(kind).definition.materialReferences!.sources[0]!.materialId).toBe(secondId);
    expect(indexRows()).toBe(before);
    expect(database((db) => db.prepare('PRAGMA user_version').get()!.user_version)).toBe(IMPORTED_EXEMPLAR_SCHEMA_VERSION);
  });
  it('executes units and whole-book synthesis under the wrapper, keeps finalized semantics, and reads settled output with missing pins', async () => {
    const id = await material();
    const beforeRecord = store.inspectEvaluation(bookId, null).record;
    const prepared = prepare(kind, [id]);
    answer(kind, prepared);
    const accepted = authorize(kind, prepared);
    owner.admitAndDispatch(accepted.dispatchRunRecordId!, accepted.ledger);
    await owner.whenIdle();
    const projection = kind === 'initial-evaluation' ? store.inspectInitialEvaluation(bookId) : store.inspectReadersReport(bookId)!;
    expect(projection.state).toBe('settled');
    expect(projection.resultSetRevision).not.toBeNull();
    expect(projection.resultSetRevision!.gaps.length).toBe(0);
    expect(projection.run!.state).toBe('completed');
    expect(store.inspectEvaluation(bookId, null).record).toEqual(beforeRecord);
    if (kind === 'readers-report') {
      const row = database((db) => db.prepare('SELECT canonical_json FROM readers_report_tasks WHERE task_intent_id = ?').get(prepared.taskIntent!.taskIntentId)!);
      const task = JSON.parse(String(row.canonical_json));
      expect(task.promptContractSha256).toBe(component(prepared.taskIntent!.taskIntentId).materialReferenceBasePromptContractDigest);
      expect(task.input.template).toBe('author');
      expect(task.input.exemplars).toEqual([]);
      expect(task.input.record.items.every((item: { score: number }) => item.score === 12)).toBe(true);
      expect(task.input.record.conclusion).toBe('修改后再议');
    }
    removeBuild(id);
    await close(); await open();
    const after = kind === 'initial-evaluation' ? store.inspectInitialEvaluation(bookId) : store.inspectReadersReport(bookId)!;
    expect(after.resultSetRevision!.revisionId).toBe(projection.resultSetRevision!.revisionId);
    // A started Task read its reference as it was: 评估 never says it can no longer start.
    expect(frozenRows(kind).blocked).toBe(false);
    expect(frozenRows(kind).lines.join(' ')).not.toContain('不能再开始');
    expect(plan(kind, prepared.taskIntent!.taskIntentId).start.readiness).toBe('started');
  });
  it('blocks missing or no-longer-admitted references, and a fresh preparation can remove references', async () => {
    const id = await material();
    const prepared = prepare(kind, [id]);
    removeBuild(id);
    expect(plan(kind, prepared.taskIntent!.taskIntentId).drift?.reasons.join(' ')).toContain('「评估」重新准备计划');
    expect(plan(kind, prepared.taskIntent!.taskIntentId).start.readiness).toBe('changed');
    expect(() => authorize(kind, prepared)).toThrow('不能再开始');
    // 评估 offers the preparation again that the plan points to, beside the reason.
    expect(frozenRows(kind).blocked).toBe(true);
    expect(frozenRows(kind).lines.join(' ')).toContain('「评估」重新准备计划');
    const next = prepare(kind);
    expect(frozenRows(kind)).toEqual({ lines: [], blocked: false });
    expect(next.taskIntent!.taskIntentId).not.toBe(prepared.taskIntent!.taskIntentId);
    expect(component(next.taskIntent!.taskIntentId).materialReferences).toBeUndefined();
    const second = await material('后续合成资料。');
    const unavailable = prepare(kind, [second]);
    store.decideLibraryMaterial({ materialId: second, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    expect(() => authorize(kind, unavailable)).toThrow('现在不能列进');
  });
  it('refuses excess, duplicate, wrong-book and unadmitted selections before any reference plan is made', async () => {
    const id = await material();
    expect(() => prepare(kind, [id, id])).toThrow('不能重复');
    if (kind === 'initial-evaluation') expect(store.cancelInitialEvaluationPreparationWork(randomUUID())).toBe(false);
    expect(() => prepare(kind, Array.from({ length: 5 }, () => randomUUID()))).toThrow('4 份');
    const targetBook = bookId;
    const other = await importSample1Book(store, roots.codeRoot, '合成其他图书');
    bookId = other.bookId;
    const foreign = await material('合成其他图书的资料。');
    bookId = targetBook;
    expect(() => prepare(kind, [foreign])).toThrow();
    const unadmitted = await material('合成暂缓资料。', 'house', 'deferred');
    expect(() => prepare(kind, [unadmitted])).toThrow();
    const big = await material('合'.repeat(3001));
    expect(() => prepare(kind, [big])).toThrow();
    const a = await material('甲'.repeat(2500));
    const b = await material('乙'.repeat(2500));
    const c = await material('丙'.repeat(1001));
    expect(() => prepare(kind, [a, b, c])).toThrow('6,000');
  });
  it('does not turn corrupt index records into an unavailable-reference explanation', async () => {
    const id = await material();
    const prepared = prepare(kind, [id]);
    database((db) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
      db.prepare("UPDATE material_index_segments SET sha256 = ? WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)").run('f'.repeat(64), id);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    }, true);
    expect(() => plan(kind, prepared.taskIntent!.taskIntentId)).toThrow();
    try { authorize(kind, prepared); throw new Error('accepted corrupt records'); } catch (error) {
      expect(error).toBeInstanceOf(StoreError);
      expect((error as StoreError).code).not.toBe('MATERIAL_INDEX_MOVED');
      expect((error as StoreError).code).not.toBe('MATERIAL_REFERENCE_UNAVAILABLE');
    }
  });
  it('rejects reference-bearing preparation and frozen-plan authorization in developer-live', async () => {
    const id = await material();
    const prepared = prepare(kind, [id]);
    const live = { operationalScope: 'developer-live', live: { route: 'opencode-go', model: 'deepseek-v4-flash', endpoint: 'https://example.invalid/v1', credentialSlot: 'opencode-go', credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 }, platformTools: null, toolCalling: 'none' } } as const;
    store.baselineAnalysisLedger.bindLaunch(live);
    expect(() => prepare(kind, [id])).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    expect(() => authorize(kind, prepared)).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    expect(store.inspectEvaluation(bookId, null).materials!.items.every((item) => !item.selectable)).toBe(true);
  });
});
