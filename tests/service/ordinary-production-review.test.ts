import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { afterEach, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { cp } from 'node:fs/promises';
import { cpSync } from 'node:fs';
import { backup, DatabaseSync } from 'node:sqlite';
import { renderReportExport } from '../../src/service/report-export.js';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { DialogueExecutionOwner, productionDialogueRoute } from '../../src/service/dialogue/dialogue-execution.js';
import { prepareGlobalAgentDisclosure, startGlobalAgentTurn } from '../../src/service/dialogue/global-agent-session.js';
import { FastRoleExecutionOwner, productionFastRoleRoutes, testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { materialTranslator, MATERIAL_TRANSLATION_RESULT_SCHEMA } from '../../src/service/fast-role/material-translation-contract.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { parseReviewCategoryUnitMessageHeader, parseReviewCrossChapterMessage, REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, reviewCategoryContract, reviewCategoryContractDigest } from '../../src/service/review/review-category-contract.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { modelRequestNotSent } from '../../src/service/provider/deepseek-adapter.js';
import * as harnessExecution from '../../src/service/harness/primary-agent-harness.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { HouseReviewPreferenceLedger } from '../../src/service/house-review-preference.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import type { LaunchPolicyProjection, ReviewCrossChapterInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { sample1DerivedLibraryItem } from '../editorial-cases/runner/run-setups.js';
import { makeJ13Series } from '../support/series-consistency.js';
import { kindLocalTools } from '../../src/service/analysis/live-kind-admission.js';
import type { AnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import type { FrozenSeriesScope } from '../../src/shared/protocol.js';
import { freezeSeriesScope, resolveSeriesConsistency, seriesConsistencyEntry, seriesConsistencyKindDefinition, liveSeriesConsistencyContract } from '../../src/service/review/series-consistency.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;
const cleanupResources: Array<() => void> = [];
afterEach(async () => {
  const stopped = driver?.dispose();
  const ownerStopped = owner?.dispose();
  for (const cleanup of cleanupResources.splice(0)) cleanup();
  await ownerStopped;
  await stopped;
  store?.close();
  await roots?.dispose();
});

interface ReviewRequest { readonly category: string; readonly ordinal: number; readonly body: string; readonly tools: string[]; readonly sentAt: number; abortedAt?: number; abortReason?: unknown }

interface ProductionReviewControl {
  readonly transportEntry?: (request: RequestInit) => void;
  readonly synthesis?: (input: ReviewCrossChapterInput) => unknown;
  readonly series?: boolean;
  readonly ready?: (application: { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; bookId: string; reviewRunId: string; policy: LaunchPolicyProjection; transport: typeof fetch }) => void;
  readonly response?: (response: Response, signal: AbortSignal | undefined, body: string) => Promise<Response>;
  readonly credential?: (read: number) => Promise<string | null>;
}

function deferred<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Real buffered-body consumption stays open after headers until the test releases it or the owner aborts. */
function heldReviewResponses(count: number, select: (message: string) => number | null = (message) => parseReviewCategoryUnitMessageHeader(message)?.ordinal ?? null) {
  const arrivals = new Map<number, ReturnType<typeof deferred<{ ordinal: number; release(): void }>>>();
  let entered = 0;
  const at = (index: number) => {
    let arrival = arrivals.get(index);
    if (arrival === undefined) { arrival = deferred(); arrivals.set(index, arrival); }
    return arrival;
  };
  return {
    at: (index: number) => at(index).promise,
    response: async (response: Response, signal: AbortSignal | undefined, body: string): Promise<Response> => {
      const request = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
      const ordinal = select(request.messages.findLast((entry) => entry.role === 'user')!.content);
      if (ordinal === null) return response;
      const index = ++entered;
      if (index > count) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        let settled = false;
        const abort = (): void => { if (settled) return; settled = true; signal?.removeEventListener('abort', abort); controller.error(signal?.reason); };
        const release = (): void => { if (settled) return; settled = true; signal?.removeEventListener('abort', abort); controller.close(); };
        controller.enqueue(bytes);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted === true) abort();
        at(index).resolve({ ordinal, release });
      } }), { status: response.status });
    },
  };
}

function latestReviewExecution(opened: EditorialStore) {
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const row = db.prepare('SELECT run_record_id FROM analysis_run_records ORDER BY rowid DESC LIMIT 1').get()!;
    const runRecordId = String(row.run_record_id);
    return { runRecordId, ledger: opened.executionLedgerForRun(runRecordId) };
  } finally { db.close(); }
}

async function crashSnapshot(name: string): Promise<string> {
  const target = join(roots!.dataRoot, '..', name);
  await cp(roots!.dataRoot, target, { recursive: true,
    filter: (source) => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
  const source = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try { await backup(source, join(target, 'store', 'ai7.sqlite')); } finally { source.close(); }
  return target;
}

function synchronousCrashSnapshot(name: string): string {
  const target = join(roots!.dataRoot, '..', name);
  cpSync(roots!.dataRoot, target, { recursive: true,
    filter: (source) => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
  const source = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
  try { source.prepare('VACUUM INTO ?').run(join(target, 'store', 'ai7.sqlite')); } finally { source.close(); }
  return target;
}

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
  control: ProductionReviewControl = {},
) {
  roots = await createServiceTestRoots('ai7-production-review-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  const applicationStore = store;
  const choice = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
  const pending = store.saveModelServiceConnection('合成生产连接', null, 'needs-attention', choice.route);
  store.saveModelServiceConnection('合成生产连接', pending.credentialReference, 'ready', choice.route);
  store.selectModelServiceRoute(choice.route);
  const binding = { ...choice, credentialReference: pending.credentialReference };
  const policy = project(await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding));
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
  if (categories.includes('factual-review') || categories.includes('academic-integrity')) {
    const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
    store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready');
    store.selectSearchBackend('search-tinyfish');
    if (categories.includes('factual-review')) store.factualReviewLedger.bindLaunch(store.baselineAnalysisLedger.launch);
  }
  const requests: ReviewRequest[] = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    control.transportEntry?.(init!);
    const finish = (response: Response): Promise<Response> => control.response?.(response, init?.signal ?? undefined, String(init?.body)) ?? Promise.resolve(response);
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }>; tools?: Array<{ function: { name: string } }> };
    const message = body.messages.findLast((entry) => entry.role === 'user')!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    const crossChapter = parseReviewCrossChapterMessage(message);
    let content: string;
    if (header !== null) {
      const prior = requests.filter((entry) => entry.category === header.categoryId && entry.ordinal === header.ordinal).length;
      const request: ReviewRequest = { category: header.categoryId, ordinal: header.ordinal, body: String(init?.body), tools: body.tools?.map((tool) => tool.function.name) ?? [], sentAt: Date.now() };
      requests.push(request);
      const shape = answer(header.categoryId, header.ordinal, prior);
      if (shape === 'tools') {
        const blockId = /\[1\] \[(blk_[0-9a-f]{24})\]/u.exec(message)![1]!;
        return finish(new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content: null, reasoning_content: '合成推理。', tool_calls: [
          { id: 'read-1', type: 'function', function: { name: 'read_blocks', arguments: JSON.stringify({ blockId, radius: 0 }) } },
          { id: 'search-1', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '的', mode: 'exact' }) } },
        ] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 }));
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
            : header.ordinal === 1 && block !== undefined && header.categoryId !== 'academic-integrity' && (['publication-risk', 'style-and-format', 'plot-consistency'].includes(header.categoryId) || body.messages.some((entry) => entry.role === 'tool'))
            ? [{ quote: block.text, blockOrdinal: block.ordinal, severity: 'should', note: '合成审阅发现；请人工复核。',
              ...(['publication-risk', 'style-and-format', 'plot-consistency'].includes(header.categoryId) ? { clauseId: `${header.categoryId}/1` } : { replacement: `${block.text}合成` }) }] : [],
        });
      }
    } else if (crossChapter !== null) {
      requests.push({ category: crossChapter.categoryId, ordinal: 0, body: String(init?.body), tools: body.tools?.map((tool) => tool.function.name) ?? [], sentAt: Date.now() });
      content = JSON.stringify(control.synthesis?.(crossChapter) ?? { schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [] });
    } else if (message.startsWith('保证抽样 ')) content = JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
      dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) });
    else content = JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
    return finish(new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 }));
  };
  let credentialReads = 0;
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => {
      credentialReads += 1; return control.credential === undefined ? 'placeholder-production-key' : control.credential(credentialReads);
    } },
    productionPolicyFor: (selected) => project(resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', selected)),
    seriesScopeGuard: (id) => applicationStore.seriesScopeGuard(id),
    influenceGuard: (id) => applicationStore.learningInfluenceGuard(id),
  });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, '合成生产审阅');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  if (usePreferences) store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: categories.includes('academic-integrity') ? 'academic-integrity' : 'typos-and-usage', text: '统一编辑用语，保留有意的节奏。', effect: 'guide' });
  // Seven editor rules made at distinct instants: recency, not ledger order, decides which five a request reads.
  if (usePreferences === 'top-five') for (let index = 2; index <= 7; index += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
      categoryId: 'typos-and-usage', text: `合成偏好${index}：统一用语。`, effect: 'guide' });
  }
  const materialIds = useMaterial ? [await sample1DerivedLibraryItem(store, roots, book)] : [];
  const seriesId = control.series === true ? makeJ13Series(store, book.bookId) : null;
  let work = store.createReviewRunPreparationWork(book.bookId, [...categories],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, materialIds, null, null, seriesId);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const run = work.projection!.run!;
  store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  control.ready?.({ store, owner, bookId: book.bookId, reviewRunId: run.reviewRunId, policy, transport: nativeFetch });
  await driver.drive(run.reviewRunId);
  return { store, bookId: book.bookId, reviewRunId: run.reviewRunId, requests };
}

