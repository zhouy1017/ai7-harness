import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { renderReportExport } from '../../src/service/report-export.js';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { HouseReviewPreferenceLedger, liveHouseReviewPreferenceContract } from '../../src/service/house-review-preference.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { sample1DerivedLibraryItem } from '../editorial-cases/runner/run-setups.js';

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;
afterEach(async () => {
  const stopped = driver?.dispose();
  await owner?.dispose();
  await stopped;
  store?.close();
  await roots?.dispose();
});

interface ReviewRequest { readonly category: string; readonly ordinal: number; readonly body: string; readonly tools: string[]; readonly sentAt: number; abortedAt?: number; abortReason?: unknown }

/**
 * Real store, review driver, harness, gate and broker; a local transport over admitted sample1 only. `answer` says how the transport
 * treats one unit request (`prior` earlier requests for the same unit): a valid envelope, an invalid one, or a stall that ends only
 * when the request's signal aborts. `project` adjusts the selected v26 launch projection the Run executes under.
 */
async function productionReview(
  categories: readonly string[],
  answer: (category: string, ordinal: number, prior: number) => 'valid' | 'invalid' | 'stall' | 'tools' | 'repeated',
  project: (policy: LaunchPolicyProjection) => LaunchPolicyProjection = (policy) => policy,
  useMaterial = false,
  usePreferences: boolean | 'top-five' = false,
) {
  roots = await createServiceTestRoots('ai7-production-review-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const choice = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
  const pending = store.saveModelServiceConnection('合成生产连接', null, 'needs-attention', choice.route);
  store.saveModelServiceConnection('合成生产连接', pending.credentialReference, 'ready', choice.route);
  store.selectModelServiceRoute(choice.route);
  const binding = { ...choice, credentialReference: pending.credentialReference };
  const policy = project(await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding));
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
  const requests: ReviewRequest[] = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }>; tools?: Array<{ function: { name: string } }> };
    const message = body.messages.findLast((entry) => entry.role === 'user')!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    let content: string;
    if (header !== null) {
      const prior = requests.filter((entry) => entry.category === header.categoryId && entry.ordinal === header.ordinal).length;
      const request: ReviewRequest = { category: header.categoryId, ordinal: header.ordinal, body: String(init?.body), tools: body.tools?.map((tool) => tool.function.name) ?? [], sentAt: Date.now() };
      requests.push(request);
      const shape = answer(header.categoryId, header.ordinal, prior);
      if (shape === 'tools') {
        const blockId = /\[1\] \[(blk_[0-9a-f]{24})\]/u.exec(message)![1]!;
        return new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content: null, reasoning_content: '合成推理。', tool_calls: [
          { id: 'read-1', type: 'function', function: { name: 'read_blocks', arguments: JSON.stringify({ blockId, radius: 0 }) } },
          { id: 'search-1', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '的', mode: 'exact' }) } },
        ] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
      }
      if (shape === 'stall') {
        // Answers nothing: only the request's own signal ends it, as the native fetch rejects on abort.
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abort = (): void => { request.abortedAt = Date.now(); request.abortReason = signal?.reason; reject(signal?.reason); };
          if (signal?.aborted === true) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      }
      if (shape === 'invalid') content = '{invalid';
      else {
        const blocks = message.split('\n').flatMap((line) => {
          const match = /^\[([1-9][0-9]*)\] \[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
          return match === null ? [] : [{ ordinal: Number(match[1]), text: match[2]! }];
        });
        const bounded = blocks.filter((entry) => entry.text.length >= 10 && entry.text.length <= 80);
        const block = bounded[0];
        content = JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal,
          findings: shape === 'repeated' && header.ordinal === 1 ? bounded.slice(0, 4).map((entry) => ({ quote: entry.text,
            blockOrdinal: entry.ordinal, severity: 'should', note: '合成同类修改建议。', replacement: `${entry.text}合成` }))
            : header.ordinal === 1 && block !== undefined && (header.categoryId === 'publication-risk' || body.messages.some((entry) => entry.role === 'tool'))
            ? [{ quote: block.text, blockOrdinal: block.ordinal, severity: 'should', note: '合成审阅发现；请人工复核。',
              ...(header.categoryId === 'publication-risk' ? { clauseId: 'publication-risk/1' } : { replacement: `${block.text}合成` }) }] : [],
        });
      }
    } else if (message.startsWith('保证抽样 ')) content = JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
      dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) });
    else content = JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
    return new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => 'placeholder-production-key' },
    productionPolicyFor: async (selected) => project(await resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', selected)),
  });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, '合成生产审阅');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  if (usePreferences) store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '统一编辑用语，保留有意的节奏。', effect: 'guide' });
  // Seven editor rules made at distinct instants: recency, not ledger order, decides which five a request reads.
  if (usePreferences === 'top-five') for (let index = 2; index <= 7; index += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
      categoryId: 'typos-and-usage', text: `合成偏好${index}：统一用语。`, effect: 'guide' });
  }
  const materialIds = useMaterial ? [await sample1DerivedLibraryItem(store, roots, book)] : [];
  let work = store.createReviewRunPreparationWork(book.bookId, [...categories],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, materialIds);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const run = work.projection!.run!;
  store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  await driver.drive(run.reviewRunId);
  return { store, bookId: book.bookId, reviewRunId: run.reviewRunId, requests };
}

