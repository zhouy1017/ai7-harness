import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, factualReviewRequestDigest } from '../../src/service/analysis/factual-review-contract.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD_DIGEST } from '../../src/service/analysis/factual-review-contract-v2.js';
import { CORRECTION_ASSURANCE_INCOMPLETE_LABEL, FACTUAL_REVIEW_TASK_GOAL, type EvidenceAssuranceLevel, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Issue #901 (wave 8, slice 8a): 事实核查's levels on the deterministic route J-04 drives, over the provider-free
// `sample1-factual-verified` fixture layered on `sample1-factual-authored`. 标准核查 replays contract /2; 快速整理 replays v1's own
// entries, byte for byte; neither fetches anything, so every relation the fixture states is a candidate. Exact sample1 (ADR 0043).

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-factual-verified-fixture-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

async function openVerified(): Promise<{ store: EditorialStore; owner: BaselineAnalysisExecutionOwner; driver: ReviewRunDriver; fixture: ResolvedModelFixture }> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-verified');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  return { store, owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, owner), fixture };
}

describe('the verified fixture on the deterministic route', () => {
  it('states only what the authored fixture states, plus relations and variants, keyed by the standard /2 contract', async () => {
    const verified = JSON.parse(readFileSync(resolve(FIXTURES_ROOT, 'sample1-factual-verified.json'), 'utf8')) as {
      basedOn: string; provenance: string; entries: Array<{ unitOrdinal: number; requestDigest: string; response: { text: string; usage: unknown } }>;
    };
    const authored = JSON.parse(readFileSync(resolve(FIXTURES_ROOT, 'sample1-factual-authored.json'), 'utf8')) as typeof verified;
    expect(verified).toMatchObject({ basedOn: 'sample1-factual-authored', provenance: 'authored' });
    // The manifest units of exact sample1, as a Task over it derives them, key both fixtures.
    await requireExactSample1(roots.codeRoot);
    const { store } = await openVerified();
    try {
      const book = await importSample1Book(store, roots.codeRoot, '夹具对照');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      recordMissingCredentialConnection(store, '夹具对照');
      let work = store.createFactualReviewPreparationWork(book.bookId, FACTUAL_REVIEW_TASK_GOAL, launchPolicy);
      while (!work.done) work = store.advanceFactualReviewPreparationWork(work.workId!);
      const units = work.projection!.coverageManifest!.units;
      expect(verified.entries).toHaveLength(units.length);
      for (const unit of units) {
        const v2 = verified.entries.find((entry) => entry.unitOrdinal === unit.ordinal)!;
        const v1 = authored.entries.find((entry) => entry.unitOrdinal === unit.ordinal && entry.requestDigest === factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest))!;
        expect(v2.requestDigest).toBe(factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD_DIGEST, unit.ordinal, unit.digest));
        expect(v2.response.usage).toEqual(v1.response.usage);
        const stated = JSON.parse(v2.response.text) as { assertions: Array<Record<string, unknown>>; corrections: unknown[] };
        const listed = JSON.parse(v1.response.text) as { assertions: Array<Record<string, unknown>> };
        expect(stated.assertions.map(({ evidenceRelations: _relations, ...assertion }) => assertion)).toEqual(listed.assertions);
        // Every source is a synthetic address under an example domain: nothing points at a real page.
        for (const assertion of stated.assertions) {
          for (const relation of assertion.evidenceRelations as Array<{ sourceRef: string }>) expect(new URL(relation.sourceRef).hostname.endsWith('.example.org') ||
            new URL(relation.sourceRef).hostname.endsWith('.example.com.cn') || new URL(relation.sourceRef).hostname.endsWith('.example.net')).toBe(true);
        }
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  for (const level of ['standard', 'quick'] as const satisfies ReadonlyArray<EvidenceAssuranceLevel>) {
    it(`runs 事实核查 at ${level} through the Review Run and records results without fetching anything`, async () => {
      await requireExactSample1(roots.codeRoot);
      const { store, owner, driver } = await openVerified();
      try {
        const book = await importSample1Book(store, roots.codeRoot, `夹具 ${level}`);
        await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
        recordMissingCredentialConnection(store, '夹具连接');
        let work = store.createReviewRunPreparationWork(book.bookId, ['factual-review'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, launchPolicy);
        while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
        const reviewRunId = work.projection!.run!.reviewRunId;
        const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId });
        expect(plan.edit.assurance?.options.map((option) => option.label)).toEqual(['快速整理', '标准核查', '严格核查']);
        if (level === 'quick') {
          store.editTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId, planEnvelopeDigest: plan.edit.planEnvelopeDigest!, removedSteps: [],
            disallowedAdaptations: [], evidenceAssuranceLevel: 'quick' });
          const edited = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: reviewRunId });
          expect(edited.edit.assurance?.level).toBe('quick');
          expect(edited.edit.lastEdit?.entries.map((entry) => [entry.label, entry.prior, entry.proposed])).toEqual([['证据保证级别', '标准核查', '快速整理']]);
        }
        const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
        store.authorizeReviewRun(book.bookId, reviewRunId, run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
        await driver.drive(reviewRunId);
        expect(store.inspectReviewWorkspace(book.bookId, reviewRunId).run!.state).toBe('settled');
        const report = store.inspectFactualReview(book.bookId).taskOutcome!.report!;
        // Every model step was answered by the fixture: no gap, the reflection included.
        expect(report.classification).toBe('completed');
        expect(report.ifRedone.state).toBe('closed');
        const lens = store.inspectFactualVerification({ bookId: book.bookId, reviewRunId, after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null });
        expect(lens.results.length).toBeGreaterThan(0);
        expect(lens.results.every((result) => result.level === level && result.states.referenceIntegrity === 'verified')).toBe(true);
        if (level === 'quick') {
          expect(lens.results.every((result) => result.states.factualVerification === '待核查')).toBe(true);
        } else {
          const sourced = lens.results.filter((result) => result.sourceCounts.candidates > 0);
          expect(sourced.length).toBeGreaterThan(0);
          expect(sourced.every((result) => result.states.factualVerification === '证据不足' && result.sourceCounts.checked === 0)).toBe(true);
          const first = sourced.find((result) => result.sourceCounts.candidates === 3)!;
          const workspace = store.inspectEvidenceWorkspace({ bookId: book.bookId, resultId: first.resultId, sourcesAfter: null });
          expect(workspace.sources.map((card) => [card.relation, card.checkState, card.excerpt])).toEqual([['支持', 'candidate', null], ['反驳', 'candidate', null], ['仅提供背景', 'candidate', null]]);
          const draft = store.prepareCorrectionProposal({ bookId: book.bookId, resultId: first.resultId });
          expect(draft).toMatchObject({ assuranceIncomplete: true, label: CORRECTION_ASSURANCE_INCOMPLETE_LABEL });
          expect(draft.variants).toHaveLength(2);
        }
        store.markCleanShutdown();
      } finally {
        await driver.dispose();
        await owner.dispose();
        store.close();
      }
    }, 300_000);
  }
});
