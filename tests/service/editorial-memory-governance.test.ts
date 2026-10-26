import { constructPre94PolicyEncoding } from '../support/analysis-ledger-revisions.js';
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
import { EditorialLearningLedger, EDITORIAL_LEARNING_TRIGGER_SQL } from '../../src/service/learning/ledger.js';
import { HousePreferenceInfluence, HouseReviewPreferenceLedger, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL } from '../../src/service/house-review-preference.js';
import { SupervisionDirectives } from '../../src/service/learning/supervision-directives.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
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
  subject.createEditorialMemory(input);
  expect(() => subject.createEditorialMemory({ ...input, title: `${input.title} ` })).toThrow();
  expect(inspect().items).toHaveLength(1);
  expect(first.sources.map((source) => source.admission.kind)).toEqual(['automatic', 'explicit']);
  expect(first.sources[0]!.admission).not.toHaveProperty('decisionId');
  expect(first.state).toBe('proposed');
  expect(subject.inspectGlobalAgent().sourceCandidates?.some((entry) => entry.itemId === first.itemId)).toBe(false);
  expect(subject.inspectLearningLineage(book.bookId, automatic.source.materialKey).downstream.memoryCandidates).toBe(1);
  const a = accept(first);
  expect(() => accept(first)).toThrow();
  const b = accept(make(create([automatic.signalId, signals[2]!.signalId], '保留合成表达节奏。')));
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.schema).toBe('ai7.house-review-preference/2');
  expect(published.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.owner!.itemId).sort()).toEqual([a.itemId, b.itemId].sort());
  expect(published.sourceCount).toBe(3);
  const global = subject.inspectGlobalAgent();
  for (const memory of [a, b]) {
    expect(global.items.filter((entry) => entry.itemId === memory.itemId)).toHaveLength(1);
    expect(global.sourceCandidates?.filter((entry) => entry.itemId === memory.itemId)).toHaveLength(1);
    expect(global.items.some((entry) => entry.itemId === `memory:${memory.itemId}`)).toBe(false);
  }
  const pin: GlobalMemoryPin = { itemId: a.itemId, revisionId: a.versionId };
  const corrected = govern([a], 'correct', a.title);
  expect(current(a.itemId).versionId).not.toBe(a.versionId);
  expect(current(b.itemId).versionId).toBe(b.versionId);
  expect(subject.globalAgentSourcesCurrent([pin])).toBe(false);
  const directive = corrected.directives.at(-1)!;
  subject.recordLearningSupervision({ actionId: directive.actionId!, operation: directive.operation, targets: directive.targets,
    scope: directive.scope, categoryId: directive.categoryId, text: directive.text, effect: directive.effect });
  expect(subject.inspectGlobalAgent().directives.at(-1)!.directiveId).toBe(directive.directiveId);
  expect(() => govern([a], 'correct', '失效版本不能修正。')).toThrow();
  // A derived line yields to an active correction (Brief revision 7); an overflow of the owners' own reserved words refuses atomically.
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
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const sources = new EditorialLearningLedger(db).effectiveSources(combined);
    expect(sources).toHaveLength(3);
    expect(db.prepare('SELECT source_signal_id FROM global_editorial_memory_items WHERE item_id = ?').get(combined.itemId)!.source_signal_id).toBe(sources[0]!.signalId);
  } finally { db.close(); }
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
    expect(pin).not.toHaveProperty('sources');
    expect(pin).not.toHaveProperty('admission');
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
    expect(ledger.governanceChanged(oldTask, () => [])).toBe(false);
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

