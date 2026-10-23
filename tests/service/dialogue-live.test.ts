import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, buildDialogueMessage } from '../../src/service/dialogue/contract.js';
import { DialogueExecutionOwner, dialogueLiveRoute, dialogueRouteRefusal, productionDialogueRoute, type DialogueLiveRoute } from '../../src/service/dialogue/dialogue-execution.js';
import {
  DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL,
  DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL,
  DIALOGUE_SCHEMA_SQL,
  DIALOGUE_TRIGGER_SQL,
} from '../../src/service/dialogue/dialogue-ledger.js';
import { admittedDialogueRoute } from '../../src/service/dialogue/dialogue-route.js';
import { SAMPLE1_SOURCE_DIGEST } from '../../src/service/analysis/baseline-analysis-store.js';
import { ADR_0091_PUBLIC_SAMPLEBOOKS } from '../../src/shared/public-samplebooks.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { HARNESS_SESSION_LOG_DIRECTORY } from '../../src/service/harness/session-log.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_SESSION_HEADER } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import { PROVIDER_LEDGER_FILE, ProviderResultCache, isItemLine, type ProviderCacheEntry, type ProviderLedgerLine } from '../../src/service/provider/provider-result-cache.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { MODEL_SERVICE_CONNECTION_REVISION_11_SQL } from '../../src/service/bounded-manuscript.js';
import { ANALYSIS_LEDGER_REVISION_59_SQL, LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { READERS_REPORT_SCHEMA_SQL } from '../../src/service/readers-reports.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL } from '../../src/service/captured-procedures.js';
import { EVALUATION_REWRITE_SCHEMA_SQL } from '../../src/service/evaluation-rewrites.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { DevelopmentValidationIntent, DialogueProjection, DialogueSelectionInput, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1, sample1Path } from '../support/sample1-baseline.js';
import { withLocalRetrievalFor } from '../support/policy-rules.js';

// Service-integration suite (L2) for the live editorial dialogue (Issue #52, plan slice S17c; ADR 0088; ADR 0089) over the
// real store, the real PrimaryAgentHarness composition, Egress Gate, Credential Broker, Provider Test Ledger and Result Cache,
// under the real selected developer-live policy (Provider Processing v10, Issue #831) and its dialogue allow rule. Only the
// transport is a stub, so no socket is opened and no credential value beyond a local placeholder exists. Hand-built rules
// serve only the refusals: the reading takes whatever the selected policy names.

const QUESTION = '这段的叙述视角是否一致？';
/** The synthetic answer the stub gives: the fixture's own words, quoting nothing of the Book. */
const ANSWER = '这段一直用第三人称限知视角叙述。人物的心理只写到主人公为止，没有越界。末句的语气可以改得更平缓些。';
const CONTINUED = '末句可以把语气放缓，与前文的节奏一致。';
const VALIDATION: DevelopmentValidationIntent = { family: 'editorial-dialogue', case: 'sample1-selected-paragraph', delta: null };

/** The selected policy's dialogue allow rule, as the verified projection lists it (Issue #831); varied for the refusals. */
function dialogueRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'developer-live-public-samplebook-editorial-dialogue',
    taskKinds: ['editorial-dialogue'],
    modelRole: 'Fast Interaction Role',
    route: 'opencode-go',
    endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint,
    model: OPENCODE_GO_MODEL,
    credentialSlot: OPENCODE_GO_ROUTE_PROFILE.credentialSlot,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: false,
    clarificationTimeoutHours: null,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    webSearchToolAllowed: false,
    platformTools: null,
    localTools: {
      targetedRetrieval: { allowed: true, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8, exactFetchRequiredBeforeCitation: true, scope: 'no-egress' },
      breaker: { roundTrips: 128, end: '检索未完成' },
    },
    sourceTranslationAllowed: false,
    ...overrides,
  };
}

const BASELINE_RULE = {
  ruleId: 'developer-live-public-samplebook-analysis',
  taskKinds: ['baseline-manuscript-analysis'],
  modelRole: 'Main Editorial Role',
  route: 'opencode-go',
  endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint,
  model: OPENCODE_GO_MODEL,
  credentialSlot: OPENCODE_GO_ROUTE_PROFILE.credentialSlot,
  outboundDataCategories: ['public-or-synthetic'],
  crossUnitSynthesisAllowed: false,
  materialReferencesAllowed: false,
  editorialDeliverablesAllowed: false,
};

function withRules(policy: LaunchPolicyProjection, rules: ReadonlyArray<unknown>): LaunchPolicyProjection {
  return { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: rules } as LaunchPolicyProjection['providerProcessing'] };
}

