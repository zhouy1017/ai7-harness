import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ownBlockIdsOf, ownBlockTextsOf, substituteBlockPlaceholders, unitContentDigest } from '../../src/service/provider/local-deterministic-adapter.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE } from '../../src/service/task-material-references.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { WRITING_MATERIAL_LIVE_UNAVAILABLE, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { withRuleFor } from '../support/policy-rules.js';

// Real material import, pins, ledgers, per-step re-check, adapter and egress; the transport is socket-free.
type Kind = 'review' | 'writing' | 'initial-evaluation' | 'readers-report';
const kinds = ['review', 'writing', 'initial-evaluation', 'readers-report'] as const;
const kindId = (kind: Kind) => kind === 'review' ? 'editorial-review/typos-and-usage' : kind === 'initial-evaluation' ? 'evaluation' : kind;
const title = 'sample1 背景摘录';
let materialText: string;
let materialParagraphs: string[];
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
let recorded: ResolvedModelFixture | null;
let recordedUnits: Set<number>;
let planRef: string;
const writingRequest = { typeId: 'promotion-article', audience: '文学作品读者', channel: '图书介绍',
  requirements: '依据稿件与允许参考的资料起草，资料只参照、不照抄。' } as const;

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
  const book = await importSample1Book(store, roots.codeRoot, 'sample1 · 资料参考验证');
  bookId = book.bookId;
  materialParagraphs = store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).filter((block) => block.kind === 'paragraph' && block.text.length > 40).slice(0, 2).map((block) => block.text);
  materialText = materialParagraphs.join('\n\n');
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
    ...record.content, items: record.content.items.map((item) => ({ ...item, score: 12, notRated: null, comment: '本次验证使用编辑填写的定稿评分，须结合稿件复核。' })),
    risks: record.content.risks.map((risk) => ({ ...risk, level: 'low', statement: '本次未作联网核查，风险判断待编辑复核。' })), conclusion: 'revise',
  } });
  reportFixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-readers-report-authored');
  evaluationFixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-evaluation-authored');
  sent = [];
  recorded = null;
  recordedUnits = new Set();
  atUnit = null;
  const nativeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    sent.push(String(init?.body));
    const message = body.messages.at(-1)!.content;
    const review = /^审阅单元 (\d+)\//u.exec(message);
    const writing = /^写作单元 (\d+)\//u.exec(message);
    const report = /^(审稿意见|评估)(单元|综合) (\d+)\//u.exec(message);
    let text: string;
    let usage = { inputTokens: 40, outputTokens: 20 };
    const ordinal = review !== null ? Number(review[1]) : writing !== null ? Number(writing[1]) : report?.[2] === '单元' ? Number(report[3]) : null;
    const captured = recorded === null ? undefined : [...recorded.entries.values()].find((entry) => ordinal !== null
      ? entry.unitOrdinal === ordinal && entry.contentDigest === unitContentDigest(ownBlockTextsOf(message))
      : (message.startsWith('写作综合 ') || report?.[2] === '综合') && entry.capture?.subject === 'task-synthesis');
    if (recorded !== null && ordinal !== null && captured === undefined) throw new Error('RECORDED_MATERIAL_UNIT_MISSING');
    if (captured?.response.kind === 'unit-result') {
      text = substituteBlockPlaceholders(captured.response.text, ownBlockIdsOf(message));
      usage = captured.response.usage;
      if (ordinal !== null) recordedUnits.add(ordinal);
    } else if (report !== null) {
      const schema = `"schema":"ai7.${report[1] === '评估' ? 'evaluation' : 'readers-report'}.${report[2] === '综合' ? 'synthesis' : 'unit'}-result/`;
      const entry = [...(report[1] === '评估' ? evaluationFixture : reportFixture).entries.values()].find((candidate) => candidate.unitOrdinal === (report[2] === '综合' ? 0 : Number(report[3])) &&
        candidate.response.kind === 'unit-result' && candidate.response.text.includes(schema));
      if (entry?.response.kind !== 'unit-result') throw new Error('SYNTHETIC_REPORT_ENTRY_MISSING');
      text = entry.response.text;
    } else {
      const result = review !== null ? { schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: Number(review[1]), findings: [] }
        : writing !== null ? { schema: 'ai7.writing.unit-result/1', unitOrdinal: Number(writing[1]), passages: [{ kind: 'highlight', note: '合成看点。', blockOrdinals: [1] }] }
        : message.startsWith('写作综合 ') ? { schema: 'ai7.writing.synthesis-result/1', title: '合成草稿', sections: [{ heading: '合成部分', paragraphs: ['合成草稿待编辑修改。'] }] }
        : message.startsWith('保证抽样 ') ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
        : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查草稿。', basis: '合成账目。' }] };
      text = JSON.stringify(result);
    }
    return new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
      choices: [{ message: { content: text, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' }, materialGuard: (id, ledger) => store.materialGuard(id, ledger),
    unitHold: async (settled) => { atUnit?.(settled); }, developerLive: { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 },
      providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'live-material-references', case: 'synthetic-boundary', delta: null } }, nativeFetch } });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
});

