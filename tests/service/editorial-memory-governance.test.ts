import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { EditorialLearningLedger, EDITORIAL_LEARNING_TRIGGER_SQL } from '../../src/service/learning/ledger.js';
import { HouseReviewPreferenceLedger, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL } from '../../src/service/house-review-preference.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import type { CreateEditorialMemoryInput, EditorialMemoryVersion, GlobalMemoryPin, RecordLearningSupervisionInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;
afterEach(async () => {
  const stopped = driver?.dispose(); await owner?.dispose(); await stopped;
  store?.close(); await roots?.dispose(); roots = undefined; store = undefined; owner = undefined; driver = undefined;
});

/** Actual selected production policy/store/gate; only transport is synthetic. Nothing is sent to a provider. */
async function sourceDecisions() {
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
  owner = new BaselineAnalysisExecutionOwner({ ledger: subject.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => 'placeholder-production-key' },
    productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', selected),
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
  return { subject, book, signals, explicit, inspect, current, make, create, accept, govern, prepare, requests };
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
  const before = subject.inspectHouseReviewPreference().current!.versionId;
  expect(() => govern([current(a.itemId)], 'correct', '界'.repeat(160))).toThrow();
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(before);
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
  subject.recordProposalDecisionFeedback({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    markId: stale.source.markId!, decisionId: stale.source.decisionId, expectedFeedback: stale.source.reasonRevision,
    action: 'revise', reason: '停用期间的新合成原因。', reasonSource: 'free-text' });
  subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
  const preview = (signal: typeof stale) => {
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