const typosDefinition = () => reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));

it('offers a local ask only on the third same-category accepted edit within a Run, with no new model request', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage'], () => 'repeated');
  const result = opened.inspectReviewWorkspace(bookId, reviewRunId).run!;
  expect(result.findings).toHaveLength(4);
  const count = requests.length;
  for (const [index, finding] of result.findings.entries()) {
    const applied = opened.applyChangeSuggestion({ manuscriptId: result.manuscript.manuscriptId, branchId: result.manuscript.branchId,
      windowStartBlockId: finding.blockId, markId: finding.markId!, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    const decisionId = applied.card!.suggestion!.decision!.decisionId;
    const ask = opened.recordLearningReasonAsk({ action: 'offer', decisionId }, 'often');
    if (index !== 2) expect(ask).toBeNull();
    else expect(ask).toMatchObject({ decisionId, options: ['语言更准确', '保持作者风格'] });
  }
  expect(requests).toHaveLength(count);
});

it('sends only selected preference lines, records exact unit/finding versions, exports them and measures adoption from decisions', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage', 'publication-risk'],
    (category, ordinal, prior) => category === 'typos-and-usage' && ordinal === 1 && prior === 0 ? 'tools' : 'valid', (policy) => policy, false, 'top-five');
  const result = opened.inspectReviewWorkspace(bookId, reviewRunId).run!;
  const finding = result.findings.find((entry) => entry.categoryId === 'typos-and-usage')!;
  expect(finding).toBeDefined();
  const version = opened.inspectHouseReviewPreference().current!;
  expect(version.lines).toHaveLength(7);
  // The newest five rules, newest first; the two oldest (ledger lines 0 and 1) are left out.
  expect(finding.referencedRuleVersions).toEqual([6, 5, 4, 3, 2].map((lineIndex) =>
    ({ versionId: version.versionId, ordinal: version.ordinal, lineIndex, text: version.lines[lineIndex]!.text })));
  const selected = finding.referencedRuleVersions!;
  expect(selected).toHaveLength(5);
  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  expect(selected.reduce((sum, line) => sum + [...segmenter.segment(line.text)].length, 0)).toBeLessThanOrEqual(200);
  const rule = finding.referencedRuleVersions![0]!;
  expect(requests.filter((entry) => entry.category === 'typos-and-usage').every((entry) =>
    selected.every((line) => entry.body.includes(line.text)) && version.lines.slice(0, 2).every((line) => !entry.body.includes(line.text)))).toBe(true);
  expect(requests.filter((entry) => entry.category === 'publication-risk').every((entry) =>
    version.lines.every((line) => !entry.body.includes(line.text)))).toBe(true);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const records = db.prepare(`SELECT u.canonical_json FROM analysis_unit_results u JOIN analysis_result_set_revisions r ON r.revision_id = u.revision_id
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE t.kind = 'editorial-review/typos-and-usage' AND u.state = 'closed'`).all();
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) expect((JSON.parse(String(row.canonical_json)) as { referencedRuleVersions: unknown[] }).referencedRuleVersions).toEqual(selected);
    // The production request's frozen prompt is the /4 wrapper over its unchanged base, carrying exactly the pinned selection.
    const taskIntentId = result.categories.find((category) => category.categoryId === 'typos-and-usage')!.taskIntentId!;
    const pinned = new HouseReviewPreferenceLedger(db).pinned(taskIntentId)!;
    expect(pinned.selection!.lineIndexes).toEqual([6, 5, 4, 3, 2]);
    const envelope = db.prepare(`SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope'
      ORDER BY plan_version DESC LIMIT 1`).get(taskIntentId)!;
    const frozen = (JSON.parse(String(envelope.canonical_json)) as { promptContractDigest: string }).promptContractDigest;
    const run = db.prepare('SELECT run_record_id FROM analysis_run_records WHERE task_intent_id = ?').get(taskIntentId)!;
    const executed = opened.executionLedgerForRun(String(run.run_record_id)).definition;
    const wrapper = [executed, executed.clarificationBase].find((entry) => entry !== undefined && liveHouseReviewPreferenceContract(entry) !== null)!;
    const proof = liveHouseReviewPreferenceContract(wrapper)!;
    const block = wrapper.systemPrompt.slice(proof.base.systemPrompt.length + 1);
    expect(block).toContain(`记录版本：${version.versionId}`);
    expect(wrapper.promptContractDigest).toBe(sha256Hex(canonicalJson({ schema: 'ai7.editorial-review.prompt-contract/4',
      basePromptContractDigest: proof.base.promptContractDigest, preference: pinned, block })));
    expect([executed.promptContractDigest, wrapper.promptContractDigest]).toContain(frozen);
  } finally { db.close(); }
  const report = opened.generateReviewReport(bookId, reviewRunId).run!.report!;
  expect(report.record.appendix.referencedRules).toEqual([{ findingId: finding.findingId, categoryLabel: '错别字与规范用语',
    locationLabel: `内容块 ${finding.blockPosition}`, rules: selected }]);
  for (const format of ['markdown', 'pdf', 'docx'] as const) {
    const output = renderReportExport({ bookTitle: '合成生产审阅', version: report.version, generatedAt: report.generatedAt, record: report.record }, format, { emit: true });
    expect(output.bytes?.byteLength).toBeGreaterThan(0);
    if (format !== 'docx') {
      const text = new TextDecoder().decode(output.bytes!);
      expect(text).toContain(`错别字与规范用语 · 内容块 ${finding.blockPosition} · 已参考规则：${rule.text}`); expect(text).toContain(rule.versionId);
    }
  }
  const before = opened.inspectEditQualitySignals(bookId).preferenceAdoption!.find((entry) => entry.versionId === rule.versionId)!;
  expect(before).toMatchObject({ referenced: { findings: 1, accepted: 0, rate: 0 }, unreferenced: { findings: 1, accepted: 0 }, mostlyRejected: false });
  opened.recordChangeSuggestionDecision({ manuscriptId: result.manuscript.manuscriptId, branchId: result.manuscript.branchId,
    windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: null });
  const after = opened.inspectEditQualitySignals(bookId).preferenceAdoption!.find((entry) => entry.versionId === rule.versionId)!;
  expect(after).toMatchObject({ referenced: { findings: 1, accepted: 0, rejected: 1, rate: 0 }, mostlyRejected: true });
  expect(opened.inspectHouseReviewPreference().current?.versionId).toBe(rule.versionId);
}, 60_000);

