import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { EditorialLearningLedger } from '../../src/service/learning/ledger.js';
import { HousePreferenceInfluence, HouseReviewPreferenceLedger } from '../../src/service/house-review-preference.js';
import { SupervisionDirectives } from '../../src/service/learning/supervision-directives.js';
import type { CreateEditorialMemoryInput, EditorialMemoryVersion, GlobalMemoryPin, RecordLearningSupervisionInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;
let requestGovernor: ModelRequestGovernor | undefined;
afterEach(async () => {
  const stopped = driver?.dispose(); await owner?.dispose(); await stopped;
  requestGovernor?.close(); await requestGovernor?.whenIdle();
  await store?.close(); await roots?.dispose(); roots = undefined; store = undefined; owner = undefined; driver = undefined; requestGovernor = undefined;
});

/** Actual selected production policy/store/gate; only transport is synthetic. Nothing is sent to a provider. */
async function sourceDecisions() {
  requestGovernor = new ModelRequestGovernor();
  roots = await createServiceTestRoots('ai7-memory-governance-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const subject = store;
  const choice = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
  const pending = subject.saveModelServiceConnection('合成记忆测试连接', null, 'needs-attention', choice.route);
  subject.saveModelServiceConnection('合成记忆测试连接', pending.credentialReference, 'ready', choice.route);
  subject.selectModelServiceRoute(choice.route);
  const binding = { ...choice, credentialReference: pending.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
  subject.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
  const requests: string[] = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const message = body.messages.findLast((entry) => entry.role === 'user')!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    requests.push(String(init?.body));
    const content = header !== null ? JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal,
      findings: header.ordinal !== 1 ? [] : message.split('\n').flatMap((line) => {
        const match = /^\[([1-9][0-9]*)\] \[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
        return match === null || match[2]!.length < 10 || match[2]!.length > 80 ? [] : [{ quote: match[2]!, blockOrdinal: Number(match[1]),
          severity: 'should', note: '合成同类修改建议。', replacement: `${match[2]}合成` }];
      }).slice(0, 4) }) : message.startsWith('保证抽样 ') ? JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
        dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) })
        : JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
    return new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: subject.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => 'placeholder-production-key' },
    productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', selected),
  });
  driver = new ReviewRunDriver(subject.reviewRunDriveSteps, owner);
  const book = await importSample1Book(subject, roots.codeRoot, '合成记忆来源');
  await pinEditorialWorkspaceProfileRevision2(subject, book.bookId);
  const prepare = () => {
    let work = subject.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!work.done) work = subject.advanceReviewRunPreparationWork(work.workId!);
    return work.projection!.run!;
  };
  const run = prepare();
  subject.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  await driver.drive(run.reviewRunId);
  const result = subject.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
  expect(result.findings).toHaveLength(4);
  result.findings.forEach((finding, index) => subject.recordChangeSuggestionDecision({ manuscriptId: result.manuscript.manuscriptId,
    branchId: result.manuscript.branchId, windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(),
    disposition: index === 1 ? 'rejected' : 'accepted-with-edit', editedText: index === 1 ? null : `合成统一表达${index}`, reason: '合成编辑判断。' }));
  const inspect = () => subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
  const signals = inspect().signals;
  expect(signals).toHaveLength(4);
  const explicit = signals[1]!;
  const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
    expectedDecisions: material.decisions, choice: 'house', note: null });
  const create = (selected: readonly string[], title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: selected, applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const current = (itemId: string): EditorialMemoryVersion => {
    const version = inspect().items.find((entry) => entry.current.itemId === itemId)!.current;
    expect(version.schema).toBe('ai7.global-editorial-memory/2');
    if (version.schema !== 'ai7.global-editorial-memory/2') throw new Error('Expected governed memory');
    return version;
  };
  const make = (input: CreateEditorialMemoryInput) => {
    const before = new Set(inspect().items.map((entry) => entry.current.itemId));
    subject.createEditorialMemory(input);
    return current(inspect().items.find((entry) => !before.has(entry.current.itemId))!.current.itemId);
  };
  const accept = (memory: EditorialMemoryVersion) => {
    subject.acceptEditorialMemory({ itemId: memory.itemId, expectedVersionId: memory.versionId, actionId: randomUUID() }); return current(memory.itemId);
  };
  const govern = (memories: readonly EditorialMemoryVersion[], operation: RecordLearningSupervisionInput['operation'], text: string,
    effect: RecordLearningSupervisionInput['effect'] = 'guide') => subject.recordLearningSupervision({ actionId: randomUUID(), operation,
    targets: memories.map((entry) => ({ itemId: entry.itemId, revisionId: entry.versionId })), scope: { kind: 'house' }, categoryId: 'typos-and-usage', text, effect });
  /** Another Book's real automatically admitted review decisions, through the same production store/gate and synthetic transport. */
  const sourceBook = async (title: string) => {
    const other = await importSample1Book(subject, roots!.codeRoot, title);
    await pinEditorialWorkspaceProfileRevision2(subject, other.bookId);
    let work = subject.createReviewRunPreparationWork(other.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!work.done) work = subject.advanceReviewRunPreparationWork(work.workId!);
    const otherRun = work.projection!.run!;
    subject.authorizeReviewRun(other.bookId, otherRun.reviewRunId, otherRun.categories.filter((category) => category.planEnvelopeDigest !== null)
      .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    await driver!.drive(otherRun.reviewRunId);
    const reviewed = subject.inspectReviewWorkspace(other.bookId, otherRun.reviewRunId).run!;
    reviewed.findings.forEach((finding, index) => subject.recordChangeSuggestionDecision({ manuscriptId: reviewed.manuscript.manuscriptId,
      branchId: reviewed.manuscript.branchId, windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(),
      disposition: 'accepted-with-edit', editedText: `合成另一本书${index}`, reason: '合成另一本书的判断。' }));
    return { book: other, signals: inspect().signals.filter((signal) => signal.source.bookId === other.bookId) };
  };
  return { subject, book, signals, explicit, inspect, current, make, create, accept, govern, prepare, requests, sourceBook };
}

it('publishes two same-category memories with true automatic/explicit ancestry, one real owner each, and atomic governance', async () => {
  const { subject, book, signals, explicit, inspect, current, make, create, accept, govern } = await sourceDecisions();
  const automatic = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  const input = create([automatic.signalId, explicit.signalId], '保持合成用语一致。');
  const first = make(input);
  expect(first.sources.map((source) => source.admission.kind)).toEqual(['automatic', 'explicit']);
  expect(first.sources[0]!.admission).not.toHaveProperty('decisionId');
  expect(subject.inspectGlobalAgent().sourceCandidates?.some((entry) => entry.itemId === first.itemId)).toBe(false);
  const a = accept(first);
  expect(() => accept(first)).toThrow();
  const b = accept(make(create([automatic.signalId, signals[2]!.signalId], '保留合成表达节奏。')));
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.owner!.itemId).sort()).toEqual([a.itemId, b.itemId].sort());
  expect(published.sourceCount).toBe(3);
  const global = subject.inspectGlobalAgent();
  expect(global.items.filter((entry) => entry.kind === 'memory')).toHaveLength(2);
  const pin: GlobalMemoryPin = { itemId: a.itemId, revisionId: a.versionId };
  const corrected = govern([a], 'correct', a.title);
  expect(current(a.itemId).versionId).not.toBe(a.versionId);
  expect(subject.globalAgentSourcesCurrent([pin])).toBe(false);
  const directive = corrected.directives.at(-1)!;
  subject.recordLearningSupervision({ actionId: directive.actionId!, operation: directive.operation, targets: directive.targets,
    scope: directive.scope, categoryId: directive.categoryId, text: directive.text, effect: directive.effect });
  expect(subject.inspectGlobalAgent().directives.at(-1)!.directiveId).toBe(directive.directiveId);
  expect(() => govern([a], 'correct', '失效版本不能修正。')).toThrow();
  govern([current(a.itemId)], 'correct', '界'.repeat(160));
  const before = subject.inspectHouseReviewPreference().current!.versionId;
  const directiveCount = subject.inspectGlobalAgent().directives.length;
  expect(() => govern([current(b.itemId)], 'correct', '界'.repeat(41))).toThrow(/12 条/u);
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(before);
  expect(subject.inspectGlobalAgent().directives).toHaveLength(directiveCount);
  expect(current(b.itemId).versionId).toBe(b.versionId);
  const legacy = subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference')!;
  expect(() => subject.recordLearningSupervision({ operation: 'merge', actionId: randomUUID(), targets: [legacy,
    { itemId: b.itemId, revisionId: b.versionId }].map(({ itemId, revisionId }) => ({ itemId, revisionId })),
    scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '混合目标', effect: 'guide' })).toThrow();
  govern([b], 'supervise', '冻结第二条记忆。', 'freeze');
  expect(current(b.itemId).state).toBe('frozen');
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.owner?.itemId === b.itemId)).toBe(false);
  const third = accept(make(create([signals[3]!.signalId], '规范合成书面表达。')));
  const merged = govern([current(a.itemId), third], 'merge', '统一合成表达并保留节奏。');
  const active = merged.items.filter((entry) => entry.kind === 'memory' && entry.state === 'active');
  expect(active).toHaveLength(1);
  const combined = current(active[0]!.itemId);
  expect(combined.parentVersions).toHaveLength(2);
  const snapshot = inspect();
  subject.markCleanShutdown(); subject.close(); store = undefined;
  store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
  expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 })).toMatchObject({ items: snapshot.items });
});