it('pages mixed immutable history and validates source/directive ancestry beyond the visible thirty records', async () => {
  const { subject, signals, current, make, create, accept, govern } = await sourceDecisions();
  subject.createEditorialMemory({ clientMemoryId: randomUUID(), signalId: signals[0]!.signalId, title: '旧版引用记忆', editorialDimension: '原有自由维度', confidence: 0.5 });
  const dbPath = join(roots!.dataRoot, 'store', 'ai7.sqlite');
  const db = new DatabaseSync(dbPath);
  const legacy = db.prepare("SELECT canonical_json FROM global_editorial_memory_item_versions WHERE json_extract(canonical_json, '$.schema') = 'ai7.global-editorial-memory/1'").all();
  db.close();
  const first = make(create([signals[0]!.signalId], '合成不可变来源。'));
  accept(first);
  for (let index = 0; index < 31; index += 1) govern([current(first.itemId)], 'correct', `合成审阅原则${index}。`);
  const page = subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: first.itemId });
  expect(page.items[0]!.history).toHaveLength(30);
  expect(page.items[0]!.nextHistoryOffset).toBe(30);
  const older = subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: first.itemId, historyOffset: 30 });
  expect(older.items[0]!.history[0]!.versionId).toBe(first.versionId);
  subject.markCleanShutdown(); subject.close(); store = undefined;
  store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
  const checked = new DatabaseSync(dbPath);
  try {
    expect(checked.prepare("SELECT canonical_json FROM global_editorial_memory_item_versions WHERE json_extract(canonical_json, '$.schema') = 'ai7.global-editorial-memory/1'").all()).toEqual(legacy);
  } finally { checked.close(); }
  store.markCleanShutdown(); store.close(); store = undefined;
  const corrupt = new DatabaseSync(dbPath);
  try {
    const row = corrupt.prepare('SELECT canonical_json FROM global_editorial_memory_item_versions WHERE version_id = ?').get(first.versionId)!;
    const record = JSON.parse(String(row.canonical_json)) as EditorialMemoryVersion;
    const tampered = canonicalRecord({ ...record, sources: record.sources.map((source) => ({ ...source, sourceKey: '0'.repeat(64) })) });
    corrupt.exec('DROP TRIGGER global_editorial_memory_item_versions_no_update');
    corrupt.prepare('UPDATE global_editorial_memory_item_versions SET canonical_json = ?, sha256 = ? WHERE version_id = ?').run(tampered.json, tampered.digest, first.versionId);
    corrupt.exec(EDITORIAL_LEARNING_TRIGGER_SQL['global_editorial_memory_item_versions_no_update']!);
  } finally { corrupt.close(); }
  await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot)).rejects.toThrow();
}, 60_000);

