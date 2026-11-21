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
import { mountEditorialMemory } from '../../src/renderer/knowledge-base-memory.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { installMiniDom } from '../support/mini-dom.js';
import type { RendererApi } from '../../src/shared/protocol.js';
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
async function sourceDecisions(admitLegacy = true) {
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
  if (admitLegacy) subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
    expectedDecisions: material.decisions, choice: 'house', note: null });
  const create = (selected: readonly string[], title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: selected, applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const current = (itemId: string): EditorialMemoryVersion => {
    const version = subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: itemId }).items.find((entry) => entry.current.itemId === itemId)!.current;
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

async function ordinaryMemory(subject: EditorialStore) {
  const restore = installMiniDom(); setTechnicalLayerVisible(false);
  const root = document.createElement('main'); document.body.append(root);
  const api = { inspectEditorialLearning: async (input) => subject.inspectEditorialLearning(input),
    inspectGlobalAgent: async () => subject.inspectGlobalAgent(), inspectHouseReviewPreference: async () => subject.inspectHouseReviewPreference(),
    acceptEditorialMemory: async (input) => subject.acceptEditorialMemory(input), deactivateEditorialMemory: async (input) => subject.deactivateEditorialMemory(input),
    changeEditorialLearning: async (input) => subject.changeEditorialLearning(input), recordLearningSupervision: async (input) => subject.recordLearningSupervision(input),
  } satisfies Pick<RendererApi, 'inspectEditorialLearning' | 'inspectGlobalAgent' | 'inspectHouseReviewPreference' | 'acceptEditorialMemory' | 'deactivateEditorialMemory' | 'changeEditorialLearning' | 'recordLearningSupervision'>;
  const remount = async () => { root.replaceChildren(); await mountEditorialMemory(root, api as RendererApi, async () => {}); };
  const click = async (selector: string, label: string) => {
    Array.from(root.querySelector(selector)!.querySelectorAll('button')).find((button) => button.textContent === label)!.click();
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  await remount();
  return { root, click, remount, close: () => { restore(); setTechnicalLayerVisible(true); vi.useRealTimers(); } };
}

it('sets up a legacy feedback preference through its learning admission before mixed-action selection', async () => {
  const { subject, book, signals } = await sourceDecisions(false);
  subject.rebuildHouseReviewPreference();
  const isLegacy = (item: ReturnType<EditorialStore['inspectGlobalAgent']>['items'][number]) => item.kind === 'preference' && item.bookId === null && item.categoryId === 'typos-and-usage';
  expect(subject.inspectGlobalAgent().items.some(isLegacy)).toBe(false);
  const material = subject.inspectLearningMaterial(book.bookId, signals[0]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
    expectedDecisions: material.decisions, choice: 'house', note: null });
  subject.rebuildHouseReviewPreference();
  expect(subject.inspectGlobalAgent().items.some(isLegacy)).toBe(true);
});

it('learns a confirmed suggested reason as a clean rule without decision statistics', async () => {
  const { subject, book, explicit } = await sourceDecisions();
  if (explicit.kind === 'word-tracked-edit' || explicit.kind === 'manual-edit-journal') throw new Error('Expected decision signal');
  const window = subject.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  subject.recordProposalDecisionFeedback({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    markId: explicit.source.markId!, decisionId: explicit.source.decisionId, expectedFeedback: explicit.source.reasonRevision,
    action: 'revise', reason: '保留作者有意采用的表达。', reasonSource: 'suggested' });
  const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
    expectedDecisions: material.decisions, choice: 'house', note: null });
  subject.rebuildHouseReviewPreference();
  const memory = subject.editorialMemory(book.bookId, 'editorial-review/typos-and-usage');
  expect(memory?.block).toContain('保留作者有意采用的表达。');
  expect(memory?.block).not.toMatch(/采纳[0-9]|未采纳[0-9]|应用后常再改/u);
});

it('creates and edits an immediately active Book rule in ordinary preferences with the technical layer hidden', async () => {
  const { subject, book } = await sourceDecisions(false);
  const view = await ordinaryMemory(subject);
  const submit = async (form: Element, text: string) => {
    (form.querySelector('textarea') as HTMLTextAreaElement).value = text;
    form.dispatchEvent({ type: 'submit' } as Event);
    for (let index = 0; index < 4; index++) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  try {
    const form = view.root.querySelector('[data-preference-editor="new"]')!;
    const selects = form.querySelectorAll('select');
    (selects[0] as HTMLSelectElement).value = 'style-and-format';
    (selects[1] as HTMLSelectElement).value = book.bookId;
    await submit(form, '保留合成书中有意使用的短句。');
    const rule = subject.inspectGlobalAgent().items.find((entry) => entry.text === '保留合成书中有意使用的短句。')!;
    expect(rule).toMatchObject({ state: 'active', bookId: book.bookId, categoryId: 'style-and-format' });
    expect(subject.editorialMemory(book.bookId, 'agent-workspace')?.block).toContain(rule.text);
    expect(subject.editorialMemory(null, 'global-agent')).toBeNull();
    await view.click(`[data-review-preference="${rule.itemId}"]`, '编辑偏好');
    await submit(view.root.querySelector(`[data-preference-editor="${rule.itemId}"]`)!, '保留短句，避免机械合并。');
    expect(subject.editorialMemory(book.bookId, 'writing')?.block).toContain('保留短句，避免机械合并。');
    expect(subject.editorialMemory(book.bookId, 'writing')?.block).not.toContain(rule.text);
    await view.remount();
    expect(view.root.textContent).toContain('保留短句，避免机械合并。');
  } finally { view.close(); }
});

it('refreshes ordinary preference pins after memory acceptance before stopping feedback-derived preferences', async () => {
  const { subject, signals, make, create } = await sourceDecisions();
  subject.rebuildHouseReviewPreference();
  const preference = subject.inspectGlobalAgent().items.find((item) => item.kind === 'preference' && item.bookId === null)!;
  expect(preference).toBeDefined();
  const candidate = make(create([signals[0]!.signalId], '保留合成作者节奏。'));
  const view = await ordinaryMemory(subject);
  try {
    await view.click(`[data-memory-item="${candidate.itemId}"]`, '接受记忆');
    expect(() => subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: preference.itemId, revisionId: preference.revisionId }],
      scope: { kind: 'house' }, categoryId: preference.categoryId, text: '', effect: 'guide' })).toThrow('刚在别处改过');
    await view.click(`[data-review-preference="${preference.itemId}"]`, '停用');
    expect(subject.inspectGlobalAgent().items.find((item) => item.itemId === preference.itemId)?.state).toBe('inactive');
    expect(view.root.textContent).not.toContain('无法更新学习记录');
  } finally { view.close(); }
});