interface StubCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** A transport that answers every dialogue request with `answer`, recording each call; `hold` keeps a call open until aborted. */
function stubTransport(calls: StubCall[], answer: (body: string) => string, options: { hold?: boolean } = {}): typeof fetch {
  const transport = async (url: string, init: { headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    if (options.hold === true) {
      await new Promise<never>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({ start(controller) {
        const event = (value: unknown): void => { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`)); };
        for (const text of [...answer(init.body)]) event({ model: OPENCODE_GO_MODEL, choices: [{ index: 0, delta: { content: text } }] });
        event({ model: OPENCODE_GO_MODEL, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        event({ model: OPENCODE_GO_MODEL, choices: [], usage: { prompt_tokens: 210, completion_tokens: 48 } });
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } }),
      json: async () => ({
        model: OPENCODE_GO_MODEL,
        choices: [{ message: { content: answer(init.body), reasoning_content: '合成推理内容。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 210, completion_tokens: 48 },
      }),
    };
  };
  return transport as unknown as typeof fetch;
}

let roots: ServiceTestRoots;
let cacheRoot: string;
let livePolicy: LaunchPolicyProjection;
let opened: EditorialStore[];

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-dialogue-live-');
  await requireExactSample1(roots.codeRoot);
  cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-dialogue-cache-'));
  opened = [];
  const verified = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  expect(verified.integrityState).toBe('verified');
  livePolicy = verified;
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of opened) {
    try { store.close(); } catch { /* closed by its test */ }
  }
  await roots.dispose();
  await rm(cacheRoot, { recursive: true, force: true });
});

async function openStore(): Promise<EditorialStore> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  opened.push(store);
  return store;
}

function liveRoute(nativeFetch: typeof fetch, options: { validation?: DevelopmentValidationIntent | null; credential?: string | null; policy?: LaunchPolicyProjection } = {}): DialogueLiveRoute {
  const validation = options.validation === undefined ? VALIDATION : options.validation;
  const credential = options.credential === undefined ? 'placeholder-development-key' : options.credential;
  return dialogueLiveRoute(
    { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 }, providerCacheRoot: cacheRoot, validation }, nativeFetch },
    options.policy ?? livePolicy,
    { resolve: async () => credential },
  );
}

function liveOwner(store: EditorialStore, live: DialogueLiveRoute | null): DialogueExecutionOwner {
  return new DialogueExecutionOwner({ records: store, fixture: null, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live });
}

function selectionOf(store: EditorialStore, book: { manuscriptId: string; branchId: string }): DialogueSelectionInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 30)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 2,
    toGrapheme: 22,
    selectedText: graphemesOf(block.text).slice(2, 22).join(''),
  };
}

async function waitFor<T>(read: () => T, done: (value: T) => boolean, label: string): Promise<T> {
  const until = Date.now() + 10_000;
  for (;;) {
    const value = read();
    if (done(value)) return value;
    if (Date.now() > until) throw new Error(`timed out: ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

const settled = (projection: DialogueProjection): boolean => projection.attempts.at(-1)!.state !== 'answering';
const texts = (projection: DialogueProjection, attempt = projection.attempts.length - 1): string[] =>
  projection.attempts[attempt]!.fragments.map((fragment) => fragment.text);

async function ledgerLines(): Promise<ProviderLedgerLine[]> {
  const raw = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8').catch(() => '');
  return raw.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as ProviderLedgerLine).filter(isItemLine);
}

/** Ask on the Book through the owner, as the service entry does, and wait for the answer to settle. */
async function ask(store: EditorialStore, dialogues: DialogueExecutionOwner, bookId: string, selection: DialogueSelectionInput): Promise<{ dialogueId: string; projection: DialogueProjection }> {
  dialogues.requireReady(store.dialogueSourceDigest(bookId, selection));
  const turn = store.askAboutSelection(bookId, { selection, question: QUESTION });
  dialogues.begin(turn);
  const projection = await waitFor(() => store.inspectDialogue(bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)), settled, 'ask settled');
  return { dialogueId: turn.dialogueId, projection };
}

async function next(store: EditorialStore, dialogues: DialogueExecutionOwner, bookId: string, dialogueId: string, kind: 'continue' | 'regenerate'): Promise<DialogueProjection> {
  const latest = store.inspectDialogue(bookId, dialogueId, 0, () => null).attempts.at(-1)!;
  dialogues.requireReady(store.dialogueSourceDigest(bookId, { dialogueId }));
  const turn = store.nextDialogueAttempt(bookId, { dialogueId, attemptId: latest.attemptId }, kind);
  dialogues.begin(turn);
  return waitFor(() => store.inspectDialogue(bookId, dialogueId, 0, (id) => dialogues.liveText(id)), settled, `${kind} settled`);
}

function refusalCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError || (error instanceof Error && 'code' in error)) return (error as { code: string }).code;
    throw error;
  }
  return 'no-error';
}

describe('the admitted dialogue route, read from the selected policy', () => {
  it('carries retrieve and exact_fetch through the real /2 SSE adapter and live-once ledger without a socket', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '对话检索');
    const selection = selectionOf(store, book);
    const calls: StubCall[] = [];
    let candidateId = '';
    const nativeFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      const request = JSON.parse(init.body) as { stream: boolean; tools: Array<{ function: { name: string } }>; messages: Array<{ role: string; content: string }> };
      expect(request.stream).toBe(true);
      expect(request.tools.map((tool) => tool.function.name)).toEqual(['exact_fetch', 'retrieve']);
      // The selected v18 dialogue rule admits the local tools, so the digest-pinned /2 contract is the system message.
      expect(request.messages[0]).toEqual({ role: 'system', content: DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt });
      const turn = calls.length;
      if (turn === 2) {
        const result = JSON.parse(request.messages.at(-1)!.content) as Array<{ candidateId: string }>;
        candidateId = result[0]!.candidateId;
      }
      const name = turn === 1 ? 'retrieve' : 'exact_fetch';
      const args = JSON.stringify(turn === 1 ? { query: selection.selectedText, k: 1, sourceKinds: ['manuscript'] } : { candidateId });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        const event = (delta: unknown, finish_reason: string | null = null): void => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: OPENCODE_GO_MODEL, choices: [{ index: 0, delta, finish_reason }] })}\n\n`));
        };
        if (turn < 3) {
          event({ tool_calls: [{ index: 0, id: `retrieval-${turn}`, type: 'function', function: { name, arguments: '' } }] });
          for (const fragment of [...args]) event({ tool_calls: [{ index: 0, function: { arguments: fragment } }] });
          event({}, 'tool_calls');
        } else {
          event({ content: `已找到相关段落。[retrieval:${candidateId}]` });
          event({}, 'stop');
        }
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: OPENCODE_GO_MODEL, choices: [], usage: { prompt_tokens: 210, completion_tokens: 48 } })}\n\ndata: [DONE]\n\n`));
        controller.close();
      } }), { headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const dialogues = new DialogueExecutionOwner({ records: store, fixture: null,
      sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY),
      live: liveRoute(nativeFetch),
      retrievalIndex: (id) => store.dialogueRetrievalIndex(id) });
    try {
      dialogues.requireReady(store.dialogueSourceDigest(book.bookId, selection));
      const turn = store.askAboutSelection(book.bookId, { selection, question: '找到书中哪里有相似的描写？' });
      dialogues.begin(turn);
      const projection = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)), settled, 'retrieval SSE settled');
      expect(projection.attempts.at(-1)!.state).toBe('completed');
      expect(calls).toHaveLength(3);
      expect(projection.anchors).toHaveLength(1);
      expect(projection.anchors![0]!.candidateId).toBe(candidateId);
      const lines = await ledgerLines();
      expect(lines.filter((line) => line.outcome === 'transmitted')).toHaveLength(3);
      expect(lines.every((line) => line.requestShape === 'editorial-dialogue-sse')).toBe(true);
    } finally { await dialogues.dispose(); }
  });

  it('checks the frozen dialogue source after reimport, never a later admitted source in the same Book', async () => {
    const store = await openStore();
    const path = join(roots.inputRoot, 'composed-dialogue.docx');
    const bytes = await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '对话来源' });
    const composedDigest = sha256Hex(bytes);
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '对话来源' }, false);
    const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
      reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    const selection = selectionOf(store, book);
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const fixture = await loadModelFixture(join(roots.codeRoot, 'tests', 'fixtures', 'model'), 'sample1-dialogue');
    const local = new DialogueExecutionOwner({ records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null });
    const { dialogueId } = await ask(store, local, book.bookId, selection);
    await local.dispose();

    const replacement = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
    const work = store.createManuscriptReimportPreparationWork(replacement.draftId, replacement.draftVersion, {
      kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
    });
    let prepared = store.advanceManuscriptReimportPreparationWork(work.workId);
    while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(work.workId);
    let reimport = prepared.review!;
    while (reimport.comparison.unresolvedGroups > 0) {
      const group = store.getReimportMappingPage(reimport.draftId, reimport.draftVersion, null).items.find((item) => item.verb === null)!;
      const resolution = store.createReimportResolutionWork(reimport.draftId, reimport.draftVersion, group.groupId, group.verbs[0]!);
      let progress = store.advanceReimportResolutionWork(resolution.workId);
      while (!progress.done) progress = store.advanceReimportResolutionWork(resolution.workId);
      reimport = progress.review!;
    }
    const commit = await store.createManuscriptReimportCommitWork({ draftId: reimport.draftId, expectedDraftVersion: reimport.draftVersion,
      reviewDigest: reimport.reviewDigest, commitId: randomUUID() });
    let committed = commit.result;
    while (committed === null) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      committed = (await store.advanceManuscriptReimportCommitWork(commit.workId!)).result;
    }
    const calls: StubCall[] = [];
    const live = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER)));
    try {
      const frozenDigest = store.dialogueSourceDigest(book.bookId, { dialogueId });
      expect(frozenDigest).toBe(composedDigest);
      expect(store.dialogueSourceDigest(book.bookId, selectionOf(store, book))).toBe(SAMPLE1_SOURCE_DIGEST);
      expect(refusalCode(() => live.requireReady(frozenDigest))).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
      await expect(next(store, live, book.bookId, dialogueId, 'regenerate')).rejects.toMatchObject({ code: 'DIALOGUE_ROUTE_UNAVAILABLE' });
      expect(store.inspectDialogue(book.bookId, dialogueId, 0, () => null).attempts).toHaveLength(1);
      expect(calls).toHaveLength(0);
      expect(await ledgerLines()).toHaveLength(0);
    } finally {
      await live.dispose();
    }
  });

  it('takes exactly the one rule naming the dialogue and the selected excerpt, and nothing else', () => {
    // The selected policy names it exactly so, beside the baseline and review rules.
    expect(livePolicy.providerProcessing.admittedRules.filter((rule) => rule.taskKinds.includes('editorial-dialogue'))).toEqual([dialogueRule()]);
    const route = admittedDialogueRoute(livePolicy)!;
    expect(route).not.toBeNull();
    expect(route.ruleId).toBe('developer-live-public-samplebook-editorial-dialogue');
    expect(route.providerProcessingVersion).toBe(livePolicy.providerProcessing.version);
    expect(route.modelRole).toBe('Fast Interaction Role');
    expect(route.profile).toBe(OPENCODE_GO_ROUTE_PROFILE);
    expect(route.modelProfile.model).toBe(OPENCODE_GO_MODEL);
    expect([...route.outboundDataCategories]).toEqual(['editor-selected-manuscript-excerpt']);
    // A projection that lists no rules admits no live dialogue.
    const withoutList = { ...livePolicy.providerProcessing } as Record<string, unknown>;
    delete withoutList['admittedRules'];
    expect(admittedDialogueRoute({ ...livePolicy, providerProcessing: withoutList as LaunchPolicyProjection['providerProcessing'] })).toBeNull();
    for (const rules of [
      [BASELINE_RULE],
      [BASELINE_RULE, dialogueRule(), dialogueRule({ ruleId: 'second' })],
      [dialogueRule({ outboundDataCategories: ['public-or-synthetic'] })],
      [dialogueRule({ modelRole: 'Frontier Model Role' })],
      [dialogueRule({ endpoint: 'https://example.invalid/v1/chat/completions' })],
      [dialogueRule({ model: 'undeclared-model' })],
      [dialogueRule({ credentialSlot: 'deepseek-open-platform' })],
      [dialogueRule({ route: 'deepseek-open-platform' })],
      [dialogueRule({ ruleId: '' })],
    ]) {
      expect(admittedDialogueRoute(withRules(livePolicy, rules))).toBeNull();
    }
    expect(admittedDialogueRoute({ ...livePolicy, integrityState: 'denied' })).toBeNull();
    expect(admittedDialogueRoute({ ...livePolicy, operationalScope: 'development-ci' })).toBeNull();
  });

  it('refuses before anything is recorded when the policy admits no dialogue or the Book is not an admitted SampleBook', async () => {
    const calls: StubCall[] = [];
    const unadmitted = liveRoute(stubTransport(calls, () => ANSWER), { policy: withRules(livePolicy, [BASELINE_RULE]) });
    expect(dialogueRouteRefusal({ fixture: null, live: unadmitted }, SAMPLE1_SOURCE_DIGEST)).toMatch(/没有准许对话使用实时模型/u);
    const admitted = liveRoute(stubTransport(calls, () => ANSWER));
    expect(dialogueRouteRefusal({ fixture: null, live: admitted }, SAMPLE1_SOURCE_DIGEST)).toBeNull();
    // The four ADR 0091 Public SampleBooks are admitted exactly as sample1 is (Issue #990).
    for (const book of ADR_0091_PUBLIC_SAMPLEBOOKS) expect(dialogueRouteRefusal({ fixture: null, live: admitted }, book.sha256), book.path).toBeNull();
    expect(dialogueRouteRefusal({ fixture: null, live: admitted }, '0'.repeat(64))).toMatch(/公开样书范围/u);
    expect(dialogueRouteRefusal({ fixture: null, live: admitted }, null)).toMatch(/公开样书范围/u);
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时拒绝');
    expect(store.dialogueSourceDigest(book.bookId, selectionOf(store, book))).toBe(SAMPLE1_SOURCE_DIGEST);
    expect(refusalCode(() => liveOwner(store, unadmitted).requireReady(store.dialogueSourceDigest(book.bookId, selectionOf(store, book))))).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
    expect(refusalCode(() => liveOwner(store, admitted).requireReady('0'.repeat(64)))).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(database.prepare('SELECT count(*) total FROM dialogue_tasks').get()).toEqual({ total: 0 });
    } finally {
      database.close();
    }
    expect(calls).toHaveLength(0);
    expect(await ledgerLines()).toHaveLength(0);
  });
});