it('consumes exact /2 lines through a production review and keeps restored current memory separate from stale prepared pins', async () => {
  const { subject, book, signals, explicit, current, make, create, accept, govern, prepare, requests } = await sourceDecisions();
  const automatic = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  const memory = accept(make(create([automatic.signalId, explicit.signalId], '保留合成节奏并统一用语。')));
  const readSource = subject.inspectGlobalAgent().sourceCandidates!.find((entry) => entry.itemId === memory.itemId)!;
  const readPin = { itemId: readSource.itemId, revisionId: readSource.revisionId };
  expect(subject.globalAgentSourcesCurrent([readPin])).toBe(true);
  const prepared = prepare();
  const task = prepared.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const ledger = new HouseReviewPreferenceLedger(db);
    const pin = ledger.pinned(task)!;
    expect(pin.lines).toContain(memory.title);
    expect(ledger.pinnedInfluence(task)!.version.lines.some((line) => line.owner?.itemId === memory.itemId)).toBe(true);
    subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
      categoryId: 'style-and-format', text: '另一个类别的独立偏好。', effect: 'guide' });
    expect(ledger.governanceChanged(task, () => [])).toBe(false);
    subject.authorizeReviewRun(book.bookId, prepared.reviewRunId, prepared.categories.filter((entry) => entry.planEnvelopeDigest !== null)
      .map((entry) => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
    const count = requests.length;
    await driver!.drive(prepared.reviewRunId);
    const outbound = requests.slice(count).map((body) => JSON.parse(body) as { messages: Array<{ role: string; content: string }> });
    expect(outbound.some((body) => body.messages.some((message) => message.content.includes(memory.title)))).toBe(true);
    for (const body of outbound) expect(JSON.stringify(body)).not.toMatch(/sourceKey|feedbackKey|currentAdmission|parentVersions|supervisionDirectiveRefs|actionId|eligibilityDecisionId/u);
    const preparedBeforeExclusion = prepare();
    const oldTask = preparedBeforeExclusion.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
    subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
    expect(ledger.use('ordinary-production', book.bookId, 'typos-and-usage')).toBeNull();
    expect(ledger.governanceChanged(oldTask, () => [])).toBe(true);
    subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
    expect(current(memory.itemId).versionId).toBe(memory.versionId);
    expect(subject.globalAgentSourcesCurrent([readPin])).toBe(false);
    const freshSource = subject.inspectGlobalAgent().sourceCandidates!.find((entry) => entry.itemId === memory.itemId)!;
    expect(subject.globalAgentSourcesCurrent([{ itemId: freshSource.itemId, revisionId: freshSource.revisionId }])).toBe(true);
    const restored = ledger.use('ordinary-production', book.bookId, 'typos-and-usage')!;
    expect(restored.lines).toContain(memory.title);
    expect(restored.versionId).not.toBe(pin.versionId);
    expect(ledger.governanceChanged(oldTask, () => [])).toBe(true);
    const fresh = prepare();
    expect(ledger.governanceChanged(fresh.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!, () => [])).toBe(false);
    const sources = subject.inspectHouseReviewPreference().current!.lines.find((line) => line.owner?.itemId === memory.itemId)!.sources;
    expect(sources.every((source) => source.kind === 'editorial-memory' && source.currentAdmission.controls.bookEntryId !== source.captured.admission.controls.bookEntryId)).toBe(true);
    govern([current(memory.itemId)], 'supervise', '冻结后不能由恢复自动复活。', 'freeze');
    subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 2 });
    subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 3 });
    expect(current(memory.itemId).state).toBe('frozen');
    expect(subject.inspectGlobalAgent().sourceCandidates?.some((entry) => entry.itemId === memory.itemId)).toBe(false);
  } finally { db.close(); }
});

