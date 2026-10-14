import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
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
import { V11_EVALUATION_RULE_ID, withV11EvaluationRule } from '../support/policy-v11-stand-in.js';
import { AUTHORED_SECTIONS, finalizeAsJ11 } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// #429 / J-11: AI7 初评, 审稿意见 and 按我的评分重写评语 on the Go execution path — the real store, ledger, execution owner, broker,
// adapter, Egress Gate, accounting and Provider Test Ledger — under developer-live with the v11 evaluation rule (the stand-in
// until the wave selects Provider Processing v11). The transport answers with the authored J-11 fixtures' texts in the real
// route's JSON shape, without a socket or credential; nothing asserts editorial quality and nothing prints manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let selected: LaunchPolicyProjection;
let store: EditorialStore;
let bookId: string;
let sent: number;
let failure: 'none' | 'unknown' | 'quota';
let mismatchConclusion: boolean;
let authored: { initial: ResolvedModelFixture; readers: ResolvedModelFixture; rewrite: ResolvedModelFixture };
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
    return { text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查依据不足的评分项。', basis: '合成回归账目。' }] }), usage: { inputTokens: 40, outputTokens: 20 } };
  }
  const contract = header[1] as keyof typeof CONTRACTS;
  const fixture = contract === '评估' ? authored.initial : contract === '审稿意见' ? authored.readers : authored.rewrite;
  const synthesis = header[2] === '综合';
  const schema = `{"schema":"${CONTRACTS[contract]}.${synthesis ? 'synthesis' : 'unit'}-result/`;
  const entry = [...fixture.entries.values()].find((candidate) => candidate.response.kind === 'unit-result' &&
    candidate.response.text.startsWith(schema) && candidate.unitOrdinal === (synthesis ? 0 : Number(header[3])));
  if (entry?.response.kind !== 'unit-result') throw new Error('AUTHORED_EVALUATION_ANSWER_MISSING');
  const text = synthesis && mismatchConclusion && header[1] === '审稿意见' ? entry.response.text.replace('修改后再议', '同意出版') : entry.response.text;
  return { text, usage: entry.response.usage };
}

const nativeFetch: typeof fetch = async (_url, init) => {
  sent += 1;
  if (sent === 1 && failure === 'unknown') return new Response('{', { status: 200 });
  if (sent === 1 && failure === 'quota') return new Response(JSON.stringify({ error: { message: 'synthetic account limit' } }), { status: 429 });
  const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
  const answer = answerOf(body.messages.at(-1)!.content);
  return new Response(JSON.stringify({
    model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { content: answer.text, reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: answer.usage.inputTokens, completion_tokens: answer.usage.outputTokens },
  }), { status: 200 });
};

/** One owner per contract, as each live evidence launch names its own validation family. */
function liveOwner(policy: LaunchPolicyProjection, family: string): BaselineAnalysisExecutionOwner {
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
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

async function runInitial(policy: LaunchPolicyProjection): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-initial');
  let progress = store.createInitialEvaluationPreparationWork(bookId, policy);
  while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(owner.admitOrQueue(authorized.dispatchRunRecordId!, store.initialEvaluationLedger)).toBe('admitted');
  await owner.whenIdle();
}

async function draftReport(policy: LaunchPolicyProjection): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-readers-report');
  let progress = store.createReadersReportPreparationWork(bookId, 'author', policy);
  while (!progress.done) progress = store.advanceReadersReportPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeReadersReport(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await owner.whenIdle();
}

async function rewrite(policy: LaunchPolicyProjection, recordId: string): Promise<void> {
  const owner = liveOwner(policy, 'evaluation-rewrite');
  let progress = store.createEvaluationRewritePreparationWork(bookId, recordId, policy);
  while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = store.authorizeEvaluationRewrite(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
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
  bindLive(withV11EvaluationRule(selected));
  sent = 0;
  failure = 'none';
  mismatchConclusion = false;
  const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 live evaluation');
  bookId = book.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
});

afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.dispose();
  store?.close();
  await roots?.dispose();
});

