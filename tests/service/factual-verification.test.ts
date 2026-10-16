import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armPerTicketHostAdmission } from '../../src/shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import {
  CORRECTION_ASSURANCE_INCOMPLETE_LABEL,
  EVIDENCE_ASSURANCE_OFFLINE_DEGRADE,
  STALE_VERIFICATION_ANCHOR_LABEL,
  SUPPLEMENTARY_CHECK_DEFERRED,
  type EvidenceAssuranceLevel,
  type FactualVerificationResultProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

// Issue #901 (wave 8, slice 8a): 事实核查 at its three Evidence Assurance Levels through the real store, Review Run, frozen plan,
// execution owner, harness tool loop, Egress Gate, retention and the factual verification ledger, on a socket-free transport.
// Unit 1's model searches once, reads one page and answers with Factual Review Contract v2: one assertion whose quotation is cut
// at run time from the unit message it received, and the relations the scenario names. Every page is synthetic public text
// written here; no manuscript text appears in this file, and none is printed or compared.
armPerTicketHostAdmission();

const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
const MUSEUM = 'https://museum.example.org/zun';
const MIRROR = 'https://www.museum.example.org/zun-copy';
const PRESS = 'https://press.example.cn/zun';
const ARCHIVE = 'https://archive.example.com.cn/zun';
const GONE = 'https://gone.example.net/zun';
const HELD = '它现藏湖北省博物馆';
const ELSEWHERE = '该器现藏省外一处展馆';
const PAGES: Record<string, { status: number; body: string }> = {
  [MUSEUM]: { status: 200, body: `<html><head><meta charset="utf-8"></head><body><p>这件尊盘出土于1978年。${HELD}，是馆藏重器。</p></body></html>` },
  [MIRROR]: { status: 200, body: `<html><head><meta charset="utf-8"></head><body><p>转载：${HELD}。</p></body></html>` },
  [PRESS]: { status: 200, body: `<html><head><meta charset="utf-8"></head><body><p>${ELSEWHERE}，不在本省。</p></body></html>` },
  [ARCHIVE]: { status: 200, body: `<html><head><meta charset="utf-8"></head><body><p>档案记载：${HELD}。</p></body></html>` },
  [GONE]: { status: 404, body: 'not found' },
};

type Relation = { sourceRef: string; relation: string; excerptRef: string | null; lineage: string | null };
interface Scenario {
  relations: Relation[];
  correction?: boolean;
  offline?: boolean;
}

let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let sends: { model: number; search: number; pages: string[]; toolSchemas: number; runs: number };
let scenario: Scenario;
let connected = false;

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