const typosDefinition = () => reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));

it.each(['style-and-format', 'plot-consistency'])('runs one bounded %s synthesis and materializes its exact anchored card', async (category) => {
  let evidence: ReviewCrossChapterInput['evidence'][number] | undefined;
  const result = await productionReview([category], () => 'valid', undefined, false, false, { synthesis: (input) => {
    evidence = input.evidence[0];
    expect(evidence).toBeDefined();
    expect(input.findings[0]!.unitFindingRefs).toHaveLength(1);
    return { schema: REVIEW_CROSS_CHAPTER_RESULT_SCHEMA, findings: [{ anchorRef: evidence!.ref, evidenceRefs: [evidence!.ref],
      severity: 'should', note: '合成跨章一致性发现，待编辑核对。', clauseId: `${category}/1` }] };
  } });
  expect(result.requests.filter((request) => request.ordinal === 0)).toHaveLength(1);
  const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry(category)!));
  const settled = result.store.inspectReviewCategory(result.bookId, definition);
  expect(settled.taskOutcome?.classification).toBe('completed');
  expect(settled.resultSetRevision?.findings).toHaveLength(1);
  expect(settled.resultSetRevision!.findings[0]).toMatchObject({ sourceRange: evidence!.sourceRange, quote: evidence!.quote,
    note: '合成跨章一致性发现，待编辑核对。', crossChapter: { evidence: [evidence!] } });
  expect(settled.taskOutcome!.report!.usagePerStage['cross-unit-reduction'].requests).toBe(1);
});

it('keeps unit cards and a disclosed synthesis gap when the selected rule does not grant the extra turn', async () => {
  const result = await productionReview(['style-and-format'], () => 'valid', (policy) => ({ ...policy,
    providerProcessing: { ...policy.providerProcessing, admittedRules: policy.providerProcessing.admittedRules?.map((rule) => ({ ...rule, plusOneCrossUnitSynthesisTurn: false })) } }));
  expect(result.requests.filter((request) => request.ordinal === 0)).toHaveLength(0);
  const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('style-and-format')!));
  const settled = result.store.inspectReviewCategory(result.bookId, definition);
  expect(settled.taskOutcome?.classification).toBe('completed-with-gaps');
  expect(settled.resultSetRevision?.findings).toHaveLength(1);
  expect(settled.resultSetRevision?.reducerClosure.stages.find((stage) => stage.stage === 'cross-chapter-consistency')?.state).toBe('closed-with-gaps');
  expect(settled.taskOutcome!.report!.usagePerStage['cross-unit-reduction'].requests).toBe(0);
});

it('proves current academic Series preparation and exact initial and retained consistency source pins (#1131 rev21)', async () => {
  const result = await productionReview(['academic-integrity'], () => 'valid', undefined, false, false, { series: true });
  const request = result.requests.find((entry) => entry.category === 'academic-integrity')!;
  expect(request.body).toContain('三部曲里海边小城的地名，以第一部的写法为准。');
  expect(request.tools).toContain('read_blocks');
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const seriesId = String(db.prepare('SELECT series_id FROM series LIMIT 1').get()!.series_id);
    const scopes = [freezeSeriesScope(db, result.bookId, seriesId)];
    const resolution = resolveSeriesConsistency(db, result.bookId); expect(resolution.kind).toBe('available');
    const entry = seriesConsistencyEntry(reviewCategoryEntry('series-consistency')!, resolution);
    const input = reviewCategoryContractInput(entry);
    const plain = reviewCategoryKindDefinition(input, 2);
    const tools = kindLocalTools(result.store.baselineAnalysisLedger.launch.policy, plain.kind)!; expect(tools).not.toBeNull();
    const current = reviewCategoryKindDefinition(input, 2, tools);
    for (const base of [reviewCategoryKindDefinition(input, 1), plain, current]) {
      const registered = seriesConsistencyKindDefinition(db, base, scopes);
      expect(liveSeriesConsistencyContract(registered)).toEqual({ digest: base.promptContractDigest, system: base.systemPrompt });
    }
    const pinChanges: Array<(pins: FrozenSeriesScope[]) => void> = [
      (pins) => { Object.assign(pins[0]!, { seriesId: randomUUID() }); },
      (pins) => { Object.assign(pins[0]!.knowledge[0]!, { itemId: randomUUID() }); },
      (pins) => { Object.assign(pins[0]!.knowledge[0]!, { revisionId: randomUUID() }); },
      (pins) => { Object.assign(pins[0]!.knowledge[0]!, { ordinal: pins[0]!.knowledge[0]!.ordinal + 1 }); },
      (pins) => { Object.assign(pins[0]!.knowledge[0]!, { digest: '0'.repeat(64) }); },
      (pins) => { Object.assign(pins[0]!, { knowledge: [] }); },
    ];
    for (const change of pinChanges) {
      const initial = structuredClone(scopes); change(initial);
      expect(() => seriesConsistencyKindDefinition(db, current, initial)).toThrow();
      const retained = structuredClone(scopes); const registered = seriesConsistencyKindDefinition(db, current, retained);
      change(retained); expect(() => liveSeriesConsistencyContract(registered)).toThrow();
    }
    const subset = reviewCategoryContract(input, 2, ['read_blocks']);
    const baseChanges: Array<(base: AnalysisKindDefinition) => void> = [
      (base) => { Object.assign(base, { kind: 'editorial-review/academic-integrity' }); },
      (base) => { Object.assign(base, { contractVersion: 'ai7.editorial-review/99' }); },
      (base) => { Object.assign(base, { contractVersion: 'ai7.editorial-review/1' }); },
      (base) => { Object.assign(base, { promptContractDigest: '0'.repeat(64) }); },
      (base) => { Object.assign(base, { systemPrompt: `${base.systemPrompt}\n不受支持的附加内容。` }); },
      (base) => { Object.assign(base, { promptContractDigest: reviewCategoryContractDigest(subset), systemPrompt: subset.systemPrompt }); },
    ];
    for (const change of baseChanges) {
      const initial = { ...current }; change(initial);
      expect(() => seriesConsistencyKindDefinition(db, initial, scopes)).toThrow();
      const retained = { ...current }; const registered = seriesConsistencyKindDefinition(db, retained, scopes);
      change(retained); expect(() => liveSeriesConsistencyContract(registered)).toThrow();
    }
  } finally { db.close(); }
});