describe('evaluation on the Go execution path (#429)', () => {
  it('offers none of the three contracts under a selected policy that names no evaluation rule, and sends nothing', async () => {
    bindLive(selected);
    const workspace = store.inspectEvaluation(bookId, null);
    expect(workspace.initial.prepare).toEqual({ allowed: false, reason: INITIAL_EVALUATION_LIVE_UNAVAILABLE });
    expect(workspace.readersReport.templates.map((template) => template.prepare))
      .toEqual(workspace.readersReport.templates.map(() => ({ allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE })));
    expect(workspace.rewrite.prepare).toEqual({ allowed: false, reason: EVALUATION_REWRITE_LIVE_UNAVAILABLE });
    expect(await refusal(() => store.createInitialEvaluationPreparationWork(bookId, selected)))
      .toBe(`EVALUATION_INITIAL_UNAVAILABLE:${INITIAL_EVALUATION_LIVE_UNAVAILABLE}`);
    expect(await refusal(() => store.createReadersReportPreparationWork(bookId, 'author', selected)))
      .toBe(`READERS_REPORT_UNAVAILABLE:${READERS_REPORT_LIVE_UNAVAILABLE}`);
    // A rule that names the report but not the house exemplars it carries admits 初评 alone.
    bindLive(withV11EvaluationRule(selected, { outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text'] }));
    expect(store.inspectEvaluation(bookId, null).initial.prepare).toEqual({ allowed: true, mode: 'evaluation-first' });
    expect(store.inspectEvaluation(bookId, null).readersReport.templates[0]!.prepare).toEqual({ allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE });
    expect(sent).toBe(0);
  });

  it('runs 初评, 审稿意见 and 按我的评分重写评语 live, keeps the editor\'s scores and conclusion, and discloses 未联网核查 on the notes only', async () => {
    const policy = withV11EvaluationRule(selected);
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
    expect(V11_EVALUATION_RULE_ID).toBe('developer-live-public-samplebook-evaluation');
  }, 300_000);

  it('never sends the book-level synthesis under a rule that does not name it', async () => {
    const policy = withV11EvaluationRule(selected, { crossUnitSynthesisAllowed: false });
    bindLive(policy);
    await runInitial(policy);
    const initial = store.inspectInitialEvaluation(bookId);
    expect(initial.resultSetRevision!.evaluation.synthesis.state).toBe('gap');
    expect(initial.resultSetRevision!.evaluation.items.every((item) => item.score === null)).toBe(true);
    // Eight units and the reflection; no synthesis message ever formed.
    expect(sent).toBe(9);
    expect((await ledgerLines()).some((line) => line.validation?.step === 'evaluation-first/reduction')).toBe(false);
  }, 300_000);

  it('keeps the conclusion-mismatch rule: a live report that does not state the editor\'s conclusion writes no draft', async () => {
    const policy = withV11EvaluationRule(selected);
    await runInitial(policy);
    finalizeAsJ11(store, bookId);
    mismatchConclusion = true;
    await draftReport(policy);
    const drafted = store.inspectReadersReport(bookId)!.resultSetRevision!.readersReport;
    expect(drafted.sections).toBeNull();
    expect(drafted.synthesis.state).toBe('gap');
  }, 300_000);

  it.each(['unknown', 'quota'] as const)('retains %s without retrying or resending the unit', async (mode) => {
    failure = mode;
    await runInitial(withV11EvaluationRule(selected));
    const initial = store.inspectInitialEvaluation(bookId);
    const lines = await ledgerLines();
    const failed = lines.find((line) => line.classification === (mode === 'unknown' ? 'outcome-unknown' : 'quota-exhausted'))!;
    expect(failed).toBeDefined();
    expect(lines.filter((line) => line.validation?.step === 'evaluation-first/unit-1')).toHaveLength(1);
    if (mode === 'unknown') {
      expect(initial.resultSetRevision!.gaps.some((gap) => gap.code === 'outcome-unknown')).toBe(true);
    } else {
      expect(sent).toBe(1);
      expect(initial.taskOutcome!.classification).toBe('interrupted');
    }
  }, 300_000);

  it('replays an identical 初评 from the Provider Result Cache without sending again', async () => {
    const policy = withV11EvaluationRule(selected);
    await runInitial(policy);
    expect(sent).toBe(10);
    await runInitial(policy);
    const again = store.inspectInitialEvaluation(bookId);
    expect(again.state).toBe('settled');
    expect(again.resultSetRevision!.evaluation.items.map((item) => item.score)).toEqual([16.5, 15, 15.5, 14, 12]);
    expect(sent).toBe(10);
  }, 300_000);
});
