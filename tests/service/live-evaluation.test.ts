import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { INITIAL_EVALUATION_LIVE_UNAVAILABLE } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { EVALUATION_UNVERIFIED_DISCLOSURE } from '../../src/service/evaluation/unverified-disclosure.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ProviderResultCache, isModelCallLine, type ProviderLedgerLine } from '../../src/service/provider/provider-result-cache.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import {
  EVALUATION_REWRITE_LIVE_UNAVAILABLE,
  READERS_REPORT_LIVE_UNAVAILABLE,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { AUTHORED_REWRITE_WORDS, beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { ruleFor, withRuleFor, withoutRuleFor, withSeriesKnowledgeFor } from '../support/policy-rules.js';
import { makeJ13Series, J13_SERIES_TITLE } from '../support/series-consistency.js';
import { AUTHORED_SECTIONS, finalizeAsJ11 } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1, SAMPLE1_UNITS } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// #429 / J-11: AI7 初评, 审稿意见 and 按我的评分重写评语 on the Go execution path — the real store, ledger, execution owner, broker,
// adapter, Egress Gate, accounting and Provider Test Ledger — under developer-live with the selected Provider Processing v11
// evaluation rule. The transport answers with the authored J-11 fixtures' texts in the real
// route's JSON shape, without a socket or credential; nothing asserts editorial quality and nothing prints manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let selected: LaunchPolicyProjection;
let store: EditorialStore;
let bookId: string;
let sent: number;
let failure: 'none' | 'unknown' | 'quota';
let mismatchConclusion: boolean;
let holdTurn: number | null;
/** Run once after the store's Series guard answered, before the next transmission step can ask it again. */
let afterSeriesGuard: (() => void) | null;
let arrived: Promise<void>;
let held: Promise<void>;
let announce: () => void;
let release: () => void;
let activeRun: { owner: BaselineAnalysisExecutionOwner; ledger: BaselineAnalysisStore; runRecordId: string; taskIntentId: string };
let activeFamily: string;
let authored: { initial: ResolvedModelFixture; readers: ResolvedModelFixture; rewrite: ResolvedModelFixture };
/** The live captures of #429 (2026-10-14), answering 初评 and 审稿意见 in place of the authored texts when set. */
let recorded: { initial: ResolvedModelFixture; readers: ResolvedModelFixture; rewrite: ResolvedModelFixture } | null;
const owners: BaselineAnalysisExecutionOwner[] = [];
const ceiling = { kind: 'tokens' as const, maxTotalTokens: 500_000 };

/** The launch as the service entry binds it: the baseline ledger, and the 初评 ledger every house profile's is bound through. */
function bindLive(policy: LaunchPolicyProjection): void {
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: {
      route: DEVELOPER_LIVE_POLICY_BINDING.route, endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      model: DEVELOPER_LIVE_POLICY_BINDING.model, credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: ceiling,
    },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.initialEvaluationLedger.bindLaunch(launch);
}

/** The header each contract writes, and the schema its answers carry; a fixture also holds the entries it is based on. */
const CONTRACTS = { 评估: 'ai7.evaluation', 审稿意见: 'ai7.readers-report', 评语重写: 'ai7.evaluation-rewrite' } as const;

/** The authored answer to one message: its contract by its own header, its unit by ordinal, the synthesis under ordinal 0. */
function answerOf(message: string): { text: string; usage: { inputTokens: number; outputTokens: number } } {
  const header = /^(评估|审稿意见|评语重写)(单元|综合) (\d+)\//u.exec(message);
  if (header === null) {
    const fixture = activeFamily === 'evaluation-initial' ? recorded?.initial : activeFamily === 'evaluation-readers-report' ? recorded?.readers : recorded?.rewrite;
    const reflection = [...(fixture?.entries.values() ?? [])].find((entry) => entry.capture?.subject === 'reflection');
    if (reflection?.response.kind === 'unit-result') return { text: reflection.response.text, usage: reflection.response.usage };
    // The rewrite retry captured no reflection; its reflection and authored runs use synthetic accounting text.
    return { text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查依据不足的评分项。', basis: '合成回归账目。' }] }), usage: { inputTokens: 40, outputTokens: 20 } };
  }
  const contract = header[1] as keyof typeof CONTRACTS;
  const synthesis = header[2] === '综合';
  const live = contract === '评估' ? recorded?.initial : contract === '审稿意见' ? recorded?.readers : recorded?.rewrite;
  // A recorded capture says what it answered; an authored fixture is read by its contract's schema, since it also holds
  // the baseline entries it is based on.
  const schema = `{"schema":"${CONTRACTS[contract]}.${synthesis ? 'synthesis' : 'unit'}-result/`;
  const fixture = live ?? (contract === '评估' ? authored.initial : contract === '审稿意见' ? authored.readers : authored.rewrite);
  const entry = [...fixture.entries.values()].find((candidate) => candidate.response.kind === 'unit-result' &&
    (live === undefined ? candidate.response.text.startsWith(schema) : candidate.capture?.subject === (synthesis ? 'task-synthesis' : contract === '评估' ? 'evaluation-unit' : contract === '审稿意见' ? 'readers-unit' : 'rewrite-unit')) &&
    candidate.unitOrdinal === (synthesis ? 0 : Number(header[3])));
  if (entry?.response.kind !== 'unit-result') throw new Error('AUTHORED_EVALUATION_ANSWER_MISSING');
  const text = synthesis && mismatchConclusion && header[1] === '审稿意见' ? entry.response.text.replace('修改后再议', '同意出版') : entry.response.text;
  return { text, usage: entry.response.usage };
}

const nativeFetch: typeof fetch = async (_url, init) => {
  sent += 1;
  if (sent === holdTurn) {
    announce();
    await held;
    if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
  }
  if (sent === 1 && failure === 'unknown') return new Response('{', { status: 200 });
  if (sent === 1 && failure === 'quota') return new Response(JSON.stringify({ error: { message: 'synthetic account limit' } }), { status: 429 });
  const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
  expect(body.messages.some((message) => message.content.includes(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(false);
  const answer = answerOf(body.messages.at(-1)!.content);
  return new Response(JSON.stringify({
    model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { content: answer.text, reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: answer.usage.inputTokens, completion_tokens: answer.usage.outputTokens },
  }), { status: 200 });
};

/** One owner per contract, as each live evidence launch names its own validation family. */
function liveOwner(policy: LaunchPolicyProjection, family: string): BaselineAnalysisExecutionOwner {
  activeFamily = family;
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    seriesScopeGuard: (runRecordId) => {
      const answer = store.seriesScopeGuard(runRecordId);
      const after = afterSeriesGuard;
      afterSeriesGuard = null;
      after?.();
      return answer;
    },
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: ceiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family, case: 'sample1-whole-book', delta: null } }, nativeFetch },
  });
  owners.push(owner);
  return owner;
}