it.each([false, true])('retains stopped ordinary preference source books and item history after remount (memory publication=%s)', async (withMemory) => {
  const { subject, signals, make, create, accept, book } = await sourceDecisions();
  subject.rebuildHouseReviewPreference();
  if (withMemory) accept(make(create([signals[0]!.signalId], '合成已启用记忆。')));
  if (withMemory) {
    const publication = subject.inspectHouseReviewPreference().current!;
    expect(publication.schema).toBe('ai7.house-review-preference/2');
    expect(publication.legacyBasis!.lines.some((line) => line.bookId === null)).toBe(true);
    expect(publication.governance).toBeUndefined();
  }
  const preference = subject.inspectGlobalAgent().items.find((item) => item.kind === 'preference' && item.bookId === null)!;
  expect(preference).toBeDefined();
  const sourceTitle = subject.inspectGlobalAgent().books.find((entry) => entry.bookId === book.bookId)!.title;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-07T01:00:00.000Z'));
  const view = await ordinaryMemory(subject);
  try {
    await view.click(`[data-review-preference="${preference.itemId}"]`, '停用');
    vi.setSystemTime(new Date('2026-11-07T02:00:00.000Z'));
    accept(make(create([signals[0]!.signalId], '合成后续另一条记忆。')));
    await view.remount();
    const row = view.root.querySelector(`[data-review-preference="${preference.itemId}"]`)!;
    expect(row.textContent).toContain(`来自《${sourceTitle}》`);
    // The history reads local times as the page computes them (Issue #1531, review N8), never a raw ISO time.
    expect(row.textContent).toContain(localInstantLabel('2026-11-07T01:00:00.000Z'));
    expect(row.textContent).not.toContain(localInstantLabel('2026-11-07T02:00:00.000Z'));
    expect(row.textContent).not.toContain('2026-11-07T');
    expect(row.textContent).toContain('已停用');
    expect(row.textContent).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{64}/iu);
  } finally { view.close(); }
});

it('freezes native curation examples from actual decision and feedback meaning', async () => {
  const { subject, book, signals } = await sourceDecisions();
  const bundle = subject.prepareLearningCuration(book.bookId, signals.map((signal) => signal.signalId));
  expect(bundle.state).toBe('ready');
  expect(bundle.examples).toHaveLength(4);
  for (const example of bundle.examples) {
    expect(example.sourceKind).toBe('proposal-decision');
    if (example.sourceKind !== 'proposal-decision') throw new Error('Expected native decision');
    expect(example).toMatchObject({ editorialDimension: 'typos-and-usage', afterSemantics: 'chosen-text-not-apply-proof',
      reason: '合成编辑判断。', reasonSource: 'reason-field' });
    expect(example.decision === 'rejected' ? example.after === example.before : example.after.startsWith('合成统一表达')).toBe(true);
  }
  subject.changeEditorialLearning({ kind: 'material', signalId: signals[0]!.signalId });
  expect(subject.prepareLearningCuration(book.bookId, signals.map((signal) => signal.signalId))).toMatchObject({ state: 'held', emittedText: null });
});

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
  subject.recordLearningSupervision({ actionId: directive.actionId!, operation: 'correct', targets: directive.targets,
    scope: directive.scope, categoryId: directive.categoryId, text: directive.text, effect: directive.effect });
  expect(subject.inspectGlobalAgent().directives.at(-1)!.directiveId).toBe(directive.directiveId);
  expect(() => govern([a], 'correct', '失效版本不能修正。')).toThrow();
  govern([current(a.itemId)], 'correct', '界'.repeat(160));
  const before = subject.inspectHouseReviewPreference().current!.versionId;
  const directiveCount = subject.inspectGlobalAgent().directives.length;
  expect(() => govern([current(b.itemId)], 'correct', '界'.repeat(1201))).toThrow();
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
  if (signal.kind === 'word-tracked-edit' || signal.kind === 'manual-edit-journal') throw new Error('expected a review decision signal');
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
  for (let index = 1; index <= 14; index += 1) subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
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