it('prepares selected Series consistency with the current production tool base (#1131 rev21)', async () => {
  const result = await productionReview(['academic-integrity', 'series-consistency'], () => 'valid', undefined, false, false, { series: true });
  expect(new Set(result.requests.map((request) => request.category))).toEqual(new Set(['academic-integrity', 'series-consistency']));
  const { ledger } = latestReviewExecution(result.store);
  const original = ledger.definition; const base = original.clarificationBase ?? original;
  expect(base.kind).toBe('editorial-review/series-consistency');
  const proof = liveSeriesConsistencyContract(base); expect(proof).not.toBeNull(); expect(base.seriesScopes).toHaveLength(1);
  for (let refresh = 0; refresh < 3; refresh += 1) {
    ledger.bindLaunch(ledger.launch);
    expect(ledger.definition).toBe(original);
    expect(ledger.definition.clarificationBase ?? ledger.definition).toBe(base);
    expect(liveSeriesConsistencyContract(base)).toEqual(proof);
  }
});

it('recovers one proven no-send inside the native stock child with the same request and a fresh admission', async () => {
  const bodies: string[] = [];
  const result = await productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, {
    transportEntry: (request) => {
      bodies.push(String(request.body));
      if (bodies.length === 1) throw modelRequestNotSent(request, new Error('synthetic pre-send refusal'));
    },
  });
  const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!), 2);
  const projection = result.store.inspectReviewCategory(result.bookId, definition);
  expect(projection.state).toBe('settled');
  expect(bodies[0]).toBe(bodies[1]);
  const attempt = projection.run!.attempt!;
  expect(attempt.executionBinding!.compositionVersion).toBe(3);
  expect(projection.run!.adaptations).toHaveLength(1);
  expect(projection.run!.adaptations[0]).toMatchObject({ adaptationClass: 'safe-retry', unitOrdinal: 1, attemptIndex: 2 });
  const spans = attempt.spans.filter((span) => span.unitOrdinal === 1);
  expect(spans.map((span) => span.attemptIndex)).toEqual([1, 2]);
  expect(spans[0]!.harnessSessionId).toBe(spans[1]!.harnessSessionId);
  expect(spans[0]!.endSeq).toBeLessThan(spans[1]!.startSeq);
  expect(spans[0]!.payloadDigest).toBe(spans[1]!.payloadDigest);
  expect(result.store.reviewCategoryLedger(definition).requestAdmissionOf(projection.run!.runRecordId)).toMatchObject({ width: 1 });
  expect(projection.taskOutcome!.report!.usagePerStage.units.requests).toBe(9);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, inFlight: 0, waiting: 0 });
});

it('never resends a stock child after entering transport without a no-send proof', async () => {
  let calls = 0;
  const result = await productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, {
    transportEntry: () => { if (++calls === 1) throw Object.assign(new Error('synthetic connection loss'), { code: 'TRANSPORT_FAILED' }); },
  });
  const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!), 2);
  const projection = result.store.inspectReviewCategory(result.bookId, definition);
  expect(projection.run!.adaptations).toHaveLength(0);
  expect(projection.run!.attempt!.spans.filter((span) => span.unitOrdinal === 1)).toHaveLength(1);
  expect(projection.resultSetRevision!.gaps).toContainEqual(expect.objectContaining({ unitOrdinal: 1, code: 'outcome-unknown' }));
  expect(calls).toBeLessThanOrEqual(9);
});

it('owns three isolated production units through body cleanup and joins out-of-order results in manifest order (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, held);
  void working.catch(() => undefined);
  const [first, second, third] = await Promise.all([held.at(1), held.at(2), held.at(3)]);
  const { runRecordId, ledger } = latestReviewExecution(store!);
  const admitted = ledger.requestAdmissionOf(runRecordId)!;
  expect(admitted.width).toBe(3);
  expect(new Set([...admitted.open.values()].map((request) => request.sessionId)).size).toBe(3);
  expect(new Set([...admitted.open.values()].map((request) => request.producerId)).size).toBe(3);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 3, inFlight: 3, waiting: 0 });
  expect(owner!.progressFor(runRecordId)!.inFlightUnits).toEqual([1, 2, 3].map((unitOrdinal) => ({ unitOrdinal,
    attemptState: 'awaiting-response', requestState: 'admitted', admittedRequestStartedAt: expect.any(String) })));
  third.release(); second.release(); first.release();
  const result = await working;
  const checkpoints = ledger.unitCheckpoints(runRecordId);
  expect(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([...checkpoints].map((checkpoint) => checkpoint.unit.unitOrdinal).sort((left, right) => left - right));
  expect(checkpoints.length).toBeGreaterThan(3);
  expect(result.requests.map((request) => request.ordinal).sort((left, right) => left - right)).toEqual(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal));
  expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(requestGovernor.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
});

