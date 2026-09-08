import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import {
  FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
  factualReviewRequestDigest,
  sliceGraphemes,
} from '../../src/service/analysis/factual-review-contract.js';
import { FACTUAL_REVIEW_SCHEMA_DIGEST, FACTUAL_REVIEW_REDUCER_DIGEST } from '../../src/service/analysis/kind-definition.js';
import type { SecretResolver } from '../../src/service/provider/credential-broker.js';
import {
  FACTUAL_RESEARCH_NOT_AUTHORIZED,
  FACTUAL_REVIEW_ASSURANCE_STATEMENT,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_EXPECTED_OUTCOME,
  FACTUAL_REVIEW_KIND,
  FACTUAL_REVIEW_TASK_GOAL,
  FACTUAL_UNCHECKED_STATE,
  FACTUAL_UNREVIEWED_VERDICT,
  type FactualReviewProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the factual review: the real store, the real pinned DSH
// composition, the AI7 local deterministic adapter over the authored fixture, and a fake secret
// resolver. The manuscript is exact `sample1` (ADR 0043); no Provider, socket, credential value, or
// Effect is involved, and the research capability fetches nothing under any scope.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let baselineFixture: ResolvedModelFixture;
let factualFixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-factual-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  baselineFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
  factualFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
  // The authored fixture says what it is: a human wrote its responses after reading the admitted
  // units they answer. The six recorded fixtures keep the default and do not move.
  expect(factualFixture.provenance).toBe('authored');
  expect(baselineFixture.provenance).toBe('recorded');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(route: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function fakeSecretResolver(): SecretResolver {
  return { resolve: async () => null };
}

type Row = Record<string, unknown>;

function analysisRows(table: string): Row[] {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];
  } finally {
    database.close();
  }
}