it('refuses changed sources at creation and acceptance and never restores inactive or superseded memory', async () => {
  const { subject, book, signals, current, make, create, accept, inspect, prepare } = await sourceDecisions();
  const signal = signals[0]!;
  const candidate = make(create([signal.signalId], '保持合成来源身份。'));
  subject.changeEditorialLearning({ kind: 'material', signalId: signal.signalId });
  expect(() => accept(candidate)).toThrow();
  expect(() => make(create([signal.signalId], candidate.title))).toThrow();
  const material = subject.inspectLearningMaterial(book.bookId, signal.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
    expectedDecisions: material.decisions, choice: 'house', note: null });
  const active = accept(candidate);
  const stop = { itemId: active.itemId, expectedVersionId: active.versionId, actionId: randomUUID() };
  subject.deactivateEditorialMemory(stop); subject.deactivateEditorialMemory(stop);
  expect(current(active.itemId).state).toBe('inactive');
  subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
  subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
  expect(current(active.itemId).state).toBe('inactive');
  const fresh = accept(make(create([signal.signalId], active.title)));
  const proposed = make(create([signal.signalId], active.title));
  const prepared = prepare();
  const preparedTask = prepared.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const window = subject.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  if (signal.kind === 'word-tracked-edit') throw new Error('expected a review decision signal');
  subject.recordProposalDecisionFeedback({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    markId: signal.source.markId!, decisionId: signal.source.decisionId, expectedFeedback: signal.source.reasonRevision,
    action: 'revise', reason: '修订后的合成原因。', reasonSource: 'free-text' });
  expect(inspect().items.find((entry) => entry.current.itemId === fresh.itemId)!.usable).toBe(false);
  expect(() => accept(proposed)).toThrow();
  const check = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try { expect(new HouseReviewPreferenceLedger(check).governanceChanged(preparedTask, () => [])).toBe(true); } finally { check.close(); }
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 2 });
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 3 });
  expect(inspect().items.find((entry) => entry.current.itemId === fresh.itemId)!.usable).toBe(false);
  expect(current(fresh.itemId).title).toBe(active.title);
});