function heldGlobalAnswer(application: Parameters<NonNullable<ProductionReviewControl['ready']>>[0], reference: string) {
  const resolver = { resolve: async () => 'public-synthetic-placeholder' };
  const streamEntered = deferred();
  let finishStream: (() => void) | undefined;
  const encoder = new TextEncoder(); const sse = (value: unknown) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  const dialogues = new DialogueExecutionOwner({ requestGovernor, records: application.store, fixture: null,
    sessionLogRoot: application.store.harnessSessionLogRoot,
    live: productionDialogueRoute({ scope: 'ordinary-production', nativeFetch: (async (_url: unknown, init: RequestInit) =>
      new Response(new ReadableStream<Uint8Array>({ start(controller) {
        let closed = false;
        const abort = (): void => { if (closed) return; closed = true; controller.error(init.signal?.reason); };
        init.signal?.addEventListener('abort', abort, { once: true });
        controller.enqueue(sse({ model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: { content: '公开合成回答。' } }] }));
        finishStream = () => {
          if (closed) return; closed = true; init.signal?.removeEventListener('abort', abort);
          controller.enqueue(sse({ model: 'deepseek-v4.1-flash', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
          controller.enqueue(sse({ model: 'deepseek-v4.1-flash', choices: [], usage: { prompt_tokens: 13, completion_tokens: 5 } }));
          controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
        };
        streamEntered.resolve();
      } }), { headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch }, () => application.policy, () => reference, resolver),
  });
  return { dialogues, streamEntered, finishStream: () => finishStream?.() };
}

  const heldJson = (signal: AbortSignal | null | undefined, pending: Promise<unknown>): Promise<unknown> => new Promise((resolve, reject) => {
    const abort = (): void => reject(signal?.reason);
    if (signal?.aborted === true) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    void pending.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
  });

function prepareAdditionalReview(opened: EditorialStore, bookId: string, policy: LaunchPolicyProjection) {
  let preparation = opened.createReviewRunPreparationWork(bookId, ['style-and-format'],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!preparation.done) preparation = opened.advanceReviewRunPreparationWork(preparation.workId!);
  const run = preparation.projection!.run!;
  opened.authorizeReviewRun(bookId, run.reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
  return run;
}

async function sharedCapacityScenario() {
  const held = heldReviewResponses(3); const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
  void working.catch(() => undefined);
  const bodies = await Promise.all([held.at(1), held.at(2), held.at(3)]); const application = await ready.promise;
  const firstExecution = latestReviewExecution(application.store);
  const reference = application.store.getConfiguredModelRoleBinding('fast-interaction')!.credentialReference;
  const resolver = { resolve: async () => 'public-synthetic-placeholder' };
  const { dialogues, streamEntered, finishStream } = heldGlobalAnswer(application, reference);
  const fastEntered = deferred(); const probeEntered = deferred();
  const fastBody = deferred<unknown>(); const probeBody = deferred<unknown>();
  const fast = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: productionFastRoleRoutes({ scope: 'ordinary-production',
    nativeFetch: (async (_url: unknown, init: RequestInit) => ({ status: 200, json: () => { fastEntered.resolve(); return heldJson(init.signal, fastBody.promise); } })) as unknown as typeof fetch,
  }, () => application.policy, () => reference, resolver) });
  return { working, bodies, application, firstExecution, reference, resolver, dialogues, streamEntered, finishStream,
    fastEntered, probeEntered, fastBody, probeBody, fast };
}

it('shares four physical permits and nine producers across two real Runs, Global Agent SSE, Fast translation and connection test (#1131)', async () => {
  const { working, bodies, application, firstExecution, reference, resolver, dialogues, streamEntered, finishStream,
    fastEntered, probeEntered, fastBody, probeBody, fast } = await sharedCapacityScenario();
  let probeCalls = 0;
  let translation: ReturnType<ReturnType<typeof materialTranslator>['translate']> | undefined;
  let probe: ReturnType<typeof testModelServiceConnection> | undefined;
  let secondWorking: Promise<void> | undefined;
  try {
    const ask = { kind: 'ask' as const, question: '说明这个公开合成示例。', sources: [] };
    const disclosure = prepareGlobalAgentDisclosure(application.store, dialogues, application.policy, ask);
    startGlobalAgentTurn(application.store, dialogues, () => application.policy, ask, disclosure.sha256);
    await streamEntered.promise;
    const fastQueued = deferred(); const probeQueued = deferred(); const secondQueued = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor); let waiting = 0;
    vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => {
      const result = acquire(producer, signal); if (++waiting === 1) fastQueued.resolve(); else if (waiting === 2) probeQueued.resolve(); else if (waiting === 5) secondQueued.resolve(); return result;
    });
    translation = materialTranslator(fast, 'ordinary-production', () => 1).translate('a'.repeat(64), ['Public synthetic reference for shared request capacity.'], 'shared-capacity');
    await fastQueued.promise;
    probe = testModelServiceConnection(application.store, roots!.codeRoot, { scope: 'ordinary-production',
      nativeFetch: (async (_url: unknown, init: RequestInit) => { probeCalls += 1; return { status: 200, json: () => { probeEntered.resolve(); return heldJson(init.signal, probeBody.promise); } }; }) as unknown as typeof fetch,
    }, { route: 'opencode-go', modelId: 'deepseek-v4.1-flash' }, resolver, { requestGovernor });
    await probeQueued.promise;
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 6, inFlight: 4, waiting: 2 });
    expect(probeCalls).toBe(0);
    const secondBook = await importSample1Book(application.store, roots!.codeRoot, '第二项正式审阅');
    await pinEditorialWorkspaceProfileRevision2(application.store, secondBook.bookId);
    const secondRun = prepareAdditionalReview(application.store, secondBook.bookId, application.policy);
    secondWorking = driver!.drive(secondRun.reviewRunId); void secondWorking.catch(() => undefined);
    await secondQueued.promise;
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 9, inFlight: 4, waiting: 5 });
    bodies[0]!.release(); await fastEntered.promise;
    finishStream(); await probeEntered.promise;
    expect(requestGovernor.snapshot().inFlight).toBe(4); expect(probeCalls).toBe(1);
    const { runRecordId, ledger } = firstExecution; const facts = ledger.loadExecutionPlan(runRecordId);
    ledger.requestCancel(facts.bookId, facts.taskIntentId); application.owner.cancelRun(runRecordId, ledger);
    await working;
    await secondWorking;
    expect(application.store.inspectReviewWorkspace(secondBook.bookId, secondRun.reviewRunId).run!.state).toBe('settled');
    fastBody.resolve({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA,
      translations: [{ n: 1, text: '公开合成译文。' }] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 17, completion_tokens: 7 } });
    probeBody.resolve({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: 'AI7_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    expect((await translation).kind).toBe('translated'); expect((await probe).outcome).toBe('passed');
    await dialogues.dispose();
    expect(requestGovernor.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
  } finally {
    fast.dispose(); await dialogues.dispose();
    fastBody.resolve({}); probeBody.resolve({}); finishStream();
    await translation; await probe; await secondWorking; vi.restoreAllMocks();
  }
});

it('pauses new units but keeps authorized inner calls at the FIFO tail, then resumes exact checkpoints (#1131)', async () => {
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor({ globalCapacity: 1 });
  const acquired = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor); let calls = 0;
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => {
    const result = acquire(producer, signal); if (++calls === 3) acquired.resolve(); return result;
  });
  const held = heldReviewResponses(4);
  const working = productionReview(['style-and-format'], (_category, ordinal, prior) => ordinal === 1 && prior === 0 ? 'tools' : 'valid', undefined, false, false, held);
  void working.catch(() => undefined);
  const first = await held.at(1); await acquired.promise;
  const { runRecordId, ledger } = latestReviewExecution(store!);
  const facts = ledger.loadExecutionPlan(runRecordId);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 3, inFlight: 1, waiting: 2 });
  expect(owner!.progressFor(runRecordId)!.inFlightUnits?.filter((unit) => unit.requestState === 'waiting-for-capacity'))
    .toEqual([2, 3].map((unitOrdinal) => ({ unitOrdinal, attemptState: 'dispatched', requestState: 'waiting-for-capacity', admittedRequestStartedAt: null })));
  ledger.requestPause(facts.bookId, facts.taskIntentId); owner!.pauseRun(runRecordId, ledger);
  first.release(); const second = await held.at(2); second.release(); const third = await held.at(3); third.release();
  const inner = await held.at(4);
  expect([first.ordinal, second.ordinal, third.ordinal, inner.ordinal]).toEqual([1, 2, 3, 1]);
  expect(ledger.currentRunState(runRecordId)).toBe('pausing');
  inner.release(); const result = await working;
  expect(result.requests.map((request) => request.ordinal)).toEqual([1, 2, 3, 1]);
  expect(ledger.currentRunState(runRecordId)).toBe('paused');
  expect(ledger.unitCheckpoints(runRecordId)).toHaveLength(3);
  expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(ledger.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === 1)?.observation?.usage).toMatchObject({ inputTokens: 80, outputTokens: 40 });
  owner!.admitAndDispatch(runRecordId, ledger, { resume: true }); await owner!.whenIdle();
  expect(ledger.currentRunState(runRecordId)).toMatch(/^completed/u);
  expect(ledger.requestAdmissionOf(runRecordId)!.width).toBe(3);
  expect(result.requests.filter((request) => request.ordinal === 1)).toHaveLength(2);
  expect(result.requests.filter((request) => request.ordinal === 2)).toHaveLength(1);
  expect(result.requests.filter((request) => request.ordinal === 3)).toHaveLength(1);
  vi.restoreAllMocks();
});