describe('就这段提问… on the live route (provider-free)', () => {
  it('production dialogue sends repeated input twice without opening a development cache, then uses the newly selected route', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '正式使用对话');
    const go = store.saveModelServiceConnection('Go', null, 'ready', 'opencode-go');
    const official = store.saveModelServiceConnection('官方', null, 'ready', 'deepseek-open-platform');
    let reference = go.credentialReference;
    let policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: reference });
    const calls: StubCall[] = [];
    const reads: string[] = [];
    const cacheOpen = vi.spyOn(ProviderResultCache.prototype, 'open');
    const dialogues = liveOwner(store, productionDialogueRoute({ scope: 'ordinary-production', nativeFetch: stubTransport(calls, () => ANSWER) },
      () => policy, () => reference, { resolve: async (ref) => { reads.push(ref); return 'placeholder-production-key'; } }));
    try {
      const first = await ask(store, dialogues, book.bookId, selectionOf(store, book));
      await next(store, dialogues, book.bookId, first.dialogueId, 'regenerate');
      expect(calls).toHaveLength(2);
      expect(calls[0]!.body === calls[1]!.body).toBe(true);
      expect(calls.every((call) => call.url === ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0].endpoint)).toBe(true);
      expect(reads.every((ref) => ref === go.credentialReference)).toBe(true);
      reference = official.credentialReference;
      policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[1], credentialReference: reference });
      const last = await next(store, dialogues, book.bookId, first.dialogueId, 'regenerate');
      expect(calls).toHaveLength(3);
      expect(calls[2]!.url).toBe(ORDINARY_PRODUCTION_ALLOWED_BINDINGS[1].endpoint);
      expect(reads.at(-1)).toBe(official.credentialReference);
      expect(JSON.stringify(last).includes('placeholder-production-key')).toBe(false);
      expect(cacheOpen).not.toHaveBeenCalled();
      expect(await ledgerLines()).toEqual([]);
    } finally {
      await dialogues.dispose();
    }
  });

  it('streams before completion, keeps only complete stopped fragments, continues live, and holds an aborted request across cache reopen', async () => {
    const calls: StubCall[] = [];
    const first = '完整的第一句。';
    const tail = '未完的第二';
    const completeTransport = stubTransport(calls, () => CONTINUED);
    const transport: typeof fetch = (async (url: string, init: { headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
      if (JSON.parse(init.body).messages[1].content.includes('接着回答')) return completeTransport(url, init);
      calls.push({ url, headers: init.headers, body: init.body });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        for (const text of [first, tail]) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: OPENCODE_GO_MODEL, choices: [{ index: 0, delta: { content: text } }] })}\n\n`));
        init.signal?.addEventListener('abort', () => controller.error(new DOMException('stopped', 'AbortError')), { once: true });
      } }), { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时停止与继续');
    const selection = selectionOf(store, book);
    const dialogues = liveOwner(store, liveRoute(transport));
    try {
      const turn = store.askAboutSelection(book.bookId, { selection, question: QUESTION });
      dialogues.begin(turn);
      const held = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)), (projection) => projection.attempts[0]!.fragmentTotal === 1, 'live fragment before finish');
      expect(held.attempts[0]!.state).toBe('answering');
      expect(texts(held)).toEqual([first]);
      await dialogues.stop(turn.attemptId);
      const stopped = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
      expect(stopped.attempts[0]!.state).toBe('stopped');
      expect(texts(stopped)).toEqual([first]);
      const continued = await next(store, dialogues, book.bookId, turn.dialogueId, 'continue');
      expect(continued.attempts[1]!.state).toBe('completed');
      expect(texts(continued)).toEqual([first, CONTINUED]);
      expect(calls).toHaveLength(2);
      expect(calls[1]!.body).toContain(first);
      expect(calls[1]!.body).not.toContain(tail);
      const entries: ProviderCacheEntry[] = await Promise.all((await readdir(join(cacheRoot, 'entries'))).filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(join(cacheRoot, 'entries', name), 'utf8')) as ProviderCacheEntry));
      expect(entries).toHaveLength(2);
      expect(entries.find((entry) => entry.streamedAnswer?.complete === false)).toMatchObject({ usage: null, streamedAnswer: { complete: false, chunks: [first, tail] } });
      expect(entries.find((entry) => entry.streamedAnswer?.complete === true)?.streamedAnswer?.chunks.join('')).toBe(CONTINUED);
      expect((await ledgerLines()).map((line) => [line.outcome, line.classification])).toEqual([['failed', 'outcome-unknown'], ['transmitted', undefined]]);
      const reopened = new ProviderResultCache(cacheRoot);
      await reopened.open();
      await expect(transmitOnce(reopened, async () => { throw new Error('duplicate send'); }, { purpose: 'editorial-dialogue', slice: 'S17c', promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST }, { intent: VALIDATION, step: 'editorial-dialogue/ask', requestShape: 'editorial-dialogue-sse' }, OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_MODEL, calls[0]!.url, { method: 'POST', ...calls[0]! })).rejects.toMatchObject({ code: 'PROVIDER_VALIDATION_OUTCOME_UNKNOWN' });
      expect(calls).toHaveLength(2);
    } finally { await dialogues.dispose(); }
  });
  it('keeps the whole-answer JSON request for an admitted model whose profile declares no streaming (Issue #833)', async () => {
    const calls: StubCall[] = [];
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '整段回答');
    const selection = selectionOf(store, book);
    const live = liveRoute(stubTransport(calls, () => ANSWER));
    const { streaming: _declared, ...capabilities } = live.route!.modelProfile.capabilities;
    const dialogues = liveOwner(store, { ...live, route: { ...live.route!, modelProfile: { ...live.route!.modelProfile, capabilities } } });
    try {
      const { projection } = await ask(store, dialogues, book.bookId, selection);
      expect(projection.attempts[0]!.state).toBe('completed');
      expect(texts(projection)).toEqual(['这段一直用第三人称限知视角叙述。', '人物的心理只写到主人公为止，没有越界。', '末句的语气可以改得更平缓些。']);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.body)).toMatchObject({ stream: false });
      expect(calls[0]!.body).not.toContain('stream_options');
      expect(calls[0]!.headers.accept).toBe('application/json');
      expect((await ledgerLines()).map((line) => [line.outcome, line.requestShape])).toEqual([['transmitted', 'openai-chat-completions']]);
    } finally { await dialogues.dispose(); }
  });
  it('sends the one bounded message once, shows the answer by complete fragment, records the binding and the ledger item', async () => {
    const calls: StubCall[] = [];
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时提问');
    const selection = selectionOf(store, book);
    // #893: the predecessor /1 contract on a live route whose rule admits no local tools stays byte-identical; selected v18
    // admits them, so this case states a rule without targeted retrieval (the /2 case below uses the selected rule).
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER), { policy: withLocalRetrievalFor(livePolicy, 'editorial-dialogue', false) }));
    try {
      const { dialogueId, projection } = await ask(store, dialogues, book.bookId, selection);
      expect(projection.attempts[0]!.state).toBe('completed');
      expect(texts(projection)).toEqual(['这段一直用第三人称限知视角叙述。', '人物的心理只写到主人公为止，没有越界。', '末句的语气可以改得更平缓些。']);
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toBe(OPENCODE_GO_ROUTE_PROFILE.endpoint);
      expect(call.headers[OPENCODE_GO_SESSION_HEADER]).toMatch(/^[0-9a-f-]{36}$/u);
      const body = JSON.parse(call.body) as { model: string; stream: boolean; tools?: unknown; messages: Array<{ role: string; content: string }> };
      expect(body.model).toBe(OPENCODE_GO_MODEL);
      expect(body.stream).toBe(true);
      expect(body.tools).toBeUndefined();
      // Exactly the frozen contract and the one message: the selected words and the question, nothing else of the Book.
      expect(sha256Hex(canonicalJson(body.messages))).toBe(sha256Hex(canonicalJson([
        { role: 'system', content: DIALOGUE_PROMPT_CONTRACT.systemPrompt },
        { role: 'user', content: buildDialogueMessage({ kind: 'ask', selection: selection.selectedText, question: QUESTION, kept: null }) },
      ])));
      const lines = await ledgerLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ itemId: 'S17c/editorial-dialogue/1', purpose: 'editorial-dialogue', outcome: 'transmitted', status: 200, model: OPENCODE_GO_MODEL });
      // A dialogue turn is its own task: the fixture generator proves its capture by the one contract named twice.
      expect(lines[0]!.taskPromptContractDigest).toBe(lines[0]!.promptContractDigest);
      expect(lines[0]!.validation).toMatchObject({ family: VALIDATION.family, case: VALIDATION.case, step: 'editorial-dialogue/ask', decision: 'first-capture' });
      // The ledger records identities and counts, never content.
      expect(JSON.stringify(lines).includes(selection.selectedText)).toBe(false);
      expect(JSON.stringify(lines)).not.toContain(QUESTION);
      // The attempt is bound to the rule that admitted it, with no fixture.
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const binding = database.prepare('SELECT route, model, operational_scope, fixture_sha256, provider_processing_version, policy_rule_id FROM dialogue_execution_bindings').all();
        expect(binding).toEqual([{
          route: 'opencode-go', model: OPENCODE_GO_MODEL, operational_scope: 'developer-live', fixture_sha256: null,
          provider_processing_version: livePolicy.providerProcessing.version, policy_rule_id: 'developer-live-public-samplebook-editorial-dialogue',
        }]);
      } finally {
        database.close();
      }
      // The answer has no Apply, export or publication authority: the manuscript is as it was, and nothing was applied.
      expect(projection.attempts[0]!.convertedMarkIds).toHaveLength(0);
      expect(sha256Hex(JSON.stringify(store.inspectDialogue(book.bookId, dialogueId, 0, () => null)))).toBe(sha256Hex(JSON.stringify(projection)));
    } finally {
      await dialogues.dispose();
    }
  });

  it('under development validation 重新回答 replays the identical request; as business it asks the model again, cache or not', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时重答');
    const selection = selectionOf(store, book);
    // Development validation: the ask is captured once; 重新回答 sends the very same request, which the cache replays.
    const devCalls: StubCall[] = [];
    let dialogues = liveOwner(store, liveRoute(stubTransport(devCalls, () => ANSWER)));
    let dialogueId: string;
    try {
      ({ dialogueId } = await ask(store, dialogues, book.bookId, selection));
      const again = await next(store, dialogues, book.bookId, dialogueId, 'regenerate');
      expect(again.attempts.map((attempt) => [attempt.kind, attempt.state])).toEqual([['ask', 'completed'], ['regenerate', 'completed']]);
      expect(texts(again, 1)).toEqual(texts(again, 0));
      expect(devCalls).toHaveLength(1);
      const lines = await ledgerLines();
      expect(lines.map((line) => [line.itemId, line.outcome, line.validation?.decision])).toEqual([
        ['S17c/editorial-dialogue/1', 'transmitted', 'first-capture'],
        ['S17c/editorial-dialogue/2', 'replayed', 'exact-replay'],
      ]);
      expect(lines[1]!.incurredUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
    } finally {
      await dialogues.dispose();
    }
    const before = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
    // Actual business: the same Book, selection and question, with the development cache entry right there. Every ask and
    // 重新回答 is a new model request; nothing reads or writes the development cache or ledger.
    const businessCalls: StubCall[] = [];
    dialogues = liveOwner(store, liveRoute(stubTransport(businessCalls, () => ANSWER), { validation: null }));
    try {
      const business = await ask(store, dialogues, book.bookId, selection);
      const again = await next(store, dialogues, book.bookId, business.dialogueId, 'regenerate');
      expect(again.attempts.map((attempt) => attempt.state)).toEqual(['completed', 'completed']);
      expect(businessCalls).toHaveLength(2);
      expect(sha256Hex(businessCalls[1]!.body)).toBe(sha256Hex(businessCalls[0]!.body));
      expect(sha256Hex(businessCalls[0]!.body)).toBe(sha256Hex(devCalls[0]!.body));
    } finally {
      await dialogues.dispose();
    }
    expect(await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8')).toBe(before);
  });

  it('停止回答 while the request is in flight keeps nothing, holds the possibly billed request, and 继续回答 needs kept fragments', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时停止');
    const calls: StubCall[] = [];
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER, { hold: true })));
    try {
      dialogues.requireReady(store.dialogueSourceDigest(book.bookId, selectionOf(store, book)));
      const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
      dialogues.begin(turn);
      await waitFor(() => calls.length, (count) => count === 1, 'request in flight');
      expect(store.inspectDialogue(book.bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)).attempts[0]!.state).toBe('answering');
      await dialogues.stop(turn.attemptId);
      const stopped = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
      expect(stopped.attempts[0]!.state).toBe('stopped');
      expect(stopped.attempts[0]!.fragments).toHaveLength(0);
      // Aborting does not prove the server billed nothing: the item stays held as unknown, never silently resent.
      const lines = await ledgerLines();
      expect(lines.map((line) => [line.outcome, line.classification])).toEqual([['failed', 'outcome-unknown']]);
      expect(refusalCode(() => store.nextDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }, 'continue')))
        .toBe('DIALOGUE_NOTHING_KEPT');
      const again = await next(store, dialogues, book.bookId, turn.dialogueId, 'regenerate');
      expect(again.attempts.at(-1)!.state).toBe('failed');
      expect(calls).toHaveLength(1);
    } finally {
      await dialogues.dispose();
    }
  });

  it.each(['stop', 'dispose'] as const)('%s during live setup never transmits and preserves the question for an explicit retry', async (action) => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '发送前停止');
    const calls: StubCall[] = [];
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER)));
    const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
    try {
      dialogues.begin(turn);
      if (action === 'stop') await dialogues.stop(turn.attemptId);
      else await dialogues.dispose();
      const projection = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
      expect(calls).toHaveLength(0);
      expect(await ledgerLines()).toHaveLength(0);
      expect(projection.attempts[0]!.state).toBe(action === 'stop' ? 'stopped' : 'interrupted');
      expect(projection.question).toBe(QUESTION);
      expect(projection.attempts[0]!.fragments).toHaveLength(0);
    } finally {
      await dialogues.dispose();
    }
  });

  it('继续回答 sends the complete fragments a stopped answer kept, as its own step', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时续答');
    const selection = selectionOf(store, book);
    // The stopped answer with kept fragments comes from the deterministic route, which can stop mid-answer; the live route
    // then goes on from exactly what it kept.
    const { DialogueExecutionOwner: Owner } = await import('../../src/service/dialogue/dialogue-execution.js');
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-dialogue');
    let streamed = 0;
    const local = new Owner({
      records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null,
      answerHold: async (count, interrupted) => {
        streamed = count;
        while (count >= 2 && !interrupted()) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      },
    });
    const turn = store.askAboutSelection(book.bookId, { selection, question: QUESTION });
    local.begin(turn);
    await waitFor(() => streamed, (count) => count >= 2, 'two deltas');
    await local.stop(turn.attemptId);
    await local.dispose();
    const stopped = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
    expect(stopped.attempts[0]!.state).toBe('stopped');
    const kept = texts(stopped, 0);
    expect(kept).toEqual(['这段一直用第三人称限知视角叙述。']);
    const calls: StubCall[] = [];
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => CONTINUED)));
    try {
      const continued = await next(store, dialogues, book.bookId, turn.dialogueId, 'continue');
      expect(continued.attempts.map((attempt) => [attempt.kind, attempt.state])).toEqual([['ask', 'stopped'], ['continue', 'completed']]);
      // A 继续回答 reads as what the stopped answer kept, then its own.
      expect(texts(continued, 1)).toEqual([...kept, '末句可以把语气放缓，与前文的节奏一致。']);
      const body = JSON.parse(calls[0]!.body) as { messages: Array<{ role: string; content: string }> };
      expect(sha256Hex(body.messages.at(-1)!.content)).toBe(sha256Hex(buildDialogueMessage({ kind: 'continue', selection: selection.selectedText, question: QUESTION, kept: kept.join('') })));
      const lines = await ledgerLines();
      expect(lines.map((line) => [line.itemId, line.outcome, line.validation?.step])).toEqual([
        ['S17c/editorial-dialogue/1', 'transmitted', 'editorial-dialogue/continue'],
      ]);
    } finally {
      await dialogues.dispose();
    }
  });

  it('fails an attempt whose credential is absent before anything is sent', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时无凭据');
    const calls: StubCall[] = [];
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER), { credential: null }));
    try {
      const { projection } = await ask(store, dialogues, book.bookId, selectionOf(store, book));
      expect(projection.attempts[0]!.state).toBe('failed');
      expect(projection.attempts[0]!.causeCode).toBe('DIALOGUE_CREDENTIAL_ABSENT');
      expect(calls).toHaveLength(0);
      expect(await ledgerLines()).toHaveLength(0);
    } finally {
      await dialogues.dispose();
    }
  });
});

describe('the recorded live answer (Issue #52, S17c fixture)', () => {
  it('replays the Go capture through the real dialogue path: one ask, one 重新回答, complete fragments, no authority', async () => {
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const recorded = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-dialogue-recorded-v41');
    const recordedEntry = [...recorded.entries.values()][0]!;
    expect(recorded.entries.size).toBe(1);
    const capture = recordedEntry.capture as unknown as Record<string, unknown>;
    expect(capture).toMatchObject({
      subject: 'dialogue', itemId: 'S17c/editorial-dialogue/5', route: 'opencode-go', model: OPENCODE_GO_MODEL,
      promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, validation: { family: 'editorial-dialogue', case: 'sample1-selected-paragraph', step: 'editorial-dialogue/ask' },
    });
    const answer = (recordedEntry.response as unknown as { chunks: string[] }).chunks.join('');
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实录回放');
    const local = new DialogueExecutionOwner({ records: store, fixture: recorded, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null, answerHold: null });
    try {
      const { dialogueId, projection } = await ask(store, local, book.bookId, selectionOf(store, book));
      expect(projection.attempts[0]!.state).toBe('completed');
      // The real answer, read by complete fragment: three sentences, nothing lost or broken.
      expect(projection.attempts[0]!.fragments.length).toBe(3);
      expect(texts(projection).join('')).toBe(answer.replace(/\s+/gu, ''));
      const again = await next(store, local, book.bookId, dialogueId, 'regenerate');
      expect(texts(again, 1)).toEqual(texts(again, 0));
      expect(again.attempts.map((attempt) => attempt.convertedMarkIds.length)).toEqual([0, 0]);
      expect(again.actions.convert).toBe(true);
    } finally {
      await local.dispose();
    }
  });
  it('loads the streamed continuation capture under its SSE namespace with the provenance #833 recorded (Issue #833)', async () => {
    // The admitted stream fixture is the completed live 继续回答 alone; the stopped ask before it is no fixture entry.
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const recorded = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-dialogue-recorded-v41-stream');
    expect(recorded.entries.size).toBe(1);
    const entry = [...recorded.entries.values()][0]!;
    expect(entry.capture as unknown as Record<string, unknown>).toMatchObject({
      subject: 'dialogue', itemId: 'S17c/editorial-dialogue/3', selectedItemId: 'S17c/editorial-dialogue/3', evidenceScope: 'namespaced',
      route: 'opencode-go', endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint, requestShape: 'editorial-dialogue-sse', model: OPENCODE_GO_MODEL,
      promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST,
      providerRequestDigest: 'c152a59c8cb396e055cef40703b70d59274fa3497507b6441d235a5ce22d22af',
      validation: { step: 'editorial-dialogue/continue' },
    });
    expect(entry.response).toMatchObject({ kind: 'answer-chunks', usage: { inputTokens: 363, outputTokens: 1544 } });
  });
});

describe('revision 71', () => {
  it.each([60, 70])('migrates schema %i with revision-60 bindings: every binding reads back under its own digest', async (version) => {
    const { DialogueExecutionOwner: Owner } = await import('../../src/service/dialogue/dialogue-execution.js');
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-dialogue');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const local = new Owner({ records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null, answerHold: null });
    const book = await importSample1Book(store, roots.codeRoot, '修订71');
    const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
    local.begin(turn);
    const before = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null), settled, 'answered');
    await local.dispose();
    store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let database = new DatabaseSync(path);
    let rows: unknown[];
    try {
      database.exec('PRAGMA foreign_keys = OFF');
      database.exec('BEGIN');
      database.exec('CREATE TEMP TABLE keep AS SELECT * FROM dialogue_execution_bindings');
      database.exec('DROP TABLE dialogue_execution_bindings');
      database.exec(DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL);
      database.exec(`INSERT INTO dialogue_execution_bindings(rowid, attempt_id, harness_session_id, route, model, operational_scope,
        behavior_composition_sha256, prompt_contract_sha256, fixture_sha256, bound_at, canonical_json, sha256)
        SELECT 42, attempt_id, harness_session_id, route, model, operational_scope,
        behavior_composition_sha256, prompt_contract_sha256, fixture_sha256, bound_at, canonical_json, sha256 FROM temp.keep`);
      rows = database.prepare('SELECT rowid, attempt_id, canonical_json, sha256 FROM dialogue_execution_bindings ORDER BY rowid').all();
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_update!);
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_delete!);
      execPre74Fixture(database, `PRAGMA user_version = ${version}`);
      database.exec('COMMIT');
      if (version === 60) {
        for (const schema of [EVALUATION_REWRITE_SCHEMA_SQL, CAPTURED_PROCEDURE_SCHEMA_SQL, READERS_REPORT_SCHEMA_SQL]) {
          for (const table of Object.keys(schema).reverse()) database.exec(`DROP TABLE ${table}`);
        }
        downgradeKindCoupledRelations(database, ANALYSIS_LEDGER_REVISION_59_SQL);
      }
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    opened.push(store);
    expect(sha256Hex(JSON.stringify(store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null)))).toBe(sha256Hex(JSON.stringify(before)));
    store.close();
    database = new DatabaseSync(path);
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      const sql = (database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'dialogue_execution_bindings'").get() as { sql: string }).sql;
      expect(sql.replace(/\s+/gu, ' ')).toBe(DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings.replace(/\s+/gu, ' '));
      expect(database.prepare('SELECT rowid, attempt_id, canonical_json, sha256 FROM dialogue_execution_bindings ORDER BY rowid').all()).toEqual(rows);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(database.prepare('SELECT provider_processing_version, policy_rule_id FROM dialogue_execution_bindings').all())
        .toEqual([{ provider_processing_version: null, policy_rule_id: null }]);
      expect(() => database.prepare('UPDATE dialogue_execution_bindings SET bound_at = bound_at').run()).toThrowError('DIALOGUE_LEDGER_IMMUTABLE');
      expect(() => database.prepare('DELETE FROM dialogue_execution_bindings').run()).toThrowError('DIALOGUE_LEDGER_IMMUTABLE');
    } finally {
      database.close();
    }
  });
});

describe('revision 72 (Issue #811)', () => {
  it('migrates a revision-71 store: dialogue bindings byte for byte, the official connection kept, and both production routes bindable', async () => {
    const { DialogueExecutionOwner: Owner } = await import('../../src/service/dialogue/dialogue-execution.js');
    const { loadModelFixture } = await import('../../src/service/provider/model-fixture.js');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-dialogue');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const local = new Owner({ records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null, answerHold: null });
    const book = await importSample1Book(store, roots.codeRoot, '修订72');
    const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
    local.begin(turn);
    const before = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null), settled, 'answered');
    await local.dispose();
    const officialReference = randomUUID();
    store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let database = new DatabaseSync(path);
    let rows: unknown[];
    const stamp = '2026-10-01T00:00:00.000Z';
    try {
      database.exec('PRAGMA foreign_keys = OFF');
      database.exec('BEGIN');
      // Revision 71's texts: the bindings as S17c widened them, and the one official v4-pro connection Issue #712 stored.
      database.exec('CREATE TEMP TABLE keep AS SELECT rowid AS keep_rowid, * FROM dialogue_execution_bindings');
      database.exec('DROP TABLE dialogue_execution_bindings');
      database.exec(DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL);
      database.exec(`INSERT INTO dialogue_execution_bindings(rowid, attempt_id, harness_session_id, route, model, operational_scope,
        behavior_composition_sha256, prompt_contract_sha256, fixture_sha256, bound_at, canonical_json, sha256, provider_processing_version, policy_rule_id)
        SELECT keep_rowid, attempt_id, harness_session_id, route, model, operational_scope, behavior_composition_sha256, prompt_contract_sha256,
        fixture_sha256, bound_at, canonical_json, sha256, provider_processing_version, policy_rule_id FROM temp.keep`);
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_update!);
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_delete!);
      rows = database.prepare('SELECT rowid, * FROM dialogue_execution_bindings ORDER BY rowid').all();
      database.exec('DROP TABLE model_service_connections');
      database.exec(MODEL_SERVICE_CONNECTION_REVISION_11_SQL);
      database.prepare(`INSERT INTO model_service_connections VALUES ('main-editorial-deepseek-v4-pro', 'main-editorial', '旧连接', 'deepseek-open-platform',
        'deepseek-v4-pro', 1, 1, '[]', 'deepseek-api-key', ?, 'ready', ?, ?, ?)`).run(officialReference, stamp, stamp, stamp);
      execPre74Fixture(database, 'PRAGMA user_version = 71');
      database.exec('COMMIT');
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    opened.push(store);
    expect(sha256Hex(JSON.stringify(store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null)))).toBe(sha256Hex(JSON.stringify(before)));
    // The official connection: its reference and state kept, the route's current model, and the route in use.
    expect(store.getModelServiceConnection()).toMatchObject({
      connectionId: 'main-editorial-deepseek-v4-pro', connectionName: '旧连接', credentialReference: officialReference, credentialOperationState: 'ready',
      selected: true, binding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-flash', credentialSlot: 'deepseek-api-key' },
    });
    // Both production routes are bindable now: a Go connection beside it, and a production dialogue attempt on either route.
    const go = store.saveModelServiceConnection('Go 连接', null, 'ready', 'opencode-go');
    expect(go).toMatchObject({ connectionId: 'main-editorial-opencode-go', selected: false, binding: { modelId: 'deepseek-v4.1-flash' } });
    expect(go.credentialReference).not.toBe(officialReference);
    for (const route of ['opencode-go', 'deepseek-open-platform'] as const) {
      const next = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
      store.bindDialogueAttempt(next.attemptId, {
        harnessSessionId: randomUUID(), route, model: route === 'opencode-go' ? 'deepseek-v4.1-flash' : 'deepseek-flash', operationalScope: 'ordinary-production',
        behaviorCompositionSha256: 'a'.repeat(64), promptContractSha256: DIALOGUE_PROMPT_CONTRACT_DIGEST, providerProcessingVersion: 'v13',
        policyRuleId: 'ordinary-production-editorial-dialogue', boundAt: new Date().toISOString(),
      });
    }
    // Developer-live stays on the Go route alone.
    const refused = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
    expect(() => store.bindDialogueAttempt(refused.attemptId, {
      harnessSessionId: randomUUID(), route: 'deepseek-open-platform', model: 'deepseek-flash', operationalScope: 'developer-live',
      behaviorCompositionSha256: 'a'.repeat(64), promptContractSha256: DIALOGUE_PROMPT_CONTRACT_DIGEST, providerProcessingVersion: 'v12',
      policyRuleId: 'developer-live-public-samplebook-editorial-dialogue', boundAt: new Date().toISOString(),
    })).toThrow();
    store.close();
    database = new DatabaseSync(path);
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      // Synchronized delta with #66 and #89: revisions 81 (imported Skill relations) and 83 (their updates) follow revision 80 (Task Intent Drafts).
      expect(LATEST_SCHEMA_VERSION).toBe(84);
      // Revision 8 accepts nullable selection: two NULL rows coexist, but a second 1 or any other integer is refused.
      expect(database.prepare('SELECT selected FROM model_service_connections ORDER BY connection_id').all()).toEqual([{ selected: 1 }, { selected: null }]);
      expect(() => database.exec("UPDATE model_service_connections SET selected = 1 WHERE provider_id = 'opencode-go'")).toThrow();
      expect(() => database.exec("UPDATE model_service_connections SET selected = 0 WHERE provider_id = 'opencode-go'")).toThrow();
      database.exec('BEGIN');
      database.exec('UPDATE model_service_connections SET selected = NULL');
      expect(database.prepare('SELECT count(*) total FROM model_service_connections WHERE selected IS NULL').get()?.total).toBe(2);
      database.exec('ROLLBACK');
      const sql = (database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'dialogue_execution_bindings'").get() as { sql: string }).sql;
      expect(sql.replace(/\s+/gu, ' ')).toBe(DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings.replace(/\s+/gu, ' '));
      expect(database.prepare('SELECT rowid, * FROM dialogue_execution_bindings ORDER BY rowid').all().slice(0, rows.length)).toEqual(rows);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(() => database.prepare('UPDATE dialogue_execution_bindings SET bound_at = bound_at').run()).toThrowError('DIALOGUE_LEDGER_IMMUTABLE');
    } finally {
      database.close();
    }
  });
});
