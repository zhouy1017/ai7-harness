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
    const finish = (response: Response): Promise<Response> => control.response?.(response, init?.signal ?? undefined, String(init?.body)) ?? Promise.resolve(response);
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
            : header.ordinal === 1 && block !== undefined && (header.categoryId === 'publication-risk' || body.messages.some((entry) => entry.role === 'tool'))
            ? [{ quote: block.text, blockOrdinal: block.ordinal, severity: 'should', note: '合成审阅发现；请人工复核。',
              ...(header.categoryId === 'publication-risk' ? { clauseId: 'publication-risk/1' } : { replacement: `${block.text}合成` }) }] : [],
        });
      }
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
  control.ready?.({ store, owner, bookId: book.bookId, reviewRunId: run.reviewRunId, policy, transport: nativeFetch });
  await driver.drive(run.reviewRunId);
  return { store, bookId: book.bookId, reviewRunId: run.reviewRunId, requests };
}

const typosDefinition = () => reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));

it('owns three isolated production units through body cleanup and joins out-of-order results in manifest order (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, held);
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

it('shares four physical permits and nine producers across two real Runs, Global Agent SSE, Fast translation and connection test (#1131)', async () => {
  const held = heldReviewResponses(3); const ready = deferred<Parameters<NonNullable<ProductionReviewControl['ready']>>[0]>();
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
  void working.catch(() => undefined);
  const bodies = await Promise.all([held.at(1), held.at(2), held.at(3)]); const application = await ready.promise;
  const firstExecution = latestReviewExecution(application.store);
  const reference = application.store.getConfiguredModelRoleBinding('fast-interaction')!.credentialReference;
  const resolver = { resolve: async () => 'public-synthetic-placeholder' };
  const streamEntered = deferred(); const fastEntered = deferred(); const probeEntered = deferred();
  const fastBody = deferred<unknown>(); const probeBody = deferred<unknown>();
  let finishStream: (() => void) | undefined; let probeCalls = 0;
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
  const heldJson = (signal: AbortSignal | null | undefined, pending: Promise<unknown>): Promise<unknown> => new Promise((resolve, reject) => {
    const abort = (): void => reject(signal?.reason);
    if (signal?.aborted === true) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    void pending.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
  });
  const fast = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: productionFastRoleRoutes({ scope: 'ordinary-production',
    nativeFetch: (async (_url: unknown, init: RequestInit) => ({ status: 200, json: () => { fastEntered.resolve(); return heldJson(init.signal, fastBody.promise); } })) as unknown as typeof fetch,
  }, () => application.policy, () => reference, resolver) });
  let translation: ReturnType<ReturnType<typeof materialTranslator>['translate']> | undefined;
  let probe: ReturnType<typeof testModelServiceConnection> | undefined;
  let secondWorking: Promise<void> | undefined;
  try {
    const ask = { kind: 'ask' as const, question: '说明这个公开合成示例。', sources: [] };
    const disclosure = prepareGlobalAgentDisclosure(application.store, dialogues, application.policy, ask);
    startGlobalAgentTurn(application.store, dialogues, () => application.policy, ask, disclosure.sha256);
    await streamEntered.promise;
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 4, inFlight: 4, waiting: 0 });
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
    let preparation = application.store.createReviewRunPreparationWork(secondBook.bookId, ['typos-and-usage'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, application.policy);
    while (!preparation.done) preparation = application.store.advanceReviewRunPreparationWork(preparation.workId!);
    const secondRun = preparation.projection!.run!;
    application.store.authorizeReviewRun(secondBook.bookId, secondRun.reviewRunId, secondRun.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    secondWorking = driver!.drive(secondRun.reviewRunId); void secondWorking.catch(() => undefined);
    await secondQueued.promise;
    expect(application.owner.full).toBe(true);
    expect(requestGovernor.snapshot()).toMatchObject({ registered: 9, inFlight: 4, waiting: 5 });
    bodies[0]!.release(); await fastEntered.promise;
    expect(requestGovernor.snapshot().inFlight).toBe(4); expect(probeCalls).toBe(0);
    finishStream!(); await probeEntered.promise;
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
    fastBody.resolve({}); probeBody.resolve({}); finishStream?.();
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
  const working = productionReview(['typos-and-usage'], (_category, ordinal, prior) => ordinal === 1 && prior === 0 ? 'tools' : 'valid', undefined, false, false, held);
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

it('cancels every sent production sibling and keeps each unknown checkpoint without admitting another unit (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, held);
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
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
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
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', binding),
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
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ...held, ready: ready.resolve });
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
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', binding),
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
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, { ready: ready.resolve,
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
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', binding),
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
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'public-synthetic-placeholder' } });
    restarted.admitAndDispatch(runRecordId, kept, { resume: true }); await restarted.whenIdle();
    expect(result.requests.filter((request) => request.ordinal === knownOrdinal)).toHaveLength(1);
    expect(kept.currentRunState(runRecordId)).toMatch(/^completed/u);
  } finally { await restarted?.dispose(); reopened.close(); capacity.close(); await capacity.whenIdle(); }
});

it('refuses a malformed durable receipt before continuation can register or send a producer (#1131)', async () => {
  const held = heldReviewResponses(3);
  const working = productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, held);
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

it('counts a real reflection tool-call message once, with two physical admissions and aggregate usage once (#1131 rev8)', async () => {
  let reflections = 0;
  const result = await productionReview(['typos-and-usage'], () => 'valid', undefined, false, false, {
    response: async (response, _signal, body) => {
      const request = JSON.parse(body) as { model: string; messages: Array<{ role: string; content: string }> };
      if (!request.messages.findLast((entry) => entry.role === 'user')!.content.startsWith('运行反思 ')) return response;
      reflections += 1;
      if (request.messages.some((entry) => entry.role === 'tool')) return response;
      return new Response(JSON.stringify({ model: request.model, choices: [{ message: { content: null, reasoning_content: '合成反思工具回合。', tool_calls: [
        { id: 'reflection-search-1', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '的', mode: 'exact' }) } },
        { id: 'reflection-search-2', type: 'function', function: { name: 'search_manuscript', arguments: JSON.stringify({ query: '了', mode: 'exact' }) } },
      ] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
    },
  });
  const { runRecordId, ledger } = latestReviewExecution(result.store); expect(reflections).toBe(2);
  const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const rows = db.prepare(`SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND
      json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit' AND
      json_extract(canonical_json, '$.requestAdmission.data.event.request.stage') = 'run-report-reflection'`).all(runRecordId);
    expect(rows).toHaveLength(2);
    const requests = rows.map((row) => JSON.parse(String(row.canonical_json)).requestAdmission.data.event.request);
    expect(requests.map((request) => request.requestOrdinal)).toEqual([1, 2]);
    expect(new Set(requests.map((request) => request.producerId)).size).toBe(1);
    const outcome = JSON.parse(String(db.prepare('SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId)!.canonical_json));
    expect(outcome.report.usagePerStage['run-report-reflection']).toEqual({ requests: 2, inputTokens: 80, outputTokens: 40 });
  } finally { db.close(); }
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