async function reopenToolReview({ coupled, source }: { coupled: boolean; source: string }) {
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor();
  const category = source === 'material' ? 'typos-and-usage' : source === 'consistency' ? 'series-consistency' : 'academic-integrity';
  const searchReadiness = category === 'academic-integrity' ? vi.spyOn(CredentialBroker.prototype, 'checkPlanReadiness') : null;
  if (searchReadiness !== null) cleanupResources.push(() => searchReadiness.mockRestore());
  const held = heldReviewResponses(source === 'material' && !coupled ? 1 : 3); const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview([category], (_category, _ordinal, prior) => prior === 0 ? 'tools' : 'valid',
    undefined, coupled, coupled, { response: (response, signal, body) => (JSON.parse(body) as { messages: Array<{ role: string }> }).messages.some((message) => message.role === 'tool')
      ? Promise.resolve(response) : held.response(response, signal, body), ready: ready.resolve, series: source === 'series' || source === 'consistency' });
  void working.catch(() => undefined);
  const application = await Promise.race([ready.promise, working.then(() => { throw new Error('Review settled before genuine preparation completed'); })]);
  const first = await Promise.race([held.at(1), working.then(() => { throw new Error('Review settled before its first held transport'); })]);
  const { runRecordId, ledger } = latestReviewExecution(application.store); const facts = ledger.loadExecutionPlan(runRecordId);
  const width = ledger.requestAdmissionOf(runRecordId)!.width;
  const arrivals = [first, ...await Promise.all(Array.from({ length: width - 1 }, (_, index) => held.at(index + 2)))];
  if (searchReadiness !== null) { expect(facts.webToolsBackend).toBeDefined(); expect(searchReadiness).toHaveBeenCalled(); }
  ledger.requestPause(facts.bookId, facts.taskIntentId); application.owner.pauseRun(runRecordId, ledger);
  for (const arrival of arrivals) arrival.release();
  const result = await working;
  expect(ledger.currentRunState(runRecordId)).toBe('paused');
  const originalDefinition = ledger.definitionForRun(runRecordId, facts.promptContractDigest);
  const originalBase = originalDefinition.clarificationBase ?? originalDefinition;
  const originalBinding = ledger.executionBindingOf(runRecordId); const checkpoints = ledger.unitCheckpoints(runRecordId);
  if (coupled) expect(result.requests.some((request) => request.body.includes('统一编辑用语，保留有意的节奏。'))).toBe(true);
  expect(result.requests.some((request) => (JSON.parse(request.body) as { messages: Array<{ role: string }> }).messages.some((message) => message.role === 'tool'))).toBe(true);
  const missing = application.store.saveModelServiceConnection('合成重启审阅新选择', null, 'needs-attention', 'deepseek-open-platform');
  application.store.setModelServiceCredentialState(missing.credentialReference, 'missing'); application.store.selectModelServiceRoute('deepseek-open-platform');
  await driver!.dispose(); driver = undefined; await application.owner.dispose(); owner = undefined;
  application.store.close(); store = undefined;
  requestGovernor.close(); await requestGovernor.whenIdle(); requestGovernor = new ModelRequestGovernor();
  const reopened = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot); store = reopened;
  const current = resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', null);
  reopened.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy: current, live: null });
  const kept = reopened.executionLedgerForRun(runRecordId); const before = result.requests.length;
  const restored = kept.definitionForRun(runRecordId, facts.promptContractDigest);
  const restoredBase = kept.definitionForDigest(originalBase.promptContractDigest);
  expect(restored.systemPrompt).toBe(originalDefinition.systemPrompt); expect(restored.schemaDigest).toBe(originalDefinition.schemaDigest);
  expect(restored.clarificationBase ?? restored).toBe(restoredBase);
  kept.bindLaunch({ operationalScope: 'ordinary-production', policy: current, live: null }); void kept.definition;
  expect(kept.definitionForDigest(originalBase.promptContractDigest)).toBe(restoredBase);
  expect(kept.definitionForDigest(facts.promptContractDigest).clarificationBase ?? restoredBase).toBe(restoredBase);
  expect(kept.unitCheckpoints(runRecordId)).toEqual(checkpoints); expect(kept.executionBindingOf(runRecordId)).toEqual(originalBinding);
  expect(kept.loadExecutionPlan(runRecordId)).toEqual(facts);
  const priorState = kept.inspect(application.bookId); let deniedEffects = 0;
  const other = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route !== facts.productionBinding!.route)!;
  expect(other).toBeDefined();
  for (const resolver of [undefined, () => current,
    () => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'development-ci', null),
    () => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', { ...other, credentialReference: facts.credentialReference })]) {
    const refused = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: reopened.baselineAnalysisLedger, launchPolicy: current, fixture: null,
      ...(resolver === undefined ? {} : { productionPolicyFor: resolver }),
      production: { scope: 'ordinary-production', nativeFetch: async () => { deniedEffects += 1; throw new Error('unexpected transport'); } },
      secretResolver: { resolve: async () => { deniedEffects += 1; return 'public-synthetic-placeholder'; } } });
    expect(refused.carriesStoppedRun(runRecordId, kept)).toBe(false);
    expect(() => refused.admitAndDispatch(runRecordId, kept, { resume: true })).toThrow('策略');
    await refused.dispose(); expect(kept.inspect(application.bookId)).toEqual(priorState);
  }
  expect(deniedEffects).toBe(0); expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
  return { category, searchReadiness, application, runRecordId, facts, originalBase, originalBinding, checkpoints, result, reopened, current, kept, before };
}

function withdrawRetainedSource(context: Awaited<ReturnType<typeof reopenToolReview>>, source: string) {
  const { reopened, runRecordId, kept, originalBase, category } = context;
    if (source === 'material') {
      expect(reopened.materialGuard(runRecordId, kept)).toBeNull();
      const material = originalBase.materialReferences!.sources[0]!;
      reopened.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 2,
        decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      const refusal = reopened.materialGuard(runRecordId, kept); expect(refusal).not.toBeNull();
    } else if (source === 'influence') {
      expect(reopened.learningInfluenceGuard(runRecordId)).toBeNull();
      const preference = reopened.inspectGlobalAgent().items.find((item) => item.kind === 'preference' && item.categoryId === category)!;
      expect(preference).toBeDefined();
      reopened.recordLearningSupervision({ operation: 'supervise', targets: [{ itemId: preference.itemId, revisionId: preference.revisionId }],
        scope: { kind: 'house' }, categoryId: category, text: '冻结本次合成偏好。', effect: 'freeze' });
      expect(reopened.learningInfluenceGuard(runRecordId)).not.toBeNull();
    } else {
      expect(reopened.seriesScopeGuard(runRecordId)).toBeNull();
      const series = originalBase.seriesScopes![0]!; const knowledge = series.knowledge[0]!;
      const request = { seriesId: series.seriesId, action: 'add' as const, exclusionId: null,
        target: { kind: 'knowledge-item' as const, id: knowledge.itemId }, reason: '合成停止参考书系知识。' };
      const preview = reopened.previewSeriesExclusion(request);
      reopened.recordSeriesExclusion({ ...request, previewDigest: preview.previewDigest });
      expect(reopened.seriesScopeGuard(runRecordId)).not.toBeNull();
    }
}

