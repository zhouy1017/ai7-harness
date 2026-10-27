import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { createHash, randomUUID } from 'node:crypto';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { buildFactualReviewUnitMessage, type FactualUnitAssertion } from '../../src/service/analysis/factual-review-contract.js';
import { deriveCoverageManifest } from '../../src/service/analysis/coverage-manifest.js';
import { factualClaimVerificationInput, freezeFactualClaimLedger } from '../../src/service/analysis/factual-claim-ledger.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import type { ReviewRunDriveSteps } from '../../src/service/review/review-run-driver.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { EditorialMarkStore } from '../../src/service/editorial-marks.js';
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

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); store = undefined!; owner = undefined!; roots = undefined!; });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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
  claimStages?: boolean;
  claimSearches?: number;
  pendingRound?: boolean;
  claimModelUnknown?: boolean;
  relations: Relation[];
  correction?: boolean;
  offline?: boolean;
  maxTotalTokens?: number;
  twoAssertions?: boolean;
  noAssertions?: boolean;
  invalidUnit?: boolean;
  secondUnit?: 'clarification' | 'unknown';
  atSecondUnit?: () => void;
}

let roots: ServiceTestRoots;
let policy: LaunchPolicyProjection;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
let sends: { model: number; search: number; pages: string[]; toolSchemas: number; runs: number };
let scenario: Scenario;
let connected = false;

function quoteFrom(unit: string, offset = 0): { quote: string; blockOrdinal: number } | null {
  const lines = unit.split('\n');
  const own = lines.findIndex((line) => line.startsWith('以下为本单元需要核查的内容块'));
  let ordinal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\[blk_[0-9a-f]{24}\] \([a-z]+(?: h\d)?\) (.*)$/u.exec(lines[index]!);
    if (match === null) continue;
    ordinal += 1;
    if (index < own) continue;
    const text = [...match[1]!];
    for (let start = offset; start + 8 <= text.length; start += 4) {
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
  const ordinary = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!;
  const connection = initial.claimStages ? store.saveModelServiceConnection('合成普通连接', null, 'ready', 'opencode-go') : null;
  const binding = connection === null ? null : { ...ordinary, credentialReference: connection.credentialReference };
  if (binding !== null) {
    store.selectModelServiceRoute('opencode-go');
    policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
    const backend = store.getSearchBackendConnections().find((entry) => entry.backendId === TINYFISH.id);
    store.saveSearchBackendCredential(TINYFISH.id, backend?.credentialReference ?? null, 'ready');
    store.selectSearchBackend(TINYFISH.id);
    connected = true;
  }
  const launch = binding !== null ? { operationalScope: 'ordinary-production' as const, policy,
    live: { ...binding, scope: 'ordinary-production' as const, runBudgetCeiling: 'unset' as const } } : {
    operationalScope: 'developer-live' as const, policy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: initial.maxTotalTokens ?? 500_000 } },
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
    const unit = body.messages.findLast((message) => message.role === 'user')!.content ?? '';
    const header = parseFactualReviewUnitMessageHeader(unit);
    const tools = body.messages.filter((message) => message.role === 'tool').length;
    const declared = (body.tools?.length ?? 0) > 0;
    if (header !== null) {
      if (header.ordinal === 2) {
        scenario.atSecondUnit?.();
        if (scenario.secondUnit === 'clarification') return answer({ content: JSON.stringify({ question: '本范围按哪个重点处理？', options: ['人物', '事件'], freeTextAllowed: true }) });
        if (scenario.secondUnit === 'unknown') return new Response('data: {"choices":[{"index":0,"delta":{"content":"public synthetic"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
      }
      if (declared && header.ordinal === 1 && tools === 0) return answer({ content: null, tool_calls: [{ id: 'call_search', type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: 'public background fact for a provider-free verification regression' }) } }] });
      if (declared && header.ordinal === 1 && tools === 1) return answer({ content: null, tool_calls: [{ id: 'call_fetch', type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: MUSEUM }) } }] });
      const cited = header.ordinal === 1 ? quoteFrom(unit) : null;
      const v2 = body.messages[0]!.content?.includes('ai7.factual-review.unit-result/2') === true;
      if (scenario.invalidUnit === true) return answer({ content: '{}' });
      const citations = cited === null || scenario.noAssertions === true ? [] : [cited, ...(scenario.twoAssertions === true ? [quoteFrom(unit, 12)].filter((entry) => entry !== null) : [])];
      const base = citations.map((citation) => ({ quote: citation.quote, blockOrdinal: citation.blockOrdinal, assertionClass: 'real-world-fact', category: '机构', severity: 'A',
        question: '该器物现藏何处？', basis: '馆藏页记载其收藏地点。' }));
      if (!v2) return answer({ content: JSON.stringify({ schema: initial.claimStages ? 'ai7.factual-claim-extraction/1' : 'ai7.factual-review.unit-result/1', unitOrdinal: header.ordinal, assertions: base }) });
      const assertions = base.map((assertion) => ({ ...assertion, evidenceRelations: scenario.relations }));
      const corrections = cited !== null && scenario.correction === true
        ? [{ assertionRef: 1, variants: [{ text: `${[...cited.quote].slice(0, -1).join('')}〇`, rationale: '已核对来源与原文所记收藏地点不符。' }] }] : [];
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/2', unitOrdinal: header.ordinal, assertions, corrections }) });
    }
    if (initial.claimStages && unit.startsWith('{')) {
      if (initial.claimModelUnknown) return new Response('data: {"choices":[{"index":0,"delta":{"content":"synthetic"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
      const claim = JSON.parse(unit) as { claimId: string };
      const second = body.messages.filter((message) => message.role === 'user').length > 1;
      const searches = initial.claimSearches ?? 1;
      const search = (ordinal: number) => answer({ content: null, tool_calls: [{ id: `search_${ordinal}`, type: 'function', function: {
        name: 'websearch', arguments: JSON.stringify({ query: `public museum collection fact query ${ordinal}` }) } }] });
      if (tools < searches) return search(tools + 1);
      if (initial.pendingRound && second && tools === 2) return search(2);
      if (tools === searches || initial.pendingRound && second && tools === 3) return answer({ content: null, tool_calls: [{ id: `fetch_${tools}`, type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: MUSEUM }) } }] });
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-claim-verification-result/1', claimId: claim.claimId,
        evidenceRelations: initial.pendingRound && !second ? [] : scenario.relations, corrections: [] }) });
    }
    const last = body.messages.at(-1)!.content ?? '';
    const result = last.startsWith('保证抽样 ')
      ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查核查结果。', basis: '合成回归账目。' }] };
    return answer({ content: JSON.stringify(result) });
  };
  owner = new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.factualReviewLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    // A business Run (no development validation): no live-once cache stands between Books that read the same sample1 units.
    ...(binding === null ? { developerLive: { launch: { runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: initial.maxTotalTokens ?? 500_000 }, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: null }, nativeFetch } }
      : { production: { scope: 'ordinary-production' as const, nativeFetch }, currentLaunchPolicy: () => policy,
        productionPolicyFor: (frozen) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', frozen) }),
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

function enrollFactualRecheck(bookId: string) {
  const runtime = { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 60_000, quietMs: 30_000 };
  const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime, 'factual-recheck');
  expect(shown.offer.canEnroll, shown.offer.reason ?? '').toBe(true);
  return { runtime, enrollment: store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, 'backfill',
    { kind: 'book', seriesId: null }, 20_000, runtime, 'factual-recheck').enrollment! };
}