it('exports/replaces all /2 state and carries consumed Book history across merge without transferring House authority', async () => {
  const { subject, book, signals, make, create, accept, prepare } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成历史偏好不转移本社权限。')));
  const run = prepare();
  subject.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((entry) => entry.planEnvelopeDigest !== null)
    .map((entry) => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
  await driver!.drive(run.reviewRunId);
  const task = run.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const neverConsumed = prepare();
  expect(subject.inspectReviewWorkspace(book.bookId, neverConsumed.reviewRunId).run!.influence).toEqual([]);
  expect(subject.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.influence[0]!.materials.some((source) => source.provenanceAvailability === 'available')).toBe(true);
  subject.changeEditorialLearning({ kind: 'material', signalId: signals[0]!.signalId });
  const before = subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
  const destination = join(roots!.inputRoot, 'memory-history.ai7db');
  const preparedExport = await subject.prepareDatabaseExport(destination, true);
  expect((await subject.approveDatabaseExport(preparedExport.preparationId, true)).outcome).toBe('created');
  const replacementRoots = await createServiceTestRoots('ai7-memory-replacement-');
  const mergedRoots = await createServiceTestRoots('ai7-memory-merge-');
  let replacement: EditorialStore | undefined; let merged: EditorialStore | undefined;
  try {
    replacement = await EditorialStore.open(replacementRoots.dataRoot, replacementRoots.codeRoot);
    await replacement.prepareDatabaseReplacement((await replacement.inspectDatabaseImport(destination)).previewId);
    replacement.markCleanShutdown(); replacement.close(); replacement = undefined;
    replacement = await EditorialStore.open(replacementRoots.dataRoot, replacementRoots.codeRoot);
    expect(replacement.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items).toEqual(before.items);
    merged = await EditorialStore.open(mergedRoots.dataRoot, mergedRoots.codeRoot);
    await merged.prepareDatabaseMerge((await merged.inspectDatabaseImport(destination)).previewId);
    merged.markCleanShutdown(); merged.close(); merged = undefined;
    merged = await EditorialStore.open(mergedRoots.dataRoot, mergedRoots.codeRoot);
    expect(merged.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items).toEqual([]);
    expect(merged.inspectGlobalAgent().items).toEqual([]);
    expect(merged.inspectGlobalAgent().sourceCandidates).toEqual([]);
    expect(merged.inspectGlobalAgent().directives).toEqual([]);
    expect(merged.inspectHouseReviewPreference().current).toBeNull();
    expect(merged.inspectReviewWorkspace(book.bookId, neverConsumed.reviewRunId).run!.influence).toEqual([]);
    const influence = merged.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!.influence;
    expect(influence).toHaveLength(1);
    expect(influence[0]!.materials.some((source) => source.provenanceAvailability === 'unavailable' && source.materialKey === null && source.withdrawnAt !== null)).toBe(true);
    const db = new DatabaseSync(join(mergedRoots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const ledger = new HouseReviewPreferenceLedger(db);
      expect(() => ledger.pinnedInfluence(task)).toThrow();
      expect(ledger.pinnedInfluence(task, { historical: true })!.preference.lines).toContain(memory.title);
      expect(ledger.use('ordinary-production', book.bookId, 'typos-and-usage')).toBeNull();
      const row = db.prepare('SELECT canonical_json FROM review_run_preference_pins WHERE task_intent_id = ?').get(task)!;
      const pin = JSON.parse(String(row.canonical_json)) as { snapshot: { lines: Array<{ sources: Array<{ sourceKey?: string }> }> } };
      pin.snapshot.lines.flatMap((line) => line.sources).find((source) => source.sourceKey !== undefined)!.sourceKey = '0'.repeat(64);
      const damaged = canonicalRecord(pin);
      db.exec('DROP TRIGGER review_run_preference_pins_no_update');
      db.prepare('UPDATE review_run_preference_pins SET canonical_json = ?, sha256 = ? WHERE task_intent_id = ?').run(damaged.json, damaged.digest, task);
      db.exec(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL['review_run_preference_pins_no_update']!);
      expect(() => ledger.pinnedInfluence(task, { historical: true })).toThrow();
      expect(() => ledger.validate()).toThrow();
    } finally { db.close(); }
  } finally {
    replacement?.close(); merged?.close(); await replacementRoots.dispose(); await mergedRoots.dispose();
  }
}, 60_000);

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

it('never infers automatic remediation from missing/superseded keys or a candidate, and refuses corrupt source lineage', async () => {
  const { subject, book, signals, make, create } = await sourceDecisions();
  const stale = signals[0]!;
  make(create([stale.signalId], '旧来源的编辑候选。'));
  subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
  const window = subject.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  if (stale.kind === 'word-tracked-edit') throw new Error('expected a review decision signal');
  subject.recordProposalDecisionFeedback({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    markId: stale.source.markId!, decisionId: stale.source.decisionId, expectedFeedback: stale.source.reasonRevision,
    action: 'revise', reason: '停用期间的新合成原因。', reasonSource: 'free-text' });
  subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
  const preview = (signal: (typeof signals)[number]) => {
    const material = subject.inspectLearningMaterial(book.bookId, signal.source.materialKey);
    return subject.previewLearningRemediation({ bookId: book.bookId, items: [{ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions }] });
  };
  expect(preview(stale).leftOut).toMatchObject([{ reason: 'not-included' }]);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    db.exec('DROP TRIGGER learning_signals_no_delete');
    db.prepare('DELETE FROM learning_signals WHERE signal_id = ?').run(signals[2]!.signalId);
    db.exec(EDITORIAL_LEARNING_TRIGGER_SQL['learning_signals_no_delete']!);
    expect(preview(signals[2]!).leftOut).toMatchObject([{ reason: 'not-included' }]);
    db.exec('DROP TRIGGER learning_signals_no_update');
    db.prepare('UPDATE learning_signals SET sha256 = ? WHERE signal_id = ?').run('0'.repeat(64), signals[3]!.signalId);
    db.exec(EDITORIAL_LEARNING_TRIGGER_SQL['learning_signals_no_update']!);
    expect(() => preview(signals[3]!)).toThrow();
  } finally { db.close(); }
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

it.each(['parent', 'directive'] as const)('refuses a rehashed corrupt %s reference with the exact schema/triggers restored', async (damage) => {
  const { subject, signals, make, create, accept, govern, current } = await sourceDecisions();
  const first = accept(make(create([signals[0]!.signalId], '第一条合成治理记忆。')));
  const second = accept(make(create([signals[2]!.signalId], '第二条合成治理记忆。')));
  govern([first], 'correct', '修正第一条合成记忆。');
  const foreign = govern([second], 'correct', '修正第二条合成记忆。').directives.at(-1)!;
  const changed = current(first.itemId);
  subject.markCleanShutdown(); subject.close(); store = undefined;
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const record = canonicalRecord(damage === 'parent' ? { ...changed, parentVersions: [{ itemId: changed.itemId, versionId: changed.versionId }] }
      : { ...changed, supervisionDirectiveRefs: [foreign.directiveId] });
    db.exec('DROP TRIGGER global_editorial_memory_item_versions_no_update');
    db.prepare('UPDATE global_editorial_memory_item_versions SET canonical_json = ?, sha256 = ? WHERE version_id = ?').run(record.json, record.digest, changed.versionId);
    db.exec(EDITORIAL_LEARNING_TRIGGER_SQL['global_editorial_memory_item_versions_no_update']!);
  } finally { db.close(); }
  await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot)).rejects.toThrow();
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

it('publishes no line for a memory whose words become a recorded name, without failing the people change or a later rebuild', async () => {
  const { subject, book, signals, make, create, accept } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成甲乙')));
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合成的另一条偏好。', effect: 'guide' });
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.owner?.itemId === memory.itemId)).toBe(true);
  const people = subject.getBookOverview(book.bookId).people;
  subject.updateBookPeople({ bookId: book.bookId, expectedVersion: people.version, authors: ['合成甲乙'], editors: [], related: [] });
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.lines.some((line) => line.owner?.itemId === memory.itemId)).toBe(false);
  expect(published.lines.some((line) => line.text.includes('合成甲乙'))).toBe(false);
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

it('refilters a memory-only House by its names now: a fresh Run reads it, the old pin stays stale and a removed name restores the line', async () => {
  const { subject, book, signals, make, create, accept, prepare, current } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成丙丁的统一用语')));
  const named = accept(make(create([signals[0]!.signalId], '合成丙丁')));
  expect(subject.inspectGlobalAgent().directives).toEqual([]);
  const task = (run: ReturnType<typeof prepare>) => run.categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const old = task(prepare());
  const lineOf = (itemId: string) => subject.inspectHouseReviewPreference().current!.lines.find((line) => line.owner?.itemId === itemId);
  expect(lineOf(memory.itemId)!.text).toBe('合成丙丁的统一用语');
  const people = subject.getBookOverview(book.bookId).people;
  subject.updateBookPeople({ bookId: book.bookId, expectedVersion: people.version, authors: ['合成丙丁'], editors: [], related: [] });
  expect(lineOf(memory.itemId)!.text).toBe('的统一用语');
  expect(lineOf(named.itemId)).toBeUndefined();
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const ledger = new HouseReviewPreferenceLedger(db);
    const names = () => ['合成丙丁'];
    expect(ledger.governanceChanged(old, names)).toBe(true);
    const fresh = task(prepare());
    expect(ledger.pinned(fresh)!.lines).toContain('的统一用语');
    expect(ledger.pinned(fresh)!.lines.join('')).not.toContain('合成丙丁');
    expect(ledger.governanceChanged(fresh, names)).toBe(false);
  } finally { db.close(); }
  subject.updateBookPeople({ bookId: book.bookId, expectedVersion: people.version + 1, authors: [], editors: [], related: [] });
  expect(lineOf(memory.itemId)!.text).toBe('合成丙丁的统一用语');
  expect(lineOf(named.itemId)!.text).toBe('合成丙丁');
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
  // A recorded name shortens what is sent, never what is reserved: removing it again cannot overflow.
  const people = subject.getBookOverview(other.book.bookId).people;
  subject.updateBookPeople({ bookId: other.book.bookId, expectedVersion: people.version, authors: ['合成丙丁'], editors: [], related: [] });
  expect(subject.inspectHouseReviewPreference().current!.lines.find((line) => line.owner?.itemId === exact.itemId)!.text).toBe('丙'.repeat(76));
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

it('scans each referenced memory chain once per read, afresh on the next read, through a shared-parent DAG and past page 30', async () => {
  const { subject, signals, current, make, create, accept, govern } = await sourceDecisions();
  const first = accept(make(create([signals[0]!.signalId], '合成计数记忆。')));
  const second = accept(make(create([signals[2]!.signalId], '合成第二条计数记忆。')));
  for (let index = 0; index < 31; index += 1) govern([current(first.itemId)], 'correct', `合成计数原则${index}。`);
  const active = (projection: ReturnType<typeof govern>, state: 'active' | 'proposed', known: ReadonlyArray<string>) =>
    projection.items.find((entry) => entry.kind === 'memory' && entry.state === state && !known.includes(entry.itemId))!.itemId;
  const merged = active(govern([current(first.itemId), current(second.itemId)], 'merge', '合成计数合并。'), 'active', []);
  // The second merge reaches the first item's chain both through the merged item and through its own retired version.
  const shared = active(govern([current(merged), current(first.itemId)], 'merge', '合成共享祖先合并。'), 'proposed', []);
  accept(current(shared));
  const dbPath = join(roots!.dataRoot, 'store', 'ai7.sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    // Deterministic work: executions of the complete item-history scan, by item, whatever statement object runs it.
    const full = 'SELECT * FROM global_editorial_memory_item_versions WHERE item_id = ? ORDER BY ordinal';
    const scans = (operation: () => unknown): Map<string, number> => {
      const prepare = db.prepare.bind(db);
      const counts = new Map<string, number>();
      const spy = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        const statement = prepare(sql);
        if (sql !== full) return statement;
        for (const method of ['iterate', 'all', 'get'] as const) {
          const run = (statement[method] as (...args: unknown[]) => unknown).bind(statement);
          Object.defineProperty(statement, method, { value: (...args: unknown[]) => {
            counts.set(String(args[0]), (counts.get(String(args[0])) ?? 0) + 1); return run(...args);
          } });
        }
        return statement;
      });
      try { operation(); } finally { spy.mockRestore(); }
      return counts;
    };
    const items = db.prepare('SELECT item_id FROM global_editorial_memory_items').all().map((row) => String(row.item_id)).sort();
    expect(items).toEqual([first.itemId, second.itemId, merged, shared].sort());
    expect(current(first.itemId).ordinal).toBeGreaterThan(31);
    const ledger = new HouseReviewPreferenceLedger(db);
    for (const operation of [() => ledger.history('ordinary-production'), () => new EditorialLearningLedger(db).validate(),
      () => ledger.history('ordinary-production')]) {
      const counts = scans(operation);
      expect([...counts.keys()].sort()).toEqual(items);
      expect([...counts.values()].every((count) => count === 1)).toBe(true);
    }
    // A mutation between reads is read, not served from an earlier read.
    govern([current(shared)], 'correct', '合成计数最新原则。');
    expect(ledger.history('ordinary-production').at(-1)!.lines.some((line) => line.text === '合成计数最新原则。')).toBe(true);
    // So is corruption beyond the first visible page of thirty versions.
    const row = db.prepare('SELECT canonical_json FROM global_editorial_memory_item_versions WHERE version_id = ?').get(first.versionId)!;
    const tampered = canonicalRecord({ ...(JSON.parse(String(row.canonical_json)) as EditorialMemoryVersion), confidence: 0.1 });
    db.exec('DROP TRIGGER global_editorial_memory_item_versions_no_update');
    db.prepare('UPDATE global_editorial_memory_item_versions SET canonical_json = ?, sha256 = ? WHERE version_id = ?').run(tampered.json, tampered.digest, first.versionId);
    db.exec(EDITORIAL_LEARNING_TRIGGER_SQL['global_editorial_memory_item_versions_no_update']!);
    expect(() => ledger.history('ordinary-production')).toThrow();
    expect(() => new EditorialLearningLedger(db).validate()).toThrow();
    expect(() => ledger.history('ordinary-production')).toThrow();
  } finally { db.close(); }
}, 120_000);