describe('factual review over the real store on exact sample1', () => {
  it('runs the authorized factual Run through the real path and reaches one immutable Result Set Revision', async () => {
    await requireExactSample1(roots.codeRoot);
    let bookId: string;
    let manuscriptId: string;
    let revisionId: string;

    // A settled baseline analysis first: the factual review must sit beside it, not over it.
    const baselineStore = await openWithRoute(baselineFixture);
    const baselineOwner = new BaselineAnalysisExecutionOwner({
      ledger: baselineStore.baselineAnalysisLedger, launchPolicy, fixture: baselineFixture, secretResolver: fakeSecretResolver(),
    });
    try {
      const imported = await importSample1Book(baselineStore, roots.codeRoot, 'L2 sample1 事实核查');
      bookId = imported.bookId;
      manuscriptId = imported.manuscriptId;
      revisionId = imported.revisionId;
      await pinEditorialWorkspaceProfileRevision2(baselineStore, bookId);
      recordMissingCredentialConnection(baselineStore, 'L2 主编辑连接');
      let progress = baselineStore.createBaselineAnalysisPreparationWork(bookId, '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', null, launchPolicy);
      while (!progress.done) progress = baselineStore.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const authorized = baselineStore.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      baselineOwner.admitAndDispatch(authorized.dispatchRunRecordId!);
      await baselineOwner.whenIdle();
      expect(baselineStore.inspectBaselineAnalysis(bookId).resultSetRevision!.ordinal).toBe(1);
      baselineStore.markCleanShutdown();
    } finally {
      await baselineOwner.dispose();
      baselineStore.close();
    }
    const baselineIntentsBefore = analysisRows('analysis_task_intents');
    const baselineSetsBefore = analysisRows('analysis_result_sets');
    const baselineRevisionsBefore = analysisRows('analysis_result_set_revisions');
    const baselineUnitsBefore = analysisRows('analysis_unit_results');

    // The factual Task: its own kind, its own contract, its own Result Set, on the same real path.
    const store = await openWithRoute(factualFixture);
    const owner = new BaselineAnalysisExecutionOwner({
      ledger: store.factualReviewLedger, launchPolicy, fixture: factualFixture, secretResolver: fakeSecretResolver(),
    });
    let settled: FactualReviewProjection;
    try {
      const available = store.inspectFactualReview(bookId);
      expect(available).toMatchObject({ kind: FACTUAL_REVIEW_KIND, contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION, state: 'available' });
      expect(available.updateControls).toBeNull();

      let progress = store.createFactualReviewPreparationWork(bookId, FACTUAL_REVIEW_TASK_GOAL, launchPolicy);
      while (!progress.done) progress = store.advanceFactualReviewPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      expect(prepared).toMatchObject({
        kind: FACTUAL_REVIEW_KIND,
        state: 'prepared',
        taskIntent: { goal: FACTUAL_REVIEW_TASK_GOAL, expectedOutcome: FACTUAL_REVIEW_EXPECTED_OUTCOME, mode: 'whole-manuscript', modeLabel: '全书事实核查' },
      });
      expect(prepared.executionPlan!.reducerStages).toEqual(['unit-validation', 'reference-integrity', 'finding-reduction']);
      expect(prepared.coverageManifest!.units).toHaveLength(SAMPLE1_UNITS);
      expect(prepared.planEnvelope!.promptContractDigest).toBe(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST);

      const authorized = store.authorizeFactualReview(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.dispatchRunRecordId).not.toBeNull();
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      await owner.whenIdle();
      settled = store.inspectFactualReview(bookId, (runRecordId) => owner.progressFor(runRecordId));

      expect(settled.state).toBe('settled');
      expect(settled.taskOutcome!.classification).toBe('completed');
      const revision = settled.resultSetRevision!;
      expect(revision).toMatchObject({ ordinal: 1, contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION });
      expect(revision.schemaDigest).toBe(FACTUAL_REVIEW_SCHEMA_DIGEST);
      expect(revision.reducerDigest).toBe(FACTUAL_REVIEW_REDUCER_DIGEST);
      expect(revision.adapterPin).toMatchObject({ route: 'ai7-local-deterministic', fixtureIdentity: 'sample1-factual-authored' });
      expect(revision.policyPin).toMatchObject({ operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissions: 0 });
      expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS, gapCount: 0 });
      expect(revision.gaps).toEqual([]);
      // Synchronized delta (#275): eight unit turns and one assurance sampling turn per anchor unit.
      // Every one of the eight units anchors at least one located finding, so the sample is eight turns.
      expect(revision.usage.requests).toBe(SAMPLE1_UNITS * 2);
      expect(revision.reducerClosure.stages.map((stage) => stage.stage)).toEqual([
        'unit-validation', 'reference-integrity', 'finding-reduction', 'assurance-sampling',
      ]);
      expect(revision.reducerClosure.state).toBe('closed');
      expect(revision.assurance.statement).toBe(FACTUAL_REVIEW_ASSURANCE_STATEMENT);

      // Issue #275: the sample closed over every located finding — twenty is under the default thirty —
      // drawn in one stratum, because exact sample1 is one structural section.
      expect(revision.assuranceSample).toMatchObject({
        state: 'closed',
        size: revision.findings.length,
        candidateCount: revision.findings.length,
        strata: [{ sectionOrdinal: 1, candidates: revision.findings.length, sampled: revision.findings.length }],
        reason: null,
      });
      expect(revision.assuranceSample.seed).toMatch(DIGEST_PATTERN);
      expect(revision.assuranceSample.dispositions.map((entry) => entry.ref)).toEqual(revision.findings.map((finding) => finding.findingId));
      expect(revision.assuranceSample.dispositions.every((entry) => entry.disposition === '成立' && entry.reason.length > 0)).toBe(true);
      // Every disposition names a finding the revision holds, at that finding's own unit and tier.
      for (const entry of revision.assuranceSample.dispositions) {
        const finding = revision.findings.find((candidate) => candidate.findingId === entry.ref)!;
        expect({ unitOrdinal: entry.unitOrdinal, tier: entry.tier }).toEqual({ unitOrdinal: finding.unitOrdinal, tier: finding.severity });
      }
      expect(revision.assuranceSample.precision.map((entry) => entry.tier)).toEqual(['A', 'B', 'C']);
      expect(revision.assuranceSample.precision.every((entry) => entry.upheld === entry.sampled && entry.estimate === 1)).toBe(true);
      expect(revision.assurance.sampledPrecision).toEqual({ size: revision.findings.length, upheld: revision.findings.length, estimate: 1 });
      expect(revision.assurance.label).toContain(`· 抽样 ${revision.findings.length} 条 · 估计精度 1.00`);

      // Every finding is anchored by the service, not by the model: its range slices the committed
      // block back to the exact quotation it claims.
      const blocks = new Map(store.factualReviewLedger.readRevisionBlocks(manuscriptId, revisionId).map((block) => [block.blockId, block] as const));
      expect(revision.findings.length).toBeGreaterThan(0);
      for (const finding of revision.findings) {
        expect(finding.states.referenceIntegrity).toBe('verified');
        expect(finding.verdict).toBe(FACTUAL_UNREVIEWED_VERDICT);
        expect(finding.states.claimSupport).toBe(FACTUAL_UNCHECKED_STATE);
        expect(finding.states.factualVerification).toBe(FACTUAL_UNCHECKED_STATE);
        expect(finding.evidence).toEqual([]);
        expect(finding.research).toEqual({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, budget: null });
        expect(finding.findingId).toMatch(/^fnd_[0-9a-f]{24}$/);
        expect(['real-world-fact', 'quotation']).toContain(finding.assertionClass);
        const block = blocks.get(finding.blockId)!;
        expect(block, `finding ${finding.findingId} names a block of this revision`).toBeDefined();
        expect(sliceGraphemes(block.text, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme)).toBe(finding.quote);
        expect(finding.sourceRange.blockId).toBe(finding.blockId);
      }
      // Nothing the model listed was dropped: what did not become a finding was counted, and the one
      // quotation cited twice across the unit overlap merged into a single record.
      expect(revision.excluded).toEqual([]);
      const totalOf = (rows: ReadonlyArray<{ count: number }>): number => rows.reduce((total, row) => total + row.count, 0);
      expect(revision.assertionCounts.listed).toBe(totalOf(revision.assertionCounts.byClass));
      expect(revision.assertionCounts.listed).toBe(totalOf(revision.assertionCounts.byCategory));
      expect(revision.assertionCounts.listed).toBe(totalOf(revision.assertionCounts.bySeverity));
      // Only the two finding classes are promoted; the rest are counted and stay counted.
      const classCount = (assertionClass: string): number =>
        revision.assertionCounts.byClass.find((row) => row.assertionClass === assertionClass)!.count;
      expect(classCount('real-world-fact') + classCount('quotation')).toBe(revision.findings.length + revision.assertionCounts.merged);
      expect(classCount('report-about-manuscript') + classCount('fictional-canon') + classCount('judgment')).toBeGreaterThan(0);
      expect(revision.assertionCounts.verified).toBe(revision.findings.length + revision.assertionCounts.merged);
      expect(revision.assertionCounts.merged).toBe(1);
      expect(revision.findings.filter((finding) => finding.mergedFrom.length > 0)).toHaveLength(1);
      expect(revision.research).toMatchObject({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, fetched: 0 });

      // Every unit of the manifest closed under this kind's contract, keyed by this kind's digest.
      expect(revision.units).toHaveLength(SAMPLE1_UNITS);
      for (const unit of revision.units) {
        expect(unit.state).toBe('closed');
        const manifestUnit = prepared.coverageManifest!.units[unit.unitOrdinal - 1]!;
        expect(unit.requestDigest).toBe(factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, unit.unitOrdinal, manifestUnit.digest));
        expect(unit.state === 'closed' && DIGEST_PATTERN.test(unit.responseDigest)).toBe(true);
      }
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }

    // The baseline sibling on the same Book is untouched: same rows, same digests, one Result Set each.
    expect(analysisRows('analysis_result_sets')).toHaveLength(2);
    expect(analysisRows('analysis_result_sets').slice(0, 1)).toEqual(baselineSetsBefore);
    expect(analysisRows('analysis_result_set_revisions').slice(0, 1)).toEqual(baselineRevisionsBefore);
    expect(analysisRows('analysis_task_intents').slice(0, 1)).toEqual(baselineIntentsBefore);
    expect(analysisRows('analysis_unit_results').slice(0, baselineUnitsBefore.length)).toEqual(baselineUnitsBefore);

    // Both kinds project side by side after a restart, each reading only its own Task and revision.
    const reopened = await openWithRoute(factualFixture);
    try {
      const baseline = reopened.inspectBaselineAnalysis(bookId);
      expect(baseline).toMatchObject({ kind: 'baseline-manuscript-analysis', state: 'settled', taskIntent: { mode: 'first-baseline' } });
      expect(baseline.resultSetRevision!.digest).toBe(baselineRevisionsBefore[0]!['sha256']);
      const factual = reopened.inspectFactualReview(bookId);
      expect(factual).toMatchObject({ kind: FACTUAL_REVIEW_KIND, state: 'settled', taskIntent: { mode: 'whole-manuscript' } });
      expect(factual.resultSetRevision!.digest).toBe(settled.resultSetRevision!.digest);
      expect(factual.history).toMatchObject({ kind: FACTUAL_REVIEW_KIND, latestOrdinal: 1 });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
