import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ALWAYS_ONLINE } from '../../src/service/connectivity.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { LEADS_ABSENT_REASON } from '../../src/service/review/review-scope.js';
import { SERIES_CONSISTENCY_NO_SERIES_REASON } from '../../src/service/review/series-consistency.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { normalizedQuotation, sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ownBlockTextsOf, ownBlockIdsOf, unitContentDigest, substituteBlockPlaceholders } from '../../src/service/provider/local-deterministic-adapter.js';
import { ProviderResultCache, isModelCallLine } from '../../src/service/provider/provider-result-cache.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { LaunchPolicyProjection, ReviewCategoryResultSetRevisionProjection, ReviewRunProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// #809 / J-04, J-05: real store, broker, Go adapter, egress, accounting and review drive loop.
// The transport supplies the real route's JSON shape without a socket or real credential. Quotes
// are composed from exact sample1 at runtime and comparisons never print manuscript text.
let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let driver: ReviewRunDriver;
let sent: number;
let failure: 'none' | 'unknown' | 'quota';
let holdTurn: number | null;
let arrived: Promise<void>;
let announce: () => void;
let release: () => void;
let recorded: Map<string, ResolvedModelFixture>;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-live-review-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: {
      route: DEVELOPER_LIVE_POLICY_BINDING.route, endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      model: DEVELOPER_LIVE_POLICY_BINDING.model, credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
      credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 },
    },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  sent = 0;
  failure = 'none';
  holdTurn = null;
  recorded = new Map();
  arrived = new Promise<void>((resolve) => { announce = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const nativeFetch: typeof fetch = async (_url, init) => {
    sent += 1;
    if (sent === (holdTurn ?? 1)) {
      announce();
      if (holdTurn !== null) await held;
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
    }
    if (sent === 1 && failure === 'unknown') return new Response('{', { status: 200 });
    if (sent === 1 && failure === 'quota') return new Response(JSON.stringify({ error: { message: 'synthetic account limit' } }), { status: 429 });
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const message = body.messages.at(-1)!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    let result: unknown;
    let capturedText: string | null = null;
    let responseUsage = { inputTokens: 40, outputTokens: 20 };
    const fixture = header === null ? undefined : recorded.get(header.categoryId);
    if (header !== null && fixture !== undefined) {
      const digest = unitContentDigest(ownBlockTextsOf(message));
      const entry = [...fixture.entries.values()].find((candidate) => candidate.unitOrdinal === header.ordinal && candidate.contentDigest === digest);
      if (entry?.response.kind !== 'unit-result') throw new Error('RECORDED_REVIEW_UNIT_MISSING');
      capturedText = substituteBlockPlaceholders(entry.response.text, ownBlockIdsOf(message));
      responseUsage = entry.response.usage;
    } else if (header !== null) {
      const blocks = message.split('\n').flatMap((line) => {
        const match = /^\[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
        return match === null ? [] : [match[1]!];
      });
      const blockIndex = blocks.findIndex((text) => text.length >= 10 && text.length <= 80);
      const quote = blockIndex < 0 ? null : blocks[blockIndex]!;
      result = {
        schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal,
        findings: header.ordinal !== 1 || quote === null ? [] : [{
          quote, blockOrdinal: blockIndex + 1, severity: 'should', note: '合成回归建议；仅验证处置流程。',
          ...(header.categoryId === 'style-and-format' ? {} : { replacement: `${sliceGraphemes(quote, 0, 30)}（合成修改）` }),
        }],
      };
    } else if (message.startsWith('保证抽样 ')) {
      result = { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) };
    } else {
      result = { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查已定位发现。', basis: '合成回归账目。' }] };
    }
    return new Response(JSON.stringify({ model: launch.live.model, choices: [{ message: { content: capturedText ?? JSON.stringify(result), reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }], usage: { prompt_tokens: responseUsage.inputTokens, completion_tokens: responseUsage.outputTokens } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'reference-free-review', case: 'sample1-whole-book', delta: null } }, nativeFetch },
  });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
});

afterEach(async () => {
  release?.();
  const stopped = driver?.dispose();
  await owner?.dispose();
  await stopped;
  store?.close();
  await roots?.dispose();
});

function approvals(run: ReviewRunProjection) {
  return run.categories.filter((category) => category.planEnvelopeDigest !== null).map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! }));
}

