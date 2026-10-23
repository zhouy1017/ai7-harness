import { reviewFixtureContractVersion } from '../../../src/service/provider/model-fixture.js';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { EditorialStore } from '../../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING } from '../../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../../src/service/analysis/execution.js';
import type { ManifestBlockInput } from '../../../src/service/analysis/coverage-manifest.js';
import type { BaselineAnalysisStore } from '../../../src/service/analysis/baseline-analysis-store.js';
import { Ai7LocalDeterministicAdapter } from '../../../src/service/provider/local-deterministic-adapter.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../../src/service/provider/egress-gate.js';
import type { ResolvedModelFixture } from '../../../src/service/provider/model-fixture.js';
import { AI7_FAILURE_CODES } from '../../../src/service/provider/classification.js';
import type { MaterialGuardRefusal } from '../../../src/service/task-material-references.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../../src/shared/protected-secret-identity.js';
import type { LaunchPolicyProjection } from '../../../src/shared/protocol.js';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';
import { generateSyntheticManuscript } from '../synthetic-manuscripts.mjs';

/**
 * One case's disposable product: a temporary Agent Data Root, the real `EditorialStore`, an imported Book and the execution owner
 * bound the way the case's fixture was made. Two bindings exist, and neither has a socket, a credential or a Provider:
 *
 * - **deterministic** — the product's own `ai7-local-deterministic` route over an authored fixture, as J-04 and the L2 suites run it;
 * - **developer-live replay** — the developer-live owner (real Go adapter, egress gate, accounting and a ledger in the temporary
 *   root) whose transport is the product's deterministic adapter answering from a recorded fixture. That is how the existing
 *   `live-*` L2 suites replay captures, and it asks with the launch's contracts — including the clarification wrapper a v14 rule
 *   adds — which the deterministic route applies only to `sample1-model-clarification` fixtures.
 */

export interface CaseRoots {
  readonly dataRoot: string;
  readonly inputRoot: string;
  dispose(): Promise<void>;
}

export interface ImportedBook {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
}

export type CaseManuscript = { readonly source: 'sample1' } | { readonly source: 'synthetic'; readonly id: string };

export async function createCaseRoots(): Promise<CaseRoots> {
  const parent = await mkdtemp(join(await realpath(tmpdir()), 'ai7-editorial-case-'));
  const inputRoot = join(parent, 'input');
  await mkdir(inputRoot);
  return { dataRoot: join(parent, 'data'), inputRoot, dispose: () => rm(parent, { recursive: true, force: true, maxRetries: 5 }) };
}

export async function openStore(roots: CaseRoots, codeRoot: string, fixture: ResolvedModelFixture | null): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: fixture === null ? null : { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage, reviewContractVersion: reviewFixtureContractVersion(fixture) },
  });
}

/**
 * Import exact `sample1` as a new Book through the product's own import, pin the workspace profile at Revision 2 and record a Main
 * Editorial Role connection whose credential was never present, as `tests/support/sample1-baseline.ts` does.
 *
 * A synthetic manuscript is realized on that Book (Commander decision, 2026-10-15): every analysis kind reads only exact sample1's
 * lineage (ADR 0044), so the generated paragraphs are typed over blocks 1..n through the editor's own journal edits and every
 * later block is cleared — a tester's edits of sample1, carrying only the in-repo generator's synthetic prose. Such a Book runs on
 * the provider-free deterministic route only; nothing of it is transmitted or recorded.
 */
export async function importManuscript(store: EditorialStore, codeRoot: string, _roots: CaseRoots, manuscript: CaseManuscript, title: string): Promise<ImportedBook> {
  const path = join(codeRoot, 'SampleBooks', 'sample1.docx');
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const choice = staged.targetChoices.find((entry) => entry.kind === 'new-book');
  if (choice === undefined) throw new Error('EDITORIAL_CASE/import-choice-absent');
  const target = { kind: 'new-book', choiceId: choice.id as 'new-book' | 'new-book-distinct-intended-work', confirmedTitle: title } as const;
  let review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  if (review.reviewDigest === null) review = store.prepareNewBookReview(staged.draftId, review.draftVersion, target, true);
  if (review.reviewDigest === null) throw new Error('EDITORIAL_CASE/import-review-unformed');
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  await store.installEditorialWorkspaceProfile(commit.bookId);
  await store.enableEditorialWorkspaceProfile(commit.bookId);
  const reference = randomUUID();
  store.saveModelServiceConnection('编辑价值证据', reference, 'needs-attention');
  store.setModelServiceCredentialState(reference, 'missing');
  const book = { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId, revisionId: commit.revisionId };
  if (manuscript.source === 'synthetic') realizeSynthetic(store, book, generateSyntheticManuscript(manuscript.id).paragraphs.map((paragraph) => paragraph.text));
  return book;
}

/** The editor's bounded edits, at most 256 graphemes each: clear a block, then type its new words. */
function realizeSynthetic(store: EditorialStore, book: ImportedBook, paragraphs: ReadonlyArray<string>): void {
  const blocks = store.baselineAnalysisLedger.readWorkingBlocks(book.branchId);
  if (blocks.length < paragraphs.length) throw new Error('EDITORIAL_CASE/synthetic-too-long');
  for (const [index, block] of blocks.entries()) {
    const replace = (from: number, to: number, insertText: string): void => {
      const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: block.blockId });
      const current = window.blocks.find((candidate) => candidate.blockId === block.blockId)!;
      store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
        windowStartBlockId: window.blocks[0]!.blockId, expectedJournalSequence: window.journalSequence,
        blockId: block.blockId, baseBlockDigest: current.digest, fromGrapheme: from, toGrapheme: to, insertText });
    };
    let remaining = graphemesOf(block.text).length;
    while (remaining > 0) { const from = Math.max(0, remaining - 256); replace(from, remaining, ''); remaining = from; }
    const words = paragraphs[index];
    if (words !== undefined) replace(0, 0, words);
  }
}