async function newBook(name: string): Promise<Book> {
  const book = await importSample1Book(store, roots.codeRoot, name);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  // The connection is the store's, recorded once however many Books a case imports.
  if (!connected) recordMissingCredentialConnection(store, '合成连接');
  connected = true;
  return book;
}

/** One 事实核查 Review Run of the whole Book, at the level named (left at the default 标准核查 when none is). */
async function review(book: Book, level?: EvidenceAssuranceLevel, hooks: {
  decisionId?: string;
  prepared?: (reviewRunId: string) => void;
  steps?: (steps: ReviewRunDriveSteps) => ReviewRunDriveSteps;
} = {}): Promise<{ reviewRunId: string; results: FactualVerificationResultProjection[] }> {
  let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy,
    null, [], null, null, null, undefined, hooks.decisionId);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const reviewRunId = work.projection!.run!.reviewRunId;
  hooks.prepared?.(reviewRunId);
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
  const steps = store.reviewRunDriveSteps;
  const driver = new ReviewRunDriver(hooks.steps?.(steps) ?? steps, owner);
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

/** Hash every table without exposing row payloads; counts alone cannot detect updates or delete/insert pairs. */
function databaseState(includeLifetimes = true): Record<string, string> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
    return Object.fromEntries(tables.filter(({ name }) => includeLifetimes || name !== 'service_lifetimes').map(({ name }) => [String(name), createHash('sha256').update(JSON.stringify(
      database.prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}"`).all(),
    )).digest('hex')]));
  } finally { database.close(); }
}

