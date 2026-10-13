import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import { ProviderResultCache, isModelCallLine } from '../../src/service/provider/provider-result-cache.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { LaunchPolicyProjection, ReviewRunProjection } from '../../src/shared/protocol.js';
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
let holdTurn: boolean;
let arrived: Promise<void>;
let announce: () => void;
let release: () => void;

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
  holdTurn = false;
  arrived = new Promise<void>((resolve) => { announce = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const nativeFetch: typeof fetch = async (_url, init) => {
    sent += 1;
    if (sent === 1) {
      announce();
      if (holdTurn) await held;
      if (init?.signal?.aborted) throw new DOMException('Synthetic aborted transport', 'AbortError');
    }
    if (sent === 1 && failure === 'unknown') return new Response('{', { status: 200 });
    if (sent === 1 && failure === 'quota') return new Response(JSON.stringify({ error: { message: 'synthetic account limit' } }), { status: 429 });
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const message = body.messages.at(-1)!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    let result: unknown;
    if (header !== null) {
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
    return new Response(JSON.stringify({ model: launch.live.model, choices: [{ message: { content: JSON.stringify(result), reasoning_content: '合成推理通道。' }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
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
  it('dispatches all admitted categories, grounds findings, accounts for usage and carries a mark through Apply and reversal', async () => {
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
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const finding of findings) {
      const block = original.find((candidate) => candidate.blockId === finding.blockId)!;
      expect(sliceGraphemes(block.text, finding.fromGrapheme, finding.toGrapheme) === finding.quote).toBe(true);
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

  it('refuses web categories before preparing a model Task or sending anything', async () => {
    const book = await importSample1Book(store, roots.codeRoot, 'L2 sample1 unavailable review');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
    for (const category of ['factual-review', 'academic-integrity', 'publication-risk']) {
      expect(() => store.createReviewRunPreparationWork(book.bookId, [category], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy)).toThrowError(/涉及联网核查/u);
    }
    expect(sent).toBe(0);
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

  it.each(['cancel', 'interrupt'] as const)('carries %s and the spent turn through the existing category execution controls', async (mode) => {
    holdTurn = true;
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
    expect(sent).toBe(1);
    expect(outcome.resultSetRevision!.usage.inputTokens + outcome.resultSetRevision!.usage.outputTokens).toBe(mode === 'cancel' ? 60 : 0);
    const view = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(view.categories[0]!.detail?.includes('ANALYSIS_STATE')).not.toBe(true);
  });
});