it('previews a real automatic source without inventing a human decision and records the first exclusion only on confirmation', async () => {
  const { subject, book, signals, make, create } = await sourceDecisions();
  const source = signals[0]!;
  const material = subject.inspectLearningMaterial(book.bookId, source.source.materialKey);
  expect(material).toMatchObject({ state: 'pending', decision: null, decisions: 0 });
  const input = { bookId: book.bookId, items: [{ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0 }] };
  const before = subject.previewLearningRemediation(input);
  expect(before).toMatchObject({ included: [{ materialKey: material.materialKey }], scope: 'house', groups: { future: 1, memory: 0 } });
  expect(subject.inspectLearningMaterial(book.bookId, material.materialKey)).toMatchObject({ decision: null, decisions: 0 });
  const candidate = make(create([source.signalId], '自动准入的编辑候选。'));
  const lineage = subject.inspectLearningLineage(book.bookId, material.materialKey);
  expect(lineage).toMatchObject({ material: { decision: null, decisions: 0 }, automaticAdmission: { choice: 'house' }, downstream: { memoryCandidates: 1, activeMemories: 0 } });
  const preview = subject.previewLearningRemediation(input);
  expect(preview.groups.memory).toBe(1);
  subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
  expect(subject.previewLearningRemediation(input).leftOut).toMatchObject([{ reason: 'not-included' }]);
  expect(() => subject.recordLearningRemediation({ ...input, previewDigest: preview.previewDigest })).toThrow();
  expect(subject.inspectLearningMaterial(book.bookId, material.materialKey).decisions).toBe(0);
  subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
  const restored = subject.previewLearningRemediation(input);
  expect(restored.groups).toMatchObject({ future: 1, memory: 1 });
  subject.recordLearningRemediation({ ...input, previewDigest: restored.previewDigest });
  const excluded = subject.inspectLearningLineage(book.bookId, material.materialKey);
  expect(excluded.material).toMatchObject({ decisions: 1, decision: { choice: 'excluded' } });
  expect(excluded.automaticAdmission).toBeNull();
  expect(excluded.decisions[0]).toMatchObject({ ordinal: 1, choice: 'excluded', audit: { supersedes: null } });
  expect(subject.previewLearningRemediation({ ...input, items: [{ ...input.items[0]!, expectedDecisions: 1 }] }).leftOut).toMatchObject([{ reason: 'not-included' }]);
  expect(subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items.find((entry) => entry.current.itemId === candidate.itemId)!.current)
    .toMatchObject({ state: 'proposed' });
  const other = subject.inspectLearningMaterial(book.bookId, signals[2]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: other.materialKey, materialDigest: other.digest, expectedDecisions: 0, choice: 'deferred', note: null });
  expect(subject.previewLearningRemediation({ bookId: book.bookId, items: [{ materialKey: other.materialKey, materialDigest: other.digest, expectedDecisions: 1 }] }).leftOut)
    .toMatchObject([{ reason: 'not-included' }]);
});

