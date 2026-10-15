import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE } from '../../src/service/task-material-references.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { WRITING_MATERIAL_LIVE_UNAVAILABLE, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { WRITING_REQUEST } from '../support/writing-task.js';
import { withRuleFor } from '../support/policy-rules.js';

// Real material import, pins, ledgers, per-step re-check, adapter and egress; the transport is socket-free.
type Kind = 'review' | 'writing' | 'initial-evaluation' | 'readers-report';
const kinds = ['review', 'writing', 'initial-evaluation', 'readers-report'] as const;
const kindId = (kind: Kind) => kind === 'review' ? 'editorial-review/typos-and-usage' : kind === 'initial-evaluation' ? 'evaluation' : kind;
const title = '合成背景资料';
let materialText: string;
// @ts-expect-error Plain ESM tool has no declarations.
const fixtureTool = await import('../../tools/generate-model-fixture.mjs') as {
  parseCachedRequest(body: string, contract: string): unknown;
  verifySample1Capture(request: unknown, selection: unknown, parsed: unknown): Promise<boolean>;
};
let roots: ServiceTestRoots;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let policy: LaunchPolicyProjection;
let bookId: string;
let materialId: string;
let sent: string[];
let atUnit: ((settled: number) => void) | null;
let reportFixture: ResolvedModelFixture;
let evaluationFixture: ResolvedModelFixture;

function bind(): void {
  const launch = { operationalScope: 'developer-live' as const, policy, live: { ...DEVELOPER_LIVE_POLICY_BINDING,
    credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } } };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.initialEvaluationLedger.bindLaunch(launch);
}

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-live-material-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  for (const kind of kinds) {
    const id = kindId(kind);
    const rule = policy.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(id))!;
    policy = withRuleFor(policy, id, { materialReferencesAllowed: true,
      outboundDataCategories: [...new Set([...rule.outboundDataCategories, 'frozen-material-reference-excerpt' as const])] });
  }
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  bind();
  const book = await importSample1Book(store, roots.codeRoot, '合成实时参考测试');
  bookId = book.bookId;
  materialText = store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).find((block) => block.kind === 'paragraph' && block.text.length > 40)!.text;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, '合成参考连接');
  const path = join(roots.inputRoot, `${randomUUID()}.txt`);
  writeFileSync(path, materialText);
  const preview = await store.previewLibraryMaterial(path);
  const material = await store.addLibraryMaterial({ previewId: preview.previewId, title, kind: 'document' });
  materialId = material.materialId;
  store.decideLibraryMaterial({ materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId } } });
  store.decideLibraryMaterial({ materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
  store.startMaterialIndexing();
  await store.settleMaterialIndexing();
  const page = store.startEvaluation(bookId);
  const record = page.record!;
  store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: record.entries, finalize: true, content: {
    ...record.content, items: record.content.items.map((item) => ({ ...item, score: 12, notRated: null, comment: '合成定稿评语' })),
    risks: record.content.risks.map((risk) => ({ ...risk, level: 'low', statement: '合成风险说明' })), conclusion: 'revise',
  } });
  reportFixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-readers-report-authored');
  evaluationFixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-evaluation-authored');
  sent = [];
  atUnit = null;
  const nativeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    sent.push(String(init?.body));
    const message = body.messages.at(-1)!.content;
    const review = /^审阅单元 (\d+)\//u.exec(message);
    const writing = /^写作单元 (\d+)\//u.exec(message);
    const report = /^(审稿意见|评估)(单元|综合) (\d+)\//u.exec(message);
    let text: string;
    if (report !== null) {
      const schema = `"schema":"ai7.${report[1] === '评估' ? 'evaluation' : 'readers-report'}.${report[2] === '综合' ? 'synthesis' : 'unit'}-result/`;
      const entry = [...(report[1] === '评估' ? evaluationFixture : reportFixture).entries.values()].find((candidate) => candidate.unitOrdinal === (report[2] === '综合' ? 0 : Number(report[3])) &&
        candidate.response.kind === 'unit-result' && candidate.response.text.includes(schema));
      if (entry?.response.kind !== 'unit-result') throw new Error('SYNTHETIC_REPORT_ENTRY_MISSING');
      text = entry.response.text;
    } else {
      const result = review !== null ? { schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: Number(review[1]), findings: [] }
        : writing !== null ? { schema: 'ai7.writing.unit-result/1', unitOrdinal: Number(writing[1]), passages: [{ kind: 'highlight', note: '合成看点。', blockOrdinals: [1] }] }
        : message.startsWith('写作综合 ') ? { schema: 'ai7.writing.synthesis-result/1', title: '合成草稿', sections: [{ heading: '合成部分', paragraphs: ['合成草稿待编辑修改。'] }] }
        : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查草稿。', basis: '合成账目。' }] };
      text = JSON.stringify(result);
    }
    return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
      choices: [{ message: { content: text, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' }, materialGuard: (id, ledger) => store.materialGuard(id, ledger),
    unitHold: async (settled) => { atUnit?.(settled); }, developerLive: { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 },
      providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'live-material-references', case: 'synthetic-boundary', delta: null } }, nativeFetch } });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
});

afterEach(async () => { const stopped = driver?.dispose(); await owner?.dispose(); await stopped; store?.close(); await roots?.dispose(); });

