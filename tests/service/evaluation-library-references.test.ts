import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { capturedMapAnswer, capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { clarificationPlanBaseDigest } from '../../src/service/provider/clarification-contract.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { ruleFor, withRuleFor } from '../support/policy-rules.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE, type TaskMaterialSource } from '../../src/service/task-material-references.js';
import type { LaunchPolicyProjection, InitialEvaluationProjection, ReadersReportProjection } from '../../src/shared/protocol.js';
import { INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { READERS_REPORT_UNIT_RESULT_SCHEMA, READERS_REPORT_SYNTHESIS_RESULT_SCHEMA } from '../../src/service/evaluation/readers-report-contract.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Exact admitted sample1 plus synthetic library inputs; real ledgers/execution, no Provider or Electron.
const TEXT = '合成资料说明虚构的背景术语。\n另一段只用于资料库参考边界的测试。';
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let entries: Map<string, ModelFixtureEntry>;
let capture: ReturnType<typeof capturedOrdinaryExecution>;
let bookId: string;
let opened = false;
let unitBoundary: ((settled: number) => void | Promise<void>) | null = null;
async function open(): Promise<void> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: null });
  const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
  store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
  const answer = capturedMapAnswer(entries);
  capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor,
    (request, message) => request.stage === 'run-report-reflection'
      ? { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] }), usage: { inputTokens: 10, outputTokens: 10 } }
      : answer(request, message),
    { materialGuard: (id, ledger) => store.materialGuard(id, ledger), unitHold: async (settled) => { await unitBoundary?.(settled); } });
  owner = capture.owner; launchPolicy = capture.policy;
  opened = true;
}
async function close(): Promise<void> {
  if (!opened) return;
  opened = false;
  await owner.dispose();
  try { capture.assertMatched(); store.markCleanShutdown(); } finally { store.close(); }
}
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-evaluation-library-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const base = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-evaluation-authored');
  entries = new Map(base.entries);
  await open();
  const book = await importSample1Book(store, roots.codeRoot, '合成评估参考测试');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, '参考测试连接');
});
afterEach(async () => { unitBoundary = null; await close(); await roots.dispose(); });

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
function breakIndex(id: string, record: 'segments' | 'build'): void {
  database((db) => {
    for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
    if (record === 'segments') db.prepare("UPDATE material_index_segments SET sha256 = ? WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)").run('f'.repeat(64), id);
    else db.prepare("UPDATE material_index_builds SET canonical_json = '{}' WHERE material_id = ?").run(id);
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
function prepare(kind: Kind, ids: ReadonlyArray<string> = [], template: 'author' | 'editorial' = 'author'): InitialEvaluationProjection | ReadersReportProjection {
  if (kind === 'initial-evaluation') {
    let work = store.createInitialEvaluationPreparationWork(bookId, launchPolicy, ids);
    while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
    return work.projection!;
  }
  let work = store.createReadersReportPreparationWork(bookId, template, launchPolicy, ids);
  while (!work.done) work = store.advanceReadersReportPreparationWork(work.workId!);
  return work.projection!;
}
function component(taskId: string, name = 'execution-plan'): Record<string, unknown> {
  return database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = ? ORDER BY plan_version DESC LIMIT 1').get(taskId, name)!.canonical_json)));
}
function pins(taskId: string): TaskMaterialSource[] { return (component(taskId).materialReferences as TaskMaterialSource[] | undefined) ?? []; }
function ledger(kind: Kind) {
  if (kind === 'initial-evaluation') return store.initialEvaluationLedgerForBook(bookId);
  const current = store.inspectReadersReport(bookId)!;
  const taskId = current.taskIntent!.taskIntentId;
  const task = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM readers_report_tasks WHERE task_intent_id = ? ORDER BY rowid DESC LIMIT 1').get(taskId)!.canonical_json)));
  const base = clarificationPlanBaseDigest(component(taskId), { promptContractDigest: current.planEnvelope!.promptContractDigest });
  expect(base).not.toBeNull();
  return store.readersReportLedger(task.input, { bookId, references: pins(taskId) }, base!);
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
function answer(kind: Kind, prepared: InitialEvaluationProjection | ReadersReportProjection, itemIds?: ReadonlyArray<string>): void {
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
    items: (itemIds ?? profile.items.map((item) => item.itemId)).map((itemId) => ({ itemId, score: 12, comment: '合成初评评语' })), strengths: [], weaknesses: [],
    nextStep: null, suggestedConclusion: 'revise', market: null }
    : { schema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA, overall: '合成总体评价', strengths: [], problems: [], suggestions: [], conclusion: '修改后再议' };
  const requestDigest = definition.crossUnit!.step!.requestDigest(closed);
  entries.set(fixtureEntryKey(0, requestDigest), { unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null,
    response: { kind: 'unit-result', text: JSON.stringify(response), usage: { inputTokens: 10, outputTokens: 10 } } });
}

describe('审稿意见 references per template (Issue #795 item 4)', () => {
  beforeEach(() => finalize());
  it('pins only each template’s own selection into its own plan', async () => {
    const id = await material();
    const author = prepare('readers-report', [id]).taskIntent!.taskIntentId;
    const editorial = prepare('readers-report', [], 'editorial').taskIntent!.taskIntentId;
    expect(editorial).not.toBe(author);
    expect(pins(author).map((pin) => pin.materialId)).toEqual([id]);
    expect(pins(editorial)).toEqual([]);
    expect(plan('readers-report', editorial).scope.reference.some((line) => line.includes('合成背景资料'))).toBe(false);
    // 评估 shows the latest Task's frozen rows: the editorial template's, which carry none.
    expect(frozenRows('readers-report')).toEqual({ lines: [], blocked: false });
  });
});

describe.each(['initial-evaluation', 'readers-report'] as const)('评估 reference boundaries (%s)', (kind) => {
  beforeEach(() => { if (kind === 'readers-report') finalize(); });
  it('re-checks a queued ledger when a place becomes free after withdrawal', async () => {
    const targetBook = bookId;
    // The actual ordinary runtime owns two Run places. Hold two real Runs so the material-bearing third really queues.
    const occupants = [];
    for (let index = 0; index < 2; index += 1) {
      const occupied = await importSample1Book(store, roots.codeRoot, `合成排队占位图书${index}`);
      await pinEditorialWorkspaceProfileRevision2(store, occupied.bookId); bookId = occupied.bookId;
      if (kind === 'readers-report') finalize();
      const prepared = prepare(kind); answer(kind, prepared); occupants.push(authorize(kind, prepared));
    }
    bookId = targetBook;
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const boundary = new Promise<void>((resolve) => { reached = resolve; });
    let holding = true;
    unitBoundary = async () => { if (holding) { reached(); await held; } };
    for (const occupied of occupants) owner.admitOrQueue(occupied.dispatchRunRecordId!, occupied.ledger);
    await boundary;
    try {
      const id = await material();
      const prepared = prepare(kind, [id]);
      answer(kind, prepared);
      const accepted = authorize(kind, prepared);
      expect(owner.admitOrQueue(accepted.dispatchRunRecordId!, accepted.ledger)).toBe('queued');
      store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      holding = false; release();
      await owner.whenIdle();
      expect(accepted.ledger.currentRunState(accepted.dispatchRunRecordId!)).toBe('blocked-before-dispatch');
      const last = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY rowid DESC LIMIT 1').get(accepted.dispatchRunRecordId!)!.canonical_json)));
      expect(last.detail).toContain('资料《合成背景资料》');
      expect(accepted.ledger.unitCheckpoints(accepted.dispatchRunRecordId!)).toHaveLength(0);
    } finally { release(); }
  });
  it.each(['withdrawn', 'missing', 'corrupt', 'drift'] as const)('blocks a cached authorized ledger when its material is %s', async (change) => {
    const id = await material();
    const prepared = prepare(kind, [id]);
    answer(kind, prepared);
    const accepted = authorize(kind, prepared);
    if (change === 'withdrawn') store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    else if (change === 'corrupt') breakIndex(id, 'segments');
    else if (change === 'missing') removeBuild(id);
    else {
      // A replacement has a different build digest; the cached ledger must still verify its exact original pin.
      database((db) => {
        for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${name}`);
        const row = db.prepare('SELECT index_id, canonical_json FROM material_index_builds WHERE material_id = ?').get(id)!;
        const record = canonicalRecord({ ...JSON.parse(String(row.canonical_json)), recordedAt: '2026-10-14T01:00:00.000Z' });
        db.prepare('UPDATE material_index_builds SET canonical_json = ?, sha256 = ? WHERE index_id = ?').run(record.json, record.digest, String(row.index_id));
        for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
      }, true);
    }
    const code = change === 'withdrawn' ? 'MATERIAL_REFERENCE_UNAVAILABLE' : change === 'corrupt' ? 'MATERIAL_INDEX_RECORD_INVALID' : 'MATERIAL_INDEX_MOVED';
    expect(() => owner.admitAndDispatch(accepted.dispatchRunRecordId!, accepted.ledger)).toThrowError(expect.objectContaining({ code }));
    expect(accepted.ledger.currentRunState(accepted.dispatchRunRecordId!)).toBe('blocked-before-dispatch');
    expect(accepted.ledger.unitCheckpoints(accepted.dispatchRunRecordId!)).toHaveLength(0);
  });

  it.each((['between-units', 'before-synthesis'] as const).flatMap((when) => (['withdrawn', 'missing', 'corrupt'] as const).map((change) => ({ when, change }))))('interrupts $change $when with completed units kept (Issue #759)', async ({ when, change }) => {
    const id = await material();
    let prepared = prepare(kind, [id]);
    // These assertions concern a particular serial boundary. Select the real finite-ceiling Plan that makes it serial;
    // ordinary production otherwise admits three concurrent units, unlike the former local fixture route.
    const input = { bookId, kind, ref: prepared.taskIntent!.taskIntentId };
    const editable = store.inspectTaskPlan(input);
    store.editTaskPlan({ ...input, planEnvelopeDigest: editable.edit.planEnvelopeDigest!, removedSteps: [],
      disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } });
    prepared = kind === 'initial-evaluation' ? store.inspectInitialEvaluation(bookId) : store.inspectReadersReport(bookId)!;
    answer(kind, prepared);
    const accepted = authorize(kind, prepared);
    const total = prepared.coverageManifest!.units.length;
    expect(total).toBeGreaterThan(1);
    let withdrawn = false;
    unitBoundary = (settled) => {
      if (!withdrawn && (when === 'between-units' ? settled === 0 : settled === total - 1)) {
        withdrawn = true;
        if (change === 'withdrawn') store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
        else if (change === 'missing') removeBuild(id);
        else breakIndex(id, 'segments');
      }
    };
    owner.admitAndDispatch(accepted.dispatchRunRecordId!, accepted.ledger);
    await owner.whenIdle();
    const projection = kind === 'initial-evaluation' ? store.inspectInitialEvaluation(bookId) : store.inspectReadersReport(bookId)!;
    expect(projection.run!.state).toBe('interrupted');
    const state = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY rowid DESC LIMIT 1').get(accepted.dispatchRunRecordId!)!.canonical_json)));
    expect(state.detail).toContain(`资料《合成背景资料》在任务运行中${change === 'withdrawn' ? '已撤回允许参考' : change === 'missing' ? '的索引版本已不在本机' : '的索引记录已损坏'}`);
    expect(state.detail).toContain('已完成的单元保留');
    expect(state.cause).toBe(change === 'withdrawn' ? 'MATERIAL_REFERENCE_UNAVAILABLE' : change === 'missing' ? 'MATERIAL_INDEX_MOVED' : 'MATERIAL_INDEX_RECORD_INVALID');
    expect(projection.resultSetRevision!.coverage.unitsClosed).toBe(when === 'between-units' ? 1 : total);
  });
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
    expect(firstPlan.scope.send).toContain('提取文字随稿件一并发往');
    expect(firstPlan.scope.send).toContain('只参照，不照抄');
    expect(firstPlan.technical.find((row) => row.key === 'material-references')?.value).toContain(pins(taskId)[0]!.indexDigest);
    expect(firstPlan.start.readiness).toBe('ready');
    // The references add to the disclosure; they never take away what the plan already said it does not read or send.
    expect(firstPlan.scope.notRead).toContain('其他图书');
    expect(firstPlan.service.send).toBe(`所读范围内的稿件正文${kind === 'readers-report' ? '与评估记录' : ''}发往 opencode-go · deepseek-v4.1-flash`);
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
    expect(database((db) => db.prepare('PRAGMA user_version').get()!.user_version)).toBe(LATEST_SCHEMA_VERSION);
  });
  it.each(['missing', 'withdrawn', 'corrupt'] as const)('keeps completed evaluation results readable with a precise %s note (Issue #759)', async (change) => {
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
    if (change === 'withdrawn') store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
    else if (change === 'corrupt') breakIndex(id, 'build');
    else removeBuild(id);
    await close(); await open();
    const after = kind === 'initial-evaluation' ? store.inspectInitialEvaluation(bookId) : store.inspectReadersReport(bookId)!;
    expect(after.resultSetRevision!.revisionId).toBe(projection.resultSetRevision!.revisionId);
    // A started Task read its reference as it was: 评估 never says it can no longer start.
    expect(frozenRows(kind).blocked).toBe(false);
    expect(frozenRows(kind).lines.join(' ')).not.toContain('不能再开始');
    // …but it says the build is gone, that the result stays readable and what a further run needs (Issue #759).
    expect(frozenRows(kind).lines).toEqual([expect.stringContaining(`${change === 'missing' ? '计划冻结的索引版本现已不在本机' : change === 'withdrawn' ? '这份资料现已撤回允许参考' : '这份资料的索引记录现已损坏'}；已有的结果仍可查看，再次运行需重新准备计划`)]);
    expect(plan(kind, prepared.taskIntent!.taskIntentId).scope.reference.join(' ')).toContain('已有的结果仍可查看，再次运行需重新准备计划');
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
  it.each(['segments', 'build'] as const)('degrades corrupt index %s to that reference, named plainly, and still reads the editor\u2019s own records', async (record) => {
    const id = await material();
    const healthy = await material('另一份可读取的合成资料。');
    const prepared = prepare(kind, [id]);
    const before = store.inspectEvaluation(bookId, null);
    breakIndex(id, record);
    // The page no longer fails whole: its versions and the open record read as they did.
    const page = store.inspectEvaluation(bookId, null);
    expect(page.records).toEqual(before.records);
    expect(page.record).toEqual(before.record);
    expect(page.materials!.items.some((item) => item.materialId === healthy && item.selectable)).toBe(true);
    // A damaged build is no longer dropped from the offers (Issue #759): it is listed, not selectable, with its reason and no size.
    if (record === 'build') {
      expect(page.materials!.items.find((item) => item.materialId === id)).toMatchObject({ selectable: false, reason: '索引记录已损坏 · 不可选', characters: 0 });
    }
    await close(); await open();
    expect(store.inspectEvaluation(bookId, null).records).toEqual(before.records);
    expect(frozenRows(kind).blocked).toBe(true);
    expect(frozenRows(kind).lines).toEqual([expect.stringContaining('资料《合成背景资料》的索引记录已损坏')]);
    expect(frozenRows(kind).lines.join(' ')).toContain('可以在「评估」重新准备计划');
    const blockedPlan = plan(kind, prepared.taskIntent!.taskIntentId);
    expect(blockedPlan.state.label).toBe('参考资料的索引记录已损坏');
    expect(blockedPlan.start.readiness).toBe('changed');
    expect(blockedPlan.scope.send).toContain('提取文字随稿件一并发往');
    expect(blockedPlan.drift?.reasons.join(' ')).toContain('的索引记录已损坏');
    try { authorize(kind, prepared); throw new Error('accepted corrupt records'); } catch (error) {
      expect(error).toBeInstanceOf(StoreError);
      expect((error as StoreError).code).toBe('MATERIAL_INDEX_RECORD_INVALID');
      expect((error as StoreError).code).not.toBe('MATERIAL_INDEX_MOVED');
      expect((error as StoreError).code).not.toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      expect((error as StoreError).message).toContain('资料《合成背景资料》的索引记录已损坏');
      expect((error as StoreError).message).toContain('不能再开始');
    }
    // The editor prepares again without the damaged reference, and the rows clear.
    const next = prepare(kind);
    expect(frozenRows(kind)).toEqual({ lines: [], blocked: false });
    expect(next.taskIntent!.taskIntentId).not.toBe(prepared.taskIntent!.taskIntentId);
    expect(component(next.taskIntent!.taskIntentId).materialReferences).toBeUndefined();
  });
  it('reads each pinned item whole once, then only re-checks its first page on later 评估 reads and polls', async () => {
    const id = await material(Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 段。`).join('\n\n'));
    const prepared = prepare(kind, [id]);
    const pages = vi.spyOn(store, 'readMaterialIndexForTask');
    try {
      store.inspectEvaluation(bookId, null);
      expect(pages.mock.calls.length).toBeGreaterThan(1);
      pages.mockClear();
      store.inspectEvaluation(bookId, null);
      if (kind === 'initial-evaluation') store.inspectInitialEvaluation(bookId);
      // Every later read re-checks only the pin's first page; the kept pages are never read again.
      expect(pages.mock.calls.length).toBeGreaterThan(0);
      expect(pages.mock.calls.every((call) => call[2] === 1)).toBe(true);
      // A reference withdrawn since still refuses: the kept text never stands in for the pin's availability.
      store.decideLibraryMaterial({ materialId: id, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      expect(frozenRows(kind).lines.some((line) => line.includes('现在不能列进'))).toBe(true);
      expect(component(prepared.taskIntent!.taskIntentId).materialReferences).toBeDefined();
    } finally { pages.mockRestore(); }
  });
  it('rejects reference-bearing preparation and frozen-plan authorization when the developer-live material permission is denied', async () => {
    const id = await material();
    const prepared = prepare(kind, [id]);
    expect(plan(kind, prepared.taskIntent!.taskIntentId).scope.send).toContain('提取文字随稿件一并发往');
    const selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    const taskKind = kind === 'initial-evaluation' ? 'evaluation' : kind;
    expect(ruleFor(selected, taskKind).materialReferencesAllowed).toBe(true);
    launchPolicy = withRuleFor(selected, taskKind, { materialReferencesAllowed: false });
    const live = { operationalScope: 'developer-live', policy: launchPolicy,
      live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 } } } as const;
    store.baselineAnalysisLedger.bindLaunch(live);
    // The plan prepared provider-free, read under developer-live, names the refusal instead of claiming the references would go.
    expect(plan(kind, prepared.taskIntent!.taskIntentId).scope.send).toBe('不发送任何内容；这份计划列了资料库资料，当前运行范围不能把它们发送给模型，这份计划不能开始');
    expect(() => prepare(kind, [id])).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    expect(() => authorize(kind, prepared)).toThrow(TASK_MATERIAL_LIVE_UNAVAILABLE);
    expect(store.inspectEvaluation(bookId, null).materials!.items.every((item) => !item.selectable)).toBe(true);
  });
});

describe('初评 references under a house Evaluation Profile version (Issues #427, #428)', () => {
  it('runs a Task with its frozen profile and its frozen pins after the house profile changes and the store reopens', async () => {
    const id = await material();
    const builtin = store.inspectEvaluationProfiles().profiles[0]!;
    // The Task is prepared under house version 2: four items, the first renamed and described.
    const older = store.saveEvaluationProfile({ expectedSha256: builtin.sha256, readiness: [],
      items: builtin.items.slice(0, 4).map((item, index) => ({ itemId: item.itemId, label: index === 0 ? '作品品质' : item.label, description: index === 0 ? '合成评分说明。' : '' })) }).profiles[0]!;
    const prepared = prepare('initial-evaluation', [id]) as InitialEvaluationProjection;
    const taskId = prepared.taskIntent!.taskIntentId;
    const frozenPins = pins(taskId);
    const base = component(taskId).materialReferenceBasePromptContractDigest;
    const digest = ledger('initial-evaluation').definition.promptContractDigest;
    const firstPlan = plan('initial-evaluation', taskId);
    expect(firstPlan.scope.reference.some((line) => line.includes('合成背景资料'))).toBe(true);
    // Then the house moves on to version 3: five items, one new, and a readiness default.
    store.saveEvaluationProfile({ expectedSha256: older.sha256, readiness: ['合成就绪项。'],
      items: [...older.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })), { itemId: null, label: '合成新增项', description: '' }] });
    await close(); await open();
    expect(store.inspectEvaluationProfiles().profiles[0]!.items).toHaveLength(5);
    expect(plan('initial-evaluation', taskId)).toEqual(firstPlan);
    const frozen = ledger('initial-evaluation').definition;
    expect([frozen.promptContractDigest, frozen.materialReferences!.basePromptContractDigest, frozen.materialReferences!.sources]).toEqual([digest, base, frozenPins]);
    answer('initial-evaluation', prepared, older.items.map((item) => item.itemId));
    const accepted = authorize('initial-evaluation', prepared);
    expect(accepted.ledger.definition.promptContractDigest).toBe(digest);
    expect(store.initialEvaluationLedgerForRun(accepted.dispatchRunRecordId!).definition.promptContractDigest).toBe(digest);
    owner.admitAndDispatch(accepted.dispatchRunRecordId!, accepted.ledger);
    await owner.whenIdle();
    const settled = store.inspectInitialEvaluation(bookId);
    expect([settled.state, settled.run!.state, settled.resultSetRevision!.gaps.length]).toEqual(['settled', 'completed', 0]);
    const latest = store.inspectEvaluation(bookId, null).initial.latest!;
    expect(latest.profile!.sha256).toBe(older.sha256);
    expect(latest.items.map((item) => item.itemId)).toEqual(older.items.map((item) => item.itemId));
    expect(pins(taskId)).toEqual(frozenPins);
  });
});