it('keeps Book-restricted memory in its source Book and refuses promotion, cross-category creation and incompatible merge', async () => {
  const { subject, book, signals, make, create, accept, govern, current, inspect } = await sourceDecisions();
  const signal = signals[2]!;
  const material = subject.inspectLearningMaterial(book.bookId, signal.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0, choice: 'book', note: null });
  expect(() => make(create([signal.signalId], '不能提升为本社记忆。'))).toThrow();
  const local = accept(make({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [signal.signalId],
    applicability: { kind: 'book', bookId: book.bookId }, title: '仅在来源图书中参考。', editorialDimension: 'typos-and-usage', confidence: 0.5 }));
  expect(() => govern([local], 'correct', '不能改为本社适用。')).toThrow();
  expect(current(local.itemId).applicability).toEqual({ kind: 'book', bookId: book.bookId });
  const house = accept(make(create([signals[0]!.signalId], '独立本社记忆。')));
  expect(() => govern([local, house], 'merge', '不能合并并提升范围。')).toThrow();
  const count = inspect().items.length;
  const input = create([signals[0]!.signalId], '不能猜测另一个编辑类别。');
  expect(() => subject.createEditorialMemory({ ...input, editorialDimension: 'style-and-format' })).toThrow();
  expect(inspect().items).toHaveLength(count);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const ledger = new HouseReviewPreferenceLedger(db);
    expect(ledger.use('ordinary-production', book.bookId, 'typos-and-usage')!.lines).toContain(local.title);
    expect(ledger.use('ordinary-production', randomUUID(), 'typos-and-usage')!.lines).not.toContain(local.title);
  } finally { db.close(); }
});

it('stops a prepared /2 pin of legacy lines at learning-off or Book exclusion, exactly as a /1 pin stops', async () => {
  const { subject, book, signals, make, create, accept, govern, current, prepare } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '冻结后只留旧版偏好。')));
  govern([current(memory.itemId)], 'supervise', '冻结这条合成记忆。', 'freeze');
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.schema).toBe('ai7.house-review-preference/2');
  expect(published.lines.length).toBeGreaterThan(0);
  expect(published.lines.every((line) => line.owner?.kind === 'legacy-preference')).toBe(true);
  const task = prepare().categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const ledger = new HouseReviewPreferenceLedger(db);
    expect(ledger.pinned(task)!.versionId).toBe(published.versionId);
    expect(ledger.governanceChanged(task, () => [])).toBe(false);
    subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
    expect(ledger.governanceChanged(task, () => [])).toBe(true);
    // A legacy line's own basis is its admitting decision: as for the #1116 /1 regression, re-enabling makes it usable again.
    subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
    expect(ledger.governanceChanged(task, () => [])).toBe(false);
    subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 2 });
    expect(ledger.governanceChanged(task, () => [])).toBe(true);
  } finally { db.close(); }
});

it('keeps no-growth governance usable while derived lines yield to memory lines, and still refuses added text past the bound', async () => {
  const { subject, book, signals, make, create, accept, govern, current } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成保留记忆。')));
  const preference = (text: string) => subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'style-and-format', text, effect: 'guide' });
  for (let index = 0; index < 10; index += 1) preference(`合成偏好${index}`);
  const other = subject.inspectLearningMaterial(book.bookId, signals[3]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: other.materialKey, materialDigest: other.digest, expectedDecisions: 0, choice: 'book', note: null });
  const trimmed = subject.inspectHouseReviewPreference().current!;
  expect(trimmed.legacyBasis!.lines).toHaveLength(2);
  expect(trimmed.lines).toHaveLength(12);
  expect(trimmed.lines.some((line) => line.owner?.kind === 'editorial-memory' && line.owner.itemId === memory.itemId)).toBe(true);
  expect(trimmed.lines.some((line) => line.bookId === book.bookId)).toBe(false);
  govern([current(memory.itemId)], 'supervise', '只记录方向，不加文字。', 'guide');
  const legacy = subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'style-and-format')!;
  subject.recordLearningSupervision({ operation: 'supervise', targets: [{ itemId: legacy.itemId, revisionId: legacy.revisionId }], scope: { kind: 'house' },
    categoryId: 'style-and-format', text: '旧版条目也只记录方向。', effect: 'guide' });
  expect(subject.inspectHouseReviewPreference().current!.lines.map((line) => line.text)).toEqual(trimmed.lines.map((line) => line.text));
  const before = subject.inspectHouseReviewPreference().current!.versionId;
  expect(() => preference('超出界限的合成偏好')).toThrow(/12/u);
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(before);
});

it('reads one scope\'s preference influence only, never another scope\'s local pins', async () => {
  const { signals, make, create, accept, prepare } = await sourceDecisions();
  accept(make(create([signals[0]!.signalId], '只属于本范围的合成记忆。')));
  prepare();
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    expect(new HousePreferenceInfluence(db, 'ordinary-production').pins.length).toBeGreaterThan(0);
    expect(new HousePreferenceInfluence(db, 'developer-live').pins).toEqual([]);
    expect(new HousePreferenceInfluence(db, 'development-ci').pins).toEqual([]);
  } finally { db.close(); }
});