function reserveLibrarySpace(subject: EditorialStore): void {
  for (let index = 0; index < 5; index += 1) subject.recordLearningSupervision({ operation: 'create', targets: [],
    scope: { kind: 'house' }, categoryId: 'style-and-format', text: String(index) + '留'.repeat(1159), effect: 'guide' });
}

it('holds the 6000-grapheme reservation across exclusion, active correction, explicit legacy lines and name changes', async () => {
  const { subject, book, signals, make, create, accept, current, govern, sourceBook } = await sourceDecisions();
  reserveLibrarySpace(subject);
  const long = accept(make(create([signals[0]!.signalId], '甲'.repeat(120))));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  const other = await sourceBook('合成字数来源');
  const fromB = (title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: [other.signals[0]!.signalId], applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  expect(() => accept(make(fromB('乙'.repeat(100))))).toThrow(/6,000 字/u);
  const exact = accept(make(fromB(`合成丙丁${'乙'.repeat(76)}`)));
  // Exactly 6000 reserved: an active correction replaces its own slot, and one more grapheme refuses atomically.
  const corrected = govern([exact], 'correct', `合成丙丁${'丙'.repeat(76)}`);
  const sameSize = current(exact.itemId);
  expect(sameSize.title).toBe(`合成丙丁${'丙'.repeat(76)}`);
  const directives = corrected.directives.length;
  expect(() => govern([sameSize], 'correct', `合成丙丁${'丙'.repeat(77)}`)).toThrow(/6,000 字/u);
  expect(subject.inspectGlobalAgent().directives).toHaveLength(directives);
  expect(current(exact.itemId).versionId).toBe(sameSize.versionId);
  expect(() => subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format',
    text: '合成旧版偏好', effect: 'guide' })).toThrow(/6,000 字/u);
  // People changes preserve the original words and their existing capacity reservation.
  const people = subject.getBookOverview(other.book.bookId).people;
  subject.updateBookPeople({ bookId: other.book.bookId, expectedVersion: people.version, authors: ['合成丙丁'], editors: [], related: [] });
  expect(subject.inspectHouseReviewPreference().current!.lines.find((line) => line.owner?.itemId === exact.itemId)!.text).toBe('合成丙丁' + '丙'.repeat(76));
  expect(() => accept(make(fromB('乙')))).toThrow(/6,000 字/u);
  subject.updateBookPeople({ bookId: other.book.bookId, expectedVersion: people.version + 1, authors: [], editors: [], related: [] });
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.text).sort())
    .toEqual(['甲'.repeat(120), `合成丙丁${'丙'.repeat(76)}`].sort());
  expect(current(long.itemId).versionId).toBe(long.versionId);
  // An explicit legacy line reserves its place too, and freezing an owner releases it.
  govern([current(long.itemId)], 'supervise', '冻结长记忆。', 'freeze');
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合'.repeat(100), effect: 'guide' });
  expect(() => accept(make(fromB('乙'.repeat(21))))).toThrow(/6,000 字/u);
  accept(make(fromB('乙'.repeat(20))));
});

it.each(['material', 'book'] as const)('reserves a legacy correction whose source is reversibly excluded (%s), so restoration never overflows', async (exclusion) => {
  const { subject, book, explicit, make, accept, sourceBook } = await sourceDecisions();
  const legacyItem = () => subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage');
  reserveLibrarySpace(subject);
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
  expect(() => accept(overflowing)).toThrow(/6,000 字/u);
  expect(subject.inspectHouseReviewPreference().history).toHaveLength(versions);
  const fitting = accept(make(create('乙'.repeat(80))));
  restore();
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines.filter((line) => line.categoryId === 'typos-and-usage').map((line) => line.text).sort()).toEqual(['合'.repeat(120), '乙'.repeat(80)].sort());
  expect(restored.lines.find((line) => line.owner?.itemId === fitting.itemId)).toBeDefined();
});

// ---- 审阅偏好: 重新启用 and 删除 (Issue #1655) ------------------------------------------------------------------------------
/** What one request wrote: rows of each append-only relation it may touch. */
function rowCounts(): Record<string, number> {
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    return Object.fromEntries(['global_editorial_memory_items', 'global_editorial_memory_item_versions', 'learning_supervision_directives',
      'house_review_preference_versions'].map((table) => [table, Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)]));
  } finally { db.close(); }
}
/** The open-time validation over the store as it stands. */
function validateOnOpen(): void {
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try { new EditorialLearningLedger(db).validate(); new SupervisionDirectives(db).validate(); new HouseReviewPreferenceLedger(db).validate(); } finally { db.close(); }
}
function refused(operation: () => unknown, code: string): void {
  let error: unknown;
  try { operation(); } catch (caught) { error = caught; }
  expect(error, code).toMatchObject({ code });
}
function lifecycle(subject: EditorialStore) {
  const send = (action: 'reactivate' | 'retire') => (itemId: string, pin: string, actionId: string = randomUUID()) =>
    subject.reviewPreferenceLifecycle({ itemId, expectedRevisionId: pin, actionId }, action);
  const memoryRow = (itemId: string) => subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: itemId }).items[0]?.row;
  const preferenceRow = (itemId: string) => subject.inspectGlobalAgent().items.find((item) => item.itemId === itemId);
  return { reenable: send('reactivate'), remove: send('retire'), memoryRow, preferenceRow };
}