/** Deterministic crash/corruption setup only; restore the exact existing immutability triggers before reopening. */
function editRecordedTables(tables: string[], operation: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  const triggers = tables.flatMap((table) => db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?").all(table));
  try {
    db.exec('BEGIN');
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
    operation(db);
    for (const trigger of triggers) db.exec(String(trigger.sql));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
}

async function reopen(): Promise<void> {
  await owner.dispose();
  store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const launch = { operationalScope: 'developer-live' as const, policy, live: { ...DEVELOPER_LIVE_POLICY_BINDING,
    credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
    runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: scenario.maxTotalTokens ?? 500_000 } } };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.factualReviewLedger.bindLaunch(launch);
  store.reconcileStoppedFactualReviewRuns();
  store.reconcileStoppedReviewCategoryRuns();
}

function lens(book: Book, reviewRunId: string) {
  return store.inspectFactualVerification({ bookId: book.bookId, reviewRunId, after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
}

function retentionRows(reviewRunId: string) {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const snapshot = db.prepare('SELECT canonical_json, sha256 FROM review_runs WHERE review_run_id = ?').get(reviewRunId)!;
    const outcome = db.prepare(`SELECT o.run_record_id, o.result_set_revision_id, o.classification FROM analysis_task_outcomes o
      JOIN review_runs rr JOIN json_each(rr.canonical_json, '$.categories') c
      ON json_extract(c.value, '$.task.taskIntentId') = o.task_intent_id WHERE rr.review_run_id = ?`).get(reviewRunId)!;
    const events = db.prepare('SELECT state, run_record_id, result_set_revision_id, canonical_json, sha256 FROM review_run_category_events WHERE review_run_id = ? ORDER BY sequence').all(reviewRunId);
    const versions = db.prepare('SELECT result_id, version, finding_id, run_record_id, sha256 FROM factual_verification_results WHERE review_run_id = ? ORDER BY rowid').all(reviewRunId);
    return { snapshot, outcome, events, versions };
  } finally { db.close(); }
}

function binding(book: Book): Book & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

function syntheticClaimLedger() {
  const text = '公开合成陈述：该桥建于一九八〇年。';
  const blocks = [text, '第二个公开合成段落。'].map((value, index) => ({ blockId: `blk_${String(index + 1).padStart(24, '0')}`,
    position: index + 1, kind: 'paragraph' as const, level: null, text: value, digest: sha256Hex(value), graphemes: 1200 }));
  const manifest = deriveCoverageManifest({ bookId: '11111111-1111-4111-8111-111111111111', manuscriptId: '22222222-2222-4222-8222-222222222222',
    branchId: '33333333-3333-4333-8333-333333333333', revisionId: '44444444-4444-4444-8444-444444444444',
    revisionLabel: 'r1', revisionDigest: sha256Hex(text), blocks });
  const byId = new Map(blocks.map((block) => [block.blockId, block]));
  const assertion: FactualUnitAssertion = { quote: '该桥建于一九八〇年', blockOrdinal: 1, assertionClass: 'real-world-fact', category: '时间', severity: 'A', question: '建成年份是否一致？', basis: '公开合成核查。' };
  const ledger = freezeFactualClaimLedger({ manifest, blocks: byId, units: manifest.units.map((unit) => ({
    sourceUnitMessage: buildFactualReviewUnitMessage(unit, manifest.units.length, byId),
    result: { schema: 'ai7.factual-review.unit-result/1', unitOrdinal: unit.ordinal, assertions: [assertion,
      ...(unit.ordinal === 1 ? [{ ...assertion, question: '这个年份是否为重建年份？' }, { ...assertion, assertionClass: 'fictional-canon' as const }] : [])] },
  })) });
  return { ledger, assertion };
}

describe('factual claim occurrence ledger', () => {
  it('spends an unknown model submission and preserves that claim allowance after reopen', async () => {
    await setup({ claimStages: true, claimModelUnknown: true, relations: [] });
    const result = (await review(await newBook('未知单条取证结果'))).results[0]!;
    const ledger = store.factualReviewLedger.factualVerification;
    const claims = ledger.claims(result.runRecordId)!;
    const session = ledger.claimSession(result.runRecordId, 'web-verification', claims.claims[0]!.claimId)!;
    expect(ledger.claimRounds(session.sessionId)).toMatchObject([{ state: 'unknown', result: null }]);
    expect(ledger.claimAllowance(session.sessionId)).toEqual({ model: 128, tool: 128, search: 3 });
    const before = sends.model;
    await owner.dispose(); store.close(); store = undefined!;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.factualReviewLedger.factualVerification.claimAllowance(session.sessionId).model).toBe(128);
    expect(sends.model).toBe(before);
  });

  it('preserves claim reservations and source exclusion history through selected-Book merge', async () => {
    await setup({ claimStages: true, claimSearches: 3, relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }] });
    const book = await newBook('合并后的断言额度');
    const result = (await review(book)).results[0]!;
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: result.version,
      disposition: 'request-evidence', ownWords: null, reason: null, excludedSourceRefs: [MUSEUM] });
    const claims = store.factualReviewLedger.factualVerification.claims(result.runRecordId)!;
    const session = store.factualReviewLedger.factualVerification.claimSession(result.runRecordId, 'web-verification', claims.claims[0]!.claimId)!;
    const packagePath = join(roots.inputRoot, 'claim-ledger.ai7db');
    const preparation = await store.prepareDatabaseExport(packagePath, true);
    expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
    const targetRoots = await createServiceTestRoots('ai7-claim-merge-target-');
    let target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.mergeRefusal).toBeNull();
      await target.prepareDatabaseMerge(preview.previewId, new Date()); target.close();
      target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
      expect(target.factualReviewLedger.factualVerification.claims(result.runRecordId)?.digest).toBe(claims.digest);
      expect(target.factualReviewLedger.factualVerification.claimAllowance(session.sessionId).search).toBe(0);
      expect(target.factualReviewLedger.factualVerification.excludedClaimSources(claims.claims[0]!.claimId)).toEqual([MUSEUM]);
    } finally { target.close(); await targetRoots.dispose(); }
  });

  it('runs one claim only under its separate active enrollment and never reschedules an unresolved result', async () => {
    await setup({ claimStages: true, relations: [] });
    const book = await newBook('空闲单条事实复核');
    const result = (await review(book)).results[0]!;
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: result.version,
      disposition: 'request-evidence', ownWords: null, reason: null });
    expect(store.nextFactualRecheck()).toBeNull();
    enrollFactualRecheck(book.bookId);
    const candidate = store.nextFactualRecheck()!;
    expect(candidate.selection.claimId).toBeDefined();
    const before = sends.model;
    owner.setBackgroundIdle(false); owner.startFactualRecheck(store); await owner.whenIdle();
    expect(sends.model).toBe(before);
    owner.setBackgroundIdle(true); owner.startFactualRecheck(store); await owner.whenIdle();
    expect(store.factualReviewLedger.factualRecheckUsed(candidate.onceKey)).toBe(true);
    const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null });
    expect(workspace.history).toHaveLength(2);
    const completed = sends.model;
    owner.startFactualRecheck(store); await owner.whenIdle();
    expect(sends.model).toBe(completed);
    expect(store.nextFactualRecheck()).toBeNull();
  });

  it('keeps an authorized one-claim once key across restart without dispatching it again', async () => {
    await setup({ claimStages: true, relations: [] });
    const book = await newBook('重启后的事实复核');
    const result = (await review(book)).results[0]!;
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: result.version,
      disposition: 'request-evidence', ownWords: null, reason: null });
    enrollFactualRecheck(book.bookId);
    const candidate = store.nextFactualRecheck()!;
    const run = store.startFactualRecheck(candidate);
    await owner.dispose(); store.close(); store = undefined!;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.factualReviewLedger.currentRunState(run.runRecordId)).toBe('interrupted');
    expect(store.factualReviewLedger.factualRecheckUsed(candidate.onceKey)).toBe(true);
    expect(store.factualReviewLedger.factualVerification.claimAllowance(run.session.sessionId).search).toBe(3);
  });

  it('refuses a frozen one-claim candidate after its enrollment is revoked', async () => {
    await setup({ claimStages: true, relations: [] });
    const book = await newBook('撤销事实复核登记');
    const result = (await review(book)).results[0]!;
    store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: result.version,
      disposition: 'request-evidence', ownWords: null, reason: null });
    const enrolled = enrollFactualRecheck(book.bookId);
    const candidate = store.nextFactualRecheck()!;
    store.revokeBackgroundAnalysisEnrollment(book.bookId, enrolled.enrollment.enrollmentId, enrolled.runtime);
    expect(() => store.startFactualRecheck(candidate)).toThrow('变化');
  });

  it('prepares a separately approved again check and preserves the earlier version', async () => {
    await setup({ claimStages: true, relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }] });
    const book = await newBook('再次核查');
    const first = await review(book);
    const second = await review(book);
    expect(second.results[0]?.version).toBe(2);
    expect(second.results[0]?.states.factualVerification).toBe('证据支持');
    const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: second.results[0]!.resultId, sourcesAfter: null });
    expect(workspace.history).toHaveLength(2);
    expect(first.reviewRunId).not.toBe(second.reviewRunId);
  });

  it('excludes a source through an immutable decision and prepares explicit supplemental verification', async () => {
    await setup({ claimStages: true, relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }] });
    const book = await newBook('补充核查');
    const first = (await review(book)).results[0]!;
    const recorded = store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: first.resultId, resultVersion: first.version,
      disposition: 'request-evidence', ownWords: null, reason: null, excludedSourceRefs: [MUSEUM] });
    expect(recorded.workspace.sources[0]).toMatchObject({ excluded: true, sourceRef: MUSEUM });
    expect(recorded.workspace.history).toHaveLength(1);
    expect(recorded.workspace.result.sourceCounts.checked).toBe(0);
    const pages = sends.pages.length;
    const second = await review(book, undefined, { decisionId: recorded.supplementary!.decisionId! });
    expect(second.results[0]?.version).toBe(2);
    expect(second.results[0]?.states.factualVerification).toBe('证据不足');
    expect(sends.pages).toHaveLength(pages);
    const current = second.results[0]!;
    const fresh = store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: current.resultId, resultVersion: current.version,
      disposition: 'request-evidence', ownWords: null, reason: null, excludedSourceRefs: [MUSEUM] });
    expect(fresh.workspace.claimRecheckAvailable).toBe(true);
    expect(fresh.supplementary?.decisionId).toBeDefined();
    expect(() => store.createReviewRunPreparationWork(book.bookId, ['factual-review'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [], null, null, null, undefined,
      fresh.supplementary!.decisionId)).not.toThrow();
  });

  it('refuses supplemental preparation after the editor has replaced the request-evidence decision', async () => {
    await setup({ claimStages: true, relations: [] });
    const book = await newBook('旧核查决定');
    const result = (await review(book)).results[0]!;
    const input = { bookId: book.bookId, resultId: result.resultId, resultVersion: result.version, ownWords: null, reason: null };
    const requested = store.recordVerificationReviewDecision({ ...input, disposition: 'request-evidence' });
    store.recordVerificationReviewDecision({ ...input, disposition: 'keep-pending' });
    expect(() => store.createReviewRunPreparationWork(book.bookId, ['factual-review'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [], null, null, null, undefined,
      requested.supplementary!.decisionId)).toThrow('最新');
  });

  it('runs extraction without tools and limits durable verification to three searches', async () => {
    await setup({ claimStages: true, claimSearches: 4, relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }] });
    const book = await newBook('断言核查');
    const { results } = await review(book);
    expect(results[0]?.states.factualVerification).toBe('证据支持');
    expect(sends.search).toBe(3);
    const ledger = store.factualReviewLedger.factualVerification;
    const claims = ledger.claims(results[0]!.runRecordId)!;
    const session = ledger.claimSession(results[0]!.runRecordId, 'web-verification', claims.claims[0]!.claimId)!;
    expect(ledger.claimAllowance(session.sessionId).search).toBe(0);
    expect(ledger.claimRounds(session.sessionId)).toMatchObject([{ state: 'closed' }]);
  });

  it('keeps a pending first round and spends only the remaining claim allowance in the second', async () => {
    await setup({ claimStages: true, pendingRound: true, relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }] });
    const { results } = await review(await newBook('剩余核查额度'));
    expect(results[0]?.states.factualVerification).toBe('证据支持');
    const ledger = store.factualReviewLedger.factualVerification;
    const claims = ledger.claims(results[0]!.runRecordId)!;
    const session = ledger.claimSession(results[0]!.runRecordId, 'web-verification', claims.claims[0]!.claimId)!;
    expect(ledger.claimRounds(session.sessionId).map((round) => round.state)).toEqual(['pending', 'closed']);
    expect(ledger.claimAllowance(session.sessionId).search).toBe(1);
    expect(sends.search).toBe(2);
  });

  it('groups only identical occurrences and keeps both overlapping producers', () => {
    const { ledger } = syntheticClaimLedger();
    expect(ledger.counts).toEqual({ coverageUnits: 2, assertions: 4, eligibleClaims: 2 });
    expect(ledger.claims[0]!.producers.map((entry) => entry.sourceUnitOrdinal)).toEqual([1, 2]);
    expect(ledger.claims[1]!.claimId).not.toBe(ledger.claims[0]!.claimId);
    expect(ledger.excluded).toMatchObject([{ reason: 'ineligible-class' }]);
    expect(syntheticClaimLedger().ledger.digest).toBe(ledger.digest);
  });

  it('encodes one claim with the unchanged frozen producing message and a separate metadata bound', () => {
    const { ledger } = syntheticClaimLedger();
    const input = factualClaimVerificationInput(ledger, ledger.claims[0]!.claimId, 16384);
    expect(JSON.parse(input.message)).toMatchObject({ claimId: ledger.claims[0]!.claimId, sourceUnitMessage: ledger.units[0]!.sourceUnitMessage });
    expect(input.sourceUnitMessageDigest).toBe(ledger.units[0]!.messageDigest);
    expect(input.digest).toBe(sha256Hex(input.message));
    expect(() => factualClaimVerificationInput(ledger, ledger.claims[0]!.claimId, 1)).toThrow('字节上限');
  });
});