it('marks a completed Task withdrawn only by the lines it actually read', async () => {
  const { subject, book, signals, explicit, make, accept, prepare } = await sourceDecisions();
  const unread = accept(make({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [explicit.signalId],
    applicability: { kind: 'house' }, title: '未被读取的合成记忆。', editorialDimension: 'typos-and-usage', confidence: 0 }));
  const later = subject.inspectLearningMaterial(book.bookId, signals[3]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: later.materialKey, materialDigest: later.digest, expectedDecisions: 0, choice: 'house', note: null });
  for (let index = 1; index <= 4; index += 1) subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: `合成较新偏好${index}`, effect: 'guide' });
  const run = prepare();
  const task = run.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try { expect(new HouseReviewPreferenceLedger(db).pinned(task)!.lines).not.toContain(unread.title); } finally { db.close(); }
  subject.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((entry) => entry.planEnvelopeDigest !== null)
    .map((entry) => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
  await driver!.drive(run.reviewRunId);
  // A Book exclusion after the unread memory's control basis withdraws only that memory's source; the read legacy line stands.
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  const lineage = subject.inspectLearningLineage(book.bookId, explicit.source.materialKey);
  expect(lineage.tasks.find((entry) => entry.reviewRunId === run.reviewRunId)).toMatchObject({ use: 'completed', marked: false });
});

it('refuses an over-bound memory title inside the owner before anything is appended', async () => {
  const { subject, signals, make, create, accept } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成标题界限。')));
  const items = subject.inspectGlobalAgent().items;
  const pin = { itemId: memory.itemId, revisionId: memory.versionId };
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const versions = () => Number(db.prepare('SELECT count(*) n FROM global_editorial_memory_item_versions').get()!.n);
    const before = versions();
    db.exec('BEGIN IMMEDIATE');
    try {
      const directive = new SupervisionDirectives(db).record('ordinary-production', { actionId: randomUUID(), operation: 'correct', targets: [pin],
        scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合'.repeat(170), effect: 'guide' }, items);
      expect(() => new EditorialLearningLedger(db).govern(directive, [pin])).toThrow();
      expect(versions()).toBe(before);
    } finally { db.exec('ROLLBACK'); }
  } finally { db.close(); }
});

it('preserves original memory words when the house records a matching person', async () => {
  const { subject, book, signals, make, create, accept } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成甲乙')));
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合成的另一条偏好。', effect: 'guide' });
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.owner?.itemId === memory.itemId)).toBe(true);
  const people = subject.getBookOverview(book.bookId).people;
  subject.updateBookPeople({ bookId: book.bookId, expectedVersion: people.version, authors: ['合成甲乙'], editors: [], related: [] });
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.lines.some((line) => line.owner?.itemId === memory.itemId)).toBe(true);
  expect(published.lines.some((line) => line.text.includes('合成甲乙'))).toBe(true);
  const other = subject.inspectLearningMaterial(book.bookId, signals[3]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: other.materialKey, materialDigest: other.digest, expectedDecisions: 0, choice: 'house', note: null });
  expect(subject.inspectLearningMaterial(book.bookId, other.materialKey).decisions).toBe(1);
});

it('refuses a line-breaking memory title before the candidate is written', async () => {
  const { subject, signals, create, inspect } = await sourceDecisions();
  const count = inspect().items.length;
  expect(() => subject.createEditorialMemory(create([signals[0]!.signalId], '合成第一行\n合成第二行'))).toThrow();
  expect(inspect().items).toHaveLength(count);
});

it('keeps original memory words and revisions stable when people change', async () => {
  const { subject, book, signals, make, create, accept, current } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成丙丁的统一用语')));
  const named = accept(make(create([signals[0]!.signalId], '合成丙丁')));
  const people = subject.getBookOverview(book.bookId).people;
  subject.updateBookPeople({ bookId: book.bookId, expectedVersion: people.version, authors: ['合成丙丁'], editors: [], related: [] });
  expect(subject.inspectHouseReviewPreference().current!.lines.map((line) => line.text)).toEqual(expect.arrayContaining(['合成丙丁的统一用语', '合成丙丁']));
  expect(subject.inspectGlobalAgent().sourceCandidates!.filter((item) => item.kind === 'memory').map((item) => item.text))
    .toEqual(expect.arrayContaining(['合成丙丁的统一用语', '合成丙丁']));
  expect([current(memory.itemId).versionId, current(named.itemId).versionId]).toEqual([memory.versionId, named.versionId]);
});