it('refuses a rebuild over a corrupt control rather than reading an accepted automatic-source memory as unavailable', async () => {
  const { subject, signals, make, create, accept, inspect } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成自动来源记忆。')));
  const published = subject.inspectHouseReviewPreference().current!;
  const line = published.lines.find((entry) => entry.owner?.itemId === memory.itemId)!;
  expect(line.sources.every((source) => source.kind === 'editorial-memory' && source.currentAdmission.kind === 'automatic' &&
    source.captured.admission.controls.switchEntryId === null && source.captured.admission.controls.bookEntryId === null &&
    source.currentAdmission.controls.switchEntryId === null && source.currentAdmission.controls.bookEntryId === null)).toBe(true);
  // An unrelated Book's control is a later row this memory's publication never names.
  const other = await importSample1Book(subject, roots!.codeRoot, '合成无关图书');
  subject.changeEditorialLearning({ kind: 'book', bookId: other.bookId, excluded: true, expectedEntries: 0 });
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(published.versionId);
  expect(inspect().items.find((entry) => entry.current.itemId === memory.itemId)!.usable).toBe(true);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const row = db.prepare("SELECT entry_id, canonical_json FROM editorial_learning_controls WHERE kind = 'book'").get()!;
    const damaged = canonicalRecord({ ...(JSON.parse(String(row.canonical_json)) as Record<string, unknown>), recordedAt: '2000-01-01T00:00:00.000Z' });
    db.exec('DROP TRIGGER editorial_learning_controls_no_update');
    db.prepare('UPDATE editorial_learning_controls SET canonical_json = ?, sha256 = ? WHERE entry_id = ?').run(damaged.json, damaged.digest, String(row.entry_id));
    db.exec(EDITORIAL_LEARNING_TRIGGER_SQL['editorial_learning_controls_no_update']!);
  } finally { db.close(); }
  const versions = subject.inspectHouseReviewPreference().history.length;
  expect(() => subject.rebuildHouseReviewPreference()).toThrow();
  expect(() => subject.rebuildHouseReviewPreference()).toThrow();
  expect(subject.inspectHouseReviewPreference().history).toHaveLength(versions);
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(published.versionId);
  expect(() => inspect()).toThrow();
  expect(() => subject.inspectGlobalAgent()).toThrow();
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

function historicalFixtureRows(db: DatabaseSync) {
  return db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((table) => ({
    table: String(table.name), rows: db.prepare(/WITHOUT\s+ROWID/iu.test(String(table.sql))
      ? `SELECT * FROM "${String(table.name).replaceAll('"', '""')}"`
      : `SELECT rowid AS fixture_rowid, * FROM "${String(table.name).replaceAll('"', '""')}" ORDER BY rowid`).all(),
  }));
}

/** Only the two explicitly leased disposable revision90 setups call this historical-format constructor. */
function constructHistoricalRequestFormat(db: DatabaseSync) {
  constructPre94PolicyEncoding(db);
  expect(db.prepare('SELECT count(*) total FROM analysis_clarification_requests').get()!.total).toBe(0);
  expect(db.prepare('SELECT count(*) total FROM analysis_clarification_answers').get()!.total).toBe(0);
  const fields = [
    ['analysis_run_states', ['requestAdmission', 'requestRefusal']],
    ['analysis_unit_checkpoints', ['requests']], ['analysis_clarification_requests', ['requests']],
  ] as const;
  const affected = new Set<string>(fields.map(([table]) => table));
  const before = historicalFixtureRows(db);
  const immutable = before.filter((entry) => !affected.has(entry.table));
  const triggers = db.prepare("SELECT name, tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name").all();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, properties] of fields) {
      const rows = db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all();
      const changed = rows.flatMap((row) => {
        const record = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
        if (!properties.some((property) => Object.hasOwn(record, property))) return [];
        for (const property of properties) delete record[property];
        return [{ row, record: canonicalRecord(record) }];
      });
      const owned = triggers.filter((trigger) => trigger.tbl_name === table);
      if (changed.length !== 0) {
        for (const trigger of owned) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
        for (const { row, record } of changed) db.prepare(`UPDATE ${table} SET canonical_json = ?, sha256 = ? WHERE rowid = ?`)
          .run(record.json, record.digest, row.rowid!);
        for (const trigger of owned) db.exec(String(trigger.sql));
      }
      const expected = rows.map((row) => {
        const rewritten = changed.find((entry) => entry.row.rowid === row.rowid);
        return rewritten === undefined ? row : { ...row, canonical_json: rewritten.record.json, sha256: rewritten.record.digest };
      });
      expect(db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all()).toEqual(expected);
      for (const property of properties) expect(db.prepare(`SELECT count(*) total FROM ${table} WHERE json_type(canonical_json, '$.${property}') IS NOT NULL`).get()!.total).toBe(0);
    }
    expect(historicalFixtureRows(db).filter((entry) => !affected.has(entry.table))).toEqual(immutable);
    expect(db.prepare("SELECT name, tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name").all()).toEqual(triggers);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { rows: historicalFixtureRows(db).filter((entry) => affected.has(entry.table)), triggers };
}