describe('Evidence Assurance Levels on 事实核查 (Issue #901)', () => {
  // #1058 / J04: an actual terminal refusal after unit 1 must keep its exact findings, without another send.
  it('retains closed factual findings after a durable terminal budget refusal', async () => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }], maxTotalTokens: 180 });
    const book = await newBook('终态部分核查回归');
    let prepared: { canonical_json: unknown; sha256: unknown } | undefined;
    const { reviewRunId, results } = await review(book, undefined, { prepared: (id) => {
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const row = db.prepare('SELECT canonical_json, sha256 FROM review_runs WHERE review_run_id = ?').get(id)!;
        prepared = { canonical_json: row.canonical_json, sha256: row.sha256 };
        const task = JSON.parse(String(row.canonical_json)).categories[0].task.taskIntentId;
        expect(db.prepare('SELECT count(*) AS n FROM review_run_authorizations WHERE review_run_id = ?').get(id)?.n).toBe(0);
        expect(db.prepare('SELECT count(*) AS n FROM analysis_run_records WHERE task_intent_id = ?').get(task)?.n).toBe(0);
      } finally { db.close(); }
    } });
    const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
    expect(store.factualReviewLedger.inspect(book.bookId).run?.state).toBe('interrupted');
    expect(sends.model).toBe(3);
    expect(run.categories[0]?.state).toBe('interrupted');
    expect(run.categories[0]?.findingsCount).toBeGreaterThan(0);
    expect(results.length).toBe(run.categories[0]?.findingsCount);
    expect(run.state).toBe('partial');
    expect(run.canContinue).toBe(false);
    expect(run.capture.available).toBe(false);
    expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).coverage.find((entry) => entry.categoryId === 'factual-review')?.state).not.toBe('current');
    const rows = retentionRows(reviewRunId);
    expect(rows.snapshot).toEqual(prepared);
    expect(JSON.parse(String(rows.snapshot.canonical_json)).categories[0].partialFactualRetentionVersion).toBe(1);
    expect(rows.outcome.classification).toBe('interrupted');
    expect(rows.events.map((event) => event.state)).toEqual(['dispatched', 'interrupted', 'interrupted']);
    expect(rows.events.at(-1)?.result_set_revision_id).toBe(rows.outcome.result_set_revision_id);
    const complete = JSON.parse(String(rows.events.at(-1)!.canonical_json));
    expect(complete.partialFactualRetentionVersion).toBe(1);
    expect(complete.findingCount).toBe(results.length);
    expect(complete.detail).toBe(JSON.parse(String(rows.events[1]!.canonical_json)).detail);
    expect(results.every((result) => result.runRecordId === rows.outcome.run_record_id && result.reviewRunId === reviewRunId && result.version === 1)).toBe(true);
    expect(results[0]!.sourceCounts.checked).toBe(1);
    const source = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: results[0]!.resultId, sourcesAfter: null }).sources[0]!;
    expect(source.sourceRef).toBe(MUSEUM);
    expect(source.sourceVersion).toMatch(/^[0-9a-f]{64}$/u);
    expect(source.evidenceId).not.toBeNull();
    const before = databaseState(false);
    for (const result of results) expect(store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null }).result.resultId).toBe(result.resultId);
    expect(databaseState(false)).toEqual(before);
    const sendsBefore = structuredClone(sends);
    await reopen();
    expect(databaseState(false)).toEqual(before);
    expect(lens(book, reviewRunId).results.map((result) => result.resultId)).toEqual(results.map((result) => result.resultId));
    expect(sends).toEqual(sendsBefore);
  });

  it.each(['outcome', 'findings', 'versions'] as const)('converges after a crash at the %s phase and repeated reopen (#1058 / J04)', async (phase) => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }], maxTotalTokens: 180, twoAssertions: true });
    const book = await newBook('核查恢复边界');
    const materialize = vi.spyOn(store, 'materializeFactualVerification');
    if (phase === 'findings') materialize.mockImplementation(() => { throw new Error('synthetic crash'); });
    const { reviewRunId } = await review(book, undefined, { steps: (steps) => phase === 'outcome'
      ? { ...steps, settle: () => { throw new Error('synthetic crash'); }, fail: () => undefined } : steps });
    materialize.mockRestore();
    const initial = retentionRows(reviewRunId);
    expect(initial.outcome.classification).toBe('interrupted');
    expect(initial.outcome.result_set_revision_id).not.toBeNull();
    let kept: { result_id: unknown; sha256: unknown } | undefined;
    if (phase === 'versions') editRecordedTables(['factual_verification_results'], (db) => {
      const rows = db.prepare('SELECT result_id, sha256 FROM factual_verification_results WHERE review_run_id = ? ORDER BY rowid').all(reviewRunId);
      expect(rows.length).toBe(2);
      kept = { result_id: rows[0]!.result_id, sha256: rows[0]!.sha256 };
      db.prepare('DELETE FROM factual_verification_results WHERE result_id = ?').run(rows[1]!.result_id!);
    });
    const sendsBefore = structuredClone(sends);
    const executionBefore = databaseState();
    await reopen();
    const results = lens(book, reviewRunId).results;
    expect(results.length).toBe(2);
    if (kept !== undefined) {
      expect(results.some((result) => result.resultId === kept!.result_id)).toBe(true);
      expect(retentionRows(reviewRunId).versions.find((row) => row.result_id === kept!.result_id)?.sha256).toBe(kept.sha256);
    }
    expect(retentionRows(reviewRunId).snapshot).toEqual(initial.snapshot);
    const converged = databaseState(false);
    for (const table of ['analysis_run_records', 'analysis_execution_attempts', 'analysis_task_outcomes', 'analysis_result_set_revisions', 'review_run_authorizations'])
      expect(converged[table]).toBe(executionBefore[table]);
    await reopen();
    expect(databaseState(false)).toEqual(converged);
    expect(sends).toEqual(sendsBefore);
    expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).run).toMatchObject({ state: 'partial', canContinue: false, categories: [{ state: 'interrupted', findingsCount: 2 }] });
  });

  it('never enrolls a marker-free prepared Run at authorization, settlement or reopen (#1058)', async () => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const book = await newBook('旧版准备记录');
    let legacy: unknown;
    const { reviewRunId, results } = await review(book, undefined, { prepared: (id) => editRecordedTables(['review_runs'], (db) => {
      const row = db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(id)!;
      const snapshot = JSON.parse(String(row.canonical_json));
      delete snapshot.categories[0].partialFactualRetentionVersion;
      const record = canonicalRecord(snapshot);
      db.prepare('UPDATE review_runs SET canonical_json = ?, sha256 = ? WHERE review_run_id = ?').run(record.json, record.digest, id);
      legacy = db.prepare('SELECT canonical_json, sha256 FROM review_runs WHERE review_run_id = ?').get(id);
    }) });
    expect(results.length).toBe(0);
    expect(retentionRows(reviewRunId).snapshot).toEqual(legacy);
    await reopen();
    expect(retentionRows(reviewRunId).snapshot).toEqual(legacy);
    expect(lens(book, reviewRunId).results.length).toBe(0);
  });

  it.each(['paused', 'resumable', 'awaiting-clarification'] as const)('leaves actual %s checkpoints nonterminal without another send (#1058, #1114/#1117)', async (state) => {
    await setup({ relations: [], ...(state !== 'paused' ? { secondUnit: 'clarification' as const } : {}) });
    const book = await newBook('未终态核查检查点');
    if (state === 'paused') scenario.atSecondUnit = () => {
      const projection = store.factualReviewLedger.inspect(book.bookId);
      store.factualReviewLedger.requestPause(book.bookId, projection.taskIntent!.taskIntentId);
      owner.pauseRun(projection.run!.runRecordId, store.factualReviewLedger);
    };
    const { reviewRunId, results } = await review(book);
    const projection = store.factualReviewLedger.inspect(book.bookId);
    expect(projection.run?.state).toBe(state === 'resumable' ? 'awaiting-clarification' : state);
    if (state === 'resumable') {
      // #1117's actual answered-wait checkpoint becomes resumable at startup, without applying the answer or sending it.
      const request = store.factualReviewLedger.clarificationsOf(projection.run!.runRecordId)[0]!;
      store.answerBaselineAnalysisClarification({ bookId: book.bookId, taskIntentId: projection.taskIntent!.taskIntentId,
        requestId: request.requestId, optionId: 'model-option-0', note: null });
    }
    expect(results.length).toBe(0);
    const before = databaseState(false);
    const sendsBefore = structuredClone(sends);
    await reopen();
    expect(store.factualReviewLedger.inspect(book.bookId).run?.state).toBe(state);
    if (state !== 'resumable') expect(databaseState(false)).toEqual(before);
    const stopped = databaseState(false);
    await reopen();
    expect(databaseState(false)).toEqual(stopped);
    expect(sends).toEqual(sendsBefore);
    expect(retentionRows(reviewRunId).events.some((event) => ['settled', 'failed', 'interrupted', 'materialized'].includes(String(event.state)))).toBe(false);
  });

  it('keeps an unknown-after-send unit unknown and never sends it during reconciliation (#1058)', async () => {
    await setup({ relations: [], secondUnit: 'unknown' });
    const book = await newBook('未知结果核查');
    const { reviewRunId } = await review(book);
    const revision = store.factualReviewLedger.inspect(book.bookId).resultSetRevision!;
    expect(revision.gaps.some((gap) => gap.unitOrdinal === 2 && gap.code === 'outcome-unknown')).toBe(true);
    const before = databaseState(false);
    const sendsBefore = structuredClone(sends);
    await reopen();
    expect(databaseState(false)).toEqual(before);
    expect(sends).toEqual(sendsBefore);
    expect(retentionRows(reviewRunId).events.some((event) => JSON.parse(String(event.canonical_json)).partialFactualRetentionVersion === 1)).toBe(false);
  });

  it.each(['empty', 'invalid', 'before-first'] as const)('creates no result for %s terminal work (#1058)', async (kind) => {
    await setup({ relations: [], maxTotalTokens: kind === 'before-first' ? 1 : 180,
      ...(kind === 'empty' ? { noAssertions: true } : kind === 'invalid' ? { invalidUnit: true } : {}) });
    const book = await newBook('无可保留核查发现');
    const { reviewRunId, results } = await review(book);
    expect(results.length).toBe(0);
    expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).run?.categories[0]?.findingsCount).toBe(0);
    await reopen();
    expect(lens(book, reviewRunId).results.length).toBe(0);
  });

  it.each(['no-outcome', 'no-revision', 'foreign-revision', 'corrupt-outcome'] as const)('refuses retention with %s (#1058)', async (kind) => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const book = await newBook('终态绑定反例');
    const hooks = { steps: (steps: ReviewRunDriveSteps): ReviewRunDriveSteps => ({ ...steps, settle: () => { throw new Error('synthetic crash'); }, fail: () => undefined }) };
    const { reviewRunId } = await review(book, undefined, hooks);
    let foreign: string | null = null;
    if (kind === 'foreign-revision') {
      const other = await newBook('异书核查修订版');
      const otherRun = await review(other, undefined, hooks);
      foreign = String(retentionRows(otherRun.reviewRunId).outcome.result_set_revision_id);
    }
    const initial = retentionRows(reviewRunId);
    editRecordedTables(['analysis_task_outcomes'], (db) => {
      if (kind === 'no-outcome') { db.prepare('DELETE FROM analysis_task_outcomes WHERE run_record_id = ?').run(initial.outcome.run_record_id!); return; }
      const row = db.prepare('SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ?').get(initial.outcome.run_record_id!)!;
      const outcome = JSON.parse(String(row.canonical_json));
      outcome.resultSetRevisionId = kind === 'foreign-revision' ? foreign : kind === 'no-revision' ? null : outcome.resultSetRevisionId;
      const record = canonicalRecord(outcome);
      db.prepare('UPDATE analysis_task_outcomes SET result_set_revision_id = ?, canonical_json = ?, sha256 = ? WHERE run_record_id = ?')
        .run(outcome.resultSetRevisionId, record.json, kind === 'corrupt-outcome' ? '0'.repeat(64) : record.digest, initial.outcome.run_record_id!);
    });
    if (kind === 'no-outcome') store.reviewRunDriveSteps.fail(reviewRunId, 'factual-review', 'SYNTHETIC_STOP', '合成孤立类别终态。');
    const eventsBefore = retentionRows(reviewRunId).events;
    if (kind === 'corrupt-outcome') {
      // Opening already refuses a damaged digest; reconciliation refuses retention for that Run only, and another eligible Run converges.
      const other = await newBook('完好终态核查');
      const healthy = (await review(other, undefined, hooks)).reviewRunId;
      expect(storeError(() => store.reconcileStoppedFactualReviewRuns())).toBe('no-error');
      expect(storeError(() => store.reconcileStoppedReviewCategoryRuns())).toBe('no-error');
      expect(lens(other, healthy).results.length).toBe(1);
    } else await reopen();
    expect(lens(book, reviewRunId).results.length).toBe(0);
    expect(retentionRows(reviewRunId).events).toEqual(eventsBefore);
  });

  it('isolates one Run\'s failed version recording at startup and fills it at the next open (#1058)', async () => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const hooks = { steps: (steps: ReviewRunDriveSteps): ReviewRunDriveSteps => ({ ...steps, settle: () => { throw new Error('synthetic crash'); }, fail: () => undefined }) };
    const first = await newBook('核查恢复隔离甲');
    const failing = (await review(first, undefined, hooks)).reviewRunId;
    const second = await newBook('核查恢复隔离乙');
    const kept = (await review(second, undefined, hooks)).reviewRunId;
    const original = EditorialStore.prototype.materializeFactualVerification;
    const fail = vi.spyOn(EditorialStore.prototype, 'materializeFactualVerification').mockImplementation(function (this: EditorialStore, reviewRunId: string) {
      if (reviewRunId === failing) throw new Error('synthetic version failure');
      original.call(this, reviewRunId);
    });
    try { await reopen(); } finally { fail.mockRestore(); }
    expect(store.inspectReviewWorkspace(first.bookId, failing).run?.categories[0]).toMatchObject({ state: 'interrupted', findingsCount: 1 });
    expect(lens(first, failing).results.length).toBe(0);
    expect(lens(second, kept).results.length).toBe(1);
    const sendsBefore = structuredClone(sends);
    await reopen();
    expect(lens(first, failing).results.length).toBe(1);
    expect(sends).toEqual(sendsBefore);
  });

  it.each(['quick', 'strict'] as const)('keeps %s evidence gates on retained findings (#1058)', async (level) => {
    await setup({ relations: [{ sourceRef: MUSEUM, relation: '支持', excerptRef: HELD, lineage: 'original' }], maxTotalTokens: level === 'quick' ? 60 : 180 });
    const book = await newBook('部分核查保证级别');
    const { reviewRunId, results } = await review(book, level);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.level === level && entry.states.factualVerification !== '证据支持' && entry.states.factualVerification !== '疑似错误')).toBe(true);
    expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).run).toMatchObject({ state: 'partial', canContinue: false, capture: { available: false } });
  });

  it('rolls findings, marks and closed retention bookkeeping back together (#1058)', async () => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const book = await newBook('核查原子保留回滚');
    const before = databaseState();
    const original = EditorialMarkStore.prototype.createProducedMany;
    const fail = vi.spyOn(EditorialMarkStore.prototype, 'createProducedMany').mockImplementation(function (this: EditorialMarkStore, inputs, record): never {
      original.call(this, inputs, (marks) => { record(marks); throw new Error('synthetic crash inside category transaction'); });
      throw new Error('unreachable');
    });
    const { reviewRunId, results } = await review(book);
    fail.mockRestore();
    expect(results.length).toBe(0);
    const rolledBack = databaseState();
    for (const table of ['review_findings', 'editorial_marks', 'editorial_mark_events', 'review_excluded_findings']) expect(rolledBack[table]).toBe(before[table]);
    expect(retentionRows(reviewRunId).events.map((event) => event.state)).toEqual(['dispatched', 'interrupted']);
    await reopen();
    expect(lens(book, reviewRunId).results.length).toBe(1);
  });

  it('retains an unplaceable exact finding without inventing a current manuscript mark (#1058)', async () => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const book = await newBook('部分核查定位变化');
    const { reviewRunId } = await review(book, undefined, { steps: (steps) => ({ ...steps, settle: () => { throw new Error('synthetic crash'); }, fail: () => undefined }) });
    const revision = store.factualReviewLedger.inspect(book.bookId).resultSetRevision!;
    if (!('findings' in revision)) throw new Error('factual revision required');
    const finding = revision.findings[0]!;
    const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: finding.sourceRange.blockId });
    const block = window.blocks.find((entry) => entry.blockId === finding.sourceRange.blockId)!;
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
      blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
      fromGrapheme: finding.sourceRange.fromGrapheme + 1, toGrapheme: finding.sourceRange.fromGrapheme + 2, insertText: '改' });
    await reopen();
    const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
    expect(run.categories[0]).toMatchObject({ state: 'interrupted', findingsCount: 1 });
    expect(run.findings[0]).toMatchObject({ markId: null, anchorState: 'anchor-changed' });
    expect(lens(book, reviewRunId).results[0]).toMatchObject({ findingId: finding.findingId, markId: null, anchor: { state: 'stale' } });
  });

  it('retains an exact failed Task Outcome revision without a successful category event (#1058)', async () => {
    await setup({ relations: [], maxTotalTokens: 180 });
    const book = await newBook('失败终态修订版');
    const { reviewRunId } = await review(book, undefined, { steps: (steps) => ({ ...steps, settle: () => { throw new Error('synthetic crash'); }, fail: () => undefined }) });
    const run = store.factualReviewLedger.inspect(book.bookId);
    const runRecordId = run.run!.runRecordId;
    // Prepare a durable failed-outcome handoff using the real ledger writers and the exact already persisted revision.
    // The composed refusal above supplies the actual partial revision; this check exercises the other admitted terminal classification.
    editRecordedTables(['analysis_task_outcomes', 'analysis_run_states'], (db) => {
      db.prepare('DELETE FROM analysis_task_outcomes WHERE run_record_id = ?').run(runRecordId);
      db.prepare('DELETE FROM analysis_run_states WHERE run_record_id = ? AND state = ?').run(runRecordId, 'interrupted');
    });
    store.factualReviewLedger.recordRunState(runRecordId, 'failed', { detail: '合成失败终态。' });
    store.factualReviewLedger.recordOutcome({ taskIntentId: run.taskIntent!.taskIntentId, runRecordId, classification: 'failed',
      resultSetRevisionId: run.resultSetRevision!.revisionId, summary: '合成失败终态；保留实际缺口。', safeNextAction: '重新准备任务。', report: { ...run.taskOutcome!.report!, classification: 'failed' } });
    const sendsBefore = structuredClone(sends);
    await reopen();
    expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).run).toMatchObject({ state: 'partial', canContinue: false, categories: [{ state: 'failed', findingsCount: 1 }] });
    expect(lens(book, reviewRunId).results.length).toBe(1);
    expect(retentionRows(reviewRunId).events.map((event) => event.state)).toEqual(['dispatched', 'failed', 'failed']);
    expect(sends).toEqual(sendsBefore);
  });

  it.each([0, 2, null, '1'])('rejects a malformed preparation retention version %s without backfill (#1058)', async (version) => {
    await setup({ relations: [] });
    const book = await newBook('无效保留标记');
    let id = '';
    await expect(review(book, undefined, { prepared: (reviewRunId) => {
      id = reviewRunId;
      editRecordedTables(['review_runs'], (db) => {
        const row = db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(id)!;
        const snapshot = JSON.parse(String(row.canonical_json));
        snapshot.categories[0].partialFactualRetentionVersion = version;
        const record = canonicalRecord(snapshot);
        db.prepare('UPDATE review_runs SET canonical_json = ?, sha256 = ? WHERE review_run_id = ?').run(record.json, record.digest, id);
      });
    } })).rejects.toMatchObject({ code: 'REVIEW_RECORD_INVALID' });
    expect(sends.model).toBe(0);
    const before = databaseState(false);
    store.reconcileStoppedFactualReviewRuns();
    expect(databaseState(false)).toEqual(before);
    expect(id.length).toBeGreaterThan(0);
  });

  it('keeps local-only preparations and recovery outside factual eligibility (#1058, #1122)', async () => {
    await setup({ relations: [] });
    const book = await newBook('本地检查隔离');
    let work = store.createReviewRunPreparationWork(book.bookId, ['local-text-check'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy,
      null, [], null, null, null, { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] });
    while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
    const reviewRunId = work.projection!.run!.reviewRunId;
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const row = db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(reviewRunId)!;
      const snapshot = JSON.parse(String(row.canonical_json));
      expect(snapshot.localPlan).toBeDefined();
      expect(snapshot.categories.every((entry: Record<string, unknown>) => !Object.hasOwn(entry, 'partialFactualRetentionVersion') && entry.task === null)).toBe(true);
    } finally { db.close(); }
    const before = databaseState(false);
    await reopen();
    expect(databaseState(false)).toEqual(before);
    expect(lens(book, reviewRunId).results.length).toBe(0);
    expect(sends.model).toBe(0);
  });

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
    const state = databaseState();
    const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null });
    expect(changesOf()).toBe(before);
    expect(databaseState()).toEqual(state);
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
    const socket = vi.spyOn(Socket.prototype, 'connect');
    const { results } = await review(book, 'quick');
    expect(socket).not.toHaveBeenCalled();
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
    const socket = vi.spyOn(Socket.prototype, 'connect');
    const { results } = await review(book);
    expect(results.length).toBeGreaterThan(0);
    expect(sends.toolSchemas).toBe(0);
    expect(sends.search).toBe(0);
    expect(sends.pages).toEqual([]);
    expect(socket).not.toHaveBeenCalled();
    expect(store.inspectFactualReview(book.bookId).taskOutcome?.report?.factualAssurance?.disclosure).toBe(EVIDENCE_ASSURANCE_OFFLINE_DEGRADE);
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
    const priorState = databaseState();
    const own = store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'own-words', ownWords: '以馆方公告为准。',
      reason: { state: 'corrected', text: '与我掌握的出处一致，补充了馆方公告', suggestion: '与我掌握的出处一致' } });
    expect(changesOf()).toBe(before + 1);
    const nextState = databaseState();
    expect(nextState.factual_review_decisions).not.toBe(priorState.factual_review_decisions);
    expect({ ...nextState, factual_review_decisions: null }).toEqual({ ...priorState, factual_review_decisions: null });
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
    const editedWindow = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: result.blockId });
    const editedBlock = editedWindow.blocks.find((entry) => entry.blockId === result.blockId)!;
    const original = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(block.text)].map((entry) => entry.segment);
    store.flushJournalEdit({
      clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: editedWindow.revisionId, blockId: block.blockId,
      windowStartBlockId: editedWindow.blocks[0]!.blockId, baseBlockDigest: editedBlock.digest, expectedJournalSequence: editedWindow.journalSequence,
      fromGrapheme: result.fromGrapheme + 1, toGrapheme: result.fromGrapheme + 2, insertText: original[result.fromGrapheme + 1]!,
    });
    expect(store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: result.resultId, sourcesAfter: null }).result.anchor.state).toBe('stale');
    expect(storeError(() => store.recordVerificationReviewDecision({ bookId: book.bookId, resultId: result.resultId, resultVersion: 1, disposition: 'accept', ownWords: null, reason: null })))
      .toBe('FACTUAL_DECISION_DRIFT');
  }, 120_000);
});
