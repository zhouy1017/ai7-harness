import { execPre74Fixture } from '../support/pre74-schema.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { globalAttentionReason } from '../../src/renderer/global-attention-labels.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { BaselineAnalysisExecutionOwner, holdsGovernorSlot } from '../../src/service/analysis/execution.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { buildClarificationAnswerMessage, clarificationMessageRequestDigest } from '../../src/service/provider/clarification-contract.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

const QUESTION = { question: '本范围按哪个阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true };
let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let happy: ResolvedModelFixture;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-model-clarification-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  happy = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-baseline-happy');
});
afterEach(async () => { await owner?.dispose(); store?.close(); await roots.dispose(); store = undefined; owner = undefined; });

async function start(allowed = true): Promise<{ bookId: string; taskIntentId: string; runRecordId: string; entries: Map<string, ModelFixtureEntry> }> {
  const entries = new Map(happy.entries);
  const fixture = { ...happy, identity: allowed ? 'sample1-model-clarification-test' : happy.identity, entries };
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: {
    fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage,
  }, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const { bookId } = await importSample1Book(store, roots.codeRoot, '模型问题');
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 connection');
  let work = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
  while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
  const prepared = work.projection!;
  const definition = store.baselineAnalysisLedger.definition;
  for (const unit of prepared.coverageManifest!.units) {
    const base = [...happy.entries.values()].find((entry) => entry.unitOrdinal === unit.ordinal)!;
    const digest = definition.requestDigest(unit.ordinal, unit.digest);
    entries.set(fixtureEntryKey(unit.ordinal, digest), { ...base, requestDigest: digest,
      response: unit.ordinal === 1 ? { kind: 'unit-result', text: JSON.stringify(QUESTION), usage: { inputTokens: 10, outputTokens: 5 } } : base.response });
  }
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture,
    secretResolver: { resolve: async () => null }, capacity: 1 });
  owner.admitAndDispatch(runRecordId);
  await owner.whenIdle();
  return { bookId, taskIntentId, runRecordId, entries };
}

function answerEntry(run: Awaited<ReturnType<typeof start>>, secondQuestion = false): string {
  const ledger = store!.baselineAnalysisLedger;
  const request = ledger.clarificationsOf(run.runRecordId)[0]!;
  const facts = ledger.loadExecutionPlan(run.runRecordId);
  const unit = facts.manifest.units[0]!;
  const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
  const message = buildClarificationAnswerMessage(ledger.definition.buildUnitMessage(unit, facts.manifest.units.length,
    new Map(blocks.map((block) => [block.blockId, block]))), request);
  const base = [...happy.entries.values()].find((entry) => entry.unitOrdinal === 1)!;
  const digest = clarificationMessageRequestDigest(message)!;
  run.entries.set(fixtureEntryKey(1, digest), { ...base, requestDigest: digest,
    ...(secondQuestion ? { response: { kind: 'unit-result' as const, text: JSON.stringify(QUESTION), usage: { inputTokens: 10, outputTokens: 5 } } } : {}) });
  return message;
}