it.each([{ coupled: false, withdrawn: false, source: 'material', pause: false }, { coupled: true, withdrawn: false, source: 'material', pause: false },
  { coupled: true, withdrawn: true, source: 'material', pause: false }, { coupled: true, withdrawn: true, source: 'influence', pause: false },
  { coupled: true, withdrawn: true, source: 'influence', pause: true }, { coupled: false, withdrawn: true, source: 'series', pause: false },
  { coupled: false, withdrawn: false, source: 'consistency', pause: false }])
  ('continues a tool-using frozen review after restart with Main missing, material+preference=$coupled, withdrawn=$withdrawn, source=$source, pause=$pause (#1131)', async ({ coupled, withdrawn, source, pause }) => {
  const context = await reopenToolReview({ coupled, source });
  const { searchReadiness, application, runRecordId, facts, originalBinding, checkpoints, result, reopened, current, kept, before } = context;
  const reads: string[] = []; const urls: string[] = [];
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: reopened.baselineAnalysisLedger, launchPolicy: current, fixture: null,
    productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
    materialGuard: (id, consuming) => reopened.materialGuard(id, consuming),
    influenceGuard: (id) => reopened.learningInfluenceGuard(id),
    seriesScopeGuard: (id) => reopened.seriesScopeGuard(id),
    production: { scope: 'ordinary-production', nativeFetch: async (url, init) => { urls.push(String(url)); return application.transport(url, init); } },
    secretResolver: { resolve: async (reference) => { reads.push(reference); return 'public-synthetic-placeholder'; } } });
  expect(owner.carriesStoppedRun(runRecordId, kept)).toBe(true);
  if (withdrawn) {
    withdrawRetainedSource(context, source);
    const beforeUsage = checkpoints.reduce((usage, checkpoint) => ({ inputTokens: usage.inputTokens + (checkpoint.observation?.usage?.inputTokens ?? 0),
      outputTokens: usage.outputTokens + (checkpoint.observation?.usage?.outputTokens ?? 0) }), { inputTokens: 0, outputTokens: 0 });
    searchReadiness?.mockClear();
    const preparing = deferred(); const release = deferred();
    if (pause) {
      const actual = harnessExecution.prepareExecution; let intercepted = false;
      const prepare = vi.spyOn(harnessExecution, 'prepareExecution').mockImplementation(async (options) => {
        const context = await actual(options);
        if (!intercepted) { intercepted = true; preparing.resolve(); await release.promise; }
        return context;
      });
      cleanupResources.push(() => { release.resolve(); prepare.mockRestore(); });
    }
    owner.admitAndDispatch(runRecordId, kept, { resume: true });
    if (pause) { await preparing.promise; kept.requestPause(facts.bookId, facts.taskIntentId); owner.pauseRun(runRecordId, kept); release.resolve(); }
    await owner.whenIdle();
    expect(result.requests).toHaveLength(before); expect(urls).toHaveLength(0);
    expect(kept.unitCheckpoints(runRecordId)).toEqual(checkpoints);
    expect(kept.inspect(application.bookId).taskOutcome?.report?.usagePerStage.units).toMatchObject(beforeUsage);
    expect(kept.currentRunState(runRecordId)).toBe('interrupted');
    expect(kept.inspect(application.bookId).taskOutcome?.classification).toBe('interrupted');
      expect(reads).toHaveLength(0);
    if (searchReadiness !== null) expect(searchReadiness).not.toHaveBeenCalled();
    return;
  }
  owner.admitAndDispatch(runRecordId, kept, { resume: true }); await owner.whenIdle();
  expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
  const continued = result.requests.slice(before);
  expect(continued.length).toBeGreaterThan(0);
  expect(reads.length).toBeGreaterThan(0); expect(reads.every((reference) => reference === facts.credentialReference)).toBe(true);
  expect(urls.length).toBeGreaterThan(0); expect(urls.every((url) => url === facts.productionBinding!.endpoint)).toBe(true);
  expect(kept.unitCheckpoints(runRecordId).slice(0, checkpoints.length)).toEqual(checkpoints);
  expect(kept.executionBindingOf(runRecordId)?.bindingDigest).toBe(originalBinding?.bindingDigest);
  expect(() => reopened.createReviewRunPreparationWork(application.bookId, ['typos-and-usage'],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, current)).toThrow('模型服务需设置');
});

function factualReviewResponse(response: Response, body: string): Response {
  const parsed = JSON.parse(body) as { model: string; messages: Array<{ role: string; content: string }> };
  const header = parseFactualReviewUnitMessageHeader(parsed.messages.findLast((message) => message.role === 'user')!.content);
  const valid = header === null ? response : new Response(JSON.stringify({ model: parsed.model,
    choices: [{ message: { content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/2', unitOrdinal: header.ordinal, assertions: [], corrections: [] }) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  return valid;
}

it.each([{ guard: 'influence', cancel: false, pause: false }, { guard: 'series', cancel: false, pause: false },
  { guard: 'influence', cancel: true, pause: false }, { guard: 'influence', cancel: false, pause: true }])
  ('settles a bound research continuation locally when the $guard guard stops it, cancel=$cancel, pause=$pause (#1131 rev19)', async ({ guard, cancel, pause }) => {
    const searchReadiness = vi.spyOn(CredentialBroker.prototype, 'checkPlanReadiness');
    cleanupResources.push(() => searchReadiness.mockRestore());
    const held = heldReviewResponses(3, (message) => parseFactualReviewUnitMessageHeader(message)?.ordinal ?? null);
    const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
    const working = productionReview(['factual-review'], () => 'valid', undefined, false, false, { ready: ready.resolve,
      response: async (response, signal, body) => held.response(factualReviewResponse(response, body), signal, body) });
    void working.catch(() => undefined);
    const application = await Promise.race([ready.promise, working.then(() => { throw new Error('Research settled before preparation completed'); })]);
    const first = await Promise.race([held.at(1), working.then(() => { throw new Error(`Research settled before transport: ${JSON.stringify(application.store.inspectReviewWorkspace(application.bookId, application.reviewRunId).run?.categories.map((category) => ({ category: category.categoryId, state: category.state, detail: category.stateLabel })))}`); })]);
    const { runRecordId, ledger } = latestReviewExecution(application.store); const facts = ledger.loadExecutionPlan(runRecordId);
    const width = ledger.requestAdmissionOf(runRecordId)!.width;
    const arrivals = [first, ...await Promise.all(Array.from({ length: width - 1 }, (_, index) => held.at(index + 2)))];
    expect(facts.webToolsBackend).toBeDefined(); expect(facts.searchCredentialReference).toBeDefined();
    ledger.requestPause(facts.bookId, facts.taskIntentId); application.owner.pauseRun(runRecordId, ledger);
    for (const arrival of arrivals) arrival.release(); await working;
    const checkpoints = ledger.unitCheckpoints(runRecordId); expect(checkpoints).toHaveLength(width);
    const binding = ledger.executionBindingOf(runRecordId);
    await application.owner.dispose(); owner = undefined;
    await driver!.dispose(); driver = undefined;
    const credentials: string[] = []; let sends = 0; let guardChecks = 0; searchReadiness.mockClear();
    owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: application.store.baselineAnalysisLedger, launchPolicy: application.policy, fixture: null,
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
      production: { scope: 'ordinary-production', nativeFetch: async () => { sends += 1; throw new Error('unexpected source-stop send'); } },
      secretResolver: { resolve: async (reference) => { credentials.push(reference); return 'public-synthetic-placeholder'; } },
      ...(guard === 'influence' ? { influenceGuard: () => { guardChecks += 1; return '合成已停止使用的影响'; } }
        : { seriesScopeGuard: () => { guardChecks += 1; return '合成已变化的书系范围'; } }) });
    const prepared = deferred(); const release = deferred();
    if (pause) {
      const actual = harnessExecution.prepareExecution; let intercepted = false;
      const prepare = vi.spyOn(harnessExecution, 'prepareExecution').mockImplementation(async (options) => {
        const context = await actual(options);
        if (!intercepted) { intercepted = true; prepared.resolve(); await release.promise; }
        return context;
      });
      cleanupResources.push(() => { release.resolve(); prepare.mockRestore(); });
    }
    if (cancel) ledger.requestCancel(facts.bookId, facts.taskIntentId);
    owner.admitAndDispatch(runRecordId, ledger, { resume: true, ...(cancel ? { cancel: true } : {}) });
    if (pause) {
      await prepared.promise; ledger.requestPause(facts.bookId, facts.taskIntentId); owner.pauseRun(runRecordId, ledger); release.resolve();
    }
    await owner.whenIdle();
    expect(sends).toBe(0); expect(credentials).toEqual([]); expect(searchReadiness).not.toHaveBeenCalled();
    expect(guardChecks).toBe(cancel ? 0 : 1); expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
    expect(ledger.unitCheckpoints(runRecordId)).toEqual(checkpoints); expect(ledger.executionBindingOf(runRecordId)?.bindingDigest).toBe(binding?.bindingDigest);
    expect(ledger.currentRunState(runRecordId)).toBe(cancel ? 'cancelled' : 'interrupted');
    expect(ledger.inspect(application.bookId).taskOutcome?.report?.usagePerStage.units).toMatchObject({ inputTokens: width * 40, outputTokens: width * 20 });
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 }); searchReadiness.mockRestore();
  });

it('cancels every sent production sibling and keeps each unknown checkpoint without admitting another unit (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, held);
  void working.catch(() => undefined);
  await Promise.all([held.at(1), held.at(2), held.at(3)]);
  const { runRecordId, ledger } = latestReviewExecution(store!); const facts = ledger.loadExecutionPlan(runRecordId);
  ledger.requestCancel(facts.bookId, facts.taskIntentId); owner!.cancelRun(runRecordId, ledger);
  const result = await working;
  expect(result.requests).toHaveLength(3);
  expect(ledger.currentRunState(runRecordId)).toBe('cancelled');
  expect(ledger.unitCheckpoints(runRecordId)).toHaveLength(3);
  expect(ledger.unitCheckpoints(runRecordId).every((checkpoint) => checkpoint.unit.closed.state === 'gap' && checkpoint.unit.closed.gap.code === 'outcome-unknown')).toBe(true);
  expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
});

it('reopens a real crash snapshot with one committed sibling and three unmatched request fences without resending them (#1131)', async () => {
  const held = heldReviewResponses(4);
  const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
  void working.catch(() => undefined);
  const [first] = await Promise.all([held.at(1), held.at(2), held.at(3)]);
  const application = await ready.promise; first.release(); await held.at(4);
  const { runRecordId, ledger } = latestReviewExecution(application.store);
  const known = ledger.unitCheckpoints(runRecordId);
  expect(known).toHaveLength(1);
  const possible = [...ledger.requestAdmissionOf(runRecordId)!.open.values()].map((request) => request.unitOrdinal!);
  expect(possible).toHaveLength(3); expect(possible).not.toContain(first.ordinal);
  const snapshot = await crashSnapshot('crash-with-sibling-fences');
  const launch = ledger.launch;
  await application.owner.dispose(); await working;
  const reopened = await EditorialStore.open(snapshot, roots!.codeRoot);
  const restartedGovernor = new ModelRequestGovernor(); let restarted: BaselineAnalysisExecutionOwner | undefined;
  try {
    reopened.baselineAnalysisLedger.bindLaunch(launch);
    reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(runRecordId);
    expect(kept.unitCheckpoints(runRecordId)).toHaveLength(4);
    expect(kept.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === first.ordinal)).toEqual(known[0]);
    expect(kept.unitCheckpoints(runRecordId).filter((checkpoint) => possible.includes(checkpoint.unit.unitOrdinal))
      .every((checkpoint) => checkpoint.unit.closed.state === 'gap' && checkpoint.unit.closed.gap.code === 'outcome-unknown')).toBe(true);
    expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
    restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: restartedGovernor, ledger: reopened.baselineAnalysisLedger,
      launchPolicy: application.policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: application.transport },
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
    const before = (await working).requests.filter((request) => possible.includes(request.ordinal)).length;
    restarted.admitAndDispatch(runRecordId, kept, { resume: true }); await restarted.whenIdle();
    expect((await working).requests.filter((request) => possible.includes(request.ordinal))).toHaveLength(before);
    expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
    expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  } finally { await restarted?.dispose(); reopened.close(); restartedGovernor.close(); await restartedGovernor.whenIdle(); }
});

