import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE1_SOURCE_DIGEST } from '../../src/service/analysis/baseline-analysis-store.js';
import { ANALYSIS_LINEAGE_UNAVAILABLE_REASON } from '../../src/shared/public-samplebook-labels.js';
import { BaselineAnalysisExecutionOwner, DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS } from '../../src/service/analysis/execution.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import {
  ADR_0091_PUBLIC_SAMPLEBOOKS,
  PUBLIC_SAMPLEBOOKS,
  PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS,
  SAMPLE1_PUBLIC_SAMPLEBOOK,
  type PublicSampleBook,
} from '../../src/shared/public-samplebooks.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Issue #990: the four ADR 0091 Public SampleBooks pass the two gates exact sample1 passes — the analysis lineage check under
// development-ci and developer-live, and the developer-live transmittable set the execution owner checks before dispatch.
// Everything is real but the transport, a stub that records each call and refuses it; no socket is opened and no credential
// value beyond a local placeholder exists. Only counts, states and digests are asserted: no manuscript text is read here.
installNodeNetworkDenial();

let roots: ServiceTestRoots;
let cacheRoot: string;
let livePolicy: LaunchPolicyProjection;
let ciPolicy: LaunchPolicyProjection;
let opened: EditorialStore[] = [];

const CEILING = { kind: 'tokens', maxTotalTokens: 500_000 } as const;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-public-samplebooks-');
  cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-provider-cache-'));
  opened = [];
  livePolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  ciPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'development-ci');
  expect(livePolicy.integrityState).toBe('verified');
  expect(ciPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  for (const store of opened) {
    try {
      await store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  await roots.dispose();
  await rm(cacheRoot, { recursive: true, force: true });
});

vi.setConfig({ hookTimeout: 60_000 });

async function openStore(scope: 'development-ci' | 'developer-live'): Promise<EditorialStore> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  if (scope === 'developer-live') {
    store.baselineAnalysisLedger.bindLaunch({
      operationalScope: 'developer-live',
      policy: livePolicy,
      live: {
        route: DEVELOPER_LIVE_POLICY_BINDING.route,
        model: DEVELOPER_LIVE_POLICY_BINDING.model,
        endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
        credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
        credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
        runBudgetCeiling: CEILING,
      },
    });
  }
  opened.push(store);
  return store;
}

/** Import one file under `SampleBooks/` (or a composed input) as a new Book; the staged digest is returned with it. */
async function importBook(store: EditorialStore, path: string): Promise<{ bookId: string; sourceDigest: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const choice = staged.targetChoices.find((entry) => entry.kind === 'new-book');
  expect(choice).toBeDefined();
  const target = { kind: 'new-book', choiceId: choice!.id as 'new-book' | 'new-book-distinct-intended-work', confirmedTitle: '公开示例书' } as const;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  expect(review.reviewDigest).not.toBeNull();
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, sourceDigest: staged.source.sourceSha256 };
}

function samplePath(book: PublicSampleBook): string {
  return join(roots.codeRoot, 'SampleBooks', book.path);
}

function prepare(store: EditorialStore, bookId: string, policy: LaunchPolicyProjection): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

function refusal(action: () => unknown): { code: unknown; message: unknown } | 'no-throw' {
  try {
    action();
  } catch (error) {
    return { code: (error as { code?: unknown }).code, message: (error as { message?: unknown }).message };
  }
  return 'no-throw';
}

/** A transport that records each call and refuses it with a 400, so an admitted Run stops after reaching it. */
function refusingTransport(calls: string[]): typeof fetch {
  return (async (url: string) => {
    calls.push(url);
    return { status: 400, json: async () => ({ error: { message: 'synthetic refusal' } }) };
  }) as unknown as typeof fetch;
}

function executionOwner(store: EditorialStore, calls: string[], policy: LaunchPolicyProjection = livePolicy): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.baselineAnalysisLedger,
    launchPolicy: policy,
    fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: policy.operationalScope === 'developer-live' ? {
      launch: { runBudgetCeiling: CEILING, providerCacheRoot: cacheRoot, validation: { family: 'baseline-analysis', case: 'samplebook-admission', delta: null } },
      nativeFetch: refusingTransport(calls),
    } : null,
  });
}

