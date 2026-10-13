import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, buildDialogueMessage } from '../../src/service/dialogue/contract.js';
import { DialogueExecutionOwner, dialogueLiveRoute, dialogueRouteRefusal, type DialogueLiveRoute } from '../../src/service/dialogue/dialogue-execution.js';
import {
  DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL,
  DIALOGUE_SCHEMA_SQL,
  DIALOGUE_TRIGGER_SQL,
} from '../../src/service/dialogue/dialogue-ledger.js';
import { admittedDialogueRoute } from '../../src/service/dialogue/dialogue-route.js';
import { SAMPLE1_SOURCE_DIGEST } from '../../src/service/analysis/baseline-analysis-store.js';
import { HARNESS_SESSION_LOG_DIRECTORY } from '../../src/service/harness/session-log.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_SESSION_HEADER } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import { PROVIDER_LEDGER_FILE, isItemLine, type ProviderLedgerLine } from '../../src/service/provider/provider-result-cache.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { DevelopmentValidationIntent, DialogueProjection, DialogueSelectionInput, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';

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
    if (Date.now() > until) throw new Error(`timed out: ${label} ${JSON.stringify(value)}`);
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
  dialogues.requireReady(store.dialogueSourceDigest(bookId));
  const turn = store.askAboutSelection(bookId, { selection, question: QUESTION });
  dialogues.begin(turn);
  const projection = await waitFor(() => store.inspectDialogue(bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)), settled, 'ask settled');
  return { dialogueId: turn.dialogueId, projection };
}

async function next(store: EditorialStore, dialogues: DialogueExecutionOwner, bookId: string, dialogueId: string, kind: 'continue' | 'regenerate'): Promise<DialogueProjection> {
  const latest = store.inspectDialogue(bookId, dialogueId, 0, () => null).attempts.at(-1)!;
  dialogues.requireReady(store.dialogueSourceDigest(bookId));
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
    expect(dialogueRouteRefusal({ fixture: null, live: admitted }, '0'.repeat(64))).toMatch(/公开样书范围/u);
    expect(dialogueRouteRefusal({ fixture: null, live: admitted }, null)).toMatch(/公开样书范围/u);
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时拒绝');
    expect(store.dialogueSourceDigest(book.bookId)).toBe(SAMPLE1_SOURCE_DIGEST);
    expect(refusalCode(() => liveOwner(store, unadmitted).requireReady(store.dialogueSourceDigest(book.bookId)))).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
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
  it('sends the one bounded message once, shows the answer by complete fragment, records the binding and the ledger item', async () => {
    const calls: StubCall[] = [];
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '实时提问');
    const selection = selectionOf(store, book);
    const dialogues = liveOwner(store, liveRoute(stubTransport(calls, () => ANSWER)));
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
      expect(body.stream).toBe(false);
      expect(body.tools).toBeUndefined();
      // Exactly the frozen contract and the one message: the selected words and the question, nothing else of the Book.
      expect(body.messages).toEqual([
        { role: 'system', content: DIALOGUE_PROMPT_CONTRACT.systemPrompt },
        { role: 'user', content: buildDialogueMessage({ kind: 'ask', selection: selection.selectedText, question: QUESTION, kept: null }) },
      ]);
      const lines = await ledgerLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ itemId: 'S17c/editorial-dialogue/1', purpose: 'editorial-dialogue', outcome: 'transmitted', status: 200, model: OPENCODE_GO_MODEL });
      // A dialogue turn is its own task: the fixture generator proves its capture by the one contract named twice.
      expect(lines[0]!.taskPromptContractDigest).toBe(lines[0]!.promptContractDigest);
      expect(lines[0]!.validation).toMatchObject({ family: VALIDATION.family, case: VALIDATION.case, step: 'editorial-dialogue/ask', decision: 'first-capture' });
      // The ledger records identities and counts, never content.
      expect(JSON.stringify(lines)).not.toContain(selection.selectedText);
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
      expect(store.inspectDialogue(book.bookId, dialogueId, 0, () => null)).toEqual(projection);
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
      expect(businessCalls[1]!.body).toBe(businessCalls[0]!.body);
      expect(businessCalls[0]!.body).toBe(devCalls[0]!.body);
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
      dialogues.requireReady(store.dialogueSourceDigest(book.bookId));
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
      expect(body.messages.at(-1)!.content).toBe(buildDialogueMessage({ kind: 'continue', selection: selection.selectedText, question: QUESTION, kept: kept.join('') }));
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
});

describe('revision 71', () => {
  it('widens a revision-60 bindings relation in place: every binding reads back under its own digest', async () => {
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
      rows = database.prepare('SELECT attempt_id, canonical_json, sha256 FROM dialogue_execution_bindings ORDER BY rowid').all();
      database.exec('PRAGMA foreign_keys = OFF');
      database.exec('BEGIN');
      database.exec('CREATE TEMP TABLE keep AS SELECT * FROM dialogue_execution_bindings');
      database.exec('DROP TABLE dialogue_execution_bindings');
      database.exec(DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL);
      database.exec(`INSERT INTO dialogue_execution_bindings SELECT attempt_id, harness_session_id, route, model, operational_scope,
        behavior_composition_sha256, prompt_contract_sha256, fixture_sha256, bound_at, canonical_json, sha256 FROM temp.keep`);
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_update!);
      database.exec(DIALOGUE_TRIGGER_SQL.dialogue_execution_bindings_no_delete!);
      database.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION - 1}`);
      database.exec('COMMIT');
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    opened.push(store);
    expect(store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null)).toEqual(before);
    store.close();
    database = new DatabaseSync(path, { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      const sql = (database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'dialogue_execution_bindings'").get() as { sql: string }).sql;
      expect(sql.replace(/\s+/gu, ' ')).toBe(DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings.replace(/\s+/gu, ' '));
      expect(database.prepare('SELECT attempt_id, canonical_json, sha256 FROM dialogue_execution_bindings ORDER BY rowid').all()).toEqual(rows);
      expect(database.prepare('SELECT provider_processing_version, policy_rule_id FROM dialogue_execution_bindings').all())
        .toEqual([{ provider_processing_version: null, policy_rule_id: null }]);
      expect(() => database.prepare('UPDATE dialogue_execution_bindings SET bound_at = bound_at').run()).toThrowError();
    } finally {
      database.close();
    }
  });
});