async function ledgerLines(): Promise<ProviderLedgerLine[]> {
  const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
  await cache.refresh();
  return cache.lines.filter(isModelCallLine);
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

async function runInitial(policy: LaunchPolicyProjection, seriesId: string | null = null): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-initial');
  let progress = store.createInitialEvaluationPreparationWork(bookId, policy, [], null, seriesId);
  while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  activeRun = { owner, ledger: authorized.ledger, runRecordId: authorized.dispatchRunRecordId!, taskIntentId: prepared.taskIntent!.taskIntentId };
  expect(owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await owner.whenIdle();
}

async function draftReport(policy: LaunchPolicyProjection): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-readers-report');
  let progress = store.createReadersReportPreparationWork(bookId, 'author', policy);
  while (!progress.done) progress = store.advanceReadersReportPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeReadersReport(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  activeRun = { owner, ledger: authorized.ledger, runRecordId: authorized.dispatchRunRecordId!, taskIntentId: prepared.taskIntent!.taskIntentId };
  expect(owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await owner.whenIdle();
}

async function rewrite(policy: LaunchPolicyProjection, recordId: string): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-rewrite');
  let progress = store.createEvaluationRewritePreparationWork(bookId, recordId, policy);
  while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeEvaluationRewrite(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  activeRun = { owner, ledger: authorized.ledger, runRecordId: authorized.dispatchRunRecordId!, taskIntentId: prepared.taskIntent!.taskIntentId };
  expect(owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await owner.whenIdle();
}

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-live-evaluation-');
  await requireExactSample1(roots.codeRoot);
  selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  authored = {
    initial: await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored'),
    readers: await loadModelFixture(FIXTURES_ROOT, 'sample1-readers-report-authored'),
    rewrite: await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-rewrite-authored'),
  };
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  bindLive(selected);
  sent = 0;
  failure = 'none';
  mismatchConclusion = false;
  recorded = null;
  holdTurn = null;
  afterSeriesGuard = null;
  arrived = new Promise<void>((resolve) => { announce = resolve; });
  held = new Promise<void>((resolve) => { release = resolve; });
  const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 live evaluation');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
});

afterEach(async () => {
  release?.();
  for (const owner of owners.splice(0)) await owner.dispose();
  store?.close();
  await roots?.dispose();
});

/** Reach each contract's own prerequisite through the product, then measure that contract alone. */
async function contractCase(kind: 'initial' | 'readers' | 'rewrite') {
  if (kind !== 'initial') {
    await runInitial(selected);
    finalizeAsJ11(store, bookId);
  }
  const recordId = kind === 'rewrite' ? beginRewriteAsJ11(store, bookId).recordId : null;
  sent = 0;
  return {
    run: () => kind === 'initial' ? runInitial(selected) : kind === 'readers' ? draftReport(selected) : rewrite(selected, recordId!),
    inspect: () => kind === 'initial' ? store.inspectInitialEvaluation(bookId) : kind === 'readers' ? store.inspectReadersReport(bookId)! : store.inspectEvaluationRewrite(bookId)!,
    purpose: kind === 'initial' ? 'evaluation-first' : kind === 'readers' ? 'readers-report-first' : 'evaluation-rewrite-first',
  };
}

describe('evaluation on the Go execution path (#429)', () => {
  it.each([1, SAMPLE1_UNITS])('stops the Series evaluation after %s admitted unit reads, before the next unit or synthesis can transmit', async (units) => {
    const seriesId = makeJ13Series(store, bookId);
    const policy = withSeriesKnowledgeFor(selected, 'evaluation');
    bindLive(policy);
    holdTurn = units;
    const running = runInitial(policy, seriesId);
    await arrived;
    const itemId = store.inspectSeries(seriesId).knowledge.items[0]!.itemId;
    const request = { seriesId, action: 'add' as const, exclusionId: null, target: { kind: 'knowledge-item' as const, id: itemId }, reason: '' };
    const preview = store.previewSeriesExclusion(request);
    store.recordSeriesExclusion({ ...request, previewDigest: preview.previewDigest });
    release();
    await running;
    const stopped = store.inspectInitialEvaluation(bookId);
    expect(stopped.run!.state).toBe('interrupted');
    expect(stopped.run!.transitions.at(-1)!.detail).toContain('书系检索范围已变化');
    expect(sent).toBe(units);
    expect(stopped.taskOutcome!.report!.usagePerStage['cross-unit-reduction'].requests).toBe(0);
  });
  it('refuses at the final gate a payload assembled after the range check admitted it, so the exclusion sends nothing', async () => {
    const seriesId = makeJ13Series(store, bookId);
    const policy = withSeriesKnowledgeFor(selected, 'evaluation');
    bindLive(policy);
    const itemId = store.inspectSeries(seriesId).knowledge.items[0]!.itemId;
    // The first range's boundary check answers "nothing excluded"; the exclusion lands while that range's payload is assembled,
    // so only the Egress Gate's own recheck stands between it and the synthetic transport.
    afterSeriesGuard = () => {
      const request = { seriesId, action: 'add' as const, exclusionId: null, target: { kind: 'knowledge-item' as const, id: itemId }, reason: '' };
      store.recordSeriesExclusion({ ...request, previewDigest: store.previewSeriesExclusion(request).previewDigest });
    };
    await runInitial(policy, seriesId);
    expect(afterSeriesGuard).toBeNull();
    const stopped = store.inspectInitialEvaluation(bookId);
    expect(sent).toBe(0);
    expect(stopped.run!.state).toBe('interrupted');
    expect(stopped.run!.transitions.at(-1)!.detail).toContain('书系检索范围已变化');
    expect(stopped.runSourceScope!.seriesScopes![0]!.knowledge.map((pin) => pin.itemId)).toEqual([itemId]);
  });
  it('executes the Series-scoped evaluation through a synthetic transport and keeps completed history readable after exclusion', async () => {
    const seriesId = makeJ13Series(store, bookId);
    const policy = withSeriesKnowledgeFor(selected, 'evaluation');
    bindLive(policy);
    await runInitial(policy, seriesId);
    const completed = store.inspectInitialEvaluation(bookId);
    expect(completed.run!.state).toBe('completed');
    expect(completed.resultSetRevision!.evaluation.synthesis.state).toBe('closed');
    expect(completed.runSourceScope!.seriesScopes![0]!.title).toBe(J13_SERIES_TITLE);
    const itemId = completed.runSourceScope!.seriesScopes![0]!.knowledge[0]!.itemId;
    const request = { seriesId, action: 'add' as const, exclusionId: null, target: { kind: 'knowledge-item' as const, id: itemId }, reason: '' };
    const preview = store.previewSeriesExclusion(request);
    store.recordSeriesExclusion({ ...request, previewDigest: preview.previewDigest });
    const opened = store.inspectInitialEvaluation(bookId);
    expect(opened.resultSetRevision).toEqual(completed.resultSetRevision);
    expect(opened.historicalMarker).toBe('此结果使用的材料后来被排除');
    expect(sent).toBeGreaterThan(0); // Only the injected synthetic transport was reached.
  });
  it('offers none of the three contracts under a selected policy that names no evaluation rule, and sends nothing', async () => {
    bindLive(withoutRuleFor(selected, 'evaluation'));
    const workspace = store.inspectEvaluation(bookId, null);
    expect(workspace.initial.prepare).toEqual({ allowed: false, reason: INITIAL_EVALUATION_LIVE_UNAVAILABLE });
    expect(workspace.readersReport.templates.map((template) => template.prepare))
      .toEqual(workspace.readersReport.templates.map(() => ({ allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE })));
    expect(workspace.rewrite.prepare).toEqual({ allowed: false, reason: EVALUATION_REWRITE_LIVE_UNAVAILABLE });
    expect(await refusal(() => store.createInitialEvaluationPreparationWork(bookId, withoutRuleFor(selected, 'evaluation'))))
      .toBe(`EVALUATION_INITIAL_UNAVAILABLE:${INITIAL_EVALUATION_LIVE_UNAVAILABLE}`);
    expect(await refusal(() => store.createReadersReportPreparationWork(bookId, 'author', withoutRuleFor(selected, 'evaluation'))))
      .toBe(`READERS_REPORT_UNAVAILABLE:${READERS_REPORT_LIVE_UNAVAILABLE}`);
    // A rule that names the report but not the house exemplars it carries admits 初评 alone.
    bindLive(withRuleFor(selected, 'evaluation', { outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text'] }));
    expect(store.inspectEvaluation(bookId, null).initial.prepare).toEqual({ allowed: true, mode: 'evaluation-first' });
    expect(store.inspectEvaluation(bookId, null).readersReport.templates[0]!.prepare).toEqual({ allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE });
    expect(sent).toBe(0);
  });

  it('runs 初评, 审稿意见 and 按我的评分重写评语 live, keeps the editor\'s scores and conclusion, and discloses 未联网核查 on the notes only', async () => {
    const policy = selected;
    await runInitial(policy);
    const initial = store.inspectInitialEvaluation(bookId);
    expect(initial.state).toBe('settled');
    const revision = initial.resultSetRevision!;
    expect(revision.policyPin.operationalScope).toBe('developer-live');
    expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    expect(revision.evaluation.synthesis.state).toBe('closed');
    expect(revision.evaluation.items.map((item) => item.score)).toEqual([16.5, 15, 15.5, 14, 12]);
    expect(revision.evaluation.market).not.toBeNull();
    expect(runReportUsageReconciles(initial.taskOutcome!.report!, revision.usage)).toBe(true);
    // Eight units, the synthesis and the reflection, each a validation item under the S40 namespace and its purpose.
    expect(sent).toBe(10);
    const initialLines = await ledgerLines();
    expect(initialLines.map((line) => line.itemId)).toEqual(Array.from({ length: 10 }, (_, index) => `S40/evaluation-first/${index + 1}`));
    expect(initialLines.every((line) => line.outcome === 'transmitted')).toBe(true);
    // 评估 shows AI7's notes with 未联网核查; its scores and comments read as written.
    const latest = store.inspectEvaluation(bookId, null).initial.latest!;
    const notes = latest.items.flatMap((item) => item.evidence.map((evidence) => evidence.note));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.startsWith(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(true);
    expect(latest.items.every((item) => !(item.comment ?? '').includes(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(true);

    // The editor's 定稿 version: its scores and conclusion stand, and calibration of one Book stays below its gate.
    const finalized = finalizeAsJ11(store, bookId);
    expect(finalized.calibration).toBeNull();
    expect(finalized.initial!.items.flatMap((item) => item.evidence).every((evidence) => evidence.note.startsWith(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(true);
    await draftReport(policy);
    const report = store.inspectReadersReport(bookId)!;
    expect(report.state).toBe('settled');
    const drafted = report.resultSetRevision!.readersReport;
    const { schema: _schema, ...sections } = AUTHORED_SECTIONS;
    expect(drafted.sections).toEqual(sections);
    expect(drafted.passages.length).toBeGreaterThan(0);
    expect(drafted.passages.every((passage) => passage.note.startsWith(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(true);
    expect(sent).toBe(20);

    // A version departing from AI7's scores: the rewrite moves no number, and its words carry no disclosure.
    const adjusted = beginRewriteAsJ11(store, bookId);
    await rewrite(policy, adjusted.recordId);
    const rewritten = store.inspectEvaluationRewrite(bookId)!;
    expect(rewritten.state).toBe('settled');
    expect(rewritten.resultSetRevision!.rewrite.words!.verdict).toBe(AUTHORED_REWRITE_WORDS.verdict);
    const shown = store.inspectEvaluation(bookId, adjusted.recordId);
    expect(shown.record!.content).toEqual(adjusted.content);
    const proposal = shown.rewrite.proposal!;
    expect(proposal.items.map((item) => item.after)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
    expect(proposal.items.flatMap((item) => item.evidence).every((evidence) => evidence.note.startsWith(EVALUATION_UNVERIFIED_DISCLOSURE))).toBe(true);
    expect(sent).toBe(30);
    const purposes = new Set((await ledgerLines()).map((line) => line.itemId.split('/')[1]));
    expect(purposes).toEqual(new Set(['evaluation-first', 'readers-report-first', 'evaluation-rewrite-first']));
    expect(ruleFor(selected, 'evaluation').ruleId).toBe('developer-live-public-samplebook-evaluation');
  }, 300_000);

  it('replays the recorded live 初评, 审稿意见 and rewrite through the same contracts, outcomes and usage (#429 evidence)', async () => {
    // The captured Tasks predate clarification /2; preserve their exact semantic instruction in this replay.
    selected = { ...selected, providerProcessing: { ...selected.providerProcessing,
      admittedRules: selected.providerProcessing.admittedRules.map((rule) => ({ ...rule, clarificationQuestionAllowed: false, clarificationTimeoutHours: null })),
    } };
    bindLive(selected);
    // Recorded units, syntheses and reflections answer; this regression sends nothing and asserts no editorial quality.
    recorded = {
      initial: await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-evaluation-initial'),
      readers: await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-evaluation-readers-report'),
      rewrite: await loadModelFixture(FIXTURES_ROOT, 'sample1-recorded-v41-evaluation-rewrite'),
    };
    for (const fixture of Object.values(recorded)) {
      expect(fixture.provenance).toBe('recorded');
      expect([...fixture.entries.values()].every((entry) => entry.capture?.model === DEVELOPER_LIVE_POLICY_BINDING.model)).toBe(true);
    }
    await runInitial(selected);
    const initial = store.inspectInitialEvaluation(bookId);
    expect(initial.planEnvelope!.promptContractDigest).toBe('3e8bb0c639321075afd59c108bfffd3ea8f796a1d1d6b685b141d752e38a86da');
    expect(initial.resultSetRevision!.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    expect(initial.resultSetRevision!.evaluation.items.map((item) => [item.score, item.sufficiency]))
      .toEqual([[16.5, 'sufficient'], [17, 'sufficient'], [15.5, 'sufficient'], [16, 'sufficient'], [14.5, 'sufficient']]);
    expect(initial.resultSetRevision!.usage).toEqual({ requests: 9, inputTokens: 19_982, outputTokens: 25_910 });
    finalizeAsJ11(store, bookId);
    await draftReport(selected);
    const report = store.inspectReadersReport(bookId)!;
    expect(report.planEnvelope!.promptContractDigest).toBe('d3f82693cdae4751b30272640ef284c71fde6c57e8a485cb94b7d6a85fe7922b');
    const revision = report.resultSetRevision!;
    // The live unit 1 answer did not meet the contract and stays a gap; the synthesis drafted from the other seven.
    expect(revision.coverage).toMatchObject({ state: 'partial', unitsTotal: 8, unitsClosed: 7 });
    expect(revision.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[1, 'contract-invalid']]);
    expect(revision.readersReport.synthesis.state).toBe('closed');
    expect(revision.readersReport.sections!.conclusion).toContain('修改后再议');
    expect(revision.usage).toEqual({ requests: 9, inputTokens: 78_768, outputTokens: 37_931 });
    expect(sent).toBe(20);
    // The rewrite after a saved departing score, from the declared retry's settled Run: every unit and the synthesis.
    const adjusted = beginRewriteAsJ11(store, bookId);
    await rewrite(selected, adjusted.recordId);
    const rewritten = store.inspectEvaluationRewrite(bookId)!;
    expect(rewritten.planEnvelope!.promptContractDigest).toBe('87f0f8fc3c809b23acde2323017c7543c364dfb976d7907669db6074c686b0e6');
    expect(rewritten.resultSetRevision!.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    expect(rewritten.resultSetRevision!.rewrite.synthesis.state).toBe('closed');
    const shown = store.inspectEvaluation(bookId, adjusted.recordId);
    expect(shown.record!.content).toEqual(adjusted.content);
    expect(shown.rewrite.proposal!.items.length).toBeGreaterThan(0);
    expect(sent).toBe(30);
  }, 300_000);

  it('never sends the book-level synthesis under a rule that does not name it', async () => {
    const policy = withRuleFor(selected, 'evaluation', { crossUnitSynthesisAllowed: false });
    bindLive(policy);
    await runInitial(policy);
    const initial = store.inspectInitialEvaluation(bookId);
    expect(initial.resultSetRevision!.evaluation.synthesis.state).toBe('gap');
    expect(initial.resultSetRevision!.evaluation.items.every((item) => item.score === null)).toBe(true);
    // Eight units and the reflection; no synthesis message ever formed.
    expect(sent).toBe(9);
    expect((await ledgerLines()).some((line) => line.validation?.step === 'evaluation-first/reduction')).toBe(false);
  }, 300_000);

  it('follows the policy-level reflection flag independently of synthesis admission', async () => {
    const policy = { ...selected, providerProcessing: { ...selected.providerProcessing, runReportReflectionAllowed: false } };
    bindLive(policy);
    await runInitial(policy);
    expect(store.inspectInitialEvaluation(bookId).resultSetRevision!.evaluation.synthesis.state).toBe('closed');
    expect(sent).toBe(9);
    expect((await ledgerLines()).some((line) => line.validation?.step === 'evaluation-first/reflection')).toBe(false);
  }, 300_000);

  it('refuses an evaluation rule on another role before preparing or sending', async () => {
    const policy = withRuleFor(selected, 'evaluation', { modelRole: 'Light Editorial Role' });
    bindLive(policy);
    await expect(runInitial(policy)).rejects.toMatchObject({ code: 'ANALYSIS_KIND_NOT_ADMITTED' });
    expect(sent).toBe(0);
  });

  it('keeps the conclusion-mismatch rule: a live report that does not state the editor\'s conclusion writes no draft', async () => {
    const policy = selected;
    await runInitial(policy);
    finalizeAsJ11(store, bookId);
    mismatchConclusion = true;
    await draftReport(policy);
    const drafted = store.inspectReadersReport(bookId)!.resultSetRevision!.readersReport;
    expect(drafted.sections).toBeNull();
    expect(drafted.synthesis.state).toBe('gap');
  }, 300_000);

  it.each((['initial', 'readers', 'rewrite'] as const).flatMap((kind) => (['unknown', 'quota'] as const).map((mode) => ({ kind, mode }))))('retains $kind $mode without retrying or resending the unit', async ({ kind, mode }) => {
    const target = await contractCase(kind);
    failure = mode;
    await target.run();
    const initial = target.inspect();
    const lines = await ledgerLines();
    const failed = lines.find((line) => line.classification === (mode === 'unknown' ? 'outcome-unknown' : 'quota-exhausted'))!;
    expect(failed).toBeDefined();
    expect(lines.filter((line) => line.validation?.step === `${target.purpose}/unit-1`)).toHaveLength(1);
    if (mode === 'unknown') {
      expect(initial.resultSetRevision!.gaps.some((gap) => gap.code === 'outcome-unknown')).toBe(true);
      const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
      expect(await cache.readClaim(failed.claimKey!)).toMatchObject({ state: 'outcome-unknown' });
      const before = sent;
      failure = 'none';
      await target.run();
      expect(sent).toBe(before);
      expect(await cache.readClaim(failed.claimKey!)).toMatchObject({ state: 'outcome-unknown' });
    } else {
      expect(sent).toBe(1);
      expect(initial.taskOutcome!.classification).toBe('interrupted');
    }
  }, 300_000);

  it.each(['initial', 'readers', 'rewrite'] as const)('replays an identical %s from the Provider Result Cache without sending again', async (kind) => {
    const target = await contractCase(kind);
    await target.run();
    expect(sent).toBe(10);
    const before = target.inspect().resultSetRevision!;
    await target.run();
    const again = target.inspect();
    expect(again.state).toBe('settled');
    expect(again.resultSetRevision!.coverage).toEqual(before.coverage);
    // Exact cache replay incurs no tokens, while retaining the nine logical contract requests.
    expect(again.resultSetRevision!.usage).toEqual({ requests: 9, inputTokens: 0, outputTokens: 0 });
    expect(sent).toBe(10);
  }, 300_000);

  it.each((['initial', 'readers', 'rewrite'] as const).flatMap((kind) => (['cancel', 'interrupt'] as const).map((mode) => ({ kind, mode }))))('keeps completed $kind units and usage on $mode', async ({ kind, mode }) => {
    const target = await contractCase(kind);
    holdTurn = 2;
    const running = target.run();
    await arrived;
    let stopped: Promise<void> | null = null;
    if (mode === 'cancel') {
      activeRun.ledger.requestCancel(bookId, activeRun.taskIntentId);
      activeRun.owner.cancelRun(activeRun.runRecordId, activeRun.ledger);
    } else stopped = activeRun.owner.dispose();
    release();
    await stopped;
    await running;
    const result = target.inspect();
    expect(result.taskOutcome!.classification).toBe(mode === 'cancel' ? 'cancelled' : 'interrupted');
    expect(sent).toBe(2);
    const revision = result.resultSetRevision!;
    const closed = 1;
    expect(revision.coverage.unitsClosed).toBe(closed);
    expect(revision.units.filter((unit) => unit.state === 'closed').map((unit) => unit.unitOrdinal)).toEqual(Array.from({ length: closed }, (_, index) => index + 1));
    // The interrupted second request was sent; its unreported tokens are not invented.
    expect(revision.usage.requests).toBe(2);
    expect(revision.usage.inputTokens + revision.usage.outputTokens).toBeGreaterThan(0);
    expect(revision.gaps.every((gap) => gap.code === (gap.unitOrdinal === 2 ? 'outcome-unknown' : 'not-attempted'))).toBe(true);
    expect(runReportUsageReconciles(result.taskOutcome!.report!, revision.usage)).toBe(true);
  }, 300_000);
});