it('re-enables a stopped memory entry by appending one version per action id, then deletes it from every list (#1655)', async () => {
  const { subject, book, signals, make, create, accept, govern, current } = await sourceDecisions();
  const { reenable, remove, memoryRow } = lifecycle(subject);
  const a = accept(make(create([signals[0]!.signalId], '合成可重新启用的记忆。')));
  const b = accept(make(create([signals[2]!.signalId], '合成另一条记忆。')));
  const material = () => subject.inspectLearningMaterial(book.bookId, signals[0]!.source.materialKey);
  const standing = material().state;
  const stop = (itemId: string) => subject.deactivateEditorialMemory({ itemId, expectedVersionId: current(itemId).versionId, actionId: randomUUID() });
  stop(a.itemId);
  const stopped = memoryRow(a.itemId)!;
  expect(stopped).toEqual({ group: 'disabled', changedAt: current(a.itemId).recordedAt, origin: 'editor',
    reenable: { standing: 'allowed', sentence: '可以重新启用，恢复到停用前的样子。' }, pin: current(a.itemId).versionId, pausedInUse: false });
  // A directive about another entry recorded in between does not make the page's pin stale.
  govern([b], 'correct', '合成另一条记忆的更正。');
  refused(() => remove(a.itemId, stopped.pin.replace(/^./u, (c) => c === '0' ? '1' : '0')), 'REVIEW_PREFERENCE_CHANGED');
  const before = rowCounts();
  const actionId = randomUUID();
  const answer = reenable(a.itemId, stopped.pin, actionId);
  expect(rowCounts()).toEqual({ ...before, global_editorial_memory_item_versions: before.global_editorial_memory_item_versions! + 1,
    house_review_preference_versions: before.house_review_preference_versions! + 1 });
  expect(current(a.itemId)).toMatchObject({ action: 'reactivate', state: 'active', actor: 'editor', supervisionDirectiveRefs: [] });
  expect(answer.items.find((entry) => entry.current.itemId === a.itemId)).toMatchObject({ usable: true, row: { group: 'enabled', reenable: null, pausedInUse: false } });
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.owner?.itemId === a.itemId)).toBe(true);
  // The same request again acts once and answers the same; another action id is told it already happened.
  const after = rowCounts();
  expect(reenable(a.itemId, stopped.pin, actionId).items).toEqual(subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items);
  expect(rowCounts()).toEqual(after);
  refused(() => reenable(a.itemId, stopped.pin), 'REVIEW_PREFERENCE_ALREADY_REENABLED');
  refused(() => remove(a.itemId, current(a.itemId).versionId), 'REVIEW_PREFERENCE_CHANGED');
  validateOnOpen();
  // 停用 → 重新启用 → 停用 → 重新启用 → 删除 on one entry, the store reopened between two requests, validated on every read.
  stop(a.itemId); validateOnOpen();
  const second = memoryRow(a.itemId)!.pin;
  refused(() => reenable(a.itemId, stopped.pin), 'REVIEW_PREFERENCE_CHANGED');
  const launch = subject.baselineAnalysisLedger.launch;
  subject.markCleanShutdown(); subject.close(); store = undefined;
  store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
  const reopened = store;
  reopened.baselineAnalysisLedger.bindLaunch(launch);
  reopened.reviewPreferenceLifecycle({ itemId: a.itemId, expectedRevisionId: second, actionId: randomUUID() }, 'reactivate'); validateOnOpen();
  reopened.deactivateEditorialMemory({ itemId: a.itemId, expectedVersionId: reopened.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: a.itemId }).items[0]!.current.versionId, actionId: randomUUID() });
  const last = reopened.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: a.itemId }).items[0]!.row.pin;
  const deleteId = randomUUID();
  const deleted = reopened.reviewPreferenceLifecycle({ itemId: a.itemId, expectedRevisionId: last, actionId: deleteId }, 'retire');
  validateOnOpen();
  expect(reopened.reviewPreferenceLifecycle({ itemId: a.itemId, expectedRevisionId: last, actionId: deleteId }, 'retire').items).toEqual(deleted.items);
  // Absent from every list, count, source candidate and the published preference; the material's standing is unchanged.
  expect(deleted.items.some((entry) => entry.current.itemId === a.itemId)).toBe(false);
  // A list skips it; a read naming it is refused as deleted.
  refused(() => reopened.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: a.itemId }), 'REVIEW_PREFERENCE_DELETED');
  const global = reopened.inspectGlobalAgent();
  expect([...global.items, ...global.sourceCandidates!].some((entry) => entry.itemId === a.itemId)).toBe(false);
  expect(reopened.inspectHouseReviewPreference().current!.lines.some((line) => line.owner?.itemId === a.itemId)).toBe(false);
  expect(reopened.inspectLearningLineage(book.bookId, signals[0]!.source.materialKey).downstream).toMatchObject({ memoryCandidates: 0, activeMemories: 0 });
  expect(reopened.inspectLearningMaterial(book.bookId, signals[0]!.source.materialKey).state).toBe(standing);
  // Every later request naming it is refused as deleted.
  refused(() => reopened.reviewPreferenceLifecycle({ itemId: a.itemId, expectedRevisionId: last, actionId: randomUUID() }, 'reactivate'), 'REVIEW_PREFERENCE_DELETED');
  refused(() => reopened.reviewPreferenceLifecycle({ itemId: a.itemId, expectedRevisionId: last, actionId: randomUUID() }, 'retire'), 'REVIEW_PREFERENCE_DELETED');
  refused(() => reopened.deactivateEditorialMemory({ itemId: a.itemId, expectedVersionId: last, actionId: randomUUID() }), 'REVIEW_PREFERENCE_DELETED');
  refused(() => reopened.acceptEditorialMemory({ itemId: a.itemId, expectedVersionId: last, actionId: randomUUID() }), 'REVIEW_PREFERENCE_DELETED');
  refused(() => reopened.recordLearningSupervision({ actionId: randomUUID(), operation: 'correct', targets: [{ itemId: a.itemId, revisionId: last }],
    scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合成不能更正已删除的。', effect: 'guide' }), 'REVIEW_PREFERENCE_DELETED');
});

it('restores a candidate, a frozen entry and a corrected one to their own state, and refuses merged or material-stopped ones (#1655)', async () => {
  const { subject, book, signals, make, create, accept, govern, current } = await sourceDecisions();
  const { reenable, remove, memoryRow } = lifecycle(subject);
  // 排除 a candidate → 重新启用 → a candidate again, and accepting still works.
  const candidate = make(create([signals[0]!.signalId], '合成候选记忆。'));
  subject.deactivateEditorialMemory({ itemId: candidate.itemId, expectedVersionId: candidate.versionId, actionId: randomUUID() });
  reenable(candidate.itemId, memoryRow(candidate.itemId)!.pin);
  expect(current(candidate.itemId).state).toBe('proposed');
  expect(memoryRow(candidate.itemId)).toMatchObject({ group: 'pending', reenable: null });
  expect(accept(current(candidate.itemId)).state).toBe('active');
  // Frozen by an AI 助手 freeze → back to its state before the freeze, while the scope's curation hold still holds.
  const frozen = accept(make(create([signals[2]!.signalId], '合成冻结的记忆。')));
  govern([frozen], 'supervise', '冻结这条合成记忆。', 'freeze');
  expect(memoryRow(frozen.itemId)).toMatchObject({ group: 'disabled', reenable: { standing: 'allowed' } });
  reenable(frozen.itemId, memoryRow(frozen.itemId)!.pin);
  expect(current(frozen.itemId).state).toBe('active');
  expect(subject.prepareLearningCuration(book.bookId, signals.map((signal) => signal.signalId)).coverage
    .every((entry) => entry.state === 'held' && entry.reason !== null)).toBe(true);
  expect(subject.prepareLearningCuration(book.bookId, [signals[0]!.signalId]).coverage).toEqual([{ signalId: signals[0]!.signalId, state: 'held', reason: 'supervision-frozen' }]);
  // Merged into another entry: re-enabling is refused, deleting it is allowed.
  const left = accept(make(create([signals[0]!.signalId], '合成合并甲。')));
  const right = accept(make(create([signals[2]!.signalId], '合成合并乙。')));
  govern([left, right], 'merge', '合成合并后的记忆。');
  expect(memoryRow(left.itemId)).toMatchObject({ group: 'disabled', reenable: { standing: 'merged', sentence: '已并入另一条，不能单独重新启用。' } });
  refused(() => reenable(left.itemId, memoryRow(left.itemId)!.pin), 'REVIEW_PREFERENCE_MERGED');
  remove(left.itemId, memoryRow(left.itemId)!.pin);
  refused(() => memoryRow(left.itemId), 'REVIEW_PREFERENCE_DELETED');
  // Corrected through the AI 助手 while stopped: a candidate, not a disabled row.
  const corrected = accept(make(create([signals[3]!.signalId], '合成停用后更正。')));
  subject.deactivateEditorialMemory({ itemId: corrected.itemId, expectedVersionId: corrected.versionId, actionId: randomUUID() });
  const stalePin = memoryRow(corrected.itemId)!.pin;
  govern([current(corrected.itemId)], 'correct', '合成更正后的说法。');
  expect(memoryRow(corrected.itemId)).toMatchObject({ group: 'pending' });
  refused(() => reenable(corrected.itemId, stalePin), 'REVIEW_PREFERENCE_CHANGED');
  // A material stopped in 学习回溯: the row says so and re-enabling is refused.
  const sourced = accept(make(create([signals[3]!.signalId], '合成材料停止后的记忆。')));
  subject.deactivateEditorialMemory({ itemId: sourced.itemId, expectedVersionId: sourced.versionId, actionId: randomUUID() });
  subject.changeEditorialLearning({ kind: 'material', signalId: signals[3]!.signalId });
  expect(memoryRow(sourced.itemId)).toMatchObject({ reenable: { standing: 'material-stopped', sentence: '依据的学习材料已停止今后使用，不能重新启用。' } });
  const counts = rowCounts();
  refused(() => reenable(sourced.itemId, memoryRow(sourced.itemId)!.pin), 'REVIEW_PREFERENCE_MATERIAL_STOPPED');
  expect(rowCounts()).toEqual(counts);
  validateOnOpen();
});

it('re-enables a legacy /1 entry by appending activation active and deletes it with a terminal /1 value (#1655)', async () => {
  const { subject, signals } = await sourceDecisions();
  const { reenable, remove, memoryRow } = lifecycle(subject);
  subject.createEditorialMemory({ clientMemoryId: randomUUID(), signalId: signals[1]!.signalId, title: '合成旧式记忆。', editorialDimension: 'typos-and-usage', confidence: 0.5 });
  const legacy = subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items.find((entry) => entry.current.schema !== 'ai7.global-editorial-memory/2')!;
  expect(legacy.row).toMatchObject({ group: 'enabled', origin: 'editor', pin: legacy.current.versionId });
  subject.deactivateEditorialMemory({ itemId: legacy.current.itemId, expectedVersionId: legacy.current.versionId });
  const stopped = memoryRow(legacy.current.itemId)!;
  const actionId = randomUUID();
  reenable(legacy.current.itemId, stopped.pin, actionId);
  const counts = rowCounts();
  reenable(legacy.current.itemId, stopped.pin, actionId);
  expect(rowCounts()).toEqual(counts);
  expect(memoryRow(legacy.current.itemId)).toMatchObject({ group: 'enabled' });
  subject.deactivateEditorialMemory({ itemId: legacy.current.itemId, expectedVersionId: memoryRow(legacy.current.itemId)!.pin });
  remove(legacy.current.itemId, memoryRow(legacy.current.itemId)!.pin);
  expect(subject.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items.some((entry) => entry.current.itemId === legacy.current.itemId)).toBe(false);
  refused(() => subject.deactivateEditorialMemory({ itemId: legacy.current.itemId, expectedVersionId: stopped.pin }), 'REVIEW_PREFERENCE_DELETED');
  validateOnOpen();
});

it('brings a stopped derived line back derived with today\'s words, an editor\'s line with its own words under the limit, and deletes for good (#1655)', async () => {
  const { subject, book, explicit } = await sourceDecisions();
  const { reenable, remove, preferenceRow } = lifecycle(subject);
  subject.rebuildHouseReviewPreference();
  const derived = subject.inspectGlobalAgent().items.find((item) => item.kind === 'preference' && item.bookId === null && item.categoryId === 'typos-and-usage')!;
  expect(derived.row).toMatchObject({ group: 'enabled', origin: 'ai', pausedInUse: false, reenable: null });
  // 停用 sends the listed revision; the row pin is the line's own revision afterwards.
  subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: derived.itemId, revisionId: derived.revisionId }],
    scope: { kind: 'category', categoryId: 'typos-and-usage' }, categoryId: 'typos-and-usage', text: '', effect: 'guide' });
  const stopped = preferenceRow(derived.itemId)!;
  expect(stopped).toMatchObject({ state: 'inactive', row: { group: 'disabled', origin: 'ai', reenable: { standing: 'allowed' } } });
  expect(stopped.revisionId.startsWith(`${stopped.row!.pin}@`)).toBe(true);
  // New decided feedback rebuilds the group with other words while it is stopped.
  if (explicit.kind === 'word-tracked-edit' || explicit.kind === 'manual-edit-journal') throw new Error('Expected decision signal');
  const window = subject.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  subject.recordProposalDecisionFeedback({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    markId: explicit.source.markId!, decisionId: explicit.source.decisionId, expectedFeedback: explicit.source.reasonRevision,
    action: 'revise', reason: '合成修订后的判断。', reasonSource: 'free-text' });
  const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice: 'house', note: null });
  subject.rebuildHouseReviewPreference();
  const rebuilt = subject.inspectHouseReviewPreference().current!.governance!.baseLines.find((line) => line.bookId === null && line.categoryId === 'typos-and-usage')!;
  expect(rebuilt.text).not.toBe(derived.text);
  // A directive about another line in between does not make the page's pin stale.
  const editor = subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format',
    text: '合成编辑自己的规则。', effect: 'guide' }).items.find((item) => item.text === '合成编辑自己的规则。')!;
  const counts = rowCounts();
  const actionId = randomUUID();
  reenable(derived.itemId, preferenceRow(derived.itemId)!.row!.pin, actionId);
  expect(rowCounts()).toEqual({ ...counts, learning_supervision_directives: counts.learning_supervision_directives! + 1,
    house_review_preference_versions: counts.house_review_preference_versions! + 1 });
  const back = preferenceRow(derived.itemId)!;
  expect(back).toMatchObject({ state: 'active', text: rebuilt.text, row: { group: 'enabled', origin: 'ai' } });
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.text === rebuilt.text)).toBe(true);
  expect(subject.inspectGlobalAgent().directives.at(-1)).toMatchObject({ operation: 'reactivate', text: '', effect: 'guide', actionId,
    targets: [{ itemId: derived.itemId, revisionId: stopped.row!.pin }], scope: { kind: 'category', categoryId: 'typos-and-usage' } });
  reenable(derived.itemId, stopped.row!.pin, actionId);
  expect(rowCounts().learning_supervision_directives).toBe(counts.learning_supervision_directives! + 1);
  refused(() => reenable(derived.itemId, stopped.row!.pin), 'REVIEW_PREFERENCE_ALREADY_REENABLED');
  refused(() => remove(derived.itemId, back.row!.pin), 'REVIEW_PREFERENCE_CHANGED');
  // An editor's line comes back with its words, held to the house limit as adding it is.
  const stopLine = (itemId: string) => { const item = preferenceRow(itemId)!; subject.recordLearningSupervision({ operation: 'deactivate',
    targets: [{ itemId, revisionId: item.revisionId }], scope: { kind: 'house' }, categoryId: item.categoryId, text: '', effect: 'guide' }); };
  stopLine(editor.itemId);
  reserveLibrarySpace(subject);
  expect(preferenceRow(editor.itemId)!.row).toMatchObject({ group: 'disabled', origin: 'editor' });
  // Fill the house to five characters short of 6,000: the stopped line's ten would not fit.
  const used = subject.inspectGlobalAgent().items.filter((item) => item.kind === 'preference' && item.state === 'active').reduce((sum, item) => sum + [...item.text].length, 0);
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合'.repeat(6_000 - used - 5), effect: 'guide' });
  const full = rowCounts();
  refused(() => reenable(editor.itemId, preferenceRow(editor.itemId)!.row!.pin), 'GLOBAL_AGENT_MEMORY_LIMIT');
  expect(rowCounts()).toEqual(full);
  // Deleting is accepted only for a stopped line; afterwards it is gone and stays gone across rebuilds.
  refused(() => remove(derived.itemId, preferenceRow(derived.itemId)!.row!.pin), 'REVIEW_PREFERENCE_CHANGED');
  stopLine(derived.itemId);
  remove(derived.itemId, preferenceRow(derived.itemId)!.row!.pin);
  expect(preferenceRow(derived.itemId)).toBeUndefined();
  subject.rebuildHouseReviewPreference();
  expect(preferenceRow(derived.itemId)).toBeUndefined();
  expect(subject.inspectHouseReviewPreference().current!.lines.some((line) => line.text === rebuilt.text)).toBe(false);
  refused(() => subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: derived.itemId, revisionId: back.revisionId }],
    scope: { kind: 'category', categoryId: 'typos-and-usage' }, categoryId: 'typos-and-usage', text: '', effect: 'guide' }), 'REVIEW_PREFERENCE_DELETED');
  refused(() => reenable(derived.itemId, back.row!.pin), 'REVIEW_PREFERENCE_DELETED');
  // Still deleted after the group's material is stopped and the house rebuilt: the 删除 is read from its own record.
  const source = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: source.materialKey, materialDigest: source.digest, expectedDecisions: source.decisions, choice: 'excluded', note: null });
  subject.rebuildHouseReviewPreference();
  refused(() => reenable(derived.itemId, back.row!.pin), 'REVIEW_PREFERENCE_DELETED');
  refused(() => remove(derived.itemId, back.row!.pin), 'REVIEW_PREFERENCE_DELETED');
  refused(() => subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: derived.itemId, revisionId: back.revisionId }],
    scope: { kind: 'category', categoryId: 'typos-and-usage' }, categoryId: 'typos-and-usage', text: '', effect: 'guide' }), 'REVIEW_PREFERENCE_DELETED');
  validateOnOpen();
});