/** The Book's blocks in order, as the analysis ledger reads them; block `n` is paragraph `n` of a case. */
export function workingBlocks(store: EditorialStore, book: ImportedBook): ReadonlyArray<ManifestBlockInput> {
  return store.baselineAnalysisLedger.readWorkingBlocks(book.branchId);
}

/** The deterministic route's owner: the product's fixture adapter, as `tests/service/review-runs.test.ts` binds it. */
export function deterministicOwner(store: EditorialStore, policy: LaunchPolicyProjection, fixture: ResolvedModelFixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture, secretResolver: { resolve: async () => null } });
}

const REPLAY_CODES = { QUOTA_EXCEEDED_CODE: 'QUOTA_EXCEEDED', INVALID_CREDENTIAL_CODE: 'INVALID_CREDENTIAL', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT_WINDOW_EXCEEDED' };

export interface ReplayTally {
  answered: number;
  unmatched: number;
  /** The task contracts of the captures that answered: a replay is faithful only when the Run froze the same ones. */
  readonly answeredContracts: Set<string>;
}

/**
 * The developer-live replay transport. Each request is handed to the product's deterministic adapter, one per fixture and task
 * contract the captures name (the adapter answers a captured entry only under the contract it was captured in), and the first
 * answer is returned in the route's JSON shape. An unmatched request answers HTTP 500, which the Run records as a gap; a
 * captured 结果待确认 answers a truncated body, which the Run records as outcome unknown.
 */
export function replayTransport(fixtures: ReadonlyArray<ResolvedModelFixture>, tally: ReplayTally): typeof fetch {
  const adapters = fixtures.flatMap((fixture) => [...new Set([...fixture.entries.values()].flatMap((entry) => entry.capture?.taskPromptContractDigest ?? []))]
    .map((digest) => ({ digest, adapter: new Ai7LocalDeterministicAdapter(fixture, digest, REPLAY_CODES) })));
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
    const messages = body.messages.map((message) => ({ role: message.role, content: [{ type: 'text', text: message.content }] }));
    for (const { digest, adapter } of adapters) {
      let text = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      let failure: { code: string } | null = null;
      const options = { provider: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, messages } as unknown as Parameters<Ai7LocalDeterministicAdapter['stream']>[0];
      for await (const chunk of adapter.stream(options) as AsyncIterable<StreamChunk>) {
        if (chunk.type === 'text-delta') text += chunk.text;
        else if (chunk.type === 'usage') usage = { inputTokens: chunk.usage.inputTokens ?? 0, outputTokens: chunk.usage.outputTokens ?? 0 };
        else if (chunk.type === 'finish' && chunk.reason.kind !== 'stop') failure = { code: 'failure' in chunk.reason && chunk.reason.failure !== undefined ? chunk.reason.failure.code : 'UNKNOWN' };
      }
      if (failure?.code === AI7_FAILURE_CODES.FIXTURE_MISMATCH) continue;
      if (failure?.code === AI7_FAILURE_CODES.OUTCOME_UNKNOWN) return new Response('{', { status: 200 });
      if (failure !== null) return new Response(JSON.stringify({ error: { message: 'replayed failure' } }), { status: failure.code === 'QUOTA_EXCEEDED' ? 429 : 500 });
      tally.answered += 1;
      tally.answeredContracts.add(digest);
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: text, reasoning_content: '回放。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens } }), { status: 200 });
    }
    tally.unmatched += 1;
    return new Response(JSON.stringify({ error: { message: 'fixture mismatch' } }), { status: 500 });
  }) as typeof fetch;
}

/** Bind the store to the developer-live launch and build the owner whose transport replays `fixtures`. */
export function developerLiveReplayOwner(
  store: EditorialStore,
  policy: LaunchPolicyProjection,
  fixtures: ReadonlyArray<ResolvedModelFixture>,
  roots: CaseRoots,
  caseId: string,
  tally: ReplayTally,
  materialGuard?: (runRecordId: string, ledger: BaselineAnalysisStore) => MaterialGuardRefusal | null,
): BaselineAnalysisExecutionOwner {
  const runBudgetCeiling = { kind: 'tokens' as const, maxTotalTokens: 5_000_000 };
  const launch = { operationalScope: 'developer-live' as const, policy, live: {
    route: DEVELOPER_LIVE_POLICY_BINDING.route, endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint, model: DEVELOPER_LIVE_POLICY_BINDING.model,
    credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling,
  } };
  // The service entry binds every ledger that keeps its own launch; the evaluation ledger is the other one (live-evaluation suite).
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.initialEvaluationLedger.bindLaunch(launch);
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    ...(materialGuard === undefined ? {} : { materialGuard }),
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'replay-ledger'),
      validation: { family: 'editorial-evidence-replay', case: caseId, delta: null } }, nativeFetch: replayTransport(fixtures, tally) },
  });
}