describe('the Public SampleBooks one module owns (Issue #990)', () => {
  it('lists exactly the five committed files by their exact bytes and SHA-256, sample1 first and still named apart', async () => {
    expect(PUBLIC_SAMPLEBOOKS.map((book) => book.path)).toEqual([
      'sample1.docx', 'luxun-zhaohua-xishi.docx', 'luxun-nahan.docx', 'liue-laocan-youji.docx', 'wujingzi-rulin-waishi.docx',
    ]);
    expect(SAMPLE1_PUBLIC_SAMPLEBOOK.sha256).toBe(SAMPLE1_SOURCE_DIGEST);
    for (const book of PUBLIC_SAMPLEBOOKS) {
      const bytes = await readFile(samplePath(book));
      expect(bytes.length, book.path).toBe(book.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), book.path).toBe(book.sha256);
    }
    // The README's table of admitted files carries the same five rows.
    const readme = await readFile(join(roots.codeRoot, 'SampleBooks', 'README.md'), 'utf8');
    for (const book of PUBLIC_SAMPLEBOOKS) {
      expect(readme, book.path).toMatch(new RegExp(`\\| \`${book.path.replace('.', '\\.')}\` \\| [^|]+ \\| ${book.bytes} \\| \`${book.sha256}\` \\|`, 'u'));
    }
  });

  it('is the developer-live transmittable set, and nothing else is', () => {
    expect([...DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS]).toEqual(PUBLIC_SAMPLEBOOKS.map((book) => book.sha256));
    expect(DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS).toBe(PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS);
  });
});

describe('the ADR 0091 Public SampleBooks under the analysis lineage check (Issue #990)', { timeout: 180_000 }, () => {
  it.each(ADR_0091_PUBLIC_SAMPLEBOOKS.map((book) => [book.path, book] as const))(
    'prepares a baseline analysis of %s under development-ci and developer-live, as of exact sample1',
    async (_path, book) => {
      for (const scope of ['development-ci', 'developer-live'] as const) {
        const store = await openStore(scope);
        const { bookId, sourceDigest } = await importBook(store, samplePath(book));
        expect(sourceDigest).toBe(book.sha256);
        await pinEditorialWorkspaceProfileRevision2(store, bookId);
        recordMissingCredentialConnection(store, `${scope} 主编辑角色连接`);
        const prepared = prepare(store, bookId, scope === 'developer-live' ? livePolicy : ciPolicy);
        expect(prepared.planEnvelope?.digest, scope).toMatch(/^[0-9a-f]{64}$/u);
        expect(prepared.coverageManifest!.units.length, scope).toBeGreaterThan(0);
        await store.close();
        opened = opened.filter((candidate) => candidate !== store);
        await rm(roots.dataRoot, { recursive: true, force: true });
      }
    },
  );

  it('still refuses a Book composed from an admitted file under development-ci and developer-live, with the new refusal text', async () => {
    const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
    await composeManuscriptDocx(selectedPath, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '非公开示例书血缘' });
    for (const [scope, policy] of [['development-ci', ciPolicy], ['developer-live', livePolicy]] as const) {
      const store = await openStore(scope);
      const { bookId, sourceDigest } = await importBook(store, selectedPath);
      expect(PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS.has(sourceDigest)).toBe(false);
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, `${scope} 主编辑角色连接`);
      const calls: string[] = [];
      const execution = executionOwner(store, calls, policy);
      const dispatch = vi.spyOn(execution, 'admitAndDispatch');
      try {
        expect(refusal(() => {
          const prepared = prepare(store, bookId, policy);
          const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
          execution.admitAndDispatch(authorized.dispatchRunRecordId!);
        })).toEqual({ code: 'ANALYSIS_LINEAGE_UNAVAILABLE', message: ANALYSIS_LINEAGE_UNAVAILABLE_REASON });
        await execution.whenIdle();
        expect(dispatch).not.toHaveBeenCalled();
        expect(calls).toHaveLength(0);
        // Reading the Book's analysis meets the same early refusal.
        expect(refusal(() => store.inspectBaselineAnalysis(bookId))).toMatchObject({ code: 'ANALYSIS_LINEAGE_UNAVAILABLE' });
      } finally {
        dispatch.mockRestore();
        await execution.dispose();
      }
      await store.close();
      opened = opened.filter((candidate) => candidate !== store);
      await rm(roots.dataRoot, { recursive: true, force: true });
    }
  });
});

describe('the developer-live transmittable set before dispatch (Issue #990)', { timeout: 180_000 }, () => {
  it.each(ADR_0091_PUBLIC_SAMPLEBOOKS.map((book) => [book.path, book] as const))(
    'admits a Run over %s past the transmittable check to the stub transport', async (_path, book) => {
    const store = await openStore('developer-live');
    const { bookId } = await importBook(store, samplePath(book));
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'developer-live 主编辑角色连接');
    const prepared = prepare(store, bookId, livePolicy);
    const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    expect(store.baselineAnalysisLedger.loadExecutionPlan(authorized.dispatchRunRecordId!).sourceDigest).toBe(book.sha256);
    const calls: string[] = [];
    const execution = executionOwner(store, calls);
    try {
      // Admission itself does not throw EXECUTION_SOURCE_NOT_TRANSMITTABLE: the Run reaches the (refusing) transport.
      expect(refusal(() => execution.admitAndDispatch(authorized.dispatchRunRecordId!))).toBe('no-throw');
      await execution.whenIdle();
      expect(calls.length).toBeGreaterThan(0);
      expect(new Set(calls)).toEqual(new Set([DEVELOPER_LIVE_POLICY_BINDING.endpoint]));
    } finally {
      await execution.dispose();
    }
  });
});