it('names one request by one action id across a memory entry and a preference line (#1655)', async () => {
  const { subject, signals, make, create, accept, current } = await sourceDecisions();
  const { reenable, remove, memoryRow, preferenceRow } = lifecycle(subject);
  const stopMemory = () => { const memory = accept(make(create([signals[0]!.signalId], `合成记忆${randomUUID().slice(0, 4)}。`)));
    subject.deactivateEditorialMemory({ itemId: memory.itemId, expectedVersionId: memory.versionId, actionId: randomUUID() }); return memory.itemId; };
  const stopLine = (text: string) => { const line = subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format',
    text, effect: 'guide' }).items.find((item) => item.text === text)!; subject.recordLearningSupervision({ operation: 'deactivate',
    targets: [{ itemId: line.itemId, revisionId: preferenceRow(line.itemId)!.revisionId }], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '', effect: 'guide' }); return line.itemId; };
  // A memory entry first, then a preference line with the same action id.
  const memoryFirst = stopMemory(); const lineSecond = stopLine('合成规则一。');
  const shared = randomUUID();
  reenable(memoryFirst, memoryRow(memoryFirst)!.pin, shared);
  const counts = rowCounts();
  refused(() => reenable(lineSecond, preferenceRow(lineSecond)!.row!.pin, shared), 'REVIEW_PREFERENCE_CHANGED');
  // A preference line first, then a memory entry with the same action id.
  const lineFirst = stopLine('合成规则二。'); const memorySecond = stopMemory();
  const other = randomUUID();
  remove(lineFirst, preferenceRow(lineFirst)!.row!.pin, other);
  const after = rowCounts();
  refused(() => reenable(memorySecond, memoryRow(memorySecond)!.pin, other), 'REVIEW_PREFERENCE_CHANGED');
  expect(rowCounts()).toEqual(after);
  expect(after.learning_supervision_directives).toBeGreaterThan(counts.learning_supervision_directives!);
  // Within one owner, the same action id sent as another request is refused as changed, not as an invalid record.
  refused(() => remove(memoryFirst, memoryRow(memoryFirst)!.pin, shared), 'REVIEW_PREFERENCE_CHANGED');
  expect(current(memoryFirst).action).toBe('reactivate');
});