describe('reference-free review on the Go execution path', () => {
  it.each(['synthetic', 'recorded'] as const)('dispatches all admitted categories with %s unit answers, grounds findings and carries a mark through Apply and reversal', async (source) => {
    if (source === 'recorded') {
      // Completed typos/style unit answers are recorded. Literary units, sampling/reflection and the
      // HTTP envelope remain synthetic; literary had no persisted live revision before timeout.
      // This regression sends nothing and asserts no current editorial quality.
      for (const id of ['typos-and-usage', 'style-and-format']) {
        const fixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), `sample1-recorded-v41-review-${id}`);
        expect(fixture.provenance).toBe('recorded');
        expect([...fixture.entries.values()].every((entry) => entry.capture?.model === DEVELOPER_LIVE_POLICY_BINDING.model)).toBe(true);
        recorded.set(id, fixture);
      }
    }
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 live review');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    const original = store.baselineAnalysisLedger.readWorkingBlocks(book.branchId);
    let progress = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage', 'style-and-format', 'literary-expression'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
    const run = progress.projection!.run!;
    expect(sent).toBe(0);
    store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
    await driver.drive(run.reviewRunId);
    const settled = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(settled.categories.map((category) => category.state)).toEqual(['settled', 'settled', 'settled']);
    const findings = settled.findings;
    expect(findings.length).toBeGreaterThanOrEqual(source === 'recorded' ? 1 : 3);
    if (source === 'recorded') {
      // The evidence item's persisted outcome replays exactly: 11 typos and 8 style findings grounded. The others
      // name a block that does not hold their quotation and stay excluded, never relocated to a neighbouring block.
      const counts = (id: string) => (store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry(id)!)))
        .resultSetRevision as ReviewCategoryResultSetRevisionProjection).findingCounts;
      expect(counts('typos-and-usage')).toMatchObject({ listed: 27, located: 11, excluded: 16 });
      expect(counts('style-and-format')).toMatchObject({ listed: 9, located: 8, excluded: 1 });
      expect(['typos-and-usage', 'style-and-format'].map((id) => findings.filter((candidate) => candidate.categoryId === id).length)).toEqual([11, 8]);
    }
    for (const finding of findings) {
      const block = original.find((candidate) => candidate.blockId === finding.blockId)!;
      expect(normalizedQuotation(sliceGraphemes(block.text, finding.fromGrapheme, finding.toGrapheme)) === normalizedQuotation(finding.quote)).toBe(true);
      expect(finding.markId).not.toBeNull();
      expect(finding.stateLine).toBe('未联网核查');
    }
    const finding = findings.find((candidate) => candidate.categoryId === 'typos-and-usage')!;
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, markId: finding.markId!, clientEffectId: randomUUID() };
    const applied = store.applyChangeSuggestion({ ...binding, interaction: 'accept-and-apply', editedText: null, reason: null });
    const reversed = store.reverseAppliedChangeSuggestion({ ...binding, clientEffectId: randomUUID() });
    expect(reversed.application.reversesEffectId).toBe(applied.application.effectId);
    expect(store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).map((block) => block.text).join('\n') === original.map((block) => block.text).join('\n')).toBe(true);
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    const captures = cache.lines.filter(isModelCallLine);
    expect(captures.filter((line) => line.outcome === 'transmitted').length).toBe(sent);
    expect(captures.every((line) => line.model === DEVELOPER_LIVE_POLICY_BINDING.model)).toBe(true);
  });

  it('refuses publication-risk before preparing a model Task or sending anything', async () => {
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 unavailable review');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    for (const category of ['publication-risk']) {
      expect(() => store.createReviewRunPreparationWork(book.bookId, [category], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy)).toThrowError(/涉及联网核查/u);
    }
    expect(sent).toBe(0);
  });

  it('offers exactly the admitted model categories while every other category keeps its own reason', async () => {
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 review matrix');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    const categories = store.inspectReviewWorkspace(book.bookId, null).categories;
    expect(categories.filter((category) => category.available).map((category) => category.categoryId)).toEqual(['typos-and-usage', 'style-and-format', 'factual-review', 'academic-integrity', 'literary-expression']);
    const reason = (id: string) => categories.find((category) => category.categoryId === id)!.unavailableReason;
    expect(reason('publication-risk')).toMatch(/涉及联网核查/u);
    // The model-free leads stay on their baseline path (here: no baseline yet), never behind the live rule;
    // 书系一致性 and 跨交付物一致性 keep their own configured reasons.
    expect(reason('plot-consistency')).toBe(LEADS_ABSENT_REASON);
    expect(reason('series-consistency')).toBe(SERIES_CONSISTENCY_NO_SERIES_REASON);
    expect(reason('cross-deliverable-consistency')).toBe(reviewCategoryEntry('cross-deliverable-consistency')!.unavailableReason);
    expect(() => store.createReviewRunPreparationWork(book.bookId, ['cross-deliverable-consistency'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy))
      .toThrowError(/跨交付物一致性/u);
    expect(sent).toBe(0);
  });

  it('quick-starts a review category-set rule only while the selected rule admits that origin (#866)', async () => {
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 review quick start');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    const prepare = (): ReviewRunProjection => {
      let progress = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      return progress.projection!.run!;
    };
    const runtime = { credentialReadiness: async () => 'present' as const, connectivity: ALWAYS_ONLINE };
    const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));
    const ledger = store.reviewCategoryLedger(definition);
    // The selected developer-live policy (v16 under active set v12) admits the default-rule origin for review.
    expect(ledger.launch.policy?.providerProcessing.admittedRules?.find((rule) => rule.taskKinds.includes(definition.kind))
      ?.matchingActiveDefaultExecutionRuleAllowed).toBe(true);
    const first = prepare();
    const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: first.reviewRunId });
    expect(plan.defaultRule).toMatchObject({ canSet: true, reason: null });
    const rule = store.setDefaultExecutionRule(book.bookId, first.reviewRunId, plan.defaultRule.planEnvelopeDigest!);
    expect(rule.taskKind).toBe('review-run');
    expect(await store.quickStartReviewRun({ bookId: book.bookId, reviewRunId: first.reviewRunId, planEnvelopeDigest: plan.edit.planEnvelopeDigest!,
      ruleVersionId: rule.ruleVersionId }, runtime)).toEqual({ outcome: 'started', reasons: [], dispatch: true });
    await driver.drive(first.reviewRunId);
    expect(store.inspectReviewWorkspace(book.bookId, first.reviewRunId).run!.categories.map((category) => category.state)).toEqual(['settled']);
    expect(store.inspectReviewCategory(book.bookId, definition).authorization).toMatchObject({ origin: 'default-execution-rule', ruleVersionId: rule.ruleVersionId });

    // A policy whose review rule does not admit the origin (v12's reading): the plan offers no rule, 快速开始 falls back
    // before anything is authorized, and the category ledger refuses the origin itself.
    const launch = ledger.launch;
    const providerProcessing = launch.policy!.providerProcessing;
    ledger.bindLaunch({ ...launch, policy: { ...launch.policy!, providerProcessing: { ...providerProcessing,
      admittedRules: providerProcessing.admittedRules!.map((entry) => entry.taskKinds.includes(definition.kind)
        ? { ...entry, matchingActiveDefaultExecutionRuleAllowed: false } : entry) } } });
    const second = prepare();
    const refused = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: second.reviewRunId });
    expect(refused.defaultRule).toMatchObject({ canSet: false, reason: '当前模型处理规则未允许审阅快速开始；请先看计划。' });
    expect(await store.quickStartReviewRun({ bookId: book.bookId, reviewRunId: second.reviewRunId, planEnvelopeDigest: refused.edit.planEnvelopeDigest!,
      ruleVersionId: rule.ruleVersionId }, runtime)).toEqual({ outcome: 'fell-back', reasons: ['当前模型处理规则未允许审阅快速开始；请先看计划。'], dispatch: false });
    expect(store.inspectReviewWorkspace(book.bookId, second.reviewRunId).run!.authorization).toBeNull();
    const task = store.inspectReviewCategory(book.bookId, definition);
    expect(() => ledger.authorize(book.bookId, task.taskIntent!.taskIntentId, task.planEnvelope!.digest, 'now',
      { kind: 'default-execution-rule', ruleVersionId: rule.ruleVersionId })).toThrowError(expect.objectContaining({ code: 'ANALYSIS_ORIGIN_NOT_ADMITTED' }));
  });

  it.each(['unknown', 'quota'] as const)('retains %s without retrying or silently repeating the category', async (mode) => {
    failure = mode;
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 failure review');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    let progress = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
    const run = progress.projection!.run!;
    store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
    await driver.drive(run.reviewRunId);
    const entry = reviewCategoryEntry('typos-and-usage')!;
    const projection = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(entry)));
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    const failed = cache.lines.filter(isModelCallLine).find((line) => line.classification === (mode === 'unknown' ? 'outcome-unknown' : 'quota-exhausted'))!;
    expect(failed).toBeDefined();
    if (mode === 'unknown') {
      expect(projection.resultSetRevision!.gaps.some((gap) => gap.code === 'outcome-unknown')).toBe(true);
      expect(await cache.readClaim(failed.claimKey!)).toMatchObject({ state: 'outcome-unknown' });
    } else {
      expect(sent).toBe(1);
      expect(projection.taskOutcome!.classification).toBe('interrupted');
    }
    const before = sent;
    await driver.continue(run.reviewRunId);
    expect(sent).toBe(before);
  });

  it.each([['cancel', 1], ['cancel', 2], ['interrupt', 1]] as const)('carries %s at turn %i and the spent turn through the existing category execution controls', async (mode, turn) => {
    holdTurn = turn;
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 stopped review');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));
    let progress = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
    const run = progress.projection!.run!;
    store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
    const loop = driver.drive(run.reviewRunId);
    await arrived;
    const ledger = store.reviewCategoryLedger(definition);
    const running = store.inspectReviewCategory(book.bookId, definition);
    let stopped: Promise<void> | null = null;
    if (mode === 'cancel') {
      ledger.requestCancel(book.bookId, running.taskIntent!.taskIntentId);
      owner.cancelRun(running.run!.runRecordId, ledger);
    } else stopped = owner.dispose();
    release();
    await stopped;
    await loop;
    const outcome = store.inspectReviewCategory(book.bookId, definition);
    expect(outcome.taskOutcome!.classification).toBe(mode === 'cancel' ? 'cancelled' : 'interrupted');
    expect(outcome.run!.state).toBe(mode === 'cancel' ? 'cancelled' : 'interrupted');
    expect(sent).toBe(turn);
    // A cancellation takes effect between reading ranges: the turn in flight and every unit before it stay
    // closed with their findings and usage; only the units never sent become not-attempted gaps.
    const revision = outcome.resultSetRevision as ReviewCategoryResultSetRevisionProjection;
    const closed = mode === 'cancel' ? turn : 0;
    expect(revision.usage.inputTokens + revision.usage.outputTokens).toBe(closed * 60);
    expect(revision.units.filter((unit) => unit.state === 'closed').map((unit) => unit.unitOrdinal)).toEqual(Array.from({ length: closed }, (_, index) => index + 1));
    expect(revision.findings.length).toBe(closed === 0 ? 0 : 1);
    expect(revision.coverage.unitsClosed + revision.gaps.length).toBe(revision.coverage.unitsTotal);
    expect(revision.gaps.every((gap) => gap.code === (mode === 'interrupt' && gap.unitOrdinal === 1 ? 'interrupted' : 'not-attempted'))).toBe(true);
    const view = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(view.categories[0]!.detail?.includes('ANALYSIS_STATE')).not.toBe(true);
  });
});