it('reserves capacity for still-active memories across a Book exclusion, refuses only the overflowing admission and restores without a second accept', async () => {
  const { subject, book, signals, make, create, accept, current, govern, sourceBook } = await sourceDecisions();
  const fromA = Array.from({ length: 7 }, (_, index) => accept(make(create([signals[0]!.signalId], `合成甲${index}`))));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  const other = await sourceBook('合成第二来源');
  const fromB = (title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: [other.signals[0]!.signalId], applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const b = Array.from({ length: 5 }, (_, index) => accept(make(fromB(`合成乙${index}`))));
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory')).toHaveLength(5);
  const sixth = make(fromB('合成乙5'));
  const before = { preference: subject.inspectHouseReviewPreference().current!.versionId, history: subject.inspectHouseReviewPreference().history.length };
  expect(() => accept(sixth)).toThrow(/12 条/u);
  expect(current(sixth.itemId)).toMatchObject({ versionId: sixth.versionId, state: 'proposed' });
  expect(subject.inspectHouseReviewPreference()).toMatchObject({ current: { versionId: before.preference } });
  expect(subject.inspectHouseReviewPreference().history).toHaveLength(before.history);
  // A merge counts its successor once; freezing or deactivating an owner releases its place.
  const merged = govern([b[0]!, b[1]!], 'merge', '合成乙合并');
  expect(merged.items.filter((entry) => entry.kind === 'memory' && entry.state === 'active')).toHaveLength(11);
  accept(sixth);
  expect(() => accept(make(fromB('合成乙6')))).toThrow(/12 条/u);
  govern([b[2]!], 'supervise', '冻结一条合成记忆。', 'freeze');
  const seventh = accept(make(fromB('合成乙7')));
  const stop = current(b[3]!.itemId);
  subject.deactivateEditorialMemory({ itemId: stop.itemId, expectedVersionId: stop.versionId, actionId: randomUUID() });
  accept(make(fromB('合成乙8')));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines).toHaveLength(12);
  expect(restored.lines.every((line) => line.owner?.kind === 'editorial-memory')).toBe(true);
  for (const memory of [...fromA, seventh]) expect(current(memory.itemId).versionId).toBe(memory.versionId);
  expect(fromA.every((memory) => restored.lines.some((line) => line.owner?.itemId === memory.itemId))).toBe(true);
});

it('holds the 200-grapheme reservation across exclusion, active correction, explicit legacy lines and name changes', async () => {
  const { subject, book, signals, make, create, accept, current, govern, sourceBook } = await sourceDecisions();
  const long = accept(make(create([signals[0]!.signalId], '甲'.repeat(120))));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  const other = await sourceBook('合成字数来源');
  const fromB = (title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: [other.signals[0]!.signalId], applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  expect(() => accept(make(fromB('乙'.repeat(100))))).toThrow(/200 字/u);
  const exact = accept(make(fromB(`合成丙丁${'乙'.repeat(76)}`)));
  // Exactly 200 reserved: an active correction replaces its own slot, and one more grapheme refuses atomically.
  const corrected = govern([exact], 'correct', `合成丙丁${'丙'.repeat(76)}`);
  const sameSize = current(exact.itemId);
  expect(sameSize.title).toBe(`合成丙丁${'丙'.repeat(76)}`);
  const directives = corrected.directives.length;
  expect(() => govern([sameSize], 'correct', `合成丙丁${'丙'.repeat(77)}`)).toThrow(/200 字/u);
  expect(subject.inspectGlobalAgent().directives).toHaveLength(directives);
  expect(current(exact.itemId).versionId).toBe(sameSize.versionId);
  expect(() => subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format',
    text: '合成旧版偏好', effect: 'guide' })).toThrow(/200 字/u);
  // People changes preserve the original words and their existing capacity reservation.
  const people = subject.getBookOverview(other.book.bookId).people;
  subject.updateBookPeople({ bookId: other.book.bookId, expectedVersion: people.version, authors: ['合成丙丁'], editors: [], related: [] });
  expect(subject.inspectHouseReviewPreference().current!.lines.find((line) => line.owner?.itemId === exact.itemId)!.text).toBe('合成丙丁' + '丙'.repeat(76));
  expect(() => accept(make(fromB('乙')))).toThrow(/200 字/u);
  subject.updateBookPeople({ bookId: other.book.bookId, expectedVersion: people.version + 1, authors: [], editors: [], related: [] });
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.text).sort())
    .toEqual(['甲'.repeat(120), `合成丙丁${'丙'.repeat(76)}`].sort());
  expect(current(long.itemId).versionId).toBe(long.versionId);
  // An explicit legacy line reserves its place too, and freezing an owner releases it.
  govern([current(long.itemId)], 'supervise', '冻结长记忆。', 'freeze');
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合'.repeat(100), effect: 'guide' });
  expect(() => accept(make(fromB('乙'.repeat(21))))).toThrow(/200 字/u);
  accept(make(fromB('乙'.repeat(20))));
});

