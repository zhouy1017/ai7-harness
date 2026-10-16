import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { SOURCE_TRANSLATION_NOT_ADMITTED } from '../../src/service/analysis/factual-review-evidence.js';
import { RESEARCH_EVIDENCE_INCOMPLETE, RESEARCH_EVIDENCE_READ_ONLY } from '../../src/service/research-evidence.js';
import { findingResearchLines, researchUnitLine } from '../../src/renderer/research-evidence-labels.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armPerTicketHostAdmission, ticketHostHolds } from '../../src/shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { FACTUAL_REVIEW_TASK_GOAL, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Issue #425 (S70): one research Run of 事实核查 on exact sample1 through the real store, frozen plan, execution owner, harness
// tool loop, Egress Gate, per-ticket host admission, live-once ledger and Research Snapshot Cache, on a socket-free transport.
// Unit 1's model searches once, reads one page, and answers; its findings' basis names the pages it relied on. Every page is a
// synthetic public text written here; the quotations are cut at run time from the unit message the model received, so no
// manuscript text appears in this file and none is printed or compared.
armPerTicketHostAdmission();

const QUERY = 'public background fact for a provider-free retention regression';
const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
const MUSEUM = 'https://museum.example.org/zun';
const WIKI = 'https://wiki.example.net/zun';
const ENGLISH = 'https://en.example.com/zun';
const PAGES: Record<string, { status: number; body: string }> = {
  [MUSEUM]: { status: 200, body: '<html><head><meta charset="utf-8"></head><body><h1>馆藏</h1><p>这件尊盘出土于1978年。它现藏湖北省博物馆，是馆藏重器。</p></body></html>' },
  [WIKI]: { status: 403, body: 'forbidden' },
  [ENGLISH]: { status: 200, body: '<html><body><p>The vessel was excavated in 1978. It is held by a provincial museum and shown to visitors.</p></body></html>' },
};

let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let sends: { model: number; search: number; pages: string[] };
let activeRun: string;

/** The located quotation the stub cites: eight characters of the first own block long enough to hold them once. */
function quoteFrom(unit: string): { quote: string; blockOrdinal: number } | null {
  const lines = unit.split('\n');
  const own = lines.findIndex((line) => line.startsWith('以下为本单元需要核查的内容块'));
  let ordinal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\[blk_[0-9a-f]{24}\] \([a-z]+(?: h\d)?\) (.*)$/u.exec(lines[index]!);
    if (match === null) continue;
    ordinal += 1;
    if (index < own) continue;
    const text = [...match[1]!];
    for (let start = 0; start + 8 <= text.length; start += 4) {
      const quote = text.slice(start, start + 8).join('');
      if (quote.trim().length === 8 && match[1]!.indexOf(quote) === match[1]!.lastIndexOf(quote)) return { quote, blockOrdinal: ordinal };
    }
  }
  return null;
}

async function setup(options: { failedModelFetch?: boolean; failRetentionOnce?: boolean; cancelDuringRetention?: boolean; failedSearch?: boolean } = {}): Promise<void> {
  roots = await createServiceTestRoots('ai7-research-evidence-run-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.factualReviewLedger.bindLaunch(launch);
  sends = { model: 0, search: 0, pages: [] };
  const usage = { prompt_tokens: 40, completion_tokens: 20 };
  const answer = (message: Record<string, unknown>): Response => new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { reasoning_content: '合成推理通道。', ...message }, finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop' }], usage }), { status: 200 });
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === TINYFISH.host) {
      sends.search += 1;
      if (options.failedSearch) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify({ results: [
        { title: '馆藏', url: MUSEUM, snippet: '馆藏页。' },
        { title: '尊盘 - 维基百科', url: WIKI, snippet: '该器现藏于湖北省博物馆。' },
        { title: 'Vessel', url: ENGLISH, snippet: 'A vessel.' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const page = PAGES[url.href];
    if (page !== undefined) {
      sends.pages.push(url.href);
      if (options.cancelDuringRetention && url.href === ENGLISH) owner.cancelRun(activeRun, store.factualReviewLedger);
      return new Response(page.body, { status: page.status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    sends.model += 1;
    const body = JSON.parse(String(init?.body)) as { tools?: unknown[]; messages: Array<{ role: string; content: string | null }> };
    const unit = body.messages.find((message) => message.role === 'user')!.content ?? '';
    const header = parseFactualReviewUnitMessageHeader(unit);
    const tools = body.messages.filter((message) => message.role === 'tool').length;
    if (header !== null) {
      // Unit 1 searches once and reads the museum's page; every other unit answers without its tools.
      if (header.ordinal === 1 && tools === 0) return answer({ content: null, tool_calls: [{ id: 'call_search', type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: QUERY }) } }] });
      if (header.ordinal === 1 && tools === 1) return answer({ content: null, tool_calls: [{ id: 'call_fetch', type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: options.failedModelFetch ? WIKI : MUSEUM }) } }] });
      const cited = header.ordinal === 1 ? quoteFrom(unit) : null;
      const assertions = cited === null ? [] : [
        { quote: cited.quote, blockOrdinal: cited.blockOrdinal, assertionClass: 'real-world-fact', category: '机构', severity: 'A', question: '该器物现藏何处？',
          basis: `馆藏页 ${MUSEUM}、维基百科 与 ${ENGLISH} 记载「现藏湖北省博物馆」。` },
      ];
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/1', unitOrdinal: header.ordinal, assertions }) });
    }
    const last = body.messages.at(-1)!.content ?? '';
    const result = last.startsWith('保证抽样 ')
      ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查留存来源。', basis: '合成回归账目。' }] };
    return answer({ content: JSON.stringify(result) });
  };
  owner = new BaselineAnalysisExecutionOwner({
    ledger: store.factualReviewLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'reference-free-review', case: 'sample1-whole-book', delta: null } }, nativeFetch },
    researchEvidence: (input) => {
      if (options.failRetentionOnce) { options.failRetentionOnce = false; throw new Error('synthetic storage failure'); }
      store.recordResearchEvidence(input);
    },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await owner?.dispose();
  store?.close();
  await roots?.dispose();
});