it('advances to the current reader over a revision-90 store of /1 records without changing a byte', async () => {
  const { subject, signals } = await sourceDecisions();
  subject.createEditorialMemory({ clientMemoryId: randomUUID(), signalId: signals[0]!.signalId, title: '旧版引用记忆', editorialDimension: '原有自由维度', confidence: 0.5 });
  expect(subject.inspectHouseReviewPreference().current!.schema).toBe('ai7.house-review-preference/1');
  subject.markCleanShutdown(); subject.close(); store = undefined;
  const dbPath = join(roots!.dataRoot, 'store', 'ai7.sqlite');
  const learningRows = (db: DatabaseSync) => ['learning_signals', 'editorial_learning_controls', 'global_editorial_memory_items', 'global_editorial_memory_item_versions',
    'house_review_preference_versions', 'review_run_preference_pins', 'learning_supervision_directives'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const legacy = new DatabaseSync(dbPath);
  let before: unknown;
  let constructed!: ReturnType<typeof constructHistoricalRequestFormat>;
  try {
    before = learningRows(legacy); constructed = constructHistoricalRequestFormat(legacy);
    expect(learningRows(legacy)).toEqual(before); legacy.exec('PRAGMA user_version = 90');
  } finally { legacy.close(); }
  store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
  store.markCleanShutdown(); store.close(); store = undefined;
  const stamped = new DatabaseSync(dbPath);
  try {
    expect(stamped.prepare('PRAGMA user_version').get()!.user_version).toBe(95); expect(learningRows(stamped)).toEqual(before);
    expect(historicalFixtureRows(stamped).filter((entry) => constructed.rows.some((prior) => prior.table === entry.table))).toEqual(constructed.rows);
    expect(stamped.prepare("SELECT name, tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name").all()).toEqual(constructed.triggers);
  } finally { stamped.close(); }
});

it.each(['partial-stamp', 'publication'] as const)('refuses to open over a %s inconsistency in historical /2 or current records', async (damage) => {
  const { subject, signals, make, create, accept } = await sourceDecisions();
  accept(make(create([signals[0]!.signalId], '合成修订记录。')));
  expect(subject.inspectHouseReviewPreference().current!.schema).toBe('ai7.house-review-preference/2');
  subject.markCleanShutdown(); subject.close(); store = undefined;
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  let beforePartial: ReturnType<typeof historicalFixtureRows> | undefined;
  const legacyRead = damage === 'partial-stamp' ? vi.spyOn(EditorialLearningLedger.prototype, 'validate') : null;
  try {
    // A /2 record under a revision-90 stamp is an interrupted or forged upgrade, never read by the revision-90 readers.
    if (damage === 'partial-stamp') {
      constructHistoricalRequestFormat(db); db.exec('PRAGMA user_version = 90'); beforePartial = historicalFixtureRows(db);
    }
    else {
      const row = db.prepare("SELECT version_id, canonical_json FROM house_review_preference_versions WHERE json_extract(canonical_json, '$.schema') = 'ai7.house-review-preference/2'").get()!;
      const record = canonicalRecord({ ...(JSON.parse(String(row.canonical_json)) as Record<string, unknown>), sourceCount: 7 });
      db.exec('DROP TRIGGER house_review_preference_versions_no_update');
      db.prepare('UPDATE house_review_preference_versions SET canonical_json = ?, sha256 = ? WHERE version_id = ?').run(record.json, record.digest, String(row.version_id));
      db.exec(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL['house_review_preference_versions_no_update']!);
    }
  } finally { db.close(); }
  await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot)).rejects.toThrow();
  if (legacyRead !== null) expect(legacyRead).toHaveBeenCalledWith(false);
  const after = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    expect(after.prepare('PRAGMA user_version').get()!.user_version).toBe(damage === 'partial-stamp' ? 90 : 95);
    if (beforePartial !== undefined) expect(historicalFixtureRows(after)).toEqual(beforePartial);
  } finally { after.close(); }
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