it('preserves a committed unit, a possible send and queued unsent siblings distinctly across a real restart (#1131)', async () => {
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor({ globalCapacity: 1 });
  const fourth = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor); let acquisitions = 0;
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => {
    const result = acquire(producer, signal); if (++acquisitions === 4) fourth.resolve(); return result;
  });
  const held = heldReviewResponses(2); const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
  void working.catch(() => undefined); const first = await held.at(1); first.release();
  const sent = await held.at(2); await fourth.promise;
  const application = await ready.promise; const { runRecordId, ledger } = latestReviewExecution(application.store);
  const known = ledger.unitCheckpoints(runRecordId); expect(known).toHaveLength(1);
  const queued = application.owner.progressFor(runRecordId)!.inFlightUnits!.filter((unit) => unit.requestState === 'waiting-for-capacity').map((unit) => unit.unitOrdinal);
  expect(queued).toHaveLength(2);
  expect([...ledger.requestAdmissionOf(runRecordId)!.open.values()].map((request) => request.unitOrdinal)).toEqual([sent.ordinal]);
  const snapshot = await crashSnapshot('crash-known-sent-queued'); const launch = ledger.launch;
  await application.owner.dispose(); const original = await working;
  expect(original.requests.filter((request) => queued.includes(request.ordinal))).toHaveLength(0);
  const reopened = await EditorialStore.open(snapshot, roots!.codeRoot); const capacity = new ModelRequestGovernor();
  let restarted: BaselineAnalysisExecutionOwner | undefined;
  try {
    reopened.baselineAnalysisLedger.bindLaunch(launch); reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(runRecordId); const checkpoints = kept.unitCheckpoints(runRecordId);
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints.find((checkpoint) => checkpoint.unit.unitOrdinal === first.ordinal)).toEqual(known[0]);
    expect(checkpoints.find((checkpoint) => checkpoint.unit.unitOrdinal === sent.ordinal)?.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
    expect(checkpoints.some((checkpoint) => queued.includes(checkpoint.unit.unitOrdinal))).toBe(false);
    restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: reopened.baselineAnalysisLedger,
      launchPolicy: application.policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: application.transport },
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
    restarted.admitAndDispatch(runRecordId, kept, { resume: true }); await restarted.whenIdle();
    expect(original.requests.filter((request) => request.ordinal === first.ordinal)).toHaveLength(1);
    expect(original.requests.filter((request) => request.ordinal === sent.ordinal)).toHaveLength(1);
    for (const ordinal of queued) expect(original.requests.filter((request) => request.ordinal === ordinal)).toHaveLength(1);
    expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
    expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  } finally { await restarted?.dispose(); reopened.close(); capacity.close(); await capacity.whenIdle(); vi.restoreAllMocks(); }
});

it.each(['before-fence', 'fenced-before-native'] as const)('keeps %s crash evidence truthful and never infers an actual send from a fence (#1131)', async (phase) => {
  requestGovernor.close(); requestGovernor = new ModelRequestGovernor({ globalCapacity: 1 });
  const foreign = phase === 'before-fence' ? requestGovernor.registerProducer({ key: 'unrelated-live-request', kind: 'fast-role', lane: 'foreground' }) : null;
  const occupied = foreign === null ? null : await requestGovernor.acquire(foreign, new AbortController().signal);
  const queued = deferred(); const acquire = requestGovernor.acquire.bind(requestGovernor); let acquisitions = 0;
  vi.spyOn(requestGovernor, 'acquire').mockImplementation((producer, signal) => {
    const result = acquire(producer, signal); if (++acquisitions === 3) queued.resolve(); return result;
  });
  const readingSecret = deferred(); const releaseSecret = deferred<string | null>();
  cleanupResources.push(() => { releaseSecret.resolve('public-synthetic-placeholder'); occupied?.release(); if (foreign !== null) requestGovernor.unregisterProducer(foreign); });
  const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, { ready: ready.resolve,
    credential: async (read) => {
      if (phase === 'fenced-before-native' && read === 2) { readingSecret.resolve(); return releaseSecret.promise; }
      return 'public-synthetic-placeholder';
    },
  });
  void working.catch(() => undefined);
  if (phase === 'before-fence') await queued.promise; else await readingSecret.promise;
  const application = await ready.promise; const { runRecordId, ledger } = latestReviewExecution(application.store);
  const possible = [...ledger.requestAdmissionOf(runRecordId)!.open.values()];
  expect(possible).toHaveLength(phase === 'before-fence' ? 0 : 1);
  const snapshot = await crashSnapshot(`crash-${phase}`); const launch = ledger.launch;
  const disposed = application.owner.dispose();
  if (phase === 'fenced-before-native') expect(requestGovernor.snapshot().inFlight).toBe(1);
  releaseSecret.resolve('public-synthetic-placeholder'); await disposed; const original = await working;
  expect(original.requests).toHaveLength(0);
  if (phase === 'fenced-before-native') expect(ledger.requestAdmissionOf(runRecordId)!.notSent).toHaveLength(1);
  occupied?.release(); if (foreign !== null) requestGovernor.unregisterProducer(foreign);
  const reopened = await EditorialStore.open(snapshot, roots!.codeRoot); const capacity = new ModelRequestGovernor();
  let restarted: BaselineAnalysisExecutionOwner | undefined;
  try {
    reopened.baselineAnalysisLedger.bindLaunch(launch); reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(runRecordId); const checkpoints = kept.unitCheckpoints(runRecordId);
    expect(checkpoints).toHaveLength(phase === 'before-fence' ? 0 : 1);
    if (phase === 'fenced-before-native') expect(checkpoints[0]!.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown' } });
    restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: reopened.baselineAnalysisLedger,
      launchPolicy: application.policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: application.transport },
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
    restarted.admitAndDispatch(runRecordId, kept, { resume: true }); await restarted.whenIdle();
    if (phase === 'fenced-before-native') expect(original.requests.filter((request) => request.ordinal === possible[0]!.unitOrdinal)).toHaveLength(0);
    else expect(original.requests.some((request) => request.ordinal === 1)).toBe(true);
    expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
    expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  } finally { await restarted?.dispose(); reopened.close(); capacity.close(); await capacity.whenIdle(); vi.restoreAllMocks(); }
});