async function setup(initial: Scenario): Promise<void> {
  scenario = initial;
  connected = false;
  roots = await createServiceTestRoots('ai7-factual-verification-');
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.factualReviewLedger.bindLaunch(launch);
  sends = { model: 0, search: 0, pages: [], toolSchemas: 0, runs: 0 };
  const usage = { prompt_tokens: 40, completion_tokens: 20 };
  const answer = (message: Record<string, unknown>): Response => new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { reasoning_content: '合成推理通道。', ...message }, finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop' }], usage }), { status: 200 });
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === TINYFISH.host) {
      sends.search += 1;
      return new Response(JSON.stringify({ results: [{ title: '馆藏 - 博物馆', url: MUSEUM, snippet: '馆藏页。' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const page = PAGES[url.href];
    if (page !== undefined) {
      sends.pages.push(url.href);
      return new Response(page.body, { status: page.status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    sends.model += 1;
    const body = JSON.parse(String(init?.body)) as { tools?: unknown[]; messages: Array<{ role: string; content: string | null }> };
    sends.toolSchemas += body.tools?.length ?? 0;
    const unit = body.messages.find((message) => message.role === 'user')!.content ?? '';
    const header = parseFactualReviewUnitMessageHeader(unit);
    const tools = body.messages.filter((message) => message.role === 'tool').length;
    const declared = (body.tools?.length ?? 0) > 0;
    if (header !== null) {
      if (declared && header.ordinal === 1 && tools === 0) return answer({ content: null, tool_calls: [{ id: 'call_search', type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: 'public background fact for a provider-free verification regression' }) } }] });
      if (declared && header.ordinal === 1 && tools === 1) return answer({ content: null, tool_calls: [{ id: 'call_fetch', type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: MUSEUM }) } }] });
      const cited = header.ordinal === 1 ? quoteFrom(unit) : null;
      const v2 = body.messages[0]!.content?.includes('ai7.factual-review.unit-result/2') === true;
      const base = cited === null ? [] : [{ quote: cited.quote, blockOrdinal: cited.blockOrdinal, assertionClass: 'real-world-fact', category: '机构', severity: 'A',
        question: '该器物现藏何处？', basis: '馆藏页记载其收藏地点。' }];
      if (!v2) return answer({ content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/1', unitOrdinal: header.ordinal, assertions: base }) });
      const assertions = base.map((assertion) => ({ ...assertion, evidenceRelations: scenario.relations }));
      const corrections = cited !== null && scenario.correction === true
        ? [{ assertionRef: 1, variants: [{ text: `${[...cited.quote].slice(0, -1).join('')}〇`, rationale: '已核对来源与原文所记收藏地点不符。' }] }] : [];
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/2', unitOrdinal: header.ordinal, assertions, corrections }) });
    }
    const last = body.messages.at(-1)!.content ?? '';
    const result = last.startsWith('保证抽样 ')
      ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查核查结果。', basis: '合成回归账目。' }] };
    return answer({ content: JSON.stringify(result) });
  };
  owner = new BaselineAnalysisExecutionOwner({
    ledger: store.factualReviewLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    // A business Run (no development validation): no live-once cache stands between Books that read the same sample1 units.
    developerLive: { launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: null }, nativeFetch },
    researchEvidence: (input) => { store.recordResearchEvidence(input); },
    factualRunStart: (input) => { store.recordFactualRunAssurance({ ...input, offline: scenario.offline === true }); },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await owner?.dispose();
  store?.close();
  await roots?.dispose();
});

type Book = Awaited<ReturnType<typeof importSample1Book>>;

async function newBook(name: string): Promise<Book> {
  const book = await importSample1Book(store, roots.codeRoot, name);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  // The connection is the store's, recorded once however many Books a case imports.
  if (!connected) recordMissingCredentialConnection(store, '合成连接');
  connected = true;
  return book;
}

/** One 事实核查 Review Run of the whole Book, at the level named (left at the default 标准核查 when none is). */
async function review(book: Book, level?: EvidenceAssuranceLevel): Promise<{ reviewRunId: string; results: FactualVerificationResultProjection[] }> {
  let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const reviewRunId = work.projection!.run!.reviewRunId;
  const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId });
  expect(plan.edit.assurance?.level).toBe('standard');
  if (level !== undefined && level !== 'standard') {
    store.editTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId, planEnvelopeDigest: plan.edit.planEnvelopeDigest!,
      removedSteps: [], disallowedAdaptations: [], evidenceAssuranceLevel: level });
    expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId }).edit.assurance?.level).toBe(level);
  }
  const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
  store.authorizeReviewRun(book.bookId, reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  sends.runs += 1;
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try { await driver.drive(reviewRunId); } finally { await driver.dispose(); }
  const lens = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId, after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
  return { reviewRunId, results: [...lens.results] };
}

function storeError(operation: () => unknown): string {
  try { operation(); } catch (error) { if (error instanceof StoreError) return error.code; throw error; }
  return 'no-error';
}

function changesOf(): number {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return ['factual_run_assurance', 'factual_verification_results', 'factual_review_decisions', 'correction_proposals', 'editorial_marks', 'manuscript_revisions']
      .reduce((total, table) => total + Number((database.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n), 0);
  } finally {
    database.close();
  }
}

function binding(book: Book): Book & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