describe('one model question per Run unit', () => {
  it('opens and reopens the additive schema without changing the ledger', async () => {
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close(); store = undefined;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  });
  it('adds only the nullable question column to revision 72, preserving a product request byte for byte', async () => {
    const run = await start(false);
    const ledger = store!.baselineAnalysisLedger;
    const facts = ledger.loadExecutionPlan(run.runRecordId);
    ledger.recordClarificationRequest({ runRecordId: run.runRecordId, taskIntentId: run.taskIntentId, attemptId: randomUUID(), unitOrdinal: 2,
      planVersion: facts.planVersionOrdinal, planEnvelopeDigest: facts.planEnvelopeDigest, requestDigest: 'a'.repeat(64),
      failure: { code: 'SYNTHETIC_RETRY', failureClass: 'provider', status: 503, reason: '合成暂时错误' },
      firstPayloadDigest: null, firstUnitMessageDigest: 'b'.repeat(64), firstUsage: null, firstWallMs: 1 });
    await owner!.dispose(); owner = undefined;
    store!.close(); store = undefined;
    const db = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'));
    const before = db.prepare('SELECT request_id, canonical_json, sha256 FROM analysis_clarification_requests').all();
    execPre74Fixture(db, 'ALTER TABLE analysis_clarification_requests DROP COLUMN model_question_json; PRAGMA user_version = 72');
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const read = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      // Synchronized delta with Issue #901: revision 78 (factual verification) is the terminal version.
      expect(read.prepare('PRAGMA user_version').get()!.user_version).toBe(78);
      expect(read.prepare('SELECT request_id, canonical_json, sha256 FROM analysis_clarification_requests').all()).toEqual(before);
      expect(read.prepare('SELECT model_question_json FROM analysis_clarification_requests').get()!.model_question_json).toBeNull();
    } finally { read.close(); }
    // SQLite records the added column's text in place, not as revision 73 creates it; the migrated store must still open.
    store!.close(); store = undefined;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.baselineAnalysisLedger.clarificationsOf(run.runRecordId)).toHaveLength(1);
  });
  it('keeps the other seven units, releases its slot, answers once and removes only the decision item', async () => {
    const run = await start();
    expect(store!.inspectBaselineAnalysis(run.bookId).run!.state).toBe('awaiting-clarification');
    expect(store!.baselineAnalysisLedger.unitCheckpoints(run.runRecordId)).toHaveLength(7);
    expect(owner!.busy).toBe(false);
    expect(holdsGovernorSlot('awaiting-clarification')).toBe(false);
    const attention = store!.inspectGlobalAttention(() => null, false);
    expect(attention.groups.find((group) => group.key === 'decisions')!.items).toHaveLength(1);
    expect(globalAttentionReason(attention.groups.find((group) => group.key === 'decisions')!.items[0]!)).toContain('模型有一个需要你决定的问题');
    const card = store!.inspectTaskPlan({ bookId: run.bookId, kind: 'baseline-analysis', ref: run.taskIntentId }).clarifications[0]!;
    expect(card).toMatchObject({ origin: 'model', question: QUESTION.question, freeTextAllowed: true });
    store!.answerBaselineAnalysisClarification({ ...run, requestId: card.requestId, optionId: 'model-option-0', note: null });
    expect(answerEntry(run)).toContain('"answer":"人物"');
    owner!.continueAnswered(run.runRecordId);
    await owner!.whenIdle();
    const done = store!.inspectBaselineAnalysis(run.bookId);
    expect(done.resultSetRevision!.units.filter((unit) => unit.state === 'closed')).toHaveLength(8);
    expect(done.run!.attempt!.spans).toHaveLength(9);
    expect(done.run!.adaptations).toHaveLength(0);
    expect(store!.inspectGlobalAttention(() => null, false).groups.find((group) => group.key === 'decisions')!.items).toHaveLength(0);
    expect(() => store!.answerBaselineAnalysisClarification({ ...run, requestId: card.requestId, optionId: 'model-option-1', note: null })).toThrow();
  });
  it('keeps a safe-retry question to its own two answers and S76d words beside a model question', async () => {
    const run = await start();
    const ledger = store!.baselineAnalysisLedger;
    const facts = ledger.loadExecutionPlan(run.runRecordId);
    const requestId = ledger.recordClarificationRequest({ runRecordId: run.runRecordId, taskIntentId: run.taskIntentId, attemptId: randomUUID(), unitOrdinal: 2,
      planVersion: facts.planVersionOrdinal, planEnvelopeDigest: facts.planEnvelopeDigest, requestDigest: 'a'.repeat(64),
      failure: { code: 'SYNTHETIC_RETRY', failureClass: 'provider', status: 503, reason: '合成暂时错误' },
      firstPayloadDigest: null, firstUnitMessageDigest: 'b'.repeat(64), firstUsage: null, firstWallMs: 1 });
    for (const optionId of ['model-option-0', 'free-text', 'no-answer'] as const) {
      expect(() => store!.answerBaselineAnalysisClarification({ ...run, requestId, optionId, note: optionId === 'free-text' ? '合成说明' : null }))
        .toThrowError('请选择一个回答。');
    }
    expect(ledger.clarificationsOf(run.runRecordId).find((entry) => entry.requestId === requestId)).toMatchObject({ answer: null });
    expect(ledger.clarificationsOf(run.runRecordId).find((entry) => entry.requestId === requestId)!.origin).toBeUndefined();
  });
  it('treats a second model question as contract-invalid', async () => {
    const run = await start();
    const request = store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)[0]!;
    store!.answerBaselineAnalysisClarification({ ...run, requestId: request.requestId, optionId: 'free-text', note: '按人物处理' });
    answerEntry(run, true);
    owner!.continueAnswered(run.runRecordId);
    await owner!.whenIdle();
    expect(store!.inspectBaselineAnalysis(run.bookId).resultSetRevision!.gaps).toContainEqual(expect.objectContaining({ unitOrdinal: 1, code: 'contract-invalid' }));
    expect(store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)).toHaveLength(1);
  });
  it('accepts 500 composed graphemes and refuses 501 before recording a free-text answer', async () => {
    const run = await start();
    const request = store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)[0]!;
    expect(() => store!.answerBaselineAnalysisClarification({ ...run, requestId: request.requestId, optionId: 'free-text', note: '👩🏽‍💻'.repeat(501) })).toThrow();
    expect(store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)[0]!.answer).toBeNull();
    store!.answerBaselineAnalysisClarification({ ...run, requestId: request.requestId, optionId: 'free-text', note: '👩🏽‍💻'.repeat(500) });
    expect(store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)[0]!.answer!.note).toBe('👩🏽‍💻'.repeat(500));
  });
  it('never resends a claimed answer turn left without a settled checkpoint', async () => {
    const run = await start();
    const ledger = store!.baselineAnalysisLedger;
    const request = ledger.clarificationsOf(run.runRecordId)[0]!;
    store!.answerBaselineAnalysisClarification({ ...run, requestId: request.requestId, optionId: 'no-answer', note: null });
    expect(ledger.claimModelClarificationAnswer(run.runRecordId, request.requestId)).toBe(true);
    ledger.recordRunState(run.runRecordId, 'awaiting-clarification', { detail: '合成重启边界' });
    owner!.continueAnswered(run.runRecordId);
    await owner!.whenIdle();
    expect(store!.inspectBaselineAnalysis(run.bookId).run!.attempt!.spans).toHaveLength(8);
    expect(ledger.unitCheckpoints(run.runRecordId).find((entry) => entry.unit.unitOrdinal === 1)?.unit.closed)
      .toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
  });
  it('expires after exactly 24 hours and tells the model 不回答, disclosed by the Run Report', async () => {
    const run = await start();
    const ledger = store!.baselineAnalysisLedger;
    const request = ledger.clarificationsOf(run.runRecordId)[0]!;
    const expires = Date.parse(request.raisedAt) + 24 * 3_600_000;
    expect(ledger.expireModelClarifications(run.runRecordId, expires - 1)).toBe(0);
    expect(ledger.expireModelClarifications(run.runRecordId, expires)).toBe(1);
    expect(ledger.expireModelClarifications(run.runRecordId, expires + 1)).toBe(0);
    expect(answerEntry(run)).toContain('"answer":"不回答"');
    owner!.continueAnswered(run.runRecordId);
    await owner!.whenIdle();
    const done = store!.inspectBaselineAnalysis(run.bookId);
    // The disclosure says the service clock answered, not the editor; the drawer card says the same.
    expect(done.taskOutcome!.report!.modelClarifications).toEqual([expect.objectContaining({ unitOrdinal: 1, outcome: 'timed-out', line: expect.stringContaining('24 小时未回答') })]);
    const card = store!.inspectTaskPlan({ bookId: run.bookId, kind: 'baseline-analysis', ref: run.taskIntentId }).clarifications[0]!;
    expect(card.answer!.line).toContain('24 小时未回答');
    expect(card.answer!.line).not.toContain('你已回答');
  });
  it('reports an editor-chosen 不回答 as the editor’s choice, never as the timeout', async () => {
    const run = await start();
    const request = store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)[0]!;
    store!.answerBaselineAnalysisClarification({ ...run, requestId: request.requestId, optionId: 'no-answer', note: null });
    expect(answerEntry(run)).toContain('"answer":"不回答"');
    owner!.continueAnswered(run.runRecordId);
    await owner!.whenIdle();
    const done = store!.inspectBaselineAnalysis(run.bookId);
    expect(done.taskOutcome!.report!.modelClarifications).toEqual([expect.objectContaining({ unitOrdinal: 1, outcome: 'no-answer', line: expect.stringContaining('你选择了不回答') })]);
    expect(done.taskOutcome!.report!.modelClarifications![0]!.line).not.toContain('24 小时');
    expect(store!.inspectTaskPlan({ bookId: run.bookId, kind: 'baseline-analysis', ref: run.taskIntentId }).clarifications[0]!.answer!.line).toBe('你已回答：不回答');
  });
  it('keeps completed units on cancel while the model question waits', async () => {
    const run = await start();
    store!.requestBaselineAnalysisCancel(run.bookId, run.taskIntentId);
    owner!.cancelRun(run.runRecordId);
    await owner!.whenIdle();
    const done = store!.inspectBaselineAnalysis(run.bookId);
    expect(done.taskOutcome!.classification).toBe('cancelled');
    expect(done.resultSetRevision!.units.filter((unit) => unit.state === 'closed')).toHaveLength(7);
  });
  it('never waits for a question on the predecessor contract without admission', async () => {
    const run = await start(false);
    const done = store!.inspectBaselineAnalysis(run.bookId);
    expect(done.run!.state).not.toBe('awaiting-clarification');
    expect(done.resultSetRevision!.gaps).toContainEqual(expect.objectContaining({ unitOrdinal: 1, code: 'contract-invalid' }));
    expect(store!.baselineAnalysisLedger.clarificationsOf(run.runRecordId)).toHaveLength(0);
  });
  it.each([true, false])('uses the non-baseline ledger and its one rule (clarification allowed: %s)', async (allowed) => {
    const selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    const livePolicy = { ...selected, providerProcessing: { ...selected.providerProcessing,
      admittedRules: selected.providerProcessing.admittedRules!.map((rule) => ({ ...rule,
        clarificationQuestionAllowed: allowed, clarificationTimeoutHours: 24,
      })),
    } };
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const ceiling = { kind: 'tokens' as const, maxTotalTokens: 500_000 };
    const launch = { operationalScope: 'developer-live' as const, policy: livePolicy, live: { ...DEVELOPER_LIVE_POLICY_BINDING,
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: ceiling,
    } };
    store.baselineAnalysisLedger.bindLaunch(launch);
    store.initialEvaluationLedger.bindLaunch(launch);
    const { bookId } = await importSample1Book(store, roots.codeRoot, '非基线模型问题');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'L2 connection');
    const answers = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-evaluation-authored');
    const sent: string[] = [];
    const nativeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init!.body)) as { messages: Array<{ content: string }> };
      const text = body.messages.at(-1)!.content;
      sent.push(text);
      const header = /^评估(单元|综合) (\d+)\//u.exec(text);
      const ordinal = header?.[1] === '单元' ? Number(header[2]) : 0;
      const schema = header?.[1] === '单元' ? 'ai7.evaluation.unit-result/' : 'ai7.evaluation.synthesis-result/';
      const entry = [...answers.entries.values()].find((item) => item.unitOrdinal === ordinal && item.response.kind === 'unit-result' && item.response.text.includes(schema));
      const answer = ordinal === 1 && !text.includes('澄清回答 /2') ? JSON.stringify(QUESTION)
        : entry?.response.kind === 'unit-result' ? entry.response.text : '{"schema":"ai7.analysis.run-report-reflection-result/1","items":[]}';
      return new Response(JSON.stringify({ choices: [{ message: { content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    };
    owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: livePolicy, fixture: null,
      secretResolver: { resolve: async () => 'synthetic-provider-free-key' },
      developerLive: { launch: { runBudgetCeiling: ceiling, providerCacheRoot: resolve(roots.inputRoot, 'cache'),
        validation: { family: 'model-clarification-initial', case: allowed ? 'allowed' : 'denied', delta: null } }, nativeFetch },
    });
    let work = store.createInitialEvaluationPreparationWork(bookId, livePolicy);
    while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
    const prepared = work.projection!;
    const taskIntentId = prepared.taskIntent!.taskIntentId;
    const run = store.authorizeInitialEvaluation(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    owner.admitAndDispatch(run, store.initialEvaluationLedger);
    await owner.whenIdle();
    if (!allowed) {
      expect(store.initialEvaluationLedger.clarificationsOf(run)).toHaveLength(0);
      expect(store.inspectInitialEvaluation(bookId).run!.state).not.toBe('awaiting-clarification');
      expect(sent.filter((text) => text.includes('澄清回答 /2'))).toHaveLength(0);
      return;
    }
    expect(store.inspectInitialEvaluation(bookId).run!.state).toBe('awaiting-clarification');
    const plan = store.inspectTaskPlan({ bookId, kind: 'initial-evaluation', ref: taskIntentId });
    expect(plan.clarifications).toHaveLength(1);
    expect(store.inspectGlobalAttention(() => null, false).groups.find((group) => group.key === 'decisions')!.items)
      .toContainEqual(expect.objectContaining({ state: 'analysis-clarification', target: { kind: 'task-plan', bookId, taskKind: 'initial-evaluation', ref: taskIntentId } }));
    // One item for the Task, whichever reading carries it: the run-control reading (#870) and the question are never listed twice.
    const listed = store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items).filter((item) => item.itemId === `task:${taskIntentId}`);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ state: 'analysis-clarification', facts: { clarificationOrigin: 'model' } });
    store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: plan.clarifications[0]!.requestId, optionId: 'model-option-0', note: null });
    const ledger = store.clarificationLedger(bookId, taskIntentId);
    expect(ledger.kind).toBe('evaluation');
    owner.continueAnswered(run, ledger);
    await owner.whenIdle();
    expect(sent.filter((text) => text.includes('澄清回答 /2'))).toHaveLength(1);
    expect(store.inspectInitialEvaluation(bookId).resultSetRevision!.units.filter((unit) => unit.state === 'closed')).toHaveLength(8);
  });
});