async function runFactualReview(name: string): Promise<string> {
  const book = await importSample1Book(store, roots.codeRoot, name);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  recordMissingCredentialConnection(store, '合成连接');
  let work = store.createFactualReviewPreparationWork(book.bookId, FACTUAL_REVIEW_TASK_GOAL, policy);
  while (!work.done) work = store.advanceFactualReviewPreparationWork(work.workId!);
  const prepared = work.projection!;
  expect(prepared.providerResolutionPlan?.webToolsBackend?.backendId).toBe('search-tinyfish');
  const authorized = store.authorizeFactualReview(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  activeRun = authorized.dispatchRunRecordId!;
  owner.admitOrQueue(authorized.dispatchRunRecordId!, store.factualReviewLedger);
  await owner.whenIdle();
  return book.bookId;
}

describe('a research Run of 事实核查 retains its external evidence', () => {
  it('resolves a review finding through its exact category Task', async () => {
    await setup();
    const book = await importSample1Book(store, roots.codeRoot, '审阅来源回归');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '合成连接');
    let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
    const run = work.projection!.run!;
    store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
    try { await driver.drive(run.reviewRunId); } finally { await driver.dispose(); }
    const settled = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    const finding = settled.findings[0]!;
    const input = { bookId: book.bookId, after: null, staleAfterDays: null, taskIntentId: settled.categories[0]!.taskIntentId!, reviewFindingId: finding.findingId };
    const projection = store.inspectResearchEvidence(input);
    expect(projection.records).toHaveLength(3);
    expect(projection.findings).toHaveLength(1);
    expect(findingResearchLines(projection, finding, (value) => value)).toHaveLength(3);
    expect(store.inspectResearchEvidence({ ...input, taskIntentId: '00000000-0000-4000-8000-000000000099' }).records).toHaveLength(0);
  });

  it('retains each cited source as the unit settles: the model’s page, a retention fetch, an excerpt, and the finding’s alignment', async () => {
    await setup();
    const bookId = await runFactualReview('外部来源留存回归');
    const review = store.inspectFactualReview(bookId);
    expect(review.state).toBe('settled');
    const finding = review.resultSetRevision!.findings[0]!;
    // The revision itself is untouched by retention: its verdict still reads 未外部复核 (FACT-009).
    expect(finding.verdict).toBe('未外部复核');

    // One search; the model's fetch of the museum's page; then one retention fetch per cited page AI7 had no page of.
    expect(sends.search).toBe(1);
    expect(sends.pages).toEqual([MUSEUM, ENGLISH, WIKI]);
    expect(ticketHostHolds()).toBe(0);

    const evidence = store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null });
    expect(evidence.staleAfterDays).toBe(90);
    const byUrl = new Map(evidence.records.map((record) => [record.url, record]));
    expect([...byUrl.keys()].sort()).toEqual([ENGLISH, MUSEUM, WIKI].sort());
    const museum = byUrl.get(MUSEUM)!;
    expect(museum).toMatchObject({ findingId: finding.findingId, backendId: 'search-tinyfish', queryClass: '机构', captureState: 'full-text', captureLabel: '来源全文',
      alignment: 'aligned', alignmentLabel: '对应', claim: { text: '现藏湖北省博物馆', origin: 'basis-quotation' }, translation: null,
      staleness: { state: 'current', reasons: [], label: null }, savedMaterialId: null, saveRefusal: null });
    expect(museum.passage).toBe('它现藏湖北省博物馆，是馆藏重器。');
    expect(museum.anchors).toHaveLength(1);
    expect(museum.pageSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(museum.snapshotDigest).toMatch(/^[0-9a-f]{64}$/u);
    // The page AI7 could not get keeps the excerpt the search returned: 来源仅片段, partly matching the quoted words.
    expect(byUrl.get(WIKI)).toMatchObject({ captureState: 'snippet-only', captureLabel: '来源仅片段', pageSha256: null, alignment: 'partial', alignmentLabel: '部分对应',
      saveRefusal: RESEARCH_EVIDENCE_INCOMPLETE });
    // A non-Chinese source: no translation is produced while no rule names one, and the original is kept as captured.
    expect(byUrl.get(ENGLISH)).toMatchObject({ captureState: 'full-text', alignment: 'unaligned', alignmentLabel: '未能对应', anchors: [],
      translation: { state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED } });
    expect(byUrl.get(ENGLISH)!.passage?.startsWith('The vessel')).toBe(true);

    // Every researched unit says how its search ended; unit 1 searched, the others never did.
    expect(evidence.units.find((unit) => unit.unitOrdinal === 1)).toMatchObject({ state: 'completed', label: '联网核查已完成', searchCalls: 1, retentionFetches: 2, failedRetrievals: 1, unsupportedFindings: 0 });
    expect(evidence.units.filter((unit) => unit.unitOrdinal !== 1).every((unit) => unit.state === 'not-searched' && unit.searchCalls === 0)).toBe(true);
    expect(evidence.findings).toEqual([expect.objectContaining({ findingId: finding.findingId, state: 'sourced', sources: 3, blockId: finding.blockId, quote: finding.quote })]);

    // The live-once ledger names each fetch by digests only, never an address's page text; the Run Report counts them.
    const cache = new ProviderResultCache(join(roots.inputRoot, 'cache'));
    await cache.refresh();
    const fetchLines = cache.lines.filter((line) => (line as { kind?: string }).kind === 'fetch');
    expect(fetchLines.map((line) => (line as { outcome?: string }).outcome)).toEqual(['transmitted', 'transmitted', 'failed']);
    expect(JSON.stringify(cache.lines).includes('馆藏重器')).toBe(false);
    expect(review.taskOutcome!.report!.usagePerStage['platform-tools']).toMatchObject({ searchCalls: { 'search-tinyfish': 1 }, fetchCount: 3 });
    expect(readdirSync(join(roots.inputRoot, 'cache', 'research-snapshots')).filter((name) => name.endsWith('.json'))).toHaveLength(3);
    const taskIntentId = review.taskIntent!.taskIntentId;
    const scoped = store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null, taskIntentId });
    expect(scoped.records.every((entry) => entry.runRecordId === activeRun)).toBe(true);
    expect(store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null, taskIntentId: '00000000-0000-4000-8000-000000000099' }).records).toHaveLength(0);
  });

  it('never retries the model failed fetch during retention', async () => {
    await setup({ failedModelFetch: true });
    const bookId = await runFactualReview('取回失败回归');
    expect(sends.pages.filter((url) => url === WIKI)).toHaveLength(1);
    expect(store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null }).records.find((entry) => entry.url === WIKI)?.captureState).toBe('snippet-only');
  });

  it('sends no next retention fetch once cancellation arrives during the preceding fetch', async () => {
    await setup({ cancelDuringRetention: true });
    const bookId = await runFactualReview('留存取消回归');
    expect(sends.pages).toEqual([MUSEUM, ENGLISH]);
    expect(store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null }).records.find((entry) => entry.url === WIKI)?.captureState).toBe('snippet-only');
  });

  it('discloses failed search as incomplete, and retention storage failure in both source and finding lines', async () => {
    await setup({ failRetentionOnce: true, failedSearch: true });
    const bookId = await runFactualReview('留存异常回归');
    const projection = store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null });
    const unit = projection.units.find((entry) => entry.unitOrdinal === 1)!;
    expect(unit.state).toBe('incomplete');
    expect(researchUnitLine(unit)).toContain('来源留存失败（保存失败）');
    const finding = projection.findings[0]!;
    expect(findingResearchLines(projection, finding, (value) => value)?.[0]).toContain('来源留存失败（保存失败）');
    expect(projection.records).toHaveLength(0);
  });

  it('keeps 保存为来源材料 explicit: one full-text source becomes a 资料库 item with its provenance, and every other case is refused', async () => {
    await setup();
    const bookId = await runFactualReview('来源材料回归');
    const { records } = store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null });
    const museum = records.find((record) => record.url === MUSEUM)!;
    const wiki = records.find((record) => record.url === WIKI)!;
    const before = store.inspectLibraryMaterials(null).materials.length;
    const coverageBefore = JSON.stringify(store.inspectFactualReview(bookId).coverageManifest);

    const frozen = vi.spyOn(store, 'replacementFrozen').mockReturnValue(true);
    await expect(store.saveEvidenceAsMaterial({ bookId, evidenceId: museum.evidenceId, title: null })).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_BOOK_READ_ONLY', message: RESEARCH_EVIDENCE_READ_ONLY });
    expect(store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null }).records.find((record) => record.url === MUSEUM)!.saveRefusal).toBe(RESEARCH_EVIDENCE_READ_ONLY);
    frozen.mockRestore();
    await expect(store.saveEvidenceAsMaterial({ bookId, evidenceId: wiki.evidenceId, title: null })).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_INCOMPLETE' });
    const otherBook = await importSample1Book(store, roots.codeRoot, '另一本书');
    await expect(store.saveEvidenceAsMaterial({ bookId: otherBook.bookId, evidenceId: museum.evidenceId, title: null })).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_NOT_FOUND' });
    expect(store.inspectLibraryMaterials(null).materials).toHaveLength(before);

    let frozenChecks = 0;
    const freezesDuringSave = vi.spyOn(store, 'replacementFrozen').mockImplementation(() => ++frozenChecks > 1);
    await expect(store.saveEvidenceAsMaterial({ bookId, evidenceId: museum.evidenceId, title: null })).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_BOOK_READ_ONLY' });
    freezesDuringSave.mockRestore();
    expect(store.inspectLibraryMaterials(null).materials).toHaveLength(before);

    const saved = await store.saveEvidenceAsMaterial({ bookId, evidenceId: museum.evidenceId, title: null });
    expect(saved.material).toMatchObject({ title: '馆藏', kind: 'web', attribution: null, eligibility: null, reference: { state: 'pending' },
      provenance: { kind: 'research-evidence', evidenceId: museum.evidenceId, bookId, runRecordId: museum.runRecordId, url: MUSEUM,
        capturedAt: museum.capturedAt, contentSha256: museum.contentSha256, pageSha256: museum.pageSha256, snapshotDigest: museum.snapshotDigest } });
    expect(saved.material.source.format).toBe('MD');
    // Indexed on arrival, read-only and scope-bound: no Task of this Book may list it until the editor decides where it belongs.
    expect(store.inspectLibraryMaterial(saved.material.materialId).provenance?.evidenceId).toBe(museum.evidenceId);
    expect(store.inspectResearchEvidence({ bookId, after: null, staleAfterDays: null }).records.find((record) => record.url === MUSEUM))
      .toMatchObject({ savedMaterialId: saved.material.materialId, saveRefusal: '已经保存为来源材料。' });
    await expect(store.saveEvidenceAsMaterial({ bookId, evidenceId: museum.evidenceId, title: null })).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_ALREADY_SAVED' });
    // Saving sent nothing: the page AI7 already had is the material.
    expect(sends.pages).toEqual([MUSEUM, ENGLISH, WIKI]);
    store.startMaterialIndexing();
    await store.settleMaterialIndexing();
    expect(() => store.pinMaterialReference(bookId, saved.material.materialId)).toThrow(expect.objectContaining({ code: 'MATERIAL_REFERENCE_UNAVAILABLE' }));
    store.decideLibraryMaterial({ materialId: saved.material.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId } } });
    store.decideLibraryMaterial({ materialId: saved.material.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
    const pin = store.pinMaterialReference(bookId, saved.material.materialId);
    const watch = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const version = watch.prepare('PRAGMA data_version').get()!.data_version;
      expect(store.readMaterialIndexForTask({ bookId, references: [pin] }, saved.material.materialId, 1).total).toBeGreaterThan(0);
      expect(() => store.readMaterialIndexForTask({ bookId, references: [] }, saved.material.materialId, 1)).toThrow(expect.objectContaining({ code: 'MATERIAL_OUTSIDE_PLAN' }));
      expect(() => store.readMaterialIndexForTask({ bookId: otherBook.bookId, references: [pin] }, saved.material.materialId, 1)).toThrow(expect.objectContaining({ code: 'MATERIAL_REFERENCE_UNAVAILABLE' }));
      expect(watch.prepare('PRAGMA data_version').get()!.data_version).toBe(version);
    } finally { watch.close(); }
    expect(JSON.stringify(store.inspectFactualReview(bookId).coverageManifest) === coverageBefore).toBe(true);
  });
});