describe('Evidence Assurance Levels on 事实核查 (Issue #901)', () => {
  it('records 证据支持 from one exact excerpt at 标准核查, and the evidence workspace reads it without writing anything', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }, { sourceRef: GONE, relation: '反驳', excerptRef: null, lineage: null }] });
    const book = await newBook('标准核查回归');
    const { results } = await review(book);
    const result = results.find((entry) => entry.states.factualVerification !== '待核查')!;
    expect(result).toMatchObject({ level: 'standard', plannedLevel: 'standard', disclosure: null, version: 1,
      states: { referenceIntegrity: 'verified', claimSupport: '成立', factualVerification: '证据支持' }, sourceCondition: 'checked',
      sourceCounts: { checked: 1, candidates: 1, independent: 1, reused: 0 }, anchor: { state: 'current', label: null }, pendingReview: true, decision: null,
      correctionAvailable: false });
    expect(result.policyPin.document).toBe('docs/policies/factual-verification-policy.md');
    // Every other assertion was never researched by its unit: 待核查, never a verdict.
    expect(results.filter((entry) => entry.resultId !== result.resultId).every((entry) => entry.states.factualVerification === '待核查')).toBe(true);
    const before = changesOf();
    const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null });
    expect(changesOf()).toBe(before);
    const [exact, candidate] = workspace.sources;
    expect(exact).toMatchObject({ checkState: 'exact', checkLabel: '已精确取文', relation: '支持', excerpt: HELD, integrity: 'located', freshness: 'current', lineage: 'original', reused: false });
    expect(exact!.sourceVersion).toMatch(/^[0-9a-f]{64}$/u);
    expect(exact!.evidenceId).not.toBeNull();
    // A candidate is never quoted or counted (EVID-004).
    expect(candidate).toMatchObject({ checkState: 'candidate', checkLabel: '候选来源 · 尚未核对', excerpt: null, independenceGroup: null });
    expect(workspace.conflicts).toEqual([]);
    expect(workspace.summary.label).toBe('非证据');
    expect(workspace.summary.statements.every((statement) => statement.cardIds.every((id) => workspace.sources.some((card) => card.cardId === id)))).toBe(true);
    expect(workspace.decisionCard.choices.map((choice) => choice.label)).toEqual(['接受当前核查结论', '要求补充证据', '维持未决', '不采纳该核查判断', '自行输入']);
    expect(workspace.decisionCard.drift).toBeNull();
    expect(workspace.matrix).toEqual({ minPinned: 2, maxPinned: 4 });
    // Accepting a supported conclusion closes the attention item and offers no correction.
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'accept', ownWords: null,
      reason: { state: 'selected', text: '已核对的来源支持这条断言', suggestion: '已核对的来源支持这条断言' } });
    const after = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId: null, after: null, chapterBlockId: null, outcome: '证据支持', severity: null, sourceCondition: null, actionNeed: null });
    expect(after.results[0]).toMatchObject({ pendingReview: false, actionNeed: 'none', correctionAvailable: false,
      decision: { disposition: 'accept', reason: { state: 'selected' }, superseded: false } });
  }, 120_000);

  it('keeps a conflict side by side and never picks a winner', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: null }, { sourceRef: PRESS, relation: '反驳', excerptRef: ELSEWHERE, lineage: null }] });
    const book = await newBook('证据冲突回归');
    const result = (await review(book)).results.find((entry) => entry.states.factualVerification !== '待核查')!;
    expect(result.states).toMatchObject({ claimSupport: '冲突', factualVerification: '证据冲突' });
    expect(result.sourceCondition).toBe('conflicting');
    const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null });
    expect(workspace.conflicts).toHaveLength(1);
    expect(workspace.conflicts[0]!.point).toContain(ELSEWHERE);
    expect(workspace.decisionCard.recommendation?.disposition).toBe('request-evidence');
  }, 120_000);

  it('turns an accepted 疑似错误 into an ordinary 修改建议 with its lineage, which decision, Apply and reversal carry unchanged', async () => {
    await setup({ relations: [{ sourceRef: PRESS, relation: '反驳', excerptRef: ELSEWHERE, lineage: 'original' }], correction: true });
    const book = await newBook('更正提案回归');
    const result = (await review(book)).results.find((entry) => entry.states.factualVerification !== '待核查')!;
    expect(result.states.factualVerification).toBe('疑似错误');
    expect(result.correctionAvailable).toBe(false);
    expect(storeError(() => store.prepareCorrectionProposal({ bookId: book.bookId, resultId: result.resultId }))).toBe('CORRECTION_NOT_OFFERED');
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'accept', ownWords: null, reason: null });
    const draft = store.prepareCorrectionProposal({ bookId: book.bookId, resultId: result.resultId });
    expect(draft).toMatchObject({ assuranceIncomplete: false, label: null, missingChecks: [], scope: 'minimal', ownEditAllowed: true });
    expect(draft.variants).toHaveLength(1);
    expect(draft.variants[0]!.evidenceCardIds).toHaveLength(1);
    const primary = draft.ranges.filter((range) => range.primary);
    expect(primary).toHaveLength(1);
    expect(draft.ranges.every((range) => range.text === primary[0]!.text)).toBe(true);
    const before = changesOf();
    store.prepareCorrectionProposal({ bookId: book.bookId, resultId: result.resultId });
    expect(changesOf()).toBe(before);
    expect(storeError(() => store.saveCorrectionProposal({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, variantId: 'v1', text: primary[0]!.text,
      rationale: '', rangeIds: [primary[0]!.rangeId] }))).toBe('CORRECTION_INVALID');
    const saved = store.saveCorrectionProposal({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, variantId: 'v1', text: draft.variants[0]!.text,
      rationale: draft.variants[0]!.rationale, rangeIds: [primary[0]!.rangeId] });
    expect(saved.markIds).toHaveLength(1);
    expect(saved.assuranceIncomplete).toBe(false);
    const markId = saved.markIds[0]!;
    const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
    expect(card.kind).toBe('change-suggestion');
    expect(card.suggestion?.decision).toBeNull();
    expect(card.suggestion?.atomicGroupId).toBeNull();
    expect(card.factualCorrection).toMatchObject({ resultVersion: 1, level: 'standard', assuranceLabel: null, checkedSources: 1,
      states: { factualVerification: '疑似错误' } });
    const applied = store.applyChangeSuggestion({ ...binding(book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    expect(applied.card?.status).toBe('applied');
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).factualCorrection?.resultVersion).toBe(1);
    store.reverseAppliedChangeSuggestion({ ...binding(book), markId, clientEffectId: randomUUID() });
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).factualCorrection).toMatchObject({ resultVersion: 1, assuranceLabel: null });
  }, 120_000);

  it('runs 快速整理 with no tool and no egress, records only 待核查, and keeps 证据核查未完成 through Apply and reversal', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: null }] });
    const book = await newBook('快速整理回归');
    const { results } = await review(book, 'quick');
    expect(sends.search).toBe(0);
    expect(sends.pages).toEqual([]);
    expect(sends.toolSchemas).toBe(0);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.level === 'quick' && entry.states.factualVerification === '待核查' && entry.states.claimSupport === '未核查')).toBe(true);
    const result = results[0]!;
    expect(result.correctionAvailable).toBe(true);
    const draft = store.prepareCorrectionProposal({ bookId: book.bookId, resultId: result.resultId });
    expect(draft).toMatchObject({ assuranceIncomplete: true, label: CORRECTION_ASSURANCE_INCOMPLETE_LABEL, variants: [] });
    expect(draft.missingChecks).toContain('未做证据核查（快速整理）');
    const primary = draft.ranges.find((range) => range.primary)!;
    const saved = store.saveCorrectionProposal({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, variantId: null,
      text: `${primary.text}（待核）`, rationale: '编辑自行编辑的更正。', rangeIds: [primary.rangeId] });
    expect(saved.label).toBe(CORRECTION_ASSURANCE_INCOMPLETE_LABEL);
    const markId = saved.markIds[0]!;
    const label = (): string | null | undefined => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).factualCorrection?.assuranceLabel;
    expect(label()).toBe(CORRECTION_ASSURANCE_INCOMPLETE_LABEL);
    store.applyChangeSuggestion({ ...binding(book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    expect(label()).toBe(CORRECTION_ASSURANCE_INCOMPLETE_LABEL);
    store.reverseAppliedChangeSuggestion({ ...binding(book), markId, clientEffectId: randomUUID() });
    expect(label()).toBe(CORRECTION_ASSURANCE_INCOMPLETE_LABEL);
    // A quick Run can never hold a formal outcome: the schema refuses one outright.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(() => database.prepare("UPDATE factual_verification_results SET factual_verification = '证据支持'").run()).toThrow(/IMMUTABLE/u);
    } finally { database.close(); }
  }, 120_000);

  it('lowers 标准核查 to 快速整理 only on an offline verdict at Run start, and says so in the result', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: null }], offline: true });
    const book = await newBook('离线降级回归');
    const { results } = await review(book);
    expect(results.every((entry) => entry.plannedLevel === 'standard' && entry.level === 'quick' && entry.disclosure === EVIDENCE_ASSURANCE_OFFLINE_DEGRADE &&
      entry.states.factualVerification === '待核查')).toBe(true);
    expect(results[0]!.limitations).toContain(EVIDENCE_ASSURANCE_OFFLINE_DEGRADE);
    const lens = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId: null, after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
    expect(lens.run).toMatchObject({ plannedLevel: 'standard', effectiveLevel: 'quick', disclosure: EVIDENCE_ASSURANCE_OFFLINE_DEGRADE });
  }, 120_000);

  // A Book holds one 事实核查 Run until the factual update modes land (#905): each case is its own Book (Issue #901 rev 4).
  it('requires two independent sources at 严格核查: one registrable domain is one source, and dependent material never counts', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }, { sourceRef: MIRROR, relation: '支持', excerptRef: HELD, lineage: null }] });
    const sameDomain = (await review(await newBook('严格核查同域回归'), 'strict')).results.find((entry) => entry.sourceCounts.checked > 0)!;
    expect(sameDomain).toMatchObject({ level: 'strict', states: { claimSupport: '成立', factualVerification: '证据不足' }, sourceCounts: { checked: 2, independent: 1 } });
    expect(sameDomain.limitations.some((line) => line.includes('相互独立'))).toBe(true);
    scenario = { relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }, { sourceRef: ARCHIVE, relation: '支持', excerptRef: HELD, lineage: 'original' }] };
    const independent = (await review(await newBook('严格核查独立回归'), 'strict')).results.find((entry) => entry.sourceCounts.checked > 0)!;
    expect(independent).toMatchObject({ level: 'strict', states: { factualVerification: '证据支持' }, sourceCounts: { checked: 2, independent: 2 } });
    scenario = { relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }, { sourceRef: ARCHIVE, relation: '支持', excerptRef: HELD, lineage: 'syndicated' }] };
    const dependent = (await review(await newBook('严格核查转载回归'), 'strict')).results.find((entry) => entry.sourceCounts.checked > 0)!;
    expect(dependent).toMatchObject({ states: { factualVerification: '证据不足' }, sourceCounts: { independent: 1 } });
    // The same evidence at 标准核查 records 证据支持: the level, not the evidence, raised the gate.
    const standard = (await review(await newBook('标准核查转载回归'))).results.find((entry) => entry.sourceCounts.checked > 0)!;
    expect(standard).toMatchObject({ level: 'standard', states: { factualVerification: '证据支持' } });
  }, 240_000);

  it('records the decision with its reason state, refuses an invalid one, and records 要求补充证据 without preparing a Task (#905)', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: null }] });
    const book = await newBook('审阅决定回归');
    const result = (await review(book)).results.find((entry) => entry.sourceCounts.checked > 0)!;
    expect(storeError(() => store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 2, disposition: 'accept', ownWords: null, reason: null })))
      .toBe('FACTUAL_DECISION_STALE');
    expect(storeError(() => store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'own-words', ownWords: null, reason: null })))
      .toBe('FACTUAL_DECISION_INVALID');
    expect(storeError(() => store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'accept', ownWords: null,
      reason: { state: 'selected', text: '别的理由', suggestion: '与我掌握的出处一致' } }))).toBe('FACTUAL_DECISION_INVALID');
    const before = changesOf();
    const own = store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'own-words', ownWords: '以馆方公告为准。',
      reason: { state: 'corrected', text: '与我掌握的出处一致，补充了馆方公告', suggestion: '与我掌握的出处一致' } });
    expect(changesOf()).toBe(before + 1);
    expect(own.supplementary).toBeNull();
    expect(own.workspace.decisions).toEqual([expect.objectContaining({ boundVersion: 1, superseded: false, disposition: 'own-words', ownWords: '以馆方公告为准。',
      reason: { state: 'corrected', text: '与我掌握的出处一致，补充了馆方公告', suggestion: '与我掌握的出处一致' }, requestedLevel: null })]);
    const asked = store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'request-evidence', ownWords: null, reason: null });
    expect(asked.supplementary).toEqual({ blockId: result.blockId, level: 'standard', statement: SUPPLEMENTARY_CHECK_DEFERRED });
    expect(asked.supplementary!.statement).toContain('#905');
    expect(asked.workspace.decisions.at(-1)).toMatchObject({ disposition: 'request-evidence', requestedLevel: 'standard' });
    // Nothing was prepared: no further Review Run of the Book exists.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('SELECT count(*) AS n FROM review_runs WHERE book_id = ?').get(book.bookId) as { n: number }).n).toBe(1);
    } finally { database.close(); }
  }, 120_000);

  it('marks a result whose words were edited 锚点已失效, keeps it as history, and never moves it to similar text', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: null }] });
    const book = await newBook('锚点失效回归');
    const result = (await review(book)).results.find((entry) => entry.sourceCounts.checked > 0)!;
    const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: result.blockId });
    const block = window.blocks.find((entry) => entry.blockId === result.blockId)!;
    store.flushJournalEdit({
      clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
      windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
      fromGrapheme: result.fromGrapheme + 1, toGrapheme: result.fromGrapheme + 2, insertText: '改',
    });
    const stale = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId: null, after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null })
      .results.find((entry) => entry.resultId === result.resultId)!;
    expect(stale).toMatchObject({ anchor: { state: 'stale', label: STALE_VERIFICATION_ANCHOR_LABEL }, version: 1, blockId: result.blockId, fromGrapheme: result.fromGrapheme,
      states: { factualVerification: '证据支持' }, correctionAvailable: false });
    expect(store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null }).decisionCard.drift).toContain(STALE_VERIFICATION_ANCHOR_LABEL);
    expect(storeError(() => store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'accept', ownWords: null, reason: null })))
      .toBe('FACTUAL_DECISION_DRIFT');
  }, 120_000);
});