it('refuses a merged or vanished preference line and keeps a corrected one\'s words (#1655)', async () => {
  const { subject, book, explicit } = await sourceDecisions();
  const { reenable, remove, preferenceRow } = lifecycle(subject);
  subject.rebuildHouseReviewPreference();
  const derived = () => subject.inspectGlobalAgent().items.find((item) => item.kind === 'preference' && item.categoryId === 'typos-and-usage')!;
  const create = (text: string) => subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format',
    text, effect: 'guide' }).items.find((item) => item.text === text)!;
  // A corrected derived line comes back with its corrected words.
  const line = derived();
  subject.recordLearningSupervision({ operation: 'correct', targets: [{ itemId: line.itemId, revisionId: line.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '合成更正后的偏好。', effect: 'guide' });
  const corrected = derived();
  subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: corrected.itemId, revisionId: corrected.revisionId }],
    scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '', effect: 'guide' });
  reenable(corrected.itemId, preferenceRow(corrected.itemId)!.row!.pin);
  expect(preferenceRow(corrected.itemId)).toMatchObject({ state: 'active', text: '合成更正后的偏好。', row: { origin: 'ai' } });
  // Merged into another line: refused as merged, deletable.
  const first = create('合成规则甲。'); const second = create('合成规则乙。');
  subject.recordLearningSupervision({ operation: 'merge', targets: [first, second].map((item) => ({ itemId: item.itemId, revisionId: preferenceRow(item.itemId)!.revisionId })),
    scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合成合并后的规则。', effect: 'guide' });
  expect(preferenceRow(first.itemId)!.row).toMatchObject({ group: 'disabled', reenable: { standing: 'merged' } });
  refused(() => reenable(first.itemId, preferenceRow(first.itemId)!.row!.pin), 'REVIEW_PREFERENCE_MERGED');
  remove(first.itemId, preferenceRow(first.itemId)!.row!.pin);
  expect(preferenceRow(first.itemId)).toBeUndefined();
  expect(preferenceRow(subject.inspectGlobalAgent().items.find((item) => item.text === '合成合并后的规则。')!.itemId)!.state).toBe('active');
  // A group whose derived line vanished while stopped lists no row, and re-enabling it is refused as changed.
  const vanishing = derived();
  subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: vanishing.itemId, revisionId: vanishing.revisionId }],
    scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '', effect: 'guide' });
  const pin = preferenceRow(vanishing.itemId)!.row!.pin;
  const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice: 'excluded', note: null });
  expect(preferenceRow(vanishing.itemId)).toBeUndefined();
  refused(() => reenable(vanishing.itemId, pin), 'REVIEW_PREFERENCE_CHANGED');
  validateOnOpen();
});