afterEach(async () => { const stopped = driver?.dispose(); await owner?.dispose(); await stopped; store?.close(); await roots?.dispose(); });

/** The kind's one rule without the named material term — `both` reads as Provider Processing v11's rule does. */
function deny(kind: Kind, term: 'category' | 'flag' | 'both'): void {
  const id = kindId(kind);
  const rule = policy.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(id))!;
  policy = withRuleFor(policy, id, {
    ...(term === 'flag' ? {} : { outboundDataCategories: rule.outboundDataCategories.filter((category) => category !== 'frozen-material-reference-excerpt') }),
    ...(term === 'category' ? {} : { materialReferencesAllowed: false }),
  });
  bind();
}

/** The predecessor's exact refusal of a material-bearing live Task, code and words. */
const refusalOf = (kind: Kind) => kind === 'writing' ? { code: 'WRITING_UNAVAILABLE', message: WRITING_MATERIAL_LIVE_UNAVAILABLE }
  : { code: kind === 'review' ? 'REVIEW_MATERIAL_UNAVAILABLE' : 'TASK_MATERIAL_UNAVAILABLE', message: TASK_MATERIAL_LIVE_UNAVAILABLE };

function thrown(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error('NOT_REFUSED');
}

function prepare(kind: Kind) {
  const assertPlan = (ref: string) => {
    planRef = ref;
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
    let work = store.createWritingPreparationWork(bookId, { ...writingRequest, materialIds: [materialId] }, policy);
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
    expect(sent.some((body) => body.includes(title) && materialParagraphs.every((paragraph) => body.includes(paragraph)))).toBe(true);
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
      const altered = sent[0]!.replace(materialParagraphs[0]!, '另一份未冻结的合成资料。');
      await expect(fixtureTool.verifySample1Capture(proof, selection, fixtureTool.parseCachedRequest(altered, envelope.promptContractDigest)))
        .rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    }
  });

  it.each(['review', 'writing', 'readers-report'] as const)('replays recorded %s units and any synthesis without a socket or credential', async (kind) => {
    recorded = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), `sample1-recorded-v41-material-${kind}`);
    await prepare(kind)();
    expect(recordedUnits.size).toBe(8);
    expect(sent.some((body) => materialParagraphs.every((paragraph) => body.includes(paragraph)))).toBe(true);
    // Sampling and reflection use synthetic control answers; the actual unit/synthesis texts and usage come from their capture.
    expect(database((db) => db.prepare("SELECT count(*) AS n FROM analysis_unit_results WHERE state = 'closed'").get()!.n)).toBeGreaterThan(0);
    expect([...recorded.entries.values()].every((entry) => entry.capture?.model === DEVELOPER_LIVE_POLICY_BINDING.model && entry.capture.evidenceScope === 'namespaced')).toBe(true);
    if (kind === 'writing') {
      const revision = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_result_set_revisions ORDER BY rowid DESC LIMIT 1').get()!.canonical_json)));
      expect(revision.writing.draft).toBeNull();
      expect(revision.writing.synthesis.reason.includes('material-copied')).toBe(true);
    }
    if (kind === 'readers-report') {
      const revision = database((db) => JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_result_set_revisions ORDER BY rowid DESC LIMIT 1').get()!.canonical_json)));
      expect(revision.readersReport.sections).toBeNull();
      expect(revision.readersReport.synthesis.reason.includes('schema-invalid')).toBe(true);
    }
  });

  it.each(kinds.flatMap((kind) => (['category', 'flag'] as const).map((term) => ({ kind, term }))))('keeps the exact predecessor refusal for $kind when its rule lacks the material $term', ({ kind, term }) => {
    deny(kind, term);
    expect(thrown(() => prepare(kind))).toMatchObject(refusalOf(kind));
    expect(sent).toHaveLength(0);
  });

  it.each(kinds)('refuses a %s plan prepared under the admitting rule once the rule reads as v11, and says nothing would be sent', async (kind) => {
    const run = prepare(kind);
    deny(kind, 'both');
    // Brief revision 5: the review send condition and the two evaluation `refusedLive` arguments ask the exact kind's rule.
    if (kind !== 'writing') {
      expect(store.inspectTaskPlan({ bookId, kind: kind === 'review' ? 'review-run' : kind, ref: planRef }).scope.send)
        .toBe('不发送任何内容；这份计划列了资料库资料，当前运行范围不能把它们发送给模型，这份计划不能开始');
    }
    await expect(run()).rejects.toMatchObject(refusalOf(kind));
    expect(sent).toHaveLength(0);
  });

  it('answers a review naming an unknown Book with a coded refusal, the predecessor one under a v11 rule', () => {
    const request = () => store.createReviewRunPreparationWork(randomUUID(), ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [materialId]);
    const admitted = thrown(request);
    expect(admitted).toBeInstanceOf(StoreError);
    expect(admitted).toMatchObject({ code: 'REVIEW_BOOK_NOT_FOUND' });
    deny('review', 'both');
    expect(thrown(request)).toMatchObject(refusalOf('review'));
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