it('reuses an exact unit checkpoint when a crash occurs before its request-fence discharge (#1131)', async () => {
  const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  let snapshot: string | undefined; let knownOrdinal: number | undefined; let installed = false;
  const result = await productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ready: ready.resolve,
    response: async (response) => {
      if (!installed) {
        installed = true;
        const { ledger } = latestReviewExecution(store!); const checkpoint = ledger.checkpointModelRequests.bind(ledger);
        vi.spyOn(ledger, 'checkpointModelRequests').mockImplementation((runId, ordinal) => {
          if (snapshot === undefined) {
            expect(ledger.unitCheckpoints(runId).some((kept) => kept.unit.unitOrdinal === ordinal)).toBe(true);
            expect([...ledger.requestAdmissionOf(runId)!.open.values()].some((request) => request.unitOrdinal === ordinal)).toBe(true);
            knownOrdinal = ordinal; snapshot = synchronousCrashSnapshot('crash-unit-checkpoint-before-discharge');
          }
          checkpoint(runId, ordinal);
        });
      }
      return response;
    },
  });
  expect(snapshot).toBeDefined(); const application = await ready.promise;
  const { ledger, runRecordId } = latestReviewExecution(result.store);
  const known = ledger.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === knownOrdinal)!;
  const reopened = await EditorialStore.open(snapshot!, roots!.codeRoot); const capacity = new ModelRequestGovernor();
  let restarted: BaselineAnalysisExecutionOwner | undefined;
  try {
    reopened.baselineAnalysisLedger.bindLaunch(ledger.launch); reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(runRecordId);
    expect(kept.unitCheckpoints(runRecordId).find((checkpoint) => checkpoint.unit.unitOrdinal === knownOrdinal)).toEqual(known);
    expect(kept.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
    restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: reopened.baselineAnalysisLedger,
      launchPolicy: application.policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch: application.transport },
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots!.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
    restarted.admitAndDispatch(runRecordId, kept, { resume: true }); await restarted.whenIdle();
    expect(result.requests.filter((request) => request.ordinal === knownOrdinal)).toHaveLength(1);
    expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
  } finally { await restarted?.dispose(); reopened.close(); capacity.close(); await capacity.whenIdle(); }
});

it('refuses a malformed durable receipt before continuation can register or send a producer (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['style-and-format'], () => 'valid', undefined, false, false, held);
  void working.catch(() => undefined);
  const bodies = await Promise.all([held.at(1), held.at(2), held.at(3)]);
  const { runRecordId, ledger } = latestReviewExecution(store!); const facts = ledger.loadExecutionPlan(runRecordId);
  ledger.requestPause(facts.bookId, facts.taskIntentId); owner!.pauseRun(runRecordId, ledger);
  for (const body of bodies) body.release();
  const result = await working; const count = result.requests.length;
  ledger.recordRunState(runRecordId, 'paused', { requestAdmission: { schema: 'ai7.analysis.request-admission/1', data: {}, digest: '0'.repeat(64) } });
  expect(() => owner!.admitAndDispatch(runRecordId, ledger, { resume: true })).toThrow('准入记录无法核对');
  expect(result.requests).toHaveLength(count);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, inFlight: 0, waiting: 0 });
  expect(ledger.currentRunState(runRecordId)).toBe('paused');
});

it('settles an orphan terminal reflection locally as unavailable without inventing an outcome or terminal resume (#1131)', async () => {
  const held = heldReviewResponses(1, (message) => message.startsWith('运行反思 ') ? 0 : null);
  const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
  void working.catch(() => undefined); await held.at(1);
  const application = await ready.promise; const { runRecordId, ledger } = latestReviewExecution(application.store);
  expect(ledger.currentRunState(runRecordId)).toMatch(/^completed/u); expect(ledger.hasCommittedOutcome(runRecordId)).toBe(false);
  expect([...ledger.requestAdmissionOf(runRecordId)!.open.values()].map((request) => request.stage)).toEqual(['run-report-reflection']);
  const snapshot = await crashSnapshot('crash-during-terminal-reflection'); const launch = ledger.launch;
  await application.owner.dispose(); await working;
  const reopened = await EditorialStore.open(snapshot, roots!.codeRoot);
  try {
    reopened.baselineAnalysisLedger.bindLaunch(launch); reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(runRecordId); const receipt = kept.requestAdmissionOf(runRecordId)!;
    expect(receipt.open.size).toBe(0); expect(receipt.unavailable.map((request) => request.stage)).toEqual(['run-report-reflection']);
    expect(kept.hasCommittedOutcome(runRecordId)).toBe(false); expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
    kept.reconcileRequestAdmissions(runRecordId); expect(kept.requestAdmissionOf(runRecordId)!.sequence).toBe(receipt.sequence);
    expect(() => kept.continuableRun(application.bookId, kept.loadExecutionPlan(runRecordId).taskIntentId)).toThrow();
  } finally { reopened.close(); }
});

it('keeps reflection receipts separate from child tool IDs, with two admissions and usage counted once (#1131 rev8)', async () => {
  let reflections = 0;
  const result = await productionReview(['typos-and-usage'], (_category, _ordinal, prior) => prior === 0 ? 'tools' : 'valid', undefined, false, false, {
    response: async (response, _signal, body) => {
      const request = JSON.parse(body) as { model: string; messages: Array<{ role: string; content: string }> };
      if (!request.messages.findLast((entry) => entry.role === 'user')!.content.startsWith('运行反思 ')) return response;
      reflections += 1;
      if (request.messages.some((entry) => entry.role === 'tool')) return response;
      return new Response(JSON.stringify({ model: request.model, choices: [{ message: { content: null, reasoning_content: '合成反思工具回合。', tool_calls: [
        { id: 'read-1', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '的', mode: 'exact' }) } },
        { id: 'search-1', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '了', mode: 'exact' }) } },
      ] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
    },
  });
  const { runRecordId, ledger } = latestReviewExecution(result.store); expect(reflections).toBe(2);
  expect(ledger.inspect(result.bookId).taskOutcome?.report?.usagePerStage['run-report-reflection'])
    .toEqual({ requests: 2, inputTokens: 80, outputTokens: 40 });
  expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(0);
  expect(requestGovernor.snapshot()).toMatchObject({ registered: 0, inFlight: 0 });
});

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

}, 60_000);