it('lists the own pin of each preference line beside its unchanged listed revision, and source candidates carry no row (#1655)', async () => {
  const { subject, signals, make, create, accept } = await sourceDecisions();
  subject.rebuildHouseReviewPreference();
  accept(make(create([signals[0]!.signalId], '合成助手可读的记忆。')));
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '合成助手规则。', effect: 'guide' });
  const global = subject.inspectGlobalAgent();
  const head = global.directives.at(-1)!.directiveId;
  // The listed and sent revisions keep their recorded form; the row pin is the line's own revision beside it.
  for (const item of global.items.filter((entry) => entry.kind === 'preference')) {
    expect(item.revisionId).toBe(`${item.row!.pin}@${head}`);
    expect(Object.keys(item).sort()).toEqual(['bookId', 'categoryId', 'itemId', 'kind', 'lineage', 'revisionId', 'row', 'state', 'text']);
  }
  for (const candidate of global.sourceCandidates!) expect(Object.keys(candidate).sort()).toEqual(['itemId', 'kind', 'revisionId', 'text', 'title']);
  expect(subject.globalAgentSourcesCurrent(global.sourceCandidates!.map(({ itemId, revisionId }) => ({ itemId, revisionId })))).toBe(true);
});

it('lists a pending material AI7 already uses by default under 本社, not as undecided, with its row unchanged (#1655)', async () => {
  const { subject, book, signals, explicit } = await sourceDecisions();
  // One more pending material without an automatic admission: an editor's own mark, outside any review.
  const window = subject.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.findLast((candidate) => candidate.kind === 'paragraph' && [...candidate.text].length >= 20)!;
  const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
  const markId = subject.createEditorialMark({ ...binding, clientMarkId: randomUUID(), baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
    blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1, selectedText: [...block.text][0]!, kind: 'change-suggestion',
    highlightColor: null, body: '', proposedText: '合成编辑建议', rationale: '合成检查' }).markId;
  subject.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: '合成编辑自己的判断。' });
  const rows = (standing: 'pending' | 'house') => {
    const page = subject.inspectLearningAudit({ bookId: book.bookId, standing });
    return { count: page.books[0]?.materialCount ?? 0, rows: page.books.flatMap((entry) => entry.materials)
      .map((material) => [material.materialKey, material.standing, material.automaticAdmission?.choice ?? null]).sort() };
  };
  const automatic = signals.filter((signal) => signal.signalId !== explicit.signalId).map((signal) => signal.source.materialKey);
  const pending = rows('pending');
  expect(pending.count).toBe(1);
  expect(pending.rows).toHaveLength(1);
  expect(pending.rows[0]!.slice(1)).toEqual(['pending', null]);
  expect([explicit.source.materialKey, ...automatic]).not.toContain(pending.rows[0]![0]);
  const house = rows('house');
  expect(house.count).toBe(1 + automatic.length);
  expect(house.rows).toEqual([[explicit.source.materialKey, 'house', null], ...automatic.map((key) => [key, 'pending', 'house'])].sort());
});