it('dates a derived line by its verified admitting decision, so five later editor rules outrank it', async () => {
  const { store: opened, bookId, reviewRunId } = await productionReview(['typos-and-usage'], () => 'repeated');
  // One judged finding admitted for the house first: its derived line is the oldest fact in the ledger.
  const finding = opened.inspectReviewWorkspace(bookId, reviewRunId).run!.findings[0]!;
  opened.recordReviewFindingDisposition(bookId, reviewRunId, finding.findingId, '保留本书体例');
  const material = opened.inspectLearningMaterials(bookId).books[0]!.materials.find((entry) => entry.kind === 'review-disposition')!;
  opened.decideLearningMaterial({ bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0, choice: 'house', note: null });
  const derived = opened.inspectHouseReviewPreference().current!.lines.find((line) => line.sources.length > 0)!;
  expect(derived).toMatchObject({ categoryId: 'typos-and-usage', bookId: null });
  for (let index = 1; index <= 5; index += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    opened.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: `合成规则${index}：统一用语。`, effect: 'guide' });
  }
  const version = opened.inspectHouseReviewPreference().current!;
  expect(version.lines.map((line) => line.text)).toContain(derived.text);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    // Dated by the version's own (newest) instant the derived line would lead; dated by its admission it is the one left out.
    const use = new HouseReviewPreferenceLedger(db).use('ordinary-production', bookId, 'typos-and-usage')!;
    expect(use.lines).toEqual([5, 4, 3, 2, 1].map((index) => `合成规则${index}：统一用语。`));
    expect(use.lines).not.toContain(derived.text);
  } finally { db.close(); }
}, 60_000);

it('reconstructs a tool-aware material review from its frozen plan and retains its material wrapper', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage'],
    (_category, ordinal, prior) => ordinal === 1 && prior === 0 ? 'tools' : 'valid', (policy) => policy, true);
  const settled = opened.inspectReviewWorkspace(bookId, reviewRunId).run!;
  expect(settled.categories.every((category) => category.state === 'settled')).toBe(true);
  expect(requests.some((request) => request.body.includes('read_blocks') && request.body.includes('sample1 背景摘录'))).toBe(true);
  expect(settled.findings.filter((finding) => finding.categoryId === 'typos-and-usage')).toHaveLength(1);
}, 60_000);