function prepare(kind: Kind) {
  const assertPlan = (ref: string) => {
    const plan = store.inspectTaskPlan({ bookId, kind: kind === 'review' ? 'review-run' : kind, ref });
    expect(plan.start.readiness).toBe('ready');
    expect(plan.scope.send.includes('资料库资料')).toBe(true);
    expect(plan.scope.send.includes('不能开始')).toBe(false);
  };
  if (kind === 'review') {
    let work = store.createReviewRunPreparationWork(bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [materialId]);
    while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
    const run = work.projection!.run!;
    assertPlan(run.reviewRunId);
    return async () => {
      store.authorizeReviewRun(bookId, run.reviewRunId, run.categories.flatMap((category) => category.planEnvelopeDigest === null ? [] : [{ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest }]));
      await driver.drive(run.reviewRunId);
    };
  }
  if (kind === 'writing') {
    let work = store.createWritingPreparationWork(bookId, { ...WRITING_REQUEST, materialIds: [materialId] }, policy);
    while (!work.done) work = store.advanceWritingPreparationWork(work.workId!);
    const prepared = work.projection!;
    assertPlan(prepared.taskIntent!.taskIntentId);
    return async () => {
      const authorized = store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await owner.whenIdle();
    };
  }
  if (kind === 'initial-evaluation') {
    let work = store.createInitialEvaluationPreparationWork(bookId, policy, [materialId]);
    while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
    const prepared = work.projection!;
    assertPlan(prepared.taskIntent!.taskIntentId);
    return async () => {
      const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await owner.whenIdle();
    };
  }
  let work = store.createReadersReportPreparationWork(bookId, 'author', policy, [materialId]);
  while (!work.done) work = store.advanceReadersReportPreparationWork(work.workId!);
  const prepared = work.projection!;
  assertPlan(prepared.taskIntent!.taskIntentId);
  return async () => {
    const authorized = store.authorizeReadersReport(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
    await owner.whenIdle();
  };
}

function database<T>(read: (db: DatabaseSync) => T, writable = false): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: !writable });
  try { return read(db); } finally { db.close(); }
}

describe('live material references (#809)', () => {
  it.each(kinds)('runs reference-bearing %s through the real adapter and material wrapper', async (kind) => {
    await prepare(kind)();
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.some((body) => body.includes(title) && body.includes(materialText))).toBe(true);
    const states = database((db) => db.prepare('SELECT state FROM analysis_run_states ORDER BY rowid DESC LIMIT 1').get()!);
    expect(states.state).toBe('completed');
    const task = database((db) => db.prepare('SELECT task_intent_id FROM analysis_task_intents WHERE kind = ? ORDER BY rowid DESC LIMIT 1').get(kindId(kind))!);
    const taskId = String(task.task_intent_id);
    const envelope = database((db) => JSON.parse(String(db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1").get(taskId)!.canonical_json)));
    const selection = { model: DEVELOPER_LIVE_POLICY_BINDING.model, taskPromptContractDigest: envelope.promptContractDigest,
      captured: { route: DEVELOPER_LIVE_POLICY_BINDING.route } };
    const proof = { sample1Store: join(roots.dataRoot, 'store', 'ai7.sqlite'), sample1Task: taskId };
    expect(await fixtureTool.verifySample1Capture(proof, selection, fixtureTool.parseCachedRequest(sent[0]!, envelope.promptContractDigest))).toBe(true);
    if (kind !== 'writing') {
      const altered = sent[0]!.replace(materialText, '另一份未冻结的合成资料。');
      await expect(fixtureTool.verifySample1Capture(proof, selection, fixtureTool.parseCachedRequest(altered, envelope.promptContractDigest)))
        .rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    }
  });

  it.each(kinds)('keeps the exact predecessor refusal for %s when its rule lacks the category', (kind) => {
    const id = kindId(kind);
    const rule = policy.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(id))!;
    policy = withRuleFor(policy, id, { outboundDataCategories: rule.outboundDataCategories.filter((category) => category !== 'frozen-material-reference-excerpt') });
    bind();
    expect(() => prepare(kind)).toThrowError(kind === 'writing' ? WRITING_MATERIAL_LIVE_UNAVAILABLE : TASK_MATERIAL_LIVE_UNAVAILABLE);
    expect(sent).toHaveLength(0);
  });

  it.each(kinds.flatMap((kind) => (['withdrawn', 'moved', 'corrupt'] as const).map((damage) => ({ kind, damage }))))('re-checks $kind after $damage, keeping its completed unit', async ({ kind, damage }) => {
    const run = prepare(kind);
    atUnit = () => {
      atUnit = null;
      if (damage === 'withdrawn') store.decideLibraryMaterial({ materialId, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      else database((db) => {
        for (const trigger of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(`DROP TRIGGER ${trigger}`);
        if (damage === 'corrupt') db.prepare('UPDATE material_index_segments SET sha256 = ? WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)').run('f'.repeat(64), materialId);
        else {
          db.prepare('DELETE FROM material_index_segments WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)').run(materialId);
          db.prepare('DELETE FROM material_index_builds WHERE material_id = ?').run(materialId);
        }
        for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
      }, true);
    };
    await run();
    expect(sent).toHaveLength(1);
    const state = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_run_states ORDER BY rowid DESC LIMIT 1').get()!.canonical_json)));
    expect(state.state).toBe('interrupted');
    expect(state.cause).toBe(damage === 'withdrawn' ? 'MATERIAL_REFERENCE_UNAVAILABLE' : damage === 'moved' ? 'MATERIAL_INDEX_MOVED' : 'MATERIAL_INDEX_RECORD_INVALID');
    expect(state.detail).toContain('已完成的单元保留');
    expect(database((db) => db.prepare("SELECT count(*) AS n FROM analysis_unit_results WHERE state = 'closed'").get()!.n)).toBe(1);
  });
});