it.each(['material', 'book'] as const)('reserves a legacy correction whose source is reversibly excluded (%s), so restoration never overflows', async (exclusion) => {
  const { subject, book, explicit, make, accept, sourceBook } = await sourceDecisions();
  const legacyItem = () => subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage');
  const derived = legacyItem()!;
  // A still-eligible automatic signal of another Book, so neither exclusion reaches the memory's own source.
  const other = (await sourceBook('合成另一来源')).signals[0]!;
  const create = (title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [other.signalId],
    applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const correct = (text: string) => { const item = legacyItem()!; subject.recordLearningSupervision({ operation: 'correct', targets: [{ itemId: item.itemId, revisionId: item.revisionId }],
    scope: { kind: 'house' }, categoryId: 'typos-and-usage', text, effect: 'guide' }); };
  // A correction replaces its own reservation.
  correct('合'.repeat(150));
  correct('合'.repeat(120));
  const material = () => subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  const exclude = () => exclusion === 'material'
    ? subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'excluded', note: null })
    : subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  const restore = () => exclusion === 'material'
    ? subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'house', note: null })
    : subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  exclude();
  // A material exclusion removes the derived base the correction replays over; a Book exclusion keeps it (the negative control).
  expect(subject.inspectGlobalAgent().items.some((entry) => entry.itemId === derived.itemId)).toBe(exclusion === 'book');
  const versions = subject.inspectHouseReviewPreference().history.length;
  const overflowing = make(create('乙'.repeat(81)));
  expect(() => accept(overflowing)).toThrow(/200 字/u);
  expect(subject.inspectHouseReviewPreference().history).toHaveLength(versions);
  const fitting = accept(make(create('乙'.repeat(80))));
  restore();
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines.map((line) => line.text).sort()).toEqual(['合'.repeat(120), '乙'.repeat(80)].sort());
  expect(restored.lines.find((line) => line.owner?.itemId === fitting.itemId)).toBeDefined();
});

it('reserves a line for an excluded legacy correction beside twelve memories, and freezing the correction releases it', async () => {
  const { subject, book, signals, explicit, make, create, accept } = await sourceDecisions();
  const legacyItem = () => subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage')!;
  const item = legacyItem();
  subject.recordLearningSupervision({ operation: 'correct', targets: [{ itemId: item.itemId, revisionId: item.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '合成更正的旧版偏好', effect: 'guide' });
  const material = () => subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'excluded', note: null });
  const other = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  for (let index = 0; index < 11; index += 1) accept(make(create([other.signalId], `合成记忆${index}`)));
  const twelfth = make(create([other.signalId], '合成记忆11'));
  expect(() => accept(twelfth)).toThrow(/12 条/u);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'house', note: null });
  expect(subject.inspectHouseReviewPreference().current!.lines).toHaveLength(12);
  const corrected = legacyItem();
  subject.recordLearningSupervision({ operation: 'supervise', targets: [{ itemId: corrected.itemId, revisionId: corrected.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '冻结更正。', effect: 'freeze' });
  accept(twelfth);
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory')).toHaveLength(12);
});

it('counts a legacy merge over an excluded derived parent once, and its deactivation releases the place', async () => {
  const { subject, book, signals, explicit, make, create, accept } = await sourceDecisions();
  const legacy = () => subject.inspectGlobalAgent().items.filter((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage' && entry.state === 'active');
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合'.repeat(40), effect: 'guide' });
  const parents = legacy();
  expect(parents).toHaveLength(2);
  subject.recordLearningSupervision({ operation: 'merge', targets: parents.map(({ itemId, revisionId }) => ({ itemId, revisionId })), scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '并'.repeat(100), effect: 'guide' });
  const material = () => subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'excluded', note: null });
  expect(legacy()).toEqual([]);
  const other = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  expect(() => accept(make(create([other.signalId], '乙'.repeat(101))))).toThrow(/200 字/u);
  const fitting = accept(make(create([other.signalId], '乙'.repeat(100))));
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'house', note: null });
  expect(subject.inspectHouseReviewPreference().current!.lines.map((line) => line.text).sort()).toEqual(['并'.repeat(100), '乙'.repeat(100)].sort());
  const merged = legacy()[0]!;
  subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: merged.itemId, revisionId: merged.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '', effect: 'guide' });
  accept(make(create([other.signalId], '丙'.repeat(100))));
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.owner!.itemId))
    .toContain(fitting.itemId);
});

it('ranks a /2 version\'s legacy lines by their /1 dating, not by array position', async () => {
  const { subject, book, signals, make, create, accept, govern, current } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '冻结后仍保持 /2。')));
  govern([current(memory.itemId)], 'supervise', '冻结这条合成记忆。', 'freeze');
  const newer = Array.from({ length: 5 }, (_, index) => `合成新偏好${index + 1}`);
  for (const text of newer) subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text, effect: 'guide' });
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.schema).toBe('ai7.house-review-preference/2');
  expect(published.lines.find((line) => line.owner?.kind === 'legacy-preference' && line.owner.itemId.startsWith('preference:'))!.categoryId).toBe('typos-and-usage');
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    // The derived line dates from its older admitting decision, as in /1; the five newer editor lines take the Top-5.
    const used = new HouseReviewPreferenceLedger(db).use('ordinary-production', book.bookId, 'typos-and-usage')!;
    expect([...used.lines].sort()).toEqual([...newer].sort());
  } finally { db.close(); }
});