it('admits one byte-identical contract retry under v26 and publishes risk points with 未联网核查', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage', 'publication-risk'],
    (category, ordinal, prior) => (category === 'typos-and-usage' && ordinal === 1 && prior === 0 ? 'invalid' : 'valid'));
  const result = opened.inspectReviewCategory(bookId, typosDefinition());
  expect(result.run!.adaptations?.map((entry) => [entry.adaptationClass, entry.attemptIndex, entry.repetition]))
    .toEqual([['contract-retry', 2, 'byte-identical']]);
  const retried = requests.filter((entry) => entry.category === 'typos-and-usage' && entry.ordinal === 1);
  expect(retried).toHaveLength(2);
  expect(retried[0]!.body === retried[1]!.body).toBe(true);
  const riskRequests = requests.filter((entry) => entry.category === 'publication-risk');
  expect(riskRequests.length).toBeGreaterThan(0);
  expect(riskRequests.every((entry) => [...entry.tools].sort().join(',') === 'baseline_facts,exact_fetch,guideline_clause,read_blocks,retrieve,search_manuscript,term_table')).toBe(true);
  const settled = opened.inspectReviewWorkspace(bookId, reviewRunId).run!;
  expect(settled.categories.every((category) => category.state === 'settled')).toBe(true);
  const risk = settled.findings.filter((finding) => finding.categoryId === 'publication-risk');
  expect(risk).toHaveLength(1);
  expect(risk.every((finding) => finding.riskPoint && finding.stateLine === '未联网核查' && finding.note.includes('未联网核查'))).toBe(true);
}, 60_000);

it('admits a two-tool turn under the verified ordinary-production policy and settles its anchored review', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage'],
    (_category, ordinal, prior) => ordinal === 1 && prior === 0 ? 'tools' : 'valid');
  const first = requests.filter((entry) => entry.ordinal === 1);
  expect(first).toHaveLength(2);
  const next = JSON.parse(first[1]!.body) as { messages: Array<{ role: string; content: string }> };
  const results = next.messages.filter((entry) => entry.role === 'tool');
  expect(results).toHaveLength(2);
  expect(results.every((entry) => Array.isArray(JSON.parse(entry.content)))).toBe(true);
  expect(first[0]!.body.includes('不调用任何工具')).toBe(false);
  const settled = opened.inspectReviewWorkspace(bookId, reviewRunId).run!;
  expect(settled.categories.every((category) => category.state === 'settled')).toBe(true);
  expect(settled.findings.filter((finding) => finding.categoryId === 'typos-and-usage')).toHaveLength(1);
  expect(opened.inspectReviewCategory(bookId, typosDefinition()).resultSetRevision?.gaps).toEqual([]);
}, 60_000);

// The Run hands the projected `transport.requestDeadlineSeconds` to the adapter (#1103): v26 states the fallback's 180 s, so only a
// projection that says otherwise shows the read. Under the fallback this stalled request would outlive the test's own timeout.
it('ends a stalled sent request at the projected deadline as that unit\'s unknown outcome, never resent', async () => {
  const { store: opened, bookId, reviewRunId, requests } = await productionReview(['typos-and-usage'],
    (_category, ordinal, prior) => (ordinal === 1 && prior === 0 ? 'stall' : 'valid'),
    (policy) => ({ ...policy, providerProcessing: { ...policy.providerProcessing,
      transport: { ...policy.providerProcessing.transport!, requestDeadlineSeconds: 1 } } }), false, true);
  const stalled = requests.filter((entry) => entry.ordinal === 1);
  expect(stalled).toHaveLength(1);
  expect(stalled[0]!.abortReason).toMatchObject({ name: 'TimeoutError' });
  expect(stalled[0]!.abortedAt! - stalled[0]!.sentAt).toBeGreaterThanOrEqual(900);
  expect(stalled[0]!.abortedAt! - stalled[0]!.sentAt).toBeLessThan(30_000);
  expect(opened.inspectReviewCategory(bookId, typosDefinition()).resultSetRevision!.gaps)
    .toEqual([expect.objectContaining({ unitOrdinal: 1, code: 'outcome-unknown' })]);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const event = db.prepare("SELECT canonical_json FROM review_run_category_events WHERE review_run_id = ? AND state = 'settled'").get(reviewRunId)!;
    const references = (JSON.parse(String(event.canonical_json)) as { unitPreferenceReferences: Array<{ unitOrdinal: number; referencedRuleVersions: unknown[] }> }).unitPreferenceReferences;
    expect(references.find((unit) => unit.unitOrdinal === 1)?.referencedRuleVersions).toHaveLength(1);
  } finally { db.close(); }
}, 60_000);
