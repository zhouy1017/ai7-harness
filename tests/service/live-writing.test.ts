// #810: reference-free writing on the real selected Provider Processing v11 projection and the shared admission (#429), over a
// synthetic socket-free transport; no credential, key or manuscript text beyond exact sample1.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
import { liveWritingRule } from '../../src/service/writing/live-writing-admission.js';
import { liveKindAdmission, liveKindContractCategories } from '../../src/service/analysis/live-kind-admission.js';
import { ruleFor, withRepeatedRuleFor, withRuleFor, withoutRuleFor } from '../support/policy-rules.js';
import { writingKindDefinition, writingRecordedKindDefinition } from '../../src/service/writing/writing-kind.js';
import { parseWritingSynthesisMessageHeader, parseWritingUnitMessageHeader, writingSynthesisRequestDigest, type WritingContractInput } from '../../src/service/writing/writing-contract.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ownBlockTextsOf, unitContentDigest } from '../../src/service/provider/local-deterministic-adapter.js';
import { WRITING_LIVE_SEND_CONSEQUENCE, WRITING_SEND_CONSEQUENCE } from '../../src/service/writing-tasks.js';
import { ProviderResultCache, isModelCallLine } from '../../src/service/provider/provider-result-cache.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { BASELINE_ANALYSIS_TASK_GOAL, WRITING_LIVE_UNAVAILABLE, WRITING_MATERIAL_LIVE_UNAVAILABLE, type LaunchPolicyProjection, type WritingProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { WRITING_REQUEST } from '../support/writing-task.js';
import { SET_RULE_DEVELOPER_LIVE, SET_RULE_FIRST_BASELINE } from '../../src/service/default-execution-rules.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/model/', import.meta.url));
let roots: ServiceTestRoots;
/** The recorded live answers a test binds, with the Task contract the synthesis request is keyed under; `null` answers synthetically. */
let recorded: { fixture: ResolvedModelFixture; contract: string } | null;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let sent: number;
let failure: 'none' | 'unknown' | 'quota';
let firstRequest: { url: string; body: string };
let hold: boolean;
let arrived: Promise<void>;
let announce: () => void;
let release: () => void;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-live-writing-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const launch = { operationalScope: 'developer-live' as const, policy, live: { ...DEVELOPER_LIVE_POLICY_BINDING,
    credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } } };
  store.baselineAnalysisLedger.bindLaunch(launch);
  sent = 0;
  failure = 'none';
  hold = false;
  recorded = null;
  arrived = new Promise<void>((resolve) => { announce = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const nativeFetch: typeof fetch = async (url, init) => {
    sent += 1;
    if (sent === 1) {
      firstRequest = { url: String(url), body: String(init?.body) };
      announce();
      if (hold) await held;
    }
    if (sent === 1 && failure === 'unknown') return new Response('{', { status: 200 });
    if (sent === 1 && failure === 'quota') return new Response(JSON.stringify({ error: { message: 'synthetic account limit' } }), { status: 429 });
    const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    expect(request.messages[0]!.content.includes('合成责编')).toBe(false);
    const message = request.messages.at(-1)!.content;
    const replayed = recorded === null ? undefined : recordedEntry(recorded, message);
    if (replayed?.response.kind === 'unit-result') {
      return new Response(JSON.stringify({ model: launch.live.model, choices: [{ message: { content: replayed.response.text, reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: replayed.response.usage.inputTokens, completion_tokens: replayed.response.usage.outputTokens } }), { status: 200 });
    }
    const unit = parseWritingUnitMessageHeader(message);
    const result = unit !== null ? { schema: 'ai7.writing.unit-result/1', unitOrdinal: unit.ordinal,
      passages: [{ kind: 'highlight', note: '合成回归看点。', blockOrdinals: [1] }] }
      : message.startsWith('写作综合 ') ? { schema: 'ai7.writing.synthesis-result/1', title: '合成草稿', sections: [{ heading: '合成部分', paragraphs: ['合成回归草稿，待编辑修改。'] }] }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查草稿。', basis: '合成回归账目。' }] };
    return new Response(JSON.stringify({ model: launch.live.model, choices: [{ message: { content: JSON.stringify(result), reasoning_content: '合成回归。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' }, developerLive: {
      launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'live-writing', case: 'sample1-draft', delta: null } }, nativeFetch,
    } });
});

afterEach(async () => { release?.(); await owner?.dispose(); store?.close(); await roots?.dispose(); });

async function book() {
  const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 live writing');
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported;
}

function prepare(bookId: string, requirements: string | null = null): WritingProjection {
  let progress = store.createWritingPreparationWork(bookId, { ...WRITING_REQUEST, requirements }, policy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!;
}

async function run(bookId: string, prepared: WritingProjection) {
  const authorized = store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
  await owner.whenIdle();
  return store.inspectWriting(bookId)!;
}

/**
 * The recorded live answer to this exact request: a unit by its ordinal and own block texts (a fresh import mints new block
 * identities), the 全书综合 by the request digest its rebuilt passage set gives under the Task's contract. A unit or synthesis the
 * fixture does not answer refuses; anything else — the reflection, which ended outcome-unknown live — stays synthetic.
 */
function recordedEntry(replay: { fixture: ResolvedModelFixture; contract: string }, message: string): ModelFixtureEntry | undefined {
  const unit = parseWritingUnitMessageHeader(message);
  const synthesis = parseWritingSynthesisMessageHeader(message);
  if (unit === null && synthesis === null) return undefined;
  const entry = unit !== null
    ? [...replay.fixture.entries.values()].find((candidate) => candidate.unitOrdinal === unit.ordinal && candidate.contentDigest === unitContentDigest(ownBlockTextsOf(message)))
    : replay.fixture.entries.get(fixtureEntryKey(0, writingSynthesisRequestDigest(replay.contract, synthesis!.setDigest)));
  if (entry === undefined) throw new Error('RECORDED_WRITING_ENTRY_MISSING');
  return entry;
}

/** The recorded draft's words, read from the reviewed fixture so no derivative of them is written here. */
function recordedDraft(fixture: ResolvedModelFixture): { text: string; title: string; firstParagraph: string } {
  const response = [...fixture.entries.values()].find((entry) => entry.unitOrdinal === 0)!.response;
  if (response.kind !== 'unit-result') throw new Error('RECORDED_WRITING_SYNTHESIS_MISSING');
  const draft = JSON.parse(response.text) as { title: string; sections: Array<{ paragraphs: string[] }> };
  return { text: response.text, title: draft.title, firstParagraph: draft.sections[0]!.paragraphs[0]! };
}

describe('reference-free writing on the Go execution path (#810)', () => {
  it('admits exactly one verified writing rule and its binding, failing closed for missing or ambiguous rules', async () => {
    const imported = await book();
    expect(liveWritingRule(policy, DEVELOPER_LIVE_POLICY_BINDING)?.ruleId).toBe('developer-live-public-samplebook-writing');
    expect(store.inspectWritingTask(imported.bookId)).toMatchObject({ unavailable: null, consequences: { send: WRITING_LIVE_SEND_CONSEQUENCE } });
    for (const denied of [withoutRuleFor(policy, 'writing'), withRepeatedRuleFor(policy, 'writing'), withRuleFor(policy, 'writing', { model: 'other' }),
      withRuleFor(policy, 'writing', { crossUnitSynthesisAllowed: false }), withRuleFor(policy, 'writing', { modelRole: 'Fast Interaction Role' }),
      withRuleFor(policy, 'writing', { outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis'] })]) {
      expect(liveWritingRule(denied, DEVELOPER_LIVE_POLICY_BINDING)).toBeNull();
      store.baselineAnalysisLedger.bindLaunch({ ...store.baselineAnalysisLedger.launch, policy: denied });
      expect(store.inspectWritingTask(imported.bookId).unavailable).toBe(WRITING_LIVE_UNAVAILABLE);
      expect(() => prepare(imported.bookId)).toThrowError(WRITING_LIVE_UNAVAILABLE);
    }
    expect(liveWritingRule({ ...policy, integrityState: 'denied' }, DEVELOPER_LIVE_POLICY_BINDING)).toBeNull();
    expect(sent).toBe(0);
  });

  it('keeps provider-free wording and refuses material-bearing live plans in their existing words', async () => {
    const imported = await book();
    const live = store.baselineAnalysisLedger.launch;
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
    expect(store.inspectWritingTask(imported.bookId).consequences.send).toBe(WRITING_SEND_CONSEQUENCE);
    store.baselineAnalysisLedger.bindLaunch(live);
    expect(() => store.createWritingPreparationWork(imported.bookId, { ...WRITING_REQUEST, materialIds: [imported.bookId] }, policy)).toThrowError(WRITING_MATERIAL_LIVE_UNAVAILABLE);
    expect(sent).toBe(0);
  });

  it('freezes redacted inputs, transmits units and records usage without changing the manuscript', async () => {
    const imported = await book();
    store.updateBookPeople({ bookId: imported.bookId, expectedVersion: 0, authors: ['合成作者'], editors: ['合成责编'], related: [] });
    const before = store.baselineAnalysisLedger.readWorkingBlocks(imported.branchId);
    const prepared = prepare(imported.bookId);
    expect(sent).toBe(0);
    const settled = await run(imported.bookId, prepared);
    expect(settled.resultSetRevision!.coverage.unitsClosed).toBe(prepared.coverageManifest!.units.length);
    expect(settled.resultSetRevision!.usage.inputTokens).toBeGreaterThan(0);
    expect(store.baselineAnalysisLedger.readWorkingBlocks(imported.branchId).map((block) => block.digest)).toEqual(before.map((block) => block.digest));
    // The admitted rule names the synthesis turn, so the draft is written live; the reflection follows it.
    expect(settled.resultSetRevision!.writing.draft?.title).toBe('合成草稿');
    expect(sent).toBe(prepared.coverageManifest!.units.length + 2);
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    expect(cache.lines.filter(isModelCallLine).filter((line) => line.outcome === 'transmitted').length).toBe(sent);
  });

  it('offers a default rule for admitted live writing while denied writing and baseline keep their existing reasons', async () => {
    const imported = await book();
    const prepared = prepare(imported.bookId);
    const task = { bookId: imported.bookId, kind: 'writing' as const, ref: prepared.taskIntent!.taskIntentId };
    expect(store.inspectTaskPlan(task).defaultRule).toMatchObject({ canSet: true, reason: null });
    const rule = store.setDefaultExecutionRule(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    expect(rule.ordinal).toBe(1);
    expect(store.inspectWritingTask(imported.bookId).types.find((type) => type.typeId === WRITING_REQUEST.typeId)!.quickStart.reason).toBeNull();
    const live = store.baselineAnalysisLedger.launch;
    store.baselineAnalysisLedger.bindLaunch({ ...live, policy: { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [] } } });
    expect(store.inspectTaskPlan(task).defaultRule).toMatchObject({ canSet: false, reason: SET_RULE_DEVELOPER_LIVE });
    store.baselineAnalysisLedger.bindLaunch(live);
    let progress = store.createBaselineAnalysisPreparationWork(imported.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    expect(store.inspectTaskPlan({ bookId: imported.bookId, kind: 'baseline-analysis', ref: progress.projection!.taskIntent!.taskIntentId }).defaultRule)
      .toMatchObject({ canSet: false, reason: SET_RULE_FIRST_BASELINE });
  });

  it('records every writing transmitOnce item under S84, forwarded by the shared owner', async () => {
    const imported = await book();
    await run(imported.bookId, prepare(imported.bookId));
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    expect(cache.lines.filter(isModelCallLine).every((line) => line.itemId.startsWith('S84/'))).toBe(true);
  });

  it('replays an exact writing request with an S84 ledger item and no transport or incurred usage', async () => {
    const imported = await book();
    const prepared = prepare(imported.bookId);
    await run(imported.bookId, prepared);
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.open();
    const before = sent;
    const response = await transmitOnce(cache, async () => { throw new Error('REPLAY_MUST_NOT_TRANSMIT'); }, {
      slice: 'S84', purpose: 'writing-first', promptContractDigest: prepared.planEnvelope!.promptContractDigest,
      taskPromptContractDigest: prepared.planEnvelope!.promptContractDigest,
    }, { intent: { family: 'live-writing', case: 'sample1-draft', delta: null }, step: 'writing-first/unit-1', requestShape: OPENCODE_GO_V41_FLASH_PROFILE.capabilities.requestShape },
    OPENCODE_GO_ROUTE_PROFILE, DEVELOPER_LIVE_POLICY_BINDING.model, firstRequest.url, { method: 'POST', headers: {}, body: firstRequest.body });
    expect(response.replayed).toBe(true);
    expect(sent).toBe(before);
    const replay = cache.lines.filter(isModelCallLine).at(-1)!;
    expect(replay.itemId.startsWith('S84/')).toBe(true);
    expect(replay.outcome).toBe('replayed');
    expect(replay.incurredUsage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('keeps completed units on cancellation and never starts another turn', async () => {
    hold = true;
    const imported = await book();
    const prepared = prepare(imported.bookId);
    const authorized = store.authorizeWriting(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
    await arrived;
    authorized.ledger.requestCancel(imported.bookId, prepared.taskIntent!.taskIntentId);
    owner.cancelRun(authorized.dispatchRunRecordId!, authorized.ledger);
    release();
    await owner.whenIdle();
    const settled = store.inspectWriting(imported.bookId)!;
    expect(settled.taskOutcome!.classification).toBe('cancelled');
    expect(sent).toBe(1);
    expect(settled.resultSetRevision!.coverage.unitsClosed).toBe(1);
    expect(settled.resultSetRevision!.writing.draft).toBeNull();
  });

  it('keeps the first result and the predecessor lineage when the editor requests a revision', async () => {
    const imported = await book();
    const first = await run(imported.bookId, prepare(imported.bookId));
    const revision = prepare(imported.bookId, '合成修订要求');
    expect(revision.taskIntent!.mode).toBe('writing-again');
    const second = await run(imported.bookId, revision);
    expect(second.resultSetRevision!.ordinal).toBe(2);
    expect(second.resultSetRevision!.update.predecessor?.revisionId).toBe(first.resultSetRevision!.revisionId);
    expect(second.resultSetRevision!.revisionId).not.toBe(first.resultSetRevision!.revisionId);
  });

  it.each(['unknown', 'quota'] as const)('retains %s without retransmitting the settled Run', async (mode) => {
    failure = mode;
    const imported = await book();
    const settled = await run(imported.bookId, prepare(imported.bookId));
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    const failed = cache.lines.filter(isModelCallLine).find((line) => line.classification === (mode === 'unknown' ? 'outcome-unknown' : 'quota-exhausted'));
    expect(failed).toBeDefined();
    if (mode === 'unknown') expect(settled.resultSetRevision!.gaps.some((gap) => gap.code === 'outcome-unknown')).toBe(true);
    else expect(sent).toBe(1);
    const before = sent;
    await owner.whenIdle();
    expect(sent).toBe(before);
  });

  it('admits a frozen writing contract through the shared dispatcher row only as its owner re-derives it, on the exact binding', () => {
    const input: WritingContractInput = { type: { typeId: 'promotion-article', label: '宣传文章' }, book: { title: '合成图书', authors: [], editors: [], series: [] },
      audience: '读者', channel: '纸面', requirements: null, synopsis: null, evaluation: null, exemplars: [] };
    const definition = writingKindDefinition(input);
    const binding = ruleFor(policy, 'writing');
    expect(liveKindAdmission(policy, definition, DEVELOPER_LIVE_POLICY_BINDING)).toEqual({ ruleId: 'developer-live-public-samplebook-writing',
      modelRole: 'Main Editorial Role', outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
      crossUnitSynthesisAllowed: true });
    expect(liveKindContractCategories('writing')).toEqual(['book-metadata-and-synopsis', 'house-exemplar-excerpt']);
    // A replaced digest, a recorded contract the owner cannot rebuild, a missing derivation, a 资料库-bearing contract or a
    // material wrapper refuse; so do a rule without the writing categories and another binding.
    expect(liveKindAdmission(policy, { ...definition, promptContractDigest: 'a'.repeat(64) }, binding)).toBeNull();
    expect(liveKindAdmission(policy, writingRecordedKindDefinition(input, 'b'.repeat(64), 2), binding)).toBeNull();
    const { livePromptContractDigest: _derive, ...withoutDerivation } = definition;
    expect(liveKindAdmission(policy, withoutDerivation, binding)).toBeNull();
    expect(liveKindAdmission(policy, writingKindDefinition({ ...input, materials: [{ title: '合成资料', paragraphs: ['合成资料段落。'] }] }), binding)).toBeNull();
    expect(liveKindAdmission(policy, { ...definition, materialReferences: {} }, binding)).toBeNull();
    expect(liveKindAdmission(withRuleFor(policy, 'writing', { outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis'] }), definition, binding)).toBeNull();
    expect(liveKindAdmission(policy, definition, { ...binding, model: 'another-model' })).toBeNull();
  });

  it('replays the recorded live draft and revision through the same contracts, outcomes and usage (#810 evidence)', async () => {
    // Recorded units and syntheses answer; both reflection turns ended outcome-unknown live and are answered synthetically
    // here. This regression sends nothing and asserts no editorial quality.
    const draftFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-writing-draft');
    const revisionFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-writing-revision');
    for (const fixture of [draftFixture, revisionFixture]) {
      expect(fixture.provenance).toBe('recorded');
      expect([...fixture.entries.values()].every((entry) => entry.capture?.model === DEVELOPER_LIVE_POLICY_BINDING.model && entry.capture.itemId.startsWith('S84/'))).toBe(true);
    }
    // The evidence Book's title and the editor's words of the live Tasks rebuild the exact recorded contracts.
    const imported = await importSample1Book(store, roots.codeRoot, 'sample1 writing evidence');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    const draft = prepare(imported.bookId);
    expect(draft.planEnvelope!.promptContractDigest).toBe('474768c3d789ff61b8c15ff04c8b659fcaf9fc6fe9378f67fcd0efad14a9bcf4');
    recorded = { fixture: draftFixture, contract: draft.planEnvelope!.promptContractDigest };
    const first = (await run(imported.bookId, draft)).resultSetRevision!;
    expect(first.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    expect(first.gaps).toEqual([]);
    expect(first.writing.draft?.title).toBe(recordedDraft(draftFixture).title);
    expect(first.usage).toEqual({ requests: 9, inputTokens: 16_974, outputTokens: 29_552 });
    const revision = prepare(imported.bookId, '篇幅控制在八百字以内，开头先写故事的悬念，不剧透结局。');
    expect(revision.taskIntent!.mode).toBe('writing-again');
    expect(revision.planEnvelope!.promptContractDigest).toBe('9b2ef12ecd8d6927c19a3d49e66d7f1fffc9af9fffd3f85177ee4f2fcf8da282');
    recorded = { fixture: revisionFixture, contract: revision.planEnvelope!.promptContractDigest };
    const second = (await run(imported.bookId, revision)).resultSetRevision!;
    expect(second.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    expect(second.writing.draft?.title).toBe(recordedDraft(revisionFixture).title);
    expect(second.update.predecessor?.revisionId).toBe(first.revisionId);
    expect(second.usage).toEqual({ requests: 9, inputTokens: 16_719, outputTokens: 24_700 });
    // Eight units, the synthesis and the reflection per Run; every item under S84.
    expect(sent).toBe(20);
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    expect(cache.lines.filter(isModelCallLine).every((line) => line.itemId.startsWith('S84/'))).toBe(true);
  }, 120_000);

  it('judges the recorded real draft by the copy rules: admitted as it is, withheld when a 范例 or 资料 holds its words', async () => {
    const recordedWords = recordedDraft(await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-writing-draft'));
    const input: WritingContractInput = { type: { typeId: 'promotion-article', label: '宣传文章' }, book: { title: '合成图书', authors: [], editors: [], series: [] },
      audience: '读者', channel: '纸面', requirements: null, synopsis: null, evaluation: null, exemplars: [] };
    expect(writingKindDefinition(input).crossUnit!.step!.parse(recordedWords.text, [])).toMatchObject({ ok: true });
    const exemplar = { bookTitle: '合成范例', version: 1, excerpt: false, text: recordedWords.firstParagraph };
    expect(writingKindDefinition({ ...input, exemplars: [exemplar] }).crossUnit!.step!.parse(recordedWords.text, [])).toMatchObject({ ok: false, code: 'exemplar-copied' });
    expect(writingKindDefinition({ ...input, materials: [{ title: '合成资料', paragraphs: [recordedWords.firstParagraph] }] }).crossUnit!.step!.parse(recordedWords.text, []))
      .toMatchObject({ ok: false, code: 'material-copied' });
  });

  it('withholds copied real-format synthesis output under the existing exemplar and material rules', () => {
    const text = '这是仅属于参照作品的一段连续文字不能作为草稿直接抄写';
    const input: WritingContractInput = { type: { typeId: 'promotion-article', label: '宣传文章' }, book: { title: '合成图书', authors: [], editors: [], series: [] },
      audience: '读者', channel: '纸面', requirements: null, synopsis: null, evaluation: null,
      exemplars: [{ bookTitle: '合成范例', version: 1, excerpt: false, text }] };
    const output = JSON.stringify({ schema: 'ai7.writing.synthesis-result/1', title: '合成草稿', sections: [{ heading: '内容', paragraphs: [text] }] });
    expect(writingKindDefinition(input).crossUnit!.step!.parse(output, [])).toMatchObject({ ok: false, code: 'exemplar-copied' });
    expect(writingKindDefinition({ ...input, exemplars: [], materials: [{ title: '合成资料', paragraphs: [text] }] }).crossUnit!.step!.parse(output, [])).toMatchObject({ ok: false, code: 'material-copied' });
  });
});
